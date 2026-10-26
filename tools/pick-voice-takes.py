#!/usr/bin/env python3
"""Choose the clearest take of every line in tools/voice-lines-ww2.json (the WW2 German crew voices).

For each line it synthesizes several takes with Piper (length_scale at the speaker's own, x1.06 and x1.15;
noise_scale at the voice's default and a livelier one), transcribes each with faster-whisper, scores the
transcript against the subtitle text, keeps the best take as a WAV in --takes and writes the winning settings and
the score back into the line table; tools/make-voices.py then encodes those takes. A line still below 0.85 is
listed as WEAK: reword it (short lines need context), do not just add takes.

The MLS voice (de_DE-mls-medium) babbles on sentences shorter than about 50 characters (every speaker; its own
long samples are fine). Its short lines are therefore said at the end of a longer lead-in ("pre", from the
table's "pres") and cut out at the pause before the line, found with Whisper's word timestamps; the cut is then
scored alone. Thorsten (de_DE-thorsten_emotional-medium) needs no lead-in.

    D=<scratch>; pip install --target $D/pylib piper-tts soundfile numpy faster-whisper
    # voices from https://huggingface.co/rhasspy/piper-voices (de/de_DE/...): the .onnx and .onnx.json into $D/models
    PYTHONPATH=$D/pylib python3 tools/pick-voice-takes.py --models $D/models --takes $D/takes [--only id,id]
        [--speaker vb] [--weak] [--missing] [--shard 0/3 --lines copy.json] [--audition gf:9,97,203]

--audition SPEAKER:sid,sid,... scores that speaker's lines (or --only) with each candidate MLS speaker id and writes
nothing: how the speakers were cast (docs/VOICES.md). See docs/VOICES.md for the whole recipe.
"""
import argparse
import difflib
import io
import json
import pathlib
import re
import wave

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / 'tools' / 'voice-lines-ww2.json'
MLS_MIN = 52  # characters: an MLS sentence shorter than this gets its speaker's lead-in

# ---------------------------------------------------------------- comparing German text

ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
        'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']
ORD = {1: 'erstes', 2: 'zweites', 3: 'drittes', 4: 'viertes', 5: 'fünftes', 6: 'sechstes'}


def words(n):
    """A number in German words, ranges as artillerymen say them (1200: zwölfhundert)."""
    if n < 20:
        return ONES[n]
    if n < 100:
        o, t = n % 10, n // 10
        return (('ein' if o == 1 else ONES[o]) + 'und' if o else '') + TENS[t]
    if n < 1000:
        h, r = divmod(n, 100)
        return ('ein' if h == 1 else ONES[h]) + 'hundert' + (words(r) if r else '')
    if 1100 <= n < 2000:
        h, r = divmod(n, 100)
        return ONES[h] + 'hundert' + (words(r) if r else '')
    th, r = divmod(n, 1000)
    return ('ein' if th == 1 else words(th)) + 'tausend' + (words(r) if r else '')


def norm(text):
    """Lower case, ß as ss, numbers in digits spelled out, 'zwo' as 'zwei', letters and spaces only."""
    t = text.lower().replace('́', '').replace('ß', 'ss')
    t = re.sub(r'(\d)[.,](\d{3})', r'\1\2', t)
    t = re.sub(r'\b([1-6])\.\s+(?=[a-zäöü])', lambda m: ORD[int(m.group(1))] + ' ', t)
    t = re.sub(r'\d+', lambda m: ' ' + words(int(m.group(0))) + ' ', t)
    t = re.sub(r'\bzwo', 'zwei', t)
    t = t.replace('einhundert', 'hundert').replace('eintausend', 'tausend').replace('ß', 'ss')
    t = ''.join(ch if ch.isalpha() or ch == ' ' else ' ' for ch in t)
    return ' '.join(t.split())


def score(heard, text):
    return difflib.SequenceMatcher(None, norm(heard), norm(text)).ratio()

# ---------------------------------------------------------------- the line table


def load_spec(path=LINES):
    return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))


def save_spec(spec, path=LINES):
    # one line per entry: some 500 lines stay readable and diffable
    out = ['{']
    keys = [k for k in spec if k != 'lines']
    for k in keys:
        out.append(f'  {json.dumps(k)}: {json.dumps(spec[k], ensure_ascii=False, indent=None)},')
    out.append('  "lines": [')
    out.append(',\n'.join('    ' + json.dumps(line, ensure_ascii=False) for line in spec['lines']))
    out.append('  ]')
    out.append('}')
    pathlib.Path(path).write_text('\n'.join(out) + '\n', encoding='utf-8')


def say_of(line):
    return line.get('say', line['de'])


def pre_of(spec, line):
    """The lead-in the line is said after (and cut from), or None."""
    sp = spec['speakers'][line['speaker']]
    if 'mls' not in sp['voice'] or line.get('pre') is False:
        return None
    name = line.get('pre') or (sp.get('pre') if len(say_of(line)) < MLS_MIN else None)
    return spec['pres'][name] if name else None

# ---------------------------------------------------------------- synthesis


class Voices:
    def __init__(self, models, threads=0):
        self.models = pathlib.Path(models)
        self.threads = threads
        self.cache = {}

    def get(self, name):
        if name not in self.cache:
            from piper import PiperVoice
            v = PiperVoice.load(str(self.models / f'{name}.onnx'))
            if self.threads:
                # a few threads, not spinning: several runs side by side otherwise starve each other
                import onnxruntime
                so = onnxruntime.SessionOptions()
                so.intra_op_num_threads = self.threads
                so.inter_op_num_threads = 1
                so.add_session_config_entry('session.intra_op.allow_spinning', '0')
                v.session = onnxruntime.InferenceSession(str(self.models / f'{name}.onnx'), sess_options=so, providers=['CPUExecutionProvider'])
            self.cache[name] = v
        return self.cache[name]


def synth(voice, text, sid=None, length_scale=None, noise_scale=None):
    from piper import SynthesisConfig
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(speaker_id=sid, length_scale=length_scale, noise_scale=noise_scale))
    buf.seek(0)
    audio, rate = sf.read(buf, dtype='float32')
    return audio, rate


def to16k(audio, rate):
    # Whisper wants 16 kHz; resampling here avoids faster-whisper's own decoder (PyAV version clashes)
    t = np.arange(0, len(audio) / rate, 1 / 16000)
    return np.interp(t, np.arange(len(audio)) / rate, audio).astype(np.float32)


def transcribe(asr, audio, rate, timestamps=False):
    # (the pass that only finds where a line starts can be greedy; the scoring pass searches)
    segments, _ = asr.transcribe(to16k(audio, rate), language='de', beam_size=1 if timestamps else 5, word_timestamps=timestamps, condition_on_previous_text=False)
    segments = list(segments)
    if timestamps:
        return [w for s in segments for w in s.words]
    return ' '.join(s.text.strip() for s in segments)


def cut_line(asr, audio, rate, text):
    """Cut the line `text` off the end of a take that began with a lead-in: at the quietest 20 ms around the start of
    its first word (Whisper's word timestamps, matched by text from the end). Returns (clip, cut seconds) or None."""
    ws = transcribe(asr, audio, rate, timestamps=True)
    n = len(norm(text).split())
    if len(ws) < 2:
        return None
    best, bi = -1, None
    for i in range(max(1, len(ws) - n - 3), len(ws)):
        s = difflib.SequenceMatcher(None, norm(''.join(w.word for w in ws[i:])), norm(text)).ratio()
        if s > best + 1e-6:
            best, bi = s, i
    if bi is None:
        return None
    t1, t2 = ws[bi - 1].end, ws[bi].start
    lo, hi = int((min(t1, t2) - 0.03) * rate), int((t2 + 0.03) * rate)
    hop, step = int(0.02 * rate), int(0.004 * rate)
    q, at = 1e9, max(0, lo)
    for j in range(max(0, lo), max(lo + 1, min(len(audio), hi) - hop), step):
        e = float(np.abs(audio[j:j + hop]).mean())
        if e < q:
            q, at = e, j
    cut = at + hop // 2
    clip = audio[cut:].copy()
    f = int(0.006 * rate)
    clip[:f] *= np.linspace(0, 1, f, dtype=np.float32)
    return clip, cut / rate


def tidy(audio, rate):
    """Trim silence (threshold 0.02, keep 40 ms either side), remove DC, peak-normalise to -1 dBFS."""
    level = np.abs(audio)
    voiced = np.where(level > 0.02)[0]
    if len(voiced):
        pad = int(0.04 * rate)
        audio = audio[max(0, voiced[0] - pad):min(len(audio), voiced[-1] + pad)]
    audio = audio - audio.mean()
    peak = np.abs(audio).max() or 1.0
    return (audio / peak * 0.89).astype(np.float32)


def render(spec, voices, asr, line, length_scale=None, noise_scale=None):
    """One take of a line: (tidy audio, rate) or None when the lead-in could not be cut off."""
    sp = spec['speakers'][line['speaker']]
    voice = voices.get(sp['voice'])
    pre = pre_of(spec, line)
    text = say_of(line)
    audio, rate = synth(voice, f'{pre} {text}' if pre else text, sp.get('sid'), length_scale, noise_scale)
    if pre:
        got = cut_line(asr, audio, rate, line['de'])
        if not got:
            return None
        audio = got[0]
    return tidy(audio, rate), rate


def settings(spec, line, more=False):
    sp = spec['speakers'][line['speaker']]
    base = sp.get('length_scale', 1.0)
    lively = 0.5 if 'mls' in sp['voice'] else 0.4
    for ls in [base, round(base * 1.06, 3), round(base * 1.15, 3)] + ([round(base * 0.94, 3), round(base * 1.25, 3)] if more else []):
        for ns in [sp.get('noise_scale'), lively] + ([0.25, 0.7] if more else []):
            yield ls, ns


def pick(spec, voices, asr, line, takes=None, early=0.97, more=False):
    best = None
    for ls, ns in settings(spec, line, more):
        got = render(spec, voices, asr, line, ls, ns)
        if not got:
            continue
        audio, rate = got
        heard = transcribe(asr, audio, rate)
        s = score(heard, line['de'])
        if not best or s > best[0] + 0.02:
            best = (s, ls, ns, heard, audio, rate)
        if s >= early:
            break
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='.', help='directory holding the .onnx and .onnx.json voices')
    ap.add_argument('--takes', default='', help='directory for the chosen takes (WAV), read by make-voices.py')
    ap.add_argument('--lines', default=str(LINES))
    ap.add_argument('--only', default='', help='comma-separated line ids')
    ap.add_argument('--speaker', default='', help='only this speaker\'s lines')
    ap.add_argument('--weak', action='store_true', help='only lines scored below 0.85')
    ap.add_argument('--missing', action='store_true', help='only lines without a score')
    ap.add_argument('--audition', default='', help='SPEAKER:sid,sid,... compare MLS speaker ids (writes nothing)')
    ap.add_argument('--shard', default='', help='i/n: only every n-th wanted line from the i-th (parallel runs, each with its own --lines copy)')
    ap.add_argument('--whisper', default='small')
    ap.add_argument('--whisper-dir', default=None, help='where faster-whisper keeps its model (default: the HF cache)')
    ap.add_argument('--threads', type=int, default=0, help='CPU threads for Piper and Whisper each (default: theirs)')
    ap.add_argument('--more', action='store_true', help='a wider sweep of settings (20 takes), for the weak lines')
    ap.add_argument('--below', type=float, default=0, help='with --weak: lines scored below this (default 0.85)')
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    spec = load_spec(args.lines)
    asr = WhisperModel(args.whisper, device='cpu', compute_type='int8', download_root=args.whisper_dir, cpu_threads=args.threads)
    voices = Voices(args.models, args.threads)
    only = set(filter(None, args.only.split(',')))
    if args.takes:
        pathlib.Path(args.takes).mkdir(parents=True, exist_ok=True)

    def wanted(line):
        if only and line['id'] not in only:
            return False
        return not args.speaker or line['speaker'] == args.speaker

    if args.audition:
        who, ids = args.audition.split(':')
        lines = [ln for ln in spec['lines'] if ln['speaker'] == who and (not only or ln['id'] in only)]
        for sid in [int(x) for x in ids.split(',')]:
            spec['speakers'][who]['sid'] = sid
            got = [pick(spec, voices, asr, ln, early=0.97) for ln in lines]
            scores = [g[0] if g else 0 for g in got]
            secs = sum(len(g[4]) / g[5] for g in got if g)
            print(f'{who} sid {sid:3d}  mean {np.mean(scores):.3f}  min {min(scores):.2f}  {secs:.1f} s  ' + ' '.join(f'{s:.2f}' for s in scores), flush=True)
        return

    weak = []
    todo = [ln for ln in spec['lines'] if wanted(ln)]
    if args.shard:  # (before --weak and --missing, so a resumed run keeps its share)
        i, n = (int(x) for x in args.shard.split('/'))
        todo = todo[i::n]
    todo = [ln for ln in todo if not (args.weak and ln.get('score', 0) >= (args.below or 0.85)) and not (args.missing and 'score' in ln)]
    for line in todo:
        best = pick(spec, voices, asr, line, more=args.more)
        sp = spec['speakers'][line['speaker']]
        if best and 'score' in line and best[0] < line['score']:
            print(f"{line['id']:22s} {best[0]:.2f} no better than the take kept ({line['score']:.2f})", flush=True)
            continue
        if best and args.takes:
            sf.write(str(pathlib.Path(args.takes) / f"{line['id']}.wav"), best[4], best[5], subtype='FLOAT')
        for k in ('length_scale', 'noise_scale', 'score', 'heard'):
            line.pop(k, None)
        if not best:
            weak.append(line['id'])
            print(f"{line['id']:22s} FAILED (no take could be cut)", flush=True)
            continue
        if best[1] != sp.get('length_scale', 1.0):
            line['length_scale'] = best[1]
        if best[2] is not None and best[2] != sp.get('noise_scale'):
            line['noise_scale'] = best[2]
        line['score'] = round(best[0], 2)
        if best[0] < 0.85:
            weak.append(line['id'])
            line['heard'] = best[3]
        print(f"{line['id']:22s} {best[0]:.2f} ls={best[1]} ns={best[2]}  heard: {best[3]}", flush=True)
        save_spec(spec, args.lines)  # as it goes: a long run can be stopped and resumed with --missing
    save_spec(spec, args.lines)
    print('WEAK', weak)


if __name__ == '__main__':
    main()

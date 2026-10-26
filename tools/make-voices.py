#!/usr/bin/env python3
"""Render the WW2 German crew voices into public/audio/voice-de/ from tools/voice-lines-ww2.json.

Synthetic speech from Piper (https://github.com/OHF-Voice/piper1-gpl), an offline neural TTS, with the German
voices de_DE-mls-medium (Multilingual LibriSpeech, CC BY 4.0, several speakers) and de_DE-thorsten_emotional-medium
(the battery officer); see public/audio/CREDITS.md. The output is plain speech: the game adds the field telephone,
the radio and the open air at runtime (src/ww2/voices.js).

    PYTHONPATH=<dir>/pylib python3 tools/make-voices.py --models <dir>/models --takes <dir>/takes [--only id,id]

With --takes (the WAVs tools/pick-voice-takes.py chose) the scored takes are encoded as they are; a line without one
is synthesized again from its settings (its lead-in cut off with Whisper when it has one, so faster-whisper must be
installed). Lines at the guns are 22.05 kHz MP3, the telephone and radio lines 16 kHz (the line is band-limited at
runtime anyway). To use other voices (a TTS service, recorded actors), drop MP3 files with the same ids into
public/audio/voice-de/ and run with --index-only to rebuild lines.json from what is there.
"""
import argparse
import importlib.util
import json
import pathlib
import sys

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'audio' / 'voice-de'
sys.dont_write_bytecode = True  # (loading the picker's module below would leave a __pycache__ in tools/)
_spec = importlib.util.spec_from_file_location('pick_voice_takes', ROOT / 'tools' / 'pick-voice-takes.py')
pick = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pick)
RATE = {'gun': 22050, 'phone': 16000, 'radio': 16000}
COMPRESSION = {'gun': 0.5, 'phone': 0.85, 'radio': 0.85}  # libsndfile's MP3 compression level (0 best, 1 smallest; under 1)


def resample(x, rate, to):
    """Windowed-sinc low-pass at the new Nyquist, then linear interpolation (enough for speech going to a phone line)."""
    if rate == to:
        return x
    if to < rate:
        fc = 0.45 * to / rate
        n = np.arange(-48, 49)
        h = np.sinc(2 * fc * n) * np.hamming(len(n))
        x = np.convolve(x, h / h.sum(), mode='same').astype(np.float32)
    t = np.arange(0, len(x) / rate, 1 / to)
    return np.interp(t, np.arange(len(x)) / rate, x).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='.', help='directory holding the .onnx and .onnx.json voices')
    ap.add_argument('--takes', default='', help='the chosen takes from pick-voice-takes.py (WAV per line id)')
    ap.add_argument('--lines', default=str(pick.LINES))
    ap.add_argument('--only', default='', help='comma-separated line ids to render again')
    ap.add_argument('--index-only', action='store_true', help='rebuild lines.json from the files present')
    ap.add_argument('--takes-only', action='store_true', help='encode only the lines that have a take (skip synthesis)')
    ap.add_argument('--whisper-dir', default=None)
    args = ap.parse_args()

    spec = pick.load_spec(args.lines)
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(filter(None, args.only.split(',')))
    voices, asr = pick.Voices(args.models), None
    index = {}
    for line in spec['lines']:
        sp = spec['speakers'][line['speaker']]
        ch = sp['ch']
        path = OUT / f"{line['id']}.mp3"
        if not args.index_only and (not only or line['id'] in only):
            take = pathlib.Path(args.takes) / f"{line['id']}.wav" if args.takes else None
            if take and take.exists():
                audio, rate = sf.read(str(take), dtype='float32')
            elif args.takes_only:
                audio = None
            else:
                if pick.pre_of(spec, line) and asr is None:
                    from faster_whisper import WhisperModel
                    asr = WhisperModel('small', device='cpu', compute_type='int8', download_root=args.whisper_dir)
                got = pick.render(spec, voices, asr, line, line.get('length_scale', sp.get('length_scale', 1.0)), line.get('noise_scale', sp.get('noise_scale')))
                if not got:
                    print(f"{line['id']}: the lead-in could not be cut off, skipped")
                    continue
                audio, rate = got
            if audio is not None:
                audio = pick.tidy(audio, rate)
                sf.write(str(path), resample(audio, rate, RATE[ch]), RATE[ch], format='MP3', compression_level=COMPRESSION[ch])
        if path.exists():
            info = sf.info(str(path))
            entry = {'file': path.name, 'speaker': line['speaker'], 'ch': ch, 'de': line['de'], 'en': line['en'], 'seconds': round(info.duration, 2)}
            if line.get('log'):
                entry['log'] = True
            index[line['id']] = entry
    (OUT / 'lines.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    size = sum(p.stat().st_size for p in OUT.glob('*.mp3'))
    print(f'{len(index)} lines in {OUT} ({size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()

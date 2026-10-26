# Crew voices (WW2 German)

The German callouts of the WW2 open battle (op `flanders`) and the Karl-Gerät operation (op `karl`), reused as they are in the WW1 German open battle (op `ridge`; DESIGN.md "Crew voices" lists what 1918 leaves out), are synthetic speech generated offline, then given the open air, the field telephone or the radio in the browser (`src/ww2/voices.js`, DESIGN.md "Crew voices"). They follow the recipe written up in the Kirov project (`../threejs-kirov/docs/VOICES.md`: Piper, casting by pitch, stress checks, takes chosen by transcribing them back with faster-whisper, tidy and encode, a one-line-at-a-time queue on the wall clock). This page lists what is different here, and the speakers chosen.

## Commands

```bash
D=<scratch dir>; pip install --target $D/pylib piper-tts soundfile numpy faster-whisper
# from https://huggingface.co/rhasspy/piper-voices (de/de_DE/...): the .onnx and .onnx.json of
#   mls/medium (de_DE-mls-medium) and thorsten_emotional/medium (de_DE-thorsten_emotional-medium), into $D/models
PYTHONPATH=$D/pylib python3 tools/pick-voice-takes.py --models $D/models --takes $D/takes            # choose and keep the takes
PYTHONPATH=$D/pylib python3 tools/pick-voice-takes.py --models $D/models --audition vb:97,203,58      # compare MLS speakers
PYTHONPATH=$D/pylib python3 tools/make-voices.py --models $D/models --takes $D/takes                 # render public/audio/voice-de
node tools/voicetest.mjs --op flanders --unit 1 --seconds 200 --then 5:150                            # hear them in a battle (headless)
```

`--only`, `--speaker`, `--weak` (with `--below`) and `--missing` limit a run, `--more` sweeps 20 settings instead of 6 for a weak line (a better earlier take is kept), and `--shard i/n` with its own `--lines` copy runs several in parallel; give each `--threads 3` or so, or Piper's and Whisper's thread pools starve each other. faster-whisper is `small`, int8, on the CPU, `language='de'`; the audio goes to it as a 16 kHz array (soundfile and `np.interp`), not through its own decoder.

## What differs from the Kirov recipe

- **The MLS voice babbles on short sentences.** `de_DE-mls-medium` reads a sentence of 52 characters or more cleanly with every speaker tried, and turns anything under about 47 into fluent nonsense ("Die Batterie ist feuerbereit." came back as "Das ist alles, was ich sage"); its own long samples are fine. So a short MLS line is said at the end of a long lead-in (`pres` in the line table: the speaker's own, or the line's `pre`) and cut out in the quietest 20 ms before its first word, found with Whisper's word timestamps; the cut is then scored on its own. The Thorsten voice needs no lead-in.
- **The chosen take is kept.** Piper's noise makes every synthesis different, so `pick-voice-takes.py --takes` saves the winning take as a WAV and `make-voices.py` encodes exactly that one (a line without a take is synthesized again from its settings).
- **German text checks.** The score compares a normalised transcript with the subtitle (`de`): lower case, ß as ss, numbers in digits spelled out (Whisper writes "250"), "zwo" as "zwei". `say` is what the TTS reads when it differs: numbers in words with "zwo" ("zwo-hundertfünfzig", the hyphen keeps the h), and compounds that espeak split or stressed wrongly, checked with `voice.phonemize` (`Munitions-Lager` and `Munitions-Schlepper` for the stress on -tions, `Wirkungs-Schießen` for the sch, `Gégenbatteriefeuer` for the compound's stress). A combining acute accent moves the stress as in Russian, but not inside every word: a hyphen was more reliable.
- **Observer reports are built from clips.** A correction is a head ("Hier Beobachtung."), the range ("Zu kurz, weiter 150.") and the line ("Links 50."), one clip each, for the figures the battle produces (measured over 12 seeds and three difficulties of all-auto play: the VB rounds to 10 m, 10 to 400 by 10 and 450 to 800 by 50; the air observer to 50 m, 50 to 1000); another figure is said "wie gemeldet" (as reported), the pad has it.
- **Rates.** Lines at the guns are 22.05 kHz MP3, the telephone and radio lines 16 kHz; the game decodes the telephone lines at 11.025 kHz (the line cuts at about 3.3 kHz anyway).

## The speakers

Seven speakers on two queues (the guns; the telephone and the radio). The MLS speakers were cast from all 236: median f0 by autocorrelation of one long test sentence (111 of them under 150 Hz) and its Whisper score (most male speakers 0.99 or better on a long sentence), then an audition of each role's own lines through the lead-in and cut (`--audition`, the mean score of 5 to 8 lines).

| Role | Voice | Speaker | f0 | Audition | Why |
|---|---|---|---|---|---|
| Batterieoffizier (fire commands, alarms, shouted) | thorsten_emotional | 1 "angry" | not measured | 0.94 to 1.0 in single takes | MLS reads like an audiobook and cannot shout; the only voice that gives an order |
| Geschützführer (No. 1 gun) | MLS | 194 | 90 Hz | 0.987 (of 7 tried) | the clearest of the deep voices on the gun commander's lines |
| Ladekanonier (the loader) | MLS | 159 | 128 Hz | 0.974 (of 6) | the briskest and clearest of the younger voices |
| Abteilung (fire direction, telephone) | MLS | 101 | 86 Hz | 0.984 on the gun commander's lines | the deepest clear voice, unhurried |
| the battery's telephone operator | MLS | 43 | 137 Hz | 0.970 on the loader's lines | a higher voice, apart from the observer's |
| VB, the forward observer (telephone) | MLS | 203 | 111 Hz | 0.979 on the report clips (of 5) | the best on the figures |
| the air observer (radio) | MLS | 112 | 124 Hz | 0.965 on the report clips (of 3) | the best on the air observer's figures |

Licences and attribution: `public/audio/CREDITS.md` (MLS: CC BY 4.0, attribution to Multilingual LibriSpeech; Thorsten: CC0 data, a voice fine-tuned from the research-licensed English lessac voice, acceptable for this non-commercial project only).

## The line table and the scores

`tools/voice-lines-ww2.json` has 411 lines: 139 fixed lines and 272 figures for the observers' corrections (the head, the range and the line of a report). Each has its Whisper `score` (the transcript of the chosen take against the subtitle, 1 is word for word); all are 0.85 or better (lowest 0.86, median 1.00). The words Whisper misheard most were "kürzer" (as "Karzer" or "Katze") and "fünfhundert" (as "von 100"; the TTS reads "fünf-hundert" now); a few lines were reworded until they passed (the launcher's "Werfer laden!" became "Rohre frei zum Laden!", "Werfer richten!" became "Werfer nach Höhe und Seite richten!"). A score is Whisper's hearing, not a listener's: the lines below are the ones to listen to first.

| Speaker | Lines | Lowest | Median | Mean |
|---|---|---|---|---|
| Batterieoffizier (`bo`) | 61 | 0.90 | 1.00 | 0.987 |
| Geschützführer (`gf`) | 19 | 0.93 | 0.98 | 0.981 |
| Ladekanonier (`lk`) | 15 | 0.90 | 0.95 | 0.953 |
| Abteilung (`abt`) | 17 | 0.93 | 0.98 | 0.969 |
| telephone operator (`fs`) | 3 | 0.92 | 0.94 | 0.943 |
| VB (`vb`) | 12 + 192 figures | 0.86 | 1.00 | 0.976 |
| air observer (`fu`) | 12 + 80 figures | 0.86 | 1.00 | 0.973 |

The lines under 0.9:

- `vb_right_500` 0.86: «Rechts 500.»
- `fu_drop_500` 0.86: «Zu weit, kürzer 500.»
- `vb_add_500` 0.88: «Zu kurz, weiter 500.»
- `fu_add_500` 0.88: «Zu kurz, weiter 500.»
- `fu_drop_50` 0.88: «Zu weit, kürzer 50.»

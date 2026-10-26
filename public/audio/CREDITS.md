# Sound credits

Real recordings used by the game's audio engine (`src/audio.js`, `RECORDINGS`). They are cut into
slices at load time and either replace or layer over the procedurally synthesized sounds; without
them the synthesized sounds play. The files are Freesound's 128 kbps preview encodings of the
originals; the licenses apply the same.

| File | Source | Author | License |
|---|---|---|---|
| `cannon-shot-187767.mp3` | [Cannon Shot](https://freesound.org/s/187767/) (from US government video) | qubodup | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `distant-explosions-438693.mp3` | [G43-14-25 Distant Explosions](https://freesound.org/s/438693/) | craigsmith | CC0 1.0 |
| `explosion-182429.mp3` | [Explosion](https://freesound.org/s/182429/) (from US government video) | qubodup | CC0 1.0 |
| `shell-casings-318964.mp3` | [Bouncing Shell Casings (Various Sizes)](https://freesound.org/s/318964/) | GryffDavid | CC0 1.0 |
| `field-artillery-702245.mp3` | [GUNArtl_69thFieldArtilleryGun01](https://freesound.org/s/702245/) | InMotionAudio | CC0 1.0 |
| `artillery-shots-182822.mp3` | [Artillery Shots.flac](https://freesound.org/s/182822/) (from US government video) | qubodup | CC0 1.0 |
| `gun76-shots-332935.mp3` | [Tykki, laukaus / Big gun, cannon, 76 mm, single shots, gunshots](https://freesound.org/s/332935/) | YleArkisto | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `artillery-gunfire-239137.mp3` | [Artillery Gunfire](https://freesound.org/s/239137/) (from US Army video) | qubodup | CC0 1.0 |

The guns' reports are built in layers from the last four (`recordedGun` and `REC` in `src/audio.js`), class
by class from the 18-pounder to the colossal guns: the field gun's close report (the crack), the US
government videos' howitzer reports (the snap), the 76 mm's shots (the body and its tail) and the US Army
video's big gun (the boom), pitched lower for the bigger guns, with a synthesized sub thump and rolling
echo; near, and through the distance filters mid and far. Without them the synthesized guns play, with the
cannon shot laid under them. The explosion is laid under the near ground bursts, the distant explosions are
the far bursts and the drumfire's thuds, and the shell casings the empty case dropped on the duckboards.

Only the Yle archive recording requires attribution: "Tykki, laukaus / Big gun, cannon, 76 mm, single
shots, gunshots" by YleArkisto (https://freesound.org/s/332935/), licensed under CC BY 4.0, cut into slices,
resampled and layered. The rest are CC0 and credited as a courtesy.

## WW2 German crew voices (`voice-de/`)

The German callouts of the WW2 open battle and the Karl-Gerät operation (`voice-de/*.mp3`, indexed by
`voice-de/lines.json`) are synthetic speech, not recordings of people. They were generated offline by
`tools/pick-voice-takes.py` and `tools/make-voices.py` from the text in `tools/voice-lines-ww2.json` with
[Piper](https://github.com/OHF-Voice/piper1-gpl) and two German voices from
[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices); the game adds the field telephone, the radio and the
open air at runtime (`src/ww2/voices.js`). The recipe is in `docs/VOICES.md`.

| Voice | Speakers used | Who speaks | Dataset licence |
|---|---|---|---|
| `de_DE-mls-medium` (trained from scratch) | MLS speaker ids 194, 159, 101, 43, 203, 112 | the gun commander (194) and the loader (159), the Abteilung (101), the battery's telephone operator (43), the forward observer (203), the air observer (112) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `de_DE-thorsten_emotional-medium` | its "angry" speaker (id 1) | the battery officer's shouted commands and alarms | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

**Attribution (CC BY 4.0).** The `de_DE-mls-medium` voice was trained on the German part of Multilingual LibriSpeech:
"MLS: A Large-Scale Multilingual Dataset for Speech Research" by Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel
Synnaeve and Ronan Collobert (2020), [openslr.org/94](https://www.openslr.org/94/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (its audio comes from LibriVox's public-domain audiobooks). The
speech here is new synthesized speech from a model trained on that data, cut, filtered and encoded; it does not reproduce
the dataset's recordings.

**Licence note on the Thorsten voice.** The Thorsten-Voice dataset (Thorsten Müller) is CC0. The `thorsten_emotional`
voice was fine-tuned from Piper's German `thorsten` voice, which was itself fine-tuned from the English `lessac` voice,
whose training data (Blizzard 2013, Lessac Technologies) is under a research licence. That is acceptable for this
source-available, non-commercial project (the same note as the Kirov project's Russian voices); a commercial release
should replace the battery officer's lines with an MLS speaker, a commercially licensed TTS service or recorded actors.
Any replacement drops in under the same ids: put the files in `voice-de/` and run `python3 tools/make-voices.py --index-only`.

The lines are game dialogue in a plausible Wehrmacht artillery register, strictly the procedure (fire commands, the
loading drill, the observers' corrections): no real units, places, slogans or salutes, and no claim to quote real
drill. Every line was checked for intelligibility by transcribing it back with Whisper (`score` in the line table).

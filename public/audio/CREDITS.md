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

# What's modelled

Back to the [README](../README.md).

Everything is procedural: terrain, guns, crews, targets, shells, the consoles and most of the sound are generated in code. The only asset files are eight recordings in `public/audio`.

## Rendering

All in `src/`, with no model or texture files.

- **Terrain.** A camera-centred geometry clipmap from a pure height function shared with the simulation. Flat British ground turns into a cratered, flooded, mud-filled devastated zone, with ridges on the German side, trenches cut into the ground, and plank roads.
- **Craters.** Runtime craters from this battle stay, sized by calibre: 1.5 m radius for a field gun shell, 8 m for the 15-inch, 10 m for the 18-inch, 16 m for the Gustav, larger with the delay fuze. They fill with water on wet ground. The WW2 operations other than Flanders stand in open country west of the salient, away from its craters.
- **World dressing**, built in tiles around the camera: fire, support and communication trenches with sandbags and duckboards, wire belts, gun pits with camouflage nets and shell stacks, the railway main line and firing spur, roads, and the ruins of Ypres and the villages. Camouflage nets between the camera and the gun you orbit are cut away.
- **No man's land** in 1917 carries shattered trees, broken limbers, fallen timber and torn wire among the shell holes.
- **Guns.** Models for the five British kinds and for the German guns and launch sites of both German modes (from the 10.5 cm leFH 18 to the 80 cm Gustav, the Karl-Gerät, the V-1 catapult, the A4 on its Meillerwagen, the Langer Max, the Gamma and the Paris Gun with their positions), with their loading machinery.
- **Crews** in several poses: carrying, hauling, ramming, laying, lanyard, covering ears.
- **Targets:** German guns, pillboxes, dumps, the kite balloon with its winch, the chateau HQ; Allied and Soviet batteries, tanks and forts; British 18-pounders and Mark IV tanks.
- **Traffic and aircraft:** crossroads traffic and trains, and the enemy's aircraft (Typhoons and Il-2s, RE8s and Camels).
- **Infantry:** British and German infantry as instanced soldiers who fall and are thrown by bursts.
- **Effects:** muzzle blasts with fireball, dust ring and drifting cordite; earth geysers, clods on ballistic arcs, shockwave refraction rings, heat shimmer, shrapnel airbursts, ammunition cook-offs with flying burning rounds; rocket ripples and missile launches; smoke columns and ground fires.
- **Light and shake:** up to 16 analytic lights from muzzle flashes, bursts, flares and star shells light the ground at night; close blasts bring screen shake and dazzle.
- **Sky and image:** sky, clouds, five weather states, fog, a time of day driven by the game clock, bloom, ambient occlusion, god rays, lens effects and a set of colour grades.
- **Grades by era.** The British 1917 and WW1 German modes open on a drained colour grade ("1917") and heavier ground haze; the WW2 mode and the Big Bertha demo use the Flanders grade. Film grain is off by default (a slider in the settings panel).
- **Shells in flight** are visible and can be followed (F) from behind and above to the burst.
- **Resolution.** The scene renders at the quality preset's resolution times a dynamic scale (0.67 to 1) that keeps the frame rate up, then is scaled to the screen.

## Simulation

In `src/sim/`, headless and deterministic per seed. The German modes plug their own modules into it from `src/ww2/` and `src/ww1/`.

- **Flight.** Shells fly a simple drag-and-gravity integration with game constants, at a fixed 0.05 s step. Each gun's range table is computed from the same integrator, so the table and the flight agree.
- **Errors.** The fall of shot moves with a hidden map error on every fresh lay, each gun's calibration error, barrel wear, the day's wind and random dispersion; ranging finds them.
- **Damage** comes from a game table of shell against target hardness, scaled by the fuze: instant for men and wire, delay against concrete and dumps, shrapnel against men in the open. Every part of a target has its own hit points.
- **Counter-battery** runs on each unit's signature (step 5 of [a fire mission](PLAYING.md#how-a-fire-mission-works)), which the enemy's batteries answer.
- **AI crews** run every unit you are not operating and are deliberately imperfect. On Normal the all-auto Group loses most 1917 battles and a competent player wins most (checked over 72 seeds with `tools/simtest.mjs`).

## Sound

Synthesized at start, with eight recordings from Freesound built in or layered on top. Their sources and licences are in [public/audio/CREDITS.md](../public/audio/CREDITS.md).

- **Gun reports** are built in layers from four real gun recordings, the way a game sound designer builds a gun: a field gun's close crack, modern howitzers' bright reports, a 76 mm gun's body and a big gun's low boom. Each calibre class pitches them lower for the bigger guns and adds a synthesized sub thump and rolling echo. Six takes near, and versions for middle and long range. Without the recordings the synthesized guns play.
- **Blasts and bursts** by calibre class, routed with a 343 m/s travel delay, distance filtering and air absorption. A close blast arrives as a pressure wave that shakes the camera and dulls the hearing.
- **Shells:** flight voices with Doppler, and the rising scream of enemy shells coming down near you. Your own shells are heard from where their sound left them, so the tearing starts with the gun's report.
- **The battery:** ammunition cook-offs, loading sounds (trolley, crane chain, rammer, breech screw and clang), Very pistols, telephone and wireless signals.
- **Background:** a distant drumfire bed, rain and wind.
- **The German modes** add rocket ripples, aircraft, the air-raid siren and the Paris Gun's report.

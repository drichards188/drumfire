# Drumfire: heavy artillery at Ypres, 1917

A three.js (WebGL2) game built on the MaxGFX framework and the sibling game Echelon. You command a Heavy Artillery Group in the Ypres salient in autumn 1917. Fire missions come in from forward observers, aircraft, a kite balloon and the sound rangers: hostile batteries, concrete pillboxes, wire, ammunition dumps, a crossroads, a railhead. You lay the guns from the artillery board, fire, read the observers' fall-of-shot reports, correct, and fire for effect, while German counter-battery fire walks onto your gun positions and German infantry counter-attack under red SOS rockets.

The left half of the screen is a third-person view of the unit you have selected; the right half is its fire control console. Units you are not operating fight on their own with an AI crew, in whatever mode you left them. Everything is procedural (terrain, guns, crews, targets, shells, the consoles, most of the sound); the only asset files are four CC0 recordings in `public/audio`.

The simulation is an arcade game with period flavour, not a gunnery simulator. Shells fly a simple drag-and-gravity integration with game constants, and damage comes from a game table. Period detail is in the look, the words and the procedure.

## Running it

```bash
npm install
npm run dev      # http://localhost:5201
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle
```

A browser with WebGL2 is required. Open the page, pick Easy, Normal or Hard and press "Take command". Sound starts on the first click or key press.

**Tutorials.** "Tutorials" on the title screen (next to "Take command") opens six short guided lessons on a quiet scripted range, always in daylight (the sun is held at 10:00 and the weather is Clear or Overcast; your own settings come back when you leave). Each lesson shows an instruction card over the 3D view, pulses the console controls it is about, and completes a step when you have done what it asks (Skip step and Esc are always there). Lessons: **The basics** (the screen, five units, camera, console, time compression, watch the 15-inch load, fire and ride its shell with F), **Ranging with the F.O.O.** (6-inch battery: take a mission, ranging round, telephone report, corrections, bracketing, fire for effect), **The aeroplane and the clock code** (9.2-inch: wireless messages and the RFC clock code), **The heavies** (15-inch with the delay fuze on a pillbox, then the railway gun on the railhead), **Counter-battery** (German fire walks onto you; HOLD; the 60-pounders on the sound rangers' reference) and **S.O.S.** (red rockets, every gun on the line, shrapnel, break the attack). Completed lessons are ticked (stored in the browser). `?tutorial=<basics|ranging|clockcode|heavy|counter|sos>` starts one directly.

URL parameters: `?quality=Low|Medium|High|Ultra` (default Medium), `?play=1` (skip the title screen), `?unit=N` (start on unit 1 to 5), `?hour=H` (fix the time of day, for example `5.25`), `?weather=Clear|Overcast|Drizzle|Rain|Mist`, `?sandbox=1` (no battle; B fires a test blast, N a burst, K a star shell, L a Very light, J an SOS rocket). The gear button opens a settings panel (quality, colour grade, bloom, fog, exposure and so on). `F3` shows frame and particle statistics.

## The Group

Keys 1 to 5 select a unit.

| Key | Unit | Call sign | Battery | Guns |
|---|---|---|---|---|
| 1 | 15-inch howitzer | Granny | No. 3 RMA Howitzer | 1 |
| 2 | 9.2-inch howitzer | Mother | 91st Siege Battery | 2 |
| 3 | 6-inch 26 cwt howitzers | Ginger | 118th Siege Battery | 4 |
| 4 | 60-pounders | Long Tom | 1/1st Lowland Heavy Battery | 2 |
| 5 | 18-inch railway howitzer | Wolfe | No. 13 Railway Siege Battery | 1 |

The heavies are slow and powerful (the 15-inch loads in about 50 s, the 18-inch railway gun in about 90 s, the 60-pounder in about 10 s), and each kind has its own loading crew and machinery: the 15-inch shell crane, the railway gun's shell hoist and tray, the pair carrying a 9.2-inch round from the stack. The 60-pounders can also fire shrapnel (airbursts over wire and open ground). The 18-inch railway gun (2,500 lb shells, about 20 km) reaches the deep targets (railhead, headquarters, far batteries) and fires the biggest burst in the game. It is a what-if gun: the real British 18-inch railway howitzer was ordered in 1918 and proofed in 1920 or 1921 and never fired in the war (the 18-inch naval guns of the monitors General Wolfe and Lord Clive did fire on the Belgian coast in 1918), so in 1917 the Group has it in its place of the 12-inch railway howitzers that really served at Ypres.

## WW2 mode: the German side

On the title screen, **WW2 German** switches to a second mode (`/?mode=ww2`): German artillery in the Second World War, in five separate operations, because these weapons never served together. Pick one on the title screen, or open it directly:

| Operation | URL | What you do |
|---|---|---|
| Flanders, autumn 1944 | `/?mode=ww2&op=flanders` | The backbone battle on the game's Ypres map, sides turned round: seven units (keys 1 to 7) against the Allied gun line, tanks, dumps, the AOP strip, the HQ and the railhead; Sperrfeuer when their infantry attacks, Störungsfeuer at night, a Feuerwalze for our counter-attack |
| Sevastopol, June 1942 | `/?mode=ww2&op=sevastopol` | Build the 80 cm Gustav on its firing curve (work gangs on survey, track, gantry cranes, assembly, ammunition train, flak, camouflage), then spend its few 4.8 t shells on the coastal turrets, the forts and the cliff magazine; a 21 cm Mörser battery supports |
| Brest-Litovsk, 22 June 1941 | `/?mode=ww2&op=karl` | The 60 cm Karl-Gerät: drive to a firing position, turn the whole vehicle onto the target (4 degrees of traverse), lower the hull, load 2.2 t shells from the Munitionsschlepper's crane, fire, fetch more shells, displace |
| V-1 launch site | `/?mode=ww2&op=v1` | The launch drill at the Walter catapult: missile, wings, compass in the Richthaus, air log, sled, fuel, steam generator, fuzes, clear, fire; faults, air raids (take cover), the flight and its report |
| V-2 mobile battery | `/?mode=ww2&op=v2` | Erect the A4 on its firing table, align it, set the Brennschluss, checks, alcohol, T-Stoff and Z-Stoff, liquid oxygen (it boils off: launch or top up), withdraw, Vorstufe, Hauptstufe |

Add `&play=1` to skip the title screen. The roster (Flanders): 1 10.5 cm leFH 18 (four field howitzers), 2 15 cm sFH 18 (four heavy howitzers), 3 17 cm K 18 (two long guns, counter-battery), 4 21 cm Mörser 18 (two heavy mortars), 5 15 cm Nebelwerfer 41 (three six-tube launchers: a round is a ripple of six rockets), 6 80 cm Gustav (the railway slot: it must be built before it fires and has eight shells), 7 42 cm Big Bertha. **Gustav and Big Bertha in Flanders are alternate history** and are labelled so in the game (Big Bertha is a 1914 to 1918 weapon; the Gustav fired only at Sevastopol). The Big Bertha first-person demo stays available from the title screen.

The console works the same way in metres and Strich (6400 to the circle), German grid references (r and h in km) and German words: the VB (forward observer) telephones "weiter 150, links 50", the Storch radios in metres, Gegenbatterie, Sperrfeuer (S), Feuerwalze. The special weapons have a procedure card instead of the range table: the Gustav's preparation tasks (+ and - put work gangs on them, J all hands), the Karl's positions (T turn, L lower or raise, Y fetch shells), the launch drills (Enter next step, arrow keys dial the compass and the range, B take cover, O fix a fault).

Tutorials in the WW2 mode: Die Grundlagen (the leFH 18, metres and Strich), Der Nebelwerfer, Gustav: railway preparation, Karl-Gerät, V-1: the launch drill, V-2: the A4 drill (`/?mode=ww2&tutorial=w-basics|w-werfer|w-gustav|w-karl|w-v1|w-v2`; a lesson on another operation reloads the page there).

History and game numbers are kept apart: `docs/WW2.md` has the real specifications with their sources, every departure of the game's tables from them, and the balancing assumptions. The V-weapons were used chiefly against cities and were built with concentration-camp forced labour; their missions target the port of Antwerp, score only the launch drill and whether the round reached the target area, and never count casualties.

## Controls

Main keys:

| Key | Action |
|---|---|
| 1 to 5 | select a unit |
| Mouse drag, wheel | orbit and zoom the camera |
| F | ride the selected unit's newest shell to its burst; F again returns to the gun |
| C | free camera (drag to orbit, wheel to zoom out to 3 km, WASD to move); C again returns |
| `[` and `]` | slower and faster time compression (x0.25 to x8) |
| M | mute |
| H | hide the overlay |
| F3 | statistics |

Console keys (for the selected unit; clicking the buttons does the same):

| Key | Action |
|---|---|
| Tab, Shift+Tab | move the mission cursor |
| Enter | take the mission under the cursor |
| Space | fire the guns chosen by the GUNS selector |
| G | GUNS selector: 1 GUN (the directing gun, for ranging), SECTION, BATTERY (hidden for one-piece units). It sits on 1 GUN while ranging and goes to all guns for effect; G or a click overrides it |
| Arrow keys | correct the aim: up adds range, down drops, left and right shift the line (Shift = 10 yards, otherwise the current step) |
| X | cycle the correction step (10, 25, 50, 100, 200 yards) |
| Q, E | charge down, up |
| R | rounds per piece for the next series |
| Z | fuze (instant, delay, and shrapnel for the 60-pounders) |
| A | toggle auto and manual (the header also has a HOLD button, which ceases fire) |
| S | SOS: every gun that can reach it lays on the alarmed sector's line |
| Backspace, Delete | cease fire |
| `.` | apply the pencilled correction of the newest observer report |

Clicking the artillery board lays the guns on that point; clicking a known target takes its mission; dragging pans and the wheel zooms the board. Any control the AI crew would undo (laying, firing, charge) switches the unit to manual first.

## How a fire mission works

1. **A mission arrives.** The message pad and the mission list show it: a hostile battery (counter-battery), a pillbox or other point target to destroy, wire to cut, harassing fire on a road or the railhead, or an SOS. The observer is a forward observation officer (FOO) by telephone, an aeroplane or the kite balloon by wireless, sound rangers who give a map reference with some error, or a map shoot with no observer at all. Missions carry a priority and a deadline.
2. **Lay the guns.** Take the mission (Tab, Enter) or click the board. The console computes the line (degrees and minutes of arc), the range (yards), the charge and the elevation from the range table, which comes from the same integrator the simulation flies shells with. The order card says when a target is out of range, inside the minimum range or outside the gun's arc of fire. Each piece traverses and elevates to the order; the loading crew works through the loading steps.
3. **Ranging.** The first round of a fresh lay lands 50 to 400 m off. Fire one round and wait for the report. A FOO telephones the fall of shot in yards (add or drop, left or right of the line of fire). Aircraft send the RFC clock code: a circle letter for the distance (Y 10, Z 25, A 50, B 100, C 200, D 300, E 400, F 500 yards) and an hour for the direction, with 12 o'clock true north from the target. Apply the correction with the arrows or `.` and fire again; good corrections get within about 30 m in two or three rounds. Wind (the day's meteor telegram), gun wear and each gun's calibration error all shift the fall of shot.
4. **Fire for effect.** Once on, raise the rounds (R) and fire. All pieces of the unit shoot a series; the target's parts (each gun of a battery, each stack of a dump, each wagon) are damaged by a table of calibre against hardness, and a pillbox needs heavier shells or more of them. Dumps cook off in chains.
5. **Counter-battery.** Every round builds the unit's signature (flash and sound ranging), more at night and with the kite balloon up. German batteries walk fire onto the loudest unit; the incoming scream warns you about four seconds ahead. Go to HOLD to let the signature fade, kill the balloon, or silence the hostile battery itself.
6. **SOS.** When the Germans form up for an assault the hurricane bombardment is a warning, then red rockets go up over a sector (A Frezenberg, B Zonnebeke road, C Polygon, D Gheluvelt). Press S, or click the sector's SOS button: every unit that can reach the line lays on it and fires. Infantry that reach the British trench breach the sector; two lost sectors lose the game.
7. **Zero hour.** In the last phase the British infantry go forward behind a creeping barrage that lifts on a timetable. Keep the guns on the lane and lift on time. The game is won when enough of the infantry reach the objective (the share required is 50 % on Easy, 60 % on Normal, 70 % on Hard) and lost when two front sectors fall or every gun is destroyed.

The day runs as a time lapse of about 40 minutes of game time in five phases: Registration (a quiet dawn that teaches the loop), the bombardment, the counter-attack, Night (harassing fire, star shells, the railhead) and Zero hour. Map references use the British 1:20,000 trench map system for sheet 28: a lettered 6000-yard square, a numbered 1000-yard square, a quarter a to d and tenths of 50 yards, for example `J.14.c.3.7`.

## What it draws and plays

Rendering (all in `src/`, no model or texture files):

- Terrain: a camera-centred geometry clipmap from a pure height function shared with the simulation, with flat British ground turning into a cratered, flooded, mud-filled devastated zone, ridges on the German side, trenches cut into the ground, and plank roads. Runtime craters from this battle stay (by calibre, 1.5 m radius for an 18-pounder to 8 m for a 15-inch) and fill with water on wet ground.
- World dressing built in tiles around the camera: fire, support and communication trenches with sandbags and duckboards, wire belts, gun pits with camouflage nets and shell stacks, the railway main line and firing spur, roads, and the ruins of Ypres and the villages. Camouflage nets between the camera and the gun you orbit are cut away.
- Gun models for all five kinds with their loading machinery and crews in several poses (carrying, hauling, ramming, laying, lanyard, covering ears); German guns, pillboxes, dumps, the kite balloon with its winch, the chateau HQ, crossroads traffic and trains; British and German infantry as instanced soldiers who fall and are thrown by bursts.
- Effects: muzzle blasts with fireball, dust ring and drifting cordite; earth geysers, clods on ballistic arcs, shockwave refraction rings, heat shimmer, shrapnel airbursts, ammunition cook-offs with flying burning rounds; up to 16 analytic lights from muzzle flashes, bursts, flares and star shells lighting the ground at night; screen shake and dazzle from close blasts; smoke columns and ground fires.
- Sky, clouds, five weather states, fog, a time of day driven by the game clock, bloom, ambient occlusion, god rays, lens effects and a set of colour grades (the default is Flanders).
- Shells in flight are visible and can be followed (F) from behind and above to the burst.

Sound (synthesized at start, with four CC0 recordings layered on top):

- Muzzle blasts and bursts by calibre class, routed with a 343 m/s travel delay, distance filtering and air absorption; a close blast arrives as a pressure wave that shakes the camera and dulls the hearing.
- Shell flight voices with Doppler, the rising scream of enemy shells coming down near you, ammunition cook-offs, loading sounds (trolley, crane chain, rammer, breech screw and clang), Very pistols, telephone and wireless signals, a distant drumfire bed, rain and wind.

## Layout

```
index.html, models.html, ui.html, audio.html, world.html, fx.html   game and dev pages
src/main.js          orchestration, settings (lil-gui), keys, frame order
src/sector.js        the world frame: units, trench lines, sectors, sites, places, grid references
src/sim/             the headless simulation (Node-safe, deterministic per seed)
src/render/          gun rigs posed from the sim, loading crews, shells, targets, infantry
src/models/          procedural models: guns (v/), German side and targets (t/), infantry (inf/), shells, rig helpers
src/world/           trenches, wire, gun pits, rails, roads, ruins, built in tiles
src/terrain*.js, craters.js, trenchlines.js, vegetation.js, grass.js   ground
src/fx.js, src/fx/   particles and the artillery effects; src/flares.js the pooled analytic lights
src/post.js          bloom, AO, god rays, lens, grades, shockwave, heat, dazzle
src/atmosphere.js, clouds.js, weather.js, shaderlib.js, noise.js   sky and framework shaders
src/ui/              the fire control console, artillery board, message pad (mock.js for ui.html)
src/audio.js         the sound engine; public/audio holds the four recordings
src/camera.js, hud.js, style.css
src/dev/             scripts behind the dev pages
tools/               simtest.mjs, audiotest.mjs, shot.mjs
refs/                local reference sheets and photographs (gitignored)
DESIGN.md            the contract between the modules, with a changelog
```

## Tools and dev pages

```bash
node tools/simtest.mjs 1 2 3 --both --quiet                   # headless battles: all-auto vs a scripted player
node tools/simtest.mjs 1 2 3 --all --difficulty all --table   # + a scripted player on all five units; --jobs N, --log
node tools/ww2test.mjs 1 2 3 --op all --difficulty all          # the WW2 operations with the auto crews; --log, --quiet
node tools/audiotest.mjs                                      # renders every sound bank offline and checks levels
node tools/shot.mjs "/?play=1&unit=1&quality=Low" shots/x.png --wait 4000   # headless capture (dev server must be running)
```

`simtest` runs whole games on worker threads and prints win rates and per-game figures; run it after changing the gun, shell, target or difficulty tables, the AI crews, the enemy or the director. `shot.mjs` launches its own headless Chromium through `playwright-core` (Chromium from `~/.cache/ms-playwright`); `window.__drumfire` exposes every system, and `__drumfire.fastForward(seconds, { unit, scale })` runs the battle without drawing to jump into a raid before the capture.

Dev pages on the dev server: `/models.html?kind=bl15|bl92|bl6|bl60|rail|crew` (model viewer, with `&ortho=right|left|front|rear|top` blueprint views), `/ui.html?unit=ID&scn=ranging|sos|dead|night` (the console against a mock world), `/audio.html`, `/world.html`, `/fx.html`, and the viewers `/src/render/preview.html`, `/src/models/inf/preview.html`, `/src/models/t/preview.html` and `/src/world/preview.html`.

## Credits

- [three.js](https://threejs.org) and [lil-gui](https://lil-gui.georgealways.com) (runtime), [Vite](https://vite.dev) and [playwright-core](https://playwright.dev) (development).
- The MaxGFX framework and the Echelon game, from which the renderer, sky, fx, post, camera and console framework are taken.
- Four CC0 recordings from Freesound in `public/audio`, listed in `public/audio/CREDITS.md`: "Cannon Shot" (qubodup), "G43-14-25 Distant Explosions" (craigsmith), "Explosion" (qubodup) and "Bouncing Shell Casings (Various Sizes)" (GryffDavid).
- Reference photographs of the guns, the German side and the battlefield, from Wikimedia Commons, are used only locally to check the models (`refs/`, not part of the repository or the game); their licences are listed in the sheets there.

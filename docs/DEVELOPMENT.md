# Development

Back to the [README](../README.md).

## Running it

```bash
git lfs install  # once per machine, before cloning (public/crew2 is in Git LFS)
npm install
npm run dev      # http://localhost:5201 (Vite runs with --host, so it is also reachable on the local network)
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle on http://localhost:4173
```

- **Git LFS.** The lifelike crewmen's models, clips and skin pictures (`public/crew2/*.glb`, `*.jpg`, `clips.json`, about 43 MB) are in [Git LFS](https://git-lfs.com) (`.gitattributes`). A clone made without it holds small pointer files instead: run `git lfs pull`. Until then the crewmen fail to load and the game keeps the older figures.
- **Browser.** A browser with WebGL2 is required.
- **Sharing.** Build the game and put the contents of `dist/` at the root of a web server.
- **Any folder.** `vite.config.js` sets `base: './'` and the menu's links, stills and back links are relative (`index.html?...`, `bertha.html`, `menu/<id>.jpg`), so the build runs at the root of a site or in a subfolder (itch.io, a GitHub Pages project page), but not from `file://` (module scripts and the audio worker need a server). For itch.io, zip the contents of `dist/` (`index.html` at the zip's root) and upload it as an HTML game.
- **Saves on itch.io.** itch serves every HTML game from one origin (`html-classic.itch.zone/html/<upload id>/`), so a new upload keeps the players' localStorage but shares it with every other game there. `src/saves.js` (started by `boot.js` before anything reads a save) mirrors the `drumfire.*` keys into IndexedDB on every write and puts them back when localStorage comes up empty, and gives the menu its Export save and Import save file buttons.

## Tools

There are no unit tests, linter or formatter. These tools run the game's own code headless:

```bash
node tools/simtest.mjs 1 2 3 --both --quiet                   # 1917 battles: all-auto vs a scripted player
node tools/simtest.mjs 1 2 3 --all --difficulty all --table   # + a scripted player on all five units; --jobs N, --log
node tools/ww2test.mjs 1 2 3 --op all --difficulty all        # the WW2 operations with the auto crews; --log, --quiet
node tools/ww1test.mjs 1 2 3 --difficulty all --quiet         # the WW1 German battle and the Paris Gun's mission; --op, --player, --table, --jobs N
node tools/berthatest.mjs 1 2 3 --difficulty all              # Big Bertha demo games played by the crew logic; --log, --limit
node tools/progressiontest.mjs                                # research, upgrades, pay, saves, and the campaigns: any order, rosters, targets, every victory path
node tools/researchtest.mjs 1 2 3 --lineup all                # open battles with a career's lineups (start..max): wins, RP, battery points; --era, --jobs N
node tools/leveltest.mjs $(seq 1 72) --jobs 8                 # the ten threat levels, all auto, reference lineups: wins, the human length proxy beside each level's minutes, holds, two-step mains; --levels, --lineup below, --mods roll, --cb old, --games
node tools/cbtest.mjs --levels 1,5,10 --seeds 12 --jobs 8     # the British counter-battery fire on the levels: guns and men lost, engagements, fires for effect, the opening's timing; --cb old, --policy auto|none|cover, --lineup kind:guns
node tools/hangarsheet.mjs --era all --jobs 3                 # the menu hangar's contact sheets: each battery's parade and each upgrade's hover view, levels 0 to 3 (shots/sheets)
node tools/rangetest.mjs                                      # the test range: every WW2 gun served in person fires, alone in the field; exits 1 on a failure
node tools/audiotest.mjs                                      # renders every sound bank offline and checks levels; exits 1 on a failure
node tools/shot.mjs "/?play=1&unit=1&quality=Low" shots/x.png --wait 4000   # headless capture (dev server must be running)
node tools/shot.mjs "/?mode=ww1&play=1" shots/x.png --lineup k38,hummel,m16   # the same in a career battle with that lineup (dev mode)
node tools/researchtest.mjs 1 2 3 --era de --lineup set:k38+hummel+wespe+nbw42+k5   # career battles with a named lineup (@3: every part at its top)
node tools/menushots.mjs [id ...]                               # the main menu's background stills, a gun of each kind firing (public/menu)
node tools/voicetest.mjs --op flanders --unit 1 --seconds 200  # the German crew voices in a battle (--op ridge: WW1), headless: the lines in order and their rules
node tools/perfwatch.mjs                                      # follows the frame recorder's newest session while you play: a line per spike or slow stretch
node tools/perfreport.mjs [session]                           # sums a recorded session (default perf/LATEST): frame times, spikes by cause, the worst
```

- **`simtest`** runs whole games on worker threads and prints win rates and per-game figures. Run it after changing the gun, shell, target or difficulty tables, the AI crews, the enemy or the director.
- **`leveltest`** measures length as a human would play it: `human` is the time to the main objectives done, plus X-Zeit's run when the mission has it (the all-auto crews wait two minutes before they end a battle). Run it after changing `threat.js`, `operation.js`, `sim/objectives.js`, the ridge's director, enemy or crews.
- **`cbtest`**'s `--policy`: `auto` (the default) the crews take cover by their own rule, `none` never, `cover` the old prototype's scripted rule.
- **`shot.mjs`** launches its own headless Chromium through `playwright-core` (Chromium from `~/.cache/ms-playwright`). Its other flags are `--size WxH`, `--until "expr"` (wait for a condition), `--eval "expr"` (run after the wait, result printed) and `--dev` (dev mode on, every battery open).
- **The frame recorder** (`src/perfrec.js`) runs on every game page the dev server serves (`?perf=0` turns it off; in the build it runs only for the players' lag reports, below, and writes nothing). It times each stage of the frame and writes the spikes, with the 2 seconds before them and what was happening, to `perf/<session>.jsonl` through the dev server; F3 shows the file. A gap of over half a second that is not a frame (a freeze over 2.5 s, or the window hidden) gets its own line saying which, so a freeze can be told from switching windows. Play, then run `perfreport` (or `perfwatch` while playing).
- **`menushots.mjs`** takes the main menu's background stills from the game itself: for each gun it opens the game page with every battery open, hides the console, puts the gun on auto, runs the battle on until it fires and captures the blast (the Karl-Gerät just before its shot, since its 60 cm blast buries the gun in dust; `--size WxH`, `--quality`, `--out`). Each run plays a new battle, so look at the pictures before keeping them.

## Crash and lag reports

Players' browsers send errors, lag spikes and frame-time metrics to Sentry (project `drumfire` in the `enveloperty` organization). How it works: DESIGN.md, "Crash and lag reports".

- **Settings.** `.env.local` (gitignored) holds `VITE_SENTRY_DSN` (without it a build sends nothing and shows no switch) and `SENTRY_AUTH_TOKEN` (an org token; with it `npm run build` uploads source maps and deletes them from `dist/`).
- **Not from here.** The dev server and the headless tools send nothing unless the URL has `?sentry=1`; `?sentry=0` stops reports anywhere.
- **Players' switch.** The menu footer's **Reports** button and the gear menu's "Send crash and lag reports".
- **Reading them.** With the Sentry CLI (`curl -fsSL https://cli.sentry.dev/install | bash`, then `sentry auth login`):

```bash
sentry issue list enveloperty/drumfire                    # errors and "Lag spike: <cause>" issues, most players first
sentry issue view DRUMFIRE-2 --json                       # one issue with its latest event (contexts lag, battle, events)
sentry explore enveloperty/drumfire --dataset metrics -m frame.p95 --agg avg -F gpu.name --period 7d   # frame times by GPU
sentry explore enveloperty/drumfire --dataset metrics -m session.start --period 7d                     # page loads
sentry explore enveloperty/drumfire --dataset metrics -m funnel.first_win --agg sum --period 7d        # the first run's funnel (first_battle, first_shot, first_hit, first_mission, first_win, second_battle)
sentry explore enveloperty/drumfire --dataset metrics -m battle.end --agg sum -F level --period 7d     # battles ended, by level (also won, end, minutes, first)
```

- **A spike's frames.** Each lag event carries `spike.jsonl`; download it from the issue and run `node tools/perfreport.mjs spike.jsonl`.

## URL parameters

A URL with `play`, `tutorial`, `sandbox` or `range` is a game page; anything else is the menu.

- **`?play=1`:** the 1917 battle straight away. With `mode=ww2&op=flanders|sevastopol|karl|v1|v2` or `mode=ww1&op=ridge|paris`, that battle or mission. An operation the career has not opened goes back to the menu.
- **`?campaign=<id>&play=1`:** a campaign mission, ids `earn-<kind>`: `earn-bl60`, `earn-bl92`, `earn-bl15`, `earn-rail`; with `mode=ww2`, `earn-sfh18`, `earn-nbw41`, `earn-k18`, `earn-mrs18`, `earn-karl`, `earn-gustav`, `earn-v1`, `earn-v2`.
- **`?tutorial=<id>`:** a lesson (see [Tutorials](PLAYING.md#tutorials)).
- **`?difficulty=Easy|Normal|Hard`** (default Normal), **`?quality=Low|Medium|High|Ultra`** (default Medium).
- **`?unit=N`:** start on the page's Nth unit (its key).
- **`?hour=H`:** fix the time of day (for example `5.25`); without it the sim's clock drives the sun.
- **`?weather=Clear|Overcast|Drizzle|Rain|Mist`** (default Overcast).
- **`?crew2=0`** keeps the old crew figures on a German page; **`?crew2=1`** asks for the lifelike crewmen on any page.
- **The career's open battle** (`?mode=ww1&play=1`): `&level=1` to `10` (default 1), `&seed=` (the mission's, as the menu deals it), `&mods=mist,air` (the modifiers), `&cb=old` (the old British counter-battery fire; the ranging model, their guns ranging in and U to take cover, is the default). A new career's first battle (level 1) has its guns standing loaded, and the coach on unless the basic training is finished.
- **`?range=1`:** the test range (with `mode=ww2|ww1` for the German eras): the era's map on the scripted range with one gun of one battery, nothing else in the sim or drawn. `&kind=<kind>` chooses the battery, `&lv=shells3.barrel1` sets its levels, `&perfect=1` no errors, `&endless=0` and `&invuln=0` turn those off, `&tab=targets|battery|debug` opens a tab. The card's Copy link writes these.
- **`?sandbox=1`:** test keys over the battle. B fires a blast of the selected unit's calibre and a fake shell that bursts 300 m ahead, N a 15-inch burst 300 m ahead, K a star shell, L a Very light, J an SOS rocket over the selected unit's front.
- **On the menu,** `?mode=ww1|ww2` opens that era, and `?sel=<key>`, `?op=<id>`, `?campaign=<id>` or `?lessons=1` select an entry or the Tutorials tab. The menu passes `quality`, `hour` and `weather` on to the game it opens.
- **Big Bertha:** `/bertha.html?play=1` (with `&station=cmd|trav|elev|load|fire`, `&assist=1`, `&quality=`), `?tutorial=1`, `?lang=en|de`.

## The debug handle

- **`window.__drumfire`** exposes every system (renderer, scene, camera, terrain, sim, audio, panel, the render layers and the rest) plus `select(i)`, `start()`, `setTimeScale`, `followShell`, `newestShell`, `sandboxBlast`, `sandboxBurst`, `frame(dt, draw)`, `hooks.<event>` (called after each sim event), `onFrame` (per-frame callbacks) and `state`.
- **Fast forward.** `__drumfire.fastForward(seconds, { unit, scale, settle })` stops the loop, runs the battle without drawing at `scale` (default 8) and draws a few frames, so a capture can jump into a raid. `unit` there is a 0-based index, while `?unit=N` counts from 1.
- **The test range.** On a range page `__drumfire.range` drives the card: `mission(targetId)`, `lay(targetId)`, `level(part, n)` (starts the range again), `__drumfire.man(i)` for the WW2 gunner, `set('perfect'|'invuln'|'endless', on)`, `hostile()`, `sos()`, `convoy()`, `train()`, `clear()`, `revive()`, `link()`. With `fastForward` that isolates one gun against one target, for example on `?range=1&kind=bl92`: `__drumfire.range.mission('M1'); __drumfire.sim.command(3, 'fire'); __drumfire.fastForward(60)` (`command` takes the unit id).
- **Lessons.** `__drumfire.tutorial.autoplaySync({ id })` plays a whole lesson without drawing and lists any step that stalled. The basic training: `/?mode=ww1&tutorial=training`, `autoplaySync({ id: 'training' })`; `node tools/trainingtest.mjs --jobs 4` plays it out of order at every step (early, late, the gun card followed instead, the gun left and manned again) and fails on any stuck step.
- **Big Bertha.** The demo's page has `window.__bertha`.

## Dev pages

On the dev server; the root pages are also in the build.

- **`/models.html?kind=bl15|bl92|bl6|bl60|rail|crew`:** the model viewer. The German kinds such as `lefh18`, `gustav` or `paris` work too. `&ortho=right|left|front|rear|top` gives blueprint views with a metre grid; `&shell=`, `&target=`, `&pose=`, `&anim=1` and more are listed at the top of `src/dev/modelviewer.js`.
- **`/ui.html?unit=ID&scn=ranging|sos|dead|night`:** the console against a mock world.
- **`/audio.html`:** audio smoke test, with buttons to hear every sound. The first click starts the audio; a few seconds later the guns built from recordings are in, and the "guns: recorded" button switches them with the synthesized ones to compare.
- **`/world.html`:** terrain and dressing.
- **`/fx.html`:** effects sandbox.

Page-local viewers (dev server only):

- **`/src/render/preview.html`:** a gun and its loading crew, step by step.
- **`/src/models/inf/preview.html`:** infantry.
- **`/src/models/t/preview.html`:** targets.
- **`/src/world/preview.html`:** dressing.
- **`/src/bertha/preview.html`:** the demo's howitzer.
- **The German guns** in `src/models/v/de/`: `heavy_preview.html?kind=gustav|karl|bertha`, `vpreview.html` for the V-weapons, `gamma_preview.html`, `max38_preview.html`, `paris_preview.html`, `k17_preview.html`, `ww1_field_preview.html`.
- **The 1918 British targets and aircraft** in `src/models/t/ww1/`: `preview.html`, `aircraft_preview.html`.
- **Clearance checks:** `/src/render/clipcheck.html`, `/src/render/crewcheck.html`, `gamma_clip.html` and `paris_clip.html` (in `src/models/v/de/`), and `/src/models/v/crew_motion.html`.
- **Crew drills:** `node tools/crewaudit.mjs lefh18,k18 --scn 0,1` runs `crewcheck.html` headless (any kind with a crew): clearance plus a motion audit per man (top speed, pace jumps, teleports, heading snaps, pose flicker, sliding feet, hands short of their grips); `--shots shell@0.5,ram@0.4 --cams "30,24,6" --out shots/x.png` saves a contact sheet.
- **Crew contacts:** the same run also checks what each hand and prop touches (`src/render/crewcontact.js`), which the motion audit cannot see because it measures a hand against the point the drill sent it to, never against the gun.
  - **Hands on nothing:** a hand meant to hold something (an IK grip, or a pose that holds a load, a staff, a rope or a handwheel) with no steel, prop or other man within a fist of it.
  - **Floating props:** a shell, cartridge, staff, rope, cart or sling that no hand, steel, ground, body or borne prop bears. A prop is what the crew code adds to the rig, plus what a model names `shell-` (its own drill props, which are not steel); an instanced mesh is measured instance by instance, in the props and in the steel.
  - **Bodies** (`src/render/crewbody.js`): a man must move as if he had bones and a body.
    - **Joints past their range:** an elbow or knee bent backwards or folded flat, a shoulder reaching behind the back, across it or twisted round (the forearm pointing where no forearm can), a wrist, hip, ankle, spine or neck beyond its range, in degrees past the limit. The limits are the clinical ranges, a little generous; every library pose passes them except the lanyard pose's right arm.
    - **Limbs through his own body:** a forearm or hand through his chest or head, the arms or the legs through each other.
    - **Into other men, the steel or the pit:** every part, the arms and hands too (the older clearance lines leave them out); a hand counts in the steel only when the whole fist is inside it. The carried shell into the steel counts here too.
  - **Reading it:** seconds and worst per thing, with the part anyone sees at a glance counted apart: a gap over 15 cm, an overlap over 8 cm, a joint 20 degrees past its limit; `--brief` leaves out the older lines.
  - **Pictures:** `--auto 10` draws each gun's ten worst moments, taken in turn from each kind of fault, from two sides, each ringed in red, into `shots/crewaudit-<kind>.png` (joints and limbs through the man's own body from 1.5 m, the rest from 2.6 m); a shot `t<seconds>:<x>:<y>:<z>[:<dist>]` looks at a given point.
  - **Baseline:** `node tools/crewaudit.mjs <every German kind> --scn 0 --json --brief > shots/crewaudit-new.json` takes about two minutes for all 18 drills (`lefh18,sfh18,k18,mrs18,nbw41,bertha,karl,k38,hummel,nbw42,sfh13,m16,k17,max38,gamma,fk16,k16,beta`; the cut batteries' `m99,rk92,sfh93,hm1,bruno,k5,k12,wespe,swg40` are dormant since 2026-11-26).
  - **After a crew change** (`src/render/crews*.js`, `crewspace.js`): compare with `shots/crewaudit-godotport.json` (local; `shots/` is gitignored), taken on 2026-11-25 with the spaced German drill. Seconds past a glance over all 27 drills: grip 205.1, props 7.7, hit 22.7, self 8.4, joints 6.5.
  - **Known regressions** of the spaced drill: props 0.8 s worse (loads shown a frame or three before the hands reach them); the Hummel layer's left hand reaches neither handwheel from his post (the post or the grips need moving in the model); Bertha's rammers 1.3 s worse.
- **The spaced German crews** (`src/render/crewspace.js`): `Man.hand` only asks; each man's place, gait and grips are settled after his drill. Read `m.sp.rawX`, `rawZ` and `rawH` for the drill's own place; `m.x` is where he is shown. DESIGN.md, "Crews".

## The lifelike crewmen

The German pages' crews are the Godot version's crew2 bodies, riding on the procedural drill (DESIGN.md, "Lifelike crewmen (crew2)").

- **Files.** `public/crew2/` is the Godot game's `assets/models/crew2`: six outfits (`crew2_<outfit>.glb`, each with its `.check.json`), the skeleton (`crew2.json`), the clips (`clips.json`) and three skin pictures. They are built by the Godot game's Blender scripts, and its `tools/blender/crew/README.md` is the contract for them.
- **Code.** `src/render/crew2/`: `index.js` (`Crew2`, loading, levels of detail, the per-frame sync), `animator.js`, `clips.js`, `limits.js`, `settle.js`, `feet.js`, `skeleton.js`, `pose.js`, `math.js`, each a port of the Godot class it names. Hooks: `models/v/crew.js` (`outfitName`, `armIk`, `reached`, `_poseT`), `render/guns.js` (`GunViews.crew2`) and `main.js` (the loading step and the gear switch).
- **Size.** About 41 MB in `public/crew2/`, which goes into `dist/`; a page loads only the outfits its crews wear (about 24 MB on a 1917 page).
- **Cost.** `__drumfire.renderLayer.guns.crew2.stats` gives the mean and worst milliseconds a frame and the men animated. Measured on 2026-11-25: +0.35 ms CPU a frame with a battery's crews in view (worst 1.5 ms).

## Reference method

- **Local only.** `refs/<group>/README.md` sheets (dimensions, profiles, feature checklists, a photo index with licences) and `refs/<group>/photos/` are gitignored and not part of the game. The photographs of the guns, the aircraft, the German side and the battlefield are mostly from Wikimedia Commons; their licences are listed in the sheets.
- **Model changes follow them.** Compare renders from `/models.html?kind=<kind>` with the photos from matching angles, check the `&ortho=` blueprint views against the dimension tables, and iterate with `tools/shot.mjs`.

## Status

**Playable now:**

- the 1917 British battle with its four-mission campaign and six lessons;
- the WW2 German Flanders battle, its four special-weapon operations, its eight-mission campaign and six lessons;
- the WW1 German open battle and the Paris Gun's mission;
- the Big Bertha demo with its tutorial (not in the menu: `/bertha.html`).

**Work in progress.** Two of these are playable but still being built, and marked WIP in the menu, on the loading screen and on the gun's name in the game: the Paris Gun's mission and the Big Bertha demo (no longer in the menu). The Gustav's mark came off on 2026-11-26.

**Checks.** Headless tools check the battles' balance, the campaigns' rules and the sound banks.

### Not done yet

- **Bed relaying.** Relaying Bertha's or the Gamma's bed is instant for now; the 100 s it took is to come back (`src/ww1/special.js`).
- **WW1 German lessons.** The era has none yet.
- **Progression playtesting.** The research pace, the upgrade costs and the campaigns' difficulty come from the headless auto crews and need human playtesting; the tests check the rules only ([PROGRESSION.md](PROGRESSION.md)).
- **The career and the threat levels.** Levels 6 to 10 on the WW2 map, tanks with the British attacks, the neighbouring Gruppe's fire, a scripted ridge player, playtesting the new pay, off-map support for the auto crews, the light guns' drill speed, air raids the player can answer, Britain's return: [PROGRESSION.md, "Still to do"](PROGRESSION.md#still-to-do).
- **The test range on the ridge.** It offers only the 1918 guns, not the WW2 ones the career can field there.
- **The consoles.** The Karl's and the Gustav's fire order card is squeezed under the procedure card at the smallest height, and the line-of-fire label on the board is not part of the label avoidance.
- **The hangar's dress.** On the battle page every crew dresses by its own gun's era; the hangar should be checked against the same rule.
- **Lifelike crewmen.** The gunner's eye at a gun is still the old figure's head, not the animator's.
- **Headless Chromium.** On 2026-10-28 the chromium-1247 build stopped drawing 2D canvases (a plain `fillRect` hangs), so every page looked frozen in the headless tools. Run them with `CHROME=chromium-1217` until it is reinstalled or the cause is found.
- **Planned for the WW2 mode**, not built yet ([WW2.md, "Planned improvements"](WW2.md#d-planned-improvements-not-built-yet)): short skill moments at the key steps of the V-1 and V-2 launches; shoot and scoot for the A4 (several firing points, the convoy driving between them); and the Karl's crew, who slide along in their standing poses while it drives between positions.
- **The Paris Gun's target effects.** Its effects on the railway junction, the tank depot and the reserve camp are written but inactive: they need the gun in the open battle, which no operation has. Only the aerodrome's (fewer raids on the gun) works.
- **Blast-flattened grass.** Grass flattened by a muzzle blast (`fx.onGust`) is written but not switched on.

## Layout

```
index.html           the main menu and the game page (src/boot.js picks which)
bertha.html          the Big Bertha demo
models.html, ui.html, audio.html, world.html, fx.html   dev pages
src/boot.js          the WebGL check (src/ui/gpu.js) before anything else loads, then menu or game: a URL with play, tutorial or sandbox is a game
src/menuItems.js     the menu's entries; src/ui/menu.js the menu (hangar, research, the mission dropdown), src/ui/hangar.js its 3D gun view, src/ui/loading.js the loading screen
src/progression.js, campaign-data.js, campaign.js   the career, the batteries and missions, the mission scenarios
src/threat.js, operation.js, capability.js, firstrun.js   the threat levels, the generated missions, what a lineup can do, the first run (the first battle, coach, funnel)
src/main.js          orchestration, settings (lil-gui), keys, frame order
src/sector.js        the world frame: units, trench lines, sectors, sites, places, grid references
src/sim/             the headless simulation (Node-safe, deterministic per seed); tables_ww2.js and tables_ww1.js hold the German rows
src/tutorial.js      the 1917 lessons and the lesson runner
src/ww2/             the WW2 German mode: operations, its sim modules, the special weapons, pictures, console words, lessons
src/ww1/             the WW1 German mode: operations, its sim modules, the 42 cm beds, the Paris Gun, pictures, console words
src/bertha/          the Big Bertha demo: game logic, gun, position, crew, overlay, tutorial, English and German text
src/render/          gun rigs posed from the sim, loading crews (British, German, V-weapons, 1918), shells, targets, infantry;
                     crewspace.js the German crews' spacing, crew2/ the lifelike crewmen
src/models/          procedural models: British guns (v/), German guns and sites (v/de/), targets (t/, t/ww2/, t/ww1/), infantry (inf/), shells, rig helpers
src/world/           trenches, wire, gun pits, rails, roads, ruins, built in tiles
src/terrain*.js, craters.js, trenchlines.js, vegetation.js, grass.js   ground
src/fx.js, src/fx/   particles and the artillery effects (rockets and missiles, the Paris Gun's blast); src/flares.js the pooled analytic lights
src/post.js          bloom, AO, god rays, lens, grades, shockwave, heat, dazzle; src/dynres.js dynamic resolution
src/atmosphere.js, clouds.js, weather.js, shaderlib.js, noise.js   sky, clouds, weather and the shader library
src/ui/              the fire control console (consoles/: the cards, the procedure cards, the launch console, the Paris Gun's cards), artillery board, message pad (mock.js for ui.html)
src/audio.js         the sound engine; public/audio holds the eight recordings (and voice-de/, the WW2 crew voices: src/ww2/voices.js)
src/camera.js, hud.js, presets.js, style.css
src/dev/             scripts behind the dev pages
tools/               simtest, ww2test, ww1test, berthatest, progressiontest, researchtest, leveltest, cbtest, rangetest, hangarsheet, audiotest, shot, menushots, voicetest;
                     make-voices.py and pick-voice-takes.py (the WW2 crew voices, docs/VOICES.md)
public/menu/         the main menu's background stills (tools/menushots.mjs)
public/crew2/        the lifelike crewmen's outfits, skeleton, clips and skin pictures (from the Godot version)
docs/                PLAYING.md (how to play, every key), MODELLED.md (rendering, simulation, sound), HISTORY.md (what is real), DEVELOPMENT.md (this page),
                     WW1.md and WW2.md (history, sources, departures), PROGRESSION.md (the campaign), VOICES.md (the crew voices), screenshot.jpg
refs/                local reference sheets and photographs (gitignored)
shots/               development captures (gitignored)
DESIGN.md            the contract between the modules, with a changelog
```

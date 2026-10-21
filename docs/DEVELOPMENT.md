# Development

Back to the [README](../README.md).

## Running it

```bash
npm install
npm run dev      # http://localhost:5201 (Vite runs with --host, so it is also reachable on the local network)
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle on http://localhost:4173
```

- **Browser.** A browser with WebGL2 is required.
- **Sharing.** Build the game and put the contents of `dist/` at the root of a web server.
- **Root only.** `vite.config.js` sets no `base`, so the bundle and the menu's links use absolute paths (`/assets/...`, `/bertha.html`). The build runs at the root of a site, as `npm run preview` serves it, but not from a subfolder (a GitHub Pages project page, itch.io) and not from `file://`.

## Tools

There are no unit tests, linter or formatter. These tools run the game's own code headless:

```bash
node tools/simtest.mjs 1 2 3 --both --quiet                   # 1917 battles: all-auto vs a scripted player
node tools/simtest.mjs 1 2 3 --all --difficulty all --table   # + a scripted player on all five units; --jobs N, --log
node tools/ww2test.mjs 1 2 3 --op all --difficulty all        # the WW2 operations with the auto crews; --log, --quiet
node tools/ww1test.mjs 1 2 3 --difficulty all --quiet         # the WW1 German battle and the Paris Gun's mission; --op, --player, --table, --jobs N
node tools/berthatest.mjs 1 2 3 --difficulty all              # Big Bertha demo games played by the crew logic; --log, --limit
node tools/progressiontest.mjs                                # the campaigns: any-order play, saves, rosters, targets, every victory path
node tools/audiotest.mjs                                      # renders every sound bank offline and checks levels; exits 1 on a failure
node tools/shot.mjs "/?play=1&unit=1&quality=Low" shots/x.png --wait 4000   # headless capture (dev server must be running)
node tools/menushots.mjs [id ...]                               # the main menu's background stills, a gun of each kind firing (public/menu)
```

- **`simtest`** runs whole games on worker threads and prints win rates and per-game figures. Run it after changing the gun, shell, target or difficulty tables, the AI crews, the enemy or the director.
- **`shot.mjs`** launches its own headless Chromium through `playwright-core` (Chromium from `~/.cache/ms-playwright`). Its other flags are `--size WxH`, `--until "expr"` (wait for a condition), `--eval "expr"` (run after the wait, result printed) and `--dev` (dev mode on, every battery open).
- **`menushots.mjs`** takes the main menu's background stills from the game itself: for each gun it opens the game page with every battery open, hides the console, puts the gun on auto, runs the battle on until it fires and captures the blast (`--size WxH`, `--quality`, `--out`). Each run plays a new battle, so look at the pictures before keeping them.

## URL parameters

A URL with `play`, `tutorial` or `sandbox` is a game page; anything else is the menu.

- **`?play=1`:** the 1917 battle straight away. With `mode=ww2&op=flanders|sevastopol|karl|v1|v2` or `mode=ww1&op=ridge|paris`, that battle or mission. An operation the career has not opened goes back to the menu.
- **`?campaign=<id>&play=1`:** a campaign mission, ids `earn-<kind>`: `earn-bl60`, `earn-bl92`, `earn-bl15`, `earn-rail`; with `mode=ww2`, `earn-sfh18`, `earn-nbw41`, `earn-k18`, `earn-mrs18`, `earn-karl`, `earn-gustav`, `earn-v1`, `earn-v2`.
- **`?tutorial=<id>`:** a lesson (see [Tutorials](PLAYING.md#tutorials)).
- **`?difficulty=Easy|Normal|Hard`** (default Normal), **`?quality=Low|Medium|High|Ultra`** (default Medium).
- **`?unit=N`:** start on the page's Nth unit (its key).
- **`?hour=H`:** fix the time of day (for example `5.25`); without it the sim's clock drives the sun.
- **`?weather=Clear|Overcast|Drizzle|Rain|Mist`** (default Overcast).
- **`?sandbox=1`:** test keys over the battle. B fires a blast of the selected unit's calibre and a fake shell that bursts 300 m ahead, N a 15-inch burst 300 m ahead, K a star shell, L a Very light, J an SOS rocket over the selected unit's front.
- **On the menu,** `?mode=ww1|ww2` opens that era, and `?sel=<key>`, `?op=<id>`, `?campaign=<id>` or `?lessons=1` select an entry or the Tutorials tab. The menu passes `quality`, `hour` and `weather` on to the game it opens.
- **Big Bertha:** `/bertha.html?play=1` (with `&station=cmd|trav|elev|load|fire`, `&assist=1`, `&quality=`), `?tutorial=1`, `?lang=en|de`.

## The debug handle

- **`window.__drumfire`** exposes every system (renderer, scene, camera, terrain, sim, audio, panel, the render layers and the rest) plus `select(i)`, `start()`, `setTimeScale`, `followShell`, `newestShell`, `sandboxBlast`, `sandboxBurst`, `frame(dt, draw)`, `hooks.<event>` (called after each sim event), `onFrame` (per-frame callbacks) and `state`.
- **Fast forward.** `__drumfire.fastForward(seconds, { unit, scale, settle })` stops the loop, runs the battle without drawing at `scale` (default 8) and draws a few frames, so a capture can jump into a raid. `unit` there is a 0-based index, while `?unit=N` counts from 1.
- **Lessons.** `__drumfire.tutorial.autoplaySync({ id })` plays a whole lesson without drawing and lists any step that stalled.
- **Big Bertha.** The demo's page has `window.__bertha`.

## Dev pages

On the dev server; the root pages are also in the build.

- **`/models.html?kind=bl15|bl92|bl6|bl60|rail|crew`:** the model viewer. The German kinds such as `lefh18`, `gustav` or `paris` work too. `&ortho=right|left|front|rear|top` gives blueprint views with a metre grid; `&shell=`, `&target=`, `&pose=`, `&anim=1` and more are listed at the top of `src/dev/modelviewer.js`.
- **`/ui.html?unit=ID&scn=ranging|sos|dead|night`:** the console against a mock world.
- **`/audio.html`:** audio smoke test.
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

## Reference method

- **Local only.** `refs/<group>/README.md` sheets (dimensions, profiles, feature checklists, a photo index with licences) and `refs/<group>/photos/` are gitignored and not part of the game. The photographs of the guns, the aircraft, the German side and the battlefield are mostly from Wikimedia Commons; their licences are listed in the sheets.
- **Model changes follow them.** Compare renders from `/models.html?kind=<kind>` with the photos from matching angles, check the `&ortho=` blueprint views against the dimension tables, and iterate with `tools/shot.mjs`.

## Status

**Playable now:**

- the 1917 British battle with its four-mission campaign and six lessons;
- the WW2 German Flanders battle, its four special-weapon operations, its eight-mission campaign and six lessons;
- the WW1 German open battle and the Paris Gun's mission;
- the Big Bertha demo with its tutorial.

**Work in progress.** Three of these are playable but still being built, and marked WIP in the menu, on the loading screen and on the gun's name in the game: the Gustav (its siege operation, its campaign mission and its lesson), the Paris Gun's mission and the Big Bertha demo.

**Checks.** Headless tools check the battles' balance, the campaigns' rules and the sound banks.

### Not done yet

- **Bed relaying.** Relaying Bertha's or the Gamma's bed is instant for now; the 100 s it took is to come back (`src/ww1/special.js`).
- **WW1 German lessons.** The era has none yet.
- **Campaign playtesting.** The campaigns' difficulty and mission pacing still need playtesting; the tests check the rules only ([PROGRESSION.md](PROGRESSION.md)).
- **Planned for the WW2 mode**, not built yet ([WW2.md, "Planned improvements"](WW2.md#d-planned-improvements-not-built-yet)): short skill moments at the key steps of the V-1 and V-2 launches; shoot and scoot for the A4 (several firing points, the convoy driving between them); and the Karl's crew, who slide along in their standing poses while it drives between positions.
- **The Paris Gun's target effects.** Its effects on the railway junction, the tank depot and the reserve camp are written but inactive: they need the gun in the open battle, which no operation has. Only the aerodrome's (fewer raids on the gun) works.
- **Blast-flattened grass.** Grass flattened by a muzzle blast (`fx.onGust`) is written but not switched on.

## Layout

```
index.html           the main menu and the game page (src/boot.js picks which)
bertha.html          the Big Bertha demo
models.html, ui.html, audio.html, world.html, fx.html   dev pages
src/boot.js          menu or game: a URL with play, tutorial or sandbox is a game
src/menuItems.js     the menu's entries; src/ui/menu.js the menu (DOM only), src/ui/loading.js the loading screen
src/progression.js, campaign-data.js, campaign.js   the career, the batteries and missions, the mission scenarios
src/main.js          orchestration, settings (lil-gui), keys, frame order
src/sector.js        the world frame: units, trench lines, sectors, sites, places, grid references
src/sim/             the headless simulation (Node-safe, deterministic per seed); tables_ww2.js and tables_ww1.js hold the German rows
src/tutorial.js      the 1917 lessons and the lesson runner
src/ww2/             the WW2 German mode: operations, its sim modules, the special weapons, pictures, console words, lessons
src/ww1/             the WW1 German mode: operations, its sim modules, the 42 cm beds, the Paris Gun, pictures, console words
src/bertha/          the Big Bertha demo: game logic, gun, position, crew, overlay, tutorial, English and German text
src/render/          gun rigs posed from the sim, loading crews (British, German, V-weapons, 1918), shells, targets, infantry
src/models/          procedural models: British guns (v/), German guns and sites (v/de/), targets (t/, t/ww2/, t/ww1/), infantry (inf/), shells, rig helpers
src/world/           trenches, wire, gun pits, rails, roads, ruins, built in tiles
src/terrain*.js, craters.js, trenchlines.js, vegetation.js, grass.js   ground
src/fx.js, src/fx/   particles and the artillery effects (rockets and missiles, the Paris Gun's blast); src/flares.js the pooled analytic lights
src/post.js          bloom, AO, god rays, lens, grades, shockwave, heat, dazzle; src/dynres.js dynamic resolution
src/atmosphere.js, clouds.js, weather.js, shaderlib.js, noise.js   sky, clouds, weather and the shader library
src/ui/              the fire control console (consoles/: the cards, the procedure cards, the launch console, the Paris Gun's cards), artillery board, message pad (mock.js for ui.html)
src/audio.js         the sound engine; public/audio holds the four recordings
src/camera.js, hud.js, presets.js, style.css
src/dev/             scripts behind the dev pages
tools/               simtest, ww2test, ww1test, berthatest, progressiontest, audiotest, shot, menushots
public/menu/         the main menu's background stills (tools/menushots.mjs)
docs/                PLAYING.md (how to play, every key), MODELLED.md (rendering, simulation, sound), HISTORY.md (what is real), DEVELOPMENT.md (this page),
                     WW1.md and WW2.md (history, sources, departures), PROGRESSION.md (the campaign), screenshot.jpg
refs/                local reference sheets and photographs (gitignored)
shots/               development captures (gitignored)
DESIGN.md            the contract between the modules, with a changelog
```

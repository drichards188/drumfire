# Drumfire: heavy artillery at Ypres, 1917 (design contract)

A three.js (WebGL2) game built from the MaxGFX framework (`../threejs-maxgfx`) and the Echelon air
defense game (`../threejs-iads`); both are READ ONLY from here, never write there. The player commands
a Heavy Artillery Group in the Ypres salient in autumn 1917: a 15-inch howitzer, a section of 9.2-inch
howitzers, a battery of 6-inch 26 cwt howitzers, a section of 60-pounders and an 18-inch railway gun (a what-if: see Changelog). Fire
missions come in from forward observers, aircraft and the sound rangers: hostile batteries, concrete
pillboxes, wire, ammunition dumps, a kite balloon, a railhead. The player lays the guns from the
artillery board, fires, reads the observers' fall-of-shot reports, corrects, and fires for effect,
while German counter-battery fire walks onto the gun positions and German infantry counter-attack
across no man's land under red SOS rockets.

**The goal is maximum cool factor: big guns, big explosions.** Enormous muzzle blasts that shove dust
rings across the ground and shake the camera, crews heaving 1,400 lb shells onto loading trays, shells
you can follow up through the clouds and down onto the target, earth geysers, shockwaves, craters that
stay, smoke columns, ammunition dumps cooking off in chains, night barrages that light the horizon.
When a choice is between subtle and spectacular, pick spectacular (but keep it physically plausible:
dirt and smoke move like dirt and smoke, light falls off, sound travels at 343 m/s).

**Screen:** the left half is a third-person 3D view of the selected unit (orbit with the mouse, zoom
with the wheel; F follows the unit's newest shell to its burst); the right half is the unit's fire
control console: the artillery board (a trench map with the grid), the fire order, the range table,
the observers' messages and the guns' state. Units not selected fight on their own (AI crews) in
whatever mode the player left them.

This file is the contract between the agents building the game in parallel. If you need to change a
shared interface, keep it backward compatible and note it in the "Changelog" at the end.

## Simulation fidelity

An arcade game with period flavour, not a gunnery simulator: generic game mechanics with gameplay
values. Shells fly a simple drag-and-gravity integration with game drag constants; range tables are
computed from that same integrator; errors are a per-gun calibration error, a daily wind and a random
dispersion; damage comes from a game table by calibre and target hardness. Period detail goes into
the look, the words and the procedure (yards, degrees and minutes, map squares, clock code), never
into weapons-effects modelling.

## Conventions

- Plain ES modules, no TypeScript, no framework, only `three` and `lil-gui` at runtime. Match the
  maxgfx/iads code style: 2-space indent, single quotes, semicolons, compact code, comments that
  explain why rather than what. No em dashes in prose or comments (use commas, colons, parentheses).
- Units: metres, seconds, radians internally. People see yards (`YARD = 0.9144`), degrees and minutes
  of arc, and map references; convert only at the display edge.
- World frame (`src/sector.js`): y up, origin at the centre of the Group's gun line, north is -Z,
  east is +X; the Germans are to the east. A bearing b at range r is `x = r sin b, z = -r cos b`
  (`fromBearing`, `bearingOf`, `headingFor`). `UNITS`, `LINES`, `SECTORS`, `SITES`, `PLACES`, `GROUND`,
  `ZONE`, `RAIL_SPUR`, `gridRef`/`fromGridRef`, `piecePlacements`, `flatPads` live there. Read it, never
  hard-code positions elsewhere. Changes to sector.js go through the lead (note them in the Changelog).
- Model space: front -Z (the muzzle points -Z at zero traverse and elevation), right +X, ground contact
  at y = 0, real-world size in metres. Headings are `rotation.y` (0 = facing north; `headingFor(b)`).
  Traverse is `rotation.y` of the traverse pivot relative to the platform (+ = left); elevation is
  `rotation.x` of the elevation pivot (+ = muzzle up); recoil is `position.z` of the recoil pivot
  (+ = back toward the breech).
- Every system is a class with `update(dt, ...)`. Cross-system effects go through callbacks wired in
  `main.js` (the maxgfx pattern), never by importing another system's state.
- The sim (`src/sim/`) is Node-safe (no DOM, no three) and deterministic per seed: randomness from
  `sim.rng`, never `Math.random`.
- Dev server: `http://localhost:5201` (already running; do not start another on 5201. If it is down,
  start it with `npx vite --port 5201 --host` in the background from the project root).
- Screenshots and console errors: `node tools/shot.mjs <path> <out.png> [--size 1600x900] [--wait ms]
  [--until "expr"] [--eval "expr"]`. Each call launches its own headless Chromium (SwiftShader WebGL2,
  slow but correct), so agents never share a browser. Do NOT use the Playwright MCP browser tools.
  Put screenshots in `shots/` (gitignored) under a subfolder named after your role. Look at them
  with the Read tool, and actually judge them: compare against the reference photos in `refs/`.
- Reference sheets and photos for the guns, the German side, the battlefield and the procedure are
  being written to `refs/<group>/README.md` and `refs/<group>/photos/` (gitignored, local only).
- Never commit to git. Never edit files another agent owns; ask for changes in your final report.

## Where the framework comes from

Copied already (lead): `noise.js`, `shaderlib.js` (identical in both projects), iads `atmosphere.js`,
`clouds.js`, `weather.js`, `post.js`, `fx.js`, `camera.js`, `terrain.js`, `terrainHeight.js` (now
reading `flatPads` from `sector.js`), `terrainField.js`, `vegetation.js`, `grass.js`, `hud.js`,
`sight.js`, `style.css`, `sim/flight.js`, `models/kit.js`, `models/rig.js` (without the MZKT truck),
`models/v/crew.js`, `models/v/swap.js`; maxgfx `flares.js` (parachute flares as analytic lights
through `globalUniforms.uFlarePos/uFlareCol/uFlareCount`, still reading `ocean.heightAt`), and both
`ballistics.js` versions side by side as `ballistics.maxgfx.js` and `ballistics.iads.js` (reference
for the sim; the sim agent writes its own and deletes them). `public/audio/` has the iads recordings
(`CREDITS.md`). `tools/shot.mjs` points at port 5201.

Worth taking from maxgfx (read only): `gunner.js` camera trauma shake (`shake(k)`, the noise at
~606-620) and `main.js` `blastNear` (~267-275); `audio.js` `sixteenInch` bank (~396), `thunder()`,
`whistle()`, `explosion`; `models/runners.js` (instanced articulated crowd with gaits: infantry);
`models/guns.js` `createMountMaterial` (painted steel shader) and `buildSailor`/`CREW_POSES`;
`ordnance.js` (falling-ordnance whistle and near-miss events); `ocean.js` `FoamMap` (a camera-centred
world-space render target with decay and stamping, the pattern for a scorch/crater map).

## File ownership (phase 1, agents in parallel)

| Agent | Owns (create/edit only these) |
|---|---|
| Framework | `index.html`, `src/style.css`, `src/main.js`, `src/shaderlib.js`, `src/noise.js`, `src/atmosphere.js`, `src/clouds.js`, `src/weather.js`, `src/camera.js`, `src/hud.js`, `src/sight.js`, `src/flares.js` |
| Terrain | `src/terrain.js`, `src/terrainHeight.js`, `src/terrainField.js`, `src/trenchlines.js`, `src/vegetation.js`, `src/grass.js`, `src/craters.js`, `world.html`, `src/dev/worldview.js` |
| Dressing | `src/world/*` (trench walls and sandbags, wire, ruins of Ypres and the villages, gun pits and battery positions, roads, duckboards, the rail spur track, camouflage nets) |
| Heavy models | `src/models/kit.js`, `src/models/rig.js`, `src/models/guns.js`, `src/models/v/bl15.js`, `src/models/v/bl92.js`, `src/models/v/rail.js`, `src/models/v/crew.js`, `src/models/v/swap.js`, `models.html`, `src/dev/modelviewer.js` |
| Field models | `src/models/v/bl6.js`, `src/models/v/bl60.js`, `src/models/targets.js`, `src/models/t/*`, `src/models/shells.js` (reads kit.js, rig.js and crew.js, never edits them) |
| Infantry | `src/models/infantry.js`, `src/models/inf/*` (reads kit.js, never edits it) |
| Simulation | `src/sim/*`, `src/ballistics*.js`, `tools/simtest.mjs` |
| FX | `src/fx.js`, `src/fx/*`, `src/post.js`, `fx.html`, `src/dev/fxtest.js` |
| UI | `src/ui/*`, `ui.html` |
| Audio | `src/audio.js`, `public/audio/*`, `audio.html`, `src/dev/audiotest.js`, `tools/audiotest.mjs` |

The world agents' viewer `world.html` belongs to the terrain agent; the dressing agent adds its
builders to the scene through `src/world/index.js` (`buildWorld(scene, terrain) -> { update(dt, camera) }`),
which `worldview.js` and `main.js` import if it exists.

Phase 2 (after the above): `src/render/*` (gun rigs posed from the sim, the loading choreography,
shells, targets, infantry), the full wiring in `src/main.js`, the title-screen attract battle,
`README.md`, `CLAUDE.md`, balance passes.

## Module contracts

### Terrain and world (`src/terrain*.js`, `src/world/*`, `src/craters.js`, world agent)

```js
import { Terrain, heightAt, normalAt, los } from './terrain.js';
heightAt(x, z)          // pure, Node-safe, static ground (the sim uses it); includes trenches' cut, pads, old craters
const terrain = new Terrain(scene, { quality });
terrain.heightAt(x, z)  // rendered ground: heightAt plus the runtime craters
terrain.normalAt(x, z, out); terrain.los(ax, ay, az, bx, by, bz);
terrain.groundAt(x, z)  // 'mud' | 'water' | 'grass' | 'road' | 'concrete' | 'rubble' (for burst fx and sound)
terrain.update(camera)  // recentres camera-following geometry
terrain.setQuality(name)
import { Craters } from './craters.js';
const craters = new Craters(terrain, { quality });   // or owned by Terrain as terrain.craters
craters.add(x, z, radius, depth, { scorch = 1, water = false })  // a new crater, visible at once
```

The Ypres salient as the period photographs show it: flat, low Flanders ground on the British side
(fields, hedges, poplar rows, farms, the ruins of Ypres), turning through the devastated zone (`ZONE`)
into a lunar wilderness of overlapping shell holes, many flooded with grey-brown water, liquid mud,
shattered tree stumps (Polygon Wood, Sanctuary Wood), ruined villages as heaps of brick (`PLACES`),
duckboard tracks and plank roads, and the trench lines (`LINES`): zig-zag fire trenches with
traverses, sandbag parapets, communication trenches back, belts of barbed wire in front of the German
line, and German concrete pillboxes. The German side rises gently to the ridges (`GROUND`). Behind
the German lines the country recovers (less cratered) toward the railhead. Old craters are part of the
pure `heightAt` (deterministic cellular pattern) so sim and render agree; runtime craters from this
battle are visual only (plus `terrain.heightAt`). Craters by calibre (game values): 18-pdr 1.5 m
radius, 60-pdr 2 m, 6-inch 3 m, 9.2-inch 5 m, 15-inch 8 m, 18-inch 10 m; depth about 0.4 times the
radius; craters on wet ground fill with water over time. Readable to ~25 km through haze.

### Camera (`src/camera.js`, framework)

`ChaseCamera(camera, dom, { ground })` as in iads (orbit, zoom 6 to 250 m here, `setTarget`,
`padlock`, `follow(obj, onEnd)`, `cine(on)`, `free(on)`), plus:
`chase.shake(trauma)` (maxgfx gunner trauma model: adds trauma 0..1, squared to amplitude, decays,
noise-driven yaw/pitch/roll and a little position; main converts a blast into trauma from calibre and
distance), and `chase.followShell(shell, { onBurst })` (rides behind and above the shell, looks along
its velocity, lets the player orbit, on burst holds a wide shot of the burst for ~4 s, then returns).
`shell` is a sim shell object (fields below); it can be read every frame, its `alive` drops at burst.

### Models (`src/models/`, heavy models and field models agents)

```js
import { buildGun, GUN_KINDS } from './models/guns.js';   // GUN_KINDS = ['bl15', 'bl92', 'bl6', 'bl60', 'rail']
const rig = buildGun(kind);
rig.root          // THREE.Group in model space (front -Z, ground y = 0, metres)
rig.pivots        // { traverse, elevation, recoil, breech, ... } (traverse may be absent; extras below)
rig.anchors       // { eye, muzzle, breech, tray, shellStack, crew: [{ role, x, y, z, heading, pose }] }
                  // muzzle: its -Z is the bore direction; breech: where the shell goes in;
                  // tray: where a shell rests before ramming; shellStack: the ready ammunition
rig.recoilLength  // metres the barrel runs back
rig.loadEl        // elevation the piece must come down to for loading (radians; heavies load low)
rig.setBreech(k)  // 0 closed, 1 open
rig.setShell(where, visible)  // where: 'tray' | 'crane' | 'hoist': show the shell being loaded there
rig.boxes         // [{ min, max }] hit boxes, model space
rig.update?(dt)   // optional per-frame animation the model owns (e.g. wheel spin)
```

Extra pivots by kind: `bl15` `crane` (the shell crane jib: rotation.y) and `hoist` (position.y of the
hook); `rail` `car` (the whole car, position.z 0 to +`rig.carRoll` 6 m: the roll-back after a shot;
`rig.setCar(z)` also turns the wheelsets), `traverse` (the turntable under the mounting and the loading
stage, pivot 0.8 m forward of the car's middle), `crane` and `hoist` (the lattice shell hoist, as the 15-inch's;
no trolley or bridge any more), `bogies` (the wheelsets). Crew spots with `car: true` ride the car. Pieces sit on their platforms: `bl15` the steel bed/earth box, `bl92` the earth
box with its ballast, `bl6` wheels with the box trail, `bl60` wheels and trail, `rail` the railway
mounting on bogies (on standard-gauge track, the track itself is the world's `RAIL_SPUR`, 22 m car plus 6 m of roll-back on a 60 m pad).

```js
import { buildCrewman, CREW_POSES, CREW_OUTFITS } from './models/v/crew.js';
// WW1 outfits: 'gunner' (shirt sleeves, braces, Brodie helmet or cap), 'gunner-tunic', 'officer'
// (Sam Browne, cap or helmet), 'german' (field grey, Stahlhelm), 'stretcher'. Poses for the loading
// choreography: 'stand', 'carry', 'haul' (on a rope), 'ram' (rammer staff), 'lay' (at the dial sight),
// 'lanyard', 'crouch', 'ears' (covering ears), 'point', 'phone', 'dead'.
import { buildShell, SHELL_KINDS } from './models/shells.js';
buildShell(kind)  // { parts: [{ geometry, material }], length, radius } one merged geometry per material, for instancing
                  // kinds: 'bl15' | 'bl92' | 'bl6' | 'bl60' | 'rail' | 'fh15' | 'm21' | 'fk77' (German 15 cm, 21 cm, 7.7 cm)
import { buildTarget } from './models/targets.js';
buildTarget(kind) // kind from sector SITES: 'battery' | 'mebu' | 'dump' | 'balloon' | 'hq' | 'crossroads' | 'railyard'
                  // -> { root, parts: [Object3D], setDamage(i, k), anchors: { ... } }
                  // parts are the destroyable bits (each gun of a battery, each stack of a dump, each wagon)
import { Infantry } from './models/infantry.js';
const inf = new Infantry(scene, { max: 1500 });   // instanced soldiers (port of maxgfx runners.js)
inf.update(dt, groups, heightAt)  // groups: sim.infantry (below); men fall when `alive` drops
```

All procedural, detailed enough for a close third-person view of the gun and its crew (the guns are
the stars: get the silhouettes, proportions, and the big distinctive parts right from `refs/`).
Materials from `MeshStandardMaterial` (camo, wear and mud via canvas textures and `surfaceFinish`).
British guns are painted in a dull grey-green or khaki; many 1917 guns carried a disruptive camouflage
of earth colours. Nets and brushwood screens are the world agent's (gun pit dressing).

### Simulation (`src/sim/`, simulation agent)

```js
import { Sim } from './sim/sim.js';
const sim = new Sim({ heightAt, seed: 1 });
sim.events = {                         // all optional; called with optional chaining
  fire(unit, piece, shell),            // a gun fired: muzzle blast, recoil, sound, camera trauma
  load(unit, piece, step),             // a loading step began (see GUNS[kind].load): sound, choreography
  shellBurst(shell, pos, info),        // any burst, own or enemy. info = { calibre (inches), fuze,
                                       //   crater (radius m, 0 for airbursts), ground, hit (target id|null),
                                       //   near: { unitId, piece } | null, own: bool }
  incoming(shell),                     // an enemy shell will land within ~400 m of one of our pieces (~4 s before)
  targetHit(target, part, dmg), targetDestroyed(target, by),   // by = unitId or null
  secondary(pos, size),                // ammunition cooking off (dump, battery pit, our own shell stack): 0.5 to 4
  pieceHit(unit, piece), pieceDestroyed(unit, piece), casualty(unit, piece),
  report(mission, report),             // an observer's fall-of-shot report arrived
  mission(mission, change),            // 'new' | 'assigned' | 'ranging' | 'ffe' | 'done' | 'failed'
  sos(sector),                         // red rockets over a sector of the front
  flare(pos, kind),                    // 'very' (white), 'sos' (red), 'star' (star shell over no man's land)
  radio(text, kind),                   // 'info' | 'warn' | 'alert' | 'kill' | 'phone' | 'wireless'
  phase(n, title, sub), state(state),  // director
};
sim.newGame({ difficulty: 'Normal', attract: false, seed });
sim.update(dt);                        // dt already scaled by the time compression
sim.command(unitId, name, args);       // see Commands
sim.units; sim.targets; sim.shells; sim.missions; sim.infantry; sim.state; sim.phase; sim.score;
sim.time;                              // seconds since the start
sim.clock;                             // hour of day (5.25 = 05:15), drives the sun (main)
sim.wind;                              // { bearing, speed } the day's meteor telegram (it shifts the fall of shot)
sim.front;                             // { A: 1, B: 1, C: 1, D: 1 } holding strength per SECTORS id, 0 = lost
sim.rangeTable(kind, charge);          // [{ range, el, tof, apex }] from the game integrator, every 100 yards
sim.solve(unitId, x, z, charge?);      // { line, range, el, tof, charge } nominal laying for a point (no errors)
sim.unitById(id); sim.targetById(id); sim.missionById(id);
sim.alpha;                             // 0..1, how far the real time is into the next fixed step (render interpolation)
```

**Unit** (`sim.units[i]`, plain data read by the UI and the render layer):
```js
{ id, kind, name, callsign, battery, pos: { x, y, z }, zero, alive,
  mode: 'auto' | 'manual' | 'hold',     // auto: the AI crew takes missions; manual: player; hold: cease fire
  pieces: [Piece], missionId, ammo: { he, shrapnel }, signature,  // 0..1, how much the enemy has located it
  order: { x, z, line, range, charge, el, tof, fuze: 'instant' | 'delay' | 'shrapnel', rounds,
           adj: { add, right }, target: { x, z } | null },  // the current fire order (adj in metres)
  stats: { rounds, hits, kills } }
```
**Piece** (one gun): `{ i, kind, pos: { x, y, z }, bearing (platform), az, el, cmd: { az, el },
state: 'idle' | 'loading' | 'laying' | 'ready' | 'recoil' | 'dead', job: { step, t, dur } | null,
recoil (0..1 of the stroke), breech (0..1 open), loaded, crew, crewMax, hp, maxHp, wear, firedAt }`.
`az` follows the model convention (rotation.y of the traverse pivot, + = left of the platform bearing).
The loading cycle is a sequence of steps from `GUNS[kind].load` (for the heavies: `'depress'` to
`rig.loadEl`, `'open'` breech, `'shell'` carried or craned onto the tray, `'ram'`, `'cartridge'` (bags),
`'close'`, `'prime'`, `'lay'` back to the ordered elevation and line, then `'ready'`), each with a game
duration; the render layer animates crew and rig from `piece.job` and the sim drives `piece.az/el`.

**Shell** (`sim.shells`, own and enemy, in flight): `{ id, own, unitId, piece, kind, calibre, pos: { x,
y, z }, prev: { x, y, z }, vel: { x, y, z }, fuze, t, tof, aim: { x, z }, alive }`. Integrated by the sim
(gravity plus the kind's game drag); the render interpolates from `prev` to `pos`.

**Target** (`sim.targets`): `{ id, kind, name, pos: { x, y, z }, bearing, r, alive, known, active, hp,
maxHp, parts: [{ x, z, hp, alive }], damage }`, spawned from `SITES` plus mobile ones (traffic at the
crossroads at night, trains at the railhead). `known` targets are drawn on the board.

**Infantry** (`sim.infantry`): `[{ id, side: 'german' | 'british', sector, state: 'forming' | 'advancing'
| 'assault' | 'broken' | 'in', pos: { x, z }, bearing, n0, men: [{ dx, dz, alive, t }] }]`.

**Mission** (`sim.missions`): `{ id, kind: 'cb' | 'destroy' | 'wire' | 'sos' | 'harass' | 'barrage',
title, targetId, x, z, gridRef, observer: 'foo' | 'air' | 'balloon' | 'sound' | 'map', priority,
t0, deadline, unitId, state: 'open' | 'ranging' | 'ffe' | 'done' | 'failed', reports: [Report] }`.
**Report**: `{ t, missionId, unitId, shellId, over (m, + = beyond the target along the line of fire),
right (m, + = right of the line of fire), clock ('B3' style, for aircraft), text (the message as the
observer would send it, in yards), ok }`. FOOs telephone add/drop and left/right in yards; aircraft
send the RFC clock code (Y 10, Z 25, A 50, B 100, C 200, D 300, E 400, F 500 yards; 12 o'clock is
true north from the target); sound rangers give a map reference with an error; map shoots get no
reports. Reports arrive a few seconds after the burst.

**Commands** (`sim.command(unitId, name, args)`, also what the console sends):
| name | args | effect |
|---|---|---|
| `mission` | `{ id }` | take the mission: lay on its point, ranging fire |
| `lay` | `{ x, z }` | lay on a map point (artillery board click) |
| `correct` | `{ add, right }` | metres: add > 0 adds range, right > 0 shifts right of the line of fire |
| `charge` | `{ charge }` | charge index |
| `fuze` | `{ fuze }` | 'instant' (106), 'delay', 'shrapnel' (60-pdr only) |
| `rounds` | `{ n }` | rounds per piece to fire on the next `fire` (1 ranging, 2 to 8 for effect) |
| `fire` | `{ guns? }` | start the series. `guns` (optional) picks the pieces: 1, 2 or `'all'` (most ready first, then loaded, then the rest, in gun order, so 1 is No. 1 unless it is down or busy; `pickGuns(u, guns)` in `guns.js`), or a list of piece indices; false when none can fire. Without it: the ready pieces, except that `rounds 1` on a mission in 'ranging' fires the lead piece alone (what the AI crews send) |
| `cease` | `{}` | stop firing |
| `mode` | `{ mode }` | 'auto', 'manual', 'hold' |
| `sos` | `{ sector }` | every unit lays on that sector's SOS line and fires (unit id ignored) |

Tables (`src/sim/tables.js`): `GUNS[kind]` (name, calibre, shell mass, charges with muzzle velocities,
elevation limits, traverse limits, lay rates, loading steps and durations, crew, hp, dispersion,
calibration error, ammo), `SHELLS[kind]` (game drag, crater radius, blast and lethal radii, damage by
hardness), `TARGETS[kind]`, `DIFFICULTY` ('Easy' | 'Normal' | 'Hard'). Gameplay values: maximum
ranges about 60-pdr 11 km, 6-inch 9.5 km, 9.2-inch 11.5 km, 15-inch 9.5 km, 18-inch railway gun 20 km (charge 3, 570 m/s, 40 degrees, game drag cd 0.32);
times of flight 15 to 45 s; loading cycles 60-pdr ~10 s, 6-inch ~12 s, 9.2-inch ~25 s, 15-inch
~50 s, 18-inch railway gun ~90 s (steps depress 7, open 6, shell 24, ram 13, cartridge 18, close 5, prime 4, lay 11). The first round of a fresh lay lands 50 to 400 m off; good corrections
get within ~30 m in two or three rounds.

Director (`src/sim/director.js`): phases with a game clock: dawn registration (a quiet start, a few
missions that teach the loop), the bombardment (pillboxes, batteries, dumps, the balloon, German
counter-battery fire on our positions), the counter-attack (SOS in two sectors while the CB fire
continues), night harassing fire (crossroads traffic, the railhead for the railway gun, star shells)
and, if time allows, Zero hour (a creeping barrage the British infantry follow). Loss: two front
sectors lost, or every piece destroyed. AI crews are tuned to be imperfect so the player matters:
`tools/simtest.mjs` runs headless battles (all-auto vs a scripted player) and prints a table.
Attract mode (title screen): a demonstration bombardment, nothing scored, nothing of ours destroyed.

### FX (`src/fx.js`, `src/fx/*`, `src/post.js`, FX agent)

iads `FX` stays the base (smoke/glow/debris/shard pools, fixed light pool, `explosion`, `dust`, `fire`,
`burnSite`, `fx.ground`), extended with the artillery set:
```js
fx.gunBlast(p, dir, calibre, { night })   // muzzle fireball and flame tongue, the blast cone of smoke and
                                          // dust, a ground dust ring racing out, leaves/grit, smoke ring,
                                          // a lingering cordite cloud that drifts with the wind, light flash
fx.shellBurst(p, { calibre, fuze, ground, crater })  // the earth geyser (a column of black earth and
                                          // mud thrown 20 to 120 m up by calibre that falls back), clods and
                                          // debris on ballistic arcs, the flash and fireball (brief, it is HE
                                          // in earth), shockwave dust ring, white/black smoke that rises and
                                          // drifts, water spout on 'water', brick dust on 'rubble'
fx.shrapnel(p, calibre)                   // the white woolly airburst ball with its downward cone
fx.cookOff(p, size)                       // ammunition dump: fireball, rolling mushroom, flying burning
                                          // rounds (glow trails), follow-up pops over several seconds
fx.burnSite(p, size, life)                // ground fire with smoke column (iads)
fx.update(dt, camera, light)              // as iads
post.shockwave(worldPos, { radius, speed, strength })  // screen-space refraction ring (camera near blasts)
```
Brief analytic lights: night battles need far more than the 4 pooled PointLights. `shaderlib.js`
`MAX_FLARE_LIGHTS` becomes 16 (framework agent; every shader that loops over `uFlarePos` must use the
constant), and `flares.js` owns them: `flares.flash(pos, color, intensity, life)` adds a brief light
(muzzle flash, burst, cook-off) next to the parachute flares and star shells, and each frame the
brightest 16 as seen from the camera fill the uniforms. FX never touches the uniforms: it calls the
optional hook `fx.onFlash?.(pos, color, intensity, life)` which main wires to `flares.flash`.
`post.dazzle(k)` (FX agent) is a brief exposure kick for a blast near the camera (auto exposure is a
log average and barely moves for a flash).

Plus anything else that sells it (heat shimmer over the muzzle, sparks, falling dirt rain). Budgets
scale with `setBudget(q.fx)`; nothing may allocate per frame. Never add or remove three.js lights at
runtime (fixed pool).

### UI (`src/ui/`, UI agent)

`Panel(root, { audio, onSelect, onCommand })`, `panel.update(view)`, as in iads: it reads only what is
passed in and talks back through `onSelect(unitId)` and `onCommand(unitId, name, args)`. `view` is
`{ sim, selectedId }` where `sim` is the Sim (or the mock) with the fields above (`units`, `missions`,
`targets`, `shells`, `reports`, `clock`, `wind`, `front`, `rangeTable`, `solve`, `state`, `score`).
`ui.html` runs the panel against `src/ui/mock.js` (a mock world with the same shape) so it can be built
without the 3D view. The console is a period fire control board, not a modern display: a linen-backed
trench map (the artillery board) drawn on a canvas with the lettered and numbered squares, British
trenches blue and German red, woods and villages, the known targets, the arc of fire and the line to
the target, the fall of shot plotted with numbers, the SOS lines; the fire order card (target ref,
line in degrees and minutes, range in yards, charge, elevation from the range table, fuze, rounds);
the range table; the message pad (telephone and wireless messages as written slips); the guns' state
(loading step, crew, wear, ammunition); the missions list. Keys: Tab next mission, Enter take it,
Space fire, G guns (1 GUN, SECTION, BATTERY), arrows correct (up/down add/drop, left/right line), Q/E charge, R rounds, Z fuze, A mode
(auto/manual), S SOS. Main owns 1 to 5, C, F, M, H, F3, `[` and `]`.

### Audio (`src/audio.js`, audio agent)

`AudioEngine` as in iads (banks rendered at `start()` after a user gesture, recordings layered when
decoded, world sounds routed with travel delay at 343 m/s, distance low-pass and air absorption,
Doppler on moving loops), with the artillery set:
```js
audio.gun(pos, calibre)               // muzzle blast: near a 15-inch it is a physical slam with sub-bass and
                                      // a long rolling echo; far guns a deep thud; the 60-pdr a sharp crack
audio.burst(pos, calibre, { fuze, ground })   // explosion near (crack, roar, debris patter) and far (rumble)
audio.shell(shell)                    // a flight voice bound to a sim shell: tearing-canvas rush and whistle
                                      // with Doppler, the "freight train" of the 15-inch; stops at burst
audio.incoming(shell)                 // the rising scream of an enemy shell coming down near the listener
audio.cookOff(pos, size)
audio.load(step, pos, kind)           // trolley rattle, crane chain, rammer thump, breech screw and clang, "Ready!"
audio.flare(pos, kind)                // Very pistol pop, hiss
audio.ui(name)                        // 'phone' buzzer, 'wireless' morse, 'click', 'paper', 'bell', 'whistle'
audio.setAmbience({ drumfire, rain, wind })   // distant drumfire bed: continuous rumble with flickers
audio.update(dt, camera)
```

### Main (`src/main.js`, framework agent in phase 1, wiring in phase 2)

As iads: `init()` builds atmosphere, terrain, clouds, fx, flares, weather, the `Sim`, views, post,
the chase camera, audio and the panel; the frame loop steps the sim with `dt` scaled by
`params.timeScale` and everything visual with `rawDt`. `params` is the single source of truth for
settings (lil-gui behind the gear button); `QUALITY` presets (Low/Medium/High/Ultra) set pixel ratio,
shadow map, AO, samples and the fx budget. `window.__drumfire` exposes every system, `frame(dt, draw)`
and `fastForward(seconds, { unit, scale })`. URL params `?quality=`, `?play=1`, `?unit=N`. Title
screen with the attract-mode battle behind it; "Take command" starts `sim.newGame`.

## Simulation details (sim agent)

Files: `src/sim/sim.js` (Sim, commands, shell stepping), `tables.js` (GUNS, SHELLS, FUZE, TARGETS, FFE, DIFFICULTY,
CLOCK_KEYS, PHASES), `shells.js` (integrator, `rangeTable`, `solveElevation`, `autoCharge`), `guns.js` (units, pieces,
orders, loading cycle, shot), `targets.js`, `observers.js`, `enemy.js`, `infantry.js`, `crews.js` (AI), `director.js`.

Conventions as implemented:
- `unit.order`: `x,z` the corrected aim point, `target` the uncorrected point, `line` (rad bearing), `range` (m), `el` (rad,
  laid with the site correction from the integrator, not the flat table), `tof`, `charge` (index, -1 none), `fuze`, `rounds`,
  `adj {add,right}` (m), plus `ok`/`reason` ('out of range', 'inside minimum range', 'out of arc'), `chargeAuto`, `h`
  (burst height above ground for the balloon), `sheaf`, `shift`. `unit.charges` (count), `unit.arc` (half angle, rad).
- `rangeTable(kind, charge)` rows `{ range (m), el (rad), tof, apex }` every 100 yards on the rising branch; `[]` for a charge
  the gun does not have. `solve(unitId, x, z, charge?)` -> `{ line, range, el, tof, charge, ok }`.
- `sim.wind = { bearing (rad, blowing FROM), speed (m/s), wx, wz }`. `sim.state`: 'attract' | 'playing' | 'victory' | 'defeat'.
  `sim.night` (bool), `sim.clock` hour of day (a time lapse: dawn 04:45 at t=0, 06:12 at 330 s, 14:30 at 900 s, 19:30 at 1300 s,
  05:06 next morning at 1850 s, 06:42 at 2300 s), `sim.reports`, `sim.assaults`, `sim.barrage`, `sim.stats`.
- Pieces: `job = { step, t, dur, i, n }` while loading (steps from `GUNS[kind].load`, an array of `{ step, dur }`; heavies start
  with 'depress' to `GUNS.loadEl`); `job` is null when `state` is 'ready' (the 'ready' load event is emitted). A re-lay of a
  loaded piece is `state: 'laying'` with `job.step 'lay'`. `piece.loaded` turns true when the round is rammed. `recoil` 0..1 (kick in
  0.18 s, run out over `GUNS.runout`), `breech` 0..1. `piece.rounds` is the rounds left in the series.
- Commands: besides the table above, any of mission/lay/correct/charge/fuze/rounds/fire from the player switches an 'auto' unit to
  'manual' (the AI would otherwise undo it). `fire` returns false when the order is not laid-able. `sos` ignores the unit id; a
  unit that cannot reach the line (range or arc) is left alone. Ranging: with `rounds 1` on a mission in state 'ranging' and no `guns`,
  only the lead piece fires; `rounds > 1` fires every piece (and moves the mission to 'ffe'). The console always sends `guns` for units
  with more than one piece (selector `memo.guns`: '1', '2' or 'all'): it sits on 1 GUN while ranging or with no task and goes to all guns
  when the mission is 'ffe', a report says on target or ROUNDS is above 1, and the player can override it until one of those changes.
- Reports: `mission.reports[]` (also `sim.reports`): `{ t, missionId, unitId, shellId, n, observer, observed, over, right, clock, text,
  ok, corr: { add, right } }`. `over`/`right` are the OBSERVER's estimate (m; air reports are quantised to the circle and hour),
  `corr` is what to apply with `correct`. Reports are only sent while the mission is 'ranging'. Not observed: `observed false`, `over null`.
  Only `report` events carry them (no duplicate `radio`). The clock code: circle letters Y Z A B C D E F = 10 25 50 100 200 300 400
  500 yards, hour with 12 at true north from the target ('B3' = 100 yards east); `ok` for A or better; FOO `ok` within 45 m.
- Targets: `parts: [{ x, z, hp, alive, y?, type? }]` placed from `src/models/t/layout.js` `partLayout`; extra `present` (false while
  the mobile target has nothing there: no convoy, no train) and `active`. Crossroads parts are 4 vehicles (`type` 'wagon'|'wagon'|'gun'|
  'lorry') whose x,z move along the road while a convoy is present; the railyard is the 9 layout parts, present while a train is in
  (260 s). The balloon is destroyed when part 0 (the Drachen) dies; part 1 is the winch lorry. Destroyed batteries are replaced by a
  fresh one after 420 s (a new 'cb' mission); in attract mode every target comes back after 70 s.
- Infantry groups: `bearing` in rad; men offsets in the group frame the infantry renderer uses (dx right, dz toward the rear, group
  rotated by `bearing`). German states 'forming' (about 25 s, rockets after 5 s) -> 'advancing' -> 'assault' (20 s) -> 'in' (breach) or
  'broken' (an about-turn rotates the formation 180 degrees so no man jumps). British groups ('forming' -> 'advancing' -> 'in')
  walk behind the barrage. `n` is the live count, `n0` the start strength.
- Missions carry extra fields: `units` (all assigned unit ids), `obsName`, `rounds`, `lift` (barrage), `alt`, `sector`, `tEnd`.
  `sos` mission point = the SOS line a third of the way from the British front across no man's land; barrage missions (one per lane)
  move their `x,z` at each lift. `mission.state` 'ranging' is skipped for map and sound shoots, SOS and the barrage (straight to 'ffe').
- Extra events (all optional): `enemyFire(batteryId, part, shell)` (a German gun fired: flash at night), `targetGone(target)` (convoy
  or train left), `lift(k, barrage)` (the barrage lifted). `incoming(shell)` fires ~4 s before an enemy shell lands within 400 m of a
  piece. German shells are in `sim.shells` with `own: false`, `unitId: null`, `kind` 'fh15' | 'm21' | 'fk77'.
- Shell ids ('s1', 'e1', ...) are unique for the whole game; a shell that leaves `sim.shells` has burst at `shell.pos` (the bisected
  ground point). Shells may carry `fuze` 'shrapnel' (60-pdr): airburst at the aimed range, `info.crater` 0.
- Gameplay hooks the console can explain: `unit.signature` (flash and sound ranging) builds with every round (more at night, with the
  kite balloon up, on Hard) and fades at 0.006/s (0.014/s on hold); German batteries walk onto the loudest unit once it passes 0.2.
  `unit.underFire` is the sim time of the last near burst. Wear (0..1) lowers muzzle velocity and widens dispersion.

## Balance (simulation agent)

Tune with `node tools/simtest.mjs 1 2 3 --all --difficulty all --table` (players: `auto` all AI, `player` a scripted competent player on
the 15-inch, 9.2-inch and 6-inch battery, `full` the same on all five). `MIS=1` lists missions, `OCC=1` piece occupancy, `ZDBG=1`
Zero-hour groups, `DBG=<t> DBGU=<unit>` a unit's state. A game is about 40 minutes of game time (victory comes with the infantry on
the objective at about 40.5 min; defeat earlier when two sectors fall or every gun is lost). Seeds 1 to 72, the finished tree:

| Difficulty | all auto | scripted 15in+9.2in+6in | scripted all five |
|---|---|---|---|
| Easy | 39 of 72 | 65 | 69 |
| Normal | 20 of 72 | 46 | 58 |
| Hard | 1 of 72 | 8 | 15 |

(rail18) All nine cells re-run on seeds 1 to 72 after the railway gun became the 18-inch (cycle 60 to 90 s, 36 rounds instead of 50, the biggest blast and crater in the game). Before: Easy 39 / 66 / 69, Normal 14 / 48 / 61, Hard 0 / 4 / 15. Kills per game by unit on Normal (15in, 9.2in, 6in, 60pdr, rail), scripted all five: 2.1 1.3 1.0 1.0 0.6 before, 2.3 1.4 0.9 1.0 1.3 after (all auto 1.0 before, 1.5 after), so the 18-inch gets about as many kills as the 15-inch but fires only about 25 rounds a game; it does not win the game alone.

On Normal the auto crews hold the SOS 46 % of the time (scripted all five 77 %), 50 % of the infantry reach the objective on
average with auto crews against 68 % with the scripted player (the attack needs 60 % on Normal, 50 % Easy, 70 % Hard). Tuning knobs:
`DIFFICULTY` (err, cb, dmg, assault, time, ammo, sig, zero), the dispersion and calibration in `GUNS`, `SHELLS` radii, the CB
cadence in `enemy.js` (one round per gun per 85 s / (cb * activity)), the breach penalty in `director.js` (0.5 of a sector per group in),
the AI delays in `crews.js`. After changing any of them re-run on 72 seeds or more; single games flip near the loss line.

## Tutorial (phase 3)

A playable tutorial, reached from the title screen ("Tutorials" next to "Take command"): a list of
lessons with completion ticks (localStorage `drumfire.tutorials`), each a list of steps run on a
scripted range. The pattern is iads `src/tutorial.js` (read only): an instruction card over the 3D view
(title, text, the objective line, Next/Skip/Exit, step counter), the console controls the step is
about pulsing (`data-tut` names through `src/ui/highlight.js` `tut(el, name)` / `setHighlight(list)`),
and a step completes when its `done(T)` reads true from the sim state; steps without `done` explain
and advance with Next. Esc leaves the lesson (back to the title screen and the attract battle).

**Ownership.** Sim scripting agent: `src/sim/*` (the scripted mode and `sim.script`, below; normal
games must be unchanged, re-run `tools/simtest.mjs` to prove it). Tutorial agent: `src/tutorial.js`
(new), `index.html`, `src/style.css`, `src/hud.js`, `src/main.js` (the wiring), and light edits in
`src/ui/*` to tag controls with `tut(el, name)` (no behaviour changes in the console).

**Scripted range** (`sim.newGame({ scripted: true, difficulty, seed })`): the director runs no phases
and spawns nothing, there is no German fire unless the script asks for it, our pieces and crews take
no damage, every unit starts on `mode: 'hold'` (the lesson sets the modes it wants), the clock is held
at 10:00 (`sim.script.clock`). `sim.scripted` is true. Everything else (loading cycles, shells,
observers, reports, damage to targets, infantry) is the normal game.

```js
sim.script.clock(hour | null)              // hold the clock at an hour (null: run it as in a battle)
sim.script.mission(siteId, {               // a mission on a sector.js SITES target (made known) -> mission
  kind, observer: 'foo' | 'air' | 'sound' | 'map', unitId, title, deadline,
  firstError: { over, right },             // metres: the first round of the unit's fresh lay on it lands
})                                         // exactly there (later rounds: normal dispersion, no calibration error)
sim.script.wire(sectorId, opts)            // a wire-cutting mission -> mission
sim.script.hostile(batteryId, { at, interval = 14, start = 450, walk = 90 })
                                           // a German battery opens counter-battery fire on unit `at`: rounds
                                           // land `start` m off and walk in `walk` m per round; it stops when
                                           // the battery dies or the unit holds fire long enough (the normal
                                           // signature rule); returns the 'cb' mission (sound ranging)
sim.script.assault(sectorId, size = 1)     // an SOS: infantry form and cross, red rockets (normal rules)
sim.script.convoy(); sim.script.train()    // the mobile targets (crossroads traffic, a train at the railhead)
sim.script.quiet()                         // stop all German fire now
sim.script.invulnerable(on = true)         // our pieces take no damage (default in scripted mode)
sim.script.clear()                         // remove missions, shells in flight and infantry
```

**Daylight (a hard rule).** Every lesson runs in full daylight so the player can see the guns, the
crews and the bursts: the scripted range holds the clock at 10:00, `sim.script.clock` clamps any hour
it is given to 09:00 to 15:00, and no lesson asks for night. While a lesson runs, main drives the sun
from the sim clock (it ignores a `?hour=` or slider hour, `params.lockHour`), keeps the weather at
'Clear' or 'Overcast' (never Mist, Rain or Drizzle), and restores the player's settings on leaving.
The sim's `night` stays false on the range (no night signature or observer rules).

**Lessons** (`TUTORIALS` in `src/tutorial.js`; ids are also `?tutorial=<id>`):
1. `basics`: the screen, units 1 to 5, the camera (drag, wheel, C), the console (board, fire order,
   range table, missions, messages, the guns card), time compression, watching a gun load and fire,
   F to ride its shell.
2. `ranging`: the 6-inch battery: take a mission (Tab, Enter), lay, a ranging round, the FOO's
   telephone report in yards, corrections (arrows, the step, the pencilled "apply"), the bracket, fire
   for effect (rounds), the target destroyed.
3. `clockcode`: the 9.2-inch with an aircraft observer: the RFC clock code (letter = distance, number =
   hour, 12 = north) on the dial, decoding it into a correction.
4. `heavy`: the 15-inch on a pillbox: the delay fuze, the crane cycle, the long flight (F); then Wolfe,
   the 18-inch railway gun, on the railhead.
5. `counter`: counter-battery: German shells walk onto your guns, HOLD to go quiet, the sound rangers'
   reference, the 60-pounders on the hostile battery.
6. `sos`: red rockets: S (or the sector keys), every gun on the SOS line, shrapnel from the 60-pounders,
   breaking the attack.

Every step has an optional `demo(T)` that performs its goal with the same commands the console sends
(and the same keys main handles), so `window.__drumfire.tutorial.autoplay()` can run a whole lesson
unattended; it is how the lessons are tested (every lesson must complete under autoplay).

## Changelog

- (lead) Initial contract, `src/sector.js`, framework files copied.
- (audio) `audio.js` API as in the Audio section, plus: `audio.start()`, `setVolume(v)`, `toggleMute()`, `deafen(k)` (0..1 pressure dullness, normally raised by the engine itself when a gun or burst is close), `audio.onShock = ({ d, k, pos }) => {}` (fires when the shock of a close blast reaches the listener, after the travel delay: shake the camera there), `classOf(calibre)` export. Gun/burst classes by calibre: light < 4 in, field < 5.5 (60-pdr), med < 7.5 (6 in), heavy < 12 (9.2 in), huge (15 in, railway). `load(step, pos, kind)` steps: trolley, crane, ram, breech (screw + clang), screw, clang, cartridge, case, ready, fire, whistle; `kind` is a calibre in inches or 'bl15'/'bl92'/'bl6'/'bl60'. `flare(pos, 'very'|'star'|'rocket')`. Shell objects only need `{ pos, vel, alive, calibre, own }`; `alive === false` stops the voice. Tests: `node tools/audiotest.mjs`, `/audio.html` (`window.__audioReport.ok`).
- (infantry) `inf.update(dt, groups, heightAt, camera)`: the camera (optional) enables the distance enlargement and frustum culling; `inf.blast(x, z, radius)`, `inf.reset()`, `inf.setShadows(on)`, `inf.stats`. Group frame: a man at (dx, dz) stands at `x = pos.x + dx cos b - dz sin b, z = pos.z + dx sin b + dz cos b` (dx to the right, dz toward the rear, so dz < 0 is ahead); men face their direction of travel. `men[i].t` is unused. Bodies stay where they fell until the group leaves `sim.infantry`, then sink and fade over 3 s. Viewer: `/src/models/inf/preview.html` (`?side=british&blast=1&cam=az,el,dist&far=1&n=200&force=dead|down|throw`).
- (framework) `flares.js`: `new Flares(scene, { ground })`, `launch(pos, 'very'|'sos'|'star')`, `flash(pos, color, intensity, life, { radius, reach })` (intensity = the fx module's peak power, scaled by 0.02 inside), `clear()`, `lightAt(p)`. `shaderlib.js`: `MAX_FLARE_LIGHTS = 16`, new `uFlareRng[i]` (softening radius, reach) and GLSL `flareAtt(i, d2)`; fx.js loops should use `MAX_FLARE_LIGHTS` and `flareAtt`. `camera.js`: `shake`, `followShell`, `watch`, `releaseShot`, `mode`, `update(dt, alpha)`. `main.js`: `window.__drumfire` (`hooks.<event>`, `onFrame`, `aim`, `sandboxBlast`), `?sandbox=1` keys B N K L J, `?hour=` `?weather=` `?unit=N` (unit id), optional `src/render/index.js` `createRender({ scene, sim, terrain, fx, rigs })` -> `{ update(dt, rawDt, sim, fx), reset(sim) }`.
- (fx) FX hooks main wires: `fx.onShock(pos, radius, speed, strength)` -> `post.shockwave(pos, { radius, speed, strength })`; `fx.onHeat(pos, radius, life)` -> `post.heat(pos, { radius, life })`; `fx.onFlash(pos, color, intensity, life, { radius, reach })` -> `flares.flash` (all args pooled: copy them). New: `post.dazzle(k)`, `post.heat`, grade '1917', `fx.reset()`, `seedFx(n)`, `fx.leaf`, `fx.clods`; sandbox `fx.html` (`&sheet=t1,t2,..` contact sheet).
- (ui) `new Panel(root, { audio, onSelect, onCommand })`, `panel.update({ sim, selectedId }, dt?)` (also accepts iads-style `(dt, view)`), optional hooks main may call: `panel.radio(text, kind)` from `sim.events.radio` (phone, wireless, warn, alert and kill make slips on the message pad; info is ignored because the task slips already say it), `panel.sos(sectorId)` from `sim.events.sos`, `panel.reset()` on a new game, `panel.dispose()`. The panel watches `sim.shells` itself: a shell that vanishes has burst at its last position (fall of shot, numbered per unit; enemy bursts within 450 m of a piece are drawn as red splashes) and reads reports from `sim.missions[].reports`, so no event wiring is needed. UI conventions the sim should match: `unit.order.line` and `el` are radians, `range` metres (shown in yards), `order.x/z` the corrected aim point and `order.target` the uncorrected point, `order.adj` metres; `rangeTable(kind, charge)` returns `range` in metres (every 100 yards), `el` radians, `tof` and `apex` seconds and metres, an empty array for a charge the gun does not have (the UI counts charges by probing, or reads optional `unit.charges`); `sim.wind.bearing` is where the wind blows FROM (radians); optional `unit.arc` (half-angle of the arc of fire, radians). Corrections are in yards on the keys and converted to metres for `correct`. Keys owned by the console: Tab/Shift+Tab mission cursor, Enter take it, Space fire, G guns selector (1 GUN, SECTION, BATTERY; hidden for one-piece units), arrows correct (Shift = 10 yards, else the step), X step (10/25/50/100/200 yd), Q/E charge, R rounds, Z fuze, A auto/manual, S S.O.S. (alarmed sector, else the weakest), Backspace/Delete cease, `.` apply the pencilled correction of the newest report. Harness: `/ui.html?unit=N&scn=ranging|sos|dead`.
- (heavy models) `guns.js`: `buildGun(kind)` (sync), `GUN_KINDS`, `loadGuns()` (promise; bl6/bl60 load lazily from the field agent's files, a plain stand-in is returned until they have). Gun rigs come from `rig.js` `newGunRig(kind, scheme)` (+ `anchor`, `crewSpot`, `addShellProp`, `finishGun`): pivots `traverse`, `elevation`, `recoil`, `breech`, `tray` (bl15, bl92, rail: a cross slide on the carriage, not on the elevation frame; `rig.setTray(k, deck = k)` 0 = in position behind the breech at `loadEl`, 1 = slid clear to the left; `setBreech(k)` also drives it for viewers that only know the breech; `anchors.tray` stays on the elevation frame and keeps the loading tilt via `rig.update`), rail `bridge` (the hinged bridge piece, folded by `setTray`'s second argument), bl15 `crane` (rotation.y, 0 over the tray, PI over `anchors.shellStack`) and `hoist` (position.y = hook height in the crane frame, `rig.hoistRange {up, down}`), rail `trolley` (position.z, 0 at the rear, about -3.1 at the breech) and `bogies`. Extras: `rig.setRecoil(k 0..1)`, `setElevation(r)`, `setTraverse(r)`, `rig.shell {len, rad}`, `rig.breechOpen {axis, angle}` (setBreech(1) swings the carrier 1.65 rad), `anchors.crew [{ role, x, y, z, heading, pose }]` (heading is rotation.y, 0 faces the muzzle). **The render layer must call `rig.update?.(dt)` every frame** (bl15 stretches its hoist chain, all three keep `anchors.tray` at its loading tilt). `rig.recoilFade?.(el)` (0..1, from `floorFade` in rig.js) is the share of `recoilLength` the gun may use at that elevation without the breech tail meeting the floor; the render layer multiplies the recoil by it. `render/guns.js` `loadPose(piece, alpha)` orders the breech and the tray (open: block first, then the tray in; close: tray out first, then the block; rail adds the bridge), and the light guns' barrels drop to `rig.loadEl` for the loading steps (quick-loading gear) so the round never runs into the trail. Dev check: `/src/render/clipcheck.html?gun=bl15,bl92,bl6,bl60,rail` (`&fast=1`) steps every gun through the shipped posing and reports penetration depth per pair into `window.__clip` (target: nothing over 1 cm). Rail gun is the BL 12-inch Mk III howitzer ("Hilda"), whose 12-inch shell matches `shells.js` `rail`; recoil metres bl15 0.8, bl92 1.0, rail 0.76; `loadEl` bl15 0.3, bl92 -0.05, rail 0.06. `kit.js`: schemes 'drab' | 'wkhaki' | 'earth' | 'railcamo', materials `iron timber shell chain rope soil`, helpers `zLathe xLathe rivets rivetRow rivetFrame rivetPoly chain handwheel gearArc shellGeometry ibeamX/Y/Z mergeAll woodTextures`. `crew.js`: `buildCrewman({ outfit: 'gunner' | 'gunner-tunic' | 'officer' | 'german' | 'stretcher', ...overrides })`, options `headgear` brodie|stahlhelm|peaked, `vest` braces|ww1|german|sambrown, `shirt`, `legs` puttees|boots, `armband`; `crewForRole(role, i)`; poses added: `haul ram lay lanyard ears point phone dead`. Viewer `/models.html?kind=bl15|bl92|bl6|bl60|rail|crew`, `&all=guns|crew|outfits`, `&shell=bl15`, `&target=battery`, `&pose=elevation:0.6,recoil:1,breech:1,traverse:0.2,crane:0,hoist:2,trolley:-2`, `&load=tray|crane|trolley`, `&crew=1`, `&anim=1`, `&ortho=right|left|front|rear|top`, `&cam=az,el,dist`.
- (lead) `sector.js`: unit 5 is the BL 12-inch railway howitzer Mk III "Hilda" (the heavy models agent's choice, at Ypres in November 1917). `RAIL_MAIN` (new, the north-south main line) and `RAIL_SPUR` (now the curved firing spur that leaves the main line at z = -1200 and runs east under the gun, so the car lies on the zero line, 90 degrees); the rail pad is turned to the piece bearing like the others; the 15-inch pad is 24 m square.
- (dressing) `src/world/index.js`: `buildWorld(scene, terrain) -> { update(dt, camera), groups, idle(), stats(), invalidate(x, z, r) }` (invalidate drops tiles near a point so they rebuild on the new ground); `src/world/battery.js` exports `positionAnchors(unitId, pieceIndex) -> { shellStack, shelter, cartridges, net, commandPost }` each `{ x, z, yaw }`. Viewer: `src/world/preview.html`. Lays RAIL_MAIN and RAIL_SPUR, leaves 8 m of the spur clear under the railway gun.
- (terrain) `src/trenchlines.js` (pure): `trenchPolylines()` -> [{ side: 'british'|'german', kind: 'fire'|'support'|'reserve'|'comm', pts }] (crenellated bays ~9 m, jogs 2.4 m, comm trenches zig-zag), `wireBelts()` -> [{ side, pts, width }] (stretches with gaps), `tracks()` -> [{ kind: 'road'|'plank'|'duckboard', pts }], `lineBase(key)`, `trenchDistance(x, z)`, `trenchSample(x, z, out)` -> { d, kind, side, lat }, `trackSample(x, z, out)`, `TRENCH` profiles (depth ~1.9 m, floor half-width 1 m, parapet +0.95 m on the enemy side, parados +0.6 m), `TRACK_WIDTH`.
- (terrain) `terrainHeight.js` also exports `waterTable`, `wetAt`, `craterDensity`, `oldCraters`, `groundKindAt`, `STREAMS`, `groundSmooth`. `terrain.groundAt(x, z)`, `terrain.craters` (`add(x, z, radius, depth, { scorch, water })`, `delta`, `at`, `fill`), `terrain.heightAt` is a bound function (safe to pass as `fx.ground`). Viewer: `/world.html?at=...&cam=az,el,dist&hour=&weather=&craters=N&world=0&still=1`.
- (field models) `shells.js`: `buildShell(kind, seg = 24)` and `buildCartridge(kind, { charges })` -> `{ parts, length, radius }`, built along Z nose -Z and centred; `SHELL_KINDS`. `targets.js`: `buildTarget(kind, opts)` -> `{ root, parts, setDamage(i, k), anchors: { burn[], top[], center }, ...extras }` (battery adds `rigs`, balloon `cable`/`bridle` and takes `{ alt }`), `buildGermanGun('fh15' | 'm21' | 'fk77')` (gun rigs, German 'tri' camouflage), `buildTraffic('wagon' | 'cart' | 'gun' | 'lorry')` and `buildTrain(n)` (Groups for mobile traffic), `partLayout(kind, { alt })` (Node-safe, in `src/models/t/layout.js`: part offsets `{ x, z, y }` in the site frame, local -Z is the site's facing; the sim should build `parts` from it). The target root is not turned: the render layer sets `root.rotation.y = headingFor(site.bearing)`. Parts are Groups whose home pose is taken at build; `setDamage` blackens, tilts, sinks, throws bits and fades a scorch blotch in. bl6/bl60/German guns follow the guns.js rig contract plus `setRecoil/setElevation/setTraverse`; `traverse` swings the whole carriage about the point under the axle; `setShell('cartridge', v)` shows the bag on the tray. Viewer: `src/models/t/preview.html?kind=bl6|bl60|german:fh15&pose=...&crew=1` or `?target=battery&dmg=0.5` or `?shell=all`.
- (fx) pass 2: gun blast rebuilt (dense cloud, ground fan), geyser skirt/cauliflower head/base surge, soft ground fade in the smoke shader, distance enlargement; new hook fx.onGust(pos, dirX, dirZ, radius, strength) for grass flattening; smoke attribute iE.
- (sim) src/sim/* written; extra fields and events listed in "Simulation details". `src/ballistics.*.js` reference copies deleted.
  Traverse limits are game-wide (15in +-48 deg, 9.2in +-58, 6in +-68, 60pdr +-65, rail +-48 of the zero line) so every unit can reach
  most of the front; models should pose `piece.az` as given. Muzzle velocities and drag are game values (15in 336 m/s, max range 9.7 km).
- (render) `src/render/index.js` `createRender({ scene, sim, terrain, fx, rigs, camera? }) -> render`. It reuses main's gun rigs (`rigs`, key `${unitId}:${pieceIndex}`; builds any that are missing), so main's own recoil loop and `rig.rec = 1` are now redundant (the render layer runs after them and wins) and can go. Calls main makes: `render.update(dt, rawDt, sim, fx, camera)` every frame after `sim.update` (the camera drives crew level of detail, shell enlargement and infantry culling; without it everything is drawn in full); `render.select(unitId)` when the selected unit changes (full-detail crews out to 450 m, others within 140 m, a cheaper crew to 420 m, none beyond); `render.reset(sim)` after `sim.newGame`; `sim.events.enemyFire = (srcId, part, shell) => { const m = render.onEnemyFire(srcId, part, shell); if (m) { fx.gunBlast(_p.set(m.x, m.y, m.z), _d.set(m.dx, m.dy, m.dz), m.calibre, { night }); audio.gun(_p, m.calibre); } }` (`m` is a shared record `{ x, y, z, dx, dy, dz, calibre }`, copy it; it also kicks that German gun back); `render.hooks.shellBurst(shell, pos, info)` (or `render.onBurst(pos, info)`) throws infantry near a burst; `render.onFire(unit, piece)` returns the same kind of record for one of our guns with the rig posed exactly as the sim has it at the shot (use it instead of reading `rig.anchors.muzzle` in main's fire handler); `render.newestShell(unitId)` returns the sim shell for the F key; `render.eye(unitId, out)` a point above the unit's first gun. What it draws: guns posed from `piece.az/el`; recoil from `piece.firedAt` (out in 0.14 s, a pause, the run out over `GUNS[kind].runout`), a platform shudder, a wreck pose for a dead piece, the breech from the open/close steps; the loading crews (`crews.js`: pure functions of `piece.job`, the time since `firedAt` and `piece.fireAt`, so time compression and fastForward are exact): the 15-inch crane lifts the shell from the ground and swings it onto the tray, the railway gun's trolley runs the round forward, the 9.2-inch pair carries it from the stack, the 6-inch and 60-pdr carriers bring it by arm; rammer staff, cordite bags, lanyard with a rope, arm up for the order, everybody turning away and covering their ears from 1.6 s before a shot until 3 s after; shells in flight (`shells.js`, instanced per kind, interpolated with `sim.alpha`, enlarged with distance to about 7 px, cap 24x); targets (`targets.js`: `setDamage` per sim part, battery guns recoil, the balloon falls burning over 14 s, mobile targets only while `present`); infantry. The sim fields it reads beyond the contract: `piece.firedAt`, `piece.fireAt`, `piece.rounds`, `piece.cmd`, `piece.crew/crewMax`, `target.present/maxHp`, `shell.t0`. Preview: `/src/render/preview.html?unit=1&step=ram&t=0.5&cam=az,el,dist` (steps: depress open shell ram cartridge close prime lay ready fire idle; `fire` t is seconds since the shot; `&run=1` runs the sim live; `window.__render.set(step, t)`).
- (sim scripting) `src/sim/script.js`: `sim.newGame({ scripted: true })` and `sim.script` as in "Tutorial (phase 3)"; deviations: `clock(null)` holds the current hour (never runs on), `mission` deadline defaults to 3600 s, `hostile` also takes `grace = 4` (rounds fired before the signature rule can end it, stops when the unit's signature is under 0.2), `firstError` is the lay's map error: every round of that unit on the mission lands that far over/right of its aim point (the first exactly, later ones with only dispersion), `sim.invulnerable`, scripted observers (quick, never lost, steadier estimates), `director.assault/convoy/train` now return their object or mission.
- (tutorial) `src/tutorial.js` (six lessons: basics 10 steps, ranging 9, clockcode 9, heavy 10, counter 10, sos 7), `#tut-menu` and `#tut-card` in index.html and style.css, main.js wiring (`Tutorials` host, `newBattle`, `unitKey`, daylight lock in `clockHour()` plus weather forced to Clear and restored on leaving, `?tutorial=<id>`, `window.__drumfire.tutorial` with `start`, `exit`, `autoplay`, `autoplaySync`), console controls tagged with `tut(el, name)` (header, status, mode, sos, board, order card fields and keys, rtab, guns, missions, pad, apply, clock). `tutorial.onBurst(shell, pos, info)` is called from main's shellBurst handler.
- (ui, sim) guns selector: `fire` takes an optional `guns` (1, 2, 'all' or piece indices; `pickGuns` in `src/sim/guns.js`), unchanged without it (simtest seeds 1 to 8 Normal identical before and after). The fire order card has a GUNS row (1 GUN / SECTION / BATTERY for the 6-inch, 1 GUN / SECTION for a pair, hidden for one piece; `tut` name `gunsel`), key G cycles it, the FIRE key reads "FIRE No. 1", "FIRE SECTION" or "FIRE BATTERY" with "n of m ready". `KINDS[kind].pieces` in `ui/consoles/common.js`. The range table card shows 3 rows (was 5) to make room. Tutorial: the ranging lesson has a "Which guns fire" step (10 steps), `rangeStep` is done when exactly one piece fired, `effectStep` when every live piece is firing; demos send `guns`.
- (fx) Gun smoke no longer blinds the player at their own guns: the smoke shader fades aged cordite and hang puffs (`iC.w`) within about 12 m + 1.8 x size of the camera (fresh blasts unchanged), and `gunBlast` scales the cordite core life and opacity and the long hang's count, life and opacity with calibre (15-inch unchanged in its first seconds; a 6-inch battery's haze clears in about 8 s), with faster wind drift (hang drag 0.9).
- (render, crews) Loading crews keep clear of the steel, the pit and each other: `src/render/crewfield.js` rasterises each rig's plan view through a man's height band (rotating and fixed layers; every elevation, breech and tray pose from guns.js `loadPose`, recoil for the shot, the crane's pick-up to tray swing, the trolley run) with the pit's walls, stack and crates from `world/battery.js` `pitSolids(kind, x, z)` (new export); `crews.js` moves standing places clear (`snapHome`), routes the carriers round the steel (A* on that grid, string pulled, stepping up onto a deck where the route meets one), keeps the 9.2-inch pair side by side with the rammers giving way, and stops a rammer's lunge at the steel. Still pure functions of job time (routes are cached per leg and replanned when the endpoints or the traverse move). Check page `src/render/crewcheck.html?gun=bl15|bl92|bl6|bl60|rail&scn=0,1,2` (`window.__crew.brief`: body capsules against the rig's steel, pit and other men, per role and step).
- (mechanism) No part of any gun's loading mechanism now meets another through the loading and firing cycle (clip check `/src/render/clipcheck.html`, nothing over 1 cm). The heavies' tray is a cross slide that stows to the left (`rig.setTray`), the block opens before the tray comes in and the tray leaves before the block closes (`loadPose` in render/guns.js), recoil shortens with elevation (`rig.recoilFade`), the light guns' barrels drop to `loadEl` for the loading steps. Moved for the crew: bl15 crane now at (2.6, 7.0) with R = JIB_R = 4.4 and its pick-up stack at (7.0, 7.0); bl92 and bl15 `anchors.tray` sit 0.19 and 0.26 m lower in the tray frame but still on the bore axis, bl6 and bl60 `anchors.tray` now on the bore axis one half shell length plus 0.06 m behind the breech (was 0.16 m below it, at the breech); bl92 `shellStack` at (-3.4, 0.15, 2.6); bl92 trunnions 0.4 m higher (TY 2.2); rail loading stage cut back to z 3.6 to 6.6 with a hinged `bridge` in front, trolley rest z 5.8, lanyard, loaders, rammers, trolley and crane crew spots moved to z 3.9, 4.6, 6.1, 5.9.
- (render, crews) Follow-up: the cordite bag now rises to a point on the bore axis behind the breech (clear of the tray plate) and slides in along the axis (crews.js carryMan), which clears the mechanism clipcheck's cbag>recoil 27.5 cm and cbag>tray 4.7 cm on the 9.2-inch (clipcheck full runs of bl92 and bl60 are clean; `&fast=1` samples too sparsely to see it). Crew bodies re-checked against the new models with `crewcheck.html`: clean at zero traverse and plus or minus 0.3 rad apart from 4 to 6 cm shin contacts with low timber and a layer's upper arm at the sight.
- (ui) Gun selection tabs show loading state: a pip per piece filling toward READY (time-weighted over `GUNS[kind].load` by `job.i`, `job.n`, `job.t / job.dur`; amber loading or laying, green ready, flashing recoil, red struck-through dead) and a summary such as "2/4 READY" or "LOAD 70%"; tabs are 60 px tall, the lamp moved to the tab corner; mock jobs carry `i` and `n`.
- (rail18, models) `src/models/v/rail.js` is now the BL 18-inch railway howitzer on the "Boche-Buster" car (refs/rail18; kind id 'rail', export `buildRail`, the 12-inch is gone). **Rig frames (model space, front -Z, rail head y = 0, track along Z; all on `car` unless noted):** `car` (new pivot, position.z = 0 at rest, + = back along the track, `rig.carRoll` = 6.0 m full run; carries the whole car and everything on it; `rig.setCar(z)` sets it and turns the 15 wheelsets, `rig.wheelsets[i].rotation.x = z / 0.42`; the old `bogies` group still exists and now holds the wheelsets) > `traverse` at (0, 1.6, -0.8) (the upper mounting on a roller path in the dropped centre: turntable, cheeks, running boards and the loading stage turn together; arcade, the game traverses +-48 degrees, the real car 2; the stage sweeps a 8.1 m radius about this point, so it overhangs the car sides when slewed) > `elevation` at +2.45 (trunnion axis y = 4.05 m, z = -0.8; barrel z -13.07 to +3.4 on the elevation frame, 16.47 m) > `recoil` (position.z, `rig.recoilLength` 0.86 m = 34 in, `recoilFade` from `floorFade`, about 0.2 of it at 40 degrees) > `breech` (hinge at x +0.9, z +3.43 in the recoil frame, swings 1.65 rad about y). `tray` is the usual cross slide (`trayMount`, hinge frame at (0, -0.3, 3.5) on the elevation frame, `setTray(k)` slides it 1.4 m left, the second argument is ignored: there is **no `bridge` and no `trolley` pivot any more**). `crane` at (0.55, 0, 8.4) in the car frame (the lattice shell hoist's mast and jib: rotation.y 0 puts the hook at x -4.2 over the deck toward the tray end, PI at +4.2 over the shell stack) with `hoist` at (-4.2, 5.7, 0) in the crane frame (position.y = hook height above the rail head; `rig.hoistRange` { up 5.7, down 1.72 }; the shell hangs 1.18 below it; its chain follows in `rig.update`). Same contract as the 15-inch's `crane` and `hoist`, so crews.js' crane branch applies unchanged except for the numbers. `setShell(where)`: 'tray' | 'hoist' ('crane' is an alias of 'hoist'; there is no 'trolley'). **Numbers:** `loadEl` 3.5 degrees; shell 2.01 m long, radius 0.2286 (`rig.shell`); `anchors.tray` is the shell's middle on the bore axis 5.05 m behind the trunnion axis (nose 4.05, tail 6.06, breech face 3.4), 0.3 above the tray frame; `anchors.muzzle` (recoil frame, z -13.07), `anchors.breech` (recoil frame, z +3.4), `anchors.eye` (traverse frame, y +2.75, z +0.2), `anchors.shellStack` in the root frame at (4.75, 0.5, 8.4) (where the hook picks up with the jib at PI; ready shells lie on baulks 1.3 to 2.5 m behind it), the car is about 22 m over the buffers (z +-11.06 at rest, +-11.06 + 6 m behind after a shot), 3.0 m wide over the headstocks, the loading stage deck is 2.8 m above the rail head (x +-1.45, z 4.1 to 7.2 in the car frame = 4.9 to 8.0 behind the trunnion axis), the rear end deck and front winch deck 2.3 m, the running boards beside the cheeks 1.77 m. **Crew spots** (root frame with the car at rest; `car: true` on the spots that stand on the car and must be shifted by `car.position.z` during the roll-back, the others stand on the ground): sergeant (0.4, 2.3, -7.2) on the front lattice platform facing the muzzle (point, car); layer (-1.95, 1.77, 0.15) on the left running board facing +X (lay, car); traverser (1.95, 1.77, -1.7) on the right board facing -X (operate, car); lanyard (1.0, 2.84, 4.8) beside the breech (car); loader1 (-1.0, 2.84, 5.8) and loader2 (1.0, 2.84, 5.1) at the tray (carry, car); rammer1 to rammer4 (+-0.5, 2.84, 6.1 and 6.7) behind the shell's tail (ram, car); crane1 (0.55, 2.3, 9.55) at the hoist's winch on the rear deck (operate, car); crane2 (-0.45, 2.3, 8.05) signalling (car); ammo1 (3.65, 0, 10.1) and ammo2 (5.95, 0, 9.9) at the stack on the ground (stand, crouch). The stowed tray and the open block leave x -1.97 to -0.83 and +0.82 to +1.12 (z 3.7 to 5.0 behind the trunnion axis) occupied at men's height beside the breech, the left rail of the stage has a gap over the tray's parking place (z 6.8 on). **Posing (`render/guns.js`):** `carPose(g, piece, tf)` gives the roll-back 0..1 from the time since the shot (a decelerating run back over 1.9 s, held to 4.5 s, then a slow winch-in that ends at the start of the 'shell' step, forced to 0 from that step on), applied with `rig.setCar(carPose * rig.carRoll)`; `fired()` poses the muzzle with the car at rest; the rail special case in `loadPose` (bridge) is gone; the platform shudder for the rail is 0.4. `clipcheck.js` counts the `car` and `bogies` groups as `root` steel and uses 0.62 as the rail barrel radius. `shells.js` `rail` is 0.457 x 2.01 m (2,500 lb HE: buff body, red band, copper driving band, brass fuze nose) and its bag is 0.62 x 0.38. The name plate text is the exported `NAME_PLATE` ('H.M.G. BOCHE-BUSTER' as on the 1940 car). Clip check (`clipcheck.html?gun=rail`, full run, 262 poses): no rig-against-rig pair over 1 cm; with the crews as they stood before the re-plan it still shows the crew props cshell>tray 3.5 cm (shell lowered at 0.88 of 'shell', at the tray's left side rail) and cbag>breech 23 cm (3 poses, 'cartridge' step at az 43, the bag passing through the opened block that stands at x +0.82 to +1.12, z 3.7 to 5.0 behind the trunnion axis).
- (rail18, integration) Unit 5 is now the British BL 18-inch railway howitzer on the ex-14-inch "Boche-Buster" car, callsign "Wolfe" (after HMS General Wolfe, the monitor whose 18-inch gun fired on the Belgian coast in 1918), replacing the 12-inch "Hilda". History: ordered 1918, proofed 1920 to 1921, never fired in the First World War; in this 1917 game it is a what-if gun (README says so). Sim (`tables.js`): `GUNS.rail` calibre 18, shell 1,134 kg (2,500 lb), charges 340 / 450 / 570 m/s (the handbook's 182 lb and 282 lb bags, 570 m/s on the top charge), game drag `cd` 0.32 so the top charge gives about 20.4 km (22,300 yd) at 40 degrees (the railhead R1 is about 14.8 km away), elevation 10 to 40 degrees (the real gun goes down to 0; 10 keeps the short charges out of the ranges that the other guns cover), traverse +-48 degrees at 1.2 degrees a second (arcade: the real gun has 2 degrees on the car and the rest by moving the car on its curved spur, the game folds both into one slew so every site in the sector is reachable), loading cycle 90 s (depress 7, open 6, shell 24, ram 13, cartridge 18, close 5, prime 4, lay 11; the step names are the 15-inch's, the shell hoist replaces the trolley), crew 14 (the men drawn at the car; the real crew was about 50), hp 170, 36 rounds, flash signature 0.10 (the largest). `SHELLS.rail`: calibre 18, crater 10 m, soft R 68 D 85, hard R 34 D 120, lethal 58, wire 44, piece 66: the biggest in the game. Balance: see Balance (rail18). `fx/artillery.js` calibre scale clamps raised from 1.15 to 1.25 (18 / 15 = 1.2) so an 18-inch blast and burst are the biggest; audio already classes anything above 12 inches as `huge`. Sector: the pad under the car is 14 by 60 m, the spur is straight for 170 m (80 m behind the car, 130 m ahead of it) so the car's 6 m roll-back and its winch-in stay on track. World: `world/rails.js` no longer leaves a gap in the track under the gun; near it the bed is sunk so the rail head is at ground level where the rig's wheels run (rising back to the ordinary bed over 18 m); `world/battery.js` puts the camp beside the spur (22 m to the right of the camp frame), no duckboard walk or spent cases on the track, the reserve shell stack (2,500 lb shells) behind the rig's own two at the foot of the hoist (x 4.75, z 14.6), a camouflage net shifted 14 m to the right over the crates and the shelter, and `pitSolids` follows. Console (`ui`): '18-in Rly', title '18-INCH RAILWAY GUN', the board shows deep guns to 18.5 km east. Crews (`render/crews.js`): the railway gun now uses the 15-inch drill (hoist crane1 and crane2, the rammer team of four, the traverser on the wheel) with 4.2 m staffs; men whose spot has `car: true` ride the car's roll-back (`rig.pivots.car.position.z` is added to their z in `Man.put`); the cordite is carried by the first loader (left side) from the left (the stage is 2.8 m up, there is no ground route to it); the home places keep 6 cm more clearance on this gun. `crewfield.js` resets the car in its sweeps and widens the plan limits to z -16 to 32. Tutorial: the 'heavy' lesson step is 'wolfe' (text: an 18-inch howitzer, 2,500 lb, a what-if gun; about a minute and a half to load). `main.js` KIND rail is calibre 18, `NET_CLEAR.rail` 32.
- (ui) Report slips say what they report on: the round number (the same number as the fall of shot on the board), the gun that fired it (`No. N gun`, units of several pieces) and the task (`M<id>` and its title). The pad shows only the selected unit's reports (plus the Group's tasks and warnings; `Mail` keeps 40 slips). The tracker records each own shell's piece and the `order.adj` and `order.target` it was fired with (`tracker.fired`); the pencilled correction is read against the lay of now (`messages.js` `slipCorr`: the report's correction less what has been corrected since the round left, "Corr. now" when it differs), a newer report on the same task supersedes the older ones and a re-lay onto another target strikes them off, so "apply" and `.` never take another unit's report or double a correction already made.

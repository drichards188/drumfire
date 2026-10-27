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
`README.md`, balance passes.

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
// optional: allowedKinds (the kinds in the field), loadout ({ kind: { guns, mods } }: the open battles' researched lineup,
// research.js), opposition ({ cb, assault }: scales on the enemy for that lineup); see "Research and upgrades"
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
sim.earned;                            // { unitId: credit } this battle's pay so far (sim.credit; research.js battleReward)
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
A controller may set `piece.fixed` (true: the piece is not laid, `guns.js` `slew` leaves `az` and `el` alone; the
Gustav while it is still being assembled).
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
t0, deadline (sim time; null: no clock, as on an SOS, which ends with its assault), unitId, state: 'open' | 'ranging' | 'ffe' | 'done' | 'failed', reports: [Report] }`.
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
(auto/manual), S SOS. Main owns 1 to 5, C, F, M, H, F3, `[` and `]`. The Panel itself owns Shift+A and the ALL AUTO / ALL
MANUAL pair under the status block of the battery tabs (`.tall`): every battery the player commands (`isUnlocked`) and
alive to one mode through `onCommand(id, 'mode')`, a battery on HOLD too; lit when every one is in that mode; Shift+A sets
manual when all are on auto, else auto; hidden on the lesson range (`sim.scripted`) and with a single battery.

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
and `fastForward(seconds, { unit, scale })`. URL params `?quality=`, `?play=1`, `?difficulty=`, `?unit=N`.
The page boots through `src/boot.js`: `/` is the main menu (`src/ui/menu.js`, entries from `src/menuItems.js`; only its
hangar loads three.js, `src/ui/hangar.js`, and nothing of the battlefield), a URL with `play`, `tutorial` or `sandbox` is a game page whose loading screen
(`src/ui/loading.js`) stands while `init()` builds the world; then `start()` runs `sim.newGame` (or the lesson
starts) at once.

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
  `corr` is what to apply with `correct`. Reports are sent while the mission is 'ranging', and on a mission in 'ffe' for the
  ranging rounds (`rounds 1`) of a unit not on auto fired since its own last fire for effect (`shell.ranging`, `unit.ffeVolley`):
  the player joining a task an auto battery fires for effect on, or ranging again after a series. Not observed: `observed false`, `over null`.
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
| Easy | 46 of 72 | 67 | 71 |
| Normal | 20 of 72 | 46 | 64 |
| Hard | 0 of 72 | 6 | 14 |

(heavy and long guns' missions) All nine cells re-run on seeds 1 to 72 after the deep and hard missions came in
(section "Missions for the heavy and the long guns"). Before: Easy 54 / 66 / 67, Normal 25 / 48 / 67, Hard 1 / 4 / 16. The
auto crews lose a little more (their 9.2-inch, 15-inch and railway gun spend time on long shoots and are on them when an
SOS comes); the scripted players, who keep to their own missions, are about where they were. All auto on Normal, per game:
deep missions done 0.1 of 2, hard 0.4 of 2 (the 18-inch alone, at about 100 s a round, rarely finishes a depot in the
window; with upgrades 1.3 and 0.8).

(SOS without a deadline) All nine cells re-run on seeds 1 to 72 after the SOS mission lost its deadline (see the
changelog). Before: Easy 54 / 66 / 67, Normal 22 / 52 / 65, Hard 1 / 6 / 14; Easy is unchanged, as its longer clock never
ran out. SOS calls held (no group in our trench) by all auto, scripted 15in+9.2in+6in and scripted all five, of about 287
on Normal: 42 / 69 / 84 before, 38 / 68 / 98 after; on Hard 6 / 34 / 41 of 166 to 277 before, 12 / 28 / 43 of 182 to 271
after (more calls on Hard because the games last longer).

(units by calibre, one report a volley) All nine cells re-run on seeds 1 to 72 after the British units were renumbered
smallest first and the observers answered each volley once (see the changelog). Nothing in the tables changed, but the
crews pick missions in unit order (the 60-pounders now choose first, the 15-inch fourth), the SOS and barrage spread follows
the ids, and a battery ranging with every gun gets one report on the mean point of impact instead of one a round: the auto
crews win more on Easy (39 before) and the scripted player on all five more on Normal (56 before; the elevation-limit run's
Easy 39 / 64 / 68, Normal 18 / 46 / 56, Hard 2 / 8 / 14; with the renumbering alone 50 / 65 / 67, 21 / 49 / 66, 1 / 6 / 14).
On Normal 54 % of the infantry reach the objective with auto crews, 64 % with the scripted 15-inch, 9.2-inch and 6-inch, 74 %
with the scripted player on all five.

(rail18) All nine cells re-run on seeds 1 to 72 after the railway gun became the 18-inch (cycle 60 to 90 s, 36 rounds instead of 50, the biggest blast and crater in the game). Before: Easy 39 / 66 / 69, Normal 14 / 48 / 61, Hard 0 / 4 / 15. Kills per game by unit on Normal (15in, 9.2in, 6in, 60pdr, rail), scripted all five: 2.1 1.3 1.0 1.0 0.6 before, 2.3 1.4 0.9 1.0 1.3 after (all auto 1.0 before, 1.5 after), so the 18-inch gets about as many kills as the 15-inch but fires only about 25 rounds a game; it does not win the game alone.

On Normal the auto crews hold 13 % of the SOS calls (scripted all five 34 %; the 46 % and 77 % noted here before were stale), 54 % of the infantry reach the objective on
average with auto crews against 74 % with the scripted player on all five (the attack needs 60 % on Normal, 50 % Easy, 70 % Hard). Tuning knobs:
`DIFFICULTY` (err, cb, dmg, assault, time, ammo, sig, zero), the dispersion and calibration in `GUNS`, `SHELLS` radii, the CB
cadence in `enemy.js` (one round per gun per 85 s / (cb * activity)), the breach penalty in `director.js` (0.5 of a sector per group in),
the AI delays in `crews.js`. After changing any of them re-run on 72 seeds or more; single games flip near the loss line.

## Research and upgrades (the open battles)

The career of the two research eras (1917 British, WW2 German; the WW1 German era stays an all-open sandbox).
`src/research.js` is the data and the pure functions, `src/progression.js` the saved career, the menu's Hangar
(`ui/menu.js` `hangarInfo`, `hangarMods`, `slotCards`; the 3D view `ui/hangar.js`) and Research screen (`researchView`)
the screens; docs/PROGRESSION.md says it for players.

- **Trees** (`TREES`): per era, `{ kind, tier, after, cost }` (RP). 1917: 6-inch (tier I) -> 60-pounder -> 18-inch
  railway; 6-inch -> 9.2-inch -> 15-inch. WW2: leFH 18 -> sFH 18 / Nebelwerfer; sFH 18 -> Mörser 18 -> Karl;
  sFH 18 -> K 18 -> Gustav. Costs 450 / 1,100 / 2,000 for tiers II / III / IV.
- **Upgrades**: `levels = { guns, shells, barrel, breech, sights, camo, supply, crew }`. Every battery starts with one gun and
  earns the rest of its pits (`maxGuns(kind)`, its open battle definition); each part has three levels (`PARTS[].fx`).
  Bought with the battery's own points (`nextCost`). `modsOf(levels)` gives the sim's multipliers `{ dmg, disp, wear,
  load, bias, lay, sig, ammo }`, all 1 for none.
- **In the sim** (`sim.newGame({ loadout, opposition })`; without them nothing changes, the British, WW2 and WW1 tests
  are bit-identical): `createUnits` mans the first `guns` pits (`render/guns.js` hides the rest; their pits stand empty)
  and sets `unit.mods`; `piece.layK` (laying rates in `slew`), the loading steps (`beginStep`), the lay's first-round error
  (`drawBias`), the dispersion and the calibration (`fireShell`, `createUnits`), the wear and the signature per round, the
  stock and the resupply, and `shell.dmgK` (multiplies a burst's damage in `Targets.applyBurst`). `opposition(era,
  levels)` weighs the lineup against the whole tree at full strength (each battery the same, times its guns' share, times
  up to 1.3 for parts): `cb` (counter-battery fire and raids) moves half way toward it, `assault` a fifth, neither above 1.
- **Pay**: `sim.credit(unitId, pts)` (never in attract or scripted): a quarter point per point of damage that counted and
  the target's `TARGETS[kind].score` for a kill (`Targets.damagePart`), and a mission done shares its points among the
  units by the rounds each fired on it while assigned (`mission.fired`, counted in `fireShell`; `Director.finish`, with
  `mission.points` over `POINTS`). `battleReward(sim, { won })`: each battery's credit times `PAY[difficulty]` (0.8 / 1 /
  1.35) as its points; RP = their sum + 4 a minute in action (up to 45) + 400 for a win. main pays once (`payOut`): at the
  end card, when the page is left (`pagehide`) or the battle is given up for another (no win bonus then).
- **Campaign missions** pay a one-off RP bonus on the first win (`missionBonus`: half the featured battery's research
  cost, at least 500) and no longer grant a battery.
- **Save** `drumfire.campaign.v3`: `{ completed, rp: { era }, researched, bp: { kind }, levels: { kind }, battles: { era },
  dev, devSet }`; a v2 save is read once (its won missions stay won and their batteries researched). Dev mode
  (`DEV_DEFAULT` on) lays every battery researched and at its top over the career in battle (`Progression.battle(era)`);
  the career underneath still earns and the menu's screens show it.
- **Measure** with `node tools/researchtest.mjs [seeds] [--era] [--lineup start|early|mid|full|max|part:<id>|all]`.
  Normal, all auto, 24 seeds: 1917 start 0, early 1 to 3, mid 2 to 9, full 7 to 9, max 7 to 14 wins; WW2 start 0, early 1,
  mid 17, full 5 to 10, max 2 to 6 (the WW2 counter-attack walks into its own short rounds: more guns kept firing means
  more of them, see the changelog). A lost start battle pays about 200 RP, a full lineup's about 1,500, a maxed one's
  about 2,200.

### Missions for the heavy and the long guns

`src/sim/specialists.js` `Specialists` (made in `Director.reset` and `DirectorWW2.reset`, stepped from
`Director.missionsUpdate`): the theatre's sites with a `role` get `destroy` missions with `role`, `points: 90`, priority 6,
a 1,500 s window and an aeroplane observer. **deep**: beyond every gun but the long guns (1917 `SITES` E1 to E3, 13 to
16 km out: the 18-inch railway howitzer; WW2 Flanders W1 to W3, 11 to 15 km west of the gun area: the K 18 and the
Gustav). **hard**: target kind `bunker` (three concrete shelters, `hardness: 'hard'`, 3 parts of 100; model
`models/t/mebu.js` `buildBunker`; delay fuze by default), with `minHard: 40` so `Crews.canServe` keeps every gun whose
`SHELLS[kind].hard.D` is under it off (1917 S1 to S3: the 9.2-inch, 15-inch and railway; WW2 V1 to V3: the Mörser 18,
the Karl, the Gustav). One of each role at a time, by day, from phase 2, first at 360 to 480 s, the next 240 to 420 s after
the last ended, sooner (120 s) when a battery that can serve one has had no mission for 90 s; never when no battery in the
field can serve it. Their own random stream (`mulberry32(seed ^ 0x5eed5)`), so they never draw on `sim.rng`. The crews add
10 to a role mission's score.

## Tutorial (phase 3)

A playable tutorial, reached from the menu's Tutorials tab (each lesson a page, `?tutorial=<id>`): a list of
lessons with completion ticks (localStorage `drumfire.tutorials`), each a list of steps run on a
scripted range. The pattern is iads `src/tutorial.js` (read only): an instruction card over the 3D view
(title, text, the objective line, Next/Skip/Exit, step counter), the console controls the step is
about pulsing (`data-tut` names through `src/ui/highlight.js` `tut(el, name)` / `setHighlight(list)`),
and a step completes when its `done(T)` reads true from the sim state; steps without `done` explain
and advance with Next. Esc or Exit leaves the lesson for the menu, with the lesson selected.

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

## Dicke Bertha mode (demo)

A first-person demo on the German side, meant to become a mode of the main game if it works: `bertha.html`
(a build input, reached from the menu's WW1 German battle "Big Bertha", `/bertha.html?play=1`; in a game or the tutorial the
"Title screen" button beside the gear (`#to-title`) leads to the title screen, whose back link returns there). One 42 cm M-Gerät
at `sector.js` `BERTHA` (10000, -2600, reverse slope behind the ridge, base line 253 degrees) and its
detachment; the player is one man at a time. It reuses the stage of the main game (atmosphere, terrain,
world dressing, craters, fx, flares, weather, post, audio, the chase camera for the shell ride, `HUD`), the
shell integrator (`sim/shells.js` `stepBallistic`, `flyPlane`, `heightAtDistance`; the British counter-battery
uses `solveElevation`, `autoCharge`, `maxRange`, `shellK` with the British `GUNS`), the British gun rigs
(`models/guns.js`, standing at their `UNITS` placements as targets), the crew figures (`models/v/crew.js`,
outfit `german`) and the model kit. Nothing in the main game reads it.

Files (`src/bertha/`): `ballistics.js` (Node-safe: `SHELLS` schwer 810 kg / leicht 400 kg with four charges
each, a charge is the number of Vorkartuschen ahead of the brass Hauptkartusche; `GUN` limits and crank rates;
`solve`, `choose`, `table`, `muzzleV`; `STRICH` = 2 pi / 6400), `game.js` (Node-safe `BerthaGame`: stations
`cmd trav elev load fire`, the Feuerleitung's orders, the loading drill as held actions, laying with instrument
settings, shells, observer reports and corrected orders, British targets and counter-battery fire; deterministic
per seed, `assist` lets the crew work every station but the player's), `model.js` (`buildBertha()`: pivots
`traverse elevation recoil wedge crane hook`, props, anchors `muzzle lanyard sight quadrant tray eye-*`),
`position.js` (the bed's surroundings, the aiming posts, the lanyard), `crew.js` (figures and poses from the
game), `hud.js` (order card with its checklist, station bar, prompt, readout, sight reticle, clinometer),
`index.js` (the page: stage, first-person camera, input, effects, `window.__bertha`), `bertha.css`,
`preview.html` (dev model viewer: `?cam=az,el,dist&el=&tr=&wedge=&recoil=&crane=swing,drop&props=1&crew=1`).

Game rules: an order (target, grid, shell, fuze, charge, line as deflection from the base line in Strich, elevation
in Strich) rings at the commander's telephone and must be read back (hold E). The barrel loads at 2 degrees and
cannot move with the wedge open; the loader opens the wedge, cranes the selected shell, rams it, adds bags (E)
and the case (R), closes; a wrong round can be unloaded. The line layer sets the deflection on the panoramic
sight and swings the carriage until the aiming post is on the hair (the sight view is parallax free); the
elevation layer sets the clinometer and centres the bubble. "Laid" is within 2 Strich. The firer pulls. The
observer reports the fall 4 to 9 s after the burst, the Feuerleitung corrects its aim point by what was seen
and sends the next order; a round within 60 m brings fire for effect (2 rounds). Lethal radius against a gun
in its pit: 40 m (heavy, instant) down to 25 m (light, delay); the Cloth Hall takes 3 hits. British units
that still have a gun and reach the bed fire back from the second round on, ranging in salvo by salvo; the
game is lost at 0 condition. Test: `node tools/berthatest.mjs [seeds] --difficulty all [--log]` plays the
whole drill with the crew logic (perfect, slow): Easy 16/16, Normal 16/16, Hard 2/16 on seeds 1 to 16; a
human crewing every station alone is slower, so Normal stays winnable but busy.

Language: English by default, German on the title-screen switch, the settings menu or `?lang=de` (remembered in
localStorage `drumfire.bertha.lang`). `i18n.js` holds the page's strings (`t(key)`, `tt` for textContent, static
markup tagged `data-i18n`); the game keeps both languages itself (`say(de, en)`, reasons as `{ de, en }`,
`fmtDefl(rad, lang)`, `SHELLS`/`FUZES`/targets/stations with German and English names), so it stays Node-safe.
In English the gun is "Big Bertha".

Tutorial (`tutorial.js`, the title screen's "Tutorial" button or `?tutorial=1`): two rounds of one fire mission
on the quiet range (`BerthaGame({ range: true })`: only the 6-inch battery, a small map error, no counter-battery),
15 steps on the `#tut-card` card. Each step is a short "why" and a checklist (`todo(game, view)`) of things to do,
each with its key and a live reading or the way to go ("Barrel now 37.2°, load at 2°", "the post is 12 mils
right of the line: hold D"); a station step's first item is always "press N to take this man's place", its
button on the bar is lit, and the first open item is marked as the one to do now. Round two is one checklist of
the whole drill. The instrument dials click onto the ordered figure when let go within a mil. Tested by driving
every step with real key events in `tools/shot.mjs` (all 15 reached, two rounds fired).

Crew (`crew.js`): one figure per job (models/v/crew.js outfits `german` with the M1916 helmet at the layers and the
firer, `german-cap` with the field cap, `german-drill` with the light drill jacket for the loaders and the cart),
each a small state machine over the game: he walks to his work, cross-fades poses, and his hands go on the moving
parts with the figure's IK every frame (the line, elevation, crane and breech handwheels, which turn with what they
drive (`rig.wheels`), the quadrant, the rammer staff as it goes up the bore, the shell on the hook, a powder bag
carried from the rack at the back of the stage, the lanyard). Before the shot the men at the gun clear to cover and
cover their ears. The player's man is drawn with his head hidden and the first-person camera sits at his eyes
(`crew.eye()`), so the player's own arms show on the controls. `__bertha.camAt(x, y, z, lx, ly, lz, fov)` fixes the
camera in the gun's frame for captures (no arguments releases it).

URL params on `bertha.html`: `?quality=`, `?play=1`, `?tutorial=1`, `?lang=en|de`, `?station=cmd|trav|elev|load|fire`, `?assist=1|0` (else the
remembered choice), `?hour=`,
`?weather=`. `window.__bertha`: `game`, `rig`, `station(id)`, `look(yaw, pitch)`, `instrument(on)`,
`followShell()`, `fastForward(seconds, { scale })`, `frame(dt, draw)`, `start()`.

## WW2 mode (German side)

A second mode of the main game, the menu's WW2 era (`/?mode=ww2`): the player commands German
artillery in the Second World War. It reuses the stage (terrain, world, fx, flares, post, weather, the chase
camera, audio, HUD), the sim's guns, shells, targets and integrator, the render layer and the console, through a
**theatre**: a data object that says which units, sites, sectors, lines, words and units of measure a battle uses.
The British game is the default theatre and is unchanged (simtest output is identical before and after).

Operations (separate places and years, because the weapons never served together; `src/ww2/ops.js`):

| id | Operation | Units | Notes |
|---|---|---|---|
| `flanders` | Flanders, autumn 1944 (fictional engagement on the game's Ypres map) | 1 leFH 18, 2 sFH 18, 3 K 18, 4 Mrs 18, 5 NbW 41, 6 Gustav (railway slot); the sandbox adds 7 the set-up Karl | the backbone: the British game's five phases with the sides turned round; Gustav and Bertha are labelled alternate-history guests |
| `sevastopol` | Sevastopol, June 1942 | Gustav (historical), a Mrs 18 battery | railway preparation, then scarce shots at forts, turrets, the cliff magazine |
| `karl` | Brest-Litovsk, 22 June 1941 | Karl-Gerät "Thor", an sFH 18 battery | showcase: drive, emplace, lower, load by the ammunition carrier's crane, fire |
| `v1` | V-1 launch site, autumn 1944 | one Walter ramp | strategic mission: prepare, launch, the flight |
| `v2` | V-2 mobile battery, autumn 1944 | one firing table | strategic mission: erect, align, fuel, launch |

URL: `/?mode=ww2` (the menu on its WW2 era), `&op=flanders|sevastopol|karl|v1|v2&play=1`, `&unit=N`,
`&tutorial=<id>`. Every operation is a page load (the theatre is fixed for the page).

### Kinds (shared registries)

Gun kinds (sim `GUNS`, `models/guns.js` `buildGun(kind)`, `models/shells.js` `buildShell(kind)` for the shell):
`lefh18`, `sfh18`, `k18`, `mrs18`, `nbw41`, `gustav`, `bertha`, `karl` (tables in `src/sim/tables_ww2.js`, merged
into `tables.js`), plus the launch sites `v1` and `v2` (rigs only; the sim's `v1`/`v2` are not guns). A German
gun row has `metric`, `side: 'german'`, `rowStep` (range table rows every 100 m), and may have `high` (falling
branch only: Karl), `salvo { n, dt }` (Nebelwerfer: one round is a ripple of six rockets) and `special` (a WW2
controller gates its loading and firing through `unit.gate`).

Enemy shell kinds: `q25` (25-pounder), `m55` (5.5-inch), `rp3` (Typhoon rocket), `bomb`, `s76`, `s122`, `s152`.
Missiles in flight: `v1`, `v2` (`models/v/de/missiles.js` `buildMissile(kind)`, which `buildShell` delegates to).

Target kinds (`TARGETS`, `models/targets.js` `buildTarget(kind)`, `models/t/layout.js` `partLayout(kind)`):
Flanders 1944 `abattery` (four 25-pounders), `amedium` (four 5.5-inch), `tanks` (five Shermans in a laager),
`adump`, `aconvoy` (moving: lorry, lorry, Sherman, carrier; it drives like the crossroads convoy), `aop` (an Auster
air observation post strip: two aircraft and a tent), plus the shared `hq` and `railyard`; Sevastopol `turret`
(two armoured twin-305 mm turrets of a coastal battery), `fort` (three casemates), `magazine` (a cliff with
tunnel mouths: only the heaviest delay shells harm it), `sbattery` (four Soviet 122 mm howitzers); Brest
`citadel` (four sections of the brick ring barracks), `gate` (a gate tower), `eastfort` (three works of a horseshoe
fort). Aircraft for raids and spotting: `models/t/ww2/aircraft.js` `buildAircraft('typhoon' | 'il2' | 'storch')`.

### Rigs (model space as everywhere: front -Z, ground y = 0, metres)

The German guns follow the gun rig contract ("Models"): `traverse elevation recoil breech` pivots, `setTray`,
anchors `eye muzzle breech tray shellStack crew[]`, `loadEl` matching `GUNS[kind].loadEl`. Builders (file:
export): `v/de/lefh18.js: buildLeFH18`, `v/de/sfh18.js: buildSFH18`, `v/de/k18.js: buildK18, buildMrs18`,
`v/de/nbw41.js: buildNbW41`, `v/de/gustav.js: buildGustav, buildGustavSite`, `v/de/bertha.js: buildBerthaGun`
(an adapter over `src/bertha/model.js`), `v/de/karl.js: buildKarl`, `v/de/v1.js: buildV1Site`,
`v/de/v2.js: buildV2Site`, `v/de/missiles.js: buildMissile`. `loadGuns(GUN_KINDS_WW2)` loads them lazily.

Extras by kind:
- `nbw41`: six tubes; `rig.setRounds(n)` shows n rockets in the tubes (0..6); `rig.anchors.muzzles[0..5]` the tube
  mouths (the ripple fires them in order); the crew fire from cover (role `firer` 12 m to the side).
- `gustav`: no traverse of its own: `setTraverse(az)` moves the whole gun along its firing curve (radius
  `rig.curveR`, centre of curvature on the left at (-R, 0, 0) in the rig frame: the gun stands at
  (R cos az - R, 0, -R sin az) turned by az). `hoist` pivot (the shell lift at the rear, position.y),
  `rig.setAssembly(k)` 0..1 (bogies, lower carriage, upper carriage, barrel and breech appear in turn).
  `buildGustavSite()` -> `{ root, setStage({ survey, track, cranes, ammo, flak, camo }) }` (each 0..1): survey stakes,
  the curved double track laid progressively, the two gantry cranes, the ammunition train, the flak batteries,
  camouflage nets (see the changelog for `setWorks`). Same frame as the gun's rig at az = 0.
- `karl`: `setTraverse` +-4 degrees on the hull; `rig.setLower(k)` 0 travelling, 1 hull down on the ground;
  `rig.setDrive(dist)` turns the running gear; the Munitionsschlepper (ammunition carrier on a Panzer IV chassis)
  parked alongside is part of the rig with `crane` (rotation.y) and `hoist` (hook height) pivots and
  `rig.setSchlepper(k)` (0 alongside, 1 gone for more shells).
- `bertha`: the demo's model as a gun rig (`setBreech` drives the wedge, the crane and hook as `crane`/`hoist`).
- `v1` (the launch site, ramp along -Z rising 6 degrees): `rig.setMissile('none' | 'trolley' | 'ramp')`,
  `rig.setWings(k)`, `rig.setGenerator(k)` (the steam generator trolley coupled), `rig.launch(t)` (t s since the
  shot: the piston and sled run up the ramp in about 1 s), anchors `muzzle` (ramp top), `ramp0` (foot), `richthaus`.
- `v2` (the firing point): `rig.setErect(k)` (Meillerwagen arm, 0 flat, 1 rocket upright on the table),
  `rig.setMeiller(k)` (0 at the table, 1 withdrawn), `rig.setTable(rad)` (the table and rocket turned about the
  vertical), `rig.setFuel({ alcohol, lox })` (hoses and the frost on the LOX tank), `rig.setRocket(visible)`,
  anchors `rocket` (the rocket's base on the table), `bunker` (the firing control vehicle).

Crews: German WW2 outfit `german44` (M35 helmet, field grey) in `models/v/crew.js`; `render/crews.js` takes the
German kinds' roles from `render/crews_de.js` (`ROLES_DE`) and `render/crews_heavy.js` (`ROLES_HEAVY`).

### FX and audio additions

`fx.rocketLaunch(p, dir)` (one Nebelwerfer rocket leaving its tube: flash, the backblast of dust and smoke that
gave the launchers away), `fx.trail(pos, vel, kind, dt)` (smoke or exhaust behind a rocket or missile in flight,
called every frame by the render layer: `'rocket'` while it burns, `'v1'` the pulse jet's flame and thin trail,
`'v2'` the flame and the white contrail), `fx.v1Launch(p, dir)` (the steam catapult's cloud), `fx.v2Ignition(p, k)`
(k 0 pre-stage, 1 main stage: flame, steam and dust off the deflector), big calibres (Karl 23.6 in, Gustav 31.5 in)
in `gunBlast` and `shellBurst` scaled with caps.
`audio.rocket(pos)` (a launch howl, the "moaning"), `audio.shell(shell)` voices for kinds `nbw41`, `v1` (the
pulse jet, Doppler, cut-off), `v2` (none: it arrives before its sound), `audio.v1Launch(pos)`, `audio.v2Launch(pos, k)`,
`audio.siren(on)`, `audio.aircraft(obj)` (a fighter-bomber's engine on an object with `pos`, `alive`).

### Simulation

`new Sim({ heightAt, los, groundAt, seed, theatre })`: `theatre` (default none: the British game, unchanged and
bit-identical in simtest) supplies `units`, `sites`, `bounds` (the shell kill box, 90 km), `sosCommand` and the module
classes (`Targets`, `Observers`, `Enemy`, `Infantry`, `Crews`, `Director`, and `Special`, stepped after the guns).
`src/ww2/theatre.js` `ww2Theatre(opId)` builds it (and pushes the operations' levelled pads into `sector.js`
`PAD_EXTRA`, so it must run before the terrain is first sampled). Shared changes, all inert for the British units:
`unit.def` (its definition), `unit.gate` (a reason string: no loading, no firing, `order.ok` false with that reason;
`order.why` keeps the guns' own reason), `unit.loadThrough` and `unit.stowed` (the Karl's hull, below), `def.ammo` (a fixed stock) and `def.resupply` (special units get none),
`GUNS[kind].salvo` (a round is a ripple: `piece.ripple`, `piece.tubes`, `shell.tube`; the rockets are counted at the
'shell' step, there is no rammer), `GUNS[kind].high` (falling-branch range tables and solver), `rowStep`,
`shell.guided` (a missile flown by its controller, not the integrator) and unknown commands handed to
`sim.special.command(unit, name, args)`.

WW2 modules (`src/ww2/`): `ops.js` (the five operations: units, sites, phases, clock keys, history text, the Karl's
positions, the V-weapons' target), `targets.js` (Allied and Soviet kinds; enemy batteries are `t.battery` with
`t.shell` q25/m55/s122/s152/s76; hardness 'deep' needs a `deep` shell row and the delay fuze; the magazine goes up in a
chain), `observers.js` (VB reports in metres, "weiter 150, links 50"; the Storch rounds to 50 m), `infantry.js` (the
British infantry logic turned round: Allied attacks east into our Sperrfeuer, with our machine guns' toll; our
counter-attack west behind the Feuerwalze), `enemy.js` (Allied or Soviet counter-battery fire, the Trommelfeuer on
our front, harassing fire on our villages, air raids: `raid(target, { n, kind, weapon, warn })` makes aircraft in
`sim.aircraft` that dive, release rockets or bombs and leave; flak around a site can bring one down), `crews.js`
(what each German kind is for; the Karl waits for its emplacement instead of giving a task up), `director.js` (the
operation's script and phases, Sperrfeuer and Feuerwalze in Flanders, the sieges' end when the works are down or the
heavy gun's shells are spent), `special.js` (the controllers, below), `theatre.js`, `ui.js` (the console's words),
`render.js` (pictures), `tutorial.js` (lessons).

Special controllers (`unit.special`, plain data; commands through `sim.command`):
- Gustav: `tasks [{ id, name, de, work, done, gangs, max, needs, state }]`, `gangs` (3), `ready`, `stage { survey,
  track, cranes, ammo, flak, camo }`, `assembly`, `flak` and `flakSpoil` (from the flak batteries in place: the raid's
  kill chance and bomb scatter); commands `gang { task, d }`, `hurry`. Auto mode assigns the gangs along the critical
  path. Raids on the site set work back. Ready when survey, track, cranes, assembly and the
  ammunition train are done; then the gun fires through the normal cycle, 8 (Flanders) or 10 (Sevastopol) shells, no
  resupply, barrel wear 0.35% a round.
- Karl: `stage` travel | driving | emplace | pivot | lowering | down | raising, `positions`, `posId`, `lower` 0..1,
  `drive` (m, for the tracks), `heading`, `schlepper { state, t, k }`, `reserve` (shells at the dump); commands `goto
  { id }`, `pivot { bearing? }` (onto the laid line), `lower`, `raise`, `fetch` (150 s for four shells). The unit's
  and piece's positions and bearings move with it. The gun is laid only from a hull that is down: otherwise the
  controller sets `unit.stowed` and `sim/guns.js` keeps the barrel flat (`loadEl`, the middle of the traverse), puts a
  laid round back to wait at its `lay` step and, without `loadThrough`, gives up a cycle whose shell is not yet
  rammed (the shell stays on the carrier; a rammed one is closed up and waits at its lay).
- V-1 / V-2: `steps [{ id, name, de, dur, set?, state }]`, `i`, `doing`, `t`, `settings { compass, range }`,
  `solution` (the firing data), `wind`, `fault` ({ text, fixText, cost, ignorable, risk }), `cover`, `rampHp`, `lox`
  (V-2, boils off 0.09 %/s once in), `flights [{ n, fate, state, miss, text }]`, `left`; render hints `where wings
  generator erect meiller table fuelA fuelL missile launchT`; commands `step`, `set { compass, range }`, `fix { how:
  fix | ignore | scrub }`, `cover`, `repair`, `topup`. The launch puts a guided `v1`/`v2` shell in `sim.shells`; it
  flies until it leaves the map, then its fate (rolled at launch from the drill's errors and the game odds) is
  reported after a compressed flight time. The mission ends (`sim.over`) when every round is spent and settled.
- Set-up units (`def.ready: true`, the WW2 sandbox's Karl in `src/campaign.js` `sandboxTheatre`; the V-1 and V-2 honour it too): the
  controller starts them ready to fire and its crew reloads and lays in any mode. Karl (`special.quick`): hull down in
  `positions[0]` on the zero line, the breech empty and the barrel at rest like every other battery (piece `idle`), so
  each round, the first too, goes through the normal loading cycle; a
  line outside the 4 degrees is raise, turn, lower by the crew (`autoLay`) while the loading cycle runs (the controller
  sets `unit.loadThrough` off the road: `sim/guns.js` `needLoad` then passes the gate and an out-of-arc line, and the
  `lay` step holds the round at `loadEl` until the hull is down, as the other guns load while they traverse); the
  carrier fetches by itself. V-1 / V-2
  (`special.quick`, `special.trigger` 'fire' | 'prestage'): every step before the trigger done, `settings` the
  solution, the A4 fuelled; after a launch the V-1's prepared steps (wings, compass, air log, fuel, fuzes) stay done
  and the crew runs the rest (102 s), the A4's whole drill (290 s); a `set` that changes a value whose step is done
  puts that step back (`relay`), the A4's table turning from where it stood (`tableFrom`); the crew fixes faults and
  takes cover only from raids within 1.5 km of the site; the step key fires (the A4's Hauptstufe follows by itself).

Events added (optional): `special(unit, what, x)` ('ready', 'drive', 'step', 'done', 'launch', 'result'),
`raid(raid, 'warning' | 'attack', plane)`. `tools/ww2test.mjs [seeds] --op all --difficulty all` plays every
operation with the auto crews (all-auto Flanders on seeds 1 to 8: Easy 6, Normal 5, Hard 2 won, with the first order at
0 s and one report a volley; Hard 1 before the Sperrfeuer lost its deadline).

### The gunner (the player in person at a gun)

P, or MAN on a gun's row of the guns card, puts the player in person into the detachment of a gun of the selected
battery: the Big Bertha demo's drill on the main game's guns. The kinds are the leFH 18, the sFH 18, the K 18, the
Mrs 18, the Gustav and the Karl (`gunner.js` `MANNABLE`; the Nebelwerfer, fired from cover, and the launch sites, with
drills of their own, refuse with a reason, and so does the Gustav while its railway preparation has it in pieces,
`p.fixed`). The camera sits at the eyes of the man at the player's post, the gun card lies over the 3D view,
and the console beside it still commands the Group.

- **Posts** (`POSTS`): `cmd` Geschützführer reads back each new fire command for this gun (hold E, 1.2 s). `lay`
  Richtkanonier: A/D traverse, W/S elevation, Shift fine. The wheels ease onto the command's mark and stop there (let go
  to pass it), and let go within a Strich they make the last turn. `load` Ladekanonier: open, shell, ram, cartridge,
  close (hold E). `fire` Abzugskanonier: prime, then the pull (hold E, 0.7 s). The steps are the piece's own
  `GUNS[kind].load` and `STEP_POST` gives each its post; a step the player works takes at most `HOLD` (8 s) of
  holding, and so does the lay check once the gun is laid (the Gustav's 70 s shell hoist is 8 s in the player's
  hands; no field gun step is longer than 8 s, so they are unchanged). The heavies' `depress` is the layer's (S to the
  loading angle). The elevation is locked while the breech is open, and through the heavies' prime. Laid: within 1
  Strich. While the others load, the prompt sends the layer at his post to the line (and on a gun loaded at its lay,
  the elevation with the breech shut).
- **The powered drives** (`DRIVEN`: the Gustav, the Karl). Their laying rates are slow (the Gustav 0.08 degrees a
  second along its curve and 0.35 in elevation: about two minutes from 40 degrees to the loading angle), so a tap of
  W A S D at the layer's post starts the drive (command `drive { axis: 'az' | 'el', dir }`, `st.drive`) and it runs on
  at the gun's own rate, whichever post the player goes to, until it is on the mark, against a stop, or the breech is
  opened under the elevation; the same key the other way stops it, Shift held is the hand wheel. The prompt counts the
  drive down in Strich and seconds. The Karl's coarse laying stays the console's: raise the hull, turn the vehicle,
  lower it (L, T, L on the KARL card, which keeps its keys at the gun, as Y for the carrier). `u.stowed` (the hull not
  down) is honoured as in `sim/guns.js`: no laying, a laid round back to its lay step, a cycle not yet rammed given up
  unless `loadThrough`, the barrel down to its loading angle; while a controller's gate holds the gun the prompt
  names it and an auto battery's patience does not run out.
- **Crew help** (`assist`: C, the card's button or the gear menu; localStorage `drumfire.gunner.assist`). On, the other
  posts work at the crew's pace: the read-back after 2.5 s, the steps at 1/crewK, the lay at the gun's rates, the pull
  0.9 s after the order's time once laid. Off, nothing at another post moves until the player goes there. The crew
  helps only while it has 30 % of its men.
- **Orders.** The gun's command (`st.order`) is the unit's order laid for this piece (`p.cmd`, charge, fuze). A new
  one (another target, a correction, a sheaf, another charge or fuze) must be read back before the layer has its marks,
  the loader starts or the firer may pull. On arrival, the command in hand counts as read back. An auto battery's AI
  commander gives the fire orders (guns.js `fire`). The gun keeps the order's time and `p.fireAt` stays at Infinity
  until a pull starts, so the crew covers its ears with the pull. A manual battery is the player's from the console,
  and a pull with no fire order fires this gun alone on the battery's order, its rounds per gun (`fire(u, [i])`). An auto battery does not wait: rounds
  ordered that the gun has not moved on for 40 s lapse, with a radio message.
- **Other batteries** (`othersAuto`, the gear menu, default on): those on manual go to auto while the player is at a
  gun and back to manual on leaving, if still on auto.
- **Shape.** `sim.gunner` (`Gunner`, made by `SpecialWW2`), and `sim.gunner.st`: null, or `{ unitId, pi, kind, post,
  assist, order { az, el, charge, fuze, ok, why, n, acked }, ack, hold { what, t, dur }, next { post, key, text, wait },
  why, others, drive { az, el } }`. `piece.manned`: `sim/guns.js` `updatePiece` hands such a piece to `sim.gunner.updatePiece`. The piece
  keeps the cycle's fields, so the console, the crew's choreography and leaving the gun mid-cycle work unchanged.
  Commands `man { piece, post, assist, othersAuto }`, `post { post }`, `unman`, `assist { on }`, `drive { axis, dir }` go through
  `sim.command` and `SpecialWW2.command`; they are not in TAKE_MANUAL, so manning keeps the battery's mode.
  `sim.gunner.setInput({ az, el, fine, work })` every frame. Event `gunner(what, a)`: 'man', 'unman', 'post',
  'order', 'ack', 'mark', 'nofire', 'pull', 'lapse'. A gun knocked out puts the player back at the console
  (`check()`, after the guns' step), and so do a new game and the end of a battle; a lesson refuses `man`.
- **Page** (`gunnerView.js`, `gunner.css`). `POST_ROLE` names the crew role at each post (officer, chief or
  sergeant, layer, loader or loader1, lanyard). `render/crews.js` `GunCrew.setPlayer(role)` hides that man's head (he is never the
  casualty taken off the gun) and `eye(out)` gives his eyes. The camera sits a little behind and above them (`VIEW`),
  turned to the post's work: the middle of the barrel for the commander, the muzzle for the layer, the breech for the
  loader and the firer (`VIEW_KIND`: the Gustav's and the Karl's commanders stand further back and higher). Main cuts
  the camouflage nets away round the sim's piece positions, so the Karl's nets clear where it stands now, not on the
  approach road. A drag looks round, the wheel zooms (12 to 75 degrees) and the near plane is 0.1. Keys at
  the gun: 1 to 4 the posts, W A S D E and Shift, C crew help, N the next gun, P leave, F rides the shell. The Panel's
  `keysOff` keeps W A S D E Q and the digits from the console, which keeps the rest (missions, corrections, Space for
  the battery). While the player is at a gun, main sets `fx.closeUp`: a blast or burst within 80 m of
  the camera throws fewer puffs (`fx/artillery.js` `lod`: q times 0.35 at the eye, back to 1 at 80 m, at their usual
  size), as at arm's length its smoke would otherwise cover the screen many layers deep. Main: `#man-gun`, `syncGunner()` follows `sim.gunner.st`, `__drumfire.man(i, args)` (null leaves),
  `__drumfire.gunner`.
- **Test**: `node tools/gunnertest.mjs [seeds] --kind all --assist both --difficulty all [--manual] [--op]`. A scripted
  gunner at No. 1 gun in the Flanders battle (the Karl in its own operation, or `--op flanders` for the open battle's
  set-up Karl; the Gustav at the siege with `--op sevastopol`, manned once it stands; everything else on auto) reads
  `st.next` and holds its key, or taps it to start a drive. Manned with crew help the Gustav and the Karl keep the
  auto crews' pace (the siege Gustav about 300 s a round against 297; alone, holding E at each step, faster).

### Crew voices (the open battle and the Karl-Gerät; the WW1 open battle)

German callouts at the guns and on the field telephone, with subtitles: synthetic speech made offline (Piper; recipe in
docs/VOICES.md) by `tools/pick-voice-takes.py` and `tools/make-voices.py` from the line table `tools/voice-lines-ww2.json`
into `public/audio/voice-de/` (`lines.json`: `{ id: { file, speaker, ch: 'gun' | 'phone' | 'radio', de, en, seconds, log? } }`),
played by `src/ww2/voices.js` (`CrewVoices`, page code: it reads the sim and never changes it). Only on the pages of the
operations in its `VOICED_OPS` (`flanders`, `karl`, and the lessons that run on them, and the WW1 open battle `ridge`);
on every other page (Sevastopol, V-1, V-2, the Paris Gun, the campaign missions, the British game) main builds no voices
object, so those pages are unchanged.

- **1918** (`era: 'ww1'`, main passes it on a WW1 page) speaks with the same clips; none is made for it. The WW1 guns
  take the callouts of their drill: the K 17 and the sFH 13 the light guns' (shell by hand, "Kartusche rein", the
  lanyard), the Mörser 16 the tray (`TRAY`), the Langer Max and the Gamma the lift ("Granate am Aufzug, hoch!", `LIFT`)
  with bag charges and the friction tube (`BAGS`); the charge is called from its name as before ("Ladung 5", "Kleine
  Ladung"; the Langer Max's Vorkartuschen and Bertha's have no clip, so no charge is called). Three WW2 clips are kept
  out of 1918: the air observer's radio lines (in 1918 he reported by wireless telegraphy, so his reports come as the
  observation post's on the telephone, `OBS.ww1`), "Panzer in der Bereitstellung" (a Mark IV laager gets the general
  call, `m_any`) and the counter-attack's barrage call (the Feuerwalze is our attack; the battery officer's "Feuerwalze!"
  at the guns says it). The British batteries are `m_cb`, the dumps `m_adump`, the road traffic `m_convoy`, the brigade
  HQ `m_hq`, the railhead `m_train`; "Hier Abteilung" stays.

- **Channels**, one utterance (a list of clips played back to back) at a time on each. `gun`: the Batterieoffizier
  (shouted commands and alarms), the Geschützführer and the Ladekanonier of the voiced gun, heard where they stand through
  the engine's routing (`audio.enqueue` and `route`: the 343 m/s delay, distance low-pass, the sfx bus) with a shout's EQ.
  `tel`: the Abteilung, the battery's telephone operator and the VB on a field telephone, the air observer on a radio,
  at the player's ear (`audio.uiBus`) through band-limited chains with a little drive, key clicks and line noise (the radio
  narrower, noisier and fading).
- **Who is voiced:** the selected battery (at a gun, the one served), and the calls to every gun (new fire missions,
  Sperrfeuer, the Feuerwalze's lifts). Its voiced gun is the one the player serves, else the lowest-numbered gun standing.
- **Events** (chained by `attach(sim)` after main's own): `load` (each step of `GUNS[kind].load` of the voiced gun, its
  'ready'), `fire` (the first round of a volley: "abgefeuert" to the observer; the gun's callouts still waiting dropped),
  `report` (a head, the range and the line, each a clip chosen from the report's text; a figure with no clip of its own
  says "wie gemeldet"), `mission` ('new' by target kind; 'done' and 'failed' of the selected battery's mission),
  `incoming` (within 350 m of its guns), `casualty`, `pieceDestroyed`, `targetDestroyed`, `targetHit` (fire for effect on
  its target), `sos`, `lift`, `raid` (a warning within 2.5 km, an attack within 1.5 km).
- **Watchers** (`update(sim)` every frame after the sim's step, on the selected battery): a new target (the Feuerkommando:
  new target, fuze, charge; Sperrfeuer, Feuerwalze and its lifts), a correction, a charge or fuze the player changed, a fire
  order (`unit.volleys` grew: which guns, and the rounds for effect), a cease (the rounds ordered gone without the last of
  them fired, or HOLD), the whole battery ready, the Karl's stage and its ammunition carrier.
- **Queue** (the Kirov fire cues' rules): priorities 0 loading steps and effect on the target, 1 Feuerkommando and missions,
  2 ready reports, observer reports, "abgefeuert", cease fire, casualties, 3 fire orders and alarms; a line waits at most
  2.5, 6, 8 or 10 s by priority on the wall clock (`performance.now`, never the game clock); a newer utterance with the
  same key replaces one still waiting; a fire order cuts a lesser callout at the guns short and takes a waiting fire
  command of its battery with it; a gun's ready report waits 0.4 s (an order to fire at once replaces it) and is not given
  while it still has rounds ordered; a loading step said less than 15 s ago is left out (a field howitzer firing for effect
  calls every other cycle); lines are started from `update`, so those of one frame go out by priority, and the next
  follows as soon as the last ends.
- **Page:** subtitles `«German» English` in `#voice-sub` over the 3D view; the telephone lines the sim does not log itself
  (missions, Sperrfeuer, lifts, mission ends: `log`) also go to the HUD's radio log; the console's VOICES button
  (`#voice-btn`, in `#panel`) and V switch them, remembered in localStorage `drumfire.voices`; mute and volume act on them
  through the master. Main: the optional import, `voices.load()` and `await voices.ready()` behind the loading screen
  ("Briefing the crews", after the audio banks; every clip decoded by an offline context, the telephone lines at 11.025 kHz),
  `voices.attach(sim)` after the event wiring, `voices.update(sim)` before `audio.update`, the load handler leaves out the
  synthesized English "Ready!" of the voiced gun (`replacesBark`), key V, `__drumfire.voices` (its `log` lists every
  utterance: `{ t, sim, ch, ids, de, en }`).
- **Test:** `node tools/voicetest.mjs [--op flanders|karl|sevastopol|v1|v2|ridge|paris] [--unit N] [--seconds S] [--scale K] [--then N:S]`
  plays the battle in real time without drawing, prints the lines in order and checks the rules (one line a channel, a fire
  command with each "abgefeuert", reports after shots, on `ridge` no WW2-only clip: `fu_`, `m_tanks`, `m_barrage`), and on
  the other operations that there are no voices.

## WW1 German mode

A third mode of the main game, the menu's "WW1 German" era (`/?mode=ww1`): the player commands the heavy artillery
of a German Gruppe in Flanders, spring 1918, on the game's Ypres map with the sides turned round (our guns on the
ridge in the east fire west at the British gun line, which stands in the British game's own gun pits). It is built as
a **sandbox**: one open battle with the whole roster but the Paris Gun from the start, and the Paris Gun's own mission
(as the WW2 mode's V-1 and V-2 have theirs); no campaign and no locks. It reuses the stage,
the sim, the render layer and the console through a theatre, exactly as the WW2 mode does ("WW2 mode (German side)";
its modules subclass the WW2 ones), and the British game and the WW2 mode are unchanged (simtest and ww2test give the
same results with and without the WW1 tables). Research, sources and departures: `docs/WW1.md`.

URL: `/?mode=ww1&op=ridge|paris&play=1` (`op` defaults to `ridge`; `&unit=1..6` in the battle, `&difficulty=`,
`&quality=`, `&hour=`, `&weather=`). The theatre is `src/ww1/theatre.js` `ww1Theatre(opId)` (id `'ww1'`, `era: 'ww1'`,
metric, side german; `sectors` only for the battle; every op's pads are levelled on the first call); main loads it (and every
other WW1 file) only on a WW1 page, sets `GUN_ERA.ww1` (`models/guns.js`: Bertha in its 1917 colours) and
`CREW_ERA.ww1` (`render/crews_ww1.js`: every German crew in the 1917 dress) before the rigs are built, and calls
`loadGuns(GUN_KINDS_WW1)`.

| id | kind | gun | pieces | position (x, z), zero | notes |
|---|---|---|---|---|---|
| 1 | `k17` | 10 cm K 17 | 2 (36 m apart) | (9300, -600), 272 | shrapnel |
| 2 | `sfh13` | 15 cm sFH 13 | 4 | (7200, -2600), 270 | |
| 3 | `m16` | 21 cm Mörser 16 | 2 (44 m apart) | (7600, 3800), 262 | |
| 4 | `max38` | 38 cm SK L/45 "Langer Max" on its E. u. B. mounting, set down on a prepared bed | 1 | (12800, -1800), 268 | |
| 5 | `bertha` | 42 cm M-Gerät "Dicke Bertha" (the WW2 row, shared) | 1 | (8400, -1650), 256.5 | `special: 'bertha'` (the bed), `resupply: 1`; nearer the front than the demo's bed so its 12 km and 11.5 degrees reach the British heavies |
| 6 | `gamma` | 42 cm Gamma-Mörser on its bed | 1 | (11200, 1800), 265 | `special: 'gamma'` (the bed), `ready` |

The units are ordered by calibre, smallest first (ties by shell weight): the ids, the keys 1 to 6 and the tab column
follow it; the menu's WW1 hangar (its batteries along the bottom) and Research screen list the battle's six and then the Paris Gun. Code finds a unit by its
kind, never by its id.

The Paris Gun's mission (op `paris`, kind `'paris'`, "Paris Gun" in the menu), built like the WW2 Gustav's and
V-weapons' missions: one unit, id 1 `paris`, the Paris-Geschütz at (16000, -3500) facing 270 (`special: 'paris'`, 65
shells; 30 degrees each way on its racer; not `ready`: it starts in pieces on its prepared bed), no sites, one phase
(Feuerstellung), clock 06:00 to 18:00 over 2700 s (`timeLimit` 2700). First the Stellungsbau (work gangs the player
sends to the tasks), then each round's Feuerablauf (gauge and charge, firing data, load and lay, the firing key);
the Armee's orders (`op.paris`) come once the gun stands. No British gun reaches it, only Camel raids (enemy.js
`HUNT`). The board draws the plain grid (no salient, no lines). The gun starts on manual (A hands it to the crew).
Controller `src/ww1/paris.js` (below).

The British side (`src/ww1/ops.js` sites, `src/ww1/targets.js`; models in `models/t/ww1/`):

| kind | what | parts | model |
|---|---|---|---|
| `bgun15`, `bgun92`, `bgun6`, `bgun60`, `bgunrail` | the British game's five units, the real rigs (`buildGun`) in their own pits at the UNITS placements, three posed men a gun | 1, 2, 4, 2, 1 | `british.js` |
| `bfield` | 18-pounder battery (`qf18.js` `buildQF18`, a full rig, limber and wagon) | 4 | `british.js` |
| `bballoon` | Caquot kite balloon and its winch lorry; falls burning like the German one (built, but the battle has no balloon site: its missions were left out) | 2 | `british.js` |
| `bdump` | ammunition dump with a 60 cm light-railway siding | 5 | `british.js` |
| `btanks` | four Mark IVs (male, female, male, female) in a laager | 4 | `rear.js` |
| `bconvoy` | AEC Y-type, GS wagon and four horses, Thornycroft J, GS wagon and pair; drives like `aconvoy` | 4 | `rear.js` |
| `hq`, `railyard` | the shared kinds | 3, 9 | |

Every British battery fires back with its own shell (`bl15 bl92 bl6 bl60 rail` rows of tables.js, `b18` and `b45` of
tables_ww1.js). British aircraft in `sim.aircraft`: `re8` (an artillery spotter that circles the loudest unit; while
it circles their counter-battery on that unit finds its mark faster) and `camel` (ground-attack raids with four
`cooper` 20 lb bombs, the WW2 raid machinery); models `models/t/ww1/aircraft.js` `buildAircraft1918(kind)` (the WW2
`buildAircraft` interface; `gear: null`; the Camel's `stores` are hidden as it drops them).

### Kinds and registries

Gun kinds `sfh13 m16 k17 max38 gamma paris` (`src/sim/tables_ww1.js` `GUNS_WW1`, every row `era: 'ww1'`, merged into
tables.js; `FFE_WW1.bertha` is merged into the WW2 row key by key) and the shared `bertha`. Shells (`SHELLS_WW1` and
`models/shells.js`): the six guns' own, `b18`, `b45` (British), `fk16` (the division's field guns, see below),
`cooper` (the Camel's bomb). Targets: `TARGETS_WW1`, `models/targets.js` loads every `models/t/ww1/*.js` that exports
`BUILD` (except `*preview*.js`, which are page scripts), `TARGET_KINDS_WW1`; part layouts in
`models/t/ww1/layout_british.js` and `layout_rear.js` (Node-safe, read by `models/t/layout.js`).

Rigs (the gun rig contract, "Models"; builders registered lazily in `models/guns.js` `GUN_KINDS_WW1`):
`v/de/sfh13.js: buildSFH13`, `v/de/m16.js: buildM16` (a `loadTray` pivot like the K 18's; recoil cut by a table at
high elevation), `v/de/k17.js: buildK17` (the top carriage turns 3 degrees, beyond that the trail swings with it),
`v/de/max38.js: buildMax38` + `buildMax38Site(seed)` (the car on a turntable ring over an open well, the ring
railway to the hoist; `rig.max38` gives the crew's places), `v/de/gamma.js: buildGamma` + `buildGammaSite(seed)`
(`{ root, setCamo(k), camo }`; pivots `tray` and `lift`, `rig.setLift(k)` for the inclined shell lift, `rig.staffLen`
5.5, no recoil drawn below 34 degrees), `v/de/paris.js: buildParis` + `buildParisSite(seed)` (the 34 m barrel with its king-post truss on a firing frame over
a concrete turntable and a curved racer; pivots `traverse elevation recoil breech tray crane hoist`, anchor `post` the
truss head; `recoilFade` keeps the stroke off the turntable at 55 degrees; the site's `setPortal(k)`, the portal crane
for a barrel change, and `setCamo(k)`), `v/de/bertha.js:
buildBerthaGun1917` (the 1917 finish; `buildGun('bertha')` uses it when `GUN_ERA.ww1`). The regular units' gun pits:
`v/de/gun_sites_ww1.js` `buildGunSite1918(kind, seed)` for `sfh13 m16 k17 bertha` (built flat at y = 0: the theatre
levels pads under them). Site builders take the gun's rig frame at zero traverse. Crews: one module per kind in
`render/ww1/<kind>.js` (`ROLES`, optionally `LIGHT`, `WORLD`, `STAFF` and the hooks `state mechanisms act props`),
merged by `render/crews_ww1.js`, called by `render/crews.js` before the heavy hooks. Dev pages beside the models:
`v/de/ww1_field_preview.html`, `k17_preview.html`, `max38_preview.html`, `gamma_preview.html`, `gamma_clip.html`,
`paris_preview.html`, `paris_clip.html`,
`models/t/ww1/preview.html`, `aircraft_preview.html`; `/models.html?kind=<kind>` and `clipcheck` load the WW1
builders too.

Levelled ground: `src/ww1/ops.js` `ww1Pads()` pushes a pad per piece into `sector.js` `PAD_EXTRA` (`[rx, rz, back,
right]`, the pad's middle moved behind and to the right of the gun where a site needs it).

### Simulation (`src/ww1/`)

`ops.js` (the battle `ridge`: units, sites, phases, clock keys from 05:30; the Paris Gun's mission `paris`: its unit,
targets and orders), `theatre.js`,
`director.js` (the WW2 Flanders day in 1918 terms: Einschießen, the Artilleriekampf, the British attack and the
Sperrfeuer, night and Störungsfeuer, X-Zeit: a 180 s Feuervorbereitung (`PREP`) then the Feuerwalze; while the red
flares are up the division's own 7.7 cm field guns fire a thin Sperrfeuer of `fk16` shells, `own: true` with
`unitId: null`; at X-Zeit the auto crews of the batteries that fire the plan leave their other missions; win when `ZERO_NEED` of our
assault reaches the British line: Easy 54 %, Normal 60 %, Hard 64 %; loss:
two sectors or every gun; the Paris Gun's mission has no script, its controller ends it), `enemy.js` (British
counter-battery by kind with its own rate and reach, harassing fire, the Trommelfeuer before their attacks, star
shells, the RE8 and the Camels; in the Paris Gun's mission only `huntUpdate`: from 150 s, a raid of two or three
Camels on the site every 240 to 420 s by day, times the site's `hide`, divided by the root of the difficulty's `cb`,
with the site's `flak` and `spoil` (paris.js: before the camouflage task 0.05 and -0.4, a 42 m scatter; after it 0.3,
0 and `hide` 1.5; `raid()` reads `target.spoil`)), `targets.js` (`TargetsWW1`; the British
batteries are found by ranging and sound, a one-gun position is silenced only when its gun is gone), `infantry.js`
(the WW2 turned-round battle; a lane of the Feuerwalze with too few bursts in the last 20 s costs our assault men),
`observers.js` (VB, Flieger, Fesselballon; Schall- and Lichtmeßtrupp give no reports), `crews.js` (the super-heavies
keep their shells for the heavy targets and never answer the Sperrfeuer; the K 17 takes the far targets and the
traffic), `special.js`, `grid.js` (`ww1Ref`: "7037 b 13", a 1 km Planquadrat, its quarter a to d, a 100 m small
square 1 to 25; the form is the game's own, docs/WW1.md 1.6), `ui.js` (the console's words), `render.js` (pictures).

Special controllers (`unit.special`, plain data; the full field list is at the top of `src/ww1/special.js`):
- Bertha and the Gamma (`BedCtl`): set up and ready; normal guns through the loading cycle (the Gamma laid on the
  falling branch, `high`, from 43 to 75 degrees). Their handwheels give 11.5 and 23 degrees either way of the bed's
  line (`u.arc`); a target beyond needs the bed relaid: command `rebed { bearing? }` (default the line to the ordered
  target; the console's T and the guns card's BETTUNG UMLEGEN key), `REBED` 0 s for both for now (instant: the bed is
  on the new line in the same step; it was 100 s, hours and a day in reality; to be restored), during which
  `unit.gate` holds the gun and the gun, its pit or site and the camera root swing to the new line in the middle half
  of the work (`unit.zero` and every `piece.bearing` move; the render layer follows `piece.bearing`). With a 0 s
  `REBED` the radio, the guns card and `guns.problem` leave out the time out of action. `unit.special.bed = { state: 'set' | 'moving', t, dur, from, to }`. `guns.problem`
  names the remedy for an out-of-arc order on a unit with a bed. The auto crews relay the bed only when nothing in the
  arc wants them and a worthwhile target beyond leaves time for the move and a shoot (60 % of the time, checked every
  30 s). Their pads (`ww1Pads`) are squares round the gun that hold the site at any bearing.
- Paris Gun (its own mission, op `paris`; `ParisCtl` in `src/ww1/paris.js`, the full field list at its top).
  **Stellungsbau**: the site starts empty but for the spur, the portal crane and its rails and the timber stacks;
  `TASKS` (bed: concrete bed, turntable and racer, 110; bank: earth bank and screens, 90; frame: run in the firing
  frame, 80, needs bed; barrel: lower in the barrel with the portal crane, 200, needs frame; truss: rig the truss, 70,
  needs barrel; ammo: field railway, ammunition train and charge bunker, 110; met: weather station and Rechenstelle,
  70; camo: camouflage nets and flak posts, 80, optional; work in gang-seconds, `max` gangs each; `tip` the console's
  English), `GANGS` 3; commands `gang { task, d }` and `hurry` (ALL HANDS: the gangs kept on
  the critical path; AUTO does the same); no work while the crew is in cover; a bomb within 90 m sets the work under
  way back (25 at the centre). The weather station's end brings the first Wettermeldung; the gun stands when all
  but camo are done (the auto gangs take about 250 s) (`ready`; the piece is `fixed` at 0 degrees until then); the camouflage gives the site `HIDDEN`
  (flak 0.3, spoil 0, hide 1.5) for `EXPOSED` (0.05, -0.4, 1). `stage` (each task's progress) is the render hint.
  **Feuerablauf**: `DRILL` (gauge: 20 s, then waits until the charge is within `CHARGE_TOL` 0.5 kg of the gauge;
  data: 20 s, then waits until the firing data are laid since the latest Wettermeldung (`dataT`); each step's `tip`
  is the console's English; load: the gun's
  own loading cycle, done when the piece is loaded and laid; fire: the firing key). The player's `step` (the card's
  big key, Enter) starts the round, goes on with a setting as set (`accept`), or fires; the next round waits for it
  again. `hold` names what the drill waits for. `FAULTS` (seal 8 %: carry on and the round falls 1 to 2 km short;
  droop 8 %: three times the spread) are rolled when the load begins and reported when it ends: `fix { how: 'fix' }`
  (40 or 50 s) or `'ignore'`. `unit.gate` holds the gun except while its load is waiting to start and at the firing
  key (so only the firing key fires, and a fault rolled for the load is always decided), and says why; between
  rounds `unit.stowed` with `stowLaid` (guns.js) keeps the barrel down at its loading elevation on its line.
  Fliegeralarm: while Camels run in on the gun (within `COVER_R` 2500 m) or their bombs fall, the crew is in cover
  (`unit.special.cover`, `COVER_GATE`): the work and the drill wait, the gun cannot fire or start a load. The auto
  crew (AUTO) assigns the gangs, takes `AUTO_PAUSE` 5 to 25 s over each decision and `AUTO_NEXT` 30 to 90 s before the
  next round, sets the gauged charge (a round or two behind the wear 30 % of the time), lays the table and part of
  each report with slips, fixes faults, changes a spent barrel before its next round, and lays on the open order due
  soonest that a round can still answer (more than 200 s left), else on the junction.
  Targets: military targets about 120 km west, off the map (`op.paris.targets`: Bahnknoten, the railway junction,
  119.0 km on 262; Tankpark, the tank depot, 117.8 km on 274; Truppenlager, the reserve camp, 120.0 km on 252;
  Flugplatz, the aerodrome, 118.4 km on 287), never a town and never named after a place; all lie in the gun's band
  with room for the wind's correction and inside its 30 degrees either way. A target may carry an `effect`, what a
  round in its area (`AREA` 400 m) does: 'supply', 'attack' and 'air' gain `FX` 0.15 (up to `FX_MAX` 0.45, wearing off
  over `FX_T` 600 s), read through `sim.special.effectK(effect)`; 'tanks' gives every open laager mission `TANK_HOLD`
  150 s more. In the mission only the aerodrome has one ('air': fewer Camel raids, one in that share stays on the
  ground, `enemy.js raid()`); the battle's effects (their batteries' rate of fire through `enemy.js supply()`, the
  size of their attacks through `director.js assault()`, the RE8 interval, the laager missions) stay in the code but
  need a Paris Gun in the battle, which no op has now. The Armee's orders (`op.paris.orders`: [at, target, rounds,
  minutes, why], five, at 30, 330, 660, 1020 and 1380 s after the gun stands; minutes times the difficulty's `time`)
  ask for rounds in a target's area by a due time; a round fired before then counts when its report comes; done gives
  100 points a round asked, too late nothing. The mission ends when the Armee has given every order and each is
  settled, or at `timeLimit`: won with `WIN` (0.8, 4 of 5) of the orders carried out; `sim.over` gives the end card
  ("Mission complete" or "Mission failed", the orders and the rounds in a target's area, or that the gun never
  stood). The procedure behind the drill: the shells are numbered in the barrel's set and each is fatter (21.0 to
  23.2 cm), the charge (kg) must rise with the bore's wear or the shot falls short, the line takes the Earth's turning
  and the day's wind aloft (the Wettermeldung, every 600 s once the weather station stands), the agents' fall report
  comes after part of the roughly 200 s flight (`REPORT_K`); the shot's random spread `SPREAD` 0.0015 in velocity
  (about 360 m in range; times the root of the difficulty's `err`) is smaller than the barrel's own hidden error
  (0.0025), which only the reports teach (`taught`: `table` lays the table plus it; a new barrel forgets it); after 65
  rounds the barrel is changed (`BARREL_DUR` 420 s; the mission opens on barrel 3 with 55 to 59 rounds through it).
  Other commands: `powder`, `pcorr`, `table`, `report` (the whole correction the newest fall wants, counted from the
  data that round was fired with, `flight.corr`, so a report that comes in after a correction is not laid twice; what
  the aim then carries beyond the table becomes `taught`), `aim { id? }` (another target: the corrections carry over,
  the table's wind part is relaid for the new line), `barrel`, and the normal `fire` (only at the firing key). The
  exported `nextFall(st, flight)` gives where the next round should fall on the data laid now (the flight's fall moved
  by the corrections since) and `correction(st, q)` the correction that brings it on, in metres, Strich and words; the
  shot's radio says when its report comes, the report's what to correct (or that the aim is good). The shell
  is `guided: true, paris: true`, flown by the controller until it leaves the map (40 km out or 60 km up); each
  flight records its `target` and `result` ('area', 'near', 'wide'); `sim.events.special(u, 'order', order)` when an
  order is given or closed, `(u, 'step' | 'done', id)` for the drill, `(u, 'ready')` when the gun stands.

### Console, pictures, sound

`src/ww1/ui.js` sets the console's words (1918 German missions, observers and fuzes from docs/WW1.md "Words",
metres and Strich, the Planquadrat reference, the Arko) and the KINDS rows; the board draws the salient and the
lines only in the battle. `src/ui/consoles/paris.js` gives the Paris Gun four cards in place of the British ones,
mounted by `console.js` (a special card's `left`, `top`, `bottom` and `aside`): the drill card (`left`, in the guns
card's place: STELLUNGSBAU, a row a task with its progress and its gangs (− and +) and ALL HANDS (J), until the gun
stands, then FEUERABLAUF: the big key for whatever the drill wants now (Enter: FIRST or NEXT ROUND, SET THE CHARGE,
LAY THE DATA, FEUER; FIX THE FAULT with O fix and I carry on), what the crew is doing (in the load the gun's own step
and its time), the four steps, a fault box, the crew, the gun, the shells and the site), the firing data card
SCHUSSWERTE (`top`, in the fire order card's place, so no unused British aiming keys show: the target, the open order
on it, the elevation and the flight time, LADUNG against the gauge, SEITE and ENTFERNUNG with the table's and the
reports' parts (the rows' German labels with an English gloss: powder charge, aim left · right, aim short · further),
the Wettermeldung (red until laid), TABLE (T), REPORT (.), LAY (L), and under the target line the aiming advice
(`advice()`: how to aim before the gun stands, the report's correction and REPORT lit while it waits, a new
Wettermeldung with TABLE lit, the round in flight and when its report comes, where the next round should fall), the gun's card
PARIS-GESCHÜTZ (`bottom`, in the missions list's place: the barrel's wear, the next numbered shell and the shells
left, BARREL (Y), the agents' reports on the last five rounds) and its targets card ZIELE (`aside`, in the range
table's place: one row per target, its range and line, the open order with its rounds and time left; a click, or Tab
and L, lays on it). Every label, row and key has an English `title` saying what it is and what to do (the task rows
also what they wait for and how long is left; the big key what pressing it does now). Keys that mean nothing on this
gun (R, Z, G, X, Backspace) say so. The status line names the card (STELLUNGSBAU or FEUERABLAUF) while the gate holds
the gun. The map: `src/ui/consoles/parisMap.js` on the artillery board through the theatre (`src/ww1/ui.js` sets
`TH.overlay`, `TH.hoverText`, `TH.mppMax` 450, `TH.boardHint`, `TH.fitTip`, `TH.aimTip` for the mission; shared
changes in `board.js`: it calls `TH.overlay(board, g, sim, unit, T)` after the units and shows `TH.hoverText(board, x,
z, sim, unit)` in the readout when it returns text, reads the hint and the FIT and AIM tips from TH, and its metric grid
steps 10 km when a kilometre is under 6 px; `console.js` hands a board click to `special.boardClick(x, z, mpp)` first):
the gun, the four targets 120 km west with their 400 m areas, names and the open order under each, the reach band (116
to 123 km, 30 degrees either way), the line laid on, the falls of the settled rounds, the shell in flight on its way,
and an inset (bottom right) with the target laid on magnified: the area, the 1 km ring, the line of fire and the last
eight falls, numbered, and a blue ring where the next round should fall on the data laid now (`nextFall`: it moves as
the player corrects). FIT takes in the gun and the targets; a click near a target lays on it. the order card's ADD/DROP/LEFT/RIGHT, the X step, rounds, fuze, charge
and `.` keys are offered to it first (`route()`), so each acts on the Paris Gun's own corrections or says why it
cannot. `ui/tracker.js` draws no fall of shot where a `paris` shell leaves the map. `src/ww1/render.js`
`createWW1Render(...)` places the gun pits and the three sites, draws the Paris shot (`fx.parisBlast(p, dir, { night, base })`, `fx/ww1.js`: a 70 m flame jet, a plume
up the line of fire, smoke and dust rings and a cloud that hangs for 35 to 55 s, from the existing pools),
rides the camera up with its shell and back, poses the Paris site and gun during the Stellungsbau (`stage`: the
rig's `bedGroup`, the concrete drum and the racer, rises with the bed; the traverse group, the frame with the barrel
and the crane, rolls in from 34 m behind onto the turntable, and `rig.assembly` follows it: until the frame is on its
bed the men work on the ground on the gun's left, between its run-in and the portal crane's rail (`render/ww1/paris.js`
`act`, the Gustav's rule in `crews_heavy.js`), then take their posts on its galleries; the portal crane runs over it as the frame
arrives and back as the truss is rigged; the barrel (the recoil group) comes down 7 m into the cradle; the site's own
groups through `buildParisSite`'s `setStage({ bed, bank, ammo, met, camo })`: the apron spreads from the turntable,
the earth bank and its screens rise, the field railway and the charge bunker go up and the ammunition train runs in
along the spur from its front end, the measuring hut, the weather mast and the theodolite go up, the camouflage poles
and the two anti-aircraft machine-gun posts rise; the net is spread when the camouflage is done) and during a barrel
change, and flies the British aircraft. Audio: `new AudioEngine({ ww1: true })` / `enableWW1()` renders the Paris Gun's report (`parisGun(pos)`)
only on WW1 pages. Menu: the era `ww1` (Battles: "Open battle", "Paris Gun" and the Big Bertha demo, each op's `tag`
its line under the title; the Campaign and Tutorials tabs say there is none; Your batteries shows 7/7, `ROSTER_WW1`
being every op's units). main shows a battle's toast and stand-to radio, or the mission's `sub` and the Armee's call
to Wilhelm; its end card is the controller's `sim.over`.

### Test and balance

`node tools/ww1test.mjs [seeds] [--op ridge|paris|all] [--difficulty Easy|Normal|Hard|all] [--player] [--quiet]
[--table] [--jobs N] [--log]` plays the open battle and the Paris Gun's mission (default both) with every crew on
auto; `--player` puts a scripted competent player on the Paris Gun instead (ALL HANDS, each round at once, the charge
to the gauge, the table and half of each report, faults fixed, the order due soonest, a spent barrel changed unless an
order would run out). On seeds 1 to 72, the battle all-auto (without the Paris Gun, the bed relay instant): Easy 20,
Normal 14, Hard 6 won with the Sperrfeuer without a deadline (Sperrfeuer held on Hard 20 of 215, 5 of 177 before; 20, 15, 1 won
before it), with the first order at 0 s and one report a volley (before them 21, 10, 3; the British game: 54, 22, 1; 27, 16, 5 with the Paris Gun in it and the 100 s relay; 25, 10, 3
with it and the instant relay). The Paris Gun's mission, all-auto: Easy 25, Normal 6, Hard 1 (3.1, 2.3 and 1.3 of the
5 orders; about 7 shots, 5 in a target's area on Normal); the scripted player: 59, 49, 10 (4.0, 3.8, 2.2 orders;
about 9 shots); the auto gangs stand the gun at 253 s; 4 to 7 raids a mission, none has destroyed the gun. Single games flip near the loss line: decide on 72 seeds. After touching `tables_ww1.js`, `src/ww1/*` or the shared sim, run it and `node
tools/simtest.mjs` and `node tools/ww2test.mjs` to confirm the other modes are unchanged.

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
- (rail18, integration) Unit 5 is now the British BL 18-inch railway howitzer on the ex-14-inch "Boche-Buster" car, callsign "Wolfe" (after HMS General Wolfe, the monitor whose 18-inch gun fired on the Belgian coast in 1918), replacing the 12-inch "Hilda". History: ordered 1918, proofed 1920 to 1921, never fired in the First World War; in this 1917 game it is a what-if gun (the README said so; now docs/HISTORY.md). Sim (`tables.js`): `GUNS.rail` calibre 18, shell 1,134 kg (2,500 lb), charges 340 / 450 / 570 m/s (the handbook's 182 lb and 282 lb bags, 570 m/s on the top charge), game drag `cd` 0.32 so the top charge gives about 20.4 km (22,300 yd) at 40 degrees (the railhead R1 is about 14.8 km away), elevation 10 to 40 degrees (the real gun goes down to 0; 10 keeps the short charges out of the ranges that the other guns cover), traverse +-48 degrees at 1.2 degrees a second (arcade: the real gun has 2 degrees on the car and the rest by moving the car on its curved spur, the game folds both into one slew so every site in the sector is reachable), loading cycle 90 s (depress 7, open 6, shell 24, ram 13, cartridge 18, close 5, prime 4, lay 11; the step names are the 15-inch's, the shell hoist replaces the trolley), crew 14 (the men drawn at the car; the real crew was about 50), hp 170, 36 rounds, flash signature 0.10 (the largest). `SHELLS.rail`: calibre 18, crater 10 m, soft R 68 D 85, hard R 34 D 120, lethal 58, wire 44, piece 66: the biggest in the game. Balance: see Balance (rail18). `fx/artillery.js` calibre scale clamps raised from 1.15 to 1.25 (18 / 15 = 1.2) so an 18-inch blast and burst are the biggest; audio already classes anything above 12 inches as `huge`. Sector: the pad under the car is 14 by 60 m, the spur is straight for 170 m (80 m behind the car, 130 m ahead of it) so the car's 6 m roll-back and its winch-in stay on track. World: `world/rails.js` no longer leaves a gap in the track under the gun; near it the bed is sunk so the rail head is at ground level where the rig's wheels run (rising back to the ordinary bed over 18 m); `world/battery.js` puts the camp beside the spur (22 m to the right of the camp frame), no duckboard walk or spent cases on the track, the reserve shell stack (2,500 lb shells) behind the rig's own two at the foot of the hoist (x 4.75, z 14.6), a camouflage net shifted 14 m to the right over the crates and the shelter, and `pitSolids` follows. Console (`ui`): '18-in Rly', title '18-INCH RAILWAY GUN', the board shows deep guns to 18.5 km east. Crews (`render/crews.js`): the railway gun now uses the 15-inch drill (hoist crane1 and crane2, the rammer team of four, the traverser on the wheel) with 4.2 m staffs; men whose spot has `car: true` ride the car's roll-back (`rig.pivots.car.position.z` is added to their z in `Man.put`); the cordite is carried by the first loader (left side) from the left (the stage is 2.8 m up, there is no ground route to it); the home places keep 6 cm more clearance on this gun. `crewfield.js` resets the car in its sweeps and widens the plan limits to z -16 to 32. Tutorial: the 'heavy' lesson step is 'wolfe' (text: an 18-inch howitzer, 2,500 lb, a what-if gun; about a minute and a half to load). `main.js` KIND rail is calibre 18, `NET_CLEAR.rail` 32.
- (ui) Report slips say what they report on: the round number (the same number as the fall of shot on the board), the gun that fired it (`No. N gun`, units of several pieces) and the task (`M<id>` and its title). The pad shows only the selected unit's reports (plus the Group's tasks and warnings; `Mail` keeps 40 slips). The tracker records each own shell's piece and the `order.adj` and `order.target` it was fired with (`tracker.fired`); the pencilled correction is read against the lay of now (`messages.js` `slipCorr`: the report's correction less what has been corrected since the round left, "Corr. now" when it differs), a newer report on the same task supersedes the older ones and a re-lay onto another target strikes them off, so "apply" and `.` never take another unit's report or double a correction already made.
- (framework) Resolution and upscale: the canvas now always has the display's pixel ratio (up to 2); the scene and the post chain render at the quality preset's ratio times the dynamic scale, and a final `post.upscale` pass (Catmull-Rom bicubic plus a contrast-adaptive sharpen, `params.upscaleSharpen`, gear menu "Upscale sharpening") fills the canvas when that is lower. `post.setSize(w, h, pr?)` takes the scene's pixel ratio (default the renderer's, so the dev viewers are unchanged) and keeps it in `post.pixelRatio`; code that wants scene pixels (the flares' pixel size) reads that, not `renderer.getPixelRatio()`. Dynamic resolution moved to `src/dynres.js` `DynamicResolution` (scale 0.67 to 1, GPU timer queries around `post.render` where `EXT_disjoint_timer_query_webgl2` exists, else frame times against the display's refresh, never aiming above 60 fps; a scale that fails right after a climb is retried after a growing back-off). The old rule could never climb back on a 60 Hz display. Terrain: the old craters' lip slope fades out once a pixel spans the lip, and the terrain's roughness is widened by the normal's screen-space variance (specular anti-aliasing), so crater rims and puddles no longer sparkle at a distance. F3 shows scene and canvas resolution, GPU time and refresh.
- (bertha) The Dicke Bertha first-person demo mode (section "Dicke Bertha mode (demo)"): `bertha.html`, `src/bertha/`, `tools/berthatest.mjs`, a title-screen link. Shared changes: `sector.js` exports `BERTHA` and `flatPads()` levels its bed (terrain changes only around (10000, -2600), far from every main-game site); `models/shells.js` gains shells `m42`, `m42l` and cartridges `m42` (bag), `m42c` (brass case); `models/kit.js` gains the camouflage scheme `bunt`; `src/presets.js` now holds `QUALITY`, `sunAt`, `SUN` and `blastTrauma` (moved out of main.js unchanged, shared by both pages); `tools/shot.mjs` also finds Chromium under `$PLAYWRIGHT_BROWSERS_PATH`.
- (bertha) English by default with a German switch (`src/bertha/i18n.js`), and a tutorial (`src/bertha/tutorial.js`, `BerthaGame({ range: true })`). The title-screen button now reads "Big Bertha".
- (bertha, models) Tutorial rewritten as per-step checklists with keys, live readings and directions; aiming posts moved to the front left of the gun (out of the morning sun), the layers' handwheels and the sight behind the road wheels, the loading stage forward under the tray. Crew movement and first-person body (`src/bertha/crew.js`), turning handwheels (`rig.wheels`). `models/v/crew.js`: German 1917 dress for the outfits `german`, `german-cap`, `german-drill` (M1916 Stahlhelm surface, Feldmütze, M1915 Bluse details, stone-grey trousers in jackboots, belt with box buckle, gas mask tin, bread bag and canteen) and the options `jacket`, `trousers`, `hd` (more segments); British outfits are unchanged.
- (rail18, models) Silhouette pass on `rail.js` (supersedes the heights in the first "(rail18, models)" entry; everything not listed is unchanged). The gun sits lower, as a car that ran on British lines (loading gauge about 4 m) must have: **bore axis 3.4 m above the rail head** (was 4.05): `traverse` at (0, 1.2, -0.8) (the roller path, was 1.6), `elevation` at +2.2 (was 2.45). End decks 1.85 m (girder tops 1.95, were 2.3 / 2.4); loading stage 2.3 m (was 2.8; now 1.1 m below the bore axis, was 1.25; still x +-1.45, z 4.9 to 8.0 behind the trunnion axis); running boards 1.37 m (was 1.77). The turntable is an open ring (r 1.15 to 1.42) and the breech dips at high elevation into a pit between the girders (car z 0.85 to 3.85, floor 0.32 m; the plates come down round it, the name plate is on that belly), so `floorFade` uses a 3.08 m drop and still gives about 0.26 of the stroke at 40 degrees. Axles: three groups of five at 1.05 m from z -9.3, -4.0 and +4.45 (the middle group moved forward under the turntable, clear of the pit). Cradle (sleigh) 6.4 m long (z -4.6 to +1.8 on the elevation frame), recoil cylinders from z -4.5, the recuperator at y 0.9 r 0.15, the clip at z -5.72. Shell hoist: jib underside 5.3 m (was 6.2), king post top 6.1 m (was 7.35, the highest point at rest is now the barrel and the derrick at about 5.8 to 6.1), counterweight painted drab; `rig.hoistRange` { up 4.85, down 1.37 } and the new `rig.hoistHang` 0.85 (the shell's middle below the hook, was 1.18): `crews.js` reads `hoistHang` (default 1.18) and, when it is set, `hoistRange.down` as the low hook height (bl15 keeps 1.72). The hook at `up` keeps its sling bar about 1.9 m above the stage so the swing passes over the men's heads. **Crew spots:** sergeant now on the ground at (-2.7, 0, -4.6) facing the muzzle, not `car` (the barrel at the loading angle passes too low over the front deck); layer (-1.95, 1.37, 0.15); traverser (1.95, 1.37, -1.7); lanyard (1.0, 2.3, 4.8); loaders and rammers y 2.34 (x, z unchanged); crane1 (0.55, 1.85, 9.55); crane2 (-0.45, 1.85, 8.05); ammo1 and ammo2 unchanged. `anchors.eye` is at traverse y +2.5. Crew check (rail, scn 0 to 2): max 0.206 before and after (the same pre-existing rammed-shell contact), homes unchanged except the sergeant. The rail rig's own `setRecoil` holds the stroke to `recoilFade` and its `setBreech` lets the block open fully only up to 12 degrees (shut by 22), re-applied by `setElevation`; both are no-ops for the game's poses (render/guns.js already fades the recoil, the block opens at the loading angle) and keep the model viewer's full-recoil, open-block poses out of the track: nothing moving goes below 0.40 m above the rail head at 0 to 40 degrees and +-48 degrees of traverse.
- (sim) Elevation limits follow the real carriages: `GUNS.bl92.elMin` 15 degrees (was 10), `GUNS.bl6.elMax` 45 (was 40), `GUNS.bl60.elMax` 21.5 (the Mk I carriage, was 30) with its charges raised to 317 / 408 / 508 m/s so the reach at 21.5 is what it was at 30 (Full about 11.1 km, the railyard just inside it). Balance on seeds 1 to 72 (all auto / scripted 15in+9.2in+6in / scripted all five): Easy 39 / 64 / 68, Normal 18 / 46 / 56, Hard 2 / 8 / 14 (before: 39 / 65 / 69, 20 / 46 / 58, 1 / 8 / 15).
- (models) Silhouette pass against the real guns (dimensions from the handbooks, Wikipedia, IWM and AWM; the rail gun's own line is above). bl15: barrel to z -3.5 with a slimmer taper (about 2.2 m ahead of the cradle), a rounded 2.5 m cradle sleeve, earth box 4.0 x 1.6 x 2.1 m, a steel bed 6.1 m wide. bl92: the Mk I (barrel 3.05 m), a cylindrical cradle, the recuperator rods pulled from a lug on the breech ring, `TY` 2.1, the earth box on the bed (fixed, 3.6 m wide) so the barrel swings over it. bl6: the recoil block under the barrel in a trough cradle (both recoil), side brackets open between them with a box trail from z 1.9 to the eye at 3.35, wheels at x +-0.82 on two axle arms, `recoilLength` 1.32 with `recoilFade` 1 - 0.54 * min(1, el / 0.785), `rig.nest` for the piston rods. bl60: barrel 4.3 m, trail eye at 3.78 and open between its girders, wheels at x +-0.78 (`addWheel` takes `cap`, the hub cap length, default 0.07), the dial sight low by the breech, a buffer under the cradle, `recoilLength` 1.4. The rig contracts (pivots, anchors, setters, `loadEl`) are unchanged; clip checks report nothing over 1 cm (bl6 and bl15 better than before) and crew checks are no worse.
- (WW2 mode) A German-side WW2 mode (section "WW2 mode (German side)"): `/?mode=ww2&op=...`, five operations, seven
  playable German units plus the Karl-Gerät, V-1 and V-2 missions. Shared changes, all inert for the British game
  (simtest seeds 1 to 4 Normal identical before and after): `Sim({ theatre })`, `unit.def`, `unit.gate`, `order.why`,
  `def.ammo`/`def.resupply`, `GUNS.salvo`/`high`/`rowStep`/`launcher`, `shell.guided`, `sim.special`, `sim.over`,
  `sim.bounds`; `sector.js` `PAD_EXTRA`; `models/guns.js` `GUN_KINDS_WW2`, `loadGuns(kinds)`, `EXTRAS`; `models/targets.js`
  merges `BUILD` maps from `models/t/ww2/*.js`, `TARGET_KINDS_WW2`, `layout.js` reads `t/ww2/layout_west.js` and
  `layout_east.js` (`CITADEL_R`); `render/targets.js` `aconvoy` drives and turns, `adump` burns, `anchors.vents` (the
  magazine's smoking tunnel mouths); `render/guns.js` places a rig by `u.def`; `ui/theatre.js` (`TH`, `setUiTheatre`,
  metres and Strich, the German grid, words, `fit`, `mppMax`); `tutorial.js` `Tutorials({ defs })`, `host.redirect`,
  `LESSON_KIT`; main: `?mode=ww2`, `#modes`, `#ops`, `#op-note`, keys 1 to 9. Models: `models/v/de/*` (German guns, the
  Gustav and its site, the Karl with its Munitionsschlepper, the Bertha adapter, the V-1 and V-2 sites, the missiles;
  paint schemes `dgelb`, `feldgrau`), crew outfits `german44`, `german44-gaiters`, `german44-cap`, `crewForRole(role, i,
  kind)`, `render/crews_de.js` (`ROLES_DE`, the Nebelwerfer drill, `nbwRounds`), `render/crews_heavy.js`; targets
  `models/t/ww2/allied.js` (`buildAlliedTraffic`, gun rigs `q25`/`m55`), `east.js`, `east_brest.js`, `aircraft.js`
  (`buildAircraft(kind)` with `setParked`, `setGear`, `stores`, `prop`). FX (`src/fx/rockets.js`): `rocketLaunch(p, dir)`,
  `trail(pos, vel, 'rocket' | 'v1' | 'v2', dt)` (call before `fx.update`), `v1Launch(p, dir, len)`, `v2Ignition(p, k)`,
  big calibres scaled with caps. Audio: `enableWW2()` / `new AudioEngine({ ww2: true })`, `rocket(pos)`, flight voices
  for `nbw41` (`shell.burning`), `v1` (`shell.engineOff`), none for `v2`, the `'colossal'` class from 20 in,
  `burst(pos, 26, { fuze: 'v2' })`, `v1Launch`, `v2Launch(pos, k, obj?)`, `siren(on)`, `aircraft(obj)`,
  `ui('feldfernsprecher' | 'funk')`. Research and departures: `docs/WW2.md`. Test: `tools/ww2test.mjs`.
- (ui) The unit tabs are a column at the far right edge of the screen, one row per unit (ten units in the WW2 Flanders sandbox read without squeezing): the clock, score and front chips on top, the selected card pulled out toward the console. `Panel` scales the console box (design 800 by 840, was 800 by 900 with the tab row) and the column (design width 160) by one factor; `#view` is 45 % of the width and `#panel` 55 % (was 50 / 50), `ui.html` matches. Tutorial wording: "the tabs at the right edge of the screen".
- (ww2 sim) Sandbox set-up units: `def.ready` (above, "Special controllers"). `sandboxTheatre` marks its Karl, V-1 and
  V-2 ready (the launch sites in manual mode, waiting for the firing key; A hands them to the crew) and levels the
  Karl's two positions. The launch controllers now advance to the first step not done (identical for the full drill);
  the procedure card's key reads FIRE / LAYING / RELOADING / FIRING on a set-up site. Operations and campaign
  missions unchanged (ww2test seeds 1 to 8 all ops and difficulties, simtest and progressiontest identical).
- (render) Detail by distance and GPU uploads (render only; the sim and its tests are untouched). `render/detail.js`
  `DetailCull`: a mesh whose bounding sphere projects under about 0.8 px (at 1440 rows, scaled with the field of view)
  gets `layers.mask = 0`, so neither the main nor the shadow camera draws it; its `visible` stays with the code that
  poses it. `createRender` returns `detail` (every gun rig and target is in it; `detail.update(camera)` runs at the end
  of `render.update`, a third of the meshes a frame, all of them after a camera cut); `GunViews(..., detail)` and
  `TargetViews(..., detail)` take it as their last argument. `TargetViews.build` (every new game) now frees the old
  models' geometries, materials and textures that nothing in the scene still uses (`render/dispose.js`
  `disposeDetached(scene, roots)`); they were kept on the GPU before. WW2 scenery (`ww2/render.js`): one slot per
  Gustav site, battery works and gun position, drawn within 4 km of the camera (the Gustav site 15 km, and in
  `detail`); `w.reset(sim)` after `sim.newGame` (main's `newBattle`) frees the scenery of batteries not in a game (the
  title's demonstration and the lessons keep everything) and builds missing slots again. `render/warmup.js`
  `warmUp(renderer, scene, camera)` draws everything once into a 4 x 4 target at load (after `compileAsync`) and in
  `newBattle`, so buffers and textures go up then, not in the frame that first sees them. Main: gear menu "Hide
  sub-pixel detail" (`params.detailCull`), a `detail` line in the F3 overlay. Measured, same views: WW2 Flanders 1283
  to 958 draw calls (leFH 18), 1200 to 611 (Bertha), 960 to 612 (K 18); British 642 to 499 (60-pounder); a frozen frame
  with the culling on and off differs in under 10 pixels of the landscape. A default career's WW2 sandbox holds 265 MB
  of geometry instead of 460 MB.
- (models) Fewer draws in the Karl and the Gustav's site, same pictures and behaviour. `heavy_common.js`
  `wheelSet(template, places, parent, name)` -> `{ meshes, turn(a) }`: identical wheels turning together about their
  own x axes, one InstancedMesh per material. The Karl's 22 road wheels, 2 sprockets, 2 idlers and 12 return rollers
  use it (`setDrive` calls `turn`; the hull's lowering, the track, the carrier, crane and hoist are unchanged): the rig
  is 54 draws (was 153; as many again in the shadow pass). The Gustav site's 20 camouflage-net poles are one
  instanced set per material in the order they go up (`setStage` sets the count; was 40 meshes, now 2). The Gustav
  rig itself (45 draws, stages already merged and bogies instanced) is unchanged. Checked: the model viewer at fixed
  poses (the Karl travelling, lowered, loading, close on the sprocket and idler; the site at camo 0.2 to 1 with the
  gun at assembly 0.1 to 1) against captures from before, at most 48 pixels differing by rounding; the w-karl and
  w-gustav lessons on autoplay finish every step. In game (WW2 Flanders): the Karl view 692 to 490 draw calls, the
  Gustav view 525 to 446.
- (ww2) The V-1 and V-2 are out of the WW2 sandbox (`sandboxTheatre` adds only the Karl, id 8, to the Flanders
  roster): they fire in their own operations. `BATTERIES` marks them `sandbox: false`; the career list reads "Earned:
  fires in its own operation" for them and a campaign win "now available in its own operation". `def.ready` still works
  for the launch sites (special.js) should a theatre want them set up.
- (ui) Dev mode is a switch: the career panel's footer button (`#dev-unlock`) reads "Dev mode ON / OFF" with a status
  light and turns it either way (`Progression.setDev(on)`; `unlockAll()` stays as `setDev(true)`). Off, the career is
  what was earned again (the completed missions are kept apart from the flag).
- (ww2 sim) The sandbox Karl starts set up but unloaded (piece `idle`, empty, at `restEl`), as every other battery
  starts; it showed READY with a shell in the breech, yet a mission off its 4 degrees still raised, turned and lowered
  the hull and laid the barrel again before it fired. Now a mission on its line fires after the loading cycle (about
  170 s), one off its line after the turn as well (about 195 s).
- (models) The German guns' second reference pass, one per weapon from museum photographs, period handbooks and the
  surviving examples (sheets in `refs/<group>/README.md`: lefh18, sfh18, k18_mrs18, nebelwerfer41, gustav, bertha,
  karl, v1, v2; captures `shots/<kind>/compare.png`, photo / before / after). Pivots, setters and anchor names are kept;
  draws over the ten rigs 354 to 337 with about three times the triangles. Per weapon:
  - leFH 18 (`lefh18.js`): the 1944 leFH 18 (M) on the split-trail carriage (US Catalog of Enemy Ordnance, IWM B 7600):
    L/28 barrel ahead of a one-piece shield with hump, cowl and sight window, two-port muzzle brake, recuperator above
    and buffer below, the cradle's open tail, right-hand equilibrator, wooden 14-spoke wheels, riveted trails spread 60
    degrees. `setTraverse` turns the top carriage 25 degrees each way and the new `carriage` group (wheels, trails)
    beyond that (the crew shifting the trails); `recoilLength` 1.19 with variable recoil; 23 draws. Its gun position
    (`gun_sites.js` `side`) is 4.7 so the spades clear the walls at 60 degrees.
  - sFH 18 (`sfh18.js`, TM-E 30-451 fig. 37/38): L/29.5 barrel with the chase step, recuperator above a riveted buffer
    trough, trunnions just ahead of the breech ring, two spring equilibrators that follow elevation, no shield, double
    disc wheels with solid tyres, riveted trails with step plates; `recoilLength` 1.2, `rig.nest`, `shellStack` (1.25,
    0.1, 3.3), crew spots moved (layers behind the wheels, the loading team between the trails); 23 draws.
  - K 18 / Mrs 18 (`k18.js`): 8.53 m slim barrel against 6.51 m collared barrel with a bigger ring on one cradle (breech
    1.75 m behind the trunnions, 2.2 m up), recoil cylinder on top, equilibrators to trunnion arms, the round firing
    platform with roller pieces, raised disc wheels under mudguards, trail float and castor jack, grated walkways at 1.1
    m. New `loadTray` pivot with `rig.setTray`; the recoil fade moved inside `setRecoil` (no `rig.recoilFade`); the
    tray round is `shell-tray`; 25 draws each.
  - Nebelwerfer 41 (`nbw41.js`): six touching tubes in a flat-topped hexagon with collar, rear plate, latches, contacts
    and leads to the junction box on the upper right; the PaK 35/36 carriage with elevating arc, traversing sector,
    sight box and V-strut foot. The six rockets are one instanced mesh per material and sit fully in their tubes; the
    remote trench is left out of the rig's bounds; 26 draws. The Wurfgranate (`shells.js` `nbw41`) has the blunt nose
    cap, the slightly proud venturi band with the 26 nozzle mouths in its rear face and the narrower 121 mm warhead.
  - Gustav (`gustav.js`): fitted to 47.3 m overall, 7.1 m wide, 11.6 m above the rail head; girder halves with the low
    row of openings and sloping noses over low front decks, span bolsters on the bogie pairs, galleries, a sleeve
    cradle with four recoil cylinders, a two-part barrel with locking collar, lift towers with winding drums; anchors
    and crew spots moved with the geometry (lift station z 18.8, hoist up 6.8); 49 draws.
  - Bertha (`src/bertha/model.js`, adapter `bertha.js`): solid disc wheels with Radgürtel shoe chains, the arched
    riveted shield, a four-cylinder cradle, muzzle swell, front jacks and crew platform, split box trail with spade
    trough, gooseneck crane, steel wheel bed. `buildBertha({ finish })`: 'bunt' (the demo, default) or '1914' (plain
    field grey, `CAMO.feldgrau14`, the WW2 guest); the WW2 rig's shell trolley runs on rails; berthatest unchanged.
  - Karl (`karl.js`): it fires over its stern, as the sources agree: engine deck, driver, sprocket and loading ramp at
    +Z, the 18-vane idler at -Z, eleven steel road wheels with the track as a tangent belt, a riveted box cradle,
    ladders, lugs, side platforms, silencers; the carrier gets a raised lattice crane and grab. Trunnion 3.1 m
    travelling, deck 1.95 m (crew at 1.6 m), `floorFade` limits the recoil at high elevation; 47 draws.
  - V-1 site (`v1.js`, `missiles.js` V-1 part): the Walter ramp from the Duxford original (box girder, slotted tube in
    clamp yokes, bolted trestles on paired blocks), a firing platform with the generator's rails and block blast walls,
    the steam generator trolley (`setGenerator(0)` rolls it back to z 6.6), a timber Richthaus; the Fi 103 re-
    proportioned (As 014, pylon, aerofoil wings) in a canvas atlas of the 1944 scheme; ramp foot 1.35 m; 33 draws.
  - V-2 site (`v2.js`, `missiles.js` A4 part): screw-jack firing table with turning ring, fin pads and deflector (the
    rocket's base 1.5 m up, `T` 1.5), cable mast and umbilical, the Meillerwagen's lattice chassis, outriggers, lifting
    frame, clamps and rams, Opel Blitz alcohol and T-Stoff tankers, the LOX trailer, a Steyr power truck, the dug-in
    Sd.Kfz. 7/3; the A4 re-profiled with jet and air vanes in a splinter-scheme atlas. `A4.lox` [4.3, 7.5]; new
    `A4.joints`, `A4.plug`, `a4Radius`; `a4Pieces` defaults to roll PI/4; 45 draws.
  Known gap, unchanged: the V-1 and V-2 sites have no crew figures in game (`render/crews.js` has no drill for them).
- (ww2 sim) The sandbox Karl loads while its hull turns: `KarlCtl.gate` sets `unit.loadThrough` for a set-up Karl off
  the road, `sim/guns.js` `needLoad` then passes the gate and an out-of-arc line, and the `lay` step holds the round at
  `loadEl` until the gate clears (British units never set it: simtest identical). A line up to about 120 degrees off
  now fires in the same 169 s as one on the line (was about 200 s at 25 degrees, 230 s at 46). The guns card shows a
  controller's gate (raising the hull, turning the vehicle) instead of "idle".
- (sim, ui) **An order the guns cannot carry out is always explained.** `sim/guns.js` `problem(u, short = false)`: the
  reason in the player's words, '' when the order can be carried out or there is none: out of arc (degrees off the line
  of fire against the traverse, with what to do: the Karl's hull drill, or another battery), out of range or inside the
  minimum range (the distance against the limit, in yards or metres), a chosen charge that cannot reach where another
  could (Q/E), holding, a controller's gate (not for the launch sites, whose console walks the drill), no shells, too
  few men; `short` is the status line's form. `recompute` also keeps each piece's reason in `piece.cmd.why`.
  `sim.command` calls `sim.tell(u, refused)` after `mission`, `lay`, `correct` and `charge`, and after a `fire` that was
  refused or is held: a `radio(text, 'warn')` "<callsign>: cannot fire. <reason>." (the same words are not repeated
  within 4 s; `u.told`). The console: status line `CANNOT FIRE: <short reason>` in red (the whole reason as its
  tooltip), the FIRE key "cannot fire", the guns card per gun (out of arc, out of range, too close, too few men, no
  shells), the roster tile OUT OF ARC / OUT OF RANGE / TOO CLOSE / NO SHELLS / NO CREW (`.tltxt.st-bad`). Before, an
  out-of-arc order (Bertha's 11.5 degrees in the WW2 sandbox) left the gun idle with "reloading" on the status line.
  Radio only, no sim state: simtest identical, ww2test unchanged, the British and WW2 lessons finish on autoplay.
- (ui, text) The game makes no claims about real events or places; that material stays in the data and the docs. Not
  shown any more: the title screen's "History." note and ALTERNATE HISTORY badges (`ops.js` `history` and the units'
  `alt` are kept, unshown), the unit header's ALTERNATE HISTORY tag and the alt hint on selecting the unit, the console
  title "(ALTERNATE HISTORY)" and Bertha's "1914 ... as a guest" note, the lessons' history asides (the Gustav's 48
  rounds at Sevastopol, the V-1 and V-2 outros, "the guns are real", the British 18-inch "what-if" aside). The WW2
  operations lose their place-and-date framing: titles The ridge battle / The fortress siege / The citadel / A V-1
  launch site / A V-2 mobile battery, buttons Open battle / Gustav siege / Karl-Gerät / V-1 (Fi 103) / V-2 (A4); lesson
  openings The ridge / The firing curve / Thor / The launch site; the V-weapons' target is "the enemy supply port".
  The op ids, the in-game target names, the map's place names and the 1917 game's Ypres setting are unchanged.
- (ww2, campaign) Big Bertha plays only in its own demo (`/bertha.html`): it is out of the WW2 Flanders roster
  (`ops.js`, units 1 to 6), out of the WW2 campaign (`BATTERIES`: 12 missions, the Karl's mission now follows the
  Mörser's) and the sandbox's set-up Karl is unit 7 (was 8). The title screen's Big Bertha button stands only in the
  1917 section (removed in the WW2 mode and WW2 campaign missions). The `bertha` kind, its tables and the WW2 rig
  adapter stay (model viewer). All-auto Flanders on seeds 1 to 3 now wins 2 of 3 (was 1 of 3 with Bertha).
- (ui) Mission slips (`ui/consoles/missionList.js`): the map reference is replaced by the range from the battery in
  the console (metres or yards), red with "(out of range)" or "(too close)" against the kind's reach from its range
  tables (lowest charge's minimum, top charge's maximum; not for the launch sites). The priority stars were always
  three (priority runs 1 to 10, the card clamped it to 3): now 3 for 9 and up (SOS, barrage, the biggest targets), 2
  for 6 to 8 (counter-battery, harassing, tanks), 1 for the rest, with a tooltip. The order card and the board keep
  the map reference.
- (bertha) Demo pass for newcomers and engineers; the crew logic and the simulation are unchanged (berthatest
  identical on seeds 1 to 16). A Next line under the prompt always names the next job of the drill (`game.js`
  `next()`), the station for it is marked NEXT, and every refused key says why on a line under the prompt. The
  player's wheels ease onto their mark and stop there (the ordered scale, the centred bubble, the post on the hair, the
  2 degree loading angle: `wheel`, `latch`, event `mark`); press again to go past, Shift the fine wheel. Order card
  filled in as it is read back, corrections in mils, a round-in-flight bar and the last fall of shot, a chamber diagram
  for the loader, sight ring and drum readouts. Views (`index.js` `VIEW`): the layers on footboards with the camera a
  little behind their eyes, the loader's station a fixed eye on a step behind the stage with a look assist toward the
  work in hand. Model (`model.js`): variable recoil `recoilLength(el)` (1.25 m to about 30 degrees, 0.28 m at 65), a
  deck opening the breech recoils through, the tray on a roller carriage that runs back `TRAY_BACK` 1.35 m when the
  wedge shuts, the shell slung level under a spreader bar, dials over the handwheels (`setDials`). Fixes: the
  panoramic sight view is taken from the sight head (it went black once the carriage swung); the end card no longer
  throws (a frame clock `t` hid the string table). The tutorial jumps ahead when the player fires early.
- (ui, ww2) Launch sites (`KINDS[kind].launcher`) get their own console (`ui/consoles/launch.js`, `launchPlot.js`,
  `launchGauges.js`) in place of the board, the guns card and the missions card: FIRING DATA (target, bearing, ground
  range, the air log or cut-off with the wind correction; two dials showing the data and MATCH or the miss in km; a
  target-area plot with where the current settings send the round), the LAUNCH DRILL card (step N of 10, what the crew
  is doing, one next-action key: START THE DRILL / DIAL ... / FIRE / VORSTUFE / HAUPTSTUFE / TAKE COVER / NEXT ROUND,
  faults with FIX / CARRY ON / SCRUB and their cost or risk, a checklist), INSTRUMENTS (V-1: petrol, compressed air,
  steam pressure with its red line and the ramp speed, pulse jet, compass, air log; A4: alcohol, LOX with boil-off and
  the 92 % line, gyros, Vorstufe/Hauptstufe flame, table, Brennschluss counter) and ROUNDS (the flight profile, each
  round to its result, this round's odds). The tab shows the drill state. Every other console is unchanged.
- (ww2 sim) `LaunchCtl` MANUAL: the step command starts the drill and the crew carries on, holding (`special.hold`)
  for a setting off the data, a fault, a damaged ramp, the firing key and the Hauptstufe; every refusal sets
  `special.refused` and says why (status line, radio for the important ones). Faults are rolled when their step
  begins (`pend`) so the gauges show them coming. Cause and effect: the steam test pressure sets the V-1's speed off
  the ramp (`lastV`, shell `v0`; carrying on at low pressure risks a crash); a weather report between V-1 rounds moves
  the air-log figure; a setting changed after its step sends the crew back; LOX under 92 % falls short (shown on the
  plot); a Vorstufe left over 25 s is shut down. Steps shortened: the V-1 drill about 213 s, the A4 about 290 s. New
  `unit.special` fields: `run hold accept refused pend fixing alarm odds oddsRisk area sigma tol steamP lowSteam lastV
  ragged vorT gauges jet flame`, steps carry `crew` text, flights `at along lat lox v endT`. Lessons w-v1 and w-v2
  rewritten for the new console. Keys: Enter/Space the big key, arrows the dials (Shift coarse), B cover, O/I/X fix /
  carry on / scrub, R repair, T top up LOX, A auto.
- (ui) `.mid` in panel.css (the mission slip's number) is scoped to `.mrow .mid`: a `Bar` at 30 to 60 % also carries
  the class `mid` and was squeezed to 22 px wide (HP, wear, roster and sector bars).
- (render, models, fx) The V-1 and V-2 sites in 3D: `render/crews_vweap.js` `VCrew(rig, kind)` is the launch crew
  (V-1 10 men, V-2 12) driven like GunCrew from `unit.special` (a pure function of the step id, k = t / dur, cover and
  the render hints, so fastForward is exact); `render/guns.js` uses it for v1 and v2 (they had no crew: GunCrew threw
  on their cartridge kind). `poseVSite(rig, unit, sim)` poses the machinery every frame (ww2/render.js): the V-1's
  trolley from a new store to the Richthaus turntable (compass swung with mallets), round an S-bend to the ramp, the
  cradle jacked up and the missile slid onto the sled, fuel and air hoses, the steam generator rolled up and coupled,
  the crew to the trenches, the pulse jet run up on the ramp before the catapult, piston and sled thrown off the top;
  the A4's Meillerwagen backed in, outriggers jacked, rams erecting, collars opening (`setClamps`), the table turned on
  its crank, men on the platforms, tanker hoses per fuel (`setHoses`), frost and LOX vapour, the Meillerwagen folded
  and withdrawn, the Vorstufe and Hauptstufe on the table (fx `v2pre`, `v1run`, `vent`). Missiles are drawn from the
  sled or table, closing on the sim's track (2.6 s V-1, 7 s A4). Camera (`vFraming`, ww2/render.js `framing`,
  `reselect`, a guarded hook in main): each step reframes once (focus riding with the trolley), the player's orbit and
  zoom are left alone in between, the camera keeps to the sun's side, and the sites' own trees are cut away along the
  line of sight (`vweap_kit.js` `VCUT` linked to the CUTAWAY uniforms). V-1 rig: `setTrolley(x, z, heading, y)`,
  `setLift`, `setSlide`, `setHoses`, `setSled`, `rig.v1`, `rig.layout`; store, paths, second trench, step and fuel cart
  added, Richthaus doors 6 m. Draws with the crew: V-1 about 49, V-2 about 61. The set-up step list is the drill's own
  (`special.js` `QUICK`, exported). Viewer: `vpreview.html?kind=v1|v2&drill=<step>&k=`. The catapult cloud and the
  A4's lights and clouds are toned down (they whited out the screen).
- (post) Facing a low sun in clear weather no longer whites out the frame. three's UnrealBloomPass bright pass sent
  each texel over the threshold into the blur chain whole: the sun's disc (thousands of times the threshold after
  exposure) and, in the darker 1917 scene where auto exposure lifts the picture, a wide band of sky just over it were
  spread into a disc of white (worst at 07:00 to 08:00). post.js patches the bright pass: only the luminance above the
  threshold goes in (`uKnee` 1; 0 is three's whole texel) and it is capped (`uCap`, the colour kept). main's params
  `bloomCap` 8 and `bloomKnee` 1, both in the gear menu. Gun blasts, bursts and flares still bloom hard; midday views
  are unchanged. Also fixed: the sandbox B key's fake blast handed the render layer a piece without az/el, posing the
  rig with NaN (its muzzle and the queued sounds went non-finite and audio.update threw).
- (models, render) The A4's control vanes move. `missiles.js` splits the four air vanes (a radial hinge at s 13.6,
  the fins cut out for them with a 1 cm slot) and the four graphite jet vanes (a radial shaft at s 13.98) out of the
  merged parts (`a4Pieces(roll, { split: true })` returns `{ lists, vanes }`; `a4VaneLists`, `a4Vanes` as two
  InstancedMeshes; `A4_VANES`, `a4PitchProgram`). The V-2 site rig has `rig.setVanes(pitch, yaw, roll)` (radians of jet
  vane, 15 degrees at most, the air vanes at two thirds to 10; I and III pitch, II and IV yaw, all four roll); +2
  meshes, +4 draws with shadows. `crews_vweap.js` runs the electrical checks' vane test (three rounds of pitch, yaw
  and roll throws over k 0.16 to 0.94, a pure function of k) and twitches them about 2 degrees in the Vorstufe and
  Hauptstufe; the checks step's camera now frames the tail low on the sunlit side so the test is seen. The flying A4
  carries a morph target weighted per instance by `render/shells.js` (`setMorphAt`): a steady 6 degree pitch-program
  deflection of vanes I and III while burning, from 4 s to about 48 s.
- (ui) The title screen gave way to a main menu and a loading screen. `/` is the menu (`src/ui/menu.js`,
  `menu.css`): DOM only, nothing of the battlefield is built. It lists the entries of `src/menuItems.js` (pure
  data: the 1917 battle and the Big Bertha demo, the WW2 operations, the campaign missions and the lessons of both
  eras, with their locks and the game URL each opens) in the tabs Battles, Campaign, Tutorials and Your batteries;
  one entry is selected at a time, its briefing on the left, and Play mission opens it. Era, tab and selection
  change nothing but the DOM (remembered in localStorage `drumfire.menu`). A game page (`play`, `tutorial` or
  `sandbox` in the URL, `src/boot.js`) shows its loading screen (`src/ui/loading.js`, the entry's operation order
  with the load bar) before `main.js` is fetched, builds the world behind it and starts the battle or the lesson
  when loaded. New URL param `?difficulty=Easy|Normal|Hard`; `?sel=<key>` selects a menu entry (the way back from a
  game), `?op=` and `?campaign=` without `play` select theirs, `?lessons=1` opens the Tutorials tab. A locked
  battle or mission URL goes back to the menu. Main menu, a lesson's Exit and Esc leave for the menu.
  `ui/progression.js` keeps only the in-game objectives (`mountCampaignObjectives`).
- (render) The Gustav's crew stands on the ground beside the track while the gun is still being assembled
  (`rig.assembly < 1`, the railway preparation): a gang each side between the girders and the crane legs, back at
  their stations on the galleries once it is built (`crews_heavy.js` `heavyAct`). They stood in the air before.
- (render) Crew props follow the parts they rest on. They live in the rig's root, so a rig that hides a part left
  them standing: `crews.js` now hides the next shell when `anchors.shellStack`'s part is hidden and the shell in
  hand, the cartridges, the staff and the rope when `anchors.tray`'s is (the Gustav's waiting shell hung 2.3 m up
  over its wagon before the wagon rolled in). The heavy drill's equipment (`crew-heavy-equipment`: the control
  stations with their handwheels, the carts, the rammer drive, the slings) is hidden while the Gustav is unbuilt.
- (models, sim) The Gustav's assembly hangs from the gantry cranes. `heavy_gustav_site.js` exports `CRANE` (the
  cranes' stations, the bridges' underside, the hooks' rest, the sling) and `setHooks(rig.liftHooks)`, which
  lowers each hook onto the part below it with a two-leg sling and stretches its ropes to the bridge; `gustav.js`
  measures each part's top under the hooks at build time and lifts it no higher than the bridges allow (it was
  15 m for every part, so the upper carriage and the cradle came down above the bridges); `ww2/render.js` passes
  the hooks from the rig to the site each frame. In the sim the gun is put together flat: the controller holds the
  piece at its loading elevation with `piece.fixed` until the assembly is done (it was laid at 40 degrees while in
  pieces), then it lays as usual. Gustav siege, all-auto seeds 1 to 8: Easy 5, Normal 4, Hard 1 (6 / 4 / 2 before).
- (models, render) The German guns' loading trays, gun by gun, through loading, firing and laying:
  - leFH 18 / sFH 18 (no tray on the real guns): `anchors.tray` moved into the open breech (the round lay in the
    air behind it). `crews.js` `carryMan` lifts a round laid in the breech to the bore's height, turns it into
    line, brings it onto the bore behind the face and pushes it in (a straight path cut the cradle).
  - K 18 / Mrs 18: `loadTray` is on the recoil pivot, hinged at its lip in the open block's slot, on only at the
    loading elevation (it hung beside the breech with nothing holding it); `setBreech` also sets the tray; the
    viewer's `shell-tray` is a child of the tray. `crews.js` `pairMan` lifts the round above the tray before
    carrying it on (it rose through the tray's floor).
  - Karl: the stowed tray went through the left cheek plate, the railing at full traverse and the cradle at 20 to
    30 degrees; the cheek steps down to carry a visible cross slide, the tray is 2.45 m with a 0.85 m slide, the
    ramp lines up with it, `staffLen` 2.6. `crews_heavy.js`: the rammer drive rides the tray floor, the Karl's
    charge comes up the ramp on the bore line (no support cart).
  - Bertha (main-game adapter): `setTray` drives the demo's carriage, so the tray runs back for the shot (the
    recoil went through it); the crane swings behind the stage, `HANG` 1.0, crew spots clear of the run;
    `crews_heavy.js` guides stand wider on its open stage. Demo model: rear axle, rails and stops moved.
  - Gustav: checked, unchanged.
  - `crewcheck.js` skips meshes hidden at build (the viewer's `trayShell` read as steel) and reports what a carried
    shell touches.
  Open: the K 18 / Mrs 18 recoiling barrel goes up to 0.29 m into the top carriage's rear box near 25 degrees and
  0.16 m into the lower carriage's transom near 35 degrees (not the tray; it was there before).
- (models, render, sim) The Gustav's setup follows the sources (refs/gustav; the gun came in pieces by rail and was
  assembled on a straight three-track section under two 110 t gantry cranes on their own outer rails, the parts
  lifted off wagons on the third track; the cranes were put up with four hand derricks; two diesel locomotives moved
  the gun onto the firing curve). Nothing appears from nowhere any more:
  - `src/ww2/gustav_layout.js` (pure): the firing curve and, behind it, the straight (360 m at the fortress siege, 80
    elsewhere) with the two gun tracks, the delivery track (x 7.6), the cranes' rails (x -7.2, 12.2), a ladder of
    three yard sidings 8 m apart and the ammunition siding (x -27); `pathAt`, `pathU`, `vehicleAt` place vehicles on
    its polylines.
  - `src/ww2/gustav_works.js` (pure): `createWorks(layout, rig.works).update(st)` gives every train car, the two D 311
    diesels, the gun's eight bogies and two wagons, each part of the gun, the two cranes (along their rails, crab,
    hook, sling) and the four derricks (slew, luff, hook) from `st.stage` and `st.assembly`. The assembly's acts: the
    bogie units pushed in, the girder halves, the upper carriage (with the loading platform, the towers and the tray),
    the cradle with the barrel's rear half and the breech, the barrel's front half, then the drive onto the curve;
    each part rides its wagon from the yard, is lifted no higher than what it sweeps over needs, carried along and
    across and set down. The cranes' erection (st.stage.cranes) puts their sides up in three sections each and hoists
    their bridges; taking them down runs it backwards.
  - `heavy_gustav_site.js` builds all of it (`setWorks(pose)`; `setStage` keeps survey, track (the curve only), flak and
    camo; the straight, the yard and the sidings are there from the start); `gustav.js` splits the gun into those parts
    (`rig.works` measures them, `rig.setWorks(pose)` places them, the bogies and the wagons; the barrel in two halves,
    the trunnion bearings open above with their caps on the cradle); `ww2/render.js` runs it and stands the rig and
    the camera's focus where the gun is until it reaches its station. `buildGustavSite({ arc, yard })`: yard at the
    fortress siege only.
  - `terrainHeight.js`: a pad may level to `ref`'s ground; `ops.js` adds the straight's pad, level with the station.
  - The crew works on the ground along the gun's left side while it is built.
- (models, render) The Gustav on firing: the barrel recoils 3 m (two sources; short at low elevation,
  `rig.recoilFade`) and the whole carriage is shoved 0.8 m back along its rails and brought up again as it reloads
  (`rig.setCar`, `rig.carRoll`, the railway gun's `carPose`); the men on it ride along (`crews.js` turns the run with
  `rig.carYaw`). Inner guard rails brace the curve.
- (sim, models, render) The Gustav's "Flak and smoke" task is now **Flak cover** (Flakschutz), as the sources have
  it (two army flak battalions guarded the gun; the smoke and nets belong to the camouflage task). Four batteries
  (`gustav_layout.js` `FLAK`: light 2 cm Flakvierling, heavy 8.8 cm, light, heavy) come in one by one as the task
  runs: each waits in its field, is towed in by its Sd.Kfz. 7, unlimbered, turned and set down, the tractor draws
  off, the barrel comes up and the pit's bank is dug around it (`works.update` `pose.flak`, site `setWorks`; the
  batteries stand on the terrain, `buildGustavSite({ ground })`). Each counts as soon as it stands
  (`special.js` `flakCover`): the light guns are the killers of low ground-attack aircraft (`st.flak` 0.42 a
  battery), the heavy ones mostly spoil the raiders' aim (`st.flakSpoil` 0.3 a battery, which `enemy.js` turns into a
  wider bomb scatter, `raid.spoil`). Sevastopol all-auto Normal, seeds 1 to 72: the preparation is unchanged (the gun
  ready at 310 s on average, 5 bombs in the works in 72 games, under the old rule and the new); the wins move with the
  random stream (seeds 1 to 144: 51 against 61, about one standard error).
- (UI, render) Watching a task: a Gustav task clicked on the procedure card takes the camera to its work (the survey
  and track fronts, the battery being dug in, the cranes, the ammunition train, the part on the hook, the
  camouflage), clicked again back to the gun; a finished task holds it 3 s, then gives it back. Plumbing:
  `SpecialCard({ focus })`, `mountConsole({ focus })`, `Panel` option `onFocus(unitId, task)`, main to
  `ww2Render.focusTask(unitId, task)`; the render layer glides the unit's root (the chase camera's target) to
  `works.focusOf(task, st)` and frames it once through `framing()` (the player's orbit and zoom stand after that).
- (render, models) The Gustav's site deconflicted, checked by a voxel clash pass over every stage of the build (the
  cranes going up, each act of the assembly, the cranes coming down, each flak battery's tow, the finished gun laid
  to both ends of its arc; at the fortress siege and in the open battle). The two D 311s no longer stand at the
  station once the gun is on its curve: they stay coupled behind its shell and charge wagons and go with it as it is
  laid and as its carriage runs back on firing (they are what moves it along the curve; `works.update(st, az, car)`,
  `rig.carZ`); before, a gun laid back ran into them. Each gantry crane is put up on its own ground (`DERRICK.z`:
  the first crane's derricks on the curve's side, the second's on the yard's, their guys led away from the crane);
  before, the guys ran through the stacked sections and the second crane's into the first crane's stacks. The
  theodolite and plane table leave once the track is down (the camouflage's guys are pegged out there). What the
  pass still finds is by design: slings and hooks on their loads, parts on their cribbing, coupled buffers.
- (ww2 sim) The Karl no longer loads or lays on the move. Before, a loading cycle begun in one position ran on through
  raising the hull and the drive to the next (the carrier's crane lifting, the round rammed, the barrel laid up to
  60 degrees on the road). Now `KarlCtl.gate` sets `unit.stowed` whenever the hull is not down, and `sim/guns.js`
  then keeps the barrel flat on the middle of its traverse, puts a laid round back to wait at its `lay` step (it lays
  again once the hull is down at the new position) and, without `loadThrough`, gives the cycle up if the shell is
  not yet rammed: the shell stays on the carrier, the breech closes over 6 s. The set-up (sandbox) Karl still loads
  while its hull turns (`loadThrough`), not on the road. British units and the other WW2 units never set `stowed`:
  simtest identical, Flanders, Sevastopol, V-1 and V-2 identical in ww2test; the Karl operation on seeds 1 to 32,
  all-auto, old rule against new: Easy 27 / 26, Normal 27 / 28, Hard 12 / 15 (noise: its AI crew raising for a
  new line now gives up an unrammed cycle).
- (WW1 German mode) A third mode of the main game, a sandbox open battle (section "WW1 German mode"): `/?mode=ww1`,
  seven German units (Bertha shared with the WW2 mode, the 21 cm Mörser 16, 15 cm sFH 13, 10 cm K 17, 38 cm Langer
  Max, 42 cm Gamma and the Paris Gun) against the British side of 1918 with the British game's own five units as
  targets in their pits. Shared changes, all inert for the British game and the WW2 mode (simtest and ww2test give the
  same results with and without the WW1 tables): `tables.js` merges `tables_ww1.js` (FFE rows key by key);
  `models/guns.js` `GUN_KINDS_WW1`, `GUN_ERA`, extra builders `buildBerthaGun1917`, `buildMax38Site`, `buildGammaSite`,
  `buildParisSite`; `models/shells.js` shell and cartridge rows for `sfh13 m16 k17 max38 gamma paris b18 b45 fk16
  cooper` (`CUSTOM.cooper`, `CUSTOM.paris`); `models/targets.js` loads `t/ww1/*.js` (not `*preview*.js`),
  `TARGET_KINDS_WW1`; `models/t/layout.js` reads `t/ww1/layout_british.js` and `layout_rear.js`; `render/crews.js`
  merges `render/crews_ww1.js` (roles, light kinds, world roles, staff lengths, the hooks, the 1917 dress for
  `era: 'ww1'` kinds and, with `CREW_ERA.ww1`, every German kind); `render/targets.js` `BALLOONS` (the British
  `bballoon` falls like the German one, from the site's `alt`), `bconvoy` in `MOVES` and `DRIVES`, `bdump` in `MOVES` and
  `DUMPS`; `render/guns.js` `KICK` rows for the six new kinds; `fx.js` `parisBlast` (`fx/ww1.js`); `audio.js` the `ww1`
  option, `enableWW1()`, `parisGun(pos)`; `ui/tracker.js` skips `paris` shells; `ui/consoles/console.js` mounts and
  routes to `ui/consoles/paris.js`; the menu's third era (`menuItems.js`, `ui/menu.js`); `dev/modelviewer.js` and
  `render/clipcheck.js` load the WW1 builders, the viewer dresses WW1 crews in 1917 dress. Research: `docs/WW1.md`.
  Test: `tools/ww1test.mjs`.
- (WW1 German mode) The roster is ordered by calibre (1 K 17, 2 sFH 13, 3 Mörser 16, 4 Paris Gun, 5 Langer Max, 6 Bertha,
  7 Gamma). Bertha and the Gamma can relay their beds (`rebed`, `BedCtl` in `src/ww1/special.js`; section "WW1 German
  mode"): shared changes `sim/guns.js` `problem()` names the remedy when `u.special.bed` exists, `ui/consoles/gunsCard.js`
  shows the bed and its key (`new GunsCard({ onBed })`), `console.js` T and a status line without a card name for a bed
  gun; both inert for the other modes. The British kite balloon has no site in the battle. At X-Zeit the director
  releases the auto barrage batteries from other missions. `ZERO_NEED` Easy 54 %. Console layout for narrow cards and
  wider fallback fonts (`panel.css`): card titles ellipsize instead of pushing their keys out, the message slips wrap
  and the battery name in a slip shrinks; beside the Paris Gun's card (300 px) the guns card is 226 px (`style.css`).
- (WW1 German mode) Relaying a bed takes 100 s for Bertha and the Gamma (was 360 and 720 s); the console and the radio
  give the time in seconds under two minutes. All-auto on seeds 1 to 72: Easy 32, Normal 14, Hard 3 (was 32, 16, 4).
- (WW1 German mode) The Paris Gun has four military targets off the map and the Armee's orders on them (section "WW1
  German mode"): `op.paris` replaces `op.target`; `special.js` `effectK(effect)` (with `supplyK()` kept for
  `enemy.js`), `director.js` `assault()` and `enemy.js` `raid()` and the RE8 interval read it; `ParisCtl` gains
  `targets`, `orders`, `pickTarget()`, `aim { id }`; flights carry `target` and `result` (the card now marks IN THE
  AREA from the sim's own 400 m, not 700). Shared change: `ui/consoles/console.js` mounts a special card's `aside` in
  the range table's place (only the Paris card has one). `tools/ww1test.mjs` reports rounds by target and orders.
  All-auto on seeds 1 to 72: Easy 27, Normal 16, Hard 5 (was 32, 14, 3).
- (WW1 German mode) Bertha's and the Gamma's bed relay is instant for now (`REBED` 0 for both, was 100 s; to be
  restored): `BedCtl.rebed` relays in the same step when the duration is 0, and the radio, `ui/consoles/gunsCard.js`
  and `sim/guns.js` `problem()` leave out the time out of action when it is 0 (shared change, inert for the other
  modes). All-auto with the Paris Gun still in the battle: Easy 25, Normal 10, Hard 3 (was 27, 16, 5).
- (WW1 German mode) The Paris Gun leaves the open battle for its own mission (op `paris`, kind `'paris'`, "Paris Gun"
  in the menu, `/?mode=ww1&op=paris&play=1`), as the WW2 V-1 and V-2 have theirs; section "WW1 German mode". The
  battle's roster is renumbered 1 to 6 (`max38` 4, `bertha` 5, `gamma` 6). `ops.js`: `OP_IDS ['ridge', 'paris']`, each
  op's `tag` (the menu's line), `op.paris` moves to the mission with six new orders and only the aerodrome keeping an
  `effect`; `theatre.js` `ww1Theatre(opId)` (sectors only for the battle); `director.js` no script outside the battle;
  `enemy.js` `HUNT` and `huntUpdate()` (Camel raids on the gun, `raid()` reads `target.spoil`); `special.js` `WIN`,
  `missionEnd()`, `cover()` (`COVER_R`, `COVER_GATE`, `unit.special.cover`), manual at the start of the mission, the
  barrel opening at 55 to 59 rounds; `ui.js` draws the salient and lines only in the battle. Shared changes: `main.js`
  reads `?op=` for WW1 and gives the mission its toast, stand-to and end texts; `menuItems.js` an entry per WW1 op
  (`query` now carries `op`) and `ROSTER_WW1` of every op's units; `ui/menu.js` the WW1 Battles help line.
  `tools/ww1test.mjs` `--op ridge|paris|all`. All-auto on seeds 1 to 72: the battle Easy 21, Normal 10, Hard 3; the
  mission Easy 42, Normal 29, Hard 10.
- (WW1 German mode) The Paris Gun's mission plays like the WW2 Gustav and V-weapon missions: a Stellungsbau, then a
  Feuerablauf for each round (section "WW1 German mode", Paris Gun). The controller moves to `src/ww1/paris.js`
  (`TASKS`, `GANGS`, `DRILL`, `FAULTS`, `CHARGE_TOL`, `SPREAD`, `AUTO_PAUSE`, `AUTO_NEXT`, `WIN` 0.8; commands `gang`,
  `hurry`, `step`, `fix`; `table` now lays the table plus what the reports taught (`taught`) and no longer sets the
  charge); `special.js` imports it. The op's unit is no longer `ready`, its orders (five) count from the moment the gun
  stands. `enemy.js` `huntUpdate` hunts the site from the start and reads its `flak`, `spoil` and `hide`. Shared
  changes: `sim/guns.js` `u.stowLaid` (a stowed gun keeps its line), `ui/consoles/console.js` a special card's `left`
  in the guns card's place and the status line's card name for the Paris Gun; `ui/consoles/paris.js` the drill card
  (`ParisDrill`) and the keys Enter, O, I, J, Tab and L; `style.css` its layout; `ww1/render.js` the Stellungsbau's
  picture. `tools/ww1test.mjs` `--player` and the mission's histogram. On seeds 1 to 72 the mission all-auto Easy 28,
  Normal 7, Hard 0, the scripted player 60, 42, 11; the battle, the British game and the WW2 mode unchanged.
- (WW1 German mode) The Paris Gun's mission builds its position in sight and shows its targets: `TASKS` gains `bank`
  (earth bank and screens) and every task matches what goes up on the site (`buildParisSite` builds into groups and
  gains `setStage`, a weather mast and theodolite and two anti-aircraft machine-gun posts; `buildParis` puts its bed
  in `rig.bedGroup`; `ww1/render.js` poses them from `stage`). The map: `ui/consoles/parisMap.js` (the targets, the reach
  band, the line laid on, the falls, a magnified inset) through new theatre hooks on the board (`TH.overlay`,
  `TH.hoverText`, `TH.boardHint`, `TH.fitTip`, `TH.aimTip`; the metric grid's 10 km step) and `special.boardClick`
  in `console.js`. The console: the firing data card SCHUSSWERTE takes the fire order card's place (`special.top`), so
  the unused British aiming keys are gone; the gun's card keeps the barrel, the shells and five reports; English hover
  text on every label, row and key of the four cards, and on the AUTO, MANUAL and HOLD keys of every console. On seeds
  1 to 72 the mission all-auto Easy 25, Normal 6, Hard 1, the scripted player 59, 49, 10; the battle, the British
  game and the WW2 mode unchanged.
- (post, main) The '1917' grade no longer draws old film: the gate flicker, the coarse grain, the dust specks, the
  scratches, the lifted blacks and the heavier vignette are gone from `GradeShader` (`uFilm` and the grade's `film`
  removed); '1917' is a colour grade like the others and stays the British and WW1 default. The fine grain is off by
  default too (`params.grain` 0; the gear menu's slider still sets it). The Bertha demo keeps its own settings.
- (WW1 German mode) The Paris Gun's crew no longer floats over the empty site during the Stellungsbau: `poseParisSetup`
  sets `rig.assembly` from the frame's run-in, and the Paris crew module's `act` hook puts the men on the ground beside
  the gun until the frame is on its bed, as the Gustav's do during its assembly.
- (WW1 German mode) The Paris Gun says how to aim and what to correct: the firing data card SCHUSSWERTE has an
  advice box under the target line (in the last report line's place) that walks through aiming (pick the target, fire,
  the report, REPORT or the arrow keys) and, when a report is in, gives the correction (`ENTFERNUNG −390 m (shorter),
  SEITE +0.6 Strich (right)`) and lights REPORT (TABLE after a new Wettermeldung); the row labels carry English glosses;
  the map's inset draws a blue ring where the next round should fall, which moves as the corrections change; the drill
  card says when the report on the round in flight comes; the shot's radio says when its report comes and the report's
  what to correct. `ParisCtl`: `flight.corr` (the corrections the round went with), the exports `nextFall` and
  `correction`, and the player's `report` now corrects from the data the round was fired with (the auto crew and the
  scripted test player keep `useReport`). On seeds 1 to 72 unchanged: all-auto 25, 6, 1, the scripted player 59, 49, 10.
- (Bertha demo) Crew assists can be switched in the battle: C, or the last button of the station bar (`#assist-btn`,
  `BerthaHud.setAssist(on, allowed)`), since the main menu opens `bertha.html?play=1` and skips the title screen with
  its checkbox. `game.assist` flips live (the crew's waits reset); not in the tutorial's range game. The choice is
  remembered in localStorage `drumfire.bertha.assist` (the title screen's box follows it); `?assist=1|0` overrides.
- (menu, UI) Work in progress is marked: `menuItems.js` `WIP_KINDS` (`paris`, `gustav`) and the Big Bertha demo. An
  entry whose gun is one of them (the Gustav siege, the campaign mission that earns the Gustav, its lesson, the Paris
  Gun's mission) or the demo carries `wip: true` and leads its lines with `WIP_LINE`; the menu badges its row and title
  (`.wip-badge`, style.css), the loading screen its title, the roster tab the gun's row; `hud.setUnit(name, call, wip)`
  badges the unit's name in the game, and the Bertha page badges the gun's name and its title screen. README marks the
  same three.
- (menu) The Big Bertha demo is listed in the WW1 German era only: the 1917 British era's entry (`bertha`) is gone, and
  the demo's back link opens the menu on the WW1 German era with the demo selected (`/?mode=ww1&sel=bertha:ww1`).
- (menu) The main menu's background is the selected entry's still from the game: `public/menu/<id>.jpg`, a gun of each
  kind firing, captured by `tools/menushots.mjs` (the game page in a private headless Chromium with dev mode on, the
  console and the overlay hidden and the view the full width, the gun put on auto, the battle fast-forwarded, frames
  until it fires, the camera orbiting the piece about to fire; `node tools/menushots.mjs [id ...] [--size WxH]
  [--quality Q]` re-takes them, so the WIP guns' pictures can follow their models). `menuItems.js`: an entry's `still`
  (an operation's gun, the battery a campaign mission earns, a WW2 lesson's weapon; the 1917 battle the 15-inch, the
  WW1 battle Langer Max, the WW2 open battle the Nebelwerfer) or its era's `ERA_STILLS` in turn (the 1917 lessons),
  `stillsOf(item)`, `stillUrl(id)`, `STILLS`. `menu.js` `backdrop()`: two layers that crossfade once the next picture
  has loaded, a rotation every 10 s, the next one fetched ahead; `menu.css`: each layer drifts slowly its own way under
  a shade darkest behind the briefing; no drift or rotation with `prefers-reduced-motion`. The folio lets the picture
  through a little (a blur behind it).
- (menu, campaign) Missions, operations and lessons are open from the start, in any order, at the user's request:
  `Progression.canPlay(id)` is true for every mission (`CAMPAIGN` has no `prerequisite` now, and a save's completed
  missions all count, in whatever order they were won); `menuItems.js` sets no `locked` on the WW2 operations or the
  campaign (the menu's `locked` handling stays, unused). A WW2 special weapon's own operation (`main.js` `OPERATION`:
  the Gustav siege, the Karl, the V-1, the V-2) plays its whole roster, earned or not, as a campaign mission does; only
  the open battles (Ypres, Flanders) still field just the earned batteries. `LOCKED` is now `MISPLACED`: only a campaign
  mission asked for on the other era's page goes back to the menu. A V-1 or V-2 campaign win says the battery is earned
  (its operation was already open). `tools/progressiontest.mjs` checks any-order play and that no menu entry is locked.
  docs/PROGRESSION.md's table lost a stale Big Bertha mission (twelve missions, not thirteen).
- (bertha) The title screen shows again: the WW1 work took its rules (`#title-screen`, `.brand`, `.loader`,
  `#options`, `#difficulty`, `#play`) out of style.css with the main game's old title screen, which left the demo's
  card below the window (no options, no tutorial button, no way back to the menu, no load bar). They live in
  `bertha.css` now. A "Title screen" button beside the gear (`#to-title`, i18n `toTitle`), shown in a game and in the
  tutorial, returns to it (the tutorial's stop, or `toTitle()`), since the menu opens the demo straight into a game.
- (render) `warmUp` (render/warmup.js) draws the shadow maps too (`renderer.shadowMap.needsUpdate` before its render).
  It runs before the game's first frame, when no shadow pass had run yet, and every one of its draws failed with
  GL_INVALID_OPERATION ("mismatch between texture format and sampler type"), 256 console warnings and then "too
  many errors" on every game page. The uploads it exists for happened anyway, so nothing showed; the console is clean
  now, and the shadow pass's programs are warmed as well.
- (render) Bertha's rammers work the staff. `heavyState` returns before crews.js gives the staff an owner (the Gustav
  and the Karl ram with a drive worked from control wheels), so Bertha's staff slid up the bore with nobody on it
  while both rammers stood at their places. `crews_heavy.js` `berthaRammer` follows the demo's drill
  (src/bertha/crew.js): the deck ahead of the tray's rear end is cut away for the recoiling breech, so the two stand
  behind the tray either side of the staff (rammer1 left, 0.75 m behind its head, rammer2 right, 1.35 m; never
  past the back of the stage), come over in the first 12% of the step and go back in the first 12% of the bags. Each
  heave carries the hands along the wood for 0.36 m, then they let go and take a fresh hold behind. New pose
  `ramLow` in `models/v/crew.js`: the ram stroke bent low over a staff at hip height (Bertha's bore axis at the
  loading angle is 0.70 m over her stage; `ram` holds it at 1.05 m).
- (models) The Gamma's gantry crane is parked at the rear of its rails, as refs/gamma has it, not 15.5 m in front of
  the muzzle: `GAMMA_SITE.gantryZ` 18.5 (behind the camouflage net, clear of the shell and charge stores), its rails
  from z -9 (ahead of the pit, so it reaches over the whole gun) to 22, the crab parked over the spur at the bridge's
  right end so its hook hangs clear of the chase camera's view of the gun, which from 50 m behind runs under the
  bridge and between the legs. The site's extent (ww1/ops.js pads comment) is z -14 to 32.
- (sim) The open battles give their first order on the battle's first frame: the WW1 German battle's Gegenbatterie on
  F1 (was at 40 s, a silence that read as a broken game) and the WW2 Flanders battle's AOP strip O1 (was at 8 s), both
  at 0 s, after the phase message in the same step. Frame time is clamped to 0.1 s, so on a slow machine game time
  runs slower than the clock and any later time can stretch past a few real seconds. The 1917 battle is unchanged (8 s).
- (lead) The British units are numbered by calibre, smallest first, as the German rosters are: 1 the 60-pounders
  (Long Tom), 2 the 6-inch (Ginger), 3 the 9.2-inch (Mother), 4 the 15-inch (Granny), 5 the 18-inch railway gun
  (Wolfe). The ids, the keys 1 to 5 and the tab column follow `sector.js` `UNITS`. Was 1 15-inch, 2 9.2-inch, 3
  6-inch, 4 60-pounders, 5 railway. Without `?unit` the 1917 battle still opens on the 15-inch (main.js). Moved with
  it: the lessons' `unit`/`units`, their key numbers and checks (tutorial.js), the Big Bertha demo's British targets
  (`TARGET_LIST` `unit`), the WW1 British gun sites (`layout_british.js` `BGUN_UNIT` now names the unit's kind),
  `dev/worldview.js`, simtest's scripted players (by kind, in the same order as before: the 15-inch, the 9.2-inch,
  the 6-inch, then the 60-pounders and the railway gun) and its kills-by-unit label, the PLAYING.md table. The SOS
  and barrage lateral spread (`(u.id - 3) * 65`) now runs in calibre order. Balance re-run: see Balance.
- (ui, sim) An order the guns cannot carry out is flagged at once, not when the guns have loaded. The roster tile
  put READY, FIRING and LOAD n% ahead of the order's problem, so an out-of-range target showed as loading for the
  whole cycle and OUT OF RANGE only when the guns could not fire; OUT OF ARC, OUT OF RANGE and TOO CLOSE now come
  first (NO SHELLS and NO CREW still wait for idle guns). `guns.problem` returned a gated unit's gate before its
  order, so a gun held by its preparation or drill (the Gustav, the Paris Gun, a bed being relaid) said "not ready"
  and named an unreachable target only when the gate lifted. Now an out-of-range or too-close order is reported
  through the gate (the radio at the order, the status line's CANNOT FIRE ahead of NOT READY); an arc may still
  change with the gate (a bed), the Karl keeps its gate (it drives to a new position), launch sites as before.
- (render) WW2 firing lag: the crews re-planned their walks every frame while the gun moved. `GunCrew.plan()` re-ran the
  `CrewField.route` search (about 37 ms each) whenever a route's end moved more than 2 cm, and the ends hang on the
  tray and the breech: on the K 18 and the Mrs 18 the whole top carriage recoils (`setRecoil` moves `car`), so the 4 s
  run-out after every shot, the depress and the lay cost 2 to 4 searches a frame (75 to 160 ms frames; 114 searches,
  3 s, over 240 frames with the Mrs 18 selected). The walks happen only in the shell, ram and cartridge steps, with
  the gun at its loading pose, so `prepare()` sets `planHold` outside them and `plan()` (and carryMan's `closest`)
  keep what they have; with nothing planned yet (the unit just selected) a straight stand-in between the same ends
  serves until the loading pose. Now 4 searches, once, at the first loading after selection (and again only when
  the lay changes). The super-heavies' drill equipment (`crews_heavy.js` `drill()`) is built in the `GunCrew`
  constructor (`heavyBuild`), not at the first update: its materials compiled in play and missed `patchSceneFog`.
- (sim) One report a volley. `guns.fire` numbers each fire order per unit (`u.volleys`, `piece.volley`, `shell.volley`)
  and `Observers.onBurst` folds every burst of a volley into the report still waiting, on the mean point of impact,
  holding it until 2 s after the latest burst (a ripple lasts about 8 s); a burst of a volley already answered
  (`unit.answered`) says nothing more. A Nebelwerfer's ranging volley (a ripple of six, up to 18 rockets with every
  launcher) gave a correction per rocket; the British batteries ranging with every gun gave one per round. A lone round
  draws from `sim.rng` as before. Balance re-run (Balance; WW1 and WW2 Test and balance).
- (render, perf) Switching batteries. The camera's glide across the map (tens of metres a frame) re-centred the finest
  terrain levels, the trench and track masks and the trees on nearly every frame of it (40 to 60 ms frames for 15 to 20
  frames, measured in the WW2 battle). `Terrain.update` now leaves a level alone while the camera moves more than 5 % of
  its width a frame (the next coarser level covers that ground), the masks and the trees likewise; as the camera slows
  they catch up one at a time (one level a frame, masks and trees each in a frame of their own); `GroundMasks.update`
  returns whether it rebuilt, and `rebuildCover` reuses its 8 MB accumulation buffer. The crews' first plan after a
  switch (4 routes, 107 ms) is now 2 ms: `CrewField.route` remembers a cell's clearance once a search (`okS`, `okV`;
  it was asked up to 24 times a cell) and pulls the string over the grid path's corners only (it tested lines from
  the far end back to every cell). A switch now costs one 11 to 22 ms frame (the console's rebuild) and the terrain's
  catch-up at 12 to 17 ms; the Karl's far position still costs one 55 ms frame on arrival.
- (audio, perf) The sample banks render in a worker while the page loads. `AudioEngine.prepare()` (main.js after
  enableWW2/WW1, the Bertha demo after construction) starts `src/audioWorker.js`, which runs the same `bankTasks` with
  a `make` that returns `{ chans, sr }` (copied into buffers of their own and transferred) and posts each bank; the
  engine keeps them in `raw` until `start()` makes the context, then wraps them (`wrap`, `received`). The browser lets
  the context start only after a gesture, which is why the banks were built at `start()`, on the main thread, up to
  220 ms a bank (the WW2 colossal gun and rockets the heaviest) over the first seconds of play. The worker's banks
  are identical: `SR` enters `bankTasks` only as min(SR, 32000) and min(SR, 24000), so 48000 renders what a 44.1 or
  48 kHz context would (checked sample for sample). While the worker is alive `start()` builds nothing, not even the
  essentials: its finished banks wait in the message queue until the end of loading is over, a moment later, and a
  sound asked for meanwhile plays the nearest bank there is or nothing (`variant`, `bankOf`); `pump()` waits for it
  and builds only what a failed worker left. `audio.built` counts the banks built here and in the worker (the WW2
  battle: 0 and 94). Without workers, or with a given context (the tests), `start()` builds them as before.
- (audio) The guns built in layers from recordings, as iads builds its 8.8 cm, for every class (light to huge, and
  the colossal and Paris guns in their modes). `RECORDINGS` (now exported) marks four new files with a `gun` role:
  `fieldgun` (InMotionAudio's field gun, CC0) the crack, `artillery` (qubodup's US government howitzer shots, CC0) the
  snap, `gun76` (Yle's 76 mm, CC BY 4.0) the body and `gunfire` (qubodup's US Army big gun, CC0) the boom. `REC[cls]`
  lists each class's recorded layers `[role, pitch, level]` (pitched lower for the bigger guns), its synthesized sub
  thump's level and its saturation; `recordedGun(sr, r, cls, roles, k)` builds take k (the layers onset-aligned, the
  class's `CLS.boom` thump, the heavy pieces' chest and rumble, the biggest guns' ground reflections, the Paris Gun's
  whip-crack, the shell's crack, the roll); `recordedGunTasks(SR, make, rec, classes)` gives 6 near takes, 4 mid and
  3 far (through `distant`) per class, skipping a class that lacks one of its roles. `recordingTasks(SR, make, rec,
  synth, classes, { keepSynth })` is everything built from the recordings as `[group, key, fn, over]` tasks (`over`
  'gun' for a recorded gun, true for the rest): the guns, the far ground bursts and the drumfire's thuds from the
  distant explosions, the explosion under the near ground bursts, the cannon shot under a gun still synthesized, the
  case; `rec` is `{ key: { data, sr } }` (decoded mono), `synth(group, key)` the synthesized takes they blend with.
  `cutSlices(data, dataSR, slices, sr, rate)` is the slicing `useRecordings` did. CPU: about 2 s, in the worker.
- (audio, perf) Every sound ready before the loading screen ends. `prepare()` gives the worker two jobs (`jobs`,
  `jobDone`): the banks, then `prepareRecordings` fetches every recording once (`recording(key)`, shared with
  `loadRecordings`), decodes it with an OfflineAudioContext at 32 kHz (no gesture needed), trims it to its last slice
  and posts it; the worker keeps its synthesized `gun_`, `burst_ground_` and `thud` takes and runs `recordingTasks`.
  Each bank becomes an AudioBuffer as it arrives (`standalone`, the AudioBuffer constructor, no context needed; `raw`
  only where it is missing), and `prepare` also builds the noise buffers and the reverb impulse for 44.1 and 48 kHz
  (`pre`), so `start()` makes the context, the graph and the voices and queues nothing (pending skips built banks).
  `audio.whenReady(tick, limit = 120000)` resolves when the worker is done (`ready()`, `progress` against `expect`,
  counted at prepare); main awaits it before `hud.setLoading(1)` ("Sounding the guns"), the Bertha demo before its
  title (and starts the engine there, as main starts it with the battle; Play then only resumes it). Main's and the
  demo's first gesture now always call `audio.start()`, which resumes a context the browser made suspended. Before:
  the WW2 battle's worker was often still busy when loading ended and `useRecordings` cost a 300 to 400 ms freeze a
  few seconds into the battle; now no long task after loading. Without a worker `useRecordings` queues
  `recordingTasks` one bank per tick; `workerFailed()` falls back to it; `recordLate` covers a mode enabled after it.
  `uiBus` bypasses the deafness low-pass (the console stays clear while the ears are dulled).
- (audio) An own shell's flight voice (`sh.own`, not the V-1) is heard from its retarded position: `shell()` gives it
  a `track(0.1)` and `updateShells` uses `retarded()` (the movers' code) for its place, distance and closing speed,
  so the tearing starts when the muzzle's sound reaches the listener (with the gun's report, not before it) and the
  receding shell falls behind its true place with its pitch dropping. Enemy shells keep their current position (the
  incoming warning), and a camera riding a shell (listener faster than 100 m/s) hears it where it is.
- (audio, dev) `/audio.html`: `audio.keepSynth = true` keeps the synthesized guns (`synthGuns`, `stash`) for the A/B
  button (`swapGuns()`), a 6-inch battery salvo and a 15-inch at 25 m, and `update` keeps running after the smoke test
  so the buttons land; the report has `recordedGuns` (fails if the recordings are in use but a gun is not built from
  them) and `ownShellHeardAfter` (an own shell 200 m off must be silent for about 0.58 s). `tools/audiotest.mjs`
  checks `recordingTasks` with synthesized stand-ins placed at the recordings' slices.
- (sim) An SOS mission has no deadline: `director.rockets()` (and the WW2 and WW1 Sperrfeuer) passes `deadline: null`,
  `addMission` keeps it null and `missionsUpdate` never runs it out, so the mission ends with its assault (done when no
  group got in, failed when one did). Its clock (`go + crossing + 30` of the first group, times `difficulty.time`) ran
  out while the Germans were still crossing (the other groups, the pinning), ceased every gun on it and failed a line that
  held: every SOS on Hard, about a third on Normal; S could not call it again (`assign` refuses a failed mission). The
  mission list shows no countdown for it. Mission shape: `deadline` may be null. Balance re-run, see "Balance".
- (ww2 gunner) The player in person at a gun of a WW2 battery (section "The gunner" under "WW2 mode"): `src/ww2/gunner.js`
  (the drill, Node-safe), `gunnerView.js` and `gunner.css` (the first-person camera, the gun card, the keys),
  `tools/gunnertest.mjs`. Shared changes, inert without a manned piece (ww2test seeds 1 to 8, every operation and
  difficulty, and simtest seeds 1 to 4 with both players print the same before and after): `sim/guns.js` `updatePiece`
  hands a `piece.manned` to `sim.gunner`; `SpecialWW2` makes the Gunner, routes `man post unman assist` to it and calls
  `check()` after the guns; `render/crews.js` `GunCrew.setPlayer(role)` and `eye(out)`, and the player's man is never the
  casualty taken off; `ui/panel.js` option `keysOff(e)`; the guns card's MAN / LEAVE on each row (`GunsCard({ onMan })`,
  shown for `TH.mannable`, which `ww2/ui.js` sets); main: P, `#man-gun`, the first-person camera in place of the chase
  camera (near plane 0.1 while at a gun), gear menu "At a gun: crew help (C)" and "At a gun: other batteries to auto".
  The scripted gunner (seeds 1 to 4, every kind, crew help on and off, Easy to Hard) fires as many rounds as each of
  its battery's other guns, and no order lapses.
- (ww2 voices) Crew voices for the WW2 open battle and the Karl-Gerät operation (section "Crew voices" under "WW2 mode"):
  `src/ww2/voices.js` (`CrewVoices`, `VOICED_OPS`) and `voices.css`, the clips in `public/audio/voice-de/` (`lines.json`
  index), the line table `tools/voice-lines-ww2.json`, `tools/pick-voice-takes.py`, `tools/make-voices.py`,
  `tools/voicetest.mjs`, docs/VOICES.md. Main's hooks (all behind `voices?.`, null on every other page): the optional
  import, the construction after the gunner view, `load()` and `ready()` behind the loading screen, `attach(sim)` after the
  event wiring, `update(sim)` before `audio.update`, the load handler skipping the voiced gun's synthesized "Ready!"
  (`replacesBark`), key V, `__drumfire.voices`. Read-only on the sim: ww2test seeds 1 to 8, every operation and
  difficulty, and simtest seeds 1 to 3 with both players print the same before and after.
- (ww2 gunner: Gustav and Karl) The Gustav and the Karl can be manned (section "The gunner"): `gunner.js` `MANNABLE`
  gains them, `DRIVEN` gives them a powered laying drive (command `drive { axis, dir }`, `st.drive`; a tap starts it,
  it stops itself on the mark), `HOLD` caps a step the player works and the lay check at 8 s, the prompt sends the
  layer to the line while the others load, `u.stowed` and `p.fixed` are honoured as in `sim/guns.js`, a gated gun
  neither lapses its rounds nor hides why it waits; `gunnerView.js` `POST_ROLE` and `VIEW_KIND` for both, the taps,
  the key line per kind; main cuts the camouflage nets away round the sim's piece positions (the Karl's where it now
  stands; identical for every gun that does not move). Two words put right on the way: the Karl's gate names the
  carrier's key Y (it said M, the mute key) and `problem()` the hull's L (it said R). `tools/gunnertest.mjs` takes
  `gustav` and `karl` (`--op flanders|sevastopol|karl`).
- (voices: WW1) The crew voices speak in the WW1 German open battle (op `ridge`) with the WW2 clips, none made for it
  (section "Crew voices"): `voices.js` `VOICED_OPS` gains `ridge`, the option `era` ('ww1' from main) picks `OBS.ww1` (every
  report on the telephone), leaves out the counter-attack's barrage call, `MISSION_LINE` maps `bdump` and `bconvoy`, and the
  WW1 guns join `TRAY` (m16), the new `LIFT` (with the Gustav: max38, gamma) and `BAGS` (max38, gamma); main loads the
  module on WW1 pages too. `tools/voicetest.mjs` takes `--op ridge|paris` and fails on a WW2-only clip in 1918.
- (ui: all batteries' mode) `ui/panel.js`: ALL AUTO and ALL MANUAL under the status block of the battery tabs and Shift+A
  (section UI): every battery the player commands to one mode via `onCommand(id, 'mode', { mode })`, so main's lock check
  and the sim's `mode` command are unchanged; styles `.tall`, `.tallb` in `panel.css`.
- (career: dev mode on by default) `progression.js` `DEV_DEFAULT = true`: a browser without a choice of its own starts in
  dev mode (every battery in the open battles). `setDev` records the choice (`devSet` in the save) and it is kept over
  the default; an older save keeps dev mode only if it had it on. `tools/progressiontest.mjs` switches it off before
  checking the earned roster.
- (sim: ranging on a task in fire for effect) The observers read rounds only while the mission was 'ranging', but the
  state is shared by every unit on the task: once an auto battery on it fired its series, the player's ranging rounds
  there got no report at all, nor did ranging again after the player's own series (the task never returns to
  'ranging'). `guns.fire` marks a ranging order of a unit not on auto (`piece.ranging`, `shell.ranging`; an auto crew's
  series of one, the super-heavies' and on a magazine, is for effect) and the unit's latest fire for effect
  (`unit.ffeVolley`); `Observers.onBurst` also reads such a round on the unit's own task in 'ffe' when it left after
  that series. The crews never range again on a task in fire for effect, so the British simtest (with the scripted
  players), `ww2test`, `ww1test --player` and `gunnertest` are bit-identical; `gunnertest --manual`, whose commander
  takes tasks other batteries hold, now gets those reports and plays out differently.
- (career: research and upgrades) The campaign's unlock missions give way to research (section "Research and upgrades"):
  `src/research.js` (trees, parts, costs, the sim's multipliers, the opposition, the pay), `progression.js` save v3 (RP per
  era, researched, battery points, levels, battles; v2 read once), `sim.newGame({ loadout, opposition })`, `unit.mods`,
  `piece.layK`, `shell.dmgK`, `sim.earned` and `sim.credit`, `mission.fired`, `mission.points`; `render/guns.js` hides
  the guns a battery has not earned; main fields `career.battle(era)` in the two open battles and pays at the end card,
  on `pagehide` or a new battle; the end card shows the RP and the battery points. The menu's "Your batteries" tab is now
  Research (the tree, each battery's guns and parts); campaign missions pay a first-win RP bonus and grant nothing else.
  Without a loadout the British, WW2 and WW1 tests are bit-identical. `tools/progressiontest.mjs` covers it;
  `tools/researchtest.mjs` measures lineups. The tools that seed a dev save (`shot.mjs --dev`, `menushots.mjs`,
  `voicetest.mjs`) write v3.
- (sim: missions for the heavy and the long guns) `src/sim/specialists.js` (section "Missions for the heavy and the long
  guns"); `sector.js` `SITES` gains E1 to E3 (deep: two dumps and a corps HQ, 13 to 16 km out) and S1 to S3 (hard), the
  WW2 Flanders op W1 to W3 (an Allied supply depot, an airstrip, a corps HQ) and V1 to V3 (bunkers); `role` on a site;
  the target kind `bunker` (`TARGETS`, `FFE` for the guns that serve it, `partLayout`, `models/t/mebu.js` `buildBunker`,
  concrete ground in `terrainHeight.groundKindAt` and `sim.groundOf`); `addMission` takes `role`, `points`, `minHard`;
  `Crews.canServe` checks `minHard`; the default fuze on a bunker is delay. The British balance table was re-run (see
  Balance); WW2 Flanders all auto on seeds 1 to 24: Easy 22 / Normal 5 / Hard 4 before, 17 / 6 / 5 after (seeds 1 to 8:
  8 / 1 / 1 before, 4 / 2 / 2 after); WW1 unchanged (no role sites).
- (finding, not changed) In the WW2 open battle more of our guns surviving to the counter-attack means more short rounds
  on our own infantry in the Feuerwalze (`stats.lossBy.short`): the camouflage and breech upgrades, each alone on every
  battery, turn early defeats into failed counter-attacks. A fix would pace the Feuerwalze by a timetable rate rather than
  by how fast the guns load; it would change the WW2 balance, so it waits for a decision.
- (menu: a garage) The main menu is laid out as a tank game's garage (`ui/menu.js`, `menu.css`): a top bar with the era
  and nation tabs, the screens Hangar and Research (`VIEWS`, the era's RP beside Research) and the mission chooser, a
  dropdown (`.mn-drop`: the Battles, Campaign and Tutorials lists, the chosen entry's orders, the difficulty, the keys)
  beside To battle. The Hangar shows the selected battery's gun in 3D (`ui/hangar.js` `createHangar(host, { onState })`
  -> `{ show(kind, era), setActive(on) }`: three.js, OrbitControls and `models/guns.js` imported on first use, one cached
  root per era and kind, drawn only while on screen, `GUN_ERA.ww1` for Bertha on the WW1 tab, the gun's still from
  `public/menu` without WebGL), its figures (`hangarInfo`: range from the range table, shell, reload with the career's
  breech, guns, crew, traverse), its modifications or research (`hangarMods`, sharing `modsBlock` and `researchBlock`
  with the Research screen) and the era's batteries along the bottom (`slotCards`). The selected battery per era is
  `memo.rs[era]`, shared by both screens; `drumfire.menu` gains `view`; `?view=research` opens that screen
  (`menuHref(q, sel, view)`; the game's end card has a Research button when the battle or mission paid RP). The
  "Your batteries"/Research list tab and the menu's two-column layout are gone; the dev switch is a class
  (`.dev-unlock`), shown in both screens.
- (menu: the parade ground; career: the gun detachment) The hangar (`ui/hangar.js`) draws the era's whole lineup up for
  inspection instead of one gun: `show({ era, lineup: [{ kind, guns, men, own }], focus })` (menu.js `parade`, from
  `Progression.lineupLevels`, so dev mode parades every battery at its best; a battery not in the lineup stands as one
  unmanned gun), each battery's guns side by side in tree order, each gun's detachment in ranks in front of it
  (`buildCrewman` standing, the No. 1 a pace ahead, at most 30 figures a gun; dress per era in `DRESS`), an inspecting
  officer and sergeant moved to the battery in view, and the parade square round them (gravel inside whitewashed stones,
  huts and tents from `world/props.js` through the `Mesher`, telegraph poles, shell stacks, crates, a wagon and a limber,
  instanced poplars and trees, a sky dome and fog). The camera looks along the line from the right front and glides
  between batteries. The world's textures and plain materials moved from `world/mats.js` to `world/textures.js`
  (`plainWorldMats()`, no shader patches: `shaderlib.js` rewrites three's chunks for the whole page), which `mats.js`
  patches as before. A seventh part, `crew` (Gun detachment, `PARTS`): `modsOf` gains `crew` (added: 0.25, 0.5, 0.75,
  the share of the drill's number in reserve) and multiplies `load` with the breech's (0.97, 0.94, 0.9); `crewOf(kind,
  levels, drill)`; in the sim a piece gets `crew = crewMax = round(drill * (1 + crew))` and `crewNeed` (the drill's
  number), and `beginStep` and `needLoad` measure against `crewNeed ?? crewMax`, so the reserves soak up casualties.
  Without a loadout nothing changes. The in-game crews still draw the drill's men only.
- (menu: one battery on parade, a loading screen) The hangar shows the chosen battery only (`show({ era, battery:
  { kind, name, guns, men, own } })`, menu.js `parade(career, era, kind)`), centred on the square, with the scenery
  sized to it. A parade is assembled off the scene, compiled against the scene's lights and fog
  (`renderer.compileAsync(staging, camera, scene)`), swapped in with its scenery and drawn once before it shows; the
  battery before it stays in view meanwhile, and a veil (`.hg-veil`, step and bar) comes up if a change takes more than
  350 ms. `createHangar(host, { onProgress(text, k), onReady() })`. The menu opens behind a loading screen
  (`.mn-loading`: the brand, the era, a bar and the step) that lifts on the hangar's first `onReady` (or after a minute);
  the hangar is loaded behind it even when the menu opens on Research.
- (menu: real crews, the railway guns on their track, unlocked batteries only, the preview) `research.js` `DETACHMENT`
  (each gun's minimal crew in action, sources in docs/HISTORY.md "Gun detachments", `est` for estimates),
  `detachmentOf`, `crewOf` (the detachment and its reliefs), `menShown` (the guns card and the Paris Gun's card show the
  sim's crew pool scaled to these men; the sim is unchanged). The part `crew` is now "Relief crews" (men to take turns;
  fatigue is not modelled). The hangar parades the detachment plus reliefs, up to 600 men a gun: each dress baked once in
  its standing pose (`applyBoneTransform` into a plain geometry) and drawn instanced; past 37 men in blocks of 36
  (`formation`). The Gustav stands on its curved double track (`buildGustavSite`, its `track` group only), the 18-inch car
  on a ballasted line (its root lifted to the rail head). The hangar lists only the batteries in the lineup
  (`hangarKinds`: `career.unlocked`, every one in dev mode and in the WW1 sandbox); Research's "Preview the full battery"
  opens any battery at full strength (every gun, the detachment without reliefs) with a "Back to research" bar.
- (menu: the testing switches) Dev mode and a new **Unlimited points** switch sit stacked in the top bar's right corner
  (`.mn-switches`, `[data-switch]`); the dev switch is no longer at the foot of the screens. `Progression.free`
  (`setFree`, saved as `free`): `researchBlock` and `upgradeBlock` ignore the points and `research`/`upgrade` spend
  nothing, the tree order still holds; the screens read "Unlimited". `tools/progressiontest.mjs` covers it.
- (menu: the shells on parade; the railway guns' men off their track; the Karl's carrier) The hangar shows each gun's
  shells beside it (`shellDisplay`: three standing on a timber stand, one in a cradle, `models/shells.js` `buildShell`
  of `GUNS[kind].shell`), marked by the battery's Shells level (`battery.shells`, `SHELL_LOOK`): I a fresh, glossier coat
  and a green filling band; II a white band and a taller brass nose fuze; III a pointed steel ballistic cap and a polished
  driving band (game marks, not ordnance practice). A railway gun's detachment forms up in two halves either side of
  its bed (`BED`: the Gustav's tracks from -6 to +11 m, the 18-inch's ballast), the inspecting party before the
  right-hand half. `window.__menuHangar` (`hangar.three`) lets the headless tools aim the camera. `models/v/de/karl.js`:
  two of the Munitionsschlepper's three stowed shells lay outside its bin, through the rear wall (z -3.37 and -2.77
  against the wall at -2.65); all three now lie forward of the pick-up, 0.68 m apart, inside it.
- (menu: the powder) Each gun's ammunition display adds its propellant to the right of the shells (`powder`, from
  `models/shells.js` `buildCartridge` of the shell kind): brass cases stand on a plank with a pressed-board cap, bags (and
  a bag ahead of its brass case) lie on a pallet; the Gustav and the M-Gerät add their brass main case
  (`MAIN_CASE`: gustavc, m42c); none for the Nebelwerfer. The display is centred on its group (`shellDisplay` width and
  depth include the powder).
- (menu + battle: the upgrades made visible) `src/models/looks.js` `applyLook(rig, kind, era, levels)`: camouflage I+
  swaps the gun's camo and paint materials for the era's disruptive scheme (`camoScheme`: 1917 earth / railcamo, WW1
  bunt / earth, WW2 a new olive `upgreen` / dgelb, the first that is not the gun's own; `newRig` records `rig.scheme`),
  barrel III a bright band at the muzzle anchor, breech III a brass band at the breech anchor (radii found by rays cast
  at the barrel). Used by the hangar's templates (cached per look) and by main for the lineup's battle rigs
  (`mods.looks`, research eras only). The hangar (`ui/hangar.js`) adds round each gun: the kit on a groundsheet
  (`kitSheet`: Barrel I staves and bucket, II star gauge; Breech I rammer and tongs, II oil cans and chest), the
  aiming posts (Sights I) and director (II), brushwood (Camouflage II) and a net drawn back (III), a second shell stack
  (Supply I) and a wagon and limber (II); once a battery: the plotting table (Sights III) and a tramway with a truck
  (Supply III); the relief crews as their own squad in working dress (`DRESS.relief`). `show` takes `battery.levels`
  and `battery.base`; each part records a spot, and `lookAt(part)` glides the camera there with a pulsing ring (the
  modifications rows call it on hover and focus: `modsBlock(..., onHover)`). The sim radios a relief taking a fallen
  man's place (`guns.damagePiece`, crews with `crewNeed`, not within 20 s). The powder heap lost its tarpaulin's sides.
  Not yet in battle: the shell marks on shells in flight and in the crews' hands, aiming posts and bigger ready-use
  stacks in the pits, reliefs walking in to the gun.
- (menu: ammunition supply as piles) The Ammunition supply upgrade now piles more of the gun's own shells (its model
  and Shells marks, `shellPiles`, instanced) behind its display, one pyramid a level; the generic 15 cm `shellStack`, the
  wagon and limber and the tramway are gone (a player read the oversized generic shells as foreign ammunition), and so
  are the square's side shell stacks and wagons (crates stay).
- (menu: the career reset) A Reset button beside the testing switches (`.mn-reset`, two clicks: the first arms it as
  "Confirm?" for 4 s) calls `Progression.reset()`: the research, levels, RP, battery points, battles and campaign wins
  cleared, the dev and unlimited points switches kept. `tools/progressiontest.mjs` covers it. The bar's wordmark now
  drops below 1700 px so the mission chooser keeps its room.
- (menu: the upgrade cameras) Each upgrade's spot carries the sides it is best seen from (`face`, azimuths) and heights
  (`el`); `bestView` tries them in order and takes the first from which rays to the spot and points round it meet
  nothing of the parade (else the clearest), cached per parade. The camera's distance fits the spot into the free gap
  between the panels (about 37 % of a wide screen). The barrel (level III) is framed whole, in profile, from the right
  of the line's first gun looking back toward the end of the line (only its own ammunition and open ground behind); the
  breech from behind and above. The camouflage net and brushwood are built apart (`cover`) and hidden while any other
  upgrade is looked at.
- (menu: the upgrades reviewed on contact sheets) `tools/hangarsheet.mjs [--era] [--kind] [--parts] [--levels] [--jobs]`
  drives the menu's hangar headless (`window.__menuHangar.show`, and the new `pose(part)`: the camera on a part at once,
  standing still, one frame drawn; `park` for the parade's lot and spots) and writes a sheet per battery to
  `shots/sheets/<era>-<kind>.png`: the overview with no upgrades and with all at their top, then each upgrade's hover
  view at levels 1 to 3. What the review changed: the barrel and breech bands are gone (bright rings read as chrome
  trim); `applyLook(rig, kind, era, levels, { parade })` now gives every gun the camouflage paint (battle and hangar)
  and, on parade only, barrel III a canvas muzzle cover with its strap (on each tube of a launcher, `anchors.muzzles`)
  and breech III the breech opened, its block and mechanism bright oiled steel, a round on the loading tray (`setShell
  ('tray')`; the hangar adds a tray and round on `anchors.breech` for guns without one). The kit (`kitSheet`) lies on a
  canvas groundsheet above the gravel: Barrel I sponge staves, bucket and oil tin, II the star gauge on trestles beside
  its case; Breech I rammer and tongs, II the artificer's chest open with oil cans and a tool roll. Camouflage II is
  hessian screens (`props.hessianScreen`) along the gun's right and back, III the net drawn back off the gun and hung
  in folds from a back rail: both on the far sides from the overview's camera, so the gun stays in view. The overview
  frames the line's first gun and its ranks (`lot.first`: the gun's box and the men's, projected and fitted into the gap
  between the panels from the left front, the rest of the line receding behind); a detachment over 40 men (Bertha, the
  Gamma, the Paris Gun) forms up in halves either side of the gun as the railway guns' do, two blocks wide at most, and
  so do the relief crews. Sights: the aiming posts (now set out in line) and the director stand together on the left
  flank of the gun's ranks (a railway gun's: on its bed between the halves), seen from the front; level III's view is
  the plotting table, which moved to the far end of the line past the reliefs. The views were widened where the sheets
  showed them too close: the muzzle cover (radius six calibres), the open breech (it takes in the round on the tray:
  `template` records `loaded`), the supply piles (from above the display in front), the relief crews (from their front,
  a big squad's front block). The sheet tool blocks Vite's hot reload as `tools/shot.mjs` does.
- (menu: the hover before the first level; the powder with the supply) Every upgrade has its camera spot from level 0,
  at the place its first level will stand, so hovering a part not yet bought shows where it will appear (the sheets'
  level 0 column). The menu's parade passes `battery.next = { guns, reliefs }` (`maxGuns`, the men relief crews I bring)
  for an upgradable battery: the hangar then keeps the kit's place on the gun's right before any is bought and the
  reliefs' place at the line's end, and pegs and tapes out the next gun's place after the last gun (the Guns row's
  spot, seen from beyond the line's end with the last gun behind it; with every gun in, the last gun). The line now
  runs on from the first gun's cell (centred on x = 0) instead of being centred, so a gun bought stands on its place
  and none of the others moves. The display's powder heap grows with Ammunition supply, as the piles do: its rows times
  the root of 1 + the level (`powder(kind, supply)`, `shellDisplay(..., supply)`).
- (console: the board fits the battery's reach) The WW2 and WW1 boards' first view and FIT now frame the selected
  battery and its reach (`board.js` `reachFit`: from 700 m behind the unit along its zero line to its longest range,
  or to the furthest target on the map past it, half that or 8 km across), as the British board already did; they used
  to show the whole operation for every gun. The V-1 and V-2 sites and the Paris Gun keep their strategic fits (the
  Flanders battle carries the V-weapons' `op.target`, which had sent every battery there down the strategic branch).
  The reach now counts each unit's own charges (`maxReach`; the leFH 18 has six, the sFH 18 five), which also fixes the
  board's out-of-range mark for those two.

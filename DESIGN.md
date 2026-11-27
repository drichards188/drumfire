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
whatever mode the player left them. (The German open battles have no auto mode since 2026-11-25: every battery waits
for the player's orders and the crews fight on their own only while the player serves a gun; the German pages' console
has no range table. See UI.)

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

**Choosing a battery** (main.js `selectUnit`). The British pages orbit the battery's anchor (`unitRoot[id]`, at
`unitDist[id]`, a low three-quarter view from behind the right shoulder). The German pages (`FRAME_GUN`: a WW1 or WW2
theatre; since 2026-11-25, the Godot battle's `FocusUnit` and `NextGun`) frame the gun that fires next (`frameGun`):
- **Which gun** (`nextGun`): the first live gun that is ready, else one laying or loaded, else the one furthest
  through its loading cycle, else No. 1. A gun that cannot make the order (`piece.blocked`, which `pickGuns` never
  fires) is passed over while another can.
- **The view:** from the front-left quarter (`QUARTER` 0.9 rad round from the barrel's line as laid, read from the
  traverse pivot, or the whole rig when it turns on its bed), pitch 0.18, the focus (`gunEye`) 1.3·k above the gun's
  ground and 10·k away. k (`GUN_SIZE[kind].k`) is the model's size corner to corner over the sFH 13's 7.5 m, measured
  once per kind from its first rig as built (barrel level, visible meshes only), with its footprint in the gun's frame;
  the distance grows when that footprint seen from the quarter would not fit nine tenths of the view's half-width
  (long barrels, wide beds).
- **When:** only when a battery is chosen (a number key, a tab, C back from the free camera, leaving a gun, the
  battle's start, `fastForward`'s `unit`). In between the player's orbit and zoom stand; from an orbit the zoom glides
  on from where it was. The focus follows a gun that drives (the Wespe, the Hummel, the Karl).
- **Not** on the title screen (its drift keeps the anchor) or at the V-1 and V-2 sites (their layer frames each step);
  a mode layer's own framing (`modeR.framing`, the Gustav's tasks) puts the target back on the unit's anchor.

### Models (`src/models/`, heavy models and field models agents)

```js
import { buildGun, GUN_KINDS } from './models/guns.js';   // GUN_KINDS = ['bl15', 'bl92', 'bl6', 'bl60', 'rail']
const rig = buildGun(kind);
rig.root          // THREE.Group in model space (front -Z, ground y = 0, metres)
rig.pivots        // { traverse, elevation, recoil, breech, ... } (traverse may be absent; extras below)
rig.anchors       // { eye, muzzle, breech, tray, shellStack, crew: [{ role, x, y, z, heading, pose }] }
                  // muzzle: its -Z is the bore direction; breech: where the shell goes in;
                  // tray: where a shell rests before ramming; shellStack: the ready ammunition
                  // optional: blockGrip (the breech block's handle), grips { [role]: node, [role + '2']: node }
                  // (models/v/de/common.js grip: a handwheel's hub, local +X its axle toward the man, userData.r
                  // the rim; or a point; crews.js stands him at it and puts his hands on it in the lay and operate
                  // poses; userData.pose the pose he works it in instead, as 'crouch' at a wheel at knee height)
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
// 'lanyard', 'crouch', 'ears' (covering ears), 'point', 'phone', 'dead', 'run' (a steady run, CREW_GAITS.run).
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
of earth colours. Nets and brushwood screens are the world agent's (gun pit dressing). The one exception to
"all procedural" is the German pages' lifelike crewmen (below), model files from the Godot version.

### Crews (`src/render/crews.js`, `crews_*.js`, `render/de/`, `render/ww1/`, `src/render/crewspace.js`)

`GunCrew` drills a rig's men (`Man`, one per `rig.anchors.crew` spot, each a `models/v/crew.js` figure) as a pure
function of `piece.job`, the time since `firedAt` and `piece.fireAt`. A man's behaviour calls `Man.put(x, y, z, h,
pose, t)` (root frame) and `Man.hand(side, x, y, z, w)`; `Man.reach(side, x, y, z, w, far)` is the arm IK itself, the
call `crewcheck.js` hooks for the audit.

**The German crews are spaced** (`GunCrew.spacing`: every kind but the British five, which are parked as they stand,
unchanged; `crewspace.js`, since 2026-11-25, the Godot version's DrillSpacing, DrillStance and DrillGait). The drill is
untouched and stays a pure function of the job; what it puts out is settled each frame:
- **The place.** `Man.put` goes through `spacePut`, which keeps the drill's own place in `m.sp` (`rawX rawZ rawH`,
  `drillPose`) and shows him there plus `sep` (clear of the others and the steel; `spaceStep` works it out for the
  next frame once every man has been put), `off` (a jump taken up as a short slide or turn), the stance's turn and
  step (`StX StZ StH`: his grips before him) and the turn to face his way (`FaceH`). A walking pose's phase follows
  the ground he is shown to cover. Read `m.sp.rawX/rawZ/rawH`, not `m.x`, for where the drill put him
  (`de/wespe.js` `spLoader` does).
- **The hands.** `Man.hand` only asks (`ask`). After the man's act `hands(crew, m)` gives each hand its grip:
  uncrossed (the right hand takes the grip further round to his right), a grip that jumps let go and retaken in a
  hand's time, following the drill's own eased weights. A behaviour that walks a man names the walk's ends with
  `way(crew, m, ax, az, bx, bz)`, so the spacing lets him as near the steel as they are.
- **At work.** A man with a hand on something fixed (a handle, the staff, the gun; not a load in his arms) is at work:
  two men at work are not pushed apart, and he moves with what he holds.
- **Props.** What a man gone from the gun carried goes with him (`GunCrew.dropped`). The staff is the first rammer's
  at the gun (none there, no staff), stood on its butt beside him on the side towards the bore (`carrySideOf`), and
  swung into and out of the bore over `staffSwing(L)`, max(1.05 s, 0.4 s a metre), starting that long before the
  stroke. The lanyard is drawn from his hand and falls free at the shot (the pull 0.16 s, `pullT`).
- **Loader and handwheels.** The light guns' loader reaches the block as the barrel comes home (`loaderAt`); on a handwheel each hand
  keeps its own grip and its half of the rim (`workGrip`, `rimNear`).

After touching `render/crews*.js` or `crewspace.js`, run `node tools/crewaudit.mjs <the 27 German kinds> --scn 0
--json --brief` and compare with `shots/crewaudit-godotport.json` (seconds past a glance over all 27 drills: grip
205.1, props 7.7, hit 22.7, self 8.4, joint 6.5; changelog 2026-11-25 for the figures before and the known
regressions).

### Lifelike crewmen (crew2) (`src/render/crew2/`, `public/crew2/`)

German pages only (`crew2Wanted()`: `?mode=ww1|ww2`); `?crew2=0` keeps the old figures there, `?crew2=1` asks for the
lifelike ones on any page, and the gear menu's "Lifelike crewmen" (`GunViews.crew2.enabled`) switches them live.
Ported on 2026-11-25 from the Godot game; its `tools/blender/crew/README.md` is the contract for the files.
- **Files** (`public/crew2/`, the Godot game's `assets/models/crew2`): six outfits `crew2_<outfit>.glb` (1917
  `german`, `german-cap`, `german-drill`; 1944 `german44`, `german44-cap`, `german44-gaiters`), each with three lod
  meshes (`body_lod0` to `2`: about 20k, 5k and 1.2k triangles) and a `crew2_<outfit>.check.json` (only an outfit
  whose check is `ok` is worn); `crew2.json` (the 56-joint skeleton, its zero pose, the faces); `clips.json` (clips by
  drill pose, from motion capture and keyed work); `skin_b.jpg` to `skin_d.jpg` (the faces' skin pictures).
- **Modules**, ports of the Godot C#: `index.js` (`Crew2`; Crew2.cs and CrewFigure.cs), `animator.js` (CrewAnimator),
  `clips.js` (CrewClips), `limits.js` (PoseLimits), `settle.js` (PoseSettle), `feet.js` (FootPlant), `skeleton.js`
  (CrewSkeleton), `pose.js` (CrewPose), `math.js`; and `files.js` (`Crew2Files`: crew2.json, the checks, the outfits,
  clips.json and the skins, each once; no shader patches, the battle hands in `patch` for its fog) and `parade.js`
  (`ParadeCrew2`, the menu hangar's men, below).
- **On top of the drill.** crew.js's figure is still posed by the drill every frame (its bones, its anchors and the
  props in its hands stay); its mesh is hidden and the lifelike body under the same root is posed from it: the clip
  for the figure's pose and phase on the live solver pose, the hands put back on the solver's grips by IK, the arms
  kept inside a body's limits, no joint turning faster than a body can, the feet planted. `GunViews` calls
  `crew2.begin(camera)`, `crew2.sync(crew, piece, now, camera, dt, level)` after each crew's drill, then
  `crew2.end()`. The figure gained `outfitName`, `armIk` and `reached` (which arms the solver or a `reach()` put on a
  grip) and `_poseT` (the phase it was posed at).
- **Loading.** `GunViews` starts `crew2.load(crews)` (through `Crew2Files`) when it is built, for the outfits the page's crews wear only (a
  1917 page needs three: about 24 MB of files and about 415 MiB of textures; 720 MiB with all six); main awaits
  `crew2.ready(onProgress)` behind the loading screen ("Dressing the crews") before compiling the shaders. An outfit
  missing, failing its check or not standing in crew2.json's zero pose keeps the old figure, as does every man if
  anything fails to load.
- **Cost rules.** LOD0 to 30 m, LOD1 to 110 m, LOD2 beyond, with no shadow; fingers, toes and faces within 54 m. Full
  animation (hands, limits, net, feet) within 110 m at crew level 2, every second frame beyond 54 m; LOD2 every second
  frame without the hands; at crew level 1 without the hands; a man out of the camera's view is not posed. Bones are
  kept out of the scene graph (their matrices and bone texture made only when the man is posed). While they are on, a
  gun served in person keeps them instead of the close tier (`CrewHD`). Measured: +0.35 ms CPU a frame with a
  battery's crews in view (worst 1.5 ms), the same draw calls in the usual view and 3 to 4 % fewer triangles there;
  `crew2.stats` reads the cost.
- **The gunner's eye** (`Man2.eye(out, fwd)`, the Godot game's `CrewFigure.Eye`): the head's joint as the animator
  posed the man this frame (`anim.point`; not his bones, whose head is scaled away for the player), 0.063 m ahead along
  the figure's facing and 0.075 m above. `GunCrew.eye` takes it whenever the man is drawn and posed, else the old
  figure's neck. The man at the player's post (`crew.player`) is posed in full every frame, in view or not; the view's
  own smoothing (`gunnerView.js` `place`) is the only damping, as in the Godot game.
- **The hangar's parade** (`parade.js`, the Godot game's MenuScene.Man; `ui/hangar.js` `men`): the German dress worn by
  these men, standing still, so each outfit's poses are worked out once and baked: man v (up to four an outfit) in the
  standing clip and moment the animator gives man v (`clips.json` 'stand' only), every lod mesh skinned on the CPU
  into plain geometry with face v's blend shape and skin, cached; a parade's men instanced by outfit, pose, lod and
  material. Before each draw, only when the camera moved, every man gets a lod by his height on screen (lod0 over 110
  px, lod1 over 30 px, 10 % give; at most 24 on lod0 and 200 on lod1, the tallest first) and a man out of the view is
  not drawn. Shadows come from stand-ins (every man on lod1, lod2 past 120 men) drawn only into the shadow map, which
  the hangar now redraws only when the parade, its light or the camouflage cover changes (`shadowMap.autoUpdate`
  false). Only the outfits the parade wears are loaded, behind the hangar's loading step ("Dressing the
  detachments"); the other war's textures leave the GPU on a swap (`keep`). `?crew2=0` on the menu, or a file that
  fails, keeps the old baked figures (the gear menu's switch is not stored). Cost on the Gamma's and the Gustav's
  parades (440 men, 1600 x 900): a frame 1.4M and 0.75M triangles and about 150 draws, from 5.4M and 5.7M and about 290
  before (the men alone: 13 draws and 1.25M triangles, from 18 and 5.1M); a frame that redraws the shadow map about
  1.6M and 290 draws. Files on the menu: about 24 MB for the three 1917 outfits (18 MB for the two 1944 ones), about
  435 MB of textures at most (lod0's only once a man is near).

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
(auto/manual; not in the German open battles), S SOS. Main owns 1 to 5, C, F, M, H, F3, `[` and `]`. The Panel itself owns Shift+A and the ALL AUTO / ALL
MANUAL pair under the status block of the battery tabs (`.tall`): every battery the player commands (`isUnlocked`) and
alive to one mode through `onCommand(id, 'mode')`, a battery on HOLD too; lit when every one is in that mode; Shift+A sets
manual when all are on auto, else auto; hidden on the lesson range (`sim.scripted`), with a single battery and in the
German open battles (`TH.noAuto`).

**The German pages' console** (`TH.lean`, since 2026-11-25, the Godot demo's of 2026-11-20 and 2026-11-24): main.js
sets it on every WW1 and WW2 German page but the campaign missions (`setUiTheatre({ lean: true, noAuto: NO_AUTO })`):
the open battles, the special missions, the lessons and the test range. The British game and the campaign missions keep
the console above. What changes (`console.js`, `orderCard.js`, `gunsCard.js`, `board.js`, `panel.js`):
- **No header.** The callsign plate (the tab says it), the status line, AUTO / MANUAL / HOLD and the four S.O.S. keys are
  gone; S still calls the Sperrfeuer. A (auto or manual) still works where there is an auto mode (the special missions); in the open battles (`TH.noAuto`) `KeyA` returns false. The gun's note (`cfg.note`) is the guns
  card's hover text.
- **The status slip** (`.statslip`, the `status` tut name): under the fire order's target, or atop the right column when a
  special card takes the fire order's place (the Paris Gun's SCHUSSWERTE), shown only when it has something to say, in
  this order: a Sperrfeuer call no battery answers (flashing, below), BATTERY SILENCED, the console's answer to the last
  key (3.2 s), HOLDING, WITH ITS CREW (a battery handed over while the player serves a gun: its work, and that any order
  takes it back), NOT READY with the controller's gate and the card to see, CANNOT FIRE with the short reason (the whole
  on hover). Hidden with no target laid or nothing wrong (how to fire is on the FIRE key).
- **The fire order** keeps what the player acts on: the target's name large with its range and grid square under it
  (the observers' and the Arko's slips give targets by the square), rounds, fuze, guns and the corrections made. The
  line, the elevation, the time of flight, the charge (since 2026-11-26, the user's: the crews pick it, `chargeAuto`;
  Q and E do nothing there but on the Paris Gun's LADUNG, routed to its card) and the F.O. stamp go (the battery works
  them out). The correction keys carry bold drawn arrows (SVG `.karrow`; the key and
  the Shift step on hover), the step key a dot for each of its five sizes (`.kdots`), FIRE "n of m ready · Space".
  With the ranging counter-battery (`sim.cbModel`, a level battle) the rounds row ends in the DECKUNG key (U; "Ranging
  counter-battery").
- **No range table** (`rtab` is neither mounted nor updated). The guns card stands under the fire order in its place and
  the missions and the messages share the bottom row; a special card keeps its places (the Paris Gun's four, the Gustav's
  and the Karl's procedure card with the guns in the bottom row).
- **The guns card** (`buildLean`, `updateLean`): one line a gun: a lamp (green ready and laid, amber loading or laying,
  red knocked out, dark idle), No. N (· YOU while manned), what it is doing (`stateText`, as before), the crew only when
  short, WORN and the wear bar only from 0.5 wear, health, MAN or LEAVE. The bed and move rows are unchanged.
- **The board's bar** is one line (`.bbar.one`): how the board is worked while the pointer is off it (`TH.boardHint` or a
  short default), under it the grid square, the range and the target, no bearing; the scale bar sits lower.
- **The battery tabs** (`LEAN_LETTER`): nothing in the ring at the player's orders, C with its crew (the player at a
  gun), H holding; no ALL pair and no Shift+A (all three only with `TH.noAuto`; the special missions keep A, M, the
  ALL pair and Shift+A). Hold's reason (`guns.js` `problem` on a `metric` gun) no longer names A
  or MANUAL.
- The V-1 and V-2 launch console (`launch.js`) keeps its own header with AUTO / MANUAL / HOLD and A.

**No auto mode in the German open battles** (`TH.noAuto`, main.js `NO_AUTO`: a theatre, no campaign mission, not the
range, op kind 'battle': the 1918 ridge and the WW2 Flanders battle). The sim's units still start on auto (the
crews-only tests, the attract bombardment), so main's `start()` commands every one to manual after `newBattle`. Every
battery then waits for the player's orders: its crew loads and lays but takes no mission and fires no round by itself.
Only while the player serves a gun do the other batteries fight on under their own crews (`othersAuto`, "The gunner"),
back at the player's orders on leaving. The special missions keep their starting modes and the A key (the lean console has no mode switch to click, but
A, Shift+A and the ALL pair work there as before), so a supporting battery or the Paris Gun can still go to its crew.
The lessons set their own modes.

**The Sperrfeuer call nobody answers** (`common.js` `unanswered(sim)`, only with `TH.noAuto`): a live `sos` mission with
no live battery on it (`missionId`) laid (`order.ok`) and firing, as `{ m, sector, name }`; the Panel keeps it each frame in
`panel.call`. The console's slip says "SPERRFEUER B, name: NO BATTERY ANSWERS! Press S" and flashes (`.statslip.alarm`),
with the bell (`snd('bell')`) every 4 s, at most 12 a call, only while sim time runs (the count starts again if the
batteries leave the line with the call still up); its sector chip over the tabs blinks red (`.fchip.call`) with the
call on hover; and main puts a red banner over the 3D view (`hud.js` `sosCall(call, atGun)`, `#sos-call`, while the
battle is playing) whose second line, at a gun, says P comes first (the gunner's `keysOff` keeps S from the console).
S puts every gun that can reach on the line; a Sperrfeuer no battery could lay on says so on the slip.

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
hangar loads three.js, `src/ui/hangar.js`, and nothing of the battlefield; its German dress is the lifelike crewmen,
`render/crew2/parade.js`), a URL with `play`, `tutorial` or `sandbox` is a game page whose loading screen
(`src/ui/loading.js`) stands while `init()` builds the world; then `start()` runs `sim.newGame` (or the lesson
starts) at once.

**What to play** (`menuItems.js` `TABS`, since 2026-11-02): three lists, `battle` (the career's open battle,
`ww1:ridge`, picked by threat level), `special` (`ww1:paris`, `op:sevastopol`, `op:karl`, `op:v1`, `op:v2`) and
`training` (`tutorial:training`). Everything else is `tab: 'hidden'` and opens only by URL: the campaign missions, the
WW2 sandbox, the test range, the British entries, the Nebelwerfer lesson and the special missions' lessons, each of
which is its mission's guided first run (`GUIDE`: op key to lesson id; the lesson item's `guideFor` points back, so a
lesson left for the menu selects its mission; the lesson's `after: { label, op }` plays the mission from its end card,
main.js `host.after`). The chooser (`ui/menu.js` `renderDrop`, `renderLevel`) keeps each view to a few short chunks
and puts the long text on hover: the levels as ten steps (`.lv-seg`; the lineup's rating marked `.rec`, the levels won
ticked `.won`, each step's hover its first-win bonus or "won"), the chosen level's name and "New <fresh>" (`sub` and
`lines` on hover), four facts (Mission, Length "about N min" from `minutes` with the failures allowed on hover,
Attacks, Pay with "First win: +N RP" until won), its threats as chips, the lineup's fit (`capability.js`: above it,
ready, or "Your lineup outclasses this front: pay ×0.75", `.cut`, the overmatch cut); with no level picked the menu
opens on the lineup's rating (`career.rating`, and follows it as the lineup grows; `drumfire.menu` `level` is written
only once one is picked); its mission is dealt from the lineup's levels (`lineupLevels('de')`), as the loading screen's
briefing is, so both match the battle; the special missions as picture cards (`stillOf`) with a
tagline (`TAGLINE`), a guided or straight choice (`memo.guided[key]`, guided until the lesson is done) and the
difficulty. The Paris Gun's run is `ww1/tutorial.js` `w-paris` (op `paris`): the lesson's `build: true` reaches
`sim.newGame({ build })` as `sim.lessonBuild`, so `ParisCtl.reset` leaves the gun in pieces on the scripted range;
main's `host.redirect` reloads a WW1 lesson's page on its op as it does a WW2 one's. A special mission's first win pays `research.js` `specialBonus(kind)` (half its research cost, 500 at
least) through `Progression.completeSpecial(key, kind)` (saved `specials`; main.js `SPECIAL`).

### Crash and lag reports (`src/reports.js`, `src/telemetry.js`, `src/perfcause.js`)

Players' browsers report to Sentry (org `enveloperty`, project `drumfire`, platform javascript), so lag and errors on
machines we never see show up ranked by how many players hit them.

- **When.** `reports.js` is the switch and never loads Sentry itself: `available()` (the build holds a DSN,
  `VITE_SENTRY_DSN` from the gitignored `.env.local`), `reportsOn()` (localStorage `drumfire.telemetry` not `'off'`),
  `telemetry()` (loads and starts `telemetry.js` once, or resolves null), `setReports(on)`. Not on the dev server or
  under `navigator.webdriver` unless `?sentry=1`; `?sentry=0` stops it anywhere. boot.js calls `telemetry()` beside
  the GPU check (`gpu.js` `gpuInfo` gives its state and renderer), so a page without WebGL still counts.
- **Errors.** Uncaught errors and rejections (`globalHandlers`), at most 10 a page; `browserApiErrors` leaves
  `requestAnimationFrame` and `addEventListener` unwrapped, so the frame loop and the input handlers carry no wrapper.
- **Lag spikes.** main.js makes the frame recorder in the build too when `telemetry()` resolves (`post: false`,
  `onLine: tele.perfLine`, `tele.attach(perf, { settings })`). Each spike line is named by `perfcause.js` `analyse`
  (moved out of `tools/perfreport.mjs`, which imports it back): shaders, cpu (with its worst stage), gpu, outside.
  A worst frame of `REPORT_MS` (100 ms) or more, the window not having lost focus, becomes a warning event with the
  fingerprint `['lag-spike', cause, stage]`, the title "Lag spike: fx stage" and the like, tags `lag.cause`
  `lag.stage` `lag.ms` (a bucket) `quality` `state` `unit` `cam`, contexts `lag` (perfreport's one-line summary, the
  stage excesses, new shaders, geometries, textures), `battle`, `events`, `scripts`, and the attachment `spike.jsonl`:
  the session's start line, the last 30 summary seconds and the spike, readable by `node tools/perfreport.mjs`. At
  most `MAX_SPIKES` (3) a page and one per cause and stage.
- **Metrics** (Sentry Application Metrics). `session.start` (count) on every page; on game pages once a minute of
  play and when the page is hidden, from the recorder's `hist` (1 ms bins to 1 s): `frame.p50`, `frame.p95`,
  `frame.p99` (distributions, ms), `fps` (gauge), `frames` and `lag.spikes` (counts, by `cause`), each with `state`
  and `quality`; once `load.to_play` (ms from opening the page to the first second playing). Every event and metric
  carries `page`, `mode`, `op`, `gpu.state`, `gpu.name` (the renderer string shortened: "NVIDIA GeForce RTX 4070").
- **Game events** (2026-11-26, the first run's funnel; "First run" below): the api's `count(name, attributes)` and
  `distribution(name, value, { unit, attributes })`, sent only while `reportsOn()`. Once per browser (the milestone
  is marked in `drumfire.firstrun` whether reports run or not, so a player who turns them on later never sends an old
  one): `funnel.first_battle`, `funnel.first_shot` with `funnel.to_first_shot` (ms from opening the page),
  `funnel.first_hit`, `funnel.first_mission`, `funnel.first_win`, `funnel.second_battle`. For each career battle that
  ends (won, lost, or left by Main menu or `pagehide`, then `tele.flush()`): `battle.end` with `level`, `won`, `end`
  (victory, defeat, left), `minutes` (the battle's clock), `real_minutes` (the player's) and `first` (the first
  battle's page). Career battles only, never attract or scripted; nothing personal, the same tags as the rest.
- **Privacy.** `dataCollection: { userInfo: false, cookies: false }`; the project drops IP addresses
  (`scrubIPAddresses`) and the city and region Sentry derives from them (a `relayPiiConfig` removal rule), so only the
  country stays; `setUser({ id })` is a random id per browser (localStorage `drumfire.telemetry.id`) so issues count
  players. The switch: the menu footer's Reports button and the gear menu's "Send crash and lag reports".
- **Builds.** `vite.config.js` defines `__DRUMFIRE_RELEASE__` (`drumfire@<date>-<time>+<commit>[-dirty]`) and, with
  `SENTRY_AUTH_TOKEN` in `.env.local`, makes hidden source maps, uploads them for that release with
  `@sentry/bundler-plugins` (its own telemetry off, no commits set) and deletes them from `dist/`; without the token
  there are no maps. Environment `production` in the build, `development` on the dev server.

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
  'manual' (the AI would otherwise undo it); in the German theatres `sos` also takes back a battery the gunner handed
  to its crew ("The gunner"). `fire` returns false when the order is not laid-able. `sos` ignores the unit id; a
  unit that cannot reach the line (range or arc) is left alone. Ranging: with `rounds 1` on a mission in state 'ranging' and no `guns`,
  only the lead piece fires; `rounds > 1` fires every piece (and moves the mission to 'ffe'). The console always sends `guns` for units
  with more than one piece (selector `memo.guns`: '1', '2' or 'all'). On auto it sits on 1 GUN while ranging or with no task and goes to
  all guns when the mission is 'ffe', a report says on target or ROUNDS is above 1. On manual or hold it stays where the player put it
  (since 2026-11-10; the fuze likewise: only a crew on auto has it picked for each mission, `Director.assign`).
- Reports: `mission.reports[]` (also `sim.reports`): `{ t, missionId, unitId, shellId, n, observer, observed, over, right, clock, text,
  ok, corr: { add, right }, fired, aim }` (`fired` the round's `shell.t0`, `aim` its lay's point `{ x, z }`: since
  2026-11-26, in both report builders, the base's and `ObserversWW2`'s; only the level crews read them). `over`/`right` are the OBSERVER's estimate (m; air reports are quantised to the circle and hour),
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

The German career: one tree for the 1918 and the WW2 guns (`TREE_OF`: the eras `ww1` and `ww2` map to the tree `de`),
fought in the open battle on the 1918 ridge (main.js `RESEARCH_ERA = 'de'` on `?mode=ww1&op=ridge&play=1`; the WW2
open battle and the British game are sandboxes for now, Britain hidden from the menu, its `TREES['1917']` kept).
`src/research.js` is the data and the pure functions, `src/progression.js` the saved career, the menu's Hangar
(`ui/menu.js` `hangarInfo`, `hangarMods`, `slotCards`; the 3D view `ui/hangar.js`) and Research screen (`researchView`)
the screens; docs/PROGRESSION.md says it for players.

- **Tree** (`TREES.de`, `LINES.de`): `{ kind, line, tier, weight?, after, cost, offmap? }`. Since 2026-11-14 `tier`
  is the rank as an era, as War Thunder's: I and II the guns of 1914 to 1918 (I field and medium, II heavy and
  super-heavy), III and IV those of 1939 to 1945 (III field, medium and rockets, IV heavy, super-heavy and the
  V-weapons); `RANK_ERA` names them. The ranks keep the eras together; the price is the battery's power alone, whatever
  its era (the WW1 siege guns 2,000 to 2,800 RP, the WW2 field howitzers 600 to 1,500). `weight` (`weightOf`, else
  `tier`) is the old weight class, which scales `nextCost` and orders the lineup picked for you. Lines of one type, researched in order
  along `after`, never crossing; a rank opens as War Thunder's do (`RANK_GATE.de`): rank I from the start, rank II
  with 3 rank I batteries the career has (the starting FK 16 and sFH 13 count, so since 2026-11-26 rank II opens with
  the K 17, the one rank I battery to research: 350 RP, about the first battle's pay), III with 3 of rank II, IV with 4
  of rank III, in any line
  (`Progression.rankGate(kind)`, `researchBlock`; `needsOf(kind)` and `blockerOf` are the line alone). Before, a
  line starting above rank I opened through a `via` in the column beside it, which tied the columns' order and made
  the Gotha wait on two WW2 rocket batteries. `LINES.de` is the Research screen's column order (field artillery,
  long-range guns, mortars, siege guns, railway guns, off-map support, rockets: the lines open at rank I first). The
  screen (`menu.js` `researchView`) draws it as War Thunder's: a CSS grid of a rank gutter and a column per line (a
  rank's era on hover), a band per
  rank (rows sized to the most batteries a line has at that rank), and `treeArrows`, an SVG over the grid drawn from the
  nodes' boxes (redrawn by a ResizeObserver) with an arrow along every `after` (lit when researched, amber
  for the next that can be); the starting batteries (`START_KINDS.de`: the FK 16 and the sFH 13, cost 0, since
  2026-11-26; the Ringkanone C/92 from 2026-11-01, the K 17 before) are the career's from the start
  (`Progression.isStart`, which follows `START_KINDS`, no longer "a root with cost 0"; `owns`, the lineup picked for
  you, the hangar and the Research screen's marks follow it). Seven lines since 2026-11-01, each from 1914 to 1918 to
  the Second World War, 20 batteries since the cuts of 2026-11-26 (34,000 RP to the end): howitzers (Field
  artillery): FK 16 -> sFH 13 -> leFH 18 -> sFH 18 -> Hummel; guns: K 17 -> K 16 -> K 18 -> K 38; railway: Langer
  Max -> Gustav; mortars: Mörser 16 -> Mörser 18; siege: Beta-Gerät -> Bertha (2,400 RP, the Gamma's place and price
  since the merge) -> Karl; rockets (Rockets): Nebelwerfer 41 -> Nebelwerfer 42; support: Gotha strike -> V-2. Taken
  out: the schwerer Minenwerfer on 2026-11-02; on 2026-11-26 the ramp guns (sFH 93, Ringkanone C/92, Mörser 99), the
  schweres Wurfgerät 40, the H M1, the K 12, the Kurze Bruno, the K5 and the Wespe, the Gamma merged into Bertha, the
  Paris Gun and the V-1 out of the tree with their own missions as they were (`research.js` `OUT_OF_TREE`: each one's
  cost, weight, line and heir; `progression.js` carries a save over, Save below; commit 1dd259b has them all in the
  tree). `offmap` (`isOffmap`: the Gotha strike and the V-2; the V-1 and the Paris Gun too, from `OUT_OF_TREE`) fight
  in the open battle as off-map support. `gunEraOf(kind)` gives a gun's era for its look and its crews' dress (`ww1`, `ww2`, `1917`).
- **Research** (`Progression`): `target[tree]` (`targetOf`, `setTarget`: any battery whose `after` and `via` are owned) receives
  every RP (`addRP`, `reward`, `complete`); `progress[kind]` the RP put in; `settle` researches what is paid for and
  carries the rest to the next in the target's line, else the cheapest open one (RP with nothing left wait in
  `rp[tree]`). `researchBlock(kind)` is '' when it can be researched, else why not; `research(kind)` at once only with
  unlimited points (`free`).
- **Upgrades**: `levels = { guns, shells, barrel, breech, sights, camo, supply, crew }`. Every battery starts with one gun (the starting FK 16 and sFH 13 with two of their four pits each, `research.js` `START_GUNS`, re-exported by progression.js, since 2026-11-26) and
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
  `mission.points` over `POINTS`). `battleReward(sim, { won, cut })`: each battery's credit times `PAY[difficulty]` (0.8 / 1 /
  1.35; a threat level's `pay` in its place) times the overmatch `cut` (below; default `sim.payCut`, else 1, clamped to
  0..1) as its points; RP = their sum + 4 a minute in action (up to 45) + 400 for a win (`WIN_MISSION` 250 at a level).
  main pays once (`payOut`): at the end card, when the page is left (`pagehide`) or the battle is given up for another
  (no win bonus then).
- **The climb's pay** (2026-11-26, the difficulty rework; docs/PROGRESSION.md says it for players):
  - *First win* of each threat level (`firstWinRP(n)`): the level's victory paid again, `WIN_MISSION` times its `pay`
    to the nearest 50 (250 at level 1, 1,000 at level 10, 5,450 for all ten), once, never cut. `Progression.wonLevel(era,
    n)` counts the win and pays it to the research target (`addRP`, `settle`); main calls it on a won level battle
    before `payOut`, so the summary's research line includes it (the record's `rp.first`, the row "First win of level N").
  - *Overmatch cut* (`OVERMATCH = [[4, 0.5], [3, 0.75]]`, `overmatchCut(rating, n)`): full pay down to two levels below
    the lineup's rating, ×0.75 three below, ×0.5 four or more; 1 without a rating, never above 1. main sets
    `sim.payCut = career.overmatch(era, n)` after `newGame` and the reward feed's `payK` multiplies by it; the summary
    notes it (the record's `cut`). The first-win bonus is never cut.
  - *The top part gate* (`TOP_PART_WIN` 6): the third level of every part but guns opens with a win at level 6 or
    higher (Helldivers 2's super samples), on the trees with threat levels only (`de`). `Progression.partGate(kind,
    part)` ('' or 'win a level 6 battle', returned first by `upgradeBlock`), `topPartsOpen(era)`; dev mode and
    unlimited points open it. No grandfathering: a part already at level 3 keeps it, a level 6 played but not won
    opens nothing. The menu's modifications row says WIN A LEVEL 6 BATTLE (`.rs-lock`) in place of Upgrade.
  - *A lent battery* (`u.lent`, or `lent` on its loadout entry; a generic rule, and no battle lends one today: the
    first battle's lent Langer Max was taken out the same day, "First run", and the basic training's Mörser 18 pair is
    a scripted lesson that pays nothing): its credit is filed under `lentKey(kind)` (`lent:<kind>`) in `r.batteries`,
    so it is in `fought` and the RP while `gain` gives battery points only to tree kinds (`nodeOf`); it is never
    upgraded or researched by the battle. main's `owed()` keeps it off the battery points either way, and the summary
    would list it "(lent: its pay went to research)".
  - *Helpers* (read only): `levelWins(era)` (ascending), `firstWinBonus(era, n)` (0 once won), `overmatch(era, n)`,
    `rating(era)` (`Progression.rater`, capability.js `recommendedLevel` on `lineupLevels`, memoized; the menu sets it
    and progression.js also loads it with a late dynamic import, so the loading screen never waits for capability.js;
    a lent battery is not counted; null on a tree without levels).
- **Campaign missions** pay a one-off RP bonus on the first win (`missionBonus`: half the featured battery's research
  cost, at least 500) and no longer grant a battery.
- **Save** `drumfire.campaign.v4`: `{ completed, rp: { tree }, target: { tree }, progress: { kind }, researched, bp:
  { kind }, levels: { kind }, battles: { tree }, lineup: { tree }, threat: { tree }, wins: { tree: { level: times } },
  dev, devSet, free, start }`; older saves are not read (a new career). `start` is the save's mark (`START`): 4 for the
  20-battery tree (2026-11-26, after the cuts), 3 for a career begun with the FK 16 and the sFH 13 (the same day, before
  them), 2 with the C/92 (2026-11-01), none with the K 17 (`OLD_START`: such a career keeps its K 17). Loading a save
  from before the tree's cuts carries it over once: the RP put into every cut battery come back (`REMOVED`, built from
  `OUT_OF_TREE` but the Gamma); its battery points and what its upgrades cost, at its own weight's prices
  (`research.js` `levelCost`), go to its heir as battery points (the Wespe's to the Hummel, the H M1's to the Mörser 18,
  the Paris Gun's, the Bruno's, the K5's and the K 12's to the Gustav, the Wurfgerät's to the Nebelwerfer 42, the
  V-1's to the V-2); the two `MERGED` give their heir their guns and parts themselves and their lineup slot (the C/92
  to the sFH 13; the Gamma to Bertha, whose research it also is: a save that had the Gamma has Bertha, its RP back only
  when it had Bertha too, RP put into the Gamma go on into Bertha, a research target on it is Bertha); a battery whose
  cost fell (`REPRICED`: Bertha, 2,800 before) gives back what a save marked below 4 paid over the new cost, and RP put
  into any battery past its cost come back. Loading a save from before the ramp guns' cut (2026-11-26) carries it over once, so
  nothing earned is lost: the RP put into the sFH 93 and the Mörser 99 (`REMOVED`) and, for a save marked below 3,
  into the FK 16 (300) and the sFH 13 (450), now free (`NOW_FREE`), come back; a cut battery's battery points, and what
  its upgrades cost at its heir's prices, go to its heir (`CUT`: the sFH 93's and the C/92's to the sFH 13, the Mörser
  99's to the Mörser 16); the C/92's guns and parts go to the sFH 13 themselves (each the higher of the two where the
  sFH 13 had levels, the lower one's cost as points), and its slot in a lineup too (a lineup left empty fields the
  sFH 13, the sFH 93 and the Mörser 99 leave theirs); a starter's guns bought before `START_GUNS` gave them come back as
  points. Only the starters' RP read the save mark, and nothing can pay twice: the cut kinds are not saved again. `wins` (2026-11-26) is optional: a save without it has every first win still to pay,
  bad entries (a level outside 1 to 10, a count that is not a positive integer) are dropped, and `reset()` clears it.
  `battles` and `threat` keep their meaning (`wonLevel` counts no battle). Dev mode
  (`DEV_DEFAULT`, off since 2026-10-29) lays every battery researched and at its top over the career in battle (`Progression.battle(era)`);
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

### The day fitted to the lineup

`src/sim/lineup.js` `LineupDay`, made by `Director.reset` and `DirectorWW2.reset` (the open battle) only when the game
has a loadout and is neither attract mode nor the scripted range; without one the day is exactly as before. The
director wraps its script (`day.wrap`, so `day.scripting` is set while an entry runs) and both `siteMission`s ask
`day.gate(id, over)` first: `{ id, over }` to go ahead (perhaps another site) or null. **Reach:** a scripted site no
battery in the field can serve (`Crews.canServe` on a probe mission: range, arc, `suits`) or that already has a mission
goes to another site of the same kind one can, else it is left out; the counter-battery calls and the convoy and train
(checked before their traffic is spawned) come only for what a battery reaches. **Cadence:** while the missions in hand
(open, ranging, ffe; not `sos`, `barrage` or a role's) fill the lineup's capacity (1 + 1 a battery with two guns or
more, 0.6 with one, rounded, 3 at least) a scripted site waits in `day.queue` for up to 600 s; a free hand takes the
waiting one that best suits a battery (`Crews.score`). **Work:** from phase 2 until the barrage, with a free hand and
nothing waiting, a battery that has had no mission for 80 s gets the site that suits it best (`Crews.score` plus a
little noise; not the role sites, not traffic, not a site with a mission). Own random stream (`mulberry32(seed ^
0x11e0b)`). `day.stats` counts `moved waited dropped work`; `tools/researchtest.mjs` prints them and the site missions
opened, done and failed, and `NODAY=1` runs the fixed day to compare.

**Pace** (`DirectorWW2.pace`, so the WW2 and the 1918 ridge battles; with a `LineupDay` only): the day is a script on the
clock, so a lineup that finished its work early waited for the next order, the next attack or the end of a level's
day. After `LULL` (15 s) with nothing in hand (no mission open, ranging or ffe, no assault not yet `resolved`, no active
barrage, nothing in `day.queue`) the day runs on as a time lapse: `director.ahead` grows (at least 8 times as fast,
and fast enough to be there within `LAPSE`, 10 s) until the next script entry or `endAt`, and never past it. The day's
time `director.dayTime` (`sim.time + ahead`) drives the clock (`sim.clock`, so the sun and the night), the phases, the
script and a level's day end; the battle's own `sim.time` (deadlines, reloads, the British fire, an assault's rockets)
never jumps. `sim.lapse` is true while it runs, and the radio says so once. Without a lineup `ahead` stays 0.

## Off-map support (`src/sim/support.js`)

The lineup's weapons that fire from beyond the map (research.js `offmap`: the Gotha strike and the V-2) take no
gun pit in the open battle: the player picks one, gives it a point, and it fires in its own time, then reloads for a
long time. They keep their own launch missions (the WW2 V-1 and V-2 operations, the WW1 Paris Gun mission), which are
untouched. Game values throughout (the real spreads are kilometres; these are sized to hit a battery on this map).
Since the tree's cuts (2026-11-26) the career's line is the Gotha strike then the V-2; the V-1 and the Paris Gun keep
their entries here, dormant (no lineup names them).

- **Made by `sim.newGame`** when the loadout has off-map kinds (`supportKinds(loadout)`), never in the demonstration
  or on the scripted range: `sim.support = new Support(sim, kinds)`, else `null`, so every battle without them is
  bit-identical (`tools/ww1test.mjs`). Own random stream (`mulberry32(seed ^ 0x0ff3a9)`), never `sim.rng`.
  `sim.step` calls `support.update(dt)` after the specials, also after the battle's end (a strike in flight lands).
- **Assets** (`sim.support.assets`, plain objects): `{ kind, name, state, t, dur, aim, at, shellId, last, mods }`.
  `state` is `ready`, `preparing` (`t` s left), `flight` (`t` the whole flight's time left), `reloading` (`t` left);
  `aim` the point ordered, `at` the fall point drawn at launch (`aim` plus the spread), `last` the latest strike
  `{ x, z, off, t, hit, destroyed }`. `mods` from the battery's upgrades: `load` (breech and reliefs) on the
  preparation and the reload, `disp` (barrel) on the spread, `dmg` (shells) on the burst (`shell.dmgK`).
- **Values** (`SUPPORT`): prep, reload, off-map flight, spread (one sd per axis): V-1 110 s, 540 s, 45 s, 110 m; V-2
  120 s, 480 s, 60 s, 35 m (since 2026-11-26, the line's step up on the Gotha: 170 s, 780 s, 80 m before, when it
  silenced a field battery in two strikes and 22 min against the Gotha's one strike in 5.3; now one strike in 3.6 min,
  12 of 12 field batteries and dumps, and a tank laager in two where the Gotha takes none, 12 seeds); Paris Gun 75 s,
  600 s, 80 s, 60 m; Gotha 150 s, 720 s, 50 s, 50 m. Over the map (`V1`, `V2`, `PARIS`): the V-1 comes in
  from 9 km east of its fall point at 420 m and 175 m/s, its motor cuts 1.1 km out (`shell.engineOff`) and it steers
  down onto the point, speeding up to 240 m/s; the V-2 falls from 30 km on a line 10 degrees off the vertical at
  900 m/s; the Paris shell from 11 km at 55 degrees and 780 m/s. About two to five strikes each in a battle.
- **The projectile** is a sim shell `{ own: true, guided: true, support: kind, unitId: null, kind }` flown by the
  controller (`sim.moveShells` leaves guided shells alone) and burst through `sim.burst(s, p, false)`: the targets,
  wire, infantry (ours too), craters and the `shellBurst` event as any own shell; `SHELLS.v1`, `v2`, `paris` are the
  warheads. With `unitId: null` it earns no credit and no observer reports it (as the WW1 division's field guns).
- **Commands** (no unit: `sim.command(null, 'support', args)`): `{ kind, x, z }` orders it onto a point (a preparing
  one takes the new point); `{ kind, cancel: true }` stands a preparing one down (no reload); `{ kind, ask: true }`
  tells why it cannot take an order. Refusals go on the radio as `sim.tell` does for the guns (`<name>: cannot fire.
  <reason>.`, not repeated within 4 s); `support.problem(kind)` is the reason ('' when it can): preparing, already on
  its way, reloading (with the time left), off the map, no target, the battle over. `sim.events.support(asset, what,
  shell)`: `order launch arrive cut burst ready`. Radio lines in the theatre's map references (`theatre.ref`).
- **Console** (`src/ui/support.js`, `support.css`, mounted by the Panel under the battery tabs): one tile per weapon
  (`data-tut` `support`, `support-<kind>`), its state and countdown (READY, PREP, AIR, RLD) and a bar; pick a ready
  or preparing tile and the next click on the board (a point or a target's symbol; consoles/console.js asks
  `shared.supportClick` first) is its target; pick it again to put it down; × stands a preparing one down; a tile
  that cannot take an order asks the sim, which says why. The board (`board.js` `BOARD_OVERLAYS`, a list of
  `f(board, g, sim, unit, T)` drawn after the theatre's overlay) shows each aim with a ring two spreads across and its
  countdown, the last strike for 90 s, and while one is picked a ring under the cursor and the word at the top.
  main routes `support` orders past `canCommand` (they have no unit).
- **Pictures and sound**: render/shells.js draws the projectiles as shells of their kind (the V-1, the A4, the Paris
  shell); `render/support.js` `supportTrails(fx, sim, dt)` (from the render layer) the V-1's pulse-jet trail while its
  motor runs. The audio engine's shell voices do the rest: the V-1's buzz until `engineOff` (silence d / 343 s
  later), the V-2 unheard until its arrival (`burst` with kind `v2`: the double crack, then the fall's roar), the Paris
  shell's freight train; main asks for the WW2 banks on the career's ridge when the lineup has the V-1 or the V-2.
- **Test:** `node tools/supporttest.mjs [seeds] [--difficulty] [--lineup dev|start] [--kinds gotha,v2]`: the ridge
  battle, auto crews, each weapon ordered onto a target whenever ready; prints strikes, misses and kills, and checks
  determinism, a refusal told and a retarget.

## Threat levels (`src/threat.js`, `src/capability.js`)

The career's open battle (the 1918 ridge, version 1: all ten levels there) takes a level picked before battle, as
Helldivers 2's difficulties: `sim.newGame({ loadout, level, modifiers })`. Without `level` nothing changes (every test
bit-identical); with it the lineup's `opposition` is not used.

**The shape** (2026-11-26, the difficulty rework for landing and keeping players). The game is to land players from
social media on a browser page, where people decide within seconds and a session is 11 to 20 minutes (Poki and
CrazyGames data); level 1 took about 13 minutes and levels 3 to 10 took 23 to 34, longer with workload. Now: quick
early payoffs, the length roughly flat from the middle up, and the climb from danger (the British counter-battery
fire, Helldivers 2 style: "Ranging counter-battery" below) and the objectives' complexity (simple, a certain gun, two
steps, a hold), never from a flood of missions. What stays modest: the mains, the secondaries (optional, for pay)
and the attacks (the peaks). X-Zeit's chance, the strongpoints, the modifiers and the pay (×1 to ×4) are as before.
The first loss should come at level 5 or later and feel like the player's mistake (bracketed, and no cover taken).

| Band | Levels | Its job | Length (a human) | Won (a human, the recommended lineup) |
|---|---|---|---|---|
| Hook | 1, 2 | the first session: a fast payoff, the loop taught in play | 4 to 7 min | 97 to 99 % |
| Habit | 3, 4 | the first hour: survive and hit back | 9 to 11 min | 88 to 93 % |
| Core | 5 to 7 | the full Helldivers tension | 13 to 16 min | 65 to 80 % |
| Mastery | 8 to 10 | the player who owns the tree | 18 to 20 min | 35 to 55 % |

| Lv | `minutes` | Mains / secondaries | Attacks | British guns answering (`RANGING.from`) | Hold (`hold`) | Two-step (`trace`) | New (`fresh`) | Aim, all auto | Won, all auto | Length, human proxy (median) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4 | 1 / 1 | 0 | 18-pounders | a short secondary, Hellfire Corner | | Take a mission, correct the fall, destroy; the first "Deckung!" | 98 % | 100 % | 3.0 min |
| 2 | 7 | 1 / 1 | 1 | 18-pounders | a short secondary | | Their first attack: answer the red rockets. A short hold | 96 % | 100 % | 4.0 min |
| 3 | 9 | 1 / 1 | 1 | 18-pounders | main, 1 in 2 | | Hit back: our rangers find their batteries by their rounds | 90 % | 100 % | 5.6 min |
| 4 | 11 | 2 / 1 | 1 | + 60-pounders, 6-inch | main, 1 in 2 | | Heavy targets for heavy guns; kill their eyes | 85 % | 100 % | 9.4 min |
| 5 | 13 | 2 / 2 | 2 | + 9.2-inch | main, 1 in 2 | | X-Zeit, our own attack, as the finale; one modifier | 72 % | 72 % | 15.8 min |
| 6 | 15 | 2 / 2 | 2 | as 5 | main, 1 in 2 | | Concrete that needs a super-heavy | 65 % | 56 % | 16.4 min |
| 7 | 16 | 2 / 2 | 2 | + 15-inch | main, 1 in 2 | 1 | Two-step objectives: find the battery by its rounds, then its dump | 55 % | 67 % | 18.6 min |
| 8 | 18 | 2 / 2 | 3 | + 18-inch railway | main, always (long) | 1 | Two modifiers; long holds under fire | 45 % | 43 % | 18.4 min |
| 9 | 19 | 3 / 3 | 3 | all | main, always (long) | 1 | They shift after firing | 35 % | 49 % | 20.2 min |
| 10 | 20 | 3 / 3 | 3 | all | main, always (long) | 1 | Everything at once | 25 % | 51 % | 21.5 min |

(Levels 3, 7, 9 and 10 as measured after the tree's cuts, 2026-11-26: with Bertha in the Gamma's place 7, 9 and 10
run above their aims, left for the user's call; Balance, below.)

The tests are all-auto crews (taking cover by their own rule since this rework), a proxy for a human, aimed a little
below the human rates; the length is measured as a human plays it (`tools/leveltest.mjs` `human`: the time to the
mains done, plus X-Zeit's run when it is dealt; a human ends at once, the all-auto end waits `QUIET_END`).

- **The fields** (threat.js, new on 2026-11-26): `minutes` (the target length, the level card's Length fact and the
  attacks' schedule, below), `fresh` (one short line, what is new at the level: the card's "New ..."; `sub`, `lines`
  and `fits` rewritten to match), `quick` (levels 1 to 3: a main only where the lineup's estimated work,
  capability.js `batteryVerdict` time, is at most that many seconds, so a new player's first battles are short),
  `hold: { need, r, g, k, main, side, at }` (Holds, under Missions) and `trace` (the two-step mains, from level 7).
- **The difficulty.** `sim.level` is the THREAT row; `sim.difficulty` is Normal's for the player's own side (err, ammo
  before the modifiers) and the level's for the enemy's: `cb`, `dmg`, `assault`, `sig` (times 1.5 under the modifier
  `sound`), `zero`, and `time` from the level's `deadline`. `difficultyName` is 'Normal'. `sim.modifiers` is a Set of
  MODIFIERS ids; `sim.supplyK` the ammunition columns' pace (shells 0.6, rain 0.6; guns.js resupply).
- **The mission** (2026-11-12, "Missions" below): every battle at a level is one generated mission (`src/operation.js`
  `generateOperation(level, seed, batteries)`, tracked by `src/sim/objectives.js`), dealt by `DirectorWW1.reset` from
  `sim.opSeed` (the menu's seed, `?seed=`, so the level card, the loading screen and the battle agree; the game's seed
  without one) and the lineup's batteries (`this.bats`). `sim.operation`, `sim.objectives`, `sim.objectivePay`.
- **The day** (`levelScript`): only the attacks (`op.attacks`: the level's count, spread over the level's length
  `minutes` since 2026-11-26: the first no sooner than its men's massing allows, max(240 s, 0.30 of the length) plus up
  to 0.05 of it, the rest evenly to 0.78 of the length with gaps of 220 s at least and a tenth of a gap's jitter either
  way; before, 480 to 620 s then 230 to 340 s apart whatever the level; the gaps still squeezed so the last goes over
  by 1780 s (`LAST_ATTACK`: the day's clock waits at 1849 s, and an
  attack due later massed and never went over), each in a rolled sector; marked `attack`; with `tanks`, `tanksMoving` four minutes before) and the
  traffic (`TRAFFIC`: convoys and trains, marked `order`). The objectives' fire missions are not on the clock
  (`objectiveMissions`, per step from `missionsUpdate`). The day's clock runs on through a lull to the next thing
  (`pace`) and waits at 1849 s, short of X-Zeit, until it is called.
- **The beat and the early start** (the user's request of 2026-11-12: "so the user feels they accomplished something,
  and that the next is starting early"). A mission done holds everything new for `BEAT` (3 s, `director.beatAt`): the
  objectives' missions, the lineup's queue and its work (`sim/lineup.js`), a duel, a column; not an attack's
  counter-preparation or a call on a British battery firing. Every open objective has its mission at once (since
  2026-11-26; before, `objAt` and `SPACING` opened them one at a time). With nothing in hand `LULL_LV` (3.5 s)
  the day runs on (`pace`): each leg at an even rate, the first there in `LAPSE_LV` (1.25 s), each further one in
  0.25 s (the WW2 rule, worked out again each step from what is left, slows as it nears and took about 20 s); after a
  mission done the radio says "Ahead of time" and `events.ahead` puts it on the HUD (`hud.hint`); after one failed,
  only the hours passing. If the clock brings nothing to do, the lineup gives an idle battery a site `IDLE_LEVEL`
  (5 s) after the last mission ended (`lullAt`), not while the clock runs. So the next thing comes about 5 s after
  the last mission done. Sim seconds: time compression shortens it.
- **Ending on the mission** (the user's rules: 2026-11-10 a level ends on its missions, never on the clock; 2026-11-12
  the player calls the end; `levelUpdate`). More than `fails` of the main objectives' fire missions failed lose ("Too
  many of the main objectives' fire missions failed"); a main whose target stands with no battery left able to serve
  it (in reach, heavy enough, shells at the guns or coming: the Gamma's sixteen) loses ("Nothing left in reach"). Every
  main target done: `accomplish()` (`lv.closing`), their counter-battery fire grows (`sim.difficulty.cb` from `lv.cb0`,
  `PRESSURE` 20% a minute to ×3), and the player calls `callFinale()` (main: K, the HUD's button; `lv.calledAt` keeps the sim time, for the tests'
  human-length proxy): without X-Zeit the
  battle is won at once ("Mission accomplished", `summary()`); with it the attacks and orders still to come are called
  off, the day runs on to 1850 and `zeroHour` runs, `zeroEnd` deciding the battle with `zero` of our men in. A lineup
  all on auto (no gunner) calls it `QUIET_END` (120 s) after the last objective moved (`ob.lastProgress`) with no
  attack under way. A main our fire cannot move is handed on to the neighbouring Gruppe (the safety net, under
  Missions). Two sectors lost or every gun lost end any battle at once, as always; `levelEnd` settles the
  objectives (`settle`: X-Zeit, the medals) and sets `sim.over`. `goal()` is the HUD's objectives (main
  `hud.setObjectives`, `#objectives` under the unit's name).
- **The sites** (`offers`): only the level's `sites` (capability.js `tierOf`: soft, armour, heavy, deep, hard, fort; the
  role sites by their role, specialists.js `allow`). A site no battery of the lineup can finish (`siteVerdict` 'no') goes to
  the neighbouring Gruppe: a radio line once, no mission, no pay, no penalty (the traffic is never handed on).
  `heavies` off: only the British 18-pounders fire harassing fire and the Trommelfeuer (and counter-battery with the
  old fire; the ranging model's kinds follow `RANGING.from`, which agrees); `spotters` off:
  no RE8; `raids` the Camel raids' rate in place of `cb` (`EnemyWW2.raidRate`, 0 none, twice under `air`).
- **Fairer targets on a level.** A tank laager's guns are laid on one tank at a time (`m.aimPart`; the observer reads
  against it, `ObserversWW1.refPoint`; the next tank when it is out), and it is broken up, done, with half its tanks out;
  a British battery is silenced with half its guns out. Such a site is `spent`: no new mission on it (its last guns
  still fire, and every 200 s `watchBatteries` used to open a Gegenbatterie on it that was done at once, unfired:
  about fourteen free missions a game on level 3), and the lineup's work only gives sites the level offers
  (`canOffer`, the pure half of `offers`; it used to pick ones the level refused and idle the battery 80 s more). The crews adjust their fire for effect (`CrewsWW1.await`,
  `firing`): the observer's "on target" allows 45 m each way, which a 10 cm shell does not forgive.
- **Reading the fall on a level** (2026-11-26, the stall fixes; only with `sim.level`, so every other test is
  bit-identical). The observers (`sim/observers.js`): an airburst (`onBurst(shell, pos, air)`, `air` passed by
  `sim.burst`) is read by `fallPoint`, where its path would have come down at the height it was laid for
  (`shell.aimY`, gravity only), not where it burst (a shrapnel round left in the breech from a Sperrfeuer, fired as a
  Gegenbatterie's ranging round, burst over the target at its time and read "on target" with the gun 330 m over); a
  round of a unit on its own observed mission is that mission's when its aim is within 400 m of the mission's point
  or of the unit's present aim (`near`), so a big correction no longer loses the observer (a gun whose error wanted
  it laid 420 m short got "not observed" for the rest of the battle). The crews (`ww1/crews.js`): `pick` and the
  counter-preparation set `ai.seen` to the mission's reports already there (old reports are not news); `await` skips
  a report on a round fired before the one it waits for (`r.fired < ai.fireT`), reads each report's correction less
  what has been laid since its round left (`since(u, r)`, the aim's move on add and right) and judges "ok" on that
  remainder, and after 5 ranging rounds corrects and fires for effect; the mean correction between series uses
  `since` too; `effectUpdate`: a series whose last round is down without the target's strength (its standing parts'
  hp) falling puts the mission back to 'ranging' (the series count kept, so three still end it); `handOver` sets
  `ai.fireT` to the player's round still in the air.
- **The Feuerwalze on a level** (the friendly fire every lineup beyond a lone K 17 died of): fired by the field guns and
  howitzers only (`FEUERWALZE`: K 17, sFH 13, leFH 18, sFH 18; any but the super-heavies when the lineup has none), with
  HE, each gun laid `walzeMargin` beyond the line (two and a half spreads and its lethal radius less 40 m) and spread
  across the lane by its place in the mission, not its unit number; a crew lifting late stops firing until it lifts.
  Our assault keeps pace with the lifts (2.6 m/s), every British battery not silenced (half its guns standing) fires on
  it at the level's `cb` rate, and the garrison is kept down by `cover` bursts on each lane in 20 s (6 without a level).
- **Strongpoints** (levels 6 to 10 when the mission has X-Zeit, `forts` of them: 2, 2, 3, 3, 4; a secondary objective): `ww1/ops.js` `RIDGE_FORTS` K1 to K4, target kind
  `bunker` (the WW2 bunker's model and layout, three shelters) with the site fields `role: 'fort'`, `minHard`
  (`FORT_HARD` 70: a shell whose `SHELLS[kind].hard.D` is lower does nothing to it, `sim/targets.js` `applyBurst`, so the
  28 cm guns and up), `partHp` 50 (the bunker's 100) and `lane` (B or C). K1 and K2 stand one in each X-Zeit lane, K3
  and K4 behind them; the director removes those past the mission's `forts` (and all of them without X-Zeit) from
  `sim.targets` at `reset`. Their missions are `sim/specialists.js` role 'fort': by day and by night (a map shoot), no
  deadline, opened after the registration, as many at once as there are batteries that can take one (`canTake`: in
  reach and heavy enough, Bertha's and the Gamma's beds relaid first, `CrewsWW1.pick`; since 2026-11-26 Bertha reaches
  every strongpoint, its lowest elevation 13 degrees, 20 before, its minimum range 3.75 km, 5.3 before, and the
  career's Gustav stands 900 m further east than on the WW2 map, `RIDGE_WW2` P(14400, 600), so they lie past its
  10.2 km minimum); the auto crews put them first
  (`score` +30). Each strongpoint still standing fires on our groups in its lane during the assault, `FORT_MG` 0.008
  men a second a group, whatever the Feuerwalze's cover (`ww1/infantry.js`; `sim.stats.lossBy.fort`).
- **Modifiers:** mist (the observers' reports 1.7 times as slow), air (twice the raids and the RE8 spotters; a map shoot
  without reports where the Flieger would have observed, the balloon for the role missions), shells (0.4 of the stock
  at the guns, half the resupply), sound (signature 1.5 times), intel (a site's mission point 90 to 250 m off until an
  observer puts a round on it, `t.intelErr`; nothing known at the start), rain (the drill 1.15 times as slow in the
  mud, `sim.drillK`, half the resupply). The page sets the weather (`MODIFIERS[].weather`).
- **Capability** (`capability.js`, Node-safe): `batteryVerdict` / `siteVerdict` from reach (`autoCharge`), the shell's
  damage on each part (`partLayout`) under the gun's spread at that range (the upgrades' `disp`, `dmg`), the rounds to do
  what the mission needs and the minutes for the guns and drill (`load`), against the deadline and the shells carried:
  'ready', 'slow' or 'no' ('no' at once when the shell is lighter than the site's `minHard`, or `MIN_HARD` for a 'hard'
  role site, the crews' rule, and since 2026-11-26 when the site is outside the arc the gun lays on from its pit,
  `inArc`: its unit's zero and `arc` or GUNS `traverse`, as sim/guns.js checks a piece; no arc for a battery that turns
  onto any line: the beds relaid, the Karl, a self-propelled hull; a rocket launcher's cycle counted per ripple of
  `salvo.n` rockets, here and in `firepower`). `capabilities(levels)` per kind of site, `firepower(levels)` the field guns' weight,
  `recommendedLevel(levels)` the highest level whose sites are all at least 'slow' and whose firepower bar is matched
  (each level's bar the lowest reference firepower of it and the levels above: from level 6 a super-heavy takes a field
  battery's slot). `REFERENCE` is each level's reference lineup (at most five batteries and one off-map, `SLOTS`).
- **Balance** (`node tools/leveltest.mjs [seeds] [--levels] [--lineup ref|below] [--mods roll] [--cb ranging|old] [--jobs]
  [--games]`, all auto, each level's reference lineup, the ranging counter-battery by default; it prints the mission's
  mains and secondaries done, the failures, how each game ended, the `human` length proxy's mean and median beside the
  level's `minutes`, when the mains were done (mean and median), the holds and two-step mains done, the mains the
  safety net handed on (`safety net N`); `--games` adds each game's holds, traces, proxy and handed-on mains). It stages
  every career battery's pads (`RIDGE_WW2` and `RIDGE_MORE`) before the ground is sampled (`terrainHeight.js` reads
  them once: with only the lineup's, a seed's result depended on the games run before it in that worker, level 10
  seed 1 46.8 min alone and 43.8 after another game); `tools/cbtest.mjs` stages them the same way. With the difficulty rework (2026-11-26, the shape above, the ranging model and
  the crews' own cover; 72 seeds): 100, 100, 100, 100, 72, 56, 56, 43, 36, 28 % won for levels 1 to 10, the human proxy's median 5.6, 4.2, 7.3, 9.4, 15.8, 16.4, 18.3, 18.4, 20.9, 20.9 min (the X-Zeit levels' medians include its flat 10 minutes after the call; level 6 sits under its aim of 65 %: `zero` acts on whole men, and from .66 to .70 it stays at 56 %).
  After the ramp guns' cut (2026-11-26, levels 1 to 3 on the new references and level 1's hold; 72 seeds): 100, 100,
  100 % won, the human proxy's median 3.0, 4.0, 5.7 min (mean 3.3, 6.5, 6.2) against the targets 4, 7 and 9, the
  level 1 hold done in 72, level 2's in 71; with the richer references first tried (level 2 three guns each, level 3
  four each and a K 17) 3.0, 4.5, 6.2 (mean 3.3, 8.2, 6.5). Levels 4 to 10 unchanged.
  After the tree's cuts (2026-11-26: Bertha in the Gamma's place in levels 7, 9 and 10, the Gotha in the V-1's in 8,
  the arc and ripple fixes, the K 16's reach, the career's Gustav moved; 72 seeds, all auto): 100, 100, 100, 100, 72,
  57, 67, 40, 49, 51 % won (aims about 98, 96, 90, 85, 72, 65, 55, 45, 35, 25), the human proxy's median 3.0, 4.0, 5.6,
  9.4, 15.8, 16.3, 18.6, 18.5, 20.2, 21.5 min, mean 3.3, 6.5, 6.0, 10.6, 14.9, 16.1, 17.5, 16.7, 19.7, 21.6 (targets 4,
  7, 9, 11, 13, 15, 16, 18, 19, 20). Levels 1, 2, 4, 5, 6 and 8 as before to the game (the auto crews never call the
  off-map weapons, so the Gotha for the V-1 changes nothing there); 7, 9 and 10 easier with Bertha (2.5 min a soft
  target to the Gamma's 5.0, 24 shells to 16, and every strongpoint in reach): 7 from 56 to 67 %, 9 from 38 to 49 %, 10
  from 25 to 51 %, left so for the user's call rather than retuned.
  Before it, with the missions' phase 2 (the objectives of the moment, the balloon, the hunt; 2026-11-12, 72 seeds) 97,
  97, 92, 96, 79, 74, 56, 42, 35, 26 % won, the mean battle 13.1, 13.0, 22.7, 25.7, 32.9, 32.4, 33.8, 33.7, 31.7, 31.1
  min. With phase 1 (72 seeds) 99, 97, 93, 92, 82, 61, 57, 56, 36, 26 % won for levels 1 to 10,
  the mean battle 12.3, 12.8, 17.0, 22.3, 25.5, 29.1, 29.2, 26.0, 25.0, 25.3 min (the mains done at 9 to 17 min); with
  `--mods roll` (36 seeds, how levels 5 to 10 are played) 100, 94, 94, 83, 39, 22, 28, 11, 14, 8 (before, on `need`:
  100, 97, 86, 81, 33, 19, 6, 14, 3, 3). Levels 4 and 5 without modifiers are easier for the auto crews than before
  (74 and 61 % then); the tuning against a scripted player is the missions' phase 4. Before the missions, ending on
  the orders (2026-11-10, 72 seeds, `need` 1, 2, 4, 6, 7, 8, 8, 9, 9, 10): 96, 94, 90, 74, 61, 56, 38, 33, 18, 8 %,
  the mean battle 6.9, 12.9, 23.3, 21.6, 30.8, 29.9, 31.3, 29.1, 29.5, 24.9 min. Before that: 92, 89, 92, 71, 60, 53,
  36, 31, 19, 10 % (2026-11-02, with the strongpoints and the new tree's references: level 3 the C/92 and an FK 16
  battery, 8 to 10 each with a super-heavy; `zero` re-tuned for 6 to 10). Before the strongpoints: 97, 97, 86, 71, 60,
  51, 35, 28, 19, 11.

### Missions (`src/operation.js`, `src/sim/objectives.js`)

Each battle at a threat level is one generated mission, Helldivers 2's way. The rules come from a game-design research
pass (2026-11-12: Helldivers 2, Deep Rock Galactic, Into the Breach, XCOM 2, Kate Compton's "10,000 bowls of
oatmeal", Sid Meier's interesting decisions) and the user's decisions:

- **A shape, not a random mix.** `ARCHETYPES`: Gegenbatterie (named British batteries), Nachschub (dumps, depots),
  Tankabwehr (laagers), Führung (the HQs, concrete shelters), each with its main kinds and secondary kinds; one whose
  mains the lineup is ready for is rolled. The mission's name is a codeword (`NAMES`, "Unternehmen Lerche").
- **Objectives are named targets** (`OBJECTIVES`: battery, dump, hq, laager, deep, concrete; secondaries also traffic,
  tanks (a laager before its attack, `before` on the day's clock), forts (with X-Zeit); main xzeit). Each says what it
  does to the battle (`why`) and most do it (`effect`): a dump or depot gone slows their counter-battery fire (the
  dumps' own rule, `EnemyWW1.supply`), the HQ, the corps HQ or a shelter gone thins every attack after it (`THIN` 0.85
  each, 0.6 at least, `levelAssault`), a laager broken up keeps its tanks out (`TANK_K`), a battery silenced stops
  firing, a train or convoy wrecked holds their supply up (`TRAFFIC_CUT`: ×0.85 for 300 s). **Every target counts**
  (since 2026-11-26; before, only `o.targets[0]` was judged, so "Silence the 18-pounders on the Frezenberg road and on
  the Zouave Wood" was done with the first, and the battery that fired on the second fired for nothing):
  `Objectives.left(o)` the targets still to be done, `out(o, id)` one out by the level's rules (destroyed; a battery
  silenced, a laager broken up), `o.gone` those done (each stays done, a battery a new one moves into too), `o.done`
  their count, a radio line ("Objective: ... done, 1 of 2") and `events.objective(o, 'step')` for each, complete when
  all are; `ofTarget` skips the done ones.
- **How many** (`threat.js`, the level table above): `mains` 1, 1, 1, 2, 2, 2, 2, 2, 3, 3 (before 2026-11-26: 1, 1, 2,
  2, 2, 2, 3, 3, 3, 3); a plain main's targets fill `work` (in fire missions, each target weighed `w`, up to three of a
  kind: "Blow up both ammunition dumps"); `later` (from level 4) of the plain mains reported during the battle near
  the first attack, so the work runs into the attacks (a hold and a two-step main are on from the start, so level 8,
  whose two mains are those, reports none); `sides` 1, 1, 1, 1, 2, 2, 2, 2, 3, 3 (level 1's, a short hold, since the
  ramp guns' cut; before the rework: 1, 2, 2, 3, 3, 3, 3, 4, 4, 4), two known before battle, the rest reported from 260 s on (`reveal`, state 'hidden' until then, and all at once
  when the mains are done); X-Zeit as the finale with chance `xzeit` (0.5 at level 5 to 0.8 at 10). The dealing:
  the two-step mains first (`trace`), then the hold if `hold.main` rolls (always from level 8), then plain mains from
  the archetype's kinds; levels 1 and 2 deal a short hold as their one secondary, first in `sides` (level 1's at
  Hellfire Corner, `hold.at`: the places a level names, any the lineup reaches without; 5.3 km from the FK 16's pits,
  so the starting field guns have a job of their own beside the main, since 2026-11-26).
- **Only what the lineup can do** (`capability.js siteVerdict` on the lineup's batteries, with the level's deadline):
  a main only where the lineup is 'ready', a secondary where it is not 'no'; on levels 1 to 3 a main also only where
  some battery of the lineup does the work within the level's `quick` seconds (`batteryVerdict` time). The verdict
  counts a ramp gun's re-lay error (`GUNS.runback`, the C/92's: a lone C/92 was dealt the brigade HQ and failed it four
  times; dormant since the ramp guns' cut, 2026-11-26).
- **Mains never fail on a clock.** Every open objective has its fire missions at once (since 2026-11-26: one for each
  target still to be done, `objectiveMission` taking the first without one and `unreachable` checking each; a
  secondary when it is reported, a two-step main's first when its battery is located, a hold's `k` missions together; the
  staggering went, `MAIN_LIVE` two mains at a time, one opening every 40 s `SPACING` and the secondaries after the
  first 90 s, which made a level's length the sum of its parts); none within the `BEAT` of a mission done; a mission
  whose window closes comes again after `REOPEN` (45 s) and, a main's, counts against `fails` (threat.js, 6 at level 1
  to 3 at level 10). The objectives list says when an open objective's mission is not out yet (`objectiveWaits`, the
  rule played forward: the beat, a reopening, or 'traffic'; `goal()` items' `wait`, the HUD's note "mission in 0:40",
  "waits for traffic"; 'queued' no longer comes), so no objective reads as an order with nothing to take (the user,
  2026-11-26). A battery objective's mission has an observer who reports (an
  aeroplane or the balloon by day, the VB by night), never the sound rangers' blind fix; by night the other objectives'
  missions (not the role ones) have the VB ('foo') too, in place of a map shoot (since 2026-11-26: an HQ by night got 13
  minutes of blind rounds 80 m off), the laagers and the posts keeping `siteMission`'s own VB; by day nothing changed. Deep and concrete ones as the
  specialists' (`role`, `minHard`) with a 900 s window (`ROLE_WINDOW`). Marked `m.obj`, `m.objMain`, priority +5 for a
  main and +2 for a secondary (`tag`), so the crews put them before the routine counter-battery calls; on a mission the
  crews keep a long gun or a heavy on a main's shoot when the red flares go up and another battery can answer
  (`CrewsWW1.sosCalled`).
- **Holds** (2026-11-26; `OBJECTIVES.hold`, the level's `hold: { need, r, g, k, main, side, at }`): "Keep <a place> under
  fire for m:ss". The clock (`o.held`) runs while our bursts land within `r` m of the place at least every `g` s and
  pauses otherwise; never failed by the clock; done at `need` s. Every burst of ours counts, whatever battery fired it,
  so batteries may rotate (`ww1/director.js` `holdUpdate`: our shells that burst last step, still in `sim.shells`, set
  `o.lastHit`; `o.running`). Holding forces sustained fire, so the British range in and the player must rotate
  batteries or take cover: the counter-battery tension's objective, and a floor on the length a maxed lineup cannot
  shorten. Dealt: levels 1 and 2 a short secondary (level 1's 60 s at Hellfire Corner, `at: ['X1']`, since the ramp
  guns' cut: the starting FK 16's job), levels 3 to 7 a main in one mission in two (`main` 0.5, rolled from the
  mission's seed), levels 8 to 10 a long main every time. The places (`operation.js` `HOLD_PLACES`): Hellfire Corner
  (X1) and the railhead (R1), `effect` 'traffic' (done: `trafficCut` for `HOLD_CUT` 600 s), and the assembly area
  behind each sector, 350 m behind the British support line, `effect` 'attacks' (the attacks to come thinner); a
  place is dealt only where a battery is within 0.72 of its longest range and `batteryVerdict` on a soft site there is
  'ready' (at the edge of its range the rounds fall too wide to keep a clock running). Its fire missions: kind
  'destroy', `m.hold`, `k` at once titled "(A)", "(B)" so more than one battery can serve it, an observer who
  reports ('foo': a map shoot cannot correct the guns' bias, the bursts fell 400 m off), no clock; done, they are
  finished together. The crews' `ai.skip` is cleared every step for a hold's and a main's missions (a crew that gave
  a main up took it again only after its window failed). Objective data: `{ kind: 'hold', targets: [], n: 1, hold: {
  id, name, short, x, z, need, r, g, k, effect, done }, held, lastHit, running }`; `goal()` items' `hold: { held, need,
  running, started, r, g }`.
- **Two-step objectives** (levels 7 to 10, `trace`; `OBJECTIVES.trace`): a main of two steps. Step 1, a British
  battery not yet located ("Find and silence the ..., then burn its ammunition dump"): its fire mission is offered
  (`ready`, `ww1/director.js` `traceUpdate`) once our rangers' fix on it is within `RANGING.rangers.place`, laid on the
  fix (`rangersMission`; a rangers' mission already open on it becomes the objective's), or `TRACE.loose` (300 s)
  after the objective opened on the fix as it stands, so it never waits for ever; without the ranging model, at once.
  So that it can be found, the battery must engage us early: `DirectorWW1.reset` sets `t.mustEngage` on it and the
  British fire honours the flag ("Ranging counter-battery"). Step 2: the battery silenced (dead or `spent`),
  `Objectives.advance` reports its ammunition dump (`then`; targets `[then]`, `done` 1, title and short changed, a
  radio line, `events.objective(o, 'step')`); the dump gone, done. Never the hunted railway gun; both the battery and
  the dump 'ready' for the lineup. Objective data: `{ kind: 'trace', targets: [battery], then: dump, n: 2, effect:
  'supply', step, ready, openAt, fix }`; `ofTarget` and `openTargets()` skip it while `ready` is false; `goal()`
  items' `step` and `locate` (the fix's error in m while not located).
- **The safety net** (2026-11-26; `ww1/director.js` `STALL = { rounds: 40, s: 600, idle: 1200, per: 2, nk: 'm16' }`,
  `stallUpdate`, `handOn`, `neighbourFire`, `nbrUpdate`). A level ends on its objectives, never on the clock, so a main
  our fire does not move must not hold the battle for ever (before the stall fixes 7 battles in 720 never ended). Each
  open main (not X-Zeit, not a two-step main still unlocated, until the mains are accomplished) has its effect watched
  (`o.stall`: the standing parts' hp of its targets still to be done, the hold's clock, the step, the targets done).
  With no effect, `rounds` (40) rounds on its missions and `s` (600 s) hand it on, for any lineup, a human's too (the
  player who keeps firing at a target and cannot touch it is helped, one who has not fired at it is not); a lineup
  all on auto also hands on its most stuck main after `idle` (1200 s) with no main moving at all. Handing on: the
  radio's "Nachbargruppe: our fire has had no effect on "<title>" (40 rounds in 11 minutes); the neighbouring
  Gruppe's heavies take it on. It counts as done, paid only for what our guns did.", its missions withdrawn
  (`m.withdrawn`, no one's failure), its targets in `director.handedOff` (`offers()` refuses them), a British battery's
  fire silenced, `per` 21 cm rounds a standing part falling on it over half a minute (`unitId` null, `neighbour`: no
  pay, no report), what they leave standing knocked out after the last (`nbrUpdate`); the objective completes
  (`o.handed`, its done line "the neighbouring Gruppe took it on"), and `complete` pays it only for the share of its
  targets our guns had done (a hold or a two-step main nothing). Forced in tests (our damage to the mains' targets
  blocked, a hold's radius 1 mm) every battle ended: level 2 seed 35 handed on at 15.6 min, level 4 seed 3 a hold at
  10.0 and the HQ at 16.1, level 8 seed 5 a two-step main at 12.7.
- **Attacks are pressure, never an objective**: the enemy's timetable must not decide when the player is done.
- **The player calls the end** (above). Medals (`MEDALS`, the end card, not objectives: failed early, they would nag):
  no gun lost, not one of theirs in our trenches.
- **Pay** (`OBJECTIVE_PAY` ×the level's pay, `sim.objectivePay`, research.js `battleReward` `objectives`): a main 100,
  a secondary 40, the full clear 80, a medal 25 (Helldivers 2's main to secondary ratio); the victory pays
  `WIN_MISSION` 250 instead of 400. Paid at the end (or on leaving) with the time in action.
- **What the player sees**: the menu's level card (the mission's shape, its mains and known secondaries, the rest "to
  be reported"), the loading screen's briefing (`ui/loading.js`), the HUD's panel (`hud.setObjectives`: squares the
  mains, diamonds the secondaries, progress, the failures, then "Mission accomplished", their fire's growth, the
  all-auto countdown and the finale's button), toasts and radio lines on each objective done, failed or reported, the
  reward feed's OBJECTIVE lines, the board's ochre rings on the objectives' targets (`board.js drawTargets`), the
  missions list's ■ and ◇ (`missionList.js`), and the summary's Mission section (`ui/summary.js`). A hold's row reads
  "1:10 of 2:00" (" · paused", or " · fire on it" before the first burst; class `holding`, its note green, or
  `paused`, amber and italic, with the reason on hover) and the board draws its radius as a dashed ochre ring with
  its clock as an arc round it (solid while it runs, faint while paused; labelled "■ Hold" or "◇ Hold"); a two-step
  main's row reads "finding it · ±N m", then "step 1 of 2" and "step 2 of 2".
- **Objectives of the moment** (phase 2, 2026-11-12; `Objectives.add`, `bonus`: a secondary that pays but has no part
  in the full clear, a △ on the HUD with its timer). One at a time besides the attacks, never during an attack or its
  massing (the research's middle of a battle: an attack with its counter-preparation, a pop-up target, a duel):
  - *The duel* (`duelUpdate`, `DUEL`, from a counter-battery rate of 0.5, level 3): a British battery firing on one of
    ours with its fix firm enough to tell (`f.lock` 0.45, about 200 m off) is to be silenced within 300 s. Its fix is
    our battery's loudness (`ww1/enemy.js`: the lock follows the signature), so falling quiet is the other answer; the
    HUD shows how far off their rounds fall (`fixOf`), red under 120 m. 300 s between duels; never the hunted gun.
  - *Counter-preparation* (`massing`, `prepUpdate`, `callOff`, `goOver`): every attack's men mass in their front line
    `MASS_T` (180 s) before they go over (`as.massing`, `rocketsAt` and each group's `go` held), with a fire mission
    on the trench (`m.prep`); a quarter of them down (`PREP_BREAK`) calls the attack off (its groups go back, held, no
    Sperrfeuer), else they go over with what is left (the laager's tanks as a fresh group, the Trommelfeuer, the red
    flares). One battery's work done well: the auto crews' field battery best placed turns to it (`CrewsWW1.prepCalled`).
  - *Targets of opportunity* (`popUpdate`, `popColumn`, `columnsMove`, `POP`): by day every few minutes a relief
    column halts on a road behind their line (the painted roads, `trenchlines.js tracks`, x -2600 to 1900), British
    infantry in file in the open (state 'halt', then 'march'; an `attacker` group outside any assault, so its men pay
    and never count as ours), for 180 s; a third of it down and it scatters. Shrapnel for the guns that have it.
- **The kite balloon** (`balloon`, a planned secondary from level 3 to a lineup that reaches its winch): `ops.js
  RIDGE_BALLOON` L1 over Ypres at 500 m (`r` 220 takes in its winch, 250 m downwind), removed from every battle that
  does not deal it; while it is up (`haulK` under 0.5) their lock on our loudest battery is as if it were 1.3 times
  louder (`ww1/enemy.js BALLOON_K`). Its mission is laid on the winch lorry on the ground (HE, the observer reading
  the bursts against it, `ObserversWW1.refPoint`): our shells within 160 m of the winch or under the balloon have its
  crew haul it down (`ww1/targets.js HAUL`: kept down 150 s after the last, reeled in over 80 s and out over 140 s,
  drawn lowered with its cable shortened, the HUD's "hauled down"), and the winch wrecked brings it down for good
  (`checkDead`). A shrapnel burst near the envelope still burns it (the base's balloon rule now covers `bballoon`).
  (It was first laid on the balloon itself with shrapnel: two C/92s firing at nothing else brought it down in 5
  battles of 12, 55 rounds each, the median burst 102 m off; on the winch, in 12 of 12, about 23 rounds, 2026-11-12.)
- **The railway-gun hunt** (`railgun`, a secondary from level 5 that pays double, `value` 2; counter-battery and supply
  missions; `huntUpdate`, `HUNT`): the British 18-inch railway howitzer (G5) comes up to its firing point after 2.5
  to 4.5 min, fires up to three rounds (its own cadence) or stays 240 s, then withdraws out of sight (`present`
  false: not drawn, not hit) for 4 to 6 min; each round firms the sound rangers' fix (320 m at first, ×0.62 a round,
  35 m at best), and the hunt's fire mission (`m.hunt`, observer 'sound', no clock) moves with the fix, the batteries on
  it on auto re-laid. 40% of its strength gone knocks it out (`spent`). The auto crews' long guns and heavies turn to
  it when it fires (`huntCalled`) and leave it when it withdraws. Tried as a main from level 7: the auto crews never
  caught it and it decided whole battles, so a secondary.
- **Still to come** (the plan's phases 3 and 4): neutralization, wire cutting, the box barrage, generated target
  positions, `tools/optest.mjs` and tuning against a scripted player.

## Ranging counter-battery (`src/ww1/enemy.js` `RANGING`)

The British counter-battery fire on the WW1 German open battle at a threat level: a British battery ranges in on one
of our batteries and then fires for effect, our rangers place the battery that does it from the rounds it fires, and
a crew can take cover. A prototype behind `?cb=ranging` from 2026-11-25; since 2026-11-26 the default on every level
battle, and the levels' danger: what climbs with the level is which British guns answer, how few ranging rounds they
need and how slowly we find them ("Threat levels", the level table). The knobs are one const, `RANGING`; its lists are
per level (`sim.level.n - 1`).

**The contract** (sim and console both build to it):

- **The model.** `sim.newGame({ cbModel })`: on the WW1 theatre's op kind 'battle' with a level, `sim.cbModel` is
  'ranging' unless `cbModel` is 'old' (any other value, or none, is the default); null anywhere else, so the British
  game, the WW2 mode and the WW1 battle without a level are bit-identical to before. main passes the page's raw
  `?cb=` (`CB_MODEL`, the career's level battles only): `?cb=old` gives the old fire (the drizzle on the loudest unit,
  with `watchBatteries`' Gegenbatterie calls), `?cb=ranging` still works; `menuItems.js` `PASS` carries `cb` to the
  menu and back.
- **Cover.** `sim.command(unitId, 'cover', { on })` (`on` omitted toggles; not in `TAKE_MANUAL`; true when it changed
  something; nothing without `sim.cbModel`). `unit.cover` (the crew in its shelters) and `unit.manAt` (after leaving,
  the sim time the crews are back at the guns; null again once they are). Both only ever set with the model.
  `guns.problem(u, short)`: 'in cover' / 'the crew is in cover: order them back to the guns (U)', then 'manning the
  guns' / 'the crews are running back to the guns'. Event `events.cover?.(unit, on)`.
- **The threat.** `sim.enemyAI.threatOn(unit)`: null, or the worst engagement on the unit the crew knows of,
  `{ stage: 'ranging' | 'closing' | 'bracketed' | 'ffe', miss, name, by, since }` (`miss` in m to the nearest 10, the
  last ranging round's; `name` as "British 6-inch battery"; `by` the target id; `since` the sim time of its first
  round). Worst: ffe, bracketed, closing, ranging, then the smallest miss. Event `events.cbStage?.(unit, stage, info)`
  when a unit's worst stage changes (`stage` null: no longer engaged). `unit.cbStage` holds the last one sent.
- **The danger the crew knows of.** `sim.enemyAI.dangerOn(u, ffeOnly)`: true while an engagement known to the crew
  (its rounds have fallen) has the unit bracketed or fires for effect on it, or its salvo is in the air (`ffeEnd`);
  `ffeOnly` the fire for effect alone. The crews' own cover reads it.
- **Our rangers.** Every British battery has `target.rangers = { err, x, z, placed }` from the start: the fix point,
  its error in m, and `placed` once a Gegenbatterie mission has been offered on it (also `ax`, `az`, `n`, `heard`:
  the fix's direction and the rounds counted, the sim's own).
- **A battery to be found.** `t.mustEngage` on a British battery target (the director sets it on a two-step main's
  battery, "Missions"): it engages first, past the level's count and its kind's level, at the latest `must` (60 to
  120 s, from the sim's stream) after the flag is seen (`mustUpdate`, `t.mustAt`) or after its last engagement ends;
  at `mustAt` its cooldown is waived and it takes a sure engagement on our busiest battery, even before the fire opens.

**The model** (`EnemyWW1.rangingUpdate`, in place of the loop over the batteries; harassing fire, the Trommelfeuer and
the aircraft as before):

- **Which guns answer.** `from`, a kind's first level (the 18-pounders from 1, the 60-pounders and the 6-inch from 4,
  the 9.2-inch from 5, the 15-inch from 7, the 18-inch railway gun from 8), replaces the `heavies` gate for the
  counter-battery fire; `heavies` (threat.js) still gates the harassing fire and the Trommelfeuer, and the sites
  (operation.js 'heavy' from level 4) still decide which British batteries can be objectives (they agree: no heavies
  on levels 1 to 3). Exceptions: a flagged battery, the hunted railway gun (on levels 4 to 7 too: a sure engagement
  whenever it is up), and the opening's fallback. `batteries` British batteries engage at once (the flagged and the
  hunted besides), at most `perUnit` of them on one of our units.
- **Their fire answers ours.** Nothing of theirs fires on our guns before one of ours has fired (`firstShotAt`): the
  opening comes `after` s past our first round at the soonest (35 to 60 on level 1, down to 15 to 30 on level 10; the
  same draw as `open`, placed in that range, so no draw more), and a flagged battery waits for it too (the user,
  2026-11-26: counter-battery fire before a first round broke the cause and effect it teaches).
- **The opening** (the sure engagement). At `open` s into the battle (from the sim's stream), and not before `after` s
  past our first round, a battery of a kind that answers takes on our busiest battery in its
  reach (the loudest of those that fired within `busy`, 90 s, the latest to fire among equals), loud or not (a lone
  gun on the lower levels is never loud enough for `engage`), and ranges on it while it fires. A battery no fire
  mission of ours is on is preferred (the opening should come through to its fire for effect); one under our fire
  waits. A battery whose shell flies longer
  than `fly` (20 s) fires that much sooner, so `open` is about the first fall. When no kind that answers reaches our
  busiest battery, the lightest that does takes it on (a Langer Max in the lineup is 10.3 km from the 18-pounders,
  whose reach is 8.5 km: the 60-pounders, 48 s of flight, open on it). One broken off before its first
  round is given again 10 s later; after its first fire for effect it is an ordinary engagement. Levels 2 and 3 give
  the next one `every` s after one ends. The fire no longer waits for phase 2.
- **Engagement** (the rest, by loudness). A battery free to fire (alive, in sight, not silenced, the level's rule too:
  half its guns out, `spent`; not suppressed, with ammunition, of a kind that answers) takes on the loudest of our
  units in its reach with a signature of `engage` (0.3, times their balloon's eyes) that fewer than `perUnit`
  batteries already have, while the level's `batteries` has room. One engagement a battery (`enemyAI.engs`, target id
  to engagement).
- **Ranging.** One gun, one round every `gap[kind] * gapK / ((0.6 + 0.4 * cb / cb0) * supply)` s (`gapK` the level's
  pace; `cb0` is `difficulty.cb` at the start, so the level's own `cb` no longer sets the pace and it grows only with
  `PRESSURE` after the mission is accomplished; times `spotGap` 0.7 with the RE8 over the unit), never sooner than
  `wait` (0.5) of the last one's flight (their corrections lag a round behind), at one live gun of ours, off by `miss`
  along a line within 35 degrees of their line of fire (overs or shorts for the whole engagement). The first miss is
  320 to 480 m by our loudness; `rounds` (in place of `corr`) is how many ranging rounds come before the bracket: the
  miss shrinks by `(bracket * 0.85 / firstMiss)^(1 / rounds)` a round (squared with the RE8 over the unit, about half
  the rounds; times 0.92 with their balloon up). The crew knows of an engagement from its first round's fall
  (`threatOn` null before), and the stages follow the falls, not the firing.
- **Bracket and fire for effect.** When the next miss would be within `bracket` (60 m) the round in the air is the
  last: at its fall the unit is bracketed, and `bracketWait` (0.6) of a gap later the battery fires `salvos` salvos
  `salvoGap` (10 s) apart, each by `share` of its live guns (one at least; level 1's is a scare, half an 18-pounder
  battery once, wide), `sigma` m of scatter round the gun.
- **Cut short.** A battery of ours gone silent under it (no round since the fire for effect began: its crew in cover,
  or holding) gets only the first salvo: they take it for knocked out (`cbStats.cut`, a radio line); the phase stays
  'ffe' until the salvo in the air has fallen. One that serves on through it takes every salvo.
- **The check round.** Then `rest` (70 s), and on a unit still (or again) as loud as `engage` one ranging round at
  1.25 times `bracket` (they have the range: it falls within the bracket), bracketed at its fall, then the fire for
  effect: the crew sees it coming. On a quieter one the bracket is kept. (Before 2026-11-26 the next fire for effect
  came at once, with no warning.)
- **Lost.** No ranging round on a unit under `located` (0.15); after `lose` s under it (75; 45 in cover) the
  engagement is dropped, never in the middle of a fire for effect.
- **Hit back.** Our bursts that suppress the battery (`TargetsWW1.applyBurst`) stop it, multiply its next miss by
  `spoil` (1.6) and end a fire for effect under way: it must range again. Silenced or destroyed ends it.
- **Our rangers** (discovery by level). Every round a British battery fires (counter-battery, harassing, Trommelfeuer:
  `EnemyWW1.launch`) tightens the fix: `rangers.err` m at first, times `rangers.k` for every round heard, `rangers.min`
  at best, all three larger on the higher levels (better camouflage: the fix forms slower and stops further off), in a
  direction that stays. A battery with one of ours under its fire and a fix within `place` (180 m) gets a
  Gegenbatterie mission (`DirectorWW1.rangersUpdate`, `m.rangers`: kind 'cb', laid on the fix and moved with it as the
  hunt's is, an observer who reports, by night named the flash rangers, no clock, 40 points, never an objective's
  failure; withdrawn without penalty when nobody took it and the battery has left us alone for two minutes).
  `watchBatteries` gives none with the model. Not the hunted railway gun, which keeps its own fix.
- **They shift** (levels 9 and 10, `shift` 2). After a fire for effect the battery moves to a position nearby (its
  target stays at its site, a game's shortcut: only the fix moves): our rangers' error doubles (up to their first) in a
  new direction, `t.cbErr` moves if it was placed, and every open mission on it (`m.rangers` or kind 'cb') is laid on
  the new fix, its auto batteries re-laid (`cbStats.shifts`; the radio: "Sound rangers: the ... has shifted after its
  salvos; fix now ±170 m, the mission laid on it").
- **Take cover.** No fire and no loading (a round half loaded waits, a gun laid stays laid), the signature fades at the
  hold rate (0.014 a second), a direct hit (under 5 m) on a gun does all its damage but a near miss only `COVER.gun`
  (0.5: no rounds or cordite out at the gun to go up with it; without it the guns died as fast in cover as out of it,
  nine lost on level 10 either way, so cover saved men only), the crew's casualties come at `COVER.cas` (0.15) of the
  usual chance (`guns.js` `COVER`), and leaving takes `COVER.run` (10 s) before the guns answer. An order to fire
  given while the crews run back (`unit.fireOnMan`) goes when they are at the guns, and a Sperrfeuer (`ww1/theatre.js`
  `sosCommand`) takes a battery out of cover: no cover in a barrage. `sim/crews.js` passes over a unit in cover or
  running back (its drill waits; the crew used to give its mission up when FIRE was refused).
- **The crews' own cover** (`ww1/crews.js` `CREW_COVER`, `coverUpdate`, run first in `CrewsWW1.update` with
  `sim.cbModel`): a crew on auto (not a battery the player serves a gun of, nor one at the player's orders: those are
  the player's, U) takes cover `react` (2 to 8 s) after `dangerOn`, a time in five (`late`) `lateBy` (10 to 30 s)
  later still, a time in twelve (`stay`) not at all for that episode; it leaves `after` (15 to 40 s) once the danger
  is over. On a Sperrfeuer or the Feuerwalze (its state 'sos' or 'barrage', or its Sperrfeuer reaction due) it stays
  at the guns while only bracketed, ducks for the fire for effect itself and is back `duty` (4 to 10 s) after the last
  salvo. Imperfect on purpose, as the rest of its drill. It serves the tests and the gunner's other batteries
  (`othersAuto`); `sim.crews.cover = false` turns it off (cbtest `--policy none` and `cover`).
- **Taking cover, drawn** (2026-11-26; `render/shelters.js`, `render/cover.js`). On a battle where the crews can take
  cover (`sim.cbModel`) each German gun has a shelter: a 1918 position's own dugout (`models/v/de/gun_sites_ww1.js`
  `dugoutOf1918`: the field pits and the 42 cm emplacement), a rocket launcher's slit trench (`rig.anchors.cover`), or an
  Unterstand of its own (`buildUnterstand`: the dugout's timbered and sandbagged mouth with its steps going down, a gas
  curtain rolled up under the lintel, a stovepipe, a duckboard to the door between two low sandbag walls). When the
  crew takes cover each man drops what he is doing and runs to it, the men a moment apart, and ducks through the
  doorway (in a slit trench he crouches, facing his gun); the gun stands unmanned. Sent back, they come up out of it and
  run back to their posts, the last one there by `manAt`, and the drill takes over where the gun stands (its job waits
  in the sim, so each man comes back to the place he left). The gun the player serves in person (`piece.manned`) keeps
  its crew.
  - *The clock.* `setCover` keeps the times the crew turned since it last stood at its guns: one new unit field,
    `u.coverLog` ([into cover, out, in again, ...]; a new array when the crew takes cover from its guns, a time pushed
    at each later turn; plain times, no random number, read by nothing in the sim). `render/cover.js` `wayClock` folds
    it into the seconds of the way done: rising a second a second while in cover, up to the crew's last man in; sent
    back, 0.6 s (up the steps) and then falling a second a second, never later than to be 0 at `manAt` (the men come
    straight out and are at their posts before the sim has the guns manned). Everything drawn is a pure function of the
    log, `manAt`, the time and the drill's places, so time compression and `fastForward` give the same men, and a crew
    sent back to cover halfway back turns where it is.
  - *Placement* (`render/shelters.js`, once a battle: main calls `shelters.reset(sim)` after the render layers' reset).
    A new Unterstand goes where the crew reaches it by the shortest walk from its posts round the position's scenery,
    measured: the scenery's triangles (the position's and the battery's works) rasterized in plan at 0.25 m through a
    man's height (0.15 to 1.6 m: he ducks under a net's skirt) and, for the dugout only, what lies low on the ground
    (0.04 to 0.15 m: walks, platforms, tracks); kept clear also of the gun swept through its whole traverse (a
    turntable: its whole circle; not what stays above 2.4 m, a long barrel overhead), the crew's posts swept with it, the
    ready rounds, the battery's other guns and the shelters placed before it. Doors on rings round the crew's middle from
    3 m out, behind the gun first, up to 120 degrees either side and never in front; its door faces the crew; ground that
    tilts it more than 1.2 m across is refused. Tried in turn: clear of everything and reached round the scenery; then
    allowed on the low things (a position paved all round); then, for a crew shut in its position (a turntable's pit),
    at the straight way's cost. It is a child of the position's root (it turns with a relaid bed and is culled with the
    position), or of the scene for a gun with no position (then in the sub-pixel cull itself). A self-propelled gun has
    one at each of its positions, the Karl one at each prepared stop, each placed with the rig standing there. With no
    room at all the men get down in the open behind their gun (no ridge kind comes to that now). Shelters are placed per
    kind as a battle fields it, so a kind cut from the tree simply never takes one.
  - *The way* (`render/cover.js`, once a turn of cover per crew): an A* over the same grid and the crew field's steel at
    the gun's traverse now (0.22 m clear; ends relaxed 0.6 m), string pulled: out through the pit's gate, round the
    trail. A man on a platform walks across it to its side edge on his own side of the gun and climbs down it (steps
    down off one under 1.3 m) first. Pace: a run of 3 m/s, a reaction of 0.1 to 0.7 s by the man's number, the doorway
    taken one man at a time 0.4 s apart (a later man jogs, down to 1.7 m/s, before he sets off later), ducking through
    it bent double in 0.85 s; a long way is fitted into 9.85 s by a quicker reaction, then runs and climbs at their
    quickest (3.4 and 1.8 m/s: never faster than the spacing shows a man moving, `crewspace.js` `V_MAX`), then a
    quicker duck. The pair who carry a shell between them go each his own way (the spacing does not hold them together
    while they take cover).
  - *Props.* A shell or a cartridge a man had in his arms is laid on the ground where he stood and comes up into his
    arms again as he comes back; the rammer's staff is laid down beside his post; the lanyard is let go. The gun's own
    rounds (on its tray, in a hoist, on a cart) stay.
  - *Cost.* Each position's scenery is rasterized once in its own frame and stamped into each nearby gun's grid;
    placing the shelters took 26 to 145 ms at a battle's start in the headless browser, five batteries a battle (42 ms
    for five 1918 batteries, which have their dugouts; 145 ms for five WW2 batteries of 14 guns that each get an
    Unterstand); the ways are searched once a turn of cover for each crew drawn; nothing is allocated per frame (the
    per-frame work is a matrix product and a few legs per man).
- **The duel** still reads the battery's `fire.focus` and `fire.lock`: the model sets them from the engagement
  (`fixOf(lock)` is its miss).
- **Radio**, a line per stage from the battery under fire (`cbSay`, not two within 4 s): ranging "about 400 m short"
  (to 50 m), closing in (under 200 m), bracketed and fire for effect as alerts, "has lost us", "its aim on us is
  spoiled" when our shells are on it, and "has stopped its salvos: they take us for knocked out" when it is cut short.
- **Back from cover** the fire broken off goes on where it stopped (`unit.coverResume`, the rounds each gun had
  left) if the order is still the same; a new order needs FIRE as usual.
- **Console** (lean, only with `sim.cbModel`). Each battery tab has a crosshair (amber ranging, red closing, pulsing
  bracketed, flashing fire for effect; `common.js` `threatTip` on hover), the ring shows D in cover and the tab's state
  IN COVER or MANNING n s. The DECKUNG key stands at the right of the fire order card's rounds row (`orderCard.js`;
  TO THE GUNS in cover, MANNING n s, red pulse when bracketed; its hover says the men are spared and near misses do
  the guns half the damage), key U (Unterstand) does the same. The status slip, after the Sperrfeuer call, a silenced
  battery and a toast: IN COVER, MANNING THE GUNS, or RANGED ON with the battery and its last miss (red when
  bracketed). main's `cbStage` handler gives a `hud.hint` on bracketed and fire for effect (one every 6 s, none for a
  battery in cover, no bracketed hint within 60 s of that battery's fire for effect), worded to send the player to the
  battery (its number key) and to U; in the first battles the coach says it instead while its cover step is open
  (`coach.speaksFor`, "First run").
- **Counts** (`enemyAI.cbStats`, the tests'): `engagements`, `ffes`, `lost`, `spoiled`, `shifts`, `cut`, `toFfe` and
  `toFfeClean` (from the first ranging round, `e.r0`, to the first fire for effect, with and without our shells on the
  battery), `firstRound`, `firstFall`, `firstFfe`.

**Tests.** Identity: `node tools/simtest.mjs 1 2 3 --both --quiet`, `node tools/ww1test.mjs 1 2 3 4 --quiet` and
`node tools/ww2test.mjs 1 2 --op all --quiet` give the same output as before (the timing column aside);
`tools/leveltest.mjs` and `tools/cbtest.mjs` run the ranging model by default (`--cb old` for the old fire), so their
older numbers are not comparable. `node tools/cbtest.mjs [--levels 1,3,5] [--seeds 12] [--jobs N] [--cb ranging|old]
[--policy auto|none|cover] [--lineup kind:guns,...] [--quiet x]`: each level's reference lineup (or `--lineup`, no
upgrades), every crew on auto; `--policy auto` (the default) the crews' own cover, `none` never, `cover` the
prototype's scripted rule with the crews' own off (cover when bracketed or under fire for effect, out when lost or
40 s after the fire for effect). It prints the counter-battery rounds and where they fell; guns and men lost,
engagements, fires for effect, shifts, fires cut short and covers taken; and when the fire opens, the first ranging
round, its fall and the first fire for effect (median and range, minutes), the games with one, the defeats by their
title. Measured on 2026-11-26 before the levels' tuning passes and the stall fixes (12 seeds, reference lineups, all auto;
after both, the crews' own cover: guns lost 0, 0, 0, 0, 0, 0, 0.8, 4.0, 5.1, 6.8 a game on levels 1 to 10, won 12, 12,
12, 12, 10, 6, 7, 3, 5, 1 of 12; the losses on 5 to 10 almost all the X-Zeit assault):

| Level | guns lost (auto) | men down | engagements | fires for effect | first round to FFE | none: guns, men | cover: guns, men | won: auto / none / cover |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.0 of 1 | 0.0 | 1.0 | 1.0 | 1.4 min | 0.0, 0.1 | 0.0, 0.0 | 12 / 12 / 12 |
| 2 | 0.0 of 2 | 0.1 | 2.9 | 2.7 | 1.4 min | 0.0, 0.2 | 0.0, 0.0 | 12 / 12 / 10 |
| 3 | 0.0 of 6 | 0.0 | 2.3 | 2.3 | 1.3 min | 0.0, 0.6 | 0.0, 0.0 | 11 / 12 / 12 |
| 4 | 0.0 of 7 | 0.5 | 4.3 | 4.2 | 1.5 min | 0.0, 2.4 | 0.0, 0.3 | 12 / 11 / 12 |
| 5 | 0.0 of 12 | 0.7 | 7.2 | 6.7 | 1.5 min | 0.6, 7.3 | 0.0, 0.4 | 11 / 10 / 11 |
| 6 | 0.3 of 13 | 1.8 | 7.8 | 8.1 | 1.5 min | 0.7, 7.3 | 0.0, 0.8 | 11 / 9 / 9 |
| 7 | 1.3 of 15 | 3.8 | 10.5 | 11.2 | 1.3 min | 3.9, 17.3 | 0.1, 2.1 | 7 / 8 / 6 |
| 8 | 4.3 of 13 | 5.1 | 13.8 | 15.3 | 1.5 min | 6.7, 17.0 | 1.4, 3.3 | 8 / 5 / 6 |
| 9 | 6.3 of 13 | 7.2 | 17.3 | 19.6 | 1.1 min | 7.8, 18.2 | 4.5, 3.1 | 5 / 2 / 7 |
| 10 | 7.2 of 15 | 7.3 | 22.6 | 23.4 | 1.1 min | 8.8, 20.0 | 6.3, 5.1 | 4 / 1 / 4 |

- **Reading it.** Level 1 is a scare that costs nothing (one engagement, one light fire for effect, no gun or man lost
  with or without cover); the cost climbs from level 4 (men) and 6 (guns); from 7 a battery that does not take cover
  loses guns and many men. The step from 7 to 8 (the 18-inch, the 15-inch in more engagements, a lineup of lighter
  field howitzers) is the steepest. The prototype's scripted cover does better than the crews' own, which is
  imperfect on purpose (1.4 guns lost at level 8 against 4.3).
- **The opening** (auto, minutes, median): level 1 first round 1.0, first fall 1.4, first fire for effect 2.3, in 12
  games of 12; level 10: 0.3, 1.0, 1.8.
- **The old fire** (`--cb old`, auto): guns lost 0, 0, 0, 0, 1.9, 4.4, 5.6, 6.6, 6.3, 7.1; men 0, 0, 0.2, 0.7, 11.3,
  15.8, 19.3, 18.7, 18.1, 17.2; no fire at all on levels 1 and 2.
- **Before** (the prototype, 2026-11-25, 12 seeds): level 5 ranging 4.6 guns lost of 12 against 3.9 with the old fire,
  in 8 fires for effect; with cover taken at the bracket 2.8 guns and 2 men against 14.

**Not done:** the gunner's own gun in a battery in cover still serves on; a battery that shifts keeps its target at
its site (only the fix moves); threat.js `cb`, `dmg` and `sig` still matter (`dmg` scales every hit, `sig` the
loudness rule) and are the levels' tuning pass's.

## Test range

A game page with `?range=1` (`src/ui/range.js` `mountRange(host, query)`, loaded by main only there; `isGame` counts
`range`; the menu's entries `range:<era>`, which open with the hangar's battery). main's `startRange()` starts the era's
theatre (1917, WW2 Flanders, WW1 ridge) as the lessons do, `newBattle({ scripted: true, range: true, loadout })`: no
script, no phases, the clock held at 10:00, no enemy fire unless asked, nothing paid (`RESEARCH_ERA` null). The loadout
is always `{ [kind]: { guns: 1, mods } }`: one gun of the battery chosen (`&kind=`, else the page's default unit,
`RANGE_KIND`) is the only piece in the sim, so the render hides every other rig and the panel lists only it;
`canCommand` is true for it alone. `sim.range` (set only with `scripted`) lets the WW2 gunner man a gun on the scripted
range (`gunner.js` refuses in a lesson); the card hides while `body.gunner`.
The host: `{ sim(), units, kind, selectedId(), select(i), hint(text, ms), restart({ loadout }), href(params) }`; main calls
`range.update()` (endless ammunition) and `range.refresh()` (the card, rebuilt when its state changes, at most every
0.3 s) from `onFrame`. After each start the unit is set `manual` (the scripted range holds it) and the ammunition
recorded; `level(part, n)` starts the range again with the new `mods`. **No errors** sets the wind to
calm (`sim.rangeWind` kept), `u.mods` to the unit's with `disp: 0, bias: 0` (`u.rangeMods` kept), `u.bias` to zero and
each piece's `calib` to zero (`p.rangeCalib` kept); off puts them back. Missions are `sim.script.mission(id, { observer:
'air', unitId })` (an open one is assigned instead); hostile fire is `script.hostile` from the nearest standing enemy
battery (now any with `t.battery`, the WW2 and WW1 kinds, and `EnemyWW1.update` runs `hostileUpdate` on the scripted
range); `sos` cycles the sectors through `script.assault`; `clear` is `script.quiet` and `script.clear`. `__drumfire.range`
is the API.

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

**Basic training** (`WW1_TUTORIALS` in `src/ww1/tutorial.js`, id `training`, `/?mode=ww1&tutorial=training`): the
German career's first lesson and the game's designed first impression (late-war guns in a new player's hands), on
the career's own ridge, offered to a new player (`src/ui/invite.js`: every menu load, and the career battle opened
from outside the game, main.js `fromOutside`: `document.referrer` not this origin, never when the game opened the page
itself (the menu has asked already; the summary's Next), until the lesson is finished or Stop reminding me is
clicked, which stores `'never'` in localStorage `drumfire.invite`; Not now and Start ask again next load; never under
`navigator.webdriver`). A player who skips it gets the first battle's coach ("First run"). The Gruppe lends a battery above a new career's: the ridge's WW2 21 cm Mörser 18 pair "Julius"
(ops.js `RIDGE_WW2`, unit 11) with every upgrade, so the career's first battle with its one K 17 feels the difference.
Steps: the view, the console a section at a time (the battery: its tab, the slip that says why it cannot fire, that it
waits for orders and S for the Sperrfeuer; the board, the fire order, the guns, the calls, the messages; since
2026-11-25 the lean console's, `TH.lean`, so the range table's step and the header's are gone), take a call (a tank laager: hard, so the fire for effect has work to do), watch No. 1
gun lay and load (main's `host.closeUp(i)` puts the camera on that gun), one ranging round once it is ready, ride the
shell, the VB's report, apply the correction, bracket, fire for effect until three of the four tanks are wrecked; then
at the gun (an ammunition dump, soft, its call laid only once the laager's last shells are down; its first round lands
160 m over, so there is always a correction: not a battery, whose aim point carries the 70 to 200 m `cbErr`): man it
(P), lay and fire with crew help on, read back the corrected command at post 1, then with crew help off the barrel
down, load, prime, lay and fire, watch it land, crew help on (C), leave (P; the card says that in a battle the other
batteries fight on under their crews while the player is at a gun); `finish` only if the dump still stands. Lesson fields it adds (any lesson may use them): `kinds` (main builds the ridge's theatre with
them and fields only them: key 1 is the first), `levels` (the lent battery's look, models/looks.js), `loadout`
(`sim.newGame`'s), `gunnerFrom` (the step from which P and MAN work: `tutorial.canMan`; the sim allows the gunner in this
scripted game through `newGame({ manning: true })`, `sim.manning`), `spotlight`, `noSkip` (no Skip step: every step is
done; Exit tutorial stays), `after: { label }` (the finished card's main button: main's `host.after`, the career battle at
the menu's last open threat level), `instant` (a step advances the moment its goal is met, a "✓" for it on the next card,
and a step whose `skipIf` turns true while open is passed over: no pause in which a player's action ahead of the card can
be lost), `stall` and `stuck(T, step)` (after `stall` seconds without the goal met the card adds STILL WAITING: the step's
`stuck(T)` or the lesson's, read from the game: the battery's `guns.problem`, the gun card's next job, rounds falling
wide unobserved). Step fields: `spot` (the spotlight's holes, default `hi`), `skipIf(T)` (passed over when true, not
counted as skipped), `stuck(T)`. A demo may hold the gun's keys through `T.gunInput` (main uses it in place of the
keyboard; cleared on every step).

**Keeping the card in step with the game.** Every goal is game state, never "since this step opened": the call taken,
a gun ready or rounds fired on the call (`mission.fired`), reports received, a fire for effect given (`unit.ffeVolley`),
the target's damage, the aim moved since the VB's report and the gun's command read back, No. 1 gun's drill state; the
one count kept is No. 1 gun's rounds since the player was sent to it. Each goal also reads true once a later one does,
so the steps collapse in whatever order things happened. `node tools/trainingtest.mjs [--cases ...] [--jobs N]` plays
the lesson misbehaving at every step: the next steps' actions done early (console steps), nothing done for 60 s (every
step), the gun card followed instead of the lesson card and the gun left and manned again (gun steps); it fails on any
stalled step.

**Spotlight** (`src/ui/spotlight.js` `setSpotlight(list | [] | null)`): the screen dark but for holes over the
step's `spot` (data-tut names, or CSS selectors lighting their first match: `#view`, `#panel`, `#gunner`, `#man-gun`, `[data-tut~="report"]` the newest report slip; a step's `spot` may be `(T) => list`, read every frame), the screen less the holes
at z-index 40, drawn as plain rectangles (the cells of a grid on the holes' edges that lie in no hole: holes that touch
join; no SVG mask, which SwiftShader drew in 256 px bands), the SVG itself taking no input; window capture listeners
stop a pointer press, click or wheel that lands in the dark (outside every hole, the card and the hints), so one in a
hole reaches the control; keys work everywhere. The card and the hints stand above it (`body.spotlit`); a list that finds
no visible element darkens nothing; `[]` darkens all but the card (the welcome and the finished card). A spotlit lesson
draws no `.tut-hi` pulse: the holes have their own rim. At a gun the card moves to the view's upper right.

## First run (`src/firstrun.js`)

What a new player meets first, and what this browser's player has done since (2026-11-26, the landing work). The
designed first impression is the basic training, late-war guns in the player's hands, offered by the menu ("Tutorial",
Basic training); the career's first battle respects the progression: the player's own guns, nothing lent (the user:
"why would we give them a siege gun right up front? we need to make sure the progression mechanism is well
respected"). `src/firstrun.js` (plain data and DOM-free logic; the coach reaches the game only through main's host)
keeps the first battle's rule, the coach and the funnel.

- **The record.** localStorage `drumfire.firstrun` (`saves.js` mirrors it, Export save carries it): `{ v: 1, at: {
  first_battle, first_shot, first_hit, first_mission, first_win, second_battle }, coach: { started, take, fire,
  follow, correct, effect, cover, back, end } }`, the times in ms since 1970. Exports: `has`, `mark`, `milestone(flag,
  tele)`, `firstWin`, `isFirstBattle`, `Coach`.
- **The first battle** (`isFirstBattle(career, q)`, main.js `FIRST`): the career's ridge battle page with `?play`, no
  battle fought yet (`career.battles.de` 0), at level 1 (a link without `?level` is level 1), never in dev mode. It is
  fought with the career's own lineup (a new career's FK 16 and sFH 13, two guns each, since 2026-11-26; the
  Ringkanone C/92 before). Its guns stand loaded: after `newGame`
  main loads every idle piece of the fielded units (`p.loaded`, state 'ready', one HE from the stock), so the first
  shot comes as soon as a mission is taken and the gun laid, never after a loading cycle; level 1 also deals only a
  quick main (threat.js `quick`). The briefing (the loading screen, the menu's level card) is dealt from
  `lineupLevels('de')`, as the battle is.
- **The lent gun, taken out.** On the same day a 38 cm Langer Max was lent at its best beside the C/92 for the first
  battle (`LENT`, `lentKind`, `LENT_KIND`, `LENT_LEVELS`, `battleLevels`, the battery preloaded, its pay to research
  only). The user took it out: it showed the top of the tree for free, made the second battle a step down and paid the
  first battle with its kills. `research.js`'s lent-unit pay rule stays, generic ("Research and upgrades").
- **The coach** (`Coach`, main.js `coach`): the fallback for a player who skipped the basic training, so it runs only
  while `LESSONS_KEY` has no finished `training` (main.js: `begin({ first: FIRST && !trained, battles })`). It puts
  the first battles' hints over the view (`hud.hint`), one line at a time, each until it is done. Every step's `due`
  and `done` read the battle as it stands (never "since this step opened"), so a player ahead of the coach finds the
  steps done and never sees them; what is done is kept in the record, so a reload does not teach it twice. Polled
  twice a second from main's frame, from 4.5 s after the start (the opening toasts first), paused while not playing,
  at a gun (P) or left; it waits for another hint to clear (a new mission's, the shell ride's), renewing its own while
  it stands, and only the cover line (urgent) may take the hint's place, once, when it is new. Started on the first
  battle (`coach.started`), it carries the steps still open into the next two (`battles <= 2` at the start: a bracket
  may not come in the first); a career begun before it existed never sees it, nor dev mode, nor a player who has
  finished the training. The steps, in precedence order (danger first):
  1. `cover`: a fielded battery bracketed or under fire for effect, out of cover: "Deckung! The British have X's
     range. U takes its crew into cover until their fire passes." ("Select X (k), then" when it is not selected).
     Done on any cover taken. While it is open it stands in for main's bracket hint (`speaksFor`).
  2. `back`: in cover 20 s (sim) with no fire for effect falling: "X: their salvo has passed, and the guns are
     silent. U sends the crew back to the guns." Done on leaving cover.
  3. `take`: an open mission and none taken: "Take a fire mission: click a target on the map board, or Tab then Enter
     on a call in the list." Done when a fielded battery has a mission or has fired.
  4. `fire`: a battery with a live mission: loading "X's crew loads and lays the gun on the target. Wait for READY (]
     speeds time).", ready "Space fires. X is laid on the target." Done on the first round fired.
  5. `follow` (optional): a round of ours in the air: "F rides the shell to the target, if you like (F again: back to
     the guns; ] speeds time)." Done when F is pressed or the first round lands.
  6. `correct`: the newest report on a live mission has a correction: "The observer reports where it fell (on the
     message pad). Press . (full stop) to apply his correction, then Space fires again." Done when the aim has moved
     since such a report came (the aim at the poll before it, so a quick `.` counts); a first round on target leaves
     it open for a later battle.
  7. `effect`: the newest report on target: "On target ("Ziel!"). Keep firing (Space) until it is destroyed: R fires
     more rounds a gun." Done when more rounds a gun are set, two more rounds have gone, or that mission is over.
  8. `end`: the mission accomplished: "Mission accomplished: K (End the battle) ends it and pays. Or finish what you
     will first." (the X-Zeit wording when it is dealt). Done when the battle ends accomplished.
  No Sperrfeuer step: level 1 has no attack.
- **The invite** to the basic training is the user's original rule ("Tutorial", Basic training): every menu load
  until the lesson is finished or Stop reminding me is clicked, and a career battle page opened from outside the game.
- **The end card** (main.js `showBattleSummary`, the career battle's summary page, `ui/summary.js`). A level won below
  10: the primary button "Next: level N+1 · <name>", its second line the English name and "first win +X RP"
  (`career.firstWinBonus`), its hover the level's `sub`; it opens that level's battle page at once (`menuItems.js`
  `hrefOf` with a new seed and `rollModifiers(n, seed)`, as the menu's To battle builds it, the page's settings
  passed on) and writes the menu's memo level (`drumfire.menu` `level`, merged) so the menu's level card follows when
  the player comes back. A defeat: "Try again" (this page, a new mission). Level 10 won, or the battle left: Main menu
  as the primary, Fight again beside it after a level 10 win. Research and Main menu stay as secondary buttons.
  summary.js actions take `sub` (a second, smaller line, `.sm-btn small`) and `title`; the RP rows add "First win of
  level N" (`rp.first`, in the total), and a note says when the overmatch cut applied (`cut`).
- **The funnel** (`milestone(flag, tele)`: marked once per browser whether reports run or not, its count
  `funnel.<flag>` sent only where they run, at the moment it happens; "Crash and lag reports"): `first_battle` (the
  first battle's start, the funnel's top), `first_shot` (with `funnel.to_first_shot`, ms from opening the page),
  `first_hit` (a round of ours bursting within `HIT_NEAR`, 100 m, of the target of the mission it was fired on),
  `first_mission` (a mission done that a fielded battery fired on), `first_win`, `second_battle` (a career battle
  started after the first battle's own start: a Try again, or any later page); and `battle.end` for each career
  battle that ends. Career battles only, never attract or scripted; only the player's fielded batteries count.
- **Checked** headless on 2026-11-26 with the lent Max, since taken out (history): the shared link went straight into
  the first battle with the coach's first line up, the summary's Next led to level 2 with the first win's 250 RP, and
  a coach probe showed every step in order. With the C/92 alone the British bracket came at 3.5 to 3.7 min and the
  cover and back lines showed. Checked again after the ramp guns' cut (2026-11-26): a new career's first battle loads
  the sFH 13 and the FK 16, two guns each and standing loaded, a dump or battery main and the Hellfire Corner hold, no
  page errors; all auto with the guns loaded (72 seeds, a throwaway probe) it is won 72 times, the main done at a median
  3.0 min (mean 3.2, worst 7.6), the hold at 1.7 min, the FK 16 firing 41 rounds to the sFH 13's 16.

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
German kinds' roles from `render/crews_de.js` (`ROLES_DE`) and `render/crews_heavy.js` (`ROLES_HEAVY`). The German
crews are spaced and drawn as lifelike crewmen (Module contracts, "Crews" and "Lifelike crewmen (crew2)").

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
battery: the Big Bertha demo's drill on the main game's guns. The kinds are every German gun of the open battles
(`gunner.js` `MANNABLE`): the leFH 18, the sFH 18, the K 18, the Mrs 18, the Nebelwerfer, the Gustav and the Karl,
and on the German career's 1918 ridge also the K 17, the sFH 13, the 21 cm Mörser 16, the Langer Max, the Gamma and
Bertha (`SpecialWW1` makes the Gunner as `SpecialWW2` does; main loads `gunnerView.js` on WW1 pages too). The launch
sites and the Paris Gun, with drills of their own, refuse with a reason, and so does the Gustav while its railway
preparation has it in pieces (`p.fixed`). The camera sits at the eyes of the man at the player's post, the gun card
lies over the 3D view, and the console beside it still commands the Group.

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
- **The Nebelwerfer's drill** (its own, `stepPost` / `stepEn`): the commander reads back, the layer lays the launcher
  by hand, the loader loads the six rockets and connects the igniters (its `prime` is the loader's), and the firer
  takes the crew into cover (`cover`) and fires the ripple from the firing box there (hold E); the camera is the
  firer's in the slit trench (`rig.anchors.cover`), looking at the launcher. The rockets are in when the `shell` step
  ends and the rest of the six go off one by one after the first, as the launcher's own cycle does them (`p.tubes`,
  `p.ripple`, sim/guns.js).
- **The bed-mounted giants** (the ridge's Langer Max, Gamma and Bertha): the Gamma and the Max lay by power as the
  Gustav and the Karl do (`DRIVEN`: over a minute of hand wheels for a lay, the Gamma's 0.6 and 1.6 degrees a second,
  the Max's 48 degrees of traverse at 1); Bertha's layer cranks (0.9 and 2.2, under a minute). Their commanders stand
  further back and higher (`VIEW_KIND`); Bertha's and the Gamma's bed relay stays the console's key (T), as the Karl's
  L, T and Y do. Crew roles from their render rigs (render/ww1/max38.js and gamma.js `ROLES`, Bertha's
  crews_heavy.js).
- **The powered drives** (`DRIVEN`: the Gustav, the Karl). The Gamma and the Langer Max too (above). Their laying rates are slow (the Gustav 0.08 degrees a
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
  ordered that the gun has not moved on for 40 s lapse, with a radio message. In the German open battles (no auto
  mode, main.js `NO_AUTO`) the manned gun's battery is always the player's: arriving at a handed-over battery's gun
  takes it back (below).
- **Other batteries** (`othersAuto`, the gear menu "At a gun: other batteries to auto", default on; since 2026-11-25
  the German open battles' only auto). On the first gun manned every other live battery on manual goes to its crew
  (`Gunner.hand(v)`: mode auto, its id in `st.others`, `sim.crews.handOver(v)`); from a gun of one battery to a gun of
  another, the battery left goes to its crew and the one arrived at comes back to the player's orders (out of
  `st.others`, auto to manual). The radio says which. On leaving (`unman`) those still on auto come back to manual,
  laid where they stand ("2 batteries are back at your orders, laid where they stand"); a series begun is fired out and
  nothing more is fired without an order. A battery the player gives an order (`TAKE_MANUAL`) stays the player's, and
  so does one put on the Sperrfeuer (`ww1/theatre.js` and `ww2/theatre.js` `sos`: a battery `handedOver` goes to
  manual, else its crew would leave the line for the work it had). `handedOver(u)`: on auto only because the player is
  at a gun.
- **Taking over** (`sim/crews.js` `Crews.handOver(u)`, 2026-11-25; until then the gunner only set the mode and a crew
  given a battery mid-mission dropped the mission to pick afresh). The crew takes 3 to 8 s to take the battery over
  (`ai.wait`), then carries on its live mission from where it stands: the Sperrfeuer kept up, the Feuerwalze laid on its
  line as a lift that is due, fire for effect (the mission in 'ffe', on target, or the last report ok), or ranging (a
  round in flight waited for, `await`, else a ranging round); a bed out of arc is relaid onto the mission. While
  `ai.own` the player's last order comes first (a series on a map point fired out, a gate cleared). A battery with no
  mission picks its own work after that, and answers a Sperrfeuer call still up 8 to 36 s later. Crews-only battles
  never come here.
- **Shape.** `sim.gunner` (`Gunner`, made by `SpecialWW2`), and `sim.gunner.st`: null, or `{ unitId, pi, kind, post,
  assist, order { az, el, charge, fuze, ok, why, n, acked }, ack, hold { what, t, dur }, next { post, key, text, wait },
  why, others, drive { az, el } }`, plus `hand(v)` and `handedOver(u)` (above). `piece.manned`: `sim/guns.js` `updatePiece` hands such a piece to `sim.gunner.updatePiece`. The piece
  keeps the cycle's fields, so the console, the crew's choreography and leaving the gun mid-cycle work unchanged.
  Commands `man { piece, post, assist, othersAuto }`, `post { post }`, `unman`, `assist { on }`, `drive { axis, dir }` go through
  `sim.command` and `SpecialWW2.command`; they are not in TAKE_MANUAL, so manning keeps the battery's mode.
  `sim.gunner.setInput({ az, el, fine, work })` every frame. Event `gunner(what, a)`: 'man', 'unman', 'post',
  'order', 'ack', 'mark', 'nofire', 'pull', 'lapse'. A gun knocked out puts the player back at the console
  (`check()`, after the guns' step), and so do a new game and the end of a battle; a lesson refuses `man`.
- **Page** (`gunnerView.js`, `gunner.css`). `POST_ROLE` names the crew role at each post (officer, chief or
  sergeant, layer, loader or loader1, lanyard). `render/crews.js` `GunCrew.setPlayer(role)` hides that man's head (he is never the
  casualty taken off the gun) and `eye(out)` gives his eyes (with the lifelike crewmen from his head as his clip poses
  it that frame: "Lifelike crewmen (crew2)"; else from the figure's neck). The camera sits a little behind and above them (`VIEW`),
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
  `voices.attach(sim)` after the event wiring, `voices.update(sim)` before `audio.update`, the load handler never plays the
  synthesized English "Ready!" on a WW2 or WW1 German page (2026-11-01: the German guns have their recorded reports), key V, `__drumfire.voices` (its `log` lists every
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
`CREW_ERA.ww1` (`render/crews_ww1.js`: Bertha's crew in the 1917 dress; the 1918 guns have it by their era, the WW2
guns of the career's ridge keep their own) before the rigs are built, and calls `loadGuns(GUN_KINDS_WW1)`.

**The German career's battle.** The ridge is the career's open battle (research.js `TREES.de`, main `RESEARCH_ERA
'de'`): `ww1Theatre('ridge', { kinds })` (main passes the career lineup's kinds on the battle's page) adds the WW2
batteries the lineup names (`ops.js` `RIDGE_WW2`, ids 7 to 13, below), the Karl's prepared stops
(`RIDGE_POSITIONS`, `op.positions`), the heavy and the long guns' role sites (`RIDGE_ROLE_SITES`: deep W1 to W3, 11
to 15 km west; hard V1 to V3, `mebu` concrete shelters behind the British line) and their pads (`ridgeWW2Pads`, once
per kind, before the terrain is sampled). Without `kinds` (the tests) the ridge is as it was (ww1test bit-identical
on seeds 1 to 72). They take the field only when the loadout names them, as every career battery does.

| id | kind | callsign | pieces | position (x, z), zero | notes |
|---|---|---|---|---|---|
| 7 | `lefh18` | Ludwig | 4 | (6400, -3600), 268 | 1.3 km off the sFH 13's spot (its Flanders one) |
| 8 | `nbw41` | Fritz | 3 | (5700, -500), 270 | its Flanders spot |
| 9 | `sfh18` | Bruno | 4 | (8100, 1500), 265 | its Flanders spot |
| 10 | `k18` | Heinrich | 2 | (10400, 400), 270 | 1.5 km off the K 17's |
| 11 | `mrs18` | Julius | 2 | (8900, 3300), 263 | 1.4 km off the Mörser 16's |
| 12 | `karl` | Thor | 1 | (6000, 1800), 270 | `special: 'karl'`, `ready`, auto: set up in stop A (5700, 1800) |
| 13 | `gustav` | Gustav | 1 | (13500, 600), 272, arc 18 | `special: 'gustav'`, assembled on its curve |

The WW1 modules know them: `SpecialWW1` runs the Gustav's and the Karl's controllers (`ww2/special.js` `GustavCtl`,
`KarlCtl`, exported), the crews (`crews.js`) give each its WW2 part (the leFH 18 and sFH 18 with the sFH 13, the K 18
with the K 17, the Mörser 18 with the Mörser 16, the Nebelwerfer on the batteries, tanks and traffic, the Gustav and
the Karl with the super-heavies, `SUPER_WW1` keeps them out of the Sperrfeuer; the Karl turns its hull onto a
target), the director gives a fuze the gun has (the Nebelwerfer's only instant) and the leFH 18's Doppelzünder on the
Sperrfeuer, `tables_ww1.js` `FFE_WW1` their rounds for effect on the British kinds, and the lineup's day
(`sim/lineup.js`, with the ridge's battery and traffic kinds) and the heavy guns' missions (`specialists.js`) run in
`DirectorWW1` as in the WW2 director (its `siteMission` gate, `missionsUpdate`). On the page main loads the WW2 guns,
`ww2/render.js` for their scenery, poses and rockets only (`createWW2Render({ kinds, air: false })`: the aircraft are
the 1918 ones, ww1/render.js's) beside ww1/render.js (`modeR` calls both), and the WW2 sound banks. The battery tabs
past the tenth have no key (1 to 9, 0).

| id | kind | gun | pieces | position (x, z), zero | notes |
|---|---|---|---|---|---|
| 1 | `k17` | 10 cm K 17 | 2 (40 m apart) | (9300, -600), 272 | shrapnel |
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
`HUNT`). The board draws the plain grid (no salient, no lines). The gun starts on manual (A handed it to the crew
until 2026-11-25; the German pages' console has no mode switch, UI).
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
gun (R, Z, G, X, Backspace) say so. The status line (the lean console's slip atop the right column, UI) names the card
(STELLUNGSBAU or FEUERABLAUF) while the gate holds the gun. The map: `src/ui/consoles/parisMap.js` on the artillery board through the theatre (`src/ww1/ui.js` sets
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
  metres and Strich, the German grid, words, `fit`, `mppMax`, `unitName`: a battery by its callsign on the German
  pages' report slips and missions list; `idleMission`: on the German battles a battery's tab reads IDLE when it has no mission); `tutorial.js` `Tutorials({ defs })`, `host.redirect`,
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
  `newBattle`, so buffers and textures go up then, not in the frame that first sees them; what has nothing to draw yet
  (an `InstancedMesh` with `count` 0, an instanced geometry with `instanceCount` 0, a draw range of 0) is drawn with one
  instance for it, then put back. `gpuSettled(renderer, maxMs = 8000)` resolves once the GPU has done everything
  asked of it (a fence); main awaits it after the battle's `start()` and before `hideLoading()`. Main: gear menu "Hide
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
- (sim: the open battle's day fitted to the lineup) `src/sim/lineup.js` (DESIGN.md "The day fitted to the lineup"): with
  a career's loadout the scripted site missions only go to sites a battery in the field can serve, wait while the
  lineup's hands are full, and an idle battery is given a site that suits it. Measured with `tools/researchtest.mjs`,
  seeds 1 to 24, Normal, all auto, against the fixed day (`NODAY=1`): 1917 start RP 204 (202 before), site missions
  done / failed 2.0 / 1.0 (2.0 / 2.9); early 578 RP (587), 5.6 / 5.0 (5.5 / 9.6); full won 10 (9), 11.2 / 11.7 (10.8 /
  11.1). WW2 start 220 RP (228), 1.2 / 2.6 (1.3 / 5.0); early 576 (533), 4.6 / 4.8 (3.9 / 7.8); full won 8 (6),
  21.7 / 7.9 (12.3 / 7.2), about 14 missions a game given as work. The convoy and train guard a null mission. Without a
  loadout nothing changes (simtest, ww2test).
- (menu + game: the test range) `?range=1` in any era (DESIGN.md "Test range", `src/ui/range.js`): the era's map on the
  scripted range with any battery, its guns and upgrades set on the card, observed missions or a plain lay on any
  target, and debug switches (invulnerable, endless ammunition, no errors) and events (hostile fire, an attack and its
  SOS, convoy, train, clear); the setup goes into a link. The menu: "Try on the range" under a battery's figures in the
  hangar and on its Research card, and a Test range entry in each era's Battles list. `Script.hostile` takes the German
  enemy batteries (`t.battery`), and `EnemyWW1.update` runs the scripted hostile fire.
- (game: the test range, one gun) The range fields one gun of the chosen battery and nothing else (loadout `{ [kind]: {
  guns: 1, mods } }`; the Guns selector is gone), so only that gun is drawn, listed and commandable. `newGame({ range:
  true })` sets `sim.range` on the scripted game, and `gunner.js` lets the player man the gun there (headless check: every
  mannable WW2 gun fired three rounds through the drill on the range, with and without crew help; in the page the
  leFH 18, the Mörser 18 and the Karl fired through the first-person view on key events; `tools/rangetest.mjs` keeps the
  headless check). The range card hides at the
  gun.
- (game: the camera on the guns in the field) main's camera anchor for a unit (`unitRoot`) was the centre of all its
  pits, and its distance (`KIND[kind].dist`) framed the whole battery, so a unit fielding fewer guns than pits (the test
  range always one, a career's battery one of four at first) was framed on empty pits. `centreUnits()`, run by
  `newBattle` after `sim.newGame`, now puts each anchor at the centre of the sim's pieces and sets `unitDist[id]`: the
  battery's distance with every gun in, else the larger of 14 m, 2.2 times the gun rig's size and 1.6 times the spread
  of the guns fielded (a lone leFH 18 18 m, a 6-inch 14 m, a K 18 31 m). Battles with every gun are unchanged.
- (ui: the console fitted to its screen and nothing cut short) The console's design box is 800 x 840, but most screens
  are relatively taller (16:9 gives about 1,080), and all the spare height went to the bottom row, mostly empty, while
  the board stayed square. The top and bottom rows now share it (`panel.css` `.toprow` / `.botrow` flex bases 452 and
  300; the launch and Paris Gun consoles keep the old split); the plain console's fire order keeps its height and the
  range table shows up to nine rows when it has room (`rangeTable.js`, a ResizeObserver). Text no longer ellipsized:
  the header names the gun and the battery on two lines, the status line has three, the sector keys the whole first
  word of the sector's name, a card's heading never gives way to its note (the guns card's note, the header's repeat,
  is gone), a gun's state has its own room (the bars go down a line instead; the commonest states in fewer words:
  "ready to fire"), a mission's observer and a report's task wrap. The guns card's rows sit at the top with the
  ammunition and the signature right under them. The board's bar has two lines (the reference or the hover readout,
  then the hint), and its live labels keep off each other and off the symbols, keys and bar (`Board.free`, `boxes`): a
  range ring's label moves a little round its ring to a free spot or is left out (the charge laid always shows), a
  target's goes below, above, right or left of its symbol, inside the board (a far one with no room left out, one a
  place name already gives not repeated), and the battery names stay inside the board.
- (career: one German tree) Germany is one nation with one research tree (`research.js` `TREES.de`, `LINES.de`): the
  1918 and the WW2 guns in five lines of one type each (long-range guns, field howitzers, mortars and siege, rockets,
  off-map support), researched in order along each line and never crossing, the first of every line open from the
  start, a rank I to IV each (the upgrade costs). A career starts with one gun of the 10 cm K 17 and no upgrades and
  fights the open battle on the 1918 ridge (main.js `RESEARCH_ERA = 'de'`). RP go to a research target picked on the
  Research screen (`Progression.target`, `progress`, `settle`: the rest of a battery's cost goes on to the next in its
  line); battery points stay each battery's. The V-1, V-2 and Paris Gun (`offmap`) fight in the open battle as off-map
  support and keep their own missions. The WW2 open battle and the British game are sandboxes for now; Britain is
  hidden from the menu (`menuItems.js` `NATIONS`), its tree kept. Save `drumfire.campaign.v4`; older saves are not
  carried over. The menu's top bar has nations instead of eras; the hangar dresses each battery in its own era
  (`gunEraOf`); its slot bar scrolls, its ends fading while there is more.
- (support) Off-map support for the career's open battle (DESIGN.md "Off-map support"): `src/sim/support.js`
  (`Support`, `SUPPORT`, `supportKinds`), made by `sim.newGame` when the loadout has v1, v2 or paris; `sim.command(null,
  'support', { kind, x, z | cancel | ask })`; `sim.events.support`; `src/ui/support.js` tiles under the battery tabs
  and `board.js` `BOARD_OVERLAYS`; `render/support.js` the V-1's trail; `tools/supporttest.mjs`. Without off-map kinds
  nothing changes (ww1test bit-identical on seeds 1 to 72). Their strikes earn no battery points yet (`unitId: null`):
  `research.js` `battleReward` counts `sim.units` only.
- (WW1: the German career's ridge fields any German lineup; every German gun manned in person) `ww1Theatre('ridge', {
  kinds })` adds the WW2 batteries a career lineup names (`src/ww1/ops.js` `RIDGE_WW2`, ids 7 to 13: own spots for the
  leFH 18, K 18 and Mörser 18, whose Flanders ones are 1918 batteries'), the Karl's stops, deep and hard role sites
  and their pads; `SpecialWW1` runs the Gustav's and the Karl's controllers and the Gunner; the WW1 crews, director,
  `FFE_WW1` and `lineup.js` know the WW2 kinds; `DirectorWW1` now runs the lineup's day and the heavy guns' missions
  (they were never called there); main draws the WW2 batteries with `createWW2Render({ kinds, air: false })` beside
  ww1/render.js and loads the WW2 guns and sounds on such a page; `crews.js` keeps the WW2 crews' dress there
  (`CREW_ERA.ww1` for Bertha only). The gunner: `MANNABLE` is every German open-battle gun (the 1918 ones, the
  Nebelwerfer with its own drill: the loader's igniters, the firer's cover and firing box, the ripple; `DRIVEN` adds
  the Gamma and the Langer Max), `POST_ROLE` and `VIEW_KIND` for them, the WW1 ui's guns card MAN; gunnertest and
  rangetest cover the new kinds (the 1918 ones on the ridge, in a second process whose pads leave the WW2 ground as
  it was: the WW2 results unchanged); researchtest `--era de` on the ridge. Without a loadout nothing changes
  (ww1test bit-identical on seeds 1 to 72).
- (career: live rewards and the battle summary) `sim.credit(id, pts, why)` emits `events.reward(id, pts, why)` with `why.act`
  'hit' (damage, `Targets.damagePart`), 'part' (a part knocked out: half the target's score shared among its parts),
  'kill' (the other half), 'men' (0.5 a man of the enemy's killed by a burst, `Infantry.onBurst`), 'mission' (a mission's
  shares, `Director.finish`); credit only, the battles' outcomes unchanged. main.js shows each in the reward feed
  (`ui/rewards.js`) and pays the career as it goes (`payLive`, about once a second: each battery's `battleReward` points
  over what it was paid, `Progression.gain`); `payOut` adds the time in action and the victory at the end and counts the
  battle (`countBattle`). Main menu during a career battle pays and shows the summary page (`ui/summary.js`
  `showSummary`, a record from `battleRecord`) first; closing the page saves the record unseen (`drumfire.lastBattle`)
  and the menu shows it on its next load. The career battle's end shows the summary instead of the end card.
- (career: threat levels, version 1) The career's open battle takes a threat level 1 to 10 (`src/threat.js`, "Threat
  levels" above), all on the 1918 ridge for now: the level sets the enemy's side of the difficulty and the day (its
  length, attacks, the British heavies, spotters, raids, tanks with the attacks, the kinds of site, the deadlines, the
  modifiers); a shorter day is won with the front held and `need` missions done, a full one at X-Zeit. `capability.js`
  judges what a lineup can finish (the neighbouring Gruppe takes what it cannot) and recommends a level. On a level only:
  the Feuerwalze by the field guns and howitzers, HE, laid a margin beyond the line, no firing on the old line while a
  crew lifts late, our assault keeping pace (the friendly fire that lost X-Zeit for every lineup beyond a lone K 17 is
  down from 17 to 48 men to 0 to 7); a laager broken up and a battery silenced at half; the guns on one tank at a time;
  the crews correcting their fire for effect. `tools/leveltest.mjs` measures it. Without a level every test is
  bit-identical.
- (menu: the career battle's entry, the lists) The career battle's loading screen and entry describe the lineup and the
  level, not a fixed roster (menuItems.js `CAREER_BLURB`, the lineup line). The test range and the WW2 open battle are in
  no list (tab 'hidden': their pages stay, the hangar's "Try on the range" and the WW2 lessons use them). The threat
  levels open in order: a level played to its end, won or lost, opens the next (`Progression.playedLevel`; leaving early
  does not). The menu's stills gained the sFH 13 and the K 17 (`tools/menushots.mjs` now puts each shot's gun in the
  career lineup and hides the newer overlays); Bertha's is the demo's (`stillOf`).
- (hud: the compass strip removed) The compass strip at the top of the 3D view (the camera's heading, the other batteries, the known targets as three-letter codes) is gone: the board shows all of it better. `hud.updateCompass` and its markers are removed; the mission bracket in the view stays.
- (menu: the lineup's slot bar) A career's hangar bar holds only the lineup's slots, `SLOTS.map` on the map and
  `SLOTS.support` off it (`lineupSlots`; an empty slot is drawn as one), dev mode included: dev mode opens every battery
  to the lineup but never adds slots. Each slot has a swap (⇄) that opens the bench above the bar (`benchCard`): the
  batteries the career has outside the lineup, on the map or off it as the slot is (`Progression.benchOf(era, off)`);
  picking one puts it in that slot (`Progression.swapLineup(out, kind)`, the slot's place kept; `out` null fills an
  empty slot), and "Leave the X out" empties it. The hangar shows only the lineup's batteries (`hangarKinds`); a slot
  card reads as the battery takes the field (its guns, dev mode's included). The WW1 sandbox keeps its roster bar.
- (menu: the V-weapons on parade) The V-2's parade failed to draw: its missile's vane morph target went into the
  instanced shell piles, which three.js cannot draw without influences, and the error then stopped every later parade
  drawing (the canvas stayed on the battery before). The hangar's rounds on show drop their morph targets
  (`shellModel`), and a parade that throws while drawing leaves the scene. On parade the V-1 and V-2 sites leave out
  their own wood (`rig.trees`; v1.js now builds its conifers into that node too, as v2.js did), the V-2 stands on its
  table (`setErect(1)`), the V-2's ranks form round the site's heart (hangar.js `CORE`) instead of the fire control
  halftrack's 100 m reach, and a missile is shown lying in its cradle, its supply piles one rocket deep, in its own paint: the Shells
  upgrade's coat, bands, fuze and cap are a shell's marks and are left off a missile (`shellModel`, longer than 4 m).
  Nor do the launch sites take the parade's barrel and breech marks (looks.js `NO_BARREL`: their `muzzle` anchor
  is the missile's nose, which wore Barrel III's canvas muzzle cover). A missile on show rests by its lowest point and its body
  (`shellModel` `low`, `MISSILE_BODY`): its model's radius is its wings' or fins' span, which floated the V-1 2.5 m up.
- (tutorial: the basic training) A first lesson for the German career, `src/ww1/tutorial.js` `training` (DESIGN.md
  "Tutorial", Basic training), offered once by `src/ui/invite.js`; the lesson spotlight `src/ui/spotlight.js`; lesson
  fields `kinds`, `levels`, `loadout`, `gunnerFrom`, `spotlight`, `noSkip`, `after` and step fields `spot`, `skipIf`;
  `sim.newGame({ manning })` and `sim.manning` (gunner.js refuses the gunner in a scripted game without it: the test
  range and this lesson have it). main: a WW1 lesson page builds the ridge with the lesson's `kinds`, fields only them,
  is never the career's battle (`RESEARCH_ERA` null on any lesson page, so nothing is paid), and gates P and MAN by
  `tutorial.canMan`. The menu lists the lesson first in the German Tutorials (numbered through both eras).
- (career: dev mode off by default) `progression.js` `DEV_DEFAULT = false`: a browser without a choice of its own plays its
  own career (the K 17 to start); a choice made with the switch (`devSet`) is kept as before. The headless tools that
  need every battery set dev mode themselves (`shot.mjs --dev`, menushots, hangarsheet, voicetest).
- (tutorials: the WW2 basics removed) `w-basics` ("Die Grundlagen", the leFH 18 on the hidden WW2 Flanders battle) left
  `src/ww2/tutorial.js`: the German basic training (`src/ww1/tutorial.js` `training`) teaches the same loop on the
  career's ridge. The WW2 lessons are the special weapons' five.
- (tutorial: the card kept in step with the game) The basic training's goals rewritten as game state, the lesson
  `instant` with a STILL WAITING line (`src/tutorial.js` `instant`, `stall`, `stuck`, skipIf read while a step is open),
  and `tools/trainingtest.mjs` (the lesson out of order at every step). Found by it and fixed: re-manning the gun read
  back the command in hand, which passed the read-back step before the VB had reported; a wrong aim in fire for effect
  went on missing unobserved (the laager step now says so and how to recover).
- (menu: the lists in sight) Battles, Campaign and Tutorials stand in the top bar beside the chooser and To battle
  (`.mn-modes`, `data-mode`), each opening the chooser on its list; a list, from the bar or the chooser's big tabs, picks
  its first entry unless the choice is already in it (Tutorials: the first lesson not done; each list's last choice is
  kept in `memo.sel['<era>:<tab>']`), so To battle plays what the open list shows. Tutorials carries a pulsing light
  until the basic training is done. The bar drops its wordmark, takes two rows from 1100 to 1399 px (`--mn-bar` 104 px),
  and the hangar no longer scrolls the page past it on a phone (the chosen slot is brought into view sideways only).
  The Big Bertha demo's entry is gone from Battles: its drill is the main game's gunner; `bertha.html` stays.
- (battle: only the guns brought) A lineup's battery that fields fewer guns than its pits (research.js `guns`) no longer
  shows the others: the WW1 and WW2 render layers tie each gun's pit to its piece (`slot(..., { pi })`, kept only while
  that piece is in the sim; freed in a game, hidden on the range and in lessons) and build a WW2 battery's works round
  the guns it fields (rebuilt when they change); the console's settings take `pieces` from the unit's fielded guns, so
  the GUNS selector offers only what it has (none for one gun; 1 GUN and SECTION for two) and the order card rebuilds
  its buttons when the count changes (`OrderCard.setPieces`).
- (ui) Saves (`src/saves.js`), for itch.io, where every HTML game shares one origin: `startSaves()` runs in `boot.js` after the graphics check and before any module reads a save; it mirrors every `drumfire.*` localStorage key into IndexedDB (`drumfire-saves`, store `kv`, record `local`: `{ keys, t }`) through a wrapped `Storage.prototype.setItem`/`removeItem` (at most every 2 s, at once while the page hides), and restores the record when localStorage has no drumfire key at all (never an empty set over a full backup). `exportSave()` downloads `{ game: 'drumfire', v: 1, saved, keys }` as `drumfire-save-<date>.json`; `importSave(file)` checks it, writes its keys, removes the drumfire keys it lacks and resolves to '' or the reason; the menu reloads after a good import. Buttons: `.mn-file` beside `.mn-save` in the hangar's and Research's footers. New `drumfire.*` keys are covered without changes. The Bertha demo page does not start the mirror.
- (career: every threat level open) `Progression.levelUnlocked` is true for every level 1 to 10: the levels are no longer played in order. `playedLevel` still moves `threat` (the highest reached) on.
- (render: close crews) A second geometry tier for the German crews, `src/models/v/crew_hd.js` (1917 and 1944 outfits; about 36k to 43k triangles a figure (the face 8.5k under a helmet, 12k under a cap) against 5.5k to 6.4k: a face meshed by surface nets from a signed distance field with eyeballs under almond lid shells blended into it, fists with phalanges and a thumb round the grip point, cloth folds displaced and shaded in the lofts, the kit conformed to the body, helmets with liner, seated lugs and rivets and the chin strap worn three ways by the man, boots with heel and sole; one material: vertex colours, a wool fleck map and a twill normal map scaled per vertex by `aSurf` = roughness, metalness, normal strength, fleck). Same skeleton and bones as `crew.js`, so a figure changes tier by swapping its mesh's geometry and material: `crew.js` now exports `CREW_FRAME` (the skeleton's numbers and the palette, read only), `registerCrewTier(name, { geometry, material, has, step, covers })`, `crewTier(name)`, `buildCrewman({ ..., tier: 'hd' })` and `fig.setTier(name | null)` (false when the tier has nothing for the outfit). `src/render/crewhd.js` `CrewHD` puts the gun the player serves in person (the gunner) in that tier, and the battery's other guns within 25 m, building over frames (the face mesher in 6 ms slices, one figure a frame) and back to the standard tier on leaving; a hidden primer figure lets the warm-up draw compile its shader. `GunViews.pov` (`{ unitId, pi }`, set by main while the first-person view is up and no shell is ridden) also hides the other batteries' crews beyond 60 m and calls `DetailCull.setFocus(p, r = 300, px = 3)` (render/detail.js): beyond r metres of the manned gun a mesh needs px pixels to be drawn. `GunViews.povDetail = false` turns all of it off to compare. The batteries' emplacements and works (`*-position`, `*-position-1918`, `*-battery-works`) now take part in the sub-pixel cull too (main.js). Model viewer: `/models.html?kind=crew&all=de&hd=1` (the six German outfits in the close tier), `&look=x,y,z`.
- (render: German drills) `render/crews.js` drills the leFH 18, sFH 18, K 17, sFH 13 (light) and K 18, Mörser 18, Mörser 16 (carrying pair) on one cycle clock, `GunCrew.timeline(p, k)` (`tl.at(step, k)` seconds into the cycle on the table's step lengths scaled to the job's pace, `tl.now`, `-Infinity` before a cycle and `+Infinity` after it), for the kinds in `TIMED`: the carriers set off in the step before the one their round is for, at walking paces (`V_CARRY` 1.1, `V_BAG` 1.2, `V_WALK` 1.3, `V_PAIR` 0.9 m/s) instead of covering the whole way inside a 1 to 2 s step at a run, turn on the spot at the ends of a walk (`pairAlong`, also used for single men), and walk to where the tray will be at the loading elevation (`loadFrame`, `TL`/`BL`/`GL`). The light guns' loader steps up beside the block after the run out and back in the lay (`loaderAt`, `LOADER_AT`), the rammer walks to and with the staff's butt (`ramPlace`; the round is left in the breech mouth for him, `aRam0`), the cartridge is pushed home with both hands on its base; the K 18, Mörser 18 and Mörser 16 have the lanyard man work the block (`BLOCK_MAN`, `blockMan`), the pair comes in from the stack's side and slides the shell up the tray with a push, its rammers walk up the platform for the cartridge stroke. For every crew: the ears are covered for about a second either side of the shot with a quarter turn outward (it was a 135 degree spin in 0.3 s and a 3 s hold through the opening of the block), a pose cross-fades only for 0.3 s after it changes (the per-frame filter dragged walk and handwheel cycles behind themselves), and `Man.hand` lets go of a grip beyond an arm's reach (0.88 to 1.02 m from the chest) instead of hauling the arm straight out. Crew spots moved in `models/v/de/{lefh18,sfh18,k17,sfh13,k18,m16}.js` (the leFH 18's ammunition men and ready rounds between the trails). `/src/render/crewcheck.html` now takes any kind with a crew and adds a motion audit (speed, pace jumps, teleports, heading snaps, pose flicker, feet sliding, hands short of their grip or released for reach, hands in the torso, elbows turned inward), `&shots=step@k,...&cams=` contact sheets, `&stop=step@k` and `&trace=role,t0,t1`; `node tools/crewaudit.mjs <kinds> [--scn] [--shots] [--out]` runs it headless.
- (render: heavy German drills) Bertha, the Karl and the Paris Gun drilled on their real parts (the Gustav's path is unchanged). `render/crews_heavy.js`: Bertha's men stand where the demo (`src/bertha/crew.js`) puts them, the layers on their footboards (0.3 m over the bed) working the model's own handwheels (`rig.berthaModel.wheels`, now turned by `heavyMechanisms` with the lay, the wedge and the hoist: `berthaWheels`, `craneTurns`, a whole number of crane turns a cycle; grips taken in the wheel's mounting, `wheelGrip`), the right loader at the wedge's crank, both loaders stepping in to steady the shell and out again at a walk, the rammers on fixed places behind the tray (side steps in and out, the staff through their hands), the bagman carrying the charge from the stage to the tray, where the staff drives it home (`heavyState` gives Bertha a cartridge stroke, `BAG_SEAT`); the Karl's men at the handwheels and the lanyard keep the rig's places (the clearance search had moved them up to 2 m), its loaders step in and out at a walk without heading snaps (`karlGuide`), the control stations stand 0.36 m off with the hands at ten and two (the Gustav keeps 0.46 m and the turning rim). `render/ww1/paris.js` drills the Paris Gun's frame itself (`act`, and a `state` hook that places the staff): crane man at the winch drum, signaller and cart man on the ground, loaders at the tray, rammers on the platform behind it with the staff on the bore line from the opening to the closing of the breech (on the deck between rounds), the bagman's charge from the rack to the tray. `crews_heavy.js` exports `shuffle`, `reachable` (an optional reach limit), `along` and `wheelGrip` for such drills.
- (render: bed guns and the Nebelwerfer) The Langer Max, the Gamma and the Nebelwerfer drills walk at an even pace (`src/render/drill_pace.js`: `trap`, `paced`, `pacedT`, `turn`, `along`, `pathLen`: a walk eased over its whole window by smoothstep ran at half pace, then 1.5 times it, the legs in slow motion and then racing) and turn over a fixed time instead of snapping round. `crew.js` gains the pose `run` and `CREW_GAITS.run` (stride 2.0 m, 0.68 s). Nebelwerfer: the carriers' trips start at 0.12 of the shell step (`nbwRounds` follows), they walk off to the slit trench when priming begins, the layer and loader run there in the cover step and everyone runs back at a steady pace after the ripple; the loader stands by the left rear corner of the tubes and feeds each rocket in while its carrier walks it home from the right of its line; the firing box sits on a sandbag in the firer's reach. Gamma: the rammers' strokes in one continuous gait, the rollers walk out during the open step, the winch man kneels to the crank, loader1 behind the tray, loader2 beside the ring (new rig spots). Langer Max: the car men turn into the car's way with a hand on its top rail, the left rammers lift the staff off the railing and swing it into line while the right pair cross behind the car, the charge comes forward carried in file, the lanyard man winds the wedge's wheel from beside the ring and primes from behind the breech.
- (render: the turn at the shot) `render/crews.js`: the ears turn follows its target at most a full turn per 0.7 s of sim time (`GunCrew.ears`, `earsAt`), so a gun that comes ready with its shot under 1.6 s away no longer snaps the men round; the block man (`BLOCK_MAN`) turns at either end of his walk to the breech in 0.7 s of its own instead of within the walk (a one-frame half turn on a short walk).
- (audio: German pages) main's load handler never plays the synthesized English "Ready!" bark on a WW2 or WW1 page: the German guns report in their recorded German lines (ww2/voices.js), and `CrewVoices.replacesBark` is gone. The British game keeps the bark.
- (lead: the German tree to 31 batteries) `research.js` `LINES.de` seven lines (new ids `railway`, `siege`; `howitzers` renamed "Field artillery", `rockets` "Trench mortars and rockets"), fifteen new batteries: WW1 `fk16 k16 m99 beta smw` (`tables_ww1.js`, `era: 'ww1'`), WW2 `k38 hm1 bruno k5 k12 wespe hummel nbw42 swg40` (`tables_ww2.js`) and the off-map `gotha` (a `SHELLS` row for its bomb). Positions: `src/ww1/ops.js` `RIDGE_MORE` (ids 14 to 27, fielded only when the lineup names them; `research.js` `DEFS` and `capability.js` `PITS` read it; pads in `ridgeWW2Pads`, the self-propelled guns' second positions too). Mechanics: `GUNS.runback { r, l }` (the Mörser 99: a fresh laying error at every shot, its own draws in `fireShell`, scaled by the sights' `bias`) with the 'relay' loading step (0.3 s before the gun has fired; it was a 'runup' rope haul until the same day: the real gun rolled back down its ramps by gravity, so the step is now the handspike re-lay); special `'beta'` is `BedCtl` (`REBED.beta` 0); special `'move'` is `MoveCtl` (`special.js`: `unit.special = { kind: 'move', state: 'set'|'mount'|'drive'|'dismount', posId, to, positions, moves }`, command `move { id? }`, T on the console, a STELLUNGSWECHSEL section on the guns card; the signature drops to 0 at once, the pieces are `fixed` and `mobile`, `place(k)` drives them and turns the hulls along the road, a new `drawBias` at 0.6 on arrival; auto crews move when located and under fire); traverse is the slow mechanic of the railway guns (K5 +-180 degrees at 0.4 deg/s on its turntable; Bruno and K 12 +-14 and +-12 on their curves). `render/guns.js`: a `piece.mobile` rig follows `piece.pos` and gets `rig.setDrive?.(speed)`. The British forward posts `RIDGE_FORWARD` (P1 to P4, target kind `bpost`: two Lewis gun bays and a Stokes mortar pit, `models/t/ww1/british.js forwardPost`, `layout_british.js`) join the career's sites only when the lineup has `FORWARD_KINDS` (the Minenwerfer, the Wurfgerät). The Gotha strike (`support.js` `SUPPORT.gotha`, `GOTHA`): three aircraft from 5 km east at 1,800 m, 42 m/s, each a stick of four bombs released for no drag; `sim.support.planes` (never `sim.aircraft`: the raid loop reads `raid.target`), drawn by `ww1/render.js` from a pool of three `buildAircraft1918('gotha')`. Crew drill modules are found by name: `render/crews_ww1.js` globs `render/ww1/*.js` and `render/de/*.js`, and a module may export `TIMED`, `BLOCK_MAN`, `BAG_SIDE`, `LOADER_AT` beside `ROLES`, `LIGHT`, `WORLD`, `STAFF` and the hooks. The test range takes any ridge kind (`?range=1&mode=ww1&kind=<kind>`). `ww2/render.js`: `ROCKETS` (nbw41, nbw42, swg40) share the launch blast, the rounds in the rig and the trail; `SITE_OF` (bruno, k5, k12, hm1) place `guns.EXTRAS` sites instead of field pits; the self-propelled guns have none. `tools/researchtest.mjs --lineup set:<kind>+<kind>...[@3]` runs a named lineup. Balance is unchanged without a lineup (the WW1, WW2 and British suites bit-identical: ridge 27 / 12 / 6, Flanders 4 / 2 / 2 on their seeds).
- (lead: the tree's models and the gunner) The fifteen models, crews and sites (seven model agents): `models/v/de/{fk16,k16,m99,beta,smw,gotha,k38,hm1,bruno,k5,k12,wespe,hummel,nbw42,swg40}.js` with the kits `railway_kit.js` (the Bruno's and the K 12's curves: the traverse pivot at the curve's centre, as the Gustav), `sp_kit.js` (tracks, `rig.setDrive`, `rig.driveBy`, the whole vehicle on the traverse pivot) and `rockets.js` (the 21 cm and 28 cm rockets, `shells.js` CUSTOM); crews in `render/ww1/` and `render/de/` (shared drills `render/rail_drill_de.js`, `render/crews_rocket.js`); `crews_de.js` drills the Nebelwerfer with the rig's own number of tubes (`slotOf(n)`, `F.n`; the 15 cm's six unchanged). The Mörser 99's carriage is its `recoil` pivot: its crew hook poses the run up the ramps and the gravity roll back down (`rig.holdRecoil`, `backAt(tf)`) and the line it comes to rest off, levered back in the 'relay' step (`rig.holdLay`). `render/guns.js` drives a mobile rig's tracks by the ground covered (`driveBy`); the Wespe's ground passer climbs aboard while the pieces are `fixed`. `ww1/render.js` builds the Beta's and the Minenwerfer's sites (one a piece when a unit has more than one), pits for the FK 16 and K 16 (`gun_sites_ww1.js` PITS from the K 17's), none for the Mörser 99 (its plank platform is in its model). The hangar lays the Bruno's and K 12's track (`buildXSite(1, { trackOnly: true })`), no powder for rockets and bombs, no muzzle close-up for the Gotha. Gunner: `MANNABLE` adds fk16 k16 m99 beta smw k38 hm1 bruno k5 k12 nbw42 (`POST_ROLE` in gunnerView.js; `DRIVEN` the three railway guns; the 'runup' step at the loader's post), not the Wespe, Hummel or Wurfgerät; `tools/gunnertest.mjs` fields the ridge's later kinds with a loadout so the lineup's day gives them work. `tools/shot.mjs --lineup k5,wespe,...` opens a career battle with that lineup (dev mode).
- (lead: the old ramp guns, 2026-11-01) Two more batteries without a recoil system, 33 in the tree: the 15 cm Ringkanone C/92 (`rk92`, ridge unit 28 "Richard", heads the guns' line and is the career's starting battery in place of the K 17, which follows it at 350 RP) and the 15 cm sFH 93 (`sfh93`, unit 29 "Siegfried", between the FK 16 and the sFH 13 at 350 RP), in `RIDGE_MORE` (fielded only when the lineup names them). Sim rows in `tables_ww1.js` with `runback` and a first 'relay' step as the Mörser 99's. The Mörser 99's drill is now the shared `render/ramp_drill.js` `rampDrill({ spike, t, off, walk })` (the run up the ramps and the gravity roll by `rig.holdRecoil`, the line offset by `rig.holdLay`, the handspike heaves); a ramp gun's rig exposes `rig.ramp = { anchors: { spikeL, spikeL2, spikeR, spikeR2 }, gripAt(side, k, out) }` and `rig.setSpikes` (the Mörser 99's also as `rig.m99`), crew state in `crew.ramp`. `progression.js`: saves now carry `start: 2`; a save without it began with the K 17 and keeps it (`OLD_START`). Threat levels 1 and 2 are fitted to the C/92 (`capability.js` `REFERENCE`, `threat.js` `fits`). The C/92 serves the balloon with the K 17 (`ww1/crews.js`), fires shrapnel in the Sperrfeuer (`GUNS_SHRAPNEL`); both join `FEUERWALZE`.
- (ui: the training invitation, 2026-11-02) `src/ui/invite.js` no longer asks once: the card comes back on every menu load (and on the career battle opened from a link) until the basic training is finished or the player clicks its new Stop reminding me button (`drumfire.invite` = `'never'`). Not now, Esc, a click outside and Start basic training remember nothing, so a lesson left half way is offered again; the old card's `'yes'` and `'no'` are ignored.
- (lead: the sMW out, strongpoints on levels 6 to 10, 2026-11-02) The 25 cm schwerer Minenwerfer (`smw`, ridge unit 18 "Moritz") is taken out of the game at the user's request: from its pit 700 m behind the British front its 250 to 1,000 m reach and 50 degree arc left it two forward posts and one sector's Sperrfeuer. Gone: its tree node (the rockets line now starts at the Nebelwerfer 41, 450 RP; the line is called "Rockets"), `RIDGE_MORE` entry, `GUNS`/`SHELLS`/`FFE` rows, models `v/de/smw.js` and `render/ww1/smw.js`, the shell model and every per-kind table entry; the forward posts P1 and P2 opposite it (`RIDGE_FORWARD` keeps the Wurfgerät's P3 and P4; `FORWARD_KINDS` the Wurfgerät alone). `progression.js` `REMOVED` gives a save the RP put into it (300 if researched); unknown kinds already drop out of a save's lineup and levels. Threat levels 6 to 10 bring strongpoints only the super-heavies break (DESIGN.md "Threat levels", Strongpoints): `RIDGE_FORTS`, `threat.js` `forts` and site kind 'fort', `sim/specialists.js` role 'fort' (no clock, by night too, one per able battery; its start takes no draw from the specialists' stream and nothing is counted at night without a strongpoint, so the British and WW2 battles stay bit-identical), site fields `minHard` and `partHp` in `sim/targets.js`, `CrewsWW1.canTake` and the bed relay for a strongpoint first, `FORT_MG` in `ww1/infantry.js`, `capability.js` tier 'fort' and the shell floor (which also corrects 'hard' for the light guns), the menu's "Strongpoints (28 cm and up)". `REFERENCE` and the levels' `fits` and `lines` follow the new tree (3: C/92 and FK 16; 8: K 18, sFH 18, leFH 18, Mörser 18, Beta-Gerät, V-1; 9: the Gamma for the Beta, V-2; 10: K 38, sFH 18, Hummel, leFH 18, Gamma, V-2, all at their best); `zero` for 6 to 10 is 0.675, 0.72, 0.63, 0.645, 0.6. `tools/leveltest.mjs` lists the men lost to the strongpoints.
- (sim: the pace of a career's day, 2026-11-02) `DirectorWW2.pace` (DESIGN.md "The day fitted to the lineup", Pace): with a lineup, a lull of 15 s with nothing in hand runs the day's clock on to the next order, attack or day end as a time lapse (`director.ahead`, `director.dayTime`, `sim.lapse`); `sim.time` never jumps. `DirectorWW1.update` ends a level's day on `dayTime`. Without a lineup nothing changes. Level test on 72 seeds: 92, 89, 93, 69, 58, 57, 36, 31, 21, 11 % (before 92, 89, 92, 71, 60, 53, 36, 31, 19, 10).
- (ui: the battery tabs, 2026-11-02) The type has its own line under the callsign (it shared one with the bars, and the longer German types ran under them); the mode sits beside the callsign; the bars have their own line and hover text. `common.js` `KIND_SHORT` and `ww1/ui.js` `SHORT` give every German type its designation (`15 cm sFH 13`, `21 cm Mörser 16`, `38 cm Langer Max`): two batteries never read alike.
- (menu: what to play, 2026-11-02) The menu offers three things: the open battle by threat level, five special missions and the basic training (DESIGN.md "What to play"). The campaign missions and the Nebelwerfer lesson are in no list (their code and URLs kept); the Gustav, Karl, V-1 and V-2 lessons are their missions' guided first runs; a special mission's first win pays RP (`specialBonus`, `completeSpecial`, save field `specials`). The chooser was rebuilt to a few words per view after game-menu guidance (two lines of 8 to 10 words, about four chunks a view, details on hover): a Helldivers-style row of ten threat steps with four facts and threat chips, picture cards for the special missions; the top bar's Battles, Campaign and Tutorials buttons are gone, its one button shows the choice and the go button says what it starts.
- (lessons: the Paris Gun's guided first run, 2026-11-02) `ww1/tutorial.js` `w-paris`, 11 short steps: the Stellungsbau (a gang on the bed, ALL HANDS), then one round (the charge set off the gauge by the lesson so the player matches it, TABLE, the load, the firing key, F, the agents' report, REPORT). `sim.newGame({ build })` (`sim.lessonBuild`): a scripted game whose Paris Gun starts in pieces. The Paris console tags its parts for the lesson (`drill tasks hurry next steps data charge table reportbtn guide targets`). `menuItems.js` `GUIDE['ww1:paris']`. Autoplayed three times: finished, nothing stalled, about 560 s of game time.
- (career: the higher lines gated, 2026-11-06) At the user's request a new career can research nothing above rank I: the lines that start higher (mortars, siege guns, railway guns, off-map support) open once a battery in the line beside them is researched, the tree's `via` (Mörser 99 via the sFH 13, Beta-Gerät via the Mörser 16, Langer Max via the K 16, Gotha strike via the schweres Wurfgerät 40). `LINES.de` reordered so each `via` is in the next column; the Research screen's locked heads read "◂ After the ..." pointing at it. A save that already researched a gated head keeps it; a research target now gated moves to the cheapest open battery, its RP kept. `tools/progressiontest.mjs` checks every `via` stands beside its line and that a new career can research nothing above rank I.
- (menu: the research tree drawn as War Thunder's, 2026-11-06) At the user's request the Research screen lays the tree out in horizontal rank bands (I to IV, labelled in a left gutter) with a column per line, and draws an arrow from each battery to what it opens: down its line, and across the column gap for a `via` (`menu.js` `treeArrows`). A locked card shows its RP cost (the reason in its hover text and on the battery's card); the tree scrolls sideways under 640 px; the Research layout gives the tree more width (1.8 : 1).
- (menu: the Research screen fits one screenful, 2026-11-06) At the user's request the screen is laid out for the common desktop sizes: no page heading (the top bar's tab names it), a strip with the research under way and one line of help, the tree in its own scrolling pane (line names sticky) taking most of the width, and the battery shown in a full-height side pane (`clamp(340px, 25vw, 450px)`) that scrolls on its own. `#menu.on-research` widens the column to 1,760 px and makes the menu a flex column so the screen takes whatever the top bar leaves (one row or two); the tree's rows follow the viewport height (`--rs-row`). At 1920x1080 the whole tree shows without scrolling; under 1000 px wide or 560 px high the screen flows down the page as before.
- (menu: Try it for the off-map weapons, 2026-11-06) The Paris Gun, V-1 and V-2 have no place on the test range (one gun in its pit); on Research and in the hangar their button reads "Try it · guided run" and opens their special mission's guided first run (`menu.js` `TRY_GUIDE`, the lesson from `menuItems.js` `GUIDE`). The Gotha strike keeps a disabled range button: it can only be called in an open battle.
- (ui: the message slips, 2026-11-06) At the user's request each slip in MESSAGES AND SIGNALS reads in the Smart Brevity order: a title row (the round, battery and gun of a report; an order's task name, `head` and `body` from `messages.js`; else the text before its first ': ' or '! ', `messagePad.js` `splitTitle`) with the time, the one line that matters at the card's full width (the pencilled correction with APPLY, ON TARGET, or the message), the observer's own words small under it (the English in brackets dropped when the note already says it), and the source and task in one line at the foot (all of it on hover). The tutorial tags `report` and `apply` are kept. The kind is the class `s-<kind>` (a bare `kill` took style.css's kill-feed rule: the slip laid out as a row, its message one letter wide, and faded out after 4 s).
- (threat levels: they end on their orders, 2026-11-10) At the user's request ("I don't want users stuck sitting around for x minutes per mission") no threat level ends on the clock. Each has `need` fire missions and `fails` allowed (`threat.js`); the orders done close the day, the attacks still owed come one after another, then a shorter day is won and a full one goes to X-Zeit; more than `fails` failed loses; running out of anything in reach closes the orders short (`ww1/director.js` `levelUpdate`, `close`, `nothingLeft`, `pace`, `goal`; DESIGN.md "Threat levels", Ending on the orders). Found on the way: on a level a silenced British battery's last guns kept firing and each Gegenbatterie on it was done at once, unfired (about fourteen free missions a game on level 3, most of what the old `need` 10 and 17 were met with); such sites are now `spent`, and the lineup's work asks `canOffer` so it no longer idles a battery on a site the level refuses (`sim/lineup.js` `pool`, also `noOrders` and a 15 s wait on a level with nothing in hand; `sim/specialists.js` the same 15 s and `pending()`; script entries keep their marks through `LineupDay.wrap`). A clock kept abreast of the orders done was tried and dropped: it brought the attacks and the counter-battery calls on faster than the crews work. `need`, `fails` and `zero` (5 to 10) tuned on 72 seeds to the old curve (Balance). The HUD's `#goal` box (`hud.setGoal`) and the menu's facts (Goal, Fails allowed, Attacks, Pay; Length is gone) show the orders; the levels' `sub` and `lines` say them. `tools/leveltest.mjs` prints the failures and how each game ended, and stops a game at two hours as unfinished. The British, WW2 and WW1 (no level) tests, `researchtest` and `supporttest` are bit-identical.
- (ui, sim: manual keeps the player's settings, 2026-11-10) At the user's request nothing changes the fuze or the guns selector behind the player's back on manual or hold: `Director.assign` picks the fuze (`defaultFuze`) only for a crew on auto, the `lay` command no longer resets it to instant, and the console's guns selector follows the mission only on auto (`console.js`, the mode in its key so a switch to auto snaps it back). Batteries start on instant, the concrete-breakers (Gustav, Karl, Bertha, Gamma, Beta-Gerät) on delay (`guns.js` `DELAY_START`), so the Gustav and Karl lessons' "the delay fuze is set" stays true. The British SOS lesson's shrapnel now stays set through the SOS (the SOS used to reset it to instant). `tools/simtest.mjs`'s scripted player sets each mission's fuze itself (`pickFuze`: the crew's choice), so its results are bit-identical; so are the British, WW2, WW1, level, research, support, gunner and range tests.
- (threat levels: missions, 2026-11-12) At the user's request ("continue on this epic", the objectives plan of 2026-10-29, after a game-design research pass) each battle at a threat level is one generated mission: `src/operation.js` `generateOperation(level, seed, batteries)` (archetypes, named main objectives and secondaries, the attacks' sectors, X-Zeit or not), `src/sim/objectives.js` `Objectives` (states judged from the game, pay, medals), `ww1/director.js` (`missionScript`, `objectiveMissions`, `levelUpdate`, `accomplish`, `callFinale`, `goal`), `threat.js` `mains`, `work`, `later`, `sides`, `xzeit` in place of `need`, `fails` 3 or 4. The user chose that the player calls the end once the mains are done (K or the HUD's button; X-Zeit as the finale), over the instant win of 2026-10-29. `sim.newGame({ opSeed })`, the game URL's `seed` (`menuItems.js hrefOf`). `capability.js` counts a ramp gun's re-lay error. `CrewsWW1.sosCalled` keeps a long gun or a heavy on a main's shoot. `EnemyWW1.supply` reads `director.trafficCut`. `research.js battleReward` returns `objectives` and pays `WIN_MISSION` on a mission. HUD `#objectives` (`hud.setObjectives`, `onFinale`) replaces `#goal` (`setGoal`). Every battle without a level is bit-identical (simtest, ww1test, ww2test, researchtest compared with the commit before).
- (threat levels: missions, phase 2, 2026-11-12) At the user's request ("focus on user played germany alone", no change to the British game) the missions get their moments and two new kinds, from the research pass: the duel, counter-preparation (an attack's men mass in their front line 180 s first; a quarter down calls it off) and targets of opportunity (a relief column halted on a road), as objectives of the moment (`Objectives.add`, `bonus`); the kite balloon over Ypres (`ops.js RIDGE_BALLOON`, `ww1/enemy.js BALLOON_K`) and the railway-gun hunt (G5 comes and goes, `present`; the sound rangers' fix firms with each round) as secondaries. `CrewsWW1` `prepCalled`, `huntCalled`, `callTo` (a battery on auto turns to a moment), `update` (the hunt left while the gun is away), `suits` (nothing to shoot at a withdrawn gun). `Director.release(u)` is the base's: the attack's going over is `goOver`. `ww1/enemy.js` skips a battery not `present`. HUD: △ for a moment with its timer, the duel's fix, counter-preparation's and the column's share down, the hunt's FIRING/away and fix. Every battle without a level is bit-identical (simtest, ww1test, ww2test, researchtest compared with the commit before).
- (threat levels: the kite balloon's winch, 2026-11-12) At the user's request ("does the balloon hunt target the balloon or the ground it's fixed to? ... almost always missed"; "fix it"): the balloon's mission is laid on its winch on the ground (`ww1/director.js siteMission`, HE, `ObserversWW1.refPoint`), near misses haul it down (`ww1/targets.js HAUL`, `haulK`, `downUntil`; the render lowers the envelope and shortens the cable about its foot, `models/t/ww1/british.js cableFoot`/`cableTop`), the winch wrecked brings it down (`checkDead`), its eyes only while it is up (`ww1/enemy.js`). `RIDGE_BALLOON` `r` 220: the bursts are matched to targets within r + 80 m of the site, so the winch was never hit. `CrewsWW1.suits`: any battery for the winch (the K 17 and C/92 rule only for a mission laid in the air). Shared code, the British game unchanged (simtest, ww1test, ww2test, researchtest identical): `sim/targets.js` applies its balloon envelope rule to `bballoon` too; `render/targets.js` draws a balloon's fall from its hauled-down height (0 for the 1917 balloon).
- (threat levels: the beat and the early start, 2026-11-12) At the user's request ("put in a proper delay for an early completion. so the user feels they accomplished something, and that the next is starting early. 5 sec most but probably like 3"): on a level a mission done holds anything new for 3 s (`ww1/director.js` `BEAT`, `beatAt`: `objectiveMissions`, `duelUpdate`, `popUpdate`, `sim/lineup.js` queue and work), an objective's mission done frees its place at once (`objAt`), and with nothing in hand the day runs on after 3.5 s (`LULL_LV`, was the WW2 rule's 15 s) in an even lapse of 1.25 s (`LAPSE_LV`; a further leg 0.25 s; `lapseTo`, `lapseRate`): the WW2 rule's rate, worked out again each step from what is left, slowed as it neared and took about 11 s at the old 10 s and 6 s at 1.5 s. After a mission done the radio says "Ahead of time" and `sim.events.ahead` (main: `hud.hint`) shows it; after one failed only the hours pass. `lineup.js IDLE_LEVEL` 5 s (was 15), counted from the director's `lullAt` and not while the clock runs. Measured: from a mission done with nothing else in hand to the next, 3 to 5 s. Found on the way: level 10's fifth attack could roll past 1849 s, where the day's clock waits for X-Zeit; it massed, never went over, and a lineup all on auto never called X-Zeit (one game in 72 ran to the two hours); `operation.js LAST_ATTACK` (1780 s) squeezes the gaps, `levelScript` skips one past it. Level test on 72 seeds: 97, 96, 94, 99, 81, 74, 50, 39, 39, 22 % (level 10 after the attack fix; before 97, 97, 92, 96, 79, 74, 56, 42, 35, 26). The British, WW1 (no level) and research tests are bit-identical to the last commit.
- (German console: batteries by name, 2026-11-12) At the user's request ("change the mission reports to use the name not model of the battery. so richard not 12cm sfh 13"): `ui/theatre.js` `TH.unitName` (null: the British words), set by `ww1/ui.js` and `ww2/ui.js` to the callsign. The message pad's fall-of-shot slips (`ui/messages.js` `battery`: "Round 2 · Richard", also "Select Richard to apply its correction"), the missions list's GUNS line and a mission another battery has taken (`missionList.js` `unitWord`, was "unit 28"). The British console unchanged.
- (German console: IDLE is a battery with no mission, 2026-11-12) At the user's request ("put an icon on a battery that has no mission in the batteries tab", then "lets take the icon away and have idle mean a battery has no mission its assigned to"): on the German battles (`TH.idleMission`, set by `ww1/ui.js` and `ww2/ui.js`) a tab's status line reads IDLE (`st-free`, brighter) whenever the battery has no `missionId`, whatever its guns hold (the pips show them), unless they are firing; an out-of-arc, out-of-range or too-close order still shows first, and no shells or no crew when the guns are empty. On a mission with no gun loading, laid or firing it reads STANDBY (the old IDLE). Each has a hover line. The British console and the special missions' drills keep IDLE as the guns' state.
- (render: a re-lay draws from the aim, 2026-11-13) At the user's request ("when a battery gets an aiming correction the gun should only alter itself from its current aim to the new. not reset then go to new"): a ready gun given a correction gets a short `'laying'` job whose step is named `lay`, like the loading cycle's last step, and `render/guns.js` `quickLoad` drew every `lay` step as rising from the loading elevation, so the barrel dropped to it and came back up. The quick-loading pose now applies only while the piece is `'loading'`; and `render/ramp_drill.js` keeps a ramp gun on its line through a re-lay (it swung back off it as if just rolled down the ramps). The sim was right all along: it slews from the current lay.
- (models: German breeches, 2026-11-13) At the user's request (a breech review against reference photos, then "fix all the breaches that are not correct and immediately recognizable as correct"): every German gun's breech except the Bertha, the Gustav, the Karl and the Beta (which matched their sources) was rebuilt against photographs (`refs/<kind>/photos`, new reference sheets for fk16, sfh93, rk92, k16, k38, bruno, k5, k12, m99, hm1, beta, wespe, hummel). The sliding-block guns get the rear wall that makes a German breech recognizable: the loading opening round on the bore and running out to the ring's left edge (a C seen from behind), the block's bright face and firing lock seen through it when shut, the dark chamber when open, the block leaving on the right, the ring a casting with rounded edges (FK 16, sFH 13, Mörser 16, K 17, K 16, leFH 18 and the Wespe, sFH 18 and the Hummel, K 18, Mörser 18, K 38, 35.5 cm H M1). The sFH 93 and the Mörser 99 have no separate ring (the barrel runs round to its face, the wedge slot cut into it), the C/92 a true Krupp Rundkeil. The railway guns' naval barrels get one smooth round ring with the wedge's slot cut through it and a C-shaped rear part (Langer Max, Paris Gun, Kurze Bruno, K 12; refs/max38/photos/17_Leugenboom_breech_ring.jpg), the K5 its plain cylinder with the keyhole opening. Shared parts in `src/models/v/de/common.js`: `keyholePlate`, `slotCaps`, `ringBand`, `castRing`, `slotBlock`. Every pivot, travel, anchor and drill constant is as before, except the `loadTray` pivot of the K 18 family, K 38 and H M1 (lower, its lip in the opening) and the new `rig.anchors.blockGrip` (the block's handle, which `render/crews.js` uses for the hands that work the block when a model names it: k18, mrs18, m16, k38, hm1). The H M1's crank sits on the ring, not the block (on the block it swept over the traverser's place), and the Langer Max's lanyard man steadies his left hand on the ring's rear face while he primes (`render/ww1/max38.js`).
- (crews: the audit's bodies and the named grips, 2026-11-13) At the user's request (German drills with "items floating, hands not connecting", "conflict with humans and other humans and gun parts" and "arms and legs not acting as if they have bones"): `tools/crewaudit.mjs` measures, besides clearance and motion, what each hand and prop touches (`render/crewcontact.js`: hands meant to hold something on nothing, props nothing bears) and the bodies (`render/crewbody.js`: joints past clinical ranges, limbs through the man's own body, men with their arms and hands into other men, the steel or the pit), with `--auto N` contact sheets of the worst moments. Fixed from it so far: the `lanyard` pose's right arm (its elbow pole is now in the turned chest's frame: it was a backwards chicken wing on 22 guns), the rammer's staff (held at rest in front of him by the hand on its side, in the stroke the hand on the staff's side forward: the arms crossed through his chest), the K5 family's hands on the staff's rolled cross handles, and the named grips: every German model but the Karl, the Gustav, the Bertha, the rockets and the V-weapons gives `rig.anchors.grips` for its layer and its second layer, elevating or traversing number, and `crews.js` stands the man at his grip (`GunCrew.gripPost`: behind a wheel along its axle, between two grips, or at the model's `post`), puts his hands on it whenever he is in the lay or operate pose (`GunCrew.workGrip`, from `Man.put`, so the drills need no change; a drill's own hands after it still win) and has him stand when it is out of reach (`gripNear`). `crews.js` also takes the model's `blockGrip` for the block man's hands. The audit's own fixes: a prop's shape is rebuilt when a drill adds parts to it, a gun part hidden at the start is steel while it is shown, a model whose builder throws is reported (it was measured as a stand-in).
- (crews: the shell pair, the Mörser 99, the Wurfgerät's party, 2026-11-14) Continuing the drill fixes from the audit: the German two-man shell carry (`crews.js` `pairMan`: K 18, Mörser 18, K 38, Mörser 16, Mörser 99) walks 0.35 m either side of the round (`pairW`; 0.42 left the far hand out of reach, so it went through the man's belly), carries it at the waist a quarter metre ahead of their hips with each man's near hand behind and far hand ahead, and lays it on the ground at the stack (it hovered 20 cm up); `snapPair` tries each place at the heading the pair will face from it (tried at the first place's heading, a pair moved aside turned on its new place and its outer man stood in the elevating number). The British pair is as before (`BRITISH`). A grip can name its pose (`common.js` `grip(..., { pose })`, `Man.put`): the Mörser 99's layer kneels at his elevating handwheel at knee height, both hands on the rim (the sight 1.2 m above it is out of reach from there), and its elevating number, who has no handwheel, stands by outside the relay's handspike work. The Wurfgerät 40's carrying party (`render/de/swg40.js` `timing`) lifts the first crate only when the last man is back from the slit trench after a ripple (`crews_rocket.js` `backAfter`): the farthest arrived as two men had laid it and joined with a jump; the trips and the layer's windows shorten to fit. The audit (`crewcheck.js`, `crewcontact.js`) samples each instance of an instanced mesh at its own matrix (the rocket batteries' crates and rockets, the self-propelled guns' running gear were steel at the template's place and nowhere else) and counts a model's own drill props named `shell-` as props (the carried crate, the rockets, the shell passed up into the Wespe and the Hummel were neither steel nor props, so the hands on them held nothing).
- (crews: the rammer teams and the K 12's pump, 2026-11-14) The railway guns' rammers (`de/k5.js`, `ww1/max38.js`, `rail_drill_de.js` for the Kurze Bruno and the K 12) each stand behind their own end of the staff's cross handle, 0.28 m back and turned a little in, the outboard hand near its end and the inboard one a shoulder's width in (`drill_pace.js` `barHand`, `RAM_BEHIND`, `RAM_TURN`): both sides had the right hand inboard (the right pair's arms crossed through their chests) and every man stood abreast of the handle with it at his chest. The handles are 2 m across (`BAR` 1.0, the K 12's and the Bruno's 0.95) and the hooks higher to stand them upright clear of the deck (`STAFF_REST.y`); the left pair face the wall to lift the staff off and walk behind their hands as it swings into line (`swingStand`). The Gamma's and the Beta's rammers stand 0.32 m off the staff turned toward it with both hands on it ahead (`RAM_LAT`, `RAM_IN`; the far hand reached back across the body), the rollers closer to the shell with both palms ahead on its flank. The heavies' German rammer team in `crews.js` (`ramMan`: H M1, K 18, Mörser 18, K 38, Mörser 16, Mörser 99) closes in and turns toward the staff in the same way, holds it only once it is in line and long enough to reach him (the ram pose held hands out at nothing while it swung in), and in a team of two the right-hand man works further back along it (`RAM_STAG`). The K 12's jack pump hangs low off the front subframe within reach from the ground (it sat 1.6 to 2.2 m up, the jack man pumping air under it): its lever is a pivot `pump` rocked by `rig.setPump(a)` (`rail_drill_de.js` `mechanisms`), its length `rig.pumpLen`, the jack man's hands on its handle.
- (ridge: positions off the trenches, the ramp guns' pits, 2026-11-14) At the user's request ("is siegfried sitting outside a trench like this accurate?", then "adjust forward batteries that need it and give them gun pits if they had them in real life"): every ridge position checked against `trenchlines.js` (trenches, roads, tracks) and moved where it stood on one (`ww1/ops.js`): the sFH 93 "Siegfried" (unit 29) from (6600, 700), on the German reserve trench, 450 m forward to (6150, 700), midway between the support and reserve lines and 340 m from any trench; the Wespe's Stellung B from (6250, -3000), on the reserve trench, to (6400, -3000); the Nebelwerfer 42 "Nebel" from (5900, -1600), 6 m from a communication trench, to (5900, -1675); the Karl's prepared Stellung B (`RIDGE_POSITIONS`) from (4500, -1300), 11 m from our front-line fire trench, to (4850, -1300), midway between the front and support lines; the K 17 "Cäsar"'s second gun from (3, 18) to (6, 22) off the battery so its pit clears the road between the two guns. Rule (RIDGE_MORE comment): every gun and position 40 m or more from a trench, its pit off the roads and tracks. The ramp guns without a recoil system (`sfh93`, `rk92`, `m99`) get 1918 pits (`gun_sites_ww1.js` PITS, `ww1/render.js` PITS): the walls round the model's own plank bed (`plat: null`, `arc: null`, `walk` where the duckboard starts), the rear radius over the bed's back corners, the side radius 0.4 m past the trail's end at full run back up the ramps and the arc's full 58 degrees, the net's poles in the breastwork, the ready rounds on the bed at the rig's shellStack anchor (`pile.y`); their pads grow to hold them (`ridgeWW2Pads`: sfh93 9 x 13, rk92 9 x 15, m99 10 x 15). Known: at the far ends of the 58 degree arc the C/92's and the Mörser 99's trails pass over that pile (the rig's pickup point, where the shells always were). `ww1_site_preview.js` takes `&rec=` (the run back) and lists every site.
- (dev: the frame recorder, 2026-11-14) At the user's request ("is there a way to have my game perf report to you while I play so you can see the spikes"): `src/perfrec.js`, loaded by main on the dev server only (`import.meta.env.DEV`; `?perf=0` off; under `navigator.webdriver` only with `?perf=1`; never in the build). Each drawn frame is timed by stage (`STAGES`: sun sim render mode world craters hooks camera terrain sky clouds fx flares weather post draw panel audio hud; `perf.mark` in `frame`), with its GPU time (`dynres.js` `tag` and `onGpu`: every timer query tagged with its frame), the sim events and what main's handler for each cost (timed in the `sim.events` wrapper), shells, particles, draw calls, triangles, new shader programs, geometries and textures. A frame over 25 ms and twice the last second's median is a spike: the 2 s before and 0.5 s after are written with the events, Chrome's long-animation-frame reports and the battle's state; a summary line every second. Lines go to `POST /__perf?s=<session>` (`vite.config.js` `perfLog`, `apply: 'serve'`), appended to `perf/<session>.jsonl` (gitignored), `perf/LATEST` naming the newest. `tools/perfwatch.mjs` follows the newest session and prints a line per spike (the next 10 s summed) and per slow stretch; `tools/perfreport.mjs [session]` sums one: minute by minute, the stages' means, spikes by cause (cpu, gpu, outside the frame, shaders), the stages and events round them, the worst. F3 shows the session's file.
- (career: the Gotha after the K 16, 2026-11-14) At the user's request ("the gotha strike isn't available until after you have a load of ww2 guns?"): the Gotha strike's `via` is the 15 cm K 16, no longer the schweres Wurfgerät 40 (whose line starts with the Nebelwerfer 41, so a 1917 bomber needed 1,250 RP of WW2 rocket launchers first). `LINES.de` moves the off-map column between the siege guns and the long-range guns so the `via` stands beside it (the K 16's arrows now go both ways: the Langer Max to the right, the Gotha to the left); the rockets are the last column. A career that already has the Gotha keeps it.
- (menu: a battery into a slot of its choosing, 2026-11-14) At the user's request ("add the ability to select a battery from the research menu and put it in a specific slot in the loadout to take to battle"): the Research screen has the hangar's slot bar along its bottom (`.rsv-bar`, the same `lineupSlots` and bench through `renderBar`), and the battery's card a lineup row (`lineupRow`: where it fights, Take into battle, Change slot, Leave out). Take into battle (or dragging a battery from the tree, or a slot's card onto another slot) sets `placing`: `markPlacing` lights the slots it can take, each tagged with what it would do (Put here: the row's first empty slot; Replace: the battery there leaves the lineup; Swap: one already in it changes places), mutes the rest out of the tab order and names the battery over the bar with Cancel (Esc, or a press elsewhere); the focus goes to the first lit slot, and on a page that scrolls the bar comes into sight. `Progression.placeLineup(kind, i)` puts it there (0-based in its row, the off-map row apart) and `slotOf(kind)` reads a battery's slot; afterwards a line over the bar says where it went and the slot is lit once. Slots on the map show their number, and the battle follows it: main's `FIELDED` is the lineup in slot order (keys 1 to 5, the first unit shown) and the Panel's tabs take that order (`opts.rank`); the sim's own unit order is unchanged. The tree marks a battery's slot in its corner. A drag only marks the bar (a render would take the dragged element out of the page and end the drag). `tools/progressiontest.mjs` checks `placeLineup`.
- (career: ranks as eras, 2026-11-14) At the user's request ("give me ideas on how to keep batteries of the same era together", "do option a", then "I don't necessarily want the ww2 guns to be more expensive than ww1 ... i want the siege guns to be hard to unlock because they are so powerful"): the German tree's ranks are eras as War Thunder's (`research.js`): I and II the 14 batteries of 1914 to 1918, III and IV the 18 of 1939 to 1945, every line in rank order (the Paris Gun now before the Kurze Bruno). The price is power alone, whatever the era (the costs as before, 61,200 RP in all; a first try priced by era, every WW2 battery dearer than any WW1 one, was dropped the same day). A rank opens with `RANK_GATE.de` batteries of the rank before (3, 3, 4), replacing the `via` links (the K 16 to the Gotha, the sFH 13 to the Mörser 99, the Mörser 16 to the Beta, the K 16 to the Langer Max), so the columns are free of them and run from the lines that open at rank I to the rockets, all of the second war. The second war opens with any three rank II batteries, so a career can go on to it without the siege guns; from threat level 6 the strongpoints (28 cm and up) then want a WW1 siege gun, the Langer Max or a WW2 super-heavy. `weight` keeps each battery's old weight class for the upgrade costs and the lineup picked for you. The Research screen shows a rank's era on hover (era headings over the ranks were tried and taken out the same day at the user's request), a shut rank shows its count under its numeral (2/3), a battery waiting on its rank reads "Rank II: 2 of 3 rank I", and an arrow is lit amber only into a battery that can be researched now. A save keeps everything it researched; a research target now shut moves to the cheapest open battery with its RP kept (`settle`). `tools/researchtest.mjs`'s `early` and `mid` lineups (ranks I and II) are now the 1914 to 1918 batteries.
- (models: the Hummel against photographs, 2026-11-14) At the user's request ("i dont think the hummel model is accurate. check with reference photos"): the Hummel's hull top, cab and fighting compartment rebuilt against photographs (`src/models/v/de/hummel.js`; refs/hummel, 39 Commons photos of the Saumur, Munster and Sinsheim vehicles, the manual's D 601+ plate and 1943 to 1944 Bundesarchiv views). The compartment now stands from the middle of the hull to just behind the idlers (rear plate at z = 3.1, was 2.9): a narrow sloped front face with the gun's opening, a facet either side widening upward, sides leaning in 4 degrees, 2.78 m high over the gun (was 2.45) and falling to 2.38 m at the rear plate, with the engine's louvre boxes at the sides' lower front. The late full-width cab sits over the first road wheel behind a long glacis that carries the folded travel lock (was on the cab roof). The trunnions moved to y = 2.48, z = 0.6 (were 2.30, -0.29): the bore lies just under the wall top with the recuperator over it and the breech at a standing man's chest, and the muzzle ends 0.43 m past the nose (was 1.37), as the side views show; the model is therefore about 6.5 m over the barrel, not the published 7.17 m, which the photographs do not bear out on a hull of this length. Sprocket and idler enlarged (radius 0.36 and 0.32 m). Rig contract unchanged (pivots, anchors, grips, `rig.spec` keys); the crew spots, `eye`, the ground stock and `rig.spec` moved with the gun and the rear plate, `plateTop` still 2.38. `sp_kit.js` and the Wespe untouched. crewaudit hummel, three scenarios summed, seconds past the glance threshold: hands 60.9 to 58.5, props 0.6 to 0.6, hits 0 to 0, self 0 to 0, joints 0.3 to 0.3. Left for later: fenders 0.1 m low, the rear plate's forward lean, the two round silencers of the late vehicle, the road wheel pitch (0.54 against about 0.5 m).
- (models: the Wespe against photographs, 2026-11-14) At the user's request ("do the same review on wespe that you did hummel") the Wespe was checked against photographs of the Saumur, Munster and Kubinka vehicles and wartime ones (refs/wespe, 34 exterior photographs added) and its upper works rebuilt in `models/v/de/wespe.js`; `sp_kit.js`, the gun and the breech are unchanged. Running gear: road wheels 0.6 m apart (were 0.7), three return rollers (were four), a plain 0.7 m sprocket, a painted spoked idler raised to 0.62 m. Hull: a nose plate and a long glacis up to a hull roof at 1.42 m, the driver's small tapered box standing out of the glacis left of the middle, the hull sides above the fenders 0.93 m from the centre line with two cooling louvres each (the old model had a flat deck at fender height with grilles on top and a square box). Compartment: walls on the hull sides, not on the fenders' edge, leaning in 7 degrees, two front plates leaning back either side of a slot that widens upward, a low collar on the roof, the top level at 2.30 m (was 1.97) as far as the gun and falling to 1.85 m at the rear, the rear flap at 1.80 m, a 0.25 m overhang past the hull's rear; the curved shield on the cradle went, a fixed inner shield stands behind the slot. The trunnions moved 0.3 m back (z 0.65, bore still 2.02 m), so the muzzle brake ends over the nose and the vehicle is 4.8 m long without a barrel overhang. Rig contract unchanged (pivots, anchors, grips, `rig.spec` keys); values that moved: the crew spots (officer 0.5, 1.3; layer -0.56, 1.1; loader -0.56, 2.08; shell 0.5, 1.95), `spec.plateTop` 1.80, `spec.inside.x` 0.46, the baskets 0.13 m further back. Departures kept for the crew: the photographs give a hull-side half width of 0.85 to 0.95 m and a lean of about 9 degrees, and below 0.93 m and 7 degrees the crew field finds the loader no place inside; the floor is one level, not the real well between sponsons; the rear is reconstructed (no photograph). `crewaudit wespe`: seconds past the glance thresholds 3.6 to 3.4 (hands), nothing into the steel past 8 cm before or after.
- (render: the warm-up draws the empty meshes, 2026-11-15) At the user's request (lag early in a level 6 ridge battle, read from `perf/`: 267 to 574 ms stalls outside the frame on the first look at the K 38 and the K 12 and on the K 38's first round): three.js skips a draw with no instances, so the warm-up never drew the meshes that start empty, and their first real draw (the first shell of each kind in flight, the first smoke, glow, debris, clods, flares, infantry, crater decals) was the browser's first too. `warmUp` now gives each one instance (or its whole draw range) for its draw and puts the count back: 216 instanced meshes and 7 instanced geometries in that battle. Not yet measured on the user's machine; the stalls on the first look at a battery came with nothing new on screen and may have another cause.
- (render: the K 38's crew without the garbage, 2026-11-15) At the user's request ("what lag do you see in the logs", then "yes to both"): the 30 to 130 ms frames in the render layer, every one with the K 38 selected, were garbage collections landing in its crew's code, which made about half of the battle's garbage (11.4 MB a second allocated in all, measured headless with V8's sampling heap profiler over the same battle). `GunCrew.snapPair` searched up to 3,600 places a call, four calls a frame, though the answer seldom changed (the tray's end is always 0.75 m out for the two-man carry): the answer is now kept per call site and given back while its inputs and the blockers within its reach are the same (`sameNear`), the same place as a new search (checked against the old search over 57,600 calls: no difference). `crewfield.js` uses `hyp` (a square root) for `Math.hypot` in its hot loops (`free`, `rAt`, the route's cell test, `closest`): V8 allocates an array per `Math.hypot` call. The K 38's crew went from 638 to 159 MB of garbage in two minutes of the battle, the battle from 11.4 to 8.9 MB a second. Left: the terrain's height lookups (`terrainHeight.js` `surface`, `natural`, about 2.4 MB a second) and `fx.update` (about 2.8 MB a second) make most of the rest.
- (render: the loading screen waits for the GPU, the recorder logs freezes, less garbage, 2026-11-15) At the user's request ("theres some more lags in my most recent playthrough", `perf/20261115-132100-3af3`: a 1.5 s frame as the battle opened; stalls of 1.5 s, about 3 s and 4.3 s in the battle with the page idle; two 40 to 54 ms frames in the render layer with the K 38 selected). The battle's first frame waited on the warm-up that `newBattle` had just drawn (the browser draws it later, in its GPU process; the atmosphere's readback in that frame waited for it): main now awaits `warmup.js` `gpuSettled` (a fence) between the battle's `start()` and `hideLoading()`. The stalls in the battle are not explained: nothing new was drawn in the frames before them and the page's own work was small. To tell them from the player switching windows, the recorder now writes a `gap` line for every gap over 0.5 s it leaves out of the frame times (`hidden`, `blur`, `focus`, the browser's long-animation-frame report), and a freeze with the window showing is also captured as a spike with the frames before it; `perfreport` lists the gaps (for older sessions, the seconds missing), `perfwatch` prints them. Garbage, measured headless as before (two minutes of the same battle, the K 38 selected): 7.0 to 5.9 MB a second. A regex literal is a new object each time it runs: `/^pair/` tested per man (`crews.js` `PAIR`), the ramp rammers' and heavy crews' role tests and the thousands separators (`common.js`, `board.js`) are made once. `GunCrew.blockers` fills its list in place and reads each field once (the crews' many object shapes send V8's reads through its generic path, which boxes each number: 780 to 408 bytes a call). `Level.setHole` compares the last hole number by number (it built a key string per level per frame), the crew voices count their lines once, the shell renderer walks an array of kinds, a dust puff that rides the ground looks it up again only after drifting 0.3 m (`fx.js` `hx`, `hz`), the Gustav site's works keep each point's ground height until a crater lands or the site moves, and `terrainHeight.js` `natural` calls `Math.hypot` only past 15,999 m, where its far hills start (the heights checked identical at 800,000 points, so the sim is unchanged). The crew audit for the K 38 and the Mörser 18 is byte-identical to before. Left: a terrain height lookup allocates about 456 bytes (the sampler's numbers boxed between its functions); most of the rest is the fx update, the board and the panel.
- (German console: the Godot demo's, and no auto mode, 2026-11-25) The German pages take the Godot demo's console (its commits of 2026-11-20 and 2026-11-24); the British game and the campaign missions are unchanged (UI, "The German pages' console"). **No auto mode in the German open battles** (main.js `NO_AUTO`: a theatre, no campaign mission, not the range, op kind 'battle'): `start()` puts every battery on manual and each waits for the player's orders. Only while the player serves a gun do the others fight on under their own crews, and they come back to the player's orders on leaving, laid where they stand; moving to a gun of another battery hands over the one left and takes back the one arrived at; any order, the Sperrfeuer included (`ww1/theatre.js`, `ww2/theatre.js` `sos`), takes a handed-over battery back. The gunner now hands a battery over through `sim/crews.js` `Crews.handOver(u)`, whose crew carries on the live mission (the Sperrfeuer, the Feuerwalze's line, fire for effect, ranging) where it used to drop it and pick afresh; `Gunner.hand`, `handedOver`, the radio lines on manning and leaving ("The gunner"). **The Sperrfeuer call nobody answers** (`common.js` `unanswered`, only with `TH.noAuto`): a red banner over the 3D view (`hud.js` `sosCall`, `#sos-call` in index.html, style.css), the console's slip flashing with a bell every 4 s (at most 12 a call), the sector chip blinking (`.fchip.call`); S answers it. **The lean console** (`TH.lean`, every German page but the campaign missions): no header (callsign plate, status line, mode switch, S.O.S. keys; S still calls the Sperrfeuer; A only where there is an auto mode); the status is a slip in the fire order shown only when it has something to say; the fire order keeps the target (name large, range and grid square), the charge (auto or set by you), rounds, fuze, guns and corrections, without the line, elevation, time of flight and the range table; the guns card is one line a gun under the fire order (lamp, state, the crew only when short, the wear only when worn, health, MAN/LEAVE); missions and messages share the bottom row; the correction keys have bold drawn arrows and the step key five dots; the board's bar is one line with no bearing; the tabs' ring shows nothing at the player's orders, C with its crew, H holding; no ALL AUTO / ALL MANUAL and no Shift+A (these three only in the open battles, `TH.noAuto`; the special missions keep A). The hold reason on a `metric` gun (`guns.js` `problem`) no longer names A or MANUAL, and the gun card at a gun says "at your orders" for manual. Basic training (`ww1/tutorial.js`): the header step is now about the tabs and the battery waiting for orders, the range table step is gone, the fire order and guns steps describe the new cards, and the leave step says the other batteries fight on while the player is at a gun. The special missions keep their starting modes and A (and Shift+A and the ALL pair), so a supporting battery or the Paris Gun can still be handed to its crew; the V-1 and V-2 launch console keeps its own header and A.
- (camera: the gun that fires next, 2026-11-25) Ported from the Godot battle (its `FocusUnit` and `NextGun`): on the German pages choosing a battery frames its gun that fires next instead of the battery's anchor (main.js `frameGun`, `nextGun`, `GUN_SIZE`, `gunSize`, `FRAME_GUN`; Camera, "Choosing a battery"). `nextGun` takes the first live gun that is ready, else one laying or loaded, else the one furthest through its loading cycle (`loadedBy`: `ji` plus the step's fraction), else No. 1, passing over a `blocked` gun while another can fire. The view is from the front-left quarter (0.9 rad round from the barrel's line as laid), pitch 0.18, the focus 1.3·k above the gun's ground and 10·k away, k the model's size corner to corner over the sFH 13's 7.5 m (the gun the Godot framing was set on), measured from each kind's first rig at barrel level (`GUN_SIZE`, visible meshes, instanced ones by their own boxes); further when the footprint seen from that quarter would not fit nine tenths of the half-width. It frames only on a choice (key, tab, C back, leaving a gun, battle start); the player's orbit and zoom stand between, the zoom glides on from an orbit's distance (`d0`), and `placeEye` keeps the focus on a gun that drives. Not on the title screen or at the V-1 and V-2 sites; when a mode layer frames (`modeR.framing`, the Gustav's tasks) the target goes back to the unit's anchor. The British game keeps its battery view.
- (crews: spaced, 2026-11-25) Ported from the Godot version's DrillSpacing, DrillStance and DrillGait (2026-11-24, measured there on the sFH 13, the Mörser 18, the Hummel and Bertha): the German crews are spaced (`src/render/crewspace.js`, `GunCrew.spacing`, never the British; Module contracts, "Crews"). After the drill puts each man, `Man.put` settles his place (`m.sp`: the drill's `rawX..rawH`, `sep` clear of the others and the steel, `off` taking up jumps, the stance's turn and step, the face-his-way turn) and fits his gait to the ground he covers. `Man.hand` only asks; `hands()` gives each hand its grip after the man's drill (uncrossed, let go and retaken in a hand's time, following the drill's eased weights); `Man.reach` is the IK call, which `crewcheck.js` now hooks instead of `Man.hand`. Departures from the Godot version, for this game's thirty-odd drills with teams on one staff, handle or roller: men with a hand on something fixed are at work (not pushed apart from each other, moving with what they hold, a jump only above 6 m/s), the hands follow the drill's eased weights, and the lost-grip rule is not ported (it left the railway guns' rammers with their hands in the air through the stroke). Also, spaced: props of a man gone from the gun are hidden (`dropped`); the staff is the first rammer's at the gun (none there, no staff, `crews_heavy.js` too), stood on its butt beside him on his side towards the bore, swung over max(1.05 s, 0.4 s a metre) starting before the stroke (`staffSwing`), the rammer going back only once it is up; the lanyard is drawn from the hand and falls free at the shot (`pullT`: the pull 0.16 s, was 0.06 s); the light guns' loader arrives as the barrel comes home (`loaderAt`); handwheel hands stay on their half of the rim (`rimNear`), and a layer with two wheels and one out of reach puts both hands on the other; the lay wheel stays where the laying left it. `de/wespe.js` `spLoader` reads `m.sp.rawX/rawZ/rawH`, not `m.x`, for the drill's own place. Measured with `node tools/crewaudit.mjs <the 27 German kinds> --scn 0 --json --brief`, seconds past a glance over all 27 drills, `shots/crewaudit-before-godotport.json` against `shots/crewaudit-godotport.json`: grip 222.2 to 205.1, props 6.9 to 7.7, hit 52.3 to 22.7, self 25.9 to 8.4, joint 22.7 to 6.5. Known regressions: props +0.8 s (loads shown a frame or three before the hands reach them); the Hummel layer's left hand cannot reach either handwheel from his post (20.5 s, needs the post or the grips moved in the model); Bertha's rammers 1.3 s worse under the uncross by angle.
- (render: lifelike crewmen, 2026-11-25) Ported from the Godot game's crew2 (Module contracts, "Lifelike crewmen (crew2)"), German pages only: `public/crew2/` holds its `assets/models/crew2` outfits (six .glb with their checks, `crew2.json`, `clips.json`, three skin pictures); `src/render/crew2/` ports its Clips (CrewAnimator, PoseLimits, PoseSettle, FootPlant) and Crew2/CrewFigure; the contract is the Godot `tools/blender/crew/README.md`. crew.js's figure is still posed by the drill; its mesh is hidden and `GunViews.crew2.sync` drives the lifelike body after each crew's drill. The figure gained `outfitName`, `armIk`, `reached` and `_poseT`. LOD0 to 30 m, LOD1 to 110 m, fine detail within 54 m; full animation within 110 m at crew level 2, every second frame beyond 54 m; LOD2 posed every second frame without hands and casting no shadow; men off-screen not posed; bones kept out of the scene graph. While they are on, `CrewHD` (the close tier at a gun served in person) is not used. main awaits `crew2.ready()` ("Dressing the crews") before compiling. `?crew2=0` gives the old figures, `?crew2=1` forces the lifelike ones; gear menu "Lifelike crewmen". A page loads its crews' outfits only: about 24 MB and about 415 MiB of textures on a 1917 page (720 MiB with all six). Measured cost: +0.35 ms CPU a frame with a battery's crews in view (worst 1.5 ms), draw calls the same in the usual view, triangles 3 to 4 % fewer there. Credits (README): the CMU motion capture acknowledgement, MakeHuman bodies (CC0, made with MPFB), cloth and leather from Poly Haven and ambientCG (CC0; the Godot project's `tools/blender/crew_src/SOURCES.md`). Not yet: the hangar's parade (still the old figures), the gunner's eye from the animator's head.
- (reports: crash and lag reports to Sentry, 2026-11-25) At the user's request ("sentry could fire when a lag spike is detected and say what caused it"; the browser version is the one to grow, so players' machines matter): Module contracts, "Crash and lag reports". New `src/reports.js`, `src/telemetry.js`, `src/perfcause.js` (`analyse` and `describe` moved out of `tools/perfreport.mjs`, its report unchanged); `perfrec.js` takes `post` and `onLine`, keeps `hist` and has `drain()`; `gpu.js` exports `gpuInfo`; main makes the recorder in the build when reports run; the switch in the menu footer and the gear menu; `vite.config.js` names the release and uploads source maps with a token. Runtime dependency `@sentry/browser` (about 36 kB gzipped, its own chunk, loaded beside the page); dev dependency `@sentry/bundler-plugins`.
- (render: the gunner's eye on the lifelike crewman, 2026-11-25) Ported from the Godot game's `CrewFigure.Eye`: with crew2 on, the first-person eye is the head's joint as the animator posed the man this frame, 0.063 m ahead and 0.075 m above (`render/crew2/index.js` `Man2.eye`, called by `render/crews.js` `GunCrew.eye`; the old figure's neck rule without crew2); the man at the player's post is posed in full every frame, in view or not. Measured on the range over an sFH 13 cycle: the eye 5 to 7 cm from the old one, no frame read before its pose, the view's motion above about 3 Hz 3.2 mm RMS against 2.3 with the old figure (no extra damping). Fixed on the way: `GunCrew.makeField` put the rig back at its place before `gripPost` read the grips' world matrices as root space, so a layer at a named handwheel had the wheel's map position for his home and walked kilometres off whenever he laid (since 2026-11-14), the gunner's view at the layer's post with him; the rig now stays at rest through the men's places.
- (menu: the lifelike crewmen on parade, 2026-11-25) As the Godot game's hangar (its commit 96d3948): the hangar's German dress is worn by the lifelike crewmen (Module contracts, "Lifelike crewmen (crew2)", "The hangar's parade"). New `render/crew2/files.js` (`Crew2Files`, `OUTFITS`, `standsInZero`: the loading `index.js` had, shared, without `shaderlib.js`; `index.js` `_load` now goes through it with `patch` for the fog, nothing else changed in battle) and `render/crew2/parade.js` (`ParadeCrew2`, `ParadeMen`). `ui/hangar.js`: `men(list, c2)`, a `draw()` for every frame (the men's lods, the shadow's stand-ins), `shadowMap.autoUpdate` false with `needsUpdate` from `light()` and the cover's toggle in `look()`, `bestView` rays through the stand-ins (`userData.ray`, `noRay`), `CREW2` (`?crew2=0`), the parade's `men2` (`park.men2.stats`).
- (sim: ranging counter-battery, a prototype behind `?cb=ranging`, 2026-11-25) At the user's request (past the easy levels, staying alive under the British counter-battery fire should be half the game): "Ranging counter-battery (prototype, `?cb=ranging`)" above. `sim.newGame({ cbModel })` and `sim.cbModel`; the command `cover`, `unit.cover`, `unit.manAt`, `guns.js` `setCover` and `COVER`, two reasons in `problem()`; `src/ww1/enemy.js` `RANGING`, `rangingUpdate`, `threatOn`, `britName`, the events `cbStage` and `cover`, `target.rangers`; `src/ww1/director.js` `rangersUpdate`, `rangersMission`, `rangersFix` (and no `watchBatteries` calls, nor a lull held by a rangers' mission nobody took, with the flag). Without the flag nothing changes: the British, WW1 and level tests give the same output as before. Departures from the first plan: the Gegenbatterie mission is offered only while the battery has one of ours under its fire (every round it fires still tightens the fix, so a battery that harassed first is placed at its first round on us); a battery the level counts as silenced (half its guns out) engages no more; the stages follow the fall of the rounds, so an engagement is unknown until its first round lands; the bracket stands 0.6 of a gap. Measured on level 5 (12 seeds, all auto): 4.6 guns lost of 12 against 3.9 today, in 8 fires for effect; with cover taken at the bracket 2.8 guns and 2 men against 14.
- (HUD: the objectives list's wait notes, 2026-11-26) The user saw objectives announced with no fire mission to take ("blow up the HQ to reduce attacks, but no mission"): the director opens them one at a time (`SPACING`, `MAIN_LIVE`, the secondaries after 90 s, `REOPEN`). `ww1/director.js` `objectiveWaits` plays that schedule forward read-only, `goal()` items carry `wait`, `hud.js` shows "mission in m:ss", "queued" or "waits for traffic" (italic, `#ob-list li.waiting`) with the reason on hover. The battle is unchanged (leveltest identical). Planned with the threat levels' retune: drop the staggering, so every objective shown has its mission.
- (German console: no charge control, 2026-11-26) At the user's request the lean fire order card loses its CHARGE stepper (`orderCard.js`: the rounds stepper alone in its row, `.frow3.lean`, the DECKUNG key of the `?cb=ranging` prototype at the row's right) and Q and E do nothing on the German pages (`console.js` act 'charge'), except the Paris Gun's LADUNG, which its card takes first (`special.route`). The charge stays the crews' (`order.chargeAuto`, set again by every laying and mission). The basic training's fire order text no longer names it.
- (levels: the difficulty rework, holds and two-step objectives, 2026-11-26) For landing and keeping players (the user lost interest in playing it fairly quickly; a browser session is 11 to 20 minutes, and level 1 took 13 minutes, levels 3 to 10 23 to 34): "Threat levels" (the shape, the bands, the level table) and "Missions" (Holds, Two-step objectives). `threat.js`: new fields `minutes`, `fresh`, `quick` (levels 1 to 3), `hold`, `trace`; `mains` 1, 1, 1, 2, 2, 2, 2, 2, 3, 3 and `sides` 0, 1, 1, 1, 2, 2, 2, 2, 3, 3; `sub`, `lines` and `fits` rewritten. `operation.js`: objective kinds `hold` and `trace` (`title`/`short` get the candidate as a third argument, `why`/`done` may be functions of it), `HOLD_PLACES` (X1, R1, the assembly areas behind sectors A to D), the attacks scheduled from `minutes`. `sim/objectives.js`: a hold's `held`, `lastHit`, `running`; a trace's `step`, `ready`, `openAt`, `fix` and `advance(o)`; `ofTarget` and `openTargets()` skip an objective not `ready`. `ww1/director.js`: the staggering of the objectives' missions removed (`MAIN_LIVE`, `SPACING`, the secondaries' 90 s and `objAt`: every open objective has its mission at once; `objectiveWaits` no longer says 'queued'), `holdUpdate` (`HOLD_CUT` 600 s), `traceUpdate` (`TRACE.loose` 300 s), `t.mustEngage` set at `reset` on every trace battery, the crews' `ai.skip` cleared for holds and mains, `lv.calledAt`; a duel is no longer offered on a battery an open objective already has (it made a new Gegenbatterie mission every step, re-tagged to the main: 68 open missions on F2 in 3 s on level 3, seed 1). `hud.js`: the hold's and the trace's notes; `style.css` `#ob-list li.holding` and `.paused`; `board.js` draws a hold's radius as a dashed ochre ring with its clock as an arc. `tools/leveltest.mjs`: `--cb`, the `human` length proxy (mean and median beside `minutes`), the mains done's median, holds and traces done. Measured (72 seeds, all auto, reference lineups, after the second tuning pass and the stall fixes): 100, 100, 100, 100, 72, 56, 56, 43, 36, 28 % won, human proxy medians 5.6, 4.2, 7.3, 9.4, 15.8, 16.4, 18.3, 18.4, 20.9, 20.9 min. Unchanged: simtest and ww1test without a level.
- (sim: the ranging counter-battery the levels' default, the crews' own cover, 2026-11-26) The prototype of 2026-11-25 becomes the British fire on every level battle ("Ranging counter-battery"; `?cb=old` and `cbModel: 'old'` give the old fire). `src/ww1/enemy.js` `RANGING`: per level `from` (in place of `heavies` for this fire), `batteries`, `perUnit`, `open` and `every` (the opening's sure engagement on our busiest battery, `busy`, `fly`, the lightest kind's fallback), `gapK` and `wait`, `rounds` (in place of `corr`), `salvos`, `share`, `sigma`, `shift` (levels 9 and 10), `must` (`t.mustEngage`, `mustUpdate`), `rangers.err`, `k`, `min` per level; the fire for effect cut short on a battery gone silent, the check round after `rest`, `dangerOn(u, ffeOnly)`, `cbStats` `shifts`, `cut`, `firstRound`, `firstFall`, `firstFfe` (and `toFfe` from the first ranging round). `sim/guns.js` `COVER.gun` 0.5 (a near miss on a gun in cover does half its damage; the DECKUNG key's hover, `orderCard.js`, says so); `sim/crews.js` passes over a unit in cover or running back; `ww1/crews.js` `CREW_COVER` and `coverUpdate` (the crews on auto take cover by their own, imperfect rule; `sim.crews.cover = false` off); `sim.js` `newGame({ cbModel })` defaults to 'ranging' on a level battle. `tools/cbtest.mjs`: `--cb old|ranging` (default the levels'), `--policy auto|none|cover` (auto the crews' own, the default), `--lineup`, `--levels` default 1 to 10, the opening's table. Identity: simtest, ww1test and ww2test as before (the timing column aside); leveltest and cbtest numbers change with the default. Measured (12 seeds, before the levels' tuning pass): level 1 a scare that costs nothing (the first fire for effect at about 2.3 min), guns lost of the lineup's from level 6, 7.2 of 15 at level 10 with the crews' own cover against 8.8 without.
- (career: first wins, the overmatch cut, the top part gate, lent batteries, 2026-11-26) The climb's pay ("Research and upgrades", docs/PROGRESSION.md): `research.js` `firstWinRP(n)` (a level's victory paid again, once: 250 to 1,000 RP), `OVERMATCH` and `overmatchCut` (×0.75 three levels under the lineup's rating, ×0.5 four or more), `TOP_PART_WIN` 6 (the third level of every part opens with a win at level 6 or higher), `lentKey` and `battleReward(sim, { won, cut })` (the cut on the level's pay; a lent battery's credit under `lent:<kind>`: research points, no battery points). `progression.js`: the save's `wins` (backward compatible, cleared by `reset`), `wonLevel`, `levelWins`, `firstWinBonus`, `overmatch`, `rating` (`Progression.rater`, capability.js `recommendedLevel`, loaded late so the loading screen never waits), `partGate`, `topPartsOpen`. `ui/menu.js`: the level card opens on the lineup's rating until a level is picked, ticks the levels won, shows "New <fresh>", Length, the first win's bonus and the cut; the modifications row says WIN A LEVEL 6 BATTLE on a gated part. Measured: a level 1 win pays 450 to 520 RP before the bonus; on the default research targets, winning levels 1 to 4 once and then level 4 again, 14 batteries in 10 battles with the bonus (12 without; two after the first four-minute battle). `node tools/progressiontest.mjs` extended and passing; ww1test identical.
- (first run: the lent Langer Max, the coach, the invite after the first win, the end card's Next, the funnel, 2026-11-26) For players landing from a link ("First run"): new `src/firstrun.js` (the record `drumfire.firstrun`, the first battle's rule, `battleLevels`, the `Coach`, `milestone`). `main.js`: `FIRST`, `LENT` (the Langer Max lent at its best for a new career's first battle at level 1, after the lineup's keys, the page opening on it, loaded at the start so its first shot comes about 25 s in instead of 74 s, its pay to research only via `owed()`), `CB_MODEL` (the raw `?cb=` passed through), `sim.payCut` and `payK`, `career.wonLevel` before `payOut`, the coach's host and its stand-in for the bracket hint (`speaksFor`), the funnel's milestones and `battle.end`, the summary's Next, Try again and Main menu, and the training invite on a battle page only when it was opened from outside the game (`fromOutside`). `ui/invite.js`: shown only after the first win (`firstWin()`), kicker "Learn the whole drill". `ui/summary.js` and `summary.css`: actions with `sub` and `title`, the first win's row, the cut's note. `ui/loading.js` and the menu's level card deal the briefing's mission from `battleLevels`, so it matches the battle with the lent gun. `telemetry.js`: `count` and `distribution` for the game's events. Checked headless with a fresh profile: the shared link straight into the first battle, Victory at about 3 min, the summary's Next to level 2 with the first win's 250 RP, no battery points for the lent gun.
- (levels: the battles that never ended, the safety net, 2026-11-26) A chain of bugs let a level battle stall for ever (level 2 seed 35: 7 battles in 720 never ended): a shrapnel round left in the breech from a Sperrfeuer burst over the target at its time and read "on target" with the gun 330 m over; fire for effect is never observed; old reports read as new when a crew took a mission up again, and corrections from reports of earlier lays were applied again (the aim ran 900 m off); the observer stopped reading rounds laid more than 400 m from the mission's point; a main naming two targets was judged on its first only; and a rangers' mission adopted by a main has no deadline, so nothing ever failed. Fixed, all gated on `sim.level` (simtest, ww2test and ww1test identical to before): `sim/observers.js` `fallPoint` for airbursts and the `near` rule, `fired` and `aim` on the reports (also `ww2/observers.js`; `sim.js` passes `air` to `onBurst`); `ww1/crews.js` the level crews' `pick`, `await` (`since`), `effectUpdate` and `handOver`; `sim/objectives.js` every target of a main counts (`left`, `out`, `o.gone`) and a handed-on objective is paid for our share; `ww1/director.js` one mission per target, the VB by night for the objectives' missions, and the safety net (`STALL`, `stallUpdate`, `handOn`, `neighbourFire`, `nbrUpdate`, the Nachbargruppe's radio line; "Missions", "Threat levels" "Reading the fall on a level"). `tools/leveltest.mjs` stages every pad and prints the safety net; its `--cb old` now reaches the sim; cbtest stages every pad too. `threat.js` level 2 `work` back to 1.3 (one target: with every target counting, two made level 2 about 13 min against its 7). Measured (leveltest 1 to 72, all levels, all auto): no battle unfinished (7 of 720 before), the safety net in 4 of 720 (a deep strike by night, a map shoot by design; three two-step mains' dumps for a leFH 18 near its longest range); the won rates rose on the higher levels (the crews now hit). The final numbers, after a second tuning pass on levels 5 to 10 (`zero` up on 6, 8, 9 and 10; level 8's hold 270 s): 100, 100, 100, 100, 72, 56, 56, 43, 36, 28 % won.
- (first run: the loan taken out, the training invite restored, 2026-11-26) A design reversal the same day, at the user's word: "why would we give them a siege gun right up front? we need to make sure the progression mechanism is well respected" and "my designed good first impression is the tutorial where you get to use late game impressive guns". The career's first battle lends nothing ("First run"): main.js `LENT` and `firstrun.js` `lentKind`, `LENT_KIND`, `LENT_LEVELS` and `battleLevels` are gone (`isFirstBattle` stays, with a comment on why the loan was taken out); the first battle is level 1 with the career's own lineup, its guns standing loaded (main.js `FIRST`: every idle piece of the fielded units loaded and 'ready', one HE taken), so the first shot comes as soon as a mission is taken and laid. `ui/loading.js` and the menu's level card brief from `lineupLevels('de')` again. `ui/invite.js` is back to its committed version (every menu load until the lesson is finished or Stop reminding me, no first-win condition, the old wording); main.js keeps the invite on a career battle page opened from outside the game (`fromOutside()`), not when the game opened the page itself. The coach runs only for a player who has not finished the basic training (main.js reads `LESSONS_KEY` 'training'): the fallback for those who skip it. `research.js`'s lent-unit pay rule (`u.lent`, `lent:<kind>`) stays as a generic rule; no battle lends one today.
- (sim: the counter-battery fire answers ours, 2026-11-26) The user started a new career and took 18-pounder fire before
  firing a round: the opening engaged our busiest battery "loud or not", from the map while none had fired. Now nothing of
  theirs fires on our guns before our first round (`ww1/enemy.js` `firstShotAt`, `RANGING.after`: the opening and the
  flagged batteries `after` s past it at the soonest, the existing `open` draw placed in that range, no draw more). Level 1:
  no round at our gun in 4 minutes without firing; with our first round at about 71 s, theirs at 103 to 116 s. ww1test
  without a level unchanged.
- (missions: the mission named for what it deals, 2026-11-26) The user's level 1 battle was named "Tankabwehr (Their tanks)"
  and dealt only an 18-pounder battery: an archetype was dealt when any of its main kinds fitted (`operation.js`), and
  level 1 has no laagers. Now an archetype is dealt when its defining main kind (its first) fits, the old rule only as a
  fallback; and when the hold and the two-step main fill every main, the mission is named for them (a battery to find:
  Gegenbatterie; a road or the railhead held: Nachschub; an assembly area: Führung), its secondaries following. Over 300
  seeds a level, every mission now deals at least one main of its name's kind (before: 159 on level 3, 148 on level 7,
  all 300 on level 8 did not). Level 1 now deals Gegenbatterie only, level 8 Gegenbatterie only (its two-step main first).
  Measured with the counter-battery waiting for our first round as well (72 seeds, all auto): 100, 100, 100, 100, 72, 57,
  56, 40, 38, 25 % won, human proxy medians 5.1, 4.5, 7.2, 9.4, 15.8, 16.3, 19.8, 18.5, 20.9, 21.5 min, none unfinished,
  the safety net in 9 of 720 (the table in "Threat levels" is the run before, within a point or two).
- (career: the starting C/92 with two guns of four, 2026-11-26) The user found level 1 slow and repetitive with one C/92 gun: "one shot at a time was repetitive", "1 ww1 gun firing doesn't seem to do much". The C/92's battery has four pits (`ww1/ops.js`, the first two where they stood), a career starts with two guns (`progression.js` `START_GUNS`, `startGuns()`: a save with fewer is brought up to them, on load and on Reset), so two stay to earn (240 and 360 battery points). `capability.js` REFERENCE: level 1 the C/92 with two guns, level 2 three, level 3 three and the FK 16 battery; the `fits` lines follow. Measured before (level 1, 24 seeds, crews on auto): one gun 5.1 min median to the main done (worst 10.6), two guns 4.6 (worst 7.3); an FK 16 gun beside the one C/92 made it slower (6.4: its 7.7 cm shell kills within about 12 m, too little for gun pits).
- (career: the ramp guns cut, the FK 16 and the sFH 13 to start, 2026-11-26) The user: "cut the ramp guns. record it that if we want to bring them back what commit has them." **Restore point: commit 1dd259b** ("Send crash and lag reports to Sentry", 2026-11-25), where the three ramp guns without a recoil system are whole and in play: the 15 cm Ringkanone C/92 (`rk92`, ridge unit 28 "Richard", the career's starter since 2026-11-01), the 15 cm sFH 93 (`sfh93`, unit 29 "Siegfried") and the 21 cm Mörser 99 (`m99`, unit 16 "Paula"); they came in with commit 8937c91 (2026-11-01). Out of the game: their `TREES.de` nodes (the field line is now FK 16 -> sFH 13 -> leFH 18, the long guns start at the K 17, 350 RP, the mortars at the Mörser 16, 900 RP, rank II), their `RIDGE_MORE` units and pad sizes (`ww1/ops.js`), `campaign-data.js` `BATTERIES` rows, `research.js` `DETACHMENT`, `capability.js` `BARRAGE`, `ww1/director.js` `FEUERWALZE` and `GUNS_SHRAPNEL`, `ww1/crews.js` (`HEAVY`, `LONG`, `FIELD`, the balloon's and the columns' suits, the dumps and tanks), `ww1/ui.js` console rows and short names, `ww2/gunner.js` `MANNABLE`, the menu's stills (`menuItems.js` `STILLS`, `public/menu/{rk92,sfh93,m99}.jpg` deleted) and the hangar's fallback, the tools (`menushots`, `gunnertest`, `cbtest`'s example, the crewaudit list in CLAUDE.md and docs/DEVELOPMENT.md). Dormant, kept in the tree unreachable (each with a note at its top or beside it; a later cleanup can delete them): the models `models/v/de/{rk92,sfh93,m99}.js`, the drills `render/ramp_drill.js` and `render/ww1/{rk92,sfh93,m99}.js`, their `GUNS`/`SHELLS`/`FFE` rows in `tables_ww1.js` (with `runback` and the 'relay' step; `guns.js` and `capability.js` still read `runback`), and the per-kind lookups that only draw or sound a gun (`models/guns.js` registry, `models/shells.js`, `models/v/de/gun_sites_ww1.js` pits, `render/guns.js`, `ww1/render.js` `PITS`, `ww2/gunnerView.js` posts, `ww2/voices.js`, `audio.js` `KIND_CAL`, main.js's view and net tables) and the dev viewers. The user's next word (through the lead): a career starts with **both the FK 16 and the sFH 13, two guns of four each**: `research.js` `START_KINDS = { '1917': ['bl6'], de: ['fk16', 'sfh13'] }` and `isStartKind`, both nodes cost 0; `Progression.isStart` follows the list (it was "a root with cost 0"), and with it `owns`, the lineup picked for you (sFH 13, FK 16), the hangar and the Research screen; `START_GUNS = { fk16: 2, sfh13: 2 }` moved to research.js (progression.js re-exports it). Rank I is now the two starters and the K 17; `RANK_GATE.de[2]` stays 3, so rank II opens with the K 17 (the default target, 350 RP: a level 1 win with its first-win bonus pays about 950, so the first battle researches it and opens a rank); 2 would have opened rank II from the start. Saves (`progression.js`, mark `START` 3): `REMOVED` gives back the RP put into the sFH 93 (350) and the Mörser 99 (600); `NOW_FREE` the RP a save marked below 3 put into the FK 16 (300) and the sFH 13 (450); `CUT` sends a cut battery's battery points and what its upgrades cost to its heir (sFH 93 and C/92 to the sFH 13, Mörser 99 to the Mörser 16), the C/92's guns and parts to the sFH 13 themselves (the higher of the two per part, the lower's cost as points) with its lineup slot (a lineup left empty fields the sFH 13); a starter's guns bought before `START_GUNS` come back as points; the K 17 careers (`OLD_START`) keep their K 17. Threat levels: `capability.js` `REFERENCE` level 1 FK 16 and sFH 13 two guns each, level 2 the same and a K 17, level 3 the same, a K 17 and a K 16 (what the first battles buy: about 700 RP and 80 to 100 battery points a battery a battle, so a third gun, 240, waits; the lead's richer suggestion, three guns each at 2 and four each and a K 17 at 3, measured too); `threat.js` `fits` follow; level 1 gets a short secondary hold for the FK 16, `hold: { need: 60, r: 220, g: 45, k: 1, main: 0, side: true, at: ['X1'] }` (Hellfire Corner, 5.3 km from its pits), `sides` 1, its `sub` and `lines`; `operation.js` deals a level's `hold.at` places first. Measured (72 seeds, all auto): levels 1 to 3 won 72, 72, 72, the human proxy's median 3.0, 4.0, 5.7 min (mean 3.3, 6.5, 6.2; targets 4, 7, 9), level 1's hold done in all 72; the first battle (level 1, the new career's lineup, guns standing loaded) the main at a median 3.0 min, the hold at 1.7. `tools/progressiontest.mjs` rewritten for the starters, the tree and the migration (C/92, sFH 93, Mörser 99, the starters' RP and guns, once only); ww1test, simtest and ww2test unchanged but for timing.
- (career: the tree cut to 20 batteries, the Gamma merged into Bertha, 2026-11-26) After a review of every battery against the new start (each should be a step up in something the open battle asks for), the user: "ok lets do what you suggest. like the roller guns recording it so if we want them back we know where to look". **Restore point: commit 1dd259b** (2026-11-25), where every battery below is in the tree and in play. Out of `research.js` `TREES.de` (each listed in `OUT_OF_TREE` with its cost, weight, line and heir): the **schweres Wurfgerät 40** (`swg40`: its 1.9 km reached nothing but the forward posts made for it; ridge unit 27, `RIDGE_MORE`; the posts P3 and P4, `RIDGE_FORWARD` and `FORWARD_KINDS` in ww1/ops.js and ww1Theatre; `models/v/de/swg40.js`, `render/de/swg40.js`, its `tables_ww2.js` rows, the rocket kits and voices it shared), the **35.5 cm H M1** (`hm1`: a ±30 degree arc that missed most targets from its pit; unit 20; `models/v/de/hm1.js`, `render/de/hm1.js`), the **21 cm K 12** (`k12`: the slowest gun on the map to effect; unit 23 and its lead-track pad; `models/v/de/k12.js`, `render/de/k12.js`, `railway_kit.js`, `rail_drill_de.js`), the **28 cm Kurze Bruno** (`bruno`: a step back from the Langer Max in every figure; unit 21 and its lead-track pad; `models/v/de/bruno.js`, `render/de/bruno.js`, the same rail kits), the **28 cm K5** (`k5`: a Langer Max with a third of the shell; unit 22 and its approach-spur pad; `models/v/de/k5.js`, `render/de/k5.js`) and the **10.5 cm Wespe** (`wespe`: the leFH 18's shell after the sFH 18; unit 24; `models/v/de/wespe.js`, `render/de/wespe.js`, `sp_kit.js` still the Hummel's); out of their per-kind sets (`ww1/crews.js` SUPER, HEAVY, RAIL, ROCKETS, TRAFFIC, SOFT_ONLY, FIELD and the suits, `ww1/director.js` FEUERWALZE and GUNS_SHRAPNEL, `ww1/ops.js` SUPER_WW1 and the pad sizes, `capability.js` BARRAGE, `ww2/gunner.js` MANNABLE and DRIVEN, `ui/consoles/common.js` KINDS and KIND_SHORT, `campaign-data.js` BATTERIES, `research.js` DETACHMENT, `menuItems.js` STILLS with `public/menu/{swg40,hm1,k12,bruno,k5,wespe}.jpg` deleted, `tools/menushots.mjs`, `tools/gunnertest.mjs`, the crewaudit list); their GUNS, SHELLS and FFE rows, models and drills dormant in the tree (a note at the top of each file and beside each table row), with the lookups that only draw or sound a gun (`models/guns.js`, `models/shells.js`, `render/guns.js`, `ui/hangar.js`, `ww2/render.js`, `ww2/gunnerView.js`, `ww2/voices.js`, `audio.js`, main.js's tables, the dev viewers). Out of the tree only, their own missions exactly as they were: the **Paris Gun** (`paris`, op `paris` in ww1/ops.js, `ww1/paris.js`, its models and console) and the **V-1** (`v1`, op `v1` in ww2/ops.js, `ww2/special.js`, `launch.js`); both stay off-map weapons (`isOffmap` reads `OUT_OF_TREE`) and keep their first-win bonuses (`specialBonus`, `missionBonus` read their old costs, 2,000 and 1,500), their `SUPPORT` entries dormant. **Merged:** the **Gamma** (`gamma`) leaves the tree for **Bertha**, which takes its place and price (after the Beta-Gerät, 2,400 RP, 2,800 before; the Karl after it): Bertha is twice as quick to effect with half again the shells; the Gamma stays in the 1918 sandbox battle (ridge unit 6) with everything it had. The lines now: FK 16, sFH 13, leFH 18, sFH 18, Hummel; K 17, K 16, K 18, K 38; Langer Max, Gustav; Mörser 16, Mörser 18; Beta-Gerät, Bertha, Karl; Nebelwerfer 41, Nebelwerfer 42; Gotha strike, V-2 (ranks 3, 6, 6, 5; `RANK_GATE.de` unchanged, 3, 3 and 4; 34,000 RP to the end, 59,500 before). **Fixes** the review found: (1) `capability.js` `inArc`: a site outside the arc a gun lays on from its pit is 'no' (no arc for a bed relaid, the Karl, a self-propelled hull); (2) a rocket launcher timed per ripple of `salvo.n` in `batteryVerdict` and counted so in `firepower` (the NbW 41 was 'no' on a dump it destroys in three minutes); (3) the career's Gustav stands 900 m further east (`RIDGE_WW2` P(14400, 600), P(13500, 600) before and still on the WW2 map), so the strongpoints, 9.7 km from the old spot, lie 10.6 to 10.8 km off, past its 10.2 km minimum and within its 18 degree arc; (4) Bertha's lowest elevation 13 degrees (20 before, `tables_ww2.js`), its first charge's minimum range 3.75 km (5.3), so lane B's strongpoints, 4.3 and 4.7 km from its bed, are in reach (the table, not the bed: the 1918 battle's Bertha stands where it stood, and ww1test is unchanged); (5) the off-map line runs Gotha strike, then V-2, the V-2's `SUPPORT` retuned (prep 120 s, reload 480 s, spread 35 m; 170, 780, 80 before): one strike in 3.6 min silences a field battery 12 times in 12 and burns a dump 12 in 12 where the Gotha needs 5.3 min, and a tank laager falls in two strikes where the Gotha takes none (12 seeds). The **K 16** stays with about 9 % more reach (`cd` 0.195, 0.228 before: 23.9 km to 22.0), so it is the first long gun on the deep targets (W1 22.7 km, W3 22.5 km). **Saves** (`progression.js`, mark `START` 4): the RP put into every cut battery come back (`REMOVED`); its battery points, and what its upgrades cost at its own prices (`research.js` `levelCost`), go to its heir (the Wespe's to the Hummel, the H M1's to the Mörser 18, the Paris Gun's, Bruno's, K5's and K 12's to the Gustav, the Wurfgerät's to the Nebelwerfer 42, the V-1's to the V-2); `MERGED` (the C/92 to the sFH 13, the Gamma to Bertha) carries guns, parts and the lineup slot themselves, and the Gamma's research is Bertha's (its RP back only when the save had Bertha too; RP put into it go on into Bertha; a target on it is Bertha); `REPRICED` gives a save that had Bertha its 400 RP; RP put into any battery past its cost come back. **References:** levels 7, 9 and 10 name Bertha for the Gamma, level 8 the Gotha strike for the V-1 (`threat.js` `fits` follow). **Measured** (72 seeds, all auto): 100, 100, 100, 100, 72, 57, 67, 40, 49, 51 % won, human-proxy medians 3.0, 4.0, 5.6, 9.4, 15.8, 16.3, 18.6, 18.5, 20.2, 21.5 min (means 3.3, 6.5, 6.0, 10.6, 14.9, 16.1, 17.5, 16.7, 19.7, 21.6); before the cuts 100, 100, 100, 100, 72, 57, 56, 40, 38, 25 % and medians the same but 7 (19.8), 9 (20.9) and 3 (5.7). Levels 7, 9 and 10 now run well above their aims (55, 35, 25 %): Bertha does the Gamma's work quicker and reaches every strongpoint; left for the user's call. ww1test (both ops, the Paris Gun's included), simtest and ww2test (the V-1's op included) unchanged; progressiontest extended (the 20 nodes and their lines, ranks and costs, the off-map and bonus rules, a whole old career's carry-over, the Gamma and Bertha cases, repricing, once only); supporttest (Gotha and V-2) and researchtest run clean.
- (render: the crews run to their shelters, 2026-11-26) The crews run to their shelters when they take cover and back to their guns after ("Taking cover, drawn" under Ranging counter-battery): `render/shelters.js`, `render/cover.js`; the unit field `u.coverLog` (sim/guns.js `setCover`); `models/v/de/gun_sites_ww1.js` `dugoutOf1918`, `buildUnterstand`, `UNTERSTAND_NEED`; `render/crewfield.js` `deckAt`; main.js `shelters`, also on `window.__drumfire.shelters`. tools/shot.mjs and tools/crewaudit.mjs take `DRUMFIRE_PORT` for another dev server than 5201 (a worktree's own). ww1test 1 2 3 4 unchanged.

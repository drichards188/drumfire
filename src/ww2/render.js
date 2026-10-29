// The WW2 mode's pictures on top of the shared render layer (src/render/): the special weapons' rigs and sites posed
// from their controllers' state (the Gustav's assembly and its firing position, the Karl driving, turning and
// lowering, the V-1 ramp and the V-2 firing table through their drills), the Nebelwerfer's tubes and its rockets'
// launch, the smoke and flame behind rockets and missiles in flight, and the enemy's aircraft on their raids.
//   const w = createWW2Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns, kinds?, air? });
//                                            kinds: only these batteries' scenery and poses (the German career's
//                                            1918 ridge draws its WW2 batteries with this, its 1918 ones with
//                                            ww1/render.js); air false: no aircraft and no siren (the ridge's are
//                                            the 1918 ones, drawn by ww1/render.js)
//   w.update(dt, rawDt, sim, camera)        every frame after the render layer
//   w.reset(sim)                            after sim.newGame: frees the scenery of batteries not in the game
//   w.fire(unit, piece, shell, night)       from main's fire handler: true when it drew the shot itself
//   w.framing(unitId)                        a V-weapon site's camera framing when its drill moves on to a new step
//                                            (null otherwise; main applies it while it orbits that unit)
//   w.audio = audio                          (set once the engine exists)
import * as THREE from 'three';
import { headingFor } from '../sector.js';
import { buildGermanGunSite } from '../models/v/de/gun_sites.js';
import { buildGermanBatteryWorks } from '../models/v/de/battery_works.js';
import { disposeDetached } from '../render/dispose.js';
import { poseVSite, vFraming } from '../render/crews_vweap.js';
import { VCUT } from '../models/v/de/vweap_kit.js';
import { CUTAWAY } from '../world/mats.js';
import { RUN as V1_RUN } from '../models/v/de/v1.js';
import { gustavLayout } from './gustav_layout.js';
import { createWorks } from './gustav_works.js';

// the V-weapon sites' woods are cut away along the camera's line like the world's nets (the same uniforms)
VCUT.a = CUTAWAY.a; VCUT.b = CUTAWAY.b; VCUT.r = CUTAWAY.r;

const AIR = import.meta.glob('../models/t/ww2/aircraft.js', { eager: true });
const buildAircraft = Object.values(AIR)[0]?.buildAircraft ?? null;
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(0, 0, -1);
const _tv = { x: 0, y: 0, z: 0 }, _tw = { x: 0, y: 0, z: 0 };

export function createWW2Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns, kinds = null, air = true }) {
  const mine = (u) => !kinds || kinds.has(u.kind);
  const sites = new Map(); // unit id -> Gustav firing position
  const gunPositions = new Map(); // piece key -> static fieldworks and masking
  const batteryWorks = new Map(); // battery id -> connecting trenches and rear services
  const planes = new Map(); // aircraft id -> { root, prop }
  const live = new Set(); // this frame's living aircraft (kept, not made anew every frame)
  let sirenOff = 0;
  const w = {
    audio: null,
    sites,
    gunPositions,
    batteryWorks,
    update,
    fire,
    reset,
    framing,
    reselect: () => { askedFor = null; },
    focusTask,
  };

  // the raiders, built now (before main patches the scene's fog into every material) and reused: three a raid
  const pool = [];
  if (buildAircraft && air) {
    const kind = sim.theatre?.op.enemy === 'soviet' ? 'il2' : 'typhoon';
    for (let i = 0; i < 4; i++) {
      try {
        const m = buildAircraft(kind);
        m.setParked?.(false);
        m.setGear?.(0);
        m.root.visible = false;
        scene.add(m.root);
        pool.push({ root: m.root, prop: m.prop ?? m.root.getObjectByName('prop'), kind, used: null });
      } catch (e) {
        console.warn('aircraft', e.message);
      }
    }
  }

  // The batteries' scenery, one slot each: the Gustav's firing position (the curved track, the cranes, the
  // ammunition train, flak, nets); each battery's works (communication trenches, shelters, command post, reserve
  // ammunition, a screened supply approach; the Karl one at each selectable stop); each gun's field position (in
  // world space so the gun and crew animate on their own; the Karl's prepared stops are hardstandings it drives
  // between). The title's demonstration shows every battery; a game keeps only its own and frees the rest
  // (reset). Scenery is drawn only within `far` of the camera: past that its largest features (nets, shelters,
  // vehicles; the site's cranes and train) are under a couple of pixels, and every merged mesh is still a draw.
  const slots = [];
  const place = (root, x, z, bearing) => {
    root.position.set(x, terrain.heightAt(x, z), z);
    root.rotation.y = headingFor(bearing);
  };
  // `pi`: a gun's own position, there only while that gun is in the field; `works`: a battery's works, built round the
  // guns it fields (a career's lineup may bring one gun of four: no empty pits, no works for guns left at home)
  const slot = (key, unitId, map, far, make, { pi = null, works = false } = {}) => slots.push({ key, unitId, map, far, make, pi, works, obj: null, c: new THREE.Vector3(), r: 0, near: true, present: true, sig: null });
  // what a slot stands for in a game: null when it has nothing there, else a signature that changes when it must be built again
  const sigOf = (q, s) => {
    const u = s.unitById(q.unitId);
    if (!u) return null;
    if (q.pi != null) return u.pieces.some((p) => p.i === q.pi) ? '1' : null;
    return q.works ? u.pieces.map((p) => p.i).join(',') : '1';
  };
  const fielded = (id, all) => { const u = sim.unitById(id); return u ? all.filter((p) => u.pieces.some((q) => q.i === p.i)) : all; };
  const buildSite = guns?.EXTRAS?.buildGustavSite;
  // the Gustav is put together on the spot only at the fortress siege: there its site has the assembly section's
  // works (the yard, the delivery track, the cranes and their derricks); elsewhere it came ready and stands on its curve
  const yard = sim.theatre?.op?.id === 'sevastopol';
  const woodland = sim.theatre?.op?.id !== 'sevastopol';
  const stops = sim.theatre?.op?.positions ?? [];
  for (const u of sim.units) {
    if (!mine(u)) continue;
    const id = u.id, kind = u.kind, zero = u.zero, pieces = u.pieces.map((p) => ({ i: p.i, x: p.pos.x, z: p.pos.z, bearing: p.bearing }));
    if (kind === 'gustav' && buildSite) {
      const arc = u.arc, p = pieces[0];
      slot(id, id, sites, 15000, () => {
        // the ground under a point of the site's frame, in its rail-head frame (the flak stands off the levelled pad)
        let root = null;
        const ground = (x, z) => {
          if (!root) return -0.55;
          const c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y);
          return terrain.heightAt(root.position.x + x * c + z * s, root.position.z - x * s + z * c) - root.position.y - 0.55;
        };
        const site = buildSite({ arc, yard, ground });
        root = site.root;
        place(site.root, p.x, p.z, p.bearing);
        return site;
      });
    }
    if (kind === 'v1' || kind === 'v2') continue;
    const works = kind === 'karl'
      ? stops.map((q, i) => ({ key: `${id}:${q.id}`, origin: q.pos, pieces: () => [{ x: q.pos.x, z: q.pos.z }], seed: id * 79 + i, karl: true }))
      : [{ key: `${id}`, origin: { ...u.pos }, pieces: () => fielded(id, pieces).map((p) => ({ x: p.x, z: p.z })), seed: id * 79 }];
    for (const q of works) slot(q.key, id, batteryWorks, 4000, () => buildGermanBatteryWorks({ kind, origin: q.origin, bearing: zero,
      pieces: q.pieces(), terrain, seed: q.seed, woodland }), { works: !q.karl });
    if (kind === 'gustav') continue;
    const spots = kind === 'karl'
      ? stops.map((q, i) => ({ key: `${id}:position:${q.id}`, x: q.pos.x, z: q.pos.z, bearing: zero, seed: id * 37 + i }))
      : pieces.map((p) => ({ key: `${id}:${p.i}`, x: p.x, z: p.z, bearing: p.bearing, seed: id * 37 + p.i, pi: p.i }));
    for (const q of spots) slot(q.key, id, gunPositions, 4000, () => {
      const position = buildGermanGunSite(kind, q.seed);
      place(position.root, q.x, q.z, q.bearing);
      return position;
    }, { pi: q.pi ?? null });
  }
  const _box = new THREE.Box3(), _sphere = new THREE.Sphere();
  function buildSlot(q) {
    try {
      q.obj = q.make();
    } catch (e) {
      console.warn(`scenery ${q.key} failed:`, e.message);
      return;
    }
    scene.add(q.obj.root);
    q.map.set(q.key, q.obj);
    _box.setFromObject(q.obj.root).getBoundingSphere(_sphere);
    q.c.copy(_sphere.center);
    q.r = _sphere.radius;
    if (q.map === sites) renderLayer?.detail?.add(`site:${q.key}`, q.obj.root);
  }
  function dropSlot(q) {
    if (!q.obj) return;
    scene.remove(q.obj.root);
    if (q.map === sites) renderLayer?.detail?.remove(`site:${q.key}`);
    disposeDetached(scene, [q.obj.root]);
    q.map.delete(q.key);
    q.obj = null;
  }
  for (const q of slots) { q.sig = sigOf(q, sim); buildSlot(q); }

  // after sim.newGame: a game (not the title's demonstration, not a lesson) frees the scenery of the batteries and the
  // guns it has not got; the scenery of one that comes back, or of works whose guns changed, is built again. Anything
  // absent is hidden in every case (update).
  function reset(s = sim) {
    const game = !s.attract && !s.scripted;
    for (const q of slots) {
      const sig = sigOf(q, s);
      q.present = sig != null;
      if (q.present && q.obj && q.sig !== sig) dropSlot(q);
      if (q.present && !q.obj) { q.sig = sig; buildSlot(q); }
      else if (!q.present && game) dropSlot(q);
    }
    focus.clear(); framed.clear(); cams.clear();
  }

  // the controllers' moments that have a picture or a sound of their own
  const prevSpecial = sim.events.special, prevRaid = sim.events.raid;
  sim.events.special = (u, what, x) => {
    prevSpecial?.(u, what, x);
    // the A4's igniter lights as the Vorstufe step begins (its flame is drawn every frame while the step runs)
    if (u.kind === 'v2' && what === 'step' && x === 'prestage') {
      const at = anchorPos(u, 'rocket', _p);
      fx.v2Ignition?.(at, 0);
      w.audio?.v2Launch?.(at, 0);
    }
  };
  if (air) sim.events.raid = (r, what) => {
    prevRaid?.(r, what);
    if (what === 'warning' && !sim.attract) {
      w.audio?.siren?.(true);
      sirenOff = sim.time + 70;
    }
  };

  function rigOf(u, i = 0) {
    return rigs.get(`${u.id}:${i}`) ?? null;
  }

  function anchorPos(u, name, out) {
    const rig = rigOf(u);
    const a = rig?.anchors?.[name];
    if (a) {
      rig.root.updateMatrixWorld(true);
      return a.getWorldPosition(out);
    }
    const p = u.pieces[0].pos;
    return out.set(p.x, terrain.heightAt(p.x, p.z) + 2, p.z);
  }

  // a shot the shared blast does not suit: a rocket from its tube, the V-1's catapult, the A4's main stage
  function fire(unit, piece, shell, night) {
    const kind = piece?.kind ?? unit.kind;
    if (kind === 'nbw41') {
      const rig = rigOf(unit, piece.i);
      const m = rig?.anchors?.muzzles?.[shell?.tube ?? 0] ?? rig?.anchors?.muzzle;
      if (m) {
        rig.root.updateMatrixWorld(true);
        m.getWorldPosition(_p);
        _d.set(0, 0, -1).transformDirection(m.matrixWorld);
      } else {
        _p.set(piece.pos.x, piece.pos.y + 1.2, piece.pos.z);
        _d.set(shell.vel.x, shell.vel.y, shell.vel.z).normalize();
      }
      if (fx.rocketLaunch) fx.rocketLaunch(_p, _d);
      else fx.gunBlast?.(_p, _d, 3, { night });
      if (w.audio?.rocket) w.audio.rocket(_p); else w.audio?.gun?.(_p, 4);
      return true;
    }
    if (kind === 'v1') {
      anchorPos(unit, 'ramp0', _p);
      anchorPos(unit, 'muzzle', _d);
      const len = _d.distanceTo(_p) || 48;
      _d.sub(_p).normalize();
      if (fx.v1Launch) fx.v1Launch(_p, _d, len); else fx.gunBlast?.(_p, _d, 8, { night });
      if (w.audio?.v1Launch) w.audio.v1Launch(_p); else w.audio?.gun?.(_p, 8);
      return true;
    }
    if (kind === 'v2') {
      anchorPos(unit, 'rocket', _p);
      if (fx.v2Ignition) fx.v2Ignition(_p, 1); else fx.gunBlast?.(_p, _d.set(0, 1, 0), 12, { night });
      if (w.audio?.v2Launch) w.audio.v2Launch(_p, 1, shell); else w.audio?.gun?.(_p, 12);
      return true;
    }
    return false;
  }

  // The Gustav stands where its works have it (on the assembly section, on its way onto the curve) until it stands at its
  // firing station: the rig's root follows it there, then goes back to the station. The camera's focus (the unit's
  // root, which the chase camera orbits) follows the gun, or, while a task of the preparation is chosen on the procedure
  // card (focusTask), that task's work (gustav_works.js focusOf), gliding from one to the other.
  const works = new Map(), away = new Set(), focus = new Map(), framed = new Map(), cams = new Map();
  const _fc = new THREE.Vector3(), _fq = { x: 0, y: 0, z: 0, dist: 80, pitch: 0.3 }, _st = { stage: {}, assembly: 1 };
  // the procedure card's choice for a unit: a task id, or null for the gun itself; framed once when it changes
  function focusTask(unitId, task) {
    if ((focus.get(unitId) ?? null) === (task ?? null)) return;
    if (task) focus.set(unitId, task); else focus.delete(unitId);
    framed.set(unitId, task ?? 'gun');
  }
  function standGustav(u, rig, g, W, st, rawDt) {
    const p = u.pieces[0], y = terrain.heightAt(p.pos.x, p.pos.z), yaw = headingFor(p.bearing), root = unitRoot[u.id];
    const v = renderLayer?.guns?.byKey?.get(`${u.id}:0`);
    if (root && root.userData.gy == null) root.userData.gy = root.position.y - y;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let wx = p.pos.x, wz = p.pos.z, wa = yaw;
    if (g.works) {
      away.add(u.id);
      wx = p.pos.x + g.x * c + g.z * s; wz = p.pos.z - g.x * s + g.z * c; wa = yaw + g.a;
      rig.root.position.set(wx, y, wz); rig.root.rotation.y = wa;
      if (v) v.baseY = y;
    } else if (away.delete(u.id)) {
      rig.root.position.set(p.pos.x, y, p.pos.z); rig.root.rotation.y = yaw;
    }
    if (!root) return;
    // where the camera should look: the chosen task's work, or the gun
    const task = focus.get(u.id), q = task && W ? W.focusOf(task, st ?? _st, _fq) : null;
    if (q) _fc.set(p.pos.x + q.x * c + q.z * s, y + q.y, p.pos.z - q.x * s + q.z * c);
    else _fc.set(wx, y + root.userData.gy, wz);
    let cam = cams.get(u.id);
    if (!cam) cams.set(u.id, (cam = _fc.clone()));
    else cam.lerp(_fc, 1 - Math.exp(-3.5 * Math.max(0, rawDt ?? 0)));
    root.position.copy(cam);
    root.rotation.y = wa;
    if (q && framed.get(u.id) === task) framed.set(u.id, q); // the framing for main to pick up (framing())
  }

  function poseSpecial(u, rawDt) {
    const st = u.special, rig = rigOf(u);
    if (!st || !rig) return;
    if (st.kind === 'gustav') {
      // the setup as motion (gustav_works.js): the trains, the cranes and the derricks on the site, the gun's parts and
      // bogies on the rig, and where the gun itself stands on its track
      let W = works.get(u.id);
      if (!W && rig.works) works.set(u.id, (W = createWorks(gustavLayout({ arc: u.arc, yard }), rig.works)));
      rig.assembly = st.assembly;
      const site = sites.get(u.id);
      site?.setStage?.(st.stage);
      if (W) {
        const pose = W.update(st, u.pieces[0].az, rig.carZ ?? 0);
        site?.setWorks?.(pose);
        rig.setWorks?.(pose);
        standGustav(u, rig, pose.gun, W, st, rawDt);
      }
    } else if (st.kind === 'karl') {
      // the Karl drives: its rig, the camera's focus and the render layer's resting height follow the sim
      const p = u.pieces[0], y = terrain.heightAt(p.pos.x, p.pos.z);
      rig.root.position.set(p.pos.x, y, p.pos.z);
      rig.root.rotation.y = headingFor(p.bearing);
      const v = renderLayer?.guns?.byKey?.get(`${u.id}:0`);
      if (v) v.baseY = y;
      const root = unitRoot[u.id];
      if (root) {
        root.position.set(p.pos.x, y + 4, p.pos.z);
        root.rotation.y = headingFor(p.bearing);
      }
      rig.setLower?.(st.lower);
      rig.setDrive?.(st.drive);
      rig.setSchlepper?.(st.schlepper.k);
    } else if (st.kind === 'v1' || st.kind === 'v2') {
      // the drill's machinery (render/crews_vweap.js, shared with the crew), then what burns and boils off
      const c = poseVSite(rig, u, sim, vclock(u));
      if (c && rawDt > 0) vsiteFx(u, rig, c);
    }
  }

  // ---------------------------------------------------------------- the V-weapon sites
  const vclocks = new Map(), vstate = new Map();
  let askedFor = null; // the unit main last asked about (a new selection gets its framing again)
  const vclock = (u) => { let c = vclocks.get(u.id); if (!c) vclocks.set(u.id, (c = {})); return c; };
  const _e = { x: 0, y: 0, z: 0, k: 0 }, _ev = new THREE.Vector3(), _ed = new THREE.Vector3(), _fr = {};
  let lastDt = 0;
  // per frame while the steps run: the pulse jet started on the ramp, the A4's Vorstufe and Hauptstufe on the
  // table, the liquid oxygen's vapour boiling off the rocket and the trailer
  function vsiteFx(u, rig, c) {
    if (!fx.trail || !(lastDt > 0)) return;
    if (c.kind === 'v1' && c.engine >= 0 && rig.v1?.misR?.visible) {
      const m = rig.v1.misR;
      m.updateWorldMatrix(true, false);
      _ev.set(0, 0.73, 4.3).applyMatrix4(m.matrixWorld);
      _ed.set(0, 0, -1).transformDirection(m.matrixWorld);
      _e.x = _ed.x; _e.y = _ed.y; _e.z = _ed.z; _e.k = c.engine;
      fx.trail(_ev, _e, 'v1run', lastDt);
    }
    if (c.kind === 'v2') {
      rig.root.updateWorldMatrix(true, false);
      const T = rig.layout?.T ?? 1.5;
      if (c.flame >= 0) {
        _ev.set(0, T, 0).applyMatrix4(rig.root.matrixWorld);
        _e.x = 0; _e.y = 1; _e.z = 0; _e.k = c.flame;
        fx.trail(_ev, _e, 'v2pre', lastDt);
      }
      if (c.vent > 0 && rig.v2?.rocket?.visible && c.lox > 0.05) {
        // the oxygen tank's vent near the top of its section, and the white fog falling off the frosted skin
        _ev.set(0, T + 7.6, 0).applyMatrix4(rig.root.matrixWorld);
        _e.x = 0; _e.y = 1; _e.z = 0; _e.k = c.lox;
        fx.trail(_ev, _e, 'vent', lastDt);
        const lv = rig.layout?.LOXVENT;
        if (lv && c.id === 'lox' && c.active) { _ev.set(lv.x, lv.y, lv.z).applyMatrix4(rig.root.matrixWorld); _e.k = 0.6; fx.trail(_ev, _e, 'vent', lastDt); }
      }
    }
  }

  // The camera: each step framed so its work shows (crews_vweap.js vFraming, in the site's frame), the unit's
  // focus object (main's camera target) glided to it, and the launch followed out. framing(id) answers main once
  // per new shot; the follow and the launch's distance are applied every frame while they run.
  const _fw = new THREE.Vector3(), _fm = new THREE.Vector3();
  function vCamera(u, rig, s, rawDt) {
    const root = unitRoot[u.id];
    if (!root) return;
    const f = vFraming(rig, u, s, _fr);
    if (!f) return;
    rig.root.updateWorldMatrix(true, false);
    _fw.set(f.x, f.y, f.z).applyMatrix4(rig.root.matrixWorld);
    let vs = vstate.get(u.id);
    if (!vs) vstate.set(u.id, (vs = { pos: _fw.clone(), key: '', emitted: '', yaw: 0, pitch: 0, dist: 0, live: false }));
    // the launch: the focus rides out with the missile (its drawn place), then comes back to the site
    vs.live = false;
    if (f.launch) {
      const m = newestMissile(s, u.id);
      if (m && visPos(m, s, _fm)) {
        // (back to the site with a cut, not a pan across a kilometre)
        const k = u.kind === 'v1' ? smoothK(f.since, 0.6, 1.8) * (f.since < 6.8 ? 1 : 0) : smoothK(f.since, 2.5, 5) * (f.since < 20.5 ? 1 : 0);
        _fw.lerp(_fm, k);
        vs.live = true;
        f.dist = u.kind === 'v1' ? f.dist * (1 - 0.35 * k) : f.dist + 150 * smoothK(f.since, 3, 14);
        if (u.kind === 'v2') f.pitch = f.pitch - 0.1 * smoothK(f.since, 3, 10);
      }
    }
    vs.pos.lerp(_fw, vs.live ? 1 - Math.exp(-rawDt * 8) : 1 - Math.exp(-rawDt * 2.2));
    if (vs.pos.distanceTo(_fw) > 400) vs.pos.copy(_fw);
    root.position.copy(vs.pos);
    vs.key = f.key;
    vs.yaw = f.yaw + rig.root.rotation.y; vs.pitch = f.pitch; vs.dist = f.dist;
  }
  const smoothK = (t, a, b) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  function framing(unitId) {
    // the Gustav: a new focus on the procedure card frames its work once (or the gun again); the player's orbit stands
    const fr = framed.get(unitId);
    if (fr && typeof fr === 'object') { framed.delete(unitId); _out.yaw = null; _out.pitch = fr.pitch; _out.dist = fr.dist; return _out; }
    if (fr === 'gun') { framed.delete(unitId); _out.yaw = null; _out.pitch = 0.17; _out.dist = 115; return _out; }
    const vs = vstate.get(unitId);
    if (!vs) return null;
    const fresh = askedFor !== unitId;
    askedFor = unitId;
    if (!fresh && vs.emitted === vs.key && !vs.live) return null;
    const first = vs.emitted !== vs.key || fresh;
    vs.emitted = vs.key;
    _out.yaw = first ? vs.yaw : null; _out.pitch = vs.pitch; _out.dist = vs.dist;
    return _out;
  }
  const _out = { yaw: 0, pitch: 0, dist: 0 };
  function newestMissile(s, unitId) {
    let best = null;
    for (const sh of s.shells) if (sh.alive && sh.guided && sh.unitId === unitId && (!best || sh.t0 > best.t0)) best = sh;
    return best;
  }
  // Where a missile is drawn: the sim flies it from its own first point, the drawing starts it where the site
  // holds it (the V-1 on its sled at the ramp's foot until the catapult has thrown it off the top, the A4 standing
  // on the table) and closes on the sim's track over the next seconds.
  const vis = new WeakMap(), _vp = new THREE.Vector3();
  function visPos(sh, s, out) {
    const a = s.alpha ?? 1;
    out.set(sh.prev.x + (sh.pos.x - sh.prev.x) * a, sh.prev.y + (sh.pos.y - sh.prev.y) * a, sh.prev.z + (sh.pos.z - sh.prev.z) * a);
    let r = vis.get(sh);
    const u = s.unitById?.(sh.unitId);
    if (!r) { r = { lag: null, ok: sh.t < 0.8 }; vis.set(sh, r); }
    const t = s.time - (sh.t0 ?? s.time);
    if (sh.kind === 'v1') {
      if (t < V1_RUN) return false; // still on its sled (drawn by the site)
      if (!r.lag && r.ok && u) { anchorPos(u, 'muzzle', _vp); r.lag = _vp.clone().sub(out); }
      if (r.lag) out.addScaledVector(r.lag, 1 - smoothK(t, V1_RUN, V1_RUN + 2.6));
    } else if (sh.kind === 'v2') {
      if (!r.lag && r.ok && u) { anchorPos(u, 'rocket', _vp); _vp.y += 7; r.lag = _vp.clone().sub(out); }
      if (r.lag) out.addScaledVector(r.lag, 1 - smoothK(t, 0, 7));
    }
    return true;
  }
  // move the drawn missiles (render/shells.js instances) to where visPos says, or out of sight on the sled
  const _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _s3 = new THREE.Vector3();
  function placeMissiles(s) {
    const kinds = renderLayer?.shells?.kinds;
    if (!kinds) return;
    const n = { v1: 0, v2: 0 };
    for (const sh of s.shells) {
      const k = sh.kind === 'v1' || sh.kind === 'v2' ? kinds.get(sh.kind) : null;
      if (!k || !sh.alive) continue;
      const i = n[sh.kind]++;
      if (!sh.guided || i >= k.n) continue;
      const shown = visPos(sh, s, _vp);
      for (const mesh of k.meshes) {
        mesh.getMatrixAt(i, _m4);
        _m4.decompose(_p3, _q3, _s3);
        if (!shown) _s3.setScalar(0); else _p3.copy(_vp);
        mesh.setMatrixAt(i, _m4.compose(_p3, _q3, _s3));
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function update(dt, rawDt, s = sim, camera) {
    lastDt = dt;
    const cam = camera?.position;
    for (const q of slots) {
      if (!q.obj) continue;
      // a little further out before it goes than before it comes back, so it does not flicker on the line
      if (cam) q.near = cam.distanceTo(q.c) - q.r < q.far * (q.near ? 1.05 : 1);
      q.obj.root.visible = q.near && q.present;
    }
    for (const u of s.units) {
      if (!mine(u)) continue;
      if (u.special) poseSpecial(u, rawDt);
      if (u.kind === 'v1' || u.kind === 'v2') { const rig = rigOf(u); if (rig?.layout && u.special?.steps) vCamera(u, rig, s, rawDt); }
      if (u.kind === 'nbw41') for (const p of u.pieces) {
        const rig = rigOf(u, p.i);
        if (!rig?.setRounds) continue;
        let n = 0;
        if (p.state === 'recoil' && p.ripple) n = Math.max(0, (p.tubes ?? 6) - p.ripple.i);
        else if (p.loaded || p.state === 'ready') n = p.tubes ?? 6;
        else if (p.job?.step === 'shell') n = Math.floor(6 * Math.min(1, p.job.t / Math.max(0.01, p.job.dur)));
        else if (p.job && p.job.i > 1) n = p.tubes ?? 6;
        rig.setRounds(n);
      }
    }
    // smoke and flame behind what flies under power
    if (fx.trail && dt > 0) {
      for (const sh of s.shells) {
        if (!sh.alive || !sh.own) continue;
        if (sh.kind === 'nbw41') {
          sh.burning = sh.t < 1.8;
          if (sh.burning) fx.trail(sh.pos, sh.vel, 'rocket', dt);
        } else if ((sh.kind === 'v1' && !sh.engineOff) || (sh.kind === 'v2' && sh.burning)) {
          // the flame comes out of the tail: the V-1's pipe 4 m behind the middle and 0.7 m up, the A4's nozzle 7 m
          // behind it; from where the missile is drawn (visPos: on the ramp's sled it is the site's own flame)
          if (sh.guided && !visPos(sh, s, _vp)) continue;
          const px = sh.guided ? _vp.x : sh.pos.x, py = sh.guided ? _vp.y : sh.pos.y, pz = sh.guided ? _vp.z : sh.pos.z;
          const back = sh.kind === 'v1' ? 4.2 : 7, sp = Math.hypot(sh.vel.x, sh.vel.y, sh.vel.z);
          if (sp > 1) { _tw.x = px - sh.vel.x / sp * back; _tw.y = py - sh.vel.y / sp * back + (sh.kind === 'v1' ? 0.72 : 0); _tw.z = pz - sh.vel.z / sp * back; }
          else { _tw.x = px; _tw.y = py - back; _tw.z = pz; }
          fx.trail(_tw, sh.vel, sh.kind, dt);
        }
      }
    }
    placeMissiles(s);
    if (!air) return;
    // the enemy's aircraft
    const a = s.alpha ?? 1;
    live.clear();
    for (const pl of s.aircraft ?? []) {
      if (pl.alive) live.add(pl.id);
      let v = planes.get(pl.id);
      if (!v && pl.alive) {
        v = pool.find((q) => !q.used) ?? { root: null };
        v.used = pl.id;
        planes.set(pl.id, v);
        w.audio?.aircraft?.(pl);
      }
      if (!v?.root) continue;
      v.root.visible = pl.alive && pl.t >= 0;
      if (!v.root.visible) continue;
      _tv.x = pl.prev.x + (pl.pos.x - pl.prev.x) * a; _tv.y = pl.prev.y + (pl.pos.y - pl.prev.y) * a; _tv.z = pl.prev.z + (pl.pos.z - pl.prev.z) * a;
      v.root.position.set(_tv.x, _tv.y, _tv.z);
      _d.set(pl.vel.x, pl.vel.y, pl.vel.z).normalize();
      _q.setFromUnitVectors(_f, _d);
      v.root.quaternion.copy(_q);
      if (v.prop) v.prop.rotation.z += rawDt * 90;
    }
    for (const [id, v] of planes) if (!live.has(id)) {
      if (v.root) v.root.visible = false;
      v.used = null;
      planes.delete(id);
    }
    if (sirenOff && s.time > sirenOff) {
      sirenOff = 0;
      w.audio?.siren?.(false);
    }
    void _tw;
  }

  return w;
}

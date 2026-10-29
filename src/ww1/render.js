// The WW1 German mode's pictures on top of the shared render layer (src/render/), as src/ww2/render.js does for the
// WW2 mode: the German gun positions of 1918 for the regular units (models/v/de/gun_sites_ww1.js), the firing
// positions of the Langer Max, the Gamma-Mörser and the Paris Gun (guns.EXTRAS.buildMax38Site, buildGammaSite,
// buildParisSite), the Paris Gun's shot (its own muzzle blast and report, the camera riding the shell up out of the
// battle and back), and the British aircraft (RE8 spotters, Camel raids) flying sim.aircraft.
//   const w = createWW1Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns });
//   w.update(dt, rawDt, sim, camera)   every frame after the render layer
//   w.reset(sim)                       after sim.newGame
//   w.fire(unit, piece, shell, night)  from main's fire handler: true when it drew the shot itself
//   w.audio = audio                    (set once the engine exists)
//   main sets w.canRide(unitId), w.ride(shell), w.riding(shell), w.leave(text) for the Paris Gun's shell ride
// Every model file is optional (other agents build them): a missing one leaves its picture out, never an error.
import * as THREE from 'three';
import { headingFor } from '../sector.js';
import { disposeDetached } from '../render/dispose.js';

const SITES = import.meta.glob('../models/v/de/gun_sites_ww1.js', { eager: true });
const siteMod = Object.values(SITES)[0] ?? {};
const buildGunSite1918 = siteMod.buildGunSite1918 ?? null;
const AIR = import.meta.glob('../models/t/ww1/aircraft.js', { eager: true });
const buildAircraft1918 = Object.values(AIR)[0]?.buildAircraft1918 ?? null;

// the Paris Gun's shell ride: from a moment after the shot (the blast is seen from the gun first) until it is this
// high, or this long in the air; past that the map is a speck under it and the flight is a matter of minutes
const RIDE_DELAY = 1.4, RIDE_TOP = 14000, RIDE_MAX = 26;
// the Paris Gun's Stellungsbau: how far behind the turntable the firing frame starts its run in, and how high above the
// cradle the barrel hangs from the portal crane (m)
const PARIS_RUN_IN = 34, PARIS_LOWER = 7;
// the big guns' firing positions: the builder's name in guns.EXTRAS
const SITE_OF = { max38: 'buildMax38Site', gamma: 'buildGammaSite', paris: 'buildParisSite' };
// the regular units' gun positions (gun_sites_ww1.js)
const PITS = new Set(['sfh13', 'm16', 'k17', 'bertha']);

const smooth = (t, a, b) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(0, 0, -1);

export function createWW1Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns }) {
  const sites = new Map(); // key -> { root, ...setters } of a big gun's firing position
  const gunPositions = new Map(); // piece key -> the regular guns' pits
  const planes = new Map(); // aircraft id -> pool entry
  const live = new Set();
  const rides = []; // Paris shells waiting to be ridden { shell, unitId, at }
  let riding = null; // { shell, t0 }
  const w = { audio: null, sites, gunPositions, update, fire, reset, reselect: () => {}, focusTask: () => {} };

  // ---------------------------------------------------------------- the positions
  const slots = [];
  const place = (root, x, z, bearing) => {
    root.position.set(x, terrain.heightAt(x, z), z);
    root.rotation.y = headingFor(bearing);
  };
  // `pi`: a gun's own pit, there only while that gun is in the field (a career's lineup may bring one gun of four)
  const slot = (key, unitId, map, far, make, pi = null) => slots.push({ key, unitId, map, far, make, pi, obj: null, c: new THREE.Vector3(), r: 0, near: true, present: true });
  const there = (q, s) => { const u = s.unitById(q.unitId); return !!u && (q.pi == null || u.pieces.some((p) => p.i === q.pi)); };
  for (const u of sim.units) {
    const id = u.id, kind = u.kind;
    const pieces = u.pieces.map((p) => ({ i: p.i, x: p.pos.x, z: p.pos.z, bearing: p.bearing }));
    const builder = SITE_OF[kind] ? guns?.EXTRAS?.[SITE_OF[kind]] : null;
    if (builder) {
      const p = pieces[0];
      slot(`${id}`, id, sites, kind === 'paris' ? 12000 : 8000, () => {
        const site = builder(id * 97 + 11);
        place(site.root, p.x, p.z, p.bearing);
        return site;
      });
    } else if (PITS.has(kind) && buildGunSite1918) {
      for (const p of pieces) slot(`${id}:${p.i}`, id, gunPositions, 4000, () => {
        const pos = buildGunSite1918(kind, id * 37 + p.i);
        place(pos.root, p.x, p.z, p.bearing);
        return pos;
      }, p.i);
    }
  }
  const _box = new THREE.Box3(), _sphere = new THREE.Sphere();
  function buildSlot(q) {
    try {
      q.obj = q.make();
      if (!q.obj?.root) throw new Error('no root');
    } catch (e) {
      console.warn(`scenery ${q.key} failed:`, e.message);
      q.obj = null;
      return;
    }
    scene.add(q.obj.root);
    q.map.set(q.key, q.obj);
    _box.setFromObject(q.obj.root).getBoundingSphere(_sphere);
    q.c.copy(_sphere.center);
    q.r = _sphere.radius;
    if (q.map === sites) renderLayer?.detail?.add?.(`site:${q.key}`, q.obj.root);
  }
  function dropSlot(q) {
    if (!q.obj) return;
    scene.remove(q.obj.root);
    if (q.map === sites) renderLayer?.detail?.remove?.(`site:${q.key}`);
    disposeDetached(scene, [q.obj.root]);
    q.map.delete(q.key);
    q.obj = null;
  }
  for (const q of slots) buildSlot(q);

  // after sim.newGame (the career's battle fields its lineup only, and of each battery the guns it has earned): the pits
  // of the guns not there are freed in a game and hidden always (update)
  function reset(s = sim) {
    const game = !s.attract && !s.scripted;
    for (const q of slots) {
      q.present = there(q, s);
      if (q.present && !q.obj) buildSlot(q);
      else if (!q.present && game) dropSlot(q);
    }
    rides.length = 0;
    riding = null;
  }

  // the Paris Gun being put together (paris.js stage): the concrete drum and racer rise with the bed; the firing frame
  // (the traverse group, with the barrel, the crane and the men on it) rolls in from behind onto the turntable; the
  // barrel hangs from the portal crane and comes down into the cradle (the site's own groups: buildParisSite setStage).
  // A standing gun is left as built.
  function poseParisSetup(rig, st) {
    const P = rig?.pivots;
    if (!P?.traverse) return;
    const g = st.stage, built = st.ready || (g.frame >= 1 && g.barrel >= 1);
    const fk = built ? 1 : smooth(g.frame, 0, 1), bk = built ? 1 : smooth(g.barrel, 0, 1);
    // the concrete drum and the racer rise as the bed is laid
    if (rig.bedGroup) {
      rig.bedGroup.visible = (g.bed ?? 1) > 0.01;
      rig.bedGroup.scale.y = 0.02 + 0.98 * smooth(g.bed ?? 1, 0, 1);
    }
    rig.assembly = fk; // the men stand on the frame's galleries once it is on its bed (render/ww1/paris.js)
    P.traverse.visible = built || g.frame > 0;
    P.traverse.position.z = (1 - fk) * PARIS_RUN_IN;
    if (P.crane) P.crane.visible = built || g.frame >= 1;
    if (P.recoil) {
      P.recoil.visible = built || g.barrel > 0;
      P.recoil.position.y = (1 - bk) * PARIS_LOWER;
    }
  }

  // ---------------------------------------------------------------- the British aircraft
  // pools per kind, built now (before main patches the scene's fog into every material) and reused
  const pools = {};
  if (buildAircraft1918) for (const [kind, n] of [['re8', 2], ['camel', 4]]) {
    pools[kind] = [];
    for (let i = 0; i < n; i++) {
      try {
        const m = buildAircraft1918(kind);
        m.setParked?.(false);
        m.root.visible = false;
        scene.add(m.root);
        pools[kind].push({ root: m.root, prop: m.prop ?? m.root.getObjectByName('prop'), stores: m.stores ?? [], kind, used: null });
      } catch (e) {
        console.warn('aircraft', kind, e.message);
      }
    }
  }
  const poolFor = (kind) => pools[kind] ?? pools[/re8|spot|observ/.test(kind ?? '') ? 're8' : 'camel'] ?? [];

  // ---------------------------------------------------------------- the Paris Gun's shot
  function muzzleOf(unit, piece) {
    const m = renderLayer?.onFire?.(unit, piece); // also recoils the rig
    if (m) {
      _p.set(m.x, m.y, m.z);
      _d.set(m.dx, m.dy, m.dz);
      return;
    }
    const rig = rigs.get(`${unit.id}:${piece?.i ?? 0}`);
    if (rig?.anchors?.muzzle) {
      rig.root.updateMatrixWorld(true);
      rig.anchors.muzzle.getWorldPosition(_p);
      _d.set(0, 0, -1).transformDirection(rig.anchors.muzzle.matrixWorld);
    } else {
      const q = piece?.pos ?? unit.pos;
      _p.set(q.x, terrain.heightAt(q.x, q.z) + 6, q.z);
      _d.set(0, 0.8, -0.6).normalize();
    }
  }
  function fire(unit, piece, shell, night) {
    const kind = piece?.kind ?? unit.kind;
    if (kind !== 'paris') return false;
    muzzleOf(unit, piece);
    if (shell?.vel && (shell.vel.x || shell.vel.y || shell.vel.z)) _d.set(shell.vel.x, shell.vel.y, shell.vel.z).normalize();
    // the dust comes off the emplacement under the gun (the turntable), not off the ground below the muzzle
    const rig = rigs.get(`${unit.id}:${piece?.i ?? 0}`);
    if (fx.parisBlast) fx.parisBlast(_p, _d, { night, base: rig ? rig.root.getWorldPosition(_b) : undefined });
    else fx.gunBlast?.(_p, _d, 16, { night });
    if (w.audio?.parisGun) w.audio.parisGun(_p);
    else w.audio?.gun?.(_p, 18);
    if (shell && !sim.attract) rides.push({ shell, unitId: unit.id, at: sim.time + RIDE_DELAY });
    return true;
  }
  function stepRides(s) {
    for (let i = rides.length - 1; i >= 0; i--) {
      const r = rides[i];
      if (s.time < r.at) continue;
      rides.splice(i, 1);
      if (r.shell.alive && w.canRide?.(r.unitId)) {
        w.ride?.(r.shell);
        riding = { shell: r.shell, t0: s.time };
      }
    }
    if (!riding) return;
    const sh = riding.shell;
    if (!w.riding?.(sh)) { riding = null; return; } // the player left the ride (F, C, a unit key)
    if (!sh.alive || sh.pos.y > RIDE_TOP || s.time - riding.t0 > RIDE_MAX) {
      riding = null;
      w.leave?.('The shell climbs out of sight: minutes in the air before the observers report its fall.');
    }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt, rawDt, s = sim, camera) {
    const cam = camera?.position;
    for (const q of slots) {
      if (!q.obj) continue;
      if (cam) q.near = cam.distanceTo(q.c) - q.r < q.far * (q.near ? 1.05 : 1);
      q.obj.root.visible = q.near && q.present;
    }
    // the controllers' hints the sites show: the Paris Gun's Stellungsbau (paris.js stage: the firing frame rolled in
    // onto the turntable, the portal crane run over it and the barrel lowered into the cradle, the crane back to its
    // park as the truss is rigged, the net spread with the camouflage) and its barrel change (the net drawn back, the
    // portal crane run over the barrel for the work and back to its park at the end)
    for (const u of s.units) {
      const st = u.special, site = sites.get(`${u.id}`);
      // Bertha and the Gamma swing round with their bed while it is relaid (special.js): the gun, its pit or site and
      // the camera's target turn with the piece's bearing
      if (st?.bed) {
        const yaw = headingFor(u.pieces[0].bearing);
        for (const o of [rigs.get(`${u.id}:0`)?.root, site?.root, gunPositions.get(`${u.id}:0`)?.root, unitRoot?.[u.id]]) if (o && o.rotation.y !== yaw) o.rotation.y = yaw;
      }
      if (!st || !site) continue;
      if (st.kind === 'paris' && st.barrel) {
        const b = st.barrel, k = b.state === 'changing' ? b.t / Math.max(1, b.dur) : 1, g = st.stage;
        let net = b.state === 'changing' ? 1 - smooth(k, 0, 0.06) + smooth(k, 0.94, 1) : 1;
        let portal = b.state === 'changing' ? smooth(k, 0.05, 0.16) * (1 - smooth(k, 0.84, 0.95)) : 0;
        if (g) {
          if (!st.ready) portal = smooth(g.frame, 0.85, 1) * (1 - smooth(g.truss, 0, 0.35));
          net = Math.min(net, g.camo >= 1 ? 1 : 0);
          poseParisSetup(rigs.get(`${u.id}:0`), st);
          site.setStage?.(g);
        }
        site.setCamo?.(net);
        site.setPortal?.(portal);
      }
    }
    stepRides(s);
    // the aircraft
    const a = s.alpha ?? 1;
    live.clear();
    for (const pl of s.aircraft ?? []) {
      if (pl.alive) live.add(pl.id);
      let v = planes.get(pl.id);
      if (!v && pl.alive) {
        v = poolFor(pl.kind).find((q) => !q.used) ?? { root: null };
        v.used = pl.id;
        for (const b of v.stores ?? []) b.visible = true; // bombed up again for its next raid
        planes.set(pl.id, v);
        w.audio?.aircraft?.(pl);
      }
      if (!v?.root) continue;
      v.root.visible = pl.alive && (pl.t ?? 0) >= 0;
      if (!v.root.visible) continue;
      const pr = pl.prev ?? pl.pos;
      v.root.position.set(pr.x + (pl.pos.x - pr.x) * a, pr.y + (pl.pos.y - pr.y) * a, pr.z + (pl.pos.z - pr.z) * a);
      _d.set(pl.vel.x, pl.vel.y, pl.vel.z);
      if (_d.lengthSq() > 1e-6) {
        _q.setFromUnitVectors(_f, _d.normalize());
        v.root.quaternion.copy(_q);
      }
      if (v.prop) v.prop.rotation.z += rawDt * 70;
      // a Camel's four Cooper bombs go one by one as it releases them (the raid drops them 0.2 s apart)
      if (pl.fired && v.stores?.length) for (let k = 0; k < v.stores.length; k++) v.stores[k].visible = s.time < (pl.firedAt ?? 0) + 0.2 * k;
    }
    for (const [id, v] of planes) if (!live.has(id)) {
      if (v.root) v.root.visible = false;
      v.used = null;
      planes.delete(id);
    }
  }

  return w;
}

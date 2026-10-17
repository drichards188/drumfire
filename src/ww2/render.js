// The WW2 mode's pictures on top of the shared render layer (src/render/): the special weapons' rigs and sites posed
// from their controllers' state (the Gustav's assembly and its firing position, the Karl driving, turning and
// lowering, the V-1 ramp and the V-2 firing table through their drills), the Nebelwerfer's tubes and its rockets'
// launch, the smoke and flame behind rockets and missiles in flight, and the enemy's aircraft on their raids.
//   const w = createWW2Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns });
//   w.update(dt, rawDt, sim, camera)        every frame after the render layer
//   w.fire(unit, piece, shell, night)       from main's fire handler: true when it drew the shot itself
//   w.audio = audio                          (set once the engine exists)
import * as THREE from 'three';
import { headingFor } from '../sector.js';

const AIR = import.meta.glob('../models/t/ww2/aircraft.js', { eager: true });
const buildAircraft = Object.values(AIR)[0]?.buildAircraft ?? null;
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(0, 0, -1);
const _tv = { x: 0, y: 0, z: 0 }, _tw = { x: 0, y: 0, z: 0 };

export function createWW2Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns }) {
  const sites = new Map(); // unit id -> Gustav firing position
  const planes = new Map(); // aircraft id -> { root, prop }
  let sirenOff = 0;
  const w = {
    audio: null,
    sites,
    update,
    fire,
  };

  // the raiders, built now (before main patches the scene's fog into every material) and reused: three a raid
  const pool = [];
  if (buildAircraft) {
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

  // the Gustav's firing position: the curved track, the cranes, the ammunition train, flak, nets
  const buildSite = guns?.EXTRAS?.buildGustavSite;
  for (const u of sim.units) {
    if (u.kind !== 'gustav' || !buildSite) continue;
    try {
      const site = buildSite();
      const p = u.pieces[0];
      site.root.position.set(p.pos.x, terrain.heightAt(p.pos.x, p.pos.z), p.pos.z);
      site.root.rotation.y = headingFor(p.bearing);
      scene.add(site.root);
      sites.set(u.id, site);
    } catch (e) {
      console.warn('Gustav site failed:', e.message);
    }
  }

  // the controllers' moments that have a picture or a sound of their own
  const prevSpecial = sim.events.special, prevRaid = sim.events.raid;
  sim.events.special = (u, what, x) => {
    prevSpecial?.(u, what, x);
    if (u.kind === 'v2' && what === 'done' && x === 'prestage') {
      const at = anchorPos(u, 'rocket', _p);
      fx.v2Ignition?.(at, 0);
      w.audio?.v2Launch?.(at, 0);
    }
  };
  sim.events.raid = (r, what) => {
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

  function poseSpecial(u, rawDt) {
    const st = u.special, rig = rigOf(u);
    if (!st || !rig) return;
    if (st.kind === 'gustav') {
      rig.setAssembly?.(st.assembly);
      sites.get(u.id)?.setStage?.(st.stage);
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
    } else if (st.kind === 'v1') {
      rig.setMissile?.(st.where);
      rig.setWings?.(st.wings);
      rig.setGenerator?.(st.generator);
      const t = sim.time - st.launchT;
      rig.launch?.(st.launchT >= 0 && t < 1.5 ? t : null);
    } else if (st.kind === 'v2') {
      rig.setErect?.(st.erect);
      rig.setMeiller?.(st.meiller);
      rig.setTable?.(st.table);
      rig.setFuel?.({ alcohol: st.fuelA, lox: st.fuelL });
      rig.setRocket?.(st.missile && !(st.launchT >= 0 && sim.time - st.launchT < 0.5 && st.erect === 0));
    }
  }

  function update(dt, rawDt, s = sim, camera) {
    for (const u of s.units) {
      if (u.special) poseSpecial(u, rawDt);
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
          // the flame comes out of the tail: the V-1's pipe 4 m and the A4's nozzle 7 m behind the middle
          const back = sh.kind === 'v1' ? 4 : 7, sp = Math.hypot(sh.vel.x, sh.vel.y, sh.vel.z);
          if (sp > 1) { _tw.x = sh.pos.x - sh.vel.x / sp * back; _tw.y = sh.pos.y - sh.vel.y / sp * back; _tw.z = sh.pos.z - sh.vel.z / sp * back; }
          else { _tw.x = sh.pos.x; _tw.y = sh.pos.y - back; _tw.z = sh.pos.z; }
          fx.trail(_tw, sh.vel, sh.kind, dt);
        }
      }
    }
    // the enemy's aircraft
    const a = s.alpha ?? 1;
    const seen = new Set();
    for (const pl of s.aircraft ?? []) {
      seen.add(pl.id);
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
    for (const [id, v] of planes) if (!seen.has(id) || !(s.aircraft ?? []).find((p) => p.id === id)?.alive) {
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

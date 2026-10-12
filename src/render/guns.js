import * as THREE from 'three';
import { UNITS, piecePlacements, headingFor } from '../sector.js';
import { GUNS, STEP } from '../sim/tables.js';
import { buildGun } from '../models/guns.js';
import { GunCrew } from './crews.js';
import { smooth } from './anim.js';

// Gun rigs posed from the sim every frame: traverse and elevation from piece.az and piece.el, the
// recoil from the time since the shot (a fast run back on the buffers, a pause, the slow run out on
// the recuperators), the breech from the loading step, a jolt through the platform at the shot, a
// wrecked pose for a destroyed piece, and the loading crew (crews.js). Rigs are the ones main built
// (`rigs`, keyed `${unitId}:${pieceIndex}`) or built here when main has none.
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const KICK = { bl15: 0.9, bl92: 0.6, bl6: 0.3, bl60: 0.3, rail: 1 };

export class GunViews {
  constructor(scene, sim, terrain, rigs, fx, onlyRigs = false) {
    this.onlyRigs = onlyRigs;
    this.scene = scene;
    this.terrain = terrain;
    this.rigs = rigs;
    this.fx = fx;
    this.views = [];
    this.byKey = new Map();
    this.muzzle = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, calibre: 6 };
    this.camera = null;
    this.selected = null;
    this.build(sim);
  }

  build(sim) {
    for (const v of this.views) v.crew?.setLevel(0);
    this.views.length = 0;
    this.byKey.clear();
    for (const u of sim.units) {
      for (const p of u.pieces) {
        const key = `${u.id}:${p.i}`;
        let rig = this.rigs.get(key);
        if (!rig && this.onlyRigs) continue;
        if (!rig) {
          try { rig = buildGun(p.kind); } catch (e) { console.warn('buildGun', p.kind, e.message); continue; }
          const pl = piecePlacements(UNITS.find((d) => d.id === u.id))[p.i];
          rig.root.position.set(pl.x, this.terrain.heightAt(pl.x, pl.z), pl.z);
          rig.root.rotation.y = headingFor(pl.bearing);
          this.scene.add(rig.root);
          this.rigs.set(key, rig);
        }
        rig.root.rotation.order = 'YXZ';
        let v = this.rigs._views?.get(key);
        v = { unit: u, piece: p, rig, key, crew: null, baseY: rig.root.position.y, wrecked: false, dist: 0 };
        try { v.crew = new GunCrew(rig, p.kind); } catch (e) { console.warn('crew', p.kind, e.message); }
        this.views.push(v);
        this.byKey.set(key, v);
      }
    }
  }

  reset(sim) {
    // same rigs and crews, new sim objects
    for (const v of this.views) {
      const u = sim.unitById(v.unit.id);
      v.unit = u;
      v.piece = u.pieces[v.piece.i];
      v.wrecked = false;
      v.rig.root.rotation.x = 0;
      v.rig.root.position.y = v.baseY;
    }
  }

  /** The muzzle's world position and bore direction (a shared record) with the rig posed as the sim has it. */
  fired(unit, piece) {
    const v = this.byKey.get(`${unit.id}:${piece.i}`);
    if (!v) return null;
    const rig = v.rig;
    rig.setTraverse(piece.az);
    rig.setElevation(piece.el);
    rig.setRecoil(0);
    rig.root.updateMatrixWorld(true);
    const m = rig.anchors.muzzle;
    m.getWorldPosition(_v);
    _w.set(0, 0, -1).transformDirection(m.matrixWorld);
    const o = this.muzzle;
    o.x = _v.x; o.y = _v.y; o.z = _v.z; o.dx = _w.x; o.dy = _w.y; o.dz = _w.z;
    o.calibre = GUNS[piece.kind].calibre;
    return o;
  }

  update(dt, rawDt, sim) {
    const alpha = sim.alpha ?? 0;
    const now = sim.time + alpha * STEP;
    const cam = this.camera;
    for (const v of this.views) {
      const p = v.piece, rig = v.rig, g = GUNS[p.kind];
      const dead = p.state === 'dead';
      rig.setTraverse(p.az);
      rig.setElevation(p.el);
      // recoil: out in ~0.14 s, held a moment, then the run out
      const tf = now - p.firedAt;
      let r = 0;
      if (tf >= 0 && tf < g.runout + 1.2) {
        r = tf < 0.14 ? Math.sin((tf / 0.14) * Math.PI / 2) : tf < 0.45 ? 1 : 1 - smooth(tf, 0.45, 0.45 + g.runout);
      }
      rig.setRecoil(dead ? 0 : r);
      // breech from the job
      let b = p.breech;
      if (p.job?.step === 'open') b = smooth(Math.min(1, (p.job.t + alpha * STEP) / p.job.dur), 0, 1);
      else if (p.job?.step === 'close') b = 1 - smooth(Math.min(1, (p.job.t + alpha * STEP) / p.job.dur), 0, 1);
      rig.setBreech(b);
      // the platform kicks: a short shudder through the root, bigger for the big guns
      const kick = KICK[p.kind] ?? 0.5;
      const j = tf >= 0 && tf < 1.4 ? Math.exp(-tf * 4.5) * Math.sin(tf * 38) : 0;
      if (!dead) {
        rig.root.position.y = v.baseY + j * 0.045 * kick;
        rig.root.rotation.x = -j * 0.006 * kick - (tf >= 0 && tf < 0.5 ? Math.sin(Math.min(1, tf / 0.12) * Math.PI) * 0.004 * kick : 0);
      } else if (!v.wrecked) {
        v.wrecked = true;
        rig.root.rotation.x = 0.08;
        rig.root.rotation.z = 0.1;
        rig.root.position.y = v.baseY - 0.35;
        rig.setElevation(p.el + 0.25);
      }
      rig.update?.(dt);
      // crew level of detail by distance to the camera
      if (v.crew) {
        let level = 2;
        if (cam) {
          const d = cam.position.distanceTo(rig.root.position);
          v.dist = d;
          const sel = this.selected != null && v.unit.id === this.selected;
          level = d < 140 || (sel && d < 450) ? 2 : d < 420 ? 1 : 0;
        }
        if (dead) level = 0;
        if (level !== v.lvl) {
          v.lvl = level;
          v.crew.setLevel(level);
        }
        if (level > 0) {
          if (level === 1 && (v.skip = (v.skip ?? 0) + 1) % 3) continue;
          v.crew.update(p, sim, rawDt * (level === 1 ? 3 : 1), level);
        }
      }
    }
  }
}

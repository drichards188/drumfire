import * as THREE from 'three';
import { buildTarget } from '../models/targets.js';
import { headingFor } from '../sector.js';
import { smooth } from './anim.js';
import { disposeDetached } from './dispose.js';

// German targets drawn from sim.targets: every site's model sits on the terrain at the site's bearing,
// each destroyable part follows the sim part's damage (setDamage), battery guns recoil and flash when the
// sim launches a shell from them, the kite balloon rides its cable and, shot down, falls burning, and
// the mobile targets (night traffic, trains) show only while the sim says they are present.
//
// Parts are wrapped in a Group so a model part can be moved to where the sim has its part (batteries and
// dumps place their parts by the sim's spacing, the convoy drives): damage code moves the part itself.
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const MOVES = new Set(['battery', 'dump', 'crossroads', 'abattery', 'amedium', 'adump', 'aconvoy', 'bdump', 'bconvoy']);
// road traffic (WW2 aconvoy, WW1 bconvoy): the vehicles face -Z in the model and are turned to their direction of travel
const DRIVES = new Set(['aconvoy', 'bconvoy']);
const DUMPS = new Set(['dump', 'adump', 'bdump']);
const FALL = 14; // s a shot-down balloon takes to come down
// kite balloons: the German Drachen of the British game and the British Caquot of the WW1 German mode
const BALLOONS = new Set(['balloon', 'bballoon']);

export class TargetViews {
  constructor(scene, sim, terrain, fx, detail = null) {
    this.scene = scene;
    this.detail = detail; // DetailCull: a target kilometres away keeps only the parts that still show
    this.terrain = terrain;
    this.fx = fx;
    this.views = new Map();
    this.muzzle = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, calibre: 6 };
    this.time = 0;
    this.build(sim);
  }

  build(sim) {
    // a new game builds new models: the old ones go, and so does what they held on the GPU
    const old = [];
    for (const [id, v] of this.views) {
      this.scene.remove(v.group);
      this.detail?.remove(`target:${id}`);
      old.push(v.group);
    }
    this.views.clear();
    for (const t of sim.targets) {
      let model;
      try {
        model = buildTarget(t.kind, BALLOONS.has(t.kind) ? { alt: t.site?.alt ?? t.pos.y } : {});
      } catch (e) {
        console.warn('buildTarget', t.kind, e.message);
        continue;
      }
      const group = new THREE.Group();
      group.name = 'target-' + t.id;
      const gy = this.terrain.heightAt(t.pos.x, t.pos.z);
      group.position.set(t.pos.x, t.kind === 'balloon' ? gy : gy, t.pos.z);
      group.rotation.y = headingFor(t.bearing);
      group.add(model.root);
      this.scene.add(group);
      this.detail?.add(`target:${t.id}`, group);
      const wraps = model.parts.map((p) => {
        const w = new THREE.Group();
        p.parent.add(w);
        w.add(p);
        w.userData.home = p.position.clone();
        // the wrapper is positioned in the root's frame, the part keeps its own home offset
        w.position.set(0, 0, 0);
        return w;
      });
      this.views.set(t.id, {
        t, model, group, wraps, kind: t.kind,
        k: model.parts.map(() => 0), shown: model.parts.map(() => -1), dead: model.parts.map(() => false), deadAt: -1,
        gy, burn: 0,
      });
    }
    if (old.length) disposeDetached(this.scene, old);
  }

  reset(sim) {
    this.build(sim);
  }

  /** Called from sim.events.enemyFire(srcId, part, shell): kicks the gun back, returns the muzzle record. */
  onEnemyFire(srcId, part, shell) {
    const v = this.views.get(srcId);
    if (!v || !v.model.rigs) return null;
    const i = v.t.parts.indexOf(part);
    const rig = v.model.rigs[i];
    if (!rig) return null;
    v.fireAt ??= [];
    v.fireAt[i] = this.time;
    const m = rig.anchors.muzzle;
    if (!m) return null;
    v.group.updateMatrixWorld(true);
    m.getWorldPosition(_v);
    _w.set(0, 0, -1).transformDirection(m.matrixWorld);
    const o = this.muzzle;
    o.x = _v.x; o.y = _v.y; o.z = _v.z; o.dx = _w.x; o.dy = _w.y; o.dz = _w.z;
    o.calibre = shell?.calibre ?? 6;
    return o;
  }

  update(dt, sim, camera) {
    this.time += dt;
    const fx = this.fx;
    for (const v of this.views.values()) {
      const t = v.t, parts = t.parts, model = v.model;
      const show = t.present !== false;
      v.group.visible = show || v.kind === 'crossroads' || v.kind === 'railyard' || DRIVES.has(v.kind);
      if (!show) {
        for (const p of model.parts) p.visible = false;
        continue;
      }
      const n = model.parts.length;
      const partMax = t.maxHp / Math.max(1, parts.length);
      for (let i = 0; i < n; i++) {
        model.parts[i].visible = true;
        const sp = parts[Math.min(i, parts.length - 1)];
        let goal = !sp.alive ? 1 : partMax > 0 ? Math.min(1, Math.max(0, 1 - sp.hp / partMax)) : 0;
        if (BALLOONS.has(v.kind)) {
          // the winch lorry (part 1) goes with the balloon; the balloon itself falls over FALL s
          if (i === 1) goal = t.alive ? 0 : 0.8;
          else if (!sp.alive) {
            v.deadAt = v.deadAt < 0 ? this.time : v.deadAt;
            goal = Math.min(1, (this.time - v.deadAt) / FALL);
            v.k[i] = goal;
          } else {
            v.deadAt = -1;
            v.k[i] = Math.min(goal, 0.3);
            goal = v.k[i];
          }
        }
        if (!BALLOONS.has(v.kind) || i === 1) v.k[i] += (goal - v.k[i]) * Math.min(1, dt * 2.5);
        const k = v.k[i];
        const q = Math.round(k * 25);
        if (q !== v.shown[i]) {
          v.shown[i] = q;
          model.setDamage(i, k);
        }
        // follow the sim part's position
        if (MOVES.has(v.kind) && parts[i]) {
          const w = v.wraps[i], h = w.userData.home;
          const dx = parts[i].x - t.pos.x, dz = parts[i].z - t.pos.z;
          const c = Math.cos(-v.group.rotation.y), s = Math.sin(-v.group.rotation.y);
          if (DRIVES.has(v.kind)) {
            // turn the wrapper to the way the part moved since the last frame (kept while it stands still)
            // and place it so the part, at its home offset inside the wrapper, lands on the sim's position
            // (the reference point stays until the part has gone 0.3 m, so slow time scales still turn it;
            // a jump of more than 30 m is a convoy starting over, not a direction)
            const lx = dx * c + dz * s, lz = -dx * s + dz * c, ud = w.userData;
            const md = ud.lx == null ? Infinity : Math.hypot(lx - ud.lx, lz - ud.lz);
            if (md > 0.3) {
              if (md < 30) w.rotation.y = Math.atan2(-(lx - ud.lx), -(lz - ud.lz));
              ud.lx = lx;
              ud.lz = lz;
            }
            const cy = Math.cos(w.rotation.y), sy = Math.sin(w.rotation.y);
            w.position.set(lx - (h.x * cy + h.z * sy), 0, lz - (-h.x * sy + h.z * cy));
          } else w.position.set(dx * c + dz * s - h.x, 0, -dx * s + dz * c - h.z);
        }
        // a part newly destroyed burns
        if (!sp.alive && !v.dead[i] && !BALLOONS.has(v.kind)) {
          v.dead[i] = true;
          if (fx && model.anchors?.burn?.[i]) {
            model.anchors.burn[i].getWorldPosition(_v);
            fx.burnSite?.(_v, DUMPS.has(v.kind) ? 1.6 : 1, DUMPS.has(v.kind) ? 90 : 45);
          }
          // targets with vents (the Sevastopol cliff magazine's tunnel mouths): smoke pours out of each
          for (const a of (fx && model.anchors?.vents?.[i]) || []) {
            a.getWorldPosition(_v);
            fx.burnSite?.(_v, 1.3, 120);
          }
        } else if (sp.alive && v.dead[i]) v.dead[i] = false;
        if (BALLOONS.has(v.kind) && i === 0 && !sp.alive) {
          // the envelope falls, burning
          const f = Math.min(1, (this.time - v.deadAt) / FALL);
          // (the WW1 mode's sim keeps a bballoon's pos.y on the ground: its height is the site's alt)
          const alt = v.kind === 'bballoon' ? (t.site?.alt ?? t.pos.y) : t.pos.y;
          v.wraps[0].position.y = -(alt * 0.55) * f * f;
          if (f < 1 && fx && model.anchors?.burn?.[0]) {
            model.anchors.burn[0].getWorldPosition(_v);
            fx.fire?.(_v, 3, 1);
          } else if (f >= 1 && !v.landed) {
            v.landed = true;
            model.anchors?.burn?.[0]?.getWorldPosition(_v);
            fx?.burnSite?.(_v, 2.5, 70);
          }
        } else if (BALLOONS.has(v.kind) && i === 0) {
          v.wraps[0].position.y = 0;
          v.landed = false;
        }
      }
      // battery guns: recoil after a shot
      if (model.rigs) {
        for (let i = 0; i < model.rigs.length; i++) {
          const rig = model.rigs[i];
          const f = v.fireAt?.[i];
          let r = 0;
          if (f != null) {
            const tt = this.time - f;
            r = tt < 0.1 ? Math.sin((tt / 0.1) * Math.PI / 2) : 1 - smooth(tt, 0.4, 3.2);
          }
          rig.setRecoil(Math.max(0, r));
          rig.update?.(dt);
        }
      }
    }
  }
}

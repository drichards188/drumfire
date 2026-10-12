import * as THREE from 'three';
import { buildTarget } from '../models/targets.js';
import { headingFor } from '../sector.js';
import { smooth } from './anim.js';

// German targets drawn from sim.targets: every site's model sits on the terrain at the site's bearing,
// each destroyable part follows the sim part's damage (setDamage), battery guns recoil and flash when the
// sim launches a shell from them, the kite balloon rides its cable and, shot down, falls burning, and
// the mobile targets (night traffic, trains) show only while the sim says they are present.
//
// Parts are wrapped in a Group so a model part can be moved to where the sim has its part (batteries and
// dumps place their parts by the sim's spacing, the convoy drives): damage code moves the part itself.
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const MOVES = new Set(['battery', 'dump', 'crossroads']);
const FALL = 14; // s a shot-down balloon takes to come down

export class TargetViews {
  constructor(scene, sim, terrain, fx) {
    this.scene = scene;
    this.terrain = terrain;
    this.fx = fx;
    this.views = new Map();
    this.muzzle = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, calibre: 6 };
    this.time = 0;
    this.build(sim);
  }

  build(sim) {
    for (const v of this.views.values()) this.scene.remove(v.group);
    this.views.clear();
    for (const t of sim.targets) {
      let model;
      try {
        model = buildTarget(t.kind, t.kind === 'balloon' ? { alt: t.site?.alt ?? t.pos.y } : {});
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
      v.group.visible = show || v.kind === 'crossroads' || v.kind === 'railyard';
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
        if (v.kind === 'balloon') {
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
        if (v.kind !== 'balloon' || i === 1) v.k[i] += (goal - v.k[i]) * Math.min(1, dt * 2.5);
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
          w.position.set(dx * c + dz * s - h.x, 0, -dx * s + dz * c - h.z);
        }
        // a part newly destroyed burns
        if (!sp.alive && !v.dead[i] && v.kind !== 'balloon') {
          v.dead[i] = true;
          if (fx && model.anchors?.burn?.[i]) {
            model.anchors.burn[i].getWorldPosition(_v);
            fx.burnSite?.(_v, v.kind === 'dump' ? 1.6 : 1, v.kind === 'dump' ? 90 : 45);
          }
        } else if (sp.alive && v.dead[i]) v.dead[i] = false;
        if (v.kind === 'balloon' && i === 0 && !sp.alive) {
          // the envelope falls, burning
          const f = Math.min(1, (this.time - v.deadAt) / FALL);
          v.wraps[0].position.y = -(t.pos.y * 0.55) * f * f;
          if (f < 1 && fx && model.anchors?.burn?.[0]) {
            model.anchors.burn[0].getWorldPosition(_v);
            fx.fire?.(_v, 3, 1);
          } else if (f >= 1 && !v.landed) {
            v.landed = true;
            model.anchors?.burn?.[0]?.getWorldPosition(_v);
            fx?.burnSite?.(_v, 2.5, 70);
          }
        } else if (v.kind === 'balloon' && i === 0) {
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

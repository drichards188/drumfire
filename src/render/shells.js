import * as THREE from 'three';
import { buildShell, SHELL_KINDS } from '../models/shells.js';

// Shells in flight: one InstancedMesh per shell kind and per material part (buildShell), positions
// interpolated from prev to pos by sim.alpha, nose along the velocity. A real shell is a few pixels
// long at a kilometre, so with distance each one is enlarged until it covers about `minPx` pixels
// (capped), which keeps a round climbing away followable without it looking huge when near.
const CAP = 80;
const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _d = new THREE.Vector3(), _n = new THREE.Vector3(0, 0, -1), _c = new THREE.Vector3();

export class ShellViews {
  constructor(scene, { minPx = 7, maxScale = 24 } = {}) {
    this.minPx = minPx;
    this.maxScale = maxScale;
    this.pxPerRad = 900;
    this.kinds = new Map();
    this.group = new THREE.Group();
    this.group.name = 'shells';
    scene.add(this.group);
    for (const kind of SHELL_KINDS) {
      let b;
      try { b = buildShell(kind, 12); } catch (e) { console.warn('buildShell', kind, e.message); continue; }
      const meshes = b.parts.map((part) => {
        const m = new THREE.InstancedMesh(part.geometry, part.material, CAP);
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = false;
        this.group.add(m);
        return m;
      });
      this.kinds.set(kind, { meshes, length: b.length, n: 0 });
    }
  }

  /** @param camera THREE.Camera (optional, enlargement needs it) */
  update(sim, camera) {
    if (camera) this.pxPerRad = (this.viewH ?? 900) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const k of this.kinds.values()) k.n = 0;
    const a = sim.alpha ?? 1;
    for (const sh of sim.shells) {
      const k = this.kinds.get(sh.kind);
      if (!k || !sh.alive || k.n >= CAP) continue;
      _p.set(sh.prev.x + (sh.pos.x - sh.prev.x) * a, sh.prev.y + (sh.pos.y - sh.prev.y) * a, sh.prev.z + (sh.pos.z - sh.prev.z) * a);
      _d.set(sh.vel.x, sh.vel.y, sh.vel.z);
      if (_d.lengthSq() < 1e-6) _d.set(0, 1, 0);
      _d.normalize();
      _q.setFromUnitVectors(_n, _d);
      let s = 1;
      if (camera) {
        const dist = camera.position.distanceTo(_p);
        s = Math.min(this.maxScale, Math.max(1, (this.minPx * dist) / (k.length * this.pxPerRad)));
      }
      _m.compose(_p, _q, _s.set(s, s, s));
      for (const m of k.meshes) m.setMatrixAt(k.n, _m);
      k.n++;
    }
    for (const k of this.kinds.values()) {
      for (const m of k.meshes) {
        m.count = k.n;
        m.instanceMatrix.needsUpdate = true;
        m.visible = k.n > 0;
      }
    }
  }

  /** The newest own shell in flight from a unit (for the F key), or null. */
  newest(sim, unitId) {
    let best = null;
    for (const sh of sim.shells) if (sh.own && sh.alive && (unitId == null || sh.unitId === unitId) && (!best || sh.t0 > best.t0)) best = sh;
    return best;
  }
}

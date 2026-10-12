import * as THREE from 'three';
import { patchMaterial } from '../shaderlib.js';
import { SMOKE, FLAME, SPARK, rand, rr } from './kinds.js';

// Clods of earth, bricks, splinters and burning ammunition rounds on ballistic arcs. One typed-array
// pool drawn as one instanced mesh. A clod that lands lies a few seconds and shrinks away; a burning
// round trails sparks and smoke and pops where it lands (or when its fuse runs out in the air).
const F = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'ex', 'ey', 'ez', 'wx', 'wy', 'wz', 'size', 'ax', 'ay', 'az', 'age', 'life', 'drag', 'kind', 'cr', 'cg', 'cb', 'rest', 'trail', 'gy', 'fuse'];
export const CLOD = { EARTH: 0, ROUND: 1, WATER: 2 };

function lumpy(seed) {
  // an irregular rock-like blob: an icosahedron with its vertices pushed about
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const h = (x) => { const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const k = 0.72 + 0.5 * h(Math.round(p.getX(i) * 40) + Math.round(p.getY(i) * 31) * 7 + Math.round(p.getZ(i) * 23) * 13);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Clods {
  constructor(scene, max = 1600) {
    this.max = max;
    this.n = 0;
    for (const f of F) this[f] = new Float32Array(max);
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 }), 'fog');
    this.mesh = new THREE.InstancedMesh(lumpy(3), mat, max);
    this.mesh.setColorAt(0, new THREE.Color(0x201a14)); // the colour attribute up front, so the program never recompiles
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  /** Add one. kind EARTH/ROUND/WATER; fuse (s, 0 none) only for rounds. Returns the slot. */
  add(kind, x, y, z, vx, vy, vz, size, r, g, b, { life = 12, drag = 0.04, fuse = 0, gy = 0, flat = 1 } = {}) {
    let i;
    if (this.n < this.max) i = this.n++;
    else {
      // full: take the one nearest the end of its life from a few samples
      i = (rand() * this.n) | 0;
      for (let k = 0; k < 4; k++) {
        const j = (rand() * this.n) | 0;
        if (this.age[j] / this.life[j] > this.age[i] / this.life[i]) i = j;
      }
    }
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.ex[i] = rand() * 6.28; this.ey[i] = rand() * 6.28; this.ez[i] = rand() * 6.28;
    const w = kind === CLOD.ROUND ? rr(3, 9) : rr(1, 7) / Math.sqrt(Math.max(0.3, size));
    this.wx[i] = rr(-w, w); this.wy[i] = rr(-w, w); this.wz[i] = rr(-w, w);
    this.size[i] = size;
    this.ax[i] = rr(0.7, 1.3); this.ay[i] = rr(0.6, 1.1) * flat; this.az[i] = rr(0.7, 1.3);
    this.age[i] = 0; this.life[i] = life; this.drag[i] = drag;
    this.kind[i] = kind; this.cr[i] = r; this.cg[i] = g; this.cb[i] = b;
    this.rest[i] = 0; this.trail[i] = rand() * 0.1; this.gy[i] = gy; this.fuse[i] = fuse;
    return i;
  }

  kill(i) {
    const j = --this.n;
    if (i !== j) for (const f of F) this[f][i] = this[f][j];
  }

  update(dt, fx, cam) {
    const wx = fx.wind.x, wz = fx.wind.z;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      if (this.rest[i] || dt <= 0) continue;
      const kind = this.kind[i];
      const dk = Math.exp(-this.drag[i] * dt);
      this.vx[i] = wx + (this.vx[i] - wx) * dk;
      this.vz[i] = wz + (this.vz[i] - wz) * dk;
      this.vy[i] = this.vy[i] * dk - 9.8 * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.ex[i] += this.wx[i] * dt; this.ey[i] += this.wy[i] * dt; this.ez[i] += this.wz[i] * dt;
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      if (kind === CLOD.ROUND) {
        this.trail[i] -= dt;
        if (this.trail[i] <= 0 && fx.cheap()) {
          this.trail[i] = 0.035;
          fx.addGlow(FLAME, x, y, z, 0, 1, 0, 0.22, 0.5, 1.1, 14, 6, 1.5, 1, { drag: 2 });
          fx.addSmoke(SMOKE.TRAIL, x, y, z, rr(-1, 1), rr(0, 1.5), rr(-1, 1), rr(2.5, 4), 0.6, rr(2.5, 4), 0.32, 0.31, 0.3, 0.45, { drag: 0.9, buoy: 0.3 });
        }
        if (this.fuse[i] > 0 && this.age[i] >= this.fuse[i]) { fx._pop(x, y, z, this.size[i]); this.kill(i); continue; }
      } else if (kind === CLOD.EARTH && this.size[i] > 0.7) {
        this.trail[i] -= dt;
        if (this.trail[i] <= 0 && fx.cheap()) {
          this.trail[i] = rr(0.12, 0.22);
          fx.addSmoke(SMOKE.PUFF, x, y, z, rr(-0.5, 0.5), rr(-0.5, 0.5), rr(-0.5, 0.5), rr(1.6, 3), this.size[i] * 2, this.size[i] * rr(5, 9), 0.2, 0.16, 0.12, 0.22, { drag: 1.2 });
        }
      }
      if (y < this.gy[i] + 30 && this.vy[i] < 0) {
        const g = fx.ground(x, z);
        if (y <= g + this.size[i] * 0.3) {
          if (kind === CLOD.ROUND) { fx._pop(x, g + 0.5, z, this.size[i]); this.kill(i); continue; }
          this.py[i] = g + this.size[i] * 0.25;
          this.rest[i] = 1;
          this.life[i] = this.age[i] + (kind === CLOD.WATER ? 0.1 : rr(5, 14));
          if (kind === CLOD.EARTH && this.size[i] > 0.45 && fx.cheap()) {
            const s = this.size[i];
            fx.addSmoke(SMOKE.PUFF, x, g + s * 0.5, z, rr(-1, 1), rr(1, 3), rr(-1, 1), rr(2, 4), s * 2, s * rr(6, 11), 0.34, 0.27, 0.2, 0.55, { drag: 1.4, buoy: 0.2 });
          }
        }
      }
    }
    // draw: far ones larger so a spray of earth still reads at a distance; shrink away at the end
    const M = this.mesh, C = M.instanceColor;
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot(this.px[i] - cam.x, this.py[i] - cam.y, this.pz[i] - cam.z);
      const far = Math.min(5, Math.max(1, (d * 0.0035) / this.size[i]));
      const f = Math.min(1, (this.life[i] - this.age[i]) / 1.5) * far * this.size[i];
      _q.setFromEuler(_e.set(this.ex[i], this.ey[i], this.ez[i]));
      _m.compose(_p.set(this.px[i], this.py[i], this.pz[i]), _q, _s.set(f * this.ax[i], f * this.ay[i], f * this.az[i]));
      M.setMatrixAt(i, _m);
      C.setXYZ(i, this.cr[i], this.cg[i], this.cb[i]);
    }
    M.count = this.n;
    if (this.n) { M.instanceMatrix.needsUpdate = true; C.needsUpdate = true; }
  }
}

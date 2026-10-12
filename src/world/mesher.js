import * as THREE from 'three';

// A fast geometry collector for the world builders: flat-shaded quads and boxes written straight into
// per-material arrays (no clones, no merge passes), vertex colour as the tint, UVs in metres so every
// tiling texture is sized by its own repeat. A tile of trench is thousands of small boxes; kit.js
// Parts clones every geometry, which is too slow for building tiles while the camera moves.

const colCache = new Map();
const c3 = new THREE.Color();
export function lin(hex) {
  let v = colCache.get(hex);
  if (!v) { c3.setHex(hex); v = [c3.r, c3.g, c3.b]; colCache.set(hex, v); }
  return v;
}

// deterministic hash noise for placement jitter
export function h2(x, z, s = 0) {
  let h = Math.imul((x * 73.1) | 0, 0x27d4eb2d) ^ Math.imul((z * 91.7) | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

// local faces of a unit box: normal, then four corners (ccw seen from outside), then which local axes give u and v
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: 2, v: 1, key: 'sides' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: 2, v: 1, key: 'sides' },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: 0, v: 1, key: 'sides' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: 0, v: 1, key: 'sides' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: 0, v: 2, key: 'top' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: 0, v: 2, key: 'bottom' },
];

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export class Mesher {
  constructor() { this.b = new Map(); this.tris = 0; }

  bucket(key) {
    let b = this.b.get(key);
    if (!b) { b = { p: [], n: [], uv: [], c: [] }; this.b.set(key, b); }
    return b;
  }

  // one quad, corners ccw seen from the front; uv per corner as [u, v]
  quad(key, p0, p1, p2, p3, col = 0xffffff, uv = null, nrm = null) {
    const b = this.bucket(key), t = lin(col);
    let nx, ny, nz;
    if (nrm) [nx, ny, nz] = nrm;
    else {
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
      nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    uv = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = i === 0 ? p0 : i === 1 ? p1 : i === 2 ? p2 : p3;
      b.p.push(p[0], p[1], p[2]); b.n.push(nx, ny, nz); b.uv.push(uv[i][0], uv[i][1]); b.c.push(t[0], t[1], t[2]);
    }
    this.tris += 2;
  }

  tri(key, p0, p1, p2, col = 0xffffff, uv = null) {
    const b = this.bucket(key), t = lin(col);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    uv = uv || [[0, 0], [1, 0], [0.5, 1]];
    [p0, p1, p2].forEach((p, i) => { b.p.push(p[0], p[1], p[2]); b.n.push(nx, ny, nz); b.uv.push(uv[i][0], uv[i][1]); b.c.push(t[0], t[1], t[2]); });
    this.tris++;
  }

  // Box centred at (cx, cy, cz), size sx, sy, sz, turned ry about Y (then rx, rz). `skip` lists faces to omit
  // ('top' | 'bottom' | 'sides'); u0, v0 offset the texture so neighbours do not repeat.
  box(key, cx, cy, cz, sx, sy, sz, ry = 0, col = 0xffffff, { rx = 0, rz = 0, skip = null, u0 = 0, v0 = 0 } = {}) {
    const b = this.bucket(key), t = lin(col);
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(cx, cy, cz), _q, new THREE.Vector3(1, 1, 1));
    const e = _m.elements;
    const S = [sx, sy, sz];
    for (const f of FACES) {
      if (skip && skip.includes(f.key)) continue;
      const nx = e[0] * f.n[0] + e[4] * f.n[1] + e[8] * f.n[2], ny = e[1] * f.n[0] + e[5] * f.n[1] + e[9] * f.n[2], nz = e[2] * f.n[0] + e[6] * f.n[1] + e[10] * f.n[2];
      const pts = f.c.map((q) => {
        const lx = (q[0] - 0.5) * sx, ly = (q[1] - 0.5) * sy, lz = (q[2] - 0.5) * sz;
        return [e[0] * lx + e[4] * ly + e[8] * lz + cx, e[1] * lx + e[5] * ly + e[9] * lz + cy, e[2] * lx + e[6] * ly + e[10] * lz + cz];
      });
      const U = S[f.u], Vv = S[f.v];
      const cuv = f.c.map((q) => [u0 + q[f.u] * U, v0 + q[f.v] * Vv]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = pts[i];
        b.p.push(p[0], p[1], p[2]); b.n.push(nx, ny, nz); b.uv.push(cuv[i][0], cuv[i][1]); b.c.push(t[0], t[1], t[2]);
      }
      this.tris += 2;
    }
  }

  // a beam from a to b (3D points), cross-section w wide (horizontal) by h tall
  beam(key, a, b, w, h, col = 0xffffff, opt = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const hl = Math.hypot(dx, dz);
    const ry = Math.atan2(-dx, -dz); // box -Z axis along the beam
    const rx = Math.atan2(dy, hl);
    this.box(key, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, w, h, len, ry, col, { rx, ...opt });
  }

  // vertical cylinder / cone-frustum (r0 at the bottom)
  cyl(key, cx, y0, cz, r0, r1, h, seg = 8, col = 0xffffff, { cap = true } = {}) {
    const bk = this.bucket(key), t = lin(col);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
      const sl = (r0 - r1) / h;
      const push = (px, py, pz, nx, ny, nz, u, v) => { bk.p.push(px, py, pz); bk.n.push(nx, ny, nz); bk.uv.push(u, v); bk.c.push(t[0], t[1], t[2]); };
      const uA = (i / seg) * Math.PI * 2 * r0, uB = ((i + 1) / seg) * Math.PI * 2 * r0;
      const nl0 = Math.hypot(1, sl);
      const A = [cx + s0 * r0, y0, cz + c0 * r0], B = [cx + s1 * r0, y0, cz + c1 * r0];
      const C = [cx + s1 * r1, y0 + h, cz + c1 * r1], D = [cx + s0 * r1, y0 + h, cz + c0 * r1];
      for (const [P, n0, uu, vv] of [[A, 0, uA, 0], [B, 1, uB, 0], [C, 1, uB, h], [A, 0, uA, 0], [C, 1, uB, h], [D, 0, uA, h]]) {
        const s = n0 ? s1 : s0, c = n0 ? c1 : c0;
        push(P[0], P[1], P[2], s / nl0, sl / nl0, c / nl0, uu, vv);
      }
      this.tris += 2;
      if (cap && r1 > 0.001) {
        for (const [P, uu, vv] of [[[cx, y0 + h, cz], 0, 0], [D, s0 * r1, c0 * r1], [C, s1 * r1, c1 * r1]]) push(P[0], P[1], P[2], 0, 1, 0, uu, vv);
        this.tris++;
      }
    }
  }


  // Trapezoid ridge along a to b (base centre line, 3D), bottom width w0, top width w1, height h: parapets, parados,
  // mounds, the sides of road embankments. Ends are left open (they sit inside the next piece).
  slope(key, a, b, w0, w1, h, col = 0xffffff, { u0 = 0, flat = false } = {}) {
    const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const P = (p, s, hh) => [p[0] + nx * s, p[1] + hh, p[2] + nz * s];
    const sl = Math.hypot(h, (w0 - w1) / 2);
    const L = [[u0, 0], [u0 + l, 0], [u0 + l, sl], [u0, sl]];
    this.quad(key, P(a, w0 / 2, 0), P(b, w0 / 2, 0), P(b, w1 / 2, h), P(a, w1 / 2, h), col, L);
    this.quad(key, P(b, -w0 / 2, 0), P(a, -w0 / 2, 0), P(a, -w1 / 2, h), P(b, -w1 / 2, h), col, L);
    this.quad(key, P(a, w1 / 2, h), P(b, w1 / 2, h), P(b, -w1 / 2, h), P(a, -w1 / 2, h), col, [[u0, 0], [u0 + l, 0], [u0 + l, w1], [u0, w1]]);
  }

  // Upper half of a cylinder along a to b (3D, a at the base of the arch), outward faces: elephant iron, Nissen huts,
  // the roofs of dugouts and gun pits.
  arch(key, a, b, r, col = 0xffffff, { seg = 8, sx = 1, sy = 1 } = {}) {
    const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    for (let i = 0; i < seg; i++) {
      const t0 = Math.PI * i / seg, t1 = Math.PI * (i + 1) / seg;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const P = (p, c, s) => [p[0] + nx * c * r, p[1] + s * r * sy, p[2] + nz * c * r];
      const arc = r * (t1 - t0);
      this.quad(key, P(a, c0, s0), P(b, c0, s0), P(b, c1, s1), P(a, c1, s1), col, [[0, arc * i], [l, arc * i], [l, arc * (i + 1)], [0, arc * (i + 1)]]);
    }
  }


  // cylinder / cone-frustum along any axis from a to b (3D), radius r0 at a and r1 at b; flat-shaded rings of `seg` sides
  tube(key, a, b, r0, r1 = r0, seg = 8, col = 0xffffff, { capA = true, capB = true, u0 = 0 } = {}) {
    const bk = this.bucket(key), t = lin(col);
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
    const ax = dx / L, ay = dy / L, az = dz / L;
    // any vector not parallel to the axis seeds the frame
    let ux, uy, uz;
    if (Math.abs(ay) < 0.9) { ux = -az; uy = 0; uz = ax; } else { ux = 1; uy = 0; uz = 0; }
    let l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    const ring = (p, r, k) => { const c = Math.cos(k), s = Math.sin(k); return [p[0] + (ux * c + vx * s) * r, p[1] + (uy * c + vy * s) * r, p[2] + (uz * c + vz * s) * r, ux * c + vx * s, uy * c + vy * s, uz * c + vz * s]; };
    const push = (p, n, u, v) => { bk.p.push(p[0], p[1], p[2]); bk.n.push(n[0], n[1], n[2]); bk.uv.push(u, v); bk.c.push(t[0], t[1], t[2]); };
    for (let i = 0; i < seg; i++) {
      const k0 = (i / seg) * Math.PI * 2, k1 = ((i + 1) / seg) * Math.PI * 2;
      const A0 = ring(a, r0, k0), A1 = ring(a, r0, k1), B0 = ring(b, r1, k0), B1 = ring(b, r1, k1);
      const circ = Math.max(r0, r1) * 2 * Math.PI, u = u0 + (i / seg) * circ, u2 = u0 + ((i + 1) / seg) * circ;
      for (const [P, N, uu, vv] of [[A0, A0, u, 0], [A1, A1, u2, 0], [B1, B1, u2, L], [A0, A0, u, 0], [B1, B1, u2, L], [B0, B0, u, L]]) push(P, [N[3], N[4], N[5]], uu, vv);
      this.tris += 2;
      if (capB && r1 > 0.002) { for (const P of [b, B0, B1]) push(P, [ax, ay, az], 0, 0); this.tris++; }
      if (capA && r0 > 0.002) { for (const P of [a, A1, A0]) push(P, [-ax, -ay, -az], 0, 0); this.tris++; }
    }
  }

  // ellipsoid of radii rx, ry, rz at (cx, cy, cz), yawed by ry0: horse bodies, sandbag-ish lumps, boulders
  ell(key, cx, cy, cz, rx, ry, rz, yaw = 0, col = 0xffffff, seg = 8, lump = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rows = Math.max(3, seg >> 1);
    const P = (i, j) => {
      const th = (i / seg) * Math.PI * 2, ph = -Math.PI / 2 + (j / rows) * Math.PI;
      const pole = j === 0 || j === rows;
      const k = lump ? 1 + (h2((pole ? 0 : i % seg) + cx, j + cz, 17) - 0.5) * lump * (pole ? 0.3 : 1) : 1;
      const x = Math.cos(ph) * Math.cos(th) * rx * k, y = Math.sin(ph) * ry * k, z = Math.cos(ph) * Math.sin(th) * rz * k;
      return [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1);
      const uvOf = (p) => [(p[0] - cx) + (p[1] - cy) * 0.6 + cx * 0.3, (p[2] - cz) + (p[1] - cy) * 0.6 + cz * 0.3];
      const ua = uvOf(a), ub = uvOf(b), uc = uvOf(cc), ud = uvOf(d);
      if (j === 0) this.tri(key, a, d, cc, col, [ua, ud, uc]);
      else if (j === rows - 1) this.tri(key, a, d, b, col, [ua, ud, ub]);
      else this.quad(key, a, d, cc, b, col, [ua, ud, uc, ub]);
    }
  }

  // horizontal ribbon through 3D points (y already includes any lift), `w` wide, u along the length in metres
  ribbon(key, pts, w, col = 0xffffff, { vScale = 1, u0 = 0, swap = false } = {}) {
    let u = u0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
      this.quad(key, [a[0] + nx, a[1], a[2] + nz], [b[0] + nx, b[1], b[2] + nz], [b[0] - nx, b[1], b[2] - nz], [a[0] - nx, a[1], a[2] - nz], col,
        swap ? [[0, u], [0, u + l], [w * vScale, u + l], [w * vScale, u]] : [[u, 0], [u + l, 0], [u + l, w * vScale], [u, w * vScale]], [0, 1, 0]);
      u += l;
    }
  }

  // Turn the buckets into meshes under `parent`. mats[key] is the material.
  build(parent, mats, { shadow = true, receive = true, name = '' } = {}) {
    const out = [];
    for (const [key, b] of this.b) {
      if (!b.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.p), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.n), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.c), 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[key]);
      m.name = name + key;
      const transparent = mats[key].transparent;
      m.castShadow = shadow && !transparent && !mats[key].userData.noShadow;
      m.receiveShadow = receive;
      parent.add(m);
      out.push(m);
    }
    this.b.clear();
    return out;
  }
}

// dispose the geometry of everything under a group (materials are shared and stay)
export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  g.removeFromParent();
}

// vertex-colour multipliers: grey(0.8) darkens, warm(0.9, ...) tints; clamp 0..1 keeps textures from blowing out
export const grey = (k) => { const v = Math.max(0, Math.min(255, Math.round(k * 255))); return (v << 16) | (v << 8) | v; };
export const rgbk = (r, g, b) => {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
};

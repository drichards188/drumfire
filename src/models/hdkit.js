import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { projectUV } from './kit.js';
import { smoothstep } from '../noise.js';

// The HD modelling kit (the max-quality hero gun, shots/maxq/PLAN.md 3.1). Everything is indexed geometry with
// per-vertex metric UVs (cylindrical on lathes, tubes and rings, by the vertex's own normal on flat parts), so the
// camouflage and the normal map run on without the per-triangle sawtooth of kit.js projectUV, and a shade multiplier
// baked into the vertex colour (occlusion in bores, slots and between cheeks). Builders write UVs in metres; HDParts
// scales them to the kit's 4 m paint tile. Nothing here runs at import: the module only defines functions, so a page
// that never asks for an HD gun pays nothing but the parse.

export const TAU = Math.PI * 2;
const TILE = 4; // metres per UV unit: the camouflage tile of kit.js camoTextures
// the kit's keys that get metric box UVs in Parts.add (kit.js PROJECTED), for ported standard parts
const PROJECTED = new Set(['camo', 'paint', 'dark', 'steel', 'tyre', 'rim', 'rubber', 'canister', 'white', 'brass', 'rust', 'cloth', 'green', 'sand', 'timber', 'iron', 'shell', 'chain', 'rope', 'soil']);

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _n3 = new THREE.Matrix3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// a transform: position, Euler rotation (XYZ), uniform or per-axis scale
export function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  if (typeof s === 'number') _s.set(s, s, s); else _s.copy(s);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
}
export const at = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(M4(x, y, z, rx, ry, rz, s));
// a transform that takes +Y to the direction a -> b, origin at a (rods, bolts, struts)
export function along(a, b) {
  const d = _a.copy(b).sub(a), len = d.length();
  _q.setFromUnitVectors(_b.set(0, 1, 0), d.divideScalar(len || 1));
  return new THREE.Matrix4().compose(a, _q, _s.set(1, 1, 1));
}

// a BufferGeometry from plain arrays (uv in metres)
export function geo(pos, nrm, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (idx) g.setIndex(idx);
  return g;
}

// flat shading for small faceted parts (nuts, prisms): every triangle its own vertices and face normal, re-indexed
export function flat(g) {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute('normal');
  f.computeVertexNormals();
  const n = f.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  f.setIndex(new THREE.BufferAttribute(idx, 1));
  return f;
}

/**
 * A surface of revolution. `profile` is [[a, r], ...]: a along the axis, r the radius; listed from low a to high a the
 * normals face out, listed backwards they face in (a bore). Smooth, split at corners sharper than `crease` degrees;
 * `fillet` (m) first rounds every inner corner of the profile with `fn` extra points, so shoulders catch a highlight.
 * axis 'x' | 'y' | 'z' through c = the other two coordinates (x: [y, z], y: [x, z], z: [x, y], like kit.js xTube/yTube/
 * zTube). phi0/phiLen: a part turn (the mudguards). UVs in metres: u round the circumference at radius `ref` (default
 * the largest r), v along the profile, so the paint runs on over steps and faces. The seam is underneath by default.
 */
export function lathe(profile, { seg = 64, axis = 'z', c = [0, 0], crease = 35, fillet = 0, fn = 3, phi0 = -Math.PI / 2, phiLen = TAU, ref = 0 } = {}) {
  let P = profile.map(([a, r]) => [a, Math.max(r, 0)]);
  if (fillet > 0 && P.length > 2) P = filletPath(P, fillet, fn);
  const A = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
  const U = axis === 'x' ? [0, 0, 1] : [1, 0, 0];
  const W = axis === 'y' ? [0, 0, 1] : [0, 1, 0];
  const C = axis === 'x' ? [0, c[0], c[1]] : axis === 'y' ? [c[0], 0, c[1]] : [c[0], c[1], 0];
  const R = ref || P.reduce((m, p) => Math.max(m, p[1]), 0) || 0.01;
  const n = P.length, segN = [], segL = [];
  for (let k = 0; k < n - 1; k++) {
    const da = P[k + 1][0] - P[k][0], dr = P[k + 1][1] - P[k][1], l = Math.hypot(da, dr);
    segL.push(l);
    segN.push(l > 1e-9 ? [-dr / l, da / l] : null);
  }
  // fill missing normals (zero-length segments) from a neighbour
  for (let k = 0; k < segN.length; k++) if (!segN[k]) segN[k] = segN[k - 1] ?? segN.find((x) => x) ?? [0, 1];
  const cosC = Math.cos((crease * Math.PI) / 180);
  const rings = []; // { i, nIn, nOut, v } per point: ring ids for the segment before and after
  const pos = [], nrm = [], uv = [], idx = [];
  const cols = phiLen >= TAU - 1e-6 ? seg + 1 : seg + 1;
  let v = 0;
  const ring = (p, nn, vv) => {
    const id = pos.length / 3;
    const len = Math.hypot(nn[0], nn[1]) || 1, na = nn[0] / len, nr = nn[1] / len;
    for (let j = 0; j < cols; j++) {
      const phi = phi0 + (phiLen * j) / seg, co = Math.cos(phi), si = Math.sin(phi);
      const rx = U[0] * co + W[0] * si, ry = U[1] * co + W[1] * si, rz = U[2] * co + W[2] * si;
      pos.push(C[0] + A[0] * p[0] + rx * p[1], C[1] + A[1] * p[0] + ry * p[1], C[2] + A[2] * p[0] + rz * p[1]);
      nrm.push(A[0] * na + rx * nr, A[1] * na + ry * nr, A[2] * na + rz * nr);
      uv.push(((phiLen * j) / seg) * R, vv);
    }
    return id;
  };
  for (let i = 0; i < n; i++) {
    if (i > 0) v += segL[i - 1];
    const nPrev = i > 0 ? segN[i - 1] : null, nNext = i < n - 1 ? segN[i] : null;
    if (nPrev && nNext) {
      const d = nPrev[0] * nNext[0] + nPrev[1] * nNext[1];
      if (d < cosC) rings.push({ in: ring(P[i], nPrev, v), out: ring(P[i], nNext, v) });
      else { const id = ring(P[i], [nPrev[0] + nNext[0], nPrev[1] + nNext[1]], v); rings.push({ in: id, out: id }); }
    } else { const id = ring(P[i], nPrev ?? nNext, v); rings.push({ in: id, out: id }); }
  }
  for (let k = 0; k < n - 1; k++) {
    if (segL[k] < 1e-9 || (P[k][1] < 1e-7 && P[k + 1][1] < 1e-7)) continue;
    const r0 = rings[k].out, r1 = rings[k + 1].in;
    // winding from the first quad against the profile's outward normal
    let flip = false;
    {
      const i0 = r0, i1 = r0 + 1, i2 = r1 + 1;
      _a.set(pos[i1 * 3] - pos[i0 * 3], pos[i1 * 3 + 1] - pos[i0 * 3 + 1], pos[i1 * 3 + 2] - pos[i0 * 3 + 2]);
      _b.set(pos[i2 * 3] - pos[i0 * 3], pos[i2 * 3 + 1] - pos[i0 * 3 + 1], pos[i2 * 3 + 2] - pos[i0 * 3 + 2]);
      _c.crossVectors(_a, _b);
      if (_c.lengthSq() < 1e-20) { // degenerate at the axis: test the other triangle
        const j0 = r0, j1 = r1 + 1, j2 = r1;
        _a.set(pos[j1 * 3] - pos[j0 * 3], pos[j1 * 3 + 1] - pos[j0 * 3 + 1], pos[j1 * 3 + 2] - pos[j0 * 3 + 2]);
        _b.set(pos[j2 * 3] - pos[j0 * 3], pos[j2 * 3 + 1] - pos[j0 * 3 + 1], pos[j2 * 3 + 2] - pos[j0 * 3 + 2]);
        _c.crossVectors(_a, _b);
      }
      const nx = nrm[r0 * 3] + nrm[r1 * 3 + 3], ny = nrm[r0 * 3 + 1] + nrm[r1 * 3 + 4], nz = nrm[r0 * 3 + 2] + nrm[r1 * 3 + 5];
      flip = _c.x * nx + _c.y * ny + _c.z * nz < 0;
    }
    for (let j = 0; j < seg; j++) {
      const a = r0 + j, b = r0 + j + 1, c2 = r1 + j + 1, d = r1 + j;
      if (P[k][1] > 1e-7) { if (flip) idx.push(a, c2, b); else idx.push(a, b, c2); }
      if (P[k + 1][1] > 1e-7) { if (flip) idx.push(a, d, c2); else idx.push(a, c2, d); }
    }
  }
  return geo(pos, nrm, uv, idx);
}

// round the inner corners of a 2D path [[x, y], ...] with radius r (quadratic arcs of fn + 1 points)
export function filletPath(P, r, fn = 3) {
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], [cx, cy] = P[i + 1];
    let d1x = bx - ax, d1y = by - ay, d2x = cx - bx, d2y = cy - by;
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    if (l1 < 1e-9 || l2 < 1e-9) { out.push(P[i]); continue; }
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    const turn = Math.acos(Math.min(1, Math.max(-1, d1x * d2x + d1y * d2y)));
    if (turn < 0.02) { out.push(P[i]); continue; }
    const t = Math.min(r * Math.tan(turn / 2), l1 * 0.45, l2 * 0.45);
    const p0 = [bx - d1x * t, by - d1y * t], p2 = [bx + d2x * t, by + d2y * t];
    for (let k = 0; k <= fn; k++) {
      const s = k / fn, w0 = (1 - s) * (1 - s), w1 = 2 * s * (1 - s), w2 = s * s;
      out.push([w0 * p0[0] + w1 * bx + w2 * p2[0], w0 * p0[1] + w1 * by + w2 * p2[1]]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

// convenience lathes: a tube (solid cylinder with flat ends, the ends chamfered by ch) along an axis
export function cyl(a0, a1, r0, r1 = r0, { seg = 48, axis = 'z', c = [0, 0], ch = 0, inner = 0 } = {}) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), rl = a0 < a1 ? r0 : r1, rh = a0 < a1 ? r1 : r0;
  const k = Math.min(ch, (hi - lo) * 0.3, rl * 0.3, rh * 0.3);
  const prof = [[lo, inner]];
  if (k > 0) prof.push([lo, rl - k], [lo + k, rl], [hi - k, rh], [hi, rh - k]); else prof.push([lo, rl], [hi, rh]);
  prof.push([hi, inner]);
  if (inner > 0) prof.push([lo, inner]);
  return lathe(prof, { seg, axis, c });
}
// an annulus about an axis (rings, collars, bands) with chamfered edges
export function annulus(a0, a1, rIn, rOut, { seg = 64, axis = 'z', c = [0, 0], ch = 0.002 } = {}) {
  const k = Math.min(ch, (a1 - a0) * 0.3, (rOut - rIn) * 0.3);
  return lathe([[a0, rIn + k], [a0, rOut - k], [a0 + k, rOut], [a1 - k, rOut], [a1, rOut - k], [a1, rIn + k], [a1 - k, rIn], [a0 + k, rIn], [a0, rIn + k]], { seg, axis, c });
}

/**
 * A box with 45 degree chamfers of width `c` on all twelve edges (26 flat faces, 44 triangles), centred at the origin
 * then placed; the default HD box, so every edge catches a highlight line.
 */
export function chamferBox(w, h, d, c = 0.006, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const hx = w / 2, hy = h / 2, hz = d / 2, k = Math.max(0, Math.min(c, hx * 0.45, hy * 0.45, hz * 0.45));
  const pos = [], nrm = [], idx = [];
  const P = (sx, sy, sz, f) => f === 0 ? [sx * hx, sy * (hy - k), sz * (hz - k)] : f === 1 ? [sx * (hx - k), sy * hy, sz * (hz - k)] : [sx * (hx - k), sy * (hy - k), sz * hz];
  const face = (pts) => {
    // outward by the centroid (the solid is convex about the origin)
    const id = pos.length / 3;
    _a.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
    _b.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
    _c.crossVectors(_a, _b).normalize();
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const flip = _c.x * cx + _c.y * cy + _c.z * cz < 0;
    if (flip) _c.negate();
    for (const p of pts) { pos.push(p[0], p[1], p[2]); nrm.push(_c.x, _c.y, _c.z); }
    for (let i = 1; i < pts.length - 1; i++) { if (flip) idx.push(id, id + i + 1, id + i); else idx.push(id, id + i, id + i + 1); }
  };
  for (const s of [-1, 1]) {
    face([P(s, -1, -1, 0), P(s, 1, -1, 0), P(s, 1, 1, 0), P(s, -1, 1, 0)]);
    face([P(-1, s, -1, 1), P(1, s, -1, 1), P(1, s, 1, 1), P(-1, s, 1, 1)]);
    face([P(-1, -1, s, 2), P(1, -1, s, 2), P(1, 1, s, 2), P(-1, 1, s, 2)]);
  }
  if (k > 0) {
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      face([P(a, b, -1, 0), P(a, b, 1, 0), P(a, b, 1, 1), P(a, b, -1, 1)]); // edges along z
      face([P(-1, a, b, 1), P(1, a, b, 1), P(1, a, b, 2), P(-1, a, b, 2)]); // along x
      face([P(a, -1, b, 0), P(a, 1, b, 0), P(a, 1, b, 2), P(a, -1, b, 2)]); // along y
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) face([P(sx, sy, sz, 0), P(sx, sy, sz, 1), P(sx, sy, sz, 2)]);
  }
  const g = geo(pos, nrm, null, idx);
  return x || y || z || rx || ry || rz ? at(g, x, y, z, rx, ry, rz) : g;
}

// a chamfered bar between two points (square section s x t, the t side facing `up`)
export function bar(a, b, s, t = s, c = 0.003, up = null) {
  const len = a.distanceTo(b), g = chamferBox(s, len, t, c).translate(0, len / 2, 0);
  const m = along(a, b);
  if (up) { // roll the bar so its local z faces `up` as nearly as possible
    const d = _a.copy(b).sub(a).normalize(), z0 = _b.set(0, 0, 1).applyQuaternion(_q.setFromRotationMatrix(m)), u = _c.copy(up).addScaledVector(d, -up.dot(d)).normalize();
    const ang = Math.atan2(_v.crossVectors(z0, u).dot(d), z0.dot(u));
    g.rotateY(ang);
  }
  return g.applyMatrix4(m);
}

// a regular n-gon prism along +Y from 0 to h (circumradius r), flat-shaded, the top edge chamfered by ch (nuts: the
// 30 degree ring of a hexagon nut), optionally a round boss on top
export function prism(n, r, h, ch = 0, phase = Math.PI / n) {
  const prof = ch > 0 ? [[0, 0], [0, r], [h - ch, r], [h, r - ch * 1.7], [h, 0]] : [[0, 0], [0, r], [h, r], [h, 0]];
  return flat(lathe(prof, { seg: n, axis: 'y', crease: 0, phi0: phase }));
}

// bake copies of a prototype geometry at many transforms into one indexed geometry (rivets, bolts, ticks)
export function instances(proto, mats) {
  const p = proto.attributes.position, nm = proto.attributes.normal, uvA = proto.attributes.uv, ix = proto.index;
  const nv = p.count, ni = ix ? ix.count : nv, N = mats.length;
  const pos = new Float32Array(nv * N * 3), nrm = new Float32Array(nv * N * 3), uv = uvA ? new Float32Array(nv * N * 2) : null, idx = new Uint32Array(ni * N);
  const e = new Float32Array(16);
  for (let k = 0; k < N; k++) {
    const m = mats[k];
    for (let i = 0; i < 16; i++) e[i] = m.elements[i];
    _n3.getNormalMatrix(m);
    const ne = _n3.elements;
    for (let i = 0; i < nv; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), o = (k * nv + i) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (nm) {
        const a = nm.getX(i), b = nm.getY(i), c = nm.getZ(i);
        let qx = ne[0] * a + ne[3] * b + ne[6] * c, qy = ne[1] * a + ne[4] * b + ne[7] * c, qz = ne[2] * a + ne[5] * b + ne[8] * c;
        const l = Math.hypot(qx, qy, qz) || 1;
        nrm[o] = qx / l; nrm[o + 1] = qy / l; nrm[o + 2] = qz / l;
      }
      if (uv) { uv[(k * nv + i) * 2] = uvA.getX(i); uv[(k * nv + i) * 2 + 1] = uvA.getY(i); }
    }
    for (let i = 0; i < ni; i++) idx[k * ni + i] = (ix ? ix.getX(i) : i) + k * nv;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// a transform standing an item on a surface point p with normal nrm (its +Y along nrm), spun by `spin` about it
export function onSurface(p, nrm, s = 1, spin = 0) {
  _q.setFromUnitVectors(_a.set(0, 1, 0), _b.copy(nrm).normalize());
  if (spin) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_c.set(0, 1, 0), spin));
  return new THREE.Matrix4().compose(p, _q, typeof s === 'number' ? _s.set(s, s, s) : s);
}

// merge a list of geometries that may mix indexed and plain (gives the plain ones a trivial index first)
export function mergeHD(list) {
  const l = list.filter(Boolean).map((g) => {
    const c = g.clone();
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    if (!c.index) { const n = c.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; c.setIndex(new THREE.BufferAttribute(ix, 1)); }
    return c;
  });
  return l.length ? mergeGeometries(l, false) : null;
}

// ---------------------------------------------------------------- the parts collector

/**
 * Collects geometry per material key and merges each key into one indexed geometry (or mesh). add(key, geom, o):
 *   o.uv  'box' (default): per-vertex box projection by the vertex's own normal (flat parts: no per-triangle jumps);
 *         'cyl': cylindrical about o.axis ('x' | 'y' | 'z') through o.c at radius o.ref (default each vertex's own), the
 *         seam split per triangle, caps (normal along the axis) planar;
 *         'keep': the geometry's uv, already in metres (hdkit's lathes, tubes, tori);
 *         'std': exactly what kit.js Parts.add does (non-indexed, per-triangle projection), for ported standard parts
 *         that must look as before.
 *   o.shade(x, y, z, nx, ny, nz) -> a multiplier baked into the vertex colour; o.tint a colour.
 * merge({ dirt, y0 }) gives [{ key, geometry }] with position, normal, uv, color, aH and an index (the attributes the
 * field materials' finish shader reads); build(parent, { dirt, y0, shadow, tier }) makes the meshes, named by key.
 */
export class HDParts {
  constructor(mats) {
    this.mats = mats;
    this.lists = new Map();
  }

  add(key, geom, o = {}) {
    if (!geom) return this;
    const mode = o.uv ?? 'box';
    let g;
    if (mode === 'std') {
      g = geom.index ? geom.toNonIndexed() : geom.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (PROJECTED.has(key)) projectUV(g, TILE);
      const n = g.attributes.position.count, ix = new Uint32Array(n);
      for (let i = 0; i < n; i++) ix[i] = i;
      g.setIndex(new THREE.BufferAttribute(ix, 1));
    } else {
      g = geom.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (mode === 'keep' && g.attributes.uv) {
        const u = g.attributes.uv;
        const a = new Float32Array(u.count * 2);
        for (let i = 0; i < u.count; i++) { a[i * 2] = u.getX(i) / TILE; a[i * 2 + 1] = u.getY(i) / TILE; }
        g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
      } else if (mode === 'cyl') cylUV(g, o.axis ?? 'z', o.c ?? [0, 0], o.ref ?? 0);
      else boxUV(g);
    }
    // the vertex colour: tint times the baked shade
    const p = g.attributes.position, nm = g.attributes.normal, col = new Float32Array(p.count * 3), tc = new THREE.Color(o.tint ?? 0xffffff);
    for (let i = 0; i < p.count; i++) {
      const k = o.shade ? o.shade(p.getX(i), p.getY(i), p.getZ(i), nm.getX(i), nm.getY(i), nm.getZ(i)) : 1;
      col[i * 3] = tc.r * k; col[i * 3 + 1] = tc.g * k; col[i * 3 + 2] = tc.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return this;
  }

  get empty() { return this.lists.size === 0; }

  // merged geometry per key, with the dirt gradient (kit.js Parts.build's) and the height above the ground (aH)
  merge({ dirt = 0, y0 = 0 } = {}) {
    const out = [];
    for (const [key, list] of this.lists) {
      const g = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      if (!g) continue;
      const p = g.attributes.position, c = g.attributes.color;
      if (dirt > 0 && key !== 'glass' && key !== 'lens' && key !== 'array') {
        for (let i = 0; i < p.count; i++) {
          const s = smoothstep(0.15, 1.7, p.getY(i) + y0);
          const f = 1 - dirt * 0.6 * (1 - s);
          c.setXYZ(i, c.getX(i) * f * (1 - dirt * 0.6 * (1 - s) * 0.05), c.getY(i) * f * (1 - dirt * 0.6 * (1 - s) * 0.16), c.getZ(i) * f * (1 - dirt * 0.6 * (1 - s) * 0.3));
        }
      }
      const ah = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) ah[i] = p.getY(i) + y0;
      g.setAttribute('aH', new THREE.BufferAttribute(ah, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.push({ key, geometry: g });
    }
    this.lists.clear();
    return out;
  }

  build(parent, { dirt = 0, y0 = 0, shadow = true, tier = 'hd' } = {}) {
    return this.merge({ dirt, y0 }).map(({ key, geometry }) => meshOf(parent, geometry, this.mats, key, tier, shadow));
  }
}

// one HD mesh over a (possibly shared) geometry: named by its material key, tagged with its tier
export function meshOf(parent, geometry, mats, key, tier = 'hd', shadow = true) {
  const mat = mats[key] ?? mats.dark;
  const m = new THREE.Mesh(geometry, mat);
  m.name = key;
  m.userData.tier = tier;
  m.castShadow = shadow && tier !== 'micro';
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// per-vertex box projection by the vertex's own normal (metres / TILE)
function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u / TILE; uv[i * 2 + 1] = v / TILE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// cylindrical UVs about an axis: u = angle times the radius (ref, or the vertex's own), v = along the axis; triangles
// that straddle the seam get their own copies of the vertices past it, so u never wraps inside a triangle
function cylUV(g, axis, c, ref) {
  const p = g.attributes.position, n = g.attributes.normal, N = p.count;
  const ia = axis === 'x' ? 0 : axis === 'y' ? 1 : 2, iu = axis === 'x' ? 2 : 0, iw = axis === 'y' ? 2 : 1;
  const cu = axis === 'x' ? c[1] : c[0], cw = axis === 'x' ? c[0] : c[1];
  const ang = new Float32Array(N), cap = new Uint8Array(N), rad = new Float32Array(N);
  const comp = (attr, i, k) => (k === 0 ? attr.getX(i) : k === 1 ? attr.getY(i) : attr.getZ(i));
  for (let i = 0; i < N; i++) {
    const du = comp(p, i, iu) - cu, dw = comp(p, i, iw) - cw;
    ang[i] = Math.atan2(-du, -dw); // the seam (+-PI) underneath for the x and z axes
    rad[i] = Math.hypot(du, dw);
    cap[i] = Math.abs(comp(n, i, ia)) > 0.72 ? 1 : 0;
  }
  const idx = Uint32Array.from(g.index.array), extra = [];
  let next = N;
  const remap = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2];
    if (cap[a] && cap[b] && cap[d]) continue;
    const mx = Math.max(ang[a], ang[b], ang[d]), mn = Math.min(ang[a], ang[b], ang[d]);
    if (mx - mn <= Math.PI) continue;
    for (let k = 0; k < 3; k++) {
      const vi = idx[t + k];
      if (ang[vi] < 0 && !cap[vi]) {
        let cp = remap.get(vi);
        if (cp === undefined) { cp = next++; remap.set(vi, cp); extra.push(vi); }
        idx[t + k] = cp;
      }
    }
  }
  const M = N + extra.length;
  const grow = (attr, size) => {
    const a = new Float32Array(M * size);
    a.set(attr.array.subarray(0, N * size));
    extra.forEach((vi, k) => { for (let s = 0; s < size; s++) a[(N + k) * size + s] = attr.array[vi * size + s]; });
    return new THREE.BufferAttribute(a, size);
  };
  if (extra.length) {
    g.setAttribute('position', grow(p, 3));
    g.setAttribute('normal', grow(n, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const P2 = g.attributes.position, uv = new Float32Array(M * 2);
  for (let i = 0; i < M; i++) {
    const src = i < N ? i : extra[i - N];
    const r = ref || rad[src], x = comp(P2, i, ia);
    if (cap[src]) { uv[i * 2] = (comp(P2, i, iu) - cu) / TILE; uv[i * 2 + 1] = (comp(P2, i, iw) - cw) / TILE; continue; }
    const a = ang[src] + (i >= N ? TAU : 0);
    uv[i * 2] = (a * r) / TILE; uv[i * 2 + 1] = x / TILE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------- plates, sectors, bars

/**
 * A bevelled plate: an outline [[u, v], ...] (holes: outlines too) extruded by thickness t with a bevel that stays
 * inside the outline. axis 'x': the outline in (z, y), across x (kit.js sideProfile's frame); 'y': in (x, -z), up y
 * (a deck plate); 'z': in (x, y), along z. Centred on the plate's mid-plane.
 */
export function bevelPlate(outline, t, { bevel = 0.004, axis = 'x', curveSegments = 12, holes = [], bevelSegments = 2 } = {}) {
  const sh = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const b = Math.min(bevel, t * 0.3);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-4, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments, curveSegments });
  g.translate(0, 0, -(t - 2 * b) / 2);
  if (axis === 'x') g.rotateY(-Math.PI / 2);
  else if (axis === 'y') g.rotateX(-Math.PI / 2);
  return g;
}

// a closed solid sector of a ring about an axis: radii r0..r1, angle a0..a1 (rad, from the lathe's seam), a0..a1 along
// the axis span h0..h1; for merlons, castellations, gear teeth on a drum
export function ringSector(r0, r1, a0, a1, h0, h1, { seg = 4, axis = 'z', c = [0, 0], phi = -Math.PI / 2 } = {}) {
  const g = lathe([[h0, r0], [h0, r1], [h1, r1], [h1, r0], [h0, r0]], { seg, axis, c, crease: 30, phi0: phi + a0, phiLen: a1 - a0 });
  // end caps (a part turn of a lathe is open at both ends)
  const A = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1], U = axis === 'x' ? [0, 0, 1] : [1, 0, 0], W = axis === 'y' ? [0, 0, 1] : [0, 1, 0];
  const C = axis === 'x' ? [0, c[0], c[1]] : axis === 'y' ? [c[0], 0, c[1]] : [c[0], c[1], 0];
  const caps = [];
  for (const [ang, s] of [[phi + a0, -1], [phi + a1, 1]]) {
    const co = Math.cos(ang), si = Math.sin(ang), R = [U[0] * co + W[0] * si, U[1] * co + W[1] * si, U[2] * co + W[2] * si];
    const P = (r, h) => [C[0] + A[0] * h + R[0] * r, C[1] + A[1] * h + R[1] * r, C[2] + A[2] * h + R[2] * r];
    const q = [P(r0, h0), P(r1, h0), P(r1, h1), P(r0, h1)];
    // the cap's normal is the tangent direction (-sin, cos) times s
    const T = [-(U[0] * si) + W[0] * co, -(U[1] * si) + W[1] * co, -(U[2] * si) + W[2] * co].map((x) => x * s);
    const pos = q.flat(), nrm = [...T, ...T, ...T, ...T];
    _a.set(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]); _b.set(q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]); _c.crossVectors(_a, _b);
    const idx = _c.x * T[0] + _c.y * T[1] + _c.z * T[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    caps.push(geo(pos, nrm, null, idx));
  }
  return mergeHD([g, ...caps]);
}

// a castellated ring (the recoil cylinder's crown, a gland nut): a base ring of height h - d with n merlons of depth d
export function castellated(r0, r1, h, n, d, { axis = 'z', c = [0, 0], a0 = 0, seg = 96 } = {}) {
  const list = [annulus(a0, a0 + h - d, r0, r1, { seg, axis, c, ch: 0.002 })];
  const pitch = TAU / n;
  for (let i = 0; i < n; i++) list.push(ringSector(r0, r1, i * pitch, i * pitch + pitch * 0.55, a0 + h - d - 0.001, a0 + h, { seg: 3, axis, c }));
  return mergeHD(list);
}

// a knurled drum about an axis (sight drums, dial bezels, knobs): n ridges round, chamfered ends
export function knurled(r, h, { n = 48, depth = 0.0015, axis = 'x', c = [0, 0], a0 = 0, ch = 0.002 } = {}) {
  const N = n * 4, rows = [a0 + ch, a0 + h - ch];
  const A = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1], U = axis === 'x' ? [0, 0, 1] : [1, 0, 0], W = axis === 'y' ? [0, 0, 1] : [0, 1, 0];
  const C = axis === 'x' ? [0, c[0], c[1]] : axis === 'y' ? [c[0], 0, c[1]] : [c[0], c[1], 0];
  const pos = [], uv = [], idx = [];
  for (const a of rows) for (let j = 0; j <= N; j++) {
    const phi = (j / N) * TAU, co = Math.cos(phi), si = Math.sin(phi), rr = r - depth * (0.5 - 0.5 * Math.cos(n * phi));
    pos.push(C[0] + A[0] * a + (U[0] * co + W[0] * si) * rr, C[1] + A[1] * a + (U[1] * co + W[1] * si) * rr, C[2] + A[2] * a + (U[2] * co + W[2] * si) * rr);
    uv.push(phi * r, a);
  }
  for (let j = 0; j < N; j++) idx.push(j, j + 1, N + 2 + j, j, N + 2 + j, N + 1 + j);
  const side = geo(pos, null, uv, idx);
  side.computeVertexNormals();
  fixWinding(side, (x, y, z) => [x - C[0] - A[0] * (x * A[0] + y * A[1] + z * A[2]), y - C[1] - A[1] * (x * A[0] + y * A[1] + z * A[2]), z - C[2] - A[2] * (x * A[0] + y * A[1] + z * A[2])]);
  const capR = r - depth;
  const ends = lathe([[a0, 0], [a0, capR - ch], [a0 + ch, capR]], { seg: 48, axis, c });
  const ends2 = lathe([[a0 + h - ch, capR], [a0 + h, capR - ch], [a0 + h, 0]], { seg: 48, axis, c });
  return mergeHD([side, ends, ends2]);
}

// make every triangle face along out(x, y, z) (an outward direction at a point): for generated grids
function fixWinding(g, out) {
  const p = g.attributes.position, ix = g.index.array;
  for (let t = 0; t < ix.length; t += 3) {
    _a.fromBufferAttribute(p, ix[t]); _b.fromBufferAttribute(p, ix[t + 1]); _c.fromBufferAttribute(p, ix[t + 2]);
    const cx = (_a.x + _b.x + _c.x) / 3, cy = (_a.y + _b.y + _c.y) / 3, cz = (_a.z + _b.z + _c.z) / 3;
    _b.sub(_a); _c.sub(_a); _b.cross(_c);
    const o = out(cx, cy, cz);
    if (_b.x * o[0] + _b.y * o[1] + _b.z * o[2] < 0) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
  }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// an angle iron (L section) along +Z from 0 to len: legs a (along +X) and b (along +Y), thickness t, the outer corner at
// the origin; bevelled edges
export function angleIron(len, a, b, t, { bevel = 0.0015 } = {}) {
  const o = [[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]];
  const sh = new THREE.Shape(o.map(([x, y]) => new THREE.Vector2(x, y)));
  const bb = Math.min(bevel, t * 0.3);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len - 2 * bb, bevelEnabled: bb > 0, bevelThickness: bb, bevelSize: bb, bevelOffset: -bb, bevelSegments: 1, curveSegments: 1 });
  return g.translate(0, 0, bb);
}

// ---------------------------------------------------------------- fasteners and furniture (prototypes along +Y)

// a snap (button) rivet head of radius r: a 1 mm foot ring and a dome, 10 round; stand copies with rivetsHD
export function rivetHead(r = 0.014, seg = 10) {
  const h = r * 0.62;
  return lathe([[-0.002, 0], [-0.002, r * 1.04], [0.0005, r * 1.02], [h * 0.3, r * 0.94], [h * 0.62, r * 0.76], [h * 0.88, r * 0.45], [h, 0]], { seg, axis: 'y', crease: 50 });
}
// rivet heads at points on a surface (one normal for all, or one per point), as one geometry
export function rivetsHD(pts, nrm, r = 0.014, seg = 10) {
  const proto = rivetHead(r, seg), ms = pts.map((p, i) => onSurface(p, Array.isArray(nrm) ? nrm[i] : nrm));
  return instances(proto, ms);
}
// points along a line a..b at a pitch (both ends included), optionally in pairs `gap` apart across `side`
export function rowPts(a, b, pitch, { pair = 0, side = null, skipEnds = false } = {}) {
  const n = Math.max(1, Math.round(a.distanceTo(b) / pitch)), out = [];
  for (let i = skipEnds ? 1 : 0; i <= (skipEnds ? n - 1 : n); i++) {
    const p = a.clone().lerp(b, i / n);
    if (pair && side) { out.push(p.clone().addScaledVector(side, pair / 2), p.clone().addScaledVector(side, -pair / 2)); } else out.push(p);
  }
  return out;
}

// a hex nut on a washer with the stud's chamfered end, standing on y = 0 (M20 by default: 30 mm across flats)
export function boltProto({ af = 0.03, h = 0.016, washer = true, stud = 0.008, seg = 16 } = {}) {
  const R = af / Math.sqrt(3), list = [];
  let y = 0;
  if (washer) { list.push(annulus(0, 0.003, af * 0.36, af * 0.62, { seg, axis: 'y', ch: 0.0006 })); y = 0.003; }
  list.push(prism(6, R, h, h * 0.18).translate(0, y, 0));
  if (stud > 0) list.push(cyl(y + h - 0.001, y + h + stud, af * 0.33, af * 0.33, { seg: 12, axis: 'y', ch: af * 0.06 }));
  return mergeHD(list);
}
export const boltsHD = (pts, nrm, o = {}) => instances(boltProto(o), pts.map((p, i) => onSurface(p, Array.isArray(nrm) ? nrm[i] : nrm, 1, o.spin ?? 0.3 * i)));

// a grease nipple (hex body, neck, ball) along +Y
export function nippleProto(s = 1) {
  return mergeHD([prism(6, 0.0065 * s, 0.007 * s, 0.0012 * s), cyl(0.0065 * s, 0.011 * s, 0.0028 * s, 0.0028 * s, { seg: 10, axis: 'y' }), lathe(sphereProfile(0.0042 * s, 0.0145 * s), { seg: 12, axis: 'y' })]);
}
const sphereProfile = (r, cy, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / n; return [cy + Math.sin(a) * r, Math.cos(a) * r]; });
// an oil cup: a turned cup with a domed hinged lid, along +Y
export function oilCupProto() {
  return mergeHD([
    lathe([[0, 0], [0, 0.007], [0.006, 0.007], [0.008, 0.0125], [0.022, 0.0125], [0.023, 0.011], [0.023, 0]], { seg: 24, axis: 'y', crease: 40 }),
    lathe([[0.023, 0.0135], [0.0255, 0.012], [0.028, 0.006], [0.0295, 0]], { seg: 24, axis: 'y' }),
    chamferBox(0.006, 0.006, 0.008, 0.001, 0, 0.024, -0.013),
  ]);
}
// a lifting eye on a boss, the eye standing in the YZ plane, along +Y
export function liftingEyeProto(r = 0.03, t = 0.009) {
  const ring = new THREE.TorusGeometry(r, t, 10, 28).rotateY(Math.PI / 2).translate(0, 0.016 + r * 0.95, 0);
  const tor = keepTorusUV(ring, r, t);
  return mergeHD([cyl(0, 0.016, r * 1.2, r * 1.05, { seg: 24, axis: 'y', ch: 0.003 }), tor]);
}
// metric UVs on a THREE.TorusGeometry (major radius R, tube r): u round the ring, v round the tube
export function keepTorusUV(g, R, r) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * R, uv.getY(i) * TAU * r);
  return g;
}
// a link chain from a to b sagging by `sag` (links 8 x 16)
export function chainHD(a, b, sag = 0.05, link = 0.03, wire = 0.0045) {
  const len = a.distanceTo(b), n = Math.max(2, Math.round((len * (1 + 2.7 * (sag / Math.max(0.05, len)) ** 2)) / (link * 0.8)));
  const pt = (t) => a.clone().lerp(b, t).add(_v.set(0, -4 * sag * t * (1 - t), 0));
  const proto = keepTorusUV(new THREE.TorusGeometry(link * 0.5, wire, 8, 16).scale(1.35, 1, 1), link * 0.5, wire), ms = [];
  for (let i = 0; i < n; i++) {
    const p = pt((i + 0.5) / n), d = pt(Math.min(1, (i + 1) / n)).sub(pt(Math.max(0, i / n))).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (i % 2) * Math.PI / 2));
    ms.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
  }
  return instances(proto, ms);
}

// a maker's or data plate (no insignia: a plain plate for text from the materials) lying in XY, its face toward +Z:
// the plate, a raised border and four rivets
export function dataPlate(w, h, t = 0.003, { border = 0.004, rivets = true } = {}) {
  const list = [chamferBox(w, h, t, 0.0008, 0, 0, t / 2)];
  const bt = 0.0012;
  list.push(chamferBox(w, border, bt, 0.0004, 0, h / 2 - border / 2, t + bt / 2), chamferBox(w, border, bt, 0.0004, 0, -h / 2 + border / 2, t + bt / 2));
  list.push(chamferBox(border, h - 2 * border, bt, 0.0004, w / 2 - border / 2, 0, t + bt / 2), chamferBox(border, h - 2 * border, bt, 0.0004, -w / 2 + border / 2, 0, t + bt / 2));
  if (rivets) { const r = rivetHead(0.0045, 8); for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) list.push(r.clone().rotateX(Math.PI / 2).translate(x * (w / 2 - 0.009), y * (h / 2 - 0.009), t)); }
  return mergeHD(list);
}

// ---------------------------------------------------------------- tubes: springs, cables, weld beads

// a tube along points (CatmullRom), uv in metres (u along, v round)
export function tubeAlong(points, r, { seg = 10, closed = false, per = 0.02, tension } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, tension != null ? 'catmullrom' : 'centripetal', tension ?? 0.5);
  const L = curve.getLength(), n = Math.max(4, Math.ceil(L / per));
  const g = new THREE.TubeGeometry(curve, n, r, seg, closed);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * TAU * r);
  return g;
}
// a coil spring along +Z from 0 to len (coil radius r, wire w), with hooked end loops standing in the YZ plane
export function springHD(r, len, turns, w, { hooks = true, perTurn = 28, seg = 10 } = {}) {
  const pts = [];
  if (hooks) for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 - i / 8); pts.push(new THREE.Vector3(0, r * 0.2 + Math.sin(a) * r * 0.75, -r * 0.9 + Math.cos(a) * r * 0.75 - r * 0.1)); }
  const N = turns * perTurn;
  for (let i = 0; i <= N; i++) { const t = i / N, a = t * turns * TAU + Math.PI / 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, t * len)); }
  if (hooks) for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); pts.push(new THREE.Vector3(0, r * 0.2 + Math.sin(a) * r * 0.75, len + r * 0.9 - Math.cos(a) * r * 0.75 + r * 0.1)); }
  return tubeAlong(pts, w, { seg, per: (TAU * r) / perTurn });
}
// a cable along points with a clip (a small strap) every `clip` m
export function cableHD(points, r = 0.005, { clip = 0.25, seg = 8 } = {}) {
  const t = tubeAlong(points, r, { seg, per: 0.02 }), list = [t];
  if (clip > 0) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'), L = curve.getLength();
    for (let s = clip / 2; s < L; s += clip) {
      const u = s / L, p = curve.getPointAt(u), d = curve.getTangentAt(u);
      list.push(chamferBox(r * 3.2, r * 3.2, 0.01, 0.0008).applyMatrix4(along(p.clone().addScaledVector(d, -0.005), p.clone().addScaledVector(d, 0.005))));
    }
  }
  return mergeHD(list);
}
// a weld bead along a polyline: a low rippled half-round
export function weldBead(points, r = 0.005) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'), L = curve.getLength(), n = Math.max(6, Math.ceil(L / 0.006));
  const g = new THREE.TubeGeometry(curve, n, r, 6, false), p = g.attributes.position, nm = g.attributes.normal;
  // ripples: push the surface out every 6 mm
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / 7), k = 1 + 0.12 * Math.cos(ring * Math.PI * 0.9);
    const cx = p.getX(i) - nm.getX(i) * r, cy = p.getY(i) - nm.getY(i) * r, cz = p.getZ(i) - nm.getZ(i) * r;
    p.setXYZ(i, cx + nm.getX(i) * r * k, cy + nm.getY(i) * r * k, cz + nm.getZ(i) * r * k);
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * TAU * r);
  return g;
}

// ---------------------------------------------------------------- wheels, gears, scales, gratings

/**
 * A handwheel about the X axis at the origin (kit.js handwheel's frame): an oval-section rim (rim = [radial, axial]
 * thickness), `spokes` tapered dished spokes, a hub with its nut and key, and a turned revolving handle on a pin
 * pointing +X at angle `ha` (rad, from +Y toward +Z), its grip centre at handleAt. Returns { geometry, knob: [x, y, z] }.
 */
export function handwheelHD(R, { spokes = 4, rim = [0.024, 0.03], dish = 0.022, hubR = 0.036, ha = 0.3 + Math.PI / 6, handle = { len: 0.095, r: 0.014 }, spoke0 = 0.3 } = {}) {
  const list = [], er = rim[0] / 2, ea = rim[1] / 2, prof = [];
  for (let i = 0; i <= 24; i++) { const t = Math.PI - (i / 24) * TAU; prof.push([Math.cos(t) * ea, R + Math.sin(t) * er]); }
  list.push(lathe(prof, { seg: 96, axis: 'x', crease: 80 }));
  // hub: a turned boss with a fillet, its nut and the shaft's key
  const hx = -dish; // the hub stands toward the gearbox (-X), the rim out toward the man
  list.push(lathe([[hx - 0.03, 0], [hx - 0.03, hubR * 0.85], [hx - 0.026, hubR], [hx + 0.024, hubR], [hx + 0.028, hubR * 0.86], [hx + 0.028, 0]], { seg: 40, axis: 'x', crease: 50 }));
  list.push(prism(6, 0.017, 0.014, 0.003).rotateZ(-Math.PI / 2).translate(hx + 0.028, 0, 0));
  list.push(cyl(hx + 0.04, hx + 0.046, 0.0105, 0.0105, { seg: 16, axis: 'x', ch: 0.002 }));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + spoke0, cy = Math.cos(a), sz = Math.sin(a);
    const p0 = new THREE.Vector3(hx, cy * hubR * 0.9, sz * hubR * 0.9), p1 = new THREE.Vector3(0, cy * (R - er * 0.6), sz * (R - er * 0.6));
    const len = p0.distanceTo(p1), sp = new THREE.CylinderGeometry(0.0085, 0.012, len, 10).scale(1.45, 1, 1).translate(0, len / 2, 0);
    // flatten the section across the wheel's plane: local x of the spoke toward the axis
    const m = along(p0, p1);
    const q = new THREE.Quaternion().setFromRotationMatrix(m), lx = new THREE.Vector3(1, 0, 0).applyQuaternion(q), want = new THREE.Vector3(1, 0, 0);
    const d = p1.clone().sub(p0).normalize(), wp = want.clone().addScaledVector(d, -want.dot(d)).normalize(), lp = lx.clone().addScaledVector(d, -lx.dot(d)).normalize();
    sp.rotateY(Math.atan2(new THREE.Vector3().crossVectors(lp, wp).dot(d), lp.dot(wp)));
    list.push(sp.applyMatrix4(m));
  }
  // the revolving handle on its pin, out of the rim's outer face
  const hy = Math.cos(ha) * (R + er * 0.15), hz = Math.sin(ha) * (R + er * 0.15), L = handle.len, hr = handle.r;
  list.push(cyl(ea * 0.6, ea + 0.012, 0.0065, 0.0065, { seg: 12, axis: 'x', c: [hy, hz] }));
  list.push(lathe([[ea + 0.01, 0], [ea + 0.01, hr * 0.8], [ea + 0.016, hr], [ea + L * 0.45, hr * 1.12], [ea + L - 0.012, hr * 0.95], [ea + L - 0.004, hr * 0.7], [ea + L, 0]], { seg: 20, axis: 'x', c: [hy, hz], crease: 60, fillet: 0.003 }));
  return { geometry: mergeHD(list), knob: [ea + L * 0.55, hy, hz] };
}

// trapezoidal (involute-like) gear teeth along an arc: [[x, y], ...] of the outer edge from angle a0 to a1 (radians, in
// the (u, v) plane, u = R cos a, v = R sin a) round the pitch radius Rp, module m
export function toothEdge(Rp, a0, a1, m, { per = 4 } = {}) {
  const pitchA = (Math.PI * m) / Rp, n = Math.max(1, Math.round((a1 - a0) / pitchA)), da = (a1 - a0) / n;
  const Ra = Rp + m, Rf = Rp - 1.25 * m, out = [];
  const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  for (let i = 0; i < n; i++) {
    const c = a0 + da * (i + 0.5), half = da * 0.5;
    // root, flank up (slightly curved), tip land, flank down, root
    out.push(P(Rf, c - half), P(Rf, c - half * 0.62));
    for (let k = 1; k <= per; k++) { const t = k / per; out.push(P(Rf + (Ra - Rf) * t, c - half * (0.62 - 0.36 * Math.pow(t, 0.85)))); }
    out.push(P(Ra, c + half * 0.26));
    for (let k = per - 1; k >= 0; k--) { const t = k / per; out.push(P(Rf + (Ra - Rf) * t, c + half * (0.62 - 0.36 * Math.pow(t, 0.85)))); }
  }
  out.push(P(Rf, a1));
  return out;
}
// a toothed sector (the elevating arc) in kit.js gearArc's frame: angle a in the (z, y) plane with (z, y) = (R cos a,
// -R sin a), inner radius R0, pitch radius Rp, across x by w
export function gearSector(R0, Rp, a0, a1, w, m, { bevel = 0.002 } = {}) {
  const inner = [];
  for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; inner.push([R0 * Math.cos(a), -R0 * Math.sin(a)]); }
  const edge = toothEdge(Rp, a0, a1, m).map(([u, v]) => [u, -v]).reverse();
  return bevelPlate([...inner, ...edge], w, { bevel, axis: 'x', curveSegments: 1 });
}
// a pinion of n teeth (module m) about the X axis, face width w, centred
export function pinion(n, m, w, { bore = 0, bevel = 0.0015 } = {}) {
  const Rp = (n * m) / 2, e = toothEdge(Rp, 0, TAU, m);
  e.pop();
  const g = bevelPlate(e.map(([u, v]) => [u, v]), w, { bevel, axis: 'z', curveSegments: 1, holes: bore ? [Array.from({ length: 16 }, (_, i) => [Math.cos(-i / 16 * TAU) * bore, Math.sin(-i / 16 * TAU) * bore])] : [] });
  return g.rotateY(Math.PI / 2);
}

// scale ticks round a ring about an axis (or along a line): n ticks, every `major`-th long; each a small box standing
// `h` proud of the surface at radius r (axis 'x', the face toward +X at a = 0..TAU from +Y)
export function ticksRing(r, n, { major = 5, len = 0.006, lenMajor = 0.012, w = 0.0012, h = 0.0006, axis = 'x', face = 'radial', a0 = 0, a1 = TAU, c = [0, 0], at = 0, skip = 0 } = {}) {
  const ms = [], proto = chamferBox(1, 1, 1, 0);
  const full = Math.abs(a1 - a0 - TAU) < 1e-6;
  for (let i = 0; i < n + (full ? 0 : 1); i++) {
    if (skip && i % skip === 0 && i % major) continue;
    const a = a0 + ((a1 - a0) * i) / n, L = i % major === 0 ? lenMajor : len;
    // ticks on a flat face (a dial): radial lines on the plane x = at; ticks on a band: along the axis
    if (face === 'radial') {
      const rr = r - L / 2, y = Math.cos(a) * rr, z = Math.sin(a) * rr;
      ms.push(new THREE.Matrix4().compose(new THREE.Vector3(at + h / 2, y, z).add(axisOff(axis, c)), new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)), new THREE.Vector3(h, L, w)));
    } else {
      const y = Math.cos(a) * (r + h / 2), z = Math.sin(a) * (r + h / 2);
      ms.push(new THREE.Matrix4().compose(new THREE.Vector3(at + L / 2, y, z).add(axisOff(axis, c)), new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)), new THREE.Vector3(L, h, w)));
    }
  }
  const g = instances(proto, ms);
  if (axis === 'y') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateY(-Math.PI / 2);
  return g;
}
const axisOff = () => new THREE.Vector3();

// ticks along a straight line a..b on a face with normal nrm (n ticks, every major-th long, lengths along `across`)
export function ticksLine(a, b, n, nrm, across, { major = 5, len = 0.008, lenMajor = 0.016, w = 0.0015, h = 0.0006 } = {}) {
  const proto = chamferBox(1, 1, 1, 0), ms = [], N = nrm.clone().normalize(), X = across.clone().normalize(), Y = new THREE.Vector3().crossVectors(X, N);
  const basis = new THREE.Matrix4().makeBasis(X, N, Y), q = new THREE.Quaternion().setFromRotationMatrix(basis);
  for (let i = 0; i <= n; i++) {
    const L = i % major === 0 ? lenMajor : len, p = a.clone().lerp(b, i / n).addScaledVector(N, h / 2).addScaledVector(X, L / 2);
    ms.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(L, h, w)));
  }
  return instances(proto, ms);
}

/**
 * A grating (Gitterrost) between x0..x1 and z0..z1, its top exactly at y: an angle frame round it (top legs flush with y,
 * vertical legs hanging down at the edges), bearing bars on edge along z at `pitch`, square cross bars every `cross`.
 * Returns { frame, bars, fine }: the frame and every `split`-th bearing bar with the cross bars (the hd tier: a coarse
 * lattice that reads at 15 to 40 m) and the bars between (micro: they alias beyond 15 m).
 */
export function gratingHD(x0, x1, z0, z1, y, { pitch = 0.033, bar = [0.003, 0.03], cross = 0.1, frame = 0.04, ft = 0.005, split = 3 } = {}) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), w = xb - xa, len = z1 - z0, xc = (xa + xb) / 2, zc = (z0 + z1) / 2;
  const F = [];
  for (const [x, s] of [[xa, 1], [xb, -1]]) F.push(chamferBox(frame, ft, len, 0.0015, x + (s * frame) / 2, y - ft / 2, zc), chamferBox(ft, frame, len, 0.0015, x + (s * ft) / 2, y - frame / 2, zc));
  for (const [z, s] of [[z0, 1], [z1, -1]]) F.push(chamferBox(w - 2 * ft, ft, frame, 0.0015, xc, y - ft / 2, z + (s * frame) / 2), chamferBox(w - 2 * ft, frame, ft, 0.0015, xc, y - frame / 2, z + (s * ft) / 2));
  const proto = chamferBox(1, 1, 1, 0), coarse = [], fine = [];
  const nb = Math.max(2, Math.round((w - 2 * frame) / pitch) + 1);
  for (let i = 0; i < nb; i++) {
    const x = xa + frame + ((w - 2 * frame) * i) / (nb - 1);
    (i % split === 0 || i === nb - 1 ? coarse : fine).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - bar[1] / 2, zc), new THREE.Quaternion(), new THREE.Vector3(bar[0], bar[1], len - 2 * ft)));
  }
  for (let z = z0 + cross; z < z1 - cross * 0.4; z += cross) coarse.push(new THREE.Matrix4().compose(new THREE.Vector3(xc, y - 0.006, z), new THREE.Quaternion(), new THREE.Vector3(w - 2 * ft, 0.008, 0.008)));
  return { frame: mergeHD(F), bars: instances(proto, coarse), fine: fine.length ? instances(proto, fine) : null };
}

// Crew clearance check (dev page, no rendering). Builds a gun with its crew, runs the real loading
// choreography (crews.js) through a full cycle at 30 fps against a copy of the sim's loading logic, and
// tests every crewman's body (torso, head, thighs, shins, upper arms; hands and forearms are allowed to
// touch) against the gun's steel (surface points of the rig's meshes in the current pose), the sandbag
// pit, the shell stack and crates of the battery (world/battery.js), the other men and the carried shell.
//   /src/render/crewcheck.html?gun=bl15|bl92|bl6|bl60|rail|all&scn=0,1,2&speed=1&worst=1
// window.__crew = { done, results: { gun: { scn: { max, byRole, byStep, worst: [...] } } } }
// Any kind with a crew works (the German guns too: gun=lefh18,k18,k17,...; their pits are not modelled here).
// Motion audit (every frame, per man): root speed (running, jumps in pace, teleports), heading snaps, pose
// flicker, feet sliding while planted, hands short of the point they were sent to, hands inside the torso and
// elbows turned into the body; in results.<gun>.<scn>.motion and brief.<gun/scn>.motion.
// Contact sheet: &shots=shell@0.2,shell@0.6,ram@0.5,... (step@k of the first loading cycle, or a time in s)
// &cams=az,el,dist[,ty];... (degrees, metres; one row per camera, aimed at the breech) &tile=360x300 draws
// the gun and its men at those moments into a grid on the page for tools/shot.mjs.
import * as THREE from 'three';
import { UNITS, piecePlacements } from '../sector.js';
import { GUNS } from '../sim/tables.js';
import { buildGun, loadGuns } from '../models/guns.js';
import { GunCrew } from './crews.js';
import { loadPose, carPose } from './guns.js';
import { h2 } from '../world/mesher.js';
import { pitSolids } from '../world/battery.js';
import { CrewField } from './crewfield.js';

const q = new URLSearchParams(location.search);
const DT = 1 / 30, SAMPLE = 2; // frame step, test every SAMPLE frames
const TOL = 0.03;

// ---------------------------------------------------------------- steel points
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function sampleMesh(mesh, step = 0.05) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count / 3 : pos.count / 3, pts = [];
  const get = (i, v) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
  for (let t = 0; t < n; t++) {
    get(t * 3, _a); get(t * 3 + 1, _b); get(t * 3 + 2, _c);
    pts.push(_a.x, _a.y, _a.z);
    const area = _v.copy(_b).sub(_a).cross(_c.clone().sub(_a)).length() / 2;
    const m = Math.min(4000, Math.ceil(area / (step * step)));
    for (let i = 0; i < m; i++) {
      let u = Math.random(), w = Math.random();
      // deterministic enough: low-discrepancy via the index
      u = ((i + 0.5) * 0.7548776662466927) % 1; w = ((i + 0.5) * 0.5698402909980532) % 1;
      if (u + w > 1) { u = 1 - u; w = 1 - w; }
      pts.push(_a.x + (_b.x - _a.x) * u + (_c.x - _a.x) * w, _a.y + (_b.y - _a.y) * u + (_c.y - _a.y) * w, _a.z + (_b.z - _a.z) * u + (_c.z - _a.z) * w);
    }
  }
  return new Float32Array(pts);
}

// triangles of a mesh binned by XZ cell (local space), for the winding test of `inside`
const TC = 0.25;
function triGrid(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count / 3 : pos.count / 3;
  const T = new Float32Array(n * 9), cells = new Map();
  const bb = new THREE.Box3().setFromBufferAttribute(pos);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) _v.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k), T[t * 9 + k * 3] = _v.x, T[t * 9 + k * 3 + 1] = _v.y, T[t * 9 + k * 3 + 2] = _v.z;
    const x0 = Math.min(T[t * 9], T[t * 9 + 3], T[t * 9 + 6]), x1 = Math.max(T[t * 9], T[t * 9 + 3], T[t * 9 + 6]);
    const z0 = Math.min(T[t * 9 + 2], T[t * 9 + 5], T[t * 9 + 8]), z1 = Math.max(T[t * 9 + 2], T[t * 9 + 5], T[t * 9 + 8]);
    for (let ix = Math.floor(x0 / TC); ix <= Math.floor(x1 / TC); ix++) for (let iz = Math.floor(z0 / TC); iz <= Math.floor(z1 / TC); iz++) {
      const key = ix * 100003 + iz;
      let a = cells.get(key);
      if (!a) cells.set(key, a = []);
      a.push(t);
    }
  }
  return { T, cells, bb };
}

class Steel {
  constructor(rig) {
    this.items = [];
    rig.root.updateMatrixWorld(true);
    rig.root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.name === 'soil') return; // ground mounds are not steel
      // the model viewer's shells and anything else the gun keeps hidden (the leFH and sFH 18's `trayShell`) are not steel
      for (let p = o; p; p = p.parent) if (!p.visible || (p.name && p.name.startsWith('shell-'))) return;
      this.items.push({ mesh: o, local: sampleMesh(o), world: null, m: new Float32Array(16), tg: triGrid(o), inv: new THREE.Matrix4() });
    });
    let total = 0;
    for (const it of this.items) total += it.local.length / 3;
    this.total = total;
    let off = 0;
    for (const it of this.items) { it.off = off; off += it.local.length / 3; }
    this.world = new Float32Array(total * 3);
    this.cell = 0.3;
    this.grid = null;
  }

  // refresh the world points of moved meshes, then bin everything
  update() {
    this.stamp = (this.stamp ?? 0) + 1;
    const W = this.world;
    let o = 0;
    for (const it of this.items) {
      const e = it.mesh.matrixWorld.elements;
      let same = it.ready;
      if (same) for (let i = 0; i < 16; i++) if (Math.abs(e[i] - it.m[i]) > 1e-6) { same = false; break; }
      const L = it.local, n = L.length / 3;
      if (!same) {
        for (let i = 0; i < 16; i++) it.m[i] = e[i];
        it.ready = true;
        for (let i = 0; i < n; i++) {
          const x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
          W[o + i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          W[o + i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          W[o + i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      }
      o += n * 3;
    }
    this.bin();
  }

  bin() {
    const W = this.world, n = W.length / 3, c = this.cell;
    if (!this.dim) {
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, W[i * 3]); x1 = Math.max(x1, W[i * 3]); y0 = Math.min(y0, W[i * 3 + 1]); y1 = Math.max(y1, W[i * 3 + 1]); z0 = Math.min(z0, W[i * 3 + 2]); z1 = Math.max(z1, W[i * 3 + 2]);
      }
      this.org = [x0 - 2, y0 - 1, z0 - 2];
      this.dim = [Math.ceil((x1 - x0 + 4 + 12) / c), Math.ceil((y1 - y0 + 2 + 4) / c), Math.ceil((z1 - z0 + 4 + 12) / c)];
      this.start = new Int32Array(this.dim[0] * this.dim[1] * this.dim[2] + 1);
      this.cellOf = new Int32Array(n);
      this.sorted = new Int32Array(n);
    }
    const [dx, dy, dz] = this.dim, [ox, oy, oz] = this.org, S = this.start;
    S.fill(0);
    for (let i = 0; i < n; i++) {
      const ix = Math.min(dx - 1, Math.max(0, ((W[i * 3] - ox) / c) | 0)), iy = Math.min(dy - 1, Math.max(0, ((W[i * 3 + 1] - oy) / c) | 0)), iz = Math.min(dz - 1, Math.max(0, ((W[i * 3 + 2] - oz) / c) | 0));
      const k = (iz * dy + iy) * dx + ix;
      this.cellOf[i] = k;
      S[k + 1]++;
    }
    for (let k = 0; k < S.length - 1; k++) S[k + 1] += S[k];
    const fill = this.fill ??= new Int32Array(S.length);
    fill.set(S);
    for (let i = 0; i < n; i++) this.sorted[fill[this.cellOf[i]]++] = i;
  }

  ownerOf(i) {
    let it = this.items[0];
    for (const x of this.items) if (x.off <= i) it = x;
    const names = [];
    for (let p = it.mesh; p; p = p.parent) if (p.name) names.unshift(p.name);
    return names.join('>');
  }

  // winding number of the meshes around world point (x, y, z): > 0 means inside a closed solid
  inside(x, y, z) {
    for (const it of this.items) {
      const e = it.mesh.matrixWorld;
      if (!it.invOk || it.invAt !== this.stamp) { it.inv.copy(e).invert(); it.invOk = true; it.invAt = this.stamp; }
      _v.set(x, y, z).applyMatrix4(it.inv);
      const bb = it.tg.bb;
      if (_v.x < bb.min.x || _v.x > bb.max.x || _v.y < bb.min.y || _v.y > bb.max.y || _v.z < bb.min.z || _v.z > bb.max.z) continue;
      const cell = it.tg.cells.get(Math.floor(_v.x / TC) * 100003 + Math.floor(_v.z / TC));
      if (!cell) continue;
      const T = it.tg.T;
      let w = 0;
      for (const t of cell) {
        const o = t * 9;
        const ax = T[o] - _v.x, az = T[o + 2] - _v.z, bx = T[o + 3] - _v.x, bz = T[o + 5] - _v.z, cx = T[o + 6] - _v.x, cz = T[o + 8] - _v.z;
        // 2D barycentric of the origin (the point) in the projected triangle
        const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(d) < 1e-12) continue;
        const u = (-ax * (cz - az) + az * (cx - ax)) / d, v = (-(bx - ax) * az + (bz - az) * ax) / d;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const yh = T[o + 1] + (T[o + 4] - T[o + 1]) * u + (T[o + 7] - T[o + 1]) * v;
        if (yh <= _v.y) continue;
        // sign of the outward normal's y: (b - a) x (c - a) .y = d (projected area sign); d < 0 is facing up with CCW winding seen from +y
        w += d < 0 ? 1 : -1;
      }
      if (w > 0) return true;
    }
    return false;
  }

  // deepest penetration of capsule (a, b, r) by steel points above yMin; returns { d, i }
  hit(ax, ay, az, bx, by, bz, r, yMin) {
    const c = this.cell, [dx, dy, dz] = this.dim, [ox, oy, oz] = this.org, W = this.world, S = this.start;
    const x0 = Math.max(0, ((Math.min(ax, bx) - r - ox) / c) | 0), x1 = Math.min(dx - 1, ((Math.max(ax, bx) + r - ox) / c) | 0);
    const y0 = Math.max(0, ((Math.min(ay, by) - r - oy) / c) | 0), y1 = Math.min(dy - 1, ((Math.max(ay, by) + r - oy) / c) | 0);
    const z0 = Math.max(0, ((Math.min(az, bz) - r - oz) / c) | 0), z1 = Math.min(dz - 1, ((Math.max(az, bz) + r - oz) / c) | 0);
    const ux = bx - ax, uy = by - ay, uz = bz - az, uu = ux * ux + uy * uy + uz * uz || 1e-9;
    let best = 0, bi = -1;
    for (let iz = z0; iz <= z1; iz++) for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const k = (iz * dy + iy) * dx + ix;
      for (let s = S[k]; s < S[k + 1]; s++) {
        const i = this.sorted[s], px = W[i * 3], py = W[i * 3 + 1], pz = W[i * 3 + 2];
        if (py < yMin) continue;
        let t = ((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / uu;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + ux * t - px, ey = ay + uy * t - py, ez = az + uz * t - pz;
        const d = r - Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d > best) { best = d; bi = i; }
      }
    }
    return { d: best, i: bi };
  }
}

// ---------------------------------------------------------------- bodies
const BODY_R = { torso: 0.12, head: 0.1, thigh: 0.08, shin: 0.06, arm: 0.045 };
const _p = {};
const P = (n) => (_p[n] ??= new THREE.Vector3());
function bodyOf(man, out) {
  const b = man.fig.bones, wp = (bone, v) => bone.getWorldPosition(v);
  const hips = wp(b.hips, P('hips')), neck = wp(b.neck, P('neck')), head = wp(b.head, P('head'));
  const caps = out;
  let n = 0;
  const set = (name, a, bb, r, leg) => {
    const c = caps[n] ??= { name: '', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0, leg: false };
    c.name = name; c.a.copy(a); c.b.copy(bb); c.r = r; c.leg = leg; n++;
  };
  set('torso', hips, neck, BODY_R.torso, false);
  set('head', neck, _v.copy(head).setY(head.y + 0.1), BODY_R.head, false);
  for (const s of ['L', 'R']) {
    const th = wp(b['thigh' + s], P('th' + s)), sh = wp(b['shin' + s], P('sh' + s)), ft = wp(b['foot' + s], P('ft' + s));
    set('thigh', th, sh, BODY_R.thigh, true);
    set('shin', sh, ft, BODY_R.shin, true);
    const ua = wp(b['upperArm' + s], P('ua' + s)), fa = wp(b['forearm' + s], P('fa' + s));
    set('arm', ua, fa, BODY_R.arm, false);
  }
  caps.length = n;
  return caps;
}

function segDist(a, b, c, d) {
  // distance between segments ab and cd
  const u = _a.copy(b).sub(a), v = _b.copy(d).sub(c), w = _c.copy(a).sub(c);
  const A = u.dot(u), B = u.dot(v), C = v.dot(v), D = u.dot(w), E = v.dot(w), den = A * C - B * B;
  let s = den > 1e-9 ? (B * E - C * D) / den : 0, t;
  s = Math.min(1, Math.max(0, s));
  t = (B * s + E) / (C || 1e-9);
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -D / (A || 1e-9))); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (B - D) / (A || 1e-9))); }
  return _v.copy(a).addScaledVector(u, s).sub(c).addScaledVector(v, -t).length();
}

function boxPen(box, cap, yMin, feet) {
  if (feet >= box.max[1] - 0.12) return 0; // standing on it (a case buried in a platform)
  // deepest the capsule (sampled at 5 points) sinks into the box
  let best = 0;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4, x = cap.a.x + (cap.b.x - cap.a.x) * t, y = cap.a.y + (cap.b.y - cap.a.y) * t, z = cap.a.z + (cap.b.z - cap.a.z) * t;
    if (y - cap.r > box.max[1] || y + cap.r < box.min[1] || y < yMin) continue;
    const dx = Math.max(box.min[0] - x, 0, x - box.max[0]), dz = Math.max(box.min[2] - z, 0, z - box.max[2]);
    const dy = Math.max(box.min[1] - y, 0, y - box.max[1]);
    const d = Math.hypot(dx, dy, dz);
    // outside distance 0 means the axis is inside the box: use the depth to the nearest face
    let pen;
    if (d > 0) pen = cap.r - d;
    else pen = cap.r + Math.min(x - box.min[0], box.max[0] - x, z - box.min[2], box.max[2] - z);
    if (pen > best) best = pen;
  }
  return best;
}

// ---------------------------------------------------------------- motion audit
const _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _e2 = new THREE.Vector3();
let patched = false;
function patchMen(crew) {
  for (const m of crew.men) {
    if (m._audit) continue;
    const pose = m.fig.pose;
    m.fig.pose = (name, t, b) => { m._pose = name; return pose(name, t, b); };
    m._audit = { px: null, pz: null, v: 0, h: 0, poses: [], feet: [null, null], hands: {} };
  }
  if (patched || !crew.men.length) return;
  patched = true;
  const P = Object.getPrototypeOf(crew.men[0]), hand = P.hand;
  // a target the man was sent to (w > 0.9) counts as missed only when the hand still holds it: crews.js lets go of one
  // beyond an arm's reach (counted apart as `drop`)
  P.hand = function (side, x, y, z, w = 1) {
    this.hw = 0;
    const r = hand.call(this, side, x, y, z, w);
    if (w > 0.9 && this._audit) { if ((this.hw ?? w) > 0.9) this._audit.hands[side] = [x, y, z]; else if ((this.hw ?? 1) < 0.5) this._audit.drop = (this._audit.drop ?? 0) + 1; }
    return r;
  };
}
const segPt = (a, b, p) => { const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, uu = ux * ux + uy * uy + uz * uz || 1e-9;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / uu));
  return Math.hypot(a.x + ux * t - p.x, a.y + uy * t - p.y, a.z + uz * t - p.z); };
// one frame of every man's motion into res.motion[role]
function auditMotion(crew, res, c, T) {
  const M = res.motion;
  for (const m of crew.men) {
    const A = m._audit, b = m.fig.bones;
    if (!A) continue;
    const R = M[m.role] ??= { maxV: 0, run: 0, jumps: 0, teleports: 0, snaps: 0, flicker: 0, slide: 0, handMax: 0, handMiss: 0, inBody: 0, elbowIn: 0, worst: [] };
    const ev = (what, val) => { const n = (R.evN ??= {})[what] = (R.evN[what] ?? 0) + 1; if (n <= 5 && R.worst.length < 60) R.worst.push(`${what} ${typeof val === 'number' ? val.toFixed(2) : val} @${c.s ?? c.st} k=${(c.k ?? 0).toFixed(2)} t=${T.toFixed(2)}`); };
    if (!m.root.visible) { A.px = null; continue; }
    if (A.px != null) {
      const d = Math.hypot(m.x - A.px, m.z - A.pz), v = d / DT, dh = Math.abs(wrap(m.h - A.h));
      if (d > 0.2) { R.teleports++; ev('teleport', d); }
      else {
        if (v > R.maxV) R.maxV = v;
        if (v > 2.0) R.run += DT;
        if (Math.abs(v - A.v) > 0.4 && R.jumps++ < 1e9 && Math.abs(v - A.v) > 0.6) ev('pace jump', v - A.v);
      }
      if (dh > 0.25) { R.snaps++; ev('heading snap', dh); }
      A.v = d > 0.2 ? 0 : v;
    }
    A.px = m.x; A.pz = m.z; A.h = m.h;
    // pose flicker: back to the pose before within 0.3 s
    const ps = A.poses, pose = m._pose;
    if (!ps.length || ps[ps.length - 1][0] !== pose) {
      ps.push([pose, T]);
      if (ps.length > 3) ps.shift();
      if (ps.length === 3 && ps[0][0] === pose && T - ps[1][1] < 0.3) { R.flicker++; ev('flicker ' + ps[1][0], T - ps[1][1]); }
    }
    // planted feet must not slide
    for (let i = 0; i < 2; i++) {
      b[i ? 'footR' : 'footL'].getWorldPosition(_f);
      const prev = A.feet[i];
      if (prev && _f.y - m.y < 0.115 && prev[1] - m.y < 0.115) {
        const v = Math.hypot(_f.x - prev[0], _f.z - prev[2]) / DT;
        if (v > 0.45 && v < 6) { R.slide += v * DT; const key = `${m._pose}@${c.s ?? c.st}`; (R.slideBy ??= {})[key] = (R.slideBy[key] ?? 0) + v * DT; }
      }
      A.feet[i] = [_f.x, _f.y, _f.z];
    }
    // hands: on their targets, out of the torso, elbows outward
    b.hips.getWorldPosition(_g); b.neck.getWorldPosition(_h);
    const fx = -Math.sin(m.h), fz = -Math.cos(m.h), rx = Math.cos(m.h), rz = -Math.sin(m.h);
    for (const [side, sg] of [['L', -1], ['R', 1]]) {
      const anchor = m.fig.anchors['hand' + side];
      anchor.getWorldPosition(_f);
      const tg = A.hands[side];
      if (tg) {
        const e = Math.hypot(_f.x - tg[0], _f.y - tg[1], _f.z - tg[2]);
        if (e > R.handMax) { R.handMax = e; R.handWorst = `${side} ${e.toFixed(2)} @${c.s ?? c.st} k=${(c.k ?? 0).toFixed(2)} pose ${m._pose}`; }
        if (e > 0.08) { R.handMiss++; if (e > 0.15) ev('hand ' + side + ' short', e); }
      }
      if (segPt(_g, _h, _f) < 0.1) { R.inBody++; ev('hand ' + side + ' in torso', segPt(_g, _h, _f)); }
      b['upperArm' + side].getWorldPosition(_s); b['forearm' + side].getWorldPosition(_e2);
      const ex = _e2.x - (_s.x + _f.x) / 2, ey = _e2.y - (_s.y + _f.y) / 2, ez = _e2.z - (_s.z + _f.z) / 2, el = Math.hypot(ex, ey, ez);
      // a bent arm whose elbow points across the body (inward past the shoulder line) reads as broken
      if (el > 0.05 && (ex * rx + ez * rz) * sg < -0.75 * el) { R.elbowIn++; ev('elbow ' + side + ' inward', (ex * rx + ez * rz) * sg / el); }
      void fx; void fz;
    }
    A.hands = {};
    if (A.drop) { R.drop = (R.drop ?? 0) + A.drop; A.drop = 0; }
  }
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- contact sheet
let R3 = null;
function sheet(kind, rig, crew) {
  const [tw, th] = (q.get('tile') ?? '360x300').split('x').map(Number);
  const cams = (q.get('cams') ?? '210,18,9;300,12,8').split(';').map((s) => s.split(',').map(Number));
  if (!R3) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(tw, th); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true;
    const grid = document.createElement('canvas');
    document.body.prepend(grid);
    R3 = { renderer, grid, ctx: grid.getContext('2d'), tw, th, cams, cols: 0, scenes: new Map() };
  }
  let S = R3.scenes.get(kind);
  if (!S) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb9c0bd);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6d6a5c, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-6, 12, -4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8c8a74, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    scene.add(new THREE.GridHelper(20, 20, 0x6f6e5d, 0x7c7b68));
    scene.add(rig.root);
    S = { scene, camera: new THREE.PerspectiveCamera(42, tw / th, 0.1, 200), n: 0 };
    R3.scenes.set(kind, S);
  }
  return (label) => {
    const { renderer, grid, ctx, tw: W, th: H, cams: C } = R3, col = S.n++;
    const need = Math.max(grid.width, (col + 1) * W), rows = R3.rowBase ?? 0, needH = (rows + C.length) * H;
    if (grid.width < need || grid.height < needH) {
      const old = document.createElement('canvas'); old.width = grid.width; old.height = grid.height; old.getContext('2d').drawImage(grid, 0, 0);
      grid.width = Math.max(need, grid.width); grid.height = Math.max(needH, grid.height); ctx.drawImage(old, 0, 0);
    }
    const B = crew.B.clone().applyMatrix4(rig.root.matrixWorld);
    C.forEach(([az, el, dist, ty], r) => {
      const a = az * Math.PI / 180, e = el * Math.PI / 180;
      S.camera.position.set(B.x + Math.sin(a) * Math.cos(e) * dist, (ty ?? 0.9) + Math.sin(e) * dist, B.z + Math.cos(a) * Math.cos(e) * dist);
      S.camera.lookAt(B.x, ty ?? 0.9, B.z);
      renderer.render(S.scene, S.camera);
      ctx.drawImage(renderer.domElement, col * W, (rows + r) * H);
      ctx.fillStyle = '#000a'; ctx.fillRect(col * W, (rows + r) * H, W, 16);
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(`${kind} ${label}`, col * W + 4, (rows + r) * H + 12);
    });
  };
}

// ---------------------------------------------------------------- the run
function placement(kind) {
  for (const u of UNITS) { const pl = piecePlacements(u).find((p) => p.kind === kind); if (pl) return pl; }
  return { x: 0, z: 0 };
}

function runGun(kind, scn, speed, scns0 = scn) {
  const g = GUNS[kind], heavy = g.load[0].step === 'depress';
  const rig = buildGun(kind);
  rig.root.rotation.order = 'YXZ';
  rig.root.userData.crewAt = placement(kind);
  const steel = new Steel(rig);
  const crew = new GunCrew(rig, kind);
  window.__lastCrew = crew;
  const pl0 = placement(kind), walls = pitSolids(kind, pl0.x, pl0.z).map((b) => ({ name: b.name, min: [b.x0, 0, b.z0], max: [b.x1, b.h, b.z1] }));
  const trav = g.traverse;
  const az1 = [0, 0.3, -0.3, 0.9 * trav, -0.9 * trav][scn] ?? 0;
  const az0 = [0, -0.3, 0.3, -0.5 * trav, 0.5 * trav][scn] ?? 0;
  const p = { kind, az: az0, el: g.restEl, cmd: { az: az0, el: g.restEl, ok: true }, state: 'ready', job: null, loaded: true, breech: 0, rounds: 1, crew: g.crew, crewMax: g.crew, firedAt: -999, fireAt: 2.5, recoil: 0, ji: 0 };
  const sim = { time: 0, alpha: 0 };
  const res = { max: 0, byRole: {}, byStep: {}, byTarget: {}, worst: [], frames: 0, motion: {} };
  patchMen(crew);
  const shots = scn === scns0 && q.get('shots') ? q.get('shots').split(',').map((t) => (t.includes('@') ? { step: t.split('@')[0], k: Number(t.split('@')[1]) } : { t: Number(t) })) : [];
  const snap = shots.length ? sheet(kind, rig, crew) : null;
  let cycle = 0;
  res.homes = crew.men.map((m) => `${m.role} ${m.spot.x.toFixed(2)},${m.spot.z.toFixed(2)} -> ${m.sx.toFixed(2)},${m.sz.toFixed(2)}`);
  const caps = crew.men.map(() => []);
  const shellCap = { a: new THREE.Vector3(), b: new THREE.Vector3() };
  let phase = 'ready', stage = 0;
  const log = (pen, who, man, vs, c, extra) => {
    if (pen <= 0.003) return;
    const role = man.role, step = c.s ?? c.st;
    res.byRole[role] = Math.max(res.byRole[role] ?? 0, pen);
    res.byStep[step] = Math.max(res.byStep[step] ?? 0, pen);
    res.byTarget[vs] = Math.max(res.byTarget[vs] ?? 0, pen);
    if (pen > res.max) res.max = pen;
    if (pen > TOL) {
      const key = `${role}|${vs}|${step}`;
      const w = res.worst.find((x) => x.key === key);
      const rec = { key, role, vs, step, pen: +pen.toFixed(3), t: +sim.time.toFixed(2), k: +(c.k ?? 0).toFixed(2), part: who, at: [man.x, man.y, man.z].map((v) => +v.toFixed(2)), ...extra };
      if (!w) res.worst.push(rec); else if (pen > w.pen) Object.assign(w, rec);
    }
  };
  let T = -3;
  const end = 1e9;
  let firedOnce = false, fired = 0;
  const wsteps = g.load.length;
  void wsteps;
  for (let frame = 0; frame < 20000; frame++) {
    T += DT;
    sim.time = T;
    // ---- the sim's loading logic (guns.js), without the rest
    if (phase === 'ready' && T >= p.fireAt) {
      p.firedAt = T; p.state = 'recoil'; p.loaded = false; p.rounds = 0; phase = 'recoil'; fired++; cycle++;
      p.cmd.az = az1; p.cmd.el = g.restEl;
      if (fired >= 2) break;
    }
    const slew = (elT) => {
      const da = p.cmd.az - p.az, de = elT - p.el, ma = g.azRate * DT, me = g.elRate * DT;
      p.az += Math.abs(da) <= ma ? da : Math.sign(da) * ma;
      p.el += Math.abs(de) <= me ? de : Math.sign(de) * me;
    };
    if (phase === 'recoil') {
      slew(p.el);
      if (T - p.firedAt > 0.18 + g.runout) { phase = 'loading'; p.state = 'loading'; p.ji = 0; begin(); }
    } else if (phase === 'loading') {
      const job = p.job, st = g.load[p.ji];
      job.t += DT;
      let elT = heavy ? g.loadEl : p.cmd.el;
      if (st.step === 'lay') elT = p.cmd.el;
      slew(elT);
      const k = Math.min(1, job.t / Math.max(0.01, job.dur));
      if (st.step === 'open') p.breech = k; else if (st.step === 'close') p.breech = 1 - k;
      if (job.t >= job.dur) {
        const laid = Math.abs(p.cmd.az - p.az) < 0.0006 && Math.abs(p.cmd.el - p.el) < 0.0005;
        if (!(st.step === 'depress' && Math.abs(p.el - g.loadEl) > 0.002) && !(st.step === 'lay' && !laid)) {
          if (st.step === 'ram') p.loaded = true;
          p.ji++;
          if (p.ji >= g.load.length) { p.state = 'ready'; p.job = null; p.breech = 0; phase = 'ready'; p.rounds = 1; p.fireAt = T + 3.2; p.loaded = true; } else begin();
        }
      }
    } else if (phase === 'ready') slew(p.cmd.el);
    function begin() {
      const st = g.load[p.ji];
      let dur = st.dur * speed;
      if (st.step === 'depress') dur = Math.max(dur, Math.abs(p.el - g.loadEl) / g.elRate);
      p.job = { step: st.step, t: 0, dur, i: p.ji, n: g.load.length };
    }
    // ---- the render layer's pose of the rig (guns.js)
    // as render/guns.js: the light guns come down to their loading elevation for the steps (quickLoad)
    const qk = !p.job || heavy ? 0 : ((k) => ({ open: k * k * (3 - 2 * k), lay: 1 - k * k * (3 - 2 * k) }[p.job.step] ?? (['shell', 'ram', 'cartridge', 'close', 'prime'].includes(p.job.step) ? 1 : 0)))(Math.min(1, p.job.t / Math.max(0.01, p.job.dur)));
    rig.setTraverse(p.az); rig.setElevation(p.el + ((rig.loadEl ?? g.loadEl) - p.el) * qk);
    const tf = T - p.firedAt;
    let r = 0;
    if (tf >= 0 && tf < g.runout + 1.2) r = tf < 0.14 ? Math.sin((tf / 0.14) * Math.PI / 2) : tf < 0.45 ? 1 : 1 - Math.min(1, Math.max(0, (tf - 0.45) / g.runout));
    rig.setRecoil(r);
    rig.setCar?.(carPose(g, p, tf) * (rig.carRoll ?? 0)); // the railway car's roll-back and winch-in (its men ride it, crews.js)
    const lp = loadPose(p, 0);
    rig.setBreech(lp.breech);
    rig.setTray?.(lp.tray);
    rig.update?.(DT);
    crew.update(p, sim, DT, 2);
    rig.root.updateMatrixWorld(true);
    auditMotion(crew, res, crew.c, T);
    // &stop=step@k: end the run there (cycle 1) and leave the crew posed for a look (window.__lastCrew)
    // (&trace=role,t0,t1: that man's place, heading and pose each frame between the times, into window.__trace)
    if (q.get('trace')) { const [role, t0, t1] = q.get('trace').split(','), m = crew.byRole.get(role); if (m && T >= +t0 && T <= +t1) (window.__trace ??= []).push(`${T.toFixed(2)} ${p.job?.step ?? p.state} x${m.x.toFixed(2)} z${m.z.toFixed(2)} h${m.h.toFixed(2)} ${m._pose} ears${crew.ears.toFixed(2)}`); }
    if (q.get('stop') && cycle === 1 && p.job?.step === q.get('stop').split('@')[0] && p.job.t / p.job.dur >= Number(q.get('stop').split('@')[1])) { window.__lastP = p; break; }
    if (snap) for (const sh of shots) {
      if (sh.done) continue;
      const jk = p.job ? p.job.t / Math.max(0.01, p.job.dur) : -1;
      if (sh.t != null ? T >= sh.t : cycle === 1 && p.job?.step === sh.step && jk >= sh.k) { sh.done = true; snap(sh.t != null ? `t=${sh.t}` : `${sh.step}@${sh.k}`); }
    }
    if (frame % SAMPLE) continue;
    if (T < -0.5 || tf < 0 && T < 0) { if (!firedOnce) { /* the run-up to the first shot is also tested */ } }
    steel.update();
    res.frames++;
    const c = crew.c;
    const bodies = crew.men.map((m, i) => (m.root.visible ? bodyOf(m, caps[i]) : null));
    // clone capsule data needed twice (the P() scratch vectors are reused by bodyOf for each man)
    for (let i = 0; i < crew.men.length; i++) {
      const m = crew.men[i], cs = bodies[i];
      if (!cs) continue;
      for (const cp of cs) {
        const yMin = cp.leg ? m.y + 0.1 : -1e9;
        const h = steel.hit(cp.a.x, cp.a.y, cp.a.z, cp.b.x, cp.b.y, cp.b.z, cp.r, yMin);
        if (h.d > 0) log(h.d, cp.name, m, 'steel', c, { own: steel.ownerOf(h.i), pt: [steel.world[h.i * 3], steel.world[h.i * 3 + 1], steel.world[h.i * 3 + 2]].map((v) => +v.toFixed(2)) });
        else {
          // the axis may sit inside a closed solid with no surface within reach of the capsule
          for (let u = 0; u <= 4; u++) {
            const t = u / 4, x = cp.a.x + (cp.b.x - cp.a.x) * t, y = cp.a.y + (cp.b.y - cp.a.y) * t, z = cp.a.z + (cp.b.z - cp.a.z) * t;
            if (y < yMin || !steel.inside(x, y, z)) continue;
            const n = steel.hit(x, y, z, x, y, z, 0.8, -1e9);
            log(cp.r + 0.8 - n.d, cp.name, m, 'inside', c, { pt: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)] });
            break;
          }
        }
        for (const bx of walls) {
          const d = boxPen(bx, cp, cp.leg ? m.y + 0.1 : -1e9, m.y);
          if (d > 0) log(d, cp.name, m, bx.name, c);
        }
      }
      for (let j = i + 1; j < crew.men.length; j++) {
        const cj = bodies[j];
        if (!cj) continue;
        const m2 = crew.men[j];
        if (Math.hypot(m.x - m2.x, m.z - m2.z) > 1.2) continue;
        let worst = 0;
        for (const a of cs) for (const bb of cj) {
          if (a.name === 'arm' || bb.name === 'arm') continue;
          const d = a.r + bb.r - segDist(a.a, a.b, bb.a, bb.b);
          if (d > worst) worst = d;
        }
        if (worst > 0) { log(worst, 'body', m, 'man:' + m2.role, c, { with: [+m2.x.toFixed(2), +m2.z.toFixed(2)] }); }
      }
    }
    // the carried shell against steel (away from the tray) and against the men
    for (const prop of [crew.shellA, crew.shellB]) {
      if (!prop.visible) continue;
      const half = crew.half, rad = crew.srad * 0.9;
      // a shell lies along its local -z (nose) in the prop's yaw/pitch
      _a.set(0, 0, half).applyMatrix4(prop.matrix); _b.set(0, 0, -half).applyMatrix4(prop.matrix);
      const nearTray = _c.copy(_a).add(_b).multiplyScalar(0.5).distanceTo(crew.T) < 0.45;
      const nearStack = _c.copy(_a).add(_b).multiplyScalar(0.5).distanceTo(crew.S) < 1.2 || (crew.pick && _c.distanceTo(crew.pick) < 1.2); // picked up from the stack: contact is the point
      if (!nearTray && !nearStack) {
        const h = steel.hit(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, rad, -1e9);
        if (h.d > 0) log(h.d, prop === crew.shellA ? 'shell' : 'shellB', { role: 'shell', x: _a.x, y: _a.y, z: _a.z }, 'steel', c, { own: steel.ownerOf(h.i), pt: [steel.world[h.i * 3], steel.world[h.i * 3 + 1], steel.world[h.i * 3 + 2]].map((v) => +v.toFixed(2)) });
      }
      for (let i = 0; i < crew.men.length; i++) {
        const cs = bodies[i];
        if (!cs) continue;
        const m = crew.men[i];
        for (const cp of cs) {
          if (cp.name === 'arm') continue;
          const d = rad + cp.r - segDist(_a, _b, cp.a, cp.b);
          if (d > TOL) log(d, 'shellVs' + cp.name, m, 'shell', c);
        }
      }
    }
  }
  res.plans = crew.men.filter((m) => Object.keys(m.plans).length).map((m) => m.role + ' ' + Object.entries(m.plans).map(([t, P]) => t + '[' + Array.from({ length: P.poly.n }, (_, i) => P.poly.x[i].toFixed(1) + ',' + P.poly.z[i].toFixed(1)).join(' ') + '] step' + (P.poly.step ?? 0).toFixed(1)).join(' '));
  return res;
}

// an ASCII plan of the steel (points between y0 and y1 above `floor`), crew spots as letters, anchors as T B S
function plan(kind, y0 = 0.2, y1 = 1.7, floor = null, cell = 0.1) {
  const rig = buildGun(kind), steel = new Steel(rig);
  rig.setElevation(Number(q.get('el') ?? GUNS[kind].restEl)); rig.setBreech(Number(q.get('breech') ?? 0)); rig.setTraverse(Number(q.get('az') ?? 0));
  rig.root.updateMatrixWorld(true);
  steel.update();
  const spots = rig.anchors.crew;
  const fl = q.has('floor') ? Number(q.get('floor')) : floor ?? Math.min(...spots.map((s) => s.y));
  const W = steel.world, n = W.length / 3;
  let x0 = -4, x1 = 4, z0 = -3, z1 = 9;
  const bounds = q.get('box'); if (bounds) [x0, x1, z0, z1] = bounds.split(',').map(Number);
  const nx = Math.round((x1 - x0) / cell), nz = Math.round((z1 - z0) / cell);
  const g = Array.from({ length: nz }, () => new Array(nx).fill(' '));
  for (let i = 0; i < n; i++) {
    const y = W[i * 3 + 1] - fl;
    if (y < y0 || y > y1) continue;
    const ix = Math.floor((W[i * 3] - x0) / cell), iz = Math.floor((W[i * 3 + 2] - z0) / cell);
    if (ix >= 0 && ix < nx && iz >= 0 && iz < nz) g[iz][ix] = y < 0.8 ? 'o' : '#';
  }
  const mark = (x, z, ch) => { const ix = Math.floor((x - x0) / cell), iz = Math.floor((z - z0) / cell); if (ix >= 0 && ix < nx && iz >= 0 && iz < nz) g[iz][ix] = ch; };
  spots.forEach((s, i) => mark(s.x, s.z, String.fromCharCode(97 + i)));
  rig.root.updateMatrixWorld(true);
  const anc = [];
  for (const [k, ch] of [['tray', 'T'], ['breech', 'B'], ['shellStack', 'S'], ['muzzle', 'M']]) { const a = rig.anchors[k]; if (a) { const v = a.getWorldPosition(new THREE.Vector3()); mark(v.x, v.z, ch); anc.push(`${ch}=${k}(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`); } }
  return { floor: fl, spots: spots.map((s, i) => `${String.fromCharCode(97 + i)}=${s.role}(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)})`).concat(anc), rows: g.map((r, i) => (z0 + i * cell).toFixed(1).padStart(5) + ' ' + r.join('')) };
}

async function main() {
  await loadGuns([...new Set(['bl6', 'bl60', ...(q.get('gun') ?? '').split(','), q.get('field'), q.get('col'), q.get('map')].filter(Boolean))]);
  if (q.get('field')) {
    const k = q.get('field'), rig = buildGun(k), floors = [...new Set(rig.anchors.crew.map((c) => Math.round(c.y * 20) / 20).concat([0]))];
    const t0 = performance.now();
    const F = new CrewField(rig, k, GUNS[k], floors, placement(k), Number(q.get('work') ?? 0));
    const ms = performance.now() - t0;
    const l = F.level(Number(q.get('lvl') ?? 0)), rows = F.ascii(q.get('fl') ?? 'work', l, Number(q.get('r') ?? 0.2));
    const g = F.b, L = [];
    rig.anchors.crew.forEach((c, i) => { const j = Math.floor((c.z - g.z0) / 0.2), ii = Math.floor((c.x - g.x0) / 0.2); if (rows[j]) rows[j] = rows[j].slice(0, 6 + ii) + String.fromCharCode(97 + i) + rows[j].slice(7 + ii); L.push(String.fromCharCode(97 + i) + '=' + c.role); });
    window.__crew = { done: true, map: { spots: [ms.toFixed(0) + 'ms floors ' + floors + ' x0=' + g.x0].concat(L), rows } };
    return;
  }
  if (q.get('col')) {
    const k = q.get('col'), rig = buildGun(k), steel = new Steel(rig);
    rig.setElevation(Number(q.get('el') ?? GUNS[k].loadEl)); rig.setBreech(Number(q.get('breech') ?? 0)); rig.root.updateMatrixWorld(true); steel.update();
    const [cx, cz] = q.get('at').split(',').map(Number), rr = Number(q.get('r') ?? 0.3), W = steel.world, bins = {};
    for (let i = 0; i < W.length / 3; i++) if (Math.hypot(W[i * 3] - cx, W[i * 3 + 2] - cz) < rr) { const y = (Math.round(W[i * 3 + 1] * 10) / 10).toFixed(1); bins[y] = (bins[y] ?? 0) + 1; }
    window.__crew = { done: true, map: { spots: [JSON.stringify(bins)], rows: [] } }; return;
  }
  if (q.has('count')) {
    const r = {};
    for (const k of ['bl15', 'bl92', 'bl6', 'bl60', 'rail']) {
      const rig = buildGun(k); let tris = 0, meshes = 0; const under = {};
      rig.root.traverse((o) => { if (o.isMesh) { meshes++; const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; tris += n;
        let top = 'root'; for (let p = o.parent; p; p = p.parent) if (p.name && Object.keys(rig.pivots).includes(p.name)) top = p.name + '>' + top; under[top] = (under[top] ?? 0) + n; } });
      r[k] = { tris, meshes, under, pivots: Object.keys(rig.pivots), spots: rig.anchors.crew.map((c) => c.role + ':' + c.y.toFixed(2)).join(' ') };
    }
    window.__crew = { done: true, count: r }; return;
  }
  if (q.get('map')) { window.__crew = { done: true, map: plan(q.get('map')) }; document.getElementById('info').textContent = 'map'; return; }
  const guns = q.get('gun') && q.get('gun') !== 'all' ? q.get('gun').split(',') : ['bl15', 'bl92', 'bl6', 'bl60', 'rail'];
  const scns = (q.get('scn') ?? '0,1,2').split(',').map(Number);
  const speed = Number(q.get('speed') ?? 1);
  const out = { done: false, results: {} };
  window.__crew = out;
  const info = document.getElementById('info');
  for (const k of guns) {
    out.results[k] = {};
    for (const s of scns) {
      info.textContent = `running ${k} scn ${s}`;
      await new Promise((r) => setTimeout(r, 10));
      const t0 = performance.now();
      out.results[k][s] = runGun(k, s, speed, scns[0]);
      if (R3) R3.rowBase = (R3.rowBase ?? 0) + R3.cams.length;
      out.results[k][s].ms = Math.round(performance.now() - t0);
    }
  }
  out.done = true;
  // a compact summary for reading
  out.summary = Object.fromEntries(Object.entries(out.results).map(([k, v]) => [k, Math.max(...Object.values(v).map((r) => r.max)).toFixed(3)]));
  // short form for reading: worst per role and per target, the 12 deepest events
  out.brief = {};
  for (const [k, v] of Object.entries(out.results)) for (const [s, r] of Object.entries(v)) {
    const f = (o) => Object.fromEntries(Object.entries(o).map(([a, b]) => [a, +b.toFixed(3)]));
    out.brief[`${k}/${s}`] = { max: +r.max.toFixed(3), byRole: f(r.byRole), byTarget: f(r.byTarget), homes: r.homes, plans: r.plans, motion: Object.fromEntries(Object.entries(r.motion).map(([role, M]) => [role, `v${M.maxV.toFixed(1)} run${M.run.toFixed(1)}s jump${M.jumps} tp${M.teleports} snap${M.snaps} flick${M.flicker} slide${M.slide.toFixed(2)}m hand${M.handMax.toFixed(2)}/${M.handMiss}${M.handWorst && M.handMax > 0.15 ? ` [${M.handWorst}]` : ''} body${M.inBody} elbow${M.elbowIn} drop${M.drop ?? 0}`])),
      motionEvents: Object.fromEntries(Object.entries(r.motion).filter(([, M]) => M.worst.length).map(([role, M]) => [role, M.worst.slice(0, Number(q.get('ev') ?? 8))])),
      slides: Object.fromEntries(Object.entries(r.motion).map(([role, M]) => [role, Object.entries(M.slideBy ?? {}).filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')]).filter(([, v]) => v)),
      top: r.worst.sort((a, b) => b.pen - a.pen).slice(0, Number(q.get('top') ?? 10)).map((w) => `${w.pen} ${w.role} ${w.part} vs ${w.vs} @${w.step} t=${w.t} k=${w.k} at ${w.at}${w.with ? ' with ' + w.with : ''}${w.pt ? ' pt ' + w.pt : ''}${w.own ? ' own ' + w.own : ''}`) };
  }
  info.textContent = JSON.stringify(out.summary);
}
main().catch((e) => { console.error(e); document.getElementById('info').textContent = String(e.stack || e); window.__crew = { error: String(e.stack || e) }; });

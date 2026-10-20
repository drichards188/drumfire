// Mechanism clip check: builds each gun, drives it through GunViews exactly as the game does (so the
// pose code under test is the shipped code), and tests the moving parts against the parts they could
// hit. Each mesh group (carriage, cradle, barrel, breech carrier, tray, crane, hook block, trolley, the
// crew's shell, bag and rammer staff) is turned into world-space triangles; points sampled on the
// mover's surface are tested for being inside the other group's solids (axis rays with a winding
// count, majority of six directions) and the depth is the shortest way out. Pairs that nest by design
// (barrel in cradle, carrier on the ring, crane on its sleepers) are exempted point by point against a
// reference pose. Results: window.__clip and the page. ?gun=bl15,bl92 limits it, &fast=1 samples less.
import * as THREE from 'three';
import { GUNS, STEP } from '../sim/tables.js';
import { buildGun, loadGuns } from '../models/guns.js';
import { GunViews } from './guns.js';

const q = new URLSearchParams(location.search);
const KINDS = (q.get('gun') || 'bl15,bl92,bl6,bl60,rail').split(',');
const FAST = q.has('fast');
const TOL = 0.01; // reported as a violation above this depth (m)
const SAMPLE = 0.09; // surface sample spacing (m)
const CELL = 0.25;
const out = document.getElementById('out');
const log = (s) => { out.textContent += '\n' + s; };

// [mover, obstacle, nested]
const PAIRS = [
  ['breech', 'tray'], ['breech', 'recoil', 1], ['breech', 'elevation'], ['breech', 'traverse'], ['breech', 'root'], ['breech', 'cshell'], ['breech', 'cbag'], ['breech', 'staff'],
  ['tray', 'recoil'], ['tray', 'elevation'], ['tray', 'traverse'], ['tray', 'root'], ['tray', 'crane'], ['tray', 'hoist'],
  ['recoil', 'traverse'], ['recoil', 'elevation', 1], ['recoil', 'root'], ['recoil', 'tray'], ['recoil', 'crane'], ['recoil', 'trolley'],
  ['elevation', 'traverse', 1], ['elevation', 'root'], ['elevation', 'tray'], ['elevation', 'crane'],
  ['cshell', 'tray'], ['cshell', 'recoil'], ['cshell', 'elevation'], ['cshell', 'traverse'], ['cshell', 'breech'], ['cshell', 'crane'], ['cshell', 'trolley'], ['cshell', 'root'],
  ['cbag', 'tray'], ['cbag', 'recoil'], ['cbag', 'breech'], ['cbag', 'traverse'], ['cbag', 'elevation'],
  ['staff', 'tray'], ['staff', 'breech'], ['staff', 'recoil'], ['staff', 'traverse'], ['staff', 'elevation'],
  ['hoist', 'traverse'], ['hoist', 'tray'], ['hoist', 'recoil'], ['hoist', 'elevation'], ['hoist', 'root'], ['hoist', 'breech'],
  ['crane', 'traverse'], ['crane', 'tray'], ['crane', 'recoil'], ['crane', 'elevation'], ['crane', 'root', 1],
  ['bridge', 'breech'], ['bridge', 'recoil'], ['bridge', 'elevation'], ['bridge', 'tray'], ['bridge', 'traverse', 1], ['cshell', 'bridge'], ['staff', 'bridge'], ['trolley', 'bridge', 1],
  ['tray', 'breech'], ['recoil', 'breech', 1], ['traverse', 'breech'], ['traverse', 'recoil'], ['traverse', 'tray'], ['traverse', 'elevation', 1], ['elevation', 'recoil', 1], ['elevation', 'breech'], ['crane', 'hoist', 1], ['hoist', 'crane', 1], ['traverse', 'bridge', 1], ['traverse', 'trolley', 1],
  ['trolley', 'tray'], ['trolley', 'recoil'], ['trolley', 'elevation'], ['trolley', 'traverse', 1], ['trolley', 'breech'], ['trolley', 'root', 1],
];

// ------------------------------------------------------------------ geometry helpers
const lcache = new WeakMap();
function localTris(mesh, minArea) {
  const key = minArea;
  let c = lcache.get(mesh);
  if (c && c.key === key) return c.t;
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count / 3 : p.count / 3;
  const a = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
    va.fromBufferAttribute(p, i0); vb.fromBufferAttribute(p, i1); vc.fromBufferAttribute(p, i2);
    const area = vb.clone().sub(va).cross(vc.clone().sub(va)).length() * 0.5;
    if (area < minArea) continue;
    a.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
  }
  const t = new Float32Array(a);
  lcache.set(mesh, { key, t });
  return t;
}

function worldTris(meshes, minArea) {
  let total = 0;
  const parts = meshes.map((m) => { const t = localTris(m, minArea); total += t.length; return t; });
  const o = new Float32Array(total);
  let k = 0;
  meshes.forEach((m, mi) => {
    const e = m.matrixWorld.elements, t = parts[mi];
    for (let i = 0; i < t.length; i += 3) {
      const x = t[i], y = t[i + 1], z = t[i + 2];
      o[k++] = e[0] * x + e[4] * y + e[8] * z + e[12];
      o[k++] = e[1] * x + e[5] * y + e[9] * z + e[13];
      o[k++] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  });
  return o;
}

// sample points on a group's triangles at SAMPLE spacing, in each mesh's local space (stable across poses)
const scache = new WeakMap();
function localSamples(mesh) {
  let s = scache.get(mesh);
  if (s) return s;
  const t = localTris(mesh, 4e-4), pts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < t.length; i += 9) {
    a.set(t[i], t[i + 1], t[i + 2]); b.set(t[i + 3], t[i + 4], t[i + 5]); c.set(t[i + 6], t[i + 7], t[i + 8]);
    e1.subVectors(b, a); e2.subVectors(c, a);
    const L = Math.max(e1.length(), e2.length(), c.clone().sub(b).length());
    const n = Math.max(1, Math.ceil(L / SAMPLE));
    for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
      // the barycentric grid, nudged inside so corners are not all duplicates across triangles
      const fu = (u + 0.33) / (n + 0.99), fv = (v + 0.33) / (n + 0.99);
      if (fu + fv > 1) continue;
      pts.push(a.x + e1.x * fu + e2.x * fv, a.y + e1.y * fu + e2.y * fv, a.z + e1.z * fu + e2.z * fv);
    }
  }
  s = new Float32Array(pts);
  scache.set(mesh, s);
  return s;
}
function worldSamples(meshes) {
  let total = 0;
  const parts = meshes.map((m) => { const t = localSamples(m); total += t.length; return t; });
  const o = new Float32Array(total);
  o.owner = new Uint16Array(total / 3);
  let k = 0;
  meshes.forEach((m, mi) => {
    const e = m.matrixWorld.elements, t = parts[mi];
    for (let i = 0; i < t.length; i += 3) {
      const x = t[i], y = t[i + 1], z = t[i + 2];
      o.owner[k / 3] = mi;
      o[k++] = e[0] * x + e[4] * y + e[8] * z + e[12];
      o[k++] = e[1] * x + e[5] * y + e[9] * z + e[13];
      o[k++] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  });
  return o;
}

function buildGrid(tris) {
  const n = tris.length / 9;
  const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) {
    if (tris[i + a] < bb.min[a]) bb.min[a] = tris[i + a];
    if (tris[i + a] > bb.max[a]) bb.max[a] = tris[i + a];
  }
  if (!n) return { n: 0, bb };
  const dims = [0, 1, 2].map((a) => Math.max(1, Math.ceil((bb.max[a] - bb.min[a]) / CELL) + 1));
  const ncell = dims[0] * dims[1] * dims[2];
  const count = new Uint32Array(ncell + 1);
  const range = (i) => {
    const r = [];
    for (let a = 0; a < 3; a++) {
      const lo = Math.min(tris[i + a], tris[i + 3 + a], tris[i + 6 + a]), hi = Math.max(tris[i + a], tris[i + 3 + a], tris[i + 6 + a]);
      r.push(Math.floor((lo - bb.min[a]) / CELL), Math.floor((hi - bb.min[a]) / CELL));
    }
    return r;
  };
  const each = (fn) => {
    for (let t = 0; t < n; t++) {
      const r = range(t * 9);
      for (let z = r[4]; z <= r[5]; z++) for (let y = r[2]; y <= r[3]; y++) for (let x = r[0]; x <= r[1]; x++) fn(t, x + dims[0] * (y + dims[1] * z));
    }
  };
  each((t, c) => count[c + 1]++);
  for (let c = 0; c < ncell; c++) count[c + 1] += count[c];
  const fill = count.slice(0, ncell), items = new Uint32Array(count[ncell]);
  each((t, c) => { items[fill[c]++] = t; });
  return { n, tris, bb, dims, start: count, items, stamp: new Int32Array(n), sid: 0 };
}

const JX = 1.2345e-5, JY = 2.3456e-5;
const hits = [];
// winding of the group at point p along +-axis: returns the exit distance if inside (0 if outside)
function cast(G, px, py, pz, axis, sgn) {
  const p = [px, py, pz], a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  const u = p[a1] + JX, v = p[a2] + JY;
  if (u < G.bb.min[a1] || u > G.bb.max[a1] || v < G.bb.min[a2] || v > G.bb.max[a2]) return 0;
  const cu = Math.floor((u - G.bb.min[a1]) / CELL), cv = Math.floor((v - G.bb.min[a2]) / CELL);
  const c0 = Math.floor((p[axis] - G.bb.min[axis]) / CELL);
  const dn = G.dims[axis];
  const from = sgn > 0 ? Math.max(0, c0) : Math.min(dn - 1, c0), to = sgn > 0 ? dn - 1 : 0;
  G.sid++;
  hits.length = 0;
  const T = G.tris;
  for (let c = from; sgn > 0 ? c <= to : c >= to; c += sgn) {
    const ci = [0, 0, 0];
    ci[axis] = c; ci[a1] = cu; ci[a2] = cv;
    const cell = ci[0] + G.dims[0] * (ci[1] + G.dims[1] * ci[2]);
    for (let k = G.start[cell]; k < G.start[cell + 1]; k++) {
      const t = G.items[k];
      if (G.stamp[t] === G.sid) continue;
      G.stamp[t] = G.sid;
      const o = t * 9;
      // project to the plane perpendicular to the axis
      const ax = T[o + a1], ay = T[o + a2], bx = T[o + 3 + a1], by = T[o + 3 + a2], cx = T[o + 6 + a1], cy = T[o + 6 + a2];
      // barycentric of (u, v) by Cramer's rule
      const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (det === 0) continue;
      const wb = ((u - ax) * (cy - ay) - (cx - ax) * (v - ay)) / det;
      const wc = ((bx - ax) * (v - ay) - (u - ax) * (by - ay)) / det;
      const wa = 1 - wb - wc;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const pos = wa * T[o + axis] + wb * T[o + 3 + axis] + wc * T[o + 6 + axis];
      const tt = (pos - p[axis]) * sgn;
      if (tt <= 0) continue;
      // (axis, a1, a2) is a cyclic order, so det is the triangle normal's component along the axis
      hits.push(tt, (det * sgn) > 0 ? 1 : -1);
    }
  }
  const m = hits.length / 2;
  if (!m) return 0;
  const idx = [];
  for (let i = 0; i < m; i++) idx.push(i);
  idx.sort((i, j) => hits[i * 2] - hits[j * 2]);
  let w = 0;
  for (let i = 0; i < m; i++) w += hits[i * 2 + 1];
  if (w <= 0) return 0;
  for (let i = 0; i < m; i++) {
    w -= hits[idx[i] * 2 + 1];
    if (w <= 0) return hits[idx[i] * 2];
  }
  return 0;
}
const DIRS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
// depth of the point inside the group (0 when outside)
function depthIn(G, x, y, z) {
  if (!G.n) return 0;
  if (x < G.bb.min[0] || x > G.bb.max[0] || y < G.bb.min[1] || y > G.bb.max[1] || z < G.bb.min[2] || z > G.bb.max[2]) return 0;
  let inside = 0, best = Infinity;
  for (let i = 0; i < 6; i++) {
    const e = cast(G, x, y, z, DIRS[i][0], DIRS[i][1]);
    if (e > 0) { inside++; if (e < best) best = e; }
    if (inside + 5 - i < 4) return 0;
  }
  return inside >= 4 ? best : 0;
}

// ------------------------------------------------------------------ rigs and poses
function makeCtx(kind) {
  const rig = buildGun(kind);
  const g = GUNS[kind];
  const piece = { i: 0, kind, az: 0, el: g.restEl, cmd: { az: 0, el: g.restEl, tof: 0, ok: false }, state: 'idle', job: null, ji: 0, recoil: 0, breech: 0, rounds: 0, loaded: false, firedAt: -999, fireAt: 0, crew: 10, crewMax: 10 };
  const sim = { time: 100, alpha: 0, units: [{ id: 1, pieces: [piece] }], unitById: () => sim.units[0] };
  const scene = new THREE.Scene();
  scene.add(rig.root);
  const rigs = new Map([['1:0', rig]]);
  const views = new GunViews(scene, sim, null, rigs, null, true);
  const crew = views.views[0].crew;
  const map = new Map();
  for (const [k, o] of Object.entries(rig.pivots)) if (k !== 'car' && k !== 'bogies') map.set(o, k); // the car and its wheels are the 'root' steel
  if (crew) {
    map.set(crew.shellA, 'cshell'); map.set(crew.shellB, 'cshellB'); map.set(crew.bag, 'cbag'); map.set(crew.staff, 'staff'); map.set(crew.rope, null);
    for (const m of crew.men) map.set(m.root, null);
  }
  for (const o of Object.values(rig.props || {})) map.set(o, null);
  return { kind, rig, g, piece, sim, views, crew, map };
}

function boreAxis(ctx) {
  const a = ctx.rig.anchors.breech.getWorldPosition(new THREE.Vector3()), m = ctx.rig.anchors.muzzle.getWorldPosition(new THREE.Vector3());
  const d = m.clone().sub(a).normalize(), w = new THREE.Vector3();
  return { dist: (x, y, z) => w.set(x, y, z).sub(a).cross(d).length() };
}

// the barrel's own steel slides through the cradle sleeve and the piston rods into their cylinders: by design
function slides(rig, mesh, x, y, z) {
  if ((rig.slideMats ?? ['iron']).includes(mesh.name)) return true;
  if (mesh.name !== 'steel' || !rig.nest) return false;
  const l = rig.pivots.elevation.worldToLocal(new THREE.Vector3(x, y, z));
  return rig.nest.some(([nx, ny]) => Math.hypot(l.x - nx, l.y - ny) < 0.07);
}

// the cradle's solid sleeve and glands close round the barrel's jacket and rods as they slide: by design
const BARREL_R = { bl15: 0.76, bl92: 0.52, rail: 0.62, bl6: 0.17, bl60: 0.17 };
function cradleOver(ctx, x, y, z) {
  const rig = ctx.rig, l = rig.pivots.elevation.worldToLocal(new THREE.Vector3(x, y, z));
  if (Math.hypot(l.x, l.y) < BARREL_R[ctx.kind] + 0.03) return true;
  return !!rig.nest && rig.nest.some(([nx, ny]) => Math.hypot(l.x - nx, l.y - ny) < 0.22);
}

function setPose(ctx, p) {
  const { piece, sim, g } = ctx;
  piece.az = piece.cmd.az = p.az ?? 0;
  piece.el = piece.cmd.el = p.el;
  piece.job = null; piece.state = 'idle'; piece.breech = 0; piece.loaded = false; piece.rounds = 0; piece.firedAt = -999;
  if (p.step) {
    const idx = g.load.findIndex((s) => s.step === p.step), st = g.load[idx];
    piece.state = 'loading'; piece.ji = idx;
    piece.job = { step: p.step, t: p.k * st.dur, dur: st.dur, i: idx, n: g.load.length };
    const iOpen = g.load.findIndex((s) => s.step === 'open'), iClose = g.load.findIndex((s) => s.step === 'close');
    piece.breech = p.step === 'open' ? p.k : p.step === 'close' ? 1 - p.k : idx > iOpen && idx < iClose ? 1 : 0;
    piece.loaded = idx > g.load.findIndex((s) => s.step === 'ram');
  } else if (p.ready) { piece.state = 'ready'; piece.loaded = true; piece.rounds = 3; piece.fireAt = sim.time + 30; }
  sim.time = 100; sim.alpha = 0;
  ctx.views.update(0.016, 0.016, sim);
  if (p.recoil != null) ctx.rig.setRecoil(p.recoil * (ctx.rig.recoilFade ? ctx.rig.recoilFade(p.el) : 1));
  ctx.rig.root.updateMatrixWorld(true);
}

function visibleDeep(o, root) {
  for (; o; o = o.parent) { if (!o.visible) return false; if (o === root) break; }
  return true;
}
function groups(ctx) {
  const G = {};
  ctx.rig.root.traverse((m) => {
    if (!m.isMesh || !visibleDeep(m, ctx.rig.root)) return;
    let name = 'root';
    for (let o = m; o; o = o.parent) {
      if (ctx.map.has(o)) { name = ctx.map.get(o); break; }
      if (o === ctx.rig.root) break;
    }
    if (name == null) return;
    (G[name] ??= []).push(m);
  });
  return G;
}

// ------------------------------------------------------------------ the poses of a gun
function posesFor(kind, g) {
  const poses = [];
  const heavy = g.load[0].step === 'depress';
  const S = FAST ? 4 : 8;
  const sm = (k) => k * k * (3 - 2 * k);
  const lo = Math.min(g.elMin, g.loadEl), hi = g.elMax;
  const fireEls = heavy ? [g.elMin, g.elMax] : [g.elMin, (g.elMin + g.elMax) / 2, g.elMax];
  const azs = [0, g.traverse * 0.9]; // everything but the crane, trolley and stack turns with the traverse pivot
  for (const fe of fireEls) {
    for (const az of azs) {
      if (az !== 0 && fe !== fireEls[0]) continue;
      for (const st of g.load) {
        for (let s = 0; s <= S; s++) {
          const k = s / S;
          let el = heavy ? g.loadEl : fe;
          if (heavy && st.step === 'depress') el = fe + (g.loadEl - fe) * sm(k);
          if (heavy && st.step === 'lay') el = g.loadEl + (fe - g.loadEl) * sm(k);
          poses.push({ label: `cycle ${st.step} ${k.toFixed(2)} fireEl ${(fe * 57.3).toFixed(0)} az ${(az * 57.3).toFixed(0)}`, step: st.step, k, el, az });
        }
      }
    }
  }
  const ne = FAST ? 4 : 8;
  for (let i = 0; i <= ne; i++) {
    const el = lo + (hi - lo) * (i / ne);
    for (const r of [0, 0.25, 0.5, 0.75, 1]) poses.push({ label: `recoil ${r} el ${(el * 57.3).toFixed(0)}`, ready: true, el, recoil: r });
  }
  return poses;
}

// ------------------------------------------------------------------ run
const TM = { pose: 0, grid: 0, samp: 0, test: 0 };
async function runGun(kind) {
  const ctx = makeCtx(kind);
  const g = ctx.g;
  const res = {}; // 'A>B' -> { depth, pose, at, n }
  const refFlags = {}; // 'A>B' -> Uint8Array (point inside at the reference pose)
  const poses = posesFor(kind, g);
  // reference pose for nested pairs: the gun at rest
  const ref = { label: 'ref', ready: true, el: g.loadEl, recoil: 0 };
  const all = [ref, ...poses];
  let done = 0;
  const t0 = performance.now();
  for (const pose of all) {
    let t1 = performance.now();
    setPose(ctx, pose);
    TM.pose += performance.now() - t1;
    const G = groups(ctx);
    const cache = {};
    const grid = (name) => cache[name] ??= (() => { const t = performance.now(); const r = G[name] ? buildGrid(worldTris(G[name], 6e-4)) : { n: 0 }; TM.grid += performance.now() - t; return r; })();
    for (const [A, B, nested] of PAIRS) {
      if (!G[A] || !G[B]) continue;
      const key = `${A}>${B}`;
      const gr = grid(B);
      if (!gr.n) continue;
      let t2 = performance.now();
      const pts = worldSamples(G[A]);
      TM.samp += performance.now() - t2;
      t2 = performance.now();
      const n = pts.length / 3;
      if (pose === ref && nested) refFlags[key] = new Uint8Array(n);
      const flags = nested ? refFlags[key] : null;
      const bore = (A === 'cshell' || A === 'cbag' || A === 'staff') && (B === 'recoil' || B === 'elevation') ? boreAxis(ctx) : null;
      let worst = 0, wi = -1, cnt = 0;
      for (let i = 0; i < n; i++) {
        const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        const d = depthIn(gr, x, y, z);
        if (d <= 0) continue;
        if (bore && bore.dist(x, y, z) < ctx.rig.shell.rad + 0.04) continue; // rounds go into the bore, which the barrel model does not hollow out
        if (pose === ref && nested) { flags[i] = 1; continue; }
        if (flags && flags.length === n && flags[i]) continue;
        if (A === 'elevation' && B === 'recoil' && cradleOver(ctx, x, y, z)) continue;
        if (A === 'recoil' && B === 'elevation' && slides(ctx.rig, G[A][pts.owner[i]], x, y, z)) continue;
        if (d > TOL) cnt++;
        if (d > worst) { worst = d; wi = i; }
      }
      TM.test += performance.now() - t2;
      if (pose === ref) {
        // an un-nested pair that already penetrates at rest is reported as well
        if (!nested && worst > 0) (res[key] ??= { depth: 0, n: 0 });
      }
      if (worst > 0) {
        const r = (res[key] ??= { depth: 0, n: 0, poses: 0 });
        if (cnt) r.poses = (r.poses || 0) + 1;
        r.n += cnt;
        if (worst > r.depth) {
          r.depth = worst; r.pose = pose.label;
          if (wi >= 0) {
            const w = new THREE.Vector3(pts[wi * 3], pts[wi * 3 + 1], pts[wi * 3 + 2]);
            const inFrame = (name) => { const o = name === 'root' ? ctx.rig.root : ctx.rig.pivots[name]; return o ? o.worldToLocal(w.clone()).toArray().map((v) => +v.toFixed(2)) : null; };
            r.at = w.toArray().map((v) => +v.toFixed(2));
            r.mat = G[A][pts.owner[wi]].name;
            r.a = inFrame(A); r.b = inFrame(B);
          }
        }
      }
    }
    done++;
    if (done % 10 === 0) { out.textContent = out.textContent.replace(/\n\.\.\. .*$/, '') + `\n... ${kind} ${done}/${all.length} (${((performance.now() - t0) / 1000).toFixed(0)}s)`; await new Promise((r) => setTimeout(r, 0)); }
  }
  out.textContent = out.textContent.replace(/\n\.\.\. .*$/, '');
  const rows = Object.entries(res).map(([k, v]) => ({ pair: k, cm: +(v.depth * 100).toFixed(1), posesOver: v.poses || 0, pose: v.pose, mat: v.mat, inA: v.a, inB: v.b })).sort((a, b) => b.cm - a.cm);
  return { kind, poses: all.length, rows, bad: rows.filter((r) => r.cm > TOL * 100) };
}

async function main() {
  await loadGuns([...new Set(['bl6', 'bl60', ...KINDS])]); // any registered kind asked for (the WW2 and WW1 guns too)
  const result = {};
  window.__clip = { done: false, result };
  for (const kind of KINDS) {
    try {
      result[kind] = await runGun(kind);
    } catch (e) {
      result[kind] = { error: String(e.stack || e) };
    }
    const r = result[kind];
    if (r.error) log(`${kind}: ERROR ${r.error}`);
    else {
      log(`== ${kind}: ${r.poses} poses, ${r.bad.length} pairs over ${TOL * 100} cm`);
      for (const b of r.rows.slice(0, 14)) log(`   ${b.pair.padEnd(20)} ${String(b.cm).padStart(6)} cm  (${b.posesOver} poses)  worst: ${b.pose} ${b.mat} A${JSON.stringify(b.inA)} B${JSON.stringify(b.inB)}`);
    }
  }
  window.__clip.timing = TM;
  log('timing ms ' + JSON.stringify(TM, (k, v) => typeof v === 'number' ? Math.round(v) : v));
  window.__clip.done = true;
  window.__clip.summary = Object.fromEntries(Object.entries(result).map(([k, r]) => [k, r.error ? 'ERROR' : r.bad.map((b) => `${b.pair} ${b.cm}`)]));
}
main().catch((e) => { out.textContent += '\nFAILED ' + (e.stack || e); window.__clip = { done: true, error: String(e.stack || e) }; });

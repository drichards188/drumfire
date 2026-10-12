// Trench systems as geometry: sector.js LINES turned into crenellated fire trenches (fire bays
// and traverses), communication trenches, wire belts and the roads and tracks. Pure and Node-safe
// (no three, no DOM): the terrain cuts the ground along these polylines, the world builder
// dresses them with walls, sandbags and duckboards, the sim may query them.
//
// Everything is deterministic (a local integer hash, no Math.random). Control points of LINES are
// 2 km apart, so each line is first smoothed (Catmull-Rom) and given a slow wander of a few metres
// so it does not read as a ruled line; then the bays are laid on it.
import { LINES, PLACES, SITES, RAIL_SPUR, UNITS, lineX } from './sector.js';

function hash(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}
const sm = (t) => t * t * (3 - 2 * t);
const vn1 = (x, s) => {
  const i = Math.floor(x), f = x - i;
  return hash(i, 0, s) * (1 - sm(f)) + hash(i + 1, 0, s) * sm(f);
};

// ---------------------------------------------------------------- polyline helpers
function catmull(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ x: pts[pts.length - 1].x, z: pts[pts.length - 1].z });
  return out;
}

// arclength table and a sampler returning position and left-hand normal at arclength s
function pathOf(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  let k = 0;
  const at = (s, o = {}) => {
    s = Math.max(0, Math.min(cum[cum.length - 1], s));
    while (k > 0 && cum[k] > s) k--;
    while (k < pts.length - 2 && cum[k + 1] < s) k++;
    const a = pts[k], b = pts[k + 1], l = Math.max(cum[k + 1] - cum[k], 1e-6), t = (s - cum[k]) / l;
    const tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
    o.x = a.x + (b.x - a.x) * t; o.z = a.z + (b.z - a.z) * t;
    o.tx = tx; o.tz = tz; o.nx = tz; o.nz = -tx; // normal: travel is north to south (+z), so this points east
    return o;
  };
  return { length: cum[cum.length - 1], at };
}

// a slowly wandering offset across the line (metres), seeded per line
const wander = (s, seed, amp) => (vn1(s / 170, seed) - 0.5) * 2 * amp + (vn1(s / 53, seed + 1) - 0.5) * amp * 0.5;

// Crenellated trench: bays of ~bay m on alternating sides of the line, joined by short jogs (the
// traverse stands in the notch). Returns the centre polyline.
function crenellate(base, seed, { bay, amp, jog, wanderAmp }) {
  const path = pathOf(base);
  const pts = [];
  const o = {};
  const put = (s, side) => {
    path.at(s, o);
    const w = wander(s, seed, wanderAmp) + side;
    pts.push({ x: o.x + o.nx * w, z: o.z + o.nz * w });
  };
  let s = 0, side = amp, i = 0;
  while (s < path.length) {
    const len = bay * (0.78 + 0.44 * hash(i, seed, 5));
    put(s, side);
    s += len;
    put(Math.min(s, path.length), side);
    side = -side;
    s += jog;
    i++;
  }
  return pts;
}

// Communication trench between two points: a series of straight legs zig-zagging across the
// direct line (so no leg can be enfiladed), leg ~leg m, swing +-amp.
function zigzag(a, b, seed, { leg = 11, amp = 3.2 } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
  const pts = [{ x: a.x, z: a.z }];
  const n = Math.max(1, Math.round(len / leg));
  for (let i = 1; i < n; i++) {
    const s = (i / n) * len, side = (i % 2 ? 1 : -1) * amp * (0.8 + 0.4 * hash(i, seed, 9));
    const w = side + (vn1(s / 90, seed) - 0.5) * 6;
    pts.push({ x: a.x + tx * s + nx * w, z: a.z + tz * s + nz * w });
  }
  pts.push({ x: b.x, z: b.z });
  return pts;
}

const smoothLine = (ctrl, seed, amp) => {
  const base = catmull(ctrl, 40);
  const path = pathOf(base);
  const o = {};
  // wander the smoothed line itself (not just the bays) so wire belts and trenches share it
  return base.map((p, i) => {
    const s = i === 0 ? 0 : path.length * (i / (base.length - 1));
    path.at(s, o);
    const w = wander(s, seed, amp);
    return { x: p.x + o.nx * w, z: p.z + o.nz * w };
  });
};

// ---------------------------------------------------------------- the systems
let SYS = null;
function build() {
  if (SYS) return SYS;
  const trench = [];
  const wire = [];
  const tr = [];
  const base = {};
  const LS = [
    ['britishFront', 'british', 'fire', { bay: 9, amp: 1.4, jog: 2.4, wanderAmp: 7 }, 11],
    ['britishSupport', 'british', 'support', { bay: 10.5, amp: 1.3, jog: 2.6, wanderAmp: 7 }, 12],
    ['germanFront', 'german', 'fire', { bay: 8.5, amp: 1.4, jog: 2.4, wanderAmp: 7 }, 13],
    ['germanSupport', 'german', 'support', { bay: 10, amp: 1.3, jog: 2.6, wanderAmp: 7 }, 14],
    ['germanReserve', 'german', 'reserve', { bay: 11, amp: 1.3, jog: 2.8, wanderAmp: 7 }, 15],
  ];
  for (const [key, side, kind, opt, seed] of LS) {
    const b = smoothLine(LINES[key], seed, 0); // the wander is applied in crenellate (once)
    base[key] = b;
    trench.push({ side, kind, pts: crenellate(b, seed, opt), line: key });
  }

  // communication trenches: front <-> support every ~600 m, and long ones to the rear
  const at = (key, z) => ({ x: lineX(base[key], z), z });
  const link = (side, key0, key1, z, seed, opt) => {
    const a = at(key0, z), b = at(key1, z + (hash(seed, 7, 3) - 0.5) * 60);
    // a little diagonal between the two lines
    trench.push({ side, kind: 'comm', pts: zigzag(a, b, seed, opt), line: key0 });
  };
  let n = 0;
  for (let z = -6500; z <= 6500; z += 560 + hash(n, 1, 71) * 220, n++) {
    link('british', 'britishSupport', 'britishFront', z, 100 + n);
    if (n % 2 === 0) link('german', 'germanFront', 'germanSupport', z + 150, 140 + n);
    if (n % 2 === 1) link('german', 'germanSupport', 'germanReserve', z + 80, 180 + n);
  }
  // to the rear: British support back toward the roads (~1.8 km), German reserve back (~1.6 km)
  n = 0;
  for (let z = -6200; z <= 6200; z += 1500 + hash(n, 1, 72) * 500, n++) {
    const a = at('britishSupport', z);
    trench.push({ side: 'british', kind: 'comm', pts: zigzag(a, { x: a.x - 1700, z: z - 250 + hash(n, 2, 72) * 500 }, 220 + n, { leg: 13, amp: 3.6 }), line: 'britishSupport' });
    const g = at('germanReserve', z + 400);
    trench.push({ side: 'german', kind: 'comm', pts: zigzag(g, { x: g.x + 1600, z: g.z + (hash(n, 3, 72) - 0.5) * 500 }, 260 + n, { leg: 13, amp: 3.6 }), line: 'germanReserve' });
  }

  // wire belts: in front of the German front (west of it), the German support and the British front
  const lineSeed = { germanFront: 13, germanSupport: 14, britishFront: 11 };
  const belt = (side, key, off, seed, w) => {
    const b = base[key], path = pathOf(b);
    let s = 0, i = 0;
    const o = {};
    while (s < path.length - 40) {
      const len = 90 + hash(i, seed, 8) * 320;
      const gap = 18 + hash(i, seed, 9) * 55;
      const pts = [];
      for (let t = s; t <= Math.min(s + len, path.length); t += 14) {
        path.at(t, o);
        const d = off + wander(t, lineSeed[key], 7) + (vn1(t / 40, seed) - 0.5) * 6;
        pts.push({ x: o.x + o.nx * d, z: o.z + o.nz * d });
      }
      if (pts.length > 2) wire.push({ side, pts, width: w });
      s += len + gap;
      i++;
    }
  };
  // the normal points east: negative offsets are west (in front of the German line), positive east (in front of the British)
  belt('german', 'germanFront', -34, 31, 14);
  belt('german', 'germanFront', -52, 32, 10);
  belt('german', 'germanSupport', -26, 33, 8);
  belt('british', 'britishFront', 38, 34, 10);

  // ---------------------------------------------------------------- roads and tracks
  // pavé roads (kind 'road'): the Menin Road east from Ypres, the Zonnebeke road, the Frezenberg
  // road, the roads behind the lines. Plank roads (3.6 m of sleepers on piles) and duckboard
  // tracks (a 0.9 m walk) cross the mud to the support lines.
  const road = (kind, ctrl, step = 30) => tr.push({ kind, pts: catmull(ctrl, step), ctrl });
  const hc = PLACES.find((p) => p.name === 'Hellfire Corner').pos;
  const ypres = PLACES.find((p) => p.name === 'Ypres').pos;
  const zon = PLACES.find((p) => p.name === 'Zonnebeke').pos;
  const gh = PLACES.find((p) => p.name === 'Gheluvelt').pos;
  const pas = PLACES.find((p) => p.name === 'Passchendaele').pos;
  const wie = PLACES.find((p) => p.name === 'Wieltje').pos;
  const fre = PLACES.find((p) => p.name === 'Frezenberg').pos;
  const X1 = SITES.find((s) => s.id === 'X1').pos, R1 = SITES.find((s) => s.id === 'R1').pos, H1 = SITES.find((s) => s.id === 'H1').pos;
  // Menin Road: Ypres, Hellfire Corner, then east into the zone toward Gheluvelt
  road('road', [{ x: ypres.x - 900, z: ypres.z + 300 }, { x: ypres.x, z: ypres.z - 100 }, { x: 0, z: 1100 }, hc, { x: 2800, z: 1300 }, { x: 4200, z: 2300 }, { x: 5400, z: 3300 }, gh, { x: 9000, z: 5200 }, { x: 11200, z: 5600 }]);
  // Zonnebeke road: Ypres north-east through the Wieltje area to Zonnebeke and on to Passchendaele
  road('road', [{ x: ypres.x, z: ypres.z - 100 }, { x: -400, z: 600 }, { x: 600, z: -900 }, wie, { x: 3400, z: -2500 }, { x: 5200, z: -1700 }, zon, { x: 8300, z: -3000 }, pas]);
  // Hellfire Corner to Wieltje, and the Frezenberg road
  road('road', [hc, { x: 1700, z: -900 }, { x: 1750, z: -2200 }, wie]);
  road('road', [wie, { x: 3000, z: -3500 }, fre, { x: 6300, z: -4200 }, pas]);
  // behind the Germans: Zonnebeke to the crossroads and the railhead, Gheluvelt to the chateau
  road('road', [zon, { x: 7700, z: -500 }, X1, { x: 9800, z: -900 }, R1]);
  road('road', [gh, { x: 8200, z: 4000 }, { x: 9400, z: 3500 }, H1]);
  road('road', [X1, { x: 8700, z: 1200 }, { x: 8400, z: 3000 }, { x: 9000, z: 5200 }]);
  // plank roads from the pavé ends to the support lines and into the zone
  road('plank', [{ x: 1750, z: -900 }, { x: 2600, z: -700 }, { x: 3500, z: -1000 }, { x: 4300, z: -1100 }, { x: 5200, z: -1000 }], 20);
  road('plank', [{ x: 2400, z: 1300 }, { x: 3200, z: 600 }, { x: 4000, z: 400 }, { x: 4900, z: 700 }], 20);
  road('plank', [{ x: 2900, z: -3500 }, { x: 3600, z: -3800 }, { x: 4400, z: -3700 }], 20);
  road('plank', [{ x: 2800, z: 1300 }, { x: 3300, z: 2600 }, { x: 3600, z: 3500 }], 20);
  // duckboard tracks across the mud
  const duck = (x0, z0, x1, z1, seed) => {
    const pts = [{ x: x0, z: z0 }];
    const len = Math.hypot(x1 - x0, z1 - z0), nn = Math.round(len / 90);
    for (let i = 1; i < nn; i++) {
      const t = i / nn, w = (vn1(i * 0.7, seed) - 0.5) * 70;
      pts.push({ x: x0 + (x1 - x0) * t - (z1 - z0) / len * w, z: z0 + (z1 - z0) * t + (x1 - x0) / len * w });
    }
    pts.push({ x: x1, z: z1 });
    tr.push({ kind: 'duckboard', pts: catmull(pts, 12) });
  };
  for (let i = 0, z = -6200; z <= 6200; z += 1050 + hash(i, 4, 73) * 300, i++) {
    const zz = z + hash(i, 5, 73) * 200;
    duck(2500, zz - 80, lineX(base.britishSupport, zz) + 30, zz, 400 + i);
    if (i % 2 === 0) duck(lineX(base.britishSupport, zz) + 30, zz, lineX(base.britishFront, zz + 100) + 20, zz + 100, 440 + i);
  }
  // behind the Germans: tracks from the reserve toward the batteries and dumps
  for (const s of SITES) if (s.kind === 'battery' || s.kind === 'dump') {
    const rx = lineX(base.germanReserve, s.pos.z);
    duck(rx + 30, s.pos.z + 60, s.pos.x - s.r * 0.8, s.pos.z, 470 + Math.floor(s.pos.z % 97));
  }

  // everything except what is built for the guns gets a small bed id for the index
  SYS = { trench, wire, tr, base, rail: RAIL_SPUR, units: UNITS };
  return SYS;
}

/** Trench centre polylines: [{ side: 'british'|'german', kind: 'fire'|'support'|'reserve'|'comm', pts: [{x,z}] }]. */
export const trenchPolylines = () => build().trench;
/** Belts of barbed wire: [{ side, pts, width }], broken into stretches with gaps where the wire was cut by shellfire. */
export const wireBelts = () => build().wire;
/** Roads and tracks: [{ kind: 'plank'|'duckboard'|'road', pts }] ('road' is the pavé). */
export const tracks = () => build().tr;
/** The smoothed (not crenellated) centre line of a LINES key, for dressing that follows the line itself. */
export const lineBase = (key) => build().base[key];

export const TRENCH = {
  fire: { depth: 1.95, a: 1.0, b: 2.0, front: 0.95, rear: 0.6 },
  support: { depth: 1.85, a: 1.0, b: 2.0, front: 0.8, rear: 0.55 },
  reserve: { depth: 1.8, a: 0.95, b: 1.9, front: 0.75, rear: 0.5 },
  comm: { depth: 1.55, a: 0.8, b: 1.6, front: 0.45, rear: 0.45 },
};
const KIND_ID = { fire: 0, support: 1, reserve: 2, comm: 3 };
export const TRACK_WIDTH = { road: 5.2, plank: 3.6, duckboard: 0.95 };
const TRACK_ID = { road: 1, plank: 2, duckboard: 3 };

// ---------------------------------------------------------------- spatial index
const CELL = 48;
function makeIndex(items, margin, kindOf) {
  const segs = []; // flat: ax, az, bx, bz, kind, side
  const grid = new Map();
  const cellKey = (i, j) => (i + 4096) * 8192 + (j + 4096);
  for (const it of items) {
    const kid = kindOf(it);
    for (let i = 0; i < it.pts.length - 1; i++) {
      const a = it.pts[i], b = it.pts[i + 1];
      const id = segs.length / 6;
      segs.push(a.x, a.z, b.x, b.z, kid, it.side === 'german' ? -1 : 1);
      const x0 = Math.floor((Math.min(a.x, b.x) - margin) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + margin) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z) - margin) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + margin) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cellKey(cx, cz);
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(id);
      }
    }
  }
  return { segs: Float64Array.from(segs), grid, cellKey };
}

let TI = null, RI = null;
const tIndex = () => TI || (TI = makeIndex(build().trench, 7, (t) => KIND_ID[t.kind]));
const rIndex = () => RI || (RI = makeIndex(build().tr, 8, (t) => TRACK_ID[t.kind]));

function nearest(ix, x, z, out) {
  const l = ix.grid.get(ix.cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  out.d = 1e9; out.kind = -1; out.side = 0; out.lat = 0;
  if (!l) return out;
  const S = ix.segs;
  for (let n = 0; n < l.length; n++) {
    const o = l[n] * 6;
    const ax = S[o], az = S[o + 1], abx = S[o + 2] - ax, abz = S[o + 3] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz + 1e-9)));
    const dx = x - (ax + abx * t), dz = z - (az + abz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < out.d) {
      out.d = d2; out.kind = S[o + 4]; out.side = S[o + 5]; out.lat = dx;
    }
  }
  out.d = Math.sqrt(out.d);
  return out;
}

const _t = { d: 0, kind: -1, side: 1, lat: 0 };
/** Distance in metres to the nearest trench centre line (1e9 when none within the index margin, ~7 m). */
export const trenchDistance = (x, z) => (x < 1200 || x > 8200 ? 1e9 : nearest(tIndex(), x, z, _t).d);
/** Like trenchDistance, filling out { d, kind (0 fire, 1 support, 2 reserve, 3 comm; -1 none), side (+1 British: parapet to the east, -1 German), lat (x offset of the point from the line) }. */
export function trenchSample(x, z, out = { d: 1e9, kind: -1, side: 1, lat: 0 }) {
  if (x < 1200 || x > 8200) { out.d = 1e9; out.kind = -1; return out; }
  return nearest(tIndex(), x, z, out);
}
const _r = { d: 0, kind: -1, side: 1, lat: 0 };
/** Distance to the nearest road or track centre line (1e9 when none within ~8 m) and its kind (1 pavé, 2 plank, 3 duckboard). */
export function trackSample(x, z, out = { d: 1e9, kind: -1 }) {
  nearest(rIndex(), x, z, _r);
  out.d = _r.d; out.kind = _r.kind;
  return out;
}

// the kind names for TRENCH, indexed by KIND_ID
export const TRENCH_KINDS = ['fire', 'support', 'reserve', 'comm'];

/** Segments of every trench and track within a rectangle (for the mask rasteriser): [{ ax, az, bx, bz, kind, track }] */
export function segmentsIn(x0, z0, x1, z1, which = 'trench') {
  const ix = which === 'trench' ? tIndex() : rIndex();
  const seen = new Set(), out = [];
  const S = ix.segs;
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const l = ix.grid.get(ix.cellKey(i, j));
      if (!l) continue;
      for (const id of l) {
        if (seen.has(id)) continue;
        seen.add(id);
        const o = id * 6;
        out.push({ ax: S[o], az: S[o + 1], bx: S[o + 2], bz: S[o + 3], kind: S[o + 4] });
      }
    }
  }
  return out;
}

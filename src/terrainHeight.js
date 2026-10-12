// Pure terrain height (no DOM, no three): importable in Node, used by the sim for terrain following
// and shell impacts and by the renderer to build the mesh, so the two always agree.
//
// Flanders, autumn 1917: low flat ground (~18 m) on the British side, a gentle rise to the ridges
// the Germans held (~55 m, north-east and east), two streams running north through the zone, and
// the devastated zone (sector.js ZONE): a deterministic cellular field of overlapping shell holes
// with raised lips, the trench systems cut into it (trenchlines.js), the levelled pads (flatPads).
// Craters of this battle are not here: they are runtime (craters.js) and visual only.
import { flatPads, ZONE, GROUND, PLACES, SITES } from './sector.js';
import { trenchSample, trackSample, TRENCH, TRENCH_KINDS, TRACK_WIDTH } from './trenchlines.js';

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// integer hash in [0, 1); the same function exists in GLSL (terrainField.js) so fields match
export function ihash(x, y, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(s, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

// smooth value noise in [0, 1]
function vn(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = ihash(xi, zi, s), b = ihash(xi + 1, zi, s), c = ihash(xi, zi + 1, s), d = ihash(xi + 1, zi + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// ---------------------------------------------------------------- the natural ground
const RIDGE_RISE = GROUND.ridge - GROUND.base;

// `fine` false drops the small octaves (far mesh levels, the water table)
function natural(x, z, fine) {
  // the rise toward the ridges: east, and sooner to the north (Passchendaele ridge)
  const rise = smooth(1800, GROUND.ridgeX + 1000, x - 0.12 * z);
  let h = GROUND.base + RIDGE_RISE * rise * (0.82 + 0.36 * vn(x / 3400, z / 3400, 1));
  h += 6 * rise * (vn(x / 1500 + 3, z / 1900, 2) - 0.5) * 2; // low spurs running off the ridge
  h += 0.8 * (vn(x / 340, z / 340, 3) - 0.5) + 0.35 * rise * (vn(x / 130 + 9, z / 130, 8) - 0.5) * 2;
  if (fine) h += 0.3 * (vn(x / 61, z / 61, 4) - 0.5) + 0.1 * (vn(x / 17, z / 17, 6) - 0.5);
  // far country: low hills well beyond the sector so the horizon is not a table
  const m = smooth(16000, 26000, Math.hypot(x - 3000, z));
  if (m > 0) h += m * (42 * Math.pow(vn(x / 6000 + 3, z / 6000 + 9, 9), 1.5) + 14 * vn(x / 2300, z / 2300, 10));
  return h;
}

// ---------------------------------------------------------------- streams
// The Steenbeek and the Hanebeek run roughly north through the zone in a shallow valley, with a
// narrow channel; the floodplain is boggy where they cross the front systems.
export const STREAMS = [
  { name: 'Steenbeek', halfW: 4.2, x: (z) => 2650 + 330 * Math.sin(z / 2400 + 0.4) + 110 * Math.sin(z / 760 + 1.0) },
  { name: 'Hanebeek', halfW: 3.4, x: (z) => 5900 + 380 * Math.sin(z / 2000 + 2.2) + 90 * Math.sin(z / 650) },
];

const _st = { d: 1e9, i: -1, cx: 0 };
/** Distance (m, approx) to the nearest stream centre line; fills { d, i, cx }. */
export function streamSample(x, z, out = _st) {
  out.d = 1e9; out.i = -1;
  for (let i = 0; i < STREAMS.length; i++) {
    const S = STREAMS[i], cx = S.x(z), dx = Math.abs(x - cx);
    if (dx > 220) continue;
    const sl = (S.x(z + 5) - S.x(z - 5)) / 10;
    const d = dx / Math.sqrt(1 + sl * sl);
    if (d < out.d) { out.d = d; out.i = i; out.cx = cx; }
  }
  return out;
}
const streamLower = (x, z, channel) => {
  const s = streamSample(x, z);
  if (s.d > 160) return 0;
  let l = 0.6 * (1 - smooth(10, 75, s.d));
  if (channel) l += 1.25 * (1 - smooth(STREAMS[s.i].halfW - 1.2, STREAMS[s.i].halfW + 2.4, s.d));
  return l;
};

const ground0 = (x, z, fine, channel = true) => natural(x, z, fine) - streamLower(x, z, channel);
/** The ground without craters, trenches and small octaves (the smooth surface the water table is measured from). */
export const groundSmooth = (x, z) => ground0(x, z, false, true);

// ---------------------------------------------------------------- the devastated zone
const zoneMask = (x) => smooth(ZONE.from, ZONE.full, x) * (1 - smooth(ZONE.to, ZONE.fade, x));
/** Shell-hole density 0..1 at a point: the zone, densest across no man's land and the front systems. */
export function craterDensity(x, z) {
  const zm = zoneMask(x);
  if (zm <= 0) return 0;
  const zc = Math.min(1, (z / 7000) * (z / 7000));
  const xc = 4300 - 1000 * zc + 300;
  const b = (x - xc) / 1300;
  return zm * (0.4 + 0.6 * Math.exp(-b * b));
}

// Cellular crater layers (big to small). A cell holds at most one crater, jittered inside it; with
// radius <= half a cell only the 2x2 nearest cells can reach a point. `rm` is the mean radius, used
// to hand the layer from geometry (fine mesh levels) to the shader (everything coarser).
export const CRATER_LAYERS = [
  { cell: 44, r0: 5.0, r1: 8.0, p: 0.8, s: 301 },
  { cell: 26, r0: 3.4, r1: 6.4, p: 0.95, s: 311 },
  { cell: 15, r0: 2.0, r1: 3.6, p: 1.0, s: 321 },
  { cell: 8.5, r0: 1.2, r1: 2.4, p: 1.0, s: 331 },
  { cell: 4.6, r0: 0.8, r1: 1.5, p: 1.0, s: 341 },
];
for (const L of CRATER_LAYERS) L.rm = (L.r0 + L.r1) / 2;
export const CRATER = { lip: 0.15, lipAt: 1.15, lipW: 0.3, kd0: 0.3, kd1: 0.12, ecc: 0.42 };

/** How much of a layer a mesh with this cell size carries as geometry (the shader adds the rest). */
export const layerWeight = (L, cell) => (cell <= 0 ? 1 : Math.min(1, Math.max(0, (L.rm / cell - 0.5) / 0.7)));

// the profile of one crater at normalised radius u: a bowl and a raised lip (metres per unit depth)
export function craterProfile(u) {
  let h = 0;
  if (u < 1) { const t = 1 - u * u; h = -t * t; }
  if (u < 1.8) { const q = (u - CRATER.lipAt) / CRATER.lipW; h += CRATER.lip * Math.exp(-q * q) * (1 - smooth(1.4, 1.8, u)); }
  return h;
}

function layerDelta(L, x, z, w) {
  const cx = x / L.cell, cz = z / L.cell;
  const ix = Math.floor(cx), iz = Math.floor(cz);
  const i0 = cx - ix < 0.5 ? ix - 1 : ix, j0 = cz - iz < 0.5 ? iz - 1 : iz;
  let sum = 0;
  for (let j = j0; j <= j0 + 1; j++) {
    for (let i = i0; i <= i0 + 1; i++) {
      const px = (i + ihash(i, j, L.s)) * L.cell, pz = (j + ihash(i, j, L.s + 1)) * L.cell;
      if (ihash(i, j, L.s + 2) >= craterDensity(px, pz) * L.p) continue;
      const R = L.r0 + (L.r1 - L.r0) * ihash(i, j, L.s + 3);
      const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
      if (d2 > R * R * 3.6) continue;
      const e1 = (ihash(i, j, L.s + 4) - 0.5) * CRATER.ecc, e2 = (ihash(i, j, L.s + 5) - 0.5) * CRATER.ecc;
      const iv = d2 > 1e-6 ? 1 / d2 : 0;
      const u = (Math.sqrt(d2) / R) * (1 + e1 * (dx * dx - dz * dz) * iv + e2 * 2 * dx * dz * iv);
      sum += R * (CRATER.kd0 + CRATER.kd1 * ihash(i, j, L.s + 6)) * craterProfile(u) * w;
    }
  }
  return sum;
}

/** The old shell holes' height change at a point (negative in the bowls, positive on the lips). cell 0: all layers. */
export function oldCraters(x, z, cell = 0) {
  if (x < 2300 || x > 10700) return 0;
  let s = 0;
  for (const L of CRATER_LAYERS) {
    const w = layerWeight(L, cell);
    if (w > 0) s += layerDelta(L, x, z, w);
  }
  return s < -3 ? -3 + (s + 3) * 0.5 : s;
}

// ---------------------------------------------------------------- water
/** 0..1 how sodden the ground is: the zone in autumn rain, and the stream floodplains. */
export function wetAt(x, z) {
  const sd = streamSample(x, z).d;
  return Math.max(0.2 + 0.8 * zoneMask(x), 1 - smooth(8, 110, sd));
}
/**
 * Standing-water level: a smooth surface a little below the undisturbed ground, wavering across
 * the field so neighbouring shell holes differ (some brim-full, some dry). Craters and the stream
 * channel whose floor is below it hold water. Sodden ground sits near the surface, dry ground far below.
 */
export function waterTable(x, z) {
  const wet = wetAt(x, z);
  return natural(x, z, false) - 0.5 - (1 - wet) * (1 - wet) * 2.2 + 0.4 * (vn(x / 75, z / 75, 17) - 0.5) + 0.2 * (vn(x / 19, z / 19, 18) - 0.5);
}

// ---------------------------------------------------------------- pads
let PADS = null;
function pads() {
  if (PADS) return PADS;
  PADS = flatPads().map((p) => ({
    x: p.x, z: p.z, rx: p.rx, rz: p.rz, c: Math.cos(p.heading), s: Math.sin(p.heading), blend: p.blend,
    reach: Math.hypot(p.rx, p.rz) + p.blend, h: 0, small: p.rx <= 22,
  }));
  for (const p of PADS) p.h = ground0(p.x, p.z, true);
  return PADS;
}

function padWeight(p, x, z, rx = p.rx, rz = p.rz, blend = p.blend) {
  const dx = x - p.x, dz = z - p.z;
  if (dx > p.reach || dx < -p.reach || dz > p.reach || dz < -p.reach) return 0;
  const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
  const qx = Math.max(Math.abs(lx) - rx, 0), qz = Math.max(Math.abs(lz) - rz, 0);
  const d = Math.sqrt(qx * qx + qz * qz);
  return 1 - smooth(0, blend, d);
}

/** 0..1: how much of a point is on a levelled pad (the renderer turns it to dirt and gravel). */
export function padMask(x, z) {
  let m = 0;
  for (const p of pads()) {
    // a vehicle's levelled square is mostly invisible: only the middle of it is worn to bare earth
    const w = p.small ? padWeight(p, x, z, 7, 9, 10) : padWeight(p, x, z);
    if (w > m) m = w;
  }
  return m;
}

// ---------------------------------------------------------------- trenches and roads
const _ts = { d: 0, kind: 0, side: 1, lat: 0 };
const _tk = { d: 0, kind: 0 };
// `cell` > 0 is a mesh sampling: the profile widens so a 2.5 m grid still resolves the trench
function trenchRoads(x, z, h0, h, cell) {
  if (x > 1200 && x < 8200 && (cell <= 0 || cell <= 3)) {
    trenchSample(x, z, _ts);
    const d = _ts.d;
    if (d < 5.5) {
      const P = TRENCH[TRENCH_KINDS[_ts.kind]];
      const a = cell > 0 ? Math.max(P.a, cell * 0.55) : P.a, b = a + (cell > 0 ? Math.max(P.b - P.a, cell * 0.4) : P.b - P.a);
      const w = 1 - smooth(a, b, d);
      const erode = 1; // full depth below the local smoothed ground, whatever the craters did
      h += (h0 - P.depth * erode - h) * w;
      const front = _ts.lat * _ts.side > 0;
      const q = (d - (b + 0.9)) / 0.95;
      h += (front ? P.front : P.rear) * erode * Math.exp(-q * q) * (1 - w);
    }
  }
  if (x > -3500 && x < 12500) {
    trackSample(x, z, _tk);
    if (_tk.kind > 0 && _tk.kind < 3) {
      const hw = TRACK_WIDTH[_tk.kind === 1 ? 'road' : 'plank'] * 0.5;
      const w = (1 - smooth(hw, hw + 2.4, _tk.d)) * (_tk.kind === 1 ? 0.8 : 0.55);
      h += (h0 + 0.14 - h) * w;
    }
  }
  return h;
}

// ---------------------------------------------------------------- the surface
function surface(x, z, fine, cell) {
  const h0 = ground0(x, z, fine);
  let h = h0;
  if (fine) {
    h += oldCraters(x, z, cell);
    // the ground between the holes is churned too: heaps and ruts a few metres across
    if (x > 2300 && x < 10700) {
      const dn = craterDensity(x, z);
      if (dn > 0.02) h += dn * (0.5 * (vn(x / 11, z / 11, 12) - 0.5) + 0.25 * (vn(x / 5.3 + 4, z / 5.3, 13) - 0.5));
    }
    h = trenchRoads(x, z, h0, h, cell);
  }
  for (const p of pads()) {
    const w = padWeight(p, x, z);
    if (w > 0) h += (p.h - h) * w;
  }
  return h;
}

/** Ground height at any point; pure and cheap enough for per-tick terrain following. */
export function heightAt(x, z) {
  return surface(x, z, true, 0);
}

/** Same surface sampled for a mesh with this grid spacing: small octaves, craters and trenches the grid can resolve. */
export function heightLod(x, z, cell) {
  if (cell < 60) return surface(x, z, true, cell);
  let h = ground0(x, z, false, false);
  if (cell < 700) for (const p of pads()) {
    const w = padWeight(p, x, z);
    if (w > 0) h += (p.h - h) * w;
  }
  return h;
}

/** Surface normal by central differences (writes into out, returns it). */
export function normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
  const e = 1.5;
  const dx = heightAt(x - e, z) - heightAt(x + e, z);
  const dz = heightAt(x, z - e) - heightAt(x, z + e);
  const inv = 1 / Math.sqrt(dx * dx + 4 * e * e + dz * dz);
  out.x = dx * inv;
  out.y = 2 * e * inv;
  out.z = dz * inv;
  return out;
}

/** True when the straight segment A to B clears the ground (sampled march, coarse over long ranges). */
export function los(ax, ay, az, bx, by, bz, clearance = 0.5) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1) return true;
  const step = Math.min(120, Math.max(12, len / 260));
  const n = Math.ceil(len / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = ax + dx * t, z = az + dz * t;
    if (ay + dy * t < heightAt(x, z) + clearance) return false;
  }
  return true;
}

/**
 * What the ground is made of at a point: 'mud' | 'water' | 'grass' | 'road' | 'concrete' | 'rubble'
 * (burst fx and sound). `h` may be passed when the caller already has the surface height (the
 * Terrain adds its runtime craters).
 */
export function groundKindAt(x, z, h = heightAt(x, z)) {
  for (const s of SITES) if (s.kind === 'mebu' && Math.abs(x - s.pos.x) < 9 && Math.abs(z - s.pos.z) < 9) return 'concrete';
  for (const p of PLACES) {
    if ((p.kind === 'village' || p.kind === 'town') && Math.hypot(x - p.pos.x, z - p.pos.z) < p.r * 0.75) return 'rubble';
  }
  if (trackSample(x, z, _tk).d < (TRACK_WIDTH[_tk.kind === 1 ? 'road' : _tk.kind === 2 ? 'plank' : 'duckboard'] || 0) * 0.5 + 0.3) return 'road';
  const wet = wetAt(x, z);
  if (wet > 0.25 && h < waterTable(x, z) - 0.03) return 'water';
  if (craterDensity(x, z) < 0.12 && wet < 0.6) return 'grass';
  return 'mud';
}


import * as THREE from 'three';
import { PLACES, UNITS, piecePlacements, polylineDistance, SITES } from '../sector.js';
import { mulberry32 } from '../noise.js';
import { ROADS, farms } from './data.js';
import { Mesher, h2, grey, rgbk } from './mesher.js';
import { worldMats } from './mats.js';
import { rot, crate, sandWall, stump, hessianScreen } from './props.js';

// Ruins: Ypres as a field of broken brick walls and rubble heaps around the gaunt Cloth Hall and cathedral, the
// villages as brick heaps with wall stubs and the stump of a church, Hellfire Corner, farms behind the lines (some
// whole under Flemish pantiles, some shelled). Two representations of the same layout: a coarse persistent one
// (boxes and mounds, visible at any distance, per 256 m tile) and a detailed one built near the camera (windows,
// rafters, loose bricks) that hides the coarse tile while it stands. The great landmarks are always built whole.

const TILE = 256;
const key = (i, j) => i + ',' + j;

export const YPRES = PLACES.find((p) => p.name === 'Ypres');
const CLOTH = { x: YPRES.pos.x + 20, z: YPRES.pos.z - 60, yaw: 0 }; // facade runs east-west
const CATH = { x: YPRES.pos.x - 70, z: YPRES.pos.z + 110, yaw: 0 };

let LOTS = [], INDEX = null, COARSE = null;
const coarseMeshes = new Map();

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// lots of a town or village: blocks on a rotated street grid, building footprints around each block
function layTown(pl, ctx) {
  const rnd = mulberry32(pl.name.length * 977 + (pl.pos.x | 0));
  const ang = 0.2 + rnd() * 0.3, c = Math.cos(ang), s = Math.sin(ang);
  const town = pl.kind === 'town';
  const cw = town ? 68 : 46, cd = town ? 54 : 40;
  const out = [];
  const R = pl.r;
  for (let gx = -R; gx <= R; gx += cw) for (let gz = -R; gz <= R; gz += cd) {
    const rr = Math.hypot(gx, gz) / R;
    if (rr > 1) continue;
    const dens = 1 - smoothstep(town ? 0.55 : 0.4, 1, rr) * 0.75;
    for (let q = 0; q < 4; q++) {
      if (rnd() > dens * (town ? 0.85 : 0.5)) continue;
      const lx = gx + (q % 2 ? 1 : -1) * (cw * 0.22 + rnd() * 6) + (rnd() - 0.5) * 6, lz = gz + (q < 2 ? -1 : 1) * (cd * 0.22 + rnd() * 5) + (rnd() - 0.5) * 6;
      const x = pl.pos.x + lx * c - lz * s, z = pl.pos.z + lx * s + lz * c;
      const w = 8 + rnd() * 6, d = 9 + rnd() * 6;
      if (ROADS.some((rd) => polylineDistance(rd.pts, x, z) < 11 + w * 0.5)) continue;
      if (pl.kind === 'town' && (Math.hypot(x - CLOTH.x, (z - CLOTH.z) * 0.8) < 85 || Math.hypot(x - CATH.x, z - CATH.z) < 70)) continue;
      const st = rnd();
      out.push({ x, z, yaw: ang + (rnd() < 0.5 ? 0 : Math.PI / 2) * 0, w, d, floors: 2 + (rnd() < 0.4 ? 1 : 0), seed: (rnd() * 1e6) | 0, state: st < 0.5 ? 'heap' : st < 0.92 ? 'stump' : 'shell', kind: 'lot' });
    }
  }
  if (pl.kind === 'village') out.push({ x: pl.pos.x, z: pl.pos.z, yaw: 0.1, kind: 'church', seed: pl.name.length * 31, w: 7, d: 16, floors: 3, state: 'stump' });
  return out;
}

function layAll(ctx) {
  const lots = [];
  for (const pl of PLACES) if (pl.kind === 'town' || pl.kind === 'village') lots.push(...layTown(pl, ctx));
  for (const f of farms()) lots.push({ x: f.x, z: f.z, yaw: f.yaw, kind: 'farm', state: f.state, seed: f.seed });
  // Hellfire Corner: a ruined estaminet, hessian screens and a sandbag post at the crossroads
  const hc = PLACES.find((p) => p.name === 'Hellfire Corner');
  lots.push({ x: hc.pos.x + 22, z: hc.pos.z - 24, yaw: 0.3, kind: 'lot', w: 9, d: 11, floors: 2, seed: 7, state: 'shell' });
  lots.push({ x: hc.pos.x - 24, z: hc.pos.z + 22, yaw: -0.2, kind: 'lot', w: 8, d: 10, floors: 2, seed: 8, state: 'stump' });
  lots.push({ x: hc.pos.x, z: hc.pos.z, kind: 'corner', seed: 3 });
  return lots;
}

// ---------------------------------------------------------------- building blocks

// a dark lancet or rectangular opening on the face at (x, y, z) looking along the outward normal (nx, nz)
function opening(m, x, y, z, nx, nz, w, hh, pointed) {
  const t = [nz, 0, -nx], o = 0.02;
  const P = (s, yy) => [x + t[0] * s + nx * o, y + yy, z + t[2] * s + nz * o];
  m.quad('dark', P(-w / 2, 0), P(w / 2, 0), P(w / 2, hh), P(-w / 2, hh), 0xffffff);
  if (pointed) m.tri('dark', P(-w / 2, hh), P(w / 2, hh), P(0, hh + w * 0.85), 0xffffff);
}

// one wall run from (x0, z0) to (x1, z1) in columns of ~1.5 m, heights from `ht(k, n)`; windows on the storeys that stand
function wallRun(m, h, x0, z0, x1, z1, ht, { th = 0.45, floors = 2, detail = false, tone = 1, windows = true, pointed = false, ww = 1.0, wh = 1.5, storey = 3.2, seed = 0, face = 'brick' } = {}) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / 1.5));
  const yaw = Math.atan2(-dx, -dz), nx = dz / L, nz = -dx / L; // right-hand normal
  const cols = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, x = x0 + dx * t, z = z0 + dz * t, g = h(x, z), H = ht(k, n);
    cols.push({ x, z, g, H });
    if (H < 0.2) continue;
    const j = h2(x, z, seed + 1), c = grey(tone * (0.7 + j * 0.3));
    m.box(face, x, g + H / 2 - 0.2, z, th, H + 0.4, L / n + 0.03, yaw, c, { u0: k * 1.5, v0: g });
  }
  if (!windows || !detail) return cols;
  // windows at each storey on every second column pair, only where the wall stands that high
  const per = Math.max(2, Math.round(2.8 / (L / n)));
  for (let k = per >> 1; k < n; k += per) {
    const c = cols[k];
    for (let f = 0; f < floors; f++) {
      const y = c.g + 0.9 + f * storey + (face === 'brick' ? 0 : 0);
      if (c.H < y - c.g + wh + 0.2) continue;
      for (const s of [1, -1]) opening(m, c.x + nx * s * th / 2, y, c.z + nz * s * th / 2, nx * s, nz * s, ww, wh, pointed);
    }
  }
  return cols;
}

// a ruined town building: ragged brick walls around a heap of rubble
function ruinLot(m, h, L, detail) {
  const { x, z, yaw, w, d, floors, seed, state } = L;
  const R = rot(yaw), g0 = h(x, z), W = floors * 3.2 + 1.2;
  const P = (lx, lz) => { const q = R(lx, lz); return [x + q[0], z + q[1]]; };
  const sides = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]];
  sides.forEach((sd, si) => {
    const a = P(sd[0], sd[1]), b = P(sd[2], sd[3]);
    const ph = h2(seed, si, 5) * 6.28;
    const keep = state === 'heap' ? 0.18 : state === 'stump' ? 0.5 : 0.95;
    wallRun(m, h, a[0], a[1], b[0], b[1], (k, n) => {
      const jag = 0.5 + 0.5 * Math.sin(ph + k * 1.7) * Math.sin(ph * 1.3 + k * 0.6);
      const gone = h2(seed + k, si, 9) < (state === 'shell' ? 0.12 : 0.45);
      return Math.max(0, W * keep * (0.25 + 0.75 * jag) * (gone ? 0.25 : 1));
    }, { floors, detail, seed: seed + si, windows: state !== 'heap' });
  });
  // the rubble inside and spilling out
  const hh = state === 'heap' ? 1.5 + h2(seed, 1, 3) * 1.4 : 0.8 + h2(seed, 1, 3) * 1.1;
  m.ell('rubble', x, g0 + hh * 0.15, z, w * 0.46, hh, d * 0.46, yaw, grey(0.85), detail ? 10 : 7, 0.5);
  if (state === 'heap') m.ell('rubble', P(w * 0.3, d * 0.2)[0], g0 + 0.1, P(w * 0.3, d * 0.2)[1], w * 0.3, hh * 0.5, d * 0.25, yaw + 0.6, grey(0.8), 7, 0.5);
  if (!detail) return;
  // floor joists and rafters poking out, loose bricks and a chimney stack
  for (let k = 0; k < 5; k++) {
    const q = P((h2(seed, k, 11) - 0.5) * w, (h2(seed, k, 12) - 0.5) * d), y = g0 + hh * 0.5 + h2(seed, k, 13) * 1.5;
    const a = h2(seed, k, 14) * 6.28, l = 1.5 + h2(seed, k, 15) * 3;
    m.beam('timber', [q[0], y, q[1]], [q[0] + Math.cos(a) * l, y + 0.8 + h2(seed, k, 16) * 1.6, q[1] + Math.sin(a) * l], 0.1, 0.18, grey(0.5));
  }
  for (let k = 0; k < 14; k++) {
    const q = P((h2(seed, k, 21) - 0.5) * (w + 4), (h2(seed, k, 22) - 0.5) * (d + 4));
    m.box('brick', q[0], h(q[0], q[1]) + 0.07, q[1], 0.22, 0.13, 0.11, h2(seed, k, 23) * 6, grey(0.7), { rz: (h2(seed, k, 24) - 0.5) * 0.4 });
  }
  if (state !== 'heap') {
    const q = P(w * 0.25, -d * 0.45), H = W * (0.6 + h2(seed, 2, 3) * 0.4);
    m.box('brick', q[0], g0 + H / 2, q[1], 0.9, H, 0.7, yaw, grey(0.75));
  }
}

// farm: whole (pantiled) or shelled; house, barn, yard wall, pond
function farm(m, h, L, detail) {
  const { x, z, yaw, state, seed } = L;
  const R = rot(yaw);
  const P = (lx, lz) => { const q = R(lx, lz); return [x + q[0], z + q[1]]; };
  const g = h(x, z), whole = state === 'intact', dmg = state === 'ruin' ? 1 : state === 'shelled' ? 0.5 : 0;
  const building = (cx, cz, w, d, wallH, roofH, mat, kind, byaw) => {
    const q = P(cx, cz), Rb = rot(yaw + byaw);
    const Pb = (lx, lz) => { const p = Rb(lx, lz); return [q[0] + p[0], q[1] + p[1]]; };
    const sides = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]];
    sides.forEach((sd, si) => {
      const a = Pb(sd[0], sd[1]), b = Pb(sd[2], sd[3]);
      wallRun(m, h, a[0], a[1], b[0], b[1], (k, n) => {
        const gable = si % 2 === 1 ? roofH * 0.9 * (1 - Math.abs((k + 0.5) / n - 0.5) * 2) : 0;
        const broke = dmg > 0 && h2(seed + si, k, 3) < dmg * 0.55 ? 0.35 : 1;
        return (wallH + gable) * broke;
      }, { floors: 1, detail, seed: seed + si, storey: 2.8, tone: kind === 'barn' ? 0.8 : 1 });
    });
    // roof: two pitched sheets and ridge, absent in part when shelled
    const yb = h(q[0], q[1]) + wallH;
    const over = 0.5;
    const roof = (s) => {
      const hide = dmg > 0.9 || (dmg > 0 && h2(seed, s, 31) < dmg * 0.7);
      if (hide) {
        // bare rafters
        for (let k = 0; k < 6; k++) { const t = -d / 2 + (k + 0.5) * d / 6; const a = Pb(s * w / 2, t), b = Pb(0, t); m.beam('timber', [a[0], yb - 0.1, a[1]], [b[0], yb + roofH, b[1]], 0.1, 0.18, grey(0.5)); }
        return;
      }
      const a0 = Pb(s * (w / 2 + over), -d / 2 - over), a1 = Pb(s * (w / 2 + over), d / 2 + over), r0 = Pb(0, -d / 2 - over), r1 = Pb(0, d / 2 + over);
      const sl = Math.hypot(w / 2 + over, roofH);
      const quad = s > 0 ? [[a1[0], yb - 0.2, a1[1]], [a0[0], yb - 0.2, a0[1]], [r0[0], yb + roofH, r0[1]], [r1[0], yb + roofH, r1[1]]] : [[a0[0], yb - 0.2, a0[1]], [a1[0], yb - 0.2, a1[1]], [r1[0], yb + roofH, r1[1]], [r0[0], yb + roofH, r0[1]]];
      const tone = grey(0.85 + h2(seed, s, 32) * 0.2);
      m.quad(mat, quad[0], quad[1], quad[2], quad[3], tone, [[0, 0], [d + over * 2, 0], [d + over * 2, sl], [0, sl]]);
      // the underside so the roof does not vanish from inside
      m.quad(mat, quad[1], quad[0], quad[3], quad[2], grey(0.5), [[0, 0], [d + over * 2, 0], [d + over * 2, sl], [0, sl]]);
    };
    roof(1); roof(-1);
    if (detail && whole) { // door and chimney
      const dq = Pb(0, d / 2 + 0.25);
      m.box('dark', dq[0], g + 1.0, dq[1], 1.1, 2.0, 0.1, yaw + byaw, 0xffffff);
    }
    const ch = Pb(w * 0.18, d * 0.1);
    m.box('brick', ch[0], yb + roofH * 0.8, ch[1], 0.7, roofH * 1.2 + 0.8, 0.7, yaw + byaw, grey(0.8));
  };
  building(0, 0, 7.2, 14, 3.4, 2.6, 'pantile', 'house', 0);
  building(16, 4, 9.5, 17, 4.4, 3.8, h2(seed, 1, 1) < 0.5 ? 'pantile' : 'slate', 'barn', 0);
  // yard wall and a pond
  const w0 = P(-10, -12), w1 = P(-10, 14), w2 = P(24, 14), w3 = P(24, -12);
  for (const [a, b] of [[w0, w1], [w1, w2], [w2, w3]]) {
    wallRun(m, h, a[0], a[1], b[0], b[1], (k) => (h2(seed, k, 41) < 0.2 + dmg * 0.3 ? 0.4 : 1.4), { th: 0.4, windows: false, seed, detail });
  }
  if (detail) for (let k = 0; k < 5; k++) { const q = P(-6 + k * 4, 8); crate(m, h, q[0], q[1], k, 0.8, 0.5, 0.5); }
  void hessianScreen; void sandWall; void stump; void rgbk;
}

// gothic openings: tall lancets on the four faces of a tower or on a long wall
function lancets(m, x, y0, z, nx, nz, count, spacing, w, hh, ht) {
  const tx = nz, tz = -nx;
  for (let k = 0; k < count; k++) {
    const s = (k - (count - 1) / 2) * spacing;
    opening(m, x + tx * s, y0, z + tz * s, nx, nz, w, hh, true);
    void ht;
  }
}

// ragged-top square tower: walls 1.6 m thick, buttresses, lancets, a collapsed corner or two
function tower(m, h, x, z, yaw, w, H, seed, { detail = true } = {}) {
  const R = rot(yaw), P = (lx, lz) => { const q = R(lx, lz); return [x + q[0], z + q[1]]; };
  const sides = [[-w / 2, -w / 2, w / 2, -w / 2], [w / 2, -w / 2, w / 2, w / 2], [w / 2, w / 2, -w / 2, w / 2], [-w / 2, w / 2, -w / 2, -w / 2]];
  sides.forEach((sd, si) => {
    const a = P(sd[0], sd[1]), b = P(sd[2], sd[3]);
    const ph = h2(seed, si, 5) * 6.28;
    const cols = wallRun(m, h, a[0], a[1], b[0], b[1], (k, n) => {
      const edge = Math.min(k, n - 1 - k) / (n * 0.5); // corners stand higher
      const jag = 0.55 + 0.45 * Math.sin(ph + k * 1.1) * Math.sin(ph * 1.7 + k * 0.5);
      return H * (0.55 + 0.45 * jag) * (0.8 + 0.2 * Math.min(1, edge * 1.4)) * (h2(seed + si, k, 7) < 0.1 ? 0.7 : 1);
    }, { th: 1.6, windows: false, seed: seed + si, floors: 3 });
    const nx = (b[1] - a[1]) / w, nz = -(b[0] - a[0]) / w, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, g = h(mx, mz);
    // two tiers of tall lancets on each face, only where the wall is still there
    if (detail) for (const [f, hh, wd] of [[0.28, 5.5, 1.8], [0.62, 6, 2.0]]) {
      if (cols[Math.floor(cols.length / 2)].H < H * f + hh) continue;
      for (const s of [1, -1]) lancets(m, mx + nx * s * 0.82, g + H * f, mz + nz * s * 0.82, nx * s, nz * s, 2, w * 0.28, wd, hh - 1.5);
    }
  });
  // corner buttresses
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const q = P(sx * (w / 2 + 0.4), sz * (w / 2 + 0.4)), Hb = H * (0.45 + h2(seed, sx + sz * 3, 8) * 0.4), g = h(q[0], q[1]);
    m.box('brick', q[0], g + Hb / 2, q[1], 1.6, Hb, 1.6, yaw, grey(0.85));
    m.box('brick', q[0], g + Hb * 0.8 / 2, q[1], 2.2, Hb * 0.8, 2.2, yaw, grey(0.85));
  }
}

// the Cloth Hall: a long, ragged arcaded facade with corner pavilions and the belfry in the middle
function clothHall(m, h) {
  const { x, z } = CLOTH, len = 120;
  const seed = 11;
  const cols = wallRun(m, h, x - len / 2, z, x + len / 2, z, (k, n) => {
    const t = k / n, ph = Math.sin(t * 37) * Math.sin(t * 11 + 1);
    const base = 16 + 6 * Math.sin(t * Math.PI * 2 * 3.1);
    const gone = h2(seed, k, 3) < 0.18;
    return Math.max(2, (base + ph * 4) * (gone ? 0.35 : 1));
  }, { th: 1.8, windows: false, seed, floors: 2 });
  // arcades along the ground floor and tall lancet windows above where the wall stands
  for (let k = 3; k < cols.length - 3; k += 3) {
    const c = cols[k];
    for (const s of [1, -1]) {
      opening(m, c.x, c.g, c.z + s * 0.93, 0, s, 3.2, 5.2, true);
      if (c.H > 14) opening(m, c.x, c.g + 8.2, c.z + s * 0.93, 0, s, 2.0, 4.8, true);
    }
  }
  tower(m, h, x, z, 0, 15, 40, 13);
  tower(m, h, x - len / 2 + 5, z, 0, 9, 24, 14);
  tower(m, h, x + len / 2 - 5, z, 0, 9, 22, 15);
  // the great rubble of the roof and halls behind the facade
  for (let k = 0; k < 14; k++) m.ell('rubble', x - 55 + k * 8.5, h(x, z + 9) + 0.6, z + 6 + h2(k, 1, 5) * 10, 7, 1.8 + h2(k, 2, 5) * 1.6, 6 + h2(k, 3, 5) * 5, 0, grey(0.85), 9, 0.5);
}

// St Martin's: a ragged nave with buttresses, the west tower, the broken east end
function cathedral(m, h) {
  const { x, z } = CATH, nave = 86, wd = 22, seed = 21;
  for (const s of [-1, 1]) {
    const cols = wallRun(m, h, x - nave / 2, z + s * wd / 2, x + nave / 2, z + s * wd / 2, (k, n) => {
      const t = k / n, ph = Math.sin(t * 29 + s) * Math.sin(t * 9 + 2 * s);
      const base = 17 + 4 * Math.sin(t * 17 + s);
      return Math.max(1.5, (base + ph * 5) * (h2(seed + s, k, 3) < 0.2 ? 0.3 : 1) * (t > 0.7 ? 0.5 + 0.5 * (1 - t) / 0.3 : 1));
    }, { th: 1.3, windows: false, seed, floors: 2 });
    for (let k = 2; k < cols.length - 2; k += 4) {
      const c = cols[k];
      if (c.H > 12) opening(m, c.x, c.g + 5.5, c.z - s * 0.68, 0, -s, 2.4, 8, true);
      if (c.H > 12) opening(m, c.x, c.g + 5.5, c.z + s * 0.68, 0, s, 2.4, 8, true);
      const hb = Math.min(c.H * 0.85, 13);
      m.box('brick', c.x, c.g + hb / 2, c.z + s * 1.6, 1.4, hb, 2.2, 0, grey(0.8));
      m.box('brick', c.x, c.g + hb * 0.6, c.z + s * 3.5, 1.0, hb * 0.5, 2.2, 0, grey(0.8), { rx: s * 0.4 });
    }
  }
  // east end: a broken apse and the west tower at the other
  wallRun(m, h, x + nave / 2, z - wd / 2, x + nave / 2, z + wd / 2, (k, n) => (7 + 9 * Math.abs(Math.sin(k * 0.8 + 2))) * (k % 3 === 0 ? 0.4 : 1), { th: 1.3, windows: false, seed, floors: 2 });
  tower(m, h, x - nave / 2 - 6, z, 0, 19, 36, 22);
  for (let k = 0; k < 8; k++) m.ell('rubble', x - 38 + k * 10, h(x, z) + 0.7, z + (h2(k, 4, 5) - 0.5) * 12, 7, 1.8 + h2(k, 5, 5) * 1.8, 5 + h2(k, 6, 5) * 4, 0, grey(0.85), 9, 0.5);
}

// the stump of a village church: a short ragged tower and broken nave walls
function church(m, h, L) {
  const R = rot(L.yaw), P = (lx, lz) => { const q = R(lx, lz); return [L.x + q[0], L.z + q[1]]; };
  const t = P(0, 9);
  tower(m, h, t[0], t[1], L.yaw, 6.5, 13, L.seed, { detail: false });
  for (const s of [-1, 1]) {
    const a = P(s * 5, 6), b = P(s * 5, -12);
    wallRun(m, h, a[0], a[1], b[0], b[1], (k, n) => Math.max(0.5, (6 - k * 0.5) * (h2(L.seed + s, k, 3) < 0.3 ? 0.3 : 1)), { th: 0.8, windows: false, seed: L.seed, floors: 1 });
  }
  m.ell('rubble', L.x, h(L.x, L.z) + 0.4, L.z - 2, 4.5, 1.4, 8, L.yaw, grey(0.85), 7);
}

// Hellfire Corner: hessian screens each way, a sandbag post and a signboard at the junction
function corner(m, h, L, detail) {
  const x = L.x, z = L.z;
  for (const [a, b] of [[[x - 40, z - 6], [x - 8, z - 6]], [[x + 8, z + 6], [x + 40, z + 6]], [[x - 6, z + 8], [x - 6, z + 40]], [[x + 6, z - 8], [x + 6, z - 40]]]) hessianScreen(m, h, a, b, 3);
  if (!detail) return;
  sandWall(m, h, [x + 10, z - 10], [x + 16, z - 10], { hh: 1.3, th: 0.9, seed: 1 });
  sandWall(m, h, [x + 16, z - 10], [x + 16, z - 4], { hh: 1.3, th: 0.9, seed: 2 });
  const y = h(x + 9, z + 9);
  m.box('timber', x + 9, y + 1.4, z + 9, 0.14, 2.8, 0.14, 0, grey(0.6));
  m.box('paint', x + 9, y + 2.5, z + 9.1, 1.6, 0.4, 0.04, 0, rgbk(0.8, 0.78, 0.7));
  for (let k = 0; k < 4; k++) stump(m, h, x + (h2(k, 1, 6) - 0.5) * 50, z + (h2(k, 2, 6) - 0.5) * 50, 2 + h2(k, 3, 6) * 2.5, 0.28, k);
}

// ---------------------------------------------------------------- module

function draw(m, h, L, detail) {
  if (L.kind === 'lot') ruinLot(m, h, L, detail);
  else if (L.kind === 'farm') farm(m, h, L, detail);
  else if (L.kind === 'church') church(m, h, L);
  else if (L.kind === 'corner') corner(m, h, L, detail);
}

export default {
  name: 'ruins',
  range: [520, 520],
  init(ctx) {
    LOTS = layAll(ctx);
    INDEX = new Map();
    for (const L of LOTS) {
      const k = key(Math.floor(L.x / TILE), Math.floor(L.z / TILE));
      if (!INDEX.has(k)) INDEX.set(k, []);
      INDEX.get(k).push(L);
    }
    // the coarse set: every tile's lots as boxes and mounds, plus the great landmarks whole
    COARSE = new THREE.Group();
    COARSE.name = 'ruins-far';
    const mats = worldMats();
    for (const [k, list] of INDEX) {
      const m = new Mesher();
      for (const L of list) draw(m, ctx.h, L, false);
      const g = new THREE.Group();
      m.build(g, mats, { receive: true });
      coarseMeshes.set(k, g);
      COARSE.add(g);
    }
    const lm = new Mesher();
    clothHall(lm, ctx.h);
    cathedral(lm, ctx.h);
    const g = new THREE.Group();
    g.name = 'landmarks';
    lm.build(g, mats);
    COARSE.add(g);
  },
  items(i, j) { return INDEX.get(key(i, j)) || null; },
  far: () => COARSE,
  onTile(i, j, lod) {
    const g = coarseMeshes.get(key(i, j));
    if (g) g.visible = lod < 0;
  },
  build(m, items, i, j, lod, ctx) { for (const L of items) draw(m, ctx.h, L, true); },
};

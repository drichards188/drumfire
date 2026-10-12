import { LINES, UNITS, PLACES, RAIL_SPUR, RAIL_MAIN, SITES, piecePlacements, polylineDistance } from '../sector.js';
import { mulberry32 } from '../noise.js';

// Layout data of the world dressing: where the trenches, wire, roads, light railways and farms run.
// The trench lines and wire belts come from the terrain agent's src/trenchlines.js when it exists (so the
// walls sit in the cut the terrain makes); otherwise they are derived here from sector.js LINES.

const mods = import.meta.glob('../trenchlines.js', { eager: true });
const TL = Object.values(mods)[0] || null;

// the cross-section the walls are built to (the terrain's cut should match: see DESIGN.md)
export const TRENCH = { half: 0.95, depth: 1.95 };

const norm = (v) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };

// Catmull-Rom through control points, sampled about every `step` metres
export function smooth(pts, step = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

// walk a smooth polyline and return { x, z, dx, dz, s } at every `step` metres
export function resample(pts, step) {
  const out = [];
  let carry = 0, s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 1e-6) continue;
    const dx = (b.x - a.x) / l, dz = (b.z - a.z) / l;
    for (let d = carry; d < l; d += step) { out.push({ x: a.x + dx * d, z: a.z + dz * d, dx, dz, s: s + d }); carry = d + step - l; }
    s += l;
  }
  return out;
}

// zig-zag a centre line into fire bays and traverses: bays of ~7 m offset alternately left and right, joined by short steps
function zigzag(pts, { bay = 7, off = 1.7, step = 1.2 } = {}) {
  const line = resample(smooth(pts, 10), 1);
  const out = [];
  let k = 0;
  for (let s = 0; s < line.length - 1; s += bay + step) {
    const a = line[s], b = line[Math.min(line.length - 1, s + bay)];
    const o = k % 2 ? off : -off;
    const nx = -a.dz, nz = a.dx;
    out.push({ x: a.x + nx * o, z: a.z + nz * o }, { x: b.x + nx * o, z: b.z + nz * o });
    k++;
  }
  return out;
}

const mk = (side, kind, pts, extra) => ({ side, kind, pts, ...extra });

let TRENCHES = null;
export function trenches() {
  if (TRENCHES) return TRENCHES;
  const fromTL = TL?.trenchPolylines?.();
  if (fromTL && fromTL.length) {
    TRENCHES = fromTL.map((t) => ({ ...t, pts: t.pts.map((p) => ({ x: p.x, z: p.z })) }));
    return TRENCHES;
  }
  const rnd = mulberry32(5);
  const L = LINES, out = [];
  out.push(mk('british', 'fire', zigzag(L.britishFront)), mk('british', 'support', zigzag(L.britishSupport)));
  out.push(mk('german', 'fire', zigzag(L.germanFront)), mk('german', 'support', zigzag(L.germanSupport)), mk('german', 'reserve', zigzag(L.germanReserve)));
  // communication trenches: wandering connectors from the line behind to the line in front, every ~700 m
  const link = (front, back, side, z) => {
    const fx = lineXat(front, z), bx = lineXat(back, z);
    const pts = [{ x: bx, z }, { x: (bx + fx) / 2 - 20, z: z + (rnd() - 0.5) * 60 }, { x: fx, z: z + (rnd() - 0.5) * 30 }];
    const sm = resample(smooth(pts, 12), 12).map((p) => ({ x: p.x, z: p.z }));
    return mk(side, 'comm', sm);
  };
  for (let z = -6400; z <= 6600; z += 700 + rnd() * 200) {
    out.push(link(L.britishFront, L.britishSupport, 'british', z));
    out.push(link(L.germanSupport, L.germanReserve, 'german', z + 250));
    out.push(link(L.germanFront, L.germanSupport, 'german', z + 100));
  }
  TRENCHES = out;
  return out;
}

function lineXat(pts, z) {
  if (z <= pts[0].z) return pts[0].x;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (z <= b.z) return a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x);
  }
  return pts[pts.length - 1].x;
}

// wire belts: { side, pts, depth } (depth is the belt's width in metres across the line)
let WIRE = null;
export function wireBelts() {
  if (WIRE) return WIRE;
  const fromTL = TL?.wireBelts?.();
  if (fromTL && fromTL.length) {
    WIRE = fromTL.map((w) => ({ side: w.side || 'german', depth: w.depth || w.width || 12, pts: w.pts.map((p) => ({ x: p.x, z: p.z })) }));
    return WIRE;
  }
  const out = [];
  const belt = (ctrl, side, off, depth) => {
    const sm = resample(smooth(ctrl, 12), 6);
    const pts = sm.map((p) => ({ x: p.x + (side === 'british' ? off : -off), z: p.z }));
    out.push({ side, depth, pts });
  };
  belt(LINES.britishFront, 'british', 30, 9);
  belt(LINES.germanFront, 'german', 34, 14);
  belt(LINES.germanFront, 'german', 58, 10);
  belt(LINES.germanSupport, 'german', 30, 10);
  belt(LINES.britishSupport, 'british', 28, 7);
  WIRE = out;
  return out;
}

// Roads of the sector (the terrain agent paints them as ground; the world adds the surface, the
// stumps and the screens): { id, kind: 'pave' | 'plank' | 'track', width, pts }
const P = (x, z) => ({ x, z });
const EXTRA_ROADS = [
  { id: 'menin', kind: 'pave', width: 6.5, pts: [P(-3600, 3600), P(-2600, 2950), P(-1500, 2550), P(-300, 1500), P(700, 900), P(1500, 300), P(2700, 1200), P(4000, 2500), P(5400, 3900), P(6800, 4800)] },
  { id: 'zonnebeke', kind: 'plank', width: 4, pts: [P(1500, 300), P(2600, -300), P(3700, -900), P(5000, -1000), P(5800, -700), P(6900, -1000)] },
  { id: 'wieltje', kind: 'pave', width: 5.5, pts: [P(-2200, 2300), P(-1400, 1000), P(-500, -600), P(700, -2200), P(1700, -3200), P(3200, -3600), P(4700, -3900)] },
  { id: 'frezenberg', kind: 'plank', width: 3.6, pts: [P(1700, -3200), P(2300, -2100), P(2900, -900), P(3400, 0)] },
  { id: 'poperinghe', kind: 'pave', width: 6, pts: [P(-5200, 1400), P(-4000, 1900), P(-2600, 2150), P(-1500, 2550)] },
  { id: 'rail-access', kind: 'track', width: 3.2, pts: [P(-3100, 300), P(-2400, 250), P(-1300, 100), P(-300, 700), P(700, 900)] },
  { id: 'battery-link', kind: 'track', width: 3.2, pts: [P(-1800, -400), P(-1200, -500), P(-300, -900), P(400, -1300), P(1000, -1500), P(1700, -1500)] },
  { id: 'sixty-link', kind: 'track', width: 3.2, pts: [P(900, 1800), P(1100, 1300), P(1500, 300)] },
];

// the terrain agent's roads and tracks when it has them (it paints them into the ground), else our own list
const TLR = TL?.tracks?.();
export const ROADS = TLR && TLR.length
  ? [...TLR.map((t, i) => ({ id: (t.kind === 'road' ? 'road' : t.kind) + i, kind: t.kind === 'road' ? 'pave' : t.kind === 'duckboard' ? 'duck' : 'plank', width: t.kind === 'road' ? 5.2 : t.kind === 'plank' ? 3.6 : 0.95, pts: t.pts.map((p) => ({ x: p.x, z: p.z })) })),
    ...EXTRA_ROADS.filter((r) => r.kind === 'track')]
  : EXTRA_ROADS;


// 60 cm light railways (Decauville) bringing shells forward
export const LIGHT_RAILS = [
  { id: 'to-granny', pts: [P(-3200, 2500), P(-2600, 1700), P(-2100, 700), P(-1800, -400), P(-1500, -500)] },
  { id: 'to-mother', pts: [P(-2100, 1700), P(-1300, 1500), P(-700, 1050), P(-600, 900), P(-570, 945)] },
];

export const SPUR = RAIL_SPUR.map((p) => ({ x: p.x, z: p.z }));
export const MAIN = RAIL_MAIN.map((p) => ({ x: p.x, z: p.z }));

// farms behind the lines: shelled ones nearer the front. { x, z, yaw, state: 'intact' | 'shelled' | 'ruin' }
let FARMS = null;
export function farms() {
  if (FARMS) return FARMS;
  const rnd = mulberry32(77), out = [];
  const avoid = (x, z) => {
    for (const u of UNITS) for (const p of piecePlacements(u)) if (Math.hypot(p.x - x, p.z - z) < 180) return true;
    for (const pl of PLACES) if (pl.kind !== 'wood' && Math.hypot(pl.pos.x - x, pl.pos.z - z) < pl.r + 140) return true;
    for (const r of ROADS) if (polylineDistance(r.pts, x, z) < 40) return true;
    if (polylineDistance(SPUR, x, z) < 60 || polylineDistance(MAIN, x, z) < 60) return true;
    for (const s of SITES) if (Math.hypot(s.pos.x - x, s.pos.z - z) < 300) return true;
    return false;
  };
  for (let tries = 0; out.length < 26 && tries < 400; tries++) {
    const x = -5600 + rnd() * 8000, z = -6200 + rnd() * 12400;
    if (avoid(x, z) || out.some((f) => Math.hypot(f.x - x, f.z - z) < 380)) continue;
    const near = x > 1500 ? 0.85 : x > -500 ? 0.4 : 0.1;
    const st = rnd();
    out.push({ x, z, yaw: Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.2, state: st < near ? (rnd() < 0.5 ? 'ruin' : 'shelled') : st < near + 0.35 ? 'shelled' : 'intact', seed: (rnd() * 1e6) | 0 });
  }
  FARMS = out;
  return out;
}

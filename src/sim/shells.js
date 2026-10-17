// The shell integrator, range tables and the laying solver. One integrator serves all three: the tables and
// the solver fly the same drag-and-gravity model the sim flies shells with, so a nominal laying lands
// where it should and every error comes from the hidden terms (calibration, wind, map error, dispersion).
import { G, STEP, GUNS } from './tables.js';
import { YARD } from '../sector.js';

// Game drag constant of a gun's shell (1/m): a quadratic drag, k = 0.5 rho Cd A / m
export const dragK = (kind) => {
  const g = GUNS[kind], r = g.calibre * 0.0254 / 2;
  return 0.5 * 1.2 * g.cd * Math.PI * r * r / g.mass;
};
const KS = {};
for (const kind of Object.keys(GUNS)) KS[kind] = dragK(kind);
export const shellK = (kind) => KS[kind] ?? KS.bl6;

// One semi-implicit step of a state {x, y, z, vx, vy, vz}; wind is the air's velocity (wx, wz)
export function stepBallistic(s, dt, k, wx = 0, wz = 0) {
  const rx = s.vx - wx, rz = s.vz - wz;
  const c = k * Math.sqrt(rx * rx + s.vy * s.vy + rz * rz);
  s.vx -= c * rx * dt;
  s.vy -= (c * s.vy + G) * dt;
  s.vz -= c * rz * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
}

// Planar flight (no wind) from y = 0: landing range, time of flight and apex at y = 0 again
export function flyPlane(v, el, k) {
  const s = { x: 0, y: 0, z: 0, vx: v * Math.cos(el), vy: v * Math.sin(el), vz: 0 };
  let t = 0, apex = 0, px = 0, py = 0;
  while (t < 400) {
    px = s.x;
    py = s.y;
    stepBallistic(s, STEP, k);
    t += STEP;
    if (s.y > apex) apex = s.y;
    if (s.y <= 0 && s.vy < 0) {
      const f = py / (py - s.y);
      return { range: px + (s.x - px) * f, tof: t - STEP + STEP * f, apex };
    }
  }
  return { range: s.x, tof: t, apex };
}

// Height of the planar trajectory when it passes horizontal distance D (the shell may go below 0: that is
// fine, it keeps the function smooth for the solver), with the time of passage
export function heightAtDistance(v, el, k, D) {
  const s = { x: 0, y: 0, z: 0, vx: v * Math.cos(el), vy: v * Math.sin(el), vz: 0 };
  let t = 0;
  while (t < 400) {
    const px = s.x, py = s.y;
    stepBallistic(s, STEP, k);
    t += STEP;
    if (s.x >= D) {
      const f = (D - px) / (s.x - px);
      return { y: py + (s.y - py) * f, t: t - STEP + STEP * f, vy: s.vy };
    }
    if (s.y < -3000) break;
  }
  return { y: -1e9, t, vy: -1 };
}

const _tables = new Map();
const RANGE_STEP = 100 * YARD;

// Range table of a gun at a charge: rows every 100 yards (a German gun's `rowStep`, 100 m) on the rising branch (the
// low angle solution), { range (m), el (rad), tof (s), apex (m) }, plus rMin, rMax (m) and elOpt, the elevation of the
// longest range. A gun with `high` (the Karl-Gerät, 55 to 70 degrees) has only the falling branch: rows run from the
// shortest range (steepest) to the longest, each with its high-angle elevation.
export function rangeTable(kind, charge) {
  const key = kind + ':' + charge;
  let tb = _tables.get(key);
  if (tb) return tb;
  const g = GUNS[kind], ch = g.charges[Math.max(0, Math.min(g.charges.length - 1, charge))];
  const k = KS[kind], stepR = g.rowStep ?? RANGE_STEP;
  const pts = [];
  let best = 0, elOpt = g.elMin;
  for (let el = g.elMin; el <= g.elMax + 1e-9; el += 0.25 * Math.PI / 180) {
    const f = flyPlane(ch.v, el, k);
    pts.push({ el, ...f });
    if (f.range > best) {
      best = f.range;
      elOpt = el;
    }
  }
  // the branch the gun lays on, in order of increasing range
  const rise = g.high ? pts.filter((p) => p.el >= elOpt - 1e-9).reverse() : pts.filter((p) => p.el <= elOpt + 1e-9);
  const rows = [];
  const r0 = rise[0].range, r1 = rise[rise.length - 1].range;
  for (let r = Math.ceil(r0 / stepR) * stepR; r <= r1; r += stepR) {
    let i = 1;
    while (i < rise.length - 1 && rise[i].range < r) i++;
    const a = rise[i - 1], b = rise[i];
    const f = b.range > a.range ? (r - a.range) / (b.range - a.range) : 0;
    rows.push({ range: r, el: a.el + (b.el - a.el) * f, tof: a.tof + (b.tof - a.tof) * f, apex: a.apex + (b.apex - a.apex) * f });
  }
  tb = { kind, charge, rows, rMin: r0, rMax: r1, elOpt };
  _tables.set(key, tb);
  return tb;
}

// Elevation for a target at horizontal distance D and height dh above the muzzle (the low angle solution, or the
// high one for a `high` gun), by bisection over the same integrator. null when out of range either way.
export function solveElevation(kind, charge, D, dh = 0) {
  const g = GUNS[kind], ch = g.charges[Math.max(0, Math.min(g.charges.length - 1, charge))];
  const k = KS[kind];
  const tb = rangeTable(kind, charge);
  if (g.high) {
    // falling branch: the steeper the shorter; at D the shell is above dh when the elevation is too low
    let lo = Math.max(g.elMin, tb.elOpt), hi = g.elMax;
    if (heightAtDistance(ch.v, lo, k, D).y - dh < 0) return null; // out of range even at the flattest
    if (heightAtDistance(ch.v, hi, k, D).y - dh > 0) return null; // inside the minimum range
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (heightAtDistance(ch.v, mid, k, D).y - dh > 0) lo = mid; else hi = mid;
    }
    const el = (lo + hi) / 2;
    return { el, tof: heightAtDistance(ch.v, el, k, D).t };
  }
  let lo = g.elMin, hi = Math.min(g.elMax, tb.elOpt);
  const ylo = heightAtDistance(ch.v, lo, k, D).y - dh;
  if (ylo > 0) return null;
  const yhi = heightAtDistance(ch.v, hi, k, D).y - dh;
  if (yhi < 0) return null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (heightAtDistance(ch.v, mid, k, D).y - dh < 0) lo = mid; else hi = mid;
  }
  const el = (lo + hi) / 2;
  return { el, tof: heightAtDistance(ch.v, el, k, D).t };
}

// Slope of elevation against range (rad per m) at a range, from the table: how a range error maps to elevation
export function elSlope(kind, charge, range) {
  const a = solveElevation(kind, charge, Math.max(200, range - 100)), b = solveElevation(kind, charge, range + 100);
  if (!a || !b) return 0;
  return (b.el - a.el) / 200;
}

// Does this charge reach this range?
export const reaches = (kind, charge, range) => {
  const tb = rangeTable(kind, charge);
  return range >= tb.rMin * 1.02 && range <= tb.rMax * 0.985;
};

// The charge a sensible crew picks for a range: the lowest that reaches it with some margin
export function autoCharge(kind, range) {
  const g = GUNS[kind];
  for (let c = 0; c < g.charges.length; c++) if (reaches(kind, c, range) && range < rangeTable(kind, c).rMax * 0.9) return c;
  for (let c = g.charges.length - 1; c >= 0; c--) if (reaches(kind, c, range)) return c;
  return -1;
}

export const maxRange = (kind) => rangeTable(kind, GUNS[kind].charges.length - 1).rMax;

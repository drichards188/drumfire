// Pace helpers for the drills written as pure functions of the step's progress (render/ww1/max38.js, gamma.js and
// the Nebelwerfer in crews_de.js). A walk eased over its whole window by smoothstep runs at half pace, then 1.5 times
// it, then crawls in: the legs cycle in slow motion at the ends and too fast in the middle. These walk at an even
// pace with short ramps at the ends and wait for the rest of the window (or set off late and arrive on time), turn
// over a fixed time instead of snapping, and follow a path with rounded corners.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// progress 0..1 over normalised time u with even speed between ramps of r (each, as a share of the time)
export function trap(u, r) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  r = Math.min(0.5, Math.max(1e-3, r));
  const v = 1 / (1 - r);
  if (u < r) return (v * u * u) / (2 * r);
  if (u > 1 - r) return 1 - (v * (1 - u) * (1 - u)) / (2 * r);
  return v * (u - r / 2);
}

// The share of a walk of `dist` metres done at step progress k, walked at `v` m/s with ramps of `ramp` seconds, inside
// the window k0..k1 of a step lasting `dur` seconds: setting off at k0 (or arriving at k1 when `late`); a window too
// short for the pace is walked faster to fit it.
export function paced(k, k0, k1, dur, dist, v = 1.3, ramp = 0.3, late = false) {
  const T = Math.max(1e-3, (k1 - k0) * dur), tw = Math.min(T, dist / v + ramp);
  const t = (k - k0) * dur - (late ? T - tw : 0);
  return trap(t / tw, ramp / tw);
}

// the same over plain seconds since a start time
export function pacedT(t, dist, v = 1.3, ramp = 0.3) {
  const tw = Math.max(1e-3, dist / v + ramp);
  return trap(t / tw, ramp / tw);
}

// a heading turned from a to b, w 0..1 of the way (the short way round)
export const turn = (a, b, w) => a + wrap(b - a) * clamp01(w);

// A point along a polyline (pts[0..n-1] of {x, z}) at the fraction e of its length. out = { x, z, h, d, len }:
// h faces along the path, blended between the legs within `round` metres of a corner, and from `h0` over the first
// and to `h1` over the last `ends` metres when they are given.
export function along(pts, n, e, out, h0 = null, h1 = null, round = 0.5, ends = 0.6) {
  let len = 0;
  for (let i = 0; i < n - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  const d = clamp01(e) * len;
  let rest = d, i = 0;
  for (; i < n - 2; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    if (rest <= l) break;
    rest -= l;
  }
  const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), f = l > 1e-6 ? Math.min(1, rest / l) : 1;
  out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f;
  const hd = (p, q) => Math.atan2(-(q.x - p.x), -(q.z - p.z));
  let h = hd(a, b);
  // round the corners: half the turn before a corner, half after it
  if (i < n - 2 && l - rest < round) { const h2 = hd(b, pts[i + 2]); h = turn(h, h2, 0.5 * (1 - (l - rest) / round)); }
  if (i > 0 && rest < round) { const hp = hd(pts[i - 1], a); h = turn(hp, h, 0.5 + 0.5 * rest / round); }
  if (h0 != null) h = turn(h0, h, sstep(0, Math.min(ends, len / 2), d));
  if (h1 != null) h = turn(h, h1, sstep(len - Math.min(ends, len / 2), len, d));
  out.h = h; out.d = d; out.len = len;
  return out;
}

export function pathLen(pts, n) {
  let len = 0;
  for (let i = 0; i < n - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  return len;
}

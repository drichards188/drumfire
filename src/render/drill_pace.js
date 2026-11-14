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

// The rammer team on the staff's cross handles (the K5's, the Langer Max's and the WW2 railway guns' drills). In line
// each man stands RAM_BEHIND behind his handle, turned RAM_TURN in toward the staff, his outboard hand near the handle's
// end and the inboard one a shoulder's width in, so his arms reach forward and never cross (the hands used to be the
// same for both sides, the right pair's crossed through their chests, and the men stood abreast of the handle with it
// at their chests). barHand: the offset of hand `sd` from the handle's middle in the drill's frame (x across, y up, z
// along the staff) for a man on the `side` of the staff (-1 left, +1 right), the staff `line` of the way from its hooks
// (0: the handles rolled upright against the wall) into line with the bore (1: flat), the handle's half length `bar`.
// On the hooks both hands are on the staff itself, a shoulder's width apart along it, the right one ahead (the left
// man faces the wall to lift it off).
export const RAM_BEHIND = 0.28, RAM_TURN = 0.2;
export function barHand(sd, side, line, bar, out) {
  const outer = (side < 0) === (sd === 'L');
  const x = side * (outer ? bar - 0.08 : bar - 0.4) * line, th = (1 - line) * Math.PI / 2;
  out.x = x * Math.cos(th); out.y = x * Math.sin(th); out.z = (1 - line) * (sd === 'R' ? -0.2 : 0.2);
  return out;
}
// A left rammer's place while the staff swings between its hooks (line 0: he faces the wall at `wall`, its reach `d0`
// out of his hands) and the line (1: in his lane at lx, RAM_BEHIND behind the handle): a reach behind his hands' middle
// along his heading, slid toward the lane's place as the staff comes into line, so his hands stay out in front of him
// and the handle passes ahead of him (he used to sidestep along a fixed curve, the hands in his chest halfway). hx, hz:
// the handle's middle in the drill's frame; out = { x, z, h }.
const _h1 = { x: 0, y: 0, z: 0 }, _h2 = { x: 0, y: 0, z: 0 };
export function swingStand(line, hx, hz, bar, lx, wall, d0, out) {
  const h = turn(wall, -RAM_TURN, line), d = d0 + (0.3 - d0) * line;
  barHand('L', -1, line, bar, _h1); barHand('R', -1, line, bar, _h2);
  const mx = hx + (_h1.x + _h2.x) / 2, mz = hz + (_h1.z + _h2.z) / 2;
  // in line: what is left over from the reach to his place in the lane
  const ex = lx + (bar - 0.24) + Math.sin(RAM_TURN) * 0.3, ez = RAM_BEHIND - Math.cos(RAM_TURN) * 0.3;
  out.x = mx + Math.sin(h) * d + ex * line; out.z = mz + Math.cos(h) * d + ez * line; out.h = h;
  return out;
}

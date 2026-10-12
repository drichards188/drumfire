import { h2, grey, rgbk } from './mesher.js';

// Small buildable props shared by the gun positions, camps, roads and farms. Every prop takes the Mesher,
// the ground function h, a world position and a yaw (rotation.y convention: yaw 0 faces -Z) and sits on h.

export const rot = (yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [lx * c + lz * s, -lx * s + lz * c]; };
// local frame at (ox, oz) turned by yaw: L(lx, lz) -> [x, z] in the world
export const frame = (ox, oz, yaw) => { const R = rot(yaw); return (lx, lz) => { const [a, b] = R(lx, lz); return [ox + a, oz + b]; }; };

export function crate(m, h, x, z, yaw, w = 0.5, hh = 0.35, d = 0.32, y0 = null, col = 0xffffff) {
  const y = (y0 ?? h(x, z)) + hh / 2;
  m.box('timber', x, y, z, w, hh, d, yaw, col, { u0: x * 3, v0: z * 3 });
}

// shells lying side by side in tiers on timber dunnage, axis along local x of the frame: returns the top y
export function shellStack(m, h, ox, oz, yaw, { r = 0.15, len = 1, cols = 6, tiers = 3, paint = 0x4c5438, band = 0xb89a2a } = {}) {
  const L = frame(ox, oz, yaw), y0 = h(ox, oz);
  const w = cols * r * 2.05;
  m.box('timber', ox, y0 + 0.05, oz, len + 0.4, 0.1, w + 0.3, yaw, grey(0.7));
  for (let t = 0; t < tiers; t++) {
    const n = cols - t;
    for (let k = 0; k < n; k++) {
      const lz = (k - (n - 1) / 2) * r * 2.05, y = y0 + 0.1 + r + t * r * 1.78;
      const a = L(-len / 2, lz), b = L(len / 2 - r * 0.9, lz), c = L(len / 2 + r * 0.9, lz);
      const tone = 0.85 + h2(k, t, ox | 0) * 0.3;
      m.tube('paint', [a[0], y, a[1]], [b[0], y, b[1]], r, r, 8, rgbk(((paint >> 16) & 255) / 255 * tone, ((paint >> 8) & 255) / 255 * tone, (paint & 255) / 255 * tone), { capA: true, capB: false });
      m.tube('paint', [b[0], y, b[1]], [c[0], y, c[1]], r, r * 0.22, 8, grey(0.35), { capA: false, capB: true });
      const bd = L(len * 0.18, lz);
      m.tube('paint', [bd[0], y, bd[1]], [bd[0] + (c[0] - a[0]) * 0.04, y, bd[1] + (c[1] - a[1]) * 0.04], r * 1.01, r * 1.01, 8, band, { capA: false, capB: false });
    }
  }
  return y0 + 0.1 + r * 2 + tiers * r * 1.78;
}

// a run of sandbag wall from a to b ([x, z]), height hh, thickness th; `gap` leaves openings as [t0, t1] fractions
export function sandWall(m, h, a, b, { hh = 1.4, th = 0.9, tone = 1, gaps = [], seed = 0, col = null } = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const n = Math.max(1, Math.round(L / 2));
  const yaw = Math.atan2(-dx, -dz);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    if (gaps.some((g) => t1 > g[0] && t0 < g[1])) continue;
    const x0 = a[0] + dx * t0, z0 = a[1] + dz * t0, x1 = a[0] + dx * t1, z1 = a[1] + dz * t1;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const y = Math.min(h(x0, z0), h(x1, z1), h(mx, mz));
    const j = h2(mx, mz, seed + 3), hgt = hh * (0.92 + j * 0.16);
    m.box('sandbag', mx, y + hgt / 2 - 0.05, mz, th * (0.95 + j * 0.1), hgt + 0.1, L / n + 0.08, yaw, col ?? grey(tone * (0.88 + j * 0.2)), { u0: k * 2, rz: (j - 0.5) * 0.04 });
  }
}

// a ridge tent (canvas): footprint w by l, ridge height hh
export function tent(m, h, x, z, yaw, w = 3.4, l = 5, hh = 2.6, tone = 1) {
  const L = frame(x, z, yaw), y = h(x, z) - 0.02;
  const wall = 1.1;
  const c = (lx, lz, yy) => { const p = L(lx, lz); return [p[0], y + yy, p[1]]; };
  const col = grey(tone);
  m.quad('canvas', c(-w / 2, -l / 2, 0), c(-w / 2, l / 2, 0), c(-w / 2, l / 2, wall), c(-w / 2, -l / 2, wall), col, [[0, 0], [l, 0], [l, wall], [0, wall]]);
  m.quad('canvas', c(w / 2, l / 2, 0), c(w / 2, -l / 2, 0), c(w / 2, -l / 2, wall), c(w / 2, l / 2, wall), col, [[0, 0], [l, 0], [l, wall], [0, wall]]);
  m.quad('canvas', c(-w / 2, l / 2, wall), c(-w / 2, -l / 2, wall), c(0, -l / 2, hh), c(0, l / 2, hh), col, [[0, 0], [l, 0], [l, w], [0, w]]);
  m.quad('canvas', c(0, l / 2, hh), c(0, -l / 2, hh), c(w / 2, -l / 2, wall), c(w / 2, l / 2, wall), col, [[0, 0], [l, 0], [l, w], [0, w]]);
  for (const s of [-1, 1]) {
    const lz = s * l / 2;
    m.tri('canvas', c(-w / 2, lz, wall), c(w / 2, lz, wall), c(0, lz, hh), col);
    m.quad('canvas', c(-w / 2, lz, 0), c(w / 2, lz, 0), c(w / 2, lz, wall), c(-w / 2, lz, wall), col);
  }
  // guy ropes and pegs: thin dark beams
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = c(sx * w / 2, sz * l / 2, wall * 0.8), b = c(sx * (w / 2 + 1.2), sz * (l / 2 + 1.2), 0.1);
    m.beam('dark', a, b, 0.015, 0.015);
  }
}

// a Nissen hut: corrugated half-barrel, plank ends with a door and windows
export function nissen(m, h, x, z, yaw, w = 4.8, l = 9, tone = 1) {
  const L = frame(x, z, yaw), y = h(x, z) - 0.05;
  const a = L(0, -l / 2), b = L(0, l / 2);
  m.arch('iron', [a[0], y, a[1]], [b[0], y, b[1]], w / 2, grey(tone), { seg: 10, sy: 0.85 });
  for (const s of [-1, 1]) {
    const p = L(0, s * l / 2);
    const R = w / 2, nSeg = 10;
    for (let i = 0; i < nSeg; i++) {
      const t0 = Math.PI * i / nSeg, t1 = Math.PI * (i + 1) / nSeg;
      const q0 = L(Math.cos(t0) * R, s * l / 2), q1 = L(Math.cos(t1) * R, s * l / 2);
      const tri = [[p[0], y, p[1]], [q0[0], y + Math.sin(t0) * R * 0.85, q0[1]], [q1[0], y + Math.sin(t1) * R * 0.85, q1[1]]];
      m.tri('timber', s > 0 ? tri[0] : tri[0], s > 0 ? tri[1] : tri[2], s > 0 ? tri[2] : tri[1], grey(0.8));
    }
    const d = L(0, s * (l / 2 + 0.03));
    m.box('dark', d[0], y + 1.0, d[1], 0.9, 2.0, 0.08, yaw, 0xffffff);
  }
}

export function pole(m, h, x, z, hh = 7, arms = 1, yaw = 0) {
  const y = h(x, z);
  m.tube('timber', [x, y - 0.3, z], [x + 0.05, y + hh, z], 0.12, 0.08, 6, grey(0.55), { capA: false, capB: true });
  for (let k = 0; k < arms; k++) m.box('timber', x + 0.05, y + hh - 0.5 - k * 0.7, z, 1.6, 0.1, 0.1, yaw, grey(0.6));
  return [x + 0.05, y + hh - 0.5, z];
}

// a sagging wire between two points (3D) as a thin dark beam in n pieces
export function wireLine(m, a, b, sag = 0.5, n = 5) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t];
    m.beam('dark', prev, p, 0.014, 0.014);
    prev = p;
  }
}

// a horse (standing or dead on its side), roughly 2.4 m long
export function horse(m, h, x, z, yaw, { dead = false, col = 0x5b3e28 } = {}) {
  const L = frame(x, z, yaw), y = h(x, z);
  const P = (lx, ly, lz) => { const p = L(lx, lz); return [p[0], y + ly, p[1]]; };
  const k = 0.85 + h2(x, z, 4) * 0.3;
  const c = rgbk(((col >> 16) & 255) / 255 * k, ((col >> 8) & 255) / 255 * k, (col & 255) / 255 * k);
  if (!dead) {
    const b = P(0, 1.3, 0), bb = L(0, 0);
    m.ell('paint', b[0], b[1], b[2], 0.32, 0.42, 0.95, yaw, c, 8);
    const n0 = P(0, 1.55, -0.8), n1 = P(0, 2.1, -1.25);
    m.beam('paint', n0, n1, 0.22, 0.3, c);
    const hd = P(0, 2.2, -1.5);
    m.beam('paint', n1, hd, 0.17, 0.24, c);
    for (const [lx, lz] of [[-0.2, -0.7], [0.2, -0.7], [-0.2, 0.7], [0.2, 0.7]]) m.beam('paint', P(lx, 1.0, lz), P(lx, 0.05, lz), 0.1, 0.1, c);
    m.beam('paint', P(0, 1.55, 0.85), P(0, 0.8, 1.1), 0.08, 0.06, grey(0.15));
    void bb;
  } else {
    // on its side, legs out stiff
    const b = P(0, 0.45, 0);
    m.ell('paint', b[0], b[1], b[2], 0.95, 0.42, 0.32, yaw, c, 8);
    m.beam('paint', P(-0.9, 0.5, 0), P(-1.6, 0.35, -0.1), 0.2, 0.26, c);
    for (const [lx, lz] of [[-0.55, 0.3], [-0.2, 0.3], [0.4, 0.3], [0.7, 0.3]]) m.beam('paint', P(lx, 0.5, lz), P(lx + 0.15, 0.55, lz + 0.9), 0.09, 0.09, c);
  }
}

// a broken tree stump, `hh` tall, with a splintered top and a fallen bough or two
export function stump(m, h, x, z, hh = 2.4, r = 0.28, seed = 0) {
  const y = h(x, z);
  const lean = (h2(x, z, seed + 1) - 0.5) * 0.4;
  const top = [x + lean * hh * 0.3, y + hh, z + (h2(x, z, seed + 2) - 0.5) * 0.3 * hh * 0.3];
  m.tube('timber', [x, y - 0.1, z], top, r * 1.2, r * 0.75, 7, grey(0.5 + h2(x, z, seed + 5) * 0.15), { capA: false, capB: false });
  for (let i = 0; i < 3; i++) { // splinters
    const a = h2(x, z, seed + 7 + i) * 6.28, l = 0.5 + h2(x, z, seed + 11 + i) * 0.9;
    m.beam('timber', [top[0] + Math.cos(a) * r * 0.5, top[1] - 0.1, top[2] + Math.sin(a) * r * 0.5], [top[0] + Math.cos(a) * r * 0.2, top[1] + l, top[2] + Math.sin(a) * r * 0.2], 0.09, 0.06, grey(0.6));
  }
}

// hessian screening on poles along a line from a to b ([x, z]): the screens that hid the roads from observers
export function hessianScreen(m, h, a, b, hh = 2.4) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / 3));
  for (let k = 0; k <= n; k++) {
    const x = a[0] + dx * k / n, z = a[1] + dz * k / n, y = h(x, z);
    m.beam('timber', [x, y - 0.2, z], [x, y + hh + 0.3, z], 0.1, 0.1, grey(0.55));
  }
  for (let k = 0; k < n; k++) {
    const x0 = a[0] + dx * k / n, z0 = a[1] + dz * k / n, x1 = a[0] + dx * (k + 1) / n, z1 = a[1] + dz * (k + 1) / n;
    const y0 = h(x0, z0), y1 = h(x1, z1), tone = 0.8 + h2(x0, z0, 9) * 0.3, drop = h2(x0, z0, 12) < 0.12 ? 0.8 : 0;
    m.quad('hessian', [x0, y0 + 0.3 + drop, z0], [x1, y1 + 0.3 + drop, z1], [x1, y1 + hh - drop * 0.3, z1], [x0, y0 + hh - drop * 0.3, z0], grey(tone), [[0, 0], [L / n, 0], [L / n, hh], [0, hh]]);
  }
}

// a general service wagon / limber, wheels as discs; `wreck` tips it onto one side
export function wagon(m, h, x, z, yaw, { wreck = false, limber = false } = {}) {
  const L = frame(x, z, yaw), y = h(x, z);
  const tilt = wreck ? 0.35 : 0;
  const P = (lx, ly, lz) => { const p = L(lx, lz); return [p[0], y + ly - (wreck ? Math.abs(lx) * 0.1 : 0), p[1]]; };
  const bodyL = limber ? 1.4 : 3.2;
  const c = L(0, 0);
  m.box('timber', c[0], y + 1.15, c[1], 1.6, 0.9, bodyL, yaw, grey(0.85), { rz: tilt });
  m.box('paint', c[0], y + 0.7, c[1], 1.7, 0.1, bodyL + 0.2, yaw, rgbk(0.3, 0.33, 0.22), { rz: tilt });
  for (const sx of [-1, 1]) for (const sz of limber ? [0] : [-1, 1]) {
    const p = L(sx * 0.9, sz * bodyL * 0.3);
    const lean = wreck && sx > 0 ? 0.5 : 0;
    const w0 = [p[0] - Math.cos(yaw) * 0.04, y + 0.62 + lean, p[1] + Math.sin(yaw) * 0.04], w1 = [p[0] + Math.cos(yaw) * 0.04, y + 0.62 + lean, p[1] - Math.sin(yaw) * 0.04];
    m.tube('timber', w0, w1, 0.62, 0.62, 10, grey(0.7), { capA: true, capB: true });
  }
  const t0 = P(0, 0.9, -bodyL / 2), t1 = P(0, 0.8, -bodyL / 2 - 2.6);
  m.beam('timber', t0, t1, 0.12, 0.12, grey(0.7));
}

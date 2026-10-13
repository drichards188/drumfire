import { UNITS, piecePlacements, headingFor } from '../sector.js';
import { h2, grey, rgbk } from './mesher.js';
import { frame, crate, shellStack, sandWall, tent, nissen, pole, wireLine, horse, hessianScreen, wagon } from './props.js';

// Gun positions: for every piece of every unit a sandbagged pit open toward the line of fire, a camouflage
// net on poles over the rear half (rolled back from the muzzle), a ready-use shell stack, a crew shelter;
// per unit a command post dugout with telephone poles and wires, plank walks, tents and huts and a horse
// line behind. The gun's own platform (earth box, steel bed) is the model's. Local frame of a piece: -Z is the
// line of fire, +X right, +Z back toward the camp.

const TILE = 256;
const key = (i, j) => i + ',' + j;

// per kind layout, metres in the piece's local frame
const KINDS = {
  bl15: { half: 10.5, z0: -2.5, z1: 10, wall: 1.9, net: { x: 11.5, z0: -2.5, z1: 11, hBack: 8, hFront: 6.6, poles: 3 }, stack: { x: -5.5, z: 7, r: 0.19, len: 1.5, cols: 5, tiers: 3 }, shelter: { x: 14.5, z: 5 }, cases: [5.5, 7.5] },
  bl92: { half: 7, z0: -2, z1: 8.5, wall: 1.7, net: { x: 8, z0: -2, z1: 9, hBack: 5.8, hFront: 4.8, poles: 3 }, stack: { x: -4.2, z: 6, r: 0.125, len: 0.95, cols: 5, tiers: 3 }, shelter: { x: 10.5, z: 4.5 }, cases: [4, 6.5] },
  bl6: { half: 5, z0: -1.5, z1: 6.5, wall: 1.4, net: { x: 5.6, z0: -1.4, z1: 7, hBack: 3.9, hFront: 3.2, poles: 2 }, stack: { x: -3.1, z: 4.4, r: 0.08, len: 0.55, cols: 6, tiers: 3 }, shelter: { x: 7.4, z: 3.5 }, cases: [3, 5] },
  bl60: { half: 4.6, z0: -1, z1: 6, wall: 1.3, net: { x: 5.2, z0: -1, z1: 6.5, hBack: 3.8, hFront: 3.1, poles: 2 }, stack: { x: -2.9, z: 4, r: 0.07, len: 0.65, cols: 5, tiers: 3 }, shelter: { x: 7, z: 3.5 }, cases: [2.8, 4.8] },
  // the railway gun stands on the spur: local -Z (the line of fire) runs along the track. The 18-inch car is about 22 m
  // long (z -11.1 to +11.1 over the buffers) and rolls back along the track to z = +17.1 when the gun fires, so nothing
  // stands within 3 m of the track from z = -12 to +18; the net (shifted `dx` to the right) covers the crates and the shelter beside the track, clear of the hoist's jib (6.2 m high) and the track; the rig's own two ready shells lie at the foot of the hoist (x 4.75, z 9.7 to 10.9); the world's reserve stack is behind them.
  rail: { half: 0, z0: 0, z1: 0, wall: 0, net: { x: 7, z0: 3, z1: 19, hBack: 6, hFront: 5.2, poles: 3, dx: 14 }, stack: { x: 4.75, z: 14.6, r: 0.23, len: 2.1, cols: 3, tiers: 2 }, shelter: { x: 13, z: 20 }, cases: [8.5, 12.5] },
};

// Position anchors the render layer may use: where the ready-use shell stack and the crew shelter are, world
// position and yaw (rotation.y), plus the command post of the unit.
export function positionAnchors(unitId, pieceIndex = 0) {
  const u = UNITS.find((q) => q.id === unitId);
  if (!u) return null;
  const pl = piecePlacements(u)[pieceIndex];
  if (!pl) return null;
  const K = KINDS[pl.kind], yaw = headingFor(pl.bearing), L = frame(pl.x, pl.z, yaw);
  const at = (lx, lz) => { const p = L(lx, lz); return { x: p[0], z: p[1], yaw }; };
  const cp = unitFrame(u)(u.kind === 'rail' ? 22 : 0, 34);
  return {
    shellStack: at(K.stack.x, K.stack.z),
    shelter: at(K.shelter.x, K.shelter.z),
    cartridges: at(K.cases[0], K.cases[1]),
    net: at(K.net.dx ?? 0, (K.net.z0 + K.net.z1) / 2),
    commandPost: { x: cp[0], z: cp[1], yaw },
  };
}

// The solid props of one gun position in the piece's local frame (-Z the line of fire, +X right), as boxes
// { name, x0, z0, x1, z1, h } (metres, ground to h): the sandbag walls, the ready-use stack, the cartridge
// crates and the spent cases standing behind the gun (placed from the piece's world position like the build).
// The render layer's crew choreography keeps the men out of them (render/crewfield.js).
export function pitSolids(kind, wx = 0, wz = 0) {
  const K = KINDS[kind], out = [];
  if (!K) return out;
  const add = (name, x0, z0, x1, z1, h) => out.push({ name, x0, z0, x1, z1, h });
  const wall = (name, ax, az, bx, bz, hh, gaps = []) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2)), along = Math.abs(bz - az) > Math.abs(bx - ax);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      if (gaps.some((g) => t1 > g[0] && t0 < g[1])) continue;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      add(name, Math.min(x0, x1) - (along ? 0.5 : 0), Math.min(z0, z1) - (along ? 0 : 0.5), Math.max(x0, x1) + (along ? 0.5 : 0), Math.max(z0, z1) + (along ? 0 : 0.5), hh);
    }
  };
  if (K.half) {
    wall('wall', -K.half, K.z0, -K.half, K.z1, K.wall);
    wall('wall', K.half, K.z0, K.half, K.z1, K.wall);
    wall('wall', -K.half, K.z1, K.half, K.z1, K.wall * 0.9, [[0.4, 0.6]]);
  }
  const st = K.stack, w = st.cols * st.r * 2.05 + 0.3;
  add('stack', st.x - (st.len + 0.4) / 2, st.z - w / 2, st.x + (st.len + 0.4) / 2, st.z + w / 2, 0.1 + st.r * 2 + st.tiers * st.r * 1.78);
  for (let k = 0; k < 5; k++) {
    const cx = K.cases[0] + (k % 3) * 0.55, cz = K.cases[1] + ((k / 3) | 0) * 0.45;
    add('crate', cx - 0.3, cz - 0.25, cx + 0.3, cz + 0.25, 0.35);
  }
  const big = kind === 'bl15' || kind === 'bl92';
  for (let k = 0; k < (kind === 'rail' ? 0 : 6); k++) {
    const x = -1.5 + h2(k, wz, 5) * 3.2, z = 4.4 + h2(k, wx, 6) * 2.4, r = big ? 0.11 : 0.06;
    add('case', x - r, z - r, x + r, z + r, r * 6);
  }
  return out;
}

const unitFrame = (u) => frame(u.pos.x, u.pos.z, headingFor(u.zero));

let INDEX = null;
function init() {
  INDEX = new Map();
  const add = (x, z, it) => {
    const k = key(Math.floor(x / TILE), Math.floor(z / TILE));
    if (!INDEX.has(k)) INDEX.set(k, []);
    INDEX.get(k).push(it);
  };
  for (const u of UNITS) {
    const pls = piecePlacements(u);
    pls.forEach((p) => add(p.x, p.z, { t: 'piece', u, p }));
    const L = unitFrame(u);
    const c = L(u.kind === 'rail' ? 22 : 0, 40);
    add(c[0], c[1], { t: 'camp', u, pls });
  }
}

export default {
  name: 'battery',
  range: [450, 1400],
  init,
  items(i, j) { return INDEX.get(key(i, j)) || null; },
  build(m, items, i, j, lod, ctx) {
    for (const it of items) {
      if (it.t === 'piece') piece(m, it.u, it.p, lod, ctx.h);
      else camp(m, it.u, it.pls, lod, ctx.h);
    }
  },
};

// the camouflage net: a sagging scrim sheet over `a` x `b` (local frame), poles, rolled front edge, drooping skirts
function net(m, h, L, N, tone = 1) {
  const nx = 6, nz = 4;
  const P = (lx, lz, y) => { const p = L(lx, lz); return [p[0], y, p[1]]; };
  const base = h(...L(0, (N.z0 + N.z1) / 2));
  const yAt = (u, v) => base + N.hBack + (N.hFront - N.hBack) * v - Math.sin(u * Math.PI) * 0.35 - Math.sin(v * Math.PI) * 0.25;
  const xs = N.along ? [-N.x, N.x] : [-N.x, N.x];
  const zs = [N.z0, N.z1];
  // v runs from the back (z1) to the front (z0)
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const u0 = i / nx, u1 = (i + 1) / nx, v0 = k / nz, v1 = (k + 1) / nz;
    const q = (u, v) => P(xs[0] + (xs[1] - xs[0]) * u, zs[1] + (zs[0] - zs[1]) * v, yAt(u, v) + (h2(u * 7 + L(0, 0)[0], v * 5, 3) - 0.5) * 0.08);
    const A = q(u0, v0), B = q(u1, v0), C = q(u1, v1), D = q(u0, v1);
    m.quad('scrim', A, B, C, D, grey(tone * (0.9 + h2(i, k, 1) * 0.2)), [[A[0] * 0, 0], [(xs[1] - xs[0]) / nx, 0], [(xs[1] - xs[0]) / nx, (zs[1] - zs[0]) / nz], [0, (zs[1] - zs[0]) / nz]].map((uv, n) => [uv[0] + i * 3.1, uv[1] + k * 2.3 + n * 0]));
  }
  // skirts on the sides and the back: scrim draping to 2.6 m above the ground
  const skirt = (ax, az, bx, bz, ya, yb, drop) => {
    const a = P(ax, az, ya), b = P(bx, bz, yb), l = Math.hypot(bx - ax, bz - az);
    const c = P(bx, bz, yb - drop), d = P(ax, az, ya - drop);
    m.quad('scrim', a, d, c, b, grey(tone * 0.9), [[0, 0], [0, drop], [l, drop], [l, 0]]);
  };
  const dropTo = (y) => Math.max(1.5, y - base - 2.6);
  skirt(xs[0], zs[1], xs[1], zs[1], yAt(0, 0), yAt(1, 0), dropTo(yAt(0.5, 0)));
  skirt(xs[0], zs[0], xs[0], zs[1], yAt(0, 1), yAt(0, 0), dropTo(yAt(0, 0.5)));
  skirt(xs[1], zs[1], xs[1], zs[0], yAt(1, 0), yAt(1, 1), dropTo(yAt(1, 0.5)));
  // the front edge is rolled back: a fat roll of scrim along it
  const f0 = P(xs[0], zs[0], yAt(0, 1) - 0.1), f1 = P(xs[1], zs[0], yAt(1, 1) - 0.1);
  m.tube('hessian', f0, f1, 0.38, 0.38, 8, rgbk(0.55 * tone, 0.6 * tone, 0.45 * tone), { capA: true, capB: true });
  // poles at the corners and along the sides, with guys to pegs
  const np = N.poles;
  const pts = [];
  for (let s = 0; s <= np; s++) for (const ix of [0, 1]) pts.push([xs[ix], zs[1] + (zs[0] - zs[1]) * (s / np), s / np, ix]);
  if (N.along) { for (let s = 1; s < np; s++) pts.push([xs[0] + (xs[1] - xs[0]) * s / np, zs[1], 0, s / np]); }
  for (const [lx, lz, v] of pts) {
    const p = L(lx, lz), y = h(p[0], p[1]), top = yAt(Math.abs(lx - xs[0]) / (xs[1] - xs[0]), v);
    m.tube('timber', [p[0], y - 0.2, p[1]], [p[0], top, p[1]], 0.13, 0.1, 6, grey(0.6), { capA: false, capB: true });
    const g = L(lx + Math.sign(lx || 1) * 3, lz + (v < 0.5 ? 2.5 : -2.5));
    m.beam('dark', [p[0], top - 0.2, p[1]], [g[0], h(g[0], g[1]), g[1]], 0.02, 0.02);
  }
}

// a crew shelter: an earth and sandbag mound over a dugout, doorway facing the gun
function shelter(m, h, L, x, z, tone = 1) {
  const c = L(x, z), yaw = Math.atan2(-(L(x, z + 1)[0] - c[0]), -(L(x, z + 1)[1] - c[1])) + Math.PI;
  void yaw;
  const A = L(x - 2.4, z), B = L(x + 2.4, z);
  const y = h(c[0], c[1]);
  m.slope('earth', [A[0], y - 0.1, A[1]], [B[0], y - 0.1, B[1]], 4.6, 2.2, 1.7, grey(0.85 * tone));
  const f0 = L(x - 1.9, z - 1.8), f1 = L(x + 1.9, z - 1.8);
  sandWall(m, h, [f0[0], f0[1]], [f1[0], f1[1]], { hh: 1.5, th: 0.9, tone, seed: 5, gaps: [[0.38, 0.62]] });
  const d = L(x, z - 1.82);
  m.box('dark', d[0], y + 0.8, d[1], 1.0, 1.5, 0.3, 0, 0xffffff);
}

function piece(m, u, p, lod, h) {
  const K = KINDS[p.kind], yaw = headingFor(p.bearing), L = frame(p.x, p.z, yaw);
  const big = p.kind === 'bl15' || p.kind === 'bl92';
  const tone = 0.9 + h2(p.x, p.z, 1) * 0.15;
  if (K.half) {
    // sandbag walls: left, right and a back wall with a gap for the supply track; open toward the line of fire
    const l0 = L(-K.half, K.z0), l1 = L(-K.half, K.z1), r0 = L(K.half, K.z0), r1 = L(K.half, K.z1), b0 = L(-K.half, K.z1), b1 = L(K.half, K.z1);
    sandWall(m, h, l0, l1, { hh: K.wall, th: 1.0, tone, seed: 1 });
    sandWall(m, h, r0, r1, { hh: K.wall, th: 1.0, tone, seed: 2 });
    sandWall(m, h, b0, b1, { hh: K.wall * 0.9, th: 1.0, tone, seed: 3, gaps: [[0.4, 0.6]] });
    // the wings sweep forward and down
    const wl = L(-K.half - 1.2, K.z0 - 2), wr = L(K.half + 1.2, K.z0 - 2);
    sandWall(m, h, l0, wl, { hh: K.wall * 0.55, th: 1.0, tone, seed: 4 });
    sandWall(m, h, r0, wr, { hh: K.wall * 0.55, th: 1.0, tone, seed: 5 });
    // earth banked behind the sandbags
    for (const [a, b] of [[l0, l1], [r0, r1]]) {
      const sgn = a === l0 ? -1 : 1;
      const o0 = L(sgn * (K.half + 1.4), K.z0), o1 = L(sgn * (K.half + 1.4), K.z1);
      m.slope('earth', [o0[0], h(o0[0], o0[1]) - 0.1, o0[1]], [o1[0], h(o1[0], o1[1]) - 0.1, o1[1]], 2.6, 1.2, K.wall * 0.8, grey(0.8));
      void b;
    }
  }
  net(m, h, K.net.dx ? (lx, lz) => L(lx + K.net.dx, lz) : L, K.net, tone);
  if (lod > 0) return;
  // ready-use shell stack with a tarpaulin half over it, and cartridge boxes
  const st = K.stack, sp = L(st.x, st.z);
  const top = shellStack(m, h, sp[0], sp[1], yaw, st);
  const sc = L(st.x - 0.2, st.z + st.cols * st.r * 1.1);
  m.box('canvas', sc[0], top - 0.1, sc[1], st.len * 0.9, 0.05, st.cols * st.r * 1.0, yaw, rgbk(0.6, 0.6, 0.5), { rx: 0.2 });
  for (let k = 0; k < 5; k++) { // cartridge cases and boxes
    const q = L(K.cases[0] + (k % 3) * 0.55, K.cases[1] + ((k / 3) | 0) * 0.45);
    crate(m, h, q[0], q[1], yaw + (h2(k, p.x, 2) - 0.5) * 0.4, 0.5, 0.3, 0.3);
  }
  for (let k = 0; k < (p.kind === 'rail' ? 0 : 6); k++) { // spent brass cases standing about (not on the railway gun's track)
    const q = L(-1.5 + h2(k, p.z, 5) * 3.2, 4.4 + h2(k, p.x, 6) * 2.4), y = h(q[0], q[1]), r = big ? 0.11 : 0.06;
    m.tube('paint', [q[0], y, q[1]], [q[0], y + r * 6, q[1]], r, r * 0.9, 8, rgbk(0.72, 0.55, 0.24));
  }
  shelter(m, h, L, K.shelter.x, K.shelter.z, tone);
  // duckboard walk from the pit back to the camp spine
  if (p.kind !== 'rail') walk(m, h, [L(0, K.z1 || 4), L(0, 14)], 1.6);
  else walk(m, h, [L(11, 18), L(7.6, 12.2)], 1.4); // the shelter to the foot of the hoist
}

// plank walk (duckboards) through points ([x, z] pairs), width w
export function walk(m, h, pts, w = 1.2) {
  const line = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    for (let k = 0; k < n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; line.push([x, h(x, z) + 0.1, z]); }
  }
  const e = pts[pts.length - 1];
  line.push([e[0], h(e[0], e[1]) + 0.1, e[1]]);
  m.ribbon('plank', line, w, grey(0.8), { vScale: 1, swap: true });
}

function camp(m, u, pls, lod, h) {
  // the railway gun's camp lies beside its spur, not on it (the spur runs straight back under the camp frame's axis)
  const L0 = unitFrame(u), yaw = headingFor(u.zero), L = u.kind === 'rail' ? (lx, lz) => L0(lx + 22, lz) : L0;
  const span = pls.reduce((a, q) => Math.max(a, Math.abs(q.x - u.pos.x) + Math.abs(q.z - u.pos.z)), 0) + 10;
  const half = Math.max(12, span * 0.5);
  // command post: a mound over a dugout with a plank door, sandbag revetted porch and the signal desk's wires
  const cp = L(0, 34), cy = h(cp[0], cp[1]);
  const ca = L(-4, 34), cb = L(4, 34);
  m.slope('earth', [ca[0], cy - 0.1, ca[1]], [cb[0], cy - 0.1, cb[1]], 7, 3.4, 2.1, grey(0.85));
  const pf0 = L(-2.6, 30.4), pf1 = L(2.6, 30.4);
  sandWall(m, h, pf0, pf1, { hh: 1.7, th: 0.9, seed: 8, gaps: [[0.42, 0.58]] });
  const door = L(0, 30.5);
  m.box('dark', door[0], cy + 0.9, door[1], 1.0, 1.7, 0.3, yaw, 0xffffff);
  m.box('timber', door[0], cy + 1.85, door[1], 1.9, 0.2, 0.5, yaw, grey(0.7));
  // telephone poles along the spine, wires to the cp and out to the camp
  const poles = [];
  const nP = Math.max(3, Math.ceil(half * 2 / 28));
  for (let k = 0; k <= nP; k++) {
    const q = L(-half + (2 * half * k) / nP, 24 + (k % 2) * 1.5);
    poles.push(pole(m, h, q[0], q[1], 6.5, 1, yaw + Math.PI / 2));
  }
  const q0 = L(half + 30, 24), q1 = L(-half - 30, 24);
  poles.unshift(pole(m, h, q0[0], q0[1], 6.5, 1, yaw + Math.PI / 2));
  poles.push(pole(m, h, q1[0], q1[1], 6.5, 1, yaw + Math.PI / 2));
  for (let k = 0; k < poles.length - 1; k++) for (const o of [-0.5, 0, 0.5]) {
    const a = poles[k], b = poles[k + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2], L2 = Math.hypot(dx, dz) || 1, px = -dz / L2 * 0.6 * o * 2, pz = dx / L2 * 0.6 * o * 2;
    wireLine(m, [a[0] + px, a[1] - Math.abs(o) * 0.0, a[2] + pz], [b[0] + px, b[1], b[2] + pz], 0.4, 4);
  }
  if (lod > 0) return;
  // plank spine behind the guns and a spoke to the cp
  walk(m, h, [L(-half, 14), L(0, 15), L(half, 14)], 2.0);
  walk(m, h, [L(0, 15), L(0, 29)], 1.6);
  // huts and tents behind the cp
  const nHut = u.kind === 'bl6' || u.kind === 'bl60' ? 1 : 2;
  for (let k = 0; k < nHut; k++) { const p = L(-14 + k * 14, 50 + k * 3); nissen(m, h, p[0], p[1], yaw + Math.PI / 2, 4.8, 9, 0.9 + h2(k, u.id, 1) * 0.2); }
  const nT = 3 + Math.min(4, pls.length);
  for (let k = 0; k < nT; k++) {
    const p = L(8 + (k % 4) * 7, 46 + ((k / 4) | 0) * 8);
    tent(m, h, p[0], p[1], yaw + (h2(k, u.id, 2) - 0.5) * 0.3, 3.4, 5, 2.5, 0.75 + h2(k, u.id, 3) * 0.3);
  }
  // an ammunition pile under tarpaulin and a limber or two by the track
  const ap = L(-22, 58);
  shellStack(m, h, ap[0], ap[1], yaw, { r: 0.15, len: 1.3, cols: 6, tiers: 4 });
  const sc = L(-22, 58.4);
  m.box('canvas', sc[0], h(sc[0], sc[1]) + 1.35, sc[1], 1.6, 0.05, 1.5, yaw, rgbk(0.6, 0.6, 0.5), { rx: 0.2 });
  for (let k = 0; k < 2; k++) { const w = L(-4 + k * 5, 70); wagon(m, h, w[0], w[1], yaw + Math.PI / 2 + (k - 0.5) * 0.3, { limber: k === 1 }); }
  // horse lines: picket rope between two posts, horses tied along it, rugs on some
  const hl0 = L(-10, 92), hl1 = L(14, 92);
  for (const q of [hl0, hl1]) m.beam('timber', [q[0], h(q[0], q[1]) - 0.1, q[1]], [q[0], h(q[0], q[1]) + 1.5, q[1]], 0.1, 0.1, grey(0.6));
  wireLine(m, [hl0[0], h(hl0[0], hl0[1]) + 1.4, hl0[1]], [hl1[0], h(hl1[0], hl1[1]) + 1.4, hl1[1]], 0.1, 3);
  const nH = u.kind === 'bl15' || u.kind === 'bl92' ? 6 : 4;
  for (let k = 0; k < nH; k++) { const q = L(-8 + k * (22 / nH), 93.2); horse(m, h, q[0], q[1], yaw + Math.PI / 2 + (h2(k, u.id, 6) - 0.5) * 0.3); }
}

export { hessianScreen };

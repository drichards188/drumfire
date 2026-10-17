import * as THREE from 'three';
import { SMOKE, FLAME, FLASH, SPARK, rand, rr, clamp, rdir } from './kinds.js';
import { CLOD } from './clods.js';
import { runRocketEmitter } from './rockets.js';

// The artillery set: muzzle blast, shell burst, shrapnel and ammunition cook-off. Everything here
// spawns into the fx pools; the things that happen later (the column, the base surge, the mushroom,
// the secondary pops) are timed emitters (emitters.js), so nothing is allocated while it plays.
// Gameplay look, not physics: sizes scale with calibre^0.8, counts with distance from the camera.

const V = new THREE.Vector3(), U = new THREE.Vector3(), W = new THREE.Vector3(), AX = new THREE.Vector3();
const TAU = Math.PI * 2;

// Distance level of detail: far bursts get fewer, bigger particles, so a barrage fits the pool.
function lod(fx, p) {
  const d = fx._cam.distanceTo(p);
  let q = clamp(1.12 - d / 5200, 0.3, 1) * clamp(fx.budget, 0.4, 1.25);
  if (!fx.cheap()) q *= 0.6; // the pool is getting full: keep the big shapes, drop the filler
  fx.lodQ = q;
  fx.lodZ = clamp(1 / Math.sqrt(q), 0.9, 1.9);
  return q;
}
// Far off, things are drawn larger so a burst stays a readable shape (the flyers are enlarged the same way):
// 1 up to 600 m, 3.2 at 3.6 km and beyond.
const farScale = (fx, p) => clamp(1 + (fx._cam.distanceTo(p) - 600) / 1400, 1, 3.2);
const cnt = (n, q, min = 2) => Math.max(min, Math.round(n * q));
// The WW2 giants (Karl 23.6 in, the V-1 22, the V-2 26, Gustav 31.5): 0 up to 18.75 in (where the old
// scale clamp of 1.25 sits, so every calibre up to there is exactly as before), 1 at Gustav. They scale
// on past the clamp, more gently, and the terms that could white the screen out (the flash, the
// shockwave, the long column) are capped.
const bigK = (calibre) => (calibre > 18.75 ? clamp((calibre - 18.75) / 12.75, 0, 1.2) : 0);

// A flash seen by the lights: one of the pooled point lights for the nearest blasts, and the analytic
// lights through fx.onFlash (main wires it to flares.flash).
function flash(fx, p, color, intensity, life, pool = 0.04, radius = 12) {
  fx.light(p, intensity * pool, life, color);
  fx.flashAt(p, color, intensity, life, radius);
}

// A torus of smoke (a smoke ring, a mushroom head): n puffs on a ring of radius R around c with its
// axis ax, core radius rho, drifting along the axis at fwd, the core turning at swirl.
function vortex(fx, c, ax, R, rho, n, fwd, swirl, life, s0, s1, col, a, o) {
  U.set(Math.abs(ax.y) < 0.9 ? 0 : 1, Math.abs(ax.y) < 0.9 ? 1 : 0, 0).cross(ax).normalize();
  W.crossVectors(ax, U);
  for (let i = 0; i < n; i++) {
    const phi = ((i + rand()) / n) * TAU, th = rand() * TAU;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const ex = U.x * cp + W.x * sp, ey = U.y * cp + W.y * sp, ez = U.z * cp + W.z * sp;
    const rad = R + rho * Math.cos(th), al = rho * Math.sin(th);
    const vr = swirl * Math.sin(th), va = fwd - swirl * Math.cos(th);
    fx.addSmoke(o.kind ?? SMOKE.PUFF, c.x + ex * rad + ax.x * al, c.y + ey * rad + ax.y * al, c.z + ez * rad + ax.z * al, ex * vr + ax.x * va, ey * vr + ax.y * va, ez * vr + ax.z * va, life * rr(0.8, 1.2), s0 * rr(0.8, 1.2), s1 * rr(0.8, 1.2), col[0] * rr(0.9, 1.1), col[1] * rr(0.9, 1.1), col[2] * rr(0.9, 1.1), a, o);
  }
}

// ---------------------------------------------------------------- muzzle blast
/**
 * A gun firing. p: the muzzle, dir: unit vector along the bore, calibre in inches. Fire, the blast
 * cone of smoke and dust, the dust ring racing out over the ground, grit and leaves, a smoke ring and
 * the cordite cloud that hangs and drifts.
 */
export function gunBlast(fx, p, dir, calibre = 9.2, { night = false } = {}) {
  const big = bigK(calibre), sc = clamp(calibre / 15, 0.16, 1.25) * (1 + 0.4 * big), fa = farScale(fx, p), k8 = Math.pow(sc, 0.8) * fa, ks = Math.sqrt(sc) * Math.sqrt(fa);
  const sL = Math.min(sc, 1.25), sF = Math.min(sc, 1.4); // capped scale for opacity, and for the flash and shock
  const q = lod(fx, p), z = fx.lodZ;
  const gy = fx.ground(p.x, p.z);
  const nb = night ? 1.8 : 1; // the glow pass is turned down by night: put the light back
  const kc = 0.3 + 0.7 * Math.min(sc, 1.4);
  const hgt = Math.max(0, p.y - gy), reach = clamp(1 - hgt / (30 * k8), 0.3, 1);
  const hl = Math.hypot(dir.x, dir.z);
  // horizontal line of fire (straight up: any way)
  const hx = hl > 0.05 ? dir.x / hl : 1, hz = hl > 0.05 ? dir.z / hl : 0;
  const az = Math.atan2(hz, hx);

  // --- fire: a flash, a ball of flame, a fat tongue along the bore and short side jets
  fx.addGlow(FLASH, p.x + dir.x * 2 * k8, p.y + dir.y * 2 * k8, p.z + dir.z * 2 * k8, 0, 0, 0, 0.07, 4 * k8, 10 * k8, 22 * nb, 15 * nb, 7 * nb, 1);
  for (let i = 0; i < cnt(12, q, 4); i++) {
    const f = rr(0.5, 10) * k8;
    fx.addGlow(FLAME, p.x + dir.x * f + rr(-2, 2) * k8, p.y + dir.y * f + rr(-2, 2) * k8, p.z + dir.z * f + rr(-2, 2) * k8, dir.x * rr(12, 40) * ks + rr(-4, 4), dir.y * rr(12, 40) * ks + rr(-3, 4), dir.z * rr(12, 40) * ks + rr(-4, 4), rr(0.12, 0.32), 3 * k8, rr(6, 11) * k8, 15 * nb, 6 * nb, 1.3 * nb, 1, { drag: 2.2 });
  }
  fx.addGlow(SPARK, p.x, p.y, p.z, dir.x, dir.y, dir.z, 0.17, 6 * k8, 9 * k8, 26 * nb, 9 * nb, 2 * nb, 1, { len: 24 * k8, drag: 1e6 });
  fx.addGlow(SPARK, p.x, p.y, p.z, dir.x, dir.y, dir.z, 0.1, 3.4 * k8, 5 * k8, 50 * nb, 30 * nb, 10 * nb, 1, { len: 13 * k8, drag: 1e6 });
  for (let i = 0; i < 3; i++) {
    V.set(dir.z, 0, -dir.x).normalize().multiplyScalar(i === 0 ? 1 : i === 2 ? -1 : 0);
    if (i === 1) V.set(0, 1, 0);
    AX.copy(dir).multiplyScalar(0.5).add(V).normalize();
    fx.addGlow(SPARK, p.x, p.y, p.z, AX.x, AX.y, AX.z, 0.1, 2.2 * k8, 2.6 * k8, 36 * nb, 14 * nb, 4 * nb, 1, { len: 9 * k8, drag: 1e6 });
  }
  for (let i = 0; i < cnt(34 * sc, q, 8); i++) {
    V.copy(dir).multiplyScalar(rr(30, 95)).add(rdir(W).multiplyScalar(rr(4, 22)));
    fx.addGlow(SPARK, p.x + dir.x * 2, p.y + dir.y * 2, p.z + dir.z * 2, V.x, V.y, V.z, rr(0.25, 0.9), 0.1, 0.06, 40 * nb, 18 * nb, 4 * nb, 1, { len: 0.035, drag: 0.7, buoy: -9.8 });
  }
  flash(fx, p, 0xffb070, 6e6 * sF * sF * (night ? 1.3 : 1), 0.18 + 0.3 * sF, 0.006, 30);

  // --- the cloud: a dense mass of many overlapping puffs thrown forward and out. Darker, denser
  // cores (the fireball lights them orange for a few frames), paler and more open at the edge.
  const lifeK = 0.4 + 0.6 * sc, coreA = 0.65 + 0.35 * sL;
  const nCore = cnt(240 * kc, q, 16);
  for (let i = 0; i < nCore; i++) {
    const w = Math.pow(rand(), 0.7); // 0 at the heart, 1 at the rim
    rdir(V);
    const along = rr(0, 16) * k8;
    const v = rr(8, 55) * ks * (1 - 0.5 * w);
    const c = 0.13 + 0.3 * w * rr(0.7, 1.1);
    const dusty = rand() < 0.25 * (1 - w) + 0.12;
    const pr = dusty ? 0.3 : c, pg = dusty ? 0.26 : c * 0.95, pb = dusty ? 0.2 : c * 0.88;
    fx.addSmoke(SMOKE.CORDITE, p.x + dir.x * along + V.x * 3.5 * k8 * w, p.y + dir.y * along + V.y * 3 * k8 * w, p.z + dir.z * along + V.z * 3.5 * k8 * w,
      dir.x * v + V.x * rr(3, 13) * ks, dir.y * v + V.y * rr(2, 9) * ks + 2, dir.z * v + V.z * rr(3, 13) * ks,
      rr(7, 14) * lifeK, rr(2.5, 5) * k8 * z, rr(8, 18) * k8 * z * (0.7 + 0.5 * w), pr, pg, pb, (rr(0.72, 0.92) - 0.15 * w) * coreA,
      { drag: rr(1.2, 2.2), buoy: rr(0.6, 1.5), glow: w < 0.5 ? 0.75 : 0, len: 0.22, gy: gy - 2 });
  }
  // the cloud that stays: big soft puffs that roll, thin and drift on the wind for ten to twenty seconds
  // (a small calibre leaves a thinner, shorter hang: a battery firing together should drift, not bank up)
  const hangK = 0.25 + 0.75 * sL * sL, hangLife = 4 + 15 * sc;
  const nHang = cnt(26 * kc * (0.45 + 0.55 * sc), q, 4);
  for (let i = 0; i < nHang; i++) {
    rdir(V);
    fx.addSmoke(SMOKE.HANG, p.x + dir.x * rr(3, 16) * k8 + V.x * 5 * k8, p.y + Math.abs(V.y) * 3 * k8 + dir.y * rr(3, 16) * k8, p.z + dir.z * rr(3, 16) * k8 + V.z * 5 * k8,
      dir.x * rr(2, 9) + V.x * 2, dir.y * rr(1, 5) + 1.5, dir.z * rr(2, 9) + V.z * 2, rr(0.75, 1.15) * hangLife, 8 * k8 * z, rr(24, 46) * k8 * z, 0.34, 0.32, 0.29, 0.34 * hangK, { drag: 0.9, buoy: 0.15 });
  }
  // a smoke ring leaves the muzzle along the bore
  vortex(fx, V.copy(dir).multiplyScalar(6 * k8).add(p), dir, 2 * k8, 1 * k8, cnt(26, q, 10), 28 * ks, 5 * ks, 3 + 4 * sc, 1 * k8, 3.4 * k8 * z, [0.42, 0.4, 0.37], 0.55, { drag: 0.55, buoy: 0.12, kind: SMOKE.CORDITE });

  // --- the ground: a fan of dust kicked off the ground in a wedge ahead of the muzzle, and a ring all round
  const nFan = cnt(110 * kc, q, 14);
  for (let i = 0; i < nFan; i++) {
    const a = az + rr(-0.95, 0.95) * rr(0.5, 1), v = rr(14, 58) * ks * reach * (1.15 - Math.abs(a - az) * 0.4);
    const out = rr(0, 14) * k8;
    fx.addSmoke(SMOKE.PUFF, p.x + hx * out + Math.cos(a) * 2, gy, p.z + hz * out + Math.sin(a) * 2, Math.cos(a) * v, rr(0.3, 1), Math.sin(a) * v, rr(4, 7), 2.5 * k8 * z, rr(7, 15) * k8 * z, rr(0.28, 0.36), rr(0.24, 0.3), rr(0.18, 0.23), 0.55, { drag: rr(0.6, 1), hug: 0.5 });
  }
  const nRing = cnt(60 * kc, q, 12);
  for (let i = 0; i < nRing; i++) {
    const a = ((i + rand()) / nRing) * TAU, v = rr(18, 40) * Math.pow(sc, 0.55) * (1 + 0.5 * Math.cos(a - az)) * reach;
    fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * 3 * k8, gy, p.z + Math.sin(a) * 3 * k8, Math.cos(a) * v, 0.5, Math.sin(a) * v, rr(4, 7), 3 * k8 * z, rr(9, 16) * k8 * z, 0.32, 0.27, 0.21, 0.45, { drag: rr(0.7, 1.1), hug: 0.5, stretch: [1.9, 0.62] });
  }
  // dust the blast lifts off the ground close in, boiling up through the cloud
  for (let i = 0; i < cnt(60 * kc, q, 8); i++) {
    const a = rand() * TAU, r = rr(1, 13) * k8;
    fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * r, gy + 0.6, p.z + Math.sin(a) * r, Math.cos(a) * rr(5, 14) + hx * 10, rr(4, 14) * ks, Math.sin(a) * rr(5, 14) + hz * 10, rr(6, 13), 3 * k8, rr(12, 26) * k8 * z, 0.3, 0.26, 0.2, 0.55, { drag: 0.8, buoy: 0.5 });
  }
  // grit and leaves flicked up from the ground round the gun
  for (let i = 0; i < cnt(70 * sc, q, 8); i++) {
    const a = az + rr(-1.4, 1.4), r = rr(2, 14) * k8, v = rr(10, 38) * ks;
    fx.clods.add(CLOD.EARTH, p.x + Math.cos(a) * r, gy + 0.3, p.z + Math.sin(a) * r, Math.cos(a) * v, rr(6, 18) * ks, Math.sin(a) * v, rr(0.06, 0.22) * ks, rr(0.1, 0.18), rr(0.08, 0.14), rr(0.05, 0.1), { life: rr(6, 9), drag: 0.3, gy });
  }
  for (let i = 0; i < cnt(50 * sc, q, 6); i++) {
    const a = az + rr(-1.6, 1.6), r = rr(2, 18) * k8, v = rr(8, 30) * ks;
    fx.leaf(p.x + Math.cos(a) * r, gy + 0.4, p.z + Math.sin(a) * r, Math.cos(a) * v, rr(6, 20) * ks, Math.sin(a) * v, rr(0.08, 0.22), gy);
  }

  fx.heatAt(V.copy(dir).multiplyScalar(3 * k8).add(p), 7 * k8, 1.6);
  fx.shockAt(p, 90 + 260 * sc, 340, 0.35 + 0.65 * sF);
  fx.gustAt?.(p, hx, hz, 30 * k8 * reach, 0.6 + 0.4 * sL); // the blast flattening the grass (a hook for the ground cover)

  if (big > 0) {
    // a railway giant: a fireball rolling out ahead of the muzzle, flame licking back over the barrel,
    // and the dust and smoke of the whole emplacement thrown up round it
    for (let i = 0; i < cnt(8 + 10 * big, q, 4); i++) {
      const f = rr(4, 22) * k8;
      fx.addGlow(FLAME, p.x + dir.x * f + rr(-4, 4) * k8, p.y + dir.y * f + rr(-3, 4) * k8, p.z + dir.z * f + rr(-4, 4) * k8, dir.x * rr(10, 30) * ks + rr(-6, 6), dir.y * rr(10, 30) * ks + rr(0, 6), dir.z * rr(10, 30) * ks + rr(-6, 6), rr(0.3, 0.6), 5 * k8, rr(9, 15) * k8, 15 * nb, 6 * nb, 1.3 * nb, 1, { drag: 2, buoy: 2 });
    }
    for (let i = 0; i < cnt(40 * big + 20, q, 8); i++) {
      const a = rand() * TAU, r = rr(4, 26) * k8, v = rr(10, 30) * ks;
      fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * r, gy + 0.5, p.z + Math.sin(a) * r, Math.cos(a) * v, rr(3, 10) * ks, Math.sin(a) * v, rr(12, 22), 4 * k8, rr(16, 30) * k8 * z, 0.31, 0.27, 0.21, 0.5, { drag: 0.7, buoy: 0.4 });
    }
  }
}

// Launch speed that makes a drag-and-gravity climb (dv/dt = -D v - g) peak at height h:
// h = v/D - (g/D^2) ln(1 + D v / g), solved by bisection.
function apexSpeed(h, D, g) {
  let lo = Math.sqrt(2 * g * h), hi = D * h + 3 * lo;
  for (let i = 0; i < 14; i++) {
    const v = (lo + hi) * 0.5;
    if (v / D - (g / (D * D)) * Math.log(1 + (D * v) / g) < h) lo = v;
    else hi = v;
  }
  return (lo + hi) * 0.5;
}

// ---------------------------------------------------------------- shell burst
const GROUNDS = {
  // albedos: the smoke shader lights puffs about three times as bright as the albedo in full sun
  mud: { c1: [0.065, 0.047, 0.032], c2: [0.13, 0.092, 0.063], dust: [0.3, 0.255, 0.2], smoke: [0.06, 0.047, 0.038], flash: 1, h: 1, water: false, clod: [0.07, 0.05, 0.035] },
  water: { c1: [0.5, 0.5, 0.47], c2: [0.27, 0.24, 0.2], dust: [0.5, 0.52, 0.52], smoke: [0.3, 0.3, 0.29], flash: 0.35, h: 1.12, water: true, clod: [0.6, 0.62, 0.62] },
  rubble: { c1: [0.3, 0.15, 0.11], c2: [0.2, 0.18, 0.17], dust: [0.4, 0.25, 0.19], smoke: [0.12, 0.095, 0.085], flash: 1.15, h: 0.9, water: false, clod: [0.3, 0.15, 0.11] },
};
GROUNDS.concrete = { ...GROUNDS.rubble, c1: [0.3, 0.29, 0.27], c2: [0.22, 0.21, 0.2], dust: [0.4, 0.39, 0.37], smoke: [0.14, 0.135, 0.13], clod: [0.32, 0.31, 0.29] };
// h: height, w: width, flash, ring: dust ring speed, clod: count, up: how steeply the clods go
const FUZES = {
  impact: { h: 1, w: 1, flash: 1, ring: 1, clod: 1, up: 1 },
  delay: { h: 1.3, w: 0.62, flash: 0.35, ring: 0.7, clod: 0.8, up: 1.15 },
  instant: { h: 0.5, w: 1.5, flash: 1.6, ring: 1.3, clod: 1.2, up: 0.55 },
};

/**
 * A high-explosive shell bursting on the ground. p: the point of impact. calibre in inches (2.95 to
 * 15). ground: 'mud' | 'water' | 'rubble' | 'concrete'. fuze: 'impact' | 'delay' | 'instant'.
 * crater: a hole was dug (the lip then sheds more earth).
 */
export function shellBurst(fx, p, { calibre = 9.2, fuze = 'impact', ground = 'mud', crater = true } = {}) {
  const big = bigK(calibre), sc = clamp(calibre / 15, 0.14, 1.25) * (1 + 0.45 * big), fa = farScale(fx, p), k8 = Math.pow(sc, 0.8) * fa, ks = Math.sqrt(sc) * Math.sqrt(fa);
  const sF = Math.min(sc, 1.4); // capped scale for the flash and the shock
  const q = lod(fx, p), z = fx.lodZ;
  const gy = fx.ground(p.x, p.z), y0 = Math.abs(p.y - gy) < 4 ? gy : p.y;
  const G = GROUNDS[ground] || GROUNDS.mud, FZ = FUZES[fuze] || FUZES.impact;
  const kc = 0.3 + 0.7 * Math.min(sc, 1.4); // counts: a giant gets bigger pieces, not ever more of them
  const x = p.x, zz = p.z;

  // --- the flash and fireball, inside the rising earth
  const fl = G.flash * FZ.flash * (G.water ? 0.5 : 1);
  fx.addGlow(FLASH, x, y0 + 3 * k8, zz, 0, 0, 0, 0.1 + 0.04 * fl, 10 * k8 * fl, 32 * k8 * fl, 70, 48, 22, 1);
  for (let i = 0; i < cnt(7 * fl, q, ground === 'water' ? 1 : 3); i++) {
    rdir(V);
    fx.addGlow(FLAME, x + V.x * 3 * k8, y0 + 1.5 * k8, zz + V.z * 3 * k8, V.x * rr(10, 26) * ks, rr(8, 30) * ks, V.z * rr(10, 26) * ks, rr(0.35, 0.8), 4 * k8, rr(10, 17) * k8 * fl, 20, 8, 2, 1, { drag: 2.2 });
  }
  flash(fx, V.set(x, y0 + 4 * k8, zz), 0xff9a50, 1.3e7 * sF * sF * fl, 0.25 + 0.35 * sF, 0.03);

  // --- the geyser: earth thrown up the column at speeds that top out at the burst's height, falling back
  const H = 115 * k8 * FZ.h * G.h * (1 + 0.25 * big), g = 9.8, w = FZ.w;
  const R0 = 4.5 * k8 * w;
  const nG = cnt(230 * kc, q, 12);
  const nBlack = ground === 'water' ? 0 : 1;
  for (let i = 0; i < nG; i++) {
    const u = (i + rand()) / nG;
    const ha = H * (0.1 + 0.9 * Math.pow(u, 0.85)) * (u > 0.96 ? 1.18 : 1); // apex height of this lump
    const D = rr(0.8, 1.4); // drag: light dust stops early and hangs, heavy lumps climb and fall
    const vy = apexSpeed(ha * (0.7 + 0.3 * D), D, g);
    const tUp = Math.log(1 + (D * vy) / g) / D;
    const a = rand() * TAU, lat = vy * rr(0.05, 0.23) * w * (1.4 - 0.8 * u), off = R0 * Math.sqrt(rand());
    const mix = rand();
    const r = G.c1[0] + (G.c2[0] - G.c1[0]) * mix, gg = G.c1[1] + (G.c2[1] - G.c1[1]) * mix, b = G.c1[2] + (G.c2[2] - G.c1[2]) * mix;
    const s0 = rr(4, 7) * k8 * w * z;
    const fire = ha < H * 0.35 && !G.water;
    fx.addSmoke(SMOKE.SPRAY, x + Math.cos(a) * off, y0 + 0.5 + rr(0, 3) * k8, zz + Math.sin(a) * off, Math.cos(a) * lat, vy, Math.sin(a) * lat, tUp + 0.8 * ha * D / g, s0, s0 * rr(2.2, 3.1), r, gg, b, G.water ? 0.8 : 0.93, { drag: D, grav: g, glow: fire ? 0.55 : 0, len: 0.22, gy });
  }
  // a fat skirt at the foot: heavy earth thrown low and wide
  const nSk = cnt(90 * kc, q, 8);
  for (let i = 0; i < nSk; i++) {
    const a = rand() * TAU, v = rr(8, 26) * ks * w, ha = rr(4, 30) * k8;
    const mix = rand(), vy = apexSpeed(ha, 1.2, g);
    fx.addSmoke(SMOKE.SPRAY, x + Math.cos(a) * R0, y0 + 0.5, zz + Math.sin(a) * R0, Math.cos(a) * v, vy, Math.sin(a) * v, 1.5 + 0.9 * ha * 1.2 / g + 2, rr(4, 7) * k8 * z, rr(10, 18) * k8 * z, G.c1[0] + (G.c2[0] - G.c1[0]) * mix, G.c1[1] + (G.c2[1] - G.c1[1]) * mix, G.c1[2] + (G.c2[2] - G.c1[2]) * mix, 0.9, { drag: 1.2, grav: g, gy });
  }
  // the burst's own smoke: black gas rising through and above the earth
  if (nBlack) {
    for (let i = 0; i < cnt(90 * kc, q, 6); i++) {
      rdir(V);
      fx.addSmoke(SMOKE.BLACK, x + V.x * 2 * k8, y0 + 1 + Math.abs(V.y) * 3 * k8, zz + V.z * 2 * k8, V.x * rr(2, 9) * ks, rr(12, 40) * k8 * Math.min(1.3, FZ.h), V.z * rr(2, 9) * ks, rr(11, 24), 5 * k8 * z, rr(22, 40) * k8 * z, G.smoke[0], G.smoke[1], G.smoke[2], 0.8, { drag: 0.55, buoy: 1.1, glow: 0.3, len: 0.45 });
    }
  } else {
    // spray: white droplets and mist hang round the column
    for (let i = 0; i < cnt(30 * kc, q, 6); i++) {
      rdir(V);
      fx.addSmoke(SMOKE.MIST, x + V.x * 3 * k8, y0 + rr(2, H * 0.6), zz + V.z * 3 * k8, V.x * rr(2, 8), rr(5, 20), V.z * rr(2, 8), rr(5, 10), 4 * k8 * z, rr(12, 22) * k8 * z, 0.85, 0.86, 0.86, 0.5, { drag: 0.5, buoy: -3 });
    }
  }

  // --- the shock: a white-grey dust ring racing out over the ground, and a second slower billow
  // the base surge: a low rolling wall of dust, flattened and stretched along the ground
  const nRing = cnt(120 * kc, q, 16);
  for (let i = 0; i < nRing; i++) {
    const a = ((i + rand()) / nRing) * TAU, v = rr(34, 66) * Math.pow(sc, 0.5) * FZ.ring;
    fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * R0, y0, zz + Math.sin(a) * R0, Math.cos(a) * v, 0.4, Math.sin(a) * v, rr(5, 9), 3 * k8 * z, rr(10, 20) * k8 * z * FZ.w, rr(G.dust[0] * 0.95, G.dust[0] * 1.1), G.dust[1], G.dust[2], 0.5, { drag: rr(0.55, 0.9), hug: 0.3, stretch: [2.4, 0.6] });
  }
  const nBill = cnt(40 * kc, q, 8);
  for (let i = 0; i < nBill; i++) {
    const a = ((i + rand()) / nBill) * TAU, v = rr(14, 30) * FZ.ring * ks;
    fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * R0 * 2, y0, zz + Math.sin(a) * R0 * 2, Math.cos(a) * v, rr(0.5, 2), Math.sin(a) * v, rr(8, 14), 5 * k8 * z, rr(18, 32) * k8 * z, G.dust[0] * 0.8, G.dust[1] * 0.8, G.dust[2] * 0.8, 0.4, { drag: 0.45, buoy: 0.3, hug: 0.6 });
  }

  // --- clods on ballistic arcs, raining back over a wide area; bricks and splinters on rubble
  const nC = G.water ? cnt(60 * kc, q, 6) : cnt(260 * kc * FZ.clod, q, 14);
  const vmax = 78 * Math.pow(sc, 0.5);
  for (let i = 0; i < nC; i++) {
    const a = rand() * TAU, el = rr(0.04, 0.85) * FZ.up + (fuze === 'instant' ? 0.6 : 0), s = Math.sin(el), c = Math.cos(el);
    const v = rr(0.25, 1) * vmax * (el > 0.5 ? 0.8 : 1);
    const big = rand() < 0.1;
    const m = rand();
    const sz = (G.water ? rr(0.12, 0.3) : rr(0.2, 0.95) * (big ? 1.8 : 1)) * Math.pow(Math.min(sc, 1.4), 0.45) * (ground === 'rubble' ? 0.8 : 1);
    const cr = G.clod[0] * (0.6 + m), cg = G.clod[1] * (0.6 + m), cb = G.clod[2] * (0.6 + m);
    fx.clods.add(G.water ? CLOD.WATER : CLOD.EARTH, x + Math.cos(a) * R0, y0 + 1, zz + Math.sin(a) * R0, Math.cos(a) * s * v, c * v, Math.sin(a) * s * v, sz, cr, cg, cb, { life: 22, drag: 0.05, gy, flat: ground === 'rubble' ? 0.5 : 1 });
  }
  // a few very large pieces tumbling out
  if (!G.water) {
    for (let i = 0; i < cnt(9 * kc, q, 2); i++) {
      const a = rand() * TAU, el = rr(0.5, 1.2), v = rr(18, 42) * ks, m = rand();
      fx.clods.add(CLOD.EARTH, x + Math.cos(a) * R0, y0 + 1, zz + Math.sin(a) * R0, Math.cos(a) * Math.sin(el) * v, Math.cos(el) * v * 1.2 + 8, Math.sin(a) * Math.sin(el) * v, rr(1.6, 3.2) * k8, G.clod[0] * (0.6 + m), G.clod[1] * (0.6 + m), G.clod[2] * (0.6 + m), { life: 30, drag: 0.02, gy });
    }
  }
  // fragments, hot and fast: short streaks, more of them on a quick-fuzed shell
  const nF = cnt((fuze === 'instant' ? 50 : 16) * kc, q, 5);
  for (let i = 0; i < nF; i++) {
    rdir(V);
    const v = rr(70, 190);
    fx.addGlow(SPARK, x, y0 + 1, zz, V.x * v, Math.abs(V.y) * v * (fuze === 'instant' ? 0.35 : 1) + 12, V.z * v, rr(0.2, 0.55), 0.2, 0.1, 40, 20, 6, 1, { len: 0.04, drag: 0.5, buoy: -9.8 });
  }

  // --- the timed parts: the base surge as the column falls, then the smoke column over the crater
  const Tup = 2.6 * Math.sqrt(H / 100);
  const surgeCol = G.dust;
  fx.emitters.add(6, Tup * 0.35, 0, 0, x, y0, zz, sc * Math.pow(fa, 1.25), H, G.smoke[0] * 1.3, G.smoke[1] * 1.3, G.smoke[2] * 1.3, q); // the cauliflower head
  fx.emitters.add(2, Tup * 0.95, 0, 0, x, y0, zz, sc * Math.pow(fa, 1.25), FZ.w, surgeCol[0], surgeCol[1], surgeCol[2], q);
  const colDur = (G.water ? 8 : 14 + 40 * Math.min(sc, 1.35)) * (q < 0.6 ? 0.7 : 1);
  fx.emitters.add(1, 0.5, colDur, (G.water ? 2 : 2.5 + 8 * Math.min(sc, 1.4)) * q, x, y0, zz, sc * Math.pow(fa, 1.25), G.water ? 1 : 0, G.smoke[0], G.smoke[1], G.smoke[2], FZ.h);

  fx.shockAt(V.set(x, y0 + 2, zz), 120 + 600 * sc, 343, 0.3 + 1.0 * sF * (fuze === 'delay' ? 0.8 : 1));

  if (big > 0) bigBurst(fx, x, y0, zz, big, sc, k8, ks, q, z, H, Tup, G, FZ, fa, gy);
}

// What only the WW2 giants add (a 7 t Gustav shell threw earth and rock several hundred metres): a
// second, faster dust ring racing out far past the first, boulders, a rolling dark mushroom head over
// the column and a wider second base surge as it falls back.
function bigBurst(fx, x, y0, zz, big, sc, k8, ks, q, z, H, Tup, G, FZ, fa, gy) {
  const R0 = 4.5 * k8 * FZ.w;
  const nRing = cnt(60 + 70 * big, q, 16);
  for (let i = 0; i < nRing; i++) {
    const a = ((i + rand()) / nRing) * TAU, v = rr(70, 120) * Math.sqrt(sc) * FZ.ring;
    fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * R0 * 1.5, y0, zz + Math.sin(a) * R0 * 1.5, Math.cos(a) * v, 0.4, Math.sin(a) * v, rr(7, 12), 4 * k8 * z, rr(16, 30) * k8 * z, G.dust[0], G.dust[1], G.dust[2], 0.45, { drag: rr(0.5, 0.75), hug: 0.3, stretch: [2.6, 0.55] });
  }
  if (!G.water) {
    // (few: every lump over 0.7 m trails dust puffs all the way, clods.js)
    for (let i = 0; i < cnt(4 + 6 * big, q, 2); i++) {
      const a = rand() * TAU, el = rr(0.35, 1.25), v = rr(35, 80) * Math.sqrt(sc), m = rand();
      fx.clods.add(CLOD.EARTH, x + Math.cos(a) * R0, y0 + 2, zz + Math.sin(a) * R0, Math.cos(a) * Math.sin(el) * v, Math.cos(el) * v + 10, Math.sin(a) * Math.sin(el) * v, rr(1.8, 3.4) * Math.sqrt(fa), G.clod[0] * (0.6 + m), G.clod[1] * (0.6 + m), G.clod[2] * (0.6 + m), { life: 40, drag: 0.015, gy });
    }
  }
  const s = sc * Math.pow(fa, 1.25);
  fx.emitters.add(7, Tup * 0.55, 0, 0, x, y0, zz, s, H, G.smoke[0] * 1.3, G.smoke[1] * 1.3, G.smoke[2] * 1.3, q);
  fx.emitters.add(2, Tup * 1.5, 0, 0, x, y0, zz, s * 1.15, FZ.w * 1.6, G.dust[0], G.dust[1], G.dust[2], q);
}

// ---------------------------------------------------------------- shrapnel
/**
 * A shrapnel shell bursting in the air: the white woolly ball with the cone of balls and smoke
 * thrown down along the line of flight. dir: the shell's direction (default: down).
 */
export function shrapnel(fx, p, calibre = 4.5, dir = null) {
  const sc = clamp(calibre / 15, 0.14, 1), k6 = Math.pow(sc, 0.6);
  const q = lod(fx, p), z = fx.lodZ;
  const gy = fx.ground(p.x, p.z), h = Math.max(1, p.y - gy);
  const d = dir ? AX.copy(dir).normalize() : AX.set(0.2, -1, 0.1).normalize();
  const rB = (4 + 10 * k6) * farScale(fx, p);
  fx.addGlow(FLASH, p.x, p.y, p.z, 0, 0, 0, 0.09, 4 * rB * 0.4, 9 * rB * 0.4, 70, 56, 34, 1);
  flash(fx, p, 0xffe0b0, 3e6 * sc, 0.12, 0.02);
  const n = cnt(20, q, 7);
  for (let i = 0; i < n; i++) {
    rdir(V);
    const f = Math.pow(rand(), 0.6);
    // a ball, stretched along the line of flight and drawn out into a cone below the burst
    const along = rr(0, 1) < 0.35 ? rr(6, 22) * k6 : rr(-2, 6) * k6;
    fx.addSmoke(SMOKE.FLAK, p.x + V.x * rB * 0.3 * f, p.y + V.y * rB * 0.3 * f, p.z + V.z * rB * 0.3 * f, V.x * rr(5, 13) * k6 + d.x * along, V.y * rr(5, 13) * k6 + d.y * along, V.z * rr(5, 13) * k6 + d.z * along, rr(14, 28), rB * 0.4 * z, rB * rr(0.8, 1.35) * z, 0.92, 0.91, 0.88, 0.85, { drag: 2.2, buoy: 0.06 });
  }
  // a dusky centre where the charge burst
  for (let i = 0; i < cnt(5, q, 2); i++) {
    rdir(V);
    fx.addSmoke(SMOKE.FLAK, p.x + V.x * 1.5, p.y + V.y * 1.5, p.z + V.z * 1.5, V.x * 6, V.y * 6, V.z * 6, rr(8, 14), rB * 0.3 * z, rB * 0.7 * z, 0.5, 0.48, 0.44, 0.5, { drag: 2 });
  }
  // the balls: streaks down the cone for a blink, then dust pocking the ground where they land
  for (let i = 0; i < cnt(36, q, 8); i++) {
    rdir(V).multiplyScalar(0.35).add(d).normalize().multiplyScalar(rr(200, 330));
    fx.addGlow(SPARK, p.x, p.y, p.z, V.x, V.y, V.z, rr(0.05, 0.12), 0.12, 0.08, 14, 12, 9, 0.8, { len: 0.016, drag: 0.1 });
  }
  const tFall = Math.min(1.2, h / 250);
  fx.emitters.add(5, tFall, 0.25, 0, p.x + d.x * (h / Math.max(0.2, -d.y)), gy, p.z + d.z * (h / Math.max(0.2, -d.y)), h * 0.36, sc, d.x, d.z, 0, q);
}

// ---------------------------------------------------------------- cook-off
/**
 * An ammunition dump going up. size ~1 for a stack of a few hundred rounds, up to ~3 for a depot:
 * fireball, a rolling mushroom head on a stem of smoke, rounds flung out trailing sparks and popping
 * in the air and on the ground, more explosions through the pile for a while, and a long fire.
 */
export function cookOff(fx, p, size = 1) {
  const s = clamp(size, 0.4, 3.5) * Math.sqrt(farScale(fx, p)), ss = Math.sqrt(s);
  const q = lod(fx, p), z = fx.lodZ;
  const gy = fx.ground(p.x, p.z), y0 = gy;
  fx.addGlow(FLASH, p.x, y0 + 4 * s, p.z, 0, 0, 0, 0.3, 24 * s, 70 * s, 90, 64, 34, 1);
  fx.addGlow(FLASH, p.x, y0 + 6 * s, p.z, 0, 0, 0, 0.7, 14 * s, 36 * s, 50, 30, 12, 1);
  for (let i = 0; i < cnt(24 * s, q, 8); i++) {
    rdir(V);
    fx.addGlow(FLAME, p.x + V.x * 4 * s, y0 + 3 * s + Math.abs(V.y) * 3 * s, p.z + V.z * 4 * s, V.x * rr(8, 24) * ss, Math.abs(V.y) * rr(10, 36) * ss + 6, V.z * rr(8, 24) * ss, rr(0.9, 2.2), 7 * s, rr(16, 28) * s, 20, 7.5, 1.6, 1, { drag: 1.6, buoy: 2.4 });
  }
  flash(fx, V.set(p.x, y0 + 8 * s, p.z), 0xff9040, 2.6e7 * s * s, 1 + 0.6 * s, 0.02);
  // black smoke boiling up round the fire
  for (let i = 0; i < cnt(40 * s, q, 10); i++) {
    rdir(V);
    fx.addSmoke(SMOKE.BLACK, p.x + V.x * 3 * s, y0 + 2 + Math.abs(V.y) * 3 * s, p.z + V.z * 3 * s, V.x * rr(3, 12) * ss, rr(10, 34) * ss, V.z * rr(3, 12) * ss, rr(14, 30), 6 * s * z, rr(24, 44) * s * z, 0.05, 0.045, 0.04, 0.85, { drag: 0.5, buoy: 1.4, glow: 0.9, len: 1.4 });
  }
  // the blast ring over the ground
  const nR = cnt(44 * ss, q, 12);
  for (let i = 0; i < nR; i++) {
    const a = ((i + rand()) / nR) * TAU, v = rr(36, 66) * ss;
    fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * 6 * s, y0, p.z + Math.sin(a) * 6 * s, Math.cos(a) * v, 0.5, Math.sin(a) * v, rr(6, 11), 4 * s * z, rr(16, 28) * s * z, 0.5, 0.42, 0.33, 0.55, { drag: rr(0.55, 0.85), hug: 0.5 });
  }
  // rounds thrown out: fuzed in the air or popping where they land
  const nRound = cnt(14 * s, q, 6);
  for (let i = 0; i < nRound; i++) {
    const a = rand() * TAU, el = rr(0.15, 1.2), v = rr(24, 70) * ss, c = Math.cos(el), sn = Math.sin(el);
    const air = rand() < 0.4;
    fx.clods.add(CLOD.ROUND, p.x, y0 + 3 * s, p.z, Math.cos(a) * c * v, sn * v * 1.1 + 10, Math.sin(a) * c * v, rr(0.08, 0.24), 0.1, 0.095, 0.09, { life: 12, drag: 0.02, gy, fuse: air ? rr(0.6, 3.2) : 0, flat: 3 });
  }
  // the mushroom: the head rolls up on a stem, the pile keeps exploding, and it burns
  fx.emitters.add(3, 0.3, 0, 0, p.x, y0, p.z, s, 0, 0, 0, 0, q);
  fx.emitters.add(1, 0.2, 2.6 * ss, 26 * s * q, p.x, y0, p.z, s, 2, 0.06, 0.055, 0.05, 1);
  fx.emitters.add(4, 0.9, 5 + 3 * s, (2.2 + 1.6 * s) * Math.max(0.5, q), p.x, y0, p.z, s);
  fx.emitters.add(1, 2, 25 + 12 * s, (2 + 2 * s) * q, p.x, y0, p.z, s * 0.8, 0, 0.1, 0.09, 0.08, 1.5);
  fx.burnSite(p, 1.6 * s, 55 + 25 * s);
  fx.shockAt(V.set(p.x, y0 + 3, p.z), 300 + 500 * s, 343, 0.6 + 0.4 * ss);
}

// one secondary explosion, size s ~1 for a ball of fire a few metres across (also a burning round's pop)
export function pop(fx, x, y, z, s) {
  const q = clamp(fx.lodQ ?? 1, 0.4, 1);
  fx.addGlow(FLASH, x, y + 1, z, 0, 0, 0, 0.1, 3.5 * s, 8 * s, 70, 48, 22, 1);
  for (let i = 0; i < 2; i++) {
    rdir(V);
    fx.addGlow(FLAME, x + V.x * s, y + 1 + Math.abs(V.y) * s, z + V.z * s, V.x * 6 * s, Math.abs(V.y) * 9 * s + 3, V.z * 6 * s, rr(0.35, 0.8), 1.8 * s, 4.5 * s, 18, 7, 1.6, 1, { drag: 2 });
  }
  for (let i = 0; i < Math.max(2, Math.round(4 * q)); i++) {
    rdir(V);
    fx.addSmoke(SMOKE.BLACK, x + V.x * s, y + 1 + Math.abs(V.y) * s, z + V.z * s, V.x * 3 * s, rr(3, 8) * Math.sqrt(s), V.z * 3 * s, rr(5, 10), 2 * s, rr(6, 11) * s, 0.12, 0.11, 0.1, 0.7, { drag: 1, buoy: 0.7, glow: 0.4, len: 0.4 });
  }
  if (s > 1.2) {
    const gy = fx.ground(x, z);
    for (let i = 0; i < 10; i++) {
      const a = rand() * TAU, v = rr(8, 20) * Math.sqrt(s);
      fx.addSmoke(SMOKE.PUFF, x, gy, z, Math.cos(a) * v, 0.3, Math.sin(a) * v, rr(3, 6), 1.5 * s, rr(5, 9) * s, 0.45, 0.38, 0.3, 0.5, { drag: 1, hug: 0.5 });
    }
  }
  rdir(V);
  fx.sparks(U.set(x, y + 1, z), Math.round(6 * s) + 3, 14 * Math.sqrt(s) + 8);
  fx.flashAt(U.set(x, y + 3, z), 0xffa860, 1.5e6 * s, 0.25);
  fx.light(U, 6e4 * s, 0.2, 0xffa060);
}

// ---------------------------------------------------------------- timed emitters
// type 1 COLUMN  a steady feed of smoke from a point: rate/s over dur. a: scale, b: 0 dirty black, 1 pale
//                (water), 2 hard and fast (a cook-off stem); c,d,e: colour; f: height factor
// type 2 SURGE   one-shot: the base surge, a ring of dust where the column falls back (a: scale, b: width)
// type 3 CAP     one-shot: the rolling mushroom head of a cook-off (a: size)
// type 4 POPS    the pile exploding over and over (a: size)
// type 5 POCK    one-shot: dust pocking the ground under a shrapnel burst (a: radius, b: scale)
// type 6 HEAD    one-shot: the dirty cauliflower head of a geyser (a: scale, b: height of the column, c,d,e colour)
export function runEmitter(fx, E, i, dt) {
  const t = E.t[i], x = E.x[i], y = E.y[i], z = E.z[i];
  switch (E.type[i]) {
    case 1: {
      const k = 1 - (t - E.when[i]) / E.dur[i]; // thins out as it goes
      E.acc[i] += E.rate[i] * dt * Math.max(0.15, k);
      const sc = E.a[i], big = E.b[i];
      while (E.acc[i] >= 1) {
        E.acc[i] -= 1;
        const a = rand() * TAU, r = rr(0, 5) * Math.sqrt(sc);
        const col = rr(0.85, 1.15);
        if (big === 2) {
          fx.addSmoke(SMOKE.BLACK, x + Math.cos(a) * r, y + 2, z + Math.sin(a) * r, rr(-3, 3), rr(18, 40) * Math.sqrt(sc), rr(-3, 3), rr(8, 16), 5 * sc, rr(14, 24) * sc, E.c[i] * col, E.d[i] * col, E.e[i] * col, 0.85, { drag: 0.45, buoy: 1.6, glow: 0.7, len: 1.2 });
        } else {
          const w = E.f[i] || 1;
          fx.addSmoke(big ? SMOKE.MIST : SMOKE.BLACK, x + Math.cos(a) * r, y + 1, z + Math.sin(a) * r, rr(-1.5, 1.5), rr(5, 12) * Math.sqrt(sc) * (big ? 0.6 : 1) * Math.min(1.4, w), rr(-1.5, 1.5), rr(22, 50) * (big ? 0.35 : 0.6 + 0.6 * sc), (4 + 4 * sc) * fx.lodZ * 0.8, rr(24, 44) * Math.pow(sc, 0.8) * fx.lodZ * (big ? 0.7 : 1), E.c[i] * col, E.d[i] * col, E.e[i] * col, big ? 0.35 : 0.55, { drag: 0.12, buoy: big ? 0.15 : 0.45, glow: big ? 0 : 0.25, len: 1.5 });
        }
      }
      break;
    }
    case 2: {
      const sc = E.a[i], q = E.f[i], n = cnt(26 * (0.3 + 0.7 * sc), q, 8), k8 = Math.pow(sc, 0.8);
      for (let j = 0; j < n; j++) {
        const a = ((j + rand()) / n) * TAU, v = rr(9, 22) * Math.sqrt(sc) * E.b[i];
        fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * 6 * k8, y, z + Math.sin(a) * 6 * k8, Math.cos(a) * v, rr(0.3, 2), Math.sin(a) * v, rr(8, 15), 6 * k8 * fx.lodZ, rr(22, 40) * k8 * fx.lodZ, E.c[i] * 0.85, E.d[i] * 0.82, E.e[i] * 0.8, 0.5, { drag: 0.5, buoy: 0.25, hug: 0.55 });
      }
      E.type[i] = 0;
      break;
    }
    case 3: {
      const s = E.a[i], q = E.f[i];
      AX.set(0, 1, 0);
      V.set(x, y + 14 * s, z);
      vortex(fx, V, AX, 10 * s, 6.5 * s, cnt(70, q, 24), 34 * Math.sqrt(s), 17 * Math.sqrt(s), 14, 7 * s * fx.lodZ, 22 * s * fx.lodZ, [0.1, 0.085, 0.075], 0.85, { drag: 0.34, buoy: 0.55, glow: 0.9, len: 1.6 });
      V.set(x, y + 8 * s, z);
      vortex(fx, V, AX, 6 * s, 4 * s, cnt(30, q, 10), 26 * Math.sqrt(s), 12 * Math.sqrt(s), 10, 6 * s * fx.lodZ, 16 * s * fx.lodZ, [0.45, 0.38, 0.3], 0.5, { drag: 0.4, buoy: 0.3 });
      E.type[i] = 0;
      break;
    }
    case 6: {
      const sc = E.a[i], k8 = Math.pow(sc, 0.8), q = E.f[i];
      AX.set(0, 1, 0);
      V.set(x, y + E.b[i] * 0.72, z);
      vortex(fx, V, AX, 7 * k8, 5 * k8, cnt(60, q, 18), 12 * Math.sqrt(sc), 11 * Math.sqrt(sc), 10, 5 * k8 * fx.lodZ, 16 * k8 * fx.lodZ, [E.c[i], E.d[i], E.e[i]], 0.9, { drag: 0.45, buoy: 0.15, kind: SMOKE.BLACK });
      E.type[i] = 0;
      break;
    }
    case 4: {
      if (t < E.when[i]) break;
      E.acc[i] += E.rate[i] * dt;
      const s = E.a[i];
      while (E.acc[i] >= 1) {
        E.acc[i] -= 1;
        const a = rand() * TAU, r = rr(0, 12) * Math.sqrt(s), ps = rr(1.1, 2.6) * Math.sqrt(s);
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        pop(fx, px, fx.ground(px, pz), pz, ps);
        for (let j = 0; j < 2; j++) {
          const b = rand() * TAU, el = rr(0.3, 1.3), v = rr(20, 55);
          fx.clods.add(CLOD.ROUND, px, fx.ground(px, pz) + 2, pz, Math.cos(b) * Math.cos(el) * v, Math.sin(el) * v + 8, Math.sin(b) * Math.cos(el) * v, rr(0.08, 0.2), 0.1, 0.095, 0.09, { life: 10, drag: 0.02, gy: y, fuse: rand() < 0.4 ? rr(0.5, 2.5) : 0, flat: 3 });
        }
      }
      break;
    }
    case 7: {
      // the giant's mushroom: a broad dark head rolling over high on the column, and the stem boiling up
      const sc = E.a[i], k8 = Math.pow(sc, 0.8), q = E.f[i], Hc = E.b[i];
      AX.set(0, 1, 0);
      V.set(x, y + Hc * 0.92, z);
      vortex(fx, V, AX, 11 * k8, 7 * k8, cnt(70, q, 24), 7 * Math.sqrt(sc), 10 * Math.sqrt(sc), 24, 7 * k8 * fx.lodZ, 22 * k8 * fx.lodZ, [E.c[i], E.d[i], E.e[i]], 0.88, { drag: 0.4, buoy: 0.3, kind: SMOKE.BLACK });
      for (let j = 0; j < cnt(36, q, 10); j++) {
        const h = rr(0.1, 0.85) * Hc, a = rand() * TAU, r = rr(0, 6) * k8;
        fx.addSmoke(SMOKE.BLACK, x + Math.cos(a) * r, y + h, z + Math.sin(a) * r, rr(-2, 2), rr(4, 12), rr(-2, 2), rr(18, 30), 8 * k8 * fx.lodZ, rr(20, 34) * k8 * fx.lodZ, E.c[i] * 0.8, E.d[i] * 0.8, E.e[i] * 0.8, 0.75, { drag: 0.35, buoy: 0.5 });
      }
      E.type[i] = 0;
      break;
    }
    default:
      if (E.type[i] >= 10) runRocketEmitter(fx, E, i, dt);
      break;
    case 5: {
      // the balls come down in a patch: small spurts of dust, a few ricochet glints
      const r = E.a[i], q = E.f[i], dx = E.c[i], dz = E.d[i], n = cnt(34, q, 8);
      for (let j = 0; j < n; j++) {
        const a = rand() * TAU, rad = r * Math.sqrt(rand());
        const px = x + Math.cos(a) * rad * 1.0 + dx * rad * 0.3, pz = z + Math.sin(a) * rad + dz * rad * 0.3;
        const g = fx.ground(px, pz);
        fx.addSmoke(SMOKE.PUFF, px, g + 0.3, pz, rr(-0.5, 0.5), rr(2, 5), rr(-0.5, 0.5), rr(1.8, 3.6), 1.5, rr(4, 8), 0.5, 0.43, 0.33, 0.6, { drag: 1.2 });
      }
      E.type[i] = 0;
      break;
    }
  }
}

// WW1 German mode effects (DESIGN.md "WW1 German mode"): the Paris Gun's muzzle blast. Owned by the Paris Gun's agent.
import * as THREE from 'three';
import * as art from './artillery.js';
import { SMOKE, FLASH, FLAME, SPARK, rand, rr, clamp, rdir } from './kinds.js';
import { CLOD } from './clods.js';

const TAU = Math.PI * 2;
const V = new THREE.Vector3(), U = new THREE.Vector3(), W = new THREE.Vector3(), S = new THREE.Vector3();
const cnt = (n, q, min = 2) => Math.max(min, Math.round(n * q));

// detail by distance and pool pressure, as the artillery set does it
function lodq(fx, p) {
  const d = fx._cam.distanceTo(p);
  let q = clamp(1.12 - d / 5200, 0.3, 1) * clamp(fx.budget, 0.4, 1.25);
  if (!fx.cheap()) q *= 0.6;
  return q;
}
const farOf = (fx, p) => clamp(1 + (fx._cam.distanceTo(p) - 600) / 1400, 1, 3.2);

/**
 * The Paris Gun firing. p: the muzzle, dir: unit vector along the bore (about 50 to 55 degrees up). opts.night,
 * opts.base (the gun's place on the ground, for the dust thrown off the emplacement; default 18 m back under the
 * line of fire). Some 200 kg of powder behind a 106 kg shell at 1,640 m/s out of a 34 m barrel: the heaviest
 * ordinary blast (the 15-inch's fire, cone, cordite and ground dust, through gunBlast) and then the gun's own: a
 * long jet of flame and incandescent gas along the line of fire, a plume of muzzle gas thrown a hundred metres
 * and more up the line, two smoke rings, the ground under the muzzle and the emplacement lifting in a ring of
 * dust that races out, and a great pale cloud that hangs over the position and drifts with the wind for most of
 * a minute (kept to the long-lived share of the pool). Spawned once; nothing is allocated.
 */
export function parisBlast(fx, p, dir, opts = {}) {
  const night = !!opts.night, nb = night ? 1.8 : 1;
  art.gunBlast(fx, p, dir, 15, { night });
  const q = lodq(fx, p), fa = farOf(fx, p), z = clamp(1 / Math.sqrt(q), 0.9, 1.9) * fa;
  const gy = fx.ground(p.x, p.z);
  const hl = Math.hypot(dir.x, dir.z) || 1, hx = dir.x / hl, hz = dir.z / hl;
  // two directions square to the bore, for the spread of the jet and the plume
  U.set(-hz, 0, hx);
  W.crossVectors(dir, U).normalize();

  // --- the jet: a long white-orange tongue of burning gas along the line of fire, flickering out in a third of a second
  fx.addGlow(SPARK, p.x, p.y, p.z, dir.x, dir.y, dir.z, 0.3, 9 * fa, 13 * fa, 40 * nb, 22 * nb, 7 * nb, 1, { len: 70 * fa, drag: 1e6 });
  fx.addGlow(SPARK, p.x, p.y, p.z, dir.x, dir.y, dir.z, 0.16, 4 * fa, 6 * fa, 70 * nb, 52 * nb, 26 * nb, 1, { len: 42 * fa, drag: 1e6 });
  fx.addGlow(FLASH, p.x + dir.x * 12, p.y + dir.y * 12, p.z + dir.z * 12, 0, 0, 0, 0.12, 12 * fa, 30 * fa, 30 * nb, 20 * nb, 9 * nb, 1);
  for (let i = 0; i < cnt(26, q, 8); i++) {
    const f = Math.pow(rand(), 0.7) * 60, sp = rr(-1, 1) * (2 + f * 0.08), sw = rr(-1, 1) * (2 + f * 0.08);
    const v = rr(60, 160) * (1 - f / 90);
    fx.addGlow(FLAME, p.x + dir.x * f + U.x * sp + W.x * sw, p.y + dir.y * f + U.y * sp + W.y * sw, p.z + dir.z * f + U.z * sp + W.z * sw,
      dir.x * v, dir.y * v, dir.z * v, rr(0.14, 0.38), (3 + f * 0.08) * fa, (9 + f * 0.25) * fa, 16 * nb, 7 * nb, 1.6 * nb, 1, { drag: 3.2 });
  }
  // the burning grains blown out of the bore, on long arcs
  for (let i = 0; i < cnt(60, q, 12); i++) {
    V.copy(dir).multiplyScalar(rr(80, 260)).addScaledVector(rdir(S), rr(5, 40));
    fx.addGlow(SPARK, p.x + dir.x * 3, p.y + dir.y * 3, p.z + dir.z * 3, V.x, V.y, V.z, rr(0.4, 1.4), 0.14, 0.08, 40 * nb, 20 * nb, 5 * nb, 1, { len: 0.05, drag: 0.8, buoy: -9.8 });
  }
  S.copy(p);
  fx.flashAt(S, 0xffc080, 1.6e7 * (night ? 1.3 : 1), 0.45, 60, 9000);
  fx.light(S, 3e4, 0.5, 0xffb070);

  // --- the plume: muzzle gas thrown far up the line of fire, grey-brown at its heart, thinning as it slows
  const nP = cnt(150, q, 24);
  for (let i = 0; i < nP; i++) {
    const f = Math.pow(rand(), 0.8) * 130, w = rand();
    const v = rr(25, 120) * (1 - f / 170), sp = (rr(-1, 1) * (3 + f * 0.12)), sw = (rr(-1, 1) * (3 + f * 0.12));
    const c = 0.2 + 0.22 * w * rr(0.8, 1.15);
    fx.addSmoke(SMOKE.CORDITE, p.x + dir.x * f + U.x * sp + W.x * sw, p.y + dir.y * f + U.y * sp + W.y * sw, p.z + dir.z * f + U.z * sp + W.z * sw,
      dir.x * v + U.x * rr(-4, 4), dir.y * v + rr(0, 4), dir.z * v + U.z * rr(-4, 4),
      rr(9, 18), (4 + f * 0.05) * z, (12 + f * 0.18) * rr(0.8, 1.3) * z, c, c * 0.95, c * 0.88, rr(0.55, 0.8),
      { drag: rr(1.4, 2.4), buoy: rr(0.4, 1.2), glow: f < 25 ? 0.7 : 0, len: 0.3, gy });
  }
  // two smoke rings: a tight one off the muzzle and a wide one well up the line
  ring(fx, 14, 3.5, 1.6, cnt(30, q, 12), 34, 6, 6, 1.4, 4.4, z, p, dir);
  ring(fx, 42, 7, 3, cnt(36, q, 12), 18, 5, 10, 3, 8, z, p, dir);

  // --- the ground: the blast slams down under the muzzle and off the emplacement: a ring of dust racing out
  const base = opts.base ?? S.set(p.x - hx * 18, gy, p.z - hz * 18);
  const bx = base.x, bz = base.z, by = fx.ground(bx, bz);
  const nR = cnt(90, q, 20);
  for (let i = 0; i < nR; i++) {
    const a = ((i + rand()) / nR) * TAU, v = rr(18, 44) * (1 + 0.35 * (Math.cos(a) * hx + Math.sin(a) * hz));
    const t = rr(0.9, 1.1);
    fx.addSmoke(SMOKE.PUFF, bx + Math.cos(a) * 9, by + 0.2, bz + Math.sin(a) * 9, Math.cos(a) * v, rr(0.5, 2), Math.sin(a) * v, rr(7, 12), 3 * z, rr(10, 18) * z, 0.35 * t, 0.3 * t, 0.23 * t, 0.5, { drag: rr(0.5, 0.8), hug: 0.45, stretch: [2.2, 0.6] });
  }
  // dust and leaves shaken off the ground and the camouflage round the gun, boiling up through the cloud
  for (let i = 0; i < cnt(50, q, 10); i++) {
    const a = rand() * TAU, r = rr(2, 22);
    fx.addSmoke(SMOKE.PUFF, bx + Math.cos(a) * r, by + rr(0.5, 4), bz + Math.sin(a) * r, Math.cos(a) * rr(3, 10), rr(4, 12), Math.sin(a) * rr(3, 10), rr(10, 18), 4 * z, rr(14, 26) * z, 0.33, 0.29, 0.22, 0.45, { drag: 0.7, buoy: 0.5, gy: by });
  }
  for (let i = 0; i < cnt(70, q, 10); i++) {
    const a = rand() * TAU, r = rr(4, 26), v = rr(8, 26);
    fx.leaf(bx + Math.cos(a) * r, by + rr(2, 12), bz + Math.sin(a) * r, Math.cos(a) * v, rr(6, 18), Math.sin(a) * v, rr(0.08, 0.22), by);
  }
  for (let i = 0; i < cnt(40, q, 6); i++) {
    const a = rand() * TAU, r = rr(4, 20), v = rr(10, 30);
    fx.clods.add(CLOD.EARTH, bx + Math.cos(a) * r, by + 0.3, bz + Math.sin(a) * r, Math.cos(a) * v, rr(5, 14), Math.sin(a) * v, rr(0.05, 0.16), 0.15, 0.13, 0.1, { life: rr(5, 8), drag: 0.3, gy: by });
  }
  // the base surge a moment later, where the pressure wave comes down off the line of fire (artillery.js type 2)
  fx.emitters.add(2, 0.12, 0, 0, bx, by, bz, 2.2, 1.6, 0.4, 0.36, 0.3, q);

  // --- the cloud that stays: big pale puffs over the position and along the first stretch of the line, drifting
  // with the wind for most of a minute (the long-lived share of the pool, as the rocket set keeps it)
  if (fx.hangN < fx.smoke.max * 0.35) {
    for (let i = 0; i < cnt(34, q, 8); i++) {
      const f = rr(-10, 70), r = rr(0, 14);
      rdir(V);
      fx.addSmoke(SMOKE.HANG, p.x + dir.x * f + V.x * r, Math.max(by + 6, p.y + dir.y * f + V.y * r * 0.6), p.z + dir.z * f + V.z * r,
        dir.x * rr(1, 6) + V.x * 1.5, rr(0.5, 2.5), dir.z * rr(1, 6) + V.z * 1.5, rr(35, 55), 12 * z, rr(40, 70) * z, 0.5, 0.48, 0.44, 0.3, { drag: 0.8, buoy: 0.12 });
    }
  }

  S.copy(p);
  fx.heatAt(V.copy(dir).multiplyScalar(8).add(p), 16, 2.4);
  fx.shockAt(S, 700, 343, 1);
  S.set(bx, by + 2, bz);
  fx.shockAt(S, 300, 343, 0.6);
}

// a smoke ring at f metres along the bore: radius R, core rho, n puffs, flying on at fwd m/s and turning at swirl
function ring(fx, f, R, rho, n, fwd, swirl, life, s0, s1, z, p, dir) {
  for (let i = 0; i < n; i++) {
    const phi = ((i + rand()) / n) * TAU, th = rand() * TAU, cp = Math.cos(phi), sp = Math.sin(phi);
    const ex = U.x * cp + W.x * sp, ey = U.y * cp + W.y * sp, ez = U.z * cp + W.z * sp;
    const rad = R + rho * Math.cos(th), al = f + rho * Math.sin(th);
    const vr = swirl * Math.sin(th), va = fwd - swirl * Math.cos(th);
    fx.addSmoke(SMOKE.CORDITE, p.x + ex * rad + dir.x * al, p.y + ey * rad + dir.y * al, p.z + ez * rad + dir.z * al,
      ex * vr + dir.x * va, ey * vr + dir.y * va, ez * vr + dir.z * va, life * rr(0.8, 1.2), s0 * z * rr(0.8, 1.2), s1 * z * rr(0.8, 1.2),
      0.44, 0.42, 0.39, 0.55, { drag: 0.5, buoy: 0.12 });
  }
}

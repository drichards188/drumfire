import { SMOKE, FLASH, FLAME, SPARK, rand, rr, clamp } from './kinds.js';
import { CLOD } from './clods.js';

// The WW2 rocket set: the Nebelwerfer's launch and smoke trail, the V-1's steam catapult and pulse jet,
// the V-2's two-stage ignition, its flame and its exhaust column. Like the artillery set everything
// spawns into the fx pools and the things that go on (the catapult run, the pre-stage burn) are timed
// emitters (types 11 and 12, run from artillery.js runEmitter), so nothing is allocated while it plays.
//
// Per-frame glows (a motor's flame, which has to follow the missile) live exactly one frame: they are
// spawned with a life of 1.3 dt, so fx.update ages them to t = 0.77 before the one draw, and their
// colours are raised to make up for the fade the glow shader applies at that age (FLASH 1 - t, SPARK
// 1 - t^2). Trails are spaced by the distance flown since the last call, not by frames, so they are
// unbroken at any time compression.

const TAU = Math.PI * 2;
const KF = 4.3, KS = 2.4; // fade make-up for a one-frame FLASH and SPARK (see above)
const S = { x: 0, y: 0, z: 0 }; // scratch point for the hooks (they copy)

// Detail by distance and pool pressure, as the artillery set does it.
function lodq(fx, x, y, z) {
  const c = fx._cam, d = Math.hypot(x - c.x, y - c.y, z - c.z);
  let q = clamp(1.12 - d / 5200, 0.3, 1) * clamp(fx.budget, 0.4, 1.25);
  if (!fx.cheap()) q *= 0.6;
  return q;
}
const farOf = (fx, x, y, z) => clamp(1 + (Math.hypot(x - fx._cam.x, y - fx._cam.y, z - fx._cam.z) - 600) / 1400, 1, 3.2);
const cnt = (n, q, min = 2) => Math.max(min, Math.round(n * q));
// probabilistic rounding: a rate of 0.3 puffs a frame still gives a puff every third frame or so
const draw = (m) => { const n = Math.floor(m); return n + (rand() < m - n ? 1 : 0); };
const hangRoom = (fx) => fx.hangN < fx.smoke.max * 0.35;

// ---------------------------------------------------------------- Nebelwerfer launch
/**
 * One 15 cm Nebelwerfer rocket leaving its tube. p: the tube's mouth, dir: unit vector along the tube
 * (the line of flight). A sharp flash, the rocket's jet forward, the fire out of the open breech end of
 * the tube, and the backblast: a great cloud of dust and grey-white propellant smoke thrown off the
 * ground behind and around the launcher that hangs and drifts on the wind for half a minute (the
 * clouds that gave the positions away). A ripple is six of these 1.6 s apart; the long-lived part is
 * kept to the hang share of the pool, so three launchers rippling together do not crowd out the rest.
 */
export function rocketLaunch(fx, p, dir) {
  const q = lodq(fx, p.x, p.y, p.z), fa = farOf(fx, p.x, p.y, p.z), sf = Math.sqrt(fa);
  const z = clamp(1 / Math.sqrt(q), 0.9, 1.9) * fa; // fewer, bigger puffs at low detail and far off
  const hl = Math.hypot(dir.x, dir.z);
  const hx = hl > 0.05 ? dir.x / hl : 1, hz = hl > 0.05 ? dir.z / hl : 0;
  const back = Math.atan2(-hz, -hx); // the horizontal way the backblast goes
  // the tube's open rear end, and where its jet meets the ground behind
  const bx = p.x - dir.x * 1.3, by = p.y - dir.y * 1.3, bz = p.z - dir.z * 1.3;
  const tHit = dir.y > 0.05 ? clamp((by - fx.ground(bx, bz)) / dir.y, 0.3, 6) : 3;
  const gx = bx - dir.x * tHit, gz = bz - dir.z * tHit, gy = fx.ground(gx, gz);

  // --- fire: the flash at the mouth, the rocket's own jet, the flame out of the back of the tube
  fx.addGlow(FLASH, p.x + dir.x, p.y + dir.y, p.z + dir.z, 0, 0, 0, 0.09, 2 * sf, 5 * sf, 45, 33, 16, 1);
  fx.addGlow(SPARK, p.x, p.y, p.z, dir.x, dir.y, dir.z, 0.12, 0.7 * sf, 1.1 * sf, 50, 30, 10, 1, { len: 6, drag: 1e6 });
  fx.addGlow(FLASH, bx, by, bz, 0, 0, 0, 0.14, 2.5 * sf, 7 * sf, 50, 30, 10, 1);
  fx.addGlow(SPARK, bx, by, bz, -dir.x, -dir.y, -dir.z, 0.2, 1.2 * sf, 2 * sf, 40, 20, 5, 1, { len: tHit + 3, drag: 1e6 });
  for (let i = 0; i < cnt(10, q, 4); i++) {
    const v = rr(12, 40);
    fx.addGlow(FLAME, bx, by, bz, -dir.x * v + rr(-5, 5), -dir.y * v + rr(-2, 5), -dir.z * v + rr(-5, 5), rr(0.2, 0.45), 1.2 * sf, rr(3, 5) * sf, 16, 6.5, 1.4, 1, { drag: 2.5 });
  }
  // the jet fans out over the ground: flame licking along it for a blink
  for (let i = 0; i < cnt(6, q, 3); i++) {
    const a = back + rr(-1.3, 1.3), v = rr(15, 35);
    fx.addGlow(FLAME, gx, gy + 0.6, gz, Math.cos(a) * v, rr(0, 3), Math.sin(a) * v, rr(0.15, 0.35), 1.2 * sf, rr(3, 4.5) * sf, 14, 5.5, 1.2, 1, { drag: 3 });
  }
  S.x = p.x; S.y = p.y + 1; S.z = p.z;
  fx.light(S, 6000, 0.3, 0xffb070);
  fx.flashAt(S, 0xffb070, 2e6, 0.3, 14);

  // --- the backblast: dust kicked off the ground behind and to the sides, rolling out low
  const nDust = cnt(20, q, 6);
  for (let i = 0; i < nDust; i++) {
    const w = rand();
    const a = back + rr(-1, 1) * (0.6 + 1.6 * w); // mostly behind, some all round
    const v = rr(6, 28) * (1.2 - 0.5 * w);
    const r = rr(0, 2.5);
    const t = rr(0.85, 1.1);
    fx.addSmoke(SMOKE.PUFF, gx + Math.cos(a) * r, gy + 0.4, gz + Math.sin(a) * r, Math.cos(a) * v, rr(0.5, 4), Math.sin(a) * v, rr(9, 17), 2.5 * z, rr(9, 16) * z, 0.36 * t, 0.31 * t, 0.24 * t, 0.62, { drag: rr(0.6, 1.1), buoy: rr(0.1, 0.5), gy });
  }
  for (let i = 0; i < cnt(8, q, 3); i++) {
    const a = back + rr(-1.4, 1.4), v = rr(16, 36);
    fx.addSmoke(SMOKE.PUFF, gx, gy, gz, Math.cos(a) * v, 0.4, Math.sin(a) * v, rr(6, 10), 2.5 * z, rr(8, 14) * z, 0.34, 0.29, 0.23, 0.45, { drag: rr(0.7, 1), hug: 0.45, stretch: [1.9, 0.62] });
  }
  // the propellant smoke: grey-white, thick along the jet and boiling up round the launcher
  const nSm = cnt(18, q, 6);
  for (let i = 0; i < nSm; i++) {
    const f = rand(), v = rr(4, 22) * (1 - 0.5 * f);
    const a = back + rr(-1.2, 1.2);
    const c = rr(0.62, 0.78);
    fx.addSmoke(SMOKE.CORDITE, bx - dir.x * tHit * f + rr(-1, 1), by - dir.y * tHit * f + rr(0, 1.5), bz - dir.z * tHit * f + rr(-1, 1),
      Math.cos(a) * v * 0.7 - dir.x * v * 0.5, rr(1, 6), Math.sin(a) * v * 0.7 - dir.z * v * 0.5,
      rr(12, 22), 2.5 * z, rr(11, 19) * z, c, c * 0.99, c * 0.96, 0.62, { drag: rr(0.7, 1.2), buoy: rr(0.3, 0.8), glow: f < 0.3 ? 0.4 : 0, len: 0.2, gy });
  }
  // the rocket's own exhaust as it leaves the tube: a short white streamer ahead of the mouth
  for (let i = 0; i < cnt(5, q, 2); i++) {
    const f = rr(0, 9);
    fx.addSmoke(SMOKE.TRAIL, p.x + dir.x * f, p.y + dir.y * f, p.z + dir.z * f, dir.x * 3 + rr(-1.5, 1.5), dir.y * 3 + rr(-1, 1.5), dir.z * 3 + rr(-1.5, 1.5), rr(10, 16), 0.8 * sf, rr(4, 7) * sf, 0.86, 0.86, 0.85, 0.55, { drag: 0.9, buoy: 0.1 });
  }
  // what hangs: broad soft puffs over the position, 30 to 45 s, kept to the hang share of the pool
  if (hangRoom(fx)) {
    for (let i = 0; i < cnt(8, q, 3); i++) {
      const a = back + rr(-1.8, 1.8), r = rr(2, 14);
      const c = rr(0.62, 0.72);
      fx.addSmoke(SMOKE.HANG, gx + Math.cos(a) * r, gy + rr(2, 6), gz + Math.sin(a) * r, Math.cos(a) * rr(1, 4), rr(0.5, 2), Math.sin(a) * rr(1, 4), rr(30, 45), 7 * z, rr(24, 34) * z, c, c * 0.98, c * 0.94, 0.45, { drag: 0.8, buoy: 0.12, gy });
    }
  }
  // grit and stones thrown back
  for (let i = 0; i < cnt(14, q, 4); i++) {
    const a = back + rr(-1, 1), v = rr(8, 24);
    fx.clods.add(CLOD.EARTH, gx, gy + 0.3, gz, Math.cos(a) * v, rr(3, 10), Math.sin(a) * v, rr(0.05, 0.16), 0.14, 0.11, 0.08, { life: rr(5, 8), drag: 0.3, gy });
  }
  S.x = gx; S.y = gy + 1; S.z = gz;
  fx.shockAt(S, 70, 343, 0.3);
  fx.gustAt?.(S, -hx, -hz, 16, 0.7);
}

// ---------------------------------------------------------------- trails
/**
 * One frame of a rocket or missile in flight. pos: the nozzle (the tail pipe's mouth on the V-1), vel
 * its velocity (m/s; on the ramp or the table pass a tiny vector the way it points), kind 'rocket' |
 * 'v1' | 'v2', dt: game seconds since the last call (0: nothing is added, the last frame's flame stays).
 */
export function trail(fx, pos, vel, kind, dt) {
  if (!(dt > 0)) return;
  const sp = Math.hypot(vel.x, vel.y, vel.z);
  // the way the exhaust leaves (backward); a rocket standing still points up
  let ux = 0, uy = -1, uz = 0;
  if (sp > 1e-4) { ux = -vel.x / sp; uy = -vel.y / sp; uz = -vel.z / sp; }
  const c = fx._cam, d = Math.hypot(pos.x - c.x, pos.y - c.y, pos.z - c.z);
  const far = 1 + Math.min(7, d / 600), sf = Math.sqrt(far);
  const bud = clamp(fx.budget, 0.5, 1.25) * (fx.cheap() ? 1 : 0.5);
  const life = dt * 1.3 + 0.002;
  const step = sp * dt; // metres flown since the last call
  if (kind === 'v1') v1Trail(fx, pos, vel, sp, ux, uy, uz, d, far, sf, bud, life, step, dt);
  else if (kind === 'v2') v2Trail(fx, pos, vel, sp, ux, uy, uz, d, far, sf, bud, life, step, dt);
  else rocketTrail(fx, pos, vel, sp, ux, uy, uz, d, far, sf, bud, life, step, dt);
}

// Puffs go down at fixed marks along the line of flight: the marks are multiples of gap in the
// position projected on the direction of flight, so without any state per missile they are evenly
// spaced at every frame rate and time compression (a random count per frame leaves random gaps).
// marks() returns how many marks the missile passed since the last call (at most max); at() puts
// puff j on its mark and age() ages it to match.
const P = { x: 0, y: 0, z: 0, u: 0, s: 0, gap: 1, step: 1, n: 0 };
function marks(pos, ux, uy, uz, step, gap, max) {
  if (!(step > 0)) return 0;
  const s = -(pos.x * ux + pos.y * uy + pos.z * uz); // distance along the flight direction
  const n = Math.floor(s / gap) - Math.floor((s - step) / gap);
  P.s = s; P.gap = gap; P.step = step; P.n = n;
  return Math.min(n, max);
}
function at(pos, vel, dt, j, n) {
  // on its mark when all fit, else spread evenly over the path
  const u = P.n === n ? (P.s - (Math.floor(P.s / P.gap) - j) * P.gap) / P.step : (j + 0.5) / n;
  P.u = u; P.x = pos.x - vel.x * dt * u; P.y = pos.y - vel.y * dt * u; P.z = pos.z - vel.z * dt * u;
  return P;
}
const age = (fx, k, dt) => { if (k !== undefined && fx.smoke.life[k] > dt) fx.smoke.age[k] = P.u * dt * 0.9; };

// The 15 cm rocket while its motor burns (about 1.8 s): a bright exhaust and a thick white trail
// that hangs and drifts. Cheap enough for 18 at once: 2 glows and about one puff per 4 m a frame.
function rocketTrail(fx, pos, vel, sp, ux, uy, uz, d, far, sf, bud, life, step, dt) {
  const g = Math.max(1, (d * 0.0035) / 0.7); // a far exhaust stays a few pixels across
  fx.addGlow(FLASH, pos.x, pos.y, pos.z, 0, 0, 0, life, 1.1 * g, 1.4 * g, 40 * KF, 28 * KF, 12 * KF, 1);
  fx.addGlow(SPARK, pos.x, pos.y, pos.z, ux, uy, uz, life, 0.5 * g, 0.6 * g, 34 * KS, 16 * KS, 4 * KS, rr(0.8, 1), { len: rr(4, 6) * Math.min(g, 3), drag: 1e6 });
  // young puffs as wide as their spacing, so the trail is unbroken right behind the rocket
  const gap = (4.2 * far) / bud, s0 = Math.max(2.4 * sf, gap * 1.45); // a puff fills about 0.6 of its quad
  const n = marks(pos, ux, uy, uz, step, gap, 24);
  for (let j = 0; j < n; j++) {
    const p = at(pos, vel, dt, j, n);
    age(fx, fx.addSmoke(SMOKE.TRAIL, p.x + rr(-0.3, 0.3), p.y + rr(-0.3, 0.3), p.z + rr(-0.3, 0.3), vel.x * 0.03 + rr(-0.8, 0.8), vel.y * 0.03 + rr(-0.4, 1), vel.z * 0.03 + rr(-0.8, 0.8), rr(13, 22), s0, s0 + rr(4, 7) * sf, 0.86, 0.86, 0.85, 0.5, { drag: 0.8, buoy: 0.06 }), dt);
  }
}

// The V-1's Argus pulse jet: a flame out of the tail pipe pulsing (the real one fires about 47 times
// a second; drawn as a visible throb with a flicker on it), blue-white at the root, and a thin grey
// trail. pos: the tail pipe's mouth.
function v1Trail(fx, pos, vel, sp, ux, uy, uz, d, far, sf, bud, life, step, dt) {
  const g = Math.max(1, (d * 0.0035) / 0.9);
  const ph = fx.time * TAU * 7.3;
  const pulse = (0.62 + 0.38 * (0.5 + 0.5 * Math.sin(ph + 2 * Math.sin(ph * 0.37)))) * rr(0.82, 1.15);
  const L = rr(3, 4.6) * pulse * Math.min(g, 3);
  fx.addGlow(SPARK, pos.x, pos.y, pos.z, ux, uy, uz, life, 0.55 * g, 0.65 * g, 36 * KS * pulse, 15 * KS * pulse, 3.5 * KS * pulse, 1, { len: L, drag: 1e6 });
  fx.addGlow(SPARK, pos.x, pos.y, pos.z, ux, uy, uz, life, 0.2 * g, 0.24 * g, 14 * KS, 18 * KS, 34 * KS, pulse, { len: L * 0.35, drag: 1e6 });
  fx.addGlow(FLASH, pos.x + ux * 0.5, pos.y + uy * 0.5, pos.z + uz * 0.5, 0, 0, 0, life, 0.7 * g, 1 * g, 24 * KF * pulse, 11 * KF * pulse, 3 * KF * pulse, 1);
  const n = marks(pos, ux, uy, uz, step, (6 * far) / bud, 16);
  for (let j = 0; j < n; j++) {
    const p = at(pos, vel, dt, j, n);
    age(fx, fx.addSmoke(SMOKE.TRAIL, p.x + rr(-0.2, 0.2), p.y + rr(-0.2, 0.2), p.z + rr(-0.2, 0.2), vel.x * 0.02 + rr(-0.4, 0.4), vel.y * 0.02 + rr(-0.2, 0.4), vel.z * 0.02 + rr(-0.4, 0.4), rr(5, 9), 0.5 * sf, rr(2, 3.4) * sf, 0.4, 0.4, 0.4, 0.34, { drag: 0.8, buoy: 0.05 }), dt);
  }
}

// The A4: a long bright flame and a dense white column low down that thins with height. While the
// nozzle is within 160 m of the ground the jet also blasts the pad: dust and steam race out over the
// ground and boil up round it (so the base cloud follows the real climb; keep calling it from the
// main stage's ignition on, while it still stands on the table). pos: the nozzle.
function v2Trail(fx, pos, vel, sp, ux, uy, uz, d, far, sf, bud, life, step, dt) {
  const gy = fx.ground(pos.x, pos.z), h = Math.max(0, pos.y - gy);
  const g = Math.max(1, (d * 0.0035) / 2.2);
  // the flame: a white-yellow core in an orange sheath, longer and wider as the air thins
  const thin = Math.min(1.5, h / 9000);
  const L = (12 + 14 * thin) * rr(0.9, 1.1) * Math.min(g, 4), w = (1.1 + 1.8 * thin) * g;
  fx.addGlow(SPARK, pos.x, pos.y, pos.z, ux, uy, uz, life, w * 1.6, w * 1.8, 44 * KS, 20 * KS, 5 * KS, 1, { len: L, drag: 1e6 });
  fx.addGlow(SPARK, pos.x, pos.y, pos.z, ux, uy, uz, life, w * 0.75, w * 0.8, 70 * KS, 60 * KS, 38 * KS, 1, { len: L * 0.6, drag: 1e6 });
  fx.addGlow(FLASH, pos.x + ux * 1.5, pos.y + uy * 1.5, pos.z + uz * 1.5, 0, 0, 0, life, 2.4 * g, 3.2 * g, 60 * KF, 50 * KF, 30 * KF, 1);
  if (h < 5000) {
    S.x = pos.x + ux * 4; S.y = pos.y + uy * 4; S.z = pos.z + uz * 4;
    const k = 1 - h / 5000;
    fx.flashAt(S, 0xffe6b0, 8e6 * k, life * 1.5, 20, 5000);
    if (d < 3000) fx.light(S, 4e4 * k, life * 1.5, 0xffe0a0);
  }
  // the column: white, broad and dense low down, thinner up high; spaced wider far off and at height
  const fh = clamp(1 - h / 7000, 0.2, 1);
  const gap = ((3 + h / 500) * far) / bud, s0 = Math.max(3 * fh * sf, gap * 1.9); // a puff fills about 0.6 of its quad
  const n = marks(pos, ux, uy, uz, step, gap, 24);
  for (let j = 0; j < n; j++) {
    const p = at(pos, vel, dt, j, n);
    age(fx, fx.addSmoke(SMOKE.TRAIL, p.x + rr(-0.6, 0.6) * fh, p.y + rr(-0.6, 0.6), p.z + rr(-0.6, 0.6) * fh, vel.x * 0.015 + rr(-1, 1), vel.y * 0.015 + rr(-0.5, 1), vel.z * 0.015 + rr(-1, 1), rr(25, 45) * (0.5 + 0.5 * fh), s0, s0 + rr(6, 12) * fh * sf, 0.92, 0.92, 0.93, 0.3 + 0.35 * fh, { drag: 0.6, buoy: 0.05 }), dt);
  }
  // a broad hanging band through the lower kilometres (the column that stood over the site for minutes)
  if (h < 3000 && hangRoom(fx)) {
    const m = marks(pos, ux, uy, uz, step, (14 * far) / bud, 6);
    for (let j = 0; j < m; j++) {
      const p = at(pos, vel, dt, j, m);
      age(fx, fx.addSmoke(SMOKE.HANG, p.x + rr(-2, 2), p.y + rr(-2, 2), p.z + rr(-2, 2), rr(-0.5, 0.5), rr(0, 0.6), rr(-0.5, 0.5), rr(60, 90), 6 * sf, rr(18, 28) * sf * fh, 0.9, 0.9, 0.91, 0.28, { drag: 0.6, buoy: 0.03 }), dt);
    }
  }
  if (h < 160) padBlast(fx, pos.x, gy, pos.z, h, dt);
}

// The jet on the firing table and the ground under the climbing rocket: flames thrown sideways off the
// cone deflector, dust and steam racing out over the ground and boiling up, weaker as it climbs.
function padBlast(fx, x, gy, z, h, dt) {
  const k = Math.pow(1 - h / 160, 1.5), q = lodq(fx, x, gy, z);
  if (h < 25) {
    const kf = 1 - h / 25, life = dt * 1.3 + 0.002;
    for (let i = 0; i < 3; i++) {
      const a = rand() * TAU;
      fx.addGlow(SPARK, x, gy + 0.8, z, Math.cos(a), 0.08, Math.sin(a), life, 1.4, 1.8, 50 * KS * kf, 34 * KS * kf, 14 * KS * kf, 1, { len: rr(6, 14) * kf, drag: 1e6 });
    }
    fx.addGlow(FLASH, x, gy + 1.5, z, 0, 0, 0, life, 4, 5, 14 * KF * kf, 10 * KF * kf, 4.5 * KF * kf, 1);
  }
  const n = Math.min(12, draw(75 * q * k * dt));
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, v = rr(18, 50) * (0.35 + 0.65 * k), r = rr(1, 4);
    if (rand() < 0.55) {
      const t = rr(0.9, 1.1);
      fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * r, gy + 0.5, z + Math.sin(a) * r, Math.cos(a) * v, rr(0.3, 2), Math.sin(a) * v, rr(9, 16), 3, rr(10, 18), 0.46 * t, 0.41 * t, 0.33 * t, 0.55, { drag: rr(0.5, 0.8), hug: 0.35, stretch: [2, 0.62] });
    } else {
      fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * r, gy + rr(1, 3), z + Math.sin(a) * r, Math.cos(a) * v * 0.5, rr(2, 9), Math.sin(a) * v * 0.5, rr(14, 26), 3, rr(12, 24), 0.92, 0.92, 0.9, 0.5, { drag: rr(0.6, 0.9), buoy: rr(0.6, 1.4), gy });
    }
  }
}

// ---------------------------------------------------------------- V-1 catapult
/**
 * The Walter steam catapult's shot. p: the foot of the ramp (where the steam generator is coupled),
 * dir: unit vector up the ramp, len: the ramp's length (m). A small bang and flash at the foot, a huge
 * billowing white cloud of steam (T-Stoff and Z-Stoff make steam, not smoke) bursting out at the foot
 * and spurting from the slotted tube along the ramp behind the piston as it runs up in about a second,
 * and a last puff where the piston leaves the top. The steam rises, spreads and drifts for half a minute.
 */
export function v1Launch(fx, p, dir, len = 48) {
  const q = lodq(fx, p.x, p.y, p.z), fa = farOf(fx, p.x, p.y, p.z);
  const z = clamp(1 / Math.sqrt(q), 0.9, 1.9) * fa;
  const gy = fx.ground(p.x, p.z);
  fx.addGlow(FLASH, p.x, p.y + 1.2, p.z, 0, 0, 0, 0.07, 1.5, 4, 40, 34, 24, 1);
  S.x = p.x; S.y = p.y + 1.5; S.z = p.z;
  fx.flashAt(S, 0xfff0d8, 1.2e6, 0.15, 10);
  // side vector across the ramp
  const hl = Math.hypot(dir.x, dir.z) || 1, sx = -dir.z / hl, sz = dir.x / hl;
  const n = cnt(56, q, 12);
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, v = rr(5, 22), up = rr(3, 18), f = rr(-4, 10);
    const w = rr(0.92, 1);
    fx.addSmoke(SMOKE.PUFF, p.x + dir.x * f + Math.cos(a) * 2, gy + rr(0.5, 4), p.z + dir.z * f + Math.sin(a) * 2, Math.cos(a) * v - dir.x * rr(0, 8), up, Math.sin(a) * v - dir.z * rr(0, 8), rr(22, 38), rr(7, 11) * z, rr(24, 40) * z, 0.95 * w, 0.95 * w, 0.94 * w, 0.75, { drag: rr(0.55, 0.9), buoy: rr(0.5, 1.2), gy });
  }
  // a low skirt of steam and dust rolling out from the foot
  for (let i = 0; i < cnt(20, q, 6); i++) {
    const a = rand() * TAU, v = rr(10, 26);
    fx.addSmoke(SMOKE.PUFF, p.x, gy, p.z, Math.cos(a) * v, 0.3, Math.sin(a) * v, rr(8, 14), 3 * z, rr(10, 18) * z, 0.82, 0.8, 0.76, 0.5, { drag: 0.8, hug: 0.4, stretch: [1.9, 0.62] });
  }
  if (hangRoom(fx)) {
    for (let i = 0; i < cnt(8, q, 3); i++) {
      const f = rr(0, len * 0.6);
      fx.addSmoke(SMOKE.HANG, p.x + dir.x * f + sx * rr(-6, 6), gy + rr(4, 12), p.z + dir.z * f + sz * rr(-6, 6), rr(-1, 1), rr(1, 3), rr(-1, 1), rr(35, 50), 8 * z, rr(24, 34) * z, 0.93, 0.93, 0.92, 0.35, { drag: 0.7, buoy: 0.15, gy });
    }
  }
  S.x = p.x; S.y = gy + 1; S.z = p.z;
  fx.shockAt(S, 50, 343, 0.2);
  // the run up the ramp
  fx.emitters.add(11, 0, 1.3, 0, p.x, p.y, p.z, dir.x, dir.y, dir.z, len, 0, q);
}

// ---------------------------------------------------------------- V-2 ignition
/**
 * The A4 lighting on its firing table. p: the nozzle's mouth (above the cone deflector). k 0: the
 * pre-stage (Vorstufe, about 8 t, not enough to lift): a smaller yellow-orange flame, sparks, steam and
 * dust blasting off the deflector sideways; it keeps burning (an emitter) until k 1 or 10 s. k 1: the
 * main stage (Hauptstufe): a blinding white-yellow flash, a ground-hugging ring of dust and smoke racing
 * out and a bank of steam off the deflector. From here on the render layer calls trail(pos, vel, 'v2',
 * dt) every frame, also while the rocket still stands on the table (vel ~0): it draws the flame and keeps
 * the pad blasting as the rocket lifts slowly.
 */
export function v2Ignition(fx, p, k = 1) {
  const q = lodq(fx, p.x, p.y, p.z), fa = farOf(fx, p.x, p.y, p.z);
  const z = clamp(1 / Math.sqrt(q), 0.9, 1.9) * fa;
  const gy = fx.ground(p.x, p.z);
  // the pre-stage's emitter stops when the main stage lights
  const E = fx.emitters;
  for (let i = 0; i < E.n; i++) if (E.type[i] === 12 && Math.abs(E.x[i] - p.x) + Math.abs(E.z[i] - p.z) < 30) E.type[i] = 0;
  if (k < 0.5) {
    fx.addGlow(FLASH, p.x, p.y, p.z, 0, 0, 0, 0.25, 2, 6, 50, 34, 12, 1);
    S.x = p.x; S.y = p.y; S.z = p.z;
    fx.flashAt(S, 0xffc070, 3e6, 0.5, 12);
    fx.sparks(S, 14, 22, [30, 16, 4]);
    for (let i = 0; i < cnt(24, q, 8); i++) {
      const a = rand() * TAU, v = rr(5, 16), white = rand() < 0.5;
      fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * 2, gy + rr(0.3, 1.5), p.z + Math.sin(a) * 2, Math.cos(a) * v, rr(0.5, 4), Math.sin(a) * v, rr(10, 18), 2 * z, rr(7, 14) * z, white ? 0.9 : 0.46, white ? 0.9 : 0.4, white ? 0.88 : 0.32, 0.6, { drag: 0.8, buoy: 0.4, gy });
    }
    fx.emitters.add(12, 0, 10, 0, p.x, p.y, p.z, gy, 0, 0, 0, 0, q);
    return;
  }
  // main stage
  fx.addGlow(FLASH, p.x, p.y + 2, p.z, 0, 0, 0, 0.3, 6 * Math.sqrt(fa), 16 * Math.sqrt(fa), 60, 54, 38, 1);
  fx.addGlow(FLASH, p.x, gy + 1, p.z, 0, 0, 0, 0.7, 5, 12, 26, 20, 9, 1);
  S.x = p.x; S.y = p.y + 2; S.z = p.z;
  fx.flashAt(S, 0xfff2d0, 1.3e7, 1.1, 30, 6000);
  fx.light(S, 1.2e5, 1.2, 0xfff0c0);
  fx.sparks(S, 24, 34, [40, 26, 8]);
  // the ring of dust racing out over the ground
  const nR = cnt(110, q, 20);
  for (let i = 0; i < nR; i++) {
    const a = ((i + rand()) / nR) * TAU, v = rr(32, 70);
    const t = rr(0.9, 1.1);
    fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * 4, gy, p.z + Math.sin(a) * 4, Math.cos(a) * v, 0.4, Math.sin(a) * v, rr(8, 14), 3 * z, rr(10, 20) * z, 0.47 * t, 0.42 * t, 0.34 * t, 0.5, { drag: rr(0.55, 0.85), hug: 0.3, stretch: [2.4, 0.6] });
  }
  // and the bank of steam and smoke thrown off the deflector, boiling up round the table
  for (let i = 0; i < cnt(45, q, 12); i++) {
    const a = rand() * TAU, v = rr(8, 26);
    const white = rand() < 0.65;
    fx.addSmoke(SMOKE.PUFF, p.x + Math.cos(a) * 3, gy + rr(0.5, 4), p.z + Math.sin(a) * 3, Math.cos(a) * v, rr(1, 7), Math.sin(a) * v, rr(16, 30), 4 * z, rr(14, 26) * z, white ? 0.92 : 0.5, white ? 0.92 : 0.45, white ? 0.9 : 0.37, 0.6, { drag: rr(0.6, 0.9), buoy: white ? rr(0.5, 1.1) : 0.3, gy });
  }
  for (let i = 0; i < cnt(24, q, 6); i++) {
    const a = rand() * TAU, v = rr(12, 32);
    fx.clods.add(CLOD.EARTH, p.x + Math.cos(a) * 3, gy + 0.4, p.z + Math.sin(a) * 3, Math.cos(a) * v, rr(2, 9), Math.sin(a) * v, rr(0.05, 0.18), 0.15, 0.13, 0.1, { life: rr(5, 8), drag: 0.3, gy });
  }
  S.x = p.x; S.y = gy + 2; S.z = p.z;
  fx.shockAt(S, 260, 343, 0.6);
}

// ---------------------------------------------------------------- timed emitters (types 11, 12)
// type 11 CATAPULT  the V-1 piston's run up the ramp: steam spurting from the slot behind it
//                   (a,b,c: the ramp's direction, d: its length, e: 1 once the piston has left, f: detail)
// type 12 PRESTAGE  the A4's pre-stage burning on the table (a: ground height, f: detail)
export function runRocketEmitter(fx, E, i, dt) {
  const t = E.t[i], x = E.x[i], y = E.y[i], z = E.z[i];
  if (E.type[i] === 11) {
    const dx = E.a[i], dy = E.b[i], dz = E.c[i], L = E.d[i], q = E.f[i];
    const s = L * Math.min(1, t * t); // the piston runs up the ramp in a second, still speeding up
    const hl = Math.hypot(dx, dz) || 1, sx = -dz / hl, sz = dx / hl;
    E.acc[i] += 130 * q * dt;
    while (E.acc[i] >= 1) {
      E.acc[i] -= 1;
      const u = s * (1 - 0.85 * rand() * rand()); // most from just behind the piston
      const sd = rand() < 0.5 ? -1 : 1, v = rr(2, 9);
      fx.addSmoke(SMOKE.PUFF, x + dx * u + sx * sd * 0.5, y + dy * u + 1.1, z + dz * u + sz * sd * 0.5,
        sx * sd * v + dx * rr(0, 10), rr(4, 18), sz * sd * v + dz * rr(0, 10),
        rr(16, 30), rr(5, 8), rr(15, 26), 0.95, 0.95, 0.94, 0.7, { drag: rr(0.7, 1.1), buoy: rr(0.4, 1) });
    }
    if (t >= 1 && E.e[i] === 0) {
      // the piston leaves the top: a last burst of steam thrown ahead
      E.e[i] = 1;
      const tx = x + dx * L, ty = y + dy * L + 1.1, tz = z + dz * L;
      fx.addGlow(FLASH, tx, ty, tz, 0, 0, 0, 0.06, 1, 3, 30, 28, 22, 1);
      for (let j = 0; j < cnt(22, q, 6); j++) {
        const v = rr(8, 40);
        fx.addSmoke(SMOKE.PUFF, tx, ty, tz, dx * v + rr(-5, 5), dy * v + rr(0, 6), dz * v + rr(-5, 5), rr(14, 24), 3, rr(12, 22), 0.95, 0.95, 0.94, 0.65, { drag: rr(1, 1.6), buoy: 0.6 });
      }
    }
    return;
  }
  if (E.type[i] === 12) {
    const gy = E.a[i], q = E.f[i], life = dt * 1.3 + 0.002;
    const fl = rr(0.8, 1.15) * Math.min(1, t * 3); // it builds up over a third of a second, and flickers
    fx.addGlow(SPARK, x, y, z, 0, -1, 0, life, 0.6, 0.8, 44 * KS * fl, 26 * KS * fl, 7 * KS * fl, 1, { len: Math.max(0.5, y - gy) + 0.5, drag: 1e6 });
    fx.addGlow(FLASH, x, gy + 0.8, z, 0, 0, 0, life, 2.2, 3, 34 * KF * fl, 20 * KF * fl, 6 * KF * fl, 1);
    for (let j = 0; j < 2; j++) {
      const a = rand() * TAU;
      fx.addGlow(SPARK, x, gy + 0.5, z, Math.cos(a), 0.1, Math.sin(a), life, 0.6, 0.9, 34 * KS * fl, 17 * KS * fl, 4 * KS * fl, 1, { len: rr(3, 7) * fl, drag: 1e6 });
    }
    if (rand() < 18 * dt) {
      const a = rand() * TAU, v = rr(15, 35);
      fx.addGlow(SPARK, x, gy + 0.6, z, Math.cos(a) * v, rr(3, 12), Math.sin(a) * v, rr(0.3, 0.8), 0.1, 0.06, 40, 20, 5, 1, { len: 0.04, drag: 0.6, buoy: -9.8 });
    }
    E.acc[i] += 32 * q * dt;
    while (E.acc[i] >= 1) {
      E.acc[i] -= 1;
      const a = rand() * TAU, v = rr(6, 20);
      const white = rand() < 0.6;
      fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * 1.5, gy + rr(0.3, 1.5), z + Math.sin(a) * 1.5, Math.cos(a) * v, rr(0.5, 4), Math.sin(a) * v, rr(10, 20), 2, rr(8, 15), white ? 0.92 : 0.46, white ? 0.92 : 0.41, white ? 0.9 : 0.33, 0.55, { drag: rr(0.6, 1), buoy: white ? rr(0.4, 1) : 0.15, hug: white ? 0 : 0.35, gy });
    }
  }
}

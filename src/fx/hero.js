import * as THREE from 'three';
import { SMOKE, FLAME, FLASH, SPARK, rand, rr, clamp, rdir } from './kinds.js';
import { CLOD } from './clods.js';
import { farScale, cnt, bigK, apexSpeed, GROUNDS, FUZES } from './artillery.js';
import { GUNS } from '../sim/tables.js';

// The max-quality battery's shot and burst (shots/maxq/PLAN.md 3.7; the effects audit's W1, W3, W4 and W8): what a
// 21 cm howitzer without a muzzle brake looks like when the camera is a few metres to a few tens of metres away, by day.
// Only the hero battery's guns and shells come here (fx.gunBlast and fx.shellBurst with { hero: true }); everything
// else keeps fx/artillery.js. All of it spawns into the fx pools with { hero: true } (the hero atlas's lit billows,
// stretched earth spray, flames that darken what is behind them a little), through the fixed light pool, and allocates
// nothing per frame: the options objects below are refilled before each spawn.

const V = new THREE.Vector3(), U = new THREE.Vector3(), W = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
const TAU = Math.PI * 2;
// the flash light's share by day: a warm flicker on the gun and the men by the muzzle over the sunlit scene (the full
// light, as today, by night)
const DAY_LIGHT = 0.06;

const so = { glow: 0, drag: 0.4, buoy: 0, len: 0, hug: 0, gy: null, grav: 0, stretch: null, hero: true, spin: null, tile0: 0, tiles: 6 };
function o(drag, buoy = 0, glow = 0, len = 0, hug = 0, gy = null, grav = 0, stretch = null, spin = null, tile0 = 0, tiles = 6) {
  so.drag = drag; so.buoy = buoy; so.glow = glow; so.len = len; so.hug = hug; so.gy = gy; so.grav = grav; so.stretch = stretch; so.spin = spin;
  so.tile0 = tile0; so.tiles = tiles;
  return so;
}
// the hero atlas's smoke tiles (fx/heroatlas.js): dense and broken ones for the ground's dust (a smooth low cloud), any
// for the gun's cloud, the broken and torn ones for what hangs and thins
const DENSE = 0, BROKEN = 2, TORN = 4;
const go = { len: 0, drag: 0.5, buoy: 0, hero: true };
function g(drag, buoy = 0, len = 0) { go.drag = drag; go.buoy = buoy; go.len = len; return go; }
const co = { life: 12, drag: 0.04, fuse: 0, gy: 0, flat: 1, stream: 0 };
function c(life, drag, gy, flat = 1, stream = 0) { co.life = life; co.drag = drag; co.gy = gy; co.flat = flat; co.stream = stream; return co; }
const RING_STRETCH = [1.9, 0.62], SURGE_STRETCH = [2.4, 0.6];
// A/B switches for the review captures (window.__drumfire.fx.heroOff.flash = true and so on): parts of the hero shot
// left out. Nothing sets them in play.
export const HERO_OFF = { flash: false, light: false, cloud: false, ground: false, ring: false };

// The detail level of a hero effect: the distance rule of artillery.js's lod without its close-up thinning (fx.closeUp):
// at the gun a hero blast keeps its cloud and skips only the ground puffs that would start on the camera.
function heroLod(fx, p) {
  const d = fx._cam.distanceTo(p);
  let q = clamp(1.12 - d / 5200, 0.3, 1) * clamp(fx.budget, 0.4, 1.25);
  if (!fx.cheap()) q *= 0.6;
  fx.lodZ = clamp(1 / Math.sqrt(q), 0.9, 1.9);
  fx.lodQ = q;
  return q;
}

// Ground the blast stands on, as main's terrain.groundAt names it: the dust it raises (colour, amount), how many leaves,
// whether it throws mud. The lesson's pad is mud: wet ground throws dark spatter and little dust.
const DUST = {
  mud: { col: [0.3, 0.26, 0.2], k: 0.9, leaf: 0.6, mud: 1 },
  grass: { col: [0.3, 0.27, 0.19], k: 0.75, leaf: 1.5, mud: 0.3 },
  water: { col: [0.5, 0.52, 0.52], k: 0.3, leaf: 0.2, mud: 0.5 },
  road: { col: [0.44, 0.41, 0.35], k: 1.2, leaf: 0.4, mud: 0 },
  concrete: { col: [0.46, 0.44, 0.41], k: 1.2, leaf: 0.3, mud: 0 },
  rubble: { col: [0.45, 0.33, 0.26], k: 1.2, leaf: 0.3, mud: 0 },
};

// ---------------------------------------------------------------- the shot
// The charge's share of the top charge's muzzle energy, 0.25 to 1: `charge` is the order's charge index into
// GUNS[kind].charges (as main passes it), or the muzzle speed over the top charge's (0 to 1), or null for the top one
function chargeK(kind, charge) {
  let r = 1;
  const cs = GUNS[kind]?.charges;
  if (Number.isInteger(charge) && charge >= 0 && cs?.[charge]) {
    let vmax = 0;
    for (const c of cs) vmax = Math.max(vmax, c.v);
    r = cs[charge].v / vmax;
  } else if (typeof charge === 'number' && charge > 0 && charge <= 1) r = charge;
  return clamp(r * r, 0.25, 1);
}

/**
 * The hero gun firing. p: the muzzle, dir: unit vector along the bore, calibre in inches. opts: night (0..1), kind,
 * charge (the order's charge index, or the muzzle speed over the top charge's; a low charge makes a smaller fireball
 * and a weaker shock, never under 0.8 of the full one), ground (the ground kind at the gun, default mud), el (the bore's
 * elevation, rad; from dir when left out).
 */
export function heroBlast(fx, p, dir, calibre = 8.3, { night = 0, kind = 'mrs18', charge = null, ground = 'mud', el = null } = {}) {
  const nt = typeof night === 'number' ? clamp(night, 0, 1) : night ? 1 : 0;
  const big = bigK(calibre), sc = clamp(calibre / 15, 0.16, 1.25) * (1 + 0.4 * big), fa = farScale(fx, p);
  const k8 = Math.pow(sc, 0.8) * fa, ks = Math.sqrt(sc) * Math.sqrt(fa);
  const sL = Math.min(sc, 1.25), sF = Math.min(sc, 1.4);
  const q = heroLod(fx, p), z = fx.lodZ;
  const gy = fx.ground(p.x, p.z);
  const nb = 1 + 0.8 * nt; // the glow pass is turned down by night: put the light back (smoothly through dusk)
  const fb = nb * (0.35 + 0.65 * nt); // the flash's own brightness: by day an orange-yellow ball in the sunlight, not a white one
  const gk = 0.3 + 0.7 * nt; // and how long and how hard the fireball lights the cloud orange (by night it glows)
  const kc = 0.3 + 0.7 * Math.min(sc, 1.4);
  const hgt = Math.max(0, p.y - gy), reach = clamp(1 - hgt / (30 * k8), 0.3, 1);
  const hl = Math.hypot(dir.x, dir.z);
  const hx = hl > 0.05 ? dir.x / hl : 1, hz = hl > 0.05 ? dir.z / hl : 0;
  const az = Math.atan2(hz, hx);
  const elv = el ?? Math.asin(clamp(dir.y, -1, 1));
  const ce = Math.cos(elv), se = Math.max(0, Math.sin(elv));
  // the fireball's size: the charge (never under 0.8 of the top one's) and the daylight (the night photo's ball shows its
  // whole glow; by day only the hot core outshines the sun)
  const kE = chargeK(kind, charge), kv = (0.8 + 0.2 * kE) * (0.78 + 0.22 * nt);
  const dayK = DAY_LIGHT + (1 - DAY_LIGHT) * nt;
  const G = DUST[ground] || DUST.mud;
  const cam = fx._cam;
  // a ground puff that would start on the camera (the gunner at his post, a free camera beside the gun) is skipped:
  // the cloud ahead of the muzzle is kept whole
  const onCam = (x, y, zz, s1) => { const dx = x - cam.x, dy = y - cam.y, dz = zz - cam.z, r = 6 + s1; return dx * dx + dy * dy + dz * dz < r * r; };

  // --- the flash. The primary flash at the muzzle lasts a frame or two; the gas lights up again a few metres out (the
  // secondary flash): a fat round fireball ahead of the muzzle about as wide as the gun is long (the Bundesarchiv night
  // photo of a firing Mrs 18), there for a few frames, then a short orange afterglow in the heart of the cloud. No side
  // jets: the gun has no muzzle brake.
  if (!HERO_OFF.flash) {
    fx.addGlow(FLASH, p.x + dir.x * 0.5 * k8, p.y + dir.y * 0.5 * k8, p.z + dir.z * 0.5 * k8, 0, 0, 0, 0.035, 1.2 * k8, 2.6 * k8, 40 * fb, 28 * fb, 12 * fb, 1, g(0.5));
    go.len = 3.5 * k8; go.drag = 1e6;
    fx.addGlow(SPARK, p.x, p.y, p.z, dir.x, dir.y, dir.z, 0.035, 0.8 * k8, 1.1 * k8, 60 * fb, 40 * fb, 16 * fb, 1, go);
    C.copy(dir).multiplyScalar(4 * k8 * kv).add(p);
    U.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0).cross(dir).normalize();
    W.crossVectors(dir, U);
    const ea = 4.6 * k8 * kv, eb = 3.6 * k8 * kv;
    const nFb = cnt(14, Math.max(q, 0.6), 7);
    for (let i = 0; i < nFb; i++) {
      rdir(V);
      const r = 0.85 * Math.cbrt(rand());
      const a1 = V.x * r * ea, a2 = V.y * r * eb, a3 = V.z * r * eb;
      const x = C.x + dir.x * a1 + U.x * a2 + W.x * a3, y = C.y + dir.y * a1 + U.y * a2 + W.y * a3, zz = C.z + dir.z * a1 + U.z * a2 + W.z * a3;
      const vf = rr(6, 18), vo = rr(3, 10);
      fx.addGlow(FLAME, x, y, zz, dir.x * vf + (x - C.x) / (ea + 1e-3) * vo, dir.y * vf + (y - C.y) / (ea + 1e-3) * vo, dir.z * vf + (zz - C.z) / (ea + 1e-3) * vo, rr(0.05, 0.12), 3 * k8 * kv, rr(6, 8) * k8 * kv, 26 * fb, 15 * fb, 5 * fb, 1, g(6));
    }
    for (let i = 0; i < cnt(5, q, 3); i++) {
      rdir(V);
      const f = rr(1.5, 7) * k8;
      fx.addGlow(FLAME, p.x + dir.x * f + V.x * 1.2 * k8, p.y + dir.y * f + V.y * 1.2 * k8, p.z + dir.z * f + V.z * 1.2 * k8, dir.x * rr(4, 10), dir.y * rr(4, 10) + 1, dir.z * rr(4, 10), rr(0.16, 0.3), 2 * k8, rr(3.5, 5) * k8, 9 * fb, 4 * fb, 1 * fb, 1, g(4, 2));
    }
    fx.addGlow(FLASH, C.x, C.y, C.z, 0, 0, 0, 0.045, 3 * k8 * kv, 7 * k8 * kv, 22 * fb, 15 * fb, 7 * fb, 1, g(0.5));
    // hot grit out of the bore
    go.len = 0.035; go.drag = 0.7; go.buoy = -9.8;
    for (let i = 0; i < cnt(20 * sc, q, 6); i++) {
      V.copy(dir).multiplyScalar(rr(30, 95)).add(rdir(W).multiplyScalar(rr(4, 18)));
      fx.addGlow(SPARK, p.x + dir.x * 2, p.y + dir.y * 2, p.z + dir.z * 2, V.x, V.y, V.z, rr(0.25, 0.8), 0.1, 0.06, 40 * nb, 18 * nb, 4 * nb, 1, go);
    }
  }
  W.crossVectors(dir, U); // (W was the grit's scratch)
  // the light: by day a warm flicker over the sunlit scene; by night the full light, softened close in so the gun and
  // the men are not blown out while the ground further off is lit as before
  // (the point light's share falls with the day factor again: it lights the gun's own steel a few metres off)
  if (!HERO_OFF.light) heroFlash(fx, C, 0xffb070, 6e6 * sF * sF * (1 + 0.3 * nt) * dayK, 0.18 + 0.3 * sF, 0.006 * dayK, 30 * (1 + 0.6 * nt));

  // --- the cloud: punched out fast and stopped hard within a third of a second (twice the speed and the drag of the
  // others: the same reach, but it is the stop that sells the power), pale grey (a flash-reduced Diglykol charge: the
  // smoke is light; the dusty puffs carry the ground's colour), a faint warmth in the heart
  const lifeK = 0.4 + 0.6 * sc, coreA = 0.65 + 0.35 * sL;
  const nCore = HERO_OFF.cloud ? 0 : cnt(240 * kc * 1.35, q, 20);
  for (let i = 0; i < nCore; i++) {
    const w = Math.pow(rand(), 0.7); // 0 at the heart, 1 at the rim
    // thrown out from the muzzle in a sphere biased along the bore: a fat cloud ahead of the gun, not a jet
    rdir(V);
    const along = rr(0, 6) * k8;
    const v = rr(16, 95) * ks * (1 - 0.45 * w);
    N.copy(dir).multiplyScalar(1.15).add(V).normalize();
    const cc = (0.32 + 0.3 * w) * rr(0.9, 1.08);
    const dusty = rand() < 0.22 * (1 - w) + 0.1;
    const pr = dusty ? G.col[0] * 1.25 : cc * (w < 0.5 ? 1.04 : 1), pg = dusty ? G.col[1] * 1.25 : cc * (w < 0.5 ? 0.98 : 0.99), pb = dusty ? G.col[2] * 1.25 : cc * (w < 0.5 ? 0.86 : 0.96);
    fx.addSmoke(SMOKE.CORDITE, p.x + dir.x * along + V.x * 2.5 * k8 * w, p.y + dir.y * along + V.y * 2.2 * k8 * w, p.z + dir.z * along + V.z * 2.5 * k8 * w,
      N.x * v, N.y * v + 2, N.z * v,
      rr(8, 16) * lifeK, rr(2.5, 5) * k8 * z, rr(9, 20) * k8 * z * (0.7 + 0.5 * w), pr, pg, pb, (rr(0.72, 0.92) - 0.15 * w) * coreA,
      o(rr(2.4, 4.4), rr(0.6, 1.4), w < 0.5 ? 0.75 * gk : 0, 0.12 + 0.1 * nt, 0, gy - 2, 0, null, rr(-0.35, 0.35)));
  }
  // the cloud that stays: big soft puffs that roll, thin and drift on the wind for twenty seconds and more
  const hangK = 0.25 + 0.75 * sL * sL, hangLife = (4 + 15 * sc) * 1.8;
  const nHang = HERO_OFF.cloud ? 0 : cnt(26 * kc * (0.45 + 0.55 * sc) * 1.35, q, 5);
  for (let i = 0; i < nHang; i++) {
    rdir(V);
    const f = rr(3, 16) * k8;
    fx.addSmoke(SMOKE.HANG, p.x + dir.x * f + V.x * 5 * k8, p.y + Math.abs(V.y) * 3 * k8 + dir.y * f, p.z + dir.z * f + V.z * 5 * k8,
      dir.x * rr(2, 9) + V.x * 2, dir.y * rr(1, 5) + 1.5, dir.z * rr(2, 9) + V.z * 2, rr(0.8, 1.15) * hangLife, 8 * k8 * z, rr(24, 44) * k8 * z, 0.4, 0.39, 0.36, 0.42 * hangK, o(0.9, 0.15, 0, 0, 0, null, 0, null, rr(-0.12, 0.12), BROKEN, 4));
  }
  // the smoke ring of a gun without a brake: a crisp torus spinning out along the bore a moment after the shot
  // (an emitter, so the cloud's first frames are not covered: fx/hero.js runHeroEmitter type 8)
  if (!HERO_OFF.ring) fx.emitters.add(8, 0.045, 0, 0, p.x + dir.x * 1.4 * k8, p.y + dir.y * 1.4 * k8, p.z + dir.z * 1.4 * k8, dir.x, dir.y, dir.z, k8, ks, q, 1);

  // --- the ground: the blast throws a fan of dust ahead and a ring all round, both racing out and stopping at 20 to 35 m;
  // a low gun throws the fan, a high one the ring (the elevation shapes both); the ground gives the colour and amount
  const fanK = Math.pow(Math.max(0, ce), 1.5), ringK = 0.7 + 0.6 * se;
  if (!HERO_OFF.ground) {
    const nFan = cnt(110 * kc * fanK * G.k, q, 6);
    for (let i = 0; i < nFan; i++) {
      const a = az + rr(-0.95, 0.95) * rr(0.5, 1), v = rr(14, 58) * 2.2 * ks * reach * (1.15 - Math.abs(a - az) * 0.4) * (0.4 + 0.6 * fanK);
      const out = rr(0, 14) * k8 * (0.35 + 0.65 * fanK), s1 = rr(7, 15) * k8 * z;
      const x = p.x + hx * out + Math.cos(a) * 2, zz = p.z + hz * out + Math.sin(a) * 2;
      if (onCam(x, gy, zz, s1)) continue;
      fx.addSmoke(SMOKE.PUFF, x, gy, zz, Math.cos(a) * v, rr(0.3, 1), Math.sin(a) * v, rr(4, 8), 2.5 * k8 * z, s1, G.col[0] * rr(0.9, 1.15), G.col[1] * rr(0.9, 1.1), G.col[2] * rr(0.9, 1.1), 0.55, o(rr(0.6, 1) * 2.6, 0, 0, 0, 0.5, null, 0, null, null, DENSE, 4));
    }
    const nRing = cnt(60 * kc * ringK * G.k, q, 8);
    for (let i = 0; i < nRing; i++) {
      const a = ((i + rand()) / nRing) * TAU, v = rr(18, 40) * 2.2 * Math.pow(sc, 0.55) * (1 + 0.5 * Math.cos(a - az) * ce) * reach;
      const s1 = rr(9, 16) * k8 * z, x = p.x + Math.cos(a) * 3 * k8, zz = p.z + Math.sin(a) * 3 * k8;
      if (onCam(x, gy, zz, s1)) continue;
      fx.addSmoke(SMOKE.PUFF, x, gy, zz, Math.cos(a) * v, 0.5, Math.sin(a) * v, rr(4, 8), 3 * k8 * z, s1, G.col[0], G.col[1] * 0.97, G.col[2] * 0.95, 0.45, o(rr(0.7, 1.1) * 2.6, 0, 0, 0, 0.5, null, 0, RING_STRETCH, null, DENSE, 4));
    }
    // dust the blast lifts close in, boiling up through the cloud
    for (let i = 0; i < cnt(60 * kc * G.k, q, 6); i++) {
      const a = rand() * TAU, r = rr(1, 13) * k8, s1 = rr(12, 26) * k8 * z;
      const x = p.x + Math.cos(a) * r, zz = p.z + Math.sin(a) * r;
      if (onCam(x, gy + 0.6, zz, s1 * 0.5)) continue;
      fx.addSmoke(SMOKE.PUFF, x, gy + 0.6, zz, Math.cos(a) * rr(5, 14) + hx * 10 * ce, rr(4, 14) * ks, Math.sin(a) * rr(5, 14) + hz * 10 * ce, rr(6, 13), 3 * k8, s1, G.col[0] * 0.95, G.col[1] * 0.93, G.col[2] * 0.9, 0.5, o(0.8, 0.5, 0, 0, 0, null, 0, null, null, DENSE, 4));
    }
    // grit, mud and leaves flicked up from the ground round the gun
    for (let i = 0; i < cnt(70 * sc * (0.5 + 0.5 * G.k), q, 6); i++) {
      const a = az + rr(-1.4, 1.4), r = rr(2, 14) * k8, v = rr(10, 38) * ks;
      fx.clods.add(CLOD.EARTH, p.x + Math.cos(a) * r, gy + 0.3, p.z + Math.sin(a) * r, Math.cos(a) * v, rr(6, 18) * ks, Math.sin(a) * v, rr(0.06, 0.22) * ks, rr(0.1, 0.18), rr(0.08, 0.14), rr(0.05, 0.1), c(rr(6, 9), 0.3, gy));
    }
    for (let i = 0; i < cnt(24 * G.mud, q, 0); i++) {
      // wet ground: dark spatter thrown out under the muzzle
      const a = az + rr(-0.9, 0.9), r = rr(1, 9) * k8, v = rr(8, 26) * ks * (0.5 + 0.5 * ce);
      fx.clods.add(CLOD.EARTH, p.x + Math.cos(a) * r, gy + 0.2, p.z + Math.sin(a) * r, Math.cos(a) * v, rr(3, 10) * ks, Math.sin(a) * v, rr(0.04, 0.12), 0.08, 0.06, 0.045, c(rr(5, 8), 0.4, gy));
    }
    for (let i = 0; i < cnt(50 * sc * G.leaf, q, 2); i++) {
      const a = az + rr(-1.6, 1.6), r = rr(2, 18) * k8, v = rr(8, 30) * ks;
      fx.leaf(p.x + Math.cos(a) * r, gy + 0.4, p.z + Math.sin(a) * r, Math.cos(a) * v, rr(6, 20) * ks, Math.sin(a) * v, rr(0.08, 0.22), gy);
    }
  }

  // the shimmer over the muzzle, the blast wave (faded near the camera: post.js) and the grass flattened
  fx.heatAt(V.copy(dir).multiplyScalar(2.5 * k8).add(p), 3 * k8, 1.6, 0.8, true);
  fx.shockAt(p, 90 + 260 * sc, 340, (0.35 + 0.65 * sF) * (0.75 + 0.25 * kE), true);
  fx.gustAt?.(p, hx, hz, 30 * k8 * reach, 0.6 + 0.4 * sL);
}

// fx's light with the hero's softening radius (artillery.js flash with a radius for the analytic light)
function heroFlash(fx, p, color, intensity, life, pool, radius) {
  fx.light(p, intensity * pool, life, color);
  fx.flashAt(p, color, intensity, life, radius);
}

// ---------------------------------------------------------------- the burst
// grounds the sim reports that the old table maps to mud: turf and a road's metalling
let HG = null;
function heroGrounds() {
  if (!HG) {
    HG = { ...GROUNDS };
    HG.grass = { ...GROUNDS.mud, c1: [0.06, 0.055, 0.032], c2: [0.11, 0.1, 0.055], dust: [0.31, 0.28, 0.2], clod: [0.08, 0.085, 0.045] };
    HG.road = { ...GROUNDS.rubble, c1: [0.24, 0.22, 0.2], c2: [0.18, 0.17, 0.16], dust: [0.42, 0.4, 0.36], clod: [0.26, 0.25, 0.23] };
  }
  return HG;
}
const GROUND_ID = { mud: 0, water: 1, rubble: 2, concrete: 3, grass: 4, road: 5 };
const GROUND_NAME = ['mud', 'water', 'rubble', 'concrete', 'grass', 'road'];

/**
 * The hero shell bursting on the ground (opts as fx.shellBurst): the burst of artillery.js with the hero atlas, plus
 * the 21 cm signature: radial dirt jets with plumes trailing (a spiky crown), fragments raising a ring of dust spurts
 * out to about 100 m in a fraction of a second, earth spray stretched along its motion, a head without round balls,
 * and the flash's light by day cut to a flicker (its sprite without the lens star).
 */
export function heroBurst(fx, p, { calibre = 8.3, fuze = 'impact', ground = 'mud', night = null } = {}) {
  const nt = night === null ? fx.night : typeof night === 'number' ? clamp(night, 0, 1) : night ? 1 : 0;
  const big = bigK(calibre), sc = clamp(calibre / 15, 0.14, 1.25) * (1 + 0.45 * big), fa = farScale(fx, p), k8 = Math.pow(sc, 0.8) * fa, ks = Math.sqrt(sc) * Math.sqrt(fa);
  const sF = Math.min(sc, 1.4);
  const q = heroLod(fx, p), z = fx.lodZ;
  const gy = fx.ground(p.x, p.z), y0 = Math.abs(p.y - gy) < 4 ? gy : p.y;
  const GR = heroGrounds();
  const G = GR[ground] || GR.mud, FZ = FUZES[fuze] || FUZES.impact;
  const kc = 0.3 + 0.7 * Math.min(sc, 1.4);
  const x = p.x, zz = p.z;
  const dayK = DAY_LIGHT + (1 - DAY_LIGHT) * nt;
  const water = G.water;

  // --- the flash and fireball, inside the rising earth (by day mostly hidden in it)
  const fl = G.flash * FZ.flash * (water ? 0.5 : 1);
  const fk = 0.55 + 0.45 * nt; // the flash sprite by day: smaller, the light of the sun round it
  fx.addGlow(FLASH, x, y0 + 3 * k8, zz, 0, 0, 0, 0.1 + 0.04 * fl, 10 * k8 * fl * fk, 32 * k8 * fl * fk, 70, 48, 22, 1, g(0.5));
  for (let i = 0; i < cnt(7 * fl, q, water ? 1 : 3); i++) {
    rdir(V);
    fx.addGlow(FLAME, x + V.x * 3 * k8, y0 + 1.5 * k8, zz + V.z * 3 * k8, V.x * rr(10, 26) * ks, rr(8, 30) * ks, V.z * rr(10, 26) * ks, rr(0.35, 0.8), 4 * k8, rr(10, 17) * k8 * fl, 20, 8, 2, 1, g(2.2));
  }
  heroFlash(fx, V.set(x, y0 + 4 * k8, zz), 0xff9a50, 1.3e7 * sF * sF * fl * dayK, 0.25 + 0.35 * sF, 0.03 * dayK, 24);

  // --- the geyser: earth thrown up the column (the dirt tiles, stretched along their motion)
  const H = 115 * k8 * FZ.h * G.h * (1 + 0.25 * big), gr = 9.8, w = FZ.w;
  const R0 = 4.5 * k8 * w;
  const nG = cnt(230 * kc, q, 12);
  for (let i = 0; i < nG; i++) {
    const u = (i + rand()) / nG;
    const ha = H * (0.1 + 0.9 * Math.pow(u, 0.85)) * (u > 0.96 ? 1.18 : 1);
    const D = rr(0.8, 1.4);
    const vy = apexSpeed(ha * (0.7 + 0.3 * D), D, gr);
    const tUp = Math.log(1 + (D * vy) / gr) / D;
    const a = rand() * TAU, lat = vy * rr(0.05, 0.23) * w * (1.4 - 0.8 * u), off = R0 * Math.sqrt(rand());
    const mix = rand();
    const r = G.c1[0] + (G.c2[0] - G.c1[0]) * mix, gg = G.c1[1] + (G.c2[1] - G.c1[1]) * mix, b = G.c1[2] + (G.c2[2] - G.c1[2]) * mix;
    const s0 = rr(4, 7) * k8 * w * z;
    const fire = ha < H * 0.35 && !water;
    fx.addSmoke(SMOKE.SPRAY, x + Math.cos(a) * off, y0 + 0.5 + rr(0, 3) * k8, zz + Math.sin(a) * off, Math.cos(a) * lat, vy, Math.sin(a) * lat, tUp + 0.8 * ha * D / gr, s0, s0 * rr(2.2, 3.1), r, gg, b, water ? 0.8 : 0.9, o(D, 0, fire ? 0.55 : 0, 0.22, 0, gy, gr, null, 0));
  }
  // a fat skirt at the foot
  const nSk = cnt(90 * kc, q, 8);
  for (let i = 0; i < nSk; i++) {
    const a = rand() * TAU, v = rr(8, 26) * ks * w, ha = rr(4, 30) * k8;
    const mix = rand(), vy = apexSpeed(ha, 1.2, gr);
    fx.addSmoke(SMOKE.SPRAY, x + Math.cos(a) * R0, y0 + 0.5, zz + Math.sin(a) * R0, Math.cos(a) * v, vy, Math.sin(a) * v, 1.5 + 0.9 * ha * 1.2 / gr + 2, rr(4, 7) * k8 * z, rr(10, 18) * k8 * z, G.c1[0] + (G.c2[0] - G.c1[0]) * mix, G.c1[1] + (G.c2[1] - G.c1[1]) * mix, G.c1[2] + (G.c2[2] - G.c1[2]) * mix, 0.88, o(1.2, 0, 0, 0, 0, gy, gr, null, 0));
  }
  // the burst's own smoke: black gas rising through and above the earth (more, and less opaque, so it is not discs)
  if (!water) {
    for (let i = 0; i < cnt(90 * kc * 1.3, q, 6); i++) {
      rdir(V);
      fx.addSmoke(SMOKE.BLACK, x + V.x * 2 * k8, y0 + 1 + Math.abs(V.y) * 3 * k8, zz + V.z * 2 * k8, V.x * rr(2, 9) * ks, rr(12, 40) * k8 * Math.min(1.3, FZ.h), V.z * rr(2, 9) * ks, rr(11, 24), 5 * k8 * z, rr(22, 40) * k8 * z, G.smoke[0], G.smoke[1], G.smoke[2], 0.65, o(0.55, 1.1, 0.3, 0.45, 0, null, 0, null, rr(-0.4, 0.4)));
    }
  } else {
    for (let i = 0; i < cnt(30 * kc, q, 6); i++) {
      rdir(V);
      fx.addSmoke(SMOKE.MIST, x + V.x * 3 * k8, y0 + rr(2, H * 0.6), zz + V.z * 3 * k8, V.x * rr(2, 8), rr(5, 20), V.z * rr(2, 8), rr(5, 10), 4 * k8 * z, rr(12, 22) * k8 * z, 0.85, 0.86, 0.86, 0.5, o(0.5, -3));
    }
  }

  // --- the dirt streamers: radial jets of earth climbing steeply out of the burst, each a heavy lump trailing a plume
  // (clods.js stream) with spray thrown along the same line: the spiky crown of a big burst in the first two seconds
  if (!water) {
    const nJ = cnt((10 + 6 * sc) * 1.2, q, 5);
    for (let j = 0; j < nJ; j++) {
      const a = rand() * TAU, e = rr(0.9, 1.45), sp = rr(28, 48) * ks * Math.sqrt(FZ.up);
      const ux = Math.cos(a) * Math.cos(e), uy = Math.sin(e), uz = Math.sin(a) * Math.cos(e);
      const m = rand();
      fx.clods.add(CLOD.EARTH, x + ux * R0 * 0.5, y0 + 1, zz + uz * R0 * 0.5, ux * sp, uy * sp, uz * sp, rr(0.8, 1.5) * Math.sqrt(k8), G.clod[0] * (0.6 + m), G.clod[1] * (0.6 + m), G.clod[2] * (0.6 + m), c(rr(5, 8), 0.12, gy, 1, 1.8));
      for (let k = 0; k < 7; k++) {
        const f = rr(0.35, 0.95);
        const mix = rand();
        fx.addSmoke(SMOKE.SPRAY, x + ux * R0 * 0.4, y0 + 1, zz + uz * R0 * 0.4, ux * sp * f + rr(-1.5, 1.5), uy * sp * f, uz * sp * f + rr(-1.5, 1.5), rr(2.5, 4.5), 1.8 * k8 * z, 4.5 * k8 * z, G.c1[0] + (G.c2[0] - G.c1[0]) * mix, G.c1[1] + (G.c2[1] - G.c1[1]) * mix, G.c1[2] + (G.c2[2] - G.c1[2]) * mix, 0.7, o(0.9, 0, 0, 0, 0, gy, gr, null, 0));
      }
    }
  }

  // --- the shock: the dust ring racing out over the ground, and the slower billow
  const nRing = cnt(120 * kc, q, 16);
  for (let i = 0; i < nRing; i++) {
    const a = ((i + rand()) / nRing) * TAU, v = rr(34, 66) * Math.pow(sc, 0.5) * FZ.ring;
    fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * R0, y0, zz + Math.sin(a) * R0, Math.cos(a) * v, 0.4, Math.sin(a) * v, rr(5, 9), 3 * k8 * z, rr(10, 20) * k8 * z * FZ.w, rr(G.dust[0] * 0.95, G.dust[0] * 1.1), G.dust[1], G.dust[2], 0.5, o(rr(0.55, 0.9), 0, 0, 0, 0.3, null, 0, SURGE_STRETCH));
  }
  const nBill = cnt(40 * kc, q, 8);
  for (let i = 0; i < nBill; i++) {
    const a = ((i + rand()) / nBill) * TAU, v = rr(14, 30) * FZ.ring * ks;
    fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * R0 * 2, y0, zz + Math.sin(a) * R0 * 2, Math.cos(a) * v, rr(0.5, 2), Math.sin(a) * v, rr(8, 14), 5 * k8 * z, rr(18, 32) * k8 * z, G.dust[0] * 0.8, G.dust[1] * 0.8, G.dust[2] * 0.8, 0.4, o(0.45, 0.3, 0, 0, 0.6));
  }

  // --- clods on ballistic arcs, a few very large pieces, hot fragments
  const nC = water ? cnt(60 * kc, q, 6) : cnt(260 * kc * FZ.clod, q, 14);
  const vmax = 78 * Math.pow(sc, 0.5);
  for (let i = 0; i < nC; i++) {
    const a = rand() * TAU, el = rr(0.04, 0.85) * FZ.up + (fuze === 'instant' ? 0.6 : 0), s = Math.sin(el), cs = Math.cos(el);
    const v = rr(0.25, 1) * vmax * (el > 0.5 ? 0.8 : 1);
    const lump = rand() < 0.1;
    const m = rand();
    const sz = (water ? rr(0.12, 0.3) : rr(0.2, 0.95) * (lump ? 1.8 : 1)) * Math.pow(Math.min(sc, 1.4), 0.45) * (ground === 'rubble' ? 0.8 : 1);
    fx.clods.add(water ? CLOD.WATER : CLOD.EARTH, x + Math.cos(a) * R0, y0 + 1, zz + Math.sin(a) * R0, Math.cos(a) * s * v, cs * v, Math.sin(a) * s * v, sz, G.clod[0] * (0.6 + m), G.clod[1] * (0.6 + m), G.clod[2] * (0.6 + m), c(22, 0.05, gy, ground === 'rubble' ? 0.5 : 1));
  }
  if (!water) {
    for (let i = 0; i < cnt(9 * kc, q, 2); i++) {
      const a = rand() * TAU, el = rr(0.5, 1.2), v = rr(18, 42) * ks, m = rand();
      fx.clods.add(CLOD.EARTH, x + Math.cos(a) * R0, y0 + 1, zz + Math.sin(a) * R0, Math.cos(a) * Math.sin(el) * v, Math.cos(el) * v * 1.2 + 8, Math.sin(a) * Math.sin(el) * v, rr(1.6, 3.2) * k8, G.clod[0] * (0.6 + m), G.clod[1] * (0.6 + m), G.clod[2] * (0.6 + m), c(30, 0.02, gy));
    }
  }
  const nF = cnt((fuze === 'instant' ? 50 : 16) * kc, q, 5);
  go.len = 0.04; go.drag = 0.5; go.buoy = -9.8;
  for (let i = 0; i < nF; i++) {
    rdir(V);
    const v = rr(70, 190);
    fx.addGlow(SPARK, x, y0 + 1, zz, V.x * v, Math.abs(V.y) * v * (fuze === 'instant' ? 0.35 : 1) + 12, V.z * v, rr(0.2, 0.55), 0.2, 0.1, 40, 20, 6, 1, go);
  }

  // --- the timed parts: the fragment strikes, the head as the column tops out, the base surge, the smoke column
  const id = GROUND_ID[ground] ?? 0;
  fx.emitters.add(9, 0.03, 0.45, 0, x, y0, zz, 8 * k8, 60 + 90 * sc, cnt(40 + 40 * sc, q, 12), id, k8, q, 1);
  const Tup = 2.6 * Math.sqrt(H / 100);
  fx.emitters.add(6, Tup * 0.35, 0, 0, x, y0, zz, sc * Math.pow(fa, 1.25), H, G.smoke[0] * 1.3, G.smoke[1] * 1.3, G.smoke[2] * 1.3, q, 1);
  fx.emitters.add(2, Tup * 0.95, 0, 0, x, y0, zz, sc * Math.pow(fa, 1.25), FZ.w, G.dust[0], G.dust[1], G.dust[2], q, 1);
  const colDur = (water ? 8 : 14 + 40 * Math.min(sc, 1.35)) * (q < 0.6 ? 0.7 : 1);
  fx.emitters.add(1, 0.5, colDur, (water ? 2 : 2.5 + 8 * Math.min(sc, 1.4)) * q, x, y0, zz, sc * Math.pow(fa, 1.25), water ? 1 : 0, G.smoke[0], G.smoke[1], G.smoke[2], FZ.h, 1);

  fx.shockAt(V.set(x, y0 + 2, zz), 120 + 600 * sc, 343, 0.3 + 1.0 * sF * (fuze === 'delay' ? 0.8 : 1), true);
}

// ---------------------------------------------------------------- timed parts
// type 1 (h 1) COLUMN  the column over the crater in hero puffs
// type 2 (h 1) SURGE   the base surge in hero puffs
// type 6 (h 1) HEAD    the head of the column: many smaller, less opaque, turning puffs instead of a torus of black balls
// type 8 RING          the shot's smoke ring: a: b: c: the bore, d: k8, e: ks, f: q
// type 9 FRAG          fragment strikes filling an annulus outward at fragment speed: a inner and b outer radius,
//                      c count, d the ground (GROUND_ID), e k8, f q
export function runHeroEmitter(fx, E, i, dt) {
  const t = E.t[i], x = E.x[i], y = E.y[i], z = E.z[i];
  switch (E.type[i]) {
    case 1: {
      const k = 1 - (t - E.when[i]) / E.dur[i];
      E.acc[i] += E.rate[i] * dt * Math.max(0.15, k);
      const sc = E.a[i], pale = E.b[i];
      while (E.acc[i] >= 1) {
        E.acc[i] -= 1;
        const a = rand() * TAU, r = rr(0, 5) * Math.sqrt(sc);
        const col = rr(0.85, 1.15), w = E.f[i] || 1;
        fx.addSmoke(pale ? SMOKE.MIST : SMOKE.BLACK, x + Math.cos(a) * r, y + 1, z + Math.sin(a) * r, rr(-1.5, 1.5), rr(5, 12) * Math.sqrt(sc) * (pale ? 0.6 : 1) * Math.min(1.4, w), rr(-1.5, 1.5), rr(22, 50) * (pale ? 0.35 : 0.6 + 0.6 * sc), (4 + 4 * sc) * fx.lodZ * 0.8, rr(24, 44) * Math.pow(sc, 0.8) * fx.lodZ * (pale ? 0.7 : 1), E.c[i] * col, E.d[i] * col, E.e[i] * col, pale ? 0.35 : 0.5, o(0.12, pale ? 0.15 : 0.45, pale ? 0 : 0.25, 1.5, 0, null, 0, null, rr(-0.15, 0.15)));
      }
      break;
    }
    case 2: {
      const sc = E.a[i], q = E.f[i], n = cnt(26 * (0.3 + 0.7 * sc), q, 8), k8 = Math.pow(sc, 0.8);
      for (let j = 0; j < n; j++) {
        const a = ((j + rand()) / n) * TAU, v = rr(9, 22) * Math.sqrt(sc) * E.b[i];
        fx.addSmoke(SMOKE.PUFF, x + Math.cos(a) * 6 * k8, y, z + Math.sin(a) * 6 * k8, Math.cos(a) * v, rr(0.3, 2), Math.sin(a) * v, rr(8, 15), 6 * k8 * fx.lodZ, rr(22, 40) * k8 * fx.lodZ, E.c[i] * 0.85, E.d[i] * 0.82, E.e[i] * 0.8, 0.5, o(0.5, 0.25, 0, 0, 0.55));
      }
      E.type[i] = 0;
      break;
    }
    case 6: {
      // the head: a broad, ragged roll of smoke over the column (a torus of many small turning puffs)
      const sc = E.a[i], k8 = Math.pow(sc, 0.8), q = E.f[i];
      const cx = x, cy = y + E.b[i] * 0.72, cz = z;
      const n = cnt(90, q, 24), R = 7 * k8, rho = 5 * k8;
      for (let j = 0; j < n; j++) {
        const phi = ((j + rand()) / n) * TAU, th = rand() * TAU;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const rad = R + rho * Math.cos(th) * rr(0.6, 1.2), al = rho * Math.sin(th) * rr(0.6, 1.2);
        const vr = 11 * Math.sqrt(sc) * Math.sin(th), va = 12 * Math.sqrt(sc) - 11 * Math.sqrt(sc) * Math.cos(th);
        const col = rr(0.9, 1.1);
        fx.addSmoke(SMOKE.BLACK, cx + cp * rad, cy + al, cz + sp * rad, cp * vr, va, sp * vr, 10 * rr(0.8, 1.2), 6 * k8 * fx.lodZ * rr(0.8, 1.2), 16 * k8 * rr(0.7, 1.3) * fx.lodZ, E.c[i] * col, E.d[i] * col, E.e[i] * col, 0.55, o(0.45, 0.15, 0, 0, 0, null, 0, null, rr(-0.8, 0.8)));
      }
      E.type[i] = 0;
      break;
    }
    case 8: {
      // a crisp torus: many small puffs on a ring round the bore, the core turning, carried out along the bore at
      // about 20 m/s and widening slowly; it travels 20 to 30 m and holds its shape for seconds
      N.set(E.a[i], E.b[i], E.c[i]);
      const k8 = E.d[i], ks = E.e[i], q = E.f[i];
      U.set(Math.abs(N.y) < 0.9 ? 0 : 1, Math.abs(N.y) < 0.9 ? 1 : 0, 0).cross(N).normalize();
      W.crossVectors(N, U);
      const n = cnt(48, q, 16), R = 1.4 * k8, rho = 0.42 * k8, fwd = 45 * ks, swirl = 3.5 * ks, grow = 2.2;
      for (let j = 0; j < n; j++) {
        const phi = ((j + rand() * 0.5) / n) * TAU, th = rand() * TAU;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const ex = U.x * cp + W.x * sp, ey = U.y * cp + W.y * sp, ez = U.z * cp + W.z * sp;
        const rad = R + rho * Math.cos(th), al = rho * Math.sin(th);
        const vr = swirl * Math.sin(th) + grow, va = fwd - swirl * Math.cos(th);
        const col = rr(0.97, 1.03);
        fx.addSmoke(SMOKE.CORDITE, x + ex * rad + N.x * al, y + ey * rad + N.y * al, z + ez * rad + N.z * al, ex * vr + N.x * va, ey * vr + N.y * va, ez * vr + N.z * va, 8 * rr(0.95, 1.05), 2.2 * k8 * rr(0.95, 1.05), 4.4 * k8 * rr(0.95, 1.05), 0.52 * col, 0.5 * col, 0.47 * col, 0.72, o(0.75, 0.06, 0, 0, 0, null, 0, null, rr(-0.6, 0.6), DENSE, 2));
      }
      E.type[i] = 0;
      break;
    }
    case 9: {
      // fragment strikes: the annulus filled outward as the fragments (about 600 m/s) reach each radius
      const r0 = E.a[i], r1 = E.b[i], n = E.c[i], k8 = E.e[i], q = E.f[i];
      const G = heroGrounds()[GROUND_NAME[E.d[i]] || 'mud'] || GROUNDS.mud;
      const reach = Math.min(r1, r0 + (t - E.when[i]) * 600);
      const due = Math.min(n, Math.floor(n * (reach - r0) / Math.max(1, r1 - r0)));
      while (E.acc[i] < due) {
        const k = E.acc[i]++;
        const rad = r0 + (r1 - r0) * ((k + rand()) / n), a = rand() * TAU;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad, gyp = fx.ground(px, pz);
        if (G.water) {
          fx.addSmoke(SMOKE.MIST, px, gyp + 0.3, pz, rr(-0.4, 0.4), rr(3, 7), rr(-0.4, 0.4), rr(1.2, 2.2), 0.3, rr(1.2, 2.2) * Math.sqrt(k8), 0.8, 0.82, 0.82, 0.5, o(1.6, -2));
        } else {
          fx.addSmoke(SMOKE.PUFF, px, gyp + 0.3, pz, rr(-0.6, 0.6), rr(3, 7), rr(-0.6, 0.6), rr(1.4, 2.6), 0.4, rr(1.8, 3.2) * Math.sqrt(k8), G.dust[0] * rr(0.9, 1.1), G.dust[1], G.dust[2], 0.55 * Math.min(1, q + 0.3), o(1.6, 0, 0, 0, 0, gyp));
          if (rand() < 0.3) fx.clods.add(CLOD.EARTH, px, gyp + 0.2, pz, rr(-2, 2), rr(3, 8), rr(-2, 2), rr(0.04, 0.09), G.clod[0], G.clod[1], G.clod[2], c(rr(3, 5), 0.3, gyp));
        }
      }
      break;
    }
  }
}

import { smooth, lerp, wrapPi, headingOf } from '../anim.js';

// The Wespe's drill for render/crews.js (see render/crews_ww1.js for what this module may export). A light gun's drill
// (crews.js: TIMED, LIGHT) worked inside the open fighting compartment of a vehicle that turns as a whole: the rig's
// traverse pivot is the hull (models/v/de/wespe.js), so every man's place turns with it (the rig marks them all
// world: false). Five men (GUNS.wespe.crew):
//   officer  the commander at the right front of the compartment (crews.js cmd: points for the shot, phones when idle)
//   layer    at the panoramic sight and the handwheels left of the breech (crews.js lay)
//   loader   left of the breech, behind the layer: opens the sliding block (its handle loop is on the left of the ring)
//            from his post, puts the brass cartridge in behind the rammed round, shuts the block and primes (spLoader
//            below: crews.js's breechMan for the block, carryMan('bag') for the cartridge)
//   shell    the ammunition man on the right behind the commander: carries each round to the breech and lays it in the
//            mouth of the open breech, where it is pushed home (crews.js carry; no rammer staff on this gun)
//   passer   on the ground behind the rear plate: through the ram, the cartridge and the close he turns to the
//            baskets, lifts a round, turns back and hands it up over the rear plate into the bin inside (spPass below,
//            his round is the rig's passShell)
// Everything is a pure function of the cycle clock (crew.tl), as in crews.js.
export const ROLES = { officer: 'cmd', layer: 'lay', loader: 'spLoader', shell: 'carry', passer: 'spPass' };
export const LIGHT = true;
export const TIMED = true;
export const LOADER_AT = null; // (he works the block from his post: it is within his reach)
export const BAG_SIDE = -0.42; // the cartridge goes in from the left, the shell man comes up on the right
export const STAFF = 1.7;

const _p = { x: 0, z: 0 }, _q = { x: 0, z: 0 };

// a point of the vehicle's frame (x, z) in the rig's root frame (the hull turns about its middle: the traverse pivot)
function toRoot(crew, x, z, out) {
  const dx = x - crew.pvx, dz = z - crew.pvz;
  out.x = dx * crew.ca + dz * crew.sa + crew.pvx;
  out.z = -dx * crew.sa + dz * crew.ca + crew.pvz;
  return out;
}

// The loader: the block in the open, close and prime (and at his post between), the cartridge in the steps it comes in.
// (the cartridge's walk back, and his turn to his post, end a moment into the close or the prime: until he is home
// again the carrier's drill keeps him)
export function spLoader(crew, m, c, h) {
  const s = c.s;
  if (!Number.isFinite(crew.tl?.now)) { crew.bag.visible = false; crew.breechMan(m, c, h); return; } // (no cycle on)
  crew.carryMan(m, c, h, 'bag');
  if (s === 'shell' || s === 'ram' || s === 'cartridge') return;
  crew.bag.visible = false;
  if (Math.hypot(m.x - h.x, m.z - h.z) > 0.02 || Math.abs(wrapPi(m.h - h.h)) > 0.05) return;
  crew.breechMan(m, c, h);
}

// The man on the ground: his window is the ram, the cartridge and the close (the man inside is busy at the breech).
// Shares of it: turn to the baskets and lift a round (0 to 0.32), turn back with it (to 0.46), step in and hand it up
// over the rear plate, lowering it onto the bin inside (to 0.8), step back (to 1).
export function spPass(crew, m, c, h) {
  const rig = crew.rig, G = rig.spec, T = crew.tl, A = rig.passShell;
  // on the move (src/ww1/special.js MoveCtl holds the pieces `fixed`): he has climbed aboard, out of sight in the
  // compartment, instead of sliding along beside the hull
  if (c.p?.fixed) { m.hide(); if (A) A.visible = false; return; }
  let u = -1;
  if (G && T && Number.isFinite(T.now)) {
    const a = T.at('ram', 0), b = T.at('close', 1);
    u = (T.now - a) / Math.max(0.01, b - a);
  }
  if (!G || !A || u < 0 || u > 1) {
    m.put(h.x, h.y, h.z, h.h, 'stand', crew.idleT + m.seed);
    return;
  }
  const bk = toRoot(crew, G.basket.x, G.basket.z, _p);
  const toBasket = headingOf(bk.x - h.x, bk.z - h.z);
  const turnOut = smooth(u, 0, 0.1) - smooth(u, 0.32, 0.46);
  let hd = h.h + wrapPi(toBasket - h.h) * turnOut;
  // the step in toward the rear plate and back (0.2 m along his heading at home)
  const step = (smooth(u, 0.46, 0.56) - smooth(u, 0.82, 0.95)) * 0.2;
  const fx = -Math.sin(h.h), fz = -Math.cos(h.h);
  const x = h.x + fx * step, z = h.z + fz * step;
  let pose = 'stand', t = crew.idleT + m.seed;
  if (u < 0.32) { pose = 'lift'; t = smooth(u, 0.08, 0.32); }
  else if (u < 0.5) pose = 'carry';
  else if (u < 0.8) { pose = 'reachUp'; t = 0; }
  m.put(x, h.y, z, hd, pose, t);
  // the round: from the basket up to his chest, over the plate, down onto the bin; handed over at 0.8
  const vis = u > 0.1 && u < 0.8;
  A.visible = vis && crew.level > 0;
  if (!A.visible) return;
  const mfx = -Math.sin(hd), mfz = -Math.cos(hd);
  let px, py, pz, yaw = hd - Math.PI / 2, pitch = 0;
  if (u < 0.5) {
    const lk = smooth(u, 0.12, 0.32);
    px = x + mfx * lerp(0.5, 0.42, lk); pz = z + mfz * lerp(0.5, 0.42, lk);
    py = h.y + lerp(G.basket.y, 1.07, lk);
  } else {
    const ov = toRoot(crew, G.over.x, G.over.z, _q);
    const k1 = smooth(u, 0.5, 0.66), k2 = smooth(u, 0.66, 0.78);
    const cx = x + mfx * 0.42, cz = z + mfz * 0.42;
    px = lerp(cx, ov.x, k1); pz = lerp(cz, ov.z, k1); py = lerp(h.y + 1.07, G.over.y, k1);
    yaw = hd - Math.PI / 2 + wrapPi(crew.az - (hd - Math.PI / 2)) * k1; // turned nose first to go over the plate
    if (k2 > 0) {
      const iz = toRoot(crew, G.inside.x, G.inside.z, _p);
      px = lerp(px, iz.x, k2); pz = lerp(pz, iz.z, k2); py = lerp(py, G.inside.y, k2);
      pitch = -0.5 * Math.sin(Math.PI * k2);
    }
  }
  A.position.set(px, py, pz);
  A.rotation.set(pitch, yaw, 0);
  // both hands under the round, a hand's breadth either side of its middle (letting go as it goes out of reach)
  const nx = -Math.sin(yaw), nz = -Math.cos(yaw), grip = smooth(u, 0.12, 0.2) * (1 - smooth(u, 0.7, 0.78));
  const r = 0.06;
  m.hand('L', px - nx * 0.12, py - r, pz - nz * 0.12, grip);
  m.hand('R', px + nx * 0.12, py - r, pz + nz * 0.12, grip);
}

export function act(crew, m, c, h) {
  if (m.beh === 'spLoader') { spLoader(crew, m, c, h); return true; }
  if (m.beh === 'spPass') { spPass(crew, m, c, h); return true; }
  return false;
}

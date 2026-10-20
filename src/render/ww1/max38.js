import * as THREE from 'three';
import { smooth, lerp, clamp01, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';

// The 38 cm "Langer Max" drill on its Bettung (render/crews.js calls these hooks before its own; DESIGN.md "WW1 German
// mode"). The gun is loaded level (loadEl 0). Per loading step (k is the step's 0..1):
//   shell      0-.12 the hook comes down through the well in the rear wing to the wagon on the ring track, .12-.2 the
//              slinger hooks the shell on, .2-.45 it is hoisted above the deck, .45-.55 the two car men run the
//              projectile car back under it, .55-.62 it is lowered onto the car, .66-.95 they push the car forward
//              to the breech, .95-1 they stand aside to the front of the left walkway
//   ram        the four rammers take the 5.5 m staff off the left railing, step into line behind the car (.0-.14),
//              ram the shell home 1.7 m past the chamber (.16-.7), draw the staff (.74-.86) and hang it up again
//   cartridge  the two charge men lift the next charge (the silk fore charge bag ahead of the brass main case) off
//              the rack on the right of the rear wing, carry it forward and lay it on the car (.0-.46); the rammers
//              ram it in behind the shell (.32-.98)
//   close      the wedge is wound shut (the lanyard man at its handwheel); the car men run the car back to its place
//   prime      the lanyard man primes the lock;  lay / ready / the shot: crews.js (layer, traverser, lanyard, ears)
// Everything is worked in the carriage's frame at zero elevation (crew.az turns it into the rig's root frame), as a
// pure function of the piece's step, its time in the step and the time since the shot.
export const ROLES = {
  chief: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'mxLan',
  rammer1: 'mxRam', rammer2: 'mxRam', rammer3: 'mxRam', rammer4: 'mxRam',
  car1: 'mxCar', car2: 'mxCar', charge1: 'mxChg', charge2: 'mxChg', hoist: 'mxWinch', sling: 'mxSling',
};
export const STAFF = 5.5;

// the places the drill uses come with the rig (rig.max38, models/v/de/max38.js MAX38), so this module does not import
// the model's file (crews.js loads it with every crew)
let MAX38 = null, TY, BRE, WALK, ZB, ZWAIT, ZHOIST, HOOK, SEAT, RACK, SR, SHELL, HANDLES, HALF;
function use(crew) {
  const K = crew.rig.max38;
  if (K === MAX38) return !!K;
  MAX38 = K;
  if (!K) return false;
  ({ TY, BRE, WALK, ZB, ZWAIT, ZHOIST, HOOK, SEAT, RACK, STAFF_REST: SR, SHELL, HANDLES } = K);
  HALF = SHELL.len / 2;
  return true;
}
const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride, SSTRIDE = CREW_GAITS.sidestep.stride;
const RAM_OFF = [2.3, 3.25]; // where the front and rear pairs hold the staff behind its head
const ASIDE = [[-1.95, 4.35], [-1.95, 5.3]]; // the car men out of the rammers' way, at the front of the left walkway
const CHG_X = 1.75; // the charge men's lane on the right
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _p = { x: 0, z: 0 };
const LANE = 1.05; // the rammers walk beside the car, clear of its wheels, and push on the staff's cross handles
const BAR = 0.8; // the cross handles' half length

// the staff's head (carriage frame) and how far it is in line with the bore (0 on its hooks, 1 in line)
function staffAt(c, crew, out) {
  const s = c.s, k = c.k;
  let line = 0, z = ZB + HALF;
  if (s === 'ram') {
    line = smooth(k, 0.04, 0.14) * (1 - smooth(k, 0.86, 0.96));
    z = lerp(ZB + HALF, SEAT + HALF, smooth(k, 0.16, 0.7) * (1 - smooth(k, 0.74, 0.86)));
  } else if (s === 'cartridge') {
    const L = crew.bagLen, z0 = ZB + 0.05 + L / 2, z1 = BRE - 0.02;
    line = smooth(k, 0.38, 0.48) * (1 - smooth(k, 0.88, 0.97));
    z = lerp(z0, z1, smooth(k, 0.5, 0.8) * (1 - smooth(k, 0.8, 0.88)));
  }
  out.x = lerp(SR.x, 0, line); out.y = lerp(SR.y, TY, line) + Math.sin(line * Math.PI) * 0.25; out.z = lerp(SR.z, z, line);
  out.line = line;
  return out;
}
const STAFF_P = { x: 0, y: 0, z: 0, line: 0 };

// the projectile car (the shell's middle on it) and the hook, along the drill
function carZ(c) {
  const s = c.s, k = c.k;
  if (s === 'shell') return k < 0.45 ? ZWAIT : k < 0.55 ? lerp(ZWAIT, ZHOIST, smooth(k, 0.45, 0.55)) : k < 0.66 ? ZHOIST : lerp(ZHOIST, ZB, smooth(k, 0.66, 0.95));
  if (s === 'ram' || s === 'cartridge') return ZB;
  if (s === 'close') return lerp(ZB, ZWAIT, smooth(k, 0.15, 0.95));
  return ZWAIT;
}
function hookY(c) {
  if (c.s !== 'shell') return HOOK.up;
  const k = c.k;
  if (k < 0.12) return lerp(HOOK.up, HOOK.down, smooth(k, 0, 0.12));
  if (k < 0.2) return HOOK.down;
  if (k < 0.45) return lerp(HOOK.down, HOOK.lift, smooth(k, 0.2, 0.45));
  if (k < 0.55) return HOOK.lift;
  if (k < 0.62) return lerp(HOOK.lift, HOOK.set, smooth(k, 0.55, 0.62));
  if (k < 0.66) return HOOK.set;
  return lerp(HOOK.set, HOOK.up, smooth(k, 0.66, 0.78));
}
// the charge's middle (carriage frame) and whether it shows
function bagAt(c, crew, out) {
  const s = c.s, k = c.k, L = crew.bagLen;
  out.vis = true; out.lift = 0;
  out.x = RACK.x; out.y = RACK.y; out.z = RACK.z;
  if (s !== 'cartridge') return out;
  const lx = RACK.x + 0.25, ly = RACK.y + 0.2, zc = ZB + 0.05;
  if (k < 0.08) return out;
  if (k < 0.16) { const e = smooth(k, 0.08, 0.16); out.x = lerp(RACK.x, lx, e); out.y = lerp(RACK.y, ly, e); out.lift = e; return out; }
  out.lift = 1;
  if (k < 0.36) { out.x = lx; out.y = ly; out.z = lerp(RACK.z, zc, smooth(k, 0.16, 0.36)); return out; }
  if (k < 0.46) { const e = smooth(k, 0.36, 0.46); out.x = lerp(lx, 0, e); out.y = lerp(ly, TY, e); out.z = zc; out.lift = 1 - smooth(k, 0.42, 0.46); return out; }
  out.lift = 0; out.x = 0; out.y = TY;
  out.z = lerp(zc, BRE - 0.02 - L / 2, smooth(k, 0.5, 0.8));
  out.vis = k < 0.84;
  return out;
}
const BAG_P = { x: 0, y: 0, z: 0, vis: true, lift: 0 };

// carriage frame -> rig root
const toRoot = (crew, x, z, out = _p) => { out.x = x * crew.ca + z * crew.sa; out.z = -x * crew.sa + z * crew.ca; return out; };
const toRootV = (crew, x, y, z, v) => v.set(x * crew.ca + z * crew.sa, y, -x * crew.sa + z * crew.ca);
function place(crew, m, x, y, z, h, pose, t) {
  toRoot(crew, x, z);
  m.put(_p.x, y, _p.z, h + crew.az, pose, t);
}
// a walk in the carriage frame from a to b, k 0..1; facing the way he goes, `face` when standing
function walk(crew, m, ax, az, bx, bz, k, y, face, gait = 'walk') {
  const d = Math.hypot(bx - ax, bz - az), kk = clamp01(k), e = smooth(kk, 0, 1);
  const moving = kk > 0 && kk < 1 && d > 0.05;
  const stride = gait === 'carryWalk' ? CSTRIDE : gait === 'sidestep' ? SSTRIDE : STRIDE;
  const h = moving && gait !== 'sidestep' ? headingOf(bx - ax, bz - az) : face;
  place(crew, m, lerp(ax, bx, e), y, lerp(az, bz, e), h, moving ? gait : gait === 'carryWalk' ? 'carry' : 'stand', moving ? (d * e) / stride : crew.idleT + m.seed);
}
const hand = (crew, m, side, x, y, z, w) => { toRootV(crew, x, y, z, _v); m.hand(side, _v.x, _v.y, _v.z, w); };

export function state(crew, c) {
  if (!use(crew)) return false;
  if (!crew.mxBars) {
    // the staff's cross handles, where the two pairs push
    crew.mxBars = true;
    const iron = crew.staff.children[1]?.material;
    for (const off of RAM_OFF) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2 * BAR, 6).rotateZ(Math.PI / 2), iron);
      bar.position.z = off;
      bar.castShadow = true;
      crew.staff.add(bar);
    }
  }
  // nothing of crews.js's generic tray and staff: this drill places its own
  crew.staffA = null;
  crew.shellA_a = null;
  crew.ramK = 0;
  staffAt(c, crew, STAFF_P);
  bagAt(c, crew, BAG_P);
  return true;
}

export function mechanisms(crew, c) {
  if (!use(crew)) return false;
  const rig = crew.rig;
  rig.setTrolley?.(carZ(c));
  rig.setHoist?.(hookY(c));
  rig.update?.(0.016);
  return true;
}

export function act(crew, m, c, h) {
  if (!use(crew)) return false;
  switch (m.beh) {
    case 'mxRam': ramMan(crew, m, c); return true;
    case 'mxCar': carMan(crew, m, c); return true;
    case 'mxChg': chargeMan(crew, m, c); return true;
    case 'mxLan': return lanyardMan(crew, m, c, h);
    case 'mxWinch': {
      const k = c.s === 'shell' ? c.k : -1, on = (k >= 0 && k < 0.12) || (k > 0.2 && k < 0.45) || (k > 0.55 && k < 0.78);
      place(crew, m, m.spot.x, m.spot.y, m.spot.z, m.spot.heading, on ? 'operate' : 'stand', on ? c.now * 1.3 : crew.idleT + m.seed);
      return true;
    }
    case 'mxSling': {
      const k = c.s === 'shell' ? c.k : -1, on = k > 0.08 && k < 0.24;
      const w = smooth(k, 0.08, 0.13) * (1 - smooth(k, 0.19, 0.24));
      place(crew, m, m.spot.x - 0.1 * w, 0, m.spot.z, m.spot.heading, on ? 'lift' : 'stand', on ? 0.6 : crew.idleT + m.seed);
      if (w > 0.01) {
        hand(crew, m, 'L', 0.18, MAX38.WAGON_Y + SHELL.rad + 0.05, ZHOIST + 0.6, w);
        hand(crew, m, 'R', 0.18, MAX38.WAGON_Y + SHELL.rad + 0.05, ZHOIST + 0.15, w);
      }
      return true;
    }
  }
  return false;
}

// the rammers: home on the left walkway; in line two each side of the staff
function ramMan(crew, m, c) {
  const i = +m.role.slice(-1) - 1, pair = i >> 1, side = i % 2 ? 1 : -1, off = RAM_OFF[pair];
  const hx = m.spot.x, hz = m.spot.z, s = c.s, k = c.k, st = STAFF_P;
  const lx = side * LANE;
  let inL = -1, outL = -1, k0 = 0, k1 = 0;
  if (s === 'ram') { inL = smooth(k, 0, 0.12); outL = smooth(k, 0.86, 0.98); k0 = 0; k1 = 0.86; }
  else if (s === 'cartridge') { inL = smooth(k, 0.32, 0.44); outL = smooth(k, 0.88, 0.98); k0 = 0.32; k1 = 0.88; }
  if (inL < 0 || k < k0 || k > 0.98 + 0.019) { place(crew, m, hx, WALK, hz, m.spot.heading, 'stand', crew.idleT + m.seed); return; }
  // where his hold point on the staff is, at the stroke's start and now
  const zStart = (s === 'ram' ? ZB + HALF : ZB + 0.05 + crew.bagLen / 2) + off, zNow = st.z + off;
  if (k < k1 - 0.0001 && inL < 1) {
    walk(crew, m, hx, hz, lx, zStart, inL, WALK, 0);
  } else if (k >= k1) {
    walk(crew, m, lx, zStart, hx, hz, outL, WALK, m.spot.heading);
  } else {
    // in line: he steps with the staff
    const pushing = Math.abs(zNow - zStart) > 0.02;
    const t = (zStart - zNow) / STRIDE;
    place(crew, m, lx, WALK, zNow, 0, pushing ? 'walk' : 'ramLoad', pushing ? t : 0.6);
  }
  // hands on the staff (at his hold point) while it is off its hooks
  const hold = s === 'ram' ? smooth(k, 0.02, 0.06) * (1 - smooth(k, 0.94, 0.98)) : smooth(k, 0.36, 0.4) * (1 - smooth(k, 0.94, 0.98));
  if (hold > 0.01) {
    const hz2 = st.z + off;
    // on his end of the cross handle (the staff turns into line with them)
    const hx2 = st.x + side * 0.68 * st.line;
    hand(crew, m, 'R', hx2, st.y, hz2 - 0.04, hold);
    hand(crew, m, 'L', hx2 + side * 0.12 * st.line, st.y, hz2 + 0.04, hold);
  }
}

// the two car men: in the lane on the left of the car, hands on its handles
function carMan(crew, m, c) {
  const j = m.role === 'car1' ? 0 : 1, s = c.s, k = c.k, zc = carZ(c), lane = -1.12, hzc = HANDLES[j];
  const at = (z) => z + hzc;
  let grip = 1;
  if (s === 'shell' && k > 0.95) {
    walk(crew, m, lane, at(ZB), ASIDE[j][0], ASIDE[j][1], (k - 0.95) / 0.05, WALK, -Math.PI / 2);
    grip = 0;
  } else if (s === 'ram' || s === 'cartridge') {
    place(crew, m, ASIDE[j][0], WALK, ASIDE[j][1], -Math.PI / 2, 'stand', crew.idleT + m.seed);
    grip = 0;
  } else if (s === 'close' && k < 0.15) {
    walk(crew, m, ASIDE[j][0], ASIDE[j][1], lane, at(ZB), k / 0.15, WALK, -Math.PI / 2);
    grip = smooth(k, 0.1, 0.15);
  } else {
    const moving = (s === 'shell' && ((k > 0.45 && k < 0.55) || (k > 0.66 && k < 0.95))) || (s === 'close' && k > 0.15 && k < 0.95);
    const back = s === 'shell' && k < 0.6; // running it back toward the hoist
    const t = zc / STRIDE;
    place(crew, m, lane, WALK, at(zc), moving ? (back ? Math.PI : 0) : -Math.PI / 2, moving ? 'walk' : 'stand', moving ? t : crew.idleT + m.seed);
    grip = moving ? 1 : s === 'shell' && k > 0.42 ? 1 : 0;
  }
  if (grip > 0.01) {
    hand(crew, m, 'L', -0.6, TY - 0.45, zc + hzc - 0.04, grip);
    hand(crew, m, 'R', -0.6, TY - 0.45, zc + hzc + 0.04, grip);
  }
  // steadying the shell as it comes down onto the car
  if (s === 'shell' && k > 0.55 && k < 0.66) {
    const w = smooth(k, 0.55, 0.58) * (1 - smooth(k, 0.63, 0.66));
    hand(crew, m, j ? 'R' : 'L', -0.2, hookY(c) - MAX38.HANG, zc - 0.4 + j * 0.8, w);
  }
}

// the two charge men: from the rack on the right of the rear wing to the car, the charge between them
function chargeMan(crew, m, c) {
  const j = m.role === 'charge1' ? 0 : 1, s = c.s, k = c.k, b = BAG_P, dz = j ? 0.5 : -0.5;
  const hx = m.spot.x, hz = m.spot.z, face = Math.PI / 2;
  const rackZ = RACK.z + dz, carZ0 = ZB + 0.05 + dz;
  const aside = [CHG_X, ZB + 0.05 + dz - 0.1];
  if (s === 'cartridge') {
    if (k < 0.08) walk(crew, m, hx, hz, CHG_X, rackZ, k / 0.08, WALK, face);
    else if (k < 0.16) place(crew, m, CHG_X, WALK, rackZ, face, 'lift', smooth(k, 0.08, 0.16));
    else if (k < 0.36) { const e = smooth(k, 0.16, 0.36); place(crew, m, CHG_X, WALK, b.z + dz, face, e > 0 && e < 1 ? 'sidestep' : 'carry', (RACK.z - b.z) / SSTRIDE); }
    else if (k < 0.46) { const e = smooth(k, 0.36, 0.42) * (1 - smooth(k, 0.42, 0.46)); place(crew, m, lerp(CHG_X, 1.02, e), WALK, carZ0, face, 'carry', 0); }
    else place(crew, m, aside[0], WALK, aside[1], face, 'stand', crew.idleT + m.seed);
    if (b.lift > 0.01 || (k > 0.07 && k < 0.46)) {
      const w = k < 0.16 ? smooth(k, 0.07, 0.1) : 1 - smooth(k, 0.42, 0.46);
      const ez = b.z + (j ? 1 : -1) * 0.55;
      hand(crew, m, 'L', b.x + 0.05, b.y - 0.12, ez - 0.08, w);
      hand(crew, m, 'R', b.x + 0.05, b.y - 0.12, ez + 0.08, w);
    }
  } else if (s === 'close' || s === 'prime') {
    // back to their places by the rack
    const kk = s === 'close' ? k * 0.7 : 0.7 + k * 0.3;
    walk(crew, m, aside[0], aside[1], hx, hz, kk, WALK, face);
  } else place(crew, m, hx, WALK, hz, face, 'stand', crew.idleT + m.seed);
}

// the lanyard man works the wedge's handwheel, primes the lock and fires (crews.js's lanyard for the shot)
function lanyardMan(crew, m, c, h) {
  const s = c.s, k = c.k, rig = crew.rig;
  const wheel = s === 'open' ? k < 0.85 : s === 'close' ? k > 0.25 : false;
  if (wheel || s === 'prime') {
    const ax = m.spot.x, az = m.spot.z, bx = s === 'prime' ? 0.95 : 1.0, bz = s === 'prime' ? BRE + 0.62 : BRE + 0.58;
    const kk = s === 'open' ? smooth(k, 0, 0.12) * (1 - smooth(k, 0.75, 0.85)) : s === 'close' ? smooth(k, 0.25, 0.35) * (1 - smooth(k, 0.92, 1)) : smooth(k, 0, 0.2) * (1 - smooth(k, 0.8, 1));
    const e = clamp01(kk * 1.0001);
    toRoot(crew, lerp(ax, bx, e), lerp(az, bz, e));
    const target = s === 'prime' ? MAX38.LOCK : MAX38.CRANK;
    _inv.copy(rig.root.matrixWorld).invert();
    const spin = s === 'prime' ? 0 : c.now * 2.4;
    const r = s === 'prime' ? 0 : 0.2; // the wheel turns in the x-y plane (its axis along the bore)
    _w.set(target.x + Math.cos(spin) * r, target.y + Math.sin(spin) * r, target.z);
    rig.pivots.recoil.localToWorld(_w).applyMatrix4(_inv);
    const face = headingOf(_w.x - _p.x, _w.z - _p.z);
    m.put(_p.x, WALK, _p.z, e > 0.9 ? face : m.spot.heading + crew.az + (face - m.spot.heading - crew.az) * e, e > 0.05 && e < 0.9 ? 'walk' : 'operate', e > 0.05 && e < 0.9 ? e * 2 : c.now * 1.2);
    const g = smooth(e, 0.85, 1);
    if (g > 0.01) {
      m.hand('R', _w.x, _w.y, _w.z, g);
      if (s !== 'prime') m.hand('L', _w.x, _w.y - 0.05, _w.z, g * 0.8);
    }
    return true;
  }
  crew.lanyardMan(m, c, h);
  return true;
}

export function props(crew, c) {
  if (!use(crew)) return false;
  const A = crew.shellA, B = crew.shellB, s = c.s, k = c.k;
  const yaw = crew.az;
  // the next shell on the wagon under the hoist
  const onWagon = !((s === 'shell' && k >= 0.12) || s === 'ram');
  toRootV(crew, 0, MAX38.WAGON_Y, ZHOIST, _v);
  crew.placeProp(B, _v, yaw, 0, onWagon);
  // the shell in hand: slung, hoisted, on the car, rammed
  let vis = false;
  if (s === 'shell' && k >= 0.12) {
    vis = true;
    if (k < 0.2) toRootV(crew, 0, MAX38.WAGON_Y, ZHOIST, _v);
    else if (k < 0.62) toRootV(crew, 0, hookY(c) - MAX38.HANG, ZHOIST, _v);
    else toRootV(crew, 0, TY, carZ(c), _v);
  } else if (s === 'ram' && k < 0.74) {
    vis = true;
    toRootV(crew, 0, TY, lerp(ZB, SEAT, smooth(k, 0.16, 0.7)), _v);
  }
  crew.placeProp(A, _v, yaw, 0, vis);
  // the charge: on the rack, carried, on the car, rammed
  const b = BAG_P;
  toRootV(crew, b.x, b.y, b.z, _v);
  crew.placeProp(crew.bag, _v, yaw, 0, b.vis);
  // the staff: on its hooks, or in the rammers' hands
  const st = STAFF_P;
  toRootV(crew, st.x, st.y, st.z, _v);
  crew.placeProp(crew.staff, _v, yaw, 0, true);
  crew.staff.rotation.z = (1 - st.line) * Math.PI / 2; // on its hooks the cross handles stand upright, out of the walkway
  crew.staff.updateMatrix();
  return true;
}

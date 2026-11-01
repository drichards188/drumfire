import * as THREE from 'three';
import { smooth, lerp, clamp01, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';
import { paced, pacedT, turn, along } from '../drill_pace.js';

// The 38 cm "Langer Max" drill on its Bettung (render/crews.js calls these hooks before its own; DESIGN.md "WW1 German
// mode"). The gun is loaded level (loadEl 0). Per loading step (k is the step's 0..1):
//   open       the lanyard man walks round to the wedge's handwheel on top of the breech ring and winds it open
//   shell      0-.12 the hook comes down through the well in the rear wing to the wagon on the ring track, .12-.2 the
//              slinger hooks the shell on, .2-.45 it is hoisted above the deck, .43-.55 the two car men run the
//              projectile car back under it, .55-.62 it is lowered onto the car, .66-.95 they push the car forward
//              to the breech, then walk to the front of the left walkway (into the ram step), out of the rammers' way
//   ram        the left pair of rammers lifts the 5.5 m staff off the left railing and swings it into line while the
//              right pair crosses behind the car to the right of it; all four ram the shell home 1.7 m past the
//              chamber, draw the staff back, swing it out and hang it up again
//   cartridge  the two charge men lift the next charge (the silk fore charge bag ahead of the brass main case) off
//              the rack on the right of the rear wing, carry it forward between them along the right walkway and
//              lay it on the car; the rammers ram it in behind the shell. The car men come back to the car.
//   close      the wedge is wound shut (the lanyard man at its handwheel); the car men run the car back to its place
//   prime      the lanyard man primes the lock behind the breech;  lay / ready / the shot: crews.js
// Every walk runs at an even pace with short ramps and every turn takes its time (drill_pace.js), the feet in step
// with the ground they cover. Worked in the carriage's frame at zero elevation (crew.az turns it into the rig's root
// frame), as a pure function of the piece's step, its time in the step and the time since the shot.
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
const STRIDE = CREW_GAITS.walk.stride, SSTRIDE = CREW_GAITS.sidestep.stride;
const V_WALK = 1.25; // m/s, a brisk walk on the deck
const RAM_OFF = [2.3, 3.25]; // where the front and rear pairs hold the staff behind its head
const ASIDE = [[-1.95, 4.35], [-1.95, 5.3]]; // the car men out of the rammers' way, at the front of the left walkway
const CAR_LANE = -1.05; // the car men's lane on the left of the car (its wheels reach 0.78 from the middle)
const RAIL_TOP = { x: -0.42, dy: -0.16 }; // the car's top side rail (car frame: x, y below the bore's height)
const CHG_X = 1.75; // the charge men's lane on the right walkway
const LANE = 1.05; // the rammers walk beside the car, clear of its wheels, and push on the staff's cross handles
const TAKE_X = -1.85; // the left pair stands here to lift the staff off its hooks on the left railing
const BAR = 0.8; // the cross handles' half length
const WRENCH = { x: 0.75, dz: 0.3 }; // where the lanyard man stands to wind the wedge's handwheel (z: BRE + dz)
const PRIME = { x: -0.2, dz: 0.5 }; // and to prime the lock, behind the breech between the car's rails
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _p = { x: 0, z: 0 };
const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }], _P = { x: 0, z: 0, h: 0, d: 0, len: 0 };

// The rammer staff's stroke windows (shares of the step): swung into line off the hooks, the push, the draw back, swung
// out. The rammers' own walks fit round them.
const RAMW = {
  ram: { take: [0, 0.06], cross: [0, 0.17], swing: [0.06, 0.18], push: [0.2, 0.5], draw: [0.56, 0.8], out: [0.8, 0.88] },
  cartridge: { take: [0.3, 0.34], cross: [0.27, 0.42], swing: [0.34, 0.44], push: [0.48, 0.62], draw: [0.66, 0.78], out: [0.8, 0.88] },
};
// the step lengths (s) of the job (crew upgrades scale them all alike)
const durOf = (c) => c.p.job?.dur ?? 10;
function stroke(c, crew) {
  const W = RAMW[c.s];
  if (!W) return null;
  const k = c.k, dur = durOf(c), ram = c.s === 'ram';
  const z0 = ram ? ZB + HALF : ZB + 0.05 + crew.bagLen / 2, z1 = ram ? SEAT + HALF : BRE - 0.02, L = Math.abs(z0 - z1);
  const line = smooth(k, W.swing[0], W.swing[1]) * (1 - smooth(k, W.out[0], W.out[1]));
  const pushE = paced(k, W.push[0], W.push[1], dur, L, ram ? 1.0 : 0.9, 0.35);
  const drawE = paced(k, W.draw[0], W.draw[1], dur, L, 1.1, 0.35);
  return { W, line, z: lerp(z0, z1, pushE * (1 - drawE)), z0, z1, pushE, drawE };
}

// the staff's head (carriage frame) and how far it is in line with the bore (0 on its hooks, 1 in line)
function staffAt(c, crew, out) {
  const S = stroke(c, crew);
  const line = S ? S.line : 0, z = S ? S.z : ZB + HALF;
  out.x = lerp(SR.x, 0, line); out.y = lerp(SR.y, TY, line) + Math.sin(line * Math.PI) * 0.25; out.z = lerp(SR.z, z, line);
  out.line = line; out.S = S;
  return out;
}
const STAFF_P = { x: 0, y: 0, z: 0, line: 0, S: null };

// the projectile car (the shell's middle on it), driven at the car men's walking pace, and the hook
function carZ(c) {
  const s = c.s, k = c.k, dur = durOf(c);
  if (s === 'shell') {
    if (k < 0.6) return lerp(ZWAIT, ZHOIST, paced(k, 0.43, 0.55, dur, ZHOIST - ZWAIT, 1.2, 0.4));
    return lerp(ZHOIST, ZB, paced(k, 0.66, 0.95, dur, ZHOIST - ZB, 1.1, 0.5));
  }
  if (s === 'ram' || s === 'cartridge') return ZB;
  if (s === 'close') return lerp(ZB, ZWAIT, paced(k, 0.12, 0.95, dur, ZWAIT - ZB, 1.0, 0.45));
  return ZWAIT;
}
// when the car is moving: [start, end] in shares of the step, its direction (+1 toward the hoist)
function carMove(c) {
  const s = c.s, dur = durOf(c);
  const fit = (a, b, d, v, r) => [a, a + Math.min((b - a) * dur, d / v + r) / dur];
  if (s === 'shell') return c.k < 0.6 ? [...fit(0.43, 0.55, ZHOIST - ZWAIT, 1.2, 0.4), 1] : [...fit(0.66, 0.95, ZHOIST - ZB, 1.1, 0.5), -1];
  if (s === 'close') return [...fit(0.12, 0.95, ZWAIT - ZB, 1.0, 0.45), 1];
  return null;
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

// The charge: on the rack, lifted, carried forward between the two charge men along the right walkway at hip height,
// laid on the car, rammed. CH: the charge men's windows in the cartridge step.
const CH = { walk: [0, 0.05], lift: [0.05, 0.12], turn1: [0.12, 0.145], carry: [0.145, 0.37], turn2: [0.37, 0.395], lay: [0.395, 0.46], back: [0.46, 0.5] };
const CARRY_X = CHG_X - 0.38, CARRY_DY = 0.8; // the charge between them: inboard of their lane, at hip height
function bagAt(c, crew, out) {
  const s = c.s, k = c.k, L = crew.bagLen;
  out.vis = true;
  out.x = RACK.x; out.y = RACK.y; out.z = RACK.z;
  if (s !== 'cartridge') return out;
  const zc = ZB + 0.05, cy = WALK + CARRY_DY;
  if (k < CH.lift[0]) return out;
  if (k < CH.carry[0]) { const e = smooth(k, CH.lift[0], CH.lift[1]); out.x = lerp(RACK.x, CARRY_X, e); out.y = lerp(RACK.y, cy, e) + 0.08 * Math.sin(Math.PI * e); return out; }
  if (k < CH.lay[0]) { out.x = CARRY_X; out.y = cy; out.z = lerp(RACK.z, zc, carryE(c, crew)); return out; }
  const S = stroke(c, crew);
  if (k < CH.back[0]) { const e = smooth(k, CH.lay[0], CH.lay[1]); out.x = lerp(CARRY_X, 0, e); out.y = lerp(cy, TY, e) + 0.12 * Math.sin(Math.PI * e); out.z = zc; return out; }
  out.x = 0; out.y = TY;
  out.z = lerp(zc, BRE - 0.02 - L / 2, S ? S.pushE : 0);
  out.vis = !S || S.drawE <= 0;
  return out;
}
const carryE = (c, crew) => paced(c.k, CH.carry[0], CH.carry[1], durOf(c), RACK.z - ZB - 0.05, 1.35, 0.4);
const BAG_P = { x: 0, y: 0, z: 0, vis: true };

// carriage frame -> rig root
const toRoot = (crew, x, z, out = _p) => { out.x = x * crew.ca + z * crew.sa; out.z = -x * crew.sa + z * crew.ca; return out; };
const toRootV = (crew, x, y, z, v) => v.set(x * crew.ca + z * crew.sa, y, -x * crew.sa + z * crew.ca);
function place(crew, m, x, y, z, h, pose, t) {
  toRoot(crew, x, z);
  m.put(_p.x, y, _p.z, h + crew.az, pose, t);
}
// a walk in the carriage frame from a to b, e its share of the way (from paced), heading from h0 into the walk and out
// of it to h1 (each over the walk's first and last 0.6 m)
function walkE(crew, m, ax, az, bx, bz, e, y, h0, h1, gait = 'walk') {
  _path[0].x = ax; _path[0].z = az; _path[1].x = bx; _path[1].z = bz;
  along(_path, 2, e, _P, h0, h1);
  const moving = e > 0 && e < 1 && _P.len > 0.05;
  const stride = gait === 'carryWalk' ? CREW_GAITS.carryWalk.stride : STRIDE;
  place(crew, m, _P.x, y, _P.z, moving ? _P.h : e >= 1 ? h1 : h0, moving ? gait : 'stand', moving ? _P.d / stride : crew.idleT + m.seed);
}
const hand = (crew, m, side, x, y, z, w) => { toRootV(crew, x, y, z, _v); m.hand(side, _v.x, _v.y, _v.z, w); };
const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
const win = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));

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
      // on the ground by the wagon: he steps in, stoops and hooks the sling on round the shell, steps back
      const k = c.s === 'shell' ? c.k : -1;
      const e = smooth(k, 0.06, 0.1) * (1 - smooth(k, 0.2, 0.24)), w = smooth(k, 0.1, 0.13) * (1 - smooth(k, 0.17, 0.2));
      const moving = e > 0.001 && e < 0.999, back = k > 0.2;
      place(crew, m, m.spot.x - 0.45 * e, 0, m.spot.z, m.spot.heading, moving ? 'walk' : e >= 0.999 ? 'lift' : 'stand', moving ? (back ? -1 : 1) * 0.45 * (back ? 1 - e : e) / STRIDE : e >= 0.999 ? 0.6 : crew.idleT + m.seed);
      if (w > 0.01) {
        hand(crew, m, 'L', 0.16, MAX38.WAGON_Y + SHELL.rad + 0.04, ZHOIST + 0.45, w);
        hand(crew, m, 'R', 0.16, MAX38.WAGON_Y + SHELL.rad + 0.04, ZHOIST - 0.05, w);
      }
      return true;
    }
  }
  return false;
}

// The rammers. The left pair (1, 3) step to the staff on its hooks, lift it, carry it into line sidestepping to their
// lane; the right pair (2, 4) cross behind the car to theirs and take hold once it is in line. All four walk the
// stroke facing the breech in one gait, the phase their place along the lane, so their feet stay put through the
// push, the hold and the draw. Then the right pair let go and go home, the left pair swing it out and hang it up.
function ramMan(crew, m, c) {
  const i = +m.role.slice(-1) - 1, pair = i >> 1, side = i % 2 ? 1 : -1, off = RAM_OFF[pair];
  const hx = m.spot.x, hz = m.spot.z, hh = m.spot.heading, k = c.k, st = STAFF_P, S = st.S, dur = durOf(c);
  if (!S) { place(crew, m, hx, WALK, hz, hh, 'stand', crew.idleT + m.seed); return; }
  const W = S.W, lx = side * LANE, zS = S.z0 + off, zH = SR.z + off;
  const left = side < 0;
  // his place in the lane through the stroke, and the gait's phase there
  const inLane = () => place(crew, m, lx, WALK, S.z + off, 0, 'walk', (zS - (S.z + off)) / STRIDE);
  let hold = 0;
  if (left) {
    const t0 = W.take[0], d0 = dist(hx, hz, TAKE_X, zH);
    const homeK = W.out[1] + 0.04, dH = dist(TAKE_X, zH, hx, hz);
    if (k < t0) place(crew, m, hx, WALK, hz, hh, 'stand', crew.idleT + m.seed);
    else if (k < W.swing[0]) { walkE(crew, m, hx, hz, TAKE_X, zH, paced(k, t0, W.swing[0], dur, d0, V_WALK, 0.3), WALK, hh, 0); hold = smooth(k, W.swing[0] - 0.02, W.swing[0]); }
    else if (k < W.swing[1]) {
      // carrying it into line: a sidestep to the right, facing along it
      swingMan(crew, m, st.line, lx, zH, zS);
      hold = 1;
    } else if (k < W.out[0]) { inLane(); hold = 1; }
    else if (k < W.out[1]) {
      swingMan(crew, m, st.line, lx, zH, zS);
      hold = 1;
    } else if (k < homeK) { place(crew, m, TAKE_X, WALK, zH, 0, 'stand', crew.idleT + m.seed); hold = 1 - smooth(k, homeK - 0.02, homeK); }
    else walkE(crew, m, TAKE_X, zH, hx, hz, paced(k, homeK, 1, dur, dH, V_WALK, 0.3), WALK, 0, hh);
  } else {
    const d0 = dist(hx, hz, lx, zS), go = W.out[0] + 0.02, dH = dist(lx, zS, hx, hz);
    if (k < W.cross[0]) place(crew, m, hx, WALK, hz, hh, 'stand', crew.idleT + m.seed);
    else if (k < W.push[0] && st.line < 0.999) walkE(crew, m, hx, hz, lx, zS, paced(k, W.cross[0], W.cross[1], dur, d0, V_WALK, 0.3), WALK, hh, 0);
    else if (k < go) inLane();
    else walkE(crew, m, lx, zS, hx, hz, paced(k, go, Math.min(1, go + 0.18), dur, dH, V_WALK, 0.3), WALK, 0, hh);
    hold = k < go ? smooth(st.line, 0.85, 0.98) : 1 - smooth(k, go - 0.02, go);
  }
  // hands on the staff at his hold point: on the cross handle's end once it is in line, on the staff itself on the hooks
  if (hold > 0.01) {
    const hz2 = st.z + off, hx2 = st.x + side * 0.68 * st.line;
    hand(crew, m, 'R', hx2, st.y, hz2 - 0.05, hold);
    hand(crew, m, 'L', hx2 + side * 0.12 * st.line, st.y, hz2 + 0.05, hold);
  }
}

// a left rammer while the staff swings between its hooks (outboard of him) and the line (inboard): he sidesteps
// inboard with it and gives back a step as it passes across in front of him, so it never goes through him
function swingMan(crew, m, e, lx, zH, zS) {
  const x = lerp(TAKE_X, lx, e), z = lerp(zH, zS, e) + 0.42 * Math.sin(Math.PI * e);
  place(crew, m, x, WALK, z, 0, e > 0.01 && e < 0.99 ? 'sidestep' : 'stand', (x - TAKE_X) / SSTRIDE);
}

// The two car men in their lane on the left of the car. Standing by it they face it; to move it they turn into the
// direction of travel over 0.4 s before it sets off (and back after it stops), the inner hand on its top rail, walking
// at its pace. When it is at the breech they go to the front of the left walkway and come back in the cartridge step.
function carMan(crew, m, c) {
  const j = m.role === 'car1' ? 0 : 1, s = c.s, k = c.k, zc = carZ(c), hzc = HANDLES[j], dur = durOf(c);
  const FACE = -Math.PI / 2; // facing the car (+X)
  const at = (z) => z + hzc;
  let grip = 0, inner = 'L';
  // to the front of the left walkway after the car reaches the breech (shell .95 into the ram step), back for the close
  const awayT = s === 'shell' && k > 0.95 ? (k - 0.95) * dur : s === 'ram' ? 0.05 * 24 * (dur / 13) + k * dur : -1;
  const dA = dist(CAR_LANE, at(ZB), ASIDE[j][0], ASIDE[j][1]);
  if (awayT >= 0) {
    const e = pacedT(awayT, dA, V_WALK, 0.3);
    walkE(crew, m, CAR_LANE, at(ZB), ASIDE[j][0], ASIDE[j][1], e, WALK, FACE, FACE);
  } else if (s === 'cartridge') {
    const e = paced(k, 0.84, 1, dur, dA, 1.1, 0.3);
    walkE(crew, m, ASIDE[j][0], ASIDE[j][1], CAR_LANE, at(ZB), e, WALK, FACE, FACE);
    grip = 0;
  } else {
    const mv = carMove(c);
    let h = FACE, moving = false;
    if (mv) {
      const [a, b, dir] = mv, ta = (k - a) * dur, tb = (k - b) * dur, travel = dir > 0 ? Math.PI : 0;
      // turned into the way before it sets off, back to face the car after it stops
      h = ta < 0 ? turn(FACE, travel, (ta + 0.45) / 0.4) : tb > 0 ? turn(travel, FACE, tb / 0.4) : travel;
      moving = ta > 0 && tb < 0;
      inner = dir > 0 ? 'L' : 'R';
      grip = smooth(ta, -0.5, -0.1) * (1 - smooth(tb, 0.1, 0.5));
    }
    place(crew, m, CAR_LANE, WALK, at(zc), h, moving ? 'walk' : 'stand', moving ? zc / STRIDE * (mv[2] > 0 ? 1 : -1) : crew.idleT + m.seed);
    // facing the car while it waits under the hook: both hands on the rail, steadying it
    if (s === 'shell' && k > 0.55 && k < 0.66) grip = Math.max(grip, win(k, 0.55, 0.58, 0.63, 0.66));
  }
  if (grip > 0.01) {
    hand(crew, m, inner, RAIL_TOP.x, TY + RAIL_TOP.dy, zc + hzc, grip);
    if (s === 'shell' && k > 0.55 && k < 0.66) hand(crew, m, inner === 'L' ? 'R' : 'L', RAIL_TOP.x, TY + RAIL_TOP.dy, zc + hzc + (j ? 0.3 : -0.3), win(k, 0.55, 0.58, 0.63, 0.66));
  }
}

// The two charge men: lift the charge off the rack together, turn and carry it forward in file along the right
// walkway (the inner hand on its end, the outer arm swinging), turn to the car, step in and lay it on, step back.
function chargeMan(crew, m, c) {
  const j = m.role === 'charge1' ? 0 : 1, s = c.s, k = c.k, b = BAG_P, L = crew.bagLen, dur = durOf(c);
  const hx = m.spot.x, hz = m.spot.z, FACE = Math.PI / 2; // facing the rack and the car (-X)
  const endZ = (zc) => zc + (j ? 1 : -1) * (L / 2 + 0.12); // his end of the charge (charge1 the front)
  const lane = CHG_X, inX = 1.1, zc0 = ZB + 0.05;
  let hands = 0;
  if (s === 'cartridge') {
    if (k < CH.walk[1]) walkE(crew, m, hx, hz, lane, endZ(RACK.z), paced(k, 0, CH.walk[1], dur, dist(hx, hz, lane, endZ(RACK.z)), 1.0, 0.25), WALK, FACE, FACE);
    else if (k < CH.turn1[0]) { place(crew, m, lane, WALK, endZ(RACK.z), FACE, 'lift', 0.35 + 0.5 * smooth(k, CH.lift[0], CH.lift[1])); hands = smooth(k, CH.lift[0], CH.lift[0] + 0.02); }
    else if (k < CH.carry[0]) { place(crew, m, lane, WALK, endZ(RACK.z), turn(FACE, 0, smooth(k, CH.turn1[0], CH.turn1[1])), 'stand', 0); hands = 1; }
    else if (k < CH.turn2[0]) {
      const e = carryE(c, crew), z = endZ(lerp(RACK.z, zc0, e));
      place(crew, m, lane, WALK, z, 0, e > 0 && e < 1 ? 'walk' : 'stand', (RACK.z - lerp(RACK.z, zc0, e)) / STRIDE);
      hands = 1;
    } else if (k < CH.lay[0]) { place(crew, m, lane, WALK, endZ(zc0), turn(0, FACE, smooth(k, CH.turn2[0], CH.turn2[1])), 'stand', 0); hands = 1; }
    else if (k < CH.back[0]) {
      // two steps in toward the car with it, lifting it over the car's side
      const e = paced(k, CH.lay[0], CH.lay[0] + 0.035, dur, lane - inX, 1.0, 0.25);
      place(crew, m, lerp(lane, inX, e), WALK, endZ(zc0), FACE, e > 0 && e < 1 ? 'walk' : 'operate', e > 0 && e < 1 ? (lane - inX) * e / STRIDE : 0);
      hands = 1 - smooth(b.x, 0.5, 0.25);
    } else if (k < CH.back[1]) {
      // and back out, stepping backwards
      const e = paced(k, CH.back[0], CH.back[1], dur, lane - inX, 0.9, 0.25);
      place(crew, m, lerp(inX, lane, e), WALK, endZ(zc0), FACE, e > 0 && e < 1 ? 'walk' : 'stand', e > 0 && e < 1 ? -(lane - inX) * e / STRIDE : crew.idleT + m.seed);
    } else place(crew, m, lane, WALK, endZ(zc0), FACE, 'stand', crew.idleT + m.seed);
    if (hands > 0.01) {
      // the inner hand under his end of the charge (both while lifting and laying it in)
      const ez = b.z + (j ? 1 : -1) * (L / 2 - 0.1), both = k < CH.carry[0] || k > CH.lay[0];
      hand(crew, m, j ? 'L' : 'R', b.x + 0.04, b.y - 0.12, ez, hands);
      if (both) hand(crew, m, j ? 'R' : 'L', b.x + 0.04, b.y - 0.12, ez - (j ? 0.25 : -0.25), hands);
    }
  } else if (s === 'close' || s === 'prime') {
    // back to their places by the rack
    const d = dist(lane, endZ(zc0), hx, hz), kk = s === 'close' ? k : 1;
    walkE(crew, m, lane, endZ(zc0), hx, hz, paced(kk, 0, 1, durOf(c), d, V_WALK, 0.3), WALK, FACE, FACE);
  } else place(crew, m, hx, WALK, hz, FACE, 'stand', crew.idleT + m.seed);
}

// The lanyard man walks round to the wedge's handwheel on top of the breech ring to wind it open and shut (arms up to
// it), primes the lock from behind the breech, and is back at his post for the lay, where crews.js's lanyard drill
// takes over.
function lanyardMan(crew, m, c, h) {
  const s = c.s, k = c.k, rig = crew.rig, dur = durOf(c);
  const hx = m.spot.x, hz = m.spot.z, hh = m.spot.heading;
  const wx = WRENCH.x, wz = BRE + WRENCH.dz, px = PRIME.x, pz = BRE + PRIME.dz;
  let work = 0, target = null;
  _inv.copy(rig.root.matrixWorld).invert();
  const wheelAt = (spin, out) => {
    // a point on the handwheel's rim (it turns in the x-y plane, its axis along the bore), in root space
    _w.set(MAX38.CRANK.x + Math.cos(spin) * 0.2, MAX38.CRANK.y + Math.sin(spin) * 0.2, MAX38.CRANK.z);
    return rig.pivots.recoil.localToWorld(out.copy(_w)).applyMatrix4(_inv);
  };
  if (s === 'open' || s === 'close') {
    const dW = dist(hx, hz, wx, wz), a = s === 'open' ? 0.18 : 0.2, b = s === 'open' ? 0.85 : 0.92;
    const faceW = headingOf(MAX38.CRANK.x - wx, MAX38.CRANK.z - wz);
    if (k < a) { const e = paced(k, 0, a, dur, dW, V_WALK, 0.3); walkE(crew, m, hx, hz, wx, wz, e, WALK, hh, faceW); }
    else if (k < b || s === 'close') { place(crew, m, wx, WALK, wz, faceW, 'reachUp', 0.25); work = win(k, a, a + 0.05, b - 0.05, b); target = 'wheel'; }
    else { const e = paced(k, b, 1, dur, dW, V_WALK, 0.3); walkE(crew, m, wx, wz, hx, hz, e, WALK, faceW, hh); }
  } else if (s === 'prime') {
    const dP = dist(wx, wz, px, pz), faceP = 0;
    const faceW = headingOf(MAX38.CRANK.x - wx, MAX38.CRANK.z - wz);
    if (k < 0.25) { const e = paced(k, 0, 0.25, dur, dP, 1.0, 0.3); walkE(crew, m, wx, wz, px, pz, e, WALK, faceW, faceP); }
    else { place(crew, m, px, WALK, pz, faceP, 'operate', crew.idleT + m.seed); work = win(k, 0.28, 0.4, 0.8, 0.95); target = 'lock'; }
  } else if (s === 'lay' && k < 0.3) {
    const dH = dist(px, pz, hx, hz), e = paced(k, 0, 0.3, dur, dH, V_WALK, 0.3);
    walkE(crew, m, px, pz, hx, hz, e, WALK, 0, hh);
  } else {
    crew.lanyardMan(m, c, h);
    return true;
  }
  if (work > 0.01) {
    if (target === 'wheel') {
      // both hands on the rim, a quarter turn apart, winding (the wedge's wheel on top of the ring)
      const spin = c.now * 2.4;
      wheelAt(spin, _v); m.hand('R', _v.x, _v.y, _v.z, work);
      wheelAt(spin + 1.6, _v); m.hand('L', _v.x, _v.y, _v.z, work * 0.9);
    } else {
      _w.set(MAX38.LOCK.x, MAX38.LOCK.y, MAX38.LOCK.z);
      rig.pivots.recoil.localToWorld(_v.copy(_w)).applyMatrix4(_inv);
      m.hand('R', _v.x, _v.y, _v.z, work);
    }
  }
  return true;
}

export function props(crew, c) {
  if (!use(crew)) return false;
  const A = crew.shellA, B = crew.shellB, s = c.s, k = c.k;
  const yaw = crew.az, S = STAFF_P.S;
  // the next shell on the wagon under the hoist
  const onWagon = !((s === 'shell' && k >= 0.12) || s === 'ram');
  toRootV(crew, 0, MAX38.WAGON_Y, ZHOIST, _v);
  crew.placeProp(B, _v, yaw, 0, onWagon);
  // the shell in hand: slung, hoisted, on the car, rammed (with the staff's head, until it is home)
  let vis = false;
  if (s === 'shell' && k >= 0.12) {
    vis = true;
    if (k < 0.2) toRootV(crew, 0, MAX38.WAGON_Y, ZHOIST, _v);
    else if (k < 0.62) toRootV(crew, 0, hookY(c) - MAX38.HANG, ZHOIST, _v);
    else toRootV(crew, 0, TY, carZ(c), _v);
  } else if (s === 'ram' && S && S.drawE <= 0) {
    vis = true;
    toRootV(crew, 0, TY, lerp(ZB, SEAT, S.pushE), _v);
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

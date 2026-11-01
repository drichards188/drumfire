import * as THREE from 'three';
import { smooth, lerp, headingOf } from './anim.js';
import { CREW_GAITS } from '../models/v/crew.js';
import { paced, pacedT, turn, along } from './drill_pace.js';

// The drill of the WW2 railway guns laid on a curved firing spur (the 28 cm Kurze Bruno, the 21 cm K 12): render/de/bruno.js
// and render/de/k12.js export these hooks (render/crews_ww1.js picks them up by kind; render/crews.js calls them before
// its own drill). The model gives the places (rig.rail: models/v/de/bruno.js BRUNO, k12.js K12). The gun is loaded level
// (loadEl 0); the shell comes off the ammunition wagon coupled behind on the crab of the runway beam over the rear
// platform, onto the loading trolley, and is pushed to the breech over the rails' bridge. Per loading step (k its 0..1):
//   open       the lanyard man walks to the wedge's handwheel on the breech ring and winds it open (the bridge runs out)
//   shell      .0-.12 the hook comes down to the wagon, .12-.2 the slinger on the wagon slings the round, .2-.36 it is
//              hoisted, .36-.55 the crab runs it in over the trolley, .55-.62 it is lowered onto it, .66-.76 the hook goes
//              up and the crab back out; .68-.95 the two trolley men push the trolley to the breech, then step aside
//   ram        the left pair of rammers lifts the staff off its hooks on the shelter's left wall and swings it into line,
//              the right pair takes the cross handles; all four ram the shell home, draw the staff back, hang it up
//   cartridge  the two charge men lift the charge (the bag ahead of the brass case) off the rack, carry it forward along
//              the right side and lay it on the trolley; the rammers ram it in; .86-1 the trolley men run the trolley back
//              off the bridge
//   close      the lanyard man winds the wedge shut (the bridge runs back under the platform); the trolley goes back to
//              its place under the crab
//   prime      the lanyard man primes the lock;  depress, lay, ready, the shot: crews.js (layer, traverser, chief, lanyard)
// The men on the car stand in the body's frame (z along the car, its middle 0): rotated about the curve's centre with
// the gun's traverse (crews.js's pivot), raised with the K 12's jacks (rig.rail.jack()) and run back with its carriage
// (the men's spots are marked `car`, crews.js adds the run). A pure function of the step, its time and the shot.
export const ROLES = {
  chief: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'rLan',
  rammer1: 'rRam', rammer2: 'rRam', rammer3: 'rRam', rammer4: 'rRam',
  car1: 'rCar', car2: 'rCar', charge1: 'rChg', charge2: 'rChg', hoist: 'rWinch', sling: 'rSling', jack: 'rJack', phone: 'idle',
};

const STRIDE = CREW_GAITS.walk.stride, SSTRIDE = CREW_GAITS.sidestep.stride;
const V_WALK = 1.25;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _p = { x: 0, y: 0, z: 0 };
const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }], _P = { x: 0, z: 0, h: 0, d: 0, len: 0 };
const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
const win = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));
const durOf = (c) => c.p.job?.dur ?? 10;

// the rammer staff's stroke windows (shares of the step)
const RAMW = {
  ram: { take: [0, 0.06], cross: [0, 0.17], swing: [0.06, 0.18], push: [0.2, 0.5], draw: [0.56, 0.8], out: [0.8, 0.88] },
  cartridge: { take: [0.5, 0.53], cross: [0.3, 0.58], swing: [0.53, 0.6], push: [0.62, 0.72], draw: [0.73, 0.8], out: [0.8, 0.85] },
};
// the charge men's windows in the cartridge step
const CH = { walk: [0, 0.05], lift: [0.05, 0.11], turn1: [0.11, 0.135], carry: [0.135, 0.36], turn2: [0.36, 0.385], lay: [0.385, 0.44], back: [0.44, 0.48] };
const CARRY_DY = 0.8;

// ---------------------------------------------------------------- frames
// the body frame -> the rig's root (props add the carriage's run themselves; the men's run is crews.js's)
function toRoot(crew, K, x, y, z, out, withRun = false) {
  const dx = x + K.bodyX - crew.pvx, dz = z + (withRun ? K.run() : 0) - crew.pvz;
  out.x = dx * crew.ca + dz * crew.sa + crew.pvx;
  out.y = y + K.jack();
  out.z = -dx * crew.sa + dz * crew.ca + crew.pvz;
  return out;
}
const toRootV = (crew, K, x, y, z, v) => { toRoot(crew, K, x, y, z, _p, true); return v.set(_p.x, _p.y, _p.z); };
function place(crew, K, m, x, y, z, h, pose, t) {
  toRoot(crew, K, x, y, z, _p);
  m.put(_p.x, _p.y, _p.z, h + crew.az, pose, t);
}
function walkE(crew, K, m, ax, az, bx, bz, e, y, h0, h1, gait = 'walk') {
  _path[0].x = ax; _path[0].z = az; _path[1].x = bx; _path[1].z = bz;
  along(_path, 2, e, _P, h0, h1);
  const moving = e > 0 && e < 1 && _P.len > 0.05;
  const stride = gait === 'carryWalk' ? CREW_GAITS.carryWalk.stride : STRIDE;
  place(crew, K, m, _P.x, y, _P.z, moving ? _P.h : e >= 1 ? h1 : h0, moving ? gait : 'stand', moving ? _P.d / stride : crew.idleT + m.seed);
}
const hand = (crew, K, m, side, x, y, z, w) => { toRootV(crew, K, x, y, z, _v); m.hand(side, _v.x, _v.y, _v.z, w); };

// ---------------------------------------------------------------- the mechanisms as functions of the step
function crabZ(c, K) {
  if (c.s !== 'shell') return K.ZPICK;
  const k = c.k, dur = durOf(c), d = K.ZPICK - K.ZWAIT;
  if (k < 0.36) return K.ZPICK;
  if (k < 0.6) return lerp(K.ZPICK, K.ZWAIT, paced(k, 0.36, 0.55, dur, d, 1.3, 0.4));
  if (k < 0.7) return K.ZWAIT;
  return lerp(K.ZWAIT, K.ZPICK, paced(k, 0.7, 0.92, dur, d, 1.4, 0.4));
}
function hookY(c, K) {
  const H = K.HOOK;
  if (c.s !== 'shell') return H.up;
  const k = c.k;
  if (k < 0.12) return lerp(H.up, H.down, smooth(k, 0, 0.12));
  if (k < 0.2) return H.down;
  if (k < 0.36) return lerp(H.down, H.up, smooth(k, 0.2, 0.36));
  if (k < 0.55) return H.up;
  if (k < 0.62) return lerp(H.up, H.set, smooth(k, 0.55, 0.62));
  if (k < 0.66) return H.set;
  return lerp(H.set, H.up, smooth(k, 0.66, 0.76));
}
// the trolley (the shell's middle on it), pushed at the trolley men's pace
const zOff = (K) => K.P0 + 0.8; // off the bridge, before it runs back
function trolleyZ(c, K) {
  const s = c.s, k = c.k, dur = durOf(c);
  if (s === 'shell') return lerp(K.ZWAIT, K.ZB, paced(k, 0.68, 0.95, dur, K.ZWAIT - K.ZB, 1.1, 0.5));
  if (s === 'ram') return K.ZB;
  if (s === 'cartridge') return lerp(K.ZB, zOff(K), paced(k, 0.86, 1, dur, zOff(K) - K.ZB, 1.1, 0.35));
  if (s === 'close') return lerp(zOff(K), K.ZWAIT, paced(k, 0.05, 0.95, dur, K.ZWAIT - zOff(K), 1.3, 0.4));
  return K.ZWAIT;
}
// when the trolley moves: [start, end] in shares of the step, its direction (+1 back toward the crab); null when it stands
const _mv = [0, 0, 0];
function trolleyMove(c, K) {
  const s = c.s, dur = durOf(c);
  const fit = (a, b, d, v, r, dir) => { _mv[0] = a; _mv[1] = a + Math.min((b - a) * dur, d / v + r) / dur; _mv[2] = dir; return _mv; };
  if (s === 'shell') return fit(0.68, 0.95, K.ZWAIT - K.ZB, 1.1, 0.5, -1);
  if (s === 'cartridge') return fit(0.86, 1, zOff(K) - K.ZB, 1.1, 0.35, 1);
  if (s === 'close') return fit(0.05, 0.95, K.ZWAIT - zOff(K), 1.3, 0.4, 1);
  return null;
}

function stroke(c, crew, K) {
  const W = RAMW[c.s];
  if (!W) return null;
  const k = c.k, dur = durOf(c), ram = c.s === 'ram', half = K.SHELL.len / 2;
  const z0 = ram ? K.ZB + half : K.ZB + 0.05 + crew.bagLen / 2, z1 = ram ? K.SEAT + half : K.BRE - 0.02, L = Math.abs(z0 - z1);
  const line = smooth(k, W.swing[0], W.swing[1]) * (1 - smooth(k, W.out[0], W.out[1]));
  const pushE = paced(k, W.push[0], W.push[1], dur, L, ram ? 1.0 : 0.9, 0.35);
  const drawE = paced(k, W.draw[0], W.draw[1], dur, L, 1.1, 0.35);
  return { W, line, z: lerp(z0, z1, pushE * (1 - drawE)), z0, z1, pushE, drawE };
}
// the staff's head (body frame) and how far it is in line with the bore
function staffAt(c, crew, K, out) {
  const S = stroke(c, crew, K), SR = K.STAFF_REST;
  const line = S ? S.line : 0, z = S ? S.z : K.ZB + K.SHELL.len / 2;
  out.x = lerp(SR.x, 0, line); out.y = lerp(SR.y, K.TY, line) + Math.sin(line * Math.PI) * 0.25; out.z = lerp(SR.z, z, line);
  out.line = line; out.S = S;
  return out;
}
// the charge: on the rack, lifted, carried, laid on the trolley, rammed
const carryE = (c, K) => paced(c.k, CH.carry[0], CH.carry[1], durOf(c), K.RACK.z - K.ZB - 0.05, 1.3, 0.4);
function bagAt(c, crew, K, out) {
  const s = c.s, k = c.k, L = crew.bagLen, RK = K.RACK, cx = K.CHG_X - 0.36;
  out.vis = true;
  out.x = RK.x; out.y = RK.y; out.z = RK.z;
  if (s !== 'cartridge') return out;
  const zc = K.ZB + 0.05, cy = K.DECK + CARRY_DY;
  if (k < CH.lift[0]) return out;
  if (k < CH.carry[0]) { const e = smooth(k, CH.lift[0], CH.lift[1]); out.x = lerp(RK.x, cx, e); out.y = lerp(RK.y, cy, e) + 0.08 * Math.sin(Math.PI * e); return out; }
  if (k < CH.lay[0]) { out.x = cx; out.y = cy; out.z = lerp(RK.z, zc, carryE(c, K)); return out; }
  const S = stroke(c, crew, K);
  if (k < CH.back[0]) { const e = smooth(k, CH.lay[0], CH.lay[1]); out.x = lerp(cx, 0, e); out.y = lerp(cy, K.TY, e) + 0.12 * Math.sin(Math.PI * e); out.z = zc; return out; }
  out.x = 0; out.y = K.TY;
  out.z = lerp(zc, K.BRE - 0.02 - L / 2, S ? S.pushE : 0);
  out.vis = !S || S.drawE <= 0;
  return out;
}
const STAFF_P = { x: 0, y: 0, z: 0, line: 0, S: null };
const BAG_P = { x: 0, y: 0, z: 0, vis: true };

// ---------------------------------------------------------------- hooks
export function state(crew, c) {
  const K = crew.rig.rail;
  if (!K) return false;
  if (!crew.rdBars) {
    // the staff's cross handles, where the two pairs push
    crew.rdBars = true;
    const iron = crew.staff.children[1]?.material;
    for (const off of K.RAM_OFF) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2 * K.BAR, 6).rotateZ(Math.PI / 2), iron);
      bar.position.z = off;
      bar.castShadow = true;
      crew.staff.add(bar);
    }
  }
  crew.staffA = null;
  crew.shellA_a = null;
  crew.ramK = 0;
  staffAt(c, crew, K, STAFF_P);
  bagAt(c, crew, K, BAG_P);
  return true;
}

export function mechanisms(crew, c) {
  const K = crew.rig.rail;
  if (!K) return false;
  const rig = crew.rig;
  rig.setTrolley?.(trolleyZ(c, K));
  rig.setCrab?.(crabZ(c, K));
  rig.setHoist?.(hookY(c, K));
  rig.update?.(0.016);
  return true;
}

export function act(crew, m, c, h) {
  const K = crew.rig.rail;
  if (!K) return false;
  switch (m.beh) {
    case 'rRam': ramMan(crew, K, m, c); return true;
    case 'rCar': carMan(crew, K, m, c); return true;
    case 'rChg': chargeMan(crew, K, m, c); return true;
    case 'rLan': return lanyardMan(crew, K, m, c, h);
    case 'rWinch': {
      const k = c.s === 'shell' ? c.k : -1, on = (k >= 0 && k < 0.12) || (k > 0.2 && k < 0.36) || (k > 0.55 && k < 0.62) || (k > 0.66 && k < 0.76);
      place(crew, K, m, m.spot.x - K.bodyX, m.spot.y, m.spot.z, m.spot.heading, on ? 'operate' : 'stand', on ? c.now * 1.3 : crew.idleT + m.seed);
      if (on) {
        // his hand on the crank's handle, turning round the shaft (along z or x)
        const W = K.WINCH, a = c.now * 4.2, ca = 0.2 * Math.cos(a), sa = 0.2 * Math.sin(a);
        if (W.axis === 'x') hand(crew, K, m, 'R', W.x + 0.1, W.y + ca, W.z + sa, 1);
        else hand(crew, K, m, 'R', W.x + sa, W.y + ca, W.z - 0.08, 1);
      }
      return true;
    }
    case 'rSling': slingMan(crew, K, m, c); return true;
    case 'rJack': {
      // at the hydraulic pump on the front subframe (the K 12): he works it while the jacks go up or down
      const on = c.s === 'lay' || c.s === 'depress';
      m.put(h.x, h.y, h.z, h.h, on ? 'operate' : 'stand', on ? c.now * 1.6 : crew.idleT + m.seed);
      return true;
    }
  }
  // crews.js's own (the chief, the layer, the traverser, the lanyard at the lay): on the body, raised with its jacks
  if (m.spot.car) h.y += K.jack();
  return false;
}

// The slinger on the wagon's deck beside the round: steps in, stoops and slings it, steps back as it goes up.
function slingMan(crew, K, m, c) {
  const k = c.s === 'shell' ? c.k : -1, hx = m.spot.x - K.bodyX, hz = m.spot.z, y = m.spot.y;
  const e = smooth(k, 0.06, 0.1) * (1 - smooth(k, 0.2, 0.24)), w = smooth(k, 0.1, 0.13) * (1 - smooth(k, 0.17, 0.2));
  const moving = e > 0.001 && e < 0.999, back = k > 0.2, step = 0.25;
  const x = hx + step * e;
  place(crew, K, m, x, y, hz, m.spot.heading, moving ? 'walk' : e >= 0.999 ? 'lift' : 'stand', moving ? (back ? -1 : 1) * step * (back ? 1 - e : e) / STRIDE : e >= 0.999 ? 0.6 : crew.idleT + m.seed);
  if (w > 0.01) {
    const r = K.SHELL.rad;
    hand(crew, K, m, 'L', -0.1, K.WAGON_Y + r * 0.8, K.ZPICK - 0.35, w);
    hand(crew, K, m, 'R', -0.1, K.WAGON_Y + r * 0.8, K.ZPICK + 0.35, w);
  }
}

// The rammers. The left pair (1, 3) step to the staff on its hooks, lift it, carry it into line sidestepping to their
// lane; the right pair (2, 4) come to theirs and take hold once it is in line. All four walk the stroke facing the breech
// in one gait; then the right pair let go and go home, the left pair swing it out and hang it up.
function ramMan(crew, K, m, c) {
  const i = +m.role.slice(-1) - 1, pair = i >> 1, side = i % 2 ? 1 : -1, off = K.RAM_OFF[pair];
  const hx = m.spot.x - K.bodyX, hz = m.spot.z, hh = m.spot.heading, k = c.k, st = STAFF_P, S = st.S, dur = durOf(c), Y = K.DECK;
  // the right pair wait on the left walkway behind the left pair and cross behind the trolley once it is at the breech
  // (from the end of the shell step, on the cycle's clock)
  const T = crew.tl;
  if (side > 0 && c.s === 'shell' && k > 0.96 && T && Number.isFinite(T.now)) {
    const t0 = T.at('shell', 0.96), t1 = T.at('ram', RAMW.ram.cross[1]), zS0 = K.ZB + K.SHELL.len / 2 + off, lx0 = K.LANE;
    walkE(crew, K, m, hx, hz, lx0, zS0, paced((T.now - t0) / (t1 - t0), 0, 1, t1 - t0, dist(hx, hz, lx0, zS0), V_WALK, 0.3), Y, hh, 0);
    return;
  }
  if (!S) { place(crew, K, m, hx, Y, hz, hh, 'stand', crew.idleT + m.seed); return; }
  const W = S.W, lx = side * K.LANE, zS = S.z0 + off, zH = K.STAFF_REST.z + off, TX = K.TAKE_X;
  const inLane = () => place(crew, K, m, lx, Y, S.z + off, 0, 'walk', (zS - (S.z + off)) / STRIDE);
  let hold = 0;
  if (side < 0) {
    const t0 = W.take[0], d0 = dist(hx, hz, TX, zH), homeK = Math.min(0.99, W.out[1] + 0.04), dH = dist(TX, zH, hx, hz);
    if (k < t0) place(crew, K, m, hx, Y, hz, hh, 'stand', crew.idleT + m.seed);
    else if (k < W.swing[0]) { walkE(crew, K, m, hx, hz, TX, zH, paced(k, t0, W.swing[0], dur, d0, V_WALK, 0.3), Y, hh, 0); hold = smooth(k, W.swing[0] - 0.02, W.swing[0]); }
    else if (k < W.swing[1]) { swingMan(crew, K, m, st.line, lx, zH, zS); hold = 1; }
    else if (k < W.out[0]) { inLane(); hold = 1; }
    else if (k < W.out[1]) { swingMan(crew, K, m, st.line, lx, zH, zS); hold = 1; }
    else if (k < homeK) { place(crew, K, m, TX, Y, zH, 0, 'stand', crew.idleT + m.seed); hold = 1 - smooth(k, homeK - 0.02, homeK); }
    else walkE(crew, K, m, TX, zH, hx, hz, paced(k, homeK, 1, dur, dH, V_WALK, 0.3), Y, 0, hh);
  } else {
    const d0 = dist(hx, hz, lx, zS), go = W.out[0] + 0.02, dH = dist(lx, zS, hx, hz);
    const ram = c.s === 'ram' && T && Number.isFinite(T.now), t0 = ram ? T.at('shell', 0.96) : 0, t1 = ram ? T.at('ram', W.cross[1]) : 0;
    const crossE = ram ? paced((T.now - t0) / (t1 - t0), 0, 1, t1 - t0, d0, V_WALK, 0.3) : paced(k, W.cross[0], W.cross[1], dur, d0, V_WALK, 0.3);
    if (!ram && k < W.cross[0]) place(crew, K, m, hx, Y, hz, hh, 'stand', crew.idleT + m.seed);
    else if (k < W.push[0] && st.line < 0.999) walkE(crew, K, m, hx, hz, lx, zS, crossE, Y, hh, 0);
    else if (k < go) inLane();
    else walkE(crew, K, m, lx, zS, hx, hz, paced(k, go, Math.min(1, go + 0.15), dur, dH, V_WALK, 0.3), Y, 0, hh);
    hold = k < go ? smooth(st.line, 0.85, 0.98) : 1 - smooth(k, go - 0.02, go);
  }
  if (hold > 0.01) {
    const hz2 = st.z + off, hx2 = st.x + side * (K.BAR - 0.14) * st.line;
    hand(crew, K, m, 'R', hx2, st.y, hz2 - 0.05, hold);
    hand(crew, K, m, 'L', hx2 + side * 0.12 * st.line, st.y, hz2 + 0.05, hold);
  }
}
// a left rammer while the staff swings between its hooks (outboard of him) and the line: he sidesteps with it and gives
// back a step as it passes in front of him
function swingMan(crew, K, m, e, lx, zH, zS) {
  const TX = K.TAKE_X, x = lerp(TX, lx, e), z = lerp(zH, zS, e) + 0.42 * Math.sin(Math.PI * e);
  place(crew, K, m, x, K.DECK, z, 0, e > 0.01 && e < 0.99 ? 'sidestep' : 'stand', (x - TX) / SSTRIDE);
}

// The two trolley men on its left. Standing by it they face it; to move it they turn into the way it goes over 0.4 s
// before it sets off and back after it stops, the inner hand on its side rail. While the rammers work they wait aside at
// the front of the left walkway and come back for the trolley's run back.
function carMan(crew, K, m, c) {
  const j = m.role === 'car1' ? 0 : 1, s = c.s, k = c.k, zc = trolleyZ(c, K), hzc = K.HANDLES[j], dur = durOf(c), Y = K.DECK, LN = K.CAR_LANE;
  const FACE = -Math.PI / 2; // facing the trolley (+X)
  const at = (z) => z + hzc, A = K.ASIDE[j];
  let grip = 0, inner = 'L';
  const T = crew.tl, t0 = T ? T.at('shell', 0.95) : 0, awayT = (s === 'shell' && k > 0.95) || s === 'ram' || (s === 'cartridge' && k < 0.7) ? (T ? T.now - t0 : 9) : -1;
  const dA = dist(LN, at(K.ZB), A[0], A[1]);
  if (awayT >= 0) {
    walkE(crew, K, m, LN, at(K.ZB), A[0], A[1], pacedT(awayT, dA, V_WALK, 0.3), Y, FACE, FACE);
  } else if (s === 'cartridge' && k < 0.86) {
    walkE(crew, K, m, A[0], A[1], LN, at(K.ZB), paced(k, 0.7, 0.84, dur, dA, 1.1, 0.3), Y, FACE, FACE);
  } else {
    const mv = trolleyMove(c, K);
    let h = FACE, moving = false;
    if (mv) {
      const [a, b, dir] = mv, ta = (k - a) * dur, tb = (k - b) * dur, travel = dir > 0 ? Math.PI : 0;
      h = ta < 0 ? turn(FACE, travel, (ta + 0.45) / 0.4) : tb > 0 ? turn(travel, FACE, tb / 0.4) : travel;
      moving = ta > 0 && tb < 0;
      inner = dir > 0 ? 'L' : 'R';
      grip = smooth(ta, -0.5, -0.1) * (1 - smooth(tb, 0.1, 0.5));
    }
    place(crew, K, m, LN, Y, at(zc), h, moving ? 'walk' : 'stand', moving ? (zc / STRIDE) * (mv[2] > 0 ? 1 : -1) : crew.idleT + m.seed);
    // steadying the trolley while the round is set down on it
    if (s === 'shell' && k > 0.55 && k < 0.68) grip = Math.max(grip, win(k, 0.55, 0.58, 0.65, 0.68));
  }
  if (grip > 0.01) {
    const RT = K.RAIL_TOP;
    hand(crew, K, m, inner, RT.x, K.TY + RT.dy, zc + hzc, grip);
    if (s === 'shell' && k > 0.55 && k < 0.68) hand(crew, K, m, inner === 'L' ? 'R' : 'L', RT.x, K.TY + RT.dy, zc + hzc + (j ? 0.3 : -0.3), win(k, 0.55, 0.58, 0.65, 0.68));
  }
}

// The two charge men: lift the charge off the rack together, turn and carry it forward in file along the right side, turn
// to the trolley, step in and lay it on, step back, and go back to the rack.
function chargeMan(crew, K, m, c) {
  const j = m.role === 'charge1' ? 0 : 1, s = c.s, k = c.k, b = BAG_P, L = crew.bagLen, dur = durOf(c), Y = K.DECK;
  const hx = m.spot.x - K.bodyX, hz = m.spot.z, FACE = Math.PI / 2; // facing the trolley (-X)
  const RF = K.RACK.x > K.CHG_X ? -Math.PI / 2 : FACE; // facing the rack (on the walkway's outer edge: +X)
  // his place at his end of the charge (the front man never ahead of the breech face, where the wedge runs out)
  const endZ = (zc) => (j ? zc + L / 2 + 0.12 : Math.max(zc - L / 2 - 0.12, K.BRE + 0.38));
  const lane = K.CHG_X, inX = K.CHG_X - 0.3, zc0 = K.ZB + 0.05, RK = K.RACK;
  let hands = 0;
  if (s === 'cartridge') {
    if (k < CH.walk[1]) walkE(crew, K, m, hx, hz, lane, endZ(RK.z), paced(k, 0, CH.walk[1], dur, dist(hx, hz, lane, endZ(RK.z)), 1.0, 0.25), Y, RF, RF);
    else if (k < CH.turn1[0]) { place(crew, K, m, lane, Y, endZ(RK.z), RF, 'lift', 0.35 + 0.5 * smooth(k, CH.lift[0], CH.lift[1])); hands = smooth(k, CH.lift[0], CH.lift[0] + 0.02); }
    else if (k < CH.carry[0]) { place(crew, K, m, lane, Y, endZ(RK.z), turn(RF, 0, smooth(k, CH.turn1[0], CH.turn1[1])), 'stand', 0); hands = 1; }
    else if (k < CH.turn2[0]) {
      const e = carryE(c, K), z = endZ(lerp(RK.z, zc0, e));
      place(crew, K, m, lane, Y, z, 0, e > 0 && e < 1 ? 'walk' : 'stand', (RK.z - lerp(RK.z, zc0, e)) / STRIDE);
      hands = 1;
    } else if (k < CH.lay[0]) { place(crew, K, m, lane, Y, endZ(zc0), turn(0, FACE, smooth(k, CH.turn2[0], CH.turn2[1])), 'stand', 0); hands = 1; }
    else if (k < CH.back[0]) {
      const e = paced(k, CH.lay[0], CH.lay[0] + 0.035, dur, lane - inX, 1.0, 0.25);
      place(crew, K, m, lerp(lane, inX, e), Y, endZ(zc0), FACE, e > 0 && e < 1 ? 'walk' : 'operate', e > 0 && e < 1 ? (lane - inX) * e / STRIDE : 0);
      hands = 1 - smooth(b.x, (K.CHG_X - 0.36) * 0.5, 0.25);
    } else if (k < CH.back[1]) {
      const e = paced(k, CH.back[0], CH.back[1], dur, lane - inX, 0.9, 0.25);
      place(crew, K, m, lerp(inX, lane, e), Y, endZ(zc0), FACE, e > 0 && e < 1 ? 'walk' : 'stand', e > 0 && e < 1 ? -(lane - inX) * e / STRIDE : crew.idleT + m.seed);
    } else {
      // back to the rack (out of the right pair of rammers' lane before they come forward)
      const d = dist(lane, endZ(zc0), hx, hz);
      walkE(crew, K, m, lane, endZ(zc0), hx, hz, paced(k, CH.back[1], Math.min(1, CH.back[1] + 0.3), dur, d, V_WALK, 0.3), Y, 0, RF);
    }
    if (hands > 0.01) {
      const ez = b.z + (j ? 1 : -1) * (L / 2 - 0.1), both = k < CH.carry[0] || k > CH.lay[0];
      hand(crew, K, m, j ? 'L' : 'R', b.x + 0.04, b.y - 0.12, ez, hands);
      if (both) hand(crew, K, m, j ? 'R' : 'L', b.x + 0.04, b.y - 0.12, ez - (j ? 0.25 : -0.25), hands);
    }
  } else place(crew, K, m, hx, Y, hz, RF, 'stand', crew.idleT + m.seed);
}

// The lanyard man works the wedge and the lock. He goes up to the wedge's handwheel on the breech ring while the gun
// comes down (the depress), winds it open, and goes back to his post round the open wedge (out along his walkway) as
// the shell comes in; at the end of the cartridge he comes back the same way, winds it shut, primes the lock beside the
// breech and is back at his post for the lay, where crews.js's lanyard drill takes over.
const _route = Array.from({ length: 4 }, () => ({ x: 0, z: 0 }));
function setRoute(ax, az, lx, bx, bz) {
  _route[0].x = ax; _route[0].z = az; _route[1].x = lx; _route[1].z = az;
  _route[2].x = lx; _route[2].z = bz; _route[3].x = bx; _route[3].z = bz;
}
function lanyardMan(crew, K, m, c, h) {
  const s = c.s, k = c.k, rig = crew.rig, dur = durOf(c), Y = K.DECK;
  const hx = m.sx - K.bodyX, hz = m.sz, hh = m.spot.heading; // his post as crews.js has it (its lanyard drill stands him there)
  const wx = K.WRENCH.x, wz = K.BRE + K.WRENCH.dz, px = K.PRIME.x, pz = K.BRE + K.PRIME.dz;
  const inner = K.LAN_IN, outer = K.LAN_OUT; // his lanes past the breech: the wedge shut, the wedge open
  let work = 0, target = null;
  _inv.copy(rig.root.matrixWorld).invert();
  const wheelAt = (spin, out) => {
    _w.set(K.CRANK.x + Math.cos(spin) * 0.17, K.CRANK.y + Math.sin(spin) * 0.17, K.CRANK.z);
    return rig.pivots.recoil.localToWorld(out.copy(_w)).applyMatrix4(_inv);
  };
  const faceW = 0, faceP = headingOf(K.LOCK.x - px, K.BRE - pz);
  // a walk along four waypoints (body frame: from a, out to lane x at a's z, along it to b's z, in to b), e of the way
  const route = (ax, az, lx, bx, bz, e, h0, h1) => {
    setRoute(ax, az, lx, bx, bz);
    along(_route, 4, e, _P, h0, h1);
    const moving = e > 0 && e < 1 && _P.len > 0.05;
    place(crew, K, m, _P.x, Y, _P.z, moving ? _P.h : e >= 1 ? h1 : h0, moving ? 'walk' : 'stand', moving ? _P.d / STRIDE : crew.idleT + m.seed);
  };
  const len = (ax, az, lx, bx, bz) => Math.abs(lx - ax) + Math.abs(bz - az) + Math.abs(bx - lx);
  if (s === 'depress') {
    if (k < 0.3) place(crew, K, m, hx, Y, hz, hh, 'stand', crew.idleT + m.seed);
    else route(hx, hz, inner, wx, wz, paced(k, 0.3, 0.95, dur, len(hx, hz, inner, wx, wz), 1.1, 0.35), hh, faceW);
  } else if (s === 'open' || s === 'close') { place(crew, K, m, wx, Y, wz, faceW, 'reachUp', 0.25); work = win(k, 0.02, 0.08, 0.9, 0.98); target = 'wheel'; }
  else if (s === 'shell' && k < 0.3) route(wx, wz, outer, hx, hz, paced(k, 0, 0.3, dur, len(wx, wz, outer, hx, hz), V_WALK, 0.35), faceW, hh);
  else if (s === 'shell' || s === 'ram' || (s === 'cartridge' && k < 0.76)) place(crew, K, m, hx, Y, hz, hh, 'stand', crew.idleT + m.seed);
  else if (s === 'cartridge') route(hx, hz, outer, wx, wz, paced(k, 0.76, 0.99, dur, len(hx, hz, outer, wx, wz), 1.4, 0.3), hh, faceW);
  else if (s === 'prime') {
    if (k < 0.3) walkE(crew, K, m, wx, wz, px, pz, paced(k, 0, 0.3, dur, dist(wx, wz, px, pz), 0.8, 0.3), Y, faceW, faceP);
    else { place(crew, K, m, px, Y, pz, faceP, 'operate', crew.idleT + m.seed); work = win(k, 0.33, 0.45, 0.8, 0.95); target = 'lock'; }
  } else if (s === 'lay' && k < 0.35) route(px, pz, inner, hx, hz, paced(k, 0, 0.35, dur, len(px, pz, inner, hx, hz), V_WALK, 0.35), faceP, hh);
  else {
    if (m.spot.car) h.y += K.jack();
    crew.lanyardMan(m, c, h);
    return true;
  }
  if (work > 0.01) {
    if (target === 'wheel') {
      const spin = c.now * 2.4;
      wheelAt(spin, _v); m.hand('R', _v.x, _v.y, _v.z, work);
      wheelAt(spin + 1.6, _v); m.hand('L', _v.x, _v.y, _v.z, work * 0.9);
    } else {
      _w.set(K.LOCK.x, K.LOCK.y, K.LOCK.z);
      rig.pivots.recoil.localToWorld(_v.copy(_w)).applyMatrix4(_inv);
      m.hand('R', _v.x, _v.y, _v.z, work);
    }
  }
  return true;
}

// the round on the wagon under the crab's pick-up (the wagon rides neither the jacks nor the carriage's run)
function wagonAt(crew, K, v) {
  toRoot(crew, K, 0, K.WAGON_Y, K.ZPICK, _p, false);
  return v.set(_p.x, _p.y - K.jack(), _p.z);
}

export function props(crew, c) {
  const K = crew.rig.rail;
  if (!K) return false;
  const A = crew.shellA, B = crew.shellB, s = c.s, k = c.k, yaw = crew.az, S = STAFF_P.S;
  // the next round on the wagon under the crab's pick-up (the wagon rides neither the jacks nor the carriage's run)
  const onWagon = !((s === 'shell' && k >= 0.12) || s === 'ram');
  crew.placeProp(B, wagonAt(crew, K, _v), yaw + (K.wagonYaw ?? 0), 0, onWagon);
  // the round in hand: slung, hoisted and run in on the crab, on the trolley, rammed
  let vis = false, ry = yaw;
  if (s === 'shell' && k >= 0.12) {
    vis = true;
    if (k < 0.2) { wagonAt(crew, K, _v); ry = yaw + (K.wagonYaw ?? 0); }
    else if (k < 0.62) { toRootV(crew, K, 0, hookY(c, K) - K.HANG, crabZ(c, K), _v); ry = yaw + (K.wagonYaw ?? 0) * (1 - smooth(k, 0.2, 0.4)); }
    else toRootV(crew, K, 0, K.TY, trolleyZ(c, K), _v);
  } else if (s === 'ram' && S && S.drawE <= 0) {
    vis = true;
    toRootV(crew, K, 0, K.TY, lerp(K.ZB, K.SEAT, S.pushE), _v);
  }
  crew.placeProp(A, _v, ry, 0, vis);
  // the charge
  const b = BAG_P;
  toRootV(crew, K, b.x, b.y, b.z, _v);
  crew.placeProp(crew.bag, _v, yaw, 0, b.vis);
  // the staff: on its hooks, or in the rammers' hands
  const st = STAFF_P;
  toRootV(crew, K, st.x, st.y, st.z, _v);
  crew.placeProp(crew.staff, _v, yaw, 0, true);
  crew.staff.rotation.z = (1 - st.line) * Math.PI / 2; // on its hooks the cross handles stand upright, against the wall
  crew.staff.updateMatrix();
  return true;
}

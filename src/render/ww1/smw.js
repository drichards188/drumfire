import * as THREE from 'three';
import { smooth, lerp, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';
import { paced, turn } from '../drill_pace.js';

// The 25 cm schwerer Minenwerfer's drill (render/crews.js calls these hooks before its own; see render/crews_ww1.js):
// a muzzle loader, so nobody works a breech. The tube comes down to 45 degrees (rig.loadEl) and everything goes in at
// the muzzle (GUNS.smw.load: cartridge shell ram prime lay):
//   cartridge  the tube comes down (0-0.35, this module eases it: the render layer would drop it at once); the charge
//              man takes a charge from the box (the disc charges in their bag), steps to the right of the muzzle,
//              lifts it in (0.55-0.8; it slides down the bore) and steps back
//   shell      the two bomb men at the store's mouth squat to the carrying bar through the yoke round the standing
//              bomb and lift it (0-0.12), sidestep with it to the muzzle (0.12-0.6), raise it and tilt it into line
//              with the bore (0.6-0.8) and set its base in the mouth, its studs in the rifling (0.8-1)
//   ram        they let it run in until the yoke is at the mouth (0-0.35), the second man draws the bar out of the
//              yoke (0.35-0.5), both push the bomb home with their palms on its nose (0.5-0.85); meanwhile the store
//              man brings the next bomb out of the niche, walking it on its base rim to the store's mouth
//   prime, lay the firer primes and takes the lanyard (crews.js); the bomb men go back to the store; the layer lays
// The officer, the layer, the traverser and the firer are crews.js's (cmd, lay, wheel, lan). The places come with the
// rig (rig.smw, rig.bar), so this module does not import the model's file. Pure functions of the job, as crews.js.
export const ROLES = { officer: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', charger: 'mwCharge', bomb1: 'mwBomb', bomb2: 'mwBomb', ammo1: 'mwStore' };
export const WORLD = new Set(['bomb1', 'bomb2', 'ammo1']);
export const STAFF = 1.0;

const STRIDE = CREW_GAITS.walk.stride, SSTRIDE = CREW_GAITS.sidestep.stride;
const HALF = 0.38; // the bomb's half length (models/shells.js smw)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _inv = new THREE.Matrix4();
const win = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));
const at = (node, out) => node.getWorldPosition(out).applyMatrix4(_inv);

function S0(crew) {
  return crew.mw ??= {
    M: new THREE.Vector3(), u: new THREE.Vector3(), home: new THREE.Vector3(), stack: new THREE.Vector3(),
    bomb: new THREE.Vector3(), bombVis: false, pitch: 0, yaw: 0, bar: new THREE.Vector3(), barVis: false, barYaw: 0, barPitch: 0, barOut: 0,
    pair: { x: 0, z: 0, h: 0, pose: 'stand', t: 0, y: 0 }, next: new THREE.Vector3(), nextVis: true, nextTilt: 0, nextYaw: 0,
    bag: new THREE.Vector3(), bagVis: false, push: 0,
  };
}

export function state(crew, c) {
  if (!crew.rig.smw) return false;
  crew.staffA = null;
  crew.shellA_a = null;
  crew.ramK = 0;
  return true;
}

// the pair: its centre (root xz), heading, pose and gait time for the bomb men; the bomb and the bar
export function mechanisms(crew, c) {
  const rig = crew.rig, K = rig.smw;
  if (!K) return false;
  const S = S0(crew), s = c.s, k = c.k, p = c.p;
  // the tube eases down at the start of the cycle (the render layer would set it at the loading elevation at once)
  if (s === 'cartridge') rig.setElevation(lerp(p.el, rig.loadEl, smooth(k, 0, 0.35)));
  rig.root.updateMatrixWorld(true);
  _inv.copy(rig.root.matrixWorld).invert();
  at(rig.anchors.muzzle, S.M);
  at(rig.anchors.breech, _a);
  S.u.copy(S.M).sub(_a).normalize();
  at(rig.anchors.tray, S.home);
  at(rig.anchors.shellStack, S.stack);
  const az = crew.az, rx = Math.cos(az), rz = -Math.sin(az);
  // the pair's places: at the store's mouth (facing the front of the pit) and either side of the muzzle (facing the
  // bore's way), the bomb's middle at C (C* when set in line over the mouth)
  const Cx = S.M.x + S.u.x * (HALF + 0.03), Cz = S.M.z + S.u.z * (HALF + 0.03), Cy = S.M.y + S.u.y * (HALF + 0.03);
  const P = S.pair, bore = Math.asin(S.u.y);
  S.bombVis = false; S.barVis = false; S.barOut = 0; S.push = 0;
  P.x = S.stack.x; P.z = S.stack.z; P.h = 0; P.pose = 'stand'; P.t = crew.idleT; P.y = 0;
  let barY = 0, pitch = Math.PI / 2;
  if (s === 'shell') {
    S.bombVis = S.barVis = true;
    if (k < 0.12) {
      const e = k / 0.12;
      P.pose = 'lift'; P.t = e;
      barY = lerp(HALF + 0.02, 0.95, smooth(e, 0.45, 1));
    } else if (k < 0.6) {
      const e = paced(k, 0.12, 0.6, c.p.job?.dur ?? 9, Math.hypot(Cx - S.stack.x, Cz - S.stack.z), 0.7, 0.4);
      P.x = lerp(S.stack.x, Cx, e); P.z = lerp(S.stack.z, Cz, e); P.h = turn(0, az, e);
      // sideways along the pair's own lateral axis (run backwards to the left)
      const lat = ((Cx - S.stack.x) * rx + (Cz - S.stack.z) * rz) * e;
      P.pose = e > 0 && e < 1 ? 'sidestep' : 'carry'; P.t = lat / SSTRIDE;
      barY = 0.95;
    } else {
      P.x = Cx; P.z = Cz; P.h = az;
      const e = smooth(k, 0.6, 0.74), f = smooth(k, 0.8, 1);
      P.pose = 'reachUp'; P.t = 0.25;
      // raised first, then tilted into line about the yoke (the base swings in clear of the mouth's lip)
      barY = lerp(0.95, Cy, e);
      pitch = lerp(Math.PI / 2, bore, smooth(k, 0.68, 0.8));
      if (f > 0) { // set in the mouth
        S.bomb.copy(S.M).addScaledVector(S.u, HALF + 0.03 - 0.25 * f);
        barY = -1;
      }
    }
    if (barY >= 0) S.bomb.set(P.x, barY, P.z);
  } else if (s === 'ram') {
    P.x = Cx; P.z = Cz; P.h = az; pitch = bore;
    const a0 = HALF + 0.03 - 0.25, a1 = 0.02;
    let a = lerp(a0, a1, smooth(k, 0, 0.3));
    if (k >= 0.55) a = lerp(a1, -S.M.distanceTo(S.home), smooth(k, 0.55, 0.85));
    S.bomb.copy(S.M).addScaledVector(S.u, a);
    S.bombVis = k < 0.9; // home in the bore after that
    S.barVis = k < 0.55;
    S.barOut = smooth(k, 0.3, 0.45); // the second man draws it out sideways through the yoke
    S.push = win(k, 0.5, 0.58, 0.85, 0.92);
    P.pose = k < 0.3 ? 'reachUp' : S.push > 0.01 ? 'push' : 'stand';
    P.t = k < 0.3 ? 0.25 : smooth(k, 0.55, 0.85);
  }
  S.pitch = pitch; S.yaw = P.h;
  // the bar: through the yoke at the bomb's middle, along the pair's lateral axis; drawn out to the right
  if (S.barVis) {
    const hr = P.h;
    S.bar.copy(S.bomb).add(_b.set(Math.cos(hr), 0, -Math.sin(hr)).multiplyScalar(S.barOut * 0.95));
    S.barYaw = hr; S.barPitch = pitch;
  }
  // the next bomb: standing at the store's mouth, but while the pair has it, and walked out of the niche by the store
  // man in the ram and prime steps (u over the two)
  S.nextVis = true;
  S.next.copy(S.stack); S.nextTilt = 0; S.nextYaw = 0;
  const u2 = s === 'ram' ? k * 0.6 : s === 'prime' ? 0.6 + 0.4 * k : -1;
  if (s === 'shell' || (u2 >= 0 && u2 < 0.25)) S.nextVis = false;
  else if (u2 >= 0.25 && u2 < 0.75) {
    const e = smooth(u2, 0.25, 0.75), nx = K.PIT.x - 0.25, nz = K.STACK.z - 0.3;
    S.next.set(lerp(nx, S.stack.x, e), S.stack.y + 0.02, lerp(nz, S.stack.z, e));
    S.nextTilt = 0.22 * Math.sin(Math.PI * e);
    S.nextYaw = headingOf(S.stack.x - nx, S.stack.z - nz);
  }
  // the charge: in the charge man's hands, then into the muzzle
  S.bagVis = s === 'cartridge' && k < 0.8;
  return true;
}

export function act(crew, m, c, h) {
  const K = crew.rig.smw, S = crew.mw;
  if (!K || !S) return false;
  switch (m.beh) {
    case 'mwBomb': bombMan(crew, m, c, h, K, S); return true;
    case 'mwCharge': chargeMan(crew, m, c, h, K, S); return true;
    case 'mwStore': storeMan(crew, m, c, h, K, S); return true;
  }
  return false;
}

function bombMan(crew, m, c, h, K, S) {
  const side = m.role === 'bomb1' ? -1 : 1, P = S.pair, s = c.s, k = c.k;
  let x = P.x + Math.cos(P.h) * side * K.SIDE, z = P.z - Math.sin(P.h) * side * K.SIDE, hd = P.h, pose = P.pose, t = P.t;
  // back to the store in the prime and lay steps: a turn, the walk, a turn into his place
  if (s === 'prime' || s === 'lay') {
    const az = crew.az, Cx = S.M.x + S.u.x * (HALF + 0.03), Cz = S.M.z + S.u.z * (HALF + 0.03);
    const ax = Cx + Math.cos(az) * side * K.SIDE, azz = Cz - Math.sin(az) * side * K.SIDE;
    const bx = S.stack.x + side * K.SIDE, bz = S.stack.z;
    const dur = 6, uu = s === 'prime' ? k / 3 : 1 / 3 + (2 / 3) * k, tt = uu * dur, d = Math.hypot(bx - ax, bz - azz), way = headingOf(bx - ax, bz - azz);
    const e = paced(uu, 0.1, 0.85, dur, d, 1.2, 0.3);
    x = lerp(ax, bx, e); z = lerp(azz, bz, e);
    hd = uu < 0.1 ? turn(az, way, tt / 0.6) : e < 1 ? way : turn(way, 0, (uu - 0.85) * dur / 0.6);
    pose = e > 0 && e < 1 ? 'walk' : 'stand'; t = e > 0 && e < 1 ? d * e / STRIDE : crew.idleT + m.seed;
  } else if (s !== 'shell' && s !== 'ram') { x = h.x; z = h.z; hd = h.h; pose = 'stand'; t = crew.idleT + m.seed; }
  // the second man steps out sideways with the bar as he draws it out of the yoke, then lays it down and comes back
  let out = 0;
  if (s === 'ram' && side > 0) {
    out = S.barOut * 0.95 * (1 - smooth(k, 0.5, 0.58));
    x += Math.cos(P.h) * out; z -= Math.sin(P.h) * out;
    if (k > 0.3 && k < 0.58 && S.push < 0.01) { pose = 'sidestep'; t = out / SSTRIDE; }
  }
  m.put(x, h.y, z, hd, pose, t);
  // hands on the bar (both near his end, inside his body: the bar passes his hip), or on the bomb's nose for the push
  const holding = S.barVis && !(s === 'ram' && side < 0 && k > 0.3) && !(s === 'ram' && side > 0 && k > 0.47);
  if (holding) {
    const bx = Math.cos(S.barYaw), bz = -Math.sin(S.barYaw), w = s === 'shell' && k < 0.12 ? smooth(k / 0.12, 0.25, 0.45) : 1;
    const o = s === 'ram' && side > 0 ? -S.barOut * 0.95 : 0; // (the bar's centre has moved out toward him)
    for (const [hand, d] of side < 0 ? [['R', 0.5], ['L', 0.72]] : [['L', 0.5], ['R', 0.72]]) {
      const off = side * d - o;
      m.hand(hand, S.bar.x + bx * off, S.bar.y, S.bar.z + bz * off, w);
    }
  } else if (S.push > 0.01 && S.bombVis) {
    _a.copy(S.bomb).addScaledVector(S.u, HALF);
    const bx = Math.cos(crew.az), bz = -Math.sin(crew.az);
    m.hand(side < 0 ? 'R' : 'L', _a.x + bx * side * 0.06, _a.y, _a.z + bz * side * 0.06, S.push);
    m.hand(side < 0 ? 'L' : 'R', _a.x + bx * side * 0.14, _a.y - 0.05, _a.z + bz * side * 0.14, S.push * 0.8);
  }
}

// the charge man: from his place by the box to the right of the muzzle, the charge in, back
function chargeMan(crew, m, c, h, K, S) {
  const s = c.s, k = c.k, az = crew.az;
  const qx = S.M.x + Math.cos(az) * 0.6 - S.u.x * 0.05, qz = S.M.z - Math.sin(az) * 0.6 - S.u.z * 0.05, face = az + Math.PI / 2;
  let x = h.x, z = h.z, hd = h.h, pose = 'stand', t = crew.idleT + m.seed;
  if (s === 'cartridge') {
    const dur = c.p.job?.dur ?? 3, d = Math.hypot(qx - h.x, qz - h.z), way = headingOf(qx - h.x, qz - h.z);
    if (k < 0.3) { pose = 'lift'; t = k / 0.3; }
    else if (k < 0.55) {
      const e = paced(k, 0.3, 0.55, dur, d, 1.2, 0.25);
      x = lerp(h.x, qx, e); z = lerp(h.z, qz, e); hd = turn(turn(h.h, way, (k - 0.3) * dur / 0.25), face, (k - 0.48) * dur / 0.2);
      pose = 'carryWalk'; t = d * e / CREW_GAITS.carryWalk.stride;
    } else if (k < 0.82) { x = qx; z = qz; hd = face; pose = 'reachUp'; t = 0.2; }
    else {
      const e = paced(k, 0.82, 1, dur, d, 1.2, 0.2);
      x = lerp(qx, h.x, e); z = lerp(qz, h.z, e); hd = turn(face, h.h, (k - 0.82) * dur / 0.4);
      pose = e > 0 && e < 1 ? 'walk' : 'stand'; t = d * e / STRIDE;
    }
  }
  m.put(x, h.y, z, hd, pose, t);
  if (S.bagVis) {
    // the bag: at his chest as he comes, then lifted to the mouth and pushed in along the bore
    const fx = -Math.sin(hd), fz = -Math.cos(hd);
    if (k < 0.55) S.bag.set(x + fx * 0.38, h.y + (pose === 'lift' ? lerp(0.4, 1.15, smooth(t, 0.3, 1)) : 1.15), z + fz * 0.38);
    else {
      const e = smooth(k, 0.55, 0.68), g = smooth(k, 0.68, 0.8);
      _a.copy(S.M).addScaledVector(S.u, 0.12 - 0.4 * g);
      S.bag.set(lerp(qx + fx * 0.38, _a.x, e), lerp(h.y + 1.15, _a.y, e), lerp(qz + fz * 0.38, _a.z, e));
    }
    const w = 1 - smooth(k, 0.74, 0.8);
    m.hand('L', S.bag.x - Math.cos(hd) * 0.1, S.bag.y - 0.06, S.bag.z + Math.sin(hd) * 0.1, w);
    m.hand('R', S.bag.x + Math.cos(hd) * 0.1, S.bag.y - 0.06, S.bag.z - Math.sin(hd) * 0.1, w);
  }
}

// the store man: hands the next bomb out of the niche, walking it on its base rim to the store's mouth
function storeMan(crew, m, c, h, K, S) {
  const s = c.s, k = c.k, u2 = s === 'ram' ? k * 0.6 : s === 'prime' ? 0.6 + 0.4 * k : -1;
  let x = h.x, z = h.z, hd = h.h, pose = 'stand', t = crew.idleT + m.seed;
  if (u2 >= 0) {
    const dur = 5, nx = K.PIT.x - 0.25, nz = K.STACK.z - 0.3, dirH = headingOf(S.stack.x - nx, S.stack.z - nz);
    const fx = -Math.sin(dirH), fz = -Math.cos(dirH);
    const bx = nx - fx * 0.5, bz = nz - fz * 0.5; // behind the bomb at the niche
    const ex = S.stack.x - fx * 0.5, ez = S.stack.z - fz * 0.5; // behind it at the store's mouth
    if (u2 < 0.25) {
      const d = Math.hypot(bx - h.x, bz - h.z), e = paced(u2, 0, 0.16, dur, d, 1.2, 0.3), way = headingOf(bx - h.x, bz - h.z);
      x = lerp(h.x, bx, e); z = lerp(h.z, bz, e); hd = u2 < 0.16 ? turn(h.h, way, u2 * dur / 0.4) : turn(way, dirH, (u2 - 0.16) * dur / 0.4);
      pose = e > 0 && e < 1 ? 'walk' : 'stand'; t = d * e / STRIDE;
    } else if (u2 < 0.75) {
      const e = smooth(u2, 0.25, 0.75), d = Math.hypot(ex - bx, ez - bz);
      x = lerp(bx, ex, e); z = lerp(bz, ez, e); hd = dirH; pose = 'push'; t = 0.4;
      m.put(x, h.y, z, hd, 'walk', d * e / STRIDE);
      _a.copy(S.next); _a.y += HALF * 0.9;
      m.hand('L', _a.x - Math.cos(hd) * 0.1, _a.y, _a.z + Math.sin(hd) * 0.1, 1);
      m.hand('R', _a.x + Math.cos(hd) * 0.1, _a.y - 0.1, _a.z - Math.sin(hd) * 0.1, 1);
      return;
    } else {
      const d = Math.hypot(h.x - ex, h.z - ez), e = paced(u2, 0.78, 0.92, dur, d, 1.2, 0.3), way = headingOf(h.x - ex, h.z - ez);
      x = lerp(ex, h.x, e); z = lerp(ez, h.z, e); hd = u2 < 0.92 ? turn(dirH, way, (u2 - 0.75) * dur / 0.4) : turn(way, h.h, (u2 - 0.92) * dur / 0.4);
      pose = e > 0 && e < 1 ? 'walk' : 'stand'; t = d * e / STRIDE;
    }
  }
  m.put(x, h.y, z, hd, pose, t);
}

export function props(crew, c) {
  const S = crew.mw, rig = crew.rig;
  if (!S || !rig.smw) return false;
  crew.staff.visible = false;
  // the bomb carried, set in the mouth and pushed home (its nose out along the bore once it is tilted)
  crew.placeProp(crew.shellA, S.bomb, S.yaw, S.pitch, S.bombVis);
  // the next bomb standing at the store's mouth (nose up), or being walked out to it
  crew.placeProp(crew.shellB, S.next, S.nextYaw, Math.PI / 2 - S.nextTilt, S.nextVis);
  crew.placeProp(crew.bag, S.bag, crew.az, 0, S.bagVis);
  const bar = rig.bar;
  if (bar) {
    bar.visible = S.barVis && crew.level > 0;
    if (bar.visible) { bar.position.copy(S.bar); bar.rotation.set(S.barPitch, S.barYaw, 0); }
  }
  return true;
}

import * as THREE from 'three';
import { smooth, lerp, wrapPi, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';
import { shuffle, reachable, along } from '../crews_heavy.js';

// The Paris Gun's drill for render/crews.js (see render/crews_ww1.js for what this module may export). A naval
// detachment served it (the men wear the 1917 German dress crews_ww1.js gives every WW1 kind). The generic heavy
// drill fits the rig (models/v/de/paris.js): the gun comes down to 0 degrees, the block slides out to the right, a
// small slewing crane on the frame's right rear corner lifts the 106 kg shell off its cart on the ground and lowers
// it onto the tray (crane1 at the winch on the gallery, crane2 signalling from the ground, ammo1 slinging it at the
// cart), two loaders steady it, two rammers drive it home with a short staff, the bagman brings the brass case and
// its bags from the rack at the platform's rear. Nobody is a world-frame role: the frame turns on its turntable
// and every man, the cart and the crane go with it.
export const ROLES = {
  chief: 'cmd', layer: 'lay', elevator: 'wheel', traverser: 'wheel', lanyard: 'lan',
  loader1: 'guide0', loader2: 'guide1', rammer1: 'ram', rammer2: 'ram', bagman: 'bag',
  crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'idle', meter: 'idle', phone: 'idle',
};
export const STAFF = 2.6;

// The frame not yet on its bed (rig.assembly < 1, the Stellungsbau: src/ww1/render.js poseParisSetup): no galleries
// to stand on, so the men work on the ground on the gun's left, between the frame's run-in and the portal crane's rail
// (the Gustav's rule, render/crews_heavy.js). Root frame, which does not turn with the traverse.
export function act(crew, m, c, h) {
  if ((crew.rig.assembly ?? 1) >= 1) return drill(crew, m, c, h);
  const i = crew.men.indexOf(m), busy = i % 3 !== 1;
  m.put(-4.6 - 1.3 * (i & 1), 0, -6 + (i >> 1) * 2.6 + 1.3 * (i & 1), -Math.PI / 2, // facing the gun
    busy ? 'operate' : 'stand', busy ? c.now * 1.1 + m.seed : crew.idleT + m.seed);
  return true;
}

// ---------------------------------------------------------------- the loading drill on the frame
// The generic heavy drill left the crane men standing idle through the lift, the loaders at their places 1.2 to 1.5 m
// from the shell they were meant to steady, and the rammers 4 m behind the tray with the staff out of reach. Here
// (src/models/v/de/paris.js for the places: the deck at 6.1 m, the loading platform from z 7.5 between the girders,
// the crane's post at the right rear with its winch drum, the shell cart on the ground under the jib):
//   the crane man cranks the winch drum on the deck while the hook moves; the signaller on the ground watches the hook
//   and signals; the cart man crouches to sling the shell and steadies it as it comes off the cart;
//   the two loaders step in beside the tray as the shell is lowered and steady it onto it;
//   the rammers stand on the platform behind the tray with the staff, which lies along the bore line from the opening
//   of the breech to its closing (and on the deck at their feet while the gun is up): they ram the shell and then the
//   charge in place, the staff running through their hands a heave at a time;
//   the bagman carries the charge from the rack at the platform's rear, lays it on the tray and walks back.
// All a pure function of the step and its progress, as crews.js's drill is.

const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride;
const GRIP = 0.45; // the staff travel per heave
const RAM = { rammer1: { side: -1, back: 0.8 }, rammer2: { side: 1, back: 1.35 } }; // behind the shell's base
const WINCH = { x: 1.95, z: 10.33 }; // where the crane man stands, facing the drum's crank handles
const HANDLES = [[1.66, 7.05, 10.0], [2.24, 7.05, 10.0]]; // the drum's two crank handles (traverse frame, metres)
const RACK = { x: 1.15, z: 13.3 }, VIA = { x: 1.15, z: 9.6 }; // the charges at the platform's rear, the way forward
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 }, _p = { x: 0, z: 0, h: 0 }, _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];

// the shell's middle this frame (crews.js craneShells draws it after the hands are set, from the same numbers)
function shellAt(crew, c, out) {
  const mode = crew.craneMode;
  if (mode === 'hang' || mode === 'ground') {
    out.set(crew.cp.x - crew.R * Math.cos(crew.craneA), crew.craneY - crew.hang, crew.cp.z + crew.R * Math.sin(crew.craneA));
    if (c.s === 'shell' && c.k > 0.74) out.lerp(crew.trayAt(crew.aT, _w), smooth(c.k, 0.8, 0.95));
    if (mode === 'ground') out.copy(crew.pick);
    return out;
  }
  return crew.trayAt(crew.shellA_a ?? crew.aT, out);
}

// the staff (its head's axial place on the bore line, or lying on the deck) and the weight of the hands on it
function staffPose(crew, c) {
  const s = c.s, k = c.k;
  // on the bore line from the open breech to the close; lifted onto it and laid down again over a couple of seconds
  const up = s === 'open' ? smooth(k, 0.3, 0.9) : s === 'shell' || s === 'ram' || s === 'cartridge' ? 1 : s === 'close' ? 1 - smooth(k, 0.1, 0.6) : 0;
  const rest = crew.aT - crew.half - 0.15; // its head just behind the tray's shell
  const head = crew.staffA ?? rest;
  return { up, head };
}

export function state(crew, c) {
  if (crew.kind !== 'paris' || (crew.rig.assembly ?? 1) < 1) return false;
  const st = crew.staff, P = staffPose(crew, c);
  // on the bore line: its head at `head`, along the bore; on the deck: between the two rammers' places, lying fore and aft
  crew.trayAt(P.head, _v);
  const r1 = crew.byRole.get('rammer1');
  r1.home(crew.tmp[3]);
  const d = crew.tmp[3];
  _w.set(d.x + crew.rt.x * 0.3 - crew.bd.x * 0.3, d.y + 0.04, d.z + crew.rt.z * 0.3 - crew.bd.z * 0.3);
  st.position.lerpVectors(_w, _v, P.up);
  st.rotation.set(Math.asin(crew.u.y) * P.up, crew.az, 0);
  st.updateMatrix();
  crew.staffGrip = P.up;
  crew.staffOwner = r1;
  crew.parisStaff = P;
  return true;
}

function drill(crew, m, c, h) {
  if (crew.kind !== 'paris') return false;
  switch (m.beh) {
    case 'guide0': case 'guide1': guide(crew, m, c, h); return true;
    case 'ram': rammer(crew, m, c, h); return true;
    case 'winch': winch(crew, m, c, h); return true;
    case 'signal': signal(crew, m, c, h); return true;
    case 'sling': sling(crew, m, c, h); return true;
    case 'bag': bagman(crew, m, c, h); return true;
  }
  return false;
}

function guide(crew, m, c, h) {
  const s = c.s, k = c.k, side = m.beh === 'guide0' ? -1 : 1;
  shellAt(crew, c, _s);
  // beside the tray, level with the shell's middle (they walk 1 m in over three seconds and back in two)
  const off = crew.srad + 0.55, wx = crew.T.x + crew.rt.x * side * off, wz = crew.T.z + crew.rt.z * side * off;
  const e = s === 'shell' ? smooth(k, 0.66, 0.78) : s === 'ram' ? 1 - smooth(k, 0, 0.16) : 0;
  const x = lerp(h.x, wx, e), z = lerp(h.z, wz, e);
  const toT = headingOf(crew.T.x - x, crew.T.z - z);
  const hd = h.h + wrapPi(toT - h.h) * smooth(e, 0, 0.5);
  if (shuffle(m, h.x, h.z, wx, wz, e, h.y, hd)) return;
  const steady = s === 'shell' && k > 0.82 && k < 0.99;
  m.put(x, h.y, z, hd, steady && _s.y > h.y + 1.75 ? 'reachUp' : steady ? 'push' : 'stand', steady ? 0.2 : crew.idleT + m.seed);
  if (steady) {
    const w = smooth(k, 0.82, 0.86) * (1 - smooth(k, 0.95, 0.99));
    for (const [hand, a] of [['L', -0.18], ['R', 0.18]]) {
      _v.copy(_s).addScaledVector(crew.u, a);
      _v.x += crew.rt.x * side * crew.srad; _v.z += crew.rt.z * side * crew.srad;
      reachable(m, hand, _v, w, 0.74);
    }
  }
}

function rammer(crew, m, c, h) {
  const s = c.s, k = c.k, r = RAM[m.role] ?? RAM.rammer2, P = crew.parisStaff ?? staffPose(crew, c);
  // his place on the platform behind the tray, beside the staff (fixed: the staff runs through his hands)
  const a = crew.aT - crew.half - r.back;
  crew.trayAt(a, _s);
  _s.x += crew.rt.x * r.side * 0.32; _s.z += crew.rt.z * r.side * 0.32;
  const fwd = headingOf(crew.u.x, crew.u.z);
  // over to it as the breech opens, back to his place once the breech is closed
  const e = s === 'open' ? smooth(k, 0, 0.3) : s === 'shell' || s === 'ram' || s === 'cartridge' ? 1 : s === 'close' ? 1 - smooth(k, 0.55, 0.95) : 0;
  const hd = h.h + wrapPi(fwd - h.h) * Math.min(1, e * 1.5);
  if (shuffle(m, h.x, h.z, _s.x, _s.z, e, h.y, hd)) return;
  const x = e > 0.5 ? _s.x : h.x, z = e > 0.5 ? _s.z : h.z;
  const start = crew.aT - crew.half;
  const moving = crew.staffA != null && (s === 'ram' ? k > 0.18 && k < 0.95 : s === 'cartridge' && k > 0.55 && k < 0.95);
  const phase = ((((P.head - start) / GRIP) % 1) + 1) % 1, push = phase < 0.8;
  const travel = moving ? (push ? phase : 0.8 * (1 - smooth(phase, 0.8, 1))) : 0;
  const onStaff = e > 0.5 && P.up > 0.02;
  m.put(x, h.y, z, e > 0.5 ? fwd : hd, onStaff ? 'ramLoad' : 'stand',
    onStaff ? (moving ? (push ? smooth(phase, 0, 0.8) : 1 - smooth(phase, 0.8, 1)) : 0.15) : crew.idleT + m.seed);
  if (!onStaff) return;
  // (stooping for it on the deck, the grip fades in as it comes up to the bore line)
  const hold = smooth(P.up, 0.3, 0.9) * (moving ? 1 - (phase > 0.8 && phase < 0.95 ? 1 : 0) * 0.85 : 1);
  // (the hand nearer the staff leads: the right one for the man on its left, the left one for the man on its right)
  for (const [hand, o] of r.side < 0 ? [['L', 0.18], ['R', 0.45]] : [['R', 0.18], ['L', 0.45]]) {
    crew.trayAt(Math.min(P.head - 0.1, a + o + travel * GRIP), _v);
    m.hand(hand, _v.x, _v.y, _v.z, hold);
  }
}

// the drum turns while the hook moves (crews.js mechanisms: down to the cart, the lift, the slew, down onto the tray)
const hoisting = (c) => (c.s === 'shell' && (c.k < 0.15 || (c.k > 0.27 && c.k < 0.42) || (c.k > 0.74 && c.k < 1))) || (c.s === 'ram' && c.k < 0.2);

function winch(crew, m, c, h) {
  const p = crew.rootXZ(m, WINCH, _a);
  const on = hoisting(c);
  const hd = crew.az; // facing forward, the drum in front of him
  m.put(p.x, h.y, p.z, hd, on ? 'operate' : 'stand', on ? c.now * 0.8 : crew.idleT + m.seed);
  if (!on) return;
  // both hands on the crank handles, working round (a short circle about each handle's pin)
  const ca = Math.cos(crew.az), sa = Math.sin(crew.az);
  HANDLES.forEach(([x, y, z], i) => {
    const t = c.now * 4 + i * Math.PI, rx = x + 0.0, rz = z + Math.sin(t) * 0.1, ry = y + Math.cos(t) * 0.1;
    const dx = rx - crew.pvx, dz = rz - crew.pvz;
    m.hand(i ? 'R' : 'L', dx * ca + dz * sa + crew.pvx, ry, -dx * sa + dz * ca + crew.pvz, smooth(c.s === 'shell' ? c.k : 1, 0, 0.03));
  });
}

function signal(crew, m, c, h) {
  // he follows the hook from the cart up to the deck and back: turned toward it as the lift starts, back as it is clear
  const active = c.s === 'shell' || (c.s === 'ram' && c.k < 0.3);
  const w = c.s === 'shell' ? smooth(c.k, 0, 0.08) : c.s === 'ram' ? 1 - smooth(c.k, 0.2, 0.4) : 0;
  shellAt(crew, c, _s);
  const toCart = headingOf(crew.pick.x - h.x, crew.pick.z - h.z), toHook = headingOf(_s.x - h.x, _s.z - h.z);
  m.put(h.x, h.y, h.z, toCart + wrapPi(toHook - toCart) * w, active ? 'signal' : 'stand', active ? c.now * 0.5 : crew.idleT + m.seed);
}

function sling(crew, m, c, h) {
  const s = c.s, k = c.k, tgt = crew.pick, face = headingOf(tgt.x - h.x, tgt.z - h.z);
  shellAt(crew, c, _s);
  const hook = s === 'shell' && k > 0.12 && k < 0.3;
  const near = Math.hypot(_s.x - h.x, _s.y - h.y - 1.45, _s.z - h.z) < 0.95;
  const steady = s === 'shell' && k >= 0.3 && k < 0.42 && near;
  m.put(h.x, h.y, h.z, face, hook ? 'crouch' : steady ? 'reachUp' : 'stand', hook || steady ? k * 2 : crew.idleT + m.seed);
  if (!hook && !steady) return;
  const w = hook ? smooth(k, 0.12, 0.16) * (1 - smooth(k, 0.27, 0.3)) : smooth(k, 0.3, 0.32) * (1 - smooth(k, 0.38, 0.42));
  _w.set(h.x - _s.x, 0, h.z - _s.z).normalize().multiplyScalar(crew.srad * 1.05);
  for (const [hand, o] of [['L', 0.15], ['R', -0.15]]) {
    _v.set(_s.x + _w.x + crew.rt.z * o, _s.y + 0.02, _s.z + _w.z - crew.rt.x * o);
    reachable(m, hand, _v, w, 0.72);
  }
}

function bagman(crew, m, c, h) {
  const s = c.s, k = s === 'cartridge' ? c.k : -1, bag = crew.bag, len = crew.bagLen, br = 0.14;
  const rack = crew.rootXZ(m, RACK, _a), via = crew.rootXZ(m, VIA, _b);
  // he waits at the rack facing forward; the charge lies on the deck beside him
  const faceFwd = h.h;
  crew.trayAt(crew.aT, _v);
  const px = _v.x + crew.rt.x * 0.72, pz = _v.z + crew.rt.z * 0.72, faceTray = headingOf(-crew.rt.x, -crew.rt.z);
  const pts = _path;
  let pose = 'stand', t = crew.idleT + m.seed, x = h.x, z = h.z, hd = faceFwd, held = 0, e = 0;
  if (k >= 0 && k < 0.08) { pose = 'lift'; t = smooth(k, 0, 0.08); e = smooth(t, 0.4, 1); held = smooth(k, 0.025, 0.045); }
  else if (k >= 0.08 && k < 0.36) {
    pts[0].x = h.x; pts[0].z = h.z; pts[1].x = via.x; pts[1].z = via.z; pts[2].x = px; pts[2].z = pz;
    const u = smooth(k, 0.08, 0.36) * 0.8 + ((k - 0.08) / 0.28) * 0.2, P = along(pts, 3, u, _p);
    x = P.x; z = P.z; hd = faceFwd + wrapPi(P.h - faceFwd) * smooth(u, 0, 0.1);
    hd += wrapPi(faceTray - hd) * smooth(u, 0.85, 1);
    pose = 'carryWalk'; t = (u * P.len) / CSTRIDE; held = 1; e = 1;
  } else if (k >= 0.36 && k < 0.5) {
    x = px; z = pz; hd = faceTray; e = 1;
    if (k < 0.47) { pose = 'lift'; t = 1 - 0.4 * smooth(k, 0.36, 0.44) + 0.4 * smooth(k, 0.44, 0.47); } else pose = 'stand';
    held = 1 - smooth(k, 0.42, 0.46);
  } else if (k >= 0.5 && k < 0.85) {
    pts[0].x = px; pts[0].z = pz; pts[1].x = via.x; pts[1].z = via.z; pts[2].x = h.x; pts[2].z = h.z;
    const u = k < 0.56 ? 0 : smooth(k, 0.56, 0.85) * 0.8 + ((k - 0.56) / 0.29) * 0.2, P = along(pts, 3, u, _p);
    x = P.x; z = P.z; hd = faceTray + wrapPi(P.h - faceTray) * smooth(k, 0.5, 0.58);
    hd += wrapPi(faceFwd - hd) * smooth(u, 0.75, 1);
    if (k < 0.56) pose = 'stand'; else { pose = 'walk'; t = (u * P.len) / STRIDE; }
  }
  m.put(x, h.y, z, hd, pose, t);
  // the charge: on the deck by the rack, in his arms, laid on the tray, then driven home ahead of the staff
  const fx = -Math.sin(m.h), fz = -Math.cos(m.h), hx = m.x + fx * 0.42, hz = m.z + fz * 0.42, hy = h.y + 1.07;
  let cx = rack.x, cy = h.y + br, cz = rack.z, yaw = crew.az, pitch = 0, vis = true;
  if (k >= 0 && k < 0.36) {
    cx = lerp(rack.x, hx, e); cy = lerp(h.y + br, hy, e); cz = lerp(rack.z, hz, e);
    yaw = crew.az + wrapPi(m.h - Math.PI / 2 - crew.az) * e;
  } else if (k >= 0.36) {
    const f = smooth(k, 0.36, 0.45), aB = crew.staffA != null ? Math.max(crew.aT, crew.staffA + len / 2) : crew.aT;
    crew.trayAt(aB, _v);
    _v.y += br - crew.srad;
    cx = lerp(hx, _v.x, f); cy = lerp(hy, _v.y, f); cz = lerp(hz, _v.z, f);
    yaw = (m.h - Math.PI / 2) + wrapPi(crew.az - (m.h - Math.PI / 2)) * f;
    pitch = Math.asin(crew.u.y) * f;
    vis = k < 0.95;
  }
  _v.set(cx, cy, cz);
  crew.placeProp(bag, _v, yaw, pitch, vis);
  if (held > 0.01) {
    // a long charge balanced across his forearms: both hands under its middle, a shoulder's width apart
    const nx = -Math.sin(yaw) * Math.cos(pitch), ny = Math.sin(pitch), nz = -Math.cos(yaw) * Math.cos(pitch);
    for (const [hand, sg] of [['L', -1], ['R', 1]]) m.hand(hand, cx + nx * 0.2 * sg, cy + ny * 0.2 * sg - br * 0.85 * e, cz + nz * 0.2 * sg, held);
  }
}

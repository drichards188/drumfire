import * as THREE from 'three';
import { smooth, lerp, headingOf, clamp01 } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';
import { trap, paced, turn } from '../drill_pace.js';

// The 42 cm Gamma-Mörser's drill (render/crews.js calls these hooks before its own; see render/crews_ww1.js). The
// rig (models/v/de/gamma.js) publishes its stations in rig.spec, read here so a broken model file cannot take the
// crew code down with it. Everything is a pure function of the piece's job, as in crews.js.
//
// The loading cycle at zero elevation (GUNS.gamma.load: depress open shell ram cartridge close prime lay):
//   open      loader2 turns the wedge's crank on the ring's rear face (the block slides out to the right)
//   shell     k 0.04-0.2 the two rollers push the shell off the trolley at the lift's foot onto the car;
//             0.24-0.7 the winch man hauls the car up the incline; 0.74-0.94 the shell is rolled across the skids
//             onto the tray, loader1 steadying its base, loader2 watching the breech
//   ram       the car runs back down; the four rammers ram the shell home with the long staff in three strokes,
//             stepping back to take a new hold between them (the stroke is 3.5 m: the shell's 1.9 m and the room
//             for the charge behind it)
//   cartridge the bagman carries the charge (brass case and fore charge) from the rack to the tray and lays it in;
//             the rammers push it home with the staff in one stroke
//   close     loader2 cranks the wedge shut; prime: he primes; lay: the layers (crews.js) take the gun up.
export const ROLES = {
  officer: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan',
  winch: 'gwinch', loader1: 'gguide', loader2: 'gbreech', bagman: 'gbag',
  rammer1: 'gram', rammer2: 'gram', rammer3: 'gram', rammer4: 'gram', roller1: 'groll', roller2: 'groll',
};
export const STAFF = 5.5;

const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _p = { x: 0, z: 0 };
const win = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));

// a point of the gun's traverse frame (x, z) in the rig's root frame (the pivot is the origin)
function toRoot(crew, x, z, out = _p) {
  out.x = x * crew.ca + z * crew.sa;
  out.z = -x * crew.sa + z * crew.ca;
  return out;
}
// an anchor's place in the root frame
function at(crew, node, out) {
  return node.getWorldPosition(out).applyMatrix4(_inv);
}

// the ram's head (the staff's end, the round's base) along the bore, axial from the breech face (+ toward the
// muzzle), and where the front rammers stand (axial) as functions of the step's k
// (shares of the ram step: the take, each stroke's shove, each step back between strokes; the hold and the walk home
// fill the rest. Every move runs at an even pace between short ramps, drill_pace.js trap)
const RAM = { start: 0.1, push: 0.14, back: 0.11, hold: 0.82 };
function ramPlan(crew, G) {
  const a0 = crew.aT - crew.half, a1 = G.rammed, n = 3, len = (a1 - a0) / n;
  return { a0, a1, n, len, front: -(G.gripZ - G.breechZ) };
}
function ramState(crew, G, k) {
  const R = ramPlan(crew, G);
  let head = R.a0, man, phase, p;
  if (k < RAM.start) { p = trap(k / RAM.start, 0.3); return { head, man: lerp(G.homeA, R.front, p), phase: 'take', p, R }; }
  let t = RAM.start;
  for (let i = 0; i < R.n; i++) {
    if (k < t + RAM.push) { p = trap((k - t) / RAM.push, 0.3); return { head: R.a0 + R.len * (i + p), man: R.front + R.len * p, phase: 'push', p, R }; }
    t += RAM.push;
    if (i < R.n - 1) {
      if (k < t + RAM.back) { p = trap((k - t) / RAM.back, 0.35); return { head: R.a0 + R.len * (i + 1), man: R.front + R.len * (1 - p), phase: 'back', p, R }; }
      t += RAM.back;
    }
  }
  head = R.a1;
  if (k < RAM.hold) return { head, man: R.front + R.len, phase: 'hold', p: 0, R };
  p = trap((k - RAM.hold) / (1 - RAM.hold), 0.3);
  return { head, man: lerp(R.front + R.len, G.homeA, p), phase: 'home', p, R };
}
// the charge: laid in (bagman) then one stroke
const CH = { pick: 0.08, go: 0.3, lay: 0.45, back: 0.6, take: 0.5, push0: 0.52, push1: 0.8, gone: 0.84 };
function chargeRam(crew, G, k) {
  const L = crew.bagLen, a0 = -L, a1 = 0.05; // the charge's base, axial: laid in with its front at the face, rammed just inside
  const front = -(G.gripZ - G.breechZ); // the front rammers' place at the start of the stroke
  const off = front - a0; // the staff's hold, relative to the head
  let head = null, man = G.homeA, phase = 'idle', p = 0;
  if (k >= CH.take - 0.1 && k < CH.push0) { phase = 'take'; p = trap((k - CH.take + 0.1) / (CH.push0 - CH.take + 0.1), 0.3); man = lerp(G.homeA, front, p); head = a0; }
  else if (k >= CH.push0 && k < CH.push1) { phase = 'push'; p = trap((k - CH.push0) / (CH.push1 - CH.push0), 0.3); head = lerp(a0, a1, p); man = head + off; }
  else if (k >= CH.push1 && k < CH.gone) { phase = 'hold'; head = a1; man = a1 + off; }
  else if (k >= CH.gone) { phase = 'home'; p = trap((k - CH.gone) / (1 - CH.gone), 0.3); man = lerp(a1 + off, G.homeA, p); }
  return { head, man, phase, p };
}

export function state(crew, c) {
  const G = crew.rig.spec;
  if (!G) return false;
  crew.staffA = null;
  crew.shellA_a = null;
  crew.ramK = 0;
  crew.bag.visible = false; // the bagman or the tray shows it this frame
  return true;
}

export function mechanisms(crew, c) {
  const rig = crew.rig, G = rig.spec;
  if (!G) return false;
  const s = c.s, k = c.k;
  let lift = 0;
  if (s === 'shell') lift = smooth(k, 0.24, 0.7);
  else if (s === 'ram') lift = 1 - smooth(k, 0.02, 0.4);
  rig.setLift(lift);
  rig.update?.(0);
  rig.root.updateMatrixWorld(true);
  _inv.copy(rig.root.matrixWorld).invert();
  // the shell's place this frame (root frame), for the props and the hands
  const d = crew.gd ??= { shell: new THREE.Vector3(), yaw: 0, pitch: 0, vis: false, next: false, bag: new THREE.Vector3(), bagVis: false, bagPitch: 0, bagYaw: 0, staff: null };
  d.yaw = crew.az; d.pitch = 0; d.vis = false; d.staff = null; d.bagVis = false;
  d.next = !(s === 'shell' || s === 'ram');
  const stack = at(crew, rig.anchors.shellStack, _a);
  if (s === 'shell') {
    d.vis = true;
    if (k < 0.2) {
      // pushed along the gun's axis from the trolley onto the car at the foot
      const p = smooth(k, 0.04, 0.2);
      toRoot(crew, G.lift.x, lerp(G.stack.z, G.lift.foot.z, p));
      d.shell.set(_p.x, G.stack.y, _p.z);
    } else if (k < 0.74) at(crew, rig.anchors.lift, d.shell);
    else {
      // rolled across the skids onto the tray (lifted over the trough's rim)
      const p = smooth(k, 0.74, 0.94);
      toRoot(crew, lerp(G.lift.x, 0, p), G.trayZ);
      d.shell.set(_p.x, crew.T.y + 0.16 * Math.sin(Math.PI * p), _p.z);
    }
  } else if (s === 'ram') {
    const r = ramState(crew, G, k);
    crew.trayAt(r.head + crew.half, d.shell);
    d.vis = r.head < 0.6; // inside the bore beyond that
    if (r.phase !== 'home') d.staff = r.head;
    d.ram = r;
  } else if (s === 'cartridge') {
    const r = chargeRam(crew, G, k);
    d.ram = r;
    if (r.head != null && r.phase !== 'home') d.staff = r.head;
  }
  void stack;
  return true;
}

export function act(crew, m, c, h) {
  const G = crew.rig.spec;
  if (!G) return false;
  const s = c.s, k = c.k, d = crew.gd;
  switch (m.beh) {
    case 'gram': ramMan(crew, m, c, h, G, d); return true;
    case 'groll': rollMan(crew, m, c, h, G, d); return true;
    case 'gwinch': {
      // the crank turns at hip height on the winch's outboard end: he kneels to it (rig spot), both hands on its handle
      const on = (s === 'shell' && k > 0.24 && k < 0.7) || (s === 'ram' && k > 0.02 && k < 0.4);
      const near = (s === 'shell' && k > 0.21 && k < 0.73) || (s === 'ram' && k < 0.43);
      const H = home(crew, m, G, h);
      m.put(H.x, H.y, H.z, H.h, near ? 'crouch' : 'stand', crew.idleT + m.seed);
      if (on) {
        at(crew, crew.rig.anchors.winchGrip, _a);
        const w = s === 'shell' ? win(k, 0.24, 0.26, 0.68, 0.7) : win(k, 0.02, 0.04, 0.38, 0.4);
        m.hand('R', _a.x, _a.y, _a.z, w);
        m.hand('L', _a.x + 0.08 * crew.ca, _a.y, _a.z - 0.08 * crew.sa, w * 0.9);
      }
      return true;
    }
    case 'gguide': {
      // he stands behind the tray's rear end and takes the shell's base in both hands as it comes across from the
      // lift (from about the middle of its roll), steadying it onto the tray; never in its way (rig spot)
      const H = home(crew, m, G, h);
      const roll = s === 'shell' ? smooth(k, 0.74, 0.94) : 0, hold = s === 'shell' ? smooth(roll, 0.25, 0.4) * (1 - smooth(k, 0.92, 0.97)) : 0;
      const ready = s === 'shell' && k > 0.7 && k < 0.98;
      m.put(H.x, H.y, H.z, H.h, ready ? 'push' : 'stand', ready ? 0.22 : crew.idleT + m.seed);
      if (hold > 0.01 && d.vis) {
        // palms on the shell's base end (its rear, +Z of the gun)
        _a.copy(d.shell);
        _a.x += crew.sa * crew.half; _a.z += crew.ca * crew.half;
        m.hand('L', _a.x - 0.12 * crew.ca, _a.y + 0.05, _a.z + 0.12 * crew.sa, hold);
        m.hand('R', _a.x + 0.12 * crew.ca, _a.y - 0.05, _a.z - 0.12 * crew.sa, hold);
      }
      return true;
    }
    case 'gbreech': {
      // The wedge's crank is at waist height on the ring's right rear face: he stoops to it from his place beside the
      // tray (rig spot), both hands on the handle; primes at the lock on the ring's right side.
      const work = s === 'open' || s === 'close';
      const H = home(crew, m, G, h);
      const pose = work ? 'lift' : s === 'prime' ? 'operate' : s === 'shell' && k > 0.7 ? 'signal' : 'stand';
      m.put(H.x, H.y, H.z, H.h, pose, work ? 0.55 : crew.idleT + m.seed);
      if (work) {
        at(crew, crew.rig.anchors.crankGrip, _a);
        const w = win(k, 0, 0.08, 0.92, 1);
        m.hand('R', _a.x, _a.y, _a.z, w);
        m.hand('L', _a.x, _a.y - 0.06, _a.z, w * 0.8);
      } else if (s === 'prime') {
        m.hand('R', crew.B.x + crew.rt.x * 0.48, crew.B.y + 0.05, crew.B.z + crew.rt.z * 0.48, win(k, 0, 0.3, 0.7, 1));
      }
      return true;
    }
    case 'gbag': bagMan(crew, m, c, h, G, d); return true;
  }
  return false;
}

// a man's standing place (the rig's spot, not crews.js's snapped one: these stations are laid out clear)
function home(crew, m, G, h) {
  if (m.world) return h;
  toRoot(crew, m.spot.x, m.spot.z);
  h.x = _p.x; h.z = _p.z; h.y = m.spot.y; h.h = m.spot.heading + crew.az;
  return h;
}

// the rammers: two a side of the staff, the front pair at `man` (axial), the rear pair 0.65 m behind
function ramMan(crew, m, c, h, G, d) {
  const H = home(crew, m, G, h), s = c.s;
  const r = (s === 'ram' || s === 'cartridge') ? d.ram : null;
  if (!r || r.phase === 'idle' || r.man == null) { m.put(H.x, H.y, H.z, H.h, 'stand', crew.idleT + m.seed); return; }
  const side = m.spot.x < 0 ? -1 : 1, rear = /[34]$/.test(m.role), back = rear ? 0.65 : 0;
  const a = r.man - back;
  crew.trayAt(a, _a);
  const x = _a.x + crew.rt.x * side * 0.45, z = _a.z + crew.rt.z * side * 0.45;
  // He faces the breech throughout and walks his axial place: backwards to take hold, forwards with each stroke, a
  // step back between strokes. One gait for all of it, its phase his axial place over the stride, so the feet stay
  // planted through every change of direction (a phase restarted at each stroke made them skid).
  // (in the gait from the first step back to the last step home, the strokes' ends and the hold included: a stand
  // pose for the frames between two strokes would plant the feet elsewhere and slide them back)
  const inGait = !((r.phase === 'take' && r.p <= 0) || (r.phase === 'home' && r.p >= 1));
  m.put(x, H.y, z, crew.az, inGait ? 'walk' : 'stand', inGait ? (r.man - G.homeA) / STRIDE : crew.idleT + m.seed);
  // hands on the staff (it lies along the bore at the man's axial place)
  const onStaff = d.staff != null && (r.phase === 'push' || r.phase === 'hold' || (r.phase === 'back' && r.p < 0.15) || (r.phase === 'take' && r.p > 0.85));
  if (onStaff) {
    const w = r.phase === 'back' ? 1 - r.p / 0.15 : r.phase === 'take' ? (r.p - 0.85) / 0.15 : 1;
    crew.trayAt(a + 0.3, _b); m.hand(side < 0 ? 'R' : 'L', _b.x, _b.y, _b.z, w);
    crew.trayAt(a - 0.2, _b); m.hand(side < 0 ? 'L' : 'R', _b.x, _b.y, _b.z, w);
  }
}

// The rollers: they walk to the trolley while the wedge is opened, roll the shell off it onto the lift's car walking
// beside it, hands on its flank, and walk back. Even pace, and they turn into the walk and out of it (drill_pace.js).
function rollMan(crew, m, c, h, G, d) {
  const H = home(crew, m, G, h), s = c.s, k = c.k, side = m.spot.x < G.lift.x ? -1 : 1;
  const sx = G.lift.x + side * 0.7, dur = c.p.job?.dur ?? 18;
  const zPush = (p) => lerp(G.stack.z, G.lift.foot.z, p) + 0.45;
  const hx = m.spot.x, hz = m.spot.z, hh = m.spot.heading, d0 = Math.hypot(sx - hx, zPush(0) - hz), d1 = Math.hypot(hx - sx, hz - zPush(1));
  const out = headingOf(sx - hx, zPush(0) - hz), back = headingOf(hx - sx, hz - zPush(1));
  let x = hx, z = hz, head = hh, pose = 'stand', t = crew.idleT + m.seed, hands = 0;
  if (s === 'open') {
    // out to the trolley: a turn, the walk, a turn to face along the shell's way (-Z)
    const tw = Math.min(0.8 * dur, d0 / 1.2 + 0.3), t0 = 0.9 * dur - tw, tt = k * dur;
    const e = paced(k, 0.1, 0.9, dur, d0, 1.2, 0.3, true);
    x = lerp(hx, sx, e); z = lerp(hz, zPush(0), e);
    head = tt < t0 ? turn(hh, out, clamp01((tt - t0 + 0.4) / 0.4)) : e < 1 ? out : turn(out, 0, clamp01((tt - 0.9 * dur) / 0.35));
    if (e > 0 && e < 1) { pose = 'walk'; t = (d0 * e) / STRIDE; }
  } else if (s === 'shell' && k < 0.5) {
    if (k < 0.2) {
      // walking it along: the shell moves on the mechanism's smooth curve, they keep pace with it
      const p = smooth(k, 0.04, 0.2);
      x = sx; z = zPush(p); head = 0;
      if (p > 0.005 && p < 0.995) { pose = 'walk'; t = (zPush(0) - z) / STRIDE; }
      hands = win(k, 0.02, 0.05, 0.18, 0.2);
    } else {
      // back home: a turn on the spot, the walk, a turn into his place
      const tw = d1 / 1.2 + 0.3, tt = (k - 0.24) * dur, e = paced(k, 0.24, 0.5, dur, d1, 1.2, 0.3);
      x = lerp(sx, hx, e); z = lerp(zPush(1), hz, e);
      head = e <= 0 ? turn(0, back, clamp01((k - 0.2) * dur / 0.5)) : e < 1 ? back : turn(back, hh, clamp01((tt - tw) / 0.5));
      if (e > 0 && e < 1) { pose = 'walk'; t = (d1 * e) / STRIDE; }
    }
  }
  toRoot(crew, x, z);
  m.put(_p.x, H.y, _p.z, head + crew.az, pose, t);
  if (hands > 0 && d.vis) {
    // palms on the shell's flank, its rear half: the near hand ahead, the far one across his body behind it
    for (const [hand, dz] of side < 0 ? [['R', 0.25], ['L', 0.5]] : [['L', 0.25], ['R', 0.5]]) {
      toRoot(crew, G.lift.x + side * crew.srad * 0.95, zPush(smooth(k, 0.04, 0.2)) - 0.45 + dz);
      m.hand(hand, _p.x, G.stack.y + 0.02, _p.z, hands);
    }
  }
}

// the bagman: from the rack to beside the tray with the charge, lays it in, back
function bagMan(crew, m, c, h, G, d) {
  const H = home(crew, m, G, h), s = c.s, k = c.k;
  if (s !== 'cartridge' || k > CH.back + 0.25) { m.put(H.x, H.y, H.z, H.h, 'stand', crew.idleT + m.seed); return; }
  const pl = G.bagPlace, hm = { x: m.spot.x, z: m.spot.z };
  const dist = Math.hypot(pl.x - hm.x, pl.z - hm.z), hd = headingOf(pl.x - hm.x, pl.z - hm.z);
  let x = hm.x, z = hm.z, head = m.spot.heading, pose = 'stand', t = 0, carry = false, lay = 0;
  // even-paced walks, turning into them and out of them over 0.4 s (drill_pace.js) instead of snapping round
  const dur = c.p.job?.dur ?? 10, tt = k * dur, hh = m.spot.heading, lay0 = Math.PI / 2;
  if (k < CH.pick) { pose = 'lift'; t = smooth(k, 0, CH.pick); carry = k > CH.pick * 0.4; }
  else if (k < CH.go) {
    const p = paced(k, CH.pick, CH.go, dur, dist, 1.1, 0.3, true);
    x = lerp(hm.x, pl.x, p); z = lerp(hm.z, pl.z, p);
    head = turn(turn(hh, hd, (tt - CH.pick * dur) / 0.4), lay0, (tt - CH.go * dur + 0.4) / 0.4);
    pose = p > 0 && p < 1 ? 'carryWalk' : 'carry'; t = p * dist / CSTRIDE; carry = true;
  } else if (k < CH.lay) { x = pl.x; z = pl.z; head = lay0; pose = 'carry'; carry = true; lay = smooth(k, CH.go, CH.lay); }
  else {
    const tw = dist / 1.2 + 0.3, t0 = CH.lay * dur + 0.4, p = paced(k, CH.lay + 0.4 / dur, CH.back + 0.1, dur, dist, 1.2, 0.3);
    x = lerp(pl.x, hm.x, p); z = lerp(pl.z, hm.z, p);
    head = turn(turn(lay0, hd + Math.PI, (tt - CH.lay * dur) / 0.4), hh, (tt - t0 - tw + 0.1) / 0.4);
    pose = p > 0 && p < 1 ? 'walk' : 'stand'; t = p > 0 && p < 1 ? p * dist / STRIDE : crew.idleT + m.seed;
  }
  toRoot(crew, x, z);
  const rx = _p.x, rz = _p.z, rh = head + crew.az;
  m.put(rx, H.y, rz, rh, pose, t);
  // the charge: in his arms, then laid in the trough (its front at the breech face), then rammed (d.ram.head)
  const B = crew.bag, L = crew.bagLen;
  if (carry) {
    // carried in both arms at chest height, lengthwise along the gun (it is laid in the trough as it is held)
    const fx = -Math.sin(rh), fz = -Math.cos(rh);
    _a.set(rx + fx * 0.42, H.y + (pose === 'lift' ? lerp(0.6, 1.3, t) : 1.3), rz + fz * 0.42);
    let yaw = crew.az;
    if (lay > 0) {
      // lifted over the trough's rim, turned into line and set down in it
      crew.trayAt(-L / 2, _b);
      _b.y -= 0.03;
      _a.lerp(_b, smooth(lay, 0.15, 1));
      _a.y += 0.3 * Math.sin(Math.PI * Math.min(1, lay * 1.15));
    }
    crew.placeProp(B, _a, yaw, 0, true);
    const nx = -Math.sin(yaw), nz = -Math.cos(yaw), w = lay > 0 ? 1 - smooth(lay, 0.8, 1) : 1;
    m.hand('L', _a.x - nx * L * 0.22, _a.y - 0.18, _a.z - nz * L * 0.22, w);
    m.hand('R', _a.x + nx * L * 0.22, _a.y - 0.18, _a.z + nz * L * 0.22, w);
  }
}

export function props(crew, c) {
  const G = crew.rig.spec;
  if (!G) return false;
  const d = crew.gd, s = c.s, k = c.k;
  crew.placeProp(crew.shellA, d.shell, d.yaw, d.pitch, d.vis);
  at(crew, crew.rig.anchors.shellStack, _c);
  crew.placeProp(crew.shellB, _c, crew.az, 0, d.next);
  // the charge on the tray and going in (the bagman draws it while he has it)
  if (s === 'cartridge' && k >= CH.lay) {
    const head = d.ram?.head ?? -crew.bagLen;
    crew.trayAt(head + crew.bagLen / 2, _a);
    _a.y -= 0.03;
    crew.placeProp(crew.bag, _a, crew.az, 0, k < CH.gone);
  } else if (s !== 'cartridge') crew.bag.visible = false;
  crew.staff.visible = d.staff != null && crew.level > 0;
  if (crew.staff.visible) {
    crew.trayAt(d.staff, crew.staff.position);
    crew.staff.rotation.set(Math.asin(crew.u.y), crew.az, 0);
  }
  return true;
}

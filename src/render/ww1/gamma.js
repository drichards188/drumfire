import * as THREE from 'three';
import { smooth, lerp, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';

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
const RAM = { push: 0.2, cycle: 0.29, start: 0.07 };
function ramPlan(crew, G) {
  const a0 = crew.aT - crew.half, a1 = G.rammed, n = 3, len = (a1 - a0) / n;
  return { a0, a1, n, len, front: -(G.gripZ - G.breechZ) };
}
function ramState(crew, G, k) {
  const R = ramPlan(crew, G);
  let head = R.a0, man = R.front + R.len, phase = 'wait', p = 0;
  if (k < RAM.start) { phase = 'take'; p = k / RAM.start; man = lerp(G.homeA, R.front, smooth(p, 0.1, 1)); return { head, man, phase, p, R }; }
  for (let i = 0; i < R.n; i++) {
    const t0 = RAM.start + i * RAM.cycle, t1 = t0 + RAM.push, t2 = t0 + RAM.cycle;
    if (k < t1) { p = smooth(k, t0, t1); head = R.a0 + R.len * (i + p); man = R.front + R.len * p; phase = 'push'; return { head, man, phase, p, R }; }
    if (k < t2 && i < R.n - 1) { p = smooth(k, t1, t2); head = R.a0 + R.len * (i + 1); man = R.front + R.len * (1 - p); phase = 'back'; return { head, man, phase, p, R }; }
  }
  head = R.a1;
  p = smooth(k, 0.88, 1);
  man = lerp(R.front + R.len, G.homeA, p);
  phase = k < 0.88 ? 'hold' : 'home';
  return { head, man, phase, p, R };
}
// the charge: laid in (bagman) then one stroke
const CH = { pick: 0.08, go: 0.3, lay: 0.45, back: 0.6, take: 0.5, push0: 0.52, push1: 0.8, gone: 0.84 };
function chargeRam(crew, G, k) {
  const L = crew.bagLen, a0 = -L, a1 = 0.05; // the charge's base, axial: laid in with its front at the face, rammed just inside
  const front = -(G.gripZ - G.breechZ); // the front rammers' place at the start of the stroke
  const off = front - a0; // the staff's hold, relative to the head
  let head = null, man = G.homeA, phase = 'idle', p = 0;
  if (k >= CH.take - 0.05 && k < CH.push0) { phase = 'take'; p = smooth(k, CH.take - 0.05, CH.push0); man = lerp(G.homeA, front, p); head = a0; }
  else if (k >= CH.push0 && k < CH.push1) { phase = 'push'; p = smooth(k, CH.push0, CH.push1); head = lerp(a0, a1, p); man = head + off; }
  else if (k >= CH.push1 && k < CH.gone) { phase = 'hold'; head = a1; man = a1 + off; }
  else if (k >= CH.gone) { phase = 'home'; p = smooth(k, CH.gone, 1); man = lerp(a1 + off, G.homeA, p); }
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
      const on = (s === 'shell' && k > 0.24 && k < 0.7) || (s === 'ram' && k > 0.02 && k < 0.4);
      const H = home(crew, m, G, h);
      m.put(H.x, H.y, H.z, H.h, on ? 'operate' : 'stand', on ? c.now * 1.3 : crew.idleT + m.seed);
      if (on) {
        at(crew, crew.rig.anchors.winchGrip, _a);
        m.hand('R', _a.x, _a.y, _a.z, 1);
        m.hand('L', _a.x + 0.08 * crew.ca, _a.y, _a.z - 0.08 * crew.sa, 0.9);
      }
      return true;
    }
    case 'gguide': {
      const on = s === 'shell' && k > 0.7;
      const H = home(crew, m, G, h);
      const step = on ? win(k, 0.7, 0.76, 0.96, 1) : 0;
      // a step forward toward the base of the shell as it comes across
      toRoot(crew, m.spot.x, m.spot.z - 0.3 * step);
      m.put(_p.x, H.y, _p.z, H.h + (on ? -0.5 * step : 0), on && k < 0.95 ? 'push' : 'stand', on ? smooth(k, 0.74, 0.94) : crew.idleT + m.seed);
      if (on && d.vis) {
        const w = win(k, 0.74, 0.78, 0.92, 0.96);
        // palms on the shell's base end (its rear, +Z of the gun)
        _a.copy(d.shell);
        _a.x += crew.sa * crew.half; _a.z += crew.ca * crew.half;
        m.hand('L', _a.x - 0.12 * crew.ca, _a.y + 0.05, _a.z + 0.12 * crew.sa, w);
        m.hand('R', _a.x + 0.12 * crew.ca, _a.y - 0.05, _a.z - 0.12 * crew.sa, w);
      }
      return true;
    }
    case 'gbreech': {
      const work = s === 'open' || s === 'close';
      const H = home(crew, m, G, h);
      const pose = work ? 'operate' : s === 'prime' ? 'operate' : s === 'shell' && k > 0.7 ? 'signal' : 'stand';
      m.put(H.x, H.y, H.z, H.h, pose, work ? k * 4 : crew.idleT + m.seed);
      if (work) {
        at(crew, crew.rig.anchors.crankGrip, _a);
        const w = win(k, 0, 0.08, 0.92, 1);
        m.hand('R', _a.x, _a.y, _a.z, w);
        m.hand('L', _a.x, _a.y - 0.06, _a.z, w * 0.8);
      } else if (s === 'prime') {
        m.hand('R', crew.B.x + crew.rt.x * 0.25, crew.B.y + 0.1, crew.B.z + crew.rt.z * 0.25, win(k, 0, 0.3, 0.7, 1));
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
  // (the man's axial place runs from his home to the hold and back, so he walks it facing the breech: backwards
  // to take hold, forwards with the stroke)
  let pose = 'stand', t = crew.idleT + m.seed;
  const len = r.R ? r.R.len : 1.45, moving = r.p > 0.02 && r.p < 0.98;
  if (r.phase === 'push') { pose = 'carryWalk'; t = len * r.p / CSTRIDE; }
  else if (r.phase === 'back') { pose = 'walk'; t = -len * r.p / STRIDE; }
  else if (r.phase === 'take') { pose = moving ? 'walk' : 'stand'; t = -r.p * 1.07 / STRIDE; }
  else if (r.phase === 'home') { pose = moving ? 'walk' : 'stand'; t = r.p * 0.4 / STRIDE; }
  else if (r.phase === 'hold') pose = 'ramLoad';
  m.put(x, H.y, z, crew.az, pose, t);
  // hands on the staff (it lies along the bore at the man's axial place)
  const onStaff = d.staff != null && (r.phase === 'push' || r.phase === 'hold' || (r.phase === 'back' && r.p < 0.15) || (r.phase === 'take' && r.p > 0.85));
  if (onStaff) {
    const w = r.phase === 'back' ? 1 - r.p / 0.15 : r.phase === 'take' ? (r.p - 0.85) / 0.15 : 1;
    crew.trayAt(a + 0.3, _b); m.hand(side < 0 ? 'R' : 'L', _b.x, _b.y, _b.z, w);
    crew.trayAt(a - 0.2, _b); m.hand(side < 0 ? 'L' : 'R', _b.x, _b.y, _b.z, w);
  }
}

// the rollers at the trolley: push the shell along onto the lift's car, then back
function rollMan(crew, m, c, h, G, d) {
  const H = home(crew, m, G, h), s = c.s, k = c.k, side = m.spot.x < G.lift.x ? -1 : 1;
  const sx = G.lift.x + side * 0.85;
  if (s !== 'shell' || k > 0.42) { m.put(H.x, H.y, H.z, H.h, 'stand', crew.idleT + m.seed); return; }
  // their places along the shell: beside its rear half (traverse frame)
  const zPush = (p) => lerp(G.stack.z, G.lift.foot.z, p) + 0.45;
  let x, z, pose, t = 0, hands = 0;
  if (k < 0.04) { const p = smooth(k, 0, 0.04); x = lerp(m.spot.x, sx, p); z = lerp(m.spot.z, zPush(0), p); pose = 'walk'; t = p * 0.5 / STRIDE; }
  else if (k < 0.2) { const p = smooth(k, 0.04, 0.2); x = sx; z = zPush(p); pose = 'push'; t = p; hands = win(k, 0.04, 0.06, 0.18, 0.2); }
  else if (k < 0.24) { x = sx; z = zPush(1); pose = 'stand'; }
  else { const p = smooth(k, 0.24, 0.42); x = lerp(sx, m.spot.x, p); z = lerp(zPush(1), m.spot.z, p); pose = p > 0.02 && p < 0.98 ? 'walk' : 'stand'; t = p * 1.8 / STRIDE; }
  toRoot(crew, x, z);
  const face = k >= 0.24 ? headingOf(m.spot.x - sx, m.spot.z - zPush(1)) : 0;
  m.put(_p.x, 0, _p.z, (k >= 0.24 && k < 0.42 ? face : 0) + crew.az, pose, t);
  if (hands > 0 && d.vis) {
    // palms on the shell's flank, its rear half
    for (const [hand, dz] of [['L', 0.25], ['R', 0.55]]) {
      toRoot(crew, G.lift.x + side * crew.srad * 0.95, zPush(smooth(k, 0.04, 0.2)) - 0.45 + dz);
      m.hand(hand, _p.x, G.stack.y + 0.02, _p.z, hands);
    }
  }
}

// the bagman: from the rack to beside the tray with the charge, lays it in, back
function bagMan(crew, m, c, h, G, d) {
  const H = home(crew, m, G, h), s = c.s, k = c.k;
  if (s !== 'cartridge' || k > CH.back + 0.15) { m.put(H.x, H.y, H.z, H.h, 'stand', crew.idleT + m.seed); return; }
  const pl = G.bagPlace, hm = { x: m.spot.x, z: m.spot.z };
  const dist = Math.hypot(pl.x - hm.x, pl.z - hm.z), hd = headingOf(pl.x - hm.x, pl.z - hm.z);
  let x = hm.x, z = hm.z, head = m.spot.heading, pose = 'stand', t = 0, carry = false, lay = 0;
  if (k < CH.pick) { pose = 'lift'; t = smooth(k, 0, CH.pick); carry = k > CH.pick * 0.4; }
  else if (k < CH.go) { const p = smooth(k, CH.pick, CH.go); x = lerp(hm.x, pl.x, p); z = lerp(hm.z, pl.z, p); head = hd; pose = p < 0.98 ? 'carryWalk' : 'carry'; t = p * dist / CSTRIDE; carry = true; }
  else if (k < CH.lay) { x = pl.x; z = pl.z; head = Math.PI / 2; pose = 'carry'; carry = true; lay = smooth(k, CH.go, CH.lay); }
  else { const p = smooth(k, CH.lay, CH.back); x = lerp(pl.x, hm.x, p); z = lerp(pl.z, hm.z, p); head = hd + Math.PI; pose = p > 0.02 && p < 0.98 ? 'walk' : 'stand'; t = p * dist / STRIDE; if (p >= 0.98) head = m.spot.heading; }
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

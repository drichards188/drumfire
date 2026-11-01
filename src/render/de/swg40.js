import * as THREE from 'three';
import { smooth, lerp, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';
import { trap, turn } from '../drill_pace.js';
import { inCover } from '../crews_rocket.js';

// The schweres Wurfgerät 40's crew (models/v/de/swg40.js): the crates are the launcher, so loading is carrying.
//   open    (2 s) the men are coming back from the slit trench after the ripple
//   shell   (36 s) the carrying party, four to a crate (crate0 and crate1 at the front handles, crate2 and crate3 at
//           the rear frame), lifts the next crate at the stack, carries it round behind its lane on the frame and slides
//           it up the ramp onto the crossbars until its base bears on the stop, then walks back for the next: four
//           trips, the last crate first fired last. Before each one comes in the layer pulls that lane's spent crate off
//           the ramp and carries it to the pile beside the frame, then walks back to his place.
//   prime   (6 s) the layer clips the firing leads onto the four crates' igniters, lane by lane; the party walks off
//           to the slit trench
//   lay     the layer back at his place by the frame's left rear, laying it (the frame is turned and its legs set)
//   cover   the layer runs to the trench; the firer (the Nebelwerfer's nbFirer, render/crews_de.js) at the firing box
// Everything is a pure function of the piece's job, the time since the shot and its ripple, like the Nebelwerfer's.
export const ROLES = { firer: 'nbFirer', layer: 'swLayer', crate0: 'swCrate', crate1: 'swCrate', crate2: 'swCrate', crate3: 'swCrate' };
export const LIGHT = true;
export const WORLD = new Set(['firer', 'layer', 'crate0', 'crate1', 'crate2', 'crate3']);
export const STAFF = 1.2;

const N = 4; // crates on the frame
const OFF = 0.12, TRIP = (1 - OFF) / N; // trip i of the 'shell' step starts at OFF + i TRIP (OFF: the party back from cover)
const U_LIFT = 0.1, U_CARRY = 0.45, U_LAID = 0.62, U_BACK = 0.95; // a trip's phases (share of the trip)
const CARRY_Y = 0.72; // the crate's middle while carried (rope handles at the men's hands)
const BEHIND = 1.0; // where the party stands the crate before sliding it on: this far behind its place on the ramp
// The party round the crate (r right, f forward of its middle; the crate's nose forward): the front pair beside it
// at the front handles, the rear pair behind its base at the rear frame (models/v/de/swg40.js builds the waiting
// marks the same way round the crate at the stack).
const FORM = [[-0.45, 0.12], [0.45, 0.12], [-0.16, -0.82], [0.16, -0.82]];
// the layer's windows in the 'shell' step: trip i's spent crate is off the frame and on the pile by TIP_END(i), just
// before the party comes in with the new one; the first starts when he is back from cover
const TIP_END = (i) => OFF + (i + U_CARRY) * TRIP - 0.01, TIP_LEN = 0.16, TIP0 = 0.08;
const tipStart = (i) => (i === 0 ? TIP0 : TIP_END(i) - TIP_LEN);
const HOMEWALK = 0.06; // after a window the layer walks home in this share of the step
const WSTRIDE = CREW_GAITS.walk.stride;

const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _inv = new THREE.Matrix4();

// a crate's pose { x, y, z, h, pitch } (root space; YXZ: heading, then pitch) as a matrix
const poseMatrix = (P, out) => out.compose(_p.set(P.x, P.y, P.z), _q.setFromEuler(_e.set(P.pitch, P.h, 0)), _one);
// a point given in crate space (x right, y up, z back) at a pose, into out (Vector3)
function crateAt(P, x, y, z, out) {
  out.set(x, y, z).applyEuler(_e.set(P.pitch, P.h, 0));
  return out.set(out.x + P.x, out.y + P.y, out.z + P.z);
}

// Shared per frame (crew.sw): the trip under way, the crate's pose, the crates on the frame and the pile.
function plan(crew, c) {
  const S = crew.sw ??= {
    c: null, slot: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, h: 0, pitch: 0 })), rear: [0, 1, 2, 3].map(() => new THREE.Vector3()),
    crate: { x: 0, y: 0, z: 0, h: 0, pitch: 0 }, c0: { x: 0, y: 0, z: 0, h: 0, pitch: 0 }, pick: { x: 0, y: 0, z: 0, h: 0, pitch: 0 },
    tip: { x: 0, y: 0, z: 0, h: 0, pitch: 0 }, man: { x: 0, z: 0, h: 0, d: 0, gait: 'stand' }, tipI: -1, tipE: 0, after: -1,
    trip: -1, u: 0, full: 0, spent: 0, litter: [0, 0, 0, 0], fwd: { x: 0, z: -1 },
  };
  if (S.c === c) return S;
  S.c = c;
  const rig = crew.rig, p = c.p, fired = p.firedAt > 0, cap = Math.min(N, p.tubes ?? N);
  rig.root.updateMatrixWorld(true);
  _inv.copy(rig.root.matrixWorld).invert();
  const el = rig.pivots.elevation?.rotation.x ?? 0;
  for (let j = 0; j < N; j++) {
    rig.slotMatrix(j, _M).decompose(_p, _q, _p2);
    _e.setFromQuaternion(_q, 'YXZ');
    Object.assign(S.slot[j], { x: _p.x, y: _p.y, z: _p.z, h: _e.y, pitch: el });
    rig.anchors.tubes[j].getWorldPosition(S.rear[j]).applyMatrix4(_inv);
  }
  S.fwd.x = -Math.sin(crew.az); S.fwd.z = -Math.cos(crew.az);
  const pk = rig.anchors.pickup;
  Object.assign(S.pick, { x: pk.x, y: pk.y, z: pk.z, h: pk.h, pitch: 0 });
  // the frame: n full crates (the last n of the firing order), the spent ones (the first of it), the pile
  S.trip = -1; S.tipI = -1; S.after = -1;
  const j = p.job, k = c.k;
  S.litter.fill(0); // 0 none, 1 on the pile, 2 in the layer's hands
  if (p.ripple) { S.full = Math.max(0, cap - p.ripple.i); S.spent = Math.min(N, p.ripple.i); }
  else if (j && j.step === 'shell') {
    let laid = 0, off = 0;
    for (let i = 0; i < N; i++) {
      const u = (k - OFF - i * TRIP) / TRIP;
      if (u >= U_LAID) laid++;
      if (u >= 0 && u < 1) { S.trip = i; S.u = u; }
      if (!fired) continue;
      // the spent crate leaves the ramp when he starts pulling it, lies on the pile once he has put it down
      const e = (k - tipStart(i)) / (TIP_END(i) - tipStart(i));
      if (e >= 1) { S.litter[i] = 1; off++; if (k < TIP_END(i) + HOMEWALK) S.after = i; }
      else if (e >= 0) { S.tipI = i; S.tipE = e; if (e >= T_WALK) { off++; S.litter[i] = e >= T_DOWN1 ? 1 : 2; } }
    }
    S.full = Math.min(cap, laid); S.spent = fired ? N - off : 0;
  } else if (j && j.step === 'open') { S.full = 0; S.spent = fired ? N : 0; }
  else if (p.loaded || (j && j.i > 0)) { S.full = cap; S.spent = 0; if (fired) S.litter.fill(1); }
  else { S.full = 0; S.spent = fired ? N : 0; }
  // the crate in the party's hands (or lying at the stack)
  const C = S.crate;
  Object.assign(C, S.pick);
  if (S.trip >= 0) {
    const sl = S.slot[N - 1 - S.trip], c0 = S.c0;
    c0.x = sl.x - S.fwd.x * BEHIND; c0.z = sl.z - S.fwd.z * BEHIND; c0.y = CARRY_Y; c0.h = crew.az; c0.pitch = 0;
  }
  if (S.trip >= 0 && S.u < U_LAID) {
    const sl = S.slot[N - 1 - S.trip], c0 = S.c0, u = S.u;
    if (u < U_LIFT) C.y = lerp(S.pick.y, CARRY_Y, smooth(u, 0.01, U_LIFT));
    else if (u < U_CARRY) {
      const e = trap((u - U_LIFT) / (U_CARRY - U_LIFT), 0.18), hp = headingOf(c0.x - S.pick.x, c0.z - S.pick.z);
      C.x = lerp(S.pick.x, c0.x, e); C.z = lerp(S.pick.z, c0.z, e); C.y = CARRY_Y;
      C.h = e < 0.5 ? turn(S.pick.h, hp, smooth(e, 0, 0.3)) : turn(hp, c0.h, smooth(e, 0.7, 1));
      S.carryD = Math.hypot(c0.x - S.pick.x, c0.z - S.pick.z) * e;
    } else if (u < U_LAID) {
      const e = smooth(u, U_CARRY + 0.01, U_LAID - 0.01);
      C.x = lerp(c0.x, sl.x, e); C.y = lerp(c0.y, sl.y, e); C.z = lerp(c0.z, sl.z, e); C.h = c0.h; C.pitch = lerp(0, sl.pitch, e);
    }
  }
  if (S.tipI >= 0) layerTip(crew, S);
  return S;
}

// The layer's window for trip i's spent crate (e 0..1): to the lane's rear, the crate pulled off backwards, carried to
// the pile and put down; his place and heading in S.man, the crate's pose in S.tip.
const T_WALK = 0.25, T_PULL = 0.25, T_CARRY = 0.45, T_DOWN0 = 0.85, T_DOWN1 = 0.95, HOLD = 0.78;
const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 }, _pile = new THREE.Matrix4();
function layerHome(crew, out) {
  // his place by the frame's left rear (the rig's spot, turned with the frame)
  const s = crew.swLayer ??= crew.men.find((m) => m.role === 'layer')?.spot ?? { x: -1.15, z: 0.95, heading: -0.9 };
  const dx = s.x - crew.pvx, dz = s.z - crew.pvz;
  out.x = dx * crew.ca + dz * crew.sa + crew.pvx; out.z = -dx * crew.sa + dz * crew.ca + crew.pvz; out.h = s.heading + crew.az;
  return out;
}
const _home = { x: 0, z: 0, h: 0 };
function pileStand(crew, i, out) {
  crew.rig.litterRest(i, _pile).decompose(_p, _q, _p2);
  _e.setFromQuaternion(_q, 'YXZ');
  out.x = _p.x + Math.sin(_e.y) * HOLD; out.z = _p.z + Math.cos(_e.y) * HOLD; out.h = _e.y; out.y = _p.y;
  return out;
}
const _ps = { x: 0, z: 0, h: 0, y: 0 };
function layerTip(crew, S) {
  const i = S.tipI, e = S.tipE, sl = S.slot[N - 1 - i], rear = S.rear[N - 1 - i], M = S.man, T = S.tip;
  layerHome(crew, _home);
  // B: a step behind the lane's base; B2: where he has stepped back to with the crate
  _a.x = rear.x - S.fwd.x * 0.55; _a.z = rear.z - S.fwd.z * 0.55;
  _b.x = _a.x - S.fwd.x * 0.35; _b.z = _a.z - S.fwd.z * 0.35;
  pileStand(crew, i, _ps);
  const held = (x, z, h, pitch) => { T.x = x - Math.sin(h) * HOLD; T.z = z - Math.cos(h) * HOLD; T.y = 0.55; T.h = h; T.pitch = pitch; };
  M.gait = 'stand'; M.d = 0;
  if (e < T_WALK) {
    const w = trap(e / T_WALK, 0.2), d = Math.hypot(_a.x - _home.x, _a.z - _home.z);
    M.x = lerp(_home.x, _a.x, w); M.z = lerp(_home.z, _a.z, w); M.h = w < 0.85 ? headingOf(_a.x - _home.x, _a.z - _home.z) : turn(headingOf(_a.x - _home.x, _a.z - _home.z), crew.az, (w - 0.85) / 0.15);
    if (w > 0 && w < 1) { M.gait = 'walk'; M.d = d * w; }
    Object.assign(T, sl);
  } else if (e < T_PULL + T_WALK) {
    // he takes hold of the base and pulls it back off the ramp, stepping back; the crate comes down level
    const w = smooth(e, T_WALK + 0.03, T_WALK + T_PULL);
    M.x = lerp(_a.x, _b.x, w); M.z = lerp(_a.z, _b.z, w); M.h = crew.az;
    if (w > 0 && w < 1) { M.gait = 'walk'; M.d = -0.35 * w; }
    held(M.x, M.z, crew.az, 0.12);
    T.x = lerp(sl.x, T.x, w); T.y = lerp(sl.y, T.y, w); T.z = lerp(sl.z, T.z, w); T.pitch = lerp(sl.pitch, 0.12, w);
  } else if (e < T_DOWN0) {
    // carried off to the pile, turning to lay it alongside the others
    const w = trap((e - T_PULL - T_WALK) / (T_DOWN0 - T_PULL - T_WALK), 0.2), d = Math.hypot(_ps.x - _b.x, _ps.z - _b.z);
    const hp = headingOf(_ps.x - _b.x, _ps.z - _b.z);
    M.x = lerp(_b.x, _ps.x, w); M.z = lerp(_b.z, _ps.z, w);
    M.h = w < 0.5 ? turn(crew.az, hp, smooth(w, 0, 0.25)) : turn(hp, _ps.h, smooth(w, 0.75, 1));
    if (w > 0 && w < 1) { M.gait = 'walk'; M.d = d * w; }
    held(M.x, M.z, M.h, 0.12 * (1 - w));
  } else {
    const w = smooth(e, T_DOWN0, T_DOWN1);
    M.x = _ps.x; M.z = _ps.z; M.h = _ps.h;
    held(M.x, M.z, M.h, 0);
    T.y = lerp(0.55, _ps.y, w);
  }
}

// ---------------------------------------------------------------- the men

const _hp = new THREE.Vector3(), _hq = new THREE.Vector3();
const _go = { x: 0, z: 0, h: 0 };

function crateMan(crew, m, c) {
  m.noEars = true;
  m.world = true;
  const S = plan(crew, c), r = Number(m.role.slice(5)) || 0, [fr, ff] = FORM[r];
  // waiting mark: round the crate at the stack, as they will lift it
  const P = S.pick, wx = P.x + fr * Math.cos(P.h) - ff * Math.sin(P.h), wz = P.z - fr * Math.sin(P.h) - ff * Math.cos(P.h);
  _go.x = wx; _go.z = wz;
  const cover = crew.rig.anchors.cover;
  if (inCover(crew, m, c, cover?.[2 + r], _go, P.h, null, true)) return;
  const u = S.u, C = S.crate;
  if (S.trip < 0 || u >= U_BACK) { m.put(wx, 0, wz, P.h, 'stand', crew.idleT + m.seed); return; }
  // his place in the party round the crate's middle at heading h (level)
  const atForm = (Cx, Cz, h, out) => { out.x = Cx + fr * Math.cos(h) - ff * Math.sin(h); out.z = Cz - fr * Math.sin(h) - ff * Math.cos(h); return out; };
  const front = r < 2, sgn = fr < 0 ? -1 : 1;
  const grip = (P2, w) => {
    // the front pair: the inner hand on the rope handle by the front of their side; the rear pair: both hands on
    // their half of the rear frame
    if (front) {
      crateAt(P2, sgn * 0.18, -0.03, -0.3, _hp);
      crateAt(P2, sgn * 0.17, 0.12, -0.08, _hq);
      m.hand(sgn < 0 ? 'R' : 'L', _hp.x, _hp.y, _hp.z, w);
      m.hand(sgn < 0 ? 'L' : 'R', _hq.x, _hq.y, _hq.z, w * 0.8);
    } else {
      crateAt(P2, sgn * 0.03, -0.06, 0.5, _hp);
      crateAt(P2, sgn * 0.15, -0.06, 0.5, _hq);
      m.hand(sgn < 0 ? 'R' : 'L', _hp.x, _hp.y, _hp.z, w);
      m.hand(sgn < 0 ? 'L' : 'R', _hq.x, _hq.y, _hq.z, w);
    }
  };
  if (u < U_LIFT) {
    m.put(wx, 0, wz, P.h, 'lift', smooth(u, 0, U_LIFT));
    grip(C, smooth(u, 0, 0.03));
    return;
  }
  if (u < U_CARRY) {
    atForm(C.x, C.z, C.h, _go);
    const moving = u > U_LIFT + 0.005 && u < U_CARRY - 0.005;
    m.put(_go.x, 0, _go.z, C.h, moving ? 'walk' : 'stand', moving ? (S.carryD ?? 0) / WSTRIDE : crew.idleT + m.seed);
    grip(C, 1);
    return;
  }
  const c0 = S.c0;
  if (u < U_LAID) {
    const e = smooth(u, U_CARRY + 0.01, U_LAID - 0.01);
    if (front) {
      // they guide the front onto the ramp, let go and step out of the way
      atForm(c0.x, c0.z, c0.h, _go);
      const out = 0.3 * smooth(e, 0.3, 0.6);
      _go.x += Math.cos(c0.h) * sgn * out; _go.z -= Math.sin(c0.h) * sgn * out;
      m.put(_go.x, 0, _go.z, c0.h, e > 0.3 && e < 0.6 ? 'walk' : 'stand', e > 0.3 && e < 0.6 ? out / WSTRIDE * 2 : crew.idleT + m.seed);
      grip(C, 1 - smooth(e, 0.25, 0.35));
    } else {
      // they push it home by its base, walking in behind it
      crateAt(C, sgn * 0.16, 0, 0.5, _hp);
      const sx = _hp.x - S.fwd.x * 0.36, sz = _hp.z - S.fwd.z * 0.36;
      atForm(c0.x, c0.z, c0.h, _go);
      const d = Math.hypot(sx - _go.x, sz - _go.z);
      m.put(sx, 0, sz, c0.h, e > 0.02 && e < 0.98 ? 'walk' : 'stand', e > 0.02 && e < 0.98 ? d / WSTRIDE : crew.idleT + m.seed);
      grip(C, 1 - smooth(u, U_LAID - 0.02, U_LAID));
    }
    return;
  }
  // back to the stack for the next one, at a walk; turned to the crate there at the end
  let sx, sz;
  if (front) {
    atForm(c0.x, c0.z, c0.h, _go);
    sx = _go.x + Math.cos(c0.h) * sgn * 0.3; sz = _go.z - Math.sin(c0.h) * sgn * 0.3;
  } else {
    const sl = S.slot[N - 1 - S.trip];
    crateAt(sl, sgn * 0.16, 0, 0.5, _hp);
    sx = _hp.x - S.fwd.x * 0.36; sz = _hp.z - S.fwd.z * 0.36;
  }
  const e = trap((u - U_LAID) / (U_BACK - U_LAID - 0.02), 0.15), d = Math.hypot(wx - sx, wz - sz), hw = headingOf(wx - sx, wz - sz);
  const h = e < 0.15 ? turn(c0.h, hw, e / 0.15) : e > 0.85 ? turn(hw, P.h, (e - 0.85) / 0.15) : hw;
  const moving = e > 0 && e < 1;
  m.put(lerp(sx, wx, e), 0, lerp(sz, wz, e), h, moving ? 'walk' : 'stand', moving ? (d * e) / WSTRIDE : crew.idleT + m.seed);
}

function layerMan(crew, m, c) {
  m.noEars = true;
  m.world = true;
  const S = plan(crew, c), H = layerHome(crew, _home);
  const cover = crew.rig.anchors.cover;
  if (inCover(crew, m, c, cover?.[0], H, H.h, null, false)) return;
  const s = c.s, k = c.k;
  if (s === 'shell' && S.tipI >= 0) {
    const M = S.man;
    m.put(M.x, 0, M.z, M.h, M.gait, M.gait === 'stand' ? crew.idleT + m.seed : M.d / WSTRIDE);
    if (S.tipE >= T_WALK - 0.02 && S.tipE < T_DOWN1) {
      const w = smooth(S.tipE, T_WALK - 0.02, T_WALK + 0.04) * (1 - smooth(S.tipE, T_DOWN1 - 0.03, T_DOWN1));
      crateAt(S.tip, -0.12, 0.06, 0.5, _hp); crateAt(S.tip, 0.12, 0.06, 0.5, _hq);
      m.hand('L', _hp.x, _hp.y, _hp.z, w); m.hand('R', _hq.x, _hq.y, _hq.z, w);
    }
    return;
  }
  if (s === 'shell' && S.after >= 0) {
    // home from the pile
    pileStand(crew, S.after, _ps);
    const e = trap((k - TIP_END(S.after)) / HOMEWALK, 0.2), d = Math.hypot(H.x - _ps.x, H.z - _ps.z), hw = headingOf(H.x - _ps.x, H.z - _ps.z);
    const h = e < 0.15 ? turn(_ps.h, hw, e / 0.15) : e > 0.85 ? turn(hw, H.h, (e - 0.85) / 0.15) : hw, moving = e > 0 && e < 1;
    m.put(lerp(_ps.x, H.x, e), 0, lerp(_ps.z, H.z, e), h, moving ? 'walk' : 'stand', moving ? (d * e) / WSTRIDE : crew.idleT + m.seed);
    return;
  }
  if (s === 'prime') {
    // to the first lane's base, then along the four clipping the leads on (the firing order's lanes, left to right)
    const st = (j, out) => { const r = S.rear[j]; out.x = r.x - S.fwd.x * 0.5; out.z = r.z - S.fwd.z * 0.5; return out; };
    const order = byX(S);
    if (k < 0.25) {
      st(order[0], _a);
      const w = trap(k / 0.25, 0.2), d = Math.hypot(_a.x - H.x, _a.z - H.z), moving = w > 0 && w < 1;
      m.put(lerp(H.x, _a.x, w), 0, lerp(H.z, _a.z, w), w < 0.8 ? headingOf(_a.x - H.x, _a.z - H.z) : turn(headingOf(_a.x - H.x, _a.z - H.z), crew.az, (w - 0.8) / 0.2), moving ? 'walk' : 'stand', moving ? (d * w) / WSTRIDE : 0);
      return;
    }
    const q = (k - 0.25) / 0.75 * N, i = Math.min(N - 1, Math.floor(q)), ph = q - i;
    st(order[i], _a);
    if (ph > 0.8 && i < N - 1) {
      st(order[i + 1], _b);
      const w = smooth(ph, 0.8, 1);
      m.put(lerp(_a.x, _b.x, w), 0, lerp(_a.z, _b.z, w), crew.az, 'sidestep', Math.hypot(_b.x - _a.x, _b.z - _a.z) * w / CREW_GAITS.sidestep.stride);
      return;
    }
    m.put(_a.x, 0, _a.z, crew.az, 'crouch', crew.idleT + m.seed);
    const r = S.rear[order[i]], w = smooth(ph, 0.1, 0.3) * (1 - smooth(ph, 0.65, 0.8));
    m.hand('R', r.x + Math.cos(crew.az) * 0.05, r.y - 0.05, r.z - Math.sin(crew.az) * 0.05, w);
    m.hand('L', r.x - Math.cos(crew.az) * 0.08, r.y - 0.1, r.z + Math.sin(crew.az) * 0.08, w * 0.7);
    return;
  }
  if (s === 'lay') {
    // back from the last lane to his place, then sighting along the crates
    const order = byX(S), r = S.rear[order[N - 1]];
    _a.x = r.x - S.fwd.x * 0.5; _a.z = r.z - S.fwd.z * 0.5;
    const w = trap(k / 0.6, 0.2), d = Math.hypot(H.x - _a.x, H.z - _a.z), moving = w > 0 && w < 1;
    if (w < 1) { m.put(lerp(_a.x, H.x, w), 0, lerp(_a.z, H.z, w), headingOf(H.x - _a.x, H.z - _a.z), moving ? 'walk' : 'stand', moving ? (d * w) / WSTRIDE : 0); return; }
    m.put(H.x, 0, H.z, H.h, 'lay', (c.p.az + c.p.el) * 30);
    return;
  }
  const p = c.p, moving = Math.abs(p.cmd.az - p.az) > 3e-4 || Math.abs(p.cmd.el - p.el) > 3e-4;
  m.put(H.x, 0, H.z, H.h, moving ? 'lay' : 'stand', moving ? (p.az + p.el) * 30 : crew.idleT + m.seed);
}

// the lanes (firing-order indices) from left to right across the frame
const _byX = [0, 1, 2, 3];
function byX(S) {
  // left to right in the frame's own across direction
  const ax = -S.fwd.z, az = S.fwd.x; // (right of forward)
  _byX.sort((a, b) => (S.rear[a].x * ax + S.rear[a].z * az) - (S.rear[b].x * ax + S.rear[b].z * az));
  return _byX;
}

export function act(crew, m, c) {
  if (m.beh === 'swCrate') { crateMan(crew, m, c); return true; }
  if (m.beh === 'swLayer') { layerMan(crew, m, c); return true; }
  return false;
}

// the frame's crates, the pile and the crate being carried follow the drill; no staff, cartridge, lanyard or shell
export function props(crew, c) {
  for (const o of [crew.staff, crew.bag, crew.rope, crew.shellA, crew.shellB]) o.visible = false;
  const rig = crew.rig, S = plan(crew, c);
  rig.setRounds?.(S.full, S.spent);
  for (let i = 0; i < N; i++) {
    if (S.litter[i] === 1) rig.setLitter(i, rig.litterRest(i, _M2));
    else if (S.litter[i] === 2) rig.setLitter(i, poseMatrix(S.tip, _M2));
    else rig.setLitter(i, null);
  }
  const prop = rig.crateProp;
  if (prop) {
    // the next crate lies at the stack whenever it is not in the party's hands (a fresh one comes up as the last
    // goes on the frame: the ammunition stack's men are off the picture)
    const C = S.crate;
    prop.visible = true;
    prop.position.set(C.x, C.y, C.z);
    prop.rotation.set(C.pitch, C.h, 0);
  }
  return true;
}

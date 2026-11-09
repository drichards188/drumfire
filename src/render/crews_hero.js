// The max-quality battery's drill (shots/maxq/PLAN.md, track M): what a GunCrew built with { hero: true } does
// differently. Everything here runs only for such a crew (render/crews.js calls in behind `crew.hero`), so the drills
// of the other guns are untouched. The cue table in render/herocues.js is the contract with the foley and the effects:
// the timings below are built to it.
//
// The shot clock (item 2): the crew sees the shot coming (herocues.js shotIn, crew.shotT) in every path the sim can
// foresee: the firer holds the lanyard through the lay, takes up the slack and draws it sharply so the lever trips at
// the shot (crew.pull, 0 to 1 drawn); the gun commander raises his arm ("Fertig!") and cuts it down at the shot
// ("Feuer!", crew.feuer: 1 up, 0 down, below 0 the follow-through), watching the breech and then the round downrange;
// everyone else has his hands over his ears before the blast (crew.ears) and ducks at it (the flinch, scaled by his
// distance from the muzzle). The rammer staff rests on its hooks (rig.anchors.staffHooks, else on the deck's rear
// corner) whenever it is not in use, so nobody holds it in mid-air with his hands on his ears.
//
// Purity: every pose is a function of the piece and the time. The few render states (the pull's and the arm's rate
// limits, the last warning before a shot) converge and reset when the sim time jumps by more than 0.5 s.
import * as THREE from 'three';
import { smooth, lerp, wrapPi, headingOf, clamp01 } from './anim.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------- per frame, before the men
// The firer's pull and the commander's arm for this frame (crew.pull, crew.feuer), and the lever's place.
export function heroFrame(crew, c) {
  const H = crew.H ??= { at: -1e9, pull: 0, warnAt: -1e9, mods: null };
  const now = c.now, dt = now - H.at, jump = !(dt >= 0 && dt <= 0.5);
  H.at = now;
  const tw = c.tw, tf = c.tf;
  if (tw > 0.12 && tw <= 1.45) H.warnAt = now; // (the arm was up: the shot that follows gets the cut's follow-through)
  if (jump) H.warnAt = tw <= 1.45 ? now : -1e9;
  // the draw: taut from 0.6 s before the shot, drawn over its last 0.2 s, held through the kick, let go by tf 0.6
  const fired = tf >= 0 && tf < 0.6;
  const want = fired ? 1 - smooth(tf, 0.25, 0.6) : tw <= 0.2 ? smooth(0.2 - tw, 0, 0.16) : 0;
  // (a shot nobody could see coming: the hand still snaps back, at most a full draw in 0.06 s)
  H.pull = jump ? want : H.pull + clamp(want - H.pull, -dt / 0.25, dt / 0.06);
  crew.pull = H.pull;
  crew.taut = fired ? 1 - smooth(tf, 0.3, 0.8) : tw <= 0.6 ? smooth(0.6 - tw, 0, 0.35) : 0;
  // the commander: up over 1.4 to 0.95 s before the shot, held, cut down over its last 0.12 s; the follow-through only
  // after a shot he had signalled
  let f = 0;
  const signalled = now - H.warnAt < 0.35; // (this shot, or the one just fired, was signalled)
  if (tw <= 1.4 && tw > 0.12) f = smooth(1.4 - tw, 0, 0.45);
  else if (tw <= 0.12) f = smooth(tw, 0, 0.12);
  else if (tf >= 0 && tf < 1.2 && now - tf - H.warnAt < 0.35) f = -0.4 * smooth(tf, 0, 0.22) * (1 - smooth(tf, 0.35, 1.2));
  crew.feuer = f;
  // he is in the signal (the feuer pose) from the raise to the end of the follow-through; a shot nobody saw coming
  // leaves him standing (one frame of the pose at its rest was a flicker)
  crew.feuerOn = (tw <= 1.4 && (tw > 0 || signalled)) || (tf >= 0 && tf < 1.2 && now - tf - H.warnAt < 0.35);
  // the block's operating crank turns half a turn as the block runs out (it drives it); the firing lever trips back
  // with the cord's draw
  const G = crew.rig.gear;
  if (G?.crank) G.crank.rotation.x = -Math.PI * (crew.rig.heroBreechK?.k ?? 0);
  if (G?.lever) G.lever.rotation.x = 0.5 * H.pull;
  crew.rig.root.updateMatrixWorld(true);
  heroLever(crew, crew.lever ??= new THREE.Vector3());
  // the lever where it is in battery (the barrel and the top carriage run back at the shot: he faces where it belongs)
  const P = crew.rig.pivots, L0 = crew.lever0 ??= new THREE.Vector3();
  L0.copy(crew.lever).addScaledVector(crew.u, P.recoil?.position.z ?? 0);
  L0.x += crew.bd.x * (P.carriage?.position.z ?? 0); L0.z += crew.bd.z * (P.carriage?.position.z ?? 0);
  // whether the wheels turn (the laying gear moved within the last 0.15 s)
  const p = c.p, G2 = H.g ??= { el: p.el, az: p.az, elAt: -1e9, azAt: -1e9 };
  if (!jump && Math.abs(p.el - G2.el) > 1e-6) G2.elAt = now;
  if (!jump && Math.abs(p.az - G2.az) > 1e-6) G2.azAt = now;
  G2.el = p.el; G2.az = p.az;
  crew.gearMoving = now - G2.elAt < 0.15 || now - G2.azAt < 0.15;
}

// the firing lever's eye in root space (track G's rig.knobs.lever; else the right top of the breech ring)
function heroLever(crew, out) {
  const k = crew.rig.knobs?.lever;
  if (k) return k.getWorldPosition(out).applyMatrix4(crew.invRoot());
  return out.copy(crew.B).addScaledVector(crew.u, 0.3).add(_d.set(0.15, 0.25, 0));
}

// ---------------------------------------------------------------- the men
// The hero's own behaviours; true when this one has posed the man.
export function heroAct(crew, m, c, h) {
  switch (m.beh) {
    case 'cmd': heroCommander(crew, m, c, h); return true;
    case 'lay': return heroWheelMan(crew, m, c, h, 'wheelL', 'layCrank');
    case 'wheel': return heroWheelMan(crew, m, c, h, 'wheelR', 'crank');
    default: return false;
  }
}

// The layer (the elevating wheel, the sight) and the traverser (the traversing wheel): each with his right hand on his
// wheel's knob (rig.knobs, a child of the wheel's pivot, so the hand goes round with the handle and never slips), the
// body rolling with the handle's angle. The hand lets go while the ears are covered and while the top carriage is out
// of battery (the wheels ride it back 0.6 m at the shot); then it rests where the pose puts it.
const TURN = Math.PI * 2;
function heroWheelMan(crew, m, c, h, gear, pose) {
  const wheel = crew.rig.gear?.[gear], knob = crew.rig.knobs?.[gear];
  if (!wheel || !knob) return false;
  m.put(h.x, h.y, h.z, h.h, pose, Math.abs(wheel.rotation.x) / TURN);
  const out = crew.rig.pivots.carriage?.position.z ?? 0;
  const w = (1 - smooth(crew.ears, 0.15, 0.5)) * (1 - smooth(out, 0.01, 0.05));
  if (w > 0.01) {
    knob.getWorldPosition(_a).applyMatrix4(crew.invRoot());
    reachTo(m, 'R', _a.x, _a.y, _a.z, w, _p.set(0.7, -0.7, 0.2));
  }
  if (!crew.knobHands) crew.knobHands = [];
  if (!m.knobReg) { m.knobReg = { man: m, side: 'R', knob, w: 0 }; crew.knobHands.push(m.knobReg); }
  m.knobReg.w = w; // (crewcheck measures the hand on the knob only while it is meant to hold it)
  return true;
}
const _p = new THREE.Vector3();

function heroCommander(crew, m, c, h) {
  m.noEars = true; // (his hands are for the signal; he stands 3 m off the breech)
  const f = crew.feuer, inSignal = crew.feuerOn;
  // a new fire command for the gunner's gun not yet read back (src/ww2/gunner.js: the player holds E at post 1, or the
  // crew reads it back): the handset at his ear, the pad in his hand, nodding through the repeat (heroMods)
  const st = c.p.manned ? crew.sim?.gunner?.st : null, readback = !!(st?.order?.ok && !st.order.acked);
  crew.readback = readback ? (st.hold?.what === 'ack' ? st.hold.t : 0.001) : 0;
  m.put(h.x, h.y, h.z, h.h, inSignal ? 'feuer' : readback || c.st === 'idle' ? 'phone' : 'stand', inSignal ? f : crew.idleT + m.seed);
}

// The firer at his post (not at the block): the lanyard in his right hand from the primer on, through the lay and the
// wait, slack, taken up, drawn; true when it posed him.
export function heroFirer(crew, m, c, h) {
  const on = c.s === 'prime' ? c.k > 0.2 : c.s === 'lay' || c.st === 'ready' || c.st === 'laying' || (c.st === 'recoil' && c.tf < 0.9);
  m.noEars = true;
  const L = crew.lever, L0 = crew.lever0 ?? L, taut = crew.taut ?? 0, draw = crew.pull ?? 0;
  // facing the lever in battery, never more than 0.6 rad off his post's heading (he stays at his place on the walkway),
  // turned to it as he takes the cord and back after the shot
  let turn = c.s === 'prime' ? smooth(c.k, 0.2, 0.6) : on ? 1 : c.st === 'recoil' ? 1 - smooth(c.tf, 0.9, 1.6) : 0;
  // (not before he is back at his post from closing the block: GunCrew.blockMan's walk)
  const T = crew.tl;
  if (T && Number.isFinite(T.now) && crew.blockWalk != null) { const back = T.at('close', 1) + crew.blockWalk; turn = Math.min(turn, smooth(T.now, back, back + 0.7)); }
  const face = headingOf(L0.x - h.x, L0.z - h.z), hh = h.h + clamp(wrapPi(face - h.h), -0.6, 0.6) * turn;
  m.plantTurn = (m.plantTurn ?? 0) + wrapPi(hh - h.h); // (he turns at the hips; his feet stay at his post)
  if (!on) { crew.rope.visible = false; if (crew.heroRope) crew.heroRope.visible = false; m.put(h.x, h.y, h.z, hh, 'stand', crew.idleT + m.seed); return true; }
  m.carry = 'lanyard';
  m.put(h.x, h.y, h.z, hh, 'pull', 0.5 * taut + 0.5 * draw);
  // the right hand on the cord's line: slack at the belt, out along it taut, back by the hip drawn
  const sc = m.root.scale.x, ch = Math.cos(hh), sh = Math.sin(hh);
  const rx = ch, rz = -sh, fx = -sh, fz = -ch; // his right and his front in root space
  _a.set(h.x + rx * 0.19 * sc, h.y + 1.43 * sc, h.z + rz * 0.19 * sc); // the right shoulder
  _b.copy(L).sub(_a); const len = _b.length() || 1; _b.divideScalar(len);
  const reach = Math.min(0.55, len - 0.05);
  _c.copy(_a).addScaledVector(_b, reach * 0.7); _c.y -= 0.3 * sc; // slack
  _d.copy(_a).addScaledVector(_b, reach); // taut
  _c.lerp(_d, taut);
  _d.set(h.x + rx * 0.24 * sc - fx * 0.12 * sc, h.y + 0.98 * sc, h.z + rz * 0.24 * sc - fz * 0.12 * sc); // drawn, by the hip
  _c.lerp(_d, draw);
  m.hand('R', _c.x, _c.y, _c.z, 1);
  // the cord, from his fist to the lever's ring: slack while he only holds it, taken up taut, straight when drawn
  crew.rope.visible = false;
  const rope = heroRope(crew);
  rope.visible = crew.level > 1;
  if (rope.visible) {
    m.root.updateMatrixWorld(true);
    m.fig.anchors.handR.getWorldPosition(_a).applyMatrix4(crew.invRoot());
    ropeTo(rope, _a, L, 0.4 * (1 - taut) * (1 - draw));
  }
  return true;
}

// The life layer's per-man offsets (fig.pose mods), filled before the man is posed (name: the pose he is put in):
//   the flinch at the shot for every man (half for the firer on his cord), scaled by his distance from the muzzle;
//   breathing, 0.25 Hz and shallow at rest, up to 0.5 Hz and deeper after hard work (his exertion rises while he carries,
//   rams or cranks and falls over about 15 s);
//   weight shifts while he stands, from one leg to the other every 9 s or so (a seeded hash of the time: no two alike);
//   the look: the commander at the breech, along the round after the shot; a man standing by glances at the commander
//   when his arm goes up, follows the round up for two seconds after the shot, and now and then looks the gun over.
// None of it for the player's own man (the mouse looks for him) but the flinch. The breathing phase and the eased look
// are the only state, reset by a time jump.
const WORK = { carryWalk: 1 / 3, lift: 1 / 3, carry: 1 / 4, ramLoad: 1 / 3, push: 1 / 3, crank: 1 / 8, layCrank: 1 / 10, walk: 1 / 14, pull: 1 / 10, sidestep: 1 / 8 };
export function heroMods(crew, m, x, y, z, h, name) {
  const M = m.mods ??= { breath: 0, shift: 0, flinch: 0, lookYaw: 0, lookPitch: 0, lean: 0 };
  const c = crew.c, tf = c.tf, now = c.now, player = m === crew.player;
  let f = 0;
  if (tf >= 0 && tf < 0.45) {
    f = tf < 0.06 ? tf / 0.06 : 1 - smooth(tf, 0.06, 0.42);
    const d = Math.hypot(x - crew.Mz.x, y + 1.2 - crew.Mz.y, z - crew.Mz.z);
    f *= clamp(6 / Math.max(0.5, d), 0.3, 1) * (m.beh === 'lan' ? 0.5 : 1);
  }
  M.flinch = f;
  M.lean = m.stoop ?? 0;
  M.plantYaw = m.plantTurn ?? 0; // (turned at the hips over planted feet: the ears turn, the firer's turn to his cord)
  const L = m.life ??= { at: -1e9, ph: m.seed * 2.1, ex: 0, ly: 0, lp: 0 };
  const dt = now - L.at, jump = !(dt >= 0 && dt <= 0.5);
  L.at = now;
  // breathing and exertion
  const w = WORK[name] ?? 0;
  L.ex = jump ? (w > 0.2 ? 1 : 0) : clamp(L.ex + (w ? dt * w : -dt / 15), 0, 1);
  if (!jump) L.ph += TAU_ * (0.25 + 0.25 * L.ex) * dt;
  M.breath = player ? 0 : (0.012 + 0.022 * L.ex) * Math.sin(L.ph);
  // weight shifts while standing
  M.shift = !player && name === 'stand' ? weightShift(now, m.seed) : 0;
  // the look
  let ty = 0, tp = 0;
  if (!player) {
    if (m.beh === 'cmd') {
      // at the breech while the gun is worked and laid, along the bore and up after the shot
      const after = tf >= 0.08 && tf < 2.8 ? smooth(tf, 0.08, 0.35) * (1 - smooth(tf, 2.2, 2.8)) : 0;
      const hb = headingOf(crew.B.x - x, crew.B.z - z), hu = headingOf(crew.u.x, crew.u.z);
      ty = clamp(wrapPi(hb - h), -1, 1) * (1 - after) + clamp(wrapPi(hu - h), -1, 1) * after;
      tp = -0.35 * after + (crew.readback > 0 ? 0.12 + 0.1 * Math.sin(Math.PI * 2 * 1.6 * crew.readback) : 0); // (the nods)
    } else if (name === 'stand') {
      const off = crew.byRole.get('officer') ?? crew.byRole.get('sergeant');
      const hu = headingOf(crew.u.x, crew.u.z);
      if (off && off !== m && crew.feuerOn && crew.feuer > 0.3) { ty = clamp(wrapPi(headingOf(off.x - x, off.z - z) - h), -1, 1); tp = 0.05; }
      else if (tf >= 0.25 && tf < 2.4) { ty = clamp(wrapPi(hu - h), -1, 1) * 0.8; tp = -0.45 * smooth(tf, 0.25, 0.8); }
      else if (glance(now, m.seed)) { ty = clamp(wrapPi(headingOf(crew.B.x - x, crew.B.z - z) - h), -0.9, 0.9); tp = 0.12; }
    }
  }
  const e = jump ? 1 : 1 - Math.exp(-dt * 6);
  L.ly += (ty - L.ly) * e; L.lp += (tp - L.lp) * e;
  M.lookYaw = L.ly; M.lookPitch = L.lp;
  return M;
}
const TAU_ = Math.PI * 2;
const hash1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
// the weight on one leg or the other: a new choice every 9 s (offset per man), moved over in 0.8 s
function weightShift(now, seed) {
  const P = 9, u = (now + seed * 3.7) / P, i = Math.floor(u), t = (u - i) * P;
  const a = hash1(i - 1 + seed * 17), b = hash1(i + seed * 17);
  return a + (b - a) * smooth(t, 0, 0.8);
}
// now and then a look at the gun: 1.6 s in every 8 s window, at a seeded moment in it
function glance(now, seed) {
  const P = 8, u = (now + seed * 5.3) / P, i = Math.floor(u), t = (u - i) * P, at = 1 + 4.5 * (hash1(i * 3.1 + seed) * 0.5 + 0.5);
  return t > at && t < at + 1.6;
}

// ---------------------------------------------------------------- the staff
// The staff rests on its hooks (rig.anchors.staffHooks, else along the deck's right edge) except for the ram. Its owner
// (the rammer nearest the hooks) stoops and takes it up while the pair sets the shell, holds it at his hip, and with his
// mate swings it into the bore's line for the ram; after it he lays it back. On the cycle clock (herocues: staffUp,
// ram, staffOut, staffHung): sets crew.staff's transform, crew.staffOwner, crew.staffRest (on the hooks, in nobody's
// hands), crew.staffGrip (0 at rest or held at the hip, 1 in line), crew.staffHold (0..1: the owner's hands on it) and
// crew.staffPh (the phase: rest, reach, lift, held, into, line, out, lower, free).
const PH = ['rest', 'reach', 'lift', 'held', 'into', 'line', 'out', 'lower', 'free'];
export function heroStaff(crew, c) {
  const st = crew.staff, T = crew.tl, now = T?.now;
  const own = crew.heroOwner ??= staffOwnerOf(crew);
  crew.staffOwner = own;
  // the phase and its progress on the cycle clock
  let ph = 0, u = 0;
  if (T && Number.isFinite(now)) {
    const t = crew.staffT ??= new Float64Array(9);
    t[0] = T.at('shell', 0.8); t[1] = T.at('shell', 0.86); t[2] = T.at('shell', 0.95); t[3] = T.at('ram', 0.02); t[4] = T.at('ram', 0.17);
    t[5] = T.at('ram', 0.95); t[6] = T.at('cartridge', 0.06); t[7] = T.at('cartridge', 0.16); t[8] = t[7] + 0.6;
    for (let i = 0; i < 9; i++) if (now >= t[i]) { ph = i + 1; u = i + 1 < 9 ? clamp01((now - t[i]) / Math.max(0.01, t[i + 1] - t[i])) : 1; }
    if (ph >= 9) { ph = 0; u = 0; }
  }
  crew.staffPh = PH[ph];
  heroStaffRest(crew, _a, _q); // rest
  crew.staffGrip = 0;
  if (ph >= 2 && ph <= 7) {
    staffHeld(crew, own, _b, _q2); // at his hip
    const toHeld = ph === 2 ? smooth(u, 0, 1) : ph === 7 ? 1 - smooth(u, 0, 1) : 1;
    _a.lerp(_b, toHeld); _q.slerp(_q2, toHeld);
    if (ph >= 4 && ph <= 6) {
      // in line with the bore, its head on the shell's base (state's staffA), or drawn out behind the breech
      const stroke = crew.half + 0.12 - crew.aRam0;
      const head = c.s === 'ram' && crew.staffA != null ? crew.staffA : crew.aRam0 - crew.half - stroke;
      crew.trayAt(head, _b);
      _q2.setFromEuler(_e.set(Math.asin(crew.u.y), crew.az, 0));
      const toLine = ph === 4 ? smooth(u, 0, 1) : ph === 6 ? 1 - smooth(u, 0, 1) : 1;
      _a.lerp(_b, toLine); _q.slerp(_q2, toLine);
      crew.staffGrip = toLine;
    }
  }
  st.position.copy(_a); st.quaternion.copy(_q); st.updateMatrix();
  crew.staffRest = ph <= 1 || ph === 8;
  crew.staffHold = ph === 1 ? smooth(u, 0.2, 1) : ph === 8 ? 1 - smooth(u, 0, 0.4) : ph >= 2 && ph <= 7 ? 1 : 0;
  crew.staffU = u;
}
const _q2 = new THREE.Quaternion();

// the rammer nearest the hooks
function staffOwnerOf(crew) {
  const rams = crew.men.filter((m) => m.beh === 'ram');
  if (rams.length < 2) return rams[0] ?? null;
  heroStaffRest(crew, _a, _q);
  _a.addScaledVector(_d.set(0, 0, 1).applyQuaternion(_q), crew.staffLen / 2);
  const h = { x: 0, y: 0, z: 0, h: 0 }, d = (m) => { m.home(h); return Math.hypot(h.x - _a.x, h.z - _a.z); };
  return rams.reduce((b, m) => (d(m) < d(b) ? m : b));
}

// the staff at its owner's right hip, along the bore (its head forward), where he holds it up for the ram
function staffHeld(crew, m, pos, quat) {
  const h = crew.tmp[7] ??= { x: 0, y: 0, z: 0, h: 0 };
  m.home(h);
  const sc = m.root.scale.x, rx = Math.cos(h.h), rz = -Math.sin(h.h);
  // (along the gun's axis at this traverse, from the head back)
  const bx = Math.sin(crew.az), bz = Math.cos(crew.az);
  pos.set(h.x + rx * 0.3 * sc - bx * 1.0, h.y + 1.02 * sc, h.z + rz * 0.3 * sc - bz * 1.0);
  quat.setFromUnitVectors(_e2.set(0, 0, 1), _d.set(bx, 0, bz));
}

// the rest transform in root space: the staff (its head at local z 0, the butt at z = staffLen) through the two hooks
function heroStaffRest(crew, pos, quat) {
  const rig = crew.rig, hk = rig.anchors?.staffHooks;
  if (hk && hk.length >= 2) {
    const inv = crew.invRoot();
    const p0 = hk[0].isObject3D ? hk[0].getWorldPosition(_b).applyMatrix4(inv) : rotT(crew, hk[0], _b);
    const p1 = hk[1].isObject3D ? hk[1].getWorldPosition(_c).applyMatrix4(inv) : rotT(crew, hk[1], _c);
    // the head a little past the front hook, the shaft along the hooks
    _d.copy(p1).sub(p0).normalize();
    pos.copy(p0).addScaledVector(_d, -0.25).y += 0.035;
    quat.setFromUnitVectors(_e2.set(0, 0, 1), _d);
    return;
  }
  // (no hooks on this rig: laid along the deck's right edge, where the HD rig has them)
  rotT(crew, [0.58, 1.135, 3.3], pos);
  _d.set(0, 0, 1);
  _d.set(_d.x * crew.ca + _d.z * crew.sa, _d.y, -_d.x * crew.sa + _d.z * crew.ca);
  quat.setFromUnitVectors(_e2.set(0, 0, 1), _d);
}
const _e2 = new THREE.Vector3();
// a point of the traverse frame (rest rig space) into root space at this traverse
function rotT(crew, p, out) {
  const dx = p[0] - crew.pvx, dz = p[2] - crew.pvz;
  return out.set(dx * crew.ca + dz * crew.sa + crew.pvx, p[1], -dx * crew.sa + dz * crew.ca + crew.pvz);
}

// ---------------------------------------------------------------- the staff's owner
const STAFF_SELF = new Set(['reach', 'lift', 'held', 'lower', 'free']);
// The owner while the staff is his alone (taking it up, holding it at his hip, laying it back); true when it posed him.
export function heroStaffMan(crew, m, c, h) {
  const ph = crew.staffPh;
  if (m !== crew.staffOwner || !STAFF_SELF.has(ph)) return false;
  const u = crew.staffU ?? 0;
  // how deep he goes for it: a knee bend to hooks at hip height, the full squat and a stoop to hooks at deck level
  heroStaffRest(crew, _a, _q);
  const low = clamp01((_a.y - h.y - 0.12) / 0.8), d0 = low; // (lift's t at the bottom: 0 the deepest squat)
  const stoop = 0.55 * (1 - clamp01(low / 0.4));
  let pose = 'stand', t = crew.idleT + m.seed, bend = 0;
  if (ph === 'reach') { pose = 'lift'; bend = smooth(u, 0, 0.8); }
  else if (ph === 'lift') { pose = 'lift'; bend = 1 - smooth(u, 0, 1); }
  else if (ph === 'lower') { pose = 'lift'; bend = smooth(u, 0, 1); }
  else if (ph === 'free') { pose = 'lift'; bend = 1 - smooth(u, 0.3, 1); }
  else if (ph === 'held') { pose = 'lift'; bend = 0; }
  if (pose === 'lift') t = 1 - (1 - d0) * bend;
  m.stoop = stoop * bend; // (the life layer's lean: crews_hero.js heroMods)
  m.put(h.x, h.y, h.z, h.h, pose, t);
  m.stoop = 0;
  const w = crew.staffHold ?? 0;
  if (w > 0.01) {
    // the staff's axis: its head at staff.position, along its local +Z; the right hand where his right hip projects
    // on it, the left half a metre nearer the head, in front of him
    const st = crew.staff, sc = m.root.scale.x;
    _a.copy(st.position); _d.set(0, 0, 1).applyQuaternion(st.quaternion);
    const rx = Math.cos(m.h), rz = -Math.sin(m.h);
    _b.set(m.x + rx * 0.22 * sc, m.y + 0.95 * sc, m.z + rz * 0.22 * sc);
    const s = clamp(_b.sub(_a).dot(_d), 0.3, crew.staffLen - 0.2);
    _b.copy(_a).addScaledVector(_d, s);
    _c.copy(_a).addScaledVector(_d, Math.max(0.15, s - 0.5));
    reachTo(m, 'R', _b.x, _b.y + 0.03, _b.z, w);
    reachTo(m, 'L', _c.x, _c.y + 0.03, _c.z, w);
    if (ph !== 'reach' && ph !== 'free') {
      m.carry = 'staff';
      // the staff through the hands as they are (the arm may fall short of a low hook): blended in over the first third
      // of the lift and out over the last of the lowering, so it rises out of the hooks in his grip
      const k = ph === 'lift' ? smooth(u, 0, 0.3) : ph === 'lower' ? 1 - smooth(u, 0.7, 1) : 1;
      if (k > 0.001) {
        m.root.updateMatrixWorld(true);
        const inv = crew.invRoot();
        m.fig.anchors.handR.getWorldPosition(_b).applyMatrix4(inv); m.fig.anchors.handL.getWorldPosition(_c).applyMatrix4(inv);
        _b.y -= 0.03; _c.y -= 0.03;
        _d.copy(_b).sub(_c);
        if (_d.lengthSq() > 0.01) {
          _d.normalize();
          _e2.copy(_b).addScaledVector(_d, -s); // (the head: the right hand holds it s metres from it)
          st.position.lerp(_e2, k);
          _q2.setFromUnitVectors(_c.set(0, 0, 1), _d);
          st.quaternion.slerp(_q2, k);
          st.updateMatrix();
        }
      }
    }
  }
  return true;
}

// Put the grip of hand `side` on a root-space point: GunCrew's Man.hand without its standing-height reach test (a man
// stooping to his work reaches low); the two-bone IK still clamps the arm. Recorded for crewcheck's hand audit.
const _hand = new THREE.Vector3(), _pole = new THREE.Vector3();
// pole: where the elbow points, in figure space (+X his right, +Y up, +Z behind him; given for the right arm, mirrored for
// the left), or null for the IK's own (out and down)
export function reachTo(m, side, x, y, z, w = 1, pole = null) {
  if (w <= 0.01 || m.crew.level < 2) return;
  const dx = x - m.x, dz = z - m.z, ch = Math.cos(m.h), sh = Math.sin(m.h), sc = 1 / m.root.scale.x;
  _hand.set((dx * ch - dz * sh) * sc, (y - m.y) * sc, (dx * sh + dz * ch) * sc);
  m.hw = w;
  if (pole) _pole.set(side === 'L' ? -pole.x : pole.x, pole.y, pole.z);
  m.fig.reach(side, _hand, Math.min(1, w), null, null, pole ? _pole : null);
  if (m._audit && w > 0.9) m._audit.hands[side] = [x, y, z];
}

// ---------------------------------------------------------------- routes
// A point s metres along route P (out: x, z) moved so the route's ends sit where they are now: P was searched when the
// man set off (GunCrew.plan keeps it while he walks it) and the gun may have traversed since, which carries its tray
// end (or, in the gun's frame, the stack end) away. The start's offset fades over the first two metres (at most half the
// route), the end's comes in over the last two.
export function heroLive(P, s, a, b, out) {
  const n = P.n;
  if (!(n >= 2)) return out;
  const L = P.len, ws = 1 - smooth(s, 0, Math.min(2, L * 0.5)), we = smooth(s, Math.max(0, L - Math.min(2, L * 0.5)), L);
  out.x += (a.x - P.x[0]) * ws + (b.x - P.x[n - 1]) * we;
  out.z += (a.z - P.z[0]) * ws + (b.z - P.z[n - 1]) * we;
  return out;
}

// ---------------------------------------------------------------- the block man
// At the block (GunCrew.blockMan's work window, `at` his place by it, `face` his heading to the handle's mid stroke):
// the right hand on the operating crank's knob (rig.knobs.crank, turning with the crank), the left on the block's edge,
// and he moves with the block's travel (it runs 0.5 m out to the gun's right as it opens and back as it shuts) in short
// steps, so the knob stays at the same reach from him instead of running out of it. True when it posed him.
export function heroBlockMan(crew, m, c, h, at, face, k) {
  const knob = crew.rig.knobs?.crank;
  if (!knob) return false;
  const kB = crew.rig.heroBreechK?.k ?? 0, travel = 0.5 * 0.85;
  const d = (kB - 0.5) * travel, x = at.x + crew.rt.x * d, z = at.z + crew.rt.z * d;
  // the step: along his facing (back as it comes to him) or across it, as his place lies to the block
  const fx = -Math.sin(face), fz = -Math.cos(face), rx = Math.cos(face), rz = -Math.sin(face);
  const along = crew.rt.x * fx + crew.rt.z * fz, across = crew.rt.x * rx + crew.rt.z * rz;
  const moving = c.s === 'open' ? k < 0.72 : c.s === 'close' ? k > 0.38 : false; // (stepping from the window's first frame)
  const crankT = Math.abs(crew.rig.gear?.crank?.rotation.x ?? 0) / (Math.PI * 2);
  if (moving && Math.abs(across) >= Math.abs(along)) m.put(x, h.y, z, face, 'sidestep', d * Math.sign(across) / 0.4);
  else if (moving) m.put(x, h.y, z, face, 'walk', d * Math.sign(along) / 1.25);
  else m.put(x, h.y, z, face, 'crank', crankT);
  const grip = smooth(k, 0, 0.08) * (1 - smooth(k, 0.94, 1));
  knob.getWorldPosition(_a).applyMatrix4(crew.invRoot());
  reachTo(m, 'R', _a.x, _a.y, _a.z, grip, _p.set(0.6, -0.8, 0.3));
  crew.grip.getWorldPosition(_b).applyMatrix4(crew.invRoot());
  reachTo(m, 'L', _b.x, _b.y - 0.06, _b.z, grip * 0.9, _p.set(0.6, -0.8, 0.3));
  m.carry = null;
  return true;
}

// ---------------------------------------------------------------- the lanyard
// The cord from the firer's fist to the firing lever's ring: one thin tube of SEG segments, its slack hanging in a
// parabola (taken up as he pulls it taut, straight when drawn), rebuilt in place every frame (no allocation).
const SEG = 10, RAD = 6;
export function heroRope(crew) {
  if (crew.heroRope) return crew.heroRope;
  const n = (SEG + 1) * RAD, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const idx = [];
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c2 = a + RAD, d = b + RAD;
    idx.push(a, c2, b, b, c2, d);
  }
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); // (rebuilt every frame: never culled by a stale box)
  const mesh = new THREE.Mesh(g, crew.rope.material);
  mesh.castShadow = true; mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'lanyard';
  crew.rig.root.add(mesh);
  crew.heroRope = mesh;
  (crew.extraProps ??= []).push(mesh);
  return mesh;
}
const _r0 = new THREE.Vector3(), _r1 = new THREE.Vector3(), _rt = new THREE.Vector3(), _rn = new THREE.Vector3(), _rb = new THREE.Vector3(), _rp = new THREE.Vector3(), _rd = new THREE.Vector3();
// a (the fist) to b (the lever), root space; slack: metres of cord beyond the straight span
export function ropeTo(mesh, a, b, slack, r = 0.011) {
  const P = mesh.geometry.attributes.position, N = mesh.geometry.attributes.normal, pa = P.array, na = N.array;
  _rd.subVectors(b, a); const span = Math.max(0.01, _rd.length()); _rd.divideScalar(span);
  // the sag: perpendicular to the cord, as far down as gravity can pull it (a parabola of the cord's extra length)
  const sag = Math.sqrt(Math.max(0, 3 * span * slack / 8));
  _rp.set(0, -1, 0).addScaledVector(_rd, _rd.y); const pl = _rp.length(); if (pl > 1e-4) _rp.divideScalar(pl); else _rp.set(1, 0, 0);
  const at = (t, out) => out.copy(a).addScaledVector(_rd, span * t).addScaledVector(_rp, sag * pl * 4 * t * (1 - t));
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    at(t, _r0); at(Math.min(1, t + 0.02), _r1); _rt.subVectors(_r1, _r0);
    if (t >= 0.98) { at(t - 0.02, _r1); _rt.subVectors(_r0, _r1); }
    _rt.normalize();
    _rn.set(0, 1, 0).cross(_rt); if (_rn.lengthSq() < 1e-6) _rn.set(1, 0, 0).cross(_rt); _rn.normalize();
    _rb.crossVectors(_rt, _rn);
    for (let j = 0; j < RAD; j++) {
      const th = (j / RAD) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), o = (i * RAD + j) * 3;
      const nx = _rn.x * cs + _rb.x * sn, ny = _rn.y * cs + _rb.y * sn, nz = _rn.z * cs + _rb.z * sn;
      pa[o] = _r0.x + nx * r; pa[o + 1] = _r0.y + ny * r; pa[o + 2] = _r0.z + nz * r;
      na[o] = nx; na[o + 1] = ny; na[o + 2] = nz;
    }
  }
  P.needsUpdate = true; N.needsUpdate = true;
}

// ---------------------------------------------------------------- the spent case (item 8)
// In a cycle after a shot the extractors throw the brass case out of the chamber at caseOut (open k 0.66): backward and
// a little up, tumbling end over end, onto the deck behind the top carriage at caseLand (one small bounce, a slide to
// rest). The second rammer steps forward early in the shell step, picks it up and tosses it off the deck's right side;
// ammo1 (who had nothing to do) fetches it from the ground and lays it on the pile of empties by the stack
// (rig.anchors.casePile), one case more for every round fired (at most PILE). All on the cycle clock: crew.caseProp,
// crew.caseT (seconds since it left the chamber, Infinity when there is none: for the effects' hot-case smoke),
// crew.caseFree (flying or lying, in nobody's hand), crew.casePh.
const CASE_L = 0.3, CASE_R = 0.116, PILE = 16;
export function heroCaseBuild(crew) {
  if (crew.caseProp !== undefined) return;
  const prof = [[0, 0], [0.125, 0], [0.125, 0.016], [0.116, 0.022], [0.116, CASE_L - 0.01], [0.112, CASE_L], [0.105, CASE_L], [0.109, 0.03], [0, 0.03]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18).translate(0, -CASE_L / 2, 0).rotateX(Math.PI / 2);
  // soot: darker toward the mouth (+Z half after the turn) and inside it
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 1 - 0.55 * smooth(pos.getZ(i), 0.02, CASE_L / 2) - (Math.hypot(pos.getX(i), pos.getY(i)) < 0.11 && pos.getZ(i) > -0.1 ? 0.35 : 0); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0.15, k); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ color: 0xb4935a, metalness: 0.8, roughness: 0.38, vertexColors: true });
  const prop = new THREE.Mesh(g, mat);
  prop.castShadow = true; prop.visible = false; prop.name = 'spent-case'; prop.rotation.order = 'YXZ';
  crew.rig.root.add(prop);
  const pile = new THREE.InstancedMesh(g, mat, PILE);
  pile.castShadow = true; pile.receiveShadow = true; pile.count = 0; pile.name = 'case-pile'; pile.frustumCulled = false;
  crew.rig.root.add(pile);
  crew.caseProp = prop; crew.casePile = pile; crew.caseShots = 0; crew.caseFired = null;
  (crew.extraProps ??= []).push(prop);
}

// the case's moments on the cycle clock (seconds): out, on the deck, picked up, tossed, on the ground, fetched, piled
function caseTimes(T, out) {
  out[0] = T.at('open', 0.66); out[1] = T.at('open', 0.9); out[2] = T.at('shell', 0.27); out[3] = T.at('shell', 0.33);
  out[4] = out[3] + 0.55; out[5] = T.at('shell', 0.62); out[6] = T.at('ram', 0.75);
  return out;
}
const CT = new Float64Array(7), _cq = new THREE.Quaternion(), _cv = new THREE.Vector3(), _cw = new THREE.Vector3();
// where it lies on the deck (traverse frame): behind the top carriage's rear, a little right of the bore
const DECK_AT = [0.18, 1.1 + CASE_R, 3.42], GROUND_AT = [1.78, CASE_R, 3.55];
// the pile of empties (root space, on the ground): north of the shell stack by ammo1's place. The HD rig's casePile
// anchor (3.4, 0, 5.9) lies on the cartridge man's way from his crates to the breech; asked of track G to move it.
const PILE_AT = [4.1, 0, 2.75];

export function heroCase(crew, c) {
  heroCaseBuild(crew);
  const prop = crew.caseProp, p = c.p, T = crew.tl, now = T?.now;
  // the rounds fired since the gun was set up: one more case for the pile each (state: the shots seen)
  if (!(p.firedAt > -900)) { crew.caseShots = 0; crew.caseFired = null; }
  else if (p.firedAt !== crew.caseFired) { crew.caseFired = p.firedAt; crew.caseShots++; }
  crew.caseT = Infinity; crew.caseFree = false; crew.casePh = null; prop.visible = false;
  let inPile = Math.max(0, crew.caseShots - 1); // (the newest case is on its way unless it is piled already)
  const live = T && Number.isFinite(now) && p.firedAt > -900 && crew.level > 0;
  if (live) {
    const t = caseTimes(T, CT);
    const set = crew.ammo && Number.isFinite(crew.caseSet) ? crew.caseSet : t[6];
    if (now >= set) inPile++;
    else if (now >= t[0]) {
      crew.caseT = now - t[0];
      heroCasePlace(crew, c, now, t);
      prop.visible = crew.level > 0;
    }
  } else if (Number.isFinite(now) || now === Infinity) inPile = crew.caseShots; // (after the cycle: all piled)
  pileCases(crew, Math.min(PILE, inPile));
}

function heroCasePlace(crew, c, now, t) {
  const prop = crew.caseProp, inv = crew.invRoot();
  rotT(crew, DECK_AT, _cv); // on the deck
  if (now < t[1]) {
    // flying: from the chamber (rig.anchors.chamber, else the breech face) backward along the bore and up, tumbling
    const ch = crew.rig.anchors.chamber;
    if (ch) ch.getWorldPosition(_cw).applyMatrix4(inv); else _cw.copy(crew.B);
    _cw.addScaledVector(crew.u, -0.12);
    const u = (now - t[0]) / Math.max(0.05, t[1] - t[0]), tt = now - t[0], T = t[1] - t[0];
    // a ballistic arc ending on the deck spot: vy from the drop and the flight time
    const vy = (_cv.y - _cw.y + 4.9 * T * T) / T;
    prop.position.set(lerp(_cw.x, _cv.x, u), _cw.y + vy * tt - 4.9 * tt * tt, lerp(_cw.z, _cv.z, u));
    prop.rotation.set(-tt * 9, crew.az, 0);
    crew.caseFree = true; crew.casePh = 'fly';
  } else if (now < t[2]) {
    // the bounce and the slide to rest, then lying
    const tt = now - t[1], b = tt < 0.22 ? 0.06 * Math.sin(Math.PI * tt / 0.22) : 0, sl = 0.12 * smooth(tt, 0, 0.45);
    prop.position.set(_cv.x + crew.bd.x * -sl, _cv.y + b, _cv.z + crew.bd.z * -sl);
    prop.rotation.set(Math.PI / 2 * smooth(tt, 0, 0.3) - 0.2, crew.az + 0.5 * smooth(tt, 0, 0.45), 0);
    prop.rotation.x = Math.PI / 2 * 0 + (1 - smooth(tt, 0, 0.3)) * -2.4;
    crew.caseFree = true; crew.casePh = 'deck';
  } else if (now < t[3]) {
    // in the rammer's hands (heroCaseMan puts it there)
    crew.casePh = 'rammer';
  } else if (now < t[4]) {
    // tossed off the deck's right side
    const R = crew.caseToss ?? _cv, tt = (now - t[3]) / (t[4] - t[3]);
    rotT(crew, GROUND_AT, _cw);
    const T = t[4] - t[3], vy = (_cw.y - R.y + 4.9 * T * T) / T, s = now - t[3];
    prop.position.set(lerp(R.x, _cw.x, tt), R.y + vy * s - 4.9 * s * s, lerp(R.z, _cw.z, tt));
    prop.rotation.set(-s * 7, crew.az + 1.2, 0);
    crew.caseFree = true; crew.casePh = 'toss';
  } else if (now < t[5]) {
    rotT(crew, GROUND_AT, _cw);
    prop.position.copy(_cw); prop.rotation.set(0, crew.az + 1.2 + 0.3, 0);
    crew.caseFree = true; crew.casePh = 'ground';
  } else crew.casePh = 'ammo'; // (in ammo1's hands: heroCaseMan)
  prop.updateMatrix();
}

const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3(1, 1, 1), _pp = new THREE.Vector3(), _pe = new THREE.Euler();
function pileCases(crew, n) {
  const pile = crew.casePile, a = crew.rig.anchors.casePile;
  if (!pile) return;
  if (crew.ammo) { rowCases(crew, n); return; }
  pile.visible = crew.level > 0 && n > 0 && !!a;
  if (!pile.visible || pile.count === n) return;
  const bx = PILE_AT[0], bz = PILE_AT[2];
  for (let i = 0; i < n; i++) {
    // lying in a loose heap, the later ones on the earlier (seeded per index, so the pile repeats)
    const ang = hash1(i * 7.3) * Math.PI, rr = 0.12 + 0.28 * (hash1(i * 3.1 + 1) * 0.5 + 0.5), layer = i < 9 ? 0 : 1;
    _pp.set(bx + Math.cos(i * 2.39996) * rr, CASE_R + layer * CASE_R * 1.6, bz + Math.sin(i * 2.39996) * rr);
    _pq.setFromEuler(_pe.set(0, ang, hash1(i * 5.7) * 0.15));
    pile.setMatrixAt(i, _pm.compose(_pp, _pq, _ps));
  }
  pile.count = n;
  pile.instanceMatrix.needsUpdate = true;
}

// (the hero ammunition, render/crews_ammo.js) The empties stand on their heads in rows by ammo1's post
// (ready.caseSpot), each turned a little; the twelfth place takes every case after it
function rowCases(crew, n) {
  const row = crew.casePile, R = crew.ammo.ready;
  n = Math.min(n, R.caseSlots);
  row.visible = crew.level > 0 && n > 0;
  if (row.count === n) return;
  for (let i = 0; i < n; i++) {
    R.caseSpot(i, _pp);
    _pp.x += hash1(i * 4.3 + 2) * 0.012; _pp.z += hash1(i * 6.1 + 5) * 0.012;
    _pq.setFromEuler(_pe.set(Math.PI / 2 + hash1(i * 2.7) * 0.02, hash1(i * 9.1) * Math.PI, 0, 'YXZ'));
    row.setMatrixAt(i, _pm.compose(_pp, _pq, _ps));
  }
  row.count = n;
  row.instanceMatrix.needsUpdate = true;
}

// The men who handle the case: the second rammer (deck: step up, stoop, pick it up, toss it over the side, step back)
// and ammo1 (ground: walk to it, pick it up, carry it to the pile, lay it down, walk back). True when it posed him.
export function heroCaseMan(crew, m, c, h) {
  const T = crew.tl, now = T?.now, p = c.p;
  if (!T || !Number.isFinite(now) || !(p.firedAt > -900)) return false;
  const t = caseTimes(T, CT);
  if (m.role === 'rammer2') {
    const w0 = t[1] + 0.05, w1 = t[2] - 0.75, w3 = t[3] + 3.0;
    if (now < w0 || now > w3) return false;
    rotT(crew, DECK_AT, _cv);
    // his place by the case: behind it and to its right, facing it
    const sx = _cv.x + crew.rt.x * 0.32 - crew.bd.x * 0.42, sz = _cv.z + crew.rt.z * 0.32 - crew.bd.z * 0.42;
    const face = headingOf(_cv.x - sx, _cv.z - sz), toss = headingOf(crew.rt.x, crew.rt.z);
    const d = Math.hypot(sx - h.x, sz - h.z), way = headingOf(sx - h.x, sz - h.z), wayB = headingOf(h.x - sx, h.z - sz);
    if (now < w1) { walkLeg(m, h.x, h.z, h.h, sx, sz, face, way, d, now - w0, w1 - w0, h.y); return true; }
    if (now < t[3]) {
      // stoop, take it in both hands, come up with it
      const u = (now - w1) / (t[3] - w1), bend = smooth(u, 0, 0.35) * (1 - smooth(u, 0.55, 0.9));
      const hh = face + clamp(wrapPi(toss - face), -0.9, 0.9) * smooth(u, 0.55, 1); // (a half turn to throw it over the side)
      m.stoop = 0.45 * bend;
      m.put(sx, h.y, sz, hh, 'lift', 1 - 0.85 * bend);
      m.stoop = 0;
      const prop = crew.caseProp;
      if (u > 0.3) {
        m.root.updateMatrixWorld(true);
        m.fig.anchors.handR.getWorldPosition(_a).applyMatrix4(crew.invRoot()); m.fig.anchors.handL.getWorldPosition(_b).applyMatrix4(crew.invRoot());
        const k = smooth(u, 0.3, 0.45);
        prop.position.copy(_cv).lerp(_c.copy(_a).add(_b).multiplyScalar(0.5), k);
        prop.rotation.set(0, hh + Math.PI / 2, 0); prop.updateMatrix();
        (crew.caseToss ??= new THREE.Vector3()).copy(prop.position);
        m.carry = 'case';
      }
      // hands on the case's two ends as it lies, then holding it
      const ex = Math.cos(hh) * 0.13, ez = -Math.sin(hh) * 0.13, P = u > 0.3 ? prop.position : _cv;
      reachTo(m, 'R', P.x + ex, P.y + 0.03, P.z + ez, smooth(u, 0.15, 0.32), _p.set(0.6, -0.7, 0.2));
      reachTo(m, 'L', P.x - ex, P.y + 0.03, P.z - ez, smooth(u, 0.15, 0.32), _p.set(0.6, -0.7, 0.2));
      return true;
    }
    // the toss done, back to his post
    walkLeg(m, sx, sz, face + clamp(wrapPi(toss - face), -0.9, 0.9), h.x, h.z, h.h, wayB, d, now - t[3] - 0.25, w3 - t[3] - 0.25, h.y);
    return true;
  }
  if (m.role === 'ammo1') {
    if (!crew.rig.anchors.casePile && !crew.ammo) return false;
    crew.caseSet = NaN;
    rotT(crew, GROUND_AT, _cv);
    // the hero ammunition (render/crews_ammo.js): the case's place in the rows of empties (the next free one), stood there
    // from the south side of the rows, facing north; else the heap
    const R = crew.ammo?.ready, slot = R ? Math.min(R.caseSlots - 1, Math.max(0, (crew.caseShots ?? 1) - 1)) : 0;
    if (R) R.caseSpot(slot, _cw); else _cw.set(PILE_AT[0], 0, PILE_AT[2]);
    // where he stands to pick it up and at the pile (each on its side away from the gun), routed round the steel and the
    // others' places by the crew field (GunCrew.plan: kept while he walks a leg)
    const rowS = R ? R.caseSpot(R.caseSlots - 1, _cx).z + 0.45 : 0;
    const fx = _cv.x + 0.42, fz = _cv.z + 0.18, px = R ? _cw.x : _cw.x + 0.45, pz = R ? rowS : _cw.z + 0.4, l = crew.l0;
    const P1 = crew.plan(m, 'c1', l, h.x, h.z, fx, fz, 0.3), P2 = crew.plan(m, 'c2', l, fx, fz, px, pz, 0.3), P3 = crew.plan(m, 'c3', l, px, pz, h.x, h.z, 0.3);
    const fCase = headingOf(_cv.x - fx, _cv.z - fz), fPile = headingOf(_cw.x - px, _cw.z - pz);
    // the legs at their own pace, made to fit before the cycle ends (else he was still walking when the gun came ready
    // and stood home at once); short of a fifth of that, no fetch this cycle
    const a0 = t[4] + 0.6;
    let W1 = P1.len / 1.15 + crew.pairTurns(P1, h.h, fCase, 3.0) + 0.2, PK = 1.3, W2 = P2.len / 1.0 + crew.pairTurns(P2, fCase, fPile, 3.0) + 0.2, LY = 1.1;
    let W3 = P3.len / 1.15 + crew.pairTurns(P3, fPile, h.h, 3.0) + 0.2;
    const need = W1 + PK + W2 + LY + W3, room = T.end - 0.5 - a0;
    if (need > room) {
      const f = room / need;
      if (f < 0.8) return false;
      W1 *= f; PK *= f; W2 *= f; LY *= f; W3 *= f;
    }
    const w1 = a0 + W1, pk = w1 + PK, w2 = pk + W2, ly = w2 + LY, w3 = ly + W3;
    // (the case joins its row as his hands leave it: crews.js heroCase counts it from then, foley hears it stood)
    if (R) { crew.caseSet = w2 + 0.85 * LY; if (crew.cueS) crew.cueS.caseStand = c.now - now + w2 + 0.8 * LY; }
    for (const [tag, on] of [['c1', now >= a0 && now < w1], ['c2', now >= pk && now < w2], ['c3', now >= ly && now < w3]]) if (m.plans[tag]) m.plans[tag].lock = on;
    if (now < a0 || now > w3) return false;
    const prop = crew.caseProp, A = crew.tmp[8] ??= { x: 0, z: 0, h: 0, s: 0, dist: 0, moving: false };
    const leg = (P, u, W, hs, he, gait) => {
      crew.pairAlong(P, u, W, hs, he, A, 0.12, 3.0);
      if (A.moving && Number.isFinite(A.turn) && A.turnAll > 0.1) m.put(A.x, h.y, A.z, A.h, 'pivot', A.turn / 0.6);
      else m.put(A.x, h.y, A.z, A.h, A.moving ? gait : 'stand', A.moving ? A.dist / (gait === 'carryWalk' ? 0.9 : 1.25) : crew.idleT + m.seed);
    };
    if (now < w1) { leg(P1, (now - a0) / W1, W1, h.h, fCase, 'walk'); return true; }
    if (now < pk) {
      // stoop for it, up with it
      const u = (now - w1) / (pk - w1), bend = smooth(u, 0, 0.4) * (1 - smooth(u, 0.6, 1));
      m.stoop = 0.4 * bend; m.put(fx, h.y, fz, fCase, 'lift', 1 - 0.9 * bend); m.stoop = 0;
      heroHoldCase(crew, m, prop, u > 0.45 ? 1 : 0, _cv, smooth(u, 0.2, 0.4));
      return true;
    }
    if (now < w2) { leg(P2, (now - pk) / W2, W2, fCase, fPile, 'carryWalk'); heroHoldCase(crew, m, prop, 1, null, 1); return true; }
    if (now < ly) {
      const u = (now - w2) / (ly - w2), bend = smooth(u, 0, 0.5);
      m.stoop = 0.35 * bend; m.put(px, h.y, pz, fPile, 'lift', 1 - 0.85 * bend); m.stoop = 0;
      if (R && u < 0.85) heroStandCase(crew, m, prop, _cw, smooth(u, 0.15, 0.8), 1 - smooth(u, 0.7, 0.85));
      else if (u < 0.85) heroHoldCase(crew, m, prop, 1, null, 1 - smooth(u, 0.6, 0.85)); else prop.visible = false;
      return true;
    }
    leg(P3, (now - ly) / W3, W3, fPile, h.h, 'walk');
    return true;
  }
  return false;
}

// (the hero ammunition) The case turned from across his arms to standing on its head and lowered onto its place in the
// row (k 0..1), his hands on it either side (w)
const _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _se = new THREE.Euler(0, 0, 0, 'YXZ');
function heroStandCase(crew, m, prop, spot, k, w) {
  m.root.updateMatrixWorld(true);
  const inv = crew.invRoot();
  m.fig.anchors.handR.getWorldPosition(_a).applyMatrix4(inv); m.fig.anchors.handL.getWorldPosition(_b).applyMatrix4(inv);
  _c.copy(_a).add(_b).multiplyScalar(0.5); _c.y -= 0.02;
  _sq.setFromEuler(_se.set(0, m.h + Math.PI / 2, 0));
  _sq2.setFromEuler(_se.set(Math.PI / 2, m.h, 0)); // (mouth up)
  prop.quaternion.copy(_sq).slerp(_sq2, smooth(k, 0, 0.6));
  prop.position.copy(_c).lerp(spot, smooth(k, 0.3, 1));
  prop.updateMatrix(); prop.visible = crew.level > 0;
  m.carry = 'case';
  // the hands either side of it, a little below its top
  const ex = Math.cos(m.h) * 0.13, ez = -Math.sin(m.h) * 0.13, P = prop.position, up = 0.12 * smooth(k, 0.3, 1);
  reachTo(m, 'R', P.x + ex, P.y + 0.03 + up, P.z + ez, w, _p.set(0.6, -0.7, 0.2));
  reachTo(m, 'L', P.x - ex, P.y + 0.03 + up, P.z - ez, w, _p.set(0.6, -0.7, 0.2));
}
const _cx = new THREE.Vector3();

// the case in a man's two hands (k 1: carried, drawn where his hands are; ground: the case's resting point to come from)
function heroHoldCase(crew, m, prop, k, ground, w) {
  m.root.updateMatrixWorld(true);
  const inv = crew.invRoot();
  if (k > 0) {
    m.fig.anchors.handR.getWorldPosition(_a).applyMatrix4(inv); m.fig.anchors.handL.getWorldPosition(_b).applyMatrix4(inv);
    prop.position.copy(_a).add(_b).multiplyScalar(0.5); prop.position.y -= 0.02;
    prop.rotation.set(0, m.h + Math.PI / 2, 0); prop.updateMatrix(); prop.visible = crew.level > 0;
    m.carry = 'case';
  }
  const P = k > 0 ? prop.position : ground, ex = Math.cos(m.h) * 0.13, ez = -Math.sin(m.h) * 0.13;
  if (!P) return;
  reachTo(m, 'R', P.x + ex, P.y + 0.03, P.z + ez, w, _p.set(0.6, -0.7, 0.2));
  reachTo(m, 'L', P.x - ex, P.y + 0.03, P.z - ez, w, _p.set(0.6, -0.7, 0.2));
}

// a straight walk from (ax, az) facing ha to (bx, bz) facing hb, `way` the heading on the way: turned on the spot at
// either end (at 3 rad/s) and walked between at an even pace eased over the first and last steps; t seconds into a W s window
function walkLeg(m, ax, az, ha, bx, bz, hb, way, d, t, W, y, gait = 'walk') {
  t = clamp(t, 0, W);
  const a0 = d > 0.05 ? Math.abs(wrapPi(way - ha)) / 3 : Math.abs(wrapPi(hb - ha)) / 3, a1 = d > 0.05 ? Math.abs(wrapPi(hb - way)) / 3 : 0;
  // (short of time the turns give way first, never the walk below a brisk 1.3 m/s)
  const tw = Math.min(W, Math.max(d / 1.3, W - a0 - a1)), f = Math.min(1, (W - tw) / Math.max(0.01, a0 + a1)), A0 = a0 * f, A1 = a1 * f;
  let hh, s = 0;
  if (t < A0) hh = d > 0.05 ? ha + wrapPi(way - ha) * smooth(t, 0, A0) : ha + wrapPi(hb - ha) * smooth(t, 0, A0);
  else if (t > W - A1) { s = 1; hh = way + wrapPi(hb - way) * smooth(t, W - A1, W); }
  else { const u = (t - A0) / tw, e = 0.16, v = 1 / (1 - e); s = u < e ? v * u * u / (2 * e) : u > 1 - e ? 1 - v * (1 - u) ** 2 / (2 * e) : v * (u - e / 2); hh = d > 0.05 ? way : hb; }
  const moving = d > 0.05 && s > 0 && s < 1, turning = !moving && ((t > 0 && t < A0) || (t > W - A1 && t < W));
  m.put(lerp(ax, bx, s), y, lerp(az, bz, s), hh, moving ? gait : turning ? 'pivot' : 'stand', moving ? d * s / (gait === 'carryWalk' ? 0.9 : 1.25) : turning ? wrapPi(hh - ha) / 0.6 : m.crew.idleT + m.seed);
}

// ---------------------------------------------------------------- the ram (item 10)
// The shell's travel up the tray and into the chamber over the ram step, 0..1 of the stroke, in four beats: the staff
// set against its base (0 to 0.18, nothing moves), the run (to 0.55: two men driving 113 kg, building up to about a metre
// a second), the dead stop where the driving band meets the forcing cone 8 cm short, one hard shove that seats it (0.56
// to 0.62: herocues shellSeat at 0.6), held there while the staff comes out.
export function heroRamK(k) {
  if (k <= 0.18) return 0;
  if (k < 0.55) { const u = (k - 0.18) / 0.37; return 0.92 * (u < 0.4 ? u * u / 0.8 : 0.2 + (u - 0.4)) / 0.8; }
  if (k < 0.56) return 0.92;
  return 0.92 + 0.08 * smooth(k, 0.56, 0.62);
}
// the rammers' effort (ramLoad's t): leaning into the run, braced at the stop, the shove, eased off as the staff comes out
export function heroRamEffort(k, ramK) {
  if (k < 0.55) return 0.8 * ramK;
  if (k < 0.62) return 0.74 + 0.26 * smooth(k, 0.555, 0.6);
  return 1 - smooth(k, 0.62, 0.9);
}

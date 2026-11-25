import * as THREE from 'three';
import { clamp } from './math.js';

// The body's limits on the lifelike crewman's arms (the port of the Godot game's PoseLimits.cs): the last word on the
// animator's pose before it is shown, so that a pose a body cannot take does not reach the screen. The clip layer makes
// such poses in three ways: a clip that folds an arm flat or bends a wrist back on itself (ears, lanyard), the solver's
// hand rotation put on the clip's forearm, and an elbow left on the wrong side of a reach. Each arm is measured as the
// Godot crew audit measures it (from the places of shoulder, elbow and wrist in the chest's frame, the hand on the
// forearm, capsules against the trunk and the other arm). An arm inside the limits is not touched. One outside is solved
// again from its palm (the grip point): the elbow swings about the line from shoulder to wrist, the hand turns about its
// grip point, and last the grip leaves its place, weighed against each other; the least correction that brings every
// measure inside is found by a few damped least-squares steps from the correction held on the frame before, which it
// costs to leave, so the correction follows the motion and does not flip between two answers. What the search has not
// reached is then clamped joint by joint from the shoulder out. Not the legs, the spine or the neck.
// The C# works on value structs; here every vector and rotation is a scratch object made once, so nothing is
// allocated per frame.

const DEG = Math.PI / 180;
// what an arm may do: a little inside the audit's maxima (degrees; the two capsule depths in centimetres)
const ElbowFlex = 147, ElbowAxis = 41, ShoulderBehind = 57, ShoulderAcrossBack = 27, ShoulderAcrossFront = 52,
  ShoulderRotation = 97, ForearmPronation = 97, WristBend = 82, SelfArm = 2.5, SelfArms = 2.5;
// the audit's capsules: radii of trunk, hips, head, upper arm, forearm and hand, the hand's length, the head's centre
const RTrunk = 0.115, RHips = 0.10, RHead = 0.10, RUpper = 0.05, RFore = 0.04, RHand = 0.04, HandLen = 0.1, HeadUp = 0.09;
// the search aims this far inside the limits; a metre of capsule depth weighs as this many radians over a limit
const Aim = 1.5 * DEG, AimDepth = 0.005, PerMetre = 6;
// a correction beyond these is none: it costs as much as a limit broken
const FarLeave = 0.10, FarTurn = 100 * DEG;
// what a correction costs: the swivel and the hand's turn per radian, the grip's leaving per metre
const CostSwivel = 0.004, CostTurn = 0.012, CostLeave = 0.25;
const Settle = 0.2, DepthRate = 0.6;
const RateSwivel = 360 * DEG, RateTurn = 240 * DEG, RateLeave = 0.5;
const StepSwivel = 25 * DEG, StepTurn = 20 * DEG, StepLeave = 0.03;
const JumpRate = 900 * DEG;
const Bent = 25 * DEG, BentFrom = 15 * DEG;
const NX = 7, NC = 14, NR = NC + 2 * NX;
// the upper arm's roll off the hinge that an arm the hand IK has posed anew may keep (degrees)
export const POSED_ROLL = 20;

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const ZERO = new Float64Array(NX);

// ---------------------------------------------------------------- small maths (into the given outputs)
function unitV(v) { const l = v.length(); return l < 1e-12 ? v.set(0, 1, 0) : v.divideScalar(l); }
function unitQ(q) {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return l < 1e-12 ? q.set(0, 0, 0, 1) : q.set(q.x / l, q.y / l, q.z / l, q.w / l);
}
// v made square to the unit vector n, unit (any square direction when v lies along n)
function square(v, n, out) {
  const d = v.x * n.x + v.y * n.y + v.z * n.z;
  let px = v.x - n.x * d, py = v.y - n.y * d, pz = v.z - n.z * d, l = Math.sqrt(px * px + py * py + pz * pz);
  if (l > 1e-9) return out.set(px / l, py / l, pz / l);
  px = Math.abs(n.x) < 0.8 ? 1 : 0; py = 1 - px; pz = 0;
  const e = px * n.x + py * n.y;
  px -= n.x * e; py -= n.y * e; pz -= n.z * e;
  l = Math.sqrt(px * px + py * py + pz * pz);
  return l < 1e-12 ? out.set(0, 1, 0) : out.set(px / l, py / l, pz / l);
}
// the shortest turn that takes the unit vector a to b
const _sq = V();
function arcQ(a, b, out) {
  const w = 1 + a.dot(b);
  if (w < 1e-9) { square(_sq.set(Math.abs(a.x) < 0.8 ? 1 : 0, Math.abs(a.x) < 0.8 ? 0 : 1, 0), a, _sq); return out.set(_sq.x, _sq.y, _sq.z, 0); }
  return unitQ(out.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x, w));
}
// v turned by the shortest turn that takes the unit vector a to b
function arcV(a, b, v, out) {
  const d = 1 + a.dot(b);
  if (d < 1e-9) return out.copy(v).negate();
  const sx = a.x + b.x, sy = a.y + b.y, sz = a.z + b.z, k = (sx * v.x + sy * v.y + sz * v.z) / d, m = 2 * a.dot(v);
  return out.set(v.x - sx * k + b.x * m, v.y - sy * k + b.y * m, v.z - sz * k + b.z * m);
}
// the frame with these X and Y axes (unit, square to each other)
function basisQ(x, y, out) {
  const zx = x.y * y.z - x.z * y.y, zy = x.z * y.x - x.x * y.z, zz = x.x * y.y - x.y * y.x;
  const m11 = x.x, m21 = x.y, m31 = x.z, m12 = y.x, m22 = y.y, m32 = y.z, m13 = zx, m23 = zy, m33 = zz, tr = m11 + m22 + m33;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); out.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s); }
  else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); out.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s); }
  else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); out.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s); }
  else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); out.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s); }
  return unitQ(out);
}
// a rotation vector: its direction the axis, its length the angle
function expQ(x, y, z, out) {
  const a = Math.sqrt(x * x + y * y + z * z), s = a < 1e-8 ? 0.5 : Math.sin(a / 2) / a;
  return out.set(x * s, y * s, z * s, Math.cos(a / 2));
}
// its turn about Y (the bone's length), the swing left out: -pi to pi
const twistY = (q) => (q.w < 0 ? 2 * Math.atan2(-q.y, -q.w) : 2 * Math.atan2(q.y, q.w));
const angleQ = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));
const acosC = (x) => Math.acos(clamp(x, -1, 1));

// The hinge an elbow bends about: square to upper arm and forearm; for an arm all but straight, where that says
// nothing, the upper arm bone's own (hb, square to u). (the bone's own up to 8 degrees of bend, the arm's from 22)
function hinge(u, f, hb, out) {
  const cx = u.y * f.z - u.z * f.y, cy = u.z * f.x - u.x * f.z, cz = u.x * f.y - u.y * f.x, s = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const w = clamp((s - 0.139) / (0.375 - 0.139), 0, 1);
  if (w <= 0) return out.copy(hb);
  const hx = (cx * w) / s + hb.x * (1 - w), hy = (cy * w) / s + hb.y * (1 - w), hz = (cz * w) / s + hb.z * (1 - w), l = Math.sqrt(hx * hx + hy * hy + hz * hz);
  return l > 1e-9 ? out.set(hx / l, hy / l, hz / l) : out.copy(hb);
}
// the roll about its length an upper arm may have against the hinge (rad): max degrees at a bent elbow, any while straight
function rollMax(flex, max) {
  const k = clamp((flex - 12 * DEG) / (Bent - DEG - 12 * DEG), 0, 1);
  return (180 + (max - 180) * k) * DEG;
}
// the distance between two segments (the audit's)
function segDist(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z, d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) return Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const x = rx + d1x * s - d2x * t, y = ry + d1y * s - d2y * t, z = rz + d1z * s - d2z * t;
  return Math.sqrt(x * x + y * y + z * z);
}

// Upper arm and forearm turned from where they pointed (u0, f0) to where they shall point (u1, f1), so that the elbow
// goes on bending about the bones' own hinge (their X) however the arm is swung round. The upper arm goes the shortest
// way and is then rolled about its length until its hinge is within max degrees of the one the new arm bends about.
// The forearm takes the new hinge, with the roll about its length it had against the old one (an arm that came all
// but folded flat has no hinge to tell that by, and its forearm takes the new hinge as it is). gu, gf: out.
const _ca = V(), _cb = V(), _ch0 = V(), _ch1 = V(), _cx = V(), _cy = V(), _cq = Q(), Y = new THREE.Vector3(0, 1, 0);
export function carry(u0, f0, gua, gfa, u1, f1, max, gu, gf) {
  arcQ(u0, u1, gu).multiply(gua);
  square(_ca.set(1, 0, 0).applyQuaternion(gu), u1, _ca); // hb
  hinge(u1, f1, _ca, _ch1);
  _cb.crossVectors(_ch1, u1).negate(); // h1 x -u1
  const roll = Math.atan2(-_ca.dot(_cb), _ca.dot(_ch1));
  const most = rollMax(acosC(u1.dot(f1)), max);
  const turn = clamp(roll, -most, most) - roll;
  if (turn !== 0) gu.premultiply(_cq.setFromAxisAngle(_cb.copy(u1).negate(), turn));
  unitQ(gu);
  square(_ca.set(1, 0, 0).applyQuaternion(gua), u0, _ca);
  hinge(u0, f0, _ca, _ch0);
  const keep = clamp((165 * DEG - acosC(u0.dot(f0))) / (15 * DEG), 0, 1);
  let was = 0;
  if (keep > 0) { basisQ(square(_ch0, f0, _cx), _cy.copy(f0).negate(), _cq); was = twistY(_cq.invert().multiply(gfa)) * keep; }
  basisQ(square(_ch1, f1, _cx), _cy.copy(f1).negate(), gf);
  if (was !== 0) gf.multiply(_cq.setFromAxisAngle(Y, was));
  unitQ(gf);
}

function acrossMax(z) {
  const k = clamp((z - 0.10) / 0.07, 0, 1);
  return (ShoulderAcrossFront + (ShoulderAcrossBack - ShoulderAcrossFront) * k) * DEG;
}
// where the forearm of an arm hanging with the elbow bent forwards points once the upper arm has swung the shortest
// way to u (the chest's frame): the zero of the upper arm's turn about its length
function forward(u, out) {
  const k = 1 / (1 - u.y);
  return out.set(u.x * u.z * k, -u.z, u.z * u.z * k - 1);
}

export class PoseLimits {
  constructor(sk) {
    this.sk = sk;
    this.enabled = true;
    this.neck = sk.solver[3]; this.headB = sk.solver[4]; this.thighL = sk.solver[11]; this.thighR = sk.solver[14];
    // the bones whose places the pass reads, parents first
    const need = new Uint8Array(sk.count);
    for (const b of [this.headB, this.thighL, this.thighR, sk.hand[0], sk.hand[1]])
      for (let p = b; p >= 0 && !need[p]; p = sk.parent[p]) need[p] = 1;
    this.walkList = Int32Array.from([...sk.order].filter((b) => need[b]));
    this.held = [new Float64Array(NX), new Float64Array(NX)];
    this.on = [false, false];
    this.wasU = [V(), V()]; this.wasF = [V(), V()]; this.wasH = [Q(), Q()]; this.was = [false, false];
    this.deepArm = [0, 0]; this.deepArms = [0, 0];
    this.settled = [-1, -1];
    this.maxArm = 0; this.maxArms = 0;
    this.turned = 0; this.maxSwivel = 0; this.maxTurn = 0; this.maxLeave = 0; this.hold = 0; this.dear = 1;
    this.xs = new Float64Array(NX); this.xt = new Float64Array(NX); this.x0 = new Float64Array(NX); this.dx = new Float64Array(NX);
    this.res = new Float64Array(NR); this.res1 = new Float64Array(NR);
    this.jac = new Float64Array(NR * NX); this.mat = new Float64Array(NX * NX); this.rhs = new Float64Array(NX); this.chol = new Float64Array(NX * NX);
    // the arm in hand (load) and as a correction leaves it (arm), then what it measures (measure)
    this.side = 1; this.l1 = 0; this.l2 = 0; this.eps0 = 0; this.bent0 = 0;
    this.S = V(); this.Gp = V(); this.grip = V(); this.e0 = V(); this.u0 = V(); this.f0 = V(); this.hb0 = V(); this.poleBone = V();
    this.hipsP = V(); this.neckP = V(); this.thL = V(); this.thR = V(); this.headC = V(); this.oS = V(); this.oE = V(); this.oW = V();
    this.C = Q(); this.Ci = Q(); this.H0 = Q(); this.gua = Q(); this.gfa = Q();
    this.E = V(); this.W = V(); this.u = V(); this.f = V(); this.H = Q();
    this.mFlex = 0; this.mBehind = 0; this.mAcross = 0; this.mAcrossMax = 0; this.mRot = 0; this.mPron = 0; this.mBend = 0;
    this.mArm = 0; this.mArms = 0; this.mHead = 0; this.mReach = 0; this.wBent = 0; this.wRot = 0; this.upY = 0;
    // scratch
    this.t1 = V(); this.t2 = V(); this.t3 = V(); this.t4 = V(); this.t5 = V(); this.t6 = V(); this.t7 = V();
    this.q1 = Q(); this.q2 = Q(); this.q3 = Q(); this.gu = Q(); this.gf = Q();
  }

  // the correction is dropped: the next frame starts anew (far away, where the hands are left alone)
  rest() {
    if (!this.on[0] && !this.on[1]) return;
    for (let i = 0; i < 2; i++) { this.on[i] = this.was[i] = false; this.settled[i] = -1; this.held[i].fill(0); }
  }

  // One frame, after the hand IK and before the forearm twist: both arms of the pose brought inside the limits. G and
  // P are the pose walked, kept right for the bones it turns (walked false: not yet). holds: how far each hand is held
  // on a grip, 0 to 1.
  apply(pose, G, P, walked, dt, holds = null) {
    if (!this.enabled) return;
    if (!walked) this.walkPose(pose, G, P);
    for (let i = 0; i < 2; i++) {
      this.load(i, G, P);
      const x = this.held[i];
      this.arm(ZERO); this.measure();
      this.maxArm = SelfArm / 100; this.maxArms = SelfArms / 100;
      const legal = this.legal(true);
      // (the arm as it came is inside and nothing is held from before: it is left alone)
      if (legal && !this.on[i]) continue;
      this.on[i] = true;
      // (a hand held on a grip sooner turns and swings its elbow than leaves the grip)
      this.dear = 1 + 2 * (holds ? clamp(holds[i], 0, 1) : 0);
      const frame = Math.max(dt, 1 / 240);
      const first = this.moved(i);
      const fresh = first || this.turned > JumpRate * frame;
      const room = clamp(1 - this.turned / (JumpRate * frame), 0.1, 1);
      this.maxSwivel = RateSwivel * frame * room; this.maxTurn = RateTurn * frame * room; this.maxLeave = RateLeave * frame;
      this.deepArm[i] = Math.max(SelfArm / 100, Math.min(first ? Infinity : this.deepArm[i], this.mArm) - DepthRate * frame);
      this.deepArms[i] = Math.max(SelfArms / 100, Math.min(first ? Infinity : this.deepArms[i], this.mArms) - DepthRate * frame);
      this.maxArm = this.deepArm[i]; this.maxArms = this.deepArms[i];
      this.hold = 0;
      const res = this.res;
      this.residuals(ZERO, res);
      const home = sum(res);
      this.x0.set(x);
      let c = this.cost(x, res);
      const stay = fresh ? 0 : Math.sqrt(Math.max(0, Settle / frame - 1));
      if (legal && !fresh && home < c) {
        // the arm as it came is inside again: the correction goes straight home, at its rates
        this.xs.fill(0);
        this.bound(this.xs, x);
        x.set(this.xs);
      } else {
        if (fresh && home <= c) { x.fill(0); this.x0.fill(0); c = this.cost(x, res); }
        // (the arm stands as it stood and the search has settled on it: nothing to find)
        if (fresh || Math.abs(c - this.settled[i]) > 1e-3 * this.settled[i] + 1e-12) {
          this.hold = stay;
          this.search(x, c, fresh);
          this.hold = 0;
          c = this.settled[i] = this.cost(x, res);
        }
        // the arm has moved on and left the correction in a hollow of its own, worse than none: anew, from none
        if (c > home && home > 0) { x.fill(0); this.x0.fill(0); this.search(x, this.cost(x, res), true); this.settled[i] = this.cost(x, res); }
      }
      x[0] -= 2 * Math.PI * Math.round(x[0] / (2 * Math.PI));
      // back at rest: the arm as it came is inside the limits and the correction has eased out
      if (legal && small(x)) { x.fill(0); this.on[i] = this.was[i] = false; this.settled[i] = -1; continue; }
      this.arm(x); this.measure();
      if (!this.legal(false)) { this.clampArm(); this.measure(); }
      this.write(i, pose, G, P);
    }
  }

  // The joints held once more on the pose as it will be shown, after anything laid over the pass (the net that turns
  // jumps in passes through poses between two legal ones). No search and no memory: only the clamp.
  holdPose(pose, G, P) {
    if (!this.enabled) return;
    this.walkPose(pose, G, P);
    for (let i = 0; i < 2; i++) {
      this.load(i, G, P);
      this.arm(ZERO); this.measure();
      // (an arm in his own body is the search's to bring out, over a few frames: not here)
      this.maxArm = this.maxArms = Infinity;
      if (this.legal(true)) continue;
      this.clampArm(); this.measure();
      this.write(i, pose, G, P);
    }
  }

  // how far the arm as it came has turned since the frame before (rad), in the chest's frame; true on the first frame
  // of a correction, which has no frame before
  moved(i) {
    const uc = this.t1.copy(this.u0).applyQuaternion(this.Ci), fc = this.t2.copy(this.f0).applyQuaternion(this.Ci);
    const hc = this.q1.multiplyQuaternions(this.Ci, this.H0);
    const first = !this.was[i];
    this.turned = 0;
    if (!first) this.turned = Math.max(acosC(uc.dot(this.wasU[i])), acosC(fc.dot(this.wasF[i])), angleQ(hc, this.wasH[i]));
    this.wasU[i].copy(uc); this.wasF[i].copy(fc); this.wasH[i].copy(hc); this.was[i] = true;
    return first;
  }

  // the bones the pass reads, as CrewPose.walk walks them all
  walkPose(pose, G, P) {
    const sk = this.sk, list = this.walkList;
    for (let k = 0; k < list.length; k++) {
      const b = list[k], p = sk.parent[b];
      if (p < 0) { G[b].copy(pose.Q[b]); P[b].copy(b === sk.hips ? pose.hips : sk.head[b]); continue; }
      G[b].multiplyQuaternions(G[p], pose.Q[b]);
      if (b === sk.hips) { P[b].copy(pose.hips); continue; }
      P[b].copy(b === sk.upperArm[0] ? pose.arm[0] : b === sk.upperArm[1] ? pose.arm[1] : sk.off[b]).applyQuaternion(G[p]).add(P[p]);
    }
  }

  // ---------------------------------------------------------------- the arm
  load(i, G, P) {
    const sk = this.sk, ua = sk.upperArm[i], fa = sk.forearm[i], ha = sk.hand[i], o = 1 - i;
    this.side = i === 0 ? -1 : 1;
    this.l1 = sk.upperLen[i]; this.l2 = sk.foreLen[i];
    this.S.copy(P[ua]);
    this.gua.copy(G[ua]); this.gfa.copy(G[fa]); this.H0.copy(G[ha]);
    this.C.copy(G[sk.chest]); this.Ci.copy(this.C).invert();
    this.grip.copy(sk.grip[i]);
    this.Gp.copy(this.grip).applyQuaternion(this.H0).add(P[ha]);
    unitV(this.u0.subVectors(P[fa], this.S));
    unitV(this.f0.subVectors(P[ha], P[fa]));
    this.e0.copy(this.u0);
    this.bent0 = clamp((acosC(this.u0.dot(this.f0)) - BentFrom) / (Bent - BentFrom), 0, 1);
    square(this.t1.set(1, 0, 0).applyQuaternion(this.gua), this.u0, this.hb0);
    this.poleBone.set(0, 0, 1).applyQuaternion(this.gua);
    hinge(this.u0, this.f0, this.hb0, this.t2);
    this.eps0 = twistY(basisQ(this.t2, this.t3.copy(this.u0).negate(), this.q1).invert().multiply(this.gua));
    this.hipsP.copy(P[sk.hips]); this.neckP.copy(P[this.neck]); this.thL.copy(P[this.thighL]); this.thR.copy(P[this.thighR]);
    this.headC.set(0, HeadUp, 0).applyQuaternion(G[this.headB]).add(P[this.headB]);
    this.oS.copy(P[sk.upperArm[o]]); this.oE.copy(P[sk.forearm[o]]); this.oW.copy(P[sk.hand[o]]);
  }

  // The arm for a correction x: the hand turned by x[1..3] about its grip point, the grip moved by x[4..6], the elbow
  // swung by x[0] about the line from shoulder to wrist from where it was. Out of reach the arm points at the wrist.
  arm(x) {
    const H = this.H, W = this.W, S = this.S, dir = this.t1, p = this.t2, t = this.t3;
    if (x[1] === 0 && x[2] === 0 && x[3] === 0) H.copy(this.H0); else H.copy(this.H0).multiply(expQ(x[1], x[2], x[3], this.q2));
    W.copy(this.grip).applyQuaternion(H).negate().add(this.Gp);
    if (x[4] !== 0 || x[5] !== 0 || x[6] !== 0) W.add(t.set(x[4], x[5], x[6]).applyQuaternion(this.C));
    dir.subVectors(W, S);
    let dist = dir.length();
    if (dist > 1e-9) dir.divideScalar(dist); else dir.copy(this.u0);
    const l1 = this.l1, l2 = this.l2, lo = Math.abs(l1 - l2) + 1e-4, hi = l1 + l2 - 1e-4;
    this.mReach = dist < lo ? lo - dist : dist > hi ? dist - hi : 0;
    if (this.mReach > 0) { dist = clamp(dist, lo, hi); W.copy(S).addScaledVector(dir, dist); }
    // the elbow's side: where it was, and for an arm that came straight the side its hinge bends to
    p.copy(this.e0).addScaledVector(dir, -this.e0.dot(dir));
    const pl = p.length();
    if (pl < 0.05) p.addScaledVector(t.copy(this.poleBone).addScaledVector(dir, -this.poleBone.dot(dir)), 0.05 - pl);
    if (p.length() < 1e-9) square(t.set(0, 0, 1), dir, p);
    unitV(p);
    if (x[0] !== 0) { const c = Math.cos(x[0]), s = Math.sin(x[0]); t.crossVectors(dir, p); p.multiplyScalar(c).addScaledVector(t, s); }
    const ca = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    this.u.copy(dir).multiplyScalar(ca).addScaledVector(p, sa);
    this.E.copy(S).addScaledVector(this.u, l1);
    unitV(this.f.subVectors(W, this.E));
  }

  // a direction in the chest's frame as a right arm has it (+X out to the side, -Z ahead, +Y up), and back
  toChest(v, out) { out.copy(v).applyQuaternion(this.Ci); out.x *= this.side; return out; }
  fromChest(c, out) { return out.set(c.x * this.side, c.y, c.z).applyQuaternion(this.C); }

  // the arm's measures, as the audit takes them (radians, metres)
  measure() {
    const u = this.u, f = this.f, H = this.H, W = this.W, E = this.E;
    this.mFlex = acosC(u.dot(f));
    const uc = this.toChest(u, this.t4), fc = this.toChest(f, this.t5);
    this.upY = uc.y;
    this.mBehind = Math.asin(clamp(uc.z, -1, 1));
    this.mAcross = Math.asin(clamp(-uc.x, -1, 1));
    this.mAcrossMax = acrossMax(uc.z);
    // (an arm that came bent is judged as a bent arm wherever the search takes it)
    this.wBent = Math.max(this.bent0, clamp((this.mFlex - BentFrom) / (Bent - BentFrom), 0, 1));
    this.mRot = 0; this.wRot = 0;
    // (straight up there is no telling the turn: the audit leaves it out above 0.95)
    if (this.wBent > 0 && uc.y < 0.98) {
      const rf = forward(uc, this.t6), fp = this.t7.copy(fc).addScaledVector(uc, -fc.dot(uc));
      const crx = rf.y * fp.z - rf.z * fp.y, cry = rf.z * fp.x - rf.x * fp.z, crz = rf.x * fp.y - rf.y * fp.x;
      this.mRot = Math.atan2(crx * uc.x + cry * uc.y + crz * uc.z, rf.dot(fp));
      this.wRot = this.wBent * clamp((0.98 - uc.y) / 0.03, 0, 1);
    }
    // the hand on the forearm as the hinge has it: its bend, and with the bend taken off its turn about the forearm
    const fx = this.t4.crossVectors(u, f), cl = fx.length();
    if (cl > 1e-6) fx.divideScalar(cl); else fx.copy(this.hb0);
    const fy = this.t5.copy(f).negate(), fz = this.t6.crossVectors(fx, fy);
    const hx = this.t7.set(1, 0, 0).applyQuaternion(H), hy = this.t3.set(0, 1, 0).applyQuaternion(H);
    const y1x = hy.dot(fx), y1y = hy.dot(fy), y1z = hy.dot(fz);
    this.mBend = acosC(y1y);
    this.mPron = 0;
    if (y1y > -0.999) {
      const ax = hx.dot(fx), ay = hx.dot(fy), az = hx.dot(fz), k = (ax * y1x + ay * (y1y + 1) + az * y1z) / (1 + y1y);
      this.mPron = Math.atan2(-(az - y1z * k), ax - y1x * k);
    }
    // forearm and hand in the trunk, the arms in each other, the forearm in the head
    const tip = this.t4.set(0, -HandLen, 0).applyQuaternion(H).add(W);
    this.mArm = Math.max(RFore + RTrunk - segDist(E, W, this.hipsP, this.neckP), RFore + RHips - segDist(E, W, this.thL, this.thR),
      RHand + RTrunk - segDist(W, tip, this.hipsP, this.neckP), RHand + RHips - segDist(W, tip, this.thL, this.thR));
    this.mArms = Math.max(RFore + RFore - segDist(E, W, this.oE, this.oW), RFore + RUpper - segDist(E, W, this.oS, this.oE), RUpper + RFore - segDist(this.S, E, this.oE, this.oW));
    this.mHead = RFore + RHead - segDist(E, W, this.headC, this.headC);
  }

  // inside the limits. asCame: the upper arm's roll against the hinge counts too (an arm the pass wrote has it held)
  legal(asCame) {
    if (this.mFlex > ElbowFlex * DEG || this.mBehind > ShoulderBehind * DEG || this.mAcross > this.mAcrossMax || this.mBend > WristBend * DEG) return false;
    if (this.mArm > this.maxArm || this.mArms > this.maxArms) return false;
    if (this.mFlex > Bent - DEG) {
      if (Math.abs(this.mPron) > ForearmPronation * DEG) return false;
      if (this.upY < 0.955 && Math.abs(this.mRot) > ShoulderRotation * DEG) return false;
      if (asCame && Math.abs(this.eps0) > ElbowAxis * DEG) return false;
    }
    return true;
  }

  // what the search brings to nothing: every measure's excess over its aim, and what the correction costs
  residuals(x, r) {
    const dear = this.dear;
    r[0] = over(this.mFlex - (ElbowFlex * DEG - Aim));
    r[1] = over(this.mBehind - (ShoulderBehind * DEG - Aim));
    r[2] = over(this.mAcross - (this.mAcrossMax - Aim));
    r[3] = this.wRot * over(Math.abs(this.mRot) - (ShoulderRotation * DEG - Aim));
    r[4] = this.wBent * over(Math.abs(this.mPron) - (ForearmPronation * DEG - Aim));
    r[5] = over(this.mBend - (WristBend * DEG - Aim));
    r[6] = PerMetre * over(this.mArm - (this.maxArm - AimDepth));
    r[7] = PerMetre * over(this.mArms - (this.maxArms - AimDepth));
    r[8] = PerMetre * 0.5 * over(this.mHead - 0.03);
    r[9] = PerMetre * this.mReach;
    r[10] = PerMetre * over(Math.sqrt(x[4] * x[4] + x[5] * x[5] + x[6] * x[6]) - FarLeave);
    r[11] = over(Math.sqrt(x[1] * x[1] + x[2] * x[2] + x[3] * x[3]) - FarTurn);
    for (let k = 12; k < NC; k++) r[k] = 0;
    r[NC] = (CostSwivel / dear) * x[0];
    for (let k = 1; k < 4; k++) r[NC + k] = (CostTurn / dear) * x[k];
    for (let k = 4; k < NX; k++) r[NC + k] = CostLeave * x[k];
    // (and what it costs to leave where the frame began)
    const hold = this.hold, x0 = this.x0;
    for (let k = 0; k < NX; k++) r[NC + NX + k] = hold === 0 ? 0 : hold * (k === 0 ? CostSwivel / dear : k < 4 ? CostTurn / dear : CostLeave) * (x[k] - x0[k]);
  }

  cost(x, r) {
    this.arm(x); this.measure(); this.residuals(x, r);
    return sum(r);
  }

  // ---------------------------------------------------------------- the search
  // damped least squares from the correction held (c its cost, res its residuals): a few steps on a frame
  search(x, c, fresh) {
    if (c < 1e-14) return;
    const steps = fresh ? 10 : 6, xt = this.xt, dx = this.dx, jac = this.jac, mat = this.mat, rhs = this.rhs, res1 = this.res1;
    let res = this.res, mu = 1e-3;
    for (let it = 0; it < steps && c > 1e-14; it++) {
      // the residuals' slopes by small steps
      for (let k = 0; k < NX; k++) {
        const h = k < 4 ? 1e-4 : 1e-5;
        xt.set(x);
        xt[k] += h;
        this.cost(xt, res1);
        for (let j = 0; j < NR; j++) jac[j * NX + k] = (res1[j] - res[j]) / h;
      }
      for (let a = 0; a < NX; a++) {
        let g = 0;
        for (let j = 0; j < NR; j++) g += jac[j * NX + a] * res[j];
        rhs[a] = -g;
        for (let b = a; b < NX; b++) {
          let s = 0;
          for (let j = 0; j < NR; j++) s += jac[j * NX + a] * jac[j * NX + b];
          mat[a * NX + b] = mat[b * NX + a] = s;
        }
      }
      let moved = false;
      for (let attempt = 0; attempt < 4 && !moved; attempt++) {
        if (!this.solve(mu)) { mu *= 10; continue; }
        // (one step no further than a body turns in a frame or two: beyond that the slopes say little)
        let scale = 1;
        scale = Math.min(scale, StepSwivel / Math.max(StepSwivel, Math.abs(dx[0])));
        scale = Math.min(scale, StepTurn / Math.max(StepTurn, Math.sqrt(dx[1] * dx[1] + dx[2] * dx[2] + dx[3] * dx[3])));
        scale = Math.min(scale, StepLeave / Math.max(StepLeave, Math.sqrt(dx[4] * dx[4] + dx[5] * dx[5] + dx[6] * dx[6])));
        for (let k = 0; k < NX; k++) xt[k] = x[k] + dx[k] * scale;
        const c1 = this.cost(xt, res1);
        if (c1 < c) {
          const gain = c - c1;
          x.set(xt); res.set(res1);
          c = c1; moved = true;
          mu = Math.max(mu / 3, 1e-6);
          // (a step that gains next to nothing: it has settled)
          if (gain < 0.02 * c + 1e-12) it = steps;
        } else mu *= 10;
      }
      if (!moved) break;
    }
  }

  // a correction no further from where the frame began than the rates allow
  bound(x, from) {
    x[0] = clamp(x[0], from[0] - this.maxSwivel, from[0] + this.maxSwivel);
    shorten(x, from, 1, this.maxTurn);
    shorten(x, from, 4, this.maxLeave);
  }

  // (mat + mu diag) dx = rhs by Cholesky; false when it is not positive
  solve(mu) {
    const mat = this.mat, chol = this.chol, dx = this.dx, rhs = this.rhs;
    for (let a = 0; a < NX; a++)
      for (let b = 0; b <= a; b++) {
        let s = mat[a * NX + b];
        if (a === b) s += mu * mat[a * NX + a] + 1e-12;
        for (let k = 0; k < b; k++) s -= chol[a * NX + k] * chol[b * NX + k];
        if (a === b) {
          if (!(s > 1e-18)) return false;
          chol[a * NX + a] = Math.sqrt(s);
        } else chol[a * NX + b] = s / chol[b * NX + b];
      }
    for (let a = 0; a < NX; a++) {
      let s = rhs[a];
      for (let k = 0; k < a; k++) s -= chol[a * NX + k] * dx[k];
      dx[a] = s / chol[a * NX + a];
    }
    for (let a = NX - 1; a >= 0; a--) {
      let s = dx[a];
      for (let k = a + 1; k < NX; k++) s -= chol[k * NX + a] * dx[k];
      dx[a] = s / chol[a * NX + a];
    }
    return true;
  }

  // ---------------------------------------------------------------- the clamp
  // What the search left over a limit is taken off joint by joint, from the shoulder out: the upper arm into where a
  // shoulder lets it point, the elbow's bend, the upper arm's turn (the forearm about it), the hand on the forearm.
  clampArm() {
    const uc = this.toChest(this.u, this.t1), side = this.side;
    const sb = Math.sin(ShoulderBehind * DEG), cb = Math.sqrt(1 - sb * sb);
    for (let pass = 0; pass < 3; pass++) {
      if (uc.z > sb) {
        const xy = Math.sqrt(uc.x * uc.x + uc.y * uc.y);
        if (xy < 1e-9) uc.set(0, -cb, sb); else uc.set((uc.x * cb) / xy, (uc.y * cb) / xy, sb);
      }
      const sa = Math.sin(acrossMax(uc.z)), ca = Math.sqrt(1 - sa * sa);
      if (-uc.x > sa) {
        const yz = Math.sqrt(uc.y * uc.y + uc.z * uc.z);
        if (yz < 1e-9) uc.set(-sa, -ca, 0); else uc.set(-sa, (uc.y * ca) / yz, (uc.z * ca) / yz);
      }
    }
    // (the two limits lean on each other: what the passes left is taken off the arm's height, up or down as it was)
    const zMax = Math.min(uc.z, sb), xMin = Math.max(uc.x, -Math.sin(acrossMax(zMax)));
    if (zMax !== uc.z || xMin !== uc.x) uc.set(xMin, (uc.y > 0 ? 1 : -1) * Math.sqrt(Math.max(0, 1 - xMin * xMin - zMax * zMax)), zMax);
    const u1 = unitV(this.fromChest(uc, this.t2));
    const f1 = arcV(this.u, u1, this.f, this.t3);
    // the bend
    let flex = acosC(u1.dot(f1));
    const max = ElbowFlex * DEG;
    if (flex > max) {
      const perp = this.t4.copy(f1).addScaledVector(u1, -u1.dot(f1));
      if (perp.length() > 1e-9) unitV(perp); else square(this.t5.copy(this.poleBone).negate(), u1, perp);
      f1.copy(u1).multiplyScalar(Math.cos(max)).addScaledVector(perp, Math.sin(max));
      flex = max;
    }
    // the turn about the upper arm
    if (flex > Bent - DEG && uc.y < 0.955) {
      const fc = this.toChest(f1, this.t4), rf = forward(uc, this.t5), fp = this.t6.copy(fc).addScaledVector(uc, -fc.dot(uc));
      const crx = rf.y * fp.z - rf.z * fp.y, cry = rf.z * fp.x - rf.x * fp.z, crz = rf.x * fp.y - rf.y * fp.x;
      const rot = Math.atan2(crx * uc.x + cry * uc.y + crz * uc.z, rf.dot(fp));
      const lim = ShoulderRotation * DEG;
      if (Math.abs(rot) > lim) {
        // (the turn is measured as a right arm's: a left arm's goes the other way round in the figure's frame)
        const back = (Math.sign(rot) * lim - rot) * side, c = Math.cos(back), s = Math.sin(back), d = u1.dot(f1);
        const cr = this.t7.crossVectors(u1, f1);
        f1.multiplyScalar(c).addScaledVector(cr, s).addScaledVector(u1, d * (1 - c));
      }
    }
    this.u.copy(u1); unitV(this.f.copy(f1));
    this.E.copy(this.S).addScaledVector(this.u, this.l1); this.W.copy(this.E).addScaledVector(this.f, this.l2);
    // the hand on the forearm: its bend and its turn held, in the forearm's frame as the hinge has it
    const fx = this.t4.crossVectors(this.u, this.f);
    if (fx.length() > 1e-6) unitV(fx); else square(this.hb0, this.f, fx);
    const frame = basisQ(fx, this.t5.copy(this.f).negate(), this.q1);
    const rel = this.q2.copy(frame).invert().multiply(this.H);
    if (rel.w < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
    const n = Math.sqrt(rel.y * rel.y + rel.w * rel.w);
    if (n < 1e-6) { this.H.copy(frame); return; }
    const twist = this.q3.set(0, rel.y / n, 0, rel.w / n);
    const swing = rel.multiply(this.gu.copy(twist).invert()); // (rel is done with: swing in its place)
    const bend = 2 * Math.acos(clamp(n, -1, 1));
    if (bend > WristBend * DEG) {
      const sl = Math.sqrt(swing.x * swing.x + swing.y * swing.y + swing.z * swing.z), half = (WristBend * DEG) / 2, k = sl > 1e-9 ? Math.sin(half) / sl : 0;
      swing.set(swing.x * k, swing.y * k, swing.z * k, Math.cos(half));
    }
    const tw = 2 * Math.atan2(twist.y, twist.w);
    if (flex > Bent - DEG && Math.abs(tw) > ForearmPronation * DEG) {
      const half = (Math.sign(tw) * ForearmPronation * DEG) / 2;
      twist.set(0, Math.sin(half), 0, Math.cos(half));
    }
    this.H.copy(frame).multiply(swing).multiply(twist);
  }

  // the arm as solved into the pose, and into its walked rotations and places
  write(i, pose, G, P) {
    const sk = this.sk, ua = sk.upperArm[i], fa = sk.forearm[i], ha = sk.hand[i], par = sk.parent[ua];
    const gu = this.gu, gf = this.gf;
    carry(this.u0, this.f0, this.gua, this.gfa, this.u, this.f, ElbowAxis, gu, gf);
    if (par < 0) pose.Q[ua].copy(gu); else pose.Q[ua].copy(G[par]).invert().multiply(gu);
    pose.Q[fa].copy(gu).invert().multiply(gf);
    pose.Q[ha].copy(gf).invert().multiply(this.H);
    G[ua].copy(gu); G[fa].copy(gf); G[ha].copy(this.H);
    P[fa].copy(this.E); P[ha].copy(this.W);
  }
}

const over = (v) => (v > 0 ? v : 0);

function sum(r) {
  let c = 0;
  for (let k = 0; k < NR; k++) c += r[k] * r[k];
  return c;
}

function small(x) {
  for (let k = 0; k < 4; k++) if (Math.abs(x[k]) > 2e-3) return false;
  for (let k = 4; k < NX; k++) if (Math.abs(x[k]) > 2e-4) return false;
  return true;
}

function shorten(x, from, k, max) {
  const a = x[k] - from[k], b = x[k + 1] - from[k + 1], c = x[k + 2] - from[k + 2], len = Math.sqrt(a * a + b * b + c * c);
  if (len <= max) return;
  const s = max / len;
  x[k] = from[k] + a * s; x[k + 1] = from[k + 1] + b * s; x[k + 2] = from[k + 2] + c * s;
}

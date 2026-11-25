import * as THREE from 'three';
import { CrewPose } from './pose.js';
import { PoseLimits, carry, POSED_ROLL } from './limits.js';
import { PoseSettle } from './settle.js';
import { FootPlant } from './feet.js';
import { SOLVER_GRIP } from './skeleton.js';
import { clamp, smooth, slerpQ, slerp4 } from './math.js';

// One lifelike crewman's pose each frame (the port of the Godot game's CrewAnimator.cs): the drill's solver figure
// (crew.js) still says where he stands, in which pose and at which phase, and keeps his hands on the gun; a clip rides
// on top of it.
//   final = the live solver pose, bone by bone, times the difference between the clip and the solver's own pose for the
//   same pose name and phase on flat ground (q_live * (q_ref^-1 * q_clip), hips p_live + p_clip - p_ref): on flat ground
//   with no reach that is the clip exactly, and slopes, cross-fades and reaches still come from the drill. A pose with
//   no clip ('dead') is the live pose unchanged. When the pose name changes the difference fades from the one held to
//   the new one over 0.3 s.
//   Then the hands: an arm the clip pins, one the solver placed by IK when the pose has no clip, or one the drill
//   reached onto a grip is put with its grip point exactly on the solver's and the solver's hand rotation, by a two-bone
//   IK from the final shoulder with the elbow kept on the side it was; on and off over 0.15 s. Fingers stay as the clip
//   has them, else the model's own hand shapes (relaxed, or closed round a bar for a hand held on). Then both arms are
//   brought inside what a body can do (PoseLimits), the net (PoseSettle) turns in whatever would jump faster than a body
//   can, the limits hold once more, the feet are held on the ground (FootPlant), the forearm twist bones take their
//   share of the hand's twist and the eyelids blink.
// The results are the joints the engine takes: local, hipsPos, armPos. Nothing is allocated per frame.

const FADE_SECONDS = 0.3, HAND_SECONDS = 0.15, SHOULDER_GIVE = 0.05;
const BLINK_MIN = 2, BLINK_MAX = 6, BLINK_SECONDS = 0.15;
// crew.js's bone parents (CREW_BONES order), for the solver's hand without touching the scene's matrices
const SOLVER_PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();

export class CrewAnimator {
  constructor(sk, clips, man) {
    if (!sk.complete) throw new Error('the crew2 skeleton lacks solver bones');
    this.sk = sk; this.clips = clips; this.man = man;
    this.final = new CrewPose(sk); this.live = new CrewPose(sk); this.clipP = new CrewPose(sk); this.refP = new CrewPose(sk);
    this.limits = new PoseLimits(sk);
    this.settled = new PoseSettle(sk);
    this.feet = new FootPlant(sk);
    this.planting = true;
    const quats = () => Array.from({ length: sk.count }, Q);
    this.dCur = quats(); this.dFrom = quats(); this.dTo = quats(); this.G = quats(); this.local = quats();
    this.P = Array.from({ length: sk.count }, V);
    this.hipsPos = V(); this.armPos = [V(), V()];
    this.hCur = V(); this.hFrom = V(); this.hTo = V();
    this.handW = [0, 0];
    this.name = null; this.cur = null;
    this.fading = false; this.plain = true; this.walked = false; this.handsWere = false;
    this.fade = 0; this.clock = 0; this.poseClock = 0; this.breath = 0; this.blinkT = -1; this.lid = 0;
    this.rootX = 0; this.rootY = 0; this.rootZ = 0; this.rootH = 0; this.rooted = false;
    // scratch
    this.grip = V(); this.wrist = V(); this.dir = V(); this.up = V(); this.pole = V(); this.e2 = V(); this.fo = V(); this.f2 = V();
    this.qh = Q(); this.gu = Q(); this.gf = Q(); this.gh = Q(); this.qi = Q(); this.qt = Q();
    // (until the camera is near enough for the fingers to be posed they keep the model's relaxed hand)
    for (const b of sk.fingers) this.final.Q[b].copy(sk.fingerRelaxed[b]);
    this.final.toJoints(sk, this.local, this.hipsPos, this.armPos);
    // men differ: each his own idle clock and his own blinks
    this.rng = (Math.imul(man, 2654435761 | 0) + 0x9e3779b9) >>> 0;
    this.clock = this.rand() * 60;
    this.blinkIn = this.rand() * BLINK_MAX;
  }

  rand() {
    let r = this.rng;
    r = (r ^ (r << 13)) >>> 0; r = (r ^ (r >>> 17)) >>> 0; r = (r ^ (r << 5)) >>> 0;
    this.rng = r;
    return r / 4294967296;
  }

  // the man was not shown for a while (hidden, or a cut): the next frame is taken as it stands
  cut() { this.settled.reset(); this.limits.rest(); this.feet.reset(); }

  // where the man stands this frame in the gun's root frame, told before update: for what must stay put on the ground
  place(x, y, z, h) { this.rootX = x; this.rootY = y; this.rootZ = z; this.rootH = h; this.rooted = true; }

  // One frame: the man's solver figure after the drill posed it (and reached with it), the pose name and phase the
  // drill asked and the frame's length. hands false (far away) skips the hand IK, the limits, the net and the feet;
  // fine false leaves the fingers, toes and face alone. shot: the seconds since the gun's last shot, or minus the
  // seconds until its next when that is nearer (NaN: not known), for the clips made round the shot.
  update(fig, pose, t, dt, hands = true, fine = true, shot = NaN) {
    const sk = this.sk, B = fig.mesh.skeleton.bones, armIk = fig.armIk, reached = fig.reached;
    this.live.fromSolver(B, sk);
    const first = this.name == null;
    // the model's own hand shapes are in play (close up)
    const shapes = fine && sk.fingers.length > 0;
    if (pose !== this.name) {
      const next = this.clips?.pick(pose, this.man) ?? null;
      // (nothing to fade between two poses that change nothing, nor on the first frame)
      if (!first && (!this.plain || next || shapes)) {
        for (let b = 0; b < this.dCur.length; b++) this.dFrom[b].copy(this.dCur[b]);
        this.hFrom.copy(this.hCur);
        this.fade = 0; this.fading = true;
      }
      this.name = pose;
      this.cur = next;
      this.poseClock = 0;
    }
    this.clock += dt; this.poseClock += dt;
    const c = this.cur;
    // (the net takes the first frame, and the first back from far away, as it is)
    const snap = first || !this.handsWere;
    // how much each hand is held on the solver's grip, eased
    for (let i = 0; i < 2; i++) {
      // a pose's own IK arms follow the clip unless it pins them; a reach is always held; without a clip every IK arm
      const on = hands && (c ? c.pin[i] || reached[i] : armIk[i]);
      if (first || !this.handsWere || !hands) { this.handW[i] = on ? 1 : 0; continue; }
      const step = dt / HAND_SECONDS;
      this.handW[i] = on ? Math.min(1, this.handW[i] + step) : Math.max(0, this.handW[i] - step);
    }
    this.handsWere = hands;

    // the difference to lay over the live pose: the clip's from the solver's reference at this phase, and for the
    // fingers no clip poses the model's hand shape (relaxed; its grip for a hand held on)
    const any = !!c || shapes, dTo = this.dTo, dCur = this.dCur;
    if (any) {
      for (let b = 0; b < dTo.length; b++) dTo[b].identity();
      this.hTo.set(0, 0, 0);
    }
    if (c) {
      // the drill's phase; a free clip's own clock; a clip made round the shot on the shot's clock when that is known
      const phase = !Number.isNaN(c.shot) && !Number.isNaN(shot) ? (c.shot + shot) / c.seconds
        : !c.free ? t : c.loop ? this.clock / c.seconds : this.poseClock / c.seconds;
      c.sample(phase, this.clipP, fine ? null : sk.fine);
      c.ref.sample(t, this.refP);
      const bone = c.bone, cq = this.clipP.Q, rq = this.refP.Q;
      for (let k = 0; k < c.cols; k++) {
        const b = bone[k];
        if (b < 0 || (!fine && sk.fine[b])) continue;
        // (a bone the solver does not set has the identity for its reference: the scratch pose never writes it)
        dTo[b].copy(rq[b]).invert().multiply(cq[b]);
      }
      this.hTo.subVectors(this.clipP.hips, this.refP.hips);
    }
    if (shapes) {
      const fingers = sk.fingers;
      for (let k = 0; k < fingers.length; k++) {
        const b = fingers[k];
        if (!c || !c.has[b]) slerpQ(sk.fingerRelaxed[b], sk.fingerGrip[b], smooth(this.handW[sk.fingerSide[b]]), dTo[b]);
      }
    }
    if (this.fading) {
      this.fade += dt;
      // on the solver's own curve (1 - e^(-14 s), whole at 0.3 s): the live pose and the difference over it then move
      // together
      const k = this.fade >= FADE_SECONDS ? 1 : 1 - Math.exp(-14 * this.fade);
      if (k >= 1) this.fading = false;
      const qi = this.qi.identity();
      for (let b = 0; b < dCur.length; b++) slerpQ(this.dFrom[b], any ? dTo[b] : qi, k, dCur[b]);
      if (any) this.hCur.lerpVectors(this.hFrom, this.hTo, k); else this.hCur.copy(this.hFrom).multiplyScalar(1 - k);
      this.plain = false;
    } else if (any) {
      for (let b = 0; b < dCur.length; b++) dCur[b].copy(dTo[b]);
      this.hCur.copy(this.hTo);
      this.plain = false;
    } else if (!this.plain) {
      for (let b = 0; b < dCur.length; b++) dCur[b].identity();
      this.hCur.set(0, 0, 0);
      this.plain = true;
    }

    const F = this.final;
    F.copy(this.live);
    if (!this.plain) {
      for (let b = 0; b < dCur.length; b++) F.Q[b].multiply(dCur[b]);
      F.hips.add(this.hCur);
    }

    // breathing on the poses that hold a phase (no clip, a clip on the drill's phase, or a single run made round the
    // shot): the loops with a clock of their own have their own life, and it eases out under them
    const layer = this.clips?.breath;
    if (layer) {
      const want = !c || !(c.free || (c.loop && !Number.isNaN(c.shot))) ? 1 : 0;
      this.breath = first ? want : want > this.breath ? Math.min(want, this.breath + dt / FADE_SECONDS) : Math.max(want, this.breath - dt / FADE_SECONDS);
      if (this.breath > 0) layer.apply(this.clock, smooth(this.breath), F, this.qt);
    }

    // the hips sunk the little the held feet need (FootPlant's give, from the last frame), before the hands go on
    const feet = this.feet, planting = hands && this.rooted && this.planting;
    if (planting) F.hips.y -= feet.give;
    if (hands) {
      this.walked = false;
      for (let i = 0; i < 2; i++) {
        if (this.handW[i] <= 0) continue;
        if (!this.walked) { F.walk(sk, this.G, this.P, true); this.walked = true; }
        this.handIk(B, i, smooth(this.handW[i]));
      }
      // the arms inside what a body can do, whatever clip, solver and hand IK made of them
      this.limits.apply(F, this.G, this.P, this.walked, dt, this.handW);
      // then nothing faster than a body can turn (after the limits: a correction that jumps is caught too)
      this.settled.apply(F, dt, snap, smooth(this.handW[0]), smooth(this.handW[1]));
      // and the joints held once more on the pose as shown
      this.limits.holdPose(F, this.G, this.P);
      // the feet on the ground where they were put, the legs solved to them (after the net: it would drag them along)
      if (planting) feet.apply(F, this.G, this.P, this.rootX, this.rootY, this.rootZ, this.rootH, dt, Math.max(reached[0] ? this.handW[0] : 0, reached[1] ? this.handW[1] : 0));
      else feet.reset();
      this.twistBone(0); this.twistBone(1);
    } else { this.limits.rest(); feet.reset(); }
    if (fine) this.lids(dt);
    F.toJoints(sk, this.local, this.hipsPos, this.armPos, fine);
  }

  // The hand of side i onto the solver's: its grip point on the solver's grip point, its rotation the solver's, the
  // upper arm and forearm turned the least that gets the wrist there, the elbow staying on the side it is. w < 1 goes
  // that share of the way.
  handIk(B, i, w) {
    const sk = this.sk, ua = sk.upperArm[i], fa = sk.forearm[i], ha = sk.hand[i], par = sk.parent[ua], G = this.G, P = this.P, F = this.final;
    const grip = this.grip, qh = this.qh;
    solverPoint(B, 7 + i * 3, SOLVER_GRIP[i], grip, qh);
    const wrist = this.wrist.copy(sk.grip[i]).applyQuaternion(qh);
    wrist.subVectors(grip, wrist);
    const S = P[ua], E = P[fa], W = P[ha], l1 = sk.upperLen[i], l2 = sk.foreLen[i], dir = this.dir, up = this.up, pole = this.pole, f2 = this.f2;
    dir.subVectors(wrist, S);
    let dist = dir.length();
    if (dist < 1e-6) return;
    dir.divideScalar(dist);
    up.subVectors(E, S);
    // a grip the clip left just beyond the straight arm: the shoulder gives, the upper arm's head going that way
    const over = dist - (l1 + l2 - 1e-4);
    if (over > 0) {
      const give = Math.min(over, SHOULDER_GIVE) * w;
      f2.copy(dir).multiplyScalar(give);
      S.add(f2);
      dist -= give;
      if (par >= 0) f2.applyQuaternion(this.qi.copy(G[par]).invert());
      F.arm[i].add(f2);
    }
    dist = clamp(dist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    pole.copy(up).addScaledVector(dir, -up.dot(dir));
    // (an arm that comes all but straight has no side to keep: its elbow goes where the upper arm's hinge bends it)
    const bent = pole.length() / l1;
    if (bent < 0.25) { f2.set(0, 0, 1).applyQuaternion(G[ua]); f2.addScaledVector(dir, -f2.dot(dir)); pole.addScaledVector(f2, (0.25 - bent) * l1); }
    // (the arm dead straight along the reach: the elbow goes behind him, then anywhere square to the reach)
    if (pole.lengthSq() < 1e-10) { pole.set(0, 0, 1).applyQuaternion(G[ua]); pole.addScaledVector(dir, -pole.dot(dir)); }
    if (pole.lengthSq() < 1e-10) { pole.set(1, 0, 0).applyQuaternion(G[ua]); pole.addScaledVector(dir, -pole.dot(dir)); }
    pole.normalize();
    const ca = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    const e2 = this.e2.copy(dir).multiplyScalar(ca).addScaledVector(pole, sa);
    // upper arm and forearm onto the new lines, rolled so that the elbow bends about their own hinge
    const fo = this.fo.subVectors(W, E).normalize();
    f2.copy(dir).multiplyScalar(dist).addScaledVector(e2, -l1).normalize();
    const gu = this.gu, gf = this.gf, gh = this.gh;
    carry(up.normalize(), fo, G[ua], G[fa], e2, f2, POSED_ROLL, gu, gf);
    gh.copy(qh);
    if (w < 1) {
      slerpQ(G[ua], gu, w, gu);
      slerpQ(G[fa], gf, w, gf);
      slerpQ(G[ha], gh, w, gh);
    }
    if (par < 0) F.Q[ua].copy(gu); else F.Q[ua].copy(G[par]).invert().multiply(gu);
    F.Q[fa].copy(gu).invert().multiply(gf);
    F.Q[ha].copy(gf).invert().multiply(gh);
    G[ua].copy(gu); G[fa].copy(gf); G[ha].copy(gh);
    P[fa].copy(sk.off[fa]).applyQuaternion(gu).add(S);
    P[ha].copy(sk.off[ha]).applyQuaternion(gf).add(P[fa]);
  }

  // the forearm twist bone: a share of the hand's turn about the forearm's long axis
  twistBone(i) {
    const sk = this.sk, tw = sk.twist[i];
    if (tw < 0) return;
    const q = this.final.Q[sk.hand[i]], a = sk.foreAxis[i];
    let p = q.x * a.x + q.y * a.y + q.z * a.z, w = q.w;
    if (w < 0) { p = -p; w = -w; }
    if (p * p + w * w < 1e-12) { this.final.Q[tw].identity(); return; }
    const half = Math.atan2(p, w) * sk.twistShare, s = Math.sin(half);
    this.final.Q[tw].set(a.x * s, a.y * s, a.z * s, Math.cos(half));
  }

  // a natural blink now and then: both upper lids down fast and up a little slower
  lids(dt) {
    const sk = this.sk;
    if (sk.lid[0] < 0 && sk.lid[1] < 0) return;
    if (this.blinkT < 0) {
      this.blinkIn -= dt;
      this.lid = 0;
      if (this.blinkIn <= 0) this.blinkT = 0;
    }
    if (this.blinkT >= 0) {
      const u = this.blinkT / BLINK_SECONDS;
      this.lid = u >= 1 ? 0 : u < 0.35 ? smooth(u / 0.35) : 1 - smooth((u - 0.35) / 0.65);
      this.blinkT += dt;
      if (u >= 1) { this.blinkT = -1; this.blinkIn = BLINK_MIN + this.rand() * (BLINK_MAX - BLINK_MIN); }
    }
    if (this.lid <= 0) return;
    for (let i = 0; i < 2; i++) {
      const b = sk.lid[i];
      if (b < 0) continue;
      const lc = sk.lidClose[i];
      slerp4(0, 0, 0, 1, lc.x, lc.y, lc.z, lc.w, this.lid, this.qt);
      this.final.Q[b].multiply(this.qt);
    }
  }

  // a point fixed to a bone (given from its head in the zero pose) in the figure's frame, from the pose as it stands
  point(bone, local, o) {
    this.final.walk(this.sk, this.G, this.P);
    return o.copy(local).applyQuaternion(this.G[bone]).add(this.P[bone]);
  }
}

// a solver bone's place in the figure's frame plus a local offset (its rotation into q), from crew.js's bones without
// touching the scene's matrices (crew.js jointFrame)
const _sp = new THREE.Vector3();
function solverPoint(B, index, local, p, q) {
  p.set(0, 0, 0); q.identity();
  for (let j = index; j >= 0; j = SOLVER_PARENT[j]) {
    p.applyQuaternion(B[j].quaternion).add(B[j].position);
    q.premultiply(B[j].quaternion);
  }
  return p.add(_sp.copy(local).applyQuaternion(q));
}

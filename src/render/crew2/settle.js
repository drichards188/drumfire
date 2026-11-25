import * as THREE from 'three';
import { clamp, slerpQ, slerp4, angleOf, between } from './math.js';

// The safety net under a crewman's shown pose (the port of the Godot game's PoseSettle.cs): no bone may turn faster
// than a body can, whatever asked it to (the solver's blends and its IK arms flipping their elbows, grips the drill
// moves in one frame, a reach that comes and goes, a clip's seam), and a held hand stays on its grip while that is
// caught. Each joint's turn on its parent is followed exactly while it is slower than MAX_TURN; a step beyond that is
// caught: the joint goes MAX_TURN that frame and the rest is kept as an offset that fades (time constant TAU once small,
// never faster than MAX_TURN), so a half turn is caught up in about 0.25 s and the motion under it goes on unchanged.
// Then a hand held on a grip goes back onto the grip point it was put on, by a two-bone IK from the shoulder as shown.
// Fingers, toes, the face and the forearm twist bones keep their turn on their parent. In rates, not steps.

export const MAX_TURN = (850 * Math.PI) / 180;
const TAU = 0.03, MAX_MOVE = 4, MIN_TURN = 1, MIN_MOVE = 0.05, HELD_SHARE = 0.75, GAP = 0.25;
const SHOULDER_GIVE = 0.05; // (the animator's: how far a shoulder gives towards a held grip the straight arm misses)

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();

export class PoseSettle {
  constructor(sk) {
    this.sk = sk;
    const quats = () => Array.from({ length: sk.count }, Q), points = () => Array.from({ length: sk.count }, V);
    this.ask = quats(); this.askG = quats(); this.loc = quats(); this.shown = quats(); this.off = quats();
    this.askP = points(); this.P = points();
    this.follow = new Uint8Array(sk.count);
    for (let b = 0; b < sk.count; b++) this.follow[b] = sk.fine[b] || b === sk.twist[0] || b === sk.twist[1] ? 1 : 0;
    this.side = new Int32Array(sk.count).fill(-1);
    for (let i = 0; i < 2; i++) for (const b of [sk.clavicle[i], sk.upperArm[i], sk.forearm[i], sk.hand[i]]) if (b >= 0) this.side[b] = i;
    this.hipsOff = V(); this.hipsShown = V(); this.d = V();
    this.armOff = [V(), V()]; this.armShown = [V(), V()];
    this.last = [Q(), Q(), Q(), Q()]; // the upper arms and forearms as shown the frame before (left, then right)
    this.q = Q(); this.r1 = Q(); this.r2 = Q(); this.gu = Q(); this.gf = Q();
    this.grip = V(); this.wrist = V(); this.dir = V(); this.up = V(); this.pole = V(); this.e2 = V(); this.fo = V(); this.f2 = V();
    this.primed = false;
  }

  // the next frame is taken as it is (a man shown again, a cut)
  reset() { this.primed = false; }

  // The pose as shown this frame, in place, after a frame dt long. snap: take it as it is. held0, held1: how much each
  // hand is held on the grip it was put on (0 to 1, eased). world (optional): every bone's rotation in the figure's
  // frame as shown, for the caller's own use.
  apply(pose, dt, snap = false, held0 = 0, held1 = 0, world = null) {
    const Q = pose.Q, sk = this.sk, shown = this.shown, loc = this.loc, off = this.off;
    if (snap || !this.primed || !(dt > 0) || dt > GAP) {
      pose.walk(sk, shown, this.P, !world);
      for (let b = 0; b < Q.length; b++) { loc[b].copy(Q[b]); off[b].identity(); }
      this.hipsShown.copy(pose.hips); this.hipsOff.set(0, 0, 0);
      for (let i = 0; i < 2; i++) { this.armShown[i].copy(pose.arm[i]); this.armOff[i].set(0, 0, 0); }
      this.primed = true;
      if (world) for (let b = 0; b < world.length; b++) world[b].copy(shown[b]);
      return;
    }
    // where the hands were put, before anything moves them
    if (held0 > 0 || held1 > 0) pose.walk(sk, this.askG, this.askP, true);
    for (let b = 0; b < Q.length; b++) this.ask[b].copy(Q[b]);
    for (let i = 0; i < 2; i++) { this.last[i * 2].copy(shown[sk.upperArm[i]]); this.last[i * 2 + 1].copy(shown[sk.forearm[i]]); }
    const step = MAX_TURN * dt, fade = Math.exp(-dt / TAU), order = sk.order, gu = this.gu;
    for (let k = 0; k < order.length; k++) {
      const b = order[k], p = sk.parent[b];
      if (this.follow[b]) {
        loc[b].copy(Q[b]);
        // (nothing reads a finger's or a twist bone's own turn in the figure's frame unless the caller asks for them)
        if (world) { if (p < 0) shown[b].copy(Q[b]); else shown[b].multiplyQuaternions(shown[p], Q[b]); }
        continue;
      }
      // what is still caught fades: by its time constant, but never faster than a joint may turn
      const held = this.side[b] < 0 ? 0 : this.side[b] === 0 ? held0 : held1;
      fadeTurn(off[b], step * (1 - (1 - HELD_SHARE) * held), fade, MIN_TURN * dt);
      // the joint as asked with that offset, no further from where it was shown than this frame allows
      const c = this.q.multiplyQuaternions(off[b], Q[b]);
      let caught = false;
      let go = between(loc[b], c);
      if (go > step) { slerpQ(loc[b], c, step / go, c); caught = true; }
      // and the bone, the chain's turns added up, no further either (shown[b] is still last frame's here)
      if (p < 0) gu.copy(c); else gu.multiplyQuaternions(shown[p], c);
      go = between(shown[b], gu);
      if (go > step) {
        slerpQ(shown[b], gu, step / go, gu);
        if (p < 0) c.copy(gu); else c.copy(shown[p]).invert().multiply(gu);
        caught = true;
      }
      // (what was not caught keeps its offset as it faded: a pose asked is then shown to the last bit)
      if (caught) { c.normalize(); gu.normalize(); this.offset(b, c); }
      loc[b].copy(c);
      shown[b].copy(gu);
      Q[b].copy(c);
    }
    this.move(pose.hips, this.hipsShown, this.hipsOff, dt, fade, 1);
    for (let i = 0; i < 2; i++) this.move(pose.arm[i], this.armShown[i], this.armOff[i], dt, fade, 1 - (1 - HELD_SHARE) * (i === 0 ? held0 : held1));
    if (held0 > 0 || held1 > 0) {
      pose.walk(sk, shown, this.P, !world);
      if (held0 > 0) this.hold(pose, 0, held0, step);
      if (held1 > 0) this.hold(pose, 1, held1, step);
    }
    if (world) for (let b = 0; b < world.length; b++) world[b].copy(shown[b]);
  }

  // what a joint shown as c still lacks of the joint asked (none at all when that is only rounding)
  offset(b, c) {
    const o = this.off[b];
    o.copy(c).multiply(this.gf.copy(this.ask[b]).invert());
    if (angleOf(o) < 1e-9) o.identity();
  }

  // a place the same way: the offset fades, the step is capped, the excess kept
  move(at, was, o, dt, fade, share) {
    const step = MAX_MOVE * dt, l = o.length(), d = this.d;
    if (l > 0) o.multiplyScalar(Math.max(0, Math.max(Math.min(l * fade, l - MIN_MOVE * dt), l - step * share)) / l);
    d.copy(at).add(o).sub(was);
    const go = d.length();
    if (go > step) d.multiplyScalar(step / go);
    was.add(d);
    o.subVectors(was, at);
    at.copy(was);
  }

  // The hand of side i back where it was put (its grip point as asked), w of the way: the hand keeps its turn as shown,
  // the upper arm and forearm turn the least that gets the wrist there, the elbow staying on the side it is shown.
  hold(pose, i, w, step) {
    const sk = this.sk, ua = sk.upperArm[i], fa = sk.forearm[i], ha = sk.hand[i], par = sk.parent[ua], shown = this.shown, P = this.P;
    const grip = this.grip.copy(sk.grip[i]).applyQuaternion(this.askG[ha]).add(this.askP[ha]);
    const wrist = this.wrist.copy(sk.grip[i]).applyQuaternion(shown[ha]);
    wrist.subVectors(grip, wrist);
    // (nothing to do for a hand where it was put)
    if (wrist.distanceTo(P[ha]) < 1e-9) return;
    const S = P[ua], E = P[fa], W = P[ha], l1 = sk.upperLen[i], l2 = sk.foreLen[i], dir = this.dir;
    dir.subVectors(wrist, S);
    let dist = dir.length();
    if (dist < 1e-6) return;
    dir.divideScalar(dist);
    // a grip just beyond the straight arm: the shoulder gives that little way, as the animator's own hand IK lets it
    const over = dist - (l1 + l2 - 1e-4);
    if (over > 0) {
      const give = Math.min(over, SHOULDER_GIVE) * w, d = this.d;
      d.copy(dir).multiplyScalar(give);
      S.add(d);
      dist -= give;
      if (par >= 0) d.applyQuaternion(this.q.copy(shown[par]).invert());
      pose.arm[i].add(d);
      this.armShown[i].add(d); this.armOff[i].add(d);
    }
    dist = clamp(dist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    const up = this.up.subVectors(E, S), pole = this.pole;
    pole.copy(up).addScaledVector(dir, -up.dot(dir));
    if (pole.lengthSq() < 1e-10) return;
    pole.normalize();
    const ca = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    const e2 = this.e2.copy(dir).multiplyScalar(ca).addScaledVector(pole, sa);
    const r1 = this.r1.setFromUnitVectors(up.normalize(), e2), gu = this.gu, gf = this.gf;
    gu.multiplyQuaternions(r1, shown[ua]);
    const fo = this.fo.subVectors(W, E).normalize().applyQuaternion(r1);
    const f2 = this.f2.copy(dir).multiplyScalar(dist).addScaledVector(e2, -l1).normalize();
    this.r2.setFromUnitVectors(fo, f2);
    gf.multiplyQuaternions(r1, shown[fa]).premultiply(this.r2);
    if (w < 1) {
      slerpQ(shown[ua], gu, w, gu);
      slerpQ(shown[fa], gf, w, gf);
    }
    // and no faster than a turn either: a grip that jumps is followed, the hand off it for those few frames
    cap(this.last[i * 2], gu, step);
    cap(this.last[i * 2 + 1], gf, step);
    const Qp = pose.Q;
    if (par < 0) Qp[ua].copy(gu); else Qp[ua].copy(shown[par]).invert().multiply(gu);
    Qp[fa].copy(gu).invert().multiply(gf);
    Qp[ha].copy(gf).invert().multiply(shown[ha]);
    shown[ua].copy(gu); shown[fa].copy(gf);
    this.loc[ua].copy(Qp[ua]); this.offset(ua, Qp[ua]);
    this.loc[fa].copy(Qp[fa]); this.offset(fa, Qp[fa]);
    this.loc[ha].copy(Qp[ha]); this.offset(ha, Qp[ha]);
  }
}

// an offset turn fades
function fadeTurn(o, step, fade, least) {
  const a = angleOf(o);
  if (a <= 1e-9) return;
  const left = Math.max(Math.min(a * fade, a - least), a - step);
  if (left < 1e-9) o.identity();
  else slerp4(0, 0, 0, 1, o.x, o.y, o.z, o.w, left / a, o);
}

// a rotation no further from where it was than a step
function cap(was, q, step) {
  const go = between(was, q);
  if (go > step) slerpQ(was, q, step / go, q);
}

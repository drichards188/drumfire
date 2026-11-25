import * as THREE from 'three';

// A whole pose of the lifelike crewman in the one convention the clips and the solver share (the port of the Godot
// game's CrewPose.cs): for every bone a rotation q relative to its parent, measured as world rotations away from the
// zero pose (q = G(parent)^-1 * G(bone), G the rotation from the bone's zero-pose orientation to its posed one in the
// figure's frame), so identity everywhere is the zero pose and crew.js's own bone quaternions are already in it (its
// bones rest unturned); the hips' place in the figure's frame; and for each upper arm its head from its parent's head
// in the parent's frame (the solver moves the shoulder joint: shrugs, long reaches).

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export class CrewPose {
  constructor(sk) {
    this.Q = Array.from({ length: sk.count }, () => new THREE.Quaternion());
    this.hips = new THREE.Vector3();
    this.arm = [new THREE.Vector3(), new THREE.Vector3()];
    this.setZero(sk);
  }

  setZero(sk) {
    for (const q of this.Q) q.identity();
    if (sk.hips >= 0) this.hips.copy(sk.head[sk.hips]);
    for (let i = 0; i < 2; i++) if (sk.upperArm[i] >= 0) this.arm[i].copy(sk.off[sk.upperArm[i]]);
    return this;
  }

  copy(p) {
    for (let i = 0; i < this.Q.length; i++) this.Q[i].copy(p.Q[i]);
    this.hips.copy(p.hips);
    this.arm[0].copy(p.arm[0]); this.arm[1].copy(p.arm[1]);
    return this;
  }

  // The solver's pose from crew.js's bones (fig.mesh.skeleton.bones, CREW_BONES order): its 17 bones' rotations as they
  // are, the hips' place, and the clavicles aimed so that the upper arm's head lands where the solver put the shoulder
  // (the solver's upper arm hangs from the chest at its bone position; here it hangs from the clavicle, which turns
  // from its zero direction to that shoulder the shortest way, the rest of the distance going into the upper arm's
  // place along it). Every other bone of the model stays at identity.
  fromSolver(B, sk) {
    for (const q of this.Q) q.identity();
    for (let s = 0; s < sk.solver.length; s++) this.Q[sk.solver[s]].copy(B[s].quaternion);
    this.hips.copy(B[0].position);
    for (let i = 0; i < 2; i++) {
      const ua = sk.upperArm[i], c = sk.clavicle[i], sh = B[5 + i * 3].position;
      if (c < 0) { this.arm[i].copy(sh); continue; }
      _v.subVectors(sh, sk.clavOff[i]);
      const len = _v.length();
      if (len < 1e-6) { this.arm[i].copy(sk.clavDir[i]).multiplyScalar(sk.clavLen[i]); continue; }
      this.Q[c].setFromUnitVectors(sk.clavDir[i], _v.divideScalar(len));
      this.arm[i].copy(sk.clavDir[i]).multiplyScalar(len);
      this.Q[ua].premultiply(_q.copy(this.Q[c]).invert());
    }
    return this;
  }

  // The joints for the engine: every bone's local rotation (joint global = G * Z, so local = Z(parent)^-1 * q * Z),
  // the hips' position and the upper arms' in their parents' joint frames. fine false leaves the fingers, toes and
  // face as they were.
  toJoints(sk, local, hips, arms, fine = true) {
    const Q = this.Q;
    for (let b = 0; b < Q.length; b++) {
      if (!fine && sk.fine[b]) continue;
      local[b].multiplyQuaternions(sk.ZParentInv[b], Q[b]).multiply(sk.Z[b]);
    }
    const hp = sk.parent[sk.hips];
    hips.copy(this.hips);
    if (hp >= 0) hips.sub(sk.head[hp]);
    hips.applyQuaternion(sk.ZParentInv[sk.hips]);
    for (let i = 0; i < 2; i++) arms[i].copy(this.arm[i]).applyQuaternion(sk.ZParentInv[sk.upperArm[i]]);
  }

  // every bone's world rotation G (away from the zero pose) and its head in the figure's frame, parents first (coarse:
  // all but the fingers, toes and face, which the passes never read)
  walk(sk, G, P, coarse = false) {
    const Q = this.Q, order = coarse ? sk.coarse : sk.order, ua0 = sk.upperArm[0], ua1 = sk.upperArm[1];
    for (let k = 0; k < order.length; k++) {
      const b = order[k], p = sk.parent[b];
      if (p < 0) { G[b].copy(Q[b]); P[b].copy(b === sk.hips ? this.hips : sk.head[b]); continue; }
      G[b].multiplyQuaternions(G[p], Q[b]);
      if (b === sk.hips) { P[b].copy(this.hips); continue; }
      P[b].copy(b === ua0 ? this.arm[0] : b === ua1 ? this.arm[1] : sk.off[b]).applyQuaternion(G[p]).add(P[p]);
    }
  }
}

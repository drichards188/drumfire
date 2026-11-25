import * as THREE from 'three';
import { CREW_BONES } from '../../models/v/crew.js';
import { clamp } from './math.js';

// The lifelike crewman's skeleton as its model describes it (public/crew2/crew2.json; the contract is the Godot game's
// tools/blender/crew/README.md; this is the port of its CrewSkeleton.cs): every bone of the skin with its parent, the
// local rotation that puts it in the zero pose (the solver's: standing straight, arms hanging) and its head in that
// pose, in the figure's frame (metres, y up, facing -Z, right +X, the origin the ground point under him). From these
// the zero pose's orientations Z and the lengths the clip layer needs. The 17 solver bones keep crew.js's names
// (CREW_BONES); the model adds clavicles, forearm twist bones, fingers, toes, a jaw and eyelids.

// the grip point in the hand's frame, as crew.js has it (left, right)
export const SOLVER_GRIP = [new THREE.Vector3(0.032, -0.092, 0), new THREE.Vector3(-0.032, -0.092, 0)];
// how far an upper eyelid turns down to shut when the model does not say (crew2.json gives its own in "face")
const LID_ANGLE = 0.6;
const FINE_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky', 'toe', 'jaw', 'lid'];
const NB = CREW_BONES.length;

const q4 = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]).normalize();

export class CrewSkeleton {
  constructor(json) {
    const bones = json.bones, n = bones.length;
    this.count = n;
    this.names = bones.map((b) => b.name);
    const index = new Map(this.names.map((s, i) => [s, i]));
    this.indexOf = index;
    this.parent = new Int32Array(n).fill(-1);
    this.zero = bones.map((b) => q4(b.zero));
    this.head = bones.map((b) => new THREE.Vector3(b.head[0], b.head[1], b.head[2]));
    this.fine = this.names.map((s) => FINE_NAMES.some((f) => s.startsWith(f)));
    for (let i = 0; i < n; i++) {
      const p = bones[i].parent;
      if (typeof p === 'string') this.parent[i] = index.get(p) ?? -1;
      else if (typeof p === 'number' && p >= 0 && p < n) this.parent[i] = p;
    }
    // parents before children
    const done = new Uint8Array(n), order = [];
    for (let pass = 0; pass < n && order.length < n; pass++)
      for (let i = 0; i < n; i++) if (!done[i] && (this.parent[i] < 0 || done[this.parent[i]])) { done[i] = 1; order.push(i); }
    if (order.length < n) throw new Error('crew2 skeleton: the bones\' parents make a loop');
    this.order = Int32Array.from(order);
    // the same without the fingers, toes and face: what the passes that read the body's places need
    this.coarse = Int32Array.from(order.filter((b) => !this.fine[b]));
    this.Z = new Array(n); this.ZInv = new Array(n); this.ZParentInv = new Array(n); this.off = new Array(n);
    for (const i of order) {
      const p = this.parent[i];
      this.Z[i] = p < 0 ? this.zero[i].clone() : new THREE.Quaternion().multiplyQuaternions(this.Z[p], this.zero[i]);
      this.ZInv[i] = this.Z[i].clone().invert();
      this.ZParentInv[i] = p < 0 ? new THREE.Quaternion() : this.ZInv[p];
      this.off[i] = p < 0 ? this.head[i].clone() : new THREE.Vector3().subVectors(this.head[i], this.head[p]);
    }
    let complete = true;
    this.solver = new Int32Array(NB);
    this.solverOf = new Int32Array(n).fill(-1);
    for (let s = 0; s < NB; s++) {
      this.solver[s] = index.get(CREW_BONES[s]) ?? -1;
      if (this.solver[s] < 0) complete = false; else this.solverOf[this.solver[s]] = s;
    }
    this.hips = this.solver[0]; this.chest = this.solver[2];
    const refs = [];
    for (let s = 0; s < NB; s++) if (this.solver[s] >= 0) refs.push(this.solver[s]);
    const pair = () => [-1, -1], v2 = () => [new THREE.Vector3(), new THREE.Vector3()];
    this.clavicle = pair(); this.upperArm = pair(); this.forearm = pair(); this.hand = pair(); this.twist = pair(); this.lid = pair();
    this.grip = v2(); this.clavOff = v2(); this.clavDir = v2(); this.foreAxis = v2();
    this.clavLen = [0, 0]; this.upperLen = [0, 0]; this.foreLen = [0, 0];
    this.lidClose = [new THREE.Quaternion(), new THREE.Quaternion()];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 'L' : 'R';
      this.upperArm[i] = this.solver[5 + i * 3]; this.forearm[i] = this.solver[6 + i * 3]; this.hand[i] = this.solver[7 + i * 3];
      this.clavicle[i] = index.get('clavicle' + side) ?? -1;
      this.twist[i] = index.get('forearmTwist' + side) ?? -1;
      this.lid[i] = index.get('lid' + side) ?? -1;
      this.grip[i].copy(SOLVER_GRIP[i]);
      this.lidClose[i].setFromAxisAngle(new THREE.Vector3(1, 0, 0), -LID_ANGLE);
      const ua = this.upperArm[i], fa = this.forearm[i], ha = this.hand[i];
      if (ua < 0 || fa < 0 || ha < 0) continue;
      if (this.parent[fa] !== ua || this.parent[ha] !== fa) complete = false;
      this.upperLen[i] = this.off[fa].length(); this.foreLen[i] = this.off[ha].length();
      this.foreAxis[i].copy(this.off[ha]).normalize();
      // a clavicle counts only as the model is to have it: between the chest and the upper arm
      let c = this.clavicle[i];
      if (c >= 0 && (this.parent[ua] !== c || this.parent[c] !== this.chest || this.off[ua].length() < 1e-4)) c = this.clavicle[i] = -1;
      if (c < 0) continue;
      refs.push(c);
      this.clavOff[i].copy(this.off[c]);
      this.clavLen[i] = this.off[ua].length();
      this.clavDir[i].copy(this.off[ua]).normalize();
    }
    this.refBones = Int32Array.from(refs);
    this.complete = complete;
    const g = json.grip;
    if (Array.isArray(g) && g.length === 2) for (let i = 0; i < 2; i++) if (g[i]?.length === 3) this.grip[i].set(g[i][0], g[i][1], g[i][2]);
    const lc = json.face?.lid_closed;
    if (Array.isArray(lc) && lc.length === 4) for (let i = 0; i < 2; i++) this.lidClose[i].copy(q4(lc));
    // the model's own hand shapes (the pose convention: identity is a straight finger): relaxed as modelled, grip
    // closed round a bar at the grip point; null where the model gives none
    this.fingerRelaxed = new Array(n).fill(null); this.fingerGrip = new Array(n).fill(null);
    this.fingerSide = new Int32Array(n).fill(-1);
    for (const [key, into] of [['relaxed', this.fingerRelaxed], ['grip', this.fingerGrip]]) {
      const shape = json.fingers?.[key];
      if (shape && typeof shape === 'object') for (const [name, a] of Object.entries(shape)) {
        const b = index.get(name);
        if (b != null && Array.isArray(a) && a.length === 4) into[b] = q4(a);
      }
    }
    const fingers = [];
    for (let b = 0; b < n; b++) {
      if (!this.fingerRelaxed[b] && !this.fingerGrip[b]) continue;
      this.fingerRelaxed[b] ??= new THREE.Quaternion(); this.fingerGrip[b] ??= new THREE.Quaternion();
      for (let p = b; p >= 0 && this.fingerSide[b] < 0; p = this.parent[p]) this.fingerSide[b] = p === this.hand[0] ? 0 : p === this.hand[1] ? 1 : -1;
      if (this.fingerSide[b] >= 0) fingers.push(b);
    }
    this.fingers = Int32Array.from(fingers);
    this.twistShare = typeof json.twist?.share === 'number' ? clamp(json.twist.share, 0, 1) : 0.6;
  }

  index(name) { return this.indexOf.get(name) ?? -1; }
}

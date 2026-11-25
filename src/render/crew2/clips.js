import { buildCrewman } from '../../models/v/crew.js';
import { CrewPose } from './pose.js';
import { slerp4, slerpF, slerpRun } from './math.js';

// The crewman's clips (public/crew2/clips.json, written by the Godot game's tools/blender/crew/anim_*.py; the port of
// its CrewClips.cs): each replaces one of the drill's poses with n samples of every bone's rotation (the pose
// convention, CrewPose) and the hips' place. A cycle's sample i is the phase i / n, a single run's i / (n - 1); a free
// clip (an idle) runs on its own clock, `seconds` long, the others on the drill's phase. Several clips for one pose are
// variants: a man takes one by his number. pin: that hand goes onto the solver's grip point after the clip.

// the two samples either side of a phase and the share of the second (one shared record: nothing is allocated)
const AT = { i0: 0, i1: 0, f: 0 };
function at(phase, n, loop) {
  if (n <= 1 || Number.isNaN(phase)) { AT.i0 = AT.i1 = 0; AT.f = 0; return AT; }
  if (loop) {
    const x = (phase - Math.floor(phase)) * n;
    let i0 = Math.floor(x), f = x - i0;
    if (i0 >= n) { i0 = 0; f = 0; }
    AT.i0 = i0; AT.f = f; AT.i1 = i0 + 1 === n ? 0 : i0 + 1;
  } else {
    const x = Math.min(1, Math.max(0, phase)) * (n - 1);
    const i0 = Math.min(Math.floor(x), n - 2);
    AT.i0 = i0; AT.f = x - i0; AT.i1 = i0 + 1;
  }
  return AT;
}

export class CrewClip {
  constructor() {
    this.name = ''; this.pose = ''; this.variant = 0; this.n = 1; this.cols = 0;
    this.loop = true; this.free = false; this.seconds = 1; this.pin = [false, false];
    // a clip made round the gun's shot: the shot falls this many seconds into it (NaN: none)
    this.shot = NaN;
    this.ref = null; // the solver's own pose for this pose name (RefPoses)
    this.rot = null; this.hipsAt = null; this.bone = null; this.has = null;
  }

  // the clip at a phase into o: the rotations of the clip's own bones (the others are left alone) and the hips; skip
  // (sk.fine, or null): bones left alone too (the fingers, toes and face while nobody is near enough to see them)
  sample(phase, o, skip = null) {
    const { i0, i1, f } = at(phase, this.n, this.loop);
    const cols = this.cols, rot = this.rot, bone = this.bone, Q = o.Q;
    let a = i0 * cols * 4, b = i1 * cols * 4;
    for (let c = 0; c < cols; c++, a += 4, b += 4) {
      const k = bone[c];
      if (k >= 0 && !(skip && skip[k])) slerpF(rot, a, rot, b, f, Q[k]);
    }
    const h = this.hipsAt;
    a = i0 * 3; b = i1 * 3;
    o.hips.set(h[a] + (h[b] - h[a]) * f, h[a + 1] + (h[b + 1] - h[a + 1]) * f, h[a + 2] + (h[b + 2] - h[a + 2]) * f);
  }
}

// A layer (clips.json "layers", the breathing): for a few bones a small turn dq multiplied after the pose's own,
// n samples of a loop `seconds` long that runs on each man's own clock.
export class CrewLayer {
  constructor() { this.n = 1; this.seconds = 8; this.loop = true; this.bone = null; this.rot = null; }

  apply(seconds, w, pose, scratch) {
    const { i0, i1, f } = at(seconds / this.seconds, this.n, this.loop);
    const cols = this.bone.length;
    let a = i0 * cols * 4, b = i1 * cols * 4;
    for (let c = 0; c < cols; c++, a += 4, b += 4) {
      if (this.bone[c] < 0) continue;
      slerpF(this.rot, a, this.rot, b, f, scratch);
      if (w < 1) slerp4(0, 0, 0, 1, scratch.x, scratch.y, scratch.z, scratch.w, w, scratch);
      pose.Q[this.bone[c]].multiply(scratch);
    }
  }
}

// The solver's pose for one pose name on flat ground, full blend and the default carry width, at n sample phases: what
// the clips are made against (the Godot game's solver_ref.json, here from crew.js's own solver, so on flat ground with
// no reach the clip is shown exactly). Kept as plain numbers for the bones a solver pose sets (its 17 and the clavicles).
export class RefPoses {
  constructor(pose, n, loop, sk, figure) {
    this.pose = pose; this.n = Math.max(1, n); this.loop = loop;
    const bones = this.bones = sk.refBones;
    this.rot = new Float64Array(this.n * bones.length * 4); this.hipsAt = new Float64Array(this.n * 3);
    const p = new CrewPose(sk), B = figure.mesh.skeleton.bones;
    figure.grip = 0.2; figure.groundSlope.x = figure.groundSlope.z = 0;
    for (let i = 0; i < this.n; i++) {
      const t = loop ? i / this.n : this.n > 1 ? i / (this.n - 1) : 0;
      figure.pose(pose, t, 1);
      p.fromSolver(B, sk);
      for (let c = 0; c < bones.length; c++) {
        const q = p.Q[bones[c]], k = (i * bones.length + c) * 4;
        this.rot[k] = q.x; this.rot[k + 1] = q.y; this.rot[k + 2] = q.z; this.rot[k + 3] = q.w;
      }
      this.hipsAt[i * 3] = p.hips.x; this.hipsAt[i * 3 + 1] = p.hips.y; this.hipsAt[i * 3 + 2] = p.hips.z;
    }
  }

  // the reference at a phase into o (only the bones a solver pose sets, and the hips)
  sample(phase, o) {
    const { i0, i1, f } = at(phase, this.n, this.loop);
    const bones = this.bones, rot = this.rot, n = bones.length;
    let a = i0 * n * 4, b = i1 * n * 4;
    for (let c = 0; c < n; c++, a += 4, b += 4)
      slerpRun(rot, a, rot, b, f, o.Q[bones[c]], false);
    const h = this.hipsAt;
    a = i0 * 3; b = i1 * 3;
    o.hips.set(h[a] + (h[b] - h[a]) * f, h[a + 1] + (h[b + 1] - h[a + 1]) * f, h[a + 2] + (h[b + 2] - h[a + 2]) * f);
  }
}

// base64 of little-endian float32 (every browser is little-endian)
function floats(b64) {
  const s = atob(b64 ?? ''), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Float32Array(u.buffer, 0, u.length >> 2);
}

// (unit rotations, whatever the float32 rounding left)
function unit(rot) {
  for (let k = 0; k + 3 < rot.length; k += 4) {
    const x = rot[k], y = rot[k + 1], z = rot[k + 2], w = rot[k + 3], len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len < 1e-9) { rot[k] = rot[k + 1] = rot[k + 2] = 0; rot[k + 3] = 1; } else { rot[k] = x / len; rot[k + 1] = y / len; rot[k + 2] = z / len; rot[k + 3] = w / len; }
  }
  return rot;
}

const truth = (v) => v === true || (typeof v === 'number' && v !== 0);

// the ears clip's flinch, seconds into its loop, when the file does not say
const EARS_FLINCH = 1.1;
// the sample count of the reference under a free clip: the drill's phase of an idle pose is a cycle of its own
const FREE_REF = 32;

export class ClipTable {
  constructor(json, sk) {
    if (!sk.complete) throw new Error('the crew2 skeleton lacks solver bones');
    this.skeleton = sk;
    this.clips = new Map();
    this.byPose = new Map();
    this.breath = null;
    const names = json.bones, map = Int32Array.from(names.map((s) => sk.index(s)));
    const has = new Uint8Array(sk.count);
    for (const b of map) if (b >= 0) has[b] = 1;
    // a scratch solver figure for the references (crew.js's solver, posed on flat ground)
    const figure = buildCrewman({ outfit: 'german' }); // (an outfit the German pages have built already: its geometry is cached)
    const refs = new Map();
    const refFor = (pose, n, loop) => {
      const key = `${pose}|${n}|${loop}`;
      let r = refs.get(key);
      if (!r) refs.set(key, r = new RefPoses(pose, n, loop, sk, figure));
      return r;
    };
    for (const [name, c] of Object.entries(json.clips ?? {})) {
      const clip = new CrewClip();
      clip.name = name; clip.pose = c.pose ?? ''; clip.cols = names.length; clip.bone = map; clip.has = has;
      clip.variant = c.variant ?? 0;
      clip.loop = c.loop == null || truth(c.loop); clip.free = truth(c.free);
      clip.seconds = typeof c.seconds === 'number' ? Math.max(1e-3, c.seconds) : 1;
      clip.n = c.n | 0;
      if (Array.isArray(c.pin)) for (let i = 0; i < 2 && i < c.pin.length; i++) clip.pin[i] = truth(c.pin[i]);
      if (typeof c.shot === 'number') clip.shot = c.shot; else if (clip.pose === 'ears' && clip.free) clip.shot = EARS_FLINCH;
      clip.rot = unit(floats(c.rot));
      clip.hipsAt = floats(c.hips);
      if (clip.n < 1 || clip.rot.length !== clip.n * clip.cols * 4 || clip.hipsAt.length !== clip.n * 3)
        throw new Error(`clip ${name}: ${clip.rot.length} rotation and ${clip.hipsAt.length} hips numbers for ${clip.n} samples of ${clip.cols} bones`);
      // (a clip on a clock of its own is laid over the solver's pose at the drill's phase, whatever that is)
      clip.ref = clip.free || !Number.isNaN(clip.shot) ? refFor(clip.pose, FREE_REF, true) : refFor(clip.pose, clip.n, clip.loop);
      this.clips.set(name, clip);
    }
    for (const clip of this.clips.values()) {
      if (!this.byPose.has(clip.pose)) this.byPose.set(clip.pose, []);
      this.byPose.get(clip.pose).push(clip);
    }
    for (const list of this.byPose.values()) list.sort((a, b) => a.variant - b.variant || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const br = json.layers?.breath;
    if (br) {
      const layer = new CrewLayer();
      layer.bone = Int32Array.from(br.bones.map((s) => sk.index(s)));
      layer.n = br.n | 0;
      layer.rot = unit(floats(br.rot));
      layer.seconds = typeof br.seconds === 'number' ? Math.max(1e-3, br.seconds) : 8;
      layer.loop = br.loop == null || truth(br.loop);
      if (layer.n < 1 || layer.rot.length !== layer.n * layer.bone.length * 4) throw new Error('clips.json: the breath layer\'s numbers do not fit its samples');
      this.breath = layer;
    }
    figure.dispose(); // (its skeleton's bone texture; the geometry is crew.js's shared one)
  }

  // the clip a man plays for a pose: his variant by his number; null when the pose has none
  pick(pose, man) {
    const list = this.byPose.get(pose);
    if (!list) return null;
    return list[((man % list.length) + list.length) % list.length];
  }
}

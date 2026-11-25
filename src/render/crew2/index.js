import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { patchMaterial } from '../../shaderlib.js';
import { Crew2Files, OUTFITS } from './files.js';
import { CrewAnimator } from './animator.js';
import { buildCrewman, CREW_POSES } from '../../models/v/crew.js';

// The lifelike crewmen (the Godot game's crew2, its src/Crew/Crew2.cs and CrewFigure.cs): a MakeHuman body in uniform
// on a 56-joint skeleton with three lod meshes (public/crew2/crew2_<outfit>.glb), clips from motion capture and keyed
// work riding on the drill's poses (clips.json, the animator in this folder). The drill is untouched: crew.js's figure
// is still posed by it every frame (its bones and anchors stay, the props stay in its hands); its mesh is hidden and
// the lifelike man under the same root is posed from it (CrewAnimator). German pages only (?mode=ww1|ww2; the British
// crews keep their figures): ?crew2=0 keeps the old figures there to compare, ?crew2=1 asks for these anywhere. An
// outfit whose file is missing, whose check (crew2_<outfit>.check.json) is not ok or whose skeleton does not stand in
// crew2.json's zero pose keeps the old figure, as does every man if anything fails to load.
//
//   const c2 = new Crew2()           c2.wanted: this page uses them
//   c2.load(crews)                   starts loading the outfits those crews wear (GunCrew or VCrew: men[].fig)
//   await c2.ready(onProgress)       behind the loading screen: the files, the clips' references, the men dressed
//   c2.begin(); c2.sync(crew, piece, now, camera, dt, level); c2.end()   each frame, after each crew's drill
//   c2.enabled = false               the old figures again (the gear menu's switch)
//   c2.stats                         the last frame's and a window's cost (ms, men animated, lods)
//
// Cost (the user's first worry): LOD0 (20k triangles, two draws) only within 30 m, LOD1 (5k) to 110 m, LOD2 (1.2k, no
// shadow) beyond; a man is animated in full (hand IK, limits, the net, his feet) only within 110 m at the crews' near
// level (every second frame beyond 54 m), beyond 110 m every second frame without the hands, and at the far level
// (the crews' every third frame) without the hands; a man out of the camera's sight is not posed at all. His 56 bones
// are kept out of the scene graph (three.js would walk them every frame for every man on the map) and their matrices
// and bone texture are made only when he is posed. The animator allocates next to nothing (tens of bytes a man and
// frame, where V8 boxes a number; crew.js's solver makes more); its code is run once behind the loading screen.

const LOD0_END = 30, LOD1_END = 110, LOD_MARGIN = 4;
// fingers, toes and faces are posed while the camera is this near a man (lod0 and a walk round it)
const FINE_RANGE = LOD0_END + LOD_MARGIN + 20;
// frames between poses at the crews' near level: a far man (lod2, a few pixels tall), and a man on lod1 beyond the
// fine range (15 to 30 pixels tall: his hands stay on the gun, a frame late at most)
const FAR_EVERY = 2, MID_EVERY = 2;

export function crew2Wanted() {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search), c = q.get('crew2');
  if (c === '0') return false;
  if (c === '1') return true;
  return q.get('mode') === 'ww1' || q.get('mode') === 'ww2';
}

// the gunner's eyes from the head's joint: ahead along his facing and above (the Godot game's Crew2.EyeAhead and
// EyeUp; the old figure's are 0.07 ahead and 0.18 above its neck, crews.js eye)
const EYE_AHEAD = 0.063, EYE_UP = 0.075;

const noop = () => {};
const _p = new THREE.Vector3(), _s = new THREE.Sphere(), _m = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _zero = new THREE.Vector3();
// a man this far round his feet still counts as in sight (his shadow, a fast turn of the camera)
const SIGHT_R = 2.5;

// a man's lifelike body: the clone of his outfit's model under his figure's root, his animator and his bones
class Man2 {
  constructor(layer, m, outfit, number) {
    const sk = layer.sk;
    this.m = m;
    this.anim = new CrewAnimator(sk, layer.clips, number);
    const root = cloneSkinned(outfit.scene);
    root.name = 'crew2';
    this.root = root;
    const byName = new Map();
    const lods = [[], [], []];
    let skeleton = null;
    root.traverse((o) => {
      if (o.isBone) byName.set(o.name, o);
      if (!o.isSkinnedMesh) return;
      let lod = -1;
      for (let p = o; p && lod < 0; p = p.parent) { const k = /^body_lod(\d)/.exec(p.name); if (k) lod = Number(k[1]); }
      if (lod < 0 || lod > 2) { o.visible = false; return; }
      lods[lod].push(o);
      // (one skeleton for the three lods: one bone texture to fill a frame, whichever is drawn)
      if (!skeleton) skeleton = o.skeleton; else o.bind(skeleton, o.bindMatrix);
      // the bones are not in the scene (below): the skin is taken in the body's own frame, the figure's
      o.bindMode = THREE.DetachedBindMode;
      o.castShadow = lod < 2; // (the far body casts none: a pixel of shadow is not worth its pass)
      o.receiveShadow = true;
    });
    this.lods = lods;
    // every joint by crew2.json's index; their Euler angles are never read, so the quaternion's callback is dropped
    this.bones = sk.names.map((n) => byName.get(n) ?? null);
    for (const b of this.bones) b?.quaternion._onChange(noop);
    // The bones out of the scene graph, in a root of their own at the figure's origin: three.js walks every object in
    // the scene each frame, shown or not, and 56 joints a man for every crew on the map cost milliseconds. Their
    // matrices are worked out only when the man is posed, and his bone texture filled only then (dirty).
    this.boneRoot = new THREE.Group();
    this.boneRoot.add(this.bones[sk.hips]);
    this.dirty = true;
    this.neck = this.bones[sk.solver[3]];
    this.headB = sk.solver[4];
    this.headless = false;
    const sk3 = skeleton, fneck = m.fig.bones.neck;
    sk3.update = () => {
      // the man whose place the player has taken (crews.js setPlayer scales the figure's neck away, in the frame's
      // camera stage, after this man was posed): his head hidden too, before this very frame is drawn
      const headless = (fneck?.scale.x ?? 1) < 0.5;
      if (headless !== this.headless && this.neck) {
        this.headless = headless;
        this.neck.scale.setScalar(headless ? 0.001 : 1);
        this.boneRoot.updateMatrixWorld(true);
        this.dirty = true;
      }
      if (this.dirty) { THREE.Skeleton.prototype.update.call(sk3); this.dirty = false; }
    };
    // his face: a blend shape on the near body and its skin's colour picture (crew2.json faces, by his number)
    const face = outfit.faces.length ? ((number % outfit.faces.length) + outfit.faces.length) % outfit.faces.length : 0;
    for (const mesh of lods[0]) {
      const f = outfit.faces[face];
      if (f?.shape && mesh.morphTargetDictionary && f.shape in mesh.morphTargetDictionary) mesh.morphTargetInfluences[mesh.morphTargetDictionary[f.shape]] = 1;
      if (mesh.material === outfit.skinMat && outfit.skins[face]) mesh.material = outfit.skins[face];
    }
    this.lod = -1;
    this.setLod(2);
    write(this, sk, this.anim, true); // (the zero pose, the model's relaxed hands: for the warm-up draw)
    this.shown = false;
    this.tick = number; // (far men's frames staggered)
    this.wait = 0; // game time since this far man was last posed
    m.fig.root.add(root);
  }

  setLod(l) {
    if (l === this.lod) return;
    this.lod = l;
    for (let k = 0; k < 3; k++) for (const o of this.lods[k]) o.visible = k === l;
  }

  // The gunner's eyes (world, into out; the Godot game's CrewFigure.Eye): his head's joint as his animator posed him
  // this frame, EYE_AHEAD along fwd (his facing, a world unit vector) and EYE_UP above it. From the animator, not his
  // bones: the player's man has his head scaled away there. False while he is not drawn or not posed. Needs his
  // figure's matrixWorld current (crews.js eye).
  eye(out, fwd) {
    if (!this.root.visible || !this.shown) return false;
    const r = this.m.fig.root;
    this.anim.point(this.headB, _zero, out).applyMatrix4(r.matrixWorld);
    out.addScaledVector(fwd, EYE_AHEAD);
    out.y += EYE_UP * r.scale.y;
    return true;
  }
}

export class Crew2 {
  constructor() {
    this.wanted = crew2Wanted();
    this.loaded = false;
    this.failed = null;
    this._enabled = true;
    this.sk = null; this.clips = null;
    this.outfits = new Map();
    this.men = [];
    this.crews = new Set();
    this.count = 0; // crews dressed so far (each crew's men number from count * 7, as the Godot game's)
    this.promise = null;
    this.progress = 0;
    this.onProgress = null;
    this.last = { ms: 0, full: 0, light: 0, skipped: 0, offscreen: 0, lod: [0, 0, 0] };
    this.win = { frames: 0, ms: 0, worst: 0, full: 0, light: 0, menWorst: 0 };
  }

  get active() { return this.loaded && this._enabled; }
  get enabled() { return this._enabled; }
  set enabled(v) {
    v = !!v;
    if (v === this._enabled) return;
    this._enabled = v;
    for (const c of this.men) {
      c.root.visible = v;
      c.m.fig.mesh.visible = !v;
      c.shown = false;
    }
  }

  // starts loading what these crews wear (only their outfits: a page with the 1917 crews needs three of the six)
  load(crews) {
    if (!this.wanted || this.promise) return this.promise;
    const list = crews.filter((c) => c?.men?.length);
    const want = new Set();
    for (const c of list) for (const m of c.men) if (OUTFITS.has(m.fig?.outfitName)) want.add(m.fig.outfitName);
    if (!want.size) { this.promise = Promise.resolve(false); return this.promise; }
    this.promise = this._load([...want], list).catch((e) => {
      this.failed = e.message;
      console.warn('crew2: the old crew figures are used:', e.message);
      return false;
    });
    return this.promise;
  }

  // resolves once the men are dressed (or loading failed: the old figures stay); onProgress(0..1)
  ready(onProgress) {
    this.onProgress = onProgress ?? null;
    onProgress?.(this.progress);
    return this.promise ?? Promise.resolve(false);
  }

  _step(k) {
    this.progress = Math.max(this.progress, k);
    this.onProgress?.(this.progress);
  }

  // the files (files.js, shared with the menu hangar's parade), every material on the battlefield's fog
  async _load(names, crews) {
    const files = new Crew2Files({ patch: (m) => patchMaterial(m, 'fog') });
    this.outfits = await files.load(names, (k) => this._step(k));
    this.sk = files.sk; this.clips = files.clips;
    const sk = this.sk;
    this.loaded = true;
    for (const c of crews) this.attach(c);
    warmCode(sk, this.clips);
    this._step(1);
    console.info(`crew2: ${sk.count} bones, ${this.clips.clips.size} clips, outfits ${[...this.outfits.keys()].join(' ')}, ${this.men.length} men`);
    return true;
  }

  // the lifelike men for a crew's figures (the outfits that loaded; the others keep their figures)
  attach(crew) {
    if (!this.loaded || this.crews.has(crew) || !crew?.men?.length) return;
    this.crews.add(crew);
    const first = this.count++ * 7;
    crew.men.forEach((m, i) => {
      const outfit = this.outfits.get(m.fig?.outfitName);
      if (!outfit || m.c2) return;
      try {
        const c = new Man2(this, m, outfit, first + i);
        m.c2 = c;
        this.men.push(c);
        c.root.visible = this._enabled;
        m.fig.mesh.visible = !this._enabled;
      } catch (e) {
        console.warn('crew2 man:', e.message);
      }
    });
  }

  begin(cam) {
    if (cam) _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const l = this.last;
    l.ms = 0; l.full = 0; l.light = 0; l.skipped = 0; l.offscreen = 0; l.lod[0] = l.lod[1] = l.lod[2] = 0;
  }

  // One crew after its drill posed its figures this frame: each lifelike man's lod by his distance to the camera, his
  // animator run (in full near, lighter far) and his joints written. piece: the sim's piece (its shot clock), now: the
  // sim's time, dt: the game time since this crew was last updated, level: the crews' detail level (render/guns.js).
  sync(crew, p, now, cam, dt, level) {
    if (!this.active || !this.crews.has(crew)) return;
    const t0 = performance.now(), sk = this.sk, l = this.last;
    const shot = shotClock(p, now);
    const M = crew.rig.root.matrixWorld;
    for (const m of crew.men) {
      const c = m.c2;
      if (!c) continue;
      if (!m.root.visible) { c.shown = false; continue; }
      // the man whose place the player has taken (crews.js setPlayer): posed in full every frame, in sight or not,
      // since the gunner's eye is read from his head (Man2.eye)
      const me = m === crew.player;
      // the lod by his distance, with a margin either side so it does not flicker
      _p.copy(m.root.position).applyMatrix4(M);
      const d = cam ? cam.position.distanceTo(_p) : 0;
      const lod = c.lod === 0 ? (d < LOD0_END + LOD_MARGIN ? 0 : d < LOD1_END ? 1 : 2)
        : c.lod === 1 ? (d < LOD0_END - LOD_MARGIN ? 0 : d < LOD1_END + LOD_MARGIN ? 1 : 2)
          : (d < LOD0_END - LOD_MARGIN ? 0 : d < LOD1_END - LOD_MARGIN ? 1 : 2);
      c.setLod(lod);
      // out of the camera's sight: not posed (his body keeps its last pose under the figure's root, and is taken
      // afresh when he comes back into sight)
      _s.center.set(_p.x, _p.y + 1, _p.z); _s.radius = SIGHT_R;
      if (cam && !me && !_frustum.intersectsSphere(_s)) { c.shown = false; l.offscreen++; continue; }
      l.lod[lod]++;
      // a far man at the near level is posed every second frame (he is a few pixels tall), as is a mid one
      let step = dt;
      const every = me || level < 2 ? 1 : lod === 2 ? FAR_EVERY : lod === 1 && d > FINE_RANGE ? MID_EVERY : 1;
      if (every > 1 && c.shown) {
        c.wait += dt;
        if (++c.tick % every) { l.skipped++; continue; }
        step = c.wait;
      }
      c.wait = 0;
      const hands = me || (level >= 2 && lod < 2), fine = hands && (me || d < FINE_RANGE);
      if (!c.shown) { c.anim.cut(); c.shown = true; }
      const fig = m.fig, a = c.anim;
      a.place(m.root.position.x, m.root.position.y, m.root.position.z, m.root.rotation.y);
      a.update(fig, fig._poseName ?? 'stand', fig._poseT ?? 0, step, hands, fine, shot);
      write(c, sk, a, fine);
      if (hands) l.full++; else l.light++;
    }
    l.ms += performance.now() - t0;
  }

  end() {
    if (!this.active) return;
    const l = this.last, w = this.win;
    if (l.full + l.light + l.skipped + l.offscreen === 0) return;
    w.frames++; w.ms += l.ms; w.worst = Math.max(w.worst, l.ms); w.full += l.full; w.light += l.light; w.menWorst = Math.max(w.menWorst, l.full + l.light);
  }

  // the window's numbers since the last reset: mean and worst ms a frame, men animated a frame (in full, light)
  get stats() {
    const w = this.win, n = Math.max(1, w.frames);
    return { frames: w.frames, meanMs: w.ms / n, worstMs: w.worst, full: w.full / n, light: w.light / n, menWorst: w.menWorst, men: this.men.length, last: { ...this.last, lod: [...this.last.lod] } };
  }

  resetStats() { Object.assign(this.win, { frames: 0, ms: 0, worst: 0, full: 0, light: 0, menWorst: 0 }); }
}

// The animator's code run through every pose behind the loading screen (a scratch man, a few hundred frames with his
// hands on and off), so the browser has compiled it before the battle's first frames ask for it from a hundred men.
function warmCode(sk, clips) {
  const fig = buildCrewman({ outfit: 'german' }), a = new CrewAnimator(sk, clips, 1), at = new THREE.Vector3(0.25, 1.0, -0.45);
  let f = 0;
  for (const pose of CREW_POSES) for (let k = 0; k < 12; k++, f++) {
    fig.pose(pose, k / 12, 1);
    if (k & 1) fig.reach('R', at, 1);
    a.place(0, 0, k * 0.02, 0);
    a.update(fig, pose, k / 12, 1 / 60, k < 9, k < 5, k / 12 - 0.5);
  }
  fig.dispose();
}

// the animator's joints into the man's bones (fine false: the fingers, toes and face are left as they are)
function write(c, sk, a, fine) {
  const local = a.local, bones = c.bones, isFine = sk.fine, hips = sk.hips;
  for (let b = 0; b < bones.length; b++) {
    const bone = bones[b];
    if (!bone || b === hips || (!fine && isFine[b])) continue;
    bone.quaternion.copy(local[b]);
  }
  const hb = bones[hips];
  hb.quaternion.copy(local[hips]);
  hb.position.copy(a.hipsPos);
  for (let i = 0; i < 2; i++) bones[sk.upperArm[i]]?.position.copy(a.armPos[i]);
  c.boneRoot.updateMatrixWorld(true);
  c.dirty = true;
}

// the seconds since the gun's last shot, or minus the seconds to its next while that is nearer (NaN: not known)
function shotClock(p, now) {
  if (!p) return NaN;
  const before = p.state === 'ready' && p.rounds > 0 ? Math.max(0, p.fireAt - now) : Infinity, after = now - p.firedAt;
  const s = before < after ? -before : after;
  return Number.isFinite(s) && Math.abs(s) < 1e6 ? s : NaN;
}

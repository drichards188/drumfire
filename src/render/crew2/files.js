import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CrewSkeleton } from './skeleton.js';
import { ClipTable } from './clips.js';

// The lifelike crewmen's files (public/crew2; the Godot game's Crew2.cs), loaded once for whoever wears them: the
// battle's crews (index.js) and the menu hangar's parade (parade.js). Nothing here touches the battlefield's shader
// patches, so the menu page can load it: the battle hands in `patch` (shaderlib's fog) for every material it wears.
//   const files = new Crew2Files({ patch, pose })   pose: keep only that pose's clips (the parade: 'stand')
//   const outfits = await files.load(names, step)   each outfit once; step(k) 0 to 0.85
//   files.sk, files.clips                           the skeleton (crew2.json) and the clips (clips.json)
// An outfit whose check (crew2_<outfit>.check.json) is not ok or whose model does not stand in crew2.json's zero pose is
// left out (its men keep the old figure); load() throws when none of the names asked can be worn, or a file fails.

export const DIR = `${import.meta.env?.BASE_URL ?? '/'}crew2/`;
export const OUTFITS = new Set(['german', 'german-cap', 'german-drill', 'german44', 'german44-cap', 'german44-gaiters']);
const SPHERE = new THREE.Sphere(new THREE.Vector3(0, 1.05, -0.1), 1.45); // (crew.js's: covers every pose)

const json = async (f) => { const r = await fetch(DIR + f); if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); };

export class Crew2Files {
  constructor({ patch = null, pose = null } = {}) {
    this.patch = patch; this.pose = pose;
    this.sk = null; this.clips = null; this.faces = []; this.skinTex = [];
    this.outfits = new Map(); // name -> its outfit, or null (refused)
    this.pending = new Map(); // name -> the promise of its outfit
    this.shared = new Map(); // textures every outfit has alike (the skin's normals and first colour picture), by name
    this._sk = null; this._extras = null;
  }

  // crew2.json: the skeleton and the faces
  skeleton() {
    return (this._sk ??= json('crew2.json').then((j) => {
      const sk = new CrewSkeleton(j);
      if (!sk.complete) throw new Error('crew2.json lacks solver bones');
      this.faces = Object.values(j.faces ?? {});
      return (this.sk = sk);
    }));
  }

  // clips.json and the faces' skin pictures, once
  extras() {
    return (this._extras ??= this.skeleton().then(async (sk) => {
      const texLoader = new THREE.TextureLoader();
      const skins = Promise.all(this.faces.map((f) => (f.shape ? texLoader.loadAsync(DIR + f.skin).catch(() => null) : Promise.resolve(null))));
      let clips = await json('clips.json');
      if (this.pose) clips = { ...clips, clips: Object.fromEntries(Object.entries(clips.clips ?? {}).filter(([, c]) => c.pose === this.pose)) };
      this.skinTex = await skins;
      this.clips = new ClipTable(clips, sk);
    }));
  }

  // The outfits asked for, each loaded once (step(k): the files' share of the progress, 0 to 0.85): a Map of those that
  // can be worn.
  async load(names, step = () => {}) {
    names = [...new Set(names)].filter((n) => OUTFITS.has(n));
    await this.skeleton();
    const checks = await Promise.all(names.map((n) => (this.pending.has(n) ? true : json(`crew2_${n}.check.json`).then((c) => c?.ok === true).catch(() => false))));
    const ok = names.filter((n, i) => checks[i]);
    if (!ok.length) throw new Error('no outfit has passed its check');
    step(0.05);
    const loader = new GLTFLoader(), more = this.extras(); // (the clips and skins load beside the models)
    more.catch(() => {}); // (awaited below: a failure there fails the load)
    let done = 0;
    const tick = () => step(0.05 + 0.75 * (++done / ok.length));
    for (const n of ok) {
      if (this.pending.has(n)) continue;
      this.pending.set(n, loader.loadAsync(`${DIR}crew2_${n}.glb`).then(async (g) => {
        await more;
        const o = this.prepare(n, g.scene);
        this.outfits.set(n, o);
        return o;
      }));
    }
    const got = await Promise.all(ok.map((n) => this.pending.get(n).then((o) => { tick(); return o; })));
    await more;
    step(0.85);
    const out = new Map();
    ok.forEach((n, i) => { if (got[i]) out.set(n, got[i]); });
    if (!out.size) throw new Error('no outfit stands in crew2.json\'s zero pose');
    return out;
  }

  // An outfit's model made ready to be cloned or baked: checked against crew2.json, the shared skin textures used once,
  // its materials patched (the battle's fog), a skin material per face. null: refused.
  prepare(name, scene) {
    const sk = this.sk, faces = this.faces, skinTex = this.skinTex, shared = this.shared;
    if (!standsInZero(scene, sk)) { console.warn(`crew2: crew2_${name}.glb does not stand in crew2.json's zero pose: the old figures wear it`); return null; }
    let skinMat = null;
    const mats = new Set();
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.boundingSphere = SPHERE.clone(); // (a skinned mesh would otherwise skin every vertex to find its own)
      o.frustumCulled = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        mats.add(m);
        if (/skin/.test(m.name) && /lod0/.test(o.name + (o.parent?.name ?? ''))) skinMat = m;
      }
    });
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) {
        const t = m[k];
        if (!t || !/^skin_(normal|a)$/.test(t.name)) continue;
        const s = shared.get(t.name);
        if (!s) shared.set(t.name, t);
        else if (s !== t) { m[k] = s; t.source?.data?.close?.(); t.dispose(); }
      }
      this.patch?.(m);
    }
    // the faces: face a is the skin as modelled; the others put their own colour picture on a copy of the skin material
    const skins = faces.map((f, i) => {
      if (!skinMat || !skinTex[i]) return skinMat;
      const key = `${name}|${f.skin}`, tex = shared.get(f.skin) ?? skinTex[i];
      if (!shared.has(f.skin)) {
        const base = skinMat.map;
        tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
        if (base) { tex.wrapS = base.wrapS; tex.wrapT = base.wrapT; tex.minFilter = base.minFilter; tex.magFilter = base.magFilter; tex.anisotropy = base.anisotropy; }
        shared.set(f.skin, tex);
      }
      const m = skinMat.clone();
      m.name = key;
      m.map = tex;
      this.patch?.(m);
      return m;
    });
    return { name, scene, skinMat, skins, faces };
  }
}

// The file checked against crew2.json, once: every bone's head and attitude with the zero rotations set (the Godot
// game's CrewFigure.UseLifelike check). A solver bone or a clavicle missing, a head more than 5 mm or a bone more than
// about a degree off: refused.
const _w = new THREE.Vector3(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3();
export function standsInZero(scene, sk) {
  const bones = new Map();
  scene.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const keep = new Map();
  for (let b = 0; b < sk.count; b++) {
    const bone = bones.get(sk.names[b]);
    if (!bone) { if (sk.solverOf[b] >= 0 || b === sk.clavicle[0] || b === sk.clavicle[1]) return false; continue; }
    keep.set(bone, bone.quaternion.clone());
    bone.quaternion.copy(sk.zero[b]);
  }
  scene.updateMatrixWorld(true);
  let far = 0, turned = 0;
  for (let b = 0; b < sk.count; b++) {
    const bone = bones.get(sk.names[b]);
    if (!bone) continue;
    bone.matrixWorld.decompose(_w, _wq, _ws);
    far = Math.max(far, _w.distanceTo(sk.head[b]));
    turned = Math.max(turned, _wq.angleTo(sk.Z[b]));
  }
  for (const [bone, q] of keep) bone.quaternion.copy(q);
  scene.updateMatrixWorld(true);
  return far <= 0.005 && turned <= 0.02;
}

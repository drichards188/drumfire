import * as THREE from 'three';
import { Crew2Files } from './files.js';
import { CrewAnimator } from './animator.js';
import { buildCrewman } from '../../models/v/crew.js';

// The lifelike crewmen on the menu hangar's parade (ui/hangar.js; the Godot game's MenuScene.Man and CrewFigure.Stand):
// the bodies, outfits and faces the guns' crews wear (this folder), each man standing in one of the standing clips
// (clips.json's 'stand' variants, a moment of it by his number, as the battle's animator picks them). They stand still,
// so each pose is worked out once (CrewAnimator over crew.js's 'stand') and baked: every lod mesh skinned on the CPU into
// plain geometry, the face's blend shape in. The men of a parade are instanced, a mesh for each pose, lod and material.
// Before each draw (only when the camera has moved) every man gets the lod his height on screen asks for, the near
// lods capped, and a man outside the view is not drawn; the shadows come from lod1 (or lod2) stand-ins drawn only
// into the shadow map, which the hangar redraws only when the parade or its light changes. Nothing here touches the
// battlefield's shader patches (files.js): the menu's materials stay plain.
//   const c2 = new ParadeCrew2(); await c2.load(names, step)   the outfits (each once); throws: the old figures stay
//   const men = c2.men(list)   list: [outfit, look, x, z, yaw] (look picks his pose and face); a Group to add, with
//                              men.update(camera, renderer) before each draw, men.shadows(on) round a draw that
//                              redraws the shadow map, men.dispose(), men.stats
//   c2.keep(names)             the other outfits' textures off the GPU (three takes them back up when they are used)

// the poses (and faces) an outfit's men stand in: one mesh each a lod, so a few
const VARIANTS = 4;
// lod by a man's height on screen (drawing-buffer pixels): lod0 above LOD0_PX, lod1 above LOD1_PX, else lod2; once in a
// lod he leaves it 10 % past its line (no flicker). At most CAP0 men on lod0 and CAP1 on lod1, the tallest on screen
// first (440 men stand in the Gamma's or the Gustav's parade).
const LOD0_PX = 110, LOD1_PX = 30, GIVE = 0.9, CAP0 = 24, CAP1 = 200;
const HEIGHT = 1.8, MID = 0.9, REACH = 1.05; // a man's height, and the sphere round him that counts as in the view
// the shadow's stand-ins: lod1, or lod2 on a parade of more men than this (its shadow map's texels are a hand wide)
const SHADOW_FINE = 120;
// (a stand-in draws none of its men in the colour pass, only into the shadow map)
function hideInView() { this.userData.k = this.count; this.count = 0; }
function showAgain() { this.count = this.userData.k; }

export class ParadeCrew2 {
  constructor() {
    this.files = new Crew2Files({ pose: 'stand' });
    this.outfits = new Map();
    this.bakes = new Map();
    this.fig = null;
    this.shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  }

  // the outfits these men wear, loaded (each once); resolves to those that can be worn
  async load(names, step) {
    const got = await this.files.load(names, step);
    for (const [n, o] of got) this.outfits.set(n, o);
    return got;
  }

  has(name) { return this.outfits.has(name); }

  // An outfit's pose v baked: the animator's standing pose for man v (his clip variant and his moment of it) on the
  // outfit's own skeleton, every lod mesh skinned into plain geometry, his face's blend shape and skin on lod0.
  // [[{ geo, mat }, ...] for lod0, lod1, lod2]
  bake(outfit, v) {
    const key = `${outfit.name}|${v}`;
    if (this.bakes.has(key)) return this.bakes.get(key);
    const sk = this.files.sk, a = new CrewAnimator(sk, this.files.clips, v);
    const fig = (this.fig ??= buildCrewman({ outfit: 'german' }));
    fig.pose('stand', 0, 1);
    a.update(fig, 'stand', 0, 0, false, true, NaN);
    const scene = outfit.scene, byName = new Map();
    scene.traverse((o) => { if (o.isBone) byName.set(o.name, o); });
    const bones = sk.names.map((n) => byName.get(n) ?? null);
    const keepQ = bones.map((b) => b?.quaternion.clone()), keepP = bones.map((b) => b?.position.clone());
    bones.forEach((b, i) => b?.quaternion.copy(a.local[i]));
    bones[sk.hips].position.copy(a.hipsPos);
    for (let i = 0; i < 2; i++) bones[sk.upperArm[i]]?.position.copy(a.armPos[i]);
    scene.updateMatrixWorld(true);
    const faces = outfit.faces, face = faces.length ? v % faces.length : 0, shape = faces[face]?.shape;
    const lods = [[], [], []];
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      let lod = -1;
      for (let p = o; p && lod < 0; p = p.parent) { const k = /^body_lod(\d)/.exec(p.name); if (k) lod = Number(k[1]); }
      if (lod < 0 || lod > 2) return;
      const morph = lod === 0 && shape && o.morphTargetDictionary && shape in o.morphTargetDictionary ? o.morphTargetDictionary[shape] : -1;
      const mat = lod === 0 && o.material === outfit.skinMat && outfit.skins[face] ? outfit.skins[face] : o.material;
      lods[lod].push({ geo: skinned(o, morph), mat });
    });
    bones.forEach((b, i) => { if (b) { b.quaternion.copy(keepQ[i]); b.position.copy(keepP[i]); } });
    scene.updateMatrixWorld(true);
    // (a file without one of the lods: the nearest it has stands in)
    const any = lods.find((x) => x.length);
    if (!any) throw new Error(`crew2_${outfit.name}.glb has no body_lod meshes`);
    for (let l = 0; l < 3; l++) if (!lods[l].length) lods[l] = l > 0 && lods[l - 1].length ? lods[l - 1] : any;
    this.bakes.set(key, lods);
    return lods;
  }

  // the parade's lifelike men (those whose outfit loaded): a ParadeMen
  men(list) {
    const groups = new Map(), count = new Map();
    for (const m of list) count.set(m[0], (count.get(m[0]) ?? 0) + 1);
    for (const m of list) {
      const outfit = this.outfits.get(m[0]);
      if (!outfit) continue;
      const v = (((m[1] | 0) % VARIANTS) + VARIANTS) % Math.min(VARIANTS, count.get(m[0]));
      const key = `${m[0]}|${v}`;
      if (!groups.has(key)) groups.set(key, { lods: this.bake(outfit, v), men: [] });
      groups.get(key).men.push(m);
    }
    return new ParadeMen([...groups.values()], this.shadowMat, new Set(count.keys()));
  }

  // only these outfits' textures kept on the GPU (a battery of the other war's dress was on parade before)
  keep(names) {
    const used = new Set(), mats = (o) => [...new Set([o.skinMat, ...o.skins, ...matsOf(o.scene)])].filter(Boolean);
    for (const n of names) { const o = this.outfits.get(n); if (o) for (const m of mats(o)) for (const t of texOf(m)) used.add(t); }
    for (const [n, o] of this.outfits) {
      if (names.has(n)) continue;
      for (const m of mats(o)) for (const t of texOf(m)) if (!used.has(t)) t.dispose();
    }
  }
}

const matsOf = (scene) => { const s = []; scene.traverse((o) => { if (o.isSkinnedMesh) s.push(...[o.material].flat()); }); return s; };
const texOf = (m) => ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap'].map((k) => m[k]).filter(Boolean);

// A skinned mesh's vertices and normals as its bones stand now (three's skinning: the bones' matrices times their
// inverses and the bind matrix, weighed), in the model's frame; morph: the blend shape put in at full first (-1: none).
// The uvs and the index are the model's own (shared).
const _m4 = new THREE.Matrix4();
function skinned(mesh, morph) {
  const src = mesh.geometry, pos = src.attributes.position, nor = src.attributes.normal, si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  const { bones, boneInverses } = mesh.skeleton, M = new Float32Array(bones.length * 16);
  for (let i = 0; i < bones.length; i++) _m4.multiplyMatrices(bones[i].matrixWorld, boneInverses[i]).multiply(mesh.bindMatrix).toArray(M, i * 16);
  const d = morph >= 0 ? src.morphAttributes.position?.[morph] ?? null : null, rel = src.morphTargetsRelative;
  const n = pos.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    let x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    if (d) { x = rel ? x + d.getX(v) : d.getX(v); y = rel ? y + d.getY(v) : d.getY(v); z = rel ? z + d.getZ(v) : d.getZ(v); }
    const nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v);
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = k === 0 ? sw.getX(v) : k === 1 ? sw.getY(v) : k === 2 ? sw.getZ(v) : sw.getW(v);
      if (w === 0) continue;
      const o = (k === 0 ? si.getX(v) : k === 1 ? si.getY(v) : k === 2 ? si.getZ(v) : si.getW(v)) * 16;
      px += w * (M[o] * x + M[o + 4] * y + M[o + 8] * z + M[o + 12]);
      py += w * (M[o + 1] * x + M[o + 5] * y + M[o + 9] * z + M[o + 13]);
      pz += w * (M[o + 2] * x + M[o + 6] * y + M[o + 10] * z + M[o + 14]);
      qx += w * (M[o] * nx + M[o + 4] * ny + M[o + 8] * nz);
      qy += w * (M[o + 1] * nx + M[o + 5] * ny + M[o + 9] * nz);
      qz += w * (M[o + 2] * nx + M[o + 6] * ny + M[o + 10] * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
    N[v * 3] = qx / l; N[v * 3 + 1] = qy / l; N[v * 3 + 2] = qz / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  for (const [k, a] of Object.entries(src.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'skinIndex' && k !== 'skinWeight') g.setAttribute(k, a);
  g.setIndex(src.index);
  g.computeBoundingSphere();
  return g;
}

const _f = new THREE.Frustum(), _pm = new THREE.Matrix4(), _s = new THREE.Sphere(), _b = new THREE.Vector2();

// One parade's lifelike men: for every pose group and lod an instanced mesh a material (its two lod0 meshes share their
// matrices), filled with the men of that lod in the view; and the shadow's stand-ins, every man on lod1 (lod2 on a big
// parade), shown only while the shadow map is redrawn and drawn only into it.
class ParadeMen extends THREE.Group {
  constructor(groups, shadowMat, outfits) {
    super();
    this.isParadeMen = true;
    this.name = 'crew2-men';
    this.outfits = outfits;
    const n = groups.reduce((s, g) => s + g.men.length, 0);
    this.n = n;
    this.x = new Float32Array(n); this.z = new Float32Array(n);
    this.lod = new Int8Array(n).fill(-1); this.want = new Int8Array(n);
    this.h = new Float32Array(n); this.hs = new Float32Array(n);
    this.mats = new Float32Array(n * 16);
    this.groups = [];
    this.proxies = [];
    this.key = new Float64Array(33).fill(NaN); // (the camera's matrices and the drawing buffer's height last time)
    this.stats = { men: n, lod: [0, 0, 0], drawn: 0, triangles: 0, calls: 0, updates: 0 };
    const o = new THREE.Object3D();
    let j = 0;
    for (const g of groups) {
      const first = j, k = g.men.length;
      for (const [, , x, z, yaw] of g.men) {
        this.x[j] = x; this.z[j] = z;
        o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); o.updateMatrix();
        o.matrix.toArray(this.mats, j * 16);
        j++;
      }
      const lods = g.lods.map((parts, l) => {
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(k * 16), 16);
        attr.setUsage(THREE.DynamicDrawUsage);
        const meshes = parts.map(({ geo, mat }) => {
          const im = new THREE.InstancedMesh(geo, mat, k);
          im.instanceMatrix = attr;
          im.count = 0; im.visible = false;
          im.frustumCulled = false; // (each man is culled on his own, in update)
          im.castShadow = false; im.receiveShadow = true;
          im.userData.noRay = true; // (the hangar's views look past the men through the stand-ins)
          im.name = `crew2-l${l}`;
          this.add(im);
          return im;
        });
        return { attr, meshes, tris: parts.reduce((s, p) => s + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0) };
      });
      // the shadow's stand-ins: every man of the group
      for (const { geo } of g.lods[n > SHADOW_FINE ? 2 : 1]) {
        const im = new THREE.InstancedMesh(geo, shadowMat, k);
        for (let i = 0; i < k; i++) im.instanceMatrix.array.set(this.mats.subarray((first + i) * 16, (first + i + 1) * 16), i * 16);
        im.castShadow = true; im.receiveShadow = false; im.visible = false; im.frustumCulled = false;
        im.onBeforeRender = hideInView; im.onAfterRender = showAgain;
        im.userData.ray = true;
        im.name = 'crew2-shadow';
        im.computeBoundingSphere();
        this.add(im);
        this.proxies.push(im);
      }
      this.groups.push({ first, k, lods, dirty: true });
    }
  }

  shadows(on) { for (const im of this.proxies) im.visible = on; }

  // every man's lod and whether he is in the view, from the camera (only when it or the drawing buffer changed); the
  // groups whose men changed are filled again
  update(camera, renderer) {
    camera.updateMatrixWorld();
    const hpx = renderer.getDrawingBufferSize(_b).y, e = camera.matrixWorld.elements, p = camera.projectionMatrix.elements, key = this.key;
    let same = key[32] === hpx;
    for (let i = 0; i < 16 && same; i++) same = key[i] === e[i] && key[16 + i] === p[i];
    if (same) return;
    for (let i = 0; i < 16; i++) { key[i] = e[i]; key[16 + i] = p[i]; }
    key[32] = hpx;
    this.stats.updates++;
    _f.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // HEIGHT metres d metres off stand px / d pixels tall
    const px = (HEIGHT * hpx * camera.zoom) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const cp = camera.position, n = this.n, h = this.h, lod = this.lod, want = this.want;
    _s.radius = REACH;
    let c0 = 0, c1 = 0;
    for (let j = 0; j < n; j++) {
      _s.center.set(this.x[j], MID, this.z[j]);
      h[j] = px / Math.max(0.1, _s.center.distanceTo(cp));
      const l = lod[j];
      want[j] = !_f.intersectsSphere(_s) ? -1 : h[j] > LOD0_PX * (l === 0 ? GIVE : 1) ? 0 : h[j] > LOD1_PX * (l === 0 || l === 1 ? GIVE : 1) ? 1 : 2;
      if (want[j] === 0) c0++;
    }
    // the caps: the tallest on screen keep the near lods
    this.cap(0, c0, CAP0);
    for (let j = 0; j < n; j++) if (want[j] === 1) c1++;
    this.cap(1, c1, CAP1);
    const s = this.stats;
    s.lod[0] = s.lod[1] = s.lod[2] = 0; s.drawn = 0; s.triangles = 0; s.calls = 0;
    for (const g of this.groups) {
      for (let j = g.first; j < g.first + g.k; j++) if (want[j] !== lod[j]) { lod[j] = want[j]; g.dirty = true; }
      if (g.dirty) {
        g.dirty = false;
        for (let l = 0; l < g.lods.length; l++) {
          const L = g.lods[l], arr = L.attr.array;
          let c = 0;
          for (let j = g.first; j < g.first + g.k; j++) if (lod[j] === l) { for (let i = 0; i < 16; i++) arr[c * 16 + i] = this.mats[j * 16 + i]; c++; }
          L.attr.needsUpdate = true;
          for (const im of L.meshes) { im.count = c; im.visible = c > 0; }
        }
      }
      for (let l = 0; l < g.lods.length; l++) {
        const L = g.lods[l], c = L.meshes[0]?.count ?? 0;
        s.lod[l] += c; s.drawn += c; s.triangles += c * L.tris; s.calls += c ? L.meshes.length : 0;
      }
    }
  }

  // more than max men want lod l: those shorter on screen than the max-th tallest go a lod further
  cap(l, c, max) {
    if (c <= max) return;
    const { n, h, want, hs } = this;
    let m = 0;
    for (let j = 0; j < n; j++) if (want[j] === l) hs[m++] = h[j];
    const line = hs.subarray(0, m).sort()[m - max];
    for (let j = 0; j < n; j++) if (want[j] === l && h[j] < line) want[j] = l + 1;
  }

  dispose() {
    for (const o of this.children) if (o.isInstancedMesh) o.dispose();
  }
}

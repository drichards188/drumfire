import * as THREE from 'three';
import { CAMO } from '../../kit.js';

// Shared bits of the super-heavy German pieces (gustav.js, karl.js, bertha.js).
//
// Paint: the 1941/42 Dunkelgrau (RAL 7021) of the Gustav and the Karl-Gerät, lifted a little so it reads
// as grey steel and not black under the game's grade. Registered into the kit's CAMO table at import (a
// guarded add, so another module that defines the same name first wins).
CAMO.dgrau ??= { green: [0x4f5456, 0x5c6163, 0x3c4042], seed: 91 }; // Dunkelgrau, mottled and dusty

export const smoothK = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Every mesh a Parts.build() put under `parent` since `from` (the index into parent.children): the
// assembly stages keep these lists to show and lift them.
export const builtSince = (parent, from) => parent.children.slice(from).filter((o) => o.isMesh);

// InstancedMeshes from a template group (one per material of the template), `n` instances, added to parent.
export function instanceOf(template, n, parent, name) {
  const out = [];
  for (const m of template.children) {
    if (!m.isMesh) continue;
    const im = new THREE.InstancedMesh(m.geometry, m.material, n);
    im.name = name;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false; // instances spread far beyond the template's bounding sphere
    parent.add(im);
    out.push(im);
  }
  return out;
}
export function setInstance(list, i, m) {
  for (const im of list) { im.setMatrixAt(i, m); im.instanceMatrix.needsUpdate = true; }
}

// A set of identical wheels at `places` (Vector3s in parent's frame), all turning together about their own x
// axes: one InstancedMesh per material of the template instead of a group of meshes per wheel (the Karl's 22
// road wheels were 88 draw calls, and as many again in the shadow pass). set.turn(a) poses every wheel at
// rotation.x = a, which is what a Group per wheel at that place with that rotation drew.
const _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3(1, 1, 1), _wx = new THREE.Vector3(1, 0, 0);
export function wheelSet(template, places, parent, name) {
  const meshes = [];
  for (const m of template.children) {
    if (!m.isMesh) continue;
    const im = new THREE.InstancedMesh(m.geometry, m.material, places.length);
    im.name = name;
    im.castShadow = im.receiveShadow = true;
    parent.add(im);
    meshes.push(im);
  }
  let last = NaN;
  const turn = (a) => {
    if (a === last) return;
    last = a;
    _wq.setFromAxisAngle(_wx, a);
    for (let i = 0; i < places.length; i++) {
      _wm.compose(places[i], _wq, _ws);
      for (const im of meshes) im.setMatrixAt(i, _wm);
    }
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;
  };
  turn(0);
  // turning in place leaves the bounds where they are: frustum culling stays correct
  for (const im of meshes) im.computeBoundingSphere();
  return { meshes, turn };
}

// The ground-level x of a track of lateral offset xt (in the gun's frame at its own station) at a point z
// along the gun: the track lies on a circle of radius R + xt about (-R, 0, 0). Its heading there (rotation.y)
// keeps a bogie tangent to the curve.
export const curveX = (R, xt, z) => -R + Math.sqrt((R + xt) * (R + xt) - z * z);
export const curveYaw = (R, xt, z) => -Math.asin(z / (R + xt));

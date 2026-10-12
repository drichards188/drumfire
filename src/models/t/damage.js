import * as THREE from 'three';
import { scorchTexture } from './mats.js';

// Damage states for the destroyable bits of a target (k 0 intact to 1 wrecked). A part is a Group
// built from merged meshes; `damageable` gives it setDamage(k) that
//   * blackens its vertex colours toward char (scorched paint, soot, burnt wood),
//   * moves the whole part (sink into the mud, tilt, slide), and
//   * moves named bits of it (a barrel thrown out of its cradle, a wheel off, a roof fallen in)
//     between their intact pose and a wrecked pose over a window of k,
//   * fades in a dark scorch blotch on the ground around it (seen from the air).
// Poses are deltas from the intact pose, so a part can be placed anywhere.

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const charCol = new THREE.Color(0x14110f);
let scorchMat;

/**
 * @param part   the Group to animate (already placed)
 * @param o.at       [x, y, z] to place the part before its home pose is taken (and o.ry its heading)
 * @param o.sink     metres the part sinks at k = 1
 * @param o.tilt     [rx, ry, rz] radians at k = 1
 * @param o.slide    [x, y, z] metres the part moves at k = 1
 * @param o.char     0..1 how black it gets (default 0.85)
 * @param o.scorch   radius of the scorch blotch on the ground (0 = none)
 * @param o.squash   scale at k = 1 along y (a collapsed building), default 1
 * @param o.bits     [{ obj, k0, k1, pos: [x, y, z], rot: [x, y, z], scale }] moved from home by pos/rot over k0..k1
 */
export function damageable(part, o = {}) {
  if (o.at) part.position.set(o.at[0], o.at[1], o.at[2]); // place first: the intact pose is taken from here
  if (o.ry != null) part.rotation.y = o.ry;
  const home = { p: part.position.clone(), r: part.rotation.clone(), s: part.scale.clone() };
  const bits = (o.bits || []).map((b) => ({ ...b, k0: b.k0 ?? 0, k1: b.k1 ?? 1, hp: b.obj.position.clone(), hr: b.obj.rotation.clone(), hs: b.obj.scale.clone() }));
  let colors = null; // [{ attr, orig }]
  let scorch = null;
  const collect = () => {
    colors = [];
    part.traverse((m) => {
      const a = m.isMesh && m.geometry.attributes.color;
      if (a && !colors.some((c) => c.attr === a)) colors.push({ attr: a, orig: a.array.slice() });
    });
  };
  if ((o.scorch ?? 0) > 0) {
    scorchMat ||= new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    scorch = new THREE.Mesh(new THREE.PlaneGeometry(o.scorch * 2, o.scorch * 2).rotateX(-Math.PI / 2), scorchMat.clone());
    scorch.position.y = 0.04 - home.p.y;
    scorch.rotation.y = (part.position.x * 7.3 + part.position.z * 3.1) % 6.28;
    scorch.material.opacity = 0;
    scorch.visible = false;
    scorch.renderOrder = 2;
    part.add(scorch);
    // the blotch must not sink or tilt with the part: counter-act in setDamage
  }
  part.userData.k = 0;
  part.userData.setDamage = (k) => {
    k = Math.min(1, Math.max(0, k));
    part.userData.k = k;
    // whole-part motion eases in so a light hit barely shows
    const e = ss(0, 1, k);
    part.position.set(home.p.x + (o.slide ? o.slide[0] * e : 0), home.p.y - (o.sink || 0) * e + (o.slide ? o.slide[1] * e : 0), home.p.z + (o.slide ? o.slide[2] * e : 0));
    const t = o.tilt || [0, 0, 0];
    part.rotation.set(home.r.x + t[0] * e, home.r.y + t[1] * e, home.r.z + t[2] * e);
    part.scale.set(home.s.x, home.s.y * (1 + ((o.squash ?? 1) - 1) * e), home.s.z);
    for (const b of bits) {
      const f = ss(b.k0, b.k1, k);
      const p = b.pos || [0, 0, 0], r = b.rot || [0, 0, 0];
      b.obj.position.set(b.hp.x + p[0] * f, b.hp.y + p[1] * f, b.hp.z + p[2] * f);
      b.obj.rotation.set(b.hr.x + r[0] * f, b.hr.y + r[1] * f, b.hr.z + r[2] * f);
      if (b.scale != null) b.obj.scale.copy(b.hs).multiplyScalar(1 + (b.scale - 1) * f);
    }
    if (!colors) collect();
    const c = (o.char ?? 0.85) * ss(0.05, 0.8, k);
    for (const { attr, orig } of colors) {
      const a = attr.array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] = orig[i] + (charCol.r - orig[i]) * c;
        a[i + 1] = orig[i + 1] + (charCol.g - orig[i + 1]) * c;
        a[i + 2] = orig[i + 2] + (charCol.b - orig[i + 2]) * c;
      }
      attr.needsUpdate = true;
    }
    if (scorch) {
      scorch.visible = k > 0.05;
      scorch.material.opacity = Math.min(1, ss(0.05, 0.7, k) * 1.2);
      // undo the part's own transform for the blotch so it lies flat on the ground
      scorch.position.set(0, 0.04 - home.p.y + (o.sink || 0) * e, 0);
      scorch.rotation.set(-part.rotation.x + home.r.x, 0, -part.rotation.z + home.r.z);
    }
  };
  return part;
}

/**
 * Wraps built parts into the target object the render layer uses.
 * { root, parts, setDamage(i, k), anchors: { burn: [Object3D per part, a point inside it for fire and
 * smoke], top: [Object3D per part, its highest point], center }, ...extra }
 */
export function finishTarget(root, parts, extra = {}) {
  root.updateMatrixWorld(true);
  const burn = [], top = [], b = new THREE.Box3(), c = new THREE.Vector3();
  for (const p of parts) {
    b.setFromObject(p);
    b.getCenter(c);
    p.worldToLocal(c);
    const n = new THREE.Object3D();
    n.position.copy(c);
    p.add(n);
    burn.push(n);
    const t = new THREE.Object3D();
    p.worldToLocal(c.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2));
    t.position.copy(c);
    p.add(t);
    top.push(t);
  }
  const center = new THREE.Object3D();
  root.add(center);
  root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    root, parts, anchors: { burn, top, center }, ...extra,
    setDamage: (i, k) => parts[i]?.userData.setDamage?.(k),
  };
}

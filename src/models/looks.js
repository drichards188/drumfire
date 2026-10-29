import * as THREE from 'three';
import { CAMO, vehicleMats } from './kit.js';
import { GUNS } from '../sim/tables.js';

// The look a battery's upgrades give its guns (research.js PARTS), on the gun itself:
//   camo   >= 1  a disruptive paint scheme for the era in place of the gun's own (rig.mats camo and paint swapped): in
//                the menu's hangar (ui/hangar.js) and in battle (main.js dresses the lineup's rigs as it builds them)
// and, on parade only (the hangar: `parade`), the gun as an inspection finds a well kept one:
//   barrel >= 3  a canvas cover on the muzzle, its strap round the barrel
//   breech >= 3  the breech opened, its block and mechanism bright oiled steel (and the round on the loading tray,
//                on the guns that have one)
// The muzzle cover finds the barrel's radius by casting rays at it from outside, so it fits any model. Game marks, not
// ordnance practice. applyLook(rig, kind, era, levels, { parade }) is idempotent per rig (a second call does nothing).

// the paint schemes the camouflage upgrade gives, by era: the first that is not the gun's own
CAMO.upgreen ??= { green: [0x4e5733, 0x9a8858, 0x3a2c22], disruptive: true, seed: 107 }; // olive with sand and brown patches
const SCHEMES = { '1917': ['earth', 'railcamo'], ww1: ['bunt', 'earth'], ww2: ['upgreen', 'dgelb'] };
export const camoScheme = (era, base) => (SCHEMES[era] ?? SCHEMES['1917']).find((s) => s !== base && CAMO[s]) ?? null;

// canvas by era (the British khaki duck, the German field grey), the strap, and the oiled steel of a cared-for breech
const CANVAS = { '1917': 0x7f7658, ww1: 0x6e6d5c, ww2: 0x6a6b5a };
const mat = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const canvasMat = Object.fromEntries(Object.entries(CANVAS).map(([e, c]) => [e, mat(c, 0.95, 0)]));
const strap = mat(0x3b2c1e, 0.7, 0);
const oiled = mat(0x7b8086, 0.3, 0.85);

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _o = new THREE.Vector3();
const ray = new THREE.Raycaster();

// the barrel's outer radius at `back` metres behind an anchor on the bore axis (its -Z is the bore), by rays cast
// inward from 3 m out against the meshes under `within`; null when nothing is hit
function radiusAt(anchor, within, back) {
  within.updateMatrixWorld(true);
  anchor.getWorldPosition(_p);
  anchor.getWorldQuaternion(_q);
  _d.set(0, 0, 1).applyQuaternion(_q);
  _p.addScaledVector(_d, back);
  const meshes = [];
  within.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
  const rs = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    _a.set(Math.cos(a), Math.sin(a), 0).applyQuaternion(_q);
    _o.copy(_p).addScaledVector(_a, 3);
    ray.set(_o, _a.clone().negate());
    ray.far = 3;
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) rs.push(3 - hit.distance);
  }
  if (rs.length < 4) return null;
  rs.sort((x, y) => x - y);
  return rs[Math.floor(rs.length / 2)];
}

// the canvas cover over a muzzle: a cap a little longer than the barrel is wide, its face domed, a strap round it.
// `r` given (a rocket launcher's tubes, packed too close for the rays): the tube's radius
function muzzleCover(rig, era, rb, anchor = rig.anchors.muzzle, r = null) {
  const tube = rig.pivots?.recoil ?? rig.pivots?.elevation ?? rig.root;
  // the barrel just behind the muzzle, within reason of the bore (a ray may catch a muzzle brake or a cradle)
  r ??= Math.min(rb * 2.6, Math.max(rb * 1.15, radiusAt(anchor, tube, 0.05) ?? rb * 1.6)) * 1.05 + 0.006;
  const len = Math.max(0.16, r * 1.7), m = canvasMat[era] ?? canvasMat['1917'];
  const g = new THREE.Group();
  g.name = 'look-muzzle-cover';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, len, 28, 1, true).rotateX(Math.PI / 2), m);
  body.position.z = len / 2 - 0.03; // from just ahead of the face, back over the barrel
  const face = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.22), m);
  face.position.z = -0.03;
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, Math.max(0.008, r * 0.06), 6, 28), strap);
  band.position.z = len * 0.62;
  g.add(body, face, band);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  anchor.add(g);
}

// the breech opened for inspection: its block and mechanism (the steel under the breech pivot) bright and oiled
function breechOpen(rig) {
  const b = rig.pivots?.breech;
  if (b) {
    const steels = new Set([rig.mats?.steel, rig.mats?.dark].filter(Boolean));
    b.traverse((o) => { if (o.isMesh && steels.has(o.material)) o.material = oiled; });
  }
  rig.setBreech?.(1);
  if (rig.props?.tray) rig.setShell?.('tray', true);
  rig.update?.(0);
}

// the launch sites, whose `muzzle` anchor is the missile's nose, not a barrel's mouth
const NO_BARREL = new Set(['v1', 'v2']);

export function applyLook(rig, kind, era, levels = {}, { parade = false } = {}) {
  if (!rig?.root || rig.looked) return;
  rig.looked = true;
  const lv = (k) => levels?.[k] ?? 0;
  // the camouflage: the era's disruptive scheme on every painted part
  if (lv('camo') >= 1 && rig.mats?.camo) {
    const scheme = camoScheme(era, rig.scheme);
    if (scheme) {
      const to = vehicleMats(scheme), from = rig.mats;
      rig.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material === from.camo) o.material = to.camo;
        else if (o.material === from.paint) o.material = to.paint;
      });
    }
  }
  if (!parade || NO_BARREL.has(kind)) return;
  const rb = ((GUNS[kind]?.calibre ?? 6) * 0.0254) / 2; // the bore's radius, from the calibre in inches
  // a cover on every tube of a launcher (its muzzles), else on the barrel's muzzle
  if (lv('barrel') >= 3 && rig.anchors?.muzzles?.length > 1) for (const a of rig.anchors.muzzles) muzzleCover(rig, era, rb, a, rb * 1.3);
  else if (lv('barrel') >= 3 && rig.anchors?.muzzle) muzzleCover(rig, era, rb);
  if (lv('breech') >= 3) breechOpen(rig);
}

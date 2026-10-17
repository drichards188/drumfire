import * as THREE from 'three';
import { V, box, rbox, xTube, zTube, rod, sideProfile, gearArc } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addHandwheel, trayShells, crew, L90, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { discWheel, trailLeg, panoramicSight, slidingBlock, barrel, makeStrut, setStrut } from './common.js';

/**
 * 15 cm schwere Feldhaubitze 18: the long L/29.5 barrel (4.44 m) on a deep cradle with the buffer and the
 * recuperator under it, the two big spring equilibrators standing up in front of the top carriage, the
 * horizontal sliding block, no shield, the split box trails (spread 64 degrees) with big spades, the pressed
 * steel disc wheels with solid rubber tyres. 5,512 kg in action, about 7.85 m long, 2.25 m wide.
 * Elevation -3 to +45 degrees, traverse 64.
 *
 * Rig as lefh18.js: origin on the ground under the axle centre, front -Z; `traverse` the top carriage, `elevation`
 * at the trunnions, `recoil` the barrel, `breech` the sliding block (+X). The equilibrators follow the elevation
 * (rig.setElevation and rig.update keep them spanning carriage to cradle).
 * buildSFH18({ scheme: 'dgelb' | 'feldgrau' })
 */
const TR = { y: 1.42, z: 0.42 };
const MZ = -3.36, BR = 1.08, RING0 = 0.62;

export function buildSFH18({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---- lower carriage, wheels and trails
  const L = rig.part();
  const WR = 0.72, WX = 0.96;
  for (const s of [-1, 1]) discWheel(L, s * WX, WR, { R: WR, tw: 0.17, holes: 10, side: s, hub: 0.15, rubber: 0.09 });
  L.add('dark', xTube(-WX + 0.08, WX - 0.08, 0.07, 0.07, 12, WR, 0));
  L.add('camo', rbox(0.7, 0.28, 0.7, 0.04, 0, 0.66, 0.2));
  for (const s of [-1, 1]) {
    L.add('camo', box(0.16, 0.24, 0.36, s * 0.28, 0.62, 0.52));
  }
  const TL = 4.4, SP = 32 * Math.PI / 180;
  for (const s of [-1, 1]) {
    const a = V(s * 0.28, 0.62, 0.6), b = V(s * (0.28 + TL * Math.sin(SP)), 0.24, 0.6 + TL * Math.cos(SP));
    trailLeg(L, a, b, { w0: 0.24, h0: 0.34, w1: 0.17, h1: 0.2, spade: [0.52, 0.48] });
  }
  L.build(root, { dirt: 0.55 });

  // ---- top carriage
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const cheek = [[-0.62, 0.74], [-0.42, 1.12], [0.12, 1.56], [0.72, 1.56], [0.9, 1.1], [0.86, 0.74]];
  for (const s of [-1, 1]) T.add('camo', sideProfile(cheek, 0.035).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.27, 0, 0)));
  T.add('camo', box(0.58, 0.08, 1.5, 0, 0.78, 0.12));
  T.add('camo', box(0.58, 0.24, 0.08, 0, 0.8, -0.52)); // front transom carrying the equilibrator pivots
  for (const s of [-1, 1]) {
    T.add('steel', xTube(s * 0.25, s * 0.33, 0.08, 0.08, 12, TR.y, TR.z));
    T.add('dark', xTube(s * 0.29, s * 0.42, 0.05, 0.05, 10, 0.74, -0.52)); // equilibrator lower pivots
  }
  addHandwheel(T, -0.4, 1.1, 0.7, 0.14, -1);
  addHandwheel(T, -0.4, 0.92, 0.25, 0.12, -1);
  T.add('steel', rod(V(-0.28, 1.1, 0.7), V(-0.4, 1.1, 0.7), 0.014, 5));
  T.add('camo', box(0.32, 0.03, 0.26, -0.55, 0.86, 0.95)); // layer's step
  T.build(trav, { dirt: 0.5 });

  // ---- cradle
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  E.add('camo', rbox(0.34, 0.2, 2.3, 0.05, 0, -0.25, -0.6)); // the cradle under the barrel, its two cylinders inside
  E.add('dark', box(0.35, 0.02, 2.3, 0, -0.15, -0.6));
  for (const s of [-1, 1]) E.add('camo', box(0.04, 0.16, 2.3, s * 0.16, -0.08, -0.6)); // guides
  for (const x of [-0.08, 0.08]) {
    E.add('camo', zTube(-1.9, -1.75, 0.075, 0.075, 12, x, -0.27)); // cylinder front heads
    E.add('dark', zTube(-1.96, -1.9, 0.05, 0.05, 10, x, -0.27));
  }
  E.add('camo', zTube(-1.8, -1.66, 0.165, 0.165, 18)); // front guide band
  E.add('camo', box(0.3, 0.2, 0.12, 0, -0.12, -1.73));
  for (const s of [-1, 1]) {
    E.add('steel', xTube(s * 0.17, s * 0.25, 0.07, 0.07, 12));
    E.add('camo', box(0.1, 0.12, 0.14, s * 0.24, -0.12, -1.15)); // equilibrator upper lugs
  }
  E.add('camo', gearArc(0.5, 0.68, 0.25, 1.2, 0.04, 16, 0.025).translate(-0.2, 0, 0.0));
  E.add('steel', rod(V(-0.16, 0.0, 0.25), V(-0.36, 0.16, 0.28), 0.018, 6));
  panoramicSight(E, -0.36, 0.16, 0.28, -1);
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---- barrel
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', barrel([[MZ, 0], [MZ, 0.1], [MZ + 0.08, 0.104], [MZ + 0.08, 0.099], [-1.6, 0.112], [-1.2, 0.118], [-1.2, 0.138], [0.2, 0.15], [RING0, 0.152], [RING0, 0.0001]]));
  B.add('char', new THREE.CircleGeometry(0.075, 16).rotateY(Math.PI).translate(0, 0, MZ - 0.001));
  const rl = BR - RING0, rz = (RING0 + BR) / 2;
  B.add('camo', box(0.42, 0.1, rl, 0, 0.16, rz));
  B.add('camo', box(0.42, 0.1, rl, 0, -0.16, rz));
  B.add('camo', box(0.1, 0.42, rl, -0.16, 0, rz));
  B.add('camo', box(0.42, 0.42, 0.14, 0, 0, RING0 + 0.07));
  B.add('dark', box(0.22, 0.1, 0.24, 0, -0.26, 0.5)); // piston rod lug
  for (const x of [-0.08, 0.08]) B.add('steel', zTube(-1.6, 0.5, 0.028, 0.028, 8, x, -0.27));
  B.add('steel', rod(V(0.21, 0.18, 0.8), V(0.27, 0.27, 1.0), 0.014, 5));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  K.add('camo', box(0.34, 0.22, rl - 0.02, 0, 0, 0));
  K.add('char', new THREE.CircleGeometry(0.078, 16).translate(0, 0, rl / 2 - 0.009));
  K.add('dark', box(0.05, 0.05, 0.14, 0.14, 0.12, 0.05));
  K.add('steel', rod(V(0.14, 0.13, 0.12), V(0.24, 0.24, 0.34), 0.016, 5));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.34);

  // ---- equilibrators: carriage pivot (traverse frame) to the cradle lug (elevation frame)
  const eqMat = { outer: rig.mats.camo, inner: rig.mats.steel };
  const struts = [-1, 1].map((s) => ({ st: makeStrut(trav, eqMat, 0.1, 0.045), a: new THREE.Vector3(s * 0.36, 0.74, -0.52), lug: new THREE.Vector3(s * 0.32, -0.12, -1.15), b: new THREE.Vector3() }));
  const placeStruts = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of struts) {
      q.b.set(q.lug.x, el.position.y + q.lug.y * c - q.lug.z * sn, el.position.z + q.lug.y * sn + q.lug.z * c);
      setStrut(q.st, q.a, q.b, 0.6, 0.62);
    }
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeStruts(); };
  rig.update = () => placeStruts();
  placeStruts();

  rig.anchors.eye = node(trav, 'eye', 0, 1.9, 0.9);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  const sh = buildShell('sfh18');
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 2.3, 0.1, 2.9);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), BR + 0.06), 'sfh18');
  rig.recoilLength = 1.3;
  rig.loadEl = 4 * Math.PI / 180;
  floorFade(rig, TR.y, BR + 0.04, 0.3, 0.1, 0.3);
  rig.slideMats = ['camo', 'steel', 'char'];

  crew(rig, 'officer', -2.7, 2.2, L90, 'point');
  crew(rig, 'layer', -0.95, 1.0, L90, 'lay');
  crew(rig, 'sight', 0.95, 0.9, R90, 'lay');
  crew(rig, 'loader', 0.65, 2.15, 0, 'ram');
  crew(rig, 'rammer', -0.55, 2.6, 0, 'ram');
  crew(rig, 'shell', 1.55, 2.9, R90, 'carry');
  crew(rig, 'cartridge', 1.4, 3.7, R90, 'carry');
  crew(rig, 'lanyard', 1.2, 1.7, R90, 'lanyard');

  hb(rig, -1.2, 0, -3.4, 1.2, 1.9, 1.0);
  hb(rig, -2.6, 0, 0.5, 2.6, 0.7, 4.4);
  return finishRig(rig, 'sfh18', 'sfh18');
}

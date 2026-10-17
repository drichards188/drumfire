import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, frontProfile, sideProfile, xf, tyreGeometry } from '../../kit.js';
import { makeRig, node, pivotAt, trailBeam, addHandwheel, addDialSight, breechSetter } from '../fieldkit.js';
import { OD } from './allied_kit.js';

// The two British field pieces the German batteries hunt in Flanders 1944, as small gun rigs (the
// fieldkit pattern: traverse, elevation, recoil and breech pivots, anchors.muzzle) so a target
// battery can recoil and flash when the sim fires it (render/targets.js reads model.rigs).
//   build25pdr()  Ordnance QF 25-pounder Mk II on Carriage Mk I: the round firing platform under the
//                 wheels, the flat shield with its central slot, box trail, the double-baffle muzzle brake
//   build55in()   BL 5.5-inch Mk III: the long barrel, split trail with spades, the two tall spring
//                 equilibrator towers either side of the cradle, big single wheels
// Sizes from the published dimensions (25-pdr 4.6 m long in action, 1.16 m to the axis of the bore at
// zero, 2.13 m wide; 5.5-inch barrel 4.19 m, about 7.6 m overall, 2.6 m high), olive drab paint.

const tyre = (P, x, y, z, R, W, s) => {
  P.add('tyre', tyreGeometry(R, W, 18, 30).applyMatrix4(xf(x, y, z)));
  P.add('rim', xTube(x - W * 0.42, x + W * 0.42, R * 0.6, R * 0.6, 16, y, z));
  P.add('dark', xTube(x + s * W * 0.42, x + s * (W * 0.5 + 0.06), R * 0.2, R * 0.16, 10, y, z));
};

function finish(rig, kind) {
  rig.kind = kind;
  rig.anchors.muzzles = [rig.anchors.muzzle];
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  delete rig.P;
  delete rig.part;
  return rig;
}

export function build25pdr() {
  const rig = makeRig(OD), { root } = rig;
  // the firing platform: a steel disc 2.5 m across with ribs, the gun is run up onto it and turns on it
  const F = rig.part();
  F.add('dark', yTube(0, 0.05, 1.25, 1.25, 28));
  F.add('dark', new THREE.TorusGeometry(1.24, 0.03, 4, 28).rotateX(Math.PI / 2).translate(0, 0.05, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; F.add('dark', box(0.05, 0.04, 1.15, Math.sin(a) * 0.6, 0.06, Math.cos(a) * 0.6, 0, a, 0)); }
  F.build(root, { dirt: 0.8 });
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const P = rig.part();
  const WR = 0.48, AY = 0.05 + WR, WX = 0.88;
  for (const s of [-1, 1]) tyre(P, s * WX, AY, 0, WR, 0.24, s);
  P.add('dark', xTube(-WX, WX, 0.05, 0.05, 10, AY, 0));
  // saddle and the box trail running back to the spade
  P.add('camo', box(0.58, 0.32, 0.8, 0, AY + 0.22, 0.05));
  for (const s of [-1, 1]) P.add('camo', sideProfile([[-0.25, AY + 0.1], [-0.05, 1.0], [0.3, 1.0], [0.45, AY + 0.1]], 0.04).applyMatrix4(xf(s * 0.24, 0, 0)));
  trailBeam(P, 'camo', [{ z: 0.3, y: AY + 0.12, w: 0.56, h: 0.32 }, { z: 1.8, y: 0.42, w: 0.46, h: 0.26 }, { z: 3.25, y: 0.16, w: 0.34, h: 0.18 }]);
  P.add('camo', box(0.62, 0.36, 0.04, 0, 0.1, 3.36, -0.35));
  P.add('dark', new THREE.TorusGeometry(0.07, 0.018, 6, 12).rotateX(Math.PI / 2).translate(0, 0.27, 3.45));
  for (const s of [-1, 1]) P.add('steel', rod(V(s * 0.2, 0.36, 2.8), V(s * 0.45, 0.36, 2.8), 0.02, 5)); // handspikes
  // the shield: flat plate with the central slot for the barrel, chamfered top corners, bent-back wings, lower apron
  const sh = [[-0.85, 0.66], [0.85, 0.66], [0.85, 1.32], [0.62, 1.56], [0.15, 1.56], [0.15, 0.86], [-0.15, 0.86], [-0.15, 1.56], [-0.62, 1.56], [-0.85, 1.32]];
  P.add('camo', frontProfile(sh, -0.44, -0.42));
  for (const s of [-1, 1]) P.add('camo', box(0.02, 0.62, 0.32, s * 0.9, 1.0, -0.3, 0, s * 0.35, 0));
  P.add('camo', box(1.3, 0.32, 0.02, 0, 0.45, -0.38, 0.15));
  for (const s of [-1, 1]) P.add('steel', rod(V(s * 0.25, AY + 0.3, 0), V(s * 0.6, 1.2, -0.41), 0.016, 5));
  addHandwheel(P, -0.36, AY + 0.35, 0.45, 0.11, -1);
  addHandwheel(P, 0.36, AY + 0.3, 0.4, 0.1, 1);
  P.build(trav, { dirt: 0.55 });

  const TY = 1.0, TZ = 0.15;
  const el = pivotAt(rig, trav, 'elevation', 0, TY, TZ);
  const E = rig.part();
  E.add('camo', box(0.3, 0.2, 1.6, 0, -0.16, -0.3));
  E.add('camo', zTube(-1.15, 0.45, 0.075, 0.075, 12, 0, -0.27)); // buffer and recuperator
  E.add('steel', zTube(-1.22, -1.15, 0.05, 0.05, 8, 0, -0.27));
  E.add('camo', zTube(-0.6, 0.35, 0.1, 0.1, 14, 0, 0)); // cradle sleeve
  E.add('steel', rod(V(-0.17, 0.05, 0.25), V(-0.32, 0.3, 0.25), 0.014, 5));
  addDialSight(E, -0.32, 0.3, 0.25);
  E.build(el, { dirt: 0.25, y0: TY });
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', zTube(-1.75, -0.55, 0.055, 0.068, 16));
  B.add('camo', zTube(-0.55, 0.45, 0.085, 0.085, 16));
  B.add('dark', zTube(-2.02, -1.76, 0.085, 0.085, 14)); // double-baffle muzzle brake
  B.add('char', box(0.18, 0.08, 0.05, 0, 0, -1.94));
  B.add('char', box(0.18, 0.08, 0.05, 0, 0, -1.84));
  B.add('camo', rbox(0.28, 0.3, 0.34, 0.03, 0, 0, 0.6));
  B.add('char', new THREE.CircleGeometry(0.045, 10).translate(0, 0, 0.772));
  B.build(rc, { dirt: 0.15, y0: TY });
  const br = pivotAt(rig, rc, 'breech', 0.15, 0, 0.78);
  const K = rig.part();
  K.add('dark', box(0.12, 0.05, 0.05, -0.08, -0.08, 0.02));
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.2);

  rig.anchors.eye = node(trav, 'eye', 0, 1.7, 1.2);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, -2.04);
  rig.anchors.breech = node(el, 'breech', 0, 0, 0.8);
  rig.recoilLength = 0.75;
  rig.loadEl = 0.05;
  return finish(rig, 'q25');
}

export function build55in() {
  const rig = makeRig(OD), { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const P = rig.part();
  const WR = 0.64, WX = 1.06;
  for (const s of [-1, 1]) tyre(P, s * WX, WR, 0, WR, 0.36, s);
  P.add('dark', xTube(-WX, WX, 0.07, 0.07, 10, WR, 0));
  // axle tree, top carriage and the cheeks carrying the trunnions
  P.add('camo', box(1.6, 0.22, 0.4, 0, WR + 0.08, 0));
  P.add('camo', box(0.86, 0.3, 1.1, 0, WR + 0.3, 0.25));
  const TY = 1.48, TZ = 0.45;
  for (const s of [-1, 1]) P.add('camo', sideProfile([[-0.45, WR + 0.4], [-0.15, TY + 0.15], [0.7, TY + 0.15], [0.85, WR + 0.4]], 0.05).applyMatrix4(xf(s * 0.4, 0, 0)));
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.38, s * 0.5, 0.08, 0.08, 12, TY, TZ));
  // split trail: two box legs opening to 3 m, with spades and the trail ends' handspikes
  for (const s of [-1, 1]) {
    const a = V(s * 0.32, WR + 0.25, 0.5), b = V(s * 1.45, 0.2, 4.3);
    P.add('camo', rod(a, b, 0.17, 4).applyMatrix4(new THREE.Matrix4()));
    P.add('camo', box(0.66, 0.5, 0.05, s * 1.5, 0.2, 4.45, -0.35, s * -0.25, 0));
    P.add('dark', rod(V(s * 1.25, 0.3, 4.2), V(s * 1.75, 0.3, 4.1), 0.025, 5));
  }
  // the two tall spring equilibrator towers either side of the cradle, ahead of the trunnions
  for (const s of [-1, 1]) {
    P.add('camo', yTube(WR + 0.35, 2.35, 0.13, 0.12, 14, s * 0.5, -0.2));
    P.add('dark', yTube(2.35, 2.42, 0.1, 0.08, 10, s * 0.5, -0.2));
    P.add('camo', yTube(WR + 0.3, WR + 0.45, 0.18, 0.18, 12, s * 0.5, -0.2));
    P.add('dark', rod(V(s * 0.5, 2.38, -0.2), V(s * 0.24, 1.82, -0.45), 0.04, 6));
  }
  // a small shield either side of the cradle slot, the elevating and traversing handwheels
  for (const s of [-1, 1]) P.add('camo', box(0.72, 1.0, 0.02, s * 0.62, 1.45, -0.62, -0.06));
  addHandwheel(P, -0.5, 1.2, 0.8, 0.14, -1);
  addHandwheel(P, 0.5, 1.1, 0.8, 0.13, 1);
  P.build(trav, { dirt: 0.55 });

  const el = pivotAt(rig, trav, 'elevation', 0, TY, TZ);
  const E = rig.part();
  E.add('camo', box(0.46, 0.28, 2.6, 0, -0.24, -0.5));
  for (const s of [-1, 1]) E.add('camo', zTube(-1.75, 0.65, 0.085, 0.085, 12, s * 0.13, -0.32));
  E.add('camo', zTube(-1.0, 0.6, 0.19, 0.19, 16));
  E.add('steel', rod(V(-0.2, 0.05, 0.4), V(-0.42, 0.45, 0.4), 0.016, 5));
  addDialSight(E, -0.42, 0.45, 0.4);
  E.build(el, { dirt: 0.25, y0: TY });
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', zTube(-3.75, -1.6, 0.088, 0.112, 18));
  B.add('camo', zTube(-1.6, 0.75, 0.15, 0.15, 18));
  B.add('camo', zTube(-3.78, -3.7, 0.098, 0.098, 18));
  B.add('camo', rbox(0.42, 0.42, 0.42, 0.04, 0, 0, 0.92));
  B.add('char', new THREE.CircleGeometry(0.07, 12).translate(0, 0, 1.135));
  B.build(rc, { dirt: 0.15, y0: TY });
  const br = pivotAt(rig, rc, 'breech', 0.22, 0, 1.14);
  const K = rig.part();
  K.add('dark', zTube(0, 0.08, 0.17, 0.17, 14, -0.22, 0));
  K.add('steel', box(0.04, 0.3, 0.04, 0, 0, 0.1));
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.8);

  rig.anchors.eye = node(trav, 'eye', 0, 2.0, 1.8);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, -3.8);
  rig.anchors.breech = node(el, 'breech', 0, 0, 1.15);
  rig.recoilLength = 1.0;
  rig.loadEl = 0.05;
  return finish(rig, 'm55');
}

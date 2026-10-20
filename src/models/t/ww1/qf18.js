import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, xf } from '../../kit.js';
import { FParts } from '../mats.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, addHandwheel, addDialSight, breechSetter, crew, L90, R90 } from '../fieldkit.js';

// The Ordnance QF 18-pounder Mk II on the Mk II carriage, the British field gun of 1917-18, at target quality but
// true in silhouette (refs/british18pdr: the IWM, Halifax and SANMMH Mk II guns, the Third Ypres photographs):
// two 4 ft 8 in wooden wheels with twelve spokes outside a 3/16 in steel shield with a window for the cradle and a
// top plate folded back, the lower apron hanging below the axle, the single pole trail with its spade, handspike and
// trail eye; the long hydro-pneumatic recuperator ABOVE the barrel with its box-shaped oil reservoir at the front,
// the 84 mm barrel below it running a hand-span past the recuperator's head; elevation -5 to +16 degrees, 4.5
// degrees of traverse each way, 41 in of recoil. The carriage limber and the ammunition wagon (whose armoured
// door is the gunners' shield when it stands unlimbered beside the gun) are FParts builders for the battery.
// Model space as everywhere: front -Z, ground y = 0, metres; the axle at z = 0.
//
//   buildQF18()             a rig (DESIGN.md "Models"): pivots traverse elevation recoil breech, anchors eye muzzle
//                           breech tray shellStack crew[], setRecoil/setElevation/setTraverse, recoilLength 1.04
//   limber18(P, x, z, ry)   the carriage limber (24 rounds in its box, pole forward)
//   wagonBody18(P, x, z, ry, { door })  the ammunition wagon body unlimbered, its perch resting on a block, the
//                           armoured door raised over the open rear (door 0 shut .. 1 up)

export const QF18 = {
  WR: 0.71, WX: 0.8, tw: 0.085, trY: 1.02, trZ: -0.06, // wheels (track 1.6 m), trunnions
  muzzle: -1.82, breech: 0.56, recup: { y: 0.21, r: 0.1, z0: -1.28, z1: 0.32 },
  shield: { hw: 0.68, y0: 0.74, y1: 1.5, z: -0.4, top: 0.5, lean: 0.62 },
  trail: { z0: 0.18, z1: 3.25, y0: 0.62, y1: 0.2 },
};

// the main shield: a plate with the window the cradle elevates in and the layer's sighting slot, extruded 8 mm
function shieldPlate() {
  const S = QF18.shield, w = S.hw, s = new THREE.Shape();
  s.moveTo(-w, S.y0); s.lineTo(w, S.y0); s.lineTo(w, S.y1); s.lineTo(-w, S.y1); s.lineTo(-w, S.y0);
  const hole = new THREE.Path(), hx = 0.17, hy0 = QF18.trY - 0.2, hy1 = QF18.trY + 0.36;
  hole.moveTo(-hx, hy0); hole.lineTo(hx, hy0); hole.lineTo(hx, hy1); hole.lineTo(-hx, hy1); hole.lineTo(-hx, hy0);
  const slot = new THREE.Path(), sx = -0.42, sy = 1.3;
  slot.moveTo(sx - 0.07, sy); slot.lineTo(sx + 0.07, sy); slot.lineTo(sx + 0.07, sy + 0.08); slot.lineTo(sx - 0.07, sy + 0.08); slot.lineTo(sx - 0.07, sy);
  s.holes.push(hole, slot);
  return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }).translate(0, 0, -0.004);
}

export function buildQF18({ scheme = 'earth' } = {}) {
  const S = QF18, rig = makeRig(scheme), { root } = rig;
  // the carriage: wheels and axle stay put, everything above the axle traverses on it (4.5 degrees each way)
  const W = rig.part();
  for (const s of [-1, 1]) addWheel(W, s * S.WX, S.WR, { R: S.WR, tw: S.tw, spokes: 12, side: s, nave: 0.12, cap: 0.09 });
  W.add('steel', xTube(-S.WX - 0.1, S.WX + 0.1, 0.042, 0.042, 10, S.WR, 0));
  W.add('camo', box(1.3, 0.11, 0.13, 0, S.WR, 0)); // the axle-tree bed
  // the pole trail: one tube from the axle to the spade, the trail eye, the spade and the handspike over it
  const T = S.trail;
  W.add('camo', rod(V(0, T.y0, T.z0), V(0, T.y1 + 0.06, T.z1 - 0.1), 0.075, 12));
  W.add('camo', box(0.36, 0.12, 0.55, 0, T.y0 + 0.02, 0.2)); // the trail's head on the axle
  W.add('camo', box(0.24, 0.1, 0.4, 0, T.y1 + 0.06, T.z1 - 0.15));
  W.add('steel', new THREE.TorusGeometry(0.07, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, T.y1 + 0.08, T.z1 + 0.12));
  W.add('camo', box(0.46, 0.34, 0.025, 0, T.y1 - 0.1, T.z1 - 0.2, 0.35)); // the spade, dug in
  W.add('dark', rod(V(0, T.y1 + 0.12, T.z1 - 0.32), V(0, T.y1 + 0.62, T.z1 - 0.9), 0.022, 6)); // handspike, folded up
  W.add('dark', rod(V(0, T.y1 + 0.62, T.z1 - 0.9), V(0, T.y1 + 0.66, T.z1 - 1.05), 0.022, 6));
  // the layer's and the No. 3's seats on the axle-tree, behind the shield
  for (const s of [-1, 1]) {
    W.add('dark', rod(V(s * 0.45, S.WR + 0.05, 0.05), V(s * 0.47, S.WR + 0.28, 0.3), 0.014, 5));
    W.add('dark', rbox(0.24, 0.035, 0.2, 0.02, s * 0.47, S.WR + 0.3, 0.32));
  }
  W.build(root, { dirt: 0.55 });

  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const P = rig.part();
  // the saddle on the axle carrying the cradle's trunnions, two side plates up to them
  for (const s of [-1, 1]) {
    const g = new THREE.Shape();
    g.moveTo(-0.35, S.WR + 0.05); g.lineTo(0.3, S.WR + 0.05); g.lineTo(0.1, S.trY + 0.06); g.lineTo(-0.18, S.trY + 0.06); g.lineTo(-0.35, S.WR + 0.05);
    P.add('camo', new THREE.ExtrudeGeometry(g, { depth: 0.022, bevelEnabled: false }).rotateY(Math.PI / 2).translate(s * 0.19, 0, 0));
    P.add('steel', xTube(s * 0.17, s * 0.25, 0.05, 0.05, 12, S.trY, S.trZ));
  }
  // the shield (leaning back a little), its folded-back top plate and the lower apron below the axle
  const sh = S.shield;
  const lean = (g, rx) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -sh.y0, 0)).applyMatrix4(new THREE.Matrix4().makeRotationX(rx)).applyMatrix4(new THREE.Matrix4().makeTranslation(0, sh.y0, sh.z));
  P.add('camo', lean(shieldPlate(), -0.07));
  const topH = sh.y1 - sh.y0, tz = sh.z + Math.sin(0.07) * topH, ty = sh.y0 + Math.cos(0.07) * topH;
  P.add('camo', box(sh.hw * 2, sh.top, 0.008, 0, 0, 0).translate(0, sh.top / 2, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-sh.lean)).applyMatrix4(new THREE.Matrix4().makeTranslation(0, ty, tz)));
  P.add('dark', xTube(-sh.hw, sh.hw, 0.014, 0.014, 6, ty, tz)); // the hinge
  for (const s of [-1, 1]) P.add('dark', box(0.03, topH, 0.03, s * (sh.hw - 0.015), (sh.y0 + sh.y1) / 2, sh.z + 0.05, -0.07)); // edge stiffeners
  P.add('camo', box(sh.hw * 2 - 0.08, 0.52, 0.008, 0, 0.47, -0.12, 0.05)); // the apron
  for (const s of [-1, 1]) P.add('steel', rod(V(s * 0.3, S.WR + 0.05, -0.05), V(s * 0.5, sh.y0 + 0.25, sh.z + 0.02), 0.013, 5)); // shield stays
  // the elevating and traversing handwheels on the left, the layer's range drum
  addHandwheel(P, -0.3, S.WR + 0.32, 0.38, 0.12, -1);
  addHandwheel(P, -0.26, S.WR + 0.12, 0.6, 0.09, -1);
  P.add('dark', rod(V(-0.2, S.WR + 0.1, 0.2), V(-0.2, S.trY - 0.15, 0.25), 0.03, 8)); // elevating screw housing
  P.build(trav, { dirt: 0.5 });

  // the cradle: a trough under the barrel and the recuperator on top, rising on the trunnions
  const el = pivotAt(rig, trav, 'elevation', 0, S.trY, S.trZ);
  const E = rig.part(), R = S.recup;
  E.add('camo', box(0.2, 0.1, 1.95, 0, -0.1, -0.42)); // the cradle trough
  E.add('camo', box(0.07, 0.2, 1.7, 0, 0.1, -0.45)); // the web joining it to the recuperator
  E.add('camo', zTube(R.z0, R.z1, R.r, R.r, 18, 0, R.y));
  E.add('dark', zTube(R.z1, R.z1 + 0.05, R.r * 0.85, R.r * 0.7, 14, 0, R.y));
  for (const z of [R.z0 + 0.1, -0.5, R.z1 - 0.12]) E.add('dark', zTube(z, z + 0.05, R.r + 0.01, R.r + 0.01, 18, 0, R.y)); // clamping bands
  // the armoured oil reservoir: a box on the recuperator's front (the 1917 field modification), the torpedo nose ahead
  E.add('camo', rbox(0.2, 0.24, 0.24, 0.025, 0, R.y + 0.01, R.z0 - 0.1));
  E.add('dark', zTube(R.z0 - 0.42, R.z0 - 0.22, 0.03, R.r * 0.7, 12, 0, R.y));
  E.add('steel', rod(V(-0.14, 0.05, 0.25), V(-0.24, 0.32, 0.3), 0.013, 6));
  addDialSight(E, -0.24, 0.32, 0.3);
  E.build(el, { dirt: 0.25, y0: S.trY });

  // the barrel runs back 41 in along the cradle
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('dark', zTube(S.muzzle, -0.55, 0.058, 0.075, 18));
  B.add('steel', zTube(S.muzzle, S.muzzle + 0.025, 0.064, 0.064, 18));
  B.add('dark', zTube(-0.55, 0.38, 0.085, 0.085, 18));
  B.add('dark', zTube(0.38, S.breech, 0.115, 0.115, 18)); // the breech ring
  B.add('char', new THREE.CircleGeometry(0.042, 12).translate(0, 0, S.breech + 0.002));
  B.build(rc, { dirt: 0.1, y0: S.trY });
  const br = pivotAt(rig, rc, 'breech', 0.11, 0, S.breech);
  const K = rig.part();
  K.add('dark', zTube(0, 0.05, 0.095, 0.095, 16, -0.11, 0)); // the Welin block, hinged on the right
  K.add('steel', box(0.035, 0.035, 0.24, -0.04, -0.04, 0.12, 0, -0.4, 0)); // the lever
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.7);

  rig.anchors.eye = node(trav, 'eye', 0, 1.6, 0.9);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, S.muzzle);
  rig.anchors.breech = node(el, 'breech', 0, 0, S.breech + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, 0, S.breech + 0.25);
  rig.anchors.shellStack = node(root, 'shellStack', 1.5, 0.1, 1.2);
  rig.setShell = () => {};
  rig.recoilLength = 1.04;
  rig.loadEl = 0;
  // the detachment in action: No. 1 behind the trail, the layer seated on the left, No. 3 setting range on the right,
  // the loader at the breech, the fuze setter and the ammunition number at the wagon
  crew(rig, 'sergeant', -0.9, 2.3, 0, 'point');
  crew(rig, 'layer', -0.56, 0.5, 0, 'lay');
  crew(rig, 'elevator', 0.6, 0.65, R90, 'operate');
  crew(rig, 'loader', 0.45, 1.25, L90 + 0.6, 'stand');
  crew(rig, 'fuze', 1.6, 1.4, R90, 'crouch');
  hb(rig, -0.95, 0, S.muzzle, 0.95, 1.9, 0.7);
  hb(rig, -0.3, 0, 0.7, 0.3, 0.8, S.trail.z1 + 0.2);
  return finishRig(rig, 'b18', 'b18');
}

// ------------------------------------------------------------------------------------- the wagons
const place = (g, x, z, ry, y = 0) => g.applyMatrix4(xf(x, y, z, 0, ry, 0));

/** The 18-pr carriage limber: an ammunition box on two wheels, pole forward (-Z), the hook at the rear. */
export function limber18(P, x, z, ry = 0, { pole = 0.0 } = {}) {
  const A = (g) => place(g, x, z, ry), WR = QF18.WR;
  const tmp = new FParts();
  for (const s of [-1, 1]) addWheel(tmp, s * QF18.WX, WR, { R: WR, tw: QF18.tw, spokes: 12, side: s, nave: 0.12 });
  for (const [k, list] of tmp.lists) for (const g of list) P.add(k, A(g));
  P.add('steel', A(xTube(-0.9, 0.9, 0.042, 0.042, 8, WR, 0)));
  P.add('camo', A(box(1.2, 0.8, 0.95, 0, WR + 0.32, 0.05))); // the box, 24 rounds racked nose forward
  P.add('camo', A(box(1.26, 0.05, 1.0, 0, WR + 0.74, 0.05)));
  P.add('dark', A(box(1.12, 0.66, 0.02, 0, WR + 0.3, 0.535))); // the rear doors
  P.add('dark', A(box(0.02, 0.66, 0.02, 0, WR + 0.3, 0.55)));
  P.add('wood', A(box(1.2, 0.05, 0.3, 0, WR + 0.78, 0.38))); // the seat board on the lid
  P.add('wood', A(box(1.0, 0.04, 0.25, 0, WR - 0.25, -0.52))); // footboard
  // the pole: resting on the ground in front of the limber, with its swingletree bar
  P.add('wood', A(rod(V(0, WR - 0.05, -0.45), V(0, 0.08 + pole, -3.4), 0.05, 8)));
  P.add('wood', A(xTube(-0.6, 0.6, 0.035, 0.035, 6, WR - 0.12, -0.8)));
  P.add('steel', A(new THREE.TorusGeometry(0.07, 0.016, 6, 12).translate(0, WR - 0.1, 0.62)));
  return P;
}

/** The 18-pr ammunition wagon body, unlimbered beside the gun (38 rounds), its perch resting forward (-Z), the armoured door at the rear. */
export function wagonBody18(P, x, z, ry = 0, { door = 1 } = {}) {
  const A = (g) => place(g, x, z, ry), WR = QF18.WR;
  const tmp = new FParts();
  for (const s of [-1, 1]) addWheel(tmp, s * QF18.WX, WR, { R: WR, tw: QF18.tw, spokes: 12, side: s, nave: 0.12 });
  for (const [k, list] of tmp.lists) for (const g of list) P.add(k, A(g));
  P.add('steel', A(xTube(-0.9, 0.9, 0.042, 0.042, 8, WR, 0)));
  // the body: a tall steel box tipped forward on its perch, the rounds racked in two tiers
  const tilt = 0.12;
  const T = (g) => A(g.applyMatrix4(new THREE.Matrix4().makeRotationX(-tilt)).translate(0, 0, 0));
  P.add('camo', T(box(1.24, 1.1, 0.9, 0, WR + 0.32, 0.0)));
  P.add('camo', T(box(1.3, 0.05, 0.96, 0, WR + 0.88, 0.0)));
  P.add('dark', T(box(1.1, 0.95, 0.02, 0, WR + 0.32, 0.46))); // the open back: rows of shell bases
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) P.add('brass', T(zTube(0.44, 0.47, 0.045, 0.045, 8, -0.48 + c * 0.12, WR - 0.05 + r * 0.22)));
  // the armoured door, hinged at the top and propped up over the gunners at the wagon
  const d = door * 1.35;
  P.add('camo', A(box(1.24, 1.0, 0.012, 0, -0.5, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-d)).translate(0, WR + 0.88, 0.47)));
  P.add('steel', A(rod(V(0.55, WR - 0.2, 0.5), V(0.55, WR + 0.88 + Math.cos(d) * -0.9, 0.47 + Math.sin(d) * 0.9), 0.015, 4)));
  // the perch, down on a block in front
  P.add('camo', A(rod(V(0, WR - 0.05, -0.4), V(0, 0.22, -1.7), 0.06, 8)));
  P.add('wood', A(box(0.35, 0.18, 0.3, 0, 0.09, -1.7)));
  return P;
}

import * as THREE from 'three';
import { V, box, rbox, xTube, zTube, rod, sideProfile } from '../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, addHandwheel, trailBeam, addDialSight, breechSetter, trayShells, crew, L90, R90 } from '../t/fieldkit.js';
import { floorFade } from '../rig.js';
import { buildShell } from '../shells.js';

/**
 * BL 60-pounder Mk I on its Mk I field carriage (the "Long Tom" section of the 1/1st Lowland Heavy
 * Battery): a 5-inch gun with a 4.5 m barrel sliding in a cradle that carries the two big recoil
 * cylinders on top, 5 ft wooden wheels, a long riveted box trail ending in a spade and eye, the
 * dial sight on a bracket on the left. Reference: refs/bl60pdr (Wieltje Sep 1917 IWM Q 3019/3020,
 * Dainville Q 564 from behind, the Mark I carriage drawing: recoil 5 ft, depression 5 deg,
 * elevation to 21.5 deg).
 *
 * Rig as bl6.js (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z,
 * `traverse` carries the whole carriage about the point under the axle, `elevation` at the
 * trunnions (y 1.45), `recoil` slides the barrel back along +Z, `breech` is the hinged block.
 * buildBL60({ girdles }) fits pedrail girdles to the wheels (off by default).
 */
const TR = { y: 1.45, z: 0.15 };
const BL = { muzzle: -3.3, breech: 1.2 }; // barrel ends relative to the trunnion

export function buildBL60({ girdles = false } = {}) {
  const rig = makeRig('green');
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  const P = rig.part();
  const WR = 0.76, WX = 0.98;
  for (const s of [-1, 1]) addWheel(P, s * WX, WR, { R: WR, tw: 0.15, spokes: 14, side: s, girdle: girdles, nave: 0.14 });
  P.add('steel', xTube(-WX - 0.14, WX + 0.14, 0.055, 0.055, 10, WR, 0));
  // top-carriage cheeks
  const cheek = [[-0.62, 0.78], [-0.34, 1.2], [-0.12, 1.62], [0.42, 1.62], [0.66, 1.2], [1.0, 0.64], [1.0, 0.5], [-0.62, 0.55]];
  for (const s of [-1, 1]) P.add('camo', sideProfile(cheek, 0.035).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.37, 0, 0)));
  P.add('camo', box(0.78, 0.12, 1.5, 0, 0.42, 0.2)); // bed plate, low enough for the breech tail at full elevation
  P.add('camo', box(0.72, 0.1, 0.5, 0, 1.05, -0.75, -0.25));
    for (const s of [-1, 1]) P.add('steel', xTube(s * 0.34, s * 0.5, 0.085, 0.085, 12, TR.y, TR.z));
  // long box trail with a flat deck between the cheeks (the gun rest) and the spade
  trailBeam(P, 'camo', [{ z: 0.7, y: 0.4, w: 0.74, h: 0.3 }, { z: 1.8, y: 0.4, w: 0.64, h: 0.28 }, { z: 3.0, y: 0.36, w: 0.56, h: 0.26 }, { z: 4.0, y: 0.24, w: 0.48, h: 0.22 }]);
  P.add('camo', box(0.5, 0.46, 0.05, 0, 0.14, 4.14, -0.22));
  P.add('steel', new THREE.TorusGeometry(0.08, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, 0.3, 4.3));
  P.add('steel', zTube(4.0, 4.25, 0.05, 0.05, 8, 0, 0.28));
  P.add('dark', box(0.4, 0.04, 0.8, 0, 0.55, 2.2, 0.12)); // the loading platform plate on the trail
  for (const s of [-1, 1]) P.add('wood', rod(V(s * 0.38, 0.32, 1.4), V(s * 0.4, 0.2, 3.9), 0.022, 5));
  // layer's seat, handwheels, sighting steps
  P.add('steel', rod(V(-0.4, 0.95, 0.5), V(-0.8, 0.95, 0.45), 0.015, 5));
  P.add('wood', box(0.32, 0.03, 0.28, -0.9, 0.95, 0.42));
  addHandwheel(P, -0.4, 1.02, 0.78, 0.15, -1);
  addHandwheel(P, -0.4, 0.74, 0.88, 0.13, -1);
  P.add('steel', box(0.04, 0.2, 0.28, -0.95, 0.55, 1.5)); // rear sighting step
  P.build(trav, { dirt: 0.55 });

  // ---- elevating mass
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  E.add('camo', zTube(-1.4, 0.9, 0.205, 0.205, 18));
  E.add('dark', zTube(-1.44, -1.4, 0.222, 0.222, 18));
  E.add('dark', zTube(0.9, 0.95, 0.222, 0.222, 18));
  for (const s of [-1, 1]) { // the two big recoil cylinders alongside, above the barrel
    E.add('camo', zTube(-1.5, 0.8, 0.095, 0.095, 14, s * 0.19, 0.24));
    E.add('steel', zTube(-1.56, -1.5, 0.07, 0.07, 10, s * 0.19, 0.24));
    E.add('dark', zTube(0.8, 0.86, 0.105, 0.105, 12, s * 0.19, 0.24));
    for (const z of [-1.2, -0.5, 0.2]) E.add('dark', box(0.1, 0.14, 0.05, s * 0.19, 0.14, z));
  }
  E.add('camo', zTube(-1.1, 0.5, 0.045, 0.045, 8, 0, 0.3)); // the central buffer rod
  const arc = [];
  for (let i = 0; i <= 8; i++) { const f = (14 + 46 * (i / 8)) * Math.PI / 180; arc.push([0.62 * Math.sin(f), -0.62 * Math.cos(f)]); }
  for (let i = 8; i >= 0; i--) { const f = (14 + 46 * (i / 8)) * Math.PI / 180; arc.push([0.48 * Math.sin(f), -0.48 * Math.cos(f)]); }
  E.add('camo', sideProfile(arc, 0.04).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.22, 0, 0)));
  E.add('camo', rbox(0.1, 0.12, 0.3, 0.02, 0, -0.3, 0.2));
  E.add('steel', rod(V(-0.2, 0.05, 0.3), V(-0.4, 0.5, 0.3), 0.02, 6));
  E.add('steel', box(0.1, 0.03, 0.14, -0.4, 0.51, 0.3));
  addDialSight(E, -0.4, 0.52, 0.3);
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---- barrel
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('steel', zTube(BL.muzzle, BL.muzzle + 0.03, 0.105, 0.105, 18));
  B.add('dark', zTube(BL.muzzle + 0.03, BL.muzzle + 0.2, 0.108, 0.1, 18));
  B.add('dark', zTube(BL.muzzle + 0.2, -1.4, 0.1, 0.13, 18)); // long thin chase
  B.add('dark', zTube(-1.4, 0.95, 0.165, 0.165, 20));
  B.add('steel', zTube(-1.4, -1.35, 0.17, 0.17, 20));
  B.add('dark', zTube(0.9, BL.breech, 0.2, 0.2, 20));
  B.add('steel', zTube(0.9, 0.94, 0.205, 0.205, 20));
  B.add('char', new THREE.CircleGeometry(0.065, 14).translate(0, 0, BL.breech + 0.002));
  B.add('dark', box(0.04, 0.05, 0.08, 0.2, 0.17, 1.0));
  B.add('steel', rod(V(0.2, 0.17, 1.02), V(0.24, 0.3, 1.2), 0.01, 4));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  const br = pivotAt(rig, rc, 'breech', 0.22, 0, BL.breech);
  const K = rig.part();
  K.add('dark', zTube(0.0, 0.07, 0.17, 0.17, 18, -0.22, 0));
  K.add('steel', zTube(0.07, 0.1, 0.07, 0.07, 10, -0.22, 0));
  K.add('steel', box(0.05, 0.3, 0.04, 0.0, 0, 0.03));
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.9);

  rig.anchors.eye = node(trav, 'eye', 0, 1.9, 0.9);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, BL.muzzle);
  rig.anchors.breech = node(el, 'breech', 0, 0, BL.breech + 0.02);
  // the round lies on the bore axis, its base behind the breech and its nose short of it, ready to be rammed
  const sh60 = buildShell('bl60');
  rig.anchors.tray = node(el, 'tray', 0, 0, BL.breech + sh60.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 1.9, 0.1, 2.6);
  trayShells(rig, node(el, 'trayShell', 0, -(sh60.radius + 0.02), BL.breech + 0.06), 'bl60');
  rig.recoilLength = 1.2;
  rig.loadEl = 0.06;
  floorFade(rig, TR.y, BL.breech + 0.1, 0.2, 0.65, 0.1);
  rig.slideMats = ['dark', 'steel', 'char']; // the barrel's own metal, which slides through the cradle sleeve (clip check)

  crew(rig, 'layer', -1.2, 0.35, L90, 'lay');
  crew(rig, 'sight', -1.15, 1.0, L90, 'lay');
  crew(rig, 'loader', 0.4, 2.35, 0, 'ram');
  crew(rig, 'rammer', -0.5, 2.4, 0, 'ram');
  crew(rig, 'shell', 1.15, 2.4, R90, 'carry');
  crew(rig, 'cartridge', 1.0, 3.2, R90, 'carry');
  crew(rig, 'lanyard', 1.25, 1.0, R90, 'lanyard');
  crew(rig, 'ears', 1.8, 1.0, R90, 'ears');
  crew(rig, 'officer', -2.3, 2.2, L90, 'point');

  hb(rig, -1.1, 0, -3.3, 1.1, 1.8, 1.4);
  hb(rig, -0.38, 0, 0.9, 0.38, 0.85, 4.4);
  return finishRig(rig, 'bl60', 'bl60');
}

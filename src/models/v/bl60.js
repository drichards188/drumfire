import * as THREE from 'three';
import { V, box, rbox, xTube, zTube, rod, sideProfile, loft } from '../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, addHandwheel, trailBeam, addDialSight, breechSetter, trayShells, crew, L90, R90 } from '../t/fieldkit.js';
import { floorFade } from '../rig.js';
import { buildShell } from '../shells.js';

/**
 * BL 60-pounder Mk I on its Mk I field carriage (the "Long Tom" section of the 1/1st Lowland Heavy
 * Battery): a 5-inch gun with a 4.3 m barrel sliding in a cradle that carries the two big recoil
 * cylinders on top, 5 ft wooden wheels, a long riveted box trail ending in a spade and eye, the
 * dial sight on a bracket on the left. Reference: refs/bl60pdr (Wieltje Sep 1917 IWM Q 3019/3020,
 * Dainville Q 564 from behind, the Mark I carriage drawing: depression 5 deg,
 * elevation to 21.5 deg; IWM 30025228: 6.7 m long in action, 2.0 m wide, recoil 55 in).
 *
 * Rig as bl6.js (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z,
 * `traverse` carries the whole carriage about the point under the axle, `elevation` at the
 * trunnions (y 1.45), `recoil` slides the barrel back along +Z, `breech` is the hinged block.
 * buildBL60({ girdles }) fits pedrail girdles to the wheels (off by default).
 */
const TR = { y: 1.45, z: 0.15 };
const BL = { muzzle: -3.1, breech: 1.2 }; // barrel ends relative to the trunnion: 4.3 m overall, L/32
// Box trail stations (centre height y, width w, depth h): up at axle height behind the cradle, down to the spade.
const TS = [{ z: 0.7, y: 0.58, w: 0.8, h: 0.32 }, { z: 1.7, y: 0.46, w: 0.72, h: 0.3 }, { z: 2.7, y: 0.34, w: 0.6, h: 0.28 }, { z: 3.55, y: 0.24, w: 0.48, h: 0.22 }];
const ts = (z) => {
  let i = 0;
  while (i < TS.length - 2 && z > TS[i + 1].z) i++;
  const a = TS[i], b = TS[i + 1], f = (z - a.z) / (b.z - a.z), l = (k) => a[k] + (b[k] - a[k]) * f;
  return { z, y: l('y'), w: l('w'), h: l('h') };
};
const T0 = 1.3, T1 = 3.05, GAP = 0.265; // the open top of the trail the breech recoils into at high elevation

export function buildBL60({ girdles = false } = {}) {
  const rig = makeRig('green');
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  const P = rig.part();
  const WR = 0.76, WX = 0.78; // 2.0 m over the hub caps
  for (const s of [-1, 1]) addWheel(P, s * WX, WR, { R: WR, tw: 0.15, spokes: 14, side: s, girdle: girdles, nave: 0.14, cap: 0.03 });
  P.add('steel', xTube(-WX - 0.12, WX + 0.12, 0.055, 0.055, 10, WR, 0));
  // top-carriage cheeks
  const cheek = [[-0.62, 0.78], [-0.34, 1.2], [-0.12, 1.62], [0.42, 1.62], [0.66, 1.2], [1.0, 0.64], [1.0, 0.5], [-0.62, 0.55]];
  for (const s of [-1, 1]) P.add('camo', sideProfile(cheek, 0.035).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.37, 0, 0)));
  P.add('camo', box(0.78, 0.12, 1.5, 0, 0.42, 0.2)); // bed plate, low enough for the breech tail at full elevation
  P.add('camo', box(0.5, 0.08, 0.4, 0, 0.92, -0.45, -0.25)); // front transom, tucked below the buffer at full depression
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.34, s * 0.5, 0.085, 0.085, 12, TR.y, TR.z));
  // box trail: solid ahead of and behind the open top where the breech recoils at 21.5 deg, two side girders
  // and a floor plate between, then the spade and the trail eye
  trailBeam(P, 'camo', [ts(0.7), ts(T0)]);
  trailBeam(P, 'camo', [ts(T1), ts(3.55)]);
  const mid = [ts(T0), ts(1.7), ts(2.7), ts(T1)];
  for (const s of [-1, 1]) {
    const [x0, x1] = s < 0 ? [-1, -GAP] : [GAP, 1];
    P.add('camo', loft(mid.map(({ z, y, w, h }) => { const a = x0 === -1 ? -w / 2 : x0, b = x1 === 1 ? w / 2 : x1; return [V(a, y - h / 2, z), V(b, y - h / 2, z), V(b, y + h / 2, z), V(a, y + h / 2, z)]; })));
  }
  P.add('dark', loft(mid.map(({ z, y, h }) => [V(-GAP, y - h / 2, z), V(GAP, y - h / 2, z), V(GAP, y - h / 2 + 0.05, z), V(-GAP, y - h / 2 + 0.05, z)])));
  P.add('camo', box(0.5, 0.46, 0.05, 0, 0.14, 3.68, -0.22));
  P.add('steel', new THREE.TorusGeometry(0.08, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, 0.3, 3.78));
  P.add('steel', zTube(3.55, 3.72, 0.05, 0.05, 8, 0, 0.28));
  for (const s of [-1, 1]) { // handspikes along the girders
    const a = ts(1.4), b = ts(3.45);
    P.add('wood', rod(V(s * (a.w / 2 + 0.03), a.y, 1.4), V(s * (b.w / 2 + 0.03), b.y, 3.45), 0.022, 5));
  }
  // layer's seat behind the left wheel, handwheels, sighting step
  P.add('steel', rod(V(-0.4, 0.85, 0.85), V(-0.62, 0.85, 0.95), 0.015, 5));
  P.add('wood', box(0.3, 0.03, 0.26, -0.66, 0.85, 0.98));
  addHandwheel(P, -0.4, 1.02, 0.78, 0.15, -1);
  addHandwheel(P, -0.4, 0.74, 0.88, 0.13, -1);
  P.add('steel', rod(V(-0.39, 0.5, 1.5), V(-0.55, 0.5, 1.5), 0.015, 5));
  P.add('steel', box(0.04, 0.2, 0.28, -0.57, 0.5, 1.5)); // rear sighting step
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
  // the hydraulic buffer under the cradle, on its hangers
  E.add('camo', zTube(-1.3, 0.75, 0.085, 0.085, 12, 0, -0.27));
  E.add('dark', zTube(-1.34, -1.3, 0.07, 0.07, 10, 0, -0.27));
  for (const z of [-1.05, -0.2, 0.6]) E.add('dark', box(0.06, 0.08, 0.07, 0, -0.2, z));
  const arc = [];
  for (let i = 0; i <= 8; i++) { const f = (14 + 46 * (i / 8)) * Math.PI / 180; arc.push([0.62 * Math.sin(f), -0.62 * Math.cos(f)]); }
  for (let i = 8; i >= 0; i--) { const f = (14 + 46 * (i / 8)) * Math.PI / 180; arc.push([0.48 * Math.sin(f), -0.48 * Math.cos(f)]); }
  E.add('camo', sideProfile(arc, 0.04).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.22, 0, 0)));
  E.add('camo', rbox(0.1, 0.12, 0.3, 0.02, 0, -0.3, 0.2));
  // dial sight on a short bracket just above the left cylinder, by the breech
  E.add('steel', rod(V(-0.2, 0.05, 0.3), V(-0.42, 0.26, 0.3), 0.02, 6));
  E.add('steel', box(0.1, 0.03, 0.14, -0.42, 0.27, 0.3));
  addDialSight(E, -0.42, 0.28, 0.3);
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
  rig.recoilLength = 1.4; // 55 in, constant
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

  hb(rig, -1.0, 0, -3.0, 1.0, 1.8, 1.4);
  hb(rig, -0.4, 0, 0.9, 0.4, 0.8, 3.9);
  return finishRig(rig, 'bl60', 'bl60');
}

import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile } from '../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, addHandwheel, trailBeam, addDialSight, breechSetter, trayShells, crew, L90, R90 } from '../t/fieldkit.js';
import { floorFade } from '../rig.js';
import { buildShell } from '../shells.js';

/**
 * BL 6-inch 26 cwt howitzer on its Mk I travelling carriage (the "Ginger" battery's guns), as the
 * 118th Siege Battery had them at Ypres in October 1917: a short fat barrel in a cradle, big spoked
 * wooden wheels (5 ft) with steel tyres and girdles (pedrail shoes) for the mud, a riveted box trail
 * 3.35 m behind the axle ending in a spade and eye, the dial sight on a bracket on the left, the
 * elevating and traversing handwheels, the layer's seat. Reference: refs/bl6in26cwt (the carriage
 * drawing: bore axis 51 in, wheel 62 in, axle to trail eye 131.75 in, recoil 54 in; photos
 * Boesinghe 16 Aug 1917, girdles at Ypres Oct 1917).
 *
 * Rig (DESIGN.md "Models"): root, pivots { traverse, elevation, recoil, breech }, anchors { eye,
 * muzzle, breech, tray, shellStack, crew[] }, recoilLength, loadEl, setBreech(k), setShell(where,
 * visible), boxes. Origin: the ground under the axle centre; front -Z. `traverse` carries the whole
 * carriage (wheels, trail, cradle), so a traverse swings the gun about the point under the axle, as
 * a crew does with the trail handspikes. `elevation` pivots at the trunnions (y 1.3), `recoil` slides
 * the barrel back along +Z inside the cradle, `breech` is the hinged breech block (rotation.y).
 * setShell also takes 'cartridge' (the bag on the tray).
 */
const TR = { y: 1.3, z: -0.05 }; // trunnion axis in root space

export function buildBL6({ girdles = true } = {}) {
  const rig = makeRig('green');
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  // ---- carriage: wheels, axle, cheeks, bed, trail, fittings (fixed to the traverse pivot)
  const P = rig.part();
  const WR = 0.76, WX = 1.0;
  for (const s of [-1, 1]) addWheel(P, s * WX, WR, { R: WR, tw: 0.15, spokes: 12, side: s, girdle: girdles });
  P.add('steel', xTube(-WX - 0.12, WX + 0.12, 0.05, 0.05, 10, WR, 0));
  // cheeks: riveted steel plates carrying the trunnion bearings
  const cheek = [[-0.72, 0.8], [-0.46, 1.18], [-0.2, 1.45], [0.3, 1.45], [0.52, 1.18], [0.82, 0.66], [0.82, 0.5], [-0.72, 0.56]];
  for (const s of [-1, 1]) P.add('camo', sideProfile(cheek, 0.03).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.3, 0, 0)));
  P.add('camo', box(0.6, 0.1, 1.1, 0, 0.4, 0.1)); // bed plate, low enough for the breech tail at full elevation
  P.add('camo', box(0.62, 0.08, 0.4, 0, 1.0, -0.62, -0.25)); // front tie plate
    // trunnion bearing caps
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.27, s * 0.4, 0.075, 0.075, 12, TR.y, TR.z));
  // box trail: from the carriage bed back to the spade
  trailBeam(P, 'camo', [{ z: 0.55, y: 0.36, w: 0.6, h: 0.24 }, { z: 1.5, y: 0.34, w: 0.52, h: 0.24 }, { z: 2.5, y: 0.34, w: 0.44, h: 0.23 }, { z: 3.3, y: 0.22, w: 0.34, h: 0.2 }]);
  P.add('camo', box(0.44, 0.4, 0.04, 0, 0.14, 3.42, -0.2)); // spade plate, bedded in the mud
  P.add('steel', new THREE.TorusGeometry(0.07, 0.016, 6, 14).rotateX(Math.PI / 2).translate(0, 0.28, 3.55)); // trail eye
  P.add('steel', zTube(3.3, 3.5, 0.045, 0.045, 8, 0, 0.26));
  for (const s of [-1, 1]) { // handspikes lashed along the trail
    P.add('wood', rod(V(s * 0.28, 0.3, 1.0), V(s * 0.3, 0.2, 3.1), 0.02, 5));
  }
  // layer's seat on the left, handwheels
  P.add('steel', rod(V(-0.33, 0.9, 0.2), V(-0.7, 0.9, 0.15), 0.014, 5));
  P.add('wood', box(0.3, 0.03, 0.26, -0.8, 0.9, 0.12));
  addHandwheel(P, -0.34, 1.0, 0.56, 0.14, -1);
  addHandwheel(P, -0.34, 0.72, 0.66, 0.12, -1);
  P.add('steel', zTube(0.2, 0.62, 0.012, 0.012, 6, -0.3, 1.0));
  // spent-round and ready rack: two shell cradles of wood by the trail (props, shells live elsewhere)
  P.add('wood', box(0.5, 0.12, 0.9, 1.5, 0.06, 1.7));
  P.build(trav, { dirt: 0.55 });

  // ---- elevating mass: cradle, recuperator, sights, arc
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  E.add('camo', zTube(-0.85, 0.28, 0.205, 0.205, 18)); // cradle sleeve
  E.add('dark', zTube(-0.89, -0.85, 0.222, 0.222, 18));
  E.add('dark', zTube(0.28, 0.32, 0.222, 0.222, 18));
  E.add('camo', zTube(-0.8, 0.15, 0.085, 0.085, 12, 0, 0.3)); // recuperator / spring cylinder over the barrel
  E.add('steel', zTube(-0.85, -0.8, 0.06, 0.06, 10, 0, 0.3));
  E.add('dark', zTube(0.15, 0.2, 0.1, 0.1, 12, 0, 0.3));
  for (const z of [-0.7, -0.2, 0.1]) E.add('dark', box(0.1, 0.12, 0.05, 0, 0.24, z)); // clips tying it to the cradle
  // elevating arc (a toothed sector hanging under the cradle at the rear) and its sector pinion housing
  const arc = [];
  for (let i = 0; i <= 8; i++) { const f = (12 + 44 * (i / 8)) * Math.PI / 180; arc.push([0.46 * Math.sin(f), -0.46 * Math.cos(f)]); }
  for (let i = 8; i >= 0; i--) { const f = (12 + 44 * (i / 8)) * Math.PI / 180; arc.push([0.34 * Math.sin(f), -0.34 * Math.cos(f)]); }
  E.add('camo', sideProfile(arc, 0.04).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.2, 0, 0)));
  E.add('camo', rbox(0.1, 0.1, 0.26, 0.02, 0, -0.26, 0.1));
  // dial sight bracket on the left
  E.add('steel', rod(V(-0.2, 0.05, 0.12), V(-0.33, 0.42, 0.1), 0.018, 6));
  E.add('steel', box(0.1, 0.03, 0.14, -0.33, 0.43, 0.1));
  addDialSightOn(E, -0.33, 0.44, 0.1);
  // clinometer quadrant on the right
  E.add('brass', box(0.03, 0.12, 0.16, 0.26, 0.2, 0.2));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---- recoiling barrel
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('dark', zTube(-1.44, -1.28, 0.13, 0.13, 18)); // muzzle swell
  B.add('steel', zTube(-1.46, -1.44, 0.115, 0.115, 18));
  B.add('dark', zTube(-1.28, -0.45, 0.105, 0.12, 18)); // tapered chase
  B.add('dark', zTube(-0.45, 0.58, 0.162, 0.162, 20)); // jacket
  B.add('steel', zTube(-0.45, -0.4, 0.168, 0.168, 20));
  B.add('dark', zTube(0.5, 0.8, 0.2, 0.2, 20)); // breech ring
  B.add('steel', zTube(0.5, 0.54, 0.205, 0.205, 20));
  B.add('char', new THREE.CircleGeometry(0.07, 14).translate(0, 0, 0.802)); // the open chamber
  B.add('dark', box(0.04, 0.05, 0.08, 0.2, 0.17, 0.5)); // firing mechanism / lanyard bracket
  B.add('steel', rod(V(0.2, 0.17, 0.52), V(0.24, 0.3, 0.7), 0.01, 4));
  // recoil lugs engaging the buffer rods
  B.add('steel', box(0.06, 0.06, 0.12, -0.19, -0.13, 0.4));
  B.add('steel', box(0.06, 0.06, 0.12, 0.19, -0.13, 0.4));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  // ---- breech block, hinged on the right side (swings out to the rear when opened)
  const br = pivotAt(rig, rc, 'breech', 0.22, 0, 0.8);
  const K = rig.part();
  K.add('dark', zTube(0.0, 0.07, 0.17, 0.17, 18, -0.22, 0));
  K.add('steel', zTube(0.07, 0.1, 0.07, 0.07, 10, -0.22, 0));
  K.add('steel', box(0.05, 0.3, 0.04, 0.0, 0, 0.03));
  K.add('brass', xTube(-0.32, -0.12, 0.012, 0.012, 6, 0, 0.1));
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.9);

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 1.7, 0.5);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, -1.46); // in battery (it does not recoil with the barrel)
  rig.anchors.breech = node(el, 'breech', 0, 0, 0.82);
  // the round lies on the bore axis, its base behind the breech and its nose short of it, ready to be rammed
  const sh6 = buildShell('bl6');
  rig.anchors.tray = node(el, 'tray', 0, 0, 0.8 + sh6.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 1.7, 0.1, 1.7);
  trayShells(rig, node(el, 'trayShell', 0, -(sh6.radius + 0.02), 0.8 + 0.06), 'bl6');
  rig.recoilLength = 0.9;
  rig.loadEl = 0.13; // 7.5 deg, the quick-loading gear's position (the render layer drops the barrel to it for the loading steps)
  floorFade(rig, TR.y, 0.9, 0.2, 0.5, 0.1);
  rig.slideMats = ['dark', 'steel', 'char']; // the barrel's own metal, which slides through the cradle sleeve (clip check)

  // crew: x right, z back; headings face the gun
  crew(rig, 'layer', -1.05, 0.15, L90, 'lay');
  crew(rig, 'sight', -0.95, 0.75, L90, 'lay');
  crew(rig, 'loader', 0.4, 1.35, 0, 'ram'); // behind the breech, facing the muzzle
  crew(rig, 'rammer', -0.55, 1.4, 0, 'ram');
  crew(rig, 'shell', 1.05, 1.55, R90, 'carry');
  crew(rig, 'cartridge', 0.9, 2.3, R90, 'carry');
  crew(rig, 'lanyard', 1.1, 0.55, R90, 'lanyard');
  crew(rig, 'ears', 1.6, 0.6, R90, 'ears');
  crew(rig, 'officer', -2.0, 1.6, L90, 'point');

  hb(rig, -1.1, 0, -1.5, 1.05, 1.65, 0.85);
  hb(rig, -0.3, 0, 0.8, 0.3, 0.75, 3.5);
  return finishRig(rig, 'bl6', 'bl6');
}

// the sight is built with the shared helper, wrapped here so the bracket's local frame is explicit
function addDialSightOn(P, x, y, z) {
  addDialSight(P, x, y, z);
}

import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile } from '../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, addHandwheel, trailBeam, addDialSight, breechSetter, trayShells, crew, L90, R90 } from '../t/fieldkit.js';
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

  // ---- carriage: wheels, axle, side brackets, trail, fittings (fixed to the traverse pivot)
  const P = rig.part();
  // track about 1.64 m (5 ft 4 in): over the hub caps the gun is about 2.2 m wide, the girdles 0.3 m
  const WR = 0.76, WX = 0.82;
  for (const s of [-1, 1]) addWheel(P, s * WX, WR, { R: WR, tw: 0.15, spokes: 12, side: s, girdle: girdles });
  // axle arms from the naves into the brackets: no straight axle tree between them, because at 45 deg the
  // cylinder block under the barrel swings down through the space just over the axle line
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.25, s * 0.95, 0.05, 0.05, 10, WR, 0));
  // the two steel side brackets: tall at the trunnions, then falling to the box trail at z 1.9; open between
  // them down to a floor plate, so the breech and the cylinder block recoil down between them at elevation
  const bracket = [[-0.75, 0.55], [-0.75, 0.82], [-0.45, 1.16], [-0.25, 1.38], [0.03, 1.38], [0.3, 1.0], [0.48, 0.64], [0.9, 0.55], [1.3, 0.47], [1.9, 0.46], [1.9, 0.19], [1.2, 0.25], [0.5, 0.42], [-0.2, 0.48]];
  for (const s of [-1, 1]) P.add('camo', sideProfile(bracket, 0.035).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.27, 0, 0)));
  P.add('camo', box(0.5, 0.12, 0.22, 0, 0.55, -0.42)); // front transom, low so the cradle passes over it
  P.add('camo', box(0.5, 0.04, 0.7, 0, 0.2, 1.55)); // floor plate between the brackets
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.29, s * 0.4, 0.075, 0.075, 12, TR.y, TR.z)); // trunnion bearing caps
  // closed box trail behind the brackets, tapering down to the spade
  trailBeam(P, 'camo', [{ z: 1.9, y: 0.33, w: 0.55, h: 0.26 }, { z: 2.6, y: 0.3, w: 0.44, h: 0.22 }, { z: 3.18, y: 0.24, w: 0.34, h: 0.2 }, { z: 3.27, y: 0.23, w: 0.32, h: 0.18 }]);
  P.add('camo', box(0.44, 0.42, 0.04, 0, 0.12, 3.2, -0.2)); // spade plate, bedded in the mud
  P.add('steel', new THREE.TorusGeometry(0.07, 0.016, 6, 14).rotateX(Math.PI / 2).translate(0, 0.25, 3.35)); // trail eye, 131.75 in behind the axle
  P.add('steel', zTube(3.25, 3.29, 0.04, 0.04, 8, 0, 0.25));
  for (const s of [-1, 1]) { // handspikes lashed along the trail
    P.add('wood', rod(V(s * 0.31, 0.4, 1.95), V(s * 0.21, 0.28, 3.05), 0.02, 5));
  }
  // elevating and traversing handwheels on the left bracket, the layer's seat behind the wheel
  addHandwheel(P, -0.34, 0.98, 0.28, 0.14, -1);
  addHandwheel(P, -0.34, 0.66, 0.62, 0.12, -1);
  P.add('steel', rod(V(-0.29, 0.66, 0.95), V(-0.55, 0.78, 0.98), 0.014, 5));
  P.add('wood', box(0.26, 0.03, 0.24, -0.58, 0.8, 0.98));
  // spent-round and ready rack: two shell cradles of wood by the trail (props, shells live elsewhere)
  P.add('wood', box(0.5, 0.12, 0.9, 1.5, 0.06, 1.7));
  P.build(trav, { dirt: 0.55 });

  // ---- elevating mass: the trough cradle under the barrel (the recoil block slides in its guides), the
  // piston rods tied to its front, the arc, the sights. No sleeve: the top of the barrel is clear.
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  for (const s of [-1, 1]) {
    E.add('camo', box(0.04, 0.37, 1.44, s * 0.19, -0.235, -0.4)); // trough sides (guides), z -1.12..0.32
    E.add('camo', box(0.04, 0.26, 0.34, s * 0.19, -0.02, -0.02)); // trunnion bosses
    E.add('steel', xTube(s * 0.19, s * 0.33, 0.06, 0.06, 12)); // trunnions
    E.add('dark', box(0.05, 0.03, 1.44, s * 0.19, -0.05, -0.4)); // guide lips
  }
  E.add('camo', box(0.42, 0.34, 0.06, 0, -0.35, -1.09)); // front plate, the rods' anchor (below the chase)
  const rods = [[0, -0.28], [0, -0.43]];
  for (const [x, y] of rods) E.add('steel', zTube(-1.08, 0.3, 0.03, 0.03, 8, x, y)); // piston rods, long enough to stay in at full recoil
  // elevating arc (a toothed sector hanging under the cradle at the rear, outside the left guide)
  const arc = [];
  for (let i = 0; i <= 8; i++) { const f = (12 + 44 * (i / 8)) * Math.PI / 180; arc.push([0.56 * Math.sin(f), -0.56 * Math.cos(f)]); }
  for (let i = 8; i >= 0; i--) { const f = (12 + 44 * (i / 8)) * Math.PI / 180; arc.push([0.4 * Math.sin(f), -0.4 * Math.cos(f)]); }
  E.add('camo', sideProfile(arc, 0.03).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.225, 0, 0)));
  // dial sight bracket on the left
  E.add('steel', rod(V(-0.21, 0.05, 0.12), V(-0.33, 0.42, 0.1), 0.018, 6));
  E.add('steel', box(0.1, 0.03, 0.14, -0.33, 0.43, 0.1));
  addDialSightOn(E, -0.33, 0.44, 0.1);
  // clinometer quadrant on the right
  E.add('brass', box(0.03, 0.12, 0.16, 0.225, 0.06, 0.2));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---- recoiling mass: barrel and, under it, the cylinder block (buffer over recuperator) fixed to the breech ring
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('dark', zTube(-1.46, -1.38, 0.138, 0.138, 18)); // plain muzzle band (no swell: that was the 30 cwt)
  B.add('dark', zTube(-1.38, -0.45, 0.13, 0.148, 18)); // chase
  B.add('dark', zTube(-0.45, 0.5, 0.165, 0.165, 20)); // jacket
  B.add('steel', zTube(-0.45, -0.41, 0.171, 0.171, 20));
  B.add('dark', zTube(0.5, 0.8, 0.2, 0.2, 20)); // breech ring
  B.add('steel', zTube(0.5, 0.54, 0.205, 0.205, 20));
  B.add('char', new THREE.CircleGeometry(0.07, 14).translate(0, 0, 0.802)); // the open chamber
  B.add('dark', box(0.04, 0.05, 0.08, 0.2, 0.17, 0.5)); // firing mechanism / lanyard bracket
  B.add('steel', rod(V(0.2, 0.17, 0.52), V(0.24, 0.3, 0.7), 0.01, 4));
  B.add('camo', rbox(0.3, 0.3, 1.25, 0.03, 0, -0.36, -0.325)); // cylinder block, z -0.95..0.3, longer than the stroke
  for (const [x, y] of rods) B.add('camo', zTube(-1.0, -0.94, 0.075, 0.075, 14, x, y)); // cylinder front ends and glands
  for (const [x, y] of rods) B.add('steel', zTube(-1.02, -1.0, 0.06, 0.06, 12, x, y));
  B.add('dark', box(0.14, 0.12, 0.3, 0, -0.21, 0.42)); // lug tying the block to the breech ring
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
  rig.recoilLength = 1.32; // 52 in level
  rig.loadEl = 0.13; // 7.5 deg, the quick-loading gear's position (the render layer drops the barrel to it for the loading steps)
  // the variable recoil cuts the stroke as the gun is raised, to 24 in at 45 deg, so the breech and the block
  // stay clear of the trail and the platform
  rig.recoilFade = (e) => 1 - 0.54 * Math.min(1, Math.max(0, e) / 0.785);
  rig.slideMats = ['dark', 'steel', 'char']; // the barrel's own metal, which slides along the cradle guides (clip check)
  rig.nest = rods; // cylinder axes the piston rods slide into (clip check)

  // crew: x right, z back; headings face the gun
  crew(rig, 'layer', -1.05, 0.15, L90, 'lay');
  crew(rig, 'sight', -0.95, 0.75, L90, 'lay');
  crew(rig, 'loader', 0.4, 1.35, 0, 'ram'); // behind the breech, facing the muzzle
  crew(rig, 'rammer', -0.62, 1.45, 0, 'ram');
  crew(rig, 'shell', 1.05, 1.55, R90, 'carry');
  crew(rig, 'cartridge', 0.9, 2.3, R90, 'carry');
  crew(rig, 'lanyard', 1.1, 0.55, R90, 'lanyard');
  crew(rig, 'ears', 1.6, 0.6, R90, 'ears');
  crew(rig, 'officer', -2.0, 1.6, L90, 'point');

  hb(rig, -1.1, 0, -1.5, 1.1, 1.65, 0.85);
  hb(rig, -0.3, 0, 0.8, 0.3, 0.75, 3.45);
  return finishRig(rig, 'bl6', 'bl6');
}

// the sight is built with the shared helper, wrapped here so the bracket's local frame is explicit
function addDialSightOn(P, x, y, z) {
  addDialSight(P, x, y, z);
}

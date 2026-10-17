import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, frontProfile, gearArc } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addHandwheel, trayShells, crew, L90, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { discWheel, spokedSteelWheel, trailLeg, panoramicSight, muzzleBrake, slidingBlock, barrel } from './common.js';

/**
 * 10.5 cm leichte Feldhaubitze 18 (18M with the muzzle brake, as the divisional artillery had it in 1944): the
 * L/28 barrel (2.94 m) with the recuperator above and the buffer below it in the cradle, the horizontal sliding
 * breech block opening to the right, the shield narrow between the wheels and wide above them with the notch for
 * the barrel at high elevation, the split box trails spread 56 degrees with their spades, the steel wheels (1.3 m).
 * About 1,985 kg in action, 6.1 m long, 1.98 m wide, 1.88 m high. Elevation -5 to +42 degrees, traverse 56.
 *
 * Rig as bl6.js (DESIGN.md "Models", "WW2 mode"): origin on the ground under the axle centre, front -Z.
 * `traverse` is the top carriage with the shield (it swings on the axle; wheels and trails stay put), `elevation`
 * at the trunnions, `recoil` slides the barrel back along +Z, `breech` the sliding block (setBreech slides it +X).
 * buildLeFH18({ scheme: 'dgelb' | 'feldgrau', wheels: 'spoked' | 'disc', brake: true })
 */
const TR = { y: 1.1, z: 0.22 }; // trunnion axis in root space
const MZ = -1.9, BR = 1.04; // barrel ends relative to the trunnion (2.94 m)
const RING0 = 0.66; // front of the squared breech ring

export function buildLeFH18({ scheme = 'dgelb', wheels = 'spoked', brake = true } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---- lower carriage: axle, wheels, the trail hinges, the apron; it does not traverse
  const L = rig.part();
  const WR = 0.65, WX = 0.83;
  for (const s of [-1, 1]) {
    if (wheels === 'disc') discWheel(L, s * WX, WR, { R: WR, tw: 0.13, holes: 0, side: s, hub: 0.13 });
    else spokedSteelWheel(L, s * WX, WR, { R: WR, tw: 0.1, side: s, hub: 0.12 });
  }
  L.add('dark', xTube(-WX + 0.05, WX - 0.05, 0.05, 0.05, 10, WR, 0));
  L.add('camo', rbox(0.52, 0.2, 0.46, 0.03, 0, 0.6, 0.12)); // axle body, the top carriage's pivot
  for (const s of [-1, 1]) L.add('camo', box(0.12, 0.18, 0.3, s * 0.2, 0.56, 0.38)); // trail hinge lugs
  // the lower shield (apron) hangs below the axle between the wheels
  L.add('camo', box(1.08, 0.36, 0.012, 0, 0.42, -0.34));
  L.add('dark', box(1.08, 0.025, 0.03, 0, 0.6, -0.34));
  // split trails, spread 28 degrees each side, 3.5 m long, ending in spades
  const TL = 3.5, SP = 28 * Math.PI / 180;
  for (const s of [-1, 1]) {
    const a = V(s * 0.2, 0.56, 0.42), b = V(s * (0.2 + TL * Math.sin(SP)), 0.2, 0.42 + TL * Math.cos(SP));
    trailLeg(L, a, b, { w0: 0.18, h0: 0.26, w1: 0.13, h1: 0.16, spade: [0.38, 0.36] });
  }
  // the towing eye on the left trail, the trail clamps of the right
  L.add('steel', new THREE.TorusGeometry(0.07, 0.018, 6, 14).rotateX(Math.PI / 2).translate(-1.82, 0.32, 3.62));
  L.build(root, { dirt: 0.55 });

  // ---- top carriage with the shield (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const cheek = [[-0.32, 0.66], [-0.12, 1.0], [0.1, 1.22], [0.36, 1.22], [0.56, 0.98], [0.62, 0.68]];
  for (const s of [-1, 1]) T.add('camo', sideProfile(cheek, 0.03).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.19, 0, 0)));
  T.add('camo', box(0.42, 0.06, 0.92, 0, 0.7, 0.15)); // saddle
  for (const s of [-1, 1]) T.add('steel', xTube(s * 0.17, s * 0.24, 0.06, 0.06, 12, TR.y, TR.z)); // trunnion caps
  // shield: narrow between the wheels, wide above them, chamfered top corners, a notch for the barrel
  const SZ = -0.42;
  const half = [[-0.17, 0.66], [-0.17, 1.62], [-0.3, 1.74], [-0.76, 1.74], [-0.93, 1.6], [-0.93, 1.38], [-0.57, 1.36], [-0.57, 0.66]];
  for (const s of [-1, 1]) {
    const pts = half.map(([x, y]) => [s * x, y]);
    if (s > 0) pts.reverse();
    T.add('camo', frontProfile(pts, SZ - 0.006, SZ + 0.006));
  }
  T.add('camo', box(0.34, 0.12, 0.012, 0, 0.72, SZ)); // the shield below the barrel opening
  // folded top edge and the stiffening strips behind it, the sight shutter on the left
  for (const s of [-1, 1]) {
    T.add('dark', box(0.47, 0.022, 0.05, s * 0.53, 1.74, SZ + 0.02));
    T.add('dark', box(0.03, 0.9, 0.04, s * 0.57, 1.06, SZ + 0.025));
    T.add('dark', box(0.03, 0.34, 0.04, s * 0.17, 1.45, SZ + 0.025));
    T.add('steel', rod(V(s * 0.5, 1.3, SZ + 0.03), V(s * 0.22, 0.92, 0.0), 0.016, 6)); // shield stays to the cheeks
  }
  T.add('camo', box(0.16, 0.12, 0.03, -0.42, 1.5, SZ - 0.015));
  T.add('dark', box(0.1, 0.03, 0.02, -0.42, 1.52, SZ - 0.035));
  // handwheels: elevation on the left of the cradle, traverse on the left cheek
  addHandwheel(T, -0.32, 0.96, 0.62, 0.12, -1);
  addHandwheel(T, -0.32, 0.78, 0.25, 0.11, -1);
  T.add('steel', rod(V(-0.21, 0.96, 0.62), V(-0.32, 0.96, 0.62), 0.012, 5));
  T.build(trav, { dirt: 0.5 });

  // ---- cradle (elevation): buffer below and recuperator above the barrel, the elevating arc, the sight
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  E.add('camo', box(0.24, 0.07, 1.78, 0, -0.115, -0.38)); // cradle trough, its guides
  for (const s of [-1, 1]) E.add('camo', box(0.03, 0.16, 1.78, s * 0.12, -0.06, -0.38));
  E.add('camo', zTube(-1.32, 0.42, 0.068, 0.068, 14, 0, -0.2)); // buffer
  E.add('dark', zTube(-1.36, -1.32, 0.058, 0.058, 12, 0, -0.2));
  E.add('camo', zTube(-1.32, 0.3, 0.064, 0.064, 14, 0, 0.17)); // recuperator, the cylinder on top
  E.add('dark', zTube(-1.36, -1.32, 0.054, 0.054, 12, 0, 0.17));
  E.add('dark', zTube(0.3, 0.34, 0.07, 0.07, 14, 0, 0.17));
  // front yoke tying the cylinders round the barrel, the barrel's guide band
  E.add('camo', box(0.27, 0.46, 0.08, 0, -0.01, -1.24).translate(0, 0, 0));
  E.add('dark', zTube(-1.3, -1.18, 0.112, 0.112, 18));
  for (const s of [-1, 1]) E.add('steel', xTube(s * 0.1, s * 0.18, 0.055, 0.055, 12)); // trunnions
  // the mantlet plate on the cradle, closing the shield's opening as the barrel rises
  E.add('camo', box(0.4, 0.56, 0.012, 0, 0.02, -0.71));
  E.add('camo', gearArc(0.42, 0.56, 0.3, 1.25, 0.03, 14, 0.02).translate(-0.15, 0, 0)); // elevating arc, rear underside
  E.add('steel', rod(V(-0.12, 0.05, 0.2), V(-0.3, 0.12, 0.22), 0.016, 6)); // sight bracket
  panoramicSight(E, -0.3, 0.12, 0.22, -1);
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', barrel([[MZ, 0.0], [MZ, 0.072], [-1.2, 0.078], [-0.62, 0.084], [-0.62, 0.098], [0.2, 0.102], [RING0, 0.104], [RING0, 0.0001]]));
  B.add('char', new THREE.CircleGeometry(0.052, 14).rotateY(Math.PI).translate(0, 0, MZ - 0.001));
  if (brake) muzzleBrake(B, MZ + 0.04, 0.115, 0.36);
  // squared breech ring with the slot the block slides through to the right
  const rl = BR - RING0, rz = (RING0 + BR) / 2;
  B.add('camo', box(0.3, 0.07, rl, 0, 0.115, rz));
  B.add('camo', box(0.3, 0.07, rl, 0, -0.115, rz));
  B.add('camo', box(0.07, 0.3, rl, -0.115, 0, rz));
  B.add('camo', box(0.3, 0.3, 0.12, 0, 0, RING0 + 0.06)); // the ring's front, round the chamber
  B.add('dark', box(0.14, 0.08, 0.2, 0, -0.2, 0.55)); // lug for the piston rods
  for (const y of [-0.2, 0.17]) B.add('steel', zTube(-1.1, 0.5, 0.024, 0.024, 8, 0, y)); // piston rods (stay inside the cylinders)
  B.add('steel', rod(V(0.15, 0.13, 0.8), V(0.2, 0.2, 0.95), 0.012, 5)); // firing lever
  B.build(rc, { dirt: 0.15, y0: TR.y });

  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  K.add('camo', box(0.24, 0.16, rl - 0.02, 0.0, 0, 0));
  K.add('char', new THREE.CircleGeometry(0.055, 14).translate(-0.0, 0, rl / 2 - 0.009));
  K.add('dark', box(0.04, 0.04, 0.12, 0.1, 0.09, 0.05)); // operating handle
  K.add('steel', rod(V(0.1, 0.1, 0.12), V(0.18, 0.18, 0.3), 0.014, 5));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.24);

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 1.6, 0.6);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, brake ? MZ - 0.32 : MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  const sh = buildShell('lefh18');
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 1.9, 0.1, 2.4);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), BR + 0.06), 'lefh18');
  rig.recoilLength = 1.15; // full recoil at low elevation; the variable recoil shortens it as the barrel rises
  rig.loadEl = 4 * Math.PI / 180; // GUNS.lefh18.loadEl
  floorFade(rig, TR.y, BR + 0.04, 0.21, 0.1, 0.3);
  rig.slideMats = ['camo', 'steel', 'char'];

  // crew (x right, z back; headings face the gun)
  crew(rig, 'officer', -2.3, 1.7, L90, 'point');
  crew(rig, 'layer', -0.75, 0.75, L90, 'lay');
  crew(rig, 'loader', 0.55, 1.75, 0, 'ram');
  crew(rig, 'rammer', -0.45, 2.15, 0, 'ram');
  crew(rig, 'shell', 1.25, 2.3, R90, 'carry');
  crew(rig, 'cartridge', 1.1, 3.0, R90, 'carry');
  crew(rig, 'lanyard', 1.0, 0.95, R90, 'lanyard');

  hb(rig, -1.0, 0, -2.3, 1.0, 1.8, 0.7);
  hb(rig, -1.9, 0, 0.4, 1.9, 0.6, 3.5);
  return finishRig(rig, 'lefh18', 'lefh18');
}

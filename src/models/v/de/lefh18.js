import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, rivets, rivetRow, rivetPoly, loft, xf, scaleUV } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, ring, TAU, L90, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { slidingBlock, barrel, discWheel } from './common.js';

/**
 * 10.5 cm leichte Feldhaubitze 18 (M): the leFH 18 with the double-baffle muzzle brake of 1941, the version most
 * divisional batteries had in the West in 1944 (refs/lefh18/README.md). Built from museum examples (Saumur,
 * Warsaw, Hameenlinna, Smolensk, Tekniikan museo), the Wa Z5 factory photograph of the 18/39 and the 1945 US
 * Catalog of Enemy Ordnance (18 (M): wooden wheels with rubber tyres, split trails with folding spades, a 4 mm
 * shield, hand brakes; width 1.99 m, height 1.75 m, length in action 6.22 m, trail spread 4.83 m, recoil 1.0 to
 * 1.19 m). The L/28 barrel (2.94 m) lies almost wholly ahead of the shield: the breech ring sits just behind it,
 * over the axle, and the cradle runs on behind as two guide rails for the 1.19 m recoil, so at high elevation the
 * breech goes down between the trails. The recuperator is the cylinder above the barrel, the buffer is in the
 * cradle below it; one spring equilibrator stands to the right of the barrel behind the shield; the sliding block
 * leaves the ring to the right, its handle loop is on the left; the panoramic sight (Rbl F 32) looks through the
 * window in the left half of the shield; traverse handwheel on the left, elevation handwheel on the right.
 *
 * Rig as bl6.js (DESIGN.md "Models", "WW2 mode"): origin on the ground under the axle centre, front -Z.
 * `traverse` is the top carriage with the shield, turning on the axle. The real top carriage traverses 28 degrees
 * each way; the game slews further (the crew shifting the trails), so beyond TOP (25 degrees) the lower carriage
 * (`carriage`: wheels, axle, trails, the lower shield) turns with it (rig.setTraverse). `elevation` at the
 * trunnions, `recoil` slides the barrel back along +Z, `breech` the sliding block (setBreech slides it +X).
 * buildLeFH18({ scheme: 'dgelb' | 'feldgrau', brake: true, wheels: 'wood' | 'disc' }) ('disc': the motorised batteries'
 * light-alloy wheel with lightening holes and solid rubber, approximated by the shared disc wheel)
 */
const DEG = Math.PI / 180;
const TR = { y: 1.16, z: -0.08 }; // trunnion axis in root space (the bore axis at 0 degrees)
const BR = 0.44, RING0 = BR - 0.42; // breech face and the front of the 0.42 m breech ring, from the trunnion
const MZ = BR - 2.94; // muzzle face: L/28, 2.94 m (Wikipedia "10.5 cm leFH 18")
const SZ = -0.45; // front face of the shield (root z)
const TOP = 25 * DEG; // the top carriage's own traverse each way (56 degrees in all; kept a little short of it so the
// recoiling breech clears the trails at high elevation)
const WR = 0.65, WX = 0.83; // wheel radius (1300 mm, Wa Z5) and half track (1.99 m over the hub caps)
const SP = 30 * DEG, TL = 3.1; // trail half-spread and length in plan from the hinge
const HINGE = { x: 0.5, y: 0.58, z: 0.3 };

export function buildLeFH18({ scheme = 'dgelb', brake = true, wheels = 'wood' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---- lower carriage: axle, wheels, trail hinges, trails and spades, the lower shield (does not traverse)
  const carriage = new THREE.Group();
  carriage.name = 'carriage';
  root.add(carriage);
  const L = rig.part();
  for (const s of [-1, 1]) {
    if (wheels === 'disc') discWheel(L, s * WX, WR, { R: WR, tw: 0.11, holes: 14, side: s, hub: 0.13 });
    else woodWheel(L, s * WX, WR, s);
  }
  // cranked axle: the stubs at hub height, the body low between the wheels so that at high elevation the
  // cradle's tail and the breech pass over it between the trails
  for (const s of [-1, 1]) {
    L.add('dark', xTube(s * 0.47, s * (WX - 0.1), 0.045, 0.045, 12, WR, 0));
    L.add('camo', rbox(0.13, 0.32, 0.22, 0.02, s * 0.47, 0.53, 0));
  }
  L.add('camo', rbox(0.84, 0.13, 0.2, 0.02, 0, 0.455, 0)); // axle body with the pivot of the top carriage
  L.add('dark', yTube(0.52, 0.545, 0.14, 0.14, 20, 0, 0.0)); // traversing race
  for (const s of [-1, 1]) {
    // trail hinge lugs on the axle body, the vertical hinge pins
    for (const y of [0.375, 0.785]) L.add('camo', box(0.22, 0.07, 0.22, s * 0.48, y, 0.17));
    L.add('steel', yTube(0.33, 0.83, 0.024, 0.024, 8, s * HINGE.x, 0.24));
    L.add('steel', yTube(0.82, 0.84, 0.036, 0.036, 8, s * HINGE.x, 0.24));
    // hand brake: lever on the axle body, the band drum is inside the hub (Catalog of Enemy Ordnance)
    L.add('dark', rod(V(s * 0.6, 0.62, 0.1), V(s * 0.6, 0.98, 0.3), 0.014, 6));
    L.add('dark', yTube(0.97, 1.03, 0.022, 0.022, 8, s * 0.6, 0.3));
    L.add('dark', box(0.06, 0.1, 0.08, s * 0.6, 0.62, 0.12));
    trail(L, s);
  }
  L.add('dark', xTube(-0.6, 0.6, 0.012, 0.012, 6, 0.6, 0.13)); // brake cross shaft
  // lower shield (Unterschild): hangs from the axle in action, folds up for the march
  const apron = [[-0.56, 0.715], [0.56, 0.715], [0.56, 0.33], [0.48, 0.25], [-0.48, 0.25], [-0.56, 0.33]];
  L.add('camo', plate(apron, [], -0.345, -0.335));
  L.add('dark', xTube(-0.55, 0.55, 0.013, 0.013, 8, 0.72, -0.335)); // hinge rod
  for (const x of [-0.42, 0, 0.42]) L.add('camo', xTube(x - 0.06, x + 0.06, 0.02, 0.02, 8, 0.72, -0.335));
  for (const s of [-1, 1]) L.add('dark', rod(V(s * 0.4, 0.44, -0.335), V(s * 0.36, 0.47, -0.1), 0.012, 5));
  L.add('camo', rivetPoly(apron, (u, v) => V(u, v, -0.345), 0.025, 0.11, V(0, 0, -1), 0.008));
  L.build(carriage, { dirt: 0.55 });

  // ---- top carriage with the shield (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  // the two cheeks rising to the trunnion bearings from the pivot plate on the race; open between them so the
  // cradle's tail swings down through the top carriage
  T.add('camo', yTube(0.545, 0.565, 0.16, 0.16, 20, 0, 0)); // pivot plate
  for (const s of [-1, 1]) T.add('camo', box(0.03, 0.03, 0.6, s * 0.205, 0.555, -0.03));
  T.add('camo', box(0.44, 0.06, 0.07, 0, 0.6, -0.29)); // front transom
  const cheek = [[-0.33, 0.54], [-0.31, 1.0], [-0.2, 1.2], [0.02, 1.22], [0.16, 1.08], [0.3, 0.88], [0.3, 0.54]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(cheek, 0.025).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.205, 0, 0)));
    T.add('camo', xTube(s * 0.2175, s * 0.255, 0.075, 0.075, 16, TR.y, TR.z)); // trunnion bearing
    T.add('steel', xTube(s * 0.255, s * 0.268, 0.05, 0.05, 12, TR.y, TR.z));
    T.add('camo', rivetRow(V(s * 0.218, 0.6, -0.3), V(s * 0.218, 0.6, 0.27), 0.08, V(s, 0, 0), 0.008));
    T.add('camo', rivetRow(V(s * 0.218, 1.0, -0.28), V(s * 0.218, 1.15, -0.2), 0.07, V(s, 0, 0), 0.008));
    T.add('camo', box(0.1, 0.24, 0.1, s * 0.25, 0.84, SZ + 0.065)); // shield brackets on the cheeks' fronts
    // shield stays from the wings to the cheek tops
    T.add('dark', rod(V(s * 0.64, 1.44, SZ + 0.015), V(s * 0.23, 1.0, 0.02), 0.012, 6));
  }
  // elevation pinion post on the pivot plate, ahead of the toothed arc
  T.add('dark', box(0.07, 0.17, 0.09, 0, 0.65, -0.2));
  // handwheels on brackets behind the cheeks, facing the rear: traverse on the left, elevation on the right
  for (const s of [-1, 1]) {
    const hz = s < 0 ? 0.44 : 0.46;
    handwheelZ(T, s * 0.37, 0.95, hz, 0.105);
    T.add('dark', zTube(0.16, hz, 0.013, 0.013, 6, s * 0.37, 0.95));
    T.add('camo', box(0.11, 0.13, 0.15, s * 0.275, 0.93, 0.16)); // gear box on the cheek
  }
  T.add('dark', rod(V(0.3, 0.88, 0.14), V(0.035, 0.7, -0.2), 0.012, 5)); // elevating shaft to the pinion
  // panoramic sight mount (Rundblickfernrohr 32) on the left cheek, kept upright by the range drum
  const sx = -0.38, sz = -0.24;
  T.add('camo', box(0.17, 0.05, 0.08, -0.3, 1.04, sz));
  T.add('camo', yTube(1.04, 1.2, 0.03, 0.03, 10, sx, sz));
  T.add('dark', xTube(sx - 0.075, sx - 0.03, 0.048, 0.048, 14, 1.12, sz + 0.02)); // range drum
  T.add('steel', xTube(sx - 0.078, sx - 0.072, 0.05, 0.05, 14, 1.12, sz + 0.02));
  T.add('dark', yTube(1.2, 1.36, 0.032, 0.032, 10, sx, sz));
  T.add('dark', yTube(1.36, 1.41, 0.042, 0.04, 14, sx, sz)); // azimuth ring
  T.add('steel', yTube(1.385, 1.395, 0.044, 0.044, 14, sx, sz));
  T.add('dark', box(0.065, 0.08, 0.075, sx, 1.45, sz - 0.005)); // the rotating head behind the shield window
  T.add('glass', box(0.045, 0.04, 0.004, sx, 1.455, sz - 0.044));
  T.add('dark', rod(V(sx, 1.29, sz), V(sx - 0.1, 1.32, sz + 0.1), 0.018, 8)); // eyepiece toward the layer
  T.add('dark', rod(V(sx - 0.1, 1.32, sz + 0.1), V(sx - 0.13, 1.325, sz + 0.13), 0.024, 10));

  // the shield: one riveted plate, narrow between the wheels and wide over them, the top edge rising to a hump
  // over the elevation slot; the sight window in the left half (photos: Warsaw, Tekniikan museo, Hameenlinna)
  const half = [[0.56, 0.76], [0.56, 0.97], [0.68, 1.33], [0.93, 1.37], [0.955, 1.42], [0.955, 1.53], [0.925, 1.555], [0.75, 1.575], [0.55, 1.6], [0.4, 1.635], [0.27, 1.69], [0.15, 1.75], [0.0, 1.78]];
  const outline = [[0, 0.76], ...half, ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
  const slot = [[-0.15, 0.84], [0.15, 0.84], [0.15, 1.5]];
  for (let i = 1; i < 10; i++) { const a = (i / 10) * Math.PI; slot.push([0.15 * Math.cos(a), 1.5 + 0.15 * Math.sin(a)]); }
  slot.push([-0.15, 1.5]);
  const win = [[-0.47, 1.42], [-0.29, 1.42], [-0.29, 1.55], [-0.47, 1.55]];
  T.add('camo', plate(outline, [slot, win], SZ, SZ + 0.012));
  // rolled top edge, wings folded back at their outer edges, angle stiffeners on the back
  const top = outline.filter(([, y]) => y >= 1.53);
  for (let i = 0; i < top.length - 1; i++) T.add('camo', rod(V(top[i][0], top[i][1], SZ + 0.006), V(top[i + 1][0], top[i + 1][1], SZ + 0.006), 0.009, 5));
  for (const s of [-1, 1]) {
    T.add('camo', box(0.012, 0.13, 0.06, s * 0.95, 1.475, SZ + 0.04));
    T.add('camo', box(0.03, 0.56, 0.03, s * 0.2, 1.12, SZ + 0.027));
    T.add('camo', box(0.62, 0.03, 0.03, s * 0.62, 1.38, SZ + 0.027));
    T.add('camo', box(0.03, 0.4, 0.03, s * 0.53, 0.96, SZ + 0.027));
  }
  T.add('camo', box(1.08, 0.03, 0.03, 0, 0.8, SZ + 0.027));
  const sr = [];
  for (const s of [-1, 1]) {
    for (let y = 0.84; y <= 1.36; y += 0.105) sr.push(V(s * 0.2, y, SZ - 0.001));
    for (let x = 0.36; x <= 0.9; x += 0.11) sr.push(V(s * x, 1.38, SZ - 0.001));
    for (let y = 0.8; y <= 1.15; y += 0.1) sr.push(V(s * 0.53, y, SZ - 0.001));
  }
  T.add('camo', rivets(sr, V(0, 0, -1), 0.009));
  T.add('camo', rivetPoly(outline, (u, v) => V(u, v, SZ - 0.001), 0.025, 0.1, V(0, 0, -1), 0.009));
  // the sight window's shutter, swung open to the rear
  T.add('camo', box(0.006, 0.13, 0.17, -0.475, 1.485, SZ + 0.1));
  // the cowl behind the slot that keeps splinters off the layer and loader
  T.add('camo', new THREE.LatheGeometry([[0.175, 1.45], [0.235, 1.765], [0.224, 1.765], [0.164, 1.45], [0.175, 1.45]].map(([r, y]) => new THREE.Vector2(r, y)), 14, -Math.PI / 2, Math.PI).translate(0, 0, SZ + 0.01));
  T.add('camo', new THREE.LatheGeometry([[0.0001, 1.752], [0.235, 1.752], [0.235, 1.766], [0.0001, 1.766]].map(([r, y]) => new THREE.Vector2(r, y)), 14, -Math.PI / 2, Math.PI).translate(0, 0, SZ + 0.01));
  // the equilibrator's upper bracket on the back of the shield (right of the cowl)
  T.add('camo', box(0.07, 0.09, 0.13, 0.27, 1.53, SZ + 0.075));
  T.add('steel', xTube(0.23, 0.31, 0.016, 0.016, 8, 1.52, -0.31));
  // entrenching tools on the shield's front: a spade on the right wing
  T.add('wood', rod(V(0.86, 1.25, SZ - 0.03), V(0.42, 1.5, SZ - 0.03), 0.017, 6));
  T.add('dark', box(0.17, 0.2, 0.012, 0.93, 1.2, SZ - 0.03, 0, 0, 1.05));
  for (const x of [0.5, 0.78]) T.add('dark', box(0.03, 0.05, 0.04, x, 1.45 - (x - 0.5) * 0.57, SZ - 0.02));
  T.build(trav, { dirt: 0.45 });

  // ---- equilibrator: one spring cylinder to the right of the barrel, hung from the shield bracket and pulling
  // up the cradle's front lug (rig.setElevation and rig.update keep it between the two)
  const eqCyl = new THREE.Group(), eqRod = new THREE.Group();
  trav.add(eqCyl, eqRod);
  const QC = rig.part();
  QC.add('camo', yTube(-0.25, -0.015, 0.055, 0.055, 14));
  QC.add('camo', yTube(-0.015, 0.0, 0.06, 0.05, 14));
  QC.add('dark', yTube(-0.27, -0.25, 0.04, 0.05, 12));
  QC.add('dark', xTube(-0.03, 0.03, 0.022, 0.022, 8, 0, 0));
  QC.build(eqCyl, { dirt: 0, y0: 1.4 });
  const QR = rig.part();
  QR.add('steel', yTube(-1, 0, 0.02, 0.02, 8));
  QR.build(eqRod, { dirt: 0, y0: 1.4 });

  // ---- cradle (elevation): the trough under the barrel with the buffer, the recuperator above, the guide
  // rails behind for the recoil, the toothed arc under the trunnions
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  E.add('camo', rbox(0.26, 0.17, 1.4, 0.02, 0, -0.185, -0.8)); // trough, z -1.5..-0.1
  for (const s of [-1, 1]) E.add('dark', box(0.03, 0.012, 1.4, s * 0.1, -0.096, -0.8)); // slide ways
  E.add('camo', zTube(-1.62, -1.5, 0.072, 0.072, 18, 0, -0.185)); // buffer head
  E.add('dark', zTube(-1.66, -1.62, 0.052, 0.058, 14, 0, -0.185));
  E.add('steel', zTube(-1.68, -1.66, 0.02, 0.02, 8, 0, -0.185));
  E.add('camo', zTube(-1.3, -0.1, 0.068, 0.068, 18, 0, 0.185)); // recuperator
  E.add('camo', zTube(-1.34, -1.28, 0.075, 0.075, 18, 0, 0.185));
  E.add('dark', zTube(-1.37, -1.34, 0.05, 0.06, 14, 0, 0.185));
  E.add('steel', yTube(0.24, 0.28, 0.012, 0.012, 6, 0, -1.31)); // filling valve
  E.add('camo', zTube(-0.13, -0.1, 0.075, 0.075, 18, 0, 0.185));
  // front yoke tying the recuperator to the trough, and the rear bracket behind the shield
  for (const zc of [-1.15, -0.17]) {
    for (const s of [-1, 1]) E.add('camo', box(0.02, 0.3, 0.07, s * 0.115, 0.05, zc));
    E.add('camo', zTube(zc - 0.04, zc + 0.04, 0.081, 0.081, 18, 0, 0.185));
  }
  // trunnion bosses and trunnions
  for (const s of [-1, 1]) {
    E.add('camo', box(0.035, 0.2, 0.28, s * 0.1475, -0.02, 0));
    E.add('steel', xTube(s * 0.165, s * 0.2175, 0.05, 0.05, 12));
  }
  // the cradle's tail: two guide rails and a floor, the breech ring runs back between them
  const tz0 = -0.1, tz1 = 1.25, tl = tz1 - tz0, tc = (tz0 + tz1) / 2;
  for (const s of [-1, 1]) {
    E.add('camo', box(0.035, 0.19, tl, s * 0.1625, -0.165, tc));
    E.add('dark', box(0.04, 0.012, tl, s * 0.1625, -0.064, tc));
    E.add('camo', rivetRow(V(s * 0.1805, -0.225, tz0 + 0.05), V(s * 0.1805, -0.225, tz1 - 0.05), 0.09, V(s, 0, 0), 0.006));
  }
  E.add('camo', box(0.36, 0.018, tl, 0, -0.251, tc));
  E.add('camo', box(0.36, 0.09, 0.03, 0, -0.215, tz1 - 0.015));
  // the toothed elevating arc under the trunnions (engages the pinion ahead of it on the top carriage)
  E.add('camo', gearArc(0.315, 0.385, 56 * DEG, 104 * DEG, 0.045, 16, 0.02));
  E.add('camo', box(0.045, 0.06, 0.25, 0, -0.29, 0.06));
  // the equilibrator lug on the right of the trough, ahead of the trunnions
  E.add('camo', box(0.16, 0.05, 0.06, 0.21, -0.12, -0.3));
  E.add('steel', xTube(0.24, 0.3, 0.014, 0.014, 8, -0.12, -0.3));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---- barrel (recoil): monobloc tube, muzzle brake, the breech ring with the block's slot open on the right
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', barrel([[MZ + 0.3, 0.0525], [MZ, 0.0525], [MZ, 0.068], [-1.38, 0.076], [-1.34, 0.09], [-0.6, 0.094], [RING0, 0.096], [RING0, 0.0525], [RING0 - 0.5, 0.0525]], 26)); // the chamber stays open for the round
  let muzzle = MZ;
  if (brake) {
    // the 18 (M)'s two-chamber brake on a sleeve over the muzzle: rear block, middle baffle, the big front block,
    // joined top and bottom, the side ports open (Saumur, Smolensk; Wa Z5 18/39)
    const b0 = MZ - 0.06;
    B.add('camo', zTube(b0 + 0.12, b0, 0.079, 0.079, 20)); // sleeve
    B.add('camo', rbox(0.19, 0.18, 0.08, 0.025, 0, 0, b0 - 0.04));
    B.add('camo', rbox(0.2, 0.19, 0.05, 0.022, 0, 0, b0 - 0.175));
    B.add('camo', rbox(0.22, 0.21, 0.09, 0.03, 0, 0, b0 - 0.355));
    for (const s of [-1, 1]) B.add('camo', box(0.15, 0.03, 0.34, 0, s * 0.083, b0 - 0.21));
    B.add('char', zTube(b0 - 0.4, b0 - 0.08, 0.054, 0.054, 14, 0, 0, true)); // the bore seen through the ports
    B.add('char', new THREE.CircleGeometry(0.056, 16).rotateY(Math.PI).translate(0, 0, b0 - 0.401));
    muzzle = b0 - 0.4;
  } else B.add('char', new THREE.CircleGeometry(0.052, 14).rotateY(Math.PI).translate(0, 0, MZ + 0.3));
  // breech ring: top, bottom and left walls round the block's slot, the front round the chamber
  const rl = BR - RING0, rz = (RING0 + 0.12 + BR) / 2, sl = BR - RING0 - 0.12;
  const disc = [];
  for (let i = 0; i < 16; i++) disc.push([0.064 * Math.cos(-i / 16 * TAU), 0.064 * Math.sin(-i / 16 * TAU)]);
  B.add('camo', plate([[-0.14, -0.145], [0.14, -0.145], [0.14, 0.145], [-0.14, 0.145]], [disc], RING0, RING0 + 0.12)); // ring front round the chamber mouth
  B.add('camo', rbox(0.28, 0.075, sl, 0.01, 0, 0.1075, rz));
  B.add('camo', rbox(0.28, 0.075, sl, 0.01, 0, -0.1075, rz));
  B.add('camo', box(0.07, 0.14, sl, -0.105, 0, rz));
  B.add('char', zTube(RING0 - 0.5, RING0 + 0.12, 0.0525, 0.064, 16, 0, 0, true).scale(-1, 1, 1)); // the dark chamber, seen from inside
  B.add('char', new THREE.CircleGeometry(0.0525, 16).translate(0, 0, RING0 - 0.5));
  // lugs for the recuperator and buffer rods, the rods (long enough to stay in their cylinders at full recoil)
  for (const y of [-0.185, 0.185]) {
    B.add('camo', box(0.09, 0.09, 0.1, 0, y, RING0 - 0.05));
    B.add('steel', zTube(-1.31, RING0 - 0.08, 0.021, 0.021, 8, 0, y));
  }
  // the block's operating loop on the left of the ring, the continuous-pull firing gear on the top right
  for (const y of [0.05, 0.1]) {
    B.add('dark', rod(V(-0.14, y, RING0 + 0.2), V(-0.235, y, RING0 + 0.2), 0.011, 6));
    B.add('dark', rod(V(-0.235, y, RING0 + 0.2), V(-0.235, y, BR - 0.02), 0.011, 6));
    B.add('dark', rod(V(-0.235, y, BR - 0.02), V(-0.14, y, BR - 0.02), 0.011, 6));
  }
  B.add('dark', box(0.06, 0.05, 0.12, 0.09, 0.17, BR - 0.12));
  B.add('steel', rod(V(0.11, 0.19, BR - 0.07), V(0.16, 0.25, BR + 0.03), 0.01, 5)); // firing lever
  B.add('camo', rivets([V(-0.141, 0.11, RING0 + 0.05), V(-0.141, -0.11, RING0 + 0.05), V(-0.141, 0.11, BR - 0.05), V(-0.141, -0.11, BR - 0.05)], V(-1, 0, 0), 0.012));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  K.add('camo', rbox(0.208, 0.138, sl - 0.004, 0.008, 0.034, 0, 0));
  K.add('dark', zTube(sl / 2 - 0.004, sl / 2 + 0.012, 0.03, 0.03, 10, 0, 0)); // firing pin housing
  K.add('char', new THREE.CircleGeometry(0.008, 8).translate(0, 0, sl / 2 + 0.0125));
  K.add('dark', box(0.04, 0.05, 0.03, 0.12, 0.0, sl / 2 + 0.01)); // the block's crank stud
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.24);

  // ---- the equilibrator follows the cradle
  const eqTop = V(0.27, 1.52, -0.31), eqLug = V(0.27, -0.12, -0.3), eqB = V(), eqD = V(), DOWN = V(0, -1, 0);
  const placeEq = () => {
    const e = el.rotation.x, c = Math.cos(e), s = Math.sin(e);
    eqB.set(eqLug.x, el.position.y + eqLug.y * c - eqLug.z * s, el.position.z + eqLug.y * s + eqLug.z * c);
    eqD.copy(eqB).sub(eqTop);
    const len = eqD.length();
    eqD.divideScalar(len || 1);
    eqCyl.position.copy(eqTop);
    eqCyl.quaternion.setFromUnitVectors(DOWN, eqD);
    eqRod.position.copy(eqTop);
    eqRod.quaternion.copy(eqCyl.quaternion);
    eqRod.scale.set(1, len, 1);
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeEq(); };
  rig.update = () => placeEq();
  // the top carriage turns on the axle; beyond TOP the trails are shifted (the lower carriage turns)
  rig.setTraverse = (r) => { trav.rotation.y = r; carriage.rotation.y = r - Math.max(-TOP, Math.min(TOP, r)); };
  placeEq();

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 1.6, 0.7);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, muzzle);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // No loading tray on the leFH 18 (none on the surviving guns, refs/lefh18): the round went into the open breech by
  // hand and the rammer (Ansetzer) seated it. `tray`, where the crew lays the round (crews.js), is on the bore: the round's
  // middle just inside the breech face, its nose at the chamber mouth, its base out for the rammer's head, so it
  // lies in the ring instead of hanging in the air over the cradle's tail (0.19 m above its floor).
  const sh = buildShell('lefh18'), mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  rig.anchors.shellStack = node(root, 'shellStack', 2.2, 0.1, 1.9);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), 'lefh18'); // (the model viewer's round, same place)
  rig.recoilLength = 1.19; // 46.8 in at low elevation, 39.3 in at the top (Catalog of Enemy Ordnance)
  rig.loadEl = 4 * DEG; // GUNS.lefh18.loadEl
  floorFade(rig, TR.y, BR + 0.04, 0.16, 0.08, 0.3);
  const floor = rig.recoilFade;
  rig.recoilFade = (e) => Math.min(floor(e), 1 - 0.16 * Math.min(1, Math.max(0, e) / (40 * DEG)));
  rig.slideMats = ['camo', 'steel', 'char'];
  rig.nest = [[0, 0.185], [0, -0.185]]; // the rods slide into the recuperator and the buffer

  // crew (x right, z back; headings face the gun)
  crew(rig, 'officer', -2.5, 1.4, L90, 'point');
  crew(rig, 'layer', -1.05, 0.8, L90, 'lay');
  crew(rig, 'loader', -0.35, 1.8, 0, 'ram');
  crew(rig, 'rammer', -0.4, 2.3, 0, 'ram');
  crew(rig, 'shell', 2.0, 1.2, R90, 'carry');
  crew(rig, 'cartridge', 1.1, 3.0, R90, 'carry');
  crew(rig, 'lanyard', 1.3, 0.7, R90, 'lanyard');

  hb(rig, -1.0, 0, -3.0, 1.0, 1.8, 0.6);
  hb(rig, -2.4, 0, 0.3, 2.4, 0.75, 3.2);
  return finishRig(rig, 'lefh18', 'lefh18');
}

// ---------------------------------------------------------------- parts

// A flat plate from a front outline [x, y] with holes, between z0 and z1.
function plate(outline, holes, z0, z1) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 6 });
  return g.translate(0, 0, Math.min(z0, z1));
}

// Handwheel facing the rear (axis along Z): rim, five spokes, hub and a crank handle.
function handwheelZ(P, x, y, z, R) {
  P.add('dark', new THREE.TorusGeometry(R, 0.011, 6, 22).translate(x, y, z));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    P.add('dark', rod(V(x, y, z), V(x + Math.cos(a) * R, y + Math.sin(a) * R, z), 0.0065, 4));
  }
  P.add('dark', zTube(z - 0.03, z + 0.03, 0.022, 0.022, 10, x, y));
  P.add('dark', zTube(z, z + 0.08, 0.01, 0.01, 6, x + R * Math.cos(0.3 + TAU / 10), y + R * Math.sin(0.3 + TAU / 10)));
  P.add('dark', zTube(z + 0.04, z + 0.09, 0.015, 0.015, 6, x + R * Math.cos(0.3 + TAU / 10), y + R * Math.sin(0.3 + TAU / 10)));
}

// The 1300 mm artillery wheel of the horse-drawn and most 1944 batteries: fourteen painted wooden spokes in a
// wooden felloe with a steel band and a ribbed solid rubber tyre (110 mm), the steel hub flange with twelve
// bolts, the hub cap and the brake drum inside (Saumur leFH 18M; IWM B 7600, Normandy 1944). Axis along X.
function woodWheel(P, x, y, side) {
  const at = (g) => g.applyMatrix4(xf(x, y, 0));
  const R = WR;
  P.add('tyre', at(ring(R - 0.05, R - 0.012, -0.055, 0.055, 56)));
  for (const [a, b] of [[-0.055, -0.021], [-0.016, 0.016], [0.021, 0.055]]) P.add('tyre', at(ring(R - 0.022, R, a, b, 56)));
  P.add('dark', at(ring(R - 0.062, R - 0.05, -0.05, 0.05, 48))); // steel band under the rubber
  P.add('camo', at(scaleUV(ring(R - 0.125, R - 0.062, -0.042, 0.042, 42), 0.9, 0.06)), { uv: true }); // felloe
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.11, ca = Math.cos(a), sa = Math.sin(a);
    // dished: the spokes lean out from the hub to the felloe
    P.add('camo', at(taper(V(side * -0.025, ca * 0.1, sa * 0.1), V(side * 0.006, ca * (R - 0.11), sa * (R - 0.11)), 0.036, 0.024, 7)));
    P.add('dark', at(box(0.09, 0.012, 0.055, 0, ca * (R - 0.131), sa * (R - 0.131), a))); // spoke shoe
  }
  P.add('camo', at(scaleUV(xTube(-0.1, 0.1, 0.11, 0.11, 18), 0.17, 0.05)), { uv: true }); // nave
  P.add('camo', at(xTube(side * 0.085, side * 0.1, 0.175, 0.175, 22))); // outer hub flange
  P.add('camo', at(xTube(-side * 0.1, -side * 0.085, 0.16, 0.16, 22))); // inner flange
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    P.add('steel', at(xTube(side * 0.1, side * 0.112, 0.011, 0.011, 6, Math.cos(a) * 0.145, Math.sin(a) * 0.145)));
  }
  P.add('dark', at(xTube(side * 0.1, side * 0.2, 0.07, 0.058, 14))); // hub cap
  P.add('steel', at(xTube(side * 0.2, side * 0.222, 0.04, 0.04, 6)));
  P.add('dark', at(xTube(-side * 0.1, -side * 0.165, 0.15, 0.15, 20))); // brake drum
}

// A cylinder from a (radius r0) to b (radius r1).
function taper(a, b, r0, r1, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// One leg of the split trail (s = -1 left, +1 right): a riveted box girder from its hinge on the axle body to
// the trail end, which carries the folding spade (down, in action), the lifting handle and the handspike
// socket; the towing eye on the left leg, the coupling jaw on the right. Built straight in plan, sloping down.
function trail(P, s) {
  const dir = V(s * Math.sin(SP), 0, Math.cos(SP)), lat = V(Math.cos(SP), 0, -s * Math.sin(SP)), up = V(0, 1, 0);
  const out = s; // the outer side is +lat on the right leg, -lat on the left
  const yc = (t) => HINGE.y + (0.3 - HINGE.y) * (t / TL), hh = (t) => 0.34 + (0.2 - 0.34) * (t / TL), ww = (t) => 0.21 + (0.16 - 0.21) * (t / TL);
  const tp = (t, du, dv) => V(s * HINGE.x + dir.x * t + lat.x * du, yc(t) + dv, HINGE.z + dir.z * t + lat.z * du);
  const sec = (t, x0, x1, y0, y1) => [tp(t, x0, y0), tp(t, x1, y0), tp(t, x1, y1), tp(t, x0, y1)];
  const st = [0, 0.8, 1.6, 2.4, TL];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    P.add('camo', loft([sec(a, -ww(a) / 2, ww(a) / 2, -hh(a) / 2, hh(a) / 2), sec(b, -ww(b) / 2, ww(b) / 2, -hh(b) / 2, hh(b) / 2)]));
    // top and bottom flange plates, a little wider than the webs
    for (const k of [1, -1]) {
      const fa = k * hh(a) / 2, fb = k * hh(b) / 2;
      P.add('camo', loft([sec(a, -ww(a) / 2 - 0.014, ww(a) / 2 + 0.014, Math.min(fa, fa + k * 0.012), Math.max(fa, fa + k * 0.012)),
        sec(b, -ww(b) / 2 - 0.014, ww(b) / 2 + 0.014, Math.min(fb, fb + k * 0.012), Math.max(fb, fb + k * 0.012))]));
    }
  }
  // rivet rows: both edges of the top flange, the bottom of the outer web
  const rp = [];
  for (let t = 0.1; t < TL - 0.15; t += 0.11) {
    rp.push(tp(t, -ww(t) / 2 + 0.018, hh(t) / 2 + 0.012), tp(t, ww(t) / 2 - 0.018, hh(t) / 2 + 0.012));
  }
  P.add('camo', rivets(rp, up, 0.0085));
  const rw = [];
  for (let t = 0.1; t < TL - 0.15; t += 0.11) rw.push(tp(t, out * (ww(t) / 2 + 0.001), -hh(t) / 2 + 0.03));
  P.add('camo', rivets(rw, lat.clone().multiplyScalar(out), 0.0085));
  // a lifting ring on the outer web, the stowed handspike (Richtbaum) along the right leg
  P.add('steel', new THREE.TorusGeometry(0.045, 0.009, 5, 12).rotateY(Math.PI / 2).applyMatrix4(frameAt(tp(1.5, out * (ww(1.5) / 2 + 0.012), 0), lat, up, dir)));
  if (s > 0) {
    P.add('wood', rod(tp(0.55, ww(0.55) / 2 + 0.045, 0.02), tp(2.45, ww(2.45) / 2 + 0.045, 0.02), 0.024, 7));
    for (const t of [0.75, 2.2]) P.add('dark', rod(tp(t, ww(t) / 2 - 0.005, 0.02), tp(t, ww(t) / 2 + 0.075, 0.02), 0.03, 6));
  } else {
    // the barrel travel lock folded down on the left leg
    const t = 1.05;
    P.add('dark', loft([sec(t - 0.12, -0.05, 0.05, hh(t) / 2 + 0.012, hh(t) / 2 + 0.04), sec(t + 0.12, -0.05, 0.05, hh(t) / 2 + 0.012, hh(t) / 2 + 0.04)]));
    P.add('steel', rod(tp(t - 0.1, -0.07, hh(t) / 2 + 0.03), tp(t - 0.1, 0.07, hh(t) / 2 + 0.03), 0.014, 6));
  }
  // the trail end: everything below in a frame on the ground under the end, x across, z back along the leg
  const end = tp(TL, 0, 0), M = frameAt(V(end.x, 0, end.z), lat, up, dir);
  const at = (g) => g.applyMatrix4(M);
  P.add('camo', at(box(0.19, 0.22, 0.26, 0, 0.31, -0.08)));
  // the spade (Erdsporn), swung down from its hinge over the end and dug in: a broad raked blade with its
  // side wings turned forward and two ribs on the back (Wa Z5 photograph of the 18/39 in action)
  const rake = -0.3;
  P.add('camo', at(box(0.56, 0.64, 0.025, 0, 0.14, 0.17, rake)));
  for (const x of [-0.27, 0.27]) P.add('camo', at(box(0.025, 0.58, 0.16, x, 0.15, 0.1, rake)));
  for (const x of [-0.13, 0.13]) P.add('camo', at(box(0.03, 0.55, 0.05, x, 0.14, 0.205, rake)));
  P.add('steel', at(xTube(-0.2, 0.2, 0.025, 0.025, 10, 0.44, 0.07)));
  for (const x of [-0.09, 0.09]) P.add('camo', at(box(0.04, 0.12, 0.13, x, 0.4, 0.02)));
  // lifting handle and the handspike socket on top of the end
  for (const x of [-0.05, 0.05]) P.add('steel', at(rod(V(x, 0.42, -0.2), V(x, 0.6, -0.12), 0.011, 6)));
  P.add('steel', at(rod(V(-0.05, 0.6, -0.12), V(0.05, 0.6, -0.12), 0.011, 6)));
  P.add('dark', at(zTube(-0.16, -0.03, 0.032, 0.032, 10, 0, 0.45)));
  if (s < 0) {
    P.add('steel', at(zTube(-0.05, 0.16, 0.03, 0.03, 10, 0, 0.45))); // towing eye (lunette) for the limber
    P.add('steel', at(new THREE.TorusGeometry(0.07, 0.022, 8, 16).translate(0, 0.45, 0.23)));
  } else {
    P.add('dark', at(box(0.07, 0.08, 0.1, -0.06, 0.3, 0.06))); // jaw that couples the legs on the march
    P.add('steel', at(rod(V(-0.06, 0.34, 0.08), V(-0.13, 0.34, 0.08), 0.012, 6)));
  }
}

// a matrix with the given origin and basis (x across, y up, z along)
function frameAt(o, x, y, z) {
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
}

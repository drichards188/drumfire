import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, rivets, rivetRow, rivetPoly, loft, xf } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, ring, addHandwheel, TAU, L90, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { slidingBlock, barrel, panoramicSight } from './common.js';

/**
 * 10 cm Kanone 17 (Krupp, 1917): the long L/45 barrel of the K 17 on the carriage of the K 14 (refs/k17: the
 * guns at Niagara Falls, Fort Sill and Koblenz, the NYT photograph of 29 September 1918). Not the K 04 (L/35, no
 * shield as a rule, 30 degrees of elevation) nor the K 14 (the same carriage with the L/35 barrel): the K 17 is
 * told by its very long, slim barrel lying on a long riveted box cradle that reaches two fifths of the way to the
 * muzzle (the buffer and recuperator inside, a round head in front), the tall squared breech ring with the
 * horizontal sliding block (Schubkurbelverschluss) far behind the axle, and the wide shield whose upper part
 * overhangs the wheels, cut by a deep slot for the barrel with a curved cover behind it. Wooden wheels of 1.36 m
 * with steel tyres and shoe brakes, a lower shield hung from the axle, a long box trail of two riveted girders
 * (lightening holes, a floor at the rear) with the spade, the lunette and the handspike at its end. The top
 * carriage is an A of two cheeks rising to the trunnions behind the axle and running back as girders to their
 * slide on the trail (3 degrees each way). Barrel 4.725 m, 3,200 to 3,300 kg in action, elevation -2 to +45
 * degrees; it travelled in two loads (the barrel on its own wagon). Proportions read from the side and front
 * photographs, scaled by the barrel length (refs/k17/README.md).
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z. `traverse` is the top carriage
 * with the upper shield, turning on the axle; beyond TOP the lower carriage (`carriage`: wheels, axle, trail, the
 * lower shield) turns with it (rig.setTraverse: the trail shifted with the handspike, the top carriage recentred). `elevation` at the
 * trunnions, `recoil` slides the barrel back along +Z, `breech` the sliding block (setBreech slides it +X).
 * buildK17({ scheme: 'bunt' | any CAMO key })
 */
const DEG = Math.PI / 180;
const WR = 0.68, WX = 0.84; // wheel radius (1.36 m) and wheel centre plane (1.68 m track)
const TR = { y: 1.48, z: 0.35 }; // trunnion axis in root space (the bore at 0 degrees), behind the axle
const BR = 0.62, RING0 = 0.24; // breech face and front of the breech ring along the bore from the trunnion
const MZ = BR - 4.725; // muzzle face: L/45
const STEP = -2.15; // where the slim chase meets the jacket, at the cradle's nose
const RG = { w: 0.38, top: 0.18, bot: -0.24 }; // the breech ring: deeper below the bore than above
const CR = { top: -0.155, bot: -0.46, w: 0.32, z0: -2.45, z1: 0.2 }; // the cradle box under the barrel
const SZ = -0.25; // front face of the shield (root z)
const TOP = 3 * DEG; // the top carriage's own traverse each way (de.wikipedia: 3 degrees right and left)
const TZ0 = 0.1, TZ1 = 3.9; // trail girders from the axle to the trail end
const xi = (z) => 0.42 - 0.16 * (z - TZ0) / (TZ1 - TZ0); // inner face of a girder
const yc = (z) => 0.7 - 0.38 * (z - TZ0) / (TZ1 - TZ0); // girder centre height
const gh = (z) => 0.36 - 0.16 * (z - TZ0) / (TZ1 - TZ0); // girder depth
const GW = 0.1; // girder width

export function buildK17({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---------------------------------------------------------------- lower carriage (turns only beyond TOP)
  const carriage = new THREE.Group();
  carriage.name = 'carriage';
  root.add(carriage);
  const L = rig.part();
  for (const s of [-1, 1]) woodWheel(L, s * WX, s);
  // axle arms into the naves, the axle tree between the girders with the pivot plate of the top carriage
  for (const s of [-1, 1]) L.add('dark', xTube(s * 0.42, s * (WX + 0.12), 0.05, 0.05, 12, WR, 0));
  L.add('camo', rbox(0.86, 0.14, 0.22, 0.02, 0, 0.665, 0));
  L.add('dark', yTube(0.735, 0.745, 0.16, 0.16, 20, 0, 0.0));
  // shoe brakes on the tyres, low in front, on a cross shaft with its spring (front photograph)
  L.add('dark', xTube(-0.8, 0.8, 0.018, 0.018, 8, 0.36, 0.36));
  for (let i = 0; i < 6; i++) L.add('steel', new THREE.TorusGeometry(0.03, 0.007, 4, 10).rotateY(Math.PI / 2).translate(0.1 + i * 0.022, 0.36, 0.36));
  for (const s of [-1, 1]) {
    const a = 0.5, sx = s * WX, sy = WR - Math.sin(a) * (WR + 0.03), sz = Math.cos(a) * (WR + 0.03);
    L.add('dark', box(0.1, 0.045, 0.24, sx, sy, sz, a - Math.PI / 2)); // the shoe, tangent to the tyre behind the wheel
    L.add('dark', rod(V(s * 0.8, 0.36, 0.36), V(sx, sy - 0.02, sz - 0.04), 0.014, 5));
    L.add('dark', rod(V(s * 0.6, 0.36, 0.36), V(s * 0.55, 0.62, 0.12), 0.012, 5)); // the brake arm to the axle tree
  }
  trail(L);
  // the lower shield (Unterschild) hung from the axle tree between the wheels, its corners rounded
  const apron = [[-0.74, 0.96], [0.74, 0.96], [0.74, 0.58], [0.72, 0.5], [0.66, 0.44], [0.58, 0.42], [-0.58, 0.42], [-0.66, 0.44], [-0.72, 0.5], [-0.74, 0.58]];
  L.add('camo', plate(apron, [], SZ - 0.016, SZ - 0.004));
  L.add('camo', box(0.03, 0.52, 0.02, 0, 0.69, SZ - 0.02)); // the joint strap down the middle
  for (const s of [-1, 1]) L.add('camo', box(0.1, 0.12, 0.25, s * 0.33, 0.67, -0.14)); // hangers to the axle tree
  L.add('camo', rivetPoly(apron, (u, v) => V(u, v, SZ - 0.017), 0.03, 0.12, V(0, 0, -1), 0.008));
  L.add('camo', rivetRow(V(0, 0.48, SZ - 0.031), V(0, 0.92, SZ - 0.031), 0.1, V(0, 0, -1), 0.008));
  L.build(carriage, { dirt: 0.55 });

  // ---------------------------------------------------------------- top carriage with the upper shield (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  T.add('camo', yTube(0.745, 0.765, 0.17, 0.17, 20, 0, 0)); // pivot plate on the axle tree
  T.add('camo', box(0.53, 0.04, 0.42, 0, 0.765, 0.02)); // floor plate between the cheeks
  // the cheeks: tall at the trunnions, running back as girders to their slide on the trail; low behind the
  // trunnions so the open block clears them and the breech goes down between them at high elevation
  const cheek = [[-0.2, 0.745], [-0.2, 1.2], [-0.05, 1.46], [0.18, 1.6], [0.44, 1.6], [0.47, 1.45], [0.47, 1.0], [0.62, 0.9], [1.0, 0.89], [1.75, 0.88], [1.75, 0.73], [1.0, 0.77], [0.6, 0.8], [0.42, 0.745]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(cheek, 0.03).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.28, 0, 0)));
    // flanges along the top edge and the bottom, rivet rows
    T.add('camo', rod(V(s * 0.28, 1.0, 0.47), V(s * 0.28, 0.89, 0.63), 0.016, 6));
    T.add('camo', rod(V(s * 0.28, 0.89, 0.63), V(s * 0.28, 0.875, 1.74), 0.016, 6));
    T.add('camo', rod(V(s * 0.28, 0.8, 0.6), V(s * 0.28, 0.77, 1.0), 0.016, 5));
    T.add('camo', rod(V(s * 0.28, 0.77, 1.0), V(s * 0.28, 0.735, 1.74), 0.016, 5));
    T.add('camo', rivetRow(V(s * 0.296, 0.8, -0.15), V(s * 0.296, 0.8, 0.35), 0.09, V(s, 0, 0), 0.008));
    T.add('camo', rivetRow(V(s * 0.296, 0.85, 0.7), V(s * 0.296, 0.84, 1.7), 0.09, V(s, 0, 0), 0.008));
    T.add('camo', rivetRow(V(s * 0.296, 1.13, -0.12), V(s * 0.296, 1.45, 0.1), 0.08, V(s, 0, 0), 0.008));
    // trunnion bearing and its cap
    T.add('camo', xTube(s * 0.265, s * 0.33, 0.095, 0.095, 18, TR.y, TR.z));
    T.add('dark', box(0.075, 0.03, 0.22, s * 0.3, TR.y + 0.1, TR.z));
    for (const z of [-0.08, 0.08]) T.add('steel', yTube(TR.y + 0.11, TR.y + 0.14, 0.014, 0.014, 6, s * 0.3, TR.z + z));
    // the slide shoe at the girder's end, resting on the trail girder
    T.add('dark', box(0.16, 0.04, 0.18, s * 0.35, 0.74, 1.66));
    T.add('camo', box(0.04, 0.1, 0.16, s * 0.285, 0.8, 1.66)); // its bracket down from the girder
    // shield brackets on the cheek fronts and the stays from the shield wings
    T.add('camo', box(0.06, 0.32, 0.05, s * 0.28, 1.1, -0.215));
    T.add('dark', rod(V(s * 0.72, 1.55, SZ + 0.015), V(s * 0.3, 1.05, 0.2), 0.012, 6));
  }
  // elevation pinion on the left cheek under the toothed arc
  T.add('dark', xTube(-0.265, -0.2, 0.035, 0.035, 10, 0.955, TR.z));
  T.add('camo', box(0.08, 0.1, 0.14, -0.33, 0.96, TR.z));
  // handwheels: elevation and traverse on the left (the layer's), a second elevation wheel on the right
  addHandwheel(T, -0.52, 1.1, 0.42, 0.13, -1);
  T.add('dark', xTube(-0.52, -0.295, 0.016, 0.016, 6, 1.1, 0.42));
  addHandwheel(T, -0.58, 0.83, 1.08, 0.09, -1);
  T.add('dark', xTube(-0.58, -0.295, 0.014, 0.014, 6, 0.83, 1.08));
  addHandwheel(T, 0.5, 1.15, 0.42, 0.11, 1);
  T.add('dark', xTube(0.295, 0.5, 0.014, 0.014, 6, 1.15, 0.42));
  // the sight on the left: the range drum by the trunnion, the panoramic sight on its bracket
  T.add('dark', xTube(-0.375, -0.34, 0.11, 0.11, 18, 1.36, 0.27));
  T.add('steel', xTube(-0.38, -0.375, 0.112, 0.112, 18, 1.36, 0.27));
  T.add('dark', box(0.04, 0.03, 0.06, -0.39, 1.45, 0.27)); // the drum's index
  T.add('camo', box(0.16, 0.04, 0.08, -0.37, 1.42, 0.12));
  panoramicSight(T, -0.44, 1.44, 0.12, -1);

  // the shield: two halves either side of the barrel slot, narrow over the lower shield, wide over the wheels, the
  // wide upper part bent back along the shoulder line (it shows as a slanted plate above the wheel from the side);
  // the rolled top edge, stiffeners on the back (photographs: Niagara Falls front, side and rear, Koblenz)
  const HY = 1.6, BEND = 25 * DEG; // the bend line and how far the top leans back
  const bend = new THREE.Matrix4().makeTranslation(0, HY, SZ).multiply(new THREE.Matrix4().makeRotationX(BEND)).multiply(new THREE.Matrix4().makeTranslation(0, -HY, -SZ));
  const up = (g) => g.applyMatrix4(bend);
  const lo = [[0.21, 0.97], [0.74, 0.97], [0.74, 1.52], [0.76, 1.57], [0.8, HY], [0.21, HY]];
  const hi = [[0.21, HY], [0.8, HY], [0.82, 1.61], [0.92, 1.63], [0.98, 1.66], [1.0, 1.72], [1.0, 1.92], [0.98, 1.965], [0.93, 1.98], [0.21, 1.98]];
  const side = (poly, s) => { const o = poly.map(([x, y]) => [s * x, y]); return s < 0 ? o.reverse() : o; };
  for (const s of [-1, 1]) {
    const ol = side(lo, s), oh = side(hi, s);
    T.add('camo', plate(ol, [], SZ, SZ + 0.012));
    T.add('camo', up(plate(oh, [], SZ, SZ + 0.012)));
    T.add('camo', up(rod(V(s * 0.21, 1.985, SZ + 0.006), V(s * 0.93, 1.985, SZ + 0.006), 0.01, 5)));
    T.add('camo', rod(V(s * 0.21, 0.98, SZ + 0.006), V(s * 0.21, HY, SZ + 0.006), 0.01, 5)); // the slot's lip
    T.add('camo', up(rod(V(s * 0.21, HY, SZ + 0.006), V(s * 0.21, 1.985, SZ + 0.006), 0.01, 5)));
    T.add('camo', box(0.03, HY - 0.985, 0.03, s * 0.42, (0.985 + HY) / 2, SZ + 0.027));
    T.add('camo', up(box(0.03, 0.36, 0.03, s * 0.42, 1.79, SZ + 0.027)));
    T.add('camo', up(box(0.03, 0.36, 0.03, s * 0.72, 1.79, SZ + 0.027)));
    T.add('camo', box(0.62, 0.035, 0.035, s * 0.5, HY - 0.02, SZ + 0.03)); // the angle along the bend
    T.add('camo', rivetPoly(ol, (u, v) => V(u, v, SZ - 0.001), 0.025, 0.11, V(0, 0, -1), 0.008));
    T.add('camo', up(rivetPoly(oh, (u, v) => V(u, v, SZ - 0.001), 0.025, 0.11, V(0, 0, -1), 0.008)));
    const sr = [], sh = [];
    for (let y = 1.05; y < HY - 0.04; y += 0.1) sr.push(V(s * 0.42, y, SZ - 0.001));
    for (let y = HY + 0.06; y < 1.95; y += 0.1) sh.push(V(s * 0.42, y, SZ - 0.001));
    T.add('camo', rivets(sr, V(0, 0, -1), 0.008));
    T.add('camo', up(rivets(sh, V(0, 0, -1), 0.008)));
  }
  // a spade and a pick on the front of the left half
  T.add('wood', rod(V(-0.7, 1.08, SZ - 0.03), V(-0.3, 1.5, SZ - 0.03), 0.016, 6));
  T.add('dark', box(0.16, 0.19, 0.012, -0.72, 1.02, SZ - 0.03, 0, 0, 0.8));
  for (const t of [0.3, 0.75]) T.add('dark', box(0.04, 0.03, 0.04, -0.7 + 0.4 * t, 1.08 + 0.42 * t, SZ - 0.02));
  T.build(trav, { dirt: 0.45 });

  // ---------------------------------------------------------------- cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  const ch = CR.top - CR.bot, cz = (CR.z0 + CR.z1) / 2, cl = CR.z1 - CR.z0;
  E.add('camo', rbox(CR.w, ch, cl, 0.015, 0, (CR.top + CR.bot) / 2, cz));
  for (const s of [-1, 1]) {
    E.add('dark', box(0.04, 0.012, cl - 0.05, s * 0.125, CR.top + 0.006, cz)); // the barrel's slides on top
    // angle flanges along the top and bottom of each side, the rivet rows (side photographs)
    for (const y of [CR.top - 0.02, CR.bot + 0.02]) {
      E.add('camo', box(0.02, 0.04, cl - 0.04, s * (CR.w / 2 + 0.01), y, cz));
      E.add('camo', rivetRow(V(s * (CR.w / 2 + 0.02), y, CR.z0 + 0.06), V(s * (CR.w / 2 + 0.02), y, CR.z1 - 0.06), 0.1, V(s, 0, 0), 0.008));
    }
    for (const z of [-2.0, -1.4, -0.8]) E.add('camo', box(0.012, ch - 0.06, 0.05, s * (CR.w / 2 + 0.006), (CR.top + CR.bot) / 2, z)); // stiffeners
    // the trunnion plates, the trunnions
    E.add('camo', box(0.03, 0.56, 0.5, s * 0.175, -0.18, -0.05));
    E.add('steel', xTube(s * 0.19, s * 0.265, 0.055, 0.055, 12));
    E.add('camo', rivetRow(V(s * 0.191, 0.05, -0.27), V(s * 0.191, 0.05, 0.17), 0.08, V(s, 0, 0), 0.008));
  }
  // the round head of the recoil cylinders in front, with its filling plug
  E.add('camo', zTube(CR.z0 - 0.07, CR.z0, 0.135, 0.135, 20, 0, -0.3));
  E.add('dark', zTube(CR.z0 - 0.1, CR.z0 - 0.07, 0.1, 0.12, 16, 0, -0.3));
  E.add('steel', zTube(CR.z0 - 0.12, CR.z0 - 0.1, 0.03, 0.03, 8, 0, -0.3));
  // the toothed elevating arc on the left, centred on the trunnions (the pinion on the left cheek)
  E.add('camo', gearArc(0.36, 0.44, 40 * DEG, 97 * DEG, 0.03, 22, 0.022).translate(-0.22, 0, 0));
  E.add('camo', box(0.03, 0.08, 0.36, -0.205, -0.3, 0.05)); // the arc's web to the cradle
  // the slot cover: a curved plate on the cradle's radius that closes the shield's slot under the barrel
  E.add('camo', gearArc(0.555, 0.567, 68 * DEG, 130 * DEG, 0.38));
  for (const s of [-1, 1]) E.add('camo', rod(V(s * 0.17, -0.44, -0.36), V(s * 0.17, -0.55, 0.12), 0.012, 5));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---------------------------------------------------------------- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', barrel([[MZ + 0.3, 0.0525], [MZ, 0.0525], [MZ, 0.088], [MZ + 0.12, 0.088], [MZ + 0.15, 0.081], [STEP - 0.03, 0.098], [STEP, 0.116], [STEP + 0.06, 0.12], [STEP + 0.08, 0.134], [RING0 - 0.12, 0.146], [RING0, 0.148], [RING0, 0.0525], [RING0 - 0.5, 0.0525]], 26));
  B.add('char', new THREE.CircleGeometry(0.053, 16).rotateY(Math.PI).translate(0, 0, MZ + 0.3));
  // the slides under the jacket that ride the cradle's ways
  for (const z of [STEP + 0.2, RING0 - 0.3]) B.add('dark', box(0.2, 0.03, 0.16, 0, -0.138, z));
  // breech ring: the front round the chamber, top, bottom and left walls round the block's slot (open right)
  const sl = BR - RING0 - 0.12, rz = (RING0 + 0.12 + BR) / 2, hw = RG.w / 2;
  const disc = [];
  for (let i = 0; i < 16; i++) disc.push([0.0575 * Math.cos(-i / 16 * TAU), 0.0575 * Math.sin(-i / 16 * TAU)]);
  B.add('camo', plate([[-hw, RG.bot], [hw, RG.bot], [hw, RG.top], [-hw, RG.top]], [disc], RING0, RING0 + 0.12));
  B.add('camo', rbox(RG.w, 0.08, sl, 0.012, 0, RG.top - 0.04, rz));
  B.add('camo', rbox(RG.w, 0.08, sl, 0.012, 0, RG.bot + 0.04, rz));
  B.add('camo', box(0.07, RG.top - RG.bot - 0.16, sl, -hw + 0.035, (RG.top + RG.bot) / 2, rz));
  B.add('char', zTube(RING0 - 0.5, RING0 + 0.12, 0.0525, 0.0575, 16, 0, 0, true).scale(-1, 1, 1));
  B.add('char', new THREE.CircleGeometry(0.0525, 16).translate(0, 0, RING0 - 0.5));
  // the U recess for the block handle on the left face (Niagara Falls, Koblenz rear views)
  B.add('dark', box(0.004, 0.09, 0.2, -hw - 0.002, 0.0, rz + 0.02));
  B.add('camo', rivets([V(-hw - 0.001, RG.top - 0.04, RING0 + 0.05), V(-hw - 0.001, RG.bot + 0.04, RING0 + 0.05), V(-hw - 0.001, RG.top - 0.04, BR - 0.05), V(-hw - 0.001, RG.bot + 0.04, BR - 0.05)], V(-1, 0, 0), 0.012));
  // the lug for the recoil rod under the ring, the rod into the cradle (long enough to stay in at full recoil)
  B.add('camo', box(0.1, 0.12, 0.1, 0, -0.28, 0.27));
  B.add('steel', zTube(-1.4, 0.22, 0.03, 0.03, 8, 0, -0.3));
  // the firing gear on the top right of the ring, the carrier's handle loop on the left
  B.add('dark', box(0.06, 0.05, 0.12, 0.11, RG.top + 0.025, BR - 0.1));
  B.add('steel', rod(V(0.12, RG.top + 0.045, BR - 0.06), V(0.16, RG.top + 0.1, BR + 0.03), 0.01, 5));
  for (const y of [-0.03, 0.04]) {
    B.add('dark', rod(V(-hw, y, rz - 0.08), V(-hw - 0.055, y, rz - 0.08), 0.01, 6));
    B.add('dark', rod(V(-hw - 0.055, y, rz - 0.08), V(-hw - 0.055, y, rz + 0.12), 0.01, 6));
    B.add('dark', rod(V(-hw - 0.055, y, rz + 0.12), V(-hw, y, rz + 0.12), 0.01, 6));
  }
  B.build(rc, { dirt: 0.15, y0: TR.y });

  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  const bw = RG.w - 0.07 - 0.004, bh = RG.top - RG.bot - 0.164;
  K.add('camo', rbox(bw, bh, sl - 0.004, 0.008, 0.035, (RG.top + RG.bot) / 2, 0));
  K.add('dark', zTube(sl / 2 - 0.004, sl / 2 + 0.014, 0.03, 0.03, 10, 0, 0)); // firing pin housing
  K.add('char', new THREE.CircleGeometry(0.008, 8).translate(0, 0, sl / 2 + 0.0145));
  K.add('dark', box(0.05, 0.05, 0.03, 0.14, -0.02, sl / 2 + 0.01)); // the crank's stud
  K.add('steel', rod(V(0.14, -0.02, sl / 2 + 0.025), V(0.14, -0.13, sl / 2 + 0.06), 0.012, 6)); // the crank handle
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.2);

  // the top carriage turns on the axle within TOP; a bigger switch is made by shifting the trail with the handspike,
  // which brings the top carriage back to the middle of its arc (fully by 3 TOP), so the detachment's places by the
  // trail hold at any bearing
  rig.setTraverse = (r) => {
    const a = Math.abs(r), rel = a <= TOP ? r : Math.sign(r) * TOP * Math.max(0, 1 - (a - TOP) / (2 * TOP));
    trav.rotation.y = r;
    carriage.rotation.y = r - rel;
  };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 1.9, 0.9);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // No loading tray: the round went into the open breech by hand and the rammer seated it, then the cased charge
  // followed. `tray` (where crews.js lays the round) is on the bore just inside the breech face.
  const sh = buildShell('k17'), mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  rig.anchors.shellStack = node(root, 'shellStack', 3.1, 0.1, -0.27); // the ready rounds by the right wall of the pit (gun_sites_ww1.js), clear of the trail's swing
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), 'k17');
  rig.recoilLength = 1.3; // [E] long at low elevation; the variable recoil shortens it as the gun is raised
  rig.loadEl = 3 * DEG; // GUNS.k17.loadEl
  // the ring's lower corner (0.31 m off the bore) stays 0.1 m above the ground between the girders
  floorFade(rig, TR.y, BR + 0.02, 0.31, 0.1, 0.3);
  rig.slideMats = ['camo', 'dark', 'steel', 'char'];
  rig.nest = [[0, -0.3]]; // the recoil rod slides into the cradle

  // 1 Geschützführer and 6 Kanoniere (de.wikipedia): the layer at the sight and the handwheels on the left, the
  // loader and the rammer either side of the trail behind the breech, the shell and the cased charge brought up
  // the right from the stack, the gun-layer's second on the right with the lanyard
  crew(rig, 'officer', -2.9, 0.9, L90, 'point');
  crew(rig, 'layer', -1.05, 0.95, L90, 'lay');
  crew(rig, 'loader', 0.95, 1.75, 0, 'ram');
  crew(rig, 'rammer', -0.95, 2.3, 0, 'ram');
  crew(rig, 'shell', 1.35, 2.6, R90, 'carry');
  crew(rig, 'cartridge', 1.25, 3.4, R90, 'carry');
  crew(rig, 'lanyard', 1.2, 1.1, R90, 'lanyard');

  hb(rig, -1.0, 0, -4.2, 1.0, 2.0, 0.6);
  hb(rig, -0.6, 0, 0.6, 0.6, 1.0, 4.35);
  return finishRig(rig, 'k17', 'k17');
}

// ---------------------------------------------------------------- parts

// A flat plate from a front outline [x, y] with holes, between z0 and z1.
function plate(outline, holes, z0, z1) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 6 });
  return g.translate(0, 0, Math.min(z0, z1));
}

// A cylinder from a (radius r0) to b (radius r1).
function taper(a, b, r0, r1, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// The 1.36 m artillery wheel: twelve painted wooden spokes, dished, in a painted felloe with a broad steel tyre,
// the nave with its iron bands and the hub cap (Niagara Falls, Fort Sill). Axis along X.
function woodWheel(P, x, side) {
  const at = (g) => g.applyMatrix4(xf(x, WR, 0));
  const R = WR;
  P.add('dark', at(ring(R - 0.028, R, -0.05, 0.05, 56))); // steel tyre
  for (let i = 0; i < 16; i++) { // the tyre bolts
    const a = (i / 16) * TAU;
    P.add('steel', at(xTube(side * 0.04, side * 0.047, 0.009, 0.009, 5, Math.cos(a) * (R - 0.06), Math.sin(a) * (R - 0.06))));
  }
  P.add('camo', at(ring(R - 0.1, R - 0.028, -0.042, 0.042, 44))); // felloe
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.13, ca = Math.cos(a), sa = Math.sin(a);
    P.add('camo', at(taper(V(side * -0.03, ca * 0.12, sa * 0.12), V(side * 0.006, ca * (R - 0.09), sa * (R - 0.09)), 0.034, 0.024, 7)));
  }
  P.add('camo', at(xTube(-0.16, 0.16, 0.125, 0.115, 18))); // nave
  for (const s of [-1, 1]) P.add('dark', at(xTube(s * 0.13, s * 0.165, 0.135, 0.135, 18))); // its iron bands
  P.add('dark', at(xTube(side * 0.165, side * 0.25, 0.075, 0.055, 14))); // hub cap
  P.add('steel', at(xTube(side * 0.25, side * 0.265, 0.03, 0.03, 6)));
}

// The box trail: two riveted girders from the axle tree to the trail end, converging and sloping down, with
// lightening holes, the girders' slide plates for the top carriage, a floor at the rear, the end with the spade,
// the lunette, the handles and the handspike (Niagara Falls rear views).
function trail(P) {
  const st = [TZ0, 1.0, 2.0, 3.0, TZ1];
  for (const s of [-1, 1]) {
    const sec = (z) => { const a = s * xi(z), b = s * (xi(z) + GW), y0 = yc(z) - gh(z) / 2, y1 = yc(z) + gh(z) / 2; return [V(a, y0, z), V(b, y0, z), V(b, y1, z), V(a, y1, z)]; };
    P.add('camo', loft(st.map(sec)));
    // the outer face's flanges and rivets top and bottom
    for (const k of [1, -1]) {
      const pts = st.map((z) => V(s * (xi(z) + GW + 0.002), yc(z) + k * (gh(z) / 2 - 0.025), z));
      for (let i = 0; i < pts.length - 1; i++) P.add('camo', rivetRow(pts[i], pts[i + 1], 0.09, V(s, 0, 0), 0.008));
    }
    // lightening holes in the web, both faces
    for (const z of [0.95, 1.55, 2.35]) {
      for (const f of [0, 1]) {
        const hx = s * (xi(z) + f * GW + (f ? 0.002 : -0.002));
        P.add('char', new THREE.CircleGeometry(gh(z) * 0.24, 14).rotateY(s * (f ? 1 : -1) * Math.PI / 2).scale(1, 1, 1.5).translate(hx, yc(z), z));
      }
    }
    // the slide plate the top carriage's girder rests on
    P.add('dark', box(GW + 0.04, 0.045, 0.32, s * (xi(1.68) + GW / 2), 0.6925, 1.68));
    // a lifting handle on the outer face near the end
    P.add('steel', new THREE.TorusGeometry(0.05, 0.01, 5, 12).rotateY(Math.PI / 2).translate(s * (xi(3.3) + GW + 0.015), yc(3.3), 3.3));
  }
  // the floor at the rear and the low transom in front of it (clear of the breech's sweep)
  const fl = (z) => [V(-xi(z), yc(z) - gh(z) / 2, z), V(xi(z), yc(z) - gh(z) / 2, z), V(xi(z), yc(z) - gh(z) / 2 + 0.014, z), V(-xi(z), yc(z) - gh(z) / 2 + 0.014, z)];
  P.add('dark', loft([fl(2.9), fl(TZ1)]));
  P.add('camo', box(xi(2.9) * 2, 0.08, 0.08, 0, yc(2.9) - gh(2.9) / 2 + 0.04, 2.9));
  // the trail end: the casting that joins the girders, the lunette, the handspike sockets with their loop handles
  const ze = TZ1, ye = yc(ze);
  P.add('camo', rbox((xi(ze) + GW) * 2, gh(ze), 0.36, 0.02, 0, ye, ze + 0.16));
  P.add('steel', new THREE.TorusGeometry(0.075, 0.022, 8, 16).rotateX(Math.PI / 2).translate(0, ye - 0.04, ze + 0.44));
  P.add('steel', zTube(ze + 0.32, ze + 0.38, 0.04, 0.04, 10, 0, ye - 0.04));
  for (const s of [-1, 1]) {
    P.add('camo', box(0.16, 0.12, 0.24, s * 0.44, ye + 0.02, ze + 0.12)); // socket box
    P.add('dark', box(0.1, 0.01, 0.16, s * 0.44, ye + 0.081, ze + 0.12));
    P.add('steel', rod(V(s * 0.5, ye + 0.04, ze + 0.02), V(s * 0.58, ye + 0.04, ze + 0.06), 0.011, 6));
    P.add('steel', rod(V(s * 0.58, ye + 0.04, ze + 0.06), V(s * 0.58, ye + 0.04, ze + 0.2), 0.011, 6));
    P.add('steel', rod(V(s * 0.58, ye + 0.04, ze + 0.2), V(s * 0.5, ye + 0.04, ze + 0.24), 0.011, 6));
  }
  // the spade under the end, raked and dug in, ribbed behind
  P.add('camo', box(0.6, 0.5, 0.025, 0, 0.02, ze + 0.1, -0.3));
  for (const x of [-0.18, 0, 0.18]) P.add('camo', box(0.025, 0.42, 0.1, x, 0.06, ze + 0.16, -0.3));
  // the handspike standing in its socket, a stowed rammer staff along the right girder
  P.add('dark', yTube(ye + gh(ze) / 2, ye + gh(ze) / 2 + 0.08, 0.03, 0.03, 8, 0.1, ze - 0.12));
  P.add('wood', yTube(ye + gh(ze) / 2 + 0.08, ye + 1.0, 0.022, 0.018, 7, 0.1, ze - 0.12));
  const a = V(xi(1.2) + GW + 0.03, yc(1.2) + 0.03, 1.2), b = V(xi(3.2) + GW + 0.03, yc(3.2) + 0.03, 3.2);
  P.add('wood', rod(a, b, 0.02, 6));
  for (const z of [1.5, 2.9]) P.add('dark', box(0.05, 0.05, 0.03, xi(z) + GW + 0.02, yc(z) + 0.03, z));
}

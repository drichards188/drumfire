import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile, frontProfile, gearArc, zLathe, xLathe, loft, rivets, rivetRow, rivetPoly, mirrorX, projectUV, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, ring, L90, R90, TAU } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * 15 cm schwere Feldhaubitze 18 as the motorised divisional batteries had it in 1944 (refs/sfh18: the surviving
 * guns at Sinsheim, Lesany, the Polish Army Museum, CFB Borden and Aberdeen, and the TM-E 30-451 figures 37 and 38).
 * The long L/29.5 barrel (4.44 m) is a slim chase stepping up at a collar to the jacket, which slides on a riveted
 * box cradle (the buffer inside, its round head in front); the hydropneumatic recuperator rides above the barrel in a
 * saddle over the trunnions, with a pointed nose cap. The trunnions sit far back, just ahead of the squared breech
 * ring (horizontal sliding block, opening to the right), so the muzzle-heavy mass is held up by the two big spring
 * equilibrators that stand, leaning back, in front of the top carriage. No shield. Split riveted box trails (spread
 * 60 degrees, 4.1 m) with step plates, handspikes, lifting handles and the big spades dug in at the ends; the
 * lunette on the left trail, the barrel travel saddle on the right. Double pressed-steel disc wheels (1.12 m, ten
 * lightening holes) with ribbed solid rubber tyres, air brake drums, a sprung axle. 5,512 kg in action, 7.85 m long,
 * 2.23 m wide, 1.71 m high (top of the recuperator). Elevation -3 to +45 degrees, traverse 64.
 * Proportions from the handbook side view (figure 38) scaled by the published barrel length, width and height.
 *
 * Rig (DESIGN.md "Models", "WW2 mode"): origin on the ground under the axle centre, front -Z. `traverse` is the top
 * carriage (it swings on the axle; wheels and trails stay put), `elevation` at the trunnions, `recoil` slides the
 * barrel back along +Z, `breech` the sliding block (setBreech slides it +X). The equilibrators span the top
 * carriage and the cradle: rig.setElevation and rig.update keep them on their pins without allocating.
 * buildSFH18({ scheme: 'dgelb' | 'feldgrau' })
 */
const WR = 0.56, WX = 0.9, TW = 0.22; // wheel radius over the tyre, centre plane, tyre width (2.23 m over the hubs)
const TR = { y: 1.36, z: 0.17 }; // trunnion axis in root space (bore height 1.36 m)
const MZ = -3.98, BR = 0.46, RING0 = 0.1; // muzzle, breech face and front of the breech ring along the bore from the trunnions
const STEP = -1.62; // the collar where the slim chase meets the jacket
const HINGE = { x: 0.36, y: 0.62, z: 0.42 }, TL = 4.1, SPREAD = 30 * DEG; // trail hinge, leg length, half spread
const EQX = 0.38; // equilibrator plane, outboard of the cheeks
const EQ_LO = { y: 0.78, z: -0.45 }; // lower eye on the top carriage's nose (traverse frame)
const EQ_HI = { y: 0.06, z: -0.27 }; // upper eye on the cradle bracket (elevation frame)
const REC = { y: 0.275, r: 0.087 }; // recuperator axis above the bore, radius
const BOX = { top: -0.11, bot: -0.36, w: 0.3, z0: -1.16, z1: 0.05 }; // the cradle trough under the barrel
const RIV = 0xd6cfbd; // painted rivet heads read a shade darker than the plate

export function buildSFH18({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---------------------------------------------------------------- lower carriage: wheels, axle, trails
  const L = rig.part();
  const W = wheelParts();
  for (const s of [-1, 1]) for (const [key, g] of W) L.add(key, (s > 0 ? g : mirrorX(g)).translate(s * WX, WR, 0));
  for (const s of [-1, 1]) {
    L.add('dark', xTube(s * 0.66, s * 0.77, 0.2, 0.2, 20, WR, 0)); // air brake drum behind the inner disc
    L.add('dark', xTube(s * 0.4, s * 0.68, 0.06, 0.07, 12, WR, 0)); // axle arm
    // brake cylinder and its spring, hung from the axle body ahead of the wheel
    L.add('dark', yTube(0.38, 0.5, 0.04, 0.04, 10, s * 0.6, -0.12));
    for (let i = 0; i < 4; i++) L.add('steel', new THREE.TorusGeometry(0.032, 0.007, 4, 10).rotateX(Math.PI / 2).translate(s * 0.6, 0.3 + i * 0.02, -0.12));
    L.add('steel', rod(V(s * 0.6, 0.29, -0.12), V(s * 0.66, 0.4, -0.05), 0.011, 5));
  }
  // the axle body the top carriage turns on: a box casting with the racer ring on top
  L.add('camo', rbox(0.84, 0.26, 0.42, 0.03, 0, 0.56, 0));
  L.add('dark', yTube(0.69, 0.71, 0.34, 0.34, 28, 0, 0));
  L.add('camo', xTube(-0.42, 0.42, 0.075, 0.075, 14, WR, 0));
  // the traversing rack: a toothed arc on the front of the axle body, the top carriage's pinion runs on it
  L.add('dark', new THREE.LatheGeometry([[0.4, 0.6], [0.46, 0.6], [0.46, 0.66], [0.4, 0.66], [0.4, 0.6]].map(([r, y]) => new THREE.Vector2(r, y)), 20, Math.PI - 0.75, 1.5));
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI - 0.72 + (1.44 * i) / 22;
    L.add('dark', box(0.018, 0.05, 0.02, Math.sin(a) * 0.47, 0.63, Math.cos(a) * 0.47, 0, a, 0));
  }
  // transverse leaf spring under the axle body (the gun was sprung for motor towing) and the brake cross shaft
  for (let i = 0; i < 5; i++) L.add('dark', box(1.1 - i * 0.16, 0.013, 0.08, 0, 0.415 - i * 0.015, 0.02));
  for (const s of [-1, 1]) L.add('dark', box(0.06, 0.12, 0.1, s * 0.56, 0.44, 0.02));
  L.add('dark', xTube(-0.8, 0.8, 0.022, 0.022, 8, 0.32, -0.24));
  for (const s of [-1, 1]) L.add('dark', rod(V(s * 0.74, 0.32, -0.24), V(s * 0.72, 0.42, -0.1), 0.016, 5));
  // trail hinges: brackets off the axle body, knuckles and vertical pins
  for (const s of [-1, 1]) {
    L.add('camo', box(0.16, 0.34, 0.3, s * (HINGE.x - 0.06), 0.56, 0.2));
    for (const y of [0.43, 0.81]) L.add('camo', yTube(y - 0.035, y + 0.035, 0.085, 0.085, 14, s * HINGE.x, HINGE.z));
    L.add('steel', yTube(0.36, 0.89, 0.028, 0.028, 8, s * HINGE.x, HINGE.z));
    L.add('steel', yTube(0.89, 0.91, 0.045, 0.045, 8, s * HINGE.x, HINGE.z));
  }
  for (const s of [-1, 1]) trail(L, s);
  L.build(root, { dirt: 0.55 });

  // ---------------------------------------------------------------- top carriage (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  // base plate on the racer, and the nose that carries the equilibrators' lower pins
  T.add('camo', rbox(0.66, 0.07, 0.66, 0.02, 0, 0.745, -0.16));
  T.add('camo', loft([[V(-0.3, 0.71, -0.28), V(0.3, 0.71, -0.28), V(0.3, 0.86, -0.28), V(-0.3, 0.86, -0.28)],
    [V(-0.24, 0.72, -0.5), V(0.24, 0.72, -0.5), V(0.24, 0.84, -0.5), V(-0.24, 0.84, -0.5)]]));
  for (const s of [-1, 1]) {
    T.add('camo', loft([[V(s * 0.2, 0.73, -0.47), V(s * 0.2, 0.84, -0.47), V(s * 0.2, 0.84, -0.33), V(s * 0.2, 0.73, -0.33)],
      [V(s * (EQX - 0.06), 0.74, EQ_LO.z - 0.04), V(s * (EQX - 0.06), 0.82, EQ_LO.z - 0.04), V(s * (EQX - 0.06), 0.82, EQ_LO.z + 0.04), V(s * (EQX - 0.06), 0.74, EQ_LO.z + 0.04)]]));
    T.add('camo', rivetRow(V(-0.26, 0.865, -0.3), V(0.26, 0.865, -0.3), 0.09, V(0, 1, 0), 0.011), { tint: RIV });
  }
  for (const s of [-1, 1]) {
    for (const d of [-0.075, 0.075]) T.add('camo', box(0.025, 0.16, 0.13, s * EQX + d, EQ_LO.y, EQ_LO.z));
    T.add('steel', xTube(s * (EQX - 0.1), s * (EQX + 0.1), 0.025, 0.025, 8, EQ_LO.y, EQ_LO.z));
  }
  // the two cheeks: tall at the trunnion bearing, cut away behind it so the sliding block can open to the right
  // and the ring can drop between them at high elevation
  const cheek = [[-0.27, 0.71], [-0.16, 1.0], [0.0, 1.26], [0.07, 1.42], [0.14, 1.51], [0.24, 1.51], [0.31, 1.43], [0.33, 1.2], [0.45, 1.12], [0.6, 0.98], [0.62, 0.71]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(cheek, 0.05).translate(s * 0.28, 0, 0));
    // the stiffening flange round the cheek's front edge
    for (let i = 0; i < 5; i++) {
      const [z0, y0] = cheek[i], [z1, y1] = cheek[i + 1], cz = (z0 + z1) / 2, cy = (y0 + y1) / 2, l = Math.hypot(z1 - z0, y1 - y0);
      T.add('camo', box(0.09, 0.025, l + 0.02, s * 0.28, cy, cz, -Math.atan2(y1 - y0, z1 - z0)));
    }
    T.add('camo', rivetPoly(cheek, (z, y) => V(s * 0.306, y, z), 0.035, 0.085, V(s, 0, 0), 0.011), { tint: RIV });
    // trunnion bearing cap bolted on the cheek
    T.add('camo', xTube(s * 0.3, s * 0.34, 0.11, 0.105, 18, TR.y, TR.z));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26;
      T.add('steel', xTube(s * 0.34, s * 0.355, 0.014, 0.014, 6, TR.y + Math.sin(a) * 0.085, TR.z + Math.cos(a) * 0.085));
    }
    T.add('dark', box(0.05, 0.03, 0.5, s * 0.28, 0.73, 0.16)); // foot of the cheek on the base plate
  }
  // left: traversing handwheel and its gear box, the shaft forward to the pinion on the rack, the sight bracket
  T.add('camo', box(0.1, 0.16, 0.16, -0.36, 0.98, 0.56));
  T.add('dark', mirrorX(hwheel(0.17)).translate(-0.44, 0.98, 0.56));
  T.add('steel', xTube(-0.41, -0.395, 0.13, 0.13, 24, 0.98, 0.56)); // graduated disc
  T.add('dark', xTube(-0.395, -0.385, 0.135, 0.135, 24, 0.98, 0.56));
  T.add('dark', rod(V(-0.33, 0.92, 0.5), V(-0.33, 0.8, -0.22), 0.018, 6));
  T.add('camo', box(0.12, 0.1, 0.14, -0.3, 0.74, -0.36)); // traverse pinion housing over the rack
  T.add('camo', box(0.06, 0.34, 0.08, -0.34, 1.32, 0.3)); // sight bracket off the cheek, reaching back
  T.add('camo', box(0.06, 0.05, 0.3, -0.37, 1.47, 0.43));
  T.add('camo', box(0.14, 0.05, 0.08, -0.43, 1.47, 0.56));
  T.add('dark', box(0.1, 0.1, 0.12, -0.36, 1.2, 0.3)); // the sight's angle gear (Richtaufsatz)
  T.add('dark', xTube(-0.42, -0.37, 0.05, 0.05, 12, 1.2, 0.3));
  panoramicSight(T, -0.47, 1.47, 0.56, -1);
  // right: elevating handwheel with the range drum above it, the pinion box under the elevating arc
  T.add('camo', box(0.1, 0.16, 0.16, 0.36, 0.98, 0.56));
  T.add('dark', hwheel(0.15).translate(0.42, 0.98, 0.56));
  T.add('camo', xTube(0.31, 0.4, 0.075, 0.075, 16, 1.2, 0.5)); // range drum (Entfernungstrommel)
  T.add('steel', xTube(0.4, 0.41, 0.078, 0.078, 16, 1.2, 0.5));
  T.add('dark', rod(V(0.41, 1.2, 0.5), V(0.47, 1.25, 0.5), 0.01, 5));
  T.add('dark', box(0.08, 0.14, 0.16, 0.22, 0.83, TR.z)); // elevating pinion box
  T.add('steel', xTube(0.18, 0.26, 0.04, 0.04, 10, 0.86, TR.z));
  T.build(trav, { dirt: 0.5 });

  // ---------------------------------------------------------------- cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  // the riveted trough under the barrel; its bottom is chamfered at the rear to clear the top carriage at 45 degrees
  const trough = [[BOX.z0, BOX.top], [BOX.z1, BOX.top], [BOX.z1, -0.21], [-0.3, BOX.bot], [BOX.z0, BOX.bot]];
  E.add('camo', sideProfile(trough, BOX.w));
  for (const s of [-1, 1]) {
    const x = s * (BOX.w / 2 + 0.012);
    E.add('camo', box(0.03, 0.035, BOX.z1 - BOX.z0, s * (BOX.w / 2 + 0.01), BOX.top - 0.02, (BOX.z0 + BOX.z1) / 2)); // top angle
    E.add('camo', box(0.03, 0.03, -0.3 - BOX.z0, s * (BOX.w / 2 + 0.01), BOX.bot + 0.015, (BOX.z0 - 0.3) / 2)); // bottom angle
    E.add('camo', rivetRow(V(x + s * 0.015, BOX.top - 0.02, BOX.z0 + 0.04), V(x + s * 0.015, BOX.top - 0.02, BOX.z1 - 0.04), 0.075, V(s, 0, 0), 0.011), { tint: RIV });
    E.add('camo', rivetRow(V(x + s * 0.015, BOX.bot + 0.015, BOX.z0 + 0.04), V(x + s * 0.015, BOX.bot + 0.015, -0.34), 0.075, V(s, 0, 0), 0.011), { tint: RIV });
    for (const z of [-1.0, -0.72, -0.44]) E.add('camo', box(0.012, 0.22, 0.045, s * (BOX.w / 2 + 0.006), (BOX.top + BOX.bot) / 2, z)); // stiffeners
    E.add('steel', box(0.035, 0.012, BOX.z1 - BOX.z0 - 0.05, s * 0.088, BOX.top + 0.004, (BOX.z0 + BOX.z1) / 2)); // slide rails, oily bare steel
  }
  E.add('dark', box(0.004, 0.07, 0.17, BOX.w / 2 + 0.014, -0.2, -0.78)); // data plate
  // the buffer's round head on the front of the trough: flange, pot and centre nut
  const hy = (BOX.top + BOX.bot) / 2;
  const h0 = BOX.z0;
  E.add('camo', zLathe([[h0 - 0.165, 0.0001], [h0 - 0.165, 0.03], [h0 - 0.15, 0.058], [h0 - 0.125, 0.085], [h0 - 0.095, 0.102], [h0 - 0.03, 0.102], [h0 - 0.03, 0.12], [h0, 0.12], [h0, 0.0001]], 22).translate(0, hy, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    E.add('dark', zTube(h0 - 0.038, h0 - 0.03, 0.01, 0.01, 6, Math.cos(a) * 0.111, hy + Math.sin(a) * 0.111));
  }
  E.add('steel', zTube(h0 - 0.18, h0 - 0.165, 0.022, 0.022, 6, 0, hy));
  // the cradle body round the trunnions: side plates, trunnion bosses and pins
  for (const s of [-1, 1]) {
    E.add('camo', box(0.04, 0.29, 0.4, s * 0.17, 0.015, -0.1));
    E.add('camo', xTube(s * 0.15, s * 0.22, 0.1, 0.1, 18));
    E.add('steel', xTube(s * 0.22, s * 0.3, 0.065, 0.065, 14));
    // equilibrator bracket: an arm off the cradle side, a fork and the upper pin
    E.add('camo', box(0.24, 0.09, 0.1, s * (0.17 + 0.12), EQ_HI.y, EQ_HI.z));
    for (const d of [-0.075, 0.075]) E.add('camo', box(0.025, 0.15, 0.12, s * EQX + d, EQ_HI.y, EQ_HI.z));
    E.add('steel', xTube(s * (EQX - 0.1), s * (EQX + 0.1), 0.025, 0.025, 8, EQ_HI.y, EQ_HI.z));
  }
  // the recuperator's saddle over the trunnions and its two straps
  E.add('camo', box(0.32, 0.06, 0.28, 0, 0.17, -0.07));
  for (const s of [-1, 1]) E.add('camo', box(0.03, 0.12, 0.28, s * 0.15, 0.14, -0.07));
  for (const z of [-0.19, 0.05]) E.add('camo', zTube(z - 0.022, z + 0.022, REC.r + 0.011, REC.r + 0.011, 20, 0, REC.y));
  // the recuperator: a long cylinder with a pointed nose cap and a filling valve, its rear cap over the breech ring
  E.add('camo', zLathe([[-1.01, 0.0001], [-0.997, 0.018], [-0.975, 0.036], [-0.945, 0.049], [-0.9, 0.056], [-0.88, 0.062], [-0.875, 0.074], [-0.86, REC.r], [0.31, REC.r], [0.315, REC.r + 0.006], [0.335, REC.r + 0.006], [0.34, 0.05], [0.342, 0.0001]], 22).translate(0, REC.y, 0));
  E.add('steel', zTube(-1.03, -1.005, 0.011, 0.011, 6, 0, REC.y));
  E.add('dark', zTube(-0.88, -0.86, REC.r + 0.004, REC.r + 0.004, 20, 0, REC.y));
  E.add('steel', yTube(REC.y + REC.r - 0.01, REC.y + REC.r + 0.04, 0.016, 0.016, 8, 0.03, 0.27)); // filling valve and gauge boss
  E.add('dark', sphere(0.024, -0.035, REC.y + REC.r + 0.012, 0.25, 1, 0.6, 1, 8));
  // elevating arc on the right of the cradle body, behind and below the trunnions, and its web
  E.add('dark', gearArc(0.36, 0.43, 40 * DEG, 97 * DEG, 0.03, 16, 0.03).translate(0.21, 0, 0));
  E.add('camo', box(0.03, 0.16, 0.26, 0.21, -0.28, 0.1));
  // clinometer seat on the left of the cradle body, the sight drive's link
  E.add('steel', box(0.08, 0.015, 0.14, -0.17, 0.165, -0.05));
  E.add('dark', rod(V(-0.19, 0.06, -0.02), V(-0.27, 0.12, 0.1), 0.014, 5));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---------------------------------------------------------------- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  // the tube: a recessed bore, a slight muzzle swell, the slim tapering chase, the collar, the jacket
  B.add('camo', zLathe([[MZ + 0.35, 0.0745], [MZ, 0.0745], [MZ, 0.094], [MZ + 0.012, 0.105], [MZ + 0.14, 0.108], [MZ + 0.2, 0.104], [STEP, 0.116], [STEP, 0.122], [STEP + 0.02, 0.14], [STEP + 0.075, 0.14], [STEP + 0.085, 0.13], [RING0 - 0.02, 0.131], [RING0, 0.131], [RING0, 0.0001]], 28));
  B.add('char', new THREE.CircleGeometry(0.0745, 18).rotateY(Math.PI).translate(0, 0, MZ + 0.35));
  for (let i = 0; i < 12; i++) { // rifling lands, seen down the muzzle
    const a = (i / 12) * TAU;
    B.add('dark', box(0.008, 0.004, 0.34, Math.cos(a) * 0.072, Math.sin(a) * 0.072, MZ + 0.17, 0, 0, a + Math.PI / 2));
  }
  // the squared breech ring with chamfered top edges: front plate, top and bottom, the left wall; the block slot
  // is open to the right
  const rw = 0.235, rt = 0.18, ry = 0.105;
  B.add('camo', frontProfile([[-rw, -rt], [rw, -rt], [rw, 0.12], [rw - 0.06, rt], [-rw + 0.06, rt], [-rw, 0.12]], RING0, 0.2));
  B.add('camo', frontProfile([[-rw, ry], [rw, ry], [rw, 0.12], [rw - 0.06, rt], [-rw + 0.06, rt], [-rw, 0.12]], 0.2, BR));
  B.add('camo', box(rw * 2, rt - ry, BR - 0.2, 0, -(rt + ry) / 2, (BR + 0.2) / 2));
  B.add('camo', box(0.085, ry * 2, BR - 0.2, -rw + 0.0425, 0, (BR + 0.2) / 2));
  B.add('char', new THREE.CircleGeometry(0.083, 18).translate(0, 0, 0.2005)); // the chamber mouth behind the block
  // the joint round the block on the rear face reads as a dark line
  for (const y of [-ry, ry]) B.add('dark', box(rw + 0.15, 0.008, 0.004, (rw - 0.15) / 2, y, BR + 0.001));
  B.add('dark', box(0.008, ry * 2, 0.004, -0.15, 0, BR + 0.001));
  // lugs for the piston rods: the recuperator rod from the top rear, the buffer rod from the bottom front
  B.add('camo', box(0.1, 0.13, 0.1, 0, rt + 0.06, 0.41));
  B.add('steel', zTube(0.35, 0.365, 0.035, 0.035, 8, 0, REC.y));
  B.add('steel', zTube(-0.85, 0.36, 0.026, 0.026, 8, 0, REC.y));
  B.add('camo', box(0.1, 0.13, 0.1, 0, -rt - 0.06, 0.15));
  B.add('steel', zTube(-1.2, 0.12, 0.026, 0.026, 8, 0, hy));
  // firing mechanism bracket and the lanyard lever on the rear face (nothing may stand out of the ring's sides: it
  // drops between the cheeks at high elevation)
  B.add('dark', box(0.05, 0.05, 0.05, 0.19, -0.135, BR + 0.02));
  B.add('steel', rod(V(0.19, -0.135, BR + 0.04), V(0.21, -0.24, BR + 0.1), 0.011, 5));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  // ---- the sliding block (breech pivot at the middle of the ring's slot)
  const bz = (BR + 0.2) / 2;
  const br = pivotAt(rig, rc, 'breech', 0, 0, bz);
  const K = rig.part();
  K.add('camo', box(0.385, ry * 2 - 0.006, BR - 0.205, 0.0425, 0, 0));
  K.add('steel', zTube((BR - 0.205) / 2, (BR - 0.205) / 2 + 0.025, 0.028, 0.028, 10, -0.02, 0)); // firing pin housing
  K.add('dark', box(0.05, 0.05, 0.03, 0.17, 0.05, (BR - 0.205) / 2 + 0.012));
  K.add('steel', rod(V(0.2, 0.06, 0.08), V(0.27, 0.17, 0.14), 0.015, 6)); // operating lever
  K.add('dark', sphere(0.025, 0.27, 0.17, 0.14, 1, 1, 1, 8));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.26);

  // ---------------------------------------------------------------- equilibrators
  // A spring housing (the wider upper tube, fixed length) hangs from the cradle pin; the lower tube telescopes into
  // it from the top carriage's pin. Both are posed in the traverse frame from the elevation each frame.
  const eqs = [-1, 1].map((s) => {
    const outer = new THREE.Mesh(strutGeom(zLathe([[0, 0.0001], [0, 0.03], [0.03, 0.05], [0.06, 0.08], [0.09, 0.108], [0.43, 0.108], [0.43, 0.116], [0.46, 0.116], [0.46, 0.0001]], 20).rotateX(-Math.PI / 2)), rig.mats.camo);
    const inner = new THREE.Mesh(strutGeom(new THREE.CylinderGeometry(0.088, 0.088, 1, 18).translate(0, 0.5, 0)), rig.mats.camo);
    outer.name = inner.name = 'camo';
    trav.add(outer, inner);
    return { s, outer, inner, lo: new THREE.Vector3(s * EQX, EQ_LO.y, EQ_LO.z), hi: new THREE.Vector3() };
  });
  const _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const placeStruts = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of eqs) {
      q.hi.set(q.s * EQX, TR.y + EQ_HI.y * c - EQ_HI.z * sn, TR.z + EQ_HI.y * sn + EQ_HI.z * c);
      _d.copy(q.lo).sub(q.hi);
      const len = _d.length();
      _d.divideScalar(len || 1);
      q.outer.position.copy(q.hi);
      q.outer.quaternion.setFromUnitVectors(_up, _d);
      q.inner.position.copy(q.hi).addScaledVector(_d, 0.2);
      q.inner.quaternion.copy(q.outer.quaternion);
      q.inner.scale.set(1, Math.max(0.05, len - 0.2), 1);
    }
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeStruts(); };
  rig.update = () => placeStruts();
  placeStruts();

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 1.8, 0.6);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // No loading tray on the gun itself (none on the surviving guns, refs/sfh18): the drill (crews.js) brings the round
  // to the breech by hand and the rammer (Ansetzer) seats it. `tray`, where the round is laid, is on the bore: the round's
  // middle just inside the breech face, its nose in the chamber, its base out for the rammer's head, so it lies in
  // the ring instead of hanging in the air behind it (nothing is under the breech but the ground between the trails).
  const sh = buildShell('sfh18'), mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  // ready shells lie inside the trails' V, right of the rammer's lane
  rig.anchors.shellStack = node(root, 'shellStack', 1.25, 0.1, 3.3);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), 'sfh18'); // (the model viewer's round, same place)
  rig.recoilLength = 1.2;
  rig.loadEl = 4 * DEG;
  // the ring's corner (0.3 m off the bore) stays 0.1 m above the ground between the trails
  floorFade(rig, TR.y, BR + 0.02, 0.3, 0.1, 0.3);
  rig.slideMats = ['camo', 'steel', 'char'];
  rig.nest = [[0, REC.y], [0, hy]]; // the piston rods slide into the recuperator and the buffer

  // The detachment: the two layers stand just behind the wheels, outside the trails (the left one at the
  // traversing handwheel and the panoramic sight, the right one at the elevating handwheel and range drum); the
  // loader, rammer, shell and cartridge numbers work in the lane between the spread trails behind the breech (the
  // trails swing across the rest of the V as the top carriage traverses), the shell coming up the right of it from
  // the stack, the cartridge up the left; the gun commander stands off the left trail.
  crew(rig, 'officer', -2.8, 0.9, L90, 'point');
  crew(rig, 'layer', -1.42, 0.66, L90, 'lay');
  crew(rig, 'sight', 1.42, 0.66, R90, 'lay');
  crew(rig, 'loader', -0.12, 2.5, 0, 'ram');
  crew(rig, 'rammer', -0.45, 3.2, 0, 'ram');
  crew(rig, 'shell', 0.5, 3.75, R90, 'carry');
  crew(rig, 'cartridge', -0.5, 4.3, L90, 'carry');
  crew(rig, 'lanyard', 1.85, 1.25, R90, 'lanyard');

  hb(rig, -1.15, 0, -3.85, 1.15, 1.8, 1.0);
  hb(rig, -2.6, 0, 0.3, 2.6, 0.85, 4.15);
  return finishRig(rig, 'sfh18', 'sfh18');
}

// A strut mesh's geometry: the vertex colour and the height attribute the painted material's shaders read, and
// metric box-projected UVs so the camouflage keeps its scale.
function strutGeom(g) {
  g = g.index ? g.toNonIndexed() : g;
  projectUV(g, 4);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.92), 3));
  g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(1.1), 1));
  return g;
}

// A small handwheel (axis X, the handle toward +X): rim, five spokes, boss and a short turning handle.
function hwheel(R) {
  const g = [new THREE.TorusGeometry(R, 0.013, 5, 20).rotateY(Math.PI / 2), xTube(-0.04, 0.03, 0.03, 0.025, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(-0.015, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.008, 4)); }
  g.push(xTube(0, 0.06, 0.01, 0.01, 6, R, 0), xTube(0.06, 0.1, 0.016, 0.016, 6, R, 0));
  return mergeAll(g);
}

// ---------------------------------------------------------------- the wheel
// The right wheel at the origin, axis along X, outside toward +X: [key, geometry] pairs (the left one is mirrored).
// Two pressed steel discs riveted to a steel rim, dished apart toward the hub, ten lightening holes; a wide solid
// rubber tyre with five grooves; a big hub with its cap and nuts.
function wheelParts() {
  const out = [], R = WR, Rr = R - 0.068, hw = TW / 2;
  // tyre profile (x, r): inner edge, shoulder, five grooves across the tread, shoulder, back along the inside
  const pts = [[-hw + 0.004, Rr], [-hw, Rr + 0.01], [-hw, R - 0.022], [-hw + 0.012, R - 0.004], [-hw + 0.02, R]];
  const n = 5, g = 0.011, rib = (TW - 0.04 - n * g) / (n + 1);
  let x = -hw + 0.02;
  for (let i = 0; i < n; i++) {
    x += rib;
    pts.push([x, R], [x + 0.002, R - 0.012], [x + g - 0.002, R - 0.012], [x + g, R]);
    x += g;
  }
  pts.push([hw - 0.02, R], [hw - 0.012, R - 0.004], [hw, R - 0.022], [hw, Rr + 0.01], [hw - 0.004, Rr], [-hw + 0.004, Rr]);
  out.push(['tyre', xLathe(pts, 44)]);
  out.push(['camo', ring(Rr - 0.03, Rr, -hw * 0.92, hw * 0.92, 40)]); // rim
  for (const s of [-1, 1]) out.push(['dark', ring(Rr - 0.034, Rr - 0.026, s * hw * 0.92 - 0.006, s * hw * 0.92 + 0.006, 40)]);
  // the discs: outer dished outward to the hub, inner inward
  out.push(['camo', disc(Rr - 0.03, 0.1, 1, 0.075)]);
  out.push(['camo', disc(Rr - 0.03, 0.1, -1, 0.05)]);
  // rivets joining the outer disc to the rim, the bolt circle round the hub
  const rv = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; rv.push(V(0.008, Math.cos(a) * (Rr - 0.05), Math.sin(a) * (Rr - 0.05))); }
  out.push(['camo', rivets(rv, V(1, 0, 0), 0.012)]);
  // the hub: boss, cap and nuts
  out.push(['camo', xLathe([[0.02, 0.0001], [0.02, 0.15], [0.045, 0.15], [0.07, 0.128], [0.112, 0.122], [0.115, 0.085], [0.16, 0.075], [0.178, 0.055], [0.186, 0.0001]], 24)]);
  out.push(['dark', xTube(0.186, 0.2, 0.026, 0.02, 8)]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    out.push(['dark', xTube(0.11, 0.124, 0.012, 0.012, 6, Math.cos(a) * 0.104, Math.sin(a) * 0.104)]);
  }
  return out;
}

// A pressed disc: an annulus from rHub to rOut with ten round holes, 6 mm plate, coned by `dish` metres toward the
// hub on the `side` it faces (+1 outward, -1 inward). Face normals follow the cone.
function disc(rOut, rHub, side, dish) {
  const s = new THREE.Shape(), N = 48;
  for (let i = 0; i <= N; i++) { const a = (i / N) * TAU; if (i) s.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut); else s.moveTo(rOut, 0); }
  const hole = (cx, cy, r, n) => {
    const p = new THREE.Path();
    for (let i = 0; i <= n; i++) { const a = -(i / n) * TAU; if (i) p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else p.moveTo(cx + r, cy); }
    s.holes.push(p);
  };
  hole(0, 0, rHub, 20);
  const hr = 0.045, hR = (rHub + rOut) * 0.5 + 0.02;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.31; hole(Math.cos(a) * hR, Math.sin(a) * hR, hr, 12); }
  const t = 0.006, g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-t / 2, 0, 0);
  const p = g.attributes.position, nm = g.attributes.normal, k = dish / (rOut - rHub);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i), r = Math.hypot(y, z);
    p.setX(i, p.getX(i) + side * k * (rOut - Math.min(rOut, Math.max(rHub, r))));
    const nx = nm.getX(i);
    if (Math.abs(nx) > 0.9) {
      const sg = Math.sign(nx), ny = (sg * side * k * y) / (r || 1), nz = (sg * side * k * z) / (r || 1), l = Math.hypot(1, ny, nz);
      nm.setXYZ(i, sg / l, ny / l, nz / l);
    }
  }
  return g;
}

// ---------------------------------------------------------------- the trails
// One split trail leg (s = -1 left, +1 right): a tapering riveted box girder from the hinge to the spade, with
// angle-iron flanges, side straps, the step plate the layers use, a handspike in its clips, the lifting handles at
// the end and the big spade dug into the ground. The left leg carries the lunette, the right one the barrel's
// travelling saddle and the trail lock's jaw.
function trail(P, s) {
  const a = V(s * HINGE.x, HINGE.y, HINGE.z);
  const b = V(s * (HINGE.x + TL * Math.sin(SPREAD)), 0.2, HINGE.z + TL * Math.cos(SPREAD));
  const d = b.clone().sub(a), len = d.length(), yaw = Math.atan2(d.x, d.z), pitch = Math.asin(d.y / len);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
  const m = new THREE.Matrix4().compose(a, q, V(1, 1, 1));
  const at = (x, y, t) => V(x, y, t * len).applyMatrix4(m);
  const dir = (x, y, z) => V(x, y, z).applyQuaternion(q);
  const G = (g) => g.applyMatrix4(m);
  const w = (t) => 0.3 - 0.06 * t, h = (t) => 0.42 - 0.14 * t;
  const rect = (t, dw = 0, y0 = null, y1 = null) => {
    const hw = w(t) / 2 + dw, lo = y0 ?? -h(t) / 2, hi = y1 ?? h(t) / 2, z = t * len;
    return [V(-hw, lo, z), V(hw, lo, z), V(hw, hi, z), V(-hw, hi, z)];
  };
  // the girder (starting at the hinge knuckle) and its top and bottom angle irons
  P.add('camo', G(loft([rect(0.02), rect(1)])));
  P.add('camo', G(loft([rect(0.03, 0.02, h(0.03) / 2, h(0.03) / 2 + 0.014), rect(0.99, 0.02, h(0.99) / 2, h(0.99) / 2 + 0.014)])));
  P.add('camo', G(loft([rect(0.03, 0.018, -h(0.03) / 2 - 0.012, -h(0.03) / 2), rect(0.99, 0.018, -h(0.99) / 2 - 0.012, -h(0.99) / 2)])));
  P.add('camo', yTube(HINGE.y - 0.15, HINGE.y + 0.15, 0.07, 0.07, 14, a.x, a.z)); // the leg's own knuckle on the pin
  // rivets: two rows on the top flange, a row along each side at top and bottom, and the straps
  const pts = [], up = dir(0, 1, 0), side = [dir(-1, 0, 0), dir(1, 0, 0)];
  for (let t = 0.05; t < 0.97; t += 0.035) {
    const hh = h(t) / 2, ww = w(t) / 2;
    pts.push(at(-ww + 0.035, hh + 0.014, t), at(ww - 0.035, hh + 0.014, t));
  }
  P.add('camo', rivets(pts, up, 0.012), { tint: RIV });
  for (const [k, sd] of [[-1, side[0]], [1, side[1]]]) {
    const sp = [];
    for (let t = 0.05; t < 0.97; t += 0.035) {
      const hh = h(t) / 2, ww = w(t) / 2;
      sp.push(at(k * ww, hh - 0.03, t), at(k * ww, -hh + 0.03, t));
    }
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const hh = h(t) / 2, ww = w(t) / 2;
      P.add('camo', G(box(0.012, hh * 2 - 0.02, 0.06, k * (ww + 0.006), 0, t * len)));
      for (const yy of [-0.06, 0.06]) sp.push(at(k * (ww + 0.012), yy * hh * 6, t));
    }
    P.add('camo', rivets(sp, sd, 0.012), { tint: RIV });
  }
  // the perforated step plate near the hinge and the handspike clipped along the outside
  const t0 = 0.1, t1 = 0.24, sy = (t) => h(t) / 2 + 0.014;
  P.add('camo', G(loft([[V(-w(t0) / 2 + 0.02, sy(t0), t0 * len), V(w(t0) / 2 - 0.02, sy(t0), t0 * len), V(w(t0) / 2 - 0.02, sy(t0) + 0.012, t0 * len), V(-w(t0) / 2 + 0.02, sy(t0) + 0.012, t0 * len)],
    [V(-w(t1) / 2 + 0.02, sy(t1), t1 * len), V(w(t1) / 2 - 0.02, sy(t1), t1 * len), V(w(t1) / 2 - 0.02, sy(t1) + 0.012, t1 * len), V(-w(t1) / 2 + 0.02, sy(t1) + 0.012, t1 * len)]])));
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) {
    const t = t0 + ((t1 - t0) * (i + 0.5)) / 9, xx = (-1.5 + j) * 0.055;
    P.add('dark', G(new THREE.CircleGeometry(0.012, 6).rotateX(-Math.PI / 2).translate(xx, sy(t) + 0.0125, t * len)));
  }
  const ox = s * (w(0.5) / 2 + 0.035);
  P.add('steel', G(rod(V(ox, 0, 0.3 * len), V(ox, -0.01, 0.72 * len), 0.022, 7)));
  for (const t of [0.36, 0.66]) P.add('dark', G(box(0.06, 0.06, 0.04, s * (w(t) / 2 + 0.025), 0, t * len)));
  // the end: end plate, two fold-out lifting handles with ball grips
  const he = h(1) / 2, we = w(1) / 2;
  P.add('camo', G(box(we * 2 + 0.05, he * 2 + 0.03, 0.025, 0, 0, len - 0.01)));
  for (const k of [-1, 1]) {
    P.add('steel', G(rod(V(k * 0.07, he + 0.014, len - 0.2), V(k * 0.07, he + 0.15, len - 0.02), 0.014, 6)));
    P.add('dark', G(sphere(0.026, k * 0.07, he + 0.16, len - 0.01, 1, 1, 1, 8)));
    P.add('dark', G(box(0.04, 0.04, 0.05, k * 0.07, he + 0.025, len - 0.2)));
  }
  // the spade: a broad pointed plate hung under the end, dug in with its point a little forward, a rib behind it,
  // gussets to the girder and the pivot boss
  const spade = frontProfile([[-0.28, 0.12], [0.28, 0.12], [0.28, -0.3], [0.1, -0.5], [0, -0.56], [-0.1, -0.5], [-0.28, -0.3]], 0, 0.03);
  P.add('camo', G(spade.translate(0, 0, -0.015).rotateX(0.22).translate(0, -0.02, len + 0.03)));
  P.add('camo', G(box(0.03, 0.5, 0.06, 0, -0.235, len + 0.015, 0.22)));
  for (const k of [-1, 1]) {
    P.add('camo', G(box(0.02, 0.2, 0.22, k * (we + 0.012), -0.02, len - 0.02)));
    P.add('steel', G(xTube(k * (we + 0.022), k * (we + 0.045), 0.04, 0.04, 10, -0.04, len + 0.02)));
  }
  if (s < 0) {
    // lunette: the towing eye the limber's pintle takes when the legs are closed
    P.add('dark', G(box(0.07, 0.06, 0.16, -0.04, 0.04, len + 0.08)));
    P.add('dark', G(new THREE.TorusGeometry(0.085, 0.022, 6, 16).rotateX(Math.PI / 2).translate(-0.04, 0.04, len + 0.24)));
  } else {
    // the trail lock's jaw that closes on the left leg in travel, and the saddle the retracted barrel rests in
    P.add('dark', G(box(0.12, 0.07, 0.1, -0.06, 0.04, len + 0.05)));
    const ts = 0.3, ty = h(ts) / 2 + 0.014;
    for (const k of [-1, 1]) P.add('camo', G(box(0.03, 0.2, 0.12, k * 0.1, ty + 0.1, ts * len)));
    P.add('camo', G(box(0.23, 0.03, 0.12, 0, ty + 0.015, ts * len)));
    P.add('dark', G(xTube(-0.12, 0.12, 0.012, 0.012, 6, ty + 0.19, ts * len))); // clamp bolt
  }
}

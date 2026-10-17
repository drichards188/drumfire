import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, addWheel, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, node, hb } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { a4Pieces, A4 } from './missiles.js';
import { withSiteMats, addP, missileMeshes, conifer, mound } from './vweap_kit.js';

// A mobile V-2 (A4) firing point in a wood clearing, autumn 1944: the firing table (Brennstand: a square frame
// on four screw jacks, the turning ring the rocket stands on, the cone of the blast deflector under the motor),
// the Meillerwagen backed up to it (the trailer with the hydraulic erector arm and its clamps), the alcohol
// bowser, the liquid oxygen trailer (frost on its tank and on the rocket's oxidizer tank while it fills), a
// power trailer, and the armoured firing control vehicle (Feuerleitpanzer, on the Sd.Kfz. 7 halftrack) about
// 100 m off with its cable drum, the cable run along the ground. Conifers ring the clearing (rig.trees, which
// the render layer may hide where the world plants its own wood).
//
// Frame: origin on the ground at the firing table's centre. The Meillerwagen lies along +Z from the table (its
// drawbar toward +Z), the erector arm hinged at its rear end by the table: the arm pivot `erector` turns about
// x (rotation.x 0 flat, -90 degrees upright). `meiller` carries the trailer (position.z 0 at the table, +30 m
// withdrawn); `table` the turning ring and the standing rocket (rotation.y). No traverse or elevation pivots.
//   setErect(k)      0 the rocket lying on the arm, 1 upright on the table (the rocket leaves the arm then)
//   setMeiller(k)    0 at the table, 1 withdrawn 30 m (with the rocket standing the arm folds down as it goes)
//   setTable(rad)    the ring and the standing rocket turned about the vertical (the fin alignment)
//   setFuel({ alcohol, lox })  0..1: the hoses connected (> 0), the frost on the oxygen tank's zone of the
//                    rocket and on the LOX trailer's tank (its opacity follows lox)
//   setRocket(visible)
// Anchors: rocket (the rocket's base on the table), muzzle (the nose of the standing rocket, its -Z up),
// bunker (the firing control vehicle), eye, crew spots.

export const T = 1.3; // the table's ring: the rocket's base above the ground
const ZB = 0.35, D = 1.75; // the rocket's base along the arm from the pivot, and its axis above the arm's pivot line
const PIV = { y: T - ZB, z: D }; // the arm's pivot, so that the upright rocket stands on the table
export const WITHDRAW = 30;
const FLP = { x: -62, z: 78, ry: 0 }; // the Feuerleitpanzer, about 100 m off
const ALC = { x: 9, z: -1 }, LOX = { x: -9, z: -1 }, PWR = { x: -8, z: 10 };
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

// a cylinder of unit height standing on y = 0 (scaled along y for the hydraulic rams)
const unitTube = (r, seg = 10) => new THREE.CylinderGeometry(r, r, 1, seg).translate(0, 0.5, 0);

export function buildV2Site() {
  const rig = newGunRig('v2', 'earth');
  const mats = withSiteMats(rig), root = rig.root, rnd = mulberry32(204);
  const mk = () => new Parts(mats);
  const P = mk(), PT = mk(), PM = mk(), PA = mk(), PW = mk();
  rig.recoilLength = 0;
  rig.loadEl = 0;
  rig.setTraverse = rig.setElevation = rig.setRecoil = rig.setBreech = () => {};
  // the frost: one material per site, so its opacity is this site's
  const frost = new THREE.MeshStandardMaterial({ color: 0xe6eef4, roughness: 0.95, metalness: 0, transparent: true, opacity: 0, depthWrite: false, alphaMap: frostAlpha() });

  // ---- the firing table: four splayed legs on screw jacks, a square frame, the turning ring, the deflector
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const top = V(sx * 1.15, T - 0.2, sz * 1.15), foot = V(sx * 1.7, 0.35, sz * 1.7);
    P.add('camo', rod(top, foot, 0.1, 8));
    P.add('steel', yTube(0.08, 0.5, 0.06, 0.06, 8, foot.x, foot.z)); // the jack's screw
    P.add('dark', yTube(0.0, 0.1, 0.32, 0.28, 12, foot.x, foot.z)); // its foot plate
    P.add('camo', yTube(0.38, 0.58, 0.12, 0.12, 10, foot.x, foot.z));
    P.add('iron', xTube(-0.25, 0.25, 0.02, 0.02, 6, 0.52, 0).translate(foot.x, 0, foot.z)); // the jack's handle bar
  }
  for (const s of [-1, 1]) {
    P.add('camo', box(2.7, 0.22, 0.24, 0, T - 0.25, s * 1.2));
    P.add('camo', box(0.24, 0.22, 2.7, s * 1.2, T - 0.25, 0));
  }
  P.add('camo', yTube(0, 0.95, 0.95, 0.05, 20)); // the blast deflector: a cone that throws the jet out sideways
  P.add('dark', yTube(0, 0.06, 1.0, 1.0, 20), { tint: 0x707070 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; P.add('camo', rod(V(Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6), V(Math.cos(a) * 1.15, T - 0.35, Math.sin(a) * 1.15), 0.05, 6)); }
  const table = node(root, 'table', 0, 0, 0);
  rig.pivots.table = table;
  PT.add('camo', new THREE.TorusGeometry(1.05, 0.11, 6, 32).rotateX(Math.PI / 2).translate(0, T - 0.1, 0));
  for (let i = 0; i < 4; i++) {
    // the four pads the rocket's fins stand on, and the levelling screws under them
    const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 1.15, z = Math.sin(a) * 1.15;
    PT.add('steel', box(0.26, 0.08, 0.26, x, T - 0.02, z, 0, -a, 0));
    PT.add('camo', box(0.5, 0.12, 0.2, Math.cos(a) * 0.95, T - 0.1, Math.sin(a) * 0.95, 0, -a, 0));
  }
  const tableHolder = node(table, 'tableHolder', 0, T, 0);

  // ---- the Meillerwagen: trailer frame, rear bogie of four twin wheels, a front axle and the drawbar
  const meiller = node(root, 'meiller', 0, 0, 0);
  rig.pivots.meiller = meiller;
  for (const s of [-1, 1]) {
    PM.add('camo', box(0.2, 0.42, 13.2, s * 0.75, 1.0, 8.2));
    PM.add('camo', box(0.3, 0.05, 13.2, s * 0.75, 1.22, 8.2));
  }
  for (let z = 2.0; z < 14.6; z += 1.4) PM.add('camo', box(1.4, 0.16, 0.14, 0, 0.95, z));
  for (const z of [3.4, 4.6]) for (const s of [-1, 1]) { addWheel(PM, s * 0.98, 0.5, z, 0.5, 0.26, s, 18); addWheel(PM, s * 1.25, 0.5, z, 0.5, 0.24, s, 18); }
  for (const s of [-1, 1]) addWheel(PM, s * 1.05, 0.5, 13.0, 0.5, 0.26, s, 18);
  for (const z of [3.4, 4.6, 13.0]) PM.add('dark', xTube(-1.3, 1.3, 0.06, 0.06, 8, 0.5, z));
  for (const s of [-1, 1]) PM.add('camo', box(0.3, 0.06, 2.4, s * 1.12, 1.08, 4.0)); // mudguards
  PM.add('camo', box(0.4, 0.4, 0.4, 0, 0.75, 13.0)); // the turntable of the front axle
  PM.add('camo', rod(V(0, 0.75, 13.2), V(0, 0.65, 16.2), 0.06, 6));
  PM.add('dark', new THREE.TorusGeometry(0.16, 0.04, 6, 12).translate(0, 0.65, 16.35).rotateZ(0));
  // the hydraulic pump and its tank on the frame, the control stand on the right, the stabilising jacks at the rear
  PM.add('camo', rbox(1.0, 0.8, 1.3, 0.05, 0, 1.65, 10.5));
  PM.add('steel', yTube(1.25, 1.75, 0.22, 0.22, 12, 0.7, 11.6));
  PM.add('camo', box(0.5, 1.0, 0.3, 1.1, 1.7, 7.2));
  PM.add('dark', box(0.4, 0.3, 0.05, 1.1, 1.95, 7.04));
  for (const s of [-1, 1]) {
    PM.add('camo', yTube(0.1, 1.0, 0.08, 0.08, 8, s * 1.1, 1.6));
    PM.add('dark', yTube(0.0, 0.08, 0.22, 0.22, 10, s * 1.1, 1.6));
    PM.add('camo', box(0.5, 0.15, 0.2, s * 0.95, 0.95, 1.6));
  }
  // the pivot brackets at the rear of the frame
  for (const s of [-1, 1]) PM.add('camo', box(0.18, 0.55, 0.6, s * 0.75, PIV.y, PIV.z));
  PM.add('steel', xTube(-0.9, 0.9, 0.08, 0.08, 10, PIV.y, PIV.z));

  // ---- the erector arm: two lattice girders, the clamp rings round the rocket, a ladder of rungs
  const arm = node(meiller, 'erector', 0, PIV.y, PIV.z);
  rig.pivots.erector = arm;
  for (const s of [-1, 1]) {
    PA.add('camo', box(0.16, 0.16, 12.6, s * 0.6, 0.15, 6.3));
    PA.add('camo', box(0.16, 0.12, 11.0, s * 0.6, 0.85, 6.8));
    for (let z = 0.6; z < 12.4; z += 1.0) {
      PA.add('camo', box(0.1, 0.7, 0.1, s * 0.6, 0.5, z));
      PA.add('camo', rod(V(s * 0.6, 0.2, z), V(s * 0.6, 0.82, z + 0.95), 0.03, 5));
    }
  }
  for (let z = 1.0; z < 12.4; z += 2.0) PA.add('camo', box(1.3, 0.1, 0.12, 0, 0.15, z));
  PA.add('camo', xTube(-0.7, 0.7, 0.12, 0.12, 10, 0, 0.0));
  for (const z of [4.3, 8.4, 10.6]) {
    const r = rAtBase(z - ZB) + 0.04;
    // the cradle (fixed half under the rocket) and the clamp's upper half (hinged; open once the rocket stands)
    PA.add('camo', new THREE.TorusGeometry(r + 0.05, 0.06, 6, 24, Math.PI).rotateX(Math.PI).translate(0, D, z));
    PA.add('camo', new THREE.TorusGeometry(r + 0.05, 0.05, 6, 24, Math.PI).translate(0, D, z));
    for (const s of [-1, 1]) {
      PA.add('camo', rod(V(s * 0.6, 0.9, z), V(s * 0.5, D - r * 0.8, z), 0.06, 6));
      PA.add('dark', box(0.12, 0.2, 0.18, s * (r + 0.1), D, z));
    }
  }
  // the hydraulic rams: an outer cylinder from the trailer frame, a rod out of it to the arm (posed in setErect)
  const rams = [-1, 1].map((s) => {
    const g = node(meiller, 'ram', s * 0.95, 1.15, 9.6), cyl = new THREE.Mesh(unitTube(0.13), mats.camo), rodM = new THREE.Mesh(unitTube(0.075), mats.steel);
    cyl.scale.y = 3.0;
    g.add(cyl, rodM);
    return { g, rodM, s, at: V(s * 0.95, 0.5, 3.6) };
  });

  // ---- the rocket (built standing: base at y = 0) and its frost
  const rocket = new THREE.Group();
  rocket.name = 'rocket';
  const inner = node(rocket, 'a4', 0, A4.L / 2, 0, Math.PI / 2, 0, 0); // the missile frame's nose (-Z) up
  missileMeshes(inner, a4Pieces(Math.PI / 4).lists);
  const frostR = new THREE.Mesh(new THREE.CylinderGeometry(A4.R + 0.012, A4.R + 0.012, A4.lox[1] - A4.lox[0], 36, 1, true).translate(0, (A4.lox[0] + A4.lox[1]) / 2, 0), frost);
  rocket.add(frostR);
  const armHolder = node(arm, 'armHolder', 0, D, ZB, Math.PI / 2, 0, 0); // rocket +Y along the arm (+Z)

  // ---- the alcohol bowser: a two-axle trailer with an oval tank and the pump at the rear
  {
    const { x, z } = ALC;
    P.add('camo', box(1.2, 0.2, 6.2, x, 0.85, z));
    for (const zz of [-1.9, 1.9]) for (const s of [-1, 1]) addWheel(P, x + s * 1.0, 0.45, z + zz, 0.45, 0.24, s, 16);
    P.add('camo', zTube(z - 2.75, z + 2.4, 0.95, 0.95, 24, x, 1.95));
    P.add('camo', sphere(0.95, x, 1.95, z - 2.75, 1, 1, 0.25, 16));
    P.add('camo', sphere(0.95, x, 1.95, z + 2.4, 1, 1, 0.25, 16));
    P.add('steel', yTube(2.8, 3.0, 0.25, 0.25, 12, x, z - 0.5)); // the dome
    P.add('camo', box(1.3, 0.9, 0.9, x, 1.35, z + 2.85)); // the pump
    P.add('camo', rod(V(x, 0.8, z - 3.1), V(x, 0.65, z - 4.6), 0.05, 6));
    for (const s of [-1, 1]) P.add('camo', box(0.06, 0.06, 5.0, x + s * 0.8, 2.85, z - 0.2)); // the hand rails along the top
  }
  // ---- the liquid oxygen trailer: a lagged tank in aluminium paint (it frosts while it fills the rocket)
  let frostT;
  {
    const { x, z } = LOX;
    P.add('camo', box(1.2, 0.2, 6.6, x, 0.85, z));
    for (const zz of [-2.0, 2.0]) for (const s of [-1, 1]) addWheel(P, x + s * 1.0, 0.45, z + zz, 0.45, 0.24, s, 16);
    addP(P, 'lagging', zTube(z - 2.8, z + 2.6, 0.9, 0.9, 24, x, 1.9));
    for (const zz of [-2.8, 2.6]) addP(P, 'lagging', sphere(0.9, x, 1.9, z + zz, 1, 1, 0.3, 16));
    for (const zz of [-2.0, -0.5, 1.0, 2.3]) P.add('dark', zTube(z + zz - 0.04, z + zz + 0.04, 0.92, 0.92, 24, x, 1.9));
    P.add('camo', box(1.4, 1.2, 1.0, x, 1.5, z + 3.2)); // the valve cabinet at the rear
    P.add('steel', yTube(2.75, 3.1, 0.12, 0.12, 10, x, z - 1.5)); // the vent
    P.add('camo', rod(V(x, 0.8, z - 3.3), V(x, 0.65, z - 4.8), 0.05, 6));
    frostT = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 5.0, 24, 1, true).rotateX(Math.PI / 2).translate(x, 1.9, z - 0.1), frost);
    root.add(frostT);
  }
  // ---- the power trailer: a box body on two wheels, louvres, the cable reel at the back
  {
    const { x, z } = PWR;
    P.add('camo', rbox(1.6, 1.5, 2.8, 0.05, x, 1.45, z));
    P.add('roof', box(1.7, 0.06, 2.9, x, 2.22, z));
    for (const s of [-1, 1]) addWheel(P, x + s * 0.95, 0.45, z, 0.45, 0.22, s, 16);
    for (let i = 0; i < 6; i++) P.add('dark', box(0.02, 0.05, 1.2, x + 0.81, 1.3 + i * 0.1, z + 0.3));
    P.add('camo', rod(V(x, 0.75, z - 1.4), V(x, 0.6, z - 2.8), 0.05, 6));
    P.add('dark', box(0.6, 0.15, 0.4, x, 0.12, z - 2.9));
  }

  // ---- the Feuerleitpanzer (Sd.Kfz. 7/3) and its cable drum: a halftrack with an armoured box body
  {
    const g = node(root, 'flp', FLP.x, 0, FLP.z, 0, face(FLP.x, FLP.z, 0, 0), 0);
    const PF = mk();
    // running gear: the steered front wheels, the track run over interleaved road wheels
    for (const s of [-1, 1]) {
      addWheel(PF, s * 0.95, 0.45, -2.6, 0.45, 0.24, s, 14);
      for (let i = 0; i < 6; i++) PF.add('rubber', xTube(-0.13, 0.13, 0.36, 0.36, 14, 0.42, -0.9 + i * 0.5).translate(s * (0.95 + (i % 2) * 0.05), 0, 0));
      PF.add('rubber', box(0.36, 0.06, 3.6, s * 1.0, 0.03, 0.4));
      PF.add('rubber', box(0.36, 0.06, 3.2, s * 1.0, 0.84, 0.4));
      PF.add('rubber', yTube(0.0, 0.36, 0.42, 0.42, 14, 0, 0).rotateZ(Math.PI / 2).translate(s * 1.0, 0.42, -1.5));
      PF.add('camo', box(0.4, 0.06, 4.4, s * 1.02, 1.0, 0.1)); // the track guard
    }
    // the armoured body: sloped nose over the engine, a tall box behind with a vision slit and the rear door
    PF.add('camo', box(1.6, 0.6, 1.9, 0, 1.1, -2.3));
    PF.add('camo', box(1.6, 0.7, 1.4, 0, 1.6, -2.4, -0.45));
    PF.add('camo', box(2.25, 1.6, 4.3, 0, 1.9, 0.6));
    PF.add('camo', box(2.1, 0.7, 0.2, 0, 2.2, -1.65, 0.5));
    PF.add('dark', box(0.8, 0.08, 0.05, 0, 2.3, -1.79, 0.5));
    for (const s of [-1, 1]) PF.add('dark', box(0.05, 0.08, 0.5, s * 1.13, 2.35, 0.0));
    PF.add('dark', box(0.8, 1.2, 0.04, 0, 1.75, 2.76));
    PF.add('steel', yTube(2.7, 4.2, 0.03, 0.01, 6, 0.8, 2.3)); // the radio aerial
    PF.add('roof', box(2.2, 0.05, 4.2, 0, 2.72, 0.6));
    PF.add('dark', box(0.4, 0.15, 0.2, 0.6, 1.1, -3.3)); // a headlight's mount
    // the cable drum trailer behind it
    PF.add('camo', box(1.4, 0.15, 1.6, 0, 0.6, 4.6));
    for (const s of [-1, 1]) { addWheel(PF, s * 0.85, 0.35, 4.6, 0.35, 0.18, s, 12); PF.add('camo', box(0.06, 1.0, 0.2, s * 0.55, 1.15, 4.6)); }
    PF.add('rubber', xTube(-0.5, 0.5, 0.5, 0.5, 20, 1.3, 4.6));
    PF.add('camo', xTube(-0.53, -0.5, 0.6, 0.6, 20, 1.3, 4.6));
    PF.add('camo', xTube(0.5, 0.53, 0.6, 0.6, 20, 1.3, 4.6));
    PF.add('camo', rod(V(0, 0.6, 3.8), V(0, 0.55, 2.9), 0.04, 6));
    PF.build(g, { dirt: 0.4, y0: 0 });
  }
  // the firing cable from the drum to the table, along the ground
  {
    const pts = [V(-1.4, 0.03, 1.2), V(-12, 0.03, 9), V(-30, 0.03, 30), V(-48, 0.03, 52), V(FLP.x + 3.6, 0.03, FLP.z - 3.0)];
    for (let i = 0; i < pts.length - 1; i++) P.add('rubber', rod(pts[i], pts[i + 1], 0.02, 4));
  }
  // hoses from the bowsers to the tail of the standing rocket (shown when connected)
  const hose = (from, toZ, toX) => {
    const c = new THREE.CatmullRomCurve3([from, V(from.x * 0.6, 0.06, from.z * 0.6), V(toX * 1.8, 0.06, toZ * 1.8), V(toX, T + 0.15, toZ), V(toX * 0.66, T + 0.6, toZ * 0.66)]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.05, 6), mats.hose);
    m.castShadow = true;
    m.visible = false;
    root.add(m);
    return m;
  };
  const hoseA = hose(V(ALC.x, 1.1, ALC.z + 2.85), -0.4, 1.0), hoseL = hose(V(LOX.x + 0.5, 1.2, LOX.z + 3.2), 0.4, -1.0);

  // ---- the wood round the clearing (a gap where the Meillerwagen came in), stumps and brushwood
  const trees = node(root, 'trees');
  rig.trees = trees;
  {
    const PTr = mk();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + (rnd() - 0.5) * 0.1, r = 34 + rnd() * 14;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.abs(a - 0) < 0.25 || Math.abs(a - Math.PI * 2) < 0.25) continue; // the track in along +Z
      if (Math.hypot(x - FLP.x, z - FLP.z) < 70 && Math.abs(Math.atan2(FLP.x, FLP.z) - a) < 0.12) continue; // the cable's way out
      conifer(PTr, x, z, 16 + rnd() * 9, rnd);
    }
    for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2, r = 16 + rnd() * 14; PTr.add('bark', yTube(0, 0.4, 0.25, 0.22, 7, Math.sin(a) * r, Math.cos(a) * r)); }
    PTr.build(trees, { dirt: 0, y0: 0 });
  }
  mound(P, 14, 12, 4, 3, 0.8, rnd, 4); // spoil from levelling the pad
  addP(P, 'concrete', box(7, 0.08, 7, 0, 0.0, 0), { tint: 0xb0a890 }); // a gravel and plank pad under the table

  P.build(root, { dirt: 0.3, y0: 0 });
  PT.build(table, { dirt: 0.2, y0: 0 });
  PM.build(meiller, { dirt: 0.35, y0: 0 });
  PA.build(arm, { dirt: 0.15, y0: PIV.y });

  // ---- state
  let erect = 0, mWith = 0, rocketOn = true;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = V(0, 1, 0);
  const pose = () => {
    const standing = erect >= 0.999;
    const fold = standing ? smooth((mWith - 0.02) / 0.3) : 0;
    const ang = -Math.PI / 2 * smooth(erect) * (1 - fold * 0.92);
    arm.rotation.x = ang;
    meiller.position.z = WITHDRAW * smooth(mWith);
    const holder = standing ? tableHolder : armHolder;
    if (rocket.parent !== holder) holder.add(rocket);
    rocket.visible = rocketOn;
    // the rams from the trailer frame to their lugs on the arm (all in the trailer's frame)
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const r of rams) {
      _a.set(r.at.x, PIV.y + r.at.y * c - r.at.z * s, PIV.z + r.at.y * s + r.at.z * c).sub(r.g.position);
      const L = _a.length();
      _q.setFromUnitVectors(UP, _b.copy(_a).divideScalar(L));
      r.g.quaternion.copy(_q);
      r.rodM.scale.y = L;
    }
  };
  rig.setErect = (k) => { erect = clamp01(k); pose(); };
  rig.setMeiller = (k) => { mWith = clamp01(k); pose(); };
  rig.setTable = (rad) => { table.rotation.y = rad; };
  rig.setFuel = ({ alcohol = 0, lox = 0 } = {}) => {
    hoseA.visible = alcohol > 0;
    hoseL.visible = lox > 0;
    frost.opacity = 0.9 * smooth(lox);
    frostR.visible = frostT.visible = lox > 0.01;
  };
  rig.setRocket = (v) => { rocketOn = !!v; rocket.visible = rocketOn; };
  rig.setErect(0);
  rig.setFuel({});

  // ---- anchors, crew, hit boxes
  anchor(rig, root, 'rocket', 0, T, 0);
  const muz = anchor(rig, root, 'muzzle', 0, T + A4.L, 0);
  muz.rotation.x = Math.PI / 2; // its -Z up
  rig.anchors.muzzles.push(muz);
  anchor(rig, root, 'bunker', FLP.x, 1.8, FLP.z);
  anchor(rig, root, 'eye', 0, 4.5, 2);
  anchor(rig, root, 'breech', 0, T + 1.5, 0);
  anchor(rig, root, 'shellStack', 0, 2.7, 9);
  crewSpot(rig, 'officer', -5.5, 0, -5.5, face(-5.5, -5.5, 0, 0), 'point');
  crewSpot(rig, 'launcher', FLP.x + 1.6, 0, FLP.z - 2.6, face(FLP.x, FLP.z, 0, 0), 'phone');
  crewSpot(rig, 'meiller', 1.7, 0, 7.2, face(1.7, 7.2, 1.1, 7.2), 'operate');
  crewSpot(rig, 'table', 2.4, 0, -1.9, face(2.4, -1.9, 1.7, -1.7), 'crouch');
  crewSpot(rig, 'fuel', ALC.x - 1.4, 0, ALC.z + 3.0, face(0, 0, 1, 0), 'operate');
  crewSpot(rig, 'lox', LOX.x + 1.4, 0, LOX.z + 3.4, face(0, 0, -1, 0), 'operate');
  crewSpot(rig, 'power', PWR.x + 1.3, 0, PWR.z - 0.5, face(0, 0, -1, 0), 'stand');
  hb(rig, -1.8, 0, -1.8, 1.8, T + A4.L, 1.8);
  hb(rig, -1.4, 0, 1.2, 1.4, 3.6, 16.5);
  hb(rig, ALC.x - 1.2, 0, ALC.z - 3.2, ALC.x + 1.2, 3.0, ALC.z + 3.3);
  hb(rig, LOX.x - 1.2, 0, LOX.z - 3.3, LOX.x + 1.2, 3.0, LOX.z + 3.7);
  finishGun(rig);
  frostR.castShadow = frostT.castShadow = false; // a skin of rime casts no shadow of its own
  return rig;
}

// the A4's radius at h metres above its base (for the clamp rings)
function rAtBase(h) {
  const s = A4.L - h;
  if (s >= 10.3) return A4.R - (s - 10.3) / 3.7 * 0.275;
  if (s >= 5) return A4.R;
  return 0.3 + s * 0.105;
}

// Patchy frost: a vertical streaky mask (rime collects in runs down the tank), so the paint shows through.
let frostTex;
function frostAlpha() {
  if (frostTex) return frostTex;
  const W = 128, H = 128, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), rnd = mulberry32(77);
  c.fillStyle = '#b4b4b4';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const v = Math.floor(120 + rnd() * 135);
    c.fillStyle = `rgb(${v},${v},${v})`;
    c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 4, 6 + rnd() * 40);
  }
  frostTex = new THREE.CanvasTexture(cv);
  frostTex.wrapS = frostTex.wrapT = THREE.RepeatWrapping;
  frostTex.repeat.set(3, 1);
  return frostTex;
}

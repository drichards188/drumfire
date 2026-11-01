import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, zLathe, rivetRow, mergeAll, Parts, vehicleMats } from '../../kit.js';
import { mulberry32 } from '../../../noise.js';
import { makeRig, finishRig, node, pivotAt, hb, crew, ring, L90, R90, TAU } from '../../t/fieldkit.js';
import { panoramicSight } from './common.js';

/**
 * 25 cm schwerer Minenwerfer neuer Art (Rheinmetall, 1916), the heavy trench mortar of the Minenwerfer companies, in
 * its pit behind the front trench. From the Imperial War Museum's photograph Q 23722 (a crew loading the short
 * model: the 97 kg Mine lifted into the muzzle by hand, the elevating handwheel and its arc on the side of the
 * carriage, the bed on the pit's floor), the Australian War Memorial's catalogue entry for its n.A. (a bed plate, a
 * cradle, and the barrel in its recoil jacket with two identical recoil cylinders, one above the barrel and one
 * below, buffer and recuperator; detachable wheels so it could be set up in small emplacements and narrow trenches)
 * and Wikipedia (the n.A.'s rifled tube 1.25 m (L/5), 768 kg, elevation +45 to +75 degrees, 12 degrees of traverse,
 * a muzzle loader: the charge first, then the bomb, its copper studs in the rifling). Proportions [E] estimate
 * against the photograph's men: the bore at about 1.5 m at the loading elevation.
 *
 * Rig (DESIGN.md "Models"): root y = 0 the pit's floor, -Z the front at zero traverse. The square bed (timber in a
 * steel frame, its turntable ring on top) is fixed; `traverse` turns the upper carriage on the turntable about its
 * centre (the origin); `elevation` at the trunnions; `recoil` slides the tube back in its cradle along +Z (0.2 m:
 * the rods of the two recoil cylinders, above and below, run in with it). No breech: `breech` is an empty pivot and
 * setBreech does nothing; the charge and the bomb go in at the muzzle with the tube at its loading elevation (rig.loadEl
 * 45 degrees). Anchors: eye, muzzle (+ muzzles), breech (the closed rear end, where the lanyard's friction tube goes in),
 * tray (where the bomb's middle rests in the bore when it is home), shellStack (the next bomb standing on the floor at
 * the bomb store's mouth, root), crew spots for render/ww1/smw.js, which reads rig.smw. Props for the drill: the
 * carrying bar with its yoke (rig.bar: an Object3D under the root, posed by the crew module; local X along the bar, the
 * yoke's ring round local Z, the bomb's axis).
 * buildSMW({ scheme: 'bunt' | 'feldgrau' }); buildSMWSite(seed) => { root }: the pit round it in the gun's frame.
 */
const BED = { half: 0.75, y: 0.2 }; // the bed's half width and its top
const TT = { r: 0.62, y: 0.25 }; // the turntable ring and its top (the upper carriage stands on it)
export const TRY = 0.85, TRZ = 0.05; // trunnion axis over the floor, ahead of the pivot
const MZ = -0.95, BZ = 0.3; // muzzle and rear face along the bore from the trunnions (1.25 m, L/5)
const BORE = 0.125, RT = 0.172; // bore radius, the tube's outer radius at the chase
const CY = 0.27; // the recoil cylinders' offset above and below the bore
const CHX = 0.3; // the cheeks' inner faces
const REC = 0.2;
export const SMW = { TRY, TRZ, MZ, BZ, BORE, PIT: { x: 2.5, z0: -2.1, z1: 2.5, h: 1.55 }, STACK: { x: 1.4, z: -1.15 }, BAR: 0.62, SIDE: 0.86 };

export function buildSMW({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  rig.scheme = scheme;
  const { root } = rig;

  // ---------------------------------------------------------------- the bed (fixed)
  const F = rig.part();
  bed(F);
  F.build(root, { dirt: 0.5 });

  // ---------------------------------------------------------------- the upper carriage (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const C = rig.part();
  carriage(C);
  C.build(trav, { dirt: 0.4 });

  // ---------------------------------------------------------------- the cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  cradle(E);
  E.build(el, { dirt: 0.2, y0: TRY });

  // ---------------------------------------------------------------- the tube (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  tube(B);
  B.build(rc, { dirt: 0.1, y0: TRY });
  rig.pivots.breech = node(rc, 'breech', 0, 0, BZ);
  rig.setBreech = () => {};
  rig.setShell = () => {};
  rig.recoilLength = REC;
  rig.loadEl = 45 * DEG;

  // ---------------------------------------------------------------- the carrying bar (a prop for the drill)
  const bar = new THREE.Group();
  bar.name = 'carrying-bar';
  bar.rotation.order = 'YXZ';
  const BP = rig.part(), BR = SMW.BAR;
  BP.add('wood', xTube(-BR - 0.12, BR + 0.12, 0.024, 0.024, 8));
  BP.add('iron', new THREE.TorusGeometry(0.142, 0.02, 6, 20)); // the yoke's ring round the bomb (local Z its axis)
  for (const s of [-1, 1]) {
    BP.add('iron', xTube(s * 0.14, s * 0.2, 0.034, 0.03, 8)); // the trunnion sockets the bar passes through
    BP.add('dark', xTube(s * (BR + 0.12), s * (BR + 0.15), 0.03, 0.03, 8)); // its iron ferrules
  }
  BP.build(bar, { dirt: 0.1 });
  bar.visible = false;
  root.add(bar);
  rig.bar = bar;

  // ---------------------------------------------------------------- anchors and crew
  const sr = 0.123; // the bomb's radius (models/shells.js smw)
  rig.anchors.eye = node(trav, 'eye', 0, 1.6, 1.4);
  rig.anchors.muzzle = node(rc, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(rc, 'breech-face', 0, 0, BZ);
  rig.anchors.tray = node(rc, 'tray', 0, 0, BZ - 0.2 - 0.38); // the bomb's middle, home on the charge
  rig.anchors.shellStack = node(root, 'shellStack', SMW.STACK.x, 0.38 + 0.02, SMW.STACK.z);
  rig.smw = { ...SMW, bombR: sr, homeA: BZ - 0.2 - 0.38 };

  // Eight men: the Werferführer, the layer at the sight and the elevating handwheel on the left, the traverser at the
  // crank behind the carriage, the firer with the lanyard on the right, the charge man by the charge box right of the
  // muzzle, the two bomb carriers at the store's mouth (they bring the bomb on the bar between them), and the
  // store man in the niche who hands the bombs out.
  crew(rig, 'officer', -1.5, 1.5, L90, 'point');
  crew(rig, 'layer', -0.82, 0.3, L90, 'lay');
  crew(rig, 'traverser', 0.0, 1.15, 0, 'operate');
  crew(rig, 'lanyard', 1.15, 1.25, R90, 'lanyard');
  crew(rig, 'charger', 1.0, -0.05, R90, 'stand');
  crew(rig, 'bomb1', SMW.STACK.x - SMW.SIDE, SMW.STACK.z, 0, 'stand');
  crew(rig, 'bomb2', SMW.STACK.x + SMW.SIDE, SMW.STACK.z, 0, 'stand');
  crew(rig, 'ammo1', 1.95, 0.45, R90, 'stand');

  hb(rig, -BED.half, 0, -BED.half, BED.half, 1.2, BED.half);
  return finishRig(rig, 'smw', 'smw');
}

// ---------------------------------------------------------------- the bed
// Heavy squared timbers in a riveted angle-iron frame with lifting handles at the corners and the wheels' axle
// brackets on two sides (the wheels come off for firing, see the site), the turntable's ring and its clamp bolts.
function bed(P) {
  const H = BED.half, y = BED.y;
  for (let i = 0; i < 6; i++) {
    const z = -H + 0.12 + (i * (2 * H - 0.24)) / 5;
    P.add('wood', box(2 * H - 0.08, y - 0.03, 0.24, 0, (y - 0.03) / 2, z), { tint: [0xffffff, 0xe6dccb, 0xd8ccb8][i % 3] });
  }
  for (const s of [-1, 1]) {
    P.add('camo', box(2 * H, 0.06, 0.012, 0, y - 0.03, s * H));
    P.add('camo', box(0.012, 0.06, 2 * H, s * H, y - 0.03, 0));
    P.add('camo', box(2 * H, 0.012, 0.06, 0, y, s * (H - 0.03)));
    P.add('camo', box(0.06, 0.012, 2 * H, s * (H - 0.03), y, 0));
    P.add('camo', rivetRow(V(-H + 0.05, y - 0.03, s * (H + 0.007)), V(H - 0.05, y - 0.03, s * (H + 0.007)), 0.1, V(0, 0, s), 0.01), { tint: 0xd0c8b4 });
    P.add('camo', rivetRow(V(s * (H + 0.007), y - 0.03, -H + 0.05), V(s * (H + 0.007), y - 0.03, H - 0.05), 0.1, V(s, 0, 0), 0.01), { tint: 0xd0c8b4 });
    // the wheel brackets with their stub sockets (empty: the wheels are off)
    P.add('camo', box(0.04, 0.16, 0.3, s * (H + 0.02), y - 0.08, 0.0));
    P.add('dark', xTube(s * (H + 0.04), s * (H + 0.07), 0.05, 0.05, 10, y - 0.08, 0));
    for (const z of [-1, 1]) P.add('steel', rod(V(s * (H + 0.01), y - 0.02, z * (H - 0.18)), V(s * (H + 0.1), y - 0.02, z * (H - 0.18)), 0.012, 5));
  }
  // the turntable: a cast ring on its plate, clamp bolts round it
  P.add('camo', yTube(y, y + 0.012, TT.r + 0.06, TT.r + 0.06, 32));
  P.add('dark', yTube(y + 0.012, TT.y, TT.r, TT.r - 0.02, 36));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    P.add('steel', yTube(y + 0.012, y + 0.04, 0.016, 0.016, 6, Math.sin(a) * (TT.r + 0.035), Math.cos(a) * (TT.r + 0.035)));
  }
  // the traversing arc's graduated scale on the bed's front edge
  P.add('brass', box(0.6, 0.012, 0.03, 0, y + 0.006, -H + 0.09));
}

// ---------------------------------------------------------------- the upper carriage
// A pressed base plate on the turntable, the two cheeks rising to the trunnions, a transom across their fronts and a
// box behind, the elevating handwheel and its pinion on the left cheek with the sight above it, the traversing crank
// at the rear (it walks the carriage round the ring on a toothed rim).
const CHEEK = [[-0.42, TT.y + 0.02], [-0.42, 0.52], [-0.22, TRY - 0.02], [-0.05, TRY + 0.13], [0.18, TRY + 0.13], [0.3, TRY - 0.02], [0.52, 0.48], [0.52, TT.y + 0.02]];
function carriage(P) {
  P.add('camo', yTube(TT.y, TT.y + 0.04, TT.r - 0.03, TT.r - 0.05, 32));
  P.add('camo', box(0.84, 0.03, 0.96, 0, TT.y + 0.055, 0.05));
  for (const s of [-1, 1]) {
    P.add('camo', sideProfile(CHEEK, 0.03).translate(s * (CHX + 0.015), 0, 0));
    for (let i = 0; i < CHEEK.length - 1; i++) { // the flange round the cheek's edge
      const [z0, y0] = CHEEK[i], [z1, y1] = CHEEK[i + 1], l = Math.hypot(z1 - z0, y1 - y0);
      P.add('camo', box(0.07, 0.016, l + 0.01, s * (CHX + 0.045), (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    P.add('camo', rivetRow(V(s * (CHX + 0.031), TT.y + 0.1, -0.38), V(s * (CHX + 0.031), TT.y + 0.1, 0.48), 0.08, V(s, 0, 0), 0.01), { tint: 0xd0c8b4 });
    // the trunnion bearing and its cap
    P.add('camo', xTube(s * (CHX + 0.03), s * (CHX + 0.08), 0.1, 0.095, 18, TRY, TRZ));
    P.add('steel', xTube(s * (CHX + 0.08), s * (CHX + 0.092), 0.05, 0.05, 12, TRY, TRZ));
    P.add('camo', box(0.04, 0.05, 0.24, s * (CHX + 0.05), TRY + 0.11, TRZ));
  }
  P.add('camo', box(CHX * 2, 0.22, 0.025, 0, TT.y + 0.18, -0.4)); // the front transom
  P.add('camo', rbox(CHX * 2, 0.16, 0.22, 0.02, 0, TT.y + 0.14, 0.42)); // the box behind
  // left: the elevating pinion under the cradle's arc, its shaft out through the cheek, the handwheel, the sight
  const pa = 75 * DEG, pr = 0.47, py = TRY - pr * Math.sin(pa), pz = TRZ + pr * Math.cos(pa) + 0.04;
  P.add('dark', xTube(-(CHX - 0.06), -(CHX + 0.03), 0.04, 0.04, 12, py, pz));
  P.add('dark', xTube(-(CHX + 0.03), -(CHX + 0.17), 0.016, 0.016, 8, py, pz));
  P.add('dark', handwheelX(0.13).translate(-(CHX + 0.17), py, pz));
  P.add('camo', box(0.04, 0.42, 0.06, -(CHX + 0.05), TRY + 0.05, 0.28));
  P.add('camo', box(0.12, 0.03, 0.08, -(CHX + 0.09), TRY + 0.26, 0.28));
  panoramicSight(P, -(CHX + 0.13), TRY + 0.27, 0.28, -1);
  // the traversing crank on the box at the rear, its pinion down to the ring's rim
  P.add('camo', box(0.14, 0.14, 0.12, 0.0, TT.y + 0.27, 0.56));
  P.add('dark', zTube(0.62, 0.66, 0.035, 0.035, 10, 0, TT.y + 0.27));
  P.add('steel', rod(V(0, TT.y + 0.27, 0.66), V(0, TT.y + 0.43, 0.68), 0.014, 6));
  P.add('dark', zTube(0.68, 0.76, 0.018, 0.018, 6, 0, TT.y + 0.43));
  P.add('dark', yTube(TT.y - 0.03, TT.y + 0.2, 0.025, 0.025, 8, 0.0, 0.55));
}

// A small handwheel (axis X): rim, five spokes, boss, a handle out to -X.
function handwheelX(R) {
  const g = [new THREE.TorusGeometry(R, 0.011, 5, 18).rotateY(Math.PI / 2), xTube(-0.03, 0.03, 0.026, 0.022, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.008, 4)); }
  g.push(xTube(0, -0.06, 0.009, 0.009, 6, R, 0), xTube(-0.06, -0.1, 0.014, 0.014, 6, R, 0));
  return mergeAll(g);
}

// ---------------------------------------------------------------- the cradle
// The recoil jacket's cradle: a sleeve round the tube's rear half carrying the trunnions, the two recoil cylinders
// in brackets above and below it, the elevating arc on the left.
function cradle(P) {
  P.add('camo', zTube(-0.2, BZ - 0.02, RT + 0.06, RT + 0.06, 28, 0, 0, true));
  P.add('camo', zTube(-0.2, BZ - 0.02, RT + 0.012, RT + 0.012, 28, 0, 0, true)); // its inside
  for (const z of [-0.2, BZ - 0.02]) P.add('camo', ring(RT + 0.012, RT + 0.08, -0.015, 0.015, 28).rotateY(Math.PI / 2).translate(0, 0, z));
  for (const s of [-1, 1]) {
    P.add('steel', xTube(s * (RT + 0.04), s * (CHX + 0.03), 0.05, 0.05, 12));
    P.add('camo', box(0.04, 0.2, 0.2, s * (RT + 0.07), 0, 0));
    // the cylinders: above and below, in brackets off the sleeve
    const y = s * CY;
    P.add('camo', zTube(-0.42, BZ - 0.04, 0.066, 0.066, 18, 0, y));
    P.add('dark', zTube(-0.44, -0.42, 0.058, 0.058, 16, 0, y)); // the gland
    P.add('camo', zTube(BZ - 0.04, BZ - 0.01, 0.07, 0.06, 18, 0, y)); // the rear cap
    for (const z of [-0.12, BZ - 0.1]) P.add('camo', box(0.07, CY - RT - 0.04, 0.07, 0, s * (RT + 0.04 + (CY - RT - 0.04) / 2), z));
    P.add('steel', yTube(y + s * 0.066, y + s * 0.09, 0.012, 0.012, 6, 0, -0.3)); // a filling plug
  }
  // the elevating arc on the left, below the sleeve
  P.add('dark', gearArc(0.4, 0.45, 50 * DEG, 110 * DEG, 0.035, 14, 0.02).translate(-(CHX - 0.06), 0, 0));
  P.add('camo', sideProfile([[0.25, -0.17], [0.1, -0.39], [-0.15, -0.38], [-0.2, -0.17]], 0.02).translate(-(CHX - 0.06), 0, 0));
  P.add('camo', box(CHX - 0.06 - RT, 0.06, 0.3, -(RT + (CHX - 0.06 - RT) / 2), -0.17, 0.02));
}

// ---------------------------------------------------------------- the tube
// The rifled tube, plain and slightly tapered, a reinforcing ring at the mouth; its rear half inside the jacket; the
// yoke near the muzzle where the cylinders' piston rods are made fast; the closed, rounded rear end with the vent for
// the friction tube and the lanyard's eye. Rifling grooves show in the mouth.
function tube(P) {
  P.add('camo', zLathe([[MZ + 0.4, BORE], [MZ, BORE], [MZ, RT + 0.012], [MZ + 0.012, RT + 0.022], [MZ + 0.08, RT + 0.022], [MZ + 0.092, RT + 0.008], [-0.2, RT + 0.01],
    [-0.2, RT], [BZ - 0.04, RT], [BZ, RT - 0.04], [BZ + 0.04, RT - 0.1], [BZ + 0.05, 0.0001]], 32));
  P.add('char', new THREE.CircleGeometry(BORE, 22).rotateY(Math.PI).translate(0, 0, MZ + 0.4));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    P.add('dark', box(0.012, 0.006, 0.4, Math.cos(a) * (BORE - 0.002), Math.sin(a) * (BORE - 0.002), MZ + 0.2, 0, 0, a + Math.PI / 2));
  }
  // the yoke: a band and two lugs, the rods back into the cylinders
  P.add('camo', zTube(-0.62, -0.52, RT + 0.03, RT + 0.03, 28));
  for (const s of [-1, 1]) {
    P.add('camo', box(0.1, CY - RT - 0.01, 0.1, 0, s * (RT + (CY - RT) / 2 + 0.01), -0.57));
    P.add('camo', zTube(-0.62, -0.52, 0.06, 0.06, 14, 0, s * CY));
    P.add('steel', zTube(-0.52, -0.1, 0.028, 0.028, 10, 0, s * CY));
  }
  // the vent and the lanyard's eye on the rear end
  P.add('dark', zTube(BZ + 0.04, BZ + 0.09, 0.022, 0.02, 8, 0, 0));
  P.add('steel', new THREE.TorusGeometry(0.025, 0.007, 5, 10).translate(0.0, 0.05, BZ + 0.06));
}

// ================================================================ the Minenwerfer pit
// buildSMWSite(seed) => { root }: the emplacement round the gun in its frame (y = 0 the pit's floor, under the bed),
// to be put where the rig's root is and turned with it. A pit 5 by 4.6 m dug 1.55 m deep behind the front trench:
// walls revetted with planks held by posts, the spoil thrown up outside and banked down to the ground, a sandbag
// course along the top; a duckboard floor round the bed; steps up out of the rear to the communication trench; a
// dugout's timber-framed entrance in the left wall with steps going down into the dark; the bomb store in a niche in
// the right wall (bombs standing in a row, more on a shelf), a box of charges by the charger's place; the wheels and
// the axle taken off for firing leaning against the left wall. Nothing stands within the bed's swing.
export function buildSMWSite(seed = 1) {
  const mats = vehicleMats('bunt');
  const rnd = mulberry32(7301 + (seed | 0) * 13);
  const j = (a) => (rnd() - 0.5) * a;
  const root = new THREE.Group();
  root.name = 'smw-site';
  const P = new Parts(mats);
  const { x: X, z0: Z0, z1: Z1, h: H } = SMW.PIT;
  const tints = [0xffffff, 0xe6dece, 0xd2c8b6, 0xc4baa6];

  // walls: horizontal planks behind posts, on the four sides; the rear has a gap for the steps. holes: [t0, t1, top]
  // (metres along the wall from its first end, the opening's height): the dugout's door and the bomb store's mouth
  const wall = (ax, az, bx, bz, holes = []) => {
    const len = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az), n = Math.ceil(len / 0.8);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const plank = (t0, t1, y) => { const tm = (t0 + t1) / 2; P.add('timber', box(0.05, 0.2, t1 - t0, ax + ux * tm, y, az + uz * tm, 0, h, 0), { tint: tints[(rnd() * 4) | 0] }); };
    for (let y = 0.12; y < H; y += 0.22) {
      let t = 0;
      for (const [t0, t1, top] of holes) if (y < top) { if (t0 > t) plank(t, t0, y); t = t1; }
      if (t < len) plank(t, len, y);
    }
    for (let i = 0; i <= n; i++) {
      const k = i / n, tt = k * len;
      if (holes.some(([t0, t1]) => tt > t0 - 0.1 && tt < t1 + 0.1)) continue;
      P.add('timber', yTube(-0.1, H + 0.1, 0.07, 0.07, 7, ax + ux * tt, az + uz * tt), { tint: 0xb0a690 });
    }
  };
  const gap = 0.6; // half width of the steps' opening in the rear wall
  const DOOR = { z0: 0.45, z1: 1.35, h: 1.35 }, NICHE = { z0: -1.9, z1: -0.9, h: 1.2, d: 0.75 };
  wall(-X, Z0, X, Z0); // front
  wall(-X, Z0, -X, Z1, [[DOOR.z0 - Z0, DOOR.z1 - Z0, DOOR.h + 0.18]]); // left, the dugout's door
  wall(X, Z0, X, Z1, [[NICHE.z0 - Z0, NICHE.z1 - Z0, NICHE.h + 0.12]]); // right, the bomb store
  wall(-X, Z1, -gap, Z1);
  wall(gap, Z1, X, Z1);
  // the spoil: banked up from the wall tops and down to the ground outside (front higher), its ends carried out past
  // the corners (e0, e1 metres) so the mound closes round them; d0 sets the inner face back from the wall line
  const bank = (ax, az, bx, bz, nx, nz, hh, out, e0 = 0, e1 = 0, d0 = 0) => {
    const len0 = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len0, uz = (bz - az) / len0, len = len0 + e0 + e1, tm = (len0 + e1 - e0) / 2;
    const pts = [[d0, H - 0.02], [d0 + 0.35, hh], [d0 + 0.8, hh + 0.05], [d0 + out, -0.05], [d0, -0.05]];
    // the profile (outward distance, height) runs along +Z and is extruded across X; turned so +Z is the outward normal
    const g = sideProfile(pts, len).rotateY(Math.atan2(nx, nz)).translate(ax + ux * tm + nx * 0.03, 0, az + uz * tm + nz * 0.03);
    P.add('soil', g, { tint: [0xffffff, 0xe8e0d0, 0xd8d0c0][(rnd() * 3) | 0] });
  };
  bank(-X, Z0, X, Z0, 0, -1, H + 0.35, 3.0, 2.4, 2.4);
  bank(-X, Z0, -X, Z1, -1, 0, H + 0.15, 2.4, 0, 2.2);
  bank(X, Z1, X, NICHE.z1, 1, 0, H + 0.15, 2.4, 2.2, 0);
  bank(X, NICHE.z0, X, Z0, 1, 0, H + 0.15, 2.4);
  bank(X, NICHE.z1, X, NICHE.z0, 1, 0, H + 0.15, 2.4, 0, 0, NICHE.d + 0.03); // behind the store
  P.add('soil', box(NICHE.d + 0.06, H + 0.1 - NICHE.h - 0.12, NICHE.z1 - NICHE.z0, X + NICHE.d / 2, (H + 0.1 + NICHE.h + 0.12) / 2, (NICHE.z0 + NICHE.z1) / 2)); // over its roof
  bank(gap, Z1, X, Z1, 0, 1, H + 0.1, 2.2, 0, 2.4);
  bank(-X, Z1, -gap, Z1, 0, 1, H + 0.1, 2.2, 2.4, 0);
  const bags = (ax, az, bx, bz, y) => {
    const len = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az), n = Math.floor(len / 0.5);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      P.add('cloth', rbox(0.34, 0.2, 0.5, 0.07, ax + (bx - ax) * k + j(0.04), y, az + (bz - az) * k + j(0.04), 0, h + j(0.15), 0), { tint: 0xc8b890 });
    }
  };
  bags(-X - 0.3, Z0 - 0.3, X + 0.3, Z0 - 0.3, H + 0.1);
  bags(-X - 0.3, Z0 - 0.3, -X - 0.3, Z1, H + 0.1);
  bags(X + 0.3, Z0 - 0.3, X + 0.3, Z1, H + 0.1);
  // the duckboard floor round the bed (slats on bearers), the bed itself sits on the trodden floor
  for (let z = Z0 + 0.15; z < Z1 - 0.1; z += 0.16) for (const [x0, x1] of [[-X + 0.08, -0.95], [0.95, X - 0.08]]) P.add('timber', box(x1 - x0, 0.03, 0.12, (x0 + x1) / 2, 0.015, z + j(0.02)), { tint: tints[(rnd() * 4) | 0] });
  for (const [z0, z1] of [[Z0 + 0.08, -0.95], [0.95, Z1 - 0.08]]) for (let x = -0.9; x < 0.95; x += 0.16) P.add('timber', box(0.12, 0.03, z1 - z0, x + j(0.02), 0.015, (z0 + z1) / 2), { tint: tints[(rnd() * 4) | 0] });
  // the steps up out of the rear into the trench behind, and the trench's first metres
  for (let i = 0; i < 5; i++) {
    const y = (i + 1) * (H / 5.5), z = Z1 + 0.12 + i * 0.32;
    P.add('timber', box(gap * 2, 0.06, 0.32, 0, y - 0.03, z), { tint: 0xc8bea8 });
    P.add('soil', box(gap * 2, y - 0.06, 0.32, 0, (y - 0.06) / 2, z));
  }
  for (const s of [-1, 1]) for (let y = 0.12; y < H; y += 0.22) P.add('timber', box(0.05, 0.2, 1.7, s * (gap + 0.03), y, Z1 + 0.85), { tint: tints[(rnd() * 4) | 0] });
  // the dugout's entrance in the left wall: a heavy frame, a black opening, steps going down into it
  {
    const zc = (DOOR.z0 + DOOR.z1) / 2, w = (DOOR.z1 - DOOR.z0) / 2, hh = DOOR.h, x = -X;
    P.add('dark', box(0.02, hh, w * 2, x + 0.04, hh / 2, zc), { tint: 0x202020 });
    P.add('timber', box(0.2, 0.18, w * 2 + 0.4, x + 0.06, hh + 0.09, zc), { tint: 0xa89c86 });
    for (const s of [-1, 1]) P.add('timber', box(0.2, hh, 0.18, x + 0.06, hh / 2, zc + s * (w + 0.09)), { tint: 0xa89c86 });
    for (let i = 0; i < 3; i++) P.add('timber', box(0.06, 0.04, w * 2, x + 0.08 - i * 0.02, 0.05 + i * 0.001, zc), { tint: 0x8a806c });
    P.add('cloth', box(0.02, hh * 0.7, w * 1.4, x + 0.06, hh * 0.62, zc - w * 0.28), { tint: 0x8a8068 }); // the gas curtain, half drawn
  }
  // the bomb store: a niche in the right wall with a plank roof, four bombs standing in it, a shelf with two more
  {
    const { z0, z1, d, h: hh } = NICHE, x = X;
    P.add('timber', box(0.05, hh, z1 - z0, x + d, hh / 2, (z0 + z1) / 2), { tint: 0x8a806c });
    for (const s of [z0, z1]) P.add('timber', box(d, hh, 0.06, x + d / 2, hh / 2, s), { tint: 0xb4aa94 });
    P.add('timber', box(d + 0.1, 0.12, z1 - z0 + 0.2, x + d / 2, hh + 0.06, (z0 + z1) / 2), { tint: 0xa89c86 });
    P.add('timber', box(d - 0.1, 0.04, z1 - z0 - 0.1, x + d / 2 + 0.05, 0.95, (z0 + z1) / 2), { tint: 0xc0b49c }); // the shelf
    const bomb = bombGeo();
    for (const [bx, by, bz, lie] of [[x + 0.25, 0, z0 + 0.22, 0], [x + 0.25, 0, z0 + 0.52, 0], [x + 0.52, 0, z0 + 0.3, 0], [x + 0.5, 0, z0 + 0.62, 0], [x + 0.4, 0.97 + 0.123, (z0 + z1) / 2 - 0.2, 1], [x + 0.4, 0.97 + 0.123, (z0 + z1) / 2 + 0.1, 1]]) {
      const m = new THREE.Matrix4().makeRotationX(lie ? 0 : -Math.PI / 2).setPosition(bx, lie ? by : 0.38, bz);
      for (const [key, g] of bomb) P.add(key, g.clone().applyMatrix4(m), { tint: key === 'shell' ? 0x8c928a : 0xffffff });
    }
  }
  // the charge box by the charger's place (right of the muzzle), its lid open; two more stacked
  P.add('timber', box(0.5, 0.3, 0.36, 1.85, 0.15, -0.3), { tint: 0xb8a988 });
  P.add('timber', box(0.5, 0.03, 0.36, 1.85, 0.42, -0.06, -1.1), { tint: 0xb8a988 });
  for (const [xx, zz] of [[1.75, -0.13], [1.92, -0.13]]) P.add('cloth', zTube(-0.08, 0.08, 0.09, 0.09, 12, xx, 0.3, zz - 0.17), { tint: 0xd8cca0 });
  P.add('timber', box(0.5, 0.3, 0.36, 2.15, 0.15, 0.25), { tint: 0xa89a7a });
  P.add('timber', box(0.5, 0.3, 0.36, 2.15, 0.45, 0.25), { tint: 0xb8a988 });
  // the wheels and their axle, taken off for firing: leaning against the left wall at the front
  for (const [zc, tilt] of [[-1.45, 0.2], [-0.75, 0.24]]) {
    const W = new Parts(mats), R = 0.48;
    W.add('dark', ring(R - 0.03, R, -0.04, 0.04, 36));
    W.add('timber', ring(R - 0.09, R - 0.03, -0.035, 0.035, 32), { tint: 0xb0a088 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; W.add('timber', rod(V(0, Math.cos(a) * 0.08, Math.sin(a) * 0.08), V(0, Math.cos(a) * (R - 0.08), Math.sin(a) * (R - 0.08)), 0.02, 5), { tint: 0xb0a088 }); }
    W.add('dark', xTube(-0.1, 0.1, 0.08, 0.07, 14));
    const g = new THREE.Group();
    W.build(g, { dirt: 0.5 });
    g.position.set(-X + 0.12 + tilt * R, R * Math.cos(tilt), zc);
    g.rotation.z = -tilt;
    root.add(g);
  }
  P.add('steel', rod(V(-X + 0.12, 0.05, 0.1), V(-X + 0.3, 1.2, 0.0), 0.04, 8)); // the axle stood up beside them
  P.build(root, { dirt: 0.3 });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root };
}

// a bomb standing for the store (nose to -Z of its frame), as [material key, geometry] pairs
function bombGeo() {
  const L = 0.76, R = 0.123, h = L / 2;
  // models/shells.js smw's profile (s from the base to the nose), listed nose first along z (the nose to -Z)
  const prof = [[0, 0.0001], [0, R * 0.92], [0.02, R], [0.5, R], [0.58, R * 0.92], [0.66, R * 0.7], [0.71, R * 0.42], [0.73, 0.03], [L, 0.0001]];
  const body = zLathe(prof.slice().reverse().map(([s, r]) => [h - s, r]), 16);
  const band = zTube(h - 0.27, h - 0.25, R + 0.003, R + 0.003, 16);
  return [['shell', body], ['brass', band]];
}

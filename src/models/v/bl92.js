import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, shellGeometry, Parts, DEG } from '../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun } from '../rig.js';
import { pivotAt, hb, trayMount, floorFade } from '../rig.js';
import { mulberry32 } from '../../noise.js';

// BL 9.2-inch howitzer Mk I on the siege carriage ("Mother"), the gun at Ypres in 1917: a short barrel
// (10 ft 1 in, 3.07 m) in a cylindrical cradle with the buffer and recuperator cylinders strapped
// alongside, their piston rods pulled out rearwards by a lug on the breech ring. A wedge-shaped riveted
// body (two cheeks) on a timber bed edged with steel girders, a big elevating handwheel on the left and
// the quick-loading wheel on the right, a planked loading platform behind with the loading tray on its
// arm, and the steel earth box (9 tons of ballast) fixed to the front of the bed: the gun traverses over
// it. Frames as bl15: `traverse` on the bed, `elevation` at the trunnions (barrel z -1.55 to +1.5),
// `recoil`, `breech` (carrier hinged on the right, 1.65 rad), `tray` hinged behind the breech.
// loadEl is the handbook's 3 degrees of depression; recoil 1.0 m (40 in), cut by floorFade to about
// 0.45 m at 50 degrees (the real gun shortened it to 23 in).

const BH = 0.4; // top of the firing bed
const LOADING_FLOOR = 1.55; // waist-high access to the tray, with a supported ramp from the shell store
const TY = 2.1; // trunnion height above the bed (the breech tail clears the floor plate at 50 degrees)
const MUZ = -1.55, BRE = 1.5;
const HX = 0.45;
const SHELL = { len: 0.95, rad: 0.117 };

function cheekOutline() {
  return [[-1.1, 0], [-1.1, 0.9], [-0.7, 1.55], [-0.45, TY + 0.4], [-0.2, TY + 0.46], [0.4, TY + 0.46], [0.7, TY + 0.3], [1.1, 1.4], [1.7, 0.95], [2.1, 0.7], [2.1, 0]];
}
function topAt(poly, z) {
  let b = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    if ((a[0] - z) * (c[0] - z) <= 0 && a[0] !== c[0]) b = Math.max(b, a[1] + ((c[1] - a[1]) * (z - a[0])) / (c[0] - a[0]));
  }
  return b;
}

export function buildBL92() {
  const rig = newGunRig('bl92', 'earth');
  const root = rig.root, rnd = mulberry32(92);
  const mk = () => new Parts(rig.mats);
  const PL = mk(), PT = mk(), PE = mk(), PR = mk(), PB = mk(), PTR = mk();
  const trav = pivotAt(rig, root, 'traverse', 0, BH, 0);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, 0);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', HX, 0, BRE + 0.03);
  rig.recoilLength = 1.0;
  rig.loadEl = -0.05;
  // the tray's hinge stays where it was for the longer Mk II (BRE + 0.35): the shell lies at the same place on
  // the platform, so the carriers' and rammers' routes keep their room; the trough reaches 0.25 m further forward
  const tray = trayMount(rig, trav, elev, -0.19, BRE + 0.35, 0.19, 1.2, 1.5);
  floorFade(rig, TY, BRE + 0.3, 0.42, 0.1); // tail: the carrier face, ring radius; floor plate 0.06 high
  rig.breechOpen = { axis: 'y', angle: 1.65 };
  const outline = cheekOutline();

  // ---- the firing bed: timber beams, planking round the gun, earth heaped at the sides
  for (let i = 0; i < 26; i++) PL.add('timber', box(3.9 + (rnd() - 0.5) * 0.1, 0.2, 0.3, 0, 0.1, -4.44 + i * 0.32, 0, (rnd() - 0.5) * 0.01));
  for (let i = 1; i < 12; i++) PL.add('timber', box(0.29, 0.2, 8.3, -1.9 + i * 0.318, 0.3, -0.4, 0, 0, 0), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
  // steel girders round the bed (side members and end transoms), dark against the timber
  for (const s of [-1, 1]) {
    PL.add('dark', box(0.08, 0.25, 8.4, s * 2.0, 0.28, -0.4));
    PL.add('dark', box(0.22, 0.03, 8.4, s * 1.94, 0.415, -0.4));
    PL.add('dark', rivetRow(V(s * 2.045, 0.3, -4.5), V(s * 2.045, 0.3, 3.7), 0.3, V(s, 0, 0), 0.02));
  }
  for (const z of [-4.6, 3.8]) PL.add('dark', box(4.08, 0.25, 0.08, 0, 0.28, z));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) PL.add('soil', sphere(0.6, s * (2.3 + rnd() * 0.5), 0.1, -2.5 + k * 2.4, 1.0, 0.35, 1.5, 7));
  }
  PL.add('timber', box(2.2, 0.08, 2.4, 0, 0.18, 4.9, 0.15)); // ramp-planks at the rear
  for (let i = 0; i < 5; i++) PL.add('timber', box(0.4, 0.05, 2.4, -0.9 + i * 0.45, 0.22, 4.9, 0.15), { tint: 0xe6dccb });
  // a stack of nose-up shells on planks and a cordite case beside the pit, as in the LOC photograph
  const sh = shellGeometry(SHELL.len, SHELL.rad);
  const SX = -5.6, SZ = 1.8;
  PL.add('timber', box(1.6, 0.08, 1.4, SX, 0.04, SZ));
  for (let i = 0; i < 6; i++) {
    const x = SX - 0.5 + (i % 3) * 0.5, z = SZ - 0.3 + Math.floor(i / 3) * 0.55;
    for (const [g, k] of [[sh.body, 'shell'], [sh.band, 'brass'], [sh.fuze, 'steel']]) PL.add(k, g.clone().rotateX(-Math.PI / 2).translate(x, 0.08 + SHELL.len / 2, z));
  }
  PL.add('rust', new THREE.CylinderGeometry(0.17, 0.17, 0.8, 12).translate(SX - 0.5, 0.45, SZ - 0.6));
  rig.anchors.shellStack = new THREE.Object3D();
  rig.anchors.shellStack.position.set(SX - 0.1, 0.15, SZ + 1.2); // beside the standing rounds, where a shell can lie
  root.add(rig.anchors.shellStack);

  // ---- body on the bed
  for (const s of [-1, 1]) {
    PT.add('camo', sideProfile(outline, 0.18, 0.01).translate(s * 0.68, 0, 0));
    const x = s * 0.78;
    PT.add('dark', rivetPoly(outline, (z, y) => V(x, y, z), 0.08, 0.17, V(s, 0, 0), 0.024));
    for (const z of [-0.9, -0.5, 0.6, 1.2, 1.7]) { // none at the trunnion
      const top = topAt(outline, z) - 0.1;
      if (top > 0.4) PT.add('camo', box(0.07, top - 0.1, 0.09, s * 0.82, 0.1 + (top - 0.1) / 2, z));
    }
    PT.add('camo', rbox(0.3, 0.26, 1.1, 0.06, s * 0.73, TY + 0.58, 0)); // bearing cap, its inner edge clear of the cradle
    PT.add('chain', new THREE.TorusGeometry(0.1, 0.022, 6, 12).rotateY(Math.PI / 2).translate(s * 0.8, 1.5, -0.9));
  }
  PT.add('camo', box(1.45, 0.06, 4.3, 0, 0.03, 0.5)); // floor plate between the cheeks, thin: the breech tail sweeps low over it
  PT.add('camo', box(1.45, 0.16, 0.3, 0, 0.08, 1.95)); // rear cross-girder, low so the breech tail passes over it
  PT.add('camo', box(1.45, 0.3, 0.26, 0, 0.2, -0.95)); // front tie, low: the elevating arc swings through the height it used to stand at
  PT.add('dark', rivetRow(V(-0.65, 0.4, 2.11), V(0.65, 0.4, 2.11), 0.16, V(0, 0, 1), 0.022));
  // Raised loading stage on braced posts. Its deck is the crew's actual support plane:
  // the 130 kg round reaches the tray on a trolley through the broad left loading ramp.
  const deckY = LOADING_FLOOR - BH, deckZ0 = 1.7, deckZ1 = 5.65, halfDeck = 1.5;
  for (let z = deckZ0 + 0.15; z < deckZ1; z += 0.3) PT.add('timber', box(halfDeck * 2, 0.09, 0.285, 0, deckY - 0.045, z));
  for (const x of [-1.3, 1.3]) {
    PT.add('dark', box(0.12, 0.18, deckZ1 - deckZ0, x, deckY - 0.18, (deckZ0 + deckZ1) / 2));
    for (const z of [2.15, 3.7, 5.2]) {
      PT.add('dark', box(0.13, LOADING_FLOOR - 0.15, 0.13, x, (LOADING_FLOOR - 0.15) / 2 - BH, z));
      PT.add('dark', box(0.35, 0.08, 0.35, x, 0.04 - BH, z));
    }
    for (const [z0, z1] of [[2.15, 3.7], [3.7, 5.2]]) {
      PT.add('camo', rod(V(x, 0.14 - BH, z0), V(x, deckY - 0.2, z1), 0.045, 6));
      PT.add('camo', rod(V(x, 0.14 - BH, z1), V(x, deckY - 0.2, z0), 0.045, 6));
    }
  }
  // Continuous planks keep the trolley wheels supported; battens give the crew purchase.
  const rampX0 = -5.55, rampX1 = -1.5, rampZ = 3.2, rampWidth = 2.1;
  const rampRise = LOADING_FLOOR, rampRun = rampX1 - rampX0, rampAngle = Math.atan2(rampRise, rampRun);
  const rampLength = Math.hypot(rampRun, rampRise), rampMidX = (rampX0 + rampX1) / 2;
  PT.add('timber', box(rampLength, 0.09, rampWidth, rampMidX, rampRise / 2 - BH - 0.045, rampZ, 0, 0, rampAngle));
  for (const z of [rampZ - 0.8, rampZ + 0.8]) PT.add('dark', rod(V(rampX0, -BH - 0.02, z), V(rampX1, deckY - 0.16, z), 0.065, 8));
  for (let i = 1; i < 12; i++) {
    const k = i / 12, x = rampX0 + rampRun * k, y = rampRise * k - BH;
    // Battens stop short of the two wheel tracks.
    for (const z of [rampZ - 0.78, rampZ + 0.78]) PT.add('timber', box(0.045, 0.025, 0.42, x, y + 0.01, z, 0, 0, rampAngle));
  }
  for (const x of [-4.1, -2.7]) {
    const y = rampRise * (x - rampX0) / rampRun;
    for (const z of [rampZ - 0.8, rampZ + 0.8]) PT.add('dark', box(0.1, Math.max(0.05, y - 0.15), 0.1, x, (y - 0.15) / 2 - BH, z));
  }
  rig.loadingStage = {
    floor: LOADING_FLOOR, crewSide: 0.63, crewSpacing: 0.32,
    pickup: { x: rampX0 + 0.25, z: rampZ }, rampTop: { x: -0.7, z: rampZ },
    floorAt(x, z) {
      if (x >= -halfDeck && x <= halfDeck && z >= deckZ0 && z <= deckZ1) return LOADING_FLOOR;
      if (x >= rampX0 && x <= rampX1 && Math.abs(z - rampZ) <= rampWidth / 2) return rampRise * (x - rampX0) / rampRun;
      return 0;
    },
  };
  // the elevating wheel (left), the quick-loading wheel (right), the traversing wheel behind it
  PT.add('iron', handwheel(0.5, 8, 0.028, 0.07).translate(-1.0, 0.95, 0.5));
  PT.add('steel', xTube(-1.05, -0.4, 0.045, 0.045, 8, 0.95, 0.5));
  PT.add('dark', box(0.22, 0.3, 0.34, -0.85, 0.95, 0.5));
  PT.add('iron', handwheel(0.3, 6, 0.022, 0.05).translate(1.0, 0.8, 0.9));
  PT.add('dark', box(0.2, 0.26, 0.3, 0.85, 0.8, 0.9));
  PT.add('iron', handwheel(0.3, 6, 0.022, 0.05).translate(-1.0, 0.45, 1.6));
  // the earth box across the front of the bed: a steel tank with stanchions, full of earth. It is part
  // of the bed (root), so the gun swings over it; the muzzle never reaches it, even at 15 degrees.
  const EB = { w: 3.6, h: 1.25, z0: -4.2, z1: -2.0 }, y0 = BH;
  const ez = (EB.z0 + EB.z1) / 2;
  PL.add('camo', rbox(EB.w, EB.h, EB.z1 - EB.z0, 0.03, 0, y0 + EB.h / 2, ez));
  for (const s of [-1, 1]) for (const z of [EB.z0, EB.z1]) PL.add('camo', box(0.1, EB.h + 0.2, 0.1, s * (EB.w / 2 - 0.02), y0 + EB.h / 2 + 0.1, z));
  for (const z of [EB.z0 - 0.02, EB.z1 + 0.02]) {
    const d = Math.sign(z - ez);
    for (const yy of [0.3, 0.75, 1.15]) PL.add('dark', rivetRow(V(-1.65, y0 + yy, z + d * 0.02), V(1.65, y0 + yy, z + d * 0.02), 0.18, V(0, 0, d), 0.026));
    for (const xx of [-1.2, -0.4, 0.4, 1.2]) PL.add('camo', box(0.07, EB.h - 0.1, 0.04, xx, y0 + EB.h / 2, z));
  }
  for (const s of [-1, 1]) for (const yy of [0.3, 0.75, 1.15]) PL.add('dark', rivetRow(V(s * (EB.w / 2 + 0.02), y0 + yy, EB.z0 + 0.1), V(s * (EB.w / 2 + 0.02), y0 + yy, EB.z1 - 0.1), 0.18, V(s, 0, 0), 0.026));
  PL.add('soil', box(EB.w - 0.2, 0.16, EB.z1 - EB.z0 - 0.2, 0, y0 + EB.h + 0.02, ez));
  for (let i = 0; i < 12; i++) PL.add('soil', sphere(0.2 + rnd() * 0.22, (rnd() - 0.5) * (EB.w - 0.6), y0 + EB.h + 0.04, EB.z0 + 0.3 + rnd() * (EB.z1 - EB.z0 - 0.6), 1.2, 0.3, 1.1, 7));
  // the front pivot transom the body's nose rides on, between the cheeks and the box
  PL.add('dark', box(1.9, 0.1, 0.5, 0, y0 + 0.05, -1.55));
  PL.add('dark', rivetRow(V(-0.85, y0 + 0.1, -1.4), V(0.85, y0 + 0.1, -1.4), 0.17, V(0, 1, 0), 0.02));

  // ---- cradle, cylinders, arc, sight
  // the cylindrical cradle (narrow enough to turn under the bearing caps) with a round collar at each end
  PE.add('camo', zTube(-1.0, 0.85, 0.45, 0.45, 28));
  for (const z of [-0.95, 0.75]) PE.add('camo', zTube(z - 0.05, z + 0.05, 0.5, 0.5, 28));
  for (const [z, d] of [[-1.0, -1], [0.8, 1]]) PE.add('dark', rivets(Array.from({ length: 12 }, (_, i) => V(Math.cos(i * Math.PI / 6) * 0.475, Math.sin(i * Math.PI / 6) * 0.475, z)), V(0, 0, d), 0.02));
  for (const s of [-1, 1]) PE.add('steel', xTube(s * 0.4, s * 0.57, 0.2, 0.2, 14));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.55, s * 0.88, 0.3, 0.3, 18));
    PE.add('steel', xTube(s * 0.88, s * 0.94, 0.24, 0.24, 18));
    PE.add('dark', rivets(Array.from({ length: 8 }, (_, i) => V(s * 0.95, Math.sin(i * Math.PI / 4) * 0.18, Math.cos(i * Math.PI / 4) * 0.18)), V(s, 0, 0), 0.03));
  }
  const tubes = [[-0.34, 0.66, 0.095], [0.34, 0.66, 0.095], [0, -0.64, 0.085]];
  rig.nest = tubes.map(([x, y]) => [x, y]); // cylinder axes the piston rods slide into (used by the clip check)
  for (const [x, y, r] of tubes) {
    PE.add('camo', zTube(-0.95, 0.95, r, r, 14, x, y));
    PE.add('steel', zTube(-1.01, -0.91, r * 1.12, r * 1.12, 14, x, y));
    PE.add('camo', sphere(r * 1.05, x, y, 0.95, 1, 1, 0.8, 9));
    for (const z of [-0.45, 0.25]) PE.add('steel', zTube(z - 0.035, z + 0.035, r * 1.15, r * 1.15, 12, x, y));
    for (const z of [-0.7, 0.4]) PE.add('camo', y > 0 ? box(0.14, 0.34, 0.2, x, 0.44, z) : box(0.14, 0.2, 0.2, x, -0.5, z)); // straps down onto the cradle
  }
  PE.add('steel', gearArc(1.45, 1.58, 22 * DEG, 74 * DEG, 0.22, 22, 0.04));
  PE.add('camo', gearArc(1.05, 1.45, 22 * DEG, 74 * DEG, 0.16));
  PE.add('camo', box(0.3, 0.2, 0.9, 0, -0.6, 0.5));
  // the sight bracket and dial sight on the left
  PE.add('camo', box(0.1, 0.5, 0.7, -1.0, 0.42, 0.1)); // outside the left cheek, so it sweeps clear of it
  PE.add('camo', box(0.4, 0.07, 0.5, -1.12, 0.78, 0.1));
  PE.add('brass', yTube(0.8, 1.12, 0.055, 0.055, 10, -1.1, 0.1));
  PE.add('dark', zTube(-0.35, 0.1, 0.03, 0.026, 8, -1.1, 1.06));
  PE.add('brass', box(0.2, 0.012, 0.22, 0, 0.452, -0.5));
  PE.add('white', box(0.26, 0.02, 0.3, 0.0, 0.45, 0.35)); // the white name panel ("Persuader")

  // ---- barrel: a short chase with a muzzle swell, a stepped jacket and the breech ring
  const prof = [[MUZ, 0.13], [MUZ, 0.27], [MUZ + 0.05, 0.295], [MUZ + 0.2, 0.295], [MUZ + 0.25, 0.27], [-1.0, 0.285], [-0.65, 0.32], [-0.62, 0.36], [1.1, 0.36], [1.13, 0.4], [BRE - 0.04, 0.4], [BRE, 0.37], [BRE, 0.2], [BRE - 0.005, 0]];
  PR.add('iron', zLathe(prof, 32), { tint: 0x838a80 });
  for (const z of [-0.62, 0.25]) PR.add('iron', zTube(z - 0.03, z + 0.03, 0.375, 0.375, 32), { tint: 0x9a9f94 });
  PR.add('iron', zTube(MUZ + 0.25 - 0.025, MUZ + 0.25 + 0.025, 0.31, 0.31, 24), { tint: 0x9a9f94 });
  PR.add('iron', zTube(MUZ - 0.002, MUZ + 0.2, 0.12, 0.12, 16), { tint: 0x202020 }); // the bore: barrel steel, so it may slide into the cradle
  // the piston-rod lug on the breech ring: the rods slide out of the cylinders' rear ends as it recoils
  for (const [x, y] of tubes) {
    PR.add('camo', rod(V(x * 0.4, Math.sign(y) * 0.34, 1.17), V(x, y, 1.17), 0.05, 8));
    PR.add('camo', zTube(1.12, 1.22, 0.075, 0.075, 10, x, y));
    PR.add('steel', zTube(1.12, -0.3, 0.035, 0.035, 8, x, y));
  }
  PR.add('steel', zTube(BRE - 0.01, BRE + 0.015, 0.37, 0.37, 28), { tint: 0xb0b0a8 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; PR.add('steel', box(0.06, 0.09, 0.05, Math.cos(a) * 0.27, Math.sin(a) * 0.27, BRE + 0.02, 0, 0, a + Math.PI / 2)); }
  PR.add('dark', zTube(BRE + 0.01, BRE + 0.03, 0.12, 0.12, 16));
  PR.add('steel', rbox(0.16, 0.14, 0.24, 0.03, 0, 0.45, BRE - 0.18));
  PR.add('brass', yTube(0.5, 0.64, 0.03, 0.04, 8, 0, BRE - 0.18));
  PR.add('camo', rbox(0.14, 0.64, 0.2, 0.03, HX, 0, BRE - 0.16)); // hinge lug, ends short of the swinging block

  // ---- breech carrier
  PB.add('steel', yTube(-0.34, 0.34, 0.055, 0.055, 10, 0, 0.1));
  PB.add('camo', rbox(0.62, 0.36, 0.24, 0.04, -0.29, 0, 0.12));
  PB.add('camo', zTube(0.0, 0.24, 0.36, 0.36, 30, -HX, 0));
  PB.add('steel', zTube(0.24, 0.27, 0.13, 0.13, 16, -HX, 0));
  PB.add('iron', xTube(-HX - 0.24, -HX + 0.24, 0.024, 0.024, 8, 0, 0.36));
  for (const s of [-1, 1]) PB.add('iron', sphere(0.04, -HX + s * 0.24, 0, 0.36, 1, 1, 1, 8));
  PB.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(-HX + Math.cos(i / 10 * 6.283) * 0.29, Math.sin(i / 10 * 6.283) * 0.29, 0.24)), V(0, 0, 1), 0.025));
  PB.add('steel', rbox(0.14, 0.16, 0.18, 0.03, -HX, 0.27, 0.32));

  // ---- loading tray (steel trough on its arm)
  PTR.add('camo', box(0.7, 0.05, 2.15, 0, 0, 0.925));
  for (const s of [-1, 1]) {
    PTR.add('camo', box(0.05, 0.17, 2.15, s * 0.35, 0.1, 0.925));
    PTR.add('dark', rivetRow(V(s * 0.38, 0.12, -0.05), V(s * 0.38, 0.12, 1.9), 0.18, V(s, 0, 0), 0.018));
  }
  PTR.add('camo', box(0.7, 0.06, 0.08, 0, -0.04, -0.05));
  PTR.add('camo', rod(V(-0.5, -0.1, 0.1), V(-0.25, -1.3, 0.6), 0.045, 6));
  PTR.add('camo', rod(V(-0.5, -0.1, 1.9), V(-0.25, -1.3, 0.7), 0.035, 6));
  PTR.add('iron', handwheel(0.22, 5, 0.018, 0.04).translate(-0.55, -0.35, 0.1));
  PTR.add('chain', chain(V(-0.35, 0.1, 1.9), V(-0.5, 0.45, 0.4), 0.15, 0.05));

  PL.build(root, { dirt: 0.3, y0: 0 });
  PT.build(trav, { dirt: 0.35, y0: BH });
  PE.build(elev, { dirt: 0.1, y0: BH + TY });
  PR.build(rec, { dirt: 0.05, y0: BH + TY });
  PB.build(brc, { dirt: 0.05, y0: BH + TY });
  PTR.build(tray, { dirt: 0.1, y0: BH + TY });

  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.19, 1.2);
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, trav, 'eye', 0, TY + 0.2, 0.2);
  rig.update = rig.trayTilt;
  rig.update();
  hb(rig, -2.1, 0, -4.6, 2.1, 3.0, 4.0);
  hb(rig, -1.0, 1.0, -1.7, 1.0, 3.4, 3.2);

  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI;
  crewSpot(rig, 'sergeant', -1.9, BH, 2.4, E, 'point');
  crewSpot(rig, 'layer', -1.5, BH, 0.5, E, 'lay');
  crewSpot(rig, 'elevator', 1.6, BH, 0.9, W, 'operate');
  crewSpot(rig, 'lanyard', 1.5, BH, 3.0, N, 'lanyard');
  crewSpot(rig, 'loader1', -0.75, LOADING_FLOOR, 2.8, E, 'carry');
  crewSpot(rig, 'loader2', -0.75, LOADING_FLOOR, 3.6, E, 'carry');
  crewSpot(rig, 'rammer1', -0.63, LOADING_FLOOR, 4.45, E, 'ram');
  crewSpot(rig, 'rammer2', -0.63, LOADING_FLOOR, 5.2, E, 'ram');
  crewSpot(rig, 'ammo1', SX + 0.9, 0, SZ - 0.9, W, 'stand');
  crewSpot(rig, 'ammo2', 1.05, LOADING_FLOOR, 3.9, W, 'carry');
  rig.anchors.crew.at(-1).world = false; // charge supply and man ride this loading stage
  return finishGun(rig);
}

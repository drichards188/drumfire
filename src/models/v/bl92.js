import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, shellGeometry, Parts, DEG } from '../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun } from '../rig.js';
import { pivotAt, hb, trayMount, floorFade } from '../rig.js';
import { mulberry32 } from '../../noise.js';

// BL 9.2-inch howitzer Mk II on the siege carriage ("Mother"), from refs/bl92in: a wedge-shaped riveted
// body (two cheeks) on a timber firing bed, the cradle with its two slim cylinders strapped alongside, a
// big elevating handwheel on the left and the quick-loading wheel on the right, a planked loading
// platform behind with the loading tray on its arm, and the steel earth box across the front, heaped
// with ballast. Frames as bl15: `traverse` on the bed, `elevation` at the trunnions (barrel z -2.7 to
// +1.75), `recoil`, `breech` (carrier hinged on the right, 1.65 rad), `tray` hinged behind the breech.
// loadEl is the handbook's 3 degrees of depression; recoil 1.0 m.

const BH = 0.4; // top of the firing bed
const TY = 2.2; // trunnion height above the bed (the breech tail clears the bed at 50 degrees)
const MUZ = -2.7, BRE = 1.75;
const HX = 0.5;
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
  const tray = trayMount(rig, trav, elev, -0.19, BRE + 0.1, 0.19, 1.2, 1.5);
  floorFade(rig, TY, BRE + 0.27, 0.5, 0.32);
  rig.breechOpen = { axis: 'y', angle: 1.65 };
  const outline = cheekOutline();

  // ---- the firing bed: timber beams, planking round the gun, earth heaped at the sides
  for (let i = 0; i < 24; i++) PL.add('timber', box(3.9 + (rnd() - 0.5) * 0.1, 0.2, 0.3, 0, 0.1, -3.8 + i * 0.32, 0, (rnd() - 0.5) * 0.01));
  for (let i = 0; i < 13; i++) PL.add('timber', box(0.29, 0.2, 7.4, -1.9 + i * 0.318, 0.3, 0.0, 0, 0, 0), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) PL.add('soil', sphere(0.6, s * (2.3 + rnd() * 0.5), 0.1, -2.5 + k * 2.4, 1.0, 0.35, 1.5, 7));
  }
  PL.add('timber', box(2.2, 0.08, 2.4, 0, 0.18, 4.9, 0.15)); // ramp-planks at the rear
  for (let i = 0; i < 5; i++) PL.add('timber', box(0.4, 0.05, 2.4, -0.9 + i * 0.45, 0.22, 4.9, 0.15), { tint: 0xe6dccb });
  // a stack of nose-up shells on planks and a cordite case beside the pit, as in the LOC photograph
  const sh = shellGeometry(SHELL.len, SHELL.rad);
  const SX = -3.3, SZ = 1.4;
  PL.add('timber', box(1.6, 0.08, 1.4, SX, 0.04, SZ));
  for (let i = 0; i < 6; i++) {
    const x = SX - 0.5 + (i % 3) * 0.5, z = SZ - 0.3 + Math.floor(i / 3) * 0.55;
    for (const [g, k] of [[sh.body, 'shell'], [sh.band, 'brass'], [sh.fuze, 'steel']]) PL.add(k, g.clone().rotateX(-Math.PI / 2).translate(x, 0.08 + SHELL.len / 2, z));
  }
  PL.add('rust', new THREE.CylinderGeometry(0.17, 0.17, 0.8, 12).translate(SX + 0.9, 0.45, SZ + 0.7));
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
  PT.add('camo', box(1.45, 0.12, 4.3, 0, 0.08, 0.5)); // floor between the cheeks
  PT.add('camo', box(1.45, 0.16, 0.3, 0, 0.2, 1.95)); // rear cross-girder, low so the breech tail passes over it
  PT.add('camo', box(1.45, 0.3, 0.26, 0, 0.2, -0.95)); // front tie, low: the elevating arc swings through the height it used to stand at
  PT.add('dark', rivetRow(V(-0.65, 0.4, 2.11), V(0.65, 0.4, 2.11), 0.16, V(0, 0, 1), 0.022));
  // rear loading platform: planks on steel brackets, with a footrail
  // (it starts behind the breech tail's sweep at high elevation)
  for (let i = 0; i < 4; i++) PT.add('timber', box(1.9, 0.05, 0.28, 0, 0.62, 2.8 + i * 0.3));
  for (const x of [-0.8, 0.8]) PT.add('camo', rod(V(x, 0.6, 3.0), V(x, 0.1, 3.0), 0.04, 6));
  for (const x of [-0.95, 0.95]) PT.add('dark', rod(V(x, 0.64, 3.8), V(x, 1.2, 3.8), 0.02, 5));
  // the elevating wheel (left), the quick-loading wheel (right), the traversing wheel behind it
  PT.add('iron', handwheel(0.5, 8, 0.028, 0.07).translate(-1.0, 0.95, 0.5));
  PT.add('steel', xTube(-1.05, -0.4, 0.045, 0.045, 8, 0.95, 0.5));
  PT.add('dark', box(0.22, 0.3, 0.34, -0.85, 0.95, 0.5));
  PT.add('iron', handwheel(0.3, 6, 0.022, 0.05).translate(1.0, 0.8, 0.9));
  PT.add('dark', box(0.2, 0.26, 0.3, 0.85, 0.8, 0.9));
  PT.add('iron', handwheel(0.3, 6, 0.022, 0.05).translate(-1.0, 0.45, 1.6));
  // the earth box across the front: a steel tank with stanchions, full of earth
  const EB = { w: 2.9, h: 1.1, z0: -4.0, z1: -2.2 }; // the muzzle at loading depression passes over the heap
  const ez = (EB.z0 + EB.z1) / 2;
  PT.add('camo', rbox(EB.w, EB.h, EB.z1 - EB.z0, 0.03, 0, EB.h / 2, ez));
  for (const s of [-1, 1]) for (const z of [EB.z0, EB.z1]) PT.add('camo', box(0.1, EB.h + 0.2, 0.1, s * (EB.w / 2 - 0.02), EB.h / 2 + 0.1, z));
  {
    const z = EB.z0 - 0.02;
    for (const yy of [0.3, 0.7, 1.1]) PT.add('dark', rivetRow(V(-1.3, yy, z - 0.02), V(1.3, yy, z - 0.02), 0.18, V(0, 0, -1), 0.026));
    for (const xx of [-0.9, -0.3, 0.3, 0.9]) PT.add('camo', box(0.07, EB.h - 0.1, 0.04, xx, EB.h / 2, z));
  }
  for (const s of [-1, 1]) for (const yy of [0.3, 0.7, 1.1]) PT.add('dark', rivetRow(V(s * (EB.w / 2 + 0.02), yy, EB.z0 + 0.1), V(s * (EB.w / 2 + 0.02), yy, EB.z1 - 0.1), 0.18, V(s, 0, 0), 0.026));
  PT.add('soil', box(EB.w - 0.2, 0.16, EB.z1 - EB.z0 - 0.2, 0, EB.h + 0.02, ez));
  for (let i = 0; i < 10; i++) PT.add('soil', sphere(0.2 + rnd() * 0.2, (rnd() - 0.5) * (EB.w - 0.6), EB.h + 0.04, EB.z0 + 0.3 + rnd() * (EB.z1 - EB.z0 - 0.6), 1.2, 0.3, 1.1, 7));
  for (const s of [-1, 1]) PT.add('camo', rod(V(s * 0.8, 0.9, -1.1), V(s * 1.0, 0.5, -2.2), 0.055, 6)); // struts to the box

  // ---- cradle, cylinders, arc, sight
  PE.add('camo', rbox(1.08, 0.88, 2.3, 0.2, 0, 0, -0.2)); // low enough to turn under the bearing caps
  for (const z of [-1.3, 0.9]) PE.add('steel', rbox(1.14, 1.06, 0.08, 0.04, 0, 0, z));
  PE.add('steel', xTube(-1.0, 1.0, 0.2, 0.2, 14));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.55, s * 0.88, 0.3, 0.3, 18));
    PE.add('steel', xTube(s * 0.88, s * 0.94, 0.24, 0.24, 18));
    PE.add('dark', rivets(Array.from({ length: 8 }, (_, i) => V(s * 0.95, Math.sin(i * Math.PI / 4) * 0.18, Math.cos(i * Math.PI / 4) * 0.18)), V(s, 0, 0), 0.03));
  }
  const tubes = [[-0.34, 0.66, 0.095], [0.34, 0.66, 0.095], [0, -0.64, 0.085]];
  rig.nest = tubes.map(([x, y]) => [x, y]); // cylinder axes the piston rods slide into (used by the clip check)
  for (const [x, y, r] of tubes) {
    PE.add('camo', zTube(-1.1, 1.2, r, r, 14, x, y));
    PE.add('steel', zTube(-1.16, -1.05, r * 1.12, r * 1.12, 14, x, y));
    PE.add('camo', sphere(r * 1.05, x, y, 1.2, 1, 1, 0.8, 9));
    for (const z of [-0.5, 0.2, 0.8]) PE.add('steel', zTube(z - 0.035, z + 0.035, r * 1.15, r * 1.15, 12, x, y));
    for (const z of [-0.8, 0.5]) PE.add('camo', box(0.14, 0.2, 0.2, x, y > 0 ? 0.55 : -0.5, z));
  }
  PE.add('steel', gearArc(1.45, 1.58, 22 * DEG, 74 * DEG, 0.22, 22, 0.04));
  PE.add('camo', gearArc(1.05, 1.45, 22 * DEG, 74 * DEG, 0.16));
  PE.add('camo', box(0.3, 0.2, 0.9, 0, -0.6, 0.5));
  // the sight bracket and dial sight on the left
  PE.add('camo', box(0.1, 0.5, 0.7, -1.0, 0.42, 0.1)); // outside the left cheek, so it sweeps clear of it
  PE.add('camo', box(0.4, 0.07, 0.5, -1.12, 0.78, 0.1));
  PE.add('brass', yTube(0.8, 1.12, 0.055, 0.055, 10, -1.1, 0.1));
  PE.add('dark', zTube(-0.35, 0.1, 0.03, 0.026, 8, -1.1, 1.06));
  PE.add('brass', box(0.3, 0.012, 0.22, 0, 0.502, -0.5));
  PE.add('white', box(0.5, 0.02, 0.3, 0.0, 0.508, 0.35)); // the white name panel ("Persuader")

  // ---- barrel
  const prof = [[MUZ, 0.13], [MUZ, 0.3], [MUZ + 0.05, 0.325], [MUZ + 0.2, 0.325], [MUZ + 0.28, 0.3], [-1.7, 0.31], [-1.1, 0.36], [-0.8, 0.4], [-0.77, 0.48], [1.3, 0.48], [1.34, 0.54], [BRE - 0.04, 0.54], [BRE, 0.48], [BRE, 0.2], [BRE - 0.005, 0]];
  PR.add('iron', zLathe(prof, 32), { tint: 0x838a80 });
  for (const z of [-0.77, -0.1, 0.55, 1.2]) PR.add('iron', zTube(z - 0.03, z + 0.03, 0.495, 0.495, 32), { tint: 0x9a9f94 });
  PR.add('iron', zTube(MUZ + 0.3 - 0.025, MUZ + 0.3 + 0.025, 0.34, 0.34, 24), { tint: 0x9a9f94 });
  PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.2, 0.14, 0.14, 16));
  PR.add('camo', zTube(-2.58, -2.46, 0.4, 0.4, 24)); // the clip rides ahead of the cradle by more than the stroke
  for (const [x, y] of [[-0.34, 0.66], [0.34, 0.66], [0, -0.64]]) {
    PR.add('camo', rod(V(x * 0.4, Math.sign(y) * 0.4, -2.52), V(x, y, -2.52), 0.05, 8));
    PR.add('steel', zTube(-2.52, -1.2, 0.035, 0.035, 8, x, y));
  }
  PR.add('steel', zTube(BRE - 0.01, BRE + 0.015, 0.4, 0.4, 28), { tint: 0xb0b0a8 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; PR.add('steel', box(0.07, 0.1, 0.05, Math.cos(a) * 0.3, Math.sin(a) * 0.3, BRE + 0.02, 0, 0, a + Math.PI / 2)); }
  PR.add('dark', zTube(BRE + 0.01, BRE + 0.03, 0.14, 0.14, 16));
  PR.add('steel', rbox(0.16, 0.18, 0.28, 0.03, 0, 0.6, BRE - 0.2));
  PR.add('brass', yTube(0.6, 0.76, 0.03, 0.04, 8, 0, BRE - 0.2));
  PR.add('camo', rbox(0.14, 0.72, 0.2, 0.03, HX, 0, BRE - 0.16)); // hinge lug, ends short of the swinging block

  // ---- breech carrier
  PB.add('steel', yTube(-0.38, 0.38, 0.055, 0.055, 10, 0, 0.1));
  PB.add('camo', rbox(0.7, 0.4, 0.24, 0.04, -0.33, 0, 0.12));
  PB.add('camo', zTube(0.0, 0.24, 0.46, 0.46, 30, -HX, 0));
  PB.add('steel', zTube(0.24, 0.27, 0.15, 0.15, 16, -HX, 0));
  PB.add('iron', xTube(-HX - 0.28, -HX + 0.28, 0.024, 0.024, 8, 0, 0.4));
  for (const s of [-1, 1]) PB.add('iron', sphere(0.04, -HX + s * 0.28, 0, 0.4, 1, 1, 1, 8));
  PB.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(-HX + Math.cos(i / 10 * 6.283) * 0.37, Math.sin(i / 10 * 6.283) * 0.37, 0.24)), V(0, 0, 1), 0.025));
  PB.add('steel', rbox(0.14, 0.18, 0.18, 0.03, -HX, 0.34, 0.32));

  // ---- loading tray (steel trough on its arm)
  PTR.add('camo', box(0.7, 0.05, 1.9, 0, 0, 1.05));
  for (const s of [-1, 1]) {
    PTR.add('camo', box(0.05, 0.17, 1.9, s * 0.35, 0.1, 1.05));
    PTR.add('dark', rivetRow(V(s * 0.38, 0.12, 0.2), V(s * 0.38, 0.12, 1.9), 0.18, V(s, 0, 0), 0.018));
  }
  PTR.add('camo', box(0.7, 0.06, 0.08, 0, -0.04, 0.2));
  PTR.add('camo', rod(V(-0.55, -0.1, 0.1), V(-0.9, -0.9, 0.6), 0.045, 6));
  PTR.add('camo', rod(V(-0.55, -0.1, 1.9), V(-0.9, -0.9, 0.7), 0.035, 6));
  PTR.add('iron', handwheel(0.22, 5, 0.018, 0.04).translate(-1.0, -0.9, 0.65));
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
  hb(rig, -2.0, 0, -4.1, 2.0, 3.0, 4.0);
  hb(rig, -1.0, 1.0, -2.7, 1.0, 3.6, 3.4);

  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI;
  crewSpot(rig, 'sergeant', -1.9, BH, 2.4, E, 'point');
  crewSpot(rig, 'layer', -1.5, BH, 0.5, E, 'lay');
  crewSpot(rig, 'elevator', 1.6, BH, 0.9, W, 'operate');
  crewSpot(rig, 'lanyard', 1.5, BH, 3.0, N, 'lanyard');
  crewSpot(rig, 'loader1', -0.5, BH + 0.25, 3.3, S, 'carry');
  crewSpot(rig, 'loader2', 0.5, BH + 0.25, 3.3, S, 'carry');
  crewSpot(rig, 'rammer1', -0.35, BH + 0.25, 4.4, N, 'ram');
  crewSpot(rig, 'rammer2', 0.35, BH + 0.25, 4.4, N, 'ram');
  crewSpot(rig, 'ammo1', SX + 0.9, 0, SZ - 0.9, W, 'stand');
  crewSpot(rig, 'ammo2', SX + 0.9, 0, SZ + 1.5, W, 'crouch');
  return finishGun(rig);
}

import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile, frontProfile, gearArc, zLathe, loft, rivets, rivetRow, rivetPoly, mirrorX, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, trayShells, crew, L90, R90, TAU } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * 15 cm schwere Feldhaubitze 13 (the short L/14 barrel the British called the "5.9"), as the divisional heavy
 * batteries had it in Flanders in 1917 and 1918 (refs/sfh13: the surviving guns at Brantford, Victoria Barracks
 * Melbourne, Fort Sill and Rovereto; IWM Q 5177 and Q 5176, captured guns in their pits at Arras, 1917; Schirmer's
 * plate of the sFH 13/02). The squat 2.09 m barrel steps up twice from the chase to the jacket and ends in the big
 * squared breech ring with its horizontal sliding block (opening to the right) and the loading scoop under the
 * chamber; it lies on a long riveted box cradle (buffer and recuperator springs inside) that runs out past the
 * muzzle in a sloped prow and is the barrel's slide. The cradle's trunnions sit in two tall cheeks over the axle; a
 * toothed elevating arc hangs under the cradle on the left. A wide shield of two plates: the lower one between the
 * wheels, the upper one above them with its top rolled forward into a hood, a slot for the barrel through both and
 * a port for the sight on the left. Wooden fourteen-spoke wheels (1.36 m) with steel tyres and shoe brakes. A long
 * riveted box trail, open at the front so the breech can recoil down into it at high elevation, closed by a deck
 * further back, with the spade under its end, the lunette, lifting handles and the handspike socket.
 * About 2,250 kg in action. Elevation -4 to +45 degrees (the game: 2 to 45), 5 degrees of traverse on the axle
 * (the game swings the whole carriage, as the crew did with the handspike).
 * Paint: the 1917 Buntfarbenanstrich ('bunt'), or plain field grey ('feldgrau').
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z. `traverse` carries the whole
 * carriage (wheels, trail, shield, cheeks): a traverse swings the gun about the point under the axle. `elevation`
 * at the trunnions, `recoil` slides the barrel back along +Z on the cradle, `breech` the sliding block (setBreech
 * slides it +X). buildSFH13({ scheme: 'bunt' | 'feldgrau' })
 */
const WR = 0.68, WX = 0.8; // wheel radius over the tyre, centre plane (1.6 m track)
const TR = { y: 1.4, z: -0.1 }; // trunnion axis in root space (bore height)
const MZ = -1.65, BR = 0.44, RING0 = 0.06; // muzzle, breech face, front of the breech ring (along the bore from the trunnions)
const CR = { z0: -2.15, z1: 0.02, w: 0.34, top: -0.15, bot: -0.42 }; // the cradle box under the barrel (elevation frame)
const SH = { z: -0.31, slot: 0.215, top: 2.12 }; // shield plane (root z), half width of the barrel slot, top edge
const CHX = 0.29; // cheek plane (the trunnion bearings)
const ARCX = -0.235; // elevating arc plane, outside the cradle box and the breech ring
const ARC = { r0: 0.46, r1: 0.54 }; // its radii about the trunnions (inside the axle's 0.72 m below them)
const RIV = 0xd0c8b4;

export function buildSFH13({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  // ---------------------------------------------------------------- carriage: wheels, axle, cheeks, shield, trail
  const C = rig.part();
  for (const s of [-1, 1]) addWheel(C, s * WX, WR, { R: WR, tw: 0.095, spokes: 14, side: s, nave: 0.12, cap: 0.09 });
  // axle tree through the cheeks and out to the naves; the axle arms carry the brake hangers
  C.add('camo', xTube(-0.62, 0.62, 0.062, 0.062, 14, WR, 0));
  for (const s of [-1, 1]) {
    C.add('steel', xTube(s * 0.62, s * 0.8, 0.05, 0.05, 12, WR, 0));
    // shoe brake: a hanger from the axle back to a wooden shoe on the tyre, the screw spindle to the trail
    const a = 54 * DEG, sz = Math.sin(a) * (WR + 0.035), sy = WR - Math.cos(a) * (WR + 0.035);
    C.add('dark', rod(V(s * 0.66, WR - 0.02, 0.05), V(s * 0.7, sy + 0.05, sz - 0.04), 0.018, 6));
    C.add('wood', box(0.1, 0.06, 0.24, s * WX, sy, sz, -a));
    const by = WR - Math.cos(a) * (WR + 0.075), bzz = Math.sin(a) * (WR + 0.075);
    C.add('dark', box(0.11, 0.02, 0.26, s * WX, by, bzz, -a));
    C.add('dark', rod(V(s * 0.7, sy + 0.04, sz), V(s * 0.36, 0.5, 0.95), 0.014, 5));
  }
  // the cheeks: tall at the trunnion bearings, falling back to the trail; braced across in front, under the cradle
  const cheek = [[-0.6, 0.6], [-0.55, 1.0], [-0.32, 1.38], [-0.2, 1.52], [0.0, 1.52], [0.04, 1.42], [0.07, 1.1], [0.46, 0.92], [0.9, 0.74], [1.1, 0.72], [1.1, 0.46], [0.5, 0.48], [-0.3, 0.5]];
  // the right cheek is cut down behind a neck under its bearing: the block slides out over it (at any elevation the
  // crew opens it, the drill lowering the barrel at the same time)
  const cheekR = [[-0.6, 0.6], [-0.55, 1.0], [-0.32, 1.38], [-0.2, 1.52], [-0.02, 1.52], [0.02, 1.42], [0.0, 1.32], [-0.12, 1.27], [-0.13, 1.0], [0.1, 0.95], [0.46, 0.92], [0.9, 0.74], [1.1, 0.72], [1.1, 0.46], [0.5, 0.48], [-0.3, 0.5]];
  for (const s of [-1, 1]) {
    const cp = s > 0 ? cheekR : cheek;
    C.add('camo', sideProfile(cp, 0.04).translate(s * CHX, 0, 0));
    C.add('camo', rivetPoly(cp, (z, y) => V(s * (CHX + 0.021), y, z), 0.03, 0.08, V(s, 0, 0), 0.01), { tint: RIV });
    // the bearing caps with their bolts, the stiffening flange along the cheek's front edge
    C.add('camo', xTube(s * (CHX + 0.02), s * (CHX + 0.06), 0.1, 0.095, 18, TR.y, TR.z));
    C.add('steel', xTube(s * (CHX + 0.06), s * (CHX + 0.07), 0.05, 0.05, 12, TR.y, TR.z)); // the trunnion pin's end
    for (let i = 0; i < 6; i++) {
      const b = (i / 6) * TAU;
      C.add('steel', xTube(s * (CHX + 0.06), s * (CHX + 0.075), 0.012, 0.012, 6, TR.y + Math.sin(b) * 0.075, TR.z + Math.cos(b) * 0.075));
    }
    for (let i = 0; i < 3; i++) {
      const [z0, y0] = cheek[i], [z1, y1] = cheek[i + 1], l = Math.hypot(z1 - z0, y1 - y0);
      C.add('camo', box(0.09, 0.022, l + 0.02, s * CHX, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    C.add('camo', box(0.06, 0.22, 0.32, s * CHX, 0.66, 0)); // the axle bearing on the cheek
  }
  C.add('camo', box(CHX * 2, 0.14, 0.16, 0, 0.56, -0.5)); // front transom, low under the cradle's sweep
  // elevating pinion on the left, outside the cradle; the shaft back to the handwheel at the layer's hand
  const pa = 50 * DEG, pr = ARC.r1 + 0.075;
  C.add('dark', box(0.07, 0.1, 0.1, ARCX, TR.y - pr * Math.sin(pa), TR.z + pr * Math.cos(pa)));
  C.add('dark', rod(V(ARCX - 0.035, TR.y - pr * Math.sin(pa), TR.z + pr * Math.cos(pa)), V(-0.43, 1.05, 0.5), 0.016, 6));
  addHwheel(C, -0.47, 1.05, 0.5, 0.15, -1);
  // the traversing handwheel on the right cheek (the top carriage's few degrees on the axle)
  C.add('dark', box(0.08, 0.14, 0.14, CHX + 0.06, 0.82, 0.2));
  C.add('dark', rod(V(CHX + 0.1, 0.82, 0.2), V(0.44, 0.84, 0.48), 0.015, 5));
  addHwheel(C, 0.47, 0.86, 0.5, 0.13, 1);
  // the sight column on the left cheek (Aufsatz), its range drum, and the panoramic sight at the shield's port
  C.add('camo', box(0.05, 0.4, 0.08, -(CHX + 0.07), 1.3, 0.1));
  C.add('camo', box(0.14, 0.05, 0.1, -(CHX + 0.12), 1.52, 0.1));
  C.add('dark', yTube(1.2, 1.54, 0.025, 0.025, 8, -0.47, 0.1));
  C.add('camo', xTube(-0.5, -0.43, 0.07, 0.07, 16, 1.22, 0.16)); // range drum
  C.add('steel', xTube(-0.51, -0.5, 0.072, 0.072, 16, 1.22, 0.16));
  panoramicSight(C, -0.47, 1.54, 0.1, -1);
  // footboards on brackets outside the shield, at hub height (the axle-tree men stood on them to traverse)
  for (const s of [-1, 1]) {
    C.add('dark', rod(V(s * 0.45, 0.52, -0.33), V(s * 0.56, 0.5, -0.62), 0.016, 5));
    C.add('wood', box(0.28, 0.03, 0.18, s * 0.55, 0.5, -0.66));
  }
  shield(C);
  trail(C);
  C.build(trav, { dirt: 0.55 });

  // ---------------------------------------------------------------- cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  // the box: sides rising past the bore as the barrel's guides, a sloped prow in front; side profile [z, y]
  const prof = [[CR.z0, CR.top + 0.02], [CR.z0 + 0.04, CR.top + 0.05], [CR.z1, CR.top + 0.05], [CR.z1, CR.bot + 0.06], [CR.z1 - 0.12, CR.bot], [CR.z0 + 0.32, CR.bot], [CR.z0, CR.top - 0.1]];
  for (const s of [-1, 1]) E.add('camo', sideProfile(prof, 0.025).translate(s * (CR.w / 2 - 0.0125), 0, 0));
  // the trough floor the barrel slides on and the box bottom with its prow plate
  E.add('camo', box(CR.w - 0.05, 0.03, CR.z1 - CR.z0 - 0.06, 0, CR.top - 0.015, (CR.z0 + CR.z1) / 2 + 0.03));
  E.add('camo', box(CR.w - 0.05, 0.025, CR.z1 - CR.z0 - 0.44, 0, CR.bot + 0.012, (CR.z0 + 0.32 + CR.z1 - 0.12) / 2));
  E.add('camo', box(CR.w - 0.05, 0.12, 0.02, 0, CR.top - 0.04, CR.z0 + 0.01));
  { const dz = 0.32, dy = CR.bot - (CR.top - 0.1), l = Math.hypot(dz, dy);
    E.add('camo', box(CR.w - 0.05, 0.02, l, 0, (CR.bot + CR.top - 0.1) / 2, CR.z0 + dz / 2, Math.asin(-dy / l))); }
  E.add('camo', box(CR.w - 0.05, CR.bot * -1 - 0.2, 0.025, 0, (CR.bot + 0.06 + CR.top) / 2, CR.z1 - 0.012)); // rear plate, the rods go in here
  for (const s of [-1, 1]) {
    const x = s * (CR.w / 2 + 0.003);
    // angle irons along the top and bottom edges, rivets, the guides' oily slide strips
    E.add('camo', box(0.03, 0.025, CR.z1 - CR.z0 - 0.06, s * (CR.w / 2 + 0.01), CR.top + 0.035, (CR.z0 + CR.z1) / 2 + 0.03));
    E.add('camo', rivetRow(V(x + s * 0.025, CR.top + 0.035, CR.z0 + 0.1), V(x + s * 0.025, CR.top + 0.035, CR.z1 - 0.04), 0.08, V(s, 0, 0), 0.01), { tint: RIV });
    E.add('camo', rivetRow(V(x, CR.bot + 0.03, CR.z0 + 0.38), V(x, CR.bot + 0.03, CR.z1 - 0.14), 0.08, V(s, 0, 0), 0.01), { tint: RIV });
    for (const z of [-1.4, -1.0, -0.6]) E.add('camo', box(0.012, 0.3, 0.04, s * (CR.w / 2 + 0.006), (CR.bot - 0.05) / 2 + 0.01, z));
    E.add('steel', box(0.02, 0.012, CR.z1 - CR.z0 - 0.12, s * 0.135, CR.top + 0.021, (CR.z0 + CR.z1) / 2 + 0.03));
    // the trunnion arms: plates reaching back from the box outside the breech ring (it recoils between them)
    E.add('camo', box(0.03, 0.22, 0.17, s * 0.23, 0.01, -0.005));
    E.add('camo', box(0.06, 0.14, 0.08, s * 0.2, -0.03, -0.05));
    E.add('camo', rivetRow(V(s * 0.246, 0.08, -0.1), V(s * 0.246, 0.08, 0.06), 0.05, V(s, 0, 0), 0.009), { tint: RIV });
    E.add('camo', xTube(s * 0.245, s * (CHX - 0.022), 0.075, 0.075, 16)); // the trunnion's collar (the pin turns in the cheek)
  }
  E.add('dark', box(0.004, 0.06, 0.16, CR.w / 2 + 0.018, -0.25, -0.75)); // maker's plate
  // filling plugs of the buffer and the spring cylinders on the prow
  E.add('steel', zTube(CR.z0 - 0.015, CR.z0 + 0.01, 0.03, 0.03, 10, 0, -0.24));
  E.add('steel', zTube(CR.z0 + 0.06, CR.z0 + 0.1, 0.022, 0.022, 8, 0.09, -0.34));
  // the elevating arc: a toothed sector on a web off the cradle's left side, centred on the trunnions
  E.add('dark', gearArc(ARC.r0, ARC.r1, 3 * DEG, 52 * DEG, 0.028, 14, 0.022).translate(ARCX, 0, 0));
  E.add('camo', sideProfile([[0.0, -0.08], [0.46, -0.04], [0.3, -0.4], [0.06, -0.2]], 0.02).translate(ARCX + 0.004, 0, 0));
  // the shield's sliding plate: square to the bore on the cradle, just ahead of the shield, it closes the slot over
  // the barrel and rides up through it as the gun is raised
  { const zp = -(TR.z - SH.z) - 0.035, w = SH.slot - 0.02;
    E.add('camo', frontProfile([[-w, 0.16], [w, 0.16], [w, 0.7], [w - 0.05, 0.76], [-w + 0.05, 0.76], [-w, 0.7]], zp - 0.008, zp));
    for (const k of [-1, 1]) E.add('camo', box(0.02, 0.42, 0.05, k * 0.185, 0.1, zp + 0.025)); // its stays down to the barrel guides
    E.add('camo', rivetRow(V(-w + 0.04, 0.72, zp - 0.009), V(w - 0.04, 0.72, zp - 0.009), 0.08, V(0, 0, -1), 0.009), { tint: RIV }); }
  // clinometer seat on the cradle's right
  E.add('steel', box(0.06, 0.014, 0.12, CR.w / 2 + 0.03, -0.03, 0.02));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---------------------------------------------------------------- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  // a plain muzzle with a lip, the chase, two steps up to the jacket (the hoops shrunk on)
  const s1 = -1.05, s2 = -0.5;
  B.add('camo', zLathe([[MZ + 0.3, 0.0745], [MZ, 0.0745], [MZ, 0.104], [MZ + 0.015, 0.112], [MZ + 0.06, 0.112], [MZ + 0.07, 0.105], [s1, 0.114], [s1, 0.122], [s1 + 0.02, 0.128], [s2, 0.131], [s2, 0.14], [s2 + 0.02, 0.146], [RING0 - 0.02, 0.146], [RING0, 0.15], [RING0, 0.0001]], 28));
  B.add('char', new THREE.CircleGeometry(0.0745, 18).rotateY(Math.PI).translate(0, 0, MZ + 0.3));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    B.add('dark', box(0.008, 0.004, 0.29, Math.cos(a) * 0.072, Math.sin(a) * 0.072, MZ + 0.145, 0, 0, a + Math.PI / 2));
  }
  // the sheet guard over the jacket behind the shield (the photos show it on the breech end)
  B.add('camo', zTube(-0.36, -0.06, 0.152, 0.152, 24, 0, 0, true));
  // the breech ring: a rounded block, wider than tall, the slot for the block open to the right; a loading
  // scoop under the chamber mouth on the rear face
  const rw = 0.19, rt = 0.17, rb = -0.2, ry = 0.11;
  B.add('camo', rbox(rw * 2, rt - rb, 0.12, 0.035, 0, (rt + rb) / 2, RING0 + 0.06));
  B.add('camo', rbox(rw * 2, rt - ry, BR - RING0 - 0.12, 0.03, 0, (rt + ry) / 2, (BR + RING0 + 0.12) / 2));
  B.add('camo', rbox(rw * 2, -ry - rb, BR - RING0 - 0.12, 0.03, 0, (rb - ry) / 2, (BR + RING0 + 0.12) / 2));
  B.add('camo', box(0.08, ry * 2, BR - RING0 - 0.12, -rw + 0.04, 0, (BR + RING0 + 0.12) / 2));
  B.add('char', new THREE.CircleGeometry(0.08, 18).translate(0, 0, RING0 + 0.121));
  // the loading scoop: a lip behind the lower part of the ring with a groove the round's base slides over
  B.add('camo', rbox(0.26, 0.07, 0.07, 0.015, 0, -0.155, BR + 0.03));
  B.add('dark', zTube(BR, BR + 0.066, 0.03, 0.03, 10, 0, -0.112));
  for (const y of [-ry, ry]) B.add('dark', box(rw + 0.12, 0.008, 0.004, (rw - 0.12) / 2, y, BR + 0.001));
  B.add('dark', box(0.008, ry * 2, 0.004, -0.12, 0, BR + 0.001));
  // the firing lever on the ring's top right and its lug
  B.add('dark', box(0.05, 0.05, 0.05, 0.13, rt + 0.02, BR - 0.06));
  B.add('steel', rod(V(0.13, rt + 0.04, BR - 0.06), V(0.13, rt + 0.2, BR - 0.02), 0.016, 6));
  B.add('dark', sphere(0.024, 0.13, rt + 0.21, BR - 0.02, 1, 1.3, 1, 8));
  // the lug under the ring that takes the buffer and recuperator rods into the cradle box
  B.add('camo', box(0.12, 0.19, 0.12, 0, -0.285, RING0 + 0.06));
  for (const y of RODS) B.add('steel', zTube(CR.z1 - 0.3, RING0 + 0.1, 0.022, 0.022, 8, 0, y));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  // ---- the sliding block (breech pivot in the ring's slot)
  const bz = (BR + RING0 + 0.12) / 2, bl = BR - RING0 - 0.12;
  const br = pivotAt(rig, rc, 'breech', 0, 0, bz);
  const K = rig.part();
  K.add('camo', box(rw * 2 - 0.08, ry * 2 - 0.006, bl - 0.004, 0.04, 0, 0));
  K.add('steel', zTube(bl / 2 - 0.002, bl / 2 + 0.02, 0.026, 0.026, 10, -0.02, 0)); // firing pin housing
  // the bent operating lever on the block's top left (it rides out with the block)
  K.add('dark', box(0.06, 0.06, 0.04, -0.06, 0.03, bl / 2 + 0.02));
  K.add('steel', rod(V(-0.06, 0.05, bl / 2 + 0.03), V(-0.08, 0.25, bl / 2 + 0.06), 0.018, 6));
  K.add('steel', rod(V(-0.08, 0.25, bl / 2 + 0.06), V(-0.16, 0.3, bl / 2 + 0.12), 0.018, 6));
  K.add('dark', sphere(0.026, -0.16, 0.3, bl / 2 + 0.12, 1.3, 1, 1, 8));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.25);

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 1.75, 0.5);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // no loading tray: the round is handed to the breech and laid in the scoop, its nose in the chamber, then rammed
  const sh = buildShell('sfh13'), mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  // the ready rounds lie by the right wall, forward of the trail's and the detachment's sweep at full traverse (the
  // position's pile in gun_sites_ww1.js is just outboard of this point)
  rig.anchors.shellStack = node(root, 'shellStack', 2.99, 0.1, -0.26);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), 'sfh13');
  rig.recoilLength = 1.1;
  rig.loadEl = 5 * DEG;
  // the ring's corner (0.28 m off the bore) stays 0.14 m over the ground in the open front of the trail
  floorFade(rig, TR.y, BR, 0.28, 0.14, 0.35);
  rig.slideMats = ['camo', 'steel', 'char', 'dark'];
  rig.nest = RODS.map((y) => [0, y]);

  // The detachment (as the British 6-inch's: the light-gun drill): the layer at the sight and the elevating
  // handwheel on the left, the second layer at the traversing handwheel on the right, both just behind the wheels;
  // the loader at the block on the right of the trail, the rammer on the left, the shell and cartridge numbers
  // coming up the right from the ready rounds; the commander off the left.
  crew(rig, 'officer', -2.5, 0.3, L90, 'point'); // clear of the trail's swing at full traverse
  crew(rig, 'layer', -0.85, 0.95, L90, 'lay');
  crew(rig, 'sight', 0.85, 0.95, R90, 'lay');
  crew(rig, 'loader', 0.62, 1.55, 0, 'ram');
  crew(rig, 'rammer', -0.66, 1.75, 0, 'ram');
  crew(rig, 'shell', 1.15, 2.2, R90, 'carry');
  crew(rig, 'cartridge', 1.0, 3.05, R90, 'carry');
  crew(rig, 'lanyard', 1.3, 1.25, R90, 'lanyard');

  hb(rig, -1.0, 0, -1.9, 1.0, 2.1, 0.7);
  hb(rig, -0.38, 0, 0.7, 0.38, 0.8, 4.2);
  return finishRig(rig, 'sfh13', 'sfh13');
}

const RODS = [-0.25, -0.35]; // buffer and recuperator piston rods: they run from the ring's lug into the cradle box

// A handwheel (axis X): rim, five spokes, boss and a turning handle toward `side`.
function addHwheel(P, x, y, z, R, side) {
  const g = [new THREE.TorusGeometry(R, 0.012, 5, 20).rotateY(Math.PI / 2), xTube(-0.03, 0.04, 0.028, 0.024, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.008, 4)); }
  g.push(xTube(0, 0.06, 0.009, 0.009, 6, R, 0), xTube(0.06, 0.1, 0.015, 0.015, 6, R, 0));
  const m = mergeAll(g);
  P.add('dark', (side < 0 ? mirrorX(m) : m).translate(x, y, z));
}

// ---------------------------------------------------------------- the shield
// Two plates in one plane: the lower between the wheels (down to the footboards), the upper wider, over the wheel
// tops, its top rolled forward into a hood. The barrel's slot runs up through both and the hood (the cradle and
// barrel pass through it as they elevate); the sight's port on the left; the folding sight flap; rivets and the
// angle-iron stiffeners on the back.
function shield(P) {
  const z0 = SH.z, t = 0.008, s = SH.slot, yb = 1.4;
  // lower plate (two halves either side of the slot)
  for (const k of [-1, 1]) {
    P.add('camo', frontProfile([[k * s, 0.5], [k * 0.66, 0.5], [k * 0.7, yb], [k * s, yb]], z0, z0 + t));
  }
  // the bottom between the slot halves under the cradle's sweep (the slot starts at 0.9)
  P.add('camo', frontProfile([[-s, 0.5], [s, 0.5], [s, 0.9], [-s, 0.9]], z0, z0 + t));
  // upper plate over the wheels: from yb up to the hood, a slot through the middle, an arched head to the slot
  for (const k of [-1, 1]) {
    const pts = [[k * s, yb], [k * 0.98, yb + 0.06], [k * 0.98, SH.top], [k * s, SH.top]];
    P.add('camo', frontProfile(pts, z0, z0 + t));
  }
  // the hood: the top edge rolled forward in four facets, split by the slot
  const hood = [[0, 0], [0.08, 0.07], [0.17, 0.11], [0.26, 0.13]]; // [forward, up] from the top edge
  for (const k of [-1, 1]) {
    for (let i = 0; i < hood.length - 1; i++) {
      const [f0, u0] = hood[i], [f1, u1] = hood[i + 1];
      const a = V(k * s, SH.top + u0, z0 - f0), b = V(k * 0.98, SH.top + u0, z0 - f0);
      const c = V(k * 0.98, SH.top + u1, z0 - f1), d = V(k * s, SH.top + u1, z0 - f1);
      const n = V(0, 0.007, 0.007);
      P.add('camo', loft([[a, b, c, d], [a.clone().add(n), b.clone().add(n), c.clone().add(n), d.clone().add(n)]]));
    }
  }
  // the sight's port on the left (a dark opening) and its hinged flap standing open above it
  P.add('char', box(0.12, 0.1, 0.012, -0.47, 1.86, z0 + t / 2));
  P.add('camo', box(0.14, 0.12, 0.008, -0.47, 1.98, z0 - 0.03, -0.5));
  // stiffeners on the back: an angle iron along the plates' joint, two uprights each side, the slot's edge strips
  for (const k of [-1, 1]) {
    P.add('camo', box(0.98 - s, 0.04, 0.03, k * (0.98 + s) / 2, yb + 0.03, z0 + t + 0.015));
    for (const x of [0.42, 0.82]) P.add('camo', box(0.03, x > 0.7 ? SH.top - yb - 0.1 : SH.top - 0.62, 0.03, k * x, x > 0.7 ? (SH.top + yb) / 2 : (SH.top + 0.62) / 2, z0 + t + 0.015));
    P.add('camo', box(0.025, SH.top - 0.92, 0.03, k * (s + 0.015), (SH.top + 0.92) / 2, z0 + t + 0.015));
    P.add('camo', rivetRow(V(k * (s + 0.05), yb + 0.03, z0 - 0.002), V(k * 0.95, yb + 0.03, z0 - 0.002), 0.09, V(0, 0, -1), 0.009), { tint: RIV });
    P.add('camo', rivetRow(V(k * 0.42, 0.68, z0 - 0.002), V(k * 0.42, SH.top - 0.06, z0 - 0.002), 0.11, V(0, 0, -1), 0.009), { tint: RIV });
    // the struts from the shield's back to the cheeks
    P.add('dark', rod(V(k * 0.6, 1.3, z0 + t), V(k * (CHX + 0.02), 1.05, -0.45), 0.016, 5));
  }
}

// ---------------------------------------------------------------- the trail
// A long box of two riveted channels, wide at the cheeks and tapering to the end; open at top and bottom in front
// so the breech can recoil down into it at high elevation; a deck plate over the rear half with the tool box on it;
// transoms; at the end the spade under it, the lunette, two fold-out handles and the handspike's socket.
function trail(P) {
  const z0 = 0.3, z1 = 4.05, y0 = 0.6, y1 = 0.2, h0 = 0.34, h1 = 0.2, w0 = 0.66, w1 = 0.36, t = 0.022;
  const at = (k) => ({ z: z0 + (z1 - z0) * k, y: y0 + (y1 - y0) * k, h: h0 + (h1 - h0) * k, w: w0 + (w1 - w0) * k });
  const A = at(0), Bn = at(1);
  for (const s of [-1, 1]) {
    // the channel's web (a loft from front to end), its top and bottom flanges turned inward
    const web = (q, dx) => [V(s * (q.w / 2 - dx), q.y - q.h / 2, q.z), V(s * (q.w / 2 - dx), q.y + q.h / 2, q.z), V(s * (q.w / 2 - dx - t), q.y + q.h / 2, q.z), V(s * (q.w / 2 - dx - t), q.y - q.h / 2, q.z)];
    P.add('camo', loft([web(A, 0), web(Bn, 0)]));
    for (const top of [1, -1]) {
      const fl = (q) => [V(s * q.w / 2, q.y + top * q.h / 2, q.z), V(s * (q.w / 2 - 0.07), q.y + top * q.h / 2, q.z), V(s * (q.w / 2 - 0.07), q.y + top * (q.h / 2 - 0.014), q.z), V(s * q.w / 2, q.y + top * (q.h / 2 - 0.014), q.z)];
      P.add('camo', loft([fl(A), fl(Bn)]));
    }
    // rivet rows along both flanges on the outside of the web
    const pts = [];
    for (let k = 0.02; k < 0.98; k += 0.024) { const q = at(k); pts.push(V(s * (q.w / 2 + 0.002), q.y + q.h / 2 - 0.03, q.z), V(s * (q.w / 2 + 0.002), q.y - q.h / 2 + 0.03, q.z)); }
    P.add('camo', rivets(pts, V(s, 0, 0), 0.01), { tint: RIV });
    // the travelling lock's bracket and a handspike clipped along the outside
    const q = at(0.42);
    P.add('steel', rod(V(s * (q.w / 2 + 0.03), q.y + 0.02, at(0.25).z), V(s * (at(0.6).w / 2 + 0.03), at(0.6).y + 0.02, at(0.6).z), 0.02, 6));
    for (const k of [0.3, 0.55]) { const r = at(k); P.add('dark', box(0.05, 0.05, 0.04, s * (r.w / 2 + 0.02), r.y + 0.02, r.z)); }
  }
  // transoms (behind the breech's sweep) and the deck over the rear half; the tool box on the deck
  for (const k of [0.32, 0.6, 0.85]) {
    const q = at(k);
    P.add('camo', box(q.w - 0.05, q.h - 0.03, 0.02, 0, q.y, q.z));
  }
  const d0 = at(0.32), d1 = at(0.97);
  P.add('camo', loft([[V(-d0.w / 2 + 0.01, d0.y + d0.h / 2, d0.z), V(d0.w / 2 - 0.01, d0.y + d0.h / 2, d0.z), V(d0.w / 2 - 0.01, d0.y + d0.h / 2 + 0.01, d0.z), V(-d0.w / 2 + 0.01, d0.y + d0.h / 2 + 0.01, d0.z)],
    [V(-d1.w / 2 + 0.01, d1.y + d1.h / 2, d1.z), V(d1.w / 2 - 0.01, d1.y + d1.h / 2, d1.z), V(d1.w / 2 - 0.01, d1.y + d1.h / 2 + 0.01, d1.z), V(-d1.w / 2 + 0.01, d1.y + d1.h / 2 + 0.01, d1.z)]]));
  const tb = at(0.5), tbp = Math.atan2(y0 - y1, z1 - z0);
  P.add('camo', rbox(0.4, 0.16, 0.6, 0.02, 0, tb.y + tb.h / 2 + 0.09, tb.z, tbp));
  P.add('dark', box(0.4, 0.012, 0.04, 0, tb.y + tb.h / 2 + 0.17, tb.z - 0.2, tbp));
  // the end: the spade under it (a pointed plate dug in), gussets, the lunette, handles, the handspike socket
  const e = at(1), ez = e.z;
  P.add('camo', box(e.w + 0.03, e.h + 0.02, 0.025, 0, e.y, ez - 0.01));
  const spade = frontProfile([[-0.33, 0.1], [0.33, 0.1], [0.33, -0.22], [0.12, -0.4], [0, -0.44], [-0.12, -0.4], [-0.33, -0.22]], 0, 0.03);
  P.add('camo', spade.translate(0, 0, -0.015).rotateX(0.25).translate(0, e.y - e.h / 2, ez - 0.32));
  for (const s of [-1, 1]) P.add('camo', box(0.02, 0.2, 0.3, s * 0.16, e.y - e.h / 2 - 0.05, ez - 0.2, 0.3));
  P.add('dark', box(0.08, 0.06, 0.18, 0, e.y, ez + 0.08));
  P.add('dark', new THREE.TorusGeometry(0.075, 0.02, 6, 16).rotateX(Math.PI / 2).translate(0, e.y, ez + 0.23));
  for (const s of [-1, 1]) {
    P.add('steel', rod(V(s * (e.w / 2 + 0.01), e.y + 0.04, ez - 0.32), V(s * (e.w / 2 + 0.17), e.y + 0.08, ez - 0.24), 0.014, 6));
    P.add('dark', sphere(0.026, s * (e.w / 2 + 0.18), e.y + 0.08, ez - 0.23, 1, 1, 1, 8));
  }
  // the handspike socket: a tube standing up at the end, the long wooden handspike (Richtbaum) laid in it
  P.add('dark', rod(V(0, e.y + e.h / 2, ez - 0.25), V(0, e.y + e.h / 2 + 0.24, ez - 0.05), 0.04, 10));
  P.add('wood', rod(V(0, e.y + e.h / 2 + 0.2, ez - 0.09), V(0, e.y + e.h / 2 + 0.55, ez + 0.32), 0.03, 8));
}

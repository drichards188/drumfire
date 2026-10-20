import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile, frontProfile, gearArc, zLathe, loft, rivets, rivetRow, rivetPoly, mirrorX, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, ring, L90, R90, TAU } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * 21 cm Mörser 16, the heavy howitzer of the Fußartillerie on its box carriage, as it stood in Flanders in 1917 and
 * 1918 (refs/m16: the gun captured at Démuin in August 1918 in Battlefields Park, Quebec; the Dresden museum's;
 * Stanley Park, Vancouver, 1923; Library and Archives Canada O.3024 with its wheel girdles; NARA, Armentières 1918).
 * The fat 2.67 m barrel (L/12) steps up from the chase to the jacket and ends in a big squared ring with a horizontal
 * sliding wedge (opening to the right). It recoils in a long riveted U-trough cradle under it (the buffer inside);
 * over it rides the recuperator housing, a riveted box with rounded edges, whose piston rods show behind it when the
 * barrel runs back. Big side plates with stiffening ribs carry the trunnions near the breech, and two toothed
 * elevating arcs hang under them either side of the breech's path (they engage pinions on the axle box: the steep
 * elevation to 70 degrees). Tall riveted cheeks over a heavy axle tree; steel wheels (1.5 m) with ten flat spokes,
 * riveted felloes and the hinged girdle shoes (Radgürtel) that kept it out of the Flanders mud. A long box trail:
 * open in front as a well the breech dives into at high elevation, then a deck with two braced hatch covers, the
 * arched opening for the spade's lever, step plates, and at the end the wide float with the handspike sockets and
 * handles, the spade under it and the lunette beam. 6,680 kg in action. Elevation -6 to +70 degrees (the game: 10 to
 * 70), 4 degrees of traverse on the axle (the game swings the carriage). Paint: 'bunt' (the 1917 Buntfarbenanstrich,
 * as on the Stanley Park and Quebec guns) or 'feldgrau'.
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z. `traverse` the whole carriage,
 * `elevation` at the trunnions, `recoil` the barrel (back along +Z), `breech` the wedge (setBreech slides it +X),
 * `loadTray` the loading tray hooked onto the ring (setTray: 0 on, in line with the bore, 1 off; only drawn at the
 * loading elevation, as the K 18's). rig.recoilFade keeps the ring clear of the trail's well and deck.
 * buildM16({ scheme: 'bunt' | 'feldgrau' })
 */
const WR = 0.75, WX = 0.98, GIRD = 0.055; // wheel radius over the tyre, centre plane, girdle shoe depth
const WY = WR + GIRD; // axle height (the gun stands on its girdle shoes)
const TR = { y: 1.75, z: 0.15 }; // trunnion axis in root space
const MZ = -1.99, BR = 0.68, RING0 = 0.14; // muzzle, breech face, front of the ring (along the bore from the trunnions)
const RG = { w: 0.3, top: 0.29, bot: -0.31, slot: 0.15 }; // breech ring half width, top, bottom; the wedge's slot half height
const TRO = { z0: -1.55, z1: 0.1, w: 0.3, top: -0.06, floor: -0.245, bot: -0.47 }; // the U-trough under the barrel
const HOU = { z0: -1.48, z1: 0.1, w: 0.25, y0: 0.255, y1: 0.62 }; // the recuperator housing over it
const SPX = 0.31, CHX = 0.47, ARX = 0.38; // the cradle's side plates, the cheeks, the elevating arcs (x)
const ARC = { r0: 0.66, r1: 0.74 }; // the arcs' radii about the trunnions (they pass just over the axle housing)
const TRAIL = { z0: 0.15, z1: 3.95, top0: 0.86, top1: 0.36, bot0: 0.42, bot1: 0.12, w0: 0.52, w1: 0.25, well: 1.45, floor: 0.15 };
const RIV = 0xd0c8b4;

export function buildM16({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const sh = buildShell('m16');

  // ---------------------------------------------------------------- carriage
  const C = rig.part();
  for (const s of [-1, 1]) steelWheel(C, s * WX, s);
  // the axle tree in its housing (flanged), the traversing slide in front of it, the lower carriage box under them
  C.add('steel', xTube(-WX + 0.02, WX - 0.02, 0.07, 0.07, 14, WY, 0));
  C.add('camo', xTube(-0.72, 0.72, 0.13, 0.13, 20, WY, 0));
  for (const x of [-0.72, -0.4, 0.4, 0.72]) C.add('camo', xTube(x - 0.025, x + 0.025, 0.16, 0.16, 20, WY, 0));
  C.add('camo', xTube(-0.6, 0.6, 0.1, 0.1, 18, WY + 0.02, -0.3));
  for (const s of [-1, 1]) C.add('camo', xTube(s * 0.6, s * 0.66, 0.13, 0.12, 16, WY + 0.02, -0.3));
  C.add('camo', rbox(1.0, 0.44, 0.5, 0.03, 0, 0.57, -0.1));
  C.add('camo', rivetRow(V(-0.46, 0.76, -0.355), V(0.46, 0.76, -0.355), 0.07, V(0, 0, -1), 0.011), { tint: RIV });
  C.add('camo', rivetRow(V(-0.46, 0.4, -0.355), V(0.46, 0.4, -0.355), 0.07, V(0, 0, -1), 0.011), { tint: RIV });
  C.add('dark', yTube(0.2, 0.36, 0.11, 0.12, 16, 0, -0.1)); // the pivot's footing under the box
  for (const s of [-1, 1]) C.add('steel', yTube(0.3, 0.4, 0.04, 0.04, 8, s * 0.3, -0.36)); // towing hooks
  // the cheeks: tall at the trunnions, falling back along the trail's sides
  const cheek = [[-0.55, 0.55], [-0.5, 1.0], [-0.28, 1.62], [-0.02, 1.96], [0.3, 1.96], [0.39, 1.76], [0.41, 1.45], [0.9, 1.25], [1.35, 1.0], [1.35, 0.5], [0.5, 0.45], [-0.3, 0.45]];
  for (const s of [-1, 1]) {
    C.add('camo', sideProfile(cheek, 0.04).translate(s * CHX, 0, 0));
    C.add('camo', rivetPoly(cheek, (z, y) => V(s * (CHX + 0.021), y, z), 0.035, 0.085, V(s, 0, 0), 0.012), { tint: RIV });
    for (let i = 0; i < 5; i++) { // the flange round the front and top edges
      const [z0, y0] = cheek[i], [z1, y1] = cheek[i + 1], l = Math.hypot(z1 - z0, y1 - y0);
      C.add('camo', box(0.11, 0.025, l + 0.02, s * CHX, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    // two ribs across the cheek's outside, the trunnion's bearing cap and bolts
    C.add('camo', box(0.03, 0.9, 0.05, s * (CHX + 0.035), 1.05, 0.0, 0.5));
    C.add('camo', box(0.03, 0.6, 0.05, s * (CHX + 0.035), 0.95, 0.75, -0.6));
    C.add('camo', xTube(s * (CHX + 0.02), s * (CHX + 0.08), 0.15, 0.14, 20, TR.y, TR.z));
    C.add('steel', xTube(s * (CHX + 0.08), s * (CHX + 0.095), 0.07, 0.07, 12, TR.y, TR.z));
    for (let i = 0; i < 8; i++) {
      const b = (i / 8) * TAU;
      C.add('steel', xTube(s * (CHX + 0.08), s * (CHX + 0.1), 0.015, 0.015, 6, TR.y + Math.sin(b) * 0.11, TR.z + Math.cos(b) * 0.11));
    }
    // the elevating pinions on brackets off the axle box, under the arcs
    const pa = 110 * DEG, pr = ARC.r1 + 0.09, py = TR.y - pr * Math.sin(pa), pz = TR.z + pr * Math.cos(pa);
    C.add('dark', xTube(s * (ARX - 0.05), s * (ARX + 0.05), 0.06, 0.06, 12, py, pz));
    C.add('dark', xTube(s * (ARX + 0.05), s * (CHX - 0.02), 0.025, 0.025, 8, py, pz)); // its shaft into the cheek
    C.add('camo', box(0.04, py - 0.78, 0.12, s * (ARX + 0.07), (py + 0.78) / 2, pz));
  }
  // left: the elevating handwheel and its bevel box outside the cheek, the sight on its bracket over it
  C.add('camo', box(0.14, 0.2, 0.2, -(CHX + 0.1), 1.12, 0.95));
  C.add('dark', mirrorX(hwheel(0.21)).translate(-(CHX + 0.2), 1.12, 0.95));
  C.add('camo', box(0.06, 0.62, 0.08, -(CHX + 0.07), 1.69, 0.56));
  C.add('camo', box(0.18, 0.05, 0.1, -(CHX + 0.14), 2.0, 0.56));
  C.add('camo', xTube(-(CHX + 0.16), -(CHX + 0.08), 0.09, 0.09, 18, 1.58, 0.64)); // range drum
  C.add('steel', xTube(-(CHX + 0.17), -(CHX + 0.16), 0.092, 0.092, 18, 1.58, 0.64));
  panoramicSight(C, -(CHX + 0.18), 2.02, 0.56, -1);
  // right: the traversing handwheel and its box
  C.add('camo', box(0.12, 0.18, 0.18, CHX + 0.09, 1.05, 0.95));
  C.add('dark', hwheel(0.17).translate(CHX + 0.17, 1.05, 0.95));
  trail(C);
  C.build(trav, { dirt: 0.55 });

  // ---------------------------------------------------------------- cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  // the U-trough: two side walls, the floor the barrel slides on, the bottom, flanges turned out along the top
  const tl = TRO.z1 - TRO.z0, tz = (TRO.z0 + TRO.z1) / 2;
  for (const s of [-1, 1]) {
    E.add('camo', box(0.025, TRO.top - TRO.bot, tl, s * (TRO.w - 0.0125), (TRO.top + TRO.bot) / 2, tz));
    E.add('camo', box(0.08, 0.022, tl, s * (TRO.w + 0.015), TRO.top - 0.011, tz));
    E.add('camo', rivetRow(V(s * (TRO.w + 0.04), TRO.top + 0.001, TRO.z0 + 0.05), V(s * (TRO.w + 0.04), TRO.top + 0.001, TRO.z1 - 0.05), 0.075, V(0, 1, 0), 0.011), { tint: RIV });
    E.add('camo', rivetRow(V(s * (TRO.w + 0.001), TRO.bot + 0.03, TRO.z0 + 0.05), V(s * (TRO.w + 0.001), TRO.bot + 0.03, TRO.z1 - 0.05), 0.075, V(s, 0, 0), 0.011), { tint: RIV });
    E.add('steel', box(0.03, 0.012, tl - 0.1, s * 0.16, TRO.floor + 0.006, tz)); // the slides
  }
  E.add('camo', box(TRO.w * 2 - 0.05, 0.03, tl, 0, TRO.floor - 0.015, tz));
  E.add('camo', box(TRO.w * 2 - 0.05, 0.025, tl, 0, TRO.bot + 0.0125, tz));
  E.add('camo', box(TRO.w * 2 - 0.05, TRO.floor - TRO.bot, 0.025, 0, (TRO.floor + TRO.bot) / 2, TRO.z0 + 0.0125)); // front plate
  for (const s of [-1, 1]) E.add('steel', zTube(TRO.z0 - 0.02, TRO.z0, 0.035, 0.035, 10, s * 0.1, -0.36)); // buffer plugs
  // the recuperator housing: a riveted box with rounded edges over the barrel, the springs' cylinders in it
  const hl = HOU.z1 - HOU.z0, hz = (HOU.z0 + HOU.z1) / 2, hy = (HOU.y0 + HOU.y1) / 2;
  E.add('camo', rbox(HOU.w * 2, HOU.y1 - HOU.y0, hl, 0.11, 0, hy, hz));
  for (const s of [-1, 1]) {
    E.add('camo', rivetRow(V(s * (HOU.w + 0.001), HOU.y0 + 0.04, HOU.z0 + 0.06), V(s * (HOU.w + 0.001), HOU.y0 + 0.04, HOU.z1 - 0.06), 0.075, V(s, 0, 0), 0.011), { tint: RIV });
    E.add('camo', rivetRow(V(s * (HOU.w - 0.06), HOU.y1 + 0.001, HOU.z0 + 0.06), V(s * (HOU.w - 0.06), HOU.y1 + 0.001, HOU.z1 - 0.06), 0.075, V(0, 1, 0), 0.011), { tint: RIV });
  }
  for (const z of [-1.1, -0.6]) E.add('camo', rbox(HOU.w * 2 + 0.02, HOU.y1 - HOU.y0 + 0.02, 0.04, 0.12, 0, hy, z)); // straps
  E.add('steel', yTube(HOU.y1 - 0.01, HOU.y1 + 0.04, 0.025, 0.025, 8, 0.1, HOU.z0 + 0.3)); // filling valve
  E.add('dark', box(0.22, 0.012, 0.16, 0, HOU.y1 + 0.005, HOU.z0 + 0.5)); // its plate
  // the saddles joining housing and trough to the barrel's sides
  for (const z of [-1.3, -0.75]) for (const s of [-1, 1]) E.add('camo', box(0.03, HOU.y0 - TRO.top + 0.04, 0.08, s * (TRO.w - 0.015), (HOU.y0 + TRO.top) / 2, z));
  // the cradle's side plates round the trunnions: plates with a cross of ribs, the trunnion collars
  const sp = [[-0.75, TRO.bot], [-0.75, HOU.y1 - 0.05], [-0.55, HOU.y1], [0.1, HOU.y1], [0.1, TRO.bot]];
  for (const s of [-1, 1]) {
    E.add('camo', sideProfile(sp, 0.03).translate(s * SPX, 0, 0));
    E.add('camo', box(0.04, 0.03, 0.9, s * (SPX + 0.03), (HOU.y1 + TRO.bot) / 2, -0.33, Math.atan2(HOU.y1 - TRO.bot, 0.84)));
    E.add('camo', box(0.04, 0.03, 0.9, s * (SPX + 0.03), (HOU.y1 + TRO.bot) / 2, -0.33, -Math.atan2(HOU.y1 - TRO.bot, 0.84)));
    E.add('camo', box(0.04, HOU.y1 - TRO.bot, 0.04, s * (SPX + 0.03), (HOU.y1 + TRO.bot) / 2, 0.08));
    E.add('camo', rivetPoly(sp, (z, y) => V(s * (SPX + 0.016), y, z), 0.03, 0.08, V(s, 0, 0), 0.011), { tint: RIV });
    E.add('camo', xTube(s * (SPX + 0.015), s * (CHX - 0.022), 0.12, 0.12, 18));
    E.add('camo', xTube(s * (SPX + 0.04), s * (SPX + 0.07), 0.17, 0.17, 20)); // collar flange
  }
  // the elevating arcs either side of the breech's path, on webs off the side plates
  for (const s of [-1, 1]) {
    E.add('dark', gearArc(ARC.r0, ARC.r1, 34 * DEG, 104 * DEG, 0.04, 22, 0.025).translate(s * ARX, 0, 0));
    E.add('camo', sideProfile([[0.1, -0.3], [0.5, -0.34], [0.4, -0.56], [0.0, -0.68], [-0.14, -0.66], [-0.1, -0.45]], 0.025).translate(s * (ARX - 0.03), 0, 0));
    E.add('camo', box(ARX - SPX - 0.005, 0.12, 0.3, s * (ARX + SPX) / 2, -0.4, 0.0)); // the web's spacer to the side plate
  }
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---------------------------------------------------------------- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  const st = -0.62; // the step from the chase to the jacket
  B.add('camo', zLathe([[MZ + 0.35, 0.1055], [MZ, 0.1055], [MZ, 0.165], [MZ + 0.012, 0.176], [MZ + 0.09, 0.176], [MZ + 0.1, 0.168], [st, 0.186], [st, 0.21], [st + 0.04, 0.232], [RING0 - 0.02, 0.235], [RING0, 0.24], [RING0, 0.116], [RING0 - 0.45, 0.116], [RING0 - 0.45, 0.0001]], 32)); // the chamber open to the rear
  B.add('char', new THREE.CircleGeometry(0.1055, 20).rotateY(Math.PI).translate(0, 0, MZ + 0.35));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    B.add('dark', box(0.01, 0.005, 0.34, Math.cos(a) * 0.103, Math.sin(a) * 0.103, MZ + 0.17, 0, 0, a + Math.PI / 2));
  }
  B.add('camo', zTube(st + 0.2, st + 0.24, 0.24, 0.24, 28)); // a shrunk hoop on the jacket
  // the ring: front plate, top and bottom, the left wall; the wedge's slot open to the right
  const rl = BR - RING0, fz = RING0 + 0.13;
  // the front plate round the chamber's mouth (a square opening the round passes through)
  const ch = 0.122;
  B.add('camo', rbox(RG.w * 2, RG.top - ch, 0.13, 0.04, 0, (RG.top + ch) / 2, RING0 + 0.065));
  B.add('camo', rbox(RG.w * 2, -ch - RG.bot, 0.13, 0.04, 0, (RG.bot - ch) / 2, RING0 + 0.065));
  for (const s of [-1, 1]) B.add('camo', box(RG.w - ch, ch * 2, 0.13, s * (RG.w + ch) / 2, 0, RING0 + 0.065));
  B.add('camo', rbox(RG.w * 2, RG.top - RG.slot, BR - fz, 0.035, 0, (RG.top + RG.slot) / 2, (BR + fz) / 2));
  B.add('camo', rbox(RG.w * 2, -RG.slot - RG.bot, BR - fz, 0.035, 0, (RG.bot - RG.slot) / 2, (BR + fz) / 2));
  B.add('camo', box(0.12, RG.slot * 2, BR - fz, -RG.w + 0.06, 0, (BR + fz) / 2));
  B.add('char', new THREE.CircleGeometry(0.116, 20).translate(0, 0, RING0 - 0.449)); // the chamber's dark depth
  for (const y of [-RG.slot, RG.slot]) B.add('dark', box(RG.w + 0.18, 0.01, 0.004, (RG.w - 0.18) / 2, y, BR + 0.001));
  B.add('dark', box(0.01, RG.slot * 2, 0.004, -0.18, 0, BR + 0.001));
  // lugs for the rods: the recuperator's two from the top into the housing, the buffer's two from below into the trough
  B.add('camo', box(0.36, 0.18, 0.14, 0, RG.top + 0.07, RING0 + 0.07));
  B.add('camo', box(0.36, 0.12, 0.14, 0, RG.bot - 0.04, RING0 + 0.07));
  for (const [x, y] of RODS) B.add('steel', zTube(-0.65, RING0 + 0.12, 0.03, 0.03, 10, x, y));
  // the firing lanyard's lever on the ring's top right
  B.add('dark', box(0.06, 0.06, 0.06, 0.2, RG.top + 0.03, BR - 0.08));
  B.add('steel', rod(V(0.2, RG.top + 0.05, BR - 0.08), V(0.24, RG.top + 0.2, BR - 0.02), 0.016, 6));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  // ---- the wedge
  const bl = BR - fz, bz = (BR + fz) / 2, bw = RG.w * 2 - 0.12;
  const br = pivotAt(rig, rc, 'breech', 0, 0, bz);
  const K = rig.part();
  K.add('camo', box(bw, RG.slot * 2 - 0.006, bl - 0.004, 0.06, 0, 0));
  K.add('steel', zTube(bl / 2 - 0.002, bl / 2 + 0.025, 0.035, 0.035, 12, 0.0, 0)); // firing lock
  K.add('dark', box(0.08, 0.08, 0.05, -0.1, 0.03, bl / 2 + 0.02));
  K.add('steel', rod(V(-0.1, 0.05, bl / 2 + 0.04), V(-0.12, 0.3, bl / 2 + 0.08), 0.02, 6)); // the crank handle
  K.add('steel', rod(V(-0.12, 0.3, bl / 2 + 0.08), V(-0.22, 0.34, bl / 2 + 0.15), 0.02, 6));
  K.add('dark', sphere(0.03, -0.22, 0.34, bl / 2 + 0.15, 1.3, 1, 1, 8));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, bw - 0.04);
  const block = rig.setBreech;
  rig.setBreech = (k) => { block(k); rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25))); };

  // ---- the loading tray (Ladeschale), hooked onto the ring's slot while the round goes in (as the K 18's): its lip on
  // the slot's floor, a riser up the ring's face, the floor at the shell's underside; off the gun it is not drawn
  rig.loadEl = 3 * DEG;
  const sr = sh.radius, yb = -RG.slot;
  const tp = pivotAt(rig, rc, 'loadTray', 0, yb, BR - 0.05);
  const R = rig.part(), tw = sr + 0.03, tlen = sh.length * 0.8 + 0.12, fy = -sr - yb, z0 = 0.05;
  R.add('camo', box(tw * 2, 0.014, tlen, 0, fy - 0.007, z0 + tlen / 2));
  R.add('dark', box(tw * 2 - 0.04, 0.012, z0 + 0.012, 0, 0.006, (z0 + 0.012) / 2));
  R.add('dark', box(tw * 2 - 0.04, Math.max(0.02, fy), 0.014, 0, fy / 2, z0 + 0.007));
  for (const z of [z0 + tlen * 0.35, z0 + tlen - 0.06]) R.add('dark', box(tw * 2 - 0.02, 0.03, 0.04, 0, fy - 0.029, z));
  for (const s of [-1, 1]) {
    R.add('camo', box(0.014, 0.08, tlen, s * tw, fy + 0.03, z0 + tlen / 2, 0, 0, s * -0.35));
    R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tlen * 0.3), V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.32), 0.012, 5));
    R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tlen * 0.7), V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.68), 0.012, 5));
    R.add('steel', rod(V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.32), V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.68), 0.012, 5));
  }
  R.build(tp, { dirt: 0.05, y0: TR.y });
  const TIP = 0.6;
  let trayK = 1;
  const placeTray = () => {
    const on = trayK < 0.98 && Math.abs(el.rotation.x - rig.loadEl) < 0.01;
    tp.visible = on;
    tp.rotation.x = on ? -TIP * trayK : 0;
    tp.scale.setScalar(on ? 1 : 1e-3);
  };
  rig.setTray = (k) => { trayK = Math.min(1, Math.max(0, k)); placeTray(); };
  rig.setTray(1);
  rig.setElevation = (r) => { el.rotation.x = r; placeTray(); };
  rig.update = () => placeTray();

  // ---- recoil: 1.15 m at the low angles, cut as the gun is raised so the ring stays clear of the axle box, the
  // well's floor and the trail's deck (a table over the elevation, built once)
  rig.recoilLength = 1.15;
  const fadeTab = new Float32Array(81);
  for (let i = 0; i <= 80; i++) fadeTab[i] = recoilRoom(i * DEG) / rig.recoilLength;
  rig.recoilFade = (e) => {
    const d = Math.min(80, Math.max(0, e / DEG)), i = Math.min(79, Math.floor(d)), f = d - i;
    return Math.min(1, Math.max(0.25, fadeTab[i] * (1 - f) + fadeTab[i + 1] * f));
  };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 2.4, 1.0);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.06);
  // the rounds lie forward on the left (the carriers' side), the ammunition numbers stand off the right, all outside
  // the trail's swing at full traverse (they stay put in the pit while the trail is shifted)
  rig.anchors.shellStack = node(root, 'shellStack', -2.8, 0.12, -0.6);
  // named shell-* like rig.js's props, so the crew's clearance field leaves the rounds out
  trayShells(rig, node(tp, 'shell-tray', 0, -yb - sr - 0.02, z0 + 0.04), 'm16');
  rig.slideMats = ['camo', 'steel', 'char', 'dark'];
  rig.nest = RODS;

  // The detachment (the British 9.2-inch's and the Mrs 18's drill): two carriers bring the shell between them on
  // the right of the trail to the tray, two rammers drive it home with the long staff, the cartridge comes from the
  // ammunition niche; the layer at the sight and the elevating handwheel on the left behind the wheel, a second man
  // at the traversing handwheel on the right, the lanyard man off the right, the commander off the left.
  crew(rig, 'officer', -2.6, -2.0, L90, 'point');
  crew(rig, 'layer', -1.7, 0.65, 0, 'lay'); // outside the wheel, the pair's place at the tray is behind it
  crew(rig, 'elevator', 1.0, 1.3, R90, 'operate');
  crew(rig, 'lanyard', 1.6, 2.0, R90, 'lanyard');
  crew(rig, 'loader1', -1.6, 2.9, 0, 'carry');
  crew(rig, 'loader2', -1.6, 3.7, 0, 'carry');
  crew(rig, 'rammer1', -0.6, 4.4, 0, 'ram');
  crew(rig, 'rammer2', 0.6, 4.4, 0, 'ram');
  crew(rig, 'ammo1', 4.4, 2.0, R90, 'stand');
  crew(rig, 'ammo2', 4.0, 1.0, R90, 'carry');

  hb(rig, -1.25, 0, -2.0, 1.25, 2.2, 0.9);
  hb(rig, -0.75, 0, 0.9, 0.75, 1.0, 4.6);
  return finishRig(rig, 'm16', 'm16');
}

// recuperator (top) and buffer (bottom) piston rods: from the ring's lugs into the housing and the trough
const RODS = [[-0.1, 0.42], [0.1, 0.42], [-0.1, -0.36], [0.1, -0.36]];

// What lies under the breech in root space at z: the axle box and housing forward of the trail, the well's floor in
// its front part, then the trail's deck sloping down to its end.
function floorAt(z) {
  if (z < TRAIL.z0) return Math.max(0.79, Math.abs(z) < 0.16 ? WY + Math.sqrt(0.0256 - z * z) : 0); // the box, the housing's flanges
  if (z < TRAIL.well - 0.03) return TRAIL.floor + 0.02;
  const k = Math.min(1, (z - TRAIL.z0) / (TRAIL.z1 - TRAIL.z0));
  return TRAIL.top0 + (TRAIL.top1 - TRAIL.top0) * k + 0.03;
}
// The longest run back (m) at elevation e that keeps the ring 6 cm over floorAt: its side silhouette (and the lugs
// and the wedge's crank on its rear face) sampled on a grid, since the well's back wall and the deck's edge can
// catch the rear face between its corners.
const RING_PTS = [];
for (let h = RG.bot - 0.1; h <= RG.top + 0.17; h += 0.05) for (let d = RING0; d <= BR + 0.16; d += 0.06) {
  const inLug = (h < RG.bot || h > RG.top) && d < RING0 + 0.15, inRing = h >= RG.bot && h <= RG.top && d <= BR;
  const crank = h >= RG.bot && h <= 0.35 && d > BR && d <= BR + 0.16;
  if (inLug || inRing || crank) RING_PTS.push([h, d]);
}
function recoilRoom(e) {
  const c = Math.cos(e), s = Math.sin(e);
  let best = 0;
  for (let r = 0; r <= 1.15 + 1e-6; r += 0.01) {
    let ok = true;
    for (const [h, d] of RING_PTS) {
      const dd = d + r, y = TR.y + h * c - dd * s, z = TR.z + h * s + dd * c;
      if (y < floorAt(z) + 0.06) { ok = false; break; }
    }
    if (!ok) break;
    best = r;
  }
  return best;
}

// A small handwheel (axis X, handle toward +X): rim, five spokes, boss and handle.
function hwheel(R) {
  const g = [new THREE.TorusGeometry(R, 0.014, 5, 22).rotateY(Math.PI / 2), xTube(-0.04, 0.04, 0.032, 0.028, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.009, 4)); }
  g.push(xTube(0, 0.07, 0.01, 0.01, 6, R, 0), xTube(0.07, 0.12, 0.017, 0.017, 6, R, 0));
  return mergeAll(g);
}

// ---------------------------------------------------------------- the wheel
// A steel wheel at (x, WY, 0), axis X, `side` the way its hub faces: a wide tyre, a riveted felloe, ten flat
// pressed spokes widening to the rim, a big hub with a riveted plate and cap; the girdle: twelve hinged shoes with
// two cleats each, linked round the tyre.
function steelWheel(P, x, side) {
  const R = WR, tw = 0.16, at = (g) => g.translate(x, WY, 0);
  P.add('dark', at(ring(R - 0.035, R, -tw / 2, tw / 2, 48)));
  P.add('camo', at(ring(R - 0.11, R - 0.035, -tw * 0.4, tw * 0.4, 44)));
  const rv = [];
  for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU; rv.push(V(side * tw * 0.4, Math.cos(a) * (R - 0.07), Math.sin(a) * (R - 0.07))); }
  P.add('camo', at(rivets(rv, V(side, 0, 0), 0.014)), { tint: RIV });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.1;
    const sp = frontProfile([[-0.05, 0.2], [0.05, 0.2], [0.075, R - 0.1], [-0.075, R - 0.1]], -0.012, 0.012); // a flat spoke along +Y
    P.add('camo', at(sp.rotateY(Math.PI / 2).rotateX(-a).translate(side * 0.01, 0, 0)));
    P.add('camo', at(box(0.06, R - 0.32, 0.018, 0, (R + 0.08) / 2, 0).rotateX(-a))); // its rib, across the spoke
  }
  P.add('camo', at(xTube(-0.13, 0.13, 0.2, 0.19, 24)));
  P.add('camo', at(xTube(side * 0.02, side * 0.05, 0.25, 0.25, 28)));
  const hr = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; hr.push(V(side * 0.05, Math.cos(a) * 0.21, Math.sin(a) * 0.21)); }
  P.add('camo', at(rivets(hr, V(side, 0, 0), 0.016)), { tint: RIV });
  P.add('dark', at(xTube(side * 0.14, side * 0.24, 0.1, 0.07, 14)));
  P.add('steel', at(xTube(side * 0.24, side * 0.26, 0.05, 0.04, 10)));
  // the girdle (Radgürtel): shoes on the tyre, each with two cleats, joined by hinge pins
  const n = 12, gw = 0.36, chord = (TAU * (R + GIRD / 2)) / n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), r0 = R + GIRD * 0.5;
    P.add('rust', at(box(gw, GIRD * 0.6, chord * 0.86, 0, ca * r0, sa * r0, a)));
    for (const d of [-0.22, 0.22]) {
      const b = a + d * (chord / r0) * 0.9, rr = R + GIRD * 0.85;
      P.add('dark', at(box(gw * 0.94, GIRD * 0.5, 0.03, 0, Math.cos(b) * rr, Math.sin(b) * rr, b)));
    }
    const h = a + Math.PI / n;
    P.add('steel', at(xTube(-gw * 0.45, gw * 0.45, 0.012, 0.012, 6, Math.cos(h) * (R + GIRD * 0.3), Math.sin(h) * (R + GIRD * 0.3))));
  }
}

// ---------------------------------------------------------------- the trail
// A box trail between the cheeks' feet and the float at its end. Its front part is a well (side walls and a floor
// plate low down) the breech drops into at high elevation; behind it the deck with two braced hatch covers, the arched
// opening for the spade lever, the step plates on the sides; the float across the end with the handspike sockets and
// two handles, the spade under it, the lunette beam beyond.
function trail(P) {
  const T = TRAIL, L = T.z1 - T.z0;
  const at = (k) => ({ z: T.z0 + L * k, top: T.top0 + (T.top1 - T.top0) * k, bot: T.bot0 + (T.bot1 - T.bot0) * k, w: T.w0 + (T.w1 - T.w0) * k });
  const A = at(0), Bn = at(1), kw = (T.well - T.z0) / L, W = at(kw);
  for (const s of [-1, 1]) {
    const wall = (q) => [V(s * q.w, q.bot, q.z), V(s * q.w, q.top, q.z), V(s * (q.w - 0.025), q.top, q.z), V(s * (q.w - 0.025), q.bot, q.z)];
    P.add('camo', loft([wall(A), wall(Bn)]));
    for (const [y0, y1] of [['top', 1], ['bot', -1]]) {
      const fl = (q) => [V(s * (q.w + 0.04), q[y0], q.z), V(s * (q.w - 0.07), q[y0], q.z), V(s * (q.w - 0.07), q[y0] - y1 * 0.018, q.z), V(s * (q.w + 0.04), q[y0] - y1 * 0.018, q.z)];
      P.add('camo', loft([fl(A), fl(Bn)]));
    }
    const pts = [];
    for (let k = 0.015; k < 0.99; k += 0.02) { const q = at(k); pts.push(V(s * (q.w + 0.001), q.top - 0.035, q.z), V(s * (q.w + 0.001), q.bot + 0.035, q.z)); }
    P.add('camo', rivets(pts, V(s, 0, 0), 0.011), { tint: RIV });
    for (const k of [0.25, 0.45, 0.65, 0.85]) { const q = at(k); P.add('camo', box(0.012, q.top - q.bot - 0.04, 0.06, s * (q.w + 0.006), (q.top + q.bot) / 2, q.z)); }
    // the perforated step plate on its brackets just behind the wheel
    const q = at(0.2), sx = s * (q.w + 0.19);
    P.add('dark', box(0.32, 0.012, 0.36, sx, q.bot + 0.05, q.z));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) P.add('char', new THREE.CircleGeometry(0.018, 6).rotateX(-Math.PI / 2).translate(sx + (i - 1.5) * 0.07, q.bot + 0.057, q.z + (j - 1.5) * 0.08));
    for (const dz of [-0.14, 0.14]) P.add('dark', rod(V(s * q.w, q.bot + 0.2, q.z + dz), V(sx, q.bot + 0.05, q.z + dz), 0.014, 5));
  }
  // the well: its floor plate low down, a transom closing it at the back; the deck plate from there to the float
  P.add('camo', box(A.w * 2 - 0.05, 0.02, T.well - T.z0, 0, T.floor, (T.z0 + T.well) / 2));
  P.add('camo', box(W.w * 2 - 0.05, W.top - T.floor - 0.02, 0.03, 0, (W.top + T.floor) / 2, T.well));
  const deck = (q) => [V(-q.w, q.top - 0.012, q.z), V(q.w, q.top - 0.012, q.z), V(q.w, q.top, q.z), V(-q.w, q.top, q.z)];
  P.add('camo', loft([deck(W), deck(at(0.97))]));
  P.add('camo', loft([deck(W).map((v) => v.clone().setY(W.bot)), deck(Bn).map((v) => v.clone().setY(Bn.bot))]));
  // the well's side walls carried down to its floor
  for (const s of [-1, 1]) P.add('camo', loft([[V(s * A.w, T.floor, A.z), V(s * A.w, A.bot, A.z), V(s * (A.w - 0.025), A.bot, A.z), V(s * (A.w - 0.025), T.floor, A.z)],
    [V(s * W.w, T.floor, W.z), V(s * W.w, W.bot, W.z), V(s * (W.w - 0.025), W.bot, W.z), V(s * (W.w - 0.025), T.floor, W.z)]]));
  // two hatch covers with their X-braces and hasps, the arched opening behind them
  for (const [k0, k1] of [[0.4, 0.52], [0.56, 0.68]]) {
    const q0 = at(k0), q1 = at(k1), w = Math.min(q0.w, q1.w) - 0.07, slope = Math.atan2(q0.top - q1.top, q1.z - q0.z);
    const zc = (q0.z + q1.z) / 2, yc = (q0.top + q1.top) / 2 + 0.012, len = q1.z - q0.z;
    P.add('camo', box(w * 2, 0.012, len, 0, yc, zc, slope));
    for (const sg of [-1, 1]) P.add('camo', box(0.03, 0.02, Math.hypot(w * 2, len) * 0.92, 0, yc + 0.012, zc, slope, Math.atan2(w * 2, len) * sg, 0));
    P.add('dark', box(0.05, 0.03, 0.04, 0, yc + 0.02, q0.z + 0.04, slope));
  }
  const qa = at(0.78), sl = Math.atan2(T.top0 - T.top1, L);
  P.add('char', frontProfile([[-0.14, 0], [0.14, 0], [0.14, 0.2], [0.1, 0.27], [0, 0.3], [-0.1, 0.27], [-0.14, 0.2]], 0, 0.004).rotateX(-Math.PI / 2 + sl).translate(0, qa.top + 0.002, qa.z + 0.15));
  P.add('dark', rod(V(0.08, qa.top, qa.z), V(0.1, qa.top + 0.55, qa.z - 0.12), 0.018, 6)); // the spade's lever, standing up
  // the float across the end, the handspike sockets and handles, the spade under it, the lunette beam
  const e = Bn, fz = e.z - 0.15;
  P.add('camo', box(1.5, 0.06, 0.42, 0, 0.05, fz));
  P.add('camo', box(1.5, 0.1, 0.03, 0, 0.1, fz + 0.2));
  for (const s of [-1, 1]) {
    P.add('camo', loft([[V(s * e.w, 0.08, fz - 0.2), V(s * 0.74, 0.08, fz - 0.2), V(s * 0.74, 0.08, fz + 0.2), V(s * e.w, 0.08, fz + 0.2)], [V(s * e.w, e.top, fz - 0.2), V(s * (e.w + 0.02), e.top, fz - 0.2), V(s * (e.w + 0.02), e.top, fz + 0.2), V(s * e.w, e.top, fz + 0.2)]]));
    P.add('dark', loft([[V(s * 0.3 - 0.07, e.top, fz - 0.07), V(s * 0.3 + 0.07, e.top, fz - 0.07), V(s * 0.3 + 0.07, e.top, fz + 0.07), V(s * 0.3 - 0.07, e.top, fz + 0.07)],
      [V(s * 0.3 - 0.11, e.top + 0.2, fz - 0.15), V(s * 0.3 + 0.11, e.top + 0.2, fz - 0.15), V(s * 0.3 + 0.11, e.top + 0.2, fz + 0.03), V(s * 0.3 - 0.11, e.top + 0.2, fz + 0.03)]], { top: false }));
    P.add('steel', rod(V(s * 0.62, 0.12, fz + 0.18), V(s * 0.66, 0.42, fz + 0.1), 0.017, 6));
    P.add('steel', rod(V(s * 0.66, 0.42, fz + 0.1), V(s * 0.72, 0.5, fz - 0.05), 0.017, 6));
    P.add('steel', rod(V(s * 0.45, 0.1, fz - 0.1), V(s * 0.5, 0.3, fz - 0.15), 0.017, 6));
    P.add('steel', rod(V(s * 0.5, 0.3, fz - 0.15), V(s * 0.58, 0.32, fz - 0.05), 0.017, 6));
  }
  const spade = frontProfile([[-0.6, 0.05], [0.6, 0.05], [0.55, -0.22], [0.2, -0.36], [-0.2, -0.36], [-0.55, -0.22]], 0, 0.03);
  P.add('camo', spade.translate(0, 0, -0.015).rotateX(0.2).translate(0, 0.04, fz - 0.24));
  P.add('camo', box(0.14, 0.12, 0.9, 0, 0.25, e.z + 0.38));
  P.add('camo', rivetRow(V(0, 0.311, e.z + 0.0), V(0, 0.311, e.z + 0.8), 0.06, V(0, 1, 0), 0.012), { tint: RIV });
  P.add('dark', new THREE.TorusGeometry(0.08, 0.024, 6, 16).rotateX(Math.PI / 2).translate(0, 0.25, e.z + 0.92));
}

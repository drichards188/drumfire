import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, gearArc, zLathe, rivets, rivetRow, rivetPoly, handwheel, shellGeometry, DEG } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, L90, R90, ring, TAU } from '../../t/fieldkit.js';
import { FParts } from '../../t/mats.js';
import { buildShell, buildCartridge } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';
import { mulberry32 } from '../../../noise.js';

/**
 * The 35.5 cm Haubitze M1 (Rheinmetall, 1939) in firing order: buildHM1({ scheme }), and its emplacement:
 * buildHM1Site(seed).
 *
 * Based on (no local reference photos): en.wikipedia "35.5 cm Haubitze M1" (an enlarged 24 cm K 3; 75 t in action;
 * a two-part box carriage with dual recoil, the barrel recoiling in a ring cradle and the top carriage on the
 * bottom carriage; 6 degrees on the carriage and all round on the platform; +45 to +75 degrees; six loads (cradle,
 * barrel, top carriage, bottom carriage, front platform and turntable, rear platform) behind 18 t half-tracks, a
 * seventh towing the gantry crane that set it up in about two hours; electric elevation and ammunition hoist from a
 * generator, both with hand drives too; 575 kg Betongranate, four charges), armedconflicts.com (barrel 10,269 mm,
 * L/28.9, crew 20) and en.wikipedia "24 cm Kanone 3" (the same carriage idea: a long box lower carriage on a front
 * turntable, its rear end on the rear platform). Proportions where nothing is given are estimates at the K 18's
 * scale (k18.js) blown up for the bigger gun, the crew's stations at a man's heights.
 *
 * The gun: the round front platform with its racer and centre pivot carries the long box lower carriage, whose rear
 * end rides on a roller bogie along the curved track of the rear platform (here an arc of 80 degrees, wider than the
 * sim's arc). The tall top carriage slides back on the lower carriage's rails at the shot; its cheeks hold the ring
 * cradle with the two recoil cylinders over the barrel and the recuperator under it, the two big equilibrators
 * outside. Galleries for the layer and the traverser either side of the top carriage, a raised loading platform
 * behind the breech for the rammers, and on its right the shell crane on its post: it lifts the shell off the trolley
 * on the ground beside the carriage and swings it onto the loading tray hooked on the breech ring. The trolley and
 * the crane ride round with the carriage. The gun loads at zero elevation (rig.loadEl 0).
 *
 * Rig (DESIGN.md "Models"): origin on the ground at the platform's centre, front -Z. `traverse` the lower carriage
 * (turns about the pivot), `carriage` the top carriage slide (+ back), `elevation` at the trunnions, `recoil` the
 * barrel, `breech` the sliding block (+X), `loadTray` the loading tray hinged at its lip (setTray 0 on, 1 off),
 * `crane` the jib (a child of the root, kept over its post by setTraverse; rotation.y: rig.craneRest over the trolley,
 * the tray's bearing over the tray), `hoist` the hook block on the jib at (-craneR, y, 0), position.y its height above
 * the ground (rig.hoistRange.up raised, .down at the trolley); the rope follows in rig.update.
 */
const G = {
  kind: 'hm1', L: 10.27, bore: 0.1778,
  // [distance from the muzzle, radius]: a plain thick muzzle with a lip, the chase, the collar 3.7 m back, the
  // jacket swelling to the breech ring
  prof: [[0, 0.272], [0.05, 0.3], [0.16, 0.3], [0.2, 0.288], [3.65, 0.318], [3.65, 0.37], [3.82, 0.37], [3.87, 0.355], [7.4, 0.395], [9.3, 0.425]],
  ring: { len: 0.97, w: 1.06, h: 1.0 }, recoil: 1.4,
};
const SHELL = (() => { try { buildShell('hm1'); buildCartridge('hm1'); return 'hm1'; } catch { return 'bertha'; } })();
const TRY = 3.55, TRZ = 0; // trunnion axis above the platform's centre
const BR = 1.9; // the breech face behind the trunnions
const RAIL = 1.62; // top of the lower carriage's slide rails
const CX = 0.88; // the girders' and cheeks' half spacing
const FOOT = 2.0; // the layer's and the traverser's galleries
const DECK = 2.45; // the loading platform behind the breech
const DZ0 = 3.3, DZ1 = 7.05, DW = 1.65; // the loading platform's front, rear and half width
const PR = 2.5; // the front platform's radius
const RA = 7.75; // the rear platform's arc track (radius of its middle)
const Z0 = -3.6, Z1 = 8.35; // the lower carriage's ends
const CR = { z0: -1.85, z1: 1.15, r: 0.64 }; // the ring cradle
const CYL = { x: 0.31, y: 0.8, r: 0.17, z0: -1.75, z1: 1.1 }; // recoil cylinders over the barrel (and the one under it)
const EQ = { x: 1.13, lo: [2.15, -1.95], up: [0.45, -0.55] };
const CARRIAGE_RECOIL = 0.7;
// the crane: its post on the loading platform's right, the jib's reach, the hook's heights and the shell's hang
const CRANE = { x: 1.45, z: 4.0, R: 1.96, top: 6.15 };
const HANG = 1.1, PICK_Y = 0.8, UP = 5.7;

export function buildHM1({ scheme = 'feldgrau' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const MZ = -(G.L - BR), ring0 = BR - G.ring.len;
  const rAt = (s) => {
    const p = G.prof;
    for (let i = 1; i < p.length; i++) if (s <= p[i][0]) { const [a, ra] = p[i - 1], [b, rb] = p[i]; return b > a ? ra + (rb - ra) * (s - a) / (b - a) : rb; }
    return p[p.length - 1][1];
  };

  // ---- the platforms (root): the round front platform (a ribbed steel base with the racer and the centre pivot,
  // anchored by pickets) and the rear platform's curved track (two rails on steel sleepers, an arc either side of the
  // line, the end stops), both bedded on the levelled ground
  const F = rig.part();
  F.add('dark', yTube(0, 0.1, PR, PR, 64));
  F.add('dark', ring(PR - 0.09, PR, 0, 0.2, 64).rotateZ(Math.PI / 2));
  F.add('steel', ring(1.86, 2.02, 0.1, 0.26, 64).rotateZ(Math.PI / 2)); // the racer
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    F.add('dark', box(0.07, 0.11, 1.3, sa * 1.05, 0.15, ca * 1.05, 0, a, 0));
    F.add('dark', box(0.07, 0.1, 0.4, sa * 2.25, 0.15, ca * 2.25, 0, a, 0));
  }
  F.add('dark', yTube(0.1, 0.36, 0.45, 0.42, 28));
  F.add('steel', yTube(0.36, 0.58, 0.16, 0.15, 18));
  F.add('dark', rivets(Array.from({ length: 16 }, (_, i) => V(Math.sin(i * TAU / 16) * 0.38, 0.361, Math.cos(i * TAU / 16) * 0.38)), V(0, 1, 0), 0.02));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12 + 1 / 24) * TAU, x = Math.sin(a) * (PR + 0.1), z = Math.cos(a) * (PR + 0.1);
    F.add('dark', box(0.2, 0.06, 0.2, x, 0.13, z, 0, a, 0));
    F.add('steel', yTube(-0.1, 0.28, 0.035, 0.035, 6, x, z));
    F.add('steel', yTube(0.26, 0.32, 0.06, 0.06, 8, x, z));
  }
  const A0 = 40 * DEG; // the arc track's half width
  for (const [r0, key] of [[RA - 0.55, 'steel'], [RA + 0.55, 'steel']]) {
    const n = 40, g = new THREE.Shape(), w = 0.07;
    for (let i = 0; i <= n; i++) { const a = -A0 + (2 * A0 * i) / n; g.lineTo(Math.sin(a) * (r0 + w), Math.cos(a) * (r0 + w)); }
    for (let i = n; i >= 0; i--) { const a = -A0 + (2 * A0 * i) / n; g.lineTo(Math.sin(a) * (r0 - w), Math.cos(a) * (r0 - w)); }
    F.add(key, new THREE.ExtrudeGeometry(g, { depth: 0.13, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.28, 0));
  }
  for (let i = 0; i <= 16; i++) {
    const a = -A0 + (2 * A0 * i) / 16, sa = Math.sin(a), ca = Math.cos(a);
    F.add('dark', box(1.6, 0.15, 0.32, sa * RA, 0.075, ca * RA, 0, a, 0)); // a steel sleeper
    for (const s of [-1, 1]) F.add('dark', box(0.2, 0.04, 0.26, sa * (RA + s * 0.55), 0.17, ca * (RA + s * 0.55), 0, a, 0));
  }
  for (const s of [-1, 1]) {
    const a = s * (A0 + 1.5 * DEG), sa = Math.sin(a), ca = Math.cos(a);
    F.add('dark', box(1.5, 0.45, 0.3, sa * RA, 0.3, ca * RA, 0, a, 0)); // end stop
  }
  F.build(root, { dirt: 0.9 });

  // ---- lower carriage (traverse): two deep riveted box girders, the slide rails, the pivot housing and roller
  // pieces on the racer, the rear bogie on the arc track, the side galleries, the raised loading platform, the
  // crane's post, the shell trolley on the ground beside it
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const gir = [[Z0, 1.0], [Z0, RAIL - 0.02], [Z1 - 0.5, RAIL - 0.02], [Z1, 1.45], [Z1, 0.95], [Z1 - 1.6, 0.66], [-2.2, 0.66], [Z0 + 0.3, 1.0]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(gir, 0.32).translate(s * CX, 0, 0));
    T.add('camo', box(0.42, 0.03, Z1 - Z0 - 0.5, s * CX, RAIL - 0.035, (Z0 + Z1 - 0.5) / 2));
    T.add('steel', box(0.14, 0.025, 6.0, s * CX, RAIL + 0.01, -0.1)); // the top carriage's rail
    T.add('camo', box(0.42, 0.03, Z1 - 1.6 + 2.2, s * CX, 0.645, (Z1 - 1.6 - 2.2) / 2));
    const xo = s * (CX + 0.161);
    T.add('camo', rivetRow(V(xo, RAIL - 0.08, Z0 + 0.1), V(xo, RAIL - 0.08, Z1 - 0.6), 0.17, V(s, 0, 0), 0.019));
    T.add('camo', rivetRow(V(xo, 0.72, -2.1), V(xo, 0.72, Z1 - 1.7), 0.17, V(s, 0, 0), 0.019));
    for (let z = -3.0; z < Z1 - 0.3; z += 1.15) {
      const bot = z < -2.2 ? 0.66 + (0.34 * (-2.2 - z)) / (-2.2 - Z0 - 0.3) : z > Z1 - 1.6 ? 0.66 + (0.29 * (z - Z1 + 1.6)) / 1.6 : 0.66;
      T.add('camo', box(0.025, RAIL - 0.08 - bot, 0.09, s * (CX + 0.172), (RAIL - 0.08 + bot) / 2, z));
    }
  }
  T.add('camo', box(CX * 2 - 0.32, 0.6, 0.16, 0, 1.3, Z0 + 0.08)); // front transom
  T.add('camo', box(CX * 2 - 0.32, 0.12, 0.4, 0, 0.66, -1.6)); // lower transom over the front roller piece
  for (const z of [3.6, 5.2, 6.8]) T.add('camo', box(CX * 2 - 0.32, 0.7, 0.12, 0, 1.1, z));
  T.add('camo', box(CX * 2 + 0.42, 0.62, 0.1, 0, 1.2, Z1 + 0.05)); // rear end plate
  T.add('camo', yTube(0.4, 0.7, 0.32, 0.34, 24)); // the pivot housing on the platform's pin
  T.add('camo', box(CX * 2 - 0.32, 0.16, 0.36, 0, 0.62, 0));
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const R = 1.94, x = Math.sin(a) * R, z = -Math.cos(a) * R, ry = Math.PI / 2 - a, tx = Math.cos(a), tz = Math.sin(a);
    T.add('camo', box(0.32, 0.18, 0.56, x, 0.42, z, 0, ry, 0));
    for (const k of [-1, 1]) T.add('steel', xTube(-0.11, 0.11, 0.075, 0.075, 12).rotateY(ry).translate(x + tx * 0.17 * k, 0.335, z + tz * 0.17 * k));
    if (Math.abs(x) > 0.1) T.add('camo', rod(V(x * 0.97, 0.48, z), V(Math.sign(x) * CX, 0.7, z * 0.6 - 0.15), 0.07, 8));
  }
  // the rear bogie: a cross beam under the carriage's end and four flanged rollers on the two rails (radial axles)
  {
    const bz = RA;
    T.add('camo', box(1.6, 0.3, 0.6, 0, 0.62, bz));
    for (const s of [-1, 1]) {
      T.add('camo', box(0.2, 0.44, 0.9, s * 0.55, 0.52, bz));
      for (const dz of [-0.28, 0.28]) {
        T.add('steel', xTube(s * 0.55 - 0.08, s * 0.55 + 0.08, 0.13, 0.13, 16, 0.42, bz + dz));
        T.add('dark', xTube(s * 0.55 - 0.1, s * 0.55 - 0.08, 0.16, 0.16, 16, 0.42, bz + dz));
      }
    }
    T.add('camo', rod(V(-CX, 0.95, bz - 0.4), V(-0.55, 0.7, bz), 0.06, 8));
    T.add('camo', rod(V(CX, 0.95, bz - 0.4), V(0.55, 0.7, bz), 0.06, 8));
  }
  // the electric motors of the elevating gear and the traverse (the generator's cables come in at the rear)
  T.add('camo', rbox(0.5, 0.45, 0.7, 0.04, -(CX + 0.45), RAIL + 0.23, -2.6));
  T.add('dark', xTube(-(CX + 0.7), -(CX + 0.75), 0.15, 0.15, 14, RAIL + 0.23, -2.6));
  T.add('camo', rbox(0.46, 0.4, 0.6, 0.04, CX + 0.42, 1.1, Z1 - 1.1));
  T.add('dark', rod(V(CX + 0.6, 0.9, Z1 - 0.8), V(CX + 0.9, 0.05, Z1 + 0.4), 0.03, 6)); // cable
  // the side galleries (layer left, traverser right) beside the top carriage, on brackets off the girders, with
  // their rails, the steps up to the loading platform and the ladders down
  for (const s of [-1, 1]) {
    grating(T, s * (CX + 0.18), s * 2.0, -0.7, DZ0, FOOT);
    for (const z of [-0.6, 1.3, 3.2]) T.add('camo', rod(V(s * (CX + 0.17), RAIL - 0.4, z), V(s * 1.95, FOOT - 0.07, z), 0.035, 6));
    for (const z of [-0.65, 1.0]) T.add('camo', yTube(FOOT, FOOT + 0.95, 0.02, 0.02, 6, s * 1.97, z));
    T.add('camo', zTube(-0.65, 1.0, 0.022, 0.022, 6, s * 1.97, FOOT + 0.95));
    for (const z of [-0.65]) T.add('camo', xTube(s * (CX + 0.2), s * 1.97, 0.022, 0.022, 6, FOOT + 0.95, z));
    // ladder from the gallery's middle down to the ground
    const lz0 = 1.75, lz1 = 2.55;
    for (const z of [lz0, lz1]) T.add('camo', rod(V(s * 2.0, FOOT - 0.03, z), V(s * 2.65, 0, z), 0.024, 6));
    for (let k = 1; k <= 5; k++) { const t = k / 6; T.add('camo', box(0.1, 0.025, lz1 - lz0, s * (2.0 + 0.65 * t), FOOT * (1 - t), (lz0 + lz1) / 2)); }
  }
  // the loading platform: a deck on a riveted box over the girders behind the top carriage's run, its rails, the
  // steps up from the galleries, the ladder down at the rear, the charge rack on the left
  T.add('camo', box(DW * 2, 0.05, DZ1 - DZ0, 0, DECK - 0.025, (DZ0 + DZ1) / 2));
  for (let z = DZ0 + 0.2; z < DZ1 - 0.1; z += 0.32) T.add('camo', box(DW * 2 - 0.1, 0.012, 0.03, 0, DECK + 0.006, z));
  for (const s of [-1, 1]) {
    T.add('camo', box(0.06, DECK - RAIL, DZ1 - DZ0, s * (CX + 0.19), (DECK + RAIL) / 2, (DZ0 + DZ1) / 2));
    T.add('camo', rivetRow(V(s * (CX + 0.221), DECK - 0.08, DZ0 + 0.1), V(s * (CX + 0.221), DECK - 0.08, DZ1 - 0.1), 0.17, V(s, 0, 0), 0.017));
    for (const z of [DZ0 + 0.2, (DZ0 + DZ1) / 2, DZ1 - 0.2]) T.add('camo', rod(V(s * (CX + 0.19), RAIL - 0.3, z), V(s * (DW - 0.05), DECK - 0.06, z), 0.04, 6));
    T.add('camo', box(0.08, 0.1, DZ1 - DZ0, s * (DW - 0.04), DECK - 0.07, (DZ0 + DZ1) / 2));
    // steps from the gallery (FOOT) up to the platform
    for (let k = 1; k <= 2; k++) T.add('camo', box(0.8, 0.03, 0.22, s * 1.55, FOOT + (DECK - FOOT) * k / 3, DZ0 - 0.3 + 0.18 * k));
  }
  for (const z of [DZ0 + 1.2, DZ1 - 0.05]) T.add('camo', yTube(DECK, DECK + 0.95, 0.022, 0.022, 6, -DW + 0.04, z));
  T.add('camo', zTube(DZ0 + 1.2, DZ1 - 0.05, 0.024, 0.024, 6, -DW + 0.04, DECK + 0.95));
  T.add('camo', xTube(-DW + 0.04, -0.6, 0.024, 0.024, 6, DECK + 0.95, DZ1 - 0.05));
  for (const x of [-DW + 0.04, -0.6]) T.add('camo', yTube(DECK, DECK + 0.95, 0.022, 0.022, 6, x, DZ1 - 0.05));
  for (const x of [0.25, 0.95]) T.add('camo', rod(V(x, DECK - 0.03, DZ1), V(x, 0, DZ1 + 0.95), 0.025, 6));
  for (let k = 1; k <= 7; k++) { const t = k / 8; T.add('camo', box(0.76, 0.03, 0.1, 0.6, DECK * (1 - t), DZ1 + 0.95 * t)); }
  // the charge rack at the platform's left rear: a frame with the brass cases lying in it
  {
    const rx = -1.25, rz = 6.35;
    for (const dz of [-0.45, 0.45]) for (const dx of [-0.22, 0.22]) T.add('camo', yTube(DECK, DECK + 0.9, 0.025, 0.025, 6, rx + dx, rz + dz));
    for (const y of [DECK + 0.3, DECK + 0.62]) for (const dx of [-0.22, 0.22]) T.add('camo', zTube(rz - 0.45, rz + 0.45, 0.02, 0.02, 6, rx + dx, y));
    for (const y of [DECK + 0.42, DECK + 0.74]) for (const dx of [-0.11, 0.11]) T.add('brass', xTube(rx - 0.4, rx + 0.4, 0.105, 0.105, 14, y, rz + dx * 3));
  }
  // the crane's post on the platform's right: a riveted tubular column on a foot flange, braced to the deck, the
  // hand winch on its rear (the electric hoist's motor above it)
  {
    const { x, z, top } = CRANE;
    T.add('camo', yTube(DECK, top, 0.15, 0.13, 18, x, z));
    T.add('camo', yTube(DECK, DECK + 0.08, 0.3, 0.3, 18, x, z));
    T.add('camo', rivets(Array.from({ length: 10 }, (_, i) => V(x + Math.sin(i * TAU / 10) * 0.24, DECK + 0.081, z + Math.cos(i * TAU / 10) * 0.24)), V(0, 1, 0), 0.018));
    for (const [dx, dz] of [[0.0, 0.85], [-0.75, 0.25]]) T.add('camo', rod(V(x + dx, DECK + 0.02, z + dz), V(x, DECK + 1.5, z), 0.04, 8));
    T.add('camo', box(0.36, 0.34, 0.26, x, DECK + 1.05, z + 0.25)); // winch gearbox
    T.add('dark', xTube(x - 0.21, x + 0.21, 0.13, 0.13, 16, DECK + 1.05, z + 0.25)); // drum
    T.add('steel', rod(V(x + 0.21, DECK + 1.05, z + 0.25), V(x + 0.32, DECK + 0.9, z + 0.42), 0.017, 6)); // crank
    T.add('camo', rbox(0.3, 0.38, 0.32, 0.03, x, DECK + 1.6, z + 0.22)); // motor
    T.add('steel', yTube(top - 0.06, top + 0.02, 0.17, 0.17, 18, x, z)); // slewing ring
  }
  // the shell trolley on the ground at the crane's pick-up, on a short length of light track (pushed round with the
  // carriage), the next shell lying on its chocks (crews.js draws it)
  {
    const px = CRANE.x + CRANE.R, pz = CRANE.z;
    for (const s of [-1, 1]) T.add('steel', box(0.06, 0.08, 3.2, px + s * 0.3, 0.04, pz + 0.2));
    for (let k = -1; k <= 1; k++) T.add('timber', box(0.95, 0.07, 0.18, px, 0.035, pz + 0.2 + k * 1.2));
    T.add('camo', box(0.62, 0.08, 1.4, px, 0.4, pz));
    for (const s of [-1, 1]) for (const dz of [-0.5, 0.5]) {
      T.add('dark', xTube(px + s * 0.3 - 0.04, px + s * 0.3 + 0.04, 0.13, 0.13, 14, 0.2, pz + dz));
      T.add('camo', box(0.06, 0.2, 0.18, px + s * 0.24, 0.3, pz + dz));
    }
    for (const dz of [-0.4, 0.4]) for (const s of [-1, 1]) T.add('timber', box(0.14, 0.14, 0.22, px + s * 0.17, 0.5, pz + dz, 0, 0, s * 0.5));
    T.add('steel', rod(V(px, 0.42, pz + 0.7), V(px, 0.95, pz + 1.3), 0.022, 6)); // draw bar
  }
  T.build(trav, { dirt: 0.55 });

  // ---- top carriage (slides back on the rails at the shot): tall riveted cheeks, trunnion bearings, slide shoes,
  // the front transom and the rear box, the handwheels, the sight, the equilibrators' lower brackets
  const car = pivotAt(rig, trav, 'carriage', 0, 0, 0);
  const C = rig.part();
  const cheek = [[-2.3, RAIL + 0.06], [2.45, RAIL + 0.06], [2.45, 2.12], [1.7, 2.25], [1.05, 3.08], [0.68, TRY + 0.12],
    [0.4, TRY + 0.42], [-0.4, TRY + 0.42], [-0.72, TRY + 0.12], [-1.55, 2.75], [-2.3, 2.15]];
  for (const s of [-1, 1]) {
    C.add('camo', sideProfile(cheek, 0.065).translate(s * CX, 0, 0));
    C.add('camo', rivetPoly(cheek, (z, y) => V(s * (CX + 0.033), y, z), 0.06, 0.16, V(s, 0, 0), 0.019));
    for (let i = 2; i < cheek.length - 1; i++) {
      const [z1, y1] = cheek[i], [z2, y2] = cheek[i + 1], L = Math.hypot(z2 - z1, y2 - y1), a = Math.atan2(y2 - y1, z2 - z1);
      C.add('camo', box(0.15, 0.028, L + 0.02, s * CX, (y1 + y2) / 2, (z1 + z2) / 2, -a, 0, 0));
    }
    for (const z of [-1.8, -1.0, 0.9, 1.5, 2.1]) {
      const top = topAt(cheek, z) - 0.03;
      C.add('camo', box(0.04, top - RAIL - 0.1, 0.06, s * (CX + 0.05), (top + RAIL + 0.1) / 2, z));
    }
    C.add('dark', box(0.26, 0.06, 4.6, s * CX, RAIL + 0.04, 0.07)); // slide shoes
    C.add('camo', xTube(s * (CX - 0.02), s * (CX + 0.16), 0.3, 0.3, 28, TRY, TRZ)); // trunnion bearing
    C.add('camo', box(0.18, 0.11, 0.7, s * (CX + 0.07), TRY + 0.3, TRZ));
    for (const z of [-0.27, 0.27]) C.add('steel', yTube(TRY + 0.35, TRY + 0.4, 0.03, 0.03, 6, s * (CX + 0.07), TRZ + z));
    C.add('camo', rivets(Array.from({ length: 10 }, (_, i) => V(s * (CX + 0.161), TRY + Math.sin(i * TAU / 10) * 0.23, TRZ + Math.cos(i * TAU / 10) * 0.23)), V(s, 0, 0), 0.024));
    C.add('camo', box(0.3, 0.2, 0.26, s * (EQ.x - 0.08), EQ.lo[0], EQ.lo[1]));
    C.add('steel', xTube(s * (CX + 0.04), s * (EQ.x + 0.12), 0.045, 0.045, 8, EQ.lo[0], EQ.lo[1]));
  }
  C.add('camo', box(CX * 2 - 0.1, 0.62, 0.16, 0, RAIL + 0.38, -2.22)); // front transom
  C.add('camo', box(CX * 2 - 0.1, 0.46, 0.85, 0, RAIL + 0.29, 2.0)); // rear box over the slide (clear of the breech at 75)
  C.add('camo', rivetRow(V(-0.7, RAIL + 0.521, 1.6), V(0.7, RAIL + 0.521, 1.6), 0.15, V(0, 0, -1), 0.018));
  C.add('dark', box(1.2, 0.1, 0.22, 0, RAIL + 0.25, 2.5)); // buffer stop
  C.add('steel', xTube(-(CX - 0.02), -(CX - 0.18), 0.08, 0.08, 12, TRY - 1.17, TRZ - 0.1)); // the elevating pinion
  for (const s of [-1, 1]) {
    C.add('camo', box(0.17, 0.3, 0.32, s * (CX + 0.12), FOOT + 1.12, 0.65));
    C.add('steel', xTube(s * (CX + 0.2), s * (CX + 0.28), 0.028, 0.028, 8, FOOT + 1.12, 0.65));
    C.add('dark', handwheel(0.21, 6, 0.018, 0.04, 1).rotateY(s < 0 ? Math.PI : 0).translate(s * (CX + 0.28), FOOT + 1.12, 0.65));
  }
  C.add('camo', xTube(-(CX + 0.03), -(CX + 0.13), 0.16, 0.16, 22, TRY - 0.6, TRZ + 0.28)); // elevation scale drum
  C.add('dark', xTube(-(CX + 0.13), -(CX + 0.14), 0.13, 0.13, 22, TRY - 0.6, TRZ + 0.28));
  const sy = FOOT + 1.46;
  C.add('camo', box(0.34, 0.07, 0.11, -(CX + 0.25), sy - 0.035, 0.45));
  C.add('camo', box(0.07, 0.36, 0.11, -(CX + 0.11), sy - 0.18, 0.38));
  C.add('dark', box(0.11, 0.11, 0.11, -(CX + 0.4), sy - 0.01, 0.45));
  panoramicSight(C, -(CX + 0.41), sy, 0.45, -1);
  C.build(car, { dirt: 0.35 });

  // ---- the ring cradle: a riveted steel sleeve with flanges, the two recoil cylinders over the barrel on saddles and
  // the recuperator under it, the trunnions, the equilibrator arms, the elevating arc on the left
  const el = pivotAt(rig, car, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  E.add('camo', zTube(CR.z0, CR.z1, CR.r, CR.r, 36));
  for (const z of [CR.z0, CR.z1 - 0.1, -0.35]) E.add('camo', zTube(z, z + 0.1, CR.r + 0.06, CR.r + 0.06, 36));
  for (const z of [CR.z0 + 0.05, CR.z1 - 0.05]) E.add('camo', rivets(Array.from({ length: 20 }, (_, i) => V(Math.cos(i * TAU / 20) * (CR.r + 0.061), Math.sin(i * TAU / 20) * (CR.r + 0.061), z)), V(0, 0, z < 0 ? -1 : 1), 0.02));
  E.add('camo', zRing(rAt(-MZ + CR.z0) + 0.006, CR.r, CR.z0 - 0.04, CR.z0 + 0.02, 36));
  E.add('camo', zRing(rAt(-MZ + CR.z1) + 0.006, CR.r, CR.z1 - 0.02, CR.z1 + 0.04, 36));
  for (const s of [-1, 1]) {
    E.add('steel', xTube(s * (CR.r - 0.05), s * (CX + 0.16), 0.15, 0.15, 20)); // trunnion
    E.add('camo', xTube(s * (CX + 0.14), s * (CX + 0.3), 0.17, 0.17, 18));
    E.add('camo', rod(V(s * EQ.x, 0, 0), V(s * EQ.x, EQ.up[0], EQ.up[1]), 0.075, 8));
    E.add('steel', xTube(s * (CX + 0.12), s * (EQ.x + 0.12), 0.045, 0.045, 8, EQ.up[0], EQ.up[1]));
    // the recoil cylinders over the barrel
    E.add('camo', zTube(CYL.z0, CYL.z1, CYL.r, CYL.r, 22, s * CYL.x, CYL.y));
    E.add('camo', zTube(CYL.z0 - 0.06, CYL.z0 + 0.04, CYL.r + 0.03, CYL.r + 0.03, 22, s * CYL.x, CYL.y));
    E.add('camo', zTube(CYL.z0 - 0.28, CYL.z0 - 0.06, 0.12, 0.13, 16, s * CYL.x, CYL.y));
    E.add('camo', zTube(CYL.z1, CYL.z1 + 0.09, 0.1, 0.09, 12, s * CYL.x, CYL.y));
  }
  for (const z of [-1.4, -0.35, 0.75]) E.add('camo', box(0.95, CYL.y - CR.r + 0.02, 0.2, 0, (CYL.y + CR.r) / 2 - 0.05, z)); // saddles
  E.add('camo', zTube(CYL.z0 + 0.15, CYL.z1, 0.19, 0.19, 22, 0, -CYL.y)); // the recuperator under the barrel
  E.add('camo', zTube(CYL.z0 - 0.15, CYL.z0 + 0.15, 0.14, 0.2, 16, 0, -CYL.y));
  for (const z of [-1.2, 0.6]) E.add('camo', box(0.36, CYL.y - CR.r + 0.08, 0.18, 0, -(CYL.y + CR.r) / 2 + 0.05, z));
  E.add('steel', yTube(CYL.y + CYL.r - 0.02, CYL.y + CYL.r + 0.06, 0.03, 0.03, 6, CYL.x, -0.9)); // filler plugs
  E.add('steel', yTube(CYL.y + CYL.r - 0.02, CYL.y + CYL.r + 0.06, 0.03, 0.03, 6, -CYL.x, -0.9));
  E.add('camo', gearArc(1.02, 1.17, 15 * DEG, 100 * DEG, 0.07, 26, 0.04).translate(-(CR.r + 0.1), 0, 0));
  E.add('camo', gearArc(0.62, 1.02, 15 * DEG, 100 * DEG, 0.035).translate(-(CR.r + 0.07), 0, 0));
  E.build(el, { dirt: 0.2, y0: TRY });

  // ---- the barrel: bore, the profile, the bands, the breech ring and its front wall round the chamber, the lugs the
  // recoil rods are made fast to
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  const ch = G.bore * 1.1, pts = [[MZ, G.bore]];
  for (const [s, r] of G.prof) pts.push([MZ + s, r]);
  pts.push([ring0 + 0.01, G.prof[G.prof.length - 1][1]], [ring0 + 0.01, ch]);
  B.add('camo', zLathe(pts, 44));
  B.add('dark', zLathe([[MZ + 0.9, G.bore], [MZ, G.bore]], 24));
  B.add('char', new THREE.CircleGeometry(G.bore, 24).rotateY(Math.PI).translate(0, 0, MZ + 0.9));
  B.add('dark', zLathe([[ring0 + 0.01, ch], [ring0 - 1.2, ch]], 24));
  B.add('char', new THREE.CircleGeometry(ch, 24).translate(0, 0, ring0 - 1.2));
  const rj = G.prof[G.prof.length - 1][1];
  B.add('camo', zRing(rj - 0.01, rj + 0.03, ring0 - 0.22, ring0 - 0.02, 36));
  const { len: rl, w: rw, h: rh } = G.ring, rz = ring0 + rl / 2, fw = 0.2;
  B.add('camo', rbox(rw, rh * 0.22, rl, 0.03, 0, rh * 0.39, rz));
  B.add('camo', rbox(rw, rh * 0.22, rl, 0.03, 0, -rh * 0.39, rz));
  B.add('camo', box(rw * 0.22, rh * 0.56, rl, -rw * 0.39, 0, rz));
  {
    const x0 = -rw * 0.28, x1 = rw * 0.5, y0 = rh * 0.28, f = new THREE.Shape();
    f.moveTo(x0, -y0); f.lineTo(x1, -y0); f.lineTo(x1, y0); f.lineTo(x0, y0); f.lineTo(x0, -y0);
    const hole = new THREE.Path();
    hole.absarc(0, 0, ch, 0, TAU, true);
    f.holes.push(hole);
    B.add('camo', new THREE.ExtrudeGeometry(f, { depth: fw, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, ring0));
    B.add('dark', zLathe([[ring0 + fw, ch], [ring0, ch]], 24));
  }
  for (const s of [-1, 1]) {
    B.add('camo', box(0.16, CYL.y + 0.06 - rh * 0.5, 0.26, s * CYL.x, (CYL.y + 0.06 + rh * 0.5) / 2, ring0 + 0.14));
    B.add('steel', zTube(CYL.z1 - G.recoil - 0.1, ring0, 0.06, 0.06, 10, s * CYL.x, CYL.y));
  }
  B.add('camo', box(0.2, CYL.y + 0.06 - rh * 0.5, 0.26, 0, -(CYL.y + 0.06 + rh * 0.5) / 2, ring0 + 0.14));
  B.add('steel', zTube(CYL.z1 - G.recoil - 0.1, ring0, 0.07, 0.07, 10, 0, -CYL.y));
  B.add('dark', box(0.06, 0.06, 0.2, rw * 0.5 + 0.03, rh * 0.4, BR - 0.15)); // firing lever bracket
  B.add('steel', rod(V(rw * 0.5 + 0.04, rh * 0.4, BR - 0.06), V(rw * 0.5 + 0.1, rh * 0.52, BR + 0.1), 0.016, 5));
  B.build(rc, { dirt: 0.12, y0: TRY });

  const brk = pivotAt(rig, rc, 'breech', rw * 0.11, 0, ring0 + fw + (rl - fw) / 2);
  const K = rig.part();
  K.add('camo', box(rw * 0.78 - 0.005, rh * 0.56 - 0.005, rl - fw - 0.005, 0, 0, 0));
  K.add('dark', zTube((rl - fw) / 2 - 0.01, (rl - fw) / 2 + 0.04, 0.07, 0.065, 14, -rw * 0.11, 0)); // firing lock
  K.add('dark', box(0.1, 0.12, 0.07, rw * 0.3, -rh * 0.12, (rl - fw) / 2 + 0.03));
  K.add('steel', rod(V(rw * 0.3, -rh * 0.12, (rl - fw) / 2 + 0.06), V(rw * 0.42, rh * 0.08, (rl - fw) / 2 + 0.36), 0.022, 6)); // crank
  K.add('dark', xTube(rw * 0.4, rw * 0.47, 0.035, 0.035, 8, rh * 0.08, (rl - fw) / 2 + 0.36));
  K.build(brk, { dirt: 0 });
  slidingBlock(rig, brk, rw * 0.78);
  const block = rig.setBreech;
  rig.setBreech = (k) => { block(k); rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25))); };

  // ---- the loading tray: hooked on the breech ring for the shell and the charges, lifted off before the block
  // shuts; on only at the loading elevation (as the K 18's)
  rig.loadEl = 0;
  const sh = buildShell(SHELL), sr = sh.radius, yb = -rh * 0.28;
  const tp = pivotAt(rig, rc, 'loadTray', 0, yb, BR - 0.05);
  const R = rig.part(), tw = sr + 0.04, tl = sh.length * 0.8 + 0.14, fy = -sr - yb, z0 = 0.06, z1 = z0 + tl;
  R.add('camo', box(tw * 2, 0.018, tl, 0, fy - 0.009, z0 + tl / 2));
  R.add('dark', box(tw * 2 - 0.05, 0.014, z0 + 0.014, 0, 0.007, (z0 + 0.014) / 2));
  R.add('dark', box(tw * 2 - 0.05, fy, 0.016, 0, fy / 2, z0 + 0.008));
  for (const z of [z0 + tl * 0.35, z1 - 0.07]) R.add('dark', box(tw * 2 - 0.02, 0.035, 0.05, 0, fy - 0.035, z));
  for (const s of [-1, 1]) {
    R.add('camo', box(0.016, 0.1, tl, s * tw, fy + 0.035, z0 + tl / 2, 0, 0, s * -0.35));
    R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tl * 0.3), V(s * (tw + 0.1), fy - 0.03, z0 + tl * 0.32), 0.014, 5));
    R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tl * 0.7), V(s * (tw + 0.1), fy - 0.03, z0 + tl * 0.68), 0.014, 5));
    R.add('steel', rod(V(s * (tw + 0.1), fy - 0.03, z0 + tl * 0.32), V(s * (tw + 0.1), fy - 0.03, z0 + tl * 0.68), 0.014, 5));
  }
  R.build(tp, { dirt: 0.05, y0: TRY });
  const TIP = 0.55;
  let trayK = 1;
  const placeTray = () => {
    const on = trayK < 0.98 && Math.abs(el.rotation.x - rig.loadEl) < 0.01;
    tp.visible = on;
    tp.rotation.x = on ? -TIP * trayK : 0;
    tp.scale.setScalar(on ? 1 : 1e-3);
  };
  rig.setTray = (k) => { trayK = Math.min(1, Math.max(0, k)); placeTray(); };
  rig.setTray(1);

  // ---- the crane's jib and hook (root frame: the jib slews about its post, which rides the carriage)
  const crane = pivotAt(rig, root, 'crane', CRANE.x, 0, CRANE.z);
  const J = rig.part(), jy = UP + 0.42, jr = CRANE.R;
  J.add('camo', yTube(CRANE.top + 0.02, jy + 0.32, 0.17, 0.17, 18)); // the slewing head
  J.add('camo', box(jr + 0.35, 0.26, 0.2, -(jr + 0.35) / 2 + 0.1, jy + 0.13, 0)); // the jib, a box girder
  J.add('camo', rod(V(0, CRANE.top - 0.55, 0), V(-jr * 0.65, jy, 0), 0.06, 8)); // the strut under it
  J.add('camo', rivetRow(V(-jr, jy + 0.13, 0.101), V(0, jy + 0.13, 0.101), 0.15, V(0, 0, 1), 0.014));
  J.add('dark', xTube(-jr - 0.07, -jr + 0.07, 0.11, 0.11, 14, jy, 0)); // the sheave at the jib head
  J.add('camo', box(0.06, 0.3, 0.26, -jr - 0.1, jy + 0.05, 0));
  J.add('camo', box(0.3, 0.22, 0.3, 0.22, jy + 0.1, 0)); // the counterweight box
  J.build(crane, { dirt: 0.25, y0: 0 });
  const hoist = pivotAt(rig, crane, 'hoist', -jr, UP, 0);
  const H = rig.part();
  H.add('dark', box(0.16, 0.26, 0.24, 0, 0, 0)); // the hook block
  H.add('steel', xTube(-0.09, 0.09, 0.08, 0.08, 12));
  H.add('dark', new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI * 1.4).rotateZ(Math.PI * 0.8).translate(0, -0.24, 0)); // the hook
  H.add('dark', box(0.9, 0.07, 0.07, 0, -0.42, 0, 0, Math.PI / 2, 0)); // the spreader bar (along the shell)
  for (const dz of [-0.4, 0.4]) H.add('rope', rod(V(0, -0.2, 0), V(0, -0.42, dz), 0.012, 4));
  for (const dz of [-0.4, 0.4]) H.add('rope', yTube(-HANG + 0.42 - 0.18, -0.42, 0.01, 0.01, 4, 0, dz)); // the slings down to the shell
  H.build(hoist, { dirt: 0, y0: UP });
  const rope = strutMesh(crane, rig.mats.chain ?? rig.mats.dark, 0.014, 5);
  rope.geometry.translate(0, -1, 0);
  rope.position.set(-jr, jy - 0.05, 0);
  crane.rotation.y = -Math.PI; // over the trolley

  // ---- equilibrators
  const mats = rig.mats;
  const struts = [-1, 1].map((s) => ({
    outer: strutMesh(car, mats.camo, 0.17, 18), inner: strutMesh(car, mats.steel, 0.07, 10),
    a: new THREE.Vector3(s * EQ.x, EQ.lo[0], EQ.lo[1]), lug: new THREE.Vector3(s * EQ.x, EQ.up[0], EQ.up[1]), b: new THREE.Vector3(),
  }));
  const placeStruts = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of struts) {
      q.b.set(q.lug.x, el.position.y + q.lug.y * c - q.lug.z * sn, el.position.z + q.lug.y * sn + q.lug.z * c);
      aimStrut(q, 1.9);
    }
  };
  const placeRope = () => {
    rope.scale.y = Math.max(0.05, jy - 0.05 - hoist.position.y);
    hoist.rotation.y = trav.rotation.y - crane.rotation.y; // the spreader lies along the carriage, as the shell
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeStruts(); placeTray(); };
  rig.setTraverse = (az) => {
    trav.rotation.y = az;
    // the jib stays over its post (which rides the carriage), and its rest over the trolley, which rides too. It rests
    // at -PI, so its swing to the tray turns forward of the post over the right gallery, away from the rammers
    const c = Math.cos(az), s = Math.sin(az);
    crane.position.set(CRANE.x * c + CRANE.z * s, 0, -CRANE.x * s + CRANE.z * c);
    rig.craneRest = -Math.PI + az;
    rig.pickYaw = az;
  };
  rig.update = () => { placeStruts(); placeTray(); placeRope(); };
  placeStruts();

  // ---- dual recoil (the barrel's stroke cut at high elevation so the ring clears the pivot housing between the
  // girders)
  rig.recoilLength = G.recoil;
  rig.carriageRecoil = CARRIAGE_RECOIL;
  const tail = Math.max(rw, rh) / 2, drop = TRY - 0.78;
  const fade = (e) => {
    if (e <= 0.02) return 1;
    const room = (drop - tail * Math.cos(e)) / Math.sin(e) - BR;
    return Math.min(1, Math.max(0.12, room / rig.recoilLength));
  };
  rig.setRecoil = (k) => {
    const t = Math.min(1, Math.max(0, k));
    rc.position.z = Math.pow(t, 0.75) * rig.recoilLength * fade(el.rotation.x);
    car.position.z = t * t * rig.carriageRecoil;
  };

  // ---- the crane's contract for render/crews.js (as the 15-inch's and the Bertha's)
  rig.hoistRange = { up: UP, down: PICK_Y + HANG };
  rig.hoistHang = HANG;
  rig.pickY = PICK_Y;
  rig.staffLen = 3.4;

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 4.4, 4.2);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.07);
  rig.anchors.shellStack = node(trav, 'shellStack', CRANE.x + CRANE.R, PICK_Y, CRANE.z);
  trayShells(rig, node(tp, 'shell-tray', 0, -yb - sr - 0.02, z0 + 0.05), SHELL);
  rig.slideMats = ['camo', 'steel', 'char'];

  // fourteen men (the sim's pool; the detachment was about twenty): the Geschützführer, the layer and the traverser on
  // their galleries, the man at the firing lever, two loaders at the tray who steady the shell as it comes down, four
  // rammers on the loading platform, the crane's winch man at his post, the signaller on the ground, the sling man at
  // the trolley, the charge man at the rack. The crane men and the trolley ride round with the carriage (world: false)
  const spot = (role, x, y, z, heading, pose, world) => rig.anchors.crew.push({ role, x, y, z, heading, pose, ...(world != null ? { world } : {}) });
  spot('sergeant', -4.4, 0, 1.6, L90, 'point');
  spot('layer', -(CX + 0.66), FOOT, 0.55, L90, 'lay');
  spot('traverser', CX + 0.66, FOOT, 0.55, R90, 'operate');
  spot('lanyard', CX + 0.75, FOOT, 2.4, R90, 'lanyard');
  spot('loader1', -0.82, DECK, DZ0 + 0.3, 0, 'stand');
  spot('loader2', 0.82, DECK, DZ0 + 0.3, 0, 'stand');
  spot('rammer1', -0.36, DECK, 5.25, 0, 'ram');
  spot('rammer2', 0.36, DECK, 5.25, 0, 'ram');
  spot('rammer3', -0.36, DECK, 6.05, 0, 'ram');
  spot('rammer4', 0.36, DECK, 6.05, 0, 'ram');
  spot('crane1', CRANE.x - 0.05, DECK, CRANE.z + 0.8, 0, 'operate', false);
  spot('crane2', CRANE.x + CRANE.R + 0.2, 0, CRANE.z - 2.2, Math.PI, 'signal', false);
  spot('ammo1', CRANE.x + CRANE.R + 0.95, 0, CRANE.z + 0.3, R90, 'stand', false);
  spot('ammo2', -1.2, DECK, 5.55, Math.PI, 'stand', false);

  hb(rig, -2.0, 0, -3.8, 2.0, 4.0, 3.3);
  hb(rig, -2.0, 0, 3.3, 2.0, DECK + 1, 8.5);
  hb(rig, CRANE.x + CRANE.R - 0.5, 0, CRANE.z - 0.8, CRANE.x + CRANE.R + 0.5, 1.0, CRANE.z + 0.8);
  rig.setTraverse(0);
  rig.update();
  return finishRig(rig, 'hm1', SHELL);
}

// ================================================================ the emplacement
// buildHM1Site(seed) => { root }: the position round the gun in the rig's frame at zero traverse, ground y = 0 (put it
// where the rig's root is, turned with it). The ground scraped level and the spoil banked into a horseshoe parapet
// round the sides and the front (beyond the barrel's sweep at the loading elevation: 9 m and +-38 degrees), its inner
// face revetted with planks and posts; the gravel pad under the platforms; the ammunition store (a timber dugout under
// earth for the 575 kg shells, the shells waiting on skids at its door), the charge store, the narrow-gauge line from
// the store to the trolley's place; the gantry crane that set the gun up, parked behind the rear platform on its
// rails with the generator trailer beside it; camouflage nets on poles over the rear of the position and the stores
// (never over the gun's sweep); the crew's dugout and the battery commander's post on the left.
export function buildHM1Site(seed = 1) {
  const P = new FParts('feldgrau');
  const rnd = mulberry32(3301 + (seed | 0) * 13);
  const j = (a) => (rnd() - 0.5) * a;
  const root = new THREE.Group();
  root.name = 'hm1-site';

  // the gravel pad and the scraped ground
  P.add('earth', yTube(-0.04, 0.01, 11.5, 11.8, 40, 0, 2.5));
  // the horseshoe parapet: from the left rear round the front to the right rear, sloped both ways, plank revetment
  // on its inner face held by posts
  {
    const R0 = 13.0, R1 = 17.0, a0 = -125 * DEG, a1 = 125 * DEG, n = 28;
    for (let i = 0; i < n; i++) {
      const aa = a0 + ((a1 - a0) * i) / n, ab = a0 + ((a1 - a0) * (i + 1)) / n, am = (aa + ab) / 2;
      const end = Math.min(1, (a1 - Math.abs(am)) / (14 * DEG));
      const h = (2.0 + 0.3 * Math.sin(i * 1.3 + seed) + j(0.25)) * (0.25 + 0.75 * end);
      const pts = [[R0 - 0.1, -0.05], [R0 + 0.5, h], [R0 + 1.9, h + 0.15], [R1, -0.05]];
      P.add('soil', new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 2, Math.PI + aa, ab - aa), { tint: [0xffffff, 0xe6ddcc, 0xd6ccba][i % 3] });
      const r = R0 + 0.22, x = -Math.sin(am) * r, z = -Math.cos(am) * r, w = r * (ab - aa) + 0.05;
      P.add('timber', box(w, h * 0.85, 0.06, x, h * 0.42, z, -0.28, -am, 0), { tint: [0xb8b0a0, 0xa89e8c][i % 2] });
      P.add('timber', yTube(0, h * 0.95, 0.07, 0.06, 6, -Math.sin(aa) * (R0 + 0.12), -Math.cos(aa) * (R0 + 0.12)), { tint: 0xa09684 });
    }
  }
  // the ammunition store at the left rear: log walls and roof under a mound, its door toward the gun, shells on skids
  // waiting before it (575 kg each: they go by trolley), the charge store beyond
  {
    const sx = -7.5, sz = 13.5;
    P.add('timber', box(5.0, 2.4, 0.26, sx, 1.2, sz - 2.8), { tint: 0xa89e8c });
    for (const s of [-1, 1]) P.add('timber', box(0.26, 2.4, 5.6, sx + s * 2.5, 1.2, sz));
    for (let k = 0; k < 15; k++) P.add('timber', xTube(sx - 2.7, sx + 2.7, 0.13, 0.13, 7, 2.5, sz - 2.7 + k * 0.38), { tint: 0xb0a690 });
    P.add('soil', sphere(4.0, sx, 2.3, sz + 0.3, 1, 0.4, 1.05, 16));
    P.add('dark', box(1.6, 2.0, 0.05, sx, 1.0, sz - 2.95));
    const sh = shellGeometry(1.45, 0.178, { crh: 2.4 });
    for (let i = 0; i < 4; i++) {
      const x = sx - 1.2 + i * 0.8, z = sz - 4.6;
      for (const dz of [-0.45, 0.45]) P.add('timber', box(0.6, 0.12, 0.16, x, 0.06, z + dz), { tint: 0xc0b6a2 });
      P.add('shell', sh.body.clone().translate(x, 0.3, z), { tint: 0x9aa09a });
      P.add('brass', sh.band.clone().translate(x, 0.3, z));
      P.add('steel', sh.fuze.clone().translate(x, 0.3, z));
    }
    // the charge store: a smaller dugout further back
    P.add('soil', sphere(2.6, -11.5, 0.6, 19.5, 1.2, 0.5, 1, 12));
    P.add('timber', box(1.4, 1.6, 0.22, -11.5, 0.8, 17.3), { tint: 0xa89e8c });
    P.add('dark', box(0.9, 1.3, 0.05, -11.5, 0.7, 17.18));
  }
  // the narrow-gauge line from the store's door round behind the rear platform to the trolley's place on the right
  {
    const pts = [[-7.5, 9.6], [-4.5, 11.0], [0, 11.6], [3.5, 10.4], [5.4, 7.8], [5.6, 5.4]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), h = Math.atan2(x1 - x0, z1 - z0);
      for (const s of [-1, 1]) P.add('steel', box(0.05, 0.07, len + 0.05, (x0 + x1) / 2 + Math.cos(h) * s * 0.3, 0.115, (z0 + z1) / 2 - Math.sin(h) * s * 0.3, 0, h, 0));
      for (let k = 0; k < len; k += 0.6) P.add('timber', box(0.95, 0.08, 0.14, x0 + Math.sin(h) * k, 0.04, z0 + Math.cos(h) * k, 0, h, 0), { tint: 0xd0c8b8 });
    }
  }
  // the gantry crane, parked behind the rear platform on its own rails: two lattice legs on bogies, a plate girder
  // bridge 13 m across and 9 m up, the crab on it, the hoist's motor house on the right leg
  {
    const gz = 15.5, gx = 6.8, gh = 9.0;
    for (const s of [-1, 1]) {
      P.add('dark', box(0.9, 0.5, 3.2, s * gx, 0.45, gz)); // the bogie
      for (const dz of [-1.1, 1.1]) P.add('dark', xTube(s * gx - 0.5, s * gx + 0.5, 0.28, 0.28, 14, 0.3, gz + dz));
      for (const dz of [-1.2, 1.2]) P.add('camo', rod(V(s * gx, 0.7, gz + dz), V(s * gx, gh, gz + dz * 0.3), 0.12, 8));
      for (let k = 1; k < 6; k++) {
        const y = 0.7 + ((gh - 0.7) * k) / 6, w = 1.2 - (0.9 * k) / 6;
        P.add('camo', box(0.08, 0.08, w * 2, s * gx, y, gz));
        if (k < 5) P.add('camo', rod(V(s * gx, y, gz - w), V(s * gx, y + (gh - 0.7) / 6, gz + w - 0.15), 0.04, 6));
      }
    }
    P.add('camo', box(gx * 2 + 1.2, 0.9, 0.5, 0, gh + 0.45, gz - 0.35));
    P.add('camo', box(gx * 2 + 1.2, 0.9, 0.5, 0, gh + 0.45, gz + 0.35));
    P.add('camo', rivetRow(V(-gx, gh + 0.2, gz - 0.601), V(gx, gh + 0.2, gz - 0.601), 0.3, V(0, 0, -1), 0.03));
    P.add('camo', box(1.6, 0.8, 1.5, -2.5, gh + 1.3, gz)); // the crab
    P.add('dark', yTube(gh - 1.5, gh, 0.02, 0.02, 4, -2.5, gz - 0.4));
    P.add('dark', box(0.3, 0.35, 0.25, -2.5, gh - 1.7, gz - 0.4));
    P.add('camo', rbox(1.6, 1.4, 1.6, 0.05, gx + 1.3, 1.4, gz)); // motor house
    // its rails, running back from the rear platform (the crane came over the gun on them)
    for (const s of [-1, 1]) for (const dx of [-0.4, 0.4]) P.add('steel', box(0.07, 0.09, 12.0, s * gx + dx, 0.045, gz - 1.0));
  }
  // the generator trailer on the right behind the gantry, its cable to the gun
  {
    const tx = 10.5, tz = 11.0;
    P.add('camo', rbox(1.9, 1.5, 3.4, 0.06, tx, 1.25, tz));
    P.add('dark', box(1.8, 0.2, 3.6, tx, 0.45, tz));
    for (const s of [-1, 1]) for (const dz of [-0.9, 0.9]) P.add('dark', xTube(tx + s * 1.0 - 0.12, tx + s * 1.0 + 0.12, 0.42, 0.42, 16, 0.42, tz + dz));
    P.add('camo', rod(V(tx, 0.45, tz - 1.8), V(tx, 0.4, tz - 3.2), 0.05, 6));
    for (let i = 0; i < 5; i++) P.add('dark', box(0.1, 0.4, 0.04, tx + 0.96, 1.4, tz - 1 + i * 0.5));
    P.add('dark', rod(V(tx - 0.95, 0.4, tz), V(4.5, 0.03, 9.5), 0.035, 6));
  }
  // the crew's dugout and the commander's post on the left, timber left over from the setting up, tool chests
  P.add('soil', sphere(2.6, -10.5, 0.2, 0.0, 1.1, 0.45, 1, 12));
  P.add('timber', box(1.8, 0.28, 1.3, -9.4, 0.14, -0.6));
  P.add('dark', box(1.0, 1.0, 0.05, -9.2, 0.5, -0.1));
  for (let i = 0; i < 6; i++) P.add('timber', box(0.3, 0.3, 4.8, 9.4 + (i % 3) * 0.32, 0.15 + (i > 2 ? 0.3 : 0), -2.5), { tint: 0xc4baa6 });
  for (let i = 0; i < 3; i++) P.add('camo', rbox(1.0, 0.55, 0.55, 0.04, 9.6, 0.28, 2 + i * 1.3));
  for (let k = 0; k < 4; k++) P.add('timber', yTube(0, 3.4, 0.06, 0.05, 6, -14 - k * 6, 3 + k * 0.6), { tint: 0xa09684 });
  // the camouflage nets over the rear (the stores, the gantry, the generator) on poles: two sagging sheets
  {
    const polesAt = [[-12, 9], [-3.5, 9.5], [-12, 20], [-3.5, 20.5], [3.5, 18.5], [12.5, 18.5], [3.5, 8.6], [12.5, 8.6]];
    for (const [x, z] of polesAt) P.add('timber', yTube(0, 4.4, 0.08, 0.06, 7, x, z), { tint: 0xb4aa94 });
    P.add('net', netSheet(rnd, -12.3, -3.2, 8.8, 20.8, 4.3));
    P.add('net', netSheet(rnd, 3.2, 12.8, 8.3, 18.8, 4.2));
  }
  P.build(root, { dirt: 0.6 });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root };
}

// a sagging net sheet over [x0, x1] x [z0, z1], its corners at height top
function netSheet(rnd, x0, x1, z0, z1, top) {
  const nx = 14, nz = 10, g = new THREE.PlaneGeometry(1, 1, nx, nz), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
    const sag = 0.45 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) + (rnd() - 0.5) * 0.1;
    p.setXYZ(i, x0 + (x1 - x0) * u, top - sag, z0 + (z1 - z0) * v);
  }
  g.computeVertexNormals();
  return g;
}

// The height of a [z, y] outline's top edge at z.
function topAt(poly, z) {
  let b = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    if ((a[0] - z) * (c[0] - z) <= 0 && a[0] !== c[0]) b = Math.max(b, a[1] + ((c[1] - a[1]) * (z - a[0])) / (c[0] - a[0]));
  }
  return b;
}

// An annulus about the Z axis between radii rIn and rOut over z0..z1.
function zRing(rIn, rOut, z0, z1, seg = 28) {
  const pts = [[rIn, z0], [rOut, z0], [rOut, z1], [rIn, z1], [rIn, z0]].map(([r, z]) => new THREE.Vector2(r, z));
  return new THREE.LatheGeometry(pts, seg).rotateX(Math.PI / 2);
}

// A grated walkway between x0 and x1, z0 and z1, its top at y.
function grating(P, x0, x1, z0, z1, y) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), w = xb - xa, xc = (xa + xb) / 2, len = z1 - z0, zc = (z0 + z1) / 2;
  for (const x of [xa + 0.025, xb - 0.025]) P.add('camo', box(0.05, 0.08, len, x, y - 0.04, zc));
  for (const z of [z0 + 0.025, z1 - 0.025]) P.add('camo', box(w, 0.08, 0.05, xc, y - 0.04, z));
  for (let i = 1; i < 4; i++) P.add('camo', box(0.012, 0.05, len - 0.05, xa + (w * i) / 4, y - 0.025, zc));
  for (let zz = z0 + 0.09; zz < z1 - 0.05; zz += 0.09) P.add('camo', box(w - 0.06, 0.02, 0.022, xc, y - 0.01, zz));
}

// One equilibrator tube: a unit cylinder from the origin up +Y, with the attributes the field materials expect.
function strutMesh(parent, mat, r, seg) {
  const g = new THREE.CylinderGeometry(r, r, 1, seg).translate(0, 0.5, 0);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(2.6), 1));
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
const _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function aimStrut(q, outerLen) {
  _d.copy(q.b).sub(q.a);
  const len = _d.length();
  _d.divideScalar(len || 1);
  for (const m of [q.outer, q.inner]) {
    m.position.copy(q.a);
    m.quaternion.setFromUnitVectors(_up, _d);
  }
  q.outer.scale.set(1, Math.min(len * 0.95, outerLen), 1);
  q.inner.scale.set(1, len, 1);
}

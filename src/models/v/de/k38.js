import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, zLathe, rivets, rivetRow, rivetPoly, handwheel, DEG } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, L90, R90, ring, TAU } from '../../t/fieldkit.js';
import { buildShell, buildCartridge } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * The 21 cm Kanone 38 (Krupp, 1939/40) in firing order: buildK38({ scheme }).
 *
 * Based on (no local reference photos): en.wikipedia "21 cm Kanone 38" (11.62 m barrel, L/55.5, 211 mm, horizontal
 * sliding block, 25.3 t in action, 0 to +50 degrees, 17 degrees on the carriage and all round on the platform, two
 * loads: barrel and carriage, the carriage slung between two limbers by the inclined undersurfaces of its ends and
 * winched down onto its platform, a central platform held by three jacks; 120 kg K Gr 38, three cased charges), the
 * Krupp film stills of the K 38 battery on the Hillersleben range, and the gun's kinship with Krupp's Mörserlafette
 * (k18.js: the same dual recoil, the top carriage sliding on the lower carriage's rails, the panoramic sight on the
 * left cheek, the loose loading tray hooked on the breech ring). The K 38 is a bigger, heavier gun on the same idea
 * but with no road wheels of its own in action: the long box carriage lies low on its round turntable platform, its
 * two ends turned up underneath where the limbers took them, the trail end on a float with a traversing roller. The
 * proportions where no source gives them are estimates scaled from the K 18 (about 1.25 times), with the crew's
 * stations at the K 18's heights.
 *
 * Rig (DESIGN.md "Models", "WW2 mode"): origin on the ground at the platform's centre, front -Z. `traverse` the lower
 * carriage (turns on the platform's pivot), `carriage` the top carriage slide (position.z, + back), `elevation` at the
 * trunnions, `recoil` the barrel, `breech` the sliding block (+X), `loadTray` the loading tray hinged at its lip
 * (setTray: 0 on in line with the bore, 1 lifted off). setRecoil(k) drives both slides (rig.recoilLength the barrel's,
 * rig.carriageRecoil the top carriage's), the barrel's stroke cut at high elevation so the ring clears the platform.
 */
const G = {
  kind: 'k38', L: 11.62, bore: 0.1055,
  // [distance from the muzzle, radius]: a plain muzzle with a slight swell, the long chase, the jacket's shoulder
  // 4.7 m back with a collar, the jacket swelling to the breech ring
  prof: [[0, 0.152], [0.04, 0.168], [0.3, 0.162], [4.65, 0.196], [4.65, 0.238], [4.8, 0.238], [4.85, 0.226], [8.5, 0.25], [10.9, 0.272]],
  ring: { len: 0.72, w: 0.7, h: 0.68 }, recoil: 1.3,
};
// the shell and charge models: the K 38's own when shells.js has them, else the Mörser 18's (the same 21 cm)
const SHELL = (() => { try { buildShell('k38'); buildCartridge('k38'); return 'k38'; } catch { return 'mrs18'; } })();
const TRY = 2.45, TRZ = 0.05; // trunnion axis (the bore at zero elevation), above the platform's centre
const BR = 2.25; // the breech face behind the trunnions
const RAIL = 1.16; // top of the lower carriage's slide rails
const DECK = 1.2; // the loading walkways and the deck over the trail
const FOOT = 0.72; // the layer's and the traverser's footplates
const PR = 1.65; // turntable platform radius
const CR = { z0: -1.55, z1: 1.05, hw: 0.4, y0: -0.38, y1: 0.36 }; // the cradle sleeve (elevation frame)
const CYL = { y: 0.58, r: 0.17, z0: -1.4, z1: 1.0 }; // recoil brake and recuperator on top of the cradle
const EQ = { x: 0.84, lo: [1.5, -1.5], up: [0.28, -0.42] }; // equilibrator pivots: top carriage (y, z), cradle arm (y, z)
const CARRIAGE_RECOIL = 0.7;
const CX = 0.6; // the cheeks' and the girders' half spacing
const Z0 = -3.4, Z1 = 7.2; // the lower carriage's ends

export function buildK38({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const MZ = -(G.L - BR), ring0 = BR - G.ring.len;
  const rAt = (s) => {
    const p = G.prof;
    for (let i = 1; i < p.length; i++) if (s <= p[i][0]) { const [a, ra] = p[i - 1], [b, rb] = p[i]; return b > a ? ra + (rb - ra) * (s - a) / (b - a) : rb; }
    return p[p.length - 1][1];
  };

  // ---- the turntable platform: a round ribbed steel base on the levelled ground, its racer ring and centre pivot,
  // three screw jacks on short outriggers that hold it level (the sources' "central platform held by three jacks"),
  // pickets round the rim
  const F = rig.part();
  F.add('dark', yTube(0, 0.08, PR, PR, 56));
  F.add('dark', ring(PR - 0.08, PR, 0, 0.17, 56).rotateZ(Math.PI / 2));
  F.add('steel', ring(1.12, 1.24, 0.08, 0.22, 56).rotateZ(Math.PI / 2)); // the racer
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    F.add('dark', box(0.06, 0.09, 0.78, sa * 0.72, 0.12, ca * 0.72, 0, a, 0));
    F.add('dark', box(0.06, 0.08, 0.3, sa * 1.42, 0.12, ca * 1.42, 0, a, 0));
  }
  F.add('dark', yTube(0.08, 0.26, 0.34, 0.31, 24));
  F.add('steel', yTube(0.26, 0.44, 0.12, 0.11, 16));
  for (let i = 0; i < 3; i++) {
    // an outrigger: a tapered box arm from the rim, a jack housing at its end, the screw and its foot plate
    const a = (i / 3) * TAU + Math.PI / 3, sa = Math.sin(a), ca = Math.cos(a), r1 = PR + 0.85;
    F.add('dark', box(0.26, 0.16, 0.95, sa * (PR + 0.35), 0.1, ca * (PR + 0.35), 0, a, 0));
    F.add('dark', rivetRow(V(sa * (PR - 0.05) - ca * 0.131, 0.12, ca * (PR - 0.05) + sa * 0.131), V(sa * (PR + 0.75) - ca * 0.131, 0.12, ca * (PR + 0.75) + sa * 0.131), 0.12, V(-ca, 0, sa), 0.014));
    F.add('camo', yTube(0.18, 0.72, 0.11, 0.11, 16, sa * r1, ca * r1));
    F.add('steel', yTube(0.05, 0.2, 0.06, 0.06, 10, sa * r1, ca * r1));
    F.add('dark', yTube(0, 0.05, 0.24, 0.26, 16, sa * r1, ca * r1));
    F.add('dark', box(0.08, 0.12, 0.08, sa * r1, 0.78, ca * r1));
    F.add('steel', rod(V(sa * r1, 0.82, ca * r1), V(sa * (r1 + 0.28), 0.82, ca * (r1 + 0.28)), 0.016, 6)); // the crank
    F.add('dark', xTube(-0.05, 0.05, 0.022, 0.022, 6).rotateY(a + Math.PI / 2).translate(sa * (r1 + 0.28), 0.82, ca * (r1 + 0.28)));
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9 + 1 / 18) * TAU, x = Math.sin(a) * (PR + 0.08), z = Math.cos(a) * (PR + 0.08);
    F.add('dark', box(0.17, 0.05, 0.17, x, 0.11, z, 0, a, 0));
    F.add('steel', yTube(-0.1, 0.24, 0.03, 0.03, 6, x, z));
    F.add('steel', yTube(0.22, 0.27, 0.05, 0.05, 8, x, z));
  }
  F.build(root, { dirt: 0.9 });

  // ---- lower carriage (traverse): two deep riveted box girders lying the whole length, their ends turned up
  // underneath (where the limbers took them), the slide rails on top, the pivot housing on the platform's pin and
  // the roller pieces on the racer, transoms clear of the breech's path at high elevation
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const gir = [[Z0, 0.82], [Z0, 1.14], [Z1 - 0.65, 1.14], [Z1, 1.0], [Z1, 0.78], [5.4, 0.46], [-1.75, 0.46], [Z0 + 0.15, 0.82]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(gir, 0.26).translate(s * CX, 0, 0));
    T.add('camo', box(0.34, 0.026, Z1 - Z0 - 0.7, s * CX, 1.153, (Z0 + Z1 - 0.65) / 2)); // top flange
    T.add('steel', box(0.12, 0.022, 7.9, s * CX, RAIL - 0.011 + 0.02, 1.25)); // the top carriage's running rail
    T.add('camo', box(0.34, 0.026, 7.1, s * CX, 0.453, 1.82)); // bottom flange
    const xo = s * (CX + 0.131);
    T.add('camo', rivetRow(V(xo, 1.08, Z0 + 0.1), V(xo, 1.08, Z1 - 0.7), 0.16, V(s, 0, 0), 0.017));
    T.add('camo', rivetRow(V(xo, 0.52, -1.7), V(xo, 0.52, 5.35), 0.16, V(s, 0, 0), 0.017));
    for (const z of [-3.0, -1.9, -0.7, 0.7, 2.0, 3.3, 4.6, 5.9]) {
      const bot = z < -1.75 ? 0.46 + (0.36 * (-1.75 - z)) / (-1.75 - Z0 - 0.15) : z > 5.4 ? 0.46 + (0.32 * (z - 5.4)) / (Z1 - 5.4) : 0.46;
      T.add('camo', box(0.022, 1.1 - bot, 0.08, s * (CX + 0.142), (1.1 + bot) / 2, z)); // stiffeners
    }
    // the inclined undersurfaces' wear plates, where the carriage rode on the limbers' saddles
    T.add('dark', box(0.3, 0.03, 1.72, s * CX, 0.62, -2.62, -0.215, 0, 0));
    T.add('dark', box(0.3, 0.03, 1.86, s * CX, 0.61, 6.3, 0.18, 0, 0));
    // the lifting lugs at both ends and the winch rope eyes
    for (const z of [Z0 + 0.25, Z1 - 0.3]) {
      T.add('camo', box(0.06, 0.22, 0.2, s * (CX + 0.16), 0.98, z));
      T.add('dark', new THREE.TorusGeometry(0.06, 0.018, 6, 12).rotateY(Math.PI / 2).translate(s * (CX + 0.2), 0.98, z));
    }
  }
  T.add('camo', box(CX * 2 - 0.26, 0.42, 0.14, 0, 0.92, Z0 + 0.07)); // front transom
  T.add('camo', box(CX * 2 + 0.26, 0.05, 0.6, 0, 1.14, Z0 + 0.32)); // the front deck plate
  T.add('camo', box(CX * 2 - 0.26, 0.08, 0.3, 0, 0.46, -1.2)); // lower transom carrying the front roller piece
  for (const z of [3.7, 4.9]) T.add('camo', box(CX * 2 - 0.26, 0.5, 0.1, 0, 0.8, z));
  T.add('camo', box(CX * 2 + 0.3, 0.42, 0.07, 0, 0.92, Z1 + 0.03)); // trail end plate
  T.add('camo', box(CX * 2 - 0.26, 0.04, 3.2, 0, 0.5, 5.2)); // trail floor
  T.add('camo', box(CX * 2 + 0.36, 0.04, 2.95, 0, DECK - 0.02, 5.1)); // the deck over the trail behind the top carriage's run
  for (let z = 3.8; z < 6.55; z += 0.3) T.add('camo', box(CX * 2 + 0.2, 0.012, 0.025, 0, DECK + 0.006, z)); // cleats
  for (const s of [-1, 1]) T.add('camo', rivetRow(V(s * (CX + 0.05), DECK + 0.001, 3.7), V(s * (CX + 0.05), DECK + 0.001, 6.5), 0.15, V(0, 1, 0), 0.014));
  // pivot housing on the platform's pin, joined to both girders; three roller pieces on the racer ring
  T.add('camo', yTube(0.3, 0.52, 0.22, 0.24, 20));
  T.add('camo', box(CX * 2 - 0.26, 0.12, 0.26, 0, 0.42, 0));
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const R = 1.18, x = Math.sin(a) * R, z = -Math.cos(a) * R, ry = Math.PI / 2 - a, tx = Math.cos(a), tz = Math.sin(a);
    T.add('camo', box(0.26, 0.14, 0.4, x, 0.37, z, 0, ry, 0));
    for (const k of [-1, 1]) T.add('steel', xTube(-0.09, 0.09, 0.06, 0.06, 12).rotateY(ry).translate(x + tx * 0.12 * k, 0.285, z + tz * 0.12 * k));
    if (Math.abs(x) > 0.1) T.add('camo', rod(V(x * 0.97, 0.4, z), V(Math.sign(x) * CX, 0.48, z * 0.6 - 0.1), 0.055, 8));
  }
  // the front end: the limber's coupling bracket and its pin, the hand-winch drums the carriage was let down with
  T.add('camo', box(0.5, 0.36, 0.4, 0, 0.98, Z0 - 0.18));
  T.add('steel', yTube(0.78, 1.22, 0.06, 0.06, 10, 0, Z0 - 0.3));
  T.add('dark', new THREE.TorusGeometry(0.11, 0.03, 6, 16).rotateX(Math.PI / 2).translate(0, 0.86, Z0 - 0.42));
  for (const s of [-1, 1]) {
    T.add('dark', xTube(s * 0.3, s * 0.52, 0.11, 0.11, 16, 1.3, Z0 + 0.35));
    T.add('steel', xTube(s * 0.24, s * 0.58, 0.035, 0.035, 8, 1.3, Z0 + 0.35));
    T.add('camo', box(0.04, 0.22, 0.26, s * 0.24, 1.25, Z0 + 0.35));
    T.add('camo', box(0.04, 0.22, 0.26, s * 0.58, 1.25, Z0 + 0.35));
  }
  // footplates for the layer (left) and the traverser (right), the grated walkways along both sides with their legs,
  // the ladders at the rear corners
  for (const s of [-1, 1]) {
    grating(T, s * (CX + 0.14), s * 1.6, 0.0, 1.0, FOOT);
    T.add('camo', rod(V(s * (CX + 0.13), 0.55, 0.5), V(s * 1.55, FOOT - 0.06, 0.5), 0.025, 6));
    T.add('camo', yTube(FOOT, DECK, 0.02, 0.02, 6, s * 1.6, 1.0));
    grating(T, s * (CX + 0.14), s * 1.75, 1.0, 6.4, DECK);
    for (const z of [1.2, 3.1, 4.9, 6.2]) {
      T.add('camo', yTube(0, DECK - 0.08, 0.035, 0.035, 8, s * 1.7, z));
      T.add('dark', box(0.14, 0.03, 0.14, s * 1.7, 0.015, z));
      T.add('camo', box(0.06, 0.1, 0.12, s * (CX + 0.16), DECK - 0.1, z)); // hinge
    }
    const lx0 = s * 1.4, lx1 = s * 1.72;
    for (const x of [lx0, lx1]) T.add('camo', rod(V(x, DECK - 0.03, 6.35), V(x, 0, 7.05), 0.022, 6));
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      T.add('camo', box(0.34, 0.025, 0.1, (lx0 + lx1) / 2, DECK * (1 - t), 6.35 + 0.7 * t));
    }
  }
  // the trail end: the float on the ground, the traversing roller in its fork on a screw post, the handspike sockets
  T.add('camo', box(1.7, 0.06, 0.95, 0, 0.03, 6.55));
  for (const [z, a] of [[6.02, -0.6], [7.08, 0.6]]) T.add('camo', box(1.7, 0.05, 0.17, 0, 0.08, z, a, 0, 0));
  for (const x of [-0.62, 0, 0.62]) T.add('camo', box(0.05, 0.12, 0.92, x, 0.12, 6.55));
  for (const s of [-1, 1]) T.add('camo', rod(V(s * 0.45, 0.62, 6.75), V(s * 0.45, 0.14, 6.5), 0.045, 8));
  T.add('camo', yTube(0.2, 0.68, 0.08, 0.08, 14, 0, 7.45));
  T.add('camo', box(0.3, 0.2, 0.3, 0, 0.8, Z1 + 0.1));
  for (const s of [-1, 1]) T.add('camo', box(0.025, 0.24, 0.16, s * 0.09, 0.2, 7.45));
  T.add('dark', ring(0.11, 0.19, -0.05, 0.05, 18).translate(0, 0.19, 7.45));
  T.add('steel', xTube(-0.09, 0.09, 0.025, 0.025, 8, 0.19, 7.45));
  T.add('steel', xTube(-0.2, 0.2, 0.015, 0.015, 6, 0.7, 7.45));
  for (const s of [-1, 1]) T.add('steel', zTube(Z1 - 0.1, Z1 + 0.18, 0.05, 0.05, 10, s * 0.38, 0.9));
  T.add('steel', rod(V(CX + 0.18, 0.86, 2.5), V(CX + 0.18, 0.86, 4.8), 0.028, 6)); // the handspike, stowed
  T.build(trav, { dirt: 0.55 });

  // ---- top carriage (slides back on the rails at the shot): two tall riveted cheeks with the trunnion bearings,
  // the slide shoes, the transoms and the rear box, the handwheels, the sight, the equilibrators' lower brackets
  const car = pivotAt(rig, trav, 'carriage', 0, 0, 0);
  const C = rig.part();
  const cheek = [[-1.75, RAIL + 0.06], [2.9, RAIL + 0.06], [2.9, 1.66], [1.85, 1.66], [1.25, 2.12], [0.66, TRY + 0.09],
    [0.42, TRY + 0.27], [-0.3, TRY + 0.27], [-0.6, TRY + 0.09], [-1.15, 2.12], [-1.75, 1.7]];
  for (const s of [-1, 1]) {
    C.add('camo', sideProfile(cheek, 0.055).translate(s * CX, 0, 0));
    C.add('camo', rivetPoly(cheek, (z, y) => V(s * (CX + 0.028), y, z), 0.05, 0.15, V(s, 0, 0), 0.016));
    for (let i = 2; i < cheek.length - 1; i++) {
      const [z1, y1] = cheek[i], [z2, y2] = cheek[i + 1], L = Math.hypot(z2 - z1, y2 - y1), a = Math.atan2(y2 - y1, z2 - z1);
      C.add('camo', box(0.13, 0.024, L + 0.02, s * CX, (y1 + y2) / 2, (z1 + z2) / 2, -a, 0, 0));
    }
    for (const z of [-1.2, -0.72, 0.8, 1.4, 2.3]) {
      const top = topAt(cheek, z) - 0.03;
      C.add('camo', box(0.035, top - RAIL - 0.08, 0.055, s * (CX + 0.042), (top + RAIL + 0.08) / 2, z));
    }
    C.add('dark', box(0.22, 0.05, 4.6, s * CX, RAIL + 0.045, 0.55)); // slide shoes
    C.add('camo', xTube(s * (CX - 0.02), s * (CX + 0.13), 0.24, 0.24, 24, TRY, TRZ)); // trunnion bearing housing
    C.add('camo', box(0.15, 0.09, 0.56, s * (CX + 0.055), TRY + 0.24, TRZ));
    for (const z of [-0.22, 0.32]) C.add('steel', yTube(TRY + 0.28, TRY + 0.32, 0.026, 0.026, 6, s * (CX + 0.055), TRZ + z));
    C.add('camo', rivets(Array.from({ length: 8 }, (_, i) => V(s * (CX + 0.131), TRY + Math.sin(i * TAU / 8) * 0.18, TRZ + Math.cos(i * TAU / 8) * 0.18)), V(s, 0, 0), 0.021));
    C.add('camo', box(0.26, 0.17, 0.22, s * (EQ.x - 0.07), EQ.lo[0], EQ.lo[1]));
    C.add('steel', xTube(s * (CX + 0.04), s * (EQ.x + 0.1), 0.038, 0.038, 8, EQ.lo[0], EQ.lo[1]));
  }
  C.add('camo', box(CX * 2 - 0.08, 0.5, 0.13, 0, RAIL + 0.32, -1.68)); // front transom
  C.add('camo', box(CX * 2 - 0.08, 0.42, 0.95, 0, RAIL + 0.27, 2.42)); // rear box over the slide
  C.add('camo', rivetRow(V(-0.54, RAIL + 0.481, 1.98), V(0.54, RAIL + 0.481, 1.98), 0.14, V(0, 0, -1), 0.016));
  C.add('dark', box(1.0, 0.08, 0.2, 0, RAIL + 0.24, 2.95)); // buffer stop
  // elevating gear: the pinion on the left cheek meshing with the cradle's arc, the handwheels and gearboxes; the
  // traversing handwheel on the right
  C.add('steel', xTube(-(CX - 0.02), -(CX - 0.16), 0.065, 0.065, 12, TRY - 0.86, TRZ - 0.075));
  for (const s of [-1, 1]) {
    C.add('camo', box(0.15, 0.26, 0.28, s * (CX + 0.11), FOOT + 1.12, 0.6));
    C.add('steel', xTube(s * (CX + 0.18), s * (CX + 0.25), 0.026, 0.026, 8, FOOT + 1.12, 0.6));
    C.add('dark', handwheel(0.19, 6, 0.017, 0.037, 1).rotateY(s < 0 ? Math.PI : 0).translate(s * (CX + 0.25), FOOT + 1.12, 0.6));
  }
  // the elevation scale drum on the left cheek below the trunnion
  C.add('camo', xTube(-(CX + 0.03), -(CX + 0.12), 0.14, 0.14, 20, TRY - 0.46, TRZ + 0.2));
  C.add('dark', xTube(-(CX + 0.12), -(CX + 0.13), 0.11, 0.11, 20, TRY - 0.46, TRZ + 0.2));
  // the panoramic sight on its bracket by the left trunnion, at the layer's eye
  const sy = FOOT + 1.46;
  C.add('camo', box(0.32, 0.06, 0.1, -(CX + 0.24), sy - 0.03, 0.42));
  C.add('camo', box(0.06, 0.32, 0.1, -(CX + 0.11), sy - 0.16, 0.35));
  C.add('dark', box(0.1, 0.1, 0.1, -(CX + 0.38), sy - 0.01, 0.42));
  panoramicSight(C, -(CX + 0.39), sy, 0.42, -1);
  C.build(car, { dirt: 0.35 });

  // ---- cradle: the riveted sleeve, its guide rings, the recoil cylinder on top with the recuperator head, the
  // trunnions and the equilibrator arms, the elevating arc on the left
  const el = pivotAt(rig, car, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  const cl = CR.z1 - CR.z0, cz = (CR.z0 + CR.z1) / 2;
  E.add('camo', box(CR.hw * 2, 0.07, cl, 0, CR.y0 + 0.035, cz));
  E.add('camo', box(CR.hw * 2, 0.07, cl, 0, CR.y1 - 0.035, cz));
  for (const s of [-1, 1]) {
    E.add('camo', box(0.07, CR.y1 - CR.y0, cl, s * (CR.hw - 0.035), (CR.y0 + CR.y1) / 2, cz));
    for (const y of [CR.y0 + 0.03, CR.y1 - 0.03]) E.add('camo', box(0.055, 0.055, cl, s * (CR.hw + 0.02), y, cz));
    for (const y of [0.13, -0.2]) E.add('camo', rivetRow(V(s * (CR.hw + 0.001), y, CR.z0 + 0.1), V(s * (CR.hw + 0.001), y, CR.z1 - 0.1), 0.15, V(s, 0, 0), 0.015));
    E.add('steel', xTube(s * CR.hw, s * (CX + 0.13), 0.12, 0.12, 18)); // trunnion
    E.add('camo', xTube(s * (CX + 0.11), s * (CX + 0.25), 0.13, 0.13, 16));
    E.add('camo', rod(V(s * EQ.x, 0, 0), V(s * EQ.x, EQ.up[0], EQ.up[1]), 0.06, 8));
    E.add('steel', xTube(s * (CX + 0.1), s * (EQ.x + 0.1), 0.038, 0.038, 8, EQ.up[0], EQ.up[1]));
  }
  E.add('camo', zRing(rAt(-MZ + CR.z0) + 0.006, 0.36, CR.z0 - 0.16, CR.z0 + 0.02, 28));
  E.add('camo', zRing(rAt(-MZ + CR.z1) + 0.006, 0.35, CR.z1 - 0.05, CR.z1 + 0.05, 28));
  for (const z of [-1.2, -0.2, 0.85]) {
    E.add('camo', box(0.3, CYL.y - CYL.r - CR.y1 + 0.04, 0.18, 0, (CR.y1 + CYL.y - CYL.r) / 2, z));
    E.add('camo', zTube(z - 0.055, z + 0.055, CYL.r + 0.015, CYL.r + 0.015, 24, 0, CYL.y));
  }
  E.add('camo', zTube(CYL.z0, CYL.z1, CYL.r, CYL.r, 24, 0, CYL.y));
  E.add('camo', zTube(CYL.z0 - 0.05, CYL.z0 + 0.03, CYL.r + 0.03, CYL.r + 0.03, 24, 0, CYL.y));
  E.add('camo', rivets(Array.from({ length: 12 }, (_, i) => V(Math.cos(i * TAU / 12) * (CYL.r + 0.013), CYL.y + Math.sin(i * TAU / 12) * (CYL.r + 0.013), CYL.z0 - 0.05)), V(0, 0, -1), 0.019));
  E.add('camo', zTube(CYL.z0 - 0.34, CYL.z0 - 0.05, 0.135, 0.135, 20, 0, CYL.y));
  E.add('camo', zTube(CYL.z0 - 0.4, CYL.z0 - 0.34, 0.11, 0.135, 12, 0, CYL.y));
  E.add('dark', zTube(CYL.z0 - 0.45, CYL.z0 - 0.4, 0.055, 0.055, 6, 0, CYL.y));
  E.add('camo', zTube(CYL.z1, CYL.z1 + 0.09, 0.095, 0.085, 12, 0, CYL.y));
  E.add('steel', yTube(CYL.y + CYL.r - 0.02, CYL.y + CYL.r + 0.05, 0.026, 0.026, 6, 0, -0.7));
  // the second, smaller recuperator cylinder under the cradle (the K 38's longer stroke)
  E.add('camo', zTube(CR.z0 + 0.2, CR.z1 - 0.15, 0.09, 0.09, 18, 0, CR.y0 - 0.1));
  for (const z of [CR.z0 + 0.4, CR.z1 - 0.35]) E.add('camo', box(0.18, 0.08, 0.12, 0, CR.y0 - 0.03, z));
  E.add('camo', gearArc(0.64, 0.77, 25 * DEG, 100 * DEG, 0.055, 22, 0.032).translate(-(CR.hw + 0.11), 0, 0));
  E.add('camo', gearArc(0.34, 0.64, 25 * DEG, 100 * DEG, 0.028).translate(-(CR.hw + 0.08), 0, 0));
  E.build(el, { dirt: 0.2, y0: TRY });

  // ---- the barrel: recessed bore, the profile, the rear band, the breech ring with the chamber mouth behind the
  // block and the lug the recoil cylinder's piston rod is made fast to
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  const ch = G.bore * 1.12, pts = [[MZ, G.bore]];
  for (const [s, r] of G.prof) pts.push([MZ + s, r]);
  pts.push([ring0 + 0.01, G.prof[G.prof.length - 1][1]], [ring0 + 0.01, ch]);
  B.add('camo', zLathe(pts, 40));
  B.add('dark', zLathe([[MZ + 0.7, G.bore], [MZ, G.bore]], 20));
  B.add('char', new THREE.CircleGeometry(G.bore, 20).rotateY(Math.PI).translate(0, 0, MZ + 0.7));
  B.add('dark', zLathe([[ring0 + 0.01, ch], [ring0 - 1.0, ch]], 20));
  B.add('char', new THREE.CircleGeometry(ch, 20).translate(0, 0, ring0 - 1.0));
  const rj = G.prof[G.prof.length - 1][1];
  B.add('camo', zRing(rj - 0.01, rj + 0.024, ring0 - 0.2, ring0 - 0.02, 32));
  B.add('camo', zRing(rAt(6.2) - 0.005, rAt(6.2) + 0.02, MZ + 6.15, MZ + 6.25, 32)); // the clamp band of the barrel's guides
  const { len: rl, w: rw, h: rh } = G.ring, rz = ring0 + rl / 2, fw = 0.15;
  B.add('camo', rbox(rw, rh * 0.22, rl, 0.025, 0, rh * 0.39, rz));
  B.add('camo', rbox(rw, rh * 0.22, rl, 0.025, 0, -rh * 0.39, rz));
  B.add('camo', box(rw * 0.22, rh * 0.56, rl, -rw * 0.39, 0, rz));
  {
    const x0 = -rw * 0.28, x1 = rw * 0.5, y0 = rh * 0.28, f = new THREE.Shape();
    f.moveTo(x0, -y0); f.lineTo(x1, -y0); f.lineTo(x1, y0); f.lineTo(x0, y0); f.lineTo(x0, -y0);
    const hole = new THREE.Path();
    hole.absarc(0, 0, ch, 0, TAU, true);
    f.holes.push(hole);
    B.add('camo', new THREE.ExtrudeGeometry(f, { depth: fw, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, ring0));
    B.add('dark', zLathe([[ring0 + fw, ch], [ring0, ch]], 20));
  }
  B.add('camo', box(0.18, CYL.y + 0.08 - rh * 0.5, 0.24, 0, (CYL.y + 0.08 + rh * 0.5) / 2, ring0 + 0.12));
  B.add('steel', zTube(CYL.z1 - G.recoil - 0.15, ring0, 0.05, 0.05, 10, 0, CYL.y));
  B.add('dark', zTube(ring0 - 0.05, ring0, 0.075, 0.075, 6, 0, CYL.y));
  B.add('camo', box(0.14, -(CR.y0 - 0.1) - rh * 0.5 + 0.04, 0.2, 0, (-rh * 0.5 + CR.y0 - 0.1) / 2, ring0 + 0.12)); // the lower rod's lug
  B.add('steel', zTube(CR.z1 - 0.15, ring0, 0.035, 0.035, 8, 0, CR.y0 - 0.1));
  B.add('dark', box(0.05, 0.05, 0.17, rw * 0.5 + 0.02, rh * 0.4, BR - 0.12));
  B.add('steel', rod(V(rw * 0.5 + 0.03, rh * 0.4, BR - 0.05), V(rw * 0.5 + 0.08, rh * 0.5, BR + 0.08), 0.014, 5));
  B.build(rc, { dirt: 0.12, y0: TRY });

  const brk = pivotAt(rig, rc, 'breech', rw * 0.11, 0, ring0 + fw + (rl - fw) / 2);
  const K = rig.part();
  K.add('camo', box(rw * 0.78 - 0.004, rh * 0.56 - 0.004, rl - fw - 0.004, 0, 0, 0));
  K.add('dark', zTube((rl - fw) / 2 - 0.01, (rl - fw) / 2 + 0.03, 0.055, 0.05, 12, -rw * 0.11, 0));
  K.add('dark', box(0.08, 0.1, 0.06, rw * 0.3, -rh * 0.12, (rl - fw) / 2 + 0.02));
  K.add('steel', rod(V(rw * 0.3, -rh * 0.12, (rl - fw) / 2 + 0.05), V(rw * 0.42, rh * 0.06, (rl - fw) / 2 + 0.32), 0.019, 6));
  K.add('dark', xTube(rw * 0.4, rw * 0.46, 0.03, 0.03, 8, rh * 0.06, (rl - fw) / 2 + 0.32));
  K.build(brk, { dirt: 0 });
  slidingBlock(rig, brk, rw * 0.78);
  const block = rig.setBreech;
  rig.setBreech = (k) => { block(k); rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25))); };

  // ---- the loading tray (Ladeschale), as the K 18's: hooked on the ring for the shell and the charge, lifted off
  // before the block shuts; on only at the loading elevation
  rig.loadEl = 0;
  const sh = buildShell(SHELL), sr = sh.radius, yb = -rh * 0.28;
  const tp = pivotAt(rig, rc, 'loadTray', 0, yb, BR - 0.05);
  const R = rig.part(), tw = sr + 0.03, tl = sh.length * 0.8 + 0.12, fy = -sr - yb, z0 = 0.05, z1 = z0 + tl;
  R.add('camo', box(tw * 2, 0.014, tl, 0, fy - 0.007, z0 + tl / 2));
  R.add('dark', box(tw * 2 - 0.04, 0.012, z0 + 0.012, 0, 0.006, (z0 + 0.012) / 2));
  R.add('dark', box(tw * 2 - 0.04, fy, 0.014, 0, fy / 2, z0 + 0.007));
  for (const z of [z0 + tl * 0.35, z1 - 0.06]) R.add('dark', box(tw * 2 - 0.02, 0.03, 0.04, 0, fy - 0.029, z));
  for (const s of [-1, 1]) {
    R.add('camo', box(0.014, 0.075, tl, s * tw, fy + 0.027, z0 + tl / 2, 0, 0, s * -0.35));
    for (const [a, b] of [[0.3, 0.32], [0.7, 0.68]]) R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tl * a), V(s * (tw + 0.08), fy - 0.03, z0 + tl * b), 0.012, 5));
    R.add('steel', rod(V(s * (tw + 0.08), fy - 0.03, z0 + tl * 0.32), V(s * (tw + 0.08), fy - 0.03, z0 + tl * 0.68), 0.012, 5));
  }
  R.build(tp, { dirt: 0.05, y0: TRY });
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

  // ---- equilibrators (top carriage to the trunnion arms)
  const mats = rig.mats;
  const struts = [-1, 1].map((s) => ({
    outer: strutMesh(car, mats.camo, 0.135, 16), inner: strutMesh(car, mats.steel, 0.055, 10),
    a: new THREE.Vector3(s * EQ.x, EQ.lo[0], EQ.lo[1]), lug: new THREE.Vector3(s * EQ.x, EQ.up[0], EQ.up[1]), b: new THREE.Vector3(),
  }));
  const placeStruts = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of struts) {
      q.b.set(q.lug.x, el.position.y + q.lug.y * c - q.lug.z * sn, el.position.z + q.lug.y * sn + q.lug.z * c);
      aimStrut(q, 1.45);
    }
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeStruts(); placeTray(); };
  rig.update = () => { placeStruts(); placeTray(); };
  placeStruts();

  // ---- dual recoil: the barrel runs back in the cradle a little ahead of the top carriage on its rails; the barrel's
  // stroke is cut at high elevation so the breech ring stays clear of the platform and the trail's floor
  rig.recoilLength = G.recoil;
  rig.carriageRecoil = CARRIAGE_RECOIL;
  const tail = Math.max(rw, rh) / 2, drop = TRY - 0.3 - 0.06;
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

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 3.2, 3.4);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 3.9, 0.16, 4.5);
  trayShells(rig, node(tp, 'shell-tray', 0, -yb - sr - 0.02, z0 + 0.04), SHELL);
  rig.slideMats = ['camo', 'steel', 'char'];

  // twelve men: the Geschützführer, the layer and the traverser at their handwheels, the block man (who fires), the
  // carrying pair and the two rammers on the deck, the ammunition numbers at the stack, the charge man, the trail
  // man with his handspike at the float (the line beyond the carriage's 17 degrees), and the telephonist
  crew(rig, 'officer', -3.6, 2.2, L90, 'point');
  crew(rig, 'layer', -(CX + 0.62), 0.5, L90, 'lay', FOOT);
  crew(rig, 'elevator', CX + 0.62, 0.5, R90, 'operate', FOOT);
  crew(rig, 'lanyard', CX + 0.85, 2.35, R90, 'lanyard', DECK);
  crew(rig, 'loader1', -(CX + 0.62), 3.9, 0, 'carry', DECK);
  crew(rig, 'loader2', -(CX + 0.62), 4.9, 0, 'carry', DECK);
  crew(rig, 'rammer1', -0.3, 5.45, 0, 'ram', DECK);
  crew(rig, 'rammer2', 0.3, 5.45, 0, 'ram', DECK);
  crew(rig, 'ammo1', 5.3, 2.6, R90, 'stand');
  crew(rig, 'ammo2', 5.0, 5.7, R90, 'crouch');
  crew(rig, 'ammo3', 5.6, 4.1, R90, 'stand');
  crew(rig, 'spike', -1.0, 7.9, 0, 'stand');

  hb(rig, -1.6, 0, -3.6, 1.6, 2.9, 1.0);
  hb(rig, -1.8, 0, 1.0, 1.8, 2.9, 7.5);
  return finishRig(rig, 'k38', SHELL);
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

// A grated walkway between x0 and x1, z0 and z1, its top at y: an angle frame, bearer bars and cross bars.
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
  g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(1.8), 1));
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

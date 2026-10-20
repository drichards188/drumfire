import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, zLathe, rivets, rivetRow, rivetPoly, handwheel, DEG } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, L90, R90, ring, TAU } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * The Mörserlafette (Krupp, 1939) in firing order, carrying either barrel (refs/k18_mrs18/README.md):
 *   buildK18()   17 cm Kanone 18: the long slim L/50 barrel (8.53 m; TM-E 30-451 gives 28 ft 3.6 in), a thin plain
 *                muzzle and the jacket's shoulder about 3.6 m back; 17.5 t in action, 0 to +50 degrees
 *   buildMrs18() 21 cm Mörser 18: the short fat L/31 barrel (6.51 m; TM-E 30-451 21 ft 4.37 in), a thick plain muzzle
 *                and a collared step 2.4 m back, a bigger breech ring; 16.7 t, 0 to +70 degrees
 * Both barrels lie in the same cradle with the same recoil gear, so the breech ring sits at the same place on both
 * (the K 18's longer barrel overhangs forward; TM-E 30-451: its elevation is "limited to 50 degrees by a stop").
 *
 * Firing order (TM-E 30-451 VII-28/29; en.wikipedia; the Fort Sill, Aberdeen, Warsaw, Gagetown and Trieste guns):
 * the round firing platform (Bettung) is lowered on jacks under the front, the carriage turns on its centre pivot
 * on three roller pieces, the big front road wheels with their deep mudguards are cranked up clear of the ground,
 * and the end of the box trail rests on its float with the castor jack behind it (one man with a trail spike swings
 * the whole gun round). Dual recoil (Doppelrücklauf): the barrel recoils in the cradle under the recoil cylinder on
 * top of it, and the top carriage recoils along the rails of the lower carriage. Two equilibrators run from the top
 * carriage's front down by the wheels to arms on the trunnions. The grated loading walkways are let down along
 * both sides of the lower carriage; the loaders and rammers work from them and from the deck over the trail, the
 * layer and the traverser from footplates by the handwheels. Loaded at zero elevation, a loose loading tray hooked
 * onto the breech ring. Paint: dgelb (Dunkelgelb with olive and red-brown) or feldgrau, buildK18({ scheme }).
 *
 * Rig (DESIGN.md "Models", "WW2 mode"): origin on the ground at the platform's centre, front -Z. `traverse` the
 * lower carriage and trail (it turns on the platform's pivot), `carriage` the top carriage slide (position.z, +
 * back), `elevation` at the trunnions (the bore axis), `recoil` the barrel, `breech` the sliding block (+X),
 * `loadTray` the loading tray on the breech ring, hinged at its lip (setTray: 0 hooked on in line with the bore, 1
 * lifted off; setBreech also sets it, for viewers that only know the block). setRecoil(k) drives both slides
 * (rig.recoilLength the barrel's, rig.carriageRecoil the top carriage's), the barrel's stroke cut at high elevation
 * so the ring clears the platform. The equilibrators and the tray follow the elevation (rig.update).
 */
const K18 = {
  kind: 'k18', L: 8.53, bore: 0.08625,
  // [distance from the muzzle, radius]: thin plain muzzle (172.5 mm bore, about 0.28 m over the face), a long tapered
  // chase, the jacket's shoulder with a raised lip 3.6 m back, the jacket to the breech ring
  prof: [[0, 0.124], [0.025, 0.139], [3.55, 0.165], [3.55, 0.198], [3.62, 0.198], [3.66, 0.19], [8.01, 0.222]],
  ring: { len: 0.52, w: 0.5, h: 0.5 }, recoil: 1.1,
};
const MRS18 = {
  kind: 'mrs18', L: 6.51, bore: 0.1055,
  // thick plain muzzle (211 mm bore, about 0.36 m over the face), the collar at the step 2.4 m back (the barrel on its
  // wagon, Moscow 1942: 0.35 m over the chase, 0.47 m over the jacket), a fat jacket
  prof: [[0, 0.158], [0.035, 0.177], [2.35, 0.185], [2.35, 0.228], [2.48, 0.228], [2.52, 0.216], [5.91, 0.24]],
  ring: { len: 0.6, w: 0.64, h: 0.62 }, recoil: 1.0,
};
const TRY = 2.2, TRZ = 0.05; // trunnion axis (the bore at zero elevation), above the platform's centre
const BR = 1.75; // the breech face behind the trunnions (the same for both barrels: the ring clears the platform at 70)
const RAIL = 1.06; // top of the lower carriage's slide rails
const DECK = 1.1; // the loading walkways and the deck over the trail
const FOOT = 0.68; // the layer's and the traverser's footplates
const AX = { x: 1.15, y: 0.84, z: -1.45, R: 0.76, tw: 0.3 }; // front road wheels, raised 8 cm clear
const PR = 1.3; // firing platform radius
const CR = { z0: -1.25, z1: 0.9, hw: 0.34, y0: -0.33, y1: 0.27 }; // the cradle sleeve (elevation frame)
const CYL = { y: 0.45, r: 0.15, z0: -1.12, z1: 0.85 }; // recoil brake and recuperator on top of the cradle
const EQ = { x: 0.76, lo: [1.35, -1.25], up: [0.25, -0.35] }; // equilibrator pivots: top carriage (y, z), cradle arm (y, z)
const CARRIAGE_RECOIL = 0.6;

export const buildK18 = (o = {}) => build(K18, o);
export const buildMrs18 = (o = {}) => build(MRS18, o);

function build(G, { scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const MZ = -(G.L - BR), ring0 = BR - G.ring.len;
  const rAt = (s) => { // the barrel's outside radius at s metres from the muzzle
    const p = G.prof;
    for (let i = 1; i < p.length; i++) if (s <= p[i][0]) { const [a, ra] = p[i - 1], [b, rb] = p[i]; return b > a ? ra + (rb - ra) * (s - a) / (b - a) : rb; }
    return p[p.length - 1][1];
  };

  // ---- the firing platform (Bettung): a round ribbed steel plate on the levelled ground, the racer ring the three
  // roller pieces run on, the centre pivot, and the pickets that hold it
  const F = rig.part();
  F.add('dark', yTube(0, 0.07, PR, PR, 48));
  F.add('dark', ring(PR - 0.07, PR, 0, 0.15, 48).rotateZ(Math.PI / 2));
  F.add('steel', ring(0.95, 1.05, 0.07, 0.2, 48).rotateZ(Math.PI / 2));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    F.add('dark', box(0.05, 0.08, 0.6, sa * 0.62, 0.11, ca * 0.62, 0, a, 0));
    F.add('dark', box(0.05, 0.07, 0.17, sa * 1.15, 0.1, ca * 1.15, 0, a, 0));
  }
  F.add('dark', yTube(0.07, 0.24, 0.3, 0.27, 24));
  F.add('steel', yTube(0.24, 0.4, 0.11, 0.1, 16));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8 + 1 / 16) * TAU, x = Math.sin(a) * (PR + 0.08), z = Math.cos(a) * (PR + 0.08);
    F.add('dark', box(0.16, 0.05, 0.16, x, 0.1, z, 0, a, 0)); // lug
    F.add('steel', yTube(-0.1, 0.22, 0.03, 0.03, 6, x, z)); // picket
    F.add('steel', yTube(0.2, 0.25, 0.05, 0.05, 8, x, z));
  }
  F.build(root, { dirt: 0.9 });

  // ---- lower carriage and trail (traverse): two riveted box girders from the front axle to the trail end, the
  // slide rails on top, transoms clear of the breech's path at high elevation, the pivot housing and roller pieces
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const gir = [[-2.05, 0.6], [-2.05, 1.02], [4.95, 1.02], [5.62, 0.86], [5.62, 0.46], [4.4, 0.4], [-0.9, 0.4], [-1.55, 0.5]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(gir, 0.24).translate(s * 0.5, 0, 0));
    T.add('camo', box(0.3, 0.025, 7.0, s * 0.5, 1.0325, 1.45)); // top flange
    T.add('steel', box(0.11, 0.022, 7.0, s * 0.5, 1.049, 1.45)); // the running rail of the top carriage
    T.add('camo', box(0.3, 0.025, 5.4, s * 0.5, 0.4125, 1.75)); // bottom flange
    const xo = s * 0.621;
    T.add('camo', rivetRow(V(xo, 0.97, -2.0), V(xo, 0.97, 4.9), 0.16, V(s, 0, 0), 0.017));
    T.add('camo', rivetRow(V(xo, 0.46, -0.85), V(xo, 0.46, 4.4), 0.16, V(s, 0, 0), 0.017));
    for (const z of [-1.95, -0.6, 0.6, 1.8, 3.0, 4.2]) T.add('camo', box(0.02, 0.56, 0.07, s * 0.63, 0.71, z)); // stiffeners
  }
  T.add('camo', box(0.76, 0.42, 0.12, 0, 0.8, -1.99)); // front transom
  T.add('camo', box(0.76, 0.08, 0.3, 0, 0.4, -1.0)); // lower transom carrying the front roller
  for (const z of [2.55, 3.75]) T.add('camo', box(0.76, 0.5, 0.1, 0, 0.72, z));
  T.add('camo', box(1.0, 0.42, 0.06, 0, 0.66, 5.62)); // trail end plate
  T.add('camo', box(0.76, 0.04, 2.9, 0, 0.42, 4.05)); // trail floor
  T.add('camo', box(1.24, 0.04, 1.75, 0, DECK - 0.02, 4.125)); // the deck over the trail behind the top carriage's run
  for (let z = 3.4; z < 5.0; z += 0.3) T.add('camo', box(1.1, 0.012, 0.025, 0, DECK + 0.006, z)); // cleats
  T.add('camo', rivetRow(V(-0.58, DECK + 0.001, 3.3), V(-0.58, DECK + 0.001, 4.95), 0.15, V(0, 1, 0), 0.014));
  T.add('camo', rivetRow(V(0.58, DECK + 0.001, 3.3), V(0.58, DECK + 0.001, 4.95), 0.15, V(0, 1, 0), 0.014));
  // pivot housing on the platform's pin, joined to both girders; the three roller pieces on the racer ring
  T.add('camo', yTube(0.26, 0.46, 0.2, 0.22, 20));
  T.add('camo', box(0.76, 0.12, 0.22, 0, 0.36, 0));
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    // a roller piece at angle a round the pivot: long side along the racer, two rollers with radial axles
    const x = Math.sin(a), z = -Math.cos(a), ry = Math.PI / 2 - a, tx = Math.cos(a), tz = Math.sin(a);
    T.add('camo', box(0.24, 0.12, 0.34, x, 0.33, z, 0, ry, 0));
    for (const k of [-1, 1]) T.add('steel', xTube(-0.08, 0.08, 0.055, 0.055, 12).rotateY(ry).translate(x + tx * 0.1 * k, 0.255, z + tz * 0.1 * k));
    if (Math.abs(x) > 0.1) T.add('camo', rod(V(x * 0.97, 0.36, z), V(Math.sign(x) * 0.6, 0.42, z * 0.6 - 0.1), 0.05, 8));
  }
  // front axle (cranked up), jack screws at the front corners, the towing crossbar and lunette
  T.add('camo', box(1.96, 0.2, 0.24, 0, AX.y, AX.z));
  for (const s of [-1, 1]) {
    T.add('steel', xTube(s * 0.95, s * 1.02, 0.09, 0.09, 14, AX.y, AX.z));
    T.add('camo', box(0.22, 0.42, 0.34, s * 0.78, AX.y + 0.12, AX.z)); // axle bracket and its crank housing
    T.add('dark', xTube(s * 0.89, s * 0.97, 0.06, 0.06, 10, AX.y + 0.22, AX.z));
    T.add('camo', yTube(0.62, 1.16, 0.085, 0.085, 14, s * 0.76, -1.97)); // front jack housing
    T.add('steel', yTube(0.05, 0.62, 0.045, 0.045, 10, s * 0.76, -1.97));
    T.add('dark', box(0.3, 0.04, 0.3, s * 0.76, 0.02, -1.97));
    T.add('steel', rod(V(s * 0.76, 1.2, -1.97), V(s * 0.76 + s * 0.2, 1.2, -2.07), 0.015, 5)); // crank
    T.add('camo', rod(V(s * 0.38, 0.85, -2.05), V(s * 0.8, 0.72, -2.35), 0.035, 8));
  }
  T.add('camo', box(0.46, 0.32, 0.36, 0, AX.y + 0.04, AX.z)); // the lifting gear's housing on the axle
  T.add('steel', xTube(-0.6, 0.6, 0.035, 0.035, 8, AX.y + 0.16, AX.z - 0.24)); // its cross shaft
  for (const s of [-1, 1]) {
    T.add('dark', xTube(s * 0.9, s * 1.0, 0.27, 0.27, 24, AX.y, AX.z)); // brake drum
    T.add('steel', rod(V(s * 0.95, AX.y + 0.2, AX.z - 0.1), V(s * 0.55, AX.y + 0.16, AX.z - 0.24), 0.018, 5)); // brake rod
  }
  T.add('camo', xTube(-0.88, 0.88, 0.045, 0.045, 10, 0.72, -2.35));
  T.add('dark', new THREE.TorusGeometry(0.09, 0.025, 6, 16).rotateX(Math.PI / 2).translate(0, 0.72, -2.47));
  for (const s of [-1, 1]) {
    wheel(T, s * AX.x, AX.y, AX.z, s);
    fender(T, s * AX.x, AX.y, AX.z, s);
  }
  // footplates for the layer (left) and the traverser (right), the grated walkways let down along both sides with
  // their legs, the ladders at the rear corners
  for (const s of [-1, 1]) {
    grating(T, s * 0.64, s * 1.45, 0.1, 0.95, FOOT);
    T.add('camo', rod(V(s * 0.63, 0.5, 0.5), V(s * 1.4, FOOT - 0.06, 0.5), 0.025, 6));
    T.add('camo', yTube(FOOT, DECK, 0.02, 0.02, 6, s * 1.45, 0.95));
    grating(T, s * 0.64, s * 1.6, 0.95, 4.72, DECK);
    for (const z of [1.1, 2.9, 4.6]) {
      T.add('camo', yTube(0, DECK - 0.08, 0.035, 0.035, 8, s * 1.55, z));
      T.add('dark', box(0.14, 0.03, 0.14, s * 1.55, 0.015, z));
      T.add('camo', box(0.06, 0.1, 0.12, s * 0.66, DECK - 0.1, z)); // hinge
    }
    const lx0 = s * 1.3, lx1 = s * 1.58;
    for (const x of [lx0, lx1]) T.add('camo', rod(V(x, DECK - 0.03, 4.7), V(x, 0, 5.4), 0.022, 6));
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      T.add('camo', box(0.3, 0.025, 0.1, (lx0 + lx1) / 2, DECK * (1 - t), 4.7 + 0.7 * t));
    }
  }
  // the float the trail end rests on, the castor jack behind it, the lunette and the trail spike sockets
  T.add('camo', box(1.5, 0.05, 0.8, 0, 0.025, 5.25));
  for (const [z, a] of [[4.84, -0.6], [5.66, 0.6]]) T.add('camo', box(1.5, 0.05, 0.16, 0, 0.07, z, a, 0, 0));
  for (const x of [-0.55, 0, 0.55]) T.add('camo', box(0.05, 0.1, 0.78, x, 0.1, 5.25));
  for (const s of [-1, 1]) T.add('camo', rod(V(s * 0.42, 0.42, 5.45), V(s * 0.42, 0.12, 5.25), 0.04, 8));
  T.add('camo', box(0.3, 0.2, 0.2, 0, 0.78, 5.72));
  T.add('camo', yTube(0.38, 0.98, 0.075, 0.075, 14, 0, 5.84));
  T.add('steel', yTube(0.28, 0.4, 0.045, 0.045, 10, 0, 5.84));
  T.add('dark', box(0.12, 0.12, 0.08, 0, 0.3, 5.84));
  for (const s of [-1, 1]) T.add('camo', box(0.02, 0.2, 0.14, s * 0.07, 0.2, 5.84));
  T.add('dark', ring(0.1, 0.18, -0.045, 0.045, 18).translate(0, 0.18, 5.84));
  T.add('steel', xTube(-0.07, 0.07, 0.025, 0.025, 8, 0.18, 5.84));
  T.add('steel', xTube(-0.18, 0.18, 0.015, 0.015, 6, 1.0, 5.84));
  T.add('dark', new THREE.TorusGeometry(0.1, 0.03, 6, 16).rotateX(Math.PI / 2).translate(0, 0.62, 5.75));
  for (const s of [-1, 1]) T.add('steel', zTube(5.55, 5.78, 0.045, 0.045, 10, s * 0.32, 0.86));
  T.add('steel', rod(V(0.69, 0.84, 2.3), V(0.69, 0.84, 4.25), 0.025, 6)); // the trail spike, stowed
  // balance springs of the trail-end gear, outside the girders under the walkways' ends
  for (const s of [-1, 1]) {
    T.add('steel', helix(0.085, 1.1, 13, 0.016).translate(s * 0.74, 0.76, 4.4));
    T.add('steel', zTube(4.3, 5.6, 0.025, 0.025, 6, s * 0.74, 0.76));
    for (const z of [4.32, 5.56]) T.add('camo', box(0.18, 0.2, 0.06, s * 0.69, 0.76, z));
  }
  T.build(trav, { dirt: 0.55 });

  // ---- top carriage (slides back on the rails at the shot): two tall riveted cheeks with the trunnion bearings,
  // the slide shoes, the transoms and the rear box, the handwheels, the sight, the equilibrators' lower brackets
  const car = pivotAt(rig, trav, 'carriage', 0, 0, 0);
  const C = rig.part();
  const cheek = [[-1.45, RAIL + 0.06], [2.55, RAIL + 0.06], [2.55, 1.52], [1.55, 1.52], [1.05, 1.95], [0.55, TRY + 0.08],
    [0.35, TRY + 0.24], [-0.25, TRY + 0.24], [-0.5, TRY + 0.08], [-0.95, 1.95], [-1.45, 1.55]];
  for (const s of [-1, 1]) {
    C.add('camo', sideProfile(cheek, 0.05).translate(s * 0.555, 0, 0));
    C.add('camo', rivetPoly(cheek, (z, y) => V(s * 0.58, y, z), 0.05, 0.15, V(s, 0, 0), 0.016));
    // the flange round the cheek's top edge and the stiffeners on its outer face
    for (let i = 2; i < cheek.length - 1; i++) {
      const [z1, y1] = cheek[i], [z2, y2] = cheek[i + 1], L = Math.hypot(z2 - z1, y2 - y1), a = Math.atan2(y2 - y1, z2 - z1);
      C.add('camo', box(0.12, 0.022, L + 0.02, s * 0.555, (y1 + y2) / 2, (z1 + z2) / 2, -a, 0, 0));
    }
    for (const z of [-1.0, -0.62, 0.72, 1.2, 2.05]) {
      const top = topAt(cheek, z) - 0.03;
      C.add('camo', box(0.035, top - RAIL - 0.08, 0.05, s * 0.595, (top + RAIL + 0.08) / 2, z));
    }
    C.add('dark', box(0.2, 0.05, 3.96, s * 0.5, RAIL + 0.025, 0.55)); // slide shoes
    C.add('camo', xTube(s * 0.53, s * 0.66, 0.21, 0.21, 24, TRY, TRZ)); // trunnion bearing housing
    C.add('camo', box(0.13, 0.08, 0.5, s * 0.595, TRY + 0.21, TRZ)); // its cap
    for (const z of [-0.2, 0.3]) C.add('steel', yTube(TRY + 0.25, TRY + 0.29, 0.025, 0.025, 6, s * 0.595, TRZ + z));
    C.add('camo', rivets(Array.from({ length: 8 }, (_, i) => V(s * 0.661, TRY + Math.sin(i * TAU / 8) * 0.16, TRZ + Math.cos(i * TAU / 8) * 0.16)), V(s, 0, 0), 0.02));
    // equilibrator lower bracket
    C.add('camo', box(0.24, 0.16, 0.2, s * 0.68, EQ.lo[0], EQ.lo[1]));
    C.add('steel', xTube(s * 0.6, s * 0.86, 0.035, 0.035, 8, EQ.lo[0], EQ.lo[1]));
  }
  C.add('camo', box(1.06, 0.48, 0.12, 0, RAIL + 0.3, -1.38)); // front transom
  C.add('camo', box(1.06, 0.38, 0.95, 0, RAIL + 0.25, 2.07)); // rear box over the slide
  C.add('camo', rivetRow(V(-0.5, 1.47, 1.65), V(0.5, 1.47, 1.65), 0.14, V(0, 0, -1), 0.016));
  C.add('dark', box(0.9, 0.08, 0.2, 0, 1.36, 2.6)); // buffer stop
  // elevating gear: the pinion on the left cheek meshing with the cradle's arc, the handwheel and its gearbox; the
  // traversing handwheel on the right
  C.add('steel', xTube(-0.53, -0.4, 0.06, 0.06, 12, TRY - 0.787, TRZ - 0.069));
  for (const s of [-1, 1]) {
    C.add('camo', box(0.14, 0.24, 0.26, s * 0.65, FOOT + 1.12, 0.55));
    C.add('steel', xTube(s * 0.72, s * 0.78, 0.025, 0.025, 8, FOOT + 1.12, 0.55));
    C.add('dark', handwheel(0.17, 6, 0.016, 0.035, 1).rotateY(s < 0 ? Math.PI : 0).translate(s * 0.78, FOOT + 1.12, 0.55));
  }
  // the elevation scale drum on the left cheek below the trunnion (the round dial in the Fort Sill photographs)
  C.add('camo', xTube(-0.58, -0.66, 0.13, 0.13, 20, TRY - 0.42, TRZ + 0.18));
  C.add('dark', xTube(-0.66, -0.67, 0.1, 0.1, 20, TRY - 0.42, TRZ + 0.18));
  // the panoramic sight on its bracket by the left trunnion, at the layer's eye
  const sy = FOOT + 1.46; // the eyepiece at the layer's eye (his feet + 1.66)
  C.add('camo', box(0.3, 0.06, 0.1, -0.78, sy - 0.03, 0.39));
  C.add('camo', box(0.06, 0.3, 0.1, -0.66, sy - 0.15, 0.32));
  C.add('dark', box(0.1, 0.1, 0.1, -0.91, sy - 0.01, 0.39));
  panoramicSight(C, -0.92, sy, 0.39, -1);
  C.build(car, { dirt: 0.35 });

  // ---- cradle: the riveted sleeve the barrel slides in, its guide ring, the recoil cylinder on top with the
  // recuperator head, the trunnions and the equilibrator arms, the elevating arc on the left
  const el = pivotAt(rig, car, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  const cl = CR.z1 - CR.z0, cz = (CR.z0 + CR.z1) / 2;
  E.add('camo', box(CR.hw * 2, 0.06, cl, 0, CR.y0 + 0.03, cz));
  E.add('camo', box(CR.hw * 2, 0.06, cl, 0, CR.y1 - 0.03, cz));
  for (const s of [-1, 1]) {
    E.add('camo', box(0.06, CR.y1 - CR.y0, cl, s * (CR.hw - 0.03), (CR.y0 + CR.y1) / 2, cz));
    for (const y of [CR.y0 + 0.025, CR.y1 - 0.025]) E.add('camo', box(0.05, 0.05, cl, s * (CR.hw + 0.02), y, cz));
    E.add('camo', rivetRow(V(s * (CR.hw + 0.001), 0.12, CR.z0 + 0.1), V(s * (CR.hw + 0.001), 0.12, CR.z1 - 0.1), 0.15, V(s, 0, 0), 0.015));
    E.add('camo', rivetRow(V(s * (CR.hw + 0.001), -0.18, CR.z0 + 0.1), V(s * (CR.hw + 0.001), -0.18, CR.z1 - 0.1), 0.15, V(s, 0, 0), 0.015));
    E.add('steel', xTube(s * CR.hw, s * 0.69, 0.11, 0.11, 18)); // trunnion
    // equilibrator arm clamped on the trunnion's end
    E.add('camo', xTube(s * 0.67, s * 0.8, 0.12, 0.12, 16));
    E.add('camo', rod(V(s * 0.735, 0, 0), V(s * 0.735, EQ.up[0], EQ.up[1]), 0.055, 8));
    E.add('steel', xTube(s * 0.66, s * 0.84, 0.035, 0.035, 8, EQ.up[0], EQ.up[1]));
  }
  const jr = rAt(-MZ + CR.z0) + 0.006; // the barrel's radius at the cradle's mouth
  E.add('camo', zRing(jr, 0.31, CR.z0 - 0.14, CR.z0 + 0.02, 28));
  E.add('camo', zRing(rAt(-MZ + CR.z1) + 0.006, 0.3, CR.z1 - 0.04, CR.z1 + 0.04, 28));
  // the recoil cylinder on top: saddles and straps, the recuperator head forward with its bolted flange, the gland
  for (const z of [-0.95, -0.1, 0.75]) {
    E.add('camo', box(0.26, CYL.y - CYL.r - CR.y1 + 0.04, 0.16, 0, (CR.y1 + CYL.y - CYL.r) / 2, z));
    E.add('camo', zTube(z - 0.05, z + 0.05, CYL.r + 0.014, CYL.r + 0.014, 24, 0, CYL.y));
  }
  E.add('camo', zTube(CYL.z0, CYL.z1, CYL.r, CYL.r, 24, 0, CYL.y));
  E.add('camo', zTube(CYL.z0 - 0.05, CYL.z0 + 0.03, CYL.r + 0.03, CYL.r + 0.03, 24, 0, CYL.y));
  E.add('camo', rivets(Array.from({ length: 12 }, (_, i) => V(Math.cos(i * TAU / 12) * (CYL.r + 0.012), CYL.y + Math.sin(i * TAU / 12) * (CYL.r + 0.012), CYL.z0 - 0.05)), V(0, 0, -1), 0.018));
  E.add('camo', zTube(CYL.z0 - 0.3, CYL.z0 - 0.05, 0.12, 0.12, 20, 0, CYL.y));
  E.add('camo', zTube(CYL.z0 - 0.36, CYL.z0 - 0.3, 0.1, 0.12, 12, 0, CYL.y));
  E.add('dark', zTube(CYL.z0 - 0.4, CYL.z0 - 0.36, 0.05, 0.05, 6, 0, CYL.y));
  E.add('camo', zTube(CYL.z1, CYL.z1 + 0.08, 0.085, 0.075, 12, 0, CYL.y));
  E.add('steel', yTube(CYL.y + CYL.r - 0.02, CYL.y + CYL.r + 0.05, 0.025, 0.025, 6, 0, -0.6)); // filler plug
  // elevating arc (left) on its web plate: the pinion on the cheek meets it 95 degrees round from the bore
  E.add('camo', gearArc(0.58, 0.7, 25 * DEG, 95 * DEG, 0.05, 20, 0.03).translate(-0.43, 0, 0));
  E.add('camo', gearArc(0.3, 0.58, 25 * DEG, 95 * DEG, 0.025).translate(-0.4, 0, 0));
  E.build(el, { dirt: 0.2, y0: TRY });

  // ---- the barrel: recessed bore, the profile above, the rear band, the breech ring with the chamber mouth behind
  // the block and the lug the recoil cylinder's piston rod is made fast to
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  const ch = G.bore * 1.12, pts = [[MZ, G.bore]]; // the chamber is a little wider than the bore
  for (const [s, r] of G.prof) pts.push([MZ + s, r]);
  pts.push([ring0 + 0.01, G.prof[G.prof.length - 1][1]], [ring0 + 0.01, ch]);
  B.add('camo', zLathe(pts, 40));
  B.add('dark', zLathe([[MZ + 0.6, G.bore], [MZ, G.bore]], 20)); // the bore seen from the muzzle (listed backwards: faces in)
  B.add('char', new THREE.CircleGeometry(G.bore, 20).rotateY(Math.PI).translate(0, 0, MZ + 0.6));
  B.add('dark', zLathe([[ring0 + 0.01, ch], [ring0 - 0.9, ch]], 20)); // the chamber, open behind the block
  B.add('char', new THREE.CircleGeometry(ch, 20).translate(0, 0, ring0 - 0.9));
  const rj = G.prof[G.prof.length - 1][1];
  B.add('camo', zRing(rj - 0.01, rj + 0.022, ring0 - 0.18, ring0 - 0.02, 32)); // the band the barrel's guides are fixed to
  const { len: rl, w: rw, h: rh } = G.ring, rz = ring0 + rl / 2, fw = 0.14;
  B.add('camo', rbox(rw, rh * 0.22, rl, 0.025, 0, rh * 0.39, rz));
  B.add('camo', rbox(rw, rh * 0.22, rl, 0.025, 0, -rh * 0.39, rz));
  B.add('camo', box(rw * 0.22, rh * 0.56, rl, -rw * 0.39, 0, rz));
  { // the ring's front wall in the block's slot, pierced for the chamber
    const x0 = -rw * 0.28, x1 = rw * 0.5, y0 = rh * 0.28, f = new THREE.Shape();
    f.moveTo(x0, -y0); f.lineTo(x1, -y0); f.lineTo(x1, y0); f.lineTo(x0, y0); f.lineTo(x0, -y0);
    const hole = new THREE.Path();
    hole.absarc(0, 0, ch, 0, TAU, true);
    f.holes.push(hole);
    B.add('camo', new THREE.ExtrudeGeometry(f, { depth: fw, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, ring0));
    B.add('dark', zLathe([[ring0 + fw, ch], [ring0, ch]], 20));
  }
  B.add('camo', box(0.16, CYL.y + 0.07 - rh * 0.5, 0.22, 0, (CYL.y + 0.07 + rh * 0.5) / 2, ring0 + 0.11));
  B.add('steel', zTube(CYL.z1 - G.recoil - 0.15, ring0, 0.045, 0.045, 10, 0, CYL.y));
  B.add('dark', zTube(ring0 - 0.05, ring0, 0.07, 0.07, 6, 0, CYL.y));
  B.add('dark', box(0.05, 0.05, 0.16, rw * 0.5 + 0.02, rh * 0.4, BR - 0.12)); // firing lever bracket, above the block's slot
  B.add('steel', rod(V(rw * 0.5 + 0.03, rh * 0.4, BR - 0.05), V(rw * 0.5 + 0.08, rh * 0.5, BR + 0.08), 0.014, 5));
  B.build(rc, { dirt: 0.12, y0: TRY });

  const brk = pivotAt(rig, rc, 'breech', rw * 0.11, 0, ring0 + fw + (rl - fw) / 2);
  const K = rig.part();
  K.add('camo', box(rw * 0.78 - 0.004, rh * 0.56 - 0.004, rl - fw - 0.004, 0, 0, 0));
  K.add('dark', zTube((rl - fw) / 2 - 0.01, (rl - fw) / 2 + 0.03, 0.05, 0.045, 12, -rw * 0.11, 0)); // firing lock
  K.add('dark', box(0.08, 0.1, 0.06, rw * 0.3, -rh * 0.12, (rl - fw) / 2 + 0.02));
  K.add('steel', rod(V(rw * 0.3, -rh * 0.12, (rl - fw) / 2 + 0.05), V(rw * 0.42, rh * 0.06, (rl - fw) / 2 + 0.3), 0.018, 6)); // operating crank
  K.add('dark', xTube(rw * 0.4, rw * 0.46, 0.03, 0.03, 8, rh * 0.06, (rl - fw) / 2 + 0.3));
  K.build(brk, { dirt: 0 });
  slidingBlock(rig, brk, rw * 0.78);
  const block = rig.setBreech;
  // a viewer that only knows the breech gets the tray on once the block is open (as rig.js newGunRig); the render
  // layer sets the tray from the loading step after this
  rig.setBreech = (k) => { block(k); rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25))); };

  // ---- the loading tray (Ladeschale): a loose steel trough the loaders hook onto the breech ring for the shell and
  // the cartridge and lift off again before the block shuts (Bundesarchiv 101I-118-0379-20: the round comes up on a
  // carrier and is rammed from behind). Its lip lies on the floor of the open block's slot just inside the ring's rear
  // face, a riser comes up the face to the trough, and the floor is at the shell's underside, so the round crews.js
  // lays on the bore's axis rests on it and slides straight in. It belongs to the barrel (pivot on the recoil pivot)
  // and hinges at the lip's front edge: hooked on it lies in line with the bore, coming on or off it tips rear end up
  // about the lip. It is on only while the gun stands at its loading elevation; off the gun it is not drawn (nobody is
  // drawn carrying it) and shrinks to a point at its lip, inside the ring, because the crew's clearance field and
  // crewcheck sample hidden meshes too.
  rig.loadEl = 0;
  const sh = buildShell(G.kind), sr = sh.radius, yb = -rh * 0.28; // yb: the slot's floor (the ring's lower wall)
  const tp = pivotAt(rig, rc, 'loadTray', 0, yb, BR - 0.05);
  const R = rig.part(), tw = sr + 0.03, tl = sh.length * 0.8 + 0.1, fy = -sr - yb, z0 = 0.05, z1 = z0 + tl;
  R.add('camo', box(tw * 2, 0.014, tl, 0, fy - 0.007, z0 + tl / 2)); // the floor, its top at the shell's underside
  R.add('dark', box(tw * 2 - 0.04, 0.012, z0 + 0.012, 0, 0.006, (z0 + 0.012) / 2)); // the lip on the slot's floor
  R.add('dark', box(tw * 2 - 0.04, fy, 0.014, 0, fy / 2, z0 + 0.007)); // the riser up the ring's face
  for (const z of [z0 + tl * 0.35, z1 - 0.06]) R.add('dark', box(tw * 2 - 0.02, 0.03, 0.04, 0, fy - 0.029, z)); // ribs
  for (const s of [-1, 1]) {
    R.add('camo', box(0.014, 0.07, tl, s * tw, fy + 0.025, z0 + tl / 2, 0, 0, s * -0.35));
    // the carrying handles
    for (const [a, b] of [[0.3, 0.32], [0.7, 0.68]]) R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tl * a), V(s * (tw + 0.08), fy - 0.03, z0 + tl * b), 0.012, 5));
    R.add('steel', rod(V(s * (tw + 0.08), fy - 0.03, z0 + tl * 0.32), V(s * (tw + 0.08), fy - 0.03, z0 + tl * 0.68), 0.012, 5));
  }
  R.build(tp, { dirt: 0.05, y0: TRY });
  const TIP = 0.6; // how far the rear end is tipped up as the tray comes on or off (rad)
  let trayK = 1;
  const placeTray = () => {
    // a tray left on at a laid elevation would hang in the recoil's path: it is only on at the loading elevation
    const on = trayK < 0.98 && Math.abs(el.rotation.x - rig.loadEl) < 0.01;
    tp.visible = on;
    tp.rotation.x = on ? -TIP * trayK : 0;
    tp.scale.setScalar(on ? 1 : 1e-3);
  };
  rig.setTray = (k) => { trayK = Math.min(1, Math.max(0, k)); placeTray(); };
  rig.setTray(1);

  // ---- equilibrators (top carriage to the trunnion arms), drawn with the gun's paint and grain
  const mats = rig.mats;
  const struts = [-1, 1].map((s) => ({
    outer: strutMesh(car, mats.camo, 0.12, 16), inner: strutMesh(car, mats.steel, 0.05, 10),
    a: new THREE.Vector3(s * EQ.x, EQ.lo[0], EQ.lo[1]), lug: new THREE.Vector3(s * EQ.x, EQ.up[0], EQ.up[1]), b: new THREE.Vector3(),
  }));
  const placeStruts = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of struts) {
      q.b.set(q.lug.x, el.position.y + q.lug.y * c - q.lug.z * sn, el.position.z + q.lug.y * sn + q.lug.z * c);
      aimStrut(q, 1.3);
    }
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeStruts(); placeTray(); };
  rig.update = () => { placeStruts(); placeTray(); };
  placeStruts();

  // ---- dual recoil: the barrel runs back in the cradle a little ahead of the top carriage on its rails; the barrel's
  // stroke is cut at high elevation so the breech ring stays clear of the platform (the floor 0.22 m up)
  rig.recoilLength = G.recoil;
  rig.carriageRecoil = CARRIAGE_RECOIL;
  const tail = Math.max(rw, rh) / 2, drop = TRY - 0.22 - 0.06;
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
  rig.anchors.eye = node(trav, 'eye', 0, 3.0, 2.9);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 3.4, 0.15, 3.8);
  // named shell-* like rig.js's props: the crew's clearance field and crewcheck leave the rounds out (the men handle them).
  // On the tray (shown and hidden with it), the shell's middle at anchors.tray and the bag on the floor behind the face
  trayShells(rig, node(tp, 'shell-tray', 0, -yb - sr - 0.02, z0 + 0.04), G.kind);
  rig.slideMats = ['camo', 'steel', 'char'];

  crew(rig, 'officer', -3.2, 2.0, L90, 'point');
  crew(rig, 'layer', -1.18, 0.55, L90, 'lay', FOOT);
  crew(rig, 'elevator', 1.18, 0.55, R90, 'operate', FOOT);
  crew(rig, 'lanyard', 1.25, 2.7, R90, 'lanyard', DECK);
  crew(rig, 'loader1', -1.15, 3.3, 0, 'carry', DECK);
  crew(rig, 'loader2', -1.15, 4.3, 0, 'carry', DECK);
  crew(rig, 'rammer1', -0.28, 4.6, 0, 'ram', DECK);
  crew(rig, 'rammer2', 0.28, 4.6, 0, 'ram', DECK);
  crew(rig, 'ammo1', 3.9, 3.0, R90, 'stand');
  crew(rig, 'ammo2', 3.9, 4.8, R90, 'crouch');

  hb(rig, -1.45, 0, -2.5, 1.45, 3.0, 1.0);
  hb(rig, -1.65, 0, 1.0, 1.65, 2.7, 5.9);
  return finishRig(rig, G.kind, G.kind);
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

// An annulus about the Z axis between radii rIn and rOut over z0..z1 (the cradle's guide rings).
function zRing(rIn, rOut, z0, z1, seg = 28) {
  const pts = [[rIn, z0], [rOut, z0], [rOut, z1], [rIn, z1], [rIn, z0]].map(([r, z]) => new THREE.Vector2(r, z));
  return new THREE.LatheGeometry(pts, seg).rotateX(Math.PI / 2);
}

// The road wheel: a pressed steel disc with six round lightening holes (the Aberdeen and Warsaw carriages), a
// bolted rim, and a broad solid rubber tyre with ribbed tread; axis X, hub facing `side`.
function wheel(P, x, y, z, side) {
  const R = AX.R, tw = AX.tw, Rr = R - 0.13, at = (g) => g.translate(x, y, z);
  const prof = [[Rr, -tw / 2], [R - 0.035, -tw / 2], [R, -tw / 2 + 0.035]];
  for (let i = 0; i < 5; i++) {
    const h0 = -tw / 2 + 0.035 + ((tw - 0.07) * i) / 5, h1 = -tw / 2 + 0.035 + ((tw - 0.07) * (i + 1)) / 5;
    prof.push([R, h0 + 0.004], [R - 0.012, h0 + 0.012], [R - 0.012, h1 - 0.012], [R, h1 - 0.004]);
  }
  prof.push([R, tw / 2 - 0.035], [R - 0.035, tw / 2], [Rr, tw / 2], [Rr, -tw / 2]);
  P.add('tyre', at(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 56).rotateZ(-Math.PI / 2)));
  P.add('camo', at(ring(Rr - 0.06, Rr, -tw * 0.44, tw * 0.44, 48)));
  const disc = new THREE.Shape();
  disc.absarc(0, 0, Rr - 0.04, 0, TAU, false);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, h = new THREE.Path();
    h.absarc(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.085, 0, TAU, true);
    disc.holes.push(h);
  }
  const dg = new THREE.ExtrudeGeometry(disc, { depth: 0.02, bevelEnabled: false, curveSegments: 16 });
  P.add('camo', at(dg.rotateY(Math.PI / 2).translate(side * 0.04 - 0.01, 0, 0)));
  P.add('camo', at(rivets(Array.from({ length: 20 }, (_, i) => V(side * 0.065, Math.cos(i * TAU / 20) * (Rr - 0.08), Math.sin(i * TAU / 20) * (Rr - 0.08))), V(side, 0, 0), 0.016)));
  P.add('camo', at(xTube(-side * 0.1, side * 0.13, 0.15, 0.13, 20)));
  P.add('camo', at(xTube(side * 0.13, side * 0.2, 0.1, 0.08, 16)));
  P.add('dark', at(xTube(side * 0.2, side * 0.23, 0.05, 0.04, 6)));
  P.add('steel', at(rivets(Array.from({ length: 8 }, (_, i) => V(side * 0.13, Math.cos(i * TAU / 8) * 0.12, Math.sin(i * TAU / 8) * 0.12)), V(side, 0, 0), 0.018, 1)));
}

// The deep mudguard over a road wheel: a channel-section arc from just below the axle in front, over the top, to
// below it behind, with tubular stays to the axle and to the girder.
function fender(P, x, y, z, side) {
  const r0 = AX.R + 0.08, hw = 0.21, pts = [[r0, -hw], [r0 + 0.02, -hw], [r0 + 0.02, hw], [r0 - 0.05, hw], [r0 - 0.05, hw - 0.015], [r0, hw - 0.015], [r0, -hw + 0.015], [r0 - 0.05, -hw + 0.015], [r0 - 0.05, -hw], [r0, -hw]];
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 30, Math.PI - 0.12, Math.PI + 0.42).rotateZ(-Math.PI / 2);
  P.add('camo', g.translate(x, y, z));
  P.add('camo', box(0.44, 0.02, 0.2, x, y - 0.02, z - r0 - 0.06, -0.25, 0, 0)); // front lip
  P.add('camo', rod(V(x + side * 0.17, y - 0.02, z - r0), V(x - side * 0.05, y, z - 0.12), 0.022, 6));
  P.add('camo', rod(V(x + side * 0.17, y - 0.15, z + r0 - 0.02), V(x - side * 0.05, y, z + 0.12), 0.022, 6));
  P.add('camo', rod(V(x - side * 0.2, y + r0 * 0.7, z + r0 * 0.7), V(side * 0.63, 0.95, z + 0.75), 0.03, 6));
}

// A grated walkway between x0 and x1, z0 and z1, its top at y: an angle frame, bearer bars and cross bars.
function grating(P, x0, x1, z0, z1, y) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), w = xb - xa, xc = (xa + xb) / 2, len = z1 - z0, zc = (z0 + z1) / 2;
  for (const x of [xa + 0.025, xb - 0.025]) P.add('camo', box(0.05, 0.08, len, x, y - 0.04, zc));
  for (const z of [z0 + 0.025, z1 - 0.025]) P.add('camo', box(w, 0.08, 0.05, xc, y - 0.04, z));
  for (let i = 1; i < 4; i++) P.add('camo', box(0.012, 0.05, len - 0.05, xa + (w * i) / 4, y - 0.025, zc));
  for (let zz = z0 + 0.09; zz < z1 - 0.05; zz += 0.09) P.add('camo', box(w - 0.06, 0.02, 0.022, xc, y - 0.01, zz));
}

// A coil spring along +Z from the origin: coil radius r, length len, n turns, wire radius w.
function helix(r, len, n, w) {
  const curve = new THREE.Curve();
  curve.getPoint = (t, out = new THREE.Vector3()) => out.set(Math.cos(t * n * TAU) * r, Math.sin(t * n * TAU) * r, t * len);
  return new THREE.TubeGeometry(curve, n * 10, w, 5, false);
}

// One equilibrator tube: a unit cylinder from the origin up +Y, with the attributes the field materials' finish and
// the merged parts expect (white tint, height above the ground for the mud line).
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
// the outer tube a fixed length from the lower pivot, the rod over the whole span
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

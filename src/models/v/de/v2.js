import * as THREE from 'three';
import { V, xf, box, rbox, sphere, xTube, yTube, zTube, rod, lathe, ibeamZ, mudguard, tyreGeometry, hubGeometry, Parts } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, node, hb } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { a4Pieces, a4Vanes, a4Radius, A4 } from './missiles.js';
import { withSiteMats, addP, missileMeshes, conifer, mound } from './vweap_kit.js';

// A mobile V-2 (A4) firing point in a wood clearing, autumn 1944 (refs/v2/README.md; v2rocket.com's firing
// procedure from the Backfire film; the Meillerwagen's structure from its Wikipedia article and the surviving
// trailers at Dayton, Cosford and Canberra). The composition: the firing table (Brennstand, Abschussplattform: a
// welded square frame on four legs with screw jacks and broad feet, the turning ring with the four support pads
// the fins stand on, the concave blast deflector cone on its base plate under the nozzle, a dial sight) on steel
// sleepers; the cable mast at its corner with the umbilical cable to the plug low on the tail; the Meillerwagen
// (FR-Wagen) backed up to it: its trunnion end on a steerable truck of twin wheels, a lattice chassis of tubes
// converging aft onto the turntable of a two-axle bogie, the swing-out outrigger booms with their jacks, the
// lifting frame (two I-beams, ladder rungs, the clamp collars round the tail and behind the warhead, folding work
// platforms, the propellant pipes along the starboard beam) raised by two telescopic rams worked from a small
// petrol engine's pump; the A4. Round it: the Opel Blitz alcohol tanker with its trailer pump, the liquid oxygen
// trailer (lagged tank, frost while it fills) and its Hanomag SS 100 tractor, the Opel Blitz T-Stoff tanker, the
// Steyr power truck, the Meillerwagen's own Hanomag on the track, an aiming circle on its tripod with the aiming
// posts, slit trenches; about 100 m off the Feuerleitpanzer (Sd.Kfz. 7/3, the 8 t halftrack with an armoured
// body) dug in behind an earth bank with its cable drum, the firing cable along the ground. Conifers ring the
// clearing (rig.trees, which the render layer may hide where the world plants its own wood).
//
// Frame: origin on the ground at the firing table's centre. The Meillerwagen lies along +Z from the table (its
// tow bar toward +Z), its lifting frame hinged at the trunnion end by the table: the frame's pivot `erector`
// turns about x (rotation.x 0 flat, -90 degrees upright). `meiller` carries the trailer (position.z 0 at the
// table, +30 m withdrawn); `table` the turning ring and the standing rocket (rotation.y). No traverse or
// elevation pivots.
//   setErect(k)      0 the rocket lying on the frame, 1 upright on the table (the rocket leaves the frame then:
//                    the clamp collars open, the work platforms fold down to it)
//   setMeiller(k)    0 at the table, 1 withdrawn 30 m (with the rocket standing the frame folds down as it goes,
//                    the platforms fold up and the outriggers swing in first)
//   setTable(rad)    the ring and the standing rocket turned about the vertical (the fin alignment)
//   setFuel({ alcohol, lox })  0..1: the hoses connected (> 0, while the Meillerwagen is at the table), the frost
//                    on the oxygen tank's zone of the rocket and on the oxygen trailer's tank (opacity follows lox)
//   setRocket(visible)
//   setClamps(k)     null: the collars open as the rocket stands (the default); 0..1 drives them (the drill opens
//                    them once the fins are on the pads)
//   setHoses({ alcohol, tstoff, lox })  overrides which hoses show (null: from setFuel)
//   setVanes(pitch, yaw, roll)  the A4's jet vanes (radians, each clamped to 15 degrees) and air vanes (two thirds,
//                    to 10 degrees) mixed as it steered: I and III together in pitch, II and IV in yaw, all four
//                    the same way round in roll (missiles.js a4Vanes); 0, 0, 0 neutral
// Anchors: rocket (the rocket's base on the table), muzzle (the nose of the standing rocket, its -Z up),
// bunker (the firing control vehicle), eye, breech, shellStack, crew spots.
// rig.v2 { meiller, arm, table, plats, booms, rocket }: the moving parts, for the crew (render/crews_vweap.js);
// V2_LAYOUT: the site's places in root space.

export const T = 1.5; // the table's support pads: the rocket's base above the ground (the cutaway; the Peenemünde table)
const ZB = 0.35, D = 1.55, BY = 0.45; // the rocket's base along the frame from its pivot, its axis and the beams above the pivot line
const PIV = { y: T - ZB, z: D }; // the frame's pivot (the trunnions), so that the upright rocket stands on the table
export const WITHDRAW = 30;
const FLP = { x: -62, z: 78 }; // the Feuerleitpanzer, about 100 m off
const ALC = { x: 8.6, z: 5.5 }, PUMP = { x: 8.6, z: 11.2 }, TST = { x: 4.5, z: -12.5 };
const LOX = { x: -8.4, z: 5.0 }, LOXT = { x: -8.4, z: -2.4 }, PWR = { x: -9.5, z: 15.5 }, HAN = { x: 6.6, z: 22.5 };
const MAST = { x: -0.7, z: -2.05, h: 4.3 }; // the cable mast at the table's corner
const RAM = { x: 0.34, base: [0.75, PIV.z + 6.2], lug: [0.05, 4.2], outer: 1.9 }; // the hydraulic rams: chassis end (y, z), frame lug (local y, z)
const PLAT = [{ z: 7.75, w0: 0.93, w1: 1.3, reach: 0.7 }, { z: 11.6, w0: 0.68, w1: 1.05, reach: 0.55 }]; // the work platforms on the frame
// The site's places in root space for the crew (render/crews_vweap.js)
export const V2_LAYOUT = {
  T, ZB, D, BY, PIV, WITHDRAW, FLP, ALC, PUMP, TST, LOX, LOXT, PWR, HAN, MAST, PLAT, RAM,
  CRANK: { x: -1.88, y: 1.18, z: 0.35 }, // the table's turning crank (its handwheel)
  CIRCLE: { x: -1.6, z: -11 }, // the aiming circle on its tripod
  TRENCHES: [[-14, -6, 0.3], [-15, -1, -0.2], [13, -7, -0.4]], // slit trenches (x, z, turn)
  LOXVENT: { x: -8.05, y: 3.25, z: 3.4 }, // the oxygen trailer's vent
};
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

// a cylinder of unit height standing on y = 0 (scaled along y for the rams)
const unitTube = (r, seg = 12) => new THREE.CylinderGeometry(r, r, 1, seg).translate(0, 0.5, 0);
// the attributes Parts gives its merged meshes (white vertex colour; aH, the height for the surface finish's mud
// line), for the few meshes built outside it
function paintable(g, h = 2) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(h), 1));
  return g;
}
// a sink that puts geometry built in a vehicle's own frame (front -Z, ground y = 0) at (x, z), turned by ry
function at(P, x, z, ry, y = 0) {
  const m = xf(x, y, z, 0, ry, 0);
  return { add(k, g, o) { P.add(k, g.applyMatrix4(m), o); return this; } };
}
// a road wheel (fewer segments than kit's addWheel: these are small at the distances they are seen from)
function wheel(S, x, y, z, R, W, side, seg = 36) {
  S.add('tyre', tyreGeometry(R, W, 16, seg).translate(x, y, z));
  S.add('rim', hubGeometry(R, W, side).translate(x, y, z));
}

export function buildV2Site() {
  const rig = newGunRig('v2', 'earth');
  const mats = withSiteMats(rig), root = rig.root, rnd = mulberry32(204);
  const mk = () => new Parts(mats);
  const P = mk(), PT = mk(), PM = mk(), PA = mk(), PC = mk();
  rig.recoilLength = 0;
  rig.loadEl = 0;
  rig.setTraverse = rig.setElevation = rig.setRecoil = rig.setBreech = () => {};
  // the frost: one material per site, so its opacity is this site's
  const frost = new THREE.MeshStandardMaterial({ color: 0xe6eef4, roughness: 0.95, metalness: 0, transparent: true, opacity: 0, depthWrite: false, alphaMap: frostAlpha() });

  // ================================================================ the firing table
  // Welded steel, about 1.6 t (v2rocket.com): the square frame 2.9 m across with its top 1.3 m up, the legs at the
  // corners on screw jacks (screwed down to lift it off its towing dolly and to level it), braces from the legs
  // to the frame's middles, the deflector under it all. The ring turns on the frame (a chain round its rim, the
  // crank's gearbox on the frame), carrying the four pads under the fins.
  const FH = T - 0.2, FB = 1.3, LEG = 1.3, FOOT = 0.13; // frame top, the frame members' centre line, legs, the feet on the sleepers
  for (const s of [-1, 1]) {
    P.add('camo', box(2.9, 0.22, 0.18, 0, FH - 0.11, s * FB));
    P.add('camo', box(0.18, 0.22, 2.9, s * FB, FH - 0.11, 0));
    P.add('dark', box(2.9, 0.012, 0.012, 0, FH - 0.03, s * (FB + 0.09))); // the welded seam along the top
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = sx * LEG, z = sz * LEG;
    P.add('camo', box(0.64, 0.06, 0.2, sx * 1.075, FH - 0.03, sz * 1.075, 0, Math.atan2(-sz, sx), 0)); // the corner strut under the ring
    P.add('camo', yTube(FOOT + 0.52, FH - 0.2, 0.085, 0.085, 10, x, z)); // the leg
    P.add('camo', box(0.24, 0.22, 0.24, x, FH - 0.34, z)); // its knuckle (the legs fold for towing)
    P.add('steel', xTube(x - 0.13, x + 0.13, 0.035, 0.035, 8, FH - 0.34, z)); // the knuckle's pin
    P.add('camo', yTube(FOOT + 0.4, FOOT + 0.56, 0.12, 0.12, 12, x, z)); // the jack's nut housing
    P.add('steel', yTube(FOOT + 0.06, FOOT + 0.42, 0.05, 0.05, 10, x, z)); // the screw
    P.add('camo', box(0.56, 0.04, 0.56, x, FOOT + 0.02, z)); // the foot
    P.add('camo', yTube(FOOT + 0.04, FOOT + 0.14, 0.3, 0.07, 4).rotateY(Math.PI / 4).translate(x, 0, z)); // its pyramid
    P.add('dark', rod(V(x, FOOT + 0.48, z), V(x + sx * 0.32, FOOT + 0.5, z), 0.016, 5)); // the jack's tommy bar
    // braces from low on the leg to the middle of each side it carries
    P.add('camo', rod(V(x, FOOT + 0.7, z), V(0, FH - 0.26, z), 0.04, 6));
    P.add('camo', rod(V(x, FOOT + 0.7, z), V(x, FH - 0.26, 0), 0.04, 6));
  }
  // the deflector: a steel cone with concave flanks on its base plate (scorched), the jet thrown out sideways
  P.add('iron', box(2.3, 0.04, 2.3, 0, 0.02, 0), { tint: 0x9a948a });
  P.add('iron', lathe([[1.06, 0.04], [0.85, 0.08], [0.6, 0.18], [0.38, 0.36], [0.2, 0.6], [0.08, 0.82], [0.0, 0.94]], 28), { tint: 0x8a8278 });
  // the crank's gearbox and handwheel on the -X side, the dial sight on its bracket at the front
  P.add('dark', box(0.2, 0.18, 0.3, -FB - 0.15, FH - 0.12, 0.35));
  P.add('dark', rod(V(-FB - 0.25, FH - 0.12, 0.35), V(-FB - 0.42, FH - 0.12, 0.35), 0.02, 6));
  P.add('dark', new THREE.TorusGeometry(0.12, 0.015, 5, 14).rotateY(Math.PI / 2).translate(-FB - 0.43, FH - 0.12, 0.35));
  P.add('camo', box(0.12, 0.25, 0.12, 0.55, FH + 0.02, -FB - 0.12));
  P.add('dark', yTube(FH + 0.14, FH + 0.3, 0.06, 0.06, 10, 0.55, -FB - 0.12));
  P.add('steel', zTube(-FB - 0.22, -FB - 0.02, 0.025, 0.025, 8, 0.55, FH + 0.3));
  // the steel sleepers the feet stand on, and a mat of planks over the soft ground
  for (const s of [-1, 1]) P.add('iron', box(3.6, 0.13, 0.3, 0, 0.065, s * LEG), { tint: 0x8a8070 });
  for (let i = 0; i < 9; i++) addP(P, 'plank', box(6.2, 0.05, 0.34, 0, 0.0, -2.9 + i * 0.72, 0, (rnd() - 0.5) * 0.03, 0), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
  // ---- the turning ring (pivot `table`): the ring, its chain, the four pads with their locating pins
  const table = node(root, 'table', 0, 0, 0);
  rig.pivots.table = table;
  PT.add('camo', lathe([[1.06, FH], [1.27, FH], [1.27, FH + 0.11], [1.06, FH + 0.11], [1.06, FH]], 48));
  PT.add('dark', new THREE.TorusGeometry(1.28, 0.016, 5, 64).rotateX(Math.PI / 2).translate(0, FH + 0.04, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 1.16, z = Math.sin(a) * 1.16;
    PT.add('camo', yTube(FH + 0.11, T - 0.06, 0.13, 0.13, 14, x, z));
    PT.add('steel', yTube(T - 0.06, T, 0.15, 0.15, 14, x, z)); // the machined pad
    PT.add('steel', yTube(T, T + 0.1, 0.025, 0.025, 6, x, z)); // the pin into the fin's foot
  }
  const tableHolder = node(table, 'tableHolder', 0, T, 0);

  // ---- the cable mast at the table's corner: the umbilical cable runs from its arm down to the plug on the tail
  {
    const { x, z, h } = MAST;
    P.add('camo', box(0.5, 0.04, 0.5, x, 0.02, z));
    P.add('camo', yTube(0.04, h, 0.07, 0.05, 10, x, z));
    P.add('camo', rod(V(x, h - 0.1, z), V(x * 0.2, h - 0.1, -0.85), 0.04, 6)); // the arm over toward the rocket
    P.add('dark', rod(V(x, h, z), V(x - 2.6, 0.02, z - 2.6), 0.008, 4)); // its guy
    P.add('dark', box(0.08, 0.3, 0.08, x - 2.6, 0.15, z - 2.6));
    P.add('dark', box(0.25, 0.35, 0.18, x, 1.1, z + 0.12)); // the junction box
  }
  const cable = new THREE.Mesh(paintable(unitTube(0.028, 6)), mats.rubber);
  root.add(cable);
  const MAST_TIP = V(MAST.x * 0.2, MAST.h - 0.16, -0.85);

  // ================================================================ the Meillerwagen
  const meiller = node(root, 'meiller', 0, 0, 0);
  rig.pivots.meiller = meiller;
  let booms;
  {
    const S = PM, Z0 = PIV.z, ZT = Z0 + 1.1, ZB2 = ZT + 9.8; // trunnion box, the front truck's axle, the bogie's centre (wheelbase 9.8 m)
    // the transverse trunnion box with the bearing pedestals of the frame's trunnions; two brake air tanks across it
    S.add('camo', box(2.5, 0.38, 0.44, 0, 0.88, Z0 + 0.04));
    for (const s of [-1, 1]) {
      S.add('camo', box(0.22, PIV.y - 0.9, 0.36, s * 0.74, (PIV.y + 0.9) / 2, Z0 + 0.05));
      S.add('steel', xTube(s * 0.62, s * 0.86, 0.15, 0.15, 14, PIV.y, Z0));
    }
    for (const y of [0.42, 0.62]) S.add('iron', xTube(-0.9, 0.9, 0.11, 0.11, 12, y, Z0 + 0.42));
    // the front truck: twin wheels on swinging axles, a transverse leaf spring, the truck's frame and turntable
    for (const s of [-1, 1]) for (const dx of [0.93, 1.2]) wheel(S, s * dx, 0.5, ZT, 0.5, 0.26, s, 40);
    S.add('dark', xTube(-1.07, 1.07, 0.075, 0.075, 10, 0.5, ZT));
    for (let i = 0; i < 4; i++) S.add('dark', box(1.5 - i * 0.28, 0.035, 0.09, 0, 0.66 + i * 0.035, ZT));
    S.add('camo', box(1.1, 0.14, 0.8, 0, 0.84, ZT));
    S.add('camo', yTube(0.86, 0.94, 0.45, 0.45, 20, 0, ZT));
    for (const s of [-1, 1]) S.add('dark', rod(V(s * 0.95, 0.5, ZT), V(s * 0.2, 0.62, ZT + 0.45), 0.035, 6)); // the wishbones
    // the lattice chassis: six tubes from the trunnion box converging aft onto one main tube over the bogie
    const pts = (s) => [[V(s * 1.02, 1.07, Z0 + 0.25), V(s * 0.16, 0.98, Z0 + 7.6)], [V(s * 0.58, 0.82, Z0 + 0.25), V(s * 0.12, 0.88, Z0 + 7.6)], [V(s * 0.42, 0.5, Z0 + 0.25), V(s * 0.1, 0.72, Z0 + 7.6)]];
    const lerp3 = ([a, b], k) => a.clone().lerp(b, k);
    for (const s of [-1, 1]) {
      const L = pts(s);
      for (const m of L) S.add('camo', rod(m[0], m[1], 0.055, 8));
      for (let k = 1; k < 8; k++) {
        const u = k / 8, u2 = (k + 1) / 8;
        S.add('camo', rod(lerp3(L[0], u), lerp3(L[2], u), 0.03, 6));
        S.add('camo', rod(lerp3(L[0], u), lerp3(L[1], u2), 0.025, 5));
        if (s > 0) S.add('camo', rod(lerp3(L[2], u), lerp3(pts(-1)[2], u), 0.025, 5));
      }
    }
    S.add('camo', zTube(Z0 + 7.5, ZB2 + 0.2, 0.16, 0.16, 14, 0, 0.9)); // the main tube
    S.add('camo', box(0.5, 0.4, 0.5, 0, 0.9, Z0 + 7.6)); // where the tubes meet it
    // rests under the frame's beams
    for (const z of [Z0 + 5.2, ZB2 - 0.9]) for (const s of [-1, 1]) {
      const y0 = z < Z0 + 7 ? 1.02 : 0.95, y1 = PIV.y + BY - 0.16;
      S.add('camo', box(0.16, y1 - y0, 0.2, s * 0.55, (y1 + y0) / 2, z));
    }
    // the bogie: the turntable under the main tube, two axles of single wheels (the rear one steered), springs,
    // and the tow arm at the rear axle (it floats level on its sprung stem)
    S.add('camo', yTube(0.72, 0.84, 0.72, 0.72, 28, 0, ZB2));
    S.add('dark', yTube(0.66, 0.72, 0.64, 0.64, 28, 0, ZB2));
    S.add('camo', box(1.7, 0.18, 2.3, 0, 0.6, ZB2));
    for (const dz of [-0.8, 0.8]) {
      for (const s of [-1, 1]) wheel(S, s * 1.12, 0.5, ZB2 + dz, 0.5, 0.3, s, 40);
      S.add('dark', xTube(-1.0, 1.0, 0.07, 0.07, 10, 0.5, ZB2 + dz));
      for (let i = 0; i < 3; i++) S.add('dark', box(1.3 - i * 0.3, 0.035, 0.09, 0, 0.62 + i * 0.035, ZB2 + dz));
    }
    for (const s of [-1, 1]) S.add('camo', rod(V(s * 0.55, 0.6, ZB2 + 1.0), V(0, 0.68, ZB2 + 3.4), 0.05, 8));
    S.add('dark', new THREE.TorusGeometry(0.14, 0.035, 6, 12).rotateX(Math.PI / 2).translate(0, 0.68, ZB2 + 3.55));
    S.add('dark', yTube(0.3, 0.68, 0.035, 0.035, 6, 0, ZB2 + 2.6)); // the stem's spring strut
    // the hydraulic pump's petrol engine (a Volkswagen engine), its oil tank and the control valves on the right
    S.add('camo', rbox(0.62, 0.52, 0.78, 0.05, 0.96, 0.62, Z0 + 6.7));
    S.add('dark', box(0.5, 0.2, 0.1, 0.96, 0.74, Z0 + 6.28)); // its cooling grille
    S.add('camo', zTube(Z0 + 7.2, Z0 + 7.9, 0.2, 0.2, 14, 0.96, 0.62));
    S.add('dark', box(0.14, 0.42, 0.36, 1.32, 0.98, Z0 + 7.2));
    for (let i = 0; i < 3; i++) S.add('steel', rod(V(1.4, 1.1, Z0 + 7.08 + i * 0.12), V(1.55, 1.42, Z0 + 7.08 + i * 0.12), 0.012, 5)); // the levers
    // the rams' trunnion blocks on the chassis
    for (const s of [-1, 1]) S.add('dark', box(0.2, 0.2, 0.3, s * RAM.x, RAM.base[0] - 0.05, RAM.base[1]));
    // P-Stoff (compressed nitrogen): the bank of six fixed bottles on the left; a tool locker
    for (let i = 0; i < 6; i++) S.add('iron', zTube(Z0 + 2.6, Z0 + 4.0, 0.1, 0.1, 10, -0.66 - (i % 3) * 0.21, 0.42 + Math.floor(i / 3) * 0.2), { tint: 0x7d8a70 });
    S.add('steel', xTube(-1.2, -0.5, 0.025, 0.025, 6, 0.72, Z0 + 2.55));
    S.add('camo', box(0.4, 0.4, 1.1, -1.08, 0.72, Z0 + 5.8));
    // the outrigger booms (pivots `boomL` / `boomR`): an A-frame swung out forward of the trunnions to a screw jack
    booms = [-1, 1].map((s) => {
      const g = node(meiller, s < 0 ? 'boomL' : 'boomR', s * 1.15, 0, Z0 + 0.6);
      const B = mk(), J = V(s * 1.45, 0.82, -1.55);
      B.add('camo', rod(V(0, 0.95, -0.35), J, 0.05, 8));
      B.add('camo', rod(V(0, 0.7, 0.55), J, 0.05, 8));
      B.add('camo', yTube(0.2, 0.98, 0.08, 0.08, 10, J.x, J.z));
      B.add('camo', yTube(0.06, 0.24, 0.045, 0.045, 8, J.x, J.z), { tint: 0x8a8a8a });
      B.add('camo', box(0.5, 0.05, 0.5, J.x, 0.04, J.z));
      B.add('camo', rod(V(J.x, 0.9, J.z), V(J.x + s * 0.25, 0.9, J.z), 0.015, 5), { tint: 0x707070 });
      B.build(g, { dirt: 0.35, y0: 0 });
      return { g, s };
    });
  }

  // ---- the lifting frame (pivot `erector`): two I-beams with braces carried BY above the trunnions, ladder rungs,
  // the clamps, the piping; the rocket lies just above the beams (the Backfire and Dayton photographs)
  const arm = node(meiller, 'erector', 0, PIV.y, PIV.z);
  rig.pivots.erector = arm;
  const R = (s) => a4Radius(s); // the rocket's radius at a station
  {
    const S = PA, Y = BY;
    for (const s of [-1, 1]) S.add('camo', ibeamZ(-0.25, 13.1, 0.32, 0.14, 0.022, s * 0.55, Y));
    S.add('steel', xTube(-0.86, 0.86, 0.085, 0.085, 12, 0, 0)); // the trunnion shaft
    for (const s of [-1, 1]) S.add('camo', box(0.1, Y + 0.25, 0.55, s * 0.55, (Y - 0.25) / 2 + 0.0, 0.1)); // the trunnion brackets
    for (const z of [0.7, 2.3, 4.2, 5.9, 7.4, 9.1, 10.7, 12.6]) S.add('camo', xTube(-0.53, 0.53, 0.045, 0.045, 8, Y - 0.06, z));
    for (const [z0, z1, s] of [[0.7, 2.3, 1], [2.3, 4.2, -1], [4.2, 5.9, 1], [5.9, 7.4, -1], [7.4, 9.1, 1], [9.1, 10.7, -1], [10.7, 12.6, 1]]) S.add('camo', rod(V(-0.5 * s, Y - 0.12, z0), V(0.5 * s, Y - 0.12, z1), 0.03, 6));
    // the C-shaped rungs on the beams' outer faces: steps when the frame stands
    for (const s of [-1, 1]) for (let z = 0.45; z < 12.9; z += 0.34) {
      const x = s * 0.68;
      S.add('dark', rod(V(s * 0.6, Y + 0.12, z), V(x, Y + 0.12, z + 0.13), 0.012, 4));
      S.add('dark', rod(V(s * 0.6, Y - 0.12, z), V(x, Y - 0.12, z + 0.13), 0.012, 4));
      S.add('dark', rod(V(x, Y - 0.12, z + 0.13), V(x, Y + 0.12, z + 0.13), 0.014, 4));
    }
    // the rams' lugs under the frame
    S.add('camo', box(0.95, 0.14, 0.3, 0, Y - 0.2, RAM.lug[1]));
    for (const s of [-1, 1]) S.add('dark', box(0.08, Y - 0.1 - RAM.lug[0] + 0.1, 0.2, s * RAM.x, (Y - 0.1 + RAM.lug[0]) / 2, RAM.lug[1]));
    // the clamp collars: the cradle halves (fixed) round the tail at the tank section's joint and round the nose
    // behind the warhead, on brackets from the beams; a saddle under the tank section between them
    const ring = (z, r) => new THREE.TorusGeometry(r, 0.05, 6, 28, Math.PI).rotateZ(Math.PI).translate(0, D, z);
    for (const [z, r] of [[ZB + A4.L - 9.6, R(9.6) + 0.04], [ZB + A4.L - 2.05, R(2.05) + 0.04]]) {
      S.add('camo', ring(z, r));
      S.add('camo', box(0.18, 0.09, 0.18, r, D, z)); // the latch and hinge lugs
      S.add('camo', box(0.18, 0.09, 0.18, -r, D, z));
      for (const s of [-1, 1]) S.add('camo', rod(V(s * 0.55, Y + 0.14, z), V(s * (r + 0.04), D - 0.04, z), 0.06, 8));
      S.add('camo', box(1.24, 0.12, 0.28, 0, Y + 0.2, z));
      if (D - r - Y - 0.26 > 0.02) S.add('camo', box(0.5, D - r - Y - 0.26, 0.24, 0, (D - r + Y + 0.26) / 2, z)); // the saddle post
    }
    {
      const z = ZB + A4.L - 6.2, r = R(6.2) + 0.04;
      S.add('camo', new THREE.TorusGeometry(r, 0.045, 6, 20, Math.PI * 0.5).rotateZ(Math.PI * 1.25).translate(0, D, z));
      S.add('camo', box(0.9, 0.12, 0.24, 0, Y + 0.2, z));
    }
    // the nose clamp's screw support with its handwheel
    S.add('camo', yTube(Y + 0.16, D - R(2.6) + 0.02, 0.07, 0.07, 10, 0, ZB + A4.L - 2.6));
    S.add('dark', new THREE.TorusGeometry(0.13, 0.014, 5, 14).rotateX(Math.PI / 2).translate(0, Y + 0.32, ZB + A4.L - 2.6));
    // pipes: B-Stoff (alcohol) slung under the starboard beam its full length, P-Stoff beside it, T-Stoff to half
    // way (and its measuring tank); A-Stoff (liquid oxygen) lagged down the middle of the lower half
    S.add('steel', zTube(0.25, 11.0, 0.035, 0.035, 8, 0.55, Y - 0.22));
    S.add('steel', zTube(0.25, 12.6, 0.02, 0.02, 6, 0.68, Y));
    S.add('steel', zTube(0.25, 6.6, 0.025, 0.025, 6, 0.68, Y - 0.08));
    for (let z = 1; z < 11; z += 1.4) S.add('dark', box(0.05, 0.1, 0.04, 0.55, Y - 0.18, z)); // the straps
    S.add('steel', zTube(9.6, 10.3, 0.2, 0.2, 14, 0.95, Y + 0.22));
    S.add('camo', box(0.36, 0.06, 0.6, 0.8, Y + 0.0, 9.95));
    addP(S, 'lagging', zTube(0.3, 7.3, 0.055, 0.055, 8, 0, Y - 0.15));
    // the box on its strut at the frame's top end (the control compartment's batteries, the filler connection, tools)
    S.add('camo', box(0.1, 0.3, 0.1, 0.62, Y + 0.25, 12.95));
    S.add('camo', box(0.5, 0.42, 0.5, 0.85, Y + 0.55, 12.95));
    S.add('dark', box(0.4, 0.03, 0.4, 0.85, Y + 0.775, 12.95));
  }
  // the clamps' upper halves (pivot `clamps`): hinged on one side, open once the rocket stands on the table
  const clamps = node(arm, 'clamps', 0.95, D, 0);
  for (const [z, r] of [[ZB + A4.L - 9.6, R(9.6) + 0.04], [ZB + A4.L - 2.05, R(2.05) + 0.04]]) {
    PC.add('camo', new THREE.TorusGeometry(r, 0.05, 6, 28, Math.PI).translate(-0.95, 0, z));
    if (r < 0.85) PC.add('camo', box(0.95 - r, 0.09, 0.14, -(0.95 - r) / 2, 0, z));
    PC.add('camo', zTube(z - 0.1, z + 0.1, 0.035, 0.035, 8, 0, 0), { tint: 0x8a8a8a });
  }
  // the work platforms (pivots `platform0`, `platform1`): grated forks hinged across the beams, folded flat along
  // the frame, swung out once the rocket stands so that their arms flank it (the crews worked from them at the
  // instrument compartment and at the tank section's joint)
  const plats = PLAT.map((p, i) => {
    const g = node(arm, 'platform' + i, 0, BY + 0.16, p.z), B = mk(), L = D - BY - 0.16 + p.reach;
    B.add('camo', box(2 * p.w1, 0.04, 0.1, 0, 0.02, 0.05));
    for (const s of [-1, 1]) {
      const xm = s * (p.w0 + p.w1) / 2, w = p.w1 - p.w0;
      B.add('camo', box(w, 0.04, L, xm, 0.02, L / 2));
      for (let k = 0; k < 3; k++) B.add('camo', box(0.02, 0.025, L - 0.1, xm + (k - 1) * w * 0.3, -0.012, L / 2), { tint: 0x707070 }); // the grating's bars
      B.add('camo', box(0.04, 0.12, L, s * p.w1, -0.06, L / 2)); // the toe board
    }
    B.add('camo', xTube(-p.w1, p.w1, 0.03, 0.03, 8, 0.0, 0.0), { tint: 0x8a8a8a }); // the hinge
    B.build(g, { dirt: 0.1, y0: PIV.y });
    return g;
  });
  // the hydraulic rams: an outer cylinder from the trailer's chassis, three telescoping stages out of it to the lug
  // on the frame (posed in setErect, in the trailer's frame)
  const teleG = (() => {
    const l = [];
    [[0.115, 0, 0.36], [0.095, 0.33, 0.69], [0.075, 0.66, 1]].forEach(([r, a, b]) => l.push(unitTube(r, 12).scale(1, b - a, 1).translate(0, a, 0)));
    l.push(yTube(0.98, 1.0, 0.1, 0.1, 10));
    return paintable(mergeGeoms(l));
  })();
  const rams = [-1, 1].map((s) => {
    const g = node(meiller, 'ram', s * RAM.x, RAM.base[0], RAM.base[1]);
    const cyl = new THREE.Mesh(paintable(unitTube(0.145, 14)), mats.camo), tel = new THREE.Mesh(teleG, mats.steel);
    cyl.scale.y = RAM.outer;
    tel.position.y = RAM.outer - 0.15;
    g.add(cyl, tel);
    return { g, tel, at: V(s * RAM.x, RAM.lug[0], RAM.lug[1]) };
  });

  // ---- the rocket (built standing: base at y = 0) and its frost
  const rocket = new THREE.Group();
  rocket.name = 'rocket';
  const inner = node(rocket, 'a4', 0, A4.L / 2, 0, Math.PI / 2, 0, 0); // the missile frame's nose (-Z) up
  const a4 = a4Pieces(Math.PI / 4, { split: true });
  missileMeshes(inner, a4.lists);
  const vanes = a4Vanes(inner, a4.vanes); // the air and jet vanes on their hinges (two draws)
  const frostR = new THREE.Mesh(new THREE.CylinderGeometry(A4.R + 0.012, A4.R + 0.012, A4.lox[1] - A4.lox[0], 40, 1, true).translate(0, (A4.lox[0] + A4.lox[1]) / 2, 0), frost);
  rocket.add(frostR);
  const armHolder = node(arm, 'armHolder', 0, D, ZB, Math.PI / 2, 0, 0); // rocket +Y along the frame (+Z)
  // the umbilical plug's place on the standing rocket (table at 0): the fairing low on the tail (missiles.js)
  const PLUG = (() => {
    const a = Math.PI / 4 + A4.plug.da, r = a4Radius(A4.plug.s) + 0.06;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: T + A4.L - A4.plug.s };
  })();

  // ================================================================ the vehicles
  // ---- the alcohol tanker: an Opel Blitz 3 t with a tank body (B-Stoff, 75 % ethanol), facing the table, and
  // its trailer pump behind (v2rocket.com's sequence: "the Opel Blitz alcohol tanker towing a trailer pump")
  blitz(at(P, ALC.x, ALC.z, 0), 'tank');
  pumpTrailer(at(P, PUMP.x, PUMP.z, 0));
  // ---- the T-Stoff tanker (hydrogen peroxide in an aluminium tank, its own pump), parked in front of the table
  blitz(at(P, TST.x, TST.z, -Math.PI / 2), 'tstoff');
  // ---- the Steyr power truck (the generator in a box body) with its cable reel
  steyr(at(P, PWR.x, PWR.z, 0.15));
  // ---- the liquid oxygen trailer (Kesselanhänger für Fl-Sauerstoff) and the Hanomag that tows it
  let frostT;
  {
    const S = at(P, LOX.x, LOX.z, 0);
    S.add('camo', box(1.2, 0.18, 6.4, 0, 0.82, 0));
    for (const zz of [-2.0, 1.9]) for (const s of [-1, 1]) wheel(S, s * 0.98, 0.46, zz, 0.46, 0.24, s);
    for (const zz of [-2.0, 1.9]) S.add('dark', xTube(-1.0, 1.0, 0.06, 0.06, 8, 0.46, zz));
    for (const s of [-1, 1]) S.add('camo', box(0.26, 0.05, 1.5, s * 1.0, 1.0, -2.0)), S.add('camo', box(0.26, 0.05, 1.5, s * 1.0, 1.0, 1.9));
    addP(S, 'lagging', zTube(-2.75, 2.45, 0.92, 0.92, 28, 0, 1.92));
    for (const zz of [-2.75, 2.45]) addP(S, 'lagging', sphere(0.92, 0, 1.92, zz, 1, 1, 0.32, 18));
    for (const zz of [-2.1, -0.7, 0.7, 2.0]) S.add('dark', zTube(zz - 0.04, zz + 0.04, 0.935, 0.935, 28, 0, 1.92));
    for (const zz of [-2.2, 2.0]) for (const s of [-1, 1]) S.add('camo', box(0.12, 0.9, 0.14, s * 0.6, 1.2, zz)); // the cradles
    S.add('camo', box(1.5, 1.25, 0.95, 0, 1.55, 3.15)); // the valve cabinet at the rear
    S.add('dark', box(1.2, 0.9, 0.03, 0, 1.6, 3.64));
    for (const s of [-1, 1]) S.add('steel', rod(V(s * 0.3, 1.4, 3.66), V(s * 0.3, 1.4, 3.85), 0.05, 8));
    S.add('steel', yTube(2.75, 3.25, 0.07, 0.07, 8, 0.35, -1.6)); // the vent
    S.add('steel', yTube(2.82, 3.0, 0.25, 0.25, 12, 0, 0.3)); // the manhole dome
    for (const s of [-1, 1]) S.add('dark', box(0.04, 0.04, 4.4, s * 0.35, 2.92, -0.1)); // the walkway's rails
    S.add('camo', rod(V(0, 0.82, -3.2), V(0, 0.75, -4.7), 0.06, 8)); // the drawbar
    S.add('dark', new THREE.TorusGeometry(0.1, 0.03, 5, 10).rotateX(Math.PI / 2).translate(0, 0.75, -4.8));
    frostT = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 5.0, 28, 1, true).rotateX(Math.PI / 2).translate(LOX.x, 1.92, LOX.z - 0.15), frost);
    root.add(frostT);
  }
  hanomag(at(P, LOXT.x, LOXT.z, 0));
  hanomag(at(P, HAN.x, HAN.z, 0.06)); // the Meillerwagen's own tractor, uncoupled on the track

  // ---- the Feuerleitpanzer (Sd.Kfz. 7/3) dug in behind an earth bank, facing the table, its cable drum trailer
  const flpRy = face(FLP.x, FLP.z, 0, 0);
  sdkfz7(at(P, FLP.x, FLP.z, flpRy));
  {
    const toW = (lx, lz) => { const c = Math.cos(flpRy), s = Math.sin(flpRy); return [FLP.x + lx * c + lz * s, FLP.z - lx * s + lz * c]; };
    // the spoil of the pit it stands in, thrown up in a bank in front and along both sides
    const bank = [[-3.0, 1.5], [-3.1, -1.0], [-3.0, -3.6], [-2.4, -5.6], [-0.8, -6.4], [0.8, -6.4], [2.4, -5.6], [3.0, -3.6], [3.1, -1.0], [3.0, 1.5]];
    for (const [lx, lz] of bank) { const [x, z] = toW(lx, lz); mound(P, x, z, 2.6, 2.6, 0.75, rnd, 3); }
    const [dx, dz] = toW(0.4, 5.6);
    cableDrum(at(P, dx, dz, flpRy));
  }
  // the firing cable from the mast's foot to the drum, and the power truck's cable, laid along the ground
  {
    const line = (pts) => { for (let i = 0; i < pts.length - 1; i++) P.add('rubber', rod(pts[i], pts[i + 1], 0.022, 4)); };
    const c = Math.cos(flpRy), s = Math.sin(flpRy), dx = FLP.x + 0.4 * c + 5.0 * s, dz = FLP.z - 0.4 * s + 5.0 * c;
    line([V(MAST.x, 0.03, MAST.z), V(-2.6, 0.03, -0.6), V(-3.2, 0.03, 2.5), V(-12, 0.03, 13), V(-30, 0.03, 34), V(-47, 0.03, 58), V(dx, 0.03, dz)]);
    line([V(MAST.x - 0.1, 0.03, MAST.z), V(-3.8, 0.03, -1.4), V(-5.6, 0.03, 4.0), V(-7.0, 0.03, 9.5), V(PWR.x + 0.5, 0.03, PWR.z + 2.7)]);
  }
  // the aiming circle on its tripod in front of the table, and the aiming posts on the line of fire beyond it
  {
    const x = -1.6, z = -11, y = 1.35;
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; P.add('timber', rod(V(x, y - 0.1, z), V(x + Math.cos(a) * 0.55, 0, z + Math.sin(a) * 0.55), 0.022, 5)); }
    P.add('dark', yTube(y - 0.12, y, 0.08, 0.08, 10, x, z));
    P.add('dark', box(0.1, 0.12, 0.22, x, y + 0.1, z));
    P.add('steel', zTube(z - 0.12, z + 0.12, 0.025, 0.025, 8, x, y + 0.2));
    for (const pz of [-20, -32]) for (let k = 0; k < 4; k++) P.add('white', yTube(k * 0.5, k * 0.5 + 0.5, 0.025, 0.025, 6, 0, pz), { tint: k % 2 ? 0xffffff : 0x8a2a20 }); // red and white
  }
  // slit trenches for the crew (the spoil heaped on the side toward the table) and the spoil from levelling
  for (const [x, z, ry] of [[-14, -6, 0.3], [-15, -1, -0.2], [13, -7, -0.4]]) {
    const c = Math.cos(ry), s = Math.sin(ry);
    P.add('soil', box(0.7, 0.03, 4.2, x, 0.01, z, 0, ry, 0), { tint: 0x5a4a3c });
    for (let k = -1; k <= 1; k++) mound(P, x + (x < 0 ? 0.9 : -0.9) * c + k * 1.3 * s, z - (x < 0 ? 0.9 : -0.9) * s + k * 1.3 * c, 1.4, 1.6, 0.5, rnd, 2);
  }
  mound(P, 15, 13, 4, 3, 0.8, rnd, 4);

  // ---- the hoses (shown while fuelling, the Meillerwagen at the table): tanker to the frame's inlet at its foot,
  // the frame's own pipe up, a short hose from its top to the rocket's filler
  const tube = (pts, r, mat) => {
    const m = new THREE.Mesh(paintable(mergeGeoms(pts.map((p) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), Math.max(8, p.length * 8), r, 6)))), mat);
    m.castShadow = true;
    m.visible = false;
    root.add(m);
    return m;
  };
  const up = (lx, ly, lz) => V(lx, PIV.y + lz, PIV.z - ly); // a point of the standing frame
  const hoseA = tube([
    [V(PUMP.x - 0.5, 0.75, PUMP.z - 0.3), V(PUMP.x - 1.6, 0.08, PUMP.z - 1.0), V(5.5, 0.08, 6.5), V(2.4, 0.08, 3.6), V(1.0, 0.5, 2.3), up(0.55, BY - 0.22, 0.3)],
    [up(0.55, BY - 0.22, 11.0), up(0.45, BY + 0.1, 11.15), V(0.15, T + A4.L - 3.75 + 0.15, R(3.75) + 0.35), V(0, T + A4.L - 3.75, R(3.75) + 0.02)],
  ], 0.045, mats.hose);
  const hoseL = tube([
    [V(LOX.x + 0.3, 1.4, LOX.z + 3.85), V(LOX.x + 1.4, 0.08, LOX.z + 4.6), V(-4.5, 0.08, 6.0), V(-1.6, 0.08, 3.4), V(-0.5, 0.5, 2.4), up(0, BY - 0.15, 0.3)],
    [up(0, BY - 0.15, 7.3), up(0, BY + 0.15, 7.45), V(0, T + A4.L - 6.75 + 0.1, R(6.75) + 0.3), V(0, T + A4.L - 6.75, R(6.75) + 0.02)],
  ], 0.06, mats.line);
  // T-Stoff (hydrogen peroxide) from the tanker in front of the table to the filler low on the tail
  const hoseT = tube([
    [V(TST.x - 3.0, 1.0, TST.z), V(TST.x - 3.4, 0.08, TST.z + 2.2), V(0.9, 0.08, -4.0), V(0.75, 0.25, -2.2), V(0.55, 2.1, -1.35), V(0.12, T + 2.05, -0.86), V(0, T + 2.0, -a4Radius(A4.L - 2.0) - 0.02)],
  ], 0.04, mats.hose);

  // ---- the wood round the clearing (a gap where the track comes in), stumps and brushwood
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
  addP(P, 'concrete', box(7.4, 0.04, 7.4, 0, -0.01, 0), { tint: 0xb0a890 }); // the levelled, gravelled pad

  P.build(root, { dirt: 0.3, y0: 0 });
  PT.build(table, { dirt: 0.2, y0: 0 });
  PM.build(meiller, { dirt: 0.35, y0: 0 });
  PA.build(arm, { dirt: 0.15, y0: PIV.y });
  PC.build(clamps, { dirt: 0.1, y0: PIV.y + D });

  // ================================================================ state
  let erect = 0, mWith = 0, rocketOn = true, tableA = 0, fuelA = 0, fuelL = 0, clampK = null, hoseSet = null;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = V(0, 1, 0);
  const pose = () => {
    const standing = erect >= 0.999;
    const fold = standing ? smooth((mWith - 0.03) / 0.3) : 0;
    const ang = -Math.PI / 2 * smooth(erect) * (1 - fold);
    arm.rotation.x = ang;
    meiller.position.z = WITHDRAW * smooth((mWith - 0.02) / 0.98);
    const holder = standing ? tableHolder : armHolder;
    if (rocket.parent !== holder) holder.add(rocket);
    rocket.visible = rocketOn;
    // the collars open once it stands; the platforms swing out to it, and fold back before the frame comes down
    clamps.rotation.z = standing ? -1.9 * (clampK == null ? 1 : smooth(clampK)) * (1 - smooth((fold - 0.85) / 0.15)) : 0;
    const dep = smooth((erect - 0.94) / 0.06) * (1 - smooth(mWith / 0.03));
    for (const g of plats) g.rotation.x = -Math.PI / 2 * dep;
    // the outriggers swing in before the trailer moves
    const stow = smooth(mWith / 0.025);
    for (const b of booms) { b.g.rotation.y = -b.s * 2.35 * stow; b.g.position.y = 0.25 * stow; }
    // the rams from the chassis to their lugs on the frame (all in the trailer's frame)
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const r of rams) {
      _a.set(r.at.x, PIV.y + r.at.y * c - r.at.z * s, PIV.z + r.at.y * s + r.at.z * c).sub(r.g.position);
      const L = _a.length();
      _q.setFromUnitVectors(UP, _b.copy(_a).divideScalar(L));
      r.g.quaternion.copy(_q);
      r.tel.scale.y = Math.max(0.05, L - RAM.outer + 0.15);
    }
    // the umbilical cable: from the mast's arm down to the plug on the tail while the rocket stands there
    cable.visible = rocketOn && standing;
    if (cable.visible) {
      const ca = Math.cos(tableA), sa = Math.sin(tableA);
      _b.set(PLUG.x * ca + PLUG.z * sa, PLUG.y, -PLUG.x * sa + PLUG.z * ca);
      _a.copy(_b).sub(MAST_TIP);
      const L = _a.length();
      cable.position.copy(MAST_TIP);
      cable.quaternion.setFromUnitVectors(UP, _a.divideScalar(L));
      cable.scale.set(1, L, 1);
    }
    const atTable = standing && mWith < 0.005;
    hoseA.visible = (hoseSet ? !!hoseSet.alcohol : fuelA > 0) && atTable;
    hoseL.visible = (hoseSet ? !!hoseSet.lox : fuelL > 0) && atTable;
    hoseT.visible = !!hoseSet?.tstoff && standing && rocketOn;
  };
  rig.setErect = (k) => { erect = clamp01(k); pose(); };
  rig.setMeiller = (k) => { mWith = clamp01(k); pose(); };
  rig.setTable = (rad) => { table.rotation.y = tableA = rad; pose(); };
  rig.setFuel = ({ alcohol = 0, lox = 0 } = {}) => {
    fuelA = alcohol; fuelL = lox;
    frost.opacity = 0.9 * smooth(lox);
    frostR.visible = frostT.visible = lox > 0.01;
    pose();
  };
  rig.setRocket = (v) => { rocketOn = !!v; pose(); };
  rig.setClamps = (k) => { clampK = k; pose(); };
  rig.setHoses = (h) => { hoseSet = h ?? null; pose(); };
  rig.setVanes = vanes.set;
  rig.v2 = { meiller, arm, table, plats, booms, rocket, tableHolder, armHolder };
  // the standing rocket's radius at a height above the ground (for the hands on its skin)
  rig.layout = { ...V2_LAYOUT, rocketR: (h) => a4Radius(Math.min(A4.L, Math.max(0, T + A4.L - h))) };
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
  const flpAt = (lx, lz) => { const c = Math.cos(flpRy), s = Math.sin(flpRy); return [FLP.x + lx * c + lz * s, FLP.z - lx * s + lz * c]; };
  const [lx, lz] = flpAt(1.9, -1.2);
  crewSpot(rig, 'officer', -6, 0, -6, face(-6, -6, 0, 0), 'point');
  crewSpot(rig, 'launcher', lx, 0, lz, flpRy, 'phone');
  crewSpot(rig, 'meiller', 1.95, 0, PIV.z + 7.2, face(1.95, 0, 1.2, 0), 'operate');
  crewSpot(rig, 'table', -2.2, 0, 0.35, face(-2.2, 0.35, -1.6, 0.35), 'crouch');
  crewSpot(rig, 'fuel', PUMP.x - 1.5, 0, PUMP.z - 0.2, face(PUMP.x - 1.5, PUMP.z, PUMP.x, PUMP.z), 'operate');
  crewSpot(rig, 'lox', LOX.x + 1.5, 0, LOX.z + 3.2, face(LOX.x + 1.5, LOX.z + 3.2, LOX.x, LOX.z + 3.2), 'operate');
  crewSpot(rig, 'power', PWR.x + 1.6, 0, PWR.z + 2.6, face(PWR.x + 1.6, PWR.z + 2.6, PWR.x, PWR.z + 2.6), 'stand');
  hb(rig, -1.8, 0, -1.8, 1.8, T + A4.L, 1.8);
  hb(rig, -1.45, 0, 1.6, 1.45, 4.0, 16.6);
  hb(rig, ALC.x - 1.2, 0, ALC.z - 3.3, ALC.x + 1.2, 2.7, ALC.z + 3.1);
  hb(rig, LOX.x - 1.2, 0, LOX.z - 4.9, LOX.x + 1.2, 3.1, LOX.z + 3.9);
  finishGun(rig);
  frostR.castShadow = frostT.castShadow = false; // a skin of rime casts no shadow of its own
  return rig;
}

// merge a list of geometries (position, normal, uv kept)
function mergeGeoms(list) {
  const g = list.map((x) => { x = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k); return x; });
  const n = g.reduce((a, x) => a + x.attributes.position.count, 0), out = new THREE.BufferGeometry();
  for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(n * w);
    let o = 0;
    for (const x of g) { arr.set(x.attributes[k].array, o); o += x.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, w));
  }
  return out;
}

// ================================================================ vehicles (in their own frames: front -Z, ground y = 0)

// Opel Blitz 3 t (3.6-36S): about 6.0 m long, 2.27 m wide, 2.18 m over the cab, wheelbase 3.6 m, 7.25-20 tyres.
// body 'tank': the alcohol tank (an oval tank on the frame, ladder, walkway, filler domes, the hose locker);
// 'tstoff': the smaller aluminium tank of hydrogen peroxide with its pump.
function blitz(S, body) {
  const FA = -2.1, RA = 1.5, WR = 0.475;
  for (const s of [-1, 1]) S.add('dark', box(0.1, 0.18, 5.7, s * 0.45, 0.72, 0.2));
  for (const s of [-1, 1]) { wheel(S, s * 0.84, WR, FA, WR, 0.24, s); wheel(S, s * 0.86, WR, RA, WR, 0.27, s); }
  for (const z of [FA, RA]) S.add('dark', xTube(-0.8, 0.8, 0.06, 0.06, 8, WR, z));
  // the bonnet, the radiator, wings and lamps
  S.add('camo', rbox(0.92, 0.62, 1.3, 0.12, 0, 1.13, -2.4));
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) S.add('dark', box(0.01, 0.2, 0.05, s * 0.465, 1.12, -2.75 + i * 0.12));
  S.add('dark', box(0.84, 0.6, 0.06, 0, 1.1, -3.06));
  for (let i = 0; i < 9; i++) S.add('steel', box(0.02, 0.56, 0.02, -0.36 + i * 0.09, 1.1, -3.1));
  for (const s of [-1, 1]) {
    S.add('camo', mudguard(WR, 0.32, s * 0.84, WR, FA, 15, 165, 0.08, 0.03));
    S.add('camo', box(0.32, 0.03, 0.9, s * 0.84, 0.55, FA + 0.75)); // the wing's running-board end
    S.add('dark', zTube(-2.92, -2.72, 0.1, 0.11, 10, s * 0.66, 1.08));
    S.add('lens', zTube(-2.94, -2.92, 0.085, 0.085, 10, s * 0.66, 1.08));
    S.add('camo', box(0.32, 0.03, 1.3, s * 0.95, 0.6, -1.05)); // running board
    S.add('camo', box(0.36, 0.05, 1.0, s * 0.88, 1.05, RA)); // rear wing
  }
  S.add('dark', box(2.0, 0.12, 0.1, 0, 0.55, -3.15)); // bumper
  // the cab: doors, the windscreen and side windows, the roof
  S.add('camo', rbox(2.0, 0.85, 1.42, 0.05, 0, 1.38, -1.06));
  S.add('camo', box(2.02, 0.42, 0.1, 0, 1.97, -1.72));
  for (const s of [-1, 1]) S.add('camo', box(0.08, 0.42, 1.4, s * 0.98, 1.97, -1.06));
  S.add('camo', box(2.02, 0.42, 0.08, 0, 1.97, -0.4));
  S.add('glass', box(1.7, 0.34, 0.02, 0, 1.98, -1.775));
  for (const s of [-1, 1]) S.add('glass', box(0.02, 0.32, 0.6, s * 1.025, 1.98, -1.25));
  S.add('camo', rbox(2.06, 0.08, 1.52, 0.03, 0, 2.18, -1.06));
  if (body === 'tank') {
    // the tank: about 3.4 m of oval section on its cradles, domes, a walkway and ladder, the hose locker
    const g = zTube(-0.2, 3.0, 0.68, 0.68, 28, 0, 0);
    g.scale(1.38, 1, 1).translate(0, 1.58, 0);
    S.add('camo', g);
    for (const z of [-0.2, 3.0]) S.add('camo', sphere(0.68, 0, 1.58, z, 1.38, 1, 0.3, 18));
    for (const z of [0.4, 2.4]) S.add('camo', box(1.6, 0.25, 0.2, 0, 0.95, z));
    for (const z of [0.6, 2.0]) S.add('steel', yTube(2.2, 2.38, 0.22, 0.22, 12, 0, z));
    for (const s of [-1, 1]) S.add('dark', box(0.03, 0.03, 2.6, s * 0.4, 2.42, 1.3));
    for (let i = 0; i < 5; i++) S.add('dark', box(0.4, 0.025, 0.025, 0.55, 0.85 + i * 0.3, 3.32));
    for (const s of [0.36, 0.74]) S.add('dark', box(0.025, 1.3, 0.025, s, 1.5, 3.32));
    S.add('camo', box(1.9, 0.5, 0.5, 0, 0.62, 2.7)); // the hose locker under the tank's end
  } else {
    // a pump and its engine behind the cab, the aluminium tank (T-Stoff ate steel), a ladder
    S.add('camo', box(1.9, 0.12, 3.6, 0, 0.88, 1.2));
    S.add('steel', zTube(0.0, 2.5, 0.6, 0.6, 24, 0, 1.6), { tint: 0xd8dcd8 });
    for (const z of [0.0, 2.5]) S.add('steel', sphere(0.6, 0, 1.6, z, 1, 1, 0.25, 16), { tint: 0xd8dcd8 });
    for (const z of [0.3, 2.2]) S.add('camo', box(1.4, 0.4, 0.18, 0, 1.12, z));
    S.add('steel', yTube(2.15, 2.35, 0.18, 0.18, 12, 0, 1.0), { tint: 0xd8dcd8 });
    S.add('camo', box(1.6, 0.8, 0.55, 0, 1.35, -0.12));
    S.add('dark', box(1.3, 0.5, 0.03, 0, 1.35, -0.4));
  }
  S.add('dark', zTube(-0.2, 0.5, 0.17, 0.17, 10, -0.75, 0.62)); // the fuel tank under the cab
}

// The alcohol tanker's trailer pump: a single-axle trailer with the pump, its engine under a hood, the suction and
// delivery pipes, the drawbar to the tanker.
function pumpTrailer(S) {
  for (const s of [-1, 1]) wheel(S, s * 0.78, 0.38, 0.2, 0.38, 0.18, s, 30);
  S.add('dark', xTube(-0.75, 0.75, 0.05, 0.05, 8, 0.38, 0.2));
  S.add('camo', box(1.3, 0.12, 1.9, 0, 0.62, 0.1));
  S.add('camo', rbox(1.0, 0.7, 1.0, 0.08, 0, 1.03, 0.35));
  for (let i = 0; i < 5; i++) S.add('dark', box(0.01, 0.4, 0.06, 0.505, 1.05, 0.05 + i * 0.13));
  S.add('camo', yTube(0.7, 1.15, 0.22, 0.22, 14, 0, -0.5));
  S.add('steel', rod(V(0, 1.0, -0.5), V(-0.5, 0.75, -0.3), 0.05, 8));
  S.add('steel', rod(V(0.2, 1.1, -0.6), V(0.2, 1.35, -0.9), 0.05, 8));
  for (const s of [-1, 1]) S.add('camo', box(0.3, 0.04, 0.6, s * 0.78, 0.82, 0.2));
  S.add('camo', rod(V(0, 0.6, -0.85), V(0, 0.62, -2.2), 0.045, 8));
}

// Steyr 1500A: about 5.1 m long, 2.03 m wide, the box body (a generator, its switchboard, the cable reel behind).
function steyr(S) {
  const FA = -1.75, RA = 1.4, WR = 0.42;
  for (const s of [-1, 1]) S.add('dark', box(0.09, 0.16, 4.6, s * 0.42, 0.66, 0.1));
  for (const s of [-1, 1]) for (const z of [FA, RA]) wheel(S, s * 0.8, WR, z, WR, 0.22, s, 32);
  S.add('camo', rbox(0.9, 0.55, 1.0, 0.1, 0, 1.05, -2.0));
  S.add('dark', box(0.8, 0.5, 0.05, 0, 1.02, -2.5));
  for (const s of [-1, 1]) {
    S.add('camo', mudguard(WR, 0.28, s * 0.8, WR, FA, 10, 170, 0.08, 0.03));
    S.add('dark', zTube(-2.42, -2.28, 0.09, 0.09, 10, s * 0.62, 1.0));
  }
  S.add('camo', rbox(1.95, 0.8, 1.2, 0.05, 0, 1.3, -0.9));
  S.add('cloth', rbox(1.95, 0.5, 1.2, 0.08, 0, 1.92, -0.9)); // the canvas top
  S.add('glass', box(1.6, 0.3, 0.02, 0, 1.9, -1.51));
  // the box body with its door, louvres and the cable reel
  S.add('camo', box(2.05, 1.65, 2.5, 0, 1.68, 1.05));
  S.add('roof', box(2.12, 0.06, 2.58, 0, 2.53, 1.05));
  S.add('dark', box(0.03, 1.3, 0.8, 1.04, 1.55, 1.3));
  for (let i = 0; i < 6; i++) S.add('dark', box(0.03, 0.04, 0.7, -1.04, 1.4 + i * 0.1, 0.6));
  for (const s of [-1, 1]) S.add('camo', box(0.06, 0.6, 0.1, s * 0.45, 0.85, 2.45));
  S.add('rubber', xTube(-0.4, 0.4, 0.34, 0.34, 18, 0.95, 2.5));
  for (const s of [-1, 1]) S.add('camo', xTube(s * 0.4, s * 0.44, 0.42, 0.42, 18, 0.95, 2.5));
}

// Hanomag SS 100 (a heavy road tractor, the Meillerwagen's and the oxygen trailer's): long bonnet, an enclosed cab,
// the ballast box behind it, large single tyres.
function hanomag(S) {
  const FA = -1.7, RA = 1.4, WR = 0.6;
  for (const s of [-1, 1]) S.add('dark', box(0.12, 0.22, 4.8, s * 0.42, 0.85, -0.1));
  for (const s of [-1, 1]) { wheel(S, s * 0.88, WR, FA, WR, 0.3, s, 36); wheel(S, s * 0.9, WR, RA, WR, 0.38, s, 36); }
  for (const z of [FA, RA]) S.add('dark', xTube(-0.8, 0.8, 0.07, 0.07, 8, WR, z));
  S.add('camo', rbox(1.12, 0.85, 1.9, 0.14, 0, 1.4, -1.75));
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) S.add('dark', box(0.01, 0.4, 0.05, s * 0.565, 1.42, -2.35 + i * 0.13));
  S.add('dark', box(0.95, 0.75, 0.06, 0, 1.35, -2.72));
  for (let i = 0; i < 11; i++) S.add('steel', box(0.02, 0.7, 0.02, -0.4 + i * 0.08, 1.35, -2.76));
  for (const s of [-1, 1]) {
    S.add('camo', mudguard(WR, 0.38, s * 0.88, WR, FA, 12, 168, 0.08, 0.035));
    S.add('camo', mudguard(WR, 0.46, s * 0.9, WR, RA, 10, 170, 0.08, 0.035));
    S.add('dark', zTube(-2.62, -2.42, 0.12, 0.13, 10, s * 0.62, 1.55));
    S.add('lens', zTube(-2.64, -2.62, 0.1, 0.1, 10, s * 0.62, 1.55));
  }
  S.add('dark', box(1.9, 0.14, 0.12, 0, 0.62, -2.82));
  S.add('camo', rbox(2.2, 1.55, 1.35, 0.06, 0, 1.85, -0.15));
  S.add('glass', box(1.8, 0.45, 0.02, 0, 2.2, -0.835));
  for (const s of [-1, 1]) S.add('glass', box(0.02, 0.42, 0.7, s * 1.105, 2.2, -0.2));
  S.add('camo', rbox(2.26, 0.08, 1.45, 0.03, 0, 2.66, -0.15));
  S.add('camo', box(2.1, 0.8, 1.5, 0, 1.45, 1.45)); // the ballast box
  S.add('dark', box(0.3, 0.25, 0.3, 0, 0.85, 2.35)); // the coupling
}

// Sd.Kfz. 7/3: the 8 t halftrack (6.85 x 2.35 x 2.62 m) with the firing control's armoured body (the Bundesarchiv
// photograph of 1944): the long bonnet with its louvres, an armoured cab with vision slits and an armoured box on
// the rear, its upper sides sloped in; the track over six double road wheels each side; a rod aerial; branches.
function sdkfz7(S) {
  const WR = 0.5;
  for (const s of [-1, 1]) {
    wheel(S, s * 0.98, WR, -2.45, WR, 0.26, s, 32);
    S.add('camo', mudguard(WR, 0.42, s * 0.98, WR, -2.45, 10, 170, 0.1, 0.04));
    // the track: the run on the ground, over the top, round the sprocket and the idler; six road wheels
    S.add('rubber', box(0.36, 0.05, 3.5, s * 0.92, 0.03, 1.15));
    S.add('rubber', box(0.36, 0.05, 3.4, s * 0.92, 0.98, 1.1));
    S.add('rubber', xTube(-0.18, 0.18, 0.45, 0.45, 18, 0.5, -0.65).translate(s * 0.92, 0, 0));
    S.add('rubber', xTube(-0.18, 0.18, 0.42, 0.42, 18, 0.48, 2.95).translate(s * 0.92, 0, 0));
    for (let i = 0; i < 6; i++) {
      const z = -0.25 + i * 0.6, dx = (i % 2) * 0.08;
      S.add('rim', xTube(-0.07, 0.07, 0.4, 0.4, 16, 0.42, z).translate(s * (0.85 + dx), 0, 0));
      S.add('dark', xTube(-0.08, 0.08, 0.12, 0.12, 8, 0.42, z).translate(s * (0.9 + dx), 0, 0));
    }
    S.add('camo', box(0.42, 0.04, 4.3, s * 0.95, 1.12, 0.95)); // the track guard
  }
  S.add('dark', box(1.2, 0.3, 6.2, 0, 0.75, -0.1));
  // the armoured bonnet and the cab
  S.add('camo', box(1.1, 0.7, 1.9, 0, 1.25, -2.6));
  S.add('camo', box(1.1, 0.35, 1.9, 0, 1.68, -2.6, 0.12, 0, 0));
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) S.add('dark', box(0.01, 0.35, 0.06, s * 0.555, 1.32, -3.2 + i * 0.16));
  S.add('dark', box(0.9, 0.5, 0.05, 0, 1.25, -3.56));
  S.add('camo', box(2.2, 1.3, 1.25, 0, 1.75, -1.05));
  S.add('camo', box(2.2, 0.5, 0.1, 0, 2.3, -1.66, -0.35, 0, 0));
  S.add('dark', box(1.2, 0.06, 0.04, 0, 2.25, -1.74, -0.35, 0, 0)); // the vision slit
  for (const s of [-1, 1]) S.add('dark', box(0.04, 0.06, 0.4, s * 1.11, 2.05, -1.0));
  // the armoured box: vertical lower sides, the upper sides sloped in to the roof, the door at the rear
  S.add('camo', box(2.3, 0.95, 3.85, 0, 1.55, 1.4));
  for (const s of [-1, 1]) S.add('camo', box(0.1, 0.8, 3.85, s * 0.98, 2.3, 1.4, 0, 0, s * 0.35));
  S.add('camo', box(1.6, 0.08, 3.85, 0, 2.62, 1.4));
  S.add('camo', box(2.1, 0.8, 0.1, 0, 2.3, 3.3, 0.3, 0, 0));
  S.add('camo', box(2.1, 0.8, 0.1, 0, 2.3, -0.5, -0.3, 0, 0));
  S.add('dark', box(0.9, 1.25, 0.04, 0, 1.55, 3.34));
  for (const s of [-1, 1]) S.add('dark', box(0.04, 0.08, 0.5, s * 1.16, 1.8, 1.2));
  S.add('steel', yTube(2.66, 4.4, 0.025, 0.01, 6, 0.75, 2.8)); // the rod aerial
  // cut branches laid over the roof
  const r = mulberry32(71);
  for (let i = 0; i < 9; i++) S.add('foliage', sphere(0.45 + r() * 0.3, (r() - 0.5) * 1.6, 2.72, -0.6 + r() * 3.8, 1.4, 0.35, 1.0, 7), { tint: r() < 0.5 ? 0xffffff : 0xc8d4b8 });
}

// The cable drum trailer behind the Feuerleitpanzer (the firing cable paid out to the table).
function cableDrum(S) {
  S.add('camo', box(1.4, 0.15, 1.6, 0, 0.6, 0));
  for (const s of [-1, 1]) { wheel(S, s * 0.85, 0.35, 0, 0.35, 0.18, s, 24); S.add('camo', box(0.06, 1.0, 0.2, s * 0.55, 1.15, 0)); }
  S.add('rubber', xTube(-0.5, 0.5, 0.5, 0.5, 20, 1.3, 0));
  for (const s of [-1, 1]) S.add('camo', xTube(s * 0.5, s * 0.53, 0.6, 0.6, 20, 1.3, 0));
  S.add('camo', rod(V(0, 0.6, -0.8), V(0, 0.55, -1.7), 0.04, 6));
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

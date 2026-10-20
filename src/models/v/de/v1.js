import * as THREE from 'three';
import { V, box, sphere, xTube, yTube, zTube, rod, frontProfile, sideProfile, rivets, addWheel, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, node, hb } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { v1Pieces, MM } from './missiles.js';
import { withSiteMats, addP, missileMeshes, sandbagWall, mound, conifer, paintable } from './vweap_kit.js';

// A V-1 (Fieseler Fi 103) launch site in its operational 1944 form (a "modified site", refs/v1/README.md): the
// Walter WR 2.3 slotted-tube steam catapult (Schlitzrohrschleuder), eight bolted 6 m sections (48 m) and the
// muzzle brake, rising 6 degrees along -Z. Each section is a riveted box girder about 1.2 m deep with the
// slotted tube along its top, held by close-set clamp yokes that make the ramp's crenellated top (IWM Duxford's
// ramp); the girder rests on concrete sills at its foot and on bolted steel trestles standing on pairs of
// concrete blocks further up (Duxford; the paired blocks survive at Zempin and Proven). At the foot: the concrete
// firing platform with the steam generator trolley's rails (Zempin), the blast walls on both sides, the
// generator (Dampferzeuger: T-Stoff tank, Z-Stoff tank, the decomposition chamber, the steam pipe coupled to
// the tube's breech); the sled with the piston's lug that carries the missile; the V-1 itself; the loading
// trolley; the non-magnetic alignment building (Richthaus: timber, no iron in it, doors at both ends, the
// line of fire painted through it) off to the right; the firing bunker on the left and a slit trench.
//
// Frame: origin on the ground under the ramp's foot, the ramp along -Z. `ramp` is a node tilted 6 degrees
// (rotation.x) at the foot: in it the yokes' tops are y = 0 and the ramp runs to z = -RL. No traverse or
// elevation pivots (the ramp is laid on its bearing when the site is built): setTraverse / setElevation are
// no-ops, recoilLength 0, loadEl 0. The ramp never moves, so its steel is merged with the site's.
//   setMissile('none' | 'trolley' | 'ramp')  the missile on its loading trolley by the Richthaus, or on the sled
//   setWings(k)       0 both panels off and laid on a trestle beside the missile, 1 fitted (the first panel
//                     goes on over 0..0.5, the second over 0.5..1)
//   setGenerator(k)   0 the generator trolley run back along its rails, 1 coupled to the breech
//   setTrolley(x, z, heading, y)  the loading trolley (Zubringerwagen) in root space (the drill moves it from the
//                     store to the apron, into the Richthaus and onto the S-bend to the ramp's foot)
//   setLift(k)        0 the trolley's cradle down, 1 raised 0.24 m and tilted to the ramp's slope (on its screw jacks)
//   setSlide(k)       0 the missile on the trolley, 1 slid forward up the ramp's line onto the sled (then setMissile('ramp'))
//   setHoses({ fuel, air, charge })  the fuel hose to the filler, the starting air hose, the T-Stoff charging hose
//   setSled(v)        false hides the sled and piston (after a shot, until the crew has fetched them back)
//   launch(t)         t s since the shot: the sled and the missile run up the ramp in RUN s (constant
//                     acceleration) and leave the top; t < 0 (or null) the rest pose; after the run the missile is
//                     hidden (the flight is drawn by the render layer from anchors.muzzle) and the piston with the
//                     sled flies on off the end and falls in the field ahead (it was fetched back for the next shot)
// Anchors: muzzle (the ramp's top on the missile's axis, its -Z up the slope), ramp0 (the foot, tilted the
// same), richthaus (the building's middle on the ground), eye, shellStack (the wing trestle), crew spots.
// rig.v1 { trolley, lift, misT, misR, sled, gen, copies }: the moving parts, for the crew (render/crews_vweap.js);
// V1_LAYOUT: the site's places in root space.

export const RL = 48; // ramp length along the slope: eight 6 m sections (the muzzle brake adds a metre beyond)
export const SLOPE = 6 * DEG;
export const RUN = 1.0; // seconds from the shot until the missile leaves the top
const SEC = 6; // a section
const Y0 = 1.35; // the yokes' top at the foot above the ground
const APRON = 0.15; // the firing platform's top
const WALL = [3.0, 1.7]; // the blast walls' height at their rear and front ends
const TUBE = { y: -0.19, r: 0.17 }; // the slotted tube's axis below the ramp's top, its outside radius
const GIRDER = { top: -0.4, bot: -1.2, half: 0.44 }; // the box girder under the tube: top plate, bottom flange, side plates
const MIS_Y = 0.59, MIS_Z = 0.64; // the missile's axis above the ramp's top and its middle behind the lug
const SLED0 = -4.3 - MIS_Z; // the sled at rest (the jet pipe's end just over the foot)
const RH = { x: 24, z: 22, w: 12, l: 14, h: 4.0, door: 6.0 }; // the Richthaus (about 13 m square at Feuerstellung 623); doors wide enough for the wings
const TROLLEY = { x: 24, z: 9 }; // the trolley on the Richthaus apron (where the wings go on)
const STORE = { x: 24, z: -12.5, w: 7.2, l: 11, h: 3.2 }; // the missile store (a timber shed in the wood), its doors at the +Z end
const BUNKER = { x: -20, z: 4 };
const RAIL = { x: 0.6, z0: 0.4, z1: 15.8 }; // the generator trolley's rails in the platform
const GEN_ON = 0.62, GEN_OFF = 11.2; // the generator trolley's front along its rails, coupled and run back (clear of the loading trolley's bend)
const LIFT_H = 0.24; // the loading trolley's cradle raised to the ramp's line at the foot
const SLIDE = 8.86; // from the raised cradle up the ramp's line to the missile's place on the sled
const STEP = { x: -1.2, z: -6.9, h: 1.05, l: 2.6 }; // the wooden working step beside the missile's nose (fuel filler, fuzes), on the left
const FUELCART = { x: -3.35, z: -3.9 }; // the fuel cart with its hand pump, on the platform's left
const STARTER = { x: -2.9, z: -1.2 }; // the starter cart (Anlassgerät) with the compressed-air bottles
// The site's places in root space for the crew (render/crews_vweap.js)
export const V1_LAYOUT = {
  Y0, SLOPE, RL, RUN, APRON, RH, TROLLEY, STORE, BUNKER, GEN_ON, GEN_OFF, LIFT_H, SLIDE, STEP, FUELCART, STARTER, SLED0, MIS_Y, MIS_Z,
  TURN: { x: RH.x, z: RH.z }, // the turntable in the Richthaus
  DRUMS: { x: -2.85, z: 2.0 }, // the T-Stoff and Z-Stoff drums (inside the left wall)
  TRENCH: [[-12, 13], [-9.5, 10.5], [-7, 12.5], [-4.5, 10]],
  TRENCH2: [[16.8, -4.6], [17.2, -9.6]], // a short one beside the store for the trolley's men
  // the loading trolley's way from the Richthaus to the ramp: out of the front door, a left bend onto the cross
  // track behind the walls, a right bend between them to the foot (the path is laid in concrete)
  BEND: { z0: 13.6, r1: 3, x1: 21, z1: 10.6, x2: 6, r2: 6, foot: 4.6 },
};
const STEEL = 0xe6d2a0; // tint of the catapult's paint
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const _y = V(0, 1, 0);
// a square-section member from a to b (w across, d deep), its depth kept along z when it lies in an x-y plane
function beam(a, b, w, d) {
  const dir = b.clone().sub(a), len = dir.length();
  return box(w, len, d).applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(_y, dir.normalize()), V(1, 1, 1)));
}

export function buildV1Site() {
  const rig = newGunRig('v1', 'railcamo');
  const mats = withSiteMats(rig), root = rig.root, rnd = mulberry32(103);
  const mk = () => new Parts(mats);
  const P = mk(), PS = mk(), PG = mk();
  rig.recoilLength = 0;
  rig.loadEl = 0;
  rig.setTraverse = rig.setElevation = rig.setRecoil = () => {};
  rig.setBreech = () => {};

  const ramp = node(root, 'ramp', 0, Y0, 0, SLOPE, 0, 0);
  const sinS = Math.sin(SLOPE), cosS = Math.cos(SLOPE);
  // root-space point of (y, s) in the ramp's frame (s metres up the slope from the foot)
  const at = (s, y) => ({ y: Y0 + y * cosS + s * sinS, z: y * sinS - s * cosS });
  // the ramp's parts are built in its tilted frame and merged with the site's; the catapult's steel is warmed
  // toward the dark yellow of 1944 (Dunkelgelb under the green, as the Duxford ramp is painted)
  const rampM = new THREE.Matrix4().makeRotationX(SLOPE).setPosition(0, Y0, 0);
  const R = (key, g, o) => P.add(key, g.applyMatrix4(rampM), key === 'camo' ? { tint: STEEL, ...o } : o);

  // ---- the firing platform: a concrete slab at the foot with the generator trolley's rails let into it, the
  // concrete sills under the first section, and the blast walls either side (they took the steam's blast and
  // the debris of a missile that crashed off the ramp)
  addP(P, 'concrete', box(10, APRON + 0.1, 26.5, 0, APRON / 2 - 0.05, 2.75));
  for (const s of [-1, 1]) {
    P.add('iron', box(0.07, 0.035, RAIL.z1 - RAIL.z0, s * RAIL.x, APRON + 0.017, (RAIL.z0 + RAIL.z1) / 2), { tint: 0x9a9690 });
    P.add('dark', box(0.2, 0.012, RAIL.z1 - RAIL.z0, s * RAIL.x, APRON + 0.002, (RAIL.z0 + RAIL.z1) / 2));
    P.add('iron', box(0.25, 0.08, 0.2, s * RAIL.x, APRON + 0.04, RAIL.z1 + 0.1)); // the stops at the rails' end
    // the walls (laid in concrete blocks at Bois Carre): highest at the platform's rear where the crew worked,
    // their tops falling toward the front, a pier at the rear end and a short splayed return
    addP(P, 'concrete', sideProfile([[-10.5, 0], [4.5, 0], [4.5, WALL[0]], [-10.5, WALL[1]]], 0.6).translate(s * 4.6, APRON, 0), { tint: 0xeee8da });
    addP(P, 'concrete', box(0.9, WALL[0] + 0.25, 0.9, s * 4.65, APRON + (WALL[0] + 0.25) / 2, 4.3), { tint: 0xe4dfd2 });
    addP(P, 'concrete', box(0.6, WALL[0] - 0.7, 3.0, s * 5.7, APRON + (WALL[0] - 0.7) / 2, 6.0, 0, s * 0.72, 0), { tint: 0xeee8da });
  }
  // sills under the first section and its joint, and the anchor plates of the breech
  for (const s of [0.4, 3.2, 6.0]) {
    const u = at(s, GIRDER.bot), h = u.y - APRON;
    addP(P, 'concrete', box(1.5, h, 0.7, 0, APRON + h / 2, u.z), { tint: 0xe6e2da });
    P.add('dark', box(1.2, 0.04, 0.6, 0, u.y - 0.02, u.z));
  }
  // concrete piers up to the walls' end, then steel trestles (bolted angle and channel, X-braced) on pairs of
  // concrete blocks, every 6 m at the sections' joints
  for (const s of [9.0]) {
    const u = at(s, GIRDER.bot), h = u.y;
    addP(P, 'concrete', box(1.4, h, 0.8, 0, h / 2, u.z), { tint: 0xe2ded6 });
    addP(P, 'concrete', box(1.9, 0.3, 1.2, 0, 0.12, u.z));
    P.add('dark', box(1.2, 0.04, 0.6, 0, h - 0.02, u.z));
  }
  const ST = { tint: STEEL }, trestles = [];
  for (let s = 12; s <= RL - 1; s += SEC) trestles.push(s);
  trestles.push(RL - 1.2);
  for (const s of trestles) {
    const u = at(s, GIRDER.bot), top = u.y - 0.01, z = u.z, h = top;
    const bw = 0.62 + 0.17 * h, foot = 0.42, tw = 0.56;
    for (const sd of [-1, 1]) {
      addP(P, 'concrete', box(0.75, 0.6, 0.75, sd * bw, 0.12, z), { tint: 0xe8e4dc });
      P.add('camo', box(0.4, 0.03, 0.4, sd * bw, foot + 0.015, z), ST); // the base plate
      P.add('camo', beam(V(sd * bw, foot, z), V(sd * tw, top - 0.16, z), 0.16, 0.12), ST);
    }
    P.add('camo', box(2 * tw + 0.35, 0.16, 0.24, 0, top - 0.08, z), ST); // the cap channel under the girder
    // ties and X-bracing in one or two panels
    const panels = h > 3.2 ? 2 : 1, yb = foot + 0.35, legX = (y) => tw + (bw - tw) * (top - 0.16 - y) / (top - 0.16 - foot);
    const ys = [yb];
    for (let i = 1; i <= panels; i++) ys.push(yb + (top - 0.3 - yb) * i / panels);
    for (const y of ys) P.add('camo', beam(V(-legX(y), y, z + 0.07), V(legX(y), y, z + 0.07), 0.1, 0.03), ST);
    for (let i = 0; i < panels; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      P.add('camo', beam(V(-legX(y0), y0, z + 0.07), V(legX(y1), y1, z + 0.07), 0.08, 0.025), ST);
      P.add('camo', beam(V(legX(y0), y0, z - 0.07), V(-legX(y1), y1, z - 0.07), 0.08, 0.025), ST);
    }
    // gusset plates and their bolts where the members meet the legs
    const bolts = [];
    for (const y of ys) for (const sd of [-1, 1]) {
      P.add('camo', box(0.26, 0.24, 0.015, sd * legX(y), y, z + 0.085), ST);
      for (const dy of [-0.06, 0.06]) bolts.push(V(sd * legX(y) + sd * 0.04, y + dy, z + 0.095));
    }
    P.add('dark', rivets(bolts, V(0, 0, 1), 0.022));
  }

  // ---- the ramp (in its tilted frame). The slotted tube along the top, the clamp yokes round it every 0.3 m
  // (two halves each, the slot between them, which the piston's lug runs up), the box girder below: a top plate,
  // the side plates with their flanges, outside stiffeners every metre, riveted splice plates at the 6 m joints,
  // and the underside's grating of cross bars
  R('iron', zTube(0.25, -RL - 0.02, TUBE.r, TUBE.r, 20, 0, TUBE.y));
  R('dark', box(0.05, 0.02, RL + 0.2, 0, -0.012, -RL / 2)); // the slot (its sealing strip, parted by the lug)
  {
    const yoke = [[0.03, -0.03], [0.03, 0.0], [0.2, 0.0], [0.27, -0.035], [0.31, -0.1], [0.31, GIRDER.top], [0.03, GIRDER.top]];
    const half = [frontProfile(yoke, -0.11, 0.11), frontProfile(yoke.map(([x, y]) => [-x, y]).reverse(), -0.11, 0.11)];
    // each half with the nut of its clamp bolt on the outer shoulder
    const nut = [box(0.06, 0.05, 0.08, 0.25, -0.02, 0, 0, 0, -0.5), box(0.06, 0.05, 0.08, -0.25, -0.02, 0, 0, 0, 0.5)];
    for (let z = -0.15; z > -RL + 0.05; z -= 0.3) {
      for (const g of half) R('camo', g.clone().translate(0, 0, z));
      for (const g of nut) R('dark', g.clone().translate(0, 0, z));
    }
  }
  // the breech piece at the foot: a heavier length of tube with its flanges, the generator's steam pipe couples to it
  R('iron', zTube(0.15, 0.62, 0.23, 0.23, 20, 0, TUBE.y));
  for (const z of [0.15, 0.6]) R('iron', zTube(z - 0.03, z + 0.03, 0.3, 0.3, 20, 0, TUBE.y));
  R('dark', zTube(0.61, 0.64, 0.13, 0.13, 16, 0, TUBE.y));
  const G = GIRDER, gh = G.top - G.bot;
  R('camo', box(2 * G.half + 0.04, 0.03, RL, 0, G.top - 0.015, -RL / 2));
  for (const sd of [-1, 1]) {
    R('camo', box(0.014, gh, RL, sd * G.half, (G.top + G.bot) / 2, -RL / 2));
    R('camo', box(0.1, 0.014, RL, sd * (G.half + 0.05), G.top - 0.03, -RL / 2));
    R('camo', box(0.1, 0.014, RL, sd * (G.half + 0.05), G.bot + 0.007, -RL / 2));
    for (let z = -0.5; z > -RL + 0.2; z -= 1.0) R('camo', box(0.07, gh - 0.04, 0.012, sd * (G.half + 0.035), (G.top + G.bot) / 2, z));
    for (let i = 0; i <= RL / SEC; i++) {
      const z = -i * SEC + (i === 0 ? -0.18 : i === RL / SEC ? 0.18 : 0);
      R('iron', box(0.016, gh - 0.06, 0.34, sd * (G.half + 0.009), (G.top + G.bot) / 2, z), { tint: 0x8a7a68 });
      const pts = [];
      for (const dz of [-0.1, 0.1]) for (let y = G.top - 0.08; y > G.bot + 0.05; y -= 0.09) pts.push(V(sd * (G.half + 0.018), y, z + dz).applyMatrix4(rampM));
      P.add('dark', rivets(pts, V(sd, 0, 0).applyAxisAngle(V(1, 0, 0), SLOPE), 0.018));
    }
  }
  for (let z = -0.2; z > -RL; z -= 0.3) R('camo', box(2 * G.half, 0.025, 0.05, 0, G.bot + 0.0125, z));
  // the muzzle brake: an open frame a metre beyond the last section, the tube's end flange inside it
  R('iron', zTube(-RL - 0.06, -RL + 0.06, 0.27, 0.27, 20, 0, TUBE.y));
  for (const sd of [-1, 1]) {
    for (const dz of [0, -0.5, -1.0]) R('camo', box(0.06, gh + 0.3, 0.06, sd * (G.half - 0.02), (G.top + G.bot) / 2 + 0.15, -RL + dz - 0.03));
    for (const y of [0.0, G.bot]) R('camo', box(0.06, 0.06, 1.06, sd * (G.half - 0.02), y, -RL - 0.5));
  }
  R('camo', box(2 * G.half, 0.06, 0.06, 0, 0.0, -RL - 1.03));
  R('camo', box(2 * G.half, 0.4, 0.02, 0, G.bot + 0.25, -RL - 1.03));

  // ---- the sled on the yokes: two runners either side of the slot, a front saddle under the launch lug and a
  // rear one under the tail cone, both padded, and the piston's lug (Mitnehmer) up through the slot from the
  // piston in the tube (its head shows at the slot's mouth at rest)
  const sled = node(ramp, 'sled', 0, 0, SLED0);
  for (const sd of [-1, 1]) {
    PS.add('camo', box(0.1, 0.07, 2.7, sd * 0.13, 0.035, 0.75));
    PS.add('dark', box(0.04, 0.02, 2.7, sd * 0.13, 0.002, 0.75));
  }
  for (const [z, h] of [[-0.12, MIS_Y - 0.36], [2.0, MIS_Y - 0.33]]) {
    PS.add('camo', box(0.5, 0.08, 0.16, 0, 0.1, z));
    for (const sd of [-1, 1]) {
      PS.add('camo', beam(V(sd * 0.13, 0.06, z), V(sd * 0.27, h, z), 0.07, 0.12));
      PS.add('rubber', box(0.16, 0.04, 0.2, sd * 0.28, h + 0.02, z, 0, 0, sd * 0.75));
    }
  }
  PS.add('dark', box(0.035, 0.42, 0.42, 0, -0.08, 0.0)); // the lug through the slot
  PS.add('iron', zTube(-0.75, 0.45, TUBE.r - 0.03, TUBE.r - 0.03, 14, 0, TUBE.y)); // the piston in the tube
  const misR = node(sled, 'missile-ramp', 0, MIS_Y, MIS_Z);

  // ---- the loading trolley (Zubringerwagen): a low frame on four small wheels with a towing bar, and the cradle
  // (pivot `lift`, two padded saddles on a base plate) on two screw jacks: at the ramp's foot the jacks raise it
  // to the ramp's line and tilt it to the slope, and the missile is slid forward off it onto the sled. Its own
  // node (it travels the site: the store, the Richthaus, the bend to the ramp); the frame's origin on the ground
  // under its middle, the bar toward -Z.
  const PT = mk(), PL = mk();
  const trolley = node(root, 'trolley', TROLLEY.x, 0.15, TROLLEY.z);
  {
    const T = (key, g, o) => PT.add(key, g, o);
    T('camo', box(0.9, 0.1, 4.0, 0, 0.45, 0));
    for (const sd of [-1, 1]) T('camo', box(0.08, 0.2, 4.0, sd * 0.42, 0.42, 0));
    for (const z of [-1.4, 1.4]) {
      for (const sd of [-1, 1]) {
        T('dark', xTube(sd * 0.52, sd * 0.68, 0.25, 0.25, 14, 0.25, z)); // the solid rubber tyre
        T('camo', xTube(sd * 0.5, sd * 0.7, 0.13, 0.13, 10, 0.25, z)); // the hub
      }
      T('dark', xTube(-0.6, 0.6, 0.035, 0.035, 8, 0.25, z));
      T('camo', box(0.86, 0.12, 0.16, 0, 0.36, z)); // the axle's bolster
    }
    T('camo', rod(V(0, 0.45, -2.0), V(0, 0.3, -3.1), 0.04, 6));
    T('camo', xTube(-0.25, 0.25, 0.03, 0.03, 6, 0.3, -3.12));
    // the two screw jacks' housings on the deck, their handwheels outboard
    for (const z of [-0.95, 1.55]) {
      T('dark', yTube(0.5, 0.86, 0.085, 0.085, 10, 0, z));
      T('dark', new THREE.TorusGeometry(0.15, 0.016, 5, 14).rotateY(Math.PI / 2).translate(0.5, 0.7, z));
      T('dark', xTube(0.08, 0.5, 0.02, 0.02, 6, 0.7, z));
    }
  }
  // the cradle: its base plate on the jacks' screws, the two saddles (under the tank and the tail cone)
  const lift = node(trolley, 'lift', 0, 0.62, 0);
  {
    const L = (key, g, o) => PL.add(key, g, o);
    L('camo', box(0.8, 0.06, 3.4, 0, -0.07, 0.2));
    for (const z of [-0.95, 1.55]) L('steel', yTube(-0.5, -0.07, 0.05, 0.05, 8, 0, z)); // the screws (in the housings when down)
    for (const [z, r] of [[-0.55, 0.425], [1.35, 0.37]]) {
      const top = 0.46 - r * 0.92;
      for (const sd of [-1, 1]) L('camo', beam(V(sd * 0.36, -0.07, z), V(sd * 0.22, top, z), 0.09, 0.14));
      L('camo', box(0.8, 0.08, 0.14, 0, -0.02, z));
      for (const sd of [-1, 1]) L('dark', box(0.18, 0.05, 0.22, sd * 0.2, top + 0.03, z, 0, 0, sd * 0.6));
    }
  }
  const misT = node(lift, 'missile-trolley', 0, 0.46, 0);

  // ---- the two missiles (one on the trolley, one on the sled: setMissile shows one) and their wing panels
  const pieces = v1Pieces();
  missileMeshes(misR, pieces.lists);
  missileMeshes(misT, v1Pieces().lists);
  const wingGeo = [pieces.wing(-1), pieces.wing(1)];
  const copies = [];
  for (const m of [misR, misT]) {
    const wings = [-1, 1].map((side, i) => {
      const w = new THREE.Mesh(wingGeo[i], MM.v1paint());
      w.castShadow = w.receiveShadow = true;
      m.add(w);
      return { mesh: w, side, fit: pieces.wingAt(side), stackM: new THREE.Matrix4() };
    });
    copies.push({ m, wings });
  }
  // a wing trestle either side of the apron; each panel lies flat on its own, span along Z (its root toward -Z),
  // the leading edge outward, until the fitters carry it in and slide it onto the spar stub (the places are kept
  // in root space: the trolley comes and goes)
  const stacks = [-1, 1].map((sd) => ({ x: TROLLEY.x + sd * 3.0, g: 0.15, z: TROLLEY.z - 0.7, y: 0.57, sd }));
  for (const st of stacks) for (const dz of [-0.85, 0.85]) {
    for (const ex of [-0.42, 0.42]) P.add('timber', box(0.08, 0.4, 0.08, st.x + ex, st.g + 0.2, st.z + dz));
    P.add('timber', box(1.1, 0.08, 0.14, st.x, st.y - 0.04, st.z + dz));
  }
  for (const c of copies) c.wings.forEach((w, i) => {
    const st = stacks[i], q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -w.side * Math.PI / 2);
    w.stackM.compose(V(st.x + w.side * 0.15, st.y + 0.07, st.z - 1.15), q, V(1, 1, 1));
  });
  const stack = stacks[1];

  // ---- the steam generator trolley (Dampferzeuger) on its rails: a steel frame on four flanged wheels, the
  // T-Stoff (hydrogen peroxide) tank, the Z-Stoff (permanganate) tank, the pressure bottles that drove them in, the
  // decomposition chamber where they met, and the steam pipe that couples to the tube's breech. Its frame: the
  // origin on the platform's centre line under the coupling, the trolley running back along +Z.
  const gen = node(root, 'generator', 0, 0, GEN_ON);
  {
    const GY = at(-0.62, TUBE.y).y; // the breech coupling's height
    const WY = APRON + 0.035 + 0.2;
    for (const sd of [-1, 1]) PG.add('camo', box(0.14, 0.18, 3.3, sd * RAIL.x, WY + 0.12, 1.85));
    for (const z of [0.35, 1.85, 3.4]) PG.add('camo', box(2 * RAIL.x + 0.14, 0.14, 0.12, 0, WY + 0.12, z));
    PG.add('camo', box(1.3, 0.04, 3.2, 0, WY + 0.23, 1.85), { tint: 0xd8d8d0 }); // the deck plate
    for (const z of [0.75, 2.95]) {
      for (const sd of [-1, 1]) {
        PG.add('iron', xTube(sd * (RAIL.x - 0.06), sd * (RAIL.x + 0.04), 0.2, 0.2, 16, WY, z)); // the wheel
        PG.add('iron', xTube(sd * (RAIL.x - 0.07), sd * (RAIL.x - 0.05), 0.235, 0.235, 16, WY, z)); // its flange
        PG.add('dark', box(0.1, 0.32, 0.36, sd * (RAIL.x + 0.02), WY + 0.08, z)); // the axle box
      }
      PG.add('dark', xTube(-RAIL.x, RAIL.x, 0.04, 0.04, 8, WY, z));
    }
    // the decomposition chamber at the front: an upright pressure vessel, the steam pipe forward to the coupling
    const DZ = 0.75, DY = WY + 0.25;
    PG.add('steel', yTube(DY, DY + 1.05, 0.26, 0.26, 18, 0, DZ));
    PG.add('steel', sphere(0.26, 0, DY + 1.05, DZ, 1, 0.45, 1, 18));
    for (const y of [DY + 0.05, DY + 0.75]) PG.add('iron', yTube(y, y + 0.05, 0.29, 0.29, 18, 0, DZ));
    PG.add('iron', rod(V(0, GY, -0.04), V(0, GY, DZ - 0.2), 0.11, 12));
    PG.add('iron', rod(V(0, GY, DZ - 0.2), V(0, DY + 0.65, DZ), 0.11, 12));
    PG.add('iron', zTube(-0.06, 0.06, 0.25, 0.25, 16, 0, GY)); // the coupling flange against the breech's
    PG.add('dark', rivets([0, 1, 2, 3, 4, 5, 6, 7].map((i) => V(Math.cos(i * Math.PI / 4) * 0.2, GY + Math.sin(i * Math.PI / 4) * 0.2, 0.06)), V(0, 0, 1), 0.025));
    // the T-Stoff tank on saddles, painted pale (aluminium) with its filler and vent, the Z-Stoff tank beside
    // the chamber, the two pressure bottles along the frame
    const TY = WY + 0.78;
    PG.add('white', zTube(1.35, 3.25, 0.45, 0.45, 22, 0, TY), { tint: 0xa8ae9c });
    for (const z of [1.35, 3.25]) PG.add('white', sphere(0.45, 0, TY, z, 1, 1, 0.3, 22), { tint: 0xa8ae9c });
    for (const z of [1.7, 2.9]) PG.add('camo', box(0.95, 0.42, 0.12, 0, WY + 0.43, z));
    for (const z of [1.55, 3.05]) PG.add('dark', zTube(z - 0.03, z + 0.03, 0.46, 0.46, 22, 0, TY)); // the straps
    PG.add('brass', yTube(TY + 0.43, TY + 0.53, 0.07, 0.07, 10, 0, 2.2));
    PG.add('iron', yTube(TY + 0.4, TY + 0.68, 0.025, 0.025, 6, 0.2, 2.9));
    PG.add('steel', yTube(WY + 0.25, WY + 0.95, 0.17, 0.17, 14, -0.42, 0.95));
    PG.add('steel', sphere(0.17, -0.42, WY + 0.95, 0.95, 1, 0.5, 1, 14));
    for (const sd of [-1, 1]) PG.add('paint', zTube(1.2, 3.3, 0.11, 0.11, 12, sd * 0.56, WY + 0.4), { tint: 0x8a8a7a });
    // the feed pipes, the valves with their handwheels and the pressure gauge facing the crew
    PG.add('iron', rod(V(0, TY - 0.3, 1.4), V(0, DY + 0.5, DZ + 0.2), 0.035, 8));
    PG.add('iron', rod(V(-0.42, WY + 0.6, 0.95), V(-0.15, DY + 0.3, DZ), 0.03, 8));
    for (const [x, y, z] of [[0.33, DY + 0.55, DZ + 0.05], [-0.35, WY + 0.75, 1.25]]) {
      PG.add('dark', yTube(y - 0.08, y + 0.08, 0.05, 0.05, 8, x, z));
      PG.add('brass', handwheelish(0.11).translate(x + Math.sign(x) * 0.08, y, z));
    }
    PG.add('dark', yTube(DY + 0.95, DY + 1.18, 0.015, 0.015, 6, 0.18, DZ - 0.05));
    PG.add('white', zTube(DZ - 0.24, DZ - 0.2, 0.08, 0.08, 14, 0.18, DY + 1.24), { tint: 0xf0f0e8 });
    PG.add('camo', rod(V(0, WY + 0.15, 3.45), V(0, WY + 0.05, 4.3), 0.04, 6)); // the towing bar
  }
  // drums of the chemicals and the T-Stoff carboys' crates beside the platform
  // (inside the left wall by the generator's place: four of T-Stoff, pale, one of Z-Stoff; a hand pump on the first)
  {
    const D = V1_LAYOUT.DRUMS;
    for (let i = 0; i < 5; i++) P.add('paint', yTube(APRON, APRON + 0.88, 0.29, 0.29, 12, D.x - (i % 2) * 0.64, D.z + Math.floor(i / 2) * 0.62), { tint: i < 4 ? 0xe8ecdc : 0x9a8a70 });
    P.add('iron', yTube(APRON + 0.88, APRON + 1.18, 0.04, 0.04, 8, D.x + 0.1, D.z));
    P.add('iron', rod(V(D.x + 0.1, APRON + 1.18, D.z), V(D.x + 0.5, APRON + 1.12, D.z), 0.015, 5));
  }
  for (let i = 0; i < 3; i++) P.add('timber', box(0.6, 0.55, 0.6, -6.2 - i * 0.7, 0.275, 2.5), { tint: 0xc8bca8 });
  // a spare piston on its chocks (a site had only a couple: each flew off the ramp's end with its lug and was
  // fetched back from the field ahead), and the starter cart (Anlassgerät) with the compressed-air bottles that
  // started the pulse jet on the ramp
  for (const z of [0.0, 1.0]) P.add('timber', box(0.5, 0.16, 0.16, 6.9, 0.08, z));
  P.add('iron', zTube(-0.35, 1.35, 0.135, 0.135, 16, 6.9, 0.3), { tint: 0xb8b4ac });
  P.add('iron', zTube(-0.42, -0.35, 0.14, 0.12, 16, 6.9, 0.3), { tint: 0xb8b4ac });
  P.add('dark', box(0.035, 0.36, 0.5, 6.9, 0.58, 0.25));
  {
    const cx = STARTER.x, cz = STARTER.z;
    P.add('camo', box(0.9, 0.08, 1.4, cx, 0.62, cz));
    for (const sd of [-1, 1]) addWheel({ add: (k, g) => P.add(k, g) }, cx + sd * 0.55, APRON + 0.3, cz + 0.3, 0.3, 0.12, sd, 14);
    P.add('dark', xTube(cx - 0.55, cx + 0.55, 0.03, 0.03, 8, APRON + 0.3, cz + 0.3));
    P.add('camo', rod(V(cx, 0.6, cz - 0.7), V(cx, APRON + 0.05, cz - 1.5), 0.035, 6));
    P.add('camo', box(0.06, 0.4, 0.06, cx, APRON + 0.2, cz - 0.55));
    for (const dx of [-0.25, 0, 0.25]) {
      P.add('paint', zTube(cz - 0.6, cz + 0.55, 0.11, 0.11, 12, cx + dx, 0.78), { tint: 0x6a6e66 });
      P.add('brass', zTube(cz - 0.7, cz - 0.6, 0.03, 0.03, 6, cx + dx, 0.78));
    }
    P.add('rubber', rod(V(cx, 0.8, cz - 0.7), V(cx + 0.3, APRON + 0.03, cz - 1.0), 0.02, 5)); // the hose's coil on the ground
    P.add('rubber', new THREE.TorusGeometry(0.28, 0.022, 5, 16).rotateX(Math.PI / 2).translate(cx + 0.45, APRON + 0.03, cz - 1.25));
  }

  // ---- the Richthaus: a timber shed on a concrete slab, nothing of iron in it (wooden pegs and door handles),
  // big doors open at both ends on the line of fire, a felt roof on a low gable, the alignment line painted down
  // the floor and out across the aprons, and the wooden turntable the missile was swung on
  {
    const { x, z, w, l, h, door } = RH, t = 0.12, dh = 3.4, ridge = h + 1.1;
    addP(P, 'concrete', box(w + 0.6, 0.2, l + 0.6, x, 0.1, z));
    for (const sd of [-1, 1]) {
      addP(P, 'plank', box(t, h, l, x + sd * (w / 2 - t / 2), h / 2 + 0.2, z), { tint: 0xb8b0a0 });
      // posts and a rail outside the boarding, and three windows
      for (let k = 0; k <= 7; k++) P.add('timber', box(0.14, h, 0.14, x + sd * (w / 2 + 0.04), h / 2 + 0.2, z - l / 2 + k * l / 7), { tint: 0x9a9080 });
      P.add('timber', box(0.1, 0.16, l, x + sd * (w / 2 + 0.06), 0.2 + h * 0.55, z), { tint: 0x9a9080 });
      for (const k of [-1, 0, 1]) P.add('dark', box(0.04, 0.8, 1.2, x + sd * (w / 2 + 0.02), 0.2 + h * 0.72, z + k * 4.2));
    }
    for (const e of [-1, 1]) {
      const ze = z + e * (l / 2 - t / 2), side = (w - door) / 2;
      for (const sd of [-1, 1]) addP(P, 'plank', box(side, h, t, x + sd * (door / 2 + side / 2), h / 2 + 0.2, ze), { tint: 0xb8b0a0 });
      addP(P, 'plank', box(door, h - dh, t, x, 0.2 + dh + (h - dh) / 2, ze), { tint: 0xb8b0a0 });
      // the gable
      addP(P, 'plank', frontProfile([[-w / 2, 0], [w / 2, 0], [0, ridge - h]], ze - t / 2, ze + t / 2).translate(x, h + 0.2, 0), { tint: 0xb8b0a0 });
      // the door leaves, swung open against the end wall
      for (const sd of [-1, 1]) P.add('timber', box(door / 2, dh - 0.05, 0.08, x + sd * (door / 2 + door / 4 + 0.05), 0.2 + dh / 2, ze + e * 0.25), { tint: 0xc8bca8 });
    }
    // the roof: two felted slopes on rafters, with battens over the felt's joints
    const pitch = Math.atan2(ridge - h, w / 2), half = (w / 2 + 0.5) / Math.cos(pitch);
    for (const sd of [-1, 1]) {
      const cx = x + sd * (w / 4 + 0.12), cy = 0.2 + h + (ridge - h) / 2 - 0.02;
      addP(P, 'roof', box(half, 0.08, l + 1.0, cx, cy + 0.04, z, 0, 0, -sd * pitch));
      for (let k = -3; k <= 3; k++) P.add('timber', box(half, 0.05, 0.06, cx, cy + 0.1, z + k * 2.1, 0, 0, -sd * pitch), { tint: 0x6a6258 });
    }
    // the alignment line: down the middle of the floor and out across the aprons at both ends
    P.add('timber', new THREE.CylinderGeometry(2.6, 2.6, 0.03, 32).translate(x, 0.2, z), { tint: 0xd8c8a8 }); // the turntable, flush with the floor
    addP(P, 'line', box(0.12, 0.02, l + 9, x, 0.27, z - 2));
    addP(P, 'line', box(0.9, 0.02, 0.06, x, 0.27, z));
    addP(P, 'concrete', box(6, 0.15, 7, x, 0.075, z - l / 2 - 3.5));
    for (let i = 0; i < 4; i++) P.add('timber', box(0.12, 0.6, 0.12, x + 3.7, 0.3, z - l / 2 - 1 - i * 1.6)); // a hand rail of posts
  }

  // ---- the missile store: a low timber shed in the edge of the wood, a felt roof under a camouflage of branches,
  // its double doors at the +Z end open toward the Richthaus; the missiles came to the site in parts and waited
  // here on their trolleys
  {
    const { x, z, w, l, h } = STORE, t = 0.12, door = 5.6, ridge = h + 0.7, ze = z + l / 2;
    addP(P, 'concrete', box(w + 0.6, 0.15, l + 0.6, x, 0.075, z));
    for (const sd of [-1, 1]) {
      addP(P, 'plank', box(t, h, l, x + sd * (w / 2 - t / 2), h / 2 + 0.15, z), { tint: 0xa8a090 });
      for (let k = 0; k <= 5; k++) P.add('timber', box(0.14, h, 0.14, x + sd * (w / 2 + 0.04), h / 2 + 0.15, z - l / 2 + k * l / 5), { tint: 0x8a8070 });
    }
    addP(P, 'plank', box(w, h, t, x, h / 2 + 0.15, z - l / 2 + t / 2), { tint: 0xa8a090 });
    addP(P, 'plank', frontProfile([[-w / 2, 0], [w / 2, 0], [0, ridge - h]], z - l / 2, z - l / 2 + t).translate(x, h + 0.15, 0), { tint: 0xa8a090 });
    for (const sd of [-1, 1]) addP(P, 'plank', box((w - door) / 2, h, t, x + sd * (door / 2 + (w - door) / 4), h / 2 + 0.15, ze - t / 2), { tint: 0xa8a090 });
    addP(P, 'plank', box(door, 0.5, t, x, h - 0.1, ze - t / 2), { tint: 0xa8a090 });
    addP(P, 'plank', frontProfile([[-w / 2, 0], [w / 2, 0], [0, ridge - h]], ze - t, ze).translate(x, h + 0.15, 0), { tint: 0xa8a090 });
    for (const sd of [-1, 1]) P.add('timber', box(door / 2, h - 0.6, 0.07, x + sd * (door / 2 + door / 4 + 0.08), 0.15 + (h - 0.6) / 2, ze + 0.15), { tint: 0xb8ac98 }); // the doors, open
    const pitch = Math.atan2(ridge - h, w / 2), half = (w / 2 + 0.4) / Math.cos(pitch);
    for (const sd of [-1, 1]) {
      const cx = x + sd * (w / 4 + 0.1), cy = 0.15 + h + (ridge - h) / 2;
      addP(P, 'roof', box(half, 0.08, l + 0.8, cx, cy + 0.04, z, 0, 0, -sd * pitch));
      // cut branches laid over the roof (camouflage from the air)
      for (let k = 0; k < 5; k++) P.add('foliage', box(half * 0.8, 0.12, 1.3, cx + (rnd() - 0.5) * 0.4, cy + 0.16, z - l / 2 + 1.2 + k * 2.1 + rnd() * 0.5, 0, rnd() * 0.4, -sd * pitch), { tint: rnd() < 0.5 ? 0xffffff : 0xb8c4a8 });
    }
  }
  // the trolley's ways, laid in concrete: from the store's doors to the Richthaus apron, and from the apron round
  // the bend behind the walls to the platform (BEND in V1_LAYOUT)
  {
    const lay = (x0, z0, x1, z1, wd = 2.4) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      addP(P, 'concrete', box(wd, 0.15, len + 0.3, (x0 + x1) / 2, 0.075, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, z1 - z0), 0), { tint: 0xe2ded4 });
    };
    lay(STORE.x, STORE.z + STORE.l / 2, TROLLEY.x, 8.2);
    const B = V1_LAYOUT.BEND;
    lay(B.x1, B.z1, B.x2, B.z1);
    for (let i = 0; i < 6; i++) { // the bend from the apron onto the cross track
      const a0 = -i / 6 * Math.PI / 2, a1 = -(i + 1) / 6 * Math.PI / 2;
      lay(B.x1 + B.r1 * Math.cos(a0), B.z0 + B.r1 * Math.sin(a0), B.x1 + B.r1 * Math.cos(a1), B.z0 + B.r1 * Math.sin(a1));
    }
    for (let i = 0; i < 8; i++) { // and the bend between the walls' ends down to the platform
      const a0 = Math.PI / 2 + i / 8 * Math.PI / 2, a1 = Math.PI / 2 + (i + 1) / 8 * Math.PI / 2;
      lay(B.x2 + B.r2 * Math.cos(a0), B.foot + B.r2 * Math.sin(a0), B.x2 + B.r2 * Math.cos(a1), B.foot + B.r2 * Math.sin(a1));
    }
  }
  // the wooden working step beside the missile's nose on the ramp (the fuel filler, the fuzes), and the fuel cart:
  // a tank on two wheels with its hand pump, parked on the platform
  {
    const { x, z, h, l } = STEP, sg = Math.sign(x); // sg: the side of the ramp it stands on (the treads outboard)
    P.add('timber', box(0.75, 0.06, l, x, APRON + h - 0.03, z), { tint: 0xc8bca8 });
    for (const dz of [-l / 2 + 0.1, l / 2 - 0.1]) for (const dx of [-0.3, 0.3]) P.add('timber', box(0.08, h, 0.08, x + dx, APRON + h / 2, z + dz));
    for (let k = 0; k < 3; k++) P.add('timber', box(0.6, 0.05, 0.22, x + sg * 0.62, APRON + 0.26 + k * 0.27, z + l / 2 - 0.25)); // the treads up to it
    for (const sd of [-1, 1]) P.add('timber', box(0.06, h + 0.1, 0.06, x + sg * 0.62 + sd * 0.32, APRON + h / 2, z + l / 2 - 0.25, -0.2, 0, 0));
    const c = FUELCART, cs = -Math.sign(c.x); // the pump on the cart's inboard side
    P.add('paint', zTube(c.z - 0.75, c.z + 0.75, 0.38, 0.38, 16, c.x, APRON + 0.78), { tint: 0x8a8e72 });
    for (const zz of [c.z - 0.75, c.z + 0.75]) P.add('paint', sphere(0.38, c.x, APRON + 0.78, zz, 1, 1, 0.25, 14), { tint: 0x8a8e72 });
    for (const sd of [-1, 1]) {
      P.add('dark', xTube(c.x + sd * 0.48, c.x + sd * 0.6, 0.3, 0.3, 14, APRON + 0.3, c.z));
      P.add('camo', box(0.1, 0.5, 0.1, c.x + sd * 0.3, APRON + 0.45, c.z));
    }
    P.add('dark', xTube(c.x - 0.55, c.x + 0.55, 0.03, 0.03, 6, APRON + 0.3, c.z));
    P.add('camo', rod(V(c.x, APRON + 0.6, c.z - 0.9), V(c.x, APRON + 0.05, c.z - 1.7), 0.03, 6)); // the shafts on a prop
    P.add('iron', yTube(APRON + 1.12, APRON + 1.5, 0.05, 0.05, 8, c.x + cs * 0.2, c.z + 0.3)); // the hand pump
    P.add('iron', rod(V(c.x + cs * 0.2, APRON + 1.5, c.z + 0.3), V(c.x + cs * 0.75, APRON + 1.45, c.z + 0.3), 0.018, 6)); // its handle
    P.add('brass', yTube(APRON + 1.14, APRON + 1.22, 0.08, 0.08, 10, c.x - cs * 0.15, c.z - 0.3)); // the filler
  }

  // ---- the firing bunker: a concrete box under an earth bank, the slit toward the ramp, the way in at the back
  {
    const { x, z } = BUNKER, bw = 4.4, bd = 3.8, bh = 2.3;
    addP(P, 'concrete', box(bw, 0.6, bd, x, bh - 0.3 + 0.25, z));
    addP(P, 'concrete', box(0.5, bh - 0.05, bd, x - bw / 2 + 0.25, (bh - 0.05) / 2, z));
    for (const s of [-1, 1]) addP(P, 'concrete', box(bw, bh - 0.05, 0.5, x, (bh - 0.05) / 2, z + s * (bd / 2 - 0.25)));
    // the front wall with the observation slit (the wall split above and below it)
    addP(P, 'concrete', box(0.5, 1.45, bd, x + bw / 2 - 0.25, 0.725, z));
    addP(P, 'concrete', box(0.5, 0.45, bd, x + bw / 2 - 0.25, bh - 0.05 - 0.225, z));
    P.add('dark', box(0.1, 0.38, bd - 1.0, x + bw / 2 - 0.45, 1.65, z));
    P.add('dark', box(0.1, 1.9, 0.9, x - bw / 2 - 0.02, 0.95, z + 0.6)); // the doorway
    mound(P, x - 0.5, z - bd / 2 - 1.2, 5, 2.4, 1.7, rnd, 4);
    mound(P, x - 0.5, z + bd / 2 + 1.2, 5, 2.4, 1.7, rnd, 4);
    P.add('soil', sphere(1, x - 0.2, bh + 0.3, z, 2.6, 0.55, 2.2, 10));
    sandbagWall(P, x - bw / 2 - 1.6, z - 0.3, x - bw / 2 - 1.6, z + 1.9, 5, 0, 11);
    P.add('iron', yTube(bh + 0.2, bh + 1.05, 0.05, 0.05, 8, x + 1.2, z - 0.8)); // the periscope
    P.add('iron', box(0.12, 0.14, 0.2, x + 1.2, bh + 1.05, z - 0.85));
    // the firing cable from the bunker to the generator, on the ground
    P.add('rubber', rod(V(x + bw / 2, 0.04, z + 1.2), V(-5.8, 0.04, 6.4), 0.025, 5));
    P.add('rubber', rod(V(-5.8, 0.04, 6.4), V(-1.2, APRON + 0.04, 6.6), 0.025, 5));
  }
  // a slit trench behind the walls for the rest of the crew, sandbagged in a zigzag
  {
    const pts = [[-12, 13], [-9.5, 10.5], [-7, 12.5], [-4.5, 10]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      sandbagWall(P, x0 - 0.5, z0 - 0.5, x1 - 0.5, z1 - 0.5, 3, 0, 20 + i);
      sandbagWall(P, x0 + 0.6, z0 + 0.6, x1 + 0.6, z1 + 0.6, 3, 0, 30 + i);
      P.add('dark', box(Math.hypot(x1 - x0, z1 - z0), 0.02, 0.85, (x0 + x1) / 2, 0.012, (z0 + z1) / 2, 0, Math.atan2(-(z1 - z0), x1 - x0), 0), { tint: 0x504030 });
    }
  }
  // and a short one beside the store for the men of the trolley
  {
    const [[x0, z0], [x1, z1]] = V1_LAYOUT.TRENCH2;
    sandbagWall(P, x0 - 0.55, z0, x1 - 0.55, z1, 3, 0, 41);
    sandbagWall(P, x0 + 0.6, z0, x1 + 0.6, z1, 3, 0, 42);
    P.add('dark', box(0.85, 0.02, Math.hypot(x1 - x0, z1 - z0), (x0 + x1) / 2, 0.012, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, z1 - z0), 0), { tint: 0x504030 });
  }
  // the wood the site was cut into (the sites hid in woods and orchards): trees along both flanks, clear of the
  // line of fire and the ramp
  for (let i = 0; i < 16; i++) {
    const left = i < 10, zt = left ? -52 + i * 5.2 + rnd() * 2 : -54 + (i - 10) * 4.5 + rnd() * 2, xt = left ? -(13 + rnd() * 10) : 16 + rnd() * 10;
    conifer(P, xt, zt, 12 + rnd() * 6, rnd);
  }

  P.build(root, { dirt: 0.3, y0: 0 });
  PS.build(sled, { dirt: 0.05, y0: Y0 + 0.4 });
  PG.build(gen, { dirt: 0.35, y0: 0 });
  PT.build(trolley, { dirt: 0.3, y0: 0.15 });
  PL.build(lift, { dirt: 0.1, y0: 0.8 });

  // ---- the hoses the drill connects (setHoses): the fuel hose from the cart's pump over the step to the filler, the
  // starting air from the starter cart to the pulse jet's air connections, the T-Stoff from the drums' pump to the
  // generator's tank (the missile on the sled and the generator coupled, where they are when the hoses go on)
  const hoseOf = (pts, r = 0.032) => {
    const m = new THREE.Mesh(paintable(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 10, r, 6)), mats.hose);
    m.visible = false;
    root.add(m);
    return m;
  };
  const D = V1_LAYOUT.DRUMS, FC = FUELCART;
  const hoses = {
    fuel: hoseOf([V(FC.x + 0.2, APRON + 1.42, FC.z + 0.3), V(FC.x + 0.5, APRON + 0.06, FC.z - 0.2), V(-1.9, APRON + 0.05, -4.9), V(-1.5, APRON + STEP.h + 0.1, -5.4), V(-0.7, 3.2, -5.6), V(-0.06, 3.02, -5.67)], 0.03),
    air: hoseOf([V(STARTER.x, 0.85, STARTER.z - 0.6), V(STARTER.x + 0.7, APRON + 0.05, STARTER.z - 1.4), V(-1.0, APRON + 0.05, -2.9), V(-1.25, 1.7, -3.05), V(-0.62, 3.32, -3.15), V(-0.26, 3.22, -3.21)], 0.025),
    charge: hoseOf([V(D.x + 0.5, APRON + 1.1, D.z), V(D.x + 0.8, APRON + 0.05, D.z + 0.4), V(-1.0, APRON + 0.05, 2.8), V(-0.5, 1.1, 2.85), V(-0.12, 1.8, 2.82), V(0, 1.72, 2.82)], 0.03),
  };

  // ---- state
  let where = 'none', wingK = 1, launchT = -1, sledOn = true;
  const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _s3 = new THREE.Vector3();
  const placeWings = () => {
    const k1 = smooth(wingK * 2), k2 = smooth(wingK * 2 - 1);
    root.updateWorldMatrix(true, false);
    _inv.copy(root.matrixWorld).invert();
    for (const c of copies) {
      // the trestle's pose in this missile's frame (the trolley moves): root to missile, then the trestle
      c.m.updateWorldMatrix(true, false);
      _rel.multiplyMatrices(_inv, c.m.matrixWorld).invert();
      c.wings.forEach((w, i) => {
        const k = i === 0 ? k1 : k2, o = w.mesh;
        _m4.multiplyMatrices(_rel, w.stackM).decompose(_p3, _q3, _s3);
        o.position.copy(_p3).lerp(w.fit, k);
        o.position.y += Math.sin(Math.PI * k) * 0.5;
        o.quaternion.copy(_q3).slerp(IDQ, k);
      });
    }
  };
  const VTOP = 2 * (RL + SLED0) / RUN; // the sled's speed as it leaves the top
  const show = () => {
    const gone = launchT >= RUN;
    misT.visible = where === 'trolley';
    misR.visible = where === 'ramp' && !gone;
    if (launchT >= RUN) {
      // the piston and its sled fly on off the end: a ballistic arc (gravity in the ramp's tilted frame), tumbling
      const tau = launchT - RUN, g = 9.81;
      const y = -0.5 * g * Math.cos(SLOPE) * tau * tau, z = -RL - VTOP * tau + 0.5 * g * Math.sin(SLOPE) * tau * tau;
      sled.position.set(0, y, z);
      sled.rotation.x = -tau * 2.2;
      sled.visible = sledOn && Y0 + y * Math.cos(SLOPE) - z * Math.sin(SLOPE) > 0.3;
    } else {
      sled.position.set(0, 0, launchT > 0 ? SLED0 - (RL + SLED0) * Math.min(1, (launchT / RUN) ** 2) : SLED0);
      sled.rotation.x = 0;
      sled.visible = sledOn;
    }
  };
  rig.setMissile = (w) => { where = w === 'trolley' || w === 'ramp' ? w : 'none'; show(); };
  rig.setWings = (k) => { k = clamp01(k); if (k === wingK && k >= 1) return; wingK = k; placeWings(); };
  rig.setGenerator = (k) => { gen.position.z = GEN_OFF + (GEN_ON - GEN_OFF) * smooth(k); };
  rig.setTrolley = (x, z, heading = 0, y = 0.15) => {
    if (trolley.position.x === x && trolley.position.z === z && trolley.rotation.y === heading && trolley.position.y === y) return;
    trolley.position.set(x, y, z);
    trolley.rotation.y = heading;
    if (wingK < 1) placeWings();
  };
  rig.setLift = (k) => {
    k = clamp01(k);
    lift.position.y = 0.62 + LIFT_H * k;
    lift.rotation.x = SLOPE * k;
    if (wingK < 1) placeWings();
  };
  rig.setSlide = (k) => { misT.position.z = -SLIDE * clamp01(k); };
  rig.setHoses = ({ fuel = false, air = false, charge = false } = {}) => { hoses.fuel.visible = !!fuel; hoses.air.visible = !!air; hoses.charge.visible = !!charge; };
  rig.setSled = (v) => { sledOn = !!v; show(); };
  rig.launch = (t) => { launchT = t == null || t < 0 ? -1 : t; show(); };
  rig.v1 = { trolley, lift, misT, misR, sled, gen, copies, hoses, ramp };
  rig.layout = { ...V1_LAYOUT, WSTACKS: stacks.map((st) => ({ x: st.x, y: st.y, z: st.z })) };
  rig.setMissile('ramp');
  rig.setWings(1);
  rig.setGenerator(1);

  // ---- anchors, crew, hit boxes
  const muz = anchor(rig, ramp, 'muzzle', 0, MIS_Y, -RL);
  rig.anchors.muzzles.push(muz);
  const r0 = anchor(rig, root, 'ramp0', 0, Y0, 0);
  r0.rotation.x = SLOPE;
  anchor(rig, root, 'richthaus', RH.x, 0, RH.z);
  anchor(rig, root, 'eye', 0, 2.2, -6);
  anchor(rig, root, 'breech', 0, Y0 + 0.3, -4.3);
  anchor(rig, root, 'tray', 0, Y0 + 0.6, -4.3);
  anchor(rig, root, 'shellStack', stack.x, stack.y, stack.z);
  anchor(rig, root, 'bunker', BUNKER.x, 0, BUNKER.z);
  crewSpot(rig, 'officer', -8.2, 0, 11.6, face(-8.2, 11.6, 0, -4), 'point');
  crewSpot(rig, 'launcher', BUNKER.x + 0.9, 0, BUNKER.z - 0.4, face(0, 0, 1, 0), 'stand');
  crewSpot(rig, 'fuel', 1.6, APRON, 4.6, face(1.6, 4.6, 0, 2.8), 'operate');
  crewSpot(rig, 'generator', -1.5, APRON, 2.4, face(-1.5, 2.4, 0, 2.0), 'crouch');
  crewSpot(rig, 'wing1', -1.9, APRON, -3.6, face(0, 0, 1, 0), 'stand');
  crewSpot(rig, 'wing2', 1.9, APRON, -3.2, face(0, 0, -1, 0), 'stand');
  crewSpot(rig, 'trolley', TROLLEY.x - 0.9, 0.15, TROLLEY.z + 4.9, face(0, 0, 0.3, -1), 'push');
  for (const s of [-1, 1]) hb(rig, s * 4.6 - 0.4, 0, -10.5, s * 4.6 + 0.4, APRON + WALL[0], 4.8);
  hb(rig, -0.8, 0, -RL - 1, 0.8, Y0 + RL * Math.sin(SLOPE) + 0.3, 1);
  hb(rig, RH.x - RH.w / 2, 0, RH.z - RH.l / 2, RH.x + RH.w / 2, RH.h + 1.3, RH.z + RH.l / 2);
  hb(rig, BUNKER.x - 2.2, 0, BUNKER.z - 1.9, BUNKER.x + 2.2, 2.6, BUNKER.z + 1.9);
  return finishGun(rig);
}

const IDQ = new THREE.Quaternion();

// a small valve wheel about x
function handwheelish(r) {
  return new THREE.TorusGeometry(r, 0.015, 5, 14).rotateY(Math.PI / 2);
}

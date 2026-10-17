import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, rivetRow, addWheel, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, node, hb } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { v1Pieces, MM } from './missiles.js';
import { withSiteMats, addP, missileMeshes, sandbagWall, mound } from './vweap_kit.js';

// A V-1 (Fieseler Fi 103) launch site in its operational 1944 form (a "modified site"): the Walter WR 2.3
// steam catapult (Startrampe), eight bolted 6 m steel sections (48 m) rising 6 degrees along -Z on concrete
// piers over a foundation strip, with the slotted launch tube along its top and a pair of blast walls round the
// concrete apron at its foot; the steam generator trolley (Dampferzeuger) coupled to the tube's breech; the
// sled with the piston's lug that carries the missile; the V-1 itself; the non-magnetic alignment building
// (Richthaus: brick, a timber roof, doors at both ends and the white alignment line through it) off to the
// right; the firing bunker on the left and a slit trench.
//
// Frame: origin on the ground under the ramp's foot, the ramp along -Z. `ramp` is a node tilted 6 degrees
// (rotation.x) at the foot: in it the tube's top is y = 0 and the ramp runs to z = -RL. No traverse or
// elevation pivots (the ramp is laid on its bearing when the site is built): setTraverse / setElevation are
// no-ops, recoilLength 0, loadEl 0.
//   setMissile('none' | 'trolley' | 'ramp')  the missile on its handling trolley by the Richthaus, or on the sled
//   setWings(k)       0 both panels off and laid on a trestle beside the missile, 1 fitted (the first panel
//                     goes on over 0..0.5, the second over 0.5..1)
//   setGenerator(k)   0 the generator trolley parked away, 1 coupled to the breech
//   launch(t)         t s since the shot: the sled and the missile run up the ramp in RUN s (constant
//                     acceleration) and leave the top; t < 0 (or null) the rest pose; after the run both are
//                     hidden (the flight is drawn by the render layer from anchors.muzzle)
// Anchors: muzzle (the ramp's top on the missile's axis, its -Z up the slope), ramp0 (the foot, tilted the
// same), richthaus (the building's middle on the ground), eye, shellStack (the wing trestle), crew spots.

export const RL = 48; // ramp length along the slope
export const SLOPE = 6 * DEG;
export const RUN = 1.0; // seconds from the shot until the missile leaves the top
const Y0 = 1.1; // the tube's top at the foot above the ground
const APRON = 0.15; // the concrete apron's top
const MIS_Y = 0.59, MIS_Z = 0.64; // the missile's axis above the sled and its middle behind the sled's
const SLED0 = -4.3 - MIS_Z; // the sled at rest (the jet pipe's end just over the foot)
const RH = { x: 24, z: 22, w: 8, l: 14, h: 3.6 }; // the Richthaus
const TROLLEY = { x: 24, z: 9 };
const BUNKER = { x: -20, z: 4 };
const GEN_ON = { x: 0, z: 1.0, ry: 0 }, GEN_OFF = { x: -7.5, z: 15, ry: 0.5 };
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

export function buildV1Site() {
  const rig = newGunRig('v1', 'drab');
  const mats = withSiteMats(rig), root = rig.root, rnd = mulberry32(103);
  const mk = () => new Parts(mats);
  const P = mk(), PR = mk(), PG = mk(), PS = mk(), PT = mk();
  rig.recoilLength = 0;
  rig.loadEl = 0;
  rig.setTraverse = rig.setElevation = rig.setRecoil = () => {};
  rig.setBreech = () => {};

  const ramp = node(root, 'ramp', 0, Y0, 0, SLOPE, 0, 0);
  // root-space height of the ramp's underside at a distance s along it
  const sinS = Math.sin(SLOPE), cosS = Math.cos(SLOPE);
  const at = (s, y) => ({ y: Y0 + y * cosS + s * sinS, z: y * sinS - s * cosS });

  // ---- ground works: the foundation strip, the apron at the foot, the blast walls
  addP(P, 'concrete', box(2.6, 0.25, RL + 2, 0, 0.1, -RL / 2 + 0.5));
  addP(P, 'concrete', box(11, APRON + 0.1, 15, 0, APRON / 2 - 0.05, -1.5));
  for (const s of [-1, 1]) {
    addP(P, 'concrete', box(0.55, 2.7, 13, s * 4.4, APRON + 1.35, -2.5));
    addP(P, 'concrete', box(0.75, 0.25, 13.2, s * 4.4, APRON + 2.75, -2.5)); // a coping that throws the blast off
    addP(P, 'concrete', box(0.55, 2.0, 3.0, s * 5.6, APRON + 1.0, 3.95, 0, s * 0.8, 0)); // the walls' splayed ends
  }
  // piers under the ramp every 3 m, rising with it; a steel saddle on each
  for (let s = 1.5; s <= RL - 0.5; s += 3) {
    const u = at(s, -0.94), h = u.y;
    addP(P, 'concrete', box(1.5, h, 0.8, 0, h / 2, u.z), { tint: s % 6 < 3 ? 0xffffff : 0xe8e4dc });
    addP(P, 'concrete', box(1.9, 0.3, 1.1, 0, 0.15, u.z));
    P.add('dark', box(1.45, 0.1, 0.5, 0, h - 0.04, u.z, SLOPE));
  }

  // ---- the ramp (in its tilted frame): tube, side girders, cross ties, the joints of the sections
  PR.add('iron', zTube(0.65, -RL, 0.18, 0.18, 18, 0, -0.19));
  PR.add('dark', box(0.05, 0.012, RL + 0.6, 0, -0.005, -RL / 2 + 0.3)); // the slot (sealed by a strip the piston's lug parts)
  PR.add('iron', zTube(0.2, 0.7, 0.27, 0.27, 18, 0, -0.19)); // the breech end of the tube
  PR.add('iron', zTube(-RL - 0.02, -RL + 0.25, 0.23, 0.23, 18, 0, -0.19)); // the muzzle flange
  // the sections' side walls: deep plate girders with a top and bottom flange, vertical stiffeners and a
  // diagonal brace in every bay outside, the tube between them at the bottom of the trough
  for (const s of [-1, 1]) {
    PR.add('camo', box(0.025, 1.0, RL + 0.6, s * 0.56, -0.4, -RL / 2 + 0.3));
    PR.add('camo', box(0.2, 0.03, RL + 0.6, s * 0.6, 0.1, -RL / 2 + 0.3));
    PR.add('camo', box(0.24, 0.03, RL + 0.6, s * 0.62, -0.9, -RL / 2 + 0.3));
    PR.add('steel', box(0.07, 0.05, RL + 0.4, s * 0.25, -0.05, -RL / 2 + 0.2), { tint: 0x9a9a92 }); // the sled's guide rails
    PR.add('camo', box(0.05, 0.12, RL + 0.4, s * 0.25, -0.13, -RL / 2 + 0.2));
    for (let z = 0; z > -RL - 0.1; z -= 1.5) {
      PR.add('camo', box(0.1, 0.98, 0.04, s * 0.62, -0.4, z));
      if (z > -RL + 0.5) PR.add('camo', rod(V(s * 0.63, -0.85, z - 0.05), V(s * 0.63, 0.05, z - 1.45), 0.025, 5));
    }
  }
  for (let z = 0; z > -RL; z -= 1.5) PR.add('camo', box(1.15, 0.07, 0.14, 0, -0.86, z - 0.75));
  for (let z = 0; z > -RL; z -= 1.5) PR.add('camo', box(1.15, 0.05, 0.1, 0, -0.42, z - 0.4));
  for (let i = 0; i <= RL / 6; i++) {
    const z = -i * 6;
    for (const s of [-1, 1]) {
      PR.add('camo', box(0.04, 1.02, 0.2, s * 0.65, -0.4, z + (i === 0 ? 0.3 : 0)));
      PR.add('dark', rivetRow(V(s * 0.675, 0.05, z + 0.05), V(s * 0.675, -0.85, z + 0.05), 0.1, V(s, 0, 0), 0.022));
    }
    PR.add('iron', zTube(z - 0.05, z + 0.05, 0.24, 0.24, 18, 0, -0.19));
  }

  // ---- the sled: a frame on the guide rails, a saddle under the lug, a rest under the tail cone, the piston's lug
  const sled = node(ramp, 'sled', 0, 0, SLED0);
  PS.add('camo', box(0.62, 0.08, 3.3, 0, 0.04, 0.55));
  PS.add('dark', box(0.04, 0.32, 0.6, 0, -0.1, 0.0)); // the lug through the slot
  PS.add('iron', zTube(-0.6, 0.4, 0.16, 0.16, 14, 0, -0.19)); // the piston head, showing at the slot's mouth
  PS.add('camo', box(0.36, 0.09, 0.5, 0, 0.12, -0.0));
  for (const s of [-1, 1]) {
    PS.add('camo', box(0.06, 0.22, 0.5, s * 0.17, 0.2, 0.0));
    PS.add('camo', rod(V(s * 0.25, 0.08, 2.0), V(s * 0.12, MIS_Y - 0.3, 2.05), 0.035, 6));
  }
  PS.add('rubber', box(0.3, 0.05, 0.25, 0, MIS_Y - 0.31, 2.05));
  const misR = node(sled, 'missile-ramp', 0, MIS_Y, MIS_Z);

  // ---- the handling trolley by the Richthaus: a low frame on four small wheels, two padded cradles
  const trolley = node(root, 'trolley', TROLLEY.x, 0.15, TROLLEY.z); // on the Richthaus apron
  PT.add('camo', box(0.9, 0.12, 4.0, 0, 0.45, 0));
  for (const s of [-1, 1]) PT.add('camo', box(0.08, 0.2, 4.0, s * 0.42, 0.42, 0));
  for (const z of [-1.4, 1.4]) for (const s of [-1, 1]) addWheel(PT, s * 0.6, 0.25, z, 0.25, 0.14, s, 12);
  for (const z of [-1.4, 1.4]) PT.add('dark', xTube(-0.6, 0.6, 0.035, 0.035, 8, 0.25, z));
  PT.add('camo', rod(V(0, 0.45, -2.0), V(0, 0.3, -3.1), 0.04, 6)); // the towing bar
  for (const [z, r] of [[-0.55, 0.425], [1.35, 0.37]]) {
    for (const s of [-1, 1]) PT.add('camo', box(0.1, 1.05 - r * 0.75 - 0.45, 0.16, s * 0.28, 0.45 + (1.05 - r * 0.75 - 0.45) / 2, z));
    PT.add('rubber', box(0.7, 0.07, 0.2, 0, 1.08 - r * 0.92, z));
  }
  const misT = node(trolley, 'missile-trolley', 0, 1.08, 0);

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
      return { mesh: w, side, fit: pieces.wingAt(side), stackP: new THREE.Vector3(), stackQ: new THREE.Quaternion() };
    });
    copies.push({ m, wings });
  }
  // wing trestles beside the trolley and on the apron beside the ramp; the panels lie flat on them, span along Z
  const stacks = [{ x: TROLLEY.x + 2.4, g: 0.15, z: TROLLEY.z }, { x: 2.65, g: APRON, z: -4.5 }];
  for (const st of stacks) {
    st.y = st.g + 0.42;
    for (const dz of [-1.0, 1.0]) {
      for (const s of [-1, 1]) P.add('timber', box(0.08, 0.4, 0.08, st.x + s * 0.45, st.g + 0.2, st.z + dz));
      P.add('timber', box(1.1, 0.08, 0.14, st.x, st.y - 0.04, st.z + dz));
    }
  }
  root.updateMatrixWorld(true);
  {
    const inv = new THREE.Matrix4(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3();
    copies.forEach((c, ci) => {
      const st = stacks[ci === 0 ? 1 : 0];
      inv.copy(c.m.matrixWorld).invert();
      c.wings.forEach((w, i) => {
        // panel i lies on the trestle, the right panel's root toward +Z (its span then runs to -Z) and the left's
        // toward -Z, the second on top of the first
        q.setFromAxisAngle(V(0, 1, 0), Math.PI / 2);
        m4.compose(V(st.x - 0.1, st.y + 0.06 + i * 0.12, st.z + (w.side > 0 ? 1.35 : -1.35)), q, V(1, 1, 1));
        m4.premultiply(inv);
        m4.decompose(w.stackP, w.stackQ, s3);
      });
    });
  }

  // ---- the steam generator trolley (Dampferzeuger): a four-wheeled frame with the hydrogen peroxide tank, the
  // decomposition chamber where the permanganate met it, and the steam pipe that couples to the tube's breech
  const gen = node(root, 'generator', GEN_ON.x, 0, GEN_ON.z);
  const GY = 0.85; // the coupling's height (the breech's centre)
  PG.add('camo', box(1.5, 0.12, 3.2, 0, 0.62, 1.8));
  for (const z of [0.7, 2.9]) for (const s of [-1, 1]) addWheel(PG, s * 0.78, 0.3, z, 0.3, 0.16, s, 14);
  for (const z of [0.7, 2.9]) PG.add('dark', xTube(-0.8, 0.8, 0.04, 0.04, 8, 0.3, z));
  PG.add('white', zTube(1.0, 3.25, 0.42, 0.42, 20, 0, 1.15), { tint: 0x9aa08c }); // the T-Stoff tank (painted pale)
  for (const z of [1.0, 3.25]) PG.add('steel', zTube(z - 0.02, z + 0.02, 0.43, 0.43, 20, 0, 1.15));
  for (const z of [1.4, 2.8]) PG.add('camo', box(0.9, 0.38, 0.1, 0, 0.83, z));
  PG.add('steel', yTube(0.68, 1.55, 0.2, 0.2, 14, 0, 0.45)); // the decomposition chamber
  PG.add('steel', yTube(1.55, 1.65, 0.24, 0.2, 14, 0, 0.45));
  PG.add('iron', zTube(-0.4, 0.45, 0.13, 0.13, 12, 0, GY)); // the steam pipe to the breech
  PG.add('iron', zTube(-0.42, -0.32, 0.25, 0.25, 14, 0, GY)); // its coupling flange
  PG.add('iron', rod(V(0, GY, 0.4), V(0, 1.45, 0.45), 0.1, 10));
  PG.add('dark', rod(V(0.25, 1.4, 0.45), V(0.3, 1.2, 1.0), 0.025, 6));
  PG.add('brass', handwheelish(0.12).translate(0.36, 1.25, 1.0));
  PG.add('camo', rod(V(0, 0.55, 3.4), V(0, 0.35, 4.4), 0.04, 6)); // the towing bar
  // drums of the chemicals beside the apron
  for (let i = 0; i < 5; i++) P.add('paint', yTube(0, 0.88, 0.29, 0.29, 12, 6.2 + (i % 3) * 0.62, 3.0 + Math.floor(i / 3) * 0.65), { tint: i % 2 ? 0xffffff : 0xb8c0a8 });

  // ---- the Richthaus: brick walls, a flat tarred roof, doors open at both ends, the white line on the floor
  {
    const { x, z, w, l, h } = RH, t = 0.36, door = 4.2, dh = 3.2;
    addP(P, 'concrete', box(w + 0.6, 0.2, l + 0.6, x, 0.1, z));
    for (const s of [-1, 1]) addP(P, 'brick', box(t, h, l, x + s * (w / 2 - t / 2), h / 2 + 0.2, z));
    for (const e of [-1, 1]) {
      const ze = z + e * (l / 2 - t / 2), side = (w - door) / 2;
      for (const s of [-1, 1]) addP(P, 'brick', box(side, h, t, x + s * (door / 2 + side / 2), h / 2 + 0.2, ze));
      addP(P, 'brick', box(door, h - dh, t, x, 0.2 + dh + (h - dh) / 2, ze));
      // the door leaves, timber (nothing magnetic in the building), swung open against the end wall
      for (const s of [-1, 1]) P.add('timber', box(door / 2, dh - 0.05, 0.08, x + s * (door / 2 + door / 4 + 0.05), 0.2 + dh / 2, ze + e * 0.25), { tint: 0xc8bca8 });
    }
    P.add('timber', box(w + 0.8, 0.22, l + 0.8, x, h + 0.31, z), { tint: 0xb0a898 });
    addP(P, 'roof', box(w + 0.9, 0.06, l + 0.9, x, h + 0.45, z));
    // the alignment line: down the middle of the floor and out across the aprons at both ends
    P.add('timber', new THREE.CylinderGeometry(2.6, 2.6, 0.06, 32).translate(x, 0.23, z), { tint: 0xd8c8a8 }); // the turntable
    addP(P, 'line', box(0.12, 0.02, l + 9, x, 0.27, z - 2));
    addP(P, 'line', box(0.9, 0.02, 0.06, x, 0.27, z));
    addP(P, 'concrete', box(6, 0.15, 7, x, 0.075, z - l / 2 - 3.5));
    for (let i = 0; i < 4; i++) P.add('timber', box(0.12, 0.6, 0.12, x + 3.2, 0.3, z - l / 2 - 1 - i * 1.6)); // a hand rail of posts
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
    P.add('rubber', rod(V(x + bw / 2, 0.04, z + 1.2), V(-5.6, 0.04, 3.0), 0.025, 5));
    P.add('rubber', rod(V(-5.6, 0.04, 3.0), V(-4.1, APRON + 0.04, 3.2), 0.025, 5));
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

  P.build(root, { dirt: 0.3, y0: 0 });
  PR.build(ramp, { dirt: 0.15, y0: Y0 });
  PS.build(sled, { dirt: 0.05, y0: Y0 + 0.4 });
  PT.build(trolley, { dirt: 0.3, y0: 0 });
  PG.build(gen, { dirt: 0.35, y0: 0 });

  // ---- state
  let where = 'none', wingK = 1, launchT = -1;
  const placeWings = () => {
    const k1 = smooth(wingK * 2), k2 = smooth(wingK * 2 - 1);
    for (const c of copies) c.wings.forEach((w, i) => {
      const k = i === 0 ? k1 : k2, o = w.mesh;
      o.position.copy(w.stackP).lerp(w.fit, k);
      o.position.y += Math.sin(Math.PI * k) * 0.5;
      o.quaternion.copy(w.stackQ).slerp(IDQ, k);
    });
  };
  const show = () => {
    const gone = launchT >= RUN;
    misT.visible = where === 'trolley';
    misR.visible = where === 'ramp' && !gone;
    sled.visible = !gone;
    sled.position.z = launchT > 0 ? SLED0 - (RL + SLED0) * Math.min(1, (launchT / RUN) ** 2) : SLED0;
  };
  rig.setMissile = (w) => { where = w === 'trolley' || w === 'ramp' ? w : 'none'; show(); };
  rig.setWings = (k) => { wingK = clamp01(k); placeWings(); };
  rig.setGenerator = (k) => {
    const s = smooth(k);
    gen.position.set(GEN_OFF.x + (GEN_ON.x - GEN_OFF.x) * s, 0, GEN_OFF.z + (GEN_ON.z - GEN_OFF.z) * s);
    gen.rotation.y = GEN_OFF.ry + (GEN_ON.ry - GEN_OFF.ry) * s;
  };
  rig.launch = (t) => { launchT = t == null || t < 0 ? -1 : t; show(); };
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
  anchor(rig, root, 'shellStack', stacks[0].x, stacks[0].y, stacks[0].z);
  anchor(rig, root, 'bunker', BUNKER.x, 0, BUNKER.z);
  crewSpot(rig, 'officer', -8.2, 0, 11.6, face(-8.2, 11.6, 0, -4), 'point');
  crewSpot(rig, 'launcher', BUNKER.x + 0.9, 0, BUNKER.z - 0.4, face(0, 0, 1, 0), 'stand');
  crewSpot(rig, 'fuel', 1.5, APRON, 4.6, face(1.5, 4.6, 0, 2.8), 'operate');
  crewSpot(rig, 'generator', -1.4, APRON, 2.4, face(-1.4, 2.4, 0, 2.0), 'crouch');
  crewSpot(rig, 'wing1', -1.9, APRON, -3.6, face(0, 0, 1, 0), 'stand');
  crewSpot(rig, 'wing2', 1.9, APRON, -3.6, face(0, 0, -1, 0), 'stand');
  crewSpot(rig, 'trolley', TROLLEY.x - 0.9, 0.15, TROLLEY.z + 4.9, face(0, 0, 0.3, -1), 'push');
  for (const s of [-1, 1]) hb(rig, s * 4.4 - 0.4, 0, -9, s * 4.4 + 0.4, 2.9, 4);
  hb(rig, -0.8, 0, -RL, 0.8, Y0 + RL * sinS + 0.3, 1);
  hb(rig, RH.x - RH.w / 2, 0, RH.z - RH.l / 2, RH.x + RH.w / 2, RH.h + 0.5, RH.z + RH.l / 2);
  hb(rig, BUNKER.x - 2.2, 0, BUNKER.z - 1.9, BUNKER.x + 2.2, 2.6, BUNKER.z + 1.9);
  return finishGun(rig);
}

const IDQ = new THREE.Quaternion();

// a small valve wheel about x
function handwheelish(r) {
  return new THREE.TorusGeometry(r, 0.015, 5, 14).rotateY(Math.PI / 2);
}

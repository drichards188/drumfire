import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, shellGeometry, ibeamX, ibeamZ, Parts, DEG } from '../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun } from '../rig.js';
import { pivotAt, hb, trayMount, floorFade } from '../rig.js';
import { mulberry32 } from '../../noise.js';

// BL 12-inch railway howitzer Mk III ("Hilda" stood in the Ypres sector in November 1917; refs/railway),
// the Group's railway gun. A deep riveted girder car with a dropped centre on two four-wheel bogies at 9.1 m
// centres, buffers and drawgear at each end, a barbette turntable in the middle carrying the mounting: two
// cheeks, the cradle with its recuperator above and buffers below the 5.7 m barrel, the elevating arc and
// handwheel on the left, and a raised loading stage behind the breech with a handrail, a ladder, the shell
// trolley on rails and a crane mast. Firing: four screw jacks under the car and beams across the track.
// Frames: root has the rail head at y = 0 and the track along Z (the muzzle points -Z at zero traverse);
// `traverse` is the barbette (+-20 degrees in the sim) and carries the whole mounting and the stage;
// `elevation` at the trunnions (barrel z -3.6 to +2.1), `recoil` (0.76 m), `breech`, `tray`; `trolley`
// slides along the stage rails (position.z, 0 at the rear end, about -3.1 at the breech). setShell takes
// 'tray' | 'trolley'. loadEl is the Mk III's 3.5 degrees.

const DECK = 1.4; // the top of the car's centre deck, the barbette stands on it
const TY = 3.0; // trunnions above the barbette
const MUZ = -3.6, BRE = 2.1;
const HX = 0.72;
const SHELL = { len: 1.25, rad: 0.1525 };
const STAGE_Y = TY - 1.0; // the loading stage, on the mounting, below the bore axis
const GAUGE = 1.435;

export function buildRail() {
  const rig = newGunRig('rail', 'railcamo');
  const root = rig.root, rnd = mulberry32(12);
  const mk = () => new Parts(rig.mats);
  const PL = mk(), PT = mk(), PE = mk(), PR = mk(), PB = mk(), PTR = mk(), PTK = mk();
  const trav = pivotAt(rig, root, 'traverse', 0, DECK, 0);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, 0);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', HX, 0, BRE + 0.03);
  const trolley = pivotAt(rig, trav, 'trolley', 0, STAGE_Y + 0.28, 5.8); // rests at the stage's rear; the run of 3 m forward leaves its round short of the breech
  rig.pivots.bogies = new THREE.Group();
  rig.pivots.bogies.name = 'bogies';
  root.add(rig.pivots.bogies);
  rig.recoilLength = 0.76;
  rig.loadEl = 0.06;
  rig.breechOpen = { axis: 'y', angle: 1.65 };
  const tray = trayMount(rig, trav, elev, -0.22, BRE + 0.1, 0.22, 1.2, 1.1);
  floorFade(rig, TY, BRE + 0.3, 0.54, 0.3, 0.2);

  // ---- the car: two deep plate girders with a dropped centre, deck plates, end beams, the barbette
  const prof = [[-5.9, 0.82], [-5.9, 1.98], [-4.2, 2.06]];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([-3.95 + 1.15 * t, 2.06 - 0.66 * (1 - Math.cos(t * Math.PI)) / 2]); }
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([2.8 + 1.15 * t, 1.4 + 0.66 * (1 - Math.cos(t * Math.PI)) / 2]); }
  prof.push([4.2, 2.06], [5.9, 1.98], [5.9, 0.82]);
  for (const s of [-1, 1]) {
    PL.add('camo', sideProfile(prof, 0.12, 0.01).translate(s * 1.3, 0, 0));
    const x = s * 1.37;
    PL.add('dark', rivetPoly(prof, (z, y) => V(x, y, z), 0.1, 0.2, V(s, 0, 0), 0.026));
    // vertical stiffeners and the rows of rivets along them, the lower flange angle
    for (let z = -5.4; z <= 5.5; z += 0.9) {
      let top = 0.9;
      for (let i = 0; i < prof.length - 1; i++) { const a = prof[i], b = prof[i + 1]; if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) top = Math.max(top, a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0])); }
      PL.add('camo', box(0.06, top - 0.9, 0.1, s * 1.4, 0.9 + (top - 0.9) / 2, z));
    }
    PL.add('camo', box(0.12, 0.1, 11.8, s * 1.36, 0.85, 0));
    PL.add('dark', rivetRow(V(s * 1.44, 0.93, -5.8), V(s * 1.44, 0.93, 5.8), 0.2, V(s, 0, 0), 0.026));
    // locker doors and a pipe handrail with stanchions along the top edge
    for (const z of [-2.2, 2.0]) { PL.add('camo', box(0.04, 0.4, 0.7, s * 1.42, 1.1, z)); PL.add('steel', box(0.03, 0.05, 0.12, s * 1.46, 1.1, z + 0.2)); }
  }
  PL.add('camo', box(2.6, 0.12, 11.8, 0, 0.88, 0)); // under-plate
  PL.add('camo', box(2.6, 0.1, 6.2, 0, DECK - 0.05, 0)); // the centre deck
  PL.add('camo', box(2.6, 0.1, 1.9, 0, 2.0, -5.0));
  PL.add('camo', box(2.6, 0.1, 1.9, 0, 2.0, 5.0));
  for (const z of [-4.3, 4.3]) PL.add('camo', box(2.6, 1.15, 0.1, 0, 1.45, z)); // cross bulkheads over the bogies
  // pipe handrails round the deck (waist high), stanchions every 1.2 m
  for (const s of [-1, 1]) {
    for (const [z0, z1, y] of [[-5.8, -3.3, 2.05], [3.3, 5.8, 2.05], [-3.0, 3.0, DECK]]) {
      for (let z = z0; z <= z1 + 0.01; z += 1.0) PL.add('dark', rod(V(s * 1.25, y, z), V(s * 1.25, y + 0.95, z), 0.022, 5));
      PL.add('dark', rod(V(s * 1.25, y + 0.95, z0), V(s * 1.25, y + 0.95, z1), 0.022, 5));
      PL.add('dark', rod(V(s * 1.25, y + 0.5, z0), V(s * 1.25, y + 0.5, z1), 0.016, 5));
    }
  }
  // ladders up the side
  for (const z of [-3.6]) for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) PL.add('dark', rod(V(s * 1.5, 0.95 + k * 0.28, z - 0.18), V(s * 1.5, 0.95 + k * 0.28, z + 0.18), 0.016, 5));
    for (const dz of [-0.18, 0.18]) PL.add('dark', rod(V(s * 1.5, 0.9, z + dz), V(s * 1.5, 2.1, z + dz), 0.018, 5));
  }
  // buffers and drawgear at both ends
  for (const e of [-1, 1]) {
    const z = e * 5.95;
    PL.add('camo', box(2.9, 0.34, 0.26, 0, 1.2, z));
    PL.add('dark', rivetRow(V(-1.3, 1.34, z + e * 0.14), V(1.3, 1.34, z + e * 0.14), 0.22, V(0, 0, e), 0.026));
    for (const x of [-0.9, 0.9]) { PL.add('steel', zTube(z, z + e * 0.55, 0.075, 0.075, 10, x, 1.2)); PL.add('steel', zTube(z + e * 0.5, z + e * 0.58, 0.19, 0.19, 16, x, 1.2)); }
    PL.add('dark', zTube(z, z + e * 0.5, 0.05, 0.05, 8, 0, 1.2));
    PL.add('chain', chain(V(-0.15, 1.05, z + e * 0.4), V(0.15, 1.05, z + e * 0.4), 0.18, 0.06));
  }
  // the barbette: a big round base with its roller ring
  PL.add('camo', yTube(DECK, DECK + 0.3, 1.75, 1.7, 40));
  PL.add('steel', yTube(DECK + 0.3, DECK + 0.36, 1.62, 1.62, 40));
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; PL.add('dark', rivets([V(Math.cos(a) * 1.72, DECK + 0.28, Math.sin(a) * 1.72)], V(Math.cos(a), 0, Math.sin(a)), 0.035)); }

  // ---- firing arrangements: beams across the track, four screw jacks, holdfast cables to pickets
  for (const z of [-1.8, 0, 1.8]) PL.add('timber', box(4.2, 0.32, 0.34, 0, 0.16, z));
  for (const x of [-1.5, 1.5]) for (const z of [-1.8, 1.8]) {
    PL.add('steel', yTube(0.32, 0.88, 0.09, 0.09, 12, x, z));
    PL.add('dark', box(0.4, 0.1, 0.4, x, 0.37, z));
    PL.add('dark', box(0.34, 0.1, 0.34, x, 0.86, z));
    PL.add('iron', handwheel(0.16, 4, 0.014, 0.03).rotateZ(Math.PI / 2).translate(x, 0.6, z));
  }
  for (const x of [-1, 1]) for (const z of [-2.6, 2.6]) {
    const px = x * 3.0;
    PL.add('timber', yTube(0, 0.5, 0.07, 0.07, 8, px, z));
    PL.add('chain', chain(V(x * 1.35, 1.2, z * 0.9), V(px, 0.45, z), 0.22, 0.06));
  }
  // the name, in white block capitals on the car side
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#e8e4d4';
  g2.font = 'bold 100px Impact, Arial Black, sans-serif';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText('HILDA', 256, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const nameMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), nameMat);
    m.position.set(s * 1.446, 1.72, -4.9);
    m.rotation.y = s * Math.PI / 2;
    root.add(m);
  }

  // ---- the bogies (they ride on the root, `bogies` group is for any later animation)
  for (const bz of [-4.55, 4.55]) {
    const B = rig.pivots.bogies;
    PTK.add('dark', box(2.0, 0.12, 2.5, 0, 0.68, bz));
    for (const s of [-1, 1]) {
      PTK.add('camo', box(0.08, 0.34, 3.0, s * 0.95, 0.55, bz));
      PTK.add('dark', rivetRow(V(s * 0.99, 0.55, bz - 1.35), V(s * 0.99, 0.55, bz + 1.35), 0.2, V(s, 0, 0), 0.022));
      // leaf springs above the axle boxes
      for (const dz of [-0.78, 0.78]) {
        for (let k = 0; k < 4; k++) PTK.add('dark', box(0.13, 0.025, 0.9 - k * 0.18, s * 0.97, 0.78 + k * 0.03, bz + dz));
        PTK.add('dark', box(0.2, 0.2, 0.2, s * 0.97, 0.6, bz + dz));
      }
    }
    for (const dz of [-0.78, 0.78]) {
      PTK.add('steel', xTube(-0.95, 0.95, 0.07, 0.07, 10, 0.45, bz + dz));
      for (const s of [-1, 1]) {
        // wheel: tyre with its flange on the inside, the plate, the hub and bolts
        PTK.add('steel', xTube(s * 0.66, s * 0.78, 0.45, 0.45, 28, 0.45, bz + dz));
        PTK.add('steel', xTube(s * 0.66, s * 0.69, 0.5, 0.5, 28, 0.45, bz + dz));
        PTK.add('camo', xTube(s * 0.78, s * 0.8, 0.4, 0.4, 28, 0.45, bz + dz));
        PTK.add('steel', xTube(s * 0.78, s * 0.9, 0.12, 0.1, 14, 0.45, bz + dz));
      }
    }
  }

  // ---- the mounting: cheeks, barbette plate, stage
  const cheek = [[-1.7, 0], [-1.7, 1.2], [-0.9, TY - 0.2], [-0.5, TY + 0.55], [0.5, TY + 0.55], [0.9, TY + 0.3], [1.7, 1.3], [2.5, 1.1], [2.6, 0]];
  for (const s of [-1, 1]) {
    PT.add('camo', sideProfile(cheek, 0.16, 0.01).translate(s * 0.95, 0, 0));
    PT.add('dark', rivetPoly(cheek, (z, y) => V(s * 1.04, y, z), 0.09, 0.2, V(s, 0, 0), 0.024));
    for (const z of [-1.4, -0.9, 0.9, 1.5, 2.1]) {
      let top = 0;
      for (let i = 0; i < cheek.length; i++) { const a = cheek[i], b = cheek[(i + 1) % cheek.length]; if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) top = Math.max(top, a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0])); }
      PT.add('camo', box(0.06, top - 0.3, 0.09, s * 1.07, 0.3 + (top - 0.3) / 2, z));
    }
    PT.add('camo', rbox(0.4, 0.3, 1.3, 0.06, s * 0.95, TY + 0.7, 0));
  }
  PT.add('camo', box(2.1, 0.22, 4.6, 0, 0.11, 0.4)); // the mounting's base plate
  PT.add('camo', box(1.9, 0.5, 0.3, 0, 0.5, 2.6)); // rear cross-girder
  PT.add('camo', box(1.9, 0.4, 0.3, 0, 0.9, -1.55));
  // elevating handwheel on the left and the rapid elevating wheel
  PT.add('iron', handwheel(0.46, 8, 0.028, 0.07).translate(-1.4, 1.2, 1.2));
  PT.add('steel', xTube(-1.4, -0.72, 0.05, 0.05, 8, 1.2, 1.2)); // the pinion shaft ends outside the breech ring's sweep
  PT.add('iron', handwheel(0.28, 6, 0.022, 0.05).translate(-1.3, 0.7, 2.0));
  // the loading stage: planks on a steel frame with handrail, a ladder, and the trolley rails
  // The stage is cut back behind the breech: the elevating arc and the breech tail swing down through where
  // it used to run at 40 degrees, and the hinge of the opened block passes over the sides. Its front is a
  // hinged bridge (the "bridge piece" of the Mk V diagram) that lies flat for loading, carrying the trolley
  // rails to the breech, and folds up behind the breech when the gun is raised.
  const SZ0 = 3.6, SZ1 = 6.6, SW = 1.15, BZ = 2.2;
  PT.add('camo', box(2 * SW, 0.14, SZ1 - SZ0, 0, STAGE_Y - 0.07, (SZ0 + SZ1) / 2));
  for (let i = 0; i < 10; i++) PT.add('timber', box(2 * SW - 0.1, 0.04, 0.28, 0, STAGE_Y + 0.02, SZ0 + 0.2 + i * 0.3));
  for (const s of [-1, 1]) {
    PT.add('camo', ibeamZ(SZ0, SZ1, 0.3, 0.14, 0.03, s * SW * 0.9, STAGE_Y - 0.3));
    // the handrail; on the left it has a gate where the loading tray parks
    const r0 = s < 0 ? SZ0 + 1.4 : SZ0 + 0.2;
    for (let z = r0; z <= SZ1; z += 1.1) PT.add('dark', rod(V(s * SW, STAGE_Y, z), V(s * SW, STAGE_Y + 0.95, z), 0.022, 5));
    PT.add('dark', rod(V(s * SW, STAGE_Y + 0.95, r0), V(s * SW, STAGE_Y + 0.95, SZ1), 0.022, 5));
    PT.add('dark', rod(V(s * SW, STAGE_Y + 0.5, r0), V(s * SW, STAGE_Y + 0.5, SZ1), 0.016, 5));
    // the trolley rails on the fixed stage
    PT.add('steel', box(0.06, 0.07, SZ1 - SZ0 - 0.2, s * 0.45, STAGE_Y + 0.075, (SZ0 + SZ1) / 2));
  }
  PT.add('dark', rod(V(-SW, STAGE_Y + 0.95, SZ1), V(SW, STAGE_Y + 0.95, SZ1), 0.022, 5));
  // the bridge (frame: origin at its rear hinge just in front of the stage edge, the deck runs forward along -Z)
  const bridge = pivotAt(rig, trav, 'bridge', 0, STAGE_Y, SZ0 - 0.03);
  const BL = SZ0 - 0.03 - BZ;
  const PBG = mk();
  PBG.add('camo', box(0.96, 0.1, BL, 0, -0.07, -BL / 2));
  for (let i = 0; i < 4; i++) PBG.add('timber', box(0.9, 0.04, 0.28, 0, -0.01, -0.2 - i * 0.3));
  for (const s of [-1, 1]) {
    PBG.add('steel', box(0.06, 0.07, BL, s * 0.45, 0.075, -BL / 2));
    PBG.add('camo', box(0.06, 0.12, BL, s * 0.45, -0.04, -BL / 2));
  }
  for (const z of [-0.5, -BL + 0.2]) PBG.add('camo', box(0.96, 0.05, 0.08, 0, 0.03, z));
  PBG.build(bridge, { dirt: 0.1, y0: DECK + STAGE_Y });
  const setTrayOnly = rig.setTray;
  rig.setTray = (k, d = k) => { setTrayOnly(k); bridge.rotation.x = Math.min(1, Math.max(0, d)) * 1.52; };
  rig.setTray(1);
  // props under the stage back to the base
  for (const s of [-1, 1]) PT.add('camo', rod(V(s * 0.95, STAGE_Y - 0.3, SZ1 - 0.3), V(s * 0.95, 0.2, 3.0), 0.05, 6));
  // the crane mast at the rear right of the stage and its chain
  PT.add('camo', box(0.18, 2.6, 0.18, 1.05, STAGE_Y + 1.3, SZ1 - 0.2));
  PT.add('camo', rod(V(1.05, STAGE_Y + 2.5, SZ1 - 0.2), V(0.78, STAGE_Y + 2.3, SZ1 - 1.0), 0.07, 8)); // the hook hangs to one side of the round's path
  PT.add('chain', chain(V(0.8, STAGE_Y + 2.28, SZ1 - 1.0), V(0.8, STAGE_Y + 0.9, SZ1 - 1.0), 0.03, 0.06));
  PT.add('steel', new THREE.TorusGeometry(0.09, 0.025, 6, 12).translate(0.8, STAGE_Y + 0.82, SZ1 - 1.0));
  // ladder from the car deck up to the stage
  for (let k = 0; k < 8; k++) PT.add('dark', rod(V(-0.2, 0.2 + k * 0.28, SZ1 + 0.05), V(0.2, 0.2 + k * 0.28, SZ1 + 0.05), 0.016, 5));
  for (const x of [-0.2, 0.2]) PT.add('dark', rod(V(x, 0.15, SZ1 + 0.05), V(x, STAGE_Y + 0.9, SZ1 + 0.05), 0.018, 5));

  // ---- the trolley (children of the trolley pivot, origin at the middle of its deck)
  PTK.add('camo', box(0.5, 0.05, 1.5, 0, 0, 0));
  for (const s of [-1, 1]) for (const z of [-0.55, 0.55]) PTK.add('steel', xTube(s * 0.45 - 0.0, s * 0.45, 0.07, 0.07, 10, -0.08, z));
  PTK.add('timber', box(0.45, 0.1, 0.22, 0, 0.07, -0.35));
  PTK.add('timber', box(0.45, 0.1, 0.22, 0, 0.07, 0.35));

  // ---- cradle, recuperator, buffers, arc, sight
  PE.add('camo', rbox(1.3, 1.2, 2.8, 0.22, 0, 0, -0.1));
  for (const z of [-1.5, 1.3]) PE.add('steel', rbox(1.36, 1.26, 0.09, 0.04, 0, 0, z));
  PE.add('steel', xTube(-1.15, 1.15, 0.24, 0.24, 16));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.65, s * 1.0, 0.34, 0.34, 20));
    PE.add('steel', xTube(s * 1.0, s * 1.06, 0.28, 0.28, 20));
    PE.add('dark', rivets(Array.from({ length: 8 }, (_, i) => V(s * 1.07, Math.sin(i * Math.PI / 4) * 0.21, Math.cos(i * Math.PI / 4) * 0.21)), V(s, 0, 0), 0.032));
  }
  const tubes = [[0, 0.82, 0.19], [-0.38, -0.78, 0.11], [0.38, -0.78, 0.11]];
  rig.nest = tubes.map(([x, y]) => [x, y]); // cylinder axes the piston rods slide into (used by the clip check)
  for (const [x, y, r] of tubes) {
    PE.add('camo', zTube(-1.2, 1.7, r, r, 16, x, y));
    PE.add('steel', zTube(-1.26, -1.1, r * 1.12, r * 1.12, 16, x, y));
    PE.add('camo', sphere(r * 1.05, x, y, 1.7, 1, 1, 0.8, 10));
    for (const z of [-0.6, 0.2, 1.0]) PE.add('steel', zTube(z - 0.04, z + 0.04, r * 1.15, r * 1.15, 14, x, y));
    for (const z of [-0.8, 0.5, 1.3]) PE.add('camo', box(0.16, 0.22, 0.24, x, y > 0 ? 0.65 : -0.62, z));
  }
  PE.add('steel', gearArc(1.7, 1.86, 25 * DEG, 80 * DEG, 0.24, 26, 0.045));
  PE.add('camo', gearArc(1.2, 1.7, 25 * DEG, 80 * DEG, 0.18));
  PE.add('camo', box(0.34, 0.24, 1.0, 0, -0.78, 0.7));
  PE.add('camo', box(0.1, 0.5, 0.7, -1.32, 0.45, 0.0)); // the sight bracket stands outside the left cheek and its bearing cap
  PE.add('camo', box(0.4, 0.07, 0.5, -1.47, 0.82, 0.0));
  PE.add('brass', yTube(0.84, 1.16, 0.05, 0.05, 10, -1.52, 0.0));
  PE.add('dark', zTube(-0.35, 0.1, 0.028, 0.025, 8, -1.52, 1.1));

  // ---- barrel (a deep, fat Mk III with its jacket, bands and a clip for the rods)
  const bp = [[MUZ, 0.2], [MUZ, 0.37], [MUZ + 0.06, 0.4], [MUZ + 0.22, 0.4], [MUZ + 0.3, 0.37], [-2.5, 0.375], [-1.9, 0.41], [-1.4, 0.46], [-1.36, 0.52], [1.7, 0.52], [1.74, 0.6], [BRE - 0.04, 0.6], [BRE, 0.54], [BRE, 0.25], [BRE - 0.005, 0]];
  PR.add('iron', zLathe(bp, 36), { tint: 0x838a80 });
  for (const z of [-1.36, -0.5, 0.4, 1.2, 1.7]) PR.add('iron', zTube(z - 0.04, z + 0.04, 0.535, 0.535, 36), { tint: 0x9a9f94 });
  PR.add('iron', zTube(MUZ + 0.3 - 0.03, MUZ + 0.3 + 0.03, 0.41, 0.41, 28), { tint: 0x9a9f94 });
  PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.2, 0.18, 0.18, 18));
  PR.add('camo', zTube(-2.5, -2.36, 0.46, 0.46, 26)); // the clip rides ahead of the cradle by more than the stroke
  for (const [x, y] of [[0, 0.82], [-0.38, -0.78], [0.38, -0.78]]) {
    PR.add('camo', rod(V(x * 0.4, Math.sign(y) * 0.48, -2.43), V(x, y, -2.43), 0.06, 8));
    PR.add('steel', zTube(-2.43, -1.1, 0.04, 0.04, 8, x, y));
  }
  PR.add('steel', zTube(BRE - 0.01, BRE + 0.015, 0.46, 0.46, 32), { tint: 0xb0b0a8 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; PR.add('steel', box(0.08, 0.12, 0.05, Math.cos(a) * 0.34, Math.sin(a) * 0.34, BRE + 0.02, 0, 0, a + Math.PI / 2)); }
  PR.add('dark', zTube(BRE + 0.01, BRE + 0.03, 0.17, 0.17, 18));
  PR.add('steel', rbox(0.18, 0.2, 0.32, 0.03, 0, 0.72, BRE - 0.25));
  PR.add('brass', yTube(0.72, 0.9, 0.035, 0.045, 8, 0, BRE - 0.25));
  PR.add('camo', rbox(0.16, 0.82, 0.24, 0.04, HX, 0, BRE - 0.19)); // hinge lug, ends short of the swinging block
  // the breech carrier
  PB.add('steel', yTube(-0.45, 0.45, 0.06, 0.06, 10, 0, 0.1));
  PB.add('camo', rbox(0.8, 0.46, 0.26, 0.04, -0.38, 0, 0.14));
  PB.add('camo', zTube(0.0, 0.26, 0.54, 0.54, 32, -HX, 0));
  PB.add('steel', zTube(0.26, 0.3, 0.17, 0.17, 18, -HX, 0));
  PB.add('iron', xTube(-HX - 0.32, -HX + 0.32, 0.026, 0.026, 8, 0, 0.46));
  for (const s of [-1, 1]) PB.add('iron', sphere(0.045, -HX + s * 0.32, 0, 0.46, 1, 1, 1, 8));
  PB.add('dark', rivets(Array.from({ length: 12 }, (_, i) => V(-HX + Math.cos(i / 12 * 6.283) * 0.44, Math.sin(i / 12 * 6.283) * 0.44, 0.26)), V(0, 0, 1), 0.028));

  // ---- loading tray (bridge piece)
  // two runners with a slot between them: the round rises from the trolley beneath through it
  for (const s of [-1, 1]) PTR.add('camo', box(0.25, 0.06, 2.0, s * 0.325, 0, 1.1));
  for (const s of [-1, 1]) {
    PTR.add('camo', box(0.06, 0.2, 2.0, s * 0.45, 0.12, 1.1));
    PTR.add('dark', rivetRow(V(s * 0.48, 0.14, 0.2), V(s * 0.48, 0.14, 2.0), 0.18, V(s, 0, 0), 0.02));
  }
  for (const z of [0.3, 1.8]) for (const s of [-1, 1]) PTR.add('camo', box(0.25, 0.07, 0.08, s * 0.325, -0.05, z));
  for (const s of [-1, 1]) PTR.add('chain', chain(V(s * 0.45, 0.2, 2.0), V(s * 0.7, 0.9, 0.2), 0.2, 0.06));

  PL.build(root, { dirt: 0.25, y0: 0 });
  PTK.build(rig.pivots.bogies, { dirt: 0.4, y0: 0 });
  PT.build(trav, { dirt: 0.1, y0: DECK });
  PE.build(elev, { dirt: 0.05, y0: DECK + TY });
  PR.build(rec, { dirt: 0.05, y0: DECK + TY });
  PB.build(brc, { dirt: 0.05, y0: DECK + TY });
  PTR.build(tray, { dirt: 0.05, y0: DECK + TY });

  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.22, 1.2);
  addShellProp(rig, 'trolley', trolley, SHELL.len, SHELL.rad, 0, 0.2, 0);
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, trav, 'eye', 0, TY + 0.3, 0.2);
  rig.anchors.shellStack = new THREE.Object3D();
  rig.anchors.shellStack.position.set(0, 0.0, 8.2); // shells waiting at the track side behind the car
  root.add(rig.anchors.shellStack);
  rig.update = rig.trayTilt;
  rig.update();
  hb(rig, -1.5, 0, -6.1, 1.5, 2.2, 6.1);
  hb(rig, -1.4, DECK, -3.8, 1.4, DECK + TY + 2.2, 5.8);

  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI, SY = DECK + STAGE_Y;
  crewSpot(rig, 'sergeant', -1.9, DECK + 0.0, -1.4, E, 'point');
  crewSpot(rig, 'layer', -1.6, DECK, 1.2, E, 'lay');
  crewSpot(rig, 'lanyard', 0.9, SY, 3.9, N, 'lanyard');
  crewSpot(rig, 'loader1', -0.7, SY + 0.04, 3.9, N, 'carry');
  crewSpot(rig, 'loader2', 0.7, SY + 0.04, 3.9, N, 'carry');
  crewSpot(rig, 'rammer1', -0.55, SY + 0.04, 4.6, N, 'ram');
  crewSpot(rig, 'rammer2', 0.55, SY + 0.04, 4.6, N, 'ram');
  crewSpot(rig, 'trolley1', -0.3, SY + 0.04, 6.1, N, 'push');
  crewSpot(rig, 'crane', 0.85, SY + 0.04, 5.9, S, 'operate');
  crewSpot(rig, 'ammo1', -1.5, 0, 8.0, E, 'stand');
  return finishGun(rig);
}

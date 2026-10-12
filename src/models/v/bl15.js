import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, topProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, shellGeometry, ibeamX, ibeamZ, ibeamY, mergeAll, Parts, DEG } from '../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun } from '../rig.js';
import { pivotAt, hb } from '../rig.js';
import { mulberry32 } from '../../noise.js';

// BL 15-inch howitzer (Coventry Ordnance Works, 1915), "Granny". From refs/bl15in: the 1,400 lb shell,
// a barrel about 4.6 m long and 1.4 m across at the breech ring, in a box cradle with its hydraulic
// buffers and recuperators along the top and under it, between two riveted steel cheeks; a huge earth box
// of ballast in front, an elevating arc and a big handwheel on the left, a traversing wheel on the right,
// a loading tray hinged behind the breech, and a king-post shell crane with a chain hoist beside the
// platform. The whole stands on a timber grillage. Gameplay scale: arcade values, not a drawing.
//
// Frames: root has the ground at y = 0 and the platform top at PH. `traverse` sits on the platform
// (children use y from the platform top), `elevation` at the trunnions (z = 0 is the trunnion axis, the
// barrel runs z -3.0 to +1.65, so -Z is the muzzle), `recoil` carries the barrel, `breech` the swinging
// block carrier hinged on the right (setBreech(1) swings it 1.65 rad). `tray` hinges at the breech and
// keeps the loading tilt when the gun is elevated above loadEl (update() does that).
// `crane` is the jib (rotation.y 0 over the tray, PI over the shell stack), `hoist` the hook block
// (position.y is the block's height in the crane frame: rig.hoistRange.up raised, .down at the stack); the chain follows in update().

const PH = 0.55; // platform top
const TY = 2.5; // trunnion height above the platform top
const MUZ = -3.1, BRE = 1.8; // barrel ends, on the elevation frame's z
const HX = 0.98; // breech hinge x
const CX = 3.2, CZ = 3.6; // crane post
const JIB_R = 3.2; // from the post to the hook
const SHELL = { len: 1.52, rad: 0.19 };
const HOIST_TOP = 4.2, HOIST_LOW = 1.15; // hook block height in the crane frame

// the cheek outline as [z, y] from the platform top: front slope, the hump over the trunnion, a low rear
function cheekOutline() {
  return [[-2.4, 0], [-2.4, 1.1], [-1.5, 1.75], [-1.0, TY + 0.45], [-0.6, TY + 0.58], [0.6, TY + 0.58], [1.0, TY + 0.45], [1.5, 1.6], [2.4, 1.35], [3.0, 1.2], [3.0, 0]];
}
function polyTop(poly, z) {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) best = Math.max(best, a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]));
  }
  return best;
}

export function buildBL15() {
  const rig = newGunRig('bl15', 'drab');
  const root = rig.root, rnd = mulberry32(15);
  const mk = () => new Parts(rig.mats);
  const PL = mk(), PT = mk(), PE = mk(), PR = mk(), PB = mk(), PTR = mk(), PC = mk(), PH2 = mk();

  const trav = pivotAt(rig, root, 'traverse', 0, PH, 0);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, 0);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', HX, 0, BRE + 0.03);
  const tray = pivotAt(rig, elev, 'tray', 0, -0.2, BRE + 0.08);
  const crane = pivotAt(rig, root, 'crane', CX, 0, CZ);
  const hoist = pivotAt(rig, crane, 'hoist', -JIB_R, HOIST_TOP, 0);
  rig.recoilLength = 0.8;
  rig.loadEl = 0.3;
  rig.breechOpen = { axis: 'y', angle: 1.65 };

  // ------------------------------------------------------------------ the ground platform (root)
  {
    // two layers of baulks: across x below, along z above, each a little different
    for (let i = 0; i < 31; i++) {
      const z = -4.6 + i * 0.31, l = 5.3 + (rnd() - 0.5) * 0.12;
      PL.add('timber', box(l, 0.27, 0.29, 0 + (rnd() - 0.5) * 0.06, 0.135, z, 0, (rnd() - 0.5) * 0.01));
    }
    for (let i = 0; i < 17; i++) {
      const x = -2.52 + i * 0.315;
      PL.add('timber', box(0.295, 0.27, 9.6 + (rnd() - 0.5) * 0.1, x, 0.405, 0.0, 0, 0, 0), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
    }
    // iron straps and bolts along the rim of the top layer
    for (const z of [-3.9, -1.3, 1.3, 3.9]) {
      PL.add('dark', box(5.4, 0.03, 0.14, 0, 0.555, z));
      PL.add('dark', rivetRow(V(-2.5, 0.57, z), V(2.5, 0.57, z), 0.4, V(0, 1, 0), 0.032));
    }
    // plank ramp at the rear down to the ground, and the earth banked against the sides
    PL.add('timber', box(2.4, 0.09, 1.9, 0, 0.27, 5.55, 0.3));
    for (let i = 0; i < 6; i++) PL.add('timber', box(0.3, 0.05, 1.9, -1.05 + i * 0.42, 0.31, 5.55, 0.3), { tint: 0xe6dccb });
    for (const s of [-1, 1]) {
      for (const [z, w, l, h] of [[-3.0, 1.1, 2.8, 0.32], [0.4, 0.9, 3.0, 0.28], [3.4, 1.0, 2.5, 0.25]]) {
        PL.add('soil', sphere(1, s * (2.85 + w * 0.3), 0.05, z, w, h, l * 0.5, 9));
        for (let k = 0; k < 4; k++) PL.add('soil', sphere(0.35, s * (2.7 + rnd() * w), 0.12, z + (rnd() - 0.5) * l, 1.0, 0.5, 1.1, 6));
      }
    }
  }

  // ------------------------------------------------------------------ carriage (traverse frame, y above the platform)
  const outline = cheekOutline();
  {
    // cheeks: thick riveted plates with stiffening ribs, a skirt along the bottom and trunnion caps
    for (const s of [-1, 1]) {
      const cheek = sideProfile(outline, 0.22, 0.01).translate(s * 1.25, 0, 0);
      PT.add('camo', cheek);
      const nrm = V(s, 0, 0), x = s * 1.365;
      PT.add('dark', rivetPoly(outline, (z, y) => V(x, y, z), 0.1, 0.22, nrm, 0.028));
      // the vertical stiffeners (angle irons) on the outer face
      for (const z of [-2.2, -1.7, -1.2, -0.5, 0.5, 1.5, 2.2, 2.8]) {
        const top = polyTop(outline, z) - 0.15;
        if (top > 0.5) PT.add('camo', box(0.09, top - 0.1, 0.1, s * 1.41, 0.1 + (top - 0.1) / 2, z));
      }
      // butt strap along the base and a second above it
      PT.add('camo', box(0.07, 0.3, 5.4, s * 1.41, 0.2, 0.3));
      PT.add('dark', rivetRow(V(s * 1.45, 0.2, -2.3), V(s * 1.45, 0.2, 2.9), 0.2, nrm, 0.027));
      // trunnion bearing cap on top of the hump
      PT.add('camo', rbox(0.5, 0.34, 1.5, 0.08, s * 1.25, TY + 0.7, 0));
      PT.add('dark', rivets([V(s * 1.25 - 0.14, TY + 0.88, -0.5), V(s * 1.25 + 0.14, TY + 0.88, -0.5), V(s * 1.25 - 0.14, TY + 0.88, 0.5), V(s * 1.25 + 0.14, TY + 0.88, 0.5)], V(0, 1, 0), 0.05));
      // lifting ring on the cheek top front
      PT.add('chain', new THREE.TorusGeometry(0.14, 0.03, 6, 12).rotateY(Math.PI / 2).translate(s * 1.38, 1.9, -1.45));
    }
    // inner floor and the rear girders tying the cheeks
    PT.add('camo', box(2.4, 0.14, 6.4, 0, 0.1, 0.4));
    PT.add('camo', box(2.4, 0.62, 0.34, 0, 0.62, 2.85));
    PT.add('camo', box(2.4, 0.34, 0.3, 0, 1.15, 2.3));
    PT.add('dark', rivetRow(V(-1.1, 0.8, 3.03), V(1.1, 0.8, 3.03), 0.2, V(0, 0, 1), 0.026));
    PT.add('dark', rivetRow(V(-1.1, 0.5, 3.03), V(1.1, 0.5, 3.03), 0.2, V(0, 0, 1), 0.026));
    // front: the bracing struts up to the earth box
    for (const s of [-1, 1]) PT.add('camo', rod(V(s * 1.3, 1.1, -2.3), V(s * 1.4, 0.2, -3.0), 0.07, 6));

    // the earth box in front: a riveted steel tank, panelled, edged with angles, and filled with earth
    const EB = { w: 3.5, h: 1.8, z0: -4.4, z1: -2.5 };
    const ez = (EB.z0 + EB.z1) / 2, ed = EB.z1 - EB.z0;
    PT.add('camo', rbox(EB.w, EB.h, ed, 0.03, 0, EB.h / 2 + 0.02, ez));
    for (const s of [-1, 1]) {
      for (const zc of [EB.z0, EB.z1]) PT.add('camo', box(0.12, EB.h + 0.06, 0.12, s * (EB.w / 2 - 0.02), EB.h / 2, zc));
      PT.add('camo', box(0.1, 0.12, ed + 0.1, s * (EB.w / 2 - 0.02), EB.h + 0.02, ez));
    }
    PT.add('camo', box(EB.w, 0.12, 0.12, 0, EB.h + 0.02, EB.z0 - 0.01));
    PT.add('camo', box(EB.w, 0.12, 0.12, 0, EB.h + 0.02, EB.z1 + 0.01));
    // panel seams and rivet rows on the front and the two sides
    for (const [nrm, x, z] of [[V(0, 0, -1), 0, EB.z0 - 0.03]]) {
      for (const yy of [0.6, 1.2]) PT.add('camo', box(EB.w - 0.2, 0.09, 0.05, x, yy, z));
      for (const xx of [-1.2, -0.6, 0, 0.6, 1.2]) PT.add('camo', box(0.09, EB.h - 0.15, 0.05, xx, EB.h / 2, z));
      for (const yy of [0.6, 1.2, 0.2, 1.6]) PT.add('dark', rivetRow(V(-1.65, yy, z - 0.02), V(1.65, yy, z - 0.02), 0.2, nrm, 0.03));
    }
    for (const s of [-1, 1]) {
      const x = s * (EB.w / 2 + 0.01);
      for (const zz of [-4.0, -3.5, -3.0]) PT.add('camo', box(0.05, EB.h - 0.15, 0.09, x, EB.h / 2, zz));
      for (const yy of [0.6, 1.2]) PT.add('camo', box(0.05, 0.09, ed - 0.2, x, yy, ez));
      for (const yy of [0.2, 0.6, 1.2, 1.6]) PT.add('dark', rivetRow(V(x + s * 0.03, yy, EB.z0 + 0.1), V(x + s * 0.03, yy, EB.z1 - 0.1), 0.2, V(s, 0, 0), 0.03));
      PT.add('chain', new THREE.TorusGeometry(0.15, 0.03, 6, 12).rotateY(Math.PI / 2).translate(s * (EB.w / 2 + 0.06), 1.5, ez));
    }
    // the earth: a lumpy heap standing proud of the open top, with stones
    PT.add('soil', box(EB.w - 0.25, 0.18, ed - 0.25, 0, EB.h + 0.02, ez));
    for (let i = 0; i < 14; i++) {
      const x = (rnd() - 0.5) * (EB.w - 0.7), z = EB.z0 + 0.35 + rnd() * (ed - 0.7), r = 0.28 + rnd() * 0.3;
      PT.add('soil', sphere(r, x, EB.h + 0.1, z, 1.2, 0.5 + rnd() * 0.3, 1.1, 7), { tint: rnd() > 0.7 ? 0x9a8f7e : 0xffffff });
    }

    // the right-hand platform for the layer and the lanyard man: a steel bracket and a timber deck
    const DY = 1.45, DX = 2.0;
    for (const z of [-0.1, 1.0, 2.1]) PT.add('camo', box(0.06, 0.34, 1.0, DX - 0.05, DY - 0.2, z), { tint: 0xe0e0e0 });
    for (const z of [-0.1, 1.0, 2.1]) PT.add('camo', rod(V(1.4, DY - 0.9, z), V(DX - 0.05, DY - 0.2, z), 0.04, 6));
    for (let i = 0; i < 8; i++) PT.add('timber', box(1.1, 0.06, 0.29, DX, DY, -0.35 + i * 0.37, 0, 0, 0));
    PT.add('dark', rod(V(2.5, DY, -0.35), V(2.5, DY + 0.9, -0.35), 0.022, 5));
    PT.add('dark', rod(V(2.5, DY, 2.5), V(2.5, DY + 0.9, 2.5), 0.022, 5));
    PT.add('dark', rod(V(2.5, DY + 0.9, -0.35), V(2.5, DY + 0.9, 2.5), 0.02, 5));
    PT.add('dark', rod(V(2.5, DY + 0.45, -0.35), V(2.5, DY + 0.45, 2.5), 0.015, 5));
    // steps up to it
    for (let i = 0; i < 3; i++) PT.add('timber', box(0.6, 0.05, 0.3, DX, 0.45 + i * 0.33, 2.8 + i * 0.3));

    // traversing screw and wheel on the right, a locking screw behind
    PT.add('iron', handwheel(0.38, 6, 0.024, 0.06).translate(1.82, 0.9, 2.45));
    PT.add('steel', xTube(1.2, 1.86, 0.045, 0.045, 8, 0.9, 2.45));
    PT.add('dark', box(0.2, 0.28, 0.3, 1.5, 0.9, 2.45));
    // the elevating pinion shaft and the layer's handwheel on the left; a brass-bound dial beside it
    PT.add('iron', handwheel(0.46, 6, 0.026, 0.07).translate(-1.75, 0.95, 1.45));
    PT.add('steel', xTube(-1.8, 0.2, 0.05, 0.05, 8, 0.95, 1.45));
    PT.add('dark', box(0.26, 0.34, 0.34, -1.52, 0.95, 1.45));
  }

  // ------------------------------------------------------------------ cradle, buffers and the elevating arc (elevation frame)
  {
    PE.add('camo', rbox(1.9, 1.76, 3.0, 0.32, 0, 0, -0.2));
    // slide bands at the front and rear of the cradle, rivets down its sides
    for (const z of [-1.7, 1.3]) PE.add('steel', rbox(1.98, 1.84, 0.1, 0.05, 0, 0, z));
    for (const s of [-1, 1]) {
      PE.add('dark', rivetRow(V(s * 0.96, 0.55, -1.4), V(s * 0.96, 0.55, 1.1), 0.18, V(s, 0, 0), 0.028));
      PE.add('dark', rivetRow(V(s * 0.96, -0.55, -1.4), V(s * 0.96, -0.55, 1.1), 0.18, V(s, 0, 0), 0.028));
    }
    // the trunnions: pins, big caps with bolts, oil caps
    PE.add('steel', xTube(-1.7, 1.7, 0.32, 0.32, 18));
    for (const s of [-1, 1]) {
      PE.add('camo', xTube(s * 0.9, s * 1.5, 0.46, 0.46, 22));
      PE.add('steel', xTube(s * 1.5, s * 1.58, 0.38, 0.38, 22));
      const pts = [];
      for (let i = 0; i < 8; i++) pts.push(V(s * 1.59, Math.sin(i * Math.PI / 4) * 0.28, Math.cos(i * Math.PI / 4) * 0.28));
      PE.add('dark', rivets(pts, V(s, 0, 0), 0.04));
      PE.add('brass', xTube(s * 1.58, s * 1.66, 0.07, 0.07, 10, 0, 0));
    }
    // the buffers and recuperators: four cylinders along the cradle with glands and rear caps; their
    // piston rods run forward to a clip on the barrel (recoil group)
    const tubes = [[-0.62, 1.08, 0.15], [0.62, 1.08, 0.15], [-0.55, -1.05, 0.12], [0.55, -1.05, 0.12]];
    for (const [x, y, r] of tubes) {
      PE.add('camo', zTube(-1.55, 1.5, r, r, 16, x, y));
      PE.add('steel', zTube(-1.6, -1.45, r * 1.12, r * 1.12, 16, x, y));
      PE.add('steel', zTube(1.4, 1.5, r * 1.1, r * 1.1, 16, x, y));
      PE.add('camo', sphere(r * 1.05, x, y, 1.5, 1, 1, 0.8, 10));
      for (const z of [-0.8, 0.0, 0.8]) PE.add('steel', zTube(z - 0.04, z + 0.04, r * 1.15, r * 1.15, 14, x, y));
      // saddle brackets joining it to the cradle
      const cy = y > 0 ? 0.8 : -0.8;
      for (const z of [-1.1, 0.4, 1.0]) PE.add('camo', box(0.18, Math.abs(y - cy) + r, 0.22, x, (y + cy) / 2, z));
    }
    // the elevating arc under the rear of the cradle, with its web and the teeth
    PE.add('steel', gearArc(2.0, 2.16, 26 * DEG, 78 * DEG, 0.3, 30, 0.05));
    PE.add('camo', gearArc(1.45, 2.0, 26 * DEG, 78 * DEG, 0.2));
    PE.add('camo', box(0.42, 0.3, 1.1, 0, -0.95, 0.65));
    // the sight bracket: a flat blade out on the left of the cradle, with the dial sight and clinometer
    PE.add('camo', topProfile([[-0.8, 0.3], [-0.8, -0.95], [-1.9, -1.7], [-1.75, -0.4], [-1.3, 0.3]], 0.0, 0.07).translate(0, 0.68, 0));
    PE.add('camo', box(0.25, 0.3, 0.5, -1.0, 0.82, 0.0));
    PE.add('brass', yTube(0.76, 1.2, 0.07, 0.07, 12, -1.0, -0.15));
    PE.add('dark', zTube(-0.45, 0.05, 0.035, 0.03, 8, -1.0, 1.1));
    PE.add('brass', yTube(0.88, 0.9, 0.12, 0.12, 14, 0.5, 0.5));
    // the data plate on the cradle top
    PE.add('brass', box(0.42, 0.012, 0.3, 0, 0.882, -0.3));
  }

  // ------------------------------------------------------------------ the barrel (recoil group)
  {
    const prof = [[MUZ, 0.22], [MUZ, 0.5], [MUZ + 0.07, 0.535], [MUZ + 0.22, 0.535], [MUZ + 0.3, 0.5], [-2.4, 0.49], [-2.0, 0.53], [-1.6, 0.6], [-1.56, 0.74], [1.45, 0.74], [1.5, 0.82], [BRE - 0.05, 0.82], [BRE, 0.74], [BRE, 0.3], [BRE - 0.005, 0.0]];
    PR.add('iron', zLathe(prof, 36), { tint: 0x838a80 });
    // the jacket's hoop joints
    for (const z of [-1.56, -0.7, 0.1, 0.9, 1.45]) PR.add('iron', zTube(z - 0.045, z + 0.045, 0.756, 0.756, 36), { tint: 0x8a8f86 });
    for (const z of [MUZ + 0.3, -2.0]) PR.add('iron', zTube(z - 0.03, z + 0.03, 0.55, 0.55, 28), { tint: 0x8a8f86 });
    PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.2, 0.21, 0.21, 18)); // the bore, black
    // the clip round the barrel with the arms to the piston rods
    PR.add('camo', zTube(-2.46, -2.3, 0.6, 0.6, 26));
    PR.add('steel', zTube(-2.48, -2.46, 0.62, 0.62, 26));
    for (const [x, y] of [[-0.62, 1.08], [0.62, 1.08], [-0.55, -1.05], [0.55, -1.05]]) {
      PR.add('camo', rod(V(x * 0.3, Math.sign(y) * 0.58, -2.38), V(x, y, -2.38), 0.07, 8));
      PR.add('camo', rbox(0.22, 0.22, 0.22, 0.04, x, y, -2.38));
      PR.add('steel', zTube(-2.38, -1.45, 0.05, 0.05, 10, x, y)); // piston rod, slides into the gland
    }
    // breech ring details: wedge keys, the data plate on the left
    PR.add('brass', box(0.012, 0.28, 0.4, -0.76, 0.0, 0.7));
    // the thread of the breech screw: interrupted rings you see when the carrier is open
    PR.add('steel', zTube(BRE - 0.01, BRE + 0.015, 0.56, 0.56, 36), { tint: 0xb0b0a8 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      PR.add('steel', box(0.1, 0.14, 0.06, Math.cos(a) * 0.42, Math.sin(a) * 0.42, BRE + 0.02, 0, 0, a + Math.PI / 2));
    }
    PR.add('dark', zTube(BRE + 0.01, BRE + 0.03, 0.2, 0.2, 20)); // the chamber mouth
    // the vent / tube-lock housing on the top of the breech ring
    PR.add('steel', rbox(0.2, 0.24, 0.36, 0.04, 0, 0.88, BRE - 0.28));
    PR.add('brass', yTube(0.88, 1.08, 0.04, 0.05, 8, 0, BRE - 0.28));
    // lugs where the carrier hinges
    PR.add('camo', rbox(0.22, 1.0, 0.34, 0.04, HX + 0.06, 0, BRE - 0.12));
  }

  // ------------------------------------------------------------------ breech carrier (hinge group; origin at the hinge pin)
  {
    PB.add('steel', yTube(-0.5, 0.5, 0.075, 0.075, 12, 0, 0.12));
    PB.add('camo', rbox(0.95, 0.55, 0.3, 0.05, -0.45, 0, 0.15));
    PB.add('camo', zTube(0.0, 0.3, 0.64, 0.64, 34, -HX, 0));
    PB.add('steel', zTube(0.3, 0.34, 0.2, 0.2, 20, -HX, 0));
    PB.add('steel', zTube(0.34, 0.45, 0.08, 0.08, 10, -HX, 0));
    // the operating lever through the back of the carrier
    PB.add('iron', xTube(-HX - 0.35, -HX + 0.35, 0.03, 0.03, 8, 0.0, 0.5));
    for (const s of [-1, 1]) PB.add('iron', sphere(0.05, -HX + s * 0.35, 0.0, 0.5, 1, 1, 1, 8));
    // bolt heads round the back face, the firing-gear box at the top
    const pts = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(V(-HX + Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0.3)); }
    PB.add('dark', rivets(pts, V(0, 0, 1), 0.03));
    PB.add('steel', rbox(0.18, 0.22, 0.2, 0.03, -HX, 0.46, 0.38));
    PB.add('steel', rbox(0.16, 0.18, 0.24, 0.03, 0.0, 0.0, 0.34));
    PB.add('brass', zTube(0.3, 0.46, 0.03, 0.03, 8, -HX + 0.3, 0.3));
  }

  // ------------------------------------------------------------------ the loading tray (hinged behind the breech)
  {
    const L0 = 0.1, L1 = 3.7; // from the hinge, along z (the tray frame's origin is at the hinge, 0.2 below the axis)
    PTR.add('camo', box(1.2, 0.06, L1 - L0, 0, 0, (L0 + L1) / 2));
    for (const s of [-1, 1]) {
      PTR.add('camo', box(0.07, 0.24, L1 - L0, s * 0.6, 0.13, (L0 + L1) / 2));
      PTR.add('dark', rivetRow(V(s * 0.6 + s * 0.04, 0.16, L0 + 0.1), V(s * 0.6 + s * 0.04, 0.16, L1 - 0.1), 0.2, V(s, 0, 0), 0.022));
      PTR.add('camo', ibeamZ(L0, L1, 0.22, 0.12, 0.025, s * 0.4, -0.14));
      // hinge lugs and the chain back to the cradle
      PTR.add('camo', box(0.12, 0.16, 0.2, s * 0.6, 0.0, 0.05));
      PTR.add('chain', chain(V(s * 0.6, 0.15, L1 - 0.2), V(s * 0.82, 1.0, 0.3), 0.2, 0.07));
    }
    for (const z of [0.9, 1.9, 2.9, 3.6]) PTR.add('camo', box(1.3, 0.08, 0.1, 0, -0.1, z));
    // the shell cradle blocks on the tray and the rammer guide at the far end
    for (const z of [1.3, 2.6]) {
      PTR.add('timber', box(0.9, 0.06, 0.25, 0, 0.06, z));
      PTR.add('timber', box(0.3, 0.12, 0.25, -0.2, 0.09, z, 0, 0, 0.5));
      PTR.add('timber', box(0.3, 0.12, 0.25, 0.2, 0.09, z, 0, 0, -0.5));
    }
    PTR.add('camo', box(0.9, 0.35, 0.08, 0, 0.17, L1));
    // props: two timber legs resting on the platform rear, chained
    PTR.add('timber', box(0.14, 1.6, 0.14, 0.5, -0.8, 3.5, 0.3));
    PTR.add('timber', box(0.14, 1.6, 0.14, -0.5, -0.8, 3.5, 0.3));
  }

  // ------------------------------------------------------------------ the shell crane
  {
    PC.add('camo', box(1.7, 0.14, 1.7, 0, 0.07, 0));
    PC.add('dark', rivetRow(V(-0.75, 0.15, -0.75), V(0.75, 0.15, -0.75), 0.25, V(0, 1, 0), 0.03));
    PC.add('dark', rivetRow(V(-0.75, 0.15, 0.75), V(0.75, 0.15, 0.75), 0.25, V(0, 1, 0), 0.03));
    PC.add('timber', box(2.0, 0.1, 2.0, 0, -0.05, 0)); // sleepers it stands on
    const H = 5.0;
    for (const z of [-0.5, 0.5]) PC.add('camo', ibeamY(0.14, H, 0.2, 0.26, 0.03, 0, z));
    // X bracing, three bays, and horizontals
    const ys = [0.14, 1.7, 3.3, H];
    for (let i = 0; i < 3; i++) {
      PC.add('camo', rod(V(0, ys[i], -0.5), V(0, ys[i + 1], 0.5), 0.035, 6));
      PC.add('camo', rod(V(0, ys[i], 0.5), V(0, ys[i + 1], -0.5), 0.035, 6));
      PC.add('camo', box(0.1, 0.1, 1.0, 0, ys[i + 1] - 0.05, 0));
    }
    // the jib: a long I-beam on the top, a counterweight at the tail, the sheave at the head
    PC.add('camo', ibeamX(-JIB_R - 0.6, 1.5, 0.4, 0.26, 0.035, H + 0.2, 0));
    PC.add('camo', box(0.5, 0.2, 0.7, 0, H + 0.05, 0));
    PC.add('rust', box(0.7, 0.55, 0.8, 1.2, H + 0.15, 0));
    for (const z of [-0.15, 0.15]) PC.add('camo', box(0.03, 0.32, 0.5, -JIB_R, H - 0.0, z * 1.4));
    // the head: pulley wheel
    PC.add('iron', zTube(-0.06, 0.06, 0.2, 0.2, 16, -JIB_R, H - 0.02));
    PC.add('steel', zTube(-0.2, 0.2, 0.025, 0.025, 8, -JIB_R, H - 0.02));
    // hand winch on the post, with its chain wheel and crank
    PC.add('camo', rbox(0.5, 0.45, 0.3, 0.04, 0.0, 1.6, -0.75));
    PC.add('iron', handwheel(0.3, 5, 0.02, 0.05).rotateY(Math.PI / 2).translate(0, 1.6, -0.95));
    PC.add('steel', zTube(-0.95, -0.45, 0.04, 0.04, 8, 0, 1.6));
    PC.add('chain', chain(V(-0.1, 1.9, -0.95), V(-0.1, 0.5, -0.95), 0.05, 0.06));
    // guy chains to ground pegs
    PC.add('chain', chain(V(-JIB_R + 0.2, H + 0.1, 0), V(-JIB_R * 0.8, 0.25, 1.9), 0.25, 0.07));
    PC.add('chain', chain(V(1.4, H + 0.1, 0), V(1.8, 0.25, -1.9), 0.25, 0.07));
    // the hook block and the sling for the shell, on the hoist group
    PH2.add('dark', rbox(0.22, 0.34, 0.16, 0.03, 0, 0.0, 0));
    PH2.add('steel', new THREE.TorusGeometry(0.1, 0.03, 6, 14, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.27, 0));
    PH2.add('steel', rbox(0.05, 0.3, 0.05, 0.01, 0, 0.17, 0));
    PH2.add('chain', chain(V(0, -0.35, 0), V(0, -0.95, -0.45), 0.02, 0.06));
    PH2.add('chain', chain(V(0, -0.35, 0), V(0, -0.95, 0.45), 0.02, 0.06));
    PH2.add('steel', zTube(-0.5, 0.5, 0.012, 0.012, 6, 0, -0.97));
  }

  // ------------------------------------------------------------------ ready ammunition and the stack by the crane
  {
    const s = shellGeometry(SHELL.len, SHELL.rad);
    const place = (x, y, z) => {
      for (const [g, k] of [[s.body, 'shell'], [s.band, 'brass'], [s.fuze, 'steel']]) PL.add(k, g.clone().translate(x, y, z));
    };
    const SX = CX + JIB_R * 2, SZ = CZ;
    for (const x of [-0.22, 0.22]) place(SX + x, 0.36, SZ + 0.0);
    place(SX, 0.7, SZ);
    for (const z of [-0.5, 0.5]) PL.add('timber', box(1.4, 0.18, 0.2, SX, 0.09, SZ + z * 1.3));
    for (const dz of [-1.0, 1.0]) PL.add('timber', box(0.2, 0.07, 0.2, SX, 0.15, SZ + dz));
    rig.anchors.shellStack = new THREE.Object3D();
    rig.anchors.shellStack.position.set(SX, 0.5, SZ);
    root.add(rig.anchors.shellStack);
  }

  // build every Parts set into its frame
  PL.build(root, { dirt: 0.3, y0: 0 });
  PT.build(trav, { dirt: 0.35, y0: PH });
  PE.build(elev, { dirt: 0.1, y0: PH + TY });
  PR.build(rec, { dirt: 0.05, y0: PH + TY });
  PB.build(brc, { dirt: 0.05, y0: PH + TY });
  PTR.build(tray, { dirt: 0.1, y0: PH + TY });
  PC.build(crane, { dirt: 0.3, y0: 0 });
  PH2.build(hoist, { dirt: 0.0, y0: HOIST_TOP });

  // the hoist chain: a unit-length strand scaled to reach from the jib head down to the hook block
  const strand = new THREE.Mesh(chain(V(0, 0, -0.06), V(0, -1, -0.06), 0, 0.08), rig.mats.chain);
  const strand2 = new THREE.Mesh(chain(V(0, 0, 0.06), V(0, -1, 0.06), 0, 0.08), rig.mats.chain);
  const chainGrp = new THREE.Group();
  chainGrp.position.set(-JIB_R, 4.8, 0);
  chainGrp.add(strand, strand2);
  crane.add(chainGrp);

  // props: the shell shown by setShell on the crane, on the tray and (unused here) the trolley
  addShellProp(rig, 'crane', hoist, SHELL.len, SHELL.rad, 0, -1.18, 0);
  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.2 + 0.0, 2.0);
  rig.props.tray.position.set(0, 0.2, 1.7);

  // anchors
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, tray, 'tray', 0, 0.2, 1.7);
  anchor(rig, trav, 'eye', 0, TY + 0.4, 0.2);

  // the chain and the tray follow the pose; the render layer calls update() every frame
  rig.update = () => {
    const h = HOIST_TOP - hoist.position.y; // metres the hook hangs below its raised position
    strand.scale.y = strand2.scale.y = 0.28 + h; // from the sheave at y = 4.8 down to the block's rod end
    const el = elev.rotation.x;
    tray.rotation.x = -Math.max(0, el - rig.loadEl);
  };
  rig.hoistRange = { up: HOIST_TOP, down: HOIST_LOW };
  rig.update();

  // hit boxes: platform and carriage, the barrel, the crane
  hb(rig, -2.5, 0, -4.0, 2.5, 4.4, 4.5);
  hb(rig, -1.6, 2.0, -3.9, 1.6, 4.4, 4.2);
  hb(rig, CX - 1.0, 0, CZ - 1.0, CX + 1.0, 5.6, CZ + 1.0);

  // crew: positions in root space. y is where the feet stand; heading is rotation.y (0 faces the muzzle).
  const face = { E: -Math.PI / 2, W: Math.PI / 2, N: 0, S: Math.PI }; // the compass of the model: E is +X
  crewSpot(rig, 'sergeant', -2.4, PH, -0.8, face.E, 'point');
  crewSpot(rig, 'layer', -2.05, PH, 1.45, face.E, 'lay');
  crewSpot(rig, 'traverser', 2.0, PH, 2.4, face.W, 'operate');
  crewSpot(rig, 'lanyard', 1.8, PH + 1.5, 0.9, face.N, 'lanyard');
  crewSpot(rig, 'loader1', -0.95, PH + 0.1, 3.4, face.E, 'carry');
  crewSpot(rig, 'loader2', 0.95, PH + 0.1, 3.4, face.W, 'carry');
  crewSpot(rig, 'rammer1', -0.55, PH, 5.0, face.N, 'ram');
  crewSpot(rig, 'rammer2', 0.55, PH, 5.0, face.N, 'ram');
  crewSpot(rig, 'rammer3', -0.55, PH, 5.9, face.N, 'ram');
  crewSpot(rig, 'rammer4', 0.55, PH, 5.9, face.N, 'ram');
  crewSpot(rig, 'crane1', CX + 0.85, 0, CZ - 0.9, face.W, 'operate');
  crewSpot(rig, 'crane2', CX - 1.5, 0, CZ + 1.2, face.W, 'signal');
  crewSpot(rig, 'ammo1', CX + JIB_R * 2 - 1.2, 0, CZ + 1.6, face.N, 'stand');
  crewSpot(rig, 'ammo2', CX + JIB_R * 2 + 1.2, 0, CZ + 1.4, face.N, 'crouch');

  return finishGun(rig);
}

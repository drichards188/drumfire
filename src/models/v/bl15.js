import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, frontProfile, topProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, shellGeometry, ibeamX, ibeamZ, ibeamY, mergeAll, Parts, DEG } from '../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun } from '../rig.js';
import { pivotAt, hb, trayMount, floorFade } from '../rig.js';
import { mulberry32 } from '../../noise.js';

// BL 15-inch howitzer (Coventry Ordnance Works, 1915), "Granny". From refs/bl15in: the 1,400 lb shell,
// a barrel about 5.3 m long and 1.4 m across at the breech ring, about half of it tapering out ahead of a
// short rounded cradle sleeve with its hydraulic buffers and recuperators along the top and under it,
// between two riveted steel cheeks; a huge earth box (some 20 t of earth) in front, an elevating arc and a
// big handwheel on the left, a traversing wheel on the right, a loading tray hinged behind the breech, and
// a king-post shell crane with a chain hoist beside the platform. The whole stands on a steel bed about
// 20 ft wide, bolted up from riveted plate sections on a timber grillage. Arcade values, not a drawing.
//
// Frames: root has the ground at y = 0 and the platform top at PH. `traverse` sits on the platform
// (children use y from the platform top), `elevation` at the trunnions (z = 0 is the trunnion axis, the
// barrel runs z -3.5 to +1.8, so -Z is the muzzle), `recoil` carries the barrel, `breech` the swinging
// block carrier hinged on the right (setBreech(1) swings it 1.65 rad). `tray` hinges at the breech and
// keeps the loading tilt when the gun is elevated above loadEl (update() does that).
// `crane` is the jib (rotation.y 0 over the tray, PI over the shell stack), `hoist` the hook block
// (position.y is the block's height in the crane frame: rig.hoistRange.up raised, .down at the stack); the chain follows in update().

const PH = 0.55; // platform top
const TY = 2.5; // trunnion height above the platform top
const MUZ = -3.5, BRE = 1.8; // barrel ends, on the elevation frame's z
const HX = 0.98; // breech hinge x
const CX = 2.6, CZ = 7.0; // crane post: behind the platform, beyond the sweep of the tray at full traverse
const JIB_R = 4.4; // from the post to the hook
const SHELL = { len: 1.52, rad: 0.19 };
const TUBES = [[-0.55, 1.08, 0.15], [0.55, 1.08, 0.15], [-0.55, -1.05, 0.12], [0.55, -1.05, 0.12]]; // buffer and recuperator cylinders [x, y, r] on the cradle
const HOIST_TOP = 4.2, HOIST_LOW = 1.15; // hook block height in the crane frame

// the cheek outline as [z, y] from the platform top: front slope, the hump over the trunnion, a low rear
function cheekOutline() {
  return [[-2.4, 0], [-2.4, 1.1], [-1.5, 1.75], [-1.0, TY + 0.45], [-0.6, TY + 0.58], [0.6, TY + 0.58], [1.0, TY + 0.45], [1.4, 1.5], [1.9, 0.8], [3.0, 0.8], [3.0, 0]]; // the rear cut low: the opened block and the tray slide pass over it
}
// a rounded rectangle [x, y] (w by h, corner radius r) for frontProfile: the cradle sleeve and its bands
function rrect(w, h, r, n = 5) {
  const pts = [], cx = w / 2 - r, cy = h / 2 - r;
  for (const [qx, qy, a0] of [[cx, cy, 0], [-cx, cy, Math.PI / 2], [-cx, -cy, Math.PI], [cx, -cy, Math.PI * 1.5]]) {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([qx + Math.cos(a) * r, qy + Math.sin(a) * r]); }
  }
  return pts;
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
  const crane = pivotAt(rig, root, 'crane', CX, 0, CZ);
  const hoist = pivotAt(rig, crane, 'hoist', -JIB_R, HOIST_TOP, 0);
  rig.recoilLength = 0.8;
  rig.loadEl = 0.3;
  rig.breechOpen = { axis: 'y', angle: 1.65 };
  const tray = trayMount(rig, trav, elev, -0.26, BRE + 0.14, 0.26, 1.64, 2.4);
  floorFade(rig, TY, BRE + 0.48, 0.64, 0.46);

  // ------------------------------------------------------------------ the ground platform (root)
  {
    // a thin timber grillage of baulks across x, their ends showing past the steel
    for (let i = 0; i < 31; i++) {
      const z = -4.65 + i * 0.31, l = 6.5 + (rnd() - 0.5) * 0.16;
      PL.add('timber', box(l, 0.2, 0.29, (rnd() - 0.5) * 0.08, 0.1, z, 0, (rnd() - 0.5) * 0.01));
    }
    // the steel bed: 6.1 m by 9.6 m of girder-backed plate sections (two across, four along), a deep riveted
    // side girder all round, butt straps and rivet lines over the joints
    const BW = 6.1, BL = 9.6, B0 = 0.2, BT = PH - B0;
    PL.add('camo', box(BW, BT, BL, 0, B0 + BT / 2, 0), { tint: 0xc4c4bc });
    for (const s of [-1, 1]) {
      PL.add('camo', box(0.06, BT + 0.02, BL + 0.06, s * (BW / 2 + 0.03), B0 + BT / 2, 0), { tint: 0xb4b4ac });
      PL.add('dark', rivetRow(V(s * (BW / 2 + 0.07), B0 + 0.08, -BL / 2 + 0.1), V(s * (BW / 2 + 0.07), B0 + 0.08, BL / 2 - 0.1), 0.3, V(s, 0, 0), 0.03));
      PL.add('dark', rivetRow(V(s * (BW / 2 + 0.07), PH - 0.08, -BL / 2 + 0.1), V(s * (BW / 2 + 0.07), PH - 0.08, BL / 2 - 0.1), 0.3, V(s, 0, 0), 0.03));
      PL.add('camo', box(BW + 0.06, BT + 0.02, 0.06, 0, B0 + BT / 2, s * (BL / 2 + 0.03)), { tint: 0xb4b4ac });
    }
    PL.add('camo', box(0.16, 0.025, BL, 0, PH + 0.012, 0), { tint: 0xb4b4ac });
    PL.add('dark', rivetRow(V(-0.05, PH + 0.03, -BL / 2 + 0.1), V(-0.05, PH + 0.03, BL / 2 - 0.1), 0.3, V(0, 1, 0), 0.028));
    PL.add('dark', rivetRow(V(0.05, PH + 0.03, -BL / 2 + 0.1), V(0.05, PH + 0.03, BL / 2 - 0.1), 0.3, V(0, 1, 0), 0.028));
    for (const z of [-2.4, 0, 2.4]) {
      PL.add('camo', box(BW, 0.025, 0.16, 0, PH + 0.012, z), { tint: 0xb4b4ac });
      for (const dz of [-0.05, 0.05]) PL.add('dark', rivetRow(V(-BW / 2 + 0.1, PH + 0.03, z + dz), V(BW / 2 - 0.1, PH + 0.03, z + dz), 0.3, V(0, 1, 0), 0.028));
    }
    // plank ramp at the rear down to the ground, and the earth banked against the sides
    PL.add('timber', box(2.4, 0.09, 1.9, 0, 0.27, 5.55, 0.3));
    for (let i = 0; i < 6; i++) PL.add('timber', box(0.3, 0.05, 1.9, -1.05 + i * 0.42, 0.31, 5.55, 0.3), { tint: 0xe6dccb });
    for (const s of [-1, 1]) {
      // low and sunk into the ground, so in a side view they read as banked earth, not cushions
      for (const [z, w, l, h] of [[-3.0, 1.1, 2.8, 0.16], [0.4, 0.9, 3.0, 0.14], [3.4, 1.0, 2.5, 0.13]]) {
        PL.add('soil', sphere(1, s * (3.2 + w * 0.2), -0.02, z, w * 0.55, h, l * 0.5, 9));
        for (let k = 0; k < 4; k++) PL.add('soil', sphere(0.35, s * (3.15 + rnd() * w * 0.5), 0.0, z + (rnd() - 0.5) * l, 1.0, 0.35, 1.1, 6));
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
      // the vertical stiffeners (angle irons) on the outer face; the two by the trunnion stand clear of its boss
      for (const z of [-2.2, -1.7, -1.2, -0.56, 0.56, 1.5, 2.2, 2.8]) {
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
    PT.add('camo', box(2.4, 0.4, 0.34, 0, 0.2, 2.85));
    PT.add('dark', rivetRow(V(-1.1, 0.3, 3.03), V(1.1, 0.3, 3.03), 0.2, V(0, 0, 1), 0.026));
    // front: tie plates from the cheek noses to the earth box
    for (const s of [-1, 1]) PT.add('camo', box(0.1, 0.3, 0.4, s * 1.25, 1.0, -2.5));

    // the earth box in front: a riveted steel tank, panelled, edged with angles, and filled with earth
    const EB = { w: 4.0, h: 1.6, z0: -4.6, z1: -2.5 }; // about 13 m3; low enough for the clip arms to pass over it at 15 deg
    const ez = (EB.z0 + EB.z1) / 2, ed = EB.z1 - EB.z0;
    PT.add('camo', rbox(EB.w, EB.h, ed, 0.03, 0, EB.h / 2 + 0.02, ez));
    for (const s of [-1, 1]) {
      for (const zc of [EB.z0, EB.z1]) PT.add('camo', box(0.12, EB.h + 0.06, 0.12, s * (EB.w / 2 - 0.02), EB.h / 2, zc));
      PT.add('camo', box(0.1, 0.12, ed + 0.1, s * (EB.w / 2 - 0.02), EB.h + 0.02, ez));
    }
    PT.add('camo', box(EB.w, 0.12, 0.12, 0, EB.h + 0.02, EB.z0 - 0.01));
    PT.add('camo', box(EB.w, 0.12, 0.12, 0, EB.h + 0.02, EB.z1 + 0.01));
    // panel seams and rivet rows on the front and the two sides
    const seams = [EB.h / 3, (EB.h * 2) / 3], rows = [0.2, EB.h / 3, (EB.h * 2) / 3, EB.h - 0.1];
    for (const [nrm, x, z] of [[V(0, 0, -1), 0, EB.z0 - 0.03]]) {
      for (const yy of seams) PT.add('camo', box(EB.w - 0.2, 0.09, 0.05, x, yy, z));
      for (const xx of [-1.5, -0.75, 0, 0.75, 1.5]) PT.add('camo', box(0.09, EB.h - 0.15, 0.05, xx, EB.h / 2, z));
      for (const yy of rows) PT.add('dark', rivetRow(V(-EB.w / 2 + 0.15, yy, z - 0.02), V(EB.w / 2 - 0.15, yy, z - 0.02), 0.2, nrm, 0.03));
    }
    for (const s of [-1, 1]) {
      const x = s * (EB.w / 2 + 0.01);
      for (const k of [0.25, 0.5, 0.75]) PT.add('camo', box(0.05, EB.h - 0.15, 0.09, x, EB.h / 2, EB.z0 + ed * k));
      for (const yy of seams) PT.add('camo', box(0.05, 0.09, ed - 0.2, x, yy, ez));
      for (const yy of rows) PT.add('dark', rivetRow(V(x + s * 0.03, yy, EB.z0 + 0.1), V(x + s * 0.03, yy, EB.z1 - 0.1), 0.2, V(s, 0, 0), 0.03));
      PT.add('chain', new THREE.TorusGeometry(0.15, 0.03, 6, 12).rotateY(Math.PI / 2).translate(s * (EB.w / 2 + 0.06), EB.h - 0.3, ez));
    }
    // the earth: a lumpy heap standing proud of the open top, with stones
    PT.add('soil', box(EB.w - 0.25, 0.18, ed - 0.25, 0, EB.h + 0.02, ez));
    for (let i = 0; i < 14; i++) {
      const x = (rnd() - 0.5) * (EB.w - 0.7), z = EB.z0 + 0.35 + rnd() * (ed - 0.7), r = 0.28 + rnd() * 0.3;
      PT.add('soil', sphere(r, x, EB.h + 0.05, z, 1.2, 0.25 + rnd() * 0.1, 1.1, 7), { tint: rnd() > 0.7 ? 0x9a8f7e : 0xffffff });
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
    PT.add('steel', xTube(-1.8, -0.95, 0.05, 0.05, 8, 0.95, 1.45)); // the pinion shaft ends outside the breech ring's sweep
    PT.add('dark', box(0.26, 0.34, 0.34, -1.52, 0.95, 1.45));
  }

  // ------------------------------------------------------------------ cradle, buffers and the elevating arc (elevation frame)
  {
    // a short sleeve with well rounded corners, so the barrel reads as a long gun through a collar, not a
    // stub in a box; banded at both ends in the paint, not bright steel (it read as a white plate head on)
    const CL = 1.25;
    PE.add('camo', frontProfile(rrect(1.6, 1.5, 0.6), -CL, CL));
    for (const z of [-CL, CL]) PE.add('camo', frontProfile(rrect(1.7, 1.6, 0.64), z - 0.06, z + 0.06), { tint: 0xd4d4cc });
    for (const s of [-1, 1]) PE.add('dark', rivetRow(V(s * 0.81, 0, -1.05), V(s * 0.81, 0, 1.05), 0.18, V(s, 0, 0), 0.028));
    // the trunnions: pins, big caps with bolts, oil caps
    PE.add('steel', xTube(-1.7, 1.7, 0.32, 0.32, 18));
    for (const s of [-1, 1]) {
      PE.add('camo', xTube(s * 0.72, s * 1.5, 0.46, 0.46, 22));
      PE.add('steel', xTube(s * 1.5, s * 1.58, 0.38, 0.38, 22));
      const pts = [];
      for (let i = 0; i < 8; i++) pts.push(V(s * 1.59, Math.sin(i * Math.PI / 4) * 0.28, Math.cos(i * Math.PI / 4) * 0.28));
      PE.add('dark', rivets(pts, V(s, 0, 0), 0.04));
      PE.add('brass', xTube(s * 1.58, s * 1.66, 0.07, 0.07, 10, 0, 0));
    }
    // the buffers and recuperators: four cylinders along the cradle with glands and rear caps; their
    // piston rods run forward to a clip on the barrel (recoil group)
    const tubes = TUBES;
    rig.nest = tubes.map(([x, y]) => [x, y]); // cylinder axes the piston rods slide into (used by the clip check)
    for (const [x, y, r] of tubes) {
      PE.add('camo', zTube(-1.55, 1.5, r, r, 16, x, y));
      PE.add('steel', zTube(-1.6, -1.45, r * 1.12, r * 1.12, 16, x, y));
      PE.add('steel', zTube(1.4, 1.5, r * 1.1, r * 1.1, 16, x, y));
      PE.add('camo', sphere(r * 1.05, x, y, 1.5, 1, 1, 0.8, 10));
      for (const z of [-0.8, 0.0, 0.8]) PE.add('steel', zTube(z - 0.04, z + 0.04, r * 1.15, r * 1.15, 14, x, y));
      // saddle brackets joining it to the cradle
      const cy = y > 0 ? 0.6 : -0.6; // into the sleeve's rounded shoulder
      for (const z of [-1.1, 0.4, 1.0]) PE.add('camo', box(0.18, Math.abs(y - cy) + r, 0.22, x, (y + cy) / 2, z));
    }
    // the elevating arc under the rear of the cradle, with its web and the teeth
    PE.add('steel', gearArc(2.0, 2.16, 26 * DEG, 78 * DEG, 0.3, 30, 0.05));
    PE.add('camo', gearArc(1.45, 2.0, 26 * DEG, 78 * DEG, 0.2));
    PE.add('camo', box(0.42, 0.3, 1.1, 0, -0.88, 0.65));
    // the sight bracket: a blade carried on the left trunnion end, outside the cheek, so it turns clear of it
    PE.add('camo', topProfile([[-1.7, 0.3], [-1.7, -0.95], [-2.1, -1.5], [-2.05, -0.4], [-1.9, 0.3]], 0.0, 0.07).translate(0, 0.68, 0));
    PE.add('camo', box(0.12, 0.6, 0.4, -1.72, 0.4, 0.0));
    PE.add('brass', yTube(0.72, 1.16, 0.07, 0.07, 12, -1.95, -0.15));
    PE.add('dark', zTube(-0.45, 0.05, 0.035, 0.03, 8, -1.95, 1.1));
    PE.add('brass', yTube(0.74, 0.76, 0.12, 0.12, 14, 0, 0.6));
    // the data plate on the cradle top
    PE.add('brass', box(0.36, 0.012, 0.3, 0, 0.756, -0.3));
  }

  // ------------------------------------------------------------------ the barrel (recoil group)
  {
    // muzzle bell, a straight chase that swells into the jacket's shoulder, the jacket, the breech ring
    const prof = [[MUZ, 0.22], [MUZ, 0.45], [MUZ + 0.07, 0.48], [MUZ + 0.22, 0.48], [MUZ + 0.3, 0.45], [-2.7, 0.45], [-2.1, 0.5], [-1.75, 0.54], [-1.7, 0.64], [1.45, 0.64], [1.5, 0.72], [BRE - 0.05, 0.72], [BRE, 0.64], [BRE, 0.3], [BRE - 0.005, 0.0]];
    PR.add('iron', zLathe(prof, 36), { tint: 0x838a80 });
    // the jacket's hoop joints
    for (const z of [-1.7, -0.7, 0.1, 0.9, 1.45]) PR.add('iron', zTube(z - 0.045, z + 0.045, 0.66, 0.66, 36), { tint: 0x8a8f86 });
    for (const [z, r] of [[-2.5, 0.48], [-2.1, 0.525]]) PR.add('iron', zTube(z - 0.03, z + 0.03, r, r, 28), { tint: 0x8a8f86 });
    PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.2, 0.21, 0.21, 18)); // the bore, black
    // the clip round the chase behind the muzzle bell, with the arms to the piston rods; it stays ahead of
    // the cylinder glands by more than the stroke
    const KZ = -3.03;
    PR.add('camo', zTube(KZ - 0.075, KZ + 0.075, 0.52, 0.52, 26));
    PR.add('steel', zTube(KZ - 0.095, KZ - 0.075, 0.54, 0.54, 26));
    for (const [x, y] of TUBES) {
      PR.add('camo', rod(V(x * 0.3, Math.sign(y) * 0.48, KZ), V(x, y, KZ), 0.07, 8));
      PR.add('camo', rbox(0.22, 0.22, 0.22, 0.04, x, y, KZ));
      PR.add('steel', zTube(KZ, -1.45, 0.05, 0.05, 10, x, y)); // piston rod, slides into the gland
    }
    // breech ring details: the data plate on the left of the ring
    PR.add('brass', box(0.012, 0.2, 0.2, -0.725, 0.0, 1.65));
    // the thread of the breech screw: interrupted rings you see when the carrier is open
    PR.add('steel', zTube(BRE - 0.01, BRE + 0.015, 0.56, 0.56, 36), { tint: 0xb0b0a8 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      PR.add('steel', box(0.1, 0.14, 0.06, Math.cos(a) * 0.42, Math.sin(a) * 0.42, BRE + 0.02, 0, 0, a + Math.PI / 2));
    }
    PR.add('dark', zTube(BRE + 0.01, BRE + 0.03, 0.2, 0.2, 20)); // the chamber mouth
    // the vent / tube-lock housing on the top of the breech ring
    PR.add('steel', rbox(0.2, 0.24, 0.36, 0.04, 0, 0.78, BRE - 0.28));
    PR.add('brass', yTube(0.78, 0.98, 0.04, 0.05, 8, 0, BRE - 0.28));
    // lugs where the carrier hinges: out from the ring to the pin, ends short of the swinging block
    PR.add('camo', rbox(0.4, 1.0, 0.26, 0.04, HX - 0.1, 0, BRE - 0.2));
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
      PTR.add('camo', box(0.07, 0.06, L1 - L0, s * 0.6, 0.04, (L0 + L1) / 2)); // low curbs: the round is swung in over them
      PTR.add('dark', rivetRow(V(s * 0.6 + s * 0.04, 0.04, L0 + 0.1), V(s * 0.6 + s * 0.04, 0.04, L1 - 0.1), 0.2, V(s, 0, 0), 0.022));
      PTR.add('camo', ibeamZ(L0, L1, 0.22, 0.12, 0.025, s * 0.4, -0.14));
      // hinge lugs and the chain back to the cradle
      PTR.add('camo', box(0.12, 0.16, 0.2, s * 0.6, 0.0, 0.05));
      PTR.add('chain', chain(V(s * 0.6, 0.15, L1 - 0.2), V(s * 0.82, 1.0, 0.3), 0.2, 0.07));
    }
    for (const z of [0.9, 1.9, 2.9, 3.6]) PTR.add('camo', box(1.2, 0.08, 0.1, 0, -0.1, z));
    // the rammer guide at the far end (the shell lies on the plate, no chocks to clip it)
    for (const s of [-1, 1]) PTR.add('camo', box(0.1, 0.35, 0.08, s * 0.42, 0.17, L1)); // the rammer guide, open in the middle for the staff
    PTR.add('camo', box(0.94, 0.07, 0.08, 0, 0.5, L1));
    // (no props: the tray hangs on its loading arm and slides clear on the cross rail)
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
    PC.add('camo', box(0.6, 0.45, 0.6, 1.2, H + 0.12, 0), { tint: 0x9a9a92 }); // the counterweight, painted like the rest
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
    const SX = CX + JIB_R, SZ = CZ; // where the hook picks up (jib turned to PI)
    // the pile stands to one side: the hook comes down at the pick point on the sleepers
    for (const x of [-0.22, 0.22]) place(SX + x, 0.36, SZ + 1.8);
    place(SX, 0.7, SZ + 1.8);
    for (const z of [-0.5, 0.5]) PL.add('timber', box(1.4, 0.18, 0.2, SX, 0.09, SZ + 1.8 + z * 1.3));
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
  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.26, 1.64);

  // anchors
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, trav, 'eye', 0, TY + 0.4, 0.2);

  // the chain and the tray follow the pose; the render layer calls update() every frame
  rig.update = () => {
    const h = HOIST_TOP - hoist.position.y; // metres the hook hangs below its raised position
    strand.scale.y = strand2.scale.y = 0.28 + h; // from the sheave at y = 4.8 down to the block's rod end
    rig.trayTilt();
  };
  rig.hoistRange = { up: HOIST_TOP, down: HOIST_LOW };
  rig.update();

  // hit boxes: platform and carriage, the barrel, the crane
  hb(rig, -3.05, 0, -4.8, 3.05, 4.4, 4.8);
  hb(rig, -1.6, 2.0, -4.2, 1.6, 4.4, 4.2);
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
  crewSpot(rig, 'ammo1', CX + JIB_R - 1.2, 0, CZ + 1.6, face.N, 'stand');
  crewSpot(rig, 'ammo2', CX + JIB_R + 1.2, 0, CZ + 1.4, face.N, 'crouch');

  return finishGun(rig);
}

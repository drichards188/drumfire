import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, rivetRow, rivets, handwheel, gearArc, zLathe, Parts, vehicleMats, shellGeometry, DEG } from '../../kit.js';
import { mulberry32 } from '../../../noise.js';
import { clamp01 } from './heavy_common.js';

// The 42 cm Gamma-Mörser (Krupp, "Gamma-Gerät"), the fixed siege howitzer of 1911, as a gun rig for the main
// game's render layer (DESIGN.md "Models", refs/gamma). Not a carriage on wheels like the M-Gerät (v/de/bertha.js)
// but a mounting built up on its firing bed: a riveted steel Bettung laid in a pit (2.25 m deep, filled with
// timber and earth, the bed's top a little over the ground), the lower carriage (a tall riveted box on a roller
// race, 2 m high, with a walkway deck round its top) turning on it through 23 degrees each way, the top
// carriage's high cheeks holding the cradle and its trunnions, the long L/16 barrel (6.72 m) in a box cradle with
// the big recuperator cylinder on top, a horizontal sliding wedge, and the sloped shell lift at the rear left (the
// "Geschossaufzug": a car that a hand winch hauls up an inclined track from the ammunition trolley on the ground to
// breech height). About 150 t in action, 13.5 m long, 4.25 m high (real); this one is 12.6 m from the muzzle at
// zero elevation to the trolley's track and 4.45 m to the top of the recuperator. Silhouette, proportions and the
// distinctive parts from the 1914 photograph (refs/gamma); the rest is [E] estimate, game dimensions where the
// crew stations need them.
//
// Frames (DESIGN.md "Models"): root y = 0 the ground, -Z the front at zero traverse. `traverse` turns the lower
// carriage about the bed's centre pivot (the origin); `elevation` sits on the trunnions (TRY over the ground, TRZ
// ahead of the pivot), `recoil` slides the barrel back along +Z (1.2 m), `breech` slides the wedge out to the right
// (+X, 1.05 m at setBreech(1)). `tray` is the loading trough's carriage on rails on the deck: setTray(0) forward
// against the breech for loading, setTray(1) run back TRAY_BACK m for the shot (render/guns.js loadPose). `lift` is
// the shell lift's car: setLift(k) runs it from the foot of the incline (0) to the top (1), where the shell it
// carries lies level beside the tray at the same height, to be rolled across onto it. The gun loads at zero
// elevation (rig.loadEl 0) and fires from 43 to 75 degrees (the rig is clear from 0 to 78 at full recoil).
// Painted in the 1917 Buntfarbenanstrich (as the WW1 mode's Bertha).
//
// Anchors: eye, muzzle (+ muzzles), breech (the breech face), tray (the shell's middle on the trough at loading),
// shellStack (the next shell's middle on the ammunition trolley at the foot of the lift), lift (the shell's middle
// on the car, on the car), crew spots for render/ww1/gamma.js. buildGammaSite(seed) is the position round it.

export const D = 2.25; // deck top over the ground
const BEDY = 0.3; // the steel bed's top
export const TRY = 3.45, TRZ = -0.6; // trunnion axis: height over the ground, z (ahead of the pivot)
const MUZ = -5.12, BRE = 1.6; // barrel ends along the bore from the trunnions (L/16: 6.72 m)
const REC = 1.2; // recoil stroke
export const TRAY_Z = 2.17; // the shell's middle on the tray at loading (its nose 0.22 m behind the breech face)
export const TRAY_BACK = 0.45;
// the shell lift: its car's origin is the shell's middle; the path runs straight from the foot to the top
export const LIFT = { x: -1.45, foot: { y: 1.5, z: 5.03 }, top: { y: TRY, z: TRAY_Z }, H: 1.0 };
const LT = Math.atan2(LIFT.top.y - LIFT.foot.y, LIFT.foot.z - LIFT.top.z); // the incline, about 34 degrees
const TAN = Math.tan(LT);
// rail top line in the traverse frame: y at z (the car's wheels ride it, LIFT.H below the shell's axis)
const railY = (z) => LIFT.top.y - LIFT.H - (z - LIFT.top.z) * TAN;
const RAIL_Z0 = 1.35, RAIL_Z1 = LIFT.top.z + (LIFT.top.y - LIFT.H) / TAN; // rail ends (top, and where it meets the ground)
export const STACK = { x: -1.45, y: 1.5, z: 6.6 }; // the next shell's middle on the trolley
const TROLLEY_R = Math.hypot(STACK.x, STACK.z); // the ammunition trolley's arc track about the pivot
const FOOT_R = Math.hypot(LIFT.x, RAIL_Z1 + 0.12); // the incline foot's roller on its own arc rail
export const SHELL = { len: 1.9, rad: 0.21 };
const WELL = { x: 0.9, z0: -1.0, z1: 2.0 }; // the well in the lower carriage the breech goes down at high elevation
const CHEEK = { x0: 0.98, x1: 1.08 }; // the top carriage's cheeks, inner and outer faces
const BOX = { x: 1.9, z0: -3.3, z1: 3.3, cut: 1.45, y0: 0.48 }; // the lower carriage box (cut away at the rear left for the lift)
const TONGUE = { x0: -0.78, x1: 2.1, z1: 6.7 }; // the deck's rear extension the rammer team works on
const WINCH = { x0: -1.86, x1: -1.06, y: 2.66, z: 1.15, crankX: -1.97, crankY: 2.92, crankR: 0.28 };
const CRANK = { x: 0.57, y: -0.36, z: BRE + 0.07, r: 0.14 }; // the wedge's crank on the ring's rear face (recoil frame)

const ARC_SEG = 48;
// annulus about Y (r0..r1, y0..y1), optionally a sector phi0..phi0 + len (phi from +Z toward +X)
const annulus = (r0, r1, y0, y1, seg = 64, phi0 = 0, len = Math.PI * 2) =>
  new THREE.LatheGeometry([[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]].map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, len);
// a box laid along the incline at lateral x: its top face on the rail line shifted up by `top`, depth h, z0..z1
function slopeBox(w, h, z0, z1, x, top = 0) {
  const len = (z1 - z0) / Math.cos(LT), zc = (z0 + z1) / 2, yc = railY(zc) + top - (h / 2) / Math.cos(LT);
  return box(w, h, len, x, yc, zc, LT, 0, 0);
}
// a geometry turned inside out (winding and normals), for the inside of an open shell
function inside(geo) {
  const g = geo.toNonIndexed();
  for (const k of ['position', 'normal', 'uv']) {
    const at = g.attributes[k], n = at.itemSize, ar = at.array;
    for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const a = (i + 1) * n + c, b = (i + 2) * n + c, tt = ar[a]; ar[a] = ar[b]; ar[b] = tt; }
  }
  const nr = g.attributes.normal.array;
  for (let i = 0; i < nr.length; i++) nr[i] = -nr[i];
  return g;
}
// a trough (the lower part of a tube about Z): radius r, thickness t, from angle -a to a about straight down,
// with a rolled rim along both edges
function trough(z0, z1, r, t, a, y) {
  const len = z1 - z0, zc = (z0 + z1) / 2;
  // CylinderGeometry's theta 0 is +Z; turned about X by 90 degrees it points straight down
  const outer = new THREE.CylinderGeometry(r + t, r + t, len, 20, 1, true, -a, 2 * a).rotateX(Math.PI / 2);
  const inner = inside(new THREE.CylinderGeometry(r, r, len, 20, 1, true, -a, 2 * a).rotateX(Math.PI / 2));
  const g = [outer.translate(0, y, zc), inner.translate(0, y, zc)];
  for (const sg of [-1, 1]) g.push(zTube(z0, z1, t * 0.9, t * 0.9, 8, sg * Math.sin(a) * (r + t / 2), y - Math.cos(a) * (r + t / 2)));
  return g;
}
const node = (parent, name, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };

export function buildGamma() {
  // the barrel wears the carriage's paint but is its own mesh ('barrel'), which the clip check lets slide in the
  // cradle (rig.slideMats)
  const mats = { ...vehicleMats('bunt') };
  mats.barrel = mats.camo;
  const rnd = mulberry32(1911);
  const root = new THREE.Group();
  root.name = 'gamma-gun';
  const trav = new THREE.Group(); trav.name = 'traverse'; root.add(trav);
  const elev = new THREE.Group(); elev.name = 'elevation'; elev.position.set(0, TRY, TRZ); trav.add(elev);
  const rec = new THREE.Group(); rec.name = 'recoil'; elev.add(rec);
  const brk = new THREE.Group(); brk.name = 'breech'; rec.add(brk);
  const trayP = new THREE.Group(); trayP.name = 'tray'; trav.add(trayP);
  const lift = new THREE.Group(); lift.name = 'lift'; trav.add(lift);
  const mk = () => new Parts(mats);

  // ================================================================ the bed (fixed): the Bettung and the arc rails
  {
    const P = mk();
    const bx = 4.2, bz0 = -3.9, bz1 = 4.4;
    P.add('iron', box(bx * 2, 0.04, bz1 - bz0, 0, BEDY - 0.02, (bz0 + bz1) / 2), { tint: 0xb8b8b0 });
    // the box girders of the bed's edge, standing a little proud of the filled pit
    for (const s of [-1, 1]) {
      P.add('dark', box(0.3, BEDY - 0.04, bz1 - bz0, s * (bx - 0.15), (BEDY - 0.04) / 2, (bz0 + bz1) / 2));
      P.add('rust', box(0.04, 0.12, bz1 - bz0 - 0.4, s * (bx + 0.02), 0.12, (bz0 + bz1) / 2), { tint: 0x9a9080 });
      P.add('dark', box(bx * 2, BEDY - 0.04, 0.3, 0, (BEDY - 0.04) / 2, s < 0 ? bz0 + 0.15 : bz1 - 0.15));
    }
    // cross girders' rivet lines on the plate
    for (const z of [-2.6, -1.3, 0, 1.3, 2.6, 3.9]) P.add('dark', rivetRow(V(-bx + 0.2, BEDY, z), V(bx - 0.2, BEDY, z), 0.3, V(0, 1, 0), 0.025));
    for (const x of [-3.0, -1.5, 1.5, 3.0]) P.add('dark', rivetRow(V(x, BEDY, bz0 + 0.2), V(x, BEDY, bz1 - 0.2), 0.3, V(0, 1, 0), 0.025));
    // the roller race and its outer guard ring, the centre pivot
    P.add('steel', annulus(2.62, 2.78, BEDY, BEDY + 0.06, 72));
    P.add('iron', annulus(2.5, 2.9, BEDY - 0.01, BEDY + 0.015, 72));
    P.add('iron', yTube(BEDY, BEDY + 0.08, 0.55, 0.5, 24));
    // the arc rail the lift's foot rolls on, on its timber sill, and the ammunition trolley's arc track (600 mm
    // Feldbahn) behind it, both concentric with the pivot over the traverse and a little more
    const a0 = -45 * DEG, a1 = 20 * DEG;
    P.add('steel', annulus(FOOT_R - 0.035, FOOT_R + 0.035, 0.1, 0.17, ARC_SEG, a0, a1 - a0));
    P.add('timber', annulus(FOOT_R - 0.3, FOOT_R + 0.3, -0.05, 0.1, ARC_SEG, a0, a1 - a0), { tint: 0xc8c0b0 });
    for (const r of [TROLLEY_R - 0.3, TROLLEY_R + 0.3]) {
      P.add('steel', annulus(r - 0.025, r + 0.025, 0.1, 0.17, ARC_SEG, a0, a1 - a0));
      P.add('steel', annulus(r - 0.045, r + 0.045, 0.1, 0.115, ARC_SEG, a0, a1 - a0));
    }
    for (let a = a0 + 0.012; a < a1; a += 0.62 / TROLLEY_R) {
      P.add('timber', box(1.0, 0.1, 0.16, Math.sin(a) * TROLLEY_R, 0.05, Math.cos(a) * TROLLEY_R, 0, a + Math.PI / 2, 0), { tint: [0xffffff, 0xe0d8cc, 0xd0c8b8][(rnd() * 3) | 0] });
    }
    P.build(root, { dirt: 0.6 });
  }

  // ================================================================ the lower carriage (traverse)
  {
    const P = mk();
    // the roller race under the box: conical rollers between the bed's race and the ring under the box
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, x = Math.sin(a) * 2.7, z = Math.cos(a) * 2.7;
      P.add('steel', xTube(-0.11, 0.11, 0.065, 0.075, 10, 0, 0).rotateY(a + Math.PI / 2).translate(x, BEDY + 0.125, z));
    }
    P.add('iron', annulus(2.6, 2.8, BEDY + 0.19, BOX.y0 + 0.02, 72));
    // the box: four walls, cut away at the rear left for the lift's incline; the well's walls inside
    const Y0 = BOX.y0, Y1 = D - 0.13, H = Y1 - Y0, yc = (Y0 + Y1) / 2, t = 0.06;
    const wallX = (x, z0, z1, key = 'camo') => P.add(key, box(t, H, z1 - z0, x, yc, (z0 + z1) / 2));
    const wallZ = (z, x0, x1, key = 'camo') => P.add(key, box(x1 - x0, H, t, (x0 + x1) / 2, yc, z));
    wallX(BOX.x - t / 2, BOX.z0, BOX.z1); wallX(-BOX.x + t / 2, BOX.z0, BOX.cut);
    wallZ(BOX.z0 + t / 2, -BOX.x, BOX.x); wallZ(BOX.z1 - t / 2, -0.95, BOX.x);
    wallZ(BOX.cut - t / 2, -BOX.x, -0.95); wallX(-0.95 + t / 2, BOX.cut, BOX.z1);
    for (const s of [-1, 1]) P.add('dark', box(t, H, WELL.z1 - WELL.z0, s * (WELL.x + t / 2), yc, (WELL.z0 + WELL.z1) / 2));
    for (const z of [WELL.z0 - t / 2, WELL.z1 + t / 2]) P.add('dark', box(WELL.x * 2 + 2 * t, H, t, 0, yc, z));
    P.add('dark', box(WELL.x * 2, 0.04, WELL.z1 - WELL.z0, 0, BEDY + 0.02, (WELL.z0 + WELL.z1) / 2)); // the well's floor plate
    // the skirt, the belt round the box (the photo's horizontal rail), and the panels of the lower row
    // [x0, z0, x1, z1, outward]: the walls round the box, each with the side its outer face looks to
    const ring = [[BOX.x, BOX.z0, BOX.x, BOX.z1, 1], [-BOX.x, BOX.z0, -BOX.x, BOX.cut, -1], [-BOX.x, BOX.z0, BOX.x, BOX.z0, -1], [-0.95, BOX.z1, BOX.x, BOX.z1, 1], [-BOX.x, BOX.cut, -0.95, BOX.cut, 1], [-0.95, BOX.cut, -0.95, BOX.z1, -1]];
    for (const [x0, z0, x1, z1, outward] of ring) {
      const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const ox = alongX ? 0 : outward * 0.035, oz = alongX ? outward * 0.035 : 0;
      for (const [y, h, key] of [[Y0 + 0.07, 0.14, 'iron'], [1.52, 0.1, 'camo'], [Y1 - 0.06, 0.12, 'camo']]) {
        P.add(key, box(alongX ? len + 0.08 : 0.07, h, alongX ? 0.07 : len + 0.08, cx + ox, y, cz + oz));
      }
      // panels: raised plates in the lower row, rivets round them
      const n = Math.max(1, Math.round(len / 1.05)), pw = len / n;
      for (let i = 0; i < n; i++) {
        const u = (alongX ? x0 : z0) + pw * (i + 0.5);
        const px = alongX ? u : x0 + ox * 1.2, pz = alongX ? z0 + oz * 1.2 : u;
        P.add('camo', rbox(alongX ? pw - 0.16 : 0.03, 0.62, alongX ? 0.03 : pw - 0.16, 0.012, px, 1.05, pz));
        const nrm = alongX ? V(0, 0, outward) : V(outward, 0, 0);
        const e = (du, dy) => alongX ? V(px + du, 1.05 + dy, pz + outward * 0.017) : V(px + outward * 0.017, 1.05 + dy, pz + du);
        P.add('dark', rivetRow(e(-(pw - 0.24) / 2, 0.25), e((pw - 0.24) / 2, 0.25), 0.16, nrm, 0.018));
        P.add('dark', rivetRow(e(-(pw - 0.24) / 2, -0.25), e((pw - 0.24) / 2, -0.25), 0.16, nrm, 0.018));
        // stiffeners between the panels in the upper row
        if (i > 0) {
          const v = (alongX ? x0 : z0) + pw * i;
          P.add('camo', box(alongX ? 0.08 : 0.05, Y1 - 1.6, alongX ? 0.05 : 0.08, alongX ? v : x0 + ox * 1.3, (1.6 + Y1) / 2, alongX ? z0 + oz * 1.3 : v));
        }
      }
    }
    // the deck: chequer plate round the well and the lift's notch, the rear tongue on brackets
    const deck = (x0, x1, z0, z1) => {
      P.add('iron', box(x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, D - 0.05, (z0 + z1) / 2), { tint: 0x9c9c94 });
      P.add('camo', box(x1 - x0 + 0.02, 0.06, z1 - z0 + 0.02, (x0 + x1) / 2, D - 0.13, (z0 + z1) / 2));
    };
    deck(-2.1, 2.1, BOX.z0 - 0.1, WELL.z0);
    deck(-2.1, -WELL.x, WELL.z0, BOX.cut);
    deck(WELL.x, 2.1, WELL.z0, BOX.z1 + 0.1);
    deck(-WELL.x, WELL.x, WELL.z1, BOX.z1 + 0.1);
    deck(-0.95, -WELL.x, BOX.cut, BOX.z1 + 0.1);
    deck(TONGUE.x0, TONGUE.x1, BOX.z1 + 0.1, TONGUE.z1);
    // the tongue's brackets back to the box's rear wall
    for (const x of [-0.5, 0.6, 1.8]) {
      P.add('camo', rod(V(x, 1.0, BOX.z1), V(x, D - 0.15, BOX.z1 + 2.2), 0.06, 6));
      P.add('camo', box(0.08, 0.3, TONGUE.z1 - BOX.z1 - 0.2, x, D - 0.28, (TONGUE.z1 + BOX.z1) / 2));
    }
    // deck edge angles with rivets
    for (const s of [-1, 1]) P.add('dark', rivetRow(V(s * 2.07, D, BOX.z0), V(s * 2.07, D, s > 0 ? TONGUE.z1 : BOX.cut), 0.25, V(0, 1, 0), 0.02));
    // railings: posts, a top and a middle rail, toe boards; openings at the stair heads (z 0.3..1.05)
    const rail = (ax, az, bx, bz, h = 1.0) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.1));
      for (let i = 0; i <= n; i++) { const k = i / n; P.add('iron', yTube(D, D + h, 0.024, 0.022, 6, ax + (bx - ax) * k, az + (bz - az) * k)); }
      for (const y of [h, h * 0.5]) P.add('iron', rod(V(ax, D + y, az), V(bx, D + y, bz), 0.02, 6));
      const dx = bx - ax, dz = bz - az;
      P.add('camo', box(Math.abs(dx) + 0.03, 0.1, Math.abs(dz) + 0.03, (ax + bx) / 2, D + 0.05, (az + bz) / 2));
    };
    rail(-2.07, BOX.z0, -2.07, 0.3); rail(2.07, BOX.z0, 2.07, 0.3);
    rail(-2.07, 1.05, -2.07, BOX.cut - 0.1);
    rail(2.07, 1.05, 2.07, TONGUE.z1 - 0.03);
    rail(TONGUE.x0 + 0.03, TONGUE.z1 - 0.03, 2.07, TONGUE.z1 - 0.03);
    rail(TONGUE.x0 + 0.03, 4.15, TONGUE.x0 + 0.03, TONGUE.z1 - 0.03, 0.9);
    rail(-2.07, BOX.z0, -1.15, BOX.z0); rail(1.15, BOX.z0, 2.07, BOX.z0);
    // stairs on both sides, from the bed up to the walkways (the top step beside the opening in the railing)
    for (const s of [-1, 1]) {
      const zt = 0.45, zb = 2.95, x0 = s * 2.15, x1 = s * 2.78, n = 9;
      const ang = Math.atan2(D - BEDY, zb - zt), len = Math.hypot(D - BEDY, zb - zt);
      for (const x of [x0, x1]) P.add('camo', box(0.05, 0.22, len, x + s * 0.025 * (x === x0 ? 1 : -1), (D + BEDY) / 2, (zt + zb) / 2, -ang, 0, 0));
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        P.add('iron', box(Math.abs(x1 - x0) - 0.06, 0.03, 0.24, (x0 + x1) / 2, D - k * (D - BEDY) - 0.02, zt + k * (zb - zt)), { tint: 0xb0b0a8 });
      }
      for (const x of [x0, x1]) P.add('iron', rod(V(x, BEDY + 0.95, zb), V(x, D + 0.95, zt), 0.02, 6));
      for (const [x, z, y0] of [[x1, zb, BEDY], [x1, zt, D]]) P.add('iron', yTube(y0, y0 + 0.95, 0.022, 0.022, 6, x, z));
      P.add('camo', box(0.7, 0.06, 0.3, (x0 + x1) / 2, D - 0.03, zt - 0.1)); // landing plate
    }
    P.build(trav, { dirt: 0.5 });
  }

  // ================================================================ the top carriage: cheeks, trunnion bearings, gear
  {
    const P = mk();
    const prof = [[-3.25, D], [0.95, D], [0.95, 2.4], [0.35, 3.25], [-0.2, 3.95], [-1.0, 4.06], [-1.7, 3.76], [-3.25, 2.55]];
    for (const s of [-1, 1]) {
      const xc = s * (CHEEK.x0 + CHEEK.x1) / 2;
      P.add('camo', sideProfile(prof, CHEEK.x1 - CHEEK.x0).translate(xc, 0, 0));
      // flanged edge round the top (an angle on the outer face) and vertical ribs
      for (let i = 2; i < prof.length; i++) {
        const [za, ya] = prof[i], [zb, yb] = i + 1 < prof.length ? prof[i + 1] : prof[0];
        if (i === prof.length - 1) break;
        P.add('camo', rod(V(s * (CHEEK.x1 + 0.03), ya - 0.04, za), V(s * (CHEEK.x1 + 0.03), yb - 0.04, zb), 0.045, 4));
      }
      for (const [z, y1] of [[-2.6, 2.9], [-1.9, 3.6], [0.2, 3.35]]) P.add('camo', box(0.07, y1 - D, 0.1, s * (CHEEK.x1 + 0.035), (D + y1) / 2, z));
      // the trunnion bearing: a cap over the stub, bolted down
      P.add('steel', xTube(s * CHEEK.x1, s * (CHEEK.x1 + 0.16), 0.3, 0.27, 24, TRY, TRZ));
      P.add('dark', xTube(s * (CHEEK.x1 + 0.16), s * (CHEEK.x1 + 0.2), 0.16, 0.12, 16, TRY, TRZ));
      const bolts = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; bolts.push(V(s * (CHEEK.x1 + 0.16), TRY + Math.sin(a) * 0.22, TRZ + Math.cos(a) * 0.22)); }
      P.add('dark', rivets(bolts, V(s, 0, 0), 0.03, 1));
      // the pinion of the elevating gear on the cheek's inner face, under the arc
      P.add('steel', xTube(s * 0.86, s * CHEEK.x0, 0.075, 0.075, 12, TRY - 1.1, TRZ));
      P.add('dark', rivetRow(V(s * (CHEEK.x1 + 0.005), D + 0.12, -3.1), V(s * (CHEEK.x1 + 0.005), D + 0.12, 0.85), 0.2, V(s, 0, 0), 0.02));
    }
    // the front plate between the cheeks (low: the cradle passes over it at zero elevation)
    P.add('camo', box(CHEEK.x0 * 2, 0.17, 0.1, 0, D + 0.085, -3.2));
    // elevating handwheel on the right cheek (the elevation layer), line and sight on the left (the layer)
    P.add('steel', handwheel(0.34, 6, 0.024, 0.06, 1).translate(1.16, 3.18, -0.35));
    P.add('iron', xTube(CHEEK.x1, 1.16, 0.04, 0.04, 8, 3.18, -0.35));
    P.add('steel', handwheel(0.28, 5, 0.022, 0.05, 1).rotateY(Math.PI).translate(-1.2, 3.08, -0.35));
    P.add('iron', xTube(-1.2, -CHEEK.x1, 0.04, 0.04, 8, 3.08, -0.35));
    // the panoramic sight on its bracket, above the line handwheel
    P.add('iron', box(0.1, 0.3, 0.1, -1.16, 3.62, 0.0));
    P.add('dark', yTube(3.77, 3.95, 0.05, 0.045, 10, -1.16, 0.0));
    P.add('dark', box(0.08, 0.07, 0.18, -1.16, 3.98, 0.03));
    P.add('glass', box(0.06, 0.05, 0.01, -1.16, 3.98, -0.065));
    // the traverse drive: a gear case on the deck at the left front, its pinion down to the bed's rack
    P.add('camo', rbox(0.5, 0.5, 0.5, 0.05, -1.55, D + 0.25, -2.6));
    P.add('iron', yTube(D + 0.5, D + 0.9, 0.04, 0.04, 8, -1.55, -2.6));
    P.add('steel', handwheel(0.22, 5, 0.02, 0.045, 1).rotateZ(Math.PI / 2).translate(-1.55, D + 0.92, -2.6));
    P.build(trav, { y0: 0 });
  }

  // ================================================================ the cradle (elevation frame)
  const rr = (w, h, r, n = 4) => {
    const pts = [], cx = w / 2 - r, cy = h / 2 - r;
    for (const [qx, qy, a0] of [[cx, cy, 0], [-cx, cy, Math.PI / 2], [-cx, -cy, Math.PI], [cx, -cy, Math.PI * 1.5]]) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([qx + Math.cos(a) * r, qy + Math.sin(a) * r]); }
    return pts;
  };
  // a rounded-rectangle section with the barrel's bore through it, extruded along z (the cradle closes round the
  // barrel, which slides in it)
  const sleeve = (w, h, r, z0, z1, hole = 0.52) => {
    const sh = new THREE.Shape(rr(w, h, r).map(([x, y]) => new THREE.Vector2(x, y)));
    const hp = new THREE.Path();
    hp.absarc(0, 0, hole, 0, Math.PI * 2, true);
    sh.holes.push(hp);
    return new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, z0);
  };
  {
    const P = mk();
    P.add('camo', sleeve(1.3, 1.25, 0.18, -2.6, 0.35));
    // the head of the cradle: a heavier block at the front (the photo's square front with the barrel coming out)
    P.add('camo', sleeve(1.46, 1.42, 0.08, -2.81, -2.31));
    P.add('iron', zLathe([[-2.88, 0.42], [-2.88, 0.5], [-2.81, 0.5], [-2.81, 0.42]], 28));
    for (const z of [-1.7, -0.8]) P.add('camo', sleeve(1.36, 1.31, 0.2, z - 0.05, z + 0.05));
    // the recuperator over the barrel: a big cylinder with a domed front and bands, its rear end block
    P.add('camo', zTube(-2.75, -0.15, 0.25, 0.25, 24, 0, 0.87));
    P.add('camo', sphere(0.25, 0, 0.87, -2.75, 1, 1, 0.45, 20));
    P.add('iron', zTube(-2.86, -2.75, 0.1, 0.12, 12, 0, 0.87));
    for (const z of [-2.35, -1.5, -0.65]) P.add('iron', zTube(z - 0.05, z + 0.05, 0.27, 0.27, 24, 0, 0.87));
    P.add('camo', rbox(0.58, 0.5, 0.3, 0.04, 0, 0.82, -0.08));
    P.add('camo', box(0.4, 0.2, 2.5, 0, 0.66, -1.45)); // the saddle the cylinder lies on
    // the two recoil brakes along the sleeve's sides
    for (const s of [-1, 1]) {
      P.add('camo', zTube(-2.45, -0.5, 0.12, 0.12, 14, s * 0.74, -0.18));
      P.add('iron', zTube(-0.5, -0.4, 0.09, 0.09, 10, s * 0.74, -0.18));
      // trunnion stub
      P.add('steel', xTube(s * 0.6, s * CHEEK.x0, 0.2, 0.2, 20, 0, 0));
      // the elevating arc (toothed sector) and its spokes back to the sleeve
      P.add('iron', gearArc(0.92, 1.02, 12 * DEG, 92 * DEG, 0.06, 34, 0.035).translate(s * 0.82, 0, 0));
      for (const a of [20, 52, 85]) {
        const r = 0.92, ca = Math.cos(a * DEG), sa = Math.sin(a * DEG);
        P.add('camo', rod(V(s * 0.82, -r * sa, r * ca), V(s * 0.66, -0.45 * sa, 0.35 * ca - 0.1), 0.04, 6));
      }
    }
    P.build(elev, { y0: TRY });
  }

  // ================================================================ the barrel, ring and wedge (recoil frame)
  {
    const P = mk();
    // the barrel is a tube (the rounds go down its bore): the outside, then the bore, darkened
    const BORE = 0.212;
    P.add('barrel', zLathe([[MUZ, BORE], [MUZ, 0.37], [MUZ + 0.05, 0.395], [MUZ + 0.2, 0.395], [MUZ + 0.26, 0.375], [-2.78, 0.39], [-2.72, 0.46], [0.3, 0.5], [0.35, 0.55], [BRE - 0.62, 0.55], [BRE - 0.6, BORE]], 36));
    P.add('dark', inside(zLathe([[MUZ, BORE], [BRE, BORE]], 24)));
    for (const z of [-2.3, -1.3, -0.3]) P.add('iron', zLathe([[z - 0.06, 0.4], [z - 0.06, 0.48], [z + 0.06, 0.48], [z + 0.06, 0.4]], 32)); // hoops (inside the cradle)
    // the breech ring: square and deep, its rear face with the chamber's mouth
    // (built round the wedge's slot, z 1.17 to 1.51 and 0.9 m high, so the block slides through it)
    P.add('camo', sleeve(1.3, 1.16, 0.06, 0.98, 1.17, 0.215));
    P.add('camo', sleeve(1.3, 1.16, 0.06, 1.51, BRE, 0.215));
    for (const sy of [-1, 1]) P.add('camo', box(1.3, 0.13, 0.36, 0, sy * 0.515, 1.34));
    P.add('camo', box(0.06, 0.92, 0.36, -0.62, 0, 1.34)); // the closed left side
    for (const sy of [-1, 1]) P.add('iron', box(0.05, 0.05, 0.4, 0.64, sy * 0.48, 1.34)); // the wedge's slot, edged above and below
    // the recoil lugs over the ring into the recuperator's rods, the lanyard eye
    P.add('iron', box(0.36, 0.14, 0.45, 0, 0.64, 0.6));
    P.add('iron', rod(V(0, 0.66, 0.4), V(0, 0.87, 0.35), 0.06, 8));
    P.add('steel', zTube(BRE, BRE + 0.08, 0.03, 0.03, 8, 0.3, 0.42));
    // the wedge's crank on the rear face, lower right (it turns the screw that slides the block)
    P.add('iron', box(0.22, 0.22, 0.06, CRANK.x, CRANK.y, BRE + 0.03));
    P.build(rec, { y0: TRY });
    // the wedge: a block through the ring that slides out to the right when the breech is opened
    const W = mk();
    W.add('steel', box(1.14, 0.86, 0.3, -0.6, 0, 0));
    W.add('camo', box(0.06, 0.86, 0.3, 0.0, 0, 0));
    W.add('iron', box(0.1, 0.12, 0.2, 0.06, 0.32, 0));
    W.build(brk, { y0: TRY });
    brk.position.set(0.6, 0, 1.34);
  }
  // the crank (turns as the block is worked)
  const crank = new THREE.Group();
  crank.name = 'wedge-crank';
  crank.position.set(CRANK.x, CRANK.y, CRANK.z);
  rec.add(crank);
  {
    const P = mk();
    P.add('steel', zTube(0, 0.06, 0.04, 0.04, 10));
    P.add('iron', box(0.04, CRANK.r + 0.04, 0.03, 0, CRANK.r / 2, 0.07));
    P.add('steel', zTube(0.05, 0.2, 0.025, 0.025, 8, 0, CRANK.r));
    P.build(crank, { y0: TRY });
  }
  const crankGrip = node(crank, 'crank-grip', 0, CRANK.r, 0.15);

  // ================================================================ the loading tray on its carriage (tray pivot)
  {
    const P = mk();
    const z0 = 1.08, z1 = 3.05;
    for (const g of trough(z0, z1, 0.25, 0.025, 60 * DEG, TRY)) P.add('steel', g);
    // the front bridge spans the well on two posts, each on a pair of rollers on the side rails; the rear rests on
    // a pedestal on the middle rail behind the well (the men beside the tray keep clear of it)
    const zf = z0 + 0.25, zr = z1 - 0.25;
    for (const s of [-1, 1]) {
      P.add('camo', box(0.1, 0.13, 0.62, s * 0.95, 2.385, zf));
      for (const z of [zf - 0.22, zf + 0.22]) P.add('dark', xTube(s * 0.92, s * 0.98, 0.06, 0.06, 12, 2.35, z));
      P.add('camo', box(0.08, 0.55, 0.08, s * 0.95, 2.725, zf));
    }
    P.add('camo', box(2.0, 0.12, 0.14, 0, 3.06, zf));
    P.add('camo', box(0.5, 0.12, 0.14, 0, 3.06, zr));
    P.add('camo', box(0.24, 0.62, 0.18, 0, 2.69, zr));
    P.add('camo', box(0.24, 0.12, 0.6, 0, 2.385, zr));
    for (const z of [zr - 0.2, zr + 0.2]) P.add('dark', xTube(-0.1, 0.1, 0.07, 0.07, 12, 2.365, z));
    for (const z of [zf, zr]) for (const s of [-1, 1]) P.add('timber', box(0.14, 0.1, 0.14, s * 0.17, 3.17, z, 0, 0, s * 0.45));
    P.build(trayP, { y0: 0 });
    // the tray's rails on the deck (fixed)
    const R = mk();
    for (const s of [-1, 1]) R.add('steel', box(0.06, 0.04, 1.5, s * 0.95, D + 0.02, 1.55));
    R.add('steel', box(0.06, 0.04, 1.6, 0, D + 0.02, 3.05));
    R.build(trav, { y0: 0 });
  }

  // ================================================================ the shell lift: incline, winch, car
  {
    const P = mk();
    const x = LIFT.x;
    for (const s of [-1, 1]) {
      // rails on plate girders down to the ground, the girder's top flange under the rail
      P.add('steel', slopeBox(0.07, 0.09, RAIL_Z0, RAIL_Z1, x + s * 0.32, 0));
      // the girder's web: 0.46 m deep, shallowing toward the foot where it comes down to its sill
      const z0 = RAIL_Z0 + 0.05, z1 = RAIL_Z1 - 0.05, zk = LIFT.top.z + (LIFT.top.y - LIFT.H - 0.6) / TAN;
      P.add('camo', sideProfile([[z0, railY(z0) - 0.09], [z1, railY(z1) - 0.09], [z1, 0.0], [zk, 0.0], [z0, railY(z0) - 0.55]], 0.05).translate(x + s * 0.32, 0, 0));
      P.add('camo', slopeBox(0.2, 0.03, z0, z1, x + s * 0.32, -0.09));
      // the girder's top end bears on the box's cut wall (a bearing block on the deck's edge)
      P.add('camo', box(0.22, railY(1.4) - 0.6 - D + 0.1, 0.18, x + s * 0.32, (railY(1.4) - 0.6 + D) / 2 + 0.05, 1.38));
    }
    for (let z = RAIL_Z0 + 0.3; z < RAIL_Z1 - 0.2; z += 0.75) P.add('camo', box(0.7, 0.1, 0.08, x, railY(z) - 0.32, z));
    // the transfer skids at the top: the shell is rolled across them from the car onto the tray (cantilevered
    // off the inner girder, over the tray's carriage, which runs under them)
    for (const z of [1.65, 2.7]) {
      P.add('steel', box(0.7, 0.05, 0.1, -0.71, 3.195, z));
      P.add('camo', box(0.08, 0.12, 0.1, -1.1, 3.12, z));
    }
    P.add('camo', rod(V(x + 0.32, railY(2.9) - 0.4, 2.9), V(-0.98, 1.4, 2.9), 0.05, 6));
    P.add('camo', rod(V(x + 0.32, railY(3.6) - 0.4, 3.6), V(-0.98, 0.9, 3.6), 0.05, 6));
    // the foot: a sill across the rail ends on a flanged roller that runs on the arc rail
    const zf = RAIL_Z1 + 0.12;
    P.add('camo', box(0.95, 0.16, 0.24, x, 0.27, zf));
    for (const s of [-1, 1]) {
      P.add('dark', xTube(x + s * 0.06, x + s * 0.16, 0.1, 0.1, 14, 0.17, zf));
    }
    P.add('dark', xTube(x - 0.06, x + 0.06, 0.12, 0.12, 14, 0.17, zf));
    // the hand winch at the top: drum between two side frames, gearing, the crank outside on the left
    const W = WINCH;
    for (const xx of [W.x0, W.x1]) P.add('camo', sideProfile([[W.z - 0.18, D], [W.z + 0.18, D], [W.z + 0.08, W.y + 0.12], [W.z - 0.08, W.y + 0.12]], 0.05).translate(xx, 0, 0));
    P.add('iron', xTube(W.x0 + 0.04, W.x1 - 0.04, 0.12, 0.12, 18, W.y, W.z));
    for (const xx of [W.x0 + 0.06, W.x1 - 0.06]) P.add('iron', xTube(xx - 0.02, xx + 0.02, 0.17, 0.17, 18, W.y, W.z));
    P.add('steel', xTube(W.x0 - 0.04, W.x0 + 0.02, 0.24, 0.24, 24, W.y, W.z)); // the big gear
    P.add('iron', xTube(W.crankX - 0.02, W.x0, 0.035, 0.035, 8, W.crankY, W.z)); // the crank shaft
    P.add('iron', xTube(W.x0 - 0.08, W.x0, 0.07, 0.07, 10, W.crankY, W.z));
    P.add('rope', xTube(W.x0 + 0.1, W.x1 - 0.1, 0.135, 0.135, 14, W.y, W.z)); // the wire wound on the drum
    P.build(trav, { y0: 0 });
  }
  const winchCrank = new THREE.Group();
  winchCrank.name = 'winch-crank';
  winchCrank.position.set(WINCH.crankX, WINCH.crankY, WINCH.z);
  trav.add(winchCrank);
  {
    const P = mk();
    P.add('iron', box(0.03, WINCH.crankR + 0.05, 0.05, 0, WINCH.crankR / 2, 0));
    P.add('steel', xTube(-0.2, 0, 0.022, 0.022, 8, WINCH.crankR, 0));
    P.build(winchCrank, { y0: 0 });
  }
  const winchGrip = node(winchCrank, 'winch-grip', -0.12, WINCH.crankR, 0);
  // the car: its origin is the shell's middle; a level saddle on a wedge-shaped frame whose wheels ride the incline
  {
    const P = mk();
    const ry = (z) => -LIFT.H - z * TAN; // rail top under the car's z (car frame)
    const zA = -0.6, zB = 0.62;
    for (const s of [-1, 1]) {
      P.add('camo', sideProfile([[zA, -0.34], [zB, -0.34], [zB, ry(zB) + 0.22], [zA, ry(zA) + 0.22]], 0.05).translate(s * 0.32, 0, 0));
      for (const z of [-0.45, 0.45]) {
        const wy = ry(z) + 0.1 / Math.cos(LT);
        P.add('dark', xTube(s * 0.25, s * 0.34, 0.1, 0.1, 14, wy, z));
        P.add('iron', xTube(s * 0.24, s * 0.27, 0.12, 0.12, 14, wy, z)); // flange inside the rail
        P.add('steel', xTube(-0.34, 0.34, 0.03, 0.03, 8, wy, z));
      }
    }
    P.add('camo', box(0.7, 0.06, zB - zA, 0, -0.37, 0));
    for (const z of [-0.45, 0.45]) {
      for (const s of [-1, 1]) P.add('timber', box(0.14, 0.13, 0.22, s * 0.15, -0.27, z, 0, 0, s * 0.5));
      P.add('timber', box(0.6, 0.06, 0.24, 0, -0.33, z));
    }
    P.add('iron', box(0.12, 0.12, 0.08, 0, ry(zA) + 0.12, zA - 0.02)); // the rope's shackle at the front
    P.build(lift, { y0: 0 });
  }
  const liftRope = node(lift, 'lift-rope-eye', 0, -LIFT.H + 0.6 * TAN + 0.08, -0.64);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 5), mats.chain);
  wire.name = 'lift-wire';
  wire.castShadow = true;
  trav.add(wire);

  // ================================================================ ammunition: the trolley at the lift's foot, the charge rack
  {
    const P = mk();
    const tg = new THREE.Group();
    tg.position.set(STACK.x, 0, STACK.z);
    tg.rotation.y = Math.atan2(STACK.x, STACK.z); // square to the arc track
    trav.add(tg);
    // a Feldbahn wagon (600 mm gauge across, along the track the wheelbase)
    for (const s of [-1, 1]) for (const xa of [-0.38, 0.38]) {
      P.add('dark', xTube(-0.03, 0.03, 0.17, 0.17, 14, 0.17, s * 0.3).rotateY(Math.PI / 2).translate(xa, 0, 0));
    }
    for (const xa of [-0.38, 0.38]) P.add('steel', zTube(-0.36, 0.36, 0.03, 0.03, 8, xa, 0.17));
    P.add('iron', box(1.15, 0.1, 0.62, 0, 0.33, 0));
    P.add('timber', box(1.1, 0.06, 0.82, 0, 0.41, 0), { tint: 0xd8d0c4 });
    P.build(tg, { y0: 0 });
    // the timber crib on it, square to the gun (the shell lies along the gun's axis to roll onto the car)
    const cg = new THREE.Group();
    cg.rotation.y = -tg.rotation.y;
    tg.add(cg);
    const C = mk();
    for (const z of [-0.55, 0.55]) {
      for (let i = 0; i < 4; i++) C.add('timber', box(0.75 - i * 0.04, 0.17, 0.2, 0, 0.53 + i * 0.18, z), { tint: [0xffffff, 0xe0d8c8][i & 1] });
      for (const s of [-1, 1]) C.add('timber', box(0.14, 0.13, 0.2, s * 0.15, STACK.y - SHELL.rad - 0.06, z, 0, 0, s * 0.5));
    }
    C.build(cg, { y0: 0 });
    // the charge rack on the tongue (right rear): brass cases with their bags, lying in a timber frame
    const R = mk();
    const rx = 1.62, rz = 4.95;
    for (const z of [-0.45, 0.45]) {
      R.add('timber', box(0.5, 0.08, 0.1, rx, D + 0.5, rz + z));
      R.add('timber', box(0.08, 0.55, 0.08, rx - 0.22, D + 0.275, rz + z));
      R.add('timber', box(0.08, 0.55, 0.08, rx + 0.22, D + 0.275, rz + z));
    }
    for (const [dx, dy] of [[-0.11, 0.0], [0.11, 0.0]]) {
      R.add('brass', zTube(rz - 0.2, rz + 0.75, 0.205, 0.205, 18, rx + dx, D + 0.75 + dy));
      R.add('cloth', zTube(rz - 0.65, rz - 0.2, 0.19, 0.19, 14, rx + dx, D + 0.75 + dy), { tint: 0xd8c8a0 });
    }
    R.build(trav, { y0: 0 });
  }

  // ================================================================ anchors, rig
  const anchors = {
    eye: node(trav, 'eye', 0, TRY + 1.1, 1.2),
    muzzle: node(rec, 'muzzle', 0, 0, MUZ),
    breech: node(rec, 'breech-face', 0, 0, BRE),
    tray: node(trav, 'tray-shell', 0, TRY, TRAY_Z),
    shellStack: node(trav, 'shellStack', STACK.x, STACK.y, STACK.z),
    lift: node(lift, 'lift-shell', 0, 0, 0),
    crankGrip, winchGrip,
    crew: [],
    muzzles: [],
  };
  anchors.muzzles.push(anchors.muzzle);
  const footP = new THREE.Vector3(LIFT.x, LIFT.foot.y, LIFT.foot.z), topP = new THREE.Vector3(LIFT.x, LIFT.top.y, LIFT.top.z);
  const rig = {
    kind: 'gamma', root, anchors, boxes: [], props: {},
    pivots: { traverse: trav, elevation: elev, recoil: rec, breech: brk, tray: trayP, lift },
    recoilLength: REC,
    loadEl: 0,
    breechOpen: { axis: 'x', angle: 0 },
    staffLen: 5.5,
    shell: { len: SHELL.len, rad: SHELL.rad },
    // the gun is only fired from 43 degrees up (the breech goes down the well); below 34 there is no recoil to draw
    recoilFade: (el) => { const t = clamp01((el - 34 * DEG) / (6 * DEG)); return t * t * (3 - 2 * t); },
    slideMats: ['iron', 'barrel'],
    liftTravel: footP.distanceTo(topP),
    trayBack: TRAY_BACK,
    // the stations render/ww1/gamma.js works from (traverse frame at zero traverse; axial = along the bore from
    // the breech face toward the muzzle at the loading elevation)
    spec: {
      lift: LIFT, stack: STACK, trayZ: TRAY_Z, breechZ: TRZ + BRE,
      gripZ: 5.62, // the front rammers' hold at the start of each stroke (z): they work between 5.62 and 4.46
      homeA: TRZ + BRE - 4.55, // the front rammers' place at rest, axial (their spot z 4.55)
      rammed: 1.45, // the shell's base when it is home, axial: the chamber behind it holds the 1.4 m charge
      bagPlace: { x: 0.72, z: 2.35 }, // where the bagman stands to lay the charge in the tray
    },
  };
  rig.setTraverse = (az) => { trav.rotation.y = az; };
  rig.setElevation = (r) => { elev.rotation.x = r; };
  rig.setRecoil = (k) => { rec.position.z = k * REC; };
  // the wedge slides out to the right; its crank turns eight times over the stroke
  rig.setBreech = (k) => { k = clamp01(k); brk.position.x = 0.6 + k * 1.05; crank.rotation.z = -k * Math.PI * 16; };
  rig.setTray = (k) => { trayP.position.z = clamp01(k) * TRAY_BACK; };
  rig.setLift = (k) => { lift.position.lerpVectors(footP, topP, clamp01(k)); winchCrank.rotation.x = clamp01(k) * Math.PI * 2 * 14; };
  rig.setShell = () => {};
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  rig.update = () => {
    // the winch's wire from the top of the drum to the car's shackle
    _a.set(LIFT.x, WINCH.y + 0.135, WINCH.z);
    _b.copy(liftRope.position).add(lift.position);
    wire.position.copy(_a).add(_b).multiplyScalar(0.5);
    _b.sub(_a);
    wire.scale.set(1, Math.max(0.01, _b.length()), 1);
    wire.quaternion.setFromUnitVectors(_up, _b.normalize());
  };
  rig.setTraverse(0);
  rig.setBreech(0);
  rig.setTray(1);
  rig.setLift(0);
  rig.update();

  // hit boxes: the lower carriage and deck, the cheeks and cradle, the barrel, the lift
  const hb = (x0, y0, z0, x1, y1, z1) => rig.boxes.push({ min: V(x0, y0, z0), max: V(x1, y1, z1) });
  hb(-2.1, 0, -3.4, 2.1, D, 3.4);
  hb(-1.1, D, -3.3, 1.1, 4.45, 1.0);
  hb(-0.45, TRY - 0.45, MUZ + TRZ, 0.45, TRY + 0.45, -3.2);
  hb(-1.9, 0, 1.1, -1.0, 3.0, 5.8);

  // crew spots (traverse frame at zero traverse, y the floor). Headings: 0 faces the muzzle (-Z), PI/2 faces -X.
  const spot = (role, x, y, z, heading, pose = 'stand') => anchors.crew.push({ role, x, y, z, heading, pose });
  const E = -Math.PI / 2, Wst = Math.PI / 2;
  spot('officer', -4.6, 0, -1.6, E, 'point'); // on the ground at the left front, the battery commander's telephone near
  spot('layer', -1.62, D, -0.4, E, 'lay'); // the sight and the line handwheel, left walkway
  spot('elevator', 1.74, D, -0.35, Wst, 'operate'); // the elevating handwheel, right walkway
  spot('lanyard', 1.72, D, 2.75, Wst, 'lanyard');
  spot('winch', -1.74, D, 0.5, Math.PI, 'operate'); // the lift's winch crank, at the left walkway's rear
  spot('loader1', -0.6, D, 3.62, 0, 'stand'); // steadies the shell as it is rolled across onto the tray
  spot('loader2', 1.24, D, 1.62, Wst, 'stand'); // works the wedge's crank, primes
  spot('rammer1', -0.45, D, 4.55, 0, 'ram');
  spot('rammer2', 0.45, D, 4.55, 0, 'ram');
  spot('rammer3', -0.45, D, 5.2, 0, 'ram');
  spot('rammer4', 0.45, D, 5.2, 0, 'ram');
  spot('bagman', 1.6, D, 3.95, Math.PI, 'stand'); // the charges from the rack on the tongue
  spot('roller1', -2.4, 0, 7.05, 0, 'stand'); // behind the trolley's track: roll the shell onto the lift's car
  spot('roller2', -0.5, 0, 7.45, 0, 'stand');
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rig;
}

// ================================================================ the firing position
// buildGammaSite(seed) => { root, setCamo(k), camo }: the position round the gun in the rig's frame at zero traverse,
// ground y = 0 (put it where the rig's root is, turned with it). The pit's spoil banked in a low parapet across the
// front, revetted with boards; the planked apron round the bed; the standard-gauge spur on the right that brought
// the ten wagon loads; the 25 t gantry crane that set the gun up, on its own rails either side of the pit, parked at
// the rear end of its run behind the camouflage net, out of the muzzle's way (refs/gamma; from the chase camera's
// place 50 m behind the gun the view runs under its bridge and between its legs); the Feldbahn from the end of the
// gun's arc track back to the shell store (a timber and earth dugout) with loaded trolleys waiting, the charge store;
// the camouflage net on poles over the rear of the position and the lift (setCamo(k) 0..1 draws it over from the
// rear); the crew's dugout and the officer's post.
// Nothing of it enters the gun's sweep (the deck and the lift's foot within 7.2 m of the pivot over +-23 degrees).
export const GAMMA_SITE = { spurX: 6.8, gantryX: 9.4, gantryZ: 18.5, gantryH: 10.4 };
export function buildGammaSite(seed = 1) {
  const mats = vehicleMats('bunt');
  const rnd = mulberry32(5101 + (seed | 0) * 7);
  const root = new THREE.Group();
  root.name = 'gamma-site';
  const P = new Parts(mats);
  const j = (a) => (rnd() - 0.5) * a;
  const S = GAMMA_SITE;

  // the parapet: the pit's spoil banked in an arc across the front (sloped both ways), boards on its inner face
  {
    const R0 = 10.6, R1 = 14.0, half = 32 * DEG, n = 16;
    for (let i = 0; i < n; i++) {
      const aa = -half + (2 * half * i) / n, ab = -half + (2 * half * (i + 1)) / n, am = (aa + ab) / 2;
      const h = 1.7 + 0.25 * Math.sin(i * 1.7 + seed) + j(0.2), end = Math.min(1, (half - Math.abs(am)) / (8 * DEG));
      const hh = 0.3 + (h - 0.3) * end;
      const pts = [[R0 - 0.2, -0.05], [R0 + 0.6, hh], [R0 + 1.8, hh + 0.12], [R1, -0.05]];
      // lathe phi from +Z toward +X: PI + a puts a = 0 straight ahead (-Z)
      P.add('soil', new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 2, Math.PI + aa, ab - aa), { tint: [0xffffff, 0xe8e0d0, 0xd8d0c0][i % 3] });
      const r = R0 + 0.2, x = -Math.sin(am) * r, z = -Math.cos(am) * r;
      P.add('timber', box(r * (ab - aa) + 0.04, hh * 0.8, 0.05, x, hh * 0.38, z, -0.42, -am, 0), { tint: 0xb8b0a0 });
    }
  }
  // the planked apron round the bed (the filled pit under it), a kerb of sandbags in front
  {
    for (let z = -5.4; z < 4.0; z += 0.31) P.add('timber', box(11.2, 0.05, 0.29, j(0.06), 0.025, z), { tint: [0xffffff, 0xe6dece, 0xd2c8b6][(rnd() * 3) | 0] });
    for (let i = 0; i < 24; i++) {
      const a = -1.1 + (2.2 * i) / 23, r = 7.6;
      P.add('cloth', rbox(0.62, 0.22, 0.34, 0.08, -Math.sin(a) * r, 0.11, -Math.cos(a) * r, 0, -a + j(0.2), 0), { tint: 0xc8b890 });
    }
  }
  // the standard-gauge spur along the right (the gun came in on it), a buffer stop at its front end
  {
    for (let z = -4.0; z < 32; z += 0.7) P.add('timber', box(2.2, 0.14, 0.24, S.spurX, 0.07, z + j(0.05)), { tint: 0xb8ae9c });
    for (const s of [-1, 1]) P.add('steel', box(0.07, 0.15, 36.4, S.spurX + s * 0.72, 0.21, 14));
    P.add('timber', box(2.2, 0.8, 0.5, S.spurX, 0.4, -4.3));
    P.add('dark', box(2.6, 0.12, 0.3, S.spurX, 0.7, -4.0));
  }
  // the gantry crane: a lattice trestle on a two-axle bogie each side, its own rails (from ahead of the pit, so it
  // could reach over the whole gun, back past the net), a plate girder bridge 17 m across and 10 m up with a
  // walkway, the crab and hook block on it, the winch house at the right leg
  {
    const xs = [-S.gantryX, S.gantryX], zc = S.gantryZ, H = S.gantryH, span = xs[1] - xs[0];
    for (const xx of xs) {
      for (const s of [-1, 1]) P.add('steel', box(0.07, 0.15, 31, xx + s * 0.6, 0.21, 6.5));
      for (let z = -8.8; z < 22; z += 0.8) P.add('timber', box(1.8, 0.12, 0.22, xx, 0.06, z), { tint: 0xc0b6a4 });
      P.add('camo', box(0.7, 0.5, 4.4, xx, 0.62, zc));
      for (const z of [-1.6, 1.6]) for (const s of [-1, 1]) P.add('dark', xTube(xx + s * 0.6 - 0.06, xx + s * 0.6 + 0.06, 0.32, 0.32, 14, 0.38, zc + z));
      // two legs leaning in to the bridge, horizontal ties and diagonals between them
      const leg = (y) => 1.9 - 1.45 * (y - 0.85) / (H - 1.35);
      for (const s of [-1, 1]) P.add('camo', rod(V(xx, 0.85, zc + s * 1.9), V(xx, H - 0.5, zc + s * 0.45), 0.16, 6));
      for (let k = 0; k < 4; k++) {
        const ya = 1.6 + k * 2.1, yb = ya + 2.1;
        P.add('iron', box(0.1, 0.1, 2 * leg(ya), xx, ya, zc));
        P.add('iron', rod(V(xx, ya, zc - leg(ya)), V(xx, Math.min(yb, H - 0.6), zc + leg(Math.min(yb, H - 0.6))), 0.045, 5));
      }
    }
    for (const z of [-0.45, 0.45]) {
      P.add('camo', box(span + 1.4, 1.0, 0.12, 0, H, zc + z));
      P.add('dark', rivetRow(V(-span / 2 - 0.6, H + 0.4, zc + z * 1.15), V(span / 2 + 0.6, H + 0.4, zc + z * 1.15), 0.4, V(0, 0, Math.sign(z)), 0.03));
    }
    P.add('iron', box(span + 1.4, 0.05, 0.8, 0, H + 0.52, zc), { tint: 0xa8a8a0 });
    const cx = S.spurX; // the crab parked over the spur, where it took the loads off the wagons (not over the gun)
    P.add('camo', rbox(1.6, 0.9, 1.5, 0.08, cx, H + 0.98, zc));
    P.add('iron', xTube(cx - 0.6, cx + 0.6, 0.28, 0.28, 16, H + 0.95, zc));
    for (const s of [-1, 1]) P.add('chain', rod(V(cx + s * 0.25, H - 0.5, zc), V(cx + s * 0.12, 5.6, zc), 0.03, 5));
    P.add('dark', rbox(0.6, 0.55, 0.35, 0.05, cx, 5.3, zc));
    P.add('iron', new THREE.TorusGeometry(0.2, 0.06, 6, 12, Math.PI * 1.4).rotateY(Math.PI / 2).translate(cx, 4.85, zc));
    P.add('timber', box(1.4, 1.5, 1.6, xs[1] + 1.3, 1.6, zc), { tint: 0xa89e8c });
    for (let y = 0.6; y < H - 0.6; y += 0.35) P.add('iron', box(0.5, 0.03, 0.03, xs[1] - 0.45, y, zc + 2.1));
  }
  // the Feldbahn from the right end of the gun's arc track back under the gantry to the shell store; loaded
  // trolleys waiting on it; the charge store on the left
  {
    const a = 20 * DEG, sx = Math.sin(a) * TROLLEY_R, sz = Math.cos(a) * TROLLEY_R, xl = 2.6;
    const pts = [[sx, sz], [sx + 0.55, sz + 1.5], [xl, sz + 3.6], [xl, 25.0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), h = Math.atan2(x1 - x0, z1 - z0);
      for (const s of [-1, 1]) P.add('steel', box(0.05, 0.07, len + 0.04, (x0 + x1) / 2 + Math.cos(h) * s * 0.3, 0.135, (z0 + z1) / 2 - Math.sin(h) * s * 0.3, 0, h, 0));
      for (let k = 0; k < len; k += 0.62) P.add('timber', box(1.0, 0.1, 0.15, x0 + Math.sin(h) * k, 0.05, z0 + Math.cos(h) * k, 0, h, 0), { tint: 0xd0c8b8 });
    }
    const shell = shellGeometry(SHELL.len, SHELL.rad, { crh: 2.0 });
    for (const z of [14.0, 19.5]) {
      P.add('iron', box(1.15, 0.1, 0.62, xl, 0.33, z));
      for (const s of [-1, 1]) for (const xx of [-0.38, 0.38]) P.add('dark', zTube(z + s * 0.27, z + s * 0.33, 0.17, 0.17, 12, xl + xx, 0.17));
      for (const dz of [-0.55, 0.55]) P.add('timber', box(0.75, 0.6, 0.2, xl, 0.68, z + dz));
      P.add('shell', shell.body.clone().translate(xl, 1.2, z), { tint: 0x9aa09a });
      P.add('brass', shell.band.clone().translate(xl, 1.2, z));
      P.add('steel', shell.fuze.clone().translate(xl, 1.2, z));
    }
    // the shell store over the line's end: log walls, a log roof under a mound of earth, the door
    const z = 27.0;
    P.add('timber', box(4.4, 2.3, 0.25, xl, 1.15, z - 2.6), { tint: 0xa89e8c });
    for (const s of [-1, 1]) P.add('timber', box(0.25, 2.3, 5.2, xl + s * 2.2, 1.15, z));
    for (let k = 0; k < 14; k++) P.add('timber', xTube(xl - 2.4, xl + 2.4, 0.12, 0.12, 7, 2.42, z - 2.5 + k * 0.38), { tint: 0xb0a690 });
    P.add('soil', sphere(3.6, xl, 2.2, z + 0.3, 1, 0.38, 1.05, 14));
    P.add('dark', box(1.4, 1.9, 0.05, xl, 0.95, z - 2.74));
    // the charge store, a smaller dugout behind the left of the position
    P.add('soil', sphere(2.4, -4.0, 0.6, 24.0, 1.2, 0.5, 1, 12));
    P.add('timber', box(1.3, 1.6, 0.2, -4.0, 0.8, 21.9), { tint: 0xa89e8c });
    P.add('dark', box(0.8, 1.3, 0.05, -4.0, 0.7, 21.79));
    // timber left over from the pit, tool chests, the crew's dugout (left front), the telephone poles
    for (let i = 0; i < 7; i++) P.add('timber', box(0.3, 0.3, 4.5, -11.2 + (i % 4) * 0.32, 0.15 + (i > 3 ? 0.3 : 0), 5), { tint: 0xc4baa6 });
    for (let i = 0; i < 3; i++) P.add('camo', rbox(0.9, 0.5, 0.5, 0.04, 11.5, 0.25, -1 + i * 1.2));
    P.add('timber', box(1.6, 0.25, 1.2, -6.2, 0.12, -6.0));
    P.add('soil', sphere(2.2, -6.2, 0.2, -7.1, 1.1, 0.45, 1, 12));
    P.add('dark', box(1.0, 0.9, 0.05, -6.2, 0.45, -5.5));
    for (let k = 0; k < 5; k++) P.add('timber', yTube(0, 3.2, 0.06, 0.05, 6, -12 - k * 6, 2 + k * 0.5), { tint: 0xa09684 });
  }
  P.build(root, { dirt: 0.6 });

  // the camouflage net over the rear of the position (the Feldbahn's approach and the trolleys waiting on it), on
  // poles, with hessian garnish; the gun and its tongue are left open (the barrel, and the chase camera's view from
  // behind onto the loading). setCamo(k) draws it over from the rear (0 rolled up at the rear poles, 1 spread)
  const camo = new THREE.Group();
  camo.name = 'camo';
  root.add(camo);
  const NZ1 = 15.5;
  const netMat = new THREE.MeshStandardMaterial({ color: 0x8a8462, roughness: 1, side: THREE.DoubleSide, alphaTest: 0.35, map: netTexture() });
  const net = new THREE.Mesh(netGeometry(rnd, NZ1), netMat);
  net.position.z = NZ1;
  net.castShadow = true;
  net.receiveShadow = true;
  camo.add(net);
  const poles = new Parts(mats);
  for (const [x, z, h] of [[-6.4, 7.4, 4.5], [5.0, 7.4, 4.5], [-6.4, 11.4, 4.15], [5.0, 11.4, 4.15], [-6.4, 15.3, 3.75], [5.0, 15.3, 3.75], [-0.7, 15.6, 3.8]]) {
    poles.add('timber', yTube(0, h, 0.08, 0.06, 7, x, z), { tint: 0xb4aa94 });
  }
  poles.build(camo, { y0: 0 });
  const setCamo = (k) => { k = clamp01(k); net.visible = k > 0.01; net.scale.z = Math.max(0.01, k); };
  setCamo(1);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, setCamo, camo };
}

// the net: a sagging sheet from z 7.4 (behind the trolley's arc track) to z1 (the rear poles), x -6.4 to 5, in a
// frame whose origin is at z1 (so a scale in z draws it from the rear)
function netGeometry(rnd, z1) {
  const nx = 18, nz = 10, x0 = -6.4, x1 = 5.0, z0 = 7.4;
  const g = new THREE.PlaneGeometry(1, 1, nx, nz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
    const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const top = 4.55 - (z - z0) * 0.09;
    const sag = 0.3 * Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.abs(Math.sin(v * Math.PI * 2))) + (rnd() - 0.5) * 0.08;
    p.setXYZ(i, x, top - sag, z - z1);
  }
  g.computeVertexNormals();
  return g;
}
function netTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rnd = mulberry32(77);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(70,64,46,1)'; g.lineWidth = 2;
  for (let i = -S; i <= S * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i - S, S); g.stroke(); }
  const cols = ['#6b6a4a', '#7d7254', '#5b5038', '#4a5236', '#8e7e58'];
  for (let i = 0; i < 110; i++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    const x = rnd() * S, y = rnd() * S, w = 10 + rnd() * 30, h = 4 + rnd() * 9;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.save(); g.translate(x + dx, y + dy); g.rotate((i * 2.39) % Math.PI); g.fillRect(-w / 2, -h / 2, w, h); g.restore(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, handwheel, gearArc, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, pivotAt, hb, node } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { RH, GA, sagitta, trackX, trackYaw, curveBogie, spanBolsterParts, ammoWagonParts, WAGON, arcPoints, straightBack, layTrack, siteMats, drapeNet, loadingGear, readyRack } from './railway_kit.js';

// 21 cm K 12 (E) (Krupp, 1939): the longest-ranged gun of the war, 115 km with the 107.5 kg shell. A 33.3 m barrel (L/158)
// braced straight by a truss over it, in a ring cradle with hydropneumatic recoil, on a box-girder carriage carried by
// two subframes on double bogies, two ten-axle bogie groups at the front and two eight-axle at the rear (wiki "21 cm K
// 12 (E)", after Engelmann and Hogg); 302 t, 41.3 m (the K 12 V) and 44.9 m (the K 12 N, its trunnions further forward
// and its recoil lengthened). Two more hydropneumatic systems let the whole carriage recoil about 98 cm on its
// subframes; the trunnions sit so far back that the breech comes near the ground at high angles, and a hydraulic jack
// in each subframe raises the carriage about a metre to clear it, lowered again to load. Fired from a curved track (a
// Vögele turntable or a T-shaped firing track too), laid by an electric motor and clamped once aimed. Built here with
// the N's proportions (44.9 m with the barrel at zero elevation). No drawing was found: the girders, the truss's posts
// and stays, the equilibrators, the arcs, the rear platform's loading gear (a runway beam on two portals over the
// ammunition wagon coupled behind, a trolley and a bridge to the breech), the jacks' places and the walkways are game
// estimates [E].
//
// Frames (rig root: the ground y = 0, the piece's place at the origin, the track through it heading -Z). As the Bruno
// (railway_kit.js, the Gustav's rule): the traverse pivot is the firing curve's centre (-R, 0, 0) and the gun hangs in
// `gun` (+R, 0, 0); the subframes, bogies and the wagon in `base` (x = -s, the chord between the bogie groups' centres);
// inside it `lift`, raised by the jacks (position.y, from the elevation: rig.setElevation), and in that `car`, the
// carriage (rig.pivots.car: position.z its recoil run back, render/guns.js setCar; the men on it ride it, crews.js).
// In the carriage: elevation (TY, TZ), recoil (1.0 m), breech (the sliding wedge, out to the right), the loading
// trolley, the crab and the hook block, the bridge (`tray`), all as the Bruno's. loadEl 0, loaded level and lowered.

export const R = 150; // the firing curve's radius [E]: +-12 degrees run the gun about 31 m either way along it
const GZ = 10.3; // the bogie groups' centres (+-)
const SAG = sagitta(R, GZ);
const BOGF = { axles: 5, pitch: 1.45, wr: 0.5, top: 1.3, fx: 0.95 }, PF = 7.2; // the front groups' bogies and their pitch
const BOGR = { axles: 4, pitch: 1.45, wr: 0.5, top: 1.3, fx: 0.95 }, PRr = 5.8;
const BOLY0 = RH + 1.3, BOLY1 = 2.6; // the subframes (span bolsters): on the bogies' pivots, their top
const HF = -17.5, HR = 16.0, BUF = 0.4; // the carriage's ends, the buffers' reach
const GX = 1.0; // the side girders' webs
const GT = 3.6; // the girders' top
const DECK = 3.65; // the walkways and the platform
const WX = 1.9; // the walkways' edge (folding leaves)
const TY = 4.75, TZ = 0.6; // the trunnions (the carriage down on its subframes)
const BRE = 3.6, MUZ = BRE - 33.3; // the barrel's ends from the trunnions
const CR0 = -4.6, CR1 = 1.4; // the ring cradle
const RECOIL = 1.0, RUN = 0.98, JACK = 1.0;
const JACK_EL = [28 * DEG, 44 * DEG]; // the jacks raise the carriage as the gun goes up through these elevations
const WEDGE = 0.58;
const SHELL = { len: 1.05, rad: 0.1055 }; // 21 cm Gr 35, 107.5 kg (shells.js)
const P0 = TZ + BRE + RECOIL + 0.6; // the platform's front edge
const RAILX = 0.42;
const ZB = TZ + BRE + 0.1 + SHELL.len / 2;
const ZWAIT = 11.6;
const BRIDGE = [TZ + BRE + 0.15, P0];
const WZ = HR + BUF + 0.4 + WAGON.len / 2 + 0.4, ZPICK = WZ - WAGON.len / 2 + 0.9;
const BEAM = DECK + 2.7;
const HANG = 0.5;
const WAGON_Y = RH + WAGON.deck + 0.08 + SHELL.rad;
const STAFF = 5.6;
const PORTALS = [11.0, HR - 0.15];
const TRUSS = { post: -8.0, ph: 3.4, strut: -17.0, sh: 2.1, front: -26.0, anchor: BRE - 0.62, ay: 0.58 };

// the drill's places (render/de/k12.js through render/rail_drill_de.js), carriage frame at zero elevation, lowered
export const K12 = {
  R, SAG, TY, TZ, BRE: TZ + BRE, DECK, ZB, ZWAIT, ZPICK, HANG, WAGON_Y, RAILX, SHELL, STAFF, P0, WX,
  HOOK: { up: BEAM - 0.7, down: WAGON_Y + HANG, set: TY + HANG },
  SEAT: TZ + BRE - 1.2 - SHELL.len / 2,
  RACK: { x: 1.75, y: DECK + 0.8, z: P0 + 1.0 }, // the next charge on the ready rack's top shelf, on the right railing
  STAFF_REST: { x: -1.74, y: DECK + 0.88, z: ZB + SHELL.len / 2 + 0.1 }, // the staff's head on its hooks on the left railing
  LOCK: { x: 0.28, y: 0.28, z: BRE + 0.05 },
  CRANK: { x: 0.22, y: 0.6, z: BRE + 0.1 },
  HANDLES: [-0.2, 0.55],
  RAIL_TOP: { x: -0.34, dy: -SHELL.rad - 0.04 },
  WINCH: { x: -1.25, y: DECK + 1.1, z: HR - 0.55, axis: 'x' }, // the hoist winch's crank (its arm's pivot) on the rear portal's left leg
  ASIDE: [[-1.65, 3.4], [-1.65, 4.2]], // the trolley men out of the rammers' way
  CAR_LANE: -0.88, CHG_X: 1.25, LANE: 0.98, TAKE_X: -1.38, BAR: 0.76, RAM_OFF: [2.3, 3.3],
  WRENCH: { x: 0.4, dz: 0.33 }, PRIME: { x: 0.78, dz: 0.42 }, LAN_IN: 0.92, LAN_OUT: 1.42,
  wagonYaw: trackYaw(R, WZ),
};
// how high the jacks hold the carriage at an elevation
const jackAt = (el) => { const k = Math.min(1, Math.max(0, (el - JACK_EL[0]) / (JACK_EL[1] - JACK_EL[0]))); return JACK * k * k * (3 - 2 * k); };

const polyY = (poly, z, pick) => {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) {
      const y = a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]);
      best = best == null ? y : pick(best, y);
    }
  }
  return best;
};
const bar = (z0, y0, z1, y1, w, h, x) => box(w, h, Math.hypot(z1 - z0, y1 - y0), x, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export function buildK12() {
  const rig = newGunRig('k12', 'dgrau');
  const root = rig.root;
  const mk = () => new Parts(rig.mats);
  const trav = pivotAt(rig, root, 'traverse', -R, 0, 0);
  const gun = node(trav, 'gun', R, 0, 0);
  const base = node(gun, 'base', -SAG, 0, 0);
  const lift = node(base, 'lift', 0, 0, 0);
  const car = pivotAt(rig, lift, 'car', 0, 0, 0);
  const elev = pivotAt(rig, car, 'elevation', 0, TY, TZ);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', 0, 0, BRE - 0.3);
  const trol = pivotAt(rig, car, 'trolley', 0, TY, ZWAIT);
  const crab = pivotAt(rig, car, 'crab', 0, BEAM, ZPICK);
  const hoist = pivotAt(rig, car, 'hoist', 0, K12.HOOK.up, ZPICK);
  const bridge = pivotAt(rig, car, 'tray', 0, 0, 0);
  rig.curveR = R;
  rig.railHead = RH;
  rig.recoilLength = RECOIL;
  rig.loadEl = 0;
  rig.staffLen = STAFF;
  rig.hoistRange = { up: K12.HOOK.up, down: K12.HOOK.down };
  rig.hoistHang = HANG;
  rig.trolleyRange = { breech: ZB, wait: ZWAIT };
  rig.rail = { ...K12, bodyX: -SAG, jack: () => lift.position.y, run: () => car.position.z };

  // ================================================================ subframes, bogies, jacks, the wagon (base: fixed)
  const bogies = [];
  const groups = [[-GZ, PF, BOGF], [GZ, PRr, BOGR]];
  for (const [zc, pitch, spec] of groups) {
    const za = zc - pitch / 2, zb = zc + pitch / 2;
    for (const z of [za, zb]) bogies.push(curveBogie(gun, rig.mats, spec, -SAG + trackX(R, GZ, z), RH, z, trackYaw(R, z), 'bogie'));
    // the subframe on the chord between its two bogies' pivots (base frame)
    const xa = trackX(R, GZ, za), xb = trackX(R, GZ, zb), g = new THREE.Group();
    g.position.set((xa + xb) / 2, 0, zc);
    g.rotation.y = -Math.atan2(xb - xa, zb - za);
    base.add(g);
    const Q = mk(), L = spanBolsterParts(Q, pitch, BOLY0, BOLY1, 1.9);
    // the jacks: four hydraulic cylinders on brackets off the subframe's sides, the pump and its tank on the front one
    for (const s of [-1, 1]) for (const dz of [-1.8, 1.8]) {
      Q.add('camo', box(0.4, 0.12, 0.6, s * 1.1, BOLY0 + 0.25, dz));
      Q.add('camo', rod(V(s * 0.95, BOLY0 + 0.15, dz - 0.3), V(s * 1.22, BOLY0 + 0.25, dz), 0.04, 5));
      Q.add('steel', yTube(BOLY0 + 0.3, BOLY1 - 0.08, 0.17, 0.17, 16, s * 1.25, dz));
      Q.add('dark', yTube(BOLY1 - 0.1, BOLY1 - 0.05, 0.2, 0.2, 16, s * 1.25, dz));
    }
    if (zc < 0) {
      Q.add('camo', rbox(0.7, 0.6, 1.0, 0.05, -1.35, BOLY0 + 0.1, 3.4)); // the pump and its motor
      Q.add('dark', xTube(-1.75, -1.05, 0.14, 0.14, 12, BOLY0 + 0.1, 3.05));
      Q.add('steel', yTube(BOLY0 + 0.4, BOLY0 + 0.7, 0.03, 0.03, 6, -1.5, 3.7));
      Q.add('dark', rod(V(-1.2, BOLY0 + 0.35, 3.0), V(-1.25, BOLY1 - 0.1, 1.8), 0.025, 4)); // the pressure line
    }
    // the carriage's recoil slides on the subframe (it runs back on them) and the run-out cylinders
    for (const s of [-1, 1]) {
      Q.add('steel', box(0.3, 0.05, L - 2.6, s * 0.55, BOLY1 + 0.02, 0), { tint: 0xb0b0a8 });
      Q.add('camo', zTube(-L / 2 + 1.0, -0.6, 0.11, 0.11, 12, s * 0.2, BOLY1 - 0.18));
    }
    Q.build(g, { dirt: 0.4, y0: 0 });
  }
  let lastAz = NaN;
  const roll = (az) => { if (az === lastAz) return; lastAz = az; for (const b of bogies) b.turn(-(az * R) / 0.5); };
  roll(0);
  // the ammunition wagon coupled behind, on the curve
  {
    const g = new THREE.Group(), wx = trackX(R, GZ, WZ), wa = trackYaw(R, WZ);
    g.name = 'ammo-wagon';
    g.position.set(wx, RH, WZ);
    g.rotation.y = wa;
    base.add(g);
    const dx = 0 - wx, dz = ZPICK - WZ, c = Math.cos(wa), s = Math.sin(wa);
    const px = dx * c - dz * s, pz = dx * s + dz * c;
    const Q = mk();
    ammoWagonParts(Q, { shell: SHELL, rounds: [{ x: px, z: pz + 1.4 }, { x: px - 0.5, z: pz + 1.4 }, { x: px - 1.0, z: pz + 1.4 }, { x: px - 0.5, z: pz + 2.8 }], charge: { len: 1.2, rad: 0.13 } });
    Q.build(g, { dirt: 0.35, y0: RH });
  }
  // the jacks' rams and pads (lift: they rise with it); the rams reach down into the cylinders
  {
    const Q = mk();
    for (const [zc] of groups) for (const s of [-1, 1]) for (const dz of [-1.8, 1.8]) {
      const pitch = zc < 0 ? PF : PRr, x = s * 1.25 + (trackX(R, GZ, zc - pitch / 2) + trackX(R, GZ, zc + pitch / 2)) / 2, z = zc + dz;
      Q.add('steel', yTube(BOLY1 - 1.0, BOLY1 + 0.02, 0.12, 0.12, 14, x, z), { tint: 0xc0c4c8 });
      Q.add('dark', box(0.42, 0.08, 0.42, x, BOLY1 + 0.04, z));
    }
    Q.build(lift, { dirt: 0.1, y0: BOLY1 });
  }

  // ================================================================ the carriage
  const PB = mk();
  // the side girders: a box girder the whole length, deep in the belly between the groups (the breech comes down
  // between them at high angles)
  const gp = [[HF, GT], [HR, GT], [HR, BOLY1], [4.7, BOLY1], [3.9, 1.5], [-2.9, 1.5], [-3.7, BOLY1], [HF, BOLY1]];
  for (const s of [-1, 1]) {
    PB.add('camo', sideProfile(gp, 0.1, 0.008).translate(s * GX, 0, 0));
    PB.add('dark', rivetPoly(gp, (z, y) => V(s * (GX + 0.055), y, z), 0.08, 0.25, V(s, 0, 0), 0.022));
    PB.add('camo', box(0.38, 0.05, HR - HF, s * GX, GT - 0.025, (HF + HR) / 2));
    for (const [z0, y0, z1, y1] of [[HF, BOLY1, -3.7, BOLY1], [-3.7, BOLY1, -2.9, 1.5], [-2.9, 1.5, 3.9, 1.5], [3.9, 1.5, 4.7, BOLY1], [4.7, BOLY1, HR, BOLY1]]) PB.add('camo', bar(z0, y0 + 0.025, z1, y1 + 0.025, 0.36, 0.05, s * GX));
    for (let z = HF + 0.6; z < HR - 0.3; z += 0.9) {
      if (Math.abs(z - TZ) < 0.8) continue;
      const top = polyY(gp, z, Math.max), bot = polyY(gp, z, Math.min);
      PB.add('camo', box(0.04, top - bot - 0.12, 0.1, s * (GX + 0.07), (top + bot) / 2, z));
    }
    for (const z of [-1.9, -0.5, 2.0, 3.3]) if (Math.abs(z - TZ) > 0.9) PB.add('dark', new THREE.CylinderGeometry(0.3, 0.3, 0.11, 18).rotateZ(Math.PI / 2).scale(1, 0.85, 1.3).translate(s * GX, 2.1, z));
    // the bearing pads on the subframes and the recoil buffers' brackets
    for (const zc of [-GZ, GZ]) {
      PB.add('camo', box(0.6, 0.12, L_PAD, s * 0.55, BOLY1 + 0.1, zc));
      for (const dz of [-1.8, 1.8]) PB.add('camo', box(0.5, 0.25, 0.5, s * 1.18, BOLY1 + 0.2, zc + dz)); // the jacks' heads bear here
    }
  }
  for (const z of [HF + 0.3, -13.0, -8.0, 6.5, 13.5, HR - 0.3]) PB.add('camo', box(2 * GX, 0.5, 0.14, 0, GT - 0.3, z));
  for (const zc of [-GZ, GZ]) PB.add('camo', box(2 * GX, 0.6, 1.6, 0, BOLY1 + 0.42, zc)); // over the subframes' pivots
  // headstocks, buffers, couplings, the corner steps
  for (const [z, e] of [[HF, -1], [HR, 1]]) {
    PB.add('camo', box(2.9, 0.7, 0.24, 0, BOLY1 + 0.45, z + e * 0.12));
    PB.add('dark', rivetRow(V(-1.35, BOLY1 + 0.72, z + e * 0.245), V(1.35, BOLY1 + 0.72, z + e * 0.245), 0.2, V(0, 0, e), 0.022));
    for (const x of [-0.88, 0.88]) {
      PB.add('camo', zTube(z + e * 0.24, z + e * 0.42, 0.15, 0.15, 14, x, BOLY1 + 0.35));
      PB.add('steel', zTube(z + e * 0.3, z + e * BUF, 0.07, 0.07, 10, x, BOLY1 + 0.35));
      PB.add('steel', zTube(z + e * (BUF - 0.06), z + e * BUF, 0.21, 0.21, 22, x, BOLY1 + 0.35));
    }
    PB.add('dark', box(0.2, 0.18, 0.3, 0, BOLY1 + 0.25, z + e * 0.35));
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) PB.add('dark', box(0.5, 0.04, 0.24, s * (WX - 0.25), 1.1 + k * 0.62, z - e * 0.3));
      for (const dx of [-0.24, 0.24]) PB.add('dark', rod(V(s * (WX - 0.25) + dx, 1.05, z - e * 0.38), V(s * (WX - 0.25) + dx, GT, z - e * 0.38), 0.018, 4));
    }
  }
  // walkways and railings
  const plank = (x0, x1, z0, z1, y = DECK) => {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 0.26));
    for (let i = 0; i < n; i++) PB.add('timber', box(Math.abs(x1 - x0) / n - 0.012, 0.05, z1 - z0, Math.min(x0, x1) + ((i + 0.5) * Math.abs(x1 - x0)) / n, y - 0.025, (z0 + z1) / 2));
  };
  const railRun = (x0, z0, x1, z1, y = DECK, h = 1.0) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.25));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; PB.add('dark', rod(V(x, y, z), V(x, y + h, z), 0.021, 5)); }
    PB.add('dark', rod(V(x0, y + h, z0), V(x1, y + h, z1), 0.023, 6));
    PB.add('dark', rod(V(x0, y + h / 2, z0), V(x1, y + h / 2, z1), 0.017, 5));
  };
  for (const s of [-1, 1]) {
    plank(s * (GX + 0.19), s * WX, HF + 0.05, P0);
    for (let z = HF + 0.8; z < P0; z += 1.5) PB.add('camo', rod(V(s * (GX + 0.06), GT - 0.5, z), V(s * (WX - 0.05), DECK - 0.07, z), 0.03, 5));
    railRun(s * WX, HF + 0.6, s * WX, TZ - 1.0);
    railRun(s * WX, TZ + 1.1, s * WX, HR - 0.6);
  }
  railRun(-WX, HF + 0.05, WX, HF + 0.05);
  // the front deck: plates between the girders, the barrel's travelling crutch folded down
  PB.add('camo', box(2 * GX - 0.1, 0.06, 4.0, 0, DECK - 0.03, HF + 2.05));
  PB.add('camo', box(2 * GX - 0.1, 0.06, 6.0, 0, DECK - 0.03, -10.0));
  for (const s of [-1, 1]) PB.add('camo', rod(V(s * 0.7, DECK + 0.06, HF + 1.0), V(s * 0.2, DECK + 0.06, HF + 3.0), 0.06, 6));
  PB.add('camo', box(0.62, 0.1, 0.36, 0, DECK + 0.06, HF + 3.05));
  // the loaders' footplates either side of the breech's way down, from the pedestals to the platform
  for (const s of [-1, 1]) {
    PB.add('camo', box(0.42, 0.05, P0 - TZ - 0.85, s * 0.81, DECK - 0.025, (P0 + TZ + 0.85) / 2));
    for (let z = TZ + 1.1; z < P0; z += 0.5) PB.add('dark', box(0.4, 0.012, 0.02, s * 0.81, DECK + 0.006, z));
  }
  // the staff's hooks on the left railing
  {
    const SR = K12.STAFF_REST;
    for (const z of [SR.z + 0.7, SR.z + STAFF - 0.8]) {
      PB.add('dark', rod(V(-WX, SR.y - 0.08, z), V(SR.x + 0.02, SR.y - 0.08, z), 0.02, 5));
      PB.add('dark', rod(V(SR.x + 0.02, SR.y - 0.08, z), V(SR.x + 0.04, SR.y + 0.04, z), 0.016, 4));
    }
  }
  readyRack(PB, K12.RACK, DECK, { bag: 0.8, br: 0.11, case: 1.2, cr: 0.13 }, WX);
  // the platform: plate deck over the rear, the trolley's rails, the gate at the rear
  PB.add('camo', box(2 * WX, 0.08, HR - P0, 0, DECK - 0.04, (P0 + HR) / 2));
  PB.add('dark', box(2 * WX, 0.02, 0.06, 0, DECK + 0.005, P0 + 0.03));
  for (let z = P0 + 0.4; z < HR; z += 0.6) PB.add('dark', box(2 * WX - 0.1, 0.012, 0.02, 0, DECK + 0.006, z));
  for (const s of [-1, 1]) {
    PB.add('steel', box(0.07, 0.1, HR - 0.1 - P0, s * RAILX, DECK + 0.05, (P0 + HR - 0.1) / 2));
    PB.add('dark', box(0.16, 0.16, 0.16, s * RAILX, DECK + 0.08, HR - 0.2));
    railRun(s * WX, HR - 0.05, s * 0.62, HR - 0.05);
    PB.add('dark', box(0.1, 0.08, 2.0, s * RAILX, DECK - 0.2, P0 + 1.0)); // the bridge's housing
  }
  // the runway beam on its two portals, out over the wagon; a king post and tie over the rear portal
  {
    const z0 = PORTALS[0] - 0.6, z1 = ZPICK + 0.55;
    for (const pz of PORTALS) {
      for (const s of [-1, 1]) {
        PB.add('camo', box(0.18, BEAM + 0.3 - DECK, 0.22, s * 1.62, (BEAM + 0.3 + DECK) / 2, pz));
        PB.add('camo', rod(V(s * 1.62, BEAM - 0.5, pz), V(s * 1.0, BEAM + 0.2, pz), 0.05, 5)); // knee
      }
      PB.add('camo', box(3.42, 0.3, 0.24, 0, BEAM + 0.45, pz));
    }
    PB.add('dark', box(0.2, 0.025, z1 - z0, 0, BEAM + 0.012, (z0 + z1) / 2));
    PB.add('dark', box(0.025, 0.28, z1 - z0, 0, BEAM + 0.15, (z0 + z1) / 2));
    PB.add('dark', box(0.2, 0.025, z1 - z0, 0, BEAM + 0.29, (z0 + z1) / 2));
    PB.add('dark', box(0.22, 0.8, 0.22, 0, BEAM + 1.0, PORTALS[1]));
    PB.add('dark', rod(V(0, BEAM + 1.35, PORTALS[1]), V(0, BEAM + 0.3, z1 - 0.1), 0.028, 5));
    PB.add('dark', rod(V(0, BEAM + 1.35, PORTALS[1]), V(0, BEAM + 0.3, PORTALS[0]), 0.028, 5));
    PB.add('dark', box(0.3, 0.3, 0.06, 0, BEAM + 0.15, z1));
    // the winch on the rear portal's left leg
    const W = K12.WINCH;
    PB.add('camo', box(0.3, 0.5, 0.5, -1.62, W.y + 0.1, PORTALS[1] - 0.3));
    PB.add('iron', zTube(PORTALS[1] - 0.55, PORTALS[1] - 0.05, 0.13, 0.13, 16, -1.45, W.y + 0.4));
    PB.add('steel', xTube(-1.5, W.x, 0.03, 0.03, 8, W.y, W.z));
    PB.add('dark', rod(V(W.x, W.y, W.z), V(W.x, W.y + 0.2, W.z), 0.022, 5));
    PB.add('dark', xTube(W.x, W.x + 0.12, 0.02, 0.02, 6, W.y + 0.2, W.z));
    PB.add('rope', rod(V(-1.45, W.y + 0.55, PORTALS[1] - 0.3), V(-0.1, BEAM + 0.05, PORTALS[1] - 0.6), 0.012, 4));
  }
  // trunnion pedestals, the elevating gear, the layer's column, the traverse controller, the jacks' gauge
  for (const s of [-1, 1]) {
    PB.add('camo', box(0.44, TY - GT, 1.5, s * GX, (TY + GT) / 2, TZ));
    PB.add('camo', box(0.52, 0.16, 1.7, s * GX, GT + 0.08, TZ));
    PB.add('camo', rbox(0.52, 0.36, 1.0, 0.05, s * GX, TY + 0.1, TZ));
    PB.add('dark', rivetRow(V(s * (GX + 0.23), GT + 0.3, TZ - 0.65), V(s * (GX + 0.23), GT + 0.3, TZ + 0.65), 0.18, V(s, 0, 0), 0.022));
  }
  const AR = 1.9, aP = 92 * DEG, py = TY - AR * Math.sin(aP), pz = TZ + AR * Math.cos(aP), LZ = TZ + 1.6;
  PB.add('steel', xTube(-GX - 0.1, GX + 0.1, 0.06, 0.06, 10, py, pz));
  for (const s of [-1, 1]) PB.add('steel', xTube(s * 0.62 - 0.08, s * 0.62 + 0.08, 0.13, 0.13, 14, py, pz));
  PB.add('camo', rbox(0.3, 0.34, 0.36, 0.04, -GX - 0.2, py, pz));
  PB.add('steel', yTube(py, DECK + 0.95, 0.04, 0.04, 8, -GX - 0.22, pz));
  PB.add('camo', rbox(0.26, 0.3, 0.3, 0.04, -GX - 0.22, DECK + 1.0, pz));
  PB.add('steel', zTube(pz, LZ - 0.2, 0.035, 0.035, 8, -GX - 0.22, DECK + 1.0));
  PB.add('camo', box(0.2, 1.2, 0.2, -1.3, DECK + 0.6, LZ - 0.25));
  PB.add('camo', rbox(0.3, 0.3, 0.3, 0.04, -1.3, DECK + 1.05, LZ - 0.25));
  PB.add('steel', xTube(-1.3, -GX - 0.22, 0.03, 0.03, 8, DECK + 1.0, LZ - 0.22));
  PB.add('iron', handwheel(0.26, 6, 0.022, 0.05).rotateY(Math.PI / 2).translate(-1.3, DECK + 1.05, LZ));
  PB.add('camo', box(0.12, 0.3, 0.16, -1.3, DECK + 1.42, LZ - 0.3));
  PB.add('brass', yTube(DECK + 1.55, DECK + 1.62, 0.05, 0.05, 10, -1.3, LZ - 0.3));
  PB.add('dark', zTube(LZ - 0.32, LZ + 0.05, 0.03, 0.026, 8, -1.3, DECK + 1.58));
  PB.add('camo', rbox(0.4, 0.95, 0.4, 0.04, 1.35, DECK + 0.48, -4.4)); // the traverse motor's controller
  PB.add('iron', handwheel(0.16, 5, 0.018, 0.04).rotateZ(Math.PI / 2).translate(1.35, DECK + 1.0, -4.4));
  PB.add('brass', box(0.2, 0.12, 0.04, 1.35, DECK + 0.7, -4.18));
  PB.add('dark', box(0.05, 0.05, 9.0, GX + 0.09, GT - 0.6, -9.0));
  // the equilibrators' anchors on the girders ahead of the pedestals
  const EQ = { x: 0.82, ay: GT + 0.05, az: TZ - 8.6, ly: -0.62, lz: -4.2 };
  for (const s of [-1, 1]) {
    PB.add('camo', box(0.3, 0.3, 0.5, s * EQ.x, EQ.ay - 0.1, EQ.az));
    PB.add('steel', xTube(s * (EQ.x - 0.16), s * (EQ.x + 0.16), 0.08, 0.08, 10, EQ.ay, EQ.az));
  }
  PB.build(car, { dirt: 0.22, y0: 0 });

  // the traverse motors on the outer bogies' ends
  for (const b of [bogies[0], bogies[3]]) {
    const Q = mk(), e = b.group.position.z < 0 ? -1 : 1, half = ((e < 0 ? BOGF : BOGR).axles - 1) * 1.45 / 2 + 0.55;
    Q.add('camo', rbox(0.9, 0.55, 0.55, 0.06, 0, 1.0, e * (half + 0.15)));
    Q.add('dark', xTube(-0.5, 0.5, 0.2, 0.2, 14, 1.0, e * (half + 0.15)));
    Q.build(b.group, { dirt: 0.4, y0: RH });
  }

  // ================================================================ the cradle (elevation)
  const PE = mk();
  PE.add('camo', zTube(CR0, CR1, 0.52, 0.52, 32));
  for (const z of [CR0 + 0.05, -2.6, -0.6, CR1 - 0.05]) PE.add('steel', zTube(z - 0.045, z + 0.045, 0.56, 0.56, 32));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.48, s * 0.74, 0.34, 0.34, 22));
    PE.add('steel', xTube(s * 0.74, s * (GX - 0.05), 0.2, 0.2, 20));
    PE.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(s * 0.74, Math.sin((i * Math.PI) / 5) * 0.27, Math.cos((i * Math.PI) / 5) * 0.27)), V(s, 0, 0), 0.024));
    PE.add('camo', box(0.06, 0.5, CR1 - CR0 - 0.3, s * 0.52, 0, (CR0 + CR1) / 2));
    // the equilibrators' lugs under the cradle's front
    PE.add('camo', box(0.3, 0.36, 0.5, s * EQ.x, EQ.ly + 0.12, EQ.lz));
    PE.add('steel', xTube(s * (EQ.x - 0.16), s * (EQ.x + 0.16), 0.07, 0.07, 10, EQ.ly, EQ.lz));
  }
  const cyl = [[-0.3, 0.66, 0.14], [0.3, 0.66, 0.14], [0, -0.66, 0.17]];
  for (const [x, y, r] of cyl) {
    PE.add('camo', zTube(CR0 - 0.2, CR1 - 0.1, r, r, 16, x, y));
    PE.add('steel', zTube(CR0 - 0.28, CR0 - 0.14, r * 1.12, r * 1.12, 16, x, y));
    for (const z of [-3.2, -1.6, 0.0]) PE.add('steel', zTube(z - 0.035, z + 0.035, r * 1.14, r * 1.14, 14, x, y));
    for (const z of [-3.9, -2.2, -0.8, 0.9]) PE.add('camo', box(0.14, Math.abs(y) - 0.48 - r * 0.6, 0.2, x * 0.8, Math.sign(y) * (0.48 + (Math.abs(y) - 0.48 - r * 0.6) / 2), z));
  }
  for (const s of [-1, 1]) {
    PE.add('steel', gearArc(AR - 0.17, AR, 30 * DEG, 98 * DEG, 0.12, 34, 0.045).translate(s * 0.62, 0, 0));
    const web = [[0, -0.48], [AR * 0.7, -0.48]];
    for (let i = 0; i <= 8; i++) { const a = (30 + (68 * i) / 8) * DEG; web.push([(AR - 0.17) * Math.cos(a), -(AR - 0.17) * Math.sin(a)]); }
    PE.add('camo', sideProfile(web, 0.05, 0.004).translate(s * 0.62, 0, 0));
  }
  PE.build(elev, { dirt: 0.05, y0: TY });

  // the equilibrators: a long cylinder from its anchor on the girder and a ram from the cradle's lug, each a unit length
  // stretched between the two points every time the elevation changes (no allocation: the vectors are the module's)
  const eqMats = [rig.mats.camo, rig.mats.steel];
  const eqGeo = [new THREE.CylinderGeometry(0.15, 0.15, 1, 14).translate(0, 0.5, 0), new THREE.CylinderGeometry(0.075, 0.075, 1, 10).translate(0, 0.5, 0)];
  const eq = [-1, 1].map((s) => {
    const body = new THREE.Mesh(eqGeo[0], eqMats[0]), ram = new THREE.Mesh(eqGeo[1], eqMats[1]);
    body.name = ram.name = 'equilibrator';
    car.add(body, ram);
    return { a: new THREE.Vector3(s * EQ.x, EQ.ay, EQ.az), l: new THREE.Vector3(s * EQ.x, EQ.ly, EQ.lz), body, ram };
  });
  const EQLEN = 4.0; // the cylinder's length; the ram covers the rest
  const poseEq = () => {
    for (const q of eq) {
      _a.copy(q.a);
      _b.copy(q.l).applyEuler(elev.rotation).add(elev.position);
      const d = _b.distanceTo(_a);
      const dir = _b.sub(_a).normalize();
      q.body.position.copy(_a);
      q.body.quaternion.setFromUnitVectors(_up, dir);
      q.body.scale.set(1, Math.min(EQLEN, d - 0.2), 1);
      q.ram.position.copy(_a);
      q.ram.quaternion.copy(q.body.quaternion);
      q.ram.scale.set(1, d, 1);
    }
  };

  // ================================================================ the barrel and its truss (recoil), the wedge (breech)
  const PR = mk();
  const rAt = (z) => {
    if (z <= MUZ + 0.5) return 0.215;
    if (z <= -14) return 0.2 + (0.3 - 0.2) * (z - MUZ - 0.5) / (-14 - MUZ - 0.5);
    if (z <= CR0 - 0.4) return 0.3 + (0.38 - 0.3) * (z + 14) / (CR0 - 0.4 + 14);
    return 0.42;
  };
  const bp = [[MUZ, 0.1055], [MUZ, 0.215], [MUZ + 0.5, 0.215], [MUZ + 0.55, 0.2]];
  for (let i = 1; i <= 10; i++) { const z = MUZ + 0.55 + ((CR0 - 0.4 - MUZ - 0.55) * i) / 10; bp.push([z, rAt(z)]); }
  const S0 = BRE - 0.6, S1 = BRE - 0.05;
  bp.push([CR0 - 0.35, 0.42], [S0 - 0.3, 0.42], [S0 - 0.25, 0.45], [S0, 0.45], [S0, 0.1055], [MUZ + 0.01, 0.1055], [MUZ, 0.1055]);
  PR.add('iron', zLathe(bp, 36));
  PR.add('steel', zTube(CR0 - 0.3, CR1 + 0.5, 0.425, 0.425, 32, 0, 0, true), { tint: 0xa8aca8 });
  for (const z of [MUZ + 3, MUZ + 7.5, -14]) PR.add('iron', zTube(z - 0.03, z + 0.03, rAt(z) + 0.012, rAt(z) + 0.012, 28));
  PR.add('dark', zTube(MUZ + 0.002, MUZ + 0.9, 0.105, 0.105, 20, 0, 0, true));
  PR.add('dark', zTube(MUZ + 0.9, MUZ + 0.92, 0.105, 0.105, 20));
  PR.add('steel', zTube(MUZ - 0.003, MUZ + 0.004, 0.13, 0.215, 28, 0, 0, false));
  // the breech ring round the wedge's slot, open on the right
  PR.add('iron', box(0.92, 0.16, S1 - S0, 0, 0.38, (S0 + S1) / 2));
  PR.add('iron', box(0.92, 0.16, S1 - S0, 0, -0.38, (S0 + S1) / 2));
  PR.add('iron', box(0.14, 0.6, S1 - S0, -0.39, 0, (S0 + S1) / 2));
  PR.add('iron', zLathe([[S1, 0.1055], [S1, 0.46], [BRE - 0.03, 0.46], [BRE, 0.43], [BRE, 0.1055]], 32));
  PR.add('steel', zLathe([[BRE - 0.01, 0.12], [BRE - 0.01, 0.42], [BRE + 0.012, 0.42], [BRE + 0.012, 0.12], [BRE - 0.01, 0.12]], 32), { tint: 0xb0b0a8 });
  PR.add('dark', zTube(S1, BRE + 0.002, 0.1055, 0.1055, 20, 0, 0, true));
  for (const [x, y, r] of cyl) {
    PR.add('camo', box(Math.max(0.16, Math.abs(x) + 0.2), 0.16, 0.2, x / 2, y * 0.82, S0 - 0.45));
    PR.add('steel', zTube(CR1 - 0.15, S0 - 0.4, r * 0.34, r * 0.34, 8, x, y));
  }
  const CK = K12.CRANK;
  PR.add('camo', box(0.2, 0.18, 0.26, CK.x, CK.y - 0.12, BRE - 0.12));
  PR.add('steel', zTube(BRE - 0.1, CK.z, 0.03, 0.03, 8, CK.x, CK.y));
  PR.add('iron', handwheel(0.17, 5, 0.018, 0.04).rotateY(Math.PI / 2).translate(CK.x, CK.y, CK.z));
  PR.add('brass', box(0.12, 0.08, 0.06, K12.LOCK.x, K12.LOCK.y, BRE + 0.03));
  // the truss: a king post on a collar ahead of the cradle, a strut further out, paired stays from the post's head over
  // the strut to a clamp near the muzzle and back to an anchor block on the breech ring
  {
    const T = TRUSS;
    const collar = (z, r, l) => { PR.add('camo', zTube(z - l / 2, z + l / 2, r, r, 24)); for (const e of [-1, 1]) PR.add('dark', box(0.08, 0.1, l * 0.8, e * (r + 0.03), 0, z)); };
    const rP = rAt(T.post) + 0.06, rS = rAt(T.strut) + 0.05, rF = rAt(T.front) + 0.05;
    collar(T.post, rP, 0.6); collar(T.strut, rS, 0.4); collar(T.front, rF, 0.45);
    PR.add('camo', box(0.6, 0.14, 0.7, 0, rP + 0.02, T.post));
    const leg = (s, t) => V(s * (0.24 - 0.14 * t), rP + 0.08 + (T.ph - rP - 0.08) * t, T.post);
    for (const s of [-1, 1]) PR.add('camo', rod(leg(s, 0), leg(s, 1), 0.055, 6));
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8;
      PR.add('dark', rod(leg(-1, t0), leg(1, t1), 0.02, 4));
      PR.add('dark', rod(leg(1, t0), leg(-1, t1), 0.02, 4));
    }
    for (const fz of [-1, 1]) PR.add('camo', rod(V(0, rP + 0.1, T.post + fz * 0.35), V(0, T.ph * 0.45, T.post), 0.035, 4));
    PR.add('camo', box(0.36, 0.18, 0.44, 0, T.ph + 0.05, T.post));
    PR.add('camo', rod(V(0, rS, T.strut), V(0, T.sh, T.strut), 0.06, 8));
    PR.add('camo', box(0.32, 0.1, 0.26, 0, T.sh + 0.04, T.strut));
    for (const s of [-1, 1]) PR.add('dark', rod(V(s * 0.1, rS + 0.04, T.strut), V(0, T.sh * 0.55, T.strut), 0.022, 4));
    PR.add('camo', rbox(0.5, 0.26, 0.8, 0.04, 0, T.ay - 0.05, T.anchor)); // the anchor block on the ring
    const top = V(0, T.ph + 0.2, T.post), st = V(0, T.sh + 0.1, T.strut), fc = V(0, rF + 0.03, T.front), an = V(0, T.ay + 0.08, T.anchor);
    for (const x of [-0.09, 0.09]) {
      const o = V(x, 0, 0);
      for (const [a, b] of [[top, st], [st, fc], [top, an]]) {
        const A = a.clone().add(o), B = b.clone().add(o);
        PR.add('dark', rod(A, B, 0.03, 6));
        const m = A.clone().lerp(B, 0.5), d = B.clone().sub(A).normalize();
        PR.add('steel', rod(m.clone().addScaledVector(d, -0.25), m.clone().addScaledVector(d, 0.25), 0.05, 8));
      }
    }
  }
  PR.build(rec, { dirt: 0.03, y0: TY });
  const PW = mk();
  PW.add('camo', box(0.76, 0.6, 0.5, 0, 0, 0));
  PW.add('steel', box(0.74, 0.58, 0.02, 0, 0, 0.255));
  PW.add('steel', box(0.08, 0.24, 0.1, 0.36, 0, 0.12));
  PW.build(brc, { dirt: 0.03, y0: TY });

  // ================================================================ the loading gear
  const gear = loadingGear(rig, mk, { car: trol, bridge, crab, hoist, DECK, TY, SHELL, HANDLES: K12.HANDLES, RAILX, BRIDGE, BEAM, HANG, HOOK: K12.HOOK });

  // ---- anchors and setters
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, rec, 'post', 0, TRUSS.ph, TRUSS.post);
  anchor(rig, elev, 'tray', 0, 0, ZB - TZ);
  anchor(rig, car, 'eye', 0, TY + 0.4, TZ);
  anchor(rig, base, 'shellStack', 0, WAGON_Y, ZPICK);
  rig.breechOpen = { axis: 'x', angle: WEDGE };
  rig.setBreech = (k) => { brc.position.x = Math.min(1, Math.max(0, k)) * WEDGE; };
  rig.setTraverse = (az) => { trav.rotation.y = az; roll(az); };
  // the jacks follow the elevation: the carriage goes up as the gun is raised past 28 degrees, and is down to load
  rig.setElevation = (r) => { elev.rotation.x = r; lift.position.y = jackAt(r); poseEq(); };
  rig.jackAt = jackAt;
  // the carriage's run back on its subframes (render/guns.js carPose * carRoll); the men on it ride along
  rig.carRoll = RUN;
  rig.carYaw = () => trav.rotation.y;
  rig.setCar = (z) => { car.position.z = z; };
  rig.recoilFade = (el) => {
    if (el <= 0.05) return 1;
    const room = (TY + jackAt(el) - 1.2 - 0.45 * Math.cos(el)) / Math.sin(el) - BRE;
    return Math.min(1, Math.max(0.3, room / RECOIL));
  };
  rig.update = () => gear.update();
  rig.setElevation(0);
  rig.update();

  // hit boxes (base frame at az = 0, the carriage lowered)
  const bx = -SAG;
  hb(rig, bx - 1.5, 0.4, HF - BUF, bx + 1.5, GT, HR + BUF);
  hb(rig, bx - 0.5, TY - 0.5, TZ + MUZ, bx + 0.5, TY + TRUSS.ph + 0.3, TZ + BRE);
  hb(rig, bx - 1.8, DECK, PORTALS[0] - 0.2, bx + 1.8, BEAM + 0.5, PORTALS[1] + 0.2);
  hb(rig, bx - 1.4, 0.5, WZ - WAGON.len / 2, bx + 1.4, 2.4, WZ + WAGON.len / 2);

  // ---- crew spots (root frame at az = 0: the carriage frame shifted by -SAG; y = the floor). The men on the carriage
  // ride its run back and its jacks (`car`); the slinger on the wagon, the jack man at the pump and the telephonist on
  // the ground do not. The list order is the order the men fall out (the last first).
  const E = -Math.PI / 2, Wd = Math.PI / 2, N = 0;
  const spot = (role, x, y, z, h, pose) => crewSpot(rig, role, bx + x, y, z, h, pose);
  spot('chief', -1.32, DECK, -5.5, E, 'point');
  spot('layer', -1.3, DECK, LZ + 0.5, N, 'lay');
  spot('traverser', 1.35, DECK, -3.6, N, 'operate');
  spot('lanyard', 0.95, DECK, TZ + 1.05, 0.9, 'lanyard');
  spot('rammer1', K12.TAKE_X, DECK, K12.STAFF_REST.z + K12.RAM_OFF[0], N, 'stand');
  spot('rammer2', WX - 0.35, DECK, K12.RACK.z + 2.5, E, 'stand');
  spot('car1', K12.CAR_LANE, DECK, ZWAIT + K12.HANDLES[0], Wd, 'stand');
  spot('car2', K12.CAR_LANE, DECK, ZWAIT + K12.HANDLES[1], Wd, 'stand');
  spot('charge1', WX - 0.28, DECK, K12.RACK.z - 1.3, E, 'stand');
  spot('charge2', WX - 0.28, DECK, K12.RACK.z + 1.3, E, 'stand');
  spot('hoist', K12.WINCH.x + 0.35, DECK, K12.WINCH.z - 0.1, Wd, 'operate');
  spot('sling', -0.72, RH + WAGON.deck, ZPICK + 0.1, E, 'stand');
  spot('jack', -2.15, 0, -GZ + 3.2, E, 'operate');
  spot('rammer3', K12.TAKE_X, DECK, K12.STAFF_REST.z + K12.RAM_OFF[1], N, 'stand');
  spot('rammer4', WX - 0.35, DECK, K12.RACK.z + 3.4, E, 'stand');
  spot('phone', 2.6, 0, -2.0, Wd, 'phone');
  for (const c of rig.anchors.crew) c.car = !['sling', 'jack', 'phone'].includes(c.role);
  return finishGun(rig);
}
const L_PAD = 3.0;

// ==================================================================== the position
// buildK12Site(seed, { trackOnly }) -> { root }: the firing spur round the gun in the rig's frame at zero traverse (ground y = 0, the
// piece's place at the origin, -Z the zero line): the curved track (radius R about (-R, 0, 0)) for the +-12 degrees and
// the gun's and the wagon's length beyond, with its guard rail, the straight lead it is shunted along, a parallel siding
// with the battery's train (the next ammunition wagons and the charges' van) under a net, the meteorological section's
// hut with its balloon theodolite (a gun firing 100 km needs the winds aloft), the command post and the charge store.
// trackOnly: just the track under the gun and its wagon at zero traverse (for a parade ground).
export function buildK12Site(seed = 1, { trackOnly = false } = {}) {
  const rnd = mulberry32(seed * 7919 + 21);
  const M = siteMats('dgrau');
  const root = new THREE.Group();
  root.name = 'k12-site';
  const P = new Parts(M), PN = new Parts(M);
  const A = 12 * DEG, ext = (-HF + 13) / R, extB = (WZ + WAGON.len / 2 + 2) / R;
  if (trackOnly) {
    // the track under the gun and its wagon at zero traverse alone (the menu hangar's parade ground)
    layTrack(P, arcPoints(R, -extB, ext, 1.0), { bed: 3.8, foot: 1.0 });
    P.build(root, { dirt: 0.2 });
    root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { root };
  }
  const curve = arcPoints(R, -A - extB, A + ext, 1.0);
  const lead = straightBack(curve[0], 45, 1.5);
  layTrack(P, [...lead, ...curve], { bed: 3.8, foot: 1.0 });
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1], u = -GA + 0.3;
    const ax = a.x + Math.cos(a.a) * u, az = a.z - Math.sin(a.a) * u, bx = b.x + Math.cos(b.a) * u, bz = b.z - Math.sin(b.a) * u;
    P.add('dark', box(0.06, 0.1, Math.hypot(bx - ax, bz - az) + 0.01, (ax + bx) / 2, RH - 0.05, (az + bz) / 2, 0, Math.atan2(-(bx - ax), -(bz - az)), 0));
  }
  {
    const e = curve[curve.length - 1], c = Math.cos(e.a), s = Math.sin(e.a), fx = -s, fz = -c;
    const x = e.x + fx * 0.5, z = e.z + fz * 0.5;
    P.add('timber', box(3.0, 0.5, 0.4, x, RH + 0.5, z, 0, e.a, 0));
    for (const u of [-0.9, 0.9]) P.add('dark', rod(V(x + c * u - fx * 1.6, RH, z - s * u - fz * 1.6), V(x + c * u, RH + 0.6, z - s * u), 0.06, 6));
  }
  // the siding with the battery's train under its net
  {
    const L0 = lead[0], c = Math.cos(L0.a), s = Math.sin(L0.a);
    const along = (d, u) => ({ x: L0.x - Math.sin(L0.a) * d + c * u, z: L0.z - Math.cos(L0.a) * d - s * u });
    const sp = [];
    for (let d = 0; d <= 42; d += 1.5) { const p = along(d, 8); sp.push({ x: p.x, z: p.z, a: L0.a }); }
    layTrack(P, sp, { bed: 3.4, foot: 0.9 });
    const place = (d, build) => {
      const g = new THREE.Group(), p = along(d, 8);
      g.position.set(p.x, RH, p.z);
      g.rotation.y = L0.a;
      const Q = new Parts(M);
      build(Q);
      Q.build(g, { dirt: 0.35, y0: RH });
      root.add(g);
    };
    for (const d of [8, 16.5]) place(d, (Q) => ammoWagonParts(Q, { shell: SHELL, rounds: [-1.6, -0.2, 1.2].flatMap((z) => [{ x: -0.6, z }, { x: 0, z }, { x: 0.6, z }]), charge: { len: 1.2, rad: 0.13 } }));
    place(26, (Q) => {
      ammoWagonParts(Q, {});
      Q.add('camo', box(2.7, 2.2, 7.4, 0, WAGON.deck + 1.1, 0));
      Q.add('camo', box(2.9, 0.12, 7.6, 0, WAGON.deck + 2.25, 0));
      Q.add('dark', box(0.04, 1.8, 1.6, 1.37, WAGON.deck + 0.95, 0));
    });
    const c0 = along(3.5, 8), c1 = along(30.5, 8), mx = (c0.x + c1.x) / 2, mz = (c0.z + c1.z) / 2, len = Math.hypot(c1.x - c0.x, c1.z - c0.z);
    const g = new THREE.Group();
    g.position.set(mx, 0, mz);
    g.rotation.y = L0.a;
    const Q = new Parts(M);
    for (let d = -len / 2; d <= len / 2 + 0.1; d += len / 4) for (const u of [-3.6, 3.6]) Q.add('timber', yTube(0, 4.4, 0.06, 0.05, 6, u, d));
    Q.add('net', drapeNet(-3.6, 3.6, -len / 2, len / 2, () => 4.6, rnd));
    Q.build(g, { dirt: 0 });
    root.add(g);
  }
  const earthG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); P.add('earth', n); };
  // the command post
  {
    const x = 24, z = 4;
    P.add('timber', box(4.5, 2.0, 3.5, x, 1.0, z));
    earthG(box(6.5, 1.0, 5.5, x, 2.4, z));
    P.add('dark', box(1.0, 1.8, 0.08, x - 1.2, 0.9, z - 1.78));
    for (let i = 1; i < 5; i++) { P.add('timber', yTube(0, 5.0, 0.09, 0.07, 7, x + i * 7, z - i * 5)); P.add('timber', box(0.8, 0.07, 0.07, x + i * 7, 4.8, z - i * 5)); }
  }
  // the meteorological section: its hut, the balloon theodolite on its tripod, a hydrogen cylinder rack
  {
    const x = 20, z = -18;
    P.add('timber', box(3.6, 2.3, 3.0, x, 1.15, z));
    P.add('cloth', box(4.0, 0.08, 3.4, x, 2.4, z), { tint: 0x6a6658 });
    P.add('dark', box(0.9, 1.8, 0.06, x - 0.8, 0.9, z - 1.52));
    const tx = x - 3.5, tz = z - 3;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; P.add('timber', rod(V(tx + Math.cos(a) * 0.5, 0, tz + Math.sin(a) * 0.5), V(tx, 1.3, tz), 0.025, 5)); }
    P.add('dark', box(0.25, 0.2, 0.3, tx, 1.42, tz));
    P.add('brass', zTube(tz - 0.25, tz + 0.15, 0.05, 0.06, 10, tx, 1.58));
    for (let i = 0; i < 5; i++) P.add('steel', yTube(0, 1.5, 0.11, 0.11, 10, x + 2.4, z - 1.0 + i * 0.28), { tint: 0x6c7a5a });
  }
  // the charge store under its net
  {
    const x = -16, z = 22;
    for (let k = 0; k < 4; k++) earthG(box(7 - k * 0.3, 0.32, 0.6, x, 0.16 + k * 0.32, z - 2.8));
    for (let k = 0; k < 4; k++) earthG(box(7 - k * 0.3, 0.32, 0.6, x, 0.16 + k * 0.32, z + 2.8));
    P.add('timber', box(7.2, 0.2, 6.4, x, 1.45, z));
    earthG(box(7.6, 0.6, 6.8, x, 1.85, z));
    for (let i = 0; i < 8; i++) P.add('brass', zTube(z - 1.0, z + 0.2, 0.13, 0.13, 14, x + 4.2 + (i % 4) * 0.3, 0.13 + Math.floor(i / 4) * 0.26));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('timber', yTube(0, 3.6, 0.06, 0.05, 6, x + 1 + sx * 5.5, z + sz * 4.5));
    PN.add('net', drapeNet(x - 4.5, x + 6.5, z - 4.5, z + 4.5, () => 3.8, rnd));
  }
  P.build(root, { dirt: 0.2 });
  PN.build(root, { dirt: 0 });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== M.net; o.receiveShadow = true; } });
  return { root };
}

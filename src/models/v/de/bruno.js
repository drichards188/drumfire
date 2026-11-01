import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, handwheel, gearArc, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, pivotAt, hb, node } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { RH, GA, sagitta, trackX, trackYaw, curveBogie, ammoWagonParts, WAGON, arcPoints, straightBack, layTrack, siteMats, drapeNet, loadingGear, readyRack } from './railway_kit.js';

// 28 cm Kurze Bruno K (E) (Krupp, 1937): the first of the 1930s railway guns, a 28 cm naval gun (L/42, 11.9 m) in a
// cradle on a box-girder car carried by two five-axle bogies, 22.8 m over buffers, 129 t in action (Hogg, German
// Artillery of World War II; historyofwar.org; armedconflicts.com). The mount turns about a degree: the gun is laid for
// line by where it stands on a curved firing spur, and fired from the track; a shelter over the rear platform kept the
// loading crew and the ready charges out of the weather (historyofwar.org). No drawing was found: the girders' depth and
// fish belly, the trunnions' height and station, the shelter, the platform's runway beam and crab that take the shell
// off the ammunition wagon coupled behind, the loading trolley and its bridge, the 5.5 m staff, the elevating arcs and
// the handwheels are game estimates [E] in the manner of the WW1 Bruno and the K5's photographs.
//
// Frames (rig root: the ground y = 0, the piece's place at the origin, the track through it heading -Z). The traverse
// pivot is the firing curve's centre (-R, 0, 0) and the gun hangs from it in `gun` (+R, 0, 0), the Gustav's rule
// (railway_kit.js): setTraverse(az) runs the whole gun along the curve, the bogies turning with the tangent and the
// wheels rolling. The straight body stands on the chord between its bogies in `body` (x = -s inside `gun`): body frame
// z along the car (the car's middle z = 0, + = back), x across, y from the ground. Inside it:
//   elevation  at the trunnions (TY, TZ): the cradle, its recoil cylinders, the elevating arcs
//   recoil     the barrel (z MUZ to BRE from the trunnions), 1.4 m stroke
//   breech     the horizontal sliding wedge: setBreech(k) slides it WEDGE to the right
//   trolley    the loading trolley on the platform's rails (position.z = the shell's middle on it; origin at bore height)
//   crab       the runway beam's crab (position.z); hoist the hook block under it (position.y = the hook's height)
//   tray       the trolley rails' bridge to the breech: setTray(k) runs it back under the platform (1) or out to the
//              breech (0), from render/guns.js's loading pose
// loadEl 0 (loaded level). render/de/bruno.js drives the trolley, the crab and the hook through the loading steps.

export const R = 120; // the firing curve's radius [E]: +-14 degrees run the gun about 29 m either way along it
const GZ = 7.3; // the bogie centres (+-)
const SAG = sagitta(R, GZ);
const BOG = { axles: 5, pitch: 1.45, wr: 0.5, top: 1.3, fx: 0.95 };
const HALF = 11.0, BUF = 11.4; // the headstocks, the buffer faces (22.8 m over buffers)
const GX = 0.95; // the side girders' webs
const GT = 3.05; // the girders' top
const DECK = 3.1; // the walkways and the platform
const WX = 1.9; // the walkways' outer edge and the railings (folding leaves let down for firing [E])
const TY = 4.3, TZ = -2.0; // the trunnions
const BRE = 3.1, MUZ = BRE - 11.9; // the barrel's breech face and muzzle along the bore from the trunnions
const CR0 = -3.0, CR1 = 1.3; // the cradle sleeve (elevation frame)
const RECOIL = 1.4;
const WEDGE = 0.66;
const SHELL = { len: 1.2, rad: 0.1415 }; // 28 cm Sprenggranate L/4.2, 240 kg [E length]
const P0 = 3.0; // the platform's front edge
const SH0 = 6.6; // the shelter's open front
const ROOF = 5.45; // the shelter's walls' top (the roof arches 0.45 m over)
const RAILX = 0.42; // the trolley's rails
const ZB = TZ + BRE + 0.1 + SHELL.len / 2; // the trolley at the breech: the shell's middle
const ZWAIT = 9.0; // the trolley's waiting place, under the crab's drop
const BRIDGE = [TZ + BRE + 0.15, P0]; // the rails' bridge forward of the platform, deployed
// the ammunition wagon coupled behind on the curve, and the shell picked off it (on the car's axis)
const WZ = BUF + 0.4 + WAGON.len / 2 + 0.4, ZPICK = WZ - WAGON.len / 2 + 0.9;
const BEAM = 5.25; // the runway beam's underside
const HANG = 0.5; // the shell's middle below the hook
const WAGON_Y = RH + WAGON.deck + 0.08 + SHELL.rad; // the shell's middle on the wagon
const STAFF = 5.0;

// the drill's places (render/de/bruno.js through rail_drill_de.js), body frame at zero elevation
export const BRUNO = {
  R, SAG, TY, TZ, BRE: TZ + BRE, DECK, ZB, ZWAIT, ZPICK, HANG, WAGON_Y, RAILX, SHELL, STAFF, P0, SH0, WX,
  HOOK: { up: 4.85, down: WAGON_Y + HANG, set: TY + HANG },
  SEAT: TZ + BRE - 1.25 - SHELL.len / 2, // the shell's middle rammed home: its base 1.25 m inside, the charge behind it
  RACK: { x: 1.75, y: DECK + 0.8, z: 3.95 }, // the next charge on the ready rack's top shelf, on the right railing at the platform's front
  STAFF_REST: { x: -1.74, y: DECK + 0.88, z: 2.3 }, // the staff's head on its hooks along the left walkway's railing
  LOCK: { x: 0.3, y: 0.3, z: BRE + 0.05 }, // the firing lock on the breech face, right of the bore (recoil frame)
  CRANK: { x: 0.25, y: 0.62, z: BRE + 0.1 }, // the wedge's handwheel on top of the breech ring (recoil frame)
  HANDLES: [-0.2, 0.55], // the trolley's push handles (trolley frame z; x 0.5, y -0.55)
  RAIL_TOP: { x: -0.34, dy: -SHELL.rad - 0.04 }, // the trolley's side rail (trolley frame)
  WINCH: { x: -1.25, y: DECK + 1.1, z: HALF - 0.32, axis: 'z' }, // the hoist winch's crank (its arm's pivot) on the rear wall, left of the opening
  ASIDE: [[-1.62, 0.55], [-1.62, 1.35]], // the trolley men out of the rammers' way, at the front of the left walkway
  CAR_LANE: -0.88, CHG_X: 1.25, LANE: 0.98, TAKE_X: -1.38, BAR: 0.76, RAM_OFF: [2.2, 3.1],
  WRENCH: { x: 0.42, dz: 0.33 }, PRIME: { x: 0.8, dz: 0.42 }, LAN_IN: 0.92, LAN_OUT: 1.42,
  wagonYaw: trackYaw(R, WZ), // the wagon stands on the curve, turned from the car's axis
};

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

export function buildBruno() {
  const rig = newGunRig('bruno', 'dgrau');
  const root = rig.root;
  const mk = () => new Parts(rig.mats);
  const trav = pivotAt(rig, root, 'traverse', -R, 0, 0);
  const gun = node(trav, 'gun', R, 0, 0);
  const body = node(gun, 'body', -SAG, 0, 0);
  const elev = pivotAt(rig, body, 'elevation', 0, TY, TZ);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', 0, 0, BRE - 0.32);
  const car = pivotAt(rig, body, 'trolley', 0, TY, ZWAIT);
  const crab = pivotAt(rig, body, 'crab', 0, BEAM, ZPICK);
  const hoist = pivotAt(rig, body, 'hoist', 0, BRUNO.HOOK.up, ZPICK);
  const bridge = pivotAt(rig, body, 'tray', 0, 0, 0);
  rig.curveR = R;
  rig.railHead = RH;
  rig.recoilLength = RECOIL;
  rig.loadEl = 0;
  rig.staffLen = STAFF;
  rig.hoistRange = { up: BRUNO.HOOK.up, down: BRUNO.HOOK.down };
  rig.hoistHang = HANG;
  rig.trolleyRange = { breech: ZB, wait: ZWAIT };
  rig.rail = { ...BRUNO, bodyX: -SAG, jack: () => 0, run: () => 0 };

  // ================================================================ bogies (on the curve) and the wagon behind
  const bogies = [];
  for (const z of [-GZ, GZ]) bogies.push(curveBogie(gun, rig.mats, BOG, -SAG + trackX(R, GZ, z), RH, z, trackYaw(R, z), 'bogie'));
  // the wheels roll as the gun runs along its curve
  let lastAz = NaN;
  const roll = (az) => { if (az === lastAz) return; lastAz = az; for (const b of bogies) b.turn(-(az * R) / BOG.wr); };
  roll(0);
  // the ammunition wagon coupled behind, on the curve; its leading round lies under the crab's pick-up on the car's axis
  {
    const g = new THREE.Group(), wx = trackX(R, GZ, WZ), wa = trackYaw(R, WZ);
    g.name = 'ammo-wagon';
    g.position.set(wx, RH, WZ);
    g.rotation.y = wa;
    body.add(g);
    // the body frame's (0, ZPICK) in the wagon's frame
    const dx = 0 - wx, dz = ZPICK - WZ, c = Math.cos(wa), s = Math.sin(wa);
    const px = dx * c - dz * s, pz = dx * s + dz * c;
    const Q = mk();
    ammoWagonParts(Q, { shell: SHELL, rounds: [{ x: px, z: pz + 1.6 }, { x: px - 1.24, z: pz + 1.6 }, { x: px - 0.62, z: pz + 3.2 }], charge: { len: 0.95, rad: 0.17 } });
    Q.build(g, { dirt: 0.35, y0: RH });
  }

  // ================================================================ the body: girders, ends, walkways, platform
  const PB = mk();
  // the side girders: shallow over the bogies, a deep fish belly between them (the breech dips into the gap at high
  // angles, between the girders)
  const gp = [[-HALF, GT], [HALF, GT], [HALF, 1.95], [4.7, 1.95], [3.5, 1.05], [-3.5, 1.05], [-4.7, 1.95], [-HALF, 1.95]];
  for (const s of [-1, 1]) {
    PB.add('camo', sideProfile(gp, 0.1, 0.008).translate(s * GX, 0, 0));
    PB.add('dark', rivetPoly(gp, (z, y) => V(s * (GX + 0.055), y, z), 0.08, 0.24, V(s, 0, 0), 0.022));
    // flanges along the top and bottom edges
    PB.add('camo', box(0.36, 0.05, 2 * HALF, s * GX, GT - 0.025, 0));
    for (const [z0, y0, z1, y1] of [[-HALF, 1.95, -4.7, 1.95], [-4.7, 1.95, -3.5, 1.05], [-3.5, 1.05, 3.5, 1.05], [3.5, 1.05, 4.7, 1.95], [4.7, 1.95, HALF, 1.95]]) PB.add('camo', bar(z0, y0 + 0.025, z1, y1 + 0.025, 0.34, 0.05, s * GX));
    // vertical stiffeners on the outer face
    for (let z = -10.4; z <= 10.41; z += 0.85) {
      if (Math.abs(z - TZ) < 0.7) continue;
      const top = polyY(gp, z, Math.max), bot = polyY(gp, z, Math.min);
      PB.add('camo', box(0.04, top - bot - 0.12, 0.1, s * (GX + 0.07), (top + bot) / 2, z));
    }
    // the girders' lightening holes in the belly, dark through the web
    for (const z of [-2.4, -0.9, 0.6, 2.1]) if (Math.abs(z - TZ) > 0.6) PB.add('dark', new THREE.CylinderGeometry(0.26, 0.26, 0.11, 18).rotateZ(Math.PI / 2).scale(1, 0.85, 1.25).translate(s * GX, 1.75, z));
    // the bearers on the bogie pivots
    PB.add('camo', box(0.5, 0.18, 1.0, s * 0.62, 1.86, -GZ));
    PB.add('camo', box(0.5, 0.18, 1.0, s * 0.62, 1.86, GZ));
  }
  // the body's bolsters over the bogies (the pivot's upper half) and cross girders; none under the trunnions, where the
  // breech dips between the girders
  for (const z of [-GZ, GZ]) {
    PB.add('camo', box(2 * GX, 0.6, 1.1, 0, 2.15, z));
    PB.add('dark', yTube(1.78, 1.86, 0.4, 0.4, 18, 0, z));
  }
  for (const z of [-10.6, -9.2, -5.4, 5.4, 10.6]) PB.add('camo', box(2 * GX, 0.5, 0.14, 0, GT - 0.3, z));
  // the headstocks, buffers, coupling hooks and screw couplings
  for (const e of [-1, 1]) {
    const z = e * HALF;
    PB.add('camo', box(2.9, 0.62, 0.24, 0, 2.2, z + e * 0.12));
    PB.add('dark', rivetRow(V(-1.35, 2.42, z + e * 0.245), V(1.35, 2.42, z + e * 0.245), 0.2, V(0, 0, e), 0.022));
    for (const x of [-0.88, 0.88]) {
      PB.add('camo', zTube(z + e * 0.24, z + e * 0.42, 0.15, 0.15, 14, x, 2.12));
      PB.add('steel', zTube(z + e * 0.3, z + e * 0.4, 0.07, 0.07, 10, x, 2.12));
      PB.add('steel', zTube(z + e * 0.36, z + e * (BUF - HALF), 0.21, 0.21, 22, x, 2.12));
    }
    PB.add('dark', box(0.2, 0.18, 0.3, 0, 2.05, z + e * 0.35));
    PB.add('dark', rod(V(0, 2.05, z + e * 0.48), V(0, 1.9, z + e * 0.75), 0.03, 6));
    // steps and handrails at the corners, up to the walkways
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) PB.add('dark', box(0.5, 0.04, 0.24, s * (WX - 0.2), 1.0 + k * 0.62, z - e * 0.3));
      for (const dx of [-0.24, 0.24]) PB.add('dark', rod(V(s * (WX - 0.2) + dx, 0.95, z - e * 0.38), V(s * (WX - 0.2) + dx, GT, z - e * 0.38), 0.018, 4));
      PB.add('dark', rod(V(s * (WX + 0.03), DECK + 0.1, z - e * 0.15), V(s * (WX + 0.03), 1.4, z - e * 0.15), 0.02, 5));
    }
  }
  // walkways outside the girders: planks on brackets, the railings with a gap at the corner steps
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
    plank(s * (GX + 0.17), s * WX, -HALF + 0.05, P0);
    for (let z = -10.5; z < P0; z += 1.5) PB.add('camo', rod(V(s * (GX + 0.06), GT - 0.5, z), V(s * (WX - 0.05), DECK - 0.07, z), 0.03, 5));
    railRun(s * WX, -HALF + 0.55, s * WX, -0.2 + TZ - 0.8);
    railRun(s * WX, TZ + 1.0, s * WX, SH0);
  }
  railRun(-WX, -HALF + 0.05, WX, -HALF + 0.05);
  // the front deck between the girders, the barrel's travelling crutch folded down on it
  PB.add('camo', box(2 * GX - 0.1, 0.06, 2.4, 0, DECK - 0.03, -HALF + 1.25));
  for (const s of [-1, 1]) PB.add('camo', rod(V(s * 0.7, DECK + 0.06, -10.6), V(s * 0.2, DECK + 0.06, -8.9), 0.06, 6));
  PB.add('camo', box(0.62, 0.1, 0.36, 0, DECK + 0.06, -8.85));
  // the loaders' footplates either side of the breech's way down between the girders, from the pedestals to the platform
  for (const s of [-1, 1]) {
    PB.add('camo', box(0.42, 0.05, P0 - TZ - 0.8, s * 0.81, DECK - 0.025, (P0 + TZ + 0.8) / 2));
    for (let z = TZ + 1.1; z < P0; z += 0.5) PB.add('dark', box(0.4, 0.012, 0.02, s * 0.81, DECK + 0.006, z));
  }
  // the rammer staff's hooks on the left railing
  {
    const SR = BRUNO.STAFF_REST;
    for (const z of [SR.z + 0.7, SR.z + STAFF - 0.8]) {
      PB.add('dark', rod(V(-WX, SR.y - 0.08, z), V(SR.x + 0.02, SR.y - 0.08, z), 0.02, 5));
      PB.add('dark', rod(V(SR.x + 0.02, SR.y - 0.08, z), V(SR.x + 0.04, SR.y + 0.04, z), 0.016, 4));
    }
  }
  // the ready rack at the platform's front right: two frames, the top shelf for the next charge, a spare below
  readyRack(PB, BRUNO.RACK, DECK, { bag: 0.6, br: 0.13, case: 0.8, cr: 0.15 }, WX);
  // the platform: plate deck over the rear between and beyond the girders, the trolley's rails on it, a gate at the rear
  PB.add('camo', box(2 * WX, 0.08, HALF - P0, 0, DECK - 0.04, (P0 + HALF) / 2));
  PB.add('dark', box(2 * WX, 0.02, 0.06, 0, DECK + 0.005, P0 + 0.03)); // the deck's front edge
  for (let z = P0 + 0.4; z < HALF; z += 0.6) PB.add('dark', box(2 * WX - 0.1, 0.012, 0.02, 0, DECK + 0.006, z)); // tread bars
  for (const s of [-1, 1]) {
    PB.add('steel', box(0.07, 0.1, HALF - 0.1 - P0, s * RAILX, DECK + 0.05, (P0 + HALF - 0.1) / 2));
    PB.add('dark', box(0.16, 0.16, 0.16, s * RAILX, DECK + 0.08, HALF - 0.2)); // the stops
    railRun(s * WX, HALF - 0.05, s * 0.62, HALF - 0.05);
  }

  // ---- the shelter over the rear of the platform: plate walls with lookout slots, an arched roof, the rear wall open
  // in the middle where the shell comes in off the crab
  {
    const L = HALF - SH0, zc = (SH0 + HALF) / 2, H = ROOF - DECK;
    for (const s of [-1, 1]) {
      // the side wall in three panels round two window slots, riveted to angle posts
      PB.add('camo', box(0.05, 1.15, L, s * WX, DECK + 0.575, zc));
      PB.add('camo', box(0.05, H - 1.65, L, s * WX, ROOF - (H - 1.65) / 2, zc));
      for (const [a, b] of [[SH0, SH0 + 0.6], [SH0 + 1.6, SH0 + 2.6], [HALF - 0.6, HALF]]) PB.add('camo', box(0.05, 0.5, b - a, s * WX, DECK + 1.4, (a + b) / 2));
      for (const z of [SH0, SH0 + 1.1, SH0 + 2.6, HALF - 0.1]) PB.add('dark', box(0.05, H, 0.1, s * (WX - 0.02), DECK + H / 2, z));
      PB.add('dark', rivetRow(V(s * (WX + 0.03), DECK + 0.1, SH0 + 0.1), V(s * (WX + 0.03), DECK + 0.1, HALF - 0.1), 0.2, V(s, 0, 0), 0.018));
      PB.add('dark', rivetRow(V(s * (WX + 0.03), ROOF - 0.08, SH0 + 0.1), V(s * (WX + 0.03), ROOF - 0.08, HALF - 0.1), 0.2, V(s, 0, 0), 0.018));
      // the rear wall's two halves either side of the opening, the door frame
      PB.add('camo', box(WX - 0.62, H, 0.05, s * (WX + 0.62) / 2, DECK + H / 2, HALF - 0.03));
      PB.add('dark', box(0.08, H, 0.1, s * 0.62, DECK + H / 2, HALF - 0.05));
    }
    PB.add('camo', box(1.24, 0.3, 0.05, 0, ROOF - 0.15, HALF - 0.03)); // the lintel
    // the roof: an arch of plates over bows
    const n = 10, arcH = 0.45;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (Math.PI * i) / n, a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / n;
      const x0 = Math.sin(a0) * (WX + 0.08), y0 = ROOF + Math.cos(a0) * arcH, x1 = Math.sin(a1) * (WX + 0.08), y1 = ROOF + Math.cos(a1) * arcH;
      PB.add('camo', box(Math.hypot(x1 - x0, y1 - y0) + 0.01, 0.04, L + 0.3, (x0 + x1) / 2, (y0 + y1) / 2, zc + 0.05, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
    }
    for (const z of [SH0 - 0.05, HALF + 0.1]) PB.add('dark', box(2 * WX + 0.2, 0.08, 0.06, 0, ROOF + 0.02, z));
    // a stove pipe and a lamp
    PB.add('dark', yTube(ROOF + 0.3, ROOF + 1.0, 0.07, 0.07, 10, -0.9, HALF - 1.0));
    PB.add('dark', yTube(ROOF + 1.0, ROOF + 1.08, 0.12, 0.09, 10, -0.9, HALF - 1.0));
    // the hoist's winch on the rear wall, left of the opening: a drum, its gearing and the crank; the wire up to the beam
    const W = BRUNO.WINCH;
    const dx = W.x + 0.3;
    PB.add('camo', box(0.5, 0.5, 0.22, dx, W.y + 0.1, HALF - 0.14));
    PB.add('iron', xTube(dx - 0.22, dx + 0.22, 0.13, 0.13, 16, W.y + 0.45, HALF - 0.2));
    PB.add('rope', xTube(dx - 0.2, dx + 0.2, 0.14, 0.14, 16, W.y + 0.45, HALF - 0.2));
    PB.add('steel', zTube(HALF - 0.3, W.z, 0.03, 0.03, 8, W.x, W.y));
    PB.add('dark', rod(V(W.x, W.y, W.z), V(W.x, W.y + 0.2, W.z), 0.022, 5));
    PB.add('dark', zTube(W.z - 0.12, W.z, 0.02, 0.02, 6, W.x, W.y + 0.2));
    PB.add('rope', rod(V(dx + 0.1, W.y + 0.58, HALF - 0.2), V(0.05, BEAM + 0.05, HALF - 0.6), 0.012, 4));
    // the telephone box at the front of the left wall
    PB.add('dark', box(0.2, 0.28, 0.14, -WX + 0.08, DECK + 1.4, SH0 + 0.4));
  }
  // ---- the runway beam: from inside the shelter's roof out over the wagon, a king post over the rear wall and tie rods
  {
    const z0 = 6.9, z1 = ZPICK + 0.55;
    PB.add('dark', box(0.2, 0.025, z1 - z0, 0, BEAM + 0.012, (z0 + z1) / 2)); // bottom flange (the crab runs on it)
    PB.add('dark', box(0.025, 0.26, z1 - z0, 0, BEAM + 0.15, (z0 + z1) / 2));
    PB.add('dark', box(0.2, 0.025, z1 - z0, 0, BEAM + 0.29, (z0 + z1) / 2));
    for (const z of [7.6, 9.4]) PB.add('dark', rod(V(0, BEAM + 0.3, z), V(0, ROOF + 0.44, z), 0.03, 5)); // hangers from the roof
    PB.add('dark', box(0.22, 0.6, 0.22, 0, ROOF + 0.55, HALF + 0.05)); // the king post on the rear wall's frame
    PB.add('dark', rod(V(0, ROOF + 0.82, HALF + 0.05), V(0, BEAM + 0.3, z1 - 0.1), 0.028, 5));
    for (const s of [-1, 1]) PB.add('dark', rod(V(s * 0.1, ROOF + 0.82, HALF + 0.05), V(s * 0.9, ROOF + 0.2, HALF - 1.8), 0.022, 4));
    PB.add('dark', box(0.3, 0.3, 0.06, 0, BEAM + 0.15, z1)); // the stop
  }
  // the bridge's housing under the platform's front (it slides back into it)
  for (const s of [-1, 1]) PB.add('dark', box(0.1, 0.08, 2.0, s * RAILX, DECK - 0.2, P0 + 1.0));

  // ---- trunnion pedestals on the girders, the elevating gear, the sight, the traverse drive's controller
  for (const s of [-1, 1]) {
    PB.add('camo', box(0.42, TY - GT, 1.5, s * GX, (TY + GT) / 2, TZ));
    PB.add('camo', box(0.5, 0.18, 1.7, s * GX, GT + 0.09, TZ));
    PB.add('camo', rbox(0.5, 0.36, 1.0, 0.05, s * GX, TY + 0.12, TZ));
    PB.add('dark', rivetRow(V(s * (GX + 0.22), GT + 0.3, TZ - 0.65), V(s * (GX + 0.22), GT + 0.3, TZ + 0.65), 0.18, V(s, 0, 0), 0.022));
    for (const dz of [-0.65, 0.65]) PB.add('camo', rod(V(s * GX, GT + 0.2, TZ + dz), V(s * (GX + 0.45), DECK, TZ + dz * 1.7), 0.05, 6));
  }
  // the elevating pinions (on a cross shaft low between the pedestals, where the arcs reach) and the layer's handwheel on
  // its pedestal on the left walkway, a shaft down to the gearbox
  const AR = 1.62, aP = 84 * DEG, py = TY - AR * Math.sin(aP), pz = TZ + AR * Math.cos(aP);
  PB.add('steel', xTube(-GX - 0.1, GX + 0.1, 0.055, 0.055, 10, py, pz));
  for (const s of [-1, 1]) PB.add('steel', xTube(s * 0.5 - 0.08, s * 0.5 + 0.08, 0.12, 0.12, 14, py, pz));
  // the gearbox outside the left girder, a shaft up and back along the walkway to the layer's column behind the
  // pedestal: his handwheel faces aft, the dial sight on the column's head before his eye
  const LZ = TZ + 1.45; // the handwheel's plane
  PB.add('camo', rbox(0.3, 0.34, 0.36, 0.04, -GX - 0.2, py, pz));
  PB.add('steel', yTube(py, DECK + 0.95, 0.04, 0.04, 8, -GX - 0.22, pz));
  PB.add('camo', rbox(0.26, 0.3, 0.3, 0.04, -GX - 0.22, DECK + 1.0, pz));
  PB.add('steel', zTube(pz, LZ - 0.2, 0.035, 0.035, 8, -GX - 0.22, DECK + 1.0));
  PB.add('camo', box(0.2, DECK + 1.2 - GT, 0.2, -1.3, (DECK + 1.2 + GT) / 2, LZ - 0.25)); // the column
  PB.add('camo', rbox(0.3, 0.3, 0.3, 0.04, -1.3, DECK + 1.05, LZ - 0.25));
  PB.add('steel', xTube(-1.3, -GX - 0.22, 0.03, 0.03, 8, DECK + 1.0, LZ - 0.22));
  PB.add('iron', handwheel(0.24, 6, 0.022, 0.05).rotateY(Math.PI / 2).translate(-1.3, DECK + 1.05, LZ));
  PB.add('camo', box(0.12, 0.3, 0.16, -1.3, DECK + 1.42, LZ - 0.3));
  PB.add('brass', yTube(DECK + 1.55, DECK + 1.62, 0.05, 0.05, 10, -1.3, LZ - 0.3));
  PB.add('dark', zTube(LZ - 0.32, LZ + 0.05, 0.03, 0.026, 8, -1.3, DECK + 1.58));
  // the traverse drive: an electric motor and reduction gear on each bogie's end (the curve drive, game), its
  // controller column on the right walkway, the cable along the girder
  PB.add('camo', rbox(0.4, 0.95, 0.4, 0.04, 1.3, DECK + 0.48, -4.2));
  PB.add('iron', handwheel(0.16, 5, 0.018, 0.04).rotateZ(Math.PI / 2).translate(1.3, DECK + 1.0, -4.2));
  PB.add('brass', box(0.2, 0.12, 0.04, 1.3, DECK + 0.7, -3.98));
  PB.add('dark', box(0.05, 0.05, 6.5, GX + 0.09, GT - 0.6, -6.4));
  PB.build(body, { dirt: 0.22, y0: 0 });

  // the motors on the bogies' ends (they ride the bogies round the curve)
  for (const b of bogies) {
    const Q = mk();
    const e = b.group.position.z < 0 ? -1 : 1;
    Q.add('camo', rbox(0.9, 0.55, 0.55, 0.06, 0, BOG.wr + 0.45, e * 3.55));
    Q.add('dark', xTube(-0.5, 0.5, 0.2, 0.2, 14, BOG.wr + 0.45, e * 3.55));
    Q.add('dark', box(0.3, 0.3, 0.4, 0.55, BOG.wr + 0.35, e * 3.3));
    Q.build(b.group, { dirt: 0.4, y0: RH });
  }

  // ================================================================ the cradle (elevation)
  const PE = mk();
  PE.add('camo', zTube(CR0, CR1, 0.56, 0.56, 32));
  for (const z of [CR0 + 0.05, -1.2, CR1 - 0.05]) PE.add('steel', zTube(z - 0.045, z + 0.045, 0.6, 0.6, 32));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.5, s * 0.75, 0.36, 0.36, 22));
    PE.add('steel', xTube(s * 0.75, s * (GX - 0.05), 0.22, 0.22, 20));
    PE.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(s * 0.75, Math.sin((i * Math.PI) / 5) * 0.29, Math.cos((i * Math.PI) / 5) * 0.29)), V(s, 0, 0), 0.026));
    PE.add('camo', box(0.06, 0.55, CR1 - CR0 - 0.3, s * 0.56, 0, (CR0 + CR1) / 2));
  }
  // recoil cylinders: two over the barrel, the recuperator under it
  const cyl = [[-0.33, 0.68, 0.15], [0.33, 0.68, 0.15], [0, -0.7, 0.18]];
  for (const [x, y, r] of cyl) {
    PE.add('camo', zTube(CR0 - 0.2, CR1 - 0.1, r, r, 16, x, y));
    PE.add('steel', zTube(CR0 - 0.28, CR0 - 0.14, r * 1.12, r * 1.12, 16, x, y));
    for (const z of [-2.0, -0.6, 0.7]) PE.add('steel', zTube(z - 0.035, z + 0.035, r * 1.14, r * 1.14, 14, x, y));
    for (const z of [-2.5, -1.4, -0.2, 0.9]) PE.add('camo', box(0.14, Math.abs(y) - 0.52 - r * 0.6, 0.2, x * 0.8, Math.sign(y) * (0.52 + (Math.abs(y) - 0.52 - r * 0.6) / 2), z));
  }
  // the elevating arcs under the cradle's rear, with their webs
  for (const s of [-1, 1]) {
    PE.add('steel', gearArc(AR - 0.16, AR, 28 * DEG, 96 * DEG, 0.12, 30, 0.045).translate(s * 0.5, 0, 0));
    const web = [[0, -0.5], [AR * 0.75, -0.5]];
    for (let i = 0; i <= 8; i++) { const a = (28 + (68 * i) / 8) * DEG; web.push([(AR - 0.16) * Math.cos(a), -(AR - 0.16) * Math.sin(a)]); }
    web.push([0, -0.5]);
    PE.add('camo', sideProfile(web.slice(0, -1), 0.05, 0.004).translate(s * 0.5, 0, 0));
  }
  PE.build(elev, { dirt: 0.05, y0: TY });

  // ================================================================ the barrel (recoil) and the wedge (breech)
  const PR = mk();
  const ra = (z) => 0.29 + 0.13 * Math.min(1, Math.max(0, (z - (MUZ + 0.7)) / (CR0 - 0.4 - (MUZ + 0.7))));
  const bp = [[MUZ, 0.142], [MUZ, 0.29], [MUZ + 0.06, 0.31], [MUZ + 0.5, 0.31], [MUZ + 0.7, 0.29]];
  for (let i = 1; i <= 8; i++) { const z = MUZ + 0.7 + ((CR0 - 0.4 - MUZ - 0.7) * i) / 8; bp.push([z, ra(z)]); }
  const S0 = BRE - 0.62, S1 = BRE - 0.06; // the wedge's slot
  bp.push([CR0 - 0.35, 0.47], [CR0 - 0.3, 0.5], [S0 - 0.3, 0.5], [S0 - 0.25, 0.54], [S0, 0.54], [S0, 0.142], [MUZ + 0.01, 0.142], [MUZ, 0.142]);
  PR.add('iron', zLathe(bp, 40));
  for (const z of [MUZ + 2.6, MUZ + 5.0]) PR.add('iron', zTube(z - 0.03, z + 0.03, ra(z) + 0.012, ra(z) + 0.012, 32));
  PR.add('steel', zTube(CR0 - 0.3, CR1 + 0.6, 0.502, 0.502, 32, 0, 0, true), { tint: 0xa8aca8 }); // the bright slide
  PR.add('dark', zTube(MUZ + 0.002, MUZ + 0.9, 0.14, 0.14, 24, 0, 0, true));
  PR.add('dark', zTube(MUZ + 0.9, MUZ + 0.92, 0.14, 0.14, 24));
  PR.add('steel', zTube(MUZ - 0.003, MUZ + 0.004, 0.18, 0.29, 32, 0, 0, false));
  // the breech ring: a square block round the wedge's slot, open on the right where the wedge comes out
  PR.add('iron', box(1.06, 0.18, S1 - S0, 0, 0.45, (S0 + S1) / 2));
  PR.add('iron', box(1.06, 0.18, S1 - S0, 0, -0.45, (S0 + S1) / 2));
  PR.add('iron', box(0.16, 0.72, S1 - S0, -0.45, 0, (S0 + S1) / 2));
  PR.add('iron', zLathe([[S1, 0.142], [S1, 0.54], [BRE - 0.03, 0.54], [BRE, 0.51], [BRE, 0.142]], 36));
  PR.add('steel', zLathe([[BRE - 0.01, 0.16], [BRE - 0.01, 0.5], [BRE + 0.012, 0.5], [BRE + 0.012, 0.16], [BRE - 0.01, 0.16]], 36), { tint: 0xb0b0a8 });
  PR.add('dark', zTube(S1, BRE + 0.002, 0.142, 0.142, 24, 0, 0, true));
  PR.add('dark', rivets(Array.from({ length: 14 }, (_, i) => V(Math.cos((i / 14) * 6.283) * 0.44, Math.sin((i / 14) * 6.283) * 0.44, BRE + 0.012)), V(0, 0, 1), 0.024));
  // the recoil rods' crosshead on the ring, into the cylinders
  for (const [x, y, r] of cyl) {
    PR.add('camo', box(Math.max(0.16, Math.abs(x) + 0.2), 0.16, 0.2, x / 2, y * 0.82, S0 - 0.45));
    PR.add('steel', zTube(CR1 - 0.15, S0 - 0.4, r * 0.34, r * 0.34, 8, x, y));
  }
  const CK = BRUNO.CRANK;
  PR.add('camo', box(0.22, 0.2, 0.28, CK.x, CK.y - 0.12, BRE - 0.12));
  PR.add('steel', zTube(BRE - 0.1, CK.z, 0.03, 0.03, 8, CK.x, CK.y));
  PR.add('iron', handwheel(0.17, 5, 0.018, 0.04).rotateY(Math.PI / 2).translate(CK.x, CK.y, CK.z));
  PR.add('brass', box(0.12, 0.08, 0.06, BRUNO.LOCK.x, BRUNO.LOCK.y, BRE + 0.03));
  PR.build(rec, { dirt: 0.03, y0: TY });
  const PW = mk();
  PW.add('camo', box(0.86, 0.72, 0.5, 0, 0, 0));
  PW.add('steel', box(0.84, 0.7, 0.02, 0, 0, 0.255));
  PW.add('steel', box(0.08, 0.26, 0.1, 0.4, 0, 0.12));
  PW.build(brc, { dirt: 0.03, y0: TY });

  // ================================================================ the loading trolley, the bridge, the crab and hook
  const gear = loadingGear(rig, mk, { car, bridge, crab, hoist, DECK, TY, SHELL, HANDLES: BRUNO.HANDLES, RAILX, BRIDGE, BEAM, HANG, HOOK: BRUNO.HOOK });

  // ---- anchors, props and setters
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, elev, 'tray', 0, 0, ZB - TZ);
  anchor(rig, body, 'eye', 0, TY + 0.4, TZ);
  anchor(rig, body, 'shellStack', 0, WAGON_Y, ZPICK);
  rig.breechOpen = { axis: 'x', angle: WEDGE };
  rig.setBreech = (k) => { brc.position.x = Math.min(1, Math.max(0, k)) * WEDGE; };
  rig.setTraverse = (az) => { trav.rotation.y = az; roll(az); };
  // the breech ring dips between the girders at high angles: the stroke the fish belly allows
  rig.recoilFade = (el) => {
    if (el <= 0.05) return 1;
    const room = (TY - 1.15 - 0.55 * Math.cos(el)) / Math.sin(el) - BRE;
    return Math.min(1, Math.max(0.3, room / RECOIL));
  };
  rig.update = () => gear.update();
  rig.update();

  // hit boxes (body frame at az = 0, shifted by the body's place)
  const bx = -SAG;
  hb(rig, bx - 1.5, 0.4, -BUF, bx + 1.5, GT, BUF);
  hb(rig, bx - 1.6, GT, SH0, bx + 1.6, ROOF + 0.5, HALF);
  hb(rig, bx - 0.6, TY - 0.6, TZ + MUZ, bx + 0.6, TY + 0.8, TZ + BRE);
  hb(rig, bx - 1.4, 0.5, WZ - WAGON.len / 2, bx + 1.4, 2.4, WZ + WAGON.len / 2);

  // ---- crew spots (root frame at az = 0: the body frame shifted by -SAG; y = the floor). The drill (render/de/bruno.js)
  // moves most of them; the list order is the order the men fall out (the last first).
  const E = -Math.PI / 2, Wd = Math.PI / 2, N = 0;
  const spot = (role, x, y, z, h, pose) => crewSpot(rig, role, bx + x, y, z, h, pose);
  spot('chief', -1.28, DECK, -4.6, E, 'point');
  spot('layer', -1.3, DECK, LZ + 0.5, N, 'lay');
  spot('traverser', 1.3, DECK, -3.55, N, 'operate');
  spot('lanyard', 0.95, DECK, -0.62, 0.9, 'lanyard');
  spot('rammer1', BRUNO.TAKE_X, DECK, BRUNO.STAFF_REST.z + BRUNO.RAM_OFF[0], N, 'stand');
  spot('rammer2', WX - 0.35, DECK, 5.7, E, 'stand');
  spot('car1', BRUNO.CAR_LANE, DECK, ZWAIT + BRUNO.HANDLES[0], Wd, 'stand');
  spot('car2', BRUNO.CAR_LANE, DECK, ZWAIT + BRUNO.HANDLES[1], Wd, 'stand');
  spot('charge1', WX - 0.28, DECK, BRUNO.RACK.z - 1.0, E, 'stand');
  spot('charge2', WX - 0.28, DECK, BRUNO.RACK.z + 1.0, E, 'stand');
  spot('hoist', BRUNO.WINCH.x, DECK, BRUNO.WINCH.z - 0.48, Math.PI, 'operate');
  spot('sling', -0.72, RH + WAGON.deck, ZPICK + 0.1, E, 'stand');
  spot('rammer3', BRUNO.TAKE_X, DECK, BRUNO.STAFF_REST.z + BRUNO.RAM_OFF[1], N, 'stand');
  spot('rammer4', WX - 0.35, DECK, 6.35, E, 'stand');
  for (const c of rig.anchors.crew) c.car = false; // the car does not run back: the barrel recoils in the cradle alone
  return finishGun(rig);
}

// ==================================================================== the position
// buildBrunoSite(seed, { trackOnly }) -> { root }: the firing spur round the gun, in the rig's frame at zero traverse (ground y = 0, the
// piece's place at the origin, -Z the zero line): the curved track (radius R about (-R, 0, 0), wide enough for the
// +-14 degrees and the car's and the wagon's length beyond) on its ballast with a guard rail, the straight lead-in it is
// shunted along from the rear, a second track beside the lead with the battery's train (the next ammunition wagons, a
// covered van) under a camouflage net on poles, the command post, the charge store under its net and the huts.
// trackOnly: just the track under the gun and its wagon at zero traverse (for a parade ground).
export function buildBrunoSite(seed = 1, { trackOnly = false } = {}) {
  const rnd = mulberry32(seed * 7919 + 28);
  const M = siteMats('dgrau');
  const root = new THREE.Group();
  root.name = 'bruno-site';
  const P = new Parts(M), PN = new Parts(M);
  const A = 14 * DEG, ext = (BUF + 2) / R, extB = (WZ + WAGON.len / 2 + 2) / R;
  // the curve from beyond the wagon's place at the right end (-14 degrees) to beyond the car's nose at the left end
  if (trackOnly) {
    // the track under the gun and its wagon at zero traverse alone (the menu hangar's parade ground)
    layTrack(P, arcPoints(R, -extB, ext, 1.0), { bed: 3.8, foot: 1.0 });
    P.build(root, { dirt: 0.2 });
    root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { root };
  }
  const curve = arcPoints(R, -A - extB, A + ext, 1.0);
  const lead = straightBack(curve[0], 45, 1.5);
  const pts = [...lead, ...curve];
  layTrack(P, pts, { bed: 3.8, foot: 1.0 });
  // the guard rail inside the curve's inner rail, against the shot's side thrust (on the curve only)
  {
    const g = curve;
    for (let i = 0; i < g.length - 1; i++) {
      const a = g[i], b = g[i + 1], u = -GA + 0.3;
      const ax = a.x + Math.cos(a.a) * u, az = a.z - Math.sin(a.a) * u, bx = b.x + Math.cos(b.a) * u, bz = b.z - Math.sin(b.a) * u;
      P.add('dark', box(0.06, 0.1, Math.hypot(bx - ax, bz - az) + 0.01, (ax + bx) / 2, RH - 0.05, (az + bz) / 2, 0, Math.atan2(-(bx - ax), -(bz - az)), 0));
    }
  }
  // the buffer stop at the curve's forward end
  {
    const e = curve[curve.length - 1], c = Math.cos(e.a), s = Math.sin(e.a), fx = -s, fz = -c;
    const x = e.x + fx * 0.5, z = e.z + fz * 0.5;
    P.add('timber', box(3.0, 0.5, 0.4, x, RH + 0.5, z, 0, e.a, 0));
    for (const u of [-0.9, 0.9]) P.add('dark', rod(V(x + c * u - fx * 1.6, RH, z - s * u - fz * 1.6), V(x + c * u, RH + 0.6, z - s * u), 0.06, 6));
  }
  // the battery's train on the parallel siding (8 m to the right of the lead): two more ammunition wagons and a van
  {
    const L0 = lead[0], c = Math.cos(L0.a), s = Math.sin(L0.a);
    const along = (d, u) => ({ x: L0.x + Math.sin(L0.a) * -d + c * u, z: L0.z + Math.cos(L0.a) * -d - s * u });
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
    for (const d of [8, 16.5]) place(d, (Q) => ammoWagonParts(Q, { shell: SHELL, rounds: [{ x: -0.6, z: -1.6 }, { x: 0.6, z: -1.6 }, { x: -0.6, z: 0.2 }, { x: 0.6, z: 0.2 }], charge: { len: 0.95, rad: 0.17 } }));
    place(26, (Q) => {
      // a covered van (the battery's stores and the gun's tools)
      ammoWagonParts(Q, {});
      Q.add('camo', box(2.7, 2.2, 7.4, 0, WAGON.deck + 1.1, 0));
      Q.add('camo', box(2.9, 0.12, 7.6, 0, WAGON.deck + 2.25, 0, 0, 0, 0));
      Q.add('dark', box(0.04, 1.8, 1.6, 1.37, WAGON.deck + 0.95, 0));
    });
    // their camouflage net on poles (the gun's own curve is left open: it fires through the gap, the barrel would foul
    // a net over it), over the wagons from the van to the first ammunition wagon
    {
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
  }
  // the command post: a timber dugout with its earth cover, the telephone line on poles back to it
  const earthG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); P.add('earth', n); };
  {
    const x = 22, z = 6;
    P.add('timber', box(4.5, 2.0, 3.5, x, 1.0, z));
    earthG(box(6.5, 1.0, 5.5, x, 2.4, z));
    P.add('dark', box(1.0, 1.8, 0.08, x - 1.2, 0.9, z - 1.78));
    for (let i = 1; i < 5; i++) {
      P.add('timber', yTube(0, 5.0, 0.09, 0.07, 7, x + i * 7, z - i * 5));
      P.add('timber', box(0.8, 0.07, 0.07, x + i * 7, 4.8, z - i * 5));
    }
  }
  // the charge store: a sandbagged pit with a timber roof and the charges' cases stacked by it
  {
    const x = -16, z = 18;
    for (let k = 0; k < 4; k++) earthG(box(6 - k * 0.3, 0.32, 0.6, x, 0.16 + k * 0.32, z - 2.5));
    for (let k = 0; k < 4; k++) earthG(box(6 - k * 0.3, 0.32, 0.6, x, 0.16 + k * 0.32, z + 2.5));
    P.add('timber', box(6.2, 0.2, 5.8, x, 1.45, z));
    earthG(box(6.6, 0.6, 6.2, x, 1.85, z));
    for (let i = 0; i < 8; i++) P.add('brass', zTube(-0.475, 0.475, 0.17, 0.17, 14, x + 3.6 + (i % 4) * 0.4, 0.17 + Math.floor(i / 4) * 0.33).translate(0, 0, z - 1 + Math.floor(i / 4) * 0.02));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('timber', yTube(0, 3.6, 0.06, 0.05, 6, x + 1 + sx * 5, z + sz * 4.2));
    PN.add('net', drapeNet(x - 4, x + 6, z - 4.2, z + 4.2, () => 3.8, rnd));
  }
  // huts, sleepers and rails stacked for the track gang
  const hut = (x, z, w, d, ang) => {
    const Q = new Parts(M), g = new THREE.Group();
    Q.add('timber', box(w, 2.3, d, 0, 1.15, 0));
    for (const s of [-1, 1]) Q.add('cloth', box(w + 0.4, 0.06, d / 2 + 0.5, 0, 2.6, s * (d / 4 + 0.15), s * 0.38, 0, 0), { tint: 0x6a6658 });
    Q.add('dark', box(0.9, 1.8, 0.06, w / 4, 0.9, -d / 2 - 0.02));
    Q.build(g, { dirt: 0.3 });
    g.position.set(x, 0, z);
    g.rotation.y = ang;
    root.add(g);
  };
  hut(26, 30, 6, 4, -0.4);
  hut(-24, 40, 7, 4, 0.3);
  for (let i = 0; i < 9; i++) P.add('timber', box(2.6, 0.16, 0.26, 14 + rnd() * 0.2, 0.08 + Math.floor(i / 3) * 0.16, 24 + (i % 3) * 0.3));
  for (let i = 0; i < 4; i++) P.add('steel', box(0.07, 0.15, 12, 17.5 + i * 0.16, 0.08, 34));
  P.build(root, { dirt: 0.2 });
  PN.build(root, { dirt: 0 });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== M.net; o.receiveShadow = true; } });
  return { root };
}

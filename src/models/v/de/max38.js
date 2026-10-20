import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, Parts, DEG, projectUV, concreteTextures, earthTextures, vehicleMats, shellGeometry } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, pivotAt, hb } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { createHeavyScrimTexture } from './heavy_gustav_site.js';

// 38 cm SK L/45 "Langer Max" on the Krupp Eisenbahn- und Bettungsschiessgeruest (E.u.B.), the railway carriage that
// could fire from the track (to 18.5 degrees) or be set down on a prepared Bettung and fire to 55 (refs/max38). The
// game stands it on the Bettung, as the spring 1918 batteries in Flanders were: the car came in on its four bogies
// (2 x 5 and 2 x 4 axles), was jacked up, the bogies were run out from under it and it was lowered onto a turntable
// ring on a steel Unterbau in a concrete bed, so the whole carriage turns about the ring and a circular field
// railway round it brings the shells to the hoist at the rear whatever the bearing. The bogies stand on the approach
// spur (buildMax38Site). The 1921 US Army drawing gives the car (31.6 m over buffers), the gun (17.13 m overall, the
// trunnions 11.96 m from the muzzle, the breech 1.17 m across), the rear wing with the projectile car on its rails
// and the hoist bridge over it, and the folding counterweight ahead of the trunnions; the photographs (Bundesarchiv
// 102-00153, May 1918; the 38er Langrohr shell photo) the raised counterweight box, the railings, the pointed hoist
// arch. Heights for the emplaced carriage are estimates [E].
//
// Frames (rig root: ground y = 0 at the bed's foot, the turntable's axis at x = z = 0, -Z the line of fire at zero
// traverse):
//   root       the concrete bed with its well, the fixed steel ring and roller path, the end trucks' racer, the
//              traversing rack and the 60 cm ammunition ring track (all fixed)
//   traverse   the turntable ring and everything on it: the girder carriage, walkways, the rear wing with the
//              projectile car's rails, the hoist bridge, the charge rack, the ammunition wagon on the ring track
//              under the hoist (it follows the gun round the ring)
//   elevation  at the trunnions (TY above the ground, z = 0): the cradle, its recoil cylinders, the counterweight
//              box, the two toothed elevating arcs
//   recoil     the barrel (z MUZ to BRE), 1.15 m stroke
//   breech     the horizontal sliding wedge (Krupp): setBreech(k) slides it 0.62 m to the right
//   trolley    the projectile car (position.z = where the shell's middle lies on it; origin at the bore's height)
//   hoist      the hook block under the hoist bridge (position.y = hook height, MAX38.HOOK)
// loadEl is 0 (the gun was loaded level: wiki, the drawing's rear wing at bore height). render/ww1/max38.js drives the
// car (setTrolley(z)) and the hook (setHoist(y)) through the loading steps; render/guns.js drives the wedge (setBreech).

const yRing = (y0, y1, r0, r1, seg, x = 0, z = 0) => new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y0), new THREE.Vector2(r1, y1), new THREE.Vector2(r0, y1), new THREE.Vector2(r0, y0)], seg).translate(x, 0, z);

// ---- dimensions (metres, rig frame)
const BED = 1.8; // top of the concrete bed and of the fixed roller path
const RIN = 6.05, ROUT = 7.0; // the turntable ring; its open centre is the well the breech dips into at high angles
const RDISC = 10.8; // the bed's edge
const RRACE = 10.29; // the end trucks' racer
const RAMMO = 12.8; // the ammunition ring track (60 cm gauge)
const GB = BED + 0.16; // the girders' bearing on the turntable
const TY = 4.3; // trunnion axis (the bore at the loading angle)
const BRE = 5.17, MUZ = BRE - 17.13; // breech face and muzzle on the barrel (z, + = back)
const HALF = 15.4; // headstocks (the buffers reach 0.4 m beyond: 31.6 m over buffers)
const GX = 1.35; // girder plates' middle
const WALK = 3.15; // walkways and the rear wing deck
const W0 = 5.6; // the rear wing begins (its rails); the girders step down and its deck runs from G0
const G0 = 4.4, D0 = 4.6;
const RAILX = 0.72, RAILY = WALK + 0.12; // the projectile car's rails
const HATCH = [11.75, 13.85]; // the hoist well in the rear wing deck between the rails
const SHELL = { len: 1.55, rad: 0.19 }; // Sprenggranate L/4,1, 750 kg (navweaps: 155 cm)
const ZB = BRE + 0.12 + SHELL.len / 2; // the car at the breech: the shell's middle
const ZWAIT = 9.6, ZHOIST = RAMMO; // the car's waiting place, and under the hoist
const HANG = 0.55; // shell's middle below the hook
const WAGON_Y = 0.95; // the shell's middle on the ammunition wagon
const RECOIL = 1.15; // [E] (turret mounting 1.25 m)
const WEDGE = 0.62; // the wedge's travel to open
const RAILING = 2.5; // walkway edge
const STAFF = 5.5; // the rammer staff

// shared with the drill (render/ww1/max38.js): every place it uses, in the traverse frame at zero elevation
export const MAX38 = {
  BED, TY, BRE, MUZ, WALK, ZB, ZWAIT, ZHOIST, HANG, WAGON_Y, RAILY, RAILING, STAFF, SHELL,
  HOOK: { up: 5.25, down: WAGON_Y + HANG, lift: 4.66 + HANG, set: TY + HANG },
  SEAT: BRE - 1.7 - SHELL.len / 2, // the shell's middle rammed home: its base 1.7 m inside, the charge fills the chamber behind it
  RACK: { x: 1.1, y: 3.95, z: 11.65 }, // the charge (fore charge bag ahead of the brass main case) on the rack's top shelf
  STAFF_REST: { x: -2.22, y: 4.0, z: 6.9 },
  LOCK: { x: -0.3, y: 0.42, z: BRE + 0.06 }, // the firing lock (recoil frame), primed before the lay
  HANDLES: [-0.05, 1.05], // the projectile car's side handles (car frame z; x 0.6, y -0.45) // the rammer staff's head on its hooks on the left railing
  CRANK: { x: 0.3, y: 0.82, z: BRE + 0.12 }, // the wedge's operating handwheel on top of the breech ring (recoil frame)
  WINCH: { x: 2.47, y: 4.2, z: ZHOIST + 0.45 }, // the hoist's crank handle
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
// a flat bar along a segment in the z-y plane (flanges, chords), w across x
const bar = (z0, y0, z1, y1, w, h, x) => {
  const len = Math.hypot(z1 - z0, y1 - y0);
  return box(w, h, len, x, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0));
};

function concreteMat(tone = 0x7c786e) {
  const t = concreteTextures(tone);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.map, roughness: 0.95, metalness: 0, vertexColors: true });
  if (t.normal) { m.normalMap = t.normal; m.normalScale.set(0.6, 0.6); }
  return m;
}
let CONC = null;
// geometry with metric box-projected UVs (6 m tiles) for the concrete
const conc = (P, g, tint = 0xa49f94) => {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.normal) n.computeVertexNormals();
  projectUV(n, 6);
  P.add('concrete', n, { uv: true, tint });
};

export function buildMax38() {
  const rig = newGunRig('max38', 'bunt');
  const root = rig.root;
  CONC ??= concreteMat();
  const mats = { ...rig.mats, concrete: CONC };
  const mk = () => new Parts(mats);
  const PF = mk(), PT = mk(), PE = mk(), PR = mk(), PB = mk(), PC = mk(), PH = mk(), PW = mk();
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, 0);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', 0, 0, BRE - 0.3);
  const car = pivotAt(rig, trav, 'trolley', 0, TY, ZWAIT);
  const hoist = pivotAt(rig, trav, 'hoist', 0, MAX38.HOOK.up, ZHOIST);
  rig.recoilLength = RECOIL;
  rig.loadEl = 0;
  rig.staffLen = STAFF;
  rig.hoistRange = { up: MAX38.HOOK.up, down: MAX38.HOOK.down };
  rig.hoistHang = HANG;
  rig.trolleyRange = { breech: ZB, wait: ZWAIT, hoist: ZHOIST };
  rig.max38 = MAX38; // the drill's places (render/ww1/max38.js)

  // ================================================================ the bed (fixed)
  // the concrete bed: a raised disc with the well in its middle (the floor at ground level), the steel Unterbau ring
  // carrying the roller path, a racer for the end trucks near the edge, steps, the ring track at its foot
  conc(PF, yRing(0, BED - 0.32, RIN, RDISC, 72));
  conc(PF, yRing(BED - 0.32, BED, ROUT + 0.14, RDISC, 72));
  conc(PF, yRing(0, 0.05, 0.0001, RIN, 48), 0x8a867c);
  conc(PF, yRing(0, 0.18, RDISC, RDISC + 0.35, 72), 0x9a958a); // the footing
  PF.add('dark', yRing(BED - 0.32, BED - 0.02, RIN, ROUT + 0.14, 72)); // the Unterbau's box ring
  PF.add('steel', yRing(BED - 0.02, BED, RIN + 0.1, ROUT - 0.1, 72)); // roller path
  PF.add('dark', yRing(BED - 0.28, BED - 0.06, ROUT + 0.14, ROUT + 0.2, 96)); // the traversing rack's root
  for (let i = 0; i < 150; i++) { const a = (i / 150) * Math.PI * 2; PF.add('steel', box(0.06, 0.2, 0.05, Math.cos(a) * (ROUT + 0.23), BED - 0.17, Math.sin(a) * (ROUT + 0.23), 0, -a, 0)); }
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; PF.add('steel', yTube(BED - 0.04, BED + 0.02, 0.045, 0.045, 6, Math.cos(a) * (ROUT + 0.06), Math.sin(a) * (ROUT + 0.06))); }
  for (const k of [-1, 1]) PF.add('dark', rivets(Array.from({ length: 64 }, (_, i) => V(Math.cos(i / 64 * 6.283) * (RIN + 0.04 + (k + 1) * 0.47), BED - 0.17, Math.sin(i / 64 * 6.283) * (RIN + 0.04 + (k + 1) * 0.47))).map((p) => p), V(0, 1, 0), 0.025));
  PF.add('steel', yRing(BED, BED + 0.07, RRACE - 0.06, RRACE + 0.06, 120)); // racer
  PF.add('dark', yRing(BED - 0.005, BED + 0.02, RRACE - 0.2, RRACE + 0.2, 120));
  // a sump and a ladder down into the well
  PF.add('dark', box(0.6, 0.02, 0.6, 3.2, 0.06, 3.2));
  for (let k = 0; k < 6; k++) PF.add('dark', rod(V(-0.25, 0.25 + k * 0.28, RIN - 0.08), V(0.25, 0.25 + k * 0.28, RIN - 0.08), 0.016, 5).rotateY(2.4));
  // steps up the bed's side at the four quarters between the lines of approach
  for (const ang of [0.8, 2.35, 3.9, 5.5]) {
    for (let k = 0; k < 6; k++) {
      const g = box(1.2, 0.3 * (k + 1), 0.32, 0, 0.15 * (k + 1), 0).translate(0, 0, RDISC + 0.35 + (5 - k) * 0.28 + 0.16);
      conc(PF, g.rotateY(ang), 0x9a958a);
    }
  }
  // the 60 cm ammunition ring track: rails on sleepers round the bed
  PF.add('steel', yRing(0.06, 0.13, RAMMO - 0.33, RAMMO - 0.27, 160));
  PF.add('steel', yRing(0.06, 0.13, RAMMO + 0.27, RAMMO + 0.33, 160));
  for (let i = 0; i < 110; i++) { const a = (i / 110) * Math.PI * 2; PF.add('timber', box(0.14, 0.07, 1.0, Math.sin(a) * RAMMO, 0.035, Math.cos(a) * RAMMO, 0, a, 0)); }

  // ================================================================ the carriage (traverse)
  // turntable ring, with the bearing pads the girders were bolted down on
  PT.add('camo', yRing(BED, GB - 0.02, RIN + 0.08, ROUT - 0.08, 72));
  PT.add('dark', rivets(Array.from({ length: 56 }, (_, i) => V(Math.cos(i / 56 * 6.283) * (RIN + 0.5), GB - 0.02, Math.sin(i / 56 * 6.283) * (RIN + 0.5))), V(0, 1, 0), 0.026));
  for (const s of [-1, 1]) for (const e of [-1, 1]) PT.add('camo', box(0.6, 0.05, 1.3, s * GX, GB - 0.025, e * 6.52));
  // the two side girders: shallow over the ends, deep and fish-bellied in the middle (into the well), the rear wing's
  // top level with its deck
  const gp = [[-HALF, 2.35], [-HALF, 3.15], [-9.0, 3.6], [G0, 3.6], [G0, WALK - 0.1], [HALF, WALK - 0.1], [HALF, 2.35], [9.0, 2.35], [7.3, GB], [5.85, GB], [5.45, 1.1], [-5.45, 1.1], [-5.85, GB], [-7.3, GB], [-9.0, 2.35]];
  for (const s of [-1, 1]) {
    PT.add('camo', sideProfile(gp, 0.12, 0.01).translate(s * GX, 0, 0));
    PT.add('dark', rivetPoly(gp, (z, y) => V(s * (GX + 0.065), y, z), 0.09, 0.22, V(s, 0, 0), 0.024));
    for (let z = -14.6; z <= 14.61; z += 0.9) {
      if (Math.abs(z) < 0.8) continue; // the trunnion bearings
      const top = polyY(gp, z, Math.max), bot = polyY(gp, z, Math.min);
      PT.add('camo', box(0.05, top - bot - 0.1, 0.09, s * (GX + 0.085), (top + bot) / 2, z));
    }
    // flanges along the top and bottom edges, both faces
    const edges = [[-HALF, 3.15, -9.0, 3.6], [-9.0, 3.6, G0, 3.6], [G0, WALK - 0.1, HALF, WALK - 0.1], [-HALF, 2.35, -9.0, 2.35], [-9.0, 2.35, -7.3, GB], [-5.85, GB, -5.45, 1.1], [-5.45, 1.1, 5.45, 1.1], [5.45, 1.1, 5.85, GB], [7.3, GB, 9.0, 2.35], [9.0, 2.35, HALF, 2.35]];
    for (const [z0, y0, z1, y1] of edges) PT.add('camo', bar(z0, y0 + (y0 > 2.5 ? -0.025 : 0.025), z1, y1 + (y1 > 2.5 ? -0.025 : 0.025), 0.34, 0.05, s * GX));
  }
  // cross girders, headstocks and buffers
  for (const z of [-14.5, -11.0, 11.0, 14.5]) PT.add('camo', box(2.58, 0.6, 0.14, 0, 2.65, z));
  PT.add('camo', box(2.58, 3.45 - GB, 0.3, 0, (3.45 + GB) / 2, -7.15));
  PT.add('camo', box(2.58, 2.95 - GB, 0.3, 0, (2.95 + GB) / 2, 7.15));
  for (const e of [-1, 1]) {
    const z = e * HALF;
    PT.add('camo', box(3.2, 0.62, 0.26, 0, 2.66, z + e * 0.13));
    PT.add('dark', rivetRow(V(-1.5, 2.86, z + e * 0.27), V(1.5, 2.86, z + e * 0.27), 0.2, V(0, 0, e), 0.024));
    PT.add('dark', rivetRow(V(-1.5, 2.46, z + e * 0.27), V(1.5, 2.46, z + e * 0.27), 0.2, V(0, 0, e), 0.024));
    for (const x of [-0.95, 0.95]) {
      PT.add('camo', zTube(z + e * 0.26, z + e * 0.42, 0.15, 0.15, 14, x, 2.66));
      PT.add('steel', zTube(z + e * 0.3, z + e * 0.5, 0.07, 0.07, 10, x, 2.66));
      PT.add('steel', zTube(z + e * 0.42, z + e * 0.5, 0.24, 0.24, 22, x, 2.66));
    }
    PT.add('dark', box(0.22, 0.2, 0.22, 0, 2.5, z + e * 0.4)); // the coupling hook
  }
  // the end trucks: a frame under each end on two pairs of rollers that run on the racer
  for (const e of [-1, 1]) {
    const z = e * 10.2;
    PT.add('camo', box(3.0, 0.24, 1.0, 0, 2.23, z));
    for (const s of [-1, 1]) {
      PT.add('camo', box(0.16, 0.3, 1.0, s * GX, 2.12, z));
      for (const dz of [-0.33, 0.33]) PT.add('steel', xTube(s * GX - 0.1, s * GX + 0.1, 0.17, 0.17, 18, BED + 0.07 + 0.17, z + dz));
      PT.add('steel', xTube(s * GX - 0.25, s * GX + 0.25, 0.04, 0.04, 8, BED + 0.24, z));
    }
  }
  // walkways outside the girders (timber planks on brackets), the front deck and the rear wing deck
  const plankRun = (x0, x1, z0, z1) => {
    const n = Math.max(1, Math.round((x1 - x0) / 0.27));
    for (let i = 0; i < n; i++) PT.add('timber', box((x1 - x0) / n - 0.012, 0.05, z1 - z0, x0 + ((i + 0.5) * (x1 - x0)) / n, WALK - 0.025, (z0 + z1) / 2));
  };
  for (const s of [-1, 1]) {
    const xs = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    plankRun(...xs(GX + 0.07, RAILING), -9.0, D0);
    plankRun(...xs(0.8, RAILING), D0, HALF - 0.1); // the rear wing: over the girder, out to the railing
    PT.add('camo', box(RAILING - GX, 0.06, D0 + 9.0, s * (GX + RAILING) / 2, WALK - 0.08, (D0 - 9.0) / 2));
    PT.add('camo', box(GX - 0.8, 0.06, W0 - D0 + 0.4, s * (GX + 0.8) / 2, WALK - 0.08, (D0 + W0 + 0.4) / 2)); // the deck's forward corner off the girder
    for (let z = -8.6; z < HALF; z += 1.8) {
      const top = polyY(gp, z, Math.max);
      if (top > 3.3) PT.add('camo', rod(V(s * (GX + 0.07), WALK - 0.08, z), V(s * (GX + 0.07), WALK - 0.6, z), 0.03, 5));
      PT.add('camo', rod(V(s * (GX + 0.07), WALK - 0.55, z), V(s * (RAILING - 0.05), WALK - 0.1, z), 0.035, 6));
    }
    // the rails' stringers and the rails: from the edge of the well to the rear buffer stops
    PT.add('camo', box(0.12, 0.2, HALF - 0.15 - W0, s * RAILX, WALK - 0.1, (W0 + HALF - 0.15) / 2));
    PT.add('steel', box(0.07, 0.12, HALF - 0.15 - W0, s * RAILX, WALK + 0.06, (W0 + HALF - 0.15) / 2));
    PT.add('dark', box(0.18, 0.14, 0.14, s * RAILX, RAILY + 0.07, 5.8)); // stop chocks
    PT.add('dark', box(0.2, 0.3, 0.2, s * RAILX, RAILY + 0.15, HALF - 0.25));
  }
  plankRun(-0.62, 0.62, 7.4, HATCH[0]);
  plankRun(-0.62, 0.62, HATCH[1], HALF - 0.1);
  PT.add('dark', box(1.3, 0.04, 0.08, 0, WALK - 0.02, HATCH[0] - 0.04)); // the well's coaming
  PT.add('dark', box(1.3, 0.04, 0.08, 0, WALK - 0.02, HATCH[1] + 0.04));
  // the front deck between the girders
  plankRun(-GX + 0.07, GX - 0.07, -HALF + 0.1, -9.6);
  PT.add('camo', box(2.58, 0.08, HALF - 9.6, 0, WALK - 0.09, -(HALF + 9.6) / 2));
  // railings (pipe stanchions, top and middle rails); a gap at the ladders
  const railRun = (x0, z0, x1, z1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.2));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; PT.add('dark', rod(V(x, WALK, z), V(x, WALK + 1.0, z), 0.022, 5)); }
    PT.add('dark', rod(V(x0, WALK + 1.0, z0), V(x1, WALK + 1.0, z1), 0.024, 6));
    PT.add('dark', rod(V(x0, WALK + 0.5, z0), V(x1, WALK + 0.5, z1), 0.018, 5));
  };
  for (const s of [-1, 1]) {
    railRun(s * RAILING, -HALF + 0.2, s * RAILING, -8.6);
    railRun(s * RAILING, -7.8, s * RAILING, HALF - 0.2);
    // the ladder down to the bed
    for (let k = 0; k < 5; k++) PT.add('dark', rod(V(s * (RAILING + 0.12), BED + 0.3 + k * 0.28, -8.4), V(s * (RAILING + 0.12), BED + 0.3 + k * 0.28, -8.0), 0.016, 5));
    for (const dz of [-8.4, -8.0]) PT.add('dark', rod(V(s * (RAILING + 0.12), BED + 0.05, dz), V(s * (RAILING + 0.12), WALK + 0.9, dz), 0.02, 5));
  }
  railRun(-RAILING, -HALF + 0.2, RAILING, -HALF + 0.2);
  railRun(-RAILING, HALF - 0.2, RAILING, HALF - 0.2);
  // the trunnion bearings on the girders
  for (const s of [-1, 1]) {
    PT.add('camo', box(0.38, TY + 0.25 - 3.6, 1.5, s * GX, (TY + 0.25 + 3.6) / 2, 0));
    PT.add('camo', rbox(0.46, 0.34, 1.0, 0.05, s * GX, TY + 0.38, 0));
    for (const dz of [-0.62, 0.62]) PT.add('camo', rod(V(s * GX, 3.6, dz), V(s * (GX + 0.5), WALK, dz * 1.6), 0.05, 6));
    PT.add('dark', rivetRow(V(s * (GX + 0.2), 3.75, -0.7), V(s * (GX + 0.2), 3.75, 0.7), 0.18, V(s, 0, 0), 0.024));
  }
  // elevating gear: pinions on a cross shaft low in the girders, a vertical shaft up the left side to the layer's
  // handwheel on its pedestal
  const aP = 76 * DEG, RPIN = 2.77, py = TY - RPIN * Math.sin(aP), pz = RPIN * Math.cos(aP);
  PT.add('steel', xTube(-GX - 0.2, GX + 0.08, 0.06, 0.06, 10, py, pz));
  for (const s of [-1, 1]) PT.add('steel', xTube(s * 0.55 - 0.09, s * 0.55 + 0.09, 0.13, 0.13, 14, py, pz));
  PT.add('camo', rbox(0.26, 0.3, 0.3, 0.04, -GX - 0.22, py, pz));
  PT.add('steel', yTube(py, 4.0, 0.045, 0.045, 8, -GX - 0.25, pz));
  PT.add('camo', rbox(0.3, 0.32, 0.36, 0.04, -GX - 0.25, 4.05, pz));
  PT.add('steel', xTube(-1.75, -GX - 0.25, 0.04, 0.04, 8, 4.12, pz));
  PT.add('iron', handwheel(0.3, 6, 0.024, 0.06).translate(-1.78, 4.12, pz));
  // the layer's sight on the left bearing (a dial sight on its bracket)
  PT.add('camo', box(0.12, 0.5, 0.25, -GX - 0.26, TY + 0.4, -0.3));
  PT.add('brass', yTube(TY + 0.65, TY + 0.9, 0.05, 0.05, 10, -GX - 0.26, -0.3));
  PT.add('dark', zTube(-0.55, -0.15, 0.03, 0.026, 8, -GX - 0.26, TY + 0.86));
  // traversing gear: a pinion on the rack, a shaft up to the traverser's handwheel on the right walkway
  const tz = -7.1, tx = Math.sqrt((ROUT + 0.36) ** 2 - tz * tz);
  PT.add('steel', yTube(BED - 0.27, BED - 0.07, 0.13, 0.13, 14, tx, tz));
  PT.add('steel', yTube(BED - 0.27, 4.0, 0.045, 0.045, 8, tx, tz));
  PT.add('camo', rbox(0.3, 0.3, 0.3, 0.04, tx, 4.05, tz));
  PT.add('camo', box(0.2, 0.25, 0.2, tx, GB + 0.1, tz)); // the shaft's bearing off the girder
  PT.add('steel', xTube(tx, 1.78, 0.04, 0.04, 8, 4.12, tz));
  PT.add('iron', handwheel(0.28, 6, 0.022, 0.05).translate(1.8, 4.12, tz));
  // front deck furniture: the barrel's travelling crutch folded flat, a brake column, a tool chest
  for (const s of [-1, 1]) PT.add('camo', rod(V(s * 0.9, WALK + 0.08, -13.8), V(s * 0.25, WALK + 0.08, -11.2), 0.06, 6));
  PT.add('camo', box(0.7, 0.1, 0.4, 0, WALK + 0.08, -11.15));
  PT.add('dark', yTube(WALK, WALK + 1.0, 0.05, 0.05, 8, 1.0, -14.6));
  PT.add('iron', handwheel(0.22, 5, 0.018, 0.04).rotateZ(Math.PI / 2).translate(1.0, WALK + 1.02, -14.6));
  PT.add('camo', rbox(0.9, 0.5, 0.5, 0.04, -1.0, WALK + 0.25, -14.4));

  // ---- the rear wing: hoist bridge, charge rack, the staff's hooks
  // the hoist bridge: a pointed lattice arch (two faces) on outrigger brackets, a crab sheave at its apex, the winch on
  // the right leg
  const LX = 2.68, arch = [[LX, 2.82], [LX, 5.0], [LX - 0.25, 5.75], [LX - 0.85, 6.3], [LX - 1.7, 6.62], [0, 6.78]];
  const archPts = [...arch, ...arch.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
  const inner = archPts.map(([x, y], i) => [x - Math.sign(x) * 0.3 * (i > 0 && i < archPts.length - 1 ? 1 : 1), y - (y > 5.5 ? 0.28 : 0)]);
  for (const dz of [-0.25, 0.25]) {
    const z = ZHOIST + dz;
    for (let i = 0; i < archPts.length - 1; i++) {
      const [ax, ay] = archPts[i], [bx, by] = archPts[i + 1], [cx, cy] = inner[i], [ex, ey] = inner[i + 1];
      PT.add('camo', rod(V(ax, ay, z), V(bx, by, z), 0.055, 6));
      if (i > 0 && i < archPts.length - 2 || (i === 0 || i === archPts.length - 2)) PT.add('camo', rod(V(cx, cy + (i === 0 ? 0.5 : 0), z), V(ex, ey + (i === archPts.length - 2 ? 0.5 : 0), z), 0.04, 6));
      PT.add('camo', rod(V(ax, ay, z), V(ex, ey + (i === archPts.length - 2 ? 0.5 : 0), z), 0.022, 4));
    }
  }
  for (const [x, y] of archPts) PT.add('camo', rod(V(x, y, ZHOIST - 0.25), V(x, y, ZHOIST + 0.25), 0.03, 4));
  for (const s of [-1, 1]) {
    PT.add('camo', box(LX - GX + 0.2, 0.22, 0.8, s * (GX + LX) / 2, 2.72, ZHOIST)); // outriggers off the girder
    PT.add('camo', rod(V(s * (GX + 0.08), 2.4, ZHOIST - 0.3), V(s * LX, 2.62, ZHOIST - 0.3), 0.04, 5));
    // tie rods to the rear corners
    PT.add('dark', rod(V(s * LX, 5.0, ZHOIST + 0.25), V(s * (GX + 0.1), WALK - 0.05, HALF - 0.3), 0.025, 5));
  }
  const SHV = 6.5; // the sheave under the apex
  PT.add('iron', zTube(ZHOIST - 0.07, ZHOIST + 0.07, 0.22, 0.22, 18, 0, SHV));
  PT.add('camo', box(0.5, 0.36, 0.56, 0, SHV + 0.12, ZHOIST));
  // the winch on the right leg: a drum, gearing and the crank handle toward the walkway
  const W = MAX38.WINCH;
  PT.add('camo', box(0.3, 0.6, 0.7, LX, W.y, ZHOIST + 0.1));
  PT.add('iron', zTube(ZHOIST - 0.32, ZHOIST + 0.32, 0.2, 0.2, 18, LX + 0.2, W.y + 0.15));
  PT.add('rope', zTube(ZHOIST - 0.28, ZHOIST + 0.28, 0.215, 0.215, 18, LX + 0.2, W.y + 0.15));
  PT.add('iron', zTube(ZHOIST + 0.38, ZHOIST + 0.44, 0.3, 0.3, 24, LX + 0.2, W.y));
  PT.add('steel', zTube(ZHOIST + 0.3, W.z + 0.05, 0.035, 0.035, 8, W.x + 0.2, W.y));
  PT.add('dark', rod(V(W.x + 0.2, W.y, W.z + 0.04), V(W.x - 0.05, W.y + 0.18, W.z + 0.04), 0.025, 5));
  PT.add('dark', xTube(W.x - 0.2, W.x - 0.05, 0.022, 0.022, 6, W.y + 0.18, W.z + 0.04));
  PT.add('rope', rod(V(LX + 0.2, W.y + 0.37, ZHOIST), V(0.15, SHV + 0.1, ZHOIST), 0.02, 5));
  // the charge rack on the right walkway: two frames, the top shelf for the next charge, a spare below
  const RK = MAX38.RACK;
  for (const z of [RK.z - 0.5, RK.z + 0.5]) {
    for (const dx of [-0.25, 0.25]) PT.add('camo', rod(V(RK.x + dx, WALK, z), V(RK.x + dx, RK.y + 0.1, z), 0.025, 5));
    for (const y of [RK.y - 0.225, 3.45 - 0.225]) PT.add('camo', box(0.52, 0.05, 0.08, RK.x, y, z));
    for (const y of [RK.y - 0.225, 3.45 - 0.225]) for (const dx of [-0.2, 0.2]) PT.add('camo', box(0.06, 0.1, 0.08, RK.x + dx, y + 0.07, z));
  }
  {
    const L = 0.856 + 0.78, zf = RK.z - L / 2, zc = zf + 0.78;
    PT.add('rope', zTube(zf + 0.03, zc, 0.17, 0.17, 14, RK.x, 3.45)); // the spare: the silk fore charge bag
    PT.add('rope', sphere(0.17, RK.x, 3.45, zf + 0.04, 1, 1, 0.25, 12));
    PT.add('brass', zTube(zc, zc + 0.856, 0.19, 0.19, 18, RK.x, 3.45)); // and its brass main charge case
    PT.add('brass', zTube(zc + 0.84, zc + 0.856, 0.205, 0.205, 18, RK.x, 3.45));
  }
  // the rammer staff's hooks on the left railing
  const SR = MAX38.STAFF_REST;
  for (const z of [SR.z + 0.7, SR.z + 4.3]) PT.add('dark', rod(V(-RAILING, SR.y - 0.08, z), V(SR.x + 0.02, SR.y - 0.08, z), 0.02, 5));

  // ---- the ammunition wagon on the ring track under the hoist (a 60 cm field railway wagon with a turntable top)
  {
    const z = ZHOIST, y0 = 0.36;
    PT.add('camo', box(1.8, 0.14, 0.86, 0, y0, z));
    for (const dx of [-0.55, 0.55]) for (const dz of [-0.3, 0.3]) {
      const g = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16).rotateZ(Math.PI / 2).translate(dx, 0.13 + 0.17 - 0.02, z + dz);
      PT.add('dark', g);
    }
    for (const dx of [-0.55, 0.55]) PT.add('steel', zTube(z - 0.42, z + 0.42, 0.03, 0.03, 6, dx, 0.28));
    PT.add('dark', yTube(y0 + 0.07, y0 + 0.17, 0.5, 0.5, 24, 0, z));
    PT.add('timber', box(0.6, 0.12, 0.16, 0, y0 + 0.24, z - 0.45));
    PT.add('timber', box(0.6, 0.12, 0.16, 0, y0 + 0.24, z + 0.45));
    for (const dz of [-0.45, 0.45]) for (const sx of [-1, 1]) PT.add('timber', box(0.14, 0.1, 0.16, sx * 0.22, y0 + 0.34, z + dz, 0, 0, sx * 0.5));
    for (const dx of [-0.95, 0.95]) PT.add('dark', box(0.08, 0.12, 0.2, dx, y0, z));
  }

  // ================================================================ cradle (elevation)
  const CR0 = -4.6, CR1 = 2.3;
  PE.add('camo', zTube(CR0, CR1, 0.78, 0.78, 32));
  for (const z of [CR0 + 0.05, -1.6, CR1 - 0.05]) PE.add('steel', zTube(z - 0.05, z + 0.05, 0.82, 0.82, 32));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.7, s * 1.0, 0.42, 0.42, 22));
    PE.add('steel', xTube(s * 1.0, s * 1.5, 0.26, 0.26, 20));
    PE.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(s * 1.0, Math.sin(i * Math.PI / 5) * 0.34, Math.cos(i * Math.PI / 5) * 0.34)), V(s, 0, 0), 0.03));
    PE.add('camo', box(0.06, 0.6, CR1 - CR0 - 0.4, s * 0.76, 0, (CR0 + CR1) / 2)); // side plates
  }
  const cyl = [[-0.45, 0.88, 0.17], [0.45, 0.88, 0.17], [0, -0.92, 0.2]];
  for (const [x, y, r] of cyl) {
    PE.add('camo', zTube(-4.5, 2.0, r, r, 16, x, y));
    PE.add('steel', zTube(-4.58, -4.42, r * 1.12, r * 1.12, 16, x, y));
    for (const z of [-3.2, -1.6, 0.0, 1.5]) PE.add('steel', zTube(z - 0.04, z + 0.04, r * 1.15, r * 1.15, 14, x, y));
    for (const z of [-3.9, -2.4, -0.8, 0.8]) PE.add('camo', box(0.16, Math.abs(y) - 0.7 - r * 0.7, 0.24, x * 0.8, Math.sign(y) * (0.7 + (Math.abs(y) - 0.7 - r * 0.7) / 2), z));
  }
  // the counterweight box, standing up ahead of the trunnions (it folded down flat for travel), on its hinge
  {
    const z0 = -2.75, z1 = -0.75, y0 = 1.08, y1 = 2.75, w = 1.9;
    PE.add('camo', box(w, y1 - y0, z1 - z0, 0, (y0 + y1) / 2, (z0 + z1) / 2));
    PE.add('camo', box(w + 0.08, 0.08, z1 - z0 + 0.08, 0, y1, (z0 + z1) / 2));
    for (const s of [-1, 1]) {
      PE.add('dark', rivetRow(V(s * (w / 2 + 0.005), y0 + 0.1, z0 + 0.06), V(s * (w / 2 + 0.005), y1 - 0.1, z0 + 0.06), 0.18, V(s, 0, 0), 0.026));
      PE.add('dark', rivetRow(V(s * (w / 2 + 0.005), y0 + 0.1, z1 - 0.06), V(s * (w / 2 + 0.005), y1 - 0.1, z1 - 0.06), 0.18, V(s, 0, 0), 0.026));
      PE.add('camo', box(0.1, 0.25, 0.4, s * 0.5, 0.95, z0 + 0.2)); // the hinge lugs at its front foot
      PE.add('camo', rod(V(s * 0.85, 0.75, -0.6), V(s * 0.85, y0 + 0.4, z1 - 0.02), 0.045, 6)); // the stay
    }
    PE.add('steel', xTube(-0.7, 0.7, 0.06, 0.06, 10, 0.95, z0 + 0.2));
    PE.add('dark', rivetRow(V(-w / 2 + 0.1, y0 + 0.1, z0 - 0.005), V(w / 2 - 0.1, y0 + 0.1, z0 - 0.005), 0.18, V(0, 0, -1), 0.026));
    for (const s of [-1, 1]) PE.add('steel', box(0.22, 0.05, 0.05, s * 0.5, y1 + 0.06, (z0 + z1) / 2)); // lifting eyes
  }
  // the elevating arcs under the cradle, with their webs
  for (const s of [-1, 1]) {
    PE.add('steel', gearArc(2.38, 2.6, 18 * DEG, 84 * DEG, 0.16, 34, 0.05).translate(s * 0.55, 0, 0));
    const web = [[0.0, -0.75], [2.2, -0.75]];
    for (let i = 0; i <= 8; i++) { const a = (18 + (66 * i) / 8) * DEG; web.push([2.38 * Math.cos(a), -2.38 * Math.sin(a)]); }
    PE.add('camo', sideProfile(web, 0.06, 0.005).translate(s * 0.55, 0, 0));
  }

  // ================================================================ barrel (recoil) and wedge (breech)
  const ra = (z) => 0.36 + 0.11 * Math.min(1, Math.max(0, (z - (MUZ + 0.6)) / (-2.8 - (MUZ + 0.6))));
  const bp = [[MUZ, 0.19], [MUZ, 0.37], [MUZ + 0.05, 0.395], [MUZ + 0.55, 0.395], [MUZ + 0.6, 0.36]];
  for (let i = 1; i <= 8; i++) { const z = MUZ + 0.6 + ((-2.8 - MUZ - 0.6) * i) / 8; bp.push([z, ra(z)]); }
  // the breech ring: round ahead of the wedge's slot, a square housing round the slot, round again behind it
  const S0 = BRE - 0.55, S1 = BRE - 0.06;
  bp.push([-2.75, 0.52], [3.9, 0.56], [3.95, 0.6], [S0, 0.6], [S0, 0.19], [MUZ + 0.01, 0.19], [MUZ, 0.19]); // a hollow bore: the rounds go in
  // the barrel in plain dark grey, as in the 1918 photographs (the carriage carries the disruptive paint)
  const GT = { tint: 0x7d8276 };
  PR.add('iron', zLathe(bp, 40), GT);
  for (const z of [-9.5, -7.0]) PR.add('iron', zTube(z - 0.035, z + 0.035, ra(z) + 0.012, ra(z) + 0.012, 32), GT);
  for (const z of [-2.75, 0.0, 2.6]) PR.add('iron', zLathe([[z - 0.04, 0.5], [z - 0.04, z < 0 ? 0.535 : 0.575], [z + 0.04, z < 0 ? 0.535 : 0.575], [z + 0.04, 0.5]], 36), GT); // hoop bands (open: the bore runs through)
  PR.add('dark', zTube(MUZ + 0.002, MUZ + 0.7, 0.188, 0.188, 24, 0, 0, true)); // the bore's lining, dark to a stop deep inside
  PR.add('dark', zTube(MUZ + 0.7, MUZ + 0.72, 0.188, 0.188, 24));
  PR.add('steel', zTube(MUZ - 0.003, MUZ + 0.004, 0.25, 0.37, 32, 0, 0, false));
  // the recoil clip well ahead of the cradle, its rods into the cylinders
  const CLIP = -6.0, cr = ra(CLIP) + 0.05;
  PR.add('camo', zTube(CLIP - 0.08, CLIP + 0.08, cr, cr, 30));
  for (const [x, y, r] of cyl) {
    PR.add('camo', rod(V(x * 0.5, Math.sign(y) * cr * 0.9, CLIP), V(x, y, CLIP), 0.08, 8));
    PR.add('camo', box(Math.max(0.16, Math.abs(x) + 0.16), 0.14, 0.16, x / 2, y * 0.75, CLIP));
    PR.add('steel', zTube(CLIP, -4.4, r * 0.32, r * 0.32, 8, x, y));
  }
  // the housing round the wedge's slot (open on the right, where the wedge comes out), the ring's rear and its face
  PR.add('iron', box(1.2, 0.18, S1 - S0, 0, 0.51, (S0 + S1) / 2), GT);
  PR.add('iron', box(1.2, 0.18, S1 - S0, 0, -0.51, (S0 + S1) / 2), GT);
  PR.add('iron', box(0.16, 0.84, S1 - S0, -0.52, 0, (S0 + S1) / 2), GT);
  for (const y of [-0.42, 0.42]) PR.add('dark', box(0.02, 0.02, S1 - S0, 0.6, y, (S0 + S1) / 2));
  PR.add('iron', zLathe([[S1, 0.19], [S1, 0.6], [BRE - 0.03, 0.6], [BRE, 0.57], [BRE, 0.19]], 36), GT);
  PR.add('steel', zLathe([[BRE - 0.01, 0.21], [BRE - 0.01, 0.56], [BRE + 0.012, 0.56], [BRE + 0.012, 0.21], [BRE - 0.01, 0.21]], 36), { tint: 0xb0b0a8 }); // the bright face ring
  PR.add('dark', zTube(S1, BRE + 0.002, 0.19, 0.19, 24, 0, 0, true));
  PR.add('dark', rivets(Array.from({ length: 16 }, (_, i) => V(Math.cos(i / 16 * 6.283) * 0.5, Math.sin(i / 16 * 6.283) * 0.5, BRE + 0.012)), V(0, 0, 1), 0.026));
  const CK = MAX38.CRANK;
  // the wedge's handwheel on top of the ring (a crank shaft to the rack in the housing); kept inside the ring's width
  // so the dipping breech stays clear of the rear wing's decks
  PR.add('camo', box(0.24, 0.2, 0.3, CK.x, CK.y - 0.16, BRE - 0.1));
  PR.add('steel', zTube(BRE - 0.1, CK.z, 0.035, 0.035, 8, CK.x, CK.y));
  PR.add('iron', handwheel(0.2, 5, 0.02, 0.045).rotateY(Math.PI / 2).translate(CK.x, CK.y, CK.z));
  PR.add('brass', box(0.12, 0.08, 0.06, -0.3, 0.42, BRE + 0.03)); // the firing lock's housing
  // the wedge: a block sliding across the ring, its back face bright
  PB.add('camo', box(0.86, 0.8, 0.42, 0, 0, 0));
  PB.add('steel', box(0.84, 0.78, 0.02, 0, 0, 0.215));
  PB.add('steel', box(0.08, 0.3, 0.1, 0.4, 0, 0.12));
  PB.add('dark', rivets(Array.from({ length: 6 }, (_, i) => V(-0.3 + i * 0.12, 0.3, 0.226)), V(0, 0, 1), 0.02));

  // ================================================================ the projectile car (trolley)
  {
    const yr = RAILY - TY; // rail head in the car frame
    const WR = 0.22, wy = yr + WR;
    PC.add('camo', box(0.92, 0.05, 2.1, 0, -0.29, 0.3));
    for (const s of [-1, 1]) {
      PC.add('camo', box(0.03, 0.6, 2.1, s * 0.43, -0.6, 0.3));
      PC.add('camo', box(0.08, 0.05, 2.1, s * 0.455, -0.31, 0.3));
      PC.add('camo', box(0.08, 0.05, 2.1, s * 0.455, -0.88, 0.3));
      for (const z of [-0.4, 0.62]) PC.add('dark', new THREE.CylinderGeometry(0.17, 0.17, 0.012, 16).rotateZ(Math.PI / 2).scale(1, 0.75, 1.25).translate(s * 0.447, -0.6, z)); // the oval lightening holes
      PC.add('dark', rivetRow(V(s * 0.448, -0.33, -0.7), V(s * 0.448, -0.33, 1.3), 0.12, V(s, 0, 0), 0.016));
      PC.add('dark', rivetRow(V(s * 0.448, -0.86, -0.7), V(s * 0.448, -0.86, 1.3), 0.12, V(s, 0, 0), 0.016));
      for (const hz of [-0.05, 1.05]) { // side push handles
        PC.add('dark', rod(V(s * 0.46, -0.45, hz - 0.14), V(s * 0.6, -0.45, hz - 0.06), 0.022, 5));
        PC.add('dark', rod(V(s * 0.46, -0.45, hz + 0.14), V(s * 0.6, -0.45, hz + 0.06), 0.022, 5));
        PC.add('dark', rod(V(s * 0.6, -0.45, hz - 0.06), V(s * 0.6, -0.45, hz + 0.06), 0.022, 5));
      }
    }
    for (const z of [-0.75, 1.35]) PC.add('camo', box(0.92, 0.6, 0.03, 0, -0.6, z));
    // the saddles the shell lies in, and the trough's lips
    for (const z of [-0.35, 0.5]) for (const s of [-1, 1]) PC.add('timber', box(0.18, 0.1, 0.18, s * 0.19, -0.245, z, 0, 0, -s * 0.55));
    for (const s of [-1, 1]) PC.add('camo', box(0.04, 0.12, 2.1, s * 0.4, -0.22, 0.3));
    // axles, axle boxes and the flanged wheels outside the body
    for (const z of [0.1, 1.1]) {
      PC.add('steel', xTube(-0.82, 0.82, 0.045, 0.045, 8, wy, z));
      for (const s of [-1, 1]) {
        PC.add('dark', xTube(s * 0.66, s * 0.78, WR, WR, 22, wy, z));
        PC.add('dark', xTube(s * 0.66, s * 0.68, WR + 0.03, WR + 0.03, 22, wy, z));
        PC.add('dark', box(0.1, 0.16, 0.2, s * 0.53, wy, z));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; PC.add('steel', box(0.02, 0.04, WR * 1.6, s * 0.79, wy, z, a, 0, 0)); }
      }
    }
    // the push bar at the rear
    for (const s of [-1, 1]) PC.add('dark', rod(V(s * 0.38, -0.3, 1.36), V(s * 0.38, 0.0, 1.5), 0.025, 5));
    PC.add('dark', xTube(-0.4, 0.4, 0.025, 0.025, 6, 0.0, 1.5));
  }

  // ================================================================ the hook block and sling (hoist)
  {
    const barY = -(HANG - SHELL.rad);
    PH.add('dark', rbox(0.28, 0.42, 0.22, 0.03, 0, 0.05, 0));
    PH.add('steel', zTube(-0.13, 0.13, 0.13, 0.13, 14, 0, 0.18));
    PH.add('steel', new THREE.TorusGeometry(0.1, 0.03, 6, 14, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.26, 0));
    PH.add('chain', chain(V(0, -0.34, 0), V(0, barY, -0.6), 0.02, 0.055));
    PH.add('chain', chain(V(0, -0.34, 0), V(0, barY, 0.6), 0.02, 0.055));
    PH.add('steel', zTube(-0.62, 0.62, 0.014, 0.014, 6, 0, barY));
  }

  // ================================================================ build
  PF.build(root, { dirt: 0.15, y0: 0 });
  PT.build(trav, { dirt: 0.25, y0: 0 });
  PE.build(elev, { dirt: 0.05, y0: TY });
  PR.build(rec, { dirt: 0.03, y0: TY });
  PB.build(brc, { dirt: 0.03, y0: TY });
  PC.build(car, { dirt: 0.15, y0: TY });
  PH.build(hoist, { dirt: 0.0, y0: MAX38.HOOK.up });
  void PW;

  // the hoist's wire rope: a pair of unit strands from the sheave to the block, scaled in update()
  const ropeMat = rig.mats.rope;
  const unit = new THREE.CylinderGeometry(0.018, 0.018, 1, 5).translate(0, -0.5, 0);
  const strands = [-0.06, 0.06].map((dz) => { const m = new THREE.Mesh(unit, ropeMat); m.position.set(0, SHV - 0.2, ZHOIST + dz); trav.add(m); return m; });

  // ---- anchors and setters
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, elev, 'tray', 0, 0, ZB);
  anchor(rig, trav, 'eye', 0, TY + 0.3, 0.2);
  anchor(rig, trav, 'shellStack', 0, WAGON_Y, ZHOIST);
  rig.anchors.wagon = rig.anchors.shellStack;
  // the shell on the car and under the hook, for viewers that show them without a crew
  const addShell = (where, parent, y) => {
    const g = new THREE.Group();
    g.name = 'shell-' + where;
    const s = shellGeometry(SHELL.len, SHELL.rad);
    for (const [geo, m] of [[s.body, rig.mats.shell], [s.band, rig.mats.brass], [s.fuze, rig.mats.steel]]) g.add(new THREE.Mesh(geo, m));
    g.position.y = y;
    g.visible = false;
    parent.add(g);
    rig.props[where] = g;
  };
  addShell('tray', car, 0);
  addShell('hoist', hoist, -HANG);
  rig.props.trolley = rig.props.tray;
  rig.props.crane = rig.props.hoist;
  rig.shell = { len: SHELL.len, rad: SHELL.rad };

  rig.breechOpen = { axis: 'x', angle: WEDGE };
  rig.setBreech = (k) => { brc.position.x = Math.min(1, Math.max(0, k)) * WEDGE; };
  rig.setTrolley = (z) => { car.position.z = z; };
  rig.setHoist = (y) => { hoist.position.y = y; };
  // the car is the drill's (render/ww1/max38.js moves it with the shell): render/guns.js's per-frame setTray must not
  // fight it on the frames a distant crew is not updated, so setTray leaves it where the drill put it
  rig.setTray = () => {};
  // the stroke the well allows: the breech ring's lowest edge stays clear of the floor at high angles
  rig.recoilFade = (el) => {
    if (el <= 0.05) return 1;
    const room = (TY - 0.08 - 0.6 * Math.cos(el)) / Math.sin(el) - BRE;
    return Math.min(1, Math.max(0.22, room / RECOIL));
  };
  rig.update = () => {
    const len = Math.max(0.05, SHV - 0.2 - (hoist.position.y + 0.2));
    for (const m of strands) m.scale.y = len;
  };
  rig.update();

  hb(rig, -RDISC, 0, -RDISC, RDISC, BED, RDISC);
  hb(rig, -RAILING, GB, -HALF - 0.4, RAILING, WALK + 1.0, HALF + 0.4);
  hb(rig, -1.0, TY - 1.0, -12, 1.0, TY + 2.8, 5.4);
  hb(rig, -LX, WALK, ZHOIST - 0.4, LX, 6.9, ZHOIST + 0.4);

  // ---- crew spots (traverse frame, y = the floor). The drill (render/ww1/max38.js) moves them; the list order is
  // also the order the men fall out (the last first).
  const E = -Math.PI / 2, Wd = Math.PI / 2, N = 0;
  crewSpot(rig, 'chief', -2.05, WALK, -4.0, E, 'point');
  crewSpot(rig, 'layer', -2.1, WALK, pz, E, 'lay');
  crewSpot(rig, 'traverser', 2.08, WALK, tz, Wd, 'operate');
  crewSpot(rig, 'lanyard', 1.95, WALK, 4.75, 1.2, 'lanyard');
  crewSpot(rig, 'rammer1', -1.7, WALK, 8.4, E, 'stand');
  crewSpot(rig, 'rammer2', -1.7, WALK, 9.3, E, 'stand');
  crewSpot(rig, 'car1', -1.12, WALK, ZWAIT, N, 'stand');
  crewSpot(rig, 'car2', -1.12, WALK, ZWAIT + 1.0, N, 'stand');
  crewSpot(rig, 'charge1', 1.9, WALK, 10.9, Wd, 'stand');
  crewSpot(rig, 'charge2', 1.9, WALK, 11.9, Wd, 'stand');
  crewSpot(rig, 'hoist', 2.0, WALK, MAX38.WINCH.z, E, 'operate');
  crewSpot(rig, 'sling', 1.3, 0, ZHOIST - 0.05, Wd, 'stand');
  crewSpot(rig, 'rammer3', -1.7, WALK, 10.2, E, 'stand');
  crewSpot(rig, 'rammer4', -1.7, WALK, 11.1, E, 'stand');
  return finishGun(rig);
}

// ==================================================================== the position
// buildMax38Site(seed) -> { root, bogies }: the works round the bed, in the rig's frame at zero traverse (ground
// y = 0, the bed's middle at the origin, -Z the zero line). The approach spur (standard gauge) runs in along +X up a
// ramp to the bed's edge, with the carriage's four bogies standing on it where they were run out; a 60 cm field
// railway runs back (+Z) from the ring track to two shell magazines; an earth bank rings the bed with gaps for the
// railways; the gantry crane that set the gun up stands over the spur; a charge store, the battery's command dugout
// and huts, cartridge containers and shells on wagons, camouflage nets over the stores and the bogies.
export function buildMax38Site(seed = 1) {
  const rnd = mulberry32(seed * 7919 + 38);
  const mats = vehicleMats('bunt');
  CONC ??= concreteMat();
  const et = earthTextures();
  const earth = new THREE.MeshStandardMaterial({ map: et.map, normalMap: et.normal, roughness: 1, metalness: 0, vertexColors: true });
  const ballast = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 1, metalness: 0, vertexColors: true });
  const net = new THREE.MeshStandardMaterial({ map: createHeavyScrimTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0, vertexColors: true });
  const M = { ...mats, concrete: CONC, earth, ballast, net };
  const root = new THREE.Group();
  root.name = 'max38-site';
  const P = new Parts(M), PB = new Parts(M);
  const earthG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); projectUV(n, 8); P.add('earth', n, { uv: true }); };
  const ballastG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); projectUV(n, 3); P.add('ballast', n, { uv: true }); };

  // ---- the earth bank: a ring with gaps for the spur (+X), the field railway (+Z) and a way in on the left (-X)
  {
    const prof = [[23.8, -0.4], [23.5, 0], [20.8, 2.0], [20.2, 2.15], [19.4, 2.1], [17.5, 0], [17.3, -0.4]].map(([r, y]) => new THREE.Vector2(r, y));
    const gaps = [[0, 0.2], [Math.PI / 2, 0.16], [Math.PI * 1.5, 0.1]]; // [centre angle (from +Z toward +X), half width]
    const segs = [];
    const twoPi = Math.PI * 2;
    // lathe phi: x = r sin(phi), z = r cos(phi): phi 0 is +Z, PI/2 is +X
    const cuts = gaps.map(([c, w]) => [c - w, c + w]).sort((a, b) => a[0] - b[0]);
    let start = cuts[0][1];
    for (let i = 1; i <= cuts.length; i++) {
      const end = i < cuts.length ? cuts[i][0] : cuts[0][0] + twoPi;
      segs.push([start, end - start]);
      if (i < cuts.length) start = cuts[i][1];
    }
    for (const [a0, len] of segs) earthG(new THREE.LatheGeometry(prof, Math.max(6, Math.round(len * 18)), a0, len));
    // revetted ends at the gaps: timber walls
    for (const [c, w] of gaps) for (const e of [-1, 1]) {
      const a = c + e * w, g = box(0.15, 2.0, 3.0, 0, 1.0, 0).translate(0, 0, 19.1).rotateY(a);
      P.add('timber', g);
    }
  }
  // ---- the approach spur: a ballast ramp from the bed's edge down to the ground, sleepers and rails, a buffer stop
  const SP = { x0: RDISC + 0.4, x1: 64, top: BED };
  const spurY = (x) => (x < SP.x0 + 6 ? SP.top : x > 50 ? 0 : SP.top * (1 - (x - SP.x0 - 6) / (50 - SP.x0 - 6)));
  {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const xa = SP.x0 + ((SP.x1 - SP.x0) * i) / n, xb = SP.x0 + ((SP.x1 - SP.x0) * (i + 1)) / n, ya = spurY(xa) - 0.25, yb = spurY(xb) - 0.25;
      // a trapezoid section: top 3.6 m wide, sides to the ground
      const prof = [[-1.8, 0], [1.8, 0], [1.8 + Math.max(0.6, ya * 1.4), -ya - 0.3], [-1.8 - Math.max(0.6, ya * 1.4), -ya - 0.3]];
      const pos = [];
      const q = (p, x, y) => [x, y + p[1], p[0]];
      for (let k = 0; k < 4; k++) {
        const p0 = prof[k], p1 = prof[(k + 1) % 4];
        const A = q(p0, xa, ya), B = q(p1, xa, ya), C = q(p1, xb, yb), D = q(p0, xb, yb);
        pos.push(...A, ...C, ...B, ...A, ...D, ...C);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      ballastG(g);
    }
    for (let x = SP.x0 + 0.4; x < SP.x1; x += 0.75) P.add('timber', box(0.24, 0.14, 2.5, x, spurY(x) - 0.18, 0, 0, 0, Math.atan2(spurY(x + 0.1) - spurY(x), 0.1)));
    for (const z of [-0.7175, 0.7175]) for (let i = 0; i < n; i++) {
      const xa = SP.x0 + ((SP.x1 - SP.x0) * i) / n, xb = SP.x0 + ((SP.x1 - SP.x0) * (i + 1)) / n;
      P.add('steel', rod(V(xa, spurY(xa) - 0.05, z), V(xb, spurY(xb) - 0.05, z), 0.04, 4));
    }
    // the buffer stop at the bed's edge
    P.add('timber', box(0.4, 0.5, 2.6, SP.x0 + 0.3, BED - 0.1, 0));
    for (const z of [-0.9, 0.9]) P.add('dark', rod(V(SP.x0 + 1.6, BED - 0.25, z), V(SP.x0 + 0.4, BED + 0.1, z), 0.06, 6));
  }
  // ---- the carriage's bogies on the spur: two 5-axle (1.36 m pitch) and two 4-axle (1.31 m) trucks, 950 mm wheels
  const bogies = [];
  {
    const R = 0.475;
    const truck = (axles, pitch, x) => {
      const Q = new Parts(M), g = new THREE.Group();
      const L = (axles - 1) * pitch;
      for (const s of [-1, 1]) {
        Q.add('camo', box(0.14, 0.42, L + 1.0, s * 1.02, R + 0.25, 0));
        Q.add('dark', rivetRow(V(s * 1.095, R + 0.4, -L / 2 - 0.4), V(s * 1.095, R + 0.4, L / 2 + 0.4), 0.2, V(s, 0, 0), 0.02));
        for (let i = 0; i < axles; i++) {
          const z = -L / 2 + i * pitch;
          Q.add('dark', box(0.24, 0.3, 0.32, s * 1.0, R, z));
          for (let k = 0; k < 4; k++) Q.add('dark', box(0.1, 0.025, 0.9 - k * 0.16, s * 1.02, R + 0.2 + k * 0.03, z));
          Q.add('steel', xTube(s * 0.66, s * 0.8, R, R, 26, R, z));
          Q.add('steel', xTube(s * 0.66, s * 0.68, R + 0.035, R + 0.035, 26, R, z));
          Q.add('dark', new THREE.CylinderGeometry(R - 0.04, R - 0.04, 0.04, 22).rotateZ(Math.PI / 2).translate(s * 0.72, R, z));
        }
      }
      for (let i = 0; i < axles; i++) Q.add('steel', xTube(-0.95, 0.95, 0.07, 0.07, 10, R, -L / 2 + i * pitch));
      Q.add('camo', box(2.2, 0.3, 1.4, 0, R + 0.5, 0)); // the bolster with its centre pivot
      Q.add('steel', yTube(R + 0.65, R + 0.75, 0.42, 0.42, 22, 0, 0));
      Q.add('camo', box(2.2, 0.2, 0.3, 0, R + 0.3, -L / 2 - 0.5));
      Q.add('camo', box(2.2, 0.2, 0.3, 0, R + 0.3, L / 2 + 0.5));
      Q.build(g, { dirt: 0.35, y0: 0 });
      const y = spurY(x);
      g.position.set(x, y - 0.05, 0);
      g.rotation.y = Math.PI / 2;
      g.rotation.x = -Math.atan2(spurY(x + 1) - spurY(x - 1), 2);
      root.add(g);
      bogies.push(g);
    };
    truck(5, 1.36, 17.2);
    truck(5, 1.36, 24.6);
    truck(4, 1.31, 32.4);
    truck(4, 1.31, 38.9);
    // their camouflage net, draped on poles
    const NZ = 3.8, x0 = 13.6, x1 = 42.5;
    for (let x = x0; x <= x1 + 0.1; x += (x1 - x0) / 4) for (const z of [-NZ, NZ]) P.add('timber', yTube(0, 2.6 + spurY(x) * 0.6, 0.06, 0.05, 6, x, z));
    PB.add('net', drape(x0, x1, -NZ, NZ, (x) => 2.4 + spurY(x) * 0.6 + 0.4, rnd));
  }
  // ---- the gantry crane that set the gun down, parked over the spur beyond the bogies (rails beside the spur)
  {
    const cx = 52, span = 13, H = 9.5, y0 = 0;
    for (const z of [-span / 2, span / 2]) {
      P.add('steel', box(18, 0.1, 0.07, cx, y0 + 0.08, z));
      for (let x = cx - 9; x < cx + 9; x += 0.8) P.add('timber', box(0.22, 0.1, 1.0, x, y0 + 0.02, z));
      // an A-frame leg on its sill and wheels
      P.add('camo', box(3.6, 0.5, 0.5, cx, y0 + 0.55, z));
      for (const dx of [-1.4, 1.4]) P.add('dark', zTube(z - 0.1, z + 0.1, 0.32, 0.32, 16, cx + dx, y0 + 0.32));
      for (const dx of [-1.6, 1.6]) P.add('camo', rod(V(cx + dx, y0 + 0.8, z), V(cx + dx * 0.25, H, z), 0.14, 6));
      for (let k = 1; k < 5; k++) { const t = k / 5, y = y0 + 0.8 + (H - 0.8) * t, w = 1.6 * (1 - t * 0.75); P.add('camo', rod(V(cx - w, y, z), V(cx + w, y, z), 0.05, 5)); if (k < 4) P.add('camo', rod(V(cx - w, y, z), V(cx + 1.6 * (1 - (t + 0.2) * 0.75), y + (H - 0.8) * 0.2, z), 0.035, 4)); }
    }
    // the bridge girder: two lattice trusses, the crab with its winch and the hook
    for (const dx of [-0.6, 0.6]) {
      P.add('camo', rod(V(cx + dx, H, -span / 2 - 0.6), V(cx + dx, H, span / 2 + 0.6), 0.09, 6));
      P.add('camo', rod(V(cx + dx, H + 1.4, -span / 2 - 0.6), V(cx + dx, H + 1.4, span / 2 + 0.6), 0.09, 6));
      for (let z = -span / 2 - 0.6, i = 0; z < span / 2 + 0.6; z += 1.1, i++) {
        P.add('camo', rod(V(cx + dx, H, z), V(cx + dx, H + 1.4, z), 0.04, 4));
        P.add('camo', rod(V(cx + dx, i % 2 ? H : H + 1.4, z), V(cx + dx, i % 2 ? H + 1.4 : H, z + 1.1), 0.035, 4));
      }
    }
    for (let z = -span / 2; z <= span / 2; z += 2.2) P.add('camo', rod(V(cx - 0.6, H + 1.4, z), V(cx + 0.6, H + 1.4, z), 0.04, 4));
    P.add('camo', box(1.8, 0.9, 1.6, cx, H + 1.9, 1.2));
    for (const dx of [-0.6, 0.6]) for (const dz of [-0.55, 0.55]) P.add('dark', xTube(cx + dx - 0.05, cx + dx + 0.05, 0.2, 0.2, 12, H + 1.5, 1.2 + dz));
    P.add('iron', xTube(cx - 0.5, cx + 0.5, 0.3, 0.3, 16, H + 2.0, 1.2));
    P.add('rope', rod(V(cx, H + 1.4, 1.2), V(cx, 5.2, 1.2), 0.03, 5));
    P.add('dark', box(0.4, 0.6, 0.3, cx, 4.9, 1.2));
    P.add('steel', new THREE.TorusGeometry(0.16, 0.04, 6, 14, Math.PI * 1.4).rotateZ(Math.PI * 0.8).translate(cx, 4.45, 1.2));
  }
  // ---- the field railway (60 cm) from the ring track back to the shell magazines, a turntable where it joins
  {
    const z0 = RAMMO + 0.4, z1 = 44;
    for (let z = z0; z < z1; z += 0.8) P.add('timber', box(1.0, 0.07, 0.14, 0, 0.035, z));
    for (const x of [-0.3, 0.3]) P.add('steel', box(0.05, 0.07, z1 - z0, x, 0.095, (z0 + z1) / 2));
    // the branch to the charge store on the left
    for (let t = 0; t < 1; t += 0.04) {
      const x = -t * 18, z = 30 - t * 4;
      P.add('timber', box(1.0, 0.07, 0.14, x, 0.035, z, 0, Math.atan2(-4, 18) + Math.PI / 2, 0));
    }
    for (const dz of [-0.3, 0.3]) P.add('steel', rod(V(0, 0.095, 30 + dz), V(-18, 0.095, 26 + dz), 0.03, 4));
    // shell wagons waiting on the line, the next rounds on them
    const sg = shellGeometry(SHELL.len, SHELL.rad);
    for (const z of [19.5, 22.4]) {
      P.add('camo', box(1.0, 0.14, 1.8, 0, 0.36, z));
      for (const dz of [-0.55, 0.55]) for (const dx of [-0.3, 0.3]) P.add('dark', new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14).rotateZ(Math.PI / 2).translate(dx, 0.28, z + dz));
      for (const dx of [-0.24, 0.24]) {
        for (const dz of [-0.55, 0.55]) P.add('timber', box(0.2, 0.08, 0.14, dx, 0.47, z + dz));
        for (const [geo, k] of [[sg.body, 'shell'], [sg.band, 'brass'], [sg.fuze, 'steel']]) P.add(k, geo.clone().translate(dx, 0.51 + SHELL.rad, z));
      }
    }
  }
  // ---- magazines: two concrete shell stores with earth over them, a charge store on the left
  const bunker = (x, z, w, d, h, door) => {
    const Q = new Parts(M);
    conc(Q, box(w, h, d, x, h / 2, z), 0xd0ccc4);
    conc(Q, box(w + 0.6, 0.4, d + 0.6, x, h + 0.2, z), 0xc8c4bc);
    earthG(box(w + 3, 1.0, d + 3, x, h + 0.9, z));
    Q.add('dark', box(1.4, 2.0, 0.08, x + door * 0, 1.0, z - d / 2 - 0.02));
    Q.add('camo', box(1.3, 1.9, 0.05, x - 0.2, 0.98, z - d / 2 - 0.08, 0, 0.35, 0)); // the steel door, ajar
    for (const s of [-1, 1]) conc(Q, box(0.5, h, 2.0, x + s * 1.2, h / 2, z - d / 2 - 1.0), 0xc4c0b8); // the entrance's blast walls
    Q.build(root, { dirt: 0.2 });
  };
  bunker(-6.5, 46, 7, 5, 3.0, 0);
  bunker(6.5, 46, 7, 5, 3.0, 0);
  bunker(-22, 26, 6, 4.5, 2.6, 0);
  // cartridge containers by the charge store (the round tins of the 38er photograph)
  for (let i = 0; i < 7; i++) {
    const x = -24.5 + (i % 4) * 0.62, z = 22.2 + Math.floor(i / 4) * 1.0;
    P.add('steel', zTube(z - 0.45, z + 0.45, 0.27, 0.27, 16, x, 0.27), { tint: 0x9aa08a });
    P.add('dark', zTube(z - 0.47, z - 0.43, 0.28, 0.28, 16, x, 0.27));
  }
  // the battery's command dugout: concrete with a periscope, a telephone line on poles back to it
  {
    conc(P, box(5, 2.2, 4, -31, 1.1, 2), 0xccc8c0);
    earthG(box(7, 1.0, 6, -31, 2.6, 2));
    P.add('dark', box(1.2, 1.9, 0.08, -31, 0.95, -0.04));
    P.add('dark', yTube(2.8, 4.2, 0.05, 0.05, 8, -30.2, 1.5));
    P.add('dark', box(0.14, 0.12, 0.25, -30.2, 4.25, 1.4));
    for (let i = 0; i < 5; i++) {
      const x = -31 - i * 8, z = -6 - i * 3;
      if (i === 0) continue;
      P.add('timber', yTube(0, 5.2, 0.09, 0.07, 7, x, z));
      P.add('timber', box(0.8, 0.07, 0.07, x, 5.0, z));
    }
  }
  // huts for the crew and the workshop, timber and rail stacks
  const hut = (x, z, w, d, ang) => {
    const Q = new Parts(M), g = new THREE.Group();
    Q.add('timber', box(w, 2.3, d, 0, 1.15, 0));
    for (const s of [-1, 1]) Q.add('cloth', box(w + 0.4, 0.06, d / 2 + 0.5, 0, 2.6, s * (d / 4 + 0.15), s * 0.38, 0, 0), { tint: 0x6a6658 });
    Q.add('dark', box(0.9, 1.8, 0.06, w / 4, 0.9, -d / 2 - 0.02));
    Q.add('dark', box(0.6, 0.5, 0.06, -w / 4, 1.5, -d / 2 - 0.02));
    Q.build(g, { dirt: 0.3 });
    g.position.set(x, 0, z);
    g.rotation.y = ang;
    root.add(g);
  };
  hut(26, 22, 6, 4, -0.5);
  hut(30, 30, 8, 4.5, -0.4);
  for (let i = 0; i < 9; i++) P.add('timber', box(0.25, 0.25, 4.5, 22 + (i % 3) * 0.28, 0.13 + Math.floor(i / 3) * 0.25, 12 + rnd() * 0.2));
  for (let i = 0; i < 6; i++) P.add('steel', box(0.07, 0.15, 9, 18.5 + i * 0.16, 0.08, -14 + rnd() * 0.3));
  // the nets over the stores
  for (const [x, z, w, d] of [[0, 46, 22, 9], [-22, 25, 10, 9]]) {
    for (const s of [-1, 1]) for (const t of [-1, 1]) P.add('timber', yTube(0, 4.6, 0.06, 0.05, 6, x + s * w / 2, z + t * d / 2));
    PB.add('net', drape(x - w / 2, x + w / 2, z - d / 2, z + d / 2, () => 4.8, rnd));
  }
  P.build(root, { dirt: 0.2 });
  PB.build(root, { dirt: 0 });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== net; o.receiveShadow = true; } });
  return { root, bogies };
}

// a camouflage net between poles: a sagging sheet over x0..x1, z0..z1, its edges pulled down toward the ground
function drape(x0, x1, z0, z1, top, rnd) {
  const nx = Math.max(4, Math.round((x1 - x0) / 1.5)), nz = Math.max(4, Math.round((z1 - z0) / 1.5));
  const g = new THREE.PlaneGeometry(1, 1, nx, nz).rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getZ(i) + 0.5, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const sag = 0.35 * Math.sin(u * Math.PI * nx / 2) ** 2 * Math.sin(v * Math.PI * nz / 2) ** 2 + (rnd() - 0.5) * 0.12;
    const y = top(x) - sag - (edge < 0.001 ? 1.4 : 0);
    p.setXYZ(i, x + (edge < 0.001 ? (u < 0.001 ? -1 : u > 0.999 ? 1 : 0) : 0), y, z + (edge < 0.001 ? (v < 0.001 ? -1 : v > 0.999 ? 1 : 0) : 0));
    uv.setXY(i, x / 6, z / 6);
  }
  g.computeVertexNormals();
  return g;
}

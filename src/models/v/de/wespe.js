import * as THREE from 'three';
import { V, DEG, box, xTube, yTube, zTube, rod, sideProfile, loft, rivets, rivetRow } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, ring, L90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, grip } from './common.js';
import { buildLeFH18 } from './lefh18.js';
import { trackGear, trackDrive, doubleRoadWheel, sprocketParts, rollerParts, shoeParts, handwheelZ, tool, notek, silencer, roundBin } from './sp_kit.js';

/**
 * 10.5 cm leFH 18/2 auf Fahrgestell Panzerkampfwagen II (Sf.), Sd.Kfz. 124 "Wespe" (Alkett / FAMO, 1943 to 1944).
 * Overall 4.81 m long, 2.28 m wide, 2.30 m high, 11 t; crew five; 32 rounds; 5 to 30 mm of armour, the open fighting
 * compartment of 10 mm plate (the Panzermuseum Munster's placard; Wikipedia "Wespe"). The Panzer II Ausf. F's running
 * gear: five rubber-tyred road wheels a side (550 mm), close together, on quarter-elliptic leaf springs, three return
 * rollers (the tank has four), the big plain drive sprocket at the front and the spoked idler, raised, at the rear,
 * 300 mm tracks. The Maybach HL 62 moved forward to the middle, under the hull roof, its cooling air through two
 * louvres in each side of the hull above the fenders.
 *
 * Outline, read off the photographs of the Saumur, Munster and Kubinka vehicles and the wartime ones (refs/wespe):
 * a short nose plate, then the long glacis up to the hull roof at 1.42 m; the driver's small armoured box stands out
 * of the glacis left of the middle (his visor flap is its front, a slit in its left face, the hatch in its roof). The
 * hull's sides above the fenders stand some 0.2 m inside the fenders' edge, and the fighting compartment's 10 mm
 * walls stand on them, leaning in: two front plates either side of the slot the gun elevates in, each side level at
 * 2.30 m as far as the gun, then falling to the rear, the low rear flap; the compartment overhangs the hull's rear
 * by a quarter of a metre. The cradle stands well out of the slot (the buffer's head some
 * 0.7 m ahead of the front plates) and the muzzle brake ends about over the nose, so the barrel adds nothing to the
 * 4.81 m. Unmeasured fittings reconstructed from the photographs; the rear (no photograph of it found) is the
 * Panzer II's with the silencer across the hull's rear plate, under the overhang.
 *
 * The gun is the leFH 18 model's own cradle, barrel, muzzle brake and sliding block (lefh18.js buildLeFH18, its
 * `elevation` pivot taken over whole) on a short pedestal mounting with its two cheeks, the panoramic sight on the
 * left cheek, and the curved inner shield round the mounting behind the slot.
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the middle of the hull, front -Z. The game turns the gun to any
 * bearing (GUNS.wespe traverse 180 degrees): the gun's own 17 degrees either way are folded into the hull pivoting on
 * its tracks, so `traverse` is the whole vehicle (hull, running gear, gun and the crew with it) about the hull's middle,
 * and rig.setTraverse runs the tracks against each other as it turns. `elevation` the trunnions in the compartment,
 * `recoil` the barrel, `breech` the block (slides out to the right). rig.setDrive(v) (m/s, + forward; rig.update(dt)
 * integrates it) and rig.driveBy(d) run the tracks; anchors.exhaust the silencer's outlet; rig.groundStock the ready
 * rounds on the ground behind (hidden while it drives); rig.passShell the round the man on the ground hands up
 * (render/de/wespe.js); rig.spec the drill's stations in the vehicle's frame.
 * buildWespe({ scheme: 'dgelb' | 'feldgrau' })
 */
const TX = 0.99, TW = 0.3, TH = 0.05, PITCH = 0.095; // track centres, track width, link thickness, pitch
const RW = 0.275, WY = RW + TH; // road wheel radius over the tyre (550 mm), its centre height
const WZ = [-1.2, -0.6, 0, 0.6, 1.2]; // five stations 0.6 m apart: the tyres all but touch (the Saumur side views)
// the sprocket about 1.3 road wheels across over its teeth, the idler a road wheel's size with its top near the track's
// upper run (refs/wespe "Read off the photographs")
const SPR = { z: -1.9, y: 0.6, r: 0.33 }, IDL = { z: 1.92, y: 0.62, r: 0.28 };
const ROLL = [[-1.1, 0.83], [0.05, 0.84], [1.2, 0.83]].map(([z, y]) => ({ z, y, r: 0.11 })); // three return rollers
const HX = 0.8, HF = -2.3, HRL = 2.2, BELLY = 0.36; // hull half width between the tracks, its nose, its rear plate, belly
const DECK = 1.05, FX = 1.14; // the fenders' height and their outer edge (2.28 m over them)
// the hull's roof, and the half width of its sides above the fenders (a fender ledge a little narrower than a track
// beside them; the photographs allow 0.85 to 0.95 m, and under 0.93 the loader finds no room beside the breech)
const ROOF = 1.42, SX = 0.93;
const GZ0 = -1.9, GY0 = 0.92, GZ1 = -0.75; // the glacis: from the nose plate's rear edge up to the roof
const FY = 0.98; // the fighting compartment's floor (the men's; the real one is a well between two sponsons)
const F0 = 0.0; // where that floor begins: ahead of it the hull roof runs on under the front plates as a shelf
const TRY = 2.02, TRZ = 0.65; // the trunnions (bore height 2.02 m: the cradle's tail clears the floor at 42 degrees)
// The compartment: the rear plate's foot, the walls' top at the front and at the rear corners, the front plates' foot
// and top (they lean back), where the sides' top begins to fall, and the tangent of their inward lean (the head-on
// photographs show nearer 9 degrees, the top about five sixths as wide as the foot: 7 leaves the men their room)
const HR = 2.45, TOP = 2.3, REAR = 1.85, FZ0 = -0.5, FZ1 = -0.27, ZT = 0.65, LEAN = Math.tan(7 * DEG);
const S0 = 0.2, S1 = 0.33; // the slot's half width at the front plates' foot and at their top
const MZ = 0.44 - 2.94; // the leFH 18's muzzle from its trunnions (lefh18.js)

// A flat plate through the points of a (near enough) plane polygon, `t` thick toward the side its normal leaves
function plate(pts, t = 0.012) {
  const n = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize().multiplyScalar(t);
  return loft([pts, pts.map((p) => p.clone().add(n))]);
}

// The Panzer II's idler: a painted wheel of two flat rims on eight broad spokes round a dished hub (sp_kit.js's is the
// Panzer IV's bare steel one)
function idler(P, s) {
  const r = IDL.r, w = 0.06, gap = 0.07;
  for (const k of [-1, 1]) {
    const c = k * (gap / 2 + w / 2);
    P.add('camo', ring(r - 0.045, r, c - w / 2, c + w / 2, 26));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      P.add('camo', box(0.02, r - 0.11, 0.07, c, Math.cos(a) * (r * 0.5 + 0.035), Math.sin(a) * (r * 0.5 + 0.035), a - Math.PI / 2));
    }
    P.add('camo', xTube(c - 0.012, c + 0.012, 0.13, 0.13, 18));
  }
  P.add('camo', xTube(-gap / 2 - w, gap / 2 + w, 0.07, 0.07, 14));
  P.add('dark', xTube(s * (gap / 2 + w), s * (gap / 2 + w + 0.05), 0.06, 0.045, 12));
}

export function buildWespe({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  // ---------------------------------------------------------------- running gear
  const gear = trackGear(trav, {
    tx: TX, th: TH, pitch: PITCH, parts: rig.part,
    wheels: WZ.map((z) => ({ z, y: WY, r: RW })), sprocket: SPR, idler: IDL, rollers: ROLL,
    wheel: (P, s) => doubleRoadWheel(P, s, { r: RW, w: 0.085, gap: 0.075, tyre: 0.045, bolts: 8, hub: 0.075 }),
    sprocketP: (P, s) => sprocketParts(P, s, { r: SPR.r, teeth: 22, w: 0.055, gap: 0.07, holes: 0 }), // a plain dished disc
    idlerP: idler,
    rollerP: (P, s) => rollerParts(P, s, { r: 0.11, w: 0.05, gap: 0.06 }),
    shoe: (P) => shoeParts(P, { w: TW, pitch: PITCH, t: 0.028, horn: 0.06 }),
  });
  const drive = trackDrive(rig, trav, gear, TX);

  // ---------------------------------------------------------------- hull
  const H = rig.part();
  const gy = (z) => GY0 + (ROOF - GY0) * (z - GZ0) / (GZ1 - GZ0); // the glacis' top at z
  const GS = Math.atan2(ROOF - GY0, GZ1 - GZ0); // its slope
  {
    // the hull box between the tracks: the rounded nose, the nose plate, the glacis up to the roof, the rear plate (its
    // top is cut down to the compartment's floor behind F0), and over it the wider upper hull from the fenders up to
    // the roof, a wedge under the glacis
    const prof = [[HF + 0.05, 0.42], [HF + 0.25, BELLY], [HRL - 0.2, BELLY], [HRL, 0.5], [HRL, FY], [F0, FY], [F0, ROOF], [GZ1, ROOF], [GZ0, GY0], [HF, 0.84], [HF, 0.55]];
    H.add('camo', sideProfile(prof, 2 * HX, 0.015));
    const zf = GZ0 + (GZ1 - GZ0) * (DECK - 0.05 - GY0) / (ROOF - GY0);
    H.add('camo', sideProfile([[zf, DECK - 0.05], [F0, DECK - 0.05], [F0, ROOF], [GZ1, ROOF]], 2 * SX));
    for (const s of [-1, 1]) {
      // the leaf-spring suspension: a swing arm and its quarter-elliptic spring per station, the bump stops
      for (const z of WZ) {
        H.add('dark', rod(V(s * HX, WY + 0.2, z - 0.26), V(s * (TX - 0.16), WY, z), 0.035, 6));
        H.add('camo', box(0.07, 0.05, 0.42, s * (HX + 0.04), WY + 0.26, z - 0.15, 0.18));
        for (let k = 1; k < 4; k++) H.add('dark', box(0.065, 0.012, 0.42 - k * 0.08, s * (HX + 0.04), WY + 0.26 - k * 0.018, z - 0.15 - k * 0.03, 0.18));
        H.add('dark', box(0.08, 0.06, 0.06, s * (HX + 0.04), WY + 0.33, z + 0.12));
      }
      // the return rollers' stubs, the final drive housing behind the sprocket, the idler's crank and its adjuster
      for (const r of ROLL) H.add('dark', xTube(s * HX, s * (TX - 0.1), 0.03, 0.03, 6, r.y, r.z));
      H.add('camo', xTube(s * HX, s * (TX - 0.13), 0.19, 0.17, 16, SPR.y, SPR.z));
      H.add('dark', rivets([0, 1, 2, 3, 4, 5, 6, 7].map((k) => V(s * (TX - 0.13), SPR.y + Math.cos(k * Math.PI / 4) * 0.13, SPR.z + Math.sin(k * Math.PI / 4) * 0.13)), V(s, 0, 0), 0.012));
      H.add('camo', rod(V(s * HX, 0.72, IDL.z - 0.25), V(s * (TX - 0.12), IDL.y, IDL.z), 0.045, 8));
      H.add('dark', zTube(IDL.z - 0.45, IDL.z - 0.2, 0.02, 0.02, 6, s * (HX + 0.02), 0.74));
      // the fenders over the tracks, one run from the sprocket to the compartment's rear, their front ends bent down
      H.add('camo', box(FX - HX + 0.02, 0.012, HR - HF - 0.35, s * (HX + FX) / 2, DECK, (HF + 0.35 + HR) / 2));
      H.add('camo', box(FX - HX + 0.02, 0.012, 0.38, s * (HX + FX) / 2, DECK - 0.1, HF + 0.16, -0.55));
      H.add('camo', box(0.012, 0.06, HR - HF - 0.35, s * FX, DECK - 0.03, (HF + 0.35 + HR) / 2));
      H.add('camo', box(FX - HX + 0.02, 0.012, 0.16, s * (HX + FX) / 2, DECK - 0.06, HR + 0.05, 0.75)); // the rear mud flap
      H.add('dark', rivetRow(V(s * (FX + 0.007), DECK - 0.03, HF + 0.45), V(s * (FX + 0.007), DECK - 0.03, HR - 0.1), 0.2, V(s, 0, 0), 0.008));
      // tow shackles front and rear
      for (const [z, d] of [[HF, -1], [HRL, 1]]) {
        H.add('camo', box(0.06, 0.16, 0.14, s * 0.62, 0.52, z + d * 0.06));
        H.add('steel', new THREE.TorusGeometry(0.06, 0.016, 6, 12).rotateY(Math.PI / 2).translate(s * 0.62, 0.5, z + d * 0.16));
      }
      // riveted seams: along the lower hull's side, and where the glacis' side plate meets the engine room's
      H.add('dark', rivetRow(V(s * (HX + 0.004), DECK - 0.1, HF + 0.4), V(s * (HX + 0.004), DECK - 0.1, HRL - 0.1), 0.18, V(s, 0, 0), 0.01));
      H.add('dark', rivetRow(V(s * (SX + 0.004), DECK + 0.06, -0.62), V(s * (SX + 0.004), ROOF - 0.04, -0.62), 0.075, V(s, 0, 0), 0.009));
    }
    H.add('dark', rivetRow(V(-HX + 0.06, 0.84, HF - 0.004), V(HX - 0.06, 0.84, HF - 0.004), 0.15, V(0, 0, -1), 0.01));
    // spare track links across the nose under a bar, a round inspection cover in the nose plate, the brake access hatch
    // in the glacis right of the driver, the Notek on the left fender
    for (let k = 0; k < 7; k++) H.add('dark', box(0.19, 0.03, 0.09, -0.6 + k * 0.2, 0.69 + (k % 2) * 0.008, HF - 0.03, 1.5));
    H.add('camo', box(1.42, 0.03, 0.02, 0, 0.66, HF - 0.06));
    H.add('camo', yTube(0.875, 0.89, 0.16, 0.16, 20, -0.3, HF + 0.2));
    H.add('camo', box(0.5, 0.016, 0.42, 0.44, gy(-1.25) + 0.008, -1.25, -GS));
    for (const x of [0.3, 0.58]) H.add('dark', box(0.05, 0.03, 0.07, x, gy(-1.03) + 0.015, -1.03, -GS));
    H.add('dark', box(0.12, 0.025, 0.03, 0.44, gy(-1.4) + 0.02, -1.4, -GS));
    notek(H, -1.0, DECK, HF + 0.5);

    // the driver's armoured box standing out of the glacis left of the middle: narrow at its front, where the whole
    // face is his visor flap hinged at the top, its sides splayed out to the rear (the left one to the hull's side)
    const bz0 = -1.72, bz1 = -1.6, by0 = gy(bz0);
    const rr = [V(0.3, ROOF, GZ1), V(-SX, ROOF, GZ1)];
    H.add('camo', loft([
      [V(-0.66, by0 - 0.01, bz0), V(-0.04, by0 - 0.01, bz0), ...rr],
      [V(-0.55, ROOF, bz1), V(-0.15, ROOF, bz1), ...rr],
    ]));
    const va = Math.atan2(bz1 - bz0, ROOF - by0), vz = (y) => bz0 + (bz1 - bz0) * (y - by0) / (ROOF - by0);
    H.add('camo', box(0.4, 0.33, 0.03, -0.35, 1.22, vz(1.22) - 0.017, va)); // the visor flap
    H.add('dark', box(0.2, 0.022, 0.02, -0.35, 1.2, vz(1.2) - 0.03, va)); // its slit
    H.add('camo', box(0.24, 0.035, 0.025, -0.35, 1.235, vz(1.235) - 0.04, va)); // the slit's hood
    for (const d of [-0.12, 0.12]) H.add('camo', box(0.07, 0.07, 0.05, -0.35 + d, ROOF - 0.035, vz(ROOF - 0.035) - 0.03, va)); // hinges
    H.add('dark', box(0.012, 0.016, 0.13, -0.725, 1.31, -1.3, 0, -0.3, 0)); // the slit in the left face
    // the roof hatch in two halves, the roof plate's bolts
    for (const z of [-1.42, -1.14]) H.add('camo', box(0.36, 0.018, 0.26, -0.37, ROOF + 0.009, z));
    H.add('dark', box(0.36, 0.01, 0.01, -0.37, ROOF + 0.02, -1.28));
    for (const z of [-1.42, -1.14]) H.add('dark', box(0.1, 0.02, 0.03, -0.25, ROOF + 0.025, z));
    H.add('dark', rivetRow(V(-SX + 0.06, ROOF + 0.002, GZ1 + 0.06), V(SX - 0.06, ROOF + 0.002, GZ1 + 0.06), 0.14, V(0, 1, 0), 0.009));
    // the barrel's travel lock, folded down on the roof under the cradle
    for (const s of [-1, 1]) H.add('dark', rod(V(s * 0.11, ROOF, -0.58), V(s * 0.07, ROOF + 0.17, -0.63), 0.016, 6));
    H.add('dark', box(0.2, 0.05, 0.06, 0, ROOF + 0.17, -0.63));
    for (const s of [-1, 1]) H.add('dark', box(0.05, 0.04, 0.07, s * 0.11, ROOF + 0.02, -0.58));

    // the rear: the silencer across the hull's rear plate under the compartment's overhang with its outlet to the
    // left, the pipe from the engine, the towing pintle
    silencer(H, -0.52, 0.42, 0.72, HRL + 0.13, 0.11);
    for (const x of [-0.35, 0.25]) H.add('dark', box(0.05, 0.1, 0.12, x, 0.72, HRL + 0.05));
    H.add('rust', rod(V(-0.52, 0.72, HRL + 0.13), V(-0.68, 0.66, HRL + 0.16), 0.035, 8), { tint: 0x8c7464 });
    H.add('rust', rod(V(0.2, 0.84, HRL + 0.02), V(0.2, 0.75, HRL + 0.1), 0.03, 6), { tint: 0x8c7464 }); // the pipe from the engine
    H.add('camo', box(0.2, 0.12, 0.1, 0.0, 0.48, HRL + 0.05));
    H.add('steel', yTube(0.42, 0.56, 0.02, 0.02, 8, 0.0, HRL + 0.12));
  }

  // ---------------------------------------------------------------- the fighting compartment
  const C = rig.part();
  const xAt = (y) => SX - LEAN * Math.max(0, y - ROOF); // the walls' outer face: its half width at height y (they lean in)
  const topY = (z) => (z <= ZT ? TOP : TOP + (REAR - TOP) * (z - ZT) / (HR - ZT)); // the walls' top at z
  const fzAt = (y) => FZ0 + (FZ1 - FZ0) * (y - ROOF) / (TOP - ROOF); // the front plates' face at height y
  const sAt = (y) => S0 + (S1 - S0) * (y - ROOF) / (TOP - ROOF); // the slot's half width at height y
  const PT = 1.8; // the rear flap's top (a man on the ground hands a round over it)
  {
    const fpt = (x, y, d = 0) => V(x, y, fzAt(y) - d);
    for (const s of [-1, 1]) {
      // the hull's side above the fender behind F0 (ahead of it the upper hull's own), with the two cooling louvres
      C.add('camo', box(0.014, ROOF - DECK + 0.1, HR - F0, s * (SX - 0.007), (ROOF + DECK - 0.1) / 2, (F0 + HR) / 2));
      for (const [L0, L1] of [[-0.4, 0.1], [0.5, 1.05]]) {
        const LY0 = DECK + 0.09, LY1 = ROOF - 0.06, lx = s * (SX + 0.02), ym = (LY0 + LY1) / 2, zm = (L0 + L1) / 2;
        C.add('dark', box(0.03, LY1 - LY0 - 0.02, L1 - L0 - 0.02, lx - s * 0.01, ym, zm));
        for (const y of [LY0, LY1]) C.add('camo', box(0.05, 0.014, L1 - L0, lx, y, zm));
        for (const z of [L0, L1]) C.add('camo', box(0.05, LY1 - LY0, 0.014, lx, ym, z));
        for (let k = 1; k < 5; k++) C.add('camo', box(0.05, 0.012, L1 - L0, lx + s * 0.008, LY0 + (LY1 - LY0) * k / 5 + 0.01, zm, 0, 0, s * 0.5));
      }
      C.add('dark', rivetRow(V(s * (SX + 0.004), ROOF - 0.03, -0.55), V(s * (SX + 0.004), ROOF - 0.03, HR - 0.08), 0.16, V(s, 0, 0), 0.009));
      // the side, one plane: the forward plate, level at the top, and the rear one falling to the rear plate
      const a = V(s * SX, ROOF, FZ0), b = V(s * SX, ROOF, ZT), c = V(s * xAt(TOP), TOP, ZT), d = V(s * xAt(TOP), TOP, FZ1);
      const e = V(s * SX, ROOF, HR), f = V(s * xAt(REAR), REAR, HR);
      C.add('camo', plate([a, b, c, d]));
      C.add('camo', plate([b, e, f, c]));
      // the rim along the top, the seams
      for (const [p, q] of [[d, c], [c, f]]) C.add('camo', rod(p, q, 0.01, 5));
      C.add('camo', rod(V(s * S1, TOP, FZ1), d, 0.01, 5));
      C.add('dark', rivetRow(V(s * (xAt(ROOF + 0.1) + 0.006), ROOF + 0.1, ZT), V(s * (xAt(TOP - 0.06) + 0.006), TOP - 0.06, ZT), 0.11, V(s, 0.15, 0), 0.009));
      C.add('dark', rivetRow(V(s * (xAt(ROOF + 0.1) + 0.008), ROOF + 0.1, 1.6), V(s * (xAt(topY(1.6) - 0.06) + 0.008), topY(1.6) - 0.06, 1.6), 0.11, V(s, 0.15, 0), 0.009));
      C.add('dark', rivetRow(V(s * (xAt(ROOF + 0.05) + 0.006), ROOF + 0.05, FZ0 + 0.1), V(s * (xAt(ROOF + 0.05) + 0.006), ROOF + 0.05, ZT - 0.06), 0.14, V(s, 0.15, 0), 0.009));
      for (const z of [0.1, 2.2]) C.add('dark', box(0.02, 0.06, 0.08, s * (xAt(topY(z) - 0.05) - 0.016), topY(z) - 0.05, z)); // lifting eyes inside the rim
      // the front plate beside the slot, leaning back, and the bolted cover strip on its outer part
      C.add('camo', plate([fpt(s * sAt(ROOF + 0.2), ROOF + 0.2), fpt(s * xAt(ROOF + 0.2), ROOF + 0.2), fpt(s * xAt(TOP), TOP), fpt(s * S1, TOP)]));
      C.add('camo', plate([fpt(s * 0.5, ROOF + 0.3, 0.014), fpt(s * 0.62, ROOF + 0.3, 0.014), fpt(s * 0.6, TOP + 0.02, 0.014), fpt(s * 0.5, TOP + 0.02, 0.014)]));
      C.add('dark', rivetRow(fpt(s * 0.56, ROOF + 0.38, 0.03), fpt(s * 0.55, TOP - 0.06, 0.03), 0.12, V(0, 0.3, -1), 0.009));
      C.add('camo', rod(fpt(s * sAt(ROOF + 0.2), ROOF + 0.2, -0.012), fpt(s * S1, TOP, -0.012), 0.014, 6)); // the slot's stiffened edge
    }
    // the front's foot right across, under the slot, and the low curved collar on the roof before it (the gun's own
    // traverse turns inside it)
    C.add('camo', plate([fpt(-SX, ROOF), fpt(SX, ROOF), fpt(xAt(ROOF + 0.2), ROOF + 0.2), fpt(-xAt(ROOF + 0.2), ROOF + 0.2)]));
    C.add('dark', rivetRow(fpt(-SX + 0.08, ROOF + 0.06, 0.016), fpt(SX - 0.08, ROOF + 0.06, 0.016), 0.13, V(0, 0.3, -1), 0.009));
    for (let k = -4; k <= 4; k++) {
      const an = k * 17 * DEG, R = 0.46;
      C.add('camo', box(2 * R * Math.tan(8.6 * DEG), 0.13, 0.014, R * Math.sin(an), ROOF + 0.065, FZ0 + 0.3 - R * Math.cos(an), 0, -an, 0));
    }
    // the rear plate: the hull's below the roof, the low flap above (hinged along its foot, latched at its corners)
    C.add('camo', box(2 * SX, ROOF - DECK + 0.1, 0.014, 0, (ROOF + DECK - 0.1) / 2, HR - 0.007));
    C.add('camo', plate([V(-SX, ROOF, HR), V(SX, ROOF, HR), V(xAt(PT), PT, HR), V(-xAt(PT), PT, HR)]));
    for (const x of [-0.5, 0, 0.5]) C.add('dark', xTube(x - 0.07, x + 0.07, 0.02, 0.02, 8, ROOF + 0.01, HR + 0.02));
    for (const s of [-1, 1]) C.add('dark', box(0.1, 0.03, 0.035, s * (xAt(PT) - 0.07), PT - 0.06, HR + 0.02));
    C.add('camo', rod(V(-xAt(PT), PT, HR), V(xAt(PT), PT, HR), 0.01, 5));
    C.add('dark', rivetRow(V(-SX + 0.08, DECK + 0.1, HR + 0.004), V(SX - 0.08, DECK + 0.1, HR + 0.004), 0.16, V(0, 0, 1), 0.009));
    // the floor and its tread plate
    C.add('camo', box(2 * SX - 0.02, 0.03, HR - F0, 0, FY - 0.015, (F0 + HR) / 2));
    C.add('dark', box(2 * SX - 0.3, 0.008, HR - F0 - 0.1, 0, FY + 0.004, (F0 + HR) / 2)); // its tread plate
    // the ready rounds in a bin across the right half of the rear plate, standing case bases up (the compartment is a
    // man's width either side of the gun, so nothing else stands on its floor: the layer and the loader have the left,
    // the commander and the ammunition man the right)
    roundBin(C, 0.24, 0.68, HR - 0.23, HR - 0.03, FY, 0.62, 0.05, 1, 6);
    // the rod antenna on its base outside the left wall's rear (the Fu 16 sits under the commander's feet)
    const ax = -xAt(1.8) - 0.05;
    C.add('steel', yTube(1.78, 1.86, 0.03, 0.03, 8, ax, 2.0));
    C.add('camo', box(0.07, 0.1, 0.1, ax + 0.03, 1.78, 2.0));
    C.add('dark', yTube(1.86, 3.3, 0.008, 0.004, 5, ax, 2.0));
    // the pioneer tools on the right fender, beside the glacis
    tool(C, 'shovel', 1.035, DECK, -1.25, 1.05);
    tool(C, 'bar', 0.975, DECK, -1.2, 0.95);
  }

  // ---------------------------------------------------------------- the gun mounting (fixed in the vehicle)
  const M = rig.part();
  {
    M.add('camo', box(0.6, 0.12, 0.8, 0, FY + 0.06, TRZ)); // the pedestal on the floor
    M.add('dark', yTube(FY + 0.12, FY + 0.145, 0.24, 0.24, 24, 0, TRZ)); // the race of the gun's own traverse
    const ty = TRY - FY;
    const cheek = [[-0.3, 0.14], [-0.3, ty - 0.35], [-0.18, ty + 0.07], [0.06, ty + 0.08], [0.22, ty - 0.1], [0.36, ty - 0.45], [0.36, 0.14]].map(([z, y]) => [TRZ + z, FY + y]);
    for (const s of [-1, 1]) {
      M.add('camo', sideProfile(cheek, 0.025).translate(s * 0.205, 0, 0));
      M.add('camo', xTube(s * 0.2175, s * 0.26, 0.08, 0.08, 16, TRY, TRZ)); // the trunnion bearings
      M.add('steel', xTube(s * 0.26, s * 0.272, 0.05, 0.05, 12, TRY, TRZ));
      M.add('dark', rivetRow(V(s * 0.219, FY + 0.25, TRZ - 0.25), V(s * 0.219, FY + 0.25, TRZ + 0.3), 0.08, V(s, 0, 0), 0.008));
      M.add('camo', box(0.03, 0.03, 0.62, s * 0.205, FY + 0.16, TRZ + 0.03)); // the foot angles
      // the inner shield: a curved plate either side of the cradle, round the mounting behind the slot, standing on
      // the shelf of hull roof (on the gun it turns with the top carriage; here the hull does that turning)
      for (let k = 0; k < 4; k++) {
        const an = (20 + k * 9.5) * DEG, R = 0.72;
        M.add('camo', box(2 * R * Math.tan(4.8 * DEG), 2.22 - ROOF, 0.012, s * R * Math.sin(an), (2.22 + ROOF) / 2, TRZ - R * Math.cos(an), 0, -s * an, 0));
      }
    }
    M.add('camo', box(0.44, 0.07, 0.07, 0, FY + 0.3, TRZ - 0.27)); // the front transom
    M.add('dark', box(0.08, 0.16, 0.1, 0, TRY - 0.42, TRZ - 0.14)); // the elevating pinion's post (the arc on the cradle)
    // the layer's handwheels on the left cheek's front, facing the rear (he stands behind them, facing forward):
    // elevation above, the gun's own traverse below; their gearboxes
    handwheelZ(M, -0.36, TRY - 0.5, TRZ - 0.12, 0.11, 1);
    M.add('dark', zTube(TRZ - 0.3, TRZ - 0.12, 0.013, 0.013, 6, -0.36, TRY - 0.5));
    handwheelZ(M, -0.33, TRY - 0.78, TRZ - 0.1, 0.09, 1);
    M.add('dark', zTube(TRZ - 0.3, TRZ - 0.1, 0.013, 0.013, 6, -0.33, TRY - 0.78));
    M.add('camo', box(0.14, 0.4, 0.12, -0.3, TRY - 0.62, TRZ - 0.36));
    // the panoramic sight (Rbl F 32) on its bracket off the left cheek, its head over the front plate, the eyepiece back
    M.add('camo', box(0.18, 0.04, 0.08, -0.3, TRY + 0.08, TRZ - 0.2));
    M.add('camo', yTube(TRY - 0.2, TRY + 0.08, 0.025, 0.025, 8, -0.38, TRZ - 0.2));
    panoramicSight(M, -0.38, TRY + 0.1, TRZ - 0.2, -1);
    // the equilibrator's floor bracket (right of the cradle; the strut itself follows the elevation below)
    M.add('camo', box(0.12, 0.12, 0.14, 0.3, FY + 0.18, TRZ - 0.56));
    M.add('steel', xTube(0.24, 0.36, 0.018, 0.018, 8, FY + 0.2, TRZ - 0.56));
  }

  H.build(trav, { dirt: 0.6 });
  C.build(trav, { dirt: 0.45 });
  M.build(trav, { dirt: 0.3 });
  // the crew's grips (common.js grip): the layer's two handwheels on the left cheek, facing the rear
  grip(rig, trav, 'layer', -0.36, TRY - 0.5, TRZ - 0.12, { axis: [0, 0, 1], r: 0.11 });
  grip(rig, trav, 'layer2', -0.33, TRY - 0.78, TRZ - 0.1, { axis: [0, 0, 1], r: 0.09 });

  // ---------------------------------------------------------------- the gun: the leFH 18's cradle, barrel and block
  const L = buildLeFH18({ scheme, brake: true });
  const el = L.pivots.elevation;
  el.position.set(0, TRY, TRZ);
  el.rotation.set(0, 0, 0);
  trav.add(el);
  rig.pivots.elevation = el;
  rig.pivots.recoil = L.pivots.recoil;
  rig.pivots.breech = L.pivots.breech;
  rig.setBreech = L.setBreech;
  rig.breechOpen = L.breechOpen;
  rig.setShell = L.setShell;
  rig.slideMats = L.slideMats;
  rig.nest = L.nest;
  rig.anchors.muzzle = L.anchors.muzzle;
  rig.anchors.breech = L.anchors.breech;
  rig.anchors.tray = L.anchors.tray;
  // the equilibrator: a spring cylinder standing on its floor bracket, its rod up to the cradle's lug (lefh18.js), kept
  // between the two as the gun is laid
  const eqCyl = new THREE.Group(), eqRod = new THREE.Group();
  trav.add(eqCyl, eqRod);
  {
    const QC = rig.part();
    QC.add('camo', yTube(0, 0.32, 0.055, 0.055, 14));
    QC.add('camo', yTube(0.32, 0.34, 0.062, 0.05, 14));
    QC.add('dark', yTube(-0.03, 0, 0.04, 0.05, 12));
    QC.build(eqCyl, { dirt: 0.2, y0: FY + 0.2 });
    const QR = rig.part();
    QR.add('steel', yTube(0, 1, 0.02, 0.02, 8));
    QR.build(eqRod, { dirt: 0, y0: FY + 0.4 });
  }
  const eqFoot = V(0.3, FY + 0.2, TRZ - 0.56), eqLug = V(0.27, -0.12, -0.3), eqB = V(), eqD = V(), UP = V(0, 1, 0);
  const placeEq = () => {
    const e = el.rotation.x, c = Math.cos(e), s = Math.sin(e);
    eqB.set(eqLug.x, TRY + eqLug.y * c - eqLug.z * s, TRZ + eqLug.y * s + eqLug.z * c);
    eqD.copy(eqB).sub(eqFoot);
    const len = eqD.length();
    eqD.divideScalar(len || 1);
    eqCyl.position.copy(eqFoot);
    eqCyl.quaternion.setFromUnitVectors(UP, eqD);
    eqRod.position.copy(eqFoot);
    eqRod.quaternion.copy(eqCyl.quaternion);
    eqRod.scale.set(1, len, 1);
  };

  // ---------------------------------------------------------------- the ground stock and the round handed up
  // two wicker ammunition baskets (three rounds each) and a cartridge box on the ground behind the vehicle
  const ground = node(trav, 'groundStock');
  {
    const G = rig.part();
    for (const [x, z] of [[0.95, 3.13], [0.95, 3.55]]) {
      G.add('wicker', box(0.42, 0.24, 0.36, x, 0.12, z));
      G.add('dark', box(0.43, 0.02, 0.37, x, 0.24, z));
      for (const xx of [-0.12, 0, 0.12]) G.add('brass', yTube(0.24, 0.26, 0.055, 0.055, 10, x + xx, z));
    }
    G.add('camo', box(0.36, 0.22, 0.55, -0.15, 0.11, 3.48), { tint: 0x9a9a88 });
    G.build(ground, { dirt: 0.6 });
  }
  rig.groundStock = ground;
  const sh = buildShell('lefh18');
  const pass = new THREE.Group();
  pass.name = 'shell-pass'; // (crewfield.js leaves 'shell-' groups out of the steel)
  for (const p of sh.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; pass.add(m); }
  pass.rotation.order = 'YXZ';
  pass.visible = false;
  root.add(pass);
  rig.passShell = pass;

  // the drill's stations in the vehicle's frame (render/de/wespe.js): where the man on the ground takes a round from,
  // where he stands, and the rear plate's top edge he hands it over
  rig.spec = {
    floor: FY, deck: DECK, plateTop: PT, plateZ: HR,
    basket: { x: 0.95, y: 0.3, z: 3.13 }, over: { x: 0.35, y: 2.0, z: HR - 0.05 }, inside: { x: 0.46, y: FY + 0.75, z: HR - 0.13 },
  };

  // ---------------------------------------------------------------- rig plumbing
  rig.setElevation = (r) => { el.rotation.x = r; placeEq(); };
  rig.update = (dt = 0) => {
    drive.update(dt);
    placeEq();
    ground.visible = Math.abs(drive.speed()) < 0.2;
    pass.visible = false; // the drill shows it again this frame, after this (render/guns.js updates the rig first)
  };
  placeEq();
  rig.anchors.eye = node(trav, 'eye', 0, 2.2, 1.5);
  rig.anchors.exhaust = node(trav, 'exhaust', -0.7, 0.66, HRL + 0.17);
  rig.anchors.shellStack = node(trav, 'shellStack', 0.46, FY + 0.64, HR - 0.13);
  rig.recoilLength = 1.0; // (the 18/2 in its mounting; the field carriage's 1.19 m would reach the rear plate at 42 degrees)
  rig.loadEl = 4 * DEG; // GUNS.wespe.loadEl
  floorFade(rig, TRY - FY, 0.48, 0.16, 0.08, 0.3);
  rig.muzzleZ = MZ;

  // The crew (5, GUNS.wespe.crew): on the left of the gun the layer at the sight and the handwheels and the loader behind
  // him (he works the block from the left and puts the cartridge in), on the right the commander at the front and the
  // ammunition man behind him (he brings each round from the bin to the breech), and one man on the ground behind
  // who hands rounds up over the rear plate from the baskets. All of them turn with the vehicle (world: false: the
  // commander too, who would otherwise stay put in the world frame as a field gun's does). The compartment is 1.8 m
  // wide inside at the floor and its walls lean in, so the men stand close in to the gun, and the two at the breech
  // behind its recoil (where crews.js's field would move them anyway).
  const spot = (role, x, z, heading, pose, y = FY) => rig.anchors.crew.push({ role, x, y, z, heading, pose, world: false });
  spot('officer', 0.5, 1.3, 0, 'point');
  spot('layer', -0.56, 1.1, 0, 'lay');
  spot('loader', -0.56, 2.08, L90, 'stand');
  spot('shell', 0.5, 1.95, 0, 'carry');
  spot('passer', 0.35, HR + 0.62, 0, 'stand', 0);

  hb(rig, -FX, 0, HF - 0.05, FX, DECK, HR + 0.05);
  hb(rig, -SX, DECK, GZ0, SX, ROOF, HR);
  hb(rig, -SX, ROOF, FZ0, SX, TOP - 0.15, HR);
  hb(rig, -0.12, TRY - 0.15, TRZ + MZ - 0.4, 0.12, TRY + 0.15, TRZ);
  return finishRig(rig, 'wespe', 'lefh18');
}

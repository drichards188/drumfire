import * as THREE from 'three';
import { V, DEG, box, xTube, yTube, zTube, rod, sideProfile, rivets, rivetRow } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { panoramicSight } from './common.js';
import { buildSFH18 } from './sfh18.js';
import { trackGear, trackDrive, doubleRoadWheel, sprocketParts, idlerParts, rollerParts, shoeParts, handwheelZ, jerrycan, tool, notek, silencer, roundBin } from './sp_kit.js';

/**
 * 15 cm schwere Panzerhaubitze 18/1 auf Geschützwagen III/IV (Sf.), Sd.Kfz. 165 "Hummel" (Alkett / Deutsche Eisenwerke,
 * 1943 to 1945). 7.17 m long over the barrel, 2.97 m wide, 2.81 m high, 24 t; crew six; 10 to 30 mm of armour (Wikipedia
 * "Hummel (vehicle)"; Panzer Tracts 10). The Geschützwagen III/IV: the Panzer IV's hull, running gear and Maybach HL 120
 * engine (moved forward to the middle) with the Panzer III's steering and final drives. Eight rubber-tyred double road
 * wheels a side (470 mm) in four bogies on leaf springs, four return rollers, the drive sprocket at the front and the
 * idler at the rear, 400 mm tracks (track centres 2.48 m, the Panzer IV's). At the front the late, full-width driver's
 * cab (the driver on the left and the radio operator on the right, a visor each); behind it the tall open fighting
 * compartment of 10 mm plate overhanging the tracks, its front plate sloped, with the slot the barrel elevates in; the
 * sFH 18's long L/29.5 barrel without a muzzle brake reaching 1.4 m past the nose over the cab (its travel lock folded
 * on the cab roof). Ready rounds in bins at the rear (18 rounds: the shells right, the cartridges left) and racks along
 * the walls; two doors in the rear plate; the silencer across the hull's rear plate. Proportions from the published
 * dimensions, the Panzer IV's running gear (karl.js's Munitionsschlepper) and the photographs of the Saumur and
 * Aberdeen vehicles; unmeasured fittings reconstructed from the period photographs.
 *
 * The gun is the sFH 18 model's own cradle, recuperator, barrel and sliding block (sfh18.js buildSFH18, its `elevation`
 * pivot taken over whole) on a pedestal mounting with two cheeks and the field gun's two spring equilibrators, the
 * curved shield on the cradle behind the front plate's slot and the panoramic sight on the left.
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the middle of the hull, front -Z. As the Wespe (wespe.js): the
 * game turns the gun to any bearing (GUNS.hummel traverse 180 degrees), its own 15 degrees either way folded into the
 * hull pivoting on its tracks, so `traverse` is the whole vehicle about the hull's middle and rig.setTraverse runs the
 * tracks against each other. `elevation` the trunnions in the compartment, `recoil` the barrel, `breech` the block
 * (slides out to the right). rig.setDrive(v) (m/s, + forward; rig.update(dt) integrates it) and rig.driveBy(d);
 * anchors.exhaust the silencer's outlet; rig.groundStock the rounds on the ground behind (hidden while it drives);
 * rig.passShell the round the man on the ground hands up (render/de/hummel.js); rig.spec the drill's stations.
 * buildHummel({ scheme: 'dgelb' | 'feldgrau' })
 */
const TX = 1.24, TW = 0.4, TH = 0.05, PITCH = 0.12; // track centres 2.48 m, 400 mm tracks, link thickness, pitch
const RW = 0.235, WY = RW + TH; // road wheel radius over the tyre (470 mm), its centre height
const BOGIE = [-1.72, -0.64, 0.44, 1.52], PAIR = 0.27; // the four bogies, each wheel 0.27 m either side of its pivot
const WZ = BOGIE.flatMap((b) => [b - PAIR, b + PAIR]);
const SPR = { z: -2.52, y: 0.6, r: 0.33 }, IDL = { z: 2.55, y: 0.52, r: 0.27 };
const ROLL = [[-1.75, 1.0], [-0.6, 1.01], [0.55, 1.01], [1.7, 1.0]].map(([z, y]) => ({ z, y, r: 0.1 }));
const HX = 1.0, HF = -2.95, HR = 2.9, BELLY = 0.4, DECK = 1.2; // hull half width between the tracks, nose, rear, belly, deck
const FX = 1.47; // the fighting compartment's sides stand at the fenders' outer edge (2.97 m over them)
const FY = 1.15; // the compartment's floor (crews.js rounds a floor to 5 cm: the man's band must clear the deck's 1.2 m)
const TRY = 2.3, TRZ = -0.29; // the trunnions (bore height 2.3 m; the muzzle 1.37 m past the nose)
const CF = -1.72, CAB = -2.55, LEAN = 4 * DEG; // the compartment's front at the deck, the cab's front, the sides' lean
const TOP = 2.45; // the walls' top at the front (2.38 at the rear)
const MZ = -3.98; // the sFH 18's muzzle from its trunnions (sfh18.js)
const EQX = 0.38, EQ_LO = { y: -0.58, z: -0.62 }, EQ_HI = { y: 0.06, z: -0.27 }; // the equilibrators' plane and eyes (sfh18.js, from the trunnions)

export function buildHummel({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  // ---------------------------------------------------------------- running gear
  const gear = trackGear(trav, {
    tx: TX, th: TH, pitch: PITCH, parts: rig.part,
    wheels: WZ.map((z) => ({ z, y: WY, r: RW })), sprocket: SPR, idler: IDL, rollers: ROLL,
    wheel: (P, s) => doubleRoadWheel(P, s, { r: RW, w: 0.095, gap: 0.1, tyre: 0.05, bolts: 8, hub: 0.075 }),
    sprocketP: (P, s) => sprocketParts(P, s, { r: SPR.r, teeth: 20, w: 0.07, gap: 0.11, holes: 8 }),
    idlerP: (P, s) => idlerParts(P, s, { r: IDL.r, spokes: 8, w: 0.075, gap: 0.1 }),
    rollerP: (P, s) => rollerParts(P, s, { r: 0.1, w: 0.07, gap: 0.08 }),
    shoe: (P) => shoeParts(P, { w: TW, pitch: PITCH, t: 0.03, horn: 0.08 }),
  });
  const drive = trackDrive(rig, trav, gear, TX);

  // ---------------------------------------------------------------- hull and cab
  const H = rig.part();
  {
    // the hull box between the tracks (cut down to the compartment's floor behind the cab), the nose plates and glacis
    const prof = [[HF + 0.05, 0.65], [HF + 0.3, BELLY + 0.05], [HF + 0.6, BELLY], [HR - 0.25, BELLY], [HR, 0.58], [HR, FY], [CF, FY], [CF, DECK], [CAB, DECK], [HF, 0.98], [HF, 0.7]];
    H.add('camo', sideProfile(prof, 2 * HX, 0.015));
    for (const s of [-1, 1]) H.add('camo', box(0.03, DECK - FY + 0.02, HR - CF, s * (HX - 0.015), (FY + DECK) / 2, (CF + HR) / 2));
    H.add('camo', box(2 * HX, DECK - FY + 0.02, 0.03, 0, (FY + DECK) / 2, HR - 0.015));
    H.add('dark', rivetRow(V(-HX + 0.08, 0.95, HF - 0.004), V(HX - 0.08, 0.95, HF - 0.004), 0.16, V(0, 0, -1), 0.011));
    for (const s of [-1, 1]) {
      H.add('dark', rivetRow(V(s * (HX + 0.004), DECK - 0.07, HF + 0.6), V(s * (HX + 0.004), DECK - 0.07, HR - 0.1), 0.2, V(s, 0, 0), 0.011));
      // the bogies: a cast body on its pivot, the two arms to the wheels, the quarter-elliptic spring over it and the
      // bump stop (Panzer IV Ausf. F to J)
      for (const b of BOGIE) {
        const x = s * (HX + 0.06);
        H.add('camo', box(0.12, 0.2, 0.36, x, WY + 0.12, b));
        H.add('dark', xTube(s * HX, s * (HX + 0.14), 0.07, 0.07, 12, WY + 0.16, b));
        for (const d of [-1, 1]) H.add('camo', rod(V(x, WY + 0.08, b + d * 0.1), V(s * (TX - 0.16), WY, b + d * PAIR), 0.04, 6));
        for (let k = 0; k < 4; k++) H.add('dark', box(0.08, 0.014, 0.5 - k * 0.09, x, WY + 0.25 - k * 0.018, b - 0.04));
        H.add('dark', box(0.09, 0.05, 0.08, x, WY + 0.3, b + 0.24));
      }
      // the return rollers' brackets, the final drive housing, the idler's crank and its adjuster
      for (const r of ROLL) H.add('camo', box(0.12, 0.08, 0.1, s * (HX + 0.06), r.y + 0.02, r.z));
      H.add('camo', xTube(s * HX, s * (TX - 0.16), 0.2, 0.18, 18, SPR.y, SPR.z));
      H.add('dark', rivets([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => V(s * (TX - 0.16), SPR.y + Math.cos(k * Math.PI / 5) * 0.15, SPR.z + Math.sin(k * Math.PI / 5) * 0.15)), V(s, 0, 0), 0.013));
      H.add('camo', rod(V(s * HX, 0.75, IDL.z - 0.3), V(s * (TX - 0.14), IDL.y, IDL.z), 0.05, 8));
      H.add('dark', zTube(IDL.z - 0.55, IDL.z - 0.28, 0.025, 0.025, 6, s * (HX + 0.03), 0.78));
      // the fenders ahead of the compartment (the compartment's sides stand on them further back), bent down at the front
      H.add('camo', box(FX - HX, 0.012, CF - HF - 0.3, s * (HX + FX) / 2, DECK, (HF + 0.3 + CF) / 2));
      H.add('camo', box(FX - HX, 0.012, 0.42, s * (HX + FX) / 2, DECK - 0.11, HF + 0.12, -0.55));
      H.add('camo', box(FX - HX, 0.012, HR - CF, s * (HX + FX) / 2, DECK, (CF + HR) / 2));
      H.add('camo', box(0.012, 0.07, HR - HF - 0.3, s * FX, DECK - 0.035, (HF + 0.3 + HR) / 2));
      // tow shackles front and rear
      for (const [z, d] of [[HF, -1], [HR, 1]]) {
        H.add('camo', box(0.07, 0.2, 0.16, s * 0.72, 0.62, z + d * 0.07));
        H.add('steel', new THREE.TorusGeometry(0.07, 0.018, 6, 12).rotateY(Math.PI / 2).translate(s * 0.72, 0.6, z + d * 0.19));
      }
    }
    // spare track links across the nose, the Notek on the left fender, the headlamps
    for (let k = 0; k < 7; k++) H.add('dark', box(0.4, 0.035, 0.11, -0.65 + (k % 2) * 0.02 + Math.floor(k / 2) * 0.43, 0.84, HF - 0.03, 1.5));
    notek(H, -1.22, DECK, HF + 0.45);
    for (const s of [-1, 1]) {
      H.add('dark', zTube(-2.73, -2.6, 0.08, 0.075, 12, s * 0.85, 1.3));
      H.add('lens', zTube(-2.74, -2.73, 0.06, 0.06, 12, s * 0.85, 1.3));
      H.add('dark', yTube(DECK, 1.24, 0.015, 0.015, 6, s * 0.85, -2.66));
    }

    // the cab: the sloped front plate with the driver's visor on the left and the radio operator's on the right, the
    // cheeks, the flat roof with two hatches, the folded travel lock for the barrel on the roof
    const cy = 1.86;
    H.add('camo', sideProfile([[CAB, DECK - 0.01], [CF + 0.02, DECK - 0.01], [CF + 0.02, cy], [CAB + 0.24, cy], [CAB, cy - 0.15]], 2 * HX + 0.06, 0.012));
    for (const s of [-1, 1]) {
      H.add('camo', box(0.38, 0.17, 0.08, s * 0.5, 1.58, CAB + 0.05, 0.36));
      H.add('dark', box(0.24, 0.015, 0.02, s * 0.5, 1.6, CAB + 0.01, 0.36));
      H.add('camo', box(0.62, 0.025, 0.42, s * 0.5, cy + 0.012, -2.05));
      H.add('dark', box(0.62, 0.012, 0.012, s * 0.5, cy + 0.03, -2.05));
      for (const z of [-2.18, -1.92]) H.add('dark', box(0.1, 0.03, 0.035, s * 0.5 + s * 0.2, cy + 0.035, z));
      H.add('dark', rivetRow(V(s * (HX + 0.035), cy - 0.08, CAB + 0.3), V(s * (HX + 0.035), cy - 0.08, CF), 0.12, V(s, 0, 0), 0.01));
    }
    H.add('dark', rivetRow(V(-HX + 0.06, cy - 0.06, CAB + 0.22), V(HX - 0.06, cy - 0.06, CAB + 0.22), 0.13, V(0, 1, -1), 0.01));
    for (const s of [-1, 1]) H.add('dark', rod(V(s * 0.32, cy + 0.04, -2.45), V(s * 0.07, cy + 0.08, -1.95), 0.025, 6));
    H.add('dark', box(0.24, 0.08, 0.1, 0, cy + 0.08, -1.93));
    for (const s of [-1, 1]) H.add('dark', box(0.08, 0.06, 0.1, s * 0.32, cy + 0.03, -2.47));
    // the rear: the silencer across the hull's rear plate with its outlet to the left, the pipe from the engine, the
    // towing pintle, the starter crank's cover
    silencer(H, -0.78, 0.5, 0.82, HR + 0.16, 0.14);
    for (const x of [-0.6, 0.35]) H.add('dark', box(0.06, 0.12, 0.15, x, 0.82, HR + 0.06));
    H.add('rust', rod(V(-0.78, 0.82, HR + 0.16), V(-0.97, 0.75, HR + 0.2), 0.045, 8), { tint: 0x8c7464 });
    H.add('rust', rod(V(0.3, 1.0, HR + 0.02), V(0.3, 0.9, HR + 0.12), 0.04, 6), { tint: 0x8c7464 });
    H.add('camo', box(0.24, 0.14, 0.12, 0, 0.5, HR + 0.06));
    H.add('steel', yTube(0.44, 0.58, 0.025, 0.025, 8, 0, HR + 0.14));
    H.add('dark', zTube(HR, HR + 0.05, 0.07, 0.07, 12, 0.72, 0.95));
  }

  // ---------------------------------------------------------------- the fighting compartment
  const C = rig.part();
  const leanSide = (s, pts, t) => sideProfile(pts.map(([z, y]) => [z, y - DECK]), t).rotateZ(s * LEAN).translate(s * (FX - t / 2), DECK, 0);
  const xAt = (y) => FX - Math.tan(LEAN) * (y - DECK); // the sides' inner face, near enough, at height y
  // the front plate sloped back from the deck behind the cab to the walls' top
  const fz0 = CF, fz1 = -1.32, fy0 = DECK, fy1 = TOP, sl = Math.atan2(fz1 - fz0, fy1 - fy0);
  const fzAt = (y) => fz0 + (fz1 - fz0) * (y - fy0) / (fy1 - fy0);
  {
    const sideP = [[CF, DECK], [HR, DECK], [HR, TOP - 0.07], [fz1, TOP]];
    for (const s of [-1, 1]) {
      C.add('camo', leanSide(s, sideP, 0.012));
      C.add('camo', rod(V(s * xAt(TOP - 0.07), TOP - 0.07, HR), V(s * xAt(TOP), TOP, fz1), 0.011, 5));
      C.add('camo', box(0.045, 0.045, HR - CF, s * (FX - 0.035), DECK + 0.022, (CF + HR) / 2));
      C.add('dark', rivetRow(V(s * (FX + 0.006), DECK + 0.08, CF + 0.1), V(s * (FX + 0.006), DECK + 0.08, HR - 0.1), 0.2, V(s, 0, 0), 0.01));
      // the cooling air louvres in the walls' lower front (the engine sits under the compartment's front)
      for (let k = 0; k < 6; k++) C.add('dark', box(0.03, 0.025, 0.7, s * (FX + 0.012), DECK + 0.14 + k * 0.05, -0.85));
      C.add('camo', box(0.035, 0.36, 0.78, s * (FX + 0.012), DECK + 0.26, -0.85));
      // the racks for ready rounds along the walls' front, beside the gun's mounting
      for (const z of [-1.35, -0.85]) C.add('camo', box(0.24, 0.04, 0.04, s * (xAt(1.6) - 0.13), FY + 0.95, z));
      for (let k = 0; k < 4; k++) C.add(k % 2 ? 'brass' : 'shell', zTube(-1.4, -0.75, 0.075, 0.075, 12, s * (xAt(1.6) - 0.11), FY + 0.5 + k * 0.155), k % 2 ? undefined : { tint: 0x5a5f52 });
      C.add('camo', box(0.04, 0.72, 0.68, s * (xAt(1.6) - 0.21), FY + 0.68, -1.07));
    }
    // stowage outside: a shovel and a pick strapped flat to the left wall (built lying on a deck, stood on edge), the tow
    // cable coiled along the right wall, jerrycans on a shelf on the rear plate
    const T = rig.part();
    tool(T, 'shovel', 0, 0, 0, 1.05);
    tool(T, 'pick', 0, 0, 0.9, 0.9);
    const g = new THREE.Group();
    T.build(g, { dirt: 0.4 });
    for (const m of g.children) C.add(m.material === rig.mats.timber ? 'timber' : 'dark', m.geometry.clone().rotateZ(-Math.PI / 2).translate(-FX - 0.025, DECK + 0.62, 0.6));
    for (let k = 0; k < 9; k++) C.add('rope', new THREE.TorusGeometry(0.06, 0.016, 5, 10).rotateY(Math.PI / 2).translate(FX + 0.03, DECK + 0.62, -0.3 + k * 0.14));
    C.add('rope', zTube(-0.36, 0.86, 0.016, 0.016, 6, FX + 0.03, DECK + 0.68));
    for (const x of [-1.05, -0.78]) jerrycan(C, x, 0.98, HR + 0.18, 0);
    C.add('dark', box(0.55, 0.03, 0.3, -0.92, 0.98, HR + 0.15)); // their shelf
    // the front plate with the slot the barrel elevates in, the slot's edges stiffened
    const fp = (x0, x1, y0, y1) => {
      const t0 = (y0 - fy0) / (fy1 - fy0), t1 = (y1 - fy0) / (fy1 - fy0), l = Math.hypot(fz1 - fz0, fy1 - fy0) * (t1 - t0);
      return box(x1 - x0, l, 0.014, (x0 + x1) / 2, (y0 + y1) / 2, fz0 + (fz1 - fz0) * (t0 + t1) / 2, sl);
    };
    const SL = 0.29, SY = 1.92; // the slot's half width and its foot
    C.add('camo', fp(-xAt(1.6), xAt(1.6), fy0, SY + 0.02));
    for (const s of [-1, 1]) {
      C.add('camo', fp(s > 0 ? SL : -xAt(2.2), s > 0 ? xAt(2.2) : -SL, SY, fy1));
      C.add('camo', rod(V(s * SL, SY, fzAt(SY) + 0.02), V(s * SL, fy1, fzAt(fy1) + 0.02), 0.02, 6));
      C.add('dark', rivetRow(V(s * (SL + 0.06), SY + 0.05, fzAt(SY + 0.05) - 0.01), V(s * (SL + 0.06), fy1 - 0.04, fzAt(fy1 - 0.04) - 0.01), 0.08, V(0, 0.4, -1), 0.009));
      C.add('dark', rivetRow(V(s * (xAt(1.8) - 0.04), DECK + 0.1, fzAt(DECK + 0.1) - 0.01), V(s * (xAt(2.4) - 0.04), TOP - 0.05, fzAt(TOP - 0.05) - 0.01), 0.1, V(0, 0.4, -1), 0.009));
    }
    C.add('camo', rod(V(-SL, SY, fzAt(SY) - 0.005), V(SL, SY, fzAt(SY) - 0.005), 0.02, 6));
    // the rear plate with its two doors, their hinges and handles, a step under them
    C.add('camo', box(2 * xAt(1.8), TOP - 0.07 - DECK, 0.014, 0, (DECK + TOP - 0.07) / 2, HR - 0.007));
    for (const s of [-1, 1]) {
      C.add('dark', box(0.012, 1.0, 0.012, s * 0.62, DECK + 0.55, HR + 0.004));
      for (const y of [DECK + 0.25, DECK + 0.85]) C.add('dark', zTube(HR, HR + 0.035, 0.025, 0.025, 8, s * 0.6, y));
      C.add('dark', box(0.12, 0.03, 0.04, s * 0.1, DECK + 0.6, HR + 0.02));
    }
    C.add('dark', box(1.24, 0.012, 0.012, 0, DECK + 1.05, HR + 0.004));
    C.add('dark', box(0.012, 1.0, 0.012, 0, DECK + 0.55, HR + 0.004));
    C.add('dark', box(0.4, 0.03, 0.14, 0.45, 0.66, HR + 0.2));
    // the floor and its tread plate
    C.add('camo', box(2 * HX, 0.03, HR - CF, 0, FY - 0.015, (CF + HR) / 2));
    C.add('dark', box(2 * HX - 0.1, 0.008, HR - CF - 0.1, 0, FY + 0.004, (CF + HR) / 2));
    // the ready rounds at the rear: the shells in a bin on the right, the cartridges on the left, either side of the
    // middle (the round comes over the rear plate there)
    roundBin(C, 0.3, xAt(1.7) - 0.03, HR - 0.25, HR - 0.03, FY, 0.66, 0.072, 1, 6, 'shell');
    roundBin(C, -xAt(1.7) + 0.03, -0.3, HR - 0.25, HR - 0.03, FY, 0.6, 0.075, 1, 6, 'brass');
    // the rod antenna at the left rear corner
    C.add('camo', box(0.07, 0.1, 0.1, -xAt(1.6) - 0.035, 1.6, HR - 0.2));
    C.add('dark', yTube(1.65, 3.5, 0.009, 0.004, 5, -xAt(1.6) - 0.07, HR - 0.2));
  }

  // ---------------------------------------------------------------- the gun mounting (fixed in the vehicle)
  const M = rig.part();
  const ty = TRY - FY;
  {
    M.add('camo', box(0.9, 0.16, 1.15, 0, FY + 0.08, TRZ - 0.18)); // the pedestal on the floor
    M.add('dark', yTube(FY + 0.16, FY + 0.185, 0.42, 0.42, 28, 0, TRZ)); // the race of the gun's own traverse
    const cheek = [[-0.2, 0.18], [-0.2, ty - 0.15], [-0.12, ty + 0.09], [0.1, ty + 0.1], [0.3, ty - 0.1], [0.38, ty - 0.5], [0.38, 0.18]].map(([z, y]) => [TRZ + z, FY + y]);
    for (const s of [-1, 1]) {
      M.add('camo', sideProfile(cheek, 0.03).translate(s * 0.315, 0, 0));
      M.add('camo', xTube(s * 0.3, s * 0.35, 0.1, 0.1, 18, TRY, TRZ)); // the trunnion bearings
      M.add('steel', xTube(s * 0.35, s * 0.365, 0.065, 0.065, 12, TRY, TRZ));
      M.add('dark', rivetRow(V(s * 0.332, FY + 0.3, TRZ - 0.15), V(s * 0.332, FY + 0.3, TRZ + 0.33), 0.08, V(s, 0, 0), 0.009));
      // the equilibrators' lower brackets on posts at the mounting's nose
      M.add('camo', box(0.12, ty + EQ_LO.y + 0.02, 0.12, s * EQX, FY + (ty + EQ_LO.y) / 2, TRZ + EQ_LO.z));
      for (const d of [-0.07, 0.07]) M.add('camo', box(0.025, 0.14, 0.12, s * EQX + d, TRY + EQ_LO.y, TRZ + EQ_LO.z));
      M.add('steel', xTube(s * (EQX - 0.1), s * (EQX + 0.1), 0.025, 0.025, 8, TRY + EQ_LO.y, TRZ + EQ_LO.z));
    }
    M.add('camo', box(0.66, 0.1, 0.1, 0, FY + 0.4, TRZ - 0.18)); // the front transom
    M.add('camo', box(0.66, 0.1, 0.1, 0, FY + 0.3, TRZ + 0.3)); // the rear transom
    M.add('dark', box(0.1, 0.18, 0.12, 0.22, TRY - 0.46, TRZ + 0.05)); // the elevating pinion's box (the arc on the cradle's right)
    // the layer's handwheels on the left, ahead of him, facing the rear: elevation above, the gun's own traverse below
    handwheelZ(M, -0.48, TRY - 0.45, TRZ - 0.32, 0.13, 1);
    M.add('dark', zTube(TRZ - 0.5, TRZ - 0.32, 0.015, 0.015, 6, -0.48, TRY - 0.45));
    handwheelZ(M, -0.44, TRY - 0.82, TRZ - 0.3, 0.11, 1);
    M.add('dark', zTube(TRZ - 0.5, TRZ - 0.3, 0.015, 0.015, 6, -0.44, TRY - 0.82));
    M.add('camo', box(0.16, 0.5, 0.14, -0.42, TRY - 0.66, TRZ - 0.56));
    // the panoramic sight on its bracket off the left cheek
    M.add('camo', box(0.22, 0.04, 0.08, -0.43, TRY + 0.1, TRZ - 0.12));
    M.add('camo', yTube(TRY - 0.25, TRY + 0.1, 0.028, 0.028, 8, -0.52, TRZ - 0.12));
    panoramicSight(M, -0.52, TRY + 0.12, TRZ - 0.12, -1);
  }
  H.build(trav, { dirt: 0.6 });
  C.build(trav, { dirt: 0.45 });
  M.build(trav, { dirt: 0.3 });

  // ---------------------------------------------------------------- the gun: the sFH 18's cradle, barrel and block
  const L = buildSFH18({ scheme });
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
  // the shield on the cradle: a curved band about the trunnions just behind the front plate's slot, wider than it
  const S = rig.part();
  {
    const R0 = 0.98, a0 = -16 * DEG, a1 = 24 * DEG, n = 10, pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([-R0 * Math.cos(a), R0 * Math.sin(a)]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push([-(R0 - 0.015) * Math.cos(a), (R0 - 0.015) * Math.sin(a)]); }
    S.add('camo', sideProfile(pts, 0.74));
    const rv = [];
    for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * i / n; for (const x of [-0.34, 0.34]) rv.push(V(x, R0 * Math.sin(a), -R0 * Math.cos(a) - 0.003)); }
    S.add('dark', rivets(rv, V(0, 0, -1), 0.01));
    for (const s of [-1, 1]) S.add('dark', rod(V(s * 0.33, -0.12, -0.95), V(s * 0.16, -0.12, -0.5), 0.016, 5)); // stays to the trough
    S.add('camo', zTube(-R0 - 0.05, -R0 + 0.02, 0.14, 0.14, 18)); // the collar round the barrel
  }
  S.build(el, { dirt: 0.3, y0: TRY });

  // the equilibrators: a spring housing hung from the cradle's pin, its rod telescoping up into it from the mounting's
  // bracket (the sFH 18's, sfh18.js), posed from the elevation without allocating
  const eqs = [-1, 1].map((s) => {
    const outer = new THREE.Group(), inner = new THREE.Group();
    trav.add(outer, inner);
    const PO = rig.part();
    PO.add('camo', yTube(0, 0.46, 0.105, 0.105, 18));
    PO.add('camo', yTube(0.43, 0.46, 0.115, 0.115, 18));
    PO.add('dark', yTube(-0.03, 0, 0.05, 0.08, 14));
    PO.build(outer, { dirt: 0.2, y0: TRY });
    const PI = rig.part();
    PI.add('camo', yTube(0, 1, 0.085, 0.085, 16));
    PI.build(inner, { dirt: 0.2, y0: TRY - 0.4 });
    return { outer, inner, lo: V(s * EQX, TRY + EQ_LO.y, TRZ + EQ_LO.z), hi: V(), hy: EQ_HI.y, hz: EQ_HI.z, x: s * EQX };
  });
  const _d = V(), UP = V(0, 1, 0);
  const placeEq = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of eqs) {
      q.hi.set(q.x, TRY + q.hy * c - q.hz * sn, TRZ + q.hy * sn + q.hz * c);
      _d.copy(q.lo).sub(q.hi);
      const len = _d.length();
      _d.divideScalar(len || 1);
      q.outer.position.copy(q.hi);
      q.outer.quaternion.setFromUnitVectors(UP, _d);
      q.inner.position.copy(q.hi).addScaledVector(_d, 0.2);
      q.inner.quaternion.copy(q.outer.quaternion);
      q.inner.scale.set(1, Math.max(0.05, len - 0.2), 1);
    }
  };

  // ---------------------------------------------------------------- the ground stock and the round handed up
  const ground = node(trav, 'groundStock');
  {
    const G = rig.part();
    // two shell baskets (Geschosskorb, one 15 cm round each) and a cartridge box on the ground behind, right of the doors
    for (const [x, z] of [[1.25, 3.55], [1.25, 3.95]]) {
      G.add('wicker', box(0.32, 0.3, 0.75, x, 0.15, z, 0, Math.PI / 2, 0));
      G.add('dark', box(0.33, 0.02, 0.76, x, 0.3, z, 0, Math.PI / 2, 0));
    }
    G.add('camo', box(0.4, 0.26, 0.7, -0.35, 0.13, 4.0), { tint: 0x9a9a88 });
    G.add('dark', box(0.42, 0.03, 0.05, -0.35, 0.27, 4.0));
    G.build(ground, { dirt: 0.6 });
  }
  rig.groundStock = ground;
  const sh = buildShell('sfh18');
  const pass = new THREE.Group();
  pass.name = 'shell-pass'; // (crewfield.js leaves 'shell-' groups out of the steel)
  for (const p of sh.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; pass.add(m); }
  pass.rotation.order = 'YXZ';
  pass.visible = false;
  root.add(pass);
  rig.passShell = pass;
  rig.spec = {
    floor: FY, deck: DECK, plateTop: TOP - 0.07, plateZ: HR,
    basket: { x: 1.25, y: 0.34, z: 3.55 }, over: { x: 0.5, y: TOP + 0.12, z: HR - 0.05 }, inside: { x: 0.7, y: FY + 0.78, z: HR - 0.14 },
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
  rig.anchors.eye = node(trav, 'eye', 0, 2.6, 1.2);
  rig.anchors.exhaust = node(trav, 'exhaust', -1.0, 0.74, HR + 0.21);
  rig.anchors.shellStack = node(trav, 'shellStack', 0.75, FY + 0.68, HR - 0.14);
  rig.recoilLength = 1.1; // (the 18/1 in its mounting)
  rig.loadEl = 4 * DEG; // GUNS.hummel.loadEl
  floorFade(rig, ty, 0.48, 0.3, 0.1, 0.3);
  rig.muzzleZ = MZ;

  // The crew (6, GUNS.hummel.crew): on the left of the gun the layer at the sight and handwheels, on the right the
  // commander ahead and the loader at the block (he opens and shuts it, primes and fires); at the rear the shell man (the
  // shells' bin on the right) and the cartridge man (the cartridges' bin on the left), who bring each round and its
  // charge to the breech; and one man on the ground behind who hands rounds up over the rear plate from the baskets.
  // All of them turn with the vehicle (world: false: the commander too).
  const spot = (role, x, z, heading, pose, y = FY) => rig.anchors.crew.push({ role, x, y, z, heading, pose, world: false });
  spot('officer', 1.0, -0.55, 0, 'point');
  spot('layer', -0.9, TRZ + 0.3, 0, 'lay');
  spot('loader', 1.0, 0.55, R90, 'stand');
  spot('shell', 0.75, 2.0, 0, 'carry');
  spot('cartridge', -0.75, 2.0, 0, 'carry');
  spot('passer', 0.5, HR + 0.68, 0, 'stand', 0);

  hb(rig, -FX, 0, HF - 0.05, FX, DECK, HR + 0.25);
  hb(rig, -FX, DECK, CF, FX, TOP, HR);
  hb(rig, -1.0, DECK, CAB, 1.0, 1.86, CF);
  hb(rig, -0.15, TRY - 0.15, TRZ + MZ - 0.1, 0.15, TRY + 0.15, TRZ);
  return finishRig(rig, 'hummel', 'sfh18');
}

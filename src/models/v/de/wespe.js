import * as THREE from 'three';
import { V, DEG, box, xTube, yTube, zTube, rod, sideProfile, rivets, rivetRow } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, L90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { panoramicSight } from './common.js';
import { buildLeFH18 } from './lefh18.js';
import { trackGear, trackDrive, doubleRoadWheel, sprocketParts, idlerParts, rollerParts, shoeParts, handwheelZ, jerrycan, tool, notek, silencer, roundBin } from './sp_kit.js';

/**
 * 10.5 cm leFH 18/2 auf Fahrgestell Panzerkampfwagen II (Sf.), Sd.Kfz. 124 "Wespe" (Alkett / FAMO, 1943 to 1944).
 * Overall 4.81 m long, 2.28 m wide, 2.30 m high, 11 t; crew five; 5 to 30 mm of armour, the open fighting compartment
 * of 10 mm plate (Wikipedia "Wespe"; Panzer Tracts 10). The Panzer II Ausf. F hull lengthened by one road wheel
 * station's worth: five rubber-tyred double road wheels a side (550 mm) on quarter-elliptic leaf springs, four return
 * rollers, the drive sprocket at the front and the raised idler at the rear, 300 mm tracks; the Maybach HL 62 moved
 * forward to the middle, under a deck with its grilles between the driver and the fighting compartment. The driver
 * sits in a small armoured box at the front left (his visor in its front plate, a hatch in its roof); the gun stands in
 * the open compartment over the rear half, its sides leaning in, the front plate sloped, the barrel with its two-baffle
 * muzzle brake reaching out over the engine deck and the driver's box (it overhangs the nose by about 0.3 m). Ready
 * rounds stand in bins in the sponsons along both sides; the rear plate has a door. The silencer runs across the hull's
 * rear plate. Proportions from the published dimensions, the Panzer II's (track centres 1.98 m) and the photographs of
 * the Saumur and Aberdeen vehicles; unmeasured fittings reconstructed from the period photographs.
 *
 * The gun is the leFH 18 model's own cradle, barrel, muzzle brake and sliding block (lefh18.js buildLeFH18, its
 * `elevation` pivot taken over whole) on a short pedestal mounting with its two cheeks, the curved shield on the cradle
 * and the panoramic sight on the left cheek.
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
const TX = 0.99, TW = 0.3, TH = 0.05, PITCH = 0.095; // track centres (1.98 m), track width, link thickness, pitch
const RW = 0.275, WY = RW + TH; // road wheel radius over the tyre (550 mm), its centre height
const WZ = [-1.42, -0.72, -0.02, 0.68, 1.38]; // five stations
const SPR = { z: -2.0, y: 0.56, r: 0.29 }, IDL = { z: 2.0, y: 0.52, r: 0.27 };
const ROLL = [[-1.25, 0.87], [-0.45, 0.88], [0.35, 0.88], [1.15, 0.87]].map(([z, y]) => ({ z, y, r: 0.075 }));
const HX = 0.8, HF = -2.3, HR = 2.32, BELLY = 0.36, DECK = 1.05; // hull half width between the tracks, nose, rear, belly, deck
const FX = 1.14; // the fenders' outer edge
const FY = 0.98; // the fighting compartment's floor (a step below the deck; the bins stand on the sponsons beside it)
const TRY = 2.02, TRZ = 0.35; // the trunnions (bore height 2.02 m: the cradle's tail clears the floor at 42 degrees)
const SF = -0.55, LEAN = 3 * DEG; // the compartment's front at the deck, its sides' inward lean
const MZ = 0.44 - 2.94; // the leFH 18's muzzle from its trunnions (lefh18.js)

export function buildWespe({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);

  // ---------------------------------------------------------------- running gear
  const gear = trackGear(trav, {
    tx: TX, th: TH, pitch: PITCH, parts: rig.part,
    wheels: WZ.map((z) => ({ z, y: WY, r: RW })), sprocket: SPR, idler: IDL, rollers: ROLL,
    wheel: (P, s) => doubleRoadWheel(P, s, { r: RW, w: 0.085, gap: 0.075, tyre: 0.045, bolts: 8, hub: 0.075 }),
    sprocketP: (P, s) => sprocketParts(P, s, { r: SPR.r, teeth: 18, w: 0.055, gap: 0.07, holes: 6 }),
    idlerP: (P, s) => idlerParts(P, s, { r: IDL.r, spokes: 6, w: 0.06, gap: 0.07 }),
    rollerP: (P, s) => rollerParts(P, s, { r: 0.075, w: 0.05, gap: 0.06 }),
    shoe: (P) => shoeParts(P, { w: TW, pitch: PITCH, t: 0.028, horn: 0.06 }),
  });
  const drive = trackDrive(rig, trav, gear, TX);

  // ---------------------------------------------------------------- hull
  const H = rig.part();
  {
    // the hull box between the tracks: the rounded nose plate, the glacis up to the deck, the rear plate
    // (its top is cut down to the compartment's floor behind the compartment's front; the hull sides and the rear plate
    // stand up to the deck there)
    const prof = [[HF + 0.05, 0.42], [HF + 0.25, BELLY], [HR - 0.2, BELLY], [HR, 0.5], [HR, FY], [SF + 0.25, FY], [SF + 0.25, DECK], [-1.95, DECK], [HF, 0.84], [HF, 0.55]];
    H.add('camo', sideProfile(prof, 2 * HX, 0.015));
    for (const s of [-1, 1]) H.add('camo', box(0.03, DECK - FY + 0.02, HR - SF - 0.25, s * (HX - 0.015), (FY + DECK) / 2, (SF + 0.25 + HR) / 2));
    H.add('camo', box(2 * HX, DECK - FY + 0.02, 0.03, 0, (FY + DECK) / 2, HR - 0.015));
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
      H.add('camo', xTube(s * HX, s * (TX - 0.13), 0.17, 0.15, 16, SPR.y, SPR.z));
      H.add('dark', rivets([0, 1, 2, 3, 4, 5, 6, 7].map((k) => V(s * (TX - 0.13), SPR.y + Math.cos(k * Math.PI / 4) * 0.12, SPR.z + Math.sin(k * Math.PI / 4) * 0.12)), V(s, 0, 0), 0.012));
      H.add('camo', rod(V(s * HX, 0.7, IDL.z - 0.25), V(s * (TX - 0.12), IDL.y, IDL.z), 0.045, 8));
      H.add('dark', zTube(IDL.z - 0.45, IDL.z - 0.2, 0.02, 0.02, 6, s * (HX + 0.02), 0.72));
      // the fenders over the tracks, their front ends bent down over the sprocket, the stowage on them
      H.add('camo', box(FX - HX + 0.02, 0.012, HR - HF - 0.35, s * (HX + FX) / 2, DECK, (HF + 0.35 + HR) / 2));
      H.add('camo', box(FX - HX + 0.02, 0.012, 0.38, s * (HX + FX) / 2, DECK - 0.1, HF + 0.16, -0.55));
      H.add('camo', box(0.012, 0.06, HR - HF - 0.35, s * FX, DECK - 0.03, (HF + 0.35 + HR) / 2));
      H.add('dark', rivetRow(V(s * (FX + 0.007), DECK - 0.03, HF + 0.45), V(s * (FX + 0.007), DECK - 0.03, HR - 0.1), 0.2, V(s, 0, 0), 0.008));
      // tow shackles front and rear
      for (const [z, d] of [[HF, -1], [HR, 1]]) {
        H.add('camo', box(0.06, 0.16, 0.14, s * 0.62, 0.52, z + d * 0.06));
        H.add('steel', new THREE.TorusGeometry(0.06, 0.016, 6, 12).rotateY(Math.PI / 2).translate(s * 0.62, 0.5, z + d * 0.16));
      }
    }
    // riveted seams on the hull sides and the glacis
    for (const s of [-1, 1]) H.add('dark', rivetRow(V(s * (HX + 0.004), DECK - 0.06, HF + 0.4), V(s * (HX + 0.004), DECK - 0.06, HR - 0.1), 0.18, V(s, 0, 0), 0.01));
    H.add('dark', rivetRow(V(-HX + 0.06, 0.84, HF - 0.004), V(HX - 0.06, 0.84, HF - 0.004), 0.15, V(0, 0, -1), 0.01));

    // the front deck: the transmission hatches right of the driver, the Notek on the left fender, the travel lock
    H.add('camo', box(0.62, 0.025, 0.42, 0.36, DECK - 0.07 + 0.012, -1.8, -0.18));
    H.add('dark', box(0.62, 0.01, 0.01, 0.36, DECK - 0.04, -1.8 + 0.01, -0.18));
    for (const x of [0.16, 0.56]) H.add('dark', box(0.04, 0.035, 0.08, x, DECK - 0.03, -1.8, -0.18));
    H.add('camo', box(1.6, 0.012, 0.36, 0, DECK + 0.006, -1.78));
    notek(H, -0.95, DECK, HF + 0.35);
    // the travel lock: an A-frame lying folded on the deck in front of the compartment
    for (const s of [-1, 1]) H.add('dark', rod(V(s * 0.25, DECK + 0.03, -1.1), V(s * 0.06, DECK + 0.06, -0.72), 0.02, 6));
    H.add('dark', box(0.2, 0.06, 0.08, 0, DECK + 0.06, -0.7));
    for (const s of [-1, 1]) H.add('dark', box(0.06, 0.06, 0.08, s * 0.25, DECK + 0.03, -1.12));

    // the driver's armoured box at the front left: the front plate with his visor (Fahrersehklappe), a vision slit on
    // the left, the roof hatch in two halves
    const dx = -0.41, dw = 0.74;
    H.add('camo', sideProfile([[-1.95, DECK - 0.01], [-1.2, DECK - 0.01], [-1.2, 1.5], [-1.84, 1.5], [-1.95, 1.4]], dw, 0.01).translate(dx, 0, 0));
    H.add('camo', box(0.3, 0.13, 0.06, dx - 0.05, 1.3, -1.93));
    H.add('dark', box(0.18, 0.012, 0.02, dx - 0.05, 1.31, -1.965));
    H.add('camo', box(0.03, 0.06, 0.18, dx - dw / 2 - 0.012, 1.33, -1.55));
    H.add('dark', box(0.012, 0.012, 0.12, dx - dw / 2 - 0.03, 1.33, -1.55));
    for (const z of [-1.62, -1.32]) H.add('camo', box(0.6, 0.02, 0.28, dx, 1.51, z));
    H.add('dark', box(0.6, 0.012, 0.01, dx, 1.52, -1.47));
    for (const z of [-1.62, -1.32]) H.add('dark', box(0.12, 0.02, 0.03, dx + 0.15, 1.53, z));
    H.add('dark', rivetRow(V(dx - 0.34, 1.46, -1.951), V(dx + 0.34, 1.46, -1.951), 0.1, V(0, 0, -1), 0.009));
    for (const s of [-1, 1]) H.add('dark', rivetRow(V(dx + s * (dw / 2 + 0.004), 1.45, -1.85), V(dx + s * (dw / 2 + 0.004), 1.45, -1.24), 0.1, V(s, 0, 0), 0.009));

    // the engine deck between the driver's box and the compartment: the access hatch, the louvred intakes either side
    H.add('camo', box(0.66, 0.02, 0.5, 0.0, DECK + 0.01, -0.92));
    for (const x of [-0.2, 0.2]) H.add('dark', box(0.1, 0.03, 0.04, x, DECK + 0.03, -0.92));
    for (const s of [-1, 1]) {
      H.add('camo', box(0.3, 0.05, 0.62, s * 0.58, DECK + 0.025, -0.9));
      for (let k = 0; k < 8; k++) H.add('dark', box(0.26, 0.015, 0.035, s * 0.58, DECK + 0.055, -1.16 + k * 0.075));
    }
    // the rear: the silencer across the hull's rear plate with its outlet to the left, the towing pintle, the jack
    silencer(H, -0.52, 0.42, 0.72, HR + 0.13, 0.11);
    for (const x of [-0.35, 0.25]) H.add('dark', box(0.05, 0.1, 0.12, x, 0.72, HR + 0.05));
    H.add('rust', rod(V(-0.52, 0.72, HR + 0.13), V(-0.68, 0.66, HR + 0.16), 0.035, 8), { tint: 0x8c7464 });
    H.add('rust', rod(V(0.2, 0.84, HR + 0.02), V(0.2, 0.75, HR + 0.1), 0.03, 6), { tint: 0x8c7464 }); // the pipe from the engine
    H.add('camo', box(0.2, 0.12, 0.1, 0.0, 0.48, HR + 0.05));
    H.add('steel', yTube(0.42, 0.56, 0.02, 0.02, 8, 0.0, HR + 0.12));
  }

  // ---------------------------------------------------------------- the fighting compartment
  const C = rig.part();
  // a plate in (z, y) leaned in by LEAN about its foot on the deck at x = s * FX
  const leanSide = (s, pts, t) => sideProfile(pts.map(([z, y]) => [z, y - DECK]), t).rotateZ(s * LEAN).translate(s * (FX - t / 2), DECK, 0);
  const xAt = (y) => FX - Math.tan(LEAN) * (y - DECK); // the sides' inner face, near enough, at height y
  const sideP = [[SF, DECK], [HR, DECK], [HR, 1.82], [0.4, 1.92], [-0.18, 1.97], [SF, DECK + 0.2]];
  {
    for (const s of [-1, 1]) {
      C.add('camo', leanSide(s, sideP, 0.012));
      // the top edge rolled, an angle along the deck, the welded seams with the front and rear plates
      C.add('camo', rod(V(s * xAt(1.82), 1.82, HR), V(s * xAt(1.92), 1.92, 0.4), 0.01, 5));
      C.add('camo', rod(V(s * xAt(1.92), 1.92, 0.4), V(s * xAt(1.97), 1.97, -0.18), 0.01, 5));
      C.add('camo', box(0.04, 0.04, HR - SF, s * (FX - 0.03), DECK + 0.02, (SF + HR) / 2));
      // stowage on the fenders ahead of the compartment: jerrycans on the left beside the driver, tools on the right
      if (s < 0) for (const z of [-1.05, -0.72]) jerrycan(C, -FX + 0.16, DECK, z, Math.PI / 2);
      else { tool(C, 'shovel', FX - 0.08, DECK, -1.35, 1.05); tool(C, 'pick', FX - 0.24, DECK, -1.3, 0.9); }
    }
    // the front plate, sloped, up to the gun's opening; the opening's sides up to the side plates' fronts
    const fz0 = SF, fz1 = -0.12, fy0 = DECK, fy1 = 1.97, sl = Math.atan2(fz1 - fz0, fy1 - fy0);
    const fp = (x0, x1, y0, y1) => {
      const t0 = (y0 - fy0) / (fy1 - fy0), t1 = (y1 - fy0) / (fy1 - fy0), l = Math.hypot(fz1 - fz0, fy1 - fy0) * (t1 - t0);
      const zm = fz0 + (fz1 - fz0) * (t0 + t1) / 2, ym = (y0 + y1) / 2;
      return box(x1 - x0, l, 0.014, (x0 + x1) / 2, ym, zm, sl);
    };
    C.add('camo', fp(-xAt(1.25), xAt(1.25), fy0, 1.46));
    for (const s of [-1, 1]) {
      C.add('camo', fp(s > 0 ? 0.33 : -xAt(1.7), s > 0 ? xAt(1.7) : -0.33, 1.44, fy1));
      C.add('dark', rivetRow(V(s * 0.37, 1.5, -0.42), V(s * 0.37, 1.86, -0.15), 0.08, V(0, 0.5, -1), 0.009));
    }
    C.add('dark', rivetRow(V(-0.9, 1.1, -0.53), V(0.9, 1.1, -0.53), 0.12, V(0, 0.5, -1), 0.009));
    // the rear plate with its door (the round's way in from the man on the ground), the door's hinges and handle
    C.add('camo', box(2 * xAt(1.43), 0.77, 0.014, 0, (DECK + 1.82) / 2, HR - 0.007));
    C.add('dark', box(0.7, 0.012, 0.012, 0.1, 1.42, HR + 0.004));
    for (const x of [-0.25, 0.45]) C.add('dark', box(0.012, 0.37, 0.012, x, (DECK + 1.42) / 2, HR + 0.004));
    for (const y of [1.12, 1.34]) C.add('dark', zTube(HR, HR + 0.03, 0.022, 0.022, 8, -0.27, y));
    C.add('dark', box(0.1, 0.025, 0.04, 0.38, 1.3, HR + 0.02));
    C.add('dark', box(0.25, 0.03, 0.12, 0.1, 0.62, HR + 0.18)); // a step over the silencer
    // the floor and its tread plate
    C.add('camo', box(2 * HX, 0.03, HR - SF - 0.25, 0, FY - 0.015, (SF + 0.25 + HR) / 2));
    C.add('dark', box(2 * HX - 0.1, 0.008, HR - SF - 0.35, 0, FY + 0.004, (SF + 0.25 + HR) / 2)); // its tread plate
    // the ready rounds in a bin across the right half of the rear plate, standing case bases up (the compartment is a
    // man's width either side of the gun, so nothing else stands on its floor: the layer and the loader have the left,
    // the commander and the ammunition man the right)
    roundBin(C, 0.28, xAt(1.4) - 0.03, HR - 0.23, HR - 0.03, FY, 0.62, 0.055, 1, 6);
    // the rod antenna on its base outside the left rear corner (the Fu 16 sits under the commander's feet in the sponson)
    C.add('steel', yTube(1.4, 1.48, 0.03, 0.03, 8, -xAt(1.45) - 0.06, HR - 0.15));
    C.add('camo', box(0.06, 0.1, 0.1, -xAt(1.45) - 0.03, 1.4, HR - 0.15));
    C.add('dark', yTube(1.48, 3.2, 0.008, 0.004, 5, -xAt(1.45) - 0.06, HR - 0.15));
    // the MG 34 clipped to the outside of the right wall, over the fender
    C.add('dark', zTube(0.3, 1.3, 0.025, 0.025, 8, xAt(1.6) + 0.06, 1.6));
    C.add('dark', box(0.05, 0.12, 0.22, xAt(1.6) + 0.06, 1.55, 1.15));
    for (const z of [0.5, 1.1]) C.add('dark', box(0.06, 0.04, 0.04, xAt(1.6) + 0.03, 1.6, z));
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
    // the panoramic sight (Rbl F 32) on its bracket off the left cheek, its head over the shield, the eyepiece back
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
  // the curved shield on the cradle: a band about the trunnions in front of the front plate's opening, the barrel and
  // its cylinders through it
  const S = rig.part();
  {
    const R0 = 0.85, a0 = -32 * DEG, a1 = 16 * DEG, n = 10, pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([-R0 * Math.cos(a), R0 * Math.sin(a)]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push([-(R0 - 0.014) * Math.cos(a), (R0 - 0.014) * Math.sin(a)]); }
    S.add('camo', sideProfile(pts, 0.74));
    for (const s of [-1, 1]) { // its edges turned back, the stays to the cradle
      const e = [];
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; e.push([-R0 * Math.cos(a) + 0.002, R0 * Math.sin(a)]); }
      for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; e.push([-(R0 - 0.08) * Math.cos(a), (R0 - 0.08) * Math.sin(a)]); }
      S.add('camo', sideProfile(e, 0.012).translate(s * 0.364, 0, 0));
      S.add('dark', rod(V(s * 0.3, -0.25, -0.75), V(s * 0.13, -0.15, -0.4), 0.014, 5));
    }
    const rv = [];
    for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * i / n; for (const x of [-0.33, 0.33]) rv.push(V(x, R0 * Math.sin(a), -R0 * Math.cos(a) - 0.003)); }
    S.add('dark', rivets(rv, V(0, 0, -1), 0.009));
    S.add('camo', zTube(-R0 - 0.06, -R0 + 0.02, 0.1, 0.1, 18)); // the collar round the barrel's slot
  }
  S.build(el, { dirt: 0.3, y0: TRY });

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
    for (const [x, z] of [[0.95, 3.0], [0.95, 3.42]]) {
      G.add('wicker', box(0.42, 0.24, 0.36, x, 0.12, z));
      G.add('dark', box(0.43, 0.02, 0.37, x, 0.24, z));
      for (const xx of [-0.12, 0, 0.12]) G.add('brass', yTube(0.24, 0.26, 0.055, 0.055, 10, x + xx, z));
    }
    G.add('camo', box(0.36, 0.22, 0.55, -0.15, 0.11, 3.35), { tint: 0x9a9a88 });
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
    floor: FY, deck: DECK, plateTop: 1.82, plateZ: HR,
    basket: { x: 0.95, y: 0.3, z: 3.0 }, over: { x: 0.35, y: 2.0, z: HR - 0.05 }, inside: { x: 0.62, y: FY + 0.75, z: HR - 0.13 },
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
  rig.anchors.eye = node(trav, 'eye', 0, 2.2, 1.2);
  rig.anchors.exhaust = node(trav, 'exhaust', -0.7, 0.66, HR + 0.17);
  rig.anchors.shellStack = node(trav, 'shellStack', 0.6, FY + 0.64, HR - 0.13);
  rig.recoilLength = 1.0; // (the 18/2 in its mounting; the field carriage's 1.19 m would reach the rear plate at 42 degrees)
  rig.loadEl = 4 * DEG; // GUNS.wespe.loadEl
  floorFade(rig, TRY - FY, 0.48, 0.16, 0.08, 0.3);
  rig.muzzleZ = MZ;

  // The crew (5, GUNS.wespe.crew): on the left of the gun the layer at the sight and the handwheels and the loader behind
  // him (he works the block from the left and puts the cartridge in), on the right the commander at the front and the
  // ammunition man behind him (he brings each round from the bin to the breech), and one man on the ground behind
  // who hands rounds up over the rear plate from the baskets. All of them turn with the vehicle (world: false: the
  // commander too, who would otherwise stay put in the world frame as a field gun's does).
  const spot = (role, x, z, heading, pose, y = FY) => rig.anchors.crew.push({ role, x, y, z, heading, pose, world: false });
  spot('officer', 0.7, 0.78, 0, 'point');
  spot('layer', -0.72, 0.8, 0, 'lay');
  spot('loader', -0.72, 1.45, L90, 'stand');
  spot('shell', 0.7, 1.45, 0, 'carry');
  spot('passer', 0.35, HR + 0.62, 0, 'stand', 0);

  hb(rig, -FX, 0, HF - 0.05, FX, DECK, HR + 0.2);
  hb(rig, -1.05, DECK, SF, 1.05, 1.9, HR);
  hb(rig, -0.12, TRY - 0.15, TRZ + MZ - 0.4, 0.12, TRY + 0.15, TRZ);
  return finishRig(rig, 'wespe', 'lefh18');
}

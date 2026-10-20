import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, topProfile, zLathe, rivetRow, handwheel, gearArc, Parts, vehicleMats, DEG } from '../../kit.js';
import { mulberry32 } from '../../../noise.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun, pivotAt, hb, trayMount } from '../../rig.js';
import { clamp01 } from './heavy_common.js';

// Paris-Geschütz (Kaiser-Wilhelm-Geschütz, Krupp 1918), the "Paris Gun" (refs/paris: the side photograph IWM
// Q 65801A, the model in the Wehrtechnische Studiensammlung Koblenz, the assembly photograph, Miller's shell drawing).
// Published figures: a 21 cm liner 30 to 31 m long in a worn 38 cm SK L/45 jacket (17.13 m), projecting 13.9 m past
// it under a reinforcing sleeve, and a 6 m smoothbore extension at the muzzle: about 34 m; the 38 cm's horizontal
// sliding block; held straight by a suspension-bridge-like truss (a king post on the barrel ahead of the cradle,
// a stay forward over a strut to a clamp 6 to 7 m short of the muzzle, a stay back to a block on the breech); fired
// at 50 to 55 degrees from a steel firing frame (Schießgerüst) on a concrete bed: a naval turntable under its front,
// rollers on a curved racer under its rear, "space for the breech in the middle". Game estimates (no drawing found):
// the frame's girders and decks, the trunnion's height and station, the turntable's and racer's sizes, the crane.
//
// Frames (DESIGN.md "Models"): root y = 0 is the ground, the traverse pivot (the turntable's centre) at the origin.
// The concrete drum under the turntable and the racer wall with its rails are the root's (they do not turn); the
// frame, its decks, the stair, the shell cart and everything above turn in `traverse` (racer arc +-36 degrees).
// `elevation` at the trunnions (TY above the ground, TZ behind the pivot; 0 to 55 degrees, loads at 0): the breech
// swings down between the girders into the open ground between the drum and the racer. `recoil` along the bore,
// held short at high elevation (recoilFade) so the breech ring clears the turntable and the ground. `breech` the
// sliding block (position.x, out to the right). `tray` (trayMount: slides 2.2 m to the left when stowed).
// `crane`, `hoist`: a small slewing crane on the frame's right rear corner; the crane group is the root's (so the
// hook's height is a height above the ground) and setTraverse keeps it over its post (the Bertha's pattern): at
// rig.craneRest (PI + az) the hook hangs over the shell cart beside the frame, which rides with it.

const BH = 2.05; // the frame's underside: the turntable plate's top
const DR = 3.2, DH = 1.6; // the concrete drum (radius, top) under the turntable
const TR = 3.2; // the turntable: the fixed steel ring and the frame's plate on it (radius)
const RR = 13.2, RA = 36 * DEG, RW = 1.8, RH0 = 1.5; // the racer: rail centre radius, half arc, wall width and top
const RG = 0.3; // half the racer's gauge (two rails at RR +- RG)
const GX = 1.3, GT = 0.45, GI = GX - GT / 2, GO = GX + GT / 2; // the girders: centre, thickness, inner and outer faces
const FZ0 = -3.6, FZ1 = 14.6; // the frame's ends
const DY = 6.1; // the deck (galleries and the loading platform)
const GTOP = DY - 0.1, RB = 3.2; // the girders' top; their underside behind the turntable
const GAL = 2.9; // the galleries reach out to here
const TY = 7.2, TZ = 0.4; // the trunnion axis
const BRE = 6.5, LEN = 34.0, MUZ = BRE - LEN; // breech face and muzzle along the bore (recoil frame, z + back)
const JF = BRE - 17.13; // the jacket's muzzle (the 38 cm SK L/45 tube)
const TF = MUZ + 6.0; // the smoothbore extension's joint
const CR0 = -3.6, CR1 = 3.0; // the cradle sleeve
const RING = { w: 1.3, z0: 5.0 }; // the breech ring: square, from z0 to the face
const PZ = -5.8, PH = 5.6; // the truss: the king post's station and its head above the bore
const SZ = MUZ + 11.7, SH = 2.5, FCZ = MUZ + 6.9; // the strut and its head, the front clamp
const AZ = 5.1, AY = 1.32; // where the rear stays end on the anchor block over the breech
const DZ0 = 7.5; // the loading platform's front edge between the girders (behind the breech's sweep)
const CX = 2.5, CZ = 9.4, CTOP = 10.8; // the crane's post and the jib's height
const SHELL = { len: 1.05, rad: 0.105 }; // the 106 kg shell (Miller: 1,050 mm, 210 mm)
const HANG = 0.85; // the shell's middle below the hook
const CART = { x: 0, z: CZ, top: 0.62 }; // the shell cart (traverse frame): x set from the crane's reach below
const CONC = 0x9c978a; // concrete

export function buildParis() {
  const rig = newGunRig('paris', 'bunt');
  const root = rig.root, mats = rig.mats;
  const mk = () => new Parts(mats);
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, TZ);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const BX = 0.55, BSLIDE = 0.85;
  const brc = pivotAt(rig, rec, 'breech', BX, 0, BRE - 0.32);
  rig.recoilLength = 1.6;
  rig.loadEl = 0;
  rig.staffLen = 2.6;
  const tray = trayMount(rig, trav, elev, -0.2, BRE + 0.12, 0.2, 0.85, 2.2);

  // railings: posts every `step`, a top rail and a knee rail
  const rail = (P, x0, z0, x1, z1, y, h = 1.0, step = 1.4) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; P.add('dark', rod(V(x, y, z), V(x, y + h, z), 0.024, 5)); }
    P.add('dark', rod(V(x0, y + h, z0), V(x1, y + h, z1), 0.026, 5));
    P.add('dark', rod(V(x0, y + h * 0.5, z0), V(x1, y + h * 0.5, z1), 0.018, 5));
  };

  // ---------------------------------------------------------------- the bed (root: does not turn)
  const PB = mk();
  {
    // the concrete drum under the turntable, the fixed steel ring on it with its roller path and the toothed rim
    PB.add('white', yTube(0, DH, DR + 0.25, DR, 40), { tint: CONC });
    PB.add('dark', yTube(DH, DH + 0.24, TR, TR, 48));
    PB.add('steel', yTube(DH + 0.24, DH + 0.27, TR - 0.15, TR - 0.15, 48));
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      PB.add('dark', box(0.07, 0.16, 0.1, Math.sin(a) * (TR + 0.04), DH + 0.12, Math.cos(a) * (TR + 0.04), 0, a, 0));
    }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; PB.add('dark', yTube(DH - 0.04, DH + 0.02, 0.06, 0.06, 6, Math.sin(a) * (DR + 0.12), Math.cos(a) * (DR + 0.12))); } // anchor bolts
    // the racer: a curved concrete wall at the rear with two rails on top; buffer stops at its ends
    const arc = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [r * Math.sin(a), r * Math.cos(a)]; });
    const A0 = -RA - 2 * DEG, A1 = RA + 2 * DEG;
    PB.add('white', topProfile([...arc(RR + RW / 2, A0, A1, 40), ...arc(RR - RW / 2, A1, A0, 40)], 0, RH0), { tint: CONC });
    for (const dr of [-RG, RG]) {
      const pts = arc(RR + dr, A0 + 0.5 * DEG, A1 - 0.5 * DEG, 48);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        PB.add('steel', box(0.08, 0.14, Math.hypot(x1 - x0, z1 - z0) + 0.01, (x0 + x1) / 2, RH0 + 0.07, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, z1 - z0), 0));
      }
    }
    for (const a of [A0 + DEG, A1 - DEG]) PB.add('dark', box(1.2, 0.5, 0.35, Math.sin(a) * RR, RH0 + 0.25, Math.cos(a) * RR, 0, a + Math.PI / 2, 0));
    // the traverse scale along the wall's inner face: white marks every degree, longer every five
    for (let d = -36; d <= 36; d++) {
      const a = d * DEG, r = RR - RW / 2 - 0.005, h = d % 5 ? 0.12 : 0.3;
      PB.add('white', box(0.03, h, 0.012, Math.sin(a) * r, RH0 - h / 2 - 0.02, Math.cos(a) * r, 0, a, 0), { tint: 0xe8e4d8 });
    }
  }

  // ---------------------------------------------------------------- the firing frame (traverse)
  const PF = mk();
  {
    // the frame's plate on the turntable, the king pin, the bolt circle and the big lightening holes (the model)
    PF.add('camo', yTube(DH + 0.27, BH, TR - 0.1, TR - 0.1, 48));
    PF.add('dark', yTube(BH, BH + 0.25, 0.6, 0.6, 18));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20 + 0.025) * Math.PI * 2, r = TR - 0.55;
      if (Math.abs(Math.sin(a) * r) < GO + 0.3) continue; // under the girders
      PF.add('dark', new THREE.CircleGeometry(0.2, 14).rotateX(-Math.PI / 2).translate(Math.sin(a) * r, BH + 0.004, Math.cos(a) * r));
      PF.add('camo', new THREE.TorusGeometry(0.21, 0.03, 5, 14).rotateX(Math.PI / 2).translate(Math.sin(a) * r, BH + 0.004, Math.cos(a) * r));
    }
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; PF.add('dark', yTube(BH, BH + 0.04, 0.035, 0.035, 6, Math.sin(a) * (TR - 0.25), Math.cos(a) * (TR - 0.25))); }
    // the two girders: deep plate girders, tall over the turntable, then up off the ground behind it
    const prof = [[FZ0, BH], [2.6, BH], [4.4, RB], [FZ1, RB], [FZ1, GTOP], [-2.2, GTOP], [FZ0, 4.2]];
    for (const s of [-1, 1]) {
      const xo = s * GO, xi = s * GI;
      PF.add('camo', sideProfile(prof, GT, 0.02).translate(s * GX, 0, 0));
      // flange angles top and bottom, the stiffening plates on the outer face (the photograph's rows), rivets
      PF.add('camo', box(0.5, 0.08, FZ1 + 2.2, s * GX, GTOP - 0.04, (FZ1 - 2.2) / 2));
      PF.add('camo', box(0.5, 0.08, FZ1 - 4.4, s * GX, RB + 0.04, (FZ1 + 4.4) / 2));
      PF.add('camo', box(0.5, 0.08, 2.6 - FZ0, s * GX, BH + 0.04, (2.6 + FZ0) / 2));
      for (let z = -1.6; z < FZ1 - 0.2; z += 1.2) {
        const y0 = z < 2.6 ? BH + 0.1 : z < 4.4 ? BH + 0.1 + ((z - 2.6) / 1.8) * (RB - BH) : RB + 0.1;
        PF.add('camo', box(0.1, GTOP - 0.1 - y0, 0.2, xo + s * 0.05, (GTOP - 0.1 + y0) / 2, z));
        PF.add('camo', box(0.1, GTOP - 0.1 - y0, 0.08, xi - s * 0.04, (GTOP - 0.1 + y0) / 2, z + 0.6));
      }
      PF.add('dark', rivetRow(V(xo + s * 0.01, GTOP - 0.2, -2.0), V(xo + s * 0.01, GTOP - 0.2, FZ1 - 0.2), 0.3, V(s, 0, 0), 0.025));
      PF.add('dark', rivetRow(V(xo + s * 0.01, RB + 0.2, 4.6), V(xo + s * 0.01, RB + 0.2, FZ1 - 0.2), 0.3, V(s, 0, 0), 0.025));
      PF.add('dark', rivetRow(V(xo + s * 0.01, BH + 0.2, FZ0 + 0.2), V(xo + s * 0.01, BH + 0.2, 2.5), 0.3, V(s, 0, 0), 0.025));
      // X bracing in the rear panels (the photograph's crossed flats)
      for (const z of [8.2, 10.6, 13.0]) {
        PF.add('camo', rod(V(xo + s * 0.06, RB + 0.2, z - 1.0), V(xo + s * 0.06, GTOP - 0.25, z + 1.0), 0.05, 4));
        PF.add('camo', rod(V(xo + s * 0.06, GTOP - 0.25, z - 1.0), V(xo + s * 0.06, RB + 0.2, z + 1.0), 0.05, 4));
      }
      // the trunnion pedestal on the girder's top, its bearing open above (the cap goes with the cradle's side)
      PF.add('camo', box(0.7, TY - 0.35 - GTOP, 1.7, s * (GX - 0.05), (TY - 0.35 + GTOP) / 2, TZ));
      PF.add('camo', xTube(s * 0.9, s * 1.6, 0.62, 0.62, 24, TY, TZ)); // the bearing housing round the pin, its cap bolted on
      PF.add('camo', box(0.7, 0.1, 1.5, s * (GX - 0.05), TY, TZ));
      for (const dz of [-0.95, 0.95]) PF.add('camo', box(0.7, 0.22, 0.24, s * (GX - 0.05), TY - 0.05, TZ + dz)); // the cap's bolting lugs
      for (const dz of [-0.95, 0.95]) PF.add('dark', yTube(TY + 0.06, TY + 0.2, 0.05, 0.05, 6, s * (GX - 0.05), TZ + dz));
      for (const e of [-1, 1]) PF.add('camo', rod(V(s * GO, GTOP, TZ + e * 0.85), V(s * (GO + 0.6), GTOP - 1.2, TZ + e * 1.7), 0.07, 4)); // gussets to the gallery
      // the rear trestle legs down to the racer truck, and the truck: a frame with two rollers on each rail
      const tz = Math.sqrt(RR * RR - GX * GX);
      for (const dz of [-0.55, 0.55]) PF.add('camo', box(0.36, RB - 2.35, 0.3, s * GX, (RB + 2.35) / 2, tz + dz));
      PF.add('camo', rod(V(s * GX, RB - 0.05, tz - 1.6), V(s * GX, 2.45, tz - 0.6), 0.08, 4));
      PF.add('dark', box(1.3, 0.3, 1.25, s * GX, 2.3, tz));
      for (const dr of [-RG, RG]) for (const dx of [-0.35, 0.35]) {
        PF.add('steel', zTube(tz + dr - 0.07, tz + dr + 0.07, 0.24, 0.24, 16, s * GX + dx, RH0 + 0.14 + 0.24));
        PF.add('dark', zTube(tz + dr - 0.1, tz + dr + 0.1, 0.06, 0.06, 8, s * GX + dx, RH0 + 0.38));
      }
    }
    // cross ties: the nose box over the turntable, the bearing plate on the king pin (never behind z 1: the breech goes
    // down there), the rear ties under the loading platform
    PF.add('camo', box(2 * GI, 2.0, 1.1, 0, BH + 1.0, FZ0 + 0.55));
    PF.add('camo', box(2 * GI, 0.3, 1.0 - FZ0, 0, BH + 0.15, (1.0 + FZ0) / 2));
    PF.add('camo', box(2 * GI, GTOP - RB, 0.9, 0, (GTOP + RB) / 2, 9.4));
    PF.add('camo', box(2 * GI, GTOP - RB, 0.9, 0, (GTOP + RB) / 2, FZ1 - 0.45));
    PF.add('camo', box(2 * GI, 0.25, FZ1 - DZ0, 0, GTOP - 0.13, (FZ1 + DZ0) / 2));
    // the elevating gear: a pinion on a stub shaft from each girder's inner face, a gear case outside
    const PIN = { y: TY - 2.04, z: TZ, r: 0.22 };
    for (const s of [-1, 1]) {
      PF.add('steel', xTube(s * 0.55, s * (GI + 0.02), 0.08, 0.08, 10, PIN.y, PIN.z));
      PF.add('iron', xTube(s * 0.56, s * 0.7, PIN.r, PIN.r, 18, PIN.y, PIN.z));
      PF.add('camo', box(0.35, 0.8, 0.9, s * (GO + 0.17), PIN.y, PIN.z + 0.2));
    }
    // the galleries along both sides at the deck's height, over the girders' tops, and the loading platform
    for (const s of [-1, 1]) {
      const xm = s * (GO + GAL) / 2;
      PF.add('camo', box(GAL - GO, 0.08, FZ1 + 2.2, xm, DY - 0.04, (FZ1 - 2.2) / 2));
      PF.add('camo', box(0.12, 0.22, FZ1 + 2.2, s * (GAL - 0.06), DY - 0.15, (FZ1 - 2.2) / 2));
      for (let z = -2.0; z < FZ1; z += 1.5) PF.add('camo', rod(V(s * GO, GTOP - 1.4, z), V(s * (GAL - 0.12), DY - 0.2, z), 0.05, 4)); // brackets
      for (let z = -2.0; z < FZ1; z += 0.5) PF.add('dark', box(GAL - GO - 0.12, 0.012, 0.035, xm, DY + 0.006, z));
      // the deck over the girder's top, leaving the trunnion pedestal standing through it
      for (const [z0, z1] of [[-2.2, TZ - 0.9], [TZ + 0.9, FZ1]]) PF.add('camo', box(GO - GI + 0.02, 0.1, z1 - z0, s * GX, DY - 0.05, (z0 + z1) / 2));
      rail(PF, s * (GAL - 0.04), -2.15, s * (GAL - 0.04), FZ1 - 0.05, DY);
      rail(PF, s * (GI + 0.05), -2.15, s * (GAL - 0.04), -2.15, DY, 1.0, 1.0);
    }
    PF.add('timber', box(2 * GI, 0.06, FZ1 - DZ0, 0, DY - 0.03, (FZ1 + DZ0) / 2));
    for (let z = DZ0 + 0.15; z < FZ1; z += 0.3) PF.add('dark', box(2 * GI - 0.04, 0.006, 0.02, 0, DY + 0.003, z));
    PF.add('camo', box(2 * GI, 0.2, 0.12, 0, DY - 0.12, DZ0 + 0.06)); // the platform's front edge over the breech well
    // the rear railing, open in the middle for the stair
    for (const s of [-1, 1]) rail(PF, s * 0.75, FZ1 - 0.05, s * (GAL - 0.04), FZ1 - 0.05, DY, 1.0, 1.1);
    // the stair from the ground behind the racer up to the platform (the photograph's long rear stair)
    {
      const z0 = FZ1, z1 = FZ1 + 7.2, n = Math.round(DY / 0.21);
      for (let k = 1; k < n; k++) { const t = k / n; PF.add('dark', box(1.3, 0.04, 0.28, 0, DY - DY * t, z0 + (z1 - z0) * t)); }
      for (const x of [-0.7, 0.7]) {
        PF.add('camo', rod(V(x, DY, z0), V(x, 0.05, z1), 0.06, 4));
        PF.add('dark', rod(V(x, DY + 1.0, z0), V(x, 1.0, z1), 0.025, 5));
        for (let k = 0; k <= 4; k++) { const t = k / 4; PF.add('dark', rod(V(x, DY * (1 - t), z0 + (z1 - z0) * t), V(x, DY * (1 - t) + 1.0, z0 + (z1 - z0) * t), 0.022, 5)); }
      }
      // a trestle under its middle (it clears the racer wall)
      for (const x of [-0.7, 0.7]) PF.add('camo', box(0.14, DY * 0.5, 0.14, x, DY * 0.25, (z0 + z1) / 2));
    }
    // the layer's station (left gallery): the elevating handwheel and the clinometer; the elevation dial (right)
    PF.add('camo', box(0.24, 1.0, 0.4, -(GO + 0.35), DY + 0.5, TZ + 1.6));
    PF.add('iron', handwheel(0.32, 6, 0.025, 0.06).translate(-(GO + 0.52), DY + 1.05, TZ + 1.6));
    PF.add('camo', rbox(0.26, 1.0, 0.6, 0.04, GO + 0.3, DY + 0.5, TZ + 1.6));
    PF.add('iron', handwheel(0.26, 5, 0.022, 0.05).translate(GO + 0.46, DY + 1.1, TZ + 1.6));
    PF.add('white', box(0.02, 0.26, 0.36, GO + 0.49, DY + 0.62, TZ + 1.6), { tint: 0xd8d4c4 });
    // the traverse gear: a handwheel on a column at the rear left, the shaft down to the racer truck
    PF.add('camo', box(0.3, 0.9, 0.3, -2.1, DY + 0.45, 13.0));
    PF.add('iron', handwheel(0.34, 6, 0.025, 0.06).rotateY(Math.PI / 2).translate(-2.1, DY + 1.0, 13.25));
    PF.add('steel', yTube(RB - 0.6, DY, 0.05, 0.05, 6, -(GO + 0.35), 13.0));
    // the crane's hand winch, on a stand beside the mast's foot (the rope runs up the mast)
    PF.add('camo', box(0.5, 0.9, 0.36, CX - 0.55, DY + 0.45, CZ + 0.45));
    PF.add('iron', xTube(CX - 0.8, CX - 0.3, 0.11, 0.11, 12, DY + 0.95, CZ + 0.45));
    for (const s of [-1, 1]) PF.add('dark', box(0.04, 0.28, 0.04, CX - 0.55 + s * 0.29, DY + 0.95, CZ + 0.6));
    // the cartridge rack at the platform's right rear (the brass cases and the bags, kept warm under a tarpaulin)
    PF.add('timber', box(1.0, 0.9, 1.8, 2.3, DY + 0.45, 12.2));
    PF.add('cloth', box(1.06, 0.06, 1.86, 2.3, DY + 0.93, 12.2));
    for (let k = 0; k < 3; k++) PF.add('brass', xTube(1.85, 2.75, 0.13, 0.13, 12, DY + 0.25 + k * 0.3, 11.2));
    // the chamber gauge's box and the time keeper's table at the platform's left rear
    PF.add('timber', box(1.0, 0.8, 0.6, -2.2, DY + 0.4, 11.4));
    PF.add('white', box(0.5, 0.02, 0.35, -2.2, DY + 0.81, 11.4), { tint: 0xe6e0cc });
  }

  // ---------------------------------------------------------------- the shell cart beside the frame (traverse)
  const PK = mk();
  const R = Math.hypot(CX, TZ + BRE + 0.12 + 0.85 - CZ); // the crane's reach: post to the tray
  CART.x = CX + R;
  {
    const { x, z, top } = CART;
    PK.add('timber', box(0.95, 0.1, 1.6, x, top - 0.05, z));
    for (const s of [-1, 1]) PK.add('dark', box(0.08, 0.16, 1.6, x + s * 0.44, top - 0.16, z));
    for (const dz of [-0.55, 0.55]) {
      PK.add('steel', xTube(x - 0.5, x + 0.5, 0.03, 0.03, 6, 0.2, z + dz));
      for (const s of [-1, 1]) PK.add('dark', xTube(x + s * 0.36, x + s * 0.44, 0.2, 0.2, 14, 0.2, z + dz));
    }
    for (const dz of [-0.35, 0.35]) PK.add('timber', box(0.6, 0.08, 0.12, x, top + 0.04, z + dz)); // chocks under the shell
    PK.add('dark', rod(V(x, top - 0.1, z - 0.8), V(x, 0.95, z - 1.5), 0.025, 5)); // the push handle
    PK.add('dark', xTube(x - 0.25, x + 0.25, 0.025, 0.025, 6, 0.95, z - 1.5));
  }

  // ---------------------------------------------------------------- the cradle (elevation)
  const PE = mk();
  {
    // a sleeve round the barrel (hollow: the barrel slides in it), its front and rear flanges
    const BI = 0.63;
    PE.add('camo', zLathe([[CR0, BI], [CR0, 0.92], [CR0 + 0.3, 0.92], [CR0 + 0.3, 0.8], [CR1 - 0.25, 0.8], [CR1 - 0.25, 0.88], [CR1, 0.88], [CR1, BI], [CR0, BI]], 32));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; PE.add('dark', zTube(CR0 - 0.04, CR0, 0.04, 0.04, 6, Math.cos(a) * 0.85, Math.sin(a) * 0.85)); }
    // the trunnion block: cheeks either side of the sleeve and saddles over and under it
    for (const s of [-1, 1]) PE.add('camo', rbox(0.18, 1.4, 2.2, 0.04, s * 0.71, 0, 0));
    for (const s of [-1, 1]) PE.add('camo', rbox(1.6, 0.12, 2.2, 0.04, 0, s * 0.72, 0));
    for (const s of [-1, 1]) {
      PE.add('steel', xTube(s * 0.8, s * (GX + 0.3), 0.3, 0.3, 20)); // the trunnion pins
      PE.add('camo', xTube(s * 0.78, s * 0.86, 0.55, 0.55, 24));
      // the elevating arcs under the cradle, toothed outside
      PE.add('steel', gearArc(1.45, 1.75, 30 * DEG, 94 * DEG, 0.14, 30, 0.05).translate(s * 0.63, 0, 0));
      PE.add('camo', gearArc(0.7, 1.45, 30 * DEG, 94 * DEG, 0.1).translate(s * 0.63, 0, 0));
      // the recoil cylinders under the barrel
      PE.add('camo', zTube(CR0 - 0.3, CR1 - 0.3, 0.17, 0.17, 14, s * 0.36, -0.86));
      PE.add('camo', zTube(CR0 - 0.42, CR0 - 0.3, 0.21, 0.21, 14, s * 0.36, -0.86), { tint: 0xd8dad6 });
    }
    // the housing over the cradle with the recuperator and the clinometer seat
    PE.add('camo', rbox(0.9, 0.5, 4.2, 0.06, 0, 0.92, 0.2));
    PE.add('camo', box(0.36, 0.2, 0.5, 0.25, 1.26, 1.2));
    PE.add('dark', rivetRow(V(-0.4, 1.18, -1.7), V(-0.4, 1.18, 2.1), 0.3, V(0, 1, 0), 0.025));
    PE.add('dark', rivetRow(V(0.4, 1.18, -1.7), V(0.4, 1.18, 2.1), 0.3, V(0, 1, 0), 0.025));
  }
  // ---------------------------------------------------------------- the barrel and the truss (recoil)
  const PR = mk();
  {
    // the smoothbore extension (Tüte), its bolted flange, the liner's reinforcing sleeve, the jacket (a 38 cm
    // tube): one turned profile from the muzzle back to the breech ring
    const p = [[MUZ, 0.105], [MUZ, 0.205], [MUZ + 0.12, 0.205], [MUZ + 0.16, 0.19], [TF - 0.3, 0.215], [TF - 0.3, 0.32], [TF, 0.32], [TF, 0.28]];
    for (let i = 1; i <= 6; i++) { const t = i / 6; p.push([TF + (JF - 0.5 - TF) * t, 0.28 + 0.06 * t]); }
    p.push([JF - 0.5, 0.42], [JF, 0.42], [JF, 0.4]);
    for (let i = 1; i <= 6; i++) { const t = i / 6; p.push([JF + (CR0 - 0.6 - JF) * t, 0.4 + 0.16 * t]); }
    p.push([CR0 - 0.6, 0.6], [RING.z0, 0.62], [RING.z0, 0]);
    PR.add('camo', zLathe(p, 36));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; PR.add('dark', zTube(TF - 0.32, TF + 0.02, 0.03, 0.03, 6, Math.cos(a) * 0.29, Math.sin(a) * 0.29)); } // flange bolts
    PR.add('steel', zTube(CR0 - 0.6, CR0 + 0.02, 0.605, 0.605, 36), { tint: 0xa2a6aa }); // the slide ahead of the cradle
    PR.add('dark', zTube(MUZ - 0.002, MUZ + 1.2, 0.105, 0.105, 20, 0, 0, true)); // the bore, open head on
    PR.add('dark', new THREE.CircleGeometry(0.105, 20).rotateY(Math.PI).translate(0, 0, MUZ + 1.2));
    // the breech ring: a square block with the sliding block's slot, the anchor block for the rear stays on top
    const W = RING.w, L = BRE - RING.z0;
    for (const y of [-0.45, 0.45]) PR.add('camo', rbox(W, 0.4, L, 0.05, 0, y, (BRE + RING.z0) / 2));
    for (const x of [-0.5, 0.5]) PR.add('camo', box(0.3, 0.52, L - 0.65, x, 0, (BRE - 0.65 + RING.z0) / 2));
    PR.add('camo', box(0.2, 0.52, 0.65, -0.55, 0, BRE - 0.325)); // the slot's closed end (left)
    PR.add('dark', new THREE.CircleGeometry(0.24, 20).translate(0, 0, RING.z0 + 0.005)); // the chamber, seen with the block open
    PR.add('camo', rbox(0.8, 0.62, 1.5, 0.05, 0, 0.95, AZ + 0.55));
    for (const x of [-0.16, 0.16]) PR.add('dark', box(0.05, 0.24, 0.3, x, AY + 0.03, AZ + 0.05)); // eye plates
    PR.add('white', box(0.02, 0.3, 0.6, -W / 2 - 0.01, 0.15, RING.z0 + 0.6), { tint: 0xc8c4b4 }); // the data plate
    // clamp collars on the barrel for the truss: at the post, the strut and the front stays
    const collar = (z, r, l) => { PR.add('camo', zTube(z - l / 2, z + l / 2, r, r, 24)); for (const e of [-1, 1]) PR.add('dark', box(0.1, 0.12, l * 0.8, e * (r + 0.04), 0, z)); };
    const rAt = (z) => { for (let i = 0; i < p.length - 1; i++) { const [z0, r0] = p[i], [z1, r1] = p[i + 1]; if (z >= z0 && z <= z1 && z1 > z0) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0); } return 0.5; };
    const rP = rAt(PZ) + 0.07, rS = rAt(SZ) + 0.06, rF = rAt(FCZ) + 0.06;
    collar(PZ, rP, 0.7); collar(SZ, rS, 0.4); collar(FCZ, rF, 0.5);
    // the king post: two channel legs closing toward the head, laced, on a saddle over the collar
    PR.add('camo', box(0.7, 0.16, 0.8, 0, rP + 0.02, PZ));
    const leg = (s, t) => V(s * (0.26 - 0.14 * t), rP + 0.1 + (PH - rP - 0.1) * t, PZ);
    for (const s of [-1, 1]) PR.add('camo', rod(leg(s, 0), leg(s, 1), 0.06, 6));
    for (let k = 0; k < 10; k++) {
      const t0 = k / 10, t1 = (k + 1) / 10;
      PR.add('dark', rod(leg(-1, t0), leg(1, t1), 0.022, 4));
      PR.add('dark', rod(leg(1, t0), leg(-1, t1), 0.022, 4));
    }
    for (const fz of [-1, 1]) PR.add('camo', rod(V(0, rP + 0.12, PZ + fz * 0.4), V(0, PH * 0.45, PZ), 0.04, 4)); // fore and aft knees
    PR.add('camo', box(0.4, 0.2, 0.5, 0, PH + 0.05, PZ));
    for (const x of [-0.12, 0.12]) PR.add('dark', box(0.04, 0.35, 0.36, x, PH + 0.25, PZ)); // the stays' eye plates
    // the strut, a tube on its collar, a saddle on top for the stays
    PR.add('camo', rod(V(0, rS, SZ), V(0, SH, SZ), 0.07, 8));
    PR.add('camo', box(0.36, 0.12, 0.3, 0, SH + 0.04, SZ));
    for (const s of [-1, 1]) PR.add('dark', rod(V(s * 0.12, rS + 0.05, SZ), V(0, SH * 0.55, SZ), 0.025, 4));
    // the stays: paired rods (x +-0.1) over the strut to the front clamp, and back to the anchor block; turnbuckles
    const top = V(0, PH + 0.3, PZ), st = V(0, SH + 0.12, SZ), fc = V(0, rF + 0.04, FCZ), an = V(0, AY + 0.05, AZ);
    for (const x of [-0.1, 0.1]) {
      const o = V(x, 0, 0);
      for (const [a, b] of [[top, st], [st, fc], [top, an]]) {
        const A = a.clone().add(o), B = b.clone().add(o);
        PR.add('dark', rod(A, B, 0.035, 6));
        const m = A.clone().lerp(B, 0.5), d = B.clone().sub(A).normalize();
        PR.add('steel', rod(m.clone().addScaledVector(d, -0.3), m.clone().addScaledVector(d, 0.3), 0.06, 8));
      }
    }
  }
  // the sliding block: a slab through the slot (its right end at the pivot), its operating screw and crank
  const PBR = mk();
  PBR.add('steel', rbox(0.96, 0.46, 0.56, 0.04, -0.5, 0, 0), { tint: 0xc8c8c0 });
  PBR.add('camo', box(0.12, 0.4, 0.46, 0.04, 0, 0));
  PBR.add('steel', xTube(0.1, 0.24, 0.04, 0.04, 8, 0.1, 0.05));
  PBR.add('iron', handwheel(0.14, 5, 0.016, 0.03, 0).translate(0.24, 0.1, 0.05)); // (kept inside the girders' faces)
  PBR.add('brass', zTube(0.28, 0.34, 0.045, 0.045, 10, -0.5, 0)); // the firing lock
  PBR.add('dark', new THREE.TorusGeometry(0.045, 0.01, 6, 12).translate(-0.5, -0.1, 0.36));
  // the loading tray: a trough on two runners, legs that stand on the platform
  const PTR = mk();
  {
    const L = 1.9;
    for (const s of [-1, 1]) {
      PTR.add('camo', box(0.14, 0.04, L, s * 0.13, 0.035, L / 2 + 0.05, 0, 0, s * 0.45));
      PTR.add('camo', box(0.05, 0.09, L, s * 0.29, 0.065, L / 2 + 0.05));
    }
    for (const z of [0.3, 1.0, 1.7]) PTR.add('camo', box(0.64, 0.05, 0.1, 0, -0.01, z));
    const dy = DY + 0.02 - (TY - 0.2); // (the feet stand clear of the deck)
    for (const s of [-1, 1]) PTR.add('camo', box(0.07, -dy - 0.02, 0.07, s * 0.2, dy / 2, 1.6));
    PTR.add('camo', box(0.5, 0.05, 0.25, 0, dy + 0.025, 1.6));
  }

  // ---------------------------------------------------------------- the shell crane (root, kept over its post)
  const crane = new THREE.Group();
  crane.name = 'crane';
  root.add(crane);
  rig.pivots.crane = crane;
  const hoist = pivotAt(rig, crane, 'hoist', -R, 9.8, 0);
  const PC = mk(), PH2 = mk();
  {
    // a lattice mast on a slewing ring (on the gallery), the jib out to the hook, its tie, the winch
    const y0 = DY, y1 = CTOP + 0.4, w = 0.2;
    for (const [x, z] of [[-w, -w], [w, -w], [w, w], [-w, w]]) PC.add('camo', rod(V(x, y0 + 0.2, z), V(x * 0.7, y1, z * 0.7), 0.04, 5));
    for (let y = y0 + 0.4; y < y1 - 0.2; y += 0.55) {
      const k = 1 - 0.3 * ((y - y0) / (y1 - y0)), a = w * k;
      for (const [p0, p1] of [[[-a, -a], [a, -a]], [[a, -a], [a, a]], [[a, a], [-a, a]], [[-a, a], [-a, -a]]]) PC.add('dark', rod(V(p0[0], y, p0[1]), V(p1[0], y + 0.27, p1[1]), 0.016, 4));
    }
    PC.add('dark', yTube(y0 + 0.02, y0 + 0.24, 0.27, 0.27, 18));
    PC.add('camo', box(0.4, 0.3, 0.4, 0, y1 + 0.1, 0));
    PC.add('camo', box(R + 0.6, 0.22, 0.18, -R / 2 + 0.1, CTOP, 0)); // the jib
    PC.add('camo', rod(V(0, y1 + 0.2, 0), V(-R, CTOP + 0.1, 0), 0.03, 5)); // its tie
    PC.add('dark', zTube(-0.1, 0.1, 0.13, 0.13, 12, -R, CTOP - 0.18)); // the sheave
    // the hook block and the sling (hoist frame: y 0 the hook)
    PH2.add('dark', rbox(0.18, 0.26, 0.12, 0.03, 0, 0.13, 0));
    PH2.add('steel', new THREE.TorusGeometry(0.06, 0.015, 6, 10, Math.PI * 1.5).rotateZ(Math.PI).translate(0, -0.04, 0));
    for (const dz of [-0.28, 0.28]) PH2.add('rope', rod(V(0, -0.06, 0), V(0, -HANG + SHELL.rad, dz), 0.012, 4));
  }
  PC.build(crane, { dirt: 0.15, y0: 0 });
  PH2.build(hoist, { dirt: 0, y0: 0 });
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), mats.chain);
  rope.position.set(-R, CTOP - 0.3, 0);
  crane.add(rope);

  // ---------------------------------------------------------------- build, props, anchors
  // the bed (the concrete drum, the fixed ring, the racer wall and its rails) in a group of its own, so the render can
  // raise it as the Stellungsbau lays it (rig.bedGroup)
  const bedG = new THREE.Group();
  bedG.name = 'bed';
  root.add(bedG);
  rig.bedGroup = bedG;
  PB.build(bedG, { dirt: 0.5, y0: 0 });
  PF.build(trav, { dirt: 0.3, y0: 0 });
  PK.build(trav, { dirt: 0.5, y0: 0 });
  PE.build(elev, { dirt: 0.05, y0: TY });
  PR.build(rec, { dirt: 0.05, y0: TY });
  PBR.build(brc, { dirt: 0.05, y0: TY });
  PTR.build(tray, { dirt: 0.05, y0: TY });

  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.2, 0.85);
  addShellProp(rig, 'crane', hoist, SHELL.len, SHELL.rad, 0, -HANG, 0);
  rig.props.hoist = rig.props.crane;
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, trav, 'eye', 0, TY, 3.0);
  anchor(rig, trav, 'shellStack', CART.x, CART.top + SHELL.rad, CART.z);
  anchor(rig, rec, 'post', 0, PH, PZ); // the truss's head (for the integration's pictures: e.g. a pennant, a flash)

  rig.hoistRange = { up: 9.8, down: CART.top + SHELL.rad + HANG };
  rig.hoistHang = HANG;
  rig.pickY = CART.top + SHELL.rad;
  rig.craneRest = Math.PI;
  rig.pickYaw = Math.PI;
  crane.rotation.y = Math.PI;
  hoist.position.y = rig.hoistRange.up;

  rig.setTraverse = (az) => {
    trav.rotation.y = az;
    const c = Math.cos(az), s = Math.sin(az);
    crane.position.set(CX * c + CZ * s, 0, -CX * s + CZ * c);
    rig.craneRest = Math.PI + az;
    rig.pickYaw = Math.PI + az; // the shell lies along the frame on its cart, as it hangs under the hook at rest
  };
  // the sliding block runs out to the right
  rig.setBreech = (k) => {
    brc.position.x = BX + clamp01(k) * BSLIDE;
    rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25)));
  };
  // The recoil is held short where the breech ring would strike: the turntable plate (within its radius), the
  // ground, and the loading platform behind (at low elevation). Worked out once for a table of elevations; at the
  // firing elevations (50 to 55) it allows about the whole stroke.
  {
    const corners = [];
    for (let z = RING.z0; z <= BRE + 1e-6; z += 0.25) for (const y of [-RING.w / 2, RING.w / 2]) corners.push([z, y]);
    corners.push([AZ + 1.3, 1.26], [CR0 - 0.6, -0.62]);
    const ok = (el, r) => {
      const c = Math.cos(el), s = Math.sin(el);
      for (const [z, y] of corners) {
        const zz = z + r, wy = TY + y * c - zz * s, wz = TZ + y * s + zz * c;
        if (wy < 0.2) return false;
        if (Math.hypot(wz, RING.w / 2) < TR + 0.15 && wy < BH + 0.12) return false;
        if (wz > DZ0 - 0.08 && wy < DY + 0.08) return false; // the loading platform
      }
      return true;
    };
    const tab = [];
    for (let i = 0; i <= 60; i++) {
      const el = i * DEG;
      let r = 0; // the whole stroke must be clear, not only its end
      while (r < rig.recoilLength && ok(el, r + 0.02)) r += 0.02;
      tab.push(Math.min(1, r / rig.recoilLength));
    }
    rig.recoilFade = (el) => { const d = Math.min(60, Math.max(0, el / DEG)), i = Math.floor(d); return Math.min(tab[i], tab[Math.min(60, i + 1)]); };
  }
  rig.update = () => {
    rope.scale.y = Math.max(0.05, CTOP - 0.3 - (hoist.position.y + 0.26));
    rig.trayTilt();
  };
  rig.setTraverse(0);
  rig.setTray(1);
  rig.update();

  // hit boxes: the bed, the frame with its decks, the barrel at zero elevation, the truss
  hb(rig, -DR, 0, -DR, DR, BH, DR);
  hb(rig, -GAL, BH, FZ0, GAL, DY + 1.0, FZ1);
  hb(rig, -0.7, TY - 0.7, TZ + MUZ, 0.7, TY + 0.7, TZ + BRE);
  hb(rig, -0.3, TY, TZ + PZ - 0.4, 0.3, TY + PH + 0.4, TZ + PZ + 0.4);

  // crew (root space at zero traverse; y is where the feet stand). A naval detachment served the gun; the men on the
  // frame and at the cart ride the traverse (nobody here is a world-frame role).
  const E = -Math.PI / 2, W = Math.PI / 2, N = 0;
  crewSpot(rig, 'chief', -2.35, DY, -1.2, E, 'point'); // the gun's officer on the left gallery, abreast the cradle
  crewSpot(rig, 'layer', -2.35, DY, TZ + 1.6, E, 'lay');
  crewSpot(rig, 'elevator', 2.42, DY, TZ + 1.6, W, 'operate');
  crewSpot(rig, 'lanyard', 2.3, DY, 5.6, W, 'lanyard');
  crewSpot(rig, 'loader1', -1.35, DY, 8.4, E, 'carry');
  crewSpot(rig, 'loader2', 1.35, DY, 8.4, W, 'carry');
  crewSpot(rig, 'rammer1', -0.45, DY, 11.3, N, 'ram');
  crewSpot(rig, 'rammer2', 0.45, DY, 11.3, N, 'ram');
  crewSpot(rig, 'bagman', 1.4, DY, 13.75, N, 'stand');
  crewSpot(rig, 'crane1', 2.1, DY, CZ + 0.8, E, 'operate');
  crewSpot(rig, 'traverser', -2.1, DY, 13.75, N, 'operate');
  crewSpot(rig, 'meter', -1.4, DY, 11.4, W, 'stand'); // the chamber gauge (each round's charge is set from it)
  crewSpot(rig, 'crane2', CART.x - 1.1, 0, CZ - 1.4, W, 'signal');
  crewSpot(rig, 'ammo1', CART.x + 0.9, 0, CZ + 0.3, W, 'stand');
  crewSpot(rig, 'ammo2', CART.x + 1.0, 0, CZ - 1.6, W, 'stand');
  crewSpot(rig, 'phone', -5.0, 0, 2.5, E, 'phone');
  for (const c of rig.anchors.crew) c.world = false;
  return finishGun(rig);
}


// ---------------------------------------------------------------- the firing position (buildParisSite)
// The emplacement round the gun, in the frame of the gun's rig at zero traverse (ground y = 0; place it where the
// rig's root is): the concrete apron over the turntable and the racer's sector, the earth bank round the left and
// the rear, the standard-gauge spur on the right with the ammunition train (two vans for the charges, kept at
// 15 degrees, a flat wagon of shell boxes), the 60 cm field railway from the spur round the racer to the shell
// cart, the portal crane that changed the barrels (parked behind on its own rails), the camouflage net over the
// loading platform and the train, brushwood screens, the measuring hut, the charge bunker, a survey pillar, the
// weather mast and the pilot-balloon theodolite, two anti-aircraft machine-gun posts.
//   setPortal(k)  0 parked behind the gun, 1 over the barrel (a barrel change; the net is drawn back first)
//   setCamo(k)    0 the net struck, 1 spread (the default)
//   setStage({ bed, bank, ammo, met, camo })   the Stellungsbau (src/ww1/paris.js stage, 0..1 each; all 1 by default):
//                 the apron spreads from the turntable, the earth bank and its screens rise, the ammunition train
//                 runs in along the spur and the field railway and charge bunker go up, the measuring hut, the
//                 weather mast and the theodolite go up, the camouflage poles and the flak posts rise (the net is
//                 setCamo's). The spur, the portal crane and its rails and the stacked timbers stand from the start.
// Nothing allocates in the setters.
const NET = { x0: -8.5, x1: 9.0, z0: 6.0, z1: 25.0, y: 12.6 };
const SPUR_X = 13.5, PORTAL_X = 9.6, PORTAL_PARK = 31, PORTAL_WORK = -6;

function scrimTexture(seed) {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rnd = mulberry32(seed);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#4e4630'; g.lineWidth = 1.5;
  for (let i = -S; i <= 2 * S; i += 20) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i - S, S); g.stroke();
  }
  // garnish: strips of painted canvas and raffia in the 1918 earth colours, wrapped at the edges so it tiles
  const cols = ['#5e6440', '#6f6a48', '#5a4a33', '#3f4a2e', '#8a7a52', '#4d5838'];
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, w = 10 + rnd() * 34, h = 4 + rnd() * 9, a = rnd() * Math.PI;
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      g.save(); g.translate(x + dx, y + dy); g.rotate(a); g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildParisSite(seed = 1) {
  const root = new THREE.Group();
  root.name = 'paris-site';
  const mats = vehicleMats('bunt'), rnd = mulberry32(seed * 7919 + 13);
  const mk = () => new Parts(mats);
  // P: what stands from the start; the rest by the Stellungsbau's tasks, each in its group (setStage)
  const P = mk(), PA = mk(), PK = mk(), PR = mk(), PT = mk(), PM = mk(), PC = mk(), PF = mk();
  const grp = (name) => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };
  const G = { apron: grp('apron'), bank: grp('bank'), rail: grp('fieldrail'), train: grp('train'), met: grp('met'), poles: grp('poles'), flak: grp('flak') };
  const arc = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [r * Math.sin(a), r * Math.cos(a)]; });

  // the concrete apron: round the turntable, and the racer's sector out past the wall (the rollers' ground)
  PA.add('white', topProfile([...arc(16.5, -44 * DEG, 44 * DEG, 30), ...arc(5.6, 44 * DEG, 316 * DEG, 40)], -0.15, 0.02), { tint: 0x8d897e });
  for (let k = 0; k < 9; k++) { const a = (-40 + k * 10) * DEG; PA.add('dark', box(0.02, 0.005, 10.5, Math.sin(a) * 10.9, 0.024, Math.cos(a) * 10.9, 0, a, 0)); } // expansion joints

  // the earth bank: left and rear, open to the front, to the spur, and where the portal crane's rails pass
  const BR = 25, NB = 30, span = [[-128, -27], [-18, 18]].map(([a, b]) => [a * DEG, b * DEG]), tot = span.reduce((t, [a, b]) => t + b - a, 0), seg = (BR * tot) / NB;
  for (let i = 0; i < NB; i++) {
    let u = ((i + 0.5) / NB) * tot, a = 0;
    for (const [a0, a1] of span) { if (u <= a1 - a0) { a = a0 + u; break; } u -= a1 - a0; }
    const h = 2.2 + rnd() * 0.5;
    PK.add('soil', sideProfile([[-2.8, 0], [2.8, 0], [0.7, h], [-0.9, h]], seg * 1.04).rotateY(a).translate(BR * Math.sin(a), -0.05, BR * Math.cos(a)));
    if (rnd() < 0.7) for (let k = 0; k < 4; k++) { // brushwood stuck in the crest
      const r = BR + (rnd() - 0.5) * 1.4, aa = a + (rnd() - 0.5) * (seg / BR), x = r * Math.sin(aa), z = r * Math.cos(aa), y = h - 0.1;
      PK.add('timber', rod(V(x, y, z), V(x + (rnd() - 0.5) * 0.8, y + 1.2 + rnd() * 1.2, z + (rnd() - 0.5) * 0.8), 0.035, 4), { tint: 0x8a7a60 });
    }
  }

  // the standard-gauge spur on the right: ballast, sleepers, rails
  const SZ0 = -34, SZ1 = 48;
  P.add('soil', box(3.4, 0.3, SZ1 - SZ0, SPUR_X, 0.1, (SZ0 + SZ1) / 2), { tint: 0xa09a8c });
  for (let z = SZ0 + 0.4; z < SZ1; z += 0.75) P.add('timber', box(2.6, 0.14, 0.24, SPUR_X, 0.3, z));
  for (const s of [-1, 1]) P.add('steel', box(0.07, 0.15, SZ1 - SZ0, SPUR_X + s * 0.7175, 0.44, (SZ0 + SZ1) / 2));
  // the 60 cm field railway: an arc round the frame at the shell cart's radius, a leg out to the spur
  const RC = Math.hypot(CX + Math.hypot(CX, TZ + BRE + 0.97 - CZ), CZ), FA = Math.atan2(CX + Math.hypot(CX, TZ + BRE + 0.97 - CZ), CZ);
  const fpts = arc(RC, FA - 32 * DEG, FA + 32 * DEG, 24);
  const end = fpts[fpts.length - 1], ea = FA + 32 * DEG, dir = [Math.cos(ea), -Math.sin(ea)];
  const lead = (SPUR_X - 2.4 - end[0]) / dir[0];
  for (let i = 0; i <= 14; i++) fpts.push([end[0] + dir[0] * lead * (i / 14), end[1] + dir[1] * lead * (i / 14)]);
  for (let i = 0; i < fpts.length - 1; i++) {
    if (i === 24) continue; // (the arc's end and the leg's start are one point)
    const [x0, z0] = fpts[i], [x1, z1] = fpts[i + 1], l = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    for (const s of [-1, 1]) PR.add('steel', box(0.05, 0.08, l + 0.02, (x0 + x1) / 2 + Math.cos(yaw) * s * 0.3, 0.07, (z0 + z1) / 2 - Math.sin(yaw) * s * 0.3, 0, yaw, 0));
    PR.add('timber', box(1.0, 0.07, 0.16, (x0 + x1) / 2, 0.03, (z0 + z1) / 2, 0, yaw, 0));
  }

  // the ammunition train on the spur: two covered vans (the charges) and a flat wagon with shell boxes
  const wagon = (cz, covered) => {
    const L = 8.6;
    PT.add('dark', box(2.6, 0.32, L, SPUR_X, 1.05, cz));
    for (const e of [-1, 1]) {
      PT.add('dark', box(2.7, 0.3, 0.2, SPUR_X, 1.0, cz + e * (L / 2 + 0.05)));
      for (const s of [-1, 1]) { PT.add('steel', zTube(cz + e * (L / 2 + 0.1), cz + e * (L / 2 + 0.45), 0.07, 0.07, 8, SPUR_X + s * 0.88, 1.0)); PT.add('steel', zTube(cz + e * (L / 2 + 0.4), cz + e * (L / 2 + 0.47), 0.2, 0.2, 14, SPUR_X + s * 0.88, 1.0)); }
      const az = cz + e * 2.4;
      PT.add('steel', xTube(SPUR_X - 0.95, SPUR_X + 0.95, 0.06, 0.06, 8, 0.95 - 0.47, az));
      for (const s of [-1, 1]) {
        PT.add('steel', xTube(SPUR_X + s * 0.65, SPUR_X + s * 0.79, 0.47, 0.47, 18, 0.95 - 0.47 + 0.47, az));
        PT.add('dark', box(0.1, 0.55, 1.6, SPUR_X + s * 0.95, 0.8, az)); // axle guard and spring
      }
    }
    if (covered) {
      PT.add('rust', box(2.55, 2.3, L - 0.3, SPUR_X, 2.36, cz), { tint: 0xb06048 }); // the brown-red of the Prussian state railways
      PT.add('dark', box(2.7, 0.1, L, SPUR_X, 3.55, cz));
      PT.add('dark', xTube(SPUR_X - 1.3, SPUR_X + 1.3, 0.15, 0.15, 10, 3.58, cz));
      for (const s of [-1, 1]) PT.add('timber', box(0.04, 1.9, 1.6, SPUR_X + s * 1.29, 2.2, cz));
      PT.add('white', box(0.02, 0.3, 1.2, SPUR_X - 1.29, 3.0, cz - 2.5), { tint: 0xd6d0c0 });
    } else {
      PT.add('timber', box(2.6, 0.06, L, SPUR_X, 1.24, cz));
      for (let k = 0; k < 10; k++) PT.add('timber', box(0.42, 0.32, 1.2, SPUR_X - 0.9 + (k % 5) * 0.45, 1.43, cz - 2.6 + Math.floor(k / 5) * 5.2), { tint: k % 2 ? 0xd8cdb6 : 0xffffff }); // shell boxes
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) PT.add('dark', box(0.06, 0.6, 0.06, SPUR_X + s * 1.27, 1.55, cz - L / 2 + 0.5 + k * 1.9));
    }
  };
  wagon(10.0, true); wagon(19.6, true); wagon(29.2, false);

  // the measuring hut (the chamber gauge's readings, the firing data, the clock), the charge bunker, a survey pillar,
  // the weather mast (wind vane and cup anemometer) and the theodolite that follows the pilot balloons
  {
    const hx = -15.5, hz = 4.0;
    PM.add('timber', box(4.2, 2.6, 3.2, hx, 1.3, hz));
    PM.add('dark', box(4.6, 0.12, 3.7, hx, 2.75, hz, 0, 0, 0.12));
    PM.add('dark', box(0.9, 1.9, 0.05, hx + 1.0, 0.95, hz - 1.62));
    PM.add('glass', box(0.8, 0.6, 0.04, hx - 1.0, 1.7, hz - 1.62));
    PM.add('timber', box(0.12, 6.5, 0.12, hx - 2.4, 3.25, hz - 2.0)); // the telephone pole and its wires to the gun
    PM.add('dark', box(0.8, 0.06, 0.06, hx - 2.4, 6.2, hz - 2.0));
    const mx = hx - 3.2, mz = hz + 3.4, MH = 9.0;
    PM.add('timber', yTube(0, MH, 0.1, 0.07, 7, mx, mz));
    for (const a of [0, 2.1, 4.2]) PM.add('rope', rod(V(mx, MH * 0.8, mz), V(mx + Math.sin(a) * 3.2, 0, mz + Math.cos(a) * 3.2), 0.01, 4));
    PM.add('dark', box(1.3, 0.04, 0.04, mx, MH + 0.1, mz)); // the anemometer's cross arms and cups
    PM.add('dark', box(0.04, 0.04, 1.3, mx, MH + 0.1, mz));
    for (const [dx, dz] of [[0.65, 0], [-0.65, 0], [0, 0.65], [0, -0.65]]) PM.add('dark', sphere(0.08, mx + dx, MH + 0.1, mz + dz, 1, 0.7, 1, 6));
    PM.add('dark', box(0.03, 0.03, 1.1, mx, MH + 0.45, mz + 0.2)); // the vane
    PM.add('dark', box(0.02, 0.28, 0.32, mx, MH + 0.45, mz + 0.7));
    const tx = hx + 3.6, tz = hz + 3.0; // the theodolite on its tripod
    for (const a of [0, 2.1, 4.2]) PM.add('timber', rod(V(tx + Math.sin(a) * 0.55, 0, tz + Math.cos(a) * 0.55), V(tx, 1.25, tz), 0.025, 5));
    PM.add('steel', box(0.18, 0.16, 0.18, tx, 1.33, tz));
    PM.add('steel', zTube(tz - 0.25, tz + 0.2, 0.045, 0.04, 8, tx, 1.47).rotateX(0)); // its telescope
    PM.add('white', box(0.6, 0.6, 0.6, -5.5, 0.3, -9.0), { tint: 0x9a968a }); // the survey pillar
    PM.add('white', yTube(0.6, 1.3, 0.22, 0.18, 10, -5.5, -9.0), { tint: 0x9a968a });
    const bx = -11.0, bz = 30.5;
    PR.add('white', box(6.5, 2.5, 4.5, bx, 1.25, bz), { tint: 0x8a867c });
    PR.add('soil', sideProfile([[-3.6, 0], [3.6, 0], [2.6, 3.4], [-2.6, 3.4]], 7.5).rotateY(Math.PI / 2).translate(bx, 0, bz + 0.6));
    PR.add('dark', box(1.4, 2.0, 0.08, bx + 1.2, 1.0, bz - 2.27));
    for (let k = 0; k < 3; k++) P.add('timber', box(3.2, 0.25, 0.25, -14.5, 0.13 + k * 0.25, 16.0 + (k % 2) * 0.1)); // stacked timbers
    for (let k = 0; k < 6; k++) P.add('timber', xTube(-16.2, -12.8, 0.12, 0.12, 8, 0.12 + Math.floor(k / 3) * 0.22, 17.2 + (k % 3) * 0.26));
  }

  // two anti-aircraft machine-gun posts: a ring of sandbags, a pivot post with an MG 08 on a high mount
  for (const [fx, fz] of [[-24, -24], [-23, 41]]) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      for (let l = 0; l < 2; l++) PF.add('soil', rbox(0.75, 0.3, 0.4, 0.08, fx + Math.sin(a + l * 0.22) * 1.9, 0.16 + l * 0.29, fz + Math.cos(a + l * 0.22) * 1.9, 0, a + l * 0.22, 0), { tint: 0xb4a682 });
    }
    PF.add('steel', yTube(0, 1.5, 0.07, 0.06, 8, fx, fz));
    PF.add('dark', box(0.2, 0.22, 1.0, fx, 1.6, fz - 0.1, -0.6, 0, 0)); // the gun, pointed up
    PF.add('dark', zTube(-0.6, 0.0, 0.05, 0.05, 8, fx, 0).rotateX(-0.6).translate(0, 1.6 + 0.35, fz - 0.65));
  }

  // the camouflage poles; the net itself is its own mesh (setCamo)
  const poles = [];
  for (const x of [NET.x0, (NET.x0 + NET.x1) / 2, NET.x1]) for (const z of [NET.z0, (NET.z0 + NET.z1) / 2, NET.z1]) poles.push([x, z]);
  for (const [x, z] of poles) PC.add('timber', yTube(0, NET.y + 0.2, 0.11, 0.08, 7, x, z), { tint: 0x9a8a6a });
  for (const [x, z] of poles) if (x !== (NET.x0 + NET.x1) / 2) PC.add('rope', rod(V(x, NET.y, z), V(x + Math.sign(x) * 3.5, 0, z), 0.012, 4));
  P.build(root, { dirt: 0.3, y0: 0 });
  PA.build(G.apron, { dirt: 0.3, y0: 0 });
  PK.build(G.bank, { dirt: 0.3, y0: 0 });
  PR.build(G.rail, { dirt: 0.3, y0: 0 });
  PT.build(G.train, { dirt: 0.3, y0: 0 });
  PM.build(G.met, { dirt: 0.3, y0: 0 });
  PC.build(G.poles, { dirt: 0.3, y0: 0 });
  PF.build(G.flak, { dirt: 0.3, y0: 0 });

  // brushwood screens (hurdles of cut branches) along the open right front, and the net
  const tex = scrimTexture(seed);
  const scrimMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  const camo = new THREE.Group();
  camo.name = 'camo';
  root.add(camo);
  {
    const NX = 12, NZ = 14, W = NET.x1 - NET.x0, L = NET.z1 - NET.z0;
    const g = new THREE.PlaneGeometry(W, L, NX, NZ).rotateX(-Math.PI / 2).translate((NET.x0 + NET.x1) / 2, 0, (NET.z0 + NET.z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) - NET.x0) / W, v = (p.getZ(i) - NET.z0) / L;
      const sag = Math.sin(u * Math.PI * 2) ** 2 * 0.5 + Math.sin(v * Math.PI * 2) ** 2 * 0.5;
      p.setY(i, NET.y - sag * 0.9 + (rnd() - 0.5) * 0.12);
      uv.setXY(i, u * W / 4, v * L / 4);
    }
    g.computeVertexNormals();
    const net = new THREE.Mesh(g, scrimMat);
    net.name = 'net';
    net.castShadow = net.receiveShadow = true;
    camo.add(net);
  }
  for (let i = 0; i < 5; i++) {
    const g = new THREE.PlaneGeometry(4.0, 2.4).translate(0, 1.2, 0);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 1.0, uv.getY(k) * 0.6);
    const m = new THREE.Mesh(g, scrimMat);
    m.position.set(17.5 + (i % 2) * 0.4, 0, -14 + i * 4.2);
    m.rotation.y = Math.PI / 2 + (rnd() - 0.5) * 0.2;
    m.castShadow = true;
    G.bank.add(m);
  }

  // the portal crane: a lattice leg on two two-wheel trucks each side, on rails outside the racer, the arched
  // girder across with a crab and its hook; it runs along z on setPortal
  const portal = new THREE.Group();
  portal.name = 'portal';
  root.add(portal);
  {
    const R0 = -16, R1 = 38;
    for (const s of [-1, 1]) {
      P.add('timber', box(1.4, 0.12, R1 - R0, s * PORTAL_X, 0.06, (R0 + R1) / 2));
      P.add('steel', box(0.08, 0.14, R1 - R0, s * PORTAL_X, 0.19, (R0 + R1) / 2));
    }
    P.build(root, { dirt: 0.3, y0: 0 });
    const Q = mk(), H = 15.2, X = PORTAL_X;
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) {
        Q.add('camo', rod(V(s * X, 1.0, e * 2.6), V(s * (X - 0.4), H, e * 0.6), 0.16, 6)); // the leg's posts
        Q.add('dark', box(0.6, 0.6, 1.6, s * X, 0.7, e * 2.6)); // the trucks
        for (const d of [-0.5, 0.5]) Q.add('steel', xTube(s * X - 0.2, s * X + 0.2, 0.32, 0.32, 14, 0.36, e * 2.6 + d));
      }
      for (let y = 2.0; y < H - 0.6; y += 1.6) { // lacing between the posts
        const t0 = (y - 1.0) / (H - 1.0), t1 = (y + 0.8 - 1.0) / (H - 1.0);
        const za = 2.6 - 2.0 * t0, zb = 2.6 - 2.0 * t1, xa = s * (X - 0.4 * t0), xb = s * (X - 0.4 * t1);
        Q.add('dark', rod(V(xa, y, -za), V(xb, y + 0.8, zb), 0.05, 4));
        Q.add('dark', rod(V(xa, y, za), V(xb, y + 0.8, -zb), 0.05, 4));
        Q.add('dark', rod(V(xa, y, -za), V(xa, y, za), 0.04, 4));
      }
      Q.add('camo', box(1.2, 1.0, 1.8, s * (X - 0.4), H + 0.2, 0)); // the head on the leg
    }
    // the arched girder: a top chord, an arched bottom chord, posts and diagonals between (the photograph's beam)
    const N = 16, chord = (t) => H + 0.4 + 1.6 * Math.sin(Math.PI * t);
    for (const z of [-0.45, 0.45]) {
      Q.add('camo', box(2 * X + 0.4, 0.4, 0.3, 0, H + 2.5, z));
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, xa = -X + 2 * X * t0, xb = -X + 2 * X * t1;
        Q.add('camo', rod(V(xa, chord(t0), z), V(xb, chord(t1), z), 0.14, 5));
        Q.add('dark', rod(V(xa, chord(t0), z), V(xa, H + 2.4, z), 0.05, 4));
        Q.add('dark', rod(V(xa, chord(t0), z), V(xb, H + 2.4, z), 0.04, 4));
      }
    }
    Q.add('camo', box(2 * X, 0.08, 1.2, 0, H + 2.74, 0)); // the walkway on top
    Q.add('camo', rbox(2.0, 1.2, 1.6, 0.06, -1.0, H + 3.3, 0)); // the crab with its winding gear
    Q.add('dark', rod(V(-1.0, H + 2.7, 0), V(-1.0, 9.4, 0), 0.03, 5)); // the falls
    Q.add('dark', rbox(0.5, 0.6, 0.4, 0.05, -1.0, 9.1, 0)); // the hook block, with the barrel's sling beam
    Q.add('camo', box(0.3, 0.3, 6.0, -1.0, 8.4, 0));
    Q.build(portal, { dirt: 0.25, y0: 0 });
  }
  const setPortal = (k) => {
    k = clamp01(k);
    portal.position.z = PORTAL_PARK + (PORTAL_WORK - PORTAL_PARK) * k;
    camo.visible = camoK > 0.5 && k < 0.02;
  };
  let camoK = 1;
  const setCamo = (k) => { camoK = k; camo.visible = k > 0.5 && portal.position.z > PORTAL_PARK - 0.5; };
  setPortal(0);
  // the Stellungsbau: each group shown once its task has begun, rising (or spreading, or running in) with the work
  const ease = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
  const rise = (g, k) => { g.visible = k > 0.01; g.scale.y = 0.02 + 0.98 * ease(k); };
  const setStage = (st = {}) => {
    const k = (n) => st[n] ?? 1;
    G.apron.visible = k('bed') > 0.01;
    const sp = 0.2 + 0.8 * ease(k('bed'));
    G.apron.scale.set(sp, 1, sp);
    rise(G.bank, k('bank'));
    rise(G.rail, Math.min(1, k('ammo') * 1.6));
    G.train.visible = k('ammo') > 0.4;
    G.train.position.z = -(1 - ease((k('ammo') - 0.4) / 0.6)) * 38; // runs in along the spur from its front end
    rise(G.met, k('met'));
    rise(G.poles, Math.min(1, k('camo') * 1.4));
    rise(G.flak, Math.min(1, k('camo') * 1.2));
  };
  root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return { root, setPortal, setCamo, setStage, portal, net: camo };
}

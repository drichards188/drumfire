// Dormant since 2026-11-26: the 15 cm sFH 93 was cut from the game at the user's word (DESIGN.md changelog); kept
// here unreachable (no tree, battle or menu fields it). Commit 1dd259b has it whole and in play: restore from it.
import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile, gearArc, zLathe, loft, rivets, rivetRow, rivetPoly, chain, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, ring, trayShells, crew, L90, R90, TAU } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock, grip } from './common.js';

/**
 * 15 cm schwere Feldhaubitze 1893 (sFH 93: the Krupp barrel on the Spandau carriage), the heavy field howitzer the
 * sFH 02 and the sFH 13 replaced; in 1914 the reserve Fußartillerie took the 870 left in store to the front. As the
 * surviving guns show it (lovettartillery.com "15cm s.F.H. 1893": the gun at the side with its sight mount and
 * Gr. 12 shells; the Bavarian gun in the National WWI Museum, Kansas City; Jemappes; US Signal Corps 39749, from the
 * front) and en.wikipedia "15 cm sFH 93": a short plain barrel of 1.6 m (L/11) ending in a round breech piece with no
 * separate ring and an early horizontal sliding block (opening to the right), a rigid two-wheeled box trail of riveted plate
 * flasks rising to the trunnions over the axle, a toothed elevating arc under the barrel worked by a long ribbed
 * pinion across the front of the cheeks and a handwheel on the right, big wooden twelve-spoke wheels with a bolted
 * hub flange; no shield and NO recoil system. "In the field, only ramps were used": two wooden ramps
 * (Rücklaufkeile) behind the wheels on a plank bed; at the shot the wheels ran up them and gravity rolled the gun
 * back down, never quite on its line, and with no traversing gear the crew levered it round with handspikes and
 * laid it afresh (Lovett: "it had to be relaid after each shot"). 2,188 kg in action, 0 to +65 degrees (the game: 2
 * to 55). Departures: the dial sight stands on the left cheek (the real mount is on the breech ring's right) so the
 * shared drill's layer (left) and second layer at the elevating handwheel (right) have their own sides.
 * Measured: barrel 1.6 to 1.66 m, bore 149.1 mm. Estimates [E], from the photographs against the 0.56 m shell
 * stood beside the Lovett gun: the wheels 1.4 m [E], track 1.6 m [E] (as the sFH 13), trunnions 1.25 m over the ground [E] (the
 * barrel's top level with the wheels' tops), trail 3.0 m from the axle [E], cheeks 0.47 m apart [E], the run back
 * up the ramps 1.2 m and 0.26 m up [E]. Paint: 'bunt' (the 1917 Buntfarbenanstrich) or 'feldgrau'.
 *
 * Rig (DESIGN.md "Models"), the Mörser 99's (m99.js): origin on the ground under the axle, front -Z. The plank bed
 * (PLAT high) is fixed in the root and does not turn. `traverse` turns the carriage and its ramps about the axle.
 * `recoil` is the WHOLE carriage: setRecoil(k) runs it back RL m along +Z and up the ramps, the wheels rolling and
 * the carriage pivoting about its tail on the planks; `elevation` at the trunnions inside it; `breech` the wedge
 * (setBreech slides it +X). No loading tray: the round goes into the chamber mouth (the sFH 13's way).
 * The ramp drill (render/ww1/sfh93.js, render/ramp_drill.js) holds the run back (rig.holdRecoil) and the gun's
 * offset off its line (rig.holdLay) for a few frames; setRecoil and setTraverse from the render layer give way to
 * them while they are fresh and are obeyed as usual otherwise. Props: the two handspikes in the wheels
 * (rig.setSpikes), their grips anchors and gripAt in rig.ramp. buildSFH93({ scheme: 'bunt' | 'feldgrau' })
 */
const PLAT = 0.07; // the plank bed's top
const WR = 0.7, WX = 0.8; // the wheels: radius over the tyre, centre plane
const AXY = PLAT + WR; // the axle at rest (z = 0)
const TR = { y: 1.32, z: 0.08 }; // trunnion axis in root space
const MZ = -1.0, BR = 0.66, RING0 = 0.3; // muzzle, breech face, front of the ring (along the bore from the trunnions)
const RG = { R: 0.19, xf: 0.12, f0: 0.34, f1: 0.61, s0: 0.4, s1: 0.56, h: 0.105, xs: -0.13, lo: 0.08 }; // the breech piece: its round, the flat on its right (x, from, to), the wedge's slot (z, half height, its blind left end), the loading opening
const CX = 0.235, CT = 0.03; // the flasks' inner face, their thickness
const TAILZ = 3.0; // where the trail's end stands on the planks
const RL = 1.2, RISE = 0.26; // the run back and the rise up the ramps at full run back
const SLOPE = RISE / RL; // the ramps' slope (tan); the toe sits so the slope is tangent to the tyre at rest
const RAMP = { z0: WR * Math.tan(Math.atan(SLOPE) / 2), z1: 1.42, top: 0.32, w: 0.13 };
const PF = { x: 2.4, z0: -1.1, z1: 4.75 }; // the plank bed: half width, front and rear
const ARC = { r0: 0.35, r1: 0.42, a0: 68 * DEG, a1: 130 * DEG }; // the toothed elevating arc under the barrel
const PA = 128 * DEG, PR = ARC.r1 + 0.045; // the pinion's place about the trunnions (carriage)
const RIV = 0xd0c8b4;

// the flasks: a cheek plate each side (z up to NECK[0]) standing round the trunnion bearing, with a neck behind it
// (the wedge slides out over it), then the trail narrowing behind the breech's dip at full elevation to a
// straight box to the end on the planks (room for a man between it and the ramp)
const NECK = [0.72, 1.12], RW = 0.1; // the narrowing, the trail's inner half width behind it
const lin = (pts) => (z) => { let i = 0; while (i < pts.length - 2 && z > pts[i + 1][0]) i++; const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]; return y0 + (y1 - y0) * (z - z0) / (z1 - z0); };
const topY = lin([[0.33, 1.02], [0.9, 0.9], [TAILZ - 0.3, 0.47], [TAILZ, 0.42]]);
const botY = lin([[-0.2, 0.58], [0.5, 0.56], [1.4, 0.44], [TAILZ - 0.5, PLAT + 0.04], [TAILZ, PLAT + 0.02]]);
const inX = (z) => z <= NECK[0] ? CX : z >= NECK[1] ? RW : CX + (RW - CX) * (z - NECK[0]) / (NECK[1] - NECK[0]);
const CHEEK = [[-0.45, 0.6], [-0.45, 0.96], [-0.26, 1.28], [-0.1, TR.y + 0.13], [0.22, TR.y + 0.13], [0.3, 1.3], [0.33, 1.02],
  [NECK[0], topY(NECK[0])], [NECK[0], botY(NECK[0])], [0.5, 0.56], [-0.2, 0.58]];
const STATIONS = [NECK[0], NECK[1], 1.4, 1.9, TAILZ - 0.5, TAILZ - 0.3, TAILZ];

// the carriage's tilt about its tail at k of the run back: the wheels' centres ride a line parallel to the ramps, so
// the axle's rise is SLOPE times its own way back (solved for the small swing forward the tilt gives the axle)
const tiltAt = (k) => {
  const d = Math.min(1, Math.max(0, k)) * RL, H = Math.hypot(TAILZ, WR), b = Math.atan2(WR, TAILZ);
  let t = Math.asin((d * SLOPE) / TAILZ), dz = d;
  for (let i = 0; i < 3; i++) {
    dz = d + WR * Math.sin(t) - TAILZ * (1 - Math.cos(t));
    t = Math.asin(Math.min(1, (WR + dz * SLOPE) / H)) - b;
  }
  return { t, dz };
};

export const SFH93 = { PLAT, WR, WX, AXY, TR, TAILZ, RL, RISE, RAMP };

export function buildSFH93({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  rig.scheme = scheme;
  const { root } = rig;
  const sh = buildShell('sfh93');

  // ---------------------------------------------------------------- the plank bed (fixed)
  const F = rig.part();
  platform(F);
  F.build(root, { dirt: 0.3 });

  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  // ---------------------------------------------------------------- the ramps (turn with the carriage)
  const RP = rig.part();
  for (const s of [-1, 1]) ramp(RP, s * WX);
  RP.build(trav, { dirt: 0.4 });

  // ---------------------------------------------------------------- the carriage (recoil: the whole of it)
  const rc = pivotAt(rig, trav, 'recoil', 0, PLAT, TAILZ);
  const cf = node(rc, 'carriage', 0, -PLAT, -TAILZ); // root coordinates inside the moving carriage
  const C = rig.part();
  carriage(C);
  C.build(cf, { dirt: 0.5 });
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = node(cf, s < 0 ? 'wheelL' : 'wheelR', s * WX, AXY, 0);
    const W = rig.part();
    woodWheel(W, s);
    W.build(w, { dirt: 0.6, y0: AXY });
    wheels.push(w);
  }

  // ---------------------------------------------------------------- the barrel (elevation)
  const el = pivotAt(rig, cf, 'elevation', 0, TR.y, TR.z);
  const B = rig.part();
  barrelParts(B);
  B.build(el, { dirt: 0.15, y0: TR.y });

  // ---- the wedge: a plain block in the slot ahead of the rear wall, its right end flush with the flat it opens in;
  // its machined face (the firing lock on the bore) shows through the loading opening while it is shut
  const fz = RING0 + 0.1, bx = 0.03, bz = (BR + fz) / 2; // (the block's pivot where the old squared ring had it)
  const br = pivotAt(rig, el, 'breech', bx, 0, bz);
  const K = rig.part();
  const kx0 = RG.xs + 0.005 - bx, kx1 = RG.xf - bx, kz0 = RG.s0 + 0.003 - bz, kz1 = RG.s1 - 0.003 - bz, kh = RG.h - 0.003;
  K.add('camo', cast(box(kx1 - kx0, kh * 2, kz1 - kz0, (kx0 + kx1) / 2, 0, (kz0 + kz1) / 2)), { uv: true });
  K.add('steel', box(0.2, kh * 2 - 0.02, 0.004, -bx, 0, kz1 + 0.001), { tint: 0x9a9c94 });
  K.add('dark', zTube(kz1 - 0.004, kz1 + 0.016, 0.026, 0.026, 10, -bx, 0)); // the firing lock
  K.add('char', new THREE.CircleGeometry(0.008, 8).translate(-bx, 0, kz1 + 0.0165));
  // the block's handle on its right end
  const km = (kz0 + kz1) / 2;
  K.add('dark', box(0.03, 0.06, 0.06, kx1 + 0.012, 0.0, km));
  K.add('steel', rod(V(kx1 + 0.02, 0.02, km), V(kx1 + 0.04, 0.16, km + 0.05), 0.014, 6));
  K.add('dark', sphere(0.022, kx1 + 0.04, 0.17, km + 0.053, 1, 1.3, 1, 8));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.29); // (the old wedge's travel)

  // ---------------------------------------------------------------- the run back up the ramps
  rig.recoilLength = RL;
  let frame = 0, holdV = null, holdAt = -99;
  const pose = (k) => {
    k = Math.min(1, Math.max(0, k));
    const { t, dz } = tiltAt(k);
    rc.position.z = TAILZ + k * RL;
    rc.rotation.x = t;
    // the tyres roll along the planks and the ramps' slope (its length a shade over the way back)
    for (const w of wheels) w.rotation.x = dz * Math.hypot(1, SLOPE) / WR - t;
    rig.recoilK = k;
  };
  rig.setRecoil = (k) => pose(holdV != null && frame - holdAt <= 4 ? holdV : k);
  // the drill's hold (render/ramp_drill.js): null lets the render layer's value through again
  rig.holdRecoil = (k) => { holdV = k; holdAt = frame; if (k != null) pose(k); };
  // the line: the render layer's traverse plus the crew's offset (the gun come back off its line, levered round)
  let az = 0, layV = 0, layAt = -99;
  const turnTo = () => { trav.rotation.y = az + (frame - layAt <= 4 ? layV : 0); };
  rig.setTraverse = (r) => { az = r; turnTo(); };
  rig.holdLay = (r) => { layV = r; layAt = frame; turnTo(); };
  rig.update = () => { frame++; };
  rig.recoilK = 0;

  // ---------------------------------------------------------------- the handspikes
  const spikes = node(cf, 'handspikes', 0, 0, 0);
  const H = rig.part();
  const SPK = [];
  for (const s of [-1, 1]) {
    // a 1.6 m ash handspike: its iron-shod point between two spokes behind the nave, the butt back and out at a
    // man's hands (he bears on it to roll the wheel, and swing the gun with it, onto the line)
    const a = V(s * (WX - 0.03), AXY + 0.13, 0.2), b = V(s * (WX + 0.44), AXY + 0.29, 1.68);
    H.add('wood', rod(a, b, 0.03, 7));
    H.add('iron', rod(a, a.clone().lerp(b, 0.08), 0.034, 7));
    SPK.push({ s, a, b });
  }
  H.build(spikes, { dirt: 0.2 });
  spikes.visible = false;
  rig.setSpikes = (on) => { spikes.visible = !!on; };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 2.0, 1.1);
  // the crew's grips (common.js grip; the places carriage() recorded): the layer at the dial sight (no handwheel on
  // the left: a hand on its head, the other on its column), the second layer's elevating handwheel
  grip(rig, cf, 'layer', HW.sight[0] - 0.038, HW.sight[1] + 0.27, HW.sight[2], { post: [HW.sight[0] - 0.5, HW.sight[2] + 0.35], clear: 0 });
  grip(rig, cf, 'layer2', HW.sight[0] - 0.02, HW.sight[1] - 0.12, HW.sight[2]);
  grip(rig, cf, 'elevator', ...HW.elevator, { axis: [1, 0, 0], r: 0.13 });
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // no loading tray: the round is handed to the breech and pushed into the chamber's mouth, then rammed
  const mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  // the ready rounds on the planks on the right, behind the wheel and outside its run back
  rig.anchors.shellStack = node(root, 'shellStack', 2.15, PLAT + sh.radius + 0.02, 2.2);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), 'sfh93');
  rig.loadEl = 5 * DEG;
  rig.slideMats = ['camo', 'steel', 'char', 'dark'];
  const A = {
    spikeL: node(cf, 'spike-grip-l', SPK[0].b.x + 0.02, SPK[0].b.y - 0.04, SPK[0].b.z - 0.12),
    spikeR: node(cf, 'spike-grip-r', SPK[1].b.x - 0.02, SPK[1].b.y - 0.04, SPK[1].b.z - 0.12),
    spikeL2: node(cf, 'spike-grip-l2', ...SPK[0].a.clone().lerp(SPK[0].b, 0.84).toArray()),
    spikeR2: node(cf, 'spike-grip-r2', ...SPK[1].a.clone().lerp(SPK[1].b, 0.84).toArray()),
  };
  // a handspike's butt grip (side -1 left, +1 right) in the traverse frame with the carriage at k of its run back,
  // worked out as setRecoil poses it (the crew's walks to and from it are planned before the carriage gets there)
  const g0 = A.spikeR.position;
  const gripAt = (side, k, out) => {
    k = Math.min(1, Math.max(0, k));
    const a = tiltAt(k).t, c = Math.cos(a), s = Math.sin(a), y = g0.y - PLAT, z = g0.z - TAILZ;
    out.x = side * g0.x; out.y = PLAT + y * c - z * s; out.z = TAILZ + k * RL + y * s + z * c;
    return out;
  };
  rig.ramp = { ...SFH93, anchors: A, gripAt }; // (the shared ramp drill, render/ramp_drill.js)

  // The detachment of eight [E] (research.js DETACHMENT), the sFH 13's light-gun drill: the layer at the sight on
  // the left and the second layer at the elevating handwheel on the right stand outside the wheels; the loader and
  // the rammer on the left of the trail and the shell and cartridge numbers on its right wait behind the wheels'
  // run back; the lanyard man off the right. Nobody stands where the carriage runs 1.2 m back up the ramps.
  const y = PLAT;
  crew(rig, 'officer', -2.7, 0.2, L90, 'point', 0);
  crew(rig, 'layer', -1.35, 0.75, L90, 'lay', y);
  crew(rig, 'elevator', 1.35, 0.75, R90, 'lay', y);
  crew(rig, 'loader', -0.8, 2.35, 0, 'ram', y);
  crew(rig, 'rammer', -0.75, 3.15, 0, 'ram', y);
  crew(rig, 'shell', 1.35, 2.7, R90, 'carry', y);
  crew(rig, 'cartridge', 1.05, 3.3, R90, 'carry', y);
  crew(rig, 'lanyard', 1.65, 1.35, R90, 'lanyard', y);

  hb(rig, -0.95, 0, -1.1, 0.95, 1.55, 0.75);
  hb(rig, -0.22, 0, 0.75, 0.22, 1.0, TAILZ + 0.2);
  hb(rig, -PF.x, 0, PF.z0, PF.x, PLAT, PF.z1);
  return finishRig(rig, 'sfh93', 'sfh93');
}

// ---------------------------------------------------------------- the plank bed
// For a position held for some time (Lovett: "for prolonged firing positions, wooden recoil wedges were placed to
// the rear"): planks laid across on four sleepers, spiked down, the iron eye in front for the carriage's chain.
function platform(P) {
  const n = Math.round((PF.z1 - PF.z0) / 0.25), dz = (PF.z1 - PF.z0) / n;
  const SL = [-PF.x + 0.15, -0.75, 0.75, PF.x - 0.15];
  for (let i = 0; i < n; i++) {
    const z = PF.z0 + (i + 0.5) * dz, j = Math.sin(i * 12.9898) * 0.5 + 0.5;
    P.add('wood', box(PF.x * 2 + 0.08 * (j - 0.5), 0.06, dz - 0.012, 0.04 * (j - 0.5), PLAT - 0.03, z), { tint: [0xffffff, 0xe8dcc8, 0xd2c6b2, 0xf4ecdc][i % 4] });
    for (const x of SL) P.add('dark', yTube(PLAT - 0.002, PLAT + 0.006, 0.012, 0.012, 5, x + (i % 2) * 0.04, z));
  }
  for (const x of SL) P.add('wood', box(0.2, 0.1, PF.z1 - PF.z0 + 0.2, x, PLAT - 0.11, (PF.z0 + PF.z1) / 2), { tint: 0xb4a890 });
  P.add('iron', box(0.26, 0.02, 0.18, 0, PLAT + 0.01, -0.85));
  P.add('iron', new THREE.TorusGeometry(0.055, 0.015, 6, 12).translate(0, PLAT + 0.065, -0.85));
}

// ---------------------------------------------------------------- a ramp (Rücklaufkeil) behind a wheel
// Built up of planks, the slope faced with an iron strap the tyre runs on, a flat on top and a chock across its end.
function ramp(P, x) {
  const z0 = RAMP.z0, z1 = RAMP.z1, h = (z1 - z0) * SLOPE, t = RAMP.top, w = RAMP.w, ze = z1 + t;
  P.add('wood', sideProfile([[z0, PLAT], [z1, PLAT + h], [ze, PLAT + h], [ze, PLAT]], w).translate(x, 0, 0), { tint: 0xe0d4be });
  for (let i = 1; i < 4; i++) {
    const yy = PLAT + (h * i) / 4, zs = z0 + ((z1 - z0) * i) / 4;
    for (const s of [-1, 1]) P.add('char', box(0.004, 0.008, ze - zs, x + s * (w / 2 + 0.001), yy, (zs + ze) / 2));
  }
  const sl = Math.atan(SLOPE), len = Math.hypot(z1 - z0, h);
  P.add('iron', box(w * 0.8, 0.01, len, x, PLAT + h / 2 + 0.005, (z0 + z1) / 2, -sl));
  P.add('iron', box(w * 0.8, 0.01, t, x, PLAT + h + 0.005, z1 + t / 2));
  P.add('wood', box(w + 0.02, 0.12, 0.11, x, PLAT + h + 0.06, ze - 0.055), { tint: 0xc8bca4 });
  P.add('iron', box(w, 0.01, 0.16, x, PLAT + 0.005, z0 - 0.05));
  for (const s of [-1, 1]) P.add('dark', yTube(PLAT, PLAT + 0.02, 0.013, 0.013, 5, x + s * w * 0.35, z0 - 0.08));
}

// ---------------------------------------------------------------- the carriage
// the crew's grips, recorded as carriage() builds them (the hubs depend on the trunnion and the arc)
const HW = {};
function carriage(P) {
  const xo = CX + CT / 2, xs = CX + CT; // the cheek's mid plane, its outer face
  for (const s of [-1, 1]) {
    P.add('camo', sideProfile(CHEEK, CT).translate(s * xo, 0, 0));
    P.add('camo', rivetPoly(CHEEK, (z, y) => V(s * (xs + 0.001), y, z), 0.03, 0.08, V(s, 0, 0), 0.011), { tint: RIV });
    // the trail's flask lofted through its stations (narrowing at the neck), its top and bottom flanges turned out
    // (one loft a bay: loft orients its faces from the centroid, so each piece must be convex)
    const bays = (f) => { for (let k = 0; k < STATIONS.length - 1; k++) P.add('camo', loft([STATIONS[k], STATIONS[k + 1]].map((z) => f(z, inX(z), inX(z) + CT, topY(z), botY(z))))); };
    bays((z, i, o, t, b) => [V(s * o, b, z), V(s * o, t, z), V(s * i, t, z), V(s * i, b, z)]);
    bays((z, i, o, t) => [V(s * o, t - 0.02, z), V(s * o, t, z), V(s * (o + 0.03), t, z), V(s * (o + 0.03), t - 0.02, z)]);
    bays((z, i, o, t, b) => [V(s * o, b, z), V(s * o, b + 0.02, z), V(s * (o + 0.03), b + 0.02, z), V(s * (o + 0.03), b, z)]);
    const pts = [];
    for (let z = NECK[0] + 0.05; z < TAILZ - 0.05; z += 0.08) { const x = s * (inX(z) + CT + 0.001); pts.push(V(x, topY(z) - 0.035, z), V(x, botY(z) + 0.035, z)); }
    P.add('camo', rivets(pts, V(s, 0, 0), 0.011), { tint: RIV });
    // the angle iron along the cheek's top edge behind the bearing, stiffeners across the outside
    P.add('camo', box(0.07, 0.02, NECK[0] - 0.31, s * (xs + 0.02), (topY(0.33) + topY(NECK[0])) / 2 - 0.01, (0.33 + NECK[0]) / 2, Math.atan2(topY(0.33) - topY(NECK[0]), NECK[0] - 0.33)));
    P.add('camo', box(0.03, 0.6, 0.05, s * (xs + 0.015), 0.9, -0.3, 0.32));
    for (const z of [1.6, 2.4]) P.add('camo', box(0.03, topY(z) - botY(z) - 0.04, 0.05, s * (RW + CT + 0.015), (topY(z) + botY(z)) / 2, z, -0.2));
    // the trunnion bearing: a boss, its cap and bolts, the cap-square over it
    P.add('camo', xTube(s * xs, s * (xs + 0.06), 0.12, 0.115, 20, TR.y, TR.z));
    P.add('steel', xTube(s * (xs + 0.06), s * (xs + 0.072), 0.06, 0.06, 14, TR.y, TR.z));
    for (let i = 0; i < 6; i++) {
      const b = (i / 6) * TAU + 0.5;
      P.add('steel', xTube(s * (xs + 0.06), s * (xs + 0.078), 0.014, 0.014, 6, TR.y + Math.sin(b) * 0.09, TR.z + Math.cos(b) * 0.09));
    }
    P.add('camo', box(0.04, 0.05, 0.3, s * (xs + 0.025), TR.y + 0.13, TR.z));
    // the axle's bearing on the cheek
    P.add('camo', box(0.05, 0.24, 0.3, s * (xs + 0.025), AXY, 0));
    for (const [dy, dz] of [[0.09, 0.11], [0.09, -0.11], [-0.09, 0.11], [-0.09, -0.11]]) P.add('steel', xTube(s * (xs + 0.05), s * (xs + 0.065), 0.014, 0.014, 6, AXY + dy, dz));
    // the eye for a handspike on the trail (levering the end round for line on the march)
    P.add('dark', new THREE.TorusGeometry(0.045, 0.013, 5, 10).rotateY(Math.PI / 2).translate(s * (RW + CT + 0.035), topY(2.5) - 0.18, 2.5));
  }
  // the axle tree through both flasks out to the naves
  P.add('steel', xTube(-WX - 0.12, WX + 0.12, 0.05, 0.05, 14, AXY, 0));
  P.add('camo', xTube(-WX + 0.14, WX - 0.14, 0.062, 0.062, 14, AXY, 0));
  // transoms: the front plate (with the hook for the platform's chain under it), one behind the breech's dip at full
  // elevation, the floor of the trail's rear half and the end plate
  P.add('camo', box(CX * 2, 0.3, 0.03, 0, 0.78, -0.43));
  P.add('camo', rivetRow(V(-CX + 0.04, 0.9, -0.446), V(CX - 0.04, 0.9, -0.446), 0.07, V(0, 0, -1), 0.01), { tint: RIV });
  P.add('dark', box(0.06, 0.1, 0.08, 0, 0.6, -0.42));
  P.add('dark', new THREE.TorusGeometry(0.04, 0.013, 5, 10).translate(0, 0.52, -0.44));
  P.add('camo', box(inX(1.45) * 2, 0.32, 0.03, 0, 0.66, 1.45));
  { const z0 = 1.45, z1 = TAILZ - 0.05, y0 = 0.47, y1 = PLAT + 0.06, l = Math.hypot(z1 - z0, y1 - y0);
    P.add('camo', box(RW * 2, 0.025, l, 0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(y0 - y1, z1 - z0))); }
  P.add('camo', box(RW * 2, 0.025, 1.3, 0, topY(2.1) - 0.01, 2.1, Math.atan2(0.43, TAILZ - 1.2))); // the deck over the rear
  // the trail's end: the end plate, an iron shoe under it standing on the planks, the lunette, two handles
  P.add('camo', box(RW * 2 + CT * 2, 0.36, 0.03, 0, PLAT + 0.19, TAILZ - 0.015));
  P.add('camo', rivetRow(V(-RW, PLAT + 0.32, TAILZ + 0.001), V(RW, PLAT + 0.32, TAILZ + 0.001), 0.07, V(0, 0, 1), 0.011), { tint: RIV });
  P.add('iron', box(RW * 2 + 0.16, 0.025, 0.55, 0, PLAT + 0.012, TAILZ - 0.26));
  P.add('iron', box(RW * 2 + 0.16, 0.12, 0.025, 0, PLAT + 0.06, TAILZ - 0.53, 0.4));
  P.add('dark', box(0.08, 0.06, 0.14, 0, PLAT + 0.3, TAILZ + 0.07));
  P.add('dark', new THREE.TorusGeometry(0.07, 0.02, 6, 14).rotateX(Math.PI / 2).translate(0, PLAT + 0.3, TAILZ + 0.2));
  for (const s of [-1, 1]) {
    P.add('steel', rod(V(s * 0.12, PLAT + 0.12, TAILZ + 0.015), V(s * 0.12, PLAT + 0.12, TAILZ + 0.1), 0.014, 6));
    P.add('steel', rod(V(s * 0.12, PLAT + 0.12, TAILZ + 0.1), V(s * 0.04, PLAT + 0.12, TAILZ + 0.1), 0.014, 6));
  }
  // the brake: a beam across behind the wheels on two arms from the axle, wooden shoes on the tyres, the screw
  const ba = 32 * DEG, bz = Math.sin(ba) * (WR + 0.04), by = AXY - Math.cos(ba) * (WR + 0.04);
  P.add('dark', xTube(-WX + 0.02, WX - 0.02, 0.025, 0.025, 8, by, bz + 0.03));
  for (const s of [-1, 1]) {
    P.add('wood', box(0.1, 0.05, 0.22, s * WX, AXY - Math.cos(ba) * (WR + 0.025), Math.sin(ba) * (WR + 0.025), ba));
    P.add('dark', rod(V(s * (WX - 0.08), AXY - 0.03, 0.06), V(s * (WX - 0.08), by, bz + 0.03), 0.018, 6));
  }
  P.add('dark', rod(V(0.12, by, bz + 0.03), V(0.12, 0.62, 0.95), 0.016, 6));
  P.add('dark', yTube(0.62, 0.86, 0.016, 0.016, 6, 0.12, 0.95));
  P.add('dark', xTube(0.04, 0.15, 0.012, 0.012, 6, 0.86, 0.95));
  // the drag shoe's chain hanging off the right flask
  P.add('dark', chain(V(xs + 0.03, 0.82, -0.25), V(xs + 0.05, 0.62, 0.22), 0.16, 0.05));
  // elevating gear: the long ribbed pinion across the front between the flasks (it works the arc under the
  // barrel), a spur gear on its right end outside the flask, the shaft back from a small pinion to a bevel box and
  // the handwheel behind the right wheel
  const py = TR.y - PR * Math.sin(PA), pz = TR.z + PR * Math.cos(PA);
  P.add('dark', xTube(-CX, CX, 0.045, 0.045, 14, py, pz));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    P.add('dark', box(0.26, 0.016, 0.016, 0, py + Math.sin(a) * 0.047, pz + Math.cos(a) * 0.047, a));
  }
  P.add('steel', xTube(-xs - 0.03, xs + 0.1, 0.022, 0.022, 8, py, pz));
  P.add('dark', xTube(xs + 0.045, xs + 0.075, 0.1, 0.1, 24, py, pz));
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; P.add('dark', box(0.03, 0.02, 0.022, xs + 0.06, py + Math.sin(a) * 0.105, pz + Math.cos(a) * 0.105, a)); }
  const sy = py - 0.13, sz = pz + 0.06;
  P.add('dark', xTube(xs + 0.04, xs + 0.08, 0.045, 0.045, 12, sy, sz));
  P.add('dark', zTube(sz, 0.74, 0.018, 0.018, 8, xs + 0.06, sy));
  P.add('camo', box(0.03, 0.1, 0.12, xs + 0.015, sy, 0.3)); // the shaft's bearing on the flask
  P.add('camo', box(0.09, 0.11, 0.1, xs + 0.06, sy, 0.76));
  P.add('dark', handwheelX(0.13).translate(xs + 0.16, sy, 0.76));
  HW.elevator = [xs + 0.16, sy, 0.76]; HW.sight = [-(xs + 0.14), 1.36, 0.48];
  // the sight: a bracket off the left flask behind the trunnion, the dial sight on it, eyepiece to the left
  P.add('camo', box(0.05, 0.42, 0.07, -(xs + 0.03), 1.12, 0.48));
  P.add('camo', box(0.14, 0.04, 0.09, -(xs + 0.09), 1.34, 0.48));
  P.add('dark', yTube(1.08, 1.36, 0.02, 0.02, 8, -(xs + 0.14), 0.48));
  panoramicSight(P, -(xs + 0.14), 1.36, 0.48, -1);
}

// A small handwheel (axis X, handle toward +X): rim, five spokes, boss and handle.
function handwheelX(R) {
  const g = [new THREE.TorusGeometry(R, 0.012, 5, 20).rotateY(Math.PI / 2), xTube(-0.04, 0.04, 0.028, 0.024, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.008, 4)); }
  g.push(xTube(0, 0.06, 0.009, 0.009, 6, R, 0), xTube(0.06, 0.1, 0.015, 0.015, 6, R, 0));
  return mergeAll(g);
}

// ---------------------------------------------------------------- the wooden wheel
// Twelve broad oval spokes in a deep felloe, a wide steel tyre, a short nave with the big bolted hub flange on its
// outer face (the Jemappes and Kansas City guns), the axle cap and its linch pin (axis X, centre at the origin,
// `side` the way the hub faces). The nave is kept short so the men beside the wheels have room.
function woodWheel(P, side) {
  const R = WR, tw = 0.1, nv = 0.12;
  P.add('dark', ring(R - 0.022, R, -tw / 2, tw / 2, 48));
  P.add('wood', ring(R - 0.1, R - 0.022, -tw * 0.42, tw * 0.42, 40));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13, ca = Math.cos(a), sa = Math.sin(a);
    P.add('wood', rod(V(-side * 0.03, ca * nv, sa * nv), V(0, ca * (R - 0.09), sa * (R - 0.09)), 0.03, 6).scale(0.7, 1, 1));
  }
  const x0 = Math.min(-side * 0.13, side * 0.08), x1 = Math.max(-side * 0.13, side * 0.08);
  P.add('wood', xTube(x0, x1, nv, nv * 0.95, 16));
  P.add('dark', xTube(-side * 0.13 - 0.015, -side * 0.13 + 0.015, nv * 1.1, nv * 1.1, 16));
  // the hub flange and its ring of bolts
  P.add('dark', xTube(Math.min(side * 0.08, side * 0.1), Math.max(side * 0.08, side * 0.1), 0.17, 0.17, 24));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    P.add('steel', xTube(Math.min(side * 0.1, side * 0.115), Math.max(side * 0.1, side * 0.115), 0.013, 0.013, 6, Math.cos(a) * 0.14, Math.sin(a) * 0.14));
  }
  P.add('steel', xTube(Math.min(side * 0.1, side * 0.17), Math.max(side * 0.1, side * 0.17), 0.06, 0.045, 12));
  P.add('steel', rod(V(side * 0.14, 0.07, 0), V(side * 0.14, -0.07, 0), 0.008, 5)); // the linch pin
}

// cast steel has no panel seams: the paint's metric box-projected UVs (as kit.js projectUV, but each triangle by its
// own face, so a fillet's two halves of a quad agree) moved two thirds of a metre up, so the camouflage texture's plate
// seams (one runs along the bore's line) fall off the breech
function cast(g) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a);
    b.cross(c);
    const nx = Math.abs(b.x), ny = Math.abs(b.y), nz = Math.abs(b.z), ax = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      uv[(i + k) * 2] = (ax === 0 ? z : x) / 4;
      uv[(i + k) * 2 + 1] = (ax === 1 ? z : y) / 4 + 1 / 6;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// A length of the breech piece from z0 to z1: the round of radius R cut flat on the right at x = xf (xf 0: whole), the
// wedge's slot [xs, h] cut in from the flat (to its blind left end, half height h), or a round opening of radius r on
// the bore
function facetPiece(R, xf, slot, r, z0, z1) {
  const s = new THREE.Shape();
  if (xf > 0) {
    const a = Math.acos(xf / R), yf = R * Math.sin(a);
    s.moveTo(xf, yf);
    s.absarc(0, 0, R, a, Math.PI * 2 - a, false);
    if (slot) { const [xs, h] = slot; s.lineTo(xf, -h); s.lineTo(xs, -h); s.lineTo(xs, h); s.lineTo(xf, h); }
    s.lineTo(xf, yf);
  } else s.absarc(0, 0, R, 0, Math.PI * 2, false);
  if (r > 0) s.holes.push(new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 36 }).translate(0, 0, z0);
}

// ---------------------------------------------------------------- the barrel
// A plain short forging: a lip at the muzzle, the chase tapering back to the trunnion band, the reinforce, and the
// round breech piece with the wedge's slot opening in a flat on its right; the three pegs of the old sight on its top,
// the sight arch on its left; the toothed elevating arc hung under the barrel on a web.
function barrelParts(B) {
  B.add('camo', zLathe([[MZ + 0.3, 0.0746], [MZ, 0.0746], [MZ, 0.15], [MZ + 0.012, 0.156], [MZ + 0.07, 0.156], [MZ + 0.085, 0.142], [-0.3, 0.155],
    [-0.28, 0.166], [RING0 - 0.02, 0.166], [RING0 - 0.02, RG.lo - 0.002], [RING0 - 0.3, RG.lo - 0.002], [RING0 - 0.3, 0.0001]], 32));
  B.add('char', new THREE.CircleGeometry(0.0746, 20).rotateY(Math.PI).translate(0, 0, MZ + 0.3));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    B.add('dark', box(0.009, 0.004, 0.29, Math.cos(a) * 0.072, Math.sin(a) * 0.072, MZ + 0.15, 0, 0, a + Math.PI / 2));
  }
  // the trunnion band, the trunnions out to the flasks
  B.add('camo', zTube(-0.15, 0.17, 0.178, 0.178, 30));
  for (const z of [-0.15, 0.17]) B.add('camo', zTube(z - 0.015, z + 0.015, 0.186, 0.186, 30));
  for (const s of [-1, 1]) {
    B.add('camo', box(0.03, 0.2, 0.26, s * 0.18, 0, 0.01));
    B.add('steel', xTube(s * 0.18, s * (CX + 0.004), 0.06, 0.06, 16));
  }
  // the breech piece, no separate ring (refs/sfh93: the Cuperly stereo pair from behind, Cazals from the rear right): a
  // plain cylinder stepping up from the reinforce to a flat rear face with the round loading opening, cut flat on the
  // right where the tall slot of the early sliding block opens; the wedge slides in it ahead of the rear wall
  const { R, xf, f0, f1, s0, s1, h, xs, lo } = RG;
  B.add('camo', cast(zLathe([[RING0 - 0.03, 0.166], [RING0 + 0.005, R], [f0, R], [f0, lo - 0.002]], 48)), { uv: true });
  B.add('camo', cast(facetPiece(R, xf, null, lo - 0.002, f0, s0)), { uv: true });
  B.add('camo', cast(facetPiece(R, xf, [xs, h], 0, s0, s1)), { uv: true });
  B.add('camo', cast(facetPiece(R, xf, null, lo, s1, f1)), { uv: true });
  B.add('camo', cast(facetPiece(R, 0, null, lo, f1, BR - 0.016)), { uv: true });
  B.add('camo', cast(zLathe([[BR - 0.017, R], [BR - 0.012, R], [BR - 0.003, R - 0.003], [BR, R - 0.012], [BR, lo + 0.008], [BR - 0.006, lo], [BR - 0.017, lo]], 48)), { uv: true });
  // the chamber dark down to the trunnion band (whose solid tubes close the bore further in)
  B.add('char', zTube(0.19, s0, lo - 0.003, lo - 0.003, 20, 0, 0, true).scale(-1, 1, 1));
  for (const s of [-1, 1]) B.add('ash', box(xf - xs, 0.002, s1 - s0, (xs + xf) / 2, s * (h - 0.002), (s0 + s1) / 2)); // the slot's floor and roof, in shadow
  B.add('char', new THREE.CircleGeometry(lo, 20).translate(0, 0, 0.19));
  // the latch on the rear face right of the opening with its knob, a bolt boss on the left of the rim
  B.add('dark', box(0.032, 0.15, 0.022, 0.108, 0.09, BR + 0.011));
  B.add('dark', yTube(-0.035, 0.02, 0.017, 0.017, 10, 0.108, BR + 0.017));
  B.add('dark', zTube(BR - 0.004, BR + 0.014, 0.018, 0.018, 8, -0.15, 0.05));
  // the three pegs on the top for the old sight, a lifting lug, the friction tube's vent and lanyard lever
  for (const [x, z] of [[-0.07, s0 - 0.02], [0.07, s0 - 0.02], [0, BR - 0.06]]) B.add('steel', yTube(R - 0.02, R + 0.05, 0.012, 0.012, 6, x, z));
  B.add('camo', box(0.08, 0.06, 0.14, 0, 0.19, -0.02));
  B.add('dark', box(0.05, 0.05, 0.05, 0.075, 0.175, s0 + 0.04));
  B.add('steel', rod(V(0.075, 0.19, s0 + 0.04), V(0.095, 0.32, s0 + 0.08), 0.014, 6));
  // the sight arch on the ring's left: a curved bar about the trunnions
  const ax = -RG.R - 0.02, ar = BR - 0.04;
  for (let i = 0; i < 6; i++) {
    const a0 = (-25 + i * 10) * DEG, a1 = (-15 + i * 10) * DEG;
    B.add('dark', rod(V(ax, ar * Math.sin(a0), ar * Math.cos(a0)), V(ax, ar * Math.sin(a1), ar * Math.cos(a1)), 0.014, 5));
  }
  B.add('dark', box(0.03, 0.06, 0.05, ax, ar * Math.sin(35 * DEG), ar * Math.cos(35 * DEG)));
  // the elevating arc and its web
  B.add('dark', gearArc(ARC.r0, ARC.r1, ARC.a0, ARC.a1, 0.07, 20, 0.02));
  const web = [];
  for (let i = 0; i <= 6; i++) { const a = ARC.a0 + (ARC.a1 - ARC.a0) * i / 6; web.push([ARC.r0 * Math.cos(a), -ARC.r0 * Math.sin(a) + 0.01]); }
  web.push([ARC.r0 * Math.cos(ARC.a1) + 0.04, -0.14], [ARC.r0 * Math.cos(ARC.a0) - 0.04, -0.14]);
  B.add('camo', sideProfile(web, 0.025));
}

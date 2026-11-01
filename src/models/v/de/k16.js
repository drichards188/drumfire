import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, rivets, rivetRow, rivetPoly, loft, xf } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, ring, addHandwheel, TAU, L90, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { slidingBlock, barrel, panoramicSight } from './common.js';

/**
 * 15 cm Kanone 16 (Krupp, 1917): the long gun that outranged every British field piece, 22 km with the 51.4 kg shell
 * (en and de Wikipedia, historyofwar.org "15cm Kanone 16 (Krupp)", the Australian War Memorial's record of RELAWM05044,
 * the gun taken near Morcourt on 8 August 1918). Told by the very long L/42.7 barrel (6.41 m) lying on a long cradle with
 * the buffer and the recuperator both below the barrel (two cylinders side by side under the cradle's trough, their
 * round heads in front), the big squared breech ring with the horizontal sliding block far behind the axle, the large
 * curved splinter-proof shield whose wings wrap back round the gunners, the steel wheels with their solid rubber tyres
 * (for motor traction) on an axle hung from a transverse leaf spring, and the long box trail with its broad spade. The
 * top carriage is an A of two cheeks rising to the trunnions behind the axle and running back to their slide on the
 * trail (4 degrees each way of its 8). 10,870 kg in action, elevation -3 to +42 degrees; it travelled in two loads (the
 * barrel on its own wagon, not drawn). The carriage's proportions follow the K 17's (models/v/de/k17.js, same maker and
 * period), scaled to the 15 cm gun; the wheel (1.5 m), the track (1.84 m) and the line of fire (1.72 m) are estimates
 * from the photographs' proportions against the barrel's length.
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z. `traverse` is the top carriage with
 * the shield, turning on the axle; beyond TOP the lower carriage (`carriage`: wheels, axle and spring, trail, apron)
 * turns with it (rig.setTraverse: the trail shifted with the handspike). `elevation` at the trunnions, `recoil` slides
 * the barrel back along +Z, `breech` the sliding block (setBreech slides it +X).
 * buildK16({ scheme: 'bunt' | any CAMO key })
 */
const DEG = Math.PI / 180;
const WR = 0.75, WX = 0.92; // wheel radius (1.5 m) and wheel centre plane (1.84 m track)
const TR = { y: 1.8, z: 0.55 }; // trunnion axis in root space (the bore at 0 degrees), behind the axle
const BR = 0.95, RING0 = 0.46; // breech face and front of the breech ring along the bore from the trunnion
const MZ = BR - 6.41; // muzzle face: L/42.7
const STEP = -3.25; // where the chase meets the jacket, a little ahead of the cradle's nose
const RG = { w: 0.5, top: 0.25, bot: -0.33 }; // the breech ring: deeper below the bore than above
const CR = { top: -0.205, bot: -0.43, w: 0.44, z0: -3.35, z1: 0.42 }; // the cradle's trough under the barrel
const CYL = { y: -0.51, x: 0.115, r: 0.1, z0: -3.3 }; // the buffer (left) and the recuperator (right) under it
const SZ = -0.38; // front face of the shield (root z)
const TOP = 4 * DEG; // the top carriage's own traverse each way
const TZ0 = 0.12, TZ1 = 4.85; // trail girders from the axle to the trail end
const xi = (z) => 0.5 - 0.22 * (z - TZ0) / (TZ1 - TZ0); // inner face of a girder
const yc = (z) => 0.9 - 0.48 * (z - TZ0) / (TZ1 - TZ0); // girder centre height
const gh = (z) => 0.46 - 0.2 * (z - TZ0) / (TZ1 - TZ0); // girder depth
const GW = 0.13; // girder width

export function buildK16({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---------------------------------------------------------------- lower carriage (turns only beyond TOP)
  const carriage = new THREE.Group();
  carriage.name = 'carriage';
  root.add(carriage);
  const L = rig.part();
  for (const s of [-1, 1]) steelWheel(L, s * WX, s);
  // the axle through the naves, the transverse leaf spring above it carrying the axle tree on its middle, the
  // shackles at its ends down to the axle's spring seats
  L.add('dark', xTube(-(WX + 0.14), WX + 0.14, 0.065, 0.065, 14, WR, 0));
  for (let i = 0; i < 6; i++) {
    const w = 1.36 - i * 0.18, y = WR + 0.09 + i * 0.022;
    L.add('dark', box(w, 0.018, 0.1, 0, y - 0.035 * (1 - (w / 1.36) ** 2), 0));
  }
  for (const s of [-1, 1]) {
    L.add('dark', box(0.05, 0.08, 0.12, s * 0.7, WR + 0.06, 0)); // the shackle
    L.add('camo', box(0.12, 0.06, 0.16, s * 0.7, WR + 0.01, 0)); // the spring seat on the axle
    L.add('steel', xTube(s * 0.7 - 0.04, s * 0.7 + 0.04, 0.02, 0.02, 8, WR + 0.09, 0));
  }
  L.add('dark', box(0.2, 0.06, 0.14, 0, WR + 0.24, 0)); // the clip over the spring's middle
  L.add('camo', rbox(1.1, 0.12, 0.3, 0.02, 0, WR + 0.32, 0)); // the axle tree on it
  L.add('dark', yTube(WR + 0.38, WR + 0.4, 0.22, 0.22, 24, 0, 0)); // the top carriage's pivot plate
  // band brakes on the naves, worked by the screw on the right of the axle tree
  for (const s of [-1, 1]) L.add('dark', xTube(s * (WX - 0.26), s * (WX - 0.2), 0.24, 0.24, 20, WR, 0));
  L.add('dark', yTube(WR + 0.38, WR + 0.95, 0.018, 0.018, 6, 0.62, 0.12));
  L.add('dark', new THREE.TorusGeometry(0.07, 0.012, 5, 12).rotateX(Math.PI / 2).translate(0.62, WR + 0.96, 0.12));
  trail(L);
  // the lower shield (apron) hung from the axle tree between the wheels
  const apron = [[-0.7, 1.02], [0.7, 1.02], [0.7, 0.62], [0.66, 0.54], [0.58, 0.5], [-0.58, 0.5], [-0.66, 0.54], [-0.7, 0.62]];
  L.add('camo', plate(apron, [], SZ - 0.018, SZ - 0.004));
  L.add('camo', box(0.035, 0.5, 0.02, 0, 0.77, SZ - 0.022));
  for (const s of [-1, 1]) L.add('camo', box(0.1, 0.12, 0.3, s * 0.42, WR + 0.24, SZ / 2 - 0.02));
  L.add('camo', rivetPoly(apron, (u, v) => V(u, v, SZ - 0.019), 0.03, 0.12, V(0, 0, -1), 0.009));
  L.build(carriage, { dirt: 0.55 });

  // ---------------------------------------------------------------- top carriage with the shield (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const Y0 = WR + 0.4;
  T.add('camo', yTube(Y0, Y0 + 0.025, 0.23, 0.23, 24, 0, 0));
  T.add('camo', box(0.62, 0.05, 0.1, 0, Y0 + 0.05, -0.26)); // the transom low in front (the cylinders pass over it)
  // the cheeks: tall at the trunnions, low behind them so the breech goes down between them, running back as
  // girders to their slide on the trail
  const cheek = [[-0.3, Y0], [-0.3, 1.5], [-0.08, 1.8], [0.3, 1.94], [0.72, 1.94], [0.8, 1.72], [0.8, 1.42], [1.05, 1.36], [1.6, 1.3], [2.3, 1.22], [2.3, 1.06], [1.6, 1.12], [1.0, 1.16], [0.7, Y0]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(cheek, 0.04).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.34, 0, 0)));
    T.add('camo', rod(V(s * 0.34, 1.42, 0.8), V(s * 0.34, 1.36, 1.05), 0.02, 6));
    T.add('camo', rod(V(s * 0.34, 1.36, 1.05), V(s * 0.34, 1.22, 2.29), 0.02, 6));
    T.add('camo', rod(V(s * 0.34, 1.16, 1.0), V(s * 0.34, 1.06, 2.29), 0.02, 5));
    T.add('camo', rivetRow(V(s * 0.362, Y0 + 0.07, -0.25), V(s * 0.362, Y0 + 0.07, 0.65), 0.1, V(s, 0, 0), 0.01));
    T.add('camo', rivetRow(V(s * 0.362, 1.3, 1.1), V(s * 0.362, 1.18, 2.25), 0.1, V(s, 0, 0), 0.01));
    T.add('camo', rivetRow(V(s * 0.362, 1.52, -0.25), V(s * 0.362, 1.86, 0.1), 0.09, V(s, 0, 0), 0.01));
    // trunnion bearing and its cap
    T.add('camo', xTube(s * 0.32, s * 0.4, 0.13, 0.13, 20, TR.y, TR.z));
    T.add('dark', box(0.1, 0.04, 0.3, s * 0.36, TR.y + 0.14, TR.z));
    for (const z of [-0.1, 0.1]) T.add('steel', yTube(TR.y + 0.155, TR.y + 0.19, 0.018, 0.018, 6, s * 0.36, TR.z + z));
    // the slide shoe at the girder's end on the trail's slide plate
    T.add('dark', box(0.2, 0.05, 0.22, s * 0.42, yc(2.2) + gh(2.2) / 2 + 0.03, 2.2));
    T.add('camo', box(0.06, 0.12, 0.2, s * 0.35, yc(2.2) + gh(2.2) / 2 + 0.1, 2.2));
    // the shield's brackets on the cheeks' fronts and the stays from its wings
    T.add('camo', box(0.08, 0.42, 0.06, s * 0.34, 1.5, SZ + 0.04));
    T.add('dark', rod(V(s * 0.95, 2.05, SZ + 0.12), V(s * 0.36, 1.45, 0.3), 0.015, 6));
    T.add('dark', rod(V(s * 1.15, 1.75, SZ + 0.3), V(s * 0.36, 1.3, 0.5), 0.015, 6));
  }
  // elevation pinion on the left cheek under the toothed arc
  const pinY = TR.y - 0.67;
  T.add('dark', xTube(-0.33, -0.25, 0.045, 0.045, 12, pinY, TR.z));
  T.add('camo', box(0.1, 0.13, 0.18, -0.42, pinY, TR.z));
  // handwheels: elevation and traverse on the left (the layer's), a second elevation wheel on the right
  addHandwheel(T, -0.68, 1.48, 0.75, 0.16, -1);
  T.add('dark', xTube(-0.68, -0.37, 0.02, 0.02, 6, 1.48, 0.75));
  addHandwheel(T, -0.72, 1.12, 1.45, 0.11, -1);
  T.add('dark', xTube(-0.72, -0.37, 0.018, 0.018, 6, 1.12, 1.45));
  addHandwheel(T, 0.66, 1.52, 0.75, 0.14, 1);
  T.add('dark', xTube(0.37, 0.66, 0.018, 0.018, 6, 1.52, 0.75));
  // the sight on the left: the range drum by the trunnion, the panoramic sight on its bracket
  T.add('dark', xTube(-0.5, -0.44, 0.14, 0.14, 20, TR.y - 0.1, TR.z - 0.1));
  T.add('steel', xTube(-0.505, -0.5, 0.142, 0.142, 20, TR.y - 0.1, TR.z - 0.1));
  T.add('dark', box(0.05, 0.04, 0.08, -0.52, TR.y + 0.03, TR.z - 0.1));
  T.add('camo', box(0.2, 0.05, 0.1, -0.48, TR.y + 0.05, TR.z - 0.32));
  panoramicSight(T, -0.56, TR.y + 0.07, TR.z - 0.32, -1);

  // the curved shield: each half in three panels turning back toward the wings (photographs: the shield wraps round
  // the gunners), deep between the wheels, the wide upper part over them; a closed top over the barrel's slot, a rolled
  // top edge, stiffening angles on the back
  const top = 2.42, panels = [
    [0.25, SZ, 0.62, SZ, 1.02],
    [0.62, SZ, 0.98, SZ + 0.12, 1.56],
    [0.98, SZ + 0.12, 1.22, SZ + 0.34, 1.62],
  ];
  for (const s of [-1, 1]) for (const [x0, z0, x1, z1, y0] of panels) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), a = Math.atan2(dz, dx), cx = s * (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const yt = top - (x0 > 0.9 ? 0.1 : 0);
    T.add('camo', box(len + 0.01, yt - y0, 0.012, cx, (y0 + yt) / 2, cz + 0.006, 0, -s * a, 0));
    T.add('camo', box(len + 0.01, 0.022, 0.022, cx, yt, cz + 0.006, 0, -s * a, 0)); // the rolled edge
    // rivet rows along the panel's edges and a stiffener down its back
    const ux = Math.cos(a) * s, uz = Math.sin(a);
    const P = (u, y) => V(cx + ux * u, y, cz + uz * u - 0.002);
    T.add('camo', rivetRow(P(-len / 2 + 0.04, y0 + 0.04), P(len / 2 - 0.04, y0 + 0.04), 0.12, V(Math.sin(a) * s, 0, -Math.cos(a)), 0.009));
    T.add('camo', rivetRow(P(-len / 2 + 0.04, yt - 0.05), P(len / 2 - 0.04, yt - 0.05), 0.12, V(Math.sin(a) * s, 0, -Math.cos(a)), 0.009));
    T.add('camo', box(0.035, yt - y0 - 0.08, 0.035, cx + Math.sin(a) * s * 0.02, (y0 + yt) / 2, cz + Math.cos(a) * 0.03, 0, -s * a, 0));
  }
  // the slot's lips (open to the top: raised, the barrel stands above the shield there)
  for (const s of [-1, 1]) T.add('camo', rod(V(s * 0.25, 1.02, SZ + 0.006), V(s * 0.25, top, SZ + 0.006), 0.012, 5));
  T.add('camo', box(1.2, 0.04, 0.04, 0, 1.6, SZ + 0.035)); // the angle across the back
  // the sight's port in the left half with its flap, a spade and a pick on the front
  T.add('char', new THREE.PlaneGeometry(0.12, 0.09).rotateY(Math.PI).translate(-0.5, 2.0, SZ - 0.002));
  T.add('camo', box(0.16, 0.12, 0.012, -0.5, 2.1, SZ - 0.012, 0.5));
  T.add('wood', rod(V(-0.95, 1.35, SZ - 0.04), V(-0.4, 1.85, SZ - 0.04), 0.02, 6));
  T.add('dark', box(0.2, 0.24, 0.014, -0.98, 1.28, SZ - 0.04, 0, 0, 0.83));
  for (const t of [0.3, 0.75]) T.add('dark', box(0.05, 0.035, 0.05, -0.95 + 0.55 * t, 1.35 + 0.5 * t, SZ - 0.025));
  T.build(trav, { dirt: 0.45 });

  // ---------------------------------------------------------------- cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  const ch = CR.top - CR.bot, cz = (CR.z0 + CR.z1) / 2, cl = CR.z1 - CR.z0;
  E.add('camo', rbox(CR.w, ch, cl, 0.02, 0, (CR.top + CR.bot) / 2, cz));
  for (const s of [-1, 1]) {
    E.add('dark', box(0.05, 0.015, cl - 0.06, s * 0.16, CR.top + 0.008, cz)); // the barrel's slides on top
    for (const y of [CR.top - 0.025, CR.bot + 0.025]) {
      E.add('camo', box(0.025, 0.05, cl - 0.05, s * (CR.w / 2 + 0.012), y, cz));
      E.add('camo', rivetRow(V(s * (CR.w / 2 + 0.026), y, CR.z0 + 0.08), V(s * (CR.w / 2 + 0.026), y, CR.z1 - 0.08), 0.12, V(s, 0, 0), 0.01));
    }
    for (const z of [-2.8, -2.0, -1.2]) E.add('camo', box(0.015, ch - 0.08, 0.06, s * (CR.w / 2 + 0.008), (CR.top + CR.bot) / 2, z));
    // the two cylinders under the trough: the buffer on the left, the recuperator's springs on the right, banded to it
    const x = s * CYL.x;
    E.add('camo', zTube(CYL.z0, CR.z1 - 0.1, CYL.r, CYL.r, 18, x, CYL.y));
    E.add('camo', zTube(CYL.z0 - 0.08, CYL.z0, CYL.r * 0.9, CYL.r, 18, x, CYL.y));
    E.add('dark', zTube(CYL.z0 - 0.12, CYL.z0 - 0.08, CYL.r * 0.55, CYL.r * 0.75, 14, x, CYL.y));
    E.add('camo', zTube(CR.z1 - 0.1, CR.z1 - 0.04, CYL.r * 1.08, CYL.r * 1.08, 18, x, CYL.y));
    // the trunnion plates, the trunnions
    E.add('camo', box(0.04, 0.72, 0.62, s * 0.26, -0.24, -0.04));
    E.add('steel', xTube(s * 0.28, s * 0.4, 0.08, 0.08, 14));
    E.add('camo', rivetRow(V(s * 0.282, 0.08, -0.32), V(s * 0.282, 0.08, 0.24), 0.09, V(s, 0, 0), 0.01));
  }
  for (const z of [-2.9, -2.1, -1.3, -0.5]) E.add('camo', box(0.46, 0.035, 0.08, 0, CYL.y - CYL.r + 0.02, z)); // the bands
  E.add('steel', zTube(CYL.z0 - 0.15, CYL.z0 - 0.12, 0.03, 0.03, 8, -CYL.x, CYL.y)); // the buffer's filling plug
  // the toothed elevating arc on the left, centred on the trunnions (the pinion on the left cheek)
  E.add('camo', gearArc(0.5, 0.62, 42 * DEG, 98 * DEG, 0.04, 24, 0.03).translate(-0.3, 0, 0));
  E.add('camo', box(0.04, 0.1, 0.5, -0.28, -0.42, 0.06));
  // the slot cover: a curved plate on the cradle's radius closing the shield's slot under the barrel and a plate
  // across the bore above it
  E.add('camo', gearArc(0.88, 0.895, 112 * DEG, 160 * DEG, 0.4));
  E.add('camo', box(0.48, 0.32, 0.012, 0, 0.36, SZ - TR.z + 0.03));
  for (const s of [-1, 1]) {
    E.add('camo', rod(V(s * 0.17, -0.38, -0.78), V(s * 0.17, CR.bot + 0.03, -0.4), 0.014, 5));
    E.add('camo', rod(V(s * 0.17, 0.25, SZ - TR.z + 0.04), V(s * 0.12, CR.top + 0.01, -0.5), 0.014, 5));
  }
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---------------------------------------------------------------- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', barrel([[MZ + 0.45, 0.0747], [MZ, 0.0747], [MZ, 0.118], [MZ + 0.12, 0.12], [MZ + 0.16, 0.114], [STEP - 0.04, 0.142], [STEP, 0.155], [STEP + 0.07, 0.158], [STEP + 0.1, 0.172], [RING0 - 0.15, 0.185], [RING0, 0.187], [RING0, 0.0747], [RING0 - 0.7, 0.0747]], 28));
  B.add('char', new THREE.CircleGeometry(0.075, 18).rotateY(Math.PI).translate(0, 0, MZ + 0.45));
  // the jacket's locking ring and the slides under it that ride the cradle's ways
  B.add('camo', zTube(STEP + 0.1, STEP + 0.22, 0.182, 0.182, 26));
  for (const z of [STEP + 0.3, RING0 - 0.35]) B.add('dark', box(0.34, 0.035, 0.2, 0, CR.top + 0.025, z));
  // breech ring: the front round the chamber, top, bottom and left walls round the block's slot (open right)
  const sl = BR - RING0 - 0.14, rz = (RING0 + 0.14 + BR) / 2, hw = RG.w / 2;
  const disc = [];
  for (let i = 0; i < 18; i++) disc.push([0.085 * Math.cos(-i / 18 * TAU), 0.085 * Math.sin(-i / 18 * TAU)]);
  B.add('camo', plate([[-hw, RG.bot], [hw, RG.bot], [hw, RG.top], [-hw, RG.top]], [disc], RING0, RING0 + 0.14));
  B.add('camo', rbox(RG.w, 0.11, sl, 0.015, 0, RG.top - 0.055, rz));
  B.add('camo', rbox(RG.w, 0.11, sl, 0.015, 0, RG.bot + 0.055, rz));
  B.add('camo', box(0.1, RG.top - RG.bot - 0.22, sl, -hw + 0.05, (RG.top + RG.bot) / 2, rz));
  B.add('char', zTube(RING0 - 0.7, RING0 + 0.14, 0.0747, 0.085, 18, 0, 0, true).scale(-1, 1, 1));
  B.add('char', new THREE.CircleGeometry(0.0747, 18).translate(0, 0, RING0 - 0.7));
  B.add('dark', box(0.004, 0.13, 0.28, -hw - 0.002, 0.0, rz + 0.03)); // the recess for the block's handle
  B.add('camo', rivets([V(-hw - 0.001, RG.top - 0.055, RING0 + 0.06), V(-hw - 0.001, RG.bot + 0.055, RING0 + 0.06), V(-hw - 0.001, RG.top - 0.055, BR - 0.06), V(-hw - 0.001, RG.bot + 0.055, BR - 0.06)], V(-1, 0, 0), 0.015));
  // the lug under the ring and the two rods into the cylinders (long enough to stay in at full recoil)
  B.add('camo', box(0.38, 0.16, 0.14, 0, RG.bot - 0.08, RING0 + 0.16));
  for (const s of [-1, 1]) B.add('steel', zTube(-1.55, RING0 + 0.1, 0.04, 0.04, 10, s * CYL.x, CYL.y));
  // the firing gear on the top right of the ring, the lifting eyes, the loading handles on the left
  B.add('dark', box(0.08, 0.07, 0.16, 0.16, RG.top + 0.035, BR - 0.14));
  B.add('steel', rod(V(0.17, RG.top + 0.06, BR - 0.08), V(0.22, RG.top + 0.13, BR + 0.04), 0.012, 5));
  for (const z of [RING0 + 0.08, BR - 0.08]) B.add('steel', new THREE.TorusGeometry(0.035, 0.01, 5, 10).translate(-0.08, RG.top + 0.03, z));
  for (const y of [-0.05, 0.06]) {
    B.add('dark', rod(V(-hw, y, rz - 0.1), V(-hw - 0.07, y, rz - 0.1), 0.012, 6));
    B.add('dark', rod(V(-hw - 0.07, y, rz - 0.1), V(-hw - 0.07, y, rz + 0.15), 0.012, 6));
    B.add('dark', rod(V(-hw - 0.07, y, rz + 0.15), V(-hw, y, rz + 0.15), 0.012, 6));
  }
  B.build(rc, { dirt: 0.15, y0: TR.y });

  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  const bw = RG.w - 0.1 - 0.006, bh = RG.top - RG.bot - 0.226;
  K.add('camo', rbox(bw, bh, sl - 0.006, 0.01, 0.05, (RG.top + RG.bot) / 2, 0));
  K.add('dark', zTube(sl / 2 - 0.006, sl / 2 + 0.02, 0.04, 0.04, 12, 0, 0)); // firing pin housing
  K.add('char', new THREE.CircleGeometry(0.01, 8).translate(0, 0, sl / 2 + 0.0205));
  K.add('dark', box(0.07, 0.07, 0.04, 0.19, -0.03, sl / 2 + 0.015)); // the crank's stud
  K.add('steel', rod(V(0.19, -0.03, sl / 2 + 0.035), V(0.19, -0.19, sl / 2 + 0.085), 0.016, 6)); // the crank handle
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.28);

  // the top carriage turns on the axle within TOP; a bigger switch shifts the trail with the handspike, bringing the top
  // carriage back to the middle of its arc (fully by 3 TOP), so the detachment's places by the trail hold at any bearing
  rig.setTraverse = (r) => {
    const a = Math.abs(r), rel = a <= TOP ? r : Math.sign(r) * TOP * Math.max(0, 1 - (a - TOP) / (2 * TOP));
    trav.rotation.y = r;
    carriage.rotation.y = r - rel;
  };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 2.55, 1.3);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // No loading tray: the shell went into the open breech by hand and the rammer seated it with the staff, then the
  // cased charge followed. `tray` (where crews.js lays the round) is on the bore just inside the breech face.
  const sh = buildShell(shellKind()), mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  rig.anchors.shellStack = node(root, 'shellStack', 3.6, 0.1, 0.4); // the ready rounds by the right of the pit, clear of the trail's swing
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), shellKind());
  rig.recoilLength = 1.4; // [E] long at low elevation, shortened as the gun is raised
  rig.loadEl = 3 * DEG; // GUNS.k16.loadEl
  // the ring's lower corner (0.42 m off the bore) stays 0.12 m above the ground between the girders
  floorFade(rig, TR.y, BR + 0.02, 0.42, 0.12, 0.3);
  rig.slideMats = ['camo', 'dark', 'steel', 'char'];
  rig.nest = [[-CYL.x, CYL.y], [CYL.x, CYL.y]]; // the rods slide into the cylinders

  // Nine men: the gun commander off the left; the layer at the sight and the handwheels on the left, the second layer
  // at the right elevating handwheel; the loader left of the breech, the rammer behind him with the staff; the shell
  // (51 kg) and the cased charge brought up the right from the stack, the lanyard man on the right, an ammunition man
  // at the stack preparing the next round
  crew(rig, 'officer', -3.4, 1.4, L90, 'point');
  crew(rig, 'layer', -1.2, 1.15, L90, 'lay');
  crew(rig, 'elevator', 1.1, 1.0, R90, 'operate');
  crew(rig, 'loader', -1.2, 2.45, 0, 'ram');
  crew(rig, 'rammer', -1.15, 3.6, 0, 'ram');
  crew(rig, 'shell', 1.65, 3.4, R90, 'carry');
  crew(rig, 'cartridge', 1.6, 4.3, R90, 'carry');
  crew(rig, 'lanyard', 1.55, 1.95, R90, 'lanyard');
  crew(rig, 'ammo', 2.7, 3.9, R90, 'stand');

  hb(rig, -1.3, 0, -5.0, 1.3, 2.5, 0.8);
  hb(rig, -0.8, 0, 0.8, 0.8, 1.4, 5.3);
  return finishRig(rig, 'k16', shellKind());
}

// the gun's own shell when models/shells.js has it (it was added with the tree's new batteries), else the 15 cm sFH's
function shellKind() {
  try { buildShell('k16', 6); return 'k16'; } catch { return 'sfh13'; }
}

// ---------------------------------------------------------------- parts

// A flat plate from a front outline [x, y] with holes, between z0 and z1.
function plate(outline, holes, z0, z1) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 6 });
  return g.translate(0, 0, Math.min(z0, z1));
}

// The 1.5 m steel wheel for motor traction: a pressed steel felloe with a broad solid rubber tyre in two bands, sixteen
// flat steel spokes, the big hub with its bolt ring and cap (Australian War Memorial and period photographs). Axis X.
function steelWheel(P, x, side) {
  const at = (g) => g.applyMatrix4(xf(x, WR, 0));
  const R = WR, tw = 0.16;
  for (const s of [-1, 1]) P.add('tyre', at(ring(R - 0.06, R, s * 0.004, s * tw / 2, 56))); // the two rubber bands
  P.add('dark', at(ring(R - 0.075, R - 0.055, -tw / 2 - 0.01, tw / 2 + 0.01, 52))); // the steel rim
  P.add('camo', at(ring(R - 0.11, R - 0.075, -0.04, 0.04, 48))); // the felloe channel
  for (let i = 0; i < 24; i++) { // the bolts holding the rubber
    const a = (i / 24) * TAU;
    P.add('steel', at(xTube(side * (tw / 2 + 0.008), side * (tw / 2 + 0.016), 0.01, 0.01, 5, Math.cos(a) * (R - 0.066), Math.sin(a) * (R - 0.066))));
  }
  const n = 16, hub = 0.17;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), off = (i % 2 ? 1 : -1) * 0.025;
    // flat spokes, staggered in two planes as on the steel artillery wheels
    P.add('camo', rod(V(side * off, ca * hub, sa * hub), V(side * off * 0.3, ca * (R - 0.1), sa * (R - 0.1)), 0.026, 5).applyMatrix4(xf(0, 0, 0, 0, 0, 0, V(0.5, 1, 1))).applyMatrix4(xf(x, WR, 0)));
  }
  P.add('camo', at(xTube(-0.12, 0.12, hub + 0.02, hub, 22))); // the hub
  P.add('dark', at(xTube(side * 0.12, side * 0.14, hub + 0.035, hub + 0.035, 22))); // its flange
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    P.add('steel', at(xTube(side * 0.14, side * 0.158, 0.014, 0.014, 6, Math.cos(a) * (hub + 0.01), Math.sin(a) * (hub + 0.01))));
  }
  P.add('dark', at(xTube(side * 0.14, side * 0.24, 0.1, 0.075, 16))); // hub cap
  P.add('steel', at(xTube(side * 0.24, side * 0.255, 0.04, 0.04, 8)));
}

// The box trail: two riveted girders from the axle tree to the trail end, converging and sloping down, with lightening
// holes, the slide plates for the top carriage, a floor at the rear, the end with the broad spade, the lunette, the
// handles and the handspikes.
function trail(P) {
  const st = [TZ0, 1.2, 2.4, 3.6, TZ1];
  for (const s of [-1, 1]) {
    const sec = (z) => { const a = s * xi(z), b = s * (xi(z) + GW), y0 = yc(z) - gh(z) / 2, y1 = yc(z) + gh(z) / 2; return [V(a, y0, z), V(b, y0, z), V(b, y1, z), V(a, y1, z)]; };
    P.add('camo', loft(st.map(sec)));
    for (const k of [1, -1]) {
      const pts = st.map((z) => V(s * (xi(z) + GW + 0.002), yc(z) + k * (gh(z) / 2 - 0.03), z));
      for (let i = 0; i < pts.length - 1; i++) P.add('camo', rivetRow(pts[i], pts[i + 1], 0.11, V(s, 0, 0), 0.01));
    }
    for (const z of [1.1, 1.8, 2.7, 3.5]) {
      for (const f of [0, 1]) {
        const hx = s * (xi(z) + f * GW + (f ? 0.002 : -0.002));
        P.add('char', new THREE.CircleGeometry(gh(z) * 0.23, 14).rotateY(s * (f ? 1 : -1) * Math.PI / 2).scale(1, 1, 1.5).translate(hx, yc(z), z));
      }
    }
    // the slide plate the top carriage's girder rests on, the arm's front over the axle tree
    P.add('dark', box(GW + 0.06, 0.05, 0.4, s * (xi(2.2) + GW / 2), yc(2.2) + gh(2.2) / 2 + 0.005, 2.2));
    P.add('camo', box(GW, 0.2, 0.3, s * (xi(TZ0) + GW / 2), yc(TZ0) + gh(TZ0) / 2 - 0.1, TZ0 - 0.1));
    P.add('steel', new THREE.TorusGeometry(0.06, 0.012, 5, 12).rotateY(Math.PI / 2).translate(s * (xi(4.1) + GW + 0.018), yc(4.1), 4.1));
  }
  // the floor at the rear and the low transom in front of it (clear of the breech's sweep)
  const fl = (z) => [V(-xi(z), yc(z) - gh(z) / 2, z), V(xi(z), yc(z) - gh(z) / 2, z), V(xi(z), yc(z) - gh(z) / 2 + 0.016, z), V(-xi(z), yc(z) - gh(z) / 2 + 0.016, z)];
  P.add('dark', loft([fl(3.7), fl(TZ1)]));
  P.add('camo', box(xi(3.7) * 2, 0.1, 0.1, 0, yc(3.7) - gh(3.7) / 2 + 0.05, 3.7));
  const ze = TZ1, ye = yc(ze);
  P.add('camo', rbox((xi(ze) + GW) * 2, gh(ze), 0.44, 0.025, 0, ye, ze + 0.2));
  P.add('steel', new THREE.TorusGeometry(0.09, 0.026, 8, 16).rotateX(Math.PI / 2).translate(0, ye - 0.05, ze + 0.55));
  P.add('steel', zTube(ze + 0.4, ze + 0.47, 0.05, 0.05, 10, 0, ye - 0.05));
  for (const s of [-1, 1]) {
    P.add('camo', box(0.2, 0.15, 0.3, s * 0.54, ye + 0.02, ze + 0.15));
    P.add('dark', box(0.12, 0.012, 0.2, s * 0.54, ye + 0.097, ze + 0.15));
    P.add('steel', rod(V(s * 0.64, ye + 0.05, ze + 0.03), V(s * 0.73, ye + 0.05, ze + 0.08), 0.013, 6));
    P.add('steel', rod(V(s * 0.73, ye + 0.05, ze + 0.08), V(s * 0.73, ye + 0.05, ze + 0.26), 0.013, 6));
    P.add('steel', rod(V(s * 0.73, ye + 0.05, ze + 0.26), V(s * 0.64, ye + 0.05, ze + 0.31), 0.013, 6));
  }
  // the broad spade under the end, raked and dug in, ribbed behind
  P.add('camo', box(0.86, 0.62, 0.03, 0, 0.02, ze + 0.14, -0.3));
  for (const x of [-0.28, 0, 0.28]) P.add('camo', box(0.03, 0.52, 0.13, x, 0.07, ze + 0.22, -0.3));
  // two handspikes standing in their sockets, a stowed rammer staff along the right girder
  for (const s of [-1, 1]) {
    P.add('dark', yTube(ye + 0.095, ye + 0.17, 0.035, 0.035, 8, s * 0.54, ze + 0.15));
    P.add('wood', yTube(ye + 0.17, ye + 1.1, 0.026, 0.02, 7, s * 0.54, ze + 0.15));
  }
  const a = V(xi(1.5) + GW + 0.035, yc(1.5) + 0.04, 1.5), b = V(xi(4.2) + GW + 0.035, yc(4.2) + 0.04, 4.2);
  P.add('wood', rod(a, b, 0.025, 6));
  for (const z of [1.8, 3.9]) P.add('dark', box(0.06, 0.06, 0.04, xi(z) + GW + 0.03, yc(z) + 0.04, z));
}

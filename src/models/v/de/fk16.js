import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, rivetRow, rivetPoly, rivets, loft, xf, zLathe } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, crew, ring, addHandwheel, TAU, L90, R90 } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { slidingBlock, barrel, panoramicSight } from './common.js';

/**
 * 7.7 cm Feldkanone 16 (Krupp, 1916): the German division's field gun from 1916, the L/35 barrel (2.695 m) on the
 * carriage of the 10.5 cm leFH 16 (militaria.british-classic-motorcycles.co.uk "7.7 cm Feldkanone 16", de and en
 * Wikipedia). What tells it from the FK 96 n.A. it replaced: the long barrel lying on a cradle that runs nearly its
 * whole length (three shrunk-on hoops carry the guide shoes that slide on the cradle's ways; the hydro-spring buffer
 * and the two coaxial recuperator springs are inside the cradle, the buffer cylinder recoiling with the gun from its
 * lug under the breech ring), the trunnions at the rear of the cradle on a saddle with triangular side plates, the
 * two toothed elevating arcs under the cradle (the balancing spring strut between them is not drawn), and a box trail with a
 * gap between its side arms so the breech can recoil down between them at the 40 degree elevation that gave the gun
 * its range. Wooden wheels of 1.36 m with 70 mm steel tyres and shoe brakes in front of them, track 1.53 m, the 4 mm
 * shield with a lower apron and the two axle seats in front of it, the horizontal sliding block opened by a single
 * lever on top, the striker fired by a lanyard from the right, the sight on the left trunnion's end with the
 * panoramic telescope, the Abweiser bar that keeps the left-hand gunner clear of the recoil. 1,318 kg, overall
 * 4.8 m, elevation -10 to +40, traverse 2 degrees each way on the saddle, recoil 1.25 m. The line of fire's height
 * is an estimate (about 1.06 m, as the FK 96 n.A.).
 *
 * Fixed rounds: the 7.2 kg shell in its brass case (77 x 230 mm R), loaded in one movement by hand; `fixedRound()`
 * builds the round (the crew module, render/ww1/fk16.js, puts the case on the carried shell).
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the axle centre, front -Z. `traverse` the saddle with the
 * upper shield, turning on the axle; beyond TOP the lower carriage (`carriage`: wheels, axle, trail, apron, seats)
 * turns with it (the trail shifted with the handspike). `elevation` at the trunnions, `recoil` slides the barrel back
 * along +Z, `breech` the sliding block (setBreech slides it +X).
 * buildFK16({ scheme: 'bunt' | any CAMO key })
 */
const DEG = Math.PI / 180;
const WR = 0.68, WX = 0.765; // wheel radius (1.36 m) and wheel centre plane (1.53 m track)
const TR = { y: 1.06, z: 0.25 }; // trunnion axis in root space (the bore at 0 degrees), behind the axle
const BR = 0.42, RING0 = 0.13; // breech face and front of the breech ring along the bore from the trunnion
const MZ = BR - 2.695; // muzzle face: L/35
const RG = { w: 0.25, top: 0.1, bot: -0.15 }; // the breech ring
const CR = { top: -0.088, w: 0.2, z0: -2.0, z1: 0.06, botF: -0.24, botR: -0.29, zs: -0.8 }; // the cradle under the barrel
const SZ = -0.24; // front face of the shield (root z)
const TOP = 2 * DEG; // the saddle's own traverse each way
const TZ0 = -0.05, TZ1 = 2.55; // trail side arms from the axle to the trail end
const xi = (z) => 0.27 - 0.12 * (z - TZ0) / (TZ1 - TZ0); // inner face of an arm
const yc = (z) => 0.63 - 0.33 * (z - TZ0) / (TZ1 - TZ0); // arm centre height
const gh = (z) => 0.27 - 0.11 * (z - TZ0) / (TZ1 - TZ0); // arm depth
const GW = 0.075; // arm width
const ARC = { r0: 0.3, r1: 0.35, a0: 92 * DEG, a1: 146 * DEG, x: 0.07, pin: 135 * DEG }; // elevating arcs and their pinion's angle
const CASE = { len: 0.23, r: 0.0435, rim: 0.05, seat: 0.03 }; // the brass case and how deep the shell's base sits in it

export function buildFK16({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---------------------------------------------------------------- lower carriage (turns only beyond TOP)
  const carriage = new THREE.Group();
  carriage.name = 'carriage';
  root.add(carriage);
  const L = rig.part();
  for (const s of [-1, 1]) woodWheel(L, s * WX, s);
  // the axle arms into the naves, the axle tree with the saddle's pivot plate
  for (const s of [-1, 1]) L.add('dark', xTube(s * 0.3, s * (WX + 0.1), 0.042, 0.042, 12, WR, 0));
  L.add('camo', rbox(0.62, 0.12, 0.2, 0.02, 0, WR, 0));
  L.add('dark', yTube(WR + 0.06, WR + 0.07, 0.13, 0.13, 20, 0, 0));
  // shoe brakes in front of the wheels on a cross shaft, the brake spindle's crank on the right
  L.add('dark', xTube(-0.72, 0.72, 0.016, 0.016, 8, 0.44, -0.4));
  for (const s of [-1, 1]) {
    const a = 0.32, sx = s * WX, sy = WR - Math.sin(a) * (WR + 0.025), sz = -Math.cos(a) * (WR + 0.025);
    L.add('dark', box(0.085, 0.04, 0.2, sx, sy, sz, -(a - Math.PI / 2)));
    L.add('dark', rod(V(s * 0.7, 0.44, -0.4), V(sx, sy + 0.02, sz + 0.03), 0.012, 5));
    L.add('dark', rod(V(s * 0.45, 0.44, -0.4), V(s * 0.3, WR - 0.02, -0.08), 0.012, 5)); // the hanger to the axle tree
  }
  L.add('dark', yTube(0.44, 0.9, 0.012, 0.012, 6, 0.56, -0.4));
  L.add('steel', rod(V(0.56, 0.9, -0.4), V(0.66, 0.92, -0.4), 0.01, 5));
  trail(L);
  // the lower shield (apron) hung from the axle tree between the wheels
  const apron = [[-0.6, 0.86], [0.6, 0.86], [0.6, 0.5], [0.57, 0.44], [0.5, 0.41], [-0.5, 0.41], [-0.57, 0.44], [-0.6, 0.5]];
  L.add('camo', plate(apron, [], SZ - 0.014, SZ - 0.004));
  L.add('camo', rivetPoly(apron, (u, v) => V(u, v, SZ - 0.015), 0.025, 0.11, V(0, 0, -1), 0.007));
  for (const s of [-1, 1]) L.add('camo', box(0.08, 0.1, 0.24, s * 0.26, WR - 0.02, SZ / 2 - 0.01)); // hangers to the axle tree
  // the two axle seats in front of the shield (the gunners rode on them on the march): pan, backrest, grab handle,
  // footboard, the bracket down to the axle tree
  for (const s of [-1, 1]) {
    const x = s * 0.4, zc = SZ - 0.2;
    L.add('dark', rbox(0.3, 0.035, 0.24, 0.012, x, 0.93, zc));
    L.add('dark', box(0.3, 0.2, 0.025, x, 1.06, SZ - 0.055, -0.12));
    L.add('dark', box(0.04, 0.17, 0.2, x, 0.83, zc + 0.04));
    L.add('dark', rod(V(x, 0.76, zc + 0.12), V(x, 0.72, 0.0), 0.016, 6));
    L.add('steel', rod(V(x + s * 0.15, 0.95, zc - 0.08), V(x + s * 0.15, 1.08, SZ - 0.06), 0.009, 5));
    L.add('wood', box(0.34, 0.025, 0.14, x, 0.47, SZ - 0.38));
    L.add('dark', rod(V(x - 0.12, 0.47, SZ - 0.33), V(x - 0.12, 0.9, zc), 0.01, 5));
    L.add('dark', rod(V(x + 0.12, 0.47, SZ - 0.33), V(x + 0.12, 0.9, zc), 0.01, 5));
  }
  L.build(carriage, { dirt: 0.55 });

  // ---------------------------------------------------------------- the saddle with the upper shield (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  T.add('camo', yTube(WR + 0.07, WR + 0.09, 0.14, 0.14, 20, 0, 0)); // pivot plate on the axle tree
  T.add('camo', box(0.38, 0.03, 0.42, 0, WR + 0.1, 0.0)); // floor plate between the side plates
  // the triangular side plates: from the pivot up to the trunnions at the rear, back to their slide on the trail
  const cheek = [[-0.26, WR + 0.08], [0.62, WR + 0.08], [0.64, WR + 0.15], [0.42, WR + 0.17], [0.35, 1.0], [0.3, 1.13], [0.17, 1.15], [-0.08, 0.92], [-0.26, 0.85]];
  for (const s of [-1, 1]) {
    T.add('camo', sideProfile(cheek, 0.025).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.2, 0, 0)));
    T.add('camo', rod(V(s * 0.2, 0.85, -0.26), V(s * 0.2, 0.92, -0.08), 0.013, 6)); // the flange along the edge
    T.add('camo', rod(V(s * 0.2, 0.92, -0.08), V(s * 0.2, 1.15, 0.17), 0.013, 6));
    T.add('camo', rod(V(s * 0.2, 1.13, 0.3), V(s * 0.2, 1.0, 0.35), 0.013, 6));
    T.add('camo', rod(V(s * 0.2, 1.0, 0.35), V(s * 0.2, WR + 0.17, 0.42), 0.013, 6));
    T.add('camo', rivetRow(V(s * 0.214, WR + 0.12, -0.2), V(s * 0.214, WR + 0.12, 0.58), 0.08, V(s, 0, 0), 0.007));
    T.add('camo', rivetRow(V(s * 0.214, 0.92, -0.04), V(s * 0.214, 1.1, 0.14), 0.07, V(s, 0, 0), 0.007));
    // trunnion bearing and its cap
    T.add('camo', xTube(s * 0.19, s * 0.245, 0.075, 0.075, 18, TR.y, TR.z));
    T.add('dark', box(0.06, 0.025, 0.17, s * 0.215, TR.y + 0.08, TR.z));
    for (const z of [-0.06, 0.06]) T.add('steel', yTube(TR.y + 0.09, TR.y + 0.115, 0.011, 0.011, 6, s * 0.215, TR.z + z));
    // the slide shoe at the plates' rear end, on the trail's slide plate
    T.add('dark', box(0.11, 0.03, 0.14, s * 0.22, WR + 0.085, 0.58));
    // shield brackets on the plates' fronts, the stays from the shield wings
    T.add('camo', box(0.05, 0.22, 0.05, s * 0.2, 0.97, SZ + 0.035));
    T.add('dark', rod(V(s * 0.6, 1.5, SZ + 0.015), V(s * 0.21, 1.02, 0.05), 0.01, 6));
  }
  // the elevating pinions under the arcs, their shaft across, the gear case on the left and the handwheel
  const pz = TR.z + Math.cos(ARC.pin) * (ARC.r1 + 0.035), py = TR.y - Math.sin(ARC.pin) * (ARC.r1 + 0.035);
  T.add('dark', xTube(-0.19, 0.19, 0.016, 0.016, 8, py, pz));
  for (const s of [-1, 1]) T.add('dark', xTube(s * ARC.x - 0.016, s * ARC.x + 0.016, 0.035, 0.035, 12, py, pz));
  T.add('camo', box(0.08, 0.11, 0.13, -0.255, py + 0.03, pz + 0.03));
  T.add('dark', rod(V(-0.29, py + 0.06, pz + 0.06), V(-0.33, 0.98, 0.36), 0.014, 6));
  addHandwheel(T, -0.38, 0.98, 0.38, 0.12, -1);
  T.add('dark', xTube(-0.38, -0.22, 0.014, 0.014, 6, 0.98, 0.38));
  // the traversing handwheel on the left plate's rear, its screw across to the trail's slide
  addHandwheel(T, -0.36, 0.82, 0.55, 0.085, -1);
  T.add('dark', xTube(-0.36, -0.21, 0.014, 0.014, 6, 0.82, 0.55));
  T.add('camo', box(0.07, 0.1, 0.12, -0.245, 0.8, 0.55)); // its worm box on the plate, the screw to the trail inside
  // the sight on the end of the left trunnion: the range drum and the elevation scale, the sight shank with the
  // panoramic telescope on top, and the collimator beside it
  T.add('dark', xTube(-0.29, -0.245, 0.085, 0.085, 18, TR.y, TR.z));
  T.add('steel', xTube(-0.295, -0.29, 0.087, 0.087, 18, TR.y, TR.z));
  T.add('dark', box(0.03, 0.025, 0.05, -0.3, TR.y + 0.09, TR.z));
  T.add('camo', box(0.05, 0.22, 0.06, -0.31, TR.y + 0.12, TR.z - 0.06));
  T.add('dark', box(0.1, 0.035, 0.07, -0.33, TR.y + 0.24, TR.z - 0.06));
  panoramicSight(T, -0.36, TR.y + 0.26, TR.z - 0.06, -1);
  T.add('dark', box(0.05, 0.05, 0.12, -0.31, TR.y + 0.29, TR.z - 0.2));
  T.add('glass', box(0.035, 0.03, 0.004, -0.31, TR.y + 0.29, TR.z - 0.262));
  // the Abweiser: a bar on two stanchions along the left of the recoil path, at the gunner's hip
  T.add('steel', rod(V(-0.27, 0.93, 0.5), V(-0.27, 0.93, 1.05), 0.012, 6));
  T.add('dark', rod(V(-0.27, 0.93, 0.5), V(-0.2, WR + 0.15, 0.5), 0.012, 6));
  T.add('dark', rod(V(-0.27, 0.93, 1.05), V(-0.24, WR + 0.02, 0.98), 0.012, 6));

  // the upper shield: two halves either side of the barrel's slot, narrow between the wheels, wider over them, the
  // top bent back a little; stiffening angles on the back, the rolled top edge, the folding top flap
  const HY = 1.62, BEND = 18 * DEG;
  const bend = new THREE.Matrix4().makeTranslation(0, HY, SZ).multiply(new THREE.Matrix4().makeRotationX(BEND)).multiply(new THREE.Matrix4().makeTranslation(0, -HY, -SZ));
  const up = (g) => g.applyMatrix4(bend);
  const lo = [[0.12, 0.87], [0.69, 0.87], [0.69, 1.34], [0.73, 1.39], [0.82, 1.43], [0.84, HY], [0.12, HY]];
  const hi = [[0.0, HY], [0.84, HY], [0.84, 1.79], [0.8, 1.82], [0.0, 1.82]]; // (one plate across above the hole)
  const side = (poly, s) => { const o = poly.map(([x, y]) => [s * x, y]); return s < 0 ? o.reverse() : o; };
  for (const s of [-1, 1]) {
    const ol = side(lo, s), oh = side(hi, s);
    T.add('camo', plate(ol, [], SZ, SZ + 0.01));
    T.add('camo', up(plate(oh, [], SZ, SZ + 0.01)));
    T.add('camo', up(rod(V(0, 1.825, SZ + 0.005), V(s * 0.8, 1.825, SZ + 0.005), 0.009, 5)));
    T.add('camo', rod(V(s * 0.12, 0.88, SZ + 0.005), V(s * 0.12, HY, SZ + 0.005), 0.009, 5)); // the hole's lip
    T.add('camo', box(0.028, HY - 0.88, 0.028, s * 0.4, (0.88 + HY) / 2, SZ + 0.024));
    T.add('camo', box(0.028, HY - 1.0, 0.028, s * 0.66, (1.0 + HY) / 2, SZ + 0.024));
    T.add('camo', up(box(0.028, 0.19, 0.028, s * 0.4, 1.72, SZ + 0.024)));
    T.add('camo', box(0.66, 0.03, 0.03, s * 0.5, HY - 0.015, SZ + 0.026)); // the angle along the bend
    T.add('camo', rivetPoly(ol, (u, v) => V(u, v, SZ - 0.001), 0.022, 0.1, V(0, 0, -1), 0.007));
    T.add('camo', up(rivetPoly(oh, (u, v) => V(u, v, SZ - 0.001), 0.022, 0.1, V(0, 0, -1), 0.007)));
    const sr = [];
    for (let y = 0.95; y < HY - 0.04; y += 0.1) sr.push(V(s * 0.4, y, SZ - 0.001));
    T.add('camo', rivets(sr, V(0, 0, -1), 0.007));
    // the hinges of the top flap
    for (const x of [0.3, 0.62]) T.add('dark', up(xTube(s * x - 0.04, s * x + 0.04, 0.012, 0.012, 6, 1.83, SZ + 0.01)));
  }
  T.add('camo', rod(V(-0.12, HY - 0.005, SZ + 0.005), V(0.12, HY - 0.005, SZ + 0.005), 0.009, 5)); // the hole's top lip
  // a sight port in the left half, its sliding cover
  T.add('char', new THREE.PlaneGeometry(0.09, 0.06).rotateY(Math.PI).translate(-0.3, 1.38, SZ - 0.002));
  T.add('camo', box(0.13, 0.08, 0.01, -0.35, 1.47, SZ - 0.008));
  T.build(trav, { dirt: 0.45 });

  // ---------------------------------------------------------------- cradle (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TR.y, TR.z);
  const E = rig.part();
  // the cradle: a long box under the barrel, deeper behind where the springs and the buffer lie side by side
  const cyc = (bot) => (CR.top + bot) / 2;
  E.add('camo', rbox(CR.w, CR.top - CR.botF, CR.zs - CR.z0, 0.025, 0, cyc(CR.botF), (CR.z0 + CR.zs) / 2));
  E.add('camo', rbox(CR.w, CR.top - CR.botR, CR.z1 - CR.zs + 0.04, 0.025, 0, cyc(CR.botR), (CR.zs + CR.z1) / 2 - 0.02));
  E.add('camo', loft([
    [V(-CR.w / 2, CR.botF, CR.zs - 0.2), V(CR.w / 2, CR.botF, CR.zs - 0.2), V(CR.w / 2, CR.top - 0.01, CR.zs - 0.2), V(-CR.w / 2, CR.top - 0.01, CR.zs - 0.2)],
    [V(-CR.w / 2, CR.botR, CR.zs + 0.02), V(CR.w / 2, CR.botR, CR.zs + 0.02), V(CR.w / 2, CR.top - 0.01, CR.zs + 0.02), V(-CR.w / 2, CR.top - 0.01, CR.zs + 0.02)],
  ]));
  for (const s of [-1, 1]) {
    E.add('dark', box(0.035, 0.012, CR.z1 - CR.z0 - 0.04, s * 0.07, CR.top + 0.006, (CR.z0 + CR.z1) / 2)); // the ways on top
    E.add('camo', box(0.016, 0.03, CR.z1 - CR.z0 - 0.06, s * (CR.w / 2 + 0.006), CR.top - 0.02, (CR.z0 + CR.z1) / 2)); // top flanges
    E.add('camo', rivetRow(V(s * (CR.w / 2 + 0.015), CR.top - 0.02, CR.z0 + 0.06), V(s * (CR.w / 2 + 0.015), CR.top - 0.02, CR.z1 - 0.05), 0.09, V(s, 0, 0), 0.007));
    for (const z of [-1.7, -1.3, -0.95]) E.add('camo', box(0.01, CR.top - CR.botF - 0.05, 0.035, s * (CR.w / 2 + 0.004), cyc(CR.botF), z)); // stiffeners
    // the trunnion lugs at the rear, the trunnions
    E.add('camo', box(0.025, 0.3, 0.32, s * 0.112, -0.12, -0.02));
    E.add('steel', xTube(s * 0.122, s * 0.19, 0.045, 0.045, 12));
    E.add('camo', rivetRow(V(s * 0.126, 0.0, -0.15), V(s * 0.126, 0.0, 0.11), 0.07, V(s, 0, 0), 0.007));
    // the toothed elevating arcs hung under the cradle, centred on the trunnions
    E.add('camo', gearArc(ARC.r0, ARC.r1, ARC.a0, ARC.a1, 0.025, 20, 0.018).translate(s * ARC.x, 0, 0));
    E.add('camo', box(0.025, 0.07, 0.2, s * ARC.x, -0.29, -0.06)); // the web of the arc to the cradle
  }
  // the front cap of the cradle: the round heads of the buffer's piston rod and the spring column, a filling plug
  E.add('camo', zTube(CR.z0 - 0.05, CR.z0, 0.1, 0.1, 20, 0, cyc(CR.botF)).scale(1, 0.85, 1).translate(0, cyc(CR.botF) * 0.15, 0));
  E.add('dark', zTube(CR.z0 - 0.08, CR.z0 - 0.05, 0.055, 0.065, 14, 0.0, cyc(CR.botF) - 0.02));
  E.add('steel', zTube(CR.z0 - 0.09, CR.z0 - 0.08, 0.02, 0.02, 8, 0.0, cyc(CR.botF) - 0.02));
  // the hole's cover: a plate across the bore behind the shield, above the barrel, closing the shield's hole as the
  // cradle lies low (raised, it swings back under the shield's top)
  E.add('camo', box(0.28, 0.48, 0.008, 0, 0.34, -0.462));
  E.add('camo', box(0.28, 0.02, 0.03, 0, 0.58, -0.45));
  for (const s of [-1, 1]) E.add('camo', rod(V(s * 0.1, 0.14, -0.455), V(s * 0.06, CR.top + 0.01, -0.3), 0.01, 5));
  E.build(el, { dirt: 0.25, y0: TR.y });

  // ---------------------------------------------------------------- barrel (recoil)
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  // the tube: a slight swell at the muzzle, the chase, the jacket with its locking ring at the front
  const J = -1.0;
  B.add('camo', barrel([[MZ + 0.25, 0.0385], [MZ, 0.0385], [MZ, 0.06], [MZ + 0.05, 0.062], [MZ + 0.08, 0.057], [J - 0.06, 0.068], [J - 0.06, 0.08], [J, 0.08], [J, 0.083], [RING0 - 0.1, 0.086], [RING0, 0.087], [RING0, 0.0385], [RING0 - 0.45, 0.0385]], 24));
  B.add('char', new THREE.CircleGeometry(0.0385, 16).rotateY(Math.PI).translate(0, 0, MZ + 0.25));
  // the three hoops with the guide shoes that run on the cradle's ways
  for (const z of [-1.75, -1.02, -0.2]) {
    const r = z < J ? 0.072 : 0.09;
    B.add('camo', zTube(z - 0.05, z + 0.05, r, r, 22));
    for (const s of [-1, 1]) B.add('dark', box(0.04, 0.03, 0.12, s * 0.07, CR.top + 0.027, z));
    B.add('camo', box(0.18, 0.03, 0.08, 0, -r + 0.004 - 0.008, z));
  }
  // the breech ring: the front round the chamber, top, bottom and left walls round the block's slot (open right)
  const sl = BR - RING0 - 0.1, rz = (RING0 + 0.1 + BR) / 2, hw = RG.w / 2;
  const disc = [];
  for (let i = 0; i < 16; i++) disc.push([0.044 * Math.cos(-i / 16 * TAU), 0.044 * Math.sin(-i / 16 * TAU)]);
  B.add('camo', plate([[-hw, RG.bot], [hw, RG.bot], [hw, RG.top], [-hw, RG.top]], [disc], RING0, RING0 + 0.1));
  B.add('camo', rbox(RG.w, 0.06, sl, 0.01, 0, RG.top - 0.03, rz));
  B.add('camo', rbox(RG.w, 0.06, sl, 0.01, 0, RG.bot + 0.03, rz));
  B.add('camo', box(0.05, RG.top - RG.bot - 0.12, sl, -hw + 0.025, (RG.top + RG.bot) / 2, rz));
  B.add('char', zTube(RING0 - 0.45, RING0 + 0.1, 0.0385, 0.044, 16, 0, 0, true).scale(-1, 1, 1));
  B.add('char', new THREE.CircleGeometry(0.0385, 16).translate(0, 0, RING0 - 0.45));
  B.add('camo', rivets([V(-hw - 0.001, RG.top - 0.03, RING0 + 0.04), V(-hw - 0.001, RG.bot + 0.03, RING0 + 0.04), V(-hw - 0.001, RG.top - 0.03, BR - 0.04), V(-hw - 0.001, RG.bot + 0.03, BR - 0.04)], V(-1, 0, 0), 0.01));
  // the lug under the ring and the buffer cylinder that recoils with the gun, its front end inside the cradle
  B.add('camo', box(0.08, 0.1, 0.1, 0, RG.bot - 0.04, RING0 + 0.12));
  B.add('camo', zTube(-1.15, RING0 + 0.1, 0.045, 0.045, 12, 0, -0.19));
  B.add('camo', zTube(RING0 + 0.06, RING0 + 0.16, 0.05, 0.05, 12, 0, -0.19));
  // the striker's housing at the back of the ring on the right, the lanyard's trip lever
  B.add('dark', box(0.05, 0.04, 0.08, -0.07, RG.top + 0.02, BR - 0.07));
  B.add('steel', rod(V(-0.06, RG.top + 0.035, BR - 0.04), V(0.0, RG.top + 0.09, BR - 0.01), 0.008, 5));
  B.build(rc, { dirt: 0.15, y0: TR.y });

  // ---------------------------------------------------------------- the sliding block (breech)
  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  const bw = RG.w - 0.05 - 0.004, bh = RG.top - RG.bot - 0.124;
  K.add('camo', rbox(bw, bh, sl - 0.004, 0.006, 0.025, (RG.top + RG.bot) / 2, 0));
  K.add('dark', zTube(sl / 2 - 0.004, sl / 2 + 0.012, 0.022, 0.022, 10, 0, 0)); // the striker's housing
  K.add('char', new THREE.CircleGeometry(0.007, 8).translate(0, 0, sl / 2 + 0.0125));
  // the single-motion lever on top: its pivot on the block, the handle lying back along the ring
  K.add('dark', box(0.05, 0.05, 0.03, 0.06, RG.top - 0.075, sl / 2 + 0.014));
  K.add('steel', rod(V(0.06, RG.top - 0.06, sl / 2 + 0.03), V(0.09, RG.top + 0.02, sl / 2 + 0.11), 0.011, 6));
  K.add('dark', zTube(sl / 2 + 0.1, sl / 2 + 0.16, 0.016, 0.016, 8, 0.09, RG.top + 0.022));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, 0.15);

  // the saddle turns on the axle within TOP; beyond that the trail is shifted with the handspike, which brings the
  // saddle back to the middle of its arc (fully by 3 TOP), so the detachment's places by the trail hold at any bearing
  rig.setTraverse = (r) => {
    const a = Math.abs(r), rel = a <= TOP ? r : Math.sign(r) * TOP * Math.max(0, 1 - (a - TOP) / (2 * TOP));
    trav.rotation.y = r;
    carriage.rotation.y = r - rel;
  };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 1.55, 0.8);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR);
  // No loading tray: the fixed round went into the open breech in one movement. `tray` (where crews.js lays the round)
  // is on the bore just inside the breech face; the tray prop is the whole round, shell and case.
  rig.anchors.tray = node(el, 'tray', 0, 0, BR - 0.02);
  rig.anchors.shellStack = node(root, 'shellStack', 1.75, 0.1, 1.15); // the ammunition baskets on the right, clear of the trail's swing
  const tr = node(el, 'trayShell', 0, 0, BR - 0.02), round = fixedRound();
  round.position.z = round.userData.len / 2 + 0.02;
  round.visible = false;
  tr.add(round);
  rig.setShell = (where, visible) => { if (where === 'tray' || where === 'crane' || where === 'trolley') round.visible = visible; };
  rig.recoilLength = 1.2; // 1.25 m at most; the cradle shortens it as the gun is raised
  rig.loadEl = 3 * DEG; // GUNS.fk16.loadEl
  // the ring's lower corner (0.2 m off the bore) stays 0.12 m above the ground between the trail's arms
  floorFade(rig, TR.y, BR, 0.2, 0.12, 0.3);
  rig.slideMats = ['camo', 'dark', 'steel', 'char'];
  rig.nest = [[0, -0.19]]; // the buffer cylinder slides into the cradle

  // Six men: the Geschützführer off the left, the layer (Richtkanonier) at the sight and the handwheels on the left,
  // the breech-worker (Verschlusskanonier) left of the breech, the loader with the round on the right, the second
  // ammunition number setting fuzes at the baskets, the man with the lanyard off the right of the breech
  crew(rig, 'officer', -2.0, 1.1, L90, 'point');
  crew(rig, 'layer', -0.66, 0.5, L90, 'lay');
  crew(rig, 'loader', -0.72, 1.45, 0, 'ram');
  crew(rig, 'shell', 0.95, 1.75, R90, 'carry');
  crew(rig, 'ammo', 1.55, 1.75, R90, 'stand');
  crew(rig, 'lanyard', 0.85, 0.85, R90, 'lanyard');

  hb(rig, -0.95, 0, -2.1, 0.95, 1.85, 0.6);
  hb(rig, -0.4, 0, 0.6, 0.4, 0.9, 3.0);
  return finishRig(rig, 'fk16', 'fk16');
}

// ---------------------------------------------------------------- the round

// The fixed round: the shell seated in its brass case, as one Group along the bore (nose to -Z) with its origin at the
// round's middle; userData { len, shellLen, case } (the case's own length).
export function fixedRound() {
  const g = new THREE.Group();
  const sh = buildShell('fk16'), len = sh.length + CASE.len - CASE.seat;
  for (const p of sh.parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.position.z = -len / 2 + sh.length / 2;
    m.castShadow = true;
    g.add(m);
  }
  const c = new THREE.Mesh(caseGeometry(), brassMat());
  c.position.z = len / 2;
  c.castShadow = true;
  g.add(c);
  g.userData = { len, shellLen: sh.length, case: CASE.len };
  return g;
}

let BRASS = null, CASE_G = null;
const brassMat = () => (BRASS ??= new THREE.MeshStandardMaterial({ color: 0xa8843e, roughness: 0.38, metalness: 0.8 }));
// the case with its base at z = 0 and its mouth at -CASE.len: rimmed base, a slight taper, the mouth crimped on the shell
export function caseGeometry() {
  if (CASE_G) return CASE_G;
  const { len, r, rim } = CASE;
  CASE_G = zLathe([[-len, 0.0365], [-len, r * 0.88], [-len + 0.012, r * 0.9], [-len + 0.03, r * 0.97], [-0.012, r], [-0.01, rim], [0, rim], [0, 0.012], [-0.004, 0.012], [-0.004, 0.0001]], 20);
  return CASE_G;
}

// ---------------------------------------------------------------- parts

// A flat plate from a front outline [x, y] with holes, between z0 and z1.
function plate(outline, holes, z0, z1) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 6 });
  return g.translate(0, 0, Math.min(z0, z1));
}

// A cylinder from a (radius r0) to b (radius r1).
function taper(a, b, r0, r1, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// The 1.36 m field gun wheel: twelve painted wooden spokes, dished, a painted felloe and a 70 mm steel tyre, the
// nave with its iron bands and the hub cap. Axis along X.
function woodWheel(P, x, side) {
  const at = (g) => g.applyMatrix4(xf(x, WR, 0));
  const R = WR;
  P.add('dark', at(ring(R - 0.024, R, -0.035, 0.035, 56))); // steel tyre
  for (let i = 0; i < 14; i++) { // the tyre bolts
    const a = (i / 14) * TAU;
    P.add('steel', at(xTube(side * 0.03, side * 0.036, 0.008, 0.008, 5, Math.cos(a) * (R - 0.055), Math.sin(a) * (R - 0.055))));
  }
  P.add('camo', at(ring(R - 0.09, R - 0.024, -0.032, 0.032, 44))); // felloe
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.13, ca = Math.cos(a), sa = Math.sin(a);
    P.add('camo', at(taper(V(side * -0.028, ca * 0.1, sa * 0.1), V(side * 0.004, ca * (R - 0.08), sa * (R - 0.08)), 0.029, 0.02, 7)));
  }
  P.add('camo', at(xTube(-0.13, 0.13, 0.105, 0.097, 18))); // nave
  for (const s of [-1, 1]) P.add('dark', at(xTube(s * 0.105, s * 0.135, 0.113, 0.113, 18))); // its iron bands
  P.add('dark', at(xTube(side * 0.135, side * 0.2, 0.062, 0.048, 14))); // hub cap
  P.add('steel', at(xTube(side * 0.2, side * 0.212, 0.025, 0.025, 6)));
}

// The box trail: two riveted side arms from the axle tree to the trail end, converging and sloping down, open
// between them (the breech recoils down into the gap at high elevation), the slide plates for the saddle, a floor
// at the rear, the end with the spade, the lunette, the handles and the handspike.
function trail(P) {
  const st = [TZ0, 0.7, 1.4, 2.1, TZ1];
  for (const s of [-1, 1]) {
    const sec = (z) => { const a = s * xi(z), b = s * (xi(z) + GW), y0 = yc(z) - gh(z) / 2, y1 = yc(z) + gh(z) / 2; return [V(a, y0, z), V(b, y0, z), V(b, y1, z), V(a, y1, z)]; };
    P.add('camo', loft(st.map(sec)));
    for (const k of [1, -1]) {
      const pts = st.map((z) => V(s * (xi(z) + GW + 0.002), yc(z) + k * (gh(z) / 2 - 0.02), z));
      for (let i = 0; i < pts.length - 1; i++) P.add('camo', rivetRow(pts[i], pts[i + 1], 0.085, V(s, 0, 0), 0.007));
    }
    // lightening holes in the web, both faces
    for (const z of [0.95, 1.5, 2.05]) {
      for (const f of [0, 1]) {
        const hx = s * (xi(z) + f * GW + (f ? 0.002 : -0.002));
        P.add('char', new THREE.CircleGeometry(gh(z) * 0.23, 14).rotateY(s * (f ? 1 : -1) * Math.PI / 2).scale(1, 1, 1.5).translate(hx, yc(z), z));
      }
    }
    // the slide plate the saddle's rear rests on
    P.add('dark', box(GW + 0.06, 0.03, 0.26, s * (xi(0.58) + GW / 2 - 0.02), yc(0.58) + gh(0.58) / 2 + 0.012, 0.58));
    // the arm's front end over the axle tree
    P.add('camo', box(GW, gh(TZ0), 0.12, s * (xi(TZ0) + GW / 2), yc(TZ0), TZ0 - 0.04));
    P.add('steel', new THREE.TorusGeometry(0.04, 0.009, 5, 12).rotateY(Math.PI / 2).translate(s * (xi(2.3) + GW + 0.013), yc(2.3), 2.3));
  }
  // the transom in front, under the saddle (low, clear of the breech's sweep), the floor at the rear
  P.add('camo', box(xi(0.2) * 2, 0.06, 0.08, 0, yc(0.2) - gh(0.2) / 2 + 0.03, 0.2));
  const fl = (z) => [V(-xi(z), yc(z) - gh(z) / 2, z), V(xi(z), yc(z) - gh(z) / 2, z), V(xi(z), yc(z) - gh(z) / 2 + 0.012, z), V(-xi(z), yc(z) - gh(z) / 2 + 0.012, z)];
  P.add('dark', loft([fl(2.15), fl(TZ1)]));
  P.add('camo', box(xi(2.15) * 2, 0.06, 0.06, 0, yc(2.15) - gh(2.15) / 2 + 0.03, 2.15));
  // the trail end: the casting joining the arms, the lunette, the handspike socket and the loop handles
  const ze = TZ1, ye = yc(ze);
  P.add('camo', rbox((xi(ze) + GW) * 2, gh(ze), 0.3, 0.02, 0, ye, ze + 0.13));
  P.add('steel', new THREE.TorusGeometry(0.065, 0.019, 8, 16).rotateX(Math.PI / 2).translate(0, ye - 0.03, ze + 0.36));
  P.add('steel', zTube(ze + 0.26, ze + 0.31, 0.035, 0.035, 10, 0, ye - 0.03));
  for (const s of [-1, 1]) {
    P.add('camo', box(0.12, 0.1, 0.2, s * 0.32, ye + 0.01, ze + 0.1));
    P.add('steel', rod(V(s * 0.38, ye + 0.03, ze + 0.02), V(s * 0.45, ye + 0.03, ze + 0.05), 0.01, 6));
    P.add('steel', rod(V(s * 0.45, ye + 0.03, ze + 0.05), V(s * 0.45, ye + 0.03, ze + 0.17), 0.01, 6));
    P.add('steel', rod(V(s * 0.45, ye + 0.03, ze + 0.17), V(s * 0.38, ye + 0.03, ze + 0.2), 0.01, 6));
  }
  // the spade under the end, raked and dug in, ribbed behind
  P.add('camo', box(0.5, 0.42, 0.022, 0, 0.0, ze + 0.08, -0.3));
  for (const x of [-0.15, 0, 0.15]) P.add('camo', box(0.022, 0.34, 0.09, x, 0.04, ze + 0.14, -0.3));
  // the handspike in its socket, the rammer and sponge staff stowed along the right arm
  P.add('dark', yTube(ye + gh(ze) / 2, ye + gh(ze) / 2 + 0.07, 0.026, 0.026, 8, -0.08, ze - 0.1));
  P.add('wood', yTube(ye + gh(ze) / 2 + 0.07, ye + 0.95, 0.02, 0.016, 7, -0.08, ze - 0.1));
  const a = V(xi(0.9) + GW + 0.025, yc(0.9) + 0.03, 0.9), b = V(xi(2.5) + GW + 0.025, yc(2.5) + 0.03, 2.5);
  P.add('wood', rod(a, b, 0.017, 6));
  for (const z of [1.1, 2.3]) P.add('dark', box(0.045, 0.045, 0.03, xi(z) + GW + 0.02, yc(z) + 0.03, z));
}

import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, rivetRow, handwheel, gearArc, ibeamZ, shellGeometry, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun, pivotAt, hb, trayMount, node } from '../../rig.js';
import { smoothK, clamp01, builtSince, instanceOf, setInstance, curveX, curveYaw } from './heavy_common.js';
import { mulberry32 } from '../../../noise.js';

// 80 cm Kanone (E) "Schwerer Gustav" (Krupp, 1941): the largest gun ever fired in war. Built to the published
// figures (47.3 m long, 11.6 m high, 7.1 m wide, 1,350 t; barrel 32.48 m, L/40.6) and the Sevastopol
// photographs: the long tapered barrel in two sections joined by a collar, the square breech end with its
// horizontal sliding block, the long cradle with the recoil cylinders, the upper carriage's tall side walls
// with the trunnions, the two halves of the lower carriage, each a deep riveted box girder carried on four
// bogie groups of ten axles (two five-axle bogies side by side on the two tracks of its double track), the
// loading platform at the rear with the shell lift (left) and the charge lift (right), walkways, stairs and
// ladders. Details the photographs do not settle (girder depths, the platform's framing, the lifts' lattice)
// are game estimates.
//
// Frames (DESIGN.md "WW2 mode"): `root` y = 0 is the ground; the rail head is rig.railHead (0.55 m) above it (the
// track, sleepers and ballast are buildGustavSite's, placed at the same root). The gun has no traverse of its own: the
// `traverse` pivot sits at the centre of curvature of the firing track, (-R, 0, 0), and everything else hangs
// in `gun` at (+R, 0, 0) inside it, so setTraverse(az) (rotation.y of that pivot) runs the whole gun along its
// curve: the gun's centre at (R cos az - R, 0, -R sin az), turned by az, its long axis tangent to the curve.
// The bogies sit on the curve (shifted and turned under the straight carriage) and their wheels roll with az.
// `elevation` at the trunnions (0 to 48 degrees, loads at 0), `recoil` (1.6 m), `breech` (the sliding block:
// position.x, out to the right), `tray` (cross slide), `hoist` (the shell lift's cage, position.y = floor
// height above the rail head: rig.hoistRange.down at the ammunition wagon's deck, .up at the platform),
// `hoist2` (the charge lift's cage on the right). rig.setAssembly(k) shows the gun being put together.
// `shellStack` is the leading shell on the ammunition wagon coupled behind the gun on the left outer track.

const R = 250; // radius of the firing curve (the gun's centre line)
const RH = 0.55; // the rail head above the ground (root y = 0): the track's sleepers and ballast lie between
const XT = [1.05, 2.85]; // track centres either side of the middle: two double tracks, standard gauge
const GA = 0.7175; // half gauge (rail centre)
const WR = 0.48, AS = 1.3; // wheel radius, axle spacing
const GZ = [-19.6, -12.9, 11.6, 18.3]; // bogie groups along each half (none in the middle: the breech drops there)
const LB = 2.15, LT = 6.6, XI = 1.45, XO = 3.55; // lower carriage halves: bottom, top, inner and outer faces
const ZF = -23.0, ZR = 21.6; // the halves' front and rear ends
const TY = 9.3, TZ = 1.7; // trunnion axis height and station along the gun
const MUZ = -24.0, BRE = 8.5; // barrel ends along the bore (recoil frame, z + = back): 32.5 m
const PY = 8.0, PZ0 = 12.2, PZ1 = 24.8; // the loading platform: deck height and extent
const LX = 2.6, LZ = 23.3, LW = 1.5, LL = 3.0; // the lifts: centre x (either side), centre z, width, length
const LIFT_TOP = 11.6;
const SHELL = { len: 3.75, rad: 0.4 }; // the 4.8 t Sprenggranate
const HOIST = { up: PY, down: 1.22 }; // cage floor at the platform, at the wagon deck
const BX = 1.0, BSLIDE = 2.0; // the breech block's pivot (its right end) and how far it slides out
const WALL = { x: 1.62, w: 0.36 };

export function buildGustav() {
  const rig = newGunRig('gustav', 'dgrau');
  const root = rig.root, rnd = mulberry32(80);
  const mk = () => new Parts(rig.mats);
  const trav = pivotAt(rig, root, 'traverse', -R, RH, 0);
  const gun = node(trav, 'gun', R, 0, 0);
  const S0 = node(gun, 'stage-bogies'), S1 = node(gun, 'stage-lower'), S2 = node(gun, 'stage-upper');
  const elev = pivotAt(rig, gun, 'elevation', 0, TY, TZ);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', BX, 0, BRE - 0.75);
  const hoist = pivotAt(rig, S2, 'hoist', -LX, HOIST.up, LZ);
  const hoist2 = pivotAt(rig, S2, 'hoist2', LX, HOIST.up, LZ);
  rig.curveR = R;
  rig.railHead = RH;
  rig.recoilLength = 1.6;
  rig.loadEl = 0;
  rig.hoistRange = { up: HOIST.up, down: HOIST.down };
  rig.hoistHang = -SHELL.rad - 0.08; // the shell's middle above the cage floor (negative: it rides, not hangs)
  rig.staffLen = 6.2;
  const tray = trayMount(rig, gun, elev, -0.62, BRE + 0.12, 0.62, 2.0, 2.7);

  // ---------------------------------------------------------------- bogies and wheelsets (instanced)
  // one five-axle bogie in its own frame (track along z, rail head y = 0), sixteen of them
  const PBG = mk(), PWS = mk(), PSB = mk();
  {
    const half = 2 * AS + 0.75;
    for (const s of [-1, 1]) {
      const x = s * 0.84;
      PBG.add('camo', box(0.07, 0.55, 2 * half, x, 0.78, 0));
      PBG.add('camo', box(0.16, 0.08, 2 * half, x + s * 0.04, 1.05, 0));
      PBG.add('camo', box(0.16, 0.08, 2 * half, x + s * 0.04, 0.52, 0));
      for (let i = -2; i <= 2; i++) {
        const z = i * AS;
        PBG.add('dark', box(0.2, 0.3, 0.32, x, WR, z)); // axle box
        PBG.add('dark', box(0.08, 0.36, 0.42, x, WR + 0.04, z)); // horn guides
        for (let k = 0; k < 3; k++) PBG.add('dark', box(0.12, 0.025, 0.8 - k * 0.2, x, 0.72 + k * 0.03, z)); // leaf springs
      }
      PBG.add('dark', rivetRow(V(x + s * 0.04, 0.95, -half + 0.2), V(x + s * 0.04, 0.95, half - 0.2), 0.45, V(s, 0, 0), 0.025));
    }
    for (let i = -2; i <= 2; i += 2) PBG.add('camo', box(1.6, 0.18, 0.2, 0, 0.95, i * AS + 0.65)); // cross stays
    PBG.add('camo', box(1.75, 0.32, 1.3, 0, 1.18, 0)); // centre transom with the pivot
    PBG.add('dark', yTube(1.3, 1.42, 0.38, 0.38, 16, 0, 0));
    for (const e of [-1, 1]) PBG.add('dark', box(1.7, 0.22, 0.12, 0, 0.7, e * half)); // headstock
    // a wheelset: axle, two wheels with flanges inside the rails, spoked centres
    PWS.add('steel', xTube(-0.95, 0.95, 0.07, 0.07, 8));
    for (const s of [-1, 1]) {
      PWS.add('steel', xTube(s * (GA - 0.07), s * (GA + 0.07), WR, WR, 22));
      PWS.add('steel', xTube(s * (GA - 0.085), s * (GA - 0.065), WR + 0.035, WR + 0.035, 22));
      PWS.add('dark', xTube(s * (GA - 0.05), s * (GA + 0.05), WR - 0.06, WR - 0.06, 12));
      PWS.add('dark', xTube(s * (GA + 0.02), s * (GA + 0.16), 0.13, 0.11, 10));
    }
    // the span bolster of one group: a deep beam across the side's two bogies (frame centred between them)
    const w = XT[1] - XT[0] + 1.9;
    PSB.add('camo', box(w, 0.62, 1.6, 0, 1.75, 0));
    PSB.add('camo', box(w - 0.4, 0.5, 4.2, 0, 1.82, 0));
    PSB.add('camo', box(w + 0.1, 0.06, 4.3, 0, 2.12, 0));
    for (const e of [-1, 1]) {
      PSB.add('camo', box(w - 0.3, 0.06, 0.12, 0, 1.62, e * 2.05));
      PSB.add('dark', rivetRow(V(-w / 2 + 0.2, 2.05, e * 2.13), V(w / 2 - 0.2, 2.05, e * 2.13), 0.3, V(0, 0, e), 0.03));
    }
    for (const e of [-1, 1]) PSB.add('dark', yTube(1.42, 1.52, 0.42, 0.42, 16, e * (XT[1] - XT[0]) / 2, 0));
  }
  const tmpB = new THREE.Group(), tmpW = new THREE.Group(), tmpS = new THREE.Group();
  PBG.build(tmpB, { dirt: 0.6, y0: 0 });
  PWS.build(tmpW, { dirt: 0.5, y0: WR });
  PSB.build(tmpS, { dirt: 0.4, y0: 0 });
  const bogies = instanceOf(tmpB, 16, S0, 'bogies'), wheels = instanceOf(tmpW, 80, S0, 'wheels'), bolsters = instanceOf(tmpS, 8, S0, 'bolsters');
  // where each bogie stands: on its track's curve at the group's station
  const BOG = []; // { m: Matrix4, xt }
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  {
    let bi = 0, si = 0;
    for (const sd of [-1, 1]) for (const zc of GZ) {
      const xs = [];
      for (const xt0 of XT) {
        const xt = sd * xt0, x = curveX(R, xt, zc), yaw = curveYaw(R, xt, zc);
        const m = new THREE.Matrix4().compose(_p.set(x, 0, zc), _q.setFromEuler(_e.set(0, yaw, 0)), _s);
        setInstance(bogies, bi++, m);
        BOG.push({ m, xt });
        xs.push(x);
      }
      _r.compose(_p.set((xs[0] + xs[1]) / 2, 0, zc), _q.setFromEuler(_e.set(0, curveYaw(R, sd * 1.95, zc), 0)), _s);
      setInstance(bolsters, si++, _r);
    }
  }
  // the wheelsets roll as the gun runs along its curve (each track has its own radius)
  const _w = new THREE.Matrix4(), _wx = new THREE.Matrix4(), _wt = new THREE.Matrix4();
  let lastAz = NaN;
  const roll = (az) => {
    if (az === lastAz) return;
    lastAz = az;
    let wi = 0;
    for (const b of BOG) {
      _wx.makeRotationX(-(az * (R + b.xt)) / WR);
      for (let i = -2; i <= 2; i++) {
        _wt.makeTranslation(0, WR, i * AS);
        _w.multiplyMatrices(b.m, _wt).multiply(_wx);
        for (const im of wheels) im.setMatrixAt(wi, _w);
        wi++;
      }
    }
    for (const im of wheels) im.instanceMatrix.needsUpdate = true;
  };
  roll(0);

  // ---------------------------------------------------------------- the lower carriage: two box girder halves
  const PL = mk();
  const lprof = [[ZR, LB], [8.3, LB], [7.3, 1.45], [-8.9, 1.45], [-9.9, LB], [ZF, LB], [ZF, 4.4], [-18.2, LT], [ZR, LT]];
  for (const s of [-1, 1]) {
    const xc = s * (XI + XO) / 2, w = XO - XI;
    PL.add('camo', sideProfile(lprof, w, 0.02).translate(xc, 0, 0));
    // flanges along the top and the bottom edge, proud of the outer face
    PL.add('camo', box(0.12, 0.14, ZR + 18.2, s * (XO + 0.04), LT - 0.08, (ZR - 18.2) / 2));
    PL.add('camo', box(0.12, 0.14, ZR - 8.3, s * (XO + 0.04), LB + 0.08, (ZR + 8.3) / 2));
    PL.add('camo', box(0.12, 0.14, 16.2, s * (XO + 0.04), 1.52, -0.8));
    PL.add('camo', box(0.12, 0.14, -9.9 - ZF, s * (XO + 0.04), LB + 0.08, (ZF - 9.9) / 2));
    PL.add('dark', rivetRow(V(s * (XO + 0.1), LT - 0.08, -18.0), V(s * (XO + 0.1), LT - 0.08, ZR - 0.2), 0.42, V(s, 0, 0), 0.03));
    PL.add('dark', rivetRow(V(s * (XO + 0.1), 1.52, -8.6), V(s * (XO + 0.1), 1.52, 7.0), 0.42, V(s, 0, 0), 0.03));
    // vertical stiffeners: a panel every 1.5 m, and big gusset plates over each bogie group
    for (let z = ZF + 1.0; z < ZR - 0.3; z += 1.5) {
      const t = z < -18.2 ? 4.4 + (LT - 4.4) * (z - ZF) / (-18.2 - ZF) : LT;
      const bot = z > -8.9 && z < 7.3 ? 1.45 : LB;
      PL.add('camo', box(0.07, t - bot - 0.2, 0.16, s * (XO + 0.03), (t + bot) / 2, z));
    }
    for (const zc of GZ) PL.add('camo', box(0.06, 1.1, 4.6, s * (XO + 0.02), LB + 0.6, zc));
    // manholes and the maker's plate
    for (const z of [-15, -4, 4.5, 16]) PL.add('dark', box(0.04, 0.7, 0.9, s * (XO + 0.02), 4.5, z));
    PL.add('camo', box(XO - XI, 0.06, ZR + 18.2, xc, LT + 0.03, (ZR - 18.2) / 2)); // the walkway plates on top
    for (let z = -17.8; z < ZR; z += 0.6) PL.add('dark', box(XO - XI - 0.3, 0.015, 0.04, xc + s * 0.1, LT + 0.065, z)); // tread
  }
  // the halves are tied together at the front and under the platform (never in the middle: the breech goes there)
  PL.add('camo', box(2 * XI, 3.2, 5.0, 0, LB + 1.6, ZF + 2.5));
  PL.add('camo', box(2 * XI, LT - LB, ZR - PZ0, 0, (LT + LB) / 2, (ZR + PZ0) / 2));
  PL.add('camo', box(2 * XI + 0.1, 0.12, ZR - PZ0, 0, LT, (ZR + PZ0) / 2));
  for (let z = PZ0 + 1; z < ZR; z += 1.6) for (const s of [-1, 1]) PL.add('camo', box(0.06, LT - LB - 0.3, 0.14, s * XI * 0.6, (LT + LB) / 2, PZ0 - 0.03));
  // the slot's lining under the front cradle, and the buffers / coupling at the front end
  for (const s of [-1, 1]) {
    PL.add('steel', zTube(ZF - 0.5, ZF, 0.28, 0.28, 18, s * 2.5, 3.0));
    PL.add('camo', zTube(ZF - 0.3, ZF, 0.18, 0.18, 12, s * 2.5, 3.0));
  }
  PL.add('dark', box(0.4, 0.3, 0.5, 0, 3.0, ZF - 0.2));
  // railings along the walkways (to the stairs at the platform), stairs up to the deck, ladders to the ground
  const rail = (P, x0, z0, x1, z1, y, h = 1.0, step = 1.5) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; P.add('dark', rod(V(x, y, z), V(x, y + h, z), 0.025, 5)); }
    P.add('dark', rod(V(x0, y + h, z0), V(x1, y + h, z1), 0.025, 5));
    P.add('dark', rod(V(x0, y + h * 0.5, z0), V(x1, y + h * 0.5, z1), 0.018, 5));
  };
  for (const s of [-1, 1]) {
    rail(PL, s * (XO - 0.05), -18.0, s * (XO - 0.05), 9.9, LT);
    // stairs from the walkway up to the platform, between the wall's end and the deck
    const sx = s * (XI + XO) / 2 + s * 0.35;
    for (let k = 0; k < 8; k++) PL.add('timber', box(1.1, 0.05, 0.3, sx, LT + 0.17 + k * 0.175, 10.1 + k * 0.27));
    for (const dx of [-0.6, 0.6]) PL.add('camo', rod(V(sx + dx, LT, 9.9), V(sx + dx, PY, PZ0), 0.04, 6));
    PL.add('dark', rod(V(sx + s * 0.6, LT + 1.0, 9.9), V(sx + s * 0.6, PY + 1.0, PZ0), 0.025, 5));
    // ladders to the ground where the halves hang lowest
    for (const z of [-4.0, 4.8]) {
      const x = s * (XO + 0.2);
      for (const dz of [-0.22, 0.22]) PL.add('dark', rod(V(x, 0, z + dz), V(x, LT + 1.0, z + dz), 0.025, 5));
      for (let y = 0.3; y < LT; y += 0.3) PL.add('dark', rod(V(x, y, z - 0.22), V(x, y, z + 0.22), 0.016, 4));
      PL.add('dark', box(0.25, 0.06, 0.06, s * (XO + 0.08), 1.6, z));
      PL.add('dark', box(0.25, 0.06, 0.06, s * (XO + 0.08), 5.6, z));
    }
  }

  // ---------------------------------------------------------------- the upper carriage: side walls with the trunnions
  const PU = mk();
  const wprof = [[-7.4, LT], [-7.4, 7.7], [-3.4, 10.1], [0.2, 10.7], [3.2, 10.7], [6.2, 9.2], [7.9, 7.6], [7.9, LT]];
  for (const s of [-1, 1]) {
    const x = s * WALL.x;
    PU.add('camo', sideProfile(wprof, WALL.w, 0.02).translate(x, 0, 0));
    PU.add('dark', rivetRow(V(x + s * 0.19, LT + 0.25, -7.2), V(x + s * 0.19, LT + 0.25, 7.7), 0.4, V(s, 0, 0), 0.028));
    for (const [z, h] of [[-6.2, 1.6], [-4.0, 3.0], [-1.8, 3.8], [5.2, 2.9], [6.9, 1.4]]) PU.add('camo', box(0.1, h, 0.24, x + s * 0.22, LT + h / 2, z)); // ribs
    // trunnion bearing: a heavy round housing with its cap
    PU.add('camo', xTube(s * (WALL.x - 0.25), s * (WALL.x + 0.34), 0.8, 0.8, 26, TY, TZ));
    PU.add('steel', xTube(s * (WALL.x + 0.33), s * (WALL.x + 0.38), 0.55, 0.55, 22, TY, TZ));
    PU.add('camo', rbox(0.5, 0.35, 1.9, 0.06, x, TY + 0.85, TZ));
    // the base of the wall on the girder: a sole plate with gussets outside
    PU.add('camo', box(0.9, 0.12, 15.3, s * (WALL.x + 0.15), LT + 0.08, 0.25));
    for (let z = -6.5; z < 7.5; z += 1.4) PU.add('camo', box(0.4, 0.5, 0.05, s * (WALL.x + 0.38), LT + 0.33, z));
  }
  PU.add('camo', box(2 * WALL.x - WALL.w, 0.9, 1.6, 0, LT + 0.45, -6.6)); // front cross girder, below the barrel
  // the elevating gear: a cross shaft under the cradle with its pinions, driven by a motor beside the left wall
  const PIN = { y: TY - 3.85, z: TZ, r: 0.3 };
  PU.add('steel', xTube(-XI, XI, 0.1, 0.1, 10, PIN.y, PIN.z));
  for (const s of [-1, 1]) {
    PU.add('iron', xTube(s * 0.62, s * 0.88, PIN.r, PIN.r, 18, PIN.y, PIN.z));
    PU.add('camo', box(0.3, LT - PIN.y + 0.4, 0.5, s * (XI - 0.15), (LT + PIN.y - 0.4) / 2, PIN.z)); // bearing posts on the girders' inner faces
  }
  PU.add('camo', rbox(0.9, 0.8, 1.4, 0.08, -2.6, LT + 0.45, TZ + 3.2)); // elevating motor on the left walkway
  PU.add('steel', xTube(-WALL.x - 0.2, -2.15, 0.08, 0.08, 10, LT + 0.5, TZ + 3.2));
  PU.add('iron', handwheel(0.45, 6, 0.03, 0.07).translate(-2.25, LT + 1.4, TZ + 1.3)); // hand drive for the layer
  PU.add('camo', rbox(0.6, 0.9, 0.6, 0.05, -2.05, LT + 0.9, TZ + 1.3));
  PU.add('camo', box(0.18, 1.6, 0.18, -2.0, LT + 0.8, TZ - 0.6)); // the layer's sight post
  PU.add('dark', zTube(TZ - 0.85, TZ - 0.4, 0.07, 0.06, 10, -2.0, LT + 1.75));
  PU.add('glass', box(0.08, 0.08, 0.04, -2.0, LT + 1.75, TZ - 0.86));
  PU.add('camo', rbox(0.7, 1.0, 0.8, 0.05, 2.4, LT + 0.5, TZ + 1.0)); // the elevation indicator and controller, right
  PU.add('iron', handwheel(0.35, 5, 0.025, 0.06).translate(2.0, LT + 1.2, TZ + 1.0));

  // ---- the loading platform at the rear: deck, planks, framing, railings, transfer rails
  {
    const dh = PY - 0.06, dz = (PZ0 + PZ1) / 2;
    PU.add('camo', box(2 * (LX - LW / 2), 0.12, PZ1 - PZ0, 0, dh, dz)); // middle deck between the lifts
    for (const s of [-1, 1]) {
      PU.add('camo', box(XO - (LX - LW / 2), 0.12, LZ - LL / 2 - PZ0, s * (XO + LX - LW / 2) / 2, dh, (PZ0 + LZ - LL / 2) / 2));
      PU.add('camo', box(XO - (LX + LW / 2), 0.12, LL, s * (XO + LX + LW / 2) / 2, dh, LZ));
    }
    for (let z = PZ0 + 0.15; z < PZ1 - 0.1; z += 0.3) PU.add('timber', box(2 * (LX - LW / 2) - 0.1, 0.035, 0.27, 0, PY + 0.0175, z), { tint: (z * 7.3) % 1 > 0.5 ? 0xffffff : 0xd8cfc0 });
    // framing: posts from the girders and the rear cross structure, beams under the deck
    for (let z = PZ0 + 0.6; z < ZR; z += 2.2) for (const x of [-3.3, -1.7, 1.7, 3.3]) PU.add('camo', box(0.2, PY - LT - 0.12, 0.2, x, (PY + LT - 0.12) / 2, z));
    for (const x of [-3.3, -1.7, 1.7, 3.3]) PU.add('camo', ibeamZ(PZ0, PZ1, 0.3, 0.2, 0.03, x, PY - 0.27));
    for (const x of [-1.7, 1.7]) PU.add('camo', box(0.2, PY - 0.42, 0.2, x, (PY - 0.42) / 2 + 0.0, PZ1 - 0.6)); // rear legs to the ground, behind the bogies
    // the transfer rails: across from the shell lift, then forward along the middle to the tray
    for (const dx of [-0.42, 0.42]) PU.add('steel', box(0.07, 0.06, PZ1 - 0.6 - (PZ0 + 1.6), dx, PY + 0.06, (PZ1 - 0.6 + PZ0 + 1.6) / 2));
    for (const dz of [-0.42, 0.42]) PU.add('steel', box(LX - LW / 2 + 0.1, 0.06, 0.07, -(LX - LW / 2) / 2, PY + 0.06, LZ + dz));
    // railings round the deck, open at the stairs and the lifts
    for (const s of [-1, 1]) rail(PU, s * (XO - 0.05), PZ0 + 1.4, s * (XO - 0.05), LZ - LL / 2 - 0.1, PY);
    rail(PU, -(LX - LW / 2) + 0.1, PZ1 - 0.05, LX - LW / 2 - 0.1, PZ1 - 0.05, PY, 1.0, 1.2);
    // a hand winch at the front edge of the deck for the transfer trolley's rope, and the charge rack (right)
    PU.add('camo', box(1.0, 0.6, 0.6, 0, PY + 0.3, PZ1 - 0.6));
    PU.add('iron', xTube(-0.4, 0.4, 0.18, 0.18, 14, PY + 0.75, PZ1 - 0.6));
    PU.add('camo', box(0.9, 0.9, 2.2, 2.8, PY + 0.45, PZ0 + 3.2));
    for (let k = 0; k < 3; k++) PU.add('dark', box(0.92, 0.04, 2.22, 2.8, PY + 0.2 + k * 0.3, PZ0 + 3.2));
  }
  // ---- the lifts: lattice towers from near the ground to above the deck, a head frame and its motor
  for (const s of [-1, 1]) {
    const x0 = s * (LX - LW / 2), x1 = s * (LX + LW / 2), z0 = LZ - LL / 2, z1 = LZ + LL / 2, y0 = 0.35;
    for (const x of [x0, x1]) for (const z of [z0, z1]) PU.add('camo', box(0.14, LIFT_TOP - 0.4 - y0, 0.14, x, (LIFT_TOP - 0.4 + y0) / 2, z));
    for (let y = y0 + 0.2; y < LIFT_TOP - 0.5; y += 1.6) {
      for (const x of [x0, x1]) PU.add('camo', box(0.08, 0.1, LL, x, y, LZ)); // ties on the long faces only: the shell passes the ends
      if (y + 1.6 < LIFT_TOP - 0.5) PU.add('camo', rod(V(x1, y, z0), V(x1, y + 1.6, z1), 0.035, 5));
      if (y + 1.6 < LIFT_TOP - 0.5) PU.add('camo', rod(V(x0, y, z1), V(x0, y + 1.6, z0), 0.035, 5));
    }
    for (const z of [z0, z1]) { PU.add('camo', box(LW, 0.12, 0.1, s * LX, y0 + 0.1, z)); PU.add('camo', box(LW, 0.14, 0.1, s * LX, LIFT_TOP - 0.45, z)); }
    // guide rails inside, the head frame, the hoisting motor and its sheaves
    for (const z of [z0 + 0.08, z1 - 0.08]) PU.add('steel', box(0.05, LIFT_TOP - 0.6 - y0, 0.05, s * LX, (LIFT_TOP - 0.6 + y0) / 2, z));
    PU.add('camo', box(LW + 0.25, 0.35, LL + 0.25, s * LX, LIFT_TOP - 0.2, LZ));
    PU.add('camo', rbox(0.9, 0.6, 1.1, 0.06, s * LX, LIFT_TOP + 0.25, LZ + 0.6)); // motor housing (the top of the gun: 11.6 m)
    PU.add('iron', xTube(s * LX - 0.3, s * LX + 0.3, 0.32, 0.32, 16, LIFT_TOP + 0.05, LZ - 0.6));
    PU.add('camo', box(0.7, 0.12, 0.7, s * LX, y0 - 0.05, LZ)); // buffer pit at the foot
  }

  // ---------------------------------------------------------------- the lift cages (hoist, hoist2)
  const cage = (P) => {
    P.add('camo', box(LW - 0.2, 0.1, LL - 0.2, 0, -0.05, 0));
    for (const s of [-1, 1]) {
      P.add('dark', rod(V(s * 0.6, 0, -1.3), V(s * 0.6, 1.1, -1.3), 0.03, 5));
      P.add('dark', rod(V(s * 0.6, 0, 1.3), V(s * 0.6, 1.1, 1.3), 0.03, 5));
      P.add('dark', rod(V(s * 0.6, 1.1, -1.3), V(s * 0.6, 1.1, 1.3), 0.03, 5));
      P.add('dark', rod(V(s * 0.6, 0.55, -1.3), V(s * 0.6, 0.55, 1.3), 0.02, 5));
    }
    P.add('camo', box(1.3, 0.14, 0.14, 0, 1.75, 0)); // yoke
    for (const s of [-1, 1]) P.add('dark', rod(V(s * 0.6, 1.1, 0), V(0, 1.75, 0), 0.025, 5));
    for (const s of [-1, 1]) P.add('camo', box(0.5, 0.12, 0.18, s * 0.22, 0.08, 0)); // cradle chocks for the shell
  };
  const PH = mk(), PH2 = mk();
  cage(PH); cage(PH2);

  // ---------------------------------------------------------------- the cradle (elevation frame)
  const PE = mk();
  const CR0 = -9.0, CR1 = 5.3;
  PE.add('camo', rbox(2.5, 2.5, CR1 - CR0, 0.25, 0, 0, (CR0 + CR1) / 2));
  for (const z of [CR0 + 0.05, -5.5, -2.0, 1.5, CR1 - 0.05]) PE.add('camo', rbox(2.6, 2.6, 0.14, 0.06, 0, 0, z));
  for (const s of [-1, 1]) {
    PE.add('steel', xTube(s * 1.2, s * (WALL.x + 0.25), 0.5, 0.5, 22)); // the trunnions
    PE.add('dark', rivetRow(V(s * 1.26, 1.0, CR0 + 0.3), V(s * 1.26, 1.0, CR1 - 0.3), 0.45, V(s, 0, 0), 0.03));
    PE.add('dark', rivetRow(V(s * 1.26, -1.0, CR0 + 0.3), V(s * 1.26, -1.0, CR1 - 0.3), 0.45, V(s, 0, 0), 0.03));
    // the recoil cylinders and recuperators on top and underneath, their front heads proud of the cradle
    for (const y of [1.45, -1.45]) {
      PE.add('camo', zTube(CR0 - 0.4, CR1 - 0.6, 0.3, 0.3, 16, s * 0.62, y));
      PE.add('steel', zTube(CR0 - 0.55, CR0 - 0.35, 0.36, 0.36, 16, s * 0.62, y));
      for (const z of [-6.5, -3.0, 0.5, 3.5]) PE.add('camo', box(0.5, 0.25, 0.3, s * 0.62, y * 0.9, z));
    }
    // the elevating arcs under the cradle, toothed outside, on a deep web
    PE.add('steel', gearArc(3.2, 3.55, 38 * DEG, 94 * DEG, 0.2, 36, 0.07).translate(s * 0.75, 0, 0));
    PE.add('camo', gearArc(1.2, 3.2, 38 * DEG, 94 * DEG, 0.12).translate(s * 0.75, 0, 0));
  }
  PE.add('camo', box(0.4, 0.25, 0.5, 1.0, 1.35, 3.0)); // the clinometer seat
  // ---------------------------------------------------------------- the barrel (recoil frame)
  const PR = mk();
  {
    const p = [[MUZ, 0.4], [MUZ, 0.7], [MUZ + 0.1, 0.73], [MUZ + 0.7, 0.73], [MUZ + 0.8, 0.64]];
    for (let i = 1; i <= 8; i++) { const t = i / 8; p.push([MUZ + 0.8 + (-10.6 - MUZ - 0.8) * t, 0.64 + 0.2 * t]); }
    p.push([-10.6, 0.98], [-9.6, 0.98], [-9.6, 0.92], [5.6, 1.12], [5.6, 0]);
    PR.add('camo', zLathe(p, 40), { tint: 0xd8dadb });
    PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.6, 0.4, 0.4, 28, 0, 0, true));
    PR.add('dark', new THREE.CircleGeometry(0.4, 28).translate(0, 0, MUZ + 0.6));
    for (const z of [-10.5, -9.7]) PR.add('steel', zTube(z - 0.03, z + 0.03, 1.0, 1.0, 40)); // the joint collar's edges
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; PR.add('dark', box(0.1, 0.1, 0.9, Math.cos(a) * 0.99, Math.sin(a) * 0.99, -10.1)); } // its bolts
    // the breech end: a square block 2.7 m across with the slot for the sliding block
    PR.add('camo', rbox(2.7, 2.7, BRE - 5.6, 0.14, 0, 0, (BRE + 5.6) / 2), { tint: 0xd8dadb });
    PR.add('dark', rivetRow(V(-1.2, 1.36, 5.8), V(1.2, 1.36, 5.8), 0.3, V(0, 1, 0), 0.04));
    PR.add('dark', rivetRow(V(-1.2, 1.36, BRE - 0.2), V(1.2, 1.36, BRE - 0.2), 0.3, V(0, 1, 0), 0.04));
    PR.add('dark', box(0.04, 1.75, 0.95, 1.36, 0, BRE - 0.75)); // the slot's mouth on the right
    PR.add('dark', new THREE.CircleGeometry(0.42, 28).translate(0, 0, BRE + 0.004)); // chamber (shut by the block)
    PR.add('steel', box(2.4, 0.1, 0.1, 0, 1.0, BRE + 0.02));
    for (const s of [-1, 1]) PR.add('camo', box(0.4, 0.4, 0.5, s * 0.9, 1.45, 6.4)); // lifting lugs
    PR.add('camo', zTube(4.6, 5.6, 1.2, 1.2, 36)); // the clip that the recoil rods pull on
    for (const y of [1.45, -1.45]) for (const s of [-1, 1]) PR.add('steel', zTube(CR1 - 0.6, 4.8, 0.09, 0.09, 8, s * 0.62, y));
  }
  // the sliding block: a slab through the slot, its operating crank and the firing lock
  const PBR = mk();
  PBR.add('steel', rbox(2.2, 1.7, 0.9, 0.06, -1.1, 0, 0), { tint: 0xc8c8c0 });
  PBR.add('camo', box(0.2, 1.2, 0.7, 0.1, 0, 0));
  PBR.add('dark', xTube(0.2, 0.55, 0.06, 0.06, 8, 0.3, 0.2));
  PBR.add('iron', handwheel(0.32, 5, 0.025, 0.05).translate(0.6, 0.3, 0.2));
  PBR.add('brass', zTube(0.45, 0.6, 0.08, 0.08, 10, -1.0, 0));
  PBR.add('dark', new THREE.TorusGeometry(0.07, 0.015, 6, 12).translate(-1.0, -0.12, 0.62));
  // the loading tray: a long trough on two runners, lined up with the bore
  const PTR = mk();
  {
    const L = 3.95;
    for (const s of [-1, 1]) {
      PTR.add('camo', box(0.36, 0.09, L, s * 0.4, 0, L / 2));
      PTR.add('camo', box(0.09, 0.4, L, s * 0.62, 0.18, L / 2));
      PTR.add('dark', rivetRow(V(s * 0.67, 0.2, 0.2), V(s * 0.67, 0.2, L - 0.2), 0.3, V(s, 0, 0), 0.025));
    }
    for (const z of [0.4, 2.0, 3.6]) PTR.add('camo', box(1.3, 0.12, 0.14, 0, -0.08, z));
    const dy = PY - (TY - 0.62); // the deck below the tray's hinge line
    for (const s of [-1, 1]) PTR.add('camo', box(0.12, -dy - 0.05, 0.12, s * 0.5, (dy - 0.05) / 2, 3.4)); // legs that slide on the deck
    PTR.add('camo', box(1.25, 0.08, 0.3, 0, dy + 0.04, 3.4));
  }

  // ---------------------------------------------------------------- the ammunition wagon and the charge van (coupled behind)
  const PA = mk();
  const wagon = (P, cz, covered) => {
    const L = covered ? 8.4 : 11.0;
    P.add('camo', box(2.7, 0.35, L, 0, 1.0, cz));
    for (const s of [-1, 1]) P.add('camo', box(0.1, 0.5, L, s * 1.36, 0.92, cz));
    for (const e of [-1, 1]) {
      P.add('dark', box(2.8, 0.3, 0.2, 0, 1.0, cz + e * (L / 2 + 0.05)));
      for (const s of [-1, 1]) { P.add('steel', zTube(cz + e * (L / 2 + 0.1), cz + e * (L / 2 + 0.45), 0.08, 0.08, 8, s * 0.9, 1.0)); P.add('steel', zTube(cz + e * (L / 2 + 0.4), cz + e * (L / 2 + 0.48), 0.2, 0.2, 14, s * 0.9, 1.0)); }
      // two-axle bogies
      const bz = cz + e * (L / 2 - 1.8);
      for (const s of [-1, 1]) P.add('dark', box(0.08, 0.35, 2.6, s * 0.84, 0.62, bz));
      P.add('dark', box(1.7, 0.2, 0.5, 0, 0.75, bz));
      for (const az of [-0.8, 0.8]) {
        P.add('steel', xTube(-0.9, 0.9, 0.06, 0.06, 8, WR, bz + az));
        for (const s of [-1, 1]) P.add('steel', xTube(s * (GA - 0.07), s * (GA + 0.07), WR, WR, 18, WR, bz + az));
      }
    }
    if (covered) {
      // a closed van for the cartridges: plank sides, a rounded roof
      P.add('timber', box(2.6, 2.2, L - 0.2, 0, 2.28, cz));
      P.add('camo', box(2.75, 0.12, L, 0, 3.43, cz));
      P.add('camo', xTube(-1.3, 1.3, 0.16, 0.16, 10, 3.47, cz));
      for (const s of [-1, 1]) P.add('dark', box(0.04, 1.8, 1.5, s * 1.31, 2.15, cz));
    } else {
      // a flat wagon with timber cradles for four shells, two by two, nose forward
      for (const z of [-2.8, 2.8]) for (const dz of [-1.2, 1.2]) P.add('timber', box(2.5, 0.22, 0.3, 0, 1.28, cz + z + dz));
      for (const s of [-1, 1]) for (const z of [-2.8, 2.8]) {
        if (s > 0 && z < 0) continue; // the leading shell (anchors.shellStack) is the one crews.js draws and moves
        const g = shellGeometry(SHELL.len, SHELL.rad);
        const t = new THREE.Matrix4().makeTranslation(s * 0.62, 1.39 + SHELL.rad, cz + z);
        P.add('shell', g.body.applyMatrix4(t), { tint: 0xa2aab4 }); P.add('brass', g.band.applyMatrix4(t)); P.add('steel', g.fuze.applyMatrix4(t)); // field grey, as shells.js paints them
      }
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) P.add('dark', box(0.06, 0.7, 0.06, s * 1.36, 1.5, cz - L / 2 + 0.6 + k * 1.95)); // stakes
    }
  };
  // each on its own track: the shells on the left outer, the charges on the right outer, standing on the curve
  const wagS = node(S0, 'wagon-shells'), wagC = node(S0, 'wagon-charges');
  const WZ = 31.4, CZ = 30.2;
  wagS.position.set(curveX(R, -XT[1], WZ), 0, WZ); wagS.rotation.y = curveYaw(R, -XT[1], WZ);
  wagC.position.set(curveX(R, XT[1], CZ), 0, CZ); wagC.rotation.y = curveYaw(R, XT[1], CZ);
  const PC = mk();
  wagon(PA, 0, false);
  wagon(PC, 0, true);

  // ---------------------------------------------------------------- build, stages, props, anchors
  PL.build(S1, { dirt: 0.35, y0: 0 });
  PU.build(S2, { dirt: 0.15, y0: 0 });
  PH.build(hoist, { dirt: 0, y0: HOIST.up }); PH2.build(hoist2, { dirt: 0, y0: HOIST.up });
  const ne = elev.children.length; PE.build(elev, { dirt: 0.05, y0: TY });
  const nr = rec.children.length; PR.build(rec, { dirt: 0.05, y0: TY });
  PBR.build(brc, { dirt: 0.05, y0: TY });
  const nt = tray.children.length; PTR.build(tray, { dirt: 0.05, y0: TY });
  PA.build(wagS, { dirt: 0.4, y0: 0 }); PC.build(wagC, { dirt: 0.4, y0: 0 });
  const stageE = builtSince(elev, ne), stageR = builtSince(rec, nr).concat(builtSince(tray, nt), brc.children.filter((o) => o.isMesh));

  // the lift cables: unit strands scaled from the head frame down to each cage's yoke
  const cmat = rig.mats.chain;
  const cables = [hoist, hoist2].map((h, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, -0.5, 0), cmat);
    g.add(m);
    g.position.set((i ? 1 : -1) * LX, LIFT_TOP - 0.4, LZ);
    S2.add(g);
    return g;
  });

  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.62, 2.0);
  addShellProp(rig, 'hoist', hoist, SHELL.len, SHELL.rad, 0, SHELL.rad + 0.08, 0);
  rig.props.crane = rig.props.hoist;
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, gun, 'eye', 0, TY + 1.6, TZ + 2);
  anchor(rig, wagS, 'shellStack', 0.62, 1.39 + SHELL.rad, -2.8);
  anchor(rig, S2, 'liftShell', -LX, PY + SHELL.rad + 0.08, LZ); // the shell lift's top, where a raised shell lies
  anchor(rig, S2, 'liftCharge', LX, PY + 0.5, LZ);
  anchor(rig, S2, 'liftMid', 0, PY + 0.2 + SHELL.rad, LZ); // on the transfer trolley in the middle of the platform

  // the sliding block runs out to the right; the tray's own idea of its place (rig.setTray) is kept
  rig.setBreech = (k) => {
    brc.position.x = BX + clamp01(k) * BSLIDE;
    rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25)));
  };
  rig.setTraverse = (az) => { trav.rotation.y = az; roll(az); };
  rig.update = () => {
    cables[0].children[0].scale.y = Math.max(0.05, LIFT_TOP - 0.4 - (hoist.position.y + 1.75));
    cables[1].children[0].scale.y = Math.max(0.05, LIFT_TOP - 0.4 - (hoist2.position.y + 1.75));
    rig.trayTilt();
  };
  rig.update();

  // assembly: bogies (rolled in with the wagons), the lower halves, the upper carriage with the cradle and the
  // platform, then the barrel, breech and tray, each lowered into place by the gantry cranes (buildGustavSite)
  const LIFT = 15;
  rig.assembly = 1;
  rig.setAssembly = (k) => {
    rig.assembly = k;
    const st = (i) => clamp01(k * 4 - i);
    const a = st(0), b = st(1), c = st(2), d = st(3);
    S0.visible = a > 0; S0.position.z = (1 - smoothK(0, 1, a)) * 45;
    S1.visible = b > 0; S1.position.y = (1 - smoothK(0, 1, b)) * LIFT;
    S2.visible = c > 0; S2.position.y = (1 - smoothK(0, 1, c)) * LIFT;
    for (const m of stageE) { m.visible = c > 0; m.position.y = (1 - smoothK(0, 1, c)) * LIFT; }
    for (const m of stageR) { m.visible = d > 0; m.position.y = (1 - smoothK(0, 1, d)) * LIFT; }
  };

  // hit boxes (gun frame at az = 0): the lower carriage with its bogies, the upper carriage, the barrel, the platform
  hb(rig, -XO - 0.3, RH, ZF - 0.6, XO + 0.3, RH + LT + 0.2, ZR);
  hb(rig, -2.2, RH + LT, -7.4, 2.2, RH + 10.8, 8.0);
  hb(rig, -1.0, RH + TY - 1.0, TZ + MUZ, 1.0, RH + TY + 1.0, -7.4);
  hb(rig, -XO, RH + LT, PZ0, XO, RH + LIFT_TOP + 0.6, PZ1);

  // crew: root space at az = 0 (the gun frame, the whole gun moves along its curve); y is where the feet stand.
  // Nobody here is a world-frame role: the men ride the gun along the curve with it.
  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI;
  crewSpot(rig, 'chief', 2.7, RH + LT, TZ - 4.0, W, 'point'); // the Geschützführer on the right walkway, abreast the cradle
  crewSpot(rig, 'layer', -2.6, RH + LT, TZ - 0.4, E, 'lay');
  crewSpot(rig, 'elevator', 2.55, RH + LT, TZ + 1.9, W, 'operate');
  crewSpot(rig, 'lanyard', 2.1, RH + PY, PZ0 + 1.0, N, 'lanyard');
  crewSpot(rig, 'loader1', -1.35, RH + PY, PZ0 + 1.3, N, 'carry');
  crewSpot(rig, 'loader2', 1.35, RH + PY, PZ0 + 1.3, N, 'carry');
  crewSpot(rig, 'rammer1', -0.5, RH + PY, PZ0 + 6.6, N, 'ram');
  crewSpot(rig, 'rammer2', 0.5, RH + PY, PZ0 + 6.6, N, 'ram');
  crewSpot(rig, 'rammer3', -0.5, RH + PY, PZ0 + 7.4, N, 'ram');
  crewSpot(rig, 'rammer4', 0.5, RH + PY, PZ0 + 7.4, N, 'ram');
  crewSpot(rig, 'bagman', 1.7, RH + PY, LZ - 1.0, W, 'stand'); // takes the cartridges off the charge lift
  crewSpot(rig, 'lift1', -1.45, RH + PY, LZ - LL / 2 - 0.5, W, 'operate'); // works the shell lift and the transfer trolley
  crewSpot(rig, 'lift2', 3.0, RH + PY, LZ - LL / 2 - 0.55, E, 'operate');
  crewSpot(rig, 'ammoA', -1.6, RH - 0.17, 26.3, E, 'push'); // on the ballast at the wagon: roll the shell into the cage
  crewSpot(rig, 'ammoB', -5.4, RH - 0.17, 27.6, W, 'push');
  crewSpot(rig, 'phone', -6.4, 0, -1.5, E, 'phone'); // the telephonist on the ground beside the bed
  return finishGun(rig);
}

export { buildGustavSite } from './heavy_gustav_site.js';

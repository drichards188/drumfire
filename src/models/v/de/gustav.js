import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, rivetRow, handwheel, gearArc, ibeamZ, ibeamY, shellGeometry, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun, pivotAt, hb, trayMount, node } from '../../rig.js';
import { clamp01, builtSince, instanceOf, setInstance, curveX, curveYaw } from './heavy_common.js';

// 80 cm Kanone (E) "Schwerer Gustav" (Krupp, 1941), as it stood at Duvankoi before Sevastopol in June 1942 and at
// Rügenwalde in 1943 (refs/gustav: the Krupp and Wehrmacht photographs, the 1945 wreck at Auerbach; docs/WW2.md
// section 6). Published figures: 47.3 m long, 7.1 m wide, 11.6 m high, barrel 32.48 m (L/40.6), 40 axles in
// eight five-axle bogies on two parallel tracks, about 1,350 t. Built from the photographs: the long barrel in two
// halves joined by a locking collar ahead of the cradle (a polished slide band shows in front of the cradle), a
// sleeve cradle with four recoil cylinders (two over, two under the barrel) and big trunnion discs, a square
// breech ring with the horizontal sliding block; the two lower carriage halves, each a deep riveted girder with
// a row of openings low in its web and a sloping nose over a low front deck, carried by span bolsters on two
// five-axle bogies front and rear on each track; the upper carriage's side walls with the trunnion bearings,
// galleries and railings round it; the long loading platform behind the breech and the two lift towers at the
// rear corners (shells up on the left, charges on the right), heavy I-section posts with a winding drum on top.
// Finish: Dunkelgrau overall, as in the 1943 colour photographs. Game estimates (no drawing found): girder
// depths, the bogies' pitch and the bolsters' shape, the platform's framing, the lift cages, the trunnion's
// station (set so the breech drops between the halves at high elevation).
//
// Frames (DESIGN.md "WW2 mode"): `root` y = 0 is the ground; the rail head is rig.railHead (0.55 m) above it (the
// track, sleepers and ballast are buildGustavSite's, placed at the same root). The gun has no traverse of its own: the
// `traverse` pivot sits at the centre of curvature of the firing track, (-R, 0, 0), and everything else hangs
// in `gun` at (+R, 0, 0) inside it, so setTraverse(az) (rotation.y of that pivot) runs the whole gun along its
// curve: the gun's centre at (R cos az - R, 0, -R sin az), turned by az, its long axis tangent to the curve.
// The bogies and their span bolsters sit on the curve under the straight carriage; the wheels roll with az.
// `elevation` at the trunnions (0 to 48 degrees, loads at 0), `recoil` (1.6 m), `breech` (the sliding block:
// position.x, out to the right), `tray` (cross slide), `hoist` (the shell lift's cage, position.y = floor
// height above the rail head: rig.hoistRange.down at the ammunition wagon's deck, .up at the platform),
// `hoist2` (the charge lift's cage on the right). rig.setAssembly(k) shows the gun being put together.
// `shellStack` is the leading shell on the ammunition wagon standing behind the gun on the left track.

const R = 250; // radius of the firing curve (the gun's centre line)
const RH = 0.55; // the rail head above the ground (root y = 0): the track's sleepers and ballast lie between
const TRACK_X = 2.4; // two parallel standard-gauge tracks (buildGustavSite lays them at the same centres)
const GA = 0.7175; // half gauge (rail centre)
const WR = 0.5, AS = 1.25, BL = 6.4; // wheels 1.0 m, axle pitch, bogie frame length (five axles)
const GZ = [-13.4, -6.7, 6.7, 13.4]; // bogie centres along each half: a pair under each span bolster
const ZH = 20.95, ZB = 21.5; // the headstocks and the buffer faces (+-): 43 m over buffers
const XI = 1.5, XO = 3.55; // the girders' inner and outer faces (7.1 m overall)
const LB = 2.4, LT = 5.0; // girder underside (on the bolsters) and top (the lower deck)
const NZ0 = -16.5, NY0 = 3.0, NZ1 = -11.0; // the nose: the girder's top runs up from (NZ0, NY0) to (NZ1, LT)
const GR = 16.5; // the girders' rear ends: the lift shafts stand behind them
const SK = 0.3; // depth of the openings in the girders' outer webs
const TY = 8.1, TZ = 0.7; // trunnion axis height and station
const BRE = 6.0, MUZ = BRE - 32.48; // barrel ends along the bore (recoil frame, z + = back): 32.48 m
const CR0 = -7.5, CR1 = 2.2; // the cradle sleeve (elevation frame)
const PY = TY - 1.3, PZ0 = 8.6, PZ1 = 21.1; // the loading platform: deck height and extent
const LX = 2.4, LZ = 18.8, LW = 1.5, LL = 3.9; // the lifts: centre x (either side), centre z, cage width, length
const PX = 1.0; // lift tower posts at LX +- PX
const HEAD = 10.6, LIFT_TOP = 11.6; // the towers' head frame and the top of the winding drums (the 11.6 m height)
const GAL = 3.3; // the upper carriage's galleries reach out to here (nearly flush with the girders, as photographed)
const SHELL = { len: 3.75, rad: 0.4 }; // the 4.8 t Sprenggranate
const HOIST = { up: PY, down: 1.45 }; // cage floor at the platform, at the wagon deck (over the buffer beam)
const BX = 1.0, BSLIDE = 2.0; // the breech block's pivot (its right end) and how far it slides out
const WALL = { x: 1.95, w: 0.4 };
const GREY = 0x9c9e98; // stencilled data panels (light grey on Dunkelgrau)

// the girder's top at station z (the nose ramp, then the deck)
const topAt = (z) => (z >= NZ1 ? LT : z <= NZ0 ? NY0 : NY0 + ((z - NZ0) * (LT - NY0)) / (NZ1 - NZ0));

export function buildGustav() {
  const rig = newGunRig('gustav', 'dgrau');
  const root = rig.root;
  const mk = () => new Parts(rig.mats);
  const trav = pivotAt(rig, root, 'traverse', -R, RH, 0);
  const gun = node(trav, 'gun', R, 0, 0);
  const S0 = node(gun, 'stage-bogies'), S1L = node(gun, 'girder-left'), S1R = node(gun, 'girder-right'), S2 = node(gun, 'stage-upper');
  const elev = pivotAt(rig, gun, 'elevation', 0, TY, TZ);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', BX, 0, BRE - 0.75);
  const hoist = pivotAt(rig, S2, 'hoist', -LX, HOIST.up, LZ);
  const hoist2 = pivotAt(rig, S2, 'hoist2', LX, HOIST.up, LZ);
  rig.curveR = R;
  rig.railHead = RH;
  // the barrel recoils 3 m in the cradle on its four hydraulic cylinders (refs/gustav: two sources give 3 m); at low
  // elevation the stroke is held short, or the breech ring would run into the loading platform's front edge
  rig.recoilLength = 3.0;
  rig.recoilFade = (el) => 0.53 + 0.47 * clamp01((el - 0.2) / 0.13);
  rig.loadEl = 0;
  rig.hoistRange = { up: HOIST.up, down: HOIST.down };
  rig.hoistHang = -SHELL.rad - 0.08; // the shell's middle above the cage floor (negative: it rides, not hangs)
  rig.staffLen = 6.2;
  const tray = trayMount(rig, gun, elev, -0.62, BRE + 0.12, 0.62, 2.0, 2.7);

  // railings: posts every `step`, a top rail and a knee rail
  const rail = (P, x0, z0, x1, z1, y, h = 1.0, step = 1.5) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; P.add('dark', rod(V(x, y, z), V(x, y + h, z), 0.024, 5)); }
    P.add('dark', rod(V(x0, y + h, z0), V(x1, y + h, z1), 0.026, 5));
    P.add('dark', rod(V(x0, y + h * 0.5, z0), V(x1, y + h * 0.5, z1), 0.018, 5));
  };
  // a sloping handrail (stairs, the nose ramps): from a to b, posts at the ends and between
  const slopeRail = (P, a, b, h = 1.0, n = 3) => {
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); P.add('dark', rod(p, V(p.x, p.y + h, p.z), 0.024, 5)); }
    P.add('dark', rod(V(a.x, a.y + h, a.z), V(b.x, b.y + h, b.z), 0.026, 5));
  };
  // a ladder up a face whose normal is along x (rungs along z)
  const ladder = (P, x, z, y0, y1, w = 0.44) => {
    for (const dz of [-w / 2, w / 2]) P.add('dark', rod(V(x, y0, z + dz), V(x, y1, z + dz), 0.024, 5));
    for (let y = y0 + 0.3; y < y1 - 0.05; y += 0.3) P.add('dark', rod(V(x, y, z - w / 2), V(x, y, z + w / 2), 0.016, 4));
  };
  // a steep stair (Treppe) along z from (z0, y0) to (z1, y1), treads across x0..x1, stringers and a rail on the outside
  const stair = (P, x0, x1, z0, y0, z1, y1, out) => {
    const n = Math.max(3, Math.round((y1 - y0) / 0.22));
    for (let k = 1; k < n; k++) { const t = k / n; P.add('dark', box(Math.abs(x1 - x0) - 0.1, 0.04, 0.26, (x0 + x1) / 2, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t)); }
    for (const x of [x0, x1]) P.add('camo', rod(V(x, y0, z0), V(x, y1, z1), 0.05, 4));
    slopeRail(P, V(out, y0, z0), V(out, y1, z1), 1.0, 2);
  };

  // ---------------------------------------------------------------- bogies, wheelsets and span bolsters (instanced)
  // one five-axle bogie in its own frame (track along z, rail head y = 0), eight of them
  const PBG = mk(), PWS = mk(), PSB = mk();
  {
    const half = BL / 2, ax = [-2, -1, 0, 1, 2].map((i) => i * AS);
    for (const s of [-1, 1]) {
      const x = s * 0.93; // plate frames outside the wheels
      PBG.add('camo', box(0.06, 0.3, BL - 0.1, x, 1.0, 0)); // top member
      PBG.add('camo', box(0.18, 0.06, BL - 0.1, x - s * 0.06, 1.14, 0));
      for (let i = 0; i < 4; i++) PBG.add('camo', box(0.06, 0.3, AS - 0.5, x, 0.5, (ax[i] + ax[i + 1]) / 2)); // bottom members between the horns
      for (const e of [-1, 1]) PBG.add('camo', box(0.06, 0.7, 0.5, x, 0.72, e * (half - 0.25))); // frame ends
      for (const z of ax) {
        PBG.add('dark', box(0.26, 0.34, 0.36, x, WR, z)); // axle box
        PBG.add('dark', box(0.08, 0.5, 0.5, x + s * 0.02, WR + 0.02, z)); // horn guides
        for (let k = 0; k < 4; k++) PBG.add('dark', box(0.13, 0.026, 0.86 - k * 0.17, x, 0.73 + k * 0.03, z)); // leaf spring
        PBG.add('dark', box(0.1, 0.12, 0.12, x - s * 0.13, WR, z - s * 0.0 + 0.52)); // brake block
      }
      PBG.add('dark', rivetRow(V(x + s * 0.035, 1.05, -half + 0.15), V(x + s * 0.035, 1.05, half - 0.15), 0.32, V(s, 0, 0), 0.022));
    }
    for (const e of [-1, 1]) PBG.add('camo', box(2.0, 0.3, 0.16, 0, 0.92, e * half)); // headstocks
    for (const z of [-1.9, 1.9]) PBG.add('camo', box(1.8, 0.16, 0.2, 0, 1.0, z)); // cross stays
    PBG.add('camo', box(1.9, 0.3, 0.9, 0, 1.08, 0)); // centre transom
    PBG.add('dark', yTube(1.23, 1.4, 0.42, 0.42, 18, 0, 0)); // the pivot bowl the span bolster bears on
    // a wheelset: axle, two wheels (rim, web, hub) with flanges inside the rails
    PWS.add('steel', xTube(-1.0, 1.0, 0.075, 0.075, 8));
    for (const s of [-1, 1]) {
      PWS.add('steel', xTube(s * (GA - 0.07), s * (GA + 0.07), WR, WR, 24));
      PWS.add('steel', xTube(s * (GA - 0.085), s * (GA - 0.065), WR + 0.035, WR + 0.035, 24));
      PWS.add('dark', xTube(s * (GA - 0.045), s * (GA + 0.045), WR - 0.07, WR - 0.07, 14));
      PWS.add('dark', xTube(s * (GA + 0.02), s * (GA + 0.15), 0.14, 0.11, 10));
    }
    // the span bolster (Zwischenträger): a box beam over two bogies, carrying a girder on its centre pivot
    const L = 6.7 + BL, h0 = 1.42, h1 = LB - 0.04;
    PSB.add('camo', sideProfile([[-L / 2, h1], [L / 2, h1], [L / 2, h1 - 0.4], [L / 2 - 1.2, h0], [-L / 2 + 1.2, h0], [-L / 2, h1 - 0.4]], 1.8, 0.02));
    for (const s of [-1, 1]) {
      PSB.add('camo', box(0.12, 0.08, L, s * 0.92, h1 - 0.04, 0)); // top flanges
      for (let z = -L / 2 + 1.4; z < L / 2 - 1.3; z += 0.85) PSB.add('camo', box(0.05, h1 - h0 - 0.12, 0.12, s * 0.925, (h0 + h1) / 2, z)); // ribs
      PSB.add('dark', rivetRow(V(s * 0.98, h1 - 0.04, -L / 2 + 0.2), V(s * 0.98, h1 - 0.04, L / 2 - 0.2), 0.36, V(s, 0, 0), 0.022));
    }
    for (const e of [-1, 1]) PSB.add('dark', yTube(h0 - 0.05, h0 + 0.02, 0.38, 0.38, 18, 0, e * 3.35)); // bearers on the bogie pivots
    PSB.add('dark', yTube(h1, LB + 0.02, 0.55, 0.55, 20, 0, 0)); // the girder's centre pivot
  }
  const tmpB = new THREE.Group(), tmpW = new THREE.Group(), tmpS = new THREE.Group();
  PBG.build(tmpB, { dirt: 0.6, y0: 0 });
  PWS.build(tmpW, { dirt: 0.5, y0: WR });
  PSB.build(tmpS, { dirt: 0.45, y0: 0 });
  const bogies = instanceOf(tmpB, 8, S0, 'bogies'), wheels = instanceOf(tmpW, 40, S0, 'wheels'), bolsters = instanceOf(tmpS, 4, S0, 'bolsters');
  // where each bogie stands: on its track's curve at its station; each pair's span bolster on the chord between
  const BOG = [], bolHome = []; // { m: Matrix4, xt }; the bolsters' built matrices
  const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  {
    let bi = 0, si = 0;
    for (const sd of [-1, 1]) {
      const xt = sd * TRACK_X, at = GZ.map((z) => ({ x: curveX(R, xt, z), z }));
      GZ.forEach((zc, i) => {
        const m = new THREE.Matrix4().compose(_p.set(at[i].x, 0, zc), _q.setFromEuler(_e.set(0, curveYaw(R, xt, zc), 0)), _s);
        setInstance(bogies, bi++, m);
        BOG.push({ m, xt });
      });
      for (const [a, b] of [[at[0], at[1]], [at[2], at[3]]]) {
        const m = new THREE.Matrix4().compose(_p.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2), _q.setFromEuler(_e.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0)), _s);
        setInstance(bolsters, si++, m);
        bolHome.push(m);
      }
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

  // ---------------------------------------------------------------- the lower carriage: two girder halves
  // each half comes on its own wagons and is lowered onto its bogie units on its own (gustav_works.js)
  const PLL = mk(), PLR = mk();
  let PL = PLL;
  const AZ0 = -13.2, PITCH = 1.2; // the row of openings low in the outer web: from here back, a post every PITCH
  const AY0 = LB + 0.28, AY1 = LB + 1.25; // the openings' bottom and top
  for (const s of [-1, 1]) {
    PL = s < 0 ? PLL : PLR;
    const xs = (x) => s * x; // mirror
    // the core: the girder less the outer skin's depth
    PL.add('camo', sideProfile([[GR, LB], [NZ0, LB], [NZ0, NY0], [NZ1, LT], [GR, LT]], XO - SK - XI, 0.02).translate(xs((XI + XO - SK) / 2), 0, 0));
    // the outer skin: a bottom strip, the posts between the openings, the plain upper band (following the nose)
    PL.add('camo', box(SK, AY0 - LB, GR - NZ0, xs(XO - SK / 2), (LB + AY0) / 2, (GR + NZ0) / 2));
    PL.add('camo', sideProfile([[AZ0, AY0], [NZ0, AY0], [NZ0, NY0], [AZ0, topAt(AZ0)]], SK, 0.01).translate(xs(XO - SK / 2), 0, 0));
    PL.add('camo', sideProfile([[GR, AY1], [AZ0, AY1], [AZ0, topAt(AZ0)], [NZ1, LT], [GR, LT]], SK - 0.06, 0.01).translate(xs(XO - SK / 2 - 0.03), 0, 0));
    for (let z = AZ0; z <= GR + 0.01; z += PITCH) {
      PL.add('camo', box(SK, AY1 - AY0, 0.32, xs(XO - SK / 2), (AY0 + AY1) / 2, Math.min(z, GR - 0.16)));
      // the openings' arched heads: haunches in the top corners
      if (z + PITCH < GR) for (const d of [0.16, PITCH - 0.16]) PL.add('camo', box(SK - 0.04, 0.22, 0.22, xs(XO - SK / 2), AY1 - 0.06, z + d, Math.PI / 4, 0, 0));
      if (z + PITCH < GR) PL.add('dark', box(0.03, AY1 - AY0, PITCH - 0.3, xs(XO - SK - 0.01), (AY0 + AY1) / 2, z + PITCH / 2)); // the dark inside
      // stiffeners on the upper band over each post
      if (z > NZ1 - 0.5) PL.add('camo', box(0.06, LT - AY1 - 0.16, 0.14, xs(XO - 0.03), (AY1 + LT) / 2 - 0.04, z));
    }
    // flange angles along the top and bottom edges with their rivets; the nose's sloping edge
    PL.add('camo', box(0.12, 0.13, GR - NZ1, xs(XO - 0.06), LT - 0.065, (GR + NZ1) / 2));
    PL.add('camo', box(0.12, 0.13, GR - NZ0, xs(XO - 0.06), LB + 0.065, (GR + NZ0) / 2));
    PL.add('camo', rod(V(xs(XO - 0.06), NY0 - 0.065, NZ0), V(xs(XO - 0.06), LT - 0.065, NZ1), 0.075, 4));
    PL.add('dark', rivetRow(V(xs(XO + 0.0), LT - 0.07, NZ1 + 0.2), V(xs(XO + 0.0), LT - 0.07, GR - 0.2), 0.36, V(s, 0, 0), 0.026));
    PL.add('dark', rivetRow(V(xs(XO + 0.0), LB + 0.07, NZ0 + 0.2), V(xs(XO + 0.0), LB + 0.07, GR - 0.2), 0.36, V(s, 0, 0), 0.026));
    PL.add('dark', rivetRow(V(xs(XO + 0.0), AY1 + 0.08, AZ0), V(xs(XO + 0.0), AY1 + 0.08, GR - 0.2), 0.36, V(s, 0, 0), 0.022));
    // diagonal stiffeners on the nose's sloping top plate (the two inclined plates of the front view)
    for (const dx of [0.45, 1.6]) PL.add('camo', rod(V(xs(XI + dx), NY0 + 0.05, NZ0 + 0.3), V(xs(XI + dx), LT + 0.05, NZ1), 0.07, 4));
    // the power cables from the generator back along the upper band to the upper carriage, in clips
    PL.add('dark', rod(V(xs(XO + 0.05), LT - 0.42, NZ1 + 0.4), V(xs(XO + 0.05), LT - 0.42, 4.0), 0.035, 5));
    PL.add('dark', rod(V(xs(XO + 0.05), LT - 0.42, NZ1 + 0.4), V(xs(XO + 0.05), NY0 - 0.3, NZ0 + 0.6), 0.035, 5));
    for (let z = NZ1 + 1.2; z < 4.0; z += 1.2) PL.add('dark', box(0.06, 0.12, 0.05, xs(XO + 0.03), LT - 0.42, z));
    // inner web: stiffeners where it faces the other half
    for (let z = -10; z < GR; z += 2.4) PL.add('camo', box(0.07, LT - LB - 0.3, 0.14, xs(XI - 0.035), (LT + LB) / 2, z));
    // access doors and the maker's plates on the upper band, stencilled data panels
    for (const z of [-7.9, 1.7, 11.3]) PL.add('dark', rbox(0.04, 0.72, 0.62, 0.015, xs(XO + 0.005), (AY1 + LT) / 2, z));
    PL.add('white', box(0.02, 0.32, 0.9, xs(XO + 0.01), AY1 + 0.42, -4.3), { tint: GREY });
    PL.add('white', box(0.02, 0.24, 0.6, xs(XO + 0.01), AY1 + 0.36, 7.1), { tint: GREY });
    // the deck on top: plates with a tread pattern, and the nose's cleats
    PL.add('camo', box(XO - XI, 0.04, GR - NZ1, xs((XI + XO) / 2), LT + 0.02, (GR + NZ1) / 2));
    for (let z = NZ1 + 0.3; z < GR; z += 0.5) PL.add('dark', box(XO - XI - 0.3, 0.014, 0.035, xs((XI + XO) / 2), LT + 0.045, z));
    for (let z = NZ0 + 0.4; z < NZ1 - 0.1; z += 0.38) PL.add('dark', box(XO - XI - 0.5, 0.05, 0.05, xs((XI + XO) / 2), topAt(z) + 0.04, z));
    rail(PL, xs(XO - 0.06), NZ1, xs(XO - 0.06), PZ0 - 0.2, LT);
    slopeRail(PL, V(xs(XO - 0.06), NY0, NZ0 + 0.1), V(xs(XO - 0.06), LT, NZ1), 1.0, 3);
    // ladders to the ground in the middle, where no bogie is under the girder
    for (const z of [-2.4, 2.6]) ladder(PL, xs(XO + 0.08), z, -0.4, LT + 1.0);

    // the low front deck ahead of the nose, its headstock, buffers and coupling
    const FD = -16.8, fx = (XI + XO) / 2 - 0.02, fz = (FD - ZH) / 2; // the deck stops short of the front bogie
    PL.add('camo', box(XO - XI - 0.04, 1.4, FD - (-ZH), xs(fx), 1.5, fz));
    PL.add('camo', box(XO - XI, 0.06, FD + ZH, xs(fx), 2.23, fz));
    for (let z = -ZH + 0.3; z < FD; z += 0.45) PL.add('dark', box(XO - XI - 0.3, 0.014, 0.035, xs(fx), 2.27, z));
    PL.add('camo', box(XO - XI + 0.04, 0.75, 0.2, xs(fx), 1.12, -ZH + 0.1)); // headstock
    for (let z = -ZH + 0.6; z < FD - 0.2; z += 0.9) PL.add('camo', box(0.06, 1.25, 0.12, xs(XO - 0.01), 1.5, z));
    PL.add('dark', rivetRow(V(xs(XO + 0.0), 2.12, -ZH + 0.2), V(xs(XO + 0.0), 2.12, FD - 0.2), 0.32, V(s, 0, 0), 0.024));
    for (const d of [-0.875, 0.875]) {
      const bx = xs(TRACK_X) + d;
      PL.add('steel', zTube(-ZB + 0.06, -ZH, 0.11, 0.11, 12, bx, 1.06));
      PL.add('camo', zTube(-ZH - 0.3, -ZH, 0.17, 0.17, 12, bx, 1.06));
      PL.add('steel', zTube(-ZB, -ZB + 0.06, 0.24, 0.24, 18, bx, 1.06));
    }
    PL.add('dark', box(0.26, 0.2, 0.4, xs(TRACK_X), 1.06, -ZH - 0.2)); // coupling hook
    rail(PL, xs(XO - 0.06), -ZH + 0.15, xs(XO - 0.06), NZ0 + 0.05, 2.26, 1.0, 1.4);
    rail(PL, xs(XO - 0.06), -ZH + 0.15, xs(XI + 0.1), -ZH + 0.15, 2.26, 1.0, 1.0);
    PL.add('camo', rbox(1.1, 0.75, 0.8, 0.04, xs(2.8), 2.63, -19.3)); // tool chests
    PL.add('dark', box(1.12, 0.05, 0.05, xs(2.8), 2.7, -19.71));
    if (s < 0) {
      // the generator set's housing on the left front deck (the gun carried its own electric plant)
      PL.add('camo', rbox(1.6, 1.4, 2.2, 0.06, xs(2.45), 2.95, -17.6));
      for (let k = 0; k < 6; k++) PL.add('dark', box(0.02, 0.05, 1.2, xs(3.255), 2.65 + k * 0.12, -17.6));
      PL.add('dark', yTube(3.65, 4.3, 0.08, 0.08, 8, xs(2.0), -17.0)); // exhaust
    } else PL.add('camo', rbox(1.1, 0.75, 0.8, 0.04, xs(2.8), 2.63, -17.6));
    ladder(PL, xs(XO + 0.08), -ZH + 0.9, -0.4, 2.26);

    // the rear frame behind the girder, round the lift shaft: side members, the headstock and buffers
    const r0 = 16.72, rz = (r0 + ZH) / 2; // (clear of the rear bogie's headstock)
    PL.add('camo', box(0.25, 0.85, ZH - r0, xs(XO - 0.125), 1.17, rz));
    PL.add('camo', box(0.25, 0.85, ZH - r0, xs(XI - 0.1), 1.17, rz));
    PL.add('camo', box(XO - XI + 0.225, 0.8, 0.2, xs((XI + XO) / 2 - 0.1125), 1.1, ZH - 0.1));
    PL.add('camo', box(XO - XI + 0.2, 0.15, 0.25, xs(TRACK_X), 1.0, LZ)); // a cross bearer under the shaft with its buffer stop
    PL.add('dark', box(LW - 0.1, 0.08, 0.5, xs(TRACK_X), 1.11, LZ));
    for (const d of [-0.875, 0.875]) {
      const bx = xs(TRACK_X) + d;
      PL.add('steel', zTube(ZH, ZB - 0.06, 0.11, 0.11, 12, bx, 1.06));
      PL.add('camo', zTube(ZH, ZH + 0.3, 0.17, 0.17, 12, bx, 1.06));
      PL.add('steel', zTube(ZB - 0.06, ZB, 0.24, 0.24, 18, bx, 1.06));
    }
    PL.add('dark', box(0.26, 0.2, 0.4, xs(TRACK_X), 1.06, ZH + 0.2));
  }
  // the halves tied together at the nose (a cross girder with lightening holes) and under the platform
  // (never in the middle: the breech goes down there at high elevation); the ties come with the right half
  PL = PLR;
  PL.add('camo', box(2 * XI, 1.4, 3.5, 0, LB + 0.7, NZ0 + 1.75));
  for (const x of [-0.75, 0.75]) {
    PL.add('dark', new THREE.CircleGeometry(0.3, 20).rotateY(Math.PI).translate(x, LB + 0.62, NZ0 - 0.005));
    PL.add('camo', new THREE.TorusGeometry(0.32, 0.035, 6, 20).translate(x, LB + 0.62, NZ0 - 0.01));
  }
  PL.add('camo', box(2 * XI, PY - 0.3 - LB, GR - 9.4, 0, (PY - 0.3 + LB) / 2, (GR + 9.4) / 2));
  for (let x = -1.2; x <= 1.21; x += 0.8) PL.add('camo', box(0.12, PY - 0.5 - LB, 0.06, x, (PY - 0.3 + LB) / 2, 9.37));
  PL.add('dark', rivetRow(V(-1.4, PY - 0.42, 9.36), V(1.4, PY - 0.42, 9.36), 0.3, V(0, 0, -1), 0.026));

  // ---------------------------------------------------------------- the upper carriage: side walls with the trunnions, galleries
  const PU = mk(), PCAP = mk();
  // half a tube along x (the upper or the lower half), for the bearings that open to take the trunnions
  const halfX = (x0, x1, r, seg, y, z, up) => new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), seg, 1, false, up ? 0 : Math.PI, Math.PI).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z);
  // the walls stand no higher than the barrel's axis (the cradle rides above them in the photographs); the
  // trunnion bearings' bosses and caps stand proud of their top
  const wprof = [[-9.5, LT], [-9.5, 6.4], [-5.5, 7.6], [-2.6, TY + 0.15], [3.4, TY + 0.15], [4.6, 7.6], [5.3, 7.0], [6.2, 7.0], [6.2, LT]];
  for (const s of [-1, 1]) {
    const x = s * WALL.x, xo = s * (WALL.x + WALL.w / 2);
    PU.add('camo', sideProfile(wprof, WALL.w, 0.02).translate(x, 0, 0));
    // a flange round the wall's top edge, ribs and rivets on the outer face
    for (let i = 1; i < wprof.length - 2; i++) { const [z0, y0] = wprof[i], [z1, y1] = wprof[i + 1]; PU.add('camo', rod(V(xo, y0 - 0.06, z0), V(xo, y1 - 0.06, z1), 0.07, 4)); }
    for (const [z, h] of [[-8.2, 1.2], [-5.6, 2.4], [-3.3, 2.9], [4.0, 2.6], [5.8, 1.6]]) PU.add('camo', box(0.1, h, 0.22, s * (WALL.x + WALL.w / 2 + 0.05), LT + h / 2, z));
    PU.add('dark', rivetRow(V(xo + s * 0.02, TY + 0.03, -2.4), V(xo + s * 0.02, TY + 0.03, -0.4), 0.36, V(s, 0, 0), 0.026));
    PU.add('dark', rivetRow(V(xo + s * 0.02, TY + 0.03, 1.8), V(xo + s * 0.02, TY + 0.03, 3.2), 0.36, V(s, 0, 0), 0.026));
    PU.add('dark', rivetRow(V(xo + s * 0.02, LT + 0.25, -9.3), V(xo + s * 0.02, LT + 0.25, 6.0), 0.4, V(s, 0, 0), 0.026));
    // lightening holes (the wreck at Auerbach shows them in the side walls)
    for (const [z, y] of [[-6.7, 6.0], [4.5, 6.0]]) {
      PU.add('dark', new THREE.CircleGeometry(0.5, 20).rotateY(s * Math.PI / 2).translate(xo + s * 0.005, y, z));
      PU.add('camo', new THREE.TorusGeometry(0.52, 0.05, 6, 20).rotateY(Math.PI / 2).translate(xo + s * 0.01, y, z));
    }
    // trunnion bearing: a heavy round housing, open above for the trunnion to be lowered in; its upper half, the cap
    // and their bolts go on with the cradle (PCAP)
    PU.add('camo', halfX(s * (WALL.x - 0.22), s * (WALL.x + 0.5), 0.86, 28, TY, TZ, false));
    PU.add('camo', box(0.72, 0.06, 1.0, s * (WALL.x + 0.14), TY - 0.5, TZ)); // the seat the pin bears on
    PU.add('steel', halfX(s * (WALL.x + 0.5), s * (WALL.x + 0.56), 0.6, 24, TY, TZ, false));
    PCAP.add('camo', halfX(s * (WALL.x - 0.22), s * (WALL.x + 0.5), 0.86, 28, TY, TZ, true));
    PCAP.add('steel', halfX(s * (WALL.x + 0.5), s * (WALL.x + 0.56), 0.6, 24, TY, TZ, true));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; (Math.sin(a) > 0 ? PCAP : PU).add('dark', xTube(s * (WALL.x + 0.5), s * (WALL.x + 0.58), 0.05, 0.05, 6, TY + Math.sin(a) * 0.72, TZ + Math.cos(a) * 0.72)); }
    PCAP.add('camo', rbox(0.66, 0.42, 2.0, 0.06, x + s * 0.1, TY + 0.72, TZ));
    // the wall's sole plate on the girder and its gussets
    PU.add('camo', box(0.95, 0.12, 15.7, s * (WALL.x + 0.12), LT + 0.08, -1.65));
    for (let z = -9.0; z < 6.0; z += 1.5) PU.add('camo', box(0.36, 0.5, 0.05, s * (WALL.x + 0.38), LT + 0.33, z));
  }
  PU.add('camo', box(2 * WALL.x - WALL.w, 1.25, 1.4, 0, LT + 0.62, -8.8)); // front cross girder, below the cradle
  // the elevating gear: a cross shaft under the cradle with its pinions, driven from a motor between the girders
  const PIN = { y: TY - 3.85, z: TZ, r: 0.3 };
  PU.add('steel', xTube(-XI, XI, 0.1, 0.1, 10, PIN.y, PIN.z));
  for (const s of [-1, 1]) {
    PU.add('iron', xTube(s * 0.62, s * 0.88, PIN.r, PIN.r, 18, PIN.y, PIN.z));
    PU.add('camo', box(0.3, 1.2, 0.6, s * (XI - 0.15), PIN.y, PIN.z)); // bearing brackets on the girders' inner faces
  }
  PU.add('camo', rbox(0.75, 0.75, 1.3, 0.06, -(XI - 0.4), PIN.y + 0.1, PIN.z - 1.3)); // the elevating motor (ahead: the breech comes down behind)
  PU.add('steel', zTube(PIN.z - 0.65, PIN.z - 0.1, 0.07, 0.07, 8, -(XI - 0.4), PIN.y));
  // the galleries round the upper carriage at the platform's height: decks, posts and braces down to the girders
  for (const s of [-1, 1]) {
    const x0 = WALL.x + WALL.w / 2, z0 = -9.6, z1 = PZ0, xm = s * (x0 + GAL) / 2;
    PU.add('camo', box(GAL - x0, 0.08, z1 - z0, xm, PY - 0.04, (z0 + z1) / 2));
    PU.add('camo', box(0.1, 0.22, z1 - z0, s * (GAL - 0.05), PY - 0.15, (z0 + z1) / 2));
    for (let z = z0 + 0.3, k = 0; z < z1; z += 1.55, k++) {
      PU.add('camo', box(0.12, PY - LT, 0.12, s * (GAL - 0.12), (PY + LT) / 2, z));
      if (z + 1.55 < z1) PU.add('camo', rod(V(s * (GAL - 0.12), k % 2 ? LT + 0.05 : PY - 0.2, z), V(s * (GAL - 0.12), k % 2 ? PY - 0.2 : LT + 0.05, z + 1.55), 0.035, 4));
    }
    for (let z = z0 + 0.25; z < z1; z += 0.5) PU.add('dark', box(GAL - x0 - 0.15, 0.012, 0.035, xm, PY + 0.006, z));
    // the left gallery's railing stops short of the tray's slide (it comes out over that side)
    rail(PU, s * (GAL - 0.04), z0 + 0.6, s * (GAL - 0.04), s < 0 ? 6.0 : 4.9, PY);
    // stairs from the lower deck up to the gallery
    stair(PU, s * (x0 + 0.15), s * (GAL - 0.2), NZ1 + 0.1, LT, z0 + 0.05, PY, s * (GAL - 0.12));
  }
  // the layer's station (left gallery): the elevating handwheel, the sight; the elevation receiver (right)
  PU.add('camo', box(0.22, 0.95, 0.4, -2.26, PY + 0.47, TZ - 1.4));
  PU.add('iron', handwheel(0.3, 6, 0.025, 0.06).translate(-2.42, PY + 1.05, TZ - 1.4));
  PU.add('camo', box(0.14, 1.5, 0.14, -2.3, PY + 0.75, TZ - 2.25)); // the sight post
  PU.add('dark', zTube(TZ - 2.6, TZ - 2.1, 0.07, 0.06, 10, -2.3, PY + 1.62));
  PU.add('glass', box(0.08, 0.08, 0.04, -2.3, PY + 1.62, TZ - 2.61));
  PU.add('camo', rbox(0.26, 1.0, 0.6, 0.04, 2.28, PY + 0.5, TZ + 2.0)); // the elevation receiver and controller
  PU.add('iron', handwheel(0.26, 5, 0.022, 0.05).translate(2.43, PY + 1.12, TZ + 2.0));
  PU.add('white', box(0.02, 0.26, 0.36, 2.415, PY + 0.62, TZ + 2.0), { tint: 0xd8d4c4 }); // the dial

  // ---- the loading platform at the rear: deck, planks, framing, railings, transfer rails
  {
    const dh = PY - 0.06, sx0 = LX - LW / 2, sx1 = LX + LW / 2, sz0 = LZ - LL / 2, sz1 = LZ + LL / 2;
    PU.add('camo', box(2 * sx0, 0.12, PZ1 - PZ0, 0, dh, (PZ0 + PZ1) / 2)); // middle, between the shafts
    for (const s of [-1, 1]) {
      PU.add('camo', box(XO - sx1, 0.12, PZ1 - PZ0, s * (XO + sx1) / 2, dh, (PZ0 + PZ1) / 2)); // outside the shafts
      PU.add('camo', box(LW, 0.12, sz0 - PZ0, s * LX, dh, (PZ0 + sz0) / 2)); // ahead of the shafts
      PU.add('camo', box(0.12, 0.4, PZ1 - PZ0, s * (XO - 0.06), PY - 0.32, (PZ0 + PZ1) / 2)); // edge beams
      for (let z = PZ0 + 0.25; z < PZ1; z += 0.5) PU.add('dark', box(XO - sx1 - 0.1, 0.012, 0.035, s * (XO + sx1) / 2, PY + 0.006, z));
    }
    for (let z = PZ0 + 0.15; z < PZ1 - 0.1; z += 0.3) PU.add('timber', box(2 * sx0 - 0.12, 0.035, 0.27, 0, PY + 0.0175, z), { tint: (z * 7.3) % 1 > 0.5 ? 0xffffff : 0xd8cfc0 });
    // framing: posts from the girders, longitudinals under the deck, stays out to the towers
    for (let z = PZ0 + 0.5; z < GR; z += 2.0) for (const x of [-3.3, -1.75, 1.75, 3.3]) PU.add('camo', box(0.2, PY - LT - 0.12, 0.2, x, (PY + LT - 0.12) / 2, z));
    for (const x of [-3.45, -1.5, 1.5, 3.45]) PU.add('camo', ibeamZ(PZ0, PZ1, 0.36, 0.2, 0.03, x, PY - 0.3));
    for (const s of [-1, 1]) PU.add('camo', rod(V(s * 3.45, LT, GR - 0.2), V(s * 3.45, PY - 0.45, sz0 + 1.6), 0.08, 6));
    // the transfer rails: across from the shell lift, then forward along the middle to the tray
    for (const dx of [-0.42, 0.42]) PU.add('steel', box(0.07, 0.06, LZ + 0.5 - (PZ0 + 1.6), dx, PY + 0.06, (LZ + 0.5 + PZ0 + 1.6) / 2));
    for (const dz of [-0.42, 0.42]) PU.add('steel', box(sx0 - 0.05, 0.06, 0.07, -sx0 / 2, PY + 0.06, LZ + dz));
    // railings round the deck: the left one starts behind the tray's slide; the shafts' inner sides are open
    rail(PU, -(XO - 0.05), 11.3, -(XO - 0.05), PZ1 - 0.05, PY);
    rail(PU, XO - 0.05, PZ0, XO - 0.05, PZ1 - 0.05, PY);
    for (const s of [-1, 1]) rail(PU, s * sx0, sz0 - 0.05, s * sx1, sz0 - 0.05, PY, 1.0, 1.5);
    rail(PU, -(sx0 - 0.1), PZ1 - 0.05, sx0 - 0.1, PZ1 - 0.05, PY, 1.0, 1.1);
    // the transfer trolley's hand winch at the rear of the deck, the cartridge rack and a tool locker (right)
    PU.add('camo', box(1.0, 0.6, 0.6, 0, PY + 0.3, PZ1 - 0.55));
    PU.add('iron', xTube(-0.4, 0.4, 0.18, 0.18, 14, PY + 0.75, PZ1 - 0.55));
    PU.add('camo', box(0.9, 0.9, 2.2, 2.95, PY + 0.45, PZ0 + 3.6));
    for (let k = 0; k < 3; k++) PU.add('dark', box(0.92, 0.04, 2.22, 2.95, PY + 0.2 + k * 0.3, PZ0 + 3.6));
    PU.add('camo', rbox(0.7, 0.9, 1.2, 0.04, 3.05, PY + 0.45, 13.6));
    PU.add('white', box(0.5, 0.26, 0.02, 3.05, PY + 0.62, 12.99), { tint: GREY });
  }
  // ---- the lift towers: heavy I-section posts at the rear corners, guides in front, a head frame with the
  // winding drum and its motor on top (the photographs' towers), step irons up the outer post
  for (const s of [-1, 1]) {
    const xa = s * (LX - PX), xb = s * (LX + PX), zr = ZH, zf = LZ - LL / 2 - 0.12;
    for (const x of [xa, xb]) {
      PU.add('camo', ibeamY(1.5, HEAD + 0.15, 0.3, 0.26, 0.035, x, zr));
      PU.add('camo', ibeamY(1.6, HEAD + 0.15, 0.2, 0.18, 0.03, x, zf + 0.05)); // (on the rear frame, behind the span bolster's end)
      PU.add('steel', box(0.05, HEAD - 1.8, 0.06, x - Math.sign(x - s * LX) * 0.1, (HEAD + 1.6) / 2, zr - 0.16)); // guide rails
      PU.add('steel', box(0.05, HEAD - 1.8, 0.06, x - Math.sign(x - s * LX) * 0.1, (HEAD + 1.6) / 2, zf + 0.12));
    }
    for (const y of [2.6, PY - 0.35, PY + 2.2]) PU.add('camo', box(2 * PX, 0.2, 0.2, s * LX, y, zr + 0.08)); // ties across the rear posts
    for (const y of [PY + 2.2]) PU.add('camo', box(2 * PX, 0.16, 0.16, s * LX, y, zf));
    for (const x of [xa, xb]) PU.add('camo', box(0.24, 0.36, zr - zf + 0.3, x, HEAD + 0.03, (zr + zf) / 2)); // head frame
    for (const z of [zf, LZ, zr]) PU.add('camo', box(2 * PX + 0.24, 0.3, 0.24, s * LX, HEAD + 0.03, z));
    for (const x of [xa, xb]) PU.add('camo', rod(V(x, HEAD - 1.4, zr), V(x, HEAD - 0.1, zr - 1.1), 0.06, 5)); // knee braces
    // the winding drum across the posts, its motor and gearbox; the sheave block over the cage
    const DY = HEAD + 0.6;
    PU.add('iron', xTube(s * LX - 0.85, s * LX + 0.85, 0.36, 0.36, 22, DY, zr - 0.25));
    for (const e of [-1, 1]) PU.add('camo', xTube(s * LX + e * 0.85, s * LX + e * 0.95, 0.42, 0.42, 22, DY, zr - 0.25));
    for (const e of [-1, 1]) PU.add('camo', box(0.2, 0.42, 0.3, s * LX + e * 0.9, HEAD + 0.38, zr - 0.25)); // the drum's bearers
    PU.add('camo', box(2 * PX, 0.06, 1.3, s * LX, HEAD + 0.21, zr - 1.25));
    PU.add('camo', rbox(0.8, 0.55, 0.7, 0.05, s * (LX - 0.35), HEAD + 0.52, zr - 1.3)); // the hoisting motor and its gearbox
    PU.add('camo', box(0.5, 0.45, 0.5, s * (LX + 0.45), HEAD + 0.47, zr - 1.3));
    PU.add('steel', xTube(s * (LX + 0.05), s * (LX + 0.2), 0.09, 0.09, 8, HEAD + 0.52, zr - 1.3));
    PU.add('dark', xTube(s * LX - 0.1, s * LX + 0.1, 0.3, 0.3, 18, HEAD - 0.32, LZ)); // the sheave over the cage, and its hanger
    PU.add('camo', box(0.3, 0.42, 0.5, s * LX, HEAD - 0.08, LZ));
    PU.add('chain', rod(V(s * LX, DY - 0.36, zr - 0.25), V(s * LX, HEAD - 0.02, LZ), 0.03, 6)); // the rope from the drum
    for (let y = PY + 0.3; y < HEAD - 0.3; y += 0.35) PU.add('dark', zTube(zr + 0.15, zr + 0.34, 0.018, 0.018, 4, xb, y)); // step irons
  }

  // ---------------------------------------------------------------- the lift cages (hoist, hoist2)
  // A platform with chocks for the shell's trolley, railed on its outer side and ends, open toward the gun's
  // middle (the shell rolls off it onto the transfer rails), slung from a bridle; guide shoes on the posts.
  const cage = (P, side) => {
    P.add('camo', box(LW - 0.06, 0.1, LL - 0.1, 0, -0.05, 0));
    P.add('camo', box(LW - 0.06, 0.16, 0.12, 0, -0.12, 0));
    for (const e of [-1, 1]) P.add('camo', box(0.12, 0.16, LL - 0.1, e * (LW / 2 - 0.09), -0.12, 0));
    const xo = side * (LW / 2 - 0.05), ze = LL / 2 - 0.08;
    for (const z of [-ze, -ze / 3, ze / 3, ze]) P.add('dark', rod(V(xo, 0, z), V(xo, 1.05, z), 0.026, 5));
    for (const y of [0.55, 1.05]) P.add('dark', rod(V(xo, y, -ze), V(xo, y, ze), 0.024, 5));
    for (const e of [-1, 1]) for (const y of [0.55, 1.05]) P.add('dark', rod(V(xo, y, e * ze), V(0, y, e * ze), 0.022, 5));
    for (const e of [-1, 1]) P.add('dark', rod(V(0, 0, e * ze), V(0, 1.05, e * ze), 0.026, 5));
    P.add('camo', box(0.16, 0.16, LL * 0.6, xo, 2.0, 0)); // the bridle's yoke over the outer rail
    for (const e of [-1, 1]) P.add('dark', rod(V(xo, 1.05, e * ze), V(xo, 2.0, e * LL * 0.3), 0.03, 5));
    P.add('dark', rod(V(xo, 2.0, 0), V(0, 2.0, 0), 0.04, 5));
    for (const e of [-1, 1]) for (const d of [-1, 1]) P.add('dark', box(0.12, 0.3, 0.1, d * (LW / 2 + 0.04), 0.15, e * (LL / 2 + 0.02))); // guide shoes
    for (const z of [-1.0, 1.0]) for (const d of [-1, 1]) P.add('camo', box(0.22, 0.12, 0.18, d * 0.3, 0.06, z)); // the trolley's chocks
  };
  const PH = mk(), PH2 = mk();
  cage(PH, -1); cage(PH2, 1);

  // ---------------------------------------------------------------- the cradle (elevation frame)
  const PE = mk();
  {
    PE.add('camo', zTube(CR0 + 0.3, CR1, 1.3, 1.3, 32));
    PE.add('camo', zTube(CR0, CR0 + 0.35, 1.52, 1.52, 32)); // the front flange
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; PE.add('dark', zTube(CR0 - 0.05, CR0, 0.055, 0.055, 6, Math.cos(a) * 1.4, Math.sin(a) * 1.4)); }
    for (const z of [-5.2, -2.7]) PE.add('camo', zTube(z - 0.14, z + 0.14, 1.38, 1.38, 32)); // bands
    PE.add('camo', rbox(2.85, 2.75, 3.2, 0.12, 0, 0, 0)); // the trunnion block
    for (const s of [-1, 1]) {
      PE.add('camo', xTube(s * 1.42, s * 1.6, 0.9, 0.9, 32)); // trunnion disc with its bolt circle
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; PE.add('dark', xTube(s * 1.6, s * 1.66, 0.06, 0.06, 6, Math.sin(a) * 0.7, Math.cos(a) * 0.7)); }
      PE.add('steel', xTube(s * 1.6, s * (WALL.x + 0.06), 0.48, 0.48, 24)); // the trunnion pins
      PE.add('dark', rivetRow(V(s * 1.44, 1.2, -1.4), V(s * 1.44, 1.2, 1.4), 0.3, V(s, 0, 0), 0.028));
      PE.add('dark', rivetRow(V(s * 1.44, -1.2, -1.4), V(s * 1.44, -1.2, 1.4), 0.3, V(s, 0, 0), 0.028));
      // the recoil cylinders, over and under the barrel: heads proud of the cradle's flange, saddles to the sleeve
      for (const y of [1.42, -1.42]) {
        PE.add('camo', zTube(CR0 - 0.45, CR1 - 0.3, 0.33, 0.33, 18, s * 0.72, y));
        PE.add('camo', zTube(CR0 - 0.65, CR0 - 0.45, 0.39, 0.39, 18, s * 0.72, y), { tint: 0xd8dad6 });
        PE.add('dark', zTube(CR0 - 0.7, CR0 - 0.65, 0.22, 0.22, 12, s * 0.72, y));
        for (const z of [-6.2, -4.0]) PE.add('camo', box(0.5, 0.36, 0.32, s * 0.72, y * 0.93, z));
      }
      // the elevating arcs under the cradle, toothed outside, on a deep web
      PE.add('steel', gearArc(3.2, 3.55, 38 * DEG, 94 * DEG, 0.2, 36, 0.07).translate(s * 0.75, 0, 0));
      PE.add('camo', gearArc(1.2, 3.2, 38 * DEG, 94 * DEG, 0.12).translate(s * 0.75, 0, 0));
    }
    // the housing on the cradle's back over the trunnions, where the cylinders end (the box the crew stand on in
    // the Rügenwalde photographs), with its hatches and the clinometer seat
    PE.add('camo', rbox(2.1, 1.0, 2.5, 0.08, 0, 1.85, 0.95));
    PE.add('camo', box(2.2, 0.08, 2.6, 0, 2.38, 0.95));
    for (const s of [-1, 1]) PE.add('dark', rbox(0.03, 0.55, 0.7, 0.02, s * 1.06, 1.85, 1.3));
    PE.add('dark', rivetRow(V(-0.95, 2.43, -0.2), V(0.95, 2.43, -0.2), 0.32, V(0, 1, 0), 0.03));
    PE.add('camo', box(0.4, 0.25, 0.5, 0.6, 2.54, 1.6)); // the clinometer seat
  }
  // ---------------------------------------------------------------- the barrel (recoil frame)
  // in two halves, as it travelled: the rear half (the collar, the slide, the crosshead, the breech ring) comes in the
  // cradle, the front half (PRF, to the muzzle) on its own and is joined at the collar
  const PR = mk(), PRF = mk();
  {
    // two halves: the chase steps once and tapers to a plain muzzle; the locking collar joins it to the rear
    // half, whose polished slide shows ahead of the cradle when the barrel is run out
    const J0 = -11.3, J1 = -10.0, ST = -17.0;
    const p = [[MUZ, 0.4], [MUZ, 0.6], [MUZ + 0.12, 0.645], [MUZ + 0.7, 0.645], [MUZ + 0.82, 0.625]];
    for (let i = 1; i <= 8; i++) { const t = i / 8; p.push([MUZ + 0.82 + (ST - MUZ - 0.82) * t, 0.625 + 0.115 * t]); }
    p.push([ST + 0.12, 0.8], [J0, 0.86], [J0, 0.4]);
    PRF.add('iron', zLathe(p, 40)); // turned and painted: no plate seams on the tube
    PR.add('iron', zLathe([[J0, 0.4], [J0, 0.9], [J0 + 0.1, 0.99], [J1 - 0.1, 0.99], [J1, 0.93], [CR0 - 0.1, 0.95], [3.0, 0.98], [3.0, 0]], 40));
    PR.add('steel', zTube(J1 + 0.15, CR0 + 0.05, 0.952, 0.958, 40), { tint: 0x9ea2a6 }); // the slide
    PR.add('steel', zTube(J1 - 0.02, J1 + 0.12, 0.956, 0.956, 40), { tint: 0xa8acb0 }); // a bright ring behind the collar
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; PR.add('dark', box(0.1, 0.06, 0.9, Math.cos(a) * 0.995, Math.sin(a) * 0.995, (J0 + J1) / 2, 0, 0, a)); } // the collar's spanner slots
    PRF.add('dark', zTube(MUZ - 0.002, MUZ + 0.6, 0.4, 0.4, 28, 0, 0, true));
    PRF.add('dark', new THREE.CircleGeometry(0.4, 40).rotateY(Math.PI).translate(0, 0, MUZ + 2.6));
    PRF.add('iron', zLathe([[MUZ + 2.6, 0.4], [MUZ, 0.4]], 56), { tint: 0x707070 }); // the rifled bore: the muzzle reads open head on
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      PRF.add('dark', rod(V(Math.cos(a) * 0.398, Math.sin(a) * 0.398, MUZ + 0.01), V(Math.cos(a + 0.15) * 0.398, Math.sin(a + 0.15) * 0.398, MUZ + 1.4), 0.006, 4));
    }
    // the crosshead the recoil rods pull on, and the rods back from the cylinders
    PR.add('camo', zTube(CR1 + 0.05, 3.0, 1.22, 1.22, 32));
    for (const y of [1.42, -1.42]) for (const s of [-1, 1]) {
      PR.add('steel', zTube(CR1 - 0.4, CR1 + 0.5, 0.1, 0.1, 8, s * 0.72, y));
      PR.add('camo', box(0.55, 0.5, 0.6, s * 0.72, y * 0.92, CR1 + 0.45));
    }
    // the breech ring: a square block 2.8 m across with the transverse slot for the sliding block
    const BW = 2.8, RZ0 = 3.0;
    for (const y of [-1.06, 1.06]) PR.add('camo', rbox(BW, 0.52, BRE - RZ0, 0.08, 0, y, (BRE + RZ0) / 2));
    for (const x of [-1.12, 1.12]) PR.add('camo', box(0.56, 1.62, BRE - RZ0 - 1.25, x, 0, (BRE + RZ0 - 1.25) / 2));
    PR.add('camo', box(0.25, 1.62, 1.25, -1.27, 0, BRE - 0.625)); // the closed end of the slot (left)
    PR.add('steel', zLathe([[BRE - 1.25, 0.5], [BRE - 1.25, 0.86], [BRE - 1.05, 0.86], [BRE - 1.05, 0.5], [BRE - 1.25, 0.5]], 48));
    PR.add('dark', new THREE.CircleGeometry(0.5, 32).translate(0, 0, BRE - 1.4)); // the chamber, seen with the block open
    PR.add('dark', box(0.04, 1.66, 0.96, BW / 2 + 0.005, 0, BRE - 0.75)); // the slot's mouth on the right
    PR.add('steel', box(2.5, 0.1, 0.1, 0, 1.0, BRE + 0.02));
    PR.add('dark', rivetRow(V(-1.25, 1.33, RZ0 + 0.2), V(1.25, 1.33, RZ0 + 0.2), 0.3, V(0, 1, 0), 0.04));
    PR.add('dark', rivetRow(V(-1.25, 1.33, BRE - 0.2), V(1.25, 1.33, BRE - 0.2), 0.3, V(0, 1, 0), 0.04));
    for (const s of [-1, 1]) PR.add('camo', box(0.4, 0.4, 0.5, s * 0.95, 1.5, RZ0 + 0.8)); // lifting lugs
    PR.add('white', box(0.02, 0.4, 0.8, -BW / 2 - 0.01, 0.2, RZ0 + 1.0), { tint: GREY });
  }
  // the sliding block: a slab through the slot, its hydraulic operating cylinder, the firing lock
  const PBR = mk();
  PBR.add('steel', rbox(2.2, 1.6, 0.9, 0.06, -1.1, 0, 0), { tint: 0xc8c8c0 });
  PBR.add('camo', box(0.24, 1.3, 0.76, 0.12, 0, 0));
  PBR.add('camo', xTube(0.24, 0.75, 0.16, 0.16, 12, 0.35, 0.05));
  PBR.add('steel', xTube(0.75, 1.0, 0.07, 0.07, 8, 0.35, 0.05));
  PBR.add('iron', handwheel(0.32, 5, 0.025, 0.05).translate(0.55, -0.3, 0.3));
  PBR.add('brass', zTube(0.45, 0.6, 0.08, 0.08, 10, -1.1, 0));
  PBR.add('dark', new THREE.TorusGeometry(0.07, 0.015, 6, 12).translate(-1.1, -0.12, 0.62));
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

  // ---------------------------------------------------------------- the ammunition wagon and the charge van (behind)
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
        P.add('steel', xTube(-0.9, 0.9, 0.06, 0.06, 8, 0.48, bz + az));
        for (const s of [-1, 1]) P.add('steel', xTube(s * (GA - 0.07), s * (GA + 0.07), 0.48, 0.48, 18, 0.48, bz + az));
      }
    }
    if (covered) {
      // a closed van for the cartridges (kept near 15 degrees): plank sides, a rounded roof
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
  // each on its own track behind the gun: the shells on the left, the charges on the right, standing on the curve
  const wagS = node(S0, 'wagon-shells'), wagC = node(S0, 'wagon-charges');
  const WZ = ZB + 0.5 + 0.48 + 5.5, CZ = ZB + 0.5 + 0.48 + 4.2;
  wagS.position.set(curveX(R, -TRACK_X, WZ), 0, WZ); wagS.rotation.y = curveYaw(R, -TRACK_X, WZ);
  wagC.position.set(curveX(R, TRACK_X, CZ), 0, CZ); wagC.rotation.y = curveYaw(R, TRACK_X, CZ);
  const PC = mk();
  wagon(PA, 0, false);
  wagon(PC, 0, true);

  // ---------------------------------------------------------------- build, stages, props, anchors
  PLL.build(S1L, { dirt: 0.35, y0: 0 }); PLR.build(S1R, { dirt: 0.35, y0: 0 });
  PU.build(S2, { dirt: 0.15, y0: 0 });
  const caps = node(gun, 'trunnion-caps'); PCAP.build(caps, { dirt: 0.15, y0: 0 });
  PH.build(hoist, { dirt: 0, y0: HOIST.up }); PH2.build(hoist2, { dirt: 0, y0: HOIST.up });
  const ne = elev.children.length; PE.build(elev, { dirt: 0.05, y0: TY });
  const nr = rec.children.length; PR.build(rec, { dirt: 0.05, y0: TY });
  const barrelRear = builtSince(rec, nr), bf = node(rec, 'barrel-front'); PRF.build(bf, { dirt: 0.05, y0: TY });
  PBR.build(brc, { dirt: 0.05, y0: TY });
  const nt = tray.children.length; PTR.build(tray, { dirt: 0.05, y0: TY });
  PA.build(wagS, { dirt: 0.4, y0: 0 }); PC.build(wagC, { dirt: 0.4, y0: 0 });
  const stageE = builtSince(elev, ne), trayParts = builtSince(tray, nt), breechParts = brc.children.filter((o) => o.isMesh);

  // the lift cables: unit strands scaled from the sheave down to each cage's yoke
  const cmat = rig.mats.chain;
  const cables = [hoist, hoist2].map((h, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, -0.5, 0), cmat);
    g.add(m);
    g.position.set((i ? 1 : -1) * LX, HEAD - 0.6, LZ);
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
  rig.setTraverse = (az) => { trav.rotation.y = az; roll(az - gun.position.z / R); };
  // the shot shoves the whole carriage back along its rails (render/guns.js carPose: back within two seconds, brought
  // up again by the bogies' motors while it reloads); the men on it ride along (crews.js, spots marked `car`)
  rig.pivots.car = gun;
  rig.carRoll = 0.8;
  rig.carYaw = () => trav.rotation.y; // the run is along the gun's own axis, turned with it on its curve
  rig.carZ = 0; // the carriage's run back now (the diesels coupled behind go with it: gustav_works.js)
  rig.setCar = (z) => { gun.position.z = z; rig.carZ = z; roll(trav.rotation.y - z / R); };
  rig.update = () => {
    cables[0].children[0].scale.y = Math.max(0.05, HEAD - 0.6 - (hoist.position.y + 2.0));
    cables[1].children[0].scale.y = Math.max(0.05, HEAD - 0.6 - (hoist2.position.y + 2.0));
    rig.trayTilt();
  };
  rig.update();

  // ---------------------------------------------------------------- the setup (src/ww2/gustav_works.js)
  // The gun comes in pieces and is put together under the gantry cranes: its parts as they travel and are lifted,
  // each a list of objects that move as one (their parents are the gun's frame shifted, at rest: no traverse,
  // elevation, recoil, open breech or tray run). rig.works describes them for the choreography (boxes and their top
  // and bottom profiles along z, rail-head frame); rig.setWorks(pose) puts each where the pose has it, the bogie units
  // and the two wagons on their tracks, all relative to where the gun itself stands (pose.gun).
  rig.setTray(1);
  root.updateMatrixWorld(true);
  const PARTS = { gL: [S1L], gR: [S1R], upper: [S2, ...trayParts], cradle: [...stageE, ...barrelRear, ...breechParts, caps], front: [bf] };
  const gunInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
  const _po = new THREE.Vector3();
  const partState = Object.fromEntries(Object.entries(PARTS).map(([id, objs]) => [id, objs.map((o) => {
    _po.setFromMatrixPosition(o.parent.matrixWorld).applyMatrix4(gunInv); // the parent's origin in the gun's frame
    return { o, po: _po.clone(), b: o.position.clone(), q: o.quaternion.clone() };
  })]));
  const Z0 = -30, DZ = 0.5, NZB = 120;
  const measure = (objs) => {
    const m = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9, z: new Float32Array(NZB), top: new Float32Array(NZB).fill(-1e9), bot: new Float32Array(NZB).fill(1e9) };
    for (let i = 0; i < NZB; i++) m.z[i] = Z0 + i * DZ;
    for (const o of objs) o.traverse((n) => {
      if (!n.isMesh || n.isInstancedMesh) return;
      const a = n.geometry.attributes.position, e = _w.copy(gunInv).multiply(n.matrixWorld).elements;
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        m.x0 = Math.min(m.x0, wx); m.x1 = Math.max(m.x1, wx); m.y0 = Math.min(m.y0, wy); m.y1 = Math.max(m.y1, wy); m.z0 = Math.min(m.z0, wz); m.z1 = Math.max(m.z1, wz);
        const k = Math.floor((wz - Z0) / DZ);
        if (k >= 0 && k < NZB) { m.top[k] = Math.max(m.top[k], wy); m.bot[k] = Math.min(m.bot[k], wy); }
      }
    });
    return m;
  };
  rig.works = { parts: Object.fromEntries(Object.entries(PARTS).map(([id, objs]) => [id, measure(objs)])), bogTop: LB };
  // a part's pose (site frame: its gun origin at x, y, z, turned a) relative to the gun's own (g): obj = t - po + R(po + b)
  const _rq = new THREE.Quaternion(), _rv = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  const rel = (g, x, z, a, out) => {
    const dx = x - g.x, dz = z - g.z, c = Math.cos(g.a), s = Math.sin(g.a);
    out.x = dx * c - dz * s; out.z = dx * s + dz * c; out.a = a - g.a;
    return out;
  };
  const _r = { x: 0, z: 0, a: 0 };
  const placePart = (id, q, g) => {
    const home = q.on === 'gun';
    if (!home) rel(g, q.x, q.z, q.a, _r);
    _rq.setFromAxisAngle(_Y, home ? 0 : _r.a);
    for (const p of partState[id]) {
      if (home) { p.o.position.copy(p.b); p.o.quaternion.copy(p.q); continue; }
      _rv.copy(p.po).add(p.b).applyQuaternion(_rq).sub(p.po);
      p.o.position.set(_r.x + _rv.x, q.y + _rv.y, _r.z + _rv.z);
      p.o.quaternion.copy(_rq).multiply(p.q);
    }
  };
  // the bogies, bolsters, wheels and the two wagons on their tracks (pose.bog: site frame, u: the wheels' run)
  for (const im of [...bogies, ...wheels, ...bolsters]) im.frustumCulled = false; // they roll in from the yard
  const _bm = new THREE.Matrix4(), wagSHome = [wagS.position.clone(), wagS.rotation.y], wagCHome = [wagC.position.clone(), wagC.rotation.y];
  let onWorks = false;
  const setVehicle = (q, g, set) => { rel(g, q.x, q.z, q.a, _r); set(_r); };
  rig.setWorks = (pose) => {
    const g = pose.gun;
    for (const id of Object.keys(PARTS)) placePart(id, pose.parts[id], g);
    if (!g.works) {
      if (onWorks) {
        // the gun stands on its curve: its own bogies and wagons as built, the wheels rolling with its traverse
        onWorks = false;
        BOG.forEach((b, i) => setInstance(bogies, i, b.m));
        bolHome.forEach((m, i) => setInstance(bolsters, i, m));
        wagS.position.copy(wagSHome[0]); wagS.rotation.y = wagSHome[1];
        wagC.position.copy(wagCHome[0]); wagC.rotation.y = wagCHome[1];
        lastAz = NaN; roll(trav.rotation.y);
      }
      return;
    }
    onWorks = true;
    let wi = 0;
    pose.bog.forEach((q, i) => setVehicle(q, g, (r) => {
      _bm.compose(_p.set(r.x, 0, r.z), _q.setFromEuler(_e.set(0, r.a, 0)), _s);
      setInstance(bogies, i, _bm);
      _wx.makeRotationX(-q.u / WR);
      for (let k = -2; k <= 2; k++) { _wt.makeTranslation(0, WR, k * AS); _w.multiplyMatrices(_bm, _wt).multiply(_wx); for (const im of wheels) im.setMatrixAt(wi, _w); wi++; }
    }));
    for (const im of wheels) im.instanceMatrix.needsUpdate = true;
    pose.bol.forEach((q, i) => setVehicle(q, g, (r) => setInstance(bolsters, i, _bm.compose(_p.set(r.x, 0, r.z), _q.setFromEuler(_e.set(0, r.a, 0)), _s))));
    setVehicle(pose.wag.S, g, (r) => { wagS.position.set(r.x, 0, r.z); wagS.rotation.y = r.a; });
    setVehicle(pose.wag.C, g, (r) => { wagC.position.set(r.x, 0, r.z); wagC.rotation.y = r.a; });
  };
  // the gun's state in the setup (crews_heavy.js reads it: a gun not yet built has no decks to stand on)
  rig.assembly = 1;

  // hit boxes (gun frame at az = 0): the lower carriage with its bogies, the upper carriage, the barrel, the
  // platform with the lift towers
  hb(rig, -XO, RH, -ZB, XO, RH + LT + 0.2, ZB);
  hb(rig, -2.2, RH + LT, -9.6, 2.2, RH + TY + 1.2, 6.2);
  hb(rig, -1.0, RH + TY - 1.0, TZ + MUZ, 1.0, RH + TY + 1.0, TZ + CR0);
  hb(rig, -XO, RH + LT, PZ0, XO, RH + LIFT_TOP, PZ1);

  // crew: root space at az = 0 (the gun frame, the whole gun moves along its curve); y is where the feet stand.
  // Nobody here is a world-frame role: the men ride the gun along the curve with it.
  const E = -Math.PI / 2, W = Math.PI / 2, N = 0;
  const G = RH + PY; // the galleries and the platform are one level
  crewSpot(rig, 'chief', 2.6, G, TZ - 5.0, W, 'point'); // the Geschützführer on the right gallery, abreast the cradle
  crewSpot(rig, 'layer', -2.72, G, TZ - 1.4, E, 'lay');
  crewSpot(rig, 'elevator', 2.72, G, TZ + 2.0, W, 'operate');
  crewSpot(rig, 'lanyard', 2.2, G, PZ0 + 1.0, N, 'lanyard');
  crewSpot(rig, 'loader1', -1.35, G, PZ0 + 1.3, N, 'carry');
  crewSpot(rig, 'loader2', 1.35, G, PZ0 + 1.3, N, 'carry');
  crewSpot(rig, 'rammer1', -0.5, G, PZ0 + 6.6, N, 'ram');
  crewSpot(rig, 'rammer2', 0.5, G, PZ0 + 6.6, N, 'ram');
  crewSpot(rig, 'rammer3', -0.5, G, PZ0 + 7.4, N, 'ram');
  crewSpot(rig, 'rammer4', 0.5, G, PZ0 + 7.4, N, 'ram');
  crewSpot(rig, 'bagman', 1.2, G, LZ - 1.0, E, 'stand'); // takes the cartridges off the charge lift
  crewSpot(rig, 'lift1', -1.3, G, LZ - LL / 2 - 0.55, W, 'operate'); // works the shell lift and the transfer trolley
  crewSpot(rig, 'lift2', 3.0, G, LZ - LL / 2 - 0.6, E, 'operate');
  crewSpot(rig, 'ammoA', -1.6, RH - 0.17, ZB + 2.6, E, 'push'); // on the ballast at the wagon: roll the shell into the cage
  crewSpot(rig, 'ammoB', -5.6, RH - 0.17, ZB + 3.4, W, 'push');
  crewSpot(rig, 'phone', -6.4, 0, -1.5, E, 'phone'); // the telephonist on the ground beside the girders
  for (const c of rig.anchors.crew) c.car = !['ammoA', 'ammoB', 'phone'].includes(c.role); // on the carriage: they ride its lurch
  return finishGun(rig);
}

export { buildGustavSite } from './heavy_gustav_site.js';

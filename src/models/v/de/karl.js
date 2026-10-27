import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, xLathe, rivets, rivetRow, handwheel, gearArc, shellGeometry, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun, pivotAt, hb, trayMount, floorFade, node } from '../../rig.js';
import { clamp01, instanceOf, wheelSet } from './heavy_common.js';

// 60 cm Mörser Karl-Gerät 040 (Rheinmetall, 1940), refs/karl (README: sources, dimensions, photo index). A
// self-propelled siege mortar 11.15 m long, 3.16 m wide and 4.38 m high (Wikipedia, Panzer Tracts via
// panzernet.net), 124 t. The hull is a long riveted box between the tracks (gauge 2,650 mm, track 500 mm,
// ground clearance 350 mm: de.wikipedia) in three parts: the lowering gear at the muzzle end, the open well in
// the middle where the mounting sits, and at the other end the engine (Daimler-Benz MB 503 A, 580 PS), the
// gearbox and the driver. It fires over its stern: the driver sits at the engine end ("the direction of
// travel was chosen against the direction of fire", de.wikipedia; "the muzzle pointed to the rear of the
// vehicle; it reversed into its firing position", Polish Army Museum; panzernet.net and Tank Encyclopedia
// agree), so in this rig (muzzle -Z) the engine deck, the 12-tooth drive sprocket and the driver's hatch are
// at +Z and the 18-spoked idler at -Z (the Kubinka survivor and the Thor drawing show the same). The later
// running gear: eleven steel road wheels and six return rollers a side, 94 links of 245 mm.
// On the well: the upper carriage (side frames with the trunnions, elevating pinions, the layer's handwheels
// on the left and the traverse on the right) and the cradle, a big riveted box with the recoil cylinders over
// the barrel, from which the short 60 cm barrel (5,068 mm, L/8.44) stands out about 1.6 m; the breech is a
// horizontal sliding wedge (panzernet.net). It loads at 0 degrees: the shell is lowered onto a tray behind the
// breech by the crane of the Munitionsschlepper (a Panzer IV conversion carrying four shells, parked
// alongside on the right) and rammed from the loading ramp over the engine deck (the Thor drawing, Bundesarchiv
// Bild 101I-695-0424-12A). Folding side platforms with railings run along both sides at deck level; lifting
// lugs at the four corners took the rail transporter's arms. Before firing the hull was let down on its
// suspension to rest on the ground (setLower). Unmeasured fittings are reconstructed from the photographs.
//
// Frames: root is the ground (y = 0), front -Z (the muzzle). `body` carries the hull and everything on it
// (position.y = -DROP * setLower(k)); the road wheels and the track's ground run stay on the ground.
// `traverse` (+-4 degrees) is the upper carriage on the well, its y from the deck; `elevation` the
// trunnions on the bore axis; `recoil` 1.2 m; `breech` the wedge (position.x, out to the right); `tray` a
// cross slide on the carriage (out to the left while the breech is shut). The Munitionsschlepper is
// `schlepper` (rig.setSchlepper(k): 0 alongside, 1 driven off 40 m astern and hidden), with `crane` (its
// jib, rotation.y; rig.craneRest is where it lies over the hold) and `hoist` (the hook, position.y = height
// above the ground while the carrier stands alongside). Built lowered (setLower(1)), as it fires; the crew
// spots stand on the lowered decks.

const DROP = 0.35; // ground clearance 350 mm: lowered, the belly rests on the ground
const BELLY = 0.35, DECK = 1.95; // hull bottom and deck top in travelling order
const HF = -4.78, HR = 5.92; // hull end faces: muzzle end (lowering gear), engine end (driver)
const HW = 1.03; // the hull box between the tracks
const WF = -2.3, WR = 1.9, WI = 0.94; // the open well (ends, inner half width: the cradle dips into it)
const TX = 1.325, TW = 0.5, TH = 0.06; // track centre (gauge 2,650 mm), width 500 mm, shoe thickness
const RW = 0.29, RWY = RW + TH; // road wheel radius and centre height
const NW = 11, WZ0 = -2.75, WDZ = 0.65; // eleven road wheels a side, contact about 7 m (7 m² of track)
const IDL = { z: -4.5, y: 0.8, r: 0.42 }; // idler, muzzle end
const SPR = { z: 5.6, y: 0.85, r: 0.47 }; // sprocket, engine end: pitch radius of 12 teeth at 245 mm
const RRY = 1.17, RRR = 0.13, NR = 6, RRZ = [0, 1, 2, 3, 4, 5].map((i) => -3.3 + i * 1.55); // return rollers
const FEND = 1.44; // the ledge over the track
const SPX = 1.66; // side platforms' outer edge (deployed)
const TYK = 3.1, TZK = -0.6; // trunnion (travelling) on the bore axis, and its station
const MUZ = -3.468, BRE = 1.6; // 5.068 m barrel, Gerät 040 (not the longer 54 cm Gerät 041)
const CB = { z0: -1.85, z1: 0.62, z2: 1.65, w: 0.85, y0: -0.75, y1: 1.12 }; // cradle box: front, main rear, rear frame end
const SHELL = { len: 2.5, rad: 0.3 }; // the 2,170 kg schwere Betongranate, 2,511 mm
const SCH = { x: 3.45, z0: -1.4, z1: 4.5 }; // the carrier's place: alongside on the right, facing astern
const CRANE = { x: SCH.x, z: 4.0 }; // its crane post near its front (the Karl's stern)
const PICK_Y = 2.08; // a shell's middle in the carrier's hold
const HANG = 0.9; // the shell's middle below the hook
const HOIST = { up: 4.95, down: PICK_Y + HANG };
const BX = 0.62, BSLIDE = 0.95; // the wedge: its pivot's x, and how far it slides open (clear of the bore)
// the loading tray: its hinge 0.12 m behind the breech face, 0.42 m under the bore; its length (the shell's last
// 0.2 m lies on the ramp, so the stowed tray ends short of loader1's place on the deck); its slide to the left
// (stowed, its rear end clears the railing at full left traverse); the cross slide's two rails under its front
// (close together, so the lanyard man keeps his place on the deck behind them)
const TRAY = { hz: BRE + 0.12, hy: -0.42, len: 2.45, slide: 0.85, rails: [0.12, 0.35] };
const PITCH = 0.245; // track pitch of the eleven-wheel chassis (94 links a side)
const TAU = Math.PI * 2;

// a plate in the x-y plane with a round hole (centre hy above its base), `t` thick along z, its base's middle
// at the origin; round: the radius of its top corners
function holedPlate(w, h, t, hr, hy, round = 0) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = 0, y1 = h;
  if (round) {
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1 - round);
    s.absarc(x1 - round, y1 - round, round, 0, Math.PI / 2, false);
    s.lineTo(x0 + round, y1);
    s.absarc(x0 + round, y1 - round, round, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0);
  } else { s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.lineTo(x0, y0); }
  const hole = new THREE.Path();
  hole.absarc(0, hy, hr, 0, TAU, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -t / 2);
}

// a ladder on an end face (rungs along x), from y0 to y1, standing off the face at z (dir: the face's normal)
function ladder(P, x, z, y0, y1, dir) {
  const zo = z + dir * 0.09;
  for (const s of [-0.18, 0.18]) {
    P.add('dark', rod(V(x + s, y0, zo), V(x + s, y1, zo), 0.018, 6));
    // the hooked tops over the deck edge
    P.add('dark', rod(V(x + s, y1, zo), V(x + s, y1 + 0.16, zo - dir * 0.05), 0.018, 6));
    P.add('dark', rod(V(x + s, y1 + 0.16, zo - dir * 0.05), V(x + s, y1 + 0.12, zo - dir * 0.2), 0.018, 6));
    for (const yy of [y0 + 0.1, y1 - 0.15]) P.add('dark', box(0.04, 0.04, 0.09, x + s, yy, z + dir * 0.045));
  }
  for (let y = y0 + 0.12; y < y1 - 0.05; y += 0.3) P.add('dark', rod(V(x - 0.18, y, zo), V(x + 0.18, y, zo), 0.014, 5));
}

export function buildKarl() {
  const rig = newGunRig('karl', 'dgrau');
  const root = rig.root;
  const mk = () => new Parts(rig.mats);
  const run = node(root, 'running');
  const body = node(root, 'body');
  const trav = pivotAt(rig, body, 'traverse', 0, DECK, TZK);
  const elev = pivotAt(rig, trav, 'elevation', 0, TYK - DECK, 0);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', BX, 0, BRE - 0.32);
  const sch = node(root, 'schlepper');
  rig.schlepper = sch; // (not a pivot: setSchlepper drives it)
  const crane = pivotAt(rig, sch, 'crane', CRANE.x, 0, CRANE.z);
  const R = Math.hypot(CRANE.x, CRANE.z - (TZK + TRAY.hz + 1.4)); // post to the tray's middle: the jib reaches both it and the hold
  const hoist = pivotAt(rig, crane, 'hoist', -R, HOIST.up, 0);
  rig.recoilLength = 1.2;
  rig.loadEl = 0;
  rig.hoistRange = { up: HOIST.up, down: HOIST.down };
  rig.hoistHang = HANG;
  rig.craneRest = -Math.PI / 2; // the hook over the hold, R astern of the post (toward -Z)
  rig.pickY = PICK_Y;
  rig.pickYaw = Math.PI / 2; // they lie across the hold
  // the rammer staff: long enough to seat the shell, short enough that the drive crews.js puts behind it
  // (0.7 staff lengths behind the shell's base) stands on the ramp, not in the air past the stern
  rig.staffLen = 2.6;
  // the tray slides 0.85 m to the left on its cross slide while the breech is shut: off the bore line and above
  // the breech's path (at 55 to 70 degrees the breech recoils down into the well), inside the railing at every
  // traverse; the shell's middle lies 1.4 m back from the hinge, on the bore line
  const tray = trayMount(rig, trav, elev, TRAY.hy, TRAY.hz, -TRAY.hy, 1.4, TRAY.slide);
  // the breech goes down into the well at 55 to 70 degrees: the stroke shortens before it meets the well floor
  floorFade(rig, TYK - BELLY - 0.09, BRE, 0.63, 0.06, 0.5);

  // ---------------------------------------------------------------- running gear
  // instanced sets turned together by setDrive: the road wheels stay on the ground, the sprockets, idlers and
  // return rollers ride the hull down when it is lowered
  const PW = mk(), PS = mk(), PI = mk(), PRR = mk();
  {
    // road wheel: a pair of dished steel discs either side of the guide horns (all-steel wheels, Nr. III to VII)
    for (const dx of [-0.11, 0.11]) {
      PW.add('steel', xTube(dx - 0.075, dx + 0.075, RW, RW, 26)); // the running rims
      PW.add('camo', xTube(dx - 0.081, dx + 0.081, RW - 0.04, RW - 0.04, 22)); // the painted disc inside them
    }
    PW.add('camo', xTube(-0.2, 0.2, 0.075, 0.075, 10)); // the hub between them
    for (const s of [-1, 1]) PW.add('camo', xLathe(s < 0 ? [[-0.22, 0], [-0.22, 0.05], [-0.19, 0.075]] : [[0.19, 0.075], [0.22, 0.05], [0.22, 0]], 10)); // hub caps
    // sprocket: two toothed rings (12 teeth) behind a flat cover disc, its hub boss
    for (const dx of [-0.12, 0.12]) {
      PS.add('camo', xTube(dx - 0.035, dx + 0.035, SPR.r - 0.04, SPR.r - 0.04, 24));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        PS.add('steel', box(0.07, 0.1, 0.11, dx, Math.cos(a) * (SPR.r + 0.01), Math.sin(a) * (SPR.r + 0.01), a));
      }
    }
    for (const s of [-1, 1]) {
      PS.add('camo', xTube(s * 0.16, s * 0.2, SPR.r - 0.05, SPR.r - 0.05, 28)); // the cover discs (the Kubinka sprocket)
      PS.add('camo', xLathe(s > 0 ? [[0.2, 0.0], [0.2, 0.17], [0.26, 0.14], [0.27, 0.0]] : [[-0.27, 0.0], [-0.26, 0.14], [-0.2, 0.17], [-0.2, 0.0]], 16));
    }
    PS.add('camo', xTube(-0.16, 0.16, 0.16, 0.16, 12));
    // idler: an 18-vaned cast wheel on a wide rim, a big hub
    for (const dx of [-0.11, 0.11]) PI.add('steel', xTube(dx - 0.075, dx + 0.075, IDL.r, IDL.r, 28));
    PI.add('camo', xLathe([[-0.2, IDL.r - 0.05], [-0.18, IDL.r - 0.09], [0.18, IDL.r - 0.09], [0.2, IDL.r - 0.05]], 28));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      PI.add('camo', box(0.32, IDL.r - 0.2, 0.05, 0, Math.cos(a) * (IDL.r + 0.1) / 2, Math.sin(a) * (IDL.r + 0.1) / 2, a - Math.PI / 2 + 0.25));
    }
    PI.add('camo', xLathe([[-0.22, 0.0], [-0.21, 0.12], [-0.18, 0.15], [0.18, 0.15], [0.21, 0.12], [0.22, 0.0]], 16));
    // return roller: a small double steel roller
    for (const dx of [-0.11, 0.11]) PRR.add('camo', xTube(dx - 0.06, dx + 0.06, RRR, RRR, 14));
    PRR.add('camo', xTube(-0.2, 0.2, 0.05, 0.05, 8));
  }
  const tW = new THREE.Group(), tS = new THREE.Group(), tI = new THREE.Group(), tR = new THREE.Group();
  PW.build(tW, { dirt: 0.45, y0: RWY }); PS.build(tS, { dirt: 0.6, y0: SPR.y }); PI.build(tI, { dirt: 0.6, y0: IDL.y }); PRR.build(tR, { dirt: 0.4, y0: RRY });
  const at = { w: [], s: [], i: [], r: [] };
  for (const s of [-1, 1]) {
    for (let i = 0; i < NW; i++) at.w.push(V(s * TX, RWY, WZ0 + i * WDZ));
    at.s.push(V(s * TX, SPR.y, SPR.z));
    at.i.push(V(s * TX, IDL.y, IDL.z));
    for (const z of RRZ) at.r.push(V(s * TX, RRY, z));
  }
  const wheels = wheelSet(tW, at.w, run, 'road-wheels');
  const sprockets = wheelSet(tS, at.s, body, 'sprockets');
  const idlers = wheelSet(tI, at.i, body, 'idlers');
  wheelSet(tR, at.r, body, 'return-rollers');

  // the track: heavy cast shoes on a belt round the road wheels, the sprocket, the return rollers and the
  // idler, recomputed when the hull is lowered (setLower) or the tracks run (setDrive)
  const PSH = mk();
  {
    PSH.add('dark', box(TW, 0.035, 0.2, 0, 0, 0)); // the plate
    PSH.add('dark', box(TW - 0.02, 0.045, 0.045, 0, -0.035, -0.05)); // grouser (outside: -y on the ground run)
    for (const x of [-0.17, 0, 0.17]) PSH.add('dark', box(0.03, 0.03, 0.17, x, -0.025, 0.02)); // the ribs of the cast link
    for (const z of [-0.105, 0.105]) PSH.add('dark', xTube(-TW / 2 + 0.01, TW / 2 - 0.01, 0.026, 0.026, 6, 0.0, z)); // hinge knuckles
    PSH.add('dark', box(0.05, 0.08, 0.12, 0, 0.055, 0)); // guide horn (inside)
  }
  const tSh = new THREE.Group();
  PSH.build(tSh, { dirt: 0.6, y0: 0.05 });
  // belt in the (z, y) plane of the hull: circles in counterclockwise order (ground run toward +Z, up the
  // sprocket, back over the return rollers, down the idler); outer tangents and the arcs between them
  const NC = 4 + NR, CZ = new Float32Array(NC), CY = new Float32Array(NC), CR = new Float32Array(NC);
  const AIN = new Float32Array(NC), AOUT = new Float32Array(NC);
  const LZ = new Float32Array(512), LY = new Float32Array(512), LS = new Float32Array(513);
  let LN = 0, LL = 0, n = 0;
  const C = (z, y, r) => { CZ[n] = z; CY[n] = y; CR[n] = r; n++; };
  const loop = (drop) => {
    n = 0;
    C(WZ0, RWY, RW + TH / 2); C(WZ0 + (NW - 1) * WDZ, RWY, RW + TH / 2);
    C(SPR.z, SPR.y - drop, SPR.r);
    for (let i = NR - 1; i >= 0; i--) C(RRZ[i], RRY - drop, RRR + TH / 2);
    C(IDL.z, IDL.y - drop, IDL.r + TH / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dz = CZ[j] - CZ[i], dy = CY[j] - CY[i], D = Math.hypot(dz, dy) || 1;
      const ux = dz / D, uy = dy / D, s = Math.max(-1, Math.min(1, (CR[i] - CR[j]) / D)), c = Math.sqrt(1 - s * s);
      const nz = uy * c + ux * s, ny = -ux * c + uy * s; // the right-hand normal, tilted for unequal radii
      AOUT[i] = Math.atan2(ny, nz); AIN[j] = AOUT[i];
    }
    LN = 0;
    for (let i = 0; i < n; i++) {
      let da = ((AOUT[i] - AIN[i]) % TAU + TAU) % TAU;
      if (da > TAU - 1e-3) da = 0;
      const k = Math.max(1, Math.ceil(da / (14 * DEG)));
      for (let q = 0; q <= k; q++) {
        const a = AIN[i] + (da * q) / k;
        LZ[LN] = CZ[i] + CR[i] * Math.cos(a); LY[LN] = CY[i] + CR[i] * Math.sin(a); LN++;
        if (da === 0) break;
      }
    }
    LS[0] = 0;
    for (let i = 1; i <= LN; i++) { const j = i % LN, p = i - 1; LS[i] = LS[p] + Math.hypot(LZ[j] - LZ[p], LY[j] - LY[p]); }
    LL = LS[LN];
  };
  loop(DROP);
  const NSH = Math.round(LL / PITCH);
  const shoes = instanceOf(tSh, NSH * 2, run, 'track');
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _x = new THREE.Vector3(1, 0, 0);
  let dist = 0, low = 1, lastD = NaN, lastL = NaN;
  const place = () => {
    if (dist === lastD && low === lastL) return;
    if (low !== lastL) loop(DROP * low);
    lastD = dist; lastL = low;
    const pitch = LL / NSH;
    let seg = 0;
    for (let i = 0; i < NSH; i++) {
      let sv = (i * pitch + dist) % LL;
      if (sv < 0) sv += LL;
      if (LS[seg] > sv) seg = 0;
      while (seg < LN - 1 && LS[seg + 1] < sv) seg++;
      const a = seg, b = (seg + 1) % LN, f = (sv - LS[a]) / Math.max(1e-6, LS[seg + 1] - LS[a]);
      const tz = LZ[b] - LZ[a], ty = LY[b] - LY[a], l = Math.hypot(tz, ty) || 1;
      _q.setFromAxisAngle(_x, Math.atan2(-ty / l, tz / l));
      _p.set(-TX, LY[a] + ty * f, LZ[a] + tz * f);
      _m.compose(_p, _q, _s);
      for (const im of shoes) im.setMatrixAt(i, _m);
      _p.x = TX;
      _m.compose(_p, _q, _s);
      for (const im of shoes) im.setMatrixAt(i + NSH, _m);
    }
    for (const im of shoes) im.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- hull (body frame = travelling height)
  const PB = mk();
  {
    // the box between the tracks: the two end compartments (lowering gear; engine, gearbox and driver) full
    // height with rounded lower ends, the well's side walls between them, its floor low down
    const prof = (z0, z1, r0, r1) => {
      const p = [[z1, DECK], [z0, DECK]];
      const corner = (zc, sgn, r) => {
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI / 2;
          p.push(sgn < 0 ? [zc + r - r * Math.cos(a), BELLY + r - r * Math.sin(a)] : [zc - r + r * Math.sin(a), BELLY + r - r * Math.cos(a)]);
        }
      };
      if (r0) corner(z0, -1, r0); else p.push([z0, BELLY]);
      if (r1) corner(z1, 1, r1); else p.push([z1, BELLY]);
      return p;
    };
    PB.add('camo', sideProfile(prof(HF, WF, 0.42, 0), 2 * HW, 0.02));
    PB.add('camo', sideProfile(prof(WR, HR, 0, 0.42), 2 * HW, 0.02));
    for (const s of [-1, 1]) PB.add('camo', box(HW - WI, DECK - BELLY, WR - WF, s * (WI + HW) / 2, (DECK + BELLY) / 2, (WF + WR) / 2));
    PB.add('camo', box(2 * WI, 0.08, WR - WF, 0, BELLY + 0.04, (WF + WR) / 2));
    PB.add('dark', box(2 * WI - 0.04, 0.02, WR - WF - 0.04, 0, BELLY + 0.09, (WF + WR) / 2)); // the well's floor, oily
    for (const z of [WF, WR]) PB.add('dark', box(2 * WI, DECK - BELLY - 0.12, 0.02, 0, (DECK + BELLY) / 2, z + (z < 0 ? 0.011 : -0.011)));
    // the carriage's slide rails along the well's edges (it recoils 78 cm on them: panzernet.net)
    for (const s of [-1, 1]) {
      PB.add('steel', box(0.08, 0.035, WR - WF + 0.3, s * 0.985, DECK + 0.017, (WF + WR) / 2));
      PB.add('dark', box(0.02, 0.05, WR - WF, s * (WI - 0.01), DECK + 0.02, (WF + WR) / 2));
    }
    // riveted seams: the deck edge, the end faces, the butts at the well
    for (const s of [-1, 1]) {
      PB.add('dark', rivetRow(V(s * (HW + 0.004), DECK - 0.06, HF + 0.1), V(s * (HW + 0.004), DECK - 0.06, HR - 0.1), 0.2, V(s, 0, 0), 0.018));
      PB.add('dark', rivetRow(V(s * (HW + 0.004), BELLY + 0.5, HF + 0.5), V(s * (HW + 0.004), BELLY + 0.5, HR - 0.5), 0.25, V(s, 0, 0), 0.018));
      for (const z of [WF, WR]) PB.add('dark', rivetRow(V(s * (HW + 0.004), BELLY + 0.25, z), V(s * (HW + 0.004), DECK - 0.12, z), 0.16, V(s, 0, 0), 0.018));
      PB.add('camo', box(0.025, DECK - BELLY - 0.3, 0.12, s * (HW + 0.012), (DECK + BELLY) / 2, WF));
      PB.add('camo', box(0.025, DECK - BELLY - 0.3, 0.12, s * (HW + 0.012), (DECK + BELLY) / 2, WR));
    }
    for (const [z, d] of [[HF, -1], [HR, 1]]) {
      PB.add('dark', rivetRow(V(-HW + 0.08, DECK - 0.06, z + d * 0.004), V(HW - 0.08, DECK - 0.06, z + d * 0.004), 0.18, V(0, 0, d), 0.018));
      for (const s of [-1, 1]) PB.add('dark', rivetRow(V(s * (HW - 0.06), BELLY + 0.45, z + d * 0.004), V(s * (HW - 0.06), DECK - 0.12, z + d * 0.004), 0.18, V(0, 0, d), 0.018));
    }

    // the ledges over the tracks with their lips, and the folding side platforms at deck level (a grating
    // floor on brackets, railings on stanchions; deployed, as at Kubinka and in the Warsaw photographs)
    for (const s of [-1, 1]) {
      PB.add('camo', box(SPX - 0.06 - HW, 0.05, HR - HF - 0.5, s * (HW + SPX - 0.06) / 2, FEND + 0.025, (HF + HR) / 2));
      PB.add('camo', box(0.03, 0.12, HR - HF - 0.5, s * (SPX - 0.075), FEND - 0.03, (HF + HR) / 2));
      PB.add('dark', rivetRow(V(s * (SPX - 0.058), FEND - 0.03, HF + 0.4), V(s * (SPX - 0.058), FEND - 0.03, HR - 0.4), 0.3, V(s, 0, 0), 0.014));
      const z0 = HF + 0.85, z1 = HR - 0.45, xm = s * (HW + SPX) / 2;
      for (const x of [HW + 0.02, SPX - 0.02]) PB.add('camo', box(0.04, 0.06, z1 - z0, s * x, DECK - 0.03, (z0 + z1) / 2));
      for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 7) PB.add('camo', box(SPX - HW, 0.06, 0.05, xm, DECK - 0.03, z));
      for (let z = z0 + 0.06; z < z1 - 0.04; z += 0.11) PB.add('dark', box(SPX - HW - 0.06, 0.03, 0.025, xm, DECK - 0.025, z));
      for (let z = z0 + 0.2; z < z1; z += 1.32) {
        // under-brackets down to the hull side
        PB.add('camo', rod(V(s * (HW + 0.02), DECK - 0.42, z), V(s * (SPX - 0.05), DECK - 0.06, z), 0.025, 5));
      }
      // stanchions and rails (a gap by the layer's and traverser's handwheels)
      const posts = [-3.85, -2.6, -1.35, 1.0, 2.3, 3.6, 4.9];
      for (const z of posts) PB.add('camo', rod(V(s * (SPX - 0.03), DECK, z), V(s * (SPX - 0.03), DECK + 1.0, z), 0.02, 6));
      for (const y of [0.5, 1.0]) PB.add('camo', rod(V(s * (SPX - 0.03), DECK + y, posts[0]), V(s * (SPX - 0.03), DECK + y, posts[posts.length - 1]), 0.017, 6));
      for (const z of [posts[0], posts[posts.length - 1]]) PB.add('camo', rod(V(s * (SPX - 0.03), DECK + 1.0, z), V(s * (HW + 0.05), DECK + 1.0, z), 0.017, 6));
    }

    // muzzle end: the end face with two ladders, the lifting lugs of the rail transporter at the top corners
    // (L-shaped castings bolted down the face), towing eyes low down, the travel lock's brackets on the deck
    for (const x of [-0.42, 0.42]) ladder(PB, x, HF, BELLY + 0.15, DECK, -1);
    for (const s of [-1, 1]) {
      PB.add('camo', holedPlate(0.42, 0.7, 0.13, 0.085, 0.47, 0.2).translate(s * 0.8, DECK - 0.02, HF + 0.11));
      PB.add('steel', zTube(HF + 0.02, HF + 0.2, 0.06, 0.06, 10, s * 0.8, DECK + 0.45));
      PB.add('camo', box(0.4, 1.0, 0.07, s * 0.8, DECK - 0.52, HF - 0.035));
      PB.add('dark', rivets([0, 1, 2, 3].map((k) => V(s * 0.8 + (k % 2 ? 0.12 : -0.12), DECK - 0.2 - Math.floor(k / 2) * 0.55, HF - 0.07)), V(0, 0, -1), 0.03));
      PB.add('camo', holedPlate(0.36, 0.34, 0.1, 0.07, 0.17, 0.12).translate(s * 0.75, BELLY + 0.45, HF - 0.05));
      // the travel lock's two cheeks with their Z-shaped bracing
      PB.add('camo', sideProfile([[-0.45, 0], [0.45, 0], [0.45, 0.08], [-0.2, 0.62], [-0.45, 0.62]], 0.05).translate(s * 0.62, DECK, -3.8));
      PB.add('camo', rod(V(s * 0.62, DECK + 0.08, -3.4), V(s * 0.62, DECK + 0.55, -4.2), 0.03, 5));
    }
    // engine end: the end face with the engine-room door and its rain hood, the driver's visor and ladder,
    // towing eyes; lifting lugs set into the side edges; on the deck the driver's hatch (plated over for
    // firing), the round ventilator beside it, the engine hatches and the louvred intakes
    PB.add('camo', box(0.56, 0.86, 0.04, -0.52, 1.22, HR + 0.02));
    for (const y of [0.92, 1.52]) PB.add('dark', box(0.08, 0.1, 0.06, -0.82, y, HR + 0.03));
    PB.add('dark', box(0.04, 0.16, 0.05, -0.3, 1.22, HR + 0.05));
    PB.add('camo', box(0.66, 0.05, 0.24, -0.52, 1.7, HR + 0.1, -0.3));
    PB.add('camo', box(0.46, 0.16, 0.12, 0.55, DECK - 0.24, HR + 0.06));
    PB.add('dark', box(0.32, 0.03, 0.02, 0.55, DECK - 0.24, HR + 0.125));
    PB.add('camo', box(0.52, 0.04, 0.18, 0.55, DECK - 0.13, HR + 0.1));
    ladder(PB, 0.03, HR, BELLY + 0.15, DECK, 1);
    for (const s of [-1, 1]) {
      PB.add('camo', holedPlate(0.36, 0.34, 0.1, 0.07, 0.17, 0.12).translate(s * 0.75, BELLY + 0.45, HR + 0.05));
      PB.add('camo', holedPlate(0.38, 0.62, 0.12, 0.08, 0.42, 0.19).rotateY(Math.PI / 2).translate(s * (HW + 0.07), DECK - 0.1, HR - 1.6));
      PB.add('steel', xTube(s * (HW - 0.01), s * (HW + 0.15), 0.055, 0.055, 10, DECK + 0.32, HR - 1.6));
      // the lamps on the driving front
      PB.add('lens', zTube(HR + 0.1, HR + 0.13, 0.07, 0.07, 10, s * 0.88, DECK - 0.22));
      PB.add('dark', zTube(HR, HR + 0.11, 0.09, 0.08, 10, s * 0.88, DECK - 0.22));
    }
    PB.add('camo', box(0.62, 0.035, 0.62, 0.62, DECK + 0.017, HR - 0.5)); // the driver's hatch cover
    for (const z of [HR - 0.7, HR - 0.3]) PB.add('dark', box(0.1, 0.05, 0.08, 0.95, DECK + 0.03, z));
    PB.add('camo', yTube(DECK, DECK + 0.05, 0.3, 0.3, 20, -0.6, HR - 0.55)); // the ventilator
    for (let k = 0; k < 6; k++) PB.add('dark', box(0.5, 0.02, 0.025, -0.6, DECK + 0.055, HR - 0.75 + k * 0.08));
    for (const z of [2.9, 4.2]) {
      PB.add('camo', box(0.62, 0.03, 0.85, -0.55, DECK + 0.015, z));
      PB.add('camo', box(0.62, 0.03, 0.85, 0.55, DECK + 0.015, z));
      for (const x of [-0.55, 0.55]) PB.add('dark', box(0.12, 0.04, 0.05, x, DECK + 0.03, z - 0.3));
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k < 18; k++) PB.add('dark', box(0.16, 0.02, 0.05, s * 0.93, DECK + 0.006, WR + 0.3 + k * 0.17));
      // the exhaust silencers on the ledges, under the platforms, with their pipes out of the engine room
      PB.add('rust', zTube(1.4, 4.2, 0.19, 0.19, 16, s * 1.33, FEND + 0.25), { tint: 0x8c7464 });
      for (const z of [1.4, 4.2]) PB.add('rust', zLathe(z < 2 ? [[z - 0.12, 0.0], [z - 0.1, 0.12], [z, 0.19]] : [[z, 0.19], [z + 0.1, 0.12], [z + 0.12, 0.0]], 16).translate(s * 1.33, FEND + 0.25, 0));
      PB.add('rust', rod(V(s * HW, FEND + 0.3, 3.9), V(s * 1.22, FEND + 0.28, 3.95), 0.06, 8));
      PB.add('rust', rod(V(s * 1.33, FEND + 0.25, 1.28), V(s * 1.33, FEND + 0.12, 0.9), 0.055, 8));
      for (const z of [1.9, 3.7]) PB.add('dark', box(0.42, 0.04, 0.06, s * 1.33, FEND + 0.05, z));
      // rolled camouflage nets on the ledges at the muzzle end
      PB.add('cloth', zTube(-3.65, -2.2, 0.17, 0.17, 12, s * 1.33, FEND + 0.22), { tint: 0xa89e79 });
      for (const z of [-3.4, -2.45]) PB.add('rope', new THREE.TorusGeometry(0.175, 0.014, 5, 14).translate(s * 1.33, FEND + 0.22, z));
    }

    // the running gear's fixed parts: the idler's crank and its riveted bracket plate (outboard, the Kubinka
    // photographs), the final drive housings, the return rollers' stub brackets
    for (const s of [-1, 1]) {
      const plate = [[IDL.z + 0.02, IDL.y - 0.13], [IDL.z + 0.02, IDL.y + 0.13], [-3.75, FEND - 0.14], [-3.1, FEND - 0.14], [-3.1, RWY + 0.1], [-3.6, RWY + 0.02]];
      PB.add('camo', sideProfile(plate, 0.05).translate(s * (TX + TW / 2 + 0.07), 0, 0));
      PB.add('dark', rivets([[-4.15, 0.93], [-3.85, 1.12], [-3.6, 1.22], [-3.2, 1.22], [-3.2, 0.95], [-3.2, 0.7], [-3.2, 0.48], [-3.55, 0.42], [-3.85, 0.55], [-4.15, 0.68], [-3.6, 0.85]].map(([z, y]) => V(s * (TX + TW / 2 + 0.1), y, z)), V(s, 0, 0), 0.025));
      PB.add('camo', xTube(s * (TX + TW / 2 + 0.04), s * (TX + TW / 2 + 0.16), 0.13, 0.13, 14, IDL.y, IDL.z));
      PB.add('camo', xTube(s * (TX + TW / 2 + 0.04), s * (TX + TW / 2 + 0.14), 0.1, 0.1, 12, RWY + 0.12, -3.1));
      PB.add('camo', xTube(s * HW, s * (TX - 0.18), 0.28, 0.28, 18, SPR.y, SPR.z));
      for (const z of RRZ) PB.add('dark', xTube(s * HW, s * (TX - 0.2), 0.045, 0.045, 6, RRY, z));
      // the torsion-arm housings along the hull side
      for (let i = 0; i < NW; i++) PB.add('dark', xTube(s * HW, s * (HW + 0.07), 0.08, 0.08, 8, RWY + 0.18, WZ0 + i * WDZ + 0.38));
    }
  }

  // ---------------------------------------------------------------- upper carriage (traverse frame, y from the deck)
  const PT = mk();
  const hy = TYK - DECK; // trunnion height above the deck
  {
    // the slide girders on the rails, the transoms, the side frames up to the trunnion bearings (riveted
    // plate with the lattice bracing under the cradle seen at Kubinka)
    // (behind the trunnion bearing the cheeks step down to a flat top under the tray's cross slide, which rests on them)
    const tb = hy + TRAY.hy - 0.015 - 0.035; // the slide rails' underside: the tray's cross bars ride on their tops
    for (const s of [-1, 1]) {
      PT.add('camo', box(0.12, 0.3, 4.3, s * 0.98, 0.15 + 0.035, 0.4));
      const cheek = [[-1.75, 0.3], [-1.75, 0.62], [-0.6, hy + 0.48], [0.55, hy + 0.48], [1.38, 1.0], [TRAY.hz - 0.06, tb], [2.5, tb], [2.5, 0.3]];
      PT.add('camo', sideProfile(cheek, 0.12, 0.01).translate(s * 0.985, 0, 0));
      PT.add('camo', box(0.04, 0.12, 4.15, s * 1.06, 0.42, 0.37)); // the lower boom of the bracing
      for (const [a, b] of [[[-1.6, 0.42], [-0.95, 1.2]], [[-0.95, 1.2], [-0.3, 0.42]], [[0.4, 0.42], [1.0, 1.05]], [[1.0, 1.05], [1.65, 0.42]], [[1.65, 0.42], [2.25, 0.6]]]) {
        PT.add('camo', rod(V(s * 1.065, a[1], a[0]), V(s * 1.065, b[1], b[0]), 0.045, 4));
      }
      PT.add('dark', rivetRow(V(s * 1.081, 0.42, -1.65), V(s * 1.081, 0.42, 2.4), 0.2, V(s, 0, 0), 0.02));
      PT.add('dark', rivetRow(V(s * 1.046, hy + 0.4, -0.5), V(s * 1.046, hy + 0.4, 0.5), 0.2, V(s, 0, 0), 0.02));
      // trunnion bearing caps with their bolt circles
      PT.add('camo', xTube(s * 0.925, s * 1.12, 0.36, 0.36, 22, hy, 0));
      PT.add('camo', xTube(s * 1.12, s * 1.17, 0.27, 0.27, 20, hy, 0));
      const bolts = [];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; bolts.push(V(s * 1.125, hy + Math.sin(a) * 0.31, Math.cos(a) * 0.31)); }
      PT.add('dark', rivets(bolts, V(s, 0, 0), 0.03));
      // the elevating gearbox and its pinion on the arc (at 35 degrees behind and below the trunnion)
      PT.add('camo', rbox(0.2, 0.36, 0.38, 0.03, s * 1.13, hy - 1.28 * Math.sin(35 * DEG), 1.28 * Math.cos(35 * DEG)));
      PT.add('dark', xTube(s * 0.9, s * 1.05, 0.08, 0.08, 10, hy - 1.33 * Math.sin(35 * DEG), 1.33 * Math.cos(35 * DEG)));
    }
    PT.add('camo', box(1.7, 0.3, 0.32, 0, 0.185, -1.6)); // front transom (under the barrel)
    PT.add('camo', box(1.7, 0.3, 0.32, 0, 0.185, 2.35)); // rear transom, behind the breech's sweep
    // the tray's cross slide: two rails across the cheek tops, from the stowed place on the left to the right
    // cheek, with stops where the tray lies on the bore line and where it is stowed
    {
      const x0 = -TRAY.slide - 0.47, x1 = 1.05;
      for (const zr of TRAY.rails) {
        const z = TRAY.hz + zr;
        PT.add('steel', box(x1 - x0, 0.035, 0.07, (x0 + x1) / 2, tb + 0.0175, z));
        for (const s of [-1, 1]) PT.add('camo', box(0.16, 0.05, 0.16, s * 0.985, tb - 0.025, z)); // the seat on the cheek
        for (const x of [x0 + 0.05, 0.42]) PT.add('dark', box(0.04, 0.045, 0.07, x, tb + 0.0575, z)); // the stops
      }
    }
    PT.add('dark', rivetRow(V(-0.8, 0.3, -1.765), V(0.8, 0.3, -1.765), 0.16, V(0, 0, -1), 0.02));
    // the layer's handwheels on the left (big coarse, small fine: the big wheel of the Kubinka photographs)
    PT.add('iron', handwheel(0.3, 6, 0.024, 0.05).translate(-1.2, 1.0, 0.35));
    PT.add('dark', xTube(-1.2, -1.03, 0.035, 0.035, 8, 1.0, 0.35));
    PT.add('iron', handwheel(0.17, 5, 0.018, 0.04).translate(-1.17, 0.95, 0.95));
    PT.add('dark', xTube(-1.17, -1.03, 0.03, 0.03, 8, 0.95, 0.95));
    PT.add('camo', rbox(0.16, 0.3, 0.5, 0.03, -1.1, 0.65, 0.6));
    // the panoramic sight on its bracket above the layer
    PT.add('camo', box(0.08, 0.55, 0.08, -1.12, hy + 0.2, -0.2));
    PT.add('dark', yTube(hy + 0.47, hy + 0.62, 0.06, 0.06, 10, -1.12, -0.2));
    PT.add('dark', zTube(-0.35, -0.12, 0.035, 0.035, 8, -1.12, hy + 0.66));
    PT.add('glass', box(0.06, 0.05, 0.02, -1.12, hy + 0.58, -0.27));
    // the traverse handwheel on the right with its gearbox to the rack ahead of the well
    PT.add('iron', handwheel(0.24, 5, 0.02, 0.045).translate(1.18, 0.95, 0.95));
    PT.add('dark', xTube(1.03, 1.18, 0.03, 0.03, 8, 0.95, 0.95));
    PT.add('camo', rbox(0.18, 0.4, 0.4, 0.03, 1.1, 0.55, 1.15));
    PT.add('dark', zTube(-1.7, 1.0, 0.035, 0.035, 6, 1.15, 0.3));

    // the loading ramp over the engine deck: a box girder on two posts carrying the shell's rails at the bore
    // line, from the tray back past the hull end (the Thor drawing; Bundesarchiv 101I-695-0424-12A). The rails
    // continue the tray's runners; the cap plate between them lies lower, under the shell's belly where its
    // base end overhangs the tray and under the rammer's head
    const r0 = TRAY.hz + TRAY.len, r1 = HR + 0.15 - TZK, ry = hy - 0.26; // (from where the tray ends)
    PT.add('camo', box(0.2, 0.46, r1 - r0, 0, ry - 0.31, (r0 + r1) / 2));
    PT.add('camo', box(0.44, 0.03, r1 - r0, 0, ry - 0.065, (r0 + r1) / 2));
    for (const s of [-1, 1]) {
      PT.add('steel', box(0.05, 0.05, r1 - r0, s * 0.15, ry - 0.039, (r0 + r1) / 2)); // (level with the tray's runners)
      PT.add('camo', box(0.03, 0.1, r1 - r0, s * 0.21, ry - 0.04, (r0 + r1) / 2));
      for (let z = r0 + 0.4; z < r1 - 0.2; z += 0.55) PT.add('dark', xTube(s * 0.1, s * 0.104, 0.11, 0.11, 12, ry - 0.31, z));
      PT.add('dark', rivetRow(V(s * 0.104, ry - 0.11, r0 + 0.1), V(s * 0.104, ry - 0.11, r1 - 0.1), 0.15, V(s, 0, 0), 0.012));
    }
    for (const z of [4.9, 5.95]) { // (at 4.3 and 5.35 on the deck, between the rammers' places)
      PT.add('camo', box(0.16, ry - 0.54, 0.16, 0, (ry - 0.54) / 2, z));
      PT.add('camo', box(0.4, 0.04, 0.4, 0, 0.02, z));
    }
    PT.add('camo', box(0.44, 0.12, 0.08, 0, ry - 0.04, r1 - 0.04)); // the stop at the end
  }
  // ---------------------------------------------------------------- cradle (elevation frame, origin on the bore at the trunnions)
  const PE = mk();
  {
    // the cradle: a riveted box round the barrel's rear 60 percent, the recoil cylinders over the barrel
    // (their ends stand out of the front face: Bundesarchiv 101I-695-0424-15A, -25A), stepped down behind
    // the trunnions to an open frame round the breech, through which the wedge slides out to the right
    const side = [[CB.z0, CB.y0 + 0.12], [CB.z0 + 0.12, CB.y0], [CB.z1, CB.y0], [CB.z1, CB.y1 - 0.1], [CB.z1 - 0.12, CB.y1], [CB.z0 + 0.32, CB.y1], [CB.z0, CB.y1 - 0.32]];
    PE.add('camo', sideProfile(side, 2 * CB.w, 0.015));
    // the barrel's guide ring at the front face
    PE.add('camo', zLathe([[CB.z0 - 0.07, 0.525], [CB.z0 - 0.07, 0.565], [CB.z0 - 0.02, 0.585], [CB.z0, 0.585], [CB.z0, 0.525]], 28));
    // the open rear frame round the breech ring: low side plates (the right one slotted for the wedge), the
    // bottom plate, a tie across the top behind the ring
    const ry0 = CB.y0, ry1 = 0.58;
    PE.add('camo', box(0.06, ry1 - ry0, CB.z2 - CB.z1, -(CB.w - 0.03), (ry0 + ry1) / 2, (CB.z1 + CB.z2) / 2));
    for (const [z0, z1] of [[CB.z1, BRE - 0.5], [BRE - 0.12, CB.z2]]) PE.add('camo', box(0.06, ry1 - ry0, z1 - z0, CB.w - 0.03, (ry0 + ry1) / 2, (z0 + z1) / 2));
    for (const y of [ry0 + 0.05, ry1 - 0.05]) PE.add('camo', box(0.06, 0.1, 0.4, CB.w - 0.03, y, BRE - 0.31));
    PE.add('camo', box(2 * CB.w, 0.06, CB.z2 - CB.z1, 0, ry0 + 0.03, (CB.z1 + CB.z2) / 2));
    for (const s of [-1, 1]) PE.add('camo', rbox(0.1, 0.12, CB.z2 - CB.z1, 0.02, s * (CB.w - 0.06), ry1 + 0.02, (CB.z1 + CB.z2) / 2));
    // edge angles and rivet lines on the sides
    for (const s of [-1, 1]) {
      const x = s * (CB.w + 0.002);
      PE.add('dark', rivetRow(V(x, CB.y1 - 0.06, CB.z0 + 0.4), V(x, CB.y1 - 0.06, CB.z1 - 0.15), 0.26, V(s, 0, 0), 0.02));
      PE.add('dark', rivetRow(V(x, CB.y0 + 0.06, CB.z0 + 0.25), V(x, CB.y0 + 0.06, CB.z1 - 0.05), 0.4, V(s, 0, 0), 0.02));
      PE.add('camo', box(0.03, 0.1, CB.z1 - CB.z0 - 0.4, s * (CB.w + 0.015), 0.48, (CB.z0 + CB.z1) / 2 + 0.1)); // a stiffening rib
      PE.add('camo', box(0.025, 0.7, 0.75, s * (CB.w + 0.012), -0.08, -1.25)); // a bolted inspection cover
      PE.add('dark', rivets([[-0.38, -0.31], [0.38, -0.31], [-0.38, 0.17], [0.38, 0.17]].map(([dz, y]) => V(s * (CB.w + 0.026), y, -1.25 + dz * 0.9)), V(s, 0, 0), 0.022));
      // the trunnions and the trunnion boss with its bolt circle
      PE.add('steel', xTube(s * CB.w, s * 1.0, 0.22, 0.22, 14));
      PE.add('camo', xTube(s * CB.w, s * (CB.w + 0.05), 0.42, 0.42, 20));
      const bolts = [];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; bolts.push(V(s * (CB.w + 0.052), Math.sin(a) * 0.35, Math.cos(a) * 0.35)); }
      PE.add('dark', rivets(bolts, V(s, 0, 0), 0.026));
      // the elevating arcs: toothed sectors bolted to the sides behind the trunnions (Bundesarchiv -15A)
      PE.add('steel', gearArc(1.18, 1.3, -38 * DEG, 37 * DEG, 0.05, 18, 0.05).translate(s * 0.885, 0, 0));
      PE.add('camo', gearArc(0.5, 1.18, -38 * DEG, 37 * DEG, 0.04).translate(s * 0.875, 0, 0));
    }
    // the recoil brake cylinders' front ends with domed caps, the recuperator's bolted cover between them
    for (const s of [-1, 1]) {
      PE.add('camo', zLathe([[CB.z0 - 0.36, 0.0], [CB.z0 - 0.36, 0.1], [CB.z0 - 0.32, 0.15], [CB.z0 - 0.26, 0.17], [CB.z0 - 0.26, 0.2], [CB.z0 - 0.2, 0.2], [CB.z0 - 0.2, 0.17], [CB.z0, 0.17]], 14).translate(s * 0.47, 0.74, 0));
      PE.add('dark', rivets([0, 1, 2, 3, 4, 5].map((k) => V(s * 0.47 + Math.cos(k * TAU / 6) * 0.185, 0.74 + Math.sin(k * TAU / 6) * 0.185, CB.z0 - 0.262)), V(0, 0, -1), 0.018));
    }
    // and their rear ends: three round caps on the rear face over the breech (Bundesarchiv 101I-695-0424-33A)
    for (const x of [-0.5, 0, 0.5]) {
      PE.add('camo', zLathe([[CB.z1, 0.17], [CB.z1 + 0.1, 0.17], [CB.z1 + 0.12, 0.14], [CB.z1 + 0.14, 0.0]], 14).translate(x, 0.86, 0));
      PE.add('dark', zTube(CB.z1 + 0.13, CB.z1 + 0.18, 0.05, 0.05, 6, x, 0.86));
    }
    PE.add('camo', box(0.36, 0.36, 0.05, 0, 0.74, CB.z0 - 0.02));
    PE.add('dark', rivets([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => V(a * 0.13, 0.74 + b * 0.13, CB.z0 - 0.05)), V(0, 0, -1), 0.03));
    PE.add('steel', zTube(CB.z0 - 0.09, CB.z0 - 0.04, 0.06, 0.06, 8, 0, 0.74));
    // lifting eyes and filler plugs on the top, a clinometer seat on the right
    for (const z of [-1.2, 0.2]) for (const s of [-1, 1]) PE.add('steel', new THREE.TorusGeometry(0.07, 0.02, 4, 8).rotateY(Math.PI / 2).translate(s * 0.55, CB.y1 + 0.075, z));
    for (const z of [-0.9, -0.4]) PE.add('dark', yTube(CB.y1, CB.y1 + 0.04, 0.07, 0.07, 8, 0, z));
    PE.add('camo', box(0.2, 0.18, 0.4, CB.w + 0.1, 0.25, -0.2));
  }
  // ---------------------------------------------------------------- barrel (recoil frame) and the wedge
  const PR = mk();
  {
    // the short fat barrel: its jacket from the cradle out to the muzzle with a shrunk-on hoop, the breech
    // ring a heavy cylinder with the wedge's slot
    const p = [[MUZ, 0.3], [MUZ, 0.44], [MUZ + 0.04, 0.455], [MUZ + 0.75, 0.475], [MUZ + 0.75, 0.5], [MUZ + 0.82, 0.505], [CB.z0 + 0.4, 0.52], [0.9, 0.55], [0.9, 0]];
    PR.add('camo', zLathe(p, 32), { tint: 0xd8dadb });
    PR.add('steel', zLathe([[MUZ - 0.003, 0.3], [MUZ - 0.003, 0.442], [MUZ + 0.035, 0.452]], 32));
    PR.add('dark', zLathe([[MUZ + 1.6, 0.3], [MUZ - 0.002, 0.3]], 24)); // the bore (listed breech first: faces inward)
    PR.add('dark', new THREE.CircleGeometry(0.3, 32).rotateY(Math.PI).translate(0, 0, MUZ + 1.6));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      PR.add('dark', rod(V(Math.cos(a) * 0.298, Math.sin(a) * 0.298, MUZ + 0.005), V(Math.cos(a + 0.1) * 0.298, Math.sin(a + 0.1) * 0.298, MUZ + 0.7), 0.004, 3));
    }
    // breech ring: open at the back down to the wedge (the bore's last length shows behind it)
    PR.add('camo', zLathe([[0.9, 0.0], [0.9, 0.6], [0.94, 0.63], [BRE - 0.04, 0.63], [BRE, 0.6], [BRE, 0.3], [BRE - 0.17, 0.3]], 28), { tint: 0xd8dadb });
    PR.add('dark', box(0.03, 0.9, 0.32, 0.615, 0, BRE - 0.32)); // the wedge's slot, right
    PR.add('dark', box(0.03, 0.9, 0.32, -0.615, 0, BRE - 0.32)); // and left (the wedge's end shows flush)
    PR.add('dark', rivets([0, 1, 2, 3, 4, 5, 6, 7].map((k) => V(Math.cos((k + 0.5) * TAU / 8) * 0.47, Math.sin((k + 0.5) * TAU / 8) * 0.47, BRE + 0.002)), V(0, 0, 1), 0.03));
    // the recoil rods' crosshead behind the ring, under the cradle's top
    PR.add('camo', box(0.9, 0.16, 0.18, 0, 0.62, 1.0));
    PR.add('steel', zTube(-1.2, 0.95, 0.06, 0.06, 8, -0.3, 0.68));
    PR.add('steel', zTube(-1.2, 0.95, 0.06, 0.06, 8, 0.3, 0.68));
  }
  const PBR = mk();
  PBR.add('steel', box(1.22, 0.9, 0.3, -BX, 0, 0), { tint: 0xc8c8c0 });
  PBR.add('dark', box(0.04, 0.6, 0.1, -BX + 0.61, 0, 0.0)); // its operating lug
  PBR.add('dark', xTube(-BX + 0.62, -BX + 0.67, 0.04, 0.04, 8, 0.0, 0.05));
  PBR.add('brass', zTube(0.15, 0.22, 0.05, 0.05, 10, -BX, 0)); // the firing lock
  PBR.add('dark', zTube(0.15, 0.19, 0.11, 0.11, 14, -BX, 0));
  // the loading tray (a trough on runners; it slides out to the left of the carriage). Its cross bars ride on
  // the slide's rails (the first two) and stiffen the trough; no end stop: the rammer's head runs along it, and
  // the shell's base end lies on the ramp's rails, which continue the runners. Its front 6 cm are left open so
  // the cradle's rear corners pass it as the gun is laid with the tray stowed.
  const PTR = mk();
  {
    const L = TRAY.len, z0 = 0.06, z1 = 0.12;
    for (const s of [-1, 1]) {
      PTR.add('steel', box(0.05, 0.03, L - z0, s * 0.15, 0.131, (L + z0) / 2)); // the runners: the shell lies on their inner edges
      PTR.add('camo', box(0.08, 0.12, L - z0, s * 0.15, 0.07, (L + z0) / 2));
      PTR.add('camo', box(0.04, 0.3, L - z1, s * 0.36, 0.22, (L + z1) / 2, 0, 0, -s * 0.35)); // the trough's sides, flared out
    }
    for (const z of [...TRAY.rails, 1.3, L - 0.1]) PTR.add('dark', box(0.8, 0.07, 0.12, 0, 0.02, z));
  }

  // ---------------------------------------------------------------- the Munitionsschlepper (Panzer IV Ausf. D to F conversion)
  const PM = mk();
  {
    // in its own frame: centred on its hull, its front toward +Z (it faces astern of the Karl). The Panzer IV
    // hull (5.92 m, 2.88 m wide): the nose plates, the superstructure front with the driver's visor at the
    // left, a raised bin for four shells and their charges over the old fighting and engine compartments,
    // the crane's pedestal on the nose; eight road wheels a side in four leaf-sprung bogies, the front
    // sprocket, the rear idler, four return rollers
    const zf = 2.95, zr = -2.75, tx = 1.24, tw = 0.4;
    const sideP = [[zr, 0.62], [zr + 0.2, 0.42], [2.35, 0.42], [zf - 0.05, 0.8], [zf, 1.02], [2.0, 1.3], [zr, 1.3]];
    PM.add('camo', sideProfile(sideP, 1.9, 0.02));
    for (const s of [-1, 1]) {
      // fenders over the tracks, the front ones angled down, with the superstructure's sponsons
      PM.add('camo', box(0.52, 0.04, zf - zr - 0.55, s * (0.95 + 0.26), 1.32, (zf + zr) / 2 - 0.3));
      PM.add('camo', box(0.52, 0.04, 0.6, s * (0.95 + 0.26), 1.18, zf - 0.25, -0.45));
      // the road wheels in bogie pairs, each bogie on its leaf spring
      for (let b = 0; b < 4; b++) {
        const zb = -1.7 + b * 1.08;
        for (const dz of [-0.27, 0.27]) {
          PM.add('rubber', xTube(s * tx - 0.18, s * tx + 0.18, 0.235, 0.235, 18, 0.33, zb + dz));
          PM.add('camo', xTube(s * tx - 0.19, s * tx + 0.19, 0.17, 0.17, 14, 0.33, zb + dz));
          PM.add('dark', xTube(s * tx - 0.2, s * tx + 0.2, 0.06, 0.06, 8, 0.33, zb + dz));
        }
        PM.add('camo', box(0.12, 0.16, 0.62, s * (tx - 0.26), 0.36, zb));
        PM.add('dark', box(0.08, 0.06, 0.7, s * (tx - 0.36), 0.62, zb - 0.05, 0.1));
        PM.add('dark', box(0.08, 0.05, 0.55, s * (tx - 0.36), 0.66, zb - 0.05, 0.12));
      }
      PM.add('camo', xTube(s * tx - 0.15, s * tx + 0.15, 0.36, 0.36, 18, 0.62, 2.48)); // sprocket
      for (let i = 0; i < 17; i++) { const a = (i / 17) * TAU; PM.add('dark', box(0.26, 0.06, 0.06, s * tx, 0.62 + Math.sin(a) * 0.38, 2.48 + Math.cos(a) * 0.38, a)); }
      PM.add('camo', xTube(s * tx - 0.12, s * tx + 0.12, 0.3, 0.3, 16, 0.55, -2.52)); // idler
      for (let i = 0; i < 4; i++) PM.add('rubber', xTube(s * tx - 0.1, s * tx + 0.1, 0.1, 0.1, 10, 1.07, -1.55 + i * 1.0));
      // the track: links round the run
      const wr = [[-2.52, 0.55, 0.32], [-1.97, 0.06, 0], [2.0, 0.06, 0], [2.48, 0.62, 0.4]];
      for (let z = -1.97; z < 2.0; z += 0.12) PM.add('dark', box(tw, 0.05, 0.11, s * tx, 0.04, z));
      for (let z = -2.4; z < 2.4; z += 0.12) PM.add('dark', box(tw, 0.04, 0.11, s * tx, 1.185, z));
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI / 2 + (k / 8) * Math.PI * 0.75;
        PM.add('dark', box(tw, 0.05, 0.12, s * tx, wr[0][1] + Math.sin(a) * wr[0][2], wr[0][0] + Math.cos(a) * wr[0][2], -a + Math.PI / 2));
        const b = Math.PI / 2 - (k / 8) * Math.PI * 0.85;
        PM.add('dark', box(tw, 0.05, 0.12, s * tx, wr[3][1] + Math.sin(b) * wr[3][2], wr[3][0] + Math.cos(b) * wr[3][2], -b + Math.PI / 2));
      }
    }
    // superstructure front (driver's compartment) with the visor at the left and the hatch on top
    PM.add('camo', box(2.7, 0.66, 1.2, 0, 1.63, 1.4));
    PM.add('camo', box(1.1, 0.5, 0.12, 0.62, 1.56, 2.04));
    PM.add('dark', box(0.34, 0.07, 0.03, 0.62, 1.66, 2.1));
    PM.add('camo', box(0.2, 0.12, 0.06, 0.62, 1.73, 2.1));
    PM.add('camo', box(0.55, 0.05, 0.6, 0.62, 1.985, 1.35));
    PM.add('dark', rivetRow(V(-1.3, 1.92, 2.005), V(1.3, 1.92, 2.005), 0.18, V(0, 0, 1), 0.016));
    // the bin: an open box over the old fighting and engine compartments, its walls and floor, the timber
    // cradles the shells lie across, the charge boxes at the front of it
    for (const s of [-1, 1]) PM.add('camo', box(0.06, 0.75, 3.4, s * 1.35, 2.08, -0.95));
    for (const e of [-1, 1]) PM.add('camo', box(2.76, 0.75, 0.06, 0, 2.08, -0.95 + e * 1.7));
    PM.add('camo', box(2.6, 0.4, 3.3, 0, 1.5, -0.95));
    PM.add('dark', box(2.6, 0.05, 3.3, 0, 1.725, -0.95));
    for (const s of [-1, 1]) PM.add('timber', box(0.16, 0.12, 3.3, s * 0.75, 1.81, -0.95));
    for (const s of [-1, 1]) {
      PM.add('dark', rivetRow(V(s * 1.385, 2.4, -2.55), V(s * 1.385, 2.4, 0.65), 0.2, V(s, 0, 0), 0.016));
      for (let k = 0; k < 3; k++) PM.add('camo', box(0.04, 0.68, 0.05, s * 1.39, 2.08, -2.2 + k * 1.25)); // stiffeners
    }
    // the crane's pedestal on the nose, the grab's stowage bin beside it, spare track links on the glacis
    PM.add('camo', box(0.8, 0.62, 0.7, 0, 1.38, 2.45));
    PM.add('camo', yTube(1.66, 1.75, 0.34, 0.34, 20, 0, 2.45));
    PM.add('camo', box(0.5, 0.22, 0.32, -0.75, 1.15, 2.65, -0.5));
    for (let k = 0; k < 4; k++) PM.add('dark', box(0.36, 0.05, 0.12, 0.85, 1.04 + k * 0.03, 2.55 + k * 0.1, -0.55));
    // the engine deck's rear plate, its silencer, the tow shackles
    PM.add('rust', xTube(-0.6, 0.6, 0.12, 0.12, 12, 1.0, zr - 0.15));
    for (const s of [-1, 1]) PM.add('dark', box(0.1, 0.18, 0.12, s * 0.7, 0.75, zf + 0.02));
    // jerrycans and a tool box on the bin's sides
    for (let k = 0; k < 3; k++) PM.add('camo', box(0.12, 0.34, 0.24, 1.44, 2.0, -1.8 + k * 0.3));
    PM.add('dark', box(0.1, 0.22, 0.9, -1.43, 1.95, -1.0));
  }
  // four shells in the hold (the leading one, at the crane's pick-up, is the one crews.js lifts first)
  // (lying across the hold, noses to the left; the slot at the pick-up is left empty: crews.js draws that one). The
  // pick-up lies near the bin's rear wall (z -2.65), so the other three lie forward of it, 0.68 m apart (the 0.6 m shell
  // and its driving bands clear), all inside the bin (z -2.65 to 0.75)
  const PMS = mk();
  const pickZ = CRANE.z - R - (SCH.z0 + SCH.z1) / 2; // the pick-up in the carrier's frame
  for (const dz of [0.68, 1.36, 2.04]) {
    const g = shellGeometry(SHELL.len, SHELL.rad);
    const t = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, PICK_Y, pickZ + dz);
    PMS.add('shell', g.body.applyMatrix4(t), { tint: 0xa2aab4 }); PMS.add('brass', g.band.applyMatrix4(t)); PMS.add('steel', g.fuze.applyMatrix4(t));
  }
  // the crane: a short slewing pillar on the pedestal, a lattice jib raised from its head out to R (the tall
  // derricks of the period photographs), its luffing stays over a short mast, the winch on the pillar
  // (the pivot's frame: y from the ground)
  const PC = mk();
  {
    const top = HOIST.up + 0.55, hy0 = 3.15;
    PC.add('camo', yTube(1.75, hy0 + 0.1, 0.15, 0.12, 14));
    PC.add('camo', yTube(1.75, 2.0, 0.24, 0.24, 18));
    PC.add('camo', rbox(0.34, 0.3, 0.42, 0.03, 0.0, hy0 + 0.05, 0)); // the head with the jib's foot pin
    PC.add('camo', yTube(hy0 + 0.1, hy0 + 1.0, 0.06, 0.05, 8, 0.12, 0)); // the stay mast
    const foot = (z) => V(-0.12, hy0 + 0.05, z), tip = (z) => V(-R - 0.1, top, z);
    for (const z of [-0.15, 0.15]) {
      PC.add('camo', rod(foot(z), tip(z * 0.55), 0.04, 6)); // upper chords
      PC.add('camo', rod(V(-0.12, hy0 - 0.2, z), V(-R, top - 0.2, z * 0.5), 0.035, 6)); // lower chords
      PC.add('dark', rod(V(0.12, hy0 + 1.0, 0), V(-R - 0.05, top + 0.02, z * 0.4), 0.012, 4)); // luffing stays
    }
    for (let i = 1; i < 9; i++) {
      const t = i / 9, x = -0.12 + (-R + 0.02) * t, yu = hy0 + 0.05 + (top - hy0 - 0.05) * t, yl = yu - 0.25, w = 0.15 * (1 - 0.45 * t);
      PC.add('camo', rod(V(x, yu, -w), V(x + 0.18, yl, -w), 0.016, 4));
      PC.add('camo', rod(V(x, yu, w), V(x + 0.18, yl, w), 0.016, 4));
      PC.add('camo', rod(V(x, yu, -w), V(x, yu, w), 0.016, 4));
    }
    PC.add('iron', zTube(-0.09, 0.09, 0.13, 0.13, 14, -R, top - 0.12)); // the head sheave
    PC.add('camo', rbox(0.5, 0.45, 0.45, 0.04, 0.35, 2.6, 0));
    PC.add('iron', handwheel(0.22, 4, 0.02, 0.05).rotateY(Math.PI / 2).translate(0.35, 2.6, 0.3));
    PC.add('rope', rod(V(0.25, 2.7, 0), V(-0.1, hy0 + 0.2, 0), 0.015, 4));
    PC.add('rope', rod(V(-0.1, hy0 + 0.2, 0), V(-R, top - 0.02, 0), 0.015, 4));
  }
  // the hook block (the 2.5 t block of Bundesarchiv 101I-695-0424-08A) and the grab: a spreader with two
  // clamp bands that close over the shell
  const PHK = mk();
  {
    PHK.add('dark', rbox(0.22, 0.32, 0.14, 0.03, 0, 0, 0));
    PHK.add('steel', zTube(-0.08, 0.08, 0.07, 0.07, 12, 0, 0.06));
    PHK.add('steel', new THREE.TorusGeometry(0.08, 0.022, 6, 12, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.25, 0));
    const yb = -(HANG - SHELL.rad) + 0.05;
    PHK.add('dark', rod(V(0, -0.33, 0), V(0, yb + 0.12, -0.55), 0.016, 4));
    PHK.add('dark', rod(V(0, -0.33, 0), V(0, yb + 0.12, 0.55), 0.016, 4));
    PHK.add('dark', box(0.1, 0.08, 1.3, 0, yb + 0.12, 0));
    for (const z of [-0.55, 0.55]) {
      PHK.add('dark', new THREE.TorusGeometry(SHELL.rad + 0.03, 0.025, 5, 16, Math.PI * 1.1).rotateZ(-0.05 * Math.PI).translate(0, -HANG, z));
      PHK.add('dark', box(0.05, 0.16, 0.05, 0, yb + 0.02, z));
    }
  }

  // ---------------------------------------------------------------- build and the props
  const schBody = node(sch, 'schlepper-body', SCH.x, 0, (SCH.z0 + SCH.z1) / 2);
  PB.build(body, { dirt: 0.55, y0: 0 });
  PT.build(trav, { dirt: 0.15, y0: DECK });
  PE.build(elev, { dirt: 0.05, y0: TYK });
  PR.build(rec, { dirt: 0.05, y0: TYK });
  PBR.build(brc, { dirt: 0.05, y0: TYK });
  PTR.build(tray, { dirt: 0.05, y0: TYK });
  PM.build(schBody, { dirt: 0.6, y0: 0 });
  PMS.build(schBody, { dirt: 0, y0: PICK_Y });
  PC.build(crane, { dirt: 0.2, y0: 0 });
  PHK.build(hoist, { dirt: 0, y0: HOIST.up });
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), rig.mats.rope);
  fall.position.set(-R, HOIST.up + 0.43, 0);
  crane.add(fall);
  // the hook rides at the jib's end: the drawn shells are crews.js's; these are for the viewer and stills
  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.42, 1.4);
  addShellProp(rig, 'crane', hoist, SHELL.len, SHELL.rad, 0, -HANG, 0);
  rig.props.hoist = rig.props.crane;
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, trav, 'eye', 0, TYK - DECK + CB.y1 + 0.25, 0.5);
  anchor(rig, crane, 'shellStack', -R * Math.cos(rig.craneRest), PICK_Y, R * Math.sin(rig.craneRest)); // in the hold, under the hook at rest
  rig.R = R;

  // ---------------------------------------------------------------- setters
  rig.setBreech = (k) => {
    brc.position.x = BX + clamp01(k) * BSLIDE;
    rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25)));
  };
  rig.setLower = (k) => {
    low = clamp01(k);
    body.position.y = -DROP * low;
    place();
  };
  rig.setDrive = (d) => {
    dist = d;
    wheels.turn(-d / RW);
    sprockets.turn(-d / SPR.r);
    idlers.turn(-d / IDL.r);
    place();
  };
  rig.setSchlepper = (k) => {
    k = clamp01(k);
    sch.position.z = 40 * k * k; // drives off astern, slowly at first
    sch.visible = k < 1;
  };
  rig.update = () => {
    fall.scale.y = Math.max(0.05, HOIST.up + 0.43 - (hoist.position.y + 0.1));
    rig.trayTilt();
  };
  rig.setLower(1);
  rig.setDrive(0);
  rig.update();

  // hit boxes (lowered): the hull with its tracks and platforms, the mounting and barrel, the carrier
  hb(rig, -SPX, 0, HF - 0.2, SPX, DECK - DROP, HR + 0.2);
  hb(rig, -1.1, DECK - DROP, -2.4, 1.1, TYK - DROP + CB.y1, 1.9);
  hb(rig, SCH.x - 1.45, 0, SCH.z0, SCH.x + 1.45, 2.5, SCH.z1);

  // crew (on the lowered decks): y is where the feet stand, heading is rotation.y (0 faces the muzzle).
  // The layer and the traverser stand on the side platforms at their handwheels; the deck men's places are
  // render/crews_heavy.js's (on the engine deck either side of the ramp)
  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI, DY = DECK - DROP;
  crewSpot(rig, 'sergeant', -2.7, 0, -1.2, E, 'point'); // the Geschützführer on the ground, left
  crewSpot(rig, 'layer', -1.42, DY, TZK + 0.35, E, 'lay');
  crewSpot(rig, 'traverser', 1.42, DY, TZK + 0.95, W, 'operate');
  crewSpot(rig, 'lanyard', 1.0, DY, TZK + BRE + 0.9, N, 'lanyard');
  crewSpot(rig, 'loader1', -0.85, DY, TZK + BRE + 1.6, E, 'carry');
  crewSpot(rig, 'loader2', 0.85, DY, TZK + BRE + 1.9, W, 'carry');
  crewSpot(rig, 'rammer1', -0.5, DY, 4.75, N, 'ram');
  crewSpot(rig, 'rammer2', 0.88, DY, 4.75, N, 'ram');
  crewSpot(rig, 'rammer3', -0.88, DY, 5.67, N, 'ram');
  crewSpot(rig, 'rammer4', 0.88, DY, 5.67, N, 'ram');
  crewSpot(rig, 'crane1', CRANE.x + 1.75, 0, CRANE.z - 0.3, W, 'operate'); // at the carrier's crane winch, on the ground
  crewSpot(rig, 'crane2', 1.9, 0, HR + 0.9, S, 'signal'); // between the two, astern: signals the lift and lowering
  crewSpot(rig, 'ammo1', CRANE.x + 1.8, 0, 0.6, W, 'stand'); // slings the shell in the hold
  crewSpot(rig, 'ammo2', CRANE.x - 0.2, 0, SCH.z0 - 0.9, N, 'crouch'); // the cartridges, from the carrier's stern locker
  return finishGun(rig);
}

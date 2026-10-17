import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, rivetRow, handwheel, gearArc, shellGeometry, Parts, DEG } from '../../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun, pivotAt, hb, trayMount, node } from '../../rig.js';
import { clamp01, instanceOf } from './heavy_common.js';

// 60 cm Mörser Karl-Gerät 040 (Rheinmetall, 1940): a self-propelled siege mortar, 11.15 m long, 3.16 m wide,
// 4.38 m high in travelling order. A long low tracked hull on eleven small road wheels a side (front sprocket,
// rear idler, return rollers), the driver's cab at the front left, the engine deck behind it, and on the
// hull's after half the mounting: side frames with the trunnions, the cradle with its recoil cylinders and the
// short fat barrel (L/8.44, 5.1 m). It fires at 55 to 70 degrees and loads with the barrel down horizontal,
// the breech over the rear deck; the shell goes onto a tray behind the breech from the crane of the
// Munitionsschlepper (the ammunition carrier on a Panzer IV chassis), parked alongside on the right with four
// shells in its hold, and is rammed from the folding loading platform at the stern. Before firing the hull
// was let down on its torsion bars to rest on the ground (setLower). Game estimates where the drawings are silent.
//
// Frames: root is the ground (y = 0), front -Z. `body` carries the hull and everything on it (position.y =
// -DROP * setLower(k)); the road wheels and the ground run of the track stay on the ground. `traverse`
// (+-4 degrees) is the upper carriage on the hull, `elevation` the trunnions, `recoil` 1.2 m, `breech` the
// horizontal sliding wedge (position.x, out to the right), `tray` a cross slide on the platform. The
// Munitionsschlepper is `schlepper` (rig.setSchlepper(k): 0 alongside, 1 driven off 40 m astern and hidden),
// with `crane` (its jib, rotation.y; rig.craneRest is where it lies over the hold) and `hoist` (the hook,
// position.y = height above the ground while the carrier stands alongside). Built lowered (setLower(1)), as it
// fires; the crew spots stand on the lowered decks.

const DROP = 0.35;
const DECK = 1.85; // hull deck in travelling order
const HF = -5.0, HR = 4.65; // hull ends; the platform runs on to PLR
const PLR = 6.15;
const TX = 1.31, TW = 0.54; // track centre, width
const RW = 0.27, RWY = 0.35; // road wheel radius and centre height
const NW = 11, WZ0 = -3.6, WDZ = 0.72; // road wheels
const SPR = { z: -4.45, y: 0.78, r: 0.36 }, IDL = { z: 4.25, y: 0.72, r: 0.33 };
const RRY = 1.0, RRR = 0.11; // return rollers
const TYK = 3.55, TZK = -0.6; // trunnion (travelling) and its station
const MUZ = -3.5, BRE = 1.6; // barrel ends on the recoil frame: 5.1 m
const SHELL = { len: 2.5, rad: 0.3 }; // the 2,170 kg schwere Betongranate
const SCH = { x: 3.45, z0: -1.4, z1: 4.5 }; // the carrier's place: alongside on the right, facing astern
const CRANE = { x: SCH.x, z: 4.0 }; // its crane post near its front (the Karl's stern)
const PICK_Y = 2.08; // a shell's middle in the carrier's hold
const HANG = 0.9; // the shell's middle below the hook
const HOIST = { up: 4.95, down: PICK_Y + HANG };
const BX = 0.62, BSLIDE = 1.15;

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
  const R = Math.hypot(CRANE.x, CRANE.z - (TZK + BRE + 0.12 + 1.4)); // post to the tray's middle: the jib reaches both it and the hold
  const hoist = pivotAt(rig, crane, 'hoist', -R, HOIST.up, 0);
  rig.recoilLength = 1.2;
  rig.loadEl = 0;
  rig.hoistRange = { up: HOIST.up, down: HOIST.down };
  rig.hoistHang = HANG;
  rig.craneRest = -Math.PI / 2; // the hook over the hold, R astern of the post (toward -Z)
  rig.pickY = PICK_Y;
  rig.pickYaw = Math.PI / 2; // they lie across the hold
  rig.staffLen = 4.2;
  const tray = trayMount(rig, trav, elev, -0.42, BRE + 0.12, 0.42, 1.4, 1.6);

  // ---------------------------------------------------------------- running gear (road wheels on the ground)
  const PW = mk(), PS = mk(), PI = mk(), PRR = mk();
  {
    // a road wheel pair (inner and outer disc with rubber tyres either side of the guide horns)
    for (const dx of [-0.15, 0.15]) {
      PW.add('rubber', xTube(dx - 0.09, dx + 0.09, RW, RW, 20));
      PW.add('camo', xTube(dx - 0.095, dx + 0.095, RW - 0.06, RW - 0.06, 14));
      PW.add('dark', xTube(dx - 0.1, dx + 0.1, 0.07, 0.07, 8));
    }
    PW.add('steel', xTube(-0.25, 0.25, 0.04, 0.04, 6));
    // sprocket: two toothed rings and a hub; idler: a spoked wheel; return roller
    for (const dx of [-0.13, 0.13]) {
      PS.add('camo', xTube(dx - 0.04, dx + 0.04, SPR.r - 0.02, SPR.r - 0.02, 20));
      for (let i = 0; i < 13; i++) { const a = (i / 13) * Math.PI * 2; PS.add('dark', box(0.08, 0.08, 0.07, dx, Math.cos(a) * SPR.r, Math.sin(a) * SPR.r, a)); }
    }
    PS.add('dark', xTube(-0.2, 0.2, 0.14, 0.14, 12));
    for (const dx of [-0.13, 0.13]) PI.add('camo', xTube(dx - 0.05, dx + 0.05, IDL.r, IDL.r, 20));
    PI.add('dark', xTube(-0.2, 0.2, 0.12, 0.12, 10));
    for (const dx of [-0.13, 0.13]) PRR.add('rubber', xTube(dx - 0.06, dx + 0.06, RRR, RRR, 12));
  }
  const tW = new THREE.Group(), tS = new THREE.Group(), tI = new THREE.Group(), tR = new THREE.Group();
  PW.build(tW, { dirt: 0.7, y0: RWY }); PS.build(tS, { dirt: 0.6, y0: SPR.y }); PI.build(tI, { dirt: 0.6, y0: IDL.y }); PRR.build(tR, { dirt: 0.4, y0: RRY });
  const wheels = [], sprockets = [], idlers = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < NW; i++) {
      const g = new THREE.Group();
      g.position.set(s * TX, RWY, WZ0 + i * WDZ);
      for (const m of tW.children) g.add(m.clone());
      run.add(g); wheels.push(g);
    }
    const sp = new THREE.Group(); sp.position.set(s * TX, SPR.y, SPR.z);
    for (const m of tS.children) sp.add(m.clone());
    body.add(sp); sprockets.push(sp);
    const id = new THREE.Group(); id.position.set(s * TX, IDL.y, IDL.z);
    for (const m of tI.children) id.add(m.clone());
    body.add(id); idlers.push(id);
    for (let i = 0; i < 6; i++) {
      const rr = new THREE.Group(); rr.position.set(s * TX, RRY, -3.2 + i * 1.3);
      for (const m of tR.children) rr.add(m.clone());
      body.add(rr);
    }
  }
  // the track: shoes on the loop round sprocket, ground run, idler and return rollers, placed by setDrive
  const PSH = mk();
  PSH.add('dark', box(TW, 0.05, 0.16, 0, 0, 0));
  PSH.add('dark', box(TW, 0.035, 0.03, 0, -0.04, -0.03)); // the grouser (outside, toward -y on the ground run)
  for (const dx of [-0.13, 0.13]) PSH.add('steel', box(0.03, 0.08, 0.1, dx, 0.06, 0)); // guide horns
  const tSh = new THREE.Group();
  PSH.build(tSh, { dirt: 0.8, y0: 0.05 });
  const PITCH = 0.17;
  // loop in the (z, y) plane of the hull at travelling height, counterclockwise: ground run astern, up the idler,
  // forward along the top, down the sprocket. N points, filled per drop
  const LZ = new Float32Array(48), LY = new Float32Array(48), LS = new Float32Array(48);
  let LN = 0, LL = 0;
  const loop = (drop) => {
    LN = 0;
    const push = (z, y) => { LZ[LN] = z; LY[LN] = y; LN++; };
    const gy = 0.025;
    push(WZ0 - 0.1, gy); push(WZ0 + (NW - 1) * WDZ + 0.1, gy);
    const ri = IDL.r + 0.03, rs = SPR.r + 0.03;
    for (let k = 0; k <= 10; k++) { const t = (-55 + 14.5 * k) * DEG; push(IDL.z + ri * Math.cos(t), IDL.y - drop + ri * Math.sin(t)); }
    for (let k = 0; k <= 10; k++) { const t = (90 - 15 * k) * DEG; push(SPR.z - rs * Math.cos(t), SPR.y - drop + rs * Math.sin(t)); }
    LS[0] = 0;
    for (let i = 1; i <= LN; i++) { const j = i % LN, p = i - 1; LS[i] = LS[p] + Math.hypot(LZ[j] - LZ[p], LY[j] - LY[p]); }
    LL = LS[LN];
  };
  loop(DROP);
  const NSH = Math.floor(LL / PITCH);
  const shoes = instanceOf(tSh, NSH * 2, run, 'track');
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _x = new THREE.Vector3(1, 0, 0);
  let dist = 0, low = 1, lastD = NaN, lastL = NaN;
  const place = () => {
    if (dist === lastD && low === lastL) return;
    lastD = dist; lastL = low;
    loop(DROP * low);
    const pitch = LL / NSH;
    let seg = 0;
    for (let i = 0; i < NSH; i++) {
      let sv = (i * pitch + dist) % LL;
      if (sv < 0) sv += LL;
      seg = 0;
      while (seg < LN - 1 && LS[seg + 1] < sv) seg++;
      const a = seg, b = (seg + 1) % LN, f = (sv - LS[a]) / Math.max(1e-6, LS[seg + 1] - LS[a]);
      const tz = LZ[b] - LZ[a], ty = LY[b] - LY[a], l = Math.hypot(tz, ty) || 1;
      _q.setFromAxisAngle(_x, Math.atan2(-ty / l, tz / l));
      for (const sd of [-1, 1]) {
        _p.set(sd * TX, LY[a] + ty * f, LZ[a] + tz * f);
        _m.compose(_p, _q, _s);
        for (const im of shoes) im.setMatrixAt(i + (sd > 0 ? NSH : 0), _m);
      }
    }
    for (const im of shoes) im.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- hull (body frame = travelling height)
  const PB = mk();
  {
    // the lower hull between the tracks, the sponsons and fenders over them, the sloped glacis and stern
    const side = [[HF, 1.0], [HF + 0.9, 0.48], [HR - 0.7, 0.48], [HR, 0.95], [HR, DECK], [HF + 0.95, DECK], [HF, 1.3]];
    PB.add('camo', sideProfile(side, 2.08, 0.02));
    for (const s of [-1, 1]) {
      PB.add('camo', box(TW + 0.04, 0.08, HR - HF + 0.3, s * TX, 1.27, (HF + HR) / 2 - 0.05)); // fender over the track
      PB.add('camo', box(0.05, DECK - 1.27, HR - HF - 1.0, s * (TX + TW / 2 - 0.02), (DECK + 1.27) / 2, (HF + HR) / 2 + 0.1)); // side skirt plate of the sponson
      PB.add('camo', box(TW + 0.02, 0.06, HR - HF - 1.0, s * TX, DECK - 0.03, (HF + HR) / 2 + 0.1)); // sponson top
      PB.add('dark', rivetRow(V(s * (TX + TW / 2 + 0.01), DECK - 0.12, HF + 0.8), V(s * (TX + TW / 2 + 0.01), DECK - 0.12, HR - 0.6), 0.3, V(s, 0, 0), 0.022));
      // the torsion bar arms and their housings along the hull side (one per road wheel)
      for (let i = 0; i < NW; i++) PB.add('dark', box(0.12, 0.12, 0.3, s * 1.06, 0.62, WZ0 + i * WDZ - 0.2));
      for (const z of [-2.0, 0.5, 3.0]) PB.add('dark', box(0.05, 0.3, 0.5, s * (TX + TW / 2 + 0.01), 1.55, z)); // stowage
      // track tension and sprocket housings
      PB.add('camo', box(0.4, 0.5, 0.6, s * 1.15, SPR.y + 0.05, SPR.z + 0.2));
      PB.add('camo', box(0.35, 0.4, 0.5, s * 1.15, IDL.y, IDL.z - 0.2));
    }
    // the deck plate with an opening for the breech to drop into (the well between the mounting's frames)
    const w0 = TZK - 1.3, w1 = TZK + 2.0;
    PB.add('camo', box(2.08, 0.06, w0 - (HF + 0.95), 0, DECK - 0.03, (HF + 0.95 + w0) / 2));
    PB.add('camo', box(2.08, 0.06, HR - w1, 0, DECK - 0.03, (HR + w1) / 2));
    for (const s of [-1, 1]) PB.add('camo', box(0.24, 0.06, w1 - w0, s * 0.92, DECK - 0.03, (w0 + w1) / 2));
    PB.add('dark', box(1.55, 0.04, w1 - w0, 0, 0.55, (w0 + w1) / 2)); // the well's floor (dark)
    // driver's cab, front left: a low armoured box with vision slits; engine grilles and exhausts behind it
    PB.add('camo', rbox(1.1, 0.55, 1.2, 0.05, -0.62, DECK + 0.27, HF + 1.6));
    PB.add('dark', box(0.6, 0.06, 0.02, -0.62, DECK + 0.35, HF + 0.99));
    PB.add('camo', rbox(0.5, 0.1, 0.5, 0.03, -0.62, DECK + 0.6, HF + 1.6));
    for (let k = 0; k < 6; k++) PB.add('dark', box(0.9, 0.03, 0.06, 0.45, DECK + 0.01, HF + 1.2 + k * 0.18));
    for (let k = 0; k < 8; k++) PB.add('dark', box(1.7, 0.03, 0.05, 0, DECK + 0.01, HF + 2.6 + k * 0.17));
    for (const s of [-1, 1]) {
      PB.add('rust', zTube(HF + 2.4, HF + 3.5, 0.11, 0.11, 10, s * 0.75, DECK + 0.14));
      PB.add('rust', yTube(DECK, DECK + 0.45, 0.04, 0.04, 6, s * 0.75, HF + 3.6));
    }
    // lights, tow eyes, the travel lock for the barrel
    for (const s of [-1, 1]) {
      PB.add('lens', zTube(HF + 0.2, HF + 0.23, 0.08, 0.08, 10, s * 0.75, 1.42));
      PB.add('dark', zTube(HF + 0.22, HF + 0.4, 0.1, 0.1, 10, s * 0.75, 1.42));
      PB.add('dark', box(0.1, 0.18, 0.2, s * 0.55, 0.85, HF + 0.45));
    }
    PB.add('camo', box(0.18, 0.95, 0.18, 0.0, DECK + 0.47, -2.95)); // the travel lock post under the barrel
    PB.add('camo', box(0.7, 0.12, 0.25, 0, DECK + 0.95, -2.95));
    // the folding loading platform at the stern (deck height), with its rails
    PB.add('camo', box(2.3, 0.08, PLR - HR, 0, DECK - 0.04, (HR + PLR) / 2));
    for (let k = 0; k < 5; k++) PB.add('timber', box(2.2, 0.025, 0.26, 0, DECK + 0.012, HR + 0.16 + k * 0.29));
    for (const s of [-1, 1]) {
      PB.add('camo', rod(V(s * 1.0, 0.95, HR), V(s * 1.0, DECK - 0.08, PLR - 0.1), 0.05, 6)); // the stays down to the stern
      PB.add('dark', rod(V(s * 1.12, DECK, PLR - 0.05), V(s * 1.12, DECK + 0.95, PLR - 0.05), 0.022, 5));
      PB.add('dark', rod(V(s * 1.12, DECK + 0.95, PLR - 0.05), V(s * 1.12, DECK + 0.95, HR + 0.2), 0.022, 5));
      PB.add('dark', rod(V(s * 1.12, DECK, HR + 0.2), V(s * 1.12, DECK + 0.95, HR + 0.2), 0.022, 5));
    }
    PB.add('dark', rod(V(-1.12, DECK + 0.95, PLR - 0.05), V(1.12, DECK + 0.95, PLR - 0.05), 0.022, 5));
    // the small ammunition crane at the stern, left: a davit with its hand winch (the big lifts are the carrier's)
    const DX = -0.95, DZ = HR + 0.1;
    PB.add('camo', yTube(DECK, DECK + 2.3, 0.08, 0.07, 10, DX, DZ));
    PB.add('camo', rod(V(DX, DECK + 2.2, DZ), V(DX, DECK + 2.0, DZ + 1.3), 0.05, 6));
    PB.add('camo', rod(V(DX, DECK + 1.4, DZ), V(DX, DECK + 2.0, DZ + 1.1), 0.035, 6));
    PB.add('dark', rod(V(DX, DECK + 1.98, DZ + 1.3), V(DX, DECK + 1.3, DZ + 1.3), 0.01, 4));
    PB.add('steel', new THREE.TorusGeometry(0.06, 0.015, 6, 10).translate(DX, DECK + 1.25, DZ + 1.3));
    PB.add('iron', handwheel(0.18, 4, 0.016, 0.04).translate(DX + 0.14, DECK + 1.0, DZ));
  }

  // ---------------------------------------------------------------- upper carriage (traverse frame, y from the deck)
  const PT = mk();
  {
    const h = TYK - DECK;
    // the turntable on its roller race: a horseshoe, open astern where the breech goes down into the hull
    const shoe = (y0, y1, r0, r1) => new THREE.LatheGeometry([[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]].map(([r, y]) => new THREE.Vector2(r, y)), 28, Math.PI * 0.5 + 0.9, Math.PI * 2 - 1.8);
    PT.add('camo', shoe(0, 0.18, 0.86, 1.05));
    PT.add('dark', shoe(-0.02, 0.03, 0.84, 1.1));
    const cheek = [[-1.4, 0.18], [-1.4, 0.7], [-0.55, h + 0.25], [0.55, h + 0.25], [1.4, 0.75], [1.4, 0.18]];
    for (const s of [-1, 1]) {
      PT.add('camo', sideProfile(cheek, 0.14, 0.01).translate(s * 0.98, 0, 0));
      PT.add('camo', xTube(s * 0.9, s * 1.12, 0.32, 0.32, 18, h, 0)); // trunnion bearings
      PT.add('dark', xTube(s * 1.1, s * 1.14, 0.22, 0.22, 16, h, 0));
      PT.add('dark', rivetRow(V(s * 1.06, 0.35, -1.25), V(s * 1.06, 0.35, 1.25), 0.2, V(s, 0, 0), 0.022));
      for (const z of [-0.9, 0.9]) PT.add('camo', box(0.06, 0.9, 0.1, s * 1.08, 0.7, z));
    }
    PT.add('camo', box(1.9, 0.25, 0.35, 0, 0.3, -1.25)); // front transom (below the barrel)
    // the layer's sight and handwheels on the left, the traverse wheel on the right
    PT.add('camo', box(0.12, 0.85, 0.12, -1.2, 0.6, 0.2));
    PT.add('dark', zTube(-0.05, 0.25, 0.04, 0.04, 8, -1.2, 1.1));
    PT.add('glass', box(0.05, 0.05, 0.02, -1.2, 1.1, -0.06));
    PT.add('iron', handwheel(0.24, 5, 0.02, 0.04).translate(-1.24, 0.75, 0.75));
    PT.add('dark', xTube(-1.24, -1.05, 0.03, 0.03, 6, 0.75, 0.75));
    PT.add('iron', handwheel(0.22, 5, 0.02, 0.04).translate(1.22, 0.6, 0.9));
    PT.add('dark', xTube(1.05, 1.22, 0.03, 0.03, 6, 0.6, 0.9));
  }
  // ---------------------------------------------------------------- cradle (elevation frame)
  const PE = mk();
  {
    PE.add('camo', rbox(1.5, 1.32, 2.05, 0.16, 0, 0, -0.27));
    for (const z of [-1.27, -0.3, 0.72]) PE.add('camo', rbox(1.58, 1.4, 0.1, 0.05, 0, 0, z));
    for (const s of [-1, 1]) {
      PE.add('steel', xTube(s * 0.78, s * 0.98, 0.24, 0.24, 16)); // trunnions
      PE.add('steel', gearArc(1.15, 1.32, -5 * DEG, 78 * DEG, 0.1, 22, 0.04).translate(s * 0.86, 0, 0)); // elevating arcs
      PE.add('camo', gearArc(0.6, 1.15, -5 * DEG, 78 * DEG, 0.08).translate(s * 0.86, 0, 0));
    }
    // recoil cylinders over and under the barrel
    for (const y of [0.78, -0.78]) {
      PE.add('camo', zTube(-1.6, 0.6, 0.16, 0.16, 14, 0, y));
      PE.add('steel', zTube(-1.67, -1.53, 0.19, 0.19, 14, 0, y));
    }
    PE.add('camo', box(0.24, 0.24, 0.6, 0.75, 0.62, 0.2)); // clinometer seat
  }
  // ---------------------------------------------------------------- barrel (recoil frame) and the wedge
  const PR = mk();
  {
    const p = [[MUZ, 0.3], [MUZ, 0.47], [MUZ + 0.05, 0.5], [MUZ + 0.3, 0.5], [MUZ + 0.36, 0.46], [-1.45, 0.52], [-1.41, 0.58], [0.5, 0.6], [0.5, 0]];
    PR.add('camo', zLathe(p, 36), { tint: 0xd8dadb });
    PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.4, 0.3, 0.3, 24, 0, 0, true));
    PR.add('dark', new THREE.CircleGeometry(0.3, 24).translate(0, 0, MUZ + 0.4));
    PR.add('camo', rbox(1.36, 1.3, BRE - 0.45, 0.08, 0, 0, (BRE + 0.45) / 2), { tint: 0xd8dadb }); // the breech ring
    PR.add('dark', box(0.03, 0.9, 0.5, 0.68, 0, BRE - 0.32));
    PR.add('dark', new THREE.CircleGeometry(0.31, 24).translate(0, 0, BRE + 0.003));
    // the clip the recoil rods pull on rides ahead of the cradle by more than the stroke
    PR.add('camo', zTube(-2.72, -2.56, 0.56, 0.56, 30));
    for (const y of [0.78, -0.78]) PR.add('steel', zTube(-2.64, -1.5, 0.06, 0.06, 8, 0, y));
    for (const y of [0.78, -0.78]) PR.add('camo', box(0.18, Math.abs(y) - 0.45, 0.14, 0, y * 0.75, -2.64));
  }
  const PBR = mk();
  PBR.add('steel', rbox(1.25, 0.95, 0.42, 0.04, -BX, 0, 0), { tint: 0xc8c8c0 });
  PBR.add('dark', xTube(0.0, 0.25, 0.035, 0.035, 8, 0.2, 0.1));
  PBR.add('iron', handwheel(0.2, 4, 0.018, 0.04).translate(0.28, 0.2, 0.1));
  PBR.add('brass', zTube(0.2, 0.28, 0.05, 0.05, 10, -BX, 0));
  // the loading tray (a trough on runners, slides out to the left of the platform)
  const PTR = mk();
  {
    const L = 2.7;
    for (const s of [-1, 1]) {
      PTR.add('camo', box(0.22, 0.06, L, s * 0.25, 0, L / 2));
      PTR.add('camo', box(0.06, 0.26, L, s * 0.42, 0.12, L / 2));
    }
    for (const z of [0.3, 1.35, 2.4]) PTR.add('camo', box(0.9, 0.08, 0.12, 0, -0.05, z));
    PTR.add('dark', box(0.9, 0.06, 0.06, 0, -0.06, L - 0.06));
  }

  // ---------------------------------------------------------------- the Munitionsschlepper (Panzer IV chassis)
  const PM = mk();
  {
    // in its own frame: centred on its hull, its front toward +Z (it faces astern of the Karl)
    const L = 5.9, W = 2.88, x0 = 0, tx = 1.14, tw = 0.4;
    const zf = L / 2, zr = -L / 2;
    const sideP = [[zr, 0.95], [zr + 0.3, 0.5], [zf - 0.6, 0.5], [zf, 0.85], [zf, 1.72], [zr, 1.72]];
    PM.add('camo', sideProfile(sideP, 1.8, 0.02));
    for (const s of [-1, 1]) {
      PM.add('camo', box(W / 2 - 0.9, 0.06, L, s * (0.9 + (W / 2 - 0.9) / 2), 1.2, 0));
      // eight road wheels in four bogies with their leaf springs, front sprocket, rear idler, four return rollers
      for (let i = 0; i < 8; i++) {
        const z = -2.05 + i * 0.56 + (i % 2 ? -0.05 : 0.05);
        PM.add('rubber', xTube(s * tx - 0.2, s * tx + 0.2, 0.235, 0.235, 16, 0.31, z));
        PM.add('camo', xTube(s * tx - 0.21, s * tx + 0.21, 0.17, 0.17, 12, 0.31, z));
      }
      for (let i = 0; i < 4; i++) PM.add('dark', box(0.2, 0.25, 0.7, s * (tx - 0.3), 0.55, -1.8 + i * 1.12));
      PM.add('camo', xTube(s * tx - 0.15, s * tx + 0.15, 0.33, 0.33, 16, 0.62, zf - 0.35));
      PM.add('camo', xTube(s * tx - 0.15, s * tx + 0.15, 0.3, 0.3, 16, 0.55, zr + 0.25));
      for (let i = 0; i < 4; i++) PM.add('rubber', xTube(s * tx - 0.12, s * tx + 0.12, 0.1, 0.1, 10, 1.03, -1.6 + i * 1.05));
      PM.add('dark', box(tw, 0.05, L - 0.9, s * tx, 0.02, -0.1)); // track: ground run
      PM.add('dark', box(tw, 0.05, L - 0.4, s * tx, 1.15, 0.0)); // top run
      PM.add('dark', box(tw, 0.05, 0.9, s * tx, 0.48, zf - 0.08, -1.0)); // front run up to the sprocket
      PM.add('dark', box(tw, 0.05, 0.7, s * tx, 0.42, zr + 0.05, 0.95));
    }
    // the hold: a raised box over the fighting compartment, open on top, with four shells in their cradles
    for (const s of [-1, 1]) PM.add('camo', box(0.06, 0.75, 3.4, s * 1.35, 2.08, -0.95));
    for (const e of [-1, 1]) PM.add('camo', box(2.76, 0.75, 0.06, 0, 2.08, -0.95 + e * 1.7));
    PM.add('dark', box(2.6, 0.05, 3.3, 0, 1.75, -0.95));
    for (const s of [-1, 1]) PM.add('timber', box(0.16, 0.16, 3.3, s * 0.75, 1.83, -0.95)); // chocks the shells lie across
    // front plate, driver's visor, hatch, the engine deck at the rear (its rear: -Z)
    PM.add('camo', box(1.9, 0.5, 0.06, 0, 1.45, zf - 0.03));
    PM.add('dark', box(0.4, 0.08, 0.02, -0.5, 1.5, zf + 0.0));
    for (let k = 0; k < 5; k++) PM.add('dark', box(1.6, 0.025, 0.05, 0, 1.735, zr + 0.25 + k * 0.17));
    PM.add('rust', xTube(-0.6, 0.6, 0.12, 0.12, 10, 1.0, zr - 0.15));
    // the crane: a pillar on the front plate (in the rig the pivot `crane`), drawn there
    PM.add('dark', box(0.9, 0.25, 0.7, 0, 1.85, zf - 0.45));
    // stowage: spare track links on the front, a tow cable, jerrycans on the hold's side
    for (let k = 0; k < 5; k++) PM.add('dark', box(0.38, 0.05, 0.14, -0.9 + (k % 2) * 0.05, 1.2 + k * 0.08, zf + 0.04));
    for (let k = 0; k < 3; k++) PM.add('camo', box(0.12, 0.34, 0.24, 1.32, 2.0, -1.8 + k * 0.3));
    void x0;
  }
  // four shells in the hold (the leading one, at the crane's pick-up, is the one crews.js lifts first)
  // (lying across the hold, noses to the left; the slot at the pick-up is left empty: crews.js draws that one)
  const PMS = mk();
  const pickZ = CRANE.z - R - (SCH.z0 + SCH.z1) / 2; // the pick-up in the carrier's frame
  for (const dz of [-1.2, -0.6, 0.6]) {
    const g = shellGeometry(SHELL.len, SHELL.rad);
    const t = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, PICK_Y, pickZ + dz);
    PMS.add('shell', g.body.applyMatrix4(t), { tint: 0xa2aab4 }); PMS.add('brass', g.band.applyMatrix4(t)); PMS.add('steel', g.fuze.applyMatrix4(t));
  }
  // the crane: pillar, a lattice jib out to R, the hand winch (the pivot's frame: y from the ground)
  const PC = mk();
  {
    const top = HOIST.up + 0.55;
    PC.add('camo', yTube(1.72, top + 0.1, 0.13, 0.11, 12));
    PC.add('camo', yTube(1.72, 1.95, 0.22, 0.22, 16));
    for (const z of [-0.12, 0.12]) PC.add('camo', rod(V(0.3, top + 0.05, z), V(-R - 0.15, top, z), 0.05, 6));
    PC.add('camo', rod(V(0.15, top - 0.9, 0), V(-R * 0.6, top - 0.02, 0), 0.05, 6));
    for (let i = 1; i < 6; i++) PC.add('camo', rod(V(-R * i / 6, top - 0.02, -0.12), V(-R * i / 6, top - 0.02, 0.12), 0.025, 4));
    PC.add('iron', zTube(-0.08, 0.08, 0.13, 0.13, 12, -R, top - 0.12));
    PC.add('camo', rbox(0.5, 0.45, 0.45, 0.04, 0.35, 2.6, 0));
    PC.add('iron', handwheel(0.22, 4, 0.02, 0.05).rotateY(Math.PI / 2).translate(0.35, 2.6, 0.3));
    PC.add('rope', rod(V(0.25, 2.7, 0), V(0.3, top + 0.05, 0), 0.015, 4));
  }
  const PHK = mk();
  PHK.add('dark', rbox(0.2, 0.3, 0.16, 0.03, 0, 0, 0));
  PHK.add('steel', new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.24, 0));
  PHK.add('rope', rod(V(0, -0.3, 0), V(0, -(HANG - SHELL.rad), -0.6), 0.015, 4));
  PHK.add('rope', rod(V(0, -0.3, 0), V(0, -(HANG - SHELL.rad), 0.6), 0.015, 4));

  // ---------------------------------------------------------------- build and the props
  const schBody = node(sch, 'schlepper-body', SCH.x, 0, (SCH.z0 + SCH.z1) / 2);
  PB.build(body, { dirt: 0.5, y0: 0 });
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
  anchor(rig, trav, 'eye', 0, TYK - DECK + 0.6, 0.5);
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
    for (const w of wheels) w.rotation.x = -d / RW;
    for (const w of sprockets) w.rotation.x = -d / SPR.r;
    for (const w of idlers) w.rotation.x = -d / IDL.r;
    place();
  };
  rig.setSchlepper = (k) => {
    k = clamp01(k);
    sch.position.z = 40 * k * k; // drives off astern, slowly at first
    sch.visible = k < 1;
  };
  const setEl = rig.setElevation;
  rig.setElevation = (r) => setEl(r);
  rig.update = () => {
    fall.scale.y = Math.max(0.05, HOIST.up + 0.43 - (hoist.position.y + 0.1));
    rig.trayTilt();
  };
  rig.setLower(1);
  rig.setDrive(0);
  rig.update();

  // hit boxes (lowered): the hull with its tracks, the mounting and barrel, the carrier
  hb(rig, -1.6, 0, HF, 1.6, DECK - DROP, PLR);
  hb(rig, -1.2, DECK - DROP, -1.5, 1.2, TYK - DROP + 0.8, 1.6);
  hb(rig, SCH.x - 1.45, 0, SCH.z0, SCH.x + 1.45, 2.5, SCH.z1);

  // crew (on the lowered decks): y is where the feet stand, heading is rotation.y (0 faces the muzzle)
  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI, DY = DECK - DROP;
  crewSpot(rig, 'sergeant', -2.7, 0, -1.2, E, 'point'); // the Geschützführer on the ground, left
  crewSpot(rig, 'layer', -1.38, DY, TZK + 0.35, E, 'lay');
  crewSpot(rig, 'traverser', 1.36, DY, TZK + 0.95, W, 'operate');
  crewSpot(rig, 'lanyard', 1.0, DY, TZK + BRE + 0.9, N, 'lanyard');
  crewSpot(rig, 'loader1', -0.85, DY, TZK + BRE + 1.6, E, 'carry');
  crewSpot(rig, 'loader2', 0.85, DY, TZK + BRE + 1.9, W, 'carry');
  crewSpot(rig, 'rammer1', -0.4, DY, HR + 0.4, N, 'ram');
  crewSpot(rig, 'rammer2', 0.4, DY, HR + 0.4, N, 'ram');
  crewSpot(rig, 'rammer3', -0.4, DY, HR + 1.0, N, 'ram');
  crewSpot(rig, 'rammer4', 0.4, DY, HR + 1.0, N, 'ram');
  crewSpot(rig, 'crane1', CRANE.x + 1.75, 0, CRANE.z - 0.3, W, 'operate'); // at the carrier's crane winch, on the ground
  crewSpot(rig, 'crane2', 1.9, 0, PLR + 0.6, S, 'signal'); // between the two, astern: signals the lift and lowering
  crewSpot(rig, 'ammo1', CRANE.x + 1.8, 0, 0.6, W, 'stand'); // slings the shell in the hold
  crewSpot(rig, 'ammo2', CRANE.x - 0.2, 0, SCH.z0 - 0.9, N, 'crouch'); // the cartridges, from the carrier's stern locker
  return finishGun(rig);
}

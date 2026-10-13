import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, frontProfile, zLathe, rivets, rivetRow, rivetPoly, chain, handwheel, gearArc, shellGeometry, ibeamZ, Parts, DEG } from '../kit.js';
import { newGunRig, anchor, crewSpot, addShellProp, finishGun } from '../rig.js';
import { pivotAt, hb, trayMount, floorFade } from '../rig.js';
import { mulberry32 } from '../../noise.js';

// BL 18-inch railway howitzer Mk I on the 14-inch railway mounting, the "Boche-Buster" car (refs/rail18).
// A counterfactual for 1917 (the gun was finished after the war; the sheet says so), built from the 1940 to
// 1944 photographs: a very long, plain, tapered tube (16.47 m, 35 calibres) with a heavier jacket over its
// rear half, in a box cradle with its recoil cylinders, on a riveted drop-centre girder car about 21 m over
// the headstocks on 15 axles in three bogie groups, big buffer heads, a winch and a lattice railing at the
// front, a curved-roof locker and a lattice shell hoist at the rear. No outriggers or beams: the whole car
// rolls back about 6 m on its own wheels against the brakes when the gun fires, and is winched forward.
// Dimensions that the sheet marks [E] (car length, deck height, bogie layout) are estimates.
//
// Frames: `root` has the rail head at y = 0 and the track along Z (the muzzle points -Z at zero traverse).
// `car` carries the whole car and everything on it (position.z = 0 at rest, + = back along the track after a
// shot; rig.setCar(z) also turns the wheels; rig.carRoll = 6 is the full run); `traverse` (the upper mounting
// on a roller path on the girders' centre section, about the point TZ along the car; arcade: the game
// traverses it far beyond the real 2 degrees, so the cheeks, cradle and loading stage turn together on a
// turntable); `elevation` at the trunnions (barrel z -13.07 to +3.4), `recoil` (0.86 m), `breech` (screw block
// carrier hinged on the right), `tray` (cross slide on the stage). `crane` is the lattice shell hoist's jib
// (rotation.y 0 over the tray end, PI over `anchors.shellStack`) and `hoist` its hook block (position.y =
// height in the car frame: rig.hoistRange.up raised, .down at the stack); its chain follows in update().
// setShell takes 'tray' | 'hoist' ('crane' is an alias). loadEl is 3.5 degrees.

export const NAME_PLATE = 'H.M.G. BOCHE-BUSTER';

const DECK = 1.6; // top of the girders in the dropped centre, where the roller path sits
const END = 2.4; // top of the girders over the bogie ends
const HALF = 10.4; // the headstocks, z = +-HALF (the buffers reach 0.6 m beyond)
const TZ = -0.8; // the trunnion axis along the car
const TY = 2.45; // trunnions above the roller path
const BRE = 3.4, MUZ = BRE - 16.47; // barrel ends on the elevation frame (z + = back)
const HX = 0.9; // breech hinge x
const SHELL = { len: 2.01, rad: 0.2286 }; // the 2,500 lb HE shell
const STAGE_Y = TY - 1.25; // the loading stage, on the mounting, below the bore axis
const SZ0 = 4.9, SZ1 = 8.0, SW = 1.45; // stage extent (z behind the trunnion axis) and half width
const CX = 0.55, CZ = 8.4; // the hoist post on the rear deck (car frame), beyond the stage's sweep
const JIB_R = 4.2; // post to hook
const JIB_Y = 6.2; // underside of the jib girder
const HOIST_TOP = 5.7, HOIST_LOW = 1.72;
const WR = 0.42; // wheel radius
const AXLES = [];
for (let i = 0; i < 5; i++) AXLES.push(-8.2 + i * 1.05);
for (let i = 0; i < 5; i++) AXLES.push(-2.1 + i * 1.05);
for (let i = 0; i < 5; i++) AXLES.push(4.0 + i * 1.05);

const polyTop = (poly, z, floor = 0) => {
  let best = floor;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) best = Math.max(best, a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]));
  }
  return best;
};

export function buildRail() {
  const rig = newGunRig('rail', 'drab');
  const root = rig.root, rnd = mulberry32(18);
  const mk = () => new Parts(rig.mats);
  const PL = mk(), PT = mk(), PE = mk(), PR = mk(), PB = mk(), PTR = mk(), PC = mk(), PH = mk(), PW = mk(), PG = mk();
  const car = pivotAt(rig, root, 'car', 0, 0, 0);
  const trav = pivotAt(rig, car, 'traverse', 0, DECK, TZ);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, 0);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', HX, 0, BRE + 0.03);
  const crane = pivotAt(rig, car, 'crane', CX, 0, CZ);
  const hoist = pivotAt(rig, crane, 'hoist', -JIB_R, HOIST_TOP, 0);
  const bogies = rig.pivots.bogies = new THREE.Group();
  bogies.name = 'bogies';
  car.add(bogies);
  rig.recoilLength = 0.86;
  rig.loadEl = 3.5 * DEG;
  rig.breechOpen = { axis: 'y', angle: 1.65 };
  rig.carRoll = 6.0;
  rig.hoistRange = { up: HOIST_TOP, down: HOIST_LOW };
  const tray = trayMount(rig, trav, elev, -0.3, BRE + 0.1, 0.3, 1.55, 1.4);
  floorFade(rig, DECK + TY - 1.0, BRE + 0.3, 0.62, 0.08, 0.2);

  // ---- the girder body: two deep riveted plate girders with the centre dropped, deck plates, bulkheads
  const prof = [[-HALF, 0.88], [-HALF, END], [-5.4, END]];
  for (let i = 1; i <= 10; i++) { const t = i / 10; prof.push([-5.4 + 1.5 * t, END - (END - DECK) * (1 - Math.cos(t * Math.PI)) / 2]); }
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([3.9 + 1.5 * t, DECK + (END - DECK) * (1 - Math.cos(t * Math.PI)) / 2]); }
  prof.push([HALF, END], [HALF, 0.88]);
  for (const s of [-1, 1]) {
    PL.add('camo', sideProfile(prof, 0.12, 0.01).translate(s * 1.3, 0, 0));
    PL.add('dark', rivetPoly(prof, (z, y) => V(s * 1.37, y, z), 0.1, 0.2, V(s, 0, 0), 0.026));
    // vertical stiffeners with their rivet rows, and the lower flange angle
    for (let z = -9.0; z <= 9.01; z += 0.9) {
      const top = polyTop(prof, z, 0.9);
      PL.add('camo', box(0.06, top - 0.95, 0.1, s * 1.4, 0.95 + (top - 0.95) / 2, z));
      if (top - 0.95 > 0.5) PL.add('dark', rivetRow(V(s * 1.435, 1.0, z), V(s * 1.435, top - 0.1, z), 0.2, V(s, 0, 0), 0.022));
    }
    PL.add('camo', box(0.14, 0.1, 19.0, s * 1.37, 0.9, 0));
    PL.add('dark', rivetRow(V(s * 1.45, 0.9, -9.4), V(s * 1.45, 0.9, 9.4), 0.2, V(s, 0, 0), 0.026));
    // inspection doors in the plates
    for (const z of [-8.0, 7.9]) { PL.add('camo', box(0.04, 0.55, 0.8, s * 1.43, 1.6, z)); PL.add('steel', box(0.03, 0.05, 0.12, s * 1.47, 1.6, z + 0.25)); }
    for (const z of [-3.0, 3.0]) PL.add('camo', box(0.04, 0.34, 0.6, s * 1.43, 1.2, z));
  }
  PL.add('camo', box(2.5, 0.12, 19.2, 0, 0.94, 0)); // under-plate, the floor of the well
  for (const e of [-1, 1]) {
    PL.add('camo', box(2.5, 0.1, 5.1, 0, END - 0.15, e * 7.85)); // end decks
    PL.add('camo', box(2.5, 1.3, 0.1, 0, 1.65, e * 5.3)); // bulkheads under the deck edges
    for (let k = 0; k < 17; k++) PL.add('timber', box(2.3, 0.03, 0.26, 0, END - 0.09, e * (5.45 + k * 0.3)));
  }
  PL.add('camo', box(2.5, 1.3, 0.1, 0, 1.65, -3.9));
  PL.add('camo', box(2.5, 1.3, 0.1, 0, 1.65, 3.9));
  // the roller path under the turntable (the table itself is on `traverse`)
  PL.add('camo', yTube(DECK, DECK + 0.12, 1.52, 1.52, 44, 0, TZ));
  PL.add('steel', yTube(DECK + 0.12, DECK + 0.145, 1.46, 1.46, 44, 0, TZ));
  for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; PL.add('dark', rivets([V(Math.cos(a) * 1.5, DECK + 0.115, TZ + Math.sin(a) * 1.5)], V(0, 1, 0), 0.03)); }
  PL.add('camo', box(2.5, 0.4, 0.5, 0, 1.4, TZ - 1.6)); // cross girders under the ring
  PL.add('camo', box(2.5, 0.4, 0.5, 0, 1.4, TZ + 1.6));

  // ---- end details: headstocks, buffers and drawgear, steps, handrails
  for (const e of [-1, 1]) {
    const z = e * HALF;
    PL.add('camo', box(3.0, 0.42, 0.28, 0, 1.1, z + e * 0.14));
    PL.add('dark', rivetRow(V(-1.4, 1.2, z + e * 0.29), V(1.4, 1.2, z + e * 0.29), 0.22, V(0, 0, e), 0.026));
    PL.add('dark', rivetRow(V(-1.4, 1.0, z + e * 0.29), V(1.4, 1.0, z + e * 0.29), 0.22, V(0, 0, e), 0.026));
    for (const x of [-0.92, 0.92]) {
      PL.add('steel', zTube(z + e * 0.28, z + e * 0.62, 0.075, 0.075, 10, x, 1.07));
      PL.add('camo', zTube(z + e * 0.28, z + e * 0.52, 0.16, 0.16, 16, x, 1.07));
      PL.add('steel', zTube(z + e * 0.58, z + e * 0.66, 0.26, 0.26, 24, x, 1.07)); // the big round buffer head
      PL.add('steel', zTube(z + e * 0.655, z + e * 0.67, 0.21, 0.21, 24, x, 1.07));
    }
    PL.add('dark', zTube(z + e * 0.28, z + e * 0.7, 0.045, 0.045, 8, 0, 1.0));
    PL.add('dark', box(0.22, 0.2, 0.2, 0, 1.0, z + e * 0.72)); // the coupling hook
    PL.add('chain', chain(V(-0.25, 1.15, z + e * 0.4), V(0.25, 1.15, z + e * 0.4), 0.2, 0.06));
    // brake and steam pipes with their hoses, and a pair of steps up to the deck
    for (const x of [-0.5, 0.5]) PL.add('dark', zTube(z + e * 0.28, z + e * 0.4, 0.035, 0.035, 8, x, 0.8));
    for (const x of [-1.15, 1.15]) PL.add('dark', box(0.3, 0.05, 0.3, x, 0.55, z - e * 0.15));
  }
  // pipe handrails round the end decks (the rear one stays outside the sweep of the turning stage)
  const rails = (x0, x1, z0, z1, y) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.0));
    for (let i = 0; i <= n; i++) PL.add('dark', rod(V(x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n), V(x0 + ((x1 - x0) * i) / n, y + 0.95, z0 + ((z1 - z0) * i) / n), 0.022, 5));
    PL.add('dark', rod(V(x0, y + 0.95, z0), V(x1, y + 0.95, z1), 0.022, 5));
    PL.add('dark', rod(V(x0, y + 0.5, z0), V(x1, y + 0.5, z1), 0.016, 5));
  };
  const DY = END - 0.1;
  for (const s of [-1, 1]) rails(s * 1.3, s * 1.3, 7.9, 10.3, DY);
  rails(-1.3, 1.3, 10.35, 10.35, DY);
  // the front: a lattice railing (angle-iron frame with diagonal braces and wire stays, as at Halwill) round the winch deck
  {
    const fz0 = -HALF + 0.15, fz1 = -6.3;
    const post = (x, z) => PL.add('camo', box(0.07, 1.25, 0.07, x, DY + 0.625, z));
    for (const s of [-1, 1]) for (let z = fz0; z <= fz1 + 0.01; z += (fz1 - fz0) / 4) post(s * 1.28, z);
    for (const x of [-0.64, 0, 0.64]) post(x, fz0);
    post(-1.28, fz0); post(1.28, fz0);
    for (const s of [-1, 1]) {
      PL.add('camo', box(0.05, 0.05, fz1 - fz0, s * 1.28, DY + 1.25, (fz0 + fz1) / 2));
      PL.add('camo', box(0.04, 0.04, fz1 - fz0, s * 1.28, DY + 0.65, (fz0 + fz1) / 2));
      for (let z = fz0; z < fz1 - 0.1; z += 0.9) PL.add('camo', rod(V(s * 1.28, DY + 0.1, z), V(s * 1.28, DY + 1.22, z + 0.9), 0.018, 5));
    }
    PL.add('camo', box(2.56, 0.05, 0.05, 0, DY + 1.25, fz0));
    PL.add('camo', box(2.56, 0.04, 0.04, 0, DY + 0.65, fz0));
    for (let x = -1.28; x < 1.27; x += 0.64) PL.add('camo', rod(V(x, DY + 0.1, fz0), V(x + 0.64, DY + 1.22, fz0), 0.018, 5));
    for (const s of [-1, 1]) PL.add('dark', rod(V(s * 1.28, DY + 1.25, fz0), V(s * 1.28 + s * 0.1, DY + 0.1, fz1 - 1.0), 0.008, 4)); // wire stays
    // the winch: a rope drum on a frame with its gear and crank
    const wz = -8.7, wy = DY + 0.5;
    PL.add('camo', box(1.9, 0.12, 1.3, 0, DY + 0.06, wz));
    for (const s of [-1, 1]) PL.add('camo', box(0.1, 0.75, 0.9, s * 0.85, DY + 0.45, wz));
    PL.add('steel', xTube(-0.85, 0.85, 0.07, 0.07, 10, wy, wz));
    PL.add('iron', xTube(-0.7, 0.7, 0.24, 0.24, 20, wy, wz));
    for (const s of [-1, 1]) PL.add('iron', xTube(s * 0.7, s * 0.74, 0.34, 0.34, 20, wy, wz));
    PL.add('rope', xTube(-0.66, 0.66, 0.29, 0.29, 20, wy, wz));
    PL.add('iron', xTube(0.76, 0.82, 0.3, 0.3, 24, wy, wz)); // the gear wheel on the right
    PL.add('dark', xTube(0.9, 1.05, 0.045, 0.045, 8, wy, wz));
    PL.add('dark', rod(V(1.05, wy, wz), V(1.05, wy + 0.3, wz + 0.18), 0.03, 6));
    PL.add('dark', box(0.1, 0.1, 0.1, 0.0, DY + 0.4, wz - 0.55));
    // the rope runs forward over a fairlead on the headstock to a shackle
    PL.add('steel', xTube(-0.2, 0.2, 0.09, 0.09, 12, END - 0.15 + 0.35, fz0 - 0.1));
    PL.add('rope', rod(V(0, wy + 0.29, wz - 0.1), V(0, END + 0.3, fz0 - 0.1), 0.028, 6));
    PL.add('rope', rod(V(0, END + 0.3, fz0 - 0.1), V(0, 1.55, -HALF - 1.05), 0.028, 6));
    PL.add('steel', new THREE.TorusGeometry(0.1, 0.025, 6, 12).translate(0, 1.5, -HALF - 1.08));
  }
  // ladders up the side to the end decks
  for (const z of [-8.9, 9.1]) for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) PL.add('dark', rod(V(s * 1.5, 0.95 + k * 0.28, z - 0.18), V(s * 1.5, 0.95 + k * 0.28, z + 0.18), 0.016, 5));
    for (const dz of [-0.18, 0.18]) PL.add('dark', rod(V(s * 1.5, 0.9, z + dz), V(s * 1.5, 2.5, z + dz), 0.018, 5));
  }
  // the rear locker: a long roofed box with a curved, corrugated top
  {
    const w = 1.0, x0 = -0.8, z0 = 8.4, z1 = 10.2, base = DY;
    const arch = [[-w / 2, 0], [-w / 2, 0.85]];
    for (let i = 1; i < 12; i++) { const a = Math.PI * (1 - i / 12); arch.push([Math.cos(a) * (w / 2), 0.85 + Math.sin(a) * 0.32]); }
    arch.push([w / 2, 0.85], [w / 2, 0]);
    PL.add('camo', frontProfile(arch, z0, z1).translate(x0, base, 0));
    for (let z = z0 + 0.12; z < z1; z += 0.24) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); pts.push([x0 + Math.cos(a) * (w / 2 + 0.01), base + 0.85 + Math.sin(a) * 0.33, z]); }
      for (let i = 0; i < 12; i++) PL.add('dark', rod(V(...pts[i]), V(...pts[i + 1]), 0.012, 4));
    }
    PL.add('camo', box(0.05, 0.7, 0.8, x0 + w / 2 + 0.02, base + 0.45, z0 + 0.7)); // door
    PL.add('steel', box(0.04, 0.05, 0.1, x0 + w / 2 + 0.05, base + 0.45, z0 + 1.0));
  }

  // ---- bogies: three groups of five axles on equalised frames (the wheelsets themselves turn)
  const groups = [AXLES.slice(0, 5), AXLES.slice(5, 10), AXLES.slice(10, 15)];
  for (const g of groups) {
    const zc = (g[0] + g[4]) / 2, span = g[4] - g[0];
    for (const s of [-1, 1]) {
      PL.add('camo', box(0.1, 0.16, span + 1.0, s * 0.93, 0.8, zc));
      PL.add('dark', rivetRow(V(s * 0.99, 0.8, g[0] - 0.4), V(s * 0.99, 0.8, g[4] + 0.4), 0.18, V(s, 0, 0), 0.02));
      for (const z of g) {
        PL.add('dark', box(0.22, 0.28, 0.3, s * 1.0, WR, z)); // axle box
        PL.add('steel', box(0.03, 0.2, 0.22, s * 1.12, WR, z));
        PL.add('dark', box(0.05, 0.4, 0.34, s * 0.93, 0.6, z)); // horn plates
        for (let k = 0; k < 4; k++) PL.add('dark', box(0.1, 0.02, 0.9 - k * 0.17, s * 1.0, 0.62 + k * 0.025, z)); // leaf springs
      }
      for (let i = 0; i < 4; i++) PL.add('dark', box(0.06, 0.1, 1.05, s * 1.0, 0.58, g[i] + 0.525)); // equalising beams
    }
    for (let i = 0; i < 4; i++) PL.add('dark', box(1.7, 0.12, 0.12, 0, 0.8, g[i] + 0.525)); // cross stays
  }

  // wheelsets: axle, two tyres with inside flanges, hubs and plate wheels with lightening holes
  {
    PW.add('steel', xTube(-1.0, 1.0, 0.065, 0.065, 10));
    for (const s of [-1, 1]) {
      PW.add('steel', xTube(s * 0.68, s * 0.82, WR, WR, 28));
      PW.add('steel', xTube(s * 0.68, s * 0.7, WR + 0.035, WR + 0.035, 28));
      PW.add('steel', xTube(s * 0.74, s * 0.9, 0.12, 0.1, 14));
      const sh = new THREE.Shape();
      sh.absarc(0, 0, WR - 0.03, 0, Math.PI * 2, false);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, h = new THREE.Path(); h.absarc(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.075, 0, Math.PI * 2, true); sh.holes.push(h); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 10 }).rotateY(Math.PI / 2).translate(s > 0 ? 0.73 : -0.77, 0, 0);
      PW.add('dark', g);
    }
    const tmp = new THREE.Group();
    PW.build(tmp, { dirt: 0.4, y0: WR });
    rig.wheelsets = AXLES.map((z) => {
      const w = new THREE.Group();
      w.position.set(0, WR, z);
      for (const m of tmp.children) w.add(m.clone());
      bogies.add(w);
      return w;
    });
  }

  // the name plate on the girders in the well, as at Catterick: white border and lettering on black
  {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 150;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#e4e0d0'; g2.fillRect(0, 0, 1024, 150);
    g2.fillStyle = '#141614'; g2.fillRect(8, 8, 1008, 134);
    g2.fillStyle = '#e4e0d0';
    g2.font = 'bold 84px Arial, sans-serif';
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText(NAME_PLATE, 512, 80);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.234), mat);
      m.position.set(s * 1.442, 1.2, 1.3);
      m.rotation.y = s * Math.PI / 2;
      car.add(m);
    }
  }

  // ---- the upper mounting (turntable, cheeks, running boards, loading stage); y from the roller path
  const cheek = [[-2.3, 0.34], [-2.3, 1.1], [-1.3, TY - 0.1], [-0.7, TY + 0.65], [0.7, TY + 0.65], [1.1, TY + 0.45], [1.9, 1.4], [2.8, 1.0], [2.9, 0.34]];
  PT.add('camo', yTube(0.145, 0.34, 1.46, 1.46, 44));
  PT.add('steel', yTube(0.14, 0.17, 1.5, 1.5, 44));
  for (const s of [-1, 1]) {
    PT.add('camo', sideProfile(cheek, 0.16, 0.01).translate(s * 1.3, 0, 0));
    PT.add('dark', rivetPoly(cheek, (z, y) => V(s * 1.39, y, z), 0.09, 0.2, V(s, 0, 0), 0.024));
    for (const z of [-1.9, -1.4, -0.9, 0.9, 1.5, 2.1]) {
      const top = polyTop(cheek, z, 0.4);
      PT.add('camo', box(0.06, top - 0.34, 0.09, s * 1.41, 0.34 + (top - 0.34) / 2, z));
    }
    PT.add('camo', rbox(0.5, 0.3, 1.5, 0.06, s * 1.3, TY + 0.85, 0)); // the trunnion bearing caps
    PT.add('steel', xTube(s * 1.38, s * 1.5, 0.3, 0.3, 20, TY, 0));
    PT.add('camo', box(0.3, 0.3, 4.0, s * 1.3, 0.5, 0.2)); // the beams under the cheeks
  }
  PT.add('camo', box(2.4, 0.3, 0.3, 0, 0.5, -2.1));
  // elevating gear on the left: pinion on the arc outside the cradle, shaft through the cheek, handwheel
  const aP = 68 * DEG, RP = 2.07;
  const py = TY - RP * Math.sin(aP), pz = RP * Math.cos(aP);
  PT.add('steel', xTube(-1.2, -0.9, 0.13, 0.13, 14, py, pz));
  PT.add('steel', xTube(-1.7, -0.9, 0.045, 0.045, 8, py, pz));
  PT.add('camo', xTube(-1.5, -1.38, 0.2, 0.2, 16, py, pz)); // the bearing boss on the cheek
  PT.add('iron', handwheel(0.36, 8, 0.026, 0.06).translate(-1.7, py, pz));
  // the turntable's traversing wheel on the right
  PT.add('steel', xTube(0.9, 1.7, 0.04, 0.04, 8, 0.75, -0.9));
  PT.add('iron', handwheel(0.28, 6, 0.022, 0.05).translate(1.7, 0.75, -0.9));
  PT.add('camo', rbox(0.3, 0.5, 0.5, 0.05, 1.12, 0.6, -0.9));
  // running boards each side for the layer and the traverser (they swing with the mounting)
  for (const s of [-1, 1]) {
    PT.add('camo', box(0.7, 0.07, 2.6, s * 1.78, 0.1, 0.4));
    for (let k = 0; k < 9; k++) PT.add('timber', box(0.6, 0.025, 0.2, s * 1.78, 0.1475, -0.7 + k * 0.28));
    for (const z of [-0.6, 1.4]) PT.add('camo', rod(V(s * 1.4, 0.45, z), V(s * 1.9, 0.07, z), 0.04, 6));
    for (const z of [-0.8, 1.6]) PT.add('dark', rod(V(s * 2.08, 0.12, z), V(s * 2.08, 1.15, z), 0.022, 5));
    PT.add('dark', rod(V(s * 2.08, 1.15, -0.8), V(s * 2.08, 1.15, 1.6), 0.022, 5));
    PT.add('dark', rod(V(s * 2.08, 0.7, -0.8), V(s * 2.08, 0.7, 1.6), 0.016, 5));
  }
  // the loading stage: planks on a steel frame behind the breech, cantilevered from the cheeks on two beams
  // outside the swing of the block. Its front edge is kept behind the dipping breech ring.
  PT.add('camo', box(2 * SW, 0.1, SZ1 - SZ0, 0, STAGE_Y - 0.05, (SZ0 + SZ1) / 2));
  for (let i = 0; i < 11; i++) PT.add('timber', box(2 * SW - 0.1, 0.035, 0.27, 0, STAGE_Y + 0.02, SZ0 + 0.17 + i * 0.28));
  for (const s of [-1, 1]) {
    PT.add('camo', ibeamZ(2.5, SZ1, 0.26, 0.22, 0.04, s * 1.3, STAGE_Y - 0.23));
    PT.add('dark', rivetRow(V(s * 1.31, STAGE_Y - 0.1, SZ0), V(s * 1.31, STAGE_Y - 0.1, SZ1), 0.2, V(0, 1, 0), 0.02));
    // the handrail; on the left it has a gap where the loading tray parks
    const r0 = s < 0 ? SZ0 + 1.9 : SZ0 + 0.1;
    for (let z = r0; z <= SZ1 + 0.01; z += 1.0) PT.add('dark', rod(V(s * SW, STAGE_Y, z), V(s * SW, STAGE_Y + 0.95, z), 0.022, 5));
    PT.add('dark', rod(V(s * SW, STAGE_Y + 0.95, r0), V(s * SW, STAGE_Y + 0.95, SZ1), 0.022, 5));
    PT.add('dark', rod(V(s * SW, STAGE_Y + 0.5, r0), V(s * SW, STAGE_Y + 0.5, SZ1), 0.016, 5));
  }
  PT.add('dark', rod(V(-SW, STAGE_Y + 0.95, SZ1), V(SW, STAGE_Y + 0.95, SZ1), 0.022, 5));
  PT.add('dark', rod(V(-SW, STAGE_Y + 0.5, SZ1), V(SW, STAGE_Y + 0.5, SZ1), 0.016, 5));
  for (const s of [-1, 1]) PT.add('camo', rod(V(s * 1.3, STAGE_Y - 0.4, SZ1 - 0.3), V(s * 1.3, STAGE_Y - 0.4, 2.9), 0.04, 6));

  // ---- cradle: the box with its recoil cylinders and recuperator, trunnions, elevating arc, sight
  PE.add('camo', rbox(1.7, 1.6, 4.2, 0.22, 0, 0, -0.1));
  for (const z of [-2.25, 2.05]) PE.add('steel', rbox(1.76, 1.66, 0.09, 0.04, 0, 0, z));
  PE.add('steel', xTube(-1.45, 1.45, 0.26, 0.26, 18));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.8, s * 1.1, 0.4, 0.4, 22));
    PE.add('steel', xTube(s * 1.1, s * 1.16, 0.33, 0.33, 22));
    PE.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(s * 1.17, Math.sin(i * Math.PI / 5) * 0.25, Math.cos(i * Math.PI / 5) * 0.25)), V(s, 0, 0), 0.034));
  }
  const tubes = [[0, 1.0, 0.2], [-0.52, -0.97, 0.13], [0.52, -0.97, 0.13]];
  rig.nest = tubes.map(([x, y]) => [x, y]);
  for (const [x, y, r] of tubes) {
    const ze = y > 0 ? 2.0 : 1.3; // the lower cylinders end sooner, clear of the turntable when the breech is down
    PE.add('camo', zTube(-2.1, ze, r, r, 16, x, y));
    PE.add('steel', zTube(-2.18, -2.0, r * 1.12, r * 1.12, 16, x, y));
    PE.add('camo', sphere(r * 1.05, x, y, ze, 1, 1, 0.8, 10));
    for (const z of [-1.0, 0.0, 1.0]) PE.add('steel', zTube(z - 0.04, z + 0.04, r * 1.15, r * 1.15, 14, x, y));
    for (const z of [-1.4, -0.2, 1.2]) PE.add('camo', box(0.18, 0.24, 0.26, x, y > 0 ? 0.82 : -0.8, z));
  }
  PE.add('steel', gearArc(1.5, 1.85, 18 * DEG, 86 * DEG, 0.2, 38, 0.05).translate(-0.99, 0, 0));
  PE.add('camo', gearArc(1.0, 1.5, 18 * DEG, 86 * DEG, 0.2).translate(-0.99, 0, 0));
  PE.add('camo', box(0.2, 0.3, 0.8, -0.92, -0.62, 0.9)); // the arc's bracket on the cradle, inside the pinion's reach
  PE.add('camo', box(0.1, 0.55, 0.7, -1.62, 0.5, 0.0)); // the sight bracket stands outside the left cheek
  PE.add('camo', box(0.4, 0.07, 0.5, -1.77, 0.85, 0.0));
  PE.add('brass', yTube(0.88, 1.2, 0.05, 0.05, 10, -1.82, 0.0));
  PE.add('dark', zTube(-0.35, 0.1, 0.028, 0.025, 8, -1.82, 1.1));

  // ---- barrel: heavy jacket over the rear half, a step, the long tapered chase, the muzzle collar
  const bp = [[MUZ, 0.2286], [MUZ, 0.4], [MUZ + 0.06, 0.435], [MUZ + 0.4, 0.435], [MUZ + 0.46, 0.4]];
  for (let i = 1; i <= 8; i++) { const t = i / 8; bp.push([MUZ + 0.46 + (-5.6 - MUZ - 0.46) * t, 0.395 + 0.065 * t]); }
  bp.push([-5.6, 0.46], [-5.52, 0.6], [BRE - 0.3, 0.6], [BRE - 0.3, 0.7], [BRE - 0.04, 0.7], [BRE, 0.64], [BRE, 0.25], [BRE - 0.005, 0]);
  PR.add('iron', zLathe(bp, 40), { tint: 0x7b8478 });
  for (const z of [-5.52, -3.9, -2.5, -1.0, 0.4, 1.8, 2.8]) PR.add('iron', zTube(z - 0.04, z + 0.04, 0.625, 0.625, 40), { tint: 0x9a9f94 });
  for (const z of [-11.5, -9.0, -7.0]) PR.add('iron', zTube(z - 0.04, z + 0.04, 0.4 + 0.065 * (z - MUZ - 0.46) / (-5.6 - MUZ - 0.46) + 0.012, 0.4 + 0.065 * (z - MUZ - 0.46) / (-5.6 - MUZ - 0.46) + 0.012, 32), { tint: 0x9a9f94 });
  PR.add('dark', zTube(MUZ - 0.002, MUZ + 0.3, 0.2286, 0.2286, 24));
  PR.add('steel', zTube(MUZ - 0.003, MUZ + 0.004, 0.3, 0.4, 32, 0, 0, false)); // the lip of the muzzle face
  PR.add('camo', zTube(-3.41, -3.29, 0.68, 0.68, 30)); // the clip rides ahead of the cradle by more than the stroke
  for (const [x, y] of [[0, 1.0], [-0.52, -0.97], [0.52, -0.97]]) {
    PR.add('camo', rod(V(x * 0.4, Math.sign(y) * 0.62, -3.35), V(x, y, -3.35), 0.07, 8));
    PR.add('steel', zTube(-3.35, -2.0, 0.045, 0.045, 8, x, y));
  }
  PR.add('steel', zTube(BRE - 0.01, BRE + 0.015, 0.58, 0.58, 36), { tint: 0xb0b0a8 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; PR.add('steel', box(0.09, 0.13, 0.05, Math.cos(a) * 0.44, Math.sin(a) * 0.44, BRE + 0.02, 0, 0, a + Math.PI / 2)); }
  PR.add('dark', zTube(BRE + 0.01, BRE + 0.03, 0.2, 0.2, 18));
  PR.add('steel', rbox(0.2, 0.24, 0.34, 0.03, 0, 0.82, BRE - 0.3));
  PR.add('brass', yTube(0.82, 1.02, 0.035, 0.045, 8, 0, BRE - 0.3));
  PR.add('camo', rbox(0.3, 0.9, 0.3, 0.05, HX - 0.1, 0, BRE - 0.2)); // hinge lug, ends short of the swinging block
  // ---- the breech carrier (interrupted-screw block on its arm)
  PB.add('steel', yTube(-0.5, 0.5, 0.065, 0.065, 10, 0, 0.1));
  PB.add('camo', rbox(1.0, 0.52, 0.28, 0.04, -0.46, 0, 0.14));
  PB.add('camo', zTube(0.0, 0.3, 0.6, 0.6, 36, -HX, 0));
  PB.add('steel', zTube(0.3, 0.34, 0.2, 0.2, 18, -HX, 0));
  PB.add('iron', xTube(-HX - 0.36, -HX + 0.36, 0.028, 0.028, 8, 0, 0.5));
  for (const s of [-1, 1]) PB.add('iron', sphere(0.05, -HX + s * 0.36, 0, 0.5, 1, 1, 1, 8));
  PB.add('dark', rivets(Array.from({ length: 14 }, (_, i) => V(-HX + Math.cos(i / 14 * 6.283) * 0.5, Math.sin(i / 14 * 6.283) * 0.5, 0.3)), V(0, 0, 1), 0.03));

  // ---- loading tray: two runners with a slot between them, the shell lies across them on the bore axis
  for (const s of [-1, 1]) {
    PTR.add('camo', box(0.28, 0.07, 2.8, s * 0.34, 0, 1.4));
    PTR.add('camo', box(0.07, 0.28, 2.8, s * 0.53, 0.12, 1.4));
    PTR.add('dark', rivetRow(V(s * 0.565, 0.14, 0.2), V(s * 0.565, 0.14, 2.6), 0.18, V(s, 0, 0), 0.02));
  }
  for (const z of [0.3, 1.4, 2.5]) for (const s of [-1, 1]) PTR.add('camo', box(0.28, 0.07, 0.08, s * 0.34, -0.06, z));
  for (const s of [-1, 1]) PTR.add('chain', chain(V(s * 0.53, 0.22, 2.7), V(s * 0.75, 0.9, 0.2), 0.2, 0.06));

  // ---- the shell hoist: a lattice mast on the rear deck, a lattice jib turning on it, a hook on a chain
  {
    const half = (y) => 0.35 - (0.1 * (y - DY)) / (JIB_Y - DY);
    const ys = [DY + 0.1, DY + 1.0, DY + 2.0, DY + 3.0, JIB_Y - 0.1];
    PC.add('camo', yTube(DY + 0.04, DY + 0.18, 0.55, 0.55, 28)); // the slewing base
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; PC.add('dark', rivets([V(Math.cos(a) * 0.5, DY + 0.18, Math.sin(a) * 0.5)], V(0, 1, 0), 0.03)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) PC.add('camo', rod(V(sx * half(ys[0]), ys[0], sz * half(ys[0])), V(sx * half(ys[4]), ys[4], sz * half(ys[4])), 0.045, 6));
    for (let i = 0; i < 4; i++) {
      const a = half(ys[i]), b = half(ys[i + 1]);
      for (const s of [-1, 1]) {
        PC.add('camo', rod(V(-a, ys[i], s * a), V(b, ys[i + 1], s * b), 0.022, 5)); // x faces (normal z)
        PC.add('camo', rod(V(a, ys[i], s * a), V(-b, ys[i + 1], s * b), 0.022, 5));
        PC.add('camo', rod(V(s * a, ys[i], -a), V(s * b, ys[i + 1], b), 0.022, 5)); // z faces (normal x)
        PC.add('camo', rod(V(s * a, ys[i], a), V(s * b, ys[i + 1], -b), 0.022, 5));
      }
      if (i > 0) for (let k = 0; k < 4; k++) {
        const c0 = [[-a, -a], [a, -a], [a, a], [-a, a]], p0 = c0[k], p1 = c0[(k + 1) % 4];
        PC.add('camo', rod(V(p0[0], ys[i], p0[1]), V(p1[0], ys[i], p1[1]), 0.025, 5));
      }
    }
    // a lattice jib on top: triangular truss, a bottom chord each side and a top chord, with its web
    const jx0 = 1.8, jx1 = -JIB_R - 0.35, JW = 0.3, JH = 0.55;
    for (const z of [-JW, JW]) PC.add('camo', rod(V(jx0, JIB_Y, z), V(jx1, JIB_Y, z), 0.04, 6));
    PC.add('camo', rod(V(jx0, JIB_Y + JH, 0), V(jx1, JIB_Y + JH, 0), 0.04, 6));
    const nb = 14;
    for (let i = 0; i < nb; i++) {
      const xa = jx0 + ((jx1 - jx0) * i) / nb, xb = jx0 + ((jx1 - jx0) * (i + 1)) / nb;
      for (const z of [-JW, JW]) {
        PC.add('camo', rod(V(xa, JIB_Y, z), V((xa + xb) / 2, JIB_Y + JH, 0), 0.02, 4));
        PC.add('camo', rod(V((xa + xb) / 2, JIB_Y + JH, 0), V(xb, JIB_Y, z), 0.02, 4));
      }
      PC.add('camo', rod(V(xa, JIB_Y, -JW), V(xa, JIB_Y, JW), 0.02, 4));
    }
    PC.add('camo', box(0.9, 0.18, 0.9, 0, JIB_Y - 0.1, 0));
    // the king stay: an apex over the post with ties to the head and the tail of the jib
    PC.add('camo', rod(V(0, JIB_Y, 0), V(0, JIB_Y + 1.15, 0), 0.05, 6));
    PC.add('dark', rod(V(0, JIB_Y + 1.15, 0), V(jx1 + 0.3, JIB_Y + JH, 0), 0.025, 5));
    PC.add('dark', rod(V(0, JIB_Y + 1.15, 0), V(jx0, JIB_Y + JH, 0), 0.025, 5));
    PC.add('rust', box(0.8, 0.6, 0.7, 1.45, JIB_Y - 0.4, 0)); // the counterweight at the tail
    // the sheave at the head, and the hand winch on the post
    PC.add('iron', zTube(-0.07, 0.07, 0.2, 0.2, 16, -JIB_R, JIB_Y - 0.12));
    PC.add('steel', zTube(-0.25, 0.25, 0.025, 0.025, 8, -JIB_R, JIB_Y - 0.12));
    for (const z of [-0.17, 0.17]) PC.add('camo', box(0.03, 0.36, 0.06, -JIB_R, JIB_Y - 0.05, z));
    PC.add('camo', rbox(0.4, 0.4, 0.3, 0.04, 0, DY + 1.3, -0.5));
    PC.add('iron', handwheel(0.25, 5, 0.02, 0.05).rotateY(Math.PI / 2).translate(0, DY + 1.3, -0.7));
    PC.add('steel', zTube(-0.7, -0.4, 0.04, 0.04, 8, 0, DY + 1.3));
    // the hook block and the sling for the shell, on the hoist group
    PH.add('dark', rbox(0.26, 0.4, 0.2, 0.03, 0, 0.0, 0));
    PH.add('steel', new THREE.TorusGeometry(0.11, 0.032, 6, 14, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.3, 0));
    PH.add('steel', rbox(0.06, 0.3, 0.06, 0.01, 0, 0.17, 0));
    PH.add('chain', chain(V(0, -0.4, 0), V(0, -0.93, -0.62), 0.02, 0.06));
    PH.add('chain', chain(V(0, -0.4, 0), V(0, -0.93, 0.62), 0.02, 0.06));
    PH.add('steel', zTube(-0.64, 0.64, 0.012, 0.012, 6, 0, -0.93));
  }

  // ---- ready ammunition at the foot of the hoist: shells on baulks beside the track
  {
    const s = shellGeometry(SHELL.len, SHELL.rad);
    const SX = CX + JIB_R, SZ = CZ;
    const place = (x, y, z) => {
      for (const [g, k] of [[s.body, 'shell'], [s.band, 'brass'], [s.fuze, 'steel']]) PG.add(k, g.clone().translate(x, y, z));
    };
    for (const z of [SZ + 1.3, SZ + 2.5]) PG.add('timber', box(1.5, 0.18, 0.22, SX, 0.09, z));
    place(SX - 0.28, 0.18 + SHELL.rad + 0.01, SZ + 1.9);
    place(SX + 0.28, 0.18 + SHELL.rad + 0.01, SZ + 1.9);
    for (const d of [-1.0, 1.0]) PG.add('timber', box(0.2, 0.07, 0.2, SX, 0.035, SZ + d));
  }

  // ---- props, anchors, pivots, boxes
  PL.build(car, { dirt: 0.25, y0: 0 });
  PT.build(trav, { dirt: 0.1, y0: DECK });
  PE.build(elev, { dirt: 0.05, y0: DECK + TY });
  PR.build(rec, { dirt: 0.05, y0: DECK + TY });
  PB.build(brc, { dirt: 0.05, y0: DECK + TY });
  PTR.build(tray, { dirt: 0.05, y0: DECK + TY });
  PC.build(crane, { dirt: 0.2, y0: 0 });
  PH.build(hoist, { dirt: 0.0, y0: HOIST_TOP });
  PG.build(root, { dirt: 0.3, y0: 0 });
  // the photographs show a plain dark finish: darken the painted steel a little
  root.traverse((o) => { if (o.isMesh && o.name === 'camo') { const c = o.geometry.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * 0.62, c.getY(i) * 0.64, c.getZ(i) * 0.62); } });

  // the hoist chain: a unit strand scaled to reach from the sheave down to the hook block
  const strand = new THREE.Mesh(chain(V(0, 0, -0.06), V(0, -1, -0.06), 0, 0.08), rig.mats.chain);
  const strand2 = new THREE.Mesh(chain(V(0, 0, 0.06), V(0, -1, 0.06), 0, 0.08), rig.mats.chain);
  const chainGrp = new THREE.Group();
  chainGrp.position.set(-JIB_R, JIB_Y - 0.12 + 0.2, 0);
  chainGrp.add(strand, strand2);
  crane.add(chainGrp);

  addShellProp(rig, 'tray', tray, SHELL.len, SHELL.rad, 0, 0.3, 1.55);
  addShellProp(rig, 'hoist', hoist, SHELL.len, SHELL.rad, 0, -1.18, 0).rotation.y = 0;
  rig.props.crane = rig.props.hoist; // the bl15 name, same prop
  anchor(rig, rec, 'muzzle', 0, 0, MUZ);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BRE);
  anchor(rig, trav, 'eye', 0, TY + 0.3, 0.2);
  rig.anchors.shellStack = new THREE.Object3D();
  rig.anchors.shellStack.position.set(CX + JIB_R, 0.5, CZ);
  root.add(rig.anchors.shellStack);

  // the car's run along the rails: z metres back, the wheelsets rolling with it
  rig.setCar = (z) => {
    car.position.z = z;
    for (const w of rig.wheelsets) w.rotation.x = z / WR;
  };
  rig.update = () => {
    const h = hoist.position.y + 0.32; // the block's rod end
    const sheave = JIB_Y - 0.12 + 0.2;
    strand.scale.y = strand2.scale.y = Math.max(0.05, sheave - h);
    rig.trayTilt();
  };
  rig.update();

  hb(rig, -1.6, 0, -HALF - 0.7, 1.6, END + 0.1, HALF + 0.7);
  hb(rig, -2.2, DECK, TZ - 2.4, 2.2, DECK + TY + 1.0, TZ + SZ1 + 0.2);
  hb(rig, -1.0, DECK + TY - 1.0, TZ + MUZ, 1.0, DECK + TY + 4.5, TZ - 2.2);
  hb(rig, CX - 1.0, END, CZ - 1.0, CX + 1.0, 7.6, CZ + 1.0);

  // crew, in root space with the car at rest: y is where the feet stand, heading is rotation.y (0 faces the
  // muzzle). Men marked car travel with the car's roll-back (add car.position.z); the others stand on the ground.
  const E = -Math.PI / 2, W = Math.PI / 2, N = 0, S = Math.PI, SY = DECK + STAGE_Y, BY = DECK + 0.165;
  const spot = (role, x, y, z, h, pose, onCar) => { crewSpot(rig, role, x, y, z, h, pose); if (onCar) rig.anchors.crew[rig.anchors.crew.length - 1].car = true; };
  spot('sergeant', 0.4, DY, -7.2, N, 'point', true);
  spot('layer', -1.95, BY, TZ + 0.95, E, 'lay', true);
  spot('traverser', 1.95, BY, TZ - 0.9, W, 'operate', true);
  spot('lanyard', 1.0, SY, TZ + 5.6, N, 'lanyard', true);
  spot('loader1', -1.0, SY + 0.04, TZ + 6.6, N, 'carry', true);
  spot('loader2', 1.0, SY + 0.04, TZ + 5.9, N, 'carry', true);
  spot('rammer1', -0.5, SY + 0.04, TZ + 6.9, N, 'ram', true);
  spot('rammer2', 0.5, SY + 0.04, TZ + 6.9, N, 'ram', true);
  spot('rammer3', -0.5, SY + 0.04, TZ + 7.5, N, 'ram', true);
  spot('rammer4', 0.5, SY + 0.04, TZ + 7.5, N, 'ram', true);
  spot('crane1', CX, DY, CZ + 1.15, S, 'operate', true);
  spot('crane2', CX - 1.0, DY, CZ - 0.35, W, 'signal', true);
  spot('ammo1', CX + JIB_R - 1.1, 0, CZ + 1.7, N, 'stand', false);
  spot('ammo2', CX + JIB_R + 1.3, 0, CZ + 1.5, N, 'crouch', false);
  return finishGun(rig);
}

import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, zLathe, rivetRow, handwheel, gearArc, Parts, vehicleMats, DEG } from '../models/kit.js';
import { buildShell, buildCartridge } from '../models/shells.js';
import { mulberry32 } from '../noise.js';
import { GUN } from './ballistics.js';

// The 42 cm kurze Marinekanone 14 L/12, "Dicke Bertha" (Krupp, 1914), the M-Gerät on its wheeled
// carriage: a stubby barrel twelve calibres long in a cradle with its recoil cylinders, between two
// riveted cheeks on big wheels shod with Radgürtel (hinged foot plates), a tall shield with a slot for
// the barrel, a box trail resting on a curved traversing rail, the horizontal sliding wedge (Keilverschluss)
// at the breech, a loading stage with its tray behind the breech and a jib crane on the right that lifts
// the shell off its cart. All of it stands on the steel and timber Bettung. Game dimensions, not a drawing.
//
// Frames: root has the ground at y = 0, the bed top at BED. `traverse` turns the carriage about the axle
// (rotation.y, + = left); `elevation` sits on the trunnions (rotation.x, + = up), `recoil` slides the barrel
// back along +Z, `wedge` slides the block out to the right (+X). `crane` swings the jib (rotation.y),
// `hook` is the block on its fall. Props (the shell on the hook, on the tray, the bags, the brass case, the
// rammer, the spent case) are shown by the page from the loading state. Anchors give the crew stations.

const BED = 0.35; // bed top over the ground
const TR = GUN.trunnion - BED; // trunnion axis over the bed top
const WR = 0.95, WX = 1.62; // wheel radius, wheel centre x
const MUZ = -GUN.muzzle, BRE = 1.62; // barrel ends along the bore (z, elevation frame)
const TRAY = { z0: BRE + 0.45, z1: BRE + 2.25 }; // the loading tray behind the breech, at the loading elevation
const LP = 1.25; // loading stage floor over the bed top
const CRANE = { x: 1.75, z: 3.0, h: 4.3, jib: 1.85 };
const HW = { trav: 1.42, elev: 1.32 }; // z of the line and elevation handwheels, clear behind the road wheels
export const SIGHT_Z = 1.15; // the panoramic sight's post, beside the line handwheel

export function buildBertha() {
  const mats = vehicleMats('bunt');
  const root = new THREE.Group();
  root.name = 'bertha';
  const rnd = mulberry32(42);
  const mk = () => new Parts(mats);
  const pivot = (parent, name, x, y, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const trav = pivot(root, 'traverse', 0, BED, 0);
  const elev = pivot(trav, 'elevation', 0, TR, 0);
  const rec = pivot(elev, 'recoil', 0, 0, 0);
  const wedge = pivot(rec, 'wedge', 0, 0, 0);
  const crane = pivot(trav, 'crane', CRANE.x, LP, CRANE.z);
  const hook = pivot(crane, 'hook', 0, 0, 0);
  const PB = mk(), PT = mk(), PE = mk(), PR = mk(), PW = mk(), PC = mk(), PH = mk();

  // ------------------------------------------------------------------ the Bettung (root)
  {
    // steel cross girders under a deck of baulks, a pit for the breech at high elevation
    for (let i = 0; i < 8; i++) PB.add('dark', box(6.6, 0.16, 0.2, 0, 0.08, -2.2 + i * 1.6));
    for (let i = 0; i < 22; i++) {
      const x = -3.15 + i * 0.3, l = 12.4 + (rnd() - 0.5) * 0.2;
      if (Math.abs(x) < 0.75) {
        // the pit under the breech: the deck is cut away from z 0.6 to 3.2
        PB.add('timber', box(0.28, 0.18, 2.75, x, 0.26, -1.25 + (rnd() - 0.5) * 0.05), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
        PB.add('timber', box(0.28, 0.18, 6.4, x, 0.26, 6.6), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
      } else PB.add('timber', box(0.28, 0.18, l, x, 0.26, 3.6), { tint: i % 3 ? 0xffffff : 0xd8d0c4 });
    }
    PB.add('soil', box(1.5, 0.05, 2.6, 0, -0.35, 1.9));
    for (const s of [-1, 1]) PB.add('dark', box(0.08, 0.7, 2.6, s * 0.76, -0.05, 1.9));
    // the traversing arc: a curved rail the trail end runs on, with its rack
    const n = 18, R = 7.25;
    for (let i = 0; i < n; i++) {
      const a0 = (-14 + (28 * i) / n) * DEG, a1 = (-14 + (28 * (i + 1)) / n) * DEG;
      const p0 = V(-Math.sin(a0) * R, BED + 0.06, Math.cos(a0) * R), p1 = V(-Math.sin(a1) * R, BED + 0.06, Math.cos(a1) * R);
      PB.add('steel', rod(p0, p1, 0.07, 6));
      PB.add('dark', rod(p0.clone().setY(BED + 0.02).add(V(0, 0, 0.18)), p1.clone().setY(BED + 0.02).add(V(0, 0, 0.18)), 0.05, 5));
    }
    // the front pivot plate under the axle and wheel tracks
    PB.add('dark', box(4.4, 0.04, 2.2, 0, BED + 0.01, 0));
    PB.add('dark', rivetRow(V(-2.1, BED + 0.04, -1.0), V(2.1, BED + 0.04, -1.0), 0.3, V(0, 1, 0), 0.03));
    PB.add('dark', rivetRow(V(-2.1, BED + 0.04, 1.0), V(2.1, BED + 0.04, 1.0), 0.3, V(0, 1, 0), 0.03));
  }

  // ------------------------------------------------------------------ carriage (traverse frame, y over the bed top)
  {
    // wheels with their Radgürtel: hinged foot plates all round the tyre
    for (const s of [-1, 1]) {
      const x = s * WX;
      PT.add('dark', new THREE.TorusGeometry(WR - 0.12, 0.07, 8, 40).rotateY(Math.PI / 2).translate(x, WR, 0));
      PT.add('camo', xTube(x - 0.2, x + 0.2, WR - 0.14, WR - 0.14, 40, WR, 0, true));
      PT.add('camo', xTube(x - 0.17, x + 0.17, 0.24, 0.2, 16, WR, 0));
      PT.add('dark', xTube(x + s * 0.17, x + s * 0.3, 0.13, 0.1, 12, WR, 0));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        PT.add('camo', rod(V(x, WR, 0), V(x, WR + Math.cos(a) * (WR - 0.16), Math.sin(a) * (WR - 0.16)), 0.045, 6));
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.13;
        const y = WR + Math.cos(a) * (WR + 0.02), z = Math.sin(a) * (WR + 0.02);
        PT.add('iron', box(0.62, 0.05, 0.46, x, y, z, -a));
        PT.add('dark', box(0.1, 0.09, 0.08, x - 0.24, y - Math.cos(a) * 0.05, z - Math.sin(a) * 0.05, -a));
        PT.add('dark', box(0.1, 0.09, 0.08, x + 0.24, y - Math.cos(a) * 0.05, z - Math.sin(a) * 0.05, -a));
      }
    }
    PT.add('dark', xTube(-WX, WX, 0.13, 0.13, 14, WR, 0));
    // cheeks: high over the trunnions, sloping down to the trail
    const cheek = [[-1.3, 0.55], [-1.3, 1.35], [-0.75, TR + 0.15], [-0.35, TR + 0.42], [0.45, TR + 0.42], [0.85, TR + 0.05], [1.75, 1.15], [1.95, 0.55]];
    for (const s of [-1, 1]) {
      PT.add('camo', sideProfile(cheek, 0.16).translate(s * 0.86, 0, 0));
      PT.add('camo', box(0.1, 0.12, 3.1, s * 0.95, 0.6, 0.32));
      PT.add('dark', rivetRow(V(s * 0.95, 0.68, -1.2), V(s * 0.95, 0.68, 1.85), 0.18, V(s, 0, 0), 0.026));
      for (const z of [-0.9, -0.2, 0.6, 1.3]) PT.add('camo', box(0.06, 1.0, 0.08, s * 0.96, 1.15, z));
      // trunnion caps
      PT.add('iron', xTube(s * 0.86, s * 1.06, 0.26, 0.26, 18, TR, 0));
      PT.add('dark', xTube(s * 1.04, s * 1.1, 0.18, 0.18, 14, TR, 0));
    }
    PT.add('camo', box(1.6, 0.16, 3.1, 0, 0.52, 0.32));
    // the box trail back to the traversing rail, with its spade and lifting eyes
    const tr = [[1.5, 0.15], [1.5, 1.0], [7.4, 0.62], [7.4, 0.08]];
    for (const s of [-1, 1]) {
      PT.add('camo', sideProfile(tr, 0.14).translate(s * 0.62, 0, 0));
      PT.add('dark', rivetRow(V(s * 0.7, 0.22, 1.7), V(s * 0.7, 0.16, 7.3), 0.25, V(s, 0, 0), 0.026));
    }
    PT.add('camo', box(1.24, 0.12, 5.9, 0, 0.12, 4.45));
    PT.add('camo', box(1.24, 0.1, 5.9, 0, 0.8, 4.45, -0.065));
    PT.add('iron', box(1.6, 0.2, 0.6, 0, 0.12, 7.25));
    for (const s of [-1, 1]) PT.add('steel', xTube(s * 0.55, s * 0.85, 0.14, 0.14, 12, 0.1, 7.25));
    // the shield: two wings and an apron, the slot between them open to the top
    const shield = new THREE.Group();
    const SH = mk();
    for (const s of [-1, 1]) {
      SH.add('camo', box(1.45, 1.9, 0.05, s * 1.2, 2.25, 0));
      SH.add('camo', box(0.06, 1.9, 0.12, s * 1.94, 2.25, 0.04));
      SH.add('camo', box(0.06, 1.75, 0.12, s * 0.48, 2.33, 0.04));
      SH.add('dark', rivetRow(V(s * 0.52, 1.5, -0.04), V(s * 0.52, 3.15, -0.04), 0.2, V(0, 0, -1), 0.025));
      SH.add('dark', rivetRow(V(s * 1.9, 1.35, -0.04), V(s * 1.9, 3.15, -0.04), 0.2, V(0, 0, -1), 0.025));
      // bracing to the cheeks
      SH.add('camo', rod(V(s * 0.9, 1.35, 0.05), V(s * 0.95, 0.85, 1.0), 0.05, 6));
    }
    SH.add('camo', box(1.0, 0.5, 0.05, 0, 1.55, 0));
    SH.add('camo', box(3.9, 0.08, 0.12, 0, 3.2, 0.04));
    SH.build(shield, { y0: BED });
    shield.position.set(0, 0, -1.45);
    shield.rotation.x = -0.1;
    trav.add(shield);
    // handwheels: line on the left with the panoramic sight on its post, elevation on the right
    // (behind the road wheels, where the layers can stand at them)
    PT.add('camo', box(0.12, 0.7, 0.12, -1.0, 0.95, HW.trav));
    PT.add('camo', box(0.12, 0.7, 0.12, 1.0, 0.95, HW.elev));
    PT.add('dark', yTube(1.2, 1.88, 0.04, 0.04, 8, -1.08, SIGHT_Z));
    PT.add('steel', yTube(1.88, 2.02, 0.07, 0.07, 14, -1.08, SIGHT_Z));
    PT.add('dark', yTube(2.02, 2.16, 0.06, 0.05, 14, -1.08, SIGHT_Z));
    PT.add('glass', box(0.05, 0.06, 0.06, -1.08, 2.1, SIGHT_Z - 0.04));
    PT.add('dark', zTube(SIGHT_Z, SIGHT_Z + 0.16, 0.035, 0.04, 10, -1.08, 2.0));
    // the clinometer seat on the right of the cradle's arc (the quadrant itself lives on the barrel)
    PT.add('camo', box(0.4, 0.06, 0.4, 1.25, 1.7, 0.2));
    // the loading stage and its ladder, railings, the tray on its bracket
    // (the stage reaches forward under the tray so the loaders can stand at it and at the breech)
    PT.add('timber', box(2.7, 0.08, TRAY.z1 + 1.25 - TRAY.z0 - 0.05, 0, LP, (TRAY.z1 + 1.25 + TRAY.z0 + 0.05) / 2));
    for (const s of [-1, 1]) {
      PT.add('dark', box(0.08, LP, 0.08, s * 1.3, LP / 2, TRAY.z0 + 0.15));
      PT.add('dark', box(0.08, LP, 0.08, s * 1.3, LP / 2, TRAY.z1 + 1.25));
      PT.add('dark', yTube(LP, LP + 1.0, 0.025, 0.025, 6, s * 1.3, TRAY.z1 + 1.25));
      PT.add('dark', rod(V(s * 1.3, LP + 1.0, TRAY.z1 + 1.25), V(s * 1.3, LP + 1.0, TRAY.z0 + 0.4), 0.025, 6));
    }
    for (let i = 0; i < 4; i++) PT.add('timber', box(0.7, 0.05, 0.14, -1.7, 0.3 + i * 0.3, TRAY.z1 + 0.6));
    for (const s of [-1, 1]) PT.add('dark', rod(V(-1.7 + s * 0.35, 0, TRAY.z1 + 0.9), V(-1.7 + s * 0.35, LP, TRAY.z1 + 0.25), 0.03, 6));
    // tray: a trough lined up with the bore at the loading elevation
    const tg = new THREE.CylinderGeometry(0.26, 0.26, TRAY.z1 - TRAY.z0, 18, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    const trayG = new THREE.Group();
    const TP = mk();
    TP.add('steel', tg.translate(0, 0, (TRAY.z0 + TRAY.z1) / 2));
    for (const z of [TRAY.z0 + 0.2, TRAY.z1 - 0.2]) TP.add('dark', box(0.62, 0.32, 0.08, 0, -0.38, z));
    TP.build(trayG, { y0: BED + TR });
    trayG.position.set(0, TR, 0);
    trayG.rotation.x = GUN.loadEl;
    trav.add(trayG);
    PT.add('dark', box(0.5, TR - LP - 0.6, 0.1, 0, LP + (TR - LP - 0.6) / 2, TRAY.z0 + 0.2));
    // the crane post on the stage
    PT.add('dark', yTube(LP, LP + CRANE.h, 0.11, 0.09, 12, CRANE.x, CRANE.z));
    PT.add('dark', rod(V(CRANE.x, LP, CRANE.z - 0.9), V(CRANE.x, LP + 1.3, CRANE.z), 0.05, 6));
  }

  // ------------------------------------------------------------------ cradle (elevation frame)
  {
    PE.add('camo', rbox(1.18, 0.4, 2.9, 0.06, 0, -0.62, -0.55));
    for (const s of [-1, 1]) {
      PE.add('iron', zTube(-2.1, 0.75, 0.15, 0.15, 16, s * 0.34, -0.66));
      PE.add('dark', zTube(0.75, 0.9, 0.1, 0.1, 12, s * 0.34, -0.66));
      PE.add('iron', xTube(s * 0.62, s * 0.88, 0.2, 0.2, 16, 0, 0));
      // the elevating arcs, toothed, turning with the cradle
      PE.add('dark', gearArc(1.35, 1.48, -0.25, 1.25, 0.08, 26, 0.04).translate(s * 0.72, 0, 0));
      PE.add('camo', rod(V(s * 0.72, -0.4, -0.3), V(s * 0.72, -1.1, 0.7), 0.05, 6));
    }
    // recuperator over the barrel, the guides the barrel slides in
    PE.add('iron', zTube(-2.3, 0.4, 0.17, 0.17, 18, 0, 0.72));
    PE.add('dark', zTube(-2.36, -2.3, 0.12, 0.12, 12, 0, 0.72));
    PE.add('camo', box(0.36, 0.2, 2.4, 0, 0.55, -0.9));
    for (const z of [-2.0, -0.4]) PE.add('camo', new THREE.TorusGeometry(0.62, 0.07, 8, 28).translate(0, 0, z));
    // the clinometer seat on the breech end of the cradle
    PE.add('steel', box(0.34, 0.05, 0.22, 0.45, 0.6, 0.4));
  }

  // ------------------------------------------------------------------ barrel (recoil frame), wedge
  {
    const prof = [[MUZ, 0.21], [MUZ, 0.41], [MUZ + 0.16, 0.41], [MUZ + 0.22, 0.37], [-2.5, 0.39], [-2.45, 0.47], [-0.8, 0.5], [-0.75, 0.57], [0.6, 0.6], [0.62, 0.21]];
    PR.add('iron', zLathe(prof, 36));
    PR.add('dark', zTube(MUZ + 0.01, MUZ + 0.6, 0.208, 0.208, 24, 0, 0, true));
    PR.add('dark', new THREE.CircleGeometry(0.21, 24).translate(0, 0, MUZ + 0.6));
    // the breech ring: square, deep, with the wedge slot through it
    PR.add('iron', rbox(1.3, 1.22, 1.0, 0.07, 0, 0, 1.1));
    PR.add('dark', new THREE.CircleGeometry(0.25, 24).translate(0, 0, BRE + 0.002));
    PR.add('dark', rivetRow(V(-0.55, 0.62, 0.7), V(0.55, 0.62, 0.7), 0.18, V(0, 1, 0), 0.03));
    for (const s of [-1, 1]) PR.add('steel', box(0.05, 0.94, 0.42, s * 0.67, 0, BRE - 0.05));
    // lifting lugs on the barrel
    for (const z of [-1.6, 0.2]) PR.add('dark', box(0.2, 0.12, 0.3, 0, z < 0 ? 0.52 : 0.62, z));
    // the wedge: a block sliding through the slot, its crank on the right end
    PW.add('steel', rbox(1.24, 0.92, 0.36, 0.03, 0, 0, BRE + 0.18));
    PW.add('dark', box(0.05, 0.6, 0.3, 0.64, 0, BRE + 0.18));
    PW.add('dark', xTube(0.66, 0.9, 0.035, 0.035, 8, 0.15, BRE + 0.25));
    PW.add('brass', zTube(BRE + 0.36, BRE + 0.44, 0.05, 0.05, 10, 0, 0));
    PW.add('dark', new THREE.TorusGeometry(0.05, 0.012, 6, 12).translate(0, -0.07, BRE + 0.46));
  }

  // ------------------------------------------------------------------ crane
  {
    PC.add('dark', yTube(CRANE.h - 0.15, CRANE.h + 0.1, 0.16, 0.16, 12, 0, 0));
    PC.add('dark', box(CRANE.jib + 0.3, 0.16, 0.12, -CRANE.jib / 2, CRANE.h, 0));
    PC.add('dark', rod(V(0, CRANE.h - 1.4, 0), V(-CRANE.jib * 0.7, CRANE.h - 0.05, 0), 0.04, 6));
    PC.add('steel', xTube(-CRANE.jib - 0.06, -CRANE.jib + 0.06, 0.08, 0.08, 12, CRANE.h - 0.1, 0));
    PC.add('dark', box(0.2, 0.3, 0.25, 0.05, 1.15, 0));
    PH.add('dark', box(0.18, 0.2, 0.12, 0, 0, 0));
    PH.add('steel', new THREE.TorusGeometry(0.07, 0.02, 6, 12).translate(0, -0.15, 0));
  }

  PB.build(root, { y0: 0 });
  PT.build(trav, { y0: BED });
  PE.build(elev, { y0: BED + TR });
  PR.build(rec, { y0: BED + TR });
  PW.build(wedge, { y0: BED + TR });
  PC.build(crane, { y0: BED + LP });
  PH.build(hook, { y0: BED + LP });
  crane.rotation.order = 'YXZ';
  // the handwheels on their own spindles so they turn (rotation.x) as the crew cranks: line, elevation,
  // the crane's winch, the wedge's crank. WHEELS gives each one's radius; the crew reads the rim from it.
  const wheels = {};
  const wheel = (name, parent, R, spokes, handles, x, y, z, y0) => {
    const g = pivot(parent, 'wheel-' + name, x, y, z);
    const P = mk();
    P.add('dark', handwheel(R, spokes, R * 0.08, R * 0.18, handles));
    P.build(g, { y0 });
    wheels[name] = { node: g, R };
  };
  wheel('trav', trav, 0.32, 5, 1, -1.12, 1.3, HW.trav, BED + 1.3);
  wheel('elev', trav, 0.36, 6, 2, 1.13, 1.3, HW.elev, BED + 1.3);
  wheel('wedge', wedge, 0.2, 4, 1, 0.9, 0.15, BRE + 0.25, BED + TR);
  wheel('crane', crane, 0.22, 4, 2, 0.12, 1.15, 0, BED + LP + 1.15);
  hook.position.set(-CRANE.jib, CRANE.h - 0.3, 0);
  // the hook's fall: a rope scaled to the hook's drop
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), mats.rope);
  crane.add(fall);

  // ------------------------------------------------------------------ props
  const propFrom = (built) => {
    const g = new THREE.Group();
    for (const p of built.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    g.visible = false;
    return g;
  };
  const shells = { schwer: buildShell('m42'), leicht: buildShell('m42l') };
  const props = {
    hook: {}, tray: {}, // per shell kind
    bags: [], case: propFrom(buildCartridge('m42c')), spent: propFrom(buildCartridge('m42c')),
    rammer: new THREE.Group(),
  };
  for (const k of Object.keys(shells)) {
    props.hook[k] = propFrom(shells[k]);
    props.hook[k].rotation.x = -Math.PI / 2; // slung nose up from the hook
    hook.add(props.hook[k]);
    props.tray[k] = propFrom(shells[k]);
    elev.add(props.tray[k]);
  }
  for (let i = 0; i < 4; i++) {
    const b = propFrom(buildCartridge('m42'));
    elev.add(b);
    props.bags.push(b);
  }
  elev.add(props.case);
  trav.add(props.spent);
  {
    const RP = mk();
    RP.add('timber', zTube(0, 4.2, 0.045, 0.045, 8));
    RP.add('dark', zTube(-0.12, 0, 0.2, 0.2, 16));
    RP.build(props.rammer, { y0: BED + TR });
    props.rammer.visible = false;
    elev.add(props.rammer);
  }

  // ------------------------------------------------------------------ anchors
  const anchors = {};
  const anchor = (parent, name, x, y, z, ry = 0) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    o.rotation.y = ry;
    parent.add(o);
    anchors[name] = o;
    return o;
  };
  anchor(rec, 'muzzle', 0, 0, MUZ - 0.1);
  anchor(wedge, 'lanyard', 0, -0.07, BRE + 0.46);
  anchor(trav, 'sight', -1.08, 2.1, SIGHT_Z);
  anchor(elev, 'quadrant', 0.45, 0.65, 0.4);
  anchor(trav, 'tray', 0, TR, (TRAY.z0 + TRAY.z1) / 2);
  // first-person eyes (the station's look direction is the anchor's -Z)
  anchor(trav, 'eye-trav', -2.15, 1.66, 2.7, -0.58);
  anchor(trav, 'eye-elev', 2.2, 1.66, 2.5, 0.56);
  anchor(trav, 'eye-load', 0.62, LP + 1.62, TRAY.z1 + 0.85, 0.12);

  const rig = {
    root, pivots: { traverse: trav, elevation: elev, recoil: rec, wedge, crane, hook }, anchors, props, fall, wheels,
    trayZ: TRAY, craneSpec: CRANE, bed: BED, loadStage: LP, sightZ: SIGHT_Z,
    setTraverse: (r) => (trav.rotation.y = r),
    setElevation: (r) => (elev.rotation.x = r),
    setRecoil: (k) => (rec.position.z = k * 1.25),
    setWedge: (k) => (wedge.position.x = k * 1.15),
    // swing 0 over the shell cart (to the right), 1 over the tray; drop 0 up at the jib, 1 down at the cart or tray
    setCrane(swing, drop) {
      crane.rotation.y = Math.PI * (1 - swing);
      const top = CRANE.h - 0.3, low = swing > 0.5 ? TR - LP + 0.62 : 0.4 - LP;
      hook.position.y = top + (low - top) * drop;
      fall.position.set(-CRANE.jib, CRANE.h - 0.1, 0);
      fall.scale.y = Math.max(0.05, CRANE.h - 0.1 - hook.position.y);
    },
  };
  rig.setCrane(1, 0);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return rig;
}

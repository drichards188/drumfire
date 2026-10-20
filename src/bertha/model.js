import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, sideProfile, frontProfile, rivets, rivetRow, rivetPoly, handwheel, gearArc, mirrorX, mergeAll, Parts, vehicleMats, CAMO, DEG } from '../models/kit.js';
import { buildShell, buildCartridge } from '../models/shells.js';
import { mulberry32 } from '../noise.js';
import { GUN } from './ballistics.js';

// The 42 cm kurze Marinekanone 14 L/12, "Dicke Bertha" (Krupp, 1914), the M-Gerät on its wheeled carriage
// (refs/bertha: the Musée de l'Armée model, the 1914 photographs, the Spincourt pictures of November 1918 and
// the period engraving). A short fat barrel twelve calibres long with a muzzle swell, in a sleeve cradle with
// two recuperators over the barrel and two recoil brakes under it; riveted cheeks on solid disc wheels shod
// with Radgürtel (a chain of hinged steel shoes); the arched shield over the top, slotted for the barrel; two
// screw jacks at the front against tipping; a split box trail with the loading stage on it, its spade bearing
// in a curved trough behind the traversing rail; the horizontal sliding wedge (Keilverschluss) in the breech
// ring's jaws; a gooseneck crane on the right of the stage that lifts the shell off its cart. All of it stands
// on the Bettung: a riveted steel wheel bed in front, timber baulks behind, with a well for the breech at high
// elevation. Overall 11.7 m from the muzzle at zero elevation to the spade, 4.7 m high to the shield, 4.1 m wide
// (real: 10 x 4.7 x 4.5 m, the barrel 5.04 m, 42.6 t; the trail is long for the loading stage's stations). Game
// dimensions where the stations need them, not a drawing.
//
// Frames: root has the ground at y = 0, the bed top at BED. `traverse` turns the carriage about the axle
// (rotation.y, + = left); `elevation` sits on the trunnions (rotation.x, + = up), `recoil` slides the barrel
// back along +Z, `wedge` slides the block out to the right (+X). `crane` swings the jib (rotation.y),
// `hook` is the block on its fall. Props (the shell on the hook, on the tray, the bags, the brass case, the
// rammer, the spent case) are shown by the page from the loading state. Anchors give the crew stations.
// buildBertha({ finish }): 'bunt' (default, the 1917 Buntfarbenanstrich of the Flanders demo) or '1914' (the
// plain field grey the guns wore at Liège, used by the WW2 guest in v/de/bertha.js).

// 1914: plain Feldgrau gun paint, a little green in the grey (a guarded add like heavy_common's dgrau)
CAMO.feldgrau14 ??= { green: [0x666b5d, 0x70746a, 0x51554b], seed: 14 };

const BED = 0.35; // bed top over the ground
const TR = GUN.trunnion - BED; // trunnion axis over the bed top
const WR = 0.95, WX = 1.62; // wheel radius over the shoes, wheel centre x
const RIM = 0.78; // the disc wheel's rim; the Radgürtel shoes stand on it out to WR
const MUZ = -GUN.muzzle, BRE = 1.62; // barrel ends along the bore (z, elevation frame)
const TRAY = { z0: BRE + 0.45, z1: BRE + 2.25 }; // the loading tray behind the breech, at the loading elevation
// the tray rides on a small carriage with rollers on two rails along the stage: forward against the breech for
// loading, run back TRAY_BACK metres before the shot so the recoiling breech clears it at every elevation
// from 8 degrees (the firing minimum) up [E]
export const TRAY_BACK = 1.35;
const LP = 1.25; // loading stage floor over the bed top
// the opening in the front of the stage deck the breech ring recoils through at low and middle elevations
const SLOT = { x: 0.72, z1: 3.45 };
const RAILX = 0.82; // the tray carriage's rails, either side of the opening
const CRANE = { x: 1.75, z: 3.0, h: 4.3, jib: 1.75 }; // the jib ends over the tray (x 0) and over the cart (x 3.5)
// the shell hangs level in a sling under the hook block, HANG metres below it (so it sets down in the tray as it lies)
const HANG = 1.0;
export const CART_TOP = 0.62; // the shell's axis on the shell cart over the bed top (position.js puts the cart there)
// Variable recoil [E]: the full 1.25 m up to about 30 degrees, then shortened (by a cut-off cam on the
// elevation, as heavy howitzers had) so the breech ring never strikes the floor of the well in the bed (0.29 m
// below the bed top) at high elevation. The lowest point of the ring is its back lower corner (y -0.61, z 2.08
// in the barrel's frame at rest).
export function recoilLength(el) {
  const s = Math.sin(el);
  if (s < 0.2) return 1.25;
  const low = TR - 0.61 * Math.cos(el) - 2.08 * s; // the corner's height over the bed top at rest
  return Math.min(1.25, Math.max(0.28, (low + 0.27) / s));
}
const HW = { trav: 1.42, elev: 1.32 }; // z of the line and elevation handwheels, clear behind the road wheels
export const SIGHT_Z = 1.15; // the panoramic sight's post, beside the line handwheel
// the arched shield: a cylinder about the trunnion axis from A0 (front, low) over the top to A1 (behind the
// breech); a slot |x| < SLOT for the barrel up to BRIDGE, closed over the top behind it
const HOOD = { r: 2.25, t: 0.035, slot: 0.78, w: 2.05, a0: 2 * DEG, a1: 148 * DEG, bridge: 100 * DEG };
// cradle cylinders [x, y, r, z0, z1]: two recuperators over the barrel, two brakes under it (these end at the
// trunnion line so they clear the axle stubs at every elevation)
const CYL = [[-0.25, 0.9, 0.19, -2.0, 0.25], [0.25, 0.9, 0.19, -2.0, 0.25], [-0.25, -0.84, 0.17, -2.0, -0.05], [0.25, -0.84, 0.17, -2.0, -0.05]];
const GX = 0.9, GT = 0.12; // the trail girders' centre x and thickness: the breech recoils down between them
const PIT = { x: 1.2, z0: 0.0, z1: 3.4 }; // the well in the bed for the breech at high elevation

// ---------------------------------------------------------------- local geometry helpers
// a band of a surface of revolution about the X axis between (x0, r0) and (x1, r1): a cylinder, a cone or a
// flat annulus. Its normal faces out for x1 > x0; an annulus faces -X when r1 > r0 and +X when r1 < r0.
const xBand = (x0, r0, x1, r1, seg = 40, p0 = 0, pl = Math.PI * 2) =>
  new THREE.LatheGeometry([new THREE.Vector2(r0, x0), new THREE.Vector2(r1, x1)], seg, p0, pl).rotateZ(-Math.PI / 2);
// the same about the Z axis (y = -r cos phi: phi 0 points down)
const zBand = (z0, r0, z1, r1, seg = 24, p0 = 0, pl = Math.PI * 2) =>
  new THREE.LatheGeometry([new THREE.Vector2(r0, z0), new THREE.Vector2(r1, z1)], seg, p0, pl).rotateX(Math.PI / 2);
// a plate bent round the X axis (through y = yc, z = 0): radius r..r + t, x0..x1, from angle a0 to a1, the
// angle measured from -Z up over the top (90 deg straight up). A closed thin solid but for its two curved ends.
function arcPlate(x0, x1, r, t, a0, a1, seg, yc) {
  const p0 = a0 + Math.PI, pl = a1 - a0;
  return mergeAll([xBand(x0, r + t, x1, r + t, seg, p0, pl), xBand(x1, r, x0, r, seg, p0, pl), xBand(x0, r, x0, r + t, seg, p0, pl), xBand(x1, r + t, x1, r, seg, p0, pl)]).translate(0, yc, 0);
}
// a bar along X lying on that cylinder at angle a (radial depth d, tangential width w)
const arcBar = (x0, x1, r, a, d, w, yc) => box(Math.abs(x1 - x0), d, w, (x0 + x1) / 2, yc + r * Math.sin(a), -r * Math.cos(a), a - Math.PI / 2);
// rivets along the cylinder at x from a0 to a1, every `step` metres of arc, heads facing out
function arcRivets(x, r, a0, a1, step, yc, rr = 0.022) {
  const n = Math.max(1, Math.round(((a1 - a0) * r) / step)), list = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, nrm = V(0, Math.sin(a), -Math.cos(a));
    list.push(rivets([V(x, yc + r * Math.sin(a), -r * Math.cos(a))], nrm, rr));
  }
  return mergeAll(list);
}
// a rounded rectangle [x, y] (w by h, corner radius r) for frontProfile: the cradle sleeve and its flanges
function rrect(w, h, r, n = 5) {
  const pts = [], cx = w / 2 - r, cy = h / 2 - r;
  for (const [qx, qy, a0] of [[cx, cy, 0], [-cx, cy, Math.PI / 2], [-cx, -cy, Math.PI], [cx, -cy, Math.PI * 1.5]]) {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([qx + Math.cos(a) * r, qy + Math.sin(a) * r]); }
  }
  return pts;
}
// the right road wheel at x = X: a solid steel disc (the post-prototype guns had solid wheels), its riveted rim,
// the hub with its bolted flange; the left wheel is the mirror image
function discWheel(X) {
  const R0 = 0.745;
  return mergeAll([
    xBand(X - 0.27, 0, X - 0.27, 0.17), xBand(X - 0.27, 0.17, X - 0.06, 0.24), xBand(X - 0.06, 0.24, X - 0.06, R0, 40),
    xBand(X - 0.06, R0, X - 0.21, R0, 48), xBand(X - 0.21, R0, X - 0.21, RIM, 48), xBand(X - 0.21, RIM, X + 0.21, RIM, 48),
    xBand(X + 0.21, RIM, X + 0.21, R0, 48), xBand(X + 0.21, R0, X + 0.04, R0, 48), xBand(X + 0.04, R0, X + 0.04, 0.44, 40),
    xBand(X + 0.04, 0.44, X + 0.09, 0.44, 32), xBand(X + 0.09, 0.44, X + 0.09, 0.3, 32), xBand(X + 0.09, 0.3, X + 0.26, 0.2, 24), xBand(X + 0.26, 0.2, X + 0.26, 0, 24),
  ]);
}

export function buildBertha({ finish = 'bunt' } = {}) {
  const scheme = finish === '1914' ? 'feldgrau14' : 'bunt';
  const mats = vehicleMats(scheme);
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
  const trayP = pivot(trav, 'tray', 0, 0, 0); // the tray carriage: position.z runs it back (setTray)
  const PB = mk(), PT = mk(), PE = mk(), PR = mk(), PW = mk(), PC = mk(), PH = mk(), PY = mk();
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

  // ------------------------------------------------------------------ the Bettung (root)
  {
    // timber baulks along z on steel cross girders; in front a riveted steel wheel bed (the Radbettung the
    // wheels and the front jacks stand on); a well for the breech (|x| < PIT.x, PIT.z0..z1) at high elevation
    const SB = { x: 2.4, z0: -2.6, z1: 1.6 }; // the steel wheel bed
    const tints = [0xffffff, 0xece4d8, 0xd8d0c4];
    for (let i = 0; i < 22; i++) {
      const x = -3.15 + i * 0.3, ax = Math.abs(x), tint = tints[i % 3];
      const z0 = ax > SB.x ? -2.6 : ax > PIT.x ? SB.z1 : PIT.z1, z1 = 9.8 + (rnd() - 0.5) * 0.2;
      PB.add('timber', box(0.28, 0.18, z1 - z0, x, 0.26, (z0 + z1) / 2 + (rnd() - 0.5) * 0.03), { tint });
    }
    for (let i = 0; i < 8; i++) {
      const z = -2.2 + i * 1.6;
      if (z > SB.z1 && z > PIT.z1) PB.add('dark', box(6.6, 0.16, 0.2, 0, 0.08, z));
      else for (const s of [-1, 1]) {
        const xa = z < SB.z1 ? SB.x : PIT.x;
        PB.add('dark', box(3.3 - xa, 0.16, 0.2, s * (3.3 + xa) / 2, 0.08, z));
      }
    }
    // the steel bed: a front box across and two side boxes beside the well, butt straps and rivets on top
    const sbox = (x0, x1, z0, z1) => {
      PB.add('iron', box(x1 - x0, BED - 0.02, z1 - z0, (x0 + x1) / 2, (BED + 0.02) / 2, (z0 + z1) / 2));
      PB.add('dark', rivetRow(V(x0 + 0.06, BED, z0 + 0.06), V(x1 - 0.06, BED, z0 + 0.06), 0.25, Y, 0.022));
      PB.add('dark', rivetRow(V(x0 + 0.06, BED, z1 - 0.06), V(x1 - 0.06, BED, z1 - 0.06), 0.25, Y, 0.022));
      PB.add('dark', rivetRow(V(x0 + 0.06, BED, z0 + 0.06), V(x0 + 0.06, BED, z1 - 0.06), 0.25, Y, 0.022));
      PB.add('dark', rivetRow(V(x1 - 0.06, BED, z0 + 0.06), V(x1 - 0.06, BED, z1 - 0.06), 0.25, Y, 0.022));
    };
    sbox(-SB.x, SB.x, SB.z0, PIT.z0);
    for (const s of [-1, 1]) sbox(s > 0 ? PIT.x : -SB.x, s > 0 ? SB.x : -PIT.x, PIT.z0, SB.z1);
    for (const x of [-1.2, 0, 1.2]) PB.add('iron', box(0.16, 0.012, PIT.z0 - SB.z0, x, BED + 0.006, (SB.z0 + PIT.z0) / 2), { tint: 0xc8c8c8 });
    PB.add('dark', rivetRow(V(-SB.x + 0.05, 0.1, SB.z0 - 0.005), V(SB.x - 0.05, 0.1, SB.z0 - 0.005), 0.25, V(0, 0, -1), 0.022));
    PB.add('dark', rivetRow(V(-SB.x + 0.05, BED - 0.07, SB.z0 - 0.005), V(SB.x - 0.05, BED - 0.07, SB.z0 - 0.005), 0.25, V(0, 0, -1), 0.022));
    for (const s of [-1, 1]) PB.add('dark', rivetRow(V(s * (SB.x + 0.005), BED - 0.07, SB.z0 + 0.05), V(s * (SB.x + 0.005), BED - 0.07, SB.z1 - 0.05), 0.25, V(s, 0, 0), 0.022));
    // the well: plank-lined, its floor the levelled ground
    PB.add('soil', box(PIT.x * 2, 0.02, PIT.z1 - PIT.z0, 0, 0.02, (PIT.z0 + PIT.z1) / 2));
    for (const s of [-1, 1]) PB.add('timber', box(0.05, BED - 0.04, PIT.z1 - SB.z1, s * (PIT.x - 0.025), BED / 2, (SB.z1 + PIT.z1) / 2), { tint: 0xb8b0a4 });
    PB.add('timber', box(PIT.x * 2, BED - 0.04, 0.05, 0, BED / 2, PIT.z1 - 0.025), { tint: 0xb8b0a4 });
    // the traversing arc: a curved rail the trail rollers run on, its rack inside it, and the spade trough
    // behind it (a steel channel the spade's edge bears in as the trail swings)
    const n = 18, R = 7.25, RS = 7.75;
    const at = (a, r, y) => V(-Math.sin(a) * r, y, Math.cos(a) * r);
    for (let i = 0; i < n; i++) {
      const a0 = (-14 + (28 * i) / n) * DEG, a1 = (-14 + (28 * (i + 1)) / n) * DEG, am = (a0 + a1) / 2;
      PB.add('steel', rod(at(a0, R, BED + 0.06), at(a1, R, BED + 0.06), 0.07, 6));
      PB.add('dark', rod(at(a0, R + 0.18, BED + 0.02), at(a1, R + 0.18, BED + 0.02), 0.05, 5));
      const len = 2 * RS * Math.sin((a1 - a0) / 2) + 0.01, p = at(am, RS, 0);
      PB.add('iron', box(len, 0.03, 0.42, p.x, BED + 0.015, p.z, 0, -am, 0));
      for (const s of [-1, 1]) {
        const q = at(am, RS + s * 0.19, 0);
        PB.add('iron', box(len, 0.2, 0.04, q.x, BED + 0.1, q.z, 0, -am, 0));
      }
    }
  }

  // ------------------------------------------------------------------ carriage (traverse frame, y over the bed top)
  {
    // road wheels: solid riveted discs on stub axles from the cheeks, shod with the Radgürtel: twelve hinged
    // steel shoes (a broad sole plate, a block bearing on the rim, side links and pins), one flat under the axle
    const W = new Parts(mats);
    W.add('camo', discWheel(WX).translate(0, WR, 0));
    const disc = [], hub = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; disc.push(V(WX + 0.045, WR + Math.cos(a) * 0.69, Math.sin(a) * 0.69)); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; hub.push(V(WX + 0.095, WR + Math.cos(a) * 0.37, Math.sin(a) * 0.37)); }
    W.add('dark', rivets(disc, X, 0.026));
    W.add('dark', rivets(hub, X, 0.034));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const at = (r) => [WR + c * r, s * r];
      let [y, z] = at(WR - 0.022);
      W.add('iron', box(0.66, 0.045, 0.4, WX, y, z, a));
      [y, z] = at(0.85);
      W.add('iron', box(0.46, 0.11, 0.3, WX, y, z, a));
      W.add('dark', box(0.62, 0.03, 0.05, WX, ...at(WR - 0.055), a)); // the transverse rib under the sole
      const b = a + Math.PI / 12, cb = Math.cos(b), sb = Math.sin(b);
      for (const dx of [-0.25, 0.25]) W.add('dark', box(0.035, 0.08, 0.24, WX + dx, WR + cb * 0.85, sb * 0.85, b));
      W.add('steel', xTube(WX - 0.29, WX + 0.29, 0.02, 0.02, 6, WR + cb * 0.85, sb * 0.85));
    }
    // the stub axle through the hub, its cap and linch pin
    W.add('steel', xTube(0.86, WX + 0.42, 0.12, 0.12, 16, WR, 0));
    W.add('dark', xTube(WX + 0.34, WX + 0.44, 0.16, 0.16, 6, WR, 0));
    W.add('steel', yTube(WR - 0.22, WR + 0.22, 0.025, 0.025, 6, WX + 0.38, 0));
    // chocks clamped round the lowest shoe
    for (const dz of [-0.66, 0.66]) W.add('iron', box(0.5, 0.14, 0.24, WX, 0.07, dz));
    for (const [k, list] of W.lists) for (const g of list) { PT.add(k, g); PT.add(k, mirrorX(g)); }
    W.lists.clear();

    // cheeks: high over the trunnions, sloping down to the trail; flanged edges, stiffeners, rivets
    const cheek = [[-1.3, 0.55], [-1.3, 1.35], [-0.75, TR + 0.15], [-0.35, TR + 0.42], [0.45, TR + 0.42], [0.85, TR + 0.05], [1.75, 1.15], [1.95, 0.55]];
    for (const s of [-1, 1]) {
      PT.add('camo', sideProfile(cheek, 0.16).translate(s * 0.86, 0, 0));
      PT.add('dark', rivetPoly(cheek, (z, y) => V(s * 0.945, y, z), 0.07, 0.18, V(s, 0, 0), 0.024));
      PT.add('camo', box(0.1, 0.12, 3.1, s * 0.95, 0.6, 0.32));
      PT.add('dark', rivetRow(V(s * 1.005, 0.6, -1.2), V(s * 1.005, 0.6, 1.85), 0.18, V(s, 0, 0), 0.024));
      for (const [z, top] of [[-0.95, 1.55], [-0.45, 2.1], [0.6, 2.2], [1.35, 1.45]]) PT.add('camo', box(0.06, top - 0.66, 0.09, s * 0.97, (top + 0.66) / 2, z));
      // trunnion bearing: the boss on the cheek and its cap with bolts
      PT.add('camo', xTube(s * 0.86, s * 1.06, 0.3, 0.3, 22, TR, 0));
      PT.add('iron', xTube(s * 1.04, s * 1.1, 0.2, 0.2, 18, TR, 0));
      const bolts = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; bolts.push(V(s * 1.065, TR + Math.cos(a) * 0.25, Math.sin(a) * 0.25)); }
      PT.add('dark', rivets(bolts, V(s, 0, 0), 0.03));
      PT.add('iron', rbox(0.24, 0.1, 0.7, 0.03, s * 0.94, TR + 0.46, 0));
    }
    // the floor between the cheeks in front of the trunnions (behind them the breech swings down at high
    // elevation), the front transom with its lightening holes and the jack's handwheel
    PT.add('camo', box(1.6, 0.16, 0.75, 0, 0.52, -0.86));
    PT.add('camo', box(1.56, 0.42, 0.12, 0, 0.74, -1.24));
    for (const x of [-0.5, 0, 0.5]) PT.add('dark', rbox(0.3, 0.2, 0.02, 0.04, x, 0.76, -1.305));
    PT.add('dark', rivetRow(V(-0.74, 0.92, -1.305), V(0.74, 0.92, -1.305), 0.15, V(0, 0, -1), 0.022));
    PT.add('dark', rivetRow(V(-0.74, 0.57, -1.305), V(0.74, 0.57, -1.305), 0.15, V(0, 0, -1), 0.022));
    // the two front jacks against tipping: struts from the cheek noses down to screw feet on the steel bed
    for (const s of [-1, 1]) {
      const top = V(s * 0.96, 0.85, -1.22), foot = V(s * 1.18, 0.12, -2.3);
      PT.add('camo', rod(top, foot, 0.07, 10));
      PT.add('camo', box(0.2, 0.28, 0.2, s * 0.98, 0.85, -1.22));
      PT.add('steel', rod(foot.clone().add(V(0, 0.32, -0.06)), V(s * 1.18, 0.05, -2.32), 0.05, 10));
      PT.add('dark', rod(foot.clone().add(V(0, 0.22, -0.04)), foot.clone().add(V(0, 0.34, -0.06)), 0.09, 10));
      PT.add('iron', yTube(0.0, 0.05, 0.24, 0.2, 18, s * 1.18, -2.32));
      PT.add('camo', rod(V(s * 0.86, 0.6, -0.95), foot.clone().add(V(-s * 0.02, 0.3, 0.05)), 0.04, 6));
    }
    PT.add('dark', handwheel(0.17, 4, 0.016, 0.035, 1).rotateY(Math.PI / 2).translate(0, 0.74, -1.36));
    // the crew platform in front of the shield (the production guns had one): a plate deck on bearers from the
    // transom over the jacks, side rails clear of the barrel, a ladder down each side ahead of the wheels
    {
      const DY = 1.0, z0 = -1.32, z1 = -2.47, zm = (z0 + z1) / 2, dl = z0 - z1;
      PT.add('iron', box(2.3, 0.05, dl, 0, DY, zm));
      PT.add('iron', box(2.36, 0.12, 0.05, 0, DY - 0.05, z1 - 0.02));
      for (const s of [-1, 1]) {
        PT.add('iron', box(0.05, 0.12, dl, s * 1.18, DY - 0.05, zm));
        PT.add('iron', box(0.1, 0.14, dl, s * 0.62, DY - 0.1, zm));
        PT.add('dark', rivetRow(V(s * 1.1, DY + 0.026, z0 - 0.05), V(s * 1.1, DY + 0.026, z1 + 0.05), 0.2, Y, 0.02));
        PT.add('camo', rod(V(s * 1.1, DY - 0.08, z1 + 0.05), V(s * 0.9, 0.62, z0 + 0.05), 0.04, 6));
        for (const z of [z0 - 0.08, z1 + 0.08]) PT.add('dark', yTube(DY, DY + 0.9, 0.022, 0.022, 6, s * 1.15, z));
        PT.add('dark', rod(V(s * 1.15, DY + 0.9, z0 - 0.08), V(s * 1.15, DY + 0.9, z1 + 0.08), 0.022, 6));
        PT.add('dark', rod(V(s * 1.15, DY + 0.45, z0 - 0.08), V(s * 1.15, DY + 0.45, z1 + 0.08), 0.016, 5));
        for (const z of [-1.72, -2.12]) PT.add('dark', rod(V(s * 1.2, DY - 0.02, z), V(s * 1.62, 0.0, z), 0.025, 6));
        for (let i = 1; i < 4; i++) { const k = i / 4; PT.add('dark', zTube(-2.12, -1.72, 0.018, 0.018, 6, s * (1.62 - 0.42 * k), DY * k)); }
      }
      PT.add('dark', rivetRow(V(-1.05, DY + 0.026, z1 + 0.05), V(1.05, DY + 0.026, z1 + 0.05), 0.2, Y, 0.02));
    }

    // the arched shield: two wings beside the barrel's slot from low in front over the top, a bridge over the
    // slot behind the barrel at full elevation; framed at the edges, riveted, on struts from the cheek tops
    const H = HOOD, yc = TR;
    for (const s of [-1, 1]) {
      const xi = s * H.slot, xo = s * H.w, x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
      PT.add('camo', arcPlate(x0, x1, H.r, H.t, H.a0, H.a1, 30, yc));
      for (const [x, inset] of [[xi, s * 0.06], [xo, -s * 0.06]]) {
        PT.add('camo', arcPlate(x - 0.025, x + 0.025, H.r - 0.09, 0.09, H.a0, H.a1, 30, yc)); // edge frame (angle iron)
        PT.add('dark', arcRivets(x + inset, H.r + H.t, H.a0 + 0.02, H.a1 - 0.02, 0.17, yc));
      }
      const onHood = (x, a) => V(x, yc + (H.r + H.t) * Math.sin(a), -(H.r + H.t) * Math.cos(a));
      for (const a of [H.a0, 56 * DEG, H.bridge, 124 * DEG, H.a1]) {
        PT.add('camo', arcBar(x0, x1, H.r - 0.04, a, 0.08, a === H.a0 || a === H.a1 ? 0.07 : 0.05, yc));
        const ar = a + (a === H.a1 ? -0.03 : 0.03);
        PT.add('dark', rivetRow(onHood(x0 + 0.1, ar), onHood(x1 - 0.1, ar), 0.17, V(0, Math.sin(ar), -Math.cos(ar)), 0.022));
      }
      // struts from the cheek tops to the frame
      const inner = (a, x) => V(x, yc + (H.r - 0.08) * Math.sin(a), -(H.r - 0.08) * Math.cos(a));
      PT.add('camo', rod(V(s * 0.96, TR + 0.3, -0.45), inner(42 * DEG, s * 1.25), 0.05, 8));
      PT.add('camo', rod(V(s * 0.96, TR + 0.3, 0.4), inner(116 * DEG, s * 1.25), 0.05, 8));
      PT.add('camo', rod(V(s * 0.96, TR + 0.3, -0.05), inner(80 * DEG, s * 1.6), 0.04, 8));
      PT.add('camo', rod(V(s * 1.0, TR + 0.25, 0.25), inner(140 * DEG, s * 1.45), 0.045, 8));
      PT.add('camo', arcPlate(s * 1.25 - 0.03, s * 1.25 + 0.03, H.r - 0.09, 0.09, 30 * DEG, H.a1, 24, yc)); // a rib under the wing
    }
    PT.add('camo', arcPlate(-H.slot, H.slot, H.r, H.t, H.bridge, H.a1, 10, yc));
    PT.add('dark', arcRivets(0, H.r + H.t, H.bridge + 0.04, H.a1 - 0.04, 0.17, yc));
    // the handwheels' gearboxes outside the cheeks: line on the left with the panoramic sight on its post,
    // elevation on the right (behind the road wheels, where the layers can stand at them); the elevating
    // pinion's shaft runs in to the arc, the traversing shaft back along the left girder to the trail end
    for (const [s, z] of [[-1, HW.trav], [1, HW.elev]]) {
      PT.add('camo', box(0.12, 0.62, 0.14, s * 1.0, 0.92, z));
      PT.add('iron', rbox(0.14, 0.2, 0.2, 0.04, s * 0.99, 1.3, z));
      PT.add('steel', xTube(s * 1.08, s * 1.12, 0.035, 0.035, 8, 1.3, z));
    }
    PT.add('steel', xTube(0.76, 0.92, 0.035, 0.035, 8, 1.3, HW.elev));
    PT.add('steel', rod(V(-1.06, 1.18, HW.trav + 0.1), V(-1.06, 0.5, 6.95), 0.03, 6));
    PT.add('iron', rbox(0.24, 0.26, 0.3, 0.05, -1.1, 0.42, 7.1));
    PT.add('dark', yTube(1.2, 1.88, 0.04, 0.04, 8, -1.08, SIGHT_Z));
    PT.add('dark', box(0.16, 0.06, 0.1, -1.01, 1.22, SIGHT_Z));
    PT.add('steel', yTube(1.88, 2.02, 0.07, 0.07, 14, -1.08, SIGHT_Z));
    PT.add('dark', yTube(2.02, 2.16, 0.06, 0.05, 14, -1.08, SIGHT_Z));
    PT.add('glass', box(0.05, 0.06, 0.06, -1.08, 2.1, SIGHT_Z - 0.04));
    PT.add('dark', zTube(SIGHT_Z, SIGHT_Z + 0.16, 0.035, 0.04, 10, -1.08, 2.0));

    // the split box trail: two plate girders far enough apart for the breech to recoil down between them,
    // closed behind the well; the stage rides on them; the trail end with its rollers on the rail and the spade
    const gir = [[1.35, 0.12], [1.35, 1.1], [5.2, 1.1], [7.45, 0.62], [7.45, 0.1]];
    for (const s of [-1, 1]) {
      const x = s * GX, xo = s * (GX + GT / 2 + 0.005);
      PT.add('camo', sideProfile(gir, GT).translate(x, 0, 0));
      PT.add('iron', box(0.24, 0.04, 3.85, x, 1.12, 3.28));
      PT.add('iron', box(0.24, 0.04, 6.1, x, 0.12, 4.4));
      PT.add('dark', rivetRow(V(xo, 1.06, 1.45), V(xo, 1.06, 5.15), 0.18, V(s, 0, 0), 0.022));
      PT.add('dark', rivetRow(V(xo, 0.17, 1.45), V(xo, 0.17, 7.35), 0.18, V(s, 0, 0), 0.022));
      PT.add('dark', rivetRow(V(xo, 1.06, 5.3), V(xo, 0.68, 7.35), 0.18, V(s, 0, 0), 0.022));
      for (const z of [2.0, 2.75, 3.5, 4.25, 5.0, 5.75, 6.5]) {
        const top = z < 5.2 ? 1.08 : 1.1 - ((z - 5.2) / 2.25) * 0.48 - 0.02;
        PT.add('camo', box(0.05, top - 0.14, 0.08, s * (GX + GT / 2 + 0.025), (top + 0.14) / 2, z));
      }
    }
    for (const z of [3.75, 5.0, 6.3]) {
      const top = z < 5.2 ? 1.1 : 1.1 - ((z - 5.2) / 2.25) * 0.48;
      PT.add('camo', box(GX * 2 - GT, 0.14, 0.1, 0, top - 0.07, z));
      PT.add('camo', box(GX * 2 - GT, 0.14, 0.1, 0, 0.17, z));
    }
    PT.add('camo', box(GX * 2 - GT, 0.06, 3.25, 0, 0.13, 5.375));
    PT.add('camo', box(GX * 2 + GT, 0.06, 2.3, 0, 0.89, 6.33, 0.21));
    // the trail end: transom, roller brackets over the rail, the spade leaning back into its trough, gussets
    PT.add('iron', box(2.0, 0.5, 0.12, 0, 0.35, 7.48));
    PT.add('dark', rivetRow(V(-0.9, 0.55, 7.545), V(0.9, 0.55, 7.545), 0.15, Z, 0.022));
    for (const s of [-1, 1]) {
      PT.add('steel', xTube(s * 0.5, s * 0.78, 0.12, 0.12, 14, 0.25, 7.25));
      PT.add('iron', box(0.06, 0.3, 0.36, s * 0.47, 0.3, 7.25));
      PT.add('iron', box(0.06, 0.3, 0.36, s * 0.81, 0.3, 7.25));
      PT.add('iron', sideProfile([[7.48, 0.6], [7.48, 0.1], [7.74, 0.03]], 0.05).translate(s * 0.96, 0, 0));
    }
    PT.add('iron', box(2.0, 0.64, 0.05, 0, 0.31, 7.64, -0.32));
    PT.add('dark', rivetRow(V(-0.9, 0.56, 7.58), V(0.9, 0.56, 7.58), 0.2, V(0, 0.31, 0.95), 0.022));
    for (const s of [-1, 1]) PT.add('chain', new THREE.TorusGeometry(0.1, 0.022, 6, 12).rotateY(Math.PI / 2).translate(s * 1.03, 0.45, 7.2));

    // the loading stage on the trail: plank deck on cross bearers, a steel edge, an outrigger on the right for
    // the crane, brackets down to the girders, railings, a ladder on the left, the charge rack at the back
    const Z0 = TRAY.z0 + 0.05, Z1 = TRAY.z1 + 1.25, ZC = (Z0 + Z1) / 2, OUT = { x: 1.95, z0: 2.55, z1: 3.95 };
    // the deck planks; ahead of SLOT.z1 only beside the opening the breech recoils through
    const sx = (1.35 + SLOT.x) / 2, sw = 1.35 - SLOT.x;
    for (let i = 0; i < 11; i++) {
      const z = Z0 + 0.135 + i * ((Z1 - Z0 - 0.27) / 10);
      if (z + 0.13 > SLOT.z1) PT.add('timber', box(2.7, 0.06, 0.255, 0, LP - 0.01, z), { tint: tints2(i) });
      else for (const s of [-1, 1]) PT.add('timber', box(sw, 0.06, 0.255, s * sx, LP - 0.01, z), { tint: tints2(i + (s > 0 ? 1 : 0)) });
    }
    for (let i = 0; i < 5; i++) PT.add('timber', box(0.6, 0.06, 0.26, (1.35 + OUT.x) / 2, LP - 0.01, OUT.z0 + 0.14 + i * 0.28), { tint: tints2(i + 3) });
    for (const z of [Z0 + 0.15, 3.0, 3.95, Z1 - 0.12]) {
      if (z > SLOT.z1) PT.add('iron', box(2.7, 0.08, 0.1, 0, LP - 0.08, z));
      else for (const s of [-1, 1]) PT.add('iron', box(sw, 0.08, 0.1, s * sx, LP - 0.08, z));
    }
    // the opening's steel edging (angle iron along both sides and across the back), riveted to the planks
    for (const s of [-1, 1]) {
      PT.add('iron', box(0.05, 0.1, SLOT.z1 - Z0, s * (SLOT.x + 0.025), LP - 0.03, (Z0 + SLOT.z1) / 2));
      PT.add('dark', rivetRow(V(s * (SLOT.x + 0.06), LP + 0.022, Z0 + 0.08), V(s * (SLOT.x + 0.06), LP + 0.022, SLOT.z1 - 0.08), 0.2, Y, 0.016));
    }
    PT.add('iron', box(SLOT.x * 2 + 0.1, 0.1, 0.05, 0, LP - 0.03, SLOT.z1 + 0.025));
    // the tray carriage's rails, let into the deck from the breech end to the back of the stage, with a stop at the
    // back that the rear rollers come to rest against when the tray is run back
    for (const s of [-1, 1]) {
      PT.add('steel', box(0.05, 0.03, Z1 - Z0 - 0.1, s * RAILX, LP + 0.007, ZC - 0.05));
      PT.add('iron', box(0.09, 0.02, Z1 - Z0 - 0.1, s * RAILX, LP + 0.011, ZC - 0.05));
      PT.add('dark', box(0.07, 0.08, 0.06, s * RAILX, LP + 0.055, Z1 - 0.13));
    }
    for (const s of [-1, 1]) {
      PT.add('iron', box(0.05, 0.12, Z1 - Z0, s * 1.37, LP - 0.03, ZC));
      PT.add('dark', rivetRow(V(s * 1.395, LP - 0.03, Z0 + 0.05), V(s * 1.395, LP - 0.03, Z1 - 0.05), 0.2, V(s, 0, 0), 0.02));
      for (const z of [Z0 + 0.25, ZC, Z1 - 0.3]) PT.add('iron', rod(V(s * (GX + 0.06), 0.4, z), V(s * 1.33, LP - 0.12, z), 0.035, 6));
    }
    PT.add('iron', box(0.05, 0.12, OUT.z1 - OUT.z0, OUT.x + 0.02, LP - 0.03, (OUT.z0 + OUT.z1) / 2));
    for (const z of [OUT.z0, OUT.z1]) {
      PT.add('iron', box(OUT.x - 1.35, 0.1, 0.06, (1.35 + OUT.x) / 2, LP - 0.06, z));
      PT.add('iron', rod(V(GX + 0.06, 0.35, z), V(OUT.x - 0.05, LP - 0.12, z), 0.04, 6));
    }
    // railings: stanchions and two rails; the left one broken for the ladder, the right one ends behind the crane
    const rail = (x, za, zb) => {
      for (const z of [za, (za + zb) / 2, zb]) PT.add('dark', yTube(LP, LP + 1.0, 0.025, 0.025, 6, x, z));
      PT.add('dark', rod(V(x, LP + 1.0, za), V(x, LP + 1.0, zb), 0.025, 6));
      PT.add('dark', rod(V(x, LP + 0.5, za), V(x, LP + 0.5, zb), 0.018, 5));
    };
    rail(-1.31, TRAY.z0 + 0.4, 3.72);
    rail(-1.31, 4.3, Z1 - 0.04);
    rail(1.31, 3.98, Z1 - 0.04);
    rail(OUT.x - 0.03, OUT.z0 + 0.05, OUT.z1 - 0.05);
    // the ladder: stringers from the bed up to the stage's left edge, rungs along z
    for (const z of [3.76, 4.26]) PT.add('timber', rod(V(-2.02, 0.0, z), V(-1.36, LP - 0.02, z), 0.035, 6));
    for (let i = 1; i < 5; i++) { const k = i / 5; PT.add('timber', zTube(3.76, 4.26, 0.025, 0.025, 6, -2.02 + 0.66 * k, (LP - 0.02) * k)); }
    // the loading step behind the stage, on the trail: where the man in charge of the loading stands to see over
    // his detachment (the tray's run ends just short of it)
    PT.add('timber', box(1.1, 0.06, 0.34, -0.2, LP + 0.33, 5.3), { tint: 0xe8e0d2 });
    for (const x of [-0.7, 0.3]) PT.add('iron', box(0.05, LP + 0.33 - 1.06, 0.3, x, (LP + 0.33 + 1.06) / 2, 5.3));
    PT.add('iron', box(1.05, 0.05, 0.05, -0.2, LP + 0.05, 5.15));
    // the charge rack at the back of the stage: a timber shelf with bags waiting on it
    for (const x of [-1.22, -0.68]) PT.add('timber', box(0.06, 0.62, 0.06, x, LP + 0.31, Z1 - 0.05));
    PT.add('timber', box(0.62, 0.04, 0.26, -0.95, LP + 0.36, Z1 - 0.1));
    PT.add('timber', box(0.62, 0.04, 0.26, -0.95, LP + 0.62, Z1 - 0.1));
    for (const [x, y] of [[-1.08, 0.48], [-0.82, 0.48], [-0.95, 0.74]]) PT.add('cloth', xTube(x - 0.11, x + 0.11, 0.1, 0.1, 10, LP + y, Z1 - 0.1), { tint: 0xd9c9a0 });

    // (the tray and its carriage are built below, in their own pivot, so they can run back for the shot)
    // the crane's socket on the outrigger, braced down to the right girder
    PT.add('iron', yTube(LP, LP + 0.42, 0.16, 0.15, 16, CRANE.x, CRANE.z));
    PT.add('iron', yTube(LP - 0.02, LP + 0.04, 0.2, 0.2, 16, CRANE.x, CRANE.z));
    for (const z of [CRANE.z - 0.45, CRANE.z + 0.45]) PT.add('iron', rod(V(GX + 0.06, 0.3, z), V(CRANE.x - 0.12, LP - 0.06, CRANE.z), 0.04, 6));
  }

  // ------------------------------------------------------------------ cradle (elevation frame)
  {
    // the sleeve the barrel slides in, flanged at both ends, the cylinders over and under it on saddles
    PE.add('camo', frontProfile(rrect(1.44, 1.44, 0.42), -2.15, 0.3));
    for (const z of [-2.15, 0.2]) PE.add('camo', frontProfile(rrect(1.6, 1.6, 0.48), z, z + 0.1), { tint: 0xd8d8d0 });
    for (const s of [-1, 1]) {
      PE.add('dark', rivetRow(V(s * 0.725, 0.3, -1.95), V(s * 0.725, 0.3, 0.1), 0.18, V(s, 0, 0), 0.024));
      PE.add('dark', rivetRow(V(s * 0.725, -0.3, -1.95), V(s * 0.725, -0.3, 0.1), 0.18, V(s, 0, 0), 0.024));
    }
    for (const [x, y, r, z0, z1] of CYL) {
      PE.add('iron', zTube(z0, z1, r, r, 18, x, y));
      PE.add('iron', sphere(r, x, y, z0, 1, 1, 0.7, 14));
      PE.add('steel', zTube(z0 - r * 0.7 - 0.04, z0 - r * 0.6, 0.04, 0.04, 8, x, y));
      PE.add('steel', zTube(z1, z1 + 0.06, r * 1.08, r * 1.08, 18, x, y));
      for (const z of [z0 + 0.35, (z0 + z1) / 2]) PE.add('iron', zTube(z - 0.035, z + 0.035, r * 1.1, r * 1.1, 18, x, y));
      const cy = Math.sign(y) * 0.62;
      for (const z of [-1.7, -0.7]) PE.add('camo', box(0.16, Math.abs(y - cy), 0.2, x, (y + cy) / 2, z));
    }
    // the trunnion pins
    for (const s of [-1, 1]) PE.add('iron', xTube(s * 0.7, s * 0.9, 0.2, 0.2, 18, 0, 0));
    // the elevating arcs, toothed, behind and under the trunnions, turning with the cradle
    for (const s of [-1, 1]) {
      PE.add('dark', gearArc(1.35, 1.48, -0.25, 1.25, 0.08, 26, 0.04).translate(s * 0.72, 0, 0));
      PE.add('camo', rod(V(s * 0.72, -0.62, -0.3), V(s * 0.72, -1.25, 0.6), 0.05, 6));
      PE.add('camo', rod(V(s * 0.72, 0.1, 0.3), V(s * 0.72, -0.3, 1.32), 0.05, 6));
    }
    // the clinometer seat on the rear flange, right of the barrel (the quadrant anchor rests on it)
    PE.add('steel', box(0.34, 0.05, 0.24, 0.45, 0.6, 0.42));
    PE.add('camo', box(0.08, 0.15, 0.16, 0.45, 0.5, 0.38));
    PE.add('brass', box(0.2, 0.012, 0.14, -0.3, 0.725, -0.9));
  }

  // ------------------------------------------------------------------ barrel (recoil frame), wedge
  {
    // L/12: the muzzle swell, a straight chase, a hoop shoulder ahead of the cradle, the jacket, the breech ring
    const prof = [[MUZ, 0.212], [MUZ, 0.43], [MUZ + 0.04, 0.455], [MUZ + 0.21, 0.455], [MUZ + 0.27, 0.405], [MUZ + 0.45, 0.4], [-2.56, 0.425], [-2.5, 0.49], [-0.86, 0.52], [-0.8, 0.585], [0.6, 0.6], [0.6, 0.212]];
    PR.add('camo', mergeAll(prof.slice(1).map((p, i) => zBand(prof[i][0], prof[i][1], p[0], p[1], 36))), { tint: 0xc4c4c0 });
    for (const [z, r] of [[-2.5, 0.505], [-0.8, 0.6]]) PR.add('iron', zTube(z - 0.035, z + 0.035, r, r, 36));
    PR.add('dark', zBand(MUZ + 0.6, 0.21, MUZ + 0.005, 0.21, 24)); // the bore, facing in
    PR.add('dark', new THREE.CircleGeometry(0.21, 24).translate(0, 0, MUZ + 0.6));
    // the breech ring: square and deep, with jaws behind it the wedge slides in, lugs for the piston rods
    PR.add('camo', rbox(1.3, 1.22, 1.0, 0.07, 0, 0, 1.1), { tint: 0xc4c4c0 });
    PR.add('dark', new THREE.CircleGeometry(0.25, 24).translate(0, 0, BRE + 0.002));
    for (const s of [-1, 1]) PR.add('camo', box(1.3, 0.14, 0.42, 0, s * 0.54, BRE + 0.2), { tint: 0xc4c4c0 });
    PR.add('camo', box(0.06, 0.94, 0.42, -0.68, 0, BRE + 0.2), { tint: 0xc4c4c0 });
    for (const s of [-1, 1]) {
      PR.add('dark', rivetRow(V(-0.55, s * 0.615, 0.7), V(0.55, s * 0.615, 0.7), 0.18, V(0, s, 0), 0.028));
      PR.add('dark', rivetRow(V(-0.55, s * 0.615, BRE + 0.33), V(0.55, s * 0.615, BRE + 0.33), 0.18, V(0, s, 0), 0.024));
    }
    for (const [x, y] of CYL) PR.add('camo', rbox(0.24, 0.4, 0.2, 0.04, x, Math.sign(y) * 0.78, 0.74), { tint: 0xc4c4c0 });
    for (const [x, y, , z0, z1] of CYL) {
      PR.add('steel', zTube(z0 + (y > 0 ? 0.9 : 0.65), 0.74, 0.055, 0.055, 10, x, y)); // piston rods into the cylinders
      PR.add('iron', zTube(0.62, 0.68, 0.09, 0.09, 12, x, y)); // the rod nut on the lug
    }
    PR.add('brass', box(0.012, 0.2, 0.26, -0.656, 0.0, 0.95));
    // lifting lugs on the barrel
    for (const z of [-1.6, 0.2]) PR.add('iron', box(0.2, 0.12, 0.3, 0, z < 0 ? 0.53 : 0.63, z));
    // the wedge: a block sliding through the jaws, its crank on the right end, the firing lock at the back
    // (blackened steel; only the obturating face against the chamber is bright)
    PW.add('iron', rbox(1.24, 0.92, 0.36, 0.03, 0, 0, BRE + 0.18), { tint: 0xd4d4d0 });
    PW.add('steel', box(1.18, 0.02, 0.3, 0, 0.465, BRE + 0.18));
    PW.add('dark', box(0.05, 0.6, 0.3, 0.64, 0, BRE + 0.18));
    PW.add('dark', box(0.9, 0.06, 0.05, 0.05, 0.3, BRE + 0.37));
    PW.add('dark', rbox(0.16, 0.2, 0.1, 0.02, 0, -0.07, BRE + 0.4));
    PW.add('brass', zTube(BRE + 0.36, BRE + 0.44, 0.05, 0.05, 10, 0, 0));
    PW.add('dark', new THREE.TorusGeometry(0.05, 0.012, 6, 12).translate(0, -0.07, BRE + 0.46));
  }

  // ------------------------------------------------------------------ crane: a gooseneck on its socket
  {
    const top = CRANE.h - 0.1, bend = 0.5;
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(V(0, 0.1, 0), V(0, top - bend, 0)));
    path.add(new THREE.QuadraticBezierCurve3(V(0, top - bend, 0), V(0, top, 0), V(-bend, top, 0)));
    path.add(new THREE.LineCurve3(V(-bend, top, 0), V(-CRANE.jib - 0.1, top, 0)));
    PC.add('camo', new THREE.TubeGeometry(path, 56, 0.095, 12, false));
    PC.add('camo', sphere(0.095, -CRANE.jib - 0.1, top, 0, 1, 1, 1, 10));
    PC.add('iron', yTube(0.42, 0.56, 0.14, 0.14, 16, 0, 0)); // the collar over the socket
    PC.add('iron', rod(V(0, 2.3, 0), V(-1.25, top - 0.06, 0), 0.03, 6)); // the stay
    // the sheave at the head between its cheeks
    PC.add('steel', zTube(-0.03, 0.03, 0.12, 0.12, 16, -CRANE.jib, top - 0.08));
    for (const s of [-1, 1]) PC.add('iron', box(0.3, 0.26, 0.02, -CRANE.jib, top - 0.06, s * 0.05));
    // the winch on the post: side frames, the drum with its rope, the rope up the post and along the jib
    for (const s of [-1, 1]) PC.add('iron', box(0.3, 0.36, 0.03, 0.06, 1.15, s * 0.13));
    PC.add('iron', zTube(-0.11, 0.11, 0.08, 0.08, 14, 0.06, 1.15));
    PC.add('rope', zTube(-0.09, 0.09, 0.095, 0.095, 14, 0.06, 1.15));
    PC.add('rope', rod(V(0.12, 1.2, 0.0), V(0.12, top - bend, 0.0), 0.012, 5));
    PC.add('rope', rod(V(0.12, top - bend, 0.0), V(-bend, top + 0.12, 0.0), 0.012, 5));
    PC.add('rope', rod(V(-bend, top + 0.12, 0.0), V(-CRANE.jib + 0.08, top + 0.04, 0.0), 0.012, 5));
    // the block: cheeks, a sheave, the hook
    for (const s of [-1, 1]) PH.add('dark', box(0.2, 0.24, 0.025, 0, 0, s * 0.05));
    PH.add('steel', zTube(-0.04, 0.04, 0.08, 0.08, 12, 0, 0.02));
    PH.add('dark', yTube(-0.2, -0.1, 0.03, 0.03, 8, 0, 0));
    PH.add('steel', new THREE.TorusGeometry(0.07, 0.02, 6, 14, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.27, 0));
    // the shell sling on the hook: a ring, two short chains to a spreader bar along the carriage (the block
    // is kept square to the carriage by the men's hands, setCrane), the straps hang from its ends (props)
    PH.add('steel', new THREE.TorusGeometry(0.055, 0.014, 6, 12).translate(0, -0.37, 0));
    for (const s of [-1, 1]) PH.add('chain', rod(V(0, -0.41, 0), V(0, -0.6, s * 0.4), 0.016, 5));
    PH.add('dark', box(0.08, 0.07, 0.92, 0, -0.62, 0));
    for (const s of [-1, 1]) PH.add('iron', box(0.1, 0.05, 0.05, 0, -0.66, s * 0.4));
  }

  // ------------------------------------------------------------------ the tray on its carriage (runs back along +Z)
  {
    // a thick trough with rolled lips, banded, lined up with the bore at the loading elevation, on saddles over
    // a small carriage whose four rollers run on the rails either side of the deck opening
    const T = [], L = TRAY.z1 - TRAY.z0, e = GUN.loadEl;
    T.push(zBand(TRAY.z0, 0.29, TRAY.z1, 0.29, 20, -Math.PI / 2, Math.PI), zBand(TRAY.z1, 0.26, TRAY.z0, 0.26, 20, -Math.PI / 2, Math.PI));
    T.push(zBand(TRAY.z0, 0.26, TRAY.z0, 0.29, 20, -Math.PI / 2, Math.PI), zBand(TRAY.z1, 0.29, TRAY.z1, 0.26, 20, -Math.PI / 2, Math.PI));
    for (const s of [-1, 1]) T.push(zTube(TRAY.z0, TRAY.z1, 0.025, 0.025, 6, s * 0.275, 0));
    const m = new THREE.Matrix4().makeRotationX(e).premultiply(new THREE.Matrix4().makeTranslation(0, TR, 0));
    PY.add('steel', mergeAll(T).applyMatrix4(m));
    // the carriage's two axles; the rear one 0.3 m short of the trough's end, so that run back TRAY_BACK its rollers
    // come to rest against the rail stops and its cross beam stays clear of the charge rack's post
    const AX = [TRAY.z0 + 0.2, TRAY.z1 - 0.3];
    const B = [];
    for (const z of [AX[0], TRAY.z0 + L / 2, AX[1]]) B.push(zBand(z - 0.04, 0.3, z + 0.04, 0.3, 16, -Math.PI / 2, Math.PI));
    for (const z of AX) B.push(box(0.5, 0.2, 0.08, 0, -0.38, z));
    B.push(box(0.08, 0.12, L - 0.3, 0, -0.32, TRAY.z0 + L / 2));
    PY.add('iron', mergeAll(B).applyMatrix4(m));
    // the carriage rides low (its frame under 10 cm high, so the men can stand beside its run; only the posts
    // under the trough rise to the saddles): an axle beam between each pair of rollers, two side members under the
    // trough's edges (where the loaders standing beside the tray keep their feet clear of them)
    const yAt = (z) => TR - 0.48 * Math.cos(e) - z * Math.sin(e), yc = LP + 0.06;
    for (const z of AX) {
      PY.add('iron', box(2 * RAILX - 0.14, 0.07, 0.12, 0, yc, z));
      for (const s of [-1, 1]) {
        PY.add('steel', xTube(s * RAILX - 0.03, s * RAILX + 0.03, 0.038, 0.038, 14, LP + 0.06, z));
        for (const d of [-0.05, 0.05]) PY.add('iron', box(0.02, 0.05, 0.12, s * RAILX + d, LP + 0.07, z)); // (clear of the edging's rivets)
        const top = yAt(z), h = Math.max(0.02, top - (yc + 0.035));
        PY.add('iron', box(0.08, h, 0.08, s * 0.2, yc + 0.035 + h / 2, z));
      }
    }
    for (const s of [-1, 1]) PY.add('iron', box(0.06, 0.06, AX[1] - AX[0] - 0.12, s * 0.45, yc, (AX[0] + AX[1]) / 2));
  }

  // ------------------------------------------------------------------ the layers' footboards
  // a riveted plate on legs beside each handwheel, so the layer stands with the dial and the sight at eye height
  // and the wheel at his waist (crew.js BOARDS, the same rectangles)
  for (const [x0, x1, z0, z1] of [[-2.05, -1.25, 1.02, 1.95], [1.25, 2.05, 0.95, 1.9]]) {
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, s = Math.sign(xm), xo = s > 0 ? x1 : x0, xi = s > 0 ? x0 : x1;
    PT.add('iron', box(x1 - x0, 0.035, z1 - z0, xm, 0.282, zm));
    PT.add('dark', rivetRow(V(x0 + 0.05, 0.302, z0 + 0.05), V(x1 - 0.05, 0.302, z0 + 0.05), 0.16, Y, 0.014));
    PT.add('dark', rivetRow(V(x0 + 0.05, 0.302, z1 - 0.05), V(x1 - 0.05, 0.302, z1 - 0.05), 0.16, Y, 0.014));
    for (const z of [z0 + 0.06, z1 - 0.06]) {
      PT.add('iron', box(0.05, 0.27, 0.05, xo - s * 0.04, 0.135, z));
      PT.add('iron', rod(V(xi + s * 0.03, 0.27, z), V(s * 0.95, 0.62, z), 0.025, 5));
    }
  }

  // ------------------------------------------------------------------ dials over the line and elevation handwheels
  // On a pillar above each handwheel's gearbox, a graduated disc turned by the gearing under a fixed index:
  // the elevation in degrees on the right, the carriage's swing from the base line in mils (L / R) on the left.
  const dials = {};
  {
    for (const [s, z, x] of [[1, HW.elev, 1.06], [-1, HW.trav + 0.2, -1.06]]) {
      const y = 1.88;
      PT.add('iron', rod(V(s * 1.0, 1.4, z - (s < 0 ? 0.2 : 0)), V(s * 1.0, y - 0.14, z), 0.025, 6));
      PT.add('dark', xTube(Math.min(s * 1.0, x - s * 0.012), Math.max(s * 1.0, x - s * 0.012), 0.145, 0.145, 24, y, z));
      PT.add('brass', xTube(Math.min(x - s * 0.012, x + s * 0.012), Math.max(x - s * 0.012, x + s * 0.012), 0.152, 0.152, 28, y, z, true));
      PT.add('red', box(0.012, 0.035, 0.02, x + s * 0.008, y + 0.142, z, Math.PI / 4));
    }
    if (typeof document !== 'undefined') {
      const make = (name, s, z, x, draw) => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        draw(c.getContext('2d'));
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const mount = pivot(trav, 'dial-' + name, x, 1.88, z);
        mount.rotation.y = s * Math.PI / 2;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.135, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.15 }));
        disc.name = 'dial-' + name;
        mount.add(disc);
        dials[name] = disc;
      };
      // ticks clockwise from the top for increasing values (the disc then turns by +value * k to bring it to the index)
      const face = (g, list, unit) => {
        g.fillStyle = '#e4d9b8';
        g.beginPath();
        g.arc(128, 128, 127, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = g.fillStyle = '#17140e';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const [a, len, label] of list) {
          const ca = Math.cos(a - Math.PI / 2), sa = Math.sin(a - Math.PI / 2);
          g.lineWidth = len > 20 ? 3 : 2;
          g.beginPath();
          g.moveTo(128 + ca * 124, 128 + sa * 124);
          g.lineTo(128 + ca * (124 - len), 128 + sa * (124 - len));
          g.stroke();
          if (label) {
            g.font = 'bold 21px monospace';
            g.save();
            g.translate(128 + ca * 80, 128 + sa * 80);
            g.rotate(a);
            g.fillText(label, 0, 0);
            g.restore();
          }
        }
        g.font = 'bold 17px serif';
        g.fillText(unit, 128, 150);
        g.beginPath();
        g.arc(128, 128, 9, 0, Math.PI * 2);
        g.fill();
      };
      make('elev', 1, HW.elev, 1.06, (g) => {
        const list = [];
        for (let v = 0; v <= 70; v++) list.push([v * 4 * DEG, v % 10 ? (v % 5 ? 10 : 16) : 26, v % 10 ? null : String(v)]);
        face(g, list, 'Grad');
      });
      make('trav', -1, HW.trav + 0.2, -1.06, (g) => {
        const list = [];
        for (let v = -200; v <= 200; v += 10) list.push([v * 0.65 * DEG, v % 50 ? 10 : v % 100 ? 17 : 26, v % 100 ? null : v ? `${v > 0 ? 'L' : 'R'}${Math.abs(v)}` : '0']);
        face(g, list, 'Strich');
      });
    }
  }

  PB.build(root, { y0: 0 });
  PT.build(trav, { y0: BED });
  PE.build(elev, { y0: BED + TR });
  PR.build(rec, { y0: BED + TR });
  PW.build(wedge, { y0: BED + TR });
  PC.build(crane, { y0: BED + LP });
  PH.build(hook, { y0: BED + LP });
  PY.build(trayP, { y0: BED });
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
  // the wedge's crank is put on its shaft to work the block and taken off before the shot (it would foul the
  // stage beside the deck opening as the breech recoils through it): the page shows it while the block moves
  {
    const P = mk();
    P.add('dark', xTube(-0.24, 0, 0.035, 0.035, 8));
    P.build(wheels.wedge.node, { y0: BED + TR });
  }
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
    // slung level under the spreader bar in two strap loops, HANG below the block
    props.hook[k] = propFrom(shells[k]);
    props.hook[k].position.y = -HANG;
    const S = mk();
    for (const s of [-1, 1]) {
      S.add('rope', new THREE.TorusGeometry(0.222, 0.016, 5, 22).translate(0, 0, s * 0.4));
      S.add('rope', box(0.035, HANG - 0.66 - 0.2, 0.05, 0, (HANG - 0.66 + 0.2) / 2 + 0.01, s * 0.4));
    }
    S.build(props.hook[k], { y0: BED + LP });
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
  // the loader's station: at the back edge of the stage, over the tray's run, looking along the bore
  anchor(trav, 'eye-load', -0.45, LP + 0.36 + 1.66, 5.3, -0.08);

  // the shell's centre lying on the tray (elevation frame (0, -0.05, middle of the tray) at the loading elevation)
  const TZ = (TRAY.z0 + TRAY.z1) / 2, onTrayY = TR - 0.05 * Math.cos(GUN.loadEl) - TZ * Math.sin(GUN.loadEl);
  const rig = {
    root, pivots: { traverse: trav, elevation: elev, recoil: rec, wedge, crane, hook, tray: trayP }, anchors, props, fall, wheels, dials, mats,
    trayZ: TRAY, trayBack: TRAY_BACK, craneSpec: CRANE, bed: BED, loadStage: LP, sightZ: SIGHT_Z, hang: HANG,
    setTraverse: (r) => (trav.rotation.y = r),
    setElevation: (r) => (elev.rotation.x = r),
    // k 0..1 of the recoil stroke; the stroke itself shortens with elevation (recoilLength)
    setRecoil: (k) => (rec.position.z = k * recoilLength(elev.rotation.x)),
    setWedge: (k) => (wedge.position.x = k * 1.15),
    // the tray: 0 forward against the breech (loading), 1 run back clear of the recoil
    setTray: (k) => (trayP.position.z = k * TRAY_BACK),
    // the dials over the handwheels: elevation (rad) in degrees, the carriage's swing (rad, + left) in mils
    setDials(el, tr) {
      if (dials.elev) dials.elev.rotation.z = el * 4;
      if (dials.trav) dials.trav.rotation.z = (tr * 6400 * 0.65) / 360;
    },
    // swing 0 over the shell cart (to the right), 1 over the tray; drop 0 up at the jib, 1 down at the cart or
    // tray (the slung shell then lies where the cart or the tray holds it). The block keeps square to the carriage.
    setCrane(swing, drop) {
      crane.rotation.y = Math.PI * (1 - swing);
      hook.rotation.y = -crane.rotation.y;
      const top = CRANE.h - 0.3, low = (swing > 0.5 ? onTrayY : CART_TOP) + HANG - LP;
      hook.position.y = top + (low - top) * drop;
      fall.position.set(-CRANE.jib, CRANE.h - 0.1, 0);
      fall.scale.y = Math.max(0.05, CRANE.h - 0.1 - hook.position.y);
    },
  };
  rig.setDials(0, 0);
  rig.setCrane(1, 0);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return rig;
}

// plank tints for the stage deck: a little variation, no pattern
function tints2(i) {
  return [0xffffff, 0xe8e0d2, 0xf4ecdf, 0xdcd4c6][(i * 7 + 3) % 4];
}

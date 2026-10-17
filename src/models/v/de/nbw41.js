import * as THREE from 'three';
import { V, box, xTube, yTube, zTube, rod, sideProfile } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addHandwheel, crew, L90, R90 } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { discWheel, panoramicSight } from './common.js';

/**
 * 15 cm Nebelwerfer 41: six 1.3 m launching tubes in a hexagonal cluster held by three frames, on the light
 * two-wheeled split-trail carriage of the 3.7 cm PaK 36 (pneumatic tyres, tubular trail legs), the front support
 * leg let down in firing position. 540 kg, about 1.4 m high. Elevation -5 to +45 degrees, traverse 30. The
 * rockets (Wurfgranate 41) go in from the rear of the tubes and are fired electrically, one by one in a ripple,
 * by the crew from cover 10 to 15 m away (the firing cable runs to the Glühzündgerät in their slit trench).
 *
 * Rig (DESIGN.md "WW2 mode"): origin on the ground under the axle centre, front -Z. `traverse` the cradle yoke on
 * the axle, `elevation` the tube cluster, `recoil` and `breech` are empty (no recoil, no breech: setBreech is a
 * no-op). Extras: rig.setRounds(n) shows n rockets in the tubes (0..6; the last n of the firing order, so the
 * ripple empties them in order and the loading fills them in reverse), rig.anchors.muzzles[0..5] the tube mouths
 * in firing order, rig.anchors.tubes[0..5] the tubes' rear openings (same order), rig.anchors.cover [{ x, z }]
 * the crew's places in the slit trench (root space), rig.fireOrder (tube index per shot), rig.loadOrder.
 * Crew roles: firer (in cover, at the firing box), layer, loader, rocket0, rocket1. buildNbW41({ scheme })
 */
const TRY = 0.66, TRZ = 0.1; // trunnions (root)
const CY = 0.27, TZ0 = -0.78, TZ1 = 0.52; // cluster axis above the trunnions, tube ends (elevation frame)
const RC = 0.2, RT = 0.09; // cluster radius (tube centres), tube outer radius
const FIRE = [0, 3, 1, 4, 2, 5]; // the ripple's order (tubes numbered round the hexagon from the top)
const COVER = { x: -12.4, z: 2.4 };

export function buildNbW41({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---- axle, wheels, trail legs, front leg (the carriage does not traverse: the cradle yoke does)
  const L = rig.part();
  const WR = 0.37, WX = 0.68;
  for (const s of [-1, 1]) discWheel(L, s * WX, WR, { R: WR, tw: 0.14, holes: 0, side: s, hub: 0.08, rubber: 0.11, dish: 0.02 });
  L.add('dark', xTube(-WX + 0.06, WX - 0.06, 0.035, 0.035, 10, WR, 0));
  L.add('camo', box(0.36, 0.14, 0.3, 0, WR + 0.02, 0.05)); // axle block, the yoke's pivot
  const SP = 22 * Math.PI / 180, TL = 1.75;
  for (const s of [-1, 1]) {
    const a = V(s * 0.13, WR, 0.15), b = V(s * (0.13 + TL * Math.sin(SP)), 0.1, 0.15 + TL * Math.cos(SP));
    L.add('camo', rod(a, b, 0.045, 10));
    L.add('camo', box(0.24, 0.2, 0.03, b.x, 0.06, b.z + 0.04, -0.3, s * SP, 0)); // small spade
    L.add('steel', rod(b.clone().add(V(-0.08 * s, 0.05, -0.15)), b.clone().add(V(0.1 * s, 0.12, -0.25)), 0.012, 5)); // handle
  }
  // the front support leg, let down to the ground in front of the axle
  L.add('camo', rod(V(0, WR + 0.02, -0.12), V(0, 0.05, -0.72), 0.035, 8));
  L.add('camo', box(0.22, 0.03, 0.2, 0, 0.02, -0.74));
  L.add('dark', rod(V(-0.15, WR, -0.05), V(0, 0.2, -0.5), 0.016, 6));
  L.add('dark', rod(V(0.15, WR, -0.05), V(0, 0.2, -0.5), 0.016, 6));
  // the firing cable from the launcher's junction box along the ground to the crew's slit trench
  const cab = [V(-0.2, 0.42, 0.55), V(-0.6, 0.03, 0.9), V(-3, 0.02, 1.6), V(-6, 0.02, 1.3), V(-9, 0.02, 2.2), V(COVER.x + 0.9, 0.02, COVER.z - 0.6)];
  for (let i = 0; i < cab.length - 1; i++) L.add('rubber', rod(cab[i], cab[i + 1], 0.008, 4));
  L.build(root, { dirt: 0.55 });

  // ---- the crew's cover: a slit trench with a low sandbag parapet toward the launcher, the firing box
  const W = rig.part();
  const px = COVER.x + 0.65;
  for (let i = 0; i < 9; i++) {
    const z = COVER.z - 1.9 + i * 0.5;
    W.add('sandbag', box(0.42, 0.18, 0.5, px, 0.09, z, 0, 0, 0.04 * (i % 2 ? 1 : -1)));
    if (i % 2 === 0) W.add('sandbag', box(0.4, 0.16, 0.5, px, 0.26, z + 0.25, 0, 0, 0));
  }
  W.add('soil', box(0.9, 0.06, 4.6, COVER.x + 1.3, 0.02, COVER.z, 0, 0, 0.08)); // spoil, thrown up toward the launcher
  W.add('dark', box(0.22, 0.14, 0.12, px - 0.3, 0.07, COVER.z - 0.55)); // the Glühzündgerät firing box
  W.add('steel', box(0.04, 0.03, 0.04, px - 0.3, 0.155, COVER.z - 0.55));
  W.build(root, { dirt: 0.2 });

  // ---- yoke (traverse) on the axle: two side brackets up to the trunnions, the traversing handwheel
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  const br = [[-0.18, WR + 0.08], [-0.02, TRY + 0.1], [0.24, TRY + 0.1], [0.32, WR + 0.08]];
  for (const s of [-1, 1]) T.add('camo', sideProfile(br, 0.025).applyMatrix4(new THREE.Matrix4().makeTranslation(s * (RC + RT + 0.1), 0, 0)));
  T.add('camo', box(2 * (RC + RT + 0.1), 0.05, 0.5, 0, WR + 0.1, 0.07));
  for (const s of [-1, 1]) T.add('steel', xTube(s * (RC + RT + 0.08), s * (RC + RT + 0.15), 0.04, 0.04, 10, TRY, TRZ));
  addHandwheel(T, -(RC + RT + 0.14), WR + 0.22, 0.22, 0.08, -1);
  T.build(trav, { dirt: 0.5 });

  // ---- the tube cluster (elevation)
  const el = pivotAt(rig, trav, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  const tubes = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, x = Math.sin(a) * RC, y = CY + Math.cos(a) * RC;
    tubes.push({ x, y });
    E.add('camo', zTube(TZ0, TZ1, RT, RT, 18, x, y, true));
    E.add('dark', zTube(TZ0 + 0.005, TZ1 - 0.005, RT - 0.012, RT - 0.012, 18, x, y, true).scale(1, 1, 1)); // the bore's inside
    E.add('camo', zTube(TZ1 - 0.05, TZ1, RT + 0.012, RT + 0.012, 18, x, y, true)); // rear collar
    E.add('char', new THREE.RingGeometry(RT - 0.012, RT + 0.012, 18).rotateY(Math.PI).translate(x, y, TZ1));
    E.add('char', new THREE.RingGeometry(RT - 0.012, RT, 18).translate(x, y, TZ0));
    E.add('char', new THREE.CircleGeometry(RT - 0.012, 16).translate(x, y, (TZ0 + TZ1) / 2)); // the tube's depth reads dark
    E.add('char', new THREE.CircleGeometry(RT - 0.012, 16).rotateY(Math.PI).translate(x, y, (TZ0 + TZ1) / 2));
    // the latch and the igniter contact clip at the rear of each tube
    E.add('steel', box(0.03, 0.05, 0.07, x * 1.55, CY + (y - CY) * 1.55, TZ1 - 0.04));
  }
  // three hexagonal frames round the cluster, the central spine, the cradle under it on the trunnions
  for (const z of [TZ0 + 0.08, (TZ0 + TZ1) / 2, TZ1 - 0.12]) {
    for (let i = 0; i < 6; i++) {
      const a = ((i + 0.5) / 6) * Math.PI * 2, R = (RC + RT) * 0.93;
      E.add('camo', box(R * 1.1, 0.03, 0.07, Math.sin(a) * R, CY + Math.cos(a) * R, z, 0, 0, -a));
    }
  }
  E.add('dark', zTube(TZ0 + 0.05, TZ1 - 0.02, 0.05, 0.05, 10, 0, CY));
  E.add('camo', box(0.5, 0.06, 0.6, 0, CY - RC - RT - 0.02, 0.0));
  for (const s of [-1, 1]) E.add('camo', box(0.03, 0.22, 0.4, s * (RC + RT + 0.06), 0.02, 0.0));
  E.add('dark', box(0.12, 0.08, 0.08, -0.18, CY - 0.35, 0.45)); // junction box for the leads
  E.add('steel', rod(V(-(RC + RT + 0.06), 0.1, 0.1), V(-(RC + RT + 0.18), 0.22, 0.12), 0.012, 5));
  panoramicSight(E, -(RC + RT + 0.18), 0.22, 0.12, -1);
  E.build(el, { dirt: 0.25, y0: TRY });

  // ---- rockets in the tubes (setRounds), the empty recoil and breech pivots of the contract
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  pivotAt(rig, rc, 'breech', 0, CY, TZ1);
  const rk = buildShell('nbw41', 12), rocketLen = rk.length;
  const rockets = tubes.map((t) => {
    const g = new THREE.Group();
    for (const p of rk.parts) g.add(new THREE.Mesh(p.geometry, p.material));
    g.position.set(t.x, t.y, TZ1 - rocketLen / 2 - 0.03); // the base just inside the rear of the tube
    g.name = 'shell-rocket';
    g.visible = false;
    rc.add(g);
    return g;
  });
  rig.fireOrder = FIRE.slice();
  rig.loadOrder = FIRE.slice().reverse();
  rig.rounds = 0;
  rig.setRounds = (n) => {
    n = Math.max(0, Math.min(6, n | 0));
    if (n === rig.rounds) return;
    rig.rounds = n;
    for (let j = 0; j < 6; j++) rockets[FIRE[j]].visible = j >= 6 - n;
  };
  rig.setRounds(6);
  rig.setBreech = () => {};
  rig.setShell = () => {};
  rig.recoilLength = 0;

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 1.2, 0.6);
  rig.anchors.muzzle = node(el, 'muzzle', 0, CY, TZ0);
  rig.anchors.breech = node(el, 'breech', 0, CY, TZ1 + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, CY, TZ1 + rocketLen / 2 + 0.05);
  rig.anchors.shellStack = node(root, 'shellStack', 2.5, 0.12, 2.8);
  const muzzles = FIRE.map((i) => node(el, 'muzzle' + i, tubes[i].x, tubes[i].y, TZ0));
  rig.anchors.tubes = FIRE.map((i) => node(el, 'tube' + i, tubes[i].x, tubes[i].y, TZ1));
  rig.anchors.cover = [0, 1, 2, 3, 4].map((i) => ({ x: COVER.x - 0.1 * (i % 2), z: COVER.z - 1.4 + i * 0.75 }));
  rig.loadEl = 10 * Math.PI / 180;

  // the rocket crates by the stack: wooden boxes, a few rockets lying ready
  const S = rig.part();
  for (let i = 0; i < 4; i++) S.add('wood', box(0.3, 0.26, 1.1, 2.5 + (i % 2) * 0.34, 0.13 + Math.floor(i / 2) * 0.27, 3.1, 0, 0.05 * i, 0));
  S.build(root, { dirt: 0.4 });

  crew(rig, 'firer', COVER.x, COVER.z - 0.55, L90, 'crouch');
  crew(rig, 'layer', -0.75, 0.45, L90, 'lay');
  crew(rig, 'loader', -0.3, 1.9, 0, 'stand');
  crew(rig, 'rocket0', 1.3, 1.9, R90, 'stand');
  crew(rig, 'rocket1', 1.9, 2.4, R90, 'stand');

  hb(rig, -0.85, 0, -0.9, 0.85, 1.2, 0.7);
  hb(rig, -0.9, 0, 0.7, 0.9, 0.35, 1.9);
  const out = finishRig(rig, 'nbw41', 'nbw41');
  out.anchors.muzzles = muzzles;
  return out;
}

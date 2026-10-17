import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, loft, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addHandwheel, trayShells, crew, L90, R90, ring } from '../../t/fieldkit.js';
import { floorFade } from '../../rig.js';
import { buildShell } from '../../shells.js';
import { discWheel, panoramicSight, slidingBlock, barrel, makeStrut, setStrut } from './common.js';

/**
 * The Mörserlafette (Krupp, 1939) in firing order, carrying either barrel:
 *   buildK18()   17 cm Kanone 18: the long L/50 barrel (8.53 m), 17.5 t in action, -0 to +50 degrees
 *   buildMrs18() 21 cm Mörser 18: the short thick L/31 barrel (6.51 m), 16.7 t, 0 to +70 degrees
 * The carriage stands on its circular firing platform (Bettung) lowered under the front, the long box trail
 * runs back to the rear support (a jack on two small wheels that rolls round the platform for all-round
 * traverse); the transport bogies and the barrel wagon are off. Dual recoil (Doppelrücklauf): the barrel runs
 * back in its cradle and the whole top carriage slides back on the rails of the lower carriage, so the gun
 * hardly jumps. Loaded at zero elevation from the loading platforms either side of the breech (1.35 m up).
 *
 * Rig (DESIGN.md "Models", "WW2 mode"): origin on the ground at the platform's centre, front -Z. `traverse` the
 * lower carriage and trail (it turns on the platform's pivot), `carriage` the top carriage slide (position.z, +
 * back), `elevation` at the trunnions, `recoil` the barrel, `breech` the sliding block (+X). setRecoil(k) drives
 * both slides (rig.recoilLength the barrel's, rig.carriageRecoil the top carriage's). The equilibrators follow
 * the elevation. buildK18({ scheme }) / buildMrs18({ scheme }) with scheme 'dgelb' | 'feldgrau'.
 */
const K18 = {
  kind: 'k18', MZ: -6.15, BR: 2.38, RING: 0.56, ringW: 0.52,
  prof: [[0, 0.135], [0.12, 0.142], [0.12, 0.134], [3.0, 0.16], [4.4, 0.175], [4.4, 0.2], [6.9, 0.225], [7.0, 0.23]],
  recoil: 1.25, slide: 0.8,
};
const MRS18 = {
  kind: 'mrs18', MZ: -4.55, BR: 1.96, RING: 0.58, ringW: 0.6,
  prof: [[0, 0.17], [0.16, 0.18], [0.16, 0.172], [1.9, 0.2], [2.7, 0.215], [2.7, 0.25], [5.3, 0.275], [5.4, 0.28]],
  recoil: 1.1, slide: 0.8,
};
const TRY = 2.6, TRZ = 0.3; // trunnion axis (root, at zero slide)
const DECK = 1.35; // the loading platforms' floor

export const buildK18 = (o = {}) => build(K18, o);
export const buildMrs18 = (o = {}) => build(MRS18, o);

function build(G, { scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---- the firing platform (Bettung): a ring of steel segments with radial ribs and a centre pivot, bedded flush
  const F = rig.part();
  F.add('dark', yTube(0, 0.16, 1.7, 1.75, 40));
  F.add('steel', ring(1.62, 1.7, 0.16, 0.19, 40).rotateZ(Math.PI / 2)); // the racer ring on top
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    F.add('dark', box(0.08, 0.06, 1.5, Math.sin(a) * 0.9, 0.19, Math.cos(a) * 0.9, 0, a, 0));
  }
  F.add('steel', yTube(0.16, 0.3, 0.42, 0.42, 24));
  F.build(root, { dirt: 0.8 });

  // ---- lower carriage and trail (traverse)
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  T.add('camo', yTube(0.3, 0.5, 0.75, 0.68, 24)); // the pivot drum on the platform
  // two side girders from the front of the platform back to the rear support, joined by transoms
  const gir = (s) => {
    const st = [[-1.7, 0.42, 0.88], [1.2, 0.36, 0.96], [3.4, 0.36, 0.92], [5.6, 0.38, 0.74], [7.7, 0.34, 0.56]]; // z, y bottom, y top
    const xIn = (z) => (z < 3.4 ? 0.48 : 0.48 - (z - 3.4) * 0.05), w = 0.2;
    return loftRings(st.map(([z, y0, y1]) => { const xi = s * xIn(z), xo = s * (xIn(z) + w); return [V(xi, y0, z), V(xo, y0, z), V(xo, y1, z), V(xi, y1, z)]; }));
  };
  for (const s of [-1, 1]) {
    T.add('camo', gir(s));
    T.add('steel', box(0.12, 0.04, 3.6, s * 0.54, 0.97, 0.3)); // the top carriage's slide rails
  }
  for (const z of [-1.6, 3.6, 5.4, 7.5]) T.add('camo', box(0.9 - Math.max(0, z - 3.4) * 0.1, 0.4, 0.14, 0, 0.62, z));
  T.add('camo', box(0.96, 0.08, 1.2, 0, 0.45, 6.6)); // the trail's floor behind the breech's swing
  // the rear support: a screw jack on a two-wheeled truck that rolls round the platform
  T.add('dark', yTube(0.32, 0.62, 0.09, 0.09, 12, 0, 7.6));
  T.add('steel', yTube(0.62, 0.95, 0.04, 0.04, 8, 0, 7.6));
  T.add('dark', xTube(-0.14, 0.14, 0.03, 0.03, 8, 0.97, 7.6)); // jack handle
  T.add('camo', box(0.7, 0.12, 0.4, 0, 0.3, 7.6));
  for (const s of [-1, 1]) discWheel(T, s * 0.42, 0.27, { R: 0.27, tw: 0.12, holes: 0, side: s, z: 7.75, hub: 0.07, rubber: 0.05, dish: 0.01 });
  T.add('dark', xTube(-0.42, 0.42, 0.035, 0.035, 8, 0.27, 7.75));
  // loading platforms: steel decks either side of the breech and behind it, with steps down
  for (const s of [-1, 1]) {
    T.add('camo', box(1.15, 0.06, 3.4, s * 1.28, DECK - 0.03, 3.4));
    T.add('dark', box(1.15, 0.12, 0.04, s * 1.28, DECK - 0.1, 1.7));
    for (const z of [2.2, 4.6]) T.add('dark', rod(V(s * 0.72, 0.9, z), V(s * 1.6, DECK - 0.06, z), 0.03, 6)); // brackets
    for (let k = 1; k <= 3; k++) T.add('camo', box(0.5, 0.03, 0.25, s * 1.6, DECK - 0.34 * k, 5.2 + 0.24 * k)); // steps at the rear corner
    T.add('dark', rod(V(s * 1.36, 0.0, 6.0), V(s * 1.36, DECK, 5.15), 0.02, 5));
    T.add('dark', rod(V(s * 1.84, 0.0, 6.0), V(s * 1.84, DECK, 5.15), 0.02, 5));
    // handrail along the outer edge
    for (const z of [1.8, 3.4, 5.0]) T.add('steel', yTube(DECK, DECK + 0.9, 0.018, 0.018, 6, s * 1.84, z));
    T.add('steel', zTube(1.8, 5.0, 0.018, 0.018, 6, s * 1.84, DECK + 0.9));
  }
  T.add('camo', box(0.96, 0.06, 2.2, 0, DECK - 0.03, 4.1)); // the deck behind the breech, over the trail
  T.build(trav, { dirt: 0.5 });

  // ---- top carriage (slides back on the rails at the shot)
  const car = pivotAt(rig, trav, 'carriage', 0, 0, 0);
  const C = rig.part();
  const cheek = [[-1.3, 1.0], [-1.0, 1.6], [-0.3, TRY + 0.22], [0.8, TRY + 0.22], [1.3, 1.7], [1.5, 1.0]];
  for (const s of [-1, 1]) C.add('camo', sideProfile(cheek, 0.06).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.5, 0, TRZ)));
  for (const s of [-1, 1]) C.add('dark', box(0.16, 0.1, 2.8, s * 0.54, 1.04, TRZ + 0.1)); // slide shoes on the rails
  C.add('camo', box(1.06, 0.12, 0.6, 0, 1.06, TRZ - 1.0)); // front transom
  C.add('camo', box(1.06, 0.4, 0.1, 0, 1.3, TRZ - 1.25));
  for (const s of [-1, 1]) {
    C.add('steel', xTube(s * 0.45, s * 0.6, 0.12, 0.12, 14, TRY, TRZ)); // trunnion bearings
    C.add('dark', xTube(s * 0.36, s * 0.56, 0.06, 0.06, 10, 1.2, TRZ - 1.2)); // equilibrator lower pivots
    // recoil cylinders of the top carriage's slide, along the girders
    C.add('camo', zTube(TRZ - 1.2, TRZ + 1.4, 0.09, 0.09, 12, s * 0.36, 1.2));
  }
  // the layer's platform on the left, the elevating handwheels either side
  C.add('camo', box(0.7, 0.05, 0.9, -1.0, 0.92, TRZ + 0.4));
  C.add('dark', rod(V(-0.53, 0.92, TRZ + 0.05), V(-1.3, 0.92, TRZ + 0.05), 0.025, 6));
  addHandwheel(C, -0.62, 1.55, TRZ + 0.6, 0.18, -1);
  addHandwheel(C, -0.62, 1.25, TRZ - 0.1, 0.15, -1);
  addHandwheel(C, 0.62, 1.55, TRZ + 0.6, 0.18, 1);
  C.add('camo', box(0.7, 0.05, 0.9, 1.0, 0.92, TRZ + 0.4));
  C.build(car, { dirt: 0.4 });

  // ---- cradle
  const el = pivotAt(rig, car, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  const c0 = G.MZ * 0.55, c1 = G.BR - G.RING - 0.15; // cradle from about the barrel's middle to the ring
  E.add('camo', rbox(0.62, 0.3, c1 - c0, 0.05, 0, -0.34, (c0 + c1) / 2));
  for (const s of [-1, 1]) {
    E.add('camo', box(0.06, 0.26, c1 - c0, s * 0.3, -0.12, (c0 + c1) / 2)); // guides up the sides of the barrel
    E.add('camo', zTube(c0 - 0.1, c1 - 0.2, 0.11, 0.11, 14, s * 0.17, -0.42)); // buffer and recuperator under it
    E.add('dark', zTube(c0 - 0.16, c0 - 0.1, 0.085, 0.085, 12, s * 0.17, -0.42));
    E.add('steel', xTube(s * 0.32, s * 0.46, 0.1, 0.1, 14)); // trunnions
    E.add('camo', box(0.12, 0.16, 0.2, s * 0.38, -0.2, -1.3)); // equilibrator lugs
  }
  E.add('camo', zTube(c0 - 0.14, c0 + 0.1, G.prof[3][1] + 0.08, G.prof[3][1] + 0.08, 20)); // front guide ring
  E.add('camo', gearArc(0.75, 0.95, 0.15, 1.3, 0.05, 18, 0.03).translate(-0.33, 0, 0));
  E.add('steel', rod(V(-0.3, 0.05, 0.4), V(-0.55, 0.28, 0.42), 0.02, 6));
  panoramicSight(E, -0.55, 0.28, 0.42, -1);
  E.build(el, { dirt: 0.25, y0: TRY });

  // ---- barrel
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  const ring0 = G.BR - G.RING, pts = [[G.MZ, 0]];
  for (const [s, r] of G.prof) pts.push([G.MZ + s, r]);
  pts.push([ring0, G.prof[G.prof.length - 1][1]], [ring0, 0.0001]);
  B.add('camo', barrel(pts, 28));
  B.add('char', new THREE.CircleGeometry(G.prof[0][1] * 0.64, 16).rotateY(Math.PI).translate(0, 0, G.MZ - 0.001));
  const rw = G.ringW, rz = (ring0 + G.BR) / 2, rl = G.RING;
  B.add('camo', box(rw, rw * 0.22, rl, 0, rw * 0.39, rz));
  B.add('camo', box(rw, rw * 0.22, rl, 0, -rw * 0.39, rz));
  B.add('camo', box(rw * 0.22, rw, rl, -rw * 0.39, 0, rz));
  B.add('camo', box(rw, rw, 0.16, 0, 0, ring0 + 0.08));
  B.add('dark', box(0.4, 0.14, 0.3, 0, -rw / 2 - 0.08, ring0 + 0.1)); // rod lug
  for (const s of [-1, 1]) B.add('steel', zTube(c0 + 0.2, ring0 + 0.1, 0.04, 0.04, 8, s * 0.17, -0.42));
  B.add('steel', rod(V(rw * 0.42, rw * 0.45, G.BR - 0.2), V(rw * 0.5, rw * 0.62, G.BR + 0.05), 0.018, 5));
  B.build(rc, { dirt: 0.15, y0: TRY });

  const br = pivotAt(rig, rc, 'breech', 0, 0, rz);
  const K = rig.part();
  K.add('camo', box(rw * 0.78, rw * 0.56, rl - 0.02, 0, 0, 0));
  K.add('char', new THREE.CircleGeometry(G.prof[0][1] * 0.7, 16).translate(0, 0, rl / 2 - 0.009));
  K.add('dark', box(0.06, 0.07, 0.2, rw * 0.3, rw * 0.3, 0.1));
  K.add('steel', rod(V(rw * 0.3, rw * 0.32, 0.2), V(rw * 0.45, rw * 0.5, 0.5), 0.02, 5));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, rw * 0.78);

  // ---- equilibrators (top carriage to cradle)
  const eqMat = { outer: rig.mats.camo, inner: rig.mats.steel };
  const struts = [-1, 1].map((s) => ({ st: makeStrut(car, eqMat, 0.13, 0.06), a: new THREE.Vector3(s * 0.46, 1.2, TRZ - 1.2), lug: new THREE.Vector3(s * 0.38, -0.2, -1.3), b: new THREE.Vector3() }));
  const placeStruts = () => {
    const e = el.rotation.x, c = Math.cos(e), sn = Math.sin(e);
    for (const q of struts) {
      q.b.set(q.lug.x, el.position.y + q.lug.y * c - q.lug.z * sn, el.position.z + q.lug.y * sn + q.lug.z * c);
      setStrut(q.st, q.a, q.b, 0.6, 0.85);
    }
  };
  rig.setElevation = (r) => { el.rotation.x = r; placeStruts(); };
  rig.update = () => placeStruts();
  placeStruts();

  // ---- dual recoil
  rig.recoilLength = G.recoil;
  rig.carriageRecoil = G.slide;
  rig.setRecoil = (k) => { rc.position.z = k * rig.recoilLength; car.position.z = k * rig.carriageRecoil; };

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 3.2, 3.0);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, G.MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, G.BR + 0.02);
  const sh = buildShell(G.kind);
  rig.anchors.tray = node(el, 'tray', 0, 0, G.BR + sh.length / 2 + 0.06);
  rig.anchors.shellStack = node(root, 'shellStack', 3.4, 0.15, 3.8);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), G.BR + 0.06), G.kind);
  rig.loadEl = 0;
  // the breech comes down between the girders at high elevation: the platform's top is the floor there
  floorFade(rig, TRY - 0.3, G.BR + 0.04, rw * 0.7, 0.08, 0.3);
  rig.slideMats = ['camo', 'steel', 'char'];

  crew(rig, 'officer', -3.2, 2.0, L90, 'point');
  crew(rig, 'layer', -1.05, TRZ + 0.55, L90, 'lay', 0.95);
  crew(rig, 'elevator', 1.05, TRZ + 0.55, R90, 'operate', 0.95);
  crew(rig, 'lanyard', 1.3, 2.6, R90, 'lanyard', DECK);
  crew(rig, 'loader1', -1.15, 3.3, 0, 'carry', DECK);
  crew(rig, 'loader2', -1.15, 4.3, 0, 'carry', DECK);
  crew(rig, 'rammer1', -0.28, 4.6, 0, 'ram', DECK);
  crew(rig, 'rammer2', 0.28, 4.6, 0, 'ram', DECK);
  crew(rig, 'ammo1', 3.9, 3.0, R90, 'stand');
  crew(rig, 'ammo2', 3.9, 4.8, R90, 'crouch');

  hb(rig, -1.8, 0, -1.8, 1.8, 3.0, 1.8);
  hb(rig, -1.9, 0, 1.8, 1.9, 2.4, 7.9);
  return finishRig(rig, G.kind, G.kind);
}

function loftRings(rings) {
  // a straight box beam through rectangle stations (convex per segment)
  const g = [];
  for (let i = 0; i < rings.length - 1; i++) g.push(loft([rings[i], rings[i + 1]]));
  return g.length === 1 ? g[0] : mergeAll(g);
}

import * as THREE from 'three';
import { V, box, sphere, rod, xTube, yTube, zTube } from '../../kit.js';
import { FParts } from '../mats.js';
import { damageable, finishTarget } from '../damage.js';
import { rng } from '../props.js';
import { layoutWest } from './layout_west.js';
import { build25pdr, build55in } from './allied_guns.js';
import { buildAircraft } from './aircraft.js';
import {
  OD, sherman, carrier, lorry, quad, limber27, ridgeTent, jerrycans, boxStack, shellPyramid, netOver, pit,
} from './allied_kit.js';

// The Allied targets of the WW2 mode's Flanders 1944 operation (DESIGN.md "WW2 mode"), the German
// player's view of a British and Canadian corps area: the field and medium regiments' gun positions,
// a Sherman laager, a supply dump, the road traffic and an Air Observation Post strip. Same contract
// as the WW1 targets: { root, parts, setDamage(i, k), anchors: { burn, top, center } }, the gun
// batteries add `rigs` (one per part, anchors.muzzle, setRecoil) so they recoil and flash when the
// sim fires them. Parts stand at layout_west.js's positions; every site faces local -Z (the Germans).
//   abattery  four 25-pounders on their platforms in round sandbag pits under nets, a No. 27 limber
//             by each, the Morris Quads dug in behind, the command post
//   amedium   four 5.5-inch guns in bigger pits under nets, the AEC Matadors dug in behind
//   tanks     five Shermans in a laager facing out, tents, jerrycan stacks; damage brews them up
//   adump     five stacks (shell boxes, jerrycans, cartridge boxes, shells, mixed stores) with tarpaulins
//   aconvoy   Bedford QL, Austin K5, a Sherman, a Universal carrier (moved along the road by the sim:
//             parts face -Z and the render layer turns each to its direction of travel)
//   aop       two Austers parked by the strip, the tent with the wireless (and a windsock)

const EARTH = 0xa08c6c;
const hd = (x, z) => Math.atan2(-x, -z); // heading that faces from the origin out through (x, z)

// ----------------------------------------------------------------------------------- gun batteries
function gunBattery(kind) {
  const big = kind === 'amedium', root = new THREE.Group(), r = rng(big ? 55 : 25);
  const layout = layoutWest(kind), parts = [], rigs = [];
  layout.forEach((l, i) => {
    const part = new THREE.Group();
    part.position.set(l.x, 0, l.z);
    part.rotation.y = (r() - 0.5) * 0.14;
    const rig = big ? build55in() : build25pdr();
    rig.setElevation(big ? 0.32 + r() * 0.12 : 0.22 + r() * 0.15);
    part.add(rig.root);
    rigs.push(rig);
    const R = big ? 5.2 : 3.6;
    const P = new FParts(OD);
    pit(P, R, { courses: big ? 4 : 3, gap: big ? 1.6 : 1.2, seed: 40 + i, earth: EARTH });
    // ready-use ammunition in the pit walls, empty cases thrown out behind, the trail's track in the mud
    boxStack(P, -R + 0.9, -0.6, 1, 3, 2, Math.PI / 2, { w: 0.78, h: 0.24, d: 0.3, rnd: r });
    boxStack(P, R - 0.9, -0.2, 1, 3, 2, -Math.PI / 2, { w: 0.78, h: 0.24, d: 0.3, rnd: r });
    if (big) shellPyramid(P, R - 1.2, 2.6, 4, 2, 0.3, { len: 0.62, rad: 0.075 });
    for (let k = 0; k < 5; k++) P.add('brass', zTube(0, big ? 0.6 : 0.38, big ? 0.08 : 0.05, big ? 0.08 : 0.05, 8, (r() - 0.5) * 3, 0.05, R + 0.5 + r() * 1.5).applyMatrix4(new THREE.Matrix4().makeRotationY(r() * 3)));
    if (!big) limber27(P, 2.6, 5.4, 0.5 + r() * 0.3);
    else boxStack(P, 2.4, R + 1.4, 2, 2, 2, 0.3, { w: 0.6, h: 0.45, d: 0.45, tint: 0x4e5238, rnd: r });
    P.build(part, { dirt: 0.5 });
    // the net, on poles over the pit, pegged out to the ground
    const N = new FParts(OD);
    netOver(N, big ? 8.5 : 6.0, big ? 6.5 : 4.4, big ? 3.0 : 2.3, { seed: 60 + i, drape: big ? 1.8 : 1.4, open: true });
    const netGroup = new THREE.Group();
    netGroup.position.z = big ? 2.2 : 1.6;
    N.build(netGroup, { dirt: 0, shadow: true });
    part.add(netGroup);
    const rp = rig.pivots;
    damageable(part, {
      scorch: big ? 9 : 7, char: 0.9, sink: 0.15,
      bits: [
        { obj: netGroup, k0: 0.0, k1: 0.6, pos: [0.4, -2.2, 0.3], rot: [0.15, 0.4, 0.2], scale: 0.6 },
        { obj: rp.recoil, k0: 0.35, k1: 0.85, pos: [0.4, big ? 0.6 : 0.8, 1.2], rot: [-0.6, 0.5, 0.8] },
        { obj: rp.elevation, k0: 0.4, k1: 1, rot: [-0.3, 0, 0] },
        { obj: rp.traverse, k0: 0.2, k1: 1, rot: [0.05, 0.4, big ? 0.25 : 0.35], pos: [0, -0.2, 0] },
      ],
    });
    root.add(part);
    parts.push(part);
  });
  // the tractors dug in behind the guns: a scrape with the spoil thrown up round it, a net over each
  const D = new FParts(OD);
  layout.forEach((l, i) => {
    const tx = l.x + (i % 2 ? -5 : 5), tz = l.z + (big ? 22 : 17), ry = (r() - 0.5) * 0.3;
    if (big) lorry(D, tx, tz, ry, { type: 'matador' }); else quad(D, tx, tz, ry);
    const L = big ? 7 : 5.2, Wd = 3.2;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) < 0) continue; // the way out at the back
      D.add('earth', sphere(1, tx + Math.cos(a) * Wd * 0.85, 0.15, tz + Math.sin(a) * L * 0.62, 1.4, 0.55, 1.5, 8), { tint: EARTH });
    }
    const n = new FParts(OD);
    netOver(n, Wd + 0.8, L + 0.6, big ? 3.4 : 2.6, { seed: 80 + i, drape: 1.0 });
    const ng = new THREE.Group();
    ng.position.set(tx, 0, tz);
    ng.rotation.y = ry;
    n.build(ng, { dirt: 0 });
    root.add(ng);
  });
  // the command post behind the centre: a sandbagged dugout with its roof of corrugated iron and earth,
  // a signal wire run to each pit, tents and the cookhouse
  const cz = big ? 34 : 30;
  D.add('earth', sphere(1, 0, 0.35, cz, 4.5, 1.1, 3.4, 12), { tint: EARTH });
  D.add('sandbag', box(4.2, 0.85, 0.5, 0, 0.42, cz - 3.0));
  D.add('dark', box(1.0, 0.8, 0.1, 0, 0.4, cz - 3.3));
  D.add('rust', box(5, 0.04, 3.4, 0, 1.25, cz, 0.04), { tint: 0x8a7a66 });
  D.add('dark', yTube(0.8, 3.6, 0.008, 0.006, 4, 1.5, cz));
  for (const l of layout) D.add('dark', rod(V(l.x, 0.04, l.z + 3), V(0, 0.04, cz - 3), 0.01, 3));
  ridgeTent(D, -12, cz + 6, 0.2);
  ridgeTent(D, 12, cz + 7, -0.3);
  jerrycans(D, 5, cz + 2, 6, 2, 3, 0.4, { rnd: r });
  boxStack(D, -6, cz - 1, 3, 2, 3, -0.3, { w: 0.78, h: 0.24, d: 0.3, rnd: r });
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts, { rigs, guns: rigs });
}

// ------------------------------------------------------------------------------------- tank laager
function brewUp(part, turret, hatch, r, extra = []) {
  return damageable(part, {
    scorch: 6, char: 0.97, sink: 0.08, tilt: [0.02, 0, (r() - 0.5) * 0.08],
    bits: [
      { obj: hatch, k0: 0.2, k1: 0.5, rot: [-0.6, 0, 0] },
      { obj: turret, k0: 0.55, k1: 0.9, pos: [(r() - 0.5) * 1.6, -0.25, 0.4 + r() * 0.8], rot: [0.25 * (r() - 0.5), (r() - 0.5) * 2.4, 0.35 * (r() < 0.5 ? -1 : 1)] },
      ...extra,
    ],
  });
}
function buildTanks() {
  const root = new THREE.Group(), r = rng(31);
  const parts = layoutWest('tanks').map((l, i) => {
    const t = sherman({ cast: i % 3 === 1, seed: 10 + i, number: i + 1 });
    const part = t.group;
    part.position.set(l.x, 0, l.z);
    part.rotation.y = hd(l.x, l.z) + (r() - 0.5) * 0.25;
    root.add(part);
    return brewUp(part, t.turret, t.hatch, r);
  });
  // the laager's middle: crew tents, the petrol and the ammunition brought up, a brew going
  const D = new FParts(OD);
  ridgeTent(D, -4, 3, 0.4, { w: 2.6, d: 3.6, h: 1.9 });
  ridgeTent(D, 5, 4, -0.2, { w: 2.6, d: 3.6, h: 1.9 });
  ridgeTent(D, 0, -3, 1.4, { w: 2.6, d: 3.6, h: 1.9, tint: 0xc8c0a0 });
  jerrycans(D, -10, -2, 8, 2, 3, 0.2, { rnd: r });
  jerrycans(D, 9, -3, 6, 2, 2, -0.4, { rnd: r });
  boxStack(D, 1, 9, 3, 2, 2, 0.1, { w: 0.9, h: 0.32, d: 0.36, tint: 0x4e5238, rnd: r });
  D.add('cloth', box(3.0, 0.05, 2.4, -2, 0.3, 10, 0.1, 0.3, 0.05), { tint: 0x6e6a4c });
  D.add('dark', yTube(0, 0.35, 0.18, 0.18, 10, 3, 1));
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

// ------------------------------------------------------------------------------------------- dump
function dumpStack(i, kind, r, x, z, ry) {
  const part = new THREE.Group();
  part.position.set(x, 0, z);
  part.rotation.y = ry;
  const base = new FParts(OD);
  base.add('wood', box(6.6, 0.12, 5.2, 0, 0.06, 0));
  for (let k = 0; k < 8; k++) base.add('earth', sphere(1, (r() - 0.5) * 8.5, 0.1, (r() - 0.5) * 7, 0.9 + r(), 0.2 + r() * 0.12, 0.8 + r() * 0.8, 6), { tint: EARTH });
  base.add('sandbag', box(6.6, 0.5, 0.5, 0, 0.25, -2.9));
  base.build(part, { dirt: 0.5 });
  const bits = [];
  for (let j = 0; j < 3; j++) {
    const g = new THREE.Group(), P = new FParts(OD);
    g.position.z = -1.6 + j * 1.6;
    if (kind === 'boxes') boxStack(P, 0, 0, 6, 2, 3, 0, { w: 0.78, h: 0.24, d: 0.3, rnd: r, y: 0.12 }); // 25-pdr ammunition boxes
    else if (kind === 'jerrycans') jerrycans(P, 0, 0, 22, 3, j === 1 ? 3 : 2, 0, { rnd: r, tint: j === 2 ? 0x6a6a5a : 0x5a6040 });
    else if (kind === 'cartridges') boxStack(P, 0, 0, 5, 2, 3, 0, { w: 1.0, h: 0.36, d: 0.42, tint: 0x6e5a40, key: 'wood', rnd: r, y: 0.12 });
    else if (kind === 'shells') { shellPyramid(P, -1.4, 0, 7, 4, 0, { len: 0.62, rad: 0.075 }); shellPyramid(P, 1.4, 0, 7, 3, 0, { len: 0.55, rad: 0.045 }); }
    else { // mixed: ration boxes, drums, a crate of mines
      boxStack(P, -1.6, 0, 3, 2, 2, 0.1, { w: 0.6, h: 0.35, d: 0.45, tint: 0x8a7a58, key: 'wood', rnd: r, y: 0.12 });
      for (let k = 0; k < 4; k++) P.add('matte', yTube(0.12, 1.0, 0.29, 0.29, 12, 0.8 + (k % 2) * 0.62, -0.3 + (k >> 1) * 0.62), { tint: 0x4e5a3a });
      boxStack(P, 2.4, 0, 1, 2, 3, 0, { w: 0.8, h: 0.3, d: 0.5, tint: 0x5c5a3e, rnd: r, y: 0.12 });
    }
    P.build(g, { dirt: 0.4, y0: 0.12 });
    part.add(g);
    bits.push({ obj: g, k0: 0.25 + j * 0.12, k1: 0.9, pos: [(r() - 0.5) * 8, 1.5 + r() * 5, (r() - 0.5) * 8 + 2], rot: [(r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3] });
  }
  const T = new FParts(OD);
  T.add('cloth', box(6.4, 0.05, 3.2, 0, 0, 0, 0.25), { tint: i % 2 ? 0x5e5c44 : 0x6e6a50 });
  T.add('cloth', box(6.4, 1.3, 0.05, 0, -0.65, 1.6), { tint: 0x5e5c44 });
  const tarp = new THREE.Group();
  tarp.position.set(0, 1.45, 0.9);
  T.build(tarp, { dirt: 0, y0: 1.2 });
  part.add(tarp);
  bits.push({ obj: tarp, k0: 0.1, k1: 0.5, pos: [0, 4.5, 2.5], rot: [-1.2, 0.6, 0.5] });
  return damageable(part, { scorch: 9, char: 0.95, sink: 0.1, bits });
}
function buildDump() {
  const root = new THREE.Group(), r = rng(17);
  const kinds = ['boxes', 'jerrycans', 'cartridges', 'shells', 'mixed'];
  const parts = layoutWest('adump').map((l, i) => {
    const p = dumpStack(i, kinds[i], r, l.x, l.z, (r() - 0.5) * 0.5);
    root.add(p);
    return p;
  });
  // a Bedford QL backed up to the stacks, the checker's tent, the dump's board and wire, a track worn in
  const D = new FParts(OD);
  lorry(D, -30, 2, Math.PI / 2 + 0.2, { type: 'ql', tilt: false });
  ridgeTent(D, 32, 14, -0.4);
  D.add('wood', yTube(0, 2.0, 0.05, 0.05, 5, -6, -30));
  D.add('white', box(1.4, 0.7, 0.04, -6, 1.9, -30), { tint: 0xc8c0a0 });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, x = Math.cos(a) * 40, z = Math.sin(a) * 34;
    D.add('wood', yTube(0, 1.2, 0.04, 0.04, 4, x, z));
    const a1 = ((k + 1) / 14) * Math.PI * 2;
    if (k % 7 !== 3) D.add('rust', rod(V(x, 1.0, z), V(Math.cos(a1) * 40, 1.0, Math.sin(a1) * 34), 0.006, 3));
  }
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

// ----------------------------------------------------------------------------------------- convoy
/** One vehicle of the Allied road traffic on its own ('ql' | 'k5' | 'sherman' | 'carrier'), front -Z. */
export function buildAlliedTraffic(kind, seed = 1) {
  const g = new THREE.Group();
  if (kind === 'sherman') {
    const t = sherman({ seed, stowage: true });
    t.turret.rotation.y = 0;
    t.group.userData.turret = t.turret;
    t.group.userData.hatch = t.hatch;
    return t.group;
  }
  const P = new FParts(OD);
  if (kind === 'carrier') carrier(P, 0, 0, 0);
  else if (kind === 'quad') quad(P, 0, 0, 0);
  else if (kind === 'limber') limber27(P, 0, 0, 0);
  else { // a lorry: the canvas tilt is its own group so a hit can burn it off the hoops
    const T = new FParts(OD), info = {};
    lorry(P, 0, 0, 0, { type: kind, tarp: kind === 'k5' ? 0xe0d8b4 : 0xd0c8a4, tiltP: T, info });
    const tilt = new THREE.Group();
    tilt.position.set(...info.tiltAt);
    T.build(tilt, { dirt: 0, y0: info.tiltAt[1] });
    g.add(tilt);
    g.userData.tilt = tilt;
  }
  P.build(g, { dirt: 0.55 });
  return g;
}
function buildConvoy() {
  const root = new THREE.Group(), r = rng(41);
  const kinds = ['ql', 'k5', 'sherman', 'carrier'];
  const parts = layoutWest('aconvoy').map((l, i) => {
    const part = buildAlliedTraffic(kinds[i], 20 + i);
    part.position.set(l.x, 0, l.z);
    root.add(part);
    if (kinds[i] === 'sherman') return brewUp(part, part.userData.turret, part.userData.hatch, r);
    const bits = part.userData.tilt ? [{ obj: part.userData.tilt, k0: 0.25, k1: 0.7, scale: 0.02, pos: [0, -0.6, 0] }] : [];
    return damageable(part, { scorch: 6, char: 0.95, sink: 0.05, tilt: [0.03, (r() - 0.5) * 0.3, kinds[i] === 'carrier' ? 0.1 : 0.16], bits });
  });
  // the road junction's furniture: a provost's sign board, a knocked-out telegraph pole, shell holes
  const S = new FParts(OD);
  S.add('wood', yTube(0, 2.6, 0.06, 0.06, 5, -9, -4));
  S.add('white', box(1.2, 0.35, 0.04, -9, 2.3, -4, 0, 0.6, 0), { tint: 0xc8c0a0 });
  S.add('white', box(1.2, 0.35, 0.04, -9, 1.85, -4, 0, -0.4, 0), { tint: 0xc8c0a0 });
  S.add('wood', rod(V(14, 0.2, 8), V(23, 0.5, 4), 0.1, 5));
  S.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

// --------------------------------------------------------------------------------------- AOP strip
function buildAOP() {
  const root = new THREE.Group(), r = rng(43);
  const lay = layoutWest('aop');
  const parts = [];
  for (let i = 0; i < 2; i++) {
    const a = buildAircraft('auster'), part = new THREE.Group();
    part.add(a.root);
    a.prop.rotation.z = r() * 3;
    part.position.set(lay[i].x, 0, lay[i].z);
    part.rotation.y = (i ? -0.25 : 0.3) + (r() - 0.5) * 0.1;
    root.add(part);
    // brewed up: the fabric burns off, the airframe sags onto one wing and the tail
    parts.push(damageable(part, { scorch: 6, char: 0.97, sink: 0.15, tilt: [-0.12, 0.2, i ? 0.22 : -0.22], bits: [{ obj: a.body, k0: 0.3, k1: 0.9, pos: [0, -0.35, 0], rot: [-0.08, 0, 0] }] }));
  }
  // the flight's tent: the wireless set on a trestle table, jerrycans of petrol, the officers' kit
  const tent = new THREE.Group();
  tent.position.set(lay[2].x, 0, lay[2].z);
  tent.rotation.y = 0.15;
  const T = new FParts(OD);
  ridgeTent(T, 0, 0, Math.PI / 2, { w: 3.6, d: 5.0, h: 2.5, tint: 0xd8d0b0 });
  T.add('wood', box(1.8, 0.05, 0.8, 0, 0.78, -3.6));
  for (const s of [-1, 1]) for (const t of [-1, 1]) T.add('wood', yTube(0, 0.76, 0.03, 0.03, 4, s * 0.8, -3.6 + t * 0.32));
  T.add('matte', box(0.6, 0.4, 0.35, -0.3, 1.0, -3.6), { tint: 0x4e5238 });
  T.add('dark', yTube(1.2, 4.5, 0.012, 0.008, 4, -0.45, -3.6));
  jerrycans(T, 3.5, -1.0, 6, 2, 2, 0.2, { rnd: r, tint: 0x5a6040 });
  for (let k = 0; k < 3; k++) T.add('matte', yTube(0, 0.88, 0.29, 0.29, 12, -3.6 + k * 0.62, 1.2), { tint: 0x5a5440 });
  T.build(tent, { dirt: 0.5 });
  root.add(tent);
  parts.push(damageable(tent, { scorch: 6, char: 0.92, sink: 0.05, squash: 0.35, tilt: [0.05, 0, 0.1] }));
  // the strip: a windsock on its mast, white marker boards along the edge, wheel ruts in the grass
  const S = new FParts(OD);
  S.add('wood', yTube(0, 6.0, 0.06, 0.04, 6, 30, 18));
  S.add('dark', xTube(30, 30.8, 0.03, 0.03, 4, 5.95, 18));
  // the sock: four bands, each a cone from one point of a drooping curve to the next
  const sockAt = (u) => V(30.8 + u * 2.5, 5.95 - u * u * 0.9, 18 + u * 0.4);
  for (let k = 0; k < 4; k++) {
    const a = sockAt(k / 4), b = sockAt((k + 1) / 4), d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(0.3 - (k + 1) * 0.04, 0.3 - k * 0.04, d.length(), 12, 1, true);
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)));
    S.add('cloth', g, { tint: k % 2 ? 0xc0502a : 0xe0d8c8 });
  }
  // the strip runs across the site's front (along x): white boards at its corners and halfway
  for (const x of [-60, 0, 60]) for (const z of [-14, -40]) {
    S.add('white', box(2.4, 0.06, 0.5, x, 0.08, z), { tint: 0xe0dccc });
    S.add('white', box(0.5, 0.06, 1.6, x + (x < 0 ? -0.95 : 0.95), 0.08, z + (z < -20 ? 0.55 : -0.55)), { tint: 0xe0dccc });
  }
  S.build(root, { dirt: 0.3 });
  return finishTarget(root, parts);
}

export const BUILD = {
  abattery: () => gunBattery('abattery'),
  amedium: () => gunBattery('amedium'),
  tanks: buildTanks,
  adump: buildDump,
  aconvoy: buildConvoy,
  aop: buildAOP,
};

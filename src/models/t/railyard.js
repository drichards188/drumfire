import * as THREE from 'three';
import { box, sphere, rod, V, yTube, zTube, xTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { partLayout } from './layout.js';
import { locomotive, boxcar, hipRoof, gableRoof, lyingShell, shellBlock, rng } from './props.js';

// The German railhead (r 120), standard gauge, tracks along local Z: three tracks on a gravel bed
// (an empty siding, the main line with an ammunition train, a siding of open wagons), a 0-8-0
// goods locomotive at the head of the train, four covered ammunition wagons, two open wagons
// loaded with shells, a brick water tower with a water crane, a brick goods shed with a loading
// dock, and the clutter of a railhead (coal, crates, signals, poles). Parts: [loco, 4 ammunition
// wagons, 2 open wagons, water tower, shed]. Damage derails and tips the wagons, blows the roofs
// off and the ammunition wagons burn; the tower's tank falls. buildTrain(n) gives a locomotive and
// n wagons coupled up as one Group for the sim's moving trains (front -Z, origin at the loco's axle).

const TRACKS = [-8, 0, 8];

function track(P, x, z0, z1) {
  for (let z = z0; z <= z1; z += 0.75) P.add('wood', box(2.6, 0.14, 0.26, x, 0.12, z));
  for (const s of [-0.7175, 0.7175]) P.add('steel', box(0.07, 0.15, z1 - z0, x + s, 0.27, (z0 + z1) / 2));
  P.add('earth', box(4.4, 0.18, z1 - z0, x, 0.05, (z0 + z1) / 2), { tint: 0x8a8880 });
}

function waterTower(r) {
  const g = new THREE.Group(), base = new THREE.Group(), tank = new THREE.Group();
  g.add(base, tank);
  const B = new FParts('tri');
  B.add('brick', yTube(0, 7, 2.3, 2.1, 8, 0, 0), { tint: 0xd8c8b8 });
  B.add('plaster', yTube(6.7, 7.1, 2.6, 2.6, 8, 0, 0));
  B.add('plaster', yTube(0, 0.6, 2.6, 2.6, 8, 0, 0));
  for (let k = 0; k < 3; k++) B.add('char', box(0.5, 1.0, 0.1, Math.cos(k * 2.1) * 2.2, 2 + k * 1.6, Math.sin(k * 2.1) * 2.2, 0, -k * 2.1 + 1.57, 0));
  B.add('steel', yTube(0, 6, 0.12, 0.12, 6, 3.2, 0)); // the feed pipe
  B.add('steel', rod(V(3.2, 5.5, 0), V(5.2, 4.2, -9), 0.1, 5)); // the water crane's arm
  B.build(base, { dirt: 0.5 });
  const T = new FParts('tri');
  T.add('rust', yTube(7.1, 10.4, 3.4, 3.4, 16, 0, 0), { tint: 0xc0b0a0 });
  for (let k = 0; k < 3; k++) T.add('dark', yTube(7.1 + k * 1.1, 7.2 + k * 1.1, 3.45, 3.45, 16, 0, 0));
  T.add('tile', yTube(10.4, 12.4, 3.6, 0.1, 16, 0, 0));
  T.add('dark', rod(V(3.4, 7.1, 0), V(3.4, 10.4, 0), 0.04, 4));
  T.build(tank, { dirt: 0.2, y0: 7 });
  g.userData.dmg = { char: 0.9, scorch: 9, sink: 0.4, bits: [
    { obj: tank, k0: 0.3, k1: 1, pos: [3.5, -6.2, 2.5], rot: [0.5, 0.2, 0.9] },
  ] };
  return g;
}

function shed(r) {
  const g = new THREE.Group(), body = new THREE.Group(), roof = new THREE.Group();
  g.add(body, roof);
  const B = new FParts('tri');
  B.add('brick', box(8, 4.2, 20, 0, 2.1, 0), { tint: 0xe0d0c0 });
  B.add('plaster', box(8.4, 0.5, 20.4, 0, 0.25, 0));
  B.add('plaster', box(8.3, 0.3, 20.3, 0, 4.2, 0));
  for (let k = 0; k < 4; k++) B.add('char', box(0.2, 3, 3.2, -4.0, 1.9, -7 + k * 4.6)); // loading doors on the track side
  for (let k = 0; k < 4; k++) B.add('wood', box(0.12, 3.1, 0.12, -4.08, 1.9, -8.7 + k * 4.6));
  B.add('wood', box(3, 0.5, 21, -5.7, 0.9, 0)); // the dock
  for (let k = 0; k < 9; k++) B.add('wood', box(0.3 + r() * 0.5, 0.5, 0.6, 4.6, 0.25, -8 + k * 2 + r()));
  B.build(body, { dirt: 0.4 });
  roof.position.y = 4.2;
  const R = new FParts('tri');
  hipRoof(R, 'tile', 8, 20, 2.6, 0, 0, 0, 0.5);
  R.add('char', box(2.5, 0.2, 3.0, 0.5, 1.4, 3.0, 0.4, 0, 0.2));
  for (let k = 0; k < 5; k++) R.add('wood', rod(V(-1 + k * 0.6, 1.0, 2), V(-1 + k * 0.6, 2.2 + r(), 4.6), 0.06, 4));
  R.build(roof, { dirt: 0.1, y0: 4.2 });
  g.userData.dmg = { char: 0.85, scorch: 10, sink: 0.3, bits: [
    { obj: roof, k0: 0.1, k1: 0.8, pos: [0.5, -3.2, 0], rot: [0.1, 0.1, -0.25], scale: 0.9 },
  ] };
  return g;
}

function wagonPart(open, r, tint, k) {
  const g = new THREE.Group(), body = new THREE.Group();
  const C = new FParts('tri'), Bd = new FParts('tri');
  boxcar(C, 0, 0, 0, { tint, open, body: Bd });
  if (open) shellBlock(Bd, 'm21', 0, 0, 5, 14, { layers: 1, rnd: r, y: 1.9 });
  C.build(g, { dirt: 0.5 });
  Bd.build(body, { dirt: 0.4, y0: 1 });
  g.add(body);
  g.userData.dmg = { char: 0.9, scorch: 8, sink: 0.35, tilt: [0.04, 0.08, 0.3], bits: [
    { obj: body, k0: 0.35, k1: 1, pos: [0.4 * (k % 2 ? 1 : -1), 0.5, 1.5], rot: [0.2, 0.25, 0.55 * (k % 2 ? 1 : -1)] },
  ] };
  return g;
}

export function buildRailyard() {
  const root = new THREE.Group(), r = rng(29);
  const lay = partLayout('railyard');
  const parts = [];
  const mk = (g, i, ry = 0) => { damageable(g, { ...g.userData.dmg, at: [lay[i].x, 0, lay[i].z], ry }); root.add(g); parts.push(g); };
  // locomotive
  {
    const g = new THREE.Group(), P = new FParts('tri');
    locomotive(P, 0, 0);
    P.build(g, { dirt: 0.5 });
    g.userData.dmg = { char: 0.9, scorch: 10, sink: 0.3, tilt: [0.05, 0.1, 0.35] };
    mk(g, 0);
  }
  // 4 covered ammunition wagons (the train), 2 open wagons of shells, the tower, the shed
  [0x6e4a36, 0x5e4430, 0x75503a, 0x684634].forEach((t, k) => mk(wagonPart(false, r, t, k), 1 + k));
  [0, 1].forEach((k) => mk(wagonPart(true, r, 0x5a4432, k), 5 + k));
  mk(waterTower(r), 7);
  mk(shed(r), 8);

  // track bed and clutter
  const T = new FParts('tri');
  for (const x of TRACKS) track(T, x, -100, 100);
  // the points: a few cross-overs as angled sleepers/rails
  for (const s of [-1, 1]) T.add('steel', box(0.07, 0.15, 22, s * 0.7175 + 4, 0.27, 70, 0, 0.36 * 1 , 0));
  T.add('earth', sphere(1, -17, 0.4, -20, 3, 1.1, 2.4, 8), { tint: 0x2a2826 }); // coal
  T.add('char', sphere(1, -17, 0.5, -20, 2.4, 1.0, 1.9, 7));
  for (let k = 0; k < 18; k++) T.add('wood', box(0.9, 0.6, 0.6, 16 + (k % 3) * 1.0, 0.3 + Math.floor(k / 9) * 0.6, 10 + (k % 9) * 0.7), { tint: 0x7a6040 });
  for (let k = 0; k < 10; k++) lyingShell(T, 'fh15', -14 + r() * 10, 0.1, -60 + r() * 120, r() * 3);
  for (let k = 0; k < 6; k++) { // telegraph poles along the west edge
    T.add('wood', yTube(0, 7.5, 0.13, 0.1, 6, -16, -90 + k * 36));
    T.add('wood', box(1.4, 0.08, 0.08, -16, 7.2, -90 + k * 36));
  }
  // a signal post and a signal box
  T.add('dark', yTube(0, 6, 0.08, 0.08, 6, 4, -95));
  T.add('red', box(0.9, 0.12, 0.05, 4, 5.6, -95));
  T.add('brick', box(4, 3, 3, -12, 1.5, 55), { tint: 0xe0d0c0 });
  T.add('wood', box(4.4, 0.3, 3.4, -12, 3.1, 55));
  T.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

// A moving train: a locomotive and n wagons, front -Z, origin at the loco's axle group.
export function buildTrain(n = 4, seed = 3) {
  const g = new THREE.Group(), r = rng(seed);
  const P = new FParts('tri');
  locomotive(P, 0, 0);
  P.build(g, { dirt: 0.5 });
  for (let k = 0; k < n; k++) {
    const w = wagonPart(k % 3 === 2, r, [0x6e4a36, 0x5e4430, 0x75503a][k % 3], k);
    damageable(w, { ...w.userData.dmg, at: [0, 0, 14.4 + k * 8.7] });
    g.add(w);
  }
  return g;
}

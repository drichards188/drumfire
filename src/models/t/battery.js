import * as THREE from 'three';
import { box, sphere, rod, V, xTube, yTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { partLayout } from './layout.js';
import { buildGermanGun } from './german.js';
import { shellBlock, sandbagWall, rng, lyingShell } from './props.js';

// A German heavy battery (r 60): four 15 cm sFH 13 howitzers, each in its own pit with a U of
// sandbags and earth, a camouflage net on poles, a ready ammunition stack and cartridge baskets,
// duckboards, and a crew dugout behind with a stovepipe. The guns are rigs (buildGermanGun), so a
// battery can recoil: target.rigs[i].setRecoil(k). Faces local -Z (the British side).
//   parts[i]      the pit group of gun i (the destroyable bit)
//   target.rigs   [rig] per gun, target.guns the same
//   damage        k 0 intact; the net falls from 0.0, the barrel is kicked out of its cradle from 0.3,
//                 the carriage slumps and burns, the ammunition cooks (black, scattered shells)

function net(P, w, d, y, sag, seed) {
  const r = rng(seed), g = new THREE.PlaneGeometry(w, d, 10, 10).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2);
    p.setY(i, y - sag * (1 - u * u) * (1 - v * v) + (r() - 0.5) * 0.08 + Math.max(0, Math.abs(u) - 0.8) * -0.4);
  }
  g.computeVertexNormals();
  P.add('net', g);
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) P.add('wood', rod(V(px, 0, pz), V(px * 0.95, y + 0.3, pz * 0.95), 0.05, 5));
}

export function buildBattery() {
  const root = new THREE.Group(), r = rng(7);
  const layout = partLayout('battery');
  const parts = [], rigs = [];
  layout.forEach((l, i) => {
    const part = new THREE.Group();
    part.position.set(l.x, 0, l.z);
    part.rotation.y = (r() - 0.5) * 0.12;
    const rig = buildGermanGun('fh15');
    rig.setElevation(0.3 + r() * 0.2);
    part.add(rig.root);
    rigs.push(rig);
    // the pit: sandbag U with earth banked against the outside, duckboard floor
    const P = rig.root && new FParts('tri');
    sandbagWall(P, -2.3, -1.5, -2.3, 3.5, { courses: 4, t: 0.6 });
    sandbagWall(P, 2.3, -1.5, 2.3, 3.5, { courses: 4, t: 0.6 });
    sandbagWall(P, -2.3, 3.6, 2.3, 3.6, { courses: 3, t: 0.6 });
    sandbagWall(P, -2.3, -2.0, -0.9, -2.0, { courses: 2, t: 0.6 });
    sandbagWall(P, 0.9, -2.0, 2.3, -2.0, { courses: 2, t: 0.6 });
    for (let k = 0; k < 12; k++) {
      const a = k / 12, side = k % 2 ? 1 : -1;
      P.add('earth', sphere(1, side * (2.8 + r() * 0.4), 0.15, -1.5 + a * 5.2, 0.7 + r() * 0.3, 0.45 + r() * 0.2, 1.0 + r() * 0.4, 8), { tint: 0xa89478 });
    }
    P.add('earth', sphere(1, 0, 0.2, 4.2, 3.0, 0.4, 0.8, 8), { tint: 0xa89478 });
    P.add('wood', box(4.2, 0.05, 5.4, 0, 0.03, 1.1));
    shellBlock(P, 'fh15', 3.7, 1.0, 2, 3, { layers: 2, ry: 0.1, rnd: r });
    // cartridge baskets: wicker cylinders, standing
    for (let k = 0; k < 4; k++) P.add('wicker', yTube(0.0, 0.7, 0.16, 0.16, 10, -3.6 + (k % 2) * 0.38, 0.8 + Math.floor(k / 2) * 0.38));
    if (i % 2 === 0) lyingShell(P, 'fh15', -3.2, 0.0, 2.6, 0.4);
    P.build(part, { dirt: 0.5 });
    const N = new FParts('tri');
    net(N, 6.4, 4.4, 2.6, 0.35, 30 + i);
    const nets = N.build(part, { dirt: 0, shadow: true });
    const netGroup = new THREE.Group();
    netGroup.position.set(0, 0, 2.4);
    nets.forEach((m) => { netGroup.add(m); });
    part.add(netGroup);
    damageable(part, {
      scorch: 7, char: 0.9, sink: 0.2,
      bits: [
        { obj: netGroup, k0: 0.0, k1: 0.6, pos: [0, -2.4, 0], rot: [0.2, 0.3, 0.25], scale: 0.5 },
        { obj: rig.pivots.recoil, k0: 0.3, k1: 0.8, pos: [0.3, 0.9, 1.4], rot: [-0.5, 0.4, 0.7] },
        { obj: rig.pivots.elevation, k0: 0.4, k1: 1, rot: [0.3, 0, 0] },
        { obj: rig.pivots.traverse, k0: 0.2, k1: 1, rot: [0.04, 0.3, 0.3], pos: [0, -0.15, 0] },
      ],
    });
    root.add(part);
    parts.push(part);
  });

  // the crew dugout behind the guns: an earth mound, plank door, stovepipe, sandbag step
  const D = new FParts('tri');
  D.add('earth', sphere(1, 0, 0.5, 0, 4.2, 1.5, 3.0, 12), { tint: 0xa89478 });
  D.add('wood', box(1.2, 1.4, 0.2, 0, 0.7, -2.7));
  D.add('char', box(0.9, 1.1, 0.1, 0, 0.65, -2.82));
  D.add('wood', box(1.6, 0.12, 1.0, 0, 1.45, -2.6));
  sandbagWall(D, -1.4, -3.2, 1.4, -3.2, { courses: 3 });
  D.add('dark', yTube(0.9, 2.4, 0.08, 0.08, 8, 1.5, 0.3));
  for (let k = 0; k < 14; k++) D.add('earth', sphere(1, (r() - 0.5) * 9, 0.18, (r() - 0.5) * 6, 0.9, 0.3, 0.9, 6), { tint: 0xa89478 });
  const dug = new THREE.Group();
  dug.position.set(0, 0, 25);
  D.build(dug, { dirt: 0.5 });
  root.add(dug);
  // duckboard paths from the pits to the dugout
  const T = new FParts('tri');
  for (const l of layout) {
    const dx = 0 - l.x, dz = 22 - (l.z + 4), len = Math.hypot(dx, dz);
    T.add('wood', box(0.8, 0.04, len, 0, 0.03, 0, 0, Math.atan2(dx, dz)).applyMatrix4(new THREE.Matrix4().makeTranslation(l.x + dx / 2, 0, l.z + 4 + dz / 2)));
  }
  T.build(root, { dirt: 0.5, shadow: false });
  const out = finishTarget(root, parts, { rigs, guns: rigs });
  return out;
}

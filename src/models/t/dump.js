import * as THREE from 'three';
import { box, sphere, rod, V, xTube, yTube, zTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { partLayout } from './layout.js';
import { shellBlock, sandbagWall, lyingShell, rng, wagon } from './props.js';

// A German ammunition dump (r 45): five stacks (shells nose up on timber skids, wicker cartridge
// baskets, crates) with tarpaulins half over them and earth banked round, a 600 mm light railway
// through it with a loaded flat wagon, a corrugated-iron hut with sandbag ends, a sentry box.
// Each stack is a part: damage first lifts the tarpaulin, then flings the shell rows out over a
// few metres in turn (so the dump seems to cook off), blackens and scorches the ground.

function stack(i, kind, r, x, z, ry) {
  const part = new THREE.Group();
  part.position.set(x, 0, z);
  part.rotation.y = ry;
  const rows = [];
  const base = new FParts('tri');
  base.add('wood', box(6.6, 0.14, 5.4, 0, 0.07, 0));
  for (let k = 0; k < 10; k++) base.add('earth', sphere(1, (r() - 0.5) * 8.5, 0.12, (r() - 0.5) * 7, 0.9 + r(), 0.2 + r() * 0.15, 0.8 + r() * 0.8, 6), { tint: 0xa8946f });
  sandbagWall(base, -3.4, -2.9, 3.4, -2.9, { courses: 3, t: 0.5 });
  base.build(part, { dirt: 0.5 });
  const bits = [];
  for (let j = 0; j < 3; j++) {
    const g = new THREE.Group(), P = new FParts('tri');
    g.position.z = -1.6 + j * 1.6;
    if (kind === 'shells') shellBlock(P, j === 1 ? 'm21' : 'fh15', 0, 0, j === 1 ? 6 : 8, 2, { layers: 2, rnd: r });
    else if (kind === 'baskets') {
      for (let a = 0; a < 7; a++) for (let b = 0; b < 2; b++) for (let l = 0; l < 2; l++) {
        P.add('wicker', yTube(0, 0.72, 0.17, 0.17, 10, (a - 3) * 0.72 + (b % 2) * 0.1, (b - 0.5) * 0.7).translate(0, l * 0.74 + 0.14, 0));
        P.add('dark', yTube(0.72, 0.76, 0.18, 0.18, 10, (a - 3) * 0.72 + (b % 2) * 0.1, (b - 0.5) * 0.7).translate(0, l * 0.74 + 0.14, 0));
      }
    } else {
      for (let a = 0; a < 5; a++) for (let l = 0; l < 3; l++) {
        P.add('wood', box(1.0, 0.42, 0.6, (a - 2) * 1.12, 0.14 + 0.22 + l * 0.43, 0), { tint: l % 2 ? 0x8a7050 : 0x6e5a40 });
        P.add('dark', box(1.02, 0.04, 0.62, (a - 2) * 1.12, 0.14 + 0.22 + l * 0.43, 0));
      }
    }
    P.build(g, { dirt: 0.4, y0: 0.14 });
    part.add(g);
    rows.push(g);
    bits.push({ obj: g, k0: 0.25 + j * 0.12, k1: 0.9, pos: [(r() - 0.5) * 8, 1.5 + r() * 5, (r() - 0.5) * 8 + 2], rot: [(r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3] });
  }
  // the tarpaulin over the back rows, held up on poles
  const T = new FParts('tri');
  T.add('cloth', box(6.2, 0.05, 2.8, 0, 0.0, 0, 0.3), { tint: i % 2 ? 0x6a6a52 : 0x7c7660 });
  for (const sx of [-1, 1]) T.add('wood', rod(V(sx * 3, -0.9, 1.3), V(sx * 3, 0.5, 1.2), 0.04, 4));
  const tarp = new THREE.Group();
  tarp.position.set(0, 1.85, 1.4);
  T.build(tarp, { dirt: 0, y0: 1.5 });
  part.add(tarp);
  bits.push({ obj: tarp, k0: 0.1, k1: 0.5, pos: [0, 4.5, 2.5], rot: [-1.2, 0.6, 0.5] });
  return damageable(part, { scorch: 9, char: 0.95, sink: 0.1, bits });
}

export function buildDump() {
  const root = new THREE.Group(), r = rng(13);
  const kinds = ['shells', 'shells', 'baskets', 'shells', 'boxes'];
  const parts = partLayout('dump').map((l, i) => {
    const p = stack(i, kinds[i], r, l.x, l.z, (r() - 0.5) * 0.5);
    root.add(p);
    return p;
  });

  const D = new FParts('tri');
  // 600 mm light railway along z at x = -29, sleepers every 0.8 m
  for (let z = -42; z <= 42; z += 0.8) D.add('wood', box(1.3, 0.1, 0.16, -29, 0.05, z));
  for (const sx of [-0.3, 0.3]) D.add('steel', box(0.05, 0.08, 84, -29 + sx, 0.14, 0));
  // a flat wagon with a load of shells
  D.add('dark', box(1.4, 0.15, 3.6, -29, 0.55, -10));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.add('dark', xTube(sx * 0.45, sx * 0.55, 0.22, 0.22, 10, 0.3, -10 + sz * 1.2));
  shellBlock(D, 'fh15', -29, -10, 3, 5, { layers: 1 });
  // a corrugated-iron hut with sandbag ends, a sentry box, spare shells in the mud
  const hut = new THREE.CylinderGeometry(1.9, 1.9, 6, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(0);
  hut.rotateY(Math.PI / 2).rotateX(0);
  D.add('rust', hut.translate(-36, 0, 15), { tint: 0x9a7a5a });
  sandbagWall(D, -38, 12, -34, 12, { courses: 3 });
  sandbagWall(D, -38, 18, -34, 18, { courses: 3 });
  D.add('wood', box(1.2, 2.2, 1.2, -6, 1.1, -26));
  D.add('wood', box(1.5, 0.12, 1.5, -6, 2.3, -26));
  for (let i = 0; i < 6; i++) lyingShell(D, i % 2 ? 'm21' : 'fh15', -12 + r() * 30, 0.12, -30 + r() * 60, r() * 3);
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

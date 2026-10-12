import * as THREE from 'three';
import { box, sphere, rod, V, topProfile, xTube, yTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { rng } from './props.js';

// A German Mebu (Mannschafts-Eisenbeton-Unterstand) at Passchendaele: a low rough-cast concrete
// block about 7 x 5 m and 2.4 m high, a roof slab with steel joists and brush on it, a firing slit
// in the front (-Z, toward the British) and a doorway behind with a blast wall, sunk in the mud
// with a puddle beside it, chipped by shellfire with reinforcement rods showing. (refs/german Q 6028,
// Q 6045, LAC "German pillbox".) One part; damage cracks the roof, drops the front wall and
// tips the whole block into the mud.

export function buildMebu() {
  const root = new THREE.Group(), r = rng(11);
  const part = new THREE.Group();
  root.add(part);
  const body = new THREE.Group(), roof = new THREE.Group(), front = new THREE.Group(), chunk = new THREE.Group();
  part.add(body, roof, front, chunk);

  const B = new FParts('tri');
  // main block: an irregular plan with chamfered corners, y 0 .. 2.2 (half of it above the mud)
  const plan = [[-3.0, -2.0], [3.0, -2.0], [3.5, -1.2], [3.5, 2.2], [3.0, 2.5], [-3.0, 2.5], [-3.5, 2.0], [-3.5, -1.4]];
  B.add('concrete', topProfile(plan, -0.5, 2.2));
  // doorway at the back (+Z): a dark recess and a thin blast wall in front of it
  B.add('char', box(1.1, 1.6, 0.3, 1.0, 0.9, 2.45));
  B.add('concrete', box(2.6, 1.8, 0.35, 1.0, 0.9, 3.5));
  B.add('concrete', box(0.35, 1.8, 1.4, -0.3, 0.9, 3.0));
  // pitting: chipped corners and grooves read as dark patches
  for (let i = 0; i < 14; i++) {
    const side = r() < 0.5 ? -1 : 1;
    B.add('concrete', box(0.3 + r() * 0.5, 0.25 + r() * 0.4, 0.2 + r() * 0.3, side * (3.3 + r() * 0.2), 0.3 + r() * 1.8, -1.8 + r() * 4, r(), r(), r()), { tint: 0x9a968c });
  }
  // exposed reinforcement: a few bars sticking out of the broken corners
  for (let i = 0; i < 9; i++) B.add('rust', rod(V(-3.5 + r() * 7, 1.6 + r() * 0.5, -2.1), V(-3.5 + r() * 7, 1.9 + r() * 0.5, -2.5 - r() * 0.6), 0.012, 4));
  B.build(body, { dirt: 0.5 });

  const F = new FParts('tri');
  F.add('concrete', box(6.2, 1.8, 0.5, 0, 1.0, -2.25)); // the thick front wall
  F.add('char', box(1.5, 0.3, 0.4, 0.6, 1.5, -2.5)); // firing slit
  F.add('concrete', box(1.7, 0.1, 0.6, 0.6, 1.72, -2.45));
  F.build(front, { dirt: 0.5 });

  const R = new FParts('tri');
  R.add('concrete', topProfile([[-3.7, -2.3], [3.7, -2.3], [3.9, 2.7], [-3.9, 2.7]], 2.2, 2.75));
  for (let i = 0; i < 5; i++) R.add('rust', box(0.18, 0.18, 6.4, -3 + i * 1.5, 2.85, 0.2, 0, 0.02, 0)); // steel joists laid over
  for (let i = 0; i < 16; i++) R.add('earth', sphere(1, -3.4 + r() * 6.8, 2.85, -2 + r() * 4.4, 0.6 + r() * 0.8, 0.14 + r() * 0.14, 0.5 + r() * 0.6, 6), { tint: 0x9a8668 });
  for (let i = 0; i < 6; i++) R.add('wood', rod(V(-3 + r() * 6, 2.9, -2 + r() * 4), V(-3 + r() * 6, 3.4 + r() * 0.5, -2 + r() * 4), 0.03, 4));
  R.build(roof, { dirt: 0.3, y0: 2 });

  // spoil heaped round the foot, a puddle in front, planks to the door
  const M = new FParts('tri');
  for (let i = 0; i < 22; i++) {
    const a = r() * 6.28, d = 3.6 + r() * 2.2;
    M.add('earth', sphere(1, Math.cos(a) * d * 1.2, 0.1, Math.sin(a) * d * 0.9, 0.9 + r() * 1.2, 0.25 + r() * 0.3, 0.8 + r(), 7), { tint: 0x8a7a5e });
  }
  M.add('water', new THREE.CircleGeometry(2.6, 20).rotateX(-Math.PI / 2).scale(1.4, 1, 0.9).translate(-2.5, 0.04, -4.2));
  M.add('wood', box(0.5, 0.05, 3.2, 1.0, 0.05, 5.2));
  M.build(part, { dirt: 0.5, shadow: false });

  part.position.y = -0.35; // partly sunk
  damageable(part, {
    scorch: 8, char: 0.55, sink: 0.45, tilt: [0.05, 0, -0.1],
    bits: [
      { obj: roof, k0: 0.2, k1: 0.9, pos: [0.8, 0.1, 0.5], rot: [0.12, 0.2, -0.28] },
      { obj: front, k0: 0.4, k1: 1, pos: [-0.5, -0.5, -1.2], rot: [-0.3, 0.1, 0.15] },
    ],
  });
  return finishTarget(root, [part]);
}

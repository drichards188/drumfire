import * as THREE from 'three';
import { box, sphere, rod, V, yTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { partLayout } from './layout.js';
import { hipRoof, rng } from './props.js';

// A Flemish chateau HQ (r 40) as the German staff left it after a summer of shelling: red brick
// with pale stone quoins, string courses and window frames, a hipped tile roof with dormers and
// chimneys, a pillared porch on the main block, a round tower with a conical roof on the east
// wing, already damaged (a hole in the roof, a blown-out bay, scattered brick, dead trees).
// Three parts (west wing, main block, east wing): each is a body, a roof and a front facade slab,
// and damage drops the roof in, topples the facade forward and chars the lot. Faces local -Z.

const SPEC = [
  { w: 12, d: 9, H: 6.2, h: 3.2 },
  { w: 17, d: 11, H: 7.4, h: 4.6 },
  { w: 12, d: 9, H: 6.2, h: 3.2 },
];

function windows(P, w, H, d, cols, rows, r, broken = 0.12) {
  const gap = w / cols;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -w / 2 + gap * (i + 0.5), y = 1.9 + j * 2.7;
    if (j === 0 && cols % 2 === 1 && i === (cols - 1) / 2) continue; // the door bay
    P.add('plaster', box(1.3, 1.9, 0.12, x, y + 0.1, -0.02));
    P.add(r() < broken ? 'char' : 'glass', box(1.0, 1.55, 0.06, x, y + 0.1, -0.1));
    P.add('plaster', box(1.5, 0.12, 0.25, x, y - 0.95, -0.1));
    P.add('wood', box(0.05, 1.55, 0.04, x, y + 0.1, -0.14));
    P.add('wood', box(1.0, 0.05, 0.04, x, y + 0.1, -0.14));
  }
}

export function buildHQ() {
  const root = new THREE.Group(), r = rng(19);
  const lay = partLayout('hq');
  const parts = [];
  SPEC.forEach((S, i) => {
    const part = new THREE.Group();
    part.position.set(lay[i].x, 0, lay[i].z);
    const body = new THREE.Group(), roof = new THREE.Group(), facade = new THREE.Group();
    roof.position.y = S.H;
    facade.position.z = -S.d / 2;
    part.add(body, roof, facade);

    const B = new FParts('tri');
    B.add('brick', box(S.w, S.H, S.d - 0.5, 0, S.H / 2, 0.25), { tint: 0xe8d8c8 });
    B.add('plaster', box(S.w + 0.3, 0.8, S.d + 0.3, 0, 0.4, 0));
    B.add('plaster', box(S.w + 0.2, 0.3, S.d + 0.2, 0, 3.7, 0)); // string course
    B.add('plaster', box(S.w + 0.3, 0.25, S.d + 0.3, 0, S.H, 0)); // cornice
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) { // quoins at the rear corners
      B.add('plaster', box(0.8, 0.5, 0.9, sx * (S.w / 2 - 0.2), 0.8 + k * 1.1, S.d / 2 - 0.2));
    }
    // the rear wall's windows and the gable ends
    const RW = new THREE.Group();
    windows(B, S.w, S.H, S.d, Math.round(S.w / 2.8), 2, r, 0.2);
    B.build(body, { dirt: 0.4 });
    // rear: a second window run on a plain group placed at the back
    const BR = new FParts('tri');
    windows(BR, S.w, S.H, S.d, Math.round(S.w / 2.8), 2, r, 0.2);
    const back = new THREE.Group();
    back.position.z = S.d / 2 + 0.02;
    back.rotation.y = Math.PI;
    BR.build(back, { dirt: 0.4 });
    body.add(back);
    void RW;

    // facade slab with its windows, and a porch on the main block
    const F = new FParts('tri');
    F.add('brick', box(S.w, S.H, 0.5, 0, S.H / 2, 0.25), { tint: 0xe8d8c8 });
    F.add('plaster', box(S.w + 0.3, 0.8, 0.8, 0, 0.4, 0.2));
    windows(F, S.w, S.H, 0.5, i === 1 ? 7 : 4, 2, r, i === 2 ? 0.3 : 0.15);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) F.add('plaster', box(0.8, 0.5, 0.9, sx * (S.w / 2 - 0.2), 0.8 + k * 1.1, 0));
    if (i === 1) {
      for (const sx of [-1, 1]) F.add('plaster', box(0.5, 3.6, 0.5, sx * 1.8, 1.8, -1.6));
      F.add('plaster', box(4.4, 0.4, 2.6, 0, 3.8, -1.2));
      F.add('brick', box(4.0, 0.5, 2.2, 0, 4.2, -1.2));
      for (let s = 0; s < 4; s++) F.add('plaster', box(4.6 - s * 0.3, 0.2, 0.5, 0, 0.1 + s * 0.2, -2.2 - (3 - s) * 0.45));
      F.add('char', box(1.8, 2.5, 0.2, 0, 1.4, -0.05)); // the doorway
    }
    F.build(facade, { dirt: 0.4 });

    // roof: tiles, dormers, chimneys; a hole in the main roof and bare rafters
    const R = new FParts('tri');
    hipRoof(R, 'tile', S.w, S.d, S.h, 0, 0, 0, 0.5);
    for (let k = 0; k < (i === 1 ? 3 : 2); k++) {
      const dx = (k - (i === 1 ? 1 : 0.5)) * 4.2;
      R.add('plaster', box(1.4, 1.4, 1.2, dx, 1.0, -S.d / 2 + 1.1));
      R.add('tile', new THREE.CylinderGeometry(0.001, 1.1, 0.9, 4, 1).rotateY(Math.PI / 4).scale(1.05, 1, 0.9).translate(dx, 2.15, -S.d / 2 + 1.1));
      R.add('glass', box(0.8, 0.8, 0.06, dx, 1.0, -S.d / 2 + 0.48));
    }
    for (const sx of [-1, 1]) R.add('brick', box(0.8, 2.6, 0.8, sx * (S.w / 2 - 1.6), S.h + 0.6, 0.0), { tint: 0xe0d0c0 });
    if (i === 1) { // shell hole through the roof, rafters sticking out
      R.add('char', box(3.2, 0.3, 2.4, -2.5, S.h * 0.55, 1.2, 0.5, 0, 0.1));
      for (let k = 0; k < 7; k++) R.add('wood', rod(V(-4 + k * 0.7, S.h * 0.5, 2.4), V(-4.2 + k * 0.7, S.h * 0.9 + r() * 0.8, -0.3), 0.06, 4));
    }
    if (i === 2) { // the round tower
      R.add('brick', yTube(-S.H, 2.4, 2.4, 2.4, 16, S.w / 2 - 1.2, -S.d / 2 + 1.2), { tint: 0xe8d8c8 });
      R.add('plaster', yTube(2.35, 2.8, 2.7, 2.7, 16, S.w / 2 - 1.2, -S.d / 2 + 1.2));
      R.add('tile', yTube(2.8, 7.4, 2.9, 0.0, 16, S.w / 2 - 1.2, -S.d / 2 + 1.2));
      R.add('char', box(0.8, 1.2, 0.1, S.w / 2 - 1.2, 1.2, -S.d / 2 - 1.15));
    }
    R.build(roof, { dirt: 0.1, y0: S.H });

    damageable(part, {
      scorch: 14, char: 0.85, sink: 0.4,
      bits: [
        { obj: roof, k0: 0.1, k1: 0.9, pos: [0.4, -S.H * 0.55, 0.3], rot: [0.12, 0.08, -0.18], scale: 0.9 },
        { obj: facade, k0: 0.35, k1: 1, pos: [0, 0, -1.2], rot: [-1.35 - i * 0.05, 0, 0] },
      ],
    });
    root.add(part);
    parts.push(part);
  });

  // dressing: a garden wall with gate posts in front, dead trees, rubble
  const G = new FParts('tri');
  for (const sx of [-1, 1]) G.add('brick', box(14, 1.2, 0.5, sx * 14.5, 0.6, -14), { tint: 0xd8c8b8 });
  for (const sx of [-1, 1]) G.add('plaster', box(0.8, 2.2, 0.8, sx * 3.4, 1.1, -14));
  for (let k = 0; k < 6; k++) {
    const x = -24 + r() * 48, z = -20 - r() * 12, h = 4 + r() * 4;
    G.add('wood', yTube(0, h, 0.4, 0.18, 7, x, z));
    for (let b = 0; b < 3; b++) G.add('wood', rod(V(x, h * (0.6 + b * 0.12), z), V(x + (r() - 0.5) * 2.4, h * (0.8 + b * 0.1) + 0.6, z + (r() - 0.5) * 2.4), 0.05, 4));
  }
  for (let k = 0; k < 24; k++) G.add('brick', box(0.3 + r() * 0.8, 0.2 + r() * 0.5, 0.3 + r() * 0.8, 20 + r() * 7 - 3, 0.2, -6 + r() * 10, r(), r(), r()), { tint: 0xd0c0b0 });
  G.build(root, { dirt: 0.4 });
  return finishTarget(root, parts);
}

import * as THREE from 'three';
import { box, rod, V, yTube, zTube, xTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { partLayout } from './layout.js';
import { lorry, sandbagWall, rng } from './props.js';

// A German Drachen kite balloon (Parseval-Sigsfeld type, refs/german: 27.5 m long, 6 m across,
// nose into the wind and tipped up, an air sock at the tail, a net of rigging to a wicker basket)
// flying at the site's `alt` on a cable from its winch lorry, which stands 0.5 alt away along
// local -X (the balloon floats downwind, nose toward the winch). opts.alt defaults to 900.
// parts[0] the balloon (at y = alt), parts[1] the winch lorry. Damage burns the balloon (hydrogen:
// char, shrink, and it sags and drops) and cuts the cable. target.cable is the line itself.

export function buildBalloon({ alt = 900 } = {}) {
  const root = new THREE.Group(), r = rng(17);
  const lay = partLayout('balloon', { alt });
  const L = 27.5, R = 3.0;

  // ---- the balloon
  const outer = new THREE.Group();
  outer.position.set(lay[0].x, lay[0].y, lay[0].z);
  outer.rotation.y = Math.PI / 2;
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.45;
  outer.add(tilt);
  const pts = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 tail .. 1 nose
    let rad;
    if (t > 0.8) rad = R * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)); // rounded nose
    else if (t > 0.45) rad = R * (1 - 0.04 * ((0.8 - t) / 0.35));
    else rad = R * (0.96 - 0.6 * ((0.45 - t) / 0.45) ** 1.5) + 0.0;
    pts.push(new THREE.Vector2(Math.max(0.08, rad), t * L));
  }
  const env = new THREE.LatheGeometry(pts, 28).rotateX(-Math.PI / 2).translate(0, 0, L / 2);
  const E = new FParts('tri');
  E.add('fabric', env, { tint: 0xf2e8c8 });
  // the air sock under the tail, two stabilising lobes, a seam band
  E.add('fabric', zTube(L / 2 - 3, L / 2 + 6, 1.7, 0.9, 14, 0, -1.4), { tint: 0xe6dab8 });
  for (const s of [-1, 1]) E.add('fabric', box(0.12, 0.2, 1, s * 2.3, -0.3, L / 2 - 3).applyMatrix4(new THREE.Matrix4().makeScale(1, 9, 6)).applyMatrix4(new THREE.Matrix4().makeRotationZ(s * 0.5)).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0)), { tint: 0xdccfa8 });
  // rigging: lines from the belly to the basket's bridle
  const by = -R - 7;
  for (const z of [-7, -1, 5]) for (const x of [-1.6, 1.6]) E.add('dark', rod(V(x * 0.9, -R * 0.75, z), V(x * 0.2, by + 1.2, -0.5 + z * 0.1), 0.02, 3));
  E.add('wicker', box(1.5, 0.9, 1.1, 0, by, 0));
  E.add('wood', box(1.6, 0.06, 1.2, 0, by + 0.46, 0));
  E.add('dark', box(1.6, 0.05, 1.2, 0, by - 0.45, 0));
  E.add('dark', rod(V(0, by + 1.2, -0.5), V(0, by + 0.5, 0), 0.04, 4));
  E.add('red', box(0.3, 0.12, 0.02, 0, by + 0.3, -0.58)); // a flag on the basket
  E.build(tilt, { dirt: 0, y0: 0 });
  const bridle = new THREE.Object3D();
  bridle.position.set(0, by + 1.2, -0.5);
  tilt.add(bridle);
  damageable(outer, { char: 0.95, sink: alt * 0.5, tilt: [0.5, 0.2, 0.35], squash: 0.55, bits: [] });
  root.add(outer);

  // ---- the winch lorry on its mound, a few sandbags, the cable
  const lg = new THREE.Group();
  lg.position.set(lay[1].x, 0, lay[1].z);
  const W = new FParts('tri');
  lorry(W, 0, 0, -Math.PI / 2, { winch: true });
  sandbagWall(W, 6, -5, 6, 5, { courses: 3 });
  W.add('wood', box(7, 0.05, 3, 0, 0.03, 0)); // standing boards
  W.build(lg, { dirt: 0.5 });
  damageable(lg, { char: 0.9, scorch: 6, sink: 0.1, tilt: [0, 0, 0.15] });
  root.add(lg);
  const C = new FParts('tri');
  root.updateMatrixWorld(true);
  const a = V(lay[1].x, 2.3, 0), b = bridle.getWorldPosition(new THREE.Vector3());
  C.add('dark', rod(a, b, 0.05, 4));
  const cableG = new THREE.Group();
  C.build(cableG, { shadow: false });
  root.add(cableG);
  // the cable goes when the balloon burns
  const bits = [{ obj: cableG, k0: 0.1, k1: 0.2, scale: 0.0001 }];
  const home = outer.userData.setDamage;
  outer.userData.setDamage = (k) => {
    home(k);
    cableG.visible = k < 0.15;
  };
  void bits;
  return finishTarget(root, [outer, lg], { cable: cableG, bridle });
}

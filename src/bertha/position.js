import * as THREE from 'three';
import { V, box, rbox, yTube, zTube, xTube, rod, Parts, vehicleMats } from '../models/kit.js';
import { buildShell, buildCartridge } from '../models/shells.js';
import { mulberry32 } from '../noise.js';

// The gun position around the Bertha (rig root frame: y = 0 the levelled ground, front -Z): the shell cart
// on the carriage's right (it turns with the carriage so the crane always reaches it), the shell stack and the
// charge store behind sandbags, the battery commander's telephone post on the left, the firer's breastwork
// 15 m out with the long lanyard to the firing lock, and the two aiming posts (Richtlatten) the line layer
// lays on through the panoramic sight. Returns { group, cartShell, lanyard(update) , posts }.
const rnd = mulberry32(17);

function sandbags(P, x0, z0, x1, z1, rows, y0 = 0) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.62)), a = Math.atan2(x1 - x0, z1 - z0);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n; i++) {
      const t = (i + (r % 2 ? 0.5 : 0.25)) / n;
      if (t > 1) continue;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      P.add('cloth', rbox(0.36, 0.17, 0.6, 0.06, x + (rnd() - 0.5) * 0.04, y0 + 0.085 + r * 0.16, z + (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.06, a + (rnd() - 0.5) * 0.1, 0), { tint: 0.85 + rnd() * 0.15 > 0.95 ? 0xd8ccb0 : 0xc4b494 });
    }
  }
}

export function buildPosition(rig) {
  const mats = vehicleMats('bunt');
  const group = new THREE.Group();
  group.name = 'bertha-position';
  const P = new Parts(mats);
  const T = new Parts(mats);
  const out = { group, cartShell: {} };
  const props = (built, parent) => {
    const g = new THREE.Group();
    for (const p of built.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    parent.add(g);
    return g;
  };

  // ---------------------------------------------------------------- the shell cart (turns with the carriage)
  {
    const cx = 3.45, cz = 3.0;
    for (const s of [-1, 1]) T.add('steel', box(0.07, 0.06, 3.6, cx + s * 0.5, 0.03, cz));
    T.add('timber', box(1.0, 0.1, 1.6, cx, 0.36, cz));
    T.add('dark', box(0.9, 0.12, 0.12, cx, 0.24, cz - 0.6));
    T.add('dark', box(0.9, 0.12, 0.12, cx, 0.24, cz + 0.6));
    for (const s of [-1, 1]) for (const dz of [-0.6, 0.6]) T.add('dark', xTube(cx + s * 0.5 - 0.04, cx + s * 0.5 + 0.04, 0.16, 0.16, 12, 0.18, cz + dz));
    for (const s of [-1, 1]) T.add('timber', box(0.12, 0.14, 1.5, cx + s * 0.3, 0.48, cz));
    T.build(rig.pivots.traverse, { y0: rig.bed });
    for (const k of ['schwer', 'leicht']) {
      const g = props(buildShell(k === 'schwer' ? 'm42' : 'm42l'), rig.pivots.traverse);
      g.position.set(cx, 0.62, cz);
      g.visible = false;
      out.cartShell[k] = g;
    }
  }

  // ---------------------------------------------------------------- the shell stack (right rear)
  {
    const x0 = 6.2, z0 = 6.5;
    for (const dz of [-1.2, 1.2]) P.add('timber', box(3.2, 0.2, 0.24, x0, 0.1, z0 + dz));
    sandbags(P, x0 - 2.0, z0 - 2.2, x0 + 2.2, z0 - 2.2, 5);
    sandbags(P, x0 + 2.2, z0 - 2.2, x0 + 2.2, z0 + 2.0, 5);
    sandbags(P, x0 - 2.0, z0 + 2.0, x0 + 2.2, z0 + 2.0, 4);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6 - row; i++) {
        const g = props(buildShell(row === 0 && i % 3 === 2 ? 'm42l' : 'm42', 12), group);
        g.position.set(x0 - 1.2 + i * 0.44 + row * 0.22, 0.42 + row * 0.38, z0);
        g.rotation.y = Math.PI / 2;
      }
    }
  }

  // ---------------------------------------------------------------- the charge store (left rear): brass cases and bags
  {
    const x0 = -6.0, z0 = 7.0;
    sandbags(P, x0 - 1.8, z0 - 1.6, x0 + 1.8, z0 - 1.6, 6);
    sandbags(P, x0 - 1.8, z0 - 1.6, x0 - 1.8, z0 + 1.6, 6);
    sandbags(P, x0 + 1.8, z0 - 1.6, x0 + 1.8, z0 + 0.4, 6);
    P.add('timber', box(3.8, 0.1, 3.4, x0, 1.02, z0, 0, 0, 0.04));
    for (const [x, z] of [[-1.7, -1.5], [1.7, -1.5], [-1.7, 1.5], [1.7, 1.5]]) P.add('timber', box(0.14, 1.0, 0.14, x0 + x, 0.5, z0 + z));
    for (let i = 0; i < 5; i++) {
      const g = props(buildCartridge('m42c'), group);
      g.position.set(x0 - 1.0 + i * 0.45, 0.48, z0 + 0.3);
      g.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 6; i++) {
      const g = props(buildCartridge('m42'), group);
      g.position.set(x0 - 1.1 + (i % 3) * 0.42, 0.2 + Math.floor(i / 3) * 0.36, z0 - 0.8);
    }
  }

  // ---------------------------------------------------------------- the commander's telephone post (left)
  {
    const x0 = -7.6, z0 = 0.5;
    sandbags(P, x0 - 1.4, z0 - 1.5, x0 + 0.6, z0 - 1.5, 7);
    sandbags(P, x0 - 1.4, z0 - 1.5, x0 - 1.4, z0 + 1.6, 7);
    sandbags(P, x0 - 1.4, z0 + 1.6, x0 + 0.6, z0 + 1.6, 7);
    P.add('timber', box(2.4, 0.12, 3.6, x0 - 0.4, 1.2, z0, 0.04));
    P.add('cloth', box(2.5, 0.06, 3.7, x0 - 0.4, 1.3, z0, 0.04), { tint: 0x9a9070 });
    // the table, the field telephone in its leather case, the order board
    P.add('timber', box(0.7, 0.05, 1.0, x0 - 0.75, 0.82, z0 + 0.2));
    for (const [x, z] of [[-0.3, -0.42], [0.3, -0.42], [-0.3, 0.42], [0.3, 0.42]]) P.add('timber', box(0.05, 0.8, 0.05, x0 - 0.75 + x, 0.4, z0 + 0.2 + z));
    P.add('rust', rbox(0.26, 0.2, 0.32, 0.03, x0 - 0.75, 0.95, z0 + 0.45));
    P.add('dark', box(0.08, 0.06, 0.2, x0 - 0.75, 1.08, z0 + 0.45));
    P.add('white', box(0.02, 0.5, 0.7, x0 - 1.32, 0.95, z0 - 0.2), { tint: 0xd6cdb0 });
    // the wire to the rear on its poles
    for (let i = 0; i < 4; i++) P.add('timber', yTube(0, 3.2, 0.05, 0.04, 6, x0 - 4 - i * 12, z0 - 2 + i * 3));
  }

  // ---------------------------------------------------------------- the firer's breastwork
  const FIRE = { x: -15, z: 7.4 };
  {
    sandbags(P, FIRE.x + 1.1, FIRE.z - 1.6, FIRE.x + 1.1, FIRE.z + 1.6, 6);
    sandbags(P, FIRE.x - 0.9, FIRE.z - 1.6, FIRE.x + 1.1, FIRE.z - 1.6, 6);
    sandbags(P, FIRE.x - 0.9, FIRE.z + 1.6, FIRE.x + 1.1, FIRE.z + 1.6, 6);
    P.add('timber', box(1.8, 0.06, 2.9, FIRE.x + 0.1, 0.03, FIRE.z));
  }
  out.fire = FIRE;

  // ---------------------------------------------------------------- aiming posts, front left of the gun
  // (clear of the shield and the wheel from the sight, and away from the morning sun)
  out.posts = [];
  for (const [x, z] of [[-43, -42.6], [-61, -61.4]]) { // on one line from the sight
    for (let i = 0; i < 6; i++) P.add(i % 2 ? 'white' : 'red', yTube(i * 0.5, i * 0.5 + 0.5, 0.05, 0.05, 8, x, z), { tint: i % 2 ? 0xffffff : 0xffffff });
    P.add('dark', yTube(-0.3, 0, 0.06, 0.06, 6, x, z));
    out.posts.push(V(x, 0, z));
  }

  // ---------------------------------------------------------------- odds: timber, a camouflage screen, the rammer rack
  {
    for (let i = 0; i < 5; i++) P.add('timber', box(0.25, 0.25, 4 + rnd(), 9.5 + i * 0.3, 0.13 + (i % 2) * 0.25, -4 + rnd() * 0.3, 0, rnd() * 0.05));
    for (const s of [-1, 1]) for (const z of [-8, -2.5, 12.5, 18]) P.add('timber', yTube(0, 5.2, 0.07, 0.06, 6, s * 12, z));
    P.add('rope', rod(V(-12, 5.1, -8), V(-12, 5.1, 18), 0.015, 4));
    P.add('rope', rod(V(12, 5.1, -8), V(12, 5.1, 18), 0.015, 4));
  }
  P.build(group, { y0: 0 });
  rig.root.add(group);

  // ---------------------------------------------------------------- the lanyard: a rope from the lock to the firer's hand
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2), mats.rope);
  rope.castShadow = false;
  rig.root.add(rope);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  // the lanyard from the firing lock to the firer's right hand (an Object3D), or to his post
  out.lanyard = (hand = null) => {
    rig.root.updateMatrixWorld(true);
    rig.anchors.lanyard.getWorldPosition(_a);
    if (hand) {
      hand.getWorldPosition(_b);
      rope.parent.worldToLocal(rope.position.copy(_b));
    } else rope.position.set(FIRE.x + 0.7, 0.9, FIRE.z);
    rope.getWorldPosition(_b);
    rope.lookAt(_a);
    rope.scale.set(1, 1, _b.distanceTo(_a));
  };
  return out;
}

import * as THREE from 'three';
import { box, rod, V, yTube } from '../kit.js';
import { FParts } from './mats.js';
import { damageable, finishTarget } from './damage.js';
import { partLayout } from './layout.js';
import { horse, wagon, limber, lorry, rng } from './props.js';
import { buildGermanGun } from './german.js';

// A crossroads behind the German line (r 30): a wayside shrine (a Calvary on a brick plinth under
// a little roof), a signpost, and four traffic parts: a canvas-tilted farm wagon with two horses,
// a gun limber towing a 7.7 cm field gun behind a four-horse team, a lorry with a tarpaulin load,
// and an open wagon of ammunition boxes. Horses are separate groups so damage can lay them down
// one by one. buildTraffic(kind) gives each vehicle on its own for the sim's mobile night traffic
// ('wagon' | 'gun' | 'lorry' | 'cart': a Group, front -Z, origin on the ground).

const COATS = [0x6a4326, 0x3a2a20, 0x7a5a3a, 0x4a4a48, 0x8a6a46, 0x2a2420];

// a vehicle with its horses; returns { group, horses: [Group] }
function vehicle(kind, r) {
  const g = new THREE.Group(), horses = [];
  const P = new FParts('tri');
  let team = [];
  if (kind === 'wagon' || kind === 'cart') {
    wagon(P, 0, 0, 0, { tilt: kind === 'wagon' });
    team = [[-0.6, -4.6], [0.6, -4.6]];
  } else if (kind === 'gun') {
    limber(P, 0, 0, 0);
    team = [[-0.6, -3.6], [0.6, -3.6], [-0.6, -6.2], [0.6, -6.2]];
    const gun = buildGermanGun('fk77');
    gun.root.position.set(0, 0, 3.7);
    gun.root.rotation.y = Math.PI;
    gun.setElevation(0);
    g.add(gun.root);
  } else if (kind === 'lorry') {
    lorry(P, 0, 0, 0);
  }
  P.build(g, { dirt: 0.5 });
  team.forEach(([x, z], i) => {
    const hg = new THREE.Group(), H = new FParts('tri');
    hg.position.set(x, 0, z);
    horse(H, 0, 0, 0, COATS[(i + (r() * 6 | 0)) % COATS.length]);
    // harness: a collar and traces to the vehicle
    H.add('dark', rod(V(0, 1.55, -0.65), V(x > 0 ? -0.5 : 0.5, 1.0, 1.4), 0.015, 3));
    H.add('rust', new THREE.TorusGeometry(0.24, 0.05, 5, 10).rotateX(Math.PI / 2 * 0.8).translate(0, 1.58, -0.6));
    H.build(hg, { dirt: 0.2 });
    g.add(hg);
    horses.push(hg);
  });
  return { group: g, horses };
}

export function buildTraffic(kind, seed = 1) {
  return vehicle(kind, rng(seed)).group;
}

export function buildCrossroads() {
  const root = new THREE.Group(), r = rng(23);
  const lay = partLayout('crossroads');
  const spec = [['wagon', 0.35], ['gun', -Math.PI / 2], ['lorry', Math.PI], ['cart', Math.PI / 2 + 0.2]];
  const parts = spec.map(([kind, ry], i) => {
    const v = vehicle(kind, r);
    const part = v.group;
    part.position.set(lay[i].x, 0, lay[i].z);
    part.rotation.y = ry;
    const bits = v.horses.map((h, k) => ({ obj: h, k0: 0.1 + k * 0.1, k1: 0.5 + k * 0.1, pos: [0, 0.3, 0.3], rot: [0.2, (r() - 0.5) * 0.8, (k % 2 ? 1 : -1) * 1.5] }));
    damageable(part, { scorch: 6, char: 0.8, sink: 0, tilt: [0, 0.1, kind === 'lorry' ? 0.12 : 0.3], bits });
    root.add(part);
    return part;
  });

  // the shrine, a signpost, a fallen telegraph pole
  const S = new FParts('tri');
  S.add('brick', box(1.2, 1.1, 1.2, 4, 0.55, 3), { tint: 0xd8c8b8 });
  S.add('plaster', box(1.4, 0.15, 1.4, 4, 1.15, 3));
  S.add('wood', box(0.22, 3.4, 0.22, 4, 2.9, 3));
  S.add('wood', box(1.2, 0.2, 0.2, 4, 3.8, 3));
  S.add('plaster', box(0.4, 0.9, 0.12, 4, 3.1, 3.12));
  S.add('tile', new THREE.CylinderGeometry(0.01, 1.1, 0.6, 4).rotateY(Math.PI / 4).translate(4, 4.8, 3));
  S.add('wood', rod(V(3.5, 4.5, 3), V(3.7, 4.2, 3), 0.03, 3));
  S.add('wood', yTube(0, 3.4, 0.07, 0.07, 6, -14, -9));
  for (let k = 0; k < 3; k++) S.add('wood', box(1.0, 0.25, 0.04, -14, 2.9 - k * 0.35, -9, 0, k * 0.9));
  S.add('wood', rod(V(14, 0.2, 8), V(24, 0.5, 4), 0.1, 5));
  for (let k = 0; k < 8; k++) S.add('earth', new THREE.SphereGeometry(1, 6, 4).scale(1 + r(), 0.2, 1 + r()).translate((r() - 0.5) * 40, 0.1, (r() - 0.5) * 40), { tint: 0x9a8668 });
  S.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

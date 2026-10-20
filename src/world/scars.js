import * as THREE from 'three';
import { LINES, PLACES, UNITS, piecePlacements, polylineDistance } from '../sector.js';
import { mulberry32 } from '../noise.js';
import { Mesher } from './mesher.js';
import { worldMats } from './mats.js';
import { ROADS } from './data.js';

// The torn timber and abandoned equipment that give the 1917 ground its silhouette.
// One merged group is cheap to draw even when the camera looks across the whole salient.
const LINE = (pts, z) => {
  for (let i = 0; i < pts.length - 1; i++) if (z <= pts[i + 1].z)
    return pts[i].x + (pts[i + 1].x - pts[i].x) * (z - pts[i].z) / (pts[i + 1].z - pts[i].z);
  return pts.at(-1).x;
};

function snag(m, h, x, z, rnd, seed) {
  const g = h(x, z), tall = 2.8 + rnd() * 5.3, lean = (rnd() - 0.5) * 0.7, yaw = rnd() * Math.PI * 2;
  const tip = [x + Math.cos(yaw) * lean * tall, g + tall, z + Math.sin(yaw) * lean * tall];
  const col = rnd() < 0.5 ? 0x77716a : 0x5e5b57;
  m.tube('timber', [x, g - 0.2, z], tip, 0.23 + rnd() * 0.1, 0.07, 7, col);
  m.tube('dark', [tip[0] - 0.05, tip[1] - 0.25, tip[2]], tip, 0.08, 0.002, 5, 0x86847e);
  const n = 2 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const t = 0.37 + rnd() * 0.52, a = yaw + i * 2.4 + rnd() * 0.7, l = 0.65 + rnd() * 1.6;
    const bx = x + (tip[0] - x) * t, by = g + tall * t, bz = z + (tip[2] - z) * t;
    m.tube('timber', [bx, by, bz], [bx + Math.cos(a) * l, by + l * (rnd() - 0.35), bz + Math.sin(a) * l],
      0.075, 0.008, 5, col);
  }
  if (rnd() < 0.42) {
    const a = yaw + 0.9, l = 2 + rnd() * 3;
    m.beam('timber', [x + 0.35, g + 0.08, z + 0.2], [x + Math.cos(a) * l, g + 0.15, z + Math.sin(a) * l], 0.14, 0.12, 0x68615a);
  }
  m.ell('mud', x, g - 0.06, z, 0.75, 0.16, 0.65, seed, 0xaaa6a0, 7, 0.4);
}

function wreck(m, h, x, z, rnd) {
  const g = h(x, z), yaw = rnd() * Math.PI * 2, c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (a, b) => [x + a * c + b * s, z - a * s + b * c];
  // A broken handcart or limber: one wheel on its side, a cracked frame and scattered planks.
  for (const side of [-1, 1]) {
    const a = at(side * 0.85, -1.5), b = at(side * 0.85, 1.4);
    m.beam('timber', [a[0], g + 0.18, a[1]], [b[0], g + 0.32 + side * 0.08, b[1]], 0.14, 0.15, 0x686057);
  }
  for (let i = 0; i < 4; i++) {
    const a = at(-0.9, -1.3 + i * 0.72), b = at(0.9, -1.3 + i * 0.72);
    m.beam('timber', [a[0], g + 0.28, a[1]], [b[0], g + 0.22, b[1]], 0.1, 0.09, 0x625a50);
  }
  const hub = at(1.2, 1.0);
  m.tube('iron', [hub[0], g + 0.12, hub[1]], [hub[0], g + 0.22, hub[1]], 0.14, 0.14, 7, 0x6b6258);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7, r = 0.8;
    m.beam('timber', [hub[0], g + 0.16, hub[1]],
      [hub[0] + Math.cos(a) * r, g + 0.2 + Math.sin(a) * 0.06, hub[1] + Math.sin(a) * r], 0.045, 0.05, 0x6d665b);
  }
  for (let i = 0; i < 5; i++) {
    const q = at((rnd() - 0.5) * 5, (rnd() - 0.5) * 5);
    m.box('timber', q[0], h(q[0], q[1]) + 0.06, q[1], 0.1, 0.09, 1 + rnd() * 1.3, yaw + rnd(), 0x625b50);
  }
}

function tornWire(m, h, x, z, rnd) {
  const a = rnd() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), l = 2.2 + rnd() * 1.6;
  const p0 = [x - c * l, z - s * l], p1 = [x + c * l, z + s * l];
  for (const [px, pz, tilt] of [[...p0, -0.4], [...p1, 0.5]]) {
    const y = h(px, pz);
    m.beam('timber', [px, y - 0.15, pz], [px + s * tilt, y + 1.5, pz - c * tilt], 0.09, 0.09, 0x686158);
  }
  const y0 = h(...p0), y1 = h(...p1);
  m.beam('iron', [p0[0], y0 + 1.05, p0[1]], [x, h(x, z) + 0.25, z], 0.017, 0.017, 0x585756);
  m.beam('iron', [x, h(x, z) + 0.25, z], [p1[0], y1 + 0.85, p1[1]], 0.017, 0.017, 0x585756);
}

export default {
  name: 'scars',
  range: [0, 0],
  init(ctx) {
    const rnd = mulberry32(1917), m = new Mesher(), guns = UNITS.flatMap((u) => piecePlacements(u));
    for (let z = -6800; z <= 6800; z += 67) for (let x = -2200; x <= 6500; x += 67) {
      const xx = x + (rnd() - 0.5) * 50, zz = z + (rnd() - 0.5) * 50;
      const west = LINE(LINES.britishFront, zz), east = LINE(LINES.germanFront, zz), mid = (west + east) * 0.5;
      const d = Math.abs(xx - mid), density = d < 300 ? 0.24 : d < 850 ? 0.03 : d < 1800 ? 0.005 : 0.0005;
      if (rnd() > density) continue;
      if (guns.some((p) => Math.hypot(p.x - xx, p.z - zz) < 38)) continue;
      if (ROADS.some((r) => polylineDistance(r.pts, xx, zz) < 9)) continue;
      if (PLACES.some((p) => p.kind !== 'wood' && Math.hypot(p.pos.x - xx, p.pos.z - zz) < p.r + 15)) continue;
      const t = rnd();
      if (t < 0.7) snag(m, ctx.h, xx, zz, rnd, rnd() * 7);
      else if (t < 0.84) wreck(m, ctx.h, xx, zz, rnd);
      else tornWire(m, ctx.h, xx, zz, rnd);
    }
    const group = new THREE.Group(); group.name = '1917-battlefield-scars';
    m.build(group, ctx.mats);
    this.group = group;
  },
  items() { return null; },
  far() { return this.group; },
  build() {},
};

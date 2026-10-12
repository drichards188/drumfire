import * as THREE from 'three';
import { wireBelts } from './data.js';
import { Mesher, h2, grey } from './mesher.js';
import { worldMats } from './mats.js';

// Barbed wire belts: screw pickets and wooden stakes with strands strung between them in rows, low trip
// wire and concertina coils. Close up it is thin panels of alpha-textured wire; farther out the same
// texture on a flat ribbon over the whole belt averages (by mip) into the grey haze wire makes from a distance.

const TILE = 256;
const key = (i, j) => i + ',' + j;
const PIECE = 6;

let INDEX = null, FAR = null;
const farMeshes = new Map();

function init(ctx) {
  INDEX = new Map();
  FAR = new THREE.Group();
  FAR.name = 'wire-far';
  const farBuild = new Map();
  let id = 0;
  for (const b of wireBelts()) {
    id++;
    const pts = b.pts;
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z);
      if (L < 0.1) continue;
      const n = Math.max(1, Math.round(L / PIECE));
      for (let k = 0; k < n; k++) {
        const a = { x: p.x + (q.x - p.x) * k / n, z: p.z + (q.z - p.z) * k / n }, c = { x: p.x + (q.x - p.x) * (k + 1) / n, z: p.z + (q.z - p.z) * (k + 1) / n };
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
        const kk = key(Math.floor(mx / TILE), Math.floor(mz / TILE));
        const seg = { p: a, q: c, depth: b.depth, id, s: s + L * k / n, side: b.side };
        if (!INDEX.has(kk)) INDEX.set(kk, []);
        INDEX.get(kk).push(seg);
        // the far haze: a flat ribbon over the belt, one quad per piece
        if (!farBuild.has(kk)) farBuild.set(kk, new Mesher());
        const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * b.depth / 2, nz = dx / l * b.depth / 2;
        const ya = ctx.h(a.x, a.z) + 0.9, yc = ctx.h(c.x, c.z) + 0.9;
        farBuild.get(kk).quad('wire', [a.x + nx, ya, a.z + nz], [c.x + nx, yc, c.z + nz], [c.x - nx, yc, c.z - nz], [a.x - nx, ya, a.z - nz], 0xffffff,
          [[seg.s, 0], [seg.s + l, 0], [seg.s + l, b.depth], [seg.s, b.depth]], [0, 1, 0]);
      }
      s += L;
    }
  }
  const mats = worldMats();
  for (const [kk, m] of farBuild) {
    const g = new THREE.Group();
    m.build(g, mats, { shadow: false, receive: false });
    farMeshes.set(kk, g);
    FAR.add(g);
  }
}

// one wire panel standing between two post tops, bottom y0 and height hgt, texture offset by `u0`
function panel(m, a, b, y0a, y0b, hgt, u0) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  m.quad('wire', [a[0], y0a, a[1]], [b[0], y0b, b[1]], [b[0], y0b + hgt, b[1]], [a[0], y0a + hgt, a[1]], 0xffffff, [[u0, 0], [u0 + l, 0], [u0 + l, hgt], [u0, hgt]]);
}

export default {
  name: 'wire',
  range: [420, 420],
  init,
  items(i, j) { return INDEX.get(key(i, j)) || null; },
  far: () => FAR,
  onTile(i, j, lod) {
    const g = farMeshes.get(key(i, j));
    if (g) g.visible = lod < 0;
  },
  build(m, items, i, j, lod, ctx) {
    const h = ctx.h;
    for (const sg of items) {
      const dx = sg.q.x - sg.p.x, dz = sg.q.z - sg.p.z, L = Math.hypot(dx, dz) || 1;
      const d = [dx / L, dz / L], r = [-d[1], d[0]];
      const rows = Math.max(2, Math.round(sg.depth / 3.2));
      const german = sg.side === 'german';
      const posts = [];
      for (let k = 0; k < rows; k++) {
        const o = -sg.depth / 2 + (k + 0.5) * sg.depth / rows;
        const row = [];
        for (let n = 0; n <= 2; n++) {
          const t = n / 2 * L + (k % 2 ? 1.5 : 0);
          const jx = (h2(sg.id, sg.s * 7 + k * 31 + n, 1) - 0.5) * 0.8, jz = (h2(sg.id, sg.s * 7 + k * 31 + n, 2) - 0.5) * 0.8;
          const x = sg.p.x + d[0] * t + r[0] * o + jx, z = sg.p.z + d[1] * t + r[1] * o + jz;
          row.push([x, z]);
        }
        posts.push(row);
      }
      let kk = 0;
      for (const row of posts) {
        for (const pt of row) {
          const y = h(pt[0], pt[1]);
          const hh = 0.95 + h2(pt[0], pt[1], 4) * 0.35, lean = (h2(pt[0], pt[1], 5) - 0.5) * 0.5, lean2 = (h2(pt[0], pt[1], 6) - 0.5) * 0.5;
          const stake = h2(pt[0], pt[1], 7) < (german ? 0.25 : 0.55);
          // iron screw pickets are thin dark rods; wooden stakes squarer and paler
          m.beam(stake ? 'timber' : 'steel', [pt[0], y - 0.1, pt[1]], [pt[0] + lean, y + hh, pt[1] + lean2], stake ? 0.08 : 0.035, stake ? 0.08 : 0.035, stake ? grey(0.75) : 0xffffff);
          if (!stake && lod === 0) m.box('steel', pt[0] + lean, y + hh, pt[1] + lean2, 0.1, 0.012, 0.012, 0, 0xffffff); // the eye at the top
        }
        // along the row: two stacked panels between neighbouring posts, sagging
        for (let n = 0; n < 2; n++) {
          const a = row[n], b = row[n + 1];
          const ya = h(a[0], a[1]), yb = h(b[0], b[1]);
          panel(m, a, b, ya + 0.1, yb + 0.1, 0.9, kk * 3.1 + n * 1.7);
        }
        kk++;
      }
      // diagonal strands joining each row to the next
      for (let k = 0; k < rows - 1; k++) {
        const a = posts[k][1], b = posts[k + 1][(h2(sg.id, sg.s + k, 8) < 0.5) ? 0 : 2];
        panel(m, a, b, h(a[0], a[1]) + 0.15, h(b[0], b[1]) + 0.15, 0.7, k * 2.3);
      }
      // concertina coils lying between rows, now and then
      if (h2(sg.id, sg.s | 0, 9) < 0.35) {
        const o = (h2(sg.id, sg.s | 0, 10) - 0.5) * sg.depth * 0.7, cx = sg.p.x + d[0] * L * 0.5 + r[0] * o, cz = sg.p.z + d[1] * L * 0.5 + r[1] * o;
        const y = h(cx, cz) + 0.02;
        const a = [cx - d[0] * 2.2, y, cz - d[1] * 2.2], b = [cx + d[0] * 2.2, y + 0.05, cz + d[1] * 2.2];
        m.arch('wire', a, b, 0.5, 0xffffff, { seg: 6 });
        m.arch('wire', a, b, 0.35, 0xffffff, { seg: 6 });
      }
    }
  },
};

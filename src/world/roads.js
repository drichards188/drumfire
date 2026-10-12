import { ROADS, smooth, resample } from './data.js';
import { h2, grey, rgbk } from './mesher.js';
import { stump, hessianScreen, pole, wireLine, horse, wagon, crate } from './props.js';

// Roads: pave roads (setts with mud at the edges and shell holes bitten out of them), plank roads, duckboard tracks.
// Beside them: shattered tree stumps (the Menin Road was tree-lined), telephone poles, hessian screens on the
// stretches in view of the enemy, wrecked wagons and a few dead horses (kept to silhouettes).

const TILE = 256;
const key = (i, j) => i + ',' + j;
const PIECE = 8;

let INDEX = null;
function init() {
  INDEX = new Map();
  ROADS.forEach((rd, id) => {
    const line = resample(smooth(rd.pts, 12), PIECE);
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const seg = { a, b, rd, id: id + 1, s: i * PIECE, n: i };
      const k = key(Math.floor((a.x + b.x) / 2 / TILE), Math.floor((a.z + b.z) / 2 / TILE));
      if (!INDEX.has(k)) INDEX.set(k, []);
      INDEX.get(k).push(seg);
    }
  });
}

export default {
  name: 'roads',
  range: [400, 2000],
  init,
  items(i, j) { return INDEX.get(key(i, j)) || null; },
  build(m, items, i, j, lod, ctx) {
    const h = ctx.h;
    for (const sg of items) {
      const { a, b, rd } = sg;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, d = [dx / L, dz / L], r = [-d[1], d[0]];
      const lift = lod ? 0.4 : 0.1;
      const ya = h(a.x, a.z) + lift, yb = h(b.x, b.z) + lift;
      // shell holes in the surface: a piece is bitten out now and then (more toward the front)
      const front = Math.max(0, Math.min(1, (a.x - 500) / 4000));
      if (rd.kind === 'pave' && a.x > 8500) continue; // behind the Germans: the German side's own dressing
      const hole = h2(sg.id, sg.n, 3) < 0.04 + front * 0.12;
      const w = rd.width;
      if (rd.kind === 'pave') {
        m.ribbon('mud', [[a.x, ya - 0.03, a.z], [b.x, yb - 0.03, b.z]], w + 2.4, grey(0.75 + h2(sg.id, sg.n, 4) * 0.2), { u0: sg.s });
        if (!hole) m.ribbon('cobble', [[a.x, ya, a.z], [b.x, yb, b.z]], w, grey(0.8 + h2(sg.id, sg.n, 5) * 0.25), { u0: sg.s });
      } else if (rd.kind === 'plank') {
        m.ribbon('mud', [[a.x, ya - 0.03, a.z], [b.x, yb - 0.03, b.z]], w + 1.6, grey(0.7), { u0: sg.s });
        if (!hole) m.ribbon('plank', [[a.x, ya + 0.02, a.z], [b.x, yb + 0.02, b.z]], w, grey(0.7 + h2(sg.id, sg.n, 6) * 0.3), { u0: sg.s, swap: true });
      } else if (rd.kind === 'duck') {
        // a duckboard walk: a plank strip only a metre wide, so it is not worth drawing from afar
        if (lod === 0) m.ribbon('plank', [[a.x, ya + 0.04, a.z], [b.x, yb + 0.04, b.z]], w, grey(0.75), { u0: sg.s, swap: true });
        continue;
      } else {
        m.ribbon('mud', [[a.x, ya - 0.03, a.z], [b.x, yb - 0.03, b.z]], w, grey(0.7), { u0: sg.s });
        if (lod === 0 && !hole) m.ribbon('plank', [[a.x, ya + 0.02, a.z], [b.x, yb + 0.02, b.z]], 1.3, grey(0.75), { u0: sg.s, swap: true });
      }
      if (lod) continue;
      // roadside furniture
      const side = (k) => (h2(sg.id, sg.n, k) < 0.5 ? 1 : -1);
      if (rd.kind === 'pave' && a.x < 5500) {
        // stumps of the avenue, a pair every other piece
        for (const sd of [-1, 1]) {
          if (h2(sg.id * sd, sg.n, 14) < 0.65) {
            const o = sd * (w / 2 + 2.6 + h2(sg.id, sg.n, 15) * 0.8), t = h2(sg.id, sg.n, 16) * L;
            const x = a.x + d[0] * t + r[0] * o, z = a.z + d[1] * t + r[1] * o;
            stump(m, h, x, z, 1.4 + h2(x, z, 17) * 3.4, 0.22 + h2(x, z, 18) * 0.2, sg.n);
          }
        }
      }
      if (sg.n % 6 === 0 && rd.kind !== 'track') { // telephone pole line on one side
        const o = (w / 2 + 1.6), x = a.x + r[0] * o, z = a.z + r[1] * o;
        pole(m, h, x, z, 6.5, 2, Math.atan2(-d[0], -d[1]) + Math.PI / 2);
      }
      // hessian screens on the stretches the enemy could see
      if (a.x > 1200 && rd.kind !== 'track' && sg.n % 10 < 4) {
        const o = (w / 2 + 2.0) * side(21);
        hessianScreen(m, h, [a.x + r[0] * o, a.z + r[1] * o], [b.x + r[0] * o, b.z + r[1] * o], 2.5);
      }
      // wrecks near the front
      if (a.x > 800 && h2(sg.id, sg.n, 30) < 0.025) {
        const o = side(31) * (w / 2 + 3.5), x = a.x + r[0] * o, z = a.z + r[1] * o;
        wagon(m, h, x, z, Math.atan2(-d[0], -d[1]) + (h2(x, z, 32) - 0.5), { wreck: true });
        horse(m, h, x + d[0] * 5, z + d[1] * 5, h2(x, z, 33) * 6, { dead: true });
        if (h2(x, z, 34) < 0.6) horse(m, h, x + d[0] * 7 + r[0] * 1.5, z + d[1] * 7 + r[1] * 1.5, h2(x, z, 35) * 6, { dead: true });
      }
      // a few ammunition boxes stacked at the verge
      if (h2(sg.id, sg.n, 40) < 0.04) {
        const o = side(41) * (w / 2 + 2), x = a.x + r[0] * o, z = a.z + r[1] * o;
        for (let k = 0; k < 6; k++) crate(m, h, x + (k % 3) * 0.6, z + ((k / 3) | 0) * 0.45, Math.atan2(-d[0], -d[1]), 0.55, 0.35, 0.4);
      }
    }
    void rgbk; void wireLine;
  },
};

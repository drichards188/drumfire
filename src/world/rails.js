import { LIGHT_RAILS, SPUR, MAIN, smooth, resample } from './data.js';
import { h2, grey } from './mesher.js';

// Railways: the 60 cm light railway (Decauville) that brings shells to the 15-inch and 9.2-inch positions and the
// standard-gauge spur the railway gun stands on (RAIL_SPUR): ballast, sleepers, rails, buffer stops.

const TILE = 256;
const key = (i, j) => i + ',' + j;
const PIECE = 3;

let INDEX = null;
function init() {
  INDEX = new Map();
  const lay = (pts, std, id) => {
    const line = resample(smooth(pts, 12), PIECE);
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const seg = { a, b, std, id, s: i * PIECE, end: i === 0 ? -1 : i === line.length - 2 ? 1 : 0 };
      const k = key(Math.floor((a.x + b.x) / 2 / TILE), Math.floor((a.z + b.z) / 2 / TILE));
      if (!INDEX.has(k)) INDEX.set(k, []);
      INDEX.get(k).push(seg);
    }
  };
  LIGHT_RAILS.forEach((r, i) => lay(r.pts, false, i + 1));
  lay(MAIN, true, 98);
  lay(SPUR, true, 99);
}

export default {
  name: 'rails',
  range: [380, 2200],
  init,
  items(i, j) { return INDEX.get(key(i, j)) || null; },
  build(m, items, i, j, lod, ctx) {
    const h = ctx.h;
    for (const sg of items) {
      const { a, b, std } = sg;
      // the 18-inch car (21 m) stands on this track and rolls back 6 m along it when the gun fires: near the gun
      // the bed is sunk so that the rail head is at ground level, where the rig's wheels run, and it stays
      // clear of everything (no beams, no buffers) for 24 m either way, then rises back to the ordinary bed
      const dm = std ? Math.hypot((a.x + b.x) / 2 + 3200, (a.z + b.z) / 2 - 300) : 99;
      const drop = dm < 42 ? 0.7 * (1 - Math.min(1, Math.max(0, (dm - 24) / 18))) : 0;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, d = [dx / L, dz / L], r = [-d[1], d[0]];
      const gauge = std ? 1.435 : 0.6, bedW = std ? 3.6 : 1.5;
      const lift = lod ? 0.35 : 0.1;
      const ya = h(a.x, a.z), yb = h(b.x, b.z);
      if (std) {
        // a low ballast bank, sunk a little so it sits on whatever the ground does
        m.slope('ballast', [a.x, ya - 0.2, a.z], [b.x, yb - 0.2, b.z], 5.2, 3.5, 0.5 + (lod ? 0.2 : 0) - drop * 0.5);
      } else {
        m.ribbon('ballast', [[a.x, ya + lift, a.z], [b.x, yb + lift, b.z]], bedW, grey(0.9));
      }
      const top = std ? 0.52 - drop : lift;
      for (const s of [-1, 1]) {
        const o = s * gauge / 2;
        m.ribbon('steel', [[a.x + r[0] * o, ya + top + (std ? 0.18 : 0.06), a.z + r[1] * o], [b.x + r[0] * o, yb + top + (std ? 0.18 : 0.06), b.z + r[1] * o]], std ? 0.11 : 0.06, 0xffffff);
      }
      if (lod) continue;
      // sleepers
      const n = std ? 4 : 4;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n * L, x = a.x + d[0] * t, z = a.z + d[1] * t, y = h(x, z);
        const yaw = Math.atan2(-d[0], -d[1]);
        if (std) m.box('timber', x, y + top + 0.08, z, 2.6, 0.14, 0.26, yaw + Math.PI / 2 * 0 + 0, grey(0.55 + h2(x, z, 1) * 0.25), { u0: k });
        else m.box('steel', x, y + top + 0.04, z, 0.95, 0.06, 0.12, yaw + Math.PI / 2 * 0, 0xffffff);
      }
      // rails sit on the sleepers: lift them a touch
      if (sg.end) {
        // buffer stop: two baulks across the line and a pair of uprights
        const e = sg.end < 0 ? a : b, y = h(e.x, e.z), yaw = Math.atan2(-d[0], -d[1]);
        m.box('timber', e.x, y + top + 0.55, e.z, std ? 2.8 : 1.2, 0.3, 0.3, yaw + Math.PI / 2 * 0, grey(0.6));
        for (const s of [-1, 1]) m.box('timber', e.x + r[0] * s * (std ? 1.1 : 0.45), y + top + 0.35, e.z + r[1] * s * (std ? 1.1 : 0.45), 0.25, 0.9, 0.25, yaw, grey(0.55));
      }
    }
  },
};

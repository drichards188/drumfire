import { trenches, TRENCH } from './data.js';
import { h2, grey, rgbk } from './mesher.js';

// Trench walls, fire steps, duckboards, sandbag parapets and parados, dugout doors, ladders and elephant-iron
// shelters, built per tile along the trench polylines. British trenches are patched and sagging, German ones
// orderly (timber-framed, plank-floored, even parapets).

export const TILE = 256;
const key = (i, j) => i + ',' + j;
const HW = TRENCH.half;

let INDEX = null;

// split the polylines into segments of at most 8 m, remember run info (style changes every ~30 m)
function init() {
  INDEX = new Map();
  let id = 0;
  for (const t of trenches()) {
    id++;
    let s = 0;
    const german = t.side === 'german';
    for (let i = 0; i < t.pts.length - 1; i++) {
      const a = t.pts[i], b = t.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.05) continue;
      const n = Math.ceil(L / 8);
      for (let k = 0; k < n; k++) {
        const p = { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }, q = { x: a.x + (b.x - a.x) * (k + 1) / n, z: a.z + (b.z - a.z) * (k + 1) / n };
        const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
        const run = Math.floor((s + (L * k) / n) / 28);
        const r = h2(id, run, 3);
        // wall style: 0 sandbag, 1 iron, 2 wattle, 3 timber, 4 clay
        const style = german ? (r < 0.5 ? 3 : r < 0.8 ? 0 : 1) : (r < 0.35 ? 0 : r < 0.55 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 3 : 4);
        const seg = {
          p, q, side: t.side, kind: t.kind, style, id, run, s: s + (L * k) / n, len: L / n,
          wet: h2(id, run, 9) < (t.kind === 'comm' ? 0.28 : 0.18), boards: h2(id, run, 11) < (german ? 0.95 : 0.7),
        };
        const kk = key(Math.floor(mx / TILE), Math.floor(mz / TILE));
        if (!INDEX.has(kk)) INDEX.set(kk, []);
        INDEX.get(kk).push(seg);
      }
      s += L;
    }
  }
}

export default {
  name: 'trench',
  range: [420, 1500],
  init() { init(); },
  items(i, j) { return INDEX.get(key(i, j)) || null; },
  build(m, items, i, j, lod, ctx) {
    const h = ctx.h;
    for (const sg of items) segment(m, sg, lod, h);
  },
};

const WALL = ['sandbag', 'iron', 'wattle', 'timber', 'mud'];
const WALL_TILE = [[0.9, 0.84], [0.304, 1], [0.8, 0.8], [1, 1], [3, 3]];

function segment(m, sg, lod, h) {
  const { p, q } = sg;
  const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
  const d = { x: dx / L, z: dz / L };
  const r = { x: -d.z, z: d.x }; // right-hand side (east when heading north)
  const german = sg.side === 'german';
  // the side facing the enemy (British look east, Germans west); steps across the line have none
  const fs = Math.abs(r.x) > 0.5 ? Math.sign(r.x) * (german ? -1 : 1) : 0;
  const fp = (pt, o) => [pt.x + r.x * o, 0, pt.z + r.z * o];
  const yA = h(p.x, p.z), yB = h(q.x, q.z);
  // natural ground beside the trench, to hold the wall tops and parapet bases
  const gR = [h(p.x + r.x * 2.4, p.z + r.z * 2.4), h(q.x + r.x * 2.4, q.z + r.z * 2.4)];
  const gL = [h(p.x - r.x * 2.4, p.z - r.z * 2.4), h(q.x - r.x * 2.4, q.z - r.z * 2.4)];
  const cut = Math.min(gR[0], gL[0]) - yA;
  const fl = cut > 0.8 ? [yA, yB] : [Math.min(gR[0], gL[0]) - TRENCH.depth, Math.min(gR[1], gL[1]) - TRENCH.depth];
  const tone = 0.82 + h2(sg.id, sg.s | 0, 5) * 0.25;
  const wm = WALL[sg.style], wt = WALL_TILE[sg.style];
  void wt;
  const col = german ? rgbk(tone * 0.92, tone * 0.95, tone * 0.9) : grey(tone);

  // revetted walls, inner faces
  for (const sd of [1, -1]) {
    const g = sd > 0 ? gR : gL;
    const A = fp(p, sd * HW), B = fp(q, sd * HW);
    const tA = g[0] + 0.05, tB = g[1] + 0.05;
    const va = tA - fl[0], vb = tB - fl[1];
    const uv = [[sg.s, 0], [sg.s + L, 0], [sg.s + L, vb], [sg.s, va]];
    const a0 = [A[0], fl[0], A[2]], b0 = [B[0], fl[1], B[2]], a1 = [A[0], tA, A[2]], b1 = [B[0], tB, B[2]];
    if (sd > 0) m.quad(wm, b0, a0, a1, b1, col, [uv[1], uv[0], [sg.s, va], [sg.s + L, vb]]);
    else m.quad(wm, a0, b0, b1, a1, col, uv);
  }

  // parapet toward the enemy, parados behind
  if (fs) {
    const g = fs > 0 ? gR : gL;
    const off = fs * (HW + 0.78);
    const pa = fp(p, off), pb = fp(q, off);
    pa[1] = g[0] - 0.15; pb[1] = g[1] - 0.15;
    const big = sg.kind === 'fire' ? 0.75 : 0.55;
    const slump = h2(sg.id, sg.s | 0, 21) < (german ? 0.03 : 0.1) ? 0.45 : 1;
    m.slope(slump < 1 ? 'rubble' : 'sandbag', pa, pb, 1.8, 0.9, big * slump + 0.15, col);
    const off2 = -fs * (HW + 1.1);
    const qa = fp(p, off2), qb = fp(q, off2);
    const g2 = fs > 0 ? gL : gR;
    qa[1] = g2[0] - 0.12; qb[1] = g2[1] - 0.12;
    m.slope('earth', qa, qb, 2.8, 1.4, 0.55, grey(tone * 0.85));
  } else {
    // the step across the line: a block of earth either side keeps the corner closed
    for (const sd of [1, -1]) {
      const g = sd > 0 ? gR : gL;
      const pa = fp(p, sd * (HW + 0.7)), pb = fp(q, sd * (HW + 0.7));
      pa[1] = g[0] - 0.12; pb[1] = g[1] - 0.12;
      m.slope('earth', pa, pb, 1.6, 0.8, 0.5, grey(tone * 0.9));
    }
  }

  // floor: duckboards or standing water
  const cx = (p.x + q.x) / 2, cz = (p.z + q.z) / 2;
  if (sg.wet) {
    m.ribbon('water', [[p.x, fl[0] + 0.32, p.z], [q.x, fl[1] + 0.32, q.z]], HW * 2 + 0.05, 0xffffff);
  } else if (sg.boards && sg.kind !== 'reserve') {
    m.ribbon('plank', [[p.x, fl[0] + 0.05, p.z], [q.x, fl[1] + 0.05, q.z]], 0.8, grey(0.75 + h2(sg.id, sg.s | 0, 7) * 0.3), { vScale: 1, u0: sg.s, swap: true });
  }
  if (lod > 0) return;

  // lod 0 detail
  // fire step along the parapet side of fire and support trenches
  if (fs && sg.kind !== 'comm') {
    const o = fs * (HW - 0.28);
    m.beam('timber', [p.x + r.x * o, fl[0] + 0.22, p.z + r.z * o], [q.x + r.x * o, fl[1] + 0.22, q.z + r.z * o], 0.56, 0.44, grey(0.8), { u0: sg.s });
  }
  // revetment posts every 2.4 m on timber and iron faces
  if (sg.style === 1 || sg.style === 3) {
    const n = Math.max(1, Math.round(L / 2.4));
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = p.x + dx * t, pz = p.z + dz * t, y0 = fl[0] + (fl[1] - fl[0]) * t;
      for (const sd of [1, -1]) {
        const g = sd > 0 ? gR : gL, top = g[0] + (g[1] - g[0]) * t + 0.3;
        m.box('timber', px + r.x * sd * (HW - 0.06), (y0 + top) / 2, pz + r.z * sd * (HW - 0.06), 0.13, top - y0, 0.13, Math.atan2(-d.x, -d.z), grey(0.7));
      }
    }
  }
  // sandbag courses stand proud of the wall face a little: a row of capping bags on the wall tops
  // dugout door on the rear wall of support and reserve trenches
  if (fs && (sg.kind === 'support' || sg.kind === 'reserve') && h2(sg.id, sg.s | 0, 33) < 0.07 && L > 3) {
    const o = -fs * (HW - 0.02), ax = (p.x + q.x) / 2 + r.x * o, az = (p.z + q.z) / 2 + r.z * o;
    const ang = Math.atan2(-d.z, d.x), y0 = (fl[0] + fl[1]) / 2; // box x along the wall
    m.box('dark', ax, y0 + 0.8, az, 1.0, 1.6, 0.25, ang, 0xffffff);
    for (const sd of [-0.62, 0.62]) m.box('timber', ax + d.x * sd, y0 + 0.85, az + d.z * sd, 0.16, 1.7, 0.3, ang, grey(0.8));
    m.box('timber', ax, y0 + 1.72, az, 1.5, 0.16, 0.3, ang, grey(0.8));
  }
  // ladders against the front wall of fire trenches
  if (fs && sg.kind === 'fire' && h2(sg.id, sg.s | 0, 41) < 0.12) {
    const o = fs * (HW - 0.12), px = cx + r.x * o, pz = cz + r.z * o;
    const top = (fs > 0 ? gR[0] : gL[0]) + 0.5, y0 = fl[0];
    const lean = fs * 0.12;
    for (const sd of [-0.22, 0.22]) m.beam('timber', [px + d.x * sd, y0, pz + d.z * sd], [px + d.x * sd + r.x * lean, top, pz + d.z * sd + r.z * lean], 0.06, 0.04, grey(0.75));
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      m.box('timber', px + r.x * lean * t, y0 + (top - y0) * t, pz + r.z * lean * t, 0.5, 0.035, 0.04, Math.atan2(-d.z, d.x), grey(0.7));
    }
  }
  // elephant iron: a corrugated arch over a stretch of support trench, sandbagged over
  if ((sg.kind === 'support' || sg.kind === 'comm') && sg.len > 3 && h2(sg.id, sg.run, 51) < 0.1 && ((sg.s / 6) | 0) % 2 === 0) {
    const a = [p.x, Math.max(gR[0], gL[0]) - 0.6, p.z], b = [q.x, Math.max(gR[1], gL[1]) - 0.6, q.z];
    m.arch('iron', a, b, 1.3, grey(0.9), { seg: 7 });
    m.slope('sandbag', [a[0], a[1] + 0.9, a[2]], [b[0], b[1] + 0.9, b[2]], 2.4, 1.0, 0.6, grey(0.9));
  }
  // an ammunition box or a lantern post here and there
  if (h2(sg.id, sg.s | 0, 61) < 0.08) {
    const o = (h2(sg.id, sg.s | 0, 62) < 0.5 ? 1 : -1) * (HW - 0.3);
    m.box('timber', cx + r.x * o, fl[0] + 0.2, cz + r.z * o, 0.5, 0.35, 0.32, Math.atan2(-d.x, -d.z), grey(0.8));
  }
}

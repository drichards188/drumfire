// The artillery board: a trench map of the salient on linen-backed paper. The sheet grid (lettered
// 6000-yard squares, numbered 1000-yard squares), British trenches blue and German red, woods and
// villages, then the live picture: the battery's arc and range rings, the line to the ordered point,
// the known targets, the fall of shot as numbered crosses, shells in flight, the SOS lines.
// Static map layers are cached in an offscreen canvas and redrawn only when the view moves.
import {
  SHEET, LINES, SECTORS, PLACES, RAIL_SPUR, GROUND, YARD, DEG, bearingOf, gridRef, toGrid, fromGrid,
} from '../sector.js';
import { el, hw, snd, setText, Btn } from './widgets.js';
import { dm, yd, SOS_X, KINDS, liveMissions } from './consoles/common.js';
import { TH, lenU, lenShort } from './theatre.js';

// the WW2 kinds drawn with the British map symbols
const SYM = { abattery: 'battery', amedium: 'battery', sbattery: 'battery', adump: 'dump', aconvoy: 'crossroads', aop: 'balloon', turret: 'mebu', fort: 'mebu', magazine: 'mebu', citadel: 'mebu', gate: 'mebu', eastfort: 'mebu', tanks: 'tanks' };

const TAU = Math.PI * 2;
const SERIF = "'Bitstream Charter','Liberation Serif','DejaVu Serif',Georgia,serif";
const TYPE = "'Courier 10 Pitch','Liberation Mono','FreeMono',monospace";
const INK = '#1b1913', BLUE = '#1d3f8f', RED = '#a8241b', GREEN = '#506b34', BRASS = '#9a7421';
const MPP_MIN = 1.4;
const MPP_MAX_ = 60; // the British sheet; a WW2 operation may spread wider (TH.mppMax)
const mppMax = () => TH.mppMax ?? MPP_MAX_;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

const tableCache = new Map();
function table(sim, kind, charge) {
  const k = `${kind}:${charge}`;
  let t = tableCache.get(k);
  if (!t) { try { t = sim.rangeTable(kind, charge) || []; } catch (e) { t = []; } if (t.length) tableCache.set(k, t); }
  return t;
}
export function rangeSpan(sim, kind, charge) {
  const t = table(sim, kind, charge);
  return t.length ? { min: t[0].range, max: t[t.length - 1].range } : { min: 0, max: 0 };
}

// the farthest a unit's guns reach, with any of its charges (the leFH 18 has six)
export const maxReach = (sim, unit) => Math.max(0, ...Array.from({ length: Math.max(1, unit.charges || 4) }, (_, c) => rangeSpan(sim, unit.kind, c).max));
// The board's FIT on a battery's reach: the unit (700 m behind it) and as far along its zero line as its guns reach
// with their biggest charge, or to the furthest target on the map past it for a very long gun; across, half that or
// 8 km at least. { cx, cz, w, h } for a theatre's TH.fit (the British fit, below, does the same along x)
export function reachFit(sim, unit) {
  const reach = maxReach(sim, unit) || 11000;
  const b = unit.zero ?? 0, ux = Math.sin(b), uz = -Math.cos(b);
  let far = 0;
  for (const t of sim.targets) if (!t.offmap) far = Math.max(far, (t.pos.x - unit.pos.x) * ux + (t.pos.z - unit.pos.z) * uz);
  const len = Math.min(reach * 1.02, far + 1500), half = Math.max(4000, len * 0.28);
  // the oriented box's corners, and their bounds
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const a of [-700, len]) for (const c of [-half, half]) {
    const x = unit.pos.x + ux * a - uz * c, z = unit.pos.z + uz * a + ux * c;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, h: z1 - z0 };
}

// aged paper, made once: specks and fibres over a warm base
let paperTex = null;
function paper() {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e4d9b8';
  g.fillRect(0, 0, 256, 256);
  const r = rnd(7);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${90 + r() * 40 | 0},${70 + r() * 30 | 0},${40 | 0},${0.03 + r() * 0.07})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(255,250,225,${0.08 + r() * 0.12})`;
    g.lineWidth = 0.6;
    g.beginPath();
    const x = r() * 256, y = r() * 256, a = r() * TAU, l = 4 + r() * 10;
    g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  paperTex = c;
  return c;
}

export class Board {
  constructor({ memo, onLay, onTarget, mpp }) {
    this.memo = memo;
    this.onLay = onLay;
    this.onTarget = onTarget;
    this.el = el('div', 'board');
    this.cv = el('canvas', 'bcv');
    this.g = this.cv.getContext('2d');
    this.layer = document.createElement('canvas');
    this.lg = this.layer.getContext('2d');
    this.bar = el('div', 'bbar');
    this.refEl = el('span', 'bref', '');
    this.hint = el('span', 'bhint', TH.boardHint ?? 'click: lay the guns here   click a target: take its mission   drag: pan   wheel: zoom');
    this.bar.append(this.refEl, this.hint);
    const tools = el('div', 'btools');
    const mk = (t, tip, fn) => { const b = new Btn({ main: t, cls: 'mini', onClick: fn, tip }); tools.append(b.el); return b; };
    mk('+', 'Zoom in', () => this.zoom(1 / 1.4));
    mk('−', 'Zoom out', () => this.zoom(1.4));
    mk('FIT', TH.fitTip ?? 'Fit the battery, its range and the front', () => this.fit());
    mk('GUN', 'Centre on the battery', () => this.centre('unit'));
    mk('AIM', TH.aimTip ?? 'Centre on the ordered point', () => this.centre('aim'));
    this.el.append(this.cv, tools, this.bar);
    this.W = 0; this.H = 0; this.dpr = 1;
    this.view = memo.view || null;
    this.key = '';
    this.hover = null;
    this.sprites = new Map();
    this.last = { sim: null, unit: null };
    this._wire();
  }

  // ----- view -----------------------------------------------------------------------------------
  resize() {
    const r = this.cv.getBoundingClientRect();
    const cw = this.cv.clientWidth, ch = this.cv.clientHeight;
    if (!cw || !ch) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (hw.scale || 1);
    if (cw !== this.W || ch !== this.H || Math.abs(dpr - this.dpr) > 0.01) {
      this.W = cw; this.H = ch; this.dpr = dpr;
      for (const c of [this.cv, this.layer]) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      this.key = '';
    }
    return true;
  }

  fit() {
    const { sim, unit } = this.last;
    if (!unit || !this.W) return;
    if (TH.fit) {
      const f = TH.fit(sim, unit);
      this.view = { cx: f.cx, cz: f.cz, mpp: Math.max(MPP_MIN, Math.min(mppMax(), Math.max(f.w / this.W, f.h / this.H) * 1.08)) };
      this.memo.view = this.view;
      return;
    }
    const cfg = KINDS[unit.kind] || {};
    const reach = maxReach(sim, unit) || 11000;
    const x0 = Math.min(unit.pos.x - 700, 2600), x1 = Math.min(unit.pos.x + reach * 1.02, cfg.deep ? 18500 : 14000);
    const zc = Math.max(-1500, Math.min(1500, unit.pos.z * 0.35));
    const mpp = Math.max(MPP_MIN, Math.min(mppMax(), Math.max((x1 - x0) / this.W, 8000 / this.H) * 1.04));
    this.view = { cx: (x0 + x1) / 2, cz: zc, mpp };
    this.memo.view = this.view;
  }
  zoom(f, px, py) {
    const v = this.view;
    if (!v) return;
    const m = Math.max(MPP_MIN, Math.min(mppMax(), v.mpp * f));
    if (px != null) {
      // keep the world point under the cursor still
      const wx = v.cx + (px - this.W / 2) * v.mpp, wz = v.cz + (py - this.H / 2) * v.mpp;
      v.cx = wx - (px - this.W / 2) * m; v.cz = wz - (py - this.H / 2) * m;
    }
    v.mpp = m;
  }
  centre(what) {
    const { unit } = this.last;
    if (!unit || !this.view) return;
    const p = what === 'aim' ? (unit.order && (unit.order.target || unit.order)) : unit.pos;
    if (p && p.x != null) { this.view.cx = p.x; this.view.cz = p.z; }
  }
  sx(x) { return this.W / 2 + (x - this.view.cx) / this.view.mpp; }
  sz(z) { return this.H / 2 + (z - this.view.cz) / this.view.mpp; }
  wx(px) { return this.view.cx + (px - this.W / 2) * this.view.mpp; }
  wz(py) { return this.view.cz + (py - this.H / 2) * this.view.mpp; }

  _wire() {
    const cv = this.cv;
    let drag = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) * (this.W / r.width), (e.clientY - r.top) * (this.H / r.height)];
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.view || e.button > 1) return;
      const [x, y] = pos(e);
      drag = { x, y, cx: this.view.cx, cz: this.view.cz, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.view) return;
      const [x, y] = pos(e);
      this.hover = { px: x, py: y };
      if (drag) {
        const dx = x - drag.x, dy = y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
        if (drag.moved) { this.view.cx = drag.cx - dx * this.view.mpp; this.view.cz = drag.cz - dy * this.view.mpp; cv.classList.add('drag'); }
      }
    });
    const end = (e) => {
      cv.classList.remove('drag');
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.moved || e.type === 'pointercancel' || !this.view) return;
      const [x, y] = pos(e);
      const t = this.pickTarget(x, y);
      snd('click');
      if (t) this.onTarget(t);
      else this.onLay(this.wx(x), this.wz(y));
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { this.hover = null; });
    cv.addEventListener('wheel', (e) => {
      if (!this.view) return;
      e.preventDefault();
      const [x, y] = pos(e);
      this.zoom(e.deltaY > 0 ? 1.18 : 1 / 1.18, x, y);
    }, { passive: false });
  }

  pickTarget(px, py) {
    const sim = this.last.sim;
    if (!sim) return null;
    let best = null, bd = 16;
    for (const t of sim.targets || []) {
      if (!t.known || t.alive === false) continue;
      const d = Math.hypot(this.sx(t.pos.x) - px, this.sz(t.pos.z) - py);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // ----- static layer: paper, ground, grid, trenches ---------------------------------------------
  drawStatic() {
    const g = this.lg, v = this.view, W = this.W, H = this.H, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = g.createPattern(paper(), 'repeat');
    g.fillRect(0, 0, W, H);
    const px = 1 / v.mpp;                       // pixels per metre
    const x0 = this.wx(0), x1 = this.wx(W), z0 = this.wz(0), z1 = this.wz(H);

    if (!TH.salient) {
      this.drawGrid(g, x0, x1, z0, z1);
      return;
    }
    // contours of the ridges on the German side
    g.lineWidth = 0.8;
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = `rgba(150,110,60,${k % 3 === 0 ? 0.55 : 0.3})`;
      g.beginPath();
      for (let z = z0 - 400; z <= z1 + 400; z += 160) {
        const x = GROUND.ridgeX - 2600 + k * 560 + 320 * Math.sin(z / 1300 + k * 0.9) + 150 * Math.sin(z / 380 + k * 2);
        const X = this.sx(x), Z = this.sz(z);
        if (z === z0 - 400 || (z - (z0 - 400)) < 1) g.moveTo(X, Z); else g.lineTo(X, Z);
      }
      g.stroke();
    }

    // woods: pale green blobs with tree dots
    for (const p of PLACES) if (p.kind === 'wood') {
      const R = p.r * px, cx = this.sx(p.pos.x), cz = this.sz(p.pos.z);
      if (cx + R * 1.3 < 0 || cx - R * 1.3 > W || cz + R * 1.3 < 0 || cz - R * 1.3 > H) continue;
      const r = rnd(hash(p.name));
      const pts = [];
      for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, k = 0.78 + r() * 0.4; pts.push([cx + Math.cos(a) * R * k * 1.15, cz + Math.sin(a) * R * k * 0.85]); }
      g.beginPath();
      pts.forEach((q, i) => { const n = pts[(i + 1) % pts.length]; const mx = (q[0] + n[0]) / 2, my = (q[1] + n[1]) / 2; if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(q[0], q[1], mx, my); });
      g.closePath();
      g.fillStyle = 'rgba(150,176,112,.55)'; g.fill();
      g.strokeStyle = 'rgba(70,100,45,.8)'; g.lineWidth = 1; g.stroke();
      if (R > 14) {
        g.fillStyle = 'rgba(70,100,45,.55)';
        const n = Math.min(160, Math.floor(R * R / 90));
        for (let i = 0; i < n; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * R * 0.8; g.beginPath(); g.arc(cx + Math.cos(a) * rr * 1.1, cz + Math.sin(a) * rr * 0.8, 1.2, 0, TAU); g.fill(); }
      }
    }

    // roads (schematic): the Menin road and the Zonnebeke road
    const road = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => { const X = this.sx(p[0]), Z = this.sz(p[1]); if (i === 0) g.moveTo(X, Z); else g.lineTo(X, Z); });
      g.strokeStyle = 'rgba(80,58,30,.8)'; g.lineWidth = Math.max(1.2, 9 * px + 1.4); g.stroke();
      g.strokeStyle = 'rgba(232,222,190,1)'; g.lineWidth = Math.max(0.4, 9 * px - 0.4); g.stroke();
    };
    road([[-2000, 2600], [1500, 300], [3300, 1500], [5000, 3000], [6800, 4800]]);
    road([[-2000, 2600], [-300, -1700], [1700, -3200], [4700, -3900], [6900, -1000], [9800, -5200]]);

    // railway spur: line with sleepers
    g.beginPath();
    RAIL_SPUR.forEach((p, i) => { const X = this.sx(p.x), Z = this.sz(p.z); if (i === 0) g.moveTo(X, Z); else g.lineTo(X, Z); });
    g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
    g.lineWidth = 1;
    for (let i = 0; i < RAIL_SPUR.length - 1; i++) {
      const a = RAIL_SPUR[i], b = RAIL_SPUR[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z) * px, n = Math.floor(L / 7);
      const nx = (b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z), nz = -(b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z);
      for (let j = 0; j < n; j++) {
        const t = j / n, X = this.sx(a.x + (b.x - a.x) * t), Z = this.sz(a.z + (b.z - a.z) * t);
        g.beginPath(); g.moveTo(X - nx * 2.6, Z + nz * 2.6); g.lineTo(X + nx * 2.6, Z - nz * 2.6); g.stroke();
      }
    }

    // grid
    this.drawGrid(g, x0, x1, z0, z1);

    // built-up areas
    for (const p of PLACES) if (p.kind !== 'wood') {
      const R = p.r * px, cx = this.sx(p.pos.x), cz = this.sz(p.pos.z);
      if (cx + R * 2 < 0 || cx - R * 2 > W || cz + R * 2 < 0 || cz - R * 2 > H) continue;
      const r = rnd(hash(p.name));
      if (p.kind === 'crossroads') {
        g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cz, 4, 0, TAU); g.stroke();
      } else {
        const n = p.kind === 'town' ? 60 : 16, S = Math.max(2.2, Math.min(7, R * 0.09 + 1.5));
        g.fillStyle = 'rgba(40,32,26,.78)';
        for (let i = 0; i < n; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * Math.max(R, 7); g.save(); g.translate(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.8); g.rotate(r() * 1.2); g.fillRect(-S, -S * 0.6, S * 2, S * 1.2); g.restore(); }
      }
    }
    // trenches
    this.drawTrenches(g, z0, z1);
    // names last, over everything static
    for (const p of PLACES) {
      const R = p.r * px, cx = this.sx(p.pos.x), cz = this.sz(p.pos.z);
      if (cx < -100 || cx > W + 100 || cz < -50 || cz > H + 50) continue;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (p.kind === 'town') { g.font = `${Math.round(12 + Math.min(R, 40) * 0.12)}px ${SERIF}`; g.fillStyle = INK; this.spaced(g, 'YPRES', cx, cz - Math.max(R, 10) * 0.8 - 8, 3); }
      else if (p.kind === 'wood') { g.font = `italic ${Math.round(Math.max(10, Math.min(15, 9 + R * 0.04)))}px ${SERIF}`; g.fillStyle = GREEN; this.halo(g, p.name, cx, cz); }
      else if (p.kind === 'crossroads') { g.font = `italic 10px ${SERIF}`; g.fillStyle = INK; this.halo(g, p.name, cx, cz - 11); }
      else { g.font = `italic 11px ${SERIF}`; g.fillStyle = INK; this.halo(g, p.name, cx, cz + Math.max(R, 8) * 0.7 + 9); }
    }
  }

  halo(g, t, x, y) {
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(232,222,190,.85)'; g.lineWidth = 3; g.strokeText(t, x, y);
    g.fillText(t, x, y);
  }
  spaced(g, t, x, y, sp) {
    let w = 0;
    for (const c of t) w += g.measureText(c).width + sp;
    w -= sp;
    let cx = x - w / 2;
    g.textAlign = 'left';
    for (const c of t) { this.halo(g, c, cx, y); cx += g.measureText(c).width + sp; }
    g.textAlign = 'center';
  }

  drawGrid(g, x0, x1, z0, z1) {
    const v = this.view;
    if (TH.metric) return this.drawGridM(g, x0, x1, z0, z1);
    const e0 = toGrid(x0, z0).e, e1 = toGrid(x1, z0).e;
    const nTop = toGrid(x0, z0).n, nBot = toGrid(x0, z1).n;
    const sq = 1000 * YARD / v.mpp;             // pixels per 1000-yard square
    const fe = (e) => this.sx(fromGrid(e, 0).x), fn = (n) => this.sz(fromGrid(0, n).z);
    g.lineCap = 'butt';
    // thin lines every 1000 yards (every 500 when zoomed in), thick on the 6000-yard sheet edges
    const stepFor = sq > 170 ? 500 : 1000;
    for (let e = Math.floor(e0 / stepFor) * stepFor; e <= e1; e += stepFor) {
      const big = e % SHEET.big === 0, kilo = e % 1000 === 0;
      g.strokeStyle = big ? 'rgba(25,55,110,.85)' : kilo ? 'rgba(40,80,140,.42)' : 'rgba(40,80,140,.2)';
      g.lineWidth = big ? 1.7 : 0.8;
      g.beginPath(); g.moveTo(fe(e), 0); g.lineTo(fe(e), this.H); g.stroke();
    }
    for (let n = Math.floor(nBot / stepFor) * stepFor; n <= nTop; n += stepFor) {
      const big = n % SHEET.big === 0, kilo = n % 1000 === 0;
      g.strokeStyle = big ? 'rgba(25,55,110,.85)' : kilo ? 'rgba(40,80,140,.42)' : 'rgba(40,80,140,.2)';
      g.lineWidth = big ? 1.7 : 0.8;
      g.beginPath(); g.moveTo(0, fn(n)); g.lineTo(this.W, fn(n)); g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // the big square letters, faint and huge
    const LET = 'ABCDEFGHIJKLMNOPQRSTUVWX';
    for (let c = 0; c < SHEET.cols; c++) for (let r = 0; r < SHEET.rows; r++) {
      const ce = c * SHEET.big + SHEET.big / 2, cn = (SHEET.rows - 1 - r) * SHEET.big + SHEET.big / 2;
      const X = fe(ce), Z = fn(cn), S = SHEET.big * YARD / v.mpp;
      if (X < -S || X > this.W + S || Z < -S || Z > this.H + S) continue;
      g.font = `${Math.round(Math.min(S * 0.55, 400))}px ${SERIF}`;
      g.fillStyle = 'rgba(30,70,130,.11)';
      g.fillText(LET[r * SHEET.cols + c], X, Z);
    }
    // square numbers
    if (sq > 34) {
      g.font = `italic ${Math.round(Math.min(sq * 0.34, 46))}px ${SERIF}`;
      g.fillStyle = `rgba(30,70,130,${sq > 60 ? 0.3 : 0.22})`;
      for (let c = 0; c < SHEET.cols; c++) for (let r = 0; r < SHEET.rows; r++) for (let i = 0; i < 36; i++) {
        const sc = i % 6, sr = Math.floor(i / 6);
        const e = c * SHEET.big + sc * 1000 + 500, n = (SHEET.rows - 1 - r) * SHEET.big + (5 - sr) * 1000 + 500;
        const X = fe(e), Z = fn(n);
        if (X < -sq || X > this.W + sq || Z < -sq || Z > this.H + sq) continue;
        g.fillText(String(i + 1), X, Z);
      }
    }
    // quarters a b c d at high zoom
    if (sq > 260) {
      g.font = `italic ${Math.round(sq * 0.12)}px ${SERIF}`;
      g.fillStyle = 'rgba(30,70,130,.35)';
      for (let e = Math.floor(e0 / 1000) * 1000; e <= e1; e += 1000) for (let n = Math.floor(nBot / 1000) * 1000; n <= nTop; n += 1000) {
        const q = [['a', 250, 750], ['b', 750, 750], ['c', 250, 250], ['d', 750, 250]];
        for (const [l, de, dn] of q) g.fillText(l, fe(e + de), fn(n + dn));
      }
    }
  }

  // the German grid: a line every kilometre (every 500 m zoomed in), numbered by the kilometres of the reference
  drawGridM(g, x0, x1, z0, z1) {
    const v = this.view, sq = 1000 / v.mpp, step = sq > 170 ? 500 : sq < 6 ? 10000 : sq < 30 ? 5000 : 1000;
    g.lineCap = 'butt';
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const kilo = x % 1000 === 0, big = x % 10000 === 0;
      g.strokeStyle = big ? 'rgba(25,55,110,.8)' : kilo ? 'rgba(40,80,140,.42)' : 'rgba(40,80,140,.2)';
      g.lineWidth = big ? 1.6 : 0.8;
      g.beginPath(); g.moveTo(this.sx(x), 0); g.lineTo(this.sx(x), this.H); g.stroke();
    }
    for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) {
      const kilo = z % 1000 === 0, big = z % 10000 === 0;
      g.strokeStyle = big ? 'rgba(25,55,110,.8)' : kilo ? 'rgba(40,80,140,.42)' : 'rgba(40,80,140,.2)';
      g.lineWidth = big ? 1.6 : 0.8;
      g.beginPath(); g.moveTo(0, this.sz(z)); g.lineTo(this.W, this.sz(z)); g.stroke();
    }
    if (sq > 40) {
      g.font = `italic 9px ${SERIF}`; g.fillStyle = 'rgba(30,70,130,.55)'; g.textAlign = 'left'; g.textBaseline = 'top';
      const lab = Math.max(1000, step);
      for (let x = Math.floor(x0 / lab) * lab; x <= x1; x += lab) g.fillText(String(Math.round(((50000 + x) / 1000) % 100)).padStart(2, '0'), this.sx(x) + 2, 2);
      for (let z = Math.floor(z0 / lab) * lab; z <= z1; z += lab) g.fillText(String(Math.round(((52000 - z) / 1000) % 100)).padStart(2, '0'), 2, this.sz(z) + 2);
    }
  }

  drawTrenches(g, z0, z1) {
    const v = this.view;
    // our lines blue, the enemy's red: the WW2 mode stands on the German side
    const own = TH.lines ? RED : BLUE, foe = TH.lines ? BLUE : RED;
    const style = {
      britishFront: [own, 1.7, null, 1], britishSupport: [own, 1.2, [7, 4], 1], germanFront: [foe, 1.7, null, -1],
      germanSupport: [foe, 1.2, [7, 4], -1], germanReserve: [foe, 1.1, [3, 4], -1],
    };
    g.lineJoin = 'round';
    for (const k in style) {
      const [col, w, dash, side] = style[k];
      const pts = LINES[k];
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []);
      g.beginPath();
      // fire trenches are drawn with their bays: a square wave along the line while zoomed in enough
      if (v.mpp < 14 && !dash) {
        const amp = 3.2, per = 16;
        let first = true;
        for (let i = 0; i < pts.length - 1; i++) {
          const ax = this.sx(pts[i].x), az = this.sz(pts[i].z), bx = this.sx(pts[i + 1].x), bz = this.sz(pts[i + 1].z);
          const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L, n = Math.max(1, Math.floor(L / per));
          for (let j = 0; j < n; j++) {
            // bay, traverse, bay, traverse: the line steps out and back in alternate halves
            for (const [t, o] of [[j / n, 0], [(j + 0.5) / n, 0], [(j + 0.5) / n, side * amp], [(j + 1) / n, side * amp], [(j + 1) / n, 0]]) {
              const X = ax + (bx - ax) * t + nx * o, Z = az + (bz - az) * t + nz * o;
              if (first) { g.moveTo(X, Z); first = false; } else g.lineTo(X, Z);
            }
          }
        }
      } else {
        pts.forEach((p, i) => { const X = this.sx(p.x), Z = this.sz(p.z); if (i === 0) g.moveTo(X, Z); else g.lineTo(X, Z); });
      }
      g.stroke();
      g.setLineDash([]);
    }
    // wire in front of the German front line: little crosses on a strand
    {
      const pts = LINES.germanFront;
      g.strokeStyle = 'rgba(120,40,30,.8)'; g.lineWidth = 0.9;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dl = Math.hypot(b.x - a.x, b.z - a.z), L = dl / v.mpp, n = Math.floor(L / 11);
        const ox = -90 / v.mpp;
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n, X = this.sx(a.x + (b.x - a.x) * t) + ox, Z = this.sz(a.z + (b.z - a.z) * t);
          g.beginPath(); g.moveTo(X - 2, Z - 2); g.lineTo(X + 2, Z + 2); g.moveTo(X + 2, Z - 2); g.lineTo(X - 2, Z + 2); g.stroke();
        }
      }
    }
    // line names, set along the trench
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tag = (pts, text, col, zAt, dx) => {
      const X = this.sx(this.lx(pts, zAt) + dx), Z = this.sz(zAt);
      if (X < 10 || X > this.W - 10 || Z < 40 || Z > this.H - 40) return;
      g.save(); g.translate(X, Z); g.rotate(-Math.PI / 2);
      g.font = `italic 10px ${SERIF}`; g.fillStyle = col; this.spaced(g, text, 0, 0, 1.5);
      g.restore();
    };
    if (v.mpp < 22) {
      const zz = Math.max(Math.min(this.wz(this.H * 0.5), 5800), -5800);
      tag(LINES.britishFront, TH.lines?.british ?? 'BRITISH FRONT LINE', TH.lines ? RED : BLUE, zz, -120);
      tag(LINES.germanFront, TH.lines?.german ?? 'GERMAN FRONT LINE', TH.lines ? BLUE : RED, zz, 135);
    }
  }
  lx(pts, z) {
    for (let i = 0; i < pts.length - 1; i++) if (z <= pts[i + 1].z) { const a = pts[i], b = pts[i + 1]; return a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x); }
    return pts[pts.length - 1].x;
  }

  // ----- the live picture --------------------------------------------------------------------
  update(dt, ctx) {
    const { sim, unit, tracker, cursorId, now } = ctx;
    this.last.sim = sim; this.last.unit = unit;
    if (!this.resize()) return;
    if (!this.view) { this.fit(); if (!this.view) return; }
    const v = this.view, g = this.g, d = this.dpr;
    const key = `${v.cx.toFixed(1)}|${v.cz.toFixed(1)}|${v.mpp.toFixed(3)}|${this.W}|${this.H}|${d}`;
    if (key !== this.key) { this.key = key; this.drawStatic(); this.memo.view = v; }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(this.layer, 0, 0, this.W, this.H);

    const sx = (x) => this.sx(x), sz = (z) => this.sz(z);
    const T = now / 1000;
    const missions = sim.missions || [];
    const cur = unit.missionId != null ? missions.find((m) => m.id === unit.missionId) : null;
    const charge = unit.order ? unit.order.charge || 0 : 0;

    this.drawSos(g, sim, missions, T);
    this.drawRings(g, sim, unit, charge);
    this.drawTargets(g, sim, unit, missions, cur, cursorId, T);
    this.drawFalls(g, sim, unit, tracker, T);
    this.drawOrder(g, sim, unit, T);
    this.drawUnits(g, sim, unit, tracker, T);
    TH.overlay?.(this, g, sim, unit, T); // a theatre's own picture (the WW1 Paris Gun's targets 120 km off)
    this.drawShells(g, sim, unit, tracker, T);
    this.drawEnemy(g, tracker, sim, T);
    this.drawFrame(g, sim, unit, T);

    // readout under the cursor
    const h = this.hover;
    if (h) {
      const x = this.wx(h.px), z = this.wz(h.py);
      const range = Math.hypot(x - unit.pos.x, z - unit.pos.z), br = bearingOf(x - unit.pos.x, z - unit.pos.z);
      const t = this.pickTarget(h.px, h.py), own = TH.hoverText?.(this, x, z, sim, unit);
      setText(this.refEl, own ?? `${TH.ref(x, z)}   ${yd(range)} ${lenShort()}   ${dm(br)}${t ? '   ' + t.name : ''}`);
      this.cv.classList.toggle('pick', !!t);
    } else { setText(this.refEl, TH.refHint); this.cv.classList.remove('pick'); }
  }

  drawSos(g, sim, missions, T) {
    const alarm = new Set();
    for (const m of missions) if (m.kind === 'sos' && m.state !== 'done' && m.state !== 'failed') for (const s of TH.sectors) if (m.z >= s.from && m.z < s.to) alarm.add(s.id);
    if (this.sosCall) for (const id of Object.keys(this.sosCall)) if (T - this.sosCall[id] < 40) alarm.add(id);
    this.alarm = alarm;
    for (const s of TH.sectors) {
      const str = sim.front ? sim.front[s.id] : 1;
      const lost = str === 0, red = alarm.has(s.id);
      const zA = Math.max(s.from, this.wz(0) - 500), zB = Math.min(s.to, this.wz(this.H) + 500);
      if (zA >= zB) continue;
      g.beginPath();
      for (let z = zA; ; z = Math.min(zB, z + 200)) {
        const X = this.sx(SOS_X(z) + 40), Z = this.sz(z);
        if (z === zA) g.moveTo(X, Z); else g.lineTo(X, Z);
        if (z >= zB) break;
      }
      const flash = red ? 0.55 + 0.45 * Math.sin(T * 9) : 0;
      g.lineWidth = red ? 5 : 3;
      g.strokeStyle = lost ? 'rgba(90,90,90,.35)' : red ? `rgba(215,40,25,${0.45 + flash * 0.4})` : 'rgba(168,36,27,.28)';
      g.setLineDash(lost ? [2, 5] : red ? [10, 4] : [6, 8]);
      g.stroke(); g.setLineDash([]);
      // flag with the sector letter
      const zm = (s.from + s.to) / 2, X = this.sx(SOS_X(zm) + 40), Z = this.sz(zm);
      if (Z > 14 && Z < this.H - 14 && X > 0 && X < this.W) {
        g.fillStyle = lost ? '#777' : red ? '#d42a1b' : 'rgba(168,36,27,.85)';
        g.beginPath(); g.arc(X, Z, 8, 0, TAU); g.fill();
        g.strokeStyle = '#2a0f0a'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#f4e9c8'; g.font = `bold 10px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.id, X, Z + 0.5);
        if (red) { g.fillStyle = '#d42a1b'; g.font = `bold 10px ${TYPE}`; this.halo(g, TH.sos, X, Z - 15); }
      }
    }
  }

  drawRings(g, sim, unit, charge) {
    if (unit.alive === false) return;
    const cx = this.sx(unit.pos.x), cz = this.sz(unit.pos.z), v = this.view;
    const cfg = KINDS[unit.kind] || {};
    const n = typeof unit.charges === 'number' ? unit.charges : cfg.charges || 3;
    const half = (unit.arc != null ? unit.arc : 28 * DEG), mid = unit.zero != null ? unit.zero : Math.PI / 2;
    const cur = rangeSpan(sim, unit.kind, charge);
    // wedge of the arc of fire
    if (cur.max) {
      g.beginPath();
      g.arc(cx, cz, cur.max / v.mpp, mid - Math.PI / 2 - half, mid - Math.PI / 2 + half);
      g.arc(cx, cz, Math.max(1, cur.min / v.mpp), mid - Math.PI / 2 + half, mid - Math.PI / 2 - half, true);
      g.closePath();
      g.fillStyle = 'rgba(40,80,150,.08)'; g.fill();
    }
    for (let c = 0; c < n; c++) {
      const sp = rangeSpan(sim, unit.kind, c);
      if (!sp.max) continue;
      const on = c === charge, R = sp.max / v.mpp;
      g.beginPath(); g.arc(cx, cz, R, 0, TAU);
      g.strokeStyle = on ? 'rgba(25,55,140,.85)' : 'rgba(25,55,140,.3)';
      g.lineWidth = on ? 1.5 : 0.8; g.setLineDash(on ? [9, 4] : [3, 5]); g.stroke(); g.setLineDash([]);
      // label the ring where it crosses the line of the guns
      const lx = cx + Math.sin(mid + 0.0) * R, lz = cz - Math.cos(mid) * R;
      if (lx > 10 && lx < this.W - 24 && lz > 8 && lz < this.H - 8) {
        g.font = `${on ? 'bold ' : ''}9px ${TYPE}`; g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillStyle = on ? '#142e7a' : 'rgba(25,55,140,.6)';
        this.halo(g, `C${c + 1} ${yd(sp.max)}`, lx + 3, lz - 2);
      }
    }
    if (cur.min && cur.min / v.mpp > 6) {
      g.beginPath(); g.arc(cx, cz, cur.min / v.mpp, 0, TAU);
      g.strokeStyle = 'rgba(25,55,140,.35)'; g.lineWidth = 0.8; g.setLineDash([1, 4]); g.stroke(); g.setLineDash([]);
    }
  }

  symbol(g, kind, x, y, s, col, T, bearing) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5; g.lineJoin = 'round';
    switch (kind) {
      case 'battery': {                      // a ring with the gun barrels toward the British lines
        g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fillStyle = 'rgba(232,222,190,.9)'; g.fill(); g.stroke();
        g.fillStyle = col;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * s * 0.5, 0, s * 0.2, 0, TAU); g.fill(); }
        g.lineWidth = 2; g.beginPath(); g.moveTo(-s, 0); g.lineTo(-s * 1.7, 0); g.stroke();
        break; }
      case 'mebu':
        g.fillStyle = col; g.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
        g.strokeStyle = '#efe6c9'; g.lineWidth = 1; g.beginPath(); g.moveTo(-s * 0.7, 0); g.lineTo(s * 0.7, 0); g.moveTo(0, -s * 0.7); g.lineTo(0, s * 0.7); g.stroke();
        g.strokeStyle = col; g.lineWidth = 1.3; g.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
        break;
      case 'dump':
        g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.95, s * 0.7); g.lineTo(-s * 0.95, s * 0.7); g.closePath();
        g.fillStyle = 'rgba(232,222,190,.9)'; g.fill(); g.stroke();
        g.fillStyle = col; g.beginPath(); g.arc(0, s * 0.12, s * 0.3, 0, TAU); g.fill();
        break;
      case 'balloon':
        g.beginPath(); g.ellipse(0, -s * 0.2, s * 0.6, s * 0.9, 0.3, 0, TAU); g.fillStyle = 'rgba(232,222,190,.9)'; g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-s * 0.2, s * 0.6); g.lineTo(-s * 0.7, s * 1.5); g.stroke();
        break;
      case 'hq':
        g.beginPath(); g.moveTo(-s * 0.5, s * 0.8); g.lineTo(-s * 0.5, -s); g.stroke();
        g.beginPath(); g.moveTo(-s * 0.5, -s); g.lineTo(s * 0.9, -s * 0.5); g.lineTo(-s * 0.5, 0); g.closePath(); g.fill();
        break;
      case 'tanks': // a rhomboid tank outline
        g.beginPath(); g.moveTo(-s * 1.2, s * 0.4); g.lineTo(-s * 0.9, -s * 0.5); g.lineTo(s * 0.9, -s * 0.5); g.lineTo(s * 1.2, s * 0.4); g.closePath();
        g.fillStyle = 'rgba(232,222,190,.9)'; g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-s * 0.3, -s * 0.5); g.lineTo(-s * 1.3, -s * 0.5); g.stroke();
        break;
      case 'crossroads':
        g.lineWidth = 2; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
        g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.arc(0, 0, s * 1.05, 0, TAU); g.stroke(); g.setLineDash([]);
        break;
      case 'railyard':
        g.lineWidth = 1.5; g.beginPath(); g.moveTo(-s * 1.4, -s * 0.4); g.lineTo(s * 1.4, -s * 0.4); g.moveTo(-s * 1.4, s * 0.4); g.lineTo(s * 1.4, s * 0.4); g.stroke();
        for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * s * 0.4, -s * 0.6); g.lineTo(i * s * 0.4, s * 0.6); g.lineWidth = 0.9; g.stroke(); }
        g.fillRect(-s * 0.9, -s * 0.2, s * 0.8, s * 0.4); g.fillRect(s * 0.1, -s * 0.2, s * 0.8, s * 0.4);
        break;
      default:
        g.beginPath(); g.arc(0, 0, s * 0.8, 0, TAU); g.stroke();
    }
    g.restore();
  }

  drawTargets(g, sim, unit, missions, cur, cursorId, T) {
    const span = rangeSpan(sim, unit.kind, unit.order ? unit.order.charge || 0 : 0);
    const reach = KINDS[unit.kind] && KINDS[unit.kind].deep ? Infinity : Math.max(span.max, maxReach(sim, unit));
    g.textBaseline = 'top'; g.textAlign = 'center';
    const lbl = [];
    for (const t of sim.targets || []) {
      if (!t.known) continue;
      const X = this.sx(t.pos.x), Z = this.sz(t.pos.z);
      if (X < -30 || X > this.W + 30 || Z < -30 || Z > this.H + 30) continue;
      const dead = t.alive === false;
      const dist = Math.hypot(t.pos.x - unit.pos.x, t.pos.z - unit.pos.z);
      const far = dist > reach;
      const s = Math.max(5, Math.min(11, 5 + t.r / this.view.mpp * 0.5));
      g.globalAlpha = dead ? 0.4 : far ? 0.5 : 1;
      if (dead) {
        g.strokeStyle = '#3a342b'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X - s, Z - s); g.lineTo(X + s, Z + s); g.moveTo(X + s, Z - s); g.lineTo(X - s, Z + s); g.stroke();
      } else {
        this.symbol(g, SYM[t.kind] ?? t.kind, X, Z, s, RED, T);
        if (t.maxHp && t.hp < t.maxHp) {         // damage: a ruled tick under the symbol
          g.fillStyle = '#2a2018'; g.fillRect(X - 8, Z + s + 3, 16, 3);
          g.fillStyle = '#b8321f'; g.fillRect(X - 8, Z + s + 3, 16 * Math.max(0, t.hp / t.maxHp), 3);
        }
      }
      g.globalAlpha = 1;
      if (!dead) lbl.push([t.name, X, Z + s + (t.maxHp && t.hp < t.maxHp ? 8 : 3), far]);
    }
    g.font = `italic 9.5px ${SERIF}`; g.fillStyle = '#6e1810';
    for (const [n, X, Z, far] of lbl) { g.globalAlpha = far ? 0.6 : 1; this.halo(g, n, X, Z); }
    g.globalAlpha = 1;
    // mission tags: a small numbered flag at the point; the cursor one pulses, the taken one is bracketed
    for (const m of missions) {
      if (m.state === 'done' || m.state === 'failed') continue;
      const X = this.sx(m.x), Z = this.sz(m.z);
      if (X < -20 || X > this.W + 20 || Z < -20 || Z > this.H + 20) continue;
      const isCur = m.id === cursorId, taken = cur && m.id === cur.id;
      const sos = m.kind === 'sos';
      const r = 15 + (isCur ? 2 + 2 * Math.sin(T * 6) : 0);
      if (isCur || taken) {
        g.strokeStyle = taken ? BLUE : '#c0701a'; g.lineWidth = isCur ? 2 : 1.6;
        g.setLineDash(taken && !isCur ? [] : [4, 3]);
        g.beginPath(); g.arc(X, Z, r, 0, TAU); g.stroke(); g.setLineDash([]);
      }
      const fx = X + 9, fz = Z - 21;
      g.fillStyle = sos ? '#c4291a' : isCur ? '#c0701a' : 'rgba(60,50,38,.9)';
      g.fillRect(fx, fz, 18, 13);
      g.strokeStyle = '#17120c'; g.lineWidth = 0.8; g.strokeRect(fx, fz, 18, 13);
      g.beginPath(); g.moveTo(fx, fz + 13); g.lineTo(X + 1, Z - 2); g.stroke();
      g.fillStyle = '#f3e8c6'; g.font = `bold 9px ${TYPE}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(m.id), fx + 9, fz + 7);
    }
  }

  drawOrder(g, sim, unit, T) {
    const o = unit.order;
    if (!o || !o.target || unit.alive === false) return;
    const ax = this.sx(unit.pos.x), az = this.sz(unit.pos.z);
    const tx = this.sx(o.target.x), tz = this.sz(o.target.z);
    const bx = this.sx(o.x != null ? o.x : o.target.x), bz = this.sz(o.z != null ? o.z : o.target.z);
    // line of fire to the aimed point, marked off in thousands of yards
    const L = Math.hypot(bx - ax, bz - az);
    g.strokeStyle = 'rgba(20,40,110,.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke();
    if (L > 30) {
      const ux = (bx - ax) / L, uz = (bz - az) / L, step = 1000 * lenU() / this.view.mpp;
      g.lineWidth = 1;
      for (let k = 1; k * step < L - 4 && k < 40; k++) {
        const X = ax + ux * k * step, Z = az + uz * k * step;
        g.beginPath(); g.moveTo(X - uz * 4, Z + ux * 4); g.lineTo(X + uz * 4, Z - ux * 4); g.stroke();
      }
      // bearing and range written along the line
      let ang = Math.atan2(bz - az, bx - ax), flip = ang > Math.PI / 2 || ang < -Math.PI / 2;
      g.save(); g.translate((ax + bx) / 2, (az + bz) / 2); g.rotate(flip ? ang + Math.PI : ang);
      g.font = `bold 10px ${TYPE}`; g.fillStyle = '#142e7a'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      this.halo(g, `${dm(o.line)}  ${yd(o.range)} ${lenShort()}`, 0, -3);
      g.restore();
    }
    // the target point, ringed in red; the corrected aimpoint in blue with a short arrow between
    if (Math.hypot(bx - tx, bz - tz) > 4) {
      g.strokeStyle = 'rgba(20,40,110,.9)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(tx, tz); g.lineTo(bx, bz); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#17327f'; g.beginPath(); g.arc(bx, bz, 3, 0, TAU); g.fill();
    }
    const pulse = 1 + 0.12 * Math.sin(T * 5);
    g.strokeStyle = '#b3231a'; g.lineWidth = 1.7;
    g.beginPath(); g.arc(tx, tz, 9 * pulse, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(tx - 14, tz); g.lineTo(tx - 5, tz); g.moveTo(tx + 5, tz); g.lineTo(tx + 14, tz); g.moveTo(tx, tz - 14); g.lineTo(tx, tz - 5); g.moveTo(tx, tz + 5); g.lineTo(tx, tz + 14); g.stroke();
  }

  drawFalls(g, sim, unit, tracker, T) {
    if (!tracker) return;
    const now = sim.time || 0;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (const [uid, list] of tracker.falls) {
      const mine = uid === unit.id;
      list.forEach((f, i) => {
        const X = this.sx(f.x), Z = this.sz(f.z);
        if (X < -10 || X > this.W + 10 || Z < -10 || Z > this.H + 10) return;
        const newest = mine && i === list.length - 1;
        const age = now - f.t;
        g.strokeStyle = mine ? (newest ? '#9a1810' : '#142a6e') : 'rgba(60,60,60,.45)';
        g.lineWidth = newest ? 2.2 : 1.6;
        const s = newest ? 6 : 4.5;
        g.beginPath(); g.moveTo(X - s, Z - s); g.lineTo(X + s, Z + s); g.moveTo(X + s, Z - s); g.lineTo(X - s, Z + s); g.stroke();
        if (newest && age < 6) { g.lineWidth = 1.2; g.beginPath(); g.arc(X, Z, s + 4 + age * 4, 0, TAU); g.globalAlpha = Math.max(0, 1 - age / 6); g.stroke(); g.globalAlpha = 1; }
        if (mine) { g.font = `italic bold ${newest ? 13 : 11}px ${SERIF}`; g.fillStyle = newest ? '#9a1810' : '#142a6e'; g.fillText(String(f.n), X + s + 1, Z - s + 1); }
      });
    }
  }

  drawUnits(g, sim, sel, tracker, T) {
    const now = sim.time || 0;
    for (const u of sim.units || []) {
      const isSel = u.id === sel.id, dead = u.alive === false;
      const X = this.sx(u.pos.x), Z = this.sz(u.pos.z);
      if (X < -40 || X > this.W + 40 || Z < -40 || Z > this.H + 40) continue;
      const s = isSel ? 7 : 5;
      const col = dead ? '#6a6a60' : BLUE;
      // each piece: a barrel tick along the zero line
      g.strokeStyle = col; g.lineWidth = isSel ? 2.4 : 1.8;
      for (const p of u.pieces || []) {
        if (p.state === 'dead') continue;
        const px = this.sx(p.pos.x), pz = this.sz(p.pos.z);
        const b = u.zero != null ? u.zero : Math.PI / 2;
        g.beginPath(); g.moveTo(px, pz); g.lineTo(px + Math.sin(b) * 11, pz - Math.cos(b) * 11); g.stroke();
      }
      g.beginPath(); g.arc(X, Z, s, 0, TAU);
      g.fillStyle = dead ? '#9a978a' : isSel ? '#2f58b5' : '#5f7fc2'; g.fill();
      g.strokeStyle = '#0d1a3f'; g.lineWidth = 1.2; g.stroke();
      if (dead) { g.strokeStyle = RED; g.beginPath(); g.moveTo(X - s - 2, Z - s - 2); g.lineTo(X + s + 2, Z + s + 2); g.moveTo(X + s + 2, Z - s - 2); g.lineTo(X - s - 2, Z + s + 2); g.stroke(); }
      if (isSel) { g.strokeStyle = 'rgba(30,60,150,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(X, Z, s + 5 + Math.sin(T * 3), 0, TAU); g.stroke(); }
      // fired within the last second: a ring of flash
      let fired = 0;
      for (const p of u.pieces || []) if (p.firedAt != null && now - p.firedAt < 0.9) fired = Math.max(fired, 1 - (now - p.firedAt) / 0.9);
      if (fired > 0) { g.strokeStyle = `rgba(255,170,40,${fired})`; g.lineWidth = 2.5; g.beginPath(); g.arc(X, Z, s + 4 + (1 - fired) * 16, 0, TAU); g.stroke(); }
      g.font = `${isSel ? 'bold ' : ''}italic ${isSel ? 11 : 10}px ${SERIF}`; g.fillStyle = dead ? '#555' : '#10286e'; g.textAlign = 'center'; g.textBaseline = 'top';
      this.halo(g, `${u.id} ${u.callsign}`, X, Z + s + 3);
    }
  }

  drawShells(g, sim, sel, tracker, T) {
    for (const s of sim.shells || []) {
      if (s.alive === false) continue;
      const X = this.sx(s.pos.x), Z = this.sz(s.pos.z);
      const px = this.sx(s.prev ? s.prev.x : s.pos.x), pz = this.sz(s.prev ? s.prev.z : s.pos.z);
      if (s.own) {
        const mine = s.unitId === sel.id;
        if (s.aim) {
          g.strokeStyle = mine ? 'rgba(20,40,110,.5)' : 'rgba(40,40,60,.22)'; g.lineWidth = 1; g.setLineDash([2, 4]);
          g.beginPath(); g.moveTo(X, Z); g.lineTo(this.sx(s.aim.x), this.sz(s.aim.z)); g.stroke(); g.setLineDash([]);
        }
        const r = (mine ? 3.6 : 2.6) + Math.min(2, (s.calibre || 6) / 8);
        // height gives the dot a shadow offset: the shell is above the map
        const hgt = Math.min(1, (s.pos.y || 0) / 3500);
        g.fillStyle = 'rgba(20,20,20,.28)'; g.beginPath(); g.arc(X, Z + 2 + hgt * 3, r, 0, TAU); g.fill();
        g.fillStyle = mine ? '#d9a62a' : '#a79a78'; g.strokeStyle = '#2a1d06'; g.lineWidth = 1;
        g.beginPath(); g.arc(X, Z - hgt * 3, r, 0, TAU); g.fill(); g.stroke();
        if (mine && tracker) {
          const n = tracker.numbers.get(s.id);
          if (n) { g.font = `italic bold 10px ${SERIF}`; g.fillStyle = '#142a6e'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; this.halo(g, String(n), X + 6, Z - 5); }
        }
      } else {
        g.strokeStyle = 'rgba(168,36,27,.35)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(px, pz); g.lineTo(X, Z); g.stroke();
        g.fillStyle = '#c4301f'; g.beginPath(); g.arc(X, Z, 3.2, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(196,48,31,.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(X, Z, 6 + 3 * Math.abs(Math.sin(T * 7)), 0, TAU); g.stroke();
        if (s.aim) {            // where it will land: a flashing diamond
          const ax = this.sx(s.aim.x), az = this.sz(s.aim.z);
          if (sim.units.some((u) => u.pieces && u.pieces.some((p) => Math.hypot(p.pos.x - s.aim.x, p.pos.z - s.aim.z) < 450))) {
            g.strokeStyle = `rgba(210,40,25,${0.5 + 0.5 * Math.sin(T * 12)})`; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(ax, az - 9); g.lineTo(ax + 9, az); g.lineTo(ax, az + 9); g.lineTo(ax - 9, az); g.closePath(); g.stroke();
          }
        }
      }
    }
  }

  drawEnemy(g, tracker, sim, T) {
    if (!tracker) return;
    const now = sim.time || 0;
    for (const b of tracker.enemy) {
      const age = now - b.t;
      if (age > 40) continue;
      const X = this.sx(b.x), Z = this.sz(b.z);
      const a = Math.max(0, 1 - age / 40);
      const r = b.near ? 9 : 6;
      g.strokeStyle = `rgba(190,40,25,${0.35 + a * 0.6})`; g.fillStyle = `rgba(230,120,40,${a * 0.5})`; g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < 16; i++) { const rr = i % 2 ? r * 0.45 : r; const an = (i / 16) * TAU; const px = X + Math.cos(an) * rr, pz = Z + Math.sin(an) * rr; if (i === 0) g.moveTo(px, pz); else g.lineTo(px, pz); }
      g.closePath(); g.fill(); g.stroke();
      if (age < 3 && b.near) { g.strokeStyle = `rgba(230,60,30,${1 - age / 3})`; g.lineWidth = 2; g.beginPath(); g.arc(X, Z, r + 4 + age * 14, 0, TAU); g.stroke(); }
    }
  }

  // compass and wind, scale bar, map folds and the dark edge of an old sheet
  drawFrame(g, sim, unit, T) {
    const W = this.W, H = this.H;
    // folds
    g.strokeStyle = 'rgba(90,70,40,.17)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(W * 0.5, 0); g.lineTo(W * 0.5, H); g.moveTo(0, H * 0.5); g.lineTo(W, H * 0.5); g.stroke();
    g.strokeStyle = 'rgba(255,250,230,.22)';
    g.beginPath(); g.moveTo(W * 0.5 + 1.2, 0); g.lineTo(W * 0.5 + 1.2, H); g.moveTo(0, H * 0.5 + 1.2); g.lineTo(W, H * 0.5 + 1.2); g.stroke();
    // north arrow with wind
    const nx = W - 34, nz = 52;
    g.save(); g.translate(nx, nz);
    g.fillStyle = 'rgba(232,222,190,.85)'; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(0, -22); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
    g.strokeStyle = INK; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 12); g.stroke();
    g.font = `bold 10px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText('N', 0, -31);
    if (sim.wind && sim.wind.speed != null) {
      let b = sim.wind.bearing; if (Math.abs(b) > TAU + 0.01) b *= DEG;    // blowing FROM this bearing
      g.rotate(b + Math.PI);
      const L = 9 + Math.min(14, sim.wind.speed * 1.4);
      g.strokeStyle = '#1d3f8f'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -L); g.lineTo(0, L); g.stroke();
      g.fillStyle = '#1d3f8f'; g.beginPath(); g.moveTo(0, L + 4); g.lineTo(4, L - 4); g.lineTo(-4, L - 4); g.closePath(); g.fill();
      g.rotate(-(b + Math.PI));
    }
    g.restore();
    // scale bar in thousands of yards
    const yardPx = lenU() / this.view.mpp;
    let bar = 1000; while (bar * yardPx > 150) bar /= 2; while (bar * yardPx < 60) bar *= 2;
    const bx = 14, bz = H - 34;
    g.fillStyle = INK; g.fillRect(bx, bz, bar * yardPx, 3);
    g.fillRect(bx, bz - 3, 1.2, 9); g.fillRect(bx + bar * yardPx - 1, bz - 3, 1.2, 9);
    g.font = `9px ${TYPE}`; g.textAlign = 'left'; g.textBaseline = 'bottom'; this.halo(g, `${commasInt(bar)} ${lenShort()}`, bx, bz - 4);
    // dark edge
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(60,40,15,0)'); gr.addColorStop(1, 'rgba(60,40,15,.32)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }

  sos(id, T) { (this.sosCall || (this.sosCall = {}))[id] = T; }
}
const commasInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

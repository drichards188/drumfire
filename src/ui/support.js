// The weapons off the map (src/sim/support.js) on the console: a tile for each at the foot of the battery tabs, its
// state and countdown, and their marks on the artillery board. Pick a ready tile and the next click on the board (a
// point, or a target's symbol) is its target; it then fires in its own time. Pick it again to put it down; a tile that
// is preparing takes a new point the same way, and its × stands it down. A tile that cannot take an order says why on
// the radio (support.js tell), as the guns do. The Panel mounts it (panel.js); the consoles hand it the board's
// clicks first (consoles/console.js, shared.supportClick).
import './support.css';
import { el, snd, setText, setCls, Bar } from './widgets.js';
import { BOARD_OVERLAYS } from './board.js';
import { tut } from './highlight.js';
import { SUPPORT } from '../sim/support.js';

const TAU = Math.PI * 2;
const TYPE = "'Courier 10 Pitch','Liberation Mono','FreeMono',monospace";
const COL = '#6b1f5e', COL_SOFT = 'rgba(107,31,94,.16)';
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SHORT = { v1: 'V-1', v2: 'V-2', paris: 'PARIS' };
let armed = null; // the kind picked: the next click on the board is its target (one Panel at a time)

export class SupportTiles {
  constructor({ shared, send }) {
    this.send = send;
    this.sim = null;
    this.el = el('div', 'tsupport');
    this.el.hidden = true;
    tut(this.el, 'support');
    this.el.append(el('div', 'tsup-h', 'OFF-MAP SUPPORT'));
    this.list = el('div', 'tsup-list');
    this.el.append(this.list);
    this.tiles = new Map();
    this.kinds = '';
    shared.supportClick = (x, z) => this.click(x, z);
  }

  reset() {
    armed = null;
  }

  // a click on the board: the armed weapon's target (true: taken, the console does nothing more)
  click(x, z) {
    if (!armed || !this.sim?.support) return false;
    const kind = armed;
    armed = null;
    snd('click');
    this.send({ kind, x, z });
    return true;
  }

  pick(kind) {
    const a = this.sim?.support?.get(kind);
    if (!a) return;
    snd('click');
    if (armed === kind) { armed = null; return; }
    // not ready (in flight, reloading): the radio says why; ready or preparing: the next click is its point
    if (a.state !== 'ready' && a.state !== 'preparing') { this.send({ kind, ask: true }); return; }
    armed = kind;
  }

  build(assets) {
    this.list.replaceChildren();
    this.tiles.clear();
    for (const a of assets) {
      const t = el('button', 'tsup');
      t.type = 'button';
      const name = el('b', 'tsup-n', SHORT[a.kind] ?? a.name);
      const st = el('span', 'tsup-s', '');
      const x = el('i', 'tsup-x', '×');
      x.title = `Stand the ${a.name} down (no reload)`;
      x.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); snd('click'); if (armed === a.kind) armed = null; this.send({ kind: a.kind, cancel: true }); });
      const bar = new Bar({ cls: 'mini' });
      t.append(name, st, x, bar.el);
      t.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pick(a.kind); });
      tut(t, `support-${a.kind}`);
      this.list.append(t);
      this.tiles.set(a.kind, { t, st, bar, x });
    }
  }

  update(sim) {
    this.sim = sim;
    const S = sim?.support;
    this.el.hidden = !S;
    if (!S) { armed = null; return; }
    const kinds = S.assets.map((a) => a.kind).join(',');
    if (kinds !== this.kinds) { this.build(S.assets); this.kinds = kinds; }
    for (const a of S.assets) {
      const v = this.tiles.get(a.kind);
      if (!v) continue;
      const on = armed === a.kind;
      // (short: three tiles share the column's width; the title has the whole of it)
      const txt = on ? 'TARGET?' : a.state === 'ready' ? 'READY' : a.state === 'preparing' ? `PREP ${mmss(a.t)}`
        : a.state === 'flight' ? `AIR ${mmss(a.t)}` : `RLD ${mmss(a.t)}`;
      setText(v.st, txt);
      v.bar.set(a.state === 'ready' ? 1 : a.dur > 0 ? 1 - a.t / a.dur : 0);
      for (const s of ['ready', 'preparing', 'flight', 'reloading']) setCls(v.t, s, a.state === s);
      setCls(v.t, 'armed', on);
      v.x.hidden = a.state !== 'preparing';
      const why = S.problem(a.kind);
      v.t.title = `${a.name} (off-map support): ${on ? 'click the board where it is to fall; click the tile again to put it down'
        : a.state === 'ready' ? 'pick it, then click the board where it is to fall. It fires in its own time, then reloads for a long time.'
          : a.state === 'preparing' ? `${why}. Pick it and click the board for a new point; × stands it down.` : `${why}.`}`;
    }
  }
}

// the board: each weapon's aim (a ring two spreads across, its state and countdown) while it prepares and flies, its
// last strike for a minute and a half, and while one is picked a ring under the cursor and the word at the top
BOARD_OVERLAYS.push((b, g, sim, unit, T) => {
  const S = sim?.support;
  if (!S || !b.view) return;
  const mpp = b.view.mpp, W = b.W;
  g.save();
  g.font = `bold 10px ${TYPE}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const ring = (X, Z, r, dash) => {
    g.beginPath(); g.arc(X, Z, r, 0, TAU);
    g.fillStyle = COL_SOFT; g.fill();
    g.setLineDash(dash ? [5, 4] : []); g.strokeStyle = COL; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
  };
  const label = (X, Z, text) => {
    const w = g.measureText(text).width + 6;
    g.fillStyle = 'rgba(244,237,214,.85)'; g.fillRect(X, Z - 7, w, 14);
    g.fillStyle = COL; g.fillText(text, X + 3, Z);
  };
  for (const a of S.assets) {
    const sd = SUPPORT[a.kind].spread * a.mods.disp, r = Math.max(7, (2 * sd) / mpp);
    if ((a.state === 'preparing' || a.state === 'flight') && a.aim) {
      const X = b.sx(a.aim.x), Z = b.sz(a.aim.z);
      ring(X, Z, r, true);
      g.strokeStyle = COL; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X - 6, Z); g.lineTo(X + 6, Z); g.moveTo(X, Z - 6); g.lineTo(X, Z + 6); g.stroke();
      label(X + r + 4, Z, `${SHORT[a.kind]} ${a.state === 'preparing' ? 'PREP' : 'FLIGHT'} ${mmss(a.t)}`);
    }
    if (a.last && sim.time - a.last.t < 90) {
      const X = b.sx(a.last.x), Z = b.sz(a.last.z), k = Math.min(1, (sim.time - a.last.t) / 90);
      g.globalAlpha = 1 - k * 0.7;
      g.strokeStyle = COL; g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; g.moveTo(X + Math.cos(an) * 3, Z + Math.sin(an) * 3); g.lineTo(X + Math.cos(an) * 9, Z + Math.sin(an) * 9); }
      g.stroke();
      label(X + 11, Z, `${SHORT[a.kind]} ${a.last.off} m`);
      g.globalAlpha = 1;
    }
  }
  const a = armed ? S.get(armed) : null;
  if (a) {
    const h = b.hover;
    if (h) ring(h.px, h.py, Math.max(7, (2 * SUPPORT[a.kind].spread * a.mods.disp) / mpp), false);
    // (under the tool keys along the top)
    const text = `${a.name}: CLICK WHERE IT IS TO FALL`, y = (b.tools?.offsetHeight ?? 26) + 12;
    g.font = `bold 11px ${TYPE}`;
    const w = g.measureText(text).width + 14;
    g.fillStyle = COL; g.fillRect(W / 2 - w / 2, y, w, 18);
    g.fillStyle = '#f4edd6'; g.textAlign = 'center'; g.fillText(text, W / 2, y + 9);
  }
  g.restore();
});

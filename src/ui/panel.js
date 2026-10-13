// The right half of the screen: the battery tabs and the selected unit's fire control console.
// Reads only what update() is given ({ sim, selectedId }); talks back through onSelect(unitId) and
// onCommand(unitId, name, args). Optional hooks main can call: radio(text, kind) from sim.events.radio,
// sos(sectorId) from sim.events.sos, reset() on a new game.
import './panel.css';
import { el, hw, snd, setText, setCls, Bar } from './widgets.js';
import { applyHighlight } from './highlight.js';
import { Tracker } from './tracker.js';
import { Mail } from './messages.js';
import { mountConsole } from './consoles/console.js';
import { KIND_SHORT, clockStr, KINDS } from './consoles/common.js';
import { SECTORS } from '../sector.js';
import { GUNS } from '../sim/tables.js';

const DESIGN_W = 800;
const DESIGN_H = 900;
const MODE_LETTER = { auto: 'A', manual: 'M', hold: 'H' };

// Loading progress of one piece, 0 to 1, weighted by the nominal step durations of GUNS[kind].load
// (the step index plus job.t / job.dur when the list does not match job.n). Cumulative weights are cached per kind.
const LOAD_CUM = {};
function loadCum(kind, n) {
  const key = kind + n;
  let c = LOAD_CUM[key];
  if (c) return c;
  const L = GUNS[kind] && GUNS[kind].load;
  const w = L && L.length === n ? L.map((s) => s.dur) : new Array(n).fill(1);
  let tot = 0; for (const x of w) tot += x;
  c = { start: [], w: [] };
  let a = 0;
  for (let i = 0; i < n; i++) { c.start.push(a / tot); c.w.push(w[i] / tot); a += w[i]; }
  return LOAD_CUM[key] = c;
}
function pieceFill(p) {
  switch (p.state) {
    case 'ready': return 1;
    case 'loading': case 'laying': {
      const j = p.job;
      if (!j) return 0;
      const n = j.n || 1, i = Math.min(n - 1, j.i || 0), c = loadCum(p.kind, n);
      return Math.min(1, c.start[i] + c.w[i] * Math.min(1, j.t / Math.max(0.01, j.dur)));
    }
    case 'recoil': return 0;
    default: return 0;
  }
}
const PIECE_STATE = { ready: 'rdy', loading: 'ldg', laying: 'ldg', recoil: 'fir', dead: 'dead' };

export class Panel {
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    hw.audio = opts.audio || null;
    root.classList.add('pn-root');
    this.scaleEl = el('div', 'pn-scale');
    this.tabsEl = el('div', 'tabs');
    this.host = el('div', 'conhost');
    this.scaleEl.append(this.tabsEl, this.host);
    root.append(this.scaleEl);
    this.tabs = new Map();
    this.tabIds = '';
    this.mounted = null;
    this.memo = {};
    this.shared = { cursor: null };
    this.tracker = new Tracker();
    this.mail = new Mail((s) => snd(s.kind === 'wireless' || s.kind === 'sound' ? 'wireless' : s.kind === 'phone' ? 'phone' : 'paper'));
    this.view = null;
    this.t0 = performance.now();
    this.last = this.t0;

    const fit = () => {
      const w = root.clientWidth, h = root.clientHeight;
      if (!w || !h) return;
      const s = Math.max(0.55, Math.min(1.6, Math.min(w / DESIGN_W, h / DESIGN_H)));
      hw.scale = s;
      const st = this.scaleEl.style;
      st.width = `${w / s}px`;
      st.height = `${h / s}px`;
      st.transform = `scale(${s})`;
    };
    fit();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(fit); this.ro.observe(root); }
    else window.addEventListener('resize', fit);

    this._kd = (e) => this._key(e, true);
    this._ku = (e) => this._key(e, false);
    this._blur = () => { const c = this.mounted && this.mounted.con; if (c) for (const code of ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) c.key({ code }, false); };
    // a second Panel (hot reload, a restart) must not leave the first one's key handlers behind
    if (window.__drumfirePanel && window.__drumfirePanel !== this) window.__drumfirePanel.dispose();
    window.__drumfirePanel = this;
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
  }

  // new game: forget slips, fall of shot and per-unit view memory
  reset() {
    this.tracker.reset(); this.mail.reset(); this.memo = {}; this.shared.cursor = null;
    if (this.mounted) { this.mounted.con.dispose && this.mounted.con.dispose(); this.mounted = null; this.host.replaceChildren(); }
  }
  radio(text, kind) { if (this.view) this.mail.radio(text, kind, this.view.sim); }
  sos(sector) { const b = this.mounted && this.mounted.con.board; if (b) b.sos(sector, performance.now() / 1000); snd('bell'); }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    if (this.ro) this.ro.disconnect();
    if (this.mounted && this.mounted.con.dispose) this.mounted.con.dispose();
    if (window.__drumfirePanel === this) window.__drumfirePanel = null;
  }

  _send(id, name, args) { if (this.opts.onCommand) this.opts.onCommand(id, name, args); }

  // Keys are ignored while a text field or the settings GUI has focus, but releases always get through
  // so a held Fire key can never stick. Console keys are listed in DESIGN.md (UI section).
  _key(e, down) {
    const tg = e.target;
    if (down && tg && tg.nodeType === 1) {
      const tag = tg.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tg.isContentEditable || (tg.closest && tg.closest('.lil-gui'))) return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || !this.mounted || !this.view) return;
    if (down && e.repeat && e.code.slice(0, 5) !== 'Arrow') { if (e.code === 'Space' || e.code === 'Tab') e.preventDefault(); return; }
    if (this.mounted.con.key(e, down)) e.preventDefault();
  }

  _buildTabs(units) {
    this.tabsEl.replaceChildren();
    this.tabs.clear();
    units.forEach((u, i) => {
      const t = el('div', 'tab');
      const key = el('span', 'tkey', String(i + 1));
      const main = el('div', 'tmain');
      const call = el('b', 'tcall');
      const hp = new Bar({ cls: 'mini' }), am = new Bar({ cls: 'mini ammo' });
      const mode = el('span', 'tmode', 'A');
      const line = el('div', 'tline');
      const kind = el('i', 'ttype', KIND_SHORT[u.kind] || u.kind);
      line.append(kind, hp.el, am.el, mode);
      main.append(call, line);
      t.title = `${u.name}: HP, ammunition, mode (A: auto or manual; HOLD on the console)`;
      const lamp = el('i', 'tlamp');
      // loading state: one pip per piece, filling toward READY, and a short summary
      const lrow = el('div', 'tload');
      const pcs = el('span', 'tpcs');
      const pips = (u.pieces || []).map(() => { const f = el('i'); const pip = el('span', 'tpc st-idle'); pip.append(f); pcs.append(pip); return { pip, f, st: '', w: -1 }; });
      const ltxt = el('span', 'tltxt');
      lrow.append(pcs, ltxt);
      main.append(lrow);
      t.append(key, main, lamp);
      t.dataset.tut = `tabs tab-${u.id}`;
      t.addEventListener('pointerdown', (e) => { e.preventDefault(); snd('click'); if (this.opts.onSelect) this.opts.onSelect(u.id); });
      this.tabsEl.append(t);
      this.tabs.set(u.id, { el: t, call, hp, am, mode, lamp, ammoMax: 0, pips, ltxt, ltxtCls: '' });
    });
    this.status = el('div', 'tstatus');
    this.stClock = el('b', 'sclock');
    this.stState = el('i', 'sstate');
    this.stScore = el('span', 'sscore');
    this.stFront = el('div', 'sfront');
    this.fronts = SECTORS.map((s) => { const c = el('i', 'fchip', s.id); this.stFront.append(c); return c; });
    this.status.append(this.stClock, this.stState, this.stScore, this.stFront);
    this.tabsEl.append(this.status);
    applyHighlight();
  }

  update(view, dt0) {
    if (typeof view === 'number') { const d = arguments[1]; dt0 = view; view = d; }   // also accepts iads-style (dt, view)
    const sim = view && view.sim;
    if (!sim || !sim.units || !sim.units.length) return;
    const now = performance.now();
    const dt = dt0 != null ? dt0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.view = view;
    this.tracker.update(sim);
    this.mail.scan(sim, this.tracker);

    const units = sim.units;
    const ids = units.map((u) => u.id).join(',');
    if (ids !== this.tabIds) { this._buildTabs(units); this.tabIds = ids; }
    for (const u of units) {
      const t = this.tabs.get(u.id);
      setText(t.call, (u.callsign || u.id).toUpperCase());
      const hp = (u.pieces || []).reduce((s, p) => s + (p.state === 'dead' ? 0 : p.hp), 0), hpMax = (u.pieces || []).reduce((s, p) => s + p.maxHp, 0);
      t.hp.set(hpMax ? hp / hpMax : 1);
      const ammo = u.ammo ? (u.ammo.he || 0) + (u.ammo.shrapnel || 0) : 0;
      t.ammoMax = Math.max(t.ammoMax, ammo, 1);
      t.am.set(ammo / t.ammoMax);
      setText(t.mode, MODE_LETTER[u.mode] || '?');
      const dead = u.alive === false;
      // lamp: amber when a piece fired in the last two seconds; red flashing when enemy shells burst on the battery
      let fired = false, hit = false;
      for (const p of u.pieces || []) if (p.firedAt != null && sim.time - p.firedAt < 1.5) fired = true;
      for (const b of this.tracker.enemy) if (b.near && sim.time - b.t < 8 && Math.hypot(b.x - u.pos.x, b.z - u.pos.z) < 450) hit = true;
      setCls(t.lamp, 'fire', fired); setCls(t.lamp, 'hit', hit);
      // loading state per piece
      const prs = u.pieces || [];
      let nReady = 0, nDead = 0, nFire = 0, nLoad = 0, best = -1;
      for (let k = 0; k < t.pips.length && k < prs.length; k++) {
        const p = prs[k], pp = t.pips[k];
        const st = PIECE_STATE[p.state] || 'idle';
        const fill = pieceFill(p);
        if (st === 'rdy') nReady++; else if (st === 'dead') nDead++; else if (st === 'fir') nFire++; else if (st === 'ldg') { nLoad++; if (fill > best) best = fill; }
        if (pp.st !== st) { pp.pip.className = `tpc st-${st}`; pp.st = st; }
        const w = Math.round(fill * 200) / 2;
        if (pp.w !== w) { pp.f.style.width = `${w}%`; pp.w = w; }
      }
      const np = prs.length;
      let txt, tc;
      if (np && nDead === np) { txt = 'DEAD'; tc = 'dead'; }
      else if (nReady) { txt = np > 1 ? `${nReady}/${np - nDead} READY` : 'READY'; tc = 'rdy'; }
      else if (nFire) { txt = 'FIRING'; tc = 'fir'; }
      else if (nLoad) { txt = `LOAD ${Math.floor(best * 100)}%`; tc = 'ldg'; }
      else { txt = 'IDLE'; tc = 'idle'; }
      setText(t.ltxt, txt);
      if (t.ltxtCls !== tc) { t.ltxt.className = `tltxt st-${tc}`; t.ltxtCls = tc; }
      setCls(t.el, 'sel', u.id === view.selectedId);
      setCls(t.el, 'dead', dead);
      setCls(t.el, 'warn', hit);
    }
    setText(this.stClock, `${clockStr(sim.clock)} hrs`);
    setText(this.stState, sim.state ? String(sim.state).toUpperCase() : '');
    const sc = sim.score;
    setText(this.stScore, sc == null ? '' : typeof sc === 'object' ? `${sc.points != null ? sc.points : sc.score != null ? sc.score : sc.total != null ? sc.total : 0}` : String(Math.round(sc)));
    SECTORS.forEach((s, i) => {
      const f = sim.front ? sim.front[s.id] : 1;
      setCls(this.fronts[i], 'lost', f === 0); setCls(this.fronts[i], 'weak', f > 0 && f < 0.5);
      this.fronts[i].title = `${s.name}: ${f === 0 ? 'LOST' : Math.round(f * 100) + '% holding'}`;
    });

    const sel = units.find((u) => u.id === view.selectedId) || units[0];
    if (!this.mounted || this.mounted.id !== sel.id) {
      if (this.mounted && this.mounted.con.dispose) this.mounted.con.dispose();
      this.host.replaceChildren();
      const memo = this.memo[sel.id] || (this.memo[sel.id] = {});
      const con = mountConsole({ id: sel.id, kind: sel.kind, send: (name, args) => this._send(sel.id, name, args), memo, shared: this.shared, mail: this.mail, tracker: this.tracker });
      this.host.append(con.el);
      this.mounted = { id: sel.id, con };
      applyHighlight();
    }
    this.mounted.con.update(dt, sel, view);
  }
}

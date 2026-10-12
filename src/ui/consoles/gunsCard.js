// The guns' state: for each piece the loading drill as it happens (shell, ram, bags, close, prime, lay,
// ready), three lamps (laid, loaded, ready), crew, health and barrel wear; then ammunition and how well
// the enemy has located the battery.
import { el, setText, setCls, setStyle, card, Lamp, Bar } from '../widgets.js';
import { STEPS, stepIndex, KIND_SHORT } from './common.js';

const LAID_TOL = 0.004;   // radians: a piece within about a quarter of a degree of its ordered line and elevation is laid
const SHORT = { shell: 'SHELL', ram: 'RAM', cartridge: 'BAGS', close: 'CLOSE', prime: 'PRIME', lay: 'LAY', ready: 'READY' };

export class GunsCard {
  constructor() {
    const c = card('THE GUNS', '', 'guns');
    this.el = c.el;
    this.sub = el('i', null, '');
    c.head.append(this.sub);
    this.list = el('div', 'glist');
    this.ammo = el('div', 'gammo');
    this.he = el('b', null, ''); this.sh = el('b', null, '');
    this.sig = new Bar({ invert: true, cls: 'sig' });
    const sw = el('div', 'gsig');
    sw.append(el('i', null, 'ENEMY HAS LOCATED US'), this.sig.el);
    this.ammo.append(el('i', null, 'H.E.'), this.he, el('i', null, 'SHRAPNEL'), this.sh);
    c.body.append(this.list, this.ammo, sw);
    this.rows = [];
    this.n = -1;
  }
  build(n) {
    this.list.replaceChildren();
    this.rows = [];
    for (let i = 0; i < n; i++) {
      const r = el('div', 'grow');
      const head = el('div', 'ghead');
      const name = el('div', 'gname');
      const no = el('b', null, `No. ${i + 1}`);
      const crew = el('i', null, '');
      name.append(no, crew);
      const lamps = el('div', 'glamps');
      const laid = new Lamp('LAID', 'green'), loaded = new Lamp('LOADED', 'amber'), ready = new Lamp('READY', 'red');
      lamps.append(laid.el, loaded.el, ready.el);
      head.append(name, lamps);
      const dots = el('div', 'crew');
      const pipe = el('div', 'pipe');
      const cells = STEPS.map((s) => { const x = el('span', 'pc', SHORT[s.k]); pipe.append(x); return x; });
      const prog = el('i', 'pprog');
      pipe.append(prog);
      const line = el('div', 'gline');
      const state = el('div', 'gstate', '');
      const hp = new Bar(), wear = new Bar({ invert: true });
      hp.el.title = 'Health of the piece'; wear.el.title = 'Barrel wear';
      line.append(state, el('span', null, 'HP'), hp.el, el('span', null, 'WEAR'), wear.el);
      r.append(head, dots, pipe, line);
      this.list.append(r);
      this.rows.push({ r, crew, dots, laid, loaded, ready, cells, prog, hp, wear, state });
    }
    this.n = n;
  }
  update({ unit }) {
    const ps = unit.pieces || [];
    if (ps.length !== this.n) this.build(ps.length);
    setCls(this.el, 'few', ps.length <= 2);
    setText(this.sub, `${KIND_SHORT[unit.kind] || unit.kind} · ${unit.battery || ''}`);
    ps.forEach((p, i) => {
      const w = this.rows[i];
      const dead = p.state === 'dead';
      const idx = stepIndex(p);
      setCls(w.r, 'dead', dead);
      setCls(w.r, 'hurt', !dead && p.hp < p.maxHp * 0.5);
      setText(w.crew, `crew ${p.crew} of ${p.crewMax}`);
      if (w.dots.children.length !== p.crewMax) { w.dots.replaceChildren(...Array.from({ length: p.crewMax }, () => el('i'))); w.dotN = -1; }
      if (w.dotN !== p.crew) { w.dotN = p.crew; for (let k = 0; k < p.crewMax; k++) w.dots.children[k].className = k < p.crew ? 'on' : ''; }
      const laid = !dead && p.cmd && Math.abs(p.az - p.cmd.az) < LAID_TOL && Math.abs(p.el - p.cmd.el) < LAID_TOL;
      w.laid.set(laid); w.loaded.set(!dead && p.loaded); w.ready.set(!dead && p.state === 'ready' ? 2 : 0);
      w.cells.forEach((c, j) => { setCls(c, 'done', idx > j); setCls(c, 'now', idx === j); });
      const frac = p.job && p.job.dur ? Math.min(1, p.job.t / p.job.dur) : 0;
      // the progress bar sits under the cell being worked; it spans one cell's width
      if (idx >= 0 && idx < 6 && p.job) { setStyle(w.prog, 'left', `${(idx / 7) * 100}%`); setStyle(w.prog, 'width', `${(frac / 7) * 100}%`); }
      else { setStyle(w.prog, 'width', '0%'); }
      w.hp.set(p.maxHp ? p.hp / p.maxHp : 1);
      w.wear.set(p.wear || 0);
      let st;
      if (dead) st = 'KNOCKED OUT';
      else if (p.state === 'recoil') st = 'in recoil';
      else if (p.state === 'ready') st = laid ? 'laid and loaded: ready to fire' : 'loaded; laying';
      else if (p.state === 'laying') st = 'laying on the ordered line';
      else if (p.job) st = (p.job.step === 'depress' ? 'run out to loading elevation' : p.job.step === 'open' ? 'opening the breech' : `loading: ${SHORT[p.job.step] || p.job.step}`).toLowerCase();
      else st = p.loaded ? 'loaded' : 'idle';
      setText(w.state, st);
    });
    const a = unit.ammo || {};
    setText(this.he, a.he != null ? String(a.he) : '--');
    setText(this.sh, a.shrapnel != null ? String(a.shrapnel) : '--');
    setCls(this.ammo, 'low', (a.he || 0) < 12);
    this.sig.set(unit.signature || 0);
  }
}

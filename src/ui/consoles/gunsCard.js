// The guns' state: for each piece the loading drill as it happens (shell, ram, bags, close, prime, lay,
// ready), three lamps (laid, loaded, ready), crew, health and barrel wear; then ammunition and how well
// the enemy has located the battery. The WW1 mode's 42 cm guns add their bed (src/ww1/special.js): its line, the arc
// the handwheels give, and the key that relays it onto the ordered target's line (T), with its progress.
import { el, setText, setCls, setStyle, card, Lamp, Bar, Btn } from '../widgets.js';
import { STEPS, stepIndex, KIND_SHORT } from './common.js';

const LAID_TOL = 0.004;   // radians: a piece within about a quarter of a degree of its ordered line and elevation is laid
const SHORT = { shell: 'SHELL', ram: 'RAM', cartridge: 'BAGS', close: 'CLOSE', prime: 'PRIME', lay: 'LAY', ready: 'READY' };

const DEG = Math.PI / 180;
const brg = (r) => `${Math.round((((r / DEG) % 360) + 360) % 360)}°`;
const span = (s, long) => (s < 120 ? `${Math.ceil(s)}${long ? ' seconds' : ' s'}` : `${Math.round(s / 60)}${long ? ' minutes' : ' min'}`);

export class GunsCard {
  constructor({ onBed = null } = {}) {
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
    this.bed = el('div', 'gbed');
    this.bedText = el('i', null, '');
    this.bedBar = new Bar({ cls: 'bedbar' });
    this.bedBtn = new Btn({ main: 'BETTUNG UMLEGEN', sub: 'T: relay the bed', cls: 'bedbtn', onClick: () => onBed?.() });
    this.bed.append(this.bedText, this.bedBar.el, this.bedBtn.el);
    c.body.append(this.list, this.bed, this.ammo, sw);
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
      else if (p.job) st = (p.job.step === 'depress' ? 'run out to loading elevation' : p.job.step === 'open' ? 'opening the breech' : p.job.step === 'lay' && unit.gate ? `loaded; waiting: ${unit.gate}` : `loading: ${SHORT[p.job.step] || p.job.step}`).toLowerCase();
      // a special weapon's controller holding the unit (the Karl's hull turning): say what it is doing, not idle
      else if (unit.gate && unit.special) st = (p.loaded ? `loaded; ${unit.gate}` : unit.gate).toLowerCase();
      // a gun that cannot carry out the order says why (the status line has the whole reason)
      else if (unit.order?.target && p.blocked) st = p.cmd?.why === 'inside minimum range' ? 'too close' : p.cmd?.why || 'cannot lay';
      else if (unit.order?.target && !p.loaded && p.crew < Math.ceil(p.crewMax * 0.3)) st = 'too few men to serve it';
      else if (unit.order?.target && !p.loaded && unit.mode !== 'hold' && (unit.ammo?.[unit.order.fuze === 'shrapnel' ? 'shrapnel' : 'he'] ?? 1) <= 0) st = 'no shells';
      else st = p.loaded ? 'loaded' : 'idle';
      setText(w.state, st);
    });
    // the bed (WW1 Bertha and Gamma): where it lies, and relaying it onto the target's line
    const bed = unit.special?.bed;
    setCls(this.bed, 'on', !!bed);
    if (bed) {
      const moving = bed.state === 'moving', o = unit.order || {};
      const off = o.target && o.line != null ? Math.atan2(Math.sin(o.line - unit.zero), Math.cos(o.line - unit.zero)) : 0;
      setText(this.bedText, moving
        ? `Bettung umlegen onto ${brg(bed.to)}: ${span(bed.dur - bed.t)} to go. The gun cannot fire.`
        : `Bed on ${brg(unit.zero)}: the gun traverses ${+(unit.arc / DEG).toFixed(1)}° either way.${o.target && Math.abs(off) > unit.arc ? ` The target lies ${Math.round(Math.abs(off) / DEG)}° ${off > 0 ? 'right' : 'left'}: relay the bed${bed.dur ? ` (about ${span(bed.dur)})` : ''}.` : ''}`);
      this.bedBar.set(moving ? bed.t / bed.dur : 0);
      setCls(this.bedBar.el, 'hide', !moving);
      this.bedBtn.enable(!moving && !!o.target && Math.abs(off) > 2 * DEG);
      this.bedBtn.el.title = moving ? 'The bed is being relaid.' : !o.target ? 'Lay on a target first: the bed is relaid onto its line.' : `Relay the bed onto the target's line (${brg(o.line)})${bed.dur ? `: the gun is out of action for about ${span(bed.dur, true)}` : ''}.`;
    }
    const a = unit.ammo || {};
    setText(this.he, a.he != null ? String(a.he) : '--');
    setText(this.sh, a.shrapnel != null ? String(a.shrapnel) : '--');
    setCls(this.ammo, 'low', (a.he || 0) < 12);
    this.sig.set(unit.signature || 0);
  }
}

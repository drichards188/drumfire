// The range table card for the current charge: rows around the ordered range (three, up to nine on a taller card),
// the nearest highlighted, from sim.rangeTable (the same integrator the shells fly). Ranges are yards here.
import { el, setText, setCls, card } from '../widgets.js';
import { toYd, elev, commas } from './common.js';
import { TH, lenShort } from '../theatre.js';

const ROW_H = 16; // px: a row of the table (.rtr: 11px type, 2px padding above and below, a dotted rule)

export class RangeTable {
  constructor() {
    const c = card('RANGE TABLE', '', 'rtab');
    this.el = c.el;
    this.title = c.head.firstChild;
    this.sub = el('i', null, '');
    c.head.append(this.sub);
    const t = el('div', 'rt');
    const head = el('div', 'rtr rth');
    for (const h of [TH.metric ? 'METRES' : 'YARDS', TH.metric ? 'ELEVATION (STRICH)' : 'ELEVATION', 'TIME OF FLIGHT']) head.append(el('b', null, h));
    t.append(head);
    this.t = t;
    this.rows = [];
    this.build(3);
    c.body.append(t);
    this.key = '';
    // a taller card (a tall screen gives the top row its spare height) shows more of the table
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        const room = c.body.clientHeight - head.offsetHeight - 6;
        const n = Math.max(3, Math.min(9, Math.floor(room / ROW_H)));
        if (n !== this.rows.length) { this.build(n); if (this.args) this.update(this.args); } // (filled at once, not a frame later)
      }).observe(c.body);
    }
  }
  build(n) {
    for (const row of this.rows) row.r.remove();
    this.rows = [];
    for (let i = 0; i < n; i++) {
      const r = el('div', 'rtr');
      const cells = [el('span'), el('span'), el('span')];
      r.append(...cells);
      this.t.append(r);
      this.rows.push({ r, cells });
    }
  }
  update(args) {
    this.args = args;
    const { sim, unit } = args, o = unit.order || {};
    const tab = (sim.rangeTable && sim.rangeTable(unit.kind, o.charge || 0)) || [];
    setText(this.sub, tab.length ? `Charge ${(o.charge || 0) + 1}   ${commas(toYd(tab[0].range))} to ${commas(toYd(tab[tab.length - 1].range))} ${lenShort()}` : '');
    if (!tab.length) return;
    let n = 0, best = 1e9;
    for (let i = 0; i < tab.length; i++) { const d = Math.abs(tab[i].range - (o.range || 0)); if (d < best) { best = d; n = i; } }
    const N = this.rows.length, first = Math.max(0, Math.min(tab.length - N, n - ((N - 1) >> 1)));
    this.rows.forEach((row, i) => {
      const e = tab[first + i];
      if (!e) { setText(row.cells[0], ''); setText(row.cells[1], ''); setText(row.cells[2], ''); return; }
      setText(row.cells[0], commas(Math.round(toYd(e.range) / 100) * 100));
      setText(row.cells[1], elev(e.el));
      setText(row.cells[2], `${e.tof.toFixed(1)} s`);
      setCls(row.r, 'cur', first + i === n && !!o.target);
    });
  }
}

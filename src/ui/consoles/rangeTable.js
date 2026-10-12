// The range table card for the current charge: five rows around the ordered range, the nearest
// highlighted, from sim.rangeTable (the same integrator the shells fly). Ranges are yards here.
import { el, setText, setCls, card } from '../widgets.js';
import { toYd, elev, commas } from './common.js';

export class RangeTable {
  constructor() {
    const c = card('RANGE TABLE', '', 'rtab');
    this.el = c.el;
    this.title = c.head.firstChild;
    this.sub = el('i', null, '');
    c.head.append(this.sub);
    const t = el('div', 'rt');
    const head = el('div', 'rtr rth');
    for (const h of ['YARDS', 'ELEVATION', 'TIME OF FLIGHT']) head.append(el('b', null, h));
    t.append(head);
    this.rows = [];
    for (let i = 0; i < 5; i++) {
      const r = el('div', 'rtr');
      const cells = [el('span'), el('span'), el('span')];
      r.append(...cells);
      t.append(r);
      this.rows.push({ r, cells });
    }
    c.body.append(t);
    this.key = '';
  }
  update({ sim, unit }) {
    const o = unit.order || {};
    const tab = (sim.rangeTable && sim.rangeTable(unit.kind, o.charge || 0)) || [];
    setText(this.sub, tab.length ? `Charge ${(o.charge || 0) + 1}   ${commas(toYd(tab[0].range))} to ${commas(toYd(tab[tab.length - 1].range))} yds` : '');
    if (!tab.length) return;
    let n = 0, best = 1e9;
    for (let i = 0; i < tab.length; i++) { const d = Math.abs(tab[i].range - (o.range || 0)); if (d < best) { best = d; n = i; } }
    let first = Math.max(0, Math.min(tab.length - 5, n - 2));
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

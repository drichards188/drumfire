// The missions list, as a clipboard of task slips: number, kind, the range from the selected battery (red when it
// cannot reach), observer, priority and the time left. Tab moves the cursor, Enter takes the mission, a click does both.
import { el, setText, setCls, card, snd } from '../widgets.js';
import { MISSION_NAME, OBSERVER, KIND_SHORT, mmss, liveMissions, taskNo, yd } from './common.js';
import { lenShort } from '../theatre.js';

// priority 1 to 10 (director PRIORITY, targets' own) as one to three stars: 9+ urgent (SOS, barrage, the biggest
// targets), 6 to 8 important (counter-battery, harassing, tanks), the rest routine
const starsOf = (p = 5) => (p >= 9 ? 3 : p >= 6 ? 2 : 1);
const STAR_TIP = ['', 'Priority: routine', 'Priority: important', 'Priority: urgent'];

export class MissionList {
  constructor({ shared, take }) {
    this.shared = shared; this.take = take;
    const c = card('MISSIONS', 'Tab: next  Enter: take', 'missions');
    this.el = c.el;
    this.list = el('div', 'mlist');
    this.empty = el('div', 'mnone', 'No calls for fire. The observers are quiet.');
    c.body.append(this.list);
    this.rows = new Map();
    this.sig = null;
  }
  rowFor(m) {
    let r = this.rows.get(m.id);
    if (r) return r;
    const e = el('div', 'mrow');
    const id = el('b', 'mid', taskNo(m.id));
    const t1 = el('div', 'mt1'), title = el('div', 'mtitle'), t2 = el('div', 'mt2'), assigned = el('div', 'massigned');
    const kind = el('span', 'mkind'), dl = el('span', 'mdl');
    const where = el('span', 'mref'), obs = el('span', 'mobs'), st = el('span', 'mst');
    t1.append(kind, dl); t2.append(where, obs, st);
    const stars = el('i', 'mpri');
    e.append(id, el('div', 'mcol'), stars);
    e.children[1].append(t1, title, t2, assigned);
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); snd('click'); this.shared.cursor = m.id; this.take(m); });
    r = { e, kind, title, dl, where, obs, st, assigned, stars, id };
    this.rows.set(m.id, r);
    return r;
  }
  update({ sim, unit }) {
    const now = sim.time || 0;
    const live = liveMissions(sim);
    const show = live.slice(0, 8);
    const sig = show.map((m) => m.id).join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      this.list.replaceChildren(...show.map((m) => this.rowFor(m).e));
      if (!show.length) this.list.append(this.empty);
      for (const [id] of this.rows) if (!show.some((m) => m.id === id)) this.rows.delete(id);
    }
    if (this.shared.cursor == null || !live.some((m) => m.id === this.shared.cursor)) this.shared.cursor = live.length ? live[0].id : null;
    for (const m of show) {
      const r = this.rowFor(m);
      const left = m.deadline != null ? m.deadline - now : null;
      const target = m.targetId && (sim.targetById?.(m.targetId) || sim.targets?.find((t) => t.id === m.targetId));
      const targetName = target ? `${target.name}${target.name === 'Ammunition dump' ? ` (${target.id})` : ''}` : m.title;
      setText(r.kind, MISSION_NAME[m.kind] || m.kind.toUpperCase());
      setText(r.title, targetName || MISSION_NAME[m.kind] || m.kind);
      r.e.title = m.title || '';
      setText(r.dl, left == null ? '' : left < 0 ? 'overdue' : mmss(left));
      setCls(r.dl, 'late', left != null && left < 30);
      // the range from the battery in the console, and whether its top charge reaches (or it is too close)
      const D = unit.pos ? Math.hypot(m.x - unit.pos.x, m.z - unit.pos.z) : null;
      const lim = this.limits(sim, unit);
      const out = D != null && lim && (D > lim.max || D < lim.min);
      setText(r.where, D == null ? '' : `${yd(D)} ${lenShort()}${out ? (D > lim.max ? ' (out of range)' : ' (too close)') : ''}`);
      setCls(r.where, 'out', !!out);
      setText(r.obs, OBSERVER[m.observer] || '');
      const guns = (sim.units || []).filter((u) => u.missionId === m.id);
      setText(r.assigned, guns.length ? `GUNS: ${guns.map((u) => KIND_SHORT[u.kind] || u.name || u.id).join(', ')}` : 'GUNS: unassigned');
      const mine = unit.missionId === m.id;
      setText(r.st, mine ? 'YOURS' : m.state === 'open' ? (m.unitId && m.unitId !== unit.id ? `unit ${m.unitId}` : 'open') : m.state === 'ranging' ? 'ranging' : m.state === 'ffe' ? 'FFE' : m.state);
      const ns = starsOf(m.priority);
      setText(r.stars, '★'.repeat(ns));
      r.stars.title = STAR_TIP[ns];
      setCls(r.e, 'cursor', m.id === this.shared.cursor);
      setCls(r.e, 'mine', mine);
      setCls(r.e, 'sos', m.kind === 'sos');
    }
  }
  // the unit kind's reach from its range tables (lowest charge's minimum, top charge's maximum), cached per kind
  limits(sim, unit) {
    const k = unit.kind, n = unit.charges;
    if (!sim.rangeTable || !n || unit.special?.solution) return null; // launch sites: their own firing data
    this.reach ??= new Map();
    if (!this.reach.has(k)) {
      const lo = sim.rangeTable(k, 0) || [], hi = sim.rangeTable(k, n - 1) || [];
      this.reach.set(k, lo.length && hi.length ? { min: Math.min(...lo.map((e) => e.range)), max: Math.max(...hi.map((e) => e.range)) } : null);
    }
    return this.reach.get(k);
  }
  cycle(dir, sim) {
    const live = liveMissions(sim);
    if (!live.length) return;
    let i = live.findIndex((m) => m.id === this.shared.cursor);
    i = i < 0 ? 0 : (i + dir + live.length) % live.length;
    this.shared.cursor = live[i].id;
  }
}

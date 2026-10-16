// The missions list, as a clipboard of task slips: number, kind, map reference, observer, priority and
// the time left. Tab moves the cursor, Enter takes the mission, a click does both.
import { el, setText, setCls, card, snd } from '../widgets.js';
import { MISSION_NAME, OBSERVER, ref, mmss, liveMissions, taskNo } from './common.js';

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
    const t1 = el('div', 'mt1'), t2 = el('div', 'mt2');
    const kind = el('span', 'mkind'), dl = el('span', 'mdl');
    const where = el('span', 'mref'), obs = el('span', 'mobs'), st = el('span', 'mst');
    t1.append(kind, dl); t2.append(where, obs, st);
    const stars = el('i', 'mpri');
    e.append(id, el('div', 'mcol'), stars);
    e.children[1].append(t1, t2);
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); snd('click'); this.shared.cursor = m.id; this.take(m); });
    r = { e, kind, dl, where, obs, st, stars, id };
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
      setText(r.kind, MISSION_NAME[m.kind] || m.kind.toUpperCase());
      setText(r.dl, left == null ? '' : left < 0 ? 'overdue' : mmss(left));
      setCls(r.dl, 'late', left != null && left < 30);
      setText(r.where, m.gridRef || ref(m.x, m.z));
      setText(r.obs, OBSERVER[m.observer] || '');
      const mine = unit.missionId === m.id;
      setText(r.st, mine ? 'YOURS' : m.state === 'open' ? (m.unitId && m.unitId !== unit.id ? `unit ${m.unitId}` : 'open') : m.state === 'ranging' ? 'ranging' : m.state === 'ffe' ? 'FFE' : m.state);
      setText(r.stars, '★'.repeat(Math.max(1, Math.min(3, m.priority || 1))));
      setCls(r.e, 'cursor', m.id === this.shared.cursor);
      setCls(r.e, 'mine', mine);
      setCls(r.e, 'sos', m.kind === 'sos');
    }
  }
  cycle(dir, sim) {
    const live = liveMissions(sim);
    if (!live.length) return;
    let i = live.findIndex((m) => m.id === this.shared.cursor);
    i = i < 0 ? 0 : (i + dir + live.length) % live.length;
    this.shared.cursor = live[i].id;
  }
}

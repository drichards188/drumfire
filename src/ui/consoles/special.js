// The WW2 mode's procedure card for the special weapons (unit.special, src/ww2/special.js): the Gustav's railway
// preparation (work gangs on the tasks) and the Karl-Gerät's emplacement (positions, turning, the hull, the ammunition
// carrier). It replaces the range table. The V-1 and V-2 launch sites have a console of their own (launch.js).
// Talks back through send(name, args), which sends sim commands, and focus(task): a Gustav task clicked on the card
// takes the camera to its work (ww2/render.js focusTask), clicked again (or done) back to the gun.
import { el, setText, setCls, card, Btn, Bar } from '../widgets.js';
import { mmss } from './common.js';

const pct = (k) => `${Math.round(k * 100)}%`;

export class SpecialCard {
  constructor({ kind, send, focus }) {
    this.kind = kind;
    this.send = send;
    this.focus = focus ?? (() => {});
    this.look = null; // the task the camera watches
    this.lookDone = 0;
    const T = {
      gustav: ['RAILWAY PREPARATION', 'Gleisbau und Montage'], karl: ['KARL-GERÄT: INTO ACTION', 'Stellungswechsel'],
    }[kind] ?? ['SPECIAL', ''];
    const c = card(T[0], T[1], 'special sp-' + kind);
    this.el = c.el;
    this.body = c.body;
    this.rows = [];
    if (kind === 'gustav') this.buildGustav();
    else if (kind === 'karl') this.buildKarl();
  }

  btn(main, sub, fn, cls = 'mini', tip = '') {
    return new Btn({ main, sub, cls, onClick: fn, tip });
  }

  // ------------------------------------------------------------------ Gustav
  buildGustav() {
    this.head = el('div', 'sp-head');
    this.body.append(this.head);
    this.list = el('div', 'sp-list');
    this.body.append(this.list);
    this.foot = el('div', 'sp-foot');
    this.hurry = this.btn('ALL HANDS', 'J: critical path', () => this.send('hurry', {}), 'mini', 'Put every gang on the critical path (J)');
    this.foot.append(this.hurry.el);
    this.body.append(this.foot);
    this.focus(null); // a fresh card watches the gun
  }

  setLook(id) {
    this.look = id;
    this.lookDone = 0;
    this.focus(id);
  }

  gustavRows(st) {
    if (this.rows.length) return;
    for (const t of st.tasks) {
      const r = el('div', 'sp-row');
      const name = el('div', 'sp-name');
      name.append(el('b', null, t.name), el('i', null, t.de + (t.optional ? '  (optional)' : '')));
      const bar = new Bar({ cls: 'sp-bar' });
      const g = el('span', 'sp-gangs', '0');
      const dec = this.btn('−', '', () => this.send('gang', { task: t.id, d: -1 }));
      const inc = this.btn('+', '', () => this.send('gang', { task: t.id, d: 1 }));
      const ctl = el('div', 'sp-ctl');
      ctl.append(dec.el, g, inc.el);
      r.append(name, bar.el, ctl);
      r.title = 'Click to watch this work; click again to return to the gun';
      r.addEventListener('click', (e) => { if (!e.target.closest('.sp-ctl')) this.setLook(this.look === t.id ? null : t.id); });
      this.list.append(r);
      this.rows.push({ id: t.id, r, bar, g, dec, inc, name });
    }
  }

  updateGustav(u, st) {
    this.gustavRows(st);
    const busy = st.tasks.reduce((s, t) => s + t.gangs, 0);
    if (st.ready) setText(this.head, `FEUERBEREIT: the gun stands on its curve. Shells ${u.ammo.he} left, barrel wear ${pct(u.pieces[0]?.wear ?? 0)}. Line by shunting along the curve: slow.`);
    else setText(this.head, `${st.gangs - busy} of ${st.gangs} work gangs free. Gangs on a task speed it; a task waits for the ones it needs. ${u.mode === 'auto' ? 'AUTO: the pioneers organise themselves.' : 'MANUAL: you assign the gangs.'}`);
    for (const row of this.rows) {
      const t = st.tasks.find((q) => q.id === row.id);
      row.bar.set(t.done / t.work);
      setText(row.g, String(t.gangs));
      const can = t.state !== 'done' && t.needs.every((n) => st.tasks.find((q) => q.id === n).state === 'done');
      setCls(row.r, 'done', t.state === 'done');
      setCls(row.r, 'wait', !can && t.state !== 'done');
      setCls(row.r, 'doing', t.gangs > 0);
      setCls(row.r, 'look', this.look === row.id);
      // a watched task that is finished holds the camera a moment, then gives it back to the gun
      if (this.look === row.id && t.state === 'done') {
        if (!this.lookDone) this.lookDone = performance.now();
        else if (performance.now() - this.lookDone > 3000) this.setLook(null);
      }
      row.inc.enable(can && t.gangs < t.max && !st.ready);
      row.dec.enable(t.gangs > 0);
    }
    setCls(this.foot, 'hide', st.ready);
    if (st.ready && this.look) this.setLook(null);
  }

  // ------------------------------------------------------------------ Karl
  buildKarl() {
    this.head = el('div', 'sp-head');
    this.pos = el('div', 'sp-pos');
    this.body.append(this.head, this.pos);
    const row = el('div', 'sp-btns');
    this.bTurn = this.btn('TURN', 'T: onto the target', () => this.send('pivot', {}), 'mini', 'Steer the whole vehicle onto the laid line (T)');
    this.bLower = this.btn('LOWER', 'L: hull down', () => this.send('lower', {}), 'mini', 'Lower the hull onto the ground: needed to fire (L)');
    this.bRaise = this.btn('RAISE', 'L: hull up', () => this.send('raise', {}), 'mini', 'Raise the hull to drive or turn (L)');
    this.bFetch = this.btn('CARRIER', 'Y: fetch shells', () => this.send('fetch', {}), 'mini', 'Send the Munitionsschlepper to the dump for four more shells (Y)');
    row.append(this.bTurn.el, this.bLower.el, this.bRaise.el, this.bFetch.el);
    this.hull = new Bar({ cls: 'sp-bar' });
    const hl = el('div', 'sp-row');
    hl.append(el('b', 'sp-k', 'HULL DOWN'), this.hull.el);
    this.carrier = el('div', 'sp-note');
    this.body.append(row, hl, this.carrier);
    this.posBtns = [];
  }

  updateKarl(u, st) {
    if (!this.posBtns.length) for (const q of st.positions) {
      const b = this.btn(`STELLUNG ${q.id.toUpperCase()}`, q.note, () => this.send('goto', { id: q.id }), 'mini sp-wide', q.name);
      this.pos.append(b.el);
      this.posBtns.push({ b, id: q.id });
    }
    const stage = { travel: 'On the approach road: choose a firing position.', driving: 'Driving to the position (about 10 km/h).', emplace: 'In position: turn onto the target if the line is outside the 4 degrees, then lower the hull.', pivot: 'Turning the whole vehicle onto the line.', lowering: 'Lowering the hull onto the ground.', down: 'Hull down: the mortar can fire. Raise it to move or turn.', raising: 'Raising the hull.' }[st.stage] ?? st.stage;
    setText(this.head, `${stage}${u.gate ? `  [${u.gate}]` : ''}`);
    for (const p of this.posBtns) { p.b.set(st.posId === p.id || st.route?.id === p.id); p.b.enable(st.lower <= 0 && st.stage !== 'driving'); }
    this.hull.set(st.lower);
    this.bTurn.enable(st.lower <= 0 && !!st.posId && st.stage === 'emplace');
    this.bLower.enable(st.stage === 'emplace');
    this.bRaise.enable(st.lower > 0 && st.stage === 'down');
    this.bFetch.enable(st.schlepper.state === 'alongside' && st.reserve > 0);
    const sc = st.schlepper;
    setText(this.carrier, `Munitionsschlepper: ${sc.state === 'away' ? `away to the dump, back in ${mmss(150 - sc.t)}` : 'alongside'}. Shells at the gun ${u.ammo.he}${u.pieces[0]?.loaded ? ' + 1 loaded' : ''}, at the dump ${st.reserve}.`);
  }

  update(u) {
    const st = u.special;
    if (!st) return;
    if (this.kind === 'gustav') this.updateGustav(u, st);
    else if (this.kind === 'karl') this.updateKarl(u, st);
  }

  // keys: the Karl's T, L, Y; the Gustav's J
  key(e, u) {
    const st = u.special, c = e.code;
    if (!st) return false;
    if (this.kind === 'karl') {
      if (c === 'KeyT') { this.send('pivot', {}); return true; }
      if (c === 'KeyL') { this.send(st.lower > 0 ? 'raise' : 'lower', {}); return true; }
      if (c === 'KeyY') { this.send('fetch', {}); return true; }
    } else if (this.kind === 'gustav' && c === 'KeyJ') { this.send('hurry', {}); return true; }
    return false;
  }
}

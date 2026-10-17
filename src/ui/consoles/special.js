// The WW2 mode's procedure card for the special weapons (unit.special, src/ww2/special.js): the Gustav's railway
// preparation (work gangs on the tasks), the Karl-Gerät's emplacement (positions, turning, the hull, the ammunition
// carrier) and the V-1 and V-2 launch drills (the firing data, the settings to dial, the checklist, faults, cover,
// the flights). It replaces the range table (Gustav, Karl) or the order card and the range table (the launch sites).
// Talks back through act(name, args), which sends sim commands.
import { el, setText, setCls, card, Btn, Bar } from '../widgets.js';
import { mmss } from './common.js';

const pct = (k) => `${Math.round(k * 100)}%`;
const deg1 = (v) => (v == null ? '---.-' : (Math.round(v * 10) / 10).toFixed(1).padStart(5, '0'));

export class SpecialCard {
  constructor({ kind, send }) {
    this.kind = kind;
    this.send = send;
    const T = {
      gustav: ['RAILWAY PREPARATION', 'Gleisbau und Montage'], karl: ['KARL-GERÄT: INTO ACTION', 'Stellungswechsel'],
      v1: ['V-1 LAUNCH DRILL', 'Abschußvorbereitung'], v2: ['A4 LAUNCH DRILL', 'Startvorbereitung'],
    }[kind] ?? ['SPECIAL', ''];
    const c = card(T[0], T[1], 'special sp-' + kind);
    this.el = c.el;
    this.body = c.body;
    this.rows = [];
    if (kind === 'gustav') this.buildGustav();
    else if (kind === 'karl') this.buildKarl();
    else this.buildLaunch();
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
      row.inc.enable(can && t.gangs < t.max && !st.ready);
      row.dec.enable(t.gangs > 0);
    }
    setCls(this.foot, 'hide', st.ready);
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

  // ------------------------------------------------------------------ V-1, V-2
  buildLaunch() {
    const v1 = this.kind === 'v1';
    this.data = el('div', 'sp-data');
    this.body.append(this.data);
    // the settings: compass or table bearing, range
    const set = el('div', 'sp-set');
    const dial = (title, key, steps, unit) => {
      const w = el('div', 'sp-dial');
      const v = el('b', 'sp-dv', '---');
      const row = el('div', 'sp-drow');
      for (const s of steps) row.append(this.btn(s > 0 ? `+${s}` : `${s}`, '', () => this.nudge(key, s)).el);
      w.append(el('i', 'ftitle', title), v, el('span', 'sp-du', unit), row);
      set.append(w);
      return v;
    };
    this.vComp = dial(v1 ? 'COMPASS (Richthaus)' : 'TABLE BEARING', 'compass', [-10, -1, -0.1, 0.1, 1, 10], 'degrees  ← →');
    this.vRange = dial(v1 ? 'AIR LOG RANGE' : 'BRENNSCHLUSS RANGE', 'range', [-10, -1, -0.1, 0.1, 1, 10], 'km  ↑ ↓');
    this.body.append(set);
    this.list = el('div', 'sp-list sp-steps');
    this.body.append(this.list);
    this.fault = el('div', 'sp-fault');
    this.fText = el('b', null, '');
    const fb = el('div', 'sp-btns');
    this.bFix = this.btn('FIX', 'O', () => this.send('fix', { how: 'fix' }));
    this.bIgnore = this.btn('CARRY ON', 'risk it', () => this.send('fix', { how: 'ignore' }));
    this.bScrub = this.btn('SCRUB', 'lose the round', () => this.send('fix', { how: 'scrub' }));
    fb.append(this.bFix.el, this.bIgnore.el, this.bScrub.el);
    this.fault.append(this.fText, fb);
    this.body.append(this.fault);
    const act = el('div', 'sp-btns');
    this.bGo = this.btn('NEXT STEP', 'Enter', () => this.send('step', {}), 'mini sp-go');
    this.bCover = this.btn('COVER', 'B: take cover', () => this.send('cover', {}), 'mini', 'Crew into the trenches: work stops (B)');
    this.bRepair = this.btn('REPAIR', v1 ? 'the ramp' : 'the table', () => this.send('repair', {}), 'mini');
    this.bTop = this.btn('TOP UP', 'LOX', () => this.send('topup', {}), 'mini', 'Top up the liquid oxygen');
    act.append(this.bGo.el, this.bCover.el, this.bRepair.el);
    if (!v1) act.append(this.bTop.el);
    this.body.append(act);
    this.status = el('div', 'sp-note');
    this.flights = el('div', 'sp-flights');
    this.body.append(this.status, this.flights);
  }

  nudge(key, d) {
    const st = this.st;
    if (!st) return;
    const cur = st.settings[key] ?? (key === 'compass' ? Math.round(st.target.bearing * 180 / Math.PI) : Math.round(st.target.dist / 1000));
    const v = Math.round((cur + d) * 10) / 10;
    this.send('set', { [key]: key === 'compass' ? ((v % 360) + 360) % 360 : Math.max(0, v) });
  }

  updateLaunch(u, st) {
    this.st = st;
    const v1 = this.kind === 'v1';
    if (!this.rows.length) for (const s of st.steps) {
      const r = el('div', 'sp-row sp-step');
      const name = el('div', 'sp-name');
      name.append(el('b', null, s.name), el('i', null, s.de));
      const bar = new Bar({ cls: 'sp-bar' });
      r.append(name, bar.el);
      this.list.append(r);
      this.rows.push({ id: s.id, r, bar });
    }
    const sol = st.solution, w = st.wind;
    setText(this.data, `Target: ${st.target.name}, ${Math.round(st.target.dist / 1000)} km. Firing data: bearing ${deg1(sol.compass)} degrees, ${v1 ? 'air log' : 'cut-off'} for ${sol.range.toFixed(1)} km (wind from ${w.from} degrees at ${w.speed} m/s${v1 ? `, ${w.headwind > 0 ? 'head' : 'tail'}wind ${Math.abs(w.headwind)} m/s: the log counts air distance` : ''}). Rounds on site: ${st.left}.`);
    setText(this.vComp, deg1(st.settings.compass));
    setText(this.vRange, st.settings.range == null ? '---.-' : st.settings.range.toFixed(1));
    setCls(this.vComp, 'off', st.settings.compass != null && Math.abs(st.settings.compass - sol.compass) > 0.25);
    setCls(this.vRange, 'off', st.settings.range != null && Math.abs(st.settings.range - sol.range) > 0.6);
    st.steps.forEach((s, i) => {
      const row = this.rows[i];
      setCls(row.r, 'done', s.state === 'done');
      setCls(row.r, 'cur', i === st.i && !st.done);
      setCls(row.r, 'doing', s.state === 'doing');
      row.bar.set(s.state === 'done' ? 1 : i === st.i && st.doing ? Math.max(0, st.t) / s.dur : 0);
    });
    const f = st.fault;
    setCls(this.fault, 'on', !!f);
    if (f) {
      setText(this.fText, `${f.text}. Fix: ${f.fixText.toLowerCase()} (${f.cost} s).${f.ignorable ? ' Or carry on and risk the round.' : ''}`);
      this.bIgnore.enable(!!f.ignorable);
    }
    const s = st.steps[st.i];
    const needs = s?.set && st.settings[s.set] == null;
    this.bGo.enable(!st.doing && !f && !st.cover && !st.done && !needs);
    this.bGo.text(st.done ? 'NO ROUNDS' : s ? (s.id === 'fire' ? (v1 ? 'FIRE' : 'HAUPTSTUFE') : 'NEXT STEP') : 'NEXT STEP', st.doing ? 'working' : needs ? 'dial it first' : 'Enter');
    this.bCover.set(st.cover);
    this.bRepair.enable(st.rampHp < 0.99 && !st.doing && !f);
    if (!v1) this.bTop.enable(st.loxOn && !st.doing && st.lox < 99);
    const lox = !v1 && st.loxOn ? `  Liquid oxygen ${st.lox.toFixed(0)}%${st.lox < 92 ? ': SHORT, it will fall short; top up' : ', boiling off'}.` : '';
    const ramp = st.rampHp < 0.99 ? `  ${v1 ? 'Ramp' : 'Table'} damage ${pct(1 - st.rampHp)}${st.rampHp < 0.35 ? ': REPAIR before launch' : ''}.` : '';
    setText(this.status, `${st.cover ? 'IN COVER: work stopped. ' : ''}${u.mode === 'auto' ? 'AUTO: the crew works the drill. ' : ''}Crew ${u.pieces[0]?.crew ?? 0} of ${u.pieces[0]?.crewMax ?? 0}.${lox}${ramp}`);
    const fl = st.flights.slice(-6).map((x) => `No. ${x.n}: ${x.state === 'flying' ? 'in flight' : x.state}${x.text && x.state !== 'flying' ? '' : ''}`).join('   ');
    setText(this.flights, fl || 'No rounds launched yet.');
  }

  update(u) {
    const st = u.special;
    if (!st) return;
    if (this.kind === 'gustav') this.updateGustav(u, st);
    else if (this.kind === 'karl') this.updateKarl(u, st);
    else this.updateLaunch(u, st);
  }

  // keys: launch dials on the arrows, the drill on Enter, cover on B, fix on O; the Karl's T, L, Y; the Gustav's J
  key(e, u) {
    const st = u.special, c = e.code, big = e.shiftKey;
    if (!st) return false;
    if (this.kind === 'v1' || this.kind === 'v2') {
      if (c === 'ArrowLeft') { this.nudge('compass', big ? -1 : -0.1); return true; }
      if (c === 'ArrowRight') { this.nudge('compass', big ? 1 : 0.1); return true; }
      if (c === 'ArrowUp') { this.nudge('range', big ? 10 : 0.5); return true; }
      if (c === 'ArrowDown') { this.nudge('range', big ? -10 : -0.5); return true; }
      if (c === 'Enter' || c === 'Space') { this.send('step', {}); return true; }
      if (c === 'KeyB') { this.send('cover', {}); return true; }
      if (c === 'KeyO') { this.send('fix', { how: 'fix' }); return true; }
    } else if (this.kind === 'karl') {
      if (c === 'KeyT') { this.send('pivot', {}); return true; }
      if (c === 'KeyL') { this.send(st.lower > 0 ? 'raise' : 'lower', {}); return true; }
      if (c === 'KeyY') { this.send('fetch', {}); return true; }
    } else if (this.kind === 'gustav' && c === 'KeyJ') { this.send('hurry', {}); return true; }
    return false;
  }
}

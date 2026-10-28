// The fire order card: what the battery commander writes on the order form. Target reference, line,
// range, elevation from the range table, charge, fuze, rounds, the corrections made so far, and the
// brass keys (corrections, Fire, Cease). Values are typed in; the keys act on the sim's `correct` command
// in yards (converted to metres here).
import { el, setText, setCls, card, label, Btn, Seg } from '../widgets.js';
import { tut } from '../highlight.js';
import { ref, dm, elev, yd, FUZE, fromYd, commas, gunChoices } from './common.js';
import { TH, lenU, lenName, lenShort } from '../theatre.js';
import { pickGuns } from '../../sim/guns.js';   // pure: which pieces a `guns` choice fires, for the FIRE label

export const STEPS_YD = [10, 25, 50, 100, 200];

function field(title, cls = '') {
  const f = el('div', 'fld ' + cls);
  const v = el('div', 'fval', '--');
  const s = el('div', 'fsub', '');
  f.append(el('i', 'ftitle', title), v, s);
  return { el: f, v, s };
}
function stepper(title, onDec, onInc) {
  const f = el('div', 'fld stp');
  const row = el('div', 'srow');
  const mk = (t, fn) => { const b = new Btn({ main: t, cls: 'mini', onClick: fn }); return b; };
  const dec = mk('◀', onDec), inc = mk('▶', onInc);
  const v = el('div', 'fval', '--');
  row.append(dec.el, v, inc.el);
  const s = el('div', 'fsub', '');
  f.append(el('i', 'ftitle', title), row, s);
  return { el: f, v, s, dec, inc };
}

export class OrderCard {
  constructor({ send, act, cfg }) {
    this.send = send; this.act = act; this.cfg = cfg;
    this.step = 2;                                  // index into STEPS_YD (50 yards)
    const c = card('FIRE ORDER', 'battery commander', 'order');
    this.el = c.el;
    const b = c.body;
    this.target = el('div', 'tgt');
    this.tRef = el('div', 'tref', '--');
    this.tName = el('div', 'tname', 'No target laid');
    const stamp = el('div', 'tstamp', TH.orderStamp);
    this.target.append(el('i', 'ftitle', 'TARGET'), this.tRef, this.tName, stamp);
    // (the range's figures are short; the line and the elevation have the long notes: "Strich, on the line")
    this.line = field('LINE'); this.range = field('RANGE', 'narrow'); this.el_ = field('ELEVATION');
    const r2 = el('div', 'frow3');
    r2.append(this.line.el, this.range.el, this.el_.el);
    this.charge = stepper('CHARGE', () => this.act('charge', -1), () => this.act('charge', 1));
    this.tof = field('TIME OF FLIGHT');
    this.rounds = stepper('ROUNDS / PIECE', () => this.act('rounds', -1), () => this.act('rounds', 1));
    const r3 = el('div', 'frow3');
    r3.append(this.charge.el, this.tof.el, this.rounds.el);
    this.fuze = new Seg({
      cls: 'fuze', items: cfg.fuzes.map((f) => ({ v: f, main: FUZE[f].main, sub: FUZE[f].sub })),
      onChange: (v) => this.act('fuze', v),
    });
    const fz = el('div', 'frowf');
    fz.append(el('i', 'ftitle', 'FUZE'), this.fuze.el);
    // which guns fire: hidden for a one-piece unit
    const choices = gunChoices(cfg.pieces || 1);
    this.gunsRow = el('div', 'frowf frowg');
    this.guns = new Seg({ cls: 'gunsel', items: choices, onChange: (v) => this.act('guns', v) });
    this.gunsRow.append(el('i', 'ftitle', 'GUNS'), this.guns.el);
    if (!choices.length) this.gunsRow.style.display = 'none';
    tut(this.gunsRow, 'gunsel');
    this.corr = el('div', 'corr');
    this.corrVal = el('b', null, 'none');
    this.corr.append(el('i', null, 'CORRECTIONS MADE'), this.corrVal);
    // brass keys: add and drop (range) up and down, left and right (line)
    const kp = el('div', 'keypad');
    const k = (name, sub, fn, cls) => { const x = new Btn({ main: name, sub, cls: 'key ' + cls, onClick: fn }); return x; };
    this.bAdd = k('ADD', '↑', () => this.act('corr', 'add'), 'ka');
    this.bDrop = k('DROP', '↓', () => this.act('corr', 'drop'), 'kd');
    this.bLeft = k('LEFT', '←', () => this.act('corr', 'left'), 'kl');
    this.bRight = k('RIGHT', '→', () => this.act('corr', 'right'), 'kr');
    this.bStep = new Btn({ main: TH.metric ? '50 m' : '50 yd', sub: 'X step', cls: 'key kstep', onClick: () => this.act('step') });
    for (const [b, n] of [[this.bAdd, 'add'], [this.bDrop, 'drop'], [this.bLeft, 'left'], [this.bRight, 'right'], [this.bStep, 'step']]) tut(b.el, `${n} keypad`);
    kp.append(this.bAdd.el, this.bLeft.el, this.bStep.el, this.bRight.el, this.bDrop.el);
    this.bFire = new Btn({ main: 'FIRE', sub: 'Space', cls: 'fire', hold: true, onDown: () => this.act('fire'), onUp: () => {} });
    this.bCease = new Btn({ main: 'CEASE', sub: 'Backspace', cls: 'cease', onClick: () => this.act('cease') });
    tut(this.bFire.el, 'fire'); tut(this.bCease.el, 'cease');
    const fc = el('div', 'firecol');
    fc.append(this.bFire.el, this.bCease.el);
    const bottom = el('div', 'orderbot');
    bottom.append(kp, fc);
    tut(this.target, 'target'); tut(this.line.el, 'line'); tut(this.range.el, 'range'); tut(this.el_.el, 'elevation'); tut(this.charge.el, 'charge');
    tut(this.tof.el, 'tof'); tut(this.rounds.el, 'rounds'); tut(fz, 'fuze'); tut(this.corr, 'corrections'); tut(c.el, 'order');
    b.append(this.target, r2, r3, fz, this.gunsRow, this.corr, bottom);
  }

  update(x) {
    const { unit, sim, nCharges, missionName, ready, alive, stepYd } = x;
    const o = unit.order || {};
    const t = o.target;
    setText(this.tRef, t ? ref(t.x, t.z) : '-- . -- . -');
    setText(this.tName, missionName || (t ? 'Map point' : 'Click the board, or take a mission (Tab, Enter)'));
    setCls(this.target, 'none', !t);
    setText(this.line.v, t ? dm(o.line) : TH.metric ? '--‑--' : '---°--′');
    setText(this.line.s, o.adj && Math.abs(o.adj.right) > 0.5 ? `${o.adj.right > 0 ? 'right' : 'left'} ${commas(Math.abs(o.adj.right) / lenU())}` : TH.metric ? 'Strich, on the line' : 'on the line');
    setText(this.range.v, t ? yd(o.range) : '----');
    setText(this.range.s, lenName());
    setText(this.el_.v, t ? elev(o.el) : TH.metric ? '---' : '--°--′');
    setText(this.el_.s, t ? (TH.metric ? 'Strich, range table' : 'from the range table') : '');
    setText(this.charge.v, String((o.charge || 0) + 1));
    setText(this.charge.s, `of ${nCharges}`);
    this.charge.dec.enable((o.charge || 0) > 0);
    this.charge.inc.enable((o.charge || 0) < nCharges - 1);
    setText(this.tof.v, t ? `${Math.round(o.tof)} sec` : '--');
    setText(this.tof.s, t ? `apex ${commas(x.apexYd || 0)} ${lenShort()}` : '');
    setText(this.rounds.v, String(o.rounds || 1));
    setText(this.rounds.s, this.cfg.rounds.length > 1 && (o.rounds || 1) > 1 ? 'fire for effect' : 'ranging round');
    this.rounds.dec.enable((o.rounds || 1) > this.cfg.rounds[0]);
    this.rounds.inc.enable((o.rounds || 1) < this.cfg.rounds[this.cfg.rounds.length - 1]);
    this.fuze.set(o.fuze || 'instant');
    const a = o.adj || { add: 0, right: 0 };
    const addY = Math.round(a.add / lenU()), rY = Math.round(a.right / lenU());
    const parts = [];
    if (addY) parts.push(`${addY > 0 ? 'ADD' : 'DROP'} ${Math.abs(addY)}`);
    if (rY) parts.push(`${rY > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(rY)}`);
    setText(this.corrVal, parts.length ? parts.join('  ·  ') : 'none');
    this.bStep.text(`${stepYd} ${TH.metric ? 'm' : 'yd'}`);
    // the FIRE key says what it will fire
    const sel = x.gunsSel, multi = this.guns.btns.size > 0;
    let main = 'FIRE', sub = ready > 0 ? `${ready} of ${alive} ready` : 'Space', go = ready > 0;
    if (multi) {
      const pk = pickGuns(unit, sel === 'all' ? 'all' : +sel);
      const r = pk.filter((p) => p.state === 'ready').length;
      main = pk.length === 1 ? `FIRE No. ${pk[0].i + 1}` : pk.length === alive && alive > 2 ? 'FIRE BATTERY' : 'FIRE SECTION';
      sub = pk.length <= 1 ? (r ? 'ready' : 'not ready') : `${r} of ${pk.length} ready`;
      go = r > 0;
      this.guns.set(sel);
    }
    // an order the guns cannot carry out (x.problem, the reason on the status line): the key says so
    if (x.problem) { sub = 'cannot fire'; go = false; }
    this.bFire.set(go && !!t);
    this.bFire.text(main, sub);
    setCls(this.bFire.el, 'long', main.length > 6);
    setCls(this.bFire.el, 'armed', go && !!t);
  }
}

// The fire order card: what the battery commander writes on the order form. Target reference, line,
// range, elevation from the range table, charge, fuze, rounds, the corrections made so far, and the
// brass keys (corrections, Fire, Cease). Values are typed in; the keys act on the sim's `correct` command
// in yards (converted to metres here).
// The German pages (TH.lean, 2026-11-25, the Godot demo's cut of 2026-11-24) keep what the player acts on: the target
// with its range and grid square, rounds, fuze, guns and the corrections. The line, the elevation, the time of flight
// and (since 2026-11-26, the user's) the charge go (numbers the battery works out and the player never acts on); the
// correction keys get bold drawn arrows and the step key a dot for each of its five sizes.
import { el, setText, setCls, card, label, Btn, Seg } from '../widgets.js';
import { tut } from '../highlight.js';
import { ref, dm, elev, yd, FUZE, fromYd, commas, gunChoices } from './common.js';
import { TH, lenU, lenName, lenShort } from '../theatre.js';
import { pickGuns } from '../../sim/guns.js';   // pure: which pieces a `guns` choice fires, for the FIRE label

export const STEPS_YD = [10, 25, 50, 100, 200];

// the cover key's hover text in each of its states (the ranging counter-battery, ?cb=ranging)
const COVER_TIP = {
  off: 'Take cover (U): the crew goes to its shelters. The guns fall silent; the men are spared and near misses do the guns half the damage (a direct hit still wrecks one). Their fix on you fades faster.',
  on: 'To the guns (U): the crew leaves its shelters and runs back to the guns, about 10 s before they can fire again.',
  back: 'The crews are running back to the guns; they can fire in a few seconds. U takes them into cover again.',
};

function field(title, cls = '') {
  const f = el('div', 'fld ' + cls);
  const v = el('div', 'fval', '--');
  const s = el('div', 'fsub', '');
  f.append(el('i', 'ftitle', title), v, s);
  return { el: f, v, s };
}
// a bold arrow for a correction key (a glyph at this size is a hairline): up, down, left or right
// (a 3-unit shaft and a wide head, drawn for each direction: up and down 12 by 13, left and right 18 by 12)
const ARROW = {
  up: ['0 0 12 13', 'M6 0 L11.5 6 L7.6 6 L7.6 13 L4.4 13 L4.4 6 L0.5 6 Z'],
  down: ['0 0 12 13', 'M6 13 L0.5 7 L4.4 7 L4.4 0 L7.6 0 L7.6 7 L11.5 7 Z'],
  left: ['0 0 18 12', 'M0 6 L6 0.5 L6 4.4 L18 4.4 L18 7.6 L6 7.6 L6 11.5 Z'],
  right: ['0 0 18 12', 'M18 6 L12 0.5 L12 4.4 L0 4.4 L0 7.6 L12 7.6 L12 11.5 Z'],
};
function arrow(dir) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', ARROW[dir][0]);
  svg.setAttribute('class', `karrow ${dir}`);
  path.setAttribute('d', ARROW[dir][1]);
  svg.append(path);
  return svg;
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
    const lean = this.lean = !!TH.lean;
    // (the lean card: the target's name large, its range and grid square under it; the square stays because the
    // observers' and the Arko's slips give their targets by it)
    if (lean) { this.target.classList.add('lean'); this.target.append(el('i', 'ftitle', 'TARGET'), this.tName, this.tRef); }
    else this.target.append(el('i', 'ftitle', 'TARGET'), this.tRef, this.tName, stamp);
    // (the range's figures are short; the line and the elevation have the long notes: "Strich, on the line")
    this.line = field('LINE'); this.range = field('RANGE', 'narrow'); this.el_ = field('ELEVATION');
    const r2 = el('div', 'frow3');
    r2.append(this.line.el, this.range.el, this.el_.el);
    this.charge = stepper('CHARGE', () => this.act('charge', -1), () => this.act('charge', 1));
    this.tof = field('TIME OF FLIGHT');
    this.rounds = stepper('ROUNDS / PIECE', () => this.act('rounds', -1), () => this.act('rounds', 1));
    const r3 = el('div', 'frow3');
    // (the German pages have no charge control since 2026-11-26, the user's: the crews pick it, chargeAuto)
    if (lean) { r3.classList.add('lean'); r3.append(this.rounds.el); }
    else r3.append(this.charge.el, this.tof.el, this.rounds.el);
    // the ranging counter-battery (?cb=ranging, 2026-11-25): the crew to its shelters and back (U), in the row's third
    // place that the lean card left empty, right under the slip that says they are ranged on; shown only while the sim
    // runs that model (update), so the card is unchanged without it
    if (lean) {
      this.bCover = new Btn({ main: 'DECKUNG', sub: 'take cover · U', cls: 'cover hide', onClick: () => this.act('cover'), tip: COVER_TIP.off });
      this.coverK = '';
      r3.append(this.bCover.el);
      tut(this.bCover.el, 'cover');
    }
    this.fuze = new Seg({
      cls: 'fuze', items: cfg.fuzes.map((f) => ({ v: f, main: FUZE[f].main, sub: FUZE[f].sub })),
      onChange: (v) => this.act('fuze', v),
    });
    const fz = el('div', 'frowf');
    fz.append(el('i', 'ftitle', 'FUZE'), this.fuze.el);
    // which guns fire: hidden for a one-piece unit
    const choices = gunChoices(cfg.pieces || 1);
    this.nPieces = cfg.pieces || 1;
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
    const k = (name, sub, fn, cls, dir, tip) => {
      const x = new Btn({ main: name, sub: lean ? '' : sub, cls: 'key ' + cls + (lean ? ' arrowkey' : ''), onClick: fn, tip: lean ? tip : '' });
      if (lean) x.face.firstChild.append(arrow(dir)); // (after the word in the label, drawn above it: Btn.text reads the word first)
      return x;
    };
    const sh = `Shift ${TH.metric ? '10 m' : '10 yards'}`;
    this.bAdd = k('ADD', '↑', () => this.act('corr', 'add'), 'ka', 'up', `Add: further (Up arrow; ${sh})`);
    this.bDrop = k('DROP', '↓', () => this.act('corr', 'drop'), 'kd', 'down', `Drop: shorter (Down arrow; ${sh})`);
    this.bLeft = k('LEFT', '←', () => this.act('corr', 'left'), 'kl', 'left', `Left (Left arrow; ${sh})`);
    this.bRight = k('RIGHT', '→', () => this.act('corr', 'right'), 'kr', 'right', `Right (Right arrow; ${sh})`);
    this.bStep = new Btn({ main: TH.metric ? '50 m' : '50 yd', sub: lean ? '' : 'X step', cls: 'key kstep' + (lean ? ' dotkey' : ''), onClick: () => this.act('step'),
      tip: lean ? 'The correction step: click for the next size (X)' : '' });
    // (the lean step key cycles through its five sizes: the dots say which)
    if (lean) {
      this.dots = el('span', 'kdots');
      for (let i = 0; i < STEPS_YD.length; i++) this.dots.append(el('i'));
      this.bStep.face.firstChild.append(this.dots);
      this.dotI = -1;
    }
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
    if (lean) b.append(this.target, r3, fz, this.gunsRow, this.corr, bottom);
    else b.append(this.target, r2, r3, fz, this.gunsRow, this.corr, bottom);
  }

  // the GUNS buttons for n guns in the field (the battery's own, which a lineup may bring fewer of): built again when it changes
  setPieces(n) {
    if (n === this.nPieces) return;
    this.nPieces = n;
    const choices = gunChoices(n || 1), seg = new Seg({ cls: 'gunsel', items: choices, onChange: (v) => this.act('guns', v) });
    this.guns.el.replaceWith(seg.el);
    this.guns = seg;
    this.gunsRow.style.display = choices.length ? '' : 'none';
  }

  update(x) {
    const { unit, sim, nCharges, missionName, ready, alive, stepYd } = x;
    this.setPieces(unit.pieces?.length || 1);
    const o = unit.order || {};
    const t = o.target;
    setCls(this.target, 'none', !t);
    if (this.lean) {
      setText(this.tName, missionName || (t ? 'Map point' : 'None. Click the board, or take a mission (Tab, Enter)'));
      setText(this.tRef, t ? `${yd(o.range)} ${lenShort()}   ·   ${ref(t.x, t.z)}` : '');
    } else {
      setText(this.tRef, t ? ref(t.x, t.z) : '-- . -- . -');
      setText(this.tName, missionName || (t ? 'Map point' : 'Click the board, or take a mission (Tab, Enter)'));
    }
    setText(this.line.v, t ? dm(o.line) : TH.metric ? '--‑--' : '---°--′');
    setText(this.line.s, o.adj && Math.abs(o.adj.right) > 0.5 ? `${o.adj.right > 0 ? 'right' : 'left'} ${commas(Math.abs(o.adj.right) / lenU())}` : TH.metric ? 'Strich, on the line' : 'on the line');
    setText(this.range.v, t ? yd(o.range) : '----');
    setText(this.range.s, lenName());
    setText(this.el_.v, t ? elev(o.el) : TH.metric ? '---' : '--°--′');
    setText(this.el_.s, t ? (TH.metric ? 'Strich, range table' : 'from the range table') : '');
    setText(this.charge.v, String((o.charge || 0) + 1));
    setText(this.charge.s, this.lean ? `of ${nCharges} · ${o.chargeAuto === false ? 'set by you' : 'auto'}` : `of ${nCharges}`);
    this.charge.dec.enable((o.charge || 0) > 0);
    this.charge.inc.enable((o.charge || 0) < nCharges - 1);
    setText(this.tof.v, t ? `${Math.round(o.tof)} sec` : '--');
    setText(this.tof.s, t ? `apex ${commas(x.apexYd || 0)} ${lenShort()}` : '');
    setText(this.rounds.v, String(o.rounds || 1));
    setText(this.rounds.s, this.cfg.rounds.length > 1 && (o.rounds || 1) > 1 ? 'fire for effect' : 'ranging round');
    this.rounds.dec.enable((o.rounds || 1) > this.cfg.rounds[0]);
    this.rounds.inc.enable((o.rounds || 1) < this.cfg.rounds[this.cfg.rounds.length - 1]);
    this.fuze.set(o.fuze || 'instant');
    // the cover key: DECKUNG, TO THE GUNS while in cover, the seconds left while the crews run back; it pulses red while
    // the battery is bracketed or under fire for effect and out of cover
    if (this.bCover) {
      const cb = !!sim?.cbModel && unit.alive !== false;
      const back = cb && !unit.cover && unit.manAt != null && unit.manAt > sim.time ? Math.ceil(unit.manAt - sim.time) : 0;
      const hot = cb && !unit.cover && !back && (x.threat?.stage === 'bracketed' || x.threat?.stage === 'ffe');
      const k = !cb ? '' : unit.cover ? 'on' : back ? `back${back}` : hot ? 'hot' : 'off';
      if (k !== this.coverK) {
        this.coverK = k;
        setCls(this.bCover.el, 'hide', !cb);
        if (cb) {
          if (unit.cover) this.bCover.text('TO THE GUNS', 'U · guns silent');
          else if (back) this.bCover.text('MANNING', `${back} s · U: cover`);
          else this.bCover.text('DECKUNG', 'take cover · U');
          this.bCover.set(!!unit.cover);
          setCls(this.bCover.el, 'back', !!back);
          setCls(this.bCover.el, 'hot', hot);
          this.bCover.el.title = COVER_TIP[unit.cover ? 'on' : back ? 'back' : 'off'];
        }
      }
    }
    const a = o.adj || { add: 0, right: 0 };
    const addY = Math.round(a.add / lenU()), rY = Math.round(a.right / lenU());
    const parts = [];
    if (addY) parts.push(`${addY > 0 ? 'ADD' : 'DROP'} ${Math.abs(addY)}`);
    if (rY) parts.push(`${rY > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(rY)}`);
    setText(this.corrVal, parts.length ? parts.join('  ·  ') : 'none');
    this.bStep.text(`${stepYd} ${TH.metric ? 'm' : 'yd'}`);
    if (this.dots) {
      const i = STEPS_YD.indexOf(stepYd);
      if (i !== this.dotI) { this.dotI = i; [...this.dots.children].forEach((d, j) => d.classList.toggle('on', j === i)); }
    }
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
    this.bFire.text(main, this.lean && go && !x.problem ? `${sub} · Space` : sub);
    setCls(this.bFire.el, 'long', main.length > 6);
    setCls(this.bFire.el, 'armed', go && !!t);
  }
}

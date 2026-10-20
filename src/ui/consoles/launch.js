// The console of a launch site (the WW2 mode's V-1 ramp and A4 firing table: KINDS[kind].launcher). A launch site
// has no fire orders, guns or calls for fire, so its console is built around the drill: the header (status line,
// AUTO / MANUAL / HOLD), FIRING DATA (the target, the wind, the two settings to dial and the plot of where they send
// the round: launchPlot.js), the LAUNCH DRILL (what the crew is doing, the one next action on the big key, a fault to
// decide, the checklist), the INSTRUMENTS (launchGauges.js), the ROUNDS (each round followed to its result) and the
// message pad. Reads unit.special (src/ww2/special.js LaunchCtl); talks back through send(name, args).
// Keys: Enter or Space the big key; arrows the dials (Shift: coarse); B cover; O fix, I carry on, X scrub; R repair;
// T top up the oxygen (A4); A auto or manual. Every refused order is explained (the controller's `refused`).
import { el, setText, setCls, setStyle, card, Seg, Btn, Bar, hw, snd } from '../widgets.js';
import { tut } from '../highlight.js';
import { MessagePad } from './messagePad.js';
import { FiringCard, verdict } from './launchPlot.js';
import { GaugesCard } from './launchGauges.js';
import { mmss } from './common.js';

const TAU = Math.PI * 2;
const SERIF = "'Bitstream Charter','Liberation Serif','DejaVu Serif',Georgia,serif";
const TYPE = "'Courier 10 Pitch','Liberation Mono','FreeMono',monospace";
const pc = (k) => `${Math.round(k * 100)}%`;
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// what the drill wants from the player now: the big key's words and the command it sends (null: nothing to press)
function primary(u, st, v1) {
  const s = st.steps[st.i], dial = (k) => (k === 'compass' ? (v1 ? 'COMPASS' : 'TABLE BEARING') : (v1 ? 'AIR LOG' : 'BRENNSCHLUSS'));
  const ramp = v1 ? 'RAMP' : 'TABLE';
  if (u.alive === false || u.pieces?.[0]?.state === 'dead') return { main: 'SITE DESTROYED', sub: '' };
  if (st.done) return { main: 'NO ROUNDS LEFT', sub: 'the site stands down' };
  if (st.fault) return { main: 'FIX THE FAULT', sub: 'Enter · O', cmd: ['fix', { how: 'fix' }], warn: true };
  if (u.mode === 'auto') return { main: 'AUTO', sub: 'the crew runs the drill · A: manual' };
  if (st.cover) return st.alarm != null ? { main: 'IN COVER', sub: 'wait for the all clear' } : { main: 'BACK TO WORK', sub: 'all clear · Enter · B', cmd: ['cover'] };
  if (st.alarm != null && st.hold !== 'fire') return { main: 'TAKE COVER', sub: `raiders in ${mmss(st.alarm)} · Enter · B`, cmd: ['cover'], warn: true };
  if (st.repair != null) return { main: `REPAIRING THE ${ramp}`, sub: mmss(st.repair) };
  if (st.topup != null) return { main: 'TOPPING UP LOX', sub: mmss(st.topup) };
  switch (st.hold) {
    case 'repair': return { main: `REPAIR THE ${ramp}`, sub: 'damaged · Enter · R (1:30)', cmd: ['repair'], warn: true };
    case 'fire':
      if (v1) return { main: 'FIRE', sub: 'Enter: engine, then the catapult', cmd: ['step'], fire: true };
      return s?.id === 'fire' ? { main: 'HAUPTSTUFE', sub: 'flame steady · Enter: lift-off', cmd: ['step'], fire: true } : { main: 'VORSTUFE', sub: 'Enter: ignition', cmd: ['step'], fire: true };
    case 'dial': {
      const set = st.settings[s.set] != null;
      return { main: `DIAL THE ${dial(s.set)}`, sub: set ? 'to the data · or Enter: as dialled' : (s.set === 'compass' ? 'with ← →' : 'with ↑ ↓'), cmd: set ? ['step'] : null, dial: true };
    }
    case 'start':
      if (u.mode === 'hold') return { main: 'STOOD DOWN', sub: 'MANUAL to carry on' };
      return { main: st.i === 0 ? (st.n === 0 ? 'START THE DRILL' : 'NEXT ROUND') : 'CARRY ON', sub: 'Enter', cmd: ['step'] };
  }
  if (st.quick) return { main: 'RELOADING', sub: `the crew: ${lc(s?.name ?? '')}` };
  return { main: 'CREW AT WORK', sub: '] speeds up time' };
}

// the status line: the same state in a sentence, with the key
function statusLine(u, st, v1) {
  const s = st.steps[st.i], ramp = v1 ? 'ramp' : 'firing table';
  const left = Math.max(0, (s?.dur ?? 0) - st.t);
  if (u.alive === false || u.pieces?.[0]?.state === 'dead') return ['SITE DESTROYED.', 'bad'];
  if (st.done) return ['NO ROUNDS LEFT: the site stands down.', ''];
  if (st.fault) return [`FAULT: ${st.fault.text}. Enter or O: fix · ${st.fault.ignorable ? 'I: carry on · ' : ''}X: scrub.`, 'bad'];
  if (st.cover) return st.alarm != null ? ['IN COVER: the raiders are over the site. The drill waits.', 'bad'] : ['ALL CLEAR: Enter or B sends the crew back to work.', 'go'];
  if (st.alarm != null && u.mode !== 'auto') return [`FLIEGERALARM: raiders over the site in ${mmss(st.alarm)}. B: take cover (the drill waits).`, 'bad'];
  if (u.mode === 'auto') return [`AUTO: the crew runs the drill${s && st.doing ? `: ${lc(s.name)} (${mmss(left)})` : ''}. A or MANUAL to take over.`, ''];
  if (st.repair != null) return [`REPAIRING THE ${ramp.toUpperCase()}: ${mmss(st.repair)}.`, ''];
  if (st.topup != null) return [`TOPPING UP THE LIQUID OXYGEN: ${mmss(st.topup)}.`, ''];
  const lox = !v1 && st.loxOn && st.lox < 92 ? ` LOX ${st.lox.toFixed(0)}%: it will fall short (T: top up).` : '';
  switch (st.hold) {
    case 'repair': return [`THE ${ramp.toUpperCase()} IS DAMAGED (${pc(1 - st.rampHp)}): Enter or R repairs it (1:30).`, 'bad'];
    case 'fire':
      if (v1) return [`READY: Enter starts the pulse jet and fires the catapult.${lox}`, 'go'];
      return s?.id === 'fire' ? ['VORSTUFE BURNING: Enter for the Hauptstufe.', 'go'] : [`READY: Enter lights the Vorstufe.${lox}`, lox ? 'bad' : 'go'];
    case 'dial': {
      const key = s.set, ver = verdict(st, key), data = key === 'compass' ? `${st.solution.compass.toFixed(1)}°` : `${st.solution.range.toFixed(1)} km`;
      const what = key === 'compass' ? (v1 ? 'COMPASS' : 'TABLE BEARING') : (v1 ? 'AIR LOG' : 'BRENNSCHLUSS');
      const how = key === 'compass' ? '← →' : '↑ ↓';
      return [`DIAL THE ${what} to ${data} with ${how}${ver.none ? '' : ` (now ${ver.text.toLowerCase().replace(/:.*/, '')}). Enter: go on as dialled`}.`, ''];
    }
    case 'start':
      if (u.mode === 'hold') return ['HOLD: the crew stands down. MANUAL to carry on.', ''];
      if (st.i === 0 && st.n === 0) return ['Enter starts the drill: the crew carries on step by step and stops where it needs you.', 'go'];
      if (st.i === 0) return [`NEXT ROUND: Enter (${st.left} left).`, 'go'];
      return [`Enter: carry on with "${lc(s.name)}".`, 'go'];
  }
  if (s && st.doing) return [`${st.t < 0 ? 'FIXING' : st.quick ? 'RELOADING' : 'WORKING'}: ${lc(s.name)} (${mmss(st.t < 0 ? -st.t + s.dur : left)}). ] speeds up time.${lox}`, ''];
  return ['', ''];
}

class DrillCard {
  constructor({ kind, act }) {
    const v1 = kind === 'v1';
    this.v1 = v1;
    this.act = act;
    const c = card(v1 ? 'V-1 LAUNCH DRILL' : 'A4 LAUNCH DRILL', v1 ? 'Abschußvorbereitung' : 'Startvorbereitung', 'ldrill');
    this.el = c.el;
    tut(this.el, 'special drill');
    this.round = el('i', 'ld-round', '');
    c.head.append(this.round);
    // now: the step, what the crew is doing, the progress
    const now = el('div', 'ld-now');
    const top = el('div', 'ld-top');
    this.count = el('b', 'ld-count', '');
    this.time = el('b', 'ld-time', '');
    top.append(this.count, this.time);
    this.name = el('div', 'ld-name', '');
    this.de = el('div', 'ld-de', '');
    this.crew = el('div', 'ld-crew', '');
    this.bar = new Bar({ cls: 'ld-bar' });
    now.append(top, this.name, this.de, this.crew, this.bar.el);
    this.now = now;
    // the big key
    this.go = new Btn({ main: 'START THE DRILL', sub: 'Enter', cls: 'fire ld-go', onClick: () => this.act('primary') });
    tut(this.go.el, 'next');
    // a fault to decide
    this.fault = el('div', 'ld-fault');
    this.fText = el('b', null, '');
    const ch = (main, sub, how) => {
      const r = el('div', 'ld-choice');
      const b = new Btn({ main, sub, cls: 'mini', onClick: () => this.act('fix', how) });
      const t = el('span', null, '');
      r.append(b.el, t);
      this.fault.append(r);
      return { r, b, t };
    };
    this.fault.append(this.fText);
    this.cFix = ch('FIX', 'O · Enter', 'fix');
    this.cIgnore = ch('CARRY ON', 'I', 'ignore');
    this.cScrub = ch('SCRUB', 'X', 'scrub');
    tut(this.fault, 'fault');
    // the side keys
    const side = el('div', 'ld-side');
    this.bCover = new Btn({ main: 'COVER', sub: 'B', cls: 'mini', onClick: () => this.act('cover'), tip: 'Crew into the trenches: work stops (B)' });
    this.bRepair = new Btn({ main: 'REPAIR', sub: 'R', cls: 'mini', onClick: () => this.act('repair'), tip: `Repair the ${v1 ? 'ramp' : 'firing table'} (R, 1:30)` });
    this.bTop = new Btn({ main: 'TOP UP LOX', sub: 'T', cls: 'mini', onClick: () => this.act('topup'), tip: 'Top up the liquid oxygen (T, 30 s)' });
    side.append(this.bCover.el, this.bRepair.el);
    if (!v1) side.append(this.bTop.el);
    // the checklist
    this.list = el('div', 'ld-list');
    tut(this.list, 'checklist');
    this.rows = [];
    c.body.append(now, this.go.el, this.fault, side, this.list);
  }

  update(u, st, p) {
    const v1 = this.v1, s = st.steps[st.i];
    if (!this.rows.length) for (const q of st.steps) {
      const r = el('div', 'ld-row');
      const mark = el('i', 'ld-mark', '');
      const nm = el('span', 'ld-rn', q.name);
      const d = el('span', 'ld-rd', `${q.dur} s`);
      const bar = el('em', 'ld-rb');
      r.append(mark, nm, d, bar);
      r.title = `${q.de}: ${q.crew ?? ''}`;
      this.list.append(r);
      this.rows.push({ r, mark, bar });
    }
    setText(this.round, st.done ? `${st.n} launched` : `round ${st.n + 1} of ${st.n + st.left}`);
    // now
    const fixing = st.doing && st.t < 0;
    setText(this.count, st.done ? 'DRILL OVER' : s ? `STEP ${st.i + 1} OF ${st.steps.length}${st.quick ? ' · SET-UP SITE' : ''}` : '');
    setText(this.name, st.done ? 'No rounds left on the site' : st.repair != null ? `Repairing the ${v1 ? 'ramp' : 'firing table'}` : st.topup != null ? 'Topping up the liquid oxygen' : s?.name ?? '');
    setText(this.de, st.done || st.repair != null || st.topup != null ? '' : s?.de ?? '');
    let crew;
    if (st.done) crew = 'The site has spent its missiles.';
    else if (st.fault) crew = 'The crew waits for your decision.';
    else if (st.cover) crew = 'The crew is in the trenches. Nothing moves until they come out.';
    else if (st.repair != null) crew = 'Shovels and spanners: the crew patches the damage.';
    else if (st.topup != null) crew = 'The tanker tops the oxygen back up.';
    else if (fixing) crew = `${st.fixing ?? 'Putting the fault right'}, then the step again.`;
    else if (st.doing) crew = s?.crew ?? '';
    else if (st.hold === 'dial') crew = s.set === 'compass' ? `The crew waits for the ${v1 ? 'compass' : 'table bearing'} setting (FIRING DATA, ← →).` : `The crew waits for the ${v1 ? 'air log' : 'Brennschluss'} setting (FIRING DATA, ↑ ↓).`;
    else if (st.hold === 'fire') crew = v1 ? 'Everyone in the bunker. The firing key is yours.' : s?.id === 'fire' ? 'The Vorstufe flame burns. Main stage when you are ready.' : 'Table clear, crew in the Feuerleitpanzer. The firing key is yours.';
    else if (st.hold === 'start') crew = st.i === 0 && st.n === 0 ? 'The crew stands by. Start the drill and they carry on by themselves.' : st.i === 0 ? 'The next missile waits in the store.' : 'The crew stands by.';
    else crew = s?.crew ?? '';
    setText(this.crew, crew);
    const k = st.repair != null ? 1 - st.repair / 90 : st.topup != null ? 1 - st.topup / 30 : st.doing && s ? Math.max(0, st.t) / s.dur : 0;
    this.bar.set(k);
    setCls(this.bar.el, 'fixing', fixing);
    const left = st.repair ?? st.topup ?? (st.doing && s ? (st.t < 0 ? -st.t + s.dur : s.dur - st.t) : null);
    setText(this.time, left != null ? mmss(left) : '');
    setCls(this.now, 'hold', !st.doing && !!st.hold && st.hold !== 'done');
    setCls(this.now, 'bad', !!st.fault || (st.alarm != null && !st.cover));
    // the big key
    this.go.text(p.main, p.sub);
    this.go.enable(!!p.cmd);
    setCls(this.go.el, 'armed', !!p.fire);
    setCls(this.go.el, 'warn', !!p.warn);
    setCls(this.go.el, 'calm', !p.fire && !p.warn);
    setCls(this.go.el, 'hide', !!st.fault);
    // the fault
    const f = st.fault;
    setCls(this.fault, 'on', !!f);
    if (f) {
      setText(this.fText, `FAULT: ${f.text}`);
      setText(this.cFix.t, `${f.fixText}, then the step again: ${mmss(f.cost + (s?.dur ?? 0))}`);
      setText(this.cIgnore.t, f.ignorable ? `${f.risky ?? 'the round may fail'}` : 'not possible: it cannot fly like this');
      this.cIgnore.b.enable(!!f.ignorable);
      setText(this.cScrub.t, `the round is lost (${Math.max(0, st.left - 1)} left after it)`);
    }
    // side keys
    this.bCover.set(st.cover);
    setCls(this.bCover.el, 'alarm', st.alarm != null && !st.cover);
    this.bRepair.enable(st.rampHp < 0.99 && !st.doing && !f);
    this.bRepair.text('REPAIR', st.rampHp < 0.99 ? `R · ${pc(1 - st.rampHp)} damage` : 'R');
    if (!v1) {
      this.bTop.enable(st.loxOn && !st.doing && st.lox < 99);
      setCls(this.bTop.el, 'alarm', st.loxOn && st.lox < 92 && !st.doing);
    }
    // the checklist
    st.steps.forEach((q, i) => {
      const w = this.rows[i];
      const cur = i === st.i && !st.done;
      setCls(w.r, 'done', q.state === 'done');
      setCls(w.r, 'cur', cur);
      setCls(w.r, 'doing', cur && st.doing);
      setCls(w.r, 'pre', st.quick && q.state === 'done');
      setText(w.mark, q.state === 'done' ? '✓' : cur ? (st.doing ? '▸' : st.hold === 'dial' ? '?' : '•') : '');
      setStyle(w.bar, 'width', cur && st.doing ? `${Math.round(100 * Math.max(0, st.t) / q.dur)}%` : '0%');
    });
  }
}

// ROUNDS: the flight profile (site to target, height not to scale) and one line per round
class RoundsCard {
  constructor({ kind }) {
    this.kind = kind;
    const c = card('ROUNDS', kind === 'v1' ? 'Flugbahn' : 'Bahn', 'lrounds');
    this.el = c.el;
    tut(this.el, 'rounds');
    this.score = el('i', 'lr-score', '');
    c.head.append(this.score);
    this.cv = el('canvas', 'lr-cv');
    this.g = this.cv.getContext('2d');
    this.list = el('div', 'lr-list');
    this.odds = el('div', 'lr-odds');
    this.hint = el('div', 'lr-hint');
    c.body.append(this.cv, this.list, this.odds, this.hint);
    this.rows = [];
    this.W = 0; this.H = 0; this.dpr = 1;
  }

  update(u, st, sim) {
    const v1 = this.kind === 'v1', n = st.n + st.left;
    const hit = st.flights.filter((f) => f.state === 'target area').length;
    // the operation wants a third of the rounds in the target area (a campaign exercise has its own assignment)
    setText(this.score, sim.theatre?.campaign ? `hits ${hit}` : `hits ${hit} of ${Math.ceil(Math.max(1, n) / 3)} needed`);
    while (this.rows.length < n) {
      const r = el('div', 'lr-row');
      const no = el('b', null, `No. ${this.rows.length + 1}`);
      const ic = el('i', 'lr-ic', '');
      const t = el('span', 'lr-t', '');
      const bar = new Bar({ cls: 'mini' });
      r.append(no, ic, t, bar.el);
      this.list.append(r);
      this.rows.push({ r, ic, t, bar });
    }
    this.rows.forEach((w, i) => {
      const f = st.flights[i];
      let cls = 'wait', ic = '', t = '', k = 0;
      if (f) {
        const flying = f.state === 'flying';
        k = flying && f.eta > f.t0 ? Math.min(1, (sim.time - f.t0) / (f.eta - f.t0)) : 1;
        if (flying) { cls = 'fly'; ic = '➤'; t = f.fate === 'crash' || f.fate === 'blast' ? 'just launched' : `in flight · ${Math.round(k * st.target.dist / 1000)} km out`; }
        else if (f.state === 'target area') { cls = 'hit'; ic = '●'; t = `target area · ${(f.miss / 1000).toFixed(1)} km off`; }
        else if (f.state === 'missed') { cls = 'miss'; ic = '×'; t = `missed by ${(f.miss / 1000).toFixed(0)} km`; }
        else if (f.state === 'shot down') { cls = 'lost'; ic = '✕'; t = 'shot down on the way'; }
        else if (f.state === 'scrubbed') { cls = 'lost'; ic = '–'; t = `scrubbed: ${f.text}`; }
        else { cls = 'lost'; ic = '✕'; t = f.state === 'crashed near the site' ? (v1 ? 'crashed off the ramp' : 'crashed after lift-off') : f.state; }
      } else if (i === st.n && !st.done) { cls = 'prep'; ic = '◦'; t = st.quick ? 'on the site, being readied' : st.i === 0 && !st.doing ? 'in the store' : `in the drill: step ${st.i + 1} of ${st.steps.length}`; k = st.i / st.steps.length; }
      else { ic = ''; t = st.done ? 'not fired' : 'in the store'; }
      w.r.className = `lr-row ${cls}`;
      setText(w.ic, ic);
      setText(w.t, t);
      w.bar.set(k);
    });
    // this round's odds, as the game rolls them
    const o = st.odds;
    if (o && !st.done) setText(this.odds, v1 ? `This round: crash off the ramp ${pc(o.crash)} · engine fails ${pc(o.fail)} · shot down ${pc(o.shot)} of those that fly · spread ${(st.sigma / 1000).toFixed(1)} km` : `This round: explodes on the table ${pc(o.crash)} · fails in flight ${pc(o.fail)} · no defence can stop it · spread ${(st.sigma / 1000).toFixed(1)} km`);
    else setText(this.odds, '');
    const fly = st.flights.some((f) => f.state === 'flying');
    setText(this.hint, fly ? 'F: ride the newest round in the 3D view (F again to come back).' : '');
    this.draw(st, sim);
  }

  resize() {
    const cw = this.cv.clientWidth, ch = this.cv.clientHeight;
    if (!cw || !ch) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (hw.scale || 1);
    if (cw !== this.W || ch !== this.H || Math.abs(dpr - this.dpr) > 0.01) {
      this.W = cw; this.H = ch; this.dpr = dpr;
      this.cv.width = Math.round(cw * dpr); this.cv.height = Math.round(ch * dpr);
    }
    return true;
  }

  // the profile: the site on the left, the target on the right; the V-1 cruises low through the defences, the A4
  // climbs on its burn to the Brennschluss and falls from the top of its arc
  draw(st, sim) {
    if (!this.resize()) return;
    const g = this.g, W = this.W, H = this.H, v1 = this.kind === 'v1';
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#e9dfbf'; g.fillRect(0, 0, W, H);
    const x0 = 14, x1 = W - 14, yG = H - 13, top = 12;
    const X = (k) => x0 + (x1 - x0) * k;
    // the shape of the flight: height as a fraction of the box over the way (0 to 1)
    const hAt = v1 ? (k) => (k < 0.03 ? k / 0.03 : k > 0.985 ? (1 - k) / 0.015 : 1) * 0.42 : (k) => Math.sin(Math.PI * Math.min(1, k)) ** 0.85;
    const Y = (k) => yG - (yG - top) * hAt(k);
    if (v1) {
      // the defences across the far part of the route
      g.fillStyle = 'rgba(168,36,27,.1)'; g.fillRect(X(0.62), top - 6, X(0.97) - X(0.62), yG - top + 6);
      g.font = `italic 9px ${SERIF}`; g.fillStyle = 'rgba(168,36,27,.85)'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('guns, fighters, balloons', X(0.795), top - 4);
    }
    // every 20 km along the way
    g.strokeStyle = 'rgba(40,80,140,.25)'; g.lineWidth = 1;
    for (let d = 20000; d < st.target.dist; d += 20000) { const x = X(d / st.target.dist); g.beginPath(); g.moveTo(x, yG); g.lineTo(x, yG - 4); g.stroke(); }
    if (v1) { g.font = `italic 9px ${SERIF}`; g.fillStyle = '#6d5f42'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('cruising low and level (height not to scale)', X(0.06), Y(0.3) - 3); }
    g.strokeStyle = 'rgba(29,63,143,.55)'; g.lineWidth = 1.2; g.setLineDash([3, 3]);
    g.beginPath();
    for (let i = 0; i <= 60; i++) { const k = i / 60; if (i) g.lineTo(X(k), Y(k)); else g.moveTo(X(k), Y(k)); }
    g.stroke(); g.setLineDash([]);
    if (!v1) {
      // the burn ends early on the climb: the Brennschluss
      const kb = 0.16;
      g.fillStyle = '#a8241b'; g.beginPath(); g.arc(X(kb), Y(kb), 2.5, 0, TAU); g.fill();
      g.font = `italic 9px ${SERIF}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#a8241b';
      g.fillText('Brennschluss', X(kb) + 5, Y(kb) + 1);
      g.fillStyle = '#6d5f42'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('top of the arc: about 80 km up', X(0.5), Y(0.5) + Math.min(26, (yG - top) * 0.3));
    }
    // the ground, the site and the target
    g.strokeStyle = '#4a3d22'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 - 6, yG); g.lineTo(x1 + 6, yG); g.stroke();
    g.fillStyle = '#1d3f8f'; g.fillRect(x0 - 3, yG - 6, 6, 6);
    g.fillStyle = '#a8241b'; g.beginPath(); g.arc(x1, yG - 3, 4, 0, TAU); g.fill();
    g.font = `9px ${TYPE}`; g.fillStyle = '#1b1913'; g.textBaseline = 'top';
    g.textAlign = 'left'; g.fillText('site', x0 - 6, yG + 2);
    g.textAlign = 'right'; g.fillText(`target ${(st.target.dist / 1000).toFixed(0)} km`, x1 + 6, yG + 2);
    // each round: a dot on its way, a cross where its flight ended
    for (const f of st.flights) {
      if (f.state === 'scrubbed') continue;
      const flying = f.state === 'flying';
      let k = f.eta > f.t0 ? Math.min(f.at ?? 1, (sim.time - f.t0) / (f.eta - f.t0)) : 0;
      if (f.fate === 'crash' || f.fate === 'blast' || f.state === 'crashed near the site' || f.state === 'exploded on the table') k = 0.01;
      else if (!flying) k = f.state === 'target area' || f.state === 'missed' ? 1 : f.at ?? k;
      const x = X(k), y = flying ? Y(k) : f.state === 'shot down' || f.state === 'failed in flight' ? Y(k) * 0.5 + yG * 0.5 : yG - 3;
      if (flying) {
        g.fillStyle = '#d9a62a'; g.strokeStyle = '#2a1d06'; g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); g.stroke();
      } else {
        const ok = f.state === 'target area';
        g.strokeStyle = ok ? '#2f6a2a' : '#a8241b'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke();
      }
      g.font = `italic bold 10px ${SERIF}`; g.fillStyle = '#1b1913'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(String(f.n), x, y - 5);
    }
  }
}

export function mountLaunchConsole(ctx) {
  const { send, mail, kind } = ctx;
  const v1 = kind === 'v1';
  let U = null, SIM = null, P = null;
  let toast = '', toastT = -1e9, seenRefusal = null, lastHold = null;
  const say = (t) => { toast = t; toastT = performance.now(); };

  // ----- actions (keys and buttons land here) -----
  const act = (name, arg) => {
    if (!U || U.alive === false || !U.special) return;
    switch (name) {
      case 'primary':
        // the big key: what it says, or the drill's step command so the controller says why not
        if (P?.cmd) send(...P.cmd); else send('step', {});
        break;
      case 'fix': send('fix', { how: arg }); break;
      case 'cover': send('cover', {}); break;
      case 'repair': send('repair', {}); break;
      case 'topup': send('topup', {}); break;
      case 'mode': send('mode', { mode: arg }); break;
    }
  };

  // ----- parts -----
  const root = el('div', 'con launch');
  const hdr = el('header', 'hdr');
  const hid = el('div', 'hid');
  const callEl = el('b', 'call'), nameEl = el('i', 'uname');
  hid.append(callEl, nameEl);
  const hstat = el('div', 'hstat');
  const statEl = el('div', 'stat');
  hstat.append(statEl);
  const mode = new Seg({
    cls: 'mode', items: [{ v: 'auto', main: 'AUTO', sub: 'crew drills', tip: 'The crew runs the whole drill and fires (A)' }, { v: 'manual', main: 'MANUAL', sub: 'you command', tip: 'You start the drill, dial, decide and fire (A)' }, { v: 'hold', main: 'HOLD', sub: 'stand down', tip: 'The crew stops after the step in hand' }],
    onChange: (v) => act('mode', v),
  });
  hdr.append(hid, hstat, mode.el);
  tut(hdr, 'header'); tut(statEl, 'status'); tut(mode.el, 'mode');
  const firing = new FiringCard({ kind, send });
  const drill = new DrillCard({ kind, act });
  const gauges = new GaugesCard({ kind });
  const rounds = new RoundsCard({ kind });
  const pad = new MessagePad({ apply: () => {}, clear: () => mail.clear() });
  tut(pad.el, 'pad');
  const top = el('div', 'toprow');
  const right = el('div', 'rightcol');
  right.append(drill.el);
  top.append(firing.el, right);
  const bot = el('div', 'botrow');
  bot.append(gauges.el, rounds.el, pad.el);
  root.append(hdr, top, bot);

  // ----- per frame -----
  function update(dt, unit, view) {
    U = unit; SIM = view.sim;
    const st = unit.special, now = performance.now();
    setText(callEl, (unit.callsign || '').toUpperCase());
    setText(nameEl, `${unit.name}  ·  ${unit.battery || ''}`);
    mode.set(unit.mode);
    if (!st) return;
    // a refused order (from a key, a button or a lesson) shows in the status line for a few seconds
    if (st.refused && st.refused !== seenRefusal) { seenRefusal = st.refused; say(st.refused.text); }
    // the drill comes back to the player: a bell for the firing key, a rustle for a setting it waits for
    if (st.hold !== lastHold) {
      if (lastHold !== null && !SIM.attract && unit.mode !== 'auto') { if (st.hold === 'fire') snd('bell'); else if (st.hold === 'dial' || st.hold === 'fault') snd('paper'); }
      lastHold = st.hold;
    }
    P = primary(unit, st, v1);
    let [line, cls] = statusLine(unit, st, v1);
    if (now - toastT < 3500) { line = toast; cls = 'bad'; }
    setText(statEl, line);
    setCls(statEl, 'bad', cls === 'bad');
    setCls(statEl, 'go', cls === 'go');
    setCls(hdr, 'alarm', st.alarm != null && !st.cover && unit.mode !== 'auto' && !st.done);
    firing.update(unit, st, SIM);
    drill.update(unit, st, P);
    gauges.update(unit, st, dt, now);
    rounds.update(unit, st, SIM);
    pad.update({ mail, unit, sim: SIM });
  }

  function key(e, down) {
    if (!U) return false;
    const c = e.code, big = e.shiftKey;
    const owned = c === 'Space' || c === 'Enter' || c.startsWith('Arrow');
    if (!down) return owned;
    if (!U.special) return owned;
    switch (c) {
      case 'Enter': case 'Space':
        if (e.repeat) return true;
        drill.go.press(true); setTimeout(() => drill.go.press(false), 120);
        snd('click');
        act('primary');
        return true;
      case 'ArrowLeft': firing.nudge('compass', big ? -1 : -0.1); return true;
      case 'ArrowRight': firing.nudge('compass', big ? 1 : 0.1); return true;
      case 'ArrowUp': firing.nudge('range', big ? 10 : 1); return true;
      case 'ArrowDown': firing.nudge('range', big ? -10 : -1); return true;
      case 'KeyB': act('cover'); return true;
      case 'KeyO': act('fix', 'fix'); return true;
      case 'KeyI': act('fix', 'ignore'); return true;
      case 'KeyX': act('fix', 'scrub'); return true;
      case 'KeyR': act('repair'); return true;
      case 'KeyT': if (!v1) { act('topup'); return true; } return false;
      case 'KeyA': send('mode', { mode: U.mode === 'auto' ? 'manual' : 'auto' }); return true;
    }
    return false;
  }

  return { el: root, update, key, dispose() {}, board: null, say };
}

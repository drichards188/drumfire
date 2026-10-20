// The WW1 German mode's cards for the Paris Gun (unit.special, src/ww1/paris.js ParisCtl), in its own mission. Four
// cards, mounted by console.js in place of the British ones: the drill card (`left`, in the guns card's place: the
// STELLUNGSBAU, work gangs on the tasks, until the gun stands, then the FEUERABLAUF, the round's steps and the one key
// the drill wants now), the firing data card (`top`, in the fire order card's place: the charge against the gauge, the
// line and range corrections against the firing table, the Wettermeldung, TABLE, REPORT and LAY, and the advice on how
// to aim and what the newest fall report wants), the gun's card (`el`,
// `bottom`: in the missions list's place: the barrel's wear and its numbered shells, the barrel change, the agents'
// reports on every round) and its targets card (ZIELE, `aside`, in the range table's place: the military targets off
// the map with the Armee's orders on them). The map (the board) is ui/consoles/parisMap.js's. Every label and control
// says in English on hover what it is and what to do; every order the gun cannot carry out is explained, on the
// cards' message lines and from the controller's `refused`.
// Talks back through send(name, args) (sim commands: gang, hurry, step, fix, powder, pcorr, table, report, aim { id? },
// barrel). Keys while the gun is selected: Enter the drill's key (start the round, go on with a setting as set, fire),
// O fix a fault, I carry on, J all hands on the Stellungsbau, arrows the corrections (Up/Down range, Left/Right line;
// Shift ten times), Q/E the charge, T the table's corrections, . the last report, Y the barrel change, Tab/Shift+Tab
// pick a target on ZIELE and L lay on it (or click it on ZIELE or the map).
import { el, setText, setCls, card, Btn, Bar } from '../widgets.js';
import { mmss, commas } from './common.js';
import { DEG } from '../../sector.js';
import { nextFall, correction } from '../../ww1/paris.js';

const STEP_LINE = 0.5, STEP_RANGE = 100; // Strich, metres (Shift: ten times)
const LOAD_WORDS = { depress: 'barrel down', open: 'breech open', shell: 'shell on the crane', ram: 'ramming', cartridge: 'the charges', close: 'breech closed', prime: 'primer', lay: 'raising, laying' };
const KG_MIN = 150, KG_MAX = 260; // the controller's clamp
const sgn = (v, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;
const km = (m) => (Math.abs(m) / 1000).toFixed(1);
const deg = (r) => Math.round(((r / DEG) % 360 + 360) % 360);
const tip = (n, t) => { if (n && n.title !== t) n.title = t; };

// the English on hover for the cards' fixed parts
const T_SETUP = 'STELLUNGSBAU: setting up the firing position. Send the three work gangs to the tasks with + and − (a task waits for the ones it needs; J puts all hands on the longest chain). The gun can fire once every task but the optional one is done.';
const T_DRILL = 'FEUERABLAUF: the firing drill for one round. 1 gauge the bore and set the charge, 2 lay the firing data, 3 load and lay, 4 fire. The big key always does what the drill needs next (Enter).';
const T_DATA = 'SCHUSSWERTE: the firing data the next round goes with. Each round needs a little more powder as the bore wears (LADUNG), and the line (SEITE) and range (ENTFERNUNG) corrections carry the Earth\'s turning, the wind aloft and what the fall reports taught. Step 1 and 2 of the drill wait for these.';
const T_GUN = 'PARIS-GESCHÜTZ: the gun itself. The barrel\'s wear and its numbered shells, the barrel change, and the agents\' report on every round.';
const T_ZIELE = 'ZIELE: the targets, military targets about 120 km west, far off the map. The Armee orders rounds on them: an open order shows rounds in its area / rounds wanted, and the time left. Click a row (or Tab, then L) to lay the gun on it.';
const T_CHARGE = 'LADUNG: the powder charge in kilograms. The bore wears with every round, so each round needs about half a kilo more: too little and the shell falls short, too much and it goes over and wears the barrel faster. The gauge (step 1) says what it needs. − and + (Q and E; Shift: 5 kg).';
const T_LINE = 'SEITE: the line correction in Strich (6400 to a full circle; one Strich is about 120 m at the target), minus to the left. The firing table gives the Earth\'s turning and the wind; the fall reports add the barrel\'s own error. ◄ and ► (arrow keys; Shift: 5 Strich).';
const T_RANGE = 'ENTFERNUNG: the range correction in metres, added to the target\'s range: plus goes over (weiter), minus short (kürzer). − and + (Up and Down arrows, 100 m; Shift: 1 km).';
const T_MET = 'Wettermeldung: the latest weather report, the wind high up where the shell flies (it climbs to about 40 km). A new one comes every 10 minutes once the weather station stands; lay the data again after it (TABLE, T).';
const T_ROHR = 'ROHR: the barrel. It lasts about 65 rounds: the bar is its wear. Past that the shots go wild and the barrel may burst, so change it (BARREL, Y: about 7 minutes without firing).';
const T_SHELL = 'GRANATE: the next shell. The shells of a barrel\'s set are numbered, each a little fatter to fit the worn bore; the count is the shells left at the gun.';
const T_REPORTS = 'The agents\' reports: where each round fell from its target (weit: over, kurz: short, rechts: right, links: left) and whether it fell in the target\'s 400 m area. REPORT (.) corrects the aim by the last one.';

// what the drill wants from the player now: the big key's words, the command it sends (none: nothing to press) and
// what pressing it does, in English
function primary(u, st, sim) {
  const p = u.pieces?.[0], s = st.steps?.[st.i], b = st.barrel;
  if (u.alive === false || !p || p.state === 'dead') return { main: 'GUN KNOCKED OUT', sub: '', tip: 'The gun is wrecked: nothing more can be done with it.' };
  if (st.hold === 'done') return { main: u.ammo?.he > 0 ? 'THE DAY IS OVER' : 'NO SHELLS LEFT', sub: '', tip: 'The mission is over.' };
  if (b.state === 'changing') return { main: 'ROHRWECHSEL', sub: `${mmss(b.dur - b.t)} left`, tip: 'The barrel is being changed with the portal crane: no firing until it is done.' };
  if (st.cover) return { main: 'IN COVER', sub: 'Fliegeralarm: wait for the all clear', tip: 'British aircraft are attacking the site: the crew is in cover and the work waits until they are gone.' };
  if (st.fault) return { main: 'FIX THE FAULT', sub: `O (${mmss(st.fault.cost)}) · I: carry on`, cmd: ['fix', { how: 'fix' }], warn: true, tip: `${st.fault.text}. Press (or O) to fix it: ${st.fault.fixText.toLowerCase()}, ${mmss(st.fault.cost)}. Or I to carry on: ${st.fault.risky}.` };
  if (u.mode === 'auto') return { main: 'AUTO', sub: 'the crew works the gun · A: manual', tip: 'AUTO: the crew sets up and fires the gun by itself. A (or MANUAL in the header) takes it over.' };
  if (st.fixing) return { main: 'FIXING', sub: `${st.fixing} · ${mmss(-st.t)}`, tip: 'The crew is fixing the fault; the drill goes on by itself when it is done.' };
  switch (st.hold) {
    case 'start':
      if (u.mode === 'hold') return { main: 'HOLDING', sub: 'MANUAL to carry on', tip: 'The gun is on HOLD: press MANUAL (or A) to go on.' };
      return { main: st.n === 0 ? 'FIRST ROUND' : 'NEXT ROUND', sub: `Enter: gauge, data, load${b.fired >= b.life ? ' · barrel spent: Y' : ''}`, cmd: ['step'], tip: 'Start the round (Enter): the crew gauges the bore, the computing office gives the firing data, then they load and lay. The drill stops where it needs you.' };
    case 'dial':
      return s.set === 'charge'
        ? { main: 'SET THE CHARGE', sub: `gauge ${st.charge.need.toFixed(1)} kg · Q/E · Enter: as set`, cmd: ['step'], dial: true, tip: `The gauge says this round needs ${st.charge.need.toFixed(1)} kg; ${st.charge.set.toFixed(1)} kg is set. Raise or lower it with Q and E (LADUNG on the firing data card) and the drill goes on, or press (Enter) to fire with the charge as it is.` }
        : { main: 'LAY THE DATA', sub: 'T: the table · Enter: as laid', cmd: ['step'], dial: true, tip: 'A new wind report has come in since the data were laid. T lays the firing table for it (with what the reports taught), or press (Enter) to go on with the data as they are.' };
    case 'fire': return { main: 'FEUER', sub: 'Enter or Space: fire', cmd: ['step'], fire: true, tip: 'The gun is loaded and laid on the target: fire (Enter or Space).' };
    case 'blocked': return { main: 'CANNOT LOAD', sub: sim?.guns?.problem?.(u, true) ?? '', warn: true, tip: `The crew cannot load: ${sim?.guns?.problem?.(u) ?? ''}.` };
  }
  return { main: 'CREW AT WORK', sub: '] speeds up time', tip: 'The crew is working this step of the drill; nothing to press. ] speeds up time, [ slows it.' };
}

// where a round fell (or should fall) from its target, in words: '1.2 km short, 0.3 km right'
const fallWords = (q) => `${Math.abs(q.along) < 50 ? 'on the range' : `${km(q.along)} km ${q.along > 0 ? 'over' : 'short'}`}, ${Math.abs(q.lat) < 50 ? 'on the line' : `${km(q.lat)} km ${q.lat > 0 ? 'right' : 'left'}`}`;

// How to aim this gun, and what to do about the newest fall, in English: the box under the firing data card's target
// line, kept short (the card is not tall). hot: something to lay now ('report' or 'table': the key to light up).
function advice(u, st, now) {
  const T = st.target, fl = st.flights ?? [];
  if (st.ready === false) return { text: 'HOW TO AIM: pick the target (map or ZIELE) and fire. When the agents report the fall, REPORT (.) corrects the aim, or set SEITE and ENTFERNUNG yourself (arrow keys).' };
  if (u.mode === 'auto') return { text: 'AUTO: the crew lays the table and corrects the aim by the reports itself. A to aim it yourself.' };
  const f = st.last, q = f && f.target === T.id ? nextFall(st, f) : null;
  if (q && !f.used) {
    const c = correction(st, q);
    if (!c.text) return { text: `Schuss ${f.n} fell ${fallWords(f)}: the aim is good. Keep it and fire the next round.` };
    return { hot: 'report', text: `Schuss ${f.n} fell ${fallWords(f)}. Correct ${c.text}: REPORT (.) lays it, or the arrow keys. Map: the blue ring is where the next falls.` };
  }
  if (st.met && st.dataT < st.met.t) return { hot: 'table', text: 'New Wettermeldung: the wind aloft has changed. TABLE (T) lays its corrections before the next round.' };
  const fly = fl.find((x) => x.state === 'flying');
  if (fly) return { text: `Schuss ${fly.n} is in flight: the agents report its fall in ${mmss(fly.eta - now)}. Then correct the aim by it.` };
  if (q) {
    const c = correction(st, q);
    return { text: c.text ? `On the data laid now the next round falls ${fallWords(q)} (blue ring on the map): ${c.text} brings it on.` : 'Aimed: the next round should fall in the area (blue ring on the map). Fire it (Enter).' };
  }
  if (!fl.length) return { text: `Laid on ${T.name} by the firing table. Fire (Enter); about two minutes later the agents report the fall, and you correct the aim by it.` };
  return { text: `No round has fallen on ${T.name} yet: fire one and correct by its report.` };
}

// The drill card: the STELLUNGSBAU (work gangs on the tasks) until the gun stands, then the FEUERABLAUF (the round's
// steps, the one key it wants now, a fault to decide). In the guns card's place (console.js `left`).
class ParisDrill {
  constructor({ send, say }) {
    this.send = send;
    this.say = say;
    const c = card('STELLUNGSBAU', 'Aufbau der Feuerstellung', 'special sp-paris pdrill');
    this.el = c.el;
    this.cHead = c.head;
    this.title = c.head.querySelector('b');
    this.subt = c.head.querySelector('i');
    const b = c.body;
    this.head = el('div', 'sp-head');
    b.append(this.head);
    // the Stellungsbau: one row a task
    this.tasks = el('div', 'sp-list pd-tasks');
    this.hurry = new Btn({ main: 'ALL HANDS', sub: 'J: critical path', cls: 'mini', onClick: () => this.send('hurry', {}), tip: 'Every gang on the longest chain of tasks (bed, frame, barrel, truss), and kept there as tasks finish (J). Moving a gang by hand ends it.' });
    this.foot = el('div', 'sp-foot');
    this.foot.append(this.hurry.el);
    this.rows = [];
    // the Feuerablauf: the big key, what the crew does, the steps, a fault
    this.key = new Btn({ main: 'FIRST ROUND', sub: 'Enter', cls: 'pd-key', onClick: () => this.act(), tip: 'The drill\'s key: it always does what the drill needs next (Enter)' });
    this.now = el('div', 'sp-note pd-now');
    tip(this.now, 'What the crew is doing now, and what the drill waits for.');
    this.steps = el('div', 'sp-list pd-steps');
    this.sRows = [];
    this.fault = el('div', 'pd-fault');
    this.fText = el('div', 'sp-note');
    const fb = el('div', 'sp-btns');
    this.bFix = new Btn({ main: 'FIX', sub: 'O', cls: 'mini', onClick: () => this.send('fix', { how: 'fix' }), tip: 'Fix the fault: it takes the crew a while, then the step is done (O)' });
    this.bIgnore = new Btn({ main: 'CARRY ON', sub: 'I', cls: 'mini', onClick: () => this.send('fix', { how: 'ignore' }), tip: 'Carry on regardless, at the fault\'s risk to this round (I)' });
    fb.append(this.bFix.el, this.bIgnore.el);
    this.fault.append(this.fText, fb);
    this.drill = el('div', 'pd-drill');
    this.drill.append(this.key.el, this.now, this.steps, this.fault);
    this.crew = el('div', 'sp-note pd-crew');
    tip(this.crew, 'Crew: men left of the full detachment (fewer men work slower). Gun: its condition. Shells: numbered shells left at the gun. Site: whether the camouflage nets and flak posts are up (they keep the raiders off).');
    this.msg = el('div', 'sp-note pd-msg');
    tip(this.msg, 'Why the last order could not be carried out.');
    b.append(this.tasks, this.foot, this.drill, this.crew, this.msg);
    this.u = null;
    this.sim = null;
    this.prim = null;
  }

  // the big key (Enter): whatever the drill wants now
  act() {
    const pr = this.prim;
    if (!pr) return;
    if (pr.cmd) this.send(...pr.cmd);
    else if (pr.main === 'AUTO') this.say('The crew works the gun on AUTO: A or MANUAL to take it over.');
    else this.say(`${pr.main[0]}${pr.main.slice(1).toLowerCase()}: ${pr.sub || 'nothing to press now'}.`);
  }

  taskRows(st) {
    if (this.rows.length) return;
    for (const t of st.tasks) {
      const r = el('div', 'sp-row');
      const name = el('div', 'sp-name');
      name.append(el('b', null, t.name), el('i', null, t.de + (t.optional ? '  (optional)' : '')));
      const bar = new Bar({ cls: 'sp-bar' });
      const g = el('span', 'sp-gangs', '0');
      tip(g, 'Work gangs on this task');
      const dec = new Btn({ main: '−', sub: '', cls: 'mini', onClick: () => this.send('gang', { task: t.id, d: -1 }), tip: 'Take a work gang off this task' });
      const inc = new Btn({ main: '+', sub: '', cls: 'mini', onClick: () => this.send('gang', { task: t.id, d: 1 }), tip: 'Send one more work gang to this task (taken off the busiest task if none is free)' });
      const ctl = el('div', 'sp-ctl');
      ctl.append(dec.el, g, inc.el);
      r.append(name, bar.el, ctl);
      this.tasks.append(r);
      this.rows.push({ id: t.id, r, name, bar, g, dec, inc });
    }
  }

  stepRows(st) {
    if (this.sRows.length) return;
    st.steps.forEach((q, i) => {
      const r = el('div', 'sp-row');
      const mark = el('span', 'pd-mark');
      const name = el('div', 'sp-name');
      name.append(el('b', null, `${i + 1}. ${q.name}`), el('i', null, q.de));
      const t = el('span', 'pd-t');
      r.append(mark, name, t);
      tip(r, q.tip ?? q.crew);
      this.steps.append(r);
      this.sRows.push({ r, mark, t });
    });
  }

  update(u, sim) {
    this.u = u;
    this.sim = sim;
    const st = u.special;
    if (!st?.tasks) return;
    const setup = !st.ready, p = u.pieces?.[0];
    setText(this.title, setup ? 'STELLUNGSBAU' : 'FEUERABLAUF');
    setText(this.subt, setup ? 'setting up the position' : `firing drill · Schuss ${st.n + (st.i > 0 || st.doing ? 1 : 0) || 1}`);
    tip(this.cHead, setup ? T_SETUP : T_DRILL);
    setCls(this.head, 'hide', !setup);
    setCls(this.tasks, 'hide', !setup);
    setCls(this.foot, 'hide', !setup);
    setCls(this.drill, 'hide', setup);
    if (setup) this.updateSetup(u, st);
    else this.updateDrill(u, st, sim, p);
    const crewTxt = p ? `Crew ${p.crew} of ${p.crewMax} · gun ${Math.round((p.hp / (p.maxHp || 1)) * 100)}% · ${u.ammo?.he ?? 0} shells${p.loaded ? ' + 1 loaded' : ''}` : '';
    const site = st.stage?.camo >= 1 ? 'nets and flak up' : 'no nets or flak yet';
    setText(this.crew, `${crewTxt} · ${site}`);
    const ref = st.refused && sim && sim.time - st.refused.t < 6 ? st.refused.text : '';
    setText(this.msg, ref);
  }

  updateSetup(u, st) {
    this.taskRows(st);
    const busy = st.tasks.reduce((s, t) => s + t.gangs, 0);
    const lead = st.cover ? 'FLIEGERALARM: the gangs are in cover. ' : '';
    setText(this.head, `${lead}${st.gangs - busy} of ${st.gangs} work gangs free. Send them to the tasks (+/−); a task waits for the ones it needs. ${u.mode === 'auto' ? 'AUTO: the gangs organise themselves.' : st.allHands ? 'ALL HANDS: the gangs keep to the critical path.' : 'J: all hands on the critical path.'}`);
    tip(this.head, T_SETUP);
    this.head.style.color = st.cover ? '#8a1c10' : '';
    for (const row of this.rows) {
      const t = st.tasks.find((q) => q.id === row.id);
      row.bar.set(t.done / t.work);
      setText(row.g, String(t.gangs));
      const can = t.state !== 'done' && t.needs.every((n) => st.tasks.find((q) => q.id === n).state === 'done');
      setCls(row.r, 'done', t.state === 'done');
      setCls(row.r, 'wait', !can && t.state !== 'done');
      setCls(row.r, 'doing', t.gangs > 0);
      row.inc.enable(can && t.gangs < t.max);
      row.dec.enable(t.gangs > 0);
      const waits = t.needs.filter((n) => st.tasks.find((q) => q.id === n).state !== 'done').map((n) => st.tasks.find((q) => q.id === n).name.toLowerCase());
      const state = t.state === 'done' ? 'Done.' : waits.length ? `Waits for: ${waits.join(', ')}.` : t.gangs ? `${t.gangs} of at most ${t.max} gangs on it, ${Math.round((t.done / t.work) * 100)}% done, about ${mmss((t.work - t.done) / t.gangs)} to go.` : `No gangs on it (at most ${t.max}): + sends one. ${Math.round((t.done / t.work) * 100)}% done.`;
      tip(row.r, `${t.name} (${t.de}): ${t.tip ?? ''} ${state}`);
    }
    this.hurry.enable(!st.allHands);
  }

  updateDrill(u, st, sim, p) {
    this.stepRows(st);
    const pr = this.prim = primary(u, st, sim);
    this.key.text(pr.main, pr.sub);
    this.key.enable(!!pr.cmd);
    tip(this.key.el, pr.tip ?? '');
    setCls(this.key.el, 'red', !!pr.fire);
    setCls(this.key.el, 'warn', !!pr.warn);
    const s = st.steps[st.i], job = p?.job;
    let now;
    if (st.cover) now = 'The crew is in cover from the raiders. The drill waits for the all clear.';
    else if (st.fault) now = `${st.fault.text}. Fix it: ${st.fault.fixText.toLowerCase()} (${mmss(st.fault.cost)}). Carry on: ${st.fault.risky}.`;
    else if (st.fixing) now = `${st.fixing} (${mmss(-st.t)}).`;
    else if (st.barrel.state === 'changing') now = 'The portal crane is over the gun: the old barrel out, the spare in.';
    else if (st.hold === 'start') {
      const fly = st.flights.find((x) => x.state === 'flying');
      now = st.n === 0 ? 'The gun stands. Start the first round: the crew gauges the bore, the computing office gives the data, then they load and lay.'
        : fly ? `Schuss ${fly.n} is in flight: its fall report comes in ${mmss(fly.eta - (sim?.time ?? 0))}. Correct the aim by it (SCHUSSWERTE card), then start the next round, or start it now.`
          : 'Start the next round once the aim is corrected (the SCHUSSWERTE card says what the newest report wants).';
    }
    else if (st.hold === 'dial' && s.set === 'charge') now = `The gauge says ${st.charge.need.toFixed(1)} kg for the bore's wear; ${st.charge.set.toFixed(1)} kg is set. Q/E to match it, or Enter to go on as set.`;
    else if (st.hold === 'dial') now = 'A new Wettermeldung: the data are not laid for it. T lays the table (with what the reports taught), or Enter goes on as laid.';
    else if (st.hold === 'fire') now = `Laid on ${st.target.name}, Granate Nr. ${st.shell.no} in, ${st.charge.set.toFixed(1)} kg. The firing key is yours.`;
    else if (st.hold === 'blocked') now = `The gun cannot load: ${sim?.guns?.problem?.(u) ?? ''}.`;
    else if (s?.id === 'load' && job) now = `${s.crew}. Now: ${LOAD_WORDS[job.step] ?? job.step} (${mmss(job.dur - job.t)}).`;
    else now = s ? `${s.crew}.` : '';
    setText(this.now, now);
    this.now.style.color = st.cover || st.fault || st.hold === 'blocked' ? '#8a1c10' : '';
    st.steps.forEach((q, i) => {
      const w = this.sRows[i], cur = i === st.i;
      setCls(w.r, 'done', q.state === 'done');
      setCls(w.r, 'cur', cur && st.hold !== 'start');
      setText(w.mark, q.state === 'done' ? '✓' : cur && st.hold !== 'start' ? (st.hold === 'dial' || st.hold === 'fault' || st.hold === 'fire' ? '?' : '▸') : '');
      let t = '';
      if (cur && st.hold !== 'start') {
        if (q.id === 'load') t = job ? mmss(job.dur - job.t) : '';
        else if (q.id === 'fire') t = 'key';
        else if (st.hold === 'dial') t = 'waits';
        else if (q.dur) t = mmss(q.dur - Math.max(0, st.t));
      }
      setText(w.t, t);
    });
    setCls(this.fault, 'hide', !st.fault);
    if (st.fault) setText(this.fText, `${st.fault.text}.`);
    this.bIgnore.enable(!!st.fault);
    this.bFix.enable(!!st.fault);
  }

  key(e) {
    const st = this.u?.special;
    if (!st) return false;
    switch (e.code) {
      case 'Enter': this.act(); return true;
      case 'KeyO': if (st.fault) this.send('fix', { how: 'fix' }); else this.say('There is no fault to fix.'); return true;
      case 'KeyI': if (st.fault) this.send('fix', { how: 'ignore' }); else this.say('There is no fault to carry on through.'); return true;
      case 'KeyJ': if (!st.ready) this.send('hurry', {}); else this.say('The gun stands: the gangs are done.'); return true;
    }
    return false;
  }
}

// a label and value row with optional − and + buttons (the firing data and the gun's cards)
function row(body, k, hover, gloss = '') {
  const r = el('div', 'sp-row');
  const v = el('div', 'sp-name');
  const t = el('b');
  const s = el('i');
  v.append(t, s);
  const lab = el('b', 'sp-k', k);
  if (gloss) lab.append(el('i', null, gloss));
  r.append(lab, v);
  tip(r, hover);
  body.append(r);
  return { r, t, s };
}

export class ParisCard {
  constructor({ send }) {
    this.send = send;
    this.msg = '';
    this.msgT = -1e9;
    this.u = null;
    this.sim = null;
    const btn = (main, sub, fn, hover) => new Btn({ main, sub, cls: 'mini', onClick: fn, tip: hover });
    const ctl = (r, dec, inc) => { const c2 = el('div', 'sp-ctl'); c2.append(dec.el, inc.el); r.r.append(c2); };

    // ---- the firing data: in the fire order card's place (console.js `top`)
    const d = card('SCHUSSWERTE', 'firing data for the next round', 'special sp-paris pdata');
    this.top = d.el;
    tip(d.head, T_DATA);
    const db = d.body;
    this.tgt = el('div', 'sp-head pd-tgt');
    this.ordLine = el('div', 'sp-note');
    this.elLine = el('div', 'sp-note');
    tip(this.tgt, 'The target the gun is laid on: its name, its range and its bearing. Pick another on ZIELE or click it on the map.');
    tip(this.ordLine, 'The Armee\'s order on this target: rounds still wanted in its 400 m area, and the time left.');
    tip(this.elLine, 'The barrel\'s elevation for this range (it fires between 50 and 55 degrees), and how long the shell flies.');
    this.guide = el('div', 'sp-note pd-guide');
    tip(this.guide, 'How to aim the gun, and what to do about the newest fall report.');
    db.append(this.tgt, this.ordLine, this.guide, this.elLine);
    this.rCharge = row(db, 'LADUNG', T_CHARGE, 'powder charge');
    this.kDec = btn('−', '', () => this.powder(-1), 'Half a kilo less powder (Q; Shift: 5 kg)');
    this.kInc = btn('+', '', () => this.powder(1), 'Half a kilo more powder (E; Shift: 5 kg)');
    ctl(this.rCharge, this.kDec, this.kInc);
    this.rLine = row(db, 'SEITE', T_LINE, 'aim left · right');
    this.lDec = btn('◄', '', () => this.corr(0, -1), 'Half a Strich to the left (Left arrow; Shift: 5 Strich)');
    this.lInc = btn('►', '', () => this.corr(0, 1), 'Half a Strich to the right (Right arrow; Shift: 5 Strich)');
    ctl(this.rLine, this.lDec, this.lInc);
    this.rRange = row(db, 'ENTFERNUNG', T_RANGE, 'aim short · further');
    this.rDec = btn('−', '', () => this.corr(-1, 0), 'Kürzer: 100 m shorter (Down arrow; Shift: 1 km)');
    this.rInc = btn('+', '', () => this.corr(1, 0), 'Weiter: 100 m further (Up arrow; Shift: 1 km)');
    ctl(this.rRange, this.rDec, this.rInc);
    this.met = el('div', 'sp-note');
    tip(this.met, T_MET);
    db.append(this.met);
    const dbt = el('div', 'sp-btns');
    this.bTable = btn('TABLE', 'T: lay the table', () => this.order('table'), 'Lay the firing table\'s corrections for today\'s wind and the Earth\'s turning, plus what the fall reports have taught about this barrel (T). Do it after each new Wettermeldung.');
    this.bReport = btn('REPORT', '.: by the last fall', () => this.order('report'), 'Correct the aim by the agents\' last report: moves it back by as much as that round fell over, short, left or right, counted from the data it was fired with (.)');
    this.bAim = btn('LAY', 'L: on the target', () => this.layCursor(), 'Lay the gun on the target picked on ZIELE (Tab), or on the same one again (L). Or click a target on ZIELE or the map.');
    dbt.append(this.bTable.el, this.bReport.el, this.bAim.el);
    db.append(dbt);
    this.note = el('div', 'sp-note pd-note');
    tip(this.note, 'What the last order did, or why it could not be carried out.');
    db.append(this.note);

    // ---- the gun: in the missions list's place (console.js `bottom`)
    const c = card('PARIS-GESCHÜTZ', 'the gun, its barrel and its rounds', 'special sp-paris');
    this.el = c.el;
    tip(c.head, T_GUN);
    const b = c.body;
    this.head = el('div', 'sp-head');
    tip(this.head, 'The gun\'s state.');
    b.append(this.head);
    this.rBar = row(b, 'ROHR', T_ROHR);
    this.wear = new Bar({ cls: 'sp-bar' });
    this.rBar.r.insertBefore(this.wear.el, this.rBar.r.children[1]);
    this.rShell = row(b, 'GRANATE', T_SHELL);
    const gbt = el('div', 'sp-btns');
    this.bBarrel = btn('BARREL', 'Y: Rohrwechsel', () => this.order('barrel'), 'Change the barrel with the portal crane: about 7 minutes without firing, then the shells start again from Nr. 1 with a new barrel (Y)');
    gbt.append(this.bBarrel.el);
    b.append(gbt);
    const fh = el('div', 'sp-k pd-fh', 'AGENTS\' REPORTS');
    tip(fh, T_REPORTS);
    b.append(fh);
    this.flights = el('div', 'sp-list');
    tip(this.flights, T_REPORTS);
    b.append(this.flights);
    this.fRows = [0, 1, 2, 3, 4].map(() => { const n = el('div', 'sp-note'); this.flights.append(n); return n; });
    this.bottom = true; // console.js: in the bottom row, in the missions list's place (the gun takes no missions)

    // ---- the drill: in the guns card's place (console.js `left`)
    this.drill = new ParisDrill({ send, say: (t) => this.say(t) });
    this.left = this.drill.el;

    // ---- the targets: in the range table's place (console.js `aside`)
    const z = card('ZIELE', 'the Armee\'s targets · click, or Tab and L', 'rtab ptgt');
    tip(z.head, T_ZIELE);
    this.aside = z.el;
    this.tRows = [];
    this.cur = -1; // the Tab cursor (-1: none yet)
  }

  // one row per target, built when the targets are first seen
  rowsFor(st) {
    if (this.tRows.length === st.targets.length) return;
    const body = this.aside.querySelector('.cbody');
    body.textContent = '';
    this.tRows = st.targets.map((T) => {
      const r = el('div', 'ptr');
      const cells = { mark: el('span', 'pm'), name: el('span', 'pn', T.name), where: el('span', 'pw'), ord: el('span', 'po'), fx: el('span', 'pf') };
      r.append(cells.mark, cells.name, cells.where, cells.ord, cells.fx);
      r.addEventListener('click', () => this.pick(T.id));
      body.append(r);
      return { r, T, ...cells };
    });
  }

  // lay on target `id` (a click on ZIELE or the map, or L on the cursor)
  pick(id) {
    const u = this.u, st = u?.special;
    if (!st?.targets) return;
    const p = u.pieces?.[0];
    if (!p || p.state === 'dead' || u.alive === false) { this.say('The gun is knocked out.'); return; }
    this.send('aim', { id });
    const T = st.targets.find((t) => t.id === id);
    if (T) this.say(`Laying on ${T.name} (${T.en}): the gun turns to ${deg(T.bearing)}°. The corrections carry over; T relays the table's wind part for it.`);
    this.cur = st.targets.findIndex((t) => t.id === id);
  }

  // a click on the board (console.js onLay): the target nearest it, if one is within about 18 pixels
  boardClick(x, z, mpp) {
    const st = this.u?.special;
    if (!st?.targets) return false;
    let best = null, bd = 18 * mpp;
    for (const T of st.targets) { const d = Math.hypot(T.x - x, T.z - z); if (d < bd) { bd = d; best = T; } }
    if (best) this.pick(best.id);
    else this.say('The Paris Gun fires only at the Armee\'s targets, about 120 km west: click one of the four (red), or pick it on ZIELE. FIT shows them all.');
    return true;
  }

  say(t) {
    this.msg = t;
    this.msgT = performance.now();
  }

  // The order card's actions (console.js act; its keys, arrows, Q/E and .) on this gun: the corrections, the charge and
  // the report go to these cards; what has no meaning here says why. true when handled.
  route(name, arg, e) {
    const big = !!e?.shiftKey;
    switch (name) {
      case 'corr': this.corr(arg === 'add' ? 1 : arg === 'drop' ? -1 : 0, arg === 'right' ? 1 : arg === 'left' ? -1 : 0, big); return true;
      case 'charge': this.powder(arg, big); return true;
      case 'apply': this.order('report'); return true;
      case 'step': this.say(`Fixed steps on this gun: ${STEP_RANGE} m and ${STEP_LINE} Strich (Shift: ten times).`); return true;
      case 'rounds': this.say('The Paris Gun fires one round at a time.'); return true;
      case 'fuze': case 'fuzecycle': this.say('One fuze only: the long-range shell has its own percussion fuze.'); return true;
      case 'guns': case 'gunscycle': this.say('One gun: there is nothing to choose.'); return true;
      case 'cease': this.say('Nothing to cease: the gun fires one round at a time, on the firing key.'); return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ orders (buttons and keys land here)
  powder(d, big = false) {
    const st = this.u?.special;
    if (!st?.charge) return;
    const add = d * (big ? 5 : st.charge.step || 0.5);
    const to = st.charge.set + add;
    if ((d < 0 && st.charge.set <= KG_MIN) || (d > 0 && st.charge.set >= KG_MAX)) { this.say(`The charge is at its ${d < 0 ? 'least' : 'most'}, ${d < 0 ? KG_MIN : KG_MAX} kg: the cartridges hold no ${d < 0 ? 'less' : 'more'}.`); return; }
    this.send('powder', { add });
    if (to > st.charge.need * 1.03) this.say('Over the gauged charge: the shell goes over and the bore wears faster.');
  }

  corr(dr, dl, big = false) {
    if (!this.u?.special?.corr) return;
    this.send('pcorr', { addRange: dr * STEP_RANGE * (big ? 10 : 1), addLine: dl * STEP_LINE * (big ? 10 : 1) });
  }

  order(name) {
    const u = this.u, st = u?.special;
    if (!st) return;
    const why = this.why(name, u, st);
    if (why) { this.say(why); return; }
    this.send(name, {});
    if (name === 'report') this.say(`Corrected by the report on Schuss ${st.last.n}.`);
  }

  // the reason an order cannot be carried out now, in the player's words ('' when it can)
  why(name, u, st) {
    const p = u.pieces?.[0];
    if (!p || p.state === 'dead' || u.alive === false) return 'The gun is knocked out.';
    if (name === 'report') {
      if (!st.last) return 'No fall report yet: the agents report about two minutes after a shot.';
      if (st.last.state !== 'fallen') return 'The last shot gave no fall to report.';
      if (st.last.used) return `The report on Schuss ${st.last.n} is already laid on. Fire again for a new one.`;
    }
    if (name === 'barrel' && st.barrel?.state === 'changing') return `The barrel is already being changed: ${mmss(st.barrel.dur - st.barrel.t)} left.`;
    if (name === 'barrel' && st.ready === false) return 'The gun is not set up yet: its barrel is still going in.';
    if (name === 'table' && !st.met) return 'No Wettermeldung yet: the weather station is not built (STELLUNGSBAU).';
    return '';
  }

  // L: lay on the target under the ZIELE cursor (the one laid on, if the cursor is there)
  layCursor() {
    const st = this.u?.special;
    if (!st?.targets) return;
    const T = st.targets[this.cur] ?? st.target;
    if (T === st.target) { const why = this.why('aim', this.u, st); if (why) { this.say(why); return; } this.send('aim', {}); this.say(`Laid on ${T.name} again.`); }
    else this.pick(T.id);
  }

  // ------------------------------------------------------------------ per frame
  update(u, sim) {
    this.u = u;
    this.sim = sim;
    const st = u.special;
    if (!st || st.kind !== 'paris') return;
    this.drill.update(u, sim);
    const b = st.barrel, p = u.pieces?.[0], changing = b.state === 'changing', o = u.order || {};
    const T = st.target, now = sim?.time ?? 0, dead = !p || p.state === 'dead';
    // the firing data
    setText(this.tgt, `Ziel: ${T.name} (${T.en}), ${km(T.dist)} km, ${deg(T.bearing)}°`);
    const ord = st.orders?.find((q) => q.target === T.id && q.state === 'open');
    setText(this.ordLine, ord ? `Order: ${ord.need - ord.got} more in its area within ${mmss(ord.due - now)}.` : 'No open order on it (the orders: ZIELE).');
    this.ordLine.style.color = ord ? '#8a1c10' : '';
    setText(this.elLine, st.ready === false ? 'The gun is not set up yet.' : `Elevation ${o.el != null ? (o.el / DEG).toFixed(1) : '--'}°, flight about ${o.tof ? Math.round(o.tof) : '--'} s.`);
    const off = st.charge.set - st.charge.need;
    setText(this.rCharge.t, `${st.charge.set.toFixed(1)} kg`);
    setText(this.rCharge.s, `gauge ${st.charge.need.toFixed(1)} kg${Math.abs(off) <= 0.5 ? ': matched' : `: ${off > 0 ? 'over' : 'short'} ${Math.abs(off).toFixed(1)} kg, ${off > 0 ? 'Q' : 'E'} to match`}`);
    setCls(this.rCharge.r, 'cur', Math.abs(off) > 0.5);
    const tb = st.table, tg = st.taught ?? { line: 0, range: 0 };
    setText(this.rLine.t, `${sgn(st.corr.line, 1)} Strich`);
    setText(this.rLine.s, tb ? `table ${sgn(tb.line, 1)} (earth ${sgn(tb.earth, 1)}, wind ${sgn(tb.windLine, 1)})${tg.line ? `, reports ${sgn(tg.line, 1)}` : ''}` : '');
    setText(this.rRange.t, `${sgn(st.corr.range)} m`);
    setText(this.rRange.s, tb ? `table ${sgn(tb.range)} for the wind${tg.range ? `, reports ${sgn(tg.range)}` : ''}` : '');
    const m = st.met;
    setText(this.met, m ? `Wettermeldung: wind aloft from ${Math.round(((m.bearing / DEG) % 360 + 360) % 360)}°, ${Math.round(m.speed)} m/s; ${m.along >= 0 ? 'with' : 'against'} the shot ${Math.abs(m.along).toFixed(0)}, across ${Math.abs(m.cross).toFixed(0)} ${m.cross >= 0 ? 'to the right' : 'to the left'}.${st.dataT >= m.t ? '' : ' Not laid for it yet: T.'}` : 'No Wettermeldung yet: the weather station is not built.');
    this.met.style.color = m && st.dataT < m.t ? '#8a1c10' : '';
    const f0 = st.last, adv = dead ? { text: 'The gun is knocked out.' } : advice(u, st, now);
    setText(this.guide, adv.text);
    setCls(this.guide, 'hot', !!adv.hot);
    setCls(this.bReport.el, 'lit', adv.hot === 'report');
    setCls(this.bTable.el, 'lit', adv.hot === 'table');
    this.bReport.enable(!dead && !!f0 && f0.state === 'fallen' && !f0.used);
    this.bTable.enable(!dead && !!st.met);
    this.bAim.enable(!dead);
    this.kDec.enable(!dead && st.charge.set > KG_MIN);
    this.kInc.enable(!dead && st.charge.set < KG_MAX);
    for (const x of [this.lDec, this.lInc, this.rDec, this.rInc]) x.enable(!dead);
    const fresh = performance.now() - this.msgT < 4500;
    setText(this.note, fresh ? this.msg : '');
    // the gun
    if (st.ready === false) setText(this.head, 'STELLUNGSBAU: the gun is being put together (the STELLUNGSBAU card).');
    else if (changing) setText(this.head, `ROHRWECHSEL: barrel ${b.n} comes out, the spare goes in. ${mmss(b.dur - b.t)} left; no firing meanwhile.`);
    else if (dead) setText(this.head, 'The gun is knocked out.');
    else setText(this.head, b.fired >= b.life ? 'BARREL SPENT: change it (BARREL, Y) before the next round.' : `Feuerbereit. ${st.hits} of ${st.flights.length} rounds in a target's area so far.`);
    this.head.style.color = changing || b.fired >= b.life ? '#8a1c10' : '';
    this.wear.set(changing ? b.t / b.dur : Math.min(1, st.wear));
    setText(this.rBar.t, changing ? `barrel ${b.n + 1} going in` : `No. ${b.n}: ${Math.floor(b.fired)} of ${b.life} rounds, wear ${Math.round(st.wear * 100)}%`);
    setText(this.rShell.t, `Nr. ${st.shell.no} of the set, ${st.shell.cal.toFixed(2)} cm`);
    setText(this.rShell.s, `${u.ammo ? `${u.ammo.he} at the gun` : ''}${p?.loaded ? ' + 1 loaded' : ''}`);
    this.bBarrel.enable(!dead && !changing && st.ready !== false);
    const fl = st.flights;
    for (let i = 0; i < this.fRows.length; i++) {
      const f = fl[fl.length - 1 - i];
      if (!f) { setText(this.fRows[i], i === 0 ? 'No shot yet today.' : ''); continue; }
      const ft = st.targets?.find((q) => q.id === f.target);
      const head = `${f.n}. ${ft ? ft.name : ''} (Nr. ${f.shellNo}, ${f.charge?.toFixed?.(1) ?? '?'} kg): `;
      let t;
      if (f.state === 'flying') t = `in flight, report in ${mmss(f.eta - now)}`;
      else if (f.state === 'burst') t = 'the barrel burst at the shot';
      else t = `${Math.abs(f.along) < 50 ? 'range good' : `${km(f.along)} km ${f.along > 0 ? 'weit' : 'kurz'}`}, ${Math.abs(f.lat) < 50 ? 'line good' : `${km(f.lat)} km ${f.lat > 0 ? 'rechts' : 'links'}`}${f.result === 'area' ? '  IN THE AREA' : f.result === 'near' ? '  near' : ''}`;
      setText(this.fRows[i], head + t);
      this.fRows[i].style.color = f.state === 'burst' ? '#8a1c10' : f.result === 'area' ? '#1d5a22' : '';
    }
    this.drawTargets(st, now);
  }

  // the targets card: each target's range and line, the Armee's order on it, what its rounds are doing now
  drawTargets(st, now) {
    if (!st.targets) return;
    this.rowsFor(st);
    if (this.cur < 0) this.cur = Math.max(0, st.targets.indexOf(st.target));
    this.tRows.forEach((w, i) => {
      const T = w.T, on = T === st.target;
      setCls(w.r, 'on', on);
      setCls(w.r, 'cur', i === this.cur && !on);
      setText(w.mark, on ? '◉' : '');
      setText(w.where, `${km(T.dist)} km ${deg(T.bearing)}°`);
      // the open order, else one that closed in the last minute and a half
      let o = null;
      for (const q of st.orders ?? []) if (q.target === T.id && (q.state === 'open' || (now != null && now - q.tEnd < 90))) o = q;
      let ot = '', oc = '';
      if (o?.state === 'open') { ot = `${o.got}/${o.need} · ${mmss(Math.max(0, o.due - (now ?? 0)))}`; oc = 'open'; }
      else if (o?.state === 'done') { ot = 'order done'; oc = 'ok'; }
      else if (o?.state === 'failed') { ot = 'too late'; oc = 'late'; }
      setText(w.ord, ot);
      w.ord.className = `po ${oc}`;
      setText(w.fx, T.cut ? (T.fx > 0.005 ? `−${Math.round(T.fx * 100)}%` : '') : T.held > 0 ? `+${Math.round(T.held / 60)} min` : '');
      const hov = `${T.name} (${T.en}), ${km(T.dist)} km on ${deg(T.bearing)}°. ${T.tip ?? ''} So far ${T.hits} rounds in its area, ${T.near} near.${o?.state === 'open' ? ` ORDER: ${o.need === 1 ? 'one round' : `${o.need} rounds`} in its area (${o.got} in so far), ${mmss(Math.max(0, o.due - (now ?? 0)))} left: ${o.why}` : ''} ${on ? 'The gun is laid on it.' : 'Click to lay the gun on it.'}`;
      tip(w.r, hov);
    });
  }

  key(e, u) {
    this.u = u;
    const c = e.code, big = e.shiftKey;
    if (!u.special) return false;
    if (e.repeat && c.startsWith('Arrow')) return true;
    if (this.drill.key(e)) return true;
    switch (c) {
      case 'ArrowUp': this.corr(1, 0, big); return true;
      case 'ArrowDown': this.corr(-1, 0, big); return true;
      case 'ArrowLeft': this.corr(0, -1, big); return true;
      case 'ArrowRight': this.corr(0, 1, big); return true;
      case 'KeyQ': this.powder(-1, big); return true;
      case 'KeyE': this.powder(1, big); return true;
      case 'KeyT': this.order('table'); return true;
      case 'Period': this.order('report'); return true;
      case 'KeyY': this.order('barrel'); return true;
      case 'KeyL': this.layCursor(); return true;
      case 'KeyR': this.say('The Paris Gun fires one round at a time.'); return true;
      case 'KeyZ': this.say('One fuze only: the long-range shell has its own percussion fuze.'); return true;
      case 'KeyG': this.say('One gun: there is nothing to choose.'); return true;
      case 'KeyX': this.say(`Fixed steps on this gun: ${STEP_RANGE} m and ${STEP_LINE} Strich (Shift: ten times).`); return true;
      case 'Backspace': case 'Delete': this.say('Nothing to cease: the gun fires one round at a time, on the firing key.'); return true;
      case 'Tab': {
        const n = u.special.targets?.length ?? 0;
        if (n) this.cur = (Math.max(0, this.cur) + (e.shiftKey ? n - 1 : 1)) % n;
        const T = u.special.targets?.[this.cur];
        if (T) this.say(`${T.name} (${T.en}) picked: L lays the gun on it.`);
        return true;
      }
    }
    return false;
  }
}

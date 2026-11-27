// A career battle's objectives (src/operation.js deals them; DESIGN.md "Missions"): each one's state judged from the
// game itself every step, never from "since it was given". The director (ww1/director.js) asks it whether the mains
// are done (the player may then end the battle, or call X-Zeit), which missions are the objectives' (m.obj: the
// console marks them, the crews put them first) and how many of the mains' fire missions have failed (the level's
// `fails`). It pays each one done through sim.objectivePay (research.js battleReward) and says so on the radio and
// through events.objective. A secondary reported during the battle (`reveal` on the day's clock) is 'hidden' until
// then. Node-safe; it draws no random numbers.
import { OBJECTIVE_PAY, MEDALS } from '../operation.js';

// the kinds done when their one target is out of action by the level's rules (destroyed; a British battery silenced,
// a laager broken up: ww1/director.js spent)
const TARGET_KINDS = new Set(['battery', 'dump', 'hq', 'laager', 'deep', 'concrete', 'tanks', 'duel', 'balloon', 'railgun']);
const SPENT_KINDS = new Set(['battery', 'laager', 'tanks', 'duel', 'railgun']);

export class Objectives {
  constructor(sim, op) {
    this.sim = sim;
    this.op = op;
    // (a hold: `held` s of the clock, `lastHit` the last burst near the point; a two-step main: `step` 1 (the battery) then 2 (its
    // dump), `ready` false until its fire mission is offered)
    this.list = op.objectives.map((o) => ({ ...o, state: o.reveal > 0 ? 'hidden' : 'open', done: 0, tEnd: null,
      ...(o.kind === 'hold' ? { held: 0, lastHit: null, running: false } : {}), ...(o.kind === 'trace' ? { step: 1, ready: false, openAt: null } : {}) }));
    this.medals = (op.medals ?? []).map((id) => ({ id, ...MEDALS[id], state: 'open' }));
    this.fails = 0; // the main objectives' fire missions failed (the level allows `fails`)
    this.traffic = 0; // trains and convoys wrecked
    this.paid = 0; // what the objectives have paid so far (before the level's pay)
    this.dyn = 0; // the objectives of the moment added in battle (add: the duel, counter-preparation)
    this.accomplished = null; // sim.time when every main target objective was done
    this.lastProgress = 0; // sim.time an objective was last done or reported (an all-auto lineup's end waits on it)
  }

  get mains() { return this.list.filter((o) => o.main); }
  // the mission's own secondaries (the full clear is theirs), and the objectives of the moment (`bonus`)
  get sides() { return this.list.filter((o) => !o.main && !o.bonus); }
  get bonus() { return this.list.filter((o) => o.bonus); }
  byId(id) { return this.list.find((o) => o.id === id) ?? null; }
  isTarget(o) { return TARGET_KINDS.has(o.kind); }

  // the open objective a site belongs to, or null (not one of its targets already done)
  ofTarget(id) {
    return this.list.find((o) => o.state === 'open' && o.kind !== 'xzeit' && o.ready !== false && o.targets.includes(id) && !o.gone?.includes(id)) ?? null;
  }

  // a target objective's targets still to be done: a main may name two or three, every one of them to be done (until
  // 2026-11-26 only its first counted: "Silence the 18-pounders on the Frezenberg road and on the Zouave Wood" was done
  // with the first silenced, and the battery that fired on the second fired for nothing)
  left(o) { return o.targets.filter((id) => !o.gone?.includes(id)); }
  // one of them out of action by the level's rules (destroyed; a British battery silenced, a laager broken up)
  out(o, id) { const t = this.sim.targetById(id); return !t || !t.alive || (SPENT_KINDS.has(o.kind) && !!this.sim.director.spent?.(t)); }

  // a new mission (the director's addMission): an objective's mission is marked and put first
  tag(m) {
    const o = m.targetId ? this.ofTarget(m.targetId) : null;
    if (!o) return;
    m.obj = o.id;
    m.objMain = o.main;
    // (a main before the routine counter-battery calls, whatever its distance: a deep target's 20 km cost the long
    // guns' crews more than three points of priority, and the K 18 shot at batteries while the deep strike waited)
    m.priority = (m.priority ?? 5) + (o.main ? 5 : 2);
  }

  // a mission ended (the director's finish): a main's failed counts against the level's `fails`
  missionEnd(m, ok) {
    const o = m.obj ? this.byId(m.obj) : null;
    if (!ok) { if (o?.main && o.state === 'open') this.fails++; return; }
    if (m.kind === 'harass') this.traffic++;
  }

  // per step: each objective judged from the game
  update() {
    const sim = this.sim, d = sim.director;
    if (sim.state !== 'playing') return;
    for (const o of this.list) {
      if (o.state === 'hidden') {
        if (d.dayTime >= o.reveal && !this.accomplished) this.reveal(o);
        continue;
      }
      if (o.state !== 'open') continue;
      if (o.kind === 'hold') {
        // (the director's holdUpdate runs the clock from the bursts)
        if (o.held >= o.hold.need) this.complete(o);
      } else if (o.kind === 'trace') {
        // step 1 the battery (the director offers its fire mission when it is located: ww1/director.js traceUpdate), silenced:
        // step 2, its dump reported; the dump gone: done
        const t = sim.targetById(o.targets[0]);
        if (o.step === 1) {
          if (!t || !t.alive || d.spent?.(t)) this.advance(o);
        } else if (!t || !t.alive) this.complete(o);
      } else if (this.isTarget(o)) {
        // (each target once out stays done, a battery a new one moves into after it fell silent too)
        for (const id of o.targets) {
          if ((o.gone ??= []).includes(id) || !this.out(o, id)) continue;
          o.gone.push(id);
          o.done = Math.min(o.n, o.gone.length);
          if (o.gone.length >= o.targets.length) break;
          this.lastProgress = sim.time;
          const t = sim.targetById(id);
          sim.radio(`${o.main ? 'Objective' : 'Secondary objective'}: ${t?.name ?? id} done, ${o.gone.length} of ${o.targets.length}.`, 'kill');
          sim.events.objective?.(o, 'step');
        }
        if (o.targets.length && o.gone.length >= o.targets.length) this.complete(o);
        else if (o.kind === 'tanks' && d.dayTime >= o.before) this.fail(o, 'its tanks went in with their attack');
        else if (o.kind === 'duel' && sim.time > o.until) this.fail(o, 'it has the range of our guns');
        else if (o.kind === 'duel' && !sim.unitById(o.unitId)?.alive) this.fail(o, `${sim.unitById(o.unitId)?.callsign ?? 'the battery'} is lost`);
      } else if (o.kind === 'traffic') {
        o.done = Math.min(o.n, this.traffic);
        if (o.done >= o.n) this.complete(o);
      } else if (o.kind === 'forts') {
        const left = o.targets.filter((id) => sim.targetById(id)?.alive).length;
        o.done = o.n - left;
        if (!left) this.complete(o);
        else if (sim.barrage?.went) this.fail(o, `${left} still standing when our men went over`);
      }
    }
    for (const m of this.medals) {
      if (m.state !== 'open') continue;
      if (m.id === 'nogun' && sim.stats.piecesLost > 0) m.state = 'failed';
      if (m.id === 'nobreach' && sim.stats.sos.some((q) => !q.held)) m.state = 'failed';
    }
    if (!this.accomplished && this.mainTargetsDone()) {
      this.accomplished = sim.time;
      this.lastProgress = sim.time;
      // (the secondaries not yet reported are reported now: the player chooses what to finish before the end)
      for (const o of this.list) if (o.state === 'hidden') this.reveal(o);
      sim.events.objective?.(null, 'accomplished');
    }
  }

  // the main target objectives done (the player may end the battle, or call X-Zeit); X-Zeit itself is the finale
  mainTargetsDone() { return this.mains.every((o) => o.state === 'done' || o.kind === 'xzeit'); }
  // the open objectives the director opens fire missions for (a two-step main's first once it is located)
  openTargets() { return this.list.filter((o) => o.state === 'open' && o.ready !== false && (this.isTarget(o) || o.kind === 'hold' || o.kind === 'trace')); }
  has(kind) { return this.list.find((o) => o.kind === kind) ?? null; }

  // an objective of the moment (the director's duel and counter-preparation): a secondary with no part in the full clear
  add(def) {
    const sim = this.sim;
    const o = { id: `d${++this.dyn}`, main: false, bonus: true, n: 1, done: 0, tEnd: null, reveal: 0, targets: [], timed: true, effect: null, role: null, doneLine: '', ...def, state: 'open' };
    this.list.push(o);
    // (not progress for an all-auto lineup's end: a moment offered is not one taken)
    sim.radio(`New secondary objective: ${o.title}. ${o.why}`, 'alert');
    sim.events.objective?.(o, 'reveal');
    return o;
  }

  // a two-step main's battery is silenced: its dump is reported, the second step
  advance(o) {
    const sim = this.sim, t = sim.targetById(o.then);
    o.step = 2;
    o.done = 1;
    o.ready = true;
    o.targets = [o.then];
    if (t) t.known = true;
    o.short = `Dump${t ? `, ${t.name.split(', ')[1] ?? t.name}` : ''}`;
    o.title = `Burn the ammunition dump${t ? ` at ${t.name.split(', ')[1] ?? t.name}` : ''}`;
    this.lastProgress = sim.time;
    sim.radio(`The battery has fallen silent: its ammunition dump is reported${t ? `, ${t.name}` : ''}. Burn it.`, 'kill');
    sim.events.objective?.(o, 'step');
  }

  reveal(o) {
    o.state = 'open';
    this.lastProgress = this.sim.time;
    this.sim.radio(`New secondary objective: ${o.title}. ${o.why}`, 'info');
    this.sim.events.objective?.(o, 'reveal');
  }

  complete(o) {
    if (o.state !== 'open') return;
    const sim = this.sim;
    o.state = 'done';
    o.done = o.n;
    o.tEnd = sim.time;
    this.lastProgress = sim.time;
    // (one the neighbouring Gruppe took on, the director's handOn: only the share our guns did is paid)
    const k = o.handed ? (o.gone?.length ?? 0) / Math.max(1, o.targets.length || 1) : 1;
    if (k > 0) this.pay((o.main ? OBJECTIVE_PAY.main : OBJECTIVE_PAY.side) * (o.value ?? 1) * k, { act: 'objective', title: o.title, main: o.main });
    sim.radio(`${o.main ? 'Objective' : 'Secondary objective'} done: ${o.title}${o.doneLine ? `: ${o.doneLine}` : ''}.`, 'kill');
    sim.events.objective?.(o, 'done');
    if (!o.main && !o.bonus && this.sides.every((q) => q.state === 'done')) {
      this.pay(OBJECTIVE_PAY.clear, { act: 'objective', title: 'Every secondary objective', main: false });
      sim.radio('Every secondary objective done: the full clear.', 'kill');
      sim.events.objective?.(null, 'clear');
    }
  }

  fail(o, why = '') {
    if (o.state !== 'open') return;
    o.state = 'failed';
    o.tEnd = this.sim.time;
    this.sim.radio(`${o.main ? 'Objective' : 'Secondary objective'} failed: ${o.title}${why ? `: ${why}` : ''}.`, 'warn');
    this.sim.events.objective?.(o, 'failed');
  }

  // the battle is over: X-Zeit decided by its assault, the medals earned on a win (paid)
  settle(won) {
    for (const o of this.list) if (o.kind === 'xzeit' && o.state === 'open') { if (won) this.complete(o); else this.fail(o); }
    for (const m of this.medals) {
      if (m.state !== 'open') continue;
      m.state = won ? 'done' : 'failed';
      if (won) this.pay(OBJECTIVE_PAY.medal, { act: 'objective', title: m.title, medal: true });
    }
  }

  pay(pts, why) {
    const sim = this.sim;
    if (sim.attract || sim.scripted) return;
    this.paid += pts;
    sim.objectivePay = (sim.objectivePay ?? 0) + pts;
    sim.events.reward?.('objective', pts, why);
  }
}

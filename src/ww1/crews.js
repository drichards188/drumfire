// The WW1 German mode's AI crews: the British crews' imperfect drill (slow to react, over-correcting, giving up) with
// the German roster's ideas of what each gun is for. The super-heavies (Bertha, Gamma, Langer Max) never answer the
// Sperrfeuer and keep their few shells for the British heavies, the HQ, the dumps and the railhead; the Paris Gun's
// crew works for its controller (special.js) and takes no missions; the K 17 takes the far targets and
// the traffic (shrapnel); the sFH 13 and the 21 cm Mörser carry the batteries, the tanks and the barrages. Bertha's and
// the Gamma's crews relay the bed (special.js) when nothing in their arc wants them and a worthwhile target beyond it
// leaves time for the move and a shoot; not always (they are slow to decide, like every crew here). The German
// career's battle also fields the WW2 batteries (ops.js RIDGE_WW2), each in its WW2 part: the leFH 18 and the sFH 18
// beside the sFH 13, the K 18 beside the K 17, the Mörser 18 beside the 21 cm Mörser, the Nebelwerfer on the
// batteries, the tanks and the traffic, the Gustav and the Karl with the super-heavies (the Karl turns its hull onto
// a target, as in the WW2 mode).
import { TARGETS, SHELLS } from '../sim/tables.js';
import { Crews } from '../sim/crews.js';
import { COVER } from '../sim/guns.js';
import { autoCharge } from '../sim/shells.js';
import { bearingOf } from '../sector.js';
import { FEUERWALZE, walzeMargin } from './director.js';

// The crews' cover under the British counter-battery fire (sim.cbModel, ww1/enemy.js RANGING): a crew on auto goes to
// its shelters when it knows their battery has it bracketed or fires for effect on it, and mans its guns again once
// the salvos have fallen. Imperfect on purpose, as the rest of its drill: it reacts in `react` s, a time in five
// (`late`) `lateBy` s later still, and a time in twelve (`stay`) serves on through the salvos; it waits `after` s past
// the last before it comes out. On a Sperrfeuer or the Feuerwalze it stays at the guns while it is only bracketed,
// ducks for the fire for effect itself and is back at the barrage `duty` s after the last salvo.
export const CREW_COVER = { react: [2, 8], late: 0.2, lateBy: [10, 30], stay: 0.08, after: [15, 40], duty: [4, 10] };
// a target's strength left: its standing parts' hp (t.hp runs ahead of it, a blow that knocks a part out counting in
// full: an HQ read 0 with one of its three parts standing)
const strength = (t) => t.parts.reduce((a, p) => a + (p.alive ? Math.max(0, p.hp) : 0), 0);
export const SUPER = new Set(['bertha', 'gamma', 'max38', 'gustav', 'karl', 'beta']);
const HEAVY = new Set(['m16', 'bertha', 'gamma', 'max38', 'mrs18', 'gustav', 'karl', 'beta']);
const BIG = new Set(['bgun15', 'bgun92', 'bgunrail', 'bgun6', 'hq', 'railyard', 'bdump', 'btanks', 'mebu', 'bunker']); // (bunker: a level's strongpoint, ops.js RIDGE_FORTS)
const LONG = new Set(['k17', 'k18', 'k16', 'k38']); // the long guns: counter-battery, the rear, the traffic
const RAIL = new Set(['max38', 'gustav']); // the railway guns: the railhead and the HQ first
const ROCKETS = new Set(['nbw41', 'nbw42']); // ripples that drench an area: batteries, tanks, traffic
const TRAFFIC = new Set(['k17', 'sfh13', 'lefh18', 'sfh18', 'k18', 'fk16', 'k16', 'hummel']); // the guns quick enough for the road
const SOFT_ONLY = new Set(['k17', 'k18', 'lefh18', 'fk16']); // too light a shell for the tanks and concrete
const FIELD = new Set(['sfh13', 'lefh18', 'sfh18', 'fk16', 'hummel']); // the Sperrfeuer and the Feuerwalze

export class CrewsWW1 extends Crews {
  // the red flares: every crew on auto turns to the Sperrfeuer in its own time, but on a level's mission a long gun or
  // a heavy working a main objective stays on it while another battery answers (a deep strike's 20 km shoot, broken
  // off for every attack, never finished: the battle dragged for hours)
  sosCalled(m) {
    const sim = this.sim;
    if (!sim.objectives) return super.sosCalled(m);
    const keep = (u) => {
      const w = this.state(u).m;
      return !!w?.objMain && w.state !== 'done' && w.state !== 'failed' && (LONG.has(u.kind) || HEAVY.has(u.kind) || !!w.role);
    };
    const kept = sim.units.filter((u) => u.alive && u.mode === 'auto' && keep(u));
    if (!kept.length || !sim.units.some((u) => u.alive && !kept.includes(u) && this.canServe(u, m))) return super.sosCalled(m);
    const held = kept.map((u) => [u, this.state(u).sosM]);
    super.sosCalled(m);
    for (const [u, prev] of held) this.state(u).sosM = prev ?? null;
  }

  // an objective of the moment calls a battery (a level's mission, ww1/director.js): counter-preparation the field
  // batteries and rockets (massing), the railway-gun hunt the long guns and the heavies when the gun fires (huntUpdate).
  // The battery best placed, on auto and not on a main objective's shoot or the Sperrfeuer, leaves what it is doing for
  // it after a moment's telephoning (a crew takes a new mission only when idle, and one battery serves a mission: the
  // men massed and went over, and the railway gun came and went, before any battery came free)
  prepCalled(m) { this.callTo(m, (u) => FIELD.has(u.kind) || ROCKETS.has(u.kind)); }
  huntCalled(m) { this.callTo(m, (u) => LONG.has(u.kind) || HEAVY.has(u.kind) || RAIL.has(u.kind)); }
  callTo(m, fits) {
    const sim = this.sim;
    let best = null, bs = -1e9;
    for (const u of sim.units) {
      if (!u.alive || u.mode !== 'auto' || !fits(u) || !this.canServe(u, m)) continue;
      const ai = this.state(u);
      if (ai.m === m || (ai.m?.objMain && ai.m !== m) || ai.st === 'sos' || ai.st === 'barrage' || ai.sosM || ai.prepM) continue;
      const s = this.score(u, m) + (ai.st === 'idle' ? 20 : 0);
      if (s > bs) { bs = s; best = u; }
    }
    if (best) Object.assign(this.state(best), { prepM: m, prepAt: sim.time + 8 + sim.rng() * 15 });
  }

  update(dt) {
    const sim = this.sim;
    if (sim.cbModel && this.cover !== false) this.coverUpdate();
    // (the railway-gun hunt: a crew on auto stops firing while the gun is withdrawn, and takes the hunt again when it
    // comes up: rounds on an empty firing point are wasted)
    if (sim.director.hunt) for (const u of sim.units) {
      const ai = u.ai;
      if (u.mode === 'auto' && ai?.m?.hunt && sim.targetById(ai.m.targetId)?.present === false) this.toIdle(u, ai, 5);
    }
    if (sim.objectives) for (const u of sim.units) {
      const ai = u.ai;
      if (!ai?.prepM || sim.time < ai.prepAt) continue;
      const m = ai.prepM;
      ai.prepM = null;
      if (!u.alive || u.mode !== 'auto' || m.state === 'done' || m.state === 'failed' || m.units.length) continue;
      if (ai.m?.objMain || ai.st === 'sos' || ai.st === 'barrage') continue;
      if (ai.m) this.toIdle(u, ai, 0);
      if (!sim.director.assign(u, m)) continue;
      Object.assign(ai, { m, seen: this.mine(u, m).length, ranged: 0, series: 0, chk: null, wait: sim.time + 3, st: m.state === 'ffe' ? 'ffe' : 'ranging' });
    }
    if (sim.level) this.effectUpdate();
    super.update(dt);
  }

  // this unit's reports on a mission (the observer's, not the "not observed" said to the player)
  mine(u, m) { return m.reports.filter((r) => r.unitId === u.id && !r.wild); }

  // (a threat level: the crew waits for the player's round still in the air, the one it reads, not for one of its own)
  handOver(u) {
    super.handOver(u);
    const sim = this.sim, ai = this.state(u);
    if (!sim.level || ai.st !== 'await') return;
    let t0 = Infinity;
    for (const s of sim.shells) if (s.own && s.alive && s.unitId === u.id) t0 = Math.min(t0, s.t0);
    if (t0 < Infinity) ai.fireT = t0;
  }

  // A threat level: a series that did nothing to its target fell wide of it (a lay passed on a round that burst in the
  // air or on a report of an earlier lay, their battery's fix gone stale): once its last round has come down the crew
  // stops the next series and ranges again, a round the observer reads, before it fires for effect once more. A crew that
  // fired three series blind gave the mission up, the director (a main's) gave it back, and it fired three more on the
  // same lay: a level battle that never ended (level 2 seed 35, 2026-11-26)
  effectUpdate() {
    const sim = this.sim;
    for (const u of sim.units) {
      const ai = u.ai, c = ai?.chk;
      if (!c || c.t1 == null || u.mode !== 'auto') continue;
      if (sim.shells.some((s) => s.own && s.alive && s.unitId === u.id && s.t0 <= c.t1)) continue;
      ai.chk = null;
      const m = ai.m, t = m?.targetId ? sim.targetById(m.targetId) : null;
      if (!t || !t.alive || m.id !== c.m || strength(t) < c.hp - 0.01 || (ai.st !== 'ffe' && ai.st !== 'firing') || m.units.length !== 1) continue;
      sim.guns.cease(u);
      if (m.state === 'ffe') sim.setMissionState(m, 'ranging');
      Object.assign(ai, { st: 'ranging', ranged: Math.min(ai.ranged, 2), wait: sim.time + 3 + sim.rng() * 5 });
    }
  }

  // the crews' cover (CREW_COVER); `this.cover = false` keeps every crew at its guns (tools/cbtest.mjs --policy none).
  // Not a battery the player serves a gun of (the gunner's own), nor one on the player's orders: those are the player's
  coverUpdate() {
    const sim = this.sim, now = sim.time, C = CREW_COVER, en = sim.enemyAI, rnd = (a) => a[0] + sim.rng() * (a[1] - a[0]);
    for (const u of sim.units) {
      if (!u.alive || u.mode !== 'auto' || u.pieces.some((p) => p.manned)) continue;
      const ai = this.state(u);
      const duty = ai.st === 'sos' || ai.st === 'barrage' || (ai.sosM && now >= ai.sosAt - COVER.run);
      const danger = en.dangerOn?.(u, duty);
      if (u.cover) {
        ai.cvIn = null;
        if (danger) { ai.cvOut = null; continue; }
        ai.cvOut ??= now + rnd(duty ? C.duty : C.after);
        if (now >= ai.cvOut) { ai.cvOut = null; sim.guns.setCover(u, false); }
      } else {
        ai.cvOut = null;
        if (!danger) { ai.cvIn = null; continue; }
        ai.cvIn ??= sim.rng() < C.stay ? Infinity : now + rnd(C.react) + (sim.rng() < C.late ? rnd(C.lateBy) : 0);
        if (now >= ai.cvIn) { ai.cvIn = null; sim.guns.setCover(u, true); }
      }
    }
  }

  suits(u, m) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    if (m.hunt && t?.present === false) return false; // (the railway gun withdrawn: nothing there to shoot at)
    // (the Karl's gate passes: it drives, turns and lowers onto the target)
    if (u.kind === 'paris' || (u.gate && u.kind !== 'karl')) return false; // (a self-propelled battery on the move too)
    // a threat level's Feuerwalze: the field guns and howitzers (any gun but the super-heavies when the lineup has none)
    if (m.kind === 'barrage' && this.sim.level && !FEUERWALZE.has(u.kind) && this.sim.units.some((q) => q.alive && FEUERWALZE.has(q.kind))) return false;
    if (m.kind === 'sos' || m.kind === 'barrage') return !SUPER.has(u.kind);
    if (SUPER.has(u.kind)) return !!t && BIG.has(t.kind);
    if (m.alt > 0) return u.kind === 'k17'; // (a mission laid in the air: the long guns with shrapnel; the balloon's is on its winch)
    if (ROCKETS.has(u.kind)) return !t || t.battery || t.kind === 'btanks' || t.kind === 'bconvoy' || t.kind === 'mebu' || t.kind === 'bpost';
    if (t?.kind === 'bconvoy') return TRAFFIC.has(u.kind);
    if (t && TARGETS[t.kind]?.hardness === 'hard') return !SOFT_ONLY.has(u.kind);
    return true;
  }

  // the Karl turns its whole hull onto a target: only its range limits it (as CrewsWW2)
  canServe(u, m) {
    if (u.kind !== 'karl') return super.canServe(u, m);
    if (!this.suits(u, m)) return false;
    return autoCharge(u.kind, Math.hypot(m.x - u.pos.x, m.z - u.pos.z)) >= 0 || u.special?.stage === 'travel';
  }

  // a mission the battery could take after relaying its bed (Bertha's and the Gamma's, special.js BedCtl): in reach,
  // its shell heavy enough, whatever the bed's present line (sim/specialists.js asks this before it opens one)
  canTake(u, m) {
    if (this.canServe(u, m)) return true;
    if (!u.special?.bed || !this.suits(u, m) || !u.pieces.some((q) => q.state !== 'dead')) return false;
    if (m.minHard && (SHELLS[u.kind]?.hard?.D ?? 0) < m.minHard) return false;
    return autoCharge(u.kind, Math.hypot(m.x - u.pos.x, m.z - u.pos.z)) >= 0;
  }

  // the Karl driving, turning or lowering: the crew waits for it rather than giving the task up
  ranging(u, ai, m) {
    if (u.gate && (u.kind === 'karl' || u.special?.kind === 'move')) { ai.wait = this.sim.time + 3; return; }
    super.ranging(u, ai, m);
  }

  ffe(u, ai, m) {
    const sim = this.sim;
    if (u.gate && (u.kind === 'karl' || u.special?.kind === 'move')) { ai.wait = sim.time + 3; return; }
    ai.seriesAt = sim.time;
    const n = ai.series;
    super.ffe(u, ai, m);
    // (a threat level: the series' effect is judged when its last round is down, effectUpdate; one check at a time, the
    // next series fired while the last is still in the air)
    const t = m.targetId ? sim.targetById(m.targetId) : null;
    if (sim.level && t && ai.series > n) ai.chk ??= { m: m.id, hp: strength(t), t1: null };
  }

  // a report's correction for the lay as it stands: less what has been laid since its round left (a correction made
  // while it was in the air, their battery's fix moved), so a report on an earlier lay is not corrected twice
  since(u, r) {
    const o = u.order, a = r.aim, c = { add: r.corr.add, right: r.corr.right, moved: 0 };
    if (!a || !o.target) return c;
    const L = Math.hypot(o.x - u.pos.x, o.z - u.pos.z) || 1, fx = (o.x - u.pos.x) / L, fz = (o.z - u.pos.z) / L;
    const dx = o.x - a.x, dz = o.z - a.z;
    c.add -= dx * fx + dz * fz;
    c.right -= dz * fx - dx * fz;
    c.moved = Math.hypot(dx, dz);
    return c;
  }

  // On a threat level the crews adjust their fire for effect as a battery commander does: the observer's "on target"
  // allows 45 m each way, which a heavy shell forgives and a 10 cm one does not (its effect ends at about 22 m), so they
  // take his last correction too, and correct between series from the series' mean fall. They read each report against
  // the lay its round was fired on (since): with the crews' correction applied at once, the reports of rounds fired
  // before it came in after it and were corrected again, and the lay ran 900 m off (level 2 seed 35, 2026-11-26)
  await(u, ai, m) {
    const sim = this.sim;
    if (!sim.level) return super.await(u, ai, m);
    const mine = this.mine(u, m);
    if (mine.length > ai.seen && !u.firing) {
      const r = mine[mine.length - 1];
      ai.seen = mine.length;
      // (a report on a round fired before the one it waits for: news of an earlier lay, which its last report or the
      // correction made since has already told it; the round it fired is still to come)
      if (r.fired != null && r.fired < (ai.fireT ?? 0) - 0.01) return;
      ai.wait = sim.time + 4 + sim.rng() * 6;
      const c = r.observed && r.over != null ? this.since(u, r) : null;
      // (on the lay as it stands, the observer's word; on an earlier one, the same 45 m each way of what is left)
      const ok = c && c.moved > 5 ? Math.abs(c.add) <= 45 && Math.abs(c.right) <= 45 : r.ok;
      if (ok) {
        if (c && Math.hypot(c.add, c.right) > 10) sim.guns.correct(u, c.add * 0.85, c.right * 0.85);
        ai.st = 'ffe';
      } else if (c) {
        // a crew's correction: usually right, sometimes too much, once in a while the wrong way round
        let gain = 0.8 + sim.rng() * 0.35;
        if (sim.rng() < 0.1) gain *= 1.6;
        let right = c.right * gain;
        if (sim.rng() < 0.05) right = -right;
        sim.guns.correct(u, c.add * gain, right);
        ai.st = ai.ranged >= 5 ? 'ffe' : 'ranging';
      } else ai.st = ai.ranged >= 5 ? 'ffe' : 'ranging';
    } else if (sim.time > ai.deadline) {
      // no report came: fire another round, or give up on a silent observer
      ai.st = ai.ranged >= 4 ? 'ffe' : 'ranging';
    }
  }

  firing(u, ai, m) {
    const sim = this.sim;
    if (sim.level && !u.firing && ai.seriesAt != null) {
      const rs = m.reports.filter((r) => r.unitId === u.id && !r.wild && r.observed && r.over != null && r.t >= ai.seriesAt);
      if (rs.length) {
        const cs = rs.map((r) => this.since(u, r));
        const add = cs.reduce((a, c) => a + c.add, 0) / cs.length, right = cs.reduce((a, c) => a + c.right, 0) / cs.length;
        if (Math.hypot(add, right) > 10) sim.guns.correct(u, add * 0.8, right * 0.8);
      }
      ai.seriesAt = null;
      if (ai.chk && ai.chk.t1 == null) ai.chk.t1 = sim.time;
    }
    return super.firing(u, ai, m);
  }

  // a threat level's Feuerwalze: lifted as the British crews lift theirs, each gun laid its margin beyond the line
  // (director.js walzeMargin) and the batteries spread across the lane, not by their unit numbers (up to 13 here)
  barrage(u, ai, m) {
    const sim = this.sim;
    if (!sim.level) return super.barrage(u, ai, m);
    if (m.lift !== ai.lift) {
      // (a crew that has not lifted yet stops firing: its series on the old line would fall among our men)
      if (!ai.liftAt) { ai.liftAt = sim.time + 5 + sim.rng() * 12 + (sim.rng() < 0.22 ? 45 : 0); sim.guns.cease(u); }
      if (sim.time >= ai.liftAt) {
        ai.liftAt = 0;
        ai.lift = m.lift;
        const k = Math.max(0, m.units.indexOf(u.id)), n = Math.max(1, m.units.length);
        sim.guns.setTarget(u, m.x - walzeMargin(u, m.x, m.z), m.z, { sheaf: 55, shift: (k - (n - 1) / 2) * Math.min(65, 420 / n), fuze: u.order.fuze ?? 'instant' });
        sim.guns.setRounds(u, 99);
        sim.guns.fire(u);
      }
    } else if (!u.firing) sim.guns.fire(u);
  }

  score(u, m) {
    const sim = this.sim, t = m.targetId ? sim.targetById(m.targetId) : null;
    const D = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
    let s = m.priority * 10 - D / 1500;
    const k = t?.kind;
    if (m.kind === 'cb') s += LONG.has(u.kind) ? 12 : HEAVY.has(u.kind) ? 6 : 0;
    if (k === 'bgun15' || k === 'bgunrail' || k === 'bgun92') s += SUPER.has(u.kind) ? 16 : 0;
    if (k === 'railyard' || k === 'hq') s += RAIL.has(u.kind) || LONG.has(u.kind) ? 18 : SUPER.has(u.kind) ? 8 : -4;
    if (k === 'bdump') s += SUPER.has(u.kind) || u.kind === 'm16' || u.kind === 'mrs18' ? 8 : 0;
    if (k === 'btanks') s += u.kind === 'sfh13' || u.kind === 'm16' || u.kind === 'sfh18' || u.kind === 'mrs18' || u.kind === 'hummel' || ROCKETS.has(u.kind) ? 10 : 0;
    if (k === 'bconvoy') s += u.kind === 'k17' || u.kind === 'lefh18' || u.kind === 'fk16' ? 8 : -4;
    if (k === 'bballoon') s += 20;
    if (k === 'bfield') s += FIELD.has(u.kind) || ROCKETS.has(u.kind) ? 8 : SUPER.has(u.kind) ? -20 : 0;
    if (m.kind === 'barrage') s += FIELD.has(u.kind) ? 8 : 4;
    if (m.role) s += 10; // a deep or heavy target (sim/specialists.js): only the guns made for it can serve it
    if (m.role === 'fort') s += 30; // (a strongpoint in the X-Zeit lanes: our assault pays for each left standing, so before their heavies)
    if (m.prep) s += FIELD.has(u.kind) || ROCKETS.has(u.kind) ? 10 : 0; // (counter-preparation: men massing in a trench, the field guns' work)
    if (m.column) s += u.kind === 'k17' || u.kind === 'lefh18' || u.kind === 'fk16' ? 10 : 0; // (a column in the open: shrapnel)
    return s;
  }

  pick(u, ai) {
    const sim = this.sim, bed = u.special?.bed;
    // a strongpoint beyond the bed's arc comes before anything inside it: relay the bed onto it first
    if (bed && !ai.m && !u.gate && u.mode === 'auto' && bed.state !== 'moving') {
      const p = u.pieces.find((q) => q.state !== 'dead');
      const fort = p && sim.missions.find((m) => m.role === 'fort' && m.state !== 'done' && m.state !== 'failed' && !m.units.length && !this.canServe(u, m) && this.canTake(u, m));
      if (fort && sim.special?.of(u)?.rebed(bearingOf(fort.x - u.pos.x, fort.z - u.pos.z), true)) return;
    }
    const was = ai.m;
    super.pick(u, ai);
    // (a threat level: the reports on a mission it worked before are not news. A crew that gave a main up and took it
    // again read its old "on target" as the answer to its new round, went straight to fire for effect on the lay that had
    // missed, or corrected an old miss a second time)
    if (sim.level && ai.m && ai.m !== was) { ai.seen = this.mine(u, ai.m).length; ai.chk = null; }
    if (!bed || ai.m || u.gate || u.mode !== 'auto' || sim.time < (ai.bedAt ?? 0)) return;
    ai.bedAt = sim.time + 30;
    const p = u.pieces.find((q) => q.state !== 'dead');
    if (!p) return;
    let best = null, bs = -1e9;
    for (const m of sim.missions) {
      if (m.state !== 'open' || m.kind === 'sos' || m.kind === 'barrage' || m.units.length) continue;
      if (!this.suits(u, m) || (m.deadline != null && m.deadline - sim.time < bed.dur + 180)) continue; // (a strongpoint has no clock)
      if (m.minHard && (SHELLS[u.kind]?.hard?.D ?? 0) < m.minHard) continue;
      const b = bearingOf(m.x - u.pos.x, m.z - u.pos.z);
      if (Math.abs(Math.atan2(Math.sin(p.bearing - b), Math.cos(p.bearing - b))) <= u.arc) continue;
      if (autoCharge(u.kind, Math.hypot(m.x - u.pos.x, m.z - u.pos.z)) < 0) continue;
      const s = this.score(u, m);
      if (s > bs) { bs = s; best = m; }
    }
    if (best && sim.rng() < 0.6) sim.special?.of(u)?.rebed(bearingOf(best.x - u.pos.x, best.z - u.pos.z), true);
  }
}

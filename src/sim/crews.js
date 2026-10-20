// The AI crews (mode 'auto'). They take missions by priority and range, range with the reports, fire for
// effect and answer SOS, but imperfectly on purpose so the player matters: slow to react, they over-correct,
// sometimes read a correction the wrong way round, waste rounds, give up early and keep firing under
// counter-battery fire for too long.
import { bearingOf, YARD } from '../sector.js';
import { FFE } from './tables.js';
import { autoCharge } from './shells.js';
import { wrapPi } from './guns.js';

export class Crews {
  constructor(sim) {
    this.sim = sim;
  }

  state(u) {
    return (u.ai ??= { st: 'idle', wait: 2 + this.sim.rng() * 6, m: null, seen: 0, ranged: 0, series: 0, skip: new Set(), holdUntil: 0, sosM: null, sosAt: 0, lift: 0, liftAt: 0, fireT: 0 });
  }

  reset() {
    for (const u of this.sim.units) u.ai = null;
  }

  // what a gun is for: the heavies leave wire and the balloon alone, only the 60-pdr fires shrapnel at the
  // balloon, the light guns do not waste shells on concrete
  suits(u, m) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    const heavy = u.kind === 'bl15' || u.kind === 'rail';
    if (m.kind === 'wire') return !heavy && u.kind !== 'bl92';
    if (m.alt > 0) return u.kind === 'bl60';
    if (t?.kind === 'mebu') return u.kind !== 'bl6' && u.kind !== 'bl60';
    if (t?.kind === 'railyard') return heavy || u.kind === 'bl92';
    return true;
  }

  canServe(u, m) {
    if (!this.suits(u, m)) return false;
    const D = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
    if (autoCharge(u.kind, D) < 0) return false;
    const p = u.pieces.find((q) => q.state !== 'dead');
    if (!p) return false;
    return Math.abs(wrapPi(p.bearing - bearingOf(m.x - u.pos.x, m.z - u.pos.z))) <= u.arc;
  }

  score(u, m) {
    const sim = this.sim, t = m.targetId ? sim.targetById(m.targetId) : null;
    const D = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
    let s = m.priority * 10 - D / 1500;
    const heavy = u.kind === 'bl15' || u.kind === 'bl92' || u.kind === 'rail';
    if (t?.kind === 'mebu') s += heavy ? 14 : -4;
    if (m.kind === 'cb') s += heavy ? 8 : 0;
    if (m.kind === 'wire') s += heavy ? -14 : 8;
    if (t?.kind === 'railyard') s += u.kind === 'rail' ? 20 : -5;
    if (t?.kind === 'crossroads') s += heavy ? -6 : 6;
    if (t?.kind === 'balloon') s += u.kind === 'bl60' ? 20 : -10;
    if (m.kind === 'barrage') s += u.kind === 'bl15' ? -10 : 6;
    return s;
  }

  // the SOS rockets: every crew lays on the line, after a reaction time
  sosCalled(m) {
    const sim = this.sim;
    for (const u of sim.units) {
      if (!u.alive || u.mode !== 'auto') continue;
      const ai = this.state(u);
      ai.sosM = m;
      ai.sosAt = sim.time + 8 + sim.rng() * 28 + (sim.rng() < 0.2 ? 25 : 0);
    }
  }

  update(dt) {
    const sim = this.sim, now = sim.time;
    for (const u of sim.units) {
      if (!u.alive || u.mode !== 'auto') continue;
      const ai = this.state(u);
      // too slow to shelter: only a unit that has been battered goes quiet, and late
      if (now < ai.holdUntil) continue;
      if (!sim.attract && u.signature > 0.97 && now - u.underFire < 15 && u.hits > 3) {
        ai.holdUntil = now + 45;
        sim.guns.cease(u);
        continue;
      }
      if (ai.sosM) {
        const m = ai.sosM;
        if (m.state === 'done' || m.state === 'failed') ai.sosM = null;
        else if (now >= ai.sosAt) {
          ai.sosM = null;
          if (this.canServe(u, m)) {
            sim.director.assign(u, m);
            sim.guns.fire(u);
            ai.m = m;
            ai.st = 'sos';
            continue;
          }
        } else if (ai.st !== 'sos') {
          // waiting for the reaction time: carry on
        }
      }
      if (ai.st === 'sos') {
        if (!ai.m || ai.m.state === 'done' || ai.m.state === 'failed') this.toIdle(u, ai, 6);
        else if (!u.firing) sim.guns.fire(u);
        continue;
      }
      if (now < ai.wait) continue;
      const m = ai.m;
      if (ai.st !== 'idle' && (!m || m.state === 'done' || m.state === 'failed' || u.missionId !== m.id)) {
        this.toIdle(u, ai, 3 + sim.rng() * 6);
        continue;
      }
      switch (ai.st) {
        case 'idle': this.pick(u, ai); break;
        case 'ranging': this.ranging(u, ai, m); break;
        case 'await': this.await(u, ai, m); break;
        case 'ffe': this.ffe(u, ai, m); break;
        case 'firing': this.firing(u, ai, m); break;
        case 'barrage': this.barrage(u, ai, m); break;
      }
    }
  }

  toIdle(u, ai, wait) {
    if (u.missionId != null) this.sim.director.release(u);
    ai.st = 'idle';
    ai.m = null;
    ai.wait = this.sim.time + wait;
    ai.seen = 0;
    ai.ranged = 0;
    ai.series = 0;
  }

  pick(u, ai) {
    const sim = this.sim;
    let best = null, bs = -1e9;
    for (const m of sim.missions) {
      if (m.state !== 'open' && !(m.kind === 'barrage' && m.state !== 'done' && m.state !== 'failed')) continue;
      if (m.kind === 'sos' || ai.skip.has(m.id)) continue;
      if (m.kind !== 'barrage' && m.units.length) continue;
      if (m.kind === 'barrage' && m.units.includes(u.id)) continue;
      if (!this.canServe(u, m)) continue;
      const s = this.score(u, m);
      if (s > bs) {
        bs = s;
        best = m;
      }
    }
    if (!best) {
      ai.wait = sim.time + 3;
      return;
    }
    // a crew takes a moment to read the order, and the odd one misses it
    if (sim.rng() < 0.12) {
      ai.wait = sim.time + 10 + sim.rng() * 10;
      return;
    }
    if (!sim.director.assign(u, best)) return;
    ai.m = best;
    ai.seen = 0;
    ai.ranged = 0;
    ai.series = 0;
    ai.wait = sim.time + 4 + sim.rng() * 8;
    ai.st = best.kind === 'barrage' ? 'barrage' : best.state === 'ffe' ? 'ffe' : 'ranging';
    ai.lift = best.lift;
    if (best.kind === 'barrage') sim.guns.fire(u);
  }

  anyReady(u) {
    return u.pieces.some((p) => p.state === 'ready' && !p.blocked);
  }

  ranging(u, ai, m) {
    const sim = this.sim;
    if (!u.order.ok) return this.giveUp(u, ai, m);
    if (!this.anyReady(u)) return;
    sim.guns.setRounds(u, 1);
    if (!sim.guns.fire(u)) return this.giveUp(u, ai, m);
    ai.ranged++;
    ai.st = 'await';
    ai.fireT = sim.time;
    ai.wait = sim.time + 1;
    ai.deadline = sim.time + (u.order.tof || 30) + 40;
  }

  await(u, ai, m) {
    const sim = this.sim;
    const mine = m.reports.filter((r) => r.unitId === u.id && !r.wild);
    if (mine.length > ai.seen && !u.firing) {
      const r = mine[mine.length - 1];
      ai.seen = mine.length;
      ai.wait = sim.time + 4 + sim.rng() * 6;
      if (r.ok || ai.ranged >= 5) {
        ai.st = 'ffe';
      } else if (r.observed && r.over != null) {
        // a crew's correction: usually right, sometimes too much, once in a while the wrong way round
        let gain = 0.8 + sim.rng() * 0.35;
        if (sim.rng() < 0.1) gain *= 1.6;
        let right = r.corr.right * gain;
        if (sim.rng() < 0.05) right = -right;
        sim.guns.correct(u, r.corr.add * gain, right);
        ai.st = 'ranging';
      } else ai.st = 'ranging';
    } else if (sim.time > ai.deadline) {
      // no report came: fire another round, or give up on a silent observer
      ai.st = ai.ranged >= 4 ? 'ffe' : 'ranging';
    }
  }

  ffe(u, ai, m) {
    const sim = this.sim;
    if (!u.order.ok) return this.giveUp(u, ai, m);
    if (!this.anyReady(u)) return;
    const t = m.targetId ? sim.targetById(m.targetId) : null;
    const key = m.kind === 'wire' ? 'wire' : t ? t.kind : 'sos';
    let n = FFE[u.kind][key] ?? 4;
    if (sim.rng() < 0.3) n = Math.ceil(n * 1.5);
    sim.guns.setRounds(u, n);
    if (!sim.guns.fire(u)) return this.giveUp(u, ai, m);
    ai.series++;
    ai.st = 'firing';
    ai.wait = sim.time + 2;
  }

  firing(u, ai, m) {
    const sim = this.sim;
    if (u.firing) return;
    // the series is over; if the mission is not done, shoot again a couple of times and then give it up
    if (ai.series >= 3) return this.giveUp(u, ai, m);
    ai.st = 'ffe';
    ai.wait = sim.time + 6 + sim.rng() * 8;
  }

  barrage(u, ai, m) {
    const sim = this.sim;
    if (m.lift !== ai.lift) {
      // lift the barrage; the crew is sometimes a lift late
      if (!ai.liftAt) ai.liftAt = sim.time + 5 + sim.rng() * 12 + (sim.rng() < 0.22 ? 45 : 0);
      if (sim.time >= ai.liftAt) {
        ai.liftAt = 0;
        ai.lift = m.lift;
        sim.guns.setTarget(u, m.x, m.z, { sheaf: 55, shift: (u.id - 3) * 65, fuze: 'instant' });
        sim.guns.setRounds(u, 99);
        sim.guns.fire(u);
      }
    } else if (!u.firing) sim.guns.fire(u);
  }

  giveUp(u, ai, m) {
    ai.skip.add(m.id);
    this.toIdle(u, ai, 12 + this.sim.rng() * 10);
  }
}

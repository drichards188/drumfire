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
import { TARGETS } from '../sim/tables.js';
import { Crews } from '../sim/crews.js';
import { autoCharge } from '../sim/shells.js';
import { bearingOf } from '../sector.js';
import { FEUERWALZE, walzeMargin } from './director.js';

export const SUPER = new Set(['bertha', 'gamma', 'max38', 'gustav', 'karl']);
const HEAVY = new Set(['m16', 'bertha', 'gamma', 'max38', 'mrs18', 'gustav', 'karl']);
const BIG = new Set(['bgun15', 'bgun92', 'bgunrail', 'bgun6', 'hq', 'railyard', 'bdump', 'btanks', 'mebu']);
const LONG = new Set(['k17', 'k18']); // the long guns: counter-battery, the rear, the traffic
const TRAFFIC = new Set(['k17', 'sfh13', 'lefh18', 'sfh18', 'k18']); // the guns quick enough for the road
const SOFT_ONLY = new Set(['k17', 'k18', 'lefh18']); // too light a shell for the tanks and concrete
const FIELD = new Set(['sfh13', 'lefh18', 'sfh18']); // the Sperrfeuer and the Feuerwalze

export class CrewsWW1 extends Crews {
  suits(u, m) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    // (the Karl's gate passes: it drives, turns and lowers onto the target)
    if (u.kind === 'paris' || (u.gate && u.kind !== 'karl')) return false;
    // a threat level's Feuerwalze: the field guns and howitzers (any gun but the super-heavies when the lineup has none)
    if (m.kind === 'barrage' && this.sim.level && !FEUERWALZE.has(u.kind) && this.sim.units.some((q) => q.alive && FEUERWALZE.has(q.kind))) return false;
    if (m.kind === 'sos' || m.kind === 'barrage') return !SUPER.has(u.kind);
    if (SUPER.has(u.kind)) return !!t && BIG.has(t.kind);
    if (t?.kind === 'bballoon' || m.alt > 0) return u.kind === 'k17';
    if (u.kind === 'nbw41') return !t || t.battery || t.kind === 'btanks' || t.kind === 'bconvoy';
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

  // the Karl driving, turning or lowering: the crew waits for it rather than giving the task up
  ranging(u, ai, m) {
    if (u.gate && u.kind === 'karl') { ai.wait = this.sim.time + 3; return; }
    super.ranging(u, ai, m);
  }

  ffe(u, ai, m) {
    if (u.gate && u.kind === 'karl') { ai.wait = this.sim.time + 3; return; }
    ai.seriesAt = this.sim.time;
    super.ffe(u, ai, m);
  }

  // On a threat level the crews adjust their fire for effect as a battery commander does: the observer's "on target"
  // allows 45 m each way, which a heavy shell forgives and a 10 cm one does not (its effect ends at about 22 m), so they
  // take his last correction too, and correct between series from the series' mean fall
  await(u, ai, m) {
    const sim = this.sim;
    if (!sim.level) return super.await(u, ai, m);
    const mine = m.reports.filter((r) => r.unitId === u.id && !r.wild);
    const r = mine[mine.length - 1];
    if (mine.length > ai.seen && !u.firing && r?.ok && r.observed && r.over != null && Math.hypot(r.corr.add, r.corr.right) > 10) {
      sim.guns.correct(u, r.corr.add * 0.85, r.corr.right * 0.85);
    }
    return super.await(u, ai, m);
  }

  firing(u, ai, m) {
    const sim = this.sim;
    if (sim.level && !u.firing && ai.seriesAt != null) {
      const rs = m.reports.filter((r) => r.unitId === u.id && !r.wild && r.observed && r.over != null && r.t >= ai.seriesAt);
      if (rs.length) {
        const add = rs.reduce((a, r) => a + r.corr.add, 0) / rs.length, right = rs.reduce((a, r) => a + r.corr.right, 0) / rs.length;
        if (Math.hypot(add, right) > 10) sim.guns.correct(u, add * 0.8, right * 0.8);
      }
      ai.seriesAt = null;
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
    if (k === 'railyard' || k === 'hq') s += u.kind === 'max38' || u.kind === 'gustav' || LONG.has(u.kind) ? 18 : SUPER.has(u.kind) ? 8 : -4;
    if (k === 'bdump') s += SUPER.has(u.kind) || u.kind === 'm16' || u.kind === 'mrs18' ? 8 : 0;
    if (k === 'btanks') s += u.kind === 'sfh13' || u.kind === 'm16' || u.kind === 'sfh18' || u.kind === 'mrs18' || u.kind === 'nbw41' ? 10 : 0;
    if (k === 'bconvoy') s += u.kind === 'k17' || u.kind === 'lefh18' ? 8 : -4;
    if (k === 'bballoon') s += 20;
    if (k === 'bfield') s += FIELD.has(u.kind) || u.kind === 'nbw41' ? 8 : SUPER.has(u.kind) ? -20 : 0;
    if (m.kind === 'barrage') s += FIELD.has(u.kind) ? 8 : 4;
    if (m.role) s += 10; // a deep or heavy target (sim/specialists.js): only the guns made for it can serve it
    return s;
  }

  pick(u, ai) {
    super.pick(u, ai);
    const sim = this.sim, bed = u.special?.bed;
    if (!bed || ai.m || u.gate || u.mode !== 'auto' || sim.time < (ai.bedAt ?? 0)) return;
    ai.bedAt = sim.time + 30;
    const p = u.pieces.find((q) => q.state !== 'dead');
    if (!p) return;
    let best = null, bs = -1e9;
    for (const m of sim.missions) {
      if (m.state !== 'open' || m.kind === 'sos' || m.kind === 'barrage' || m.units.length) continue;
      if (!this.suits(u, m) || m.deadline - sim.time < bed.dur + 180) continue;
      const b = bearingOf(m.x - u.pos.x, m.z - u.pos.z);
      if (Math.abs(Math.atan2(Math.sin(p.bearing - b), Math.cos(p.bearing - b))) <= u.arc) continue;
      if (autoCharge(u.kind, Math.hypot(m.x - u.pos.x, m.z - u.pos.z)) < 0) continue;
      const s = this.score(u, m);
      if (s > bs) { bs = s; best = m; }
    }
    if (best && sim.rng() < 0.6) sim.special?.of(u)?.rebed(bearingOf(best.x - u.pos.x, best.z - u.pos.z), true);
  }
}

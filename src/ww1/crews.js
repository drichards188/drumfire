// The WW1 German mode's AI crews: the British crews' imperfect drill (slow to react, over-correcting, giving up) with
// the German roster's ideas of what each gun is for. The super-heavies (Bertha, Gamma, Langer Max) never answer the
// Sperrfeuer and keep their few shells for the British heavies, the HQ, the dumps and the railhead; the Paris Gun's
// crew works for its controller (special.js) and takes no missions; the K 17 takes the far targets and
// the traffic (shrapnel); the sFH 13 and the 21 cm Mörser carry the batteries, the tanks and the barrages. Bertha's and
// the Gamma's crews relay the bed (special.js) when nothing in their arc wants them and a worthwhile target beyond it
// leaves time for the move and a shoot; not always (they are slow to decide, like every crew here).
import { TARGETS } from '../sim/tables.js';
import { Crews } from '../sim/crews.js';
import { autoCharge } from '../sim/shells.js';
import { bearingOf } from '../sector.js';

export const SUPER = new Set(['bertha', 'gamma', 'max38']);
const HEAVY = new Set(['m16', 'bertha', 'gamma', 'max38']);
const BIG = new Set(['bgun15', 'bgun92', 'bgunrail', 'bgun6', 'hq', 'railyard', 'bdump', 'btanks']);

export class CrewsWW1 extends Crews {
  suits(u, m) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    if (u.kind === 'paris' || u.gate) return false;
    if (m.kind === 'sos' || m.kind === 'barrage') return !SUPER.has(u.kind);
    if (SUPER.has(u.kind)) return !!t && BIG.has(t.kind);
    if (t?.kind === 'bballoon' || m.alt > 0) return u.kind === 'k17';
    if (t?.kind === 'bconvoy') return u.kind === 'k17' || u.kind === 'sfh13';
    if (t && TARGETS[t.kind]?.hardness === 'hard') return u.kind !== 'k17';
    return true;
  }

  score(u, m) {
    const sim = this.sim, t = m.targetId ? sim.targetById(m.targetId) : null;
    const D = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
    let s = m.priority * 10 - D / 1500;
    const k = t?.kind;
    if (m.kind === 'cb') s += u.kind === 'k17' ? 12 : HEAVY.has(u.kind) ? 6 : 0;
    if (k === 'bgun15' || k === 'bgunrail' || k === 'bgun92') s += SUPER.has(u.kind) ? 16 : 0;
    if (k === 'railyard' || k === 'hq') s += u.kind === 'max38' || u.kind === 'k17' ? 18 : SUPER.has(u.kind) ? 8 : -4;
    if (k === 'bdump') s += SUPER.has(u.kind) || u.kind === 'm16' ? 8 : 0;
    if (k === 'btanks') s += u.kind === 'sfh13' || u.kind === 'm16' ? 10 : 0;
    if (k === 'bconvoy') s += u.kind === 'k17' ? 8 : -4;
    if (k === 'bballoon') s += 20;
    if (k === 'bfield') s += u.kind === 'sfh13' ? 8 : SUPER.has(u.kind) ? -20 : 0;
    if (m.kind === 'barrage') s += u.kind === 'sfh13' ? 8 : 4;
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

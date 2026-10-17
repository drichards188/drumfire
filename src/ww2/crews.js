// The WW2 mode's AI crews: the British crews' imperfect drill (slow to react, over-correcting, giving up) with
// German kinds' ideas of what a gun is for. The super-heavies (Gustav, Karl, Bertha) never answer the Sperrfeuer
// and never waste their few shells on field targets; the Nebelwerfer drenches infantry, tanks and batteries and
// leaves concrete alone; the light howitzers leave the fortress works to the heavies.
import { TARGETS } from '../sim/tables.js';
import { Crews } from '../sim/crews.js';
import { autoCharge } from '../sim/shells.js';

const SUPER = new Set(['gustav', 'karl', 'bertha']);
const HEAVY = new Set(['k18', 'mrs18', 'gustav', 'karl', 'bertha']);

export class CrewsWW2 extends Crews {
  suits(u, m) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    const hard = t && TARGETS[t.kind]?.hardness !== 'soft';
    // the Gustav being built and the launch sites are not for the crews; the Karl's gate passes (it moves and lowers)
    if (u.gate && u.kind !== 'karl') return false;
    if (m.kind === 'sos' || m.kind === 'barrage') return !SUPER.has(u.kind);
    if (SUPER.has(u.kind)) return !!t && (hard || t.kind === 'hq' || t.kind === 'railyard' || t.kind === 'adump');
    if (t?.kind === 'magazine') return false;
    if (hard && t.kind !== 'tanks') return HEAVY.has(u.kind) || u.kind === 'sfh18';
    if (u.kind === 'nbw41') return !t || t.kind === 'tanks' || t.battery || t.kind === 'aop' || t.kind === 'aconvoy';
    return true;
  }

  // the Karl turns its whole hull onto a target: only its range limits it
  canServe(u, m) {
    if (u.kind !== 'karl') return super.canServe(u, m);
    if (!this.suits(u, m)) return false;
    const D = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
    return autoCharge(u.kind, D) >= 0 || u.special?.stage === 'travel';
  }

  // the Karl driving, turning or lowering: the crew waits for it rather than giving the task up
  ranging(u, ai, m) {
    if (u.gate && u.kind === 'karl') { ai.wait = this.sim.time + 3; return; }
    super.ranging(u, ai, m);
  }

  ffe(u, ai, m) {
    if (u.gate && u.kind === 'karl') { ai.wait = this.sim.time + 3; return; }
    super.ffe(u, ai, m);
  }

  score(u, m) {
    const sim = this.sim, t = m.targetId ? sim.targetById(m.targetId) : null;
    const D = Math.hypot(m.x - u.pos.x, m.z - u.pos.z);
    let s = m.priority * 10 - D / 1500;
    const hard = t && TARGETS[t.kind]?.hardness !== 'soft';
    if (hard) s += HEAVY.has(u.kind) ? 14 : -4;
    if (m.kind === 'cb') s += u.kind === 'k18' ? 14 : HEAVY.has(u.kind) ? 6 : 0;
    if (t?.kind === 'railyard' || t?.kind === 'hq') s += u.kind === 'k18' || SUPER.has(u.kind) ? 18 : -4;
    if (t?.kind === 'tanks') s += u.kind === 'nbw41' || u.kind === 'sfh18' ? 10 : 0;
    if (t?.kind === 'aconvoy') s += u.kind === 'lefh18' ? 8 : HEAVY.has(u.kind) ? -8 : 0;
    if (m.kind === 'barrage') s += u.kind === 'lefh18' || u.kind === 'sfh18' ? 8 : 0;
    return s;
  }
}

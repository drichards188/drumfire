// The WW2 mode's observers: the British fall-of-shot logic with German words and metres. The forward observer
// (VB, vorgeschobener Beobachter) telephones the correction in metres ("weiter 200, links 50"); the spotter
// aircraft (a Fieseler Storch) radios it rounded to 50 m and loses rounds more often; sound and flash ranging
// (Schall- und Lichtmeßtrupp) and map shoots (Kartenschießen) give no reports.
import { Observers } from '../sim/observers.js';

const r10 = (m) => Math.round(m / 10) * 10;
const r50 = (m) => Math.round(m / 50) * 50;

export class ObserversWW2 extends Observers {
  deliver(q) {
    const sim = this.sim, { m, u, shell } = q;
    const rep = {
      t: sim.time, missionId: m.id, unitId: u.id, shellId: shell.id, over: null, right: null, clock: null, text: '', ok: false,
      observed: true, corr: { add: 0, right: 0 }, n: (m.rounds = (m.rounds ?? 0) + 1), observer: m.observer, metric: true,
    };
    const d = Math.hypot(q.over, q.right);
    const air = m.observer === 'air';
    if (q.wild && !sim.scripted) {
      rep.observed = false;
      rep.wild = true;
      rep.text = `${m.obsName}: Einschlag nicht beobachtet (round not observed), far off the target.`;
    } else if (!sim.scripted && d > (air ? 1200 : 900)) {
      rep.observed = false;
      rep.text = `${m.obsName}: nicht beobachtet (not observed).`;
    } else {
      const k = air ? 0.14 : 0.08, kn = sim.scripted ? 0.5 : 1;
      const eo = q.over + sim.gauss() * Math.max(air ? 15 : 8, Math.abs(q.over) * k) * kn;
      const er = q.right + sim.gauss() * Math.max(air ? 12 : 6, Math.abs(q.right) * k) * kn;
      rep.over = eo;
      rep.right = er;
      rep.ok = Math.abs(eo) <= 45 && Math.abs(er) <= 45;
      const q_ = air ? r50 : r10;
      const add = q_(-eo), rt = q_(-er);
      if (rep.ok) rep.text = `${m.obsName}: Ziel! Wirkungsschießen (on target, fire for effect).`;
      else {
        const de = [], en = [];
        if (add !== 0) { de.push(`${add > 0 ? 'weiter' : 'kürzer'} ${Math.abs(add)}`); en.push(`${add > 0 ? 'add' : 'drop'} ${Math.abs(add)} m`); }
        if (rt !== 0) { de.push(`${rt > 0 ? 'rechts' : 'links'} ${Math.abs(rt)}`); en.push(`${rt > 0 ? 'right' : 'left'} ${Math.abs(rt)} m`); }
        rep.text = de.length ? `${m.obsName}: ${de.join(', ')} (${en.join(', ')}).` : `${m.obsName}: wiederholen (repeat).`;
      }
    }
    if (rep.over != null) rep.corr = { add: -rep.over, right: -rep.right };
    m.reports.push(rep);
    sim.reports.push(rep);
    if (sim.reports.length > 80) sim.reports.shift();
    sim.events.report?.(m, rep);
    if (rep.ok && m.state === 'ranging') m.onTarget = true;
  }
}

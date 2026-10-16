// Fall-of-shot reports as a period observer would send them: the forward observer by telephone in yards
// (add or drop, left or right), the aeroplane in the RFC clock code (a circle letter and an hour with 12 at
// true north from the target), the kite balloon like an observer but from further back. Map shoots and
// sound ranging give no reports. Rail spotters report on the railhead even after wide misses.
// Reports arrive a few seconds after the burst.
import { YARD, DEG } from '../sector.js';

const CIRCLES = [['Y', 10], ['Z', 25], ['A', 50], ['B', 100], ['C', 200], ['D', 300], ['E', 400], ['F', 500]];
const q25 = (m) => Math.round(m / YARD / 25) * 25;

export class Observers {
  constructor(sim) {
    this.sim = sim;
    this.queue = [];
  }

  reset() {
    this.queue.length = 0;
  }

  // the point an observer reads the burst against: the real target, not where the mission says it is
  refPoint(m) {
    const sim = this.sim;
    if (m.targetId) {
      const t = sim.targetById(m.targetId);
      if (t) {
        if (t.kind === 'battery') return { x: t.pos.x, z: t.pos.z };
        return { x: t.pos.x, z: t.pos.z };
      }
    }
    return { x: m.x, z: m.z };
  }

  onBurst(shell, pos) {
    const sim = this.sim;
    const u = sim.unitById(shell.unitId);
    if (!u) return;
    // rounds are matched to a ranging mission whose point is within 400 m of the aim; a round that
    // matches none but comes from a unit laid on its own mission (the uncorrected aim is the mission
    // point, so a wild correction took it off) is still answered: in a battle with "not observed" (the
    // crews' ranging is unchanged), on the range with a full report so a lesson cannot stall
    const observed = (m) => m && m.state === 'ranging' && m.observer !== 'map' && m.observer !== 'sound' && m.kind !== 'sos' && m.kind !== 'barrage';
    let best = null, bd = 400;
    for (const m of sim.missions) {
      if (!observed(m)) continue;
      const d = Math.hypot(shell.aim.x - m.x, shell.aim.z - m.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    let wild = false;
    if (!best) {
      const own = u.missionId != null ? sim.missionById(u.missionId) : null;
      const tg = u.order?.target;
      if (observed(own) && tg && Math.hypot(tg.x - own.x, tg.z - own.z) < 60) {
        best = own;
        wild = true;
      }
    }
    if (!best) return;
    const m = best, ref = this.refPoint(m);
    const dx = ref.x - u.pos.x, dz = ref.z - u.pos.z, r = Math.hypot(dx, dz) || 1;
    const fx = dx / r, fz = dz / r, rx = -fz, rz = fx;
    const bx = pos.x - ref.x, bz = pos.z - ref.z;
    const over = bx * fx + bz * fz, right = bx * rx + bz * rz;
    // the "not observed" answer to a wild round in a battle draws nothing from sim.rng, so a seeded game
    // plays out exactly as it did before that answer existed
    let delay = wild && !sim.scripted ? 6 : m.observer === 'air' ? 6 + sim.rng() * 5 : m.observer === 'balloon' ? 5 + sim.rng() * 3 : 3 + sim.rng() * 4;
    if (sim.scripted) delay = 2 + (delay - 3) * 0.4; // the range's observers are quick, so a lesson does not stall
    this.queue.push({ t: sim.time + delay, m, u, shell, over, right, ref, fx, fz, rx, rz, wild });
  }

  update() {
    if (!this.queue.length) return;
    const sim = this.sim, now = sim.time;
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.t > now) continue;
      this.queue.splice(i--, 1);
      if (q.m.state === 'done' || q.m.state === 'failed') continue;
      this.deliver(q);
    }
  }

  deliver(q) {
    const sim = this.sim, { m, u, shell } = q;
    const rep = {
      t: sim.time, missionId: m.id, unitId: u.id, shellId: shell.id, over: null, right: null, clock: null, text: '', ok: false,
      observed: true, corr: { add: 0, right: 0 }, n: (m.rounds = (m.rounds ?? 0) + 1), observer: m.observer,
    };
    const d = Math.hypot(q.over, q.right);
    if (q.wild && !sim.scripted) {
      // for the player only: the crews (and the simtest player) ignore it, as they did the silence before
      rep.observed = false;
      rep.wild = true;
      rep.text = `${m.obsName}: round not observed, well off the target.`;
    } else if (m.observer === 'air') {
      let ci = CIRCLES.findIndex((c) => d <= c[1] * YARD);
      if (ci < 0 && sim.scripted) ci = CIRCLES.length - 1; // never a lost round on the range
      if (ci < 0) {
        rep.observed = false;
        rep.text = `${m.obsName}: round lost, not observed.`;
      } else {
        const lo = ci === 0 ? 0 : CIRCLES[ci - 1][1], mid = ((lo + CIRCLES[ci][1]) / 2) * YARD * (ci === 0 ? 0.8 : 1);
        // direction of the burst from the target, true bearing, quantised to the hour
        const dir = Math.atan2(q.over * q.fx + q.right * q.rx, -(q.over * q.fz + q.right * q.rz));
        let hour = Math.round((((dir / DEG) % 360) + 360) % 360 / 30) % 12;
        if (hour === 0) hour = 12;
        const a = hour * 30 * DEG;
        const wx = Math.sin(a) * mid, wz = -Math.cos(a) * mid;
        rep.over = wx * q.fx + wz * q.fz;
        rep.right = wx * q.rx + wz * q.rz;
        rep.clock = CIRCLES[ci][0] + hour;
        rep.ok = ci <= 2;
        rep.text = `${m.obsName}: ${CIRCLES[ci][0]} ${hour}.`;
      }
    } else {
      // forward observer or kite balloon: yards estimated with an honest error
      const k = m.observer === 'balloon' ? 0.12 : 0.08;
      const kn = sim.scripted ? 0.5 : 1; // steadier estimates on the range
      if (d > 900 && !sim.scripted && m.observer !== 'railspot') {
        rep.observed = false;
        rep.text = `${m.obsName}: round not observed.`;
      } else {
        const eo = q.over + sim.gauss() * Math.max(8, Math.abs(q.over) * k) * kn;
        const er = q.right + sim.gauss() * Math.max(6, Math.abs(q.right) * k) * kn;
        rep.over = eo;
        rep.right = er;
        rep.ok = Math.abs(eo) <= 45 && Math.abs(er) <= 45;
        const add = q25(-eo), rt = q25(-er);
        if (rep.ok) {
          rep.text = `${m.obsName}: on target, fire for effect.`;
        } else {
          const parts = [];
          if (add !== 0) parts.push(`${add > 0 ? 'ADD' : 'DROP'} ${Math.abs(add)}`);
          if (rt !== 0) parts.push(`${rt > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(rt)}`);
          rep.text = `${m.obsName}: ${parts.join(', ') || 'repeat'}.`;
        }
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

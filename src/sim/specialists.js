// Missions for the heavy and the long guns, in the open battles. The theatre's sites marked with a `role` are theirs:
// 'deep' sites stand beyond the field guns' reach, so only the long guns get there (the 18-inch railway howitzer, the
// K 18, the Gustav); 'hard' sites are concrete that only heavy shells break (the mission's `minHard`, checked by
// crews.canServe: the 9.2-inch and up, the 21 cm Mörser, the Karl, the Gustav). The director opens one of each now and
// then, by day (with an aeroplane to observe: these are deliberate shoots, not map shoots) and only while a battery in
// the field can serve it, so a lineup without such a battery never sees them; a battery that can and has stood idle
// brings the next one forward. Their window is long: a heavy gun takes a minute or more a round, and the S.O.S. calls
// come first. They draw on their own random stream, so the rest of the day runs as it would without them.
import { mulberry32 } from '../noise.js';

export const MIN_HARD = 40; // SHELLS[kind].hard.D that breaks concrete in a few rounds
const ROLES = {
  deep: { title: (t) => `Deep target: ${t.name}`, hint: 'Beyond the field guns: a task for the long guns. Range on the aeroplane\'s calls, then fire for effect.' },
  hard: { title: (t) => `Heavy target: ${t.name}`, hint: 'Concrete: only heavy shells break it. Delay fuze, and walk the rounds onto it.' },
};
const POINTS = 90, DEADLINE = 1500, IDLE = 90;

export class Specialists {
  constructor(sim) {
    this.sim = sim;
    this.rng = mulberry32((sim.seed ^ 0x5eed5) >>> 0);
    this.sites = sim.targets.filter((t) => ROLES[t.site?.role]);
    // the first after the registration, then a gap after each one ends (sooner when an able battery is idle)
    this.next = Object.fromEntries(Object.keys(ROLES).map((r) => [r, 360 + this.rng() * 120]));
    this.ended = Object.fromEntries(Object.keys(ROLES).map((r) => [r, -999]));
    this.idle = new Map(); // unit id -> since when it has had no mission
  }

  probe(t, role) {
    return { kind: 'destroy', targetId: t.id, x: t.pos.x, z: t.pos.z, alt: 0, minHard: role === 'hard' ? MIN_HARD : 0 };
  }

  update() {
    const sim = this.sim, now = sim.time;
    if (!this.sites.length || sim.attract || sim.scripted || sim.state !== 'playing' || sim.phase < 2 || sim.night) return;
    for (const u of sim.units) {
      if (u.alive && u.missionId == null && !u.firing) { if (!this.idle.has(u.id)) this.idle.set(u.id, now); } else this.idle.delete(u.id);
    }
    for (const role of Object.keys(ROLES)) {
      const open = sim.missions.find((m) => m.role === role && m.state !== 'done' && m.state !== 'failed');
      if (open) continue;
      const last = sim.missions.filter((m) => m.role === role).reduce((a, m) => Math.max(a, m.tEnd ?? 0), this.ended[role]);
      if (last > this.ended[role]) {
        this.ended[role] = last;
        this.next[role] = last + 240 + this.rng() * 180;
      }
      // the sites a battery in the field can serve, and whether one that can has stood idle
      const able = new Set();
      let idle = false;
      const choices = this.sites.filter((t) => t.alive && t.site.role === role && sim.units.some((u) => {
        if (!u.alive || !sim.crews.canServe(u, this.probe(t, role))) return false;
        able.add(u.id);
        if (now - (this.idle.get(u.id) ?? now) > IDLE) idle = true;
        return true;
      }));
      if (!choices.length || (now < this.next[role] && !(idle && now - this.ended[role] > 120))) continue;
      this.open(choices[Math.floor(this.rng() * choices.length)], role);
    }
  }

  open(t, role) {
    const sim = this.sim, d = sim.director, R = ROLES[role];
    t.known = true;
    return d.addMission({ kind: 'destroy', title: R.title(t), targetId: t.id, x: t.pos.x, z: t.pos.z, observer: 'air',
      deadline: DEADLINE, priority: 6, hint: R.hint, role, points: POINTS, minHard: role === 'hard' ? MIN_HARD : 0 });
  }
}

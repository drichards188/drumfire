// The open battle's day fitted to the lineup in the field (a career battle: sim.loadout). The directors' fixed script
// (buildScript) was written for the whole Group; a small or lopsided lineup met missions it could not reach and more at
// once than it could serve. With a loadout the director routes the script through here:
//   reach    a site mission no battery in the field can serve (crews.canServe: range, arc, what the gun is for) goes to
//            another site of the same kind one can, else it is left out; the counter-battery calls
//            (director.watchBatteries) and the traffic (convoy, train) only come for what a battery can reach
//   cadence  the script's site missions wait while the open ones (not the SOS, the barrage or the heavy and long guns'
//            own, specialists.js) fill the lineup's capacity (about one a battery, more with its guns, three at least
//            so a lone battery still has a choice); a free hand takes the waiting one that best suits a battery in the
//            field, and one that has waited too long is dropped
//   work     a battery that stands idle by day or night, before Zero hour, is given a site that suits it (crews.score:
//            the heavies concrete and batteries, the light guns the lighter targets, the 60-pounder the balloon), so a
//            big lineup gets more to do than the script alone gives it
// It draws on its own random stream, as specialists.js does. Without a loadout (the tests' battle, attract mode, the
// tutorial range) the director never makes one, and the day is exactly as before.
import { mulberry32 } from '../noise.js';

const TRAFFIC = new Set(['crossroads', 'railyard', 'aconvoy', 'bconvoy']); // a mission only while the traffic is there
const WAIT = 600; // the longest a scripted mission waits for a free hand (s)
const IDLE = 80; // a battery idle this long is given work (s), and again this long after its last
const PRIORITY = { cb: 8, destroy: 5 };
const BATTERIES = new Set(['battery', 'abattery', 'amedium', 'sbattery', 'bgun15', 'bgun92', 'bgun6', 'bgun60', 'bgunrail', 'bfield']); // a counter-battery mission (1917, WW2, the 1918 ridge)

export class LineupDay {
  constructor(sim) {
    this.sim = sim;
    this.rng = mulberry32((sim.seed ^ 0x11e0b) >>> 0);
    this.queue = []; // [{ id, over, until }]: scripted missions waiting for a free hand
    this.idle = new Map(); // unit id -> since when it has had no mission
    this.scripting = false; // a script entry is running (gate below)
    this.passing = false; // a mission released from the queue or given as work: already routed
    this.stats = { moved: 0, dropped: 0, waited: 0, work: 0 }; // for the tests
  }

  // the script's entries, each run with `scripting` set
  wrap(script) {
    return script.map((e) => ({ t: e.t, fn: () => { this.scripting = true; try { e.fn(); } finally { this.scripting = false; } } }));
  }

  // the mission a site would give (as the directors' siteMission makes it), for crews.canServe and crews.score
  probe(t) {
    const kind = BATTERIES.has(t.kind) ? 'cb' : 'destroy';
    return { kind, targetId: t.id, x: t.pos.x, z: t.pos.z, alt: t.kind === 'balloon' ? t.pos.y : 0, minHard: 0, priority: PRIORITY[kind] };
  }
  serves(u, t) {
    return u.alive && this.sim.crews.canServe(u, this.probe(t));
  }
  reachable(t) {
    return this.sim.units.some((u) => this.serves(u, t));
  }

  // the missions in hand that count against the capacity
  inHand() {
    return this.sim.missions.filter((m) => (m.state === 'open' || m.state === 'ranging' || m.state === 'ffe') && m.kind !== 'sos' && m.kind !== 'barrage' && !m.role).length;
  }
  // about one mission a battery, a little more for one with its guns, and one over; three at least
  capacity() {
    let c = 1;
    for (const u of this.sim.units) if (u.alive) c += u.pieces.filter((p) => p.state !== 'dead').length >= 2 ? 1 : 0.6;
    return Math.max(3, Math.round(c));
  }
  // how well the lineup suits a site: the best crews.score of a battery that can serve it (-Infinity: none can)
  suit(t) {
    let s = -Infinity;
    for (const u of this.sim.units) if (this.serves(u, t)) s = Math.max(s, this.sim.crews.score(u, this.probe(t)));
    return s;
  }

  busy(t) {
    return this.sim.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed') || this.queue.some((q) => q.id === t.id);
  }
  // the sites the day may send a battery to instead: alive, standing, not the heavy and long guns' own, not traffic
  pool() {
    return this.sim.targets.filter((t) => t.alive && !t.offmap && t.present !== false && !t.site?.role && !TRAFFIC.has(t.kind) && !this.busy(t));
  }
  // another site of the same kind for one no battery can serve, or null. (Not of another kind: that took the script's
  // later sites early, when the guns were busy, and the work below already finds an idle battery something to do)
  substitute(t) {
    const same = this.pool().filter((q) => q.id !== t.id && q.kind === t.kind && this.reachable(q));
    return same.length ? same[Math.floor(this.rng() * same.length)] : null;
  }

  // the directors' siteMission asks first: { id, over } to go ahead with (perhaps another site), or null (left out,
  // or waiting in the queue)
  gate(id, over) {
    const sim = this.sim, t = sim.targetById(id);
    if (this.passing || !t) return { id, over };
    if (TRAFFIC.has(t.kind) || !this.scripting) return this.reachable(t) ? { id, over } : null;
    let to = t, o = over;
    // (or one already given a mission: sent there by an earlier swap, or as work)
    if (!this.reachable(t) || this.busy(t)) {
      to = this.substitute(t);
      if (!to) { this.stats.dropped++; return null; }
      o = { priority: over.priority }; // its own title, deadline and observer
      this.stats.moved++;
    }
    if (this.inHand() >= this.capacity()) {
      this.queue.push({ id: to.id, over: o, until: sim.time + WAIT });
      this.stats.waited++;
      return null;
    }
    return { id: to.id, over: o };
  }

  // per step, from the director's missionsUpdate: the queue, then work for an idle battery
  update() {
    const sim = this.sim, d = sim.director, now = sim.time;
    if (sim.state !== 'playing') return;
    // the queue: the stale and the gone dropped, then, while there is a free hand, the one that best suits the lineup
    this.queue = this.queue.filter((q) => {
      const ok = now <= q.until && sim.targetById(q.id)?.alive;
      if (!ok) this.stats.dropped++;
      return ok;
    });
    while (this.queue.length && this.inHand() < this.capacity()) {
      let k = 0, ks = -Infinity;
      this.queue.forEach((q, i) => { const s = this.suit(sim.targetById(q.id)); if (s > ks) { ks = s; k = i; } });
      const [q] = this.queue.splice(k, 1), t = sim.targetById(q.id);
      const to = this.reachable(t) ? t : this.substitute(t);
      if (!to) { this.stats.dropped++; continue; }
      this.release(() => d.siteMission(to.id, to === t ? q.over : { priority: q.over.priority }));
    }
    for (const u of sim.units) {
      if (u.alive && u.missionId == null && !u.firing) { if (!this.idle.has(u.id)) this.idle.set(u.id, now); } else this.idle.delete(u.id);
    }
    // work: by day or night, from the bombardment to Zero hour, while there is a free hand and nothing waits
    if (sim.phase < 2 || sim.barrage || this.queue.length || this.inHand() >= this.capacity()) return;
    for (const u of sim.units) {
      const since = this.idle.get(u.id);
      if (since == null || now - since < IDLE) continue;
      const choices = this.pool().filter((t) => this.serves(u, t));
      if (!choices.length) continue;
      let best = null, bs = -Infinity;
      for (const t of choices) {
        const s = sim.crews.score(u, this.probe(t)) + this.rng() * 6;
        if (s > bs) { bs = s; best = t; }
      }
      this.idle.set(u.id, now); // and again IDLE from now if it does not take it
      this.stats.work++;
      this.release(() => d.siteMission(best.id, {}));
      if (this.inHand() >= this.capacity()) return;
    }
  }

  release(fn) {
    this.passing = true;
    try { fn(); } finally { this.passing = false; }
  }
}

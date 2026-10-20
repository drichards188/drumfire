// Watches sim.shells from frame to frame: shells that vanish have burst where they were last seen. That
// is the fall of shot (numbered per unit, restarted when the unit is laid on a new target) and, for enemy
// shells, the bursts near our guns. The Panel reads only the sim, so nothing needs wiring in main.
const DIST = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Tracker {
  constructor() {
    this.seen = new Map();     // shell id -> { own, unitId, n, x, z, y, aim, from, t }
    this.falls = new Map();    // unit id -> [{ n, x, z, t, shellId }]
    this.count = new Map();    // unit id -> rounds numbered so far
    this.aimed = new Map();    // unit id -> last order.target seen
    this.enemy = [];           // [{ x, z, t, near }] bursts of enemy shells close to our guns (last 40 s)
    this.numbers = new Map();  // shell id -> n (reports quote it)
    this.fired = new Map();    // shell id -> { piece, adj, target }: the gun and the lay it was fired with
    this.bursts = [];          // every burst this frame, [{ own, unitId, x, z, y, n }]
  }

  reset() { this.seen.clear(); this.falls.clear(); this.count.clear(); this.aimed.clear(); this.enemy.length = 0; this.numbers.clear(); this.fired.clear(); }

  update(sim) {
    const now = sim.time || 0;
    this.bursts.length = 0;
    // a new target for a unit clears its fall of shot; the numbering starts again at 1
    for (const u of sim.units || []) {
      const tg = u.order && u.order.target;
      const prev = this.aimed.get(u.id);
      if (tg && (!prev || DIST(tg, prev) > 150)) { this.falls.set(u.id, []); this.count.set(u.id, 0); }
      this.aimed.set(u.id, tg ? { x: tg.x, z: tg.z } : null);
    }
    const live = new Set();
    for (const s of sim.shells || []) {
      // the Paris Gun's shell (WW1 German mode) leaves the map in the air: where it vanishes is no fall of shot
      if (s.alive === false || s.paris) continue;
      live.add(s.id);
      let r = this.seen.get(s.id);
      if (!r) {
        const n = s.own ? (this.count.get(s.unitId) || 0) + 1 : 0;
        if (s.own) {
          this.count.set(s.unitId, n); this.numbers.set(s.id, n);
          // the corrections already on the order when the round left, so a report can be read against the lay of now
          const o = (sim.units || []).find((u) => u.id === s.unitId)?.order;
          this.fired.set(s.id, { piece: s.piece, adj: o?.adj ? { add: o.adj.add, right: o.adj.right } : null, target: o?.target ? { x: o.target.x, z: o.target.z } : null });
        }
        r = { own: s.own, unitId: s.unitId, n, x: 0, z: 0, y: 0, aim: s.aim, from: { x: s.pos.x, z: s.pos.z }, t: now };
        this.seen.set(s.id, r);
      }
      r.x = s.pos.x; r.z = s.pos.z; r.y = s.pos.y; r.aim = s.aim;
    }
    for (const [id, r] of this.seen) {
      if (live.has(id)) continue;
      this.seen.delete(id);
      this.bursts.push({ own: r.own, unitId: r.unitId, x: r.x, z: r.z, y: r.y, n: r.n });
      if (r.own) {
        let a = this.falls.get(r.unitId);
        if (!a) this.falls.set(r.unitId, (a = []));
        a.push({ n: r.n, x: r.x, z: r.z, t: now, shellId: id });
        if (a.length > 24) a.shift();
      } else {
        let near = false;
        for (const u of sim.units || []) for (const p of u.pieces || []) if (Math.hypot(p.pos.x - r.x, p.pos.z - r.z) < 450) near = true;
        this.enemy.push({ x: r.x, z: r.z, t: now, near });
      }
    }
    while (this.enemy.length && now - this.enemy[0].t > 40) this.enemy.shift();
    for (const m of [this.numbers, this.fired]) if (m.size > 400) for (const k of m.keys()) { m.delete(k); if (m.size < 200) break; }
  }
}

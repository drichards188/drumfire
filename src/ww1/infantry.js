// The WW1 German mode's infantry: the WW2 mode's turned-round battle (src/ww2/infantry.js). The British attack comes
// east out of their front line into our Sperrfeuer; at X-Zeit our assault groups go west behind the Feuerwalze. The
// groups are the British module's shapes, so the instanced infantry renderer draws them with the WW1 soldiers it
// already has ('british' groups are the British, 'german' ours).
// One addition for 1918: the British front line's garrison and its Lewis guns fire on our assault unless the
// Feuerwalze keeps their heads down. Each lane counts the shells that burst on its barrage line; a lane with
// fewer than COVER of them in the last 20 s costs the groups in it men (a thin or late Feuerwalze is paid for).
import { InfantryWW2 } from '../ww2/infantry.js';

export const COVER = 6; // bursts on the line in 20 s for full cover
const MG = 0.013; // men a second a group loses with no cover at all

export class InfantryWW1 extends InfantryWW2 {
  onBurst(shell, pos, air) {
    const sim = this.sim, b = sim.barrage;
    if (b?.active && shell.own) for (const l of b.lanes) {
      if (Math.abs(pos.z - l.z) < 300 && Math.abs(pos.x - b.xAt(l.z)) < 160) (l.hits ??= []).push(sim.time);
    }
    return super.onBurst(shell, pos, air);
  }

  updateOwn(g, dt) {
    super.updateOwn(g, dt);
    const sim = this.sim, b = sim.barrage;
    if (!b?.active || g.state !== 'advancing' || g.n <= 0 || !g.lane) return;
    const l = b.lanes.find((q) => q.sector === g.lane.sector) ?? g.lane;
    const hits = l.hits ?? [];
    while (hits.length && hits[0] < sim.time - 20) hits.shift();
    const cover = Math.min(1, hits.length / COVER);
    l.cover = cover;
    g.mgAcc = (g.mgAcc ?? 0) + MG * (1 - cover) * dt;
    while (g.mgAcc >= 1) {
      g.mgAcc -= 1;
      const alive = g.men.filter((m) => m.alive);
      if (alive.length) { this.kill(g, alive[Math.floor(sim.rng() * alive.length)]); sim.stats.britishLost++; sim.stats.lossBy.mebu++; }
    }
  }
}

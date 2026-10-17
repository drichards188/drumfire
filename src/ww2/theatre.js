// The WW2 theatre: what `new Sim({ theatre })` and the page need for one operation (src/ww2/ops.js). Node-safe.
//   const th = ww2Theatre('flanders');   // before the terrain is first sampled (it adds the positions' pads)
//   new Sim({ heightAt, ..., theatre: th });
// th: { id, op, units, sites, modules, bounds, ref(x, z), sosCommand(sim, sector), metric: true, ... }
import { PAD_EXTRA, SECTORS, LINES, lineX } from '../sector.js';
import { OPS, OP_IDS, ww2Pads } from './ops.js';
import { TargetsWW2 } from './targets.js';
import { ObserversWW2 } from './observers.js';
import { EnemyWW2 } from './enemy.js';
import { InfantryWW2 } from './infantry.js';
import { CrewsWW2 } from './crews.js';
import { DirectorWW2 } from './director.js';
import { SpecialWW2 } from './special.js';

const SUPER = new Set(['gustav', 'karl', 'bertha', 'v1', 'v2']);
let padded = false;

// A German map reference: Gauss-Krüger style Rechtswert and Hochwert in km to 10 m, on a grid whose origin sits so
// the numbers look like the 1:25,000 sheets' ("r 54.32  h 46.87").
export function ww2Ref(x, z) {
  const r = 50000 + x, h = 52000 - z;
  const f = (v) => ((((v / 1000) % 100) + 100) % 100).toFixed(2).padStart(5, '0');
  return `r ${f(r)}  h ${f(h)}`;
}

export function ww2Theatre(opId = 'flanders') {
  const op = OPS[opId] ?? OPS.flanders;
  if (!padded) {
    PAD_EXTRA.push(...ww2Pads());
    padded = true;
  }
  return {
    id: 'ww2', op, opId: op.id, metric: true, side: 'german',
    units: op.units, sites: op.sites, sectors: op.kind === 'battle' ? SECTORS : [],
    bounds: 90000,
    modules: { Targets: TargetsWW2, Observers: ObserversWW2, Enemy: EnemyWW2, Infantry: InfantryWW2, Crews: CrewsWW2, Director: DirectorWW2, Special: SpecialWW2 },
    ref: ww2Ref,
    // Sperrfeuer on a sector: every unit that can reach the line lays on it and fires (never the super-heavies)
    sosCommand(sim, sector) {
      const a = sim.assaults.find((q) => q.sector === sector && q.state === 'called');
      const m = a?.missionId ? sim.missionById(a.missionId) : null;
      let n = 0;
      const live = sim.units.filter((u) => u.alive && !SUPER.has(u.kind));
      for (const u of live) {
        let ok;
        if (m) ok = sim.director.assign(u, m);
        else {
          const sec = SECTORS.find((s) => s.id === sector);
          if (!sec) return false;
          const z = (sec.from + sec.to) / 2, x = lineX(LINES.germanFront, z) * 0.7 + lineX(LINES.britishFront, z) * 0.3;
          sim.guns.setTarget(u, x, z, { biasScale: 0.12, sheaf: 55, shift: (live.indexOf(u) - (live.length - 1) / 2) * 70 });
          sim.guns.setRounds(u, 99);
          ok = u.order.ok;
        }
        if (ok && u.order.ok) {
          if (u.mode === 'hold') u.mode = 'manual';
          sim.guns.fire(u);
          n++;
        }
      }
      return n > 0;
    },
  };
}

export { OPS, OP_IDS };

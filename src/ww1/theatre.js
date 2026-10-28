// The WW1 German theatre: what `new Sim({ theatre })` and the page need for one operation (src/ww1/ops.js: the open
// battle 'ridge', the Paris Gun's mission 'paris'). Node-safe. The shape is ww2Theatre's:
//   const th = ww1Theatre('ridge');   // before the terrain is first sampled (it adds every op's positions' pads)
//   const th = ww1Theatre('ridge', { kinds });   // the German career's battle: its lineup's kinds (ops.js RIDGE_WW2)
//   new Sim({ heightAt, ..., theatre: th });
// th: { id: 'ww1', op, opId, units, sites, sectors, modules, bounds, ref(x, z), sosCommand(sim, sector), metric: true,
//       side: 'german', era: 'ww1' }
import { PAD_EXTRA, SECTORS, LINES, lineX } from '../sector.js';
import { OPS, OP_IDS, ww1Pads, SUPER_WW1, RIDGE_WW2, RIDGE_POSITIONS, RIDGE_ROLE_SITES, ridgeWW2Pads } from './ops.js';
import { ww1Ref } from './grid.js';
import { TargetsWW1 } from './targets.js';
import { ObserversWW1 } from './observers.js';
import { EnemyWW1 } from './enemy.js';
import { InfantryWW1 } from './infantry.js';
import { CrewsWW1 } from './crews.js';
import { DirectorWW1 } from './director.js';
import { SpecialWW1 } from './special.js';

let padded = false;
const paddedWW2 = new Set(); // the career's WW2 batteries whose ground is levelled (once each)

// `kinds` (the German career's open battle, a lineup's kinds): the ridge with the career's WW2 batteries that the
// lineup names (ops.js RIDGE_WW2), the Karl's stops and the heavy and long guns' role sites. Without it (the sandbox,
// the tests) the operation is as it stands.
export function ww1Theatre(opId = 'ridge', { kinds = null } = {}) {
  let op = OPS[opId] ?? OPS.ridge;
  if (!padded) {
    PAD_EXTRA.push(...ww1Pads());
    padded = true;
  }
  if (kinds && op.kind === 'battle') {
    const want = new Set(kinds), extra = RIDGE_WW2.filter((u) => want.has(u.kind));
    const fresh = extra.filter((u) => !paddedWW2.has(u.kind));
    PAD_EXTRA.push(...ridgeWW2Pads(fresh));
    for (const u of fresh) paddedWW2.add(u.kind);
    op = { ...op, units: [...op.units, ...extra], sites: [...op.sites, ...RIDGE_ROLE_SITES], positions: RIDGE_POSITIONS, career: true };
  }
  return {
    id: 'ww1', op, opId: op.id, metric: true, side: 'german', era: 'ww1',
    units: op.units, sites: op.sites, sectors: op.kind === 'battle' ? SECTORS : [],
    // the Paris Gun's shell climbs out of the map; its flight is the controller's (special.js), the kill box only has
    // to hold the British shells and the aircraft
    bounds: 90000,
    modules: { Targets: TargetsWW1, Observers: ObserversWW1, Enemy: EnemyWW1, Infantry: InfantryWW1, Crews: CrewsWW1, Director: DirectorWW1, Special: SpecialWW1 },
    ref: ww1Ref,
    // Sperrfeuer on a sector: every unit that can reach the line lays on it and fires (never the super-heavies)
    sosCommand(sim, sector) {
      const a = sim.assaults.find((q) => q.sector === sector && q.state === 'called');
      const m = a?.missionId ? sim.missionById(a.missionId) : null;
      let n = 0;
      const live = sim.units.filter((u) => u.alive && !SUPER_WW1.has(u.kind));
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

export { OPS, OP_IDS, SUPER_WW1 };

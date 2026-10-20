import { buildBattery } from './t/battery.js';
export { buildGermanGun, GERMAN_KINDS } from './t/german.js';
export { partLayout } from './t/layout.js';
import { buildMebu } from './t/mebu.js';
import { buildDump } from './t/dump.js';
import { buildBalloon } from './t/balloon.js';
import { buildHQ } from './t/hq.js';
import { buildCrossroads, buildTraffic } from './t/crossroads.js';
export { buildTraffic };
import { buildRailyard, buildTrain } from './t/railyard.js';
export { buildTrain };
const BUILD = { battery: buildBattery, mebu: buildMebu, dump: buildDump, balloon: buildBalloon, hq: buildHQ, crossroads: buildCrossroads, railyard: buildRailyard };
// The WW2 mode's targets (DESIGN.md "WW2 mode"): every module in t/ww2/ that exports a BUILD map adds its kinds.
for (const mod of Object.values(import.meta.glob('./t/ww2/*.js', { eager: true }))) if (mod.BUILD) Object.assign(BUILD, mod.BUILD);
// and the WW1 German mode's (DESIGN.md "WW1 German mode"): the British side in t/ww1/
// (not the page scripts of the local viewers, which touch the DOM when loaded)
for (const mod of Object.values(import.meta.glob(['./t/ww1/*.js', '!./t/ww1/*preview*.js'], { eager: true }))) if (mod.BUILD) Object.assign(BUILD, mod.BUILD);
export const TARGET_KINDS = ['battery', 'mebu', 'dump', 'balloon', 'hq', 'crossroads', 'railyard'];
export const TARGET_KINDS_WW2 = ['abattery', 'amedium', 'tanks', 'adump', 'aconvoy', 'aop', 'turret', 'fort', 'magazine', 'sbattery', 'citadel', 'gate', 'eastfort'];
export const TARGET_KINDS_WW1 = ['bgun15', 'bgun92', 'bgun6', 'bgun60', 'bgunrail', 'bfield', 'btanks', 'bballoon', 'bdump', 'bconvoy'];
export function buildTarget(kind, opts = {}) {
  const f = BUILD[kind];
  if (!f) throw new Error('unknown target kind ' + kind);
  return f(opts);
}

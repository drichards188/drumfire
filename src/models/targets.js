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
export const TARGET_KINDS = ['battery', 'mebu', 'dump', 'balloon', 'hq', 'crossroads', 'railyard'];
export function buildTarget(kind, opts = {}) {
  const f = BUILD[kind];
  if (!f) throw new Error('unknown target kind ' + kind);
  return f(opts);
}

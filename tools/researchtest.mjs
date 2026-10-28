// Headless open battles with researched lineups: node tools/researchtest.mjs [seeds] [--era 1917|de|all]
//   [--lineup start|early|mid|full|max|all] [--difficulty Easy|Normal|Hard|all] [--jobs N]
// Every crew on auto, as tools/simtest.mjs, but the battle is fielded the way a career fields it (src/research.js:
// the lineup's guns and upgrades, the opposition scaled to it) and prints per lineup the games won, the minutes, the
// opposition and what the battle paid: the RP and each battery's points. The lineups: start (the tier I battery with
// one gun), early (tier I with all its guns, both tier II with one), mid (tiers I and II with all their guns and a
// level of each part), full (every battery, every gun, no parts: the old open battle), max (dev mode: all at the top).
// The German tree ('de', research.js TREES.de) fights the career's battle: the 1918 ridge with the lineup's WW2
// batteries beside the 1918 ones (src/ww1/theatre.js { kinds }); each era's games run in workers of their own, so the
// ridge's pads never reach the 1917 ground.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { TREES, PARTS, maxGuns, maxedLevels, loadoutOf, opposition, battleReward, nextCost } from '../src/research.js';
import { sandboxTheatre } from '../src/campaign.js';
import { ww1Theatre } from '../src/ww1/theatre.js';
import { RIDGE_WW2 } from '../src/ww1/ops.js';

const LINEUPS = {
  start: (tree) => ({ [tree[0].kind]: { guns: 1 } }),
  early: (tree) => Object.fromEntries(tree.filter((n) => n.tier <= 2).map((n) => [n.kind, { guns: n.tier === 1 ? maxGuns(n.kind) : 1 }])),
  mid: (tree) => Object.fromEntries(tree.filter((n) => n.tier <= 2).map((n) => [n.kind, { guns: maxGuns(n.kind), ...Object.fromEntries(PARTS.map((p) => [p.id, 1])) }])),
  full: (tree) => Object.fromEntries(tree.map((n) => [n.kind, { guns: maxGuns(n.kind) }])),
  max: (tree) => Object.fromEntries(tree.map((n) => [n.kind, maxedLevels(n.kind)])),
};
// one part at its top on the full lineup (part:<id>), to see what each does
for (const p of PARTS) LINEUPS[`part:${p.id}`] = (tree) => Object.fromEntries(tree.map((n) => [n.kind, { guns: maxGuns(n.kind), [p.id]: 3 }]));

let heightAt, groundKindAt, flanders;
// the era's pads go into the ground before the terrain is first sampled: the German tree's every WW2 battery on the
// ridge (a lineup fields some of them); the 1917 tree's as before (the WW2 battle's, which it does not use)
async function stage(era) {
  if (era === 'de') ww1Theatre('ridge', { kinds: RIDGE_WW2.map((u) => u.kind) });
  else flanders ??= sandboxTheatre('flanders');
  ({ heightAt, groundKindAt } = await import('../src/terrainHeight.js'));
}

function run({ seed, era, lineup, difficulty }) {
  const levels = LINEUPS[lineup](TREES[era]);
  const th = era === 'de' ? ww1Theatre('ridge', { kinds: Object.keys(levels) }) : era === 'ww2' ? flanders : null;
  const sim = new Sim({ heightAt, groundAt: th ? groundKindAt : null, seed, theatre: th });
  const opp = opposition(era, levels);
  sim.newGame({ difficulty, seed, loadout: loadoutOf(levels), opposition: opp });
  for (const u of sim.units) u.mode = 'auto';
  if (process.env.NODAY) sim.director.day = null; // NODAY=1: the fixed day, as before the lineup's (sim/lineup.js), to compare
  const roles = { deep: [0, 0], hard: [0, 0] }; // the heavy and long guns' missions (sim/specialists.js): opened, done
  sim.events.mission = (m, c) => { if (m.role && (c === 'new' || c === 'done')) roles[m.role][c === 'new' ? 0 : 1]++; };
  let opened = 0, done = 0, failed = 0; // the site missions (not the SOS, the barrage or the roles')
  const prev = sim.events.mission;
  sim.events.mission = (m, c) => { prev(m, c); if (m.kind !== 'sos' && m.kind !== 'barrage' && !m.role) { if (c === 'new') opened++; else if (c === 'done') done++; else if (c === 'failed') failed++; } };
  while (sim.state === 'playing' && sim.time < 4000) sim.update(0.05);
  const r = battleReward(sim, { won: sim.state === 'victory' });
  return { seed, era, lineup, difficulty, won: sim.state === 'victory', min: sim.time / 60, opp, ...r,
    rounds: Object.fromEntries(sim.units.map((u) => [u.kind, u.stats.rounds])),
    roles, sites: { opened, done, failed }, day: sim.director.day?.stats ?? null, sectors: sim.stats.sectorsLost, sos: sim.stats.sos.filter((q) => q.held).length + '/' + sim.stats.sos.length,
    zero: sim.zero ? `${sim.zero.survivors ?? '?'}/${sim.zero.n0} ${JSON.stringify(Object.fromEntries(Object.entries(sim.stats.lossBy).map(([k, v]) => [k, Math.round(v)])))}` : '-' };
}

if (!isMainThread) {
  await stage(workerData?.era);
  parentPort.on('message', (job) => parentPort.postMessage(job ? run(job) : null));
} else {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] ?? '')).map(Number);
  if (!seeds.length) seeds.push(1, 2, 3);
  const all = (v, list) => (v === 'all' ? list : v.split(','));
  const eras = all(opt('--era', 'all'), Object.keys(TREES));
  const lineups = all(opt('--lineup', 'all'), Object.keys(LINEUPS));
  const diffs = all(opt('--difficulty', 'Normal'), ['Easy', 'Normal', 'Hard']);
  const jobs = [];
  for (const era of eras) for (const lineup of lineups) for (const difficulty of diffs) for (const seed of seeds) jobs.push({ seed, era, lineup, difficulty });
  const results = [];
  // one pool of workers for each era (their ground differs: stage)
  for (const era of eras) {
    const mine = jobs.filter((j) => j.era === era);
    const n = Math.max(1, Math.min(mine.length, +opt('--jobs', Math.max(1, os.cpus().length - 1))));
    await new Promise((done) => {
      let next = 0, live = n;
      for (let w = 0; w < n; w++) {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { era } });
        worker.on('message', (r) => {
          if (r) results.push(r);
          if (next < mine.length) worker.postMessage(mine[next++]);
          else { worker.terminate(); if (--live === 0) done(); }
        });
        worker.on('error', (e) => { console.error(e); process.exitCode = 1; });
        worker.postMessage(mine[next++] ?? null);
      }
    });
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  for (const era of eras) for (const lineup of lineups) for (const difficulty of diffs) {
    const rs = results.filter((r) => r.era === era && r.lineup === lineup && r.difficulty === difficulty);
    if (!rs.length) continue;
    const kinds = Object.keys(rs[0].batteries);
    console.log(`${era} ${lineup} ${difficulty}: won ${rs.filter((r) => r.won).length}/${rs.length}, ${mean(rs.map((r) => r.min)).toFixed(1)} min, opposition cb ${rs[0].opp.cb.toFixed(2)} assault ${rs[0].opp.assault.toFixed(2)}, ` +
      `RP ${Math.round(mean(rs.map((r) => r.rp)))} (fought ${Math.round(mean(rs.map((r) => r.fought)))}, time ${Math.round(mean(rs.map((r) => r.time)))}, win ${Math.round(mean(rs.map((r) => r.win)))})`);
    const day = rs[0].day ? ` (the lineup's day: ${['moved', 'waited', 'dropped', 'work'].map((k) => `${k} ${mean(rs.map((r) => r.day[k])).toFixed(1)}`).join(', ')})` : '';
    console.log(`   site missions per game: opened ${mean(rs.map((r) => r.sites.opened)).toFixed(1)}, done ${mean(rs.map((r) => r.sites.done)).toFixed(1)}, failed ${mean(rs.map((r) => r.sites.failed)).toFixed(1)}${day}`);
    console.log('   heavy and long guns\' missions done/opened per game: ' + ['deep', 'hard'].map((k) => `${k} ${mean(rs.map((r) => r.roles[k][1])).toFixed(1)}/${mean(rs.map((r) => r.roles[k][0])).toFixed(1)}`).join(', '));
    if (process.env.GAMES) for (const r of rs) console.log(`   seed ${r.seed}: ${r.won ? 'won' : 'lost'} ${r.min.toFixed(1)} min, sectors lost ${r.sectors}, SOS held ${r.sos}, zero ${r.zero}`);
    console.log('   battery points: ' + kinds.map((k) => `${k} ${Math.round(mean(rs.map((r) => r.batteries[k])))} (${Math.round(mean(rs.map((r) => r.rounds[k])))} rds)`).join(', '));
  }
  // what the tree and the upgrades cost, for comparison
  for (const era of eras) console.log(`${era} research: ` + TREES[era].filter((n) => n.cost).map((n) => `${n.kind} ${n.cost}`).join(', ') +
    ' | a battery maxed: ' + TREES[era].map((n) => {
      let c = 0;
      for (let g = 1; g < maxGuns(n.kind); g++) c += nextCost(n.kind, 'guns', g);
      for (const p of PARTS) for (let l = 0; l < 3; l++) c += nextCost(n.kind, p.id, l);
      return `${n.kind} ${c}`;
    }).join(', '));
}

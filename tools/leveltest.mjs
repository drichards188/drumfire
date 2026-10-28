// The threat levels (src/threat.js), headless: node tools/leveltest.mjs [seeds] [--levels 1-10|1,3,5] [--lineup ref|below]
//   [--mods mist,air|roll] [--jobs N] [--games]
// Each level's open battle on the 1918 ridge with every crew on auto and the level's reference lineup (capability.js
// REFERENCE, what its `fits` describes); `--lineup below` fields the level below's reference instead (a lineup one level
// over its recommended level), `--mods roll` the modifiers rolled for each seed (threat.js rollModifiers). Prints per
// level the games won, the minutes, the site missions done, the Sperrfeuer held, X-Zeit's men in and lost to our own
// short rounds, and the lineup's recommended level; `--games` each game.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { loadoutOf } from '../src/research.js';
import { ww1Theatre } from '../src/ww1/theatre.js';
import { RIDGE_WW2 } from '../src/ww1/ops.js';
import { THREAT, rollModifiers, parseModifiers } from '../src/threat.js';
import { REFERENCE, recommendedLevel, capabilities } from '../src/capability.js';

let heightAt, groundKindAt;
async function stage() {
  ww1Theatre('ridge', { kinds: RIDGE_WW2.map((u) => u.kind) }); // every career battery's pads, before the ground is sampled
  ({ heightAt, groundKindAt } = await import('../src/terrainHeight.js'));
}

function run({ seed, level, lineup, mods }) {
  const lv = REFERENCE[lineup === 'below' ? Math.max(1, level - 1) : level];
  const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: ww1Theatre('ridge', { kinds: Object.keys(lv) }) });
  const modifiers = mods === 'roll' ? rollModifiers(level, seed) : parseModifiers(mods);
  sim.newGame({ seed, loadout: loadoutOf(lv), level, modifiers });
  for (const u of sim.units) u.mode = 'auto';
  while (sim.state === 'playing' && sim.time < 4000) sim.update(0.05);
  const st = sim.stats.missions;
  const done = ['destroy', 'cb', 'harass'].reduce((a, k) => a + (st[k]?.done ?? 0), 0);
  const offered = ['destroy', 'cb', 'harass'].reduce((a, k) => a + (st[k]?.new ?? 0), 0);
  return {
    seed, level, won: sim.state === 'victory', min: sim.time / 60, done, offered, modifiers,
    sos: [sim.stats.sos.filter((q) => q.held).length, sim.stats.sos.length], sectors: sim.stats.sectorsLost,
    zero: sim.zero ? [sim.zero.survivors ?? 0, sim.zero.n0] : null, short: Math.round(sim.stats.lossBy.short),
    by: Object.fromEntries(Object.entries(sim.stats.lossBy).map(([k, v]) => [k, Math.round(v)])),
    lost: sim.stats.piecesLost, handed: sim.director.handedOff?.size ?? 0, why: sim.over?.sub ?? '',
  };
}

if (!isMainThread) {
  await stage();
  parentPort.on('message', (job) => parentPort.postMessage(job ? run(job) : null));
} else {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] ?? '')).map(Number);
  if (!seeds.length) for (let s = 1; s <= 12; s++) seeds.push(s);
  const lvArg = opt('--levels', '1-10');
  const levels = lvArg.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(lvArg.split('-').map(Number)) : lvArg.split(',').map(Number);
  const lineup = opt('--lineup', 'ref'), mods = opt('--mods', ''), games = args.includes('--games');
  const jobs = [];
  for (const level of levels) for (const seed of seeds) jobs.push({ seed, level, lineup, mods });
  const n = Math.max(1, Math.min(jobs.length, +opt('--jobs', Math.max(1, os.cpus().length - 2))));
  const results = [];
  await new Promise((done) => {
    let next = 0, live = n;
    for (let w = 0; w < n; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      worker.on('message', (r) => {
        if (r) results.push(r);
        if (next < jobs.length) worker.postMessage(jobs[next++]);
        else { worker.terminate(); if (--live === 0) done(); }
      });
      worker.on('error', (e) => { console.error(e); process.exitCode = 1; });
      worker.postMessage(jobs[next++] ?? null);
    }
  });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log(`lineup ${lineup}${mods ? `, modifiers ${mods}` : ''}, ${seeds.length} seeds`);
  for (const level of levels) {
    const rs = results.filter((r) => r.level === level).sort((a, b) => a.seed - b.seed);
    const L = THREAT[level - 1], ref = REFERENCE[lineup === 'below' ? Math.max(1, level - 1) : level];
    const zs = rs.filter((r) => r.zero);
    const sos = rs.reduce((a, r) => [a[0] + r.sos[0], a[1] + r.sos[1]], [0, 0]);
    console.log(`L${String(level).padEnd(2)} ${L.name.padEnd(16)} won ${String(rs.filter((r) => r.won).length).padStart(2)}/${rs.length} (${Math.round((100 * rs.filter((r) => r.won).length) / rs.length)}%), ${mean(rs.map((r) => r.min)).toFixed(1)} min, missions ${mean(rs.map((r) => r.done)).toFixed(1)}/${mean(rs.map((r) => r.offered)).toFixed(1)}, SOS held ${sos[0]}/${sos[1]}, sectors lost ${mean(rs.map((r) => r.sectors)).toFixed(2)}, guns lost ${mean(rs.map((r) => r.lost)).toFixed(1)}` +
      (zs.length ? `, X-Zeit ${mean(zs.map((r) => r.zero[0])).toFixed(0)}/${zs[0].zero[1]} in (lost to the garrison ${mean(zs.map((r) => r.by.mebu)).toFixed(0)}, in the open ${mean(zs.map((r) => r.by.open)).toFixed(0)}, short ${mean(zs.map((r) => r.short)).toFixed(0)}, other ${mean(zs.map((r) => r.zero[1] - r.zero[0] - r.by.mebu - r.by.open - r.short)).toFixed(0)})` : '') +
      `, handed on ${mean(rs.map((r) => r.handed)).toFixed(1)} | lineup recommended ${recommendedLevel(ref)} ${JSON.stringify(capabilities(ref))}`);
    if (games) for (const r of rs) console.log(`   seed ${r.seed}: ${r.won ? 'won ' : 'lost'} ${r.min.toFixed(1)} min, missions ${r.done}/${r.offered}, SOS ${r.sos.join('/')}, sectors ${r.sectors}${r.zero ? `, X-Zeit ${r.zero.join('/')} short ${r.short}` : ''}${r.modifiers.length ? ` [${r.modifiers.join(',')}]` : ''} ${r.why}`);
  }
}

// The threat levels (src/threat.js), headless: node tools/leveltest.mjs [seeds] [--levels 1-10|1,3,5] [--lineup ref|below]
//   [--mods mist,air|roll] [--jobs N] [--games]
// Each level's open battle on the 1918 ridge with every crew on auto and the level's reference lineup (capability.js
// REFERENCE, what its `fits` describes); `--lineup below` fields the level below's reference instead (a lineup one level
// over its recommended level), `--mods roll` the modifiers rolled for each seed (threat.js rollModifiers). Prints per
// level the games won, the minutes (and when the main objectives were done), the mission's main objectives and secondaries
// done (src/operation.js), the main objectives' failed fire missions, how each game ended, the Sperrfeuer held, X-Zeit's men in and lost to our own
// short rounds, and the lineup's recommended level; `--games` each game.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { loadoutOf } from '../src/research.js';
import { ww1Theatre } from '../src/ww1/theatre.js';
import { RIDGE_WW2, RIDGE_MORE } from '../src/ww1/ops.js';
import { THREAT, rollModifiers, parseModifiers } from '../src/threat.js';
import { REFERENCE, recommendedLevel, capabilities } from '../src/capability.js';

let heightAt, groundKindAt;
async function stage() {
  // every career battery's pads, before the ground is sampled (terrainHeight.js reads them once: with RIDGE_MORE left
  // out, the first game in a worker levelled its own lineup's ground and no later game's, and a seed's result hung on
  // the games run before it in that worker)
  ww1Theatre('ridge', { kinds: [...RIDGE_WW2, ...RIDGE_MORE].map((u) => u.kind) });
  ({ heightAt, groundKindAt } = await import('../src/terrainHeight.js'));
}

function run({ seed, level, lineup, mods, cb }) {
  const lv = REFERENCE[lineup === 'below' ? Math.max(1, level - 1) : level];
  const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: ww1Theatre('ridge', { kinds: Object.keys(lv) }) });
  const modifiers = mods === 'roll' ? rollModifiers(level, seed) : parseModifiers(mods);
  sim.newGame({ seed, loadout: loadoutOf(lv), level, modifiers, cbModel: cb || null });
  for (const u of sim.units) u.mode = 'auto';
  // (a level ends on its orders, never on the clock: a game still going at two hours is reported as unfinished)
  while (sim.state === 'playing' && sim.time < 7200) sim.update(0.05);
  const ob = sim.objectives, why = sim.over?.sub ?? '';
  const mains = ob.mains.filter((o) => o.kind !== 'xzeit'), sides = ob.sides;
  const last = sim.state === 'playing' ? 'unfinished' : /^Too many/.test(why) ? 'too many failed' : /^Nothing/.test(why) ? 'nothing in reach'
    : sim.zero?.survivors != null ? (sim.state === 'victory' ? 'X-Zeit won' : 'assault failed') : sim.state === 'victory' ? 'ended' : sim.stats.sectorsLost >= 2 ? 'two sectors' : 'every gun';
  // (a human ends the battle the moment the mains are done, or calls X-Zeit at once: the proxy for a human's length is the time to the
  // mains done plus X-Zeit's run when it is dealt; the all-auto crews wait QUIET_END first)
  const acc = ob.accomplished, called = sim.director.lv?.calledAt;
  const human = acc == null ? null : (sim.zero?.survivors != null && called != null ? acc + (sim.time - called) : acc) / 60;
  const holds = ob.list.filter((o) => o.kind === 'hold'), traces = ob.list.filter((o) => o.kind === 'trace');
  return {
    human, holds: holds.map((o) => [o.main, o.state, Math.round(o.held), o.hold.need, o.tEnd != null ? Math.round(o.tEnd) : null]), traces: traces.map((o) => [o.state, o.step, o.ready]),
    seed, level, won: sim.state === 'victory', min: sim.time / 60, modifiers, end: last, op: `${sim.operation.archetype}${sim.operation.xzeit ? '+X' : ''}`,
    mains: [mains.filter((o) => o.state === 'done').length, mains.length], sides: [sides.filter((o) => o.state === 'done').length, sides.length],
    acc: ob.accomplished != null ? ob.accomplished / 60 : null, fails: ob.fails, pay: ob.paid,
    sos: [sim.stats.sos.filter((q) => q.held).length, sim.stats.sos.length], sectors: sim.stats.sectorsLost,
    zero: sim.zero ? [sim.zero.survivors ?? 0, sim.zero.n0] : null, short: Math.round(sim.stats.lossBy.short),
    by: Object.fromEntries(Object.entries(sim.stats.lossBy).map(([k, v]) => [k, Math.round(v)])),
    lost: sim.stats.piecesLost, handed: sim.director.handedOff?.size ?? 0, why,
    net: ob.list.filter((o) => o.handed).map((o) => o.title), // (main objectives the safety net handed on: ww1/director.js stallUpdate)
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
  const lineup = opt('--lineup', 'ref'), mods = opt('--mods', ''), games = args.includes('--games'), cb = opt('--cb', 'ranging');
  const jobs = [];
  for (const level of levels) for (const seed of seeds) jobs.push({ seed, level, lineup, mods, cb });
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
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? (b[b.length >> 1] + b[(b.length - 1) >> 1]) / 2 : NaN; };
  console.log(`lineup ${lineup}${mods ? `, modifiers ${mods}` : ''}, ${seeds.length} seeds`);
  for (const level of levels) {
    const rs = results.filter((r) => r.level === level).sort((a, b) => a.seed - b.seed);
    const L = THREAT[level - 1], ref = REFERENCE[lineup === 'below' ? Math.max(1, level - 1) : level];
    const zs = rs.filter((r) => r.zero);
    const sos = rs.reduce((a, r) => [a[0] + r.sos[0], a[1] + r.sos[1]], [0, 0]);
    const ends = {};
    for (const r of rs) ends[r.end] = (ends[r.end] ?? 0) + 1;
    const accs = rs.filter((r) => r.acc != null);
    console.log(`L${String(level).padEnd(2)} ${L.name.padEnd(16)} won ${String(rs.filter((r) => r.won).length).padStart(2)}/${rs.length} (${Math.round((100 * rs.filter((r) => r.won).length) / rs.length)}%), ${mean(rs.map((r) => r.min)).toFixed(1)} min, human mean ${rs.some((r) => r.human != null) ? mean(rs.filter((r) => r.human != null).map((r) => r.human)).toFixed(1) : '-'} median ${med(rs.filter((r) => r.human != null).map((r) => r.human)).toFixed(1)} (target ${L.minutes}) (mains done at ${accs.length ? mean(accs.map((r) => r.acc)).toFixed(1) : '-'}, median ${accs.length ? med(accs.map((r) => r.acc)).toFixed(1) : '-'}), mains ${mean(rs.map((r) => r.mains[0])).toFixed(1)}/${mean(rs.map((r) => r.mains[1])).toFixed(1)}, secondaries ${mean(rs.map((r) => r.sides[0])).toFixed(1)}/${mean(rs.map((r) => r.sides[1])).toFixed(1)} (full clear ${rs.filter((r) => r.sides[0] === r.sides[1]).length}), fails ${mean(rs.map((r) => r.fails)).toFixed(1)} (${L.fails} allowed), ended: ${Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}, SOS held ${sos[0]}/${sos[1]}, sectors lost ${mean(rs.map((r) => r.sectors)).toFixed(2)}, guns lost ${mean(rs.map((r) => r.lost)).toFixed(1)}` +
      (zs.length ? `, X-Zeit ${zs.length} games, ${mean(zs.map((r) => r.zero[0])).toFixed(0)}/${zs[0].zero[1]} in (lost to the garrison ${mean(zs.map((r) => r.by.mebu)).toFixed(0)}, to the strongpoints ${mean(zs.map((r) => r.by.fort ?? 0)).toFixed(0)}, in the open ${mean(zs.map((r) => r.by.open)).toFixed(0)}, short ${mean(zs.map((r) => r.short)).toFixed(0)})` : '') +
      (() => { const hs = rs.flatMap((r) => r.holds), ts = rs.flatMap((r) => r.traces); return `${hs.length ? `, holds ${hs.filter((h) => h[1] === 'done').length}/${hs.length} done${hs.some((h) => h[0]) ? ` (${hs.filter((h) => h[0]).length} main)` : ''}` : ''}${ts.length ? `, traces ${ts.filter((t) => t[0] === 'done').length}/${ts.length} done (step 2 reached ${ts.filter((t) => t[1] === 2).length})` : ''}`; })() +
      `, handed on ${mean(rs.map((r) => r.handed)).toFixed(1)}, safety net ${rs.reduce((a, r) => a + r.net.length, 0)} | lineup recommended ${recommendedLevel(ref)}`);
    if (games) for (const r of rs) console.log(`   seed ${r.seed}: ${r.won ? 'won ' : 'lost'} ${r.min.toFixed(1)} min ${r.op}, mains ${r.mains.join('/')}${r.acc != null ? ` at ${r.acc.toFixed(1)}` : ''}, secondaries ${r.sides.join('/')}, fails ${r.fails}, SOS ${r.sos.join('/')}, sectors ${r.sectors}${r.zero ? `, X-Zeit ${r.zero.join('/')} short ${r.short}` : ''}${r.holds.length ? `, hold ${r.holds.map((h) => `${h[0] ? 'M' : 's'} ${h[1]} ${h[2]}/${h[3]}`).join(' ')}` : ''}${r.traces.length ? `, trace ${r.traces.map((t) => `${t[0]} step ${t[1]}`).join(' ')}` : ''}${r.human != null ? `, human ${r.human.toFixed(1)}` : ''}${r.modifiers.length ? ` [${r.modifiers.join(',')}]` : ''}${r.net.length ? ` (safety net: ${r.net.join('; ')})` : ''} ${r.why}`);
  }
}

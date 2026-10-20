// Headless WW1 German operations: node tools/ww1test.mjs [seeds] [--op ridge|paris|all] [--difficulty Easy|Normal|Hard|all]
//   [--player] [--log] [--quiet] [--table] [--jobs N]
// Runs whole operations (src/ww1/ops.js: the open battle 'ridge', the Paris Gun's mission 'paris') at dt = 0.5 with
// every unit on auto (the Paris Gun's crew works its procedure itself) and prints per game the outcome, the missions,
// the kills by unit, the Sperrfeuer, the assault at X-Zeit and the Paris Gun's shots and orders. --table prints only
// the summary. --player: on the Paris Gun's mission a scripted competent player works the gun instead of its auto
// crew (ALL HANDS for the Stellungsbau; each round at once, the charge to the gauge, the table and half of each report,
// faults fixed, the order due soonest). Deterministic per seed.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const args = isMainThread ? process.argv.slice(2) : workerData.args;
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] ?? '')).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
const diffArg = opt('--difficulty', 'Normal');
const diffs = diffArg === 'all' ? ['Easy', 'Normal', 'Hard'] : [diffArg];
const opArg = opt('--op', 'all');
const ops = opArg === 'all' ? ['ridge', 'paris'] : [opArg];
const PLAYER = args.includes('--player');
const LOG = args.includes('--log'), QUIET = args.includes('--quiet'), TABLE = args.includes('--table');
const JOBS = Math.max(1, Math.min(4, +opt('--jobs', 1) || 1));

// the scripted player on the Paris Gun (--player): what a competent player does with the console's commands
function parisPlayer(sim, u) {
  const st = u.special, cmd = (n, a = {}) => sim.command(u.id, n, a);
  if (!u.alive || !st) return;
  if (!st.ready) { if (!st.allHands) cmd('hurry'); return; }
  if (st.hold === 'fault') return cmd('fix', { how: 'fix' });
  if (st.hold === 'start') {
    // a spent barrel is changed unless an order would run out meanwhile (then one more round on the old one)
    const pressing = st.orders.some((o) => o.state === 'open' && o.due - sim.time < 600);
    if (st.barrel.fired >= st.barrel.life && st.barrel.state === 'ok' && (!pressing || st.barrel.fired >= st.barrel.life + 2)) return cmd('barrel');
    let best = null;
    for (const o of st.orders) if (o.state === 'open' && o.due - sim.time > 200 && (!best || o.due < best.due)) best = o;
    const want = best?.target ?? st.targets[0].id;
    if (want !== st.target.id) cmd('aim', { id: want });
    return cmd('step');
  }
  if (st.hold === 'dial') {
    if (st.steps[st.i].set === 'charge') return cmd('powder', { kg: st.charge.need });
    if (st.last && st.last.state === 'fallen' && !st.last.used) sim.special.of(u).useReport(st.last, 0.5);
    return cmd('table');
  }
  if (st.hold === 'fire') return cmd('step');
}

async function play(opId, difficulty, seed) {
  const { ww1Theatre } = await import('../src/ww1/theatre.js');
  const th = ww1Theatre(opId); // before the terrain is sampled: the pads
  const { Sim } = await import('../src/sim/sim.js');
  const { heightAt, groundKindAt } = await import('../src/terrainHeight.js');
  const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: th });
  const log = [];
  let raids = 0;
  sim.events = { radio: (t, k) => { if (t.startsWith('Fliegeralarm')) raids++; if (LOG) log.push(`  [${sim.time.toFixed(0).padStart(5)}] ${k.padEnd(6)} ${t}`); } };
  sim.newGame({ difficulty, seed });
  for (const u of sim.units) u.mode = PLAYER && u.kind === 'paris' ? 'manual' : 'auto';
  const t0 = Date.now();
  let err = null;
  try {
    while (sim.state === 'playing' && sim.time < 2800) {
      if (PLAYER) for (const u of sim.units) if (u.kind === 'paris') parisPlayer(sim, u);
      sim.update(0.5);
    }
  } catch (e) {
    err = e.stack;
  }
  const pu = sim.units.find((u) => u.kind === 'paris'), paris = pu?.special, readyAt = pu ? sim.special?.of(pu)?.readyAt ?? null : null;
  return {
    op: opId, difficulty, seed, state: sim.state, time: sim.time, ms: Date.now() - t0, err, log, score: sim.score.points,
    missions: Object.entries(sim.stats.missions).map(([k, v]) => `${k} ${v.done}/${v.new}`).join(', '),
    units: sim.units.map((u) => ({ cs: u.callsign, kind: u.kind, r: u.stats.rounds, k: u.stats.kills, alive: u.alive, lost: u.pieces.filter((p) => p.state === 'dead').length })),
    sos: sim.stats.sos.map((q) => ({ sector: q.sector, held: q.held, resp: q.resp, left: q.left, n0: q.n0 })),
    sectorsLost: sim.stats.sectorsLost, cbRounds: sim.stats.cbRounds, piecesLost: sim.stats.piecesLost,
    zero: sim.zero ? { in: sim.zero.survivors ?? null, n0: sim.zero.n0 } : null,
    paris: paris ? {
      shots: paris.flights.length, hits: paris.hits, near: paris.near, barrels: paris.barrel.n, miss: paris.flights.filter((f) => f.state === 'fallen').map((f) => Math.round(f.miss)),
      byTarget: (paris.targets ?? []).map((t) => `${t.name} ${t.hits}`).join(', '), given: paris.orders?.length ?? 0, done: paris.ordersDone ?? 0, failed: paris.ordersFailed ?? 0,
      readyAt,
    } : null,
    raids,
    targets: sim.targets.map((t) => `${t.id}${t.alive ? '+' : 'x'}`).join(' '),
  };
}

if (!isMainThread) {
  const out = [];
  for (const [o, d, s] of workerData.jobs) out.push(await play(o, d, s));
  parentPort.postMessage(out);
} else {
  const jobs = [];
  for (const o of ops) for (const d of diffs) for (const s of seeds) jobs.push([o, d, s]);
  let results = [];
  if (JOBS > 1) {
    const parts = Array.from({ length: JOBS }, () => []);
    jobs.forEach((j, i) => parts[i % JOBS].push(j));
    const file = fileURLToPath(import.meta.url);
    const runs = parts.filter((p) => p.length).map((p) => new Promise((res, rej) => {
      const w = new Worker(file, { workerData: { jobs: p, args } });
      w.on('message', res);
      w.on('error', rej);
    }));
    results = (await Promise.all(runs)).flat();
  } else for (const [o, d, s] of jobs) results.push(await play(o, d, s));
  results.sort((a, b) => ops.indexOf(a.op) - ops.indexOf(b.op) || diffs.indexOf(a.difficulty) - diffs.indexOf(b.difficulty) || a.seed - b.seed);
  let fails = 0;
  for (const r of results) {
    if (r.err) { fails++; console.log(`${r.op} ${r.difficulty} seed ${r.seed}: CRASH at t=${r.time.toFixed(1)}: ${r.err}`); continue; }
    if (LOG) console.log(r.log.join('\n'));
    if (QUIET || TABLE) continue;
    const units = r.units.map((u) => `${u.cs} ${u.r}r/${u.k}k${u.lost ? ` -${u.lost}` : ''}${u.alive ? '' : ' LOST'}`).join(' | ');
    const p = r.paris;
    console.log(`${r.op.padEnd(5)} ${r.difficulty.padEnd(6)} seed ${String(r.seed).padEnd(3)} ${r.state.padEnd(8)} t ${r.time.toFixed(0).padStart(5)} s  score ${r.score}  ${r.ms} ms`);
    console.log(`   missions: ${r.missions || '-'}\n   units: ${units}\n   targets: ${r.targets}  (British CB rounds ${r.cbRounds}, our pieces lost ${r.piecesLost})`);
    if (r.sos.length) console.log(`   Sperrfeuer: ${r.sos.map((q) => `${q.sector} ${q.held ? 'held' : 'breached'} (${q.resp != null ? q.resp.toFixed(0) + ' s' : 'no fire'}, ${q.left}/${q.n0} in)`).join(', ')}${r.sectorsLost ? `; sectors lost ${r.sectorsLost}` : ''}`);
    if (r.zero) console.log(`   X-Zeit: ${r.zero.in ?? '?'} of ${r.zero.n0} in`);
    if (p) console.log(`   Paris Gun: ${p.readyAt != null ? `stood at ${p.readyAt.toFixed(0)} s, ` : 'never stood, '}${p.shots} shots, ${p.hits} in a target's area (${p.byTarget}), ${p.near} near, barrel ${p.barrels}; orders ${p.done} done, ${p.failed} too late of ${p.given}; misses ${p.miss.join(' ')}`);
  }
  for (const o of ops) for (const d of diffs) {
    const rs = results.filter((r) => r.op === o && r.difficulty === d && !r.err);
    if (!rs.length) continue;
    const mean = (f) => (rs.reduce((s, r) => s + f(r), 0) / rs.length);
    if (o === 'paris') {
      const lost = rs.filter((r) => !r.units[0].alive).length;
      console.log(`== paris ${d}: won ${rs.filter((r) => r.state === 'victory').length}/${rs.length}; orders done ${mean((r) => r.paris.done).toFixed(1)} of ${mean((r) => r.paris.given).toFixed(1)}, `
        + `shots ${mean((r) => r.paris.shots).toFixed(1)}, in the area ${mean((r) => r.paris.hits).toFixed(1)}, near ${mean((r) => r.paris.near).toFixed(1)}, barrel changes ${mean((r) => r.paris.barrels - 3).toFixed(2)}; `
        + `orders done by game ${[0, 1, 2, 3, 4, 5].map((k) => rs.filter((r) => r.paris.done === k).length).join('/')} (0 to 5); `
        + `stood at ${mean((r) => r.paris.readyAt ?? r.time).toFixed(0)} s, raids ${mean((r) => r.raids).toFixed(1)}, pieces lost ${mean((r) => r.piecesLost).toFixed(2)} (gun lost in ${lost}); ends at ${mean((r) => r.time).toFixed(0)} s`);
      continue;
    }
    const sos = rs.flatMap((r) => r.sos), z = rs.filter((r) => r.zero && r.zero.in != null);
    const kinds = rs[0].units.map((u) => u.kind);
    console.log(`== ${o} ${d}: won ${rs.filter((r) => r.state === 'victory').length}/${rs.length}; sectors lost ${mean((r) => r.sectorsLost).toFixed(2)}, pieces lost ${mean((r) => r.piecesLost).toFixed(1)}, British CB rounds ${mean((r) => r.cbRounds).toFixed(0)}; `
      + `Sperrfeuer held ${sos.filter((q) => q.held).length}/${sos.length}; X-Zeit ${z.length ? (100 * z.reduce((s, r) => s + r.zero.in / r.zero.n0, 0) / z.length).toFixed(0) : '-'}% in`);
    console.log(`   kills by unit (${kinds.join(' ')}): ${kinds.map((k, i) => mean((r) => r.units[i].k).toFixed(1)).join(' ')} | rounds ${kinds.map((k, i) => mean((r) => r.units[i].r).toFixed(0)).join(' ')}`
      + (rs[0].paris ? ` | Paris shots ${mean((r) => r.paris.shots).toFixed(1)}, in the area ${mean((r) => r.paris.hits).toFixed(1)}, orders done ${mean((r) => r.paris.done).toFixed(1)} of ${mean((r) => r.paris.given).toFixed(1)}` : ''));
  }
  if (fails) { console.log(`${fails} game(s) crashed`); process.exit(1); }
}

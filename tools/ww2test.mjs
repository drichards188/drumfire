// Headless WW2 operations: node tools/ww2test.mjs [seeds] [--op flanders|sevastopol|karl|v1|v2|all]
//   [--difficulty Easy|Normal|Hard|all] [--log] [--quiet]
// Runs whole operations at dt = 0.05 with every unit on auto (the special weapons' crews work their drills
// themselves) and prints per game the outcome, the missions, the kills by unit and what the special controllers
// did (when the Gustav stood ready, the Karl's positions, the V-weapons' flights). Deterministic per seed.
import { Sim } from '../src/sim/sim.js';
import { ww2Theatre, OP_IDS } from '../src/ww2/theatre.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] ?? '')).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
const opArg = opt('--op', 'all');
const ops = opArg === 'all' ? OP_IDS : opArg.split(',');
const diffArg = opt('--difficulty', 'Normal');
const diffs = diffArg === 'all' ? ['Easy', 'Normal', 'Hard'] : [diffArg];
const LOG = args.includes('--log'), QUIET = args.includes('--quiet');

// the terrain module adds the WW2 pads when the theatre is made: make every op's theatre first
for (const id of OP_IDS) ww2Theatre(id);
const { heightAt, groundKindAt } = await import('../src/terrainHeight.js');

let fails = 0;
for (const opId of ops) for (const difficulty of diffs) {
  const sum = { won: 0, n: 0 };
  for (const seed of seeds) {
    const th = ww2Theatre(opId);
    const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: th });
    const log = [];
    sim.events = {
      radio: (t, k) => { if (LOG) console.log(`  [${sim.time.toFixed(0).padStart(5)}] ${k.padEnd(6)} ${t}`); log.push(t); },
      special: (u, what, x) => { if (what === 'ready') u._readyAt = sim.time; },
    };
    sim.newGame({ difficulty, seed });
    for (const u of sim.units) u.mode = 'auto';
    const t0 = Date.now();
    let err = null;
    try {
      while (sim.state === 'playing' && sim.time < 2700) sim.update(0.5);
    } catch (e) {
      err = e;
    }
    const ms = Date.now() - t0;
    sum.n++;
    if (sim.state === 'victory') sum.won++;
    if (err) { fails++; console.log(`${opId} ${difficulty} seed ${seed}: CRASH at t=${sim.time.toFixed(1)}: ${err.stack}`); continue; }
    if (QUIET) continue;
    const ms_ = sim.stats.missions, mis = Object.entries(ms_).map(([k, v]) => `${k} ${v.done}/${v.new}`).join(', ');
    const units = sim.units.map((u) => `${u.callsign} ${u.stats.rounds}r/${u.stats.kills}k${u.alive ? '' : ' LOST'}`).join(' | ');
    const sp = sim.units.filter((u) => u.special).map((u) => {
      const s = u.special;
      if (s.kind === 'gustav') return `Gustav ready ${u._readyAt != null ? u._readyAt.toFixed(0) + ' s' : 'never'}, shells left ${u.ammo.he}`;
      if (s.kind === 'karl') return `Karl at ${s.posId ?? '-'} lower ${s.lower.toFixed(1)}, drove ${s.drive.toFixed(0)} m, shells ${u.ammo.he}+${s.reserve}`;
      return `${s.kind}: ${s.flights.map((f) => f.state).join(', ') || 'no flights'}`;
    }).join('; ');
    console.log(`${opId.padEnd(10)} ${difficulty.padEnd(6)} seed ${String(seed).padEnd(3)} ${sim.state.padEnd(8)} t ${sim.time.toFixed(0).padStart(5)} s  score ${sim.score.points}  ${ms} ms`);
    console.log(`   missions: ${mis || '-'}\n   units: ${units}${sp ? `\n   special: ${sp}` : ''}${sim.stats.sectorsLost ? `\n   sectors lost ${sim.stats.sectorsLost}` : ''}${sim.stats.sos.length ? `\n   Sperrfeuer: ${sim.stats.sos.map((q) => `${q.sector} ${q.held ? 'held' : 'breached'} (${q.resp != null ? q.resp.toFixed(0) + ' s' : 'no fire'}, ${q.left}/${q.n0} in)`).join(', ')}` : ''}${sim.zero ? `\n   Gegenangriff: ${sim.zero.survivors ?? '?'} of ${sim.zero.n0} in` : ''}`);
  }
  console.log(`== ${opId} ${difficulty}: won ${sum.won}/${sum.n}`);
}
if (fails) { console.log(`${fails} game(s) crashed`); process.exit(1); }

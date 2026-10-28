// Off-map support (src/sim/support.js), headless: node tools/supporttest.mjs [seeds] [--difficulty Easy|Normal|Hard]
//   [--lineup dev|start] [--kinds v1,v2,paris]
// The career's open battle on the 1918 ridge with every crew on auto and a scripted player who orders each weapon off
// the map onto the nearest British target standing whenever it is ready. Prints per weapon the orders, the strikes, the
// mean miss and what they destroyed, and checks the controller is deterministic (each game twice) and explains a
// refused order. Exits 1 on a failure.
import { Sim } from '../src/sim/sim.js';
import { ww1Theatre } from '../src/ww1/theatre.js';
import { TREES, maxedLevels, loadoutOf, opposition } from '../src/research.js';

const th = ww1Theatre('ridge');
const { heightAt, groundKindAt } = await import('../src/terrainHeight.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] ?? '')).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
const difficulty = opt('--difficulty', 'Normal');
const kinds = opt('--kinds', 'v1,v2,paris').split(',');
const lineup = opt('--lineup', 'dev');
let fails = 0;

function levels() {
  if (lineup === 'start') return Object.fromEntries(['k17', ...kinds].map((k) => [k, { guns: 1 }]));
  return Object.fromEntries(TREES.de.map((n) => [n.kind, maxedLevels(n.kind)]));
}

function run(seed) {
  const lv = levels();
  const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: th });
  const log = [];
  sim.events = { radio: (t, k) => log.push(`[${sim.time.toFixed(0)}] ${k} ${t}`) };
  sim.newGame({ difficulty, seed, loadout: loadoutOf(lv), opposition: opposition('de', lv) });
  for (const u of sim.units) u.mode = 'auto';
  if (!sim.support) return { err: 'no sim.support with off-map kinds in the lineup', log };
  const st = Object.fromEntries(sim.support.assets.map((a) => [a.kind, { orders: 0, strikes: 0, miss: 0, kills: 0 }]));
  // a refused order is told: order the first one twice
  const a0 = sim.support.assets[0];
  const t0 = sim.targets.find((t) => t.alive && !t.offmap);
  sim.command(null, 'support', { kind: a0.kind, x: t0.pos.x, z: t0.pos.z });
  st[a0.kind].orders++;
  const n0 = log.length;
  const again = sim.command(null, 'support', { kind: a0.kind, cancel: true }) && sim.command(null, 'support', { kind: a0.kind, x: t0.pos.x, z: t0.pos.z });
  const refusedOk = again && (sim.support.get(a0.kind).state === 'preparing');
  sim.command(null, 'support', { kind: a0.kind, x: NaN, z: 0 });
  const told = log.slice(n0).some((l) => l.includes('cannot fire'));
  let lastState = Object.fromEntries(sim.support.assets.map((a) => [a.kind, a.state]));
  while (sim.state === 'playing' && sim.time < 4000) {
    sim.update(0.05);
    for (const a of sim.support.assets) {
      if (lastState[a.kind] === 'flight' && a.state === 'reloading' && a.last) {
        st[a.kind].strikes++;
        st[a.kind].miss += a.last.off;
        if (a.last.destroyed) st[a.kind].kills++;
      }
      lastState[a.kind] = a.state;
      if (a.state !== 'ready') continue;
      const t = sim.targets.filter((q) => q.alive && !q.offmap && q.present !== false && q.known !== false)
        .sort((p, q) => Math.hypot(p.pos.x - 3000, p.pos.z) - Math.hypot(q.pos.x - 3000, q.pos.z))[0];
      if (t && sim.command(null, 'support', { kind: a.kind, x: t.pos.x, z: t.pos.z })) st[a.kind].orders++;
    }
  }
  return { st, won: sim.state === 'victory', min: sim.time / 60, told, refusedOk, log, sig: JSON.stringify(st) + sim.state + Math.round(sim.time) };
}

for (const seed of seeds) {
  const r = run(seed);
  if (r.err) { console.log(`seed ${seed}: FAIL ${r.err}`); fails++; continue; }
  const r2 = run(seed);
  const det = r.sig === r2.sig;
  const line = Object.entries(r.st).map(([k, s]) => `${k} ${s.strikes}/${s.orders} strikes, miss ${s.strikes ? Math.round(s.miss / s.strikes) : '-'} m, ${s.kills} destroyed`).join(' | ');
  const ok = det && r.told && r.refusedOk && Object.values(r.st).every((s) => s.strikes > 0);
  if (!ok) fails++;
  console.log(`seed ${seed} ${difficulty} ${lineup}: ${r.won ? 'won' : 'lost'} ${r.min.toFixed(1)} min | ${line} | deterministic ${det}, refusal told ${r.told}, retarget ${r.refusedOk}${ok ? '' : '  FAIL'}`);
  if (!ok) console.log('   ' + r.log.filter((l) => /V-1|V-2|Paris/.test(l)).slice(0, 12).join('\n   '));
}
console.log(fails ? `${fails} failed` : 'all good');
if (fails) process.exit(1);

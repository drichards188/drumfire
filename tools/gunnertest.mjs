// Headless WW2 gunner games: node tools/gunnertest.mjs [seeds] [--kind lefh18,sfh18,k18,mrs18,gustav,karl|all]
//   [--op flanders|sevastopol|karl] [--assist on|off|both] [--difficulty Easy|Normal|Hard|all] [--manual] [--log] [--quiet]
// The Flanders open battle (the Karl: its own operation, or with --op flanders the set-up Karl the open battle fields;
// the Gustav with --op sevastopol: the siege, manned once its railway preparation is done) with every unit on auto and a scripted player in person at No. 1 gun of a battery
// (src/ww2/gunner.js): every quarter second it reads the drill's next job, goes to that post and holds its key
// (E, or A/D/W/S on the layer's wheels; on a driven gun, the Gustav and the Karl, it taps the key to start the drive).
// With crew help on it stays at the layer's post and only moves when the next job
// is its own or nobody else's; with it off it runs the whole drill alone. --manual puts the player's battery on manual
// (the player's pull is the order to fire for this gun alone). Prints per game the outcome, the rounds the manned gun fired against
// its battery's other guns, the fire orders that lapsed, and the time from each fire order to the shot.
import { Sim } from '../src/sim/sim.js';
import { ww2Theatre } from '../src/ww2/theatre.js';
import { sandboxTheatre } from '../src/campaign.js';
import { GUNS } from '../src/sim/tables.js';
import { DRIVEN } from '../src/ww2/gunner.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] ?? '')).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
const kindArg = opt('--kind', 'all');
const kinds = kindArg === 'all' ? ['lefh18', 'sfh18', 'k18', 'mrs18', 'gustav', 'karl'] : kindArg.split(',');
// the operation each kind is fought in (the Karl is in no other)
const opOf = (kind) => (kind === 'karl' ? opt('--op', 'karl') : kind === 'gustav' ? opt('--op', 'flanders') : 'flanders');
// the open battle's Karl is the game's extra (src/campaign.js sandboxTheatre: set up, its crew turns the hull); made
// once, as it adds the Karl's pads to the terrain
let sandbox = null;
const theatre = (kind) => (kind === 'karl' && opOf(kind) === 'flanders' ? (sandbox ??= sandboxTheatre('flanders')) : ww2Theatre(opOf(kind)));
const asArg = opt('--assist', 'both');
const assists = asArg === 'both' ? [true, false] : [asArg === 'on'];
const diffArg = opt('--difficulty', 'Normal');
const diffs = diffArg === 'all' ? ['Easy', 'Normal', 'Hard'] : [diffArg];
const LOG = args.includes('--log'), QUIET = args.includes('--quiet'), MANUAL = args.includes('--manual');

ww2Theatre('flanders');
const { heightAt, groundKindAt } = await import('../src/terrainHeight.js');
const KEY = { E: { work: true }, A: { az: 1 }, D: { az: -1 }, W: { el: 1 }, S: { el: -1 } };
const DRIVE = { A: ['az', 1], D: ['az', -1], W: ['el', 1], S: ['el', -1] };

let fails = 0;
for (const kind of kinds) for (const assist of assists) for (const difficulty of diffs) {
  const sum = { won: 0, n: 0, mine: 0, others: 0, lapsed: 0, lag: [], left: 0 };
  for (const seed of seeds) {
    const th = theatre(kind);
    const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: th });
    let lapsed = 0, left = 0;
    sim.events = {
      radio: (t, k) => { if (LOG) console.log(`  [${sim.time.toFixed(0).padStart(5)}] ${k.padEnd(6)} ${t}`); },
      gunner: (what) => { if (what === 'lapse') lapsed++; if (what === 'unman') left++; },
    };
    sim.newGame({ difficulty, seed });
    for (const u of sim.units) u.mode = 'auto';
    const u = sim.units.find((q) => q.kind === kind);
    if (!u) { console.log(`no ${kind} in the battle`); fails++; continue; }
    if (MANUAL) u.mode = 'manual';
    const p = u.pieces[0];
    // the Gustav at the siege stands only after its railway preparation (the gangs on auto): man it then
    const man = () => sim.command(u.id, 'man', { piece: 0, post: 'lay', assist });
    if (!p.fixed && !man()) { console.log(`${kind}: man refused`); fails++; continue; }
    let err = null, think = 0, ordered = null, manAt = p.fixed ? null : 0;
    const lags = [];
    try {
      while (sim.state === 'playing' && sim.time < 2700) {
        if (manAt == null && !p.fixed && man()) manAt = sim.time;
        const st = sim.gunner.st;
        if (st && (think -= 0.05) <= 0) {
          think = 0.25;
          const n = st.next;
          // with crew help the player keeps to the layer's post unless the job is his own or nobody's
          let post = st.post;
          if (n && !n.wait && n.key && (!assist || n.post === 'lay' || n.post === 'fire')) post = n.post;
          if (post !== st.post) sim.command(u.id, 'post', { post });
          const inp = { az: 0, el: 0, fine: false, work: false };
          if (n && n.key && n.post === post) {
            // a driven gun's layer taps the key: the drive runs on by itself to the mark
            if (DRIVEN.has(kind) && DRIVE[n.key]) sim.command(u.id, 'drive', { axis: DRIVE[n.key][0], dir: DRIVE[n.key][1] });
            else Object.assign(inp, KEY[n.key] ?? {});
          }
          // a manual battery: the player's own commander lays the battery on the newest mission now and then
          if (MANUAL && u.missionId == null) {
            const m = sim.missions.find((q) => (q.state === 'open' || q.state === 'ranging' || q.state === 'ffe') && sim.crews.canServe(u, q));
            if (m) sim.command(u.id, 'mission', { id: m.id });
          }
          sim.gunner.setInput(inp);
        }
        if (p.rounds > 0 && ordered == null) ordered = sim.time;
        const before = p.firedAt;
        sim.update(0.05);
        if (p.firedAt !== before && ordered != null) { lags.push(sim.time - ordered); ordered = null; }
        if (p.rounds === 0 && p.state !== 'recoil') ordered = null;
      }
    } catch (e) {
      err = e;
    }
    sum.n++;
    if (sim.state === 'victory') sum.won++;
    if (err) { fails++; console.log(`${kind} ${assist ? 'help' : 'alone'} ${difficulty} seed ${seed}: CRASH at t=${sim.time.toFixed(1)}: ${err.stack}`); continue; }
    // the rounds: the manned gun's barrel wear counts its shots exactly (wearPerRound), the battery's total from stats
    const wpr = GUNS[kind].wearPerRound;
    const myRounds = Math.round(p.wear / wpr);
    const rest = u.stats.rounds - myRounds;
    sum.mine += myRounds; sum.others += rest / Math.max(1, u.pieces.length - 1); sum.lapsed += lapsed; sum.left += left;
    sum.lag.push(...lags);
    if (!QUIET) {
      const lag = lags.length ? (lags.reduce((a, b) => a + b, 0) / lags.length).toFixed(1) : '-';
      console.log(`${kind.padEnd(7)} ${assist ? 'help ' : 'alone'} ${difficulty.padEnd(6)} seed ${String(seed).padEnd(3)} ${sim.state.padEnd(8)} t ${sim.time.toFixed(0).padStart(5)}  manned gun ${String(myRounds).padStart(3)} rounds, other guns ${(rest / Math.max(1, u.pieces.length - 1)).toFixed(0).padStart(3)} each, lapsed ${lapsed}, order to shot ${lag} s${manAt ? `, manned at ${manAt.toFixed(0)} s` : manAt == null ? ', never manned' : ''}${left ? ', left the gun' : ''}${sim.gunner.st ? '' : ' (not at the gun at the end)'}`);
    }
  }
  const lag = sum.lag.length ? (sum.lag.reduce((a, b) => a + b, 0) / sum.lag.length).toFixed(1) : '-';
  console.log(`== ${kind} ${assist ? 'crew help' : 'alone'} ${difficulty}${MANUAL ? ' manual' : ''}: won ${sum.won}/${sum.n}, manned gun ${(sum.mine / sum.n).toFixed(1)} rounds a game against ${(sum.others / sum.n).toFixed(1)} for each other gun, ${(sum.lapsed / sum.n).toFixed(1)} orders lapsed, order to shot ${lag} s`);
}
if (fails) { console.log(`${fails} game(s) failed`); process.exit(1); }

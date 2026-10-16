// Headless Dicke Bertha games (src/bertha/game.js): the whole detachment worked by the crew logic (assist on,
// the player at no station), so every order can be followed through to the end.
//   node tools/berthatest.mjs [seeds...] [--difficulty Easy|Normal|Hard|all] [--log] [--limit seconds]
import { BerthaGame } from '../src/bertha/game.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const diffs = ((d) => (d === 'all' ? ['Easy', 'Normal', 'Hard'] : [d]))(opt('--difficulty', 'Normal'));
const limit = Number(opt('--limit', 3600));
const log = flag('--log');
const seeds = args.length ? args.map(Number) : [1, 2, 3];
for (const difficulty of diffs) {
  let wins = 0;
  for (const seed of seeds) {
    const g = new BerthaGame({ seed, difficulty, assist: true });
    g.station = 'none';
    if (log) g.events.message = (m) => console.log(`  ${String(Math.round(m.t)).padStart(5)} ${m.text}`);
    while (g.state === 'playing' && g.time < limit) g.update(0.25);
    if (g.state === 'victory') wins++;
    const kills = g.targets.filter((t) => !t.alive).length;
    console.log(`${difficulty.padEnd(6)} seed ${String(seed).padStart(3)}: ${g.state.padEnd(8)} t ${Math.round(g.time)} s, ${g.roundsFired} rounds, ${kills}/${g.targets.length} targets, hp ${g.gun.hp}, score ${g.score}`);
  }
  console.log(`${difficulty}: ${wins}/${seeds.length} won`);
}

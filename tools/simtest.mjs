// Headless battles: node tools/simtest.mjs [seeds] [--both | --all | --players auto,player,full]
//   [--difficulty Easy|Normal|Hard|all] [--quiet] [--table] [--log] [--jobs N]
// Runs whole games at dt = 0.05 with every unit on auto ('auto'), with a scripted competent player running
// the 15-inch, the 9.2-inch and the 6-inch battery ('player', --both adds it), or all five units ('full',
// --all adds both), and prints per game what was done and a summary per difficulty and player: outcome,
// phase reached, game time, missions, SOS response, rounds per kill, pieces and sectors lost.
// The scripted player issues the same sim.command calls a console would. The sim is deterministic per seed.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import { Sim } from '../src/sim/sim.js';
import { FFE, GUNS } from '../src/sim/tables.js';
import { autoCharge } from '../src/sim/shells.js';

let heightAt;
try {
  ({ heightAt } = await import('../src/terrainHeight.js'));
} catch (e) {
  try {
    ({ heightAt } = await import('../src/terrain.js'));
  } catch {
    heightAt = (x) => 18 + 37 * Math.max(0, Math.min(1, (x - 3000) / 5000));
    if (isMainThread) console.log('(terrain unavailable, using a stand-in ramp)', e.message);
  }
}

// ---------------------------------------------------------------- the scripted player
// A competent battery commander: answers the rockets at once, ranges with the reports and applies them
// exactly, fires for effect, lifts the barrage on time, goes to hold when counter-battery fire builds up.
function playerFor(kinds) {
  const mem = new Map();
  let ids = null;
  return (sim) => {
    const now = sim.time;
    ids ??= kinds.map((k) => sim.units.find((u) => u.kind === k)?.id).filter((id) => id != null);
    const sos = sim.missions.find((m) => m.kind === 'sos' && m.state !== 'done' && m.state !== 'failed');
    for (const id of ids) {
      const u = sim.unitById(id);
      if (!u || !u.alive) continue;
      const s = mem.get(id) ?? mem.set(id, { st: 'idle', seen: 0, ranged: 0, series: 0, holdUntil: 0, skip: new Set(), wait: 0, lift: -1, m: null, sosOn: null }).get(id);
      if (u.mode !== 'manual' && u.mode !== 'hold') sim.command(id, 'mode', { mode: 'manual' });
      // counter-battery fire: go quiet while the signature is high and rounds are coming, unless it is an SOS
      if (now < s.holdUntil) continue;
      if (u.mode === 'hold') sim.command(id, 'mode', { mode: 'manual' });
      if (!sos && u.signature > 0.62 && now - u.underFire < 25 && sim.phase >= 2 && !sim.barrage?.active) {
        s.holdUntil = now + 40;
        sim.command(id, 'cease', {});
        sim.command(id, 'mode', { mode: 'hold' });
        s.st = 'idle';
        if (u.missionId != null) sim.director.release(u);
        continue;
      }
      // the hurricane bombardment is a warning: lay on the line before the rockets
      const forming = !sos && sim.assaults.find((a) => a.state === 'forming');
      if (forming && now >= s.holdUntil) {
        const p = sim.infAI.sosPoint(forming, 0.3);
        if (s.pre !== forming.id && sim.crews.canServe(u, { x: p.x, z: p.z, kind: 'sos', alt: 0 })) {
          s.pre = forming.id;
          if (u.missionId != null) sim.director.release(u);
          s.st = 'idle';
          sim.command(id, 'lay', { x: p.x, z: p.z });
          sim.command(id, 'rounds', { n: 1 });
        }
      }
      if (sos) {
        if (s.sosOn !== sos.id && now - sos.t0 > 3) {
          s.sosOn = sos.id;
          if (sim.crews.canServe(u, sos) && sim.director.assign(u, sos) && u.order.ok) {
            if (u.kind === 'bl60') sim.command(id, 'fuze', { fuze: 'shrapnel' });
            sim.command(id, 'fire', {});
            s.st = 'sos';
            s.m = sos;
          }
        } else if (s.st === 'sos' && !u.firing && u.order.ok) sim.command(id, 'fire', {});
        if (s.st === 'sos') continue;
      } else if (s.st === 'sos') {
        s.st = 'idle';
        s.sosOn = null;
      }
      if (now < s.wait) continue;
      const m = s.m;
      if (s.st !== 'idle' && (!m || m.state === 'done' || m.state === 'failed' || u.missionId !== m.id)) {
        s.st = 'idle';
        s.m = null;
      }
      switch (s.st) {
        case 'idle': {
          let best = null, bs = -1e9;
          for (const q of sim.missions) {
            if (q.kind === 'sos' || s.skip.has(q.id) || q.state === 'done' || q.state === 'failed') continue;
            if (q.kind === 'barrage' ? q.units.includes(id) : q.state !== 'open' || q.units.length) continue;
            if (!sim.crews.canServe(u, q)) continue;
            const sc = sim.crews.score(u, q) + (q.targetId === 'M1' || q.targetId === 'M3' ? 40 : 0);
            if (sc > bs) {
              bs = sc;
              best = q;
            }
          }
          if (!best) break;
          sim.command(id, 'mission', { id: best.id });
          s.m = best;
          s.seen = 0;
          s.ranged = 0;
          s.series = 0;
          s.lift = best.lift;
          s.st = best.kind === 'barrage' ? 'barrage' : best.state === 'ffe' ? 'ffe' : 'ranging';
          if (best.kind === 'barrage') sim.command(id, 'fire', {});
          s.wait = now + 1;
          break;
        }
        case 'ranging':
          if (!u.order.ok) {
            s.skip.add(m.id);
            sim.director.release(u);
            s.st = 'idle';
          } else if (u.pieces.some((p) => p.state === 'ready' && !p.blocked)) {
            sim.command(id, 'rounds', { n: 1 });
            sim.command(id, 'fire', {});
            s.ranged++;
            s.st = 'await';
            s.dl = now + (u.order.tof || 30) + 40;
          }
          break;
        case 'await': {
          const mine = m.reports.filter((r) => r.unitId === id && !r.wild);
          if (mine.length > s.seen && !u.firing) {
            const r = mine[mine.length - 1];
            s.seen = mine.length;
            if (r.ok || s.ranged >= 6) s.st = 'ffe';
            else {
              if (r.observed && r.corr) sim.command(id, 'correct', { add: r.corr.add, right: r.corr.right });
              s.st = 'ranging';
            }
            s.wait = now + 1.5;
          } else if (now > s.dl) s.st = s.ranged >= 4 ? 'ffe' : 'ranging';
          break;
        }
        case 'ffe':
          if (u.pieces.some((p) => p.state === 'ready' && !p.blocked)) {
            const t = m.targetId ? sim.targetById(m.targetId) : null;
            const n = FFE[u.kind][m.kind === 'wire' ? 'wire' : t ? t.kind : 'sos'] ?? 4;
            sim.command(id, 'rounds', { n });
            sim.command(id, 'fire', {});
            s.series++;
            s.st = 'firing';
          }
          break;
        case 'firing':
          if (!u.firing) {
            if (s.series >= 5) {
              s.skip.add(m.id);
              sim.director.release(u);
              s.st = 'idle';
            } else s.st = 'ffe';
          }
          break;
        case 'barrage':
          if (m.lift !== s.lift) {
            s.lift = m.lift;
            sim.command(id, 'mission', { id: m.id });
            sim.command(id, 'fire', {});
          } else if (!u.firing) sim.command(id, 'fire', {});
          break;
      }
    }
  };
}

const PLAYERS = {
  auto: null,
  player: () => playerFor(['bl15', 'bl92', 'bl6']),
  full: () => playerFor(['bl15', 'bl92', 'bl6', 'bl60', 'rail']),
};
const playerName = { auto: 'all auto', player: 'scripted 15in + 9.2in + 6in', full: 'scripted all five' };

// ---------------------------------------------------------------- one game
function run(seed, player, difficulty, fullLog = false) {
  const sim = new Sim({ heightAt, seed });
  sim.newGame({ difficulty, seed });
  const log = [];
  sim.events.radio = (text, kind) => log.push(`${sim.time.toFixed(0).padStart(5)}s ${kind.padEnd(5)} ${text}`);
  const mlog = [];
  sim.events.mission = (m, c) => { if (process.env.MIS && (c === 'done' || c === 'failed')) mlog.push(`${m.tEnd?.toFixed(0)}s ${m.kind} ${m.targetId ?? m.sector ?? ''} ${c} (opened ${m.t0.toFixed(0)}s, rounds ${m.rounds}, reports ${m.reports.length})`); };
  sim.events.report = (m, r) => fullLog && log.push(`${sim.time.toFixed(0).padStart(5)}s report ${r.text}`);
  const script = PLAYERS[player]?.();
  let steps = 0, worst = 0, total = 0, scriptT = 0;
  const occ = {};
  while (sim.state === 'playing' && sim.time < 4000) {
    if (script && (scriptT -= 0.05) <= 0) {
      scriptT = 0.5;
      script(sim);
    }
    const t0 = performance.now();
    sim.update(0.05);
    const ms = performance.now() - t0;
    total += ms;
    if (steps > 200) worst = Math.max(worst, ms);
    steps++;
    if (process.env.DBG && steps % 200 === 0 && sim.time > +process.env.DBG) { const u = sim.unitById(+process.env.DBGU || 1); console.log(sim.time.toFixed(0), u.mode, 'sig', u.signature.toFixed(2), 'uf', (sim.time - u.underFire).toFixed(0), 'mission', u.missionId, 'ok', u.order.ok, u.pieces.map((p) => p.state).join(), 'ammo', u.ammo.he, 'open', sim.missions.filter((m) => m.state === 'open').map((m) => m.id + m.kind + (sim.crews.canServe(u, m) ? '+' : '-')).join(), 'pieces', u.pieces.map((p) => p.state).join()); }
    if (process.env.ZDBG && sim.barrage && steps % 600 === 0) console.log(sim.time.toFixed(0), 'k', sim.barrage.k, sim.infantry.filter((g) => g.side === 'british').map((g) => g.state[0] + g.n + '@' + g.pos.x.toFixed(0) + '/bx' + sim.barrage.xAt(g.pos.z).toFixed(0)).join(' '), 'wires', sim.targetAI.wires.map((w) => w.cut.toFixed(2)).join(), 'ready', sim.units.map((u) => u.pieces.filter((p) => p.state === 'ready' || p.state === 'recoil').length).join(), 'firing', sim.units.map((u) => (u.firing ? 1 : 0)).join(''));
    if (steps % 20 === 0) for (const u of sim.units) for (const p of u.pieces) { const k = u.id + ':' + p.state; occ[k] = (occ[k] ?? 0) + 1; }
  }
  const st = sim.stats;
  const tstat = sim.targets.map((t) => t.id + (t.alive ? '+' : 'x')).join(' ');
  const mis = Object.fromEntries(Object.entries(st.missions));
  const sosResp = st.sos.map((s) => s.resp).filter((x) => x != null);
  const lostPieces = st.piecesLost;
  const out = [];
  out.push(`\n=== seed ${seed}, ${playerName[player]}, ${difficulty}: ${sim.state.toUpperCase()} in phase ${sim.phase}, ${(sim.time / 60).toFixed(1)} min`);
  out.push(`score ${sim.score.points}, targets destroyed ${sim.score.kills}, missions done ${sim.score.missions} failed ${sim.score.failed}, rounds ${st.rounds} (${(st.rounds / Math.max(1, sim.score.kills)).toFixed(1)} per kill), CB rounds against us ${st.cbRounds}`);
  out.push(`pieces lost ${lostPieces}, sectors lost ${st.sectorsLost}, front ${JSON.stringify(sim.front)}, men killed ${st.menKilled}, British lost ${st.britishLost}${sim.zero ? `, zero: ${sim.zero.survivors ?? '-'} of ${sim.zero.n0} on the objective, losses ${Object.entries(st.lossBy).map(([k, v]) => k + ' ' + v.toFixed(0)).join(' ')}` : ''}`);
  out.push(' targets: ' + tstat);
  out.push(' missions: ' + Object.entries(mis).map(([k, v]) => `${k} ${v.done}/${v.new}`).join(', '));
  out.push(' sos: ' + (st.sos.map((s) => `${s.sector} resp ${s.resp == null ? '-' : s.resp.toFixed(0) + 's'} ${s.held ? 'held' : 'BREACH'} (${s.left}/${s.n0})`).join('; ') || '-'));
  out.push(' units: ' + sim.units.map((u) => `${u.id} ${u.alive ? 'ok' : 'DEAD'} rounds ${u.stats.rounds} kills ${u.stats.kills} guns ${u.pieces.filter((p) => p.state !== 'dead').length}/${u.pieces.length} ammo ${u.ammo.he}`).join(', '));
  if (process.env.MIS) out.push(mlog.join('\n'));
  if (process.env.OCC) out.push(' occupancy: ' + Object.entries(occ).map(([k, v]) => k + '=' + v).join(' '));
  return {
    seed, player, difficulty, text: out.join('\n'), log: (fullLog ? log : log.slice(0, 80)).join('\n'),
    win: sim.state === 'victory', phase: sim.phase, time: sim.time, missions: mis, sosResp, sos: st.sos, rounds: st.rounds,
    kills: sim.score.kills, lost: lostPieces, sectors: st.sectorsLost, avg: total / steps, worst,
    unitKills: sim.units.map((u) => u.stats.kills), unitRounds: sim.units.map((u) => u.stats.rounds),
    zero: sim.zero ? (sim.zero.survivors ?? 0) / sim.zero.n0 : null, state: sim.state,
  };
}

// ---------------------------------------------------------------- workers and the summary
if (!isMainThread) {
  parentPort.on('message', (job) => {
    if (!job) return process.exit(0);
    parentPort.postMessage(run(job.seed, job.player, job.difficulty, job.log));
  });
} else {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const seeds = args.filter((a, i) => /^\d+$/.test(a) && !/^--(jobs|difficulty|players)$/.test(args[i - 1] ?? '')).map(Number);
  const dOpt = opt('--difficulty', 'Normal');
  const difficulties = dOpt === 'all' ? ['Easy', 'Normal', 'Hard'] : dOpt.split(',');
  const players = flag('--all') ? ['auto', 'player', 'full'] : flag('--both') ? ['auto', 'player'] : opt('--players', 'auto').split(',');
  const quiet = flag('--quiet'), table = flag('--table');
  const jobs = [];
  for (const difficulty of difficulties) for (const player of players) for (const seed of seeds.length ? seeds : [1, 2, 3]) jobs.push({ seed, player, difficulty, log: flag('--log') });
  const nWorkers = Math.max(1, Math.min(jobs.length, Number(opt('--jobs', Math.min(12, os.cpus().length - 2)))));
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: nWorkers }, () => new Promise((resolve) => {
    const w = new Worker(new URL(import.meta.url));
    let idx = -1;
    const feed = () => {
      if (next >= jobs.length) {
        w.postMessage(null);
        return resolve();
      }
      idx = next++;
      w.postMessage(jobs[idx]);
    };
    w.on('message', (r) => {
      results[idx] = r;
      feed();
    });
    w.on('error', (e) => {
      console.error(e);
      resolve();
    });
    feed();
  })));

  if (!table) for (const r of results) {
    if (!r) continue;
    console.log(r.text);
    if (!quiet) console.log(r.log);
  }
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const f1 = (x) => x.toFixed(1);
  console.log('\n======== summary, means over seeds ========');
  for (const difficulty of difficulties) for (const player of players) {
    const rs = results.filter((r) => r && r.difficulty === difficulty && r.player === player);
    if (!rs.length) continue;
    const kinds = [...new Set(rs.flatMap((r) => Object.keys(r.missions)))];
    const sosAll = rs.flatMap((r) => r.sos);
    console.log(`\n${difficulty}, ${playerName[player]}: won ${rs.filter((r) => r.win).length}/${rs.length}, ` +
      `ended in phase [${rs.filter((r) => !r.win).map((r) => r.phase).join(' ') || '-'}], ${f1(mean(rs.map((r) => r.time / 60)))} min, ` +
      `pieces lost ${f1(mean(rs.map((r) => r.lost)))}, sectors lost ${f1(mean(rs.map((r) => r.sectors)))}, rounds/kill ${f1(mean(rs.map((r) => r.rounds / Math.max(1, r.kills))))}, ` +
      `step ${mean(rs.map((r) => r.avg)).toFixed(3)} ms (worst ${Math.max(...rs.map((r) => r.worst)).toFixed(1)})`);
    console.log('  missions done/new per game: ' + kinds.map((k) => `${k} ${f1(mean(rs.map((r) => r.missions[k]?.done ?? 0)))}/${f1(mean(rs.map((r) => r.missions[k]?.new ?? 0)))}`).join(', '));
    const resp = sosAll.map((s) => s.resp).filter((x) => x != null);
    console.log(`  SOS: ${sosAll.length} calls, response ${resp.length ? f1(mean(resp)) : '-'} s, held ${sosAll.filter((s) => s.held).length}, breached ${sosAll.filter((s) => !s.held).length}`);
    const zr = rs.filter((r) => r.zero != null);
    if (zr.length) console.log(`  Zero hour reached in ${zr.length} games, ${f1(mean(zr.map((r) => r.zero)) * 100)}% of the infantry on the objective on average`);
    console.log('  kills by unit (1 60pdr, 2 6in, 3 9.2in, 4 15in, 5 rail): ' + [0, 1, 2, 3, 4].map((i) => f1(mean(rs.map((r) => r.unitKills[i])))).join(' ') + ' | rounds ' + [0, 1, 2, 3, 4].map((i) => Math.round(mean(rs.map((r) => r.unitRounds[i])))).join(' '));
  }
}

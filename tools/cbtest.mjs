// The British counter-battery fire on the ridge's threat levels, headless (DESIGN.md "Ranging counter-battery"):
//   node tools/cbtest.mjs [--levels 1,3,5] [--seeds 12] [--jobs N] [--cb ranging|old] [--policy auto|none|cover] [--quiet 0.5]
//                         [--lineup max38:1,sfh13:2]
// Each level's reference lineup (capability.js REFERENCE; --lineup kind:guns,... in its place on every level, no
// upgrades), every crew on auto (a stand-in for a player who fires steadily).
// Counts the CB rounds, where they land, what they do. The ranging model (sim.cbModel) is the levels' default; --cb old
// plays the old drizzle. --policy auto (the default): the crews take cover by their own rule (ww1/crews.js CREW_COVER);
// none: they never do; cover: the scripted rule of the prototype (the crews' own off): a battery takes cover when its
// stage turns 'bracketed' or fire for effect is called on it out of cover, and leaves when the engagement is dropped or
// 40 s after its fire for effect ends; --quiet x: a battery holds fire whenever its signature passes x (the old model's
// free answer). LOG=1 prints the radio lines.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
const R = new URL('../src/', import.meta.url).href;
const { Sim } = await import(R + 'sim/sim.js');
const { loadoutOf } = await import(R + 'research.js');
const { ww1Theatre } = await import(R + 'ww1/theatre.js');
const { RIDGE_WW2, RIDGE_MORE } = await import(R + 'ww1/ops.js');
const { REFERENCE } = await import(R + 'capability.js');
const { SHELLS } = await import(R + 'sim/tables.js');

let heightAt, groundKindAt;
async function stage() {
  // (every career battery's pads, RIDGE_MORE too, before the ground is sampled: terrainHeight.js reads them once, so
  // with some left out a seed's result depended on the games its worker ran before it)
  ww1Theatre('ridge', { kinds: [...RIDGE_WW2, ...RIDGE_MORE].map((u) => u.kind) });
  ({ heightAt, groundKindAt } = await import(R + 'terrainHeight.js'));
}

function run({ seed, level, quiet, cb, policy, lineup }) {
  const lv = lineup ? Object.fromEntries(lineup.split(',').map((q) => q.split(':')).map(([k, n]) => [k, { guns: +(n ?? 1) }])) : REFERENCE[level];
  const sim = new Sim({ heightAt, groundAt: groundKindAt, seed, theatre: ww1Theatre('ridge', { kinds: Object.keys(lv) }) });
  sim.newGame({ seed, loadout: loadoutOf(lv), level, cbModel: cb });
  for (const u of sim.units) u.mode = 'auto';
  if (policy !== 'auto') sim.crews.cover = false;
  const s = { cb: 0, near25: 0, near60: 0, near150: 0, hits: 0, dmg: 0, cas: 0, lost: 0, firstHit: null, firstCb: null, sigT: [0, 0, 0], T: 0, men0: 0, hp0: 0, guns0: 0, incoming: 0, byKind: {} };
  for (const u of sim.units) for (const p of u.pieces) { s.men0 += p.crew; s.hp0 += p.hp; s.guns0++; }
  const ev = sim.events;
  Object.assign(s, { covers: 0, coverT: 0, stages: { ranging: 0, closing: 0, bracketed: 0, ffe: 0 }, lines: [] });
  const leave = new Map(); // unit id -> when to leave cover
  ev.cbStage = (u, st, info) => {
    if (st) s.stages[st]++;
    if (policy !== 'cover') return;
    const was = u._was ?? null;
    u._was = st;
    if (st === 'bracketed' && was !== 'ffe') { sim.command(u.id, 'cover', { on: true }); leave.delete(u.id); }
    else if (st === 'ffe') { sim.command(u.id, 'cover', { on: true }); leave.delete(u.id); }
    else if (st === 'bracketed' && was === 'ffe') leave.set(u.id, sim.time + 40);
    else if (st == null) leave.set(u.id, sim.time);
  };
  ev.cover = (u, on) => { if (on) s.covers++; };
  if (process.env.LOG) ev.radio = (text, kind) => { if (/ranging on us|closing in|bracketed|fire for effect|lost us|rangers:|spoiled|Deckung|Gegenbatterie/.test(text)) s.lines.push(`${(sim.time / 60).toFixed(1).padStart(5)} [${kind}] ${text}`); };
  const hit0 = ev.pieceHit, cas0 = ev.casualty, lost0 = ev.pieceDestroyed, inc0 = ev.incoming;
  ev.pieceHit = (u, p) => { s.hits++; if (s.firstHit == null) s.firstHit = sim.time; hit0?.(u, p); };
  ev.casualty = (u, p) => { s.cas++; cas0?.(u, p); };
  ev.pieceDestroyed = (u, p) => { s.lost++; lost0?.(u, p); };
  ev.incoming = (sh) => { s.incoming++; inc0?.(sh); };
  // every CB round: the enemy sets _cb while it launches one
  const en = sim.enemyAI, launch = en.launch.bind(en);
  const cbShells = new Set();
  en.launch = (...a) => { const sh = launch(...a); if (en._cb && sh) { cbShells.add(sh); s.cb++; if (s.firstCb == null) s.firstCb = sim.time; s.byKind[sh.kind] = (s.byKind[sh.kind] ?? 0) + 1; } return sh; };
  const b0 = ev.shellBurst;
  ev.shellBurst = (sh, p, info) => {
    if (cbShells.has(sh)) {
      cbShells.delete(sh);
      let d = 1e9;
      for (const u of sim.units) if (u.alive) for (const q of u.pieces) if (q.state !== 'dead') d = Math.min(d, Math.hypot(q.pos.x - p.x, q.pos.z - p.z));
      if (d < 25) s.near25++;
      if (d < 60) s.near60++;
      if (d < 150) s.near150++;
    }
    b0?.(sh, p, info);
  };
  const dmg0 = sim.guns.damagePiece.bind(sim.guns);
  sim.guns.damagePiece = (u, p, dmg, direct) => { const h = p.hp; dmg0(u, p, dmg, direct); s.dmg += h - p.hp; };
  if (quiet) {
    // a player who never lets a battery get loud: holds fire whenever the signature passes `quiet`
    const up = sim.update.bind(sim);
    sim.update = (dt) => { for (const u of sim.units) if (u.alive && u.signature > quiet && u.mode === 'auto') { u.mode = 'hold'; sim.guns.cease(u); } else if (u.mode === 'hold' && u.signature < quiet * 0.5) u.mode = 'auto'; up(dt); };
  }
  while (sim.state === 'playing' && sim.time < 7200) {
    sim.update(0.05);
    for (const [id, at] of leave) if (sim.time >= at) { leave.delete(id); sim.command(id, 'cover', { on: false }); }
    for (const u of sim.units) if (u.alive && u.cover) s.coverT += 0.05;
    let fs = 0;
    for (const u of sim.units) if (u.alive) fs = Math.max(fs, u.signature);
    s.T += 0.05;
    if (fs >= 0.2) s.sigT[0] += 0.05;
    if (fs >= 0.5) s.sigT[1] += 0.05;
    if (fs >= 0.8) s.sigT[2] += 0.05;
  }
  const cs = sim.enemyAI.cbStats ?? {}, mc = sim.stats.missions.cb ?? { new: 0, done: 0, failed: 0 };
  const bats = sim.targets.filter((t) => t.battery);
  return { seed, level, won: sim.state === 'victory', min: sim.time / 60, ...s, eng: cs.engagements ?? 0, ffes: cs.ffes ?? 0, lostUs: cs.lost ?? 0, spoiled: cs.spoiled ?? 0,
    shifts: cs.shifts ?? 0, cut: cs.cut ?? 0, r1: cs.firstRound ?? null, f1: cs.firstFall ?? null, x1: cs.firstFfe ?? null, open: en.openAt ?? null, model: sim.cbModel ?? 'old', why: sim.over?.title ?? '', toFfe: [...(cs.toFfe ?? []), ...(cs.toFfeClean ?? [])], toFfeClean: cs.toFfeClean ?? [], duels: (sim.objectives?.list ?? []).filter((o) => o.kind === 'duel').length, duelsDone: (sim.objectives?.list ?? []).filter((o) => o.kind === 'duel' && o.state === 'done').length,
    placed: bats.filter((t) => t.rangers?.placed).length, placedN: bats.filter((t) => t.rangers?.placed).map((t) => t.rangers.heard), bats: bats.length, cbNew: mc.new, cbDone: mc.done, cbFailed: mc.failed,
    menLost: sim.stats.menKilled, guns: sim.stats.piecesLost };
}

if (!isMainThread) {
  await stage();
  parentPort.on('message', (job) => parentPort.postMessage(job ? run(job) : null));
} else {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const levels = opt('--levels', '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
  const nSeeds = +opt('--seeds', 12), quiet = opt('--quiet', null) ? +opt('--quiet') : null;
  const cb = opt('--cb', null), policy = opt('--policy', 'auto'), lineup = opt('--lineup', null);
  const jobs = [];
  for (const level of levels) for (let seed = 1; seed <= nSeeds; seed++) jobs.push({ seed, level, quiet, cb, policy, lineup });
  const n = Math.min(jobs.length, +opt('--jobs', 8));
  const results = [];
  await new Promise((done) => {
    let next = 0, live = n;
    for (let w = 0; w < n; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      worker.on('message', (r) => { if (r) results.push(r); if (next < jobs.length) worker.postMessage(jobs[next++]); else { worker.terminate(); if (--live === 0) done(); } });
      worker.on('error', (e) => { console.error(e); process.exitCode = 1; });
      worker.postMessage(jobs[next++] ?? null);
    }
  });
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  for (const r of results) if (r.lines.length) console.log(`--- level ${r.level} seed ${r.seed}\n${r.lines.join('\n')}`);
  console.log(`cb ${results[0]?.model ?? cb}, policy ${policy}, quiet ${quiet ?? 'off'}, ${nSeeds} seeds`);
  console.log('lv  won  min  | CB/min  loud>=.2 >=.5 >=.8 | <25m <60m <150m of CB | hits/min  hp lost%  guns lost/game  men down%  1st CB  1st hit');
  for (const level of levels) {
    const rs = results.filter((r) => r.level === level);
    const T = sum(rs, (r) => r.T), cb = sum(rs, (r) => r.cb);
    const pct = (x) => `${(100 * x).toFixed(0)}%`.padStart(4);
    const mm = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? `${(v[v.length >> 1] / 60).toFixed(1)}m` : '-'; };
    const kinds = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.byKind)) kinds[k] = (kinds[k] ?? 0) + v;
    console.log(`${String(level).padStart(2)}  ${String(rs.filter((r) => r.won).length).padStart(2)}/${rs.length} ${(T / rs.length / 60).toFixed(0).padStart(3)}  | ${(cb / (T / 60)).toFixed(2).padStart(5)}   ${pct(sum(rs, (r) => r.sigT[0]) / T)} ${pct(sum(rs, (r) => r.sigT[1]) / T)} ${pct(sum(rs, (r) => r.sigT[2]) / T)} | ${pct(sum(rs, (r) => r.near25) / Math.max(1, cb))} ${pct(sum(rs, (r) => r.near60) / Math.max(1, cb))} ${pct(sum(rs, (r) => r.near150) / Math.max(1, cb))}       | ${(sum(rs, (r) => r.hits) / (T / 60)).toFixed(2).padStart(5)}    ${pct(sum(rs, (r) => r.dmg) / sum(rs, (r) => r.hp0))}      ${(sum(rs, (r) => r.lost) / rs.length).toFixed(2).padStart(4)} of ${(sum(rs, (r) => r.guns0) / rs.length).toFixed(0)}     ${pct(sum(rs, (r) => r.cas) / sum(rs, (r) => r.men0))}    ${mm(rs.map((r) => r.firstCb))}  ${mm(rs.map((r) => r.firstHit))}   ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(' ')}`);
  }
  console.log('lv  won  min | guns lost  men down (of)   | engagements  FFEs  lost us  spoiled  1st round to FFE (median, min..max) | placed of bats (rounds heard, median)  GB new done failed | in cover: times, min/game | stage events r/c/b/f');
  const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[v.length >> 1] : NaN; };
  for (const level of levels) {
    const rs = results.filter((r) => r.level === level), n = rs.length, av = (f) => (sum(rs, f) / n).toFixed(1);
    const tf = rs.flatMap((r) => r.toFfe), tc = rs.flatMap((r) => r.toFfeClean), pn = rs.flatMap((r) => r.placedN);
    console.log(`${String(level).padStart(2)}  ${String(rs.filter((r) => r.won).length).padStart(2)}/${n} ${av((r) => r.min).padStart(4)} | ${av((r) => r.lost).padStart(4)} of ${av((r) => r.guns0)}  ${av((r) => r.cas).padStart(5)} (${av((r) => r.men0)}) | shifts ${av((r) => r.shifts)} cut short ${av((r) => r.cut)} | ${av((r) => r.eng).padStart(5)}  ${av((r) => r.ffes).padStart(5)}  ${av((r) => r.lostUs).padStart(5)}  ${av((r) => r.spoiled).padStart(5)}   ${tf.length ? `${(med(tf) / 60).toFixed(1)} min (${(Math.min(...tf) / 60).toFixed(1)}..${(Math.max(...tf) / 60).toFixed(1)}; undisturbed ${tc.length ? (med(tc) / 60).toFixed(1) : '-'}, ${tc.length} of ${tf.length})` : '-'} duels ${av((r) => r.duels)} done ${av((r) => r.duelsDone)} | ${av((r) => r.placed)} of ${av((r) => r.bats)} (${pn.length ? med(pn) : '-'})  ${av((r) => r.cbNew)} ${av((r) => r.cbDone)} ${av((r) => r.cbFailed)} | ${av((r) => r.covers)}, ${av((r) => r.coverT / 60)} | ${['ranging', 'closing', 'bracketed', 'ffe'].map((k) => av((r) => r.stages[k])).join('/')}`);
  }
  // the opening: when their fire opens, its first ranging round and fall, the first fire for effect (medians, min)
  console.log('lv | opens  1st round  1st fall  1st FFE (median min, range)  games with an FFE | losses');
  for (const level of levels) {
    const rs = results.filter((r) => r.level === level), q = (f) => { const v = rs.map(f).filter((x) => x != null); return v.length ? `${(med(v) / 60).toFixed(1)} (${(Math.min(...v) / 60).toFixed(1)}..${(Math.max(...v) / 60).toFixed(1)})` : '-'; };
    const why = {};
    for (const r of rs) if (!r.won) why[r.why] = (why[r.why] ?? 0) + 1;
    console.log(`${String(level).padStart(2)} | ${q((r) => r.open)}  ${q((r) => r.r1)}  ${q((r) => r.f1)}  ${q((r) => r.x1)}  ${rs.filter((r) => r.x1 != null).length}/${rs.length} | ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
}

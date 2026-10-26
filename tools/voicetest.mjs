// Headless check of the German crew voices (src/ww2/voices.js): plays a WW2 or WW1 German battle in real time without
// drawing, records every line the voices speak and checks the order rules.
//   node tools/voicetest.mjs [--op flanders|karl|sevastopol|v1|v2|ridge|paris] [--unit N] [--seconds S] [--scale K] [--then N:S,...]
// --unit is the 1-based unit id selected first (default 1), --seconds how long it is watched (wall clock, default 200),
// --scale the time compression (default 1), --then further units and their seconds ("5:180,2:60"); --player puts a
// scripted player on the selected battery (it takes the nearest open mission it can serve, ranges with one gun, applies
// each report's correction and fires for effect on "on target"; a special weapon such as the Karl is put on AUTO, so its
// crew drives, emplaces and fires it), otherwise the battery's own crew works. On a page without
// voices (sevastopol, v1, v2, paris) it checks that there are none. On the WW1 open battle (ridge, 1918, the same clips)
// it also fails on a WW2-only line: the radio (fu_), "Panzer" (m_tanks), the counter-attack (m_barrage). Needs the dev server on port 5201 (as tools/shot.mjs); the
// browser is throwaway and has the career's dev mode on, so every battery plays.
// Prints the lines in order ([wall s] [sim s] channel ids «German») and exits 1 on a console error or a broken rule:
// a fire command before its volley's "abgefeuert", a report after a shot, a new target's fire command (Feuerkommando)
// before the first fire order on it, and on each channel one line at a time.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const op = opt('--op', 'flanders'), unit = Number(opt('--unit', 1)), seconds = Number(opt('--seconds', 200)), scale = Number(opt('--scale', 1));
const then = (opt('--then', '') || '').split(',').filter(Boolean).map((s) => s.split(':').map(Number));
const player = args.includes('--player');
const WW1 = op === 'ridge' || op === 'paris', mode = WW1 ? 'ww1' : 'ww2';
const exe = ['chromium-1247', 'chromium-1217'].map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`)
  .concat(process.env.PLAYWRIGHT_BROWSERS_PATH ? [`${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`] : []).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => {
  const Orig = window.WebSocket;
  window.WebSocket = function (url, proto) {
    if (proto === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 };
    return new Orig(url, proto);
  };
  try { localStorage.removeItem('drumfire.voices'); } catch {}
  // the career's dev mode (as tools/shot.mjs --dev): every battery plays in the open battle, not only the earned ones
  try { localStorage.setItem('drumfire.campaign.v2', JSON.stringify({ completed: [], dev: true })); } catch {}
});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => { errors.push(e.message); console.log(`[pageerror] ${e.message}`); });

await page.goto(`http://localhost:5201/?mode=${mode}&op=${op}&play=1&unit=${unit}&quality=Low`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__drumfire?.state === 'playing', null, { timeout: 240000, polling: 500 });
const has = await page.evaluate(() => !!window.__drumfire.voices);
let fail = errors.length > 0;
if (!['flanders', 'karl', 'ridge'].includes(op)) {
  console.log(has ? `FAIL: the ${op} page has voices` : `ok: the ${op} page has no voices`);
  await browser.close();
  process.exit(has || fail ? 1 : 0);
}
if (!has) { console.log('FAIL: no voices on the page'); await browser.close(); process.exit(1); }

// real time, no drawing: the loop stopped, a frame of 50 ms every 50 ms (the speech runs on the wall clock)
await page.evaluate(({ scale, unit, player }) => {
  const d = window.__drumfire;
  d.renderer.setAnimationLoop(null);
  d.audio.start();
  d.setTimeScale(scale);
  d.select(unit - 1);
  window.__vt = setInterval(() => { try { d.frame(0.05, false); } catch (e) { console.error(e.message); } }, 50);
  window.__vtUnit = d.units[unit - 1].id;
  if (!player) return;
  // the scripted player: the console's commands on the selected battery, once a second of wall clock
  const sim = d.sim, seen = new Set();
  setInterval(() => {
    try {
      const u = sim.unitById(window.__vtUnit);
      if (!u?.alive) return;
      // a special weapon (the Karl drives, turns and lowers its hull first): its own crew works the drill
      if (u.def?.special) { if (u.mode !== 'auto') sim.command(u.id, 'mode', { mode: 'auto' }); return; }
      let m = u.missionId != null ? sim.missionById(u.missionId) : null;
      if (!m || m.state === 'done' || m.state === 'failed') {
        // an open mission first, else one another battery is on (the nearest)
        const open = sim.missions.filter((q) => (q.state === 'open' || q.state === 'ranging' || q.state === 'ffe') && q.kind !== 'sos' && q.kind !== 'barrage' && sim.crews.canServe(u, q));
        const d = (q) => Math.hypot(q.x - u.pos.x, q.z - u.pos.z) + (q.state === 'open' ? 0 : 1e5);
        open.sort((a, b) => d(a) - d(b));
        if (open[0]) sim.command(u.id, 'mission', { id: open[0].id });
        return;
      }
      const rep = m.reports.filter((r) => r.unitId === u.id && !seen.has(r)).pop();
      if (rep) {
        seen.add(rep);
        if (rep.ok) { sim.command(u.id, 'rounds', { n: u.kind === 'nbw41' ? 2 : 4 }); sim.command(u.id, 'fire', { guns: 'all' }); return; }
        // a cautious player: at most 300 m a correction (a wild one would take the aim off the mission's point)
        const c = (v) => Math.max(-300, Math.min(300, v));
        if (rep.corr && rep.over != null) sim.command(u.id, 'correct', { add: c(rep.corr.add), right: c(rep.corr.right) });
      }
      if (m.state === 'ffe' && !u.firing && u.pieces.some((p) => p.state === 'ready') && !sim.shells.some((sh) => sh.own && sh.unitId === u.id && sh.alive)) {
        sim.command(u.id, 'rounds', { n: u.kind === 'nbw41' ? 2 : 4 }); sim.command(u.id, 'fire', { guns: 'all' }); return;
      }
      if (!u.firing && u.pieces.some((p) => p.state === 'ready') && !sim.shells.some((sh) => sh.own && sh.unitId === u.id && sh.alive)
          && !sim.observers.queue.some((q) => q.u === u)) {
        sim.command(u.id, 'rounds', { n: 1 });
        sim.command(u.id, 'fire', { guns: 1 });
      }
    } catch (e) { console.error(e.message); }
  }, 1000);
}, { scale, unit, player });
const lines = await page.evaluate(() => window.__drumfire.voices.lines);
const watch = async (s) => { for (let t = 0; t < s; t += 10) await page.waitForTimeout(10000); };
await watch(seconds);
for (const [u, s] of then) {
  await page.evaluate((u) => { window.__drumfire.select(u - 1); window.__vtUnit = window.__drumfire.units[u - 1].id; }, u);
  console.log(`-- unit ${u} selected`);
  await watch(s);
}
const res = await page.evaluate(() => ({ log: window.__drumfire.voices.log, ctx: window.__drumfire.audio.ctx?.state, simT: window.__drumfire.sim.time, buffers: Object.keys(window.__drumfire.voices.buffers).length }));
await browser.close();

const dur = (e) => e.ids.reduce((s, id) => s + (lines[id]?.seconds ?? 0), 0) + 0.07 * (e.ids.length - 1);
const t0 = res.log[0]?.t ?? 0;
for (const e of res.log) console.log(`[${(e.t - t0).toFixed(1).padStart(6)}] [${e.sim.toFixed(0).padStart(5)}] ${e.ch.padEnd(3)} ${e.ids.join(' + ').padEnd(34)} «${e.de}»`);
console.log(`${res.log.length} lines, ${res.buffers} clips decoded, audio ${res.ctx}, sim ${res.simT.toFixed(0)} s`);
const bad = (why) => { fail = true; console.log(`FAIL: ${why}`); };
if (res.ctx !== 'running') bad(`the audio context is ${res.ctx}`);
// one line at a time on each channel
for (const ch of ['gun', 'tel']) {
  const L = res.log.filter((e) => e.ch === ch);
  for (let i = 1; i < L.length; i++) if (!L[i - 1].cut && L[i].t < L[i - 1].t + dur(L[i - 1]) - 0.05) bad(`${ch}: ${L[i].ids} started ${(L[i - 1].t + dur(L[i - 1]) - L[i].t).toFixed(2)} s before ${L[i - 1].ids} ended`);
}
const isFire = (e) => e.ch === 'gun' && e.ids.some((id) => /^f_/.test(id));
// "abgefeuert" follows a fire command within a few seconds (the command goes out as the volley does)
for (const e of res.log.filter((x) => /^shot/.test(x.ids[0]))) {
  if (!res.log.some((f) => isFire(f) && f.t <= e.t + 0.5 && f.t > e.t - 12)) bad(`"${e.ids[0]}" at ${(e.t - t0).toFixed(1)} s without a fire command before it`);
}
// an observer's report answers a shot
for (const e of res.log.filter((x) => /^(vb|fu)_/.test(x.ids[0]) && !/_(hit|kill|kill_bty)$/.test(x.ids[0]))) {
  if (!res.log.some((s) => /^shot/.test(s.ids[0]) && s.t < e.t)) bad(`report ${e.ids} at ${(e.t - t0).toFixed(1)} s before any shot`);
}
// a new target's fire command comes before the first fire order on it
for (const k of res.log.filter((x) => x.ids[0] === 'kdo_new')) {
  const next = res.log.find((x) => x.t > k.t && (isFire(x) || x.ids[0] === 'kdo_new'));
  if (next && next.ids[0] === 'kdo_new' && next.t - k.t < 3) bad(`two Feuerkommandos within 3 s at ${(k.t - t0).toFixed(1)} s`);
}
const seen = (re) => res.log.some((e) => e.ids.some((id) => re.test(id)));
for (const [name, re] of [['a new fire mission', /^m_/], ['a Feuerkommando', /^kdo_/], ['a loading step', /^(s|w)_/], ['a ready report', /^(r_|w_r|bty_ready)/], ['a fire command', /^f_/], ['"abgefeuert"', /^shot/], ['an observer\'s report', /^(vb|fu)_/]]) {
  console.log(`${seen(re) ? 'ok  ' : 'MISS'} ${name}`);
}
// 1918: none of the WW2-only clips
if (WW1) for (const e of res.log) for (const id of e.ids) if (/^fu_/.test(id) || id === 'm_tanks' || id === 'm_barrage') bad(`a WW2 line in 1918: ${id} at ${(e.t - t0).toFixed(1)} s`);
if (errors.length) bad(`${errors.length} console error(s)`);
console.log(fail ? 'FAILED' : 'PASSED');
process.exit(fail ? 1 : 0);

// The basic training's card against a player who does not follow it (src/ww1/tutorial.js `training`), headless:
//   node tools/trainingtest.mjs [--cases normal,early,late,guncard,leave] [--jobs 3]
// Each case plays the lesson by its own demos (Tutorials.autoplay) and, at one step, misbehaves first:
//   normal          the lesson as written, twice
//   early:<step>    a console step: the next two steps' actions done too while the card still shows this one
//   late:<step>     any step with a goal: nothing done for 60 s of game time before the step's own action
//   guncard:<step>  a step at the gun: the gun card's prompt followed for 40 s instead of the lesson card (any post)
//   leave:<step>    a step at the gun: the player leaves the gun and mans it again
// A case passes when the lesson finishes with no step stalled (a step whose goal its demo could not reach within its
// limit). Needs the dev server on port 5201 (as tools/shot.mjs, which runs each job's page). Exits 1 on a failure.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WW1_TUTORIALS } from '../src/ww1/tutorial.js';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const kinds = opt('--cases', 'normal,early,late,guncard,leave').split(',');
const jobs = Math.max(1, +opt('--jobs', 3));
const S = WW1_TUTORIALS.find((d) => d.id === 'training').steps;
const at = (id) => S.findIndex((s) => s.id === id);
const CONSOLE = S.slice(at('take'), at('kill') + 1).map((s) => s.id);
const GUN = S.slice(at('lay'), at('fire2') + 1).map((s) => s.id);
const cases = [];
if (kinds.includes('normal')) cases.push({ kind: 'normal' }, { kind: 'normal' });
if (kinds.includes('early')) for (const id of CONSOLE.slice(0, -1)) cases.push({ kind: 'early', id });
if (kinds.includes('late')) for (const s of S) if (s.done && s.id !== 'look') cases.push({ kind: 'late', id: s.id });
if (kinds.includes('guncard')) for (const id of GUN) cases.push({ kind: 'guncard', id });
if (kinds.includes('leave')) for (const id of GUN) cases.push({ kind: 'leave', id });

// in the page: one case after another on the same lesson page, each from a fresh start of the lesson
const PAGE = (list) => `(() => {
  const D = window.__drumfire, T = D.tutorial, sim = D.sim, S = T.defs.find((d) => d.id === 'training').steps;
  const KEYS = { E: { work: true }, A: { az: 1 }, D: { az: -1 }, W: { el: 1 }, S: { el: -1 } };
  const idx = (id) => S.findIndex((s) => s.id === id);
  // the gun card's prompt, at whichever post it names (tools/rangetest.mjs's player)
  const gunCard = () => {
    const st = sim.gunner.st;
    if (!st) return;
    const n = st.next, inp = { az: 0, el: 0, fine: false, work: false };
    if (n && !n.wait && n.key && n.post !== st.post) sim.command(st.unitId, 'post', { post: n.post });
    else if (n?.key) Object.assign(inp, KEYS[n.key] ?? {});
    T.gunInput = inp;
  };
  const out = [];
  for (const c of ${JSON.stringify(list)}) {
    T.start('training');
    T.auto = { scale: 6, idle: 0, resolve: null };
    const k = c.id ? idx(c.id) : -1;
    let did = false, hold = 0, n = 0, left = 0;
    while (T.run && !T.run.finished && n++ < 60000) {
      if (!did && T.run.i === k) {
        if (c.kind === 'early') for (const s of [S[k + 1], S[k + 2]]) s?.demo?.(T);
        else if (c.kind === 'late' || c.kind === 'guncard') {
          const a = T.auto; T.auto = null; // (the card's own demo stands aside: the player does something else)
          for (hold = 0; hold < (c.kind === 'late' ? 60 : 40) && T.run.i === k; hold += 0.05 * D.params.timeScale) {
            if (c.kind === 'guncard') gunCard(); else T.gunInput = { az: 0, el: 0, fine: false, work: false };
            D.frame(0.05, false);
          }
          T.gunInput = null;
          T.auto = a;
          did = true;
        } else if (c.kind === 'leave' && sim.gunner.st) {
          sim.command(sim.gunner.st.unitId, 'unman');
          for (left = 0; left < 20; left++) D.frame(0.05, false);
          sim.command(11, 'man', { piece: 0, post: 'lay', assist: true });
          did = true;
        }
      }
      if (c.kind === 'early' && T.run.i > k + 2) did = true;
      D.frame(0.05, false);
    }
    const r = T.report;
    out.push({ c: c.kind + (c.id ? ':' + c.id : ''), ok: !!T.run?.finished && !(r?.stalled?.length), stalled: r?.stalled ?? ['(unfinished at ' + T.step?.id + ')'], t: r?.simTime });
  }
  return out;
})()`;

const runJob = (list) => new Promise((resolve) => {
  const shot = fileURLToPath(new URL('./shot.mjs', import.meta.url));
  const p = spawn(process.execPath, [shot, '/?mode=ww1&tutorial=training&quality=Low', `shots/trainingtest-${Math.random().toString(36).slice(2, 7)}.png`,
    '--size', '800x500', '--until', 'window.__drumfire?.tutorial?.active', '--eval', PAGE(list)], { env: { CHROME: 'chromium-1217', ...process.env } });
  let text = '';
  p.stdout.on('data', (d) => (text += d));
  p.stderr.on('data', (d) => (text += d));
  p.on('close', () => {
    const line = text.split('\n').findIndex((l) => l.startsWith('[eval]'));
    try { resolve(JSON.parse(text.split('\n').slice(line).join('\n').replace(/^\[eval\]\s*/, '').split('\nsaved')[0])); } catch { resolve(list.map((c) => ({ c: c.kind + (c.id ? ':' + c.id : ''), ok: false, stalled: ['(page failed)'], err: text.slice(-600) }))); }
  });
});

const chunks = Array.from({ length: jobs }, (_, j) => cases.filter((_, i) => i % jobs === j)).filter((c) => c.length);
console.log(`${cases.length} cases in ${chunks.length} pages`);
const res = (await Promise.all(chunks.map(runJob))).flat();
for (const r of res) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.c.padEnd(20)} ${r.ok ? `${r.t} s` : `stalled: ${r.stalled.join(', ')}${r.err ? `\n${r.err}` : ''}`}`);
const bad = res.filter((r) => !r.ok);
console.log(bad.length ? `${bad.length} of ${res.length} failed` : `all ${res.length} passed`);
process.exit(bad.length ? 1 : 0);

// Follows the newest frame recorder session (perf/LATEST, src/perfrec.js) while someone plays on the dev server and
// prints a line when something goes wrong: a spike (one frame far longer than the frames before it; the spikes of the
// next 10 s are summed into one line) or a slow stretch (seconds whose middle frame is well over the session's usual).
// A new session (a page reload, another battle) is picked up by itself.
//   node tools/perfwatch.mjs [--quiet-start]
import fs from 'node:fs';
import path from 'node:path';
import { describe, analyse } from './perfreport.mjs';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'perf');
const BATCH = 10000; // ms: the spikes after the first are summed over this long
const fmt = (v) => (v == null ? '-' : v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const now = () => new Date().toTimeString().slice(0, 8);
const say = (s) => console.log(`${now()} ${s}`);

let file = null, offset = 0, rest = '';
let batch = null; // { until, n, worst }
let p50s = []; // the session's seconds' middle frames (the usual)
let slow = null; // { n, p50: [], cpu, gpu, stages: {}, shells, smoke, evn: {}, from }

function usual() {
  if (p50s.length < 5) return null;
  const v = p50s.slice().sort((a, b) => a - b);
  return v[Math.floor(v.length * 0.4)];
}

function onSpike(sp) {
  const t = Date.now();
  if (batch && t < batch.until) {
    batch.n++;
    if (sp.dur > batch.worst.dur) batch.worst = sp;
    return;
  }
  flushBatch();
  say(`SPIKE ${describe(sp)}`);
  batch = { until: t + BATCH, n: 0, worst: { dur: 0 } };
}
function flushBatch() {
  if (batch?.n) say(`+${batch.n} more spike window${batch.n > 1 ? 's' : ''} in ${BATCH / 1000} s, worst: ${describe(batch.worst)}`);
  batch = null;
}

function onSecond(s) {
  const u = usual();
  const bad = u != null && s.p50 > Math.max(20, u * 1.4);
  if (!bad) {
    if (s.t > 5 && s.st !== 'title') p50s.push(s.p50);
    if (p50s.length > 600) p50s.shift();
    if (slow) endSlow(u);
    return;
  }
  slow ??= { n: 0, p50: [], cpu: 0, gpu: [], stages: {}, shells: 0, smoke: 0, evn: {}, from: s.t, ctx: s };
  slow.n++;
  slow.p50.push(s.p50);
  slow.cpu += s.cpu;
  if (s.gpu != null) slow.gpu.push(s.gpu);
  for (const [k, v] of Object.entries(s.stages ?? {})) slow.stages[k] = (slow.stages[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.evn ?? {})) slow.evn[k] = (slow.evn[k] ?? 0) + v;
  slow.shells = Math.max(slow.shells, s.shells);
  slow.smoke = Math.max(slow.smoke, s.smoke);
  slow.scale = s.scale;
  if (slow.n >= 10) endSlow(u); // a long stretch is reported every 10 s
}
function endSlow(u) {
  const s = slow;
  slow = null;
  if (!s) return;
  const mid = s.p50.slice().sort((a, b) => a - b)[s.p50.length >> 1];
  const st = Object.entries(s.stages).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${fmt(v / s.n)}`).join(', ');
  const ev = Object.entries(s.evn).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${fmt(v / s.n)}/s`).join(', ');
  const gpu = s.gpu.length ? fmt(s.gpu.reduce((a, b) => a + b, 0) / s.gpu.length) : '-';
  const c = s.ctx;
  say(`SLOW ${s.n} s from ${fmt(s.from)} s: frames ${fmt(mid)} ms (usual ${fmt(u)}): cpu ${fmt(s.cpu / s.n)} [${st}] gpu ${gpu} res ${Math.round((s.scale ?? 1) * 100)}%` +
    ` | shells ${s.shells} smoke ${s.smoke}${ev ? ` | ${ev}` : ''} | ${c.st ?? ''} x${c.ts ?? 1} ${c.unit ?? ''} cam ${c.cam ?? ''}`);
}

let first = true;
function openSession(id) {
  const f = path.join(DIR, `${id}.jsonl`);
  if (f === file) return;
  flushBatch();
  if (slow) endSlow(usual());
  file = f;
  offset = 0;
  rest = '';
  p50s = [];
  // a session that was already over when the watch began is not replayed
  if (first && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs > 30000) offset = fs.statSync(f).size;
  first = false;
}

function poll() {
  try {
    const id = fs.readFileSync(path.join(DIR, 'LATEST'), 'utf8').trim();
    if (id) openSession(id);
  } catch { /* no session yet */ }
  if (file && fs.existsSync(file)) {
    const size = fs.statSync(file).size;
    if (size > offset) {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = size;
      const text = rest + buf.toString('utf8');
      const parts = text.split('\n');
      rest = parts.pop();
      for (const l of parts) {
        if (!l.trim()) continue;
        let o;
        try { o = JSON.parse(l); } catch { continue; }
        if (o.k === 'start') say(`SESSION ${o.session}: ${o.url} quality ${o.quality} ${o.w}x${o.h}@${o.dpr} gpu ${o.gpu}${o.gpuTimed ? ' (timed)' : ''}`);
        else if (o.k === 'sec') onSecond(o);
        else if (o.k === 'spike' && analyse(o)) onSpike(o);
        else if (o.k === 'gap') say(`GAP ${Math.round(o.dur)} ms at ${Math.round(o.t / 1000)} s: ${o.hidden ? 'window hidden' : o.blur ? 'window lost focus' : 'window showing and focused, a freeze'}`);
      }
    }
  }
  if (batch && Date.now() >= batch.until) flushBatch();
}

fs.mkdirSync(DIR, { recursive: true });
say(`watching ${DIR} (newest session in perf/LATEST)`);
setInterval(poll, 500);
poll();

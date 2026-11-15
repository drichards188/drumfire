// Sums a frame recorder session (src/perfrec.js, perf/<session>.jsonl from the dev server): the frame times minute by
// minute, the spikes by cause (which stage of the frame, the GPU, or outside the frame: garbage collection, other
// tasks, new shaders), the sim events seen round them, and the worst spikes one line each.
//   node tools/perfreport.mjs [session id | file]   (default: perf/LATEST)   [--worst N] [--json]
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'perf');

export function sessionFile(arg) {
  if (arg && fs.existsSync(arg)) return arg;
  const id = arg || (fs.existsSync(path.join(DIR, 'LATEST')) ? fs.readFileSync(path.join(DIR, 'LATEST'), 'utf8').trim() : null);
  if (!id) return null;
  return path.join(DIR, id.endsWith('.jsonl') ? id : `${id}.jsonl`);
}

export function readLines(file) {
  const out = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* a line cut short */ }
  }
  return out;
}

const fmt = (v) => (v == null ? '-' : v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The cause of a spike: its worst frame against the frames before it. */
export function analyse(sp) {
  const fr = sp.frames ?? [];
  const w = fr.find((f) => f.f === sp.worst) ?? fr.reduce((a, b) => (b.dur > a.dur ? b : a), fr[0]);
  if (!w) return null;
  const before = fr.filter((f) => f.f < w.f && f.dur > 0);
  const med = (k) => {
    const v = before.map(k).filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : 0;
  };
  const stages = Object.entries(w.s ?? {}).map(([k, v]) => [k, v - med((f) => f.s?.[k] ?? 0)]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
  const prev = fr.filter((f) => f.f < w.f).at(-1);
  const newProg = prev ? Math.max(0, w.prog - prev.prog) : 0;
  const newGeo = prev ? Math.max(0, w.geo - prev.geo) : 0;
  const newTex = prev ? Math.max(0, w.tex - prev.tex) : 0;
  const outside = Math.max(0, w.dur - w.cpu);
  const gpu = w.gpu;
  let cause;
  if (newProg) cause = 'shaders';
  else if (w.cpu >= w.dur * 0.6) cause = 'cpu';
  else if (gpu != null && gpu >= w.dur * 0.6) cause = 'gpu';
  else cause = 'outside';
  // the events of the spike frame and the second before it
  const ev = (sp.events ?? []).filter((e) => e.t >= w.t - 1000 && e.t <= w.t + w.dur);
  const counts = {};
  for (const e of ev) {
    const key = e.n + (e.c != null ? ` ${e.c}` : '');
    const c = (counts[key] ??= { n: 0, ms: 0, dmin: Infinity });
    c.n++;
    c.ms += e.ms ?? 0;
    if (e.d != null) c.dmin = Math.min(c.dmin, e.d);
  }
  const loaf = (sp.loaf ?? []).filter((l) => l.t + l.dur >= w.t && l.t <= w.t + w.dur);
  const scripts = loaf.flatMap((l) => l.scripts ?? []).filter((s) => s.type !== 'user-callback' || !/FrameRequestCallback/.test(s.inv));
  return { w, stages, cause, newProg, newGeo, newTex, outside, gpu, counts, scripts, usual: sp.usual, ctx: sp.ctx ?? {}, n: sp.spikes?.length ?? 1 };
}

/** One line for a spike. */
export function describe(sp, t0 = null) {
  const a = analyse(sp);
  if (!a) return 'spike without frames';
  const { w, ctx } = a;
  const st = a.stages.slice(0, 4).map(([k, v]) => `${k} +${fmt(v)}`).join(', ');
  const ev = Object.entries(a.counts).sort((x, y) => y[1].ms - x[1].ms || y[1].n - x[1].n).slice(0, 4)
    .map(([k, c]) => `${c.n}x ${k}${c.dmin < Infinity ? ` @${c.dmin}m` : ''}${c.ms >= 1 ? ` (${fmt(c.ms)} ms)` : ''}`).join('; ');
  const extra = [a.newProg && `${a.newProg} new shader${a.newProg > 1 ? 's' : ''}`, a.newGeo > 4 && `${a.newGeo} new geometries`, a.newTex && `${a.newTex} new textures`].filter(Boolean).join(', ');
  const sc = a.scripts.slice(0, 2).map((s) => `${s.fn || s.inv || '?'} ${fmt(s.ms)} ms ${s.src}`).join('; ');
  const where = `${ctx.st ?? ''}${ctx.sim != null ? ` game ${clock(ctx.sim)}` : ''} x${ctx.ts ?? 1} ${ctx.unit ?? ''} cam ${ctx.cam ?? ''}${ctx.dist != null ? ` ${ctx.dist} m` : ''}`.trim();
  return `${t0 != null ? `${clock((w.t) / 1000)} ` : ''}${fmt(w.dur)} ms frame (usual ${fmt(a.usual)}${a.n > 1 ? `, ${a.n} spikes` : ''}) ${a.cause.toUpperCase()}: cpu ${fmt(w.cpu)}${st ? ` [${st}]` : ''}` +
    `${w.ev >= 1 ? ` events ${fmt(w.ev)}` : ''} gpu ${fmt(a.gpu)} outside ${fmt(a.outside)}${extra ? ` | ${extra}` : ''}` +
    ` | shells ${w.shells} smoke ${w.smoke} glow ${w.glow} calls ${w.calls} ${w.ktris}k tris steps ${w.steps}${ev ? ` | ${ev}` : ''}${sc ? ` | scripts: ${sc}` : ''} | ${where}`;
}

function report(file, { worst = 12, json = false } = {}) {
  const lines = readLines(file);
  const start = lines.find((l) => l.k === 'start') ?? {};
  const secs = lines.filter((l) => l.k === 'sec');
  const spikes = lines.filter((l) => l.k === 'spike');
  if (json) return console.log(JSON.stringify({ start, secs: secs.length, spikes: spikes.map(analyse) }, null, 1));
  console.log(`session ${path.basename(file)}  ${start.at ?? ''}`);
  console.log(`  ${start.url ?? ''}  quality ${start.quality ?? '?'}  ${start.w}x${start.h} dpr ${start.dpr}  gpu ${start.gpu ?? '?'}${start.gpuTimed ? ' (timed)' : ' (untimed)'}`);
  if (!secs.length) return console.log('  no frames yet');
  const frames = secs.reduce((a, s) => a + s.n, 0);
  console.log(`  ${clock(secs.at(-1).t)} recorded, ${frames} frames, ${spikes.length} spike windows`);

  // minute by minute
  console.log('\nminute  fps  p50   p95   max    cpu  gpu   shells smoke  calls  state');
  const byMin = new Map();
  for (const s of secs) {
    const m = Math.floor(s.t / 60);
    const b = byMin.get(m) ?? { n: 0, fps: 0, p50: [], p95: [], max: 0, cpu: 0, gpu: [], shells: 0, smoke: 0, calls: 0, st: new Set() };
    b.n++; b.fps += s.fps; b.p50.push(s.p50); b.p95.push(s.p95); b.max = Math.max(b.max, s.max); b.cpu += s.cpu;
    if (s.gpu != null) b.gpu.push(s.gpu);
    b.shells = Math.max(b.shells, s.shells); b.smoke = Math.max(b.smoke, s.smoke); b.calls = Math.max(b.calls, s.calls);
    b.st.add(`${s.st}${s.ts > 1 ? ` x${s.ts}` : ''}`);
    byMin.set(m, b);
  }
  const mid = (v) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : null);
  for (const [m, b] of byMin) {
    console.log(`${String(m).padStart(5)}  ${String(Math.round(b.fps / b.n)).padStart(3)}  ${String(fmt(mid(b.p50))).padStart(4)}  ${String(fmt(mid(b.p95))).padStart(4)}  ${String(fmt(b.max)).padStart(5)}  ${String(fmt(b.cpu / b.n)).padStart(4)}  ${String(fmt(mid(b.gpu))).padStart(4)}  ${String(b.shells).padStart(6)} ${String(b.smoke).padStart(5)}  ${String(b.calls).padStart(5)}  ${[...b.st].join(', ')}`);
  }

  // the typical cost of each stage
  const stageMean = {};
  for (const s of secs) for (const [k, v] of Object.entries(s.stages ?? {})) stageMean[k] = (stageMean[k] ?? 0) + v * s.n;
  console.log('\nmean ms per frame by stage: ' + Object.entries(stageMean).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v / frames)}`).join(', '));

  // gaps too long to count as frames: a freeze, or the window hidden (sessions before 2026-11-15 have no gap lines,
  // only seconds missing from the summary)
  const gaps = lines.filter((l) => l.k === 'gap');
  if (gaps.length) {
    console.log('\ngaps over 0.5 s left out of the frame times:');
    for (const g of gaps) {
      const lo = (g.loaf ?? []).reduce((a, b) => (!a || b.dur > a.dur ? b : a), null);
      const page = !lo ? 'no frame report' : lo.block >= g.dur * 0.5 ? `the page busy ${fmt(lo.block)} ms` : 'the page idle, waiting on the browser';
      const win = g.hidden ? 'window hidden (switched away or minimised)' : g.blur ? 'window lost focus but showing' : 'window showing and focused: a freeze';
      console.log(`  ${clock(g.t / 1000)} ${fmt(g.dur)} ms, ${win}; ${page} | ${g.ctx?.unit ?? ''} cam ${g.ctx?.cam ?? ''}`);
    }
  } else {
    const miss = [];
    for (let i = 1; i < secs.length; i++) if (secs[i].t - secs[i - 1].t > 2.2) miss.push(`${clock(secs[i - 1].t)} to ${clock(secs[i].t)}`);
    if (miss.length) console.log(`\nseconds missing (a gap over 2.5 s or the window hidden; this session predates gap lines): ${miss.join(', ')}`);
  }

  if (!spikes.length) return;
  const an = spikes.map((sp) => ({ sp, a: analyse(sp) })).filter((x) => x.a);
  const causes = {};
  const blame = {};
  const evs = {};
  for (const { a } of an) {
    causes[a.cause] = (causes[a.cause] ?? 0) + 1;
    for (const [k, v] of a.stages) blame[k] = (blame[k] ?? 0) + v;
    if (a.outside > 8) blame['(outside the frame)'] = (blame['(outside the frame)'] ?? 0) + a.outside;
    for (const [k, c] of Object.entries(a.counts)) evs[k] = (evs[k] ?? 0) + c.n;
  }
  console.log(`\nspikes by cause: ${Object.entries(causes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log('excess ms in spike frames by stage: ' + Object.entries(blame).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${fmt(v)}`).join(', '));
  console.log('events round the spikes: ' + Object.entries(evs).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} x${v}`).join(', '));
  console.log(`\nworst ${Math.min(worst, an.length)}:`);
  for (const { sp } of an.sort((x, y) => y.a.w.dur - x.a.w.dur).slice(0, worst)) console.log('  ' + describe(sp, 0));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const worst = Number(opt('--worst', 12));
  const json = args.includes('--json');
  const file = sessionFile(args.filter((a) => !a.startsWith('--'))[0]);
  if (!file || !fs.existsSync(file)) {
    console.error('no session: play a game page on the dev server first (perf/LATEST names the newest)');
    process.exit(1);
  }
  report(file, { worst, json });
}

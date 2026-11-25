// What caused a lag spike, from a frame recorder spike line (src/perfrec.js): its worst frame against the frames
// before it. Pure, so the dev tools (tools/perfreport.mjs, tools/perfwatch.mjs) and the players' lag reports
// (src/telemetry.js) name causes the same way:
//   shaders  new shader programs were compiled in that frame
//   cpu      main's own frame code ran long (`stages`: which stage, by its excess over the usual)
//   gpu      the graphics card's time for the frame (timed only where the browser allows)
//   outside  the time went outside main's frame: garbage collection, the browser's own work, the driver

export const fmt = (v) => (v == null ? '-' : v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
export const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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

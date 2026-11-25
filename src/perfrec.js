// The frame recorder. It times every stage of main's frame, keeps the last frames in a ring, and when a frame runs long
// (a spike) it writes the two seconds before and half a second after, the sim events of that window with what their
// handlers cost, the browser's long-animation-frame reports (the scripts that ran outside the frame, Chrome) and the
// battle's state. Once a second it writes a summary line. On the dev server (`post`) lines go to vite.config.js
// perfLog (POST /__perf), which appends them to perf/<session>.jsonl; tools/perfwatch.mjs follows the newest session,
// tools/perfreport.mjs sums one. In the build it runs only for the players' lag reports (src/telemetry.js, `onLine`
// gets every line as an object) and posts nothing.
//   const perf = createPerfRecorder({ renderer, dynRes, fx, flares, sim, context, post, onLine });
//   perf.frameStart() at the top of a drawn frame (false: not recorded), perf.mark('sim') between stages,
//   perf.frameEnd() at its end, perf.event(name, args, ms) from each sim event, perf.drain() writes a spike still
//   filling, perf.hist the frame times counted in 1 ms bins (the reader resets it), perf.dispose()
// A row is one frame: `dur` is the time from its start to the next frame's start (what the player sees), `cpu` the time
// inside main's frame function; dur - cpu is the rest (waiting on the GPU, garbage collection, other tasks, vsync).

export const STAGES = ['sun', 'sim', 'render', 'mode', 'world', 'craters', 'hooks', 'camera', 'terrain', 'sky', 'clouds',
  'fx', 'flares', 'weather', 'post', 'draw', 'panel', 'audio', 'hud'];
const NS = STAGES.length;
const IDX = Object.fromEntries(STAGES.map((s, i) => [s, i]));
// the row: the stages' ms, then these
const C = { dur: NS, cpu: NS + 1, gpu: NS + 2, ev: NS + 3, steps: NS + 4, shells: NS + 5, smoke: NS + 6, glow: NS + 7,
  debris: NS + 8, calls: NS + 9, tris: NS + 10, scale: NS + 11, ts: NS + 12, prog: NS + 13, geo: NS + 14, tex: NS + 15, lights: NS + 16 };
const W = NS + 17;
const RING = 900; // frames kept (15 s at 60 fps)
const BEFORE = 2000, AFTER = 500; // ms of frames written round a spike
const SPIKE_MIN = 25; // ms: a frame this long (and twice the usual) is a spike
const HUGE = 2500; // ms: a gap this long is a hidden tab or a breakpoint, not a frame
const SEND = 2000; // ms between posts
export const HIST = 1000; // the frame time histogram's 1 ms bins (to 1 s); the last holds every longer frame

const r1 = (v) => Math.round(v * 10) / 10;

export function createPerfRecorder({ renderer, dynRes, fx, flares, sim, context, post = true, onLine = null }) {
  const rows = new Float32Array(RING * W);
  const hist = new Uint32Array(HIST);
  const starts = new Float64Array(RING); // each row's start (performance.now)
  const ids = new Int32Array(RING).fill(-1); // each row's frame number
  const events = []; // { t, n, c, d, ms } of the last seconds
  const loafs = []; // the browser's long-animation-frame entries of the last seconds
  const out = []; // lines waiting to be posted
  const d0 = new Date(), two = (v) => String(v).padStart(2, '0');
  const session = `${d0.getFullYear()}${two(d0.getMonth() + 1)}${two(d0.getDate())}-${two(d0.getHours())}${two(d0.getMinutes())}${two(d0.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
  const t0 = performance.now();
  let frameNo = -1, row = -1, clock = 0, cur = 0, open = false, skipNext = true;
  let lastSimTime = sim?.time ?? 0;
  let usual = 16.7; // median frame of the last second
  let capture = null; // { from, untilT, spikes: [] } while a spike's window is still filling
  const durs = []; // this second's frame times
  const stageSum = new Float64Array(NS + 2);
  let secEv = {}; // this second's sim events by name
  let secN = 0, secAt = t0, sentAt = t0, gpuSum = 0, gpuN = 0, maxShells = 0, maxSmoke = 0, maxCalls = 0, maxTris = 0, maxSteps = 0;

  const line = (o) => {
    if (onLine) try { onLine(o); } catch (e) { console.warn(`frame recorder: ${e.message}`); }
    if (post) out.push(JSON.stringify(o));
  };
  const cam = () => context?.camera?.position;

  // the GPU's time for a frame arrives a few frames later (dynres.js timer queries): into that frame's row
  if (dynRes) dynRes.onGpu = (ms, tag) => {
    const i = tag % RING;
    if (ids[i] === tag) rows[i * W + C.gpu] = ms;
    gpuSum += ms;
    gpuN++;
  };

  // scripts and work the browser reports for frames over 50 ms (Chrome 123+): what ran outside main's frame
  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        loafs.push({
          t: r1(e.startTime - t0), dur: r1(e.duration), block: r1(e.blockingDuration ?? 0),
          render: e.renderStart ? r1(e.renderStart - e.startTime) : null,
          layout: e.styleAndLayoutStart ? r1(e.styleAndLayoutStart - e.startTime) : null,
          scripts: (e.scripts ?? []).filter((s) => s.duration >= 4).slice(0, 6).map((s) => ({
            ms: r1(s.duration), type: s.invokerType, inv: String(s.invoker ?? '').slice(0, 80),
            fn: s.sourceFunctionName || '', src: `${String(s.sourceURL ?? '').replace(/^.*\/\/[^/]+/, '').replace(/\?.*$/, '')}:${s.sourceCharPosition ?? ''}`,
            layout: r1(s.forcedStyleAndLayoutDuration ?? 0),
          })),
        });
        if (loafs.length > 200) loafs.splice(0, loafs.length - 200);
      }
    });
    observer.observe({ type: 'long-animation-frame', buffered: false });
  } catch { observer = null; }

  // a gap too long to be a frame (HUGE, or the window hidden) gets its own line a second later, with the browser's report
  // of it and what the window did meanwhile, so a freeze can be told from the player switching windows (it used to be
  // dropped unseen: a 4.3 s stall on 2026-11-15 showed only as missing seconds)
  let sawHidden = false, sawBlur = false;
  const gaps = []; // { at, dur, hidden, blur, focus }
  const onVisible = () => { skipNext = true; if (document.hidden) sawHidden = true; };
  const onBlur = () => { sawBlur = true; };
  document.addEventListener('visibilitychange', onVisible);
  addEventListener('blur', onBlur);

  // the session's header: the machine and the settings
  {
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch { /* no name */ }
    line({ k: 'start', session, at: new Date().toISOString(), url: location.pathname + location.search, gpu,
      gpuTimed: !!dynRes?.gpuTimed, cores: navigator.hardwareConcurrency ?? null, dpr: devicePixelRatio,
      w: innerWidth, h: innerHeight, ua: navigator.userAgent, ...context?.settings?.() });
  }

  function frameStart() {
    const now = performance.now();
    // the frame before ends here: its full length (closed first if it threw before frameEnd)
    if (row >= 0) {
      if (open) frameEnd();
      const o = row * W;
      const dur = now - starts[row];
      if (skipNext || dur > HUGE || document.hidden) {
        rows[o + C.dur] = -1;
        if (dur > 500) {
          const hidden = sawHidden || document.hidden;
          gaps.push({ at: starts[row], dur, hidden, blur: sawBlur, focus: document.hasFocus() });
          // a freeze with the window showing: the frames before it are written as a spike's (it stays out of the seconds)
          if (!skipNext && !hidden) { rows[o + C.dur] = dur; spike(row, dur, sawBlur); }
        }
      } else {
        rows[o + C.dur] = dur;
        account(row, dur);
        if (dur > SPIKE_MIN && dur > usual * 2) spike(row, dur, sawBlur);
      }
      skipNext = false;
      sawHidden = false;
      sawBlur = false;
    }
    frameNo++;
    row = frameNo % RING;
    ids[row] = frameNo;
    rows.fill(0, row * W, row * W + W);
    rows[row * W + C.gpu] = -1;
    starts[row] = now;
    clock = now;
    cur = 0;
    open = true;
    if (dynRes) {
      dynRes.tag = frameNo;
      dynRes._poll?.(); // (its own update polls only while dynamic resolution is on)
    }
    if (capture && now >= capture.untilT) flushCapture();
    if (gaps.length && now - gaps[0].at - gaps[0].dur > 1000) flushGaps(now);
    if (now - secAt >= 1000) second(now);
    if (now - sentAt >= SEND) send(now);
    return true;
  }

  function mark(name) {
    if (!open) return;
    const now = performance.now();
    rows[row * W + cur] += now - clock;
    clock = now;
    cur = IDX[name] ?? cur;
  }

  function frameEnd() {
    if (!open) return;
    const now = performance.now();
    const o = row * W;
    rows[o + cur] += now - clock;
    rows[o + C.cpu] = now - starts[row];
    const st = sim?.time ?? 0;
    rows[o + C.steps] = Math.max(0, Math.round((st - lastSimTime) / 0.05));
    lastSimTime = st;
    rows[o + C.shells] = sim?.shells?.length ?? 0;
    rows[o + C.smoke] = fx?.smoke?.n ?? 0;
    rows[o + C.glow] = fx?.glow?.n ?? 0;
    rows[o + C.debris] = (fx?.debris?.length ?? 0) + (fx?.shards?.n ?? 0);
    const info = renderer.info;
    rows[o + C.calls] = info.render.calls;
    rows[o + C.tris] = info.render.triangles / 1000;
    rows[o + C.scale] = dynRes?.scale ?? 1;
    rows[o + C.ts] = context?.timeScale?.() ?? 1;
    rows[o + C.prog] = info.programs?.length ?? 0;
    rows[o + C.geo] = info.memory.geometries;
    rows[o + C.tex] = info.memory.textures;
    rows[o + C.lights] = flares?.items?.length ?? 0;
    open = false;
  }

  // a sim event, with what main's handler for it cost (it runs inside sim.update: the 'sim' stage holds it)
  function event(name, args, ms) {
    if (name === 'radio' || name === 'report' || name === 'mission' || name === 'objective') return;
    const now = performance.now();
    if (open) rows[row * W + C.ev] += ms;
    let c = null, p = null;
    const [a, b] = args;
    if (name === 'fire') { c = b?.kind ?? a?.kind ?? null; p = args[2]?.pos ?? null; }
    else if (name === 'shellBurst') { c = a?.calibre ?? null; p = b; }
    else if (name === 'enemyFire') { c = args[2]?.calibre ?? null; p = a?.pos ?? null; }
    else if (name === 'secondary') { c = b; p = a; }
    else if (name === 'targetDestroyed') { c = a?.kind ?? null; p = a?.pos ?? null; }
    else if (name === 'pieceDestroyed' || name === 'pieceHit') { c = a?.kind ?? null; p = b?.pos ?? null; }
    else if (name === 'flare') { c = b; p = a; }
    const e = cam();
    const d = p && e ? Math.round(Math.hypot(p.x - e.x, (p.y ?? e.y) - e.y, p.z - e.z)) : null;
    events.push({ t: now, n: name, c: typeof c === 'number' ? r1(c) : c, d, ms: r1(ms) });
    secEv[name] = (secEv[name] ?? 0) + 1;
    if (events.length > 600) events.splice(0, events.length - 600);
  }

  function account(i, dur) {
    durs.push(dur);
    hist[Math.min(HIST - 1, dur | 0)]++;
    const o = i * W;
    for (let s = 0; s < NS; s++) stageSum[s] += rows[o + s];
    stageSum[NS] += rows[o + C.cpu];
    stageSum[NS + 1] += rows[o + C.ev];
    secN++;
    maxShells = Math.max(maxShells, rows[o + C.shells]);
    maxSmoke = Math.max(maxSmoke, rows[o + C.smoke]);
    maxCalls = Math.max(maxCalls, rows[o + C.calls]);
    maxTris = Math.max(maxTris, rows[o + C.tris]);
    maxSteps = Math.max(maxSteps, rows[o + C.steps]);
  }

  function second(now) {
    if (secN) {
      durs.sort((a, b) => a - b);
      const q = (k) => durs[Math.min(durs.length - 1, Math.floor(durs.length * k))];
      usual = q(0.5);
      const stages = {};
      for (let s = 0; s < NS; s++) if (stageSum[s] / secN >= 0.05) stages[STAGES[s]] = r1(stageSum[s] / secN);
      const ctx = context?.brief?.() ?? {};
      line({ k: 'sec', t: r1((now - t0) / 1000), n: secN, fps: Math.round(secN * 1000 / (now - secAt)), p50: r1(q(0.5)), p95: r1(q(0.95)),
        max: r1(durs[durs.length - 1]), cpu: r1(stageSum[NS] / secN), ev: r1(stageSum[NS + 1] / secN), gpu: gpuN ? r1(gpuSum / gpuN) : null,
        stages, shells: maxShells, smoke: maxSmoke, calls: maxCalls, ktris: Math.round(maxTris), steps: maxSteps,
        scale: dynRes?.scale ?? 1, evn: secEv, ...ctx });
    }
    secEv = {};
    durs.length = 0;
    stageSum.fill(0);
    secN = 0; gpuSum = 0; gpuN = 0; maxShells = 0; maxSmoke = 0; maxCalls = 0; maxTris = 0; maxSteps = 0;
    secAt = now;
  }

  function spike(i, dur, blur = false) {
    const f = ids[i];
    const end = starts[i] + dur + AFTER;
    if (capture) {
      capture.spikes.push(f);
      capture.untilT = Math.max(capture.untilT, end);
      // a long run of spikes is written in pieces
      if (f - capture.from > RING - 120) flushCapture();
      return;
    }
    let from = f;
    while (from > 0 && from > f - RING + 60 && ids[(from - 1) % RING] === from - 1 && starts[i] - starts[(from - 1) % RING] <= BEFORE) from--;
    // (blur: the window lost focus during the worst frame; focus: it has it now)
    capture = { from, untilT: end, spikes: [f], usual, ctx: { ...context?.full?.(), blur, focus: document.hasFocus() } };
  }

  function flushGaps(now) {
    for (let i = 0; i < gaps.length;) {
      const g = gaps[i];
      if (now - g.at - g.dur < 1000) { i++; continue; }
      const lo = loafs.filter((e) => e.t + t0 + e.dur >= g.at && e.t + t0 <= g.at + g.dur);
      line({ k: 'gap', t: r1(g.at - t0), dur: r1(g.dur), hidden: g.hidden, blur: g.blur, focus: g.focus, ctx: context?.brief?.() ?? {}, loaf: lo });
      gaps.splice(i, 1);
    }
  }

  function flushCapture() {
    const cap = capture;
    capture = null;
    if (!cap) return;
    const frames = [];
    let tA = Infinity, tB = -Infinity;
    for (let f = cap.from; f <= frameNo - 1; f++) {
      const i = f % RING;
      if (ids[i] !== f) continue;
      const o = i * W;
      const s = {};
      for (let k = 0; k < NS; k++) if (rows[o + k] >= 0.05) s[STAGES[k]] = r1(rows[o + k]);
      frames.push({ f, t: r1(starts[i] - t0), dur: r1(rows[o + C.dur]), cpu: r1(rows[o + C.cpu]), gpu: rows[o + C.gpu] >= 0 ? r1(rows[o + C.gpu]) : null,
        ev: r1(rows[o + C.ev]), s, steps: rows[o + C.steps], shells: rows[o + C.shells], smoke: rows[o + C.smoke], glow: rows[o + C.glow],
        debris: rows[o + C.debris], calls: rows[o + C.calls], ktris: Math.round(rows[o + C.tris]), scale: r1(rows[o + C.scale] * 100) / 100,
        ts: rows[o + C.ts], prog: rows[o + C.prog], geo: rows[o + C.geo], tex: rows[o + C.tex], lights: rows[o + C.lights] });
      tA = Math.min(tA, starts[i]);
      tB = Math.max(tB, starts[i] + Math.max(0, rows[o + C.dur]));
    }
    if (!frames.length) return;
    const ev = events.filter((e) => e.t >= tA && e.t <= tB).map((e) => ({ ...e, t: r1(e.t - t0) }));
    const lo = loafs.filter((e) => e.t + t0 + e.dur >= tA && e.t + t0 <= tB);
    const worst = frames.reduce((a, b) => (b.dur > a.dur ? b : a));
    line({ k: 'spike', t: worst.t, worst: worst.f, dur: worst.dur, spikes: cap.spikes, usual: r1(cap.usual), ctx: cap.ctx, frames, events: ev, loaf: lo });
  }

  function send(now) {
    sentAt = now;
    if (!post || !out.length) return;
    const body = out.join('\n') + '\n';
    out.length = 0;
    fetch(`/__perf?s=${session}`, { method: 'POST', body, keepalive: body.length < 60000 }).catch(() => {});
  }

  // the spike window still filling and the gaps waiting for their second, written now
  const drain = () => {
    if (capture) flushCapture();
    flushGaps(Infinity);
  };
  const onHide = () => {
    drain();
    if (post && out.length) navigator.sendBeacon?.(`/__perf?s=${session}`, new Blob([out.join('\n') + '\n'], { type: 'text/plain' }));
    out.length = 0;
  };
  addEventListener('pagehide', onHide);

  function dispose() {
    onHide();
    observer?.disconnect();
    document.removeEventListener('visibilitychange', onVisible);
    removeEventListener('blur', onBlur);
    removeEventListener('pagehide', onHide);
    if (dynRes) dynRes.onGpu = null;
  }

  return { session, frameStart, mark, frameEnd, event, drain, hist, dispose, get recording() { return true; } };
}

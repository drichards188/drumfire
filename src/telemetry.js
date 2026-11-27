// Crash and lag reports from players' browsers to Sentry (project drumfire). src/reports.js decides whether to load
// this at all (a DSN in the build, the player's switch, never the dev server or the headless tools without ?sentry=1).
// What goes:
// - Errors: anything thrown and not caught, and rejected promises, with the page, the GPU and the release; at most
//   MAX_ERRORS a page.
// - Lag spikes, on game pages: the frame recorder (src/perfrec.js) hands over each spike, src/perfcause.js names its
//   cause the way the dev tools do, and one whose worst frame took REPORT_MS or more becomes an issue grouped by that
//   cause (and the stage, when it is main's own code), so Sentry's issue list ranks the causes by how many players hit
//   them. At most MAX_SPIKES a page and one per cause; spikes while the window lost focus are skipped. The frames go
//   along as spike.jsonl (perf/*.jsonl lines: `node tools/perfreport.mjs spike.jsonl` reads it like a local session).
// - Metrics: session.start on every page (with the GPU state, so a page without WebGL counts too); on game pages,
//   once a minute and when the page is hidden, frame.p50/p95/p99, fps, frames and lag.spikes by cause, and once
//   load.to_play, the time from opening the page to the first second of play.
// - The first-run funnel and the battles (main.js, src/firstrun.js; `count`, `distribution` below): once per browser
//   funnel.first_battle, funnel.first_shot, funnel.first_hit (a round of ours bursting near its mission's target),
//   funnel.first_mission (a fire mission done), funnel.first_win and funnel.second_battle, with funnel.to_first_shot
//   (ms from opening the page to the first shot); for each career battle that ends, battle.end with its level, won,
//   how it ended (victory, defeat, left), its minutes (the battle's clock, and the player's) and whether it was the first.
// Nothing personal: no IP address (the project is set to drop it and the SDK collects no user info), a random id per
// browser (localStorage drumfire.telemetry.id) so issues count players, and the URL's own game settings.
import * as Sentry from '@sentry/browser';
import { analyse, describe } from './perfcause.js';
import { gpuInfo } from './ui/gpu.js';
import { reportsOn } from './reports.js';

const REPORT_MS = 100; // ms: a frame this long is a lag spike worth an issue (shorter ones only count in the metrics)
const MAX_SPIKES = 3; // lag issues a page
const MAX_ERRORS = 10; // error events a page
const MINUTE = 60; // s of play between metric flushes
const KEEP_SECS = 30; // summary seconds kept to go with a spike's frames
const ID = 'drumfire.telemetry.id';

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const q = new URLSearchParams(location.search);

// the page, from its URL as menuItems.js builds it
function pageOf() {
  const page = q.has('range') ? 'range' : q.has('sandbox') ? 'sandbox' : q.has('tutorial') ? 'lesson'
    : q.has('campaign') ? 'campaign' : q.has('play') ? 'battle' : 'menu';
  const mode = q.get('mode') || 'ww1917';
  return { page, mode, op: q.get('op') || (page === 'menu' ? 'none' : mode === 'ww1' ? 'ridge' : mode === 'ww2' ? 'flanders' : 'none') };
}

// "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 4070",
// "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)" -> "Apple M1": a name to group players by
function gpuName(r) {
  let s = String(r || '').trim();
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) {
    const parts = angle[1].split(', ');
    s = parts.length > 2 ? parts.slice(1, -1).join(', ') : parts.at(-1);
  }
  s = s.replace(/^ANGLE Metal Renderer: /, '').replace(/\s*\(0x[0-9a-f]+\).*$/i, '').replace(/\/PCIe.*$/, '').replace(/,? or similar$/, '');
  return s.slice(0, 80) || 'unknown';
}

function installId() {
  try {
    let id = localStorage.getItem(ID);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(ID, id);
    }
    return id;
  } catch { return null; }
}

const TITLE = { shaders: () => 'Lag spike: shaders compiled', cpu: (st) => `Lag spike: ${st} stage`, gpu: () => 'Lag spike: GPU',
  outside: () => 'Lag spike: outside the frame' };
const bucket = (ms) => (ms < 250 ? '100-250' : ms < 500 ? '250-500' : ms < 1000 ? '500-1000' : '1000+');

let api = null;

/** Starts Sentry for this page (once) and returns the hooks main.js gives the frame recorder. */
export function start(dsn) {
  if (api) return api;
  const where = pageOf();
  const gpu = { state: gpuInfo.state ?? 'unknown', name: gpuName(gpuInfo.renderer) };
  let errors = 0;
  Sentry.init({
    dsn,
    release: __DRUMFIRE_RELEASE__,
    environment: import.meta.env.DEV ? 'development' : 'production',
    dataCollection: { userInfo: false, cookies: false },
    // the frame loop and the input handlers stay unwrapped (no wrapper per frame or per event): the global handlers
    // still catch what they throw
    integrations: [Sentry.browserApiErrorsIntegration({ requestAnimationFrame: false, eventTarget: false })],
    maxBreadcrumbs: 40,
    ignoreErrors: [/ResizeObserver loop/],
    denyUrls: [/^(chrome|moz|safari|safari-web)-extension:\/\//i, /^chrome:\/\//i],
    beforeSend(event) {
      if (!reportsOn()) return null;
      if (event.fingerprint?.[0] !== 'lag-spike' && ++errors > MAX_ERRORS) return null;
      return event;
    },
    beforeSendMetric: (m) => (reportsOn() ? m : null),
  });
  const id = installId();
  if (id) Sentry.setUser({ id });
  const tags = { ...where, 'gpu.state': gpu.state, 'gpu.name': gpu.name };
  Sentry.setTags(tags);
  Sentry.setAttributes(tags);
  Sentry.setContext('gpu', { renderer: gpuInfo.renderer || null, state: gpu.state });
  Sentry.setContext('display', { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency ?? null,
    memory: navigator.deviceMemory ?? null });
  Sentry.metrics.count('session.start', 1);

  // ---- lag: the frame recorder's lines (game pages only)
  let perf = null, settings = null, head = null, loaded = false, spikesSent = 0;
  const causesSent = new Set();
  const secs = []; // the last summary seconds
  const minute = { t0: null, secs: 0, st: null, spikes: {} };

  function flushMinute() {
    const h = perf?.hist;
    if (!h) return;
    let n = 0;
    for (let i = 0; i < h.length; i++) n += h[i];
    if (n >= 30 && minute.secs) {
      const pct = (k) => {
        const goal = n * k;
        for (let i = 0, c = 0; i < h.length; i++) if ((c += h[i]) >= goal) return i + 0.5;
        return h.length;
      };
      const attributes = { state: minute.st ?? 'unknown', quality: settings?.()?.quality ?? 'unknown' };
      for (const [name, k] of [['frame.p50', 0.5], ['frame.p95', 0.95], ['frame.p99', 0.99]]) {
        Sentry.metrics.distribution(name, pct(k), { unit: 'millisecond', attributes });
      }
      Sentry.metrics.gauge('fps', Math.round(n / minute.secs), { attributes });
      Sentry.metrics.count('frames', n, { attributes });
      for (const [cause, k] of Object.entries(minute.spikes)) Sentry.metrics.count('lag.spikes', k, { attributes: { ...attributes, cause } });
    }
    h.fill(0);
    minute.t0 = null;
    minute.secs = 0;
    minute.spikes = {};
  }

  function onSecond(o) {
    secs.push(o);
    if (secs.length > KEEP_SECS) secs.shift();
    if (!loaded && (o.st === 'playing' || o.st === 'tutorial')) {
      loaded = true;
      Sentry.metrics.distribution('load.to_play', Math.round(performance.now()), { unit: 'millisecond' });
    }
    minute.st = o.st;
    minute.secs++;
    minute.t0 ??= o.t;
    if (o.t - minute.t0 >= MINUTE) flushMinute();
  }

  function onSpike(sp) {
    const a = analyse(sp);
    if (!a) return;
    minute.spikes[a.cause] = (minute.spikes[a.cause] ?? 0) + 1;
    if (a.w.dur < REPORT_MS || sp.ctx?.blur || spikesSent >= MAX_SPIKES) return;
    const stage = a.cause === 'cpu' ? (a.stages[0]?.[0] ?? 'other') : '';
    const key = `${a.cause}:${stage}`;
    if (causesSent.has(key)) return;
    causesSent.add(key);
    spikesSent++;
    const { w, ctx } = a;
    Sentry.withScope((scope) => {
      scope.setFingerprint(['lag-spike', a.cause, stage || '-']);
      scope.setTags({ 'lag.cause': a.cause, 'lag.stage': stage || 'none', 'lag.ms': bucket(w.dur), quality: ctx.quality ?? 'unknown',
        state: ctx.st ?? 'unknown', unit: ctx.unit ?? 'none', cam: ctx.cam ?? 'unknown' });
      scope.setContext('lag', { summary: describe(sp, 0), ms: w.dur, usual: a.usual, cpu: w.cpu, outside: r1(a.outside), gpu: a.gpu,
        stages: Object.fromEntries(a.stages.slice(0, 6).map(([k, v]) => [k, r1(v)])), newShaders: a.newProg, newGeometries: a.newGeo,
        newTextures: a.newTex, spikesInWindow: a.n });
      scope.setContext('battle', { ...ctx, shells: w.shells, smoke: w.smoke, glow: w.glow, debris: w.debris, drawCalls: w.calls,
        ktris: w.ktris, renderScale: w.scale, timeScale: w.ts, flareLights: w.lights });
      const ev = Object.entries(a.counts).sort((x, y) => y[1].ms - x[1].ms || y[1].n - x[1].n).slice(0, 8);
      if (ev.length) {
        scope.setContext('events', Object.fromEntries(ev.map(([k, c]) => [k,
          `${c.n}x${c.dmin < Infinity ? `, nearest ${c.dmin} m` : ''}${c.ms >= 1 ? `, handlers ${r1(c.ms)} ms` : ''}`])));
      }
      if (a.scripts.length) {
        scope.setContext('scripts', Object.fromEntries(a.scripts.slice(0, 4).map((s, i) => [`${i + 1}`, `${s.fn || s.inv || '?'} ${r1(s.ms)} ms ${s.src}`])));
      }
      const lines = [head, ...secs, sp].filter(Boolean).map((l) => JSON.stringify(l)).join('\n');
      scope.addAttachment({ filename: 'spike.jsonl', data: `${lines}\n`, contentType: 'application/json' });
      // a plain message event: captureMessage would add a stack trace of this function, and Sentry would title the issue by it
      Sentry.captureEvent({ message: TITLE[a.cause](stage), level: 'warning' });
    });
  }

  const flush = () => {
    perf?.drain();
    flushMinute();
    return Sentry.flush(2000);
  };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  api = {
    /** main.js hands over the frame recorder and its settings() (for the quality preset) */
    attach(recorder, { settings: s } = {}) { perf = recorder; settings = s ?? null; },
    /** the frame recorder's onLine */
    perfLine(o) {
      if (!reportsOn()) return;
      if (o.k === 'start') { head = o; Sentry.setTag('gpu.timed', o.gpuTimed ? 'yes' : 'no'); }
      else if (o.k === 'sec') onSecond(o);
      else if (o.k === 'spike') onSpike(o);
    },
    flush,
    /** a game event (the first-run funnel, battle.end): a count of one, with its attributes (no personal data) */
    count(name, attributes = {}) {
      if (reportsOn()) Sentry.metrics.count(name, 1, { attributes });
    },
    /** a game measure (funnel.to_first_shot) */
    distribution(name, value, { unit = 'millisecond', attributes = {} } = {}) {
      if (reportsOn()) Sentry.metrics.distribution(name, value, { unit, attributes });
    },
    get stats() { return { errors, spikes: spikesSent, causes: [...causesSent] }; },
  };
  window.__drumfireTelemetry = api;
  return api;
}

// The max-quality battery's sound, measured through the real engine in headless Chromium (shots/maxq/PLAN.md S, the
// sound audit's labs): on /audio.html?hero=mrs18 the page's smoke test, then the Mörser 18's report rendered offline
// (an OfflineAudioContext driving an AudioEngine at 47 updates a second, so the deafening, ducking and limiter act as
// live) at the layer's post (5.4 m), the lesson's close-up (28 m), the chase (70 m), No. 2 gun (80 m) and in front of
// the muzzle, against the class gun the page had before; the 21 cm burst 98 m off. Prints the measures and checks the
// targets; writes spectrograms (before and after) to shots/herosound.png. Exits 1 on a failure.
//   node tools/herosound.mjs            (needs the dev server on 5201; CHROME=chromium-1217 picks the browser build)
//   node tools/herosound.mjs --drill    the drill as well, on the test range (?range=1&mode=ww1&kind=mrs18&maxq=1): its
//                                       foley on the crew's cycle clock, live at time scale 1 (about 5 minutes)
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const DRILL = process.argv.includes('--drill');
const exe = [...(process.env.CHROME ? [process.env.CHROME] : []), 'chromium-1217', 'chromium-1247']
  .map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: [...(process.env.GPU === '1' ? ['--use-angle=gl', '--use-gl=angle', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const fail = [];
const check = (ok, msg) => { if (!ok) { fail.push(msg); console.log('  FAIL: ' + msg); } };
const open = async (path, until, ms) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  // (no hot reload: another agent's save would reload the page in the middle of a measurement)
  await page.addInitScript(() => {
    const Orig = window.WebSocket;
    window.WebSocket = function (url, proto) { return proto === 'vite-hmr' ? { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 } : new Orig(url, proto); };
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:5201${path}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(until, null, { timeout: ms, polling: 500 });
  return page;
};
try {
  const page = await open('/audio.html?hero=mrs18', 'window.__audioReport?.done', 400000);
  const rep = await page.evaluate(() => window.__audioReport);
  console.log(`/audio.html?hero=mrs18 smoke test: ok ${rep.ok}, errors ${rep.errors.length}, hero ${JSON.stringify(rep.hero)}`);
  check(rep.ok && !rep.errors.length, 'the audio page smoke test should pass with the hero kind');
  const r = await page.evaluate(heroMix);
  for (const e of r.errors) console.log('  error: ' + e);
  check(!r.errors.length && r.heroOn, 'the hero banks should be built and the measures run');
  const M = r.mix ?? {}, pct = (v) => (v * 100).toFixed(1).padStart(5) + ' %';
  console.log('\nTHE REPORT (engine mix): first 10 ms > 2 kHz / < 100 Hz, 60 to 500 ms < 100 Hz, peak, tail: worst step and -30 dB');
  for (const [k, v] of Object.entries(M)) if (v.first10ms) console.log(`${k.padEnd(34)} ${pct(v.first10ms.hi)} / ${pct(v.first10ms.lo)}  ${v.body60to500ms ? pct(v.body60to500ms.lo) : '       '}  ${v.peak?.toFixed(2) ?? '    '}  ${v.tail ? `${v.tail.worstStepDb.toFixed(1)} dB, ${v.tail.minus30dB.toFixed(1)} s` : ''}`);
  const hi = (k) => M[k]?.first10ms?.hi ?? 0, lo = (k) => M[k]?.body60to500ms?.lo ?? 0;
  check(hi('layer 5.4 m hero') >= 0.1, 'at the layer\'s post the first 10 ms should hold at least 10 % above 2 kHz (the crack)');
  check(hi('close-up 28 m hero') >= 0.05, 'at the close-up the first 10 ms should hold at least 5 % above 2 kHz');
  for (const k of ['layer 5.4 m hero', 'close-up 28 m hero', 'No. 2 gun 80 m hero']) check(lo(k) >= 0.5, `${k}: at least 50 % under 100 Hz from 60 to 500 ms (the boom)`);
  for (const k of ['layer 5.4 m hero', 'close-up 28 m hero', 'chase 70 m hero', 'No. 2 gun 80 m hero']) check(M[k]?.tail.worstStepDb <= 12 && M[k]?.tail.minus30dB >= 4, `${k}: the tail rolls on without a gap for 4 s or more`);
  const dB = 20 * Math.log10((M['layer 5.4 m hero']?.peak ?? 0) / (M['No. 2 gun 80 m hero']?.peak ?? 1));
  console.log(`peak at the layer's post against No. 2 gun at 80 m: ${dB.toFixed(1)} dB (the class gun ${(20 * Math.log10(M['layer 5.4 m class'].peak / M['No. 2 gun 80 m class'].peak)).toFixed(1)} dB)`);
  check(dB >= 4, 'your own gun at 5.4 m should peak at least 4 dB over No. 2 at 80 m');
  check(hi('burst 98 m hero (air only)') >= 0.05 && hi('burst 98 m hero (air only)') > hi('burst 98 m class (air only)'), 'the 21 cm burst should crack (5 % above 2 kHz in its first 10 ms, more than the class burst)');
  fs.mkdirSync('shots', { recursive: true });
  await page.screenshot({ path: 'shots/herosound.png' });
  console.log('spectrograms: shots/herosound.png');
  await page.close();
  if (DRILL) {
    const pg = await open('/?range=1&mode=ww1&kind=mrs18&maxq=1&quality=Low', 'window.__drumfire?.audio?.ctx && window.__drumfire?.state && !window.__drumfire.audio.worker', 400000);
    const d = await pg.evaluate(heroDrill);
    for (const e of d.errors) console.log('  error: ' + e);
    console.log(`\nTHE DRILL on the range: ${d.ran?.sim} s of sim in ${d.ran?.wall} s, ${d.fired} shots, cues ${d.cueLateness?.n} at most ${d.cueLateness?.max} s late`);
    console.log(Object.entries(d.count ?? {}).map(([k, n]) => `${k} ${n}`).join(', '));
    const n = (k) => d.count?.[k] ?? 0;
    check(d.ran?.heroFoley, 'the foley should carry the hero gun\'s drill (audio.heroFoley)');
    check(d.cueLateness?.n >= 15 && d.cueLateness.max <= 0.035 && d.cueLateness.min >= -0.005, 'each drill cue should land within 35 ms after its moment on the cycle clock');
    check(!Object.keys(d.count ?? {}).some((k) => k.startsWith('load:')), 'no load() for the hero unit once the foley plays its drill');
    check(n('gun') >= 1 && d.guns.every((g) => g.o?.hero && g.o.kind === 'mrs18'), 'the shot should come with the hero options');
    check(n('foley:runout') >= 1 && n('foley:runHome') >= 1 && n('foley:carHome') >= 1, 'the run-out and its two home thumps after a shot');
    check(n('foley:caseDrop') >= 1 && n('foley:caseDrop') <= n('gun'), 'a spent case on the deck in each cycle after a shot, never without one');
    check(n('foley:step_grate') + n('foley:step_earth') + n('foley:step_grass') + n('foley:step_mud') >= 20, 'the men\'s steps');
    await pg.close();
  }
} catch (e) {
  fail.push(e.message);
  console.log('error: ' + e.message);
}
await browser.close();
console.log(`\n${fail.length} failed checks`);
process.exit(fail.length ? 1 : 0);

// ---- the labs, run in the page (their sources are sent to it: they use nothing from here)

async function heroMix() {
  // the hero report through the real engine (an OfflineAudioContext driving AudioEngine at 47 updates a second, so the
  // deafening, ducking and limiter act as live), against the class path at the same places; /audio.html?hero=mrs18
  const out = { errors: [] };
  try {
    const M = await import('/src/audio.js');
    const A = window.__audio;
    for (let i = 0; i < 2400 && !(window.__audioReport?.done && A?.recordingsInUse && !A.pending.length); i++) await new Promise((r) => setTimeout(r, 100));
    out.heroOn = A.heroOn('mrs18');
    out.heroBanks = Object.fromEntries(Object.entries(A.bank.hero_mrs18 ?? {}).map(([k, v]) => [k, `${v.length}x ${v[0].duration.toFixed(2)}s @${v[0].sampleRate}`]));
    const SR = 48000, Q = 1024 / SR;
    const fft = (re, im) => {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let len = 2; len <= n; len <<= 1) { const a = (-2 * Math.PI) / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = i + k + len / 2; const tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; } }
    };
    const share = (x, sr, t0, t1) => {
      const i0 = Math.max(0, Math.round(t0 * sr)), i1 = Math.min(x.length, Math.round(t1 * sr)), L = i1 - i0, tp = Math.round(0.001 * sr);
      let n = 1; while (n < L) n <<= 1;
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < L; i++) { const w = i < tp ? 0.5 - 0.5 * Math.cos((Math.PI * i) / tp) : i > L - tp ? 0.5 - 0.5 * Math.cos((Math.PI * (L - i)) / tp) : 1; re[i] = x[i0 + i] * w; }
      fft(re, im); let m = 0, h = 0, lo = 0;
      for (let k = 1; k < n / 2; k++) { const p = re[k] * re[k] + im[k] * im[k], f = (k * sr) / n; m += p; if (f > 2000) h += p; if (f < 100) lo += p; }
      return { hi: +(h / m).toFixed(3), lo: +(lo / m).toFixed(3) };
    };
    // the air's arrival: the first sample of the high-passed (500 Hz) mix within 20 dB of its peak in the next 0.6 s (the
    // ground's tremor, under 160 Hz and up to 70 ms ahead of the air at 28 m, must not count as the onset)
    const onsetAfter = (x, sr, tFrom) => {
      const a = Math.max(0, Math.round(tFrom * sr) - Math.round(0.01 * sr)), b = Math.min(x.length, a + Math.round(0.6 * sr)), h = new Float32Array(b - a);
      // two RBJ high-passes at 1 kHz (24 dB per octave: the tremor's 160 Hz is 50 dB down)
      const w = 2 * Math.PI * 1000 / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.707), a0 = 1 + al, b0 = (1 + cs) / 2 / a0, b1 = -(1 + cs) / a0, c1 = -2 * cs / a0, c2 = (1 - al) / a0;
      for (let i = a; i < b; i++) h[i - a] = x[i];
      for (let pass = 0; pass < 2; pass++) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < h.length; i++) { const v = h[i], y = b0 * v + b1 * x1 + b0 * x2 - c1 * y1 - c2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; h[i] = y; } }
      let m = 0; for (const v of h) m = Math.max(m, Math.abs(v));
      let i = 0; while (i < h.length && Math.abs(h[i]) < m * 0.1) i++; return (a + i) / sr;
    };
    const env = (x, sr, win) => { const w = Math.round(win * sr), e = []; for (let k = 0; k + w <= x.length; k += w) { let s = 0; for (let i = 0; i < w; i++) s += x[k + i] * x[k + i]; e.push(Math.sqrt(s / w)); } return e; };
    const tailStats = (x, sr, t) => {
      const e = env(x.subarray(Math.round(t * sr)), sr, 0.025), top = Math.max(...e);
      let worst = 0, at = 0, end = 0;
      for (let k = Math.round(0.3 / 0.025); k < Math.min(e.length - 1, Math.round(5 / 0.025)); k++) { const d = Math.abs(20 * Math.log10((e[k] + 1e-9) / (e[k + 1] + 1e-9))); if (d > worst) (worst = d), (at = k * 0.025); }
      for (let k = 0; k < e.length; k++) if (e[k] > top * 0.0316) end = k;
      return { worstStepDb: +worst.toFixed(1), at: +at.toFixed(2), minus30dB: +((end + 1) * 0.025).toFixed(2) };
    };
    const cam = (x, y, z) => ({ position: { x, y, z }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1] } });
    const render = async (secs, L, hero, script) => {
      const off = new OfflineAudioContext(2, Math.ceil(secs * SR), SR);
      const E = new M.AudioEngine({ context: off, ...(hero ? { hero: { kinds: ['mrs18'] } } : {}) });
      E.bank = {}; for (const g in A.bank) E.bank[g] = { ...A.bank[g] };
      E.start(); E.setAmbience({ drumfire: 0, rain: 0, wind: 0 }); E.ambNow.wind = 0; E.amb.wind = 0;
      E.update(0, L); script(E);
      for (let k = 1; k * Q < secs - Q; k++) off.suspend(k * Q).then(() => { E.update(Q, L); off.resume(); });
      return off.startRendering();
    };
    // the Mörser 18 as the lesson places it: trunnions 2.2 m up at the origin, laid 45 degrees toward -Z
    const el = (45 * Math.PI) / 180, muzzle = { x: 0, y: 2.2 + 4.76 * Math.sin(el), z: 0.05 - 4.76 * Math.cos(el) }, dir = { x: 0, y: Math.sin(el), z: -Math.cos(el) };
    const ears = [['layer 5.4 m', cam(-1.18, 2.48, 0.95)], ['close-up 28 m', cam(-18, 6, 18)], ['chase 70 m', cam(-50, 14, 47)], ['No. 2 gun 80 m', cam(-56, 2.5, 57)], ['front 28 m', cam(0, 4, -27)]];
    const dist = (a) => Math.hypot(a.x - muzzle.x, a.y - muzzle.y, a.z - muzzle.z);
    out.mix = {};
    const bufs = {};
    for (const [name, L] of ears) {
      const d = dist(L.position);
      for (const [tag, hero, opts] of [['class', false, undefined], ['hero', true, { hero: true, kind: 'mrs18', charge: 3, dir }], ['hero L1', true, { hero: true, kind: 'mrs18', charge: 0, dir }]]) {
        if (tag === 'hero L1' && !name.startsWith('layer')) continue;
        const b = await render(7, L, hero, (E) => { E.gun({ ...muzzle }, 210.9 / 25.4, opts); });
        const x = b.getChannelData(0), t = onsetAfter(x, SR, d / 343 + 0.005);
        let pk = 0; for (let i = Math.round(t * SR); i < Math.min(x.length, Math.round((t + 0.5) * SR)); i++) pk = Math.max(pk, Math.abs(x[i]));
        out.mix[`${name} ${tag}`] = { d: +d.toFixed(1), arrive: +t.toFixed(3), peak: +pk.toFixed(3), first10ms: share(x, SR, t - 0.001, t + 0.01), first60ms: share(x, SR, t - 0.001, t + 0.06), body60to500ms: share(x, SR, t + 0.06, t + 0.5), tail: tailStats(x, SR, t) };
        bufs[`${name} ${tag}`] = b;
      }
    }
    for (const n of ['layer 5.4 m', 'close-up 28 m', 'No. 2 gun 80 m']) out.mix[n + ' peak dB vs 80 m'] = { class: +(20 * Math.log10(out.mix[n + ' class'].peak / out.mix['No. 2 gun 80 m class'].peak)).toFixed(1), hero: +(20 * Math.log10(out.mix[n + ' hero'].peak / out.mix['No. 2 gun 80 m hero'].peak)).toFixed(1) };
    // the air's report alone (no tremor through the ground, which at 70 m and more arrives long before it): the onset's spectrum
    for (const [name, L] of ears.slice(2, 4)) for (const [tag, hero, opts] of [['class', false, undefined], ['hero', true, { hero: true, kind: 'mrs18', charge: 3, dir }]]) {
      const d = dist(L.position), b = await render(2, L, hero, (E) => { E.tremor = E.heroTremor = () => {}; E.gun({ ...muzzle }, 210.9 / 25.4, opts); });
      const x = b.getChannelData(0), t = onsetAfter(x, SR, d / 343 + 0.005);
      out.mix[`${name} ${tag} (air only)`] = { arrive: +t.toFixed(3), first10ms: share(x, SR, t - 0.001, t + 0.01), first60ms: share(x, SR, t - 0.001, t + 0.06) };
    }
    // the 21 cm burst riding the shell, 100 m off (the air's report alone too)
    for (const [tag, hero, still] of [['class', false, false], ['hero', true, false], ['class (air only)', false, true], ['hero (air only)', true, true]]) {
      const L = cam(-60, 20, 75), b = await render(6, L, hero, (E) => { if (still) E.tremor = E.heroTremor = () => {}; E.burst({ x: 0, y: 0, z: 0 }, 210.9 / 25.4, { fuze: 'instant', ground: 'mud', kind: 'mrs18', hero }); });
      const x = b.getChannelData(0), t = onsetAfter(x, SR, 98 / 343);
      out.mix['burst 98 m ' + tag] = { arrive: +t.toFixed(3), first10ms: share(x, SR, t - 0.001, t + 0.01), first60ms: share(x, SR, t - 0.001, t + 0.06) };
      bufs['burst ' + tag] = b;
    }
    // spectrograms
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#0b0d0f;color:#cfd8cf;font:11px monospace';
    const W = 1280, H = 960, cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
    document.body.append(cv);
    const g = cv.getContext('2d'); g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, W, H);
    const N = 1024, win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const panel = (label, buf, t0, t1, ox, oy, pw, ph) => {
      const x = buf.getChannelData(0), sr = buf.sampleRate, img = g.createImageData(pw - 4, ph - 18), cols = img.width, rows = img.height;
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let c = 0; c < cols; c++) {
        const s0 = Math.round((t0 + (c / cols) * (t1 - t0)) * sr) - N / 2;
        for (let i = 0; i < N; i++) { re[i] = (x[s0 + i] ?? 0) * win[i]; im[i] = 0; }
        fft(re, im);
        for (let row = 0; row < rows; row++) {
          const f = 30 * Math.pow(20000 / 30, 1 - row / (rows - 1)), k = Math.min(N / 2 - 1, Math.max(1, Math.round((f * N) / sr)));
          const p = Math.hypot(re[k], im[k]) / (N / 4), v = Math.max(0, Math.min(1, (20 * Math.log10(p + 1e-9) + 90) / 90)), o = (row * cols + c) * 4;
          img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * Math.max(0, Math.min(1, v * 1.6 - 0.5)); img.data[o + 2] = 255 * Math.max(0, v * 2.2 - 1.3) + 60 * (1 - v) * v; img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, ox + 2, oy + 16);
      g.fillStyle = '#cfd8cf'; g.fillText(label, ox + 4, oy + 11);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const row = (1 - Math.log10(f / 30) / Math.log10(20000 / 30)) * (rows - 1); g.fillRect(ox + 2, oy + 16 + row, 5, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : '' + f, ox + 9, oy + 19 + row); }
      for (let s = Math.ceil(t0); s <= t1; s++) { const cx = ox + 2 + ((s - t0) / (t1 - t0)) * (cols - 1); g.fillRect(cx, oy + ph - 6, 1, 4); g.fillText(s + 's', cx + 2, oy + ph - 1); }
    };
    const pw = W / 2, ph = H / 5;
    const P = [['layer 5.4 m class', 'BEFORE: the class gun at the layer\'s post, 5.4 m (engine mix)'], ['layer 5.4 m hero', 'AFTER: the Mrs 18 report at the layer\'s post, 5.4 m (engine mix)'],
      ['close-up 28 m class', 'BEFORE: the close-up camera, 28 m'], ['close-up 28 m hero', 'AFTER: the close-up camera, 28 m'],
      ['No. 2 gun 80 m class', 'BEFORE: No. 2 gun, 80 m'], ['No. 2 gun 80 m hero', 'AFTER: No. 2 gun, 80 m'],
      ['layer 5.4 m hero L1', 'AFTER: Ladung 1 (300 m/s) at 5.4 m: smaller, no bow wave'], ['front 28 m hero', 'AFTER: 28 m in front of the muzzle'],
      ['burst class', 'BEFORE: the 21 cm burst 98 m off (riding the shell)'], ['burst hero', 'AFTER: the 21 cm burst 98 m off']];
    P.forEach(([k, label], i) => bufs[k] && panel(label, bufs[k], 0, 6, (i % 2) * pw, Math.floor(i / 2) * ph, pw, ph));
  } catch (e) {
    out.errors.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(0, 4).join(' | '));
  }
  return out;
}

async function heroDrill() {
  // the drill heard on the test range (?range=1&mode=ww1&kind=mrs18&maxq=1): the range's Mrs 18 on auto serving an observed
  // mission, live at time scale 1 for `SECS` s, with the audio API hooked: every foley cue against the cycle clock's own
  // moment (crew.tl), the gear loops, the steps, the shot and its options, and no load() for the hero unit
  const SECS = 110, out = { errors: [] };
  try {
    let D = null, A = null;
    for (let i = 0; i < 2400; i++) { D = window.__drumfire; A = D?.audio; if (A?.ctx && !A.worker && D.state && D.sim?.units?.length && A.heroOn?.('mrs18')) break; await new Promise((r) => setTimeout(r, 100)); }
    out.ready = { ctx: A?.ctx?.state, rate: A?.ctx?.sampleRate, heroOn: A?.heroOn?.('mrs18'), hero: [...(A?.hero ?? [])], banks: Object.keys(A?.bank?.hero_mrs18 ?? {}).length, foley: Object.keys(A?.bank?.foley_mlaf ?? {}).length, maxq: D?.hero ? { level: D.hero.level, units: [...D.hero.units], kinds: [...D.hero.kinds] } : null };
    const S = D.sim, u = S.units[0], views = D.renderLayer?.guns?.views ?? [], v = views.find((w) => w.hero) ?? views[0];
    out.unit = { id: u.id, kind: u.kind, pieces: u.pieces.length, hero: !!v?.hero };
    const cam = D.camera, dist = (p) => +Math.hypot(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z).toFixed(1);
    const log = [], push = (e) => { if (log.length < 3000) log.push({ t: +S.time.toFixed(2), tn: Number.isFinite(v?.crew?.tl?.now) ? +v.crew.tl.now.toFixed(2) : String(v?.crew?.tl?.now), step: u.pieces[0].job?.step ?? u.pieces[0].state, ...e }); };
    const wrap = (name, f) => { const o = A[name].bind(A); A[name] = (...a) => { try { push(f(...a)); } catch (e) { out.errors.push(name + ': ' + e.message); } return o(...a); }; };
    wrap('foley', (n, p, o = {}) => ({ c: 'foley', n, d: dist(p), g: +(o.gain ?? 1).toFixed(2), until: o.until != null ? +o.until.toFixed(2) : null, loud: !!o.loud }));
    wrap('gun', (p, cal, o) => ({ c: 'gun', d: dist(p), o: o ? { kind: o.kind, hero: o.hero, charge: o.charge, dir: o.dir ? [o.dir.x, o.dir.y, o.dir.z].map((q) => +q.toFixed(2)) : null } : null }));
    wrap('load', (st, p, k) => ({ c: 'load', st, k }));
    wrap('burst', (p, cal, o = {}) => ({ c: 'burst', d: dist(p), hero: !!o.hero, kind: o.kind }));
    const loops = {};
    const fl = A.foleyLoop.bind(A);
    A.foleyLoop = (id, n, p, g, r) => { if (g > 0.01) { const L = (loops[id] ||= { frames: 0, gMax: 0, rMax: 0 }); L.frames++; L.gMax = Math.max(L.gMax, g); L.rMax = Math.max(L.rMax, r); } return fl(id, n, p, g, r); };
    let earsMax = 0;
    const se = A.setEars.bind(A);
    A.setEars = (k) => { earsMax = Math.max(earsMax, k); return se(k); };
    // the camera at the close-up's distance, behind and left of the gun
    D.select?.(0);
    // the target nearest the gun's present line (the least traverse: the carriage swings at 1.1 degrees a second)
    const p0 = u.pieces[0], wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const tg = S.targets.filter((t) => !t.offmap && t.parts?.length).map((t) => ({ t, D: Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z), b: Math.abs(wrapPi(Math.atan2(t.pos.x - u.pos.x, -(t.pos.z - u.pos.z)) - (p0.bearing ?? 0))) })).filter((q) => q.D > 3500 && q.D < 10000).sort((a, b) => a.b - b.b)[0]?.t;
    out.target = tg ? { id: tg.id, kind: tg.kind } : null;
    if (tg) D.range?.mission?.(tg.id);
    u.mode = 'auto';
    D.setTimeScale?.(1);
    // the page's own loop stopped (it draws, which SwiftShader makes slow): frames stepped here without drawing, paced to
    // the wall clock so the drill runs at time scale 1 as the foley sees it
    D.fastForward(0, { settle: 0 });
    const t0 = performance.now(), s0 = S.time;
    let frames = 0;
    let fired = 0;
    while (S.time - s0 < SECS && performance.now() - t0 < 400000) {
      const f0 = performance.now();
      // an order to fire once the gun is ready (twice: a second cycle with a spent case to throw)
      if (p0.state === 'ready' && !(p0.rounds > 0) && fired < 2) { S.command(u.id, 'fire', { rounds: 1 }); fired++; }
      D.frame(1 / 30, false);
      frames++;
      const left = 1000 / 30 - (performance.now() - f0);
      await new Promise((r) => setTimeout(r, Math.max(0, left)));
    }
    out.frames = frames;
    out.fired = fired;
    out.ran = { wall: Math.round((performance.now() - t0) / 1000), sim: +(S.time - s0).toFixed(1), heroFoley: A.heroFoley, camToGun: v ? dist(v.rig.root.position) : null };
    // each cycle cue against the moment it stands for: the foley call's cycle second minus the cue's own (from HERO_CUES)
    const HC = (await import('/src/render/herocues.js')).HERO_CUES.mrs18, FC = (await import('/src/audioHero.js')).FOLEY_CUES.mrs18;
    const T = v.crew.tl;
    const err = [];
    for (const e of log.filter((q) => q.c === 'foley' && typeof q.tn === 'number')) {
      const c = FC.find((q) => q.s === e.n && q.cue && HC[q.cue] && HC[q.cue][0] !== 'shot' && HC[q.cue][0] !== 'tf' && Math.abs(T.at(HC[q.cue][0], HC[q.cue][1]) + (q.dt ?? 0) - e.tn) < 0.6);
      if (c) err.push({ n: e.n, late: +(e.tn - (T.at(HC[c.cue][0], HC[c.cue][1]) + (c.dt ?? 0))).toFixed(3) });
    }
    out.cueLateness = { n: err.length, max: err.length ? Math.max(...err.map((q) => q.late)) : null, min: err.length ? Math.min(...err.map((q) => q.late)) : null };
    const count = {};
    for (const e of log) { const k = e.c === 'foley' ? 'foley:' + e.n : e.c === 'load' ? 'load:' + e.st : e.c; count[k] = (count[k] ?? 0) + 1; }
    out.count = count;
    out.loops = loops;
    out.earsMax = earsMax;
    out.hrtfN = A.hrtfN;
    out.guns = log.filter((e) => e.c === 'gun').slice(0, 4);
    out.first = log.filter((e) => e.c !== 'foley' || !/^step_|kit/.test(e.n)).slice(0, 70);
  } catch (e) {
    out.errors.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(0, 3).join(' | '));
  }
  return out;
}

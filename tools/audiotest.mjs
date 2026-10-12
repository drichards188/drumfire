// Renders every synthesized sound bank offline and reports duration, peak, RMS and problems, then
// checks the guns, bursts and loops for the properties that make them sound right. Exits 1 on a failure.
//   node tools/audiotest.mjs
import { bankTasks, classOf } from '../src/audio.js';

const make = (chans, sr) => ({ chans, sr });
const rows = [];
const keep = {}; // every buffer of every bank, for the analysis below
let bad = 0;
const t0 = performance.now();
for (const task of bankTasks(48000, make)) {
  if (!task) continue;
  const [group, key, fn] = task;
  const t = performance.now();
  const out = fn();
  const ms = performance.now() - t;
  keep[group + '.' + key] = out;
  for (const [i, b] of out.entries()) {
    let peak = 0, sum = 0, nan = 0, n = 0;
    for (const c of b.chans) for (let k = 0; k < c.length; k++) {
      const v = c[k];
      if (!Number.isFinite(v)) nan++;
      else {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        n++;
      }
    }
    const rms = Math.sqrt(sum / Math.max(n, 1));
    const issue = nan ? `NaN x${nan}` : peak < 0.05 ? 'SILENT' : peak > 1.0001 ? 'CLIPS' : rms < 0.002 ? 'QUIET' : '';
    if (issue) bad++;
    if (i === 0 || issue) rows.push(`${(group + '.' + key + '[' + i + ']').padEnd(28)} ${(b.chans[0].length / b.sr).toFixed(2).padStart(6)} s  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}  ${ms.toFixed(0).padStart(5)} ms ${issue}`);
  }
}
console.log(rows.join('\n'));

// ---- analysis
const mono = (b) => b.chans[0];
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) (([re[i], re[j]] = [re[j], re[i]]), ([im[i], im[j]] = [im[j], im[i]]));
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = i + k + len / 2;
      const tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c;
      re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti;
    }
  }
};
/** Spectral centroid (Hz) and the share of energy below 100 Hz and above 2 kHz, over 2^15 samples from `from` s. */
const spectrum = (b, from = 0, to = 1e9) => {
  const n = 1 << 15, re = new Float64Array(n), im = new Float64Array(n), x = mono(b), i0 = Math.round(from * b.sr);
  const lim = Math.round(to * b.sr);
  for (let i = 0; i < n; i++) re[i] = (i < lim ? x[i0 + i] || 0 : 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  fft(re, im);
  let m = 0, mf = 0, lo = 0, hi = 0;
  for (let k = 1; k < n / 2; k++) {
    const p = re[k] * re[k] + im[k] * im[k], f = (k * b.sr) / n;
    m += p; mf += p * f; if (f < 100) lo += p; if (f > 2000) hi += p;
  }
  return { centroid: mf / m, lo: lo / m, hi: hi / m };
};
const envelope = (b, win = 0.01) => {
  const x = mono(b), w = Math.round(win * b.sr), e = [];
  for (let k = 0; k + w <= x.length; k += w) {
    let s = 0;
    for (let i = 0; i < w; i++) s += x[k + i] * x[k + i];
    e.push(Math.sqrt(s / w));
  }
  return e;
};
const db = (v) => (20 * Math.log10(Math.max(v, 1e-6))).toFixed(0);
const fail = [];
const check = (ok, msg) => { if (!ok) { fail.push(msg); console.log('  FAIL: ' + msg); } };

console.log('\nGUNS (near): attack to 90 % ms, peak at s, -30 dB at s, <100 Hz share, >2 kHz share, centroid Hz');
const gunStats = {};
for (const cls of ['light', 'field', 'med', 'heavy', 'huge']) {
  const b = keep['gun_' + cls + '.near']?.[0];
  if (!b) { check(false, 'gun_' + cls + ' missing'); continue; }
  const e = envelope(b, 0.005), top = Math.max(...e), kp = e.indexOf(top);
  const k90 = e.findIndex((v) => v >= 0.9 * top);
  let end = kp;
  for (let k = kp; k < e.length; k++) if (e[k] > top * 0.0316) end = k;
  const sp = spectrum(b), sh = spectrum(b, 0, 0.06);
  gunStats[cls] = { end: end * 0.005, lo: sp.lo, hi: sh.hi, cen: sp.centroid, snap: sh.centroid };
  const at = [0.01, 0.05, 0.15, 0.4, 1, 2, 3.5, 5.5].map((t) => db(e[Math.round(t / 0.005)] / top)).join(' ');
  console.log(`${cls.padEnd(6)} attack ${((k90 + 1) * 5).toString().padStart(4)} ms  peak ${(kp * 0.005).toFixed(2)}  -30dB at ${(end * 0.005).toFixed(1)}  lo ${(sp.lo * 100).toFixed(0).padStart(3)}%  hi ${(sp.hi * 100).toFixed(1).padStart(4)}%  centroid ${sp.centroid.toFixed(0)}  snap>1k ${(sh.hi * 100).toFixed(0)}%  dB@.01 .05 .15 .4 1 2 3.5 5.5: ${at}`);
  check(k90 * 5 < 60, `${cls} gun attack too slow`);
  check(e[Math.round(0.4 / 0.005)] / top < 0.5, `${cls} gun does not decay (still above -6 dB at 0.4 s)`);
}
check(gunStats.huge.end > gunStats.field.end, 'the 15-inch should ring longer than the field gun');
check(gunStats.huge.lo > gunStats.field.lo, 'the 15-inch should carry more sub-bass than the field gun');
check(gunStats.huge.cen < gunStats.field.cen, 'the 15-inch should be darker than the field gun');
check(gunStats.huge.end > 3, 'the 15-inch echo should last more than 3 s');

console.log('\nSET LEVELS: bursts and distance renderings (rms dB, length s)');
for (const g of Object.keys(keep).filter((k) => /^(burst_|gun_)/.test(k))) {
  const b = keep[g][0];
  let s = 0;
  for (const v of mono(b)) s += v * v;
  if (/near$/.test(g)) continue;
  const sp = spectrum(b);
  console.log(`${g.padEnd(26)} rms ${db(Math.sqrt(s / mono(b).length)).padStart(4)} dB  ${(mono(b).length / b.sr).toFixed(1)} s  centroid ${sp.centroid.toFixed(0)}`);
}

console.log('\nLOOPS: seam jump (|last - first| relative to rms), centroid');
for (const key of ['loop.tear', 'loop.rush', 'loop.whistle', 'loop.train', 'loop.scream', 'loop.drumfire', 'loop.rain']) {
  const b = keep[key]?.[0];
  if (!b) { check(false, key + ' missing'); continue; }
  const x = mono(b);
  let s = 0;
  for (const v of x) s += v * v;
  const rms = Math.sqrt(s / x.length), jump = Math.abs(x[x.length - 1] - x[0]) / rms;
  const sp = spectrum(b);
  console.log(`${key.padEnd(16)} ${(x.length / b.sr).toFixed(1)} s  seam ${jump.toFixed(2)}  centroid ${sp.centroid.toFixed(0)}`);
  check(jump < 3, key + ' does not loop cleanly');
}
check(spectrum(keep['loop.train'][0]).centroid < 300, 'the freight train should be low');
check(spectrum(keep['loop.tear'][0]).centroid > 1500, 'the tearing rush should be bright');

console.log('\nCLASSES: ' + [2.95, 3.3, 5, 6, 8, 9.2, 12, 15].map((c) => `${c} in -> ${classOf(c)}`).join(', '));
console.log(`\n${bad ? bad + ' problem buffers' : 'all buffers sound'}, ${fail.length} failed checks, ${(performance.now() - t0).toFixed(0)} ms total`);
process.exit(bad || fail.length ? 1 : 0);

// Renders every synthesized sound bank offline and reports duration, peak, RMS and problems, then
// checks the guns, bursts and loops for the properties that make them sound right, the British banks and the
// WW2 (German side) ones. Exits 1 on a failure.
//   node tools/audiotest.mjs
import { bankTasks, classOf, recordingTasks, RECORDINGS } from '../src/audio.js';

const make = (chans, sr) => ({ chans, sr });
const rows = [];
const keep = {}; // every buffer of every bank, for the analysis below
let bad = 0;
const t0 = performance.now();
// the British game must render the same banks as before, in the same order, whether or not WW2 is wanted
const brit = bankTasks(48000, make).map((t) => t && t[0] + '.' + t[1]).join(' ');
const both = bankTasks(48000, make, { ww2: true });
const only = bankTasks(48000, make, { ww2: 'only' }).map((t) => t[0] + '.' + t[1]);
const britIdentical = both.slice(0, brit.split(' ').length).map((t) => t && t[0] + '.' + t[1]).join(' ') === brit;
for (const task of both) {
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
/** `x` at `sr` resampled to 48 kHz (linear). */
const resample48 = (x, sr) => {
  const step = sr / 48000, n = Math.floor(x.length / step), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * step, j = Math.floor(p), f = p - j; o[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f; }
  return o;
};
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

// ---- WW2
const ac = (b, from, dur, lagLo, lagHi) => {
  // normalized autocorrelation peak for lags lagLo..lagHi s (periodicity) and its lag
  const x = mono(b), i0 = Math.round(from * b.sr), n = Math.round(dur * b.sr);
  let e = 0;
  for (let i = 0; i < n; i++) e += x[i0 + i] ** 2;
  let best = -1, at = 0;
  for (let L = Math.round(lagLo * b.sr); L <= Math.round(lagHi * b.sr); L++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i0 + i] * (x[i0 + i + L] || 0);
    if (s / e > best) (best = s / e), (at = L / b.sr);
  }
  return { r: best, lag: at };
};
/** Strongest frequency between lo and hi Hz in a 4096-sample window at t s. */
const peakF = (b, t, lo, hi) => {
  const n = 4096, re = new Float64Array(n), im = new Float64Array(n), x = mono(b), i0 = Math.round(t * b.sr);
  for (let i = 0; i < n; i++) re[i] = (x[i0 + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  fft(re, im);
  let best = 0, f = 0;
  for (let k = 1; k < n / 2; k++) {
    const fk = (k * b.sr) / n, p = re[k] * re[k] + im[k] * im[k];
    if (fk >= lo && fk <= hi && p > best) (best = p), (f = fk);
  }
  return f;
};
const rmsAt = (b, t, w = 0.25) => {
  const x = mono(b), i0 = Math.round(t * b.sr), n = Math.round(w * b.sr);
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i0 + i] || 0) ** 2;
  return Math.sqrt(s / n);
};
const W = (k, i = 0) => keep[k]?.[i];
console.log(`\nWW2 banks (${only.length} tasks), British task list unchanged: ${britIdentical}`);
check(britIdentical, 'the WW2 banks changed the British task list');
for (const k of only) check(!!keep[k], k + ' missing');
const g15 = W('gun_huge.near'), gC = W('gun_colossal.near');
if (g15 && gC) {
  const a = spectrum(g15), b = spectrum(gC), ea = envelope(g15, 0.005), eb = envelope(gC, 0.005);
  const end = (e) => { const top = Math.max(...e); let k = 0; for (let i = 0; i < e.length; i++) if (e[i] > top * 0.0316) k = i; return k * 0.005; };
  console.log(`colossal gun: lo ${(b.lo * 100).toFixed(0)}% (15in ${(a.lo * 100).toFixed(0)}%), centroid ${b.centroid.toFixed(0)} (${a.centroid.toFixed(0)}), -30dB at ${end(eb).toFixed(1)} s (${end(ea).toFixed(1)})`);
  check(b.lo > a.lo, 'Karl and Gustav should carry more sub-bass than the 15-inch');
  check(b.centroid < a.centroid, 'Karl and Gustav should be darker than the 15-inch');
  check(end(eb) > end(ea), 'Karl and Gustav should roll on longer than the 15-inch');
}
const bh = W('burst_ground_huge.near'), bC = W('burst_ground_colossal.near');
if (bh && bC) {
  const a = spectrum(bh), b = spectrum(bC);
  console.log(`colossal burst: lo ${(b.lo * 100).toFixed(0)}% (15in ${(a.lo * 100).toFixed(0)}%), centroid ${b.centroid.toFixed(0)} (${a.centroid.toFixed(0)}), ${(mono(bC).length / bC.sr).toFixed(1)} s`);
  check(b.centroid < a.centroid && b.lo > a.lo, 'the colossal burst should be deeper than the 15-inch burst');
}
for (const key of ['loop.moan', 'loop.buzz', 'loop.v2', 'loop.sabre', 'loop.siren']) {
  const b = W(key);
  if (!b) continue;
  const x = mono(b);
  let s = 0;
  for (const v of x) s += v * v;
  const jump = Math.abs(x[x.length - 1] - x[0]) / Math.sqrt(s / x.length), sp = spectrum(b);
  console.log(`${key.padEnd(16)} ${(x.length / b.sr).toFixed(1)} s  seam ${jump.toFixed(2)}  centroid ${sp.centroid.toFixed(0)}  <100 Hz ${(sp.lo * 100).toFixed(0)}%`);
  check(jump < 3, key + ' does not loop cleanly');
}
const buzz = W('loop.buzz');
if (buzz) {
  const p = ac(buzz, 0.2, 0.5, 1 / 60, 1 / 38), sp = spectrum(buzz);
  console.log(`V-1 buzz: period ${(1 / p.lag).toFixed(1)} pulses/s, autocorrelation ${p.r.toFixed(2)}, >2 kHz ${(sp.hi * 100).toFixed(0)}%`);
  check(p.r > 0.5 && 1 / p.lag > 44 && 1 / p.lag < 50, 'the pulse jet should beat 45 to 50 times a second');
  check(sp.hi > 0.04, 'the pulse jet should be harsh (energy above 2 kHz)');
}
const moan = W('loop.moan'), tear = W('loop.tear');
if (moan && tear) {
  const m = spectrum(moan).centroid, t = spectrum(tear).centroid;
  console.log(`rocket moan centroid ${m.toFixed(0)} Hz (shell tear ${t.toFixed(0)})`);
  check(m < t && m > 300, 'the rocket moan should sit below the shell tear and above the train');
}
const rk = W('rocket.near');
if (rk) {
  const f0 = peakF(rk, 0.05, 150, 1500), f1 = peakF(rk, 0.8, 150, 1500), late = rmsAt(rk, 3.6) / rmsAt(rk, 0.6);
  console.log(`Nebelwerfer launch: howl ${f0.toFixed(0)} Hz at 0.05 s -> ${f1.toFixed(0)} Hz at 0.8 s, level at 3.6 s ${db(late)} dB of 0.6 s`);
  check(f1 > f0 * 1.3, 'the Nebelwerfer howl should rise');
  check(late < 0.2, 'the rocket should be gone after the motor burns out');
}
const v1l = W('v1.launch');
if (v1l) {
  const hiss = spectrum(v1l, 0, 0.8).hi, p = ac(v1l, 2.2, 0.6, 1 / 60, 1 / 35);
  console.log(`V-1 launch: >2 kHz share in the first 0.8 s ${(hiss * 100).toFixed(0)}%, pulse jet after 2.2 s ${(1 / p.lag).toFixed(1)} /s (r ${p.r.toFixed(2)})`);
  check(hiss > 0.08, 'the catapult should hiss');
  check(p.r > 0.3, 'the pulse jet should be heard leaving after the catapult');
}
const boom = W('v2.boom');
if (boom) {
  const e = envelope(boom, 0.002), top = Math.max(...e), peaks = [];
  for (let i = 1; i < e.length - 1; i++) if (e[i] > 0.5 * top && e[i] >= e[i - 1] && e[i] >= e[i + 1] && (!peaks.length || i - peaks[peaks.length - 1] > 25)) peaks.push(i);
  const gap = peaks.length > 1 ? (peaks[1] - peaks[0]) * 0.002 : 0;
  console.log(`V-2 sonic boom: ${peaks.length} cracks, ${(gap * 1000).toFixed(0)} ms apart`);
  check(peaks.length === 2 && gap > 0.1 && gap < 0.25, 'the sonic boom should be a double crack');
}
const v2m = W('v2.main'), v2p = W('v2.pre');
if (v2m && v2p) {
  const a = rmsAt(v2m, 2), b = rmsAt(v2m, 12), sm = spectrum(v2m, 0.5, 3), sp = spectrum(v2p, 0.5, 3);
  console.log(`V-2 main stage: ${db(b / a)} dB at 12 s against 2 s, centroid ${sm.centroid.toFixed(0)} Hz, <100 Hz ${(sm.lo * 100).toFixed(0)}%; pre-stage centroid ${sp.centroid.toFixed(0)} Hz`);
  check(b / a < 0.2, 'the V-2 roar should fade as it climbs');
  check(sm.centroid > sp.centroid, 'the pre-stage should be the lower roar');
  check(sm.lo > 0.08, 'the V-2 should rumble');
}
const sir = W('loop.siren');
if (sir) {
  const lo = peakF(sir, 0, 100, 800), hi = peakF(sir, 3.8, 100, 800);
  console.log(`siren: ${lo.toFixed(0)} Hz at the bottom of the wail, ${hi.toFixed(0)} Hz at the top`);
  check(hi > lo * 2, 'the siren should wail up and down');
}
const sab = W('loop.sabre');
if (sab) {
  const sp = spectrum(sab), p = ac(sab, 0.2, 0.5, 1 / 120, 1 / 80);
  console.log(`Sabre: centroid ${sp.centroid.toFixed(0)} Hz, propeller beat ${(1 / p.lag).toFixed(0)} Hz (r ${p.r.toFixed(2)})`);
  check(sp.centroid < 1500 && sp.centroid > 200, 'the Sabre should be a growl, not a whine');
}

// ---- everything built from the recordings (recordingTasks, the guns by recordedGunTasks): Node cannot decode the
// mp3s, so synthesized sounds stand in for them, placed where each recording's slices start; this checks the code
// paths, the levels and the order of the classes, not the sound of the recordings (hear those on /audio.html)
const STAND = { crack: 'gun_light', snap: 'gun_field', body: 'gun_med', boom: 'gun_heavy', blast: 'burst_ground_med', distant: 'thud.far', cannon: 'gun_field', brass: 'load.clang' };
const stand = {};
for (const [key, s] of Object.entries(RECORDINGS)) {
  const k = STAND[s.gun ?? key], shot = (keep[k] ?? keep[k + '.near'])[0], src = resample48(mono(shot), shot.sr);
  const data = new Float32Array(Math.ceil((Math.max(...s.slices.map(([a, l]) => a + l)) + 1) * 48000));
  for (const [a] of s.slices) data.set(src.subarray(0, Math.min(src.length, data.length - Math.round(a * 48000))), Math.round(a * 48000));
  stand[key] = { data, sr: 48000 };
}
const synthOf = (group, key) => keep[group + '.' + key]?.map((b) => ({ data: mono(b), sr: b.sr })) ?? null;
const ALL = ['light', 'field', 'med', 'heavy', 'huge', 'colossal', 'paris'];
const recTasks = recordingTasks(48000, make, stand, synthOf, ALL);
const abTasks = recordingTasks(48000, make, stand, synthOf, ALL, { keepSynth: true });
console.log(`\nFROM RECORDINGS (stand-ins): ${recTasks.length} banks (${abTasks.length} keeping the synthesized guns for the A/B)`);
check(recTasks.filter((t) => t[3] === 'gun').length === 21, 'every class of gun should be built from the recordings');
check(recTasks.length === 33 && abTasks.length === 38, 'the recordings should give the guns, the far and near bursts, the thuds and the case');
check(abTasks.findIndex((t) => t[0] === 'gun_med' && t[3] === true) < abTasks.findIndex((t) => t[0] === 'gun_med' && t[3] === 'gun'), 'the A/B cannon blend must come before the recorded gun');
const recStats = {};
for (const [group, key, fn] of recTasks) {
  const t = performance.now(), out = fn(), ms = performance.now() - t;
  for (const [i, b] of out.entries()) {
    const x = mono(b);
    let p = 0, s = 0, nan = 0;
    for (const v of x) if (!Number.isFinite(v)) nan++; else { p = Math.max(p, Math.abs(v)); s += v * v; }
    const issue = nan ? `NaN x${nan}` : p < 0.05 ? 'SILENT' : p > 1.0001 ? 'CLIPS' : '';
    if (issue) { bad++; console.log(`  ${group}.${key}[${i}] ${issue}`); }
  }
  const b = out[0], e = envelope(b, 0.005), top = Math.max(...e);
  let end = 0;
  for (let k = 0; k < e.length; k++) if (e[k] > top * 0.0316) end = k;
  const sp = spectrum(b);
  if (key === 'near') recStats[group.slice(4)] = { end: end * 0.005, lo: sp.lo, cen: sp.centroid };
  console.log(`${(group + '.' + key).padEnd(18)} x${out.length}  ${(mono(b).length / b.sr).toFixed(1)} s  -30dB at ${(end * 0.005).toFixed(1)} s  lo ${(sp.lo * 100).toFixed(0).padStart(3)}%  centroid ${sp.centroid.toFixed(0).padStart(4)}  ${ms.toFixed(0).padStart(4)} ms`);
}
if (recStats.huge && recStats.field) {
  check(recStats.huge.end > recStats.field.end, 'the recorded 15-inch should ring longer than the field gun');
  check(recStats.huge.cen < recStats.field.cen, 'the recorded 15-inch should be darker than the field gun');
}

console.log('\nCLASSES: ' + [2.95, 3.3, 5, 6, 8, 9.2, 12, 15, 16.5, 18, 23.6, 31.5].map((c) => `${c} in -> ${classOf(c)}`).join(', '));
console.log(`\n${bad ? bad + ' problem buffers' : 'all buffers sound'}, ${fail.length} failed checks, ${(performance.now() - t0).toFixed(0)} ms total`);
process.exit(bad || fail.length ? 1 : 0);

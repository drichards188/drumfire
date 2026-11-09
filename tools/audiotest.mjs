// Renders every synthesized sound bank offline and reports duration, peak, RMS and problems, then
// checks the guns, bursts and loops for the properties that make them sound right, the British banks and the
// WW2 (German side) ones. Exits 1 on a failure.
//   node tools/audiotest.mjs            (--record: print the bank hashes of this build, to paste into HASHES below)
import { bankTasks, classOf, recordingTasks, RECORDINGS, heroRecTasks } from '../src/audio.js';
import { heroTasks, HERO, FOLEY_CUES } from '../src/audioHero.js';

const make = (chans, sr) => ({ chans, sr });
const rows = [];
const keep = {}; // every buffer of every bank, for the analysis below
let bad = 0;
const t0 = performance.now();
const RECORD = process.argv.includes('--record');
// Every bank's samples, hashed (FNV-1a over the float bits of every channel of every take, with the lengths and rates):
// the British, WW2 and WW1 banks and everything built from the recordings' stand-ins must render bit-identically to the
// build these were recorded from (2026-11-07, before the max-quality battery's sound: src/audioDsp.js, src/audioHero.js).
const hashOf = (out) => {
  let h = 0x811c9dc5;
  const mix = (w) => { h = Math.imul(h ^ w, 16777619); };
  for (const b of out) {
    mix(b.sr | 0);
    for (const c of b.chans) {
      mix(c.length);
      const u = new Uint32Array(c.buffer, c.byteOffset, c.length);
      for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const hashes = {};
// the British game must render the same banks as before, in the same order, whether or not WW2 is wanted
const brit = bankTasks(48000, make).map((t) => t && t[0] + '.' + t[1]).join(' ');
const both = bankTasks(48000, make, { ww2: true });
const only = bankTasks(48000, make, { ww2: 'only' }).map((t) => t[0] + '.' + t[1]);
const britIdentical = both.slice(0, brit.split(' ').length).map((t) => t && t[0] + '.' + t[1]).join(' ') === brit;
// the WW1 German mode's banks (the Paris Gun), hashed only
for (const [group, key, fn] of bankTasks(48000, make, { ww1: 'only' })) hashes['ww1:' + group + '.' + key] = hashOf(fn());
for (const task of both) {
  if (!task) continue;
  const [group, key, fn] = task;
  const t = performance.now();
  const out = fn();
  const ms = performance.now() - t;
  keep[group + '.' + key] = out;
  hashes[group + '.' + key] = hashOf(out);
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
  hashes['rec:' + group + '.' + key] = hashOf(out);
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

// ---- HERO mrs18: the max-quality battery's banks (src/audioHero.js), as a page with { hero: { kinds: ['mrs18'] } } builds
// them: after every other bank, in both of the worker's jobs (the recordings' stand-ins above for the second)
{
  const kinds = ['mrs18'], H = HERO.mrs18;
  const th = performance.now(), synthT = heroTasks(48000, make, kinds), recT = heroRecTasks(48000, make, stand, kinds), hb = {};
  let bytes = 0;
  for (const [group, key, fn] of [...synthT, ...recT]) {
    const out = fn(), id = group + '.' + key, rec = !!hb[id];
    if (rec) hb[id + ':synth'] = hb[id];
    hb[id] = out;
    for (const [i, b] of out.entries()) {
      let pk = 0, nan = 0;
      for (const c of b.chans) for (const v of c) if (!Number.isFinite(v)) nan++; else pk = Math.max(pk, Math.abs(v));
      if (!rec) bytes += b.chans.reduce((n, c) => n + c.byteLength, 0);
      const issue = nan ? `NaN x${nan}` : pk < 0.05 ? 'SILENT' : pk > 1.0001 ? 'CLIPS' : '';
      if (issue) { bad++; console.log(`  ${id}[${i}] ${issue}`); }
    }
  }
  // the build time, warm (a second build, as the worker's JIT would be after the other banks): the faster of the two
  const th2 = performance.now();
  for (const [, , fn] of [...heroTasks(48000, make, kinds), ...heroRecTasks(48000, make, stand, kinds)]) fn();
  const ms = Math.min(performance.now() - th2, th2 - th);
  console.log(`\nHERO mrs18: ${synthT.length} banks + ${recT.length} from the recordings, ${(bytes / 1e6).toFixed(1)} MB, built in ${ms.toFixed(0)} ms`);
  check(ms < 600, `the hero banks should build in under 600 ms (${ms.toFixed(0)} ms)`);
  check(bytes < 20e6, `the hero banks should hold under 20 MB (${(bytes / 1e6).toFixed(1)} MB)`);
  check(synthT.every(([g, k]) => !keep[g + '.' + k]), 'a hero bank takes the name of a bank of the game');
  for (const k of ['crack', 'bow', 'body', 'tail', 'mech', 'runout', 'pressure', 'burst']) check(!!hb[H.group + '.' + k], `${H.group}.${k} missing`);
  for (const c of FOLEY_CUES.mrs18) check(!!hb[(c.group ?? H.foley) + '.' + c.s], `${c.group ?? H.foley}.${c.s} (a drill cue) missing`);
  for (const k of ['step_grate', 'step_earth', 'step_mud', 'step_grass', 'kit', 'wheelMark', 'wheelStop', 'fireLever']) check(!!hb[H.foley + '.' + k], `${H.foley}.${k} missing`);
  const B = (k, i = 0) => hb[k]?.[i];
  // the energy share above f0 (and under 100 Hz) between t0 and t1 s, a Tukey window with 1 ms tapers
  const share = (b, t0, t1, f0 = 2000) => {
    const x = mono(b), sr = b.sr, i0 = Math.max(0, Math.round(t0 * sr)), L = Math.min(x.length, Math.round(t1 * sr)) - i0, tp = Math.round(0.001 * sr);
    let n = 1;
    while (n < L) n <<= 1;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < L; i++) re[i] = x[i0 + i] * (i < tp ? 0.5 - 0.5 * Math.cos((Math.PI * i) / tp) : i > L - tp ? 0.5 - 0.5 * Math.cos((Math.PI * (L - i)) / tp) : 1);
    fft(re, im);
    let m = 0, h = 0, lo = 0;
    for (let k = 1; k < n / 2; k++) { const pw = re[k] * re[k] + im[k] * im[k], f = (k * sr) / n; m += pw; if (f > f0) h += pw; if (f < 100) lo += pw; }
    return { hi: h / m, lo: lo / m };
  };
  const onsetOf = (b) => { const x = mono(b); let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); let i = 0; while (i < x.length && Math.abs(x[i]) < 0.1 * m) i++; return { i, m }; };
  const minus30 = (b, win = 0.025) => { const e = envelope(b, win), top = Math.max(...e); let end = 0; for (let k = 0; k < e.length; k++) if (e[k] > top * 0.0316) end = k; return (end + 1) * win; };
  const worstStep = (b, t0, t1, win = 0.025) => { const e = envelope(b, win); let w = 0; for (let k = Math.round(t0 / win); k < Math.min(e.length - 1, Math.round(t1 / win)); k++) w = Math.max(w, Math.abs(20 * Math.log10((e[k] + 1e-9) / (e[k + 1] + 1e-9)))); return w; };
  {
    let worst90 = 0, minHi = 1;
    for (const b of hb[H.group + '.crack']) {
      const x = mono(b), { i, m } = onsetOf(b);
      let j = i;
      while (j < x.length && Math.abs(x[j]) < 0.9 * m) j++;
      worst90 = Math.max(worst90, ((j - i) / b.sr) * 1000);
      minHi = Math.min(minHi, share(b, i / b.sr, i / b.sr + 0.01).hi);
    }
    console.log(`crack: 10 to 90 % in ${worst90.toFixed(2)} ms at most, > 2 kHz in its first 10 ms at least ${(minHi * 100).toFixed(1)} %`);
    check(worst90 < 1, 'the crack should rise to 90 % within 1 ms');
    check(minHi >= 0.25, 'the crack should hold at least 25 % of its first 10 ms above 2 kHz');
  }
  for (const id of [H.group + '.body:synth', H.group + '.body']) {
    const list = hb[id] ?? [];
    let lo = 1, e30a = 99, e30b = 0;
    for (const b of list) {
      const { i } = onsetOf(b), t = i / b.sr;
      lo = Math.min(lo, share(b, t + 0.06, t + 0.5).lo);
      const e30 = minus30(b);
      e30a = Math.min(e30a, e30);
      e30b = Math.max(e30b, e30);
    }
    console.log(`${id.padEnd(22)} x${list.length}: < 100 Hz from 60 to 500 ms at least ${(lo * 100).toFixed(0)} %, -30 dB at ${e30a.toFixed(1)} to ${e30b.toFixed(1)} s`);
    check(lo >= 0.5, `${id}: at least 50 % under 100 Hz from 60 to 500 ms`);
    check(e30a >= 1.2 && e30b <= 3.4, `${id}: down 30 dB between 1.2 and 3.4 s (the tail carries on)`);
  }
  for (const id of [H.group + '.tail:synth', H.group + '.tail']) {
    const list = hb[id] ?? [];
    let step = 0, e30a = 99, e30b = 0;
    for (const b of list) {
      step = Math.max(step, worstStep(b, 0.3, 5));
      const e30 = minus30(b);
      e30a = Math.min(e30a, e30);
      e30b = Math.max(e30b, e30);
    }
    console.log(`${id.padEnd(22)} x${list.length}: worst step between 25 ms windows from 0.3 to 5 s ${step.toFixed(1)} dB, -30 dB at ${e30a.toFixed(1)} to ${e30b.toFixed(1)} s`);
    check(step <= 9, `${id}: continuous (no step over 9 dB between 25 ms windows from 0.3 to 5 s)`);
    check(e30a >= 5 && e30b <= 8, `${id}: down 30 dB between 5 and 8 s`);
  }
  {
    // the report as the engine lays it (AudioEngine.heroGun): the crack, the body 1 ms on, the tail 45 ms on at H.tail,
    // all at 48 kHz: one continuous roll from the shot into the landscape's answer (the synthesized takes: the stand-ins
    // for the recordings here are guns with an echo of their own; /audio.html?hero=mrs18 measures the real ones)
    const up = (b) => (b.sr === 48000 ? mono(b) : resample48(mono(b), b.sr));
    let step = 0, e30a = 99, e30b = 0;
    for (let k = 0; k < 3; k++) {
      const cr = up(B(H.group + '.crack', k)), bo = up(B(H.group + '.body:synth', k)), ta = up(B(H.group + '.tail:synth', k));
      const x = new Float32Array(Math.round(8.2 * 48000));
      for (const [y, at, g] of [[cr, 0, 1], [bo, 0.001, 1], [ta, 0.045, H.tail]]) for (let i = 0, i0 = Math.round(at * 48000); i < y.length && i0 + i < x.length; i++) x[i0 + i] += y[i] * g;
      const b = { chans: [x], sr: 48000 };
      step = Math.max(step, worstStep(b, 0.3, 5));
      const e30 = minus30(b);
      e30a = Math.min(e30a, e30);
      e30b = Math.max(e30b, e30);
    }
    console.log(`report (crack + body + tail as heroGun lays them): worst step 0.3 to 5 s ${step.toFixed(1)} dB, -30 dB at ${e30a.toFixed(1)} to ${e30b.toFixed(1)} s`);
    check(step <= 9, 'the report should roll on without a gap (no step over 9 dB between 25 ms windows from 0.3 to 5 s)');
    check(e30a >= 3 && e30b <= 8, 'the report with its tail should sound for 3 to 8 s (dry: the engine\'s compressor holds it longer)');
  }
  // the energy-weighted mean frequency of a sound's first `t1` s (a Tukey window: spectrum() above tapers the onset away)
  const cen = (k, t1 = 0.4) => {
    const b = B(k), x = mono(b), sr = b.sr, L = Math.min(x.length, Math.round(t1 * sr)), tp = Math.round(0.001 * sr);
    let n = 1;
    while (n < L) n <<= 1;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < L; i++) re[i] = x[i] * (i < tp ? 0.5 - 0.5 * Math.cos((Math.PI * i) / tp) : i > L - tp ? 0.5 - 0.5 * Math.cos((Math.PI * (L - i)) / tp) : 1);
    fft(re, im);
    let m = 0, mf = 0;
    for (let q = 1; q < n / 2; q++) { const pw = re[q] * re[q] + im[q] * im[q]; m += pw; mf += pw * (q * sr) / n; }
    return mf / m;
  };
  const mech = cen(H.group + '.mech'), grate = cen(H.foley + '.step_grate'), earth = cen(H.foley + '.step_earth'), lock = cen(H.foley + '.blockLock'), stop = cen(H.foley + '.blockStop');
  const cd = B(H.foley + '.caseDrop'), cdF = peakF(cd, 0, 150, 3000), cdE = envelope(cd, 0.01), cdTop = Math.max(...cdE), cd05 = 20 * Math.log10(cdE[50] / cdTop);
  console.log(`mech centroid ${mech.toFixed(0)} Hz; caseDrop strongest partial ${cdF.toFixed(0)} Hz, ${cd05.toFixed(0)} dB at 0.5 s; steps: grating ${grate.toFixed(0)} Hz, earth ${earth.toFixed(0)} Hz; block: lock ${lock.toFixed(0)} Hz, stop ${stop.toFixed(0)} Hz`);
  check(mech > 800, 'the gun steel should ring above 800 Hz');
  check(cdF >= 250 && cdF <= 600 && cd05 > -30, 'the case should ring low (250 to 600 Hz) and still sound at 0.5 s');
  check(grate >= 1.5 * earth, 'boots on the grating should be brighter than on the earth');
  check(lock < stop, 'the block locking should be deeper than its stop');
  for (const k of ['loop.mlaf_elev', 'loop.mlaf_trav']) {
    const x = mono(B(k));
    let q = 0;
    for (const v of x) q += v * v;
    const jump = Math.abs(x[x.length - 1] - x[0]) / Math.sqrt(q / x.length);
    console.log(`${k.padEnd(16)} ${(x.length / B(k).sr).toFixed(1)} s  seam ${jump.toFixed(2)}  centroid ${spectrum(B(k)).centroid.toFixed(0)}`);
    check(jump < 3, k + ' does not loop cleanly');
  }
  const pr = mono(B(H.group + '.pressure'));
  let dc = 0;
  for (const v of pr) dc += v;
  check(Math.abs(dc / pr.length) < 0.01, 'the pressure pulse should carry no DC');
}

// ---- bit identity of every bank against the recorded build (HASHES)
if (RECORD) console.log('\nHASHES = ' + JSON.stringify(hashes));
else {
  const HASHES = recordedHashes();
  const want = Object.keys(HASHES), changed = want.filter((k) => hashes[k] !== HASHES[k]), extra = Object.keys(hashes).filter((k) => !(k in HASHES));
  console.log(`\nBANK HASHES: ${want.length - changed.length} of ${want.length} banks bit-identical to the recorded build${extra.length ? `, ${extra.length} new: ${extra.join(' ')}` : ''}`);
  for (const k of changed) console.log(`  ${k}: ${hashes[k] ?? 'missing'} (was ${HASHES[k]})`);
  check(!changed.length, `${changed.length} banks changed: ${changed.slice(0, 8).join(' ')}`);
}
console.log(`\n${bad ? bad + ' problem buffers' : 'all buffers sound'}, ${fail.length} failed checks, ${(performance.now() - t0).toFixed(0)} ms total`);
process.exit(bad || fail.length ? 1 : 0);

// the bank hashes of the build before the max-quality battery's sound (node tools/audiotest.mjs --record)
function recordedHashes() {
  return {
    'ww1:gun_paris.near': '2b643b74', 'ww1:gun_paris.mid': '60568a49', 'ww1:gun_paris.far': '8b0a6689',
    'loop.tear': '5a0c7693', 'loop.rush': 'd4b45800', 'loop.whistle': 'a9688001', 'loop.train': 'd85e8dc0',
    'loop.scream': '51bc59f7', 'ui.click': '4846203c', 'slap.small': '3c1279f5', 'slap.big': 'b40260d4',
    'gun_field.near': '6df301fd', 'gun_field.mid': '63a0ca16', 'gun_field.far': 'a542aace',
    'gun_huge.near': 'b8227327', 'gun_huge.mid': '0f5f06be', 'gun_huge.far': 'd93adf90',
    'burst_ground_med.near': '176e2bd8', 'burst_ground_med.mid': '7072560c', 'burst_ground_med.far': 'f8a3a1db',
    'burst_ground_huge.near': 'b12d5002', 'burst_ground_huge.mid': '21e70129', 'burst_ground_huge.far': '9c942ecf',
    'gun_light.near': '9da2799d', 'gun_light.mid': 'e0ffbdaf', 'gun_light.far': 'cd72330d',
    'gun_med.near': '355a2f45', 'gun_med.mid': '79b02386', 'gun_med.far': '58744864', 'gun_heavy.near': '8ea6d8b3',
    'gun_heavy.mid': 'e5f30677', 'gun_heavy.far': 'c47b41c8', 'burst_ground_light.near': 'a514868d',
    'burst_ground_light.mid': '2f1072a8', 'burst_ground_light.far': 'bb5cd3f4',
    'burst_ground_field.near': 'deb6eb89', 'burst_ground_field.mid': '611195d6',
    'burst_ground_field.far': '0842dfc9', 'burst_ground_heavy.near': '04042716',
    'burst_ground_heavy.mid': '94f80b71', 'burst_ground_heavy.far': '0cd318e3', 'burst_air_light.near': '56dd5daa',
    'burst_air_light.mid': '5b571cbe', 'burst_air_light.far': 'ee48abf8', 'burst_air_field.near': '79deb86a',
    'burst_air_field.mid': '096cc8d4', 'burst_air_field.far': 'af1ec399', 'burst_air_med.near': '2c413cd5',
    'burst_air_med.mid': '5a1f9fad', 'burst_air_med.far': '6ec00085', 'burst_air_heavy.near': '47f23f62',
    'burst_air_heavy.mid': '8b32e9c3', 'burst_air_heavy.far': '2a8178c9', 'tremor.small': '5697f976',
    'tremor.big': '1de27fca', 'loop.drumfire': '61cd955a', 'loop.rain': '03fffeac', 'thud.far': 'c882782d',
    'load.trolley': 'a66a9b60', 'load.crane': 'e43f61a5', 'load.ram': '609e7273', 'load.breech': 'e8c6ef0f',
    'load.screw': 'ef5cd939', 'load.clang': '86fb23e8', 'load.cartridge': '29a3d510', 'load.ready': '6f0c54f5',
    'load.fire': '31f5cead', 'flare.pop': 'be57a4a0', 'flare.hiss': '9b1bae89', 'cook.crackle': 'be68a351',
    'ui.phone': 'da88c6f1', 'ui.wireless': 'cb3eeed8', 'ui.paper': '3a886fab', 'ui.bell': '76b17c6f',
    'ui.whistle': '2c3e3561', 'loop.moan': 'a6c6bc0c', 'loop.buzz': '537cec7b', 'rocket.near': 'ddfd9dca',
    'rocket.far': '6a6f5ee5', 'v1.launch': '6f6ba523', 'v1.far': '747c9eda', 'loop.v2': 'ace60a98',
    'v2.pre': '137c0ba7', 'v2.main': '4955338c', 'v2.ignite': '718bfbc1', 'v2.boom': '77807497',
    'v2.fall': 'e39978f9', 'loop.sabre': '302e23bd', 'loop.siren': '3a94df7a', 'ui.feld': 'b9f3ea2a',
    'ui.funk': '0620effb', 'gun_colossal.near': '8d71ed08', 'gun_colossal.mid': '760f560d',
    'gun_colossal.far': '9f89c8a4', 'burst_ground_colossal.near': 'c2098db8',
    'burst_ground_colossal.mid': 'e0f45820', 'burst_ground_colossal.far': 'e04f78f2',
    'rec:burst_ground_light.far': 'e2fd53c5', 'rec:burst_ground_field.far': '019583a6',
    'rec:burst_ground_med.far': '9344037c', 'rec:burst_ground_heavy.far': '4ed569f1',
    'rec:burst_ground_huge.far': 'c4a53e6e', 'rec:thud.far': 'ac27a4fb', 'rec:burst_ground_light.near': 'b583ac39',
    'rec:burst_ground_field.near': 'd3c69f3f', 'rec:burst_ground_med.near': '17988bf1',
    'rec:burst_ground_heavy.near': '0b112389', 'rec:burst_ground_huge.near': '26b94a3f', 'rec:load.case': '6e2304cc',
    'rec:gun_light.near': 'b7925572', 'rec:gun_light.mid': 'b5b7580f', 'rec:gun_light.far': '1c23e1a7',
    'rec:gun_field.near': '8d728e4a', 'rec:gun_field.mid': 'cbaa4132', 'rec:gun_field.far': 'b7291bb1',
    'rec:gun_med.near': '0c682389', 'rec:gun_med.mid': '3a19d6d4', 'rec:gun_med.far': '51a3c050',
    'rec:gun_heavy.near': '6c438166', 'rec:gun_heavy.mid': 'cdc14b07', 'rec:gun_heavy.far': 'b439275a',
    'rec:gun_huge.near': '390aa6d7', 'rec:gun_huge.mid': 'dc745a5f', 'rec:gun_huge.far': 'd7884dfb',
    'rec:gun_colossal.near': 'bc05595c', 'rec:gun_colossal.mid': '24b05952', 'rec:gun_colossal.far': '56612943',
    'rec:gun_paris.near': '7bfb5bcc', 'rec:gun_paris.mid': '69f64191', 'rec:gun_paris.far': 'ae9b858f',
  };
}

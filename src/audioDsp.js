// The offline synthesis helpers every sound bank is built from (moved unchanged out of src/audio.js on 2026-11-07, so
// the max-quality battery's banks in src/audioHero.js share them; tools/audiotest.mjs checks every bank still renders
// bit-identically): a seeded random stream, RBJ biquads, envelopes and noise layers, the Friedlander blast wave, damped
// thumps and struck-metal modes, the rolling echo, saturation, fades, resampling, distant renderings and loop helpers.
// Plain Float32Array maths: no audio context, safe in Node and in workers.

export const TAU = Math.PI * 2;

export function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad run in place: 'lp', 'hp' or 'bp' (0 dB peak). */
export function biquad(x, sr, type, f, q = 0.707) {
  const w = (TAU * Math.min(f, sr * 0.45)) / sr;
  const cs = Math.cos(w), a = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') {
    b0 = (1 - cs) / 2;
    b1 = 1 - cs;
    b2 = b0;
  } else if (type === 'hp') {
    b0 = (1 + cs) / 2;
    b1 = -(1 + cs);
    b2 = b0;
  } else {
    b0 = a;
    b1 = 0;
    b2 = -a;
  }
  const a0 = 1 + a;
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  const c1 = (-2 * cs) / a0, c2 = (1 - a) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - c1 * y1 - c2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Low-pass whose cutoff follows f(t), updated every 32 samples. */
export function sweepLp(x, sr, f) {
  let y1 = 0, y2 = 0, x1 = 0, x2 = 0, b0 = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) {
      const w = (TAU * Math.min(f(i / sr), sr * 0.45)) / sr;
      const cs = Math.cos(w), a = Math.sin(w) / 1.414;
      const a0 = 1 + a;
      b0 = (1 - cs) / 2 / a0;
      b1 = (1 - cs) / a0;
      b2 = b0;
      c1 = (-2 * cs) / a0;
      c2 = (1 - a) / a0;
    }
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - c1 * y1 - c2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

export function onePole(x, sr, f) {
  const k = 1 - Math.exp((-TAU * f) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += k * (x[i] - y);
    x[i] = y;
  }
  return x;
}

export function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}

export function normalize(x, to = 1) {
  const p = peak(x);
  if (p > 0) {
    const k = to / p;
    for (let i = 0; i < x.length; i++) x[i] *= k;
  }
  return x;
}

/** White noise shaped by an attack/decay envelope, `dur` seconds long. */
export function burst(sr, r, dur, attack, decay) {
  const n = Math.ceil(dur * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] = (r() * 2 - 1) * (1 - Math.exp(-t / attack)) * Math.exp(-t / decay);
  }
  return x;
}

/** A filtered noise layer at unit peak. */
export function layer(sr, r, { dur, attack = 0.001, decay, type = 'lp', f, q = 0.707, sweep = null }) {
  const x = burst(sr, r, dur, attack, decay);
  if (sweep) sweepLp(x, sr, sweep);
  else biquad(x, sr, type, f, q);
  if (type === 'bp' || type === 'lp') biquad(x, sr, 'hp', 18);
  return normalize(x);
}

export function mixInto(dst, src, at, gain, sr) {
  const i0 = Math.round(at * sr);
  const n = Math.min(src.length, dst.length - i0);
  for (let i = 0; i < n; i++) dst[i0 + i] += src[i] * gain;
}

/** Like mixInto but wrapping around the end, so a loop's events have no seam. */
export function wrapInto(dst, src, at, gain, sr) {
  const n = dst.length, i0 = Math.round(at * sr) % n;
  for (let i = 0; i < src.length; i++) dst[(i0 + i) % n] += src[i] * gain;
}

/** Friedlander blast wave: instant (or `rise`) overpressure, positive phase T, then the suction phase. */
export function blast(x, sr, at, amp, T, b = 1.6, rise = 0.00006) {
  const i0 = Math.round(at * sr), n = Math.ceil(T * 7 * sr), nr = Math.max(1, Math.round(rise * sr));
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    const t = i / sr;
    let p = (1 - t / T) * Math.exp((-b * t) / T);
    if (i < nr) p *= i / nr;
    x[i0 + i] += amp * p;
  }
}

/** Damped sine whose pitch falls from f0 toward f1 with time constant tau. */
export function thump(x, sr, at, f0, f1, tau, amp, decay, attack = 0.0015) {
  const i0 = Math.round(at * sr);
  const n = Math.min(Math.ceil(decay * 7 * sr), x.length - i0);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-t / tau))) / sr;
    x[i0 + i] += amp * (1 - Math.exp(-t / attack)) * Math.exp(-t / decay) * Math.sin(ph);
  }
}

/** Struck metal: damped inharmonic modes [freq, amp, decay]. */
export function modes(x, sr, at, list, r, gain = 1) {
  const i0 = Math.round(at * sr);
  for (const [f, a, d] of list) {
    const n = Math.min(Math.ceil(d * 6 * sr), x.length - i0);
    const ph = r() * TAU, w = (TAU * f) / sr;
    for (let i = 0; i < n; i++) x[i0 + i] += gain * a * Math.exp(-i / sr / d) * Math.sin(ph + w * i);
  }
}

/** Rolling echo of a distant report off the ground, ruins, the Ypres ridges and the haze. */
export function roll(dst, src, sr, r, { count = 16, t0 = 0.15, t1 = 2, gain = 0.5, f = 600 }) {
  const dark = onePole(Float32Array.from(src), sr, f);
  onePole(dark, sr, f * 0.8);
  for (let k = 0; k < count; k++) {
    const u = Math.pow((k + r()) / count, 1.4);
    const d = t0 + (t1 - t0) * u;
    mixInto(dst, dark, d, gain * Math.exp(-2.6 * u) * (0.45 + 0.55 * r()), sr);
  }
}

export function saturate(x, drive) {
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(drive * x[i]) * k;
  return x;
}

/** Fade the last `sec` out so a buffer never ends on a click. */
export function tail(x, sr, sec = 0.05) {
  const n = Math.min(x.length, Math.round(sec * sr));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
}

/** Lower and longer (a bigger object), by resampling: `rate` under 1 lowers it. */
export function resample(x, rate) {
  const n = Math.floor(x.length / rate), o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate, j = Math.floor(p), f = p - j;
    o[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f;
  }
  return o;
}

/** Where a recorded shot starts: 5 ms before its first sample within 20 dB of the peak. */
export function onset(x, sr) {
  const m = peak(x) * 0.1;
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < m) i++;
  return Math.max(0, i - Math.round(0.005 * sr));
}

/** Distant versions: highs gone, a ground reflection and a rolling echo. */
export function distant(sr, r, dry, band, { len, roll: rl }) {
  const n = Math.ceil(len * sr);
  const x = new Float32Array(n);
  mixInto(x, dry, 0, 1, sr);
  mixInto(x, dry, 0.004 + r() * 0.008, 0.7, sr);
  roll(x, dry, sr, r, rl);
  if (band === 'far') {
    biquad(x, sr, 'lp', 600, 0.6);
    onePole(x, sr, 900);
  } else biquad(x, sr, 'lp', 3000, 0.6);
  biquad(x, sr, 'hp', 20);
  return [tail(normalize(x, 0.95), sr, 0.2)];
}

// ------------------------------------------------------------------ loop helpers

/** Crossfade the last (length - n) samples of x into its head (equal power) so n samples loop without a seam. */
export function seamless(x, n) {
  const m = x.length - n;
  const o = Float32Array.from(x.subarray(0, n));
  for (let i = 0; i < m; i++) {
    const w = (i / m) * Math.PI * 0.5;
    o[i] = x[i] * Math.sin(w) + x[n + i] * Math.cos(w);
  }
  return o;
}

/** n samples of looping noise shaped by `shape` (which filters its argument in place). */
export function loopNoise(sr, r, n, shape) {
  const m = Math.round(0.05 * sr), warm = Math.round(0.1 * sr);
  const x = new Float32Array(warm + n + m);
  for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  shape(x);
  return normalize(seamless(x.subarray(warm), n));
}

/** A sine added to a loop of `sec` seconds, its frequency snapped to a whole number of cycles. */
export function addTone(x, sr, f, amp, sec, ph = 0) {
  const w = (TAU * Math.max(1, Math.round(f * sec))) / sec / sr;
  for (let i = 0; i < x.length; i++) x[i] += amp * Math.sin(ph + w * i);
}

/** Whole cycles of f in `sec` seconds, as a frequency that loops. */
export const snap = (f, sec) => Math.max(1, Math.round(f * sec)) / sec;

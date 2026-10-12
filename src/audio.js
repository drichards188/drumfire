// Procedural audio for Drumfire: every sound is synthesized at runtime; a few real recordings in
// public/audio (sources and licenses in public/audio/CREDITS.md) are laid over the synthesized
// banks once they decode, and the game sounds right without them. Guns, bursts, shell flight loops,
// the loading crew and the console are pre-rendered into sample banks (see the offline synthesis
// section) and played back with per-shot variation. World sounds travel at 343 m/s (the ground
// shock of a heavy blast at 2500 m/s, ahead of the airborne bang), get air absorption and
// direction-only panning, are queued per frame and only the loudest few become voices; the rest
// feed the distant battle rumble. Shells in flight are a small pool of looping voices with Doppler.
// A close blast dulls the whole mix for a second (the pressure of the blast) and rings the ears.
//
// The engine core (routing, delay, absorption, voice stealing, bank building) comes from the
// iads and maxgfx frameworks. `new AudioEngine({ context })` takes an OfflineAudioContext for tests.
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const pick = (list) => (list && list.length ? list[Math.floor(Math.random() * list.length)] : null);
const smooth = (x, a, b) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// callers often pass scratch vectors they reuse at once: keep a copy of where the sound began
const here = (p) => ({ x: p.x, y: p.y, z: p.z });

const SOUND_SPEED = 343;
const GROUND_SPEED = 2500; // the shock through the earth outruns the air
const MAX_DELAY = 60; // a 15-inch 15 km away is heard 44 s after its flash
const MAX_VOICES = 64; // positional one-shots (buffer playback is cheap)
const DIRECT_VOICES = 24; // UI cues and ambience one-shots
const SHELL_VOICES = 6; // shells in flight that are heard at once, loudest first
const AUDIBLE = 0.002;

// per-frame caps and minimum spacing (s) for queued world events; close events get triple caps
const CAPS = { gun: 4, burst: 5, tremor: 2, load: 3, flare: 2, cook: 4 };
const GAPS = { gun: 0.02, burst: 0.02, tremor: 0.06, load: 0.05, flare: 0.2, cook: 0.05 };

// Real recordings in public/audio, cut into slices [start, length] (seconds, found by onset
// analysis) that replace or layer into the synthesized banks once both are ready; anything
// missing or undecodable leaves the synthesized sound in place.
const RECORDINGS = {
  blast: { file: 'explosion-182429.mp3', slices: [[0, 3]] }, // US government video (CC0)
  distant: { file: 'distant-explosions-438693.mp3', slices: [[1.35, 2.4], [6.2, 2.6], [14.1, 2.6], [29.0, 2.6], [34.35, 2.6], [48.1, 2.6], [53.6, 2.6], [72.4, 2.6], [76.15, 2.6], [87.4, 2.6]] }, // (CC0)
  cannon: { file: 'cannon-shot-187767.mp3', slices: [[0.1, 2.4], [6.36, 2.4]] }, // a gun's crack, laid under the field guns
  brass: { file: 'shell-casings-318964.mp3', slices: [[8.49, 0.4], [13.04, 0.25], [16.8, 0.2], [18.95, 0.5], [20.92, 0.25], [23.17, 0.5], [25.9, 0.3], [27.83, 0.5], [39.2, 0.5]] }, // (CC0)
};

// Gun classes by calibre in inches. cal: the calibre the recipe is tuned for; T: positive phase of the
// muzzle blast (s); crack / crackF: level and centre of the sharp snap; boom: the pressure thump
// [f0, f1, tau, decay]; bodyF: the roar's low-pass; len / roll: length and rolling echo of the
// near rendering [count, t1, gain, f]; ref / level: distance (m) at full level and loudness there;
// near / mid: distance bands (m) for the near, mid and far renderings; deaf: radius (m) in which the
// blast dulls the ears; slap: radius (m) of the direct shock; tremor: heard through the ground.
const CLS = {
  light: { cal: 3, T: 0.0035, crack: 1.7, crackF: 3400, boom: [115, 52, 0.05, 0.16], bodyF: 520, len: 2.6, roll: [8, 1.5, 0.2, 700], ref: 240, level: 1.0, near: 1000, mid: 5000, deaf: 14, slap: 40 },
  field: { cal: 5, T: 0.006, crack: 1.6, crackF: 2800, boom: [95, 42, 0.07, 0.22], bodyF: 400, len: 3.4, roll: [10, 2.4, 0.24, 600], ref: 320, level: 1.15, near: 1200, mid: 6000, deaf: 30, slap: 70 },
  med: { cal: 6, T: 0.01, crack: 1.1, crackF: 2200, boom: [78, 34, 0.09, 0.3], bodyF: 320, len: 4, roll: [12, 3, 0.28, 520], ref: 420, level: 1.25, near: 1500, mid: 7000, deaf: 45, slap: 110 },
  heavy: { cal: 9.2, T: 0.018, crack: 0.8, crackF: 1700, boom: [58, 24, 0.12, 0.42], bodyF: 250, len: 5.4, roll: [14, 4.2, 0.32, 430], ref: 620, level: 1.4, near: 2000, mid: 8000, deaf: 80, slap: 220 },
  huge: { cal: 15, T: 0.034, crack: 0.65, crackF: 1300, boom: [46, 15, 0.2, 0.62], bodyF: 200, len: 7.6, roll: [16, 6.4, 0.36, 340], ref: 880, level: 1.35, near: 2600, mid: 9000, deaf: 140, slap: 400 },
};
const ORDER = ['light', 'field', 'med', 'heavy', 'huge'];
export const classOf = (cal) => (cal < 4 ? 'light' : cal < 5.5 ? 'field' : cal < 7.5 ? 'med' : cal < 12 ? 'heavy' : 'huge');

// Loudness of the non-bank sounds (the banks are normalized, these scale them in the mix).
export const LEVELS = { ui: 0.32, drumfire: 0.5, rain: 0.22, wind: 0.08, thud: 0.5 };

// ================================================================== offline synthesis

const TAU = Math.PI * 2;

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad run in place: 'lp', 'hp' or 'bp' (0 dB peak). */
function biquad(x, sr, type, f, q = 0.707) {
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
function sweepLp(x, sr, f) {
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

function onePole(x, sr, f) {
  const k = 1 - Math.exp((-TAU * f) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += k * (x[i] - y);
    x[i] = y;
  }
  return x;
}

function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}

function normalize(x, to = 1) {
  const p = peak(x);
  if (p > 0) {
    const k = to / p;
    for (let i = 0; i < x.length; i++) x[i] *= k;
  }
  return x;
}

/** White noise shaped by an attack/decay envelope, `dur` seconds long. */
function burst(sr, r, dur, attack, decay) {
  const n = Math.ceil(dur * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] = (r() * 2 - 1) * (1 - Math.exp(-t / attack)) * Math.exp(-t / decay);
  }
  return x;
}

/** A filtered noise layer at unit peak. */
function layer(sr, r, { dur, attack = 0.001, decay, type = 'lp', f, q = 0.707, sweep = null }) {
  const x = burst(sr, r, dur, attack, decay);
  if (sweep) sweepLp(x, sr, sweep);
  else biquad(x, sr, type, f, q);
  if (type === 'bp' || type === 'lp') biquad(x, sr, 'hp', 18);
  return normalize(x);
}

function mixInto(dst, src, at, gain, sr) {
  const i0 = Math.round(at * sr);
  const n = Math.min(src.length, dst.length - i0);
  for (let i = 0; i < n; i++) dst[i0 + i] += src[i] * gain;
}

/** Like mixInto but wrapping around the end, so a loop's events have no seam. */
function wrapInto(dst, src, at, gain, sr) {
  const n = dst.length, i0 = Math.round(at * sr) % n;
  for (let i = 0; i < src.length; i++) dst[(i0 + i) % n] += src[i] * gain;
}

/** Friedlander blast wave: instant (or `rise`) overpressure, positive phase T, then the suction phase. */
function blast(x, sr, at, amp, T, b = 1.6, rise = 0.00006) {
  const i0 = Math.round(at * sr), n = Math.ceil(T * 7 * sr), nr = Math.max(1, Math.round(rise * sr));
  for (let i = 0; i < n && i0 + i < x.length; i++) {
    const t = i / sr;
    let p = (1 - t / T) * Math.exp((-b * t) / T);
    if (i < nr) p *= i / nr;
    x[i0 + i] += amp * p;
  }
}

/** Damped sine whose pitch falls from f0 toward f1 with time constant tau. */
function thump(x, sr, at, f0, f1, tau, amp, decay, attack = 0.0015) {
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
function modes(x, sr, at, list, r, gain = 1) {
  const i0 = Math.round(at * sr);
  for (const [f, a, d] of list) {
    const n = Math.min(Math.ceil(d * 6 * sr), x.length - i0);
    const ph = r() * TAU, w = (TAU * f) / sr;
    for (let i = 0; i < n; i++) x[i0 + i] += gain * a * Math.exp(-i / sr / d) * Math.sin(ph + w * i);
  }
}

/** Rolling echo of a distant report off the ground, ruins, the Ypres ridges and the haze. */
function roll(dst, src, sr, r, { count = 16, t0 = 0.15, t1 = 2, gain = 0.5, f = 600 }) {
  const dark = onePole(Float32Array.from(src), sr, f);
  onePole(dark, sr, f * 0.8);
  for (let k = 0; k < count; k++) {
    const u = Math.pow((k + r()) / count, 1.4);
    const d = t0 + (t1 - t0) * u;
    mixInto(dst, dark, d, gain * Math.exp(-2.6 * u) * (0.45 + 0.55 * r()), sr);
  }
}

function saturate(x, drive) {
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(drive * x[i]) * k;
  return x;
}

/** Fade the last `sec` out so a buffer never ends on a click. */
function tail(x, sr, sec = 0.05) {
  const n = Math.min(x.length, Math.round(sec * sr));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
}

/** Distant versions: highs gone, a ground reflection and a rolling echo. */
function distant(sr, r, dry, band, { len, roll: rl }) {
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
function seamless(x, n) {
  const m = x.length - n;
  const o = Float32Array.from(x.subarray(0, n));
  for (let i = 0; i < m; i++) {
    const w = (i / m) * Math.PI * 0.5;
    o[i] = x[i] * Math.sin(w) + x[n + i] * Math.cos(w);
  }
  return o;
}

/** n samples of looping noise shaped by `shape` (which filters its argument in place). */
function loopNoise(sr, r, n, shape) {
  const m = Math.round(0.05 * sr), warm = Math.round(0.1 * sr);
  const x = new Float32Array(warm + n + m);
  for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  shape(x);
  return normalize(seamless(x.subarray(warm), n));
}

/** A sine added to a loop of `sec` seconds, its frequency snapped to a whole number of cycles. */
function addTone(x, sr, f, amp, sec, ph = 0) {
  const w = (TAU * Math.max(1, Math.round(f * sec))) / sec / sr;
  for (let i = 0; i < x.length; i++) x[i] += amp * Math.sin(ph + w * i);
}

/** Whole cycles of f in `sec` seconds, as a frequency that loops. */
const snap = (f, sec) => Math.max(1, Math.round(f * sec)) / sec;

// ---------------------------------------------------------------- shell flight loops

/** Canvas ripping: a band of air tearing around the shell, fluttering with its spin and wobble. */
function tearLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const air = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'bp', 2800, 0.55), sr, 'hp', 1000));
  const grit = loopNoise(sr, r, n, (b) => biquad(b, sr, 'lp', 70));
  const w = (TAU * snap(52, T)) / sr, w2 = (TAU * snap(13, T)) / sr;
  for (let i = 0; i < n; i++) x[i] = air[i] * (0.45 + 0.3 * Math.sin(w * i) + 0.15 * Math.sin(w2 * i) + 0.5 * Math.abs(grit[i]));
  return normalize(x);
}

/** The air roar of flying with the shell: what the camera hears riding along behind it. */
function rushLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const a = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'bp', 500, 0.4), sr, 'lp', 1900));
  const b = loopNoise(sr, r, n, (c) => biquad(c, sr, 'lp', 220));
  const w = (TAU * snap(0.5, T)) / sr;
  for (let i = 0; i < n; i++) x[i] = (a[i] * 0.8 + b[i] * 0.6) * (0.85 + 0.15 * Math.sin(w * i));
  return normalize(x);
}

/** The shell's thin whistle: two partials with a slow vibrato over a breath of narrow noise. */
function whistleLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const hiss = loopNoise(sr, r, n, (b) => biquad(b, sr, 'bp', 2200, 6));
  const v = snap(5, T);
  for (const [f, a, beta] of [[1850, 1, 1.6], [2410, 0.55, 2], [3720, 0.18, 2.6]]) {
    const fs = snap(f, T);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      x[i] += a * Math.sin(TAU * fs * t + beta * Math.sin(TAU * v * t));
    }
  }
  for (let i = 0; i < n; i++) x[i] = x[i] * 0.5 + hiss[i] * 0.6;
  return normalize(x);
}

/** The freight train: a slow, low rushing roar with a heavy flutter, the sound of a very large shell overhead. */
function trainLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const a = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'lp', 230), sr, 'lp', 300));
  const b = loopNoise(sr, r, n, (c) => biquad(c, sr, 'bp', 95, 0.8));
  const w = (TAU * snap(7, T)) / sr, w2 = (TAU * snap(2.5, T)) / sr;
  for (let i = 0; i < n; i++) x[i] = a[i] * (0.55 + 0.4 * Math.sin(w * i) + 0.15 * Math.sin(w2 * i)) + b[i] * 0.9;
  addTone(x, sr, 58, 0.25, T);
  addTone(x, sr, 87, 0.12, T, 1.3);
  saturate(x, 1.8);
  biquad(x, sr, 'lp', 420);
  return normalize(x);
}

/** The scream of a shell coming down on you: a rough, harmonic-rich howl with vibrato and a hiss. */
function screamLoop(sr, r) {
  const T = 2, n = Math.round(T * sr), x = new Float32Array(n);
  const hiss = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'bp', 3000, 1.6), sr, 'hp', 1500));
  const f = snap(760, T), v = snap(6, T), am = snap(41, T);
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = TAU * f * t + 1.8 * Math.sin(TAU * v * t);
    let s = 0;
    for (let h = 1; h <= 9; h++) s += Math.sin(h * ph) / h;
    x[i] = s * (0.7 + 0.3 * Math.sin(TAU * am * t)) * 0.5;
  }
  biquad(x, sr, 'bp', 1900, 0.7);
  normalize(x);
  for (let i = 0; i < n; i++) x[i] = x[i] * 0.8 + hiss[i] * 0.45;
  return normalize(x);
}

/** The endless drumfire from beyond the ridge: a low rolling rumble with single thuds flickering in it (loops). */
function drumLoop(sr, r) {
  const T = 12, n = Math.round(T * sr), x = new Float32Array(n);
  const base = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'lp', 110), sr, 'lp', 160));
  const mid = loopNoise(sr, r, n, (b) => biquad(b, sr, 'bp', 240, 0.6));
  const w1 = (TAU * snap(0.12, T)) / sr, w2 = (TAU * snap(0.31, T)) / sr;
  for (let i = 0; i < n; i++) x[i] = base[i] * (0.55 + 0.25 * Math.sin(w1 * i) + 0.2 * Math.sin(w2 * i + 1)) + mid[i] * 0.18 * (0.5 + 0.5 * Math.sin(w1 * i * 2 + 2));
  for (let k = 0; k < 70; k++) {
    // heavier thuds cluster where the barrage swells
    const t = r() * T, swell = 0.5 + 0.5 * Math.sin(TAU * snap(0.12, T) * t);
    if (r() > 0.35 + 0.65 * swell) continue;
    const e = new Float32Array(Math.ceil(1.4 * sr));
    const f0 = 60 + r() * 60, a = Math.pow(r(), 1.6);
    thump(e, sr, 0, f0, f0 * 0.42, 0.06, 0.8, 0.12 + r() * 0.2);
    mixInto(e, layer(sr, r, { dur: 1.2, attack: 0.01 + r() * 0.03, decay: 0.15 + r() * 0.3, f: 150 + r() * 150 }), 0, 0.5, sr);
    wrapInto(x, e, t, 0.15 + 0.7 * a, sr);
  }
  biquad(x, sr, 'lp', 420);
  return normalize(x, 0.9);
}

/** Steady rain on mud, canvas and helmets: hiss with fat drops. */
function rainLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const hiss = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'hp', 1800), sr, 'lp', 9000));
  const pat = loopNoise(sr, r, n, (b) => biquad(b, sr, 'lp', 40));
  for (let i = 0; i < n; i++) x[i] = hiss[i] * (0.5 + 0.4 * Math.abs(pat[i]));
  for (let k = 0; k < 900; k++) {
    const d = layer(sr, r, { dur: 0.02, attack: 0.0003, decay: 0.004, type: 'bp', f: 1500 + r() * 4500, q: 1.2 });
    wrapInto(x, d, r() * T, 0.08 + 0.25 * r() * r(), sr);
  }
  return normalize(x, 0.9);
}

// ---------------------------------------------------------------- guns

/**
 * The report of a gun of class `c`: a blast wave, the sharp snap of the muzzle, the pressure thump
 * (the sub-bass slam of a heavy piece), the propellant roar, and the long echo off the landscape.
 */
function gunRecipe(sr, r, cls) {
  const c = CLS[cls], big = cls === 'huge', heavy = cls === 'heavy' || big;
  const x = new Float32Array(Math.ceil(c.len * sr));
  blast(x, sr, 0, 1, c.T * (0.9 + 0.2 * r()), 1.3, big ? 0.0006 : heavy ? 0.0003 : 0.0001);
  // the snap of the muzzle blast
  mixInto(x, layer(sr, r, { dur: 0.08, attack: 0.0002, decay: 0.005 + c.T * 0.4, type: 'bp', f: c.crackF, q: 0.7 }), 0, c.crack * 0.8, sr);
  const [f0, f1, tau, dec] = c.boom;
  thump(x, sr, 0, f0, f1, tau, 1, dec);
  if (heavy) {
    // the chest: a second, higher thump so the slam is audible on small speakers too
    thump(x, sr, 0.004, f0 * 1.9, f0 * 0.8, 0.05, 0.55, dec * 0.5);
    mixInto(x, layer(sr, r, { dur: c.len * 0.5, attack: 0.02, decay: dec * 0.7, f: 70 }), 0.02, 0.5, sr);
  }
  mixInto(x, layer(sr, r, { dur: c.len * 0.6, attack: 0.005 + c.T * 0.3, decay: 0.2 + dec * 0.3, f: c.bodyF }), 0, 0.9, sr);
  mixInto(x, layer(sr, r, { dur: 0.9, attack: 0.004, decay: 0.2, sweep: (t) => 3200 * Math.exp(-t * 4) + 260 }), 0, 0.4, sr); // the flash and burning powder
  if (big) {
    // the ground reflections slap back at once, then the ridge answers
    for (const [d, g] of [[0.07, 0.35], [0.16, 0.28], [0.31, 0.22]]) mixInto(x, onePole(Float32Array.from(x.subarray(0, Math.round(0.9 * sr))), sr, 500), d, g, sr);
  }
  const [count, t1, gain, f] = c.roll;
  roll(x, x.slice(0, Math.round(0.6 * sr)), sr, r, { count, t0: 0.12, t1, gain, f });
  normalize(x);
  saturate(x, big ? 1.5 : heavy ? 1.3 : 1.15);
  return x;
}

/** A close shock: arrives with the sound, a hard slap and a thud (direct, not through the air filter). */
function slapRecipe(sr, r, big) {
  const x = new Float32Array(Math.ceil((big ? 0.9 : 0.45) * sr));
  blast(x, sr, 0, 1, big ? 0.012 : 0.004, 1.2, 0.00005);
  thump(x, sr, 0, big ? 70 : 100, big ? 28 : 40, big ? 0.07 : 0.04, 0.9, big ? 0.3 : 0.08);
  mixInto(x, layer(sr, r, { dur: big ? 0.5 : 0.2, attack: 0.001, decay: big ? 0.12 : 0.05, f: big ? 380 : 500 }), 0, 0.6, sr);
  return saturate(normalize(x), big ? 1.6 : 1.3);
}

/** The ground wave: a heavy shock through the earth, a low shudder felt before the air carries the bang. */
function tremorRecipe(sr, r, big) {
  const x = new Float32Array(Math.ceil((big ? 2.2 : 1.2) * sr));
  thump(x, sr, 0, big ? 52 : 70, big ? 22 : 32, 0.18, 1, big ? 0.7 : 0.35, 0.012);
  mixInto(x, layer(sr, r, { dur: x.length / sr, attack: 0.03, decay: big ? 0.6 : 0.3, f: 85 }), 0, 0.7, sr);
  return saturate(normalize(x), 1.5);
}

// ---------------------------------------------------------------- shell bursts

/**
 * A shell bursting. ground: the crump, dirt thrown up, the ground shaking and debris pattering down,
 * all scaled by the calibre; air: a time-fuzed shrapnel or airburst, a hard crack, a hollow whump and
 * the hail of balls whirring and pattering through the air.
 */
function burstRecipe(sr, r, cls, kind) {
  const c = CLS[cls], s = c.cal / 6, big = c.cal >= 9;
  const len = kind === 'air' ? 1.6 + 0.4 * s : 2.4 + 1.5 * Math.sqrt(s);
  const x = new Float32Array(Math.ceil(len * sr));
  if (kind === 'air') {
    blast(x, sr, 0, 1, 0.0035 * Math.pow(s, 0.6) * (0.9 + 0.2 * r()), 1.5, 0.00004);
    thump(x, sr, 0, 150 / Math.pow(s, 0.4), 62 / Math.pow(s, 0.4), 0.04, 0.4, 0.15);
    mixInto(x, layer(sr, r, { dur: 0.5, decay: 0.08, type: 'bp', f: 800, q: 0.7 }), 0, 0.5, sr);
    mixInto(x, layer(sr, r, { dur: 0.08, attack: 0.0002, decay: 0.012, type: 'hp', f: 3000 }), 0, 0.4, sr);
    for (let i = 0; i < 18 + 10 * s; i++) { // the balls whirring away and pattering into the mud
      const t = 0.03 + Math.pow(r(), 0.8) * (0.5 + 0.4 * s), f0 = 2000 + r() * 3000;
      mixInto(x, layer(sr, r, { dur: 0.25, attack: 0.02, decay: 0.07, sweep: (tt) => f0 * Math.exp(-tt * 4.5) + 350 }), t, 0.04 + 0.06 * r(), sr);
      if (r() < 0.5) mixInto(x, layer(sr, r, { dur: 0.04, attack: 0.0004, decay: 0.01, type: 'bp', f: 500 + r() * 1500, q: 0.9 }), t + 0.3 + r() * 0.5, 0.07 * r(), sr);
    }
    return x;
  }
  blast(x, sr, 0, 0.75, (big ? 0.03 : 0.012) * Math.pow(s, 0.7), 1.5, 0.0004);
  const f0 = 68 / Math.pow(s, 0.45);
  thump(x, sr, 0, f0, f0 * 0.42, 0.1, 1, 0.3 + 0.18 * s);
  mixInto(x, layer(sr, r, { dur: len * 0.6, attack: 0.003, decay: 0.3 + 0.2 * s, f: 330 / Math.pow(s, 0.3) }), 0, 0.85, sr);
  mixInto(x, layer(sr, r, { dur: 1.1, attack: 0.02, decay: 0.22 + 0.06 * s, type: 'bp', f: 700, q: 0.5 }), 0.02, 0.4, sr); // dirt
  mixInto(x, layer(sr, r, { dur: len - 0.2, attack: 0.1, decay: 0.5 + 0.35 * s, f: 62 }), 0.05, 0.55, sr); // the ground shaking
  for (let i = 0; i < 6; i++) { // fragments of steel tumbling away
    const f1 = 1800 + r() * 2600;
    mixInto(x, layer(sr, r, { dur: 0.3, attack: 0.02, decay: 0.08, sweep: (tt) => f1 * Math.exp(-tt * 4) + 300 }), 0.02 + r() * 0.5, 0.04 + 0.05 * r(), sr);
  }
  const n = Math.round(16 + 26 * Math.sqrt(s));
  for (let i = 0; i < n; i++) { // earth and stones raining back
    const t = 0.25 + Math.pow(r(), 0.8) * (1.3 + 1.1 * s);
    mixInto(x, layer(sr, r, { dur: 0.05, attack: 0.0004, decay: 0.012, type: 'bp', f: 300 + r() * 1300, q: 0.8 }), t, (0.05 + 0.07 * r()) * Math.exp(-t / 1.6), sr);
  }
  if (big) roll(x, x.slice(0, Math.round(0.5 * sr)), sr, r, { count: 14, t0: 0.2, t1: 2.2 + 0.6 * s, gain: 0.3, f: 360 });
  return saturate(normalize(x), big ? 1.4 : 1.15);
}

/** A magazine or ammunition dump cooking off: pops and cracks that build, a few bangs, then a slow burn. */
function crackleRecipe(sr, r) {
  const len = 3.4, x = new Float32Array(Math.ceil(len * sr));
  for (let i = 0; i < 90; i++) {
    const u = r(), t = len * 0.95 * Math.pow(u, 1.25) * (0.15 + 0.85 * r() ** 0.3);
    const a = 0.1 + 0.9 * Math.pow(r(), 2.5);
    mixInto(x, layer(sr, r, { dur: 0.06, attack: 0.0003, decay: 0.004 + 0.01 * r(), type: 'bp', f: 700 + r() * 3200, q: 0.8 }), t, a * 0.6, sr);
    if (r() < 0.25) modes(x, sr, t, [[1800 + r() * 2000, 0.07, 0.03 + r() * 0.05]], r, a);
  }
  for (let i = 0; i < 4; i++) { // the heavier cooks
    const t = 0.3 + r() * 2.2;
    blast(x, sr, t, 0.8, 0.004, 1.5, 0.00008);
    thump(x, sr, t, 110, 48, 0.05, 0.45, 0.15);
  }
  mixInto(x, layer(sr, r, { dur: len - 0.2, attack: 0.3, decay: 1.2, type: 'bp', f: 1400, q: 0.4 }), 0.1, 0.1, sr); // fire roaring
  return x;
}

// ---------------------------------------------------------------- the gun crew

/** A shell trolley rolling on rails: wheel joints clacking in pairs, an iron hum, and the stop. */
function trolleyRecipe(sr, r) {
  const len = 2.4, x = new Float32Array(Math.ceil(len * sr));
  mixInto(x, layer(sr, r, { dur: 1.9, attack: 0.2, decay: 0.9, type: 'bp', f: 520, q: 0.7 }), 0.05, 0.3, sr);
  for (let t = 0.12, gap = 0.2; t < 1.85; gap *= 0.97, t += gap) {
    for (const [d, g] of [[0, 1], [0.045 + 0.01 * r(), 0.8]]) {
      modes(x, sr, t + d, [[1350 + r() * 300, 0.25, 0.025], [2900 + r() * 500, 0.1, 0.018], [420, 0.12, 0.05]], r, g * (0.7 + 0.3 * r()));
      mixInto(x, layer(sr, r, { dur: 0.03, attack: 0.0003, decay: 0.006, type: 'hp', f: 1200 }), t + d, 0.25 * g, sr);
    }
  }
  modes(x, sr, 1.95, [[210, 0.5, 0.18], [560, 0.3, 0.12], [1390, 0.15, 0.08]], r, 0.8); // the buffer stop
  thump(x, sr, 1.95, 130, 70, 0.03, 0.4, 0.1);
  return x;
}

/** Crane chain and ratchet: links rattling through the blocks, the pawl clicking over the gear. */
function craneRecipe(sr, r) {
  const len = 2.8, x = new Float32Array(Math.ceil(len * sr));
  mixInto(x, layer(sr, r, { dur: 2.5, attack: 0.2, decay: 1.3, type: 'bp', f: 300, q: 0.8 }), 0.05, 0.2, sr); // gearing and the creak of the sheaves
  for (let i = 0; i < 70; i++) { // chain links tinkling over the sheave
    const t = 0.1 + 2.3 * r(), f = 2100 + r() * 2800;
    modes(x, sr, t, [[f, 0.12, 0.02 + r() * 0.03], [f * 1.9, 0.05, 0.015]], r, 0.4 + 0.6 * r());
  }
  for (let t = 0.1, k = 0; t < 2.5; t += 0.085 + 0.002 * k++) { // the ratchet pawl
    mixInto(x, layer(sr, r, { dur: 0.02, attack: 0.0002, decay: 0.004, type: 'bp', f: 1900, q: 1.5 }), t, 0.55, sr);
    modes(x, sr, t, [[640, 0.15, 0.015]], r, 0.5);
  }
  modes(x, sr, 2.55, [[340, 0.4, 0.12], [900, 0.2, 0.08], [2200, 0.08, 0.05]], r, 0.8); // the load comes to rest
  return x;
}

/** The rammer: a dull heavy thump of the head driving the shell home, the leather and wood, the staff clattering. */
function ramRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(1.3 * sr));
  thump(x, sr, 0, 120, 52, 0.05, 1, 0.12);
  mixInto(x, layer(sr, r, { dur: 0.3, attack: 0.001, decay: 0.05, f: 700 }), 0, 0.7, sr);
  modes(x, sr, 0.005, [[780, 0.2, 0.04], [1420, 0.1, 0.03]], r, 0.5); // brass driving band seating
  thump(x, sr, 0.45, 100, 55, 0.04, 0.35, 0.08); // withdrawn and set down
  for (let i = 0; i < 7; i++) modes(x, sr, 0.5 + r() * 0.6, [[320 + r() * 400, 0.12, 0.02 + r() * 0.03]], r, 0.5);
  return saturate(x, 1.2);
}

/** The breech screw: greased steel swinging over on its hinge, threads engaging, and the heavy lock. */
function breechRecipe(sr, r, part = 'all') {
  const swing = part !== 'clang', clang = part !== 'screw';
  const len = (swing ? 1.9 : 0) + (clang ? 2.6 : 0), x = new Float32Array(Math.ceil(len * sr));
  const t0 = swing ? 1.9 : 0;
  if (swing) {
    // the heavy steel swinging on its hinge: a groaning, squealing whirr that stops at the stop
    mixInto(x, layer(sr, r, { dur: 1.5, attack: 0.3, decay: 0.8, sweep: (t) => 350 + 500 * Math.sin(Math.min(t, 1.3) / 1.3 * Math.PI) }), 0.05, 0.5, sr);
    mixInto(x, layer(sr, r, { dur: 1.4, attack: 0.4, decay: 0.7, type: 'bp', f: 1150, q: 7 }), 0.1, 0.12, sr);
    thump(x, sr, 0.05, 90, 70, 0.1, 0.25, 0.3, 0.1);
    for (let i = 0; i < 5; i++) { // threads of the interrupted screw
      const t = 1.25 + i * 0.1 + r() * 0.02;
      modes(x, sr, t, [[520 + r() * 150, 0.3, 0.04], [1700, 0.1, 0.02]], r, 0.7);
    }
    modes(x, sr, 1.7, [[250, 0.5, 0.2], [620, 0.3, 0.1]], r, 0.7); // the hinge stop
  }
  if (clang) {
    // the lock: a big steel clang with a long ring and a thud under it
    thump(x, sr, t0, 140, 60, 0.03, 0.8, 0.15);
    mixInto(x, layer(sr, r, { dur: 0.1, attack: 0.0002, decay: 0.01, type: 'hp', f: 1500 }), t0, 0.5, sr);
    modes(x, sr, t0, [[175, 0.5, 0.6], [468, 0.4, 0.5], [1130, 0.3, 0.3], [2310, 0.16, 0.14], [3900, 0.09, 0.08], [5600, 0.05, 0.05]], r, 1);
    modes(x, sr, t0 + 0.14, [[390, 0.2, 0.2], [880, 0.1, 0.15]], r, 0.6); // the handle's rebound
  }
  return x;
}

/** A cordite charge bag set down: a soft thump of silk and powder, cloth rustling. */
function cartridgeRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(1.1 * sr));
  thump(x, sr, 0.02, 95, 55, 0.04, 0.8, 0.07);
  mixInto(x, layer(sr, r, { dur: 0.7, attack: 0.04, decay: 0.2, type: 'bp', f: 1300, q: 0.5 }), 0, 0.28, sr);
  mixInto(x, layer(sr, r, { dur: 0.3, attack: 0.002, decay: 0.05, f: 450 }), 0.02, 0.5, sr);
  for (let i = 0; i < 6; i++) mixInto(x, layer(sr, r, { dur: 0.1, attack: 0.01, decay: 0.03, type: 'bp', f: 1800 + r() * 1500, q: 0.6 }), 0.1 + r() * 0.6, 0.12 * r(), sr);
  return x;
}

/** A shouted order, crudely: a glottal buzz run through the formants of each vowel, with fricatives. */
function bark(sr, r, word) {
  // segments: [formants, seconds, pitch Hz start, end, level] or ['f'|'d'|'r', seconds]
  const segs = word === 'fire'
    ? [['f', 0.08], [[690, 1100, 2500], 0.14, 150, 165, 1], [[330, 2150, 2900], 0.2, 165, 118, 0.9], [[500, 1300, 2400], 0.12, 118, 100, 0.5]]
    : [['r', 0.05], [[540, 1700, 2500], 0.12, 130, 150, 0.9], ['d', 0.04], [[620, 1100, 2500], 0.12, 150, 170, 1], [[330, 2150, 2900], 0.22, 170, 130, 0.8]];
  const x = new Float32Array(Math.ceil((segs.reduce((s, g) => s + g[1], 0) + 0.4) * sr));
  let t = 0.05;
  for (const g of segs) {
    const n = Math.round(g[1] * sr), seg = new Float32Array(n);
    if (typeof g[0] === 'string') {
      if (g[0] === 'f') {
        for (let i = 0; i < n; i++) seg[i] = (r() * 2 - 1) * Math.sin((Math.PI * i) / n);
        biquad(seg, sr, 'hp', 3200);
      } else if (g[0] === 'r') for (let i = 0; i < n; i++) seg[i] = (r() * 2 - 1) * 0.2 * Math.sin((Math.PI * i) / n);
      else for (let i = 0; i < n; i++) seg[i] = i < n * 0.1 ? (r() * 2 - 1) * 0.4 : 0;
      mixInto(x, seg, t, g[0] === 'f' ? 0.4 : 0.5, sr);
    } else {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        ph += (TAU * (g[2] + (g[3] - g[2]) * u)) / sr;
        let s = 0;
        for (let h = 1; h <= 30; h++) s += Math.sin(h * ph) / h; // buzzy pulse
        seg[i] = s * (1 + 0.04 * (r() - 0.5));
      }
      const out = new Float32Array(n);
      for (const [f, q, a] of [[g[0][0], 7, 1], [g[0][1], 9, 0.7], [g[0][2], 12, 0.4]]) {
        const b = biquad(Float32Array.from(seg), sr, 'bp', f, q);
        for (let i = 0; i < n; i++) out[i] += b[i] * a;
      }
      const fade = Math.round(0.02 * sr);
      for (let i = 0; i < n; i++) out[i] *= Math.min(1, i / fade, (n - i) / fade) * g[4];
      mixInto(x, normalize(out, 0.7), t, 1, sr);
    }
    t += g[1] * 0.85;
  }
  biquad(x, sr, 'lp', 4200);
  return saturate(normalize(x), 1.5);
}

// ---------------------------------------------------------------- flares and the console

/** A Very pistol: the pop of the charge, the rocket's whoosh and its long magnesium hiss. */
function veryPopRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(1.1 * sr));
  blast(x, sr, 0, 0.8, 0.003, 1.4, 0.00008);
  thump(x, sr, 0, 240, 110, 0.03, 0.8, 0.1);
  mixInto(x, layer(sr, r, { dur: 0.25, attack: 0.001, decay: 0.05, type: 'bp', f: 1200, q: 0.6 }), 0, 0.5, sr);
  mixInto(x, layer(sr, r, { dur: 0.9, attack: 0.05, decay: 0.3, sweep: (t) => 600 + 2800 * Math.exp(-t * 3) }), 0.04, 0.3, sr); // the star leaving
  return x;
}

function flareHissRecipe(sr, r) {
  const len = 4, x = new Float32Array(Math.ceil(len * sr));
  mixInto(x, layer(sr, r, { dur: len, attack: 0.25, decay: 1.7, type: 'bp', f: 3600, q: 0.35 }), 0, 1, sr);
  for (let i = 0; i < 40; i++) mixInto(x, layer(sr, r, { dur: 0.02, attack: 0.0003, decay: 0.004, type: 'hp', f: 3000 }), r() * 3, 0.25 * r() * Math.exp(-i / 30), sr); // sparks
  return x;
}

/** The field telephone's buzzer: two long bursts of a rattling vibrating reed, the hammer on the bell. */
function phoneRecipe(sr) {
  const len = 2.2, x = new Float32Array(Math.ceil(len * sr));
  for (const t0 of [0.05, 1.1]) {
    const n = Math.round(0.85 * sr), i0 = Math.round(t0 * sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr, env = Math.min(1, t / 0.01, (0.85 - t) / 0.03);
      const gate = 0.5 + 0.5 * Math.sign(Math.sin(TAU * 24 * t)); // reed vibrating
      let s = 0;
      for (let h = 1; h <= 6; h++) s += Math.sin(TAU * 118 * h * t + h) / h;
      x[i0 + i] += env * (s * (0.45 + 0.55 * gate) * 0.7 + 0.35 * Math.sin(TAU * 1180 * t) * gate);
    }
  }
  biquad(x, sr, 'bp', 900, 0.5);
  biquad(x, sr, 'lp', 3400);
  return saturate(normalize(x), 1.6);
}

/** Wireless telegraphy: an unreadable stream of dits and dahs in a tone over static. */
function wirelessRecipe(sr, r) {
  const dot = 0.065, len = 2.6, x = new Float32Array(Math.ceil(len * sr));
  const f = 640 + r() * 80;
  let t = 0.1;
  while (t < len - 0.4) {
    const dash = r() < 0.45, d = (dash ? 3 : 1) * dot, n = Math.round(d * sr), i0 = Math.round(t * sr), a = Math.round(0.004 * sr);
    for (let i = 0; i < n; i++) x[i0 + i] += Math.sin(TAU * f * (i / sr)) * Math.min(1, i / a, (n - i) / a);
    t += d + dot * (r() < 0.2 ? 3 : 1);
  }
  const stat = new Float32Array(x.length);
  for (let i = 0; i < stat.length; i++) stat[i] = (r() * 2 - 1) * (r() < 0.002 ? 1.8 : 0.07);
  biquad(stat, sr, 'bp', 1800, 0.4);
  for (let i = 0; i < x.length; i++) x[i] += stat[i];
  biquad(x, sr, 'hp', 300);
  biquad(x, sr, 'lp', 2800);
  return x;
}

function clickRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.08 * sr));
  mixInto(x, layer(sr, r, { dur: 0.04, attack: 0.0003, decay: 0.005, type: 'hp', f: 2800 }), 0, 0.8, sr);
  modes(x, sr, 0, [[1800, 0.2, 0.012]], r, 0.5);
  thump(x, sr, 0.004, 400, 220, 0.01, 0.3, 0.02);
  return x;
}

function paperRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.55 * sr));
  for (let i = 0; i < 18; i++) mixInto(x, layer(sr, r, { dur: 0.1, attack: 0.008, decay: 0.025, type: 'bp', f: 2200 + r() * 3000, q: 0.5 }), r() * 0.4, 0.25 + 0.75 * r(), sr);
  mixInto(x, layer(sr, r, { dur: 0.5, attack: 0.1, decay: 0.12, type: 'bp', f: 4000, q: 0.4 }), 0, 0.3, sr);
  return x;
}

/** A hand bell struck once: the strike, the bright partials and a long hum. */
function bellRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(3.2 * sr)), f = 640;
  for (const [m, a, d] of [[1, 1, 1.5], [2.0, 0.55, 1.1], [2.76, 0.6, 0.9], [4.07, 0.28, 0.5], [5.43, 0.16, 0.3], [0.5, 0.35, 1.8]]) modes(x, sr, 0, [[f * m, a * 0.3, d]], r, 1);
  mixInto(x, layer(sr, r, { dur: 0.04, attack: 0.0003, decay: 0.006, type: 'hp', f: 2500 }), 0, 0.3, sr);
  return x;
}

/** A trench whistle: a pea whistle shrilling, its pea trilling in the air stream. */
function whistleRecipe(sr, r) {
  const len = 1.3, n = Math.ceil(len * sr), x = new Float32Array(n);
  const breath = burst(sr, r, len, 0.01, 1);
  biquad(breath, sr, 'bp', 2900, 2);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.min(1, t / 0.03, (len - t) / 0.12);
    const f = 2350 * (1 + 0.04 * Math.min(1, t / 0.1)) * (1 + 0.012 * Math.sin(TAU * 7 * t));
    ph += (TAU * f) / sr;
    const trill = 0.65 + 0.35 * Math.sign(Math.sin(TAU * 31 * t + 0.4 * Math.sin(ph * 0.001))); // the pea
    x[i] = env * (trill * (Math.sin(ph) + 0.35 * Math.sin(2 * ph + 1)) + 0.5 * breath[i]);
  }
  return normalize(x);
}

/**
 * Every bank as a list of build tasks [group, key, fn], so start() can render the
 * essentials at once and spread the rest over a few frames. `make(channels, sampleRate)`
 * turns sample arrays into an AudioBuffer. Distances: 'near' / 'mid' / 'far'.
 */
export function bankTasks(SR, make) {
  const midSR = Math.min(SR, 32000), farSR = 16000, loopSR = Math.min(SR, 24000);
  const set = (n, seed, fn) => () => Array.from({ length: n }, (_, i) => fn(mulberry(seed + i * 7919)));
  const mono = (sr) => (x) => make([tail(normalize(x, 0.95), sr)], sr);
  const loopOf = (sr, fn) => (r) => make([fn(sr, r)], sr);
  const mid = (sr, recipe, len, rl) => (r) => make(distant(sr, r, recipe(r), 'mid', { len, roll: rl }), sr);
  const far = (sr, recipe, len, rl) => (r) => make(distant(sr, r, recipe(r), 'far', { len, roll: rl }), sr);
  const tasks = [];
  const gun = (cls, seed) => {
    const c = CLS[cls], g = 'gun_' + cls, rl = { count: 14, t0: 0.25, t1: c.roll[1] + 1.2, gain: 0.55, f: c.roll[3] };
    tasks.push(
      [g, 'near', set(3, seed, (r) => mono(midSR)(gunRecipe(midSR, r, cls)))],
      [g, 'mid', set(2, seed + 5, mid(midSR, (r) => gunRecipe(midSR, r, cls), c.len + 1.8, rl))],
      [g, 'far', set(2, seed + 9, far(farSR, (r) => gunRecipe(farSR, r, cls), c.len + 3.5, { ...rl, t1: rl.t1 + 1.6 }))]
    );
  };
  const bursts = (cls, kind, seed) => {
    const g = `burst_${kind}_${cls}`, n = kind === 'air' ? 1.6 + 0.4 * CLS[cls].cal / 6 : 3.5 + 1.5 * Math.sqrt(CLS[cls].cal / 6);
    const rl = { count: 12, t0: 0.2, t1: 1.4 + n * 0.5, gain: 0.5, f: 420 };
    tasks.push(
      [g, 'near', set(3, seed, (r) => mono(midSR)(burstRecipe(midSR, r, cls, kind)))],
      [g, 'mid', set(2, seed + 5, mid(midSR, (r) => burstRecipe(midSR, r, cls, kind), n + 1.4, rl))],
      [g, 'far', set(2, seed + 9, far(farSR, (r) => burstRecipe(farSR, r, cls, kind), n + 2.6, { ...rl, t1: rl.t1 + 1.5 }))]
    );
  };
  // the essentials, rendered on the first click
  tasks.push(
    ['loop', 'tear', set(1, 211, loopOf(loopSR, tearLoop))],
    ['loop', 'rush', set(1, 223, loopOf(loopSR, rushLoop))],
    ['loop', 'whistle', set(1, 227, loopOf(loopSR, whistleLoop))],
    ['loop', 'train', set(1, 229, loopOf(loopSR, trainLoop))],
    ['loop', 'scream', set(1, 233, loopOf(loopSR, screamLoop))],
    ['ui', 'click', set(2, 241, (r) => mono(midSR)(clickRecipe(midSR, r)))],
    ['slap', 'small', set(3, 421, (r) => mono(midSR)(slapRecipe(midSR, r, false)))],
    ['slap', 'big', set(2, 423, (r) => mono(midSR)(slapRecipe(midSR, r, true)))]
  );
  gun('field', 101);
  gun('huge', 103);
  bursts('med', 'ground', 401);
  bursts('huge', 'ground', 403);
  tasks.push(null); // everything after this is rendered over the following frames
  gun('light', 107);
  gun('med', 109);
  gun('heavy', 113);
  for (const [i, cls] of ORDER.entries()) if (cls !== 'med' && cls !== 'huge') bursts(cls, 'ground', 410 + i);
  for (const [i, cls] of ORDER.slice(0, 4).entries()) bursts(cls, 'air', 430 + i);
  tasks.push(
    ['tremor', 'small', set(2, 441, (r) => mono(midSR)(tremorRecipe(midSR, r, false)))],
    ['tremor', 'big', set(2, 443, (r) => mono(midSR)(tremorRecipe(midSR, r, true)))],
    ['loop', 'drumfire', set(1, 251, loopOf(16000, drumLoop))],
    ['loop', 'rain', set(1, 253, loopOf(loopSR, rainLoop))],
    ['thud', 'far', set(5, 261, (r) => make(distant(farSR, r, gunRecipe(farSR, r, r() < 0.5 ? 'med' : 'heavy'), 'far', { len: 4.2, roll: { count: 12, t0: 0.3, t1: 3.2, gain: 0.5, f: 300 } }), farSR))],
    ['load', 'trolley', set(3, 301, (r) => mono(midSR)(trolleyRecipe(midSR, r)))],
    ['load', 'crane', set(3, 307, (r) => mono(midSR)(craneRecipe(midSR, r)))],
    ['load', 'ram', set(3, 311, (r) => mono(midSR)(ramRecipe(midSR, r)))],
    ['load', 'breech', set(2, 313, (r) => mono(midSR)(breechRecipe(midSR, r, 'all')))],
    ['load', 'screw', set(2, 317, (r) => mono(midSR)(breechRecipe(midSR, r, 'screw')))],
    ['load', 'clang', set(2, 319, (r) => mono(midSR)(breechRecipe(midSR, r, 'clang')))],
    ['load', 'cartridge', set(3, 323, (r) => mono(midSR)(cartridgeRecipe(midSR, r)))],
    ['load', 'ready', set(2, 331, (r) => mono(midSR)(bark(midSR, r, 'ready')))],
    ['load', 'fire', set(2, 337, (r) => mono(midSR)(bark(midSR, r, 'fire')))],
    ['flare', 'pop', set(2, 341, (r) => mono(midSR)(veryPopRecipe(midSR, r)))],
    ['flare', 'hiss', set(1, 343, (r) => mono(midSR)(flareHissRecipe(midSR, r)))],
    ['cook', 'crackle', set(2, 347, (r) => mono(midSR)(crackleRecipe(midSR, r)))],
    ['ui', 'phone', set(1, 351, () => mono(midSR)(phoneRecipe(midSR)))],
    ['ui', 'wireless', set(2, 353, (r) => mono(midSR)(wirelessRecipe(midSR, r)))],
    ['ui', 'paper', set(2, 357, (r) => mono(midSR)(paperRecipe(midSR, r)))],
    ['ui', 'bell', set(1, 359, (r) => mono(midSR)(bellRecipe(midSR, r)))],
    ['ui', 'whistle', set(2, 361, (r) => mono(midSR)(whistleRecipe(midSR, r)))]
  );
  return tasks;
}

// ================================================================== the engine

const MIN_GAIN = { burst: 0.003, load: 0.02, flare: 0.01 };
const STEPS = { trolley: 'trolley', crane: 'crane', chain: 'crane', ram: 'ram', rammer: 'ram', breech: 'breech', screw: 'screw', clang: 'clang', lock: 'clang', cartridge: 'cartridge', charge: 'cartridge', bag: 'cartridge', ready: 'ready', fire: 'fire', whistle: 'whistle' };
const UI = { phone: 'phone', wireless: 'wireless', click: 'click', paper: 'paper', bell: 'bell', whistle: 'whistle', gong: 'bell', switch: 'click', button: 'click', lock: 'click', alarm: 'phone', warning: 'phone' };

export class AudioEngine {
  constructor({ context = null } = {}) {
    this.ctx = null;
    this.given = context;
    this.volume = 0.8;
    this.muted = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.listenerVel = { x: 0, y: 0, z: 0 };
    this.queue = [];
    this.inFlight = []; // sounds still travelling to the listener
    this.voices = [];
    this.posVoices = 0;
    this.directVoices = 0;
    this.lastPlay = {};
    this.used = {};
    this.bank = {};
    this.pending = [];
    this.bedEnergy = 0;
    this.combat = 0;
    this.throttle = {};
    this.shells = new Map(); // sim shell -> { incoming }
    this.shellVoices = [];
    this.deaf = 0; // 0..1: the muffled mix and ringing after a close blast
    this.amb = { drumfire: 0, rain: 0, wind: 0.4 }; // targets set by setAmbience
    this.ambNow = { drumfire: 0, rain: 0, wind: 0.4 };
    this.thudT = 0;
    this.lastCam = null;
    // called when a blast shock reaches the listener ({ d, k, pos }): main can shake the camera in step with the sound
    this.onShock = null;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    let ctx = this.given;
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      ctx = new AC();
    }
    this.ctx = ctx;

    // mix -> deafness low-pass -> master volume -> compressor -> brickwall -> soft clip -> out
    this.mix = ctx.createGain();
    this.deafLp = ctx.createBiquadFilter();
    this.deafLp.type = 'lowpass';
    this.deafLp.frequency.value = 20000;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.12;
    const wall = ctx.createDynamicsCompressor();
    wall.threshold.value = -1.5;
    wall.knee.value = 0;
    wall.ratio.value = 20;
    wall.attack.value = 0.001;
    wall.release.value = 0.05;
    const soft = ctx.createWaveShaper();
    const sc = new Float32Array(2049);
    for (let k = 0; k < sc.length; k++) {
      const x = (k / (sc.length - 1)) * 2 - 1;
      const a = Math.abs(x);
      sc[k] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
    }
    soft.curve = sc;
    this.mix.connect(this.deafLp).connect(this.master).connect(comp).connect(wall).connect(soft).connect(ctx.destination);

    // ringing ears after a near blast, not muffled by the deafness filter
    this.ringGain = ctx.createGain();
    this.ringGain.gain.value = 0;
    this.ringGain.connect(this.master);
    for (const [f, g] of [[3950, 0.7], [4180, 0.3]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.ringGain);
      o.start();
    }

    // open country: a long, sparse tail that carries the guns across the flat ground
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 3);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.6;
    this.reverbSend.connect(this.reverb).connect(this.mix);

    // ambience and the working sounds duck under close blasts
    this.duckBus = ctx.createGain();
    this.duckBus.connect(this.mix);
    this.sfxDuck = ctx.createGain();
    this.sfxDuck.connect(this.mix);
    const bus = (g, dest = this.mix) => {
      const b = ctx.createGain();
      b.gain.value = g;
      b.connect(dest);
      return b;
    };
    this.ambBus = bus(1, this.duckBus);
    this.sfx = bus(1, this.sfxDuck);
    this.shellBus = bus(0.8, this.sfxDuck);
    this.blastBus = bus(1);
    this.uiBus = bus(1);

    this.white = this.noiseBuffer('white');
    this.brown = this.noiseBuffer('brown');
    this.pink = this.noiseBuffer('pink');

    // render the essential sample banks now, the rest over the next frames
    const make = (chans, sr) => {
      const b = ctx.createBuffer(chans.length, chans[0].length, sr);
      chans.forEach((c, i) => b.copyToChannel(c, i));
      return b;
    };
    const tasks = bankTasks(ctx.sampleRate, make);
    const split = tasks.indexOf(null);
    for (const t of tasks.slice(0, split)) this.runTask(t);
    this.pending = tasks.slice(split + 1);
    if (this.given) while (this.pending.length) this.runTask(this.pending.shift());
    else {
      this.pump();
      this.loadRecordings();
    }

    this.buildAmbience();
    for (let i = 0; i < SHELL_VOICES; i++) this.shellVoices.push(this.buildShellVoice());
  }

  runTask([group, key, fn]) {
    (this.bank[group] ||= {})[key] = fn();
  }

  // one bank per tick so the first seconds never stall
  pump() {
    if (!this.pending.length) return;
    this.runTask(this.pending.shift());
    setTimeout(() => this.pump(), 12);
  }

  // Real recordings: fetched and decoded in the background; once the synthesized banks are done
  // as well they are cut up and take their places (see RECORDINGS).
  async loadRecordings() {
    const ctx = this.ctx;
    const base = import.meta.env?.BASE_URL ?? '/';
    const rec = {};
    await Promise.all(
      Object.entries(RECORDINGS).map(async ([key, spec]) => {
        try {
          const res = await fetch(`${base}audio/${spec.file}`);
          if (res.ok) rec[key] = await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          // missing or undecodable: the synthesized sound stays
        }
      })
    );
    this.rec = rec;
    const apply = () => (this.pending.length ? setTimeout(apply, 100) : this.useRecordings());
    apply();
  }

  useRecordings() {
    const ctx = this.ctx, SR = ctx.sampleRate, R = this.rec, B = this.bank;
    const midSR = Math.min(SR, 32000), farSR = 16000;
    const make = (chans, sr) => {
      const b = ctx.createBuffer(chans.length, chans[0].length, sr);
      chans.forEach((c, i) => b.copyToChannel(c, i));
      return b;
    };
    // each slice mixed to mono, its DC removed, resampled to `sr` at `rate` (< 1: lower and longer, a bigger object), faded and normalized
    const cut = (key, sr = SR, rate = 1) => {
      const buf = R[key];
      if (!buf) return [];
      return (RECORDINGS[key].slices || [[0, buf.duration]]).map(([t0, len]) => {
        const a = Math.floor(t0 * buf.sampleRate), n = Math.max(1, Math.min(Math.floor(len * buf.sampleRate), buf.length - a));
        const x = new Float32Array(n);
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < n; i++) x[i] += d[a + i] / buf.numberOfChannels;
        }
        let mean = 0;
        for (let i = 0; i < n; i++) mean += x[i];
        mean /= n;
        for (let i = 0; i < n; i++) x[i] -= mean;
        const step = (buf.sampleRate / sr) * rate, m = Math.floor(n / step), o = new Float32Array(m);
        for (let i = 0; i < m; i++) {
          const p = i * step, j = Math.floor(p), f = p - j;
          o[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f;
        }
        const fin = Math.min(m, Math.round(0.003 * sr)), fout = Math.round(m * 0.3);
        for (let i = 0; i < fin; i++) o[i] *= i / fin;
        for (let i = 0; i < fout; i++) o[m - 1 - i] *= Math.pow(i / fout, 1.5);
        return normalize(o, 0.95);
      });
    };
    // a recording laid under a synthesized buffer, then normalized together
    const blend = (buf, x, g) => {
      if (!buf || !x.length) return buf;
      const n = Math.max(buf.length, x.length), o = new Float32Array(n);
      o.set(buf.getChannelData(0));
      for (let i = 0; i < x.length; i++) o[i] += x[i] * g;
      return make([normalize(o, 0.95)], buf.sampleRate);
    };
    const rng = mulberry(4242);
    const lowpass = (x, sr, f) => biquad(Float32Array.from(x), sr, 'lp', f);

    // real distant explosions: the far bursts and the thuds of the drumfire
    const dist = cut('distant', farSR);
    if (dist.length) {
      for (const cls of ORDER) {
        const g = B['burst_ground_' + cls];
        if (g) g.far = dist.map((x) => make(distant(farSR, rng, lowpass(x, farSR, 500 + 250 * (ORDER.indexOf(cls) < 3 ? 1 : 0)), 'far', { len: 3.4, roll: { count: 12, t0: 0.3, t1: 2.6, gain: 0.4, f: 360 } }), farSR));
      }
      B.thud ||= {};
      B.thud.far = [...(B.thud.far || []), ...cut('distant', farSR, 0.8).slice(0, 6).map((x) => make([lowpass(x, farSR, 450)], farSR))];
    }
    // the cannon's crack under the near field guns, pitched down for the heavy ones
    for (const [cls, rate, g] of [['light', 1, 0.55], ['field', 0.9, 0.5], ['med', 0.78, 0.4], ['heavy', 0.62, 0.35], ['huge', 0.5, 0.3]]) {
      const slices = cut('cannon', midSR, rate), near = B['gun_' + cls]?.near;
      if (slices.length && near) B['gun_' + cls].near = near.map((b, i) => blend(b, slices[i % slices.length], g));
    }
    // the real explosion under the near ground bursts, lower for the bigger shells
    for (const [cls, rate, g] of [['light', 1, 0.5], ['field', 0.92, 0.5], ['med', 0.82, 0.55], ['heavy', 0.68, 0.6], ['huge', 0.55, 0.65]]) {
      const slices = cut('blast', midSR, rate), near = B['burst_ground_' + cls]?.near;
      if (slices.length && near) B['burst_ground_' + cls].near = near.map((b, i) => blend(b, slices[0], g * (0.8 + 0.2 * i)));
    }
    // brass: the empty case dropped on the duckboards (a step of its own, 'case')
    const brass = cut('brass', midSR, 0.8);
    if (brass.length) (B.load ||= {}).case = brass.map((x) => make([normalize(x, 0.9)], midSR));
    this.recordingsInUse = Object.keys(R);
  }

  // ------------------------------------------------------------------ basics

  noiseBuffer(type) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else d[i] = w;
      }
    }
    return buf;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.round(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(0, Math.random() * buffer.duration);
    return s;
  }

  // Direction-only panner: distance attenuation is applied separately.
  panner(hrtf) {
    const p = this.ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1;
    p.rolloffFactor = 0;
    return p;
  }

  setPannerPos(p, x, y, z, glide = 0) {
    if (p.positionX) {
      if (glide > 0) {
        const now = this.ctx.currentTime;
        p.positionX.setTargetAtTime(x, now, glide);
        p.positionY.setTargetAtTime(y, now, glide);
        p.positionZ.setTargetAtTime(z, now, glide);
      } else {
        p.positionX.value = x;
        p.positionY.value = y;
        p.positionZ.value = z;
      }
    } else p.setPosition(x, y, z);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  /** Pull ambience and the working sounds down for a moment (and the other world sounds for big blasts). */
  duck(depth, time, sfx = false) {
    const now = this.ctx.currentTime;
    const targets = sfx ? [this.duckBus.gain, this.sfxDuck.gain] : [this.duckBus.gain];
    for (const g of targets) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(depth, now, 0.004);
      g.setTargetAtTime(1, now + time * 0.25, time * 0.45);
    }
  }

  /** Muffle the mix and ring the ears: 0..1, decaying over a few seconds (called by close blasts, also usable from outside). */
  deafen(k) {
    this.deaf = Math.max(this.deaf, clamp(k, 0, 1));
  }

  throttled(name, gap) {
    const now = this.ctx.currentTime;
    if (now - (this.throttle[name] ?? -Infinity) < gap) return true;
    this.throttle[name] = now;
    return false;
  }

  // ------------------------------------------------------------------ routing

  dist(p) {
    const l = this.listenerPos;
    return Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
  }

  gainAt(d, ref, level) {
    return level * Math.min(1, ref / Math.max(d, 1));
  }

  // air absorbs the highs, but a gun's low roar carries a long way
  absorb(d) {
    return Math.max(200, 16000 / (1 + d / 300));
  }

  // Out of voices: silence the quietest positional voice if the new sound is clearly louder.
  steal(g) {
    const now = this.ctx.currentTime;
    let quiet = null, quietG = Infinity;
    for (const v of this.voices) {
      if (v.direct || v.stolen) continue;
      const age = now - v.t0;
      const vg = age > 0 ? v.g * Math.exp(-age / 0.6) : v.g;
      if (vg < quietG) {
        quietG = vg;
        quiet = v;
      }
    }
    if (!quiet || quietG > g * 0.6) return false;
    quiet.out.gain.cancelScheduledValues(now);
    quiet.out.gain.setTargetAtTime(0, now, 0.015);
    quiet.stolen = true;
    quiet.end = now + 0.05;
    this.posVoices--;
    return true;
  }

  /** Positional voice: returns a route to connect sources to, or null when inaudible / out of voices. */
  route(pos, { ref = 20, level = 1, reverb = 0, bus = this.sfx } = {}) {
    const ctx = this.ctx;
    const d = this.dist(pos);
    const g = this.gainAt(d, ref, level);
    if (g < AUDIBLE || (this.posVoices >= MAX_VOICES && !this.steal(g))) {
      this.bedEnergy += g * 0.15;
      return null;
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.absorb(d);
    const pan = this.panner(false);
    this.setPannerPos(pan, pos.x, pos.y, pos.z);
    const out = ctx.createGain();
    out.gain.value = g;
    lp.connect(pan).connect(out).connect(bus);
    const nodes = [lp, pan, out];
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      out.connect(send).connect(this.reverbSend);
      nodes.push(send);
    }
    return { dest: lp, out, t0: ctx.currentTime + 0.01, d, g, end: 0, nodes, direct: false, stolen: false };
  }

  /** Non-positional voice (UI, ambience one-shots). `force` skips the cap (rare cues). */
  direct({ level = 1, pan = 0, bus = this.uiBus, filter = null, reverb = 0, force = false, at = 0 } = {}) {
    if (this.directVoices >= DIRECT_VOICES && !force) return null;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = level;
    const sp = ctx.createStereoPanner();
    sp.pan.value = pan;
    out.connect(sp).connect(bus);
    const nodes = [out, sp];
    let dest = out;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      f.Q.value = filter.q ?? 0.7;
      f.connect(out);
      dest = f;
      nodes.push(f);
    }
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      out.connect(send).connect(this.reverbSend);
      nodes.push(send);
    }
    return { dest, out, t0: ctx.currentTime + 0.005 + at, d: 0, g: level, end: 0, nodes, direct: true };
  }

  finish(r) {
    if (!r) return;
    this.voices.push(r);
    if (r.direct) this.directVoices++;
    else this.posVoices++;
  }

  reap(now) {
    let j = 0;
    for (const v of this.voices) {
      if (v.end + 0.1 < now) {
        for (const n of v.nodes) n.disconnect();
        if (v.direct) this.directVoices--;
        else if (!v.stolen) this.posVoices--;
      } else this.voices[j++] = v;
    }
    this.voices.length = j;
  }

  // a world sound: it travels to the listener at `speed` and only takes a voice when it arrives
  // (`extra` seconds later still, for the secondary blasts of a cook-off); the loudest few per kind
  // play each frame, the rest feed the distant rumble
  enqueue(kind, pos, ref, level, play, { speed = SOUND_SPEED, extra = 0 } = {}) {
    if (!this.ctx) return;
    pos = here(pos);
    const d = this.dist(pos);
    const g = this.gainAt(d, ref, level);
    if (g < (MIN_GAIN[kind] ?? AUDIBLE)) {
      this.bedEnergy += g * 0.15;
      return;
    }
    this.combat = Math.min(1, this.combat + g * 0.5);
    const delay = Math.min(d / speed, MAX_DELAY) + extra;
    if (delay > 0.08) {
      if (this.inFlight.length < 512) this.inFlight.push({ at: this.ctx.currentTime + delay, kind, pos, ref, level, play, g });
      else this.bedEnergy += g * 0.15;
      return;
    }
    if (this.queue.length < 256) this.queue.push({ kind, g, play, pos });
  }

  land(now) {
    let j = 0;
    for (const e of this.inFlight) {
      if (e.at > now) {
        this.inFlight[j++] = e;
        continue;
      }
      if (this.queue.length < 256) this.queue.push({ kind: e.kind, g: this.gainAt(this.dist(e.pos), e.ref, e.level), play: e.play, pos: e.pos });
    }
    this.inFlight.length = j;
  }

  flush(now) {
    const q = this.queue;
    if (!q.length) return;
    q.sort((a, b) => b.g - a.g);
    const used = this.used;
    for (const k in used) used[k] = 0;
    for (const e of q) {
      const n = used[e.kind] || 0;
      const close = e.g > 0.15;
      const cap = (CAPS[e.kind] ?? 2) * (close ? 3 : 1);
      const spaced = close || now - (this.lastPlay[e.kind] || -1) >= (GAPS[e.kind] ?? 0.03);
      if (n >= cap || !spaced) {
        this.bedEnergy += e.g * 0.15;
        continue;
      }
      used[e.kind] = n + 1;
      this.lastPlay[e.kind] = now;
      e.play(e.pos);
    }
    q.length = 0;
  }

  /** Play a pre-rendered sample into a voice. */
  playBuf(r, buf, { at = 0, rate = 1, gain = 1 } = {}) {
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let node = src;
    if (gain !== 1) {
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      node = g;
      r.nodes.push(g);
    }
    node.connect(r.dest);
    r.nodes.push(src);
    const t0 = r.t0 + at;
    src.start(t0);
    r.end = Math.max(r.end, t0 + buf.duration / rate + 0.02);
  }

  /** Near, mid or far rendering of a sample set for a distance d. */
  variant(set, d, near, mid) {
    if (!set) return null;
    const list = d < near ? set.near || set.mid || set.far : d < mid ? set.mid || set.far || set.near : set.far || set.mid || set.near;
    return list ? pick(list) : null;
  }

  /** The bank of a class, or the nearest class that has been rendered yet (the rest arrive over the first seconds). */
  classBank(prefix, cls) {
    const i = ORDER.indexOf(cls);
    for (let k = 0; k < ORDER.length; k++) {
      for (const j of k ? [i - k, i + k] : [i]) {
        const b = this.bank[prefix + ORDER[j]];
        if (b) return b;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ guns and bursts

  /** The blast of a close piece reaching the listener: dulls the mix, rings the ears, shakes and ducks the rest. */
  shock(d, c, pos, k = 1) {
    const f = clamp(1 - d / (c.deaf * k), 0, 1);
    if (f <= 0) return;
    this.deafen(f * 0.85);
    this.onShock?.({ d, k: f, pos });
    if (d < c.slap * k) {
      const big = c.cal >= 9;
      const r = this.direct({ level: Math.min(1.1, (0.8 * c.slap * k) / Math.max(d, c.slap * 0.25)), bus: this.blastBus, force: true });
      if (r) {
        this.playBuf(r, pick(this.bank.slap?.[big ? 'big' : 'small']));
        this.finish(r);
      }
      this.duck(big ? 0.2 : 0.35, big ? 2.2 : 1.2, true);
    }
  }

  /**
   * A gun firing at `pos`; `calibre` in inches (2.95 to 15). Class by calibre: light (field gun, sharp
   * crack), the 60-pdr, the 6-inch, the 9.2 and the 15-inch with the railway guns (the slam).
   */
  gun(pos, calibre = 6) {
    if (!this.ctx) return;
    const cls = classOf(calibre), c = CLS[cls];
    const rate = Math.pow(c.cal / Math.max(calibre, 1), 0.2) * (0.97 + Math.random() * 0.06);
    this.enqueue('gun', pos, c.ref, c.level, (p) => {
      const r = this.route(p, { ref: c.ref, level: c.level, reverb: 0.35, bus: this.blastBus });
      if (!r) return;
      this.playBuf(r, this.variant(this.classBank('gun_', cls), r.d, c.near, c.mid), { rate });
      this.finish(r);
      this.shock(r.d, c, p);
    });
    // heavy pieces also come through the ground, ahead of the air
    if (c.cal >= 9) this.tremor(pos, c, c.cal >= 15 ? 1 : 0.6);
  }

  tremor(pos, c, k) {
    const ref = c.ref * 0.5 * k, level = 0.9 * k;
    this.enqueue('tremor', pos, ref, level, (p) => {
      const d = this.dist(p), g = this.gainAt(d, ref, level);
      const r = this.direct({ level: g, bus: this.blastBus, filter: { type: 'lowpass', freq: 160 }, force: true });
      if (!r) return;
      this.playBuf(r, pick(this.bank.tremor?.[c.cal >= 15 ? 'big' : 'small']));
      this.finish(r);
    }, { speed: GROUND_SPEED });
  }

  /**
   * A shell bursting at `pos` (metres, world). `fuze`: 'air' or 'time' bursts in the air (a hail of
   * shrapnel); anything else (default) is a ground burst: a crump, earth thrown up and debris falling.
   */
  burst(pos, calibre = 6, { fuze = 'impact', ground } = {}) {
    if (!this.ctx) return;
    const cls = classOf(calibre), c = CLS[cls], s = c.cal / 6;
    const air = ground === false || fuze === 'air' || fuze === 'time' || fuze === 'shrapnel';
    const ref = 55 * Math.pow(s, 0.9) + 20, level = air ? 1.05 : 1.2 + 0.1 * Math.min(s, 2.5);
    const rate = Math.pow(c.cal / Math.max(calibre, 1), 0.2) * (0.96 + Math.random() * 0.08);
    this.enqueue('burst', pos, ref, level, (p) => {
      const r = this.route(p, { ref, level, reverb: 0.35, bus: this.blastBus });
      if (!r) return;
      const set = this.classBank(`burst_${air && cls !== 'huge' ? 'air' : 'ground'}_`, cls);
      this.playBuf(r, this.variant(set, r.d, 800 * s, 4000 * Math.sqrt(s)), { rate });
      this.finish(r);
      const bc = { cal: c.cal, deaf: 30 * Math.pow(s, 1.1) * (air ? 0.6 : 1), slap: 90 * Math.pow(s, 1.1) };
      this.shock(r.d, bc, p);
    });
    if (!air && c.cal >= 9) this.tremor(pos, c, 0.5 + 0.5 * Math.min(1, s / 2.5));
  }

  /** An ammunition store cooking off: a rolling string of bangs and cracks around `pos`; `size` 1 is a pit, 3 or more a dump. */
  cookOff(pos, size = 1) {
    if (!this.ctx) return;
    const n = Math.round(3 + 4 * size), ref = 70 * Math.sqrt(size) + 30;
    this.enqueue('cook', pos, ref, 1.0, (p) => {
      const r = this.route(p, { ref, level: 1.0, reverb: 0.3, bus: this.blastBus });
      if (!r) return;
      this.playBuf(r, pick(this.bank.cook?.crackle), { rate: 0.9 + Math.random() * 0.2 });
      this.finish(r);
    });
    for (let i = 0; i < n; i++) {
      const cal = i === n - 1 && size >= 2 ? 9.2 : i % 3 === 0 ? 6 : 3 + Math.random() * 2;
      const at = 0.15 + (i / n) * (1.2 + size * 0.7) + Math.random() * 0.25;
      const q = { x: pos.x + (Math.random() - 0.5) * 7 * size, y: pos.y + Math.random() * 2, z: pos.z + (Math.random() - 0.5) * 7 * size };
      const cc = CLS[classOf(cal)], s = cc.cal / 6, ref2 = 45 * Math.pow(s, 0.9) + 20;
      this.enqueue('cook', q, ref2, 1.1, (pp) => {
        const r = this.route(pp, { ref: ref2, level: 1.1, reverb: 0.3, bus: this.blastBus });
        if (!r) return;
        const set = this.classBank(`burst_${Math.random() < 0.4 ? 'air' : 'ground'}_`, classOf(cal));
        this.playBuf(r, this.variant(set, r.d, 600, 3000), { rate: 0.95 + Math.random() * 0.1 });
        this.finish(r);
        this.shock(r.d, { cal: cc.cal, deaf: 22 * s, slap: 60 * s }, pp);
      }, { extra: at });
    }
  }

  // ------------------------------------------------------------------ shells in flight

  /**
   * Bind a flight voice to a sim shell `{ pos, vel, alive, calibre, own }`; it is read every update
   * and stops when `alive` goes false. Own shells leave the gun (the camera often rides along behind
   * one: the air roars past it); big shells passing overhead are the freight train.
   */
  shell(sh) {
    if (!sh || this.shells.has(sh)) return;
    this.shells.set(sh, { incoming: false });
  }

  /** An enemy shell coming down close to the listener: adds the rising scream to its flight voice. */
  incoming(sh) {
    if (!sh) return;
    const e = this.shells.get(sh);
    if (e) e.incoming = true;
    else this.shells.set(sh, { incoming: true });
  }

  buildShellVoice() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;
    const pan = this.panner(false);
    const out = ctx.createGain();
    out.gain.value = 1;
    lp.connect(pan).connect(out).connect(this.shellBus);
    const parts = {};
    for (const k of ['tear', 'rush', 'whistle', 'train', 'scream']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(lp);
      const buf = this.bank.loop?.[k]?.[0];
      const src = buf ? this.loop(buf) : null;
      src?.connect(g);
      parts[k] = { g, src };
    }
    return { lp, pan, out, parts, sh: null };
  }

  updateShells(dt, now) {
    const l = this.listenerPos, lv = this.listenerVel;
    const cand = [];
    for (const [sh, e] of this.shells) {
      if (sh.alive === false) {
        this.shells.delete(sh);
        continue;
      }
      const p = sh.pos, v = sh.vel;
      if (!p) continue;
      const dx = p.x - l.x, dy = p.y - l.y, dz = p.z - l.z, d = Math.max(Math.hypot(dx, dy, dz), 0.5);
      const spd = v ? Math.hypot(v.x, v.y, v.z) : 0, sp = clamp(spd / 450, 0, 1);
      // closing speed along the line of sight, relative to the listener (a camera riding the shell hears no shift)
      const closing = v ? -((v.x - lv.x) * dx + (v.y - lv.y) * dy + (v.z - lv.z) * dz) / d : 0;
      const cal = sh.calibre ?? 6, size = clamp(cal / 15, 0.15, 1.1), big = smooth(cal, 7, 12);
      const own = sh.own ? 1 : 0.9;
      const g = {
        tear: 0.6 * sp * Math.min(1, (120 + 200 * size) / d) * (0.55 + 0.45 * size) * own,
        rush: 0.85 * sp * Math.pow(clamp(1 - d / 80, 0, 1), 1.4),
        whistle: 0.2 * sp * Math.min(1, 90 / d) * (1 - 0.6 * big),
        train: big * 0.95 * Math.pow(clamp(1 - d / 4000, 0, 1), 1.6) * smooth(sp, 0.1, 0.4) * (0.5 + 0.5 * Math.min(1, 600 / d)),
        scream: e.incoming ? 0.75 * Math.pow(clamp(1 - d / 2400, 0, 1), 1.5) * (closing > 0 ? 1 : 0.35) : 0,
      };
      const score = g.tear + g.rush + g.train * 1.2 + g.scream + g.whistle;
      if (score < 0.004) continue;
      cand.push({ sh, e, d, closing, g, score, size, big, p });
    }
    cand.sort((a, b) => b.score - a.score);
    const keep = cand.slice(0, SHELL_VOICES);
    const set = new Set(keep.map((c) => c.sh));
    for (const v of this.shellVoices) {
      if (v.sh && !set.has(v.sh)) {
        v.sh = null;
        for (const k in v.parts) v.parts[k].g.gain.setTargetAtTime(0, now, 0.025);
      }
    }
    for (const c of keep) {
      const v = this.shellVoices.find((s) => s.sh === c.sh) ?? this.shellVoices.find((s) => !s.sh);
      if (!v) break;
      v.sh = c.sh;
      const dop = clamp(SOUND_SPEED / Math.max(SOUND_SPEED - clamp(c.closing, -300, 300), 60), 0.5, 2.2);
      // heavy shells howl lower; the train is allowed to swing a whole octave as it passes
      const base = 1.18 - 0.5 * c.size;
      const rates = { tear: base * dop, rush: (0.9 + 0.2 * (1 - c.size)) * Math.sqrt(dop), whistle: base * dop, train: (1.05 - 0.3 * c.size) * dop, scream: (0.8 + 0.7 * (1 - clamp(c.d / 1800, 0, 1))) * dop };
      for (const k in v.parts) {
        const part = v.parts[k];
        if (part.src) part.src.playbackRate.setTargetAtTime(rates[k], now, 0.06);
        part.g.gain.setTargetAtTime(c.g[k], now, 0.05);
      }
      v.lp.frequency.setTargetAtTime(this.absorb(c.d), now, 0.08);
      this.setPannerPos(v.pan, c.p.x, c.p.y, c.p.z, 0.04);
    }
  }

  // ------------------------------------------------------------------ the crew, flares, console

  /**
   * A step of loading at `pos`: 'trolley' (shell trolley on its rails), 'crane' (chain and ratchet),
   * 'ram' (the rammer), 'breech' (screw swinging over and the lock; 'screw' alone, 'clang' alone),
   * 'cartridge' (charge bag), 'case' (empty brass), 'ready' and 'fire' (a shouted order).
   * `kind` (a calibre in inches, or a name such as 'bl15') makes the heavy ones deeper.
   */
  load(step, pos, kind) {
    if (!this.ctx) return;
    const key = STEPS[step] ?? step;
    const cal = typeof kind === 'number' ? kind : /15|rail/.test(kind ?? '') ? 15 : /9/.test(kind ?? '') ? 9.2 : /60|pdr/.test(kind ?? '') ? 5 : 6;
    const rate = Math.pow(6 / cal, 0.22) * (0.96 + Math.random() * 0.08);
    const voice = key === 'ready' || key === 'fire' || key === 'whistle';
    const ref = voice ? 80 : 18 + cal, level = voice ? 0.9 : 0.85;
    this.enqueue('load', pos, ref, level, (p) => {
      const r = this.route(p, { ref, level, reverb: 0.2 });
      if (!r) return;
      const buf = key === 'whistle' ? pick(this.bank.ui?.whistle) : pick(this.bank.load?.[key]);
      this.playBuf(r, buf, { rate: voice ? 0.95 + Math.random() * 0.1 : rate });
      this.finish(r);
    });
  }

  /** A signal flare or Very light fired at `pos`: 'very' (default), 'star', 'rocket' (louder, with the long hiss). */
  flare(pos, kind = 'very') {
    if (!this.ctx) return;
    const rocket = kind === 'rocket' || kind === 'sos';
    const ref = rocket ? 160 : 90, level = rocket ? 1 : 0.8;
    this.enqueue('flare', pos, ref, level, (p) => {
      const r = this.route(p, { ref, level, reverb: 0.4 });
      if (!r) return;
      this.playBuf(r, pick(this.bank.flare?.pop), { rate: rocket ? 0.8 : 1 });
      this.playBuf(r, pick(this.bank.flare?.hiss), { at: 0.12, rate: rocket ? 0.9 : 1.05, gain: rocket ? 0.35 : 0.2 });
      this.finish(r);
    });
  }

  /** Console and field-station sounds: 'phone' (buzzer), 'wireless' (morse), 'click', 'paper', 'bell', 'whistle'. */
  ui(name) {
    if (!this.ctx) return;
    const key = UI[name] ?? 'click';
    const loud = key === 'whistle' || key === 'phone';
    const r = this.direct({ level: LEVELS.ui * (loud ? 1.3 : 1), reverb: key === 'click' || key === 'paper' ? 0 : 0.12, force: loud, pan: key === 'wireless' ? -0.25 : 0 });
    if (!r) return;
    this.playBuf(r, pick(this.bank.ui?.[key]) ?? pick(this.bank.ui?.click), { rate: key === 'click' ? 0.92 + Math.random() * 0.16 : 1 });
    this.finish(r);
  }

  // ------------------------------------------------------------------ ambience

  buildAmbience() {
    const ctx = this.ctx;
    const mk = (buf, filters, gain) => {
      let n = this.loop(buf);
      for (const f of filters) {
        const b = ctx.createBiquadFilter();
        b.type = f[0];
        b.frequency.value = f[1];
        b.Q.value = f[2] ?? 0.7;
        n.connect(b);
        n = b;
      }
      const g = ctx.createGain();
      g.gain.value = gain;
      n.connect(g).connect(this.ambBus);
      return { g, f: n };
    };
    // wind over open ground: pink noise through a wandering band, with gusts, and a low moan
    this.wind = mk(this.pink, [['bandpass', 500, 0.6]], 0);
    this.windLow = mk(this.brown, [['lowpass', 140]], 0);
    this.gust = 0;
    this.gustT = 0;
    // the drumfire: a pre-rendered rolling rumble, with live thuds on top (see update)
    const drum = this.bank.loop?.drumfire?.[0];
    this.drum = drum ? mk(drum, [['lowpass', 300]], 0) : null;
    // rain: the pre-rendered patter once it is ready (the pump renders it a moment after start)
    this.rain = null;
    // the distant battle: a rumble fed by everything too far or too many to play
    this.bed = mk(this.brown, [['lowpass', 200]], 0);
  }

  /**
   * The mood of the front, each 0..1: `drumfire` is the endless distant barrage (a continuous low
   * rolling rumble with single thuds flickering in it), `rain` the patter, `wind` the breeze.
   */
  setAmbience({ drumfire, rain, wind } = {}) {
    if (drumfire !== undefined) this.amb.drumfire = clamp(drumfire, 0, 1);
    if (rain !== undefined) this.amb.rain = clamp(rain, 0, 1);
    if (wind !== undefined) this.amb.wind = clamp(wind, 0, 1);
  }

  thud(level) {
    const buf = pick(this.bank.thud?.far);
    if (!buf) return;
    // the odd closer, sharper report among the dull ones
    const sharp = Math.random() < 0.12 && this.bank.gun_field;
    const r = this.direct({ level: level * (0.35 + 0.65 * Math.random() ** 2), pan: Math.random() * 1.6 - 0.8, bus: this.ambBus, reverb: 0.3, filter: { type: 'lowpass', freq: sharp ? 1200 : 420 + Math.random() * 500 } });
    if (!r) return;
    this.playBuf(r, sharp ? pick(this.bank.gun_field.far) : buf, { rate: sharp ? 0.8 : 0.7 + Math.random() * 0.45 });
    this.finish(r);
  }

  updateAmbience(dt, now) {
    const a = this.amb, n = this.ambNow, k = 1 - Math.exp(-dt / 2.5);
    for (const key in a) n[key] += (a[key] - n[key]) * k;
    if (!this.rain && this.bank.loop?.rain) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 500;
      this.loop(this.bank.loop.rain[0]).connect(f).connect(g).connect(this.ambBus);
      this.rain = { g };
    }
    if (!this.drum && this.bank.loop?.drumfire) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      this.loop(this.bank.loop.drumfire[0]).connect(f).connect(g).connect(this.ambBus);
      this.drum = { g, f };
    }
    this.drum?.g.gain.setTargetAtTime(LEVELS.drumfire * n.drumfire ** 1.2, now, 0.5);
    this.drum?.f.frequency?.setTargetAtTime?.(220 + 380 * n.drumfire, now, 0.5);
    this.rain?.g.gain.setTargetAtTime(LEVELS.rain * n.rain, now, 0.5);
    // gusts
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = 2 + Math.random() * 6;
      this.gust = 0.6 + Math.random() * 0.9;
      this.wind.f.frequency?.setTargetAtTime?.(350 + Math.random() * 500, now, 1.2);
    }
    this.wind.g.gain.setTargetAtTime(LEVELS.wind * n.wind * this.gust, now, 1.5);
    this.windLow.g.gain.setTargetAtTime(LEVELS.wind * 1.4 * n.wind, now, 1.5);
    // single thuds flickering in the rumble
    if (n.drumfire > 0.03) {
      this.thudT -= dt;
      if (this.thudT <= 0) {
        this.thud(LEVELS.thud * (0.3 + 0.7 * n.drumfire));
        this.thudT = (0.15 + Math.random() * 0.9) / (0.2 + 2.2 * n.drumfire);
      }
    }
    // the battle rumble follows what could not be played
    this.bed.g.gain.setTargetAtTime(Math.min(0.35, this.bedEnergy * 0.9 + this.combat * 0.06), now, 0.4);
    this.bedEnergy *= Math.exp(-dt * 1.2);
    this.combat *= Math.exp(-dt * 0.12);
  }

  // ------------------------------------------------------------------ per frame

  setListener(camera, dt) {
    const L = this.ctx.listener;
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    // forward is -Z of the camera, up is +Y
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) {
      L.positionX.value = p.x;
      L.positionY.value = p.y;
      L.positionZ.value = p.z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
    // listener velocity (smoothed) for the Doppler of shells; a camera cut is not a speed
    const lp = this.listenerPos, lv = this.listenerVel;
    if (this.lastCam && dt > 0) {
      const jump = Math.hypot(p.x - lp.x, p.y - lp.y, p.z - lp.z);
      const k = jump > 400 * dt + 20 ? 1 : 1 - Math.exp(-dt / 0.12);
      const s = jump > 400 * dt + 20 ? 0 : 1 / dt;
      lv.x += ((p.x - lp.x) * s - lv.x) * k;
      lv.y += ((p.y - lp.y) * s - lv.y) * k;
      lv.z += ((p.z - lp.z) * s - lv.z) * k;
    }
    this.lastCam = true;
    lp.x = p.x;
    lp.y = p.y;
    lp.z = p.z;
  }

  update(dt, camera) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (camera) this.setListener(camera, dt);
    this.reap(now);
    this.land(now);
    this.flush(now);
    this.updateShells(dt, now);
    this.updateAmbience(dt, now);
    // the pressure of a close blast: a dull mix and ringing, recovering over a few seconds
    this.deaf = Math.max(0, this.deaf - dt * 0.4);
    const df = clamp(this.deaf, 0, 1);
    const cutoff = df > 0.01 ? 20000 * Math.pow(350 / 20000, Math.pow(df, 0.6)) : 20000;
    this.deafLp.frequency.setTargetAtTime(cutoff, now, df > 0.5 ? 0.04 : 0.25);
    this.ringGain.gain.setTargetAtTime(0.04 * df * df, now, 0.1);
  }
}

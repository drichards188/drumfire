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
const CAPS = { gun: 4, burst: 5, tremor: 2, load: 3, flare: 2, cook: 4, rocket: 3, launch: 2 };
const GAPS = { gun: 0.02, burst: 0.02, tremor: 0.06, load: 0.05, flare: 0.2, cook: 0.05, rocket: 0.05, launch: 0.1 };

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
  // WW2 only (Karl 23.6 in, Gustav 31.5 in, the V-1 and V-2 warheads): the slam you feel in the floor, an echo
  // rolling round the horizon for ten seconds; rendered only when the WW2 banks are asked for (enableWW2)
  colossal: { cal: 28, T: 0.06, crack: 0.5, crackF: 1000, boom: [36, 11, 0.3, 0.95], bodyF: 160, len: 10.5, roll: [22, 9, 0.4, 260], ref: 1400, level: 1.4, near: 3500, mid: 12000, deaf: 260, slap: 700 },
  // WW1 only, the Paris Gun (8.3 in through a 34 m barrel, a shell leaving at about 1,600 m/s): not the deepest
  // slam but the sharpest and loudest report on the field, a whip-crack of the muzzle blast with the shell's own bow
  // wave close behind it, then a long roll; rendered only when the WW1 banks are asked for (enableWW1)
  paris: { cal: 8.3, T: 0.022, crack: 1.5, crackF: 2600, boom: [44, 14, 0.24, 0.8], bodyF: 230, len: 10, roll: [22, 9, 0.42, 300], ref: 1700, level: 1.5, near: 3500, mid: 14000, deaf: 240, slap: 650 },
};
const ORDER = ['light', 'field', 'med', 'heavy', 'huge']; // the British game's classes (colossal is apart)
export const classOf = (cal) => (cal < 4 ? 'light' : cal < 5.5 ? 'field' : cal < 7.5 ? 'med' : cal < 12 ? 'heavy' : cal < 20 ? 'huge' : 'colossal');

// Calibre (in) of a shell kind when the shell object carries none; flight voices pick their kind from shell.kind.
const KIND_CAL = { lefh18: 4.13, sfh18: 5.87, k18: 6.79, mrs18: 8.3, nbw41: 6.24, bertha: 16.5, karl: 23.6, gustav: 31.5, v1: 22, v2: 26, q25: 3.45, m55: 5.5, rp3: 3, s76: 3, s122: 4.8, s152: 6 };
const ROCKET_KINDS = { nbw41: 1, rp3: 1 }; // the moaning rush instead of a shell's whistle
const COLOSSAL_KINDS = { gustav: 1, karl: 1 };

// Loudness of the non-bank sounds (the banks are normalized, these scale them in the mix).
export const LEVELS = { ui: 0.32, drumfire: 0.5, rain: 0.22, wind: 0.08, thud: 0.5, siren: 0.2 };

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
  const c = CLS[cls], colossal = cls === 'colossal', paris = cls === 'paris', big = cls === 'huge' || colossal || paris, heavy = cls === 'heavy' || big;
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
  if (colossal) {
    // a slam below the voice of any gun (felt more than heard), the ground heaving under it and the
    // charge's long, dark roar; then the far woods and hills give it back again and again
    thump(x, sr, 0.003, 26, 11, 0.4, 0.9, 1.1, 0.004);
    mixInto(x, layer(sr, r, { dur: c.len * 0.7, attack: 0.05, decay: 1.6, f: 45 }), 0.03, 0.7, sr);
    mixInto(x, layer(sr, r, { dur: c.len * 0.6, attack: 0.03, decay: 1.1, f: 120 }), 0.01, 0.6, sr);
    for (const [d, g] of [[0.55, 0.3], [1.1, 0.24], [1.9, 0.2]]) mixInto(x, onePole(onePole(Float32Array.from(x.subarray(0, Math.round(1.2 * sr))), sr, 300), sr, 260), d, g, sr);
  }
  if (paris) {
    // the whip-crack: a hard, bright snap on top of the blast, the shell's bow wave a few hundredths of a second
    // behind it, and the charge's long roar down the barrel's mouth
    blast(x, sr, 0, 0.9, 0.0016, 1.6, 0.00003);
    mixInto(x, layer(sr, r, { dur: 0.05, attack: 0.0001, decay: 0.004, type: 'hp', f: 2400 }), 0, 1.1, sr);
    blast(x, sr, 0.028, 0.65, 0.0012, 1.7, 0.00002);
    mixInto(x, layer(sr, r, { dur: 0.04, attack: 0.0001, decay: 0.003, type: 'hp', f: 3200 }), 0.028, 0.8, sr);
    thump(x, sr, 0.002, 30, 12, 0.3, 0.8, 0.9, 0.004);
    mixInto(x, layer(sr, r, { dur: c.len * 0.6, attack: 0.03, decay: 1.2, f: 110 }), 0.01, 0.55, sr);
    for (const [d, g] of [[0.6, 0.28], [1.3, 0.22], [2.2, 0.18]]) mixInto(x, onePole(Float32Array.from(x.subarray(0, Math.round(0.8 * sr))), sr, 420), d, g, sr);
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
  if (cls === 'colossal') {
    // the earth itself heaving: a second, slower slam and a long roar of the crater's throw falling back
    thump(x, sr, 0.01, 24, 10, 0.4, 1.3, 1.2, 0.006);
    mixInto(x, layer(sr, r, { dur: len - 0.3, attack: 0.08, decay: 1.8, f: 40 }), 0.05, 1, sr);
    mixInto(x, layer(sr, r, { dur: len - 0.5, attack: 0.3, decay: 1.6, f: 100 }), 0.3, 0.6, sr);
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

// ---------------------------------------------------------------- WW2 (German side): rockets, missiles, aircraft

/**
 * One 15 cm Nebelwerfer rocket leaving its tube: the ignition's crack, then the motor's howl rising to a
 * rough, beating shriek (the six angled venturis of the round, the "moaning Minnie") over a rushing roar,
 * then the pitch sagging as it tears away and the motor burns out (about 1.8 s).
 */
function rocketLaunchRecipe(sr, r) {
  const len = 4.2, n = Math.ceil(len * sr), x = new Float32Array(n);
  blast(x, sr, 0, 0.6, 0.004, 1.4, 0.0001);
  thump(x, sr, 0, 150, 60, 0.04, 0.5, 0.12);
  const burn = 1.5 + 0.3 * r(), env = (t) => (1 - Math.exp(-t / 0.05)) * (t < burn ? 1 : Math.exp(-(t - burn) / 0.7));
  // the howl: harmonic-rich, a slow wobble, a rasp at ~35 Hz and a second voice a little off it (the beating)
  const howl = new Float32Array(n), f0 = 240 + 40 * r(), f1 = 600 + 80 * r(), wob = 6 + 2 * r();
  for (const [det, amp] of [[1, 1], [1.017, 0.6]]) {
    let ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = (f0 + (f1 - f0) * (1 - Math.exp(-t / 0.35))) * (t > burn * 0.7 ? 1 - 0.18 * (1 - Math.exp(-(t - burn * 0.7) / 0.9)) : 1) * (1 + 0.035 * Math.sin(TAU * wob * t)) * det;
      ph += (TAU * f) / sr;
      // the ten harmonics by the Chebyshev recurrence sin((h+1)a) = 2 cos(a) sin(ha) - sin((h-1)a)
      const c2 = 2 * Math.cos(ph);
      let s = 0, s0 = 0, s1 = Math.sin(ph);
      for (let h = 1; h <= 10; h++) {
        s += s1 / h;
        const s2 = c2 * s1 - s0;
        s0 = s1;
        s1 = s2;
      }
      howl[i] += amp * s * (0.7 + 0.3 * Math.sin(TAU * 35 * t)) * env(t);
    }
  }
  biquad(howl, sr, 'bp', 1300, 0.55);
  mixInto(x, normalize(howl), 0.01, 0.85, sr);
  // the motor's rushing roar: bright while it is close, darker as it leaves
  const roar = new Float32Array(n);
  for (let i = 0; i < n; i++) roar[i] = (r() * 2 - 1) * env(i / sr);
  sweepLp(roar, sr, (t) => 600 + 3600 * Math.exp(-t / 1.4));
  biquad(roar, sr, 'hp', 60);
  mixInto(x, normalize(roar), 0, 0.75, sr);
  return saturate(normalize(x), 1.3);
}

/** The rocket in flight: a tearing, moaning rush (looping), lower and rougher than a shell's whistle. */
function moanLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const air = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'bp', 1100, 0.7), sr, 'hp', 400));
  const low = loopNoise(sr, r, n, (b) => biquad(b, sr, 'lp', 200));
  const tone = new Float32Array(n), f = snap(430, T), v = snap(3.5, T), am = snap(23, T);
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = TAU * f * t + 6 * Math.sin(TAU * v * t);
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin(h * ph) / h;
    tone[i] = s * (0.7 + 0.3 * Math.sin(TAU * am * t));
  }
  biquad(tone, sr, 'bp', 1000, 0.5);
  normalize(tone);
  for (let i = 0; i < n; i++) x[i] = tone[i] * 0.55 + air[i] * 0.8 + low[i] * 0.3;
  return normalize(x);
}

/** One combustion pulse of a pulse jet: the bang of the charge, the flame's spit, the tube ringing down. */
function pulseShape(sr, r) {
  const x = new Float32Array(Math.ceil(0.03 * sr));
  blast(x, sr, 0, 1, 0.0035, 1.2, 0.0003);
  mixInto(x, layer(sr, r, { dur: 0.025, attack: 0.0004, decay: 0.004, f: 3500 }), 0, 0.45, sr);
  mixInto(x, layer(sr, r, { dur: 0.02, attack: 0.0003, decay: 0.0025, type: 'bp', f: 3000, q: 0.6 }), 0.0005, 0.35, sr); // the spit
  return x;
}

/**
 * The Argus pulse jet of the V-1: about 47 bangs a second, each with its flame's spit, over the drone of
 * the tube; harsh, with harmonics far up. `jitter` varies each pulse as the valves flutter.
 */
function buzzLoop(sr, r) {
  const T = 2, n = Math.round(T * sr), x = new Float32Array(n), f = snap(47, T), k = Math.round(f * T);
  const shapes = [0, 1, 2, 3].map(() => pulseShape(sr, r));
  for (let i = 0; i < k; i++) wrapInto(x, shapes[i & 3], i / f, 0.75 + 0.25 * r(), sr);
  const roar = loopNoise(sr, r, n, (b) => biquad(b, sr, 'lp', 1500));
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = TAU * f * t;
    let s = 0;
    for (let h = 1; h <= 14; h++) s += Math.sin(h * ph) / h;
    // the exhaust roars in time with the bangs
    x[i] += 0.25 * s + 0.45 * roar[i] * (0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.cos(ph), 3));
  }
  biquad(x, sr, 'hp', 30);
  biquad(x, sr, 'lp', 7000);
  return normalize(saturate(normalize(x), 2.6));
}

/**
 * The Walter catapult firing: the steam generator's bang, a violent hiss and roar as the piston and the
 * V-1 run up the ramp, the piston leaving the tube with a clank, and the pulse jet (already at full power
 * on the ramp) hammering away down range while the flight voice takes over.
 */
function v1LaunchRecipe(sr, r) {
  const len = 5, n = Math.ceil(len * sr), x = new Float32Array(n);
  blast(x, sr, 0, 1, 0.009, 1.3, 0.0004);
  thump(x, sr, 0, 85, 34, 0.08, 0.9, 0.35);
  mixInto(x, layer(sr, r, { dur: 2.2, attack: 0.008, decay: 0.7, type: 'bp', f: 2600, q: 0.4 }), 0, 0.9, sr); // steam
  mixInto(x, layer(sr, r, { dur: 2, attack: 0.01, decay: 0.6, f: 700 }), 0, 0.7, sr);
  mixInto(x, layer(sr, r, { dur: 1.3, attack: 0.4, decay: 0.5, sweep: (t) => 700 + 3200 * Math.min(1, t / 1) }), 0, 0.5, sr); // the piston accelerating
  modes(x, sr, 1.05, [[260, 0.5, 0.25], [710, 0.3, 0.15], [1650, 0.2, 0.08], [3100, 0.1, 0.05]], r, 0.6); // the piston thrown out
  // the pulse jet going away: its bangs slowing a little with the Doppler shift and fading
  const shapes = [0, 1, 2].map(() => pulseShape(sr, r)), jet = new Float32Array(n);
  for (let t = 0.02, k = 0; t < len - 0.1; k++) {
    const a = t < 0.8 ? 1 : Math.exp(-(t - 0.8) / 1.4);
    mixInto(jet, shapes[k % 3], t, a * (0.75 + 0.25 * r()), sr);
    t += 1 / (47 - 7 * Math.min(1, t / 2.5));
  }
  biquad(jet, sr, 'lp', 5000);
  mixInto(x, normalize(jet), 0, 0.55, sr);
  return saturate(normalize(x), 1.4);
}

/** Rocket crackle: sparse sharp spikes of the supersonic exhaust (the "tearing" crackle), at `rate(t)` per second. */
function crackle(x, sr, r, t0, t1, rate, amp) {
  const shapes = [0, 1, 2].map(() => {
    const s = new Float32Array(Math.ceil(0.004 * sr));
    blast(s, sr, 0, 1, 0.00025 + 0.0002 * r(), 1.5, 0.00002);
    return s;
  });
  for (let t = t0; t < t1; t += (-Math.log(1 - r() * 0.999) / Math.max(rate(t), 1))) mixInto(x, shapes[Math.floor(r() * 3)], t, amp(t) * Math.pow(r(), 2.2), sr);
}

/**
 * A V-2's engine on the table: `pre` the preliminary stage (8 t of thrust, a lower roar and crackle while
 * the rocket stands), else the main stage: an overwhelming roar with a rumble in the chest and the crackle,
 * holding while the rocket rises off the table, then fading and darkening as it climbs (len s long).
 */
function v2Recipe(sr, r, { pre = false, len = 14, hold = 3.2 } = {}) {
  const n = Math.ceil(len * sr), x = new Float32Array(n);
  const att = pre ? 0.6 : 0.9, dec = (len - hold) / 3.2;
  const env = (t) => (1 - Math.exp(-t / att)) * (t < hold ? 1 : Math.exp(-(t - hold) / dec));
  if (pre) {
    blast(x, sr, 0, 0.5, 0.003, 1.4, 0.0001); // the igniter's pop
    thump(x, sr, 0.02, 90, 40, 0.06, 0.4, 0.3);
  } else thump(x, sr, 0.05, 30, 14, 0.4, 0.8, 0.8, 0.12);
  const roar = new Float32Array(n), rum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const e = env(i / sr);
    roar[i] = (r() * 2 - 1) * e;
    rum[i] = (r() * 2 - 1) * e;
  }
  sweepLp(roar, sr, pre ? () => 900 : (t) => (t < hold ? 3200 : 500 + 2700 * Math.exp(-(t - hold) / (dec * 0.8))));
  biquad(roar, sr, 'hp', 50);
  biquad(biquad(rum, sr, 'lp', 70), sr, 'lp', 110);
  biquad(rum, sr, 'hp', 18);
  mixInto(x, normalize(roar), 0, pre ? 0.6 : 0.9, sr);
  mixInto(x, normalize(rum), 0, pre ? 0.7 : 0.9, sr);
  const ck = new Float32Array(n);
  crackle(ck, sr, r, 0.1, len - 0.2, (t) => (pre ? 60 : 200) * env(t), (t) => env(t) * (t < hold ? 1 : Math.exp(-(t - hold) / (dec * 0.6))));
  biquad(ck, sr, 'hp', 700);
  mixInto(x, normalize(ck), 0, pre ? 0.3 : 0.45, sr);
  return tail(saturate(normalize(x), 1.3), sr, 0.3);
}

/** The V-2 roaring overhead (looping, bound to the rocket as it climbs): rumble, roar and crackle. */
function v2Loop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const rum = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'lp', 70), sr, 'lp', 100));
  const roar = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'lp', 1800), sr, 'hp', 60));
  for (let i = 0; i < n; i++) x[i] = rum[i] * 0.9 + roar[i] * 0.7;
  const ck = new Float32Array(n), shapes = [0, 1, 2].map(() => {
    const s = new Float32Array(Math.ceil(0.004 * sr));
    blast(s, sr, 0, 1, 0.0003, 1.5, 0.00002);
    return s;
  });
  for (let k = 0; k < 160 * T; k++) wrapInto(ck, shapes[k % 3], r() * T, Math.pow(r(), 2.2), sr);
  biquad(ck, sr, 'hp', 700);
  normalize(ck);
  for (let i = 0; i < n; i++) x[i] += ck[i] * 0.35;
  return normalize(x);
}

/**
 * A V-2 arriving: it is faster than its sound, so the warhead bursts first and the sonic boom's double
 * crack (bow and tail shocks) comes with it; this is the double crack, an N-wave each, and the heavy
 * rumble it leaves rolling.
 */
function v2BoomRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(1.6 * sr));
  for (const [t, a, d] of [[0, 1, 0.022], [0.16 + 0.04 * r(), 0.85, 0.02]]) {
    const i0 = Math.round(t * sr), m = Math.round(d * sr), rise = Math.max(1, Math.round(0.00015 * sr));
    for (let i = 0; i < m + rise; i++) {
      // the N: a jump up, a straight fall through zero to minus, a jump back
      const v = i < rise ? i / rise : i < m ? 1 - (2 * (i - rise)) / (m - rise) : -1 * (1 - (i - m) / rise);
      x[i0 + i] += a * v;
    }
    thump(x, sr, t, 60, 30, 0.05, 0.35 * a, 0.12);
  }
  mixInto(x, layer(sr, r, { dur: 1.4, attack: 0.03, decay: 0.45, f: 160 }), 0.02, 0.35, sr);
  return x;
}

/** The roar of the V-2's fall, heard after it has burst (the sound of its coming arrives last), dying away upward. */
function v2FallRecipe(sr, r) {
  const len = 4.5, x = new Float32Array(Math.ceil(len * sr));
  mixInto(x, layer(sr, r, { dur: len, attack: 0.25, decay: 1.3, sweep: (t) => 250 + 2200 * Math.exp(-t / 1.1) }), 0, 1, sr);
  mixInto(x, layer(sr, r, { dur: len, attack: 0.3, decay: 1.6, f: 90 }), 0, 0.6, sr);
  return x;
}

/**
 * A German air-raid siren (looping): the motor siren's wailing tone, rising and falling every 8 s (the
 * Fliegeralarm), two rotor voices beating slightly, with the rush of air through the ports.
 */
function sirenLoop(sr, r) {
  const T = 8, n = Math.round(T * sr), x = new Float32Array(n);
  const air = loopNoise(sr, r, n, (b) => biquad(b, sr, 'bp', 1500, 0.6));
  for (const [det, amp] of [[1, 1], [1.005, 0.5]]) {
    // f(t) = det (165 + 185 (1 - cos(2 pi t / T))): whole cycles per loop, so the phase closes exactly
    for (let i = 0; i < n; i++) {
      const t = i / sr, ph = TAU * det * (350 * t - (185 * T / TAU) * Math.sin((TAU * t) / T));
      x[i] += amp * (Math.sin(ph) + 0.5 * Math.sin(2 * ph + 0.4) + 0.3 * Math.sin(3 * ph + 1.1) + 0.12 * Math.sin(4 * ph + 2));
    }
  }
  normalize(x);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((TAU * i) / n); // the air rushes louder as the rotor comes up to speed
    x[i] = x[i] * (0.75 + 0.25 * w) + air[i] * 0.1 * (0.5 + w);
  }
  return normalize(x);
}

/**
 * The Napier Sabre of a Typhoon at low level (looping): the four-bladed propeller's beat, 24 cylinders
 * barking out of the stub exhausts in a rough snarl, the roar and the supercharger's whine.
 */
function sabreLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const prop = snap(98, T), bark = snap(186, T), k = Math.round(bark * T);
  const rough = loopNoise(sr, r, n, (b) => biquad(b, sr, 'lp', 25));
  const roar = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'lp', 1400), sr, 'hp', 50));
  const phs = Array.from({ length: 8 }, () => r() * TAU);
  for (let i = 0; i < n; i++) {
    const ph = (TAU * prop * i) / sr;
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin(h * ph + phs[h - 1]) / Math.pow(h, 0.8);
    x[i] = s * 0.35 * (0.8 + 0.4 * rough[i]) + roar[i] * 0.45;
  }
  const ex = new Float32Array(n);
  const pops = [0, 1, 2, 3].map(() => layer(sr, r, { dur: 0.012, attack: 0.0002, decay: 0.0015, type: 'bp', f: 800 + 600 * r(), q: 0.7 }));
  for (let i = 0; i < k; i++) wrapInto(ex, pops[i & 3], i / bark, 0.45 + 0.55 * r(), sr);
  normalize(ex);
  for (let i = 0; i < n; i++) x[i] += ex[i] * 0.55;
  addTone(x, sr, 2350, 0.03, T);
  return normalize(saturate(normalize(x), 1.5));
}

/**
 * The FF 33 field telephone being rung: the crank's magneto whirring and the polarized bell's clapper
 * hammering two gongs at the frequency of the current it makes, two long rings.
 */
function feldRecipe(sr, r) {
  const len = 2.5, x = new Float32Array(Math.ceil(len * sr));
  for (const [t0, d] of [[0.05, 0.9], [1.3, 0.9]]) {
    mixInto(x, layer(sr, r, { dur: d, attack: 0.05, decay: 0.6, type: 'bp', f: 380, q: 1.5 }), t0, 0.15, sr); // the magneto's gears
    for (let k = 0, t = t0; t < t0 + d; k++, t += 1 / (16 + 4 * Math.min(1, (t - t0) / 0.2))) {
      const a = k & 1;
      modes(x, sr, t, a ? [[1490, 0.4, 0.22], [3620, 0.16, 0.1], [5300, 0.07, 0.05]] : [[1330, 0.4, 0.25], [3250, 0.16, 0.1], [4900, 0.07, 0.05]], r, 0.5 + 0.2 * r());
      mixInto(x, layer(sr, r, { dur: 0.01, attack: 0.0002, decay: 0.0015, type: 'hp', f: 2500 }), t, 0.15, sr);
    }
  }
  biquad(x, sr, 'hp', 200);
  return saturate(normalize(x), 1.2);
}

/** A German field radio: static, the heterodyne's whistle as it is tuned in, a call in the tone, static again. */
function funkRecipe(sr, r) {
  const len = 1.9, n = Math.ceil(len * sr), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (r() * 2 - 1) * (r() < 0.003 ? 1.6 : 0.12);
  biquad(x, sr, 'bp', 1700, 0.5);
  let ph = 0;
  for (let i = 0; i < Math.round(0.4 * sr); i++) { // the whistle sliding down to the note
    const t = i / sr;
    ph += (TAU * (880 + 1800 * Math.exp(-t / 0.12))) / sr;
    x[i + Math.round(0.05 * sr)] += 0.5 * Math.sin(ph) * Math.min(1, t / 0.02, (0.4 - t) / 0.05);
  }
  let t = 0.55;
  for (const d of [0.2, 0.07, 0.2, 0.07]) { // dah-dit-dah-dit
    const m = Math.round(d * sr), i0 = Math.round(t * sr), a = Math.round(0.004 * sr);
    for (let i = 0; i < m; i++) x[i0 + i] += 0.7 * Math.sin((TAU * 880 * i) / sr) * Math.min(1, i / a, (m - i) / a);
    t += d + 0.07;
  }
  biquad(x, sr, 'hp', 300);
  biquad(x, sr, 'lp', 3000);
  return x;
}

/**
 * Every bank as a list of build tasks [group, key, fn], so start() can render the
 * essentials at once and spread the rest over a few frames. `make(channels, sampleRate)`
 * turns sample arrays into an AudioBuffer. Distances: 'near' / 'mid' / 'far'. `ww2`: false (the
 * British game's banks only, as before), true (those, then the WW2 banks), 'only' (just the WW2 banks).
 * `ww1: 'only'` gives just the WW1 German mode's banks (the Paris Gun's report), with seeds of their own.
 */
export function bankTasks(SR, make, { ww2 = false, ww1 = false } = {}) {
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
  if (ww1 === 'only') {
    gun('paris', 701);
    return tasks;
  }
  if (ww2 === 'only') {
    ww2Banks();
    return tasks;
  }
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
  if (ww2) ww2Banks();
  return tasks;

  // The German side (WW2 mode), after the British banks and with seeds of their own, so the British
  // game renders exactly as before; rocket voices and launches first, the colossal guns last.
  function ww2Banks() {
    const farLaunch = (fn, len) => far(farSR, fn, len, { count: 12, t0: 0.3, t1: 3, gain: 0.45, f: 420 });
    tasks.push(
      ['loop', 'moan', set(1, 503, loopOf(loopSR, moanLoop))],
      ['loop', 'buzz', set(1, 509, loopOf(loopSR, buzzLoop))],
      ['rocket', 'near', set(3, 521, (r) => mono(midSR)(rocketLaunchRecipe(midSR, r)))],
      ['rocket', 'far', set(2, 527, farLaunch((r) => rocketLaunchRecipe(farSR, r), 6.5))],
      ['v1', 'launch', set(2, 541, (r) => mono(midSR)(v1LaunchRecipe(midSR, r)))],
      ['v1', 'far', set(1, 547, farLaunch((r) => v1LaunchRecipe(farSR, r), 7.5))],
      ['loop', 'v2', set(1, 557, loopOf(loopSR, v2Loop))],
      ['v2', 'pre', set(1, 563, (r) => mono(loopSR)(v2Recipe(loopSR, r, { pre: true, len: 5.5, hold: 4.6 })))],
      ['v2', 'main', set(1, 569, (r) => mono(loopSR)(v2Recipe(loopSR, r, { len: 14, hold: 3.2 })))],
      ['v2', 'ignite', set(1, 571, (r) => mono(loopSR)(v2Recipe(loopSR, r, { len: 4.5, hold: 3 })))],
      ['v2', 'boom', set(2, 577, (r) => mono(midSR)(v2BoomRecipe(midSR, r)))],
      ['v2', 'fall', set(1, 587, (r) => mono(midSR)(v2FallRecipe(midSR, r)))],
      ['loop', 'sabre', set(1, 593, loopOf(loopSR, sabreLoop))],
      ['loop', 'siren', set(1, 599, loopOf(loopSR, sirenLoop))],
      ['ui', 'feld', set(1, 601, (r) => mono(midSR)(feldRecipe(midSR, r)))],
      ['ui', 'funk', set(2, 607, (r) => mono(midSR)(funkRecipe(midSR, r)))]
    );
    gun('colossal', 613);
    bursts('colossal', 'ground', 617);
  }
}

// ================================================================== the engine

const MIN_GAIN = { burst: 0.003, load: 0.02, flare: 0.01 };
const STEPS = { trolley: 'trolley', crane: 'crane', chain: 'crane', ram: 'ram', rammer: 'ram', breech: 'breech', screw: 'screw', clang: 'clang', lock: 'clang', cartridge: 'cartridge', charge: 'cartridge', bag: 'cartridge', ready: 'ready', fire: 'fire', whistle: 'whistle' };
const UI = { phone: 'phone', wireless: 'wireless', click: 'click', paper: 'paper', bell: 'bell', whistle: 'whistle', gong: 'bell', switch: 'click', button: 'click', lock: 'click', alarm: 'phone', warning: 'phone', feldfernsprecher: 'feld', fernsprecher: 'feld', feld: 'feld', funk: 'funk', funkspruch: 'funk' };
const UI_WW2 = { feld: 'phone', funk: 'wireless' }; // what plays while the WW2 banks are still being rendered

// Sources that move and are heard where they were when the sound left them (aircraft, the climbing V-2):
// a ring of past positions, sampled every `dt` s, searched for the emission whose sound arrives now.
const HIST = 256;
function track(dt) {
  return { dt, t: new Float64Array(HIST), x: new Float64Array(HIST), y: new Float64Array(HIST), z: new Float64Array(HIST), on: new Uint8Array(HIST), head: -1, n: 0, last: -1e9 };
}
function trackPush(tr, now, p, on, force = false) {
  if (!force && now - tr.last < tr.dt) return;
  tr.last = now;
  const h = (tr.head = (tr.head + 1) % HIST);
  tr.t[h] = now;
  tr.x[h] = p.x;
  tr.y[h] = p.y;
  tr.z[h] = p.z;
  tr.on[h] = on ? 1 : 0;
  tr.n = Math.min(tr.n + 1, HIST);
}
/** The retarded source: position, closing speed toward the listener `L` and whether it was sounding; false while nothing has arrived yet. */
function retarded(tr, L, now, out) {
  let nf = 0, ni = -1;
  for (let k = 0; k < tr.n; k++) {
    const i = (tr.head - k + HIST) % HIST;
    const dx = tr.x[i] - L.x, dy = tr.y[i] - L.y, dz = tr.z[i] - L.z, d = Math.hypot(dx, dy, dz);
    const f = now - tr.t[i] - d / SOUND_SPEED; // >= 0: this emission has reached the listener
    if (f < 0) {
      nf = f;
      ni = i;
      continue;
    }
    // between this (older, arrived) and the newer one not yet arrived; or the newest of all
    const u = ni < 0 ? 0 : f / (f - nf), j = ni < 0 ? i : ni;
    out.x = tr.x[i] + (tr.x[j] - tr.x[i]) * u;
    out.y = tr.y[i] + (tr.y[j] - tr.y[i]) * u;
    out.z = tr.z[i] + (tr.z[j] - tr.z[i]) * u;
    out.t = tr.t[i] + (tr.t[j] - tr.t[i]) * u;
    out.on = tr.on[ni < 0 || u < 0.5 ? i : j];
    out.newest = ni < 0;
    // the source's velocity there, from the pair that brackets it (or the newest two)
    const a = ni < 0 ? (i - 1 + HIST) % HIST : i, b = ni < 0 ? i : j, dt = tr.t[b] - tr.t[a];
    out.closing = 0;
    if (dt > 1e-3 && (ni >= 0 || tr.n > 1)) {
      const vx = (tr.x[b] - tr.x[a]) / dt, vy = (tr.y[b] - tr.y[a]) / dt, vz = (tr.z[b] - tr.z[a]) / dt;
      const ex = out.x - L.x, ey = out.y - L.y, ez = out.z - L.z, d2 = Math.max(Math.hypot(ex, ey, ez), 0.5);
      out.closing = -(vx * ex + vy * ey + vz * ez) / d2;
    }
    out.d = Math.max(Math.hypot(out.x - L.x, out.y - L.y, out.z - L.z), 0.5);
    return true;
  }
  return false;
}

export class AudioEngine {
  constructor({ context = null, ww2 = false, ww1 = false } = {}) {
    this.ctx = null;
    this.wantWW1 = ww1; // render the WW1 banks (the Paris Gun) at start (else on its first shot, or enableWW1())
    this.ww1 = false;
    this.wantWW2 = ww2; // render the WW2 banks at start (else on the first WW2 call, or enableWW2())
    this.ww2 = false;
    this.movers = []; // aircraft and climbing rockets: looping voices heard at their retarded position
    this.sirenV = null;
    this.ret = { x: 0, y: 0, z: 0, t: 0, d: 1, closing: 0, on: 0, newest: false };
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
    this.raw = {}; // banks the worker sent before the context existed (prepare)
    this.built = { here: 0, worker: 0 }; // banks rendered on the main thread and in the worker
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
    this.make = make;
    // the banks the worker has rendered while the page loaded (prepare) are only wrapped; runTask skips them
    for (const g in this.raw) for (const k in this.raw[g]) (this.bank[g] ||= {})[k] = this.wrap(this.raw[g][k]);
    this.raw = {};
    this.ww2 = this.wantWW2;
    const tasks = bankTasks(ctx.sampleRate, make, { ww2: this.ww2 });
    const split = tasks.indexOf(null);
    // with the worker still at it (prepare) even the essentials come from it: its finished banks wait in the message
    // queue until this busy stretch of the page (the end of loading) is over, a moment from now. A sound asked for
    // before then plays the nearest bank there is, or nothing (variant, bankOf).
    if (!this.worker) for (const t of tasks.slice(0, split)) this.runTask(t);
    this.pending = this.worker ? tasks.filter(Boolean) : tasks.slice(split + 1);
    if (this.wantWW1) {
      this.ww1 = true;
      this.pending.push(...bankTasks(ctx.sampleRate, make, { ww1: 'only' }));
    }
    if (this.given) while (this.pending.length) this.runTask(this.pending.shift());
    else {
      this.pump();
      this.loadRecordings();
    }

    this.buildAmbience();
    for (let i = 0; i < SHELL_VOICES; i++) this.shellVoices.push(this.buildShellVoice());
  }

  runTask([group, key, fn]) {
    if (this.bank[group]?.[key]) return; // (the worker's, prepare)
    (this.bank[group] ||= {})[key] = fn();
    this.built.here++;
  }

  /**
   * Render the sample banks in a worker while the page loads (src/audioWorker.js): they are plain Float32Array maths
   * and need no audio context, and built on the main thread after the first click (up to 220 ms a bank, the WW2
   * ones the heaviest) they stuttered the first salvos. Call after enableWW2/enableWW1 so the era's banks come too.
   * Without workers (or with a given context, the tests) start() builds them as before.
   */
  prepare() {
    if (this.worker || this.given || this.ctx || typeof Worker === 'undefined') return;
    try {
      const w = this.worker = new Worker(new URL('./audioWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => this.received(data);
      w.onerror = () => { this.worker = null; };
      w.postMessage({ SR: 48000, ww2: !!this.wantWW2, ww1: !!this.wantWW1 });
    } catch (e) {
      this.worker = null;
    }
  }

  received({ group, key, v, done }) {
    if (done) { this.worker?.terminate(); this.worker = null; return; }
    this.built.worker++;
    if (!this.ctx) (this.raw[group] ||= {})[key] = v;
    else if (!this.bank[group]?.[key]) (this.bank[group] ||= {})[key] = this.wrap(v);
  }

  wrap(v) {
    const one = (s) => this.make(s.chans, s.sr);
    return Array.isArray(v) ? v.map(one) : one(v);
  }

  // one bank per tick so the first seconds never stall; while the worker still renders them (prepare) it waits for it
  pump() {
    if (!this.pending.length) {
      this.pumping = false;
      return;
    }
    this.pumping = true;
    if (this.worker) {
      setTimeout(() => this.pump(), 100);
      return;
    }
    this.runTask(this.pending.shift());
    setTimeout(() => this.pump(), 12);
  }

  /**
   * Render the WW2 banks (rockets, the V-1 and V-2, the colossal guns, aircraft, siren, German console
   * sounds) over the next frames. Called by the first WW2 sound if nobody did; pass `{ ww2: true }` to the
   * constructor, or call this early (on choosing the WW2 mode), so the first rocket is not a placeholder.
   */
  enableWW2() {
    if (this.ww2) return;
    if (!this.ctx) {
      this.wantWW2 = true;
      return;
    }
    this.ww2 = true;
    for (const t of bankTasks(this.ctx.sampleRate, this.make, { ww2: 'only' })) if (t) this.pending.push(t);
    if (this.given) while (this.pending.length) this.runTask(this.pending.shift());
    else if (!this.pumping) this.pump();
  }

  /** Render the WW1 German mode's banks (the Paris Gun's report) over the next frames, as enableWW2 does. */
  enableWW1() {
    if (this.ww1) return;
    if (!this.ctx) {
      this.wantWW1 = true;
      return;
    }
    this.ww1 = true;
    for (const t of bankTasks(this.ctx.sampleRate, this.make, { ww1: 'only' })) if (t) this.pending.push(t);
    if (this.given) while (this.pending.length) this.runTask(this.pending.shift());
    else if (!this.pumping) this.pump();
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
    if (cls === 'colossal') {
      if (this.bank[prefix + cls]) return this.bank[prefix + cls];
      this.enableWW2();
      cls = 'huge'; // until it is rendered
    }
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
        this.playBuf(r, pick(this.bank.slap?.[big ? 'big' : 'small']), { rate: c.cal >= 20 ? 0.75 : 1 });
        this.finish(r);
      }
      this.duck(big ? 0.2 : 0.35, big ? 2.2 : 1.2, true);
    }
  }

  /**
   * A gun firing at `pos`; `calibre` in inches (2.95 to 18). Class by calibre: light (field gun, sharp
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
    if (c.cal >= 9) this.tremor(pos, c, c.cal >= 20 ? 1.3 : c.cal >= 15 ? 1 : 0.6);
  }

  /**
   * The Paris Gun firing at `pos` (WW1 German mode): its own class, the sharpest and loudest report of the field,
   * through the ground ahead of the air like the heaviest pieces. Until its bank is rendered, the 15-inch's stands in.
   */
  parisGun(pos) {
    if (!this.ctx) return;
    this.enableWW1();
    const c = CLS.paris;
    this.enqueue('gun', pos, c.ref, c.level, (p) => {
      const r = this.route(p, { ref: c.ref, level: c.level, reverb: 0.4, bus: this.blastBus });
      if (!r) return;
      this.playBuf(r, this.variant(this.bank.gun_paris ?? this.classBank('gun_', 'huge'), r.d, c.near, c.mid), { rate: 0.97 + Math.random() * 0.06 });
      this.finish(r);
      this.shock(r.d, c, p);
    });
    this.tremor(pos, CLS.huge, 1.2);
  }

  tremor(pos, c, k) {
    const ref = c.ref * 0.5 * k, level = 0.9 * k;
    this.enqueue('tremor', pos, ref, level, (p) => {
      const d = this.dist(p), g = this.gainAt(d, ref, level);
      const r = this.direct({ level: g, bus: this.blastBus, filter: { type: 'lowpass', freq: 160 }, force: true });
      if (!r) return;
      this.playBuf(r, pick(this.bank.tremor?.[c.cal >= 15 ? 'big' : 'small']), { rate: c.cal >= 20 ? 0.7 : 1 });
      this.finish(r);
    }, { speed: GROUND_SPEED });
  }

  /**
   * A shell bursting at `pos` (metres, world). `fuze`: 'air' or 'time' bursts in the air (a hail of
   * shrapnel); anything else (default) is a ground burst: a crump, earth thrown up and debris falling.
   * A V-2 (`fuze: 'v2'` or `kind: 'v2'`) comes with the sonic boom's double crack and, last, the roar of its fall.
   */
  burst(pos, calibre = 6, { fuze = 'impact', ground, kind } = {}) {
    if (!this.ctx) return;
    const cls = classOf(calibre), c = CLS[cls], s = c.cal / 6;
    const air = cls !== 'colossal' && (ground === false || fuze === 'air' || fuze === 'time' || fuze === 'shrapnel');
    if (fuze === 'v2' || kind === 'v2') this.v2Arrival(pos, s);
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
   * WW2 kinds by `shell.kind`: 'nbw41' (and 'rp3') the rocket's moaning rush; 'v1' the pulse jet's buzz
   * until `shell.engineOff` is set (it stops dead, heard d / 343 s later); 'v2' none (it outruns its sound);
   * 'gustav' and 'karl' a deeper, heavier freight train; the other German guns by calibre as before.
   */
  shell(sh) {
    if (!sh || this.shells.has(sh) || sh.kind === 'v2') return;
    if (ROCKET_KINDS[sh.kind] || sh.kind === 'v1' || COLOSSAL_KINDS[sh.kind]) this.enableWW2();
    this.shells.set(sh, { incoming: false, t0: this.ctx?.currentTime ?? 0, offAt: Infinity });
  }

  /** An enemy shell coming down close to the listener: adds the rising scream to its flight voice. */
  incoming(sh) {
    if (!sh || sh.kind === 'v2') return;
    const e = this.shells.get(sh);
    if (e) e.incoming = true;
    else this.shells.set(sh, { incoming: true, t0: this.ctx?.currentTime ?? 0, offAt: Infinity });
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

  /** The WW2 loops join a voice the first time it carries one of their kinds (British voices never build them). */
  addPart(v, k) {
    const buf = this.bank.loop?.[k]?.[0];
    if (!buf || v.parts[k]) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(v.lp);
    const src = this.loop(buf);
    src.connect(g);
    v.parts[k] = { g, src };
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
      const cal = sh.calibre ?? KIND_CAL[sh.kind] ?? 6, size = clamp(cal / 15, 0.15, 1.1), big = smooth(cal, 7, 12);
      const own = sh.own ? 1 : 0.9;
      const g = {
        tear: 0.6 * sp * Math.min(1, (120 + 200 * size) / d) * (0.55 + 0.45 * size) * own,
        rush: 0.85 * sp * Math.pow(clamp(1 - d / 80, 0, 1), 1.4),
        whistle: 0.2 * sp * Math.min(1, 90 / d) * (1 - 0.6 * big),
        train: big * 0.95 * Math.pow(clamp(1 - d / 4000, 0, 1), 1.6) * smooth(sp, 0.1, 0.4) * (0.5 + 0.5 * Math.min(1, 600 / d)),
        scream: e.incoming ? 0.75 * Math.pow(clamp(1 - d / 2400, 0, 1), 1.5) * (closing > 0 ? 1 : 0.35) : 0,
        moan: 0,
        buzz: 0,
      };
      let kind = 0; // 0 a shell, 1 a rocket, 2 the V-1, 3 a colossal shell
      if (ROCKET_KINDS[sh.kind]) {
        // the moan carries well beyond the tearing; louder while the motor still burns (about 1.8 s)
        kind = 1;
        const burning = sh.burning ?? now - e.t0 < 1.8;
        g.moan = 0.8 * Math.min(1, 400 / d) * (burning ? 1 : 0.6) * (0.4 + 0.6 * sp);
        g.tear *= 0.4;
        g.whistle = 0;
        g.train = 0;
      } else if (sh.kind === 'v1') {
        // the pulse jet: heard for many km; when it cuts out the silence reaches the listener d / 343 s later
        kind = 2;
        if (sh.engineOff && e.offAt === Infinity) e.offAt = now + d / SOUND_SPEED;
        g.buzz = now < e.offAt ? 0.95 * Math.pow(Math.min(1, 700 / d), 0.85) : 0;
        g.tear = g.whistle = g.train = 0;
        g.rush *= 0.5;
      } else if (COLOSSAL_KINDS[sh.kind] || cal >= 20) {
        // the 600 and 800 mm shells: a lower, slower train that carries twice as far
        kind = 3;
        g.train = 1.1 * Math.pow(clamp(1 - d / 8000, 0, 1), 1.4) * smooth(sp, 0.1, 0.4) * (0.5 + 0.5 * Math.min(1, 1200 / d));
        g.whistle = 0;
      }
      const score = g.tear + g.rush + g.train * 1.2 + g.scream + g.whistle + g.moan + g.buzz;
      if (score < 0.004) continue;
      cand.push({ sh, e, d, closing, g, score, size, big, p, kind });
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
      const rates = { tear: base * dop, rush: (0.9 + 0.2 * (1 - c.size)) * Math.sqrt(dop), whistle: base * dop, train: (1.05 - 0.3 * c.size) * dop, scream: (0.8 + 0.7 * (1 - clamp(c.d / 1800, 0, 1))) * dop, moan: dop, buzz: dop };
      if (c.kind === 3) rates.train *= 0.72;
      if (c.kind === 1) this.addPart(v, 'moan');
      else if (c.kind === 2) this.addPart(v, 'buzz');
      for (const k in v.parts) {
        const part = v.parts[k];
        if (part.src) part.src.playbackRate.setTargetAtTime(rates[k], now, 0.06);
        // the V-1's engine stops dead, not in a fade
        part.g.gain.setTargetAtTime(c.g[k], now, k === 'buzz' && !c.g.buzz ? 0.006 : 0.05);
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

  // ------------------------------------------------------------------ WW2: rockets, missiles, aircraft, siren

  /** A one-shot from bank `group` (near / far by distance) as a world sound with the travel delay. */
  oneShot(kind, pos, group, { ref, level, near = 600, reverb = 0.35, shock = null, rate = 1, extra = 0 }) {
    this.enqueue(kind, pos, ref, level, (p) => {
      const r = this.route(p, { ref, level, reverb, bus: this.blastBus });
      if (!r) return;
      const set = this.bank[group[0]];
      const list = (r.d < near ? set?.[group[1]] : set?.[group[2] ?? group[1]]) ?? set?.[group[1]];
      this.playBuf(r, pick(list), { rate: rate * (0.97 + Math.random() * 0.06) });
      this.finish(r);
      if (shock) this.shock(r.d, shock, p);
    }, { extra });
  }

  /**
   * One 15 cm Nebelwerfer rocket leaving its tube at `pos`: the rising, beating howl and the rushing roar.
   * A ripple is six of these about 1.6 s apart: call it per rocket, or once with `{ n: 6, gap: 1.6 }`.
   */
  rocket(pos, { n = 1, gap = 1.6 } = {}) {
    if (!this.ctx) return;
    this.enableWW2();
    for (let i = 0; i < n; i++) this.oneShot('rocket', pos, ['rocket', 'near', 'far'], { ref: 140, level: 1.25, near: 700, shock: { cal: 6, deaf: 22, slap: 30 }, extra: i * gap, rate: 0.96 + 0.08 * Math.random() });
  }

  /** The V-1's steam catapult firing at `pos` (the foot of the ramp): bang, hissing roar, the jet hammering away. */
  v1Launch(pos) {
    if (!this.ctx) return;
    this.enableWW2();
    this.oneShot('launch', pos, ['v1', 'launch', 'far'], { ref: 220, level: 1.3, near: 1500, shock: { cal: 9, deaf: 45, slap: 60 } });
  }

  /**
   * A V-2's engine at `pos` (the firing table): k 0 the preliminary stage (a lower roar and crackle while it
   * stands, about 5 s), k 1 the main stage (the overwhelming roar). With `obj` ({ pos, alive, burning? },
   * pos updated by the sim) the main stage's roar follows the rocket up, heard where it was when the sound
   * left it, until `alive` is false or `burning` false (burn-out); without it, a 14 s roar fading as it climbs.
   */
  v2Launch(pos, k = 1, obj = null) {
    if (!this.ctx) return;
    this.enableWW2();
    if (!k) return this.oneShot('launch', pos, ['v2', 'pre'], { ref: 500, level: 1.1, reverb: 0.4 });
    const p0 = here(pos), follow = obj?.pos;
    this.oneShot('launch', p0, ['v2', follow ? 'ignite' : 'main'], { ref: 1500, level: 1.35, near: 1e9, reverb: 0.5, shock: { cal: 12, deaf: 120, slap: 0 } });
    this.enqueue('launch', p0, 1500, 1, () => this.duck(0.35, follow ? 4 : 8, true));
    if (follow) this.mover(obj, 'v2', { ref: 3000, level: 1.1, dt: 0.25, attack: 2.5, life: 200, bus: this.blastBus, onKey: 'burning' });
  }

  /** The sonic boom's double crack with a V-2's burst, and the roar of its fall arriving last. */
  v2Arrival(pos, s) {
    this.enableWW2();
    const ref = 55 * Math.pow(s, 0.9) + 20;
    this.enqueue('burst', pos, ref * 1.5, 1.2, (p) => {
      const r = this.route(p, { ref: ref * 1.5, level: 1.2, reverb: 0.4, bus: this.blastBus });
      if (!r) return;
      this.playBuf(r, pick(this.bank.v2?.boom));
      this.playBuf(r, pick(this.bank.v2?.fall), { at: 1.3 + Math.random() * 0.5, gain: 0.55, rate: 0.9 + Math.random() * 0.15 });
      this.finish(r);
    });
  }

  /**
   * A low-flying aircraft's engine bound to `obj` ({ pos, alive }): a Typhoon's Napier Sabre, heard where
   * the aircraft was when the sound left it, with Doppler; it ends when `alive` turns false.
   */
  aircraft(obj) {
    if (!this.ctx || !obj?.pos || this.movers.some((m) => m.obj === obj)) return;
    this.enableWW2();
    this.mover(obj, 'sabre', { ref: 160, level: 1.0, dt: 0.1, attack: 0.3, life: 1e9, bus: this.sfx, onKey: 'alive' });
  }

  /** A looping voice on a moving object, started when its bank is ready (the WW2 banks may still be rendering). */
  mover(obj, loop, opts) {
    const tr = track(opts.dt);
    trackPush(tr, this.ctx.currentTime, obj.pos, true, true);
    this.movers.push({ obj, loop, ...opts, tr, src: null, nodes: null, t0: this.ctx.currentTime, dead: false, fade: 0 });
  }

  updateMovers(now) {
    const L = this.listenerPos, R = this.ret;
    let j = 0;
    for (const m of this.movers) {
      const o = m.obj;
      // emissions: while the object lives and its engine runs; one last sample marks the end
      if (!m.dead) {
        const on = o.alive !== false && (m.onKey === 'alive' || o[m.onKey] !== false);
        if (on && o.pos) trackPush(m.tr, now, o.pos, true);
        else {
          trackPush(m.tr, now, o.pos ?? L, false, true);
          m.dead = true;
        }
      }
      if (!m.src && this.bank.loop?.[m.loop]) {
        const ctx = this.ctx;
        const g = ctx.createGain(), lp = ctx.createBiquadFilter(), pan = this.panner(false), out = ctx.createGain();
        g.gain.value = 0;
        lp.type = 'lowpass';
        out.gain.value = m.level;
        const src = this.loop(this.bank.loop[m.loop][0]);
        src.connect(g).connect(lp).connect(pan).connect(out).connect(m.bus);
        m.src = src;
        m.nodes = { g, lp, pan, out };
      }
      const heard = retarded(m.tr, L, now, R);
      const over = (m.dead && heard && !R.on) || now - m.t0 > m.life;
      if (m.nodes) {
        const n = m.nodes;
        let gain = 0;
        if (heard && R.on) {
          gain = Math.min(1, m.ref / R.d) * Math.min(1, (now - m.t0) / m.attack);
          const dop = clamp(SOUND_SPEED / Math.max(SOUND_SPEED - clamp(R.closing, -300, 300), 60), 0.5, 2.2);
          m.src.playbackRate.setTargetAtTime(dop, now, 0.08);
          n.lp.frequency.setTargetAtTime(this.absorb(R.d), now, 0.1);
          this.setPannerPos(n.pan, R.x, R.y, R.z, 0.05);
        }
        n.g.gain.setTargetAtTime(gain, now, over ? 0.15 : 0.08);
      }
      if (over) {
        m.fade ||= now;
        if (now - m.fade > 1) {
          if (m.src) {
            m.src.stop();
            for (const k in m.nodes) m.nodes[k].disconnect();
            m.src.disconnect();
          }
          continue;
        }
      }
      this.movers[j++] = m;
    }
    this.movers.length = j;
  }

  /** The air-raid siren over the launch site: `on` winds it up into its rising and falling wail, off winds it down. */
  siren(on = true) {
    if (!this.ctx) return;
    this.enableWW2();
    const ctx = this.ctx, now = ctx.currentTime, v = this.sirenV;
    if (on) {
      if (v && !v.off) return;
      const buf = this.bank.loop?.siren?.[0];
      if (!buf) {
        this.sirenWanted = true; // update() starts it once the bank is ready
        return;
      }
      this.sirenWanted = false;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain(), lp = ctx.createBiquadFilter(), sp = ctx.createStereoPanner(), send = ctx.createGain();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      sp.pan.value = 0.35;
      send.gain.value = 0.7;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(LEVELS.siren, now + 4);
      // the rotor spinning up: the pitch climbs from a growl to the wail
      src.playbackRate.setValueAtTime(0.25, now);
      src.playbackRate.linearRampToValueAtTime(1, now + 5);
      src.connect(lp).connect(g).connect(sp).connect(this.ambBus);
      g.connect(send).connect(this.reverbSend);
      src.start(now, 0);
      this.sirenV = { src, nodes: [src, g, lp, sp, send], g, off: false };
    } else {
      this.sirenWanted = false;
      if (!v || v.off) return;
      v.off = true;
      // the siren running down: the long falling moan as the rotor slows
      for (const [prm, to] of [[v.src.playbackRate, 0.15], [v.g.gain, 0]]) {
        prm.cancelScheduledValues(now);
        prm.setValueAtTime(prm.value, now);
        prm.linearRampToValueAtTime(to, now + 9);
      }
      setTimeout(() => {
        v.src.stop();
        for (const n of v.nodes) n.disconnect();
        if (this.sirenV === v) this.sirenV = null;
      }, 9500);
    }
  }

  /**
   * Console and field-station sounds: 'phone' (buzzer), 'wireless' (morse), 'click', 'paper', 'bell', 'whistle';
   * the German console's 'feldfernsprecher' (the FF 33's crank and bell) and 'funk' (a field radio's call).
   */
  ui(name) {
    if (!this.ctx) return;
    let key = UI[name] ?? 'click';
    if (UI_WW2[key]) {
      this.enableWW2();
      if (!this.bank.ui?.[key]) key = UI_WW2[key];
    }
    const loud = key === 'whistle' || key === 'phone' || key === 'feld';
    const r = this.direct({ level: LEVELS.ui * (loud ? 1.3 : 1), reverb: key === 'click' || key === 'paper' ? 0 : 0.12, force: loud, pan: key === 'wireless' || key === 'funk' ? -0.25 : 0 });
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
    if (this.movers.length) this.updateMovers(now);
    if (this.sirenWanted && this.bank.loop?.siren) this.siren(true);
    this.updateAmbience(dt, now);
    // the pressure of a close blast: a dull mix and ringing, recovering over a few seconds
    this.deaf = Math.max(0, this.deaf - dt * 0.4);
    const df = clamp(this.deaf, 0, 1);
    const cutoff = df > 0.01 ? 20000 * Math.pow(350 / 20000, Math.pow(df, 0.6)) : 20000;
    this.deafLp.frequency.setTargetAtTime(cutoff, now, df > 0.5 ? 0.04 : 0.25);
    this.ringGain.gain.setTargetAtTime(0.04 * df * df, now, 0.1);
  }
}

// The max-quality battery's own sound (shots/maxq/PLAN.md 3.6, the basic training's lent 21 cm Mörser 18 pair): the
// recipes of its banks, built in the audio worker while the page loads, only on a page that asks for them
// (new AudioEngine({ hero: { kinds: ['mrs18'] } })), with seeds of their own after every other bank, so every other page
// renders and sounds exactly as before (tools/audiotest.mjs hashes every other bank). Plain Float32Array maths on the
// helpers of src/audioDsp.js: no audio context, safe in Node and in workers.
//
// hero_<kind>: the report in layers that the engine mixes at runtime by distance, charge and the muzzle's direction
// (AudioEngine.heroGun): crack (the shock front of the muzzle blast), bow (the shell's own bow wave on the supersonic
// charges), body (the recorded boom, rebuilt from the recordings in the worker's second job; a synthesized stand-in
// until then), tail (the landscape answering, continuous), mech (the gun's steel at the end of the recoil stroke), runout
// (the recuperator's hiss and the buffer's clunk), pressure (the push in the chest under 15 m) and burst (the 21 cm
// shell's detonation, fragments and stones, laid over the heavy ground burst). foley_mlaf: the Mörserlafette's drill
// (shared by the K 18 later) and the men's steps on the steel and the earth; loop.mlaf_elev and loop.mlaf_trav the gears.
// FOLEY_CUES maps each drill sound to a named moment of the crew's cycle clock (render/herocues.js HERO_CUES, with a
// [step, k] of its own for when the name is not there) and a place on the rig; render/foley.js plays them.
import { TAU, mulberry, biquad, sweepLp, onePole, normalize, mixInto, wrapInto, blast, saturate, tail, onset, loopNoise, addTone, snap } from './audioDsp.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// Per hero kind: the calibre (in), the charges' muzzle velocities (m/s, GUNS[kind].charges, so the engine needs no sim
// tables), the bank groups, the rig's measures (k18.js: the trunnions 2.2 m up, the muzzle 4.76 m ahead of them, the
// walkway's deck 1.1 m) for the ground image when the caller gives no ground height, and the recoil's timing as the
// render poses it (render/guns.js: out in 0.14 s, held to 0.45 s, run out over GUNS.mrs18.runout = 4 s).
export const HERO = {
  mrs18: {
    cal: 8.3, charges: [300, 400, 490, 565], group: 'hero_mrs18', foley: 'foley_mlaf',
    // the run-out from tf 0.45 s: the barrel home at tf 2.05 and the top carriage at 3.35 (render/herocues.js runOutHome, carriageHome)
    trunnion: 2.2, muzzle: 4.76, deck: 1.1, stroke: 0.12, runoutAt: 0.45, runA: 1.6, runB: 2.9,
    tail: 0.22, // the landscape's tail against the body (AudioEngine.heroGun)
  },
};
export const HERO_KINDS = Object.keys(HERO);

/** A charge's muzzle velocity from the caller's options: `v` (m/s), a charge index, a charge record { v }, else the top charge. */
export function chargeV(H, { v, charge } = {}) {
  if (v > 0) return v;
  if (typeof charge === 'number') return charge > 20 ? charge : H.charges[clamp(Math.round(charge), 0, H.charges.length - 1)];
  if (charge?.v > 0) return charge.v;
  return H.charges[H.charges.length - 1];
}

// ---------------------------------------------------------------- helpers of the hero recipes

/** Band-pass whose centre follows f(t) (RBJ, 0 dB peak), updated every 32 samples. */
function sweepBp(x, sr, f, q = 1) {
  let y1 = 0, y2 = 0, x1 = 0, x2 = 0, b0 = 0, b2 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) {
      const w = (TAU * Math.min(f(i / sr), sr * 0.45)) / sr, cs = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
      b0 = a / a0;
      b2 = -b0;
      c1 = (-2 * cs) / a0;
      c2 = (1 - a) / a0;
    }
    const v = x[i], y = b0 * v + b2 * x2 - c1 * y1 - c2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** White noise under an attack/decay envelope, as burst() of src/audioDsp.js with the exponentials by recurrence (faster). */
function envNoise(sr, r, dur, attack, decay = 1e9) {
  const n = Math.ceil(dur * sr), x = new Float32Array(n), kd = Math.exp(-1 / (sr * decay)), ka = Math.exp(-1 / (sr * attack));
  let d = 1, a = 1;
  for (let i = 0; i < n; i++) {
    x[i] = (r() * 2 - 1) * (1 - a) * d;
    d *= kd;
    a *= ka;
  }
  return x;
}

/** A filtered noise layer at unit peak, as layer() of src/audioDsp.js on envNoise. */
function layerF(sr, r, { dur, attack = 0.001, decay, type = 'lp', f, q = 0.707, sweep = null }) {
  const x = envNoise(sr, r, dur, attack, decay);
  if (sweep) sweepLp(x, sr, sweep);
  else biquad(x, sr, type, f, q);
  if (type === 'bp' || type === 'lp') biquad(x, sr, 'hp', 18);
  return normalize(x);
}

/** A damped sine falling from f0 toward f1, as thump() of src/audioDsp.js with its exponentials by recurrence. */
function thumpF(x, sr, at, f0, f1, tau, amp, decay, attack = 0.0015) {
  const i0 = Math.round(at * sr), n = Math.min(Math.ceil(decay * 7 * sr), x.length - i0);
  const kg = Math.exp(-1 / (sr * tau)), kd = Math.exp(-1 / (sr * decay)), ka = Math.exp(-1 / (sr * attack));
  let ph = 0, g = 1, d = 1, a = 1;
  for (let i = 0; i < n; i++) {
    ph += (TAU * (f1 + (f0 - f1) * g)) / sr;
    x[i0 + i] += amp * (1 - a) * d * Math.sin(ph);
    g *= kg;
    d *= kd;
    a *= ka;
  }
}

/** Lower and longer by resampling with a 4-point cubic (Catmull-Rom): the recordings keep their top end better than linear. */
function resampleCubic(x, rate) {
  const n = Math.floor((x.length - 1) / rate), o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate, j = Math.floor(p), t = p - j;
    const a = x[j - 1] ?? x[j], b = x[j], c = x[j + 1] ?? b, d = x[j + 2] ?? c;
    o[i] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  }
  return o;
}

/** Noise that catches and slips (a scrape, a slide): band-passed along f(t), chopped by irregular stick-slip releases. */
function scrape(sr, r, { dur, f, q = 1.2, rate = [30, 80], depth = 0.7, attack = 0.04, release = 0.08, shape = null }) {
  const n = Math.ceil(dur * sr), x = new Float32Array(n), am = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  sweepBp(x, sr, f, q);
  for (let t = r() * 0.01; t < dur; t += 1 / (rate[0] + (rate[1] - rate[0]) * r())) {
    const k = Math.round(t * sr), w = Math.round((0.003 + 0.012 * r()) * sr), a = 0.35 + 0.65 * r();
    for (let i = 0; i < w && k + i < n; i++) am[k + i] = Math.max(am[k + i], a * (1 - i / w) ** 1.5);
  }
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.min(1, t / attack, Math.max(0, dur - t) / release) * (shape ? shape(t) : 1);
    x[i] *= env * (1 - depth + depth * am[i]);
  }
  return normalize(x);
}

/**
 * Struck partials [freq, amp, decay] added into x (modes() of src/audioDsp.js by a two-pole recurrence instead of an exp
 * and a sin per sample: the hero banks have hundreds of them and must build in a fraction of a second).
 */
function ring(x, sr, at, list, r, gain = 1) {
  const i0 = Math.round(at * sr);
  for (const [f, a, d] of list) {
    const n = Math.min(Math.ceil(d * 6 * sr), x.length - i0);
    if (n <= 0) continue;
    const w = (TAU * Math.min(f, sr * 0.45)) / sr, rho = Math.exp(-1 / (sr * d)), c1 = 2 * rho * Math.cos(w), c2 = rho * rho, ph = r() * TAU;
    let y2 = gain * a * Math.sin(ph), y1 = gain * a * rho * Math.sin(ph + w);
    x[i0] += y2;
    if (n > 1) x[i0 + 1] += y1;
    for (let i = 2; i < n; i++) {
      const y = c1 * y1 - c2 * y2;
      x[i0 + i] += y;
      y2 = y1;
      y1 = y;
    }
  }
}

/** A sharp mechanical tick: a high-passed noise grain a few ms long. */
function tick(x, sr, r, at, amp, f = 2500, decay = 0.0012) {
  mixInto(x, layerF(sr, r, { dur: decay * 8, attack: 0.00006, decay, type: 'hp', f }), at, amp, sr);
}

/** Struck partials scaled to a fundamental: ratios [ratio, amp, decay]. */
const partials = (f0, list, ampK = 1, decK = 1) => list.map(([m, a, d]) => [f0 * m, a * ampK, d * decK]);

// the brass case: a thin cylinder of about 0.41 m (the 21 cm Gr 18's, 9.5 in at the base), its partials as struck
const CASE = [[1, 0.5, 1.2], [2.4, 0.3, 0.8], [3.9, 0.25, 0.6], [5.5, 0.15, 0.4], [7.6, 0.08, 0.25]];
// the loading tray, a pressed steel trough
const TRAY = [[240, 0.4, 0.15], [610, 0.3, 0.1], [1180, 0.2, 0.06], [1970, 0.1, 0.04], [3050, 0.05, 0.02]];
// the walkway's grating and the deck plates
const GRATE = [[320, 0.3, 0.08], [740, 0.25, 0.05], [1350, 0.15, 0.04], [2400, 0.1, 0.03], [3900, 0.05, 0.02]];

// ---------------------------------------------------------------- the report

/** The shock front of the muzzle blast at a few metres: a sub-millisecond rise, a broadband crack, the jet's sizzle. */
function crackRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.15 * sr));
  blast(x, sr, 0, 0.06, 0.0008, 1.6, 0.00005); // the precursor: gas escaping round the shell before it leaves
  const t0 = 0.0012 + 0.0004 * r();
  blast(x, sr, t0, 1, 0.0028 + 0.0008 * r(), 1.5, 0.000015);
  mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.00005, decay: 0.0045, type: 'hp', f: 1800 }), t0, 0.75, sr); // the shock's hiss
  mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.00003, decay: 0.0016, type: 'hp', f: 5000 }), t0, 0.45, sr); // its very top
  mixInto(x, layerF(sr, r, { dur: 0.12, attack: 0.0003, decay: 0.02, type: 'bp', f: 5500, q: 0.6 }), t0 + 0.0008, 0.18, sr); // the gas jet's sizzle
  mixInto(x, layerF(sr, r, { dur: 0.14, attack: 0.002, decay: 0.03, type: 'bp', f: 2600, q: 0.5 }), t0 + 0.002, 0.12, sr); // the jet tearing
  biquad(x, sr, 'hp', 25);
  return tail(normalize(x, 0.95), sr, 0.005);
}

/** The shell's bow wave: an N wave 1.4 to 1.9 ms long and its hiss (a sonic boom in miniature). */
function bowRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.03 * sr));
  const i0 = Math.round(0.001 * sr), m = Math.round((0.0014 + 0.0005 * r()) * sr), rise = Math.max(1, Math.round(0.00002 * sr));
  for (let i = 0; i < m + rise; i++) x[i0 + i] += i < rise ? i / rise : i < m ? 1 - (2 * (i - rise)) / (m - rise) : -(1 - (i - m) / rise);
  mixInto(x, layerF(sr, r, { dur: 0.012, attack: 0.00003, decay: 0.0015, type: 'hp', f: 3000 }), 0.001, 0.3, sr);
  return tail(normalize(x, 0.95), sr, 0.004);
}

/** The synthesized stand-in for the recorded boom (until the recordings are built): blast, slam, chest, roar; no echo. */
function bodySynth(sr, r) {
  const x = new Float32Array(Math.ceil(3.6 * sr));
  blast(x, sr, 0, 1, 0.018 * (0.9 + 0.2 * r()), 1.3, 0.0003);
  thumpF(x, sr, 0, 58, 24, 0.12, 1, 0.42);
  thumpF(x, sr, 0.004, 110, 46, 0.05, 0.55, 0.21);
  mixInto(x, layerF(sr, r, { dur: 2.7, attack: 0.02, decay: 0.29, f: 70 }), 0.02, 0.5, sr);
  mixInto(x, layerF(sr, r, { dur: 3.2, attack: 0.01, decay: 0.33, f: 250 }), 0, 0.9, sr);
  mixInto(x, layerF(sr, r, { dur: 0.9, attack: 0.004, decay: 0.2, sweep: (t) => 3200 * Math.exp(-t * 4) + 260 }), 0, 0.4, sr);
  bodyCommon(x, sr, r);
  return x;
}

/** What every take of the body gets: the sub slam, the chest, the propellant's afterburn and the ground's rumble. */
function bodyCommon(x, sr, r) {
  thumpF(x, sr, 0.002, 52, 19, 0.11, 0.5, 0.45, 0.003);
  thumpF(x, sr, 0.004, 98, 42, 0.05, 0.25, 0.2);
  mixInto(x, layerF(sr, r, { dur: 0.5, attack: 0.025, decay: 0.12, type: 'bp', f: 260, q: 0.5 }), 0.012, 0.35, sr); // the afterburn "whoomph"
  mixInto(x, layerF(sr, r, { dur: 1.8, attack: 0.02, decay: 0.5, f: 70 }), 0.01, 0.3, sr); // the ground's rumble
  biquad(x, sr, 'hp', 20);
  tail(normalize(saturate(normalize(x), 1.15), 0.95), sr, 0.25);
}

/**
 * Take k of the body from the recordings (`roles` maps a role to its cut slices, as recordedGun takes them): a big gun's
 * full report (boom), a modern howitzer's bright report (snap) and a 76 mm gun's weight (body), each pitched down for the
 * 21 cm and laid at its onset, a different slice of each per take; no rolling echo (the tail is a bank of its own) and
 * no field gun's crack (the crack is).
 */
function bodyRecorded(sr, r, roles, k) {
  const x = new Float32Array(Math.ceil(3.6 * sr)), p = [1, 0.965, 0.93, 0.985, 0.95, 0.915][k % 6];
  for (const [j, [role, rate, gain]] of [['boom', 0.8, 0.9], ['snap', 0.84, 0.55], ['body', 0.62, 0.45]].entries()) {
    const list = roles[role];
    if (!list?.length) continue;
    const a = resampleCubic(list[(k + j) % list.length], rate * p);
    mixInto(x, a.subarray(onset(a, sr)), j ? 0.002 : 0, gain, sr);
  }
  bodyCommon(x, sr, r);
  return x;
}

/**
 * The landscape answering for seconds (24 kHz, 7.5 s): a dark rolling rumble that swells as the ridges and woods give the
 * report back, and copies of the report itself, darkened, overlapping so that there is never a gap. `src` is the body
 * take the echoes are made of (with a crack at its head).
 */
function tailRecipe(sr, r, src) {
  const len = 7.5, n = Math.ceil(len * sr), x = new Float32Array(n);
  const rum = new Float32Array(n);
  for (let i = 0; i < n; i++) rum[i] = r() * 2 - 1;
  biquad(biquad(rum, sr, 'lp', 380), sr, 'lp', 300);
  const swells = Array.from({ length: 4 + Math.floor(r() * 3) }, () => [0.6 + 4.9 * r(), 0.25 + 0.25 * r(), 0.3 + 0.7 * r()]);
  for (let i0 = 0; i0 < n; i0 += 32) { // (the envelope is slow: worked out every 32 samples)
    const t = i0 / sr;
    let s = 1;
    for (const [c, w, h] of swells) s += 0.6 * h * Math.exp(-0.5 * ((t - c) / w) ** 2);
    const e = Math.exp(-t / 1.7) * s;
    for (let i = i0; i < Math.min(n, i0 + 32); i++) rum[i] *= e * Math.min(1, i / sr / 0.15);
  }
  mixInto(x, normalize(rum), 0, 0.55, sr);
  // the report's own echoes off the ridges, 0.8 s each, so that one is still sounding when the next comes
  // (far off the highs are gone and the ground smears the front: dark, and each copy fading in over 120 ms)
  const ex = new Float32Array(Math.round(0.8 * sr));
  ex.set(src.subarray(0, Math.min(ex.length, src.length)));
  for (let i = 0; i < ex.length; i++) ex[i] *= Math.min(1, i / (0.12 * sr), (ex.length - i) / (0.3 * sr));
  biquad(biquad(ex, sr, 'lp', 420, 0.6), sr, 'lp', 420, 0.6);
  normalize(ex);
  const at = [0.35, 0.8, 1.25, 1.9, 2.6, 3.4, 4.3, 5.2, 6.1], count = 6 + Math.floor(r() * 4);
  for (let k = 0; k < count; k++) {
    const u = k / (count - 1), d = at[k] * (0.85 + 0.3 * r());
    mixInto(x, ex, d, 0.45 * Math.exp(-1.6 * u) * (0.7 + 0.3 * r()), sr);
  }
  for (let i = 0, m = Math.round(0.15 * sr); i < m; i++) x[i] *= i / m;
  biquad(x, sr, 'hp', 25);
  return tail(normalize(x, 0.9), sr, 0.4);
}

/**
 * The gun's steel at the end of the recoil stroke (the boom has the weight; this is the clank and the rattle): cradle and
 * top carriage on their stops, the walkways' gratings and the tools on them rattling, the springs and the platform under.
 */
function mechRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.9 * sr));
  ring(x, sr, 0.0, [[455, 0.22, 0.15], [1020, 0.32, 0.12], [2280, 0.22, 0.07], [3900, 0.14, 0.04], [5600, 0.06, 0.025], [190, 0.08, 0.25]], r);
  ring(x, sr, 0.012 + 0.008 * r(), [[640 * (0.9 + 0.2 * r()), 0.16, 0.08], [1580, 0.14, 0.06], [2950, 0.09, 0.035]], r); // the top carriage a moment after
  thumpF(x, sr, 0.0, 120, 60, 0.03, 0.2, 0.08);
  tick(x, sr, r, 0, 0.35, 1800, 0.002);
  for (let i = 0, n = 40 + Math.floor(r() * 16); i < n; i++) { // the walkways' gratings and the tools on them, settling
    const t = 0.008 + 0.6 * Math.pow(r(), 1.6);
    ring(x, sr, t, [[1200 + 3200 * r(), 0.13, 0.008 + 0.025 * r()]], r, (0.4 + 0.6 * r()) * Math.exp(-t / 0.28));
    if (r() < 0.3) tick(x, sr, r, t, 0.06 * Math.exp(-t / 0.2), 2500, 0.001);
  }
  ring(x, sr, 0.02, [[95, 0.12, 0.45], [233, 0.06, 0.3]], r); // the equilibrators' springs
  ring(x, sr, 0, [[88, 0.12, 0.5], [241, 0.08, 0.35], [470, 0.05, 0.2]], r); // the platform
  biquad(x, sr, 'hp', 60);
  return tail(normalize(x, 0.95), sr, 0.1);
}

/**
 * The run-out (24 kHz, from the end of the hold): the barrel gliding back into battery on its recuperator over `a` s and
 * the top carriage on its rails over `b` s (render/herocues.js runOutHome and carriageHome, less the hold), each at the
 * speed 6u(1 - u) of a smoothstep: the gas's hiss and the oil gurgling through the buffer's ports with the barrel, the
 * slides scraping and catching with the carriage. The two seats at the end are banks of their own (runHome, carHome),
 * played on their cues.
 */
function runoutRecipe(sr, r, a = 1.6, b = 2.9) {
  const len = b + 0.3, n = Math.ceil(len * sr), x = new Float32Array(n);
  const sp = (t, d) => { const u = clamp(t / d, 0, 1); return (6 * u * (1 - u)) / 1.5; };
  const hiss = envNoise(sr, r, len, 0.05), oil = envNoise(sr, r, len, 0.05), slide = envNoise(sr, r, len, 0.05);
  biquad(biquad(hiss, sr, 'bp', 1400, 0.5), sr, 'hp', 500);
  biquad(oil, sr, 'bp', 300, 3);
  biquad(slide, sr, 'bp', 700, 0.8);
  normalize(hiss);
  normalize(oil);
  normalize(slide);
  const am = 8 + 6 * r();
  for (let i = 0; i < n; i++) {
    const t = i / sr, sa = sp(t, a), sb = sp(t, b);
    x[i] = hiss[i] * sa * 0.35 + oil[i] * (0.7 * sa + 0.3 * sb) * 0.25 * (0.6 + 0.4 * Math.sin(TAU * am * t)) + slide[i] * sb * 0.3;
  }
  for (let k = 0; k < 40; k++) { // the carriage's slides catching and letting go
    const t = b * (0.08 + 0.84 * r());
    ring(x, sr, t, [[600 + 900 * r(), 0.08, 0.015 + 0.02 * r()]], r, sp(t, b) * (0.3 + 0.7 * r()));
  }
  biquad(x, sr, 'hp', 30);
  return tail(normalize(x, 0.95), sr, 0.2);
}

/** The barrel home on its recuperator: a soft hydraulic thump into the counter-recoil buffer. */
function runHomeRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.6 * sr));
  thumpF(x, sr, 0, 120, 60, 0.03, 0.7, 0.1, 0.004);
  ring(x, sr, 0, [[310 * (0.95 + 0.1 * r()), 0.2, 0.12], [760, 0.1, 0.06], [1700, 0.04, 0.03]], r);
  mixInto(x, layerF(sr, r, { dur: 0.15, attack: 0.004, decay: 0.03, type: 'bp', f: 500, q: 1.5 }), 0, 0.25, sr); // the oil's last push
  return x;
}

/** The top carriage home on its rails: deeper, heavier, the whole gun's steel answering a little. */
function carHomeRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.8 * sr));
  thumpF(x, sr, 0, 110, 52, 0.03, 0.8, 0.14, 0.003);
  ring(x, sr, 0, [[165, 0.5, 0.3], [430, 0.3, 0.18], [990, 0.2, 0.08], [2150, 0.1, 0.04]], r, 0.8);
  tick(x, sr, r, 0, 0.12, 1500, 0.002);
  return x;
}

/** The push in the chest within a few metres: one slow pressure cycle (18 to 28 Hz), its suction phase longer and shallower, no DC. */
function pressureRecipe(sr, r) {
  const x = new Float32Array(Math.ceil(0.3 * sr)), f = 18 + 10 * r();
  const a = Math.round(sr / (2 * f)), b = a * 4;
  for (let i = 0; i < a; i++) x[i] = Math.sin((Math.PI * i) / a);
  for (let i = 0; i < b; i++) x[a + i] = -0.25 * Math.sin((Math.PI * i) / b);
  return tail(normalize(x, 0.95), sr, 0.02);
}

/**
 * The 21 cm shell bursting (48 kHz, laid over the heavy ground burst's body): a hard detonation crack, its hiss, steel
 * fragments whirring away, a heavier rain of earth and stones ticking on stones.
 */
function heroBurstRecipe(sr, r) {
  const len = 1.8, x = new Float32Array(Math.ceil(len * sr));
  blast(x, sr, 0, 1, 0.0045 + 0.001 * r(), 1.4, 0.00002);
  mixInto(x, layerF(sr, r, { dur: 0.06, attack: 0.0001, decay: 0.006, type: 'hp', f: 1500 }), 0, 0.7, sr);
  mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.00004, decay: 0.002, type: 'hp', f: 4500 }), 0, 0.4, sr);
  for (let i = 0, n = 12 + Math.floor(r() * 7); i < n; i++) { // fragments
    const t = 0.03 + 0.47 * Math.pow(r(), 0.7), f0 = 3000 + 3000 * r();
    mixInto(x, layerF(sr, r, { dur: 0.35, attack: 0.01, decay: 0.09, sweep: (tt) => f0 * Math.exp(-5 * tt) + 400 }), t, 0.05 + 0.07 * r(), sr);
  }
  for (let i = 0; i < 60; i++) { // earth raining back
    const t = 0.2 + Math.pow(r(), 0.8) * 1.4;
    mixInto(x, layerF(sr, r, { dur: 0.04, attack: 0.0004, decay: 0.01, type: 'bp', f: 300 + r() * 1500, q: 0.8 }), t, (0.04 + 0.06 * r()) * Math.exp(-t / 1.2), sr);
  }
  for (let i = 0; i < 22; i++) { // stones on stones
    const t = 0.25 + Math.pow(r(), 0.9) * 1.3;
    ring(x, sr, t, [[2000 + 3000 * r(), 0.05, 0.004 + 0.006 * r()]], r, Math.exp(-t / 1.1));
  }
  biquad(x, sr, 'hp', 30);
  return tail(saturate(normalize(x), 1.2), sr, 0.15);
}

// ---------------------------------------------------------------- the drill (foley_mlaf)

const FOLEY = {
  // the breech block's operating crank let go: the ratchet's pawl, the spring, the handle
  crank: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.35 * sr));
    for (let k = 0; k < 3; k++) ring(x, sr, 0.004 + k * (0.018 + 0.008 * r()), [[2400 * (0.95 + 0.1 * r()), 0.1, 0.012], [4100, 0.05, 0.008]], r, 1 - 0.25 * k);
    ring(x, sr, 0.01, [[1500 * (0.9 + 0.2 * r()), 0.05, 0.06]], r);
    thumpF(x, sr, 0.0, 300, 180, 0.01, 0.2, 0.03);
    tick(x, sr, r, 0.004, 0.25, 3000);
    return x;
  },
  // the horizontal sliding block in its guides: a heavy groan, the steel grinding with stick-slip, grit
  blockSlide: (sr, r) => {
    const dur = 1.4, x = new Float32Array(Math.ceil(dur * sr)), lift = 0.85 + 0.3 * r();
    mixInto(x, scrape(sr, r, { dur, f: (t) => (500 + 1500 * Math.sin(Math.min(1, t / dur) * Math.PI)) * lift, q: 1.6, rate: [30, 80], attack: 0.08, release: 0.15 }), 0, 0.6, sr);
    const g = envNoise(sr, r, dur, 0.06);
    sweepLp(g, sr, (t) => 150 + 250 * Math.sin(Math.min(1, t / dur) * Math.PI));
    for (let i = 0; i < g.length; i++) g[i] *= Math.min(1, (dur - i / sr) / 0.15);
    mixInto(x, normalize(g), 0, 0.5, sr);
    for (let i = 0; i < 14; i++) tick(x, sr, r, 0.05 + (dur - 0.15) * r(), 0.05 + 0.08 * r(), 1500 + 2500 * r(), 0.0015);
    ring(x, sr, 0.02, [[330 * lift, 0.08, 0.5], [870 * lift, 0.04, 0.3]], r); // the breech ring humming with it
    biquad(x, sr, 'hp', 60);
    return x;
  },
  // the block at its stop: a heavy clack with the ring's partials
  blockStop: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.6 * sr));
    thumpF(x, sr, 0, 140, 70, 0.03, 0.7, 0.12);
    ring(x, sr, 0, [[210, 0.5, 0.25], [560, 0.4, 0.18], [1250, 0.25, 0.09], [2650, 0.12, 0.05], [4100, 0.06, 0.03]], r);
    tick(x, sr, r, 0, 0.35, 2000, 0.003);
    return x;
  },
  // the block shut and locked: deeper than the stop, then the crank's latch dropping in
  blockLock: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.9 * sr));
    thumpF(x, sr, 0, 120, 55, 0.035, 0.85, 0.16);
    ring(x, sr, 0, [[175, 0.5, 0.35], [468, 0.4, 0.26], [1130, 0.22, 0.12], [2310, 0.1, 0.06], [3900, 0.05, 0.03]], r);
    tick(x, sr, r, 0, 0.3, 1600, 0.0025);
    ring(x, sr, 0.06, [[2900, 0.08, 0.01], [4600, 0.04, 0.006]], r); // the latch
    ring(x, sr, 0.06, [[760, 0.08, 0.05]], r);
    return x;
  },
  // the extractors flick the case out of the chamber
  extract: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.25 * sr));
    ring(x, sr, 0, [[2600 * (0.95 + 0.1 * r()), 0.1, 0.015], [3900, 0.06, 0.01]], r);
    mixInto(x, layerF(sr, r, { dur: 0.08, attack: 0.008, decay: 0.02, type: 'bp', f: 1200, q: 0.8 }), 0.004, 0.35, sr);
    ring(x, sr, 0.003, partials(380 + 70 * r(), CASE, 0.5, 0.25), r, 0.4); // the case set ringing as it leaves
    return x;
  },
  // the hot brass case on the steel deck: the big hollow ring, bounces, a roll, the grating rattling under it
  caseDrop: (sr, r) => {
    const x = new Float32Array(Math.ceil(1.4 * sr)), f0 = 300 + 150 * r();
    ring(x, sr, 0, partials(f0, CASE), r);
    thumpF(x, sr, 0, 160, 120, 0.05, 0.2, 0.25);
    tick(x, sr, r, 0, 0.2, 2200, 0.002);
    ring(x, sr, 0, GRATE, r, 0.35);
    for (let k = 0, t = 0, n = 2 + Math.floor(r() * 2); k < n; k++) { // the bounces, each weaker, the partials struck differently
      t += 0.07 + 0.07 * r();
      const w = 0.5 ** (k + 1);
      ring(x, sr, t, partials(f0, CASE.map(([m, a, d], i) => [m, a * (0.5 + r()) * (i ? 1.2 : 0.8), d * 0.6])), r, w);
      ring(x, sr, t, GRATE, r, 0.25 * w);
    }
    for (let i = 0; i < 26; i++) { // rolling to rest on the grating
      const t = 0.32 + 0.4 * r();
      ring(x, sr, t, [[f0 * (2.4 + 3 * r()), 0.03, 0.02]], r, 1 - (t - 0.32) / 0.45);
    }
    biquad(x, sr, 'hp', 80);
    return x;
  },
  // a breath of propellant gas from the open chamber
  breechBreath: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.7 * sr));
    mixInto(x, layerF(sr, r, { dur: 0.65, attack: 0.03, decay: 0.2, type: 'bp', f: 900, q: 0.5 }), 0, 0.6, sr);
    mixInto(x, layerF(sr, r, { dur: 0.4, attack: 0.02, decay: 0.12, type: 'bp', f: 2600, q: 0.7 }), 0.01, 0.2, sr);
    return x;
  },
  // the tray's lip seating in its slot on the breech ring
  trayOn: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.5 * sr));
    ring(x, sr, 0, TRAY.map(([f, a, d]) => [f * (0.95 + 0.1 * r()), a, d]), r);
    thumpF(x, sr, 0, 110, 60, 0.02, 0.4, 0.06);
    tick(x, sr, r, 0, 0.2, 2200, 0.0015);
    return x;
  },
  // lifted off: a short scrape and a lighter clank
  trayOff: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.45 * sr));
    mixInto(x, scrape(sr, r, { dur: 0.12, f: () => 1500, q: 1, rate: [60, 120], attack: 0.01, release: 0.04 }), 0, 0.25, sr);
    ring(x, sr, 0.09, TRAY.map(([f, a, d]) => [f * (0.95 + 0.1 * r()), a, d * 0.8]), r, 0.55);
    thumpF(x, sr, 0.09, 130, 70, 0.02, 0.25, 0.05);
    return x;
  },
  // 113 kg set down on the tray: a dull, heavy thunk, the tray's ring smothered by the weight, a short scrape
  shellSet: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.6 * sr));
    thumpF(x, sr, 0, 75, 40, 0.04, 0.9, 0.18);
    ring(x, sr, 0, TRAY.map(([f, a, d]) => [f * (0.95 + 0.1 * r()), a / 3, d / 3]), r);
    mixInto(x, scrape(sr, r, { dur: 0.15, f: () => 600, q: 1, rate: [40, 90], attack: 0.01, release: 0.05 }), 0.02, 0.3, sr);
    mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.0005, decay: 0.008, f: 1200 }), 0, 0.3, sr);
    return x;
  },
  // the shell lined up: a short low scrape
  shellNudge: (sr, r) => scrape(sr, r, { dur: 0.25, f: () => 380 + 80 * r(), q: 1.4, rate: [25, 60], attack: 0.03, release: 0.08 }),
  // the staff's head meets the shell's base: wood on steel
  staffKnock: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    ring(x, sr, 0, [[420 * (0.9 + 0.2 * r()), 0.4, 0.04], [1150, 0.2, 0.025], [2300, 0.1, 0.015]], r);
    mixInto(x, layerF(sr, r, { dur: 0.03, attack: 0.0003, decay: 0.004, f: 3000 }), 0, 0.4, sr);
    ring(x, sr, 0, [[780, 0.06, 0.12], [1840, 0.03, 0.06]], r); // the shell rings a little
    return x;
  },
  // the staff taken up off (or hung on) its iron hooks: wood knocking on iron, the hooks' rattle
  staffUp: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.35 * sr));
    ring(x, sr, 0, [[380 * (0.9 + 0.2 * r()), 0.3, 0.035], [1050, 0.15, 0.02]], r);
    ring(x, sr, 0.004, [[1900 + 900 * r(), 0.08, 0.02], [3300, 0.04, 0.012]], r);
    ring(x, sr, 0.09 + 0.05 * r(), [[420, 0.18, 0.03], [2100 + 600 * r(), 0.05, 0.015]], r); // the other hook
    return x;
  },
  // the staff withdrawn: a soft rasp along the bore and the knock as it comes clear
  staffOut: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.6 * sr));
    mixInto(x, scrape(sr, r, { dur: 0.4, f: () => 900, q: 0.8, rate: [20, 50], depth: 0.5, attack: 0.05, release: 0.1 }), 0, 0.3, sr);
    ring(x, sr, 0.42, [[420 * (0.9 + 0.2 * r()), 0.3, 0.04], [1150, 0.15, 0.025]], r);
    return x;
  },
  // the long shove up the tray into the chamber: the copper band dragging, rising, stopping
  shellSlide: (sr, r) => {
    const dur = 1.3, x = scrape(sr, r, { dur, f: (t) => 250 + 650 * Math.min(1, t / dur), q: 1.1, rate: [20, 55], attack: 0.1, release: 0.12, shape: (t) => 0.6 + 0.4 * Math.min(1, t / dur) });
    const lo = envNoise(sr, r, dur, 0.08);
    biquad(biquad(lo, sr, 'lp', 160), sr, 'hp', 40);
    for (let i = 0; i < lo.length; i++) lo[i] *= Math.min(1, (dur - i / sr) / 0.12);
    mixInto(x, normalize(lo), 0, 0.45, sr);
    ring(x, sr, 0.05, TRAY.map(([f, a, d]) => [f, a * 0.15, d * 2]), r);
    return x;
  },
  // the driving band biting into the forcing cone: the loudest moment of the drill
  bandSeat: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.9 * sr));
    thumpF(x, sr, 0, 95, 45, 0.03, 1, 0.15);
    tick(x, sr, r, 0, 0.45, 1800, 0.002);
    ring(x, sr, 0, [[780 * (0.95 + 0.1 * r()), 0.3, 0.15], [1840, 0.15, 0.08], [3200, 0.08, 0.05]], r); // the shell rings
    ring(x, sr, 0, [[110, 0.2, 0.4]], r); // and the barrel, low
    mixInto(x, layerF(sr, r, { dur: 0.12, attack: 0.002, decay: 0.03, type: 'bp', f: 700, q: 0.7 }), 0, 0.25, sr);
    return x;
  },
  // the brass case laid on the tray (hands on it: its ring smothered)
  caseSet: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.5 * sr));
    ring(x, sr, 0, partials(330 + 100 * r(), CASE, 0.5, 0.25), r);
    thumpF(x, sr, 0, 160, 90, 0.02, 0.4, 0.05);
    ring(x, sr, 0, TRAY.map(([f, a, d]) => [f, a / 4, d / 3]), r);
    return x;
  },
  // pushed in by the staff: brighter than the shell's slide, the case ringing faintly
  caseSlide: (sr, r) => {
    const x = scrape(sr, r, { dur: 0.4, f: (t) => 1200 + 1800 * Math.min(1, t / 0.4), q: 1.2, rate: [40, 100], attack: 0.03, release: 0.06 });
    ring(x, sr, 0.02, partials(360 + 60 * r(), CASE, 0.12, 0.35), r);
    return x;
  },
  // the rim against the breech face
  caseSeat: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.5 * sr));
    thumpF(x, sr, 0, 220, 120, 0.015, 0.6, 0.05);
    ring(x, sr, 0, [[380 * (0.95 + 0.1 * r()), 0.2, 0.3], [912, 0.1, 0.2]], r);
    tick(x, sr, r, 0, 0.15, 2500, 0.0015);
    return x;
  },
  // the firing mechanism cocked: two clicks and the spring
  cock: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    for (const t of [0, 0.07 + 0.01 * r()]) ring(x, sr, t, [[2200 + 2600 * r(), 0.1, 0.01 + 0.01 * r()], [4800, 0.04, 0.006]], r);
    ring(x, sr, 0.01, [[1500, 0.04, 0.05]], r);
    return x;
  },
  // the lanyard hooked to the firing lever
  lanyardHook: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.25 * sr));
    for (let k = 0, n = 3 + Math.floor(r() * 2); k < n; k++) ring(x, sr, 0.15 * r(), [[3000 + 3000 * r(), 0.05, 0.004 + 0.004 * r()]], r);
    return x;
  },
  // the lanyard pulled: the firing lever's snap a moment before the shot
  fireLever: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.2 * sr));
    ring(x, sr, 0, [[1900 * (0.9 + 0.2 * r()), 0.1, 0.02], [3400, 0.06, 0.01]], r);
    tick(x, sr, r, 0, 0.3, 2500, 0.0015);
    thumpF(x, sr, 0, 400, 250, 0.01, 0.15, 0.02);
    return x;
  },
  // the lay checked: a detent's small click on the sight's drum
  sightClick: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.1 * sr));
    ring(x, sr, 0, [[3200 * (0.95 + 0.1 * r()), 0.1, 0.006], [5100, 0.05, 0.004]], r);
    return x;
  },
  // a handwheel brought onto its mark: a heavier detent clack
  wheelMark: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.15 * sr));
    ring(x, sr, 0, [[2600 * (0.95 + 0.1 * r()), 0.12, 0.01], [4300, 0.06, 0.006], [900, 0.05, 0.03]], r);
    tick(x, sr, r, 0, 0.15, 2000, 0.0015);
    return x;
  },
  // a handwheel stopped: the gear's backlash taken up
  wheelStop: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.25 * sr));
    thumpF(x, sr, 0, 150, 90, 0.02, 0.3, 0.05);
    ring(x, sr, 0, [[700 * (0.9 + 0.2 * r()), 0.1, 0.05], [1750, 0.04, 0.03]], r);
    return x;
  },
  // boots on the walkway's steel grating: the heel's hit, the grating's ring, a gritty scuff, the plate's thud
  step_grate: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    mixInto(x, layerF(sr, r, { dur: 0.03, attack: 0.0003, decay: 0.004, f: 6000 }), 0, 0.5, sr);
    ring(x, sr, 0, GRATE.map(([f, a, d]) => [f * (0.9 + 0.2 * r()), a * (0.7 + 0.6 * r()), d]), r);
    mixInto(x, scrape(sr, r, { dur: 0.08, f: () => 2500, q: 0.8, rate: [80, 160], attack: 0.005, release: 0.03 }), 0.01, 0.12, sr);
    thumpF(x, sr, 0, 90 + 30 * r(), 60, 0.02, 0.35, 0.04);
    ring(x, sr, 0.03 + 0.03 * r(), GRATE.map(([f, a, d]) => [f * 1.1, a * 0.3, d]), r, 0.4); // the toe
    return x;
  },
  // boots on firm earth: a dull thud, a little grit
  step_earth: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.25 * sr));
    thumpF(x, sr, 0, 70 + 40 * r(), 45, 0.02, 0.7, 0.03);
    mixInto(x, layerF(sr, r, { dur: 0.06, attack: 0.001, decay: 0.012, f: 900 }), 0, 0.5, sr);
    for (let i = 0; i < 4; i++) tick(x, sr, r, 0.005 + 0.05 * r(), 0.05 * r(), 1500 + 2000 * r(), 0.001);
    mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.002, decay: 0.01, f: 700 }), 0.04 + 0.03 * r(), 0.25, sr); // the toe
    return x;
  },
  // boots in mud: the thud and a squelch falling in pitch
  step_mud: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    thumpF(x, sr, 0, 60 + 30 * r(), 40, 0.02, 0.6, 0.035);
    const sq = envNoise(sr, r, 0.12, 0.004, 0.03);
    sweepBp(sq, sr, (t) => 1200 * Math.exp(-t / 0.06) + 400, 4);
    mixInto(x, normalize(sq), 0.02 + 0.02 * r(), 0.5, sr);
    return x;
  },
  // boots in grass: a soft swish over a thud
  step_grass: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.25 * sr));
    thumpF(x, sr, 0, 70 + 30 * r(), 45, 0.02, 0.4, 0.03);
    mixInto(x, layerF(sr, r, { dur: 0.15, attack: 0.01, decay: 0.04, type: 'bp', f: 3500, q: 0.5 }), 0, 0.35, sr);
    return x;
  },
  // the kit on a man: tiny clinks of the buckles, the mess tin, the bayonet frog
  kit: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) ring(x, sr, 0.25 * r(), [[2000 + 3000 * r(), 0.05, 0.005 + 0.01 * r()]], r);
    return x;
  },
  // ---- the ammunition (render/crews_ammo.js; added last, so the drill's banks above keep their seeds)
  // the fuze's setting head turned a quarter turn onto its mark: the head's grip scraping on the ring, the detent's click
  fuzeTurn: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.32 * sr));
    mixInto(x, scrape(sr, r, { dur: 0.16, f: () => 3200 + 800 * r(), q: 1.5, rate: [90, 160], depth: 0.8, attack: 0.01, release: 0.03 }), 0, 0.18, sr);
    ring(x, sr, 0.17, [[4200 * (0.95 + 0.1 * r()), 0.12, 0.006], [6600, 0.06, 0.004], [1900, 0.04, 0.012]], r);
    tick(x, sr, r, 0.17, 0.3, 3500, 0.0008);
    return x;
  },
  // the head tried against its detent and left on o.V.: a small tick
  fuzeCheck: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.08 * sr));
    ring(x, sr, 0.002, [[4600 * (0.95 + 0.1 * r()), 0.06, 0.004], [2400, 0.03, 0.006]], r);
    tick(x, sr, r, 0.002, 0.15, 4000, 0.0006);
    return x;
  },
  // the charge container's clamp lever swung off its catch (or onto it): a sprung steel snap
  canLatch: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.25 * sr));
    ring(x, sr, 0, [[1650 * (0.9 + 0.2 * r()), 0.12, 0.03], [3900, 0.06, 0.012], [740, 0.05, 0.05]], r);
    tick(x, sr, r, 0, 0.3, 2500, 0.001);
    thumpF(x, sr, 0, 260, 160, 0.01, 0.15, 0.02);
    return x;
  },
  // the pressed lid swung up off its rubber seal: the seal letting go, the thin sheet booming, the hinge
  canLid: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.45 * sr)), f0 = 210 + 40 * r();
    mixInto(x, layerF(sr, r, { dur: 0.06, attack: 0.002, decay: 0.012, type: 'bp', f: 500, q: 0.8 }), 0, 0.25, sr); // the seal
    ring(x, sr, 0.03, [[f0, 0.25, 0.22], [f0 * 2.3, 0.15, 0.14], [f0 * 4.1, 0.08, 0.08], [f0 * 6.7, 0.04, 0.05]], r);
    mixInto(x, scrape(sr, r, { dur: 0.18, f: () => 1400 + 600 * r(), q: 2, rate: [40, 80], depth: 0.8, attack: 0.02, release: 0.05 }), 0.06, 0.1, sr); // the hinge
    return x;
  },
  // the lid brought down onto the seal: a hollow clang of the empty container, damped by the rubber
  canShut: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.55 * sr)), f0 = 180 + 40 * r();
    thumpF(x, sr, 0, 140, 90, 0.02, 0.5, 0.06);
    ring(x, sr, 0, [[f0, 0.35, 0.3], [f0 * 2.2, 0.22, 0.2], [f0 * 3.9, 0.12, 0.1], [f0 * 6.1, 0.06, 0.06]], r);
    tick(x, sr, r, 0, 0.2, 1800, 0.0015);
    return x;
  },
  // the brass case drawn up out of its sheet-steel container: brass rubbing the rim, the case ringing faintly as it comes free
  caseDraw: (sr, r) => {
    const dur = 0.5, x = scrape(sr, r, { dur, f: (t) => 900 + 1400 * (t / dur), q: 1.3, rate: [30, 70], depth: 0.6, attack: 0.04, release: 0.08 });
    ring(x, sr, dur - 0.08, partials(360 + 60 * r(), CASE, 0.2, 0.3), r);
    return x;
  },
  // the case stood on its head on the planks: a dull knock of brass and wood, a short ring
  caseGround: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.4 * sr));
    thumpF(x, sr, 0, 190, 110, 0.015, 0.6, 0.05);
    ring(x, sr, 0, partials(330 + 80 * r(), CASE, 0.35, 0.2), r);
    tick(x, sr, r, 0, 0.15, 1500, 0.0015);
    return x;
  },
  // the leatherboard cup pulled out of the mouth (or pressed back): a dry squeak of board on brass and a soft pop
  cupPull: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    mixInto(x, scrape(sr, r, { dur: 0.14, f: () => 1100 + 500 * r(), q: 2.2, rate: [60, 120], depth: 0.8, attack: 0.01, release: 0.04 }), 0, 0.4, sr);
    mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.001, decay: 0.01, type: 'bp', f: 700, q: 0.9 }), 0.13, 0.35, sr);
    return x;
  },
  // a silk bag of propellant drawn out by its loop: the cloth's rustle, the sticks inside shifting
  bagOut: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.45 * sr));
    const rs = envNoise(sr, r, 0.4, 0.04, 0.12);
    biquad(biquad(rs, sr, 'bp', 3800, 0.6), sr, 'hp', 1200);
    mixInto(x, normalize(rs), 0, 0.5, sr);
    for (let i = 0; i < 6; i++) tick(x, sr, r, 0.03 + 0.3 * r(), 0.04 + 0.05 * r(), 1500 + 1500 * r(), 0.002); // (the sticks)
    return x;
  },
  // the bag laid on the lid: a soft cloth thump on sheet steel
  bagDown: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    thumpF(x, sr, 0, 160, 90, 0.015, 0.5, 0.04);
    mixInto(x, layerF(sr, r, { dur: 0.12, attack: 0.003, decay: 0.03, type: 'bp', f: 2600, q: 0.6 }), 0, 0.25, sr);
    ring(x, sr, 0, [[230 * (0.9 + 0.2 * r()), 0.05, 0.08], [540, 0.03, 0.05]], r); // (the lid under it)
    return x;
  },
  // the case taken up against his chest: brass against the tunic's buttons, a muffled ring
  caseArms: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.3 * sr));
    ring(x, sr, 0, partials(350 + 60 * r(), CASE, 0.15, 0.15), r);
    mixInto(x, layerF(sr, r, { dur: 0.08, attack: 0.004, decay: 0.02, type: 'bp', f: 900, q: 0.7 }), 0, 0.3, sr);
    return x;
  },
  // a spent case stood in the row of empties: on the earth, its rim touching the next one's (brass on brass)
  caseRow: (sr, r) => {
    const x = new Float32Array(Math.ceil(0.5 * sr));
    thumpF(x, sr, 0, 120, 70, 0.02, 0.45, 0.05);
    mixInto(x, layerF(sr, r, { dur: 0.05, attack: 0.001, decay: 0.012, f: 900 }), 0, 0.25, sr);
    ring(x, sr, 0.035 + 0.02 * r(), partials(380 + 90 * r(), CASE, 0.45, 0.35), r);
    ring(x, sr, 0.04 + 0.02 * r(), [[3100 + 900 * r(), 0.06, 0.01]], r);
    return x;
  },
};
// bank sample rates: the clicks and rings bright (48 kHz), the slides and scrapes 32 kHz; variants per sound
const FOLEY_SR = { blockSlide: 32, breechBreath: 32, shellNudge: 32, staffOut: 32, shellSlide: 32, caseSlide: 32, caseDraw: 32, cupPull: 32, bagOut: 32 };
const FOLEY_N = { step_grate: 8, step_earth: 8, step_mud: 6, step_grass: 6, kit: 4, caseDrop: 4, blockSlide: 4, bandSeat: 4, crank: 4,
  fuzeCheck: 2, canLid: 2, canShut: 2, caseDraw: 2, cupPull: 2, caseArms: 2, caseGround: 2, bagOut: 3, bagDown: 3, caseRow: 2, canLatch: 2 };

// ---------------------------------------------------------------- the gears' loops

/** The elevating gear turning (2 s, seamless): tooth clicks at a whole number per loop, the pinion's whir, a low drone. */
function elevLoop(sr, r) {
  const T = 2, n = Math.round(T * sr), x = new Float32Array(n), f = snap(28, T), k = Math.round(f * T);
  const clicks = [0, 1, 2, 3].map(() => {
    const c = new Float32Array(Math.ceil(0.02 * sr));
    ring(c, sr, 0, [[1100 + 1400 * r(), 0.1, 0.004 + 0.003 * r()], [2600 + 1200 * r(), 0.05, 0.003]], r);
    return c;
  });
  for (let i = 0; i < k; i++) wrapInto(x, clicks[i & 3], i / f + 0.002 * (r() - 0.5), 0.6 + 0.4 * r(), sr);
  const whir = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'bp', 650, 0.8), sr, 'hp', 300));
  for (let i = 0; i < n; i++) x[i] += whir[i] * 0.35 * (0.7 + 0.3 * Math.sin((TAU * f * i) / sr));
  addTone(x, sr, 145, 0.12, T);
  addTone(x, sr, 290, 0.05, T, 1.1);
  biquad(x, sr, 'hp', 60);
  return normalize(x);
}

/** The carriage swinging on its platform (4 s, seamless): rollers rumbling on the racer, bumps, a rare squeal, the gear's whir. */
function travLoop(sr, r) {
  const T = 4, n = Math.round(T * sr), x = new Float32Array(n);
  const rum = loopNoise(sr, r, n, (b) => biquad(biquad(b, sr, 'lp', 200), sr, 'hp', 50));
  const bump = snap(1.5, T);
  for (let i = 0; i < n; i++) x[i] = rum[i] * (0.6 + 0.4 * Math.max(0, Math.sin((TAU * bump * i) / sr)) ** 3);
  for (let k = 0; k < 2; k++) { // a roller squealing a moment
    const t0 = r() * T, len = 0.3 + 0.3 * r(), f0 = 1800 + 800 * r(), s = new Float32Array(Math.ceil(len * sr));
    let ph = 0;
    for (let i = 0; i < s.length; i++) {
      const t = i / sr;
      ph += (TAU * f0 * (1 + 0.03 * Math.sin(TAU * 6 * t))) / sr;
      s[i] = Math.sin(ph) * Math.sin((Math.PI * i) / s.length) ** 2;
    }
    wrapInto(x, s, t0, 0.06, sr);
  }
  const whir = loopNoise(sr, r, n, (b) => biquad(b, sr, 'bp', 520, 1));
  for (let i = 0; i < n; i++) x[i] += whir[i] * 0.25;
  for (let i = 0; i < 30; i++) wrapInto(x, layerF(sr, r, { dur: 0.03, attack: 0.0005, decay: 0.006, type: 'bp', f: 800 + 1200 * r(), q: 0.8 }), r() * T, 0.06 * r(), sr); // grit under the castor
  return normalize(x);
}

// ---------------------------------------------------------------- tasks

/**
 * The hero kinds' synthesized banks as bankTasks-style tasks [group, key, fn] (fn returns the takes, each through
 * `make(channels, sampleRate)`), with seeds of their own: the report's layers (the body a synthesized stand-in until the
 * recordings come, heroRecordingTasks), the burst's layer, the drill and the steps, the gears' loops.
 */
export function heroTasks(SR, make, kinds = []) {
  const tasks = [];
  const hi = Math.min(SR, 48000), mid = Math.min(SR, 32000), lo = Math.min(SR, 24000), dark = Math.min(SR, 16000);
  const set = (n, seed, fn) => () => Array.from({ length: n }, (_, i) => fn(mulberry(seed + i * 7919)));
  const mono = (sr, gain = 0.95) => (x) => make([tail(normalize(x, gain), sr, 0.01)], sr);
  for (const [ki, kind] of kinds.filter((k) => HERO[k]).entries()) {
    const H = HERO[kind], g = H.group, s0 = 8100 + ki * 1000;
    tasks.push(
      [g, 'crack', set(8, s0 + 1, (r) => make([crackRecipe(hi, r)], hi))],
      [g, 'bow', set(4, s0 + 3, (r) => make([bowRecipe(hi, r)], hi))],
      [g, 'body', set(3, s0 + 5, (r) => make([bodySynth(mid, r)], mid))], // (a stand-in: the recordings' body takes its place)
      [g, 'tail', () => { const src = bodySynth(dark, mulberry(s0 + 9)); return Array.from({ length: 4 }, (_, i) => make([tailRecipe(dark, mulberry(s0 + 7 + i * 7919), src)], dark)); }],
      [g, 'mech', set(4, s0 + 11, (r) => make([mechRecipe(hi, r)], hi))],
      [g, 'runout', set(3, s0 + 13, (r) => make([runoutRecipe(lo, r, H.runA, H.runB)], lo))],
      [g, 'runHome', set(3, s0 + 15, (r) => make([tail(normalize(runHomeRecipe(hi, r), 0.95), hi, 0.01)], hi))],
      [g, 'carHome', set(3, s0 + 16, (r) => make([tail(normalize(carHomeRecipe(hi, r), 0.95), hi, 0.01)], hi))],
      [g, 'pressure', set(2, s0 + 17, (r) => make([pressureRecipe(8000, r)], 8000))],
      [g, 'burst', set(4, s0 + 19, (r) => make([heroBurstRecipe(hi, r)], hi))]
    );
    if (tasks.some((t) => t[0] === H.foley)) continue; // (a foley group shared by two kinds is built once)
    let seed = s0 + 101;
    for (const [key, fn] of Object.entries(FOLEY)) {
      const sr = FOLEY_SR[key] ? Math.min(SR, FOLEY_SR[key] * 1000) : hi;
      tasks.push([H.foley, key, set(FOLEY_N[key] ?? 3, (seed += 2), (r) => mono(sr)(fn(sr, r)))]);
    }
    tasks.push(['loop', 'mlaf_elev', set(1, s0 + 301, (r) => make([elevLoop(lo, r)], lo))], ['loop', 'mlaf_trav', set(1, s0 + 303, (r) => make([travLoop(lo, r)], lo))]);
  }
  return tasks;
}

/**
 * The hero banks built from the recordings, as recordingTasks' [group, key, fn, over] (over: true, taking the stand-ins'
 * places): the body from the recorded layers and the tail's echoes made of it. `roles()` gives the recordings' cut slices
 * by role at 32 kHz (src/audio.js gunRoles); a kind is left synthesized when a role is missing.
 */
export function heroRecordingTasks(SR, make, roles, kinds = [], have = null) {
  const tasks = [];
  const mid = Math.min(SR, 32000), lo = Math.min(SR, 16000);
  if (have && !['boom', 'snap', 'body'].every((k) => have.has(k))) return tasks;
  for (const [ki, kind] of kinds.filter((k) => HERO[k]).entries()) {
    const g = HERO[kind].group, s0 = 8600 + ki * 1000;
    let takes = null;
    const bodies = () => (takes ||= Array.from({ length: 6 }, (_, k) => bodyRecorded(mid, mulberry(s0 + k * 7919), roles(), k)));
    tasks.push(
      [g, 'body', () => bodies().map((x) => make([Float32Array.from(x)], mid)), true],
      [g, 'tail', () => Array.from({ length: 4 }, (_, k) => {
        const r = mulberry(s0 + 50 + k * 7919), b = bodies()[k], step = mid / lo, o = new Float32Array(Math.floor(b.length / step));
        for (let i = 0; i < o.length; i++) o[i] = b[Math.round(i * step)] ?? 0; // (the echoes are darkened to 500 Hz: a 3 kHz filter before taking every other sample is enough)
        return make([tailRecipe(lo, r, onePole(onePole(o, lo, 3000), lo, 3000))], lo);
      }), true]
    );
  }
  return tasks;
}

// ---------------------------------------------------------------- the drill's cues

/**
 * The drill's sounds on the crew's clocks, per kind: `s` the foley sound (of the kind's foley group, or `group`); `cue`
 * a named moment of render/herocues.js HERO_CUES[kind] and `dt` seconds after it, else (the name not there) `fb`, the
 * same form: [step, k, dt] fraction k of a loading step on the cycle clock (crew.tl), ['shot', s, dt] s seconds from the
 * shot (crew.shotT), ['tf', s, dt] s seconds after it; `at` the place on the rig (render/foley.js: breech, tray, case,
 * lever, hooks, elev, trav, sight); `g` the gain; `fit` [cue, fb] the moment it must be over by (a slide cut with a fade
 * there); `rate`; `case` only in a cycle with a spent case to throw (herocues.js caseDue); `loud` on the blasts' bus
 * (the shot's slap ducks the working sounds).
 */
export const FOLEY_CUES = {
  mrs18: [
    { s: 'crank', cue: 'blockOpen', fb: ['open', 0.0], at: 'breech', g: 0.75 },
    { s: 'blockSlide', cue: 'blockOpen', dt: 0.05, fb: ['open', 0.03], at: 'breech', g: 0.75, fit: ['blockOpened', ['open', 0.7]] },
    { s: 'extract', cue: 'caseOut', fb: ['open', 0.66], at: 'breech', g: 0.6, case: true },
    { s: 'breechBreath', cue: 'caseOut', dt: 0.04, fb: ['open', 0.68], at: 'breech', g: 0.35, case: true },
    { s: 'blockStop', cue: 'blockOpened', fb: ['open', 0.7], at: 'breech', g: 0.8 },
    { s: 'caseDrop', cue: 'caseLand', fb: ['open', 0.9], at: 'case', g: 0.9, case: true },
    { s: 'trayOn', cue: 'trayOn', fb: ['open', 0.98], at: 'tray', g: 0.7 },
    { s: 'shellSet', cue: 'shellSet', fb: ['shell', 0.91], at: 'tray', g: 0.9 },
    { s: 'shellNudge', cue: 'shellSet', dt: 0.12, fb: ['shell', 0.93], at: 'tray', g: 0.45, fit: ['shellSlid', ['shell', 0.98]] },
    { s: 'staffUp', cue: 'staffUp', fb: ['ram', 0.02], at: 'hooks', g: 0.5 },
    { s: 'staffKnock', cue: 'ram', fb: ['ram', 0.18], at: 'tray', g: 0.55 },
    { s: 'shellSlide', cue: 'ram', dt: 0.02, fb: ['ram', 0.19], at: 'tray', g: 0.75, fit: ['shellSeat', ['ram', 0.6]] },
    { s: 'bandSeat', cue: 'shellSeat', fb: ['ram', 0.6], at: 'breech', g: 1 },
    { s: 'staffOut', cue: 'staffOut', dt: -0.42, fb: ['ram', 0.95, -0.42], at: 'tray', g: 0.45 },
    { s: 'staffUp', cue: 'staffHung', fb: ['cartridge', 0.12], at: 'hooks', g: 0.4, rate: 0.92 },
    { s: 'caseSet', cue: 'chargeIn', dt: -0.12, fb: ['cartridge', 0.52], at: 'tray', g: 0.4 },
    { s: 'caseSlide', cue: 'chargeIn', fb: ['cartridge', 0.55], at: 'breech', g: 0.5, fit: ['chargeSeat', ['cartridge', 0.69]] },
    { s: 'caseSeat', cue: 'chargeSeat', fb: ['cartridge', 0.69], at: 'breech', g: 0.7 },
    { s: 'trayOff', cue: 'trayOff', fb: ['close', 0.05], at: 'tray', g: 0.6 },
    { s: 'blockSlide', cue: 'blockClose', fb: ['close', 0.4], at: 'breech', g: 0.7, rate: 0.94, fit: ['blockLocked', ['close', 0.99]] },
    { s: 'blockLock', cue: 'blockLocked', fb: ['close', 0.99], at: 'breech', g: 0.85 },
    { s: 'cock', fb: ['prime', 0.25], at: 'lever', g: 0.5 },
    { s: 'lanyardHook', cue: 'lanyardHook', fb: ['prime', 0.55], at: 'lever', g: 0.45 },
    { s: 'sightClick', fb: ['lay', 0.98], at: 'sight', g: 0.4 },
    { s: 'lanyardHook', cue: 'lanyardTaut', fb: ['shot', -0.55], at: 'lever', g: 0.3, rate: 0.8 },
    { s: 'fireLever', cue: 'lanyardPull', dt: 0.1, fb: ['shot', -0.05], at: 'lever', g: 0.6 },
    { s: 'runout', group: 'hero_mrs18', fb: ['tf', 0.45], at: 'breech', g: 0.8, loud: true },
    { s: 'runHome', group: 'hero_mrs18', cue: 'runOutHome', fb: ['tf', 2.05], at: 'breech', g: 0.75, loud: true },
    { s: 'carHome', group: 'hero_mrs18', cue: 'carriageHome', fb: ['tf', 3.35], at: 'trav', g: 0.85, loud: true },
    // the ammunition (render/crews_ammo.js: moments of the crew's own schedule, herocues.js ['crew', name])
    { s: 'fuzeTurn', cue: 'fuzeSet', fb: ['crew', 'fuzeTurn'], at: 'fuze', g: 0.45 },
    { s: 'fuzeCheck', cue: 'fuzeCheck', fb: ['crew', 'fuzeCheck'], at: 'fuze', g: 0.3 },
    { s: 'canLatch', cue: 'lidOpen', fb: ['crew', 'lidOpen'], at: 'can', g: 0.45 },
    { s: 'canLid', cue: 'lidUp', fb: ['crew', 'lidUp'], at: 'can', g: 0.45 },
    { s: 'caseDraw', cue: 'caseLift', fb: ['crew', 'caseLift'], at: 'charge', g: 0.4 },
    { s: 'caseGround', cue: 'caseDown', fb: ['crew', 'caseDown'], at: 'charge', g: 0.5 },
    { s: 'cupPull', cue: 'cupOut', fb: ['crew', 'cupOut'], at: 'charge', g: 0.35 },
    ...[1, 2, 3, 4, 5].flatMap((j) => [
      { s: 'bagOut', cue: 'bagOut' + j, fb: ['crew', 'bagOut' + j], at: 'charge', g: 0.3 },
      { s: 'bagDown', cue: 'bagDown' + j, fb: ['crew', 'bagDown' + j], at: 'spare', g: 0.35 },
    ]),
    { s: 'cupPull', cue: 'cupIn', fb: ['crew', 'cupIn'], at: 'charge', g: 0.3, rate: 0.85 },
    { s: 'caseArms', cue: 'chargeUp', fb: ['crew', 'chargeUp'], at: 'charge', g: 0.4 },
    { s: 'bagOut', cue: 'surplusUp', fb: ['crew', 'surplusUp'], at: 'spare', g: 0.35, rate: 0.9 },
    { s: 'bagDown', cue: 'surplusIn', fb: ['crew', 'surplusIn'], at: 'can', g: 0.4, rate: 0.8 },
    { s: 'canShut', cue: 'lidShut', fb: ['crew', 'lidShut'], at: 'can', g: 0.55 },
    { s: 'canLatch', cue: 'latchOn', fb: ['crew', 'latchOn'], at: 'can', g: 0.45, rate: 0.92 },
    { s: 'caseRow', cue: 'caseStand', fb: ['crew', 'caseStand'], at: 'row', g: 0.6 },
  ],
};

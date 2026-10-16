// The 42 cm M-Gerät's shells on the game's own integrator (sim/shells.js): the same drag-and-gravity step
// the British guns fly, with game constants. Two shells, as the real gun had: the schwere Granate (810 kg)
// and the leichte Granate (400 kg) that reached further. Charges are the number of Vorkartuschen (bags)
// pushed in ahead of the brass Hauptkartusche. Arcade values: ranges are stretched so the whole British
// gun line (9.7 to 13.5 km from the bed) can be reached; the real gun managed 9.3 and 12.5 km.
// Angles in radians, lengths in metres, Node-safe.
import { stepBallistic, flyPlane, heightAtDistance } from '../sim/shells.js';
import { STEP } from '../sim/tables.js';
import { DEG } from '../sector.js';

export { stepBallistic, STEP };

// Strich: the German artillery mil, 6400 to the circle
export const STRICH = (2 * Math.PI) / 6400;
export const toStrich = (rad) => Math.round(rad / STRICH);

const R = 0.21; // bore radius (m)
const CD = 0.25;
export const SHELLS = {
  schwer: { name: 'schwere Granate', en: 'heavy shell', mass: 810, v: [300, 330, 360, 390], model: 'm42', len: 1.65 },
  leicht: { name: 'leichte Granate', en: 'light shell', mass: 400, v: [400, 440, 480, 520], model: 'm42l', len: 1.3 },
};
for (const s of Object.values(SHELLS)) s.k = (0.5 * 1.2 * CD * Math.PI * R * R) / s.mass;
export const FUZES = {
  oV: { name: 'Aufschlagzünder o.V.', short: 'o.V.', en: 'instant (graze)', enShort: 'instant' },
  mV: { name: 'Aufschlagzünder m.V.', short: 'm.V.', en: 'delay (penetrating)', enShort: 'delay' },
};
export const MAX_BAGS = 4;

// The gun itself, in game numbers. Elevations are bore angles; traverse is the carriage's swing on its
// bed relative to the base line (+ = left). The barrel loads at loadEl (the tray only lines up with the
// bore there). Rates are degrees per second of crank.
export const GUN = {
  calibre: 16.5, // inches, for blast, sound and shake
  loadEl: 2 * DEG, elMin: 0, elMax: 65 * DEG, trMax: 11.5 * DEG,
  elRate: 2.2 * DEG, trRate: 0.9 * DEG, fine: 0.12, // Shift: the fine wheel
  trunnion: 2.45, // height of the trunnion axis over the bed (m)
  muzzle: 3.95, // muzzle ahead of the trunnion axis along the bore
  pivotZ: 0, // the carriage turns about the axle, at the model origin
  disp: { v: 0.0022, el: 0.0005, tr: 0.0005 },
};

const _tables = new Map();
// { rMax, elOpt } of a shell at a charge (1..4)
export function table(shell, charge) {
  const key = shell + charge;
  let t = _tables.get(key);
  if (t) return t;
  const s = SHELLS[shell], v = s.v[Math.max(0, Math.min(3, charge - 1))];
  let rMax = 0, elOpt = 45 * DEG;
  for (let el = 20 * DEG; el <= 60 * DEG; el += 0.25 * DEG) {
    const f = flyPlane(v, el, s.k);
    if (f.range > rMax) {
      rMax = f.range;
      elOpt = el;
    }
  }
  t = { rMax, elOpt, v };
  _tables.set(key, t);
  return t;
}

// muzzle velocity for a shell and a number of bags (no bags: the Hauptkartusche alone, a weak shot)
export const muzzleV = (shell, bags) => (bags > 0 ? SHELLS[shell].v[Math.min(MAX_BAGS, bags) - 1] : SHELLS[shell].v[0] * 0.78);

// Low-angle elevation for horizontal distance D and target height dh over the muzzle, by bisection on the
// integrator; null when out of reach. Also the time of flight.
export function solve(shell, charge, D, dh = 0) {
  const s = SHELLS[shell], tb = table(shell, charge), v = tb.v;
  let lo = 3 * DEG, hi = tb.elOpt;
  if (heightAtDistance(v, lo, s.k, D).y - dh > 0) return null;
  if (heightAtDistance(v, hi, s.k, D).y - dh < 0) return null;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (heightAtDistance(v, mid, s.k, D).y - dh < 0) lo = mid;
    else hi = mid;
  }
  const el = (lo + hi) / 2;
  return { el, tof: heightAtDistance(v, el, s.k, D).t };
}

// What the Feuerleitung orders for a range: the heavy shell when it reaches, else the light one, on the
// lowest charge that reaches with a margin (plunging fire at 35 to 45 degrees)
export function choose(D) {
  for (const shell of ['schwer', 'leicht']) {
    for (let c = 1; c <= MAX_BAGS; c++) if (D < table(shell, c).rMax * 0.93) return { shell, charge: c };
  }
  return D < table('leicht', MAX_BAGS).rMax * 0.995 ? { shell: 'leicht', charge: MAX_BAGS } : null;
}

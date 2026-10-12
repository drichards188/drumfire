// Formatting and small helpers shared by the cards. Everything the player sees is in yards, degrees and
// minutes of arc, map references and the 24-hour clock; the sim speaks metres and radians.
import { YARD, DEG, gridRef, SECTORS, LINES, lineX } from '../../sector.js';

export const toYd = (m) => m / YARD;
export const fromYd = (y) => y * YARD;
export const commas = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const yd = (m) => commas(toYd(m));

// radians -> "094°12′" (degrees and minutes, the way a line is laid on the dial sight)
export function dm(rad, w = 3) {
  let a = ((rad / DEG) % 360 + 360) % 360;
  let d = Math.floor(a), m = Math.round((a - d) * 60);
  if (m === 60) { m = 0; d = (d + 1) % 360; }
  return `${String(d).padStart(w, '0')}°${String(m).padStart(2, '0')}′`;
}
// elevation: "23°41′"
export const elev = (rad) => dm(rad, 1);

export function clockStr(h) {
  if (h == null || !isFinite(h)) return '--:--';
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`;
}
export const mmss = (s) => {
  if (s == null || !isFinite(s)) return '--';
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const ref = (x, z) => gridRef(x, z);

export const MISSION_NAME = {
  cb: 'COUNTER-BATTERY', destroy: 'DESTROY', wire: 'WIRE CUTTING', sos: 'S.O.S.', harass: 'HARASSING FIRE', barrage: 'BARRAGE',
};
export const OBSERVER = { foo: 'F.O.O.', air: 'R.F.C. aeroplane', balloon: 'Kite balloon', sound: 'Sound ranging', map: 'Map shoot' };
export const FUZE = {
  instant: { main: '106', sub: 'instantaneous' },
  delay: { main: 'DELAY', sub: 'penetrate' },
  shrapnel: { main: 'SHRAPNEL', sub: 'time fuze' },
};
export const KIND_SHORT = { bl15: '15-in', bl92: '9.2-in', bl6: '6-in', bl60: '60-pr', rail: '12-in Rly' };

// Per-kind touches: how the console differs. `rounds` are the series lengths offered per piece.
export const KINDS = {
  bl15: { title: '15-INCH HOWITZER', note: 'One piece, a very slow cycle: lay carefully, 1,400 lb shells', rounds: [1, 2, 3], fuzes: ['instant', 'delay'], charges: 3, loadSteps: true },
  bl92: { title: '9.2-INCH HOWITZERS', note: 'Section of two, 290 lb shells', rounds: [1, 2, 4, 6], fuzes: ['instant', 'delay'], charges: 3 },
  bl6: { title: '6-INCH 26 CWT HOWITZERS', note: 'Battery of four: ripple fire for effect', rounds: [1, 2, 4, 6, 8], fuzes: ['instant', 'delay'], charges: 3 },
  bl60: { title: '60-POUNDERS', note: 'Long flat trajectory: shrapnel bursts over wire and infantry', rounds: [1, 2, 4, 8], fuzes: ['instant', 'delay', 'shrapnel'], charges: 2 },
  rail: { title: 'RAILWAY GUN', note: 'Deep targets: railhead, headquarters, distant batteries', rounds: [1, 2, 3], fuzes: ['instant', 'delay'], charges: 3, deep: true },
};

// loading steps in the order the crew performs them (labels are the drill words)
export const STEPS = [
  { k: 'shell', t: 'SHELL' }, { k: 'ram', t: 'RAM' }, { k: 'cartridge', t: 'CHARGE' },
  { k: 'close', t: 'CLOSE' }, { k: 'prime', t: 'PRIME' }, { k: 'lay', t: 'LAY' }, { k: 'ready', t: 'READY' },
];
export function stepIndex(p) {
  if (!p || p.state === 'dead') return -1;
  if (p.state === 'ready') return 6;
  if (p.state === 'recoil') return -1;
  const s = p.job && p.job.step;
  if (!s) return p.loaded ? 4 : -1;
  if (s === 'depress' || s === 'open') return -1;
  const i = STEPS.findIndex((x) => x.k === s);
  return i;
}

export function sectorAt(z) {
  for (const s of SECTORS) if (z >= s.from && z < s.to) return s;
  return z < SECTORS[0].from ? SECTORS[0] : SECTORS[SECTORS.length - 1];
}
export const SOS_X = (z) => lineX(LINES.britishFront, z) + 120;

// open missions in the order the Tab key walks them: priority first, then the nearest deadline
export function liveMissions(sim) {
  return (sim.missions || []).filter((m) => m.state === 'open' || m.state === 'ranging' || m.state === 'ffe')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.deadline || 1e9) - (b.deadline || 1e9));
}

export const ammoTotal = (u) => (u.ammo ? (u.ammo.he || 0) + (u.ammo.shrapnel || 0) : 0);

// How many charges the unit offers. Asked of the sim when it says so, else the range table is probed.
const probed = {};
export function chargeCount(sim, u, cfg) {
  if (typeof u.charges === 'number') return u.charges;
  if (probed[u.kind] != null) return probed[u.kind];
  let n = 0;
  try {
    while (n < 8) {
      const t = sim.rangeTable && sim.rangeTable(u.kind, n);
      if (!t || !t.length) break;
      n++;
    }
  } catch (e) { n = 0; }
  n = n || cfg.charges;
  probed[u.kind] = n;
  return n;
}

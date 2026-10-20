// Formatting and small helpers shared by the cards. Everything the player sees is in yards, degrees and
// minutes of arc, map references and the 24-hour clock; the sim speaks metres and radians.
import { DEG } from '../../sector.js';
import { TH, lenU, strich } from '../theatre.js';

// the console's length unit: yards in the British game, metres in the WW2 mode (ui/theatre.js)
export const toYd = (m) => m / lenU();
export const fromYd = (y) => y * lenU();
export const commas = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const yd = (m) => commas(toYd(m));

// radians -> "094°12′" (degrees and minutes, the way a line is laid on the dial sight)
export function dm(rad, w = 3) {
  if (TH.metric) return strich(rad, 4);
  let a = ((rad / DEG) % 360 + 360) % 360;
  let d = Math.floor(a), m = Math.round((a - d) * 60);
  if (m === 60) { m = 0; d = (d + 1) % 360; }
  return `${String(d).padStart(w, '0')}°${String(m).padStart(2, '0')}′`;
}
// elevation: "23°41′"
export const elev = (rad) => (TH.metric ? `${Math.round(rad / (2 * Math.PI / 6400))}` : dm(rad, 1));

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

export const ref = (x, z) => TH.ref(x, z);
// a task as the pad and the status line name it: 'M3' (the sim's ids are 'm3', the mock's plain numbers)
export const taskNo = (id) => `M${String(id).replace(/^m/i, '')}`;

export const MISSION_NAME = {
  cb: 'COUNTER-BATTERY', destroy: 'DESTROY', wire: 'WIRE CUTTING', sos: 'S.O.S.', harass: 'HARASSING FIRE', barrage: 'BARRAGE',
};
export const OBSERVER = { foo: 'F.O.O.', air: 'R.F.C. aeroplane', balloon: 'Kite balloon', sound: 'Sound ranging', map: 'Map shoot', railspot: 'Rail spotters' };
export const FUZE = {
  instant: { main: '106', sub: 'instantaneous' },
  delay: { main: 'DELAY', sub: 'penetrate' },
  shrapnel: { main: 'SHRAPNEL', sub: 'time fuze' },
};
export const KIND_SHORT = {
  bl15: '15-in', bl92: '9.2-in', bl6: '6-in', bl60: '60-pr', rail: '18-in Rly',
  lefh18: '10.5 cm', sfh18: '15 cm sFH', k18: '17 cm', mrs18: '21 cm', nbw41: '15 cm NbW',
  gustav: '80 cm', bertha: '42 cm', karl: '60 cm', v1: 'V-1', v2: 'V-2',
};

// Per-kind touches: how the console differs. `rounds` are the series lengths offered per piece, `pieces` how many guns
// the unit has (more than one: the guns selector on the order card).
export const KINDS = {
  bl15: { pieces: 1, title: '15-INCH HOWITZER', note: 'One piece, a very slow cycle: lay carefully, 1,400 lb shells', rounds: [1, 2, 3], fuzes: ['instant', 'delay'], charges: 3, loadSteps: true },
  bl92: { pieces: 2, title: '9.2-INCH HOWITZERS', note: 'Section of two, 290 lb shells', rounds: [1, 2, 4, 6], fuzes: ['instant', 'delay'], charges: 3 },
  bl6: { pieces: 4, title: '6-INCH 26 CWT HOWITZERS', note: 'Battery of four: ripple fire for effect', rounds: [1, 2, 4, 6, 8], fuzes: ['instant', 'delay'], charges: 3 },
  bl60: { pieces: 2, title: '60-POUNDERS', note: 'Long flat trajectory: shrapnel bursts over wire and infantry', rounds: [1, 2, 4, 8], fuzes: ['instant', 'delay', 'shrapnel'], charges: 2 },
  rail: { pieces: 1, title: '18-INCH RAILWAY GUN', note: 'Deep targets to 20 km, 2,500 lb shells, a cycle of 90 s; the car rolls back on the rails', rounds: [1, 2, 3], fuzes: ['instant', 'delay'], charges: 3, deep: true },
  // the WW2 mode's German pieces (src/ww2/)
  lefh18: { pieces: 4, title: '10.5 CM leFH 18', note: 'Battery of four field howitzers, 14.8 kg shells, quick: the Sperrfeuer and the support fire', rounds: [1, 2, 4, 6, 8], fuzes: ['instant', 'delay', 'shrapnel'], charges: 6 },
  sfh18: { pieces: 4, title: '15 CM sFH 18', note: 'Battery of four heavy howitzers, 43.5 kg shells: the backbone', rounds: [1, 2, 4, 6], fuzes: ['instant', 'delay'], charges: 5 },
  k18: { pieces: 2, title: '17 CM KANONE 18', note: 'Two long guns, 68 kg shells to 29.6 km: counter-battery and the deep targets', rounds: [1, 2, 3, 4], fuzes: ['instant', 'delay'], charges: 3, deep: true },
  mrs18: { pieces: 2, title: '21 CM MÖRSER 18', note: 'Two heavy mortars, 113 kg shells plunging onto strongpoints and dugouts', rounds: [1, 2, 3, 4], fuzes: ['instant', 'delay'], charges: 4 },
  nbw41: { pieces: 3, title: '15 CM NEBELWERFER 41', note: 'Three six-tube launchers: a round is a ripple of six rockets. Short range, slow reload, the smoke gives you away', rounds: [1, 2, 3], fuzes: ['instant'], charges: 1 },
  gustav: { pieces: 1, title: '80 CM SCHWERER GUSTAV', note: 'Railway gun on its firing curve: 4.8 t shells to 47 km, a handful of rounds. Every shot counts', rounds: [1], fuzes: ['instant', 'delay'], charges: 3, deep: true },
  bertha: { pieces: 1, title: '42 CM BIG BERTHA', note: 'The giant siege howitzer: 810 kg shells to 12 km against the hardest targets', rounds: [1, 2], fuzes: ['instant', 'delay'], charges: 4 },
  karl: { pieces: 1, title: '60 CM KARL-GERÄT', note: 'Siege mortar: 2.2 t shells at 3 to 6.5 km, 4 degrees of traverse: turn the whole vehicle', rounds: [1], fuzes: ['instant', 'delay'], charges: 3 },
  v1: { pieces: 1, title: 'V-1 LAUNCH SITE', note: 'Walter catapult: the launch drill', rounds: [1], fuzes: ['instant'], charges: 1, launcher: true },
  v2: { pieces: 1, title: 'V-2 FIRING TABLE', note: 'A4 mobile battery: the launch drill', rounds: [1], fuzes: ['instant'], charges: 1, launcher: true },
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
  const S = TH.sectors;
  if (!S.length) return { id: '-', name: 'the front' };
  for (const s of S) if (z >= s.from && z < s.to) return s;
  return z < S[0].from ? S[0] : S[S.length - 1];
}
export const SOS_X = (z) => TH.sosX(z);

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

// The guns selector's choices for a unit of n pieces: values are what the `fire` command takes as `guns`
// ('1' and '2' are sent as numbers). A pair has 1 GUN and SECTION (both); four guns add the half-battery section.
export function gunChoices(n) {
  if (n < 2) return [];
  const one = { v: '1', main: '1 GUN', sub: 'No. 1', tip: 'The directing gun alone: ranging (G)' };
  if (n === 2) return [one, { v: 'all', main: 'SECTION', sub: 'both guns', tip: 'Both guns (G)' }];
  return [one, { v: '2', main: 'SECTION', sub: '2 guns', tip: 'Two guns (G)' }, { v: 'all', main: 'BATTERY', sub: `all ${n}`, tip: 'Every gun: fire for effect (G)' }];
}
// What the selector sits on by itself: the directing gun while ranging (or with no task), every gun once the
// mission is for effect, the observer says on target, or a series of more than one round is ordered.
export function gunsDefault(m, o) {
  return m && (m.state === 'ffe' || m.onTarget) || (o && o.rounds > 1) ? 'all' : '1';
}

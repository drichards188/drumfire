// What a lineup can do in the career's open battle (threat.js levels): for every kind of site, whether its batteries
// reach it and can finish it in time, judged from the tables the sim fights with. Node-safe pure functions.
//   reach   the gun's range table (shells.js autoCharge) from its pit on the 1918 ridge to the site
//   effect  its shell's damage (tables.js SHELLS, the best fuze against the target's hardness, the shells upgrade)
//           on each part of the target (models/t/layout.js) under its spread at that range (GUNS disp, the barrel
//           upgrade), the guns laid on the target's centre, or on one tank at a time on a tank laager (the threat
//           levels' rule, ww1/director.js)
//   finish  the rounds to knock out what the mission needs (a battery silenced to one gun, a laager half its tanks,
//           the rest every part), the minutes for the battery's guns and drill (the breech and crew upgrades), against
//           the mission's deadline and the shells the battery carries
// A site is 'ready' (comfortably), 'slow' (only just, or not every time) or 'no'. The sim asks siteVerdict for its own
// units on the field (the neighbouring Gruppe takes a site no battery can finish); the menu asks capabilities and
// recommendedLevel for a career's lineup.
import { GUNS, SHELLS, TARGETS, FUZE } from './sim/tables.js';
import { autoCharge } from './sim/shells.js';
import { partLayout } from './models/t/layout.js';
import { modsOf, levelOf, maxGuns, maxedLevels, isOffmap } from './research.js';
import { OPS } from './ww1/ops.js';
import { RIDGE_WW2, RIDGE_ROLE_SITES } from './ww1/ops.js';
import { THREAT } from './threat.js';

// the kinds of site (threat.js `sites`) by target kind; a role site (sim/specialists.js) is its role's
export const TIER = { bfield: 'soft', bdump: 'soft', bconvoy: 'soft', railyard: 'soft', hq: 'soft', bballoon: 'soft', btanks: 'armour',
  bgun15: 'heavy', bgun92: 'heavy', bgun6: 'heavy', bgun60: 'heavy', bgunrail: 'heavy', mebu: 'hard' };
export const tierOf = (t) => t?.site?.role ?? t?.role ?? TIER[t?.kind] ?? 'soft';
export const TIERS = ['soft', 'armour', 'heavy', 'deep', 'hard'];
// a mission's time (ww1/director.js siteMission's deadlines) and what finishes it
const DEADLINE = { btanks: 650, bdump: 800, hq: 800, bconvoy: 150, railyard: 260, mebu: 1500 };
const deadlineOf = (kind, role) => (role ? 1500 : DEADLINE[kind] ?? 700);
const BATTERY = new Set(['bfield', 'bgun15', 'bgun92', 'bgun6', 'bgun60', 'bgunrail']);
const needOf = (kind, n) => (BATTERY.has(kind) ? Math.max(1, n - 1) : kind === 'btanks' ? Math.ceil(n / 2) : kind === 'bconvoy' || kind === 'railyard' ? Math.ceil(n * 0.6) : n);
const RANK = { no: 0, slow: 1, ready: 2 };
const RESID = 15; // m: the error left on a battery's lay after ranging (calibration, wind, the observer's reading)
const RANGING = 140; // s: a mission's ranging before the fire for effect

// one battery's damage per round on a target at range D (the parts' sum), aimed at its centre or at one part
function perRound(kind, mods, tKind, D, aimPart = null) {
  const g = GUNS[kind], sc = SHELLS[g?.shell ?? kind], T = TARGETS[tKind];
  if (!g || !sc || !T) return 0;
  const hard = T.hardness === 'hard';
  const hit = hard ? sc.hard : sc.soft;
  if (!hit) return 0;
  const fz = (g.fuzes ?? ['instant']).filter((f) => f !== 'shrapnel');
  const fk = Math.max(...fz.map((f) => (hard ? FUZE[f]?.hard : FUZE[f]?.soft) ?? 0), 0);
  const Dm = hit.D * fk * (mods.dmg ?? 1), R = hit.R;
  const sr = Math.hypot((g.disp.r * D * mods.disp), RESID), sl = Math.hypot(g.disp.l * D * mods.disp, RESID);
  const parts = partLayout(tKind).map((p) => ({ x: p.x, z: p.z }));
  const ax = aimPart ? parts[0].x : 0, az = aimPart ? parts[0].z : 0;
  // the expected damage on each part: the burst's density (a Gaussian about the aim) over the part's lethal disc
  let sum = 0;
  const N = 15;
  for (const p of parts) {
    let e = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u = -R + (2 * R * (i + 0.5)) / N, v = -R + (2 * R * (j + 0.5)) / N, d = Math.hypot(u, v);
      if (d >= R) continue;
      const x = p.x + u - ax, z = p.z + v - az;
      e += (1 - d / R) * Math.exp(-0.5 * ((x / sr) ** 2 + (z / sl) ** 2)) / (2 * Math.PI * sr * sl);
    }
    sum += e * ((2 * R) / N) ** 2 * Dm;
  }
  return sum;
}

// a battery's verdict on a site: { verdict, rounds, time } ({ kind, guns, mods, pos } and { kind, pos, role })
export function batteryVerdict(b, site, { deadlineK = 1 } = {}) {
  const g = GUNS[b.kind];
  if (!g || isOffmap(b.kind)) return { verdict: 'no', rounds: Infinity, time: Infinity };
  const D = Math.hypot(site.pos.x - b.pos.x, site.pos.z - b.pos.z);
  if (autoCharge(b.kind, D) < 0) return { verdict: 'no', rounds: Infinity, time: Infinity, reach: false };
  const T = TARGETS[site.kind], n = partLayout(site.kind).length;
  const e = perRound(b.kind, b.mods, site.kind, D, site.kind === 'btanks');
  if (!(e > 0)) return { verdict: 'no', rounds: Infinity, time: Infinity };
  // (the parts knocked out stop taking damage, the rounds that overkill a part are lost: half again)
  const rounds = ((needOf(site.kind, n) * T.partHp) / e) * 1.5;
  const cycle = g.load.reduce((a, s) => a + s.dur, 0) * (b.mods.load ?? 1) + 2;
  const time = RANGING + (rounds * cycle) / Math.max(1, b.guns);
  const dl = deadlineOf(site.kind, site.role) * deadlineK, ammo = g.ammo.he * b.guns * (b.mods.ammo ?? 1);
  const verdict = time <= dl * 0.6 && rounds <= ammo * 0.5 ? 'ready' : time <= dl && rounds <= ammo ? 'slow' : 'no';
  return { verdict, rounds, time };
}

// the lineup's verdict on a site: its best battery's, or two batteries together making a slow site ready
export function siteVerdict(batteries, site, opts) {
  const vs = batteries.map((b) => batteryVerdict(b, site, opts)).filter((v) => v.verdict !== 'no');
  if (!vs.length) return 'no';
  if (vs.some((v) => v.verdict === 'ready')) return 'ready';
  return vs.length >= 2 && vs.sort((a, b) => a.time - b.time)[1].time < Infinity ? 'ready' : 'slow';
}

// the career's batteries on the 1918 ridge, from a lineup's levels ({ kind: { guns, shells, ... } }): the off-map ones left out
const PITS = Object.fromEntries([...OPS.ridge.units, ...RIDGE_WW2].map((u) => [u.kind, u.pos]));
export const batteriesOf = (levelsByKind) => Object.entries(levelsByKind).filter(([k]) => PITS[k] && !isOffmap(k))
  .map(([kind, l]) => ({ kind, guns: Math.min(maxGuns(kind), levelOf(l, 'guns')), mods: modsOf(l), pos: PITS[kind] }));
// the ridge's sites by kind of site (the 1918 battle's, and the career's role sites)
const SITES = [...OPS.ridge.sites, ...RIDGE_ROLE_SITES].map((s) => ({ id: s.id, kind: s.kind, pos: s.pos, role: s.role ?? null }));
export const sitesOf = (tier) => SITES.filter((s) => tierOf(s) === tier);

// every kind of site's verdict for a lineup: { soft, armour, heavy, deep, hard } ('ready', 'slow' or 'no'), from the
// share of its sites the lineup can finish
export function capabilities(levelsByKind, opts) {
  const bs = batteriesOf(levelsByKind), out = {};
  for (const tier of TIERS) {
    const vs = sitesOf(tier).map((s) => RANK[siteVerdict(bs, s, opts)]);
    const k = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    out[tier] = k >= 1.5 ? 'ready' : k >= 0.75 ? 'slow' : 'no';
  }
  return out;
}

// the lineup's weight in the Sperrfeuer and the Feuerwalze: the soft damage its field guns can put down a minute
// (the super-heavies, the mortars' few shells and the off-map weapons apart, as the levels' crews fire them)
const BARRAGE = new Set(['k17', 'sfh13', 'lefh18', 'sfh18', 'nbw41', 'm16', 'mrs18', 'k18']);
export function firepower(levelsByKind) {
  let f = 0;
  for (const b of batteriesOf(levelsByKind)) {
    if (!BARRAGE.has(b.kind)) continue;
    const g = GUNS[b.kind], sc = SHELLS[g.shell ?? b.kind];
    const cycle = g.load.reduce((a, s) => a + s.dur, 0) * (b.mods.load ?? 1) + 2;
    f += (b.guns * 60 / cycle) * sc.soft.R * sc.soft.R * sc.soft.D * (b.mods.dmg ?? 1) / 1000;
  }
  return f;
}

// The reference lineup of each level (its `fits`): what the level is tuned for (tools/leveltest.mjs), at most five
// batteries and one off-map weapon (threat.js SLOTS)
const P = (k, l) => Object.fromEntries(['shells', 'barrel', 'breech', 'sights', 'camo', 'supply', 'crew'].map((p) => [p, l]));
const B = (kind, guns, parts = 0) => [kind, { guns, ...(parts ? P(kind, parts) : {}) }];
const MAX = (kind) => [kind, maxedLevels(kind)];
export const REFERENCE = {
  1: Object.fromEntries([B('k17', 1)]),
  2: Object.fromEntries([B('k17', 2)]),
  3: Object.fromEntries([B('k17', 2), B('sfh13', 2)]),
  4: Object.fromEntries([B('k17', 2, 1), B('sfh13', 4), B('m16', 1)]),
  5: Object.fromEntries([B('k17', 2, 1), B('sfh13', 4, 1), B('lefh18', 4), B('m16', 2)]),
  6: Object.fromEntries([B('k18', 2, 1), B('sfh13', 4, 1), B('lefh18', 4, 1), B('m16', 2, 1), B('max38', 1)]),
  7: Object.fromEntries([B('k18', 2, 1), B('sfh18', 4, 2), B('sfh13', 4, 2), B('lefh18', 4, 1), B('gamma', 1, 1)]),
  8: Object.fromEntries([B('k18', 2, 2), B('sfh18', 4, 2), B('sfh13', 4, 2), B('lefh18', 4, 2), B('mrs18', 2, 2), B('v1', 1)]),
  9: Object.fromEntries([B('k18', 2, 3), B('sfh18', 4, 3), B('sfh13', 4, 2), B('lefh18', 4, 3), B('mrs18', 2, 2), B('v2', 1, 1)]),
  10: Object.fromEntries([MAX('k18'), MAX('sfh18'), MAX('sfh13'), MAX('lefh18'), MAX('mrs18'), MAX('v2')]),
};

// the highest level the lineup can carry: every kind of site the level asks for at least 'slow', and the field guns'
// weight at least the level's reference lineup's (1 at the least)
const FP = Object.fromEntries(Object.entries(REFERENCE).map(([n, l]) => [n, firepower(l)]));
export function recommendedLevel(levelsByKind) {
  const cap = capabilities(levelsByKind), f = firepower(levelsByKind);
  let best = 1;
  for (const L of THREAT) {
    if (L.sites.every((s) => RANK[cap[s]] >= 1) && f >= FP[L.n]) best = L.n;
    else break;
  }
  return best;
}

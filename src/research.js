// Research and battery upgrades, the long game of the open battles (docs/PROGRESSION.md). Node-safe data and pure
// functions: the career that keeps them is progression.js, the battle that pays them is the sim (`sim.earned`).
//
// One payout feeds two purses. A battle's research points (RP) go to its era's tree, where they research the next
// batteries; each battery that fought also keeps its own battery points, spent on its own upgrades in any order:
// more guns (every battery starts with one) and three levels each of shells, barrel, breech, sights, camouflage and
// ammunition supply, and men for each gun's detachment. The upgrades are game multipliers on the gun tables
// (sim/guns.js `u.mods`), not weapons data.
import { UNITS } from './sector.js';
import { OPS } from './ww2/ops.js';

// the batteries each era researches; `after` must be researched first, `cost` is in RP (tier I is the starting battery)
export const TREES = {
  '1917': [
    { kind: 'bl6', tier: 1, after: null, cost: 0 },
    { kind: 'bl60', tier: 2, after: 'bl6', cost: 450 },
    { kind: 'bl92', tier: 2, after: 'bl6', cost: 450 },
    { kind: 'bl15', tier: 3, after: 'bl92', cost: 1100 },
    { kind: 'rail', tier: 4, after: 'bl60', cost: 2000 },
  ],
  ww2: [
    { kind: 'lefh18', tier: 1, after: null, cost: 0 },
    { kind: 'sfh18', tier: 2, after: 'lefh18', cost: 450 },
    { kind: 'nbw41', tier: 2, after: 'lefh18', cost: 450 },
    { kind: 'mrs18', tier: 3, after: 'sfh18', cost: 1100 },
    { kind: 'k18', tier: 3, after: 'sfh18', cost: 1100 },
    { kind: 'karl', tier: 4, after: 'mrs18', cost: 2000 },
    { kind: 'gustav', tier: 4, after: 'k18', cost: 2000 },
  ],
};
export const RESEARCH_ERAS = Object.keys(TREES);
export const nodeOf = (kind) => RESEARCH_ERAS.map((e) => TREES[e].find((n) => n.kind === kind)).find(Boolean) ?? null;
export const eraOfKind = (kind) => RESEARCH_ERAS.find((e) => TREES[e].some((n) => n.kind === kind)) ?? null;

// a battery's full strength: the gun pits of its open battle position (the sandbox Karl is the Karl operation's)
const DEFS = [...UNITS, ...OPS.flanders.units, OPS.karl.units[0]];
export const maxGuns = (kind) => DEFS.find((d) => d.kind === kind)?.pieces.length ?? 1;

// The parts. Each level replaces the one before (fx[k][level - 1]); the keys are the sim's multipliers (guns.js):
// dmg on the damage a burst does, disp on the dispersion at every shot and the guns' calibration error, wear on the
// barrel wear per round, load on every loading step (the breech's and the detachment's together), bias on the lay's
// first-round map error, lay on the traverse and elevation rates, sig on the flash and noise the enemy locates, ammo on
// the stock and the resupply; crew (added, not multiplied) the share of the drill's detachment each gun has over it,
// men in reserve: a gun slows only when casualties take it below the drill's number.
export const LEVELS = 3;
export const PARTS = [
  { id: 'shells', name: 'Shells', stat: 'Damage', fx: { dmg: [1.12, 1.25, 1.4] } },
  { id: 'barrel', name: 'Barrel', stat: 'Accuracy', fx: { disp: [0.85, 0.72, 0.6], wear: [0.8, 0.65, 0.5] } },
  { id: 'breech', name: 'Breech and loading gear', stat: 'Reload', fx: { load: [0.9, 0.81, 0.72] } },
  { id: 'sights', name: 'Sights and survey', stat: 'First round', fx: { bias: [0.85, 0.7, 0.55], lay: [1.15, 1.3, 1.5] } },
  { id: 'camo', name: 'Camouflage', stat: 'Concealment', fx: { sig: [0.88, 0.76, 0.64] } },
  { id: 'supply', name: 'Ammunition supply', stat: 'Stock and resupply', fx: { ammo: [1.2, 1.4, 1.6] } },
  // reliefs: men to take turns at the heavy work so the crew stays fresh (not modelled as fatigue: in the sim they are
  // reserves against casualties and a little faster loading)
  { id: 'crew', name: 'Relief crews', stat: 'Men to take turns', fx: { crew: [0.25, 0.5, 0.75], load: [0.97, 0.94, 0.9] } },
];
const ADDED = new Set(['crew']);
const pct = (v) => Math.round(Math.abs(v - 1) * 100);
const SAY = {
  dmg: (v) => `+${pct(v)}% damage`, disp: (v) => `${pct(v)}% tighter fall of shot`, wear: (v) => `${pct(v)}% less barrel wear`,
  load: (v) => `${pct(v)}% faster loading`, bias: (v) => `first round ${pct(v)}% closer`, lay: (v) => `+${pct(v)}% laying speed`,
  sig: (v) => `${pct(v)}% less flash and noise`, ammo: (v) => `+${pct(v)}% shells and resupply`,
  crew: (v) => `+${Math.round(v * 100)}% men a gun to take turns`,
};
// what a part's level does, in the player's words ('' for level 0)
export const partEffect = (part, level) => (level > 0 ? Object.entries(part.fx).map(([k, v]) => SAY[k](v[level - 1])).join(', ') : '');

// Battery points. A part's level n costs PART_COST[n - 1] and the k-th gun GUN_COST * (k - 1), both times the
// battery's tier (a heavier battery earns more for each round, so it pays more).
const TIER_K = [1, 1.2, 1.4, 1.6];
const PART_COST = [80, 170, 300];
const GUN_COST = 120;
const round10 = (v) => Math.round(v / 10) * 10;
// the cost of the next level of a part (guns: the next gun), or null when it is at its top
export function nextCost(kind, part, have) {
  const k = TIER_K[(nodeOf(kind)?.tier ?? 1) - 1];
  if (part === 'guns') return have < maxGuns(kind) ? round10(GUN_COST * have * k) : null;
  return have < LEVELS ? round10(PART_COST[have] * k) : null;
}
// every part at its top (dev mode's batteries)
export const maxedLevels = (kind) => ({ guns: maxGuns(kind), ...Object.fromEntries(PARTS.map((p) => [p.id, LEVELS])) });
export const levelOf = (levels, part) => levels?.[part] ?? (part === 'guns' ? 1 : 0);

// the sim's multipliers for a battery's levels ({ guns, shells, barrel, ... })
export function modsOf(levels = {}) {
  const m = { dmg: 1, disp: 1, wear: 1, load: 1, bias: 1, lay: 1, sig: 1, ammo: 1, crew: 0 };
  for (const p of PARTS) {
    const l = levelOf(levels, p.id);
    if (l > 0) for (const [k, v] of Object.entries(p.fx)) m[k] = ADDED.has(k) ? m[k] + v[l - 1] : m[k] * v[l - 1];
  }
  return m;
}
// The minimal crew that served one gun in action, its detachment: the men the hangar parades and the crew figures
// show. The thousands behind the biggest guns (track layers, flak, guards, the ammunition column) are not counted.
// Sources: docs/HISTORY.md; `est` marks an estimate where no per-gun figure was found. The sim's own crew pool
// (GUNS[kind].crew) stays a game number: casualties are drawn from it, scaled to these men only for display.
export const DETACHMENT = {
  bl6: { men: 10 }, bl60: { men: 10 }, bl92: { men: 14, est: true }, bl15: { men: 16, est: true }, rail: { men: 30 },
  lefh18: { men: 6 }, sfh18: { men: 7 }, k18: { men: 10 }, mrs18: { men: 10 }, nbw41: { men: 5 }, karl: { men: 21 }, gustav: { men: 250 },
  k17: { men: 8, est: true }, sfh13: { men: 8, est: true }, m16: { men: 10, est: true }, max38: { men: 40, est: true },
  bertha: { men: 120, est: true }, gamma: { men: 250, est: true }, paris: { men: 80 },
};
export const detachmentOf = (kind, drill = 8) => DETACHMENT[kind]?.men ?? drill;
// the men of one gun for a battery's levels: its detachment and its relief crews
export const crewOf = (kind, levels, drill) => Math.round(detachmentOf(kind, drill) * (1 + modsOf(levels).crew));
// a piece's crew in the detachment's numbers: the sim's pool (crew of crewMax, the drill's `drill` and the reliefs over
// it) scaled to the real men; { men, of }
export function menShown(kind, crew, crewMax, drill) {
  const of = Math.round((detachmentOf(kind, drill) * crewMax) / Math.max(1, drill));
  return { men: Math.round((of * crew) / Math.max(1, crewMax)), of };
}
// a lineup for the sim (`newGame({ loadout })`): { kind: { guns, mods } }
export const loadoutOf = (levelsByKind) => Object.fromEntries(Object.entries(levelsByKind).map(([kind, l]) => [kind, { guns: Math.min(maxGuns(kind), levelOf(l, 'guns')), mods: modsOf(l) }]));

// How strong a lineup is next to the era's whole tree at full strength and unimproved (1): each battery counts the
// same (the long guns get little work in the open battle, so a tier is no measure of what a battery adds), times the
// share of its guns, times up to 1.3 for its parts. The opposition (`newGame({ opposition })`) follows it part of the
// way and never above the old battle: the counter-battery fire and the raids half way (a small lineup is hunted
// less), the assaults a fifth of the way (they decide the day). So a better lineup still does better.
export function opposition(era, levelsByKind) {
  let have = 0, full = 0;
  for (const n of TREES[era] ?? []) {
    full++;
    const l = levelsByKind[n.kind];
    if (!l) continue;
    const parts = PARTS.reduce((a, p) => a + levelOf(l, p.id), 0) / (PARTS.length * LEVELS);
    have += Math.min(1, levelOf(l, 'guns') / maxGuns(n.kind)) * (1 + 0.3 * parts);
  }
  const s = full ? have / full : 1;
  return { cb: Math.min(1, 0.5 + 0.5 * s), assault: Math.min(1, 0.8 + 0.2 * s) };
}

// What a battle paid. `sim.earned` (sim.js) holds each unit's credit: its share of every mission done (the mission's
// points split by the rounds each unit fired on it), the effective damage it did and the score of what it destroyed.
// The batteries keep their own credit as battery points; the RP are their credit together, plus a little for every
// minute in action and a bonus for the day won (a lost battle still pays). Difficulty scales it all.
export const PAY = { Easy: 0.8, Normal: 1, Hard: 1.35 };
const PER_MINUTE = 4, WIN = 400;
export function battleReward(sim, { won = false } = {}) {
  const k = PAY[sim.difficultyName] ?? 1;
  const batteries = {};
  for (const u of sim.units) batteries[u.kind] = (batteries[u.kind] ?? 0) + Math.round((sim.earned?.[u.id] ?? 0) * k);
  const fought = Object.values(batteries).reduce((a, b) => a + b, 0);
  const time = Math.round((Math.min(sim.time, 2700) / 60) * PER_MINUTE * k);
  const win = won ? Math.round(WIN * k) : 0;
  return { rp: fought + time + win, fought, time, win, batteries };
}

// a campaign mission's first win: half the research cost of the battery it features (the V-weapons' missions a flat sum)
export const missionBonus = (m) => Math.max(500, Math.round((nodeOf(m.reward)?.cost ?? 2000) / 2));

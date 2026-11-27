// Research and battery upgrades, the long game of the open battles (docs/PROGRESSION.md). Node-safe data and pure
// functions: the career that keeps them is progression.js, the battle that pays them is the sim (`sim.earned`).
//
// One payout feeds two purses. A battle's research points (RP) go to the battery the player has chosen to research
// (`target`, picked on the Research screen); each battery that fought also keeps its own battery points, spent on its
// own upgrades in any order: more guns (every battery starts with one) and three levels each of shells, barrel,
// breech, sights, camouflage and ammunition supply, and men for each gun's detachment. The upgrades are game
// multipliers on the gun tables (sim/guns.js `u.mods`), not weapons data.
//
// Germany is one tree (the 1917 and the WW2 guns together, as War Thunder's nations): lines of one type each, a
// battery researched only after the one before it in its line (`after`), the lines never crossing. Its rank (`tier`)
// is its era and its weight in it, as War Thunder's ranks (since 2026-11-14): I and II the guns of 1914 to 1918 (I field
// and medium, II heavy and super-heavy), III and IV those of 1939 to 1945 (III field, medium and the rockets, IV heavy,
// super-heavy and the V-weapons). The ranks keep the eras together; the price is the battery's power alone, whatever its
// era (the user, 2026-11-14: a WW2 field howitzer is cheap, the WW1 siege guns are hard to get). A rank opens as War
// Thunder's do: rank I from the start, each rank above once the career has RANK_GATE of the
// rank before (any line). `weight` is the old weight class (I field to IV the giants), which scales the upgrade costs and
// orders the lineup picked for you; a career starts with the batteries of START_KINDS, the 7.7 cm FK 16 and the 15 cm
// sFH 13 at the head of the field line (cost 0; since 2026-11-26: the 15 cm Ringkanone C/92 from 2026-11-01, the K 17
// before, which older saves keep: progression.js). The off-map line fights in the open battle as off-map support: picked,
// given a target, it fires in its own time. Since 2026-11-26 the tree has 20 batteries (OUT_OF_TREE below: what was cut,
// and where it went). The British 1917 tree is kept
// for when Britain comes back; the menu does not show it for now.
import { UNITS } from './sector.js';
import { OPS } from './ww2/ops.js';
import { OPS as OPS_WW1, RIDGE_MORE } from './ww1/ops.js';
import { threatOf } from './threat.js';

export const LINES = {
  // in this order on the Research screen: a line that starts above rank I stands beside the line of its `via`
  // (the lines open at rank I first, then those that start at rank II, the rockets, all of 1939 to 1945, last)
  de: [
    { id: 'howitzers', name: 'Field artillery', de: 'Feldartillerie' },
    { id: 'guns', name: 'Long-range guns', de: 'Kanonen' },
    { id: 'mortars', name: 'Mortars', de: 'Mörser' },
    { id: 'siege', name: 'Siege guns', de: 'Belagerungsgeschütze' },
    { id: 'railway', name: 'Railway guns', de: 'Eisenbahngeschütze' },
    { id: 'support', name: 'Off-map support', de: 'Fernwaffen' },
    { id: 'rockets', name: 'Rockets', de: 'Werfer' },
  ],
  '1917': [{ id: 'all', name: 'Heavy Artillery Group' }],
};
// the batteries each tree researches; `after` must be researched first, `cost` is in RP (cost 0: a starting battery,
// START_KINDS); `tier` the rank (the German tree: era and weight, RANK_GATE), `weight` the weight class where it
// differs from it
export const TREES = {
  '1917': [
    { kind: 'bl6', line: 'all', tier: 1, after: null, cost: 0 },
    { kind: 'bl60', line: 'all', tier: 2, after: 'bl6', cost: 450 },
    { kind: 'bl92', line: 'all', tier: 2, after: 'bl6', cost: 450 },
    { kind: 'bl15', line: 'all', tier: 3, after: 'bl92', cost: 1100 },
    { kind: 'rail', line: 'all', tier: 4, after: 'bl60', cost: 2000 },
  ],
  de: [
    // each line runs from the guns of 1914 to 1918 (ranks I and II) to those of the second war (III and IV), heavier as
    // it goes (docs/PROGRESSION.md)
    // (cut on 2026-11-26 at the user's word, each a step back or a sidegrade of the battery before it: the ramp guns, the
    // schweres Wurfgerät 40, the H M1, the K 12, the Kurze Bruno, the K5 and the Wespe; the Gamma merged into Bertha;
    // the Paris Gun and the V-1 out of the tree, their own missions as they were. Commit 1dd259b has them all in the
    // tree and in play: OUT_OF_TREE below, the DESIGN.md changelog)
    { kind: 'fk16', line: 'howitzers', tier: 1, after: null, cost: 0 },
    { kind: 'sfh13', line: 'howitzers', tier: 1, after: 'fk16', cost: 0 },
    { kind: 'lefh18', line: 'howitzers', tier: 3, weight: 1, after: 'sfh13', cost: 600 },
    { kind: 'sfh18', line: 'howitzers', tier: 3, weight: 2, after: 'lefh18', cost: 1100 },
    { kind: 'hummel', line: 'howitzers', tier: 4, weight: 2, after: 'sfh18', cost: 2000 },
    { kind: 'k17', line: 'guns', tier: 1, after: null, cost: 350 },
    { kind: 'k16', line: 'guns', tier: 2, after: 'k17', cost: 700 },
    { kind: 'k18', line: 'guns', tier: 3, weight: 2, after: 'k16', cost: 1100 },
    { kind: 'k38', line: 'guns', tier: 4, weight: 3, after: 'k18', cost: 2000 },
    { kind: 'max38', line: 'railway', tier: 2, weight: 3, after: null, cost: 2400 },
    { kind: 'gustav', line: 'railway', tier: 4, after: 'max38', cost: 5000 },
    { kind: 'm16', line: 'mortars', tier: 2, after: null, cost: 900 },
    { kind: 'mrs18', line: 'mortars', tier: 3, weight: 2, after: 'm16', cost: 1300 },
    { kind: 'beta', line: 'siege', tier: 2, weight: 3, after: null, cost: 2000 },
    // (Bertha at the Gamma's place and price since the merge, 2,800 RP before)
    { kind: 'bertha', line: 'siege', tier: 2, weight: 3, after: 'beta', cost: 2400 },
    { kind: 'karl', line: 'siege', tier: 4, after: 'bertha', cost: 4000 },
    { kind: 'nbw41', line: 'rockets', tier: 3, weight: 1, after: null, cost: 450 },
    { kind: 'nbw42', line: 'rockets', tier: 3, weight: 2, after: 'nbw41', cost: 1200 },
    { kind: 'gotha', line: 'support', tier: 2, weight: 3, after: null, cost: 2000, offmap: true },
    { kind: 'v2', line: 'support', tier: 4, after: 'gotha', cost: 4500, offmap: true },
  ],
};
// War Thunder's rank rule (the German tree): a rank opens once the career has this many batteries of the rank before
// it, in any line (rank I is open from the start; the starting batteries count). So a career fields the guns of 1914 to
// 1918 first, and the second war's open with three of the Great War's heavy batteries, the cheaper ones will do: the
// siege guns stay a long goal (from threat level 6 the strongpoints want 28 cm shells and more). Since the ramp guns'
// cut (2026-11-26) rank I is the FK 16 and the sFH 13, both a career's from the start, and the K 17: rank II opens with
// the K 17, 350 RP, about the first battle's pay, so the first battle buys a battery and opens a rank. After the tree's
// cuts the ranks hold 3, 6, 6 and 5 batteries: rank III opens with half of rank II (the Mörser 16, the K 16 and the Beta
// or the Gotha, 3,600 RP, as before), rank IV with two thirds of rank III.
export const RANK_GATE = { de: { 2: 3, 3: 3, 4: 4 } };
// The batteries taken out of the German tree, with what they were in it (their research cost, their weight class for
// what their upgrades cost, their line) and the battery their battery points, guns and parts go to (`to`: the next up
// its line, or the one before it at a line's end; progression.js carries a save over). Commit 1dd259b (2026-11-25) has
// every one in the tree and in play. The Paris Gun and the V-1 keep their own missions (their first win still pays half
// this cost, specialBonus) and stay off-map weapons (isOffmap); the Gamma stays in the 1918 sandbox battle; the rest are
// dormant (their models, drills and tables kept unreachable)
export const OUT_OF_TREE = {
  sfh93: { cost: 350, weight: 1, line: 'howitzers', to: 'sfh13' }, rk92: { cost: 0, weight: 1, line: 'guns', to: 'sfh13' },
  m99: { cost: 600, weight: 2, line: 'mortars', to: 'm16' },
  wespe: { cost: 1500, weight: 2, line: 'howitzers', to: 'hummel' }, hm1: { cost: 2600, weight: 3, line: 'mortars', to: 'mrs18' },
  paris: { cost: 4000, weight: 4, line: 'railway', to: 'gustav', offmap: true }, bruno: { cost: 2800, weight: 3, line: 'railway', to: 'gustav' },
  k5: { cost: 3400, weight: 3, line: 'railway', to: 'gustav' }, k12: { cost: 4600, weight: 4, line: 'railway', to: 'gustav' },
  gamma: { cost: 2400, weight: 3, line: 'siege', to: 'bertha' }, swg40: { cost: 800, weight: 2, line: 'rockets', to: 'nbw42' },
  v1: { cost: 3000, weight: 4, line: 'support', to: 'v2', offmap: true },
};
// the batteries a career owns from the start, unresearched (cost 0 in TREES), per tree (the user, 2026-11-26: the FK 16
// and the sFH 13 together, in the 15 cm Ringkanone C/92's place)
export const START_KINDS = { '1917': ['bl6'], de: ['fk16', 'sfh13'] };
// the guns a starting battery has from the first battle (the user, 2026-11-26: one gun alone made level 1 slow and
// repetitive; each battery has four pits, so two are still to earn); progression.js brings a career up to them
export const START_GUNS = { fk16: 2, sfh13: 2 };
export const isStartKind = (kind) => Object.values(START_KINDS).some((ks) => ks.includes(kind));
// the era of a German rank, for the Research screen
export const RANK_ERA = { de: ['1914 to 1918', '1914 to 1918', '1939 to 1945', '1939 to 1945'] };
export const RESEARCH_ERAS = Object.keys(TREES);
// the tree a game era's guns are researched in (the German eras share one)
export const TREE_OF = { '1917': '1917', ww1: 'de', ww2: 'de', de: 'de' };
export const nodeOf = (kind) => RESEARCH_ERAS.map((e) => TREES[e].find((n) => n.kind === kind)).find(Boolean) ?? null;
export const eraOfKind = (kind) => RESEARCH_ERAS.find((e) => TREES[e].some((n) => n.kind === kind)) ?? null;
// what must be researched before a battery in its line: the one before it (its rank's gate aside, RANK_GATE)
export const needsOf = (kind) => { const n = nodeOf(kind); return n?.after ? [n.after] : []; };
// a battery's weight class (the upgrade costs' scale, the lineup picked for you): `weight`, else its rank
export const weightOf = (kind) => { const n = nodeOf(kind); return n ? n.weight ?? n.tier : 1; };
// the battery after this one in its line (null at the line's end)
export const nextInLine = (kind) => TREES[eraOfKind(kind)]?.find((n) => n.after === kind) ?? null;
// the batteries that fight from off the map (off-map support): never in a gun pit
export const isOffmap = (kind) => !!(nodeOf(kind) ?? OUT_OF_TREE[kind])?.offmap;
// the era a gun belongs to, for its look (models/looks.js camouflage, the crews' dress)
const WW1_KINDS = new Set([...OPS_WW1.ridge.units, ...OPS_WW1.paris.units, ...RIDGE_MORE.filter((u) => u.era === 'ww1')].map((u) => u.kind).concat('gotha'));
export const gunEraOf = (kind) => (TREES['1917'].some((n) => n.kind === kind) ? '1917' : WW1_KINDS.has(kind) ? 'ww1' : 'ww2');

// a battery's full strength: the gun pits of its open battle position (the sandbox Karl is the Karl operation's)
const DEFS = [...UNITS, ...OPS.flanders.units, OPS.karl.units[0], ...OPS_WW1.ridge.units, ...OPS_WW1.paris.units, ...RIDGE_MORE];
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
// battery's weight class (a heavier battery earns more for each round, so it pays more; weightOf, not its era's rank).
const TIER_K = [1, 1.2, 1.4, 1.6];
const PART_COST = [80, 170, 300];
const GUN_COST = 120;
const round10 = (v) => Math.round(v / 10) * 10;
// what a part's next level costs a battery of weight class `weight` (guns: the next gun), uncapped
export const levelCost = (weight, part, have) => round10((part === 'guns' ? GUN_COST * have : PART_COST[Math.min(have, LEVELS - 1)]) * TIER_K[weight - 1]);
// the cost of the next level of a part (guns: the next gun), or null when it is at its top
export function nextCost(kind, part, have) {
  if (part === 'guns') return have < maxGuns(kind) ? levelCost(weightOf(kind), part, have) : null;
  return have < LEVELS ? levelCost(weightOf(kind), part, have) : null;
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
  fk16: { men: 6 }, k16: { men: 9, est: true }, beta: { men: 40, est: true },
  k38: { men: 12, est: true }, hummel: { men: 6 }, nbw42: { men: 6 }, gotha: { men: 3 },
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
  for (const n of TREES[TREE_OF[era] ?? era] ?? []) {
    if (n.offmap) continue; // (the weapons off the map add no guns to the battle)
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
// minute in action and a bonus for the day won (a lost battle still pays). The threat level (or the difficulty) scales
// it all, times the overmatch cut (below; `cut`, else `sim.payCut`, else 1).
//
// A battery lent for the battle (`u.lent`, or `lent` on its loadout entry; no battle lends one today) earns
// research points but no battery points: its credit is kept under `lent:<kind>` in `batteries`, so it is in `fought`
// and the RP (main.js sums the entries) while progression.js `gain` gives battery points only to a battery of the tree,
// so the battle never upgrades it (nor researches it: the RP go to the player's own research target).
export const PAY = { Easy: 0.8, Normal: 1, Hard: 1.35 };
const PER_MINUTE = 4, WIN = 400;
// a level's mission (src/operation.js): its objectives pay as they are done (OBJECTIVE_PAY, sim.objectivePay), so the
// win itself pays less; a mission won with its mains and half its secondaries pays about what a battle won used to
const WIN_MISSION = 250;
export const lentKey = (kind) => `lent:${kind}`;
export function battleReward(sim, { won = false, cut = sim.payCut } = {}) {
  // (a threat level's pay, threat.js; else the difficulty's; the cut never above 1: no bonus for a weaker lineup)
  const k = (sim.level?.pay ?? PAY[sim.difficultyName] ?? 1) * (Number.isFinite(cut) ? Math.max(0, Math.min(1, cut)) : 1);
  const batteries = {};
  const payee = (q) => (q.lent || sim.loadout?.[q.kind]?.lent ? lentKey(q.kind) : q.kind);
  const add = (key, v) => { batteries[key] = (batteries[key] ?? 0) + Math.round(v * k); };
  for (const u of sim.units) add(payee(u), sim.earned?.[u.id] ?? 0);
  // the weapons off the map (sim/support.js): their strikes' credit, kept under `support:<kind>`
  for (const a of sim.support?.assets ?? []) add(payee(a), sim.earned?.[`support:${a.kind}`] ?? 0);
  const fought = Object.values(batteries).reduce((a, b) => a + b, 0);
  const time = Math.round((Math.min(sim.time, 2700) / 60) * PER_MINUTE * k);
  const win = won ? Math.round((sim.objectives ? WIN_MISSION : WIN) * k) : 0;
  const objectives = Math.round((sim.objectivePay ?? 0) * k);
  return { rp: fought + time + win + objectives, fought, time, win, objectives, batteries };
}

// A threat level's first win (progression.js wonLevel, once a level) pays its victory again: WIN_MISSION times the
// level's pay, to the nearest 50 (250 at levels 1 and 2, 300, 400, 450, 500, 650, 750, 900, 1,000 at level 10). A level 1
// win already pays about 450 to 520 RP (the main objective 100, the medals 50, the victory 250, the kills, the minutes),
// so the first, about 700 to 770, researches the K 17 and opens rank II. Never cut: a one-off award, not the battle's pay.
export const firstWinRP = (n) => Math.round((WIN_MISSION * threatOf(n).pay) / 50) * 50;
// The overmatch cut: a lineup that outclasses the level's front earns less, so the climb pays and farming the quiet
// fronts does not. Full pay down to two levels below the lineup's rating (capability.js recommendedLevel on the career's
// lineup, a lent battery not counted), x0.75 three below, x0.5 four or more below; never above 1.
export const OVERMATCH = [[4, 0.5], [3, 0.75]];
export const overmatchCut = (rating, n) => (rating == null ? 1 : OVERMATCH.find(([d]) => rating - n >= d)?.[1] ?? 1);
// The top level of every part (LEVELS) opens with a win at this threat level or higher (Helldivers 2's super samples:
// the best kit comes from the hard fronts); dev mode and unlimited points open it (progression.js partGate)
export const TOP_PART_WIN = 6;

// a campaign mission's first win: half the research cost of the battery it features (the V-weapons' missions a flat sum)
export const missionBonus = (m) => Math.max(500, Math.round(((nodeOf(m.reward) ?? OUT_OF_TREE[m.reward])?.cost ?? 2000) / 2));
// a special mission's first win (menuItems.js SPECIAL): half its weapon's research cost, 500 at least
export const specialBonus = (kind) => Math.max(500, Math.round(((nodeOf(kind) ?? OUT_OF_TREE[kind])?.cost ?? 2000) / 2));

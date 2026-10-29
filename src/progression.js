import { BATTERIES, CAMPAIGN, missionById } from './campaign-data.js';
import { TREES, TREE_OF, nodeOf, eraOfKind, nextCost, levelOf, maxedLevels, loadoutOf, opposition, missionBonus, PARTS, isOffmap } from './research.js';
import { SLOTS, MAX_LEVEL } from './threat.js';
export { BATTERIES };
// v4: one German tree and a research target (research.js); the saves before it are not carried over (a new career)
export const SAVE_KEY = 'drumfire.campaign.v4';
// dev mode is on until the player switches it off (the user's call for the draft builds; false again when they say so)
export const DEV_DEFAULT = true;
const LEVEL_KEYS = ['guns', ...PARTS.map((p) => p.id)];
const treeOf = (era) => TREE_OF[era] ?? era;

// The career, per tree: the research points put into each battery (`progress`), the battery the battles' RP go to
// (`target`, always one while anything is left to research), the batteries researched, each battery's points and the
// levels of its parts, the campaign missions won. RP left over when nothing is left to research wait in `rp`. Dev mode
// lays every battery researched and at its top over it for the open battles; the career underneath still earns and is
// what the player sees again with dev mode off.
export class Progression {
  constructor(storage) {
    this.storage = storage;
    this.completed = new Set();
    this.rp = Object.fromEntries(Object.keys(TREES).map((e) => [e, 0]));
    this.target = Object.fromEntries(Object.keys(TREES).map((e) => [e, null]));
    this.progress = {};
    this.researched = new Set();
    this.bp = {};
    this.levels = {};
    this.battles = Object.fromEntries(Object.keys(TREES).map((e) => [e, 0])); // open battles paid, per tree
    this.lineup = Object.fromEntries(Object.keys(TREES).map((e) => [e, null])); // the batteries chosen for battle (null: picked for you)
    this.threat = Object.fromEntries(Object.keys(TREES).map((e) => [e, 1])); // the highest threat level unlocked
    this.dev = DEV_DEFAULT;
    this.devSet = false; // the player's own switch, kept over the default
    this.free = false; // unlimited points (a testing switch): research and upgrades cost nothing, the tree order still holds
    this.saved = !!storage;
    try {
      const data = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
      for (const m of CAMPAIGN) if (Array.isArray(data?.completed) && data.completed.includes(m.id)) this.completed.add(m.id);
      for (const k of data?.researched ?? []) if (nodeOf(k) && !this.isStart(k)) this.researched.add(k);
      for (const e of Object.keys(this.rp)) this.rp[e] = Math.max(0, Math.round(+data?.rp?.[e] || 0));
      for (const [k, v] of Object.entries(data?.progress ?? {})) if (nodeOf(k)) this.progress[k] = Math.max(0, Math.round(+v || 0));
      for (const e of Object.keys(this.target)) if (nodeOf(data?.target?.[e]) && eraOfKind(data.target[e]) === e) this.target[e] = data.target[e];
      for (const [k, v] of Object.entries(data?.bp ?? {})) if (nodeOf(k)) this.bp[k] = Math.max(0, Math.round(+v || 0));
      for (const [k, l] of Object.entries(data?.levels ?? {})) if (nodeOf(k)) this.levels[k] = Object.fromEntries(LEVEL_KEYS.filter((p) => Number.isInteger(l?.[p])).map((p) => [p, l[p]]));
      for (const e of Object.keys(this.battles)) this.battles[e] = Math.max(0, data?.battles?.[e] | 0);
      for (const e of Object.keys(this.lineup)) if (Array.isArray(data?.lineup?.[e])) this.lineup[e] = data.lineup[e].filter((k) => eraOfKind(k) === e);
      for (const e of Object.keys(this.threat)) this.threat[e] = Math.max(1, Math.min(MAX_LEVEL, data?.threat?.[e] | 0 || 1));
      if (data?.devSet) { this.dev = data.dev === true; this.devSet = true; }
      this.free = data?.free === true;
    } catch { this.saved = false; }
    for (const e of Object.keys(TREES)) this.settle(e, false);
  }

  // ------------------------------------------------------------------ research
  isStart(kind) {
    const n = nodeOf(kind);
    return !!n && !n.after && n.cost === 0;
  }
  // the career's own (dev mode aside): the starting battery, or researched
  owns(kind) {
    return this.isStart(kind) || this.researched.has(kind);
  }
  // in the open battles: owned, or every battery in dev mode
  unlocked(kind) {
    return !!nodeOf(kind) && (this.dev || this.owns(kind));
  }
  // why a battery cannot be researched now ('' when it can: the one before it in its line is the career's)
  researchBlock(kind) {
    const n = nodeOf(kind);
    if (!n) return 'not in a research tree';
    if (this.owns(kind)) return 'researched';
    if (n.after && !this.owns(n.after)) return `research the ${BATTERIES.find((b) => b.kind === n.after)?.name ?? n.after} first`;
    return '';
  }
  // the RP still wanted, and how far it has got (0 to 1)
  costLeft(kind) {
    return Math.max(0, (nodeOf(kind)?.cost ?? 0) - (this.progress[kind] ?? 0));
  }
  researchShare(kind) {
    const c = nodeOf(kind)?.cost ?? 0;
    return this.owns(kind) ? 1 : c > 0 ? Math.min(1, (this.progress[kind] ?? 0) / c) : 0;
  }
  // the battery the battles' RP go to (era: a game era or a tree)
  targetOf(era) {
    return this.target[treeOf(era)];
  }
  // the player's pick on the Research screen: any battery that can be researched now
  setTarget(kind) {
    if (this.researchBlock(kind)) return false;
    this.target[eraOfKind(kind)] = kind;
    this.settle(eraOfKind(kind));
    return true;
  }
  // research points into the tree's target (RP with nothing left to research wait in `rp`)
  addRP(era, n) {
    const tree = treeOf(era);
    if (!(tree in this.rp) || !(n > 0)) return;
    this.rp[tree] += Math.round(n);
    this.settle(tree);
  }
  // keep a target while anything is left to research (the next in the target's line, else the cheapest open one), put
  // the waiting RP into it, and research what is paid for; the RP over a battery's cost go on to the next target
  settle(tree, save = true) {
    let t = this.target[tree];
    for (let guard = 0; guard < 64; guard++) {
      if (!t || this.researchBlock(t)) t = this.nextTarget(tree, t);
      if (!t) break;
      const give = Math.min(this.costLeft(t), this.rp[tree]);
      this.progress[t] = (this.progress[t] ?? 0) + give;
      this.rp[tree] -= give;
      if (this.costLeft(t) > 0) break;
      this.researched.add(t);
      delete this.progress[t];
    }
    this.target[tree] = t;
    if (save) this.save();
  }
  nextTarget(tree, was) {
    const open = (TREES[tree] ?? []).filter((n) => !this.researchBlock(n.kind));
    return ((was && this.owns(was) && open.find((n) => n.after === was)) || open.sort((a, b) => a.cost - b.cost)[0])?.kind ?? null;
  }
  // research a battery at once: unlimited points (free) only; otherwise the battles' RP research it
  research(kind) {
    if (this.researchBlock(kind) || !(this.free || this.costLeft(kind) === 0)) return false;
    this.researched.add(kind);
    delete this.progress[kind];
    this.settle(eraOfKind(kind));
    return true;
  }

  // ------------------------------------------------------------------ upgrades
  // a part's level (guns: how many), the career's own unless `dev` (dev mode: at the top)
  level(kind, part, dev = this.dev) {
    return dev ? maxedLevels(kind)[part] : levelOf(this.levels[kind], part);
  }
  // the next level's cost in the battery's points, or null at the top
  upgradeCost(kind, part) {
    return nextCost(kind, part, this.level(kind, part, false));
  }
  upgradeBlock(kind, part) {
    if (!this.owns(kind)) return 'research the battery first';
    const c = this.upgradeCost(kind, part);
    if (c == null) return 'at its best';
    const short = this.free ? 0 : c - (this.bp[kind] ?? 0);
    return short > 0 ? `${short.toLocaleString('en-US')} points short` : '';
  }
  upgrade(kind, part) {
    if (this.upgradeBlock(kind, part)) return false;
    if (!this.free) this.bp[kind] -= this.upgradeCost(kind, part);
    const l = (this.levels[kind] ??= {});
    l[part] = this.level(kind, part, false) + 1;
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ the lineup: the batteries taken into battle
  // War Thunder's crew slots: at most SLOTS.map batteries on the map and SLOTS.support off it, chosen in the hangar from
  // the batteries the career has (dev mode: every one). Until the player chooses: the best of each line (the last it
  // has researched), then more field howitzers (the Sperrfeuer's guns), then the heaviest; off the map the dearest.
  // So a new career fields its K 17, and a full one a lineup that can still answer the red rockets.
  lineupKinds(era) {
    const tree = treeOf(era), have = (TREES[tree] ?? []).filter((n) => this.unlocked(n.kind));
    const chosen = this.lineup[tree];
    const auto = (pool, off) => {
      if (off) return [...pool].sort((a, b) => b.cost - a.cost);
      const best = [...new Map(pool.map((q) => [q.line, q])).values()];
      const rest = pool.filter((q) => !best.includes(q)).sort((a, b) => (b.line === 'howitzers') - (a.line === 'howitzers') || b.tier - a.tier || b.cost - a.cost);
      return [...best, ...rest];
    };
    const pick = (off, n) => {
      const pool = have.filter((q) => !!q.offmap === off);
      return (chosen ? chosen.filter((k) => pool.some((q) => q.kind === k)) : auto(pool, off).map((q) => q.kind)).slice(0, n);
    };
    const kinds = [...pick(false, SLOTS.map), ...pick(true, SLOTS.support)];
    return kinds.length || !have.length ? kinds : [have[0].kind];
  }
  inLineup(kind) {
    return this.lineupKinds(eraOfKind(kind)).includes(kind);
  }
  // why a battery cannot join the lineup now ('' when it can, or when it is in it and can leave)
  lineupBlock(kind) {
    const tree = eraOfKind(kind);
    if (!this.unlocked(kind)) return 'research it first';
    const kinds = this.lineupKinds(tree);
    if (kinds.includes(kind)) return kinds.length === 1 ? 'the lineup needs a battery' : '';
    const off = isOffmap(kind), n = kinds.filter((k) => isOffmap(k) === off).length;
    return n >= (off ? SLOTS.support : SLOTS.map) ? (off ? `the off-map slot is taken: leave one out first` : `the lineup is full (${SLOTS.map} batteries): leave one out first`) : '';
  }
  // take a battery into the lineup, or leave it out
  toggleLineup(kind) {
    if (this.lineupBlock(kind)) return false;
    const tree = eraOfKind(kind), kinds = this.lineupKinds(tree);
    this.lineup[tree] = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];
    this.save();
    return true;
  }
  // the batteries that could take a slot of the lineup: had, out of it, on the map or off it as the slot is
  benchOf(era, off) {
    const tree = treeOf(era), kinds = this.lineupKinds(tree);
    return (TREES[tree] ?? []).filter((n) => !!n.offmap === off && this.unlocked(n.kind) && !kinds.includes(n.kind)).map((n) => n.kind);
  }
  // swap a battery of the lineup for one out of it, in its slot (`out` null: into an empty slot)
  swapLineup(out, kind) {
    if (!out) return this.toggleLineup(kind);
    const tree = eraOfKind(kind), kinds = this.lineupKinds(tree);
    if (!kinds.includes(out) || !this.benchOf(tree, isOffmap(out)).includes(kind)) return false;
    this.lineup[tree] = kinds.map((k) => (k === out ? kind : k));
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ the threat levels (threat.js)
  levelUnlocked(era, n) {
    return this.dev || n <= this.threat[treeOf(era)];
  }
  // a level played to its end, won or lost: the next one opens (returns the level opened, or 0); the levels are played
  // in order, so only the highest open one opens another
  playedLevel(era, n) {
    const tree = treeOf(era);
    if (!(tree in this.threat) || n !== this.threat[tree] || n >= MAX_LEVEL) return 0;
    this.threat[tree] = n + 1;
    this.save();
    return n + 1;
  }

  // ------------------------------------------------------------------ the open battle and its pay
  // a battery's levels as it would take the field ({ guns, shells, ... }; dev mode: at its top)
  levelsOf(kind) {
    return Object.fromEntries(LEVEL_KEYS.map((p) => [p, this.level(kind, p)]));
  }
  // every battery the career has (dev mode: all) and its levels, the lineup or not (the hangar)
  ownedLevels(era) {
    return Object.fromEntries((TREES[treeOf(era)] ?? []).filter((n) => this.unlocked(n.kind)).map((n) => [n.kind, this.levelsOf(n.kind)]));
  }
  // the lineup's batteries and their levels ({ kind: { guns, shells, ... } }; era: a game era or a tree)
  lineupLevels(era) {
    return Object.fromEntries(this.lineupKinds(era).map((k) => [k, this.levelsOf(k)]));
  }
  // what main hands newGame for an open battle: { loadout, opposition }
  battle(era) {
    const levels = this.lineupLevels(era);
    return { loadout: loadoutOf(levels), opposition: opposition(era, levels) };
  }
  // pay as it is earned in battle ({ rp, batteries: { kind: points } }): the RP to the research target, each battery's
  // points to it; `save` false lets the page gather a few kills before writing
  gain(era, r, save = true) {
    const tree = treeOf(era);
    if (!(tree in this.rp) || !r) return false;
    for (const [k, v] of Object.entries(r.batteries ?? {})) if (nodeOf(k) && v > 0) this.bp[k] = (this.bp[k] ?? 0) + v;
    this.rp[tree] += Math.max(0, Math.round(r.rp ?? 0));
    this.settle(tree, save);
    return true;
  }
  // a battle's pay (research.js battleReward) into the career at once, and the battle counted
  reward(era, r) {
    if (!r || !this.gain(era, r, false)) return false;
    this.battles[treeOf(era)]++;
    this.save();
    return true;
  }
  // a battle fought (its pay went in with gain as it was earned)
  countBattle(era) {
    const tree = treeOf(era);
    if (!(tree in this.battles)) return;
    this.battles[tree]++;
    this.save();
  }

  // ------------------------------------------------------------------ the campaign missions: one-off RP challenges
  // every mission is open from the start, in any order
  canPlay(id) {
    return !!missionById(id);
  }
  // a mission won: the first win pays its RP bonus to its tree's research target (the RP, or 0 when it was won before)
  complete(id) {
    const m = missionById(id);
    if (!m || this.completed.has(id)) return 0;
    this.completed.add(id);
    const bonus = missionBonus(m);
    this.addRP(m.era, bonus);
    return bonus;
  }

  save() {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(SAVE_KEY, JSON.stringify({ completed: [...this.completed], rp: this.rp, target: this.target, progress: this.progress,
        researched: [...this.researched], bp: this.bp, levels: this.levels, battles: this.battles, lineup: this.lineup, threat: this.threat,
        dev: this.dev, devSet: this.devSet, free: this.free }));
      this.saved = true;
    } catch { this.saved = false; }
  }
  // dev mode: every battery researched and at its top in the open battles, for testing (saved in this browser like the rest)
  setDev(on) { this.dev = !!on; this.devSet = true; this.save(); }
  // unlimited points: research and upgrades free, for testing (the points earned keep adding up underneath)
  setFree(on) { this.free = !!on; this.save(); }
  // back to a new career: no research, upgrades, points or battles, the campaign missions unwon (their RP bonus can be
  // won again); the dev and unlimited points switches stay as they are
  reset() {
    this.completed.clear();
    this.researched.clear();
    for (const e of Object.keys(this.rp)) { this.rp[e] = 0; this.battles[e] = 0; this.target[e] = null; this.lineup[e] = null; this.threat[e] = 1; }
    this.progress = {};
    this.bp = {};
    this.levels = {};
    for (const e of Object.keys(TREES)) this.settle(e, false);
    this.save();
  }
  unlockAll() { this.setDev(true); }
}

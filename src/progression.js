import { BATTERIES, CAMPAIGN, missionById } from './campaign-data.js';
import { TREES, TREE_OF, RANK_GATE, nodeOf, needsOf, weightOf, eraOfKind, nextCost, levelOf, maxedLevels, maxGuns, loadoutOf, opposition, missionBonus, specialBonus, PARTS, LEVELS, isOffmap, firstWinRP, overmatchCut, TOP_PART_WIN, isStartKind, START_GUNS, START_KINDS, OUT_OF_TREE, levelCost } from './research.js';
import { SLOTS, MAX_LEVEL } from './threat.js';
const ROMAN = ['I', 'II', 'III', 'IV'];
export { BATTERIES };
// v4: one German tree and a research target (research.js); the saves before it are not carried over (a new career)
export const SAVE_KEY = 'drumfire.campaign.v4';
// dev mode is off until the player switches it on (it was on by default for the draft builds until 2026-10-29)
export const DEV_DEFAULT = false;
const LEVEL_KEYS = ['guns', ...PARTS.map((p) => p.id)];
const treeOf = (era) => TREE_OF[era] ?? era;
// the starting batteries of the saves written before `start` was saved (they owned these without researching them)
const OLD_START = ['k17'];
// The batteries taken out of the game (2026-11-26, research.js OUT_OF_TREE, `to` the battery that inherits): a save's
// RP in them come back, its battery points go to the heir with what its upgrades cost (at the cut battery's own
// prices), so nothing earned is lost. The 25 cm schwerer Minenwerfer (2026-11-02) gave back its RP alone.
// MERGED: the two whose heir takes their place itself, guns, parts and slot in the lineup: the starting Ringkanone C/92
// (2026-11-01 to 2026-11-26) into the sFH 13, and the Gamma into Bertha, whose research it also is (`research`: a save
// that had the Gamma has Bertha; its RP come back only when it had Bertha as well)
const MERGED = { rk92: { research: false }, gamma: { research: true } };
const REMOVED = { smw: { tree: 'de', cost: 300 }, ...Object.fromEntries(Object.entries(OUT_OF_TREE).filter(([k]) => !MERGED[k]?.research).map(([k, o]) => [k, { tree: 'de', cost: o.cost }])) };
// batteries a career now owns from the start (research.js START_KINDS) that an older save had to research, and what
// they cost then: the RP a save put into them come back (the FK 16 and the sFH 13, starters since 2026-11-26)
const NOW_FREE = { fk16: { tree: 'de', cost: 300 }, sfh13: { tree: 'de', cost: 450 } };
// batteries whose research cost fell, and what a save paid before: the difference comes back (Bertha at the Gamma's
// 2,400 since the merge, 2,800 before)
const REPRICED = { bertha: { tree: 'de', was: 2800 } };
// the saves' mark: 4 the 20-battery tree (2026-11-26, the cuts and the merge), 3 careers begun with the FK 16 and the
// sFH 13 (the same day, before the cuts), 2 with the C/92 (2026-11-01), none with the K 17
const START = 4, MARK_STARTERS = 3;
// (the starting batteries' first guns, research.js START_GUNS: a career with fewer is brought up to them)
export { START_GUNS };
// the trees whose open battle is played at the threat levels (the top part level waits for a win at TOP_PART_WIN there)
const LEVELLED = new Set(['de']);

// The career, per tree: the research points put into each battery (`progress`), the battery the battles' RP go to
// (`target`, always one while anything is left to research), the batteries researched, each battery's points and the
// levels of its parts, the campaign missions won, the threat levels won (`wins`: how often each). RP left over when
// nothing is left to research wait in `rp`. Dev mode lays every battery researched and at its top over it for the open
// battles; the career underneath still earns and is what the player sees again with dev mode off.
export class Progression {
  constructor(storage) {
    this.storage = storage;
    this.completed = new Set();
    this.specials = new Set(); // the special missions won (menuItems.js keys: op:v2, ww1:paris); the first win pays
    this.rp = Object.fromEntries(Object.keys(TREES).map((e) => [e, 0]));
    this.target = Object.fromEntries(Object.keys(TREES).map((e) => [e, null]));
    this.progress = {};
    this.researched = new Set();
    this.bp = {};
    this.levels = {};
    this.battles = Object.fromEntries(Object.keys(TREES).map((e) => [e, 0])); // open battles paid, per tree
    this.lineup = Object.fromEntries(Object.keys(TREES).map((e) => [e, null])); // the batteries chosen for battle (null: picked for you)
    this.threat = Object.fromEntries(Object.keys(TREES).map((e) => [e, 1])); // the highest threat level unlocked
    this.wins = Object.fromEntries(Object.keys(TREES).map((e) => [e, {}])); // the threat levels won: { level: times }
    this.dev = DEV_DEFAULT;
    this.devSet = false; // the player's own switch, kept over the default
    this.free = false; // unlimited points (a testing switch): research and upgrades cost nothing, the tree order still holds
    this.saved = !!storage;
    try {
      const data = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
      for (const m of CAMPAIGN) if (Array.isArray(data?.completed) && data.completed.includes(m.id)) this.completed.add(m.id);
      for (const k of data?.specials ?? []) if (typeof k === 'string') this.specials.add(k);
      const mark = data ? +data.start || 0 : START;
      for (const k of data?.researched ?? []) if (nodeOf(k) && !this.isStart(k)) this.researched.add(k);
      // a career begun before the Ringkanone C/92 headed the guns' line (2026-11-01) started with the K 17: it keeps it
      if (data && !data.start) for (const k of OLD_START) if (nodeOf(k) && !this.isStart(k)) this.researched.add(k);
      for (const e of Object.keys(this.rp)) this.rp[e] = Math.max(0, Math.round(+data?.rp?.[e] || 0));
      const back = (tree, n) => { if (n > 0 && tree in this.rp) this.rp[tree] += Math.round(n); };
      // a battery taken out of the game (REMOVED), or one a career now has from the start (NOW_FREE, saves from before
      // it): the RP put into it come back
      const refund = (table) => {
        for (const [k, { tree, cost }] of Object.entries(table)) back(tree, data?.researched?.includes(k) ? cost : Math.min(cost, +data?.progress?.[k] || 0));
      };
      refund(REMOVED);
      if (data && mark < MARK_STARTERS) refund(NOW_FREE);
      // a battery whose research cost fell (REPRICED): what a save paid over the new cost comes back
      if (data && mark < START) for (const [k, { tree, was }] of Object.entries(REPRICED)) if (data.researched?.includes(k) && nodeOf(k)) back(tree, was - nodeOf(k).cost);
      for (const [k, v] of Object.entries(data?.progress ?? {})) if (nodeOf(k) && !this.isStart(k)) this.progress[k] = Math.max(0, Math.round(+v || 0));
      // a merged battery's research (MERGED `research`: the Gamma's): its heir is researched with it, or, the heir had
      // already, its RP come back; RP put into it go on into its heir
      for (const [k, { research }] of Object.entries(MERGED)) {
        const to = OUT_OF_TREE[k]?.to, tree = eraOfKind(to), cost = OUT_OF_TREE[k]?.cost ?? 0;
        if (!research || !tree || nodeOf(k)) continue;
        if (data?.researched?.includes(k)) { if (this.researched.has(to)) back(tree, cost); else { this.researched.add(to); delete this.progress[to]; } }
        else if (+data?.progress?.[k] > 0) {
          const put = Math.min(cost, +data.progress[k]);
          if (this.researched.has(to)) back(tree, put); else this.progress[to] = (this.progress[to] ?? 0) + Math.round(put);
        }
      }
      // (RP put into a battery past its cost, now that some cost less, come back; settle researches it)
      for (const [k, v] of Object.entries(this.progress)) { const over = v - (nodeOf(k)?.cost ?? v); if (over > 0) { back(eraOfKind(k), over); this.progress[k] = v - over; } }
      // (a target on a merged battery is its heir; on a cut one, settle picks the next)
      for (const e of Object.keys(this.target)) {
        const t = MERGED[data?.target?.[e]] && !nodeOf(data.target[e]) ? OUT_OF_TREE[data.target[e]].to : data?.target?.[e];
        if (nodeOf(t) && eraOfKind(t) === e) this.target[e] = t;
      }
      for (const [k, v] of Object.entries(data?.bp ?? {})) if (nodeOf(k)) this.bp[k] = Math.max(0, Math.round(+v || 0));
      const levelsIn = (l) => Object.fromEntries(LEVEL_KEYS.filter((p) => Number.isInteger(l?.[p])).map((p) => [p, l[p]]));
      for (const [k, l] of Object.entries(data?.levels ?? {})) if (nodeOf(k)) this.levels[k] = levelsIn(l);
      // a battery cut (OUT_OF_TREE): its battery points go to its heir, and what its upgrades cost (at its own weight's
      // prices) as more points; a merged one's guns and parts go over themselves (MERGED), each the higher of the two
      // where the heir has levels of its own, the lower one's cost as points. And the guns a starting battery now has
      // free (START_GUNS) that a save from before them bought come back as points. So nothing bought is lost
      const cost = (w, p, n) => { let c = 0; for (let h = p === 'guns' ? 1 : 0; h < n; h++) c += levelCost(w, p, h); return c; };
      const paid = {}; // (what the starters' guns cost a save from before START_GUNS)
      if (data && mark < MARK_STARTERS) for (const k of Object.keys(START_GUNS)) if (this.levels[k]) paid[k] = cost(weightOf(k), 'guns', levelOf(this.levels[k], 'guns'));
      for (const [cut, { to, weight }] of Object.entries(OUT_OF_TREE)) {
        if (!nodeOf(to) || nodeOf(cut)) continue;
        const l = levelsIn(data?.levels?.[cut]), have = this.levels[to] ?? {}, merged = {}, whole = !!MERGED[cut];
        let pts = Math.max(0, Math.round(+data?.bp?.[cut] || 0));
        if (Object.keys(l).length) for (const p of LEVEL_KEYS) {
          const a = Math.min(levelOf(l, p), p === 'guns' ? maxGuns(to) : LEVELS), b = levelOf(have, p);
          if (!whole) pts += cost(weight, p, levelOf(l, p));
          else if (p === 'guns') { merged[p] = Math.max(a, b); paid[to] = (paid[to] ?? 0) + cost(weight, p, a); }
          else { merged[p] = Math.max(a, b); pts += cost(weight, p, Math.min(a, b)); }
        }
        if (whole && Object.keys(l).length) this.levels[to] = merged;
        if (pts) this.bp[to] = (this.bp[to] ?? 0) + pts;
      }
      for (const [k, c] of Object.entries(paid)) {
        const n = START_GUNS[k] ?? 1, g = levelOf(this.levels[k], 'guns'), w = weightOf(k), pts = c - (cost(w, 'guns', Math.max(g, n)) - cost(w, 'guns', n));
        if (pts > 0) this.bp[k] = (this.bp[k] ?? 0) + pts;
      }
      for (const e of Object.keys(this.battles)) this.battles[e] = Math.max(0, data?.battles?.[e] | 0);
      // (a lineup naming a battery taken out leaves it out; a merged one's slot goes to its heir, and a lineup left empty
      // fields the sFH 13)
      const heirOf = (k) => (MERGED[k] && !nodeOf(k) ? OUT_OF_TREE[k].to : null);
      for (const e of Object.keys(this.lineup)) if (Array.isArray(data?.lineup?.[e])) {
        const ks = data.lineup[e].map((k) => (heirOf(k) && !data.lineup[e].includes(heirOf(k)) ? heirOf(k) : k));
        this.lineup[e] = [...new Set(ks.filter((k) => eraOfKind(k) === e))];
        if (!this.lineup[e].length && data.lineup[e].length) this.lineup[e] = START_KINDS[e]?.slice(-1) ?? null;
      }
      for (const e of Object.keys(this.threat)) this.threat[e] = Math.max(1, Math.min(MAX_LEVEL, data?.threat?.[e] | 0 || 1));
      // (a save from before the wins were kept has none: its first win at each level pays the bonus)
      for (const e of Object.keys(this.wins)) for (const [n, c] of Object.entries(data?.wins?.[e] ?? {})) if (+n >= 1 && +n <= MAX_LEVEL && (c | 0) > 0) this.wins[e][+n] = c | 0;
      if (data?.devSet) { this.dev = data.dev === true; this.devSet = true; }
      this.free = data?.free === true;
    } catch { this.saved = false; }
    this.startGuns();
    for (const e of Object.keys(TREES)) this.settle(e, false);
  }

  // ------------------------------------------------------------------ research
  // the starting batteries' first guns (START_GUNS): never fewer, whatever the save says
  startGuns() {
    for (const [k, n] of Object.entries(START_GUNS)) if (this.isStart(k) && levelOf(this.levels[k], 'guns') < n) this.levels[k] = { ...this.levels[k], guns: n };
  }
  // a battery the career owns from the start (research.js START_KINDS: the FK 16 and the sFH 13 since 2026-11-26)
  isStart(kind) {
    return !!nodeOf(kind) && isStartKind(kind);
  }
  // the career's own (dev mode aside): the starting battery, or researched
  owns(kind) {
    return this.isStart(kind) || this.researched.has(kind);
  }
  // in the open battles: owned, or every battery in dev mode
  unlocked(kind) {
    return !!nodeOf(kind) && (this.dev || this.owns(kind));
  }
  // what still stands before a battery's research in its line (the one before it), or null
  blockerOf(kind) {
    return needsOf(kind).find((k) => !this.owns(k)) ?? null;
  }
  // a rank still shut to the career (research.js RANK_GATE: so many batteries of the rank before, any line):
  // { rank, need, have }, or null when it is open
  rankGate(kind) {
    const n = nodeOf(kind), tree = eraOfKind(kind), need = RANK_GATE[tree]?.[n?.tier];
    if (!need) return null;
    const have = TREES[tree].filter((q) => q.tier === n.tier - 1 && this.owns(q.kind)).length;
    return have >= need ? null : { rank: n.tier, need, have };
  }
  // why a battery cannot be researched now ('' when it can: the one before it in its line is the career's, its rank open)
  researchBlock(kind) {
    const n = nodeOf(kind);
    if (!n) return 'not in a research tree';
    if (this.owns(kind)) return 'researched';
    const b = this.blockerOf(kind);
    if (b) return `research the ${BATTERIES.find((q) => q.kind === b)?.name ?? b} first`;
    const g = this.rankGate(kind);
    if (g) return `rank ${ROMAN[g.rank - 1]} opens with ${g.need} rank ${ROMAN[g.rank - 2]} batteries (${g.have} so far)`;
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
  // why the next level of a part waits for a battle ('' when it does not): the top level (research.js LEVELS) opens with
  // a win at threat level TOP_PART_WIN or higher, as Helldivers 2's super samples; dev mode and unlimited points open it
  partGate(kind, part) {
    const tree = eraOfKind(kind);
    if (part === 'guns' || this.dev || this.free || !LEVELLED.has(tree) || this.level(kind, part, false) + 1 < LEVELS) return '';
    return this.topPartsOpen(tree) ? '' : `win a level ${TOP_PART_WIN} battle`;
  }
  // a win at TOP_PART_WIN or higher in the tree's open battle
  topPartsOpen(era) {
    return this.levelWins(era).some((n) => n >= TOP_PART_WIN);
  }
  upgradeBlock(kind, part) {
    if (!this.owns(kind)) return 'research the battery first';
    const c = this.upgradeCost(kind, part);
    if (c == null) return 'at its best';
    const gate = this.partGate(kind, part);
    if (gate) return gate;
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
  // So a new career fields its sFH 13 and FK 16, and a full one a lineup that can still answer the red rockets.
  lineupKinds(era) {
    const tree = treeOf(era), have = (TREES[tree] ?? []).filter((n) => this.unlocked(n.kind));
    const chosen = this.lineup[tree];
    const auto = (pool, off) => {
      if (off) return [...pool].sort((a, b) => b.cost - a.cost);
      const best = [...new Map(pool.map((q) => [q.line, q])).values()];
      const rest = pool.filter((q) => !best.includes(q)).sort((a, b) => (b.line === 'howitzers') - (a.line === 'howitzers') || weightOf(b.kind) - weightOf(a.kind) || b.cost - a.cost);
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
  // put a battery in a given slot of its row (on the map or off it, 0-based; the order the battle's number keys and
  // tabs follow): one out of the lineup takes that slot (the battery in it leaves the lineup) or, the slot empty, the
  // row's first empty one; one in the lineup changes places with the battery in that slot
  placeLineup(kind, index) {
    if (!this.unlocked(kind)) return false;
    const tree = eraOfKind(kind), off = isOffmap(kind), kinds = this.lineupKinds(tree);
    const row = kinds.filter((k) => isOffmap(k) === off), rest = kinds.filter((k) => isOffmap(k) !== off), from = row.indexOf(kind);
    if (!(index >= 0 && index < (off ? SLOTS.support : SLOTS.map))) return false;
    if (from >= 0) {
      if (index === from || index >= row.length) return false; // (a battery in the lineup moves only onto another)
      [row[from], row[index]] = [row[index], row[from]];
    } else if (index < row.length) row[index] = kind;
    else row.push(kind);
    this.lineup[tree] = off ? [...rest, ...row] : [...row, ...rest];
    this.save();
    return true;
  }
  // a battery's slot in the lineup ({ off, i }, i 0-based in its row), or null
  slotOf(kind) {
    const off = isOffmap(kind), i = this.lineupKinds(eraOfKind(kind)).filter((k) => isOffmap(k) === off).indexOf(kind);
    return i < 0 ? null : { off, i };
  }

  // ------------------------------------------------------------------ the threat levels (threat.js)
  // every level is open from the start (they were once played in order; `threat` still records the highest reached)
  levelUnlocked(era, n) {
    return n >= 1 && n <= MAX_LEVEL;
  }
  // a level played to its end, won or lost: the record of the highest reached moves on (returns it, or 0)
  playedLevel(era, n) {
    const tree = treeOf(era);
    if (!(tree in this.threat) || n !== this.threat[tree] || n >= MAX_LEVEL) return 0;
    this.threat[tree] = n + 1;
    this.save();
    return n + 1;
  }
  // a level won (main.js at the battle's end, with playedLevel): counted, and the first win pays its bonus (research.js
  // firstWinRP) to the research target; returns the bonus, 0 when the level was won before
  wonLevel(era, n) {
    const tree = treeOf(era), w = this.wins[tree];
    if (!w || !(n >= 1 && n <= MAX_LEVEL)) return 0;
    const bonus = w[n] ? 0 : firstWinRP(n);
    w[n] = (w[n] ?? 0) + 1;
    if (bonus) this.addRP(tree, bonus); else this.save();
    return bonus;
  }
  // the levels the career has won, lowest first
  levelWins(era) {
    return Object.keys(this.wins[treeOf(era)] ?? {}).map(Number).filter((n) => this.wins[treeOf(era)][n] > 0).sort((a, b) => a - b);
  }
  // the RP the first win at level n would pay (0 when it is won)
  firstWinBonus(era, n) {
    const w = this.wins[treeOf(era)];
    return w && n >= 1 && n <= MAX_LEVEL && !w[n] ? firstWinRP(n) : 0;
  }
  // The lineup's rating: the highest level it can carry (capability.js recommendedLevel on lineupLevels, so dev mode's
  // lineup in dev mode; a battery lent for a battle is not in it), or null without a rater. `Progression.rater` is
  // capability.js's recommendedLevel: the menu sets it at once, and this module imports it late (below) so the loading
  // screen (ui/loading.js), which reads the career, shows before capability.js and the sim's tables are loaded.
  rating(era) {
    const rate = Progression.rater, tree = treeOf(era);
    if (!rate || !LEVELLED.has(tree)) return null;
    const lv = this.lineupLevels(tree), key = JSON.stringify(lv);
    if (this._rated?.key !== key || this._rated.rate !== rate) this._rated = { key, rate, n: rate(lv) };
    return this._rated.n;
  }
  // the overmatch cut on the battle's pay at level n (research.js overmatchCut): 1 down to two levels below the
  // lineup's rating, 0.75 at three, 0.5 at four or more; 1 without a rating. main.js hands it to battleReward (`cut`)
  overmatch(era, n) {
    return overmatchCut(this.rating(era), n);
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
  // points to it; `save` false lets the page gather a few kills before writing. A lent battery's entry (research.js
  // lentKey, `lent:<kind>`) is research points only: it is in `rp`, and no battery of the tree gets its points
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
  // a special mission won (its menu key and its weapon): the first win pays half the weapon's research cost to the
  // German tree's research target; 0 when it was won before
  completeSpecial(key, kind) {
    if (!key || this.specials.has(key)) return 0;
    this.specials.add(key);
    const bonus = specialBonus(kind);
    this.addRP('de', bonus);
    return bonus;
  }

  save() {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(SAVE_KEY, JSON.stringify({ completed: [...this.completed], specials: [...this.specials], rp: this.rp, target: this.target, progress: this.progress,
        researched: [...this.researched], bp: this.bp, levels: this.levels, battles: this.battles, lineup: this.lineup, threat: this.threat,
        wins: this.wins, dev: this.dev, devSet: this.devSet, free: this.free, start: START }));
      this.saved = true;
    } catch { this.saved = false; }
  }
  // dev mode: every battery researched and at its top in the open battles, for testing (saved in this browser like the rest)
  setDev(on) { this.dev = !!on; this.devSet = true; this.save(); }
  // unlimited points: research and upgrades free, for testing (the points earned keep adding up underneath)
  setFree(on) { this.free = !!on; this.save(); }
  // back to a new career: no research, upgrades, points or battles, the campaign missions and the threat levels unwon
  // (their RP bonuses can be won again); the dev and unlimited points switches stay as they are
  reset() {
    this.completed.clear();
    this.specials.clear();
    this.researched.clear();
    for (const e of Object.keys(this.rp)) { this.rp[e] = 0; this.battles[e] = 0; this.target[e] = null; this.lineup[e] = null; this.threat[e] = 1; this.wins[e] = {}; }
    this.progress = {};
    this.bp = {};
    this.levels = {};
    this.startGuns();
    for (const e of Object.keys(TREES)) this.settle(e, false);
    this.save();
  }
  unlockAll() { this.setDev(true); }
}
// the lineup's rating for the overmatch cut (rating): capability.js recommendedLevel, set by the menu at once and here
// when capability.js has loaded (a dynamic import: the loading screen imports this module and must not wait for it)
Progression.rater = null;
import('./capability.js').then((m) => { Progression.rater ??= m.recommendedLevel; }).catch(() => {});

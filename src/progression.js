import { BATTERIES, CAMPAIGN, missionById } from './campaign-data.js';
import { TREES, nodeOf, eraOfKind, nextCost, levelOf, maxedLevels, loadoutOf, opposition, missionBonus, PARTS } from './research.js';
export { BATTERIES };
// v3: research and upgrades (research.js); v2 (completed missions) is read once and carried over
export const SAVE_KEY = 'drumfire.campaign.v3';
export const OLD_KEY = 'drumfire.campaign.v2';
// dev mode is on until the player switches it off (the user's call for the draft builds; false again when they say so)
export const DEV_DEFAULT = true;
const LEVEL_KEYS = ['guns', ...PARTS.map((p) => p.id)];

// The career: research points per era, the batteries researched, each battery's points and the levels of its parts,
// the campaign missions won. Dev mode lays every battery researched and at its top over it for the open battles; the
// career underneath still earns and is what the player sees again with dev mode off.
export class Progression {
  constructor(storage) {
    this.storage = storage;
    this.completed = new Set();
    this.rp = Object.fromEntries(Object.keys(TREES).map((e) => [e, 0]));
    this.researched = new Set();
    this.bp = {};
    this.levels = {};
    this.battles = Object.fromEntries(Object.keys(TREES).map((e) => [e, 0])); // open battles paid, per era
    this.dev = DEV_DEFAULT;
    this.devSet = false; // the player's own switch, kept over the default
    this.free = false; // unlimited points (a testing switch): research and upgrades cost nothing, the tree order still holds
    this.saved = !!storage;
    try {
      let data = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
      if (!data) {
        // a v2 save: its missions stay won and the batteries they earned stay researched (no RP for them)
        const old = JSON.parse(storage?.getItem(OLD_KEY) || 'null');
        if (old) data = { ...old, researched: (old.completed ?? []).map((id) => missionById(id)?.reward).filter((k) => nodeOf(k)) };
      }
      for (const m of CAMPAIGN) if (Array.isArray(data?.completed) && data.completed.includes(m.id)) this.completed.add(m.id);
      for (const k of data?.researched ?? []) if (nodeOf(k)?.tier > 1) this.researched.add(k);
      for (const e of Object.keys(this.rp)) this.rp[e] = Math.max(0, Math.round(+data?.rp?.[e] || 0));
      for (const [k, v] of Object.entries(data?.bp ?? {})) if (nodeOf(k)) this.bp[k] = Math.max(0, Math.round(+v || 0));
      for (const [k, l] of Object.entries(data?.levels ?? {})) if (nodeOf(k)) this.levels[k] = Object.fromEntries(LEVEL_KEYS.filter((p) => Number.isInteger(l?.[p])).map((p) => [p, l[p]]));
      for (const e of Object.keys(this.battles)) this.battles[e] = Math.max(0, data?.battles?.[e] | 0);
      // a save from before the default had dev true only where the player switched it on
      if (data?.devSet || data?.dev === true) { this.dev = data.dev === true; this.devSet = true; }
      this.free = data?.free === true;
      if (!data && JSON.parse(storage?.getItem('drumfire.command-career.v1') || 'null')?.dev === true) this.dev = true;
    } catch { this.saved = false; }
  }

  // ------------------------------------------------------------------ research
  // the career's own (dev mode aside): the era's tier I battery, or researched
  owns(kind) {
    const n = nodeOf(kind);
    return !!n && (n.tier === 1 || this.researched.has(kind));
  }
  // in the open battles: owned, or every battery in dev mode. A kind outside the trees (the V-weapons) fires only in
  // its own operation, open to all.
  unlocked(kind) {
    return !!BATTERIES.find((b) => b.kind === kind) && (this.dev || this.owns(kind) || (!nodeOf(kind) && this.completed.has(`earn-${kind}`)));
  }
  // why a battery cannot be researched now ('' when it can)
  researchBlock(kind) {
    const n = nodeOf(kind);
    if (!n) return 'not in a research tree';
    if (this.owns(kind)) return 'researched';
    if (n.after && !this.owns(n.after)) return `research the ${BATTERIES.find((b) => b.kind === n.after)?.name ?? n.after} first`;
    const short = this.free ? 0 : n.cost - this.rp[eraOfKind(kind)];
    return short > 0 ? `${short.toLocaleString('en-US')} RP short` : '';
  }
  research(kind) {
    if (this.researchBlock(kind)) return false;
    if (!this.free) this.rp[eraOfKind(kind)] -= nodeOf(kind).cost;
    this.researched.add(kind);
    this.save();
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

  // ------------------------------------------------------------------ the open battle and its pay
  // the era's batteries in the field and their levels ({ kind: { guns, shells, ... } })
  lineupLevels(era) {
    return Object.fromEntries((TREES[era] ?? []).filter((n) => this.unlocked(n.kind))
      .map((n) => [n.kind, Object.fromEntries(LEVEL_KEYS.map((p) => [p, this.level(n.kind, p)]))]));
  }
  // what main hands newGame for an open battle: { loadout, opposition }
  battle(era) {
    const levels = this.lineupLevels(era);
    return { loadout: loadoutOf(levels), opposition: opposition(era, levels) };
  }
  // a battle's pay (research.js battleReward) into the career: the RP to the era, each battery's points to it
  reward(era, r) {
    if (!(era in this.rp) || !r) return false;
    this.rp[era] += r.rp;
    for (const [k, v] of Object.entries(r.batteries)) if (nodeOf(k) && v > 0) this.bp[k] = (this.bp[k] ?? 0) + v;
    this.battles[era]++;
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ the campaign missions: one-off RP challenges
  // every mission is open from the start, in any order
  canPlay(id) {
    return !!missionById(id);
  }
  // a mission won: the first win pays its RP bonus to its era (the RP, or 0 when it was won before)
  complete(id) {
    const m = missionById(id);
    if (!m || this.completed.has(id)) return 0;
    this.completed.add(id);
    const bonus = missionBonus(m);
    this.rp[m.era] = (this.rp[m.era] ?? 0) + bonus;
    this.save();
    return bonus;
  }

  save() {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(SAVE_KEY, JSON.stringify({ completed: [...this.completed], rp: this.rp, researched: [...this.researched],
        bp: this.bp, levels: this.levels, battles: this.battles, dev: this.dev, devSet: this.devSet, free: this.free }));
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
    for (const e of Object.keys(this.rp)) { this.rp[e] = 0; this.battles[e] = 0; }
    this.bp = {};
    this.levels = {};
    this.save();
  }
  unlockAll() { this.setDev(true); }
}

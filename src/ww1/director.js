// The WW1 German mode's director: the WW2 Flanders battle's day (missions, Sperrfeuer, Störungsfeuer, the Feuerwalze)
// in 1918 terms on the turned-round map. Einschießen at dawn on the first targets; the Artilleriekampf against the
// British heavies in their pits (Gegenbatterie when they fire, the sound and flash rangers finding them); the British
// attack, called by red flares from our front (Sperrfeuer); night and Störungsfeuer on their roads and the railhead;
// X-Zeit: a short Bruchmüller-style Feuervorbereitung (a Feuerüberfall on every British battery that still fires,
// and the first line of the Feuerwalze laid while our infantry forms up), then the Feuerwalze lifted on the
// timetable ahead of our assault. Win: our assault takes the British line; loss: two sectors lost, or every gun.
import { SECTORS, LINES, lineX } from '../sector.js';
import { TARGETS, SHELLS, G, GUNS } from '../sim/tables.js';
import { DirectorWW2, LULL, LAPSE } from '../ww2/director.js';
import { BRIT_BATTERIES } from './targets.js';
import { SUPER_WW1 } from './ops.js';
import { tierOf, siteVerdict } from '../capability.js';
import { isOffmap } from '../research.js';
import { generateOperation } from '../operation.js';
import { Objectives } from '../sim/objectives.js';
import { MIN_HARD } from '../sim/specialists.js';
import { tracks } from '../trenchlines.js';

const OBS_AIR = ['Flieger FA 6', 'Flieger FA 9', 'Flieger FA 213'];
const sectorName = (id) => SECTORS.find((s) => s.id === id).name;
const laneOf = (id) => ({ B: -1200, C: 2400 }[id]);
export const PREP = 180; // the Feuervorbereitung before our infantry goes, s
const GUNS_SHRAPNEL = new Set(['k17', 'lefh18', 'fk16', 'wespe', 'rk92']); // (the leFH 18's Doppelzünder: the career's battle, ops.js RIDGE_WW2; the FK 16 and the Wespe in RIDGE_MORE)
// the share of our assault that must reach the British line (the British game's 50, 60, 70 percent, narrowed: the
// walk behind the Feuerwalze costs about the same on every difficulty, so a wider spread would decide the game by
// the difficulty alone; Easy still forgives a ragged Feuerwalze)
export const ZERO_NEED = { Easy: 0.54, Normal: 0.6, Hard: 0.64 };
export const FIELD = { dur: 60, every: 3.2 }; // the division's field batteries on the Sperrfeuer line

// The threat levels (threat.js, sim.level; the German career's open battle): each battle is one generated mission
// (src/operation.js, sim/objectives.js; DESIGN.md "Missions"), and ends on it, never on the clock:
//   the work     the main objectives' fire missions open one after another (two at a time at most), the secondaries'
//                as they are reported; one whose observer's window closes comes again in a while, and more than the
//                level's `fails` of the mains' failed lose the battle, as does a main no battery left can reach
//   pressure     the attacks come on the day's clock in the mission's sectors (with their laager's tanks unless it is
//                broken up four minutes before), the counter-battery calls when their batteries fire, the traffic at
//                its times, and the lineup's work for an idle battery (a target of opportunity: pay, and noise)
//   accomplished every main target done: the player ends the battle when ready (callFinale, main's K or the HUD's
//                button), or calls X-Zeit when the mission has it, whose assault decides it; their counter-battery fire
//                grows each minute meanwhile, and a lineup all on auto ends it after a quiet minute
// Two sectors lost or every gun lost end any battle at once, as always. The day's clock (pace): on through a lull to
// the next thing on it, never past X-Zeit before it is called. The level's sites only (its `sites`, capability.js
// tierOf); one no battery of the lineup can finish goes to the neighbouring Gruppe (a radio line, no pay, no penalty).
const ZERO_T = 1850; // X-Zeit on the day's clock (ops.js phase 5)
const TANK_K = 1.3;
const LAAGER = { A: 'T1', B: 'T1', C: 'T2', D: 'T2' };
const NO_HANDOFF = new Set(['bconvoy', 'railyard']); // the traffic: a chance in passing, never handed on
// a battery with a round loaded, shells at the guns or its ammunition column coming (guns.js resupply)
const armed = (u) => u.pieces.some((p) => p.state !== 'dead' && p.loaded) || (u.ammo?.he ?? 0) + (u.ammo?.shrapnel ?? 0) > 0 || (u.def?.resupply ?? (u.def?.special ? 0 : 1)) > 0;
const REOPEN = 45; // s before a main's failed fire mission comes again
const MAIN_LIVE = 2; // the main objectives' fire missions open at once
const SPACING = 40; // s between two objectives' missions opening
const ROLE_WINDOW = 900; // s: a deep or concrete objective's window (the specialists' own missions have 1500: a failure took half an hour)
// the objectives of the moment (a level's mission): the duel, a British battery that has one of ours under its fire
// (from a counter-battery rate of DUEL_CB, level 3), offered when its fix is firm enough to tell (DUEL_LOCK: about 200
// m off) and to be silenced within DUEL_T s, one at a time, DUEL_GAP s apart; counter-preparation, an attack's men
// massing in their front line MASS_T s before they go over, called off with PREP_BREAK of them down
const DUEL = { cb: 0.5, lock: 0.45, t: 300, gap: 300 };
// (a battery of field howitzers ranging on the trench and firing for effect puts about a fifth of the men down in two
// and a half minutes, 2026-11-12: a quarter in three is a battery's work done well, more with two)
const MASS_T = 180, PREP_BREAK = 0.25;
// targets of opportunity: by day, every few minutes (`first`, then `gap` s after one ends, give or take a third), an
// observer reports a relief column halted on a road behind their line, men in the open for `t` s before it marches on;
// a third of it down and it scatters. Never on top of an attack or another objective of the moment (the research's
// middle of a battle: an attack and its counter-preparation, a pop-up target, a duel), and it never holds the day's
// lull (pace). (Waiting for a lull in the objectives' work found none: the mains are open from the start)
const POP = { first: 360, t: 180, gap: 300, down: 0.3, men: [36, 56] };
// the roads the ground paints (trenchlines.js), the stretches behind their line where a column may halt
let ROAD_SPOTS = null;
const roadSpots = () => (ROAD_SPOTS ??= tracks().filter((t) => t.kind === 'road').flatMap((r, ri) => r.pts.flatMap((p, i) => {
  const q = r.pts[Math.min(r.pts.length - 1, i + 6)];
  return i % 25 === 0 && p.x > -2600 && p.x < 1900 && q !== p ? [{ x: p.x, z: p.z, b: Math.atan2(q.x - p.x, -(q.z - p.z)), road: ri }] : [];
})));
// the railway-gun hunt (a mission that deals it, 'railgun'): the British 18-inch railway howitzer (site G5) comes up
// to its firing point after `away` s, fires up to `salvos` rounds there (its own cadence, ww1/enemy.js) or stays
// `stay` s at most, then withdraws out of sight (present false: not drawn, no damage, sim/targets.js) for the next
// `away`; each round it fires firms the sound rangers' fix on the point (`err` m at first, times `k` a round, `min`
// at best). The hunt's fire mission is laid on the fix: lay on it, and catch the gun when it fires again; 40% of its
// strength gone knocks it out (spent). A secondary that pays double (src/operation.js); were it a main, each visit it
// survived with the fix within `fair` m would count as a failed fire mission
const HUNT = { first: [150, 270], away: [240, 360], salvos: 3, stay: 240, err: 320, k: 0.62, min: 35, fair: 80 };
// their fix on our battery (ww1/enemy.js): the error of their counter-battery rounds, m, for a lock 0 to 1
export const fixOf = (lock) => Math.round(35 + 400 * Math.pow(1 - Math.min(1, Math.max(0, lock)), 1.3));
const QUIET_END = 120; // s without an objective moving before a lineup all on auto ends an accomplished battle
const PRESSURE = { perMin: 0.2, max: 3 }; // their counter-battery fire after the mission is accomplished
const THIN = 0.85; // an attack's size for each objective done that thins them (the HQ, a shelter, the corps HQ), 0.6 at least
export const TRAFFIC_CUT = { k: 0.85, dur: 300 }; // their supply after a train or a convoy is wrecked (ww1/enemy.js)
// the traffic on a level's day: [day's time, 'convoy' | 'train']
const TRAFFIC = [[200, 'convoy'], [420, 'train'], [700, 'convoy'], [950, 'train'], [1200, 'convoy'], [1450, 'train'], [1700, 'convoy']];
const IDENTITY = { dmg: 1, disp: 1, load: 1, ammo: 1 };
// the guns that fire the Feuerwalze on a threat level (the 1918 fire plans: the field guns and the field howitzers;
// the mortars and the long guns stay on the batteries and the depots), and how far beyond the line each lays its
// rounds so that its shorts fall clear of our men, 85 m behind the line: two and a half spreads and its lethal
// radius less 40 m
export const FEUERWALZE = new Set(['k17', 'sfh13', 'lefh18', 'sfh18', 'fk16', 'wespe', 'hummel', 'rk92', 'sfh93']);
export function walzeMargin(u, x, z) {
  const g = GUNS[u.kind], sc = SHELLS[g?.shell ?? u.kind];
  if (!g || !sc) return 0;
  const D = Math.hypot(x - u.pos.x, z - u.pos.z), k = u.mods?.disp ?? 1;
  // (shrapnel bursts in the air ahead of its fall, 22 m either way of its fuze, and reaches 30 m: sim/infantry.js)
  const shr = u.order?.fuze === 'shrapnel';
  const sr = Math.hypot(g.disp.r * D * k, 2.4 * g.calib.v * D, 12, shr ? 22 : 0);
  return Math.max(0, 2.5 * sr + (shr ? 30 : sc.lethal) - 40);
}

export class DirectorWW1 extends DirectorWW2 {
  reset() {
    const sim = this.sim, L = sim.level;
    // a threat level's mission (src/operation.js: its objectives, the attacks' sectors, X-Zeit or not), dealt from the
    // level, the menu's seed and the lineup's batteries, before the day's script is built from it (super.reset)
    // (the lineup's batteries in the field, for the capability check, capability.js)
    this.bats = sim.units.filter((u) => !isOffmap(u.kind)).map((u) => ({ kind: u.kind, guns: u.pieces.length, mods: u.mods ?? IDENTITY, pos: u.pos }));
    const battle = !!L && this.op.kind === 'battle';
    sim.operation = battle ? generateOperation(L.n, sim.opSeed ?? sim.seed, this.bats) : null;
    sim.objectives = sim.operation ? new Objectives(sim, sim.operation) : null;
    sim.objectivePay = 0;
    this.reopen = []; // [{ at, id }]: an objective whose mission failed, its next mission
    this.objAt = 0; // the next objective's mission opens no sooner (objectiveMissions)
    this.trafficCut = 0; // their supply held up by a train or convoy wrecked until then (ww1/enemy.js supply)
    this.duelAt = 0; // no new duel before then
    this.massed = new Map(); // an attack's day time -> its assault massing in their front line (counter-preparation)
    this.popAt = POP.first; // no target of opportunity before then (set again from the battle's random stream at its first)
    this.hunt = null; // the railway-gun hunt (HUNT): { t, up, next, upAt, shots, err, fired }
    super.reset();
    this.handedOff = new Set();
    this.verdicts = new Map(); // site id -> whether a battery of the lineup can finish it (canOffer)
    // a level's mission (levelUpdate): accomplished (`closing`), the finale called, the quiet before an all-auto end
    this.lv = battle ? { closing: false, finale: false, quietAt: 0, cb0: sim.difficulty.cb } : null;
    this.noOrders = false; // X-Zeit called: the lineup's day and the specialists give nothing more (sim/lineup.js)
    // the strongpoints in the X-Zeit lanes (ops.js RIDGE_FORTS): the mission's (with X-Zeit only), in their order (one
    // in each lane first); none without a level
    const forts = sim.targets.filter((t) => t.site?.role === 'fort');
    if (forts.length) {
      const gone = new Set(forts.slice(sim.operation?.forts ?? 0).map((t) => t.id));
      sim.targets = sim.targets.filter((t) => !gone.has(t.id));
      for (const id of gone) sim.targetAI.byId.delete(id);
      this.specialists.sites = this.specialists.sites.filter((t) => !gone.has(t.id));
    }
    // the kite balloon (ops.js RIDGE_BALLOON): only in a mission that deals it
    if (!sim.operation?.objectives.some((o) => o.kind === 'balloon')) {
      const gone = new Set(sim.targets.filter((t) => t.kind === 'bballoon').map((t) => t.id));
      if (gone.size) {
        sim.targets = sim.targets.filter((t) => !gone.has(t.id));
        for (const id of gone) sim.targetAI.byId.delete(id);
      }
    }
    if (!battle) return;
    // the railway-gun hunt: the gun withdrawn at the start, its first fix a rough one
    if (sim.operation.objectives.some((o) => o.kind === 'railgun')) {
      const t = sim.targetById('G5');
      if (t) {
        const a = sim.rng() * Math.PI * 2;
        t.present = false;
        t.cbErr = { x: Math.cos(a) * HUNT.err, z: Math.sin(a) * HUNT.err };
        this.hunt = { t, up: false, next: HUNT.first[0] + sim.rng() * (HUNT.first[1] - HUNT.first[0]), upAt: 0, shots: 0, err: HUNT.err, fired: t.firedAt ?? null };
      }
    }
    // (the deep and concrete targets come as the mission's objectives, from the director; the specialists only open
    // the strongpoints, which X-Zeit brings)
    this.specialists.allow = new Set(sim.operation.forts ? ['fort'] : []);
  }

  // every mission made: an objective's is marked (sim/objectives.js tag)
  addMission(spec) {
    const m = super.addMission(spec);
    this.sim.objectives?.tag(m);
    return m;
  }

  finish(m, ok, why = '') {
    if (m.state === 'done' || m.state === 'failed') return;
    super.finish(m, ok, why);
    const sim = this.sim, ob = sim.objectives;
    if (!ob) return;
    // a train or a convoy wrecked holds their supply up for a while (a level's mission only)
    if (ok && m.kind === 'harass') this.trafficCut = sim.time + TRAFFIC_CUT.dur;
    if (!m.obj) return;
    ob.missionEnd(m, ok);
    // an objective's mission failed: another on it in a while, as long as the objective is open
    const o = ob.byId(m.obj);
    if (!ok && o?.state === 'open') {
      this.reopen.push({ at: sim.time + REOPEN, id: o.id });
      if (o.main) sim.radio(`${o.title}: the observers will try again. ${ob.fails} of ${sim.level.fails} failures allowed.`, 'warn');
    }
  }

  // a level's site: one of its kinds of site, and one a battery of the lineup can finish (else the neighbouring
  // Gruppe's: said once a site)
  offers(t) {
    const L = this.sim.level;
    if (!L) return true;
    if (!L.sites.includes(tierOf(t))) return false;
    if (this.canOffer(t)) return true;
    if (!this.handedOff.has(t.id)) {
      this.handedOff.add(t.id);
      this.sim.radio(`Nachbargruppe: ${t.name} is beyond what our batteries can finish; the neighbouring Gruppe takes it.`, 'info');
    }
    return false;
  }

  // the same without a word (the lineup's day asks it of the sites it gives as work, sim/lineup.js pool; it used to
  // pick ones the level does not offer, be refused and leave the battery idle for another 80 s). The verdict per site
  // is kept: the lineup's batteries (this.bats) are fixed for the battle
  canOffer(t) {
    const L = this.sim.level;
    if (!L) return true;
    if (!L.sites.includes(tierOf(t))) return false;
    if (NO_HANDOFF.has(t.kind)) return true;
    const c = this.verdicts;
    if (!c.has(t.id)) c.set(t.id, siteVerdict(this.bats, { kind: t.kind, pos: t.pos, role: t.site?.role ?? null }, { deadlineK: L.deadline }) !== 'no');
    return c.get(t.id);
  }

  obsName(o) {
    const n = ++this.nobs;
    if (o === 'air') return OBS_AIR[n % OBS_AIR.length];
    if (o === 'balloon') return 'Fesselballon';
    if (o === 'sound') return this.sim.night ? 'Lichtmeßtrupp' : 'Schallmeßtrupp';
    if (o === 'map') return 'Kartenschießen';
    if (o === 'railspot') return 'Fliegerbild';
    return `VB ${1 + (n % 6)}`;
  }

  // the day's observers: the Flieger and the balloon by day, the flash rangers by night
  dayObserver(night) {
    // (their sky, a level's modifier 'air': no Flieger for us, a map shoot without reports in its place)
    if (this.sim.modifiers?.has('air')) return this.sim.night ? night : this.sim.rng() < 0.6 ? 'map' : 'balloon';
    return this.sim.night ? night : this.sim.rng() < 0.6 ? 'air' : 'balloon';
  }

  // the fuze the crew sets, one the gun has (the career's Nebelwerfer rockets have only the instant fuze)
  defaultFuze(m, u) {
    const f = this.fuzeFor(m, u);
    return GUNS[u.kind]?.fuzes?.includes(f) ? f : 'instant';
  }

  fuzeFor(m, u) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    // the K 17's shrapnel on men in the open: the Sperrfeuer and the Feuerwalze
    // (a threat level's Feuerwalze: HE, whose shorts the margin can keep clear of our men, walzeMargin)
    if (m.kind === 'barrage' && this.sim.level) return 'instant';
    if (m.kind === 'sos' || m.kind === 'barrage') return GUNS_SHRAPNEL.has(u.kind) ? 'shrapnel' : 'instant';
    if (m.column) return GUNS_SHRAPNEL.has(u.kind) ? 'shrapnel' : 'instant'; // (men in the open on a road)
    if (!t) return 'instant';
    if (t.kind === 'bconvoy' && GUNS_SHRAPNEL.has(u.kind)) return 'shrapnel';
    if (t.kind === 'bballoon') return 'instant'; // (HE on the winch lorry)
    if (t.kind === 'btanks') return 'instant'; // open vehicles on the surface: graze, not buried
    const h = TARGETS[t.kind]?.hardness;
    if (h === 'hard' || t.kind === 'hq' || t.kind === 'bdump' || t.heavy) return 'delay';
    return 'instant';
  }

  assign(u, m) {
    if (u.kind === 'paris') return false; // its target is off the map (special.js)
    const ok = super.assign(u, m);
    // DirectorWW2 spreads the Sperrfeuer over its own super-heavies' set: spread it over ours
    if (ok && (m.kind === 'sos' || m.kind === 'barrage')) {
      const live = this.sim.units.filter((q) => q.alive && !SUPER_WW1.has(q.kind));
      const k = Math.max(0, live.indexOf(u));
      // (a level's Feuerwalze: each gun's rounds laid a margin beyond the line, clear of our men behind it)
      const x = this.sim.level && m.kind === 'barrage' ? m.x - walzeMargin(u, m.x, m.z) : m.x;
      this.sim.guns.setTarget(u, x, m.z, { biasScale: 0.12, fuze: u.order.fuze, sheaf: 55, shift: (k - (live.length - 1) / 2) * 35 });
    }
    // a level's tank laager: the guns laid on one tank at a time (the observer reads against it, observers.js), not on
    // the laager's empty middle
    if (ok && m.aimPart && m.kind === 'destroy') this.sim.guns.setTarget(u, m.x, m.z);
    return ok;
  }

  // each shot (guns.js): the Paris Gun's controller takes its shell over
  onFire(u, p, s) {
    if (u.def?.special) this.sim.special?.onFire?.(u, p, s);
  }

  siteMission(id, over = {}) {
    const sim = this.sim;
    // a threat level's sites only (offers), and none whose mission would be done before a round is fired (spent)
    if (sim.level) { const t0 = sim.targetById(id); if (!t0 || !this.offers(t0) || this.spent(t0)) return null; }
    // a lineup's day may send it to another site, hold it back or leave it out (sim/lineup.js: the German career's)
    if (this.day) { const g = this.day.gate(id, over); if (!g) return null; ({ id, over } = g); }
    const t = sim.targetById(id);
    if (!t) return null;
    if (sim.level && !this.offers(t)) return null; // (the day may have sent it to another site)
    const kind = t.kind;
    let observer = over.observer ?? (kind === 'btanks' || kind === 'bpost' ? 'foo' : this.dayObserver('map'));
    let x = t.pos.x, z = t.pos.z, mkind = over.kind ?? 'destroy', title = over.title ?? `Zerstörungsfeuer: ${t.name}`;
    // (the kite balloon: its winch on the ground, ranged like any target; shells near it haul the balloon down, the
    // winch wrecked brings it down for good. Shrapnel at the balloon itself, 500 m up, missed nearly every time:
    // two C/92s firing at nothing else brought it down in 5 battles of 12, 55 rounds each, 2026-11-12)
    if (kind === 'bballoon' && t.parts[1]) { x = t.parts[1].x; z = t.parts[1].z; }
    if (BRIT_BATTERIES.has(kind)) {
      mkind = over.kind ?? 'cb';
      title = over.title ?? `Gegenbatterie: ${t.name}`;
      observer = over.observer ?? (sim.rng() < 0.5 ? 'sound' : this.dayObserver('sound'));
      if (!t.cbErr) {
        const a = sim.rng() * Math.PI * 2, r = 70 + sim.rng() * 130;
        t.cbErr = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
      x += t.cbErr.x;
      z += t.cbErr.z;
    } else if (kind === 'bconvoy') {
      mkind = 'harass';
      title = over.title ?? 'Störungsfeuer: traffic at Hellfire Corner';
      observer = 'map';
    } else if (kind === 'railyard') {
      mkind = 'harass';
      title = over.title ?? 'Störungsfeuer: a train at the railhead';
      observer = 'railspot';
    } else if (kind === 'bballoon') title = over.title ?? 'Fesselballon: shell the British balloon\'s winch';
    // poor intelligence (a level's modifier): the target only roughly placed until an observer reports on it
    const intel = sim.modifiers?.has('intel') && !BRIT_BATTERIES.has(kind) && kind !== 'bconvoy' && kind !== 'railyard';
    if (intel) {
      if (!t.intelErr) {
        const a = sim.rng() * Math.PI * 2, r = 90 + sim.rng() * 160;
        t.intelErr = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
      if (!t.known) { x += t.intelErr.x; z += t.intelErr.z; }
    } else if (!BRIT_BATTERIES.has(kind)) t.known = true;
    // a level's tank laager: laid on one tank, the next when it is knocked out (missionsUpdate)
    const tank = sim.level && kind === 'btanks' ? this.nextTank(t, x, z) : null;
    if (tank) { x = tank.x; z = tank.z; }
    const m = this.addMission({
      kind: mkind, title, targetId: id, x, z, observer,
      alt: 0,
      deadline: over.deadline ?? { btanks: 700, bdump: 800, bballoon: 600, hq: 800, bconvoy: 150, railyard: 260 }[kind] ?? 700,
      priority: over.priority,
    });
    if (tank) m.aimPart = tank;
    if (intel) m.intel = true;
    return m;
  }

  // a threat level's site already out of action by its rules (missionsUpdate): a British battery silenced (half its
  // guns out, or the base rule), a tank laager broken up (half its tanks out). Its silenced battery's last guns still
  // fire, and watchBatteries opened a Gegenbatterie on it every 200 s that was done at once, unfired: a free mission
  // (about fourteen a game on level 3, most of what its count was met with)
  spent(t) {
    // (the hunted railway gun: knocked out of action with 40% of its strength gone, its mounting wrecked, long before
    // it is destroyed; a single gun found only by sound, it was otherwise never caught)
    if (this.hunt?.t === t && t.alive && t.maxHp && t.hp <= t.maxHp * 0.6) return true;
    if (!this.sim.level || !t?.alive || t.parts.length < 2) return false;
    if (BRIT_BATTERIES.has(t.kind)) return this.sim.targetAI.silenced(t) || this.sim.targetAI.alivePartCount(t) * 2 <= t.parts.length;
    if (t.kind === 'btanks') return this.sim.targetAI.alivePartCount(t) * 2 <= t.parts.length;
    return false;
  }

  // the live tank of a laager nearest a point
  nextTank(t, x, z) {
    let best = null, bd = Infinity;
    for (const p of t.parts) if (p.alive) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // the Paris Gun's rounds on their reserve camp (special.js effect 'attack') send fewer men over
  assault(sec, size) {
    const k = this.sim.special?.effectK?.('attack') ?? 1;
    const a = super.assault(sec, size * k);
    if (a && k < 0.99) this.sim.radio(`Their attack comes thinner than it might: the Paris Gun has held up their reserves (${Math.round((1 - k) * 100)}% fewer).`, 'info');
    return a;
  }

  // the red flares also call the division's own field batteries (7.7 cm FK 16, not the player's): after a minute of
  // telephoning they put a thin curtain of shrapnel and shell on the line for a minute and a half. The Sperrfeuer was
  // their task first; the Gruppe's heavies are what make it hold.
  rockets(a) {
    super.rockets(a);
    const sim = this.sim;
    a.field = { at: sim.time + 25 + sim.rng() * 20, until: 0, next: 0 };
    a.field.until = a.field.at + FIELD.dur;
  }

  fieldFire() {
    const sim = this.sim, now = sim.time;
    for (const a of sim.assaults) {
      const f = a.field;
      if (!f || now < f.at || now > f.until || now < f.next || a.state !== 'called') continue;
      f.next = now + FIELD.every * (0.6 + 0.8 * sim.rng());
      const p = sim.infAI.sosPoint(a, 0.25 + sim.rng() * 0.25);
      const ax = p.x + sim.gauss() * 40, az = p.z + sim.gauss() * 90;
      const x0 = lineX(LINES.germanReserve, az) + 900, z0 = az + sim.gauss() * 300;
      const y0 = sim.heightAt(x0, z0) + 2, yT = sim.heightAt(ax, az);
      const D = Math.hypot(ax - x0, az - z0), T = Math.max(8, Math.min(30, D / 260));
      const vx = (ax - x0) / T, vz = (az - z0) / T, vy = (yT - y0 + 0.5 * G * T * T) / T;
      const shr = sim.rng() < 0.3;
      sim.shells.push({
        id: sim.nextId('s'), own: true, unitId: null, piece: null, kind: 'fk16', calibre: SHELLS.fk16.calibre, field: true,
        pos: { x: x0, y: y0, z: z0 }, prev: { x: x0, y: y0, z: z0 }, vel: { x: vx, y: vy, z: vz },
        fuze: shr ? 'shrapnel' : 'instant', t: 0, t0: now, tof: T, aim: { x: ax, z: az }, alive: true, k: 0, aimY: yT,
        plane: D, pbx: (ax - x0) / D, pbz: (az - z0) / D, ox: x0, oz: z0, fuzeErr: sim.gauss() * 22,
      });
    }
  }

  update(dt) {
    const sim = this.sim;
    super.update(dt);
    if (!sim.scripted) this.fieldFire();
    if (this.lv) { this.duelUpdate(); this.prepUpdate(); this.popUpdate(dt); this.huntUpdate(); this.levelUpdate(); }
  }

  // ------------------------------------------------------------------ a threat level's mission (see the top)
  fighting() {
    return this.sim.assaults.some((a) => a.state !== 'resolved');
  }
  // the day's clock of the next attack still to come, or null
  nextAttack() {
    for (let i = this.si; i < this.script.length; i++) if (this.script[i].attack) return this.script[i].t;
    return null;
  }

  levelUpdate() {
    const sim = this.sim, L = sim.level, ob = sim.objectives, lv = this.lv;
    if (sim.state !== 'playing' || sim.barrage) return;
    ob.update();
    if (ob.fails > L.fails) return this.levelEnd(false, 'The day is lost', `Too many of the main objectives' fire missions failed: ${ob.fails}, with ${L.fails} allowed.`);
    const stuck = this.unreachable();
    if (stuck) return this.levelEnd(false, 'The day is lost', `Nothing left in reach of our batteries for a main objective: ${stuck.title}.`);
    if (!ob.accomplished) return;
    if (!lv.closing) this.accomplish();
    // their fire grows each minute after the mains are done: the player chooses when to end, at a price
    sim.difficulty.cb = lv.cb0 * Math.min(PRESSURE.max, 1 + (PRESSURE.perMin * (sim.time - ob.accomplished)) / 60);
    // a lineup all on auto (the tests, a player who left it to the crews): the end called once no objective has moved
    // for a while and no attack is under way (the crews' own work, or a strongpoint they cannot break, never holds it)
    if (!lv.finale && sim.units.every((u) => !u.alive || u.mode === 'auto') && !sim.gunner?.st) {
      lv.quietAt = Math.max(ob.lastProgress ?? 0, lv.quietAt ?? 0);
      if (!this.fighting() && sim.time - lv.quietAt >= QUIET_END) return this.callFinale();
    } else lv.quietAt = sim.time;
    if (lv.finale && this.dayTime >= ZERO_T - 1 && !this.fighting()) this.zeroHour();
  }

  // every main target done: the player may end the battle (or call X-Zeit)
  accomplish() {
    const sim = this.sim, lv = this.lv, ob = sim.objectives;
    lv.closing = true;
    lv.cb0 = sim.difficulty.cb;
    const open = ob.sides.filter((o) => o.state === 'open').length;
    sim.radio(`Mission accomplished: every main objective done. ${open ? `${open} secondar${open > 1 ? 'ies' : 'y'} still open. ` : ''}${ob.has('xzeit') ? 'Call X-Zeit (K) when ready' : 'End the battle (K) when ready'}: their fire grows every minute.`, 'kill');
  }

  // the player ends an accomplished battle (main: K, the HUD's button), or calls X-Zeit; true when it went
  callFinale() {
    const sim = this.sim, lv = this.lv, ob = sim.objectives;
    if (!lv || !ob?.accomplished || lv.finale || sim.state !== 'playing') return false;
    lv.finale = true;
    if (!ob.has('xzeit')) {
      this.levelEnd(true, 'Mission accomplished', this.summary());
      return true;
    }
    // X-Zeit: the attacks and the orders still to come are called off (an attack massing goes back), and the day runs
    // on to it (pace)
    this.script = [...this.script.slice(0, this.si), ...this.script.slice(this.si).filter((e) => !e.attack && !e.order)];
    for (const as of this.massed.values()) this.callOff(as, null);
    this.massed.clear();
    for (const g of sim.infantry) if (g.column) g.remove = true;
    for (const o of ob.bonus) if (o.state === 'open') { o.state = 'failed'; o.tEnd = sim.time; }
    this.noOrders = true;
    this.specialists.allow = new Set(['fort']);
    sim.radio('X-Zeit is called: the Gruppe lays on the Feuervorbereitung.', 'warn');
    return true;
  }

  // the objectives in a line for the end card
  summary() {
    const ob = this.sim.objectives, m = ob.mains.filter((o) => o.kind !== 'xzeit'), s = ob.sides;
    const md = m.filter((o) => o.state === 'done').length, sd = s.filter((o) => o.state === 'done').length, bd = ob.bonus.filter((o) => o.state === 'done').length;
    return `${md} of ${m.length} main objective${m.length > 1 ? 's' : ''} done${s.length ? `, ${sd} of ${s.length} secondar${s.length > 1 ? 'ies' : 'y'}` : ''}${s.length && sd === s.length ? ': the full clear' : ''}${bd ? `; ${bd} more of the moment` : ''}.`;
  }

  levelEnd(win, title, sub) {
    this.sim.objectives?.settle(win);
    this.sim.over = { title, sub };
    this.setState(win ? 'victory' : 'defeat', `${title}. ${sub}`);
  }

  // a main target objective that no battery left can serve (its target still standing; a battery with its shells spent
  // and none coming, the Gamma's sixteen, serves nothing more), or null
  unreachable() {
    const sim = this.sim, can = (u, m) => (sim.crews.canTake ? sim.crews.canTake(u, m) : sim.crews.canServe(u, m));
    for (const o of sim.objectives.openTargets()) {
      if (!o.main) continue;
      const t = sim.targetById(o.targets[0]);
      if (!t || !t.alive) continue;
      const probe = { kind: BRIT_BATTERIES.has(t.kind) ? 'cb' : 'destroy', targetId: t.id, x: t.pos.x, z: t.pos.z, alt: 0, minHard: o.role === 'hard' ? MIN_HARD : 0 };
      if (!sim.units.some((u) => u.alive && armed(u) && can(u, probe))) return o;
    }
    return null;
  }

  // the objectives' fire missions: the mains' two at a time, the secondaries' as they are reported, one opening at a
  // time (SPACING), a failed one again after REOPEN (sim/objectives.js says which are open)
  objectiveMissions() {
    const sim = this.sim, ob = sim.objectives;
    if (!ob || sim.state !== 'playing' || sim.barrage || this.lv?.finale || sim.time < (this.objAt ?? 0)) return;
    const live = (m) => m.state !== 'done' && m.state !== 'failed';
    let mains = sim.missions.filter((m) => m.objMain && live(m)).length;
    for (const o of ob.openTargets()) {
      if (o.main && mains >= MAIN_LIVE) continue;
      if (sim.missions.some((m) => m.obj === o.id && live(m))) continue;
      const r = this.reopen.find((q) => q.id === o.id);
      if (r && sim.time < r.at) continue;
      // (the secondaries after the opening: the first minutes are the mains')
      if (!o.main && sim.time < 90 && !ob.accomplished) continue;
      const m = this.objectiveMission(o);
      if (!m) continue;
      this.reopen = this.reopen.filter((q) => q.id !== o.id);
      this.objAt = sim.time + SPACING;
      return;
    }
  }

  // an objective's fire mission on its target: a deep or concrete one as the specialists open theirs (an aeroplane by
  // day, a map shoot by night, the long window), the rest as the day's site missions
  objectiveMission(o) {
    const sim = this.sim, t = sim.targetById(o.targets[0]);
    if (!t || !t.alive || this.spent(t)) return null;
    // (a Gegenbatterie already open on it, from their battery's own fire: it becomes the objective's)
    const had = sim.missions.find((m) => m.targetId === t.id && !m.obj && m.state !== 'done' && m.state !== 'failed');
    if (had) { had.obj = o.id; had.objMain = o.main; had.priority += o.main ? 5 : 2; return had; }
    // the railway-gun hunt: laid on the sound rangers' fix, no reports, no clock (huntUpdate moves it with the fix)
    if (o.kind === 'railgun') {
      const m = this.addMission({ kind: 'cb', title: 'Hunt: the British 18-inch railway howitzer', targetId: t.id, x: t.pos.x + t.cbErr.x, z: t.pos.z + t.cbErr.z,
        observer: 'sound', deadline: null, priority: 7, hint: 'Laid on the sound rangers\' fix of its firing point: fire for effect when it comes up and fires again.' });
      m.hunt = true;
      return m;
    }
    const go = () => {
      // (a British battery by an observer who reports, never the sound or flash rangers' blind fix: an objective
      // missed for want of a report reads as unfair; by night the VB reads the bursts by their flash)
      if (!o.role) return this.siteMission(t.id, o.kind === 'tanks' ? { title: `Tanks gathering: ${t.name}`, priority: 7 } : BRIT_BATTERIES.has(t.kind) ? { observer: this.dayObserver('foo') } : {});
      t.known = true;
      const observer = sim.night ? 'map' : sim.modifiers?.has('air') ? 'balloon' : 'air';
      return this.addMission({ kind: 'destroy', title: `${o.role === 'deep' ? 'Deep target' : 'Heavy target'}: ${t.name}`, targetId: t.id, x: t.pos.x, z: t.pos.z, observer,
        deadline: ROLE_WINDOW, priority: 6, role: o.role, points: 90, minHard: o.role === 'hard' ? MIN_HARD : 0,
        hint: o.role === 'deep' ? 'Beyond the field guns: a task for the long guns.' : 'Concrete: only heavy shells break it. Delay fuze.' });
    };
    let m = null;
    if (this.day) this.day.release(() => { m = go(); }); else m = go();
    return m;
  }

  // the day's clock on a level (see the top); without one, DirectorWW2's lull rule
  pace(dt) {
    const sim = this.sim, lv = this.lv;
    if (!lv || !this.day) return super.pace(dt);
    if (sim.state !== 'playing' || sim.barrage) { this.lapsing = false; return; }
    const fighting = this.fighting();
    let to = -Infinity, quiet = false;
    if (lv.finale) {
      // X-Zeit called: on to it, once no attack is under way
      if (!fighting) to = ZERO_T;
    } else {
      // a lull: on to the next thing on the day's clock, never the next attack on top of one under way, never X-Zeit
      // (a target of opportunity does not hold it: it is a chance in passing, not work the day waits on)
      const busy = fighting || this.day.queue.length > 0 || sim.missions.some((m) => !m.pop && (m.state === 'open' || m.state === 'ranging' || m.state === 'ffe'));
      if (busy) this.lullAt = null;
      else if (this.lullAt == null) this.lullAt = sim.time;
      else if (sim.time - this.lullAt >= LULL && this.si < this.script.length) { to = this.script[this.si].t; quiet = true; }
      const na = fighting ? this.nextAttack() : null;
      if (na != null) to = Math.min(to, na - 1);
      to = Math.min(to, ZERO_T - 1);
      // (and the day's clock waits short of X-Zeit, however long the work takes: the night goes on)
      if (this.dayTime > ZERO_T - 1) this.ahead = ZERO_T - 1 - sim.time;
    }
    const left = to - this.dayTime;
    if (left <= 0) { this.lapsing = false; return; }
    // (said once a lull: one lapse may run on to the next thing on the clock and the next, when they give nothing to do)
    if (quiet && !this.lapsing) sim.radio('All quiet on our front: the hours pass until the next thing.', 'info');
    this.lapsing = true;
    this.ahead += Math.min(left, dt * Math.max(8, left / LAPSE));
  }

  // no new Gegenbatterie once X-Zeit is called
  watchBatteries() {
    if (this.noOrders) return;
    super.watchBatteries();
  }

  // the HUD's objectives (main: hud.setObjectives), or null without a level's mission
  goal() {
    const sim = this.sim, ob = sim.objectives, lv = this.lv;
    if (!lv || !ob || sim.state !== 'playing') return null;
    const allAuto = sim.units.every((u) => !u.alive || u.mode === 'auto') && !sim.gunner?.st;
    const auto = ob.accomplished && !lv.finale && allAuto ? Math.max(0, Math.ceil(QUIET_END - (sim.time - lv.quietAt))) : null;
    return {
      name: sim.operation.name, title: sim.operation.title, en: sim.operation.en,
      // (an objective of the moment: its time left; the duel's fix, how far off their rounds fall; counter-preparation's
      // share of the men massing down)
      items: ob.list.filter((o) => o.state !== 'hidden' && !(o.bonus && o.state !== 'open' && sim.time - o.tEnd > 30)).map((o) => ({
        id: o.id, main: o.main, bonus: !!o.bonus, kind: o.kind, short: o.short, title: o.title, why: o.why, state: o.state, done: o.done, n: o.n, timed: o.timed,
        left: o.until != null && o.state === 'open' ? Math.max(0, Math.ceil(o.until - sim.time)) : null,
        fix: o.kind === 'duel' && o.state === 'open' ? fixOf(sim.targetById(o.targets[0])?.fire?.lock ?? 0) : o.kind === 'railgun' && this.hunt ? Math.round(this.hunt.err) : null,
        up: o.kind === 'railgun' && this.hunt ? this.hunt.up : null,
        haul: o.kind === 'balloon' ? (() => { const t = sim.targetById(o.targets[0]); return t?.alive ? { k: Math.round((t.haulK ?? 0) * 100) / 100, left: Math.max(0, Math.ceil((t.downUntil ?? 0) - sim.time)) } : null; })() : null,
        pct: o.kind === 'prep' || o.kind === 'column' ? o.pct ?? 0 : null })),
      hidden: ob.list.filter((o) => o.state === 'hidden').length,
      fails: ob.fails, maxFails: sim.level.fails,
      accomplished: !!ob.accomplished, finale: !!lv.finale, xzeit: !!ob.has('xzeit'), barrage: !!sim.barrage, auto,
      pressure: ob.accomplished ? Math.round((sim.difficulty.cb / lv.cb0) * 100) : 100,
    };
  }

  // an attack on a threat level: with its tanks when its side's laager still has half of them, thinner for each
  // objective done that thins them
  levelAssault(sec, size) {
    const sim = this.sim, t = sim.level.tanks ? sim.targetById(LAAGER[sec]) : null;
    let k = 1;
    if (t && t.alive && !this.handedOff.has(t.id) && sim.targetAI.alivePartCount(t) * 2 > t.parts.length) {
      k = TANK_K;
      sim.radio(`Their Mark IVs from the ${t.name} go in with the attack.`, 'alert');
    }
    const thin = sim.objectives?.list.filter((o) => o.state === 'done' && o.effect === 'attacks') ?? [];
    if (thin.length) {
      k *= Math.max(0.6, THIN ** thin.length);
      sim.radio(`Their attack comes thinner: ${thin.map((o) => o.short).join(' and ')} gone.`, 'info');
    }
    return this.assault(sec, size * k);
  }

  // four minutes before an attack: its side's laager comes alive (a mission on it, if it still has half its tanks)
  tanksMoving(sec) {
    const sim = this.sim, t = sim.targetById(LAAGER[sec]);
    if (!t || !t.alive || sim.targetAI.alivePartCount(t) * 2 <= t.parts.length) return;
    if (sim.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed')) return;
    this.siteMission(t.id, { title: `Tanks moving up: ${t.name}`, deadline: 230, priority: 8 });
  }

  // the British guns announce themselves when they fire; the 18-pounders are found from the start of the duel, the
  // first order on the battle's first frame (a silent start reads as a broken game). The Paris Gun's mission has no
  // battle: its controller (special.js) gives the orders and ends it.
  buildScript() {
    if (this.op.kind !== 'battle') return [];
    if (this.sim.level) return this.levelScript();
    const S = [];
    const at = (t, fn) => S.push({ t, fn });
    const D = this;
    at(0, () => D.siteMission('F1', { observer: 'foo', deadline: 700 }));
    at(70, () => D.siteMission('T1', { deadline: 650 }));
    at(200, () => D.siteMission('D1'));
    at(300, () => D.siteMission('F2', { observer: 'foo', deadline: 700 }));
    at(345, () => D.siteMission('T2'));
    at(420, () => D.siteMission('H1'));
    at(500, () => D.siteMission('D2'));
    at(640, () => D.train());
    at(925, () => D.assault('B', 0.6));
    at(1090, () => D.assault('C', 0.6));
    at(1230, () => D.assault('D', 0.5));
    at(1330, () => D.convoy());
    at(1360, () => D.train());
    at(1450, () => D.convoy());
    at(1530, () => D.assault('A', 0.5));
    at(1590, () => D.convoy());
    at(1640, () => D.train());
    at(1710, () => D.convoy());
    at(1850, () => D.zeroHour());
    return S;
  }

  // ------------------------------------------------------------------ the railway-gun hunt (see HUNT)
  huntUpdate() {
    const sim = this.sim, h = this.hunt;
    if (!h || sim.state !== 'playing') return;
    const t = h.t;
    if (!t.alive || this.spent(t) || this.lv.finale) {
      // (knocked out: it never fires again, and stays where it was caught)
      if (t.alive && this.spent(t) && !h.out) { h.out = true; t.present = true; t.fire.ammo = 0; sim.radio('The British railway gun is knocked out of action on its firing point.', 'kill'); }
      if (!t.alive) this.hunt = null;
      return;
    }
    if (!h.up) {
      if (sim.time < h.next) return;
      // (it comes up quietly: the first the Gruppe knows of it is its flash and its shell)
      h.up = true;
      h.upAt = sim.time;
      h.shots = 0;
      h.fired = t.firedAt ?? null;
      t.present = true;
      t.fire.cool = 4 + sim.rng() * 10;
      return;
    }
    if (t.firedAt != null && t.firedAt !== h.fired) {
      h.fired = t.firedAt;
      h.shots++;
      h.err = Math.max(HUNT.min, h.err * HUNT.k);
      const a = Math.atan2(t.cbErr.z, t.cbErr.x) + sim.gauss() * 0.6;
      t.cbErr = { x: Math.cos(a) * h.err, z: Math.sin(a) * h.err };
      for (const m of sim.missions) if (m.hunt && m.state !== 'done' && m.state !== 'failed') {
        m.x = t.pos.x + t.cbErr.x; m.z = t.pos.z + t.cbErr.z;
        m.gridRef = sim.theatre.ref(m.x, m.z);
        // (the batteries on it on auto are laid on the new fix; the player's own re-lays from the board's flag)
        for (const id of m.units) { const u = sim.unitById(id); if (u?.alive && u.mode === 'auto') sim.guns.setTarget(u, m.x, m.z); }
      }
      sim.radio(`Schallmeßtrupp: the railway gun is firing from ${sim.theatre.ref(t.pos.x + t.cbErr.x, t.pos.z + t.cbErr.z)}, fix ±${Math.round(h.err)} m.`, 'phone');
      // (a battery on auto turns to it: the long guns and the heavies)
      const m = sim.missions.find((q) => q.hunt && q.state !== 'done' && q.state !== 'failed');
      if (m && !m.units.length) sim.crews.huntCalled?.(m);
    }
    if (h.shots >= HUNT.salvos || sim.time - h.upAt > HUNT.stay) {
      h.up = false;
      t.present = false;
      h.next = sim.time + HUNT.away[0] + sim.rng() * (HUNT.away[1] - HUNT.away[0]);
      // (once the fix is good, a visit it survives is a failed fire mission on a main: the hunt ends on events, never
      // on a clock, and never drags on)
      const o = sim.objectives?.list.find((q) => q.kind === 'railgun' && q.state === 'open');
      if (o?.main && h.err <= HUNT.fair) {
        sim.objectives.fails++;
        sim.radio(`The British railway gun got away again: ${sim.objectives.fails} of ${sim.level.fails} failures allowed. It will be back: keep a battery laid on the fix.`, 'warn');
      } else sim.radio('The British railway gun has withdrawn out of sight. It will be back: keep a battery laid on the fix.', 'info');
    }
  }

  // ------------------------------------------------------------------ the duel (see DUEL)
  // A British battery that has one of ours under its fire, its fix firm enough to tell, becomes a secondary of the
  // moment: silence it in time. Its fix is our battery's loudness (ww1/enemy.js: f.lock follows the signature), so
  // going quiet is the other answer; the HUD shows how far off their rounds fall (fixOf).
  duelUpdate() {
    const sim = this.sim, ob = sim.objectives, lv = this.lv;
    if (!ob || lv.finale || sim.state !== 'playing' || sim.barrage || sim.phase < 2 || sim.level.cb < DUEL.cb || sim.time < this.duelAt) return;
    // (one timed thing at a time besides the attacks: no duel while an attack masses or goes in, or another is open)
    if (ob.list.some((o) => o.bonus && o.state === 'open') || this.massed.size || this.fighting()) return;
    let best = null;
    for (const t of sim.targets) {
      const f = t.fire;
      if (!t.battery || !t.alive || !f || this.spent(t) || sim.time - (t.firedAt ?? -1e9) > 40 || f.lock < DUEL.lock) continue;
      if (this.hunt?.t === t) continue; // (the hunted railway gun: the hunt is its duel)
      if (!sim.unitById(f.focus)?.alive) continue;
      const probe = { kind: 'cb', targetId: t.id, x: t.pos.x, z: t.pos.z, alt: 0, minHard: 0 };
      if (!sim.units.some((u) => u.alive && sim.crews.canServe(u, probe))) continue;
      if (!best || f.lock > best.fire.lock) best = t;
    }
    if (!best) return;
    const u = sim.unitById(best.fire.focus), name = best.name.replace(/^British /, '').replace(/^18-pounder battery, /, '18-pounders on the ');
    const o = ob.add({ kind: 'duel', targets: [best.id], unitId: u.id, until: sim.time + DUEL.t / sim.difficulty.time,
      title: `Duel: silence the ${name} before it has the range of ${u.callsign}`, short: `Duel: ${name.replace(/^18-pounders on the /, '18-pdrs, ')}`,
      why: `It is walking its fire onto ${u.callsign}, closer with every round ${u.callsign} fires: silence it, or let ${u.callsign} fall quiet.`,
      doneLine: `${u.callsign} is out of its fire` });
    this.duelAt = sim.time + DUEL.gap;
    this.objectiveMission(o);
  }

  // ------------------------------------------------------------------ targets of opportunity (see POP)
  popUpdate(dt) {
    const sim = this.sim, ob = sim.objectives, lv = this.lv;
    this.columnsMove(dt);
    if (!ob || lv.finale || sim.state !== 'playing' || sim.barrage || sim.phase < 2 || sim.night || sim.time < this.popAt) return;
    // (one moment at a time: none while an attack masses or goes in, or another of the moment is open)
    if (this.fighting() || this.massed.size || ob.list.some((o) => o.bonus && o.state === 'open')) return;
    this.popColumn();
  }

  // a relief column halted on a road behind their line, in reach of a battery of ours
  popColumn() {
    const sim = this.sim, ob = sim.objectives;
    const probe = (p) => ({ kind: 'destroy', targetId: null, x: p.x, z: p.z, alt: 0, minHard: 0 });
    const spots = roadSpots().filter((p) => sim.units.some((u) => u.alive && sim.crews.canServe(u, probe(p))));
    if (!spots.length) { this.popAt = sim.time + 60; return; }
    const p = spots[Math.floor(sim.rng() * spots.length)], n = POP.men[0] + Math.floor(sim.rng() * (POP.men[1] - POP.men[0]));
    const sec = SECTORS.find((q) => p.z >= q.from && p.z < q.to)?.id ?? 'B';
    const g = sim.infAI.makeGroup('british', sec, p.x, p.z, n, p.b, 'halt');
    // (in file along the road, two abreast)
    g.men.forEach((m, i) => { m.dx = ((i % 2) - 0.5) * 2.2 + sim.gauss() * 0.3; m.dz = Math.floor(i / 2) * 2.4; });
    g.attacker = true;
    g.column = { until: sim.time + POP.t, leave: 0, v: 1.4 };
    const road = p.road === 0 ? 'the Menin road' : p.road === 1 ? 'the Wieltje road' : 'a road';
    const o = ob.add({ kind: 'column', targets: [], group: g.id, until: g.column.until, pct: 0,
      title: `Target of opportunity: a relief column halted on ${road}`, short: 'Column on the road',
      why: 'Men in the open behind their line, there for a few minutes before they march on: shrapnel is the shell for them. Put a third of them down.',
      doneLine: 'the column scatters' });
    const m = this.addMission({ kind: 'destroy', title: `Target of opportunity: column on ${road}`, x: p.x, z: p.z, observer: this.dayObserver('map'),
      deadline: POP.t / sim.difficulty.time, priority: 6, hint: 'Men in the open on a road: shrapnel, or HE on the road. They will not stay long.' });
    m.obj = o.id;
    m.objMain = false;
    m.pop = true;
    m.column = g.id;
    this.popAt = sim.time + POP.t + POP.gap * (0.7 + 0.6 * sim.rng());
  }

  // the columns: in the open until their time is up or a third of them is down (they scatter), then they march on
  columnsMove(dt) {
    const sim = this.sim, ob = sim.objectives;
    for (const g of sim.infantry) {
      const c = g.column;
      if (!c || g.remove) continue;
      const o = ob?.list.find((q) => q.kind === 'column' && q.group === g.id);
      const m = sim.missions.find((q) => q.column === g.id && q.state !== 'done' && q.state !== 'failed');
      if (g.state === 'halt') {
        const down = 1 - g.n / g.n0;
        if (o) o.pct = Math.round(down * 100);
        if (down >= POP.down) {
          g.state = 'broken'; g.stateT = 0;
          if (m) this.finish(m, true, 'the column scatters');
          if (o) ob.complete(o);
        } else if (sim.time >= c.until) {
          // ('march', not 'advancing': the attackers' rules would put our front line's machine guns on them)
          g.state = 'march'; g.stateT = 0; c.leave = sim.time + 50;
          if (m) this.finish(m, false, 'the column has marched on');
          if (o) ob.fail(o, 'it has marched on');
        }
      } else if (g.state === 'march') {
        g.pos.x += Math.sin(g.bearing) * c.v * dt;
        g.pos.z -= Math.cos(g.bearing) * c.v * dt;
        if (sim.time >= c.leave) g.remove = true;
      }
    }
  }

  // ------------------------------------------------------------------ counter-preparation (see MASS_T)
  // MASS_T s before an attack its men mass in their front line, three groups in its sector: a VB reports them, a fire
  // mission on them opens, a secondary of the moment. With PREP_BREAK of them down the attack is called off; else
  // they go over at the attack's time with what is left (goOver)
  massing(a) {
    const sim = this.sim, ob = sim.objectives;
    let sec = a.sector;
    if (sim.front[sec] <= 0) { const ids = Object.keys(sim.front).filter((k) => sim.front[k] > 0); sec = ids[Math.floor(sim.rng() * ids.length)]; if (!sec) return; }
    // (thinner for each objective done that thins them: the HQ, a shelter, the corps HQ)
    const thin = ob?.list.filter((o) => o.state === 'done' && o.effect === 'attacks') ?? [];
    const k = (sim.special?.effectK?.('attack') ?? 1) * (thin.length ? Math.max(0.6, THIN ** thin.length) : 1);
    const as = sim.infAI.spawnAssault(sec, a.size * k);
    as.massing = true;
    as.rocketsAt = Infinity;
    for (const g of as.groups) g.go = Infinity;
    this.massed.set(a.t, as);
    if (thin.length) sim.radio(`Their attack masses thinner: ${thin.map((o) => o.short).join(' and ')} gone.`, 'info');
    if (!ob) return;
    const o = ob.add({ kind: 'prep', targets: [], assault: as.id, until: sim.time + MASS_T, pct: 0,
      title: `Counter-preparation: their infantry massing at ${sectorName(sec)}`, short: `Counter-prep, ${sectorName(sec)}`,
      why: `An attack is forming up in their front line. Put a quarter of them down before they go over and it is called off.`,
      doneLine: 'the attack is called off' });
    const x = lineX(LINES.britishFront, as.zc) - 4;
    const m = this.addMission({ kind: 'destroy', title: `Counter-preparation: ${sectorName(sec)}`, x, z: as.zc, observer: 'foo',
      deadline: (MASS_T + 20) / sim.difficulty.time, priority: 7, hint: 'Men massing in their front line: HE on the trench, before they go over.' });
    m.obj = o.id;
    m.objMain = false;
    m.prep = as.id;
    sim.crews.prepCalled?.(m);
  }

  // the casualties among the men massing: the objective's progress, and the attack called off at PREP_BREAK
  prepUpdate() {
    const sim = this.sim, ob = sim.objectives;
    if (!this.massed.size || sim.state !== 'playing') return;
    for (const [t, as] of this.massed) {
      const left = as.groups.reduce((n, g) => n + g.n, 0), down = 1 - left / Math.max(1, as.n0);
      const o = ob?.list.find((q) => q.kind === 'prep' && q.assault === as.id);
      if (o) o.pct = Math.round(down * 100);
      if (down >= PREP_BREAK) { this.massed.delete(t); this.callOff(as, o); }
    }
  }

  // an attack massing called off: its men go back (held: no Sperrfeuer, no sector touched), its objective done (or, X-
  // Zeit called, simply over), its fire mission done
  callOff(as, o) {
    const sim = this.sim;
    as.massing = false;
    for (const g of as.groups) if (g.n > 0) { g.state = 'broken'; g.stateT = 0; }
    const m = sim.missions.find((q) => q.prep === as.id && q.state !== 'done' && q.state !== 'failed');
    if (m) this.finish(m, true, 'they will not go over today');
    if (o) {
      sim.radio(`Counter-preparation at ${sectorName(as.sector)}: their attack is broken up before it starts.`, 'kill');
      sim.objectives.complete(o);
    } else {
      const q = sim.objectives?.list.find((x) => x.kind === 'prep' && x.assault === as.id && x.state === 'open');
      if (q) { q.state = 'failed'; q.tEnd = sim.time; }
    }
  }

  // an attack's time: the men massing go over (with the tanks of its side's laager if it still has half of them), or,
  // with none massing (its sector lost meanwhile), a fresh attack as before
  goOver(a) {
    const sim = this.sim, as = this.massed.get(a.t);
    if (!as) return this.levelAssault(a.sector, a.size);
    this.massed.delete(a.t);
    as.massing = false;
    const o = sim.objectives?.list.find((q) => q.kind === 'prep' && q.assault === as.id);
    if (o) sim.objectives.fail(o, 'they have gone over');
    const m = sim.missions.find((q) => q.prep === as.id && q.state !== 'done' && q.state !== 'failed');
    if (m) this.finish(m, false, 'they have gone over');
    const t = sim.level.tanks ? sim.targetById(LAAGER[as.sector]) : null;
    if (t && t.alive && !this.handedOff.has(t.id) && sim.targetAI.alivePartCount(t) * 2 > t.parts.length) {
      // (its tanks and a fresh company with them)
      const g0 = as.groups[1], n = Math.max(6, Math.round(as.n0 * (TANK_K - 1)));
      const g = sim.infAI.makeGroup('british', as.sector, g0.pos.x, g0.pos.z + 55, n, g0.bearing, 'forming');
      Object.assign(g, { goal: g0.goal, crossing: g0.crossing, speed: g0.speed, assault: as, attacker: true });
      as.groups.push(g);
      as.n0 += n;
      sim.radio(`Their Mark IVs from the ${t.name} go in with the attack.`, 'alert');
    }
    for (const g of as.groups) if (g.state === 'forming') g.go = g.stateT + 18 + sim.rng() * 8;
    sim.enemyAI.hurricaneOn(as.sector, 14);
    as.rocketsAt = sim.time + 5;
    sim.radio(`Trommelfeuer on our front line at ${sectorName(as.sector)}: they are coming.`, 'warn');
    return as;
  }

  // a threat level's day (see the top): the attacks in the mission's sectors (their laagers' tanks moving four minutes
  // before), the traffic at its times; the objectives' missions are not on the clock (objectiveMissions), nor is
  // X-Zeit (callFinale). Marked: an `attack`, and an `order` (none once X-Zeit is called)
  levelScript() {
    const sim = this.sim, L = sim.level, op = sim.operation, S = [], D = this;
    const order = (t, fn) => S.push({ t, order: true, fn: () => { if (!D.noOrders) fn(); } });
    for (const a of op.attacks) {
      if (L.tanks) order(a.t - 240, () => D.tanksMoving(a.sector));
      // (its men mass in their front line first: counter-preparation, then they go over)
      S.push({ t: a.t - MASS_T, attack: true, fn: () => D.massing(a) });
      S.push({ t: a.t, attack: true, fn: () => D.goOver(a) });
    }
    for (const [t, k] of TRAFFIC) order(t, () => (k === 'convoy' ? D.convoy() : D.train()));
    return S.sort((a, b) => a.t - b.t);
  }

  // X-Zeit: the Feuervorbereitung (a Feuerüberfall on the British batteries, the first Feuerwalze line laid), then
  // the Feuerwalze lifts west 100 m every 40 s ahead of our assault
  zeroHour() {
    const sim = this.sim;
    const zero = sim.time + PREP;
    const lanes = [{ sector: 'B', z: laneOf('B') }, { sector: 'C', z: laneOf('C') }];
    const b = sim.barrage = {
      active: true, zero, k: 0, spacing: 100, lifts: [], lanes, nextLift: zero + 130, liftEvery: 40, kMax: 10, end: 0, prep: sim.time,
      xAt: (z) => lineX(LINES.britishFront, z) + 30 - b.k * b.spacing,
      missions: [],
    };
    sim.infAI.spawnOwn(lanes);
    sim.zero = { n0: sim.infantry.filter((g) => g.own).reduce((s, g) => s + g.n0, 0) };
    sim.radio('X-Zeit. Feuervorbereitung: Feuerüberfall on every British battery, then the Feuerwalze. Our infantry goes in three minutes.', 'warn');
    // the fire plan comes first: the crews of the batteries that fire it leave whatever they were shooting (the player's
    // own batteries, on manual, are left to the player)
    for (const u of sim.units) {
      if (u.alive && u.mode === 'auto' && u.missionId != null && !SUPER_WW1.has(u.kind) && u.kind !== 'paris') this.release(u);
    }
    for (const t of sim.targets) {
      if (!t.battery || !t.alive || sim.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed')) continue;
      this.siteMission(t.id, { title: `Feuerüberfall: ${t.name}`, deadline: PREP + 60, priority: 9, observer: 'map' });
    }
    for (const l of lanes) {
      const m = this.addMission({ kind: 'barrage', title: `Feuerwalze, ${sectorName(l.sector)}`, x: b.xAt(l.z), z: l.z, observer: 'map', sector: l.sector, deadline: 900 });
      m.lane = l;
      b.missions.push(m);
    }
  }

  barrageUpdate(dt) {
    const sim = this.sim, b = sim.barrage;
    if (b && b.active && b.prep != null && sim.time >= b.zero && !b.went) {
      b.went = true;
      sim.radio('Sturm! Our infantry is going over. Lift the Feuerwalze on the timetable: 100 m every 40 seconds.', 'alert');
    }
    super.barrageUpdate(dt);
  }

  zeroEnd() {
    const sim = this.sim, b = sim.barrage;
    if (!b.active) return;
    b.active = false;
    const own = sim.infantry.filter((g) => g.own);
    const inn = own.filter((g) => g.state === 'in').reduce((s, g) => s + g.n, 0);
    const n0 = sim.zero.n0;
    sim.zero.survivors = inn;
    for (const m of b.missions) this.finish(m, true);
    if (sim.attract) return;
    // a level's mission: X-Zeit is its finale
    if (sim.objectives) {
      const won = inn >= n0 * sim.difficulty.zero;
      return this.levelEnd(won, won ? 'The attack goes through' : 'The assault failed', won ? `${inn} of ${n0} men are in the British line. ${this.summary()}` : `Only ${inn} of ${n0} men reached the British line. ${this.summary()}`);
    }
    if (inn >= n0 * (sim.level ? sim.difficulty.zero : ZERO_NEED[sim.difficultyName] ?? sim.difficulty.zero)) this.setState('victory', `The assault has taken the British line: ${inn} of ${n0} men are in.`);
    else this.setState('defeat', `The assault failed: only ${inn} of ${n0} men reached the British line.`);
  }

  // a one-gun British position is silenced only when its gun is gone (WW2's rule, one gun left, would end at once)
  missionsUpdate() {
    const sim = this.sim, now = sim.time;
    // the heavy and long guns' missions on the role sites and the lineup's day (the German career's battle: inert
    // without a lineup and its role sites, src/ww1/theatre.js)
    this.specialists?.update();
    this.day?.update();
    this.objectiveMissions();
    for (const m of sim.missions) {
      if (m.state === 'done' || m.state === 'failed') continue;
      const t = m.targetId ? sim.targetById(m.targetId) : null;
      if (m.intel && t && !t.known && m.onTarget) {
        t.known = true;
        sim.radio(`${t.name} located.`, 'info');
      }
      // a level's tank laager: broken up when half its tanks are out; the guns go on to the next tank
      if (m.aimPart && t && m.kind === 'destroy') {
        if (!t.alive || sim.targetAI.alivePartCount(t) * 2 <= t.parts.length) { this.finish(m, true, 'the laager is broken up'); continue; }
        if (!m.aimPart.alive) {
          const p = this.nextTank(t, m.x, m.z);
          if (p) {
            m.aimPart = p;
            m.x = p.x; m.z = p.z;
            for (const id of m.units) { const u = sim.unitById(id); if (u?.alive) sim.guns.setTarget(u, m.x, m.z); }
          }
        }
      }
      if (m.kind === 'destroy' && t && !t.alive) this.finish(m, true);
      else if (m.kind === 'cb' && t) {
        if (!t.alive) this.finish(m, true);
        else if (m.hunt && this.spent(t)) this.finish(m, true, 'the railway gun is knocked out of action');
        else if (sim.targetAI.silenced(t)) this.finish(m, true, 'the battery is silenced');
        // (a threat level: a battery is silenced with half its guns out, as a laager is broken up)
        else if (sim.level && t.parts.length > 1 && sim.targetAI.alivePartCount(t) * 2 <= t.parts.length) this.finish(m, true, 'the battery is silenced');
        else if (m.onTarget && !t.known) {
          t.known = true;
          sim.radio(`${t.name} located.`, 'info');
        }
      } else if (m.kind === 'harass' && t) {
        const alive = t.parts.filter((p) => p.alive).length;
        if (!t.alive || alive <= t.parts.length * 0.4) this.finish(m, true, 'transport destroyed');
        else if (!t.present) this.finish(m, false, 'it has gone');
      }
      if (m.state !== 'done' && m.state !== 'failed' && m.kind !== 'barrage' && m.deadline != null && now > m.deadline) this.finish(m, false, 'too late');
    }
    if (sim.missions.length > 60) {
      const keep = sim.missions.filter((m) => (m.state !== 'done' && m.state !== 'failed') || now - (m.tEnd ?? 0) < 120);
      sim.missions.length = 0;
      sim.missions.push(...keep);
    }
  }

  convoy() {
    const sim = this.sim, t = sim.targetById('X1');
    if (!t || (this.day && !this.day.reachable(t))) return null; // no battery in the field reaches the road
    sim.targetAI.convoy(t, sim.rng() < 0.5 ? 1 : -1);
    t.known = true;
    const m = this.siteMission('X1');
    if (m) m.convoy = true;
    return m;
  }
}

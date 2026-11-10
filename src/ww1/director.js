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

// The threat levels (threat.js, sim.level; the German career's open battle). A level's battle ends on its missions,
// never on the clock (the user's rule, 2026-11-10: nobody sits out the rest of a day with the work done):
//   the orders  the day's sites, traffic and attacks come as before until `need` fire missions are done (destroy, cb,
//               harass); more than `fails` failed (destroy and cb: traffic that gets away was only a chance in
//               passing) lose it, and so does running out of anything in reach before `need` (nothingLeft)
//   the close   no new orders; the attacks the level still owes come one after another, the day running on to each
//   the finale  a shorter day is won (lost if the orders ran out short); a 'full' one goes on to X-Zeit, whose assault
//               decides it. Two sectors lost or every gun lost end any day at once, as always.
// The day's clock (pace): on through a lull as before, never past the day's end (`DAY_END`, X-Zeit for a full one)
// before the close (a slow day does not run out: the sky waits), and in the close on to each attack owed and X-Zeit.
// (Kept abreast of the orders done as well, it brought the attacks and the counter-battery calls on faster than the
// crews work: the failures and lost sectors piled up, 2026-11-10.) The level's sites only (its `sites`, capability.js
// tierOf); one no battery of the lineup can finish goes to the neighbouring Gruppe (a radio line, no pay, no
// penalty). The attacks: the first `attacks` of ATTACKS; with `tanks`, a tank laager that still has half its tanks
// four minutes before an attack on its side sends them in with it (TANK_K the attack's size).
export const DAY_END = { morning: 900, day: 1300, night: 1850, full: 1850 };
const ZERO_T = 1850; // X-Zeit on the day's clock (ops.js phase 5)
const ORDERS = ['destroy', 'cb', 'harass'], FAILS = ['destroy', 'cb'];
const missions = (n) => `${n} fire mission${n === 1 ? '' : 's'}`;
const ATTACKS = [[925, 'B', 0.6], [1230, 'D', 0.5], [1090, 'C', 0.6], [1530, 'A', 0.5], [1700, 'B', 0.55]];
const TANK_K = 1.3;
const LAAGER = { A: 'T1', B: 'T1', C: 'T2', D: 'T2' };
const NO_HANDOFF = new Set(['bconvoy', 'railyard']); // the traffic: a chance in passing, never handed on
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
    super.reset();
    const sim = this.sim, L = sim.level;
    this.handedOff = new Set();
    this.verdicts = new Map(); // site id -> whether a battery of the lineup can finish it (canOffer)
    // a level's orders (levelUpdate): its day's end on the clock, whether the close has begun and why
    this.lv = L && this.op.kind === 'battle' ? { endT: DAY_END[L.day] ?? ZERO_T, closing: false, short: false } : null;
    this.noOrders = false; // the close: the lineup's day and the specialists give nothing more (sim/lineup.js)
    // the strongpoints in the X-Zeit lanes (ops.js RIDGE_FORTS): the level's `forts` of them, in their order (one in
    // each lane first); none without a level
    const forts = sim.targets.filter((t) => t.site?.role === 'fort');
    if (forts.length) {
      const gone = new Set(forts.slice(L && this.op.kind === 'battle' ? L.forts ?? 0 : 0).map((t) => t.id));
      sim.targets = sim.targets.filter((t) => !gone.has(t.id));
      for (const id of gone) sim.targetAI.byId.delete(id);
      this.specialists.sites = this.specialists.sites.filter((t) => !gone.has(t.id));
    }
    if (!L || this.op.kind !== 'battle') return;
    this.specialists.allow = new Set(L.sites.filter((t) => t === 'deep' || t === 'hard' || t === 'fort'));
    // the lineup's batteries in the field, for the capability check (capability.js)
    this.bats = sim.units.filter((u) => !isOffmap(u.kind)).map((u) => ({ kind: u.kind, guns: u.pieces.length, mods: u.mods ?? IDENTITY, pos: u.pos }));
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
    if (!t) return 'instant';
    if ((t.kind === 'bconvoy' || t.kind === 'bballoon') && GUNS_SHRAPNEL.has(u.kind)) return 'shrapnel';
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
    let observer = over.observer ?? (kind === 'btanks' || kind === 'bballoon' || kind === 'bpost' ? 'foo' : this.dayObserver('map'));
    let x = t.pos.x, z = t.pos.z, mkind = over.kind ?? 'destroy', title = over.title ?? `Zerstörungsfeuer: ${t.name}`;
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
    } else if (kind === 'bballoon') title = over.title ?? 'Fesselballon: shoot down the British balloon';
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
      alt: kind === 'bballoon' ? t.site.alt ?? 0 : 0,
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
    if (this.lv) this.levelUpdate();
  }

  // ------------------------------------------------------------------ a threat level's orders (see the top)
  // the fire missions done and failed so far
  orders() {
    const st = this.sim.stats.missions;
    let done = 0, failed = 0;
    for (const k of ORDERS) done += st[k]?.done ?? 0;
    for (const k of FAILS) failed += st[k]?.failed ?? 0;
    return { done, failed };
  }
  fighting() {
    return this.sim.assaults.some((a) => a.state !== 'resolved');
  }
  // the day's clock of the next attack the level still owes, or null
  nextAttack() {
    for (let i = this.si; i < this.script.length; i++) if (this.script[i].attack) return this.script[i].t;
    return null;
  }
  // the attacks still to come or under way
  owed() {
    let n = this.fighting() ? 1 : 0;
    for (let i = this.si; i < this.script.length; i++) if (this.script[i].attack) n++;
    return n;
  }

  levelUpdate() {
    const sim = this.sim, L = sim.level, lv = this.lv;
    if (sim.state !== 'playing' || sim.barrage) return;
    if (!lv.closing) {
      const { done, failed } = this.orders();
      if (failed > L.fails) return this.levelEnd(false, 'The day is lost', `Too many fire missions failed: ${failed}, with ${L.fails} allowed. ${done} of ${L.need} done.`);
      if (done >= L.need) return this.close(false);
      if (this.nothingLeft()) return this.close(true);
      return;
    }
    // the close: the attacks still owed, one after another (pace runs the day on to each), then the finale
    if (this.owed()) return;
    if (L.day !== 'full') {
      const { done } = this.orders(), lost = Object.values(sim.front).filter((v) => v <= 0).length;
      const held = L.attacks ? `${L.attacks > 1 ? 'their attacks' : 'their attack'} answered` : 'the front quiet';
      if (lv.short) return this.levelEnd(false, 'The day is lost', `Nothing more in reach of our batteries: ${done} of ${L.need} fire missions done.`);
      return this.levelEnd(true, 'The front is held', `${missions(done)} done, ${held}${lost ? `; ${lost} sector lost` : ''}.`);
    }
    if (this.dayTime >= ZERO_T) this.zeroHour();
  }

  // the orders are over: done, or nothing more in reach (short)
  close(short) {
    const sim = this.sim, L = sim.level, lv = this.lv;
    lv.closing = true;
    lv.short = short;
    this.noOrders = true;
    // (the specialists: only the strongpoints, which still matter at X-Zeit)
    this.specialists.allow = new Set([...(this.specialists.allow ?? [])].filter((r) => r === 'fort'));
    const n = this.owed(), { done } = this.orders();
    const head = short ? `Nothing more in reach of our batteries (${done} of ${L.need} fire missions done).` : `Orders done: ${missions(done)}.`;
    const next = L.day === 'full' ? (n ? `Their ${n > 1 ? `${n} attacks` : 'attack'} still to come, then X-Zeit.` : 'X-Zeit is next.')
      : n ? `Hold the line: their ${n > 1 ? `${n} attacks` : 'attack'} still to come.` : '';
    sim.radio(`${head} ${next}`.trim(), short ? 'warn' : 'kill');
  }

  levelEnd(win, title, sub) {
    this.sim.over = { title, sub };
    this.setState(win ? 'victory' : 'defeat', `${title}. ${sub}`);
  }

  // nothing more the orders can bring: no mission in hand (one without a clock only while a battery can take it), no
  // attack under way, nothing waiting in the lineup's queue, no scripted order still to come, no site a battery left
  // standing reaches (the lineup's work) and no role site the specialists could open
  nothingLeft() {
    const sim = this.sim;
    if (this.fighting() || this.day?.queue.length) return false;
    for (let i = this.si; i < this.script.length; i++) if (this.script[i].order) return false;
    const can = (u, m) => (sim.crews.canTake ? sim.crews.canTake(u, m) : sim.crews.canServe(u, m));
    for (const m of sim.missions) {
      if (m.state === 'done' || m.state === 'failed' || m.kind === 'sos' || m.kind === 'barrage') continue;
      if (m.deadline != null || sim.units.some((u) => u.alive && can(u, m))) return false;
    }
    if (this.day && this.day.pool().some((t) => this.day.reachable(t))) return false;
    return !this.specialists.pending();
  }

  // the day's clock on a level (see the top); without one, DirectorWW2's lull rule
  pace(dt) {
    const sim = this.sim, lv = this.lv;
    if (!lv || !this.day) return super.pace(dt);
    if (sim.state !== 'playing' || sim.barrage) { this.lapsing = false; return; }
    const L = sim.level, fighting = this.fighting();
    let to = -Infinity, quiet = false;
    if (lv.closing) {
      // on to the next attack owed, then to X-Zeit; never while one is under way
      if (!fighting) to = this.nextAttack() ?? (L.day === 'full' ? ZERO_T : -Infinity);
    } else {
      // a lull: on to the next scripted thing (see the top for why not abreast of the orders done)
      const busy = fighting || this.day.queue.length > 0 || sim.missions.some((m) => m.state === 'open' || m.state === 'ranging' || m.state === 'ffe');
      if (busy) this.lullAt = null;
      else if (this.lullAt == null) this.lullAt = sim.time;
      else if (sim.time - this.lullAt >= LULL && this.si < this.script.length) { to = this.script[this.si].t; quiet = true; }
      // never the next attack on top of one under way, never past the day's end before the close (the clock waits)
      const na = fighting ? this.nextAttack() : null;
      if (na != null) to = Math.min(to, na - 1);
      to = Math.min(to, lv.endT - 1);
      if (this.dayTime > lv.endT - 1) this.ahead = lv.endT - 1 - sim.time;
    }
    const left = to - this.dayTime;
    if (left <= 0) { this.lapsing = false; return; }
    if (quiet && !this.lapsing) sim.radio('All quiet on our front: the hours pass until the next orders.', 'info');
    this.lapsing = true;
    this.ahead += Math.min(left, dt * Math.max(8, left / LAPSE));
  }

  // no new Gegenbatterie once the orders are over
  watchBatteries() {
    if (this.noOrders) return;
    super.watchBatteries();
  }

  // the HUD's box on a level's orders (main: hud.setGoal): { label, value, sub, warn }, or null without a level
  goal() {
    const sim = this.sim, L = sim.level, lv = this.lv;
    if (!lv || sim.state !== 'playing') return null;
    if (sim.barrage) return { label: 'X-Zeit', value: 'Feuerwalze', sub: 'get our men into their line' };
    if (lv.closing) {
      const n = this.owed();
      if (n) return { label: 'Hold the line', value: `${n} attack${n > 1 ? 's' : ''}`, sub: L.day === 'full' ? 'still to come, then X-Zeit' : 'still to come, then the day is won' };
      return { label: 'Next', value: L.day === 'full' ? 'X-Zeit' : 'the end', sub: '' };
    }
    const { done, failed } = this.orders();
    return { label: L.day === 'full' ? 'Missions to X-Zeit' : 'Fire missions', value: `${done} / ${L.need}`, sub: `${failed} failed, ${L.fails} allowed`, warn: failed >= L.fails };
  }

  // an attack on a threat level: with its tanks when its side's laager still has half of them
  levelAssault(sec, size) {
    const sim = this.sim, t = sim.level.tanks ? sim.targetById(LAAGER[sec]) : null;
    let k = 1;
    if (t && t.alive && !this.handedOff.has(t.id) && sim.targetAI.alivePartCount(t) * 2 > t.parts.length) {
      k = TANK_K;
      sim.radio(`Their Mark IVs from the ${t.name} go in with the attack.`, 'alert');
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

  // a threat level's day: the same sites and traffic as the open battle's, the level's attacks, all inside its day.
  // Marked: an `order` (a site or traffic, none once the orders are over) and an `attack`. X-Zeit is not on the clock:
  // the close brings it (levelUpdate)
  levelScript() {
    const L = this.sim.level, S = [], D = this, end = DAY_END[L.day] ?? ZERO_T;
    const order = (t, fn) => { if (t < end) S.push({ t, order: true, fn: () => { if (!D.noOrders) fn(); } }); };
    order(0, () => D.siteMission('F1', { observer: 'foo', deadline: 700 }));
    order(70, () => D.siteMission('T1', { deadline: 650 }));
    order(200, () => D.siteMission('D1'));
    order(300, () => D.siteMission('F2', { observer: 'foo', deadline: 700 }));
    order(345, () => D.siteMission('T2'));
    order(420, () => D.siteMission('H1'));
    order(500, () => D.siteMission('D2'));
    order(560, () => D.convoy());
    order(640, () => D.train());
    for (const [t, sec, size] of ATTACKS.slice(0, L.attacks)) {
      if (L.tanks) order(t - 240, () => D.tanksMoving(sec));
      S.push({ t, attack: true, fn: () => D.levelAssault(sec, size) });
    }
    for (const t of [1330, 1450, 1590, 1710]) order(t, () => D.convoy());
    for (const t of [1360, 1640]) order(t, () => D.train());
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

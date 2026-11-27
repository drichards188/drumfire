// The British fire in the WW1 German mode. Their guns in the British game's pits (and the 18-pounders forward) answer
// with counter-battery fire that walks onto the loudest German unit, each at its own rate and reach and with its own
// shell (the British game's rows, the 18-pounder in tables_ww1.js); harassing fire falls on our villages and roads
// behind the ridge; a Trommelfeuer of 18-pounders and 4.5-inch howitzers hits our front line before their attacks;
// star shells at night. Aircraft: an RE8 artillery spotter circles over the loudest unit in daylight, and while it
// circles the British counter-battery on that unit finds its mark much faster; Sopwith Camels make low ground-attack
// raids (the WW2 raid machinery, with 25 lb Cooper bombs) on a unit that has been firing a lot in daylight. In the
// Paris Gun's mission (op kind 'paris') no British gun reaches the gun: only the Camels come, hunting its site every
// few minutes by day while it is built and while it fires. Its rounds on their aerodrome (effect 'air') keep some on
// the ground.
// Aircraft are plain objects in sim.aircraft { id, kind: 're8' | 'camel', pos, prev, vel, alive, t, ... }.
import { PLACES, LINES, lineX, DEG } from '../sector.js';
import { EnemyWW2 } from '../ww2/enemy.js';
import { TRAFFIC_CUT } from './director.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// per British kind: seconds between rounds of one gun (before difficulty and activity) and its reach in m
export const BRIT_FIRE = {
  bgun15: { period: 150, reach: 10500 },
  bgun92: { period: 105, reach: 12700 },
  bgun6: { period: 85, reach: 10400 },
  bgun60: { period: 75, reach: 14000 },
  bgunrail: { period: 200, reach: 20500 },
  bfield: { period: 60, reach: 8500 },
};

// the Paris Gun's mission: a Camel raid on the site every `every` to `every + spread` s by day (times the site's
// `hide`, divided by the root of the difficulty's counter-battery rate), the site's flak against them; the emplacement
// is big and its place known, so until it is camouflaged they bomb it closer than a field battery (the site's `spoil`
// below 0 tightens the raid's scatter, 70 m at 0). src/ww1/paris.js sets flak, spoil and hide.
export const HUNT = { first: 150, every: 240, spread: 180, flak: 0.3, spoil: -0.4 };
// their kite balloon's observer (a level's mission): the lock on our loudest battery as if it were this much louder
export const BALLOON_K = 1.3;

// The ranging counter-battery fire (sim.cbModel 'ranging': the default on a threat level's battle since 2026-11-26,
// `cbModel: 'old'` for the drizzle above; DESIGN.md "Ranging counter-battery"). In place of the drizzle on the loudest
// unit, each British battery takes one of our batteries on: single ranging rounds that walk in along its line of fire,
// the bracket, then fire for effect; our rangers place it from the rounds it fires, and our shells on it spoil its aim.
// Per threat level 1 to 10 where a row is a list. The climb: which of their guns answer and how many at once, how few
// ranging rounds they need, how heavy the fire for effect, how slowly our rangers find them, and at 9 and 10 that they
// shift after firing.
export const RANGING = {
  engage: 0.3, // a battery takes on a unit this loud (its signature, times their balloon's eyes)
  located: 0.15, // below it they cannot range: the engagement waits, and after `lose` s it is dropped
  lose: 75, loseCover: 45, // s below `located` before they have lost us (the shorter while the unit is in cover)
  again: 30, // s (give or take a third) before a battery that lost or finished one takes on another
  // the first level each British kind answers at (the others stand silent in their pits; the level's `heavies` flag,
  // threat.js, still gates their harassing fire and the Trommelfeuer, and from level 4 their sites as objectives:
  // operation.js). A battery an objective needs found (t.mustEngage) and the hunted railway gun answer at any level.
  from: { bfield: 1, bgun60: 4, bgun6: 4, bgun92: 5, bgun15: 7, bgunrail: 8 },
  batteries: [1, 1, 2, 2, 3, 3, 3, 3, 4, 5], // British batteries engaging at once (the flagged and the hunted besides)
  perUnit: [1, 1, 1, 2, 2, 2, 2, 2, 3, 3], // batteries on one of our units at a time
  // The counter-battery fire answers ours: nothing of theirs fires on our guns before one of ours has fired (they find
  // us by our flashes and our sound; the user, 2026-11-26: "before I fired my first round I was receiving 18 pound
  // counter battery fire"). It opens with a sure engagement about `open` s into the battle (sim.time, from the sim's
  // stream) but never before `after` s past our first round (the same draw placed in that range: no draw more): a
  // battery takes on our busiest battery, however quiet (a lone gun on the lower levels is never loud enough for
  // `engage`), and ranges on it while it fires (a round within `busy` s). On levels 2 and 3, `every` s after one ends,
  // the next; on the others the loudness rule carries on alone. The sure engagement is an ordinary one after its first
  // fire for effect. Both are about when the first round falls: a battery whose shell flies longer than `fly` s fires
  // that much sooner (a Langer Max far back on its rails is 48 s from the 60-pounders). A flagged battery (`mustEngage`)
  // waits for our first round too. When no kind that answers at the level reaches our busiest battery, the lightest
  // British battery that does takes it on.
  open: [[50, 80], [75, 135], [60, 120], [60, 110], [50, 100], [50, 100], [45, 90], [40, 80], [35, 75], [30, 60]],
  after: [[35, 60], [35, 60], [30, 55], [30, 50], [25, 45], [25, 45], [20, 40], [20, 40], [15, 35], [15, 30]],
  every: [null, [150, 240], [120, 200], null, null, null, null, null, null, null],
  busy: 90, fly: 20,
  // s between a gun's ranging rounds at the level's pace, over their supply (and faster as their fire grows after the
  // mission is accomplished: difficulty.cb over its value at the start); never before `wait` of the last one's flight
  // (their corrections lag a round behind: so the ranging walks in at a pace a player sees on a short battle)
  gap: { bfield: 24, bgun60: 26, bgun6: 30, bgun92: 36, bgun15: 42, bgunrail: 50 },
  gapK: [0.55, 0.6, 0.7, 0.8, 0.85, 0.85, 0.85, 0.85, 0.8, 0.8], // the level's pace on that
  wait: 0.5,
  first: 320, firstSig: 160, firstVar: 0.15, // the first round's miss, m: first + firstSig * (1 - signature), give or take
  scatter: 0.12, // a ranging round's scatter, of its miss
  angle: 35, // degrees either side of their line of fire that the rounds walk in along
  // ranging rounds before the bracket: the miss shrinks by the same factor every round so the last of them falls
  // within `bracket` (the RE8 over the unit squares the factor, about half the rounds, and their gap times spotGap;
  // their balloon up times eyesCorr)
  rounds: [5, 5, 5, 4, 4, 4, 3, 3, 2, 2],
  spotGap: 0.7, eyesCorr: 0.92,
  closing: 200, // a round within this: "closing in" (150 was often skipped: the rounds fall about 420, 250, 150, 90)
  bracket: 60, // the next miss within this: bracketed, and `bracketWait` of a gap later fire for effect
  bracketWait: 0.6,
  // fire for effect: `salvos` salvos `salvoGap` s apart, each by `share` of the battery's live guns (one at least),
  // `sigma` m of scatter round the gun. Level 1's is a scare: half an 18-pounder battery once, wide
  // (a battery gone silent under it, no round since it began, is taken for knocked out: only the first salvo comes)
  salvos: [1, 1, 1, 2, 2, 3, 3, 3, 3, 4],
  share: [0.5, 0.75, 1, 1, 1, 1, 1, 1, 1, 1],
  sigma: [50, 42, 36, 32, 28, 25, 24, 23, 22, 20],
  salvoGap: 10,
  rest: 70, // s after a fire for effect before the next on a unit still loud (one round to check the range, then it)
  spoil: 1.6, // our shells on the battery (suppressed): its next miss times this, a fire for effect under way stops
  // levels 9 and 10, "they shift after firing": after a fire for effect the battery moves to a position nearby (its
  // target stays at its site, a game's shortcut): our rangers' error times this, up to their first, in a new direction,
  // and a Gegenbatterie mission on it follows the loosened fix
  shift: [0, 0, 0, 0, 0, 0, 0, 0, 2, 2],
  // a battery an objective needs found (t.mustEngage, ww1/director.js): it engages before the others and past the
  // level's count, and at the latest this many s after the flag is set (or after its last engagement ends)
  must: [60, 120],
  // our sound and flash rangers' fix on a British battery (target.rangers): the error at first, times `k` for every
  // round the battery fires, `min` at best; placed (a Gegenbatterie mission) within `place` m. Harder levels: better
  // camouflage, so the fix forms slower and stops further off
  rangers: {
    err: [300, 320, 340, 360, 380, 400, 420, 440, 470, 500],
    k: [0.55, 0.58, 0.62, 0.65, 0.68, 0.7, 0.72, 0.75, 0.79, 0.82],
    min: [30, 35, 40, 45, 50, 55, 60, 70, 85, 95],
    place: 180,
  },
};
const RANK = { ranging: 0, closing: 1, bracketed: 2, ffe: 3 };
// the lock (0 to 1) whose fix (director.js fixOf) is this miss: the duel reads a battery's fire.lock
const lockOf = (miss) => clamp(1 - Math.pow(Math.max(0, miss - 35) / 400, 1 / 1.3), 0, 1);
const r50 = (m) => Math.max(50, Math.round(m / 50) * 50);
// a British battery's name in a sentence and on the console ("the British 18-pounder battery (Zouave Wood)")
export const britName = (t) => (/^British /.test(t.name) ? t.name : `British ${t.name.replace(/, (.*)$/, ' ($1)')}`);

export class EnemyWW1 extends EnemyWW2 {
  reset() {
    super.reset();
    this.re8T = 200;
    this.spotter = null; // { plane, unitId, until }
    this.huntT = HUNT.first;
    // the ranging counter-battery fire (RANGING): target id -> its engagement on one of our units; the tests' counts
    this.engs = new Map();
    this.engN = 0;
    this.cbStats = { engagements: 0, ffes: 0, lost: 0, spoiled: 0, shifts: 0, cut: 0, toFfe: [], toFfeClean: [], firstRound: null, firstFall: null, firstFfe: null };
    if (this.sim.cbModel) this.rangersReset();
  }

  // the British supply: the dumps behind their guns, the Paris Gun's rounds on the railway junction, and on a level's
  // mission a train or a convoy wrecked a while ago (ww1/director.js TRAFFIC_CUT)
  supply() {
    const sim = this.sim;
    let n = 0;
    for (const t of sim.targets) if (t.kind === 'bdump' && t.alive) n++;
    const cut = sim.director.trafficCut > sim.time ? TRAFFIC_CUT.k : 1;
    return (0.6 + 0.2 * n) * (sim.special?.supplyK?.() ?? 1) * cut;
  }

  update(dt) {
    const sim = this.sim, now = sim.time, diff = sim.difficulty;
    if (sim.theatre.op.kind !== 'battle') {
      this.huntUpdate(dt);
      this.warn();
      this.airUpdate(dt);
      return;
    }
    if (sim.scripted) this.hostileUpdate(dt); // the scripted range's hostile fire (sim/script.js hostile, the test range)
    // who is the loudest of our units
    let focus = null, fs = 0;
    for (const u of sim.units) if (u.alive && u.signature > fs) { fs = u.signature; focus = u; }
    const cbOn = (sim.phase >= 2 || sim.attract) && !sim.scripted;
    const sup = this.supply();
    const spot = this.spotter && this.spotter.plane.alive && this.spotter.circling ? this.spotter.unitId : null;
    const heavies = !sim.level || sim.level.heavies;
    const eyes = sim.objectives && sim.targets.some((t) => t.kind === 'bballoon' && t.alive && (t.haulK ?? 0) < 0.5) ? BALLOON_K : 1;
    if (sim.cbModel) this.rangingUpdate(dt, sup, spot, eyes);
    for (const t of cbOn && !sim.cbModel ? sim.targets : []) {
      if (!t.battery || !t.alive || t.present === false) continue; // (the railway gun withdrawn, a level's hunt: ww1/director.js)
      if (!heavies && t.kind !== 'bfield') continue; // (a threat level without them: only the 18-pounders answer)
      const f = t.fire, B = BRIT_FIRE[t.kind];
      f.cool -= dt;
      // the RE8 over the focus unit firms the locating up three times faster; their kite balloon up (a level's mission
      // that deals it, ops.js RIDGE_BALLOON) firms the fix itself
      const kl = focus && focus.id === spot ? 0.45 : 0.15;
      f.lock += ((focus && fs >= 0.2 ? Math.min(1, fs * eyes) : 0) - f.lock) * Math.min(1, dt * kl);
      if (f.cool > 0 || now < t.suppressed) continue;
      const alive = t.parts.filter((p) => p.alive);
      if (sim.targetAI.silenced(t) || f.ammo <= 0) continue;
      if (!focus || fs < 0.2) continue;
      // the nearest live gun of the focus unit within this battery's reach
      const p = focus.pieces.filter((q) => q.state !== 'dead' && Math.hypot(q.pos.x - t.pos.x, q.pos.z - t.pos.z) < B.reach);
      if (!p.length) { f.cool = 10; continue; }
      const act = clamp((fs - 0.15) / 0.55, 0.3, 1);
      const rate = alive.length * diff.cb * act * sup;
      f.cool = (sim.attract ? B.period / 6 : B.period) / Math.max(0.15, rate) * (0.7 + 0.6 * sim.rng());
      if (f.focus !== focus.id) { f.focus = focus.id; f.err = { x: sim.gauss(), z: sim.gauss() }; }
      const e = (focus.id === spot ? 22 : 35) + 400 * Math.pow(1 - clamp(f.lock, 0, 1), 1.3);
      const tp = p[Math.floor(sim.rng() * p.length)].pos;
      this._cb = true;
      this.launch(t.id, alive[Math.floor(sim.rng() * alive.length)], tp.x + (f.err.x * 0.5 + sim.gauss() * 0.7) * e, tp.z + (f.err.z * 0.5 + sim.gauss() * 0.7) * e, t.shell);
      this._cb = false;
      t.firedAt = now;
      t.active = true;
      f.ammo--;
      sim.stats.cbRounds++;
    }
    // harassing fire on our villages and roads behind the ridge (the field guns and the 6-inch)
    this.harassT -= dt;
    if (this.harassT <= 0 && !sim.scripted) {
      const gaps = [0, 45, 24, 16, 11, 12];
      this.harassT = (sim.attract ? 7 : gaps[sim.phase] ?? 20) * (0.6 + 0.8 * sim.rng()) / sup;
      const bs = this.batteries().filter((b) => b.kind === 'bfield' || (heavies && (b.kind === 'bgun6' || b.kind === 'bgun60')));
      if (bs.length) {
        const b = bs[Math.floor(sim.rng() * bs.length)];
        const reach = BRIT_FIRE[b.kind].reach;
        const spots = PLACES.filter((q) => q.pos.x > 5000 && q.kind !== 'wood' && Math.hypot(q.pos.x - b.pos.x, q.pos.z - b.pos.z) < reach);
        if (spots.length) {
          const sp = spots[Math.floor(sim.rng() * spots.length)];
          const n = 2 + Math.floor(sim.rng() * 3);
          for (let i = 0; i < n; i++) this.salvos.push({ t: now + i * (1.2 + sim.rng()), b, x: sp.pos.x + sim.gauss() * 120, z: sp.pos.z + sim.gauss() * 120 });
        }
      }
    }
    for (let i = this.salvos.length - 1; i >= 0; i--) {
      const s = this.salvos[i];
      if (s.t > now) continue;
      this.salvos.splice(i, 1);
      const alive = s.b.alive ? s.b.parts.filter((q) => q.alive) : [];
      if (alive.length) this.launch(s.b.id, alive[Math.floor(sim.rng() * alive.length)], s.x, s.z, s.kind ?? s.b.shell);
    }
    // star shells and Very lights over no man's land at night
    if (sim.night && !sim.scripted) {
      this.starT -= dt;
      if (this.starT <= 0) {
        this.starT = (sim.attract ? 6 : 22) * (0.6 + 0.8 * sim.rng());
        const z = -5500 + sim.rng() * 11000;
        const x = (lineX(LINES.britishFront, z) + lineX(LINES.germanFront, z)) / 2;
        sim.events.flare?.({ x, y: 160, z }, sim.rng() < 0.5 ? 'star' : 'very');
      }
    }
    this.warn();
    this.stormUpdate(dt);
    this.airUpdate(dt);
  }

  // ------------------------------------------------------------------ the ranging counter-battery fire (RANGING)
  // every round a British battery fires (counter-battery, harassing, the Trommelfeuer) is one more for our rangers
  launch(src, part, ax, az, kind, spawnPos) {
    const sh = super.launch(src, part, ax, az, kind, spawnPos);
    if (this.sim.cbModel) {
      const t = this.sim.targetById(src);
      if (t?.battery) this.heard(t);
    }
    return sh;
  }

  // a ranging round that falls moves its engagement on (rangedIn)
  onBurst(shell, pos) {
    const near = super.onBurst(shell, pos);
    if (shell.cbr) this.rangedIn(shell);
    return near;
  }

  // our rangers' fix on every British battery: a rough one at first, in a direction that stays; and when their
  // counter-battery fire opens (RANGING.open)
  rangersReset() {
    const sim = this.sim, R = RANGING, G = R.rangers, lv = sim.level.n - 1;
    this.rk = { err: G.err[lv], k: G.k[lv], min: G.min[lv] };
    for (const t of sim.targets ?? []) {
      if (!t.battery) continue;
      const a = sim.rng() * Math.PI * 2, err = this.rk.err;
      t.rangers = { err, x: t.pos.x + Math.cos(a) * err, z: t.pos.z + Math.sin(a) * err, placed: false, ax: Math.cos(a), az: Math.sin(a), n: 0 };
    }
    const o = R.open[lv];
    this.openFrac = sim.rng();
    this.openAt = o[0] + this.openFrac * (o[1] - o[0]);
    this.sureAt = this.openAt; // the next sure engagement (null: none to come)
    this.firstShotAt = null; // our first round (their fire waits for it: `after`)
    this.cb0 = sim.difficulty.cb || 1; // (the pace grows with their fire after the mission is accomplished)
  }

  heard(t) {
    const sim = this.sim, r = t.rangers;
    if (!r || sim.director.hunt?.t === t) return; // (the hunted railway gun has its own fix: director.js huntUpdate)
    r.n++;
    r.err = Math.max(this.rk.min, r.err * this.rk.k);
    r.x = t.pos.x + r.ax * r.err;
    r.z = t.pos.z + r.az * r.err;
    sim.director.rangersFix?.(t);
  }

  // the worst engagement on one of our units for the console (null: none it knows of): fire for effect, then bracketed,
  // closing, ranging; the smallest miss among equals. An engagement is known from its first round's fall.
  threatOn(u) {
    const w = this.sim.cbModel ? this.worst(u) : null;
    if (!w) return null;
    const t = this.sim.targetById(w.by);
    return { stage: this.stageOf(w), miss: Math.round(w.seen / 10) * 10, name: britName(t), by: w.by, since: w.t0 };
  }

  stageOf(e) {
    if (e.seen == null) return null;
    if (e.phase === 'ffe') return 'ffe';
    if (e.phase !== 'range') return 'bracketed';
    return e.seen < RANGING.closing ? 'closing' : 'ranging';
  }

  worst(u) {
    let best = null, br = -1;
    for (const e of this.engs.values()) {
      if (e.unitId !== u.id || e.seen == null) continue;
      const r = RANK[this.stageOf(e)];
      if (r > br || (r === br && e.seen < best.seen)) { br = r; best = e; }
    }
    return best;
  }

  // a line from the battery under fire; not two within 4 s (an alert only waits for another alert)
  cbSay(u, text, kind = 'warn') {
    const now = this.sim.time, alert = kind === 'alert';
    if (now - (alert ? u.cbAlertAt ?? -99 : u.cbSaidAt ?? -99) < 4) return;
    u.cbSaidAt = now;
    if (alert) u.cbAlertAt = now;
    this.sim.radio(text, kind);
  }

  // the piece an engagement ranges on: a live one within the battery's reach (another when it is lost), or null
  pieceFor(e, u, t, B) {
    const ok = (q) => q.state !== 'dead' && Math.hypot(q.pos.x - t.pos.x, q.pos.z - t.pos.z) < B.reach;
    const p = u.pieces[e.piece];
    if (p && ok(p)) return p;
    const live = u.pieces.filter(ok);
    if (!live.length) return null;
    const q = live[Math.floor(this.sim.rng() * live.length)];
    e.piece = q.i;
    return q;
  }

  // the batteries on one of our units, and whether a battery reaches it
  onUnit(u) {
    let n = 0;
    for (const e of this.engs.values()) if (e.unitId === u.id) n++;
    return n;
  }
  reaches(t, B, u) {
    return u.pieces.some((q) => q.state !== 'dead' && Math.hypot(q.pos.x - t.pos.x, q.pos.z - t.pos.z) < B.reach);
  }

  // our busiest battery in a battery's reach (a sure engagement's): the loudest of those that have fired within `busy`
  // s (or are loud enough to be located), the one that fired last among equals; null while none has
  busiest(t, B) {
    const sim = this.sim, R = RANGING, now = sim.time, max = R.perUnit[sim.level.n - 1];
    let best = null;
    for (const u of sim.units) {
      if (!u.alive || (now - u.lastShot > R.busy && u.signature < R.located) || !this.reaches(t, B, u) || this.onUnit(u) >= max) continue;
      if (!best || u.signature > best.signature || (u.signature === best.signature && u.lastShot > best.lastShot)) best = u;
    }
    return best;
  }

  // the unit a scheduled sure engagement takes on: our busiest battery in reach, or while none has fired, the first in
  // reach (`map`: laid from the map, it ranges on it whether it fires or not until its first fire for effect)
  sureUnit(t, B) {
    const u = this.busiest(t, B);
    if (u) return { u, map: false };
    if (this.sim.units.some((q) => q.alive && q.lastShot > -999)) return null;
    const max = RANGING.perUnit[this.sim.level.n - 1];
    for (const q of this.sim.units) if (q.alive && this.reaches(t, B, q) && this.onUnit(q) < max) return { u: q, map: true };
    return null;
  }
  // the flight of a British battery's shell to the nearest live gun of a unit (the enemy's shells: about 240 m/s, 48 s
  // at most, EnemyWW2 launch)
  flight(t, u) {
    let d = Infinity;
    for (const q of u.pieces) if (q.state !== 'dead') d = Math.min(d, Math.hypot(q.pos.x - t.pos.x, q.pos.z - t.pos.z));
    return Math.min(48, d / 240);
  }

  // a battery free to fire takes on the loudest of our units in its reach that fewer than `perUnit` already have (or,
  // a sure engagement, the unit given)
  engage(t, B, eyes, unit = null) {
    const sim = this.sim, R = RANGING, now = sim.time, max = R.perUnit[sim.level.n - 1];
    let best = unit, bs = R.engage;
    if (!best) for (const u of sim.units) {
      if (!u.alive || u.signature * eyes < bs || !this.reaches(t, B, u) || this.onUnit(u) >= max) continue;
      bs = u.signature * eyes;
      best = u;
    }
    if (!best) return null;
    const e = { id: ++this.engN, by: t.id, unitId: best.id, piece: -1, dx: 0, dz: 0, over: true, miss: 0, seen: null, phase: 'range', next: now, t0: now,
      n: 0, last: false, lastShell: null, gap: 0, low: 0, sup: false, salvo: 0, ffeEnd: 0, ffes: 0, saidClose: false, sure: !!unit, corr: 1 };
    const p = this.pieceFor(e, best, t, B);
    // the rounds walk in along a line near their line of fire, from beyond the gun or short of it
    const lx = p.pos.x - t.pos.x, lz = p.pos.z - t.pos.z, L = Math.hypot(lx, lz) || 1;
    const a = (sim.rng() * 2 - 1) * R.angle * DEG, sgn = sim.rng() < 0.5 ? -1 : 1, c = Math.cos(a), sn = Math.sin(a);
    e.dx = sgn * (lx * c - lz * sn) / L;
    e.dz = sgn * (lx * sn + lz * c) / L;
    e.over = sgn > 0;
    e.miss = (R.first + R.firstSig * (1 - Math.min(1, best.signature))) * (1 + (sim.rng() * 2 - 1) * R.firstVar);
    // (the level's ranging rounds: the miss after the last of them is within the bracket)
    e.corr = Math.pow((R.bracket * 0.85) / e.miss, 1 / R.rounds[sim.level.n - 1]);
    this.engs.set(t.id, e);
    this.cbStats.engagements++;
    return e;
  }

  // what the crew knows of their fire (the crews' cover, ww1/crews.js): its battery bracketed, or fire for effect on
  // it (`ffe` only: the fire for effect alone)
  dangerOn(u, ffe = false) {
    if (!this.sim.cbModel) return false;
    const now = this.sim.time;
    for (const e of this.engs.values()) if (e.unitId === u.id && e.seen != null && (e.phase === 'ffe' || now < e.ffeEnd || (!ffe && e.phase === 'bracket'))) return true;
    return false;
  }

  // an engagement over: 'lost' (the unit fell quiet long enough) is said, the rest (the battery silenced, suppressed
  // out of it, withdrawn; our unit lost) only shows
  disengage(t, e, why = null) {
    const sim = this.sim, R = RANGING, u = sim.unitById(e.unitId), lv = sim.level.n - 1;
    this.engs.delete(t.id);
    t.fire.cool = R.again * (0.7 + 0.6 * sim.rng());
    t.fire.lock = 0;
    // (levels 2 and 3: the next sure engagement some minutes after this one; a flagged battery comes back for the
    // objective that needs it found)
    // (one broken off before its first round, the battery withdrawn or silenced: another takes the opening on)
    if (e.sched && this.sureAt == null && !e.n) this.sureAt = sim.time + 10;
    else if (e.sched && this.sureAt == null && R.every[lv]) this.sureAt = sim.time + R.every[lv][0] + sim.rng() * (R.every[lv][1] - R.every[lv][0]);
    if (t.mustEngage) t.mustAt = sim.time + R.must[0] + sim.rng() * (R.must[1] - R.must[0]);
    if (why === 'lost') {
      this.cbStats.lost++;
      if (u?.alive && e.seen != null) this.cbSay(u, `${u.callsign}: the ${britName(t)} has lost us.`, 'info');
    }
  }

  // levels 9 and 10 (RANGING.shift): a battery that has fired for effect moves to a position nearby; our rangers'
  // fix on it loosens, and the Gegenbatterie missions on it (the rangers' and an objective's) are laid on the new fix
  shift(t) {
    const sim = this.sim, k = RANGING.shift[sim.level.n - 1], r = t.rangers;
    if (!k || !r || sim.director.hunt?.t === t) return;
    const a = sim.rng() * Math.PI * 2;
    r.err = Math.min(this.rk.err, r.err * k);
    r.ax = Math.cos(a);
    r.az = Math.sin(a);
    r.x = t.pos.x + r.ax * r.err;
    r.z = t.pos.z + r.az * r.err;
    this.cbStats.shifts++;
    if (!r.placed) return;
    t.cbErr = { x: r.x - t.pos.x, z: r.z - t.pos.z };
    let moved = false;
    for (const m of sim.missions) {
      if (m.targetId !== t.id || m.state === 'done' || m.state === 'failed' || !(m.rangers || m.kind === 'cb')) continue;
      m.x = r.x; m.z = r.z;
      m.gridRef = sim.theatre.ref(m.x, m.z);
      moved = true;
      // (the batteries on it on auto are laid on the new fix; the player's own re-lays from the board's flag)
      for (const id of m.units) { const u = sim.unitById(id); if (u?.alive && u.mode === 'auto') sim.guns.setTarget(u, m.x, m.z); }
    }
    sim.radio(`${sim.night ? 'Flash' : 'Sound'} rangers: the ${britName(t)} has shifted after its salvos; fix now ±${Math.round(r.err / 10) * 10} m${moved ? ', the mission laid on it' : ''}.`, 'phone');
  }

  // the batteries an objective needs found (t.mustEngage): each at the latest RANGING.must s after its flag is seen
  mustUpdate() {
    const sim = this.sim, R = RANGING;
    let n = 0;
    for (const t of sim.targets) {
      if (!t.battery) continue;
      if (!t.mustEngage) { t.mustAt = null; continue; }
      n++;
      if (t.mustAt == null) t.mustAt = sim.time + R.must[0] + sim.rng() * (R.must[1] - R.must[0]);
    }
    return n;
  }

  // a battery free to fire on our guns at this level: alive, in sight, not silenced (the level's rule too, half its
  // guns out: director.js spent), with ammunition, of a kind that answers at this level (or flagged, or hunted)
  free(t, n, any = false) {
    const sim = this.sim;
    return t.alive && t.present !== false && t.fire.ammo > 0 && !sim.targetAI.silenced(t) && !sim.director.spent?.(t) &&
      (any || RANGING.from[t.kind] <= n || !!t.mustEngage || sim.director.hunt?.t === t);
  }

  rangingUpdate(dt, sup, spot, eyes) {
    const sim = this.sim, now = sim.time, R = RANGING, lv = sim.level.n - 1;
    const pace = (0.6 + 0.4 * sim.difficulty.cb / this.cb0) * sup / R.gapK[lv];
    // (our first round: from it their fire may open, `after` s on at the soonest)
    if (this.firstShotAt == null && sim.units.some((q) => q.lastShot > -999)) {
      this.firstShotAt = now;
      const a = R.after[lv], t0 = now + a[0] + this.openFrac * (a[1] - a[0]);
      this.openAt = Math.max(this.openAt, t0);
      if (this.sureAt != null) this.sureAt = Math.max(this.sureAt, t0);
    }
    const heard = this.firstShotAt != null;
    let on = heard && now >= this.openAt && sim.state === 'playing';
    const cap = R.batteries[lv];
    // the flagged first: they engage before the others, past the level's count (and, their time come, before the rest
    // of their fire opens)
    const flagged = sim.state === 'playing' ? this.mustUpdate() : 0;
    const order = flagged ? [...sim.targets.filter((t) => t.mustEngage), ...sim.targets.filter((t) => !t.mustEngage)] : sim.targets;
    // the sure engagement that is due (the opening one; levels 2 and 3 the next ones): a battery that can, at random,
    // on our busiest battery in its reach
    if (heard && sim.state === 'playing' && this.sureAt != null && now >= this.sureAt - 30 && this.engs.size < cap) {
      const pick = (any) => sim.targets.filter((t) => t.battery && !this.engs.has(t.id) && this.free(t, lv + 1, any) && this.sureUnit(t, BRIT_FIRE[t.kind]));
      let cands = pick(false), any = false;
      if (!cands.length) {
        // (none of the kinds that answer here reaches one of ours: the lightest kind that does)
        cands = pick(true);
        const lo = Math.min(...cands.map((t) => R.from[t.kind]));
        cands = cands.filter((t) => R.from[t.kind] === lo);
        any = true;
      }
      // (one that none of our fire missions is on, if one can: the opening should come through to its fire for effect)
      const idle = cands.filter((t) => !sim.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed'));
      if (idle.length) cands = idle;
      // (each when its first round would fall about `open`; not while our shells keep its head down)
      cands = cands.filter((t) => !(now < t.suppressed) && now >= this.sureAt - Math.max(0, this.flight(t, this.sureUnit(t, BRIT_FIRE[t.kind]).u) - R.fly));
      if (cands.length) {
        const t = cands[Math.floor(sim.rng() * cands.length)], B = BRIT_FIRE[t.kind], s = this.sureUnit(t, B);
        const e = this.engage(t, B, eyes, s.u);
        Object.assign(e, { sched: true, any, map: s.map });
        this.sureAt = null;
        this.openAt = Math.min(this.openAt, now); // (their fire is open from this round on)
        on = true;
      }
    }
    for (const t of order) {
      if (!t.battery) continue;
      const f = t.fire, B = BRIT_FIRE[t.kind];
      let e = this.engs.get(t.id);
      const must = t.mustEngage && heard && now >= Math.max(t.mustAt, this.firstShotAt + R.after[lv][0]);
      const can = (on || (must && sim.state === 'playing')) && this.free(t, lv + 1, !!e?.any);
      let u = e ? sim.unitById(e.unitId) : null, p = e && can && u?.alive ? this.pieceFor(e, u, t, B) : null;
      if (e && !p) { this.disengage(t, e); e = null; }
      if (!e) {
        f.cool -= dt;
        if (!can || now < t.suppressed) continue;
        // a flagged battery past its time, and the hunted railway gun come up to fire: on our busiest battery, loud
        // or not; the rest by the loudness rule, while the level's count has room
        const hunted = sim.director.hunt?.t === t, due = hunted || must;
        if (!due && (f.cool > 0 || (!t.mustEngage && this.engs.size >= cap))) continue;
        const busy = due ? this.busiest(t, B) : null;
        e = this.engage(t, B, eyes, busy);
        if (!e) { f.cool = 4; continue; }
        u = sim.unitById(e.unitId);
        p = u.pieces[e.piece];
      }
      // the duel (director.js duelUpdate) reads the battery's focus and its fix
      f.focus = u.id;
      f.lock = lockOf(e.seen ?? e.miss);
      const sig = Math.min(1, u.signature * eyes);
      // (a sure engagement ranges on the unit while it fires, however quiet; after its first fire for effect, only
      // on a unit loud enough)
      const loc = sig >= R.located || (e.sure && (e.map || now - u.lastShot <= R.busy));
      // they lose a unit that stays quiet (never in the middle of a fire for effect)
      if (loc) e.low = 0;
      else if (e.phase !== 'ffe') {
        e.low += dt * (u.cover ? R.lose / R.loseCover : 1);
        if (e.low >= R.lose) { this.disengage(t, e, 'lost'); continue; }
      }
      // our shells on the battery: it stops, its bracket is spoiled, a fire for effect under way ends
      if (now < t.suppressed) {
        if (!e.sup) {
          e.sup = true;
          e.miss = Math.min(R.first + R.firstSig, e.miss * R.spoil);
          e.last = false;
          e.lastShell = null;
          this.cbStats.spoiled++;
          e.spoils = (e.spoils ?? 0) + 1;
          if (e.phase !== 'range') { e.phase = 'range'; e.salvo = 0; e.seen = Math.max(e.seen ?? 0, e.miss); }
          if (e.seen != null) this.cbSay(u, `${u.callsign}: our shells are on the ${britName(t)}: its aim on us is spoiled.`, 'info');
        }
        continue;
      }
      if (e.sup) { e.sup = false; e.next = Math.max(e.next, now + 2 + 4 * sim.rng()); }
      if (now < e.next) continue;
      const over = spot === u.id;
      if (e.phase === 'range') {
        if (e.last || !loc) continue; // (the last ranging round is in the air; or they cannot see us)
        const guns = t.parts.filter((q) => q.alive), m = e.miss;
        this._cb = true;
        const sh = this.launch(t.id, guns[Math.floor(sim.rng() * guns.length)], p.pos.x + e.dx * m + sim.gauss() * R.scatter * m, p.pos.z + e.dz * m + sim.gauss() * R.scatter * m, t.shell);
        this._cb = false;
        this.cbStats.firstRound ??= now;
        e.r0 ??= now;
        let c = e.corr;
        if (over) c *= c;
        if (eyes > 1) c *= R.eyesCorr;
        e.n++;
        e.miss = m * c;
        e.last = e.miss <= R.bracket;
        e.lastShell = sh;
        e.gap = R.gap[t.kind] / pace * (over ? R.spotGap : 1);
        e.next = now + Math.max(e.gap, sh.tof * R.wait);
        sh.cbr = { by: t.id, eng: e.id, miss: m };
        this.fired(t, 1);
      } else if (e.phase === 'ffe' && e.salvo <= 0) {
        // the last salvo has fallen: they rest, the bracket theirs (a sure engagement is an ordinary one from now on);
        // on levels 9 and 10 they shift to a position nearby
        e.phase = 'rest';
        e.next = now + R.rest;
        e.sure = false;
        e.map = false;
        this.shift(t);
      } else if (e.phase === 'ffe') {
        // a battery gone silent under it (no round since their fire for effect began: its crew in cover, or holding)
        // is taken for knocked out after the first salvo: the shoot is cut short. A battery that serves on through it
        // takes every salvo
        if (u.lastShot < e.ffeAt) {
          e.salvo = 0;
          e.next = e.ffeEnd; // (the fire for effect is over when the salvo in the air has fallen)
          this.cbStats.cut++;
          this.cbSay(u, `${u.callsign}: the ${britName(t)} has stopped its salvos: they take us for knocked out.`, 'info');
        } else this.salvo(t, e, p);
      }
      else if (e.phase === 'bracket') {
        // fire for effect after the bracket
        e.phase = 'ffe';
        e.salvo = R.salvos[lv];
        e.ffeAt = now;
        e.ffes++;
        this.cbStats.ffes++;
        if (e.ffes === 1) (e.spoils ? this.cbStats.toFfe : this.cbStats.toFfeClean).push(now - (e.r0 ?? e.t0));
        this.cbStats.firstFfe ??= now;
        this.cbSay(u, `${u.callsign}: fire for effect on us! Deckung!`, 'alert');
        this.salvo(t, e, p);
      } else if (sig >= R.engage) {
        // after a rest, on a unit still (or again) loud: one round to check the range (they have it: it falls within
        // the bracket), the fire for effect at its fall. The crew sees it coming: bracketed again
        e.phase = 'range';
        e.miss = R.bracket * 1.25;
        e.last = false;
      } else e.phase = 'hold'; // (the bracket kept on a unit fallen quieter, while they still have it located)
    }
    // the worst stage on each of our units, for the console and the HUD (events.cbStage)
    for (const u of sim.units) {
      const w = u.alive ? this.worst(u) : null, st = w ? this.stageOf(w) : null;
      if (st === (u.cbStage ?? null)) continue;
      u.cbStage = st;
      sim.events.cbStage?.(u, st, st ? this.threatOn(u) : null);
    }
  }

  // one salvo of a fire for effect: the level's share of the battery's live guns at once
  salvo(t, e, p) {
    const sim = this.sim, R = RANGING, lv = sim.level.n - 1, sg = R.sigma[lv];
    const live = t.parts.filter((g) => g.alive), k = Math.max(1, Math.round(live.length * R.share[lv]));
    let n = 0, tof = 0;
    this._cb = true;
    for (const g of live.slice(0, k)) {
      const sh = this.launch(t.id, g, p.pos.x + sim.gauss() * sg, p.pos.z + sim.gauss() * sg, t.shell);
      tof = Math.max(tof, sh.tof);
      n++;
    }
    this._cb = false;
    this.fired(t, n);
    e.salvo--;
    e.ffeEnd = sim.time + tof + 1;
    e.next = e.salvo > 0 ? sim.time + R.salvoGap : e.ffeEnd;
  }

  fired(t, n) {
    const sim = this.sim;
    t.firedAt = sim.time;
    t.active = true;
    t.fire.ammo -= n;
    sim.stats.cbRounds += n;
  }

  // a ranging round has fallen: our battery sees how close (the engagement is known from the first), the last one of
  // the ranging is the bracket
  rangedIn(shell) {
    const sim = this.sim, c = shell.cbr, e = this.engs.get(c.by);
    if (!e || e.id !== c.eng) return;
    const u = sim.unitById(e.unitId), t = sim.targetById(c.by);
    if (!u?.alive || !t) return;
    const first = e.seen == null, name = britName(t);
    e.seen = c.miss;
    this.cbStats.firstFall ??= sim.time;
    if (first) this.cbSay(u, `${u.callsign}: the ${name} is ranging on us, about ${r50(c.miss)} m ${e.over ? 'over' : 'short'}.`);
    if (e.lastShell === shell && e.last && e.phase === 'range') {
      e.phase = 'bracket';
      e.last = false;
      e.next = sim.time + e.gap * RANGING.bracketWait;
      this.cbSay(u, `${u.callsign}: bracketed by the ${name}! Their salvo is next: take cover (U), switch batteries or fire on them.`, 'alert');
    } else if (!first && c.miss < RANGING.closing && !e.saidClose) {
      e.saidClose = true;
      this.cbSay(u, `${u.callsign}: their rounds are closing in, about ${r50(c.miss)} m.`);
    }
  }

  // the Trommelfeuer on our front line before a British attack: 18-pounders and 4.5-inch howitzers
  stormUpdate(dt) {
    const sim = this.sim, h = this.storm;
    if (!h || sim.time > h.until) return;
    h.t -= dt;
    if (h.t > 0) return;
    h.t = 0.35 + sim.rng() * 0.5;
    const b = this.batteries().filter((q) => q.kind === 'bfield' || (q.kind === 'bgun6' && (!sim.level || sim.level.heavies)));
    if (!b.length) return;
    const t = b[Math.floor(sim.rng() * b.length)];
    const alive = t.parts.filter((p) => p.alive);
    const z = h.z0 + sim.rng() * (h.z1 - h.z0);
    if (alive.length) this.launch(t.id, alive[Math.floor(sim.rng() * alive.length)], lineX(LINES.germanFront, z) + sim.gauss() * 40, z + sim.gauss() * 30, sim.rng() < 0.65 ? 'b18' : 'b45');
  }

  // ------------------------------------------------------------------ aircraft
  // the Paris Gun's mission: Camels come looking for its site by day
  huntUpdate(dt) {
    const sim = this.sim;
    if (sim.scripted || sim.attract || sim.night) return;
    const u = sim.units.find((q) => q.alive);
    if (!u) return;
    this.huntT -= dt;
    if (this.huntT > 0) return;
    const st = u.special ?? {};
    this.huntT = (HUNT.every + sim.rng() * HUNT.spread) * (st.hide ?? 1) / Math.sqrt(sim.difficulty.cb);
    this.raid({ x: u.pos.x, z: u.pos.z, flak: st.flak ?? HUNT.flak, spoil: st.spoil ?? HUNT.spoil }, { n: 2 + (sim.rng() < 0.4 ? 1 : 0), warn: 45 });
  }

  // a Camel raid: the WW2 raid with the 1918 aircraft and their bombs (four 25 lb Coopers each)
  raid(target, { n = 2, warn = 40 } = {}) {
    const sim = this.sim, k = sim.special?.effectK?.('air') ?? 1;
    if (k < 1 && sim.rng() > k) return null; // the raid stays on the aerodrome
    const from = 270 * DEG + (sim.rng() - 0.5) * 0.8;
    const r = { id: sim.nextId('r'), target: { x: target.x, z: target.z }, at: sim.time + warn, n, kind: 'camel', weapon: 'cooper', planes: [], from, flak: target.flak ?? 0.15, spoil: target.spoil ?? 0 };
    this.raids.push(r);
    sim.events.raid?.(r, 'warning');
    sim.radio(`Fliegeralarm! ${n} Sopwith Camels coming in low${warn > 20 ? `, about ${Math.round(warn)} s` : ''}.`, 'alert');
    return r;
  }

  airUpdate(dt) {
    const sim = this.sim, now = sim.time;
    // the raid machinery steps the raiders only: the spotter is stepped here
    const keep = (sim.aircraft ?? []).filter((p) => p.kind === 're8');
    sim.aircraft = (sim.aircraft ?? []).filter((p) => p.kind !== 're8');
    super.airUpdate(dt);
    // a Camel is no Typhoon: the raid machinery's 150 m/s is cut to 90 (still quick, so the raid arrives in time)
    for (const p of sim.aircraft) if (p.kind === 'camel' && !p.slow) { p.slow = true; p.sp = 90; p.vel.x *= 0.6; p.vel.z *= 0.6; }
    sim.aircraft.push(...keep.filter((p) => p.alive || now - (p.deadAt ?? now) < 1));
    this.spotterUpdate(dt);
  }

  spotterUpdate(dt) {
    const sim = this.sim, now = sim.time;
    if (!sim.scripted && !sim.attract && !sim.night && sim.phase >= 2 && !this.spotter && (!sim.level || sim.level.spotters)) {
      this.re8T -= dt;
      if (this.re8T <= 0) {
        this.re8T = (240 + sim.rng() * 200) / sim.difficulty.cb / (sim.special?.effectK?.('air') ?? 1) / (sim.modifiers?.has('air') ? 2 : 1);
        let best = null, bs = 0.15;
        for (const u of sim.units) if (u.alive && u.signature > bs) { bs = u.signature; best = u; }
        if (best) {
          const a = 270 * DEG + (sim.rng() - 0.5) * 0.6, d = 8000;
          const x = best.pos.x + Math.sin(a) * d, z = best.pos.z - Math.cos(a) * d, y = sim.heightAt(x, z) + 1500;
          const plane = { id: sim.nextId('p'), kind: 're8', pos: { x, y, z }, prev: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, alive: true, t: 0, sp: 40, circle: { x: best.pos.x, z: best.pos.z, r: 900 } };
          sim.aircraft.push(plane);
          this.spotter = { plane, unitId: best.id, until: now + 140 + sim.rng() * 80, circling: false, ang: a };
          sim.radio(`Flieger: a British RE8 is coming over to spot for their guns. ${best.callsign} is its mark.`, 'warn');
        }
      }
    }
    const S = this.spotter;
    if (!S) return;
    const p = S.plane, c = p.circle;
    p.t += dt;
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
    const home = now > S.until || sim.night;
    let tx, tz;
    if (home) {
      tx = c.x - 12000; tz = c.z;
    } else {
      const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (!S.circling && d < c.r * 1.2) { S.circling = true; S.ang = Math.atan2(p.pos.x - c.x, -(p.pos.z - c.z)); }
      if (S.circling) {
        S.ang += (p.sp / c.r) * dt;
        tx = c.x + Math.sin(S.ang + 0.25) * c.r; tz = c.z - Math.cos(S.ang + 0.25) * c.r;
      } else { tx = c.x; tz = c.z; }
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z, L = Math.hypot(dx, dz) || 1;
    p.vel.x = dx / L * p.sp; p.vel.z = dz / L * p.sp;
    p.vel.y = clamp((sim.heightAt(p.pos.x, p.pos.z) + 1400 - p.pos.y) * 0.2, -5, 5);
    p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
    if (home && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > 9000) {
      p.alive = false;
      p.deadAt = now;
      this.spotter = null;
    }
  }
}

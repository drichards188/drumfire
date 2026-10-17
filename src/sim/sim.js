// The whole game simulation, pure logic (Node-safe, deterministic per seed). main.js wires `events` to the
// render layer, fx, audio and the UI, and forwards the consoles' commands to `command`.
// Per step: director, enemy fire, AI crews, guns (loading cycle and firing), shells, targets, infantry,
// observers. `update` splits long frames into fixed steps of 0.05 s.
import { mulberry32 } from '../noise.js';
import { ZONE, PLACES, SITES, SECTORS, LINES, lineX, bearingOf, DEG, YARD } from '../sector.js';
import { STEP, GUNS, SHELLS, FUZE, DIFFICULTY, G } from './tables.js';
import { rangeTable, solveElevation, autoCharge, stepBallistic } from './shells.js';
import { Guns, createUnits } from './guns.js';
import { Targets } from './targets.js';
import { Observers } from './observers.js';
import { Enemy } from './enemy.js';
import { Infantry } from './infantry.js';
import { Crews } from './crews.js';
import { Director, clockAt } from './director.js';
import { Script } from './script.js';

const _st = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const TAKE_MANUAL = new Set(['mission', 'lay', 'correct', 'charge', 'fuze', 'rounds', 'fire']);

export class Sim {
  // `theatre` (optional, the WW2 mode: src/ww2/theatre.js) supplies the units and sites and may replace the modules
  // (Targets, Observers, Enemy, Infantry, Crews, Director, plus an extra `Special` stepped after the guns). Without
  // it everything is the British game exactly as before.
  constructor({ heightAt, los = null, seed = 1, groundAt = null, theatre = null } = {}) {
    this.heightAt = heightAt;
    this.los = los;
    this.groundAt = groundAt;
    this.events = {};
    this.seed = seed;
    this.theatre = theatre;
    const M = theatre?.modules ?? {};
    this.bounds = theatre?.bounds ?? 40000;
    this.guns = new Guns(this);
    this.targetAI = new (M.Targets ?? Targets)(this);
    this.observers = new (M.Observers ?? Observers)(this);
    this.enemyAI = new (M.Enemy ?? Enemy)(this);
    this.infAI = new (M.Infantry ?? Infantry)(this);
    this.crews = new (M.Crews ?? Crews)(this);
    this.director = new (M.Director ?? Director)(this);
    this.special = M.Special ? new M.Special(this) : null;
    this.script = new Script(this);
    this.newGame();
  }

  // scripted: the tutorial range (no phases, spawns or German fire unless sim.script asks, our pieces take no damage,
  // every unit on hold, daylight only); see script.js
  newGame({ difficulty = 'Normal', attract = false, seed = this.seed, scripted = false } = {}) {
    this.seed = seed;
    this.scripted = scripted;
    this.invulnerable = scripted;
    this.rng = mulberry32(seed);
    this.difficultyName = difficulty;
    this.difficulty = { ...(DIFFICULTY[difficulty] ?? DIFFICULTY.Normal) };
    this.over = null; // the WW2 mode: { title, sub, stats } the end card shows
    this.attract = attract;
    if (attract) Object.assign(this.difficulty, { err: 0.5, dmg: 0, ammo: 3 });
    this.time = 0;
    this.acc = 0;
    this.alpha = 0;
    this.ids = {};
    this.shells = [];
    this.infantry = [];
    this.missions = [];
    this.reports = [];
    this.score = { points: 0, kills: 0, missions: 0, failed: 0 };
    this.stats = { rounds: 0, cbRounds: 0, piecesLost: 0, menKilled: 0, britishLost: 0, sectorsLost: 0, lossBy: { mebu: 0, open: 0, wire: 0, short: 0 }, missions: {}, sos: [], ranging: [] };
    this.phase = 1;
    this.clock = clockAt(0);
    this.night = false;
    // the day's meteor telegram: the wind (radians, blowing from) shifts the fall of shot a little
    const wb = (200 + this.rng() * 100) * DEG, ws = 2 + this.rng() * 6;
    this.wind = { bearing: wb, speed: ws, wx: -Math.sin(wb) * ws, wz: Math.cos(wb) * ws };
    this.units = createUnits(this);
    this._unitMap = new Map(this.units.map((u) => [u.id, u]));
    this.targetAI.reset();
    this.observers.reset();
    this.enemyAI.reset();
    this.infAI.reset();
    this.crews.reset();
    this.director.reset();
    this.special?.reset();
    this._missionMap = new Map();
    if (scripted) this.script.begin();
    this.state = attract ? 'attract' : 'playing';
    this.events.state?.(this.state);
  }

  // ---------------------------------------------------------------- helpers
  nextId(p) {
    this.ids[p] = (this.ids[p] ?? 0) + 1;
    return p + this.ids[p];
  }
  gauss() {
    return (this.rng() + this.rng() + this.rng() - 1.5) * 2;
  }
  radio(text, kind = 'info') {
    this.events.radio?.(text, kind);
  }
  unitById(id) {
    return this._unitMap.get(id);
  }
  targetById(id) {
    return this.targetAI.byId.get(id);
  }
  missionById(id) {
    return this.missions.find((m) => m.id === id);
  }
  setMissionState(m, s) {
    if (m.state === s) return;
    m.state = s;
    this.events.mission?.(m, s);
  }
  balloonUp() {
    const t = this.targetAI.byId?.get('K1');
    return !!t && t.alive && !this.night;
  }
  dumpFactor() {
    let n = 0;
    for (const t of this.targets) if (t.kind === 'dump' && t.alive) n++;
    return 0.5 + 0.25 * n;
  }
  rangeTable(kind, charge) {
    if (!GUNS[kind] || charge < 0 || charge >= GUNS[kind].charges.length) return [];
    return rangeTable(kind, charge).rows;
  }
  // nominal laying for a point from a unit (no errors): { line, range, el, tof, charge, ok }
  solve(unitId, x, z, charge = null) {
    const u = this.unitById(unitId);
    const dx = x - u.pos.x, dz = z - u.pos.z, D = Math.hypot(dx, dz);
    const c = charge ?? autoCharge(u.kind, D);
    const out = { line: bearingOf(dx, dz), range: D, el: 0, tof: 0, charge: c, ok: false };
    if (c < 0) return out;
    const s = solveElevation(u.kind, c, D, this.heightAt(x, z) - (u.pos.y + 2.5));
    if (s) Object.assign(out, s, { ok: true });
    return out;
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    if (this.state === 'victory' || this.state === 'defeat') {
      // the guns and shells finish; the director stops
      if (dt > 0) this.acc = Math.min(this.acc + dt, 2);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.step(STEP, true);
      }
      this.alpha = this.acc / STEP;
      return;
    }
    this.acc = Math.min(this.acc + dt, 2);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
    this.alpha = this.acc / STEP;
  }

  step(dt, over = false) {
    this.time += dt;
    if (!over) this.director.update(dt);
    this.enemyAI.update(dt);
    this.crews.update(dt);
    this.guns.update(dt);
    this.special?.update(dt, over);
    this.moveShells(dt);
    this.targetAI.update(dt);
    this.infAI.update(dt);
    this.observers.update(dt);
  }

  // ---------------------------------------------------------------- shells
  moveShells(dt) {
    const shells = this.shells, w = this.wind;
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      if (!s.alive) {
        shells.splice(i, 1);
        continue;
      }
      // a guided missile (the WW2 mode's V-1 and V-2) is flown by its controller (sim.special)
      if (s.guided) continue;
      s.prev.x = s.pos.x;
      s.prev.y = s.pos.y;
      s.prev.z = s.pos.z;
      s.t += dt;
      if (s.own) {
        _st.x = s.pos.x; _st.y = s.pos.y; _st.z = s.pos.z;
        _st.vx = s.vel.x; _st.vy = s.vel.y; _st.vz = s.vel.z;
        stepBallistic(_st, dt, s.k, w.wx, w.wz);
        s.pos.x = _st.x; s.pos.y = _st.y; s.pos.z = _st.z;
        s.vel.x = _st.vx; s.vel.y = _st.vy; s.vel.z = _st.vz;
      } else {
        s.vel.y -= G * dt;
        s.pos.x += s.vel.x * dt;
        s.pos.y += s.vel.y * dt;
        s.pos.z += s.vel.z * dt;
      }
      // shrapnel: the time fuze bursts it in the air when it has flown to the aimed range
      if (s.own && s.fuze === 'shrapnel' && s.vel.y < 0) {
        const prog = (s.pos.x - s.ox) * s.pbx + (s.pos.z - s.oz) * s.pbz;
        if (prog >= s.plane + s.fuzeErr) {
          const gy = this.heightAt(s.pos.x, s.pos.z);
          if (s.pos.y > gy + 2) {
            this.burst(s, { x: s.pos.x, y: s.pos.y, z: s.pos.z }, true);
            continue;
          }
        }
      }
      const h = this.heightAt(s.pos.x, s.pos.z);
      if (s.pos.y <= h) {
        // bisect between the two steps for the point where it met the ground
        let a = 0, b = 1;
        for (let k = 0; k < 14; k++) {
          const m = (a + b) / 2;
          const x = s.prev.x + (s.pos.x - s.prev.x) * m, z = s.prev.z + (s.pos.z - s.prev.z) * m;
          const y = s.prev.y + (s.pos.y - s.prev.y) * m;
          if (y <= this.heightAt(x, z)) b = m; else a = m;
        }
        const x = s.prev.x + (s.pos.x - s.prev.x) * b, z = s.prev.z + (s.pos.z - s.prev.z) * b;
        const p = { x, y: this.heightAt(x, z), z };
        s.pos.x = p.x; s.pos.y = p.y; s.pos.z = p.z;
        this.burst(s, p, false);
      } else if (s.t > 240 || Math.abs(s.pos.x) > this.bounds || Math.abs(s.pos.z) > this.bounds) {
        s.alive = false;
      }
    }
  }

  groundOf(x, z, kind) {
    if (this.groundAt) return this.groundAt(x, z);
    for (const s of SITES) if (s.kind === 'mebu' && Math.hypot(x - s.pos.x, z - s.pos.z) < 14) return 'concrete';
    for (const p of PLACES) if (p.kind !== 'wood' && Math.hypot(x - p.pos.x, z - p.pos.z) < p.r) return 'rubble';
    if (x > ZONE.from) {
      // deterministic puddles in the wasteland
      const hsh = Math.sin(x * 0.0131 + z * 0.0173) * 43758.5453;
      return (hsh - Math.floor(hsh)) < 0.22 && x > ZONE.full ? 'water' : 'mud';
    }
    return 'grass';
  }

  burst(s, p, air) {
    const sc = SHELLS[s.kind];
    s.alive = false;
    const f = FUZE[s.fuze] ?? FUZE.instant;
    const ground = this.groundOf(p.x, p.z, s.kind);
    const info = { calibre: sc.calibre, fuze: s.fuze, crater: air ? 0 : sc.crater * (s.own ? f.crater / 0.8 : 1), ground, hit: null, near: null, own: s.own };
    s.burstAt = { x: p.x, y: p.y, z: p.z };
    if (s.own) {
      info.hit = this.targetAI.applyBurst(s, p, air);
      this.targetAI.wireBurst(s, p);
      this.infAI.onBurst(s, p, air);
      this.observers.onBurst(s, p);
      const a = this.assaultOf(s);
      if (a && a.firstShotT == null && s.t0 >= a.rocketsT) a.firstShotT = s.t0;
    } else {
      info.near = this.enemyAI.onBurst(s, p);
      // German fire among our own wasteland and their lines is only noise to the infantry
      this.infAI.onBurst({ ...s, kind: s.kind, fuze: 'instant', unitId: null }, p, air);
    }
    this.events.shellBurst?.(s, p, info);
  }

  assaultOf(s) {
    for (const a of this.assaults) if (a.state === 'called' && a.missionId) {
      const m = this.missionById(a.missionId);
      if (m && m.units.includes(s.unitId)) return a;
    }
    return null;
  }

  // ---------------------------------------------------------------- commands
  command(unitId, name, args = {}) {
    const g = this.guns, d = this.director;
    if (name === 'sos') return this.sosCommand(args.sector);
    const u = this.unitById(unitId);
    if (!u || !u.alive) return false;
    if (TAKE_MANUAL.has(name) && u.mode === 'auto') u.mode = 'manual';
    switch (name) {
      case 'mission': {
        const m = this.missionById(args.id);
        if (!m) return false;
        return d.assign(u, m);
      }
      case 'lay':
        if (u.missionId != null) d.release(u);
        u.order.rounds = 1;
        u.order.fuze = 'instant';
        u.order.chargeAuto = true;
        g.setTarget(u, args.x, args.z, {});
        return u.order.ok;
      case 'correct': g.correct(u, args.add ?? 0, args.right ?? 0); return true;
      case 'charge': g.setCharge(u, args.charge); return true;
      case 'fuze': g.setFuze(u, args.fuze); return true;
      case 'rounds': g.setRounds(u, args.n); return true;
      case 'fire': return g.fire(u, args.guns);
      case 'cease': g.cease(u); return true;
      case 'mode': g.setMode(u, args.mode); return true;
    }
    return this.special?.command(u, name, args) ?? false;
  }

  sosCommand(sector) {
    if (this.theatre?.sosCommand) return this.theatre.sosCommand(this, sector);
    const a = this.assaults.find((q) => q.sector === sector && q.state === 'called');
    const m = a?.missionId ? this.missionById(a.missionId) : null;
    let n = 0;
    for (const u of this.units) {
      if (!u.alive) continue;
      let ok;
      if (m) ok = this.director.assign(u, m);
      else {
        const sec = SECTORS.find((s) => s.id === sector);
        const z = (sec.from + sec.to) / 2, x = (lineX(LINES.britishFront, z) * 0.7 + lineX(LINES.germanFront, z) * 0.3);
        this.guns.setTarget(u, x, z, { biasScale: 0.12, sheaf: 55, shift: (u.id - 3) * 65 });
        this.guns.setRounds(u, 99);
        ok = u.order.ok;
      }
      if (ok && u.order.ok) {
        if (u.mode === 'hold') u.mode = 'manual';
        this.guns.fire(u);
        n++;
      }
    }
    return n > 0;
  }
}

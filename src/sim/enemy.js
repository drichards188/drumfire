// The German side's fire: counter-battery fire that walks onto a unit whose signature has built up, harassing
// fire on roads and billets behind our line, the hurricane before an assault, and star shells over no man's
// land at night. Enemy shells fly a drag-free arc solved to land on the aim point.
import { PLACES, LINES, lineX, UNITS, SECTORS } from '../sector.js';
import { SHELLS, G } from './tables.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Enemy {
  constructor(sim) {
    this.sim = sim;
    this.reset();
  }

  reset() {
    this.harassT = 20;
    this.starT = 30;
    this.salvos = [];
    this.hurricaneUntil = 0;
    this.focusT = 0;
    this.hostiles = []; // scripted counter-battery fire (script.js)
  }

  batteries() {
    return this.sim.targets.filter((t) => t.kind === 'battery' && t.alive);
  }

  // build an enemy shell from a gun position to a ground point
  launch(src, part, ax, az, kind, spawnPos) {
    const sim = this.sim, sc = SHELLS[kind];
    const x0 = part ? part.x : spawnPos.x, z0 = part ? part.z : spawnPos.z;
    const y0 = sim.heightAt(x0, z0) + 2;
    const yT = sim.heightAt(ax, az);
    const D = Math.hypot(ax - x0, az - z0);
    const T = clamp(D / 240, 12, 48);
    const vx = (ax - x0) / T, vz = (az - z0) / T;
    const vy = (yT - y0 + 0.5 * G * T * T) / T;
    const shell = {
      id: sim.nextId('e'), own: false, unitId: null, piece: null, kind, calibre: sc.calibre,
      pos: { x: x0, y: y0, z: z0 }, prev: { x: x0, y: y0, z: z0 }, vel: { x: vx, y: vy, z: vz },
      fuze: 'instant', t: 0, tof: T, aim: { x: ax, z: az }, alive: true, k: 0, src,
    };
    sim.shells.push(shell);
    sim.events.enemyFire?.(src, part, shell);
    return shell;
  }

  update(dt) {
    const sim = this.sim, now = sim.time;
    const diff = sim.difficulty;
    // who is the loudest of our units
    let focus = null, fs = 0;
    for (const u of sim.units) if (u.alive && u.signature > fs) {
      fs = u.signature;
      focus = u;
    }
    const cbOn = sim.phase >= 2 || sim.attract;
    if (sim.scripted) this.hostileUpdate(dt);
    for (const t of sim.scripted ? [] : sim.targets) {
      if (t.kind !== 'battery' || !t.alive) continue;
      const f = t.fire;
      f.cool -= dt;
      f.lock += ((focus && fs >= 0.2 ? fs : 0) - f.lock) * Math.min(1, dt * 0.15);
      if (f.cool > 0 || now < t.suppressed) continue;
      const alive = t.parts.filter((p) => p.alive);
      if (alive.length <= 1 || f.ammo <= 0) continue; // one gun left: the battery is neutralised
      const dep = sim.dumpFactor();
      if (cbOn && focus && fs >= 0.2) {
        const act = clamp((fs - 0.15) / 0.55, 0.3, 1);
        const rate = alive.length * diff.cb * act * dep;
        f.cool = (sim.attract ? 14 : 85) / Math.max(0.15, rate) * (0.7 + 0.6 * sim.rng());
        // the error shrinks as the locating of the battery firms up
        if (f.focus !== focus.id) {
          f.focus = focus.id;
          f.err = { x: sim.gauss(), z: sim.gauss() };
        }
        const e = 35 + 400 * Math.pow(1 - clamp(f.lock, 0, 1), 1.3);
        const p = focus.pieces.filter((q) => q.state !== 'dead');
        const tp = p.length ? p[Math.floor(sim.rng() * p.length)].pos : focus.pos;
        const ax = tp.x + (f.err.x * 0.5 + sim.gauss() * 0.7) * e, az = tp.z + (f.err.z * 0.5 + sim.gauss() * 0.7) * e;
        this.launch(t.id, alive[Math.floor(sim.rng() * alive.length)], ax, az, t.shell);
        t.firedAt = now;
        t.active = true;
        f.ammo--;
        sim.stats.cbRounds++;
      }
    }
    // harassing fire on roads and villages behind our line
    this.harassT -= dt;
    if (this.harassT <= 0 && !sim.scripted) {
      const gaps = [0, 45, 24, 16, 11, 12];
      this.harassT = (sim.attract ? 7 : gaps[sim.phase] ?? 20) * (0.6 + 0.8 * sim.rng());
      const bs = this.batteries();
      if (bs.length) {
        const b = bs[Math.floor(sim.rng() * bs.length)];
        const spots = PLACES.filter((p) => p.pos.x < 4000 && p.kind !== 'wood');
        const sp = spots[Math.floor(sim.rng() * spots.length)];
        const n = 2 + Math.floor(sim.rng() * 3);
        for (let i = 0; i < n; i++) this.salvos.push({ t: now + i * (1.2 + sim.rng()), b, x: sp.pos.x + sim.gauss() * 120, z: sp.pos.z + sim.gauss() * 120 });
      }
    }
    // hurricane bombardment of the front trench
    if (now < this.hurricaneUntil) {
      this.hurricane.t -= dt;
      if (this.hurricane.t <= 0) {
        this.hurricane.t = 0.35 + sim.rng() * 0.5;
        const b = this.batteries();
        if (b.length) {
          const t = b[Math.floor(sim.rng() * b.length)];
          const z = this.hurricane.z0 + sim.rng() * (this.hurricane.z1 - this.hurricane.z0);
          const x = lineX(LINES.britishFront, z) + sim.gauss() * 40;
          this.salvos.push({ t: now, b: t, x, z: z + sim.gauss() * 30, kind: 'fk77' });
        }
      }
    }
    for (let i = this.salvos.length - 1; i >= 0; i--) {
      const s = this.salvos[i];
      if (s.t > now) continue;
      this.salvos.splice(i, 1);
      const alive = s.b.alive ? s.b.parts.filter((p) => p.alive) : [];
      const src = alive.length ? alive[Math.floor(sim.rng() * alive.length)] : null;
      if (src) this.launch(s.b.id, src, s.x, s.z, s.kind ?? s.b.shell);
    }
    // star shells and Very lights over no man's land at night
    if (sim.night) {
      this.starT -= dt;
      if (this.starT <= 0) {
        this.starT = (sim.attract ? 6 : 22) * (0.6 + 0.8 * sim.rng());
        const z = -5500 + sim.rng() * 11000;
        const x = (lineX(LINES.britishFront, z) + lineX(LINES.germanFront, z)) / 2;
        sim.events.flare?.({ x, y: 160, z }, sim.rng() < 0.5 ? 'star' : 'very');
      }
    }
    // incoming warnings
    for (const s of sim.shells) {
      if (s.own || s.warned || s.tof - s.t > 4.2) continue;
      s.warned = true;
      for (const u of sim.units) {
        if (!u.alive) continue;
        for (const p of u.pieces) {
          if (p.state !== 'dead' && Math.hypot(p.pos.x - s.aim.x, p.pos.z - s.aim.z) < 400) {
            sim.events.incoming?.(s);
            u.underFire = Math.max(u.underFire, now - 30);
            u.warnedAt = now;
            return;
          }
        }
      }
    }
  }

  // The scripted range's counter-battery fire: a battery shells a unit, the first round `start` m off toward the
  // battery and each next `walk` m closer, one round per `interval`. It ends when the battery is dead or
  // silenced, or (after `grace` rounds) when the unit's signature is under the level at which the normal
  // game's batteries stop finding it (0.2), i.e. it has held fire long enough.
  hostileUpdate(dt) {
    const sim = this.sim, now = sim.time;
    for (let i = this.hostiles.length - 1; i >= 0; i--) {
      const h = this.hostiles[i], t = sim.targetById(h.bat), u = sim.unitById(h.at);
      const alive = t ? t.parts.filter((p) => p.alive) : [];
      if (!t || !u || !u.alive || !t.alive || alive.length <= 1 || (h.n >= h.grace && u.signature < 0.2)) {
        this.hostiles.splice(i, 1);
        continue;
      }
      h.cool -= dt;
      if (h.cool > 0 || now < t.suppressed) continue;
      h.cool = h.interval;
      const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, r = Math.hypot(dx, dz) || 1;
      const d = Math.max(0, h.start - h.walk * h.n);
      const ax = u.pos.x + dx / r * d + sim.gauss() * 12, az = u.pos.z + dz / r * d + sim.gauss() * 12;
      this.launch(t.id, alive[Math.floor(sim.rng() * alive.length)], ax, az, t.shell);
      t.firedAt = now;
      t.active = true;
      h.n++;
      sim.stats.cbRounds++;
    }
  }

  hurricaneOn(sector, secs) {
    const sec = SECTORS.find((s) => s.id === sector);
    this.hurricaneUntil = this.sim.time + secs;
    this.hurricane = { t: 0, z0: sec.from, z1: sec.to };
  }

  // an enemy shell burst: damage to our pieces
  onBurst(shell, pos) {
    const sim = this.sim, sc = SHELLS[shell.kind];
    let near = null;
    for (const u of sim.units) {
      if (!u.alive) continue;
      for (const p of u.pieces) {
        if (p.state === 'dead') continue;
        const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
        if (d < 160) u.underFire = sim.time;
        if (d < 60 && (!near || d < near.d)) near = { unitId: u.id, piece: p.i, d };
        if (d < sc.pieceR) {
          const dmg = sc.soft.D * 0.75 * (1 - d / sc.pieceR) * (0.7 + 0.6 * sim.rng());
          sim.guns.damagePiece(u, p, dmg, d < 5);
          u.hits++;
        }
      }
    }
    return near && { unitId: near.unitId, piece: near.piece };
  }
}

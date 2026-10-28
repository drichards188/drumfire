// German targets: batteries, pillboxes, dumps, the kite balloon, the chateau HQ, the crossroads traffic and the
// railhead trains, plus wire belts. Damage from a game table by calibre, fuze and hardness; dumps and
// battery pits cook off in chains.
import { SITES, YARD } from '../sector.js';
import { TARGETS, SHELLS, FUZE } from './tables.js';
import { partLayout } from '../models/t/layout.js';

const CROSS_KINDS = ['wagon', 'wagon', 'gun', 'lorry'];

export class Targets {
  constructor(sim) {
    this.sim = sim;
    this.pending = []; // chain explosions {t, target, part, size}
    this.wires = [];
  }

  reset() {
    const sim = this.sim;
    this.pending.length = 0;
    this.wires = [];
    sim.targets = (sim.theatre?.sites ?? SITES).map((s) => this.make(s));
    this.byId = new Map(sim.targets.map((t) => [t.id, t]));
  }

  make(s) {
    const sim = this.sim, def = TARGETS[s.kind];
    const y = s.kind === 'balloon' ? s.alt : sim.heightAt(s.pos.x, s.pos.z);
    const t = {
      id: s.id, kind: s.kind, name: s.name, pos: { x: s.pos.x, y, z: s.pos.z }, bearing: s.bearing, r: s.r,
      alive: true, known: s.kind === 'mebu' || s.kind === 'hq', active: false, present: true, hp: 0, maxHp: 0,
      parts: [], damage: 0, suppressed: 0, firedAt: -999, hits: 0, respawnAt: 0, site: s,
    };
    // parts stand where the models put them: layout offsets in the site's frame (local -Z faces the bearing)
    const b = s.bearing, rx = Math.cos(b), rz = Math.sin(b), fx = Math.sin(b), fz = -Math.cos(b);
    const lay = partLayout(s.kind, { alt: s.alt });
    lay.forEach((o, i) => {
      const x = s.pos.x + rx * o.x - fx * o.z, z = s.pos.z + rz * o.x - fz * o.z;
      const part = { x, z, hp: def.partHp, alive: true };
      if (s.kind === 'balloon' || o.y) part.y = o.y;
      if (s.kind === 'crossroads') part.type = CROSS_KINDS[i % 4];
      t.parts.push(part);
      t.maxHp += def.partHp;
    });
    t.hp = t.maxHp;
    if (s.kind === 'crossroads' || s.kind === 'railyard') {
      // mobile: nothing is there until the director sends traffic or a train
      t.present = false;
      for (const p of t.parts) p.alive = false;
      t.hp = 0;
    }
    if (s.kind === 'battery') {
      t.fire = { cool: 5 + sim.rng() * 20, ammo: 900, focus: null, lock: 0, err: null, errAt: 0, harass: 0 };
      t.shell = s.id === 'B2' || s.id === 'B4' ? 'm21' : 'fh15';
    }
    return t;
  }

  alivePartCount(t) {
    let n = 0;
    for (const p of t.parts) if (p.alive) n++;
    return n;
  }

  // ----------------------------------------------------------------- mobile targets
  convoy(t, dir = 1) {
    const sim = this.sim, def = TARGETS.crossroads;
    t.present = true;
    t.alive = true;
    t.maxHp = def.partHp * t.parts.length;
    t.hp = t.maxHp;
    t.damage = 0;
    t.convoy = { age: 0, speed: 2.6 * dir, start: -170 * dir };
    t.parts.forEach((p, i) => {
      p.hp = def.partHp;
      p.alive = true;
      p.off = -i * 13 * dir;
    });
    t.active = true;
    this.placeConvoy(t);
  }

  placeConvoy(t) {
    const c = t.convoy, ang = t.site.roadBearing ?? Math.PI / 2 + 0.35;
    const dx = Math.sin(ang), dz = -Math.cos(ang);
    const s = c.start + c.speed * c.age;
    for (const p of t.parts) {
      const o = s + p.off;
      p.x = t.pos.x + dx * o;
      p.z = t.pos.z + dz * o;
    }
  }

  train(t) {
    const def = TARGETS.railyard;
    t.present = true;
    t.alive = true;
    t.maxHp = def.partHp * t.parts.length;
    t.hp = t.maxHp;
    t.damage = 0;
    t.trainAge = 0;
    for (const p of t.parts) {
      p.hp = def.partHp;
      p.alive = true;
    }
    t.active = true;
  }

  // ----------------------------------------------------------------- damage
  hardOf(t) {
    return TARGETS[t.kind].hardness === 'hard';
  }

  // HE effect of a burst on one part (3D distance for the balloon)
  partDamage(sc, f, hard, d, shrapnel, rng) {
    let R, Dm;
    if (hard) {
      R = sc.hard ? sc.hard.R : 0;
      Dm = sc.hard ? sc.hard.D * f.hard : 0;
      if (shrapnel) return 0;
    } else {
      R = sc.soft.R * (shrapnel ? 1.5 : 1);
      Dm = sc.soft.D * f.soft * (shrapnel ? 1 : 1);
    }
    if (d >= R || R <= 0) return 0;
    const k = 1 - d / R;
    return Dm * k * (0.8 + 0.4 * rng());
  }

  applyBurst(shell, p, air) {
    const sim = this.sim, sc = SHELLS[shell.kind], f = FUZE[shell.fuze] ?? FUZE.instant;
    const shr = shell.fuze === 'shrapnel';
    let hitId = null;
    for (const t of sim.targets) {
      if (!t.alive || !t.present) continue;
      const far = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
      if (far > t.r + 80) continue;
      const hard = this.hardOf(t);
      let total = 0, worst = 0;
      t.parts.forEach((part, i) => {
        if (!part.alive) return;
        let d = Math.hypot(p.x - part.x, p.z - part.z);
        if (part.y != null) d = Math.hypot(d, p.y - (part.y + (part.y > 0 ? 0 : sim.heightAt(part.x, part.z))));
        else if (air) d = Math.hypot(d, Math.max(0, p.y - sim.heightAt(part.x, part.z)));
        let dmg = this.partDamage(sc, f, hard, d, shr, sim.rng);
        if (!dmg) return;
        if (shell.dmgK) dmg *= shell.dmgK; // the battery's shells upgrade (research.js)
        if (i === 0 && t.kind === 'balloon' && shr) dmg = 12 * Math.max(0, 1 - d / 55);
        if (dmg <= 0) return;
        total += dmg;
        worst = Math.max(worst, dmg);
        this.damagePart(t, i, dmg, shell.unitId ?? (shell.support ? `support:${shell.support}` : null)); // (off-map support: its weapon's credit)
      });
      if (total > 0) {
        hitId = t.id;
        sim.events.targetHit?.(t, null, total);
        const u = sim.unitById(shell.unitId);
        if (u) u.stats.hits++;
      }
      // suppression of a battery by near bursts
      if ((t.kind === 'battery' || t.kind === 'mebu') && t.alive) {
        const near = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
        if (near < 55 + sc.calibre * 3) t.suppressed = Math.max(t.suppressed, sim.time + 18 + sc.calibre * 2.5);
      }
    }
    return hitId;
  }

  damagePart(t, i, dmg, by) {
    const sim = this.sim, part = t.parts[i];
    if (!part.alive) return;
    // the battle's pay (sim.credit): a quarter point for each point of damage that counted; the target's score half
    // shared among its parts as each is knocked out (a gun of a battery, a tank of a laager) and half for the kill
    const why = { kind: t.kind, name: t.name, id: t.id };
    sim.credit(by, Math.min(part.hp, dmg) * 0.25, { act: 'hit', ...why });
    part.hp -= dmg;
    t.hp = Math.max(0, t.hp - dmg);
    t.damage = 1 - t.hp / t.maxHp;
    if (part.hp > 0) return;
    part.hp = 0;
    part.alive = false;
    t.hits++;
    const pos = { x: part.x, y: sim.heightAt(part.x, part.z) + 1, z: part.z };
    if (t.kind === 'dump' || (t.kind === 'railyard' && i >= 1 && i <= 4)) {
      sim.events.secondary?.(pos, 1.5 + sim.rng() * 2.2);
      for (let j = 0; j < t.parts.length; j++) {
        const q = t.parts[j];
        if (!q.alive) continue;
        const d = Math.hypot(q.x - part.x, q.z - part.z);
        if (d < 45) this.pending.push({ t: sim.time + 0.8 + d / 30 + sim.rng() * 1.5, target: t, part: j, dmg: 14 + sim.rng() * 14, by });
      }
    } else if (t.kind === 'battery' && sim.rng() < 0.4) {
      sim.events.secondary?.(pos, 0.6 + sim.rng() * 0.8);
    } else if (t.kind === 'hq') {
      sim.events.secondary?.(pos, 2);
    }
    const was = t.alive, score = TARGETS[t.kind].score;
    this.checkDead(t, by);
    if (was && !t.alive) sim.credit(by, score * 0.5 + score * 0.5 / t.parts.length, { act: 'kill', ...why });
    else sim.credit(by, score * 0.5 / t.parts.length, { act: 'part', part: i, ...why });
  }

  checkDead(t, by) {
    const sim = this.sim;
    if (!t.alive) return;
    if (t.kind === 'balloon' ? t.parts[0].alive : this.alivePartCount(t) > 0) return;
    t.alive = false;
    t.active = false;
    t.hp = 0;
    t.damage = 1;
    t.respawnAt = sim.attract ? sim.time + 70 : t.kind === 'battery' ? sim.time + 420 : 0;
    sim.events.targetDestroyed?.(t, by ?? null);
    const u = by != null ? sim.unitById(by) : null;
    if (u) u.stats.kills++;
    if (!sim.attract) {
      sim.score.kills++;
      sim.score.points += TARGETS[t.kind].score;
    }
    sim.radio(`${t.name} destroyed.`, 'kill');
  }

  // ----------------------------------------------------------------- wire
  addWire(x, z, r, sector) {
    const w = { id: 'W' + (this.wires.length + 1), x, z, r, cut: 0, sector };
    this.wires.push(w);
    return w;
  }

  // a belt is a strip w.r long (north-south, half length) and narrow; bursts near it cut it
  wireBurst(shell, p) {
    const sc = SHELLS[shell.kind], f = FUZE[shell.fuze] ?? FUZE.instant;
    const R = sc.wire * 1.3;
    for (const w of this.wires) {
      if (w.cut >= 1) continue;
      const dz = Math.max(0, Math.abs(p.z - w.z) - w.r), dx = p.x - w.x;
      const d = Math.hypot(dx, dz);
      if (d >= R) continue;
      w.cut = Math.min(1, w.cut + 0.14 * (1 - d / R) * f.wire);
    }
  }

  // ----------------------------------------------------------------- per step
  update(dt) {
    const sim = this.sim, now = sim.time;
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const c = this.pending[i];
        if (c.t > now) continue;
        this.pending.splice(i, 1);
        const part = c.target.parts[c.part];
        if (part?.alive && c.target.alive) this.damagePart(c.target, c.part, c.dmg, c.by);
      }
    }
    for (const t of sim.targets) {
      if (t.convoy && t.present) {
        t.convoy.age += dt;
        this.placeConvoy(t);
        const lead = t.convoy.start + t.convoy.speed * t.convoy.age;
        if (Math.abs(lead) > 190 + t.parts.length * 13) {
          t.present = false;
          t.active = false;
          t.convoy = null;
          sim.events.targetGone?.(t);
        }
      }
      if (t.kind === 'railyard' && t.present && t.trainAge != null) {
        t.trainAge += dt;
        if (t.trainAge > 260) {
          t.present = false;
          t.active = false;
          t.trainAge = null;
          sim.events.targetGone?.(t);
        }
      }
      if (!t.alive && now > t.respawnAt && t.respawnAt > 0) this.revive(t);
      if (t.kind === 'battery' && t.alive) t.active = now - t.firedAt < 25;
    }
  }

  revive(t) {
    const def = TARGETS[t.kind];
    t.alive = true;
    t.hp = t.maxHp = def.partHp * t.parts.length;
    t.damage = 0;
    t.respawnAt = 0;
    for (const p of t.parts) {
      p.alive = true;
      p.hp = def.partHp;
    }
    if (t.kind === 'crossroads' || t.kind === 'railyard') t.present = false;
    if (t.kind === 'battery') {
      // a fresh battery moves into the position
      t.fire.ammo = 600;
      t.fire.cool = 30;
      t.suppressed = 0;
      t.cbLast = null;
      this.sim.radio(`${t.name} is active again.`, 'warn');
    }
  }
}

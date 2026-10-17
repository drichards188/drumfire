// The WW2 mode's targets: the British Targets with the Allied and Soviet kinds. Enemy batteries fire (their shell by
// calibre), the Allied convoy drives like the crossroads traffic, and 'deep' targets (the cliff magazine) are harmed
// only by the heaviest delay-fuzed shells.
import { Targets } from '../sim/targets.js';
import { TARGETS, SHELLS, FUZE } from '../sim/tables.js';

export const ENEMY_BATTERIES = new Set(['abattery', 'amedium', 'sbattery']);
// the shell an enemy battery fires (by site id where one site differs from its kind)
const BATTERY_SHELL = { abattery: 'q25', amedium: 'm55', sbattery: 's122' };
const SITE_SHELL = { G6: 's152', K4: 's76' };
const MOBILE = new Set(['aconvoy', 'railyard']);
const CONVOY_KINDS = ['lorry', 'lorry', 'tank', 'carrier'];

export class TargetsWW2 extends Targets {
  make(s) {
    const t = super.make(s);
    if (s.kind === 'aconvoy') {
      t.parts.forEach((p, i) => { p.type = CONVOY_KINDS[i % 4]; p.alive = false; });
      t.present = false;
      t.hp = 0;
    }
    if (ENEMY_BATTERIES.has(s.kind)) {
      t.fire = { cool: 5 + this.sim.rng() * 20, ammo: 900, focus: null, lock: 0, err: null, errAt: 0, harass: 0 };
      t.shell = SITE_SHELL[s.id] ?? BATTERY_SHELL[s.kind];
      t.battery = true;
    }
    // the eastern fortresses and the strongpoints are on the map from the start; batteries are found by ranging
    t.known = !ENEMY_BATTERIES.has(s.kind) && !MOBILE.has(s.kind);
    return t;
  }

  convoy(t, dir = 1) {
    super.convoy(t, dir);
    const def = TARGETS[t.kind];
    t.maxHp = def.partHp * t.parts.length;
    t.hp = t.maxHp;
    for (const p of t.parts) p.hp = def.partHp;
  }

  hardOf(t) {
    const h = TARGETS[t.kind].hardness;
    return h === 'soft' ? false : h;
  }

  partDamage(sc, f, hard, d, shrapnel, rng) {
    if (hard !== 'deep') return super.partDamage(sc, f, hard, d, shrapnel, rng);
    // under rock: only a shell with a deep row, delay-fuzed (f.hard > 1), reaches it
    if (!sc.deep || shrapnel || f.hard < 1.2 || d >= sc.deep.R) return 0;
    return sc.deep.D * (1 - d / sc.deep.R) * (0.8 + 0.4 * rng());
  }

  damagePart(t, i, dmg, by) {
    const was = t.parts[i]?.alive;
    super.damagePart(t, i, dmg, by);
    const sim = this.sim, part = t.parts[i];
    if (!was || part.alive) return;
    const pos = { x: part.x, y: sim.heightAt(part.x, part.z) + 1, z: part.z };
    // Allied dumps, tank laagers and the magazine burn and explode (the WW1 kinds already do in the base)
    if (t.kind === 'adump') {
      sim.events.secondary?.(pos, 1.5 + sim.rng() * 2.2);
      for (let j = 0; j < t.parts.length; j++) {
        const q = t.parts[j];
        if (!q.alive) continue;
        const dd = Math.hypot(q.x - part.x, q.z - part.z);
        if (dd < 45) this.pending.push({ t: sim.time + 0.8 + dd / 30 + sim.rng() * 1.5, target: t, part: j, dmg: 14 + sim.rng() * 14, by });
      }
    } else if (t.kind === 'tanks' || t.kind === 'aconvoy') sim.events.secondary?.(pos, 0.8 + sim.rng());
    else if (t.kind === 'magazine') {
      // the White Cliff: the magazine goes up in a chain of blasts over a minute
      for (let k = 0; k < 9; k++) this.pending.push({ t: sim.time + 1 + k * (2 + sim.rng() * 5), target: t, part: -1, dmg: 0, by, blast: 2.5 + sim.rng() * 1.5, pos });
    } else if (t.kind === 'turret' || t.kind === 'fort' || t.kind === 'citadel' || t.kind === 'eastfort' || t.kind === 'gate') sim.events.secondary?.(pos, 1.2 + sim.rng());
    else if (ENEMY_BATTERIES.has(t.kind) && sim.rng() < 0.4) sim.events.secondary?.(pos, 0.6 + sim.rng() * 0.8);
  }

  checkDead(t, by) {
    const sim = this.sim;
    if (!t.alive) return;
    if (this.alivePartCount(t) > 0) return;
    t.alive = false;
    t.active = false;
    t.hp = 0;
    t.damage = 1;
    t.respawnAt = sim.attract ? sim.time + 70 : ENEMY_BATTERIES.has(t.kind) && sim.theatre?.op.kind === 'battle' ? sim.time + 420 : 0;
    sim.events.targetDestroyed?.(t, by ?? null);
    const u = by != null ? sim.unitById(by) : null;
    if (u) u.stats.kills++;
    if (!sim.attract) {
      sim.score.kills++;
      sim.score.points += TARGETS[t.kind].score;
    }
    sim.radio(`${t.name} destroyed.`, 'kill');
  }

  update(dt) {
    const sim = this.sim, now = sim.time;
    // the magazine's chain of blasts (no part damage, just the explosions)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const c = this.pending[i];
      if (c.part !== -1 || c.t > now) continue;
      this.pending.splice(i, 1);
      sim.events.secondary?.({ x: c.pos.x + sim.gauss() * 12, y: c.pos.y + 4, z: c.pos.z + sim.gauss() * 12 }, c.blast);
    }
    super.update(dt);
    for (const t of sim.targets) {
      if (t.battery && t.alive) t.active = now - t.firedAt < 25;
    }
  }

  revive(t) {
    super.revive(t);
    if (t.battery) {
      t.fire.ammo = 600;
      t.fire.cool = 30;
      t.suppressed = 0;
      t.cbLast = null;
      this.sim.radio(`${t.name} is active again.`, 'warn');
    }
    if (t.kind === 'aconvoy') t.present = false;
  }
}

export { SHELLS, FUZE };

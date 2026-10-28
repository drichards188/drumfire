// The WW1 German mode's targets: the British side of 1918 on the turned-round map. The British game's own five units
// stand as targets in their own gun pits (sector.js UNITS, their parts at the pieces' placements), with two 18-pounder
// batteries forward; all of them fire back (counter-battery, enemy.js) with the British shell kinds and are found by
// ranging. Tank laagers and dumps burn and explode, the kite balloon falls when its envelope is hit, the road traffic
// at Hellfire Corner drives like the crossroads convoys and the railhead takes trains.
import { UNITS, piecePlacements } from '../sector.js';
import { TargetsWW2 } from '../ww2/targets.js';
import { TARGETS, SHELLS } from '../sim/tables.js';
import { partLayout } from '../models/t/layout.js';

// the British guns as targets, and the shell each fires (the British game's rows, the 18-pounder's in tables_ww1.js)
export const BRIT_BATTERIES = new Set(['bgun15', 'bgun92', 'bgun6', 'bgun60', 'bgunrail', 'bfield']);
export const BATTERY_SHELL = { bgun15: 'bl15', bgun92: 'bl92', bgun6: 'bl6', bgun60: 'bl60', bgunrail: 'rail', bfield: 'b18' };
const UNIT_OF = { bgun15: 'bl15', bgun92: 'bl92', bgun6: 'bl6', bgun60: 'bl60', bgunrail: 'rail' };
const CONVOY_KINDS = ['lorry', 'wagon', 'lorry', 'wagon']; // the AEC, a GS wagon and team, the Thornycroft, a GS wagon and pair

// The expected part layouts, used when models/t/ww1 has none yet (the british-guns and british-rear agents own the
// real ones; they must give the same points): site frame, -Z toward the site's bearing, +X its right.
// The British guns' parts are their pieces' placements (sector.js UNITS) seen from the site at the unit's position.
export function siteFrame(dx, dz, b) {
  const rx = Math.cos(b), rz = Math.sin(b), fx = Math.sin(b), fz = -Math.cos(b);
  return { x: dx * rx + dz * rz, z: -(dx * fx + dz * fz), y: 0 };
}
export function expectedLayout(kind, { alt = 800 } = {}) {
  if (UNIT_OF[kind]) {
    const u = UNITS.find((q) => q.kind === UNIT_OF[kind]);
    return piecePlacements(u).map((p) => siteFrame(p.x - u.pos.x, p.z - u.pos.z, u.zero));
  }
  switch (kind) {
    case 'bfield': return [{ x: -30, z: -4, y: 0 }, { x: -10, z: 4, y: 0 }, { x: 10, z: -3, y: 0 }, { x: 30, z: 5, y: 0 }];
    case 'btanks': return [{ x: -16, z: -4, y: 0 }, { x: -3, z: -9, y: 0 }, { x: 11, z: -5, y: 0 }, { x: 3, z: 12, y: 0 }];
    case 'bballoon': return [{ x: 0, z: 0, y: alt }, { x: -alt * 0.5, z: 0, y: 0 }];
    case 'bdump': return [{ x: -18, z: -10, y: 0 }, { x: 3, z: -17, y: 0 }, { x: 20, z: -3, y: 0 }, { x: -8, z: 9, y: 0 }, { x: 13, z: 17, y: 0 }];
    case 'bconvoy': return [{ x: -9, z: 5, y: 0 }, { x: 11, z: -7, y: 0 }, { x: 2, z: 12, y: 0 }, { x: -5, z: -12, y: 0 }];
  }
  return [];
}

export class TargetsWW1 extends TargetsWW2 {
  make(s) {
    const sim = this.sim, def = TARGETS[s.kind];
    let t;
    if (partLayout(s.kind, { alt: s.alt }).length) t = super.make(s);
    else {
      // no model layout yet: place the expected parts as base make() does
      t = super.make({ ...s, kind: 'hq' });
      t.kind = s.kind;
      t.site = s;
      t.parts = [];
      const b = s.bearing, rx = Math.cos(b), rz = Math.sin(b), fx = Math.sin(b), fz = -Math.cos(b);
      for (const o of expectedLayout(s.kind, { alt: s.alt })) {
        const part = { x: s.pos.x + rx * o.x - fx * o.z, z: s.pos.z + rz * o.x - fz * o.z, hp: def.partHp, alive: true };
        if (o.y) part.y = o.y;
        t.parts.push(part);
      }
      t.maxHp = t.hp = def.partHp * t.parts.length;
      t.known = true;
    }
    if (s.kind === 'bballoon') t.pos.y = sim.heightAt(s.pos.x, s.pos.z);
    if (s.kind === 'bconvoy') {
      t.parts.forEach((p, i) => { p.type = CONVOY_KINDS[i % 4]; p.alive = false; });
      t.present = false;
      t.hp = 0;
    }
    if (BRIT_BATTERIES.has(s.kind)) {
      t.fire = { cool: 5 + sim.rng() * 20, ammo: 900, focus: null, lock: 0, err: null, errAt: 0, harass: 0 };
      t.shell = BATTERY_SHELL[s.kind];
      t.battery = true;
      t.heavy = s.kind !== 'bfield';
    }
    // the dumps, laagers, the HQ and the balloon are on the map; the batteries are found by ranging and sound
    // (a threat level's poor intelligence: nothing known until an observer reports on it, ww1/director.js)
    t.known = !BRIT_BATTERIES.has(s.kind) && s.kind !== 'bconvoy' && s.kind !== 'railyard' && !this.sim.modifiers?.has('intel');
    return t;
  }

  // a battery is out of action when it cannot fire: a one-gun position when its gun is gone, a battery with one left
  silenced(t) {
    const n = this.alivePartCount(t);
    return t.parts.length > 1 ? n <= 1 : n === 0;
  }

  applyBurst(shell, p, air) {
    const hit = super.applyBurst(shell, p, air);
    // near bursts keep the British gunners' heads down (the base does it for its own kind 'battery')
    const sim = this.sim, sc = SHELLS[shell.kind];
    for (const t of sim.targets) {
      if (!t.battery || !t.alive) continue;
      const near = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
      if (near < 55 + sc.calibre * 3) t.suppressed = Math.max(t.suppressed, sim.time + 18 + sc.calibre * 2.5);
    }
    return hit;
  }

  damagePart(t, i, dmg, by) {
    const was = t.parts[i]?.alive;
    const kind = t.kind;
    // the dumps and laagers use the WW2 kinds' chains and blasts
    if (kind === 'bdump') t.kind = 'adump';
    else if (kind === 'btanks') t.kind = 'tanks';
    else if (kind === 'bconvoy') t.kind = 'aconvoy';
    try {
      super.damagePart(t, i, dmg, by);
    } finally {
      t.kind = kind;
    }
    const sim = this.sim, part = t.parts[i];
    if (!was || part.alive) return;
    const pos = { x: part.x, y: (part.y ?? 0) + sim.heightAt(part.x, part.z) + 1, z: part.z };
    if (kind === 'bballoon' && i === 0) sim.events.secondary?.(pos, 1.2); // the envelope burns
    else if (BRIT_BATTERIES.has(kind) && t.heavy && sim.rng() < 0.6) sim.events.secondary?.(pos, 1 + sim.rng() * 1.2); // the cordite in the pit
  }

  checkDead(t, by) {
    const sim = this.sim;
    if (!t.alive) return;
    if (t.kind === 'bballoon' ? t.parts[0].alive : this.alivePartCount(t) > 0) return;
    t.alive = false;
    t.active = false;
    t.hp = 0;
    t.damage = 1;
    // a fresh battery (or a replacement gun for the heavies) moves into the position after a while
    t.respawnAt = sim.attract ? sim.time + 70 : t.battery ? sim.time + (t.heavy ? 600 : 420) : t.kind === 'bballoon' ? sim.time + 500 : 0;
    sim.events.targetDestroyed?.(t, by ?? null);
    const u = by != null ? sim.unitById(by) : null;
    if (u) u.stats.kills++;
    if (!sim.attract) {
      sim.score.kills++;
      sim.score.points += TARGETS[t.kind].score;
    }
    sim.radio(`${t.name} destroyed.`, 'kill');
  }

  revive(t) {
    super.revive(t);
    if (t.kind === 'bconvoy') t.present = false;
    if (t.kind === 'bballoon') this.sim.radio('A new British kite balloon is going up.', 'warn');
  }
}

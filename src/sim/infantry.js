// Infantry: German assault groups that form in their front trench under the red rockets, cross no man's
// land and take our line if enough of them arrive; British groups at Zero hour that walk behind the
// creeping barrage. Men are individuals with per-man offsets (the render draws them from this).
import { LINES, lineX, SECTORS } from '../sector.js';
import { SHELLS, FUZE } from './tables.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Infantry {
  constructor(sim) {
    this.sim = sim;
    this.assaults = [];
  }

  reset() {
    this.sim.infantry = [];
    this.assaults = [];
    this.sim.assaults = this.assaults;
  }

  makeGroup(side, sector, x, z, n, bearing, state) {
    const sim = this.sim;
    const men = [];
    for (let i = 0; i < n; i++) men.push({ dx: (i / Math.max(1, n - 1) - 0.5) * 80 + sim.gauss() * 3, dz: sim.gauss() * 4, alive: true, t: 0 });
    const g = { id: sim.nextId('g'), side, sector, state, pos: { x, z }, bearing, n0: n, men, n, t0: sim.time, stateT: 0, speed: 0, rec: null };
    sim.infantry.push(g);
    return g;
  }

  // a German assault of 3 groups on a sector; the director makes the SOS mission
  spawnAssault(sectorId, size = 1) {
    const sim = this.sim;
    const sec = SECTORS.find((s) => s.id === sectorId);
    const zc = sec.from + 500 + sim.rng() * (sec.to - sec.from - 1000);
    const n = Math.max(10, Math.round(30 * size * sim.difficulty.assault));
    const a = { id: sim.nextId('a'), sector: sectorId, groups: [], zc, t0: sim.time, state: 'forming', missionId: null, breaches: 0, n0: 0, rocketsAt: sim.time + 5 };
    for (let k = -1; k <= 1; k++) {
      const z = zc + k * 110;
      const xg = lineX(LINES.germanFront, z), xb = lineX(LINES.britishFront, z);
      const g = this.makeGroup('german', sectorId, xg + 4, z, n, 270 * Math.PI / 180, 'forming');
      g.goal = xb + 14;
      g.crossing = 90 + sim.rng() * 60;
      g.speed = (xg - xb) / g.crossing;
      g.go = 24 + sim.rng() * 6;
      g.assault = a;
      a.groups.push(g);
      a.n0 += n;
    }
    this.assaults.push(a);
    return a;
  }

  // SOS line of an assault: on no man's land just in front of our wire, across the frontage
  sosPoint(a, f = 0.3) {
    const z = a.zc;
    const xg = lineX(LINES.germanFront, z), xb = lineX(LINES.britishFront, z);
    return { x: xb + (xg - xb) * f, z };
  }

  // British groups for Zero hour in the lanes (sector ids)
  spawnBritish(lanes) {
    const sim = this.sim;
    for (const l of lanes) for (let k = 0; k < 2; k++) {
      const z = l.z + (k - 0.5) * 220;
      const x = lineX(LINES.britishFront, z) - 8;
      const g = this.makeGroup('british', l.sector, x, z, 34, 90 * Math.PI / 180, 'forming');
      g.lane = l;
      g.goal = lineX(LINES.germanSupport, z) + 40;
    }
  }

  alive(g) {
    return g.n;
  }

  kill(g, m) {
    if (!m.alive) return;
    m.alive = false;
    m.t = this.sim.time;
    g.n--;
  }

  update(dt) {
    const sim = this.sim;
    for (let i = sim.infantry.length - 1; i >= 0; i--) {
      const g = sim.infantry[i];
      g.stateT += dt;
      if (g.side === 'german') this.updateGerman(g, dt);
      else this.updateBritish(g, dt);
      if (g.remove) sim.infantry.splice(i, 1);
    }
    for (let i = this.assaults.length - 1; i >= 0; i--) {
      const a = this.assaults[i];
      if (a.groups.every((g) => g.remove || g.state === 'in' || g.state === 'broken' || g.n <= 0) && a.state !== 'resolved') {
        a.state = 'resolved';
        a.resolvedAt = sim.time;
        const left = a.groups.reduce((s, g) => s + (g.state === 'in' ? 1 : 0), 0);
        sim.director.assaultResolved?.(a);
      }
      if (a.state === 'resolved' && sim.time - a.resolvedAt > 60) this.assaults.splice(i, 1);
    }
  }

  updateGerman(g, dt) {
    const sim = this.sim;
    if (g.n <= 0) {
      g.state = g.state === 'in' ? 'in' : 'broken';
      if (g.stateT > 8) g.remove = true;
      return;
    }
    if (g.state === 'forming') {
      if (g.stateT > g.go) {
        g.state = 'advancing';
        g.stateT = 0;
      }
    } else if (g.state === 'advancing') {
      const pinned = sim.time < (g.pinUntil ?? 0);
      if (pinned) g.pinTime = (g.pinTime ?? 0) + dt;
      g.pos.x -= g.speed * dt * (pinned ? 0.4 : 1);
      // pinned by the barrage for too long, they go to ground and then fall back
      if (g.pinTime > 30) {
        g.state = 'broken';
        g.stateT = 0;
        return;
      }
      // the men waver a little as they go
      if (g.pos.x <= g.goal) {
        g.state = 'assault';
        g.stateT = 0;
        g.pos.x = g.goal;
        if (g.n < g.n0 * 0.25) {
          g.state = 'broken';
          g.stateT = 0;
        }
      } else if (g.n < g.n0 * 0.2) {
        g.state = 'broken';
        g.stateT = 0;
      }
    } else if (g.state === 'assault') {
      if (g.stateT > 20) {
        if (g.n >= g.n0 * 0.3) {
          g.state = 'in';
          g.stateT = 0;
          sim.director.breach?.(g);
        } else {
          g.state = 'broken';
          g.stateT = 0;
        }
      }
    } else if (g.state === 'broken') {
      g.pos.x += 3 * dt;
      if (!g.turned) {
        // about turn: rotate the formation 180 degrees so no man moves on the ground
        g.turned = true;
        g.bearing = 90 * Math.PI / 180;
        for (const m of g.men) {
          m.dx = -m.dx;
          m.dz = -m.dz;
        }
      }
      if (g.stateT > 22) g.remove = true;
    } else if (g.state === 'in') {
      if (g.stateT > 25) g.remove = true;
    }
  }

  updateBritish(g, dt) {
    const sim = this.sim, b = sim.barrage;
    if (g.n <= 0) {
      if (g.state !== 'dead') g.state = 'broken';
      if (g.stateT > 20) g.remove = true;
      return;
    }
    if (g.state === 'in') return;
    if (!b || !b.active) return;
    if (g.state === 'forming' && sim.time >= b.zero) {
      g.state = 'advancing';
      g.stateT = 0;
    }
    if (g.state !== 'advancing') return;
    const bx = b.xAt(g.pos.z);
    // keep a safe distance behind the barrage, walk up to it, never into it
    let want = b.k >= b.kMax ? g.goal : bx - 85;
    // the wire holds them until it is cut; machine guns hold on
    const wire = sim.targetAI.wires.find((w) => Math.abs(w.z - g.pos.z) < 450 && w.cut < 0.75);
    let held = false;
    if (wire && g.pos.x > wire.x - 50) {
      want = Math.min(want, wire.x - 30 + 0);
      if (g.pos.x >= want - 2) held = true;
    }
    if (g.pos.x < want) g.pos.x = Math.min(want, g.pos.x + 2.1 * dt);
    // losses: pillboxes that live and are not suppressed, unprotected ground, wire
    let loss = 0;
    for (const t of sim.targets) if (t.kind === 'mebu' && t.alive && Math.abs(t.pos.z - g.pos.z) < 420 && t.pos.x > g.pos.x - 40 && t.pos.x - g.pos.x < 420) {
      const supp = sim.time < (t.suppressed ?? 0);
      if (!supp) {
        loss += 0.05;
        sim.stats.lossBy.mebu += 0.05 * dt;
      }
    }
    if (bx - g.pos.x > 170) {
      loss += 0.025;
      sim.stats.lossBy.open += 0.025 * dt;
    }
    if (held) {
      loss += 0.05;
      sim.stats.lossBy.wire += 0.05 * dt;
    }
    if (b.k === 0 && g.pos.x > lineX(LINES.britishFront, g.pos.z) + 80 && bx - g.pos.x > 100) loss += 0.02;
    g.lossAcc = (g.lossAcc ?? 0) + loss * dt;
    while (g.lossAcc >= 1) {
      g.lossAcc -= 1;
      const alive = g.men.filter((m) => m.alive);
      if (alive.length) {
        this.kill(g, alive[Math.floor(sim.rng() * alive.length)]);
        sim.stats.britishLost++;
      }
    }
    if (g.pos.x >= g.goal) {
      g.state = 'in';
      g.stateT = 0;
    }
  }

  // burst effects on men
  onBurst(shell, pos, air) {
    const sim = this.sim, sc = SHELLS[shell.kind], f = FUZE[shell.fuze] ?? FUZE.instant;
    const shr = shell.fuze === 'shrapnel';
    const R = shr ? 30 : sc.lethal * (shell.fuze === 'delay' ? 0.8 : 1);
    let killed = 0, foes = 0;
    for (const g of sim.infantry) {
      if (g.n <= 0 || Math.abs(g.pos.z - pos.z) > 70 + R || Math.abs(g.pos.x - pos.x) > 40 + R) continue;
      const cover = g.state === 'forming' ? 0.4 : g.state === 'assault' || g.state === 'in' ? 0.6 : 1;
      const own = g.side === 'british' ? 0.5 : 1;
      const cb = Math.cos(g.bearing), sb = Math.sin(g.bearing);
      for (const m of g.men) {
        if (!m.alive) continue;
        const d = Math.hypot(g.pos.x + m.dx * cb - m.dz * sb - pos.x, g.pos.z + m.dx * sb + m.dz * cb - pos.z);
        if (d < R * 1.7) g.pinUntil = sim.time + 7;
        if (d >= R) continue;
        const p = (1 - d / R) * f.men * cover * own * (shr ? 0.6 : 1.45);
        if (sim.rng() < p) {
          this.kill(g, m);
          killed++;
          if (g.side === 'british') {
            sim.stats.britishLost++;
            sim.stats.lossBy.short++;
          } else foes++;
        }
      }
    }
    if (killed) {
      sim.stats.menKilled += killed;
      const u = sim.unitById(shell.unitId);
      if (u) u.stats.kills += 0;
    }
    // the battle's pay (sim.credit): half a point for each of the enemy's men the burst killed (the base's 'british'
    // side is always the player's own: the WW1 and WW2 modes turn the sides round for this)
    if (foes) sim.credit(shell.unitId ?? (shell.support ? `support:${shell.support}` : null), foes * 0.5, { act: 'men', n: foes });
    return killed;
  }
}

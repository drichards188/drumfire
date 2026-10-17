// The WW2 mode's infantry, with the sides turned round from the British game: the Allied attack comes east out of
// the British front line across no man's land at our (the old German) front line, and the player's Sperrfeuer breaks
// it; at the end our own counter-attack goes west behind the player's Feuerwalze. Group shapes and states are the
// British module's, so the instanced infantry renderer draws them unchanged ('british' groups are the Allied men).
import { LINES, lineX, SECTORS } from '../sector.js';
import { Infantry } from '../sim/infantry.js';

const EAST = Math.PI / 2, WEST = Math.PI * 1.5;

export class InfantryWW2 extends Infantry {
  // an Allied attack of three groups on a sector, east from their front line to ours
  spawnAssault(sectorId, size = 1) {
    const sim = this.sim;
    const sec = SECTORS.find((s) => s.id === sectorId);
    const zc = sec.from + 500 + sim.rng() * (sec.to - sec.from - 1000);
    const n = Math.max(10, Math.round(30 * size * sim.difficulty.assault));
    const a = { id: sim.nextId('a'), sector: sectorId, groups: [], zc, t0: sim.time, state: 'forming', missionId: null, breaches: 0, n0: 0, rocketsAt: sim.time + 5 };
    for (let k = -1; k <= 1; k++) {
      const z = zc + k * 110;
      const xa = lineX(LINES.britishFront, z), xg = lineX(LINES.germanFront, z);
      const g = this.makeGroup('british', sectorId, xa - 4, z, n, EAST, 'forming');
      g.goal = xg - 14;
      g.crossing = 90 + sim.rng() * 60;
      g.speed = (xg - xa) / g.crossing;
      g.go = 24 + sim.rng() * 6;
      g.assault = a;
      g.attacker = true;
      a.groups.push(g);
      a.n0 += n;
    }
    this.assaults.push(a);
    return a;
  }

  // the Sperrfeuer line: no man's land a third of the way out from our wire
  sosPoint(a, f = 0.3) {
    const z = a.zc;
    const xa = lineX(LINES.britishFront, z), xg = lineX(LINES.germanFront, z);
    return { x: xg + (xa - xg) * f, z };
  }

  // our counter-attack at the end of the battle: German groups in the lanes, west behind the Feuerwalze
  spawnOwn(lanes) {
    const sim = this.sim;
    for (const l of lanes) for (let k = 0; k < 2; k++) {
      const z = l.z + (k - 0.5) * 220;
      const x = lineX(LINES.germanFront, z) + 8;
      const g = this.makeGroup('german', l.sector, x, z, 34, WEST, 'forming');
      g.lane = l;
      g.goal = lineX(LINES.britishSupport, z) - 40;
      g.own = true;
    }
  }

  update(dt) {
    const sim = this.sim;
    for (let i = sim.infantry.length - 1; i >= 0; i--) {
      const g = sim.infantry[i];
      g.stateT += dt;
      if (g.attacker) this.updateAttacker(g, dt);
      else this.updateOwn(g, dt);
      if (g.remove) sim.infantry.splice(i, 1);
    }
    for (let i = this.assaults.length - 1; i >= 0; i--) {
      const a = this.assaults[i];
      if (a.groups.every((g) => g.remove || g.state === 'in' || g.state === 'broken' || g.n <= 0) && a.state !== 'resolved') {
        a.state = 'resolved';
        a.resolvedAt = sim.time;
        sim.director.assaultResolved?.(a);
      }
      if (a.state === 'resolved' && sim.time - a.resolvedAt > 60) this.assaults.splice(i, 1);
    }
  }

  // the British module's German assault, mirrored (moving +x)
  updateAttacker(g, dt) {
    const sim = this.sim;
    if (g.n <= 0) {
      g.state = g.state === 'in' ? 'in' : 'broken';
      if (g.stateT > 8) g.remove = true;
      return;
    }
    if (g.state === 'forming') {
      if (g.stateT > g.go) { g.state = 'advancing'; g.stateT = 0; }
    } else if (g.state === 'advancing') {
      const pinned = sim.time < (g.pinUntil ?? 0);
      if (pinned) g.pinTime = (g.pinTime ?? 0) + dt;
      g.pos.x += g.speed * dt * (pinned ? 0.4 : 1);
      // our infantry's machine guns in the front line take their toll of men in the open, more of men pinned down
      g.mgAcc = (g.mgAcc ?? 0) + (pinned ? 0.09 : 0.05) * dt;
      while (g.mgAcc >= 1) {
        g.mgAcc -= 1;
        const alive = g.men.filter((m) => m.alive);
        if (alive.length) this.kill(g, alive[Math.floor(sim.rng() * alive.length)]);
      }
      if (g.pinTime > 30) { g.state = 'broken'; g.stateT = 0; return; }
      if (g.pos.x >= g.goal) {
        g.state = 'assault';
        g.stateT = 0;
        g.pos.x = g.goal;
        if (g.n < g.n0 * 0.25) { g.state = 'broken'; g.stateT = 0; }
      } else if (g.n < g.n0 * 0.2) { g.state = 'broken'; g.stateT = 0; }
    } else if (g.state === 'assault') {
      if (g.stateT > 20) {
        if (g.n >= g.n0 * 0.45) { g.state = 'in'; g.stateT = 0; sim.director.breach?.(g); } else { g.state = 'broken'; g.stateT = 0; }
      }
    } else if (g.state === 'broken') {
      g.pos.x -= 3 * dt;
      if (!g.turned) {
        g.turned = true;
        g.bearing = WEST;
        for (const m of g.men) { m.dx = -m.dx; m.dz = -m.dz; }
      }
      if (g.stateT > 22) g.remove = true;
    } else if (g.state === 'in') {
      if (g.stateT > 25) g.remove = true;
    }
  }

  // the British module's Zero hour walk, mirrored (moving -x behind the Feuerwalze)
  updateOwn(g, dt) {
    const sim = this.sim, b = sim.barrage;
    if (g.n <= 0) {
      if (g.state !== 'dead') g.state = 'broken';
      if (g.stateT > 20) g.remove = true;
      return;
    }
    if (g.state === 'in' || !b || !b.active) return;
    if (g.state === 'forming' && sim.time >= b.zero) { g.state = 'advancing'; g.stateT = 0; }
    if (g.state !== 'advancing') return;
    const bx = b.xAt(g.pos.z);
    const want = b.k >= b.kMax ? g.goal : bx + 85;
    if (g.pos.x > want) g.pos.x = Math.max(want, g.pos.x - 2.1 * dt);
    // losses: Allied batteries that still fire, men outrunning the barrage's cover, a barrage left behind
    let loss = 0;
    const firing = sim.targets.filter((t) => t.battery && t.alive && sim.time - t.firedAt < 40).length;
    loss += 0.003 * firing;
    if (g.pos.x - bx > 170) { loss += 0.025; sim.stats.lossBy.open += 0.025 * dt; }
    if (b.k === 0 && g.pos.x < lineX(LINES.germanFront, g.pos.z) - 80 && g.pos.x - bx > 100) loss += 0.02;
    g.lossAcc = (g.lossAcc ?? 0) + loss * dt;
    while (g.lossAcc >= 1) {
      g.lossAcc -= 1;
      const alive = g.men.filter((m) => m.alive);
      if (alive.length) { this.kill(g, alive[Math.floor(sim.rng() * alive.length)]); sim.stats.britishLost++; }
    }
    if (g.pos.x <= g.goal) { g.state = 'in'; g.stateT = 0; }
  }

  // our shells on men: the attackers in full, our own men (a short round) at half (they keep their heads down)
  onBurst(shell, pos, air) {
    const sim = this.sim;
    const save = [];
    for (const g of sim.infantry) if (g.own) { save.push([g, g.side]); g.side = 'british'; } else if (g.attacker) { save.push([g, g.side]); g.side = 'german'; }
    const killed = super.onBurst(shell, pos, air);
    for (const [g, s] of save) g.side = s;
    return killed;
  }
}

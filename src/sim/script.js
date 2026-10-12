// The tutorial's scripted range (sim.newGame({ scripted: true })): `sim.script` places what a lesson needs and
// leaves everything else to the normal game code (the director's siteMission, addMission and assault, the
// enemy's launch, the infantry's spawnAssault, the targets' convoy and train). The range is always in
// daylight: the clock is held between 09:00 and 15:00 and `sim.night` stays false. See DESIGN.md, "Tutorial".
import { stepBallistic } from './shells.js';
import { STEP } from './tables.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DAY = [9, 15];

// Where a shell fired from a piece at (el, brg) with muzzle velocity v meets the ground (the same integrator,
// wind and ground as Sim.moveShells), or null when it never does.
function landing(sim, p, k, v, el, brg) {
  const c = Math.cos(el), dx = Math.sin(brg), dz = -Math.cos(brg), w = sim.wind;
  const s = { x: p.pos.x + dx * 4 * c, y: p.pos.y + 2.5 + 4 * Math.sin(el), z: p.pos.z + dz * 4 * c, vx: v * c * dx, vy: v * Math.sin(el), vz: v * c * dz };
  for (let t = 0; t < 240; t += STEP) {
    const px = s.x, py = s.y, pz = s.z;
    stepBallistic(s, STEP, k, w.wx, w.wz);
    if (s.y <= sim.heightAt(s.x, s.z)) {
      let a = 0, b = 1;
      for (let i = 0; i < 14; i++) {
        const m = (a + b) / 2, x = px + (s.x - px) * m, z = pz + (s.z - pz) * m, y = py + (s.y - py) * m;
        if (y <= sim.heightAt(x, z)) b = m; else a = m;
      }
      return { x: px + (s.x - px) * b, z: pz + (s.z - pz) * b };
    }
  }
  return null;
}

// Elevation and bearing that put a round on `at` with no hidden error (nominal velocity, no calibration, no
// map error, no dispersion), found by correcting the flown landing point; null if it does not converge.
export function solveLanding(sim, p, ch, k, slope, D, el0, brg0, at) {
  let el = el0, brg = brg0;
  for (let i = 0; i < 10; i++) {
    const l = landing(sim, p, k, ch.v, el, brg);
    if (!l) return null;
    const ex = at.x - l.x, ez = at.z - l.z;
    if (Math.hypot(ex, ez) < 0.5) return { el, brg };
    const dx = Math.sin(brg), dz = -Math.cos(brg);
    el += slope * (ex * dx + ez * dz);
    brg += (ex * -dz + ez * dx) / D;
  }
  return { el, brg };
}

export class Script {
  constructor(sim) {
    this.sim = sim;
    this.hour = 10;
  }

  // newGame({ scripted: true }): the range at ten in the morning, every unit on hold
  begin() {
    const sim = this.sim;
    this.hour = 10;
    sim.clock = 10;
    sim.night = false;
    for (const u of sim.units) u.mode = 'hold';
  }

  // Hold the clock at an hour, clamped to 09:00..15:00. null keeps it where it is (the range never runs on
  // toward evening). Returns the hour held.
  clock(h = null) {
    const sim = this.sim;
    if (h != null && Number.isFinite(+h)) this.hour = clamp(+h, DAY[0], DAY[1]);
    sim.clock = this.hour;
    sim.night = false;
    return this.hour;
  }

  // a firstError and a unit for a mission just made
  bind(m, o) {
    const sim = this.sim;
    if (!m) return null;
    if (o.firstError) m.firstError = { over: o.firstError.over ?? 0, right: o.firstError.right ?? 0, used: false, unit: null };
    const u = o.unitId != null ? sim.unitById(o.unitId) : null;
    if (u) sim.director.assign(u, m);
    return m;
  }

  // A mission on a SITES target, made known. o: kind, observer, unitId, title, deadline (default an hour, so a
  // lesson never times out), firstError { over, right } (metres from the target along the unit's line of fire).
  mission(siteId, o = {}) {
    const sim = this.sim, t = sim.targetById(siteId);
    if (!t) return null;
    if (!t.alive && t.kind !== 'crossroads' && t.kind !== 'railyard') sim.targetAI.revive(t);
    const m = sim.director.siteMission(siteId, { kind: o.kind, observer: o.observer, title: o.title, deadline: o.deadline ?? 3600 });
    t.known = true;
    return this.bind(m, o);
  }

  // a wire-cutting mission in a sector with a belt (B or C)
  wire(sectorId, o = {}) {
    const sim = this.sim;
    if (!sim.targetAI.wires.some((w) => w.sector === sectorId)) return null;
    const m = sim.director.wireMission(sectorId, o.deadline ?? 3600);
    if (o.observer) {
      m.observer = o.observer;
      m.obsName = sim.director.obsName(o.observer);
    }
    return this.bind(m, o);
  }

  // A German battery shells unit `at`: see Enemy.hostileUpdate. Returns the counter-battery mission (sound ranging).
  hostile(batteryId, { at, interval = 14, start = 450, walk = 90, grace = 4, deadline = 3600 } = {}) {
    const sim = this.sim, t = sim.targetById(batteryId), e = sim.enemyAI;
    if (!t || t.kind !== 'battery' || !sim.unitById(at)) return null;
    if (!t.alive) sim.targetAI.revive(t);
    e.hostiles = e.hostiles.filter((h) => h.bat !== batteryId);
    e.hostiles.push({ bat: batteryId, at, interval, start, walk, grace, n: 0, cool: 2 });
    const open = sim.missions.find((m) => m.targetId === batteryId && m.state !== 'done' && m.state !== 'failed');
    return open ?? sim.director.siteMission(batteryId, { observer: 'sound', deadline });
  }

  // an SOS: red rockets in five seconds, infantry forming and crossing (the normal assault)
  assault(sectorId, size = 1) {
    return this.sim.director.assault(sectorId, size);
  }

  convoy() {
    return this.sim.director.convoy();
  }

  train() {
    return this.sim.director.train();
  }

  // stop all German fire now: scripted batteries, the hurricane, queued salvos and rounds in the air
  quiet() {
    const sim = this.sim, e = sim.enemyAI;
    e.hostiles = [];
    e.salvos.length = 0;
    e.hurricaneUntil = 0;
    for (const s of sim.shells) if (!s.own) s.alive = false;
  }

  invulnerable(on = true) {
    this.sim.invulnerable = !!on;
  }

  // remove missions, shells in flight, pending reports and infantry (the units go back to no mission)
  clear() {
    const sim = this.sim;
    for (const u of sim.units) {
      u.missionId = null;
      sim.guns.cease(u);
    }
    sim.missions.length = 0;
    sim.reports.length = 0;
    sim.observers.queue.length = 0;
    for (const s of sim.shells) s.alive = false;
    sim.infantry.length = 0;
    sim.assaults.length = 0;
  }
}

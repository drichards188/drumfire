// The enemy's fire in the WW2 mode: the British Enemy (counter-battery fire walking onto the loudest unit,
// harassing fire, the hurricane, star shells, the incoming warnings) with the Allied or Soviet batteries, our rear
// as the harassing area, and air attacks: fighter-bombers (Typhoons in Flanders and over the V-weapon sites, Il-2s
// in the east) that dive on a unit that has been firing in daylight, or on the site a controller names. Aircraft are
// plain objects in sim.aircraft { id, kind, pos, vel, alive, t, target } for the render layer and the sound.
import { PLACES, LINES, lineX, SECTORS } from '../sector.js';
import { Enemy } from '../sim/enemy.js';
import { G } from '../sim/tables.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class EnemyWW2 extends Enemy {
  reset() {
    super.reset();
    this.raidT = 240;
    this.sim.aircraft = [];
    this.raids = [];
    this.raidQ = []; // rockets and bombs leaving the aircraft
    this.storm = null; // the hurricane on our own front line (the base's would fall on the Allied line)
  }

  batteries() {
    return this.sim.targets.filter((t) => t.battery && t.alive);
  }

  update(dt) {
    const sim = this.sim, now = sim.time, op = sim.theatre.op;
    // the base works on kind 'battery': show it ours for the step (the CB loop, the harassing pick) and restore
    const saved = [];
    for (const t of sim.targets) if (t.battery) { saved.push([t, t.kind]); t.kind = 'battery'; }
    try {
      if (op.kind === 'battle') super.update(dt);
      else if ((op.kind === 'gustav' || op.kind === 'karl') && !sim.scripted) this.siegeUpdate(dt);
      else this.warn();
    } finally {
      for (const [t, k] of saved) t.kind = k;
    }
    this.stormUpdate(dt);
    this.airUpdate(dt);
  }

  // Trommelfeuer on our front trench before an Allied attack
  hurricaneOn(sector, secs) {
    const sec = SECTORS.find((s) => s.id === sector);
    this.storm = { until: this.sim.time + secs, t: 0, z0: sec.from, z1: sec.to };
  }

  stormUpdate(dt) {
    const sim = this.sim, h = this.storm;
    if (!h || sim.time > h.until) return;
    h.t -= dt;
    if (h.t > 0) return;
    h.t = 0.35 + sim.rng() * 0.5;
    const b = this.batteries();
    if (!b.length) return;
    const t = b[Math.floor(sim.rng() * b.length)];
    const alive = t.parts.filter((p) => p.alive);
    const z = h.z0 + sim.rng() * (h.z1 - h.z0);
    if (alive.length) this.launch(t.id, alive[Math.floor(sim.rng() * alive.length)], lineX(LINES.germanFront, z) + sim.gauss() * 40, z + sim.gauss() * 30, 'q25');
  }

  // the British harassing fire picks villages west of x 4000 (behind the British line): ours are east of the ridge
    launch(src, part, ax, az, kind, spawnPos) {
    const sim = this.sim;
    if (sim.theatre.op.kind === 'battle' && ax < 4000 && !this._cb) {
      // a harassing round the base aimed at a village behind the British line: put it on ours instead
      const ours = PLACES.filter((p) => p.pos.x > 5000 && p.kind !== 'wood');
      const p = ours[Math.floor(sim.rng() * ours.length)];
      ax = p.pos.x + sim.gauss() * 140;
      az = p.pos.z + sim.gauss() * 140;
    }
    return super.launch(src, part, ax, az, kind, spawnPos);
  }

  // the sieges: the fortress batteries fire back at the loudest of our units (no assaults, no hurricane)
  siegeUpdate(dt) {
    const sim = this.sim, now = sim.time, diff = sim.difficulty;
    let focus = null, fs = 0;
    for (const u of sim.units) if (u.alive && u.signature > fs) { fs = u.signature; focus = u; }
    for (const t of sim.targets) {
      if (!t.battery || !t.alive) continue;
      const f = t.fire;
      f.cool -= dt;
      f.lock += ((focus && fs >= 0.2 ? fs : 0) - f.lock) * Math.min(1, dt * 0.15);
      if (f.cool > 0 || now < t.suppressed) continue;
      const alive = t.parts.filter((p) => p.alive);
      if (alive.length <= 1 || !focus || fs < 0.2) continue;
      const D = Math.hypot(focus.pos.x - t.pos.x, focus.pos.z - t.pos.z);
      if (D > 20000) continue; // the Gustav stands far beyond the fortress guns' reach
      const act = clamp((fs - 0.15) / 0.55, 0.3, 1);
      f.cool = 85 / Math.max(0.15, alive.length * diff.cb * act) * (0.7 + 0.6 * sim.rng());
      if (f.focus !== focus.id) { f.focus = focus.id; f.err = { x: sim.gauss(), z: sim.gauss() }; }
      const e = 35 + 400 * Math.pow(1 - clamp(f.lock, 0, 1), 1.3);
      const cover = focus.special?.cover ?? 1;
      const p = focus.pieces.filter((q) => q.state !== 'dead');
      const tp = p.length ? p[Math.floor(sim.rng() * p.length)].pos : focus.pos;
      this._cb = true;
      this.launch(t.id, alive[Math.floor(sim.rng() * alive.length)], tp.x + (f.err.x * 0.5 + sim.gauss() * 0.7) * e / cover, tp.z + (f.err.z * 0.5 + sim.gauss() * 0.7) * e / cover, t.shell);
      this._cb = false;
      t.firedAt = now;
      t.active = true;
      sim.stats.cbRounds++;
    }
    this.warn();
  }

  warn() {
    const sim = this.sim, now = sim.time;
    for (const s of sim.shells) {
      if (s.own || s.warned || s.tof - s.t > 4.2) continue;
      s.warned = true;
      for (const u of sim.units) {
        if (!u.alive) continue;
        if (u.pieces.some((p) => p.state !== 'dead' && Math.hypot(p.pos.x - s.aim.x, p.pos.z - s.aim.z) < 400)) {
          sim.events.incoming?.(s);
          u.underFire = Math.max(u.underFire, now - 30);
          u.warnedAt = now;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ air attacks
  // A raid: `n` aircraft come in low from the enemy side, dive on the target, release (rockets or bombs) and climb
  // away. The controller of a V-weapon site calls raid() itself; in the battles a unit that fires a lot in daylight
  // draws the fighter-bombers.
  raid(target, { n = 2, kind = null, weapon = 'rp3', warn = 45 } = {}) {
    const sim = this.sim, op = sim.theatre.op;
    kind ??= op.enemy === 'soviet' ? 'il2' : 'typhoon';
    const from = (op.raidFrom ?? op.units[0].zero + Math.PI) + (sim.rng() - 0.5) * 0.8;
    const r = { id: sim.nextId('r'), target: { x: target.x, z: target.z }, at: sim.time + warn, n, kind, weapon, planes: [], from, flak: target.flak ?? 0, spoil: target.spoil ?? 0 };
    this.raids.push(r);
    sim.events.raid?.(r, 'warning');
    sim.radio(`Fliegeralarm! ${n} ${kind === 'il2' ? 'Il-2 ground-attack aircraft' : 'Jabos'} inbound${warn > 20 ? `, about ${Math.round(warn)} s` : ''}.`, 'alert');
    return r;
  }

  // the battle's raids' pace: the difficulty's counter-battery rate, or a threat level's own (0: none; twice it under
  // the modifier 'air')
  raidRate() {
    const sim = this.sim, L = sim.level;
    return L ? L.raids * (sim.modifiers.has('air') ? 2 : 1) : sim.difficulty.cb;
  }

  airUpdate(dt) {
    const sim = this.sim, now = sim.time, op = sim.theatre.op;
    // the battle's own raids: a loud unit in daylight draws the fighter-bombers
    if (!sim.scripted && !sim.attract && op.kind !== 'v1' && op.kind !== 'v2' && !sim.night && sim.phase >= 2 && this.raidRate() > 0) {
      this.raidT -= dt;
      if (this.raidT <= 0) {
        this.raidT = (260 + sim.rng() * 160) / this.raidRate();
        let best = null, bs = 0.45;
        for (const u of sim.units) if (u.alive && u.signature > bs) { bs = u.signature; best = u; }
        if (best) this.raid({ x: best.pos.x, z: best.pos.z, flak: best.special?.flak ?? 0, spoil: best.special?.flakSpoil ?? 0 }, { n: 2 });
      }
    }
    const list = sim.aircraft;
    for (const r of this.raids) {
      if (r.started || now < r.at) continue;
      r.started = true;
      for (let i = 0; i < r.n; i++) {
        const d = 9000, a = r.from + (i - (r.n - 1) / 2) * 0.05;
        const x = r.target.x + Math.sin(a) * d, z = r.target.z - Math.cos(a) * d;
        const sp = r.kind === 'il2' ? 105 : 150;
        const h = sim.heightAt(x, z) + 450;
        const dx = r.target.x - x, dz = r.target.z - z, L = Math.hypot(dx, dz);
        list.push({ id: sim.nextId('p'), kind: r.kind, raid: r, pos: { x, y: h, z }, prev: { x, y: h, z }, vel: { x: dx / L * sp, y: 0, z: dz / L * sp }, alive: true, t: -i * 4, fired: false, sp, i });
      }
    }
    this.raids = this.raids.filter((r) => !r.started || list.some((p) => p.raid === r && p.alive));
    for (const p of list) {
      if (!p.alive) continue;
      p.t += dt;
      if (p.t < 0) continue;
      p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
      const T = p.raid.target, dx = T.x - p.pos.x, dz = T.z - p.pos.z, d = Math.hypot(dx, dz);
      const gy = sim.heightAt(p.pos.x, p.pos.z);
      if (!p.fired) {
        // run in, then a shallow dive from 1.5 km
        const want = d > 1500 ? gy + 380 : gy + 40 + (d / 1500) * 340;
        p.vel.y = clamp((want - p.pos.y) * 0.8, -60, 30);
        if (d < 700) this.release(p);
      } else {
        p.vel.y = Math.min(45, p.vel.y + 30 * dt);
        // away home after the attack
        if (sim.time - p.firedAt > 18) p.alive = false;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      // flak around a protected site may bring one down
      if (p.raid.flak > 0 && !p.fired && d < 3000 && sim.rng() < p.raid.flak * 0.06 * dt) {
        p.alive = false;
        p.downed = true;
        sim.radio('Flak: a raider is down.', 'kill');
        sim.events.secondary?.({ x: p.pos.x, y: sim.heightAt(p.pos.x, p.pos.z) + 1, z: p.pos.z }, 1.2);
      }
      if (p.t > 120) p.alive = false;
    }
    for (let i = this.raidQ.length - 1; i >= 0; i--) {
      if (this.raidQ[i].t > now) continue;
      this.raidShot(this.raidQ[i]);
      this.raidQ.splice(i, 1);
    }
    if (list.length > 12) sim.aircraft = list.filter((p) => p.alive || now - (p.deadAt ?? now) < 1);
  }

  onBurst(shell, pos) {
    const near = super.onBurst(shell, pos);
    this.sim.special?.onEnemyBurst(shell, pos);
    return near;
  }

  release(p) {
    const sim = this.sim, T = p.raid.target;
    p.fired = true;
    p.firedAt = sim.time;
    const n = p.raid.weapon === 'bomb' ? 2 : 4;
    for (let k = 0; k < n; k++) {
      // heavy flak round the target spoils the bombers' aim (raid.spoil: how much wider they scatter)
      const sc = 70 * (1 + (p.raid.spoil ?? 0));
      const ax = T.x + sim.gauss() * sc + (p.i - 0.5) * 30, az = T.z + sim.gauss() * sc;
      this.raidQ.push({ t: sim.time + 0.2 * k, x: ax, z: az, kind: p.raid.weapon, from: { x: p.pos.x, y: p.pos.y, z: p.pos.z } });
    }
    sim.events.raid?.(p.raid, 'attack', p);
  }

  raidShot(s) {
    const sim = this.sim, f = s.from;
    const yT = sim.heightAt(s.x, s.z), D = Math.hypot(s.x - f.x, s.z - f.z);
    const T = clamp(D / 280, 1.2, 6);
    const vx = (s.x - f.x) / T, vz = (s.z - f.z) / T, vy = (yT - f.y + 0.5 * G * T * T) / T;
    const shell = {
      id: sim.nextId('e'), own: false, unitId: null, piece: null, kind: s.kind, calibre: s.kind === 'bomb' ? 9 : 3,
      pos: { ...f }, prev: { ...f }, vel: { x: vx, y: vy, z: vz }, fuze: 'instant', t: 0, tof: T, aim: { x: s.x, z: s.z }, alive: true, k: 0, src: 'air',
    };
    sim.shells.push(shell);
  }
}


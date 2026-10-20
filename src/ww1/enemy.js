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

export class EnemyWW1 extends EnemyWW2 {
  reset() {
    super.reset();
    this.re8T = 200;
    this.spotter = null; // { plane, unitId, until }
    this.huntT = HUNT.first;
  }

  // the British supply: the dumps behind their guns, and the Paris Gun's rounds on the railway junction
  supply() {
    const sim = this.sim;
    let n = 0;
    for (const t of sim.targets) if (t.kind === 'bdump' && t.alive) n++;
    return (0.6 + 0.2 * n) * (sim.special?.supplyK?.() ?? 1);
  }

  update(dt) {
    const sim = this.sim, now = sim.time, diff = sim.difficulty;
    if (sim.theatre.op.kind !== 'battle') {
      this.huntUpdate(dt);
      this.warn();
      this.airUpdate(dt);
      return;
    }
    // who is the loudest of our units
    let focus = null, fs = 0;
    for (const u of sim.units) if (u.alive && u.signature > fs) { fs = u.signature; focus = u; }
    const cbOn = (sim.phase >= 2 || sim.attract) && !sim.scripted;
    const sup = this.supply();
    const spot = this.spotter && this.spotter.plane.alive && this.spotter.circling ? this.spotter.unitId : null;
    for (const t of cbOn ? sim.targets : []) {
      if (!t.battery || !t.alive) continue;
      const f = t.fire, B = BRIT_FIRE[t.kind];
      f.cool -= dt;
      // the RE8 over the focus unit firms the locating up three times faster
      const kl = focus && focus.id === spot ? 0.45 : 0.15;
      f.lock += ((focus && fs >= 0.2 ? fs : 0) - f.lock) * Math.min(1, dt * kl);
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
      const bs = this.batteries().filter((b) => b.kind === 'bfield' || b.kind === 'bgun6' || b.kind === 'bgun60');
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

  // the Trommelfeuer on our front line before a British attack: 18-pounders and 4.5-inch howitzers
  stormUpdate(dt) {
    const sim = this.sim, h = this.storm;
    if (!h || sim.time > h.until) return;
    h.t -= dt;
    if (h.t > 0) return;
    h.t = 0.35 + sim.rng() * 0.5;
    const b = this.batteries().filter((q) => q.kind === 'bfield' || q.kind === 'bgun6');
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
    if (!sim.scripted && !sim.attract && !sim.night && sim.phase >= 2 && !this.spotter) {
      this.re8T -= dt;
      if (this.re8T <= 0) {
        this.re8T = (240 + sim.rng() * 200) / sim.difficulty.cb / (sim.special?.effectK?.('air') ?? 1);
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

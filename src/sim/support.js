// Off-map support: the lineup's weapons that fire from beyond the map (research.js `offmap`: the V-1 flying bomb, the
// V-2 rocket, the Paris Gun's shell). Node-safe. The player picks one, gives it a point on the map, and it fires in its
// own time: a preparation, a flight partly off the map, then the arrival (the V-1 low and buzzing, diving in silence
// when its motor cuts; the V-2 falling from high, ahead of its own sound; the Paris shell's steep fall) and a burst
// through the normal path (sim.burst: targets, infantry, wire, craters); then a long reload. Each asset is a plain
// object the console reads: { kind, name, state 'ready' | 'preparing' | 'flight' | 'reloading', t (s left in it), aim,
// shellId, last }. Game values, not weapons data (DESIGN.md "Off-map support"): the real spreads are kilometres, here
// they are sized so a strike can hit a battery position on this map; the times are short enough for two or three
// strikes a battle. The battery's upgrades apply (research.js modsOf): the breech's and the crews' `load` on the
// preparation and the reload, the barrel's `disp` on the spread, the shells' `dmg` on the burst.
//
// Commands: sim.command(null, 'support', { kind, x, z }) orders one onto a point, { kind, cancel: true } stands it
// down while it prepares. An order it cannot carry out is told on the radio (tell, as sim.tell does for the guns) and
// `problem(kind)` gives the reason the console shows. Its own random stream, so the battle runs as without it; no
// support (sim.support null) unless the loadout has off-map kinds.
import { mulberry32 } from '../noise.js';
import { SHELLS, G } from './tables.js';
import { gridRef } from '../sector.js';

// prep and reload (s); offmap: the flight's time before it comes onto the map (s); spread: one standard deviation of
// the fall about the aim point (m)
export const SUPPORT = {
  v1: { name: 'V-1', prep: 110, reload: 540, offmap: 45, spread: 110, word: 'flying bomb' },
  v2: { name: 'V-2', prep: 170, reload: 780, offmap: 60, spread: 80, word: 'rocket' },
  paris: { name: 'Paris Gun', prep: 75, reload: 600, offmap: 80, spread: 60, word: 'shell' },
};
export const SUPPORT_KINDS = Object.keys(SUPPORT);
export const supportKinds = (loadout) => (loadout ? SUPPORT_KINDS.filter((k) => loadout[k]) : []);
// the flights over the map: the V-1 comes in from 9 km at 420 m and 175 m/s and dives at 1.1 km; the V-2 falls from
// 30 km on a line 10 degrees off the vertical at 900 m/s; the Paris shell from 11 km at 55 degrees and 780 m/s
const V1 = { from: 9000, alt: 420, speed: 175, cut: 1100, turn: 0.9, top: 240 };
const V2 = { alt: 30000, off: 0.18, speed: 900 };
const PARIS = { alt: 11000, angle: 55, speed: 780 };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Support {
  constructor(sim, kinds) {
    this.sim = sim;
    this.rng = mulberry32((sim.seed ^ 0x0ff3a9) >>> 0);
    this.assets = kinds.map((kind) => {
      const m = sim.loadout?.[kind]?.mods ?? null;
      return { kind, name: SUPPORT[kind].name, state: 'ready', t: 0, dur: 0, aim: null, at: null, shellId: null, last: null, told: null,
        mods: { load: m?.load ?? 1, disp: m?.disp ?? 1, dmg: m?.dmg ?? 1 } };
    });
  }

  get(kind) {
    return this.assets.find((a) => a.kind === kind) ?? null;
  }

  // why an order cannot be carried out now ('' when it can)
  problem(kind) {
    const a = this.get(kind), sim = this.sim;
    if (!a) return 'not in the lineup';
    if (sim.state !== 'playing') return 'the battle is over';
    if (a.state === 'preparing') return `preparing for ${a.aim ? this.ref(a.aim.x, a.aim.z) : 'its target'}, ${mmss(a.t)} to go`;
    if (a.state === 'flight') return 'one is already on its way';
    if (a.state === 'reloading') return `reloading, ready in ${mmss(a.t)}`;
    return '';
  }

  ref(x, z) {
    return this.sim.theatre?.ref ? this.sim.theatre.ref(x, z) : gridRef(x, z);
  }

  tell(a, why) {
    const text = `${a.name}: cannot fire. ${why[0].toUpperCase()}${why.slice(1)}.`;
    if (a.told && a.told.text === text && this.sim.time - a.told.t < 4) return;
    a.told = { text, t: this.sim.time };
    this.sim.radio(text, 'warn');
  }

  command(args = {}) {
    const a = this.get(args.kind), sim = this.sim;
    if (!a) return false;
    // the console asking whether it can take an order now: the reason told when it cannot
    if (args.ask) {
      const why = a.state === 'preparing' ? '' : this.problem(a.kind);
      if (why) this.tell(a, why);
      return !why;
    }
    if (args.cancel) {
      if (a.state !== 'preparing') return false;
      a.state = 'ready';
      a.t = 0;
      a.aim = null;
      sim.radio(`${a.name}: stood down.`, 'info');
      return true;
    }
    const x = +args.x, z = +args.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) { this.tell(a, 'no target: click the map where it is to fall'); return false; }
    if (Math.abs(x) > sim.bounds - 600 || Math.abs(z) > sim.bounds - 600) { this.tell(a, 'that point is off the map'); return false; }
    // a new point while it prepares: the crew lays on it, the preparation goes on
    if (a.state === 'preparing') {
      a.aim = { x, z };
      sim.radio(`${a.name}: new target, ${this.ref(x, z)}. Away in about ${mmss(a.t)}.`, 'info');
      return true;
    }
    const why = this.problem(a.kind);
    if (why) { this.tell(a, why); return false; }
    a.aim = { x, z };
    a.state = 'preparing';
    a.t = a.dur = SUPPORT[a.kind].prep * a.mods.load;
    a.told = null;
    sim.radio(`${a.name}: target ${this.ref(x, z)}. Away in about ${mmss(a.t)}.`, 'info');
    sim.events.support?.(a, 'order');
    return true;
  }

  update(dt) {
    const sim = this.sim;
    for (const a of this.assets) {
      if (a.state === 'preparing' || a.state === 'reloading') {
        a.t = Math.max(0, a.t - dt);
        if (a.t > 0) continue;
        if (a.state === 'preparing') this.launch(a);
        else {
          a.state = 'ready';
          sim.radio(`${a.name}: ready again.`, 'info');
          sim.events.support?.(a, 'ready');
        }
      } else if (a.state === 'flight') {
        // off the map first, then the projectile over it, flown here (guided: sim.moveShells leaves it alone); `t` the
        // whole flight's time left
        a.t = Math.max(0, a.t - dt);
        if (!a.shellId) {
          if (a.t <= this.approach(a.kind)) this.arrive(a);
          continue;
        }
        const s = sim.shells.find((q) => q.id === a.shellId);
        if (!s || !s.alive) { this.landed(a, s); continue; }
        this.fly(a, s, dt);
      }
    }
  }

  // away: the drawn fall point (the aim with the spread), and the time to its arrival over the map
  launch(a) {
    const sim = this.sim, def = SUPPORT[a.kind], sd = def.spread * a.mods.disp;
    const g = () => (this.rng() + this.rng() + this.rng() - 1.5) * 2;
    a.at = { x: a.aim.x + g() * sd, z: a.aim.z + g() * sd };
    const over = def.offmap + this.approach(a.kind);
    a.state = 'flight';
    a.t = a.dur = over;
    a.shellId = null;
    sim.radio(a.kind === 'v1' ? `${a.name} away from its ramp: over the target in about ${mmss(over)}.`
      : a.kind === 'v2' ? `${a.name} away: it falls on ${this.ref(a.aim.x, a.aim.z)} in about ${mmss(over)}, unheard until it strikes.`
        : `${a.name}: Feuer! The shell falls on ${this.ref(a.aim.x, a.aim.z)} in about ${mmss(over)}.`, 'info');
    sim.events.support?.(a, 'launch');
  }

  // the seconds the projectile is over the map
  approach(kind) {
    if (kind === 'v1') return V1.from / V1.speed + 6;
    if (kind === 'v2') return Math.hypot(V2.alt, V2.alt * V2.off) / V2.speed;
    return PARIS.alt / Math.sin(PARIS.angle * Math.PI / 180) / PARIS.speed;
  }

  // onto the map: the projectile, a guided shell in sim.shells, flown by fly() to the fall point
  arrive(a) {
    const sim = this.sim, P = a.at, gy = sim.heightAt(P.x, P.z);
    // from the German side (east), along the line from it to the fall point
    let x0, y0, z0, vx, vy, vz;
    if (a.kind === 'v1') {
      x0 = P.x + V1.from; z0 = P.z + (this.rng() - 0.5) * 900;
      y0 = gy + V1.alt;
      const d = Math.hypot(P.x - x0, P.z - z0);
      vx = (P.x - x0) / d * V1.speed; vy = 0; vz = (P.z - z0) / d * V1.speed;
    } else {
      const k = a.kind === 'v2' ? V2 : PARIS;
      const h = k.alt, run = a.kind === 'v2' ? h * V2.off : h / Math.tan(PARIS.angle * Math.PI / 180);
      const b = (this.rng() - 0.5) * 0.5; // a little off due east
      x0 = P.x + run * Math.cos(b); z0 = P.z + run * Math.sin(b); y0 = gy + h;
      const d = Math.hypot(P.x - x0, gy - y0, P.z - z0);
      vx = (P.x - x0) / d * k.speed; vy = (gy - y0) / d * k.speed; vz = (P.z - z0) / d * k.speed;
    }
    const sc = SHELLS[a.kind];
    const s = {
      id: sim.nextId('s'), own: true, guided: true, support: a.kind, unitId: null, piece: null, kind: a.kind, calibre: sc?.calibre ?? 20,
      pos: { x: x0, y: y0, z: z0 }, prev: { x: x0, y: y0, z: z0 }, vel: { x: vx, y: vy, z: vz },
      fuze: a.kind === 'paris' ? 'delay' : 'instant', t: 0, t0: sim.time, tof: this.approach(a.kind), aim: { x: a.aim.x, z: a.aim.z },
      alive: true, k: 0, dmgK: a.mods.dmg !== 1 ? a.mods.dmg : undefined, engineOff: false, burning: false,
    };
    sim.shells.push(s);
    a.shellId = s.id;
    sim.events.support?.(a, 'arrive', s);
  }

  // one step of the flight: the V-1 level on its course until the cut, then steering down onto the point; the V-2
  // and the Paris shell straight down their line (at that speed and angle the last 11 km of a fall are near straight)
  fly(a, s, dt) {
    const sim = this.sim, P = a.at;
    s.prev.x = s.pos.x; s.prev.y = s.pos.y; s.prev.z = s.pos.z;
    s.t += dt;
    if (a.kind === 'v1') {
      const dx = P.x - s.pos.x, dz = P.z - s.pos.z, dh = Math.hypot(dx, dz);
      if (!s.engineOff && dh <= V1.cut) {
        s.engineOff = true;
        sim.events.support?.(a, 'cut', s);
      }
      const gy = sim.heightAt(P.x, P.z);
      // the course and the dive: turn the velocity toward the point (level while the motor runs), speed up in the dive
      const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
      let tx = dx, ty = s.engineOff ? gy - s.pos.y : 0, tz = dz;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const k = Math.min(1, dt * V1.turn * (s.engineOff ? 1.6 : 1));
      const nsp = s.engineOff ? Math.min(V1.top, sp + G * 0.6 * dt) : sp;
      let ux = s.vel.x / sp + (tx - s.vel.x / sp) * k, uy = s.vel.y / sp + (ty - s.vel.y / sp) * k, uz = s.vel.z / sp + (tz - s.vel.z / sp) * k;
      const ul = Math.hypot(ux, uy, uz) || 1;
      s.vel.x = ux / ul * nsp; s.vel.y = uy / ul * nsp; s.vel.z = uz / ul * nsp;
    }
    s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
    const h = sim.heightAt(s.pos.x, s.pos.z);
    // down: on the ground, or past the point (a fast fall can step over it); the burst at the ground under it
    const past = (s.pos.x - P.x) * s.vel.x + (s.pos.z - P.z) * s.vel.z > 0 && s.pos.y - h < 30;
    if (s.pos.y <= h || past || s.t > 400) {
      const x = s.pos.y <= h || past ? s.pos.x : P.x, z = s.pos.y <= h || past ? s.pos.z : P.z;
      const p = { x, y: sim.heightAt(x, z), z };
      s.pos.x = p.x; s.pos.y = p.y; s.pos.z = p.z;
      sim.burst(s, p, false);
      this.landed(a, s);
    }
  }

  // the burst: what it hit, then the reload
  landed(a, s) {
    const sim = this.sim;
    const p = s?.burstAt ?? a.at;
    const off = a.aim ? Math.round(Math.hypot(p.x - a.aim.x, p.z - a.aim.z)) : 0;
    const near = sim.targets.filter((t) => t.present !== false && !t.offmap && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < t.r + 90)
      .sort((u, v) => Math.hypot(u.pos.x - p.x, u.pos.z - p.z) - Math.hypot(v.pos.x - p.x, v.pos.z - p.z))[0];
    a.last = { x: p.x, z: p.z, off, t: sim.time, hit: near ? near.name : null, destroyed: near ? !near.alive : false };
    sim.radio(`${a.name} down at ${this.ref(p.x, p.z)}, ${off} m from the aim${near ? `: ${near.alive ? 'on' : 'destroyed,'} ${near.name}` : ''}. Ready again in about ${mmss(SUPPORT[a.kind].reload * a.mods.load)}.`, near && !near.alive ? 'kill' : 'info');
    a.state = 'reloading';
    a.t = a.dur = SUPPORT[a.kind].reload * a.mods.load;
    a.shellId = null;
    sim.events.support?.(a, 'burst', s);
  }
}

// The WW1 German mode's special guns: each unit with `def.special` has a controller here. Node-safe, deterministic
// per seed (sim.rng). State is plain data on `unit.special` (the console card and the render layer read it); commands
// come through sim.command(unitId, name, args) (sim.js hands the names it does not know to `command` here). While a
// controller holds a gun back, `unit.gate` names why (guns.js will not load or fire, guns.problem shows the reason).
//
//   bertha, gamma  the 42 cm M-Gerät and Gamma-Mörser on their firing beds: set up and ready; normal guns through the
//          loading cycle, and a target beyond the bed's arc needs the bed relaid ('rebed', the beds below).
//          unit.special = { kind, ready: true, bed: { state, t, dur, from, to } }
//   paris  the Paris-Geschütz in its own mission: its controller is src/ww1/paris.js (the Stellungsbau, the Feuerablauf
//          for each round, the shot flown off the map and reported, the Armee's orders).
import { DEG, bearingOf } from '../sector.js';
import { ParisCtl } from './paris.js';
import { GustavCtl, KarlCtl } from '../ww2/special.js';
import { Gunner, GUNNER_CMDS } from '../ww2/gunner.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ the beds
// Bertha and the Gamma fire from steel beds laid on the ground: the handwheels turn the gun only 11.5 and 23 degrees
// either way of the bed's line (`u.arc`). A target further round needs the bed relaid on a new line: the crew digs it
// out, swings it and beds it again (hours of work for the M-Gerät, a day and more for the Gamma; here 100
// seconds), and the gun cannot fire meanwhile. Command 'rebed' { bearing? } (default: the line to the ordered target).
// unit.special = { kind, ready, bed: { state: 'set' | 'moving', t, dur, from, to } } (bearings in rad). While it moves
// the gun and its bed swing from `from` to `to` in the middle of the work (the render layer turns the rig, its pit or
// site and the camera with piece.bearing) and `unit.gate` says how long is left. A duration of 0 relays it at once.
// TODO restore the wait: the relay is instant for now (asked for on 2026-10-20); it was { bertha: 100, gamma: 100 }.
export const REBED = { bertha: 0, gamma: 0, beta: 0 };
// a duration in the console's words: seconds under two minutes, whole minutes above
const span = (s, long) => (s < 120 ? `${Math.ceil(s)}${long ? ' seconds' : ' s'}` : `${Math.round(s / 60)}${long ? ' minutes' : ' min'}`);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

class BedCtl {
  constructor(sim, u) {
    this.sim = sim;
    this.u = u;
  }

  reset() {
    const u = this.u;
    u.special = { kind: u.kind, ready: true, bed: { state: 'set', t: 0, dur: REBED[u.kind] ?? 600, from: u.zero, to: u.zero } };
    u.gate = null;
  }

  setLine(b) {
    const u = this.u;
    u.zero = b;
    for (const p of u.pieces) { p.bearing = b; p.az = 0; }
  }

  // relay the bed onto bearing b; `auto` is the crew's own decision (the unit stays on auto)
  rebed(b, auto = false) {
    const sim = this.sim, u = this.u, bed = u.special.bed;
    if (bed.state === 'moving') {
      if (!auto) sim.radio(`${u.callsign}: the bed is already being relaid.`, 'warn');
      return false;
    }
    const turn = wrap(b - u.zero);
    if (Math.abs(turn) < 2 * DEG) {
      if (!auto) sim.radio(`${u.callsign}: the bed already lies on that line.`, 'info');
      return false;
    }
    if (!auto && u.mode === 'auto') u.mode = 'manual';
    Object.assign(bed, { state: 'moving', t: 0, from: u.zero, to: u.zero + turn });
    sim.guns.cease(u);
    this.gate();
    const deg = Math.round((((bed.to / DEG) % 360) + 360) % 360);
    sim.radio(`${u.callsign}: Bettung umlegen onto ${deg}°.${bed.dur ? ` The gun is out of action for about ${span(bed.dur, true)}.` : ''}`, 'info');
    sim.events.special?.(u, 'bed', u.special);
    if (!bed.dur) this.update(0);
    return true;
  }

  gate() {
    const u = this.u, bed = u.special.bed;
    u.gate = bed.state === 'moving' ? `Bettung umlegen, ${span(bed.dur - bed.t)} to go` : null;
  }

  command(name, a) {
    if (name !== 'rebed') return false;
    const u = this.u, o = u.order;
    const b = a.bearing ?? (o.target ? bearingOf(o.x - u.pos.x, o.z - u.pos.z) : null);
    if (b == null) {
      this.sim.radio(`${u.callsign}: lay on a target first; the bed is relaid onto its line.`, 'warn');
      return false;
    }
    return this.rebed(b);
  }

  update(dt) {
    const sim = this.sim, u = this.u, bed = u.special.bed;
    if (bed.state !== 'moving') return;
    bed.t += dt;
    const k = bed.dur ? Math.min(1, bed.t / bed.dur) : 1;
    // dug out first, swung in the middle of the work, bedded and levelled again last
    this.setLine(bed.from + (bed.to - bed.from) * smooth(0.25, 0.75, k));
    if (k >= 1) {
      bed.state = 'set';
      this.setLine(bed.to);
      bed.from = bed.to;
      sim.radio(`${u.callsign}: the bed is relaid. Ready to lay.`, 'info');
      sim.events.special?.(u, 'ready');
    }
    this.gate();
    if (bed.state === 'set' && u.order.target) sim.guns.recompute(u);
  }
}

// ------------------------------------------------------------------------------------------------ shoot and move
// The self-propelled guns (Wespe, Hummel: GUNS special 'move') have two prepared positions (`def.positions`, ops.js
// RIDGE_MORE). 'move' { id? } (T; default the other one) drives the battery there: the crews mount (MOUNT s), the
// vehicles drive across (SPEED m/s, each to its own spot, hull along the road), then dismount and lay again. The
// enemy loses them as they go (the signature drops to nothing: what they had located is an empty position), but the
// guns are out of action meanwhile and the new position is surveyed in a hurry (a fresh map error, MOVE_BIAS of a new
// lay's). An auto crew moves by itself once the enemy has it located and its shells are coming close.
// unit.special = { kind: 'move', state: 'set' | 'mount' | 'drive' | 'dismount', t, dur, posId, to, positions, moves }
const MOUNT = 10, SPEED = 9, MOVE_BIAS = 0.6;
class MoveCtl {
  constructor(sim, u) {
    this.sim = sim;
    this.u = u;
  }

  reset() {
    const u = this.u, ps = u.def.positions ?? [];
    u.special = { kind: 'move', state: 'set', t: 0, dur: 0, posId: ps[0]?.id ?? null, to: null, positions: ps, moves: 0, from: null };
    // each vehicle's place in a position, from the unit's centre (as piecePlacements lays them out)
    this.offsets = u.pieces.map((p) => ({ dx: p.pos.x - u.pos.x, dz: p.pos.z - u.pos.z }));
    for (const p of u.pieces) p.mobile = true;
    u.gate = null;
  }

  other() {
    const st = this.u.special;
    return st.positions.find((q) => q.id !== st.posId) ?? null;
  }

  move(id, auto = false) {
    const sim = this.sim, u = this.u, st = u.special;
    const q = id ? st.positions.find((x) => x.id === id) : this.other();
    if (st.state !== 'set') { if (!auto) sim.radio(`${u.callsign}: already on the move.`, 'warn'); return false; }
    if (!q || q.id === st.posId) { if (!auto) sim.radio(`${u.callsign}: no other position to go to.`, 'warn'); return false; }
    if (!auto && u.mode === 'auto') u.mode = 'manual';
    sim.guns.cease(u);
    const live = u.pieces.filter((p) => p.state !== 'dead');
    const d = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z);
    Object.assign(st, { state: 'mount', t: 0, dur: MOUNT, to: q.id, drive: d / SPEED, from: { x: u.pos.x, z: u.pos.z }, dest: q.pos });
    // the round in the breech stays there; the cycle in hand is given up
    for (const p of live) if (p.state === 'loading' || p.state === 'laying' || p.state === 'ready') { p.state = 'idle'; p.job = null; }
    u.signature = 0;
    for (const p of u.pieces) p.fixed = true; // (the hulls are turned by place() alone until they are in position)
    this.gate();
    sim.radio(`${u.callsign}: Stellungswechsel to ${q.name}. Out of action for about ${Math.round((MOUNT * 2 + d / SPEED) / 10) * 10} seconds.`, 'info');
    sim.events.special?.(u, 'move', st);
    return true;
  }

  gate() {
    const u = this.u, st = u.special;
    if (st.state === 'set') { u.gate = null; u.stowed = false; return; }
    const left = st.state === 'mount' ? st.dur - st.t + st.drive + MOUNT : st.state === 'drive' ? st.dur - st.t + MOUNT : st.dur - st.t;
    u.gate = `Stellungswechsel, ${Math.ceil(left)} s to go`;
    u.stowed = true; // (the guns at their rest, not laid, while the crews mount and drive)
  }

  command(name, a) {
    if (name !== 'move') return false;
    return this.move(a.id ?? null);
  }

  // every vehicle at fraction k of its way from its place at the old position to its place at the new one, its hull
  // turned along the road
  place(k) {
    const u = this.u, st = u.special, f = st.from, d = st.dest;
    const road = bearingOf(d.x - f.x, d.z - f.z);
    for (const p of u.pieces) {
      const o = this.offsets[p.i];
      p.pos.x = f.x + (d.x - f.x) * k + o.dx;
      p.pos.z = f.z + (d.z - f.z) * k + o.dz;
      p.pos.y = this.sim.heightAt(p.pos.x, p.pos.z);
      if (p.state !== 'dead') p.az = wrap(p.bearing - road);
    }
  }

  update(dt) {
    const sim = this.sim, u = this.u, st = u.special;
    if (st.state === 'set') {
      // an auto crew moves when the enemy has it and the rounds come close, between series
      if (u.mode === 'auto' && u.alive && u.signature > 0.5 && sim.time - u.underFire < 20 && !u.pieces.some((p) => p.rounds > 0 && p.state !== 'dead')) this.move(null, true);
      return;
    }
    st.t += dt;
    u.signature = 0;
    if (st.state === 'mount' && st.t >= st.dur) Object.assign(st, { state: 'drive', t: 0, dur: st.drive });
    if (st.state === 'drive') {
      const k = Math.min(1, st.t / Math.max(0.01, st.dur));
      this.place(k);
      if (k >= 1) Object.assign(st, { state: 'dismount', t: 0, dur: MOUNT });
    }
    if (st.state === 'dismount' && st.t >= st.dur) {
      st.state = 'set';
      st.posId = st.to;
      st.moves++;
      u.pos.x = st.dest.x; u.pos.z = st.dest.z; u.pos.y = sim.heightAt(u.pos.x, u.pos.z);
      for (const p of u.pieces) p.fixed = false; // (the hulls turn from the road onto the line as they lay)
      // a new position: surveyed in a hurry, so the map error of the lay is drawn again
      const o = u.order;
      if (o.target) {
        u.bias = sim.guns.drawBias(u, o.target.x, o.target.z, MOVE_BIAS);
        sim.guns.recompute(u);
      }
      sim.radio(`${u.callsign}: in position at ${st.positions.find((q) => q.id === st.posId)?.name ?? 'the new position'}. Ready to lay.`, 'info');
      sim.events.special?.(u, 'ready');
    }
    this.gate();
  }
}

// ------------------------------------------------------------------------------------------------ the module
// (the German career's battle fields the WW2 Gustav, assembled on its curve, and the set-up Karl too: ops.js RIDGE_WW2)
const CTL = { bertha: BedCtl, gamma: BedCtl, beta: BedCtl, move: MoveCtl, paris: ParisCtl, gustav: GustavCtl, karl: KarlCtl };

export class SpecialWW1 {
  constructor(sim) {
    this.sim = sim;
    this.ctl = [];
    // the player in person at a gun (ww2/gunner.js, as SpecialWW2 has it): sim/guns.js hands it the manned piece's steps
    this.gunner = sim.gunner = new Gunner(sim);
  }

  reset() {
    this.gunner.reset();
    for (const u of this.sim.units) for (const p of u.pieces) p.manned = false;
    this.ctl = [];
    for (const u of this.sim.units) {
      const C = CTL[u.def?.special];
      if (!C) continue;
      const c = new C(this.sim, u);
      c.reset();
      this.ctl.push(c);
    }
  }

  of(u) {
    return this.ctl.find((c) => c.u === u);
  }

  update(dt) {
    for (const c of this.ctl) c.update(dt);
    this.gunner.check();
  }

  command(u, name, args) {
    if (GUNNER_CMDS.has(name)) return this.gunner.command(u, name, args ?? {});
    return this.of(u)?.command(name, args ?? {}) ?? false;
  }

  // the director forwards each shot (guns.js calls director.onFire)
  onFire(u, p, s) {
    this.of(u)?.onFire?.(p, s);
  }

  // 1 less the strength of the Paris Gun's effect 'supply' | 'attack' | 'air' (its rounds on the junction, the reserve
  // camp, the aerodrome): enemy.js and director.js multiply the British rate of fire, the attacks' size and their flying
  effectK(effect) {
    let cut = 0;
    for (const c of this.ctl) for (const T of c.u.special?.targets ?? []) if (T.effect === effect) cut = Math.max(cut, T.fx);
    return 1 - cut;
  }

  supplyK() {
    return this.effectK('supply');
  }

  onEnemyBurst(s, pos) {
    for (const c of this.ctl) c.onEnemyBurst?.(s, pos);
  }
}

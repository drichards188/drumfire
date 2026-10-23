// Units, pieces, orders and the loading cycle. A unit holds the fire order; each piece lays on the order
// from its own position (with a sheaf offset), loads through the steps of GUNS[kind].load and fires.
// The errors the player must find by ranging are hidden here: unit.bias (the map error of this lay),
// each piece's calibration (muzzle velocity and line), the wear, the day's wind (in the integrator) and
// the dispersion drawn at every shot.
import { UNITS, piecePlacements, bearingOf, headingFor, DEG, YARD } from '../sector.js';
import { GUNS, SHELLS, STEP, DIFFICULTY } from './tables.js';
import { solveElevation, autoCharge, rangeTable, elSlope, shellK, reaches } from './shells.js';
import { solveLanding } from './script.js';

const TAU = Math.PI * 2;
const commas = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const span = (s) => (s < 120 ? `${Math.ceil(s)} seconds` : `${Math.round(s / 60)} minutes`);
export const wrapPi = (a) => {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The pieces a `fire` command with `guns` sets going: 1, 2 or 'all' (the pieces most ready first, then
// loaded ones, then the rest, in gun order, so "1" is No. 1 unless it is down or busy), or a list of piece
// indices. Dead and blocked pieces never fire. Pure: the console uses it for its FIRE label.
export function pickGuns(u, guns) {
  const live = u.pieces.filter((p) => p.state !== 'dead' && !p.blocked);
  if (Array.isArray(guns)) return live.filter((p) => guns.includes(p.i));
  const n = guns === 'all' ? live.length : clamp(guns | 0, 1, live.length);
  const rank = (p) => (p.state === 'ready' ? 0 : p.loaded ? 1 : 2);
  return live.map((p, k) => ({ p, k })).sort((a, b) => rank(a.p) - rank(b.p) || a.k - b.k).slice(0, n).map((x) => x.p).sort((a, b) => a.i - b.i);
}

export function createUnits(sim) {
  const diff = sim.difficulty;
  return (sim.theatre?.units ?? UNITS).filter(def => !sim.allowedKinds || sim.allowedKinds.has(def.kind)).map((def) => {
    const g0 = GUNS[def.kind];
    const pieces = piecePlacements(def).map((pl) => {
      const g = GUNS[pl.kind];
      const y = sim.heightAt(pl.x, pl.z);
      return {
        i: pl.i, kind: pl.kind, pos: { x: pl.x, y, z: pl.z }, bearing: pl.bearing, az: 0, el: g.restEl,
        cmd: { az: 0, el: g.restEl, tof: 0, ok: false }, state: 'idle', job: null, recoil: 0, breech: 0,
        loaded: false, crew: g.crew, crewMax: g.crew, hp: g.hp, maxHp: g.hp, wear: 0, firedAt: -999,
        // internal
        ji: 0, rounds: 0, fireAt: 0, blocked: false, shown: 0,
        calib: { v: sim.gauss() * g.calib.v, line: sim.gauss() * g.calib.line },
      };
    });
    const n = pieces.length;
    return {
      id: def.id, kind: def.kind, name: def.name, callsign: def.callsign, battery: def.battery,
      pos: { x: def.pos.x, y: sim.heightAt(def.pos.x, def.pos.z), z: def.pos.z }, zero: def.zero, alive: true,
      mode: 'auto', pieces, missionId: null, charges: g0.charges.length, arc: def.arc ?? g0.traverse,
      ammo: { he: Math.round((def.ammo ?? g0.ammo.he * n) * (def.ammo ? 1 : diff.ammo)), shrapnel: Math.round(g0.ammo.shrapnel * n * diff.ammo) },
      signature: 0, def, gate: def.special ? 'not ready' : null,
      order: {
        x: def.pos.x, z: def.pos.z, line: def.zero, range: 0, charge: -1, el: g0.restEl, tof: 0, fuze: 'instant',
        rounds: 1, adj: { add: 0, right: 0 }, target: null, ok: false, reason: '', chargeAuto: true, h: 0, sheaf: null, shift: 0,
      },
      stats: { rounds: 0, hits: 0, kills: 0 },
      // internal
      bias: null, firing: false, underFire: -999, lastShot: -999, ammoMax: { he: Math.round((def.ammo ?? g0.ammo.he * n) * (def.ammo ? 1 : diff.ammo)), shrapnel: Math.round(g0.ammo.shrapnel * n * diff.ammo) },
      ai: null, hits: 0, lost: 0,
    };
  });
}

export class Guns {
  constructor(sim) {
    this.sim = sim;
  }

  alivePieces(u) {
    return u.pieces.filter((p) => p.state !== 'dead');
  }

  // ------------------------------------------------------------------ orders
  // Lay the unit on a point. opts: h (height above ground to burst at, the balloon), keep (true keeps the lay
  // bias because the new point is a registered neighbour), bias (explicit hidden error scale)
  setTarget(u, x, z, opts = {}) {
    const sim = this.sim, o = u.order;
    const prev = o.target;
    const near = prev && Math.hypot(prev.x - x, prev.z - z) < 350;
    if (!near || !u.bias) {
      u.bias = this.drawBias(u, x, z, opts.biasScale ?? 1);
      o.adj.add = 0;
      o.adj.right = 0;
    } else if (opts.biasScale != null && opts.biasScale < 0.5) {
      // a pre-registered line (SOS, barrage) starts close
      u.bias = this.drawBias(u, x, z, opts.biasScale);
    }
    o.target = { x, z };
    o.h = opts.h ?? 0;
    o.sheaf = opts.sheaf ?? null;
    o.shift = opts.shift ?? 0;
    if (opts.fuze) o.fuze = opts.fuze;
    this.recompute(u);
  }

  drawBias(u, x, z, scale = 1) {
    const sim = this.sim, d = sim.difficulty;
    const mag = (50 + sim.rng() * 350) * d.err * scale;
    const a = sim.rng() * TAU;
    return { over: mag * Math.cos(a), right: mag * Math.sin(a) * 0.6, x, z };
  }

  recompute(u) {
    const sim = this.sim, o = u.order;
    if (!o.target) {
      o.ok = false;
      return;
    }
    const { x: tx, z: tz } = o.target;
    const dx = tx - u.pos.x, dz = tz - u.pos.z;
    const r0 = Math.hypot(dx, dz) || 1;
    const fx = dx / r0, fz = dz / r0, rx = -fz, rz = fx;
    const ax = tx + fx * o.adj.add + rx * o.adj.right, az = tz + fz * o.adj.add + rz * o.adj.right;
    o.x = ax;
    o.z = az;
    const D = Math.hypot(ax - u.pos.x, az - u.pos.z);
    o.range = D;
    o.line = bearingOf(ax - u.pos.x, az - u.pos.z);
    if (o.chargeAuto) o.charge = autoCharge(u.kind, D);
    const g = GUNS[u.kind];
    if (o.fuze === 'shrapnel' && !g.fuzes.includes('shrapnel')) o.fuze = 'instant';
    const ground = sim.heightAt(ax, az);
    const hT = ground + (o.h || (o.fuze === 'shrapnel' ? 25 : 0));
    const live = u.pieces.filter((p) => p.state !== 'dead');
    const sheaf = o.rounds > 1 || o.sheaf ? (o.sheaf ?? g.sheaf) : 0;
    let any = false, reason = '', first = null;
    live.forEach((p, k) => {
      const off = (k - (live.length - 1) / 2) * sheaf + (o.shift || 0);
      const px = ax + rx * off, pz = az + rz * off;
      const ddx = px - p.pos.x, ddz = pz - p.pos.z;
      const Dp = Math.hypot(ddx, ddz);
      const brg = bearingOf(ddx, ddz);
      let azr = wrapPi(p.bearing - brg);
      let ok = o.charge >= 0;
      let why = o.charge < 0 ? (D < 2000 ? 'inside minimum range' : 'out of range') : '';
      if (Math.abs(azr) > u.arc) {
        azr = clamp(azr, -u.arc, u.arc);
        ok = false;
        why = 'out of arc';
      }
      let sol = null;
      if (o.charge >= 0) {
        sol = solveElevation(p.kind, o.charge, Dp, hT - (p.pos.y + 2.5));
        if (!sol) {
          ok = false;
          why = Dp < rangeTable(p.kind, o.charge).rMin * 1.02 ? 'inside minimum range' : 'out of range';
        }
      }
      p.cmd.az = azr;
      if (sol) {
        p.cmd.el = sol.el;
        p.cmd.tof = sol.tof;
      }
      p.cmd.ok = ok;
      p.cmd.why = why;
      p.blocked = !ok;
      if (ok) any = true; else if (!reason) reason = why;
      if (!first && sol) first = sol;
    });
    o.why = any ? '' : reason || 'no pieces'; // the guns' own reason, even while a controller holds the unit
    o.ok = any && !u.gate;
    o.reason = u.gate ? u.gate : any ? '' : reason || 'no pieces';
    if (first) {
      o.el = first.el;
      o.tof = first.tof;
    }
  }

  // Why the unit cannot carry out its order, in the player's words, or '' when it can (or has no order). The general
  // rule: an order the guns cannot carry out is always explained. sim.command radios it when the player gives the
  // order, and the console shows it for as long as the order stands (status line, guns card, FIRE key, roster).
  problem(u, short = false) {
    const o = u.order, g = GUNS[u.kind];
    if (!u.alive) return 'every gun is out of action';
    if (!o.target) return '';
    // a range the gun cannot reach stays out of reach whatever holds it back (its preparation, its drill, a bed being
    // relaid), so it is said at the order, not when the gate lifts; the Karl is the exception (it drives to a new
    // firing position), and an arc may change with the gate (the bed). A launch site's console walks the drill itself.
    const unreachable = o.why === 'out of range' || o.why === 'inside minimum range';
    if (u.gate && (g.launcher || !unreachable || g.special === 'karl')) return g.launcher ? '' : u.gate;
    if (u.mode === 'hold') return short ? 'holding (A or MANUAL to go on)' : 'the battery is holding (cease fire): press A or MANUAL to go on';
    const live = u.pieces.filter((p) => p.state !== 'dead');
    const len = (m) => (g.metric ? `${commas(m)} m` : `${commas(m / YARD)} yards`);
    const deg = (r) => `${+(Math.abs(r) / DEG).toFixed(1)}`;
    if (!o.ok) {
      if (o.why === 'out of arc') {
        if (u.loadThrough) return ''; // the set-up Karl's crew turns the vehicle onto the line by itself
        const off = wrapPi(live[0].bearing - o.line), side = off > 0 ? 'left' : 'right';
        const bed = u.special?.bed; // the WW1 mode's 42 cm guns: the bed can be relaid (src/ww1/special.js)
        if (short) return `out of arc: ${deg(off)}° ${side} (${bed ? 'T: relay the bed' : `±${deg(u.arc)}°`})`;
        return `out of arc: the target is ${deg(off)} degrees ${side} of the line of fire and the `
          + `${u.pieces.length > 1 ? 'guns traverse' : 'gun traverses'} ${deg(u.arc)} degrees either way`
          + (g.special === 'karl' ? '. Raise the hull (R), turn the vehicle (T), lower it (L)'
            : bed ? `. Relay the bed onto its line (T: Bettung umlegen${bed.dur ? `, the gun out of action for about ${span(bed.dur)}` : ''})`
            : '. Give it to a battery that can bear on it');
      }
      if (o.why === 'out of range' || o.why === 'inside minimum range') {
        const far = o.why === 'out of range';
        // a charge the player chose that cannot reach, where another one could
        if (!o.chargeAuto && g.charges.some((c, i) => reaches(u.kind, i, o.range))) {
          const ch = g.charges[o.charge]?.name ?? 'this charge';
          return short ? `charge too ${far ? 'small' : 'big'} (Q/E)`
            : `${o.why} on ${ch}: a ${far ? 'bigger' : 'smaller'} charge reaches it (Q/E)`;
        }
        const lim = far ? rangeTable(u.kind, g.charges.length - 1).rMax : rangeTable(u.kind, 0).rMin;
        if (short) return `${far ? 'out of range' : 'too close'} (${far ? 'max' : 'min'} ${len(lim)})`;
        return far ? `out of range: ${len(o.range)} against ${len(lim)} at most` : `inside the minimum range: ${len(o.range)} against ${len(lim)} at least`;
      }
      return o.why || 'the guns cannot be laid on it';
    }
    if (live.some((p) => p.loaded)) return '';
    const sh = o.fuze === 'shrapnel';
    if ((sh ? u.ammo.shrapnel : u.ammo.he) <= 0) return sh ? 'no shrapnel left at the guns' : 'no shells left at the guns';
    if (live.every((p) => p.crew < Math.ceil(p.crewMax * 0.3))) return 'too few men left to serve the guns';
    return '';
  }

  correct(u, add, right) {
    const o = u.order;
    if (!o.target) return;
    o.adj.add += add;
    o.adj.right += right;
    this.recompute(u);
  }

  setCharge(u, c) {
    const o = u.order;
    o.charge = clamp(c | 0, 0, GUNS[u.kind].charges.length - 1);
    o.chargeAuto = false;
    // recompute() would re-pick when chargeAuto; keep the manual choice
    this.recompute(u);
  }

  setFuze(u, f) {
    if (!GUNS[u.kind].fuzes.includes(f)) return;
    u.order.fuze = f;
    this.recompute(u);
  }

  setRounds(u, n) {
    const o = u.order, was = o.rounds > 1;
    o.rounds = clamp(n | 0, 1, 99);
    if (was !== o.rounds > 1) this.recompute(u);
  }

  // start the series: every live piece (or the `guns` chosen with pickGuns) fires `order.rounds` rounds
  fire(u, guns) {
    const sim = this.sim, o = u.order;
    if (!o.target || !o.ok || !u.alive || u.gate) return false;
    const live = u.pieces.filter((p) => p.state !== 'dead' && !p.blocked);
    const m = u.missionId != null ? sim.missionById(u.missionId) : null;
    // without `guns`: ranging means one gun (the lead) fires a single round; the whole battery is for effect
    const ranging = guns == null && o.rounds === 1 && m && m.state === 'ranging' && live.length > 1;
    const sel = guns != null ? pickGuns(u, guns) : ranging ? [live.find((p) => p.loaded) ?? live[0]] : live;
    if (guns != null && !sel.length) return false;
    let i = 0;
    for (const p of sel) {
      p.rounds = o.rounds;
      p.fireAt = sim.time + (ranging ? 0 : 0.35 * i + sim.rng() * 0.9 * (i > 0 ? 1 : 0));
      i++;
    }
    u.firing = true;
    if (m && m.state === 'ranging' && o.rounds > 1) sim.setMissionState(m, 'ffe');
    return true;
  }

  cease(u) {
    for (const p of u.pieces) p.rounds = 0;
    u.firing = false;
  }

  setMode(u, mode) {
    u.mode = mode;
    if (mode === 'hold') this.cease(u);
  }

  // ------------------------------------------------------------------ the loading cycle
  startLoad(u, p) {
    const g = GUNS[p.kind];
    p.ji = 0;
    p.state = 'loading';
    this.beginStep(u, p);
  }

  stepList(p) {
    return GUNS[p.kind].load;
  }

  beginStep(u, p) {
    const sim = this.sim, g = GUNS[p.kind];
    const st = g.load[p.ji];
    // crews short of men are slower; a gun in a hurry (attract) is quicker
    const crewK = clamp(p.crewMax / Math.max(1, p.crew), 1, 2.6) * (sim.attract ? 0.6 : 1);
    let dur = st.dur * crewK;
    if (st.step === 'depress') dur = Math.max(dur, Math.abs(p.el - g.loadEl) / g.elRate);
    p.job = { step: st.step, t: 0, dur, i: p.ji, n: g.load.length };
    sim.events.load?.(u, p, st.step);
  }

  needLoad(u, p) {
    // `loadThrough` (set by a controller: the sandbox Karl turning its hull onto a line past its own traverse) lets the
    // crew load while the unit is gated or the line is out of arc, as the other guns load while they traverse
    if (p.loaded || p.state !== 'idle' || !u.alive || u.mode === 'hold' || (u.gate && !u.loadThrough)) return false;
    if (!u.order.target || ((p.blocked || !p.cmd.ok) && !(u.loadThrough && u.order.why === 'out of arc'))) return false;
    if (p.crew < Math.ceil(p.crewMax * 0.3)) return false;
    const sh = u.order.fuze === 'shrapnel';
    return (sh ? u.ammo.shrapnel : u.ammo.he) > 0;
  }

  update(dt) {
    const sim = this.sim, diff = sim.difficulty;
    for (const u of sim.units) {
      if (!u.alive) continue;
      // signature fades, faster when the unit is silent on hold
      const sig = u.signature;
      if (sig > 0) u.signature = Math.max(0, sig - (u.mode === 'hold' ? 0.014 : 0.006) * dt);
      // supplies and replacements
      const quiet = sim.time - u.underFire > 40;
      for (const k of ['he', 'shrapnel']) if (u.ammo[k] < u.ammoMax[k]) {
        u._ac = (u._ac ?? 0) + dt * 0.02 * u.pieces.length * (u.def?.resupply ?? (u.def?.special ? 0 : 1));
        if (u._ac >= 1) {
          u._ac -= 1;
          u.ammo[k]++;
        }
      }
      let anyAlive = false, firing = false;
      for (const p of u.pieces) {
        if (p.state === 'dead') continue;
        anyAlive = true;
        if (quiet && p.crew < p.crewMax) {
          p._cc = (p._cc ?? 0) + dt;
          if (p._cc > 45) {
            p._cc = 0;
            p.crew++;
          }
        }
        if (u.mode === 'hold' && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 0.4 * dt);
        this.updatePiece(u, p, dt);
        if (p.rounds > 0) firing = true;
      }
      u.firing = firing;
      if (!anyAlive && u.alive) {
        u.alive = false;
        sim.radio(`${u.callsign}: all guns lost.`, 'alert');
      }
    }
  }

  slew(p, dt, elTarget, azTarget = p.cmd.az) {
    if (p.fixed) return; // a controller holds the piece where it is (the Gustav while it is still being assembled)
    const g = GUNS[p.kind];
    const da = azTarget - p.az, de = elTarget - p.el;
    const ma = g.azRate * dt, me = g.elRate * dt;
    p.az += Math.abs(da) <= ma ? da : Math.sign(da) * ma;
    p.el += Math.abs(de) <= me ? de : Math.sign(de) * me;
  }

  laid(p) {
    return Math.abs(p.cmd.az - p.az) < 0.0006 && Math.abs(p.cmd.el - p.el) < 0.0005;
  }

  updatePiece(u, p, dt) {
    const sim = this.sim, g = GUNS[p.kind];
    const heavy = g.load[0]?.step === 'depress';
    // recoil: a quick kick back, then a slow run out
    if (p.state === 'recoil') {
      // a rocket launcher's ripple: the rest of the tubes go off one by one
      if (p.ripple) {
        if (sim.time >= p.ripple.next && p.ripple.i < g.salvo.n) {
          // the order was changed under the ripple (a new lay out of reach, a cease): the rest stay in their tubes
          if (!u.order.ok || u.order.charge < 0 || u.mode === 'hold') p.ripple.i = g.salvo.n;
          else {
            this.fireShell(u, p);
            return;
          }
        }
        if (p.ripple.i < g.salvo.n) return;
      }
      const t = sim.time - (p.ripple ? p.ripple.last : p.firedAt);
      const k = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / g.runout);
      p.recoil = t < 0.18 ? Math.sin(k * Math.PI / 2) : k * k * (3 - 2 * k);
      if (t > 0.18 + g.runout) {
        p.recoil = 0;
        p.state = 'idle';
        p.ripple = null;
      }
      this.slew(p, dt, p.el);
      return;
    }
    const ordered = u.order.target && p.cmd.ok;
    // `stowed` (set by a controller: the Karl with its hull not down, rising, turning or on the road; the Paris Gun
    // between rounds): the gun is not laid. The barrel waits at its loading elevation on the middle of its traverse (on
    // its line with `stowLaid`), and a round laid or being laid goes back to waiting at its lay step; it lays again when
    // the hull is down
    const held = !!u.stowed;
    if (held && (p.state === 'ready' || p.state === 'laying')) {
      const li = g.load.findIndex((s) => s.step === 'lay');
      if (li >= 0) {
        p.state = 'loading';
        p.ji = li;
        this.beginStep(u, p);
      }
    }
    if (p.state === 'idle') {
      if (held) this.slew(p, dt, g.loadEl, u.stowLaid ? p.cmd.az : 0); else this.slew(p, dt, ordered ? p.cmd.el : p.el);
      if (p.breech > 0) p.breech = Math.max(0, p.breech - dt / 6); // a cycle given up: the breech closes again
      if (this.needLoad(u, p)) this.startLoad(u, p);
      return;
    }
    if (p.state === 'loading') {
      // stowed without `loadThrough` (the Karl raising its hull to move off), the crew stops loading: a shell not yet
      // rammed goes back on the carrier (it is counted off at the ram) and the cycle is given up; a rammed one is
      // closed up and waits at its lay
      if (held && !u.loadThrough && !p.loaded) {
        p.state = 'idle';
        p.job = null;
        return;
      }
      const job = p.job, st = g.load[p.ji];
      job.t += dt;
      let elT = heavy ? g.loadEl : p.cmd.el;
      if (st.step === 'lay' && !held) elT = p.cmd.el;
      if (heavy && p.ji === 0 && st.step === 'depress') elT = g.loadEl;
      this.slew(p, dt, elT, held ? 0 : p.cmd.az);
      // breech and ammunition follow the step
      const k = Math.min(1, job.t / Math.max(0.01, job.dur));
      if (st.step === 'open') p.breech = k;
      else if (st.step === 'close') p.breech = 1 - k;
      if (job.t >= job.dur) {
        if (st.step === 'depress' && Math.abs(p.el - g.loadEl) > 0.002) return;
        if (st.step === 'lay' && (held || !this.laid(p))) return;
        // the round is in when it is rammed (a rocket launcher has no rammer: when the rockets are in the tubes)
        if (st.step === 'ram' || (st.step === 'shell' && g.salvo)) {
          p.loaded = true;
          const n = g.salvo ? Math.min(g.salvo.n, u.ammo.he) : 1;
          p.tubes = n;
          if (u.order.fuze === 'shrapnel') u.ammo.shrapnel = Math.max(0, u.ammo.shrapnel - 1); else u.ammo.he = Math.max(0, u.ammo.he - n);
          p.shot = u.order.fuze;
        }
        p.ji++;
        if (p.ji >= g.load.length) {
          p.state = 'ready';
          p.job = null;
          p.breech = 0;
          sim.events.load?.(u, p, 'ready');
        } else this.beginStep(u, p);
      }
      return;
    }
    if (p.state === 'laying') {
      p.job.t += dt;
      this.slew(p, dt, p.cmd.el);
      if (p.job.t >= p.job.dur && this.laid(p)) {
        p.state = 'ready';
        p.job = null;
      }
      return;
    }
    if (p.state === 'ready') {
      this.slew(p, dt, p.cmd.el);
      if (!ordered) return;
      if (!this.laid(p)) {
        // a correction came in: re-lay
        p.state = 'laying';
        p.job = { step: 'lay', t: 0, dur: 1.2, i: 0, n: 1 };
        sim.events.load?.(u, p, 'lay');
        return;
      }
      if (p.rounds > 0 && sim.time >= p.fireAt && u.mode !== 'hold') {
        this.fireShell(u, p);
      }
    }
  }

  // scripted range: for a unit laid on a mission with a firstError, the point this piece's round must land on
  // ({ at, first }): the aim point (with the sheaf offset) moved by the error along the unit's line of fire
  scriptLay(u, p) {
    const sim = this.sim, o = u.order, m = u.missionId != null ? sim.missionById(u.missionId) : null, fe = m?.firstError;
    if (!fe || !o.target) return null;
    const first = !fe.used;
    if (first) {
      fe.used = true;
      fe.unit = u.id;
    } else if (fe.unit !== u.id) return null;
    const ref = sim.observers.refPoint(m);
    let dx = ref.x - u.pos.x, dz = ref.z - u.pos.z, r = Math.hypot(dx, dz) || 1;
    const fx = dx / r, fz = dz / r;
    dx = o.target.x - u.pos.x;
    dz = o.target.z - u.pos.z;
    r = Math.hypot(dx, dz) || 1;
    const live = u.pieces.filter((q) => q.state !== 'dead');
    const sheaf = o.rounds > 1 || o.sheaf ? (o.sheaf ?? GUNS[u.kind].sheaf) : 0;
    const off = (live.indexOf(p) - (live.length - 1) / 2) * sheaf + (o.shift || 0);
    return { first, at: { x: o.x - dz / r * off + fx * fe.over - fz * fe.right, z: o.z + dx / r * off + fz * fe.over + fx * fe.right } };
  }

  // ------------------------------------------------------------------ the shot
  fireShell(u, p) {
    const sim = this.sim, g = GUNS[p.kind], o = u.order;
    const ch = g.charges[o.charge];
    const wearK = 1 + p.wear * 1.5;
    const bias = u.bias ?? { over: 0, right: 0 };
    const D = Math.max(500, Math.hypot(o.x - p.pos.x, o.z - p.pos.z));
    // hidden terms: calibration, wear, the lay's map error, dispersion
    // scripted range: a mission's firstError is the lay's map error, applied exactly (the first round lands that far
    // over/right of the aim point); later rounds of the lay carry it too, plus only the normal dispersion
    const sl = sim.scripted ? this.scriptLay(u, p) : null;
    const cv = sl ? 0 : p.calib.v, cl = sl ? 0 : p.calib.line, bo = sl ? 0 : bias.over, br = sl ? 0 : bias.right;
    let v = ch.v * (1 + cv - 0.05 * p.wear + sim.gauss() * g.disp.r * wearK / 2);
    const slope = elSlope(p.kind, o.charge, D);
    let brg = p.bearing - p.az + cl + br / D + sim.gauss() * g.disp.l * wearK;
    let el = p.el + slope * bo + sim.gauss() * 0.00015;
    if (sl && o.fuze !== 'shrapnel') {
      const s = solveLanding(sim, p, ch, shellK(p.kind), slope, D, p.el, p.bearing - p.az, sl.at);
      if (s && sl.first) {
        v = ch.v;
        el = s.el;
        brg = s.brg;
      } else if (s) {
        el += s.el - p.el;
        brg += s.brg - (p.bearing - p.az);
      }
    }
    const ch2 = Math.cos(el);
    const dirx = Math.sin(brg), dirz = -Math.cos(brg);
    const mx = p.pos.x + dirx * 4 * ch2, mz = p.pos.z + dirz * 4 * ch2, my = p.pos.y + 2.5 + 4 * Math.sin(el);
    const shell = {
      id: sim.nextId('s'), own: true, unitId: u.id, piece: p.i, kind: p.kind, calibre: g.calibre,
      pos: { x: mx, y: my, z: mz }, prev: { x: mx, y: my, z: mz },
      vel: { x: v * ch2 * dirx, y: v * Math.sin(el), z: v * ch2 * dirz },
      fuze: p.shot ?? o.fuze, t: 0, t0: sim.time, tof: p.cmd.tof, aim: { x: o.x, z: o.z }, alive: true,
      k: shellK(p.kind), aimY: sim.heightAt(o.x, o.z) + (o.h || (o.fuze === 'shrapnel' ? 25 : 0)),
      plane: Math.hypot(o.x - p.pos.x, o.z - p.pos.z), pbx: dirx, pbz: dirz, ox: p.pos.x, oz: p.pos.z,
      fuzeErr: sim.gauss() * 22,
    };
    sim.shells.push(shell);
    if (g.salvo) {
      // one round of a launcher is a ripple: the first rocket starts it, recoil (above) fires the rest
      shell.tube = p.ripple ? p.ripple.i : 0;
      const n = p.tubes ?? g.salvo.n;
      if (p.ripple) {
        p.ripple.i++;
        p.ripple.next = sim.time + g.salvo.dt;
        p.ripple.last = sim.time;
        if (p.ripple.i >= n) p.ripple.i = g.salvo.n;
        sim.director.onFire?.(u, p, shell);
        sim.events.fire?.(u, p, shell);
        return shell;
      }
      p.ripple = { i: n > 1 ? 1 : g.salvo.n, next: sim.time + g.salvo.dt, last: sim.time };
    }
    p.loaded = false;
    p.rounds = Math.max(0, p.rounds - 1);
    p.state = 'recoil';
    p.firedAt = sim.time;
    p.wear = Math.min(1, p.wear + g.wearPerRound);
    u.stats.rounds++;
    u.lastShot = sim.time;
    // the enemy locates a battery by its flashes and its noise
    const night = sim.night ? 1.45 : 1;
    const balloon = sim.balloonUp() ? 1.35 : 1;
    u.signature = Math.min(1, u.signature + g.sig * night * balloon * sim.difficulty.sig);
    sim.stats.rounds++;
    sim.director.onFire?.(u, p, shell);
    sim.events.fire?.(u, p, shell);
    return shell;
  }

  // ------------------------------------------------------------------ damage from the enemy
  damagePiece(u, p, dmg, direct = false) {
    const sim = this.sim;
    if (p.state === 'dead' || sim.attract) return;
    if (sim.invulnerable) {
      u.underFire = sim.time;
      return;
    }
    p.hp -= dmg * sim.difficulty.dmg;
    u.underFire = sim.time;
    sim.events.pieceHit?.(u, p);
    // crew casualties
    if (p.crew > 0 && sim.rng() < (direct ? 0.9 : 0.35 + dmg / 120)) {
      p.crew = Math.max(0, p.crew - (1 + (sim.rng() < 0.4 ? 1 : 0)));
      sim.events.casualty?.(u, p);
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.state = 'dead';
      p.job = null;
      p.rounds = 0;
      p.loaded = false;
      p.recoil = 0;
      u.lost++;
      sim.stats.piecesLost++;
      sim.events.pieceDestroyed?.(u, p);
      sim.events.secondary?.({ x: p.pos.x, y: p.pos.y + 2, z: p.pos.z }, 2.5 + (p.kind === 'bl15' ? 1 : 0));
      sim.radio(`${u.callsign}: gun ${p.i + 1} destroyed.`, 'alert');
      this.recompute(u);
    }
  }
}

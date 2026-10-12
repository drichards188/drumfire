// Units, pieces, orders and the loading cycle. A unit holds the fire order; each piece lays on the order
// from its own position (with a sheaf offset), loads through the steps of GUNS[kind].load and fires.
// The errors the player must find by ranging are hidden here: unit.bias (the map error of this lay),
// each piece's calibration (muzzle velocity and line), the wear, the day's wind (in the integrator) and
// the dispersion drawn at every shot.
import { UNITS, piecePlacements, bearingOf, headingFor, DEG } from '../sector.js';
import { GUNS, SHELLS, STEP, DIFFICULTY } from './tables.js';
import { solveElevation, autoCharge, rangeTable, elSlope, shellK, reaches } from './shells.js';
import { solveLanding } from './script.js';

const TAU = Math.PI * 2;
export const wrapPi = (a) => {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createUnits(sim) {
  const diff = sim.difficulty;
  return UNITS.map((def) => {
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
      mode: 'auto', pieces, missionId: null, charges: g0.charges.length, arc: g0.traverse,
      ammo: { he: Math.round(g0.ammo.he * n * diff.ammo), shrapnel: Math.round(g0.ammo.shrapnel * n * diff.ammo) },
      signature: 0,
      order: {
        x: def.pos.x, z: def.pos.z, line: def.zero, range: 0, charge: -1, el: g0.restEl, tof: 0, fuze: 'instant',
        rounds: 1, adj: { add: 0, right: 0 }, target: null, ok: false, reason: '', chargeAuto: true, h: 0, sheaf: null, shift: 0,
      },
      stats: { rounds: 0, hits: 0, kills: 0 },
      // internal
      bias: null, firing: false, underFire: -999, lastShot: -999, ammoMax: { he: Math.round(g0.ammo.he * n * diff.ammo), shrapnel: Math.round(g0.ammo.shrapnel * n * diff.ammo) },
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
      if (Math.abs(azr) > g.traverse) {
        azr = clamp(azr, -g.traverse, g.traverse);
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
      p.blocked = !ok;
      if (ok) any = true; else if (!reason) reason = why;
      if (!first && sol) first = sol;
    });
    o.ok = any;
    o.reason = any ? '' : reason || 'no pieces';
    if (first) {
      o.el = first.el;
      o.tof = first.tof;
    }
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

  // start the series: every ready piece (or loading piece) will fire `order.rounds` rounds
  fire(u) {
    const sim = this.sim, o = u.order;
    if (!o.target || !o.ok || !u.alive) return false;
    const live = u.pieces.filter((p) => p.state !== 'dead' && !p.blocked);
    const m = u.missionId != null ? sim.missionById(u.missionId) : null;
    // ranging: one gun (the lead) fires a single round; the whole battery is for effect
    const ranging = o.rounds === 1 && m && m.state === 'ranging' && live.length > 1;
    const sel = ranging ? [live.find((p) => p.loaded) ?? live[0]] : live;
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
    if (p.loaded || p.state !== 'idle' || !u.alive || u.mode === 'hold') return false;
    if (!u.order.target || p.blocked || !p.cmd.ok) return false;
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
        u._ac = (u._ac ?? 0) + dt * 0.02 * u.pieces.length;
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

  slew(p, dt, elTarget) {
    const g = GUNS[p.kind];
    const da = p.cmd.az - p.az, de = elTarget - p.el;
    const ma = g.azRate * dt, me = g.elRate * dt;
    p.az += Math.abs(da) <= ma ? da : Math.sign(da) * ma;
    p.el += Math.abs(de) <= me ? de : Math.sign(de) * me;
  }

  laid(p) {
    return Math.abs(p.cmd.az - p.az) < 0.0006 && Math.abs(p.cmd.el - p.el) < 0.0005;
  }

  updatePiece(u, p, dt) {
    const sim = this.sim, g = GUNS[p.kind];
    const heavy = g.load[0].step === 'depress';
    // recoil: a quick kick back, then a slow run out
    if (p.state === 'recoil') {
      const t = sim.time - p.firedAt;
      const k = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / g.runout);
      p.recoil = t < 0.18 ? Math.sin(k * Math.PI / 2) : k * k * (3 - 2 * k);
      if (t > 0.18 + g.runout) {
        p.recoil = 0;
        p.state = 'idle';
      }
      this.slew(p, dt, p.el);
      return;
    }
    const ordered = u.order.target && p.cmd.ok;
    if (p.state === 'idle') {
      this.slew(p, dt, ordered ? p.cmd.el : p.el);
      if (this.needLoad(u, p)) this.startLoad(u, p);
      return;
    }
    if (p.state === 'loading') {
      const job = p.job, st = g.load[p.ji];
      job.t += dt;
      let elT = heavy ? g.loadEl : p.cmd.el;
      if (st.step === 'lay') elT = p.cmd.el;
      if (heavy && p.ji === 0 && st.step === 'depress') elT = g.loadEl;
      this.slew(p, dt, elT);
      // breech and ammunition follow the step
      const k = Math.min(1, job.t / Math.max(0.01, job.dur));
      if (st.step === 'open') p.breech = k;
      else if (st.step === 'close') p.breech = 1 - k;
      if (job.t >= job.dur) {
        if (st.step === 'depress' && Math.abs(p.el - g.loadEl) > 0.002) return;
        if (st.step === 'lay' && !this.laid(p)) return;
        if (st.step === 'ram') {
          p.loaded = true;
          if (u.order.fuze === 'shrapnel') u.ammo.shrapnel = Math.max(0, u.ammo.shrapnel - 1); else u.ammo.he = Math.max(0, u.ammo.he - 1);
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

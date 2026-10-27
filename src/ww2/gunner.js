// The gunner: the player in person at one gun of a WW2 battery, the Big Bertha demo's drill on the main game's guns
// (DESIGN.md "WW2 mode: the gunner"). Node-safe, deterministic per seed (it draws nothing from sim.rng).
//
// The player takes one post of the gun's detachment at a time:
//   cmd   Geschützführer: reads back each new fire command for this gun (hold E)
//   lay   Richtkanonier: cranks the gun onto the line and the elevation (A/D, W/S, Shift fine); the heavies' barrel
//         first runs down to its loading angle (the 'depress' step). The Gustav and the Karl (DRIVEN) lay by power: a
//         tap starts the drive (command 'drive') and it runs on by itself to the mark; Shift held is the hand wheel
//   load  Ladekanonier: opens the breech, brings up and rams the shell, puts in the cartridge, closes (hold E)
//   fire  Abzugskanonier: fits the primer, pulls the lanyard (hold E)
// The steps are the piece's own loading cycle (GUNS[kind].load; a step the player works takes at most HOLD seconds of
// holding, so the big guns' hoists and rammers are not minutes of a held key) and the piece keeps the fields the render layer and the
// console read (state, job, az, el, breech, loaded, firedAt, fireAt), so the crew's choreography (render/crews.js, a
// pure function of the job) plays at the player's pace. `assist` (crew help): the men at the other posts do their work
// at the crew's own pace; without it nothing at another post moves until the player goes there (the demo's "assist"
// off). The battery's orders come as they always do: from its AI commander when the unit is on auto, from the console
// when it is manual (a pull with no fire order then fires this gun alone on the battery's order: its rounds per gun).
//
// Wiring: SpecialWW2 makes one Gunner (sim.gunner) and hands it the commands below; sim/guns.js updatePiece hands a
// piece with `manned` set to updatePiece here instead of running its own cycle. The page sets the held keys with
// setInput() every frame. sim.events.gunner(what, a, b) tells the page what happened ('man', 'unman', 'order', 'mark',
// 'pull', 'lapse').
//   sim.command(unitId, 'man', { piece, post, assist, othersAuto })   take a place at a gun (piece index, default the
//                                                                    first gun standing; post default 'lay')
//   sim.command(unitId, 'post', { post })      move to another post at the same gun
//   sim.command(unitId, 'unman')               leave the gun (its crew carries on by itself)
//   sim.command(unitId, 'assist', { on })      crew help on or off
//   sim.command(unitId, 'drive', { axis, dir }) a DRIVEN gun's layer: start the drive ('az' or 'el', dir +1 left or
//                                              up, -1 right or down); the same tap the other way stops it
import { GUNS } from '../sim/tables.js';

export const STRICH = (2 * Math.PI) / 6400;
export const POSTS = [
  { id: 'cmd', key: 1, name: 'Geschützführer', en: 'gun commander' },
  { id: 'lay', key: 2, name: 'Richtkanonier', en: 'layer' },
  { id: 'load', key: 3, name: 'Ladekanonier', en: 'loader' },
  { id: 'fire', key: 4, name: 'Abzugskanonier', en: 'firer' },
];
const POST_IDS = new Set(POSTS.map((p) => p.id));
// the guns a player can serve in person: the field and heavy howitzers, the Mörserlafette pair, the Gustav and the
// Karl (the Nebelwerfer is fired from cover; the launch sites have drills of their own)
export const MANNABLE = new Set(['lefh18', 'sfh18', 'k18', 'mrs18', 'gustav', 'karl']);
// the guns whose laying gear is powered: the Gustav shunted along its curve and elevated by motor, the Karl's
// hydraulic elevation and traverse. Their rates are slow (minutes from the loading angle to the lay), so the layer
// starts the drive and it stops itself on the mark
export const DRIVEN = new Set(['gustav', 'karl']);
// which post works which step of the loading cycle, and the step in the player's words
export const STEP_POST = { depress: 'lay', open: 'load', shell: 'load', ram: 'load', cartridge: 'load', close: 'load', prime: 'fire', lay: 'lay' };
export const STEP_EN = {
  depress: 'run the barrel down to the loading angle', open: 'open the breech', shell: 'bring up the shell', ram: 'ram the shell',
  cartridge: 'put in the cartridge', close: 'close the breech', prime: 'fit the primer', lay: 'lay the gun',
};
export const GUNNER_CMDS = new Set(['man', 'post', 'unman', 'assist', 'drive']);
const ACK = 1.2, PULL = 0.7; // how long the player holds E to read back a command and to pull the lanyard (s)
const HOLD = 8; // s: the most a step of the cycle takes in the player's hands (the field guns' longest is 8 already)
const CREW_ACK = 2.5, CREW_PULL = 0.9; // the crew's: the commander reads back, the firer pulls
const TOL = STRICH; // laid: within one Strich of the command on the line and on the elevation
const SAME = 0.5 * STRICH; // a command that moves the lay less than this is the same command
const LAPSE = 40; // s: an auto battery gives up waiting for a gun that has not moved on its fire order
const FINE = 0.15; // Shift: the fine wheel
const OPEN_STEPS = new Set(['open', 'shell', 'ram', 'cartridge', 'close']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toStrich = (r) => Math.round(r / STRICH);
// a deflection as the command gives it: 'links 124' / 'rechts 30'
export const fmtSeite = (r) => { const s = toStrich(r); return s === 0 ? 'Grundrichtung' : `${s > 0 ? 'links' : 'rechts'} ${Math.abs(s)}`; };

export class Gunner {
  constructor(sim) {
    this.sim = sim;
    this.st = null; // the player at a gun (plain data for the page), null when nobody is
    this.input = { az: 0, el: 0, fine: false, work: false };
  }

  reset() {
    this.st = null;
    this.input = { az: 0, el: 0, fine: false, work: false };
  }

  emit(what, a, b) {
    this.sim.events.gunner?.(what, a, b);
  }

  refuse(text) {
    this.sim.radio(text, 'warn');
    return false;
  }

  // the held keys: { az: -1..1 (A +1, D -1), el: -1..1 (W +1, S -1), fine, work (E) }
  setInput(inp) {
    Object.assign(this.input, inp);
  }

  unit() {
    return this.st ? this.sim.unitById(this.st.unitId) : null;
  }

  piece() {
    return this.unit()?.pieces[this.st.pi] ?? null;
  }

  // ------------------------------------------------------------------ commands
  command(u, name, a = {}) {
    const sim = this.sim;
    if (name === 'man') {
      const g = GUNS[u.kind];
      if (sim.attract) return false;
      if (sim.scripted && !sim.range) return this.refuse('Not during a lesson: the lesson keeps you at the console.'); // (the test range allows it)
      if (!MANNABLE.has(u.kind)) {
        return this.refuse(u.kind === 'nbw41' ? `${u.callsign}: the Nebelwerfer is fired electrically from cover; there is no gun to serve in person.`
          : `${u.callsign}: the ${g?.name ?? u.name} has a drill of its own; it cannot be served in person.`);
      }
      const live = u.pieces.filter((p) => p.state !== 'dead');
      if (!live.length) return this.refuse(`${u.callsign}: every gun is knocked out.`);
      const p = a.piece != null ? u.pieces[a.piece] : live[0];
      if (!p || p.state === 'dead') return this.refuse(`${u.callsign}: No. ${(a.piece ?? 0) + 1} gun is knocked out.`);
      // the Gustav during its railway preparation: there is no gun to serve until it stands on its curve
      if (p.fixed) return this.refuse(`${u.callsign}: the gun is still in pieces (${u.gate ?? 'being assembled'}); man it once it stands.`);
      const was = this.st;
      if (was && (was.unitId !== u.id || was.pi !== p.i)) this.release(false);
      if (this.st) { // already here: only the post (and the crew help) change
        if (a.post && POST_IDS.has(a.post)) this.st.post = a.post;
        if (a.assist != null) this.st.assist = !!a.assist;
        return true;
      }
      p.manned = true;
      this.st = {
        unitId: u.id, pi: p.i, kind: u.kind, post: POST_IDS.has(a.post) ? a.post : (was?.post ?? 'lay'),
        assist: a.assist ?? was?.assist ?? true,
        order: null, // the gun's fire command { az, el, charge, fuze, ok, why, n, acked }
        ack: null, // the last command read back (the layer's marks)
        n: 0, hold: null, crewT: 0, pullT: 0, latch: { az: 0, el: 0 }, drive: { az: 0, el: 0 }, volley: p.volley ?? null, sched: null,
        stall: 0, prog: 0, next: null, why: '', since: sim.time,
        others: was?.others ?? null, // the batteries handed to their crews while the player is at a gun (othersAuto)
      };
      // a fire order already standing: its time is the crew's to keep (the firer pulls when the gun is laid)
      if (p.rounds > 0) { this.st.sched = p.fireAt; p.fireAt = Infinity; }
      if (a.othersAuto && !this.st.others) {
        this.st.others = [];
        for (const v of sim.units) if (v !== u && v.alive && v.mode === 'manual') { v.mode = 'auto'; this.st.others.push(v.id); }
      }
      this.track(u, p, true);
      // the command in hand when the player arrives counts as read back (the gun commander had it)
      if (this.st.order?.ok) this.acknowledge();
      const post = POSTS.find((q) => q.id === this.st.post), handed = !was && this.st.others?.length;
      sim.radio(`You take your place at No. ${p.i + 1} gun of ${u.callsign} as the ${post.name} (${post.en}). Crew help ${this.st.assist ? 'on' : 'off'}.`
        + (handed ? ` ${handed} batter${handed > 1 ? 'ies go' : 'y goes'} to auto until you leave the gun.` : ''), 'info');
      this.emit('man', u, p);
      return true;
    }
    const st = this.st;
    if (!st) return name === 'unman' ? true : this.refuse('You are not at a gun: man one first (P, or MAN on the guns card).');
    if (name === 'post') {
      if (!POST_IDS.has(a.post)) return false;
      if (st.post !== a.post) { st.post = a.post; st.hold = null; st.latch.az = st.latch.el = 0; this.emit('post', a.post); }
      return true;
    }
    if (name === 'assist') {
      st.assist = a.on == null ? !st.assist : !!a.on;
      st.crewT = 0;
      return true;
    }
    if (name === 'unman') {
      this.release(true);
      return true;
    }
    if (name === 'drive') {
      const p = this.piece(), ax = a.axis === 'az' ? 'az' : 'el', dir = Math.sign(a.dir || 0);
      if (!p || !DRIVEN.has(p.kind) || st.post !== 'lay' || !dir || p.fixed || u.stowed) return false;
      st.drive[ax] = st.drive[ax] && st.drive[ax] !== dir ? 0 : dir; // the other way stops a running drive
      st.latch[ax] = 0;
      return true;
    }
    return false;
  }

  // leave the gun: its crew takes it over where it stands (the piece's fields are the normal cycle's); `restore` hands
  // the batteries put on auto at the start back to manual (those still on auto)
  release(restore = true) {
    const st = this.st, sim = this.sim;
    if (!st) return;
    const u = sim.unitById(st.unitId), p = u?.pieces[st.pi];
    if (p) {
      p.manned = false;
      if (p.rounds > 0 && !(p.fireAt < Infinity)) p.fireAt = Math.max(st.sched ?? sim.time, sim.time);
    }
    if (restore && st.others) for (const id of st.others) { const v = sim.unitById(id); if (v?.alive && v.mode === 'auto') v.mode = 'manual'; }
    this.st = null;
    this.emit('unman', u, p);
  }

  // ------------------------------------------------------------------ the command for this gun
  // The unit's order laid for this piece: a new one (a new target, a correction, another charge or fuze) rings at the
  // gun commander's and must be read back before the layer has its marks
  track(u, p, quiet = false) {
    const st = this.st, o = u.order;
    if (!o.target || u.gate) { st.order = null; return; }
    const cur = st.order;
    if (!cur || Math.abs(cur.az - p.cmd.az) > SAME || Math.abs(cur.el - p.cmd.el) > SAME || cur.charge !== o.charge || cur.fuze !== o.fuze || cur.tx !== o.target.x || cur.tz !== o.target.z) {
      st.n++;
      st.order = { az: p.cmd.az, el: p.cmd.el, charge: o.charge, fuze: o.fuze, tx: o.target.x, tz: o.target.z, ok: p.cmd.ok, why: p.cmd.why ?? '', n: st.n, acked: false, at: this.sim.time };
      st.crewT = 0;
      if (p.cmd.ok && !quiet) this.emit('order', st.order);
    } else {
      cur.ok = p.cmd.ok;
      cur.why = p.cmd.why ?? '';
    }
  }

  acknowledge() {
    const st = this.st;
    st.order.acked = true;
    st.ack = { ...st.order };
    st.latch.az = st.latch.el = 0;
  }

  laidTo(p, c) {
    return !!c && Math.abs(p.az - c.az) <= TOL && Math.abs(p.el - c.el) <= TOL;
  }

  // ------------------------------------------------------------------ the drill, every step (sim/guns.js hands it over)
  updatePiece(u, p, dt) {
    const sim = this.sim, st = this.st, g = GUNS[p.kind];
    if (!st || st.unitId !== u.id || st.pi !== p.i) { p.manned = false; return; }
    const inp = this.input, me = st.post;
    const heavy = g.load[0]?.step === 'depress';
    const help = st.assist && p.crew >= Math.ceil(p.crewMax * 0.3);
    const crewK = clamp(p.crewMax / Math.max(1, p.crew), 1, 2.6);
    const at = (post) => me === post; // the player works this post
    const crew = (post) => help && me !== post; // the crew works it
    const work = inp.work;
    let prog = 0; // anything that moved this step (the battery's patience, below)
    // a new fire order from the battery (guns.js fire): its time is kept here, the shot is the firer's pull
    if (p.volley !== st.volley) {
      st.volley = p.volley;
      if (p.rounds > 0) { st.sched = p.fireAt; p.fireAt = Infinity; }
    }
    this.track(u, p);
    const o = st.order;
    // the gun commander reads the command back
    if (o && o.ok && !o.acked) {
      if (at('cmd') && work) {
        this.hold('ack', ACK, dt);
        if (st.hold.t >= ACK) { this.acknowledge(); st.hold = null; this.emit('ack', o); }
        prog++;
      } else if (crew('cmd')) {
        st.crewT += dt;
        if (st.crewT >= CREW_ACK) { st.crewT = 0; this.acknowledge(); prog++; }
      } else if (st.hold?.what === 'ack') st.hold = null;
    } else if (st.hold?.what === 'ack') st.hold = null;
    const ack = st.ack;

    // recoil: the kick and the run out (the cycle starts again after it)
    if (p.state === 'recoil') {
      const t = sim.time - p.firedAt;
      const k = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / g.runout);
      p.recoil = t < 0.18 ? Math.sin(k * Math.PI / 2) : k * k * (3 - 2 * k);
      if (t > 0.18 + g.runout) { p.recoil = 0; p.state = 'idle'; }
      this.after(u, p, prog + 1, dt);
      return;
    }

    // `stowed` (a controller: the Karl with its hull not down) as sim/guns.js: the gun is not laid; a round laid or
    // being laid goes back to wait at its lay step, a cycle not yet at the ram is given up (the shell back on the
    // carrier) unless `loadThrough`, and the barrel comes down to its loading angle on the middle of its traverse
    const held = !!u.stowed;
    if (held) {
      st.drive.az = st.drive.el = 0;
      if (p.state === 'ready' || p.state === 'laying') {
        const li = g.load.findIndex((s) => s.step === 'lay');
        if (li >= 0) { p.state = 'loading'; p.ji = li; this.begin(p); }
      }
      if (p.state === 'loading' && !u.loadThrough && !p.loaded) { p.state = 'idle'; p.job = null; }
    }

    // the layer: the marks his wheels stop on, then the player's cranking (or his drive) or the crew's
    const step = p.state === 'loading' ? g.load[p.ji]?.step : null;
    const elLock = p.state === 'loading' && (OPEN_STEPS.has(step) || (heavy && step === 'prime'));
    const toLoad = heavy && p.state === 'loading' && (step === 'depress' || elLock);
    const elMark = toLoad ? g.loadEl : ack ? ack.el : null;
    const azMark = ack ? ack.az : null;
    const lo = Math.min(g.loadEl, g.elMin), hi = g.elMax;
    const az0 = p.az, el0 = p.el;
    const toward = (cur, goal, rate) => (Math.abs(goal - cur) <= rate * dt ? goal : cur + Math.sign(goal - cur) * rate * dt);
    const driven = DRIVEN.has(p.kind), drv = st.drive;
    if (p.fixed) drv.az = drv.el = 0; // (the Gustav in pieces: nothing to lay)
    else if (held) {
      p.az = toward(p.az, u.stowLaid ? p.cmd.az : 0, g.azRate);
      p.el = toward(p.el, g.loadEl, g.elRate);
    } else {
      if (at('lay')) {
        // a driven gun's keys start its drive (the page's tap); Shift held is its hand wheel, which stops the drive
        const k = inp.fine ? FINE : 1, hand = !driven || inp.fine;
        for (const ax of ['az', 'el']) if (st.latch[ax] && st.latch[ax] !== Math.sign(inp[ax] || 0)) st.latch[ax] = 0;
        if (hand && inp.az) { drv.az = 0; p.az = this.wheel('az', p.az, Math.sign(inp.az), g.azRate * k * dt, -u.arc, u.arc, azMark); }
        else if (!drv.az && azMark != null && Math.abs(p.az - azMark) <= TOL) p.az = azMark; // let go within a Strich: the last turn
        if (!elLock) {
          if (hand && inp.el) { drv.el = 0; p.el = this.wheel('el', p.el, Math.sign(inp.el), g.elRate * k * dt, lo, hi, elMark); }
          else if (!drv.el && elMark != null && Math.abs(p.el - elMark) <= TOL) p.el = elMark;
        }
      } else if (crew('lay') && (ack || toLoad)) {
        if (azMark != null && !drv.az) p.az = toward(p.az, azMark, g.azRate / crewK);
        if (!elLock && elMark != null && !drv.el) p.el = toward(p.el, elMark, g.elRate / crewK);
      }
      // the drives run on at the gun's own rate (whichever post the player has gone to) until they are on the mark,
      // against a stop, or the breech is opened under the elevation
      if (driven) for (const ax of ['az', 'el']) {
        const dir = drv[ax];
        if (!dir) continue;
        if (ax === 'el' && elLock) { drv.el = 0; continue; }
        const cur = p[ax], az = ax === 'az';
        p[ax] = this.wheel(ax, cur, dir, (az ? g.azRate : g.elRate) * dt, az ? -u.arc : lo, az ? u.arc : hi, az ? azMark : elMark);
        if (st.latch[ax] === dir || p[ax] === cur) drv[ax] = 0;
      }
    }
    if (p.az !== az0 || p.el !== el0) prog++;

    if (p.state === 'idle') {
      if (p.breech > 0) p.breech = Math.max(0, p.breech - dt / 6);
      if (!p.loaded && this.canLoad(u, p) === '') {
        p.state = 'loading';
        p.ji = 0;
        this.begin(p);
        prog++;
      }
    } else if (p.state === 'loading') {
      const s = g.load[p.ji], job = p.job, owner = STEP_POST[s.step] ?? 'load';
      const t0 = job.t;
      if (s.step === 'depress') {
        // the barrel is run down by the layer's wheel (above); the step is done on the loading angle
        const span0 = Math.max(1e-3, Math.abs((job.el0 ?? p.el) - g.loadEl));
        job.t = job.dur * clamp(1 - Math.abs(p.el - g.loadEl) / span0, 0, 1);
        if (Math.abs(p.el - g.loadEl) <= 0.002) job.t = job.dur;
      } else if (s.step === 'lay') {
        // the lay is checked once the gun is on the command (whoever laid it), never while it is stowed; as the
        // other steps, the check takes at most HOLD s (the Gustav's 40 s were the crew's slew and check together)
        if (!held && this.laidTo(p, ack) && o?.acked) job.t += dt * Math.max(1, job.dur / HOLD);
      } else if ((at(owner) && work) || crew(owner)) job.t += dt * (at(owner) ? Math.max(1, job.dur / HOLD) : 1 / crewK);
      if (job.t > t0) {
        prog++;
        if (!job.on) { job.on = true; sim.events.load?.(u, p, s.step); }
      }
      if (s.step === 'open') p.breech = Math.min(1, job.t / job.dur);
      else if (s.step === 'close') p.breech = 1 - Math.min(1, job.t / job.dur);
      if (job.t >= job.dur) {
        if (s.step === 'ram') {
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
        } else this.begin(p);
      }
    } else if (p.state === 'laying') {
      // a new command came after the gun was ready: lay again
      if (this.laidTo(p, ack) && o?.acked) p.job.t += dt;
      if (p.job.t >= p.job.dur) { p.state = 'ready'; p.job = null; }
    }

    if (p.state === 'ready') {
      if (ack && !this.laidTo(p, ack)) {
        p.state = 'laying';
        p.job = { step: 'lay', t: 0, dur: 1.2, i: 0, n: 1 };
        sim.events.load?.(u, p, 'lay');
      } else {
        const why = this.cannotFire(u, p);
        if (at('fire') && work) {
          if (why) {
            if (st.hold?.what !== 'nofire') { st.hold = { what: 'nofire', t: 0, dur: 0 }; this.emit('nofire', why); }
          } else {
            // a manual battery: the pull is the order to fire for this gun alone (the order's rounds per gun)
            if (!(p.rounds > 0) && u.mode === 'manual') {
              sim.guns.fire(u, [p.i]);
              st.volley = p.volley;
              st.sched = sim.time;
            }
            if (p.rounds > 0) {
              this.hold('pull', PULL, dt);
              p.fireAt = sim.time + Math.max(0, PULL - st.hold.t);
              prog++;
              if (st.hold.t >= PULL) { st.hold = null; this.shoot(u, p); return this.after(u, p, prog, dt); }
            }
          }
        } else if (crew('fire') && !why && p.rounds > 0 && sim.time >= (st.sched ?? sim.time)) {
          st.pullT += dt;
          p.fireAt = sim.time + Math.max(0, CREW_PULL - st.pullT);
          prog++;
          if (st.pullT >= CREW_PULL) { this.shoot(u, p); return this.after(u, p, prog, dt); }
        } else {
          if (st.hold?.what === 'pull' || st.hold?.what === 'nofire') st.hold = null;
          st.pullT = 0;
          p.fireAt = Infinity;
        }
      }
    }
    if (!(at('fire') && work) && st.hold?.what === 'nofire') st.hold = null;
    this.after(u, p, prog, dt);
  }

  // after the guns' step (SpecialWW2.update): a gun knocked out is left (dead pieces are not stepped)
  check() {
    const st = this.st;
    if (!st) return;
    const u = this.unit(), p = this.piece();
    if (u?.alive && p && p.state !== 'dead') return;
    this.sim.radio(`No. ${st.pi + 1} gun of ${u?.callsign ?? 'the battery'} is knocked out. You are back at the console.`, 'alert');
    this.release(true);
  }

  // the battery's patience and the page's hints, after the step
  after(u, p, prog, dt) {
    const st = this.st;
    if (!st) return;
    // an auto battery does not wait for ever on a gun that does not move on its fire order: the rounds lapse (not
    // while a controller holds the gun: the Karl's carrier away, its last shell gone; that wait is nobody's fault)
    if (p.rounds > 0 && u.mode === 'auto' && prog === 0 && !u.gate) {
      st.stall += dt;
      if (st.stall >= LAPSE) {
        st.stall = 0;
        p.rounds = 0;
        p.fireAt = Infinity;
        this.sim.radio(`${u.callsign}: No. ${p.i + 1} gun has not fired. The battery goes on without it.`, 'warn');
        this.emit('lapse', u, p);
      }
    } else st.stall = 0;
    st.prog = prog;
    st.next = this.next(u, p);
    st.why = this.why(u, p);
  }

  hold(what, dur, dt) {
    const st = this.st;
    if (st.hold?.what !== what) st.hold = { what, t: 0, dur };
    st.hold.t += dt;
  }

  begin(p) {
    const g = GUNS[p.kind], s = g.load[p.ji];
    p.job = { step: s.step, t: 0, dur: s.dur, i: p.ji, n: g.load.length, el0: p.el, on: false };
  }

  shoot(u, p) {
    const st = this.st;
    st.pullT = 0;
    st.stall = 0;
    this.sim.guns.fireShell(u, p);
    p.fireAt = Infinity;
    this.emit('pull', u, p);
  }

  // why the gun cannot start loading ('' when it can)
  canLoad(u, p) {
    const st = this.st, o = st.order;
    if (u.mode === 'hold') return 'the battery is holding (cease fire)';
    if (u.gate) return u.gate;
    if (!o) return 'no fire command yet';
    if (!o.ok) return `the gun cannot be laid on the command: ${o.why || 'out of reach'}`;
    if (!st.ack) return 'the command is not read back yet';
    const sh = u.order.fuze === 'shrapnel';
    if ((sh ? u.ammo.shrapnel : u.ammo.he) <= 0) return 'no shells left at the guns';
    return '';
  }

  // why the gun, loaded and laid, cannot be fired now ('' when it can)
  cannotFire(u, p) {
    const o = this.st.order;
    if (p.state !== 'ready' || !p.loaded) return 'not loaded';
    if (u.mode === 'hold') return 'the battery is holding (cease fire): no firing';
    if (u.gate) return u.gate;
    if (o && !o.acked) return 'a new fire command has come: the gun commander reads it back first (1)';
    if (!(p.rounds > 0) && u.mode !== 'manual') return 'no order to fire: the battery commander has not given Feuer';
    if (!(p.rounds > 0) && !u.order.ok) return 'no order to fire, and the battery\'s order cannot be carried out';
    return '';
  }

  // One step of a wheel from cur in direction dir (+-1) by up to `step`, easing over the last 8 Strich onto the mark
  // ahead and stopping there; the key must be let go and pressed again to go past it (st.latch). Within [lo, hi].
  wheel(axis, cur, dir, step, lo, hi, mark) {
    const st = this.st, lim = (v) => clamp(v, lo, hi);
    if (st.latch[axis] === dir) return cur;
    let next = cur + dir * step;
    if (mark != null) {
      const d = mark - cur;
      if (Math.abs(d) > 1e-9 && Math.sign(d) === dir) {
        const near = Math.abs(d) / (8 * STRICH);
        if (near < 1) next = cur + dir * step * Math.max(0.15, near);
        if (Math.abs(next - cur) >= Math.abs(d)) {
          st.latch[axis] = dir;
          this.emit('mark', axis);
          return lim(mark);
        }
      }
    }
    return lim(next);
  }

  // ------------------------------------------------------------------ the page's words
  // The next job of the drill: { post, key, text, wait } (wait: dead time, nothing for anybody to do)
  next(u, p) {
    const st = this.st, o = st.order, g = GUNS[p.kind];
    const J = (post, key, text, wait = false) => ({ post, key, text, wait });
    if (u.mode === 'hold') return J('cmd', null, 'the battery is holding: cease fire', true);
    if (p.state === 'recoil') return J(st.post, null, 'the shot: the barrel runs out', true);
    if (!o) {
      const sh = this.sim.shells.find((s) => s.own && s.alive && s.unitId === u.id && s.piece === p.i);
      if (sh) return J('cmd', null, `round in the air, ${Math.max(0, Math.round((sh.tof || 0) - sh.t))} s to the burst`, true);
      // a controller holding the gun (the Karl's hull, its carrier) says what it waits for
      if (u.gate) return J('cmd', null, u.gate, true);
      return J('cmd', null, 'waiting for a fire command', true);
    }
    if (!o.ok) {
      if (o.why === 'out of arc' && p.kind === 'karl') return J('cmd', null, 'the target is outside the gun\'s 4 degrees: raise the hull (L), turn the vehicle (T), lower it (L)', true);
      return J('cmd', null, `the command cannot be laid: ${o.why || 'out of reach'}`, true);
    }
    if (!o.acked) return J('cmd', 'E', 'read back the fire command');
    // a driven gun: its drive running the right way is dead time; the wrong way, the same key the other way stops it
    const driven = DRIVEN.has(p.kind);
    const runs = (ax, d) => driven && st.drive[ax] === Math.sign(d);
    const going = (d, rate) => J('lay', null, `the drive runs: ${Math.abs(toStrich(d))} Strich to go, ${Math.ceil(Math.abs(d) / rate)} s (] speeds time)`, true);
    // the layer's next turn of the wheels (or start of a drive), null when nothing is left for his hands
    const layJob = (pre, elOk = true) => {
      const c = st.ack, dA = c.az - p.az, dE = c.el - p.el, verb = `${pre}${driven ? 'start the drive: ' : ''}`;
      if (Math.abs(dA) > TOL && !runs('az', dA)) return J('lay', dA > 0 ? 'A' : 'D', `${verb}traverse ${Math.abs(toStrich(dA))} Strich ${dA > 0 ? 'left' : 'right'} onto the line`);
      if (elOk && Math.abs(dE) > TOL && !runs('el', dE)) return J('lay', dE > 0 ? 'W' : 'S', `${verb}elevate ${Math.abs(toStrich(dE))} Strich ${dE > 0 ? 'up' : 'down'}`);
      return null;
    };
    const lay = () => layJob('') ?? (Math.abs(st.ack.az - p.az) > TOL ? going(st.ack.az - p.az, g.azRate) : going(st.ack.el - p.el, g.elRate));
    if (p.state === 'loading') {
      const s = g.load[p.ji].step;
      if (s === 'depress') {
        const d = g.loadEl - p.el;
        if (runs('el', d)) return going(d, g.elRate);
        return J('lay', 'S', `${driven ? 'start the drive: ' : ''}run the barrel down to the loading angle (${Math.round(g.loadEl / STRICH)} Strich)`);
      }
      if (s === 'lay') return this.laidTo(p, st.ack) ? J('lay', null, 'the lay is checked', true) : lay();
      // the layer at his post meanwhile: the line (and on a gun loaded at its lay, not the heavies at their loading
      // angle, the elevation while the breech is shut); the Gustav's shunting is minutes, best begun now
      if (st.post === 'lay' && STEP_POST[s] !== 'lay') {
        const j = layJob(st.assist ? 'while they load, ' : '', g.load[0]?.step !== 'depress' && !OPEN_STEPS.has(s));
        if (j) return j;
      }
      return J(STEP_POST[s] ?? 'load', 'E', STEP_EN[s] ?? s);
    }
    if (p.state === 'laying') return this.laidTo(p, st.ack) ? J('lay', null, 'the lay is checked', true) : lay();
    if (p.state === 'ready') {
      const why = this.cannotFire(u, p);
      const n = p.rounds > 0 ? p.rounds : u.order.rounds;
      if (!why) return J('fire', 'E', `pull the lanyard: Feuer! (${n} round${n > 1 ? 's' : ''}${p.rounds > 0 ? '' : ', you command the battery'})`);
      return J('fire', null, `loaded and laid: ${why}`, true);
    }
    const no = this.canLoad(u, p);
    if (!p.loaded && no) return J('cmd', null, no, true);
    return J('cmd', null, 'loaded: waiting', true);
  }

  // what the player's own post can do now, or why not
  why(u, p) {
    const st = this.st, n = st.next, me = st.post;
    if (!n) return '';
    if (n.post === me || n.wait) return '';
    const post = POSTS.find((q) => q.id === n.post);
    return `Nothing for the ${POSTS.find((q) => q.id === me).en} to do: the next job is the ${post.en}'s (${post.key}${st.assist ? ', or wait for the crew' : ''}).`;
  }
}

// The WW2 mode's special weapons: each unit with `def.special` has a controller that owns what makes it more than a
// battery. Node-safe, deterministic per seed (sim.rng). The state lives on `unit.special` (plain data for the console
// and the render layer); commands come through sim.command(unitId, name, args) (sim.js hands the names it does not
// know to `command` here). While a controller holds a gun back, `unit.gate` names why (guns.js will not load or fire).
//
//   gustav  railway preparation: work gangs on six tasks (survey, track, flak, cranes, assembly, ammunition train),
//           air raids on the site, then the gun fires through the normal loading cycle with its handful of shells
//   karl    drive to one of the prepared positions, pivot the whole vehicle onto the target, lower the hull, load
//           from the Munitionsschlepper (four shells a trip, the rest at the dump), displace when found
//   v1      the launch drill of a flying bomb at its Walter ramp, faults and raids, the catapult, the flight
//   v2      the A4 drill at the firing table: erect, align, cut-off, checks, fuel (the LOX boils off), withdraw,
//           pre-stage and main stage, the flight
// The strategic flights leave the map; what became of them is rolled at launch from the drill's errors and game odds
// (docs/WW2.md "Balancing assumptions") and reported when the flight time has passed.
import { DEG, bearingOf } from '../sector.js';
import { G } from '../sim/tables.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapDeg = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

// ------------------------------------------------------------------------------------------------ Gustav
export const GUSTAV_TASKS = [
  { id: 'survey', name: 'Survey the firing curve', de: 'Vermessung der Feuerstellung', work: 60, needs: [], max: 2 },
  { id: 'track', name: 'Lay the curved double track', de: 'Gleisbau: die Schießkurve', work: 260, needs: ['survey'], max: 3 },
  { id: 'flak', name: 'Flak and smoke cover', de: 'Flak und Vernebelung', work: 90, needs: [], max: 2, optional: true },
  { id: 'cranes', name: 'Erect the two gantry cranes', de: 'Portalkräne aufstellen', work: 100, needs: ['track'], max: 2 },
  { id: 'assembly', name: 'Assemble the gun (5 trains of parts)', de: 'Montage des Geschützes', work: 300, needs: ['cranes'], max: 3 },
  { id: 'ammo', name: 'Ammunition train and shell hoist', de: 'Munitionszug und Aufzug', work: 120, needs: ['track'], max: 2 },
  { id: 'camo', name: 'Camouflage nets over the gun', de: 'Tarnung', work: 60, needs: ['assembly'], max: 2, optional: true },
];

class GustavCtl {
  constructor(sim, u) {
    this.sim = sim;
    this.u = u;
  }

  reset() {
    const u = this.u, sim = this.sim;
    u.mode = u.def.mode ?? (sim.theatre.op.kind === 'battle' ? 'auto' : 'manual');
    const st = u.special = {
      kind: 'gustav', gangs: 3, ready: false, flak: 0, cover: 1,
      tasks: GUSTAV_TASKS.map((d) => ({ ...d, done: 0, gangs: 0, state: 'todo' })),
      stage: { survey: 0, track: 0, cranes: 0, ammo: 0, flak: 0, camo: 0 }, assembly: 0, cranesOut: 0,
      nextRaid: 150 + sim.rng() * 80, log: [],
    };
    if (sim.attract || sim.scripted && sim.theatre.prepared) this.finishAll();
    u.gate = st.ready ? null : 'railway preparation';
  }

  finishAll() {
    const st = this.u.special;
    for (const t of st.tasks) { t.done = t.work; t.state = 'done'; t.gangs = 0; }
    st.ready = true;
    st.assembly = 1;
    st.cranesOut = 1;
    Object.assign(st.stage, { survey: 1, track: 1, cranes: 0, ammo: 1, flak: 1, camo: 1 });
    st.flak = 1;
  }

  task(id) {
    return this.u.special.tasks.find((t) => t.id === id);
  }

  can(t) {
    return t.state !== 'done' && t.needs.every((n) => this.task(n).state === 'done');
  }

  free() {
    const st = this.u.special;
    return st.gangs - st.tasks.reduce((s, t) => s + t.gangs, 0);
  }

  command(name, a) {
    const st = this.u.special;
    if (name === 'gang') {
      const t = this.task(a.task);
      if (!t) return false;
      if (this.u.mode === 'auto') this.u.mode = 'manual';
      st.allHands = false;
      if (a.d > 0) {
        if (!this.can(t) || t.gangs >= t.max) return false;
        if (this.free() <= 0) {
          // take a gang off the task with the most
          const from = st.tasks.filter((q) => q !== t && q.gangs > 0).sort((p, q) => q.gangs - p.gangs)[0];
          if (!from) return false;
          from.gangs--;
        }
        t.gangs++;
      } else if (t.gangs > 0) t.gangs--;
      return true;
    }
    if (name === 'hurry') {
      // the commander's choice: all hands on the critical path, kept there as tasks finish (until a gang is moved by hand)
      st.allHands = true;
      this.autoAssign(true);
      return true;
    }
    return false;
  }

  autoAssign(force = false) {
    const st = this.u.special;
    if (!force && this.free() <= 0 && st.tasks.every((t) => t.gangs === 0 || this.can(t))) return;
    for (const t of st.tasks) if (!this.can(t)) t.gangs = 0;
    // the critical path first (survey, track, cranes, assembly), flak while the track is laid, the train after
    const order = ['survey', 'track', 'cranes', 'assembly', 'ammo', 'flak', 'camo'];
    if (force) for (const t of st.tasks) t.gangs = 0;
    for (const id of order) {
      const t = this.task(id);
      while (this.free() > 0 && this.can(t) && t.gangs < t.max) t.gangs++;
    }
  }

  update(dt) {
    const sim = this.sim, u = this.u, st = u.special;
    if (!u.alive) return;
    if ((u.mode === 'auto' || st.allHands) && !st.ready) this.autoAssign();
    // a task with no work left frees its gangs; a gang on a task that cannot start yet waits
    const crew = clamp(u.pieces[0].crew / u.pieces[0].crewMax, 0.4, 1);
    for (const t of st.tasks) {
      if (t.state === 'done') continue;
      if (!this.can(t)) { t.gangs = 0; continue; }
      t.state = t.gangs > 0 ? 'doing' : t.done > 0 ? 'paused' : 'todo';
      t.done = Math.min(t.work, t.done + t.gangs * dt * crew * (sim.scripted ? 3 : 1));
      if (t.done >= t.work) {
        t.state = 'done';
        t.gangs = 0;
        sim.radio(`Gustav: ${t.name.toLowerCase()}, done.`, 'info');
        if (t.id === 'flak') st.flak = 1;
      }
    }
    for (const k of ['survey', 'track', 'ammo', 'flak', 'camo']) st.stage[k] = this.task(k).done / this.task(k).work;
    const asm = this.task('assembly');
    st.assembly = asm.done / asm.work;
    st.stage.cranes = this.task('cranes').done / this.task('cranes').work;
    // the cranes are taken down once the gun stands
    if (asm.state === 'done') st.cranesOut = Math.min(1, st.cranesOut + dt / 40);
    st.stage.cranes *= 1 - st.cranesOut;
    const ready = ['survey', 'track', 'cranes', 'assembly', 'ammo'].every((id) => this.task(id).state === 'done');
    if (ready && !st.ready) {
      st.ready = true;
      u.gate = null;
      sim.guns.recompute(u);
      sim.radio('Gustav: the gun stands on its curve. Feuerbereit, ready to fire.', 'kill');
      sim.events.special?.(u, 'ready');
    }
    st.cover = 1 + 0.6 * st.stage.camo;
    // the enemy's air force looks for the site while it is being built
    if (!sim.attract && !sim.scripted && sim.time > st.nextRaid) {
      st.nextRaid = sim.time + 420 + sim.rng() * 240;
      if (!st.ready || sim.rng() < 0.5) sim.enemyAI.raid?.({ x: u.pos.x, z: u.pos.z, flak: st.flak }, { n: 2 + (sim.rng() < 0.3 ? 1 : 0), weapon: 'bomb', warn: 50 });
    }
  }

  onEnemyBurst(s, pos) {
    const st = this.u.special, u = this.u;
    const d = Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z);
    if (d > 90 || st.ready) return;
    // a bomb in the works: a stretch of track to relay, damaged parts
    for (const id of ['track', 'assembly', 'cranes']) {
      const t = this.task(id);
      if (t.done > 0 && t.state !== 'done') t.done = Math.max(0, t.done - 25 * (1 - d / 90));
    }
  }

  signatureK() {
    return 1 / this.u.special.cover;
  }
}

// ------------------------------------------------------------------------------------------------ Karl
class KarlCtl {
  constructor(sim, u) {
    this.sim = sim;
    this.u = u;
  }

  reset() {
    const u = this.u, sim = this.sim, op = sim.theatre.op;
    u.mode = u.def.mode ?? 'manual';
    const carry = Math.min(4, u.ammo.he);
    const st = u.special = {
      kind: 'karl', stage: 'travel', lower: 0, drive: 0, posId: null, positions: op.positions ?? [], heading: u.zero,
      route: null, pivotTo: null, ready: false, reserve: u.ammo.he - carry, cover: 1,
      schlepper: { state: 'alongside', t: 0, k: 0 }, log: [],
    };
    u.ammo.he = carry;
    u.ammoMax.he = carry;
    u.pieces[0].el = 0;
    if (sim.attract || (sim.scripted && sim.theatre.prepared)) {
      st.stage = 'down';
      st.lower = 1;
      st.ready = true;
      st.posId = st.positions[0]?.id ?? null;
    }
    this.gate();
  }

  setPos(x, z) {
    const sim = this.sim, u = this.u;
    u.pos.x = x; u.pos.z = z; u.pos.y = sim.heightAt(x, z);
    const p = u.pieces[0];
    p.pos.x = x; p.pos.z = z; p.pos.y = u.pos.y;
  }

  setHeading(b) {
    const u = this.u, st = u.special, p = u.pieces[0];
    st.heading = b;
    u.zero = b;
    // the gun's own traverse is on the hull: keep its world line while the hull turns under it
    p.az = clamp(p.az, -4 * DEG, 4 * DEG);
    p.bearing = b;
  }

  command(name, a) {
    const sim = this.sim, u = this.u, st = u.special;
    if (u.mode === 'auto' && name !== 'fetch') u.mode = 'manual';
    switch (name) {
      case 'goto': {
        const q = st.positions.find((x) => x.id === a.id);
        if (!q || st.stage === 'driving' || st.stage === 'lowering' || st.stage === 'raising') return false;
        if (st.lower > 0) { sim.radio('Karl: raise the hull before it can move (R).', 'warn'); return false; }
        st.route = { x: q.pos.x, z: q.pos.z, id: q.id };
        st.stage = 'driving';
        st.posId = null;
        sim.events.special?.(u, 'drive');
        break;
      }
      case 'pivot': {
        if (st.lower > 0 || st.stage === 'driving') { sim.radio('Karl: the hull is down; raise it to turn the vehicle.', 'warn'); return false; }
        const o = u.order;
        const want = a.bearing ?? (o.target ? bearingOf(o.x - u.pos.x, o.z - u.pos.z) : null);
        if (want == null) return false;
        st.pivotTo = want;
        st.stage = 'pivot';
        break;
      }
      case 'lower':
        if (st.stage === 'driving' || st.stage === 'pivot' || st.lower >= 1) return false;
        st.stage = 'lowering';
        sim.radio('Karl: lowering the hull onto the ground.', 'info');
        break;
      case 'raise':
        if (st.lower <= 0) return false;
        st.stage = 'raising';
        sim.guns.cease(u);
        break;
      case 'fetch':
        if (st.schlepper.state !== 'alongside' || st.reserve <= 0) return false;
        st.schlepper.state = 'away';
        st.schlepper.t = 0;
        st.reserve += u.ammo.he;
        u.ammo.he = 0;
        sim.radio('Munitionsschlepper: away to the dump for more shells.', 'info');
        break;
      default: return false;
    }
    this.gate();
    return true;
  }

  gate() {
    const u = this.u, st = u.special, p = u.pieces[0], sim = this.sim;
    let g = null;
    if (st.stage === 'travel') g = 'drive to a firing position';
    else if (st.stage === 'driving') g = 'driving';
    else if (st.stage === 'pivot') g = 'turning the vehicle';
    else if (st.stage === 'lowering') g = 'lowering the hull';
    else if (st.stage === 'raising') g = 'raising the hull';
    else if (st.lower < 1) g = 'lower the hull before firing';
    else if (u.ammo.he <= 0 && !p.loaded) g = st.schlepper.state === 'alongside' ? (st.reserve > 0 ? 'no shells at the gun: send the carrier (M)' : 'no shells left') : 'no shells: the carrier is away';
    st.ready = !g;
    if (g !== u.gate) {
      u.gate = g;
      sim.guns.recompute(u);
    }
  }

  update(dt) {
    const sim = this.sim, u = this.u, st = u.special, p = u.pieces[0];
    if (!u.alive) return;
    if (u.mode === 'auto') this.auto();
    // on the move the barrel lies flat (the guns' slew pulls it toward its order; this pulls harder)
    if (st.stage !== 'down' && st.stage !== 'emplace' && p.state !== 'loading') p.el = Math.max(0, p.el - 2.5 * DEG * dt);
    if (st.stage === 'driving' && st.route) {
      const dx = st.route.x - u.pos.x, dz = st.route.z - u.pos.z, d = Math.hypot(dx, dz);
      const want = bearingOf(dx, dz), turn = angDiff(want / DEG, st.heading / DEG) * DEG;
      if (Math.abs(turn) > 0.02) this.setHeading(st.heading + clamp(turn, -0.03 * dt * 10, 0.03 * dt * 10));
      const v = Math.abs(turn) > 0.4 ? 0.8 : 2.8; // about 10 km/h on the flat, crawling on the turn
      const step = Math.min(d, v * dt);
      if (d > 0.5) this.setPos(u.pos.x + dx / d * step, u.pos.z + dz / d * step);
      st.drive += step;
      if (d <= 0.5) {
        st.posId = st.route.id;
        st.route = null;
        st.stage = 'emplace';
        const q = st.positions.find((x) => x.id === st.posId);
        st.cover = q?.cover ? 1 + q.cover : 1;
        sim.radio(`Karl: in ${q?.name ?? 'position'}. Turn onto the target (T), then lower the hull (L).`, 'info');
        sim.guns.recompute(u);
      }
    } else if (st.stage === 'pivot') {
      const turn = angDiff(st.pivotTo / DEG, st.heading / DEG) * DEG, r = 1.6 * DEG * dt;
      this.setHeading(st.heading + clamp(turn, -r, r));
      st.drive += Math.abs(clamp(turn, -r, r)) * 3;
      if (Math.abs(turn) <= r) {
        st.stage = 'emplace';
        p.az = 0;
        sim.guns.recompute(u);
      }
    } else if (st.stage === 'lowering') {
      st.lower = Math.min(1, st.lower + dt / 18);
      if (st.lower >= 1) { st.stage = 'down'; sim.radio('Karl: hull down, feuerbereit.', 'info'); }
    } else if (st.stage === 'raising') {
      st.lower = Math.max(0, st.lower - dt / 18);
      if (st.lower <= 0) st.stage = st.posId ? 'emplace' : 'travel';
    }
    // the carrier's trips: 150 s to the dump and back
    const sc = st.schlepper;
    if (sc.state === 'away') {
      sc.t += dt;
      sc.k = clamp(sc.t / 20, 0, 1);
      if (sc.t > 150) {
        const n = Math.min(4, st.reserve);
        st.reserve -= n;
        u.ammo.he += n;
        u.ammoMax.he = Math.max(u.ammoMax.he, u.ammo.he);
        sc.state = 'alongside';
        sc.t = 0;
        sim.radio(`Munitionsschlepper: back with ${n} shells.`, 'info');
      } else if (sc.t > 130) sc.k = clamp((150 - sc.t) / 20, 0, 1);
    } else sc.k = 0;
    this.gate();
  }

  // the auto crew: the first position, onto the target the crew took, hull down, fetch shells when out
  auto() {
    const u = this.u, st = u.special, o = u.order;
    const cmd = (n, a = {}) => { this.command(n, a); u.mode = 'auto'; };
    if (st.stage === 'travel' && st.positions.length) cmd('goto', { id: st.positions[0].id });
    else if (st.stage === 'emplace' && o.target) {
      if (o.why === 'out of arc') cmd('pivot');
      else cmd('lower');
    } else if (st.stage === 'down' && o.target && o.why === 'out of arc' && !u.pieces[0].loaded) cmd('raise');
    if (u.ammo.he <= 0 && !u.pieces[0].loaded && st.schlepper.state === 'alongside' && st.reserve > 0) this.command('fetch', {});
  }

  signatureK() {
    return 1 / this.u.special.cover;
  }
}

// ------------------------------------------------------------------------------------------------ V-1
export const V1_STEPS = [
  { id: 'bring', name: 'Bring the missile from the store', de: 'Gerät aus dem Lager', dur: 35 },
  { id: 'wings', name: 'Fit the wings', de: 'Tragflächen anbauen', dur: 30 },
  { id: 'compass', name: 'Align the master compass in the Richthaus', de: 'Kompass im Richthaus einrichten', dur: 40, set: 'compass' },
  { id: 'airlog', name: 'Set the air log for the range', de: 'Luftlog einstellen', dur: 15, set: 'range' },
  { id: 'ramp', name: 'Mount it on the launch sled', de: 'Auf den Kolben setzen', dur: 40 },
  { id: 'fuel', name: 'Fuel and compressed air', de: 'Betanken, Preßluft', dur: 45 },
  { id: 'steam', name: 'Charge the steam generator (T-Stoff, Z-Stoff)', de: 'Dampferzeuger befüllen', dur: 45 },
  { id: 'arm', name: 'Arm the warhead fuzes', de: 'Zünder scharf', dur: 15 },
  { id: 'clear', name: 'Clear the ramp: crew to the bunker', de: 'Rampe räumen', dur: 15 },
  { id: 'fire', name: 'Start the engine and fire the catapult', de: 'Triebwerk an, Abschuß', dur: 4 },
];
export const V2_STEPS = [
  { id: 'erect', name: 'Erect the rocket on the firing table', de: 'Aufrichten (Meillerwagen)', dur: 60 },
  { id: 'align', name: 'Turn the table onto the target', de: 'Richten des Brennstands', dur: 30, set: 'compass' },
  { id: 'cutoff', name: 'Set the Brennschluss for the range', de: 'Brennschluß einstellen', dur: 20, set: 'range' },
  { id: 'checks', name: 'Electrical checks: gyros and rudders', de: 'Elektrische Prüfung', dur: 80 },
  { id: 'alcohol', name: 'Fuel: B-Stoff (alcohol)', de: 'B-Stoff tanken', dur: 60 },
  { id: 'tstoff', name: 'Fuel: T-Stoff and Z-Stoff (turbopump)', de: 'T-Stoff, Z-Stoff', dur: 40 },
  { id: 'lox', name: 'Fuel: A-Stoff (liquid oxygen)', de: 'A-Stoff tanken', dur: 70 },
  { id: 'withdraw', name: 'Withdraw the Meillerwagen, crew to cover', de: 'Meillerwagen zurück', dur: 40 },
  { id: 'prestage', name: 'Vorstufe: ignition, watch the flame', de: 'Vorstufe', dur: 6 },
  { id: 'fire', name: 'Hauptstufe: lift-off', de: 'Hauptstufe', dur: 3 },
];

// game odds (docs/WW2.md "Balancing assumptions")
const V1_ODDS = { rampCrash: 0.08, earlyFail: 0.12, shotDown: 0.45, area: 8000, sigma: 5500, steamFault: 0.12, leak: 0.06 };
const V2_ODDS = { tableBlast: 0.03, flightFail: 0.12, area: 6000, sigma: 3500, checkFault: 0.15, preFail: 0.06 };

class LaunchCtl {
  constructor(sim, u, kind) {
    this.sim = sim;
    this.u = u;
    this.kind = kind;
    this.STEPS = kind === 'v1' ? V1_STEPS : V2_STEPS;
  }

  reset() {
    const u = this.u, sim = this.sim, op = sim.theatre.op;
    u.mode = u.def.mode ?? 'manual';
    u.gate = 'launch drill';
    const T = op.target;
    // the solution the battery's firing data gives: the target's bearing and range, the air log or cut-off for the wind
    const headwind = -Math.cos(sim.wind.bearing - T.bearing) * sim.wind.speed;
    const st = u.special = {
      kind: this.kind, target: { name: T.name, dist: T.dist, bearing: T.bearing },
      solution: { compass: Math.round(wrapDeg(T.bearing / DEG) * 10) / 10, range: Math.round((T.dist / 1000) * (this.kind === 'v1' ? 1 + headwind / 180 : 1) * 10) / 10 },
      wind: { from: Math.round(wrapDeg(sim.wind.bearing / DEG)), speed: Math.round(sim.wind.speed), headwind: Math.round(headwind * 10) / 10 },
      settings: { compass: null, range: null }, i: 0, t: 0, doing: false, fault: null, cover: false, crewHurt: 0,
      steps: this.STEPS.map((s) => ({ ...s, state: 'todo' })), left: u.ammo.he, n: 0, flights: [], missile: false,
      lox: 0, loxOn: false, nextRaid: 260 + sim.rng() * 160, raidAt: null, ready: false, rampHp: 1, exposed: 0, done: false,
      // render hints
      wings: 0, generator: 0, erect: 0, meiller: 0, table: 0, fuelA: 0, fuelL: 0, onRamp: false, where: 'none', launchT: -1,
    };
    if (sim.attract) st.settings = { ...st.solution };
  }

  step() {
    return this.u.special.steps[this.u.special.i];
  }

  command(name, a) {
    const sim = this.sim, u = this.u, st = u.special;
    if (u.mode === 'auto' && name !== 'mode') u.mode = 'manual';
    switch (name) {
      case 'set':
        if (a.compass != null) st.settings.compass = Math.round(wrapDeg(a.compass) * 10) / 10;
        if (a.range != null) st.settings.range = Math.max(0, Math.round(a.range * 10) / 10);
        return true;
      case 'step': return this.begin();
      case 'fix': return this.fix(a.how ?? 'fix');
      case 'cover':
        st.cover = !st.cover;
        sim.radio(st.cover ? 'Volle Deckung: the crew takes cover.' : 'The crew is back at work.', 'info');
        return true;
      case 'repair':
        if (st.rampHp >= 0.99 || st.doing || st.fault) return false;
        st.repair = 90;
        st.doing = true;
        sim.radio(`Repairing the ${this.kind === 'v1' ? 'ramp' : 'firing table'}.`, 'info');
        return true;
      case 'topup':
        if (this.kind !== 'v2' || !st.loxOn || st.doing) return false;
        st.topup = 30;
        st.doing = true;
        return true;
    }
    return false;
  }

  begin() {
    const sim = this.sim, st = this.u.special, s = this.step();
    if (!s || st.doing || st.fault || st.cover || st.done) return false;
    if (st.left <= 0 && st.i === 0) return false;
    if (s.set && st.settings[s.set] == null) {
      sim.radio(`${s.name}: dial in the ${s.set === 'compass' ? 'bearing' : 'range'} first.`, 'warn');
      return false;
    }
    if (s.id === 'fire' && st.rampHp < 0.35) {
      if (!st.rampWarned) sim.radio(`The ${this.kind === 'v1' ? 'ramp' : 'firing table'} is damaged: repair it first.`, 'warn');
      st.rampWarned = true;
      return false;
    }
    st.doing = true;
    st.t = 0;
    s.state = 'doing';
    sim.events.special?.(this.u, 'step', s.id);
    return true;
  }

  fix(how) {
    const sim = this.sim, st = this.u.special, f = st.fault;
    if (!f) return false;
    if (how === 'fix') {
      st.fault = null;
      st.doing = true;
      st.t = -f.cost; // the repair takes this long before the step goes on
      sim.radio(`${f.fixText}.`, 'info');
    } else if (how === 'ignore' && f.ignorable) {
      st.fault = null;
      st.risk = (st.risk ?? 0) + f.risk;
      this.complete();
      sim.radio('Carry on regardless.', 'warn');
    } else if (how === 'scrub') {
      st.fault = null;
      this.scrub(f.scrubText ?? 'scrubbed');
    } else return false;
    return true;
  }

  scrub(why) {
    const sim = this.sim, st = this.u.special;
    sim.radio(`Abbruch: ${why}. The round is lost.`, 'alert');
    st.flights.push({ n: ++st.n, state: 'scrubbed', text: why, t0: sim.time });
    this.nextRound();
  }

  nextRound() {
    const st = this.u.special, sim = this.sim;
    st.left = Math.max(0, st.left - 1);
    this.u.ammo.he = st.left;
    st.i = 0;
    st.doing = false;
    st.risk = 0;
    st.lox = 0;
    st.loxOn = false;
    st.missile = false;
    for (const s of st.steps) s.state = 'todo';
    Object.assign(st, { wings: 0, generator: 0, erect: 0, meiller: 0, fuelA: 0, fuelL: 0, onRamp: false, where: 'none' });
    if (sim.attract) st.settings = { ...st.solution }; else st.settings = { compass: null, range: null };
    if (st.left <= 0) {
      st.done = true;
      this.u.gate = 'no rounds left';
    }
  }

  // a fault on the step just finishing (rolled here so it is deterministic per seed)
  faultFor(s) {
    const sim = this.sim, st = this.u.special;
    if (sim.attract || sim.scripted) return null; // the lessons teach the drill, not the faults
    if (s.id === 'steam' && sim.rng() < V1_ODDS.steamFault) return { id: 'pressure', text: 'Steam generator: the pressure is low', fixText: 'Venting and recharging the generator', cost: 45, ignorable: true, risk: 0.45 };
    if (s.id === 'fuel' && sim.rng() < V1_ODDS.leak) return { id: 'leak', text: 'A fuel leak at the tank', fixText: 'Draining and resealing the tank', cost: 30, ignorable: false };
    if (s.id === 'checks' && sim.rng() < V2_ODDS.checkFault) return { id: 'gyro', text: 'Prüfung: a gyro will not run up to speed', fixText: 'Changing the gyro unit', cost: 60, ignorable: true, risk: 0.3 };
    if (s.id === 'prestage' && sim.rng() < V2_ODDS.preFail) return { id: 'pre', text: 'Vorstufe: the flame is ragged', fixText: 'Shutting down, purging, a new igniter', cost: 120, ignorable: true, risk: 0.5, scrubText: 'pre-stage failure' };
    return null;
  }

  complete() {
    const sim = this.sim, st = this.u.special, s = this.step();
    s.state = 'done';
    st.doing = false;
    sim.events.special?.(this.u, 'done', s.id);
    if (s.id === 'lox') { st.loxOn = true; st.lox = 100; }
    if (s.id === 'fire') return this.launch();
    st.i++;
  }

  update(dt) {
    const sim = this.sim, u = this.u, st = u.special;
    if (!u.alive) return;
    // a loaded, fuelled round on a wrecked ramp or table goes up
    if (u.pieces[0].state === 'dead' && !st.done) {
      st.done = true;
      u.gate = 'site destroyed';
      return;
    }
    if (!st.done && sim.time > (sim.theatre.op.timeLimit ?? 2400) && !sim.attract) {
      st.done = true;
      u.gate = 'the day is over';
      sim.radio('The day is over: the site stands down.', 'info');
    }
    if (u.mode === 'auto') this.auto();
    if (st.doing && !st.cover) {
      const s = this.step();
      const crew = clamp(u.pieces[0].crew / u.pieces[0].crewMax, 0.35, 1);
      st.t += dt * crew * (sim.attract ? 2 : 1);
      if (st.repair != null) {
        st.repair -= dt * crew;
        if (st.repair <= 0) { st.repair = null; st.doing = false; st.rampHp = 1; st.rampWarned = false; sim.radio('Repaired.', 'info'); }
      } else if (st.topup != null) {
        st.lox = Math.min(100, st.lox + dt * 0.4);
        st.topup -= dt * crew;
        if (st.topup <= 0) { st.topup = null; st.doing = false; }
      } else if (st.t >= s.dur) {
        const f = this.faultFor(s);
        if (f) {
          st.fault = f;
          st.doing = false;
          sim.radio(`${f.text}.`, 'alert');
        } else this.complete();
      }
    }
    // the liquid oxygen boils off once it is in
    if (st.loxOn) st.lox = Math.max(0, st.lox - dt * 0.09);
    this.pose(dt);
    // the enemy's air force: Crossbow over the V-1 sites, armed reconnaissance over the A4 launch areas
    if (!sim.attract && !sim.scripted && !st.done) {
      if (st.missile) st.exposed += dt;
      if (sim.time > st.nextRaid) {
        st.nextRaid = sim.time + 300 + sim.rng() * 220;
        const v2 = this.kind === 'v2';
        if (!v2 || st.exposed > 120 || sim.rng() < 0.3) sim.enemyAI.raid?.({ x: u.pos.x, z: u.pos.z, flak: 0.3 }, { n: v2 ? 2 : 3, weapon: v2 ? 'rp3' : 'bomb', warn: v2 ? 25 : 45 });
      }
    }
    this.flights(dt);
  }

  // what the site's model shows (read by the render layer)
  pose(dt) {
    const st = this.u.special, s = this.step(), id = s?.id, k = st.doing && s ? clamp(st.t / s.dur, 0, 1) : 0;
    const done = (x) => st.steps.find((q) => q.id === x)?.state === 'done';
    if (this.kind === 'v1') {
      st.where = done('ramp') ? 'ramp' : done('bring') || id === 'bring' ? 'trolley' : 'none';
      st.wings = done('wings') ? 1 : id === 'wings' ? k : 0;
      st.generator = done('steam') ? 1 : id === 'steam' ? Math.min(1, k * 3) : 0;
      st.missile = st.where !== 'none';
    } else {
      st.erect = done('erect') ? 1 : id === 'erect' ? k : 0;
      st.meiller = done('withdraw') ? 1 : id === 'withdraw' ? k : 0;
      st.fuelA = done('alcohol') ? 1 : id === 'alcohol' ? k : 0;
      st.fuelL = st.loxOn ? st.lox / 100 : id === 'lox' ? k : 0;
      st.missile = st.steps[0].state !== 'todo' || st.erect > 0;
      const tb = this.u.zero;
      const want = st.settings.compass != null ? st.settings.compass * DEG : tb;
      st.table = done('align') ? angDiff(want / DEG, tb / DEG) * DEG : id === 'align' ? angDiff(want / DEG, tb / DEG) * DEG * k : 0;
    }
  }

  auto() {
    const st = this.u.special, s = this.step(), sim = this.sim;
    if (st.done) return;
    // take cover when the raiders are close, back to work when they have gone (the step waits meanwhile)
    const threat = sim.enemyAI.raids?.some((r) => r.at - sim.time < 15) || sim.aircraft?.some((p) => p.alive);
    if (st.cover && !threat) st.cover = false;
    else if (!st.cover && threat) { st.cover = true; return; }
    if (st.doing || st.cover) return;
    if (st.fault) return this.fix('fix');
    if (s?.set && st.settings[s.set] == null) {
      // the auto crew's settings: right within a little
      const e = this.sim.gauss();
      st.settings[s.set] = s.set === 'compass' ? Math.round((st.solution.compass + e * 0.3) * 10) / 10 : Math.round((st.solution.range * (1 + e * 0.01)) * 10) / 10;
    }
    if (st.rampHp < 0.35) { this.command('repair', {}); this.u.mode = 'auto'; return; }
    if (this.kind === 'v2' && st.loxOn && st.lox < 93 && s?.id !== 'fire') { this.command('topup', {}); this.u.mode = 'auto'; return; }
    this.begin();
  }

  launch() {
    const sim = this.sim, u = this.u, st = u.special, op = sim.theatre.op;
    const n = ++st.n;
    const T = st.target;
    // the errors of the drill: the compass or table against the true bearing, the range setting against the solution
    const bErr = angDiff(st.settings.compass ?? st.solution.compass, st.solution.compass);
    const rErr = (st.settings.range ?? st.solution.range) / st.solution.range - 1;
    const lox = this.kind === 'v2' ? st.lox : 100;
    const short = this.kind === 'v2' && lox < 92 ? (92 - lox) * 0.03 : 0;
    const O = this.kind === 'v1' ? V1_ODDS : V2_ODDS;
    let fate = 'flying';
    const r = sim.scripted ? 1 : sim.rng();
    const risk = st.risk ?? 0;
    if (this.kind === 'v1') {
      if (r < O.rampCrash + risk) fate = 'crash';
      else if (r < O.rampCrash + risk + O.earlyFail) fate = 'fail';
    } else if (r < O.tableBlast + risk * 0.3) fate = 'blast';
    else if (r < O.tableBlast + risk + O.flightFail) fate = 'fail';
    const dist = T.dist * (1 + rErr - short) + sim.gauss() * O.sigma;
    const lat = Math.sin(bErr * DEG) * T.dist + sim.gauss() * O.sigma * 0.7;
    const miss = Math.hypot(dist - T.dist, lat);
    const shot = this.kind === 'v1' && fate === 'flying' && !sim.scripted && sim.rng() < O.shotDown;
    const speed = this.kind === 'v1' ? 175 : 1150;
    const eta = sim.time + (this.kind === 'v1' ? T.dist / speed * 0.25 : 300 * 0.5); // the strategic leg runs compressed
    const f = { n, t0: sim.time, eta, fate, shot, miss, bErr, rErr, short, state: 'flying', text: '' };
    st.flights.push(f);
    // the flight object on the map
    const p = u.pieces[0], b = (u.zero + (st.settings.compass != null ? angDiff(st.settings.compass, u.zero / DEG) * DEG : 0));
    const top = this.kind === 'v1' ? 46 : 0;
    const x0 = p.pos.x + Math.sin(u.zero) * top, z0 = p.pos.z - Math.cos(u.zero) * top;
    const y0 = sim.heightAt(p.pos.x, p.pos.z) + (this.kind === 'v1' ? 5.5 : 14);
    const v0 = this.kind === 'v1' ? 108 : 2;
    const el = this.kind === 'v1' ? 6 * DEG : 90 * DEG;
    const m = {
      id: sim.nextId('s'), own: true, guided: true, unitId: u.id, piece: 0, kind: this.kind, calibre: this.kind === 'v1' ? 22 : 26,
      pos: { x: x0, y: y0, z: z0 }, prev: { x: x0, y: y0, z: z0 },
      vel: { x: Math.sin(b) * Math.cos(el) * v0, y: Math.sin(el) * v0, z: -Math.cos(b) * Math.cos(el) * v0 },
      fuze: 'instant', t: 0, t0: sim.time, tof: 0, aim: { x: x0, z: z0 }, alive: true, flight: f, bearing: b, engineOff: false,
      fail: fate === 'crash' ? 3 + sim.rng() * 10 : fate === 'fail' ? 15 + sim.rng() * 40 : fate === 'blast' ? 0.5 : null,
    };
    sim.shells.push(m);
    st.launchT = sim.time;
    u.stats.rounds++;
    u.lastShot = sim.time;
    p.firedAt = sim.time;
    u.signature = Math.min(1, u.signature + 0.4);
    sim.stats.rounds++;
    sim.events.fire?.(u, p, m);
    sim.events.special?.(u, 'launch', m);
    sim.radio(this.kind === 'v1' ? `Abschuß! Flying bomb no. ${n} is off the ramp.` : `Hauptstufe! A4 no. ${n} lifts off.`, 'kill');
    if (!sim.attract) sim.score.points += 40; // the drill done
    this.nextRound();
    void op;
  }

  // fly the missiles on the map, then settle their fates
  flights(dt) {
    const sim = this.sim, st = this.u.special;
    for (const m of sim.shells) {
      if (!m.guided || !m.alive || m.unitId !== this.u.id) continue;
      m.prev.x = m.pos.x; m.prev.y = m.pos.y; m.prev.z = m.pos.z;
      m.t += dt;
      const gy = sim.heightAt(m.pos.x, m.pos.z);
      if (m.fail != null && m.t > m.fail) {
        // it goes wrong: the V-1 dives in, the A4 tumbles; on the table it explodes
        m.vel.y -= G * dt * 1.6;
        m.engineOff = true;
        m.failing = true;
      } else if (this.kind === 'v1') {
        const sp = Math.hypot(m.vel.x, m.vel.z);
        const want = Math.min(178, 108 + m.t * 1.6);
        const k = want / Math.max(1, sp);
        m.vel.x *= k; m.vel.z *= k;
        const alt = m.pos.y - gy;
        m.vel.y = clamp((900 - alt) * 0.05, -5, 12);
      } else {
        // A4: vertical for 4 s, then the pitch program turns it toward the target until burn-out at 65 s
        const burn = m.t < 65;
        const a = burn ? 9 + m.t * 0.35 : 0;
        const pitch = m.t < 4 ? 0 : Math.min(48, (m.t - 4) * 1.1) * DEG;
        const dx = Math.sin(m.bearing) * Math.sin(pitch), dz = -Math.cos(m.bearing) * Math.sin(pitch), dy = Math.cos(pitch);
        m.vel.x += dx * a * dt; m.vel.y += (dy * a - G) * dt; m.vel.z += dz * a * dt;
        m.burning = burn;
      }
      m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;
      if (m.pos.y <= sim.heightAt(m.pos.x, m.pos.z)) {
        m.pos.y = sim.heightAt(m.pos.x, m.pos.z);
        m.flight.state = m.flight.fate === 'blast' ? 'exploded on the table' : 'crashed near the site';
        m.flight.text = m.flight.fate === 'blast' ? 'The rocket exploded on the firing table.' : 'It crashed soon after launch.';
        sim.radio(`No. ${m.flight.n}: ${m.flight.text}`, 'alert');
        sim.burst(m, { x: m.pos.x, y: m.pos.y, z: m.pos.z }, false);
        if (m.flight.fate === 'blast') {
          const p = this.u.pieces[0];
          sim.guns.damagePiece(this.u, p, 90, true);
        }
        continue;
      }
      const far = Math.hypot(m.pos.x - this.u.pos.x, m.pos.z - this.u.pos.z);
      if (far > 30000 || m.pos.y > 60000 || Math.abs(m.pos.x) > sim.bounds || Math.abs(m.pos.z) > sim.bounds) m.alive = false; // off the map: the strategic leg
    }
    for (const f of st.flights) {
      if (f.state !== 'flying' || sim.time < f.eta) continue;
      const O = this.kind === 'v1' ? V1_ODDS : V2_ODDS;
      if (f.fate === 'crash' || f.fate === 'blast') continue;
      if (f.fate === 'fail') { f.state = 'failed in flight'; f.text = 'Lost in flight (a fault).'; }
      else if (f.shot) { f.state = 'shot down'; f.text = 'Brought down by the anti-aircraft belt or fighters before the target.'; }
      else if (f.miss <= O.area) { f.state = 'target area'; f.text = `Reached the target area, ${(f.miss / 1000).toFixed(1)} km from the aiming point.`; if (!sim.attract) sim.score.points += 100; }
      else { f.state = 'missed'; f.text = `Fell ${(f.miss / 1000).toFixed(0)} km from the aiming point, outside the target area.`; }
      sim.radio(`Report on no. ${f.n}: ${f.text}`, f.state === 'target area' ? 'kill' : 'warn');
      sim.events.special?.(this.u, 'result', f);
    }
    // the mission ends when every round is spent and every flight is settled
    if (st.done && !st.ended && st.flights.every((f) => f.state !== 'flying') && !sim.attract) {
      st.ended = true;
      const hit = st.flights.filter((f) => f.state === 'target area').length, n = st.flights.length;
      const what = this.kind === 'v1' ? 'flying bombs' : 'rockets';
      sim.over = { title: 'Mission complete', sub: `${hit} of ${n} ${what} reached the target area.` };
      sim.director.setState(hit * 3 >= n ? 'victory' : 'defeat', `The site has spent its ${what}: ${hit} of ${n} reached the target area.`);
    }
  }

  onEnemyBurst(s, pos) {
    const sim = this.sim, u = this.u, st = u.special;
    const d = Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z);
    if (d > 120) return;
    // men out in the open are hurt; a fuelled round on the ramp or table may go up
    if (!st.cover && sim.rng() < (1 - d / 120) * 0.8) {
      const p = u.pieces[0];
      p.crew = Math.max(2, p.crew - 1);
      sim.events.casualty?.(u, p);
    }
    st.rampHp = Math.max(0, st.rampHp - (d < 40 ? 0.25 : 0.05));
    const fuelled = this.kind === 'v1' ? st.steps.find((x) => x.id === 'fuel').state === 'done' : st.fuelA > 0.5;
    if (st.missile && fuelled && d < 25 && sim.rng() < 0.3) {
      sim.events.secondary?.({ x: u.pos.x, y: u.pos.y + 3, z: u.pos.z }, 3);
      this.scrub('the round was hit on the site');
    }
  }

  signatureK() {
    return 1;
  }
}

// ------------------------------------------------------------------------------------------------ the module
const CTL = { gustav: GustavCtl, karl: KarlCtl, v1: (s, u) => new LaunchCtl(s, u, 'v1'), v2: (s, u) => new LaunchCtl(s, u, 'v2') };

export class SpecialWW2 {
  constructor(sim) {
    this.sim = sim;
    this.ctl = [];
  }

  reset() {
    const sim = this.sim;
    this.ctl = [];
    for (const u of sim.units) {
      const C = CTL[u.def?.special];
      if (!C) continue;
      const c = C === CTL.v1 || C === CTL.v2 ? C(sim, u) : new C(sim, u);
      c.reset();
      this.ctl.push(c);
    }
  }

  of(u) {
    return this.ctl.find((c) => c.u === u);
  }

  update(dt) {
    for (const c of this.ctl) c.update(dt);
  }

  command(u, name, args) {
    return this.of(u)?.command(name, args ?? {}) ?? false;
  }

  onEnemyBurst(s, pos) {
    for (const c of this.ctl) c.onEnemyBurst?.(s, pos);
  }
}

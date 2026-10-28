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
// A unit whose definition has `ready: true` (the sandbox) starts set up: the Karl hull down in its first position
// with a shell in the breech, the V-1 and V-2 with a round on the ramp or the table, the firing data dialled in.
// Its crew then reloads and lays by itself (the Karl turns its hull onto a line outside the 4 degrees, sends the
// carrier for shells; the launch crews run the reload steps, fix faults, take cover) and the player only fires.
import { DEG, bearingOf } from '../sector.js';
import { G, GUNS } from '../sim/tables.js';
import { Gunner, GUNNER_CMDS } from './gunner.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapDeg = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

// ------------------------------------------------------------------------------------------------ Gustav
export const GUSTAV_TASKS = [
  { id: 'survey', name: 'Survey the firing curve', de: 'Vermessung der Feuerstellung', work: 60, needs: [], max: 2 },
  { id: 'track', name: 'Lay the curved double track', de: 'Gleisbau: die Schießkurve', work: 260, needs: ['survey'], max: 3 },
  { id: 'flak', name: 'Flak cover', de: 'Flakschutz', work: 90, needs: [], max: 2, optional: true },
  { id: 'cranes', name: 'Erect the two gantry cranes', de: 'Portalkräne aufstellen', work: 100, needs: ['track'], max: 2 },
  { id: 'assembly', name: 'Assemble the gun (5 trains of parts)', de: 'Montage des Geschützes', work: 300, needs: ['cranes'], max: 3 },
  { id: 'ammo', name: 'Ammunition train and shell hoist', de: 'Munitionszug und Aufzug', work: 120, needs: ['track'], max: 2 },
  { id: 'camo', name: 'Camouflage nets over the gun', de: 'Tarnung', work: 60, needs: ['assembly'], max: 2, optional: true },
];

// The flak cover: two army flak battalions guarded the gun (the sources; four batteries stand for them, gustav_layout.js
// FLAK), each counting from the moment it is dug in, in the order they come (light, heavy, light, heavy). The light 2 cm
// quads are what brings the low ground-attack aircraft down; the heavy 8.8 cm mostly spoils their aim (enemy.js:
// st.flak a raider's chance of being shot down, st.flakSpoil the wider scatter of its bombs). Both batteries of each
// kind make the old full cover (flak 1) and spoil the bombing by 60 percent.
const FLAK_ORDER = ['light', 'heavy', 'light', 'heavy'];
function flakCover(st, k) {
  let light = 0, heavy = 0;
  FLAK_ORDER.forEach((kind, i) => { if (k >= (i + 1) / FLAK_ORDER.length - 1e-9) { if (kind === 'light') light++; else heavy++; } });
  st.flak = 0.42 * light + 0.08 * heavy;
  st.flakSpoil = 0.3 * heavy;
}

export class GustavCtl {
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
    // Flanders lists Gustav as a playable battery. Start it assembled there so its
    // raised crew stations have a platform; Sevastopol keeps the preparation drill.
    if (sim.attract || sim.theatre.op.kind === 'battle' || sim.scripted && sim.theatre.prepared) this.finishAll();
    u.gate = st.ready ? null : 'railway preparation';
    // the gun is put together at its loading elevation (the cradle level) and raised to its rest once it stands
    for (const p of u.pieces) { p.fixed = st.assembly < 1; if (p.fixed) p.el = GUNS[p.kind].loadEl ?? 0; }
  }

  finishAll() {
    const st = this.u.special;
    for (const t of st.tasks) { t.done = t.work; t.state = 'done'; t.gangs = 0; }
    st.ready = true;
    st.assembly = 1;
    st.cranesOut = 1;
    Object.assign(st.stage, { survey: 1, track: 1, cranes: 0, ammo: 1, flak: 1, camo: 1 });
    flakCover(st, 1);
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
      }
    }
    for (const k of ['survey', 'track', 'ammo', 'flak', 'camo']) st.stage[k] = this.task(k).done / this.task(k).work;
    flakCover(st, st.stage.flak);
    const asm = this.task('assembly');
    st.assembly = asm.done / asm.work;
    for (const p of u.pieces) p.fixed = st.assembly < 1; // a gun in pieces is not laid (guns.js slew)
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
      if (!st.ready || sim.rng() < 0.5) sim.enemyAI.raid?.({ x: u.pos.x, z: u.pos.z, flak: st.flak, spoil: st.flakSpoil }, { n: 2 + (sim.rng() < 0.3 ? 1 : 0), weapon: 'bomb', warn: 50 });
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
export class KarlCtl {
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
      schlepper: { state: 'alongside', t: 0, k: 0 }, log: [], quick: !!u.def.ready, autoLay: false,
    };
    u.ammo.he = carry;
    u.ammoMax.he = carry;
    u.pieces[0].el = 0;
    const q0 = st.positions[0];
    if (st.quick && q0) {
      // set up: in the first prepared position on the zero line, hull down, the barrel at rest and the breech empty,
      // as every other battery starts: the first mission goes through the loading cycle like theirs
      this.setPos(q0.pos.x, q0.pos.z);
      this.setHeading(u.zero);
      Object.assign(st, { stage: 'down', lower: 1, ready: true, posId: q0.id, cover: q0.cover ? 1 + q0.cover : 1 });
      const p = u.pieces[0];
      p.el = p.cmd.el = GUNS[p.kind].restEl;
    } else if (sim.attract || (sim.scripted && sim.theatre.prepared)) {
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
        st.autoLay = false; // the crew turns and lowers again only after a raise of its own (auto() sets it)
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
    else if (u.ammo.he <= 0 && !p.loaded) g = st.schlepper.state === 'alongside' ? (st.reserve > 0 ? 'no shells at the gun: send the carrier (Y)' : 'no shells left') : 'no shells: the carrier is away';
    st.ready = !g;
    // the gun is laid only from a hull that is down: rising, turning, lowering or on the road the barrel lies flat
    // and a round waits at its lay step (sim/guns.js `stowed`). Set up (sandbox), the crew loads while the hull turns
    // onto a new line, as the other guns load while they traverse; not on the road, where a cycle not yet at the ram
    // is given up (the shell back on the carrier) and none is begun
    u.stowed = st.stage !== 'down';
    u.loadThrough = st.quick && st.stage !== 'travel' && st.stage !== 'driving';
    if (g !== u.gate) {
      u.gate = g;
      sim.guns.recompute(u);
    }
  }

  update(dt) {
    const sim = this.sim, u = this.u, st = u.special, p = u.pieces[0];
    if (!u.alive) return;
    if (u.mode === 'auto' || st.quick) this.auto();
    // the hull not down, the barrel comes down to lie flat (the guns' slew brings a stowed gun down at its elevating
    // rate; this adds to it, so it is flat by the time the hull is up)
    if (st.stage !== 'down') p.el = Math.max(0, p.el - 2.5 * DEG * dt);
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
        st.autoLay = st.quick;
        sim.radio(st.quick ? `Karl: in ${q?.name ?? 'position'}, emplacing.` : `Karl: in ${q?.name ?? 'position'}. Turn onto the target (T), then lower the hull (L).`, 'info');
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

  // the auto crew: the first position, onto the target the crew took, hull down, fetch shells when out. A set-up
  // (quick) Karl's crew does this in manual mode too, keeping the player's mode: a line outside the 4 degrees is
  // raise, turn, lower (a shell may stay in the breech), and it emplaces after a drive but leaves a hull the player
  // raised up (to drive on)
  auto() {
    const u = this.u, st = u.special, o = u.order, mode = u.mode;
    const cmd = (n, a = {}) => { this.command(n, a); u.mode = mode; };
    if (st.stage === 'travel' && st.positions.length) cmd('goto', { id: st.positions[0].id });
    else if (st.stage === 'emplace' && (st.quick ? st.autoLay : o.target)) {
      if (o.target && o.why === 'out of arc') cmd('pivot');
      else {
        cmd('lower');
        st.autoLay = false;
      }
    } else if (st.stage === 'down' && o.target && o.why === 'out of arc' && (st.quick || !u.pieces[0].loaded)) {
      cmd('raise');
      st.autoLay = st.quick;
    }
    if (u.ammo.he <= 0 && !u.pieces[0].loaded && st.schlepper.state === 'alongside' && st.reserve > 0) this.command('fetch', {});
  }

  signatureK() {
    return 1 / this.u.special.cover;
  }
}

// ------------------------------------------------------------------------------------------------ V-1
// The drill as data: `crew` is what the console says the crew is doing while the step runs. Durations are game
// seconds (the whole V-1 drill about 3.5 minutes, the A4's about 5, both heavily compressed).
export const V1_STEPS = [
  { id: 'bring', name: 'Bring the missile from the store', de: 'Gerät aus dem Lager', dur: 25, crew: 'The missile comes out of the store on its trolley' },
  { id: 'wings', name: 'Fit the wings', de: 'Tragflächen anbauen', dur: 20, crew: 'Wings onto the spar tube, bolted home' },
  { id: 'compass', name: 'Swing the master compass in the Richthaus', de: 'Kompass im Richthaus einrichten', dur: 30, set: 'compass', crew: 'Compass set to the course; the airframe knocked with mallets to settle its magnetism' },
  { id: 'airlog', name: 'Set the air log for the range', de: 'Luftlog einstellen', dur: 12, set: 'range', crew: 'The counter on the nose propeller preset for the air distance' },
  { id: 'ramp', name: 'Onto the launch sled', de: 'Auf den Kolben setzen', dur: 30, crew: 'Lifted onto the sled at the foot of the ramp' },
  { id: 'fuel', name: 'Fuel and compressed air', de: 'Betanken, Preßluft', dur: 35, crew: 'Petrol into the tank, the air bottles charged' },
  { id: 'steam', name: 'Charge the steam generator', de: 'Dampferzeuger befüllen', dur: 35, crew: 'T-Stoff and Z-Stoff into the generator trolley, then the pressure test' },
  { id: 'arm', name: 'Arm the warhead fuzes', de: 'Zünder scharf', dur: 10, crew: 'The fuzes in and armed' },
  { id: 'clear', name: 'Clear the ramp: crew to the bunker', de: 'Rampe räumen', dur: 12, crew: 'Everyone into the firing bunker' },
  { id: 'fire', name: 'Start the engine and fire the catapult', de: 'Triebwerk an, Abschuß', dur: 4, crew: 'The pulse jet starts on compressed air and a spark; then the steam generator fires' },
];
export const V2_STEPS = [
  { id: 'erect', name: 'Erect the rocket on the firing table', de: 'Aufrichten (Meillerwagen)', dur: 45, crew: 'The Meillerwagen\'s hydraulic arm lifts the rocket upright onto the table' },
  { id: 'align', name: 'Turn the table onto the target', de: 'Richten des Brennstands', dur: 25, set: 'compass', crew: 'The table turned until fin I lies on the line, checked by theodolite' },
  { id: 'cutoff', name: 'Set the Brennschluss for the range', de: 'Brennschluß einstellen', dur: 15, set: 'range', crew: 'The I-Gerät preset to cut the engine at the speed for the range' },
  { id: 'checks', name: 'Electrical checks: gyros and rudders', de: 'Elektrische Prüfung', dur: 50, crew: 'The gyros run up, the rudders swing; cables to the Feuerleitpanzer' },
  { id: 'alcohol', name: 'Fuel: B-Stoff (alcohol)', de: 'B-Stoff tanken', dur: 45, crew: 'Alcohol and water from the tanker' },
  { id: 'tstoff', name: 'Fuel: T-Stoff and Z-Stoff', de: 'T-Stoff, Z-Stoff', dur: 30, crew: 'Peroxide and permanganate for the turbopump\'s steam' },
  { id: 'lox', name: 'Fuel: A-Stoff (liquid oxygen), last', de: 'A-Stoff tanken', dur: 50, crew: 'Liquid oxygen at minus 183 degrees: the tank frosts over and starts to boil off' },
  { id: 'withdraw', name: 'Withdraw the Meillerwagen, crew to cover', de: 'Meillerwagen zurück', dur: 30, crew: 'The arm folds back; trailer and tankers pull away' },
  { id: 'prestage', name: 'Vorstufe: ignition, watch the flame', de: 'Vorstufe', dur: 6, crew: 'Igniter lit, propellants flowing under gravity: about 8 t of thrust' },
  { id: 'fire', name: 'Hauptstufe: lift-off', de: 'Hauptstufe', dur: 3, crew: 'The turbopump comes up: 25 t, the rocket rises off the table' },
];

// game odds (docs/WW2.md "Balancing assumptions")
const V1_ODDS = { rampCrash: 0.08, earlyFail: 0.12, shotDown: 0.45, area: 8000, sigma: 5500, steamFault: 0.12, leak: 0.06 };
const V2_ODDS = { tableBlast: 0.03, flightFail: 0.12, area: 6000, sigma: 3500, checkFault: 0.15, preFail: 0.06 };
// the settings count as matching the firing data within these (degrees, km): the console's MATCH and the hold
const TOL = { compass: 0.25, range: 0.6 };
// the V-1's steam generator: its test pressure (bar, a game figure) gives the speed off the ramp
const STEAM_P = 60, STEAM_LOW = 34, RAMP_KMH = 390;
// A set-up (quick) site's reload: the V-1s come to the ramp prepared (wings on, compass swung, air log set, fuelled,
// fuzed by the preparation section), so a ramp reloads in bring, mount, steam, clear: 102 s and the 4 s shot, about
// 12x compressed from the real best of one every 20 to 30 minutes. The A4 has no such short cut (each rocket is
// erected, aligned, checked and fuelled on the table): 290 s and the 9 s firing, about 20x from the real 90 to 110
// minutes. The firing key is the V-1's catapult or the A4's Vorstufe (the Hauptstufe follows by itself).
export const QUICK = {
  v1: { prep: new Set(['wings', 'compass', 'airlog', 'fuel', 'arm']), trigger: 'fire' },
  v2: { prep: new Set(), trigger: 'prestage' },
};
const pc = (k) => `${Math.round(k * 100)}%`;
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s)) % 60).padStart(2, '0')}`;

// The launch drill. In MANUAL the player starts the drill (the `step` command) and the crew then carries on from step
// to step by itself (`run`), holding only where it needs the player: a setting not dialled to the firing data, a
// fault (fix, carry on at a risk, or scrub), the firing key (and the A4's Hauptstufe), a damaged ramp; after a launch
// the next round waits for the step command. `hold` names what the drill waits for, `refused` the last order the site
// could not carry out (every refusal says why; the important ones go on the radio). AUTO: the crew does everything.
// A fault is rolled when its step begins (`pend`) so the instruments show it coming before the crew reports it.
class LaunchCtl {
  constructor(sim, u, kind) {
    this.sim = sim;
    this.u = u;
    this.kind = kind;
    this.STEPS = kind === 'v1' ? V1_STEPS : V2_STEPS;
    this.O = kind === 'v1' ? V1_ODDS : V2_ODDS;
    this.Q = QUICK[kind];
    this.triggerI = this.STEPS.findIndex((s) => s.id === this.Q.trigger);
  }

  reset() {
    const u = this.u, sim = this.sim, op = sim.theatre.op;
    u.mode = u.def.mode ?? 'manual';
    u.gate = 'launch drill';
    const T = u.def.target ?? op.target;
    const st = u.special = {
      kind: this.kind, target: { name: T.name, dist: T.dist, bearing: T.bearing },
      solution: null, wind: null,
      settings: { compass: null, range: null }, i: 0, t: 0, doing: false, fault: null, cover: false, crewHurt: 0,
      steps: this.STEPS.map((s) => ({ ...s, state: 'todo' })), left: u.ammo.he, n: 0, flights: [], missile: false,
      lox: 0, loxOn: false, nextRaid: 260 + sim.rng() * 160, raidAt: null, ready: false, rampHp: 1, exposed: 0, done: false,
      // the drill's flow (see the class comment) and what the console shows
      run: false, hold: 'start', accept: {}, refused: null, pend: null, fixing: null, alarm: null, odds: null,
      area: this.O.area, sigma: this.O.sigma, tol: TOL, gauges: {},
      // render hints
      wings: 0, generator: 0, erect: 0, meiller: 0, table: 0, fuelA: 0, fuelL: 0, onRamp: false, where: 'none', launchT: -1,
      quick: !!u.def.ready, trigger: this.Q.trigger, jet: 0, steamP: 0, flame: 0,
    };
    // the firing data: the target's bearing and range, the V-1's air log allowing for the wind along the route (at
    // cruising height, stronger than on the ground)
    this.met(Math.round(wrapDeg(sim.wind.bearing / DEG)), sim.wind.speed * (this.kind === 'v1' ? 1.8 : 1));
    if (sim.attract) st.settings = { ...st.solution };
    if (st.quick) {
      // set up: the battery's firing data dialled in, the drill done up to the firing key (the A4 fuelled)
      st.settings = { ...st.solution };
      st.steps.forEach((s, i) => { if (i < this.triggerI) s.state = 'done'; });
      if (this.kind === 'v2') { st.loxOn = true; st.lox = 100; }
      else st.steamP = STEAM_P;
      st.i = this.triggerI;
    }
    this.pose(0);
    this.holdFor();
  }

  // the wind along the route (from, degrees; m/s) and the firing data it gives: a headwind makes the air distance
  // longer than the ground distance (the V-1's log counts air distance); the A4 flies above the weather
  met(from, speed) {
    const st = this.u.special, T = st.target, b = from * DEG;
    const headwind = -Math.cos(b - T.bearing) * speed;
    st.wind = { from: Math.round(wrapDeg(from)), speed: Math.round(speed), headwind: Math.round(headwind * 10) / 10 };
    st.solution = {
      compass: Math.round(wrapDeg(T.bearing / DEG) * 10) / 10,
      range: Math.round((T.dist / 1000) * (this.kind === 'v1' ? 1 + headwind / 180 : 1) * 10) / 10,
    };
  }

  step() {
    return this.u.special.steps[this.u.special.i];
  }

  // the first step not yet done (in the full drill simply the next one; a quick site skips its prepared steps and
  // comes back to a step it must do again)
  nextStep() {
    const st = this.u.special, i = st.steps.findIndex((s) => s.state !== 'done');
    st.i = i < 0 ? st.steps.length : i;
  }

  // a setting the drill may go on with: dialled to the firing data, or accepted off it (the step key at the hold)
  dialled(key) {
    const st = this.u.special, v = st.settings[key];
    return v != null && (st.accept[key] || Math.abs(key === 'compass' ? angDiff(v, st.solution.compass) : v - st.solution.range) <= TOL[key] + 1e-6);
  }

  // the firing has begun: the settings can no longer change
  firing() {
    const st = this.u.special;
    return st.i >= this.triggerI && (st.doing || st.steps[this.triggerI]?.state === 'done');
  }

  // new firing data on a round already laid sends the crew back to the step that sets it (the V-1's compass or air
  // log, the A4's table or cut-off), after the step in hand
  relay(key) {
    const st = this.u.special, s = st.steps.find((q) => q.set === key);
    if (!s || s.state !== 'done' || this.firing()) return;
    s.state = 'todo';
    if (key === 'compass') st.tableFrom = st.table;
    if (!st.doing) this.nextStep();
    if (!st.quick) this.sim.radio(`New ${this.dialName(key)} setting: the crew goes back to "${s.name}".`, 'info');
  }

  dialName(key) {
    return key === 'compass' ? (this.kind === 'v1' ? 'compass' : 'table bearing') : (this.kind === 'v1' ? 'air log' : 'Brennschluss');
  }

  // an order the site cannot carry out says why: in the console's status line, and on the radio when it matters
  refuse(text, radio = true) {
    const sim = this.sim, st = this.u.special;
    st.refused = { text, t: sim.time };
    if (radio && (st.lastRefusal !== text || sim.time - st.lastRefusalT > 6)) {
      st.lastRefusal = text;
      st.lastRefusalT = sim.time;
      sim.radio(text, 'warn');
    }
    return false;
  }

  // why the step key cannot start the step in hand now, or null
  cannot() {
    const st = this.u.special, s = this.step(), what = this.kind === 'v1' ? 'ramp' : 'firing table';
    if (st.done || !s) return { text: st.left <= 0 ? 'No rounds left: the site has spent its missiles.' : 'The site stands down.' };
    if (st.fault) return { text: `${st.fault.text}: decide first. Fix it (O), carry on (I) or scrub the round (X).` };
    if (st.cover) return { text: 'The crew is in cover: B sends them back to work.' };
    if (st.repair != null) return { text: `The crew is repairing the ${what} (${mmss(st.repair)}).`, radio: false };
    if (st.topup != null) return { text: `The crew is topping up the liquid oxygen (${mmss(st.topup)}).`, radio: false };
    if (st.doing) return { text: `The crew is busy: ${s.name.toLowerCase()} (${mmss(s.dur - st.t)}).`, radio: false };
    const key = s.id === this.Q.trigger || s.id === 'fire';
    if (st.quick && !key) return { text: `The crew is reloading: ${s.name.toLowerCase()}.`, radio: false };
    if (s.set && st.settings[s.set] == null) {
      const v = s.set === 'compass' ? `${st.solution.compass.toFixed(1)} degrees` : `${st.solution.range.toFixed(1)} km`;
      return { text: `Dial the ${this.dialName(s.set)} first (${s.set === 'compass' ? 'left and right arrows' : 'up and down arrows'}): the firing data says ${v}.` };
    }
    if (key && st.rampHp < 0.35) return { text: `The ${what} is damaged (${pc(1 - st.rampHp)}): repair it first (R).` };
    return null;
  }

  command(name, a) {
    const sim = this.sim, u = this.u, st = u.special;
    if (u.mode === 'auto' && name !== 'mode') u.mode = 'manual';
    switch (name) {
      case 'set': {
        if (this.firing()) return this.refuse('Too late to change the settings: the firing has begun.');
        const was = { ...st.settings };
        if (a.compass != null) st.settings.compass = Math.round(wrapDeg(a.compass) * 10) / 10;
        if (a.range != null) st.settings.range = Math.max(0, Math.round(a.range * 10) / 10);
        for (const k of ['compass', 'range']) if (st.settings[k] !== was[k]) { st.accept[k] = false; this.relay(k); }
        return true;
      }
      case 'step': {
        // start (or go on with) the drill, accept a setting off the firing data, or fire
        const no = this.cannot();
        if (no) return this.refuse(no.text, no.radio !== false);
        const s = this.step();
        if (s.set && !this.dialled(s.set)) st.accept[s.set] = true;
        if (!st.quick) st.run = true;
        this.begin();
        return true;
      }
      case 'fix': return this.fix(a.how ?? 'fix');
      case 'cover':
        st.cover = !st.cover;
        st.crewCover = false;
        sim.radio(st.cover ? 'Volle Deckung: the crew takes cover; the drill waits.' : 'The crew is back at work.', 'info');
        return true;
      case 'repair': {
        const what = this.kind === 'v1' ? 'ramp' : 'firing table';
        if (st.rampHp >= 0.99) return this.refuse(`Nothing to repair: the ${what} is sound.`, false);
        if (st.fault) return this.refuse(`${st.fault.text}: decide on the fault first.`, false);
        if (st.doing) return this.refuse(`The crew is busy: ${this.step()?.name.toLowerCase() ?? 'working'}. Repair when the step is done.`, false);
        st.repair = 90;
        st.doing = true;
        sim.radio(`Repairing the ${what} (1:30).`, 'info');
        return true;
      }
      case 'topup':
        if (this.kind !== 'v2') return this.refuse('Only the A4 takes liquid oxygen.', false);
        if (!st.loxOn) return this.refuse('No liquid oxygen in the rocket yet: it goes in last, after the alcohol.', false);
        if (st.lox >= 99) return this.refuse('The oxygen tank is full.', false);
        if (st.doing) return this.refuse(`The crew is busy: ${this.step()?.name.toLowerCase() ?? 'working'}. Top up when the step is done.`, false);
        if (this.firing()) return this.refuse('Too late: the firing has begun.', false);
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
    if (s.set && st.settings[s.set] == null) return false;
    if ((s.id === this.Q.trigger || s.id === 'fire') && st.rampHp < 0.35) return false;
    st.doing = true;
    st.t = 0;
    s.state = 'doing';
    st.pend = this.faultFor(s);
    sim.events.special?.(this.u, 'step', s.id);
    return true;
  }

  fix(how) {
    const sim = this.sim, st = this.u.special, f = st.fault;
    if (!f) return this.refuse('There is no fault to fix.', false);
    if (how === 'fix') {
      st.fault = null;
      st.lowSteam = false;
      st.fixing = f.fixText;
      st.doing = true;
      st.t = -f.cost; // the repair takes this long, then the step is worked again
      sim.radio(`${f.fixText}.`, 'info');
    } else if (how === 'ignore') {
      if (!f.ignorable) return this.refuse(`${f.text}: that cannot be ignored. Fix it (O) or scrub the round (X).`);
      st.fault = null;
      st.risk = (st.risk ?? 0) + f.risk;
      if (f.id === 'pre') st.ragged = true;
      this.complete();
      sim.radio(`Carry on regardless${f.risky ? `: ${f.risky}` : ''}.`, 'warn');
    } else if (how === 'scrub') {
      st.fault = null;
      this.scrub(f.scrubText ?? 'scrubbed');
    } else return false;
    return true;
  }

  scrub(why) {
    const sim = this.sim, st = this.u.special;
    sim.radio(`Abbruch: ${why}. The round is lost.`, 'alert');
    st.flights.push({ n: ++st.n, state: 'scrubbed', text: why, t0: sim.time, at: 0 });
    this.nextRound();
  }

  nextRound() {
    const st = this.u.special, sim = this.sim;
    st.left = Math.max(0, st.left - 1);
    this.u.ammo.he = st.left;
    st.i = 0;
    st.doing = false;
    st.run = false;
    st.risk = 0;
    st.lox = 0;
    st.loxOn = false;
    st.missile = false;
    st.pend = null;
    st.fixing = null;
    st.accept = {};
    st.steamP = 0;
    st.lowSteam = false;
    st.ragged = false;
    st.vorT = null;
    for (const s of st.steps) s.state = 'todo';
    Object.assign(st, { wings: 0, generator: 0, erect: 0, meiller: 0, fuelA: 0, fuelL: 0, onRamp: false, where: 'none' });
    if (st.quick) {
      // the next round comes prepared; the settings stay as laid and the table stays turned
      for (const s of st.steps) if (this.Q.prep.has(s.id)) s.state = 'done';
      st.tableFrom = st.table;
      st.steamP = 0;
      this.nextStep();
    } else if (sim.attract) st.settings = { ...st.solution };
    else if (this.kind === 'v1' && st.left > 0 && !sim.scripted) {
      // the dials stay where they were; a new met report may move the air log's firing data (the wind on the route)
      const w = st.wind;
      this.met(w.from + sim.gauss() * 30, clamp(w.speed + sim.gauss() * 3.5, 1, 18));
      sim.radio(`Wetterbericht: wind on the route from ${st.wind.from} degrees at ${st.wind.speed} m/s. Air log for ${st.solution.range.toFixed(1)} km.`, 'phone');
    }
    if (st.left <= 0) {
      st.done = true;
      this.u.gate = 'no rounds left';
    }
  }

  // the fault a step will end in, rolled when it begins (deterministic per seed); the instruments show it coming
  faultFor(s) {
    const sim = this.sim, st = this.u.special;
    if (sim.attract || sim.scripted) return null; // the lessons teach the drill, not the faults
    const O = this.O, odds = (r) => {
      const a = this.odds(st.risk ?? 0), b = this.odds((st.risk ?? 0) + r);
      return this.kind === 'v1' ? `crash off the ramp ${pc(a.crash)} becomes ${pc(b.crash)}` : `failure ${pc(a.crash + a.fail)} becomes ${pc(b.crash + b.fail)}`;
    };
    if (s.id === 'steam' && sim.rng() < O.steamFault) return { id: 'pressure', text: 'Steam generator: the test pressure is low', fixText: 'Venting and recharging the generator', cost: 45, ignorable: true, risk: 0.45, risky: `a slow launch, ${odds(0.45)}` };
    if (s.id === 'fuel' && sim.rng() < O.leak) return { id: 'leak', text: 'A fuel leak at the tank', fixText: 'Draining and resealing the tank', cost: 30, ignorable: false };
    if (s.id === 'checks' && sim.rng() < O.checkFault) return { id: 'gyro', text: 'Prüfung: a gyro will not run up to speed', fixText: 'Changing the gyro unit', cost: 60, ignorable: true, risk: 0.3, risky: odds(0.3) };
    if (s.id === 'prestage' && sim.rng() < O.preFail) return { id: 'pre', text: 'Vorstufe: the flame is ragged', fixText: 'Shutting down, purging, a new igniter', cost: 120, ignorable: true, risk: 0.5, risky: odds(0.5), scrubText: 'pre-stage failure' };
    return null;
  }

  // the round's odds with a given added risk, as launch() rolls them: crash (the V-1 off the ramp, the A4 on the
  // table), fail (in flight), shot (down on the way, of those that fly)
  odds(risk) {
    const O = this.O;
    if (this.kind === 'v1') {
      const crash = Math.min(1, O.rampCrash + risk), fail = Math.min(1 - crash, O.earlyFail);
      return { crash, fail, shot: O.shotDown };
    }
    const crash = Math.min(1, O.tableBlast + risk * 0.3), fail = Math.min(1 - crash, O.tableBlast + risk + O.flightFail - crash);
    return { crash, fail, shot: 0 };
  }

  complete() {
    const sim = this.sim, st = this.u.special, s = this.step();
    s.state = 'done';
    st.doing = false;
    st.t = 0;
    st.pend = null;
    st.fixing = null;
    sim.events.special?.(this.u, 'done', s.id);
    if (s.id === 'lox') { st.loxOn = true; st.lox = 100; }
    if (s.id === 'steam') st.steamP = st.lowSteam ? STEAM_LOW : STEAM_P;
    if (s.id === 'prestage') st.vorT = sim.time;
    if (s.id === 'fire') return this.launch();
    this.nextStep();
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
    st.alarm = this.alarm();
    if (u.mode === 'auto') { st.run = true; this.auto(); }
    else if (st.quick) this.auto(false);
    else if (st.run && u.mode !== 'hold') this.carryOn();
    if (st.doing && !st.cover) {
      const s = this.step();
      const crew = clamp(u.pieces[0].crew / u.pieces[0].crewMax, 0.35, 1);
      if (st.repair == null && st.topup == null) st.t += dt * crew * (sim.attract ? 2 : 1);
      if (st.repair != null) {
        st.repair -= dt * crew;
        if (st.repair <= 0) { st.repair = null; st.doing = false; st.rampHp = 1; st.rampWarned = false; sim.radio('Repaired.', 'info'); }
      } else if (st.topup != null) {
        st.lox = Math.min(100, st.lox + dt * 0.4);
        st.topup -= dt * crew;
        if (st.topup <= 0) { st.topup = null; st.doing = false; }
      } else if (st.t >= s.dur) {
        const f = st.pend;
        if (f) {
          st.pend = null;
          st.fault = f;
          st.doing = false;
          if (f.id === 'pressure') st.lowSteam = true;
          sim.radio(`${f.text}. Fix it (O), ${f.ignorable ? 'carry on (I) ' : ''}or scrub the round (X).`, 'alert');
        } else this.complete();
      }
    }
    // the Vorstufe burns only a little while: left too long without the Hauptstufe, the crew shuts it down
    if (this.kind === 'v2' && st.vorT != null && !st.doing && !st.fault && this.step()?.id === 'fire' && sim.time - st.vorT > (sim.scripted ? 90 : 25)) {
      st.vorT = null;
      st.steps.find((q) => q.id === 'prestage').state = 'todo';
      st.lox = Math.max(0, st.lox - 2);
      this.nextStep();
      this.refuse('The Vorstufe burned too long without the Hauptstufe: shut down. Light it again (Enter), then the Hauptstufe at once.');
    }
    // the liquid oxygen boils off once it is in (a quick site's tanker keeps it topped up from the firing key on)
    if (st.loxOn && !(st.quick && st.i >= this.triggerI)) st.lox = Math.max(0, st.lox - dt * 0.09);
    this.pose(dt);
    this.holdFor();
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

  // the manual drill: the crew goes on from step to step until it needs the player
  carryOn() {
    const st = this.u.special, s = this.step();
    if (!s || st.doing || st.fault || st.cover || st.done) return;
    if (s.id === this.Q.trigger || s.id === 'fire') return;
    if (s.set && !this.dialled(s.set)) return;
    this.begin();
  }

  // raiders on their way to this site: seconds until they are over it (0 while they are), or null
  alarm() {
    const sim = this.sim, u = this.u;
    const near = (T) => Math.hypot(T.x - u.pos.x, T.z - u.pos.z) < 1500;
    let best = null;
    for (const r of sim.enemyAI.raids ?? []) if (!r.started && near(r.target)) best = Math.min(best ?? 1e9, r.at - sim.time + 60);
    for (const p of sim.aircraft ?? []) if (p.alive && !p.fired && near(p.raid.target)) best = Math.min(best ?? 1e9, p.t < 0 ? 60 : Math.max(0, Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) - 700) / (p.sp || 150));
    for (const s of sim.shells) if (!s.own && s.src === 'air' && s.alive && near(s.aim)) best = 0;
    return best == null ? null : Math.max(0, best);
  }

  // what the drill waits for: 'start' (the step key starts or goes on), 'dial', 'fire', 'repair', 'fault', 'cover',
  // 'done', or null while the crew works (or the auto crew runs it)
  holdFor() {
    const st = this.u.special, s = this.step();
    let h = null;
    if (st.done || !s) h = 'done';
    else if (st.fault) h = 'fault';
    else if (st.cover) h = 'cover';
    else if (st.doing) h = null;
    else if (this.u.mode === 'auto') h = null;
    else if (s.id === this.Q.trigger || s.id === 'fire') h = st.rampHp < 0.35 ? 'repair' : 'fire';
    else if (st.quick) h = null;
    else if (s.set && st.settings[s.set] == null) h = 'dial';
    else if (!st.run || this.u.mode === 'hold') h = 'start';
    else if (s.set && !this.dialled(s.set)) h = 'dial';
    st.hold = h;
  }

  // what the site's model shows (read by the render layer) and the console's instruments (`gauges`)
  pose(dt) {
    const st = this.u.special, s = this.step(), id = s?.id, busy = st.repair != null || st.topup != null;
    // a step that ended in a fault stands as it was when the crew stopped (its gauges show the trouble)
    const k = st.fault ? 1 : st.doing && s && !busy ? clamp(st.t / s.dur, 0, 1) : 0;
    const done = (x) => st.steps.find((q) => q.id === x)?.state === 'done';
    const now = (x) => id === x && ((st.doing && !busy) || !!st.fault);
    const pend = st.fault?.id ?? (st.doing ? st.pend?.id : null), g = st.gauges;
    if (st.oddsRisk !== (st.risk ?? 0)) { st.oddsRisk = st.risk ?? 0; st.odds = this.odds(st.oddsRisk); }
    if (this.kind === 'v1') {
      st.where = done('ramp') ? 'ramp' : done('bring') || id === 'bring' ? 'trolley' : 'none';
      st.wings = done('wings') ? 1 : id === 'wings' ? k : 0;
      st.generator = done('steam') ? 1 : id === 'steam' ? Math.min(1, k * 3) : 0;
      st.missile = st.where !== 'none';
      // petrol (litres) and the air bottles (bar) during the fuelling; a leak shows as the level falling back
      const kf = now('fuel') ? k : done('fuel') ? 1 : 0;
      g.fuel = 570 * (pend === 'leak' && kf > 0.65 ? 0.65 - (kf - 0.65) * 0.8 : kf);
      g.air = 150 * clamp(kf * 1.6 - 0.6, 0, 1);
      // the generator: its charge, then the test pressure (a low one stops short of the red line)
      const ks = now('steam') ? k : done('steam') ? 1 : 0;
      g.charge = clamp(ks * 1.5, 0, 1);
      g.steam = done('steam') || this.firing() ? st.steamP : now('steam') ? (pend === 'pressure' ? STEAM_LOW : STEAM_P) * clamp(ks * 2.5 - 1.5, 0, 1) : 0;
      g.steamMin = 50;
      g.testing = now('steam') && !st.fault && g.steam > 0;
      g.rampV = g.steam > 0 && !g.testing ? Math.round(RAMP_KMH * Math.sqrt(g.steam / STEAM_P)) : null;
      // the pulse jet runs for the last seconds of the firing step
      st.jet = now('fire') ? clamp(st.t / 1.2, 0, 1) : 0;
      g.jet = st.jet;
      g.speed = st.lastV ?? null;
    } else {
      st.erect = done('erect') ? 1 : id === 'erect' ? k : 0;
      st.meiller = done('withdraw') ? 1 : id === 'withdraw' ? k : 0;
      st.fuelA = done('alcohol') ? 1 : id === 'alcohol' ? k : 0;
      st.fuelL = st.loxOn ? st.lox / 100 : id === 'lox' ? k : 0;
      st.missile = st.steps[0].state !== 'todo' || st.erect > 0;
      const tb = this.u.zero;
      const want = st.settings.compass != null ? st.settings.compass * DEG : tb;
      // from where the table stands (0, or the last lay on a quick site) to the new line
      const to = angDiff(want / DEG, tb / DEG) * DEG, from = st.tableFrom ?? 0;
      st.table = done('align') ? to : id === 'align' ? from + (to - from) * k : from;
      g.alc = 3.8 * st.fuelA;
      g.tz = done('tstoff') ? 1 : now('tstoff') ? k : 0;
      g.lox = 4.9 * st.fuelL;
      g.loxPct = st.loxOn ? st.lox : now('lox') ? k * 100 : 0;
      g.loxShort = 92;
      // the gyros spin up in the checks (a faulty one stalls at three quarters), and run on until the launch
      const kc = now('checks') ? k : done('checks') ? 1 : 0;
      g.gyro = pend === 'gyro' ? Math.min(0.72, kc * 1.6) + Math.sin(kc * 60) * 0.02 * (kc > 0.4) : clamp(kc * 1.6, 0, 1);
      g.table = wrapDeg((tb + st.table) / DEG);
      const r = st.settings.range;
      g.cutoff = r ? Math.round(Math.sqrt(G * r * 1000)) : null;
      // the flame: the Vorstufe's steady 8 t (ragged when it will fault), the Hauptstufe's 25 t
      // the Vorstufe burns from its step until the Hauptstufe (ragged if the crew carried on with a ragged one)
      const vor = done('prestage') && !done('fire');
      g.flame = now('fire') ? 2 : now('prestage') && st.doing ? (pend === 'pre' && k > 0.3 ? 0.5 : 1) : vor && !st.fault ? (st.ragged ? 0.5 : 1) : 0;
      st.flame = g.flame === 2 ? 2 : g.flame ? 1 : 0;
      const tf = now('prestage') ? st.t : 6;
      g.thrust = g.flame === 2 ? 25 * clamp(st.t / 1.5, 0.3, 1) : g.flame ? 8 * clamp(tf / 1.5, 0, 1) * (g.flame === 0.5 ? 0.75 + Math.sin(this.sim.time * 40) * 0.2 : 1) : 0;
    }
  }

  // the auto crew works the whole drill and fires; on a quick site in manual mode (fire = false) the crew reloads,
  // lays, fixes and takes cover by itself but waits for the player's firing key, and leaves a cover the player took
  auto(fire = true) {
    const st = this.u.special, s = this.step(), sim = this.sim, u = this.u, mode = u.mode;
    if (st.done) return;
    // take cover when the raiders are close, back to work when they have gone (the step waits meanwhile); a quick
    // site shares the map with the battle's raids, so only those on itself count
    const near = (T) => !st.quick || Math.hypot(T.x - u.pos.x, T.z - u.pos.z) < 1500;
    const threat = sim.enemyAI.raids?.some((r) => r.at - sim.time < 15 && near(r.target)) || sim.aircraft?.some((p) => p.alive && near(p.raid.target));
    if (st.cover && !threat) { if (fire || st.crewCover) st.cover = st.crewCover = false; }
    else if (!st.cover && threat) { st.cover = true; st.crewCover = true; return; }
    if (st.doing || st.cover) return;
    if (st.fault) return this.fix('fix');
    if (s?.set && !this.dialled(s.set)) {
      // the auto crew's settings: right within a little (and it goes on with what it set)
      const e = this.sim.gauss();
      st.settings[s.set] = s.set === 'compass' ? Math.round((st.solution.compass + e * 0.3) * 10) / 10 : Math.round((st.solution.range * (1 + e * 0.01)) * 10) / 10;
      st.accept[s.set] = true;
    }
    if (st.rampHp < 0.35) { this.command('repair', {}); u.mode = mode; return; }
    if (this.kind === 'v2' && st.loxOn && st.lox < 93 && s?.id !== 'fire') { this.command('topup', {}); u.mode = mode; return; }
    if (!fire && s?.id === this.Q.trigger) return;
    this.begin();
  }

  launch() {
    const sim = this.sim, u = this.u, st = u.special;
    const n = ++st.n;
    const T = st.target;
    // the errors of the drill: the compass or table against the true bearing, the range setting against the solution
    const bErr = angDiff(st.settings.compass ?? st.solution.compass, st.solution.compass);
    const rErr = (st.settings.range ?? st.solution.range) / st.solution.range - 1;
    const lox = this.kind === 'v2' ? st.lox : 100;
    const short = this.kind === 'v2' && lox < 92 ? (92 - lox) * 0.03 : 0;
    const O = this.O;
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
    // where on the way it ends: the target (1), the defences near the far end, a failure anywhere
    const at = shot ? 0.62 + sim.rng() * 0.33 : fate === 'fail' ? 0.08 + sim.rng() * 0.7 : fate === 'flying' ? 1 : 0;
    // the V-1 leaves the ramp at a speed set by the steam pressure (a low one is the slow launch that risks the crash)
    const p0 = this.kind === 'v1' ? (st.steamP || STEAM_P) : 0;
    const v0 = this.kind === 'v1' ? 108 * Math.sqrt(p0 / STEAM_P) : 2;
    if (this.kind === 'v1') st.lastV = Math.round(RAMP_KMH * Math.sqrt(p0 / STEAM_P));
    const f = { n, t0: sim.time, eta, at, fate, shot, miss, bErr, rErr, short, along: dist - T.dist, lat, lox, v: st.lastV ?? null, state: 'flying', text: '' };
    st.flights.push(f);
    // the flight object on the map
    const p = u.pieces[0], b = (u.zero + (st.settings.compass != null ? angDiff(st.settings.compass, u.zero / DEG) * DEG : 0));
    const top = this.kind === 'v1' ? 46 : 0;
    const x0 = p.pos.x + Math.sin(u.zero) * top, z0 = p.pos.z - Math.cos(u.zero) * top;
    const y0 = sim.heightAt(p.pos.x, p.pos.z) + (this.kind === 'v1' ? 5.5 : 14);
    const el = this.kind === 'v1' ? 6 * DEG : 90 * DEG;
    const m = {
      id: sim.nextId('s'), own: true, guided: true, unitId: u.id, piece: 0, kind: this.kind, calibre: this.kind === 'v1' ? 22 : 26,
      pos: { x: x0, y: y0, z: z0 }, prev: { x: x0, y: y0, z: z0 },
      vel: { x: Math.sin(b) * Math.cos(el) * v0, y: Math.sin(el) * v0, z: -Math.cos(b) * Math.cos(el) * v0 },
      fuze: 'instant', t: 0, t0: sim.time, tof: 0, aim: { x: x0, z: z0 }, alive: true, flight: f, bearing: b, engineOff: false, v0,
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
    sim.radio(this.kind === 'v1' ? `Abschuß! Flying bomb no. ${n} is off the ramp at ${st.lastV} km/h.` : `Hauptstufe! A4 no. ${n} lifts off.`, 'kill');
    if (!sim.attract) sim.score.points += 40; // the drill done
    st.lowSteam = false;
    this.nextRound();
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
        const want = Math.min(178, (m.v0 ?? 108) + m.t * 1.6);
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
        m.flight.endT = sim.time;
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
      // settled when it gets where it ends: the target area at the end of the flight, the defences or a failure on the way
      if (f.state !== 'flying' || sim.time < f.t0 + (f.eta - f.t0) * (f.at ?? 1)) continue;
      const O = this.O;
      if (f.fate === 'crash' || f.fate === 'blast') continue;
      f.endT = sim.time;
      const km = (f.eta - f.t0) > 0 ? Math.round(f.at * st.target.dist / 1000) : 0;
      if (f.fate === 'fail') { f.state = 'failed in flight'; f.text = `Lost in flight after about ${km} km (a fault).`; }
      else if (f.shot) { f.state = 'shot down'; f.text = `Brought down by the anti-aircraft belt or fighters ${Math.round(st.target.dist / 1000) - km} km short of the target.`; }
      else if (f.miss <= O.area) { f.state = 'target area'; f.text = `Reached the target area, ${(f.miss / 1000).toFixed(1)} km from the aiming point.`; if (!sim.attract) sim.score.points += 100; }
      else { f.state = 'missed'; f.text = `Fell ${(f.miss / 1000).toFixed(0)} km from the aiming point, outside the target area.`; }
      sim.radio(`Report on no. ${f.n}: ${f.text}`, f.state === 'target area' ? 'kill' : 'warn');
      sim.events.special?.(this.u, 'result', f);
    }
    // the mission ends when every round is spent and every flight is settled
    if (st.done && !st.ended && st.flights.every((f) => f.state !== 'flying') && !sim.attract && !sim.theatre.campaign && sim.theatre.op.kind === this.kind) {
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
      st.crewHurt++;
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
    // the player in person at a gun (gunner.js): sim/guns.js hands it the manned piece's steps
    this.gunner = sim.gunner = new Gunner(sim);
  }

  reset() {
    const sim = this.sim;
    this.gunner.reset();
    for (const u of sim.units) for (const p of u.pieces) p.manned = false;
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
    this.gunner.check();
  }

  command(u, name, args) {
    if (GUNNER_CMDS.has(name)) return this.gunner.command(u, name, args ?? {});
    return this.of(u)?.command(name, args ?? {}) ?? false;
  }

  onEnemyBurst(s, pos) {
    for (const c of this.ctl) c.onEnemyBurst?.(s, pos);
  }
}

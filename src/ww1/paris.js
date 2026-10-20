// The Paris-Geschütz's controller (the WW1 mode's special 'paris', registered in special.js), in its own mission
// (ops.js 'paris'), built like the WW2 Gustav's and V-weapons' (src/ww2/special.js). First the Stellungsbau: the gun is
// put together on its prepared concrete bed by the work gangs the player sends to the tasks (TASKS; AUTO, or ALL HANDS,
// lets the gangs organise themselves). Then, once it stands, the Feuerablauf for every round (DRILL): gauge the bore and
// set the charge for its wear, the Rechenstelle's firing data (the Earth's turning, the wind aloft), the load (the gun's
// own loading cycle, GUNS.paris.load: down to 0 degrees, Granate Nr. N up on the crane and rammed, the charges, the
// breech, up to the firing elevation and laid) and the firing key. The procedure behind it is the game: the numbered
// shells of the barrel's set, the charge raised with the bore's wear, the line corrected for the Earth's turning and
// the day's wind aloft, the agents' fall reports, the barrel change after about 65 rounds. The Armee's orders on the
// military targets off the map come once the gun stands; the mission ends when they are settled. The controller sets
// each shot's velocity and line, flies the shell up out of the map and reports where it fell. Node-safe,
// deterministic per seed (sim.rng).
//
// unit.special (kind 'paris'):
//   ready                                                the gun stands (the Stellungsbau is done)
//   gangs, allHands, tasks: [{ id, name, de, work, needs, max, optional, done, gangs, state }]
//            the Stellungsbau (TASKS): `gangs` work gangs; a task with gangs on it moves `gangs` work a second (less with
//            the crew short, none while the crew is in cover) once the tasks it `needs` are done; state 'todo' | 'doing'
//            | 'paused' | 'done'. allHands: the commander's ALL HANDS (the gangs kept on the critical path)
//   stage: { bed, frame, barrel, truss, ammo, met, camo } 0..1 each task's progress (the render layer's picture)
//   flak, spoil, hide                                    the site against the raiders (enemy.js huntUpdate): before
//                                                        and after its camouflage and flak (EXPOSED, HIDDEN)
//   steps: [{ id, name, de, dur, set, crew, state }], i, t, doing, run
//            the Feuerablauf (DRILL) and where it stands: the step in hand, its seconds done, whether the crew works it,
//            and whether the round is under way (the next round waits for the step key, or the auto crew)
//   hold     what the drill waits for: 'setup', 'start' (the step key starts the round), 'dial' (a setting not yet
//            matched: the charge to the gauge, the firing data to the latest Wettermeldung; the step key goes on as
//            set), 'fire' (the firing key), 'fault' (O fix, I carry on), 'blocked' (the order cannot load: guns.problem),
//            'barrel', 'done', 'dead', or null while the crew works
//   fault, pend, fixing, accept, risk, refused
//            a fault rolled when the load begins (pend) and reported when it ends (fault: FAULTS); fixing the fix under
//            way (st.t counts up from -cost); accept { charge, data } the settings taken as set this round; risk
//            { seal, droop } the faults carried on into this round's shot; refused { text, t } the last order refused
//   dataT    sim time the firing data were last laid (table, corrections, a report, a new target): they count as laid
//            for the drill when no Wettermeldung is newer
//   cover    the crew is in cover from raiders (the gun cannot fire or start a load, the work stops)
//   targets: [{ id, name, en, dist (m), bearing (rad), x, z, effect, tip, cut, hits, near, fx, held }]
//            the off-map targets (op.paris.targets); effect 'supply' | 'attack' | 'air' | 'tanks' is what a round in the
//            area does: fx (0..FX_MAX) the first three's strength now (FX a round, wearing off over FX_T), held the
//            seconds the tank park's rounds have added to the laager missions (the battle's effects; the mission's
//            aerodrome keeps 'air': fewer raids on the gun)
//   target: one of targets                               the one the gun is laid on (switched by 'aim' { id })
//   orders: [{ id, target, need, got, t0, due, state: 'open' | 'done' | 'failed', why, tEnd }]
//            the Armee's orders (op.paris.orders, timed from the moment the gun stands): `need` rounds in the area of
//            `target` by sim time `due`; a round fired before the due time still counts when its report comes in.
//            ordersDone, ordersFailed: counts
//   barrel: { n, fired, life, state: 'ok' | 'changing', t, dur, calib }
//            n: barrel number (the mission opens on barrel 3 with 55 to 59 rounds through it, so the change falls
//            inside the mission), fired: rounds from it (an overcharge counts extra), life: 65 (past it the shot gets
//            wild and the barrel may burst), t: seconds of the change done, dur: BARREL_DUR; calib is hidden (the
//            barrel's own velocity error, which only the fall reports reveal: the console must not show it)
//   wear: 0..1+                                          fired / life (the bore wear the gauging shows)
//   shell: { no, cal }                                   the next shell: its number in the barrel's set (1 to 65)
//                                                        and its calibre in cm (each shell fatter, 21.0 to 23.2)
//   charge: { set, need, base, step }                    kg of powder: set is what goes in, need what the gauged
//                                                        bore needs for the table's 1,640 m/s now (rises
//                                                        CHARGE_PER_ROUND a round); step the console's key step
//   corr: { line, range }                                the corrections laid on the gun: line in Strich (6400 to
//                                                        the circle, + right), range in m (+ add / weiter)
//   taught: { line, range }                              what the fall reports have taught about this barrel (the
//                                                        'table' command lays the table plus this)
//   met: { bearing, speed, t, along, cross }             the latest Wettermeldung of the wind aloft (bearing it
//                                                        blows from, m/s, issued at sim time t; along (+ toward the
//                                                        target) and cross (+ to the right) components); none until
//                                                        the weather station stands
//   table: { earth, windLine, windRange, line, range }   what the firing table gives for today: earth (Strich, the
//                                                        Earth's turning, a constant of the shot, negative = left),
//                                                        the wind corrections from the latest telegram, and their
//                                                        sums line (Strich) and range (m)
//   flights: [{ n, shellNo, barrel, t0, eta, tof, apex, state, target, along, lat, miss, result, text, km, charge, need, corr }]
//            n: round number of the day, state 'flying' | 'fallen' | 'burst' (the barrel burst), target: the id it was
//            laid on, along: m over (+) or short (-) of it, lat: m right (+) or left (-), miss: m from the aiming point,
//            result 'area' (miss <= AREA) | 'near' (<= NEAR) | 'wide' once fallen, text: the report; eta: sim time the
//            report arrives (the true flight is about 200 s; the report comes after REPORT_K of it, compressed);
//            corr: the corrections it was fired with (nextFall moves its fall by what changed since)
//   last: the latest settled flight (or null)            the console's advice; command 'report' applies it
//   hits, near: counts of shells in a target's area (miss <= AREA) and near one (<= NEAR), every target together
// Commands (sim.command(unitId, name, args)); the player's take the gun off auto (but 'hurry' and 'barrel'):
//   'gang' { task, d }           one gang more (d 1) or less (d -1) on a task (a free one, else off the busiest)
//   'hurry' {}                   ALL HANDS: every gang on the critical path, kept there as tasks finish
//   'step' {}                    the drill's key: start the round, go on with a setting as set, or fire
//   'fix' { how: 'fix' | 'ignore' }   a fault: fix it (the crew's time) or carry on at its risk
//   'powder' { kg } or { add }   set the charge, or raise / lower it by `add` kg (clamped 150 to 260)
//   'pcorr' { line, range } or { addLine, addRange }   set or change the corrections (Strich, m)
//   'table' {}                   lay the firing table's corrections for today plus what the reports have taught
//   'report' {}                  correct by the latest fall report: the whole correction, counted from the data that
//                                round was fired with (a report that comes in after a correction is not laid twice)
//   'aim' { id? }                lay on target `id`, or on the current one again (after a lay elsewhere on the board).
//                                The corrections carry over: what the reports taught about the barrel stays, the
//                                firing table's wind part is relaid for the new line
//   'barrel' {}                  change the barrel (BARREL_DUR s; the gun cannot fire meanwhile, the round starts over)
//   and the normal 'fire' (the firing key: only at the drill's firing step).
// While the drill is not at its load or its firing key, `unit.gate` holds the gun (guns.js starts no load and fires
// nothing) and names why; at the load the gate opens and guns.js runs the loading cycle, `u.stowed`-free, to the lay.
// Render hints: stage, ready; the flying shell is in sim.shells with `guided: true, kind: 'paris', paris: true`,
// flown by the controller until it leaves the map (40 km out or 60 km up), then alive = false; sim.events.special(u,
// 'launch', shell) when it leaves the muzzle, (u, 'result', flight) when the report comes, (u, 'barrel', special) when
// a change starts, (u, 'ready') when the gun stands and when a change ends, (u, 'step' | 'done', id) for the drill.
import { DEG } from '../sector.js';
import { GUNS } from '../sim/tables.js';
import { shellK, stepBallistic, flyPlane } from '../sim/shells.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STRICH = (2 * Math.PI) / 6400;
const OMEGA = 7.292e-5, LAT = 50.5 * DEG; // the Earth's turning; the latitude of the map
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s)) % 60).padStart(2, '0')}`;
export const BARREL_LIFE = 65;
export const BARREL_DUR = 420; // a day's work with the crane and the spare barrel, compressed to 7 minutes
export const CHARGE_BASE = 180; // kg, a new barrel
export const CHARGE_PER_ROUND = 0.55; // kg more for every round the bore has worn
export const REPORT_K = 0.6; // the report comes after 0.6 of the flight time (about two minutes)
export const AREA = 400, NEAR = 1000; // m from the aiming point: in the target's area, near it
// the shot's random spread in muzzle velocity (one sigma; about 360 m in range at 120 km): small enough that a gun laid
// well (the charge to the gauge, the day's data, the barrel's own error learnt from the reports) puts most rounds in
// a target's area; the barrel's own error is larger (0.0025, hidden, learnt only from the reports)
export const SPREAD = 0.0015;
// a round in the area of a target with an `effect` 'supply' | 'attack' | 'air': FX more of it, up to FX_MAX, wearing off
// over FX_T; 'tanks': each open laager mission gets TANK_HOLD s more. The British battle's effects (the junction, the
// camp, the tank park) need the Paris Gun in the battle, which no op has now; its mission keeps the aerodrome's (fewer
// raids on the gun, enemy.js)
// Where the next round should fall from the target of flight f, on the data laid now: f's fall moved by what the
// corrections have changed since it was fired (f.corr). The console's advice, the map's inset and the 'report'
// command read it; null for a flight with no fall.
export function nextFall(st, f) {
  if (!f || f.state !== 'fallen') return null;
  const c = f.corr ?? st.corr, T = st.targets?.find((t) => t.id === f.target) ?? st.target;
  return { along: f.along + st.corr.range - c.range, lat: f.lat + Math.tan((st.corr.line - c.line) * STRICH) * T.dist };
}

// the correction that brings a round falling at q (nextFall) onto its target: range in metres, line in Strich, and
// the words for it ('' when the aim is good: within half the area)
export function correction(st, q) {
  const dist = st.target?.dist || 120000;
  const range = -Math.round(q.along / 10) * 10, line = +(-Math.atan(q.lat / dist) / STRICH).toFixed(1);
  if (Math.hypot(q.along, q.lat) <= AREA / 2) return { range, line, text: '' };
  const parts = [];
  if (Math.abs(range) >= 50) parts.push(`ENTFERNUNG ${range > 0 ? '+' : '−'}${Math.abs(range)} m (${range > 0 ? 'further' : 'shorter'})`);
  if (Math.abs(line) >= 0.3) parts.push(`SEITE ${line > 0 ? '+' : '−'}${Math.abs(line).toFixed(1)} Strich (${line > 0 ? 'right' : 'left'})`);
  return { range, line, text: parts.join(', ') };
}

export const FX = 0.15, FX_MAX = 0.45, FX_T = 600, TANK_HOLD = 150;
// the share of the Armee's orders the mission must carry out: 4 of 5 (tools/ww1test.mjs --op paris on 72 seeds: the
// auto crew wins 25, 6 and 1 on Easy, Normal and Hard, a scripted competent player 59, 49 and 10)
export const WIN = 0.8;
// Fliegeralarm: while raiders run in on the gun (within COVER_R of it) or their bombs fall, the crew is in cover
export const COVER_R = 2500, COVER_GATE = 'Fliegeralarm: the crew is in cover';
const FX_TEXT = {
  supply: 'Their ammunition trains are held up: their batteries fire slower.',
  attack: 'Their reserves are held up: their next attacks come thinner.',
  air: 'Their aerodrome is out of action for a while: fewer machines over us.',
};
const OPEN = (m) => m.state !== 'done' && m.state !== 'failed';

// The Stellungsbau: the gun and its position arrive by rail on an empty site (only the spur, the portal crane and the
// timber stacks stand); the gangs lay the concrete bed with the turntable and racer, throw up the earth bank, put the
// gun together on the bed, lay the field railway and bring up the ammunition train, build the weather station and the
// Rechenstelle, and (if there is time) camouflage the site and dig in the flak posts. Each task's work shows on the
// site (buildParisSite setStage, the render's stage). Work is gang-seconds: three gangs on everything take about four
// minutes; the critical path (bed, frame, barrel, truss) a little over three with its full gangs. `tip` is the
// console's English on hover.
export const TASKS = [
  { id: 'bed', name: 'Concrete bed, turntable and racer', de: 'Bettung', work: 110, needs: [], max: 2,
    tip: 'Pour the concrete bed and bolt down the turntable under the gun\'s front and the curved racer its rear rolls on. Everything else on the gun stands on it.' },
  { id: 'bank', name: 'Earth bank and screens', de: 'Erdwall', work: 90, needs: [], max: 2,
    tip: 'Throw up the earth bank round the left and the rear and the brushwood screens on the right: the position is not finished without them.' },
  { id: 'frame', name: 'Run in the firing frame', de: 'Schießgerüst einfahren', work: 80, needs: ['bed'], max: 2,
    tip: 'Roll the steel firing frame in on its rails and seat it on the turntable. Needs the bed.' },
  { id: 'barrel', name: 'Lower in the barrel', de: 'Rohr einlegen (Portalkran)', work: 200, needs: ['frame'], max: 3,
    tip: 'The portal crane lifts the 34 m barrel off its wagon and lowers it into the cradle on the frame. The longest job: put three gangs on it. Needs the frame.' },
  { id: 'truss', name: 'Rig the truss, take out the droop', de: 'Stützgerüst spannen', work: 70, needs: ['barrel'], max: 2,
    tip: 'Rig the king post and stays over the barrel and tension them until the long barrel no longer droops. Needs the barrel. When it is done (and the bank, the railway and the weather station) the gun stands.' },
  { id: 'ammo', name: 'Field railway and ammunition', de: 'Feldbahn, Munitionszug', work: 110, needs: [], max: 2,
    tip: 'Lay the 60 cm field railway round the gun, build the charge bunker and bring the ammunition train with the numbered shells up the spur.' },
  { id: 'met', name: 'Weather station and Rechenstelle', de: 'Wetterwarte, Rechenstelle', work: 70, needs: [], max: 1,
    tip: 'The weather mast and the theodolite that follows the pilot balloons, and the hut where the firing data are worked out. When it is done the Wettermeldungen (wind aloft) begin.' },
  { id: 'camo', name: 'Camouflage nets and flak posts', de: 'Tarnung und Flak', work: 80, needs: [], max: 2, optional: true,
    tip: 'Optional: the net over the gun and two anti-aircraft machine-gun posts. The British Camels come half as often, scatter their bombs wider and lose more machines.' },
];
export const GANGS = 3;
const NEEDED = TASKS.filter((t) => !t.optional).map((t) => t.id);
const PRIORITY = ['bed', 'frame', 'barrel', 'truss', 'met', 'ammo', 'bank', 'camo']; // the critical path first
// the site against the raiders before and after its camouflage and flak: a raider's chance of being shot down, the
// scatter of their bombs (below 0 tighter than a field battery's), the time between raids (times)
const EXPOSED = { flak: 0.05, spoil: -0.4, hide: 1 }, HIDDEN = { flak: 0.3, spoil: 0, hide: 1.5 };

// The Feuerablauf, one round: `set` is the setting the step waits for once its work is done ('charge': the charge set
// to the gauge within CHARGE_TOL; 'data': the firing data laid since the latest Wettermeldung); the load has no time of
// its own (the gun's loading cycle, about two minutes), the firing key none. `crew` is what the console says they do.
export const DRILL = [
  { id: 'gauge', name: 'Gauge the bore, set the charge', de: 'Rohr vermessen, Ladung', dur: 20, set: 'charge', crew: 'The star gauge goes down the bore: the wear gives the charge',
    tip: 'Every round wears the bore, so the next shell needs more powder. The crew measures the bore (20 s); then the charge (LADUNG on the firing data card) must match the gauge to within half a kilo: Q and E, or Enter to go on with the charge as it is.' },
  { id: 'data', name: 'Firing data from the Rechenstelle', de: 'Schußwerte', dur: 20, set: 'data', crew: 'The Earth\'s turning and the wind aloft worked into the line and the range',
    tip: 'The computing office works the Earth\'s turning and the latest wind report into the line (SEITE) and the range (ENTFERNUNG) corrections (20 s). If a new Wettermeldung came in, lay the data again: T lays the table (with what the fall reports taught), or Enter goes on as laid.' },
  { id: 'load', name: 'Load and lay', de: 'Laden und Richten', dur: 0, crew: 'Barrel down; the shell up on the crane and rammed; the charges; the breech; up to the elevation',
    tip: 'The crew loads (about two minutes): the barrel down to the loading angle, the numbered shell lifted by the crane and rammed, the powder charges, the breech closed, then the barrel raised to about 52 degrees and laid on the target.' },
  { id: 'fire', name: 'Fire', de: 'Feuer', dur: 0, crew: 'Everyone clear of the breech: the firing key',
    tip: 'The gun is loaded and laid: Enter or Space fires. The shell takes about three minutes to reach the target; the agents report where it fell about two minutes after the shot.' },
];
export const CHARGE_TOL = 0.5; // kg
// the auto crew's pace: seconds it takes over each decision of the drill, and before it starts the next round
export const AUTO_PAUSE = [5, 25], AUTO_NEXT = [30, 90];
// a fault is rolled when the load begins and reported when it ends (none in the attract demonstration or on the
// scripted range): fix it (the crew's time) or carry on at its risk to this round's shot
export const FAULTS = [
  { id: 'seal', p: 0.08, text: 'The breech will not seal: the obturator pad is cut', fixText: 'Changing the obturator pad', cost: 40, risky: 'gas past the shell, it falls a kilometre or two short' },
  { id: 'droop', p: 0.08, text: 'The truss has slackened: the barrel droops', fixText: 'Re-tensioning the truss', cost: 50, risky: 'the shot goes wild, three times the spread' },
];

export class ParisCtl {
  constructor(sim, u) {
    this.sim = sim;
    this.u = u;
    this.k = shellK('paris');
  }

  reset() {
    const sim = this.sim, u = this.u, op = sim.theatre.op;
    const P = op.paris ?? { targets: [{ id: 'J', name: 'Bahnknoten', en: 'the railway junction', dist: 120000, bearing: u.zero }], orders: [] };
    const targets = P.targets.map((T) => ({
      ...T, x: u.pos.x + Math.sin(T.bearing) * T.dist, z: u.pos.z - Math.cos(T.bearing) * T.dist, hits: 0, near: 0, fx: 0, held: 0,
    }));
    // the orders to come, timed from the moment the gun stands (none in the attract demonstration or on the scripted
    // range)
    this.plan = sim.attract || sim.scripted ? [] : P.orders.map(([at, target, need, min, why]) => ({ at, target, need, min, why })).sort((a, b) => a.at - b.at);
    this.nOrder = 0;
    this.ended = false;
    this.readyAt = null;
    u.special = {
      kind: 'paris', ready: false, gangs: GANGS, allHands: false,
      tasks: TASKS.map((d) => ({ ...d, done: 0, gangs: 0, state: 'todo' })),
      stage: Object.fromEntries(TASKS.map((t) => [t.id, 0])), ...EXPOSED,
      steps: DRILL.map((s) => ({ ...s, state: 'todo' })), i: 0, t: 0, doing: false, run: false, hold: 'setup',
      fault: null, pend: null, fixing: null, accept: {}, risk: {}, refused: null, dataT: -1, cover: false,
      targets, target: targets[0], orders: [], ordersDone: 0, ordersFailed: 0,
      // the mission opens on a barrel already well worn (the third of the gun's barrels, 55 to 59 rounds through it),
      // so its change falls inside the mission
      barrel: { n: 3, fired: 55 + Math.floor(sim.rng() * 5), life: BARREL_LIFE, state: 'ok', t: 0, dur: BARREL_DUR, calib: sim.gauss() * 0.0025 },
      wear: 0, shell: { no: 1, cal: 21.0 },
      charge: { set: CHARGE_BASE, need: CHARGE_BASE, base: CHARGE_BASE, step: 0.5 },
      corr: { line: 0, range: 0 }, taught: { line: 0, range: 0 },
      met: null, table: null, flights: [], last: null, hits: 0, near: 0, n: 0, nextAuto: 0,
    };
    const st = u.special;
    // the wind aloft: the true wind wanders; once the weather station stands a telegram every 10 minutes gives what it was
    const wb = sim.wind.bearing + sim.gauss() * 25 * DEG, ws = 8 + sim.rng() * 14;
    this.wind = { bearing: wb, speed: ws };
    this.nextMet = Infinity;
    // in its own mission the player sets the gun up and works it (A hands it to the crew); a set-up gun (`ready` in its
    // definition), the attract demonstration and the scripted range start with it standing
    if (op.kind !== 'battle' && !sim.attract) u.mode = 'manual';
    this.wearUpdate();
    st.charge.set = st.charge.need;
    this.tableUpdate();
    if (u.def.ready || sim.attract || sim.scripted) this.finishAll();
    // the gun is put together at its loading elevation and raised only once it stands
    for (const p of u.pieces) { p.fixed = !st.ready; if (p.fixed) p.el = GUNS[p.kind].loadEl ?? 0; }
    this.aim();
    this.drillHold();
    this.gate();
  }

  // ------------------------------------------------------------------ the Stellungsbau
  finishAll() {
    const st = this.u.special;
    for (const t of st.tasks) { t.done = t.work; t.state = 'done'; t.gangs = 0; st.stage[t.id] = 1; }
    Object.assign(st, HIDDEN);
    this.stood(true);
  }

  // the gun stands: it may be raised and laid, and the Armee's orders count from now
  stood(quiet = false) {
    const sim = this.sim, u = this.u, st = u.special;
    st.ready = true;
    st.allHands = false;
    this.readyAt = sim.time;
    for (const p of u.pieces) p.fixed = false;
    if (!st.met) this.telegram(quiet);
    if (u.order.target) sim.guns.recompute(u);
    if (quiet) return;
    sim.radio('Wilhelm: the gun stands on its bed. Feuerbereit; the Armee\'s orders will follow.', 'kill');
    sim.events.special?.(u, 'ready');
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

  gang(id, d) {
    const st = this.u.special, t = this.task(id);
    if (!t) return false;
    if (d > 0) {
      if (t.state === 'done') return this.refuse(`${t.name}: already done.`, false);
      if (!this.can(t)) return this.refuse(`${t.name} waits for ${t.needs.filter((n) => this.task(n).state !== 'done').map((n) => this.task(n).name.toLowerCase()).join(' and ')}.`, false);
      if (t.gangs >= t.max) return this.refuse(`${t.name}: no room for more than ${t.max} ${t.max === 1 ? 'gang' : 'gangs'}.`, false);
      if (this.free() <= 0) {
        // take a gang off the task with the most
        const from = st.tasks.filter((q) => q !== t && q.gangs > 0).sort((p, q) => q.gangs - p.gangs)[0];
        if (!from) return false;
        from.gangs--;
      }
      t.gangs++;
    } else if (t.gangs > 0) t.gangs--;
    else return false;
    st.allHands = false;
    return true;
  }

  autoAssign(force = false) {
    const st = this.u.special;
    if (!force && this.free() <= 0 && st.tasks.every((t) => t.gangs === 0 || this.can(t))) return;
    for (const t of st.tasks) if (force || !this.can(t)) t.gangs = 0;
    for (const id of PRIORITY) {
      const t = this.task(id);
      while (this.free() > 0 && this.can(t) && t.gangs < t.max) t.gangs++;
    }
  }

  // the gangs at work: a task with no work left frees its gangs; one that cannot start yet has none
  works(dt) {
    const sim = this.sim, u = this.u, st = u.special;
    if (st.tasks.every((t) => t.state === 'done')) return;
    if (u.mode === 'auto' || st.allHands) this.autoAssign();
    const crew = st.cover ? 0 : clamp(u.pieces[0].crew / u.pieces[0].crewMax, 0.4, 1) * (sim.attract ? 2 : 1);
    for (const t of st.tasks) {
      if (t.state === 'done') continue;
      if (!this.can(t)) { t.gangs = 0; continue; }
      t.state = t.gangs > 0 ? 'doing' : t.done > 0 ? 'paused' : 'todo';
      t.done = Math.min(t.work, t.done + t.gangs * dt * crew);
      if (t.done >= t.work) {
        t.state = 'done';
        t.gangs = 0;
        sim.radio(`Wilhelm: ${t.name.toLowerCase()}: done.`, 'info');
        if (t.id === 'met') this.nextMet = sim.time;
        if (t.id === 'camo') Object.assign(st, HIDDEN);
      }
      st.stage[t.id] = t.done / t.work;
    }
    if (!st.ready && NEEDED.every((id) => this.task(id).state === 'done')) this.stood();
  }

  // a bomb in the works while the gun is being put together sets the work under way back
  onEnemyBurst(s, pos) {
    const st = this.u.special, u = this.u;
    const d = Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z);
    if (d > 90) return;
    for (const t of st.tasks) if (t.state !== 'done' && t.done > 0 && t.id !== 'met') t.done = Math.max(0, t.done - 25 * (1 - d / 90));
  }

  // ------------------------------------------------------------------ the wind aloft and the firing table
  // the wind aloft's components on the line of fire: along (+ toward the target) and cross (+ to the right)
  comps(w) {
    const st = this.u.special, to = w.bearing + Math.PI - st.target.bearing; // the way it blows, against the line
    return { along: Math.cos(to) * w.speed, cross: Math.sin(to) * w.speed };
  }

  telegram(quiet = false) {
    const sim = this.sim, st = this.u.special;
    const c = this.comps(this.wind);
    st.met = { bearing: this.wind.bearing, speed: this.wind.speed, t: sim.time, along: c.along, cross: c.cross };
    this.nextMet = sim.time + 600;
    this.tableUpdate();
    if (!quiet && sim.time > 1) sim.radio(`Wilhelm: new Wettermeldung, wind aloft ${Math.round(((this.wind.bearing / DEG) % 360 + 360) % 360)}°, ${Math.round(this.wind.speed)} m/s. The firing data want laying again.`, 'info');
  }

  // the firing table's corrections for today's shot (the flight it assumes is the new barrel's)
  tableUpdate() {
    const st = this.u.special, nominal = flyPlane(GUNS.paris.charges[0].v, 52.5 * DEG, this.k);
    const tof = nominal.tof, R = st.target.dist;
    const earth = -(OMEGA * Math.sin(LAT) * R * tof) / R / STRICH; // the shell turns right over a turning Earth
    const m = st.met ?? { along: 0, cross: 0 };
    const windLine = -(m.cross * tof * 0.45) / R / STRICH, windRange = -m.along * tof * 0.5;
    st.table = { earth: +earth.toFixed(1), windLine: +windLine.toFixed(1), windRange: Math.round(windRange / 10) * 10, line: +(earth + windLine).toFixed(1), range: Math.round(windRange / 10) * 10 };
  }

  aim(id) {
    const sim = this.sim, u = this.u, st = u.special, o = u.order;
    const T = (id != null && st.targets.find((t) => t.id === id)) || st.target;
    if (T !== st.target) {
      // what the reports taught about this barrel and its charge stays; the table's part (the wind on the line) is
      // relaid for the new target
      const dl = st.corr.line - st.table.line, dr = st.corr.range - st.table.range;
      st.target = T;
      if (st.met) Object.assign(st.met, this.comps(st.met));
      this.tableUpdate();
      st.corr.line = clamp(+(st.table.line + dl).toFixed(1), -200, 200);
      st.corr.range = clamp(Math.round(st.table.range + dr), -20000, 20000);
      if (st.met && st.dataT >= st.met.t) st.dataT = sim.time;
    }
    if (u.missionId != null) sim.director.release(u);
    o.rounds = 1;
    o.fuze = 'instant';
    // one charge (the powder weight is the controller's): laid without the auto charge's margins, so the whole
    // table (115.6 to 122.8 km) is there for the corrections
    o.chargeAuto = false;
    o.charge = 0;
    sim.guns.setTarget(u, st.target.x, st.target.z, { biasScale: 0 });
    u.bias = { over: 0, right: 0, x: st.target.x, z: st.target.z };
    this.applyCorr();
  }

  // the corrections go onto the lay: the range one adds to the table range, the line one turns the gun
  applyCorr() {
    const u = this.u, st = u.special, o = u.order;
    if (!o.target || Math.hypot(o.target.x - st.target.x, o.target.z - st.target.z) > 1) return;
    o.adj.add = st.corr.range;
    o.adj.right = Math.tan(st.corr.line * STRICH) * st.target.dist;
    this.sim.guns.recompute(u);
  }

  layTable() {
    const st = this.u.special;
    st.corr.line = clamp(+(st.table.line + st.taught.line).toFixed(1), -200, 200);
    st.corr.range = clamp(Math.round(st.table.range + st.taught.range), -20000, 20000);
    st.dataT = this.sim.time;
    this.applyCorr();
  }

  useReport(f, k) {
    const st = this.u.special;
    f.used = true;
    const dr = -f.along * k, dl = -(f.lat * k) / st.target.dist / STRICH;
    st.corr.range = Math.round(st.corr.range + dr);
    st.corr.line = +(st.corr.line + dl).toFixed(1);
    st.taught.range = Math.round(st.taught.range + dr);
    st.taught.line = +(st.taught.line + dl).toFixed(1);
    st.dataT = this.sim.time;
    this.applyCorr();
  }

  // the player's REPORT: the whole correction, from the data the round was fired with (so a report that comes in after
  // a correction is not laid twice); what the aim then carries beyond the firing table is what the reports taught
  layReport(f) {
    const st = this.u.special, c = correction(st, nextFall(st, f));
    f.used = true;
    st.corr.range = clamp(st.corr.range + c.range, -20000, 20000);
    st.corr.line = clamp(+(st.corr.line + c.line).toFixed(1), -200, 200);
    st.taught.range = st.corr.range - st.table.range;
    st.taught.line = +(st.corr.line - st.table.line).toFixed(1);
    st.dataT = this.sim.time;
    this.applyCorr();
  }

  // ------------------------------------------------------------------ commands
  manual() {
    if (this.u.mode === 'auto') this.u.mode = 'manual';
  }

  // an order the gun cannot carry out says why: on the card's message line and (when it matters) on the radio
  refuse(text, radio = true) {
    const sim = this.sim, st = this.u.special;
    st.refused = { text, t: sim.time };
    if (radio && (this.lastRefusal !== text || sim.time - this.lastRefusalT > 6)) {
      this.lastRefusal = text;
      this.lastRefusalT = sim.time;
      sim.radio(`Wilhelm: ${text}`, 'warn');
    }
    return false;
  }

  command(name, a) {
    const sim = this.sim, u = this.u, st = u.special;
    switch (name) {
      case 'gang': this.manual(); return this.gang(a.task, a.d ?? 1);
      case 'hurry':
        if (st.tasks.every((t) => t.state === 'done')) return this.refuse('Every task is done.', false);
        st.allHands = true;
        this.autoAssign(true);
        return true;
      case 'step': this.manual(); return this.step();
      case 'fix': this.manual(); return this.fix(a.how ?? 'fix');
      case 'powder':
        this.manual();
        st.charge.set = clamp(+(a.kg ?? st.charge.set + (a.add ?? 0)).toFixed(1), 150, 260);
        return true;
      case 'pcorr':
        this.manual();
        st.corr.line = clamp(+(a.line ?? st.corr.line + (a.addLine ?? 0)).toFixed(1), -200, 200);
        st.corr.range = clamp(Math.round(a.range ?? st.corr.range + (a.addRange ?? 0)), -20000, 20000);
        if (st.met) st.dataT = sim.time;
        this.applyCorr();
        return true;
      case 'table':
        this.manual();
        if (!st.met) return this.refuse('No Wettermeldung yet: the weather station is not built.');
        this.layTable();
        sim.radio(`Wilhelm: firing data laid: Seite ${st.corr.line.toFixed(1)} Strich, Entfernung ${st.corr.range >= 0 ? '+' : ''}${st.corr.range} m (the table${st.taught.line || st.taught.range ? ' and what the reports have taught' : ''}).`, 'info');
        return true;
      case 'report': {
        this.manual();
        if (!st.last || st.last.state !== 'fallen' || st.last.used) return false;
        this.layReport(st.last);
        return true;
      }
      case 'aim':
        if (a.id != null && a.id !== st.target.id) this.manual(); // the player's own choice of target
        this.aim(a.id);
        if (a.id != null) sim.radio(`Wilhelm: laying on ${st.target.name} (${st.target.en}), ${(st.target.dist / 1000).toFixed(1)} km on ${Math.round(((st.target.bearing / DEG) % 360 + 360) % 360)}°.`, 'info');
        return true;
      case 'barrel':
        return this.changeBarrel();
    }
    return false;
  }

  // ------------------------------------------------------------------ the Feuerablauf
  shellsLeft() {
    return this.u.ammo.he + (this.u.pieces[0]?.loaded ? 1 : 0);
  }

  // a setting the drill may go on with: matched (the charge to the gauge, the data laid since the latest Wettermeldung)
  // or taken as set with the step key
  dialled(key) {
    const st = this.u.special;
    if (!key || st.accept[key]) return true;
    if (key === 'charge') return Math.abs(st.charge.set - st.charge.need) <= CHARGE_TOL + 1e-6;
    return !!st.met && st.dataT >= st.met.t;
  }

  // why the step key cannot act now ('' when it can)
  cannot() {
    const st = this.u.special, p = this.u.pieces[0], s = st.steps[st.i];
    if (!p || p.state === 'dead') return 'the gun is knocked out.';
    if (!st.ready) return 'the gun is not set up yet: send the gangs to the Stellungsbau tasks.';
    if (this.ended) return 'the day is over.';
    if (st.barrel.state === 'changing') return `the barrel is being changed (${mmss(st.barrel.dur - st.barrel.t)}).`;
    if (st.fault) return `${st.fault.text}: O to fix it, I to carry on.`;
    if (st.cover) return 'the crew is in cover from the raiders: wait for the all clear.';
    if (st.fixing) return `the crew is busy: ${st.fixing.toLowerCase()} (${mmss(-st.t)}).`;
    if (st.hold === 'start') return this.shellsLeft() > 0 ? '' : 'no shells left at the gun.';
    if (st.hold === 'dial' || st.hold === 'fire') return '';
    if (st.hold === 'blocked') return `the gun cannot load: ${this.sim.guns.problem(this.u)}.`;
    return `the crew is busy: ${s.name.toLowerCase()}${s.dur ? ` (${mmss(s.dur - st.t)})` : ''}.`;
  }

  // the drill's key: start the round, go on with a setting as it is, or fire
  step() {
    const st = this.u.special, s = st.steps[st.i];
    const no = this.cannot();
    if (no) return this.refuse(`${no[0].toUpperCase()}${no.slice(1)}`, false);
    if (st.hold === 'start') { st.run = true; this.begin(); return true; }
    if (st.hold === 'dial') { st.accept[s.set] = true; return true; }
    if (st.hold === 'fire') return this.fireNow();
    return false;
  }

  fireNow() {
    const sim = this.sim, u = this.u;
    if (sim.guns.fire(u)) return true;
    sim.tell(u, true);
    return false;
  }

  begin() {
    const sim = this.sim, st = this.u.special, s = st.steps[st.i];
    st.doing = true;
    st.t = 0;
    s.state = 'doing';
    st.pend = s.id === 'load' ? this.faultFor() : null;
    sim.events.special?.(this.u, 'step', s.id);
  }

  faultFor() {
    const sim = this.sim;
    if (sim.attract || sim.scripted) return null;
    const r = sim.rng();
    let acc = 0;
    for (const f of FAULTS) { acc += f.p; if (r < acc) return f; }
    return null;
  }

  // a step's work is done: the fault rolled for it (if any) is reported now, else the step is done
  endStep() {
    const sim = this.sim, st = this.u.special, f = st.pend;
    if (f) {
      st.pend = null;
      st.fault = f;
      sim.radio(`Wilhelm: ${f.text}. O: fix it (${mmss(f.cost)}); I: carry on (${f.risky}).`, 'alert');
      return;
    }
    this.complete();
  }

  complete() {
    const sim = this.sim, st = this.u.special, s = st.steps[st.i];
    s.state = 'done';
    st.doing = false;
    st.t = 0;
    st.pend = null;
    st.fixing = null;
    sim.events.special?.(this.u, 'done', s.id);
    st.i = Math.min(st.steps.length - 1, st.i + 1);
    // the firing step has no work: the round waits on it for the key
    const n = st.steps[st.i];
    if (n.id === 'fire' && n.state !== 'done') { n.state = 'doing'; st.doing = true; }
  }

  fix(how) {
    const sim = this.sim, st = this.u.special, f = st.fault;
    if (!f) return this.refuse('There is no fault to fix.', false);
    st.fault = null;
    if (how === 'ignore') {
      st.risk[f.id] = true;
      sim.radio(`Wilhelm: carry on regardless: ${f.risky}.`, 'warn');
      this.complete();
    } else {
      st.fixing = f.fixText;
      st.t = -f.cost; // the fix takes this long, then the step is done
      st.doing = true;
      sim.radio(`Wilhelm: ${f.fixText.toLowerCase()} (${mmss(f.cost)}).`, 'info');
    }
    return true;
  }

  // the round is fired (or lost with a burst barrel, or unloaded for a barrel change): the next starts from the gauge
  nextRound() {
    const st = this.u.special;
    for (const s of st.steps) s.state = 'todo';
    Object.assign(st, { i: 0, t: 0, doing: false, run: false, pend: null, fault: null, fixing: null, accept: {}, risk: {} });
  }

  drill(dt) {
    const u = this.u, st = u.special, p = u.pieces[0], s = st.steps[st.i];
    if (!st.ready || this.ended || !p || p.state === 'dead' || st.barrel.state === 'changing' || st.fault || !s) return;
    if (!st.doing) {
      if (st.i === 0 && (!st.run || this.shellsLeft() <= 0)) return;
      this.begin();
    }
    if (st.cover) return; // the work waits (a load under way runs on in guns.js)
    const crew = clamp(p.crew / p.crewMax, 0.35, 1);
    if (st.fixing) {
      st.t += dt * crew;
      if (st.t >= 0) { st.fixing = null; this.complete(); }
      return;
    }
    if (s.id === 'load') {
      if (p.loaded && p.state === 'ready') this.endStep();
      return;
    }
    if (s.id === 'fire') return;
    if (st.t < s.dur) st.t = Math.min(s.dur, st.t + dt * crew);
    if (st.t >= s.dur && this.dialled(s.set)) this.endStep();
  }

  // what the drill waits for (unit.special.hold)
  drillHold() {
    const sim = this.sim, u = this.u, st = u.special, p = u.pieces[0], s = st.steps[st.i];
    let h = null;
    if (!st.ready) h = 'setup';
    else if (!u.alive || !p || p.state === 'dead') h = 'dead';
    else if (this.ended) h = 'done';
    else if (st.barrel.state === 'changing') h = 'barrel';
    else if (st.fault) h = 'fault';
    else if (st.fixing) h = null;
    else if (st.i === 0 && !st.doing) h = this.shellsLeft() > 0 ? 'start' : 'done';
    else if (s.id === 'fire') h = 'fire';
    else if (s.set && st.doing && st.t >= s.dur && !this.dialled(s.set)) h = 'dial';
    else if (s.id === 'load' && st.doing && p.state === 'idle' && !p.loaded && !st.cover && sim.guns.problem(u)) h = 'blocked';
    st.hold = h;
  }

  // the gate holds the gun (no load starts, nothing fires) except at the drill's load and its firing key; it says why.
  // Between rounds the barrel waits down at its loading elevation on its line (guns.js `stowed`, `stowLaid`): it is
  // lowered after each shot and raised again only at the end of the load.
  gate() {
    const sim = this.sim, u = this.u, st = u.special, s = st.steps[st.i], p = u.pieces[0];
    u.stowLaid = true;
    u.stowed = st.ready && !!p && p.state !== 'dead' && !p.loaded && !(s.id === 'load' && st.doing);
    let g;
    if (!st.ready) g = 'Stellungsbau: the gun is not set up yet';
    else if (st.barrel.state === 'changing') g = 'barrel change';
    else if (st.cover) g = COVER_GATE;
    else if (st.fault) g = `${st.fault.text} (O: fix it, I: carry on)`;
    else if (st.fixing) g = `the crew is busy: ${st.fixing.toLowerCase()}`;
    else if (s.id === 'fire') g = null;
    // the load: open while the gun waits to start its cycle (guns.js starts it), shut once it runs (the cycle runs on;
    // only the firing key fires, at the drill's last step)
    else if (s.id === 'load' && st.doing) g = p?.state === 'idle' && !p.loaded ? null : 'the crew is loading and laying (Feuer comes after)';
    else if (st.hold === 'start') g = 'the next round is not started (Enter on the FEUERABLAUF card)';
    else if (st.hold === 'dial') g = s.set === 'charge' ? 'the charge is not set to the gauge (Q/E, or Enter to go on as set)' : 'the firing data are not laid (T, or Enter to go on as laid)';
    else if (st.hold === 'done') g = this.ended ? 'the day is over' : 'no shells left';
    else g = `the crew is at work: ${s.name.toLowerCase()}`;
    if (g !== u.gate) {
      u.gate = g;
      if (u.order.target) sim.guns.recompute(u);
    }
  }

  // Fliegeralarm: while the Camels run in on the gun or their bombs fall, the crew is in cover: the work and the drill
  // stop, the gun cannot fire or start a load (a load under way goes on)
  cover() {
    const sim = this.sim, u = this.u, st = u.special;
    const near = (T) => Math.hypot(T.x - u.pos.x, T.z - u.pos.z) < 1500;
    st.cover = (sim.aircraft ?? []).some((p) => p.alive && p.raid && near(p.raid.target)
      && (p.fired ? sim.time - p.firedAt < 6 : p.t >= 0 && Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) < COVER_R))
      || sim.shells.some((q) => !q.own && q.src === 'air' && q.alive && near(q.aim));
  }

  // ------------------------------------------------------------------ the barrel
  changeBarrel() {
    const sim = this.sim, u = this.u, st = u.special, p = u.pieces[0];
    if (!p || p.state === 'dead') return this.refuse('The gun is knocked out.', false);
    if (!st.ready) return this.refuse('The gun is not set up yet: its barrel is still going in.', false);
    if (st.barrel.state === 'changing') return this.refuse(`The barrel is already being changed: ${mmss(st.barrel.dur - st.barrel.t)} left.`, false);
    st.barrel.state = 'changing';
    st.barrel.t = 0;
    sim.guns.cease(u);
    // a loaded round comes out again with the old barrel
    if (p.loaded) { p.loaded = false; u.ammo.he++; }
    p.state = 'idle';
    p.job = null;
    this.nextRound();
    this.gate();
    sim.radio(`Wilhelm: Rohrwechsel. Barrel ${st.barrel.n} comes out after ${Math.floor(st.barrel.fired)} rounds; about ${Math.round(BARREL_DUR / 60)} minutes.`, 'warn');
    sim.events.special?.(u, 'barrel', st);
    return true;
  }

  // the gun is fired by guns.js; here the shot gets its true velocity and line, and the shell becomes the
  // controller's to fly. The faults carried on into the round act here.
  onFire(p, s) {
    const sim = this.sim, u = this.u, st = u.special, b = st.barrel;
    const n = ++st.n;
    const shellNo = st.shell.no;
    // the charge against the bore: too little and the shell falls short, more than the bore needs and it goes over
    // (and wears the barrel faster); a cut obturator lets gas past the shell. The spread grows with a worn-out barrel,
    // a drooping one and the difficulty's (the root of its `err`)
    const ratio = st.charge.set / st.charge.need;
    const worn = Math.max(0, b.fired - b.life);
    const wild = (st.risk.droop ? 3 : 1) * Math.sqrt(sim.difficulty.err ?? 1);
    const sig = SPREAD * (1 + worn * 0.15) * wild;
    const v = GUNS.paris.charges[0].v * Math.pow(ratio, 0.5) * (1 + b.calib + sim.gauss() * sig) * (st.risk.seal ? 0.993 + sim.gauss() * 0.002 : 1);
    const el = p.el + sim.gauss() * 0.0002 * wild;
    const brg = p.bearing - p.az + sim.gauss() * 0.001 * (1 + worn * 0.2) * wild;
    const f0 = flyPlane(v, el, this.k);
    // the wind aloft and the Earth's turning on the way
    const w = this.comps(this.wind);
    const R = f0.range + w.along * f0.tof * 0.5;
    const right = OMEGA * Math.sin(LAT) * R * f0.tof + w.cross * f0.tof * 0.45;
    const fx = Math.sin(brg), fz = -Math.cos(brg);
    const lx = u.pos.x + fx * R - fz * right, lz = u.pos.z + fz * R + fx * right;
    const T = st.target, dx = lx - T.x, dz = lz - T.z;
    const tfx = Math.sin(T.bearing), tfz = -Math.cos(T.bearing);
    const along = dx * tfx + dz * tfz, lat = -dx * tfz + dz * tfx;
    // a barrel past its life may burst at the shot
    const burst = worn > 0 && sim.rng() < 0.04 * worn;
    const f = {
      n, shellNo, barrel: b.n, t0: sim.time, tof: f0.tof, apex: f0.apex, eta: sim.time + f0.tof * REPORT_K,
      state: burst ? 'burst' : 'flying', target: T.id, along, lat, miss: Math.hypot(along, lat), result: '', text: '', km: Math.round(R / 1000),
      charge: st.charge.set, need: st.charge.need, corr: { line: st.corr.line, range: st.corr.range },
    };
    st.flights.push(f);
    if (st.flights.length > 40) st.flights.shift();
    b.fired++;
    if (ratio > 1.03) b.fired += Math.min(2, (ratio - 1.03) * 40); // an overcharge wears the bore faster
    this.wearUpdate();
    this.nextRound();
    Object.assign(s, { guided: true, paris: true, flight: f, k: this.k, top: s.pos.y });
    const ch = Math.cos(el);
    s.vel.x = v * ch * fx; s.vel.y = v * Math.sin(el); s.vel.z = v * ch * fz;
    if (burst) {
      s.alive = false;
      f.text = `The barrel burst at the shot (round ${b.fired} of a ${b.life}-round barrel).`;
      sim.radio(`Wilhelm: ${f.text}`, 'alert');
      sim.events.secondary?.({ x: p.pos.x, y: p.pos.y + 6, z: p.pos.z }, 2.5);
      sim.guns.damagePiece(u, p, 60, true);
      if (p.state !== 'dead') { b.fired = b.life + 99; this.changeBarrel(); }
      return;
    }
    sim.events.special?.(u, 'launch', s);
    sim.radio(`Wilhelm: Schuss ${n} (Granate Nr. ${shellNo}, ${st.charge.set.toFixed(1)} kg) is away. Flight about ${Math.round(f0.tof)} s; the agents report where it fell in about ${mmss(f.eta - sim.time)}.`, 'info');
    if (b.fired >= b.life) sim.radio(`Wilhelm: barrel ${b.n} has fired ${Math.floor(b.fired)} rounds: its life is spent. Change it (Rohrwechsel) before the next.`, 'warn');
  }

  wearUpdate() {
    const st = this.u.special, b = st.barrel;
    st.wear = b.fired / b.life;
    st.shell.no = Math.min(b.life, Math.floor(b.fired) + 1);
    st.shell.cal = +(21.0 + 2.2 * Math.min(1, b.fired / b.life)).toFixed(2);
    st.charge.need = +(CHARGE_BASE + CHARGE_PER_ROUND * b.fired).toFixed(1);
  }

  // ------------------------------------------------------------------ per step
  update(dt) {
    const sim = this.sim, u = this.u, st = u.special, b = st.barrel;
    if (!u.alive) return;
    // the true wind aloft wanders; the telegram reports it every ten minutes once the weather station stands
    this.wind.bearing += sim.gauss() * 0.002 * dt * 4;
    this.wind.speed = clamp(this.wind.speed + sim.gauss() * 0.01 * dt * 4, 3, 25);
    if (sim.time >= this.nextMet) this.telegram();
    this.cover();
    this.works(dt);
    if (b.state === 'changing') {
      b.t += dt;
      if (b.t >= b.dur) {
        b.state = 'ok';
        b.n++;
        b.fired = 0;
        b.t = 0;
        b.calib = sim.gauss() * 0.0025;
        st.taught = { line: 0, range: 0 }; // a new barrel: what the reports taught was the old one's
        this.wearUpdate();
        if (u.mode === 'auto') st.charge.set = st.charge.need;
        this.aim();
        sim.radio(`Wilhelm: barrel ${b.n} is in. Shells from Nr. 1 again; charge back to ${st.charge.need.toFixed(0)} kg.`, 'kill');
        sim.events.special?.(u, 'ready');
      }
    }
    this.flights(dt);
    for (const T of st.targets) T.fx = Math.max(0, T.fx - (FX / FX_T) * dt);
    this.ordersUpdate();
    this.missionEnd();
    this.drillHold();
    if (u.mode === 'auto') this.auto();
    this.drill(dt);
    this.drillHold();
    this.gate();
  }

  // the gun's own mission ends when the Armee has given every order and each is settled (no round still in the air
  // that could answer one), or at the op's time limit: won with WIN of the orders carried out
  missionEnd() {
    const sim = this.sim, st = this.u.special, op = sim.theatre.op;
    if (this.ended || op.kind !== 'paris' || sim.attract || sim.scripted || sim.state !== 'playing') return;
    const late = sim.time > (op.timeLimit ?? 2700);
    if (!late && (!st.ready || this.plan.length || st.orders.some((o) => o.state === 'open'))) return;
    if (late) for (const o of st.orders) if (o.state === 'open') this.close(o, false);
    this.ended = true;
    const n = st.orders.length, done = st.ordersDone, need = Math.ceil(n * WIN - 1e-6), win = n > 0 && done >= need;
    const rounds = st.flights.length;
    const what = !st.ready ? 'the gun was never set up' : `${done} of ${n} orders carried out (${need} wanted); ${st.hits} of ${rounds} ${rounds === 1 ? 'round' : 'rounds'} in a target's area`;
    sim.over = { title: win ? 'Mission complete' : 'Mission failed', sub: `${what[0].toUpperCase()}${what.slice(1)}.` };
    sim.director.setState(win ? 'victory' : 'defeat', `${late ? 'The day is over' : 'The day\'s orders are settled'}: ${what}.`);
  }

  // ------------------------------------------------------------------ the Armee's orders
  ordersUpdate() {
    const sim = this.sim, st = this.u.special;
    while (this.readyAt != null && this.plan.length && sim.time >= this.readyAt + this.plan[0].at) this.issue(this.plan.shift());
    for (const o of st.orders) {
      // a round fired in time still counts when its report comes in
      if (o.state !== 'open' || sim.time <= o.due) continue;
      if (st.flights.some((f) => f.state === 'flying' && f.target === o.target && f.t0 <= o.due)) continue;
      this.close(o, false);
    }
  }

  issue(p) {
    const sim = this.sim, u = this.u, st = u.special;
    const T = st.targets.find((t) => t.id === p.target);
    if (!T || !u.alive || u.pieces[0].state === 'dead') return;
    // no tanks left to hold: the order is not given
    if (T.effect === 'tanks' && !sim.targets.some((t) => t.kind === 'btanks' && t.alive)) return;
    const o = { id: ++this.nOrder, target: T.id, need: p.need, got: 0, t0: sim.time, due: sim.time + p.min * 60 * (sim.difficulty.time ?? 1), state: 'open', why: p.why, tEnd: 0 };
    st.orders.push(o);
    const mins = Math.round((o.due - sim.time) / 60);
    sim.radio(`Befehl der Armee to Wilhelm: ${p.need === 1 ? 'one round' : `${p.need} rounds`} into ${T.name} (${T.en}) within ${mins} minutes. ${p.why}`, 'warn');
    sim.events.special?.(u, 'order', o);
  }

  close(o, ok) {
    const sim = this.sim, u = this.u, st = u.special, T = st.targets.find((t) => t.id === o.target);
    o.state = ok ? 'done' : 'failed';
    o.tEnd = sim.time;
    if (ok) {
      st.ordersDone++;
      if (!sim.attract) sim.score.points += 100 * o.need;
      sim.radio(`Wilhelm: the Armee's order on ${T.name} is carried out.`, 'kill');
    } else {
      st.ordersFailed++;
      sim.radio(`Wilhelm: too late for the order on ${T.name}: ${o.got} of ${o.need} in the area.`, 'warn');
    }
    sim.events.special?.(u, 'order', o);
  }

  // what a round in a target's area does to the British side; the report's last sentence
  effect(T) {
    const sim = this.sim;
    if (!T.effect) return '';
    if (T.effect === 'tanks') {
      let n = 0;
      for (const m of sim.missions) {
        const t = m.targetId ? sim.targetById(m.targetId) : null;
        if (t?.kind === 'btanks' && OPEN(m)) { m.deadline += TANK_HOLD; n++; }
      }
      if (n) T.held += TANK_HOLD;
      return n ? ` Their tanks are held in laager: ${n === 1 ? 'the laager mission has' : `${n} laager missions have`} ${TANK_HOLD / 60} minutes more.` : ' No laager mission is open: nothing for it to hold.';
    }
    T.fx = Math.min(FX_MAX, T.fx + FX);
    return ` ${FX_TEXT[T.effect] ?? ''}`;
  }

  // the auto crew's target: the open order due soonest that a round can still answer, else the standing target
  pickTarget() {
    const sim = this.sim, st = this.u.special;
    let best = null;
    for (const o of st.orders) if (o.state === 'open' && o.due - sim.time > 200 && (!best || o.due < best.due)) best = o;
    return (best && st.targets.find((t) => t.id === best.target)) || st.targets[0];
  }

  // ------------------------------------------------------------------ the auto crew
  // the gangs organise themselves; the drill: the gauged charge (now and then a round late), the table and half the
  // last report, a fault fixed, the barrel changed when it is spent; the next round a while after the last. Without
  // the commander's push the crew takes its time at every decision (AUTO_PAUSE s, at random), so a player who drives
  // the drill gets more rounds away.
  auto() {
    const sim = this.sim, u = this.u, st = u.special, b = st.barrel, p = u.pieces[0];
    if (sim.scripted || !p || p.state === 'dead' || !st.ready || this.ended) return;
    if (st.hold !== this.autoHold) { this.autoHold = st.hold; this.autoAt = sim.time + (sim.attract ? 0 : AUTO_PAUSE[0] + sim.rng() * (AUTO_PAUSE[1] - AUTO_PAUSE[0])); }
    if (sim.time < this.autoAt) return;
    const flying = sim.shells.some((s) => s.paris && s.alive && s.unitId === u.id);
    if (b.state === 'ok' && b.fired >= b.life && !flying && st.i === 0 && !st.doing) { this.changeBarrel(); return; }
    if (b.state !== 'ok' || st.cover) return;
    if (st.fault) { this.fix('fix'); return; }
    const s = st.steps[st.i], o = u.order;
    switch (st.hold) {
      case 'start': {
        if (sim.time < st.nextAuto || this.shellsLeft() <= 0) return;
        const want = this.pickTarget();
        if (want !== st.target || !o.target || Math.hypot(o.target.x - st.target.x, o.target.z - st.target.z) > 1) this.aim(want.id);
        st.run = true;
        this.begin();
        return;
      }
      case 'dial':
        if (s.set === 'charge') {
          // the gauged charge, but the crew is a round or two behind the wear now and then
          const lag = sim.rng() < 0.3 ? CHARGE_PER_ROUND * (1 + Math.floor(sim.rng() * 3)) : 0;
          st.charge.set = +(st.charge.need - lag + sim.gauss() * 0.5).toFixed(1);
        } else {
          // the table, what the reports taught and part of the newest, with the crew's own slips
          const f = st.last;
          if (f && f.state === 'fallen' && !f.used) this.useReport(f, 0.3 + 0.4 * sim.rng());
          this.layTable();
          const first = !st.flights.length;
          st.corr.line = +(st.corr.line + sim.gauss() * (first ? 1.2 : 0.4)).toFixed(1);
          st.corr.range = Math.round(st.corr.range + sim.gauss() * (first ? 300 : 100));
          this.applyCorr();
        }
        st.accept[s.set] = true;
        return;
      case 'fire': {
        // a report due soon is waited for, and part of it believed
        const fl = st.flights.find((f) => f.state === 'flying');
        if (fl && fl.eta - sim.time < 40) return;
        const f = st.last;
        if (f && f.state === 'fallen' && !f.used) this.useReport(f, 0.3 + 0.4 * sim.rng());
        if (sim.guns.fire(u)) st.nextAuto = sim.time + AUTO_NEXT[0] + sim.rng() * (AUTO_NEXT[1] - AUTO_NEXT[0]);
      }
    }
  }

  flights(dt) {
    const sim = this.sim, u = this.u, st = u.special;
    for (const s of sim.shells) {
      if (!s.paris || !s.alive || s.unitId !== u.id) continue;
      s.prev.x = s.pos.x; s.prev.y = s.pos.y; s.prev.z = s.pos.z;
      s.t += dt;
      // the same drag-and-gravity model the table flies, no wind on the map
      const S = { x: s.pos.x, y: s.pos.y, z: s.pos.z, vx: s.vel.x, vy: s.vel.y, vz: s.vel.z };
      stepBallistic(S, dt, s.k);
      s.pos.x = S.x; s.pos.y = S.y; s.pos.z = S.z;
      s.vel.x = S.vx; s.vel.y = S.vy; s.vel.z = S.vz;
      if (s.pos.y > s.top) s.top = s.pos.y;
      const far = Math.hypot(s.pos.x - u.pos.x, s.pos.z - u.pos.z);
      if (far > 40000 || s.pos.y > 60000) s.alive = false; // off the map: the rest of the flight is reported
    }
    for (const f of st.flights) {
      if (f.state !== 'flying' || sim.time < f.eta) continue;
      f.state = 'fallen';
      f.endT = sim.time;
      const km = (v) => (Math.abs(v) / 1000).toFixed(1);
      const ra = Math.abs(f.along) < 50 ? 'on the range' : `${km(f.along)} km ${f.along > 0 ? 'weit (over)' : 'kurz (short)'}`;
      const li = Math.abs(f.lat) < 50 ? 'on the line' : `${km(f.lat)} km ${f.lat > 0 ? 'rechts (right)' : 'links (left)'}`;
      const T = st.targets.find((t) => t.id === f.target) ?? st.target;
      if (f.miss <= AREA) {
        f.result = 'area';
        st.hits++;
        T.hits++;
        f.text = `Schuss ${f.n} fell in the area of ${T.name}: ${ra}, ${li}.${this.effect(T)}`;
        if (!sim.attract) sim.score.points += 60;
        for (const o of st.orders) {
          if (o.state !== 'open' || o.target !== T.id || f.t0 > o.due) continue;
          if (++o.got >= o.need) this.close(o, true);
        }
      } else if (f.miss <= NEAR) {
        f.result = 'near';
        st.near++;
        T.near++;
        f.text = `Schuss ${f.n} fell near ${T.name}: ${ra}, ${li}.`;
        if (!sim.attract) sim.score.points += 15;
      } else {
        f.result = 'wide';
        f.text = `Schuss ${f.n} fell wide of ${T.name}: ${ra}, ${li}.`;
      }
      st.last = f;
      const c = T === st.target ? correction(st, nextFall(st, f)) : null;
      const then = !c ? '' : !c.text ? ' The aim is good: keep it.' : u.mode === 'auto' ? ' The crew corrects by it.' : ` To correct: ${c.text}. REPORT (.) lays it.`;
      sim.radio(`Wilhelm, agents' report: ${f.text}${then}`, f.miss <= AREA ? 'kill' : 'info');
      sim.events.special?.(u, 'result', f);
    }
  }
}

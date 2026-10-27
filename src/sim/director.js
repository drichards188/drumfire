// The director: missions, the phases of the day and night, the game clock, the creeping barrage, win and loss,
// and the attract-mode demonstration. Missions come in from observers (FOO, aeroplane, balloon, sound ranging) and
// are served by the units, by the player's commands or by the AI crews.
import { SITES, SECTORS, LINES, lineX, gridRef, YARD, DEG } from '../sector.js';
import { PHASES, CLOCK_KEYS, TARGETS } from './tables.js';
import { Specialists } from './specialists.js';
import { LineupDay } from './lineup.js';

const OBS_AIR = ['AB', 'KT', 'PQ', 'WD', 'RX'];
const PRIORITY = { sos: 10, barrage: 9, cb: 8, harass: 6, destroy: 5, wire: 4 };
const POINTS = { sos: 80, barrage: 100, cb: 60, harass: 40, destroy: 40, wire: 30 };
export const clockAt = (t) => {
  const k = CLOCK_KEYS;
  if (t <= 0) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + ((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])) * (k[i][1] - k[i - 1][1]);
  return k[k.length - 1][1] + (t - k[k.length - 1][0]) / 600;
};

const sectorName = (id) => SECTORS.find((s) => s.id === id).name;
const laneOf = (id) => ({ B: -1200, C: 2400 }[id]);

export class Director {
  constructor(sim) {
    this.sim = sim;
  }

  reset() {
    const sim = this.sim;
    sim.missions = [];
    sim.reports = [];
    sim.phase = 1;
    sim.barrage = null;
    this.script = sim.scripted ? [] : this.buildScript(); // the tutorial range has no day's script
    // a career's lineup: the day fitted to it (lineup.js)
    this.day = sim.loadout && !sim.attract && !sim.scripted ? new LineupDay(sim) : null;
    if (this.day) this.script = this.day.wrap(this.script);
    this.si = 0;
    this.nobs = 0;
    this.attractT = 6;
    this.cbNext = 0;
    this.zeroDone = false;
    this.phaseSent = 0;
    this.endAt = 0;
    sim.front = { A: 1, B: 1, C: 1, D: 1 };
    this.specialists = new Specialists(sim); // the heavy and long guns' missions (specialists.js)
    // wire belts in front of the German line, in the lanes the attack will use
    for (const sec of ['B', 'C']) {
      const z = laneOf(sec);
      sim.targetAI.addWire(lineX(LINES.germanFront, z) - 40, z, 60, sec);
    }
  }

  // ------------------------------------------------------------------ missions
  addMission(spec) {
    const sim = this.sim, td = spec.kind;
    // deadline null: no clock, the mission ends on its own (an SOS when its assault does)
    const dl = spec.deadline === null ? null : (spec.deadline ?? 600) * sim.difficulty.time;
    const m = {
      id: sim.nextId('m'), kind: spec.kind, title: spec.title, targetId: spec.targetId ?? null, x: spec.x, z: spec.z,
      gridRef: gridRef(spec.x, spec.z), observer: spec.observer, priority: spec.priority ?? PRIORITY[spec.kind] ?? 5,
      t0: sim.time, deadline: dl == null ? null : sim.time + dl, unitId: null, state: 'open', reports: [],
      units: [], obsName: spec.obsName ?? this.obsName(spec.observer), rounds: 0, alt: spec.alt ?? 0,
      lift: 0, sector: spec.sector ?? null, wireId: spec.wireId ?? null, assault: spec.assault ?? null, convoy: spec.convoy ?? null,
      hint: spec.hint ?? '',
      // a heavy or long guns' mission (specialists.js): its role, its points, the hard shell it needs
      role: spec.role ?? null, points: spec.points ?? null, minHard: spec.minHard ?? 0,
    };
    sim.missions.push(m);
    sim.stats.missions[m.kind] = sim.stats.missions[m.kind] ?? { new: 0, done: 0, failed: 0 };
    sim.stats.missions[m.kind].new++;
    sim.events.mission?.(m, 'new');
    sim.radio(`${m.title}. ${m.gridRef}.`, spec.kind === 'sos' ? 'alert' : spec.observer === 'sound' ? 'phone' : 'info');
    return m;
  }

  obsName(o) {
    const n = ++this.nobs;
    if (o === 'air') return `Aeroplane ${OBS_AIR[n % OBS_AIR.length]}`;
    if (o === 'balloon') return 'Balloon';
    if (o === 'sound') return 'Sound ranging';
    if (o === 'map') return 'Map shoot';
    if (o === 'railspot') return 'Rail spotters';
    return `FOO ${1 + (n % 7)}`;
  }

  dayObserver(night) {
    return this.sim.night ? night : 'air';
  }

  assign(u, m) {
    const sim = this.sim, g = sim.guns;
    if (!u.alive || m.state === 'done' || m.state === 'failed') return false;
    if (u.missionId != null && u.missionId !== m.id) this.release(u);
    if (!m.units.includes(u.id)) m.units.push(u.id);
    m.unitId ??= u.id;
    u.missionId = m.id;
    const reg = m.kind === 'sos' || m.kind === 'barrage' ? 0.12 : m.kind === 'harass' ? 0.4 : 1;
    const fuze = this.defaultFuze(m, u);
    u.order.fuze = fuze;
    u.order.chargeAuto = true;
    const lat = m.kind === 'sos' || m.kind === 'barrage';
    g.setTarget(u, m.x, m.z, { h: m.alt, biasScale: reg, fuze, sheaf: lat ? 55 : null, shift: lat ? (u.id - 3) * 65 : 0 });
    g.setRounds(u, m.kind === 'sos' || m.kind === 'barrage' ? 99 : 1);
    if (m.state === 'open') this.sim.setMissionState(m, m.observer === 'map' || m.observer === 'sound' || m.kind === 'sos' || m.kind === 'barrage' ? 'ffe' : 'ranging');
    return true;
  }

  defaultFuze(m, u) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    if (m.kind === 'wire' || m.kind === 'sos' || m.kind === 'barrage' || m.kind === 'harass' || m.kind === 'cb') return 'instant';
    if (t && t.kind === 'balloon') return u.kind === 'bl60' ? 'shrapnel' : 'instant';
    if (t && (t.kind === 'mebu' || t.kind === 'bunker' || t.kind === 'dump' || t.kind === 'hq')) return 'delay';
    return 'instant';
  }

  release(u) {
    const sim = this.sim, m = u.missionId != null ? sim.missionById(u.missionId) : null;
    u.missionId = null;
    sim.guns.cease(u);
    if (!m) return;
    m.units = m.units.filter((id) => id !== u.id);
    if (m.unitId === u.id) m.unitId = m.units[0] ?? null;
    if (!m.units.length && (m.state === 'ranging' || m.state === 'ffe')) sim.setMissionState(m, 'open');
  }

  finish(m, ok, why = '') {
    const sim = this.sim;
    if (m.state === 'done' || m.state === 'failed') return;
    const st = sim.stats.missions[m.kind];
    m.state = ok ? 'done' : 'failed';
    m.tEnd = sim.time;
    for (const id of [...m.units]) {
      const u = sim.unitById(id);
      if (u && u.missionId === m.id) {
        u.missionId = null;
        sim.guns.cease(u);
      }
    }
    m.units = [];
    m.unitId = null;
    if (st) st[ok ? 'done' : 'failed']++;
    // the battle's pay (sim.credit): a mission done shares its points among the units that fired on it, by their rounds
    if (ok && m.fired) {
      const all = Object.values(m.fired).reduce((a, n) => a + n, 0);
      for (const [id, n] of Object.entries(m.fired)) sim.credit(Number(id), ((m.points ?? POINTS[m.kind] ?? 30) * n) / all);
    }
    if (!sim.attract) {
      const pts = m.points ?? POINTS[m.kind] ?? 30;
      if (ok) sim.score.points += pts; else sim.score.points -= Math.round(pts / 3);
      sim.score[ok ? 'missions' : 'failed']++;
    }
    sim.events.mission?.(m, ok ? 'done' : 'failed');
    sim.radio(`${m.title}: ${ok ? 'done' + (why ? ', ' + why : '') : 'failed' + (why ? ', ' + why : '')}.`, ok ? 'kill' : 'warn');
  }

  // ------------------------------------------------------------------ mission specs from the sites
  siteMission(id, over = {}) {
    // a lineup's day may send it to another site, hold it back or leave it out (lineup.js)
    if (this.day) { const g = this.day.gate(id, over); if (!g) return null; ({ id, over } = g); }
    const sim = this.sim, t = sim.targetById(id);
    if (!t) return null;
    const kind = t.kind;
    let observer = over.observer ?? (kind === 'mebu' || kind === 'balloon' ? 'foo' : this.dayObserver('map'));
    let x = t.pos.x, z = t.pos.z, mkind = over.kind ?? 'destroy', title = over.title ?? `Destroy ${t.name}`;
    if (kind === 'battery') {
      mkind = over.kind ?? 'cb';
      title = over.title ?? `Counter-battery: ${t.name}`;
      observer = over.observer ?? this.dayObserver('sound');
      if (!t.cbErr) {
        const a = sim.rng() * Math.PI * 2, m = 70 + sim.rng() * 130;
        t.cbErr = { x: Math.cos(a) * m, z: Math.sin(a) * m };
      }
      x += t.cbErr.x;
      z += t.cbErr.z;
    } else if (kind === 'crossroads') {
      mkind = over.kind ?? 'harass';
      title = over.title ?? 'Harass the crossroads, traffic on the road';
      observer = over.observer ?? 'map';
    } else if (kind === 'railyard') {
      mkind = over.kind ?? 'harass';
      title = over.title ?? 'Shell the railhead, a train is in';
      observer = over.observer ?? 'railspot';
    } else if (kind === 'dump') title = `Destroy the ammunition dump (${t.id})`;
    else if (kind === 'hq') title = 'Destroy the chateau headquarters';
    else if (kind === 'balloon') title = 'Bring down the kite balloon';
    t.known = kind !== 'battery' ? true : t.known;
    return this.addMission({
      kind: mkind, title, targetId: id, x, z, observer, alt: kind === 'balloon' ? t.pos.y : 0,
      deadline: over.deadline ?? { mebu: 900, dump: 800, battery: 700, hq: 800, balloon: 800, crossroads: 150, railyard: 260 }[kind] ?? 500,
      priority: over.priority,
    });
  }

  wireMission(sec, deadline = 520) {
    const sim = this.sim, w = sim.targetAI.wires.find((q) => q.sector === sec);
    return this.addMission({
      kind: 'wire', title: `Cut the wire, ${sectorName(sec)}`, x: w.x, z: w.z, observer: 'foo', sector: sec, wireId: w.id, deadline,
    });
  }

  // ------------------------------------------------------------------ the script of the day
  buildScript() {
    const S = [];
    const at = (t, fn) => S.push({ t, fn });
    const D = this;
    at(8, () => D.wireMission('B', 700));
    at(45, () => D.siteMission('M1', { deadline: 520 }));
    at(210, () => D.wireMission('C', 800));
    at(335, () => D.siteMission('M2'));
    at(380, () => D.siteMission('D1'));
    at(445, () => D.siteMission('M3'));
    at(575, () => D.siteMission('D2'));
    at(630, () => D.siteMission('M4'));
    at(770, () => D.siteMission('H1'));
    at(925, () => D.assault('B', 1));
    at(1090, () => D.assault('C', 1));
    at(1230, () => D.assault('D', 0.8));
    at(1330, () => D.convoy());
    at(1360, () => D.train());
    at(1450, () => D.convoy());
    at(1530, () => D.assault('A', 0.8));
    at(1590, () => D.convoy());
    at(1640, () => D.train());
    at(1710, () => D.convoy());
    at(1850, () => D.zeroHour());
    return S;
  }

  assault(sec, size) {
    const sim = this.sim, inf = sim.infAI;
    if (sim.front[sec] <= 0) {
      // a lost sector is not attacked again; the Germans try the next one
      const ids = Object.keys(sim.front).filter((k) => sim.front[k] > 0);
      sec = ids[Math.floor(sim.rng() * ids.length)];
      if (!sec) return;
    }
    const a = inf.spawnAssault(sec, size);
    sim.enemyAI.hurricaneOn(sec, 14);
    a.rocketsAt = sim.time + 5;
    sim.radio(`Heavy hostile bombardment of the front line at ${sectorName(sec)}.`, 'warn');
    return a;
  }

  rockets(a) {
    const sim = this.sim, p = sim.infAI.sosPoint(a, 0.3);
    sim.events.sos?.(a.sector);
    for (const dz of [-80, 0, 80]) sim.events.flare?.({ x: lineX(LINES.britishFront, a.zc + dz) - 10, y: 90, z: a.zc + dz }, 'sos');
    const g = a.groups[0];
    const m = this.addMission({
      kind: 'sos', title: `SOS, ${sectorName(a.sector)}`, x: p.x, z: p.z, observer: 'foo', sector: a.sector, assault: a.id,
      // no deadline: a clock ran out while the Germans were still crossing, ceased the guns and failed a
      // line that held (every SOS on Hard); the assault ends the mission, held or broken in
      deadline: null,
    });
    a.missionId = m.id;
    a.rocketsT = sim.time;
    a.firstShotT = null;
    sim.radio(`SOS! Red rockets over ${sectorName(a.sector)}. All guns to the SOS line.`, 'alert');
    // the AI crews and the batteries on standing orders respond in their own time
    sim.crews.sosCalled(m);
  }

  assaultResolved(a) {
    const sim = this.sim, m = a.missionId ? sim.missionById(a.missionId) : null;
    const held = !a.groups.some((g) => g.state === 'in');
    sim.stats.sos.push({ sector: a.sector, resp: a.firstShotT != null ? a.firstShotT - a.rocketsT : null, held, left: a.groups.reduce((s, g) => s + (g.state === 'in' ? g.n : 0), 0), n0: a.n0 });
    if (m && m.state !== 'done' && m.state !== 'failed') this.finish(m, held, held ? 'the attack is broken' : 'they are in our line');
  }

  breach(g) {
    const sim = this.sim;
    if (sim.attract || sim.scripted) return;
    const s = g.sector;
    sim.front[s] = Math.max(0, sim.front[s] - 0.5);
    sim.radio(`Germans in our front line at ${sectorName(s)}!`, 'alert');
    if (sim.front[s] <= 0.01) {
      sim.front[s] = 0;
      sim.radio(`${sectorName(s)} is lost.`, 'alert');
      sim.stats.sectorsLost++;
    }
  }

  convoy() {
    const sim = this.sim, t = sim.targetById('X1');
    if (this.day && !this.day.reachable(t)) return null; // no battery in the field reaches the road
    sim.targetAI.convoy(t, sim.rng() < 0.5 ? 1 : -1);
    t.known = true;
    const m = this.siteMission('X1');
    if (m) m.convoy = true;
    return m;
  }

  train() {
    const sim = this.sim, t = sim.targetById('R1');
    if (this.day && !this.day.reachable(t)) return null;
    sim.targetAI.train(t);
    t.known = true;
    return this.siteMission('R1');
  }

  zeroHour() {
    const sim = this.sim;
    const zero = sim.time + 55;
    const lanes = [{ sector: 'B', z: laneOf('B') }, { sector: 'C', z: laneOf('C') }];
    const b = sim.barrage = {
      active: true, zero, k: 0, spacing: 100 * YARD, lifts: [], lanes, nextLift: zero + 130, liftEvery: 40, kMax: 10, end: 0,
      xAt: (z) => lineX(LINES.germanFront, z) - 30 + b.k * b.spacing,
      missions: [],
    };
    sim.infAI.spawnBritish(lanes);
    sim.zero = { n0: sim.infantry.filter((g) => g.side === 'british').reduce((s, g) => s + g.n0, 0) };
    for (const l of lanes) {
      const m = this.addMission({
        kind: 'barrage', title: `Creeping barrage, ${sectorName(l.sector)}`, x: b.xAt(l.z), z: l.z, observer: 'map', sector: l.sector,
        deadline: 600,
      });
      m.lane = l;
      b.missions.push(m);
    }
    sim.radio('Zero hour in one minute. Lay on the barrage line and lift on the timetable: 100 yards every 40 seconds.', 'warn');
  }

  barrageUpdate(dt) {
    const sim = this.sim, b = sim.barrage;
    if (!b || !b.active) return;
    if (sim.time >= b.nextLift && b.k < b.kMax) {
      b.k++;
      b.nextLift = sim.time + b.liftEvery;
      for (const m of b.missions) {
        m.x = b.xAt(m.lane.z);
        m.lift = b.k;
        m.gridRef = gridRef(m.x, m.z);
      }
      sim.radio(`Barrage lifts: line ${b.k} of ${b.kMax}, 100 yards.`, 'warn');
      sim.events.lift?.(b.k, b);
    } else if (b.k >= b.kMax && !b.end) {
      b.end = sim.time + 40;
    }
    // evaluate when the groups have finished
    const bg = sim.infantry.filter((g) => g.side === 'british');
    const done = bg.every((g) => g.state === 'in' || g.n <= 0);
    if ((done && sim.time > b.zero + 30) || (b.end && sim.time > b.end + 100)) this.zeroEnd();
  }

  zeroEnd() {
    const sim = this.sim, b = sim.barrage;
    if (!b.active) return;
    b.active = false;
    const bg = sim.infantry.filter((g) => g.side === 'british');
    const inn = bg.filter((g) => g.state === 'in').reduce((s, g) => s + g.n, 0);
    const n0 = sim.zero.n0;
    sim.zero.survivors = inn;
    for (const m of b.missions) this.finish(m, true);
    if (sim.attract) return;
    if (inn >= n0 * sim.difficulty.zero) this.setState('victory', `The infantry are on the objective: ${inn} of ${n0} men.`);
    else this.setState('defeat', `The attack failed: only ${inn} of ${n0} men reached the objective.`);
  }

  setState(s, msg) {
    const sim = this.sim;
    if (sim.state === s) return;
    sim.state = s;
    sim.radio(msg, s === 'victory' ? 'kill' : 'alert');
    sim.events.state?.(s);
  }

  // ------------------------------------------------------------------ per step
  update(dt) {
    const sim = this.sim, now = sim.time;
    if (sim.scripted) return this.scriptedUpdate();
    sim.clock = (sim.attract ? 5.6 + 1.1 * Math.sin(now / 160) : clockAt(now)) % 24;
    sim.night = sim.clock >= 18.5 || sim.clock < 5.5;
    if (sim.attract) return this.attractUpdate(dt);
    // phase
    let ph = 1;
    for (const p of PHASES) if (now >= p.t0) ph = p.n;
    if (ph !== sim.phase || !this.phaseSent) {
      sim.phase = ph;
      this.phaseSent = ph;
      const p = PHASES[ph - 1];
      sim.events.phase?.(ph, p.title, p.sub);
      sim.radio(`${p.title}. ${p.sub}`, 'info');
    }
    while (this.si < this.script.length && this.script[this.si].t <= now) this.script[this.si++].fn();
    // rockets for assaults
    for (const a of sim.assaults) if (a.state === 'forming' && !a.missionId && now >= a.rocketsAt) {
      a.state = 'called';
      this.rockets(a);
    }
    this.watchBatteries();
    this.missionsUpdate();
    this.barrageUpdate(dt);
    // sectors recover a little when quiet
    for (const s of SECTORS) if (sim.front[s.id] > 0 && sim.front[s.id] < 1 && !sim.assaults.some((a) => a.sector === s.id)) sim.front[s.id] = Math.min(1, sim.front[s.id] + dt * 0.02 / 60);
    // loss
    const lost = Object.values(sim.front).filter((v) => v <= 0).length;
    if (lost >= 2 && sim.state === 'playing') this.setState('defeat', 'Two sectors of the front are lost.');
    if (sim.units.every((u) => !u.alive) && sim.state === 'playing') this.setState('defeat', 'Every gun of the Group is destroyed.');
  }

  // the tutorial range: the clock stays in daylight, nothing arrives unless sim.script sends it
  scriptedUpdate() {
    const sim = this.sim, now = sim.time;
    sim.clock = sim.script.hour;
    sim.night = false;
    for (const a of sim.assaults) if (a.state === 'forming' && !a.missionId && now >= a.rocketsAt) {
      a.state = 'called';
      this.rockets(a);
    }
    this.missionsUpdate();
  }

  // new counter-battery missions for hostile batteries that have fired
  watchBatteries() {
    const sim = this.sim, now = sim.time;
    if (sim.phase < 2) return;
    for (const t of sim.targets) {
      if (t.kind !== 'battery' || !t.alive || now - t.firedAt > 30) continue;
      if (sim.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed')) continue;
      if (t.cbLast && now - t.cbLast < 200) continue;
      t.cbLast = now;
      this.siteMission(t.id);
    }
  }

  missionsUpdate() {
    const sim = this.sim, now = sim.time;
    this.specialists?.update();
    this.day?.update();
    for (const m of sim.missions) {
      if (m.state === 'done' || m.state === 'failed') continue;
      const t = m.targetId ? sim.targetById(m.targetId) : null;
      if (m.kind === 'destroy' && t && !t.alive) this.finish(m, true);
      else if (m.kind === 'cb' && t) {
        if (!t.alive) this.finish(m, true);
        else if (t.parts.filter((p) => p.alive).length <= 1) this.finish(m, true, 'the battery is silenced');
        else if (m.onTarget && !t.known) {
          t.known = true;
          sim.radio(`${t.name} located.`, 'info');
        }
      } else if (m.kind === 'wire') {
        const w = sim.targetAI.wires.find((q) => q.id === m.wireId);
        if (w && w.cut >= 1) this.finish(m, true, 'the wire is cut');
      } else if (m.kind === 'harass' && t) {
        const alive = t.parts.filter((p) => p.alive).length;
        if (!t.alive || alive <= t.parts.length * 0.4) this.finish(m, true, 'transport destroyed');
        else if (!t.present) this.finish(m, false, 'it has gone');
      }
      if (m.state !== 'done' && m.state !== 'failed' && m.kind !== 'barrage' && m.deadline != null && now > m.deadline) this.finish(m, false, 'too late');
    }
    // keep the list short for the UI: drop old finished ones
    if (sim.missions.length > 60) {
      const keep = sim.missions.filter((m) => (m.state !== 'done' && m.state !== 'failed') || now - (m.tEnd ?? 0) < 120);
      sim.missions.length = 0;
      sim.missions.push(...keep);
    }
  }

  // ------------------------------------------------------------------ attract mode
  attractUpdate(dt) {
    const sim = this.sim, now = sim.time;
    sim.phase = 3;
    this.attractT -= dt;
    const open = sim.missions.filter((m) => m.state === 'open' || m.state === 'ranging' || m.state === 'ffe');
    if (this.attractT <= 0 && open.length < 5) {
      this.attractT = 11 + sim.rng() * 10;
      const pool = sim.targets.filter((t) => t.alive && t.kind !== 'crossroads' && t.kind !== 'railyard' && t.kind !== 'balloon');
      const t = pool[Math.floor(sim.rng() * pool.length)];
      if (t && !open.some((m) => m.targetId === t.id)) this.siteMission(t.id, { observer: 'foo', deadline: 300 });
    }
    if (!sim.assaults.length && now > 90 && (now % 200) < dt) this.assault(['A', 'B', 'C', 'D'][Math.floor(sim.rng() * 4)], 0.7);
    for (const a of sim.assaults) if (a.state === 'forming' && !a.missionId && now >= a.rocketsAt) {
      a.state = 'called';
      this.rockets(a);
    }
    this.watchBatteries();
    this.missionsUpdate();
    for (const m of sim.missions) if ((m.state === 'done' || m.state === 'failed') && now - (m.tEnd ?? now) > 60) m.drop = true;
    if (sim.missions.length > 24) sim.missions = sim.missions.filter((m) => !m.drop);
  }
}

// The WW2 mode's director: the British Director's mission machinery (assign, release, finish, deadlines, the
// barrage) with the operation's own day. Flanders 1944 is the British day with the sides turned round: targets in
// the Allied rear, counter-battery when their batteries fire, Allied attacks called by red flares from our front
// (Sperrfeuer), Störungsfeuer at night, and our counter-attack behind the player's Feuerwalze at the end. The eastern
// operations (Sevastopol, Brest) are sieges: preparation, then the bombardment of the fortress works. The V-weapon
// missions have no targets on the map; their controller (special.js) decides how they end.
import { SECTORS, LINES, lineX, DEG } from '../sector.js';
import { TARGETS } from '../sim/tables.js';
import { Director } from '../sim/director.js';
import { ENEMY_BATTERIES } from './targets.js';

const PRIORITY = { sos: 10, barrage: 9, cb: 8, harass: 6, destroy: 5, wire: 4 };
const OBS_AIR = ['Storch 1', 'Storch 2', 'Hs 126'];
const sectorName = (id) => SECTORS.find((s) => s.id === id).name;
const laneOf = (id) => ({ B: -1200, C: 2400 }[id]);
const SUPER = new Set(['gustav', 'karl', 'bertha']);

export const clockOf = (keys, t) => {
  if (t <= 0) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return keys[i - 1][1] + ((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])) * (keys[i][1] - keys[i - 1][1]);
  return keys[keys.length - 1][1] + (t - keys[keys.length - 1][0]) / 600;
};

export class DirectorWW2 extends Director {
  get op() {
    return this.sim.theatre.op;
  }

  reset() {
    const sim = this.sim;
    sim.missions = [];
    sim.reports = [];
    sim.phase = 1;
    sim.barrage = null;
    this.script = sim.scripted ? [] : this.buildScript();
    this.si = 0;
    this.nobs = 0;
    this.attractT = 6;
    this.phaseSent = 0;
    this.endAt = 0;
    sim.front = this.op.kind === 'battle' ? { A: 1, B: 1, C: 1, D: 1 } : {};
  }

  addMission(spec) {
    const sim = this.sim;
    const dl = (spec.deadline ?? 600) * sim.difficulty.time;
    const m = {
      id: sim.nextId('m'), kind: spec.kind, title: spec.title, targetId: spec.targetId ?? null, x: spec.x, z: spec.z,
      gridRef: sim.theatre.ref(spec.x, spec.z), observer: spec.observer, priority: spec.priority ?? PRIORITY[spec.kind] ?? 5,
      t0: sim.time, deadline: sim.time + dl, unitId: null, state: 'open', reports: [],
      units: [], obsName: spec.obsName ?? this.obsName(spec.observer), rounds: 0, alt: spec.alt ?? 0,
      lift: 0, sector: spec.sector ?? null, wireId: null, assault: spec.assault ?? null, convoy: spec.convoy ?? null,
      hint: spec.hint ?? '', metric: true,
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
    if (o === 'air') return OBS_AIR[n % OBS_AIR.length];
    if (o === 'sound') return 'Schallmeßtrupp';
    if (o === 'map') return 'Kartenschießen';
    if (o === 'railspot') return 'Bahnbeobachter';
    return `VB ${1 + (n % 6)}`;
  }

  defaultFuze(m, u) {
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    if (m.kind === 'sos' || m.kind === 'barrage') return u.kind === 'lefh18' ? 'shrapnel' : 'instant';
    if (!t) return 'instant';
    const h = TARGETS[t.kind]?.hardness;
    if (h === 'hard' || h === 'deep' || t.kind === 'hq' || t.kind === 'adump') return 'delay';
    return 'instant';
  }

  assign(u, m) {
    const ok = super.assign(u, m);
    // the Sperrfeuer and the Feuerwalze lay every unit on its own stretch of the line (the British used unit ids 1 to 5)
    if (ok && (m.kind === 'sos' || m.kind === 'barrage')) {
      const live = this.sim.units.filter((q) => q.alive && !SUPER.has(q.kind));
      const k = Math.max(0, live.indexOf(u));
      this.sim.guns.setTarget(u, m.x, m.z, { biasScale: 0.12, fuze: u.order.fuze, sheaf: 55, shift: (k - (live.length - 1) / 2) * 35 });
    }
    return ok;
  }

  siteMission(id, over = {}) {
    const sim = this.sim, t = sim.targetById(id);
    if (!t) return null;
    const kind = t.kind;
    let observer = over.observer ?? (this.op.kind === 'battle' ? (kind === 'tanks' || kind === 'aop' ? 'foo' : this.dayObserver('map')) : kind === 'sbattery' ? 'sound' : 'air');
    let x = t.pos.x, z = t.pos.z, mkind = over.kind ?? 'destroy', title = over.title ?? `Destroy: ${t.name}`;
    if (ENEMY_BATTERIES.has(kind)) {
      mkind = over.kind ?? 'cb';
      title = over.title ?? `Gegenbatterie: ${t.name}`;
      observer = over.observer ?? this.dayObserver('sound');
      if (!t.cbErr) {
        const a = sim.rng() * Math.PI * 2, r = 70 + sim.rng() * 130;
        t.cbErr = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
      x += t.cbErr.x;
      z += t.cbErr.z;
    } else if (kind === 'aconvoy') {
      mkind = 'harass';
      title = over.title ?? 'Störungsfeuer: traffic at Hellfire Corner';
      observer = 'map';
    } else if (kind === 'railyard') {
      mkind = 'harass';
      title = over.title ?? 'Störungsfeuer: a train at the railhead';
      observer = 'railspot';
    }
    if (!ENEMY_BATTERIES.has(kind)) t.known = true;
    return this.addMission({
      kind: mkind, title, targetId: id, x, z, observer,
      deadline: over.deadline ?? { tanks: 700, adump: 800, aop: 600, hq: 800, aconvoy: 150, railyard: 260 }[kind] ?? (this.op.kind === 'battle' ? 700 : 2400),
      priority: over.priority,
    });
  }

  buildScript() {
    const S = [];
    const at = (t, fn) => S.push({ t, fn });
    const D = this;
    if (this.op.kind === 'battle') {
      at(8, () => D.siteMission('O1', { deadline: 600 }));
      at(60, () => D.siteMission('T1', { deadline: 650 }));
      at(220, () => D.siteMission('D1'));
      at(335, () => D.siteMission('T2'));
      at(400, () => D.siteMission('H1'));
      at(470, () => D.siteMission('D2'));
      at(640, () => D.train());
      at(925, () => D.assault('B', 0.6));
      at(1090, () => D.assault('C', 0.6));
      at(1230, () => D.assault('D', 0.5));
      at(1330, () => D.convoy());
      at(1360, () => D.train());
      at(1450, () => D.convoy());
      at(1530, () => D.assault('A', 0.5));
      at(1590, () => D.convoy());
      at(1640, () => D.train());
      at(1710, () => D.convoy());
      at(1850, () => D.zeroHour());
    } else if (this.op.kind === 'gustav') {
      // the support battery has work at once; the fortress works are open to the Gustav from the start
      at(5, () => D.siteMission('G5', { deadline: 1200 }));
      at(20, () => { for (const id of ['G1', 'G2', 'G3', 'G4']) D.siteMission(id, { deadline: 3000 }); });
      at(700, () => D.siteMission('G6', { deadline: 1200 }));
    } else if (this.op.kind === 'karl') {
      at(10, () => { for (const id of ['K1', 'K2', 'K3']) D.siteMission(id, { deadline: 3000 }); });
      at(300, () => D.siteMission('K4', { deadline: 900 }));
    }
    return S;
  }

  // ------------------------------------------------------------------ the Allied attacks (Flanders)
  assault(sec, size) {
    const sim = this.sim, inf = sim.infAI;
    if (sim.front[sec] <= 0) {
      const ids = Object.keys(sim.front).filter((k) => sim.front[k] > 0);
      sec = ids[Math.floor(sim.rng() * ids.length)];
      if (!sec) return;
    }
    const a = inf.spawnAssault(sec, size);
    sim.enemyAI.hurricaneOn(sec, 14);
    a.rocketsAt = sim.time + 5;
    sim.radio(`Trommelfeuer on our front line at ${sectorName(sec)}: they are coming.`, 'warn');
    return a;
  }

  rockets(a) {
    const sim = this.sim, p = sim.infAI.sosPoint(a, 0.25);
    sim.events.sos?.(a.sector);
    for (const dz of [-80, 0, 80]) sim.events.flare?.({ x: lineX(LINES.germanFront, a.zc + dz) + 10, y: 90, z: a.zc + dz }, 'sos');
    const g = a.groups[0];
    const m = this.addMission({
      kind: 'sos', title: `Sperrfeuer, ${sectorName(a.sector)}`, x: p.x, z: p.z, observer: 'foo', sector: a.sector, assault: a.id,
      deadline: g.go + g.crossing + 30,
    });
    a.missionId = m.id;
    a.rocketsT = sim.time;
    a.firstShotT = null;
    sim.radio(`Rote Leuchtkugeln over ${sectorName(a.sector)}! Sperrfeuer: every gun on the line.`, 'alert');
    sim.crews.sosCalled(m);
  }

  breach(g) {
    const sim = this.sim;
    if (sim.attract || sim.scripted) return;
    const s = g.sector;
    sim.front[s] = Math.max(0, sim.front[s] - 0.5);
    sim.radio(`The enemy is in our front line at ${sectorName(s)}!`, 'alert');
    if (sim.front[s] <= 0.01) {
      sim.front[s] = 0;
      sim.radio(`${sectorName(s)} is lost.`, 'alert');
      sim.stats.sectorsLost++;
    }
  }

  convoy() {
    const sim = this.sim, t = sim.targetById('X1');
    if (!t) return null;
    sim.targetAI.convoy(t, sim.rng() < 0.5 ? 1 : -1);
    t.known = true;
    const m = this.siteMission('X1');
    m.convoy = true;
    return m;
  }

  train() {
    const sim = this.sim, t = sim.targetById('R1');
    if (!t) return null;
    sim.targetAI.train(t);
    t.known = true;
    return this.siteMission('R1');
  }

  // our counter-attack: the Feuerwalze lifts west 100 m every 40 s ahead of the German infantry
  zeroHour() {
    const sim = this.sim;
    const zero = sim.time + 55;
    const lanes = [{ sector: 'B', z: laneOf('B') }, { sector: 'C', z: laneOf('C') }];
    const b = sim.barrage = {
      active: true, zero, k: 0, spacing: 100, lifts: [], lanes, nextLift: zero + 130, liftEvery: 40, kMax: 10, end: 0,
      xAt: (z) => lineX(LINES.britishFront, z) + 30 - b.k * b.spacing,
      missions: [],
    };
    sim.infAI.spawnOwn(lanes);
    sim.zero = { n0: sim.infantry.filter((g) => g.own).reduce((s, g) => s + g.n0, 0) };
    for (const l of lanes) {
      const m = this.addMission({ kind: 'barrage', title: `Feuerwalze, ${sectorName(l.sector)}`, x: b.xAt(l.z), z: l.z, observer: 'map', sector: l.sector, deadline: 600 });
      m.lane = l;
      b.missions.push(m);
    }
    sim.radio('Gegenangriff in one minute. Lay on the Feuerwalze line and lift on the timetable: 100 m every 40 seconds.', 'warn');
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
        m.gridRef = sim.theatre.ref(m.x, m.z);
      }
      sim.radio(`Feuerwalze lifts: line ${b.k} of ${b.kMax}, 100 m.`, 'warn');
      sim.events.lift?.(b.k, b);
    } else if (b.k >= b.kMax && !b.end) b.end = sim.time + 40;
    const own = sim.infantry.filter((g) => g.own);
    const done = own.every((g) => g.state === 'in' || g.n <= 0);
    if ((done && sim.time > b.zero + 30) || (b.end && sim.time > b.end + 100)) this.zeroEnd();
  }

  zeroEnd() {
    const sim = this.sim, b = sim.barrage;
    if (!b.active) return;
    b.active = false;
    const own = sim.infantry.filter((g) => g.own);
    const inn = own.filter((g) => g.state === 'in').reduce((s, g) => s + g.n, 0);
    const n0 = sim.zero.n0;
    sim.zero.survivors = inn;
    for (const m of b.missions) this.finish(m, true);
    if (sim.attract) return;
    // the counter-attack needs 15 points less of its men in than the British Zero hour (a shorter walk, no wire)
    if (inn >= n0 * (sim.difficulty.zero - 0.15)) this.setState('victory', `The counter-attack has retaken the old line: ${inn} of ${n0} men are in.`);
    else this.setState('defeat', `The counter-attack failed: only ${inn} of ${n0} men reached the objective.`);
  }

  // ------------------------------------------------------------------ per step
  update(dt) {
    const sim = this.sim, now = sim.time, op = this.op;
    if (sim.scripted) return this.scriptedUpdate();
    sim.clock = (sim.attract ? op.clockStart + 0.6 + 0.8 * Math.sin(now / 160) : clockOf(op.clock, now)) % 24;
    sim.night = sim.clock >= 19 || sim.clock < 5;
    if (sim.attract) return this.attractUpdate(dt);
    let ph = 1;
    for (const p of op.phases) if (now >= p.t0) ph = p.n;
    if (ph !== sim.phase || !this.phaseSent) {
      sim.phase = ph;
      this.phaseSent = ph;
      const p = op.phases[ph - 1];
      sim.events.phase?.(ph, p.title, p.sub);
      sim.radio(`${p.title}. ${p.sub}`, 'info');
    }
    while (this.si < this.script.length && this.script[this.si].t <= now) this.script[this.si++].fn();
    for (const a of sim.assaults) if (a.state === 'forming' && !a.missionId && now >= a.rocketsAt) {
      a.state = 'called';
      this.rockets(a);
    }
    this.watchBatteries();
    this.missionsUpdate();
    if (op.kind === 'battle') {
      this.barrageUpdate(dt);
      for (const s of SECTORS) if (sim.front[s.id] > 0 && sim.front[s.id] < 1 && !sim.assaults.some((a) => a.sector === s.id)) sim.front[s.id] = Math.min(1, sim.front[s.id] + dt * 0.02 / 60);
      const lost = Object.values(sim.front).filter((v) => v <= 0).length;
      if (lost >= 2 && sim.state === 'playing') this.setState('defeat', 'Two sectors of our front are lost.');
    } else if (op.kind === 'gustav' || op.kind === 'karl') this.siegeUpdate();
    if (sim.units.every((u) => !u.alive) && sim.state === 'playing') this.setState('defeat', 'Every gun is lost.');
  }

  // a siege ends when the fortress works are destroyed, or when the shells or the time run out
  siegeUpdate() {
    const sim = this.sim;
    if (sim.state !== 'playing') return;
    // a work counts as broken when it is destroyed or half its parts are (a breached ring barracks, a fort with two
    // casemates gone)
    const works = sim.targets.filter((t) => !t.battery);
    const down = works.filter((t) => !t.alive || t.parts.filter((p) => !p.alive).length * 2 >= t.parts.length).length;
    const heavy = sim.units.find((u) => u.def.special);
    const shells = heavy ? heavy.ammo.he + heavy.pieces.filter((p) => p.loaded).length + (heavy.special?.reserve ?? 0) : 0;
    const flying = sim.shells.some((s) => s.own && s.unitId === heavy?.id);
    if (down === works.length) this.setState('victory', `Every work of the fortress is broken (${down} of ${works.length}).`);
    else if (heavy && !shells && !flying && heavy.special?.ready) {
      const need = Math.ceil(works.length * 0.6);
      this.setState(down >= need ? 'victory' : 'defeat', `The ${heavy.callsign}'s shells are spent: ${down} of ${works.length} works destroyed${down >= need ? '' : ', not enough'}.`);
    } else if (sim.time > (sim.theatre.op.timeLimit ?? 2400)) {
      const need = Math.ceil(works.length * 0.6);
      this.setState(down >= need ? 'victory' : 'defeat', `The day is over: ${down} of ${works.length} works destroyed.`);
    }
  }

  watchBatteries() {
    const sim = this.sim, now = sim.time;
    if (sim.phase < 2 && this.op.kind === 'battle') return;
    for (const t of sim.targets) {
      if (!t.battery || !t.alive || now - t.firedAt > 30) continue;
      if (sim.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed')) continue;
      if (t.cbLast && now - t.cbLast < 200) continue;
      t.cbLast = now;
      this.siteMission(t.id);
    }
  }

  missionsUpdate() {
    const sim = this.sim;
    for (const m of sim.missions) {
      if (m.state === 'done' || m.state === 'failed') continue;
      const t = m.targetId ? sim.targetById(m.targetId) : null;
      if (m.kind === 'cb' && t && t.alive && t.parts.filter((p) => p.alive).length <= 1) {
        this.finish(m, true, 'the battery is silenced');
        continue;
      }
    }
    super.missionsUpdate();
  }

  attractUpdate(dt) {
    const sim = this.sim, now = sim.time;
    sim.phase = 3;
    this.attractT -= dt;
    const open = sim.missions.filter((m) => m.state === 'open' || m.state === 'ranging' || m.state === 'ffe');
    if (this.attractT <= 0 && open.length < 5) {
      this.attractT = 11 + sim.rng() * 10;
      const pool = sim.targets.filter((t) => t.alive && t.present !== false && t.kind !== 'aconvoy' && t.kind !== 'railyard');
      const t = pool[Math.floor(sim.rng() * pool.length)];
      if (t && !open.some((m) => m.targetId === t.id)) this.siteMission(t.id, { observer: 'foo', deadline: 300 });
    }
    if (this.op.kind === 'battle' && !sim.assaults.length && now > 90 && (now % 200) < dt) this.assault(['A', 'B', 'C', 'D'][Math.floor(sim.rng() * 4)], 0.7);
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

export { DEG };

import { BATTERIES } from './campaign-data.js';
import { UNITS, PAD_EXTRA, DEG } from './sector.js';
import { OPS, ww2Theatre } from './ww2/theatre.js';
import { Director } from './sim/director.js';
import { DirectorWW2 } from './ww2/director.js';
import { Targets } from './sim/targets.js';
import { TargetsWW2 } from './ww2/targets.js';
import { Enemy } from './sim/enemy.js';
import { EnemyWW2 } from './ww2/enemy.js';
import { Crews } from './sim/crews.js';
import { CrewsWW2 } from './ww2/crews.js';

const profile = kind => BATTERIES.find(b => b.kind === kind);
const definitions = [...UNITS, ...Object.values(OPS).flatMap(op => op.units)];

// Earlier batteries have real assignments, ammunition and targets, not passive unlock requirements.
export function campaignTheatre(mission) {
  const german = mission.era === 'ww2';
  const base = german ? ww2Theatre('flanders') : { id: '1917', modules: {}, bounds: 90000 };
  const units = mission.roster.map((kind, i) => {
    const source = definitions.find(u => u.kind === kind);
    // Each battery faces its own objective along a parallel lane. Ranges are authored per weapon.
    return { ...source, id: i + 1, pos: { x: -6000, z: -6500 + i * 1400 }, zero: 90 * DEG,
      target: kind === 'v1' || kind === 'v2' ? { name: 'Offshore instrumented target area', dist: profile(kind).range, bearing: 90 * DEG } : undefined,
      mode: kind === mission.reward ? 'manual' : 'auto', ammo: ['gustav', 'karl', 'rail'].includes(kind) ? 18 : source.ammo };
  });
  const sites = units.filter(u => profile(u.kind).target).map(u => {
    const b = profile(u.kind);
    return { id: `C${u.id}`, kind: b.target, name: `${b.role} — ${u.callsign}`, pos: { x: u.pos.x + b.range, z: u.pos.z }, bearing: 270 * DEG, r: 80 };
  });
  const karl = units.find(u => u.kind === 'karl');
  const positions = karl ? [{ id: 'a', name: 'Stellung A — citadel approach', pos: { x: karl.pos.x + 150, z: karl.pos.z }, cover: .8, note: 'Drive forward, lower hull, then load by crane.' }] : [];
  const op = { id: mission.id, kind: 'campaign', title: mission.title, short: mission.title, sub: mission.briefing,
    blurb: mission.briefing, history: 'Fictional combined battery exercises, arranged by equipment role rather than historical chronology.',
    enemy: 'british', units, sites, positions, target: { name: 'Offshore instrumented target area', dist: 160000, bearing: 90 * DEG },
    clock: [[0, 9], [mission.timeLimit, 12]], phases: [], timeLimit: mission.timeLimit };
  for (const u of units) PAD_EXTRA.push({ x: u.pos.x, z: u.pos.z, rx: u.kind === 'gustav' ? 70 : 45, rz: u.kind === 'gustav' ? 210 : 75, heading: -u.zero, blend: 25 });
  return { ...base, campaign: mission, op, opId: mission.id, units, sites, sectors: [],
    modules: { ...base.modules,
      Director: campaignDirector(german ? DirectorWW2 : Director),
      Targets: campaignTargets(german ? TargetsWW2 : Targets),
      Enemy: campaignEnemy(german ? EnemyWW2 : Enemy),
      Crews: campaignCrews(german ? CrewsWW2 : Crews),
    } };
}

function campaignTargets(Base) {
  return class extends Base {
    applyBurst(shell, pos, air) {
      this.campaignShell = shell;
      try { return super.applyBurst(shell, pos, air); }
      finally { this.campaignShell = null; }
    }
    damagePart(target, i, damage, by) {
      const objective = this.sim.campaignObjectives?.find(o => o.targetId === target.id);
      const u = this.sim.unitById(by), shell = this.campaignShell;
      // Credit effective damage, not an overkill number, and require the objective's battery and fuze.
      if (objective && u?.kind === objective.kind && (shell?.fuze === objective.fuze || !shell && objective.shots.size > 0)) {
        objective.damage += Math.min(Math.max(0, target.parts[i]?.hp ?? 0), damage);
        if (shell) objective.shots.add(shell.id);
      }
      super.damagePart(target, i, damage, by);
      target.respawnAt = 0;
    }
  };
}
function campaignCrews(Base) {
  return class extends Base {
    pick(u, ai) {
      // A player may hand the preassigned candidate battery to its AI crew.
      if (u.missionId && !ai.m) this.sim.director.release(u);
      super.pick(u, ai);
    }
    canServe(u, m) { return (!m.requiredKind || m.requiredKind === u.kind) && super.canServe(u, m); }
  };
}
function campaignDirector(Base) {
  return class extends Base {
    buildScript() { return []; }
    reset() {
      super.reset();
      this.script = [];
      this.opened = false;
      this.sim.campaignObjectives = [];
      this.sim.front = {};
    }
    assign(u, m) {
      if (m.requiredKind && m.requiredKind !== u.kind) return false;
      return super.assign(u, m);
    }
    defaultFuze(m, u) { return profile(u.kind).fuze || super.defaultFuze(m, u); }
    onFire(u, piece, shell) {
      const objective = this.sim.campaignObjectives?.find(o => o.unitId === u.id);
      if (objective) objective.fired.add(shell.id);
    }
    // Strategic controllers must not end the entire combined operation on their own.
    setState(state, message) {
      if (!this.resolving) return;
      super.setState(state, message);
    }
    resolve(win, message) {
      this.resolving = true;
      this.sim.over = { title: win ? 'Battery earned' : 'Mission incomplete', sub: message };
      this.setState(win ? 'victory' : 'defeat', message);
      this.resolving = false;
    }
    openObjectives() {
      const sim = this.sim, def = sim.theatre.campaign;
      this.opened = true;
      for (const u of sim.units) {
        const b = profile(u.kind), target = sim.targetById(`C${u.id}`);
        const o = { kind: u.kind, unitId: u.id, name: b.name, task: b.task, fuze: b.fuze,
          targetId: target?.id, damage: 0, shots: new Set(), fired: new Set(), requiredDamage: (target?.maxHp ?? 0) * (b.damage ?? 0),
          requiredRounds: b.rounds, done: false, progress: 0 };
        sim.campaignObjectives.push(o);
        if (target) {
          target.known = true;
          const m = this.addMission({ kind: target.fire ? 'cb' : 'destroy', title: `${u.callsign}: ${b.role}`, targetId: target.id,
            x: target.pos.x, z: target.pos.z, observer: 'air', deadline: def.timeLimit, hint: b.task });
          m.requiredKind = u.kind;
          o.missionId = m.id;
          if (u.kind === def.reward) { this.assign(u, m); u.mode = 'manual'; }
        }
        // Earned batteries support automatically. Gustav assembly belongs only to Sevastopol.
        if (u.kind !== def.reward) u.mode = 'auto';
        if (u.kind === 'gustav') { sim.special?.of(u)?.finishAll(); u.gate = null; sim.guns.recompute(u); }
      }
      sim.radio(`${def.title}. Complete every battery assignment. Candidate battery is on loan until victory.`, 'info');
    }
    update(dt) {
      const sim = this.sim;
      if (sim.attract) { sim.clock = 9; return; }
      if (sim.scripted) return super.scriptedUpdate();
      if (sim.state !== 'playing') return;
      if (!this.opened) this.openObjectives();
      sim.clock = 9 + sim.time / 3600;
      sim.night = false;
      sim.phase = sim.time > 180 ? 2 : 1;
      for (const o of sim.campaignObjectives) {
        if (o.done) continue;
        const u = sim.unitById(o.unitId), b = profile(o.kind);
        if (!u?.alive) { this.resolve(false, `${b.name} lost before its assignment was completed. Retry to earn the battery.`); return; }
        if (!b.target) {
          const good = u.special?.flights.filter(f => Math.abs(f.bErr) <= 1 && Math.abs(f.rErr) <= .01 && f.short === 0 && !['crash', 'blast'].includes(f.fate)).length ?? 0;
          o.progress = Math.min(1, good / o.requiredRounds);
        } else {
          o.progress = Math.min(1, o.damage / o.requiredDamage, o.fired.size / o.requiredRounds);
          if (o.kind === 'karl' && !u.special?.posId) o.progress = Math.min(o.progress, .99);
          if (!sim.targetById(o.targetId).alive && o.progress < 1 && !u.firing && !sim.shells.some(s => s.own && s.unitId === u.id && s.alive)) {
            this.resolve(false, `${b.name}: target destroyed before the required ${b.fuze}-fuzed shoot was completed.`); return;
          }
        }
        if (o.progress >= 1) {
          o.done = true;
          const m = sim.missionById(o.missionId);
          if (m) this.finish(m, true, 'battery assignment complete');
          u.mode = 'hold';
          sim.guns.cease(u);
          sim.radio(`${b.name}: assignment complete.`, 'kill');
        }
      }
      if (sim.campaignObjectives.every(o => o.done)) {
        // a V-1 or V-2 win adds nothing to fire: their own operations are open to all
        const r = profile(sim.theatre.campaign.reward);
        this.resolve(true, `${r.name} ${r.sandbox === false ? 'earned' : 'is now available in sandbox'}. All supporting assignments completed.`);
      } else if (sim.time >= sim.theatre.campaign.timeLimit * sim.difficulty.time) this.resolve(false, 'The operation window closed before every battery completed its assignment.');
    }
  };
}

function campaignEnemy(Base) {
  return class extends Base {
    reset() { super.reset(); this.nextCampaignFire = 120; }
    update(dt) {
      const sim = this.sim;
      if (sim.attract || sim.scripted || sim.state !== 'playing') return;
      // Keep warning/aircraft machinery; suppress the original full-battle artillery schedule.
      this.warn?.();
      this.airUpdate?.(dt);
      if (sim.time < this.nextCampaignFire) return;
      this.nextCampaignFire = sim.time + 35 / sim.difficulty.cb;
      for (const t of sim.targets) {
        if (!t.fire || !t.alive || sim.time < t.suppressed) continue;
        const objective = sim.campaignObjectives.find(o => o.targetId === t.id);
        if (objective?.done) continue;
        const u = sim.unitById(objective?.unitId);
        if (!u?.alive) continue;
        const part = t.parts.find(p => p.alive);
        if (!part) continue;
        const error = Math.max(65, 240 - sim.time * .12);
        this._cb = true;
        this.launch(t.id, part, u.pos.x + sim.gauss() * error, u.pos.z + sim.gauss() * error, t.shell);
        this._cb = false;
        t.firedAt = sim.time;
      }
    }
  };
}

// The open battle grows to the whole German roster as it is earned. Specialist
// operations remain available too, with their own sites and victory conditions.
export function sandboxTheatre(opId = 'flanders') {
  const th = ww2Theatre(opId);
  if (opId !== 'flanders') return th;
  // `ready`: set up and ready to fire, no emplacement drill (src/ww2/special.js); the crew reloads and lays. The V-1
  // and V-2 are not here: they fire in their own operations (BATTERIES `sandbox: false`).
  const extras = [
    { ...OPS.karl.units[0], id: 7, pos: { x: 6000, z: 1800 }, zero: 270 * DEG, mode: 'auto', ready: true },
  ];
  const units = [...th.units, ...extras];
  const positions = [
    { id: 'a', name: 'Stellung A — northern approach', pos: { x: 5700, z: 1800 }, cover: .7 },
    { id: 'b', name: 'Stellung B — central approach', pos: { x: 4500, z: -1300 }, cover: .8 },
  ];
  const op = { ...th.op, units, positions, target: { name: 'the enemy supply port', dist: 160000, bearing: 270 * DEG } };
  for (const u of extras) PAD_EXTRA.push({ x: u.pos.x, z: u.pos.z, rx: 40, rz: 50, heading: -u.zero, blend: 25 });
  // the Karl stands in its prepared positions (as ww2Pads levels the Brest ones)
  for (const q of positions) PAD_EXTRA.push({ x: q.pos.x, z: q.pos.z, rx: 12, rz: 16, heading: -extras[0].zero, blend: 20 });
  return { ...th, op, units };
}

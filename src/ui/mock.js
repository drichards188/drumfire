// A mock world with the DESIGN.md shapes, so the console can be built and tested without the sim or the
// 3D view: units with pieces that cycle through the loading drill, missions and known targets, shells
// that fly and burst, observers' reports, a range table and `solve` good enough to lay by, and commands
// that change the world. `startMock()` is what ui.html runs. Scenarios: ?scn=ranging | sos | dead | night.
import { Panel } from './panel.js';
import { UNITS, SITES, SECTORS, LINES, YARD, DEG, bearingOf, gridRef, piecePlacements } from '../sector.js';

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const MAXR = { bl15: [6200, 8000, 9500], bl92: [7000, 9300, 11500], bl6: [5000, 7400, 9500], bl60: [8200, 11000], rail: [9000, 14500, 20300] };
const CYCLE = { bl15: 50, bl92: 25, bl6: 12, bl60: 10, rail: 90 };
const STEP = [['depress', 0.1], ['open', 0.07], ['shell', 0.22], ['ram', 0.1], ['cartridge', 0.18], ['close', 0.08], ['prime', 0.06], ['lay', 0.19]];
const CREW = { bl15: 12, bl92: 9, bl6: 7, bl60: 6, rail: 14 };
const HP = { bl15: 400, bl92: 300, bl6: 200, bl60: 160, rail: 600 };
const CAL = { bl15: 15, bl92: 9.2, bl6: 6, bl60: 5, rail: 18 };

const tableCache = {};
function tableFor(kind, charge) {
  const list = MAXR[kind] || MAXR.bl6;
  const c = Math.min(charge, list.length - 1);
  if (charge >= list.length) return [];
  const k = `${kind}${c}`;
  if (tableCache[k]) return tableCache[k];
  const rmax = list[c], g = 9.81, v = Math.sqrt(rmax * g), out = [];
  for (let r = Math.ceil((rmax * 0.34) / (YARD * 100)) * YARD * 100; r <= rmax; r += YARD * 100) {
    const el = 0.5 * Math.asin(Math.min(1, r / rmax));
    const tof = 2 * v * Math.sin(el) / g * 0.85;
    out.push({ range: r, el, tof, apex: tof * tof * g / 8 * 0.8 });
  }
  return (tableCache[k] = out);
}
function interp(tab, range) {
  if (!tab.length) return { el: 0.5, tof: 30, apex: 2000 };
  if (range <= tab[0].range) return tab[0];
  for (let i = 0; i < tab.length - 1; i++) {
    const a = tab[i], b = tab[i + 1];
    if (range <= b.range) { const f = (range - a.range) / (b.range - a.range); return { el: a.el + (b.el - a.el) * f, tof: a.tof + (b.tof - a.tof) * f, apex: a.apex + (b.apex - a.apex) * f }; }
  }
  return tab[tab.length - 1];
}
const fwd = (b) => ({ x: Math.sin(b), z: -Math.cos(b) });
const rgt = (b) => ({ x: Math.cos(b), z: Math.sin(b) });

export class MockWorld {
  constructor(seed = 3) {
    this.rng = mulberry(seed);
    this.time = 0; this.clock = 5.25; this.alpha = 0; this.state = 'playing'; this.score = { points: 120 };
    this.wind = { bearing: 250 * DEG, speed: 4 };
    this.front = { A: 1, B: 1, C: 0.8, D: 1 };
    this.shells = []; this.missions = []; this.infantry = []; this.pending = []; this.nextShell = 1; this.nextMission = 1;
    this.log = [];
    this.units = UNITS.map((d) => this.makeUnit(d));
    this.targets = SITES.map((s) => ({
      id: s.id, kind: s.kind, name: s.name, pos: { x: s.pos.x, y: 0, z: s.pos.z }, bearing: s.bearing, r: s.r, alive: true,
      known: ['B1', 'B2', 'M1', 'M2', 'M3', 'D1', 'K1', 'X1', 'B3', 'H1'].includes(s.id), active: true, hp: 100, maxHp: 100, parts: [], damage: 0,
    }));
    this.addMission('cb', 'B1', 'foo', 3, 400);
    this.addMission('destroy', 'M2', 'foo', 2, 600);
    this.addMission('cb', 'B3', 'sound', 2, 900);
    this.addMission('destroy', 'D1', 'air', 1, 1100);
    this.addMission('wire', null, 'map', 1, 1500, 4300, -1200, 'Cut the wire in front of Frezenberg');
    this.addMission('harass', 'X1', 'map', 1, 1800);
    this.events = {};
  }

  makeUnit(d) {
    const pl = piecePlacements(d);
    const c0 = { he: { bl15: 60, bl92: 120, bl6: 240, bl60: 260, rail: 36 }[d.kind], shrapnel: d.kind === 'bl60' ? 120 : 0 };
    const u = {
      id: d.id, kind: d.kind, name: d.name, callsign: d.callsign, battery: d.battery, pos: { x: d.pos.x, y: 0, z: d.pos.z }, zero: d.zero, alive: true,
      mode: 'manual', missionId: null, ammo: c0, signature: 0.1 + 0.1 * d.id, stats: { rounds: 0, hits: 0, kills: 0 }, arc: 30 * DEG,
      order: { x: 0, z: 0, line: d.zero, range: 0, charge: 1, el: 0, tof: 0, fuze: 'instant', rounds: 1, adj: { add: 0, right: 0 }, target: null },
      cal: { add: (this.rng() - 0.5) * 500, right: (this.rng() - 0.5) * 200 }, firing: 0, auto: 0,
      pieces: pl.map((p, i) => ({
        i, kind: p.kind, pos: { x: p.x, y: 0, z: p.z }, bearing: p.bearing, az: 0, el: 0.3, cmd: { az: 0, el: 0.3 }, state: 'idle', job: null, recoil: 0, breech: 0,
        loaded: false, crew: CREW[d.kind], crewMax: CREW[d.kind], hp: HP[d.kind], maxHp: HP[d.kind], wear: 0.05 * i, firedAt: -99, stage: 0, fireAt: 0,
      })),
    };
    return u;
  }

  addMission(kind, targetId, observer, priority, deadline, x, z, title) {
    const t = targetId && this.targets.find((q) => q.id === targetId);
    const px = t ? t.pos.x : x, pz = t ? t.pos.z : z;
    const m = {
      id: this.nextMission++, kind, title: title || (t ? (kind === 'cb' ? `Hostile battery active (${t.name})` : `${t.name}`) : kind), targetId: targetId || null, x: px, z: pz,
      gridRef: gridRef(px, pz), observer, priority, t0: this.time, deadline: this.time + deadline, unitId: null, state: 'open', reports: [],
    };
    this.missions.push(m);
    return m;
  }
  unitById(id) { return this.units.find((u) => u.id === id); }
  targetById(id) { return this.targets.find((t) => t.id === id); }
  missionById(id) { return this.missions.find((m) => m.id === id); }
  rangeTable(kind, charge) { return tableFor(kind, charge); }
  solve(unitId, x, z, charge) {
    const u = this.unitById(unitId), c = charge == null ? u.order.charge : charge;
    const range = Math.hypot(x - u.pos.x, z - u.pos.z), e = interp(tableFor(u.kind, c), range);
    return { line: bearingOf(x - u.pos.x, z - u.pos.z), range, el: e.el, tof: e.tof, charge: c };
  }

  retarget(u) {
    const o = u.order, t = o.target;
    if (!t) return;
    o.x = t.x + o.adj.add * fwd(bearingOf(t.x - u.pos.x, t.z - u.pos.z)).x + o.adj.right * rgt(bearingOf(t.x - u.pos.x, t.z - u.pos.z)).x;
    o.z = t.z + o.adj.add * fwd(bearingOf(t.x - u.pos.x, t.z - u.pos.z)).z + o.adj.right * rgt(bearingOf(t.x - u.pos.x, t.z - u.pos.z)).z;
    const s = this.solve(u.id, o.x, o.z, o.charge);
    // out of range for the charge: pull the charge up if there is one
    o.line = s.line; o.range = s.range; o.el = s.el; o.tof = s.tof;
    for (const p of u.pieces) { p.cmd.az = (o.line - p.bearing); p.cmd.el = o.el; }
  }

  command(id, name, a = {}) {
    const u = this.unitById(id);
    if (name === 'sos') { for (const q of this.units) { const s = SECTORS.find((x) => x.id === a.sector); if (s) { q.order.target = { x: LINES.britishFront[3].x + 100, z: (s.from + s.to) / 2 }; q.order.adj = { add: 0, right: 0 }; q.order.rounds = 4; this.retarget(q); q.firing = 4; q.missionId = null; } } this.log.push(['sos', a]); return; }
    if (!u || !u.alive) return;
    const o = u.order;
    switch (name) {
      case 'mission': { const m = this.missionById(a.id); if (!m) return; m.unitId = u.id; m.state = 'ranging'; u.missionId = m.id; o.target = { x: m.x, z: m.z }; o.adj = { add: 0, right: 0 }; o.rounds = 1; u.firing = 0; this.retarget(u); break; }
      case 'lay': u.missionId = null; o.target = { x: a.x, z: a.z }; o.adj = { add: 0, right: 0 }; u.firing = 0; this.retarget(u); break;
      case 'correct': o.adj.add += a.add || 0; o.adj.right += a.right || 0; this.retarget(u); break;
      case 'charge': o.charge = a.charge; this.retarget(u); break;
      case 'fuze': o.fuze = a.fuze; break;
      case 'rounds': o.rounds = a.n; break;
      case 'fire': if (o.target) { u.firing = o.rounds; for (const p of u.pieces) p.fireAt = this.time + p.i * 0.8; } break;
      case 'cease': u.firing = 0; break;
      case 'mode': u.mode = a.mode; break;
    }
    this.log.push([name, a]);
  }

  update(dt) {
    this.time += dt; this.clock += dt / 3600 * 6;
    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    for (const s of this.shells) {
      if (!s.alive) continue;
      s.t += dt;
      const f = Math.min(1, s.t / s.tof);
      s.prev = { ...s.pos };
      s.pos.x = s.from.x + (s.aim.x - s.from.x) * f; s.pos.z = s.from.z + (s.aim.z - s.from.z) * f;
      s.pos.y = 4 * s.apex * f * (1 - f);
      if (f >= 1) { s.alive = false; this.burst(s); }
    }
    this.shells = this.shells.filter((s) => s.alive || s.t < s.tof + 0.2);
    for (const p of this.pending.slice()) if (this.time >= p.t) { this.pending.splice(this.pending.indexOf(p), 1); p.fn(); }
    // new calls come in over time; enemy shells now and then
    if (this.time > 20 && !this._n1) { this._n1 = 1; this.addMission('destroy', 'M3', 'foo', 2, 700); }
    if (this.mockEnemy && this.time > this._enemyT) { this._enemyT = this.time + this.mockEnemy; this.enemyShell(); }
    for (const m of this.missions) if ((m.state === 'open') && this.time > m.deadline) { m.state = 'failed'; m.tEnd = this.time; }
  }

  enemyShell() {
    const u = this.units[Math.floor(this.rng() * this.units.length)];
    const aim = { x: u.pos.x + (this.rng() - 0.5) * 240, z: u.pos.z + (this.rng() - 0.5) * 240 };
    const from = { x: 7500 + this.rng() * 1500, y: 0, z: u.pos.z + (this.rng() - 0.5) * 1000 };
    this.shells.push({ id: this.nextShell++, own: false, unitId: null, piece: 0, kind: 'fh15', calibre: 5.9, pos: { ...from }, prev: { ...from }, vel: { x: 0, y: 0, z: 0 }, fuze: 'instant', t: 0, tof: 18, aim, from, apex: 2200, alive: true });
  }

  updateUnit(u, dt) {
    const o = u.order, tab = tableFor(u.kind, o.charge), total = CYCLE[u.kind];
    // auto crews take the top open mission, fire, and apply corrections from the reports
    if (u.mode === 'auto') {
      u.auto -= dt;
      if (u.missionId == null && u.auto <= 0) { const m = this.missions.filter((q) => q.state === 'open').sort((a, b) => b.priority - a.priority)[0]; if (m) { this.command(u.id, 'mission', { id: m.id }); u.firing = 1; u.auto = 8; } }
      else if (u.missionId != null && !u.firing && u.auto <= 0 && !this.shells.some((s) => s.unitId === u.id && s.alive)) { u.firing = 1; u.auto = 6; for (const p of u.pieces) p.fireAt = this.time; }
    }
    if (u.mode === 'hold') u.firing = 0;
    for (const p of u.pieces) {
      if (p.state === 'dead') continue;
      const wantLoad = !!o.target && u.mode !== 'hold';
      if (p.state === 'recoil') { p.recoil = Math.max(0, p.recoil - dt * 0.8); if (p.recoil <= 0) { p.state = 'idle'; p.loaded = false; } continue; }
      if (p.state === 'idle' && wantLoad) { p.state = 'loading'; p.stage = 0; p.job = { step: STEP[0][0], t: 0, dur: STEP[0][1] * total, i: 0, n: STEP.length }; }
      if (p.state === 'loading') {
        p.job.t += dt;
        if (p.job.t >= p.job.dur) {
          p.stage++;
          if (p.stage >= STEP.length) { p.state = 'ready'; p.job = null; p.loaded = true; }
          else p.job = { step: STEP[p.stage][0], t: 0, dur: STEP[p.stage][1] * total, i: p.stage, n: STEP.length };
        }
        if (p.job && p.job.step === 'lay') { const f = p.job.t / p.job.dur; p.az += (p.cmd.az - p.az) * Math.min(1, f * 0.4 + dt); p.el += (p.cmd.el - p.el) * Math.min(1, f * 0.4 + dt); }
      }
      if (p.state === 'ready') {
        p.az += (p.cmd.az - p.az) * Math.min(1, dt * 3); p.el += (p.cmd.el - p.el) * Math.min(1, dt * 3);
        if (u.firing > 0 && this.time >= p.fireAt) this.fire(u, p);
      }
    }
    if (u.firing > 0 && u.pieces.every((p) => p.state !== 'ready' && p.state !== 'loading' && p.state !== 'idle' ? true : false) && false) u.firing = 0;
  }

  fire(u, p) {
    const o = u.order, tab = tableFor(u.kind, o.charge);
    const e = interp(tab, o.range);
    p.state = 'recoil'; p.recoil = 1; p.firedAt = this.time; p.loaded = false; p.wear = Math.min(1, p.wear + 0.01);
    u.stats.rounds++; u.ammo.he = Math.max(0, u.ammo.he - 1);
    u.firing = Math.max(0, u.firing - (u.pieces.every((q) => q.state !== 'ready') ? 1 : 0));
    p.rounds = (p.rounds || 0) + 1;
    if (p.rounds >= o.rounds) { p.rounds = 0; u.firing = 0; }
    const t = o.target, b0 = bearingOf(t.x - u.pos.x, t.z - u.pos.z);
    // where it lands: the aimpoint, the battery's calibration error and dispersion
    const disp = 22 + o.range * 0.004;
    const dx = (this.rng() - 0.5) * 2 * disp, dz = (this.rng() - 0.5) * 2 * disp;
    const f = fwd(b0), r = rgt(b0);
    const land = { x: o.x + f.x * u.cal.add + r.x * u.cal.right + dx, z: o.z + f.z * u.cal.add + r.z * u.cal.right + dz };
    const from = { x: p.pos.x, y: 3, z: p.pos.z };
    const s = { id: this.nextShell++, own: true, unitId: u.id, piece: p.i, kind: u.kind, calibre: CAL[u.kind], pos: { ...from }, prev: { ...from }, vel: { x: 0, y: 0, z: 0 }, fuze: o.fuze, t: 0, tof: e.tof, aim: land, from, apex: e.apex, alive: true, missionId: u.missionId };
    this.shells.push(s);
  }

  burst(s) {
    if (!s.own) return;
    const u = this.unitById(s.unitId);
    const t = u.order.target;
    for (const tg of this.targets) if (tg.alive && Math.hypot(tg.pos.x - s.aim.x, tg.pos.z - s.aim.z) < 40 + tg.r) { tg.hp -= 34; if (tg.hp <= 0) { tg.alive = false; u.stats.kills++; const m = this.missions.find((q) => q.targetId === tg.id && q.state !== 'done'); if (m) { m.state = 'done'; m.tEnd = this.time; this.score.points += 100 * m.priority; if (u.missionId === m.id) u.missionId = null; } } }
    const m = u.missionId != null ? this.missionById(u.missionId) : null;
    if (m && m.state !== 'done') {
      const b0 = bearingOf(m.x - u.pos.x, m.z - u.pos.z), f = fwd(b0), r = rgt(b0);
      const ex = s.aim.x - m.x, ez = s.aim.z - m.z;
      const over = ex * f.x + ez * f.z, right = ex * r.x + ez * r.z;
      const ok = Math.hypot(over, right) < 45;
      this.pending.push({ t: this.time + 3.5, fn: () => {
        let text, clock = null;
        const yds = (v) => Math.max(5, Math.round(Math.abs(v) / YARD / 5) * 5);
        if (m.observer === 'air') {
          const a = ((Math.atan2(ex, -ez) / DEG) + 360) % 360, hour = Math.round(a / 30) || 12, d = Math.hypot(ex, ez) / YARD;
          const L = [['Y', 10], ['Z', 25], ['A', 50], ['B', 100], ['C', 200], ['D', 300], ['E', 400], ['F', 500]];
          let best = L[L.length - 1]; for (const q of L) if (d <= q[1] * 1.3) { best = q; break; }
          clock = ok ? 'Y' + hour : best[0] + hour; text = ok ? `Y ${hour}  OK` : `${best[0]} ${hour}`;
        } else if (m.observer === 'sound') text = `Burst located ${gridRef(s.aim.x, s.aim.z)}, error 60 yards.`;
        else text = ok ? 'Target. Direct hit on the position. Fire for effect.' : `${over > 0 ? 'Over' : 'Short'} ${yds(over)}, ${right > 0 ? 'right' : 'left'} ${yds(right)}.`;
        m.reports.push({ t: this.time, missionId: m.id, unitId: u.id, shellId: s.id, over, right, clock, text, ok });
        if (ok && m.state === 'ranging') m.state = 'ffe';
        if (u.mode === 'auto' && !ok) this.command(u.id, 'correct', { add: -over * 0.9, right: -right * 0.9 });
      } });
    }
  }
}

export function startMock() {
  const q = new URLSearchParams(location.search);
  const world = new MockWorld(Number(q.get('seed')) || 3);
  const view = document.getElementById('view');
  let selected = Number(q.get('unit')) || 1;
  const audio = { ui: (n) => { (window.__sounds || (window.__sounds = [])).push(n); } };
  const panel = new Panel(document.getElementById('panel'), {
    audio,
    onSelect: (id) => { selected = id; },
    onCommand: (id, name, args) => world.command(id, name, args),
  });
  let k = 0;
  const ff = (secs, step = 0.1) => { for (let t = 0; t < secs; t += step) { world.update(step); if (++k % 5 === 0) panel.update({ sim: world, selectedId: selected }, 0.5); } };
  const scn = q.get('scn');
  const u = () => world.unitById(selected);
  if (scn === 'ranging' || scn === 'sos' || scn === 'dead') {
    world.command(selected, 'mission', { id: Number(q.get('m')) || 1 });
    // keep the same mission but make the observer a person with a telephone unless asked
    ff(70 + CYCLE[u().kind]);
    const go = (n) => { for (let i = 0; i < n; i++) { world.command(selected, 'fire'); ff(CYCLE[u().kind] * 1.4 + 45); const rp = world.missionById(u().missionId)?.reports.at(-1); if (rp && !rp.ok) world.command(selected, 'correct', { add: -rp.over * 0.8, right: -rp.right * 0.8 }); } };
    go(Number(q.get('rounds')) || 2);
    world.command(selected, 'fire');
    ff(CYCLE[u().kind] * 0.3);
  }
  if (scn === 'sos') { world.addMission('sos', null, 'foo', 3, 300, LINES.britishFront[3].x + 100, -600, 'S.O.S. rockets over the Zonnebeke road'); world.front.B = 0.55; world.front.C = 0; world.mockEnemy = 5; world._enemyT = 0; ff(8); }
  if (scn === 'dead') { const uu = u(); uu.pieces[uu.pieces.length - 1].state = 'dead'; uu.pieces[uu.pieces.length - 1].hp = 0; uu.pieces[0].hp = uu.pieces[0].maxHp * 0.35; uu.pieces[0].crew = 3; world.mockEnemy = 4; world._enemyT = 0; ff(10); }
  window.__mock = { world, panel, select: (id) => { selected = id; }, ff };
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    world.update(dt * (Number(q.get('speed')) || 1));
    panel.update({ sim: world, selectedId: selected }, dt);
    view.dataset.sel = String(selected);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener('keydown', (e) => { const n = Number(e.key); if (n >= 1 && n <= 5 && !e.ctrlKey) selected = n; });
}

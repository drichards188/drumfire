// Dicke Bertha: the game logic of the first-person demo, Node-safe and deterministic per seed.
// One 42 cm M-Gerät at sector.js BERTHA, its crew stations, the fire orders from the Feuerleitung (fire
// direction), the loading drill, the shells in flight on the shared integrator, the observers' reports,
// the British targets (the main game's gun line, and Ypres) and the British counter-battery fire.
//
// Stations (the player is one man at a time; the rest stand idle unless `assist` is on):
//   cmd   Batterieführer: takes the order on the field telephone (ack)
//   trav  Seitenrichtkanonier: sets the deflection on the panoramic sight, cranks the carriage round
//   elev  Höhenrichtkanonier: sets the elevation on the clinometer, cranks the barrel up or down to load
//   load  Ladekanonier: opens the wedge, hoists the shell, rams it, the bags, the brass case, closes
//   fire  Abzugskanonier: in the firing trench, pulls the lanyard
// The page calls setInput() with the held keys and update(dt); everything else is read from the state.
import { BERTHA, UNITS, PLACES, piecePlacements, bearingOf, DEG, gridRef } from '../sector.js';
import { heightAt, groundKindAt } from '../terrainHeight.js';
import { solveElevation as solveBrit, autoCharge as autoBrit, maxRange as maxBrit, shellK } from '../sim/shells.js';
import { SHELLS as BRIT_SHELLS, GUNS as BRIT_GUNS } from '../sim/tables.js';
import { GUN, SHELLS, FUZES, MAX_BAGS, STRICH, toStrich, solve, choose, table, muzzleV, stepBallistic, STEP } from './ballistics.js';

export const STATIONS = [
  { id: 'cmd', key: 1, name: 'Batterieführer', en: 'Gun commander' },
  { id: 'trav', key: 2, name: 'Seitenrichtkanonier', en: 'Layer for line' },
  { id: 'elev', key: 3, name: 'Höhenrichtkanonier', en: 'Layer for elevation' },
  { id: 'load', key: 4, name: 'Ladekanonier', en: 'Loader' },
  { id: 'fire', key: 5, name: 'Abzugskanonier', en: 'Firer' },
];

// the British targets: the main game's five units (their pieces are the aim points) and the Cloth Hall at Ypres
const TARGET_LIST = [
  { id: 'ginger', unit: 2, name: 'Englische 6-Zoll-Batterie', en: '6-inch battery "Ginger"', fuze: 'oV', points: 80 },
  { id: 'longtom', unit: 1, name: 'Englische 60-Pfünder', en: '60-pounder section "Long Tom"', fuze: 'oV', points: 80 },
  { id: 'mother', unit: 3, name: 'Englische 23,4-cm-Haubitzen', en: '9.2-inch section "Mother"', fuze: 'oV', points: 120 },
  { id: 'granny', unit: 4, name: 'Englischer 38-cm-Mörser', en: '15-inch howitzer "Granny"', fuze: 'mV', points: 150 },
  { id: 'wolfe', unit: 5, name: 'Englisches Eisenbahngeschütz', en: '18-inch railway howitzer "Wolfe"', fuze: 'mV', points: 200 },
  { id: 'ypres', place: 'Ypres', name: 'Ypern, Tuchhallen', en: 'the Cloth Hall, Ypres', fuze: 'mV', points: 150, hp: 3, r: 90 },
];
// lethal radius of a burst against a gun in its pit (m), by shell and fuze
const LETHAL = { schwer: { oV: 40, mV: 32 }, leicht: { oV: 31, mV: 25 } };
// British counter-battery: shell radius (m) and damage to the Bertha at the centre
const CB_DAMAGE = { bl92: { R: 30, D: 24 }, rail: { R: 50, D: 45 }, bl60: { R: 16, D: 10 }, bl15: { R: 45, D: 40 }, bl6: { R: 20, D: 14 } };
export const DIFFICULTY = {
  Easy: { map: 0.6, cb: 0.55, cbErr: 1.4, dmg: 0.6 },
  Normal: { map: 1, cb: 0.8, cbErr: 1, dmg: 0.9 },
  Hard: { map: 1.4, cb: 1.6, cbErr: 0.75, dmg: 1.4 },
};
// tolerance for "laid" (Strich) and how long each loading action takes (s)
export const TOL = 2;
const DUR = { ack: 1.6, open: 3, hoist: 7, ram: 4, bag: 1.3, case: 2.2, close: 2.5, fire: 2.2, unload: 12 };

function rng32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a deflection from the base line as the order gives it: 'links 124' / 'left 124'
const fmtDefl = (rad, lang = 'de') => {
  const s = toStrich(rad);
  if (lang === 'en') return s === 0 ? 'zero line' : `${s > 0 ? 'left' : 'right'} ${Math.abs(s)}`;
  return s === 0 ? 'Grundrichtung' : `${s > 0 ? 'links' : 'rechts'} ${Math.abs(s)}`;
};
// a reason in both languages
const W = (de, en) => ({ de, en });
export { fmtDefl, toStrich };

export class BerthaGame {
  constructor({ seed = 1, difficulty = 'Normal', assist = false, range = false } = {}) {
    this.events = {};
    this.newGame({ seed, difficulty, assist, range });
  }

  emit(name, ...args) {
    this.events[name]?.(...args);
  }

  // range: the tutorial's quiet range (one target, small map error, no British reply)
  newGame({ seed = (Math.random() * 1e9) | 0, difficulty = this.difficulty ?? 'Normal', assist = this.assist ?? false, range = false } = {}) {
    this.range = range;
    this.seed = seed;
    this.rng = rng32(seed);
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'Normal';
    this.diff = DIFFICULTY[this.difficulty];
    this.assist = assist;
    this.time = 0;
    this.alpha = 1;
    this.acc = 0;
    this.state = 'playing'; // playing | victory | defeat
    this.station = 'cmd'; // where the player is ('none': every station is the crew's)
    this.score = 0;
    this.roundsFired = 0;
    this.log = [];
    this.shells = [];
    this.nextId = 1;
    const g = BERTHA.pos;
    this.ground = heightAt(g.x, g.z);
    // a daily wind (the air's velocity, m/s) that the Feuerleitung does not know all of
    const wa = this.rng() * Math.PI * 2, ws = 1.5 + this.rng() * 4;
    this.wind = { x: Math.sin(wa) * ws, z: -Math.cos(wa) * ws };
    this.gun = {
      tr: 0, el: 40 * DEG, sight: 0, quad: 40 * DEG,
      breech: 0, // 0 shut .. 1 open (the wedge slides out to the right)
      breechOpen: false, spent: false, // an empty brass case in the chamber after a shot
      tray: null, // { shell, fuze } on the loading tray
      rammed: null, // { shell, fuze } in the bore
      bags: 0, caseIn: false, loaded: null, // loaded: { shell, fuze, bags } once the wedge is shut on a charge
      hp: 100, firedAt: -99, signature: 0,
    };
    this.selShell = 'schwer';
    this.selFuze = 'oV';
    this.input = { trav: 0, elev: 0, sight: 0, quad: 0, fine: false, hold: null };
    this.latch = { trav: 0, sight: 0, elev: 0, quad: 0 }; // a wheel stopped on its mark with the key still held (crank)
    this.action = null; // { id, t, dur, station } the action being held
    this.crewT = {}; // per station: seconds the crew has been waiting before it acts (assist)
    this.anim = { step: null, t: 0, dur: 1, at: 0 }; // the last loading step, for the render layer
    // targets
    this.targets = TARGET_LIST.filter((d) => !range || d.id === 'ginger').map((d) => {
      const t = { ...d, alive: true, rounds: 0, hits: 0, pieces: [] };
      if (d.unit) {
        const u = UNITS.find((x) => x.id === d.unit);
        t.kind = u.kind;
        t.pieces = piecePlacements(u).map((p) => ({ i: p.i, kind: p.kind, x: p.x, z: p.z, y: heightAt(p.x, p.z), dmg: 0, dead: false }));
      } else {
        const p = PLACES.find((x) => x.name === d.place);
        t.kind = 'place';
        t.hpLeft = d.hp;
        t.pos = { x: p.pos.x, z: p.pos.z, y: heightAt(p.pos.x, p.pos.z) };
      }
      return t;
    });
    this.targetIndex = -1;
    this.order = null;
    this.orderN = 0;
    this.est = null; // the Feuerleitung's idea of where to aim
    this.nextOrderAt = 4; // the first call comes a few seconds in
    this.pendingReports = [];
    this.lastReport = null;
    this.cb = { next: Infinity, err: 380 * this.diff.cbErr, salvos: 0 };
    this.say('Feuerleitung: Batterie besetzt. Warten Sie auf den ersten Schießbefehl.', 'Fire direction: gun manned. Stand by for the first fire order.', 'info');
    this.emit('state', this.state);
  }

  say(text, en = '', kind = 'info') {
    const m = { t: this.time, text, en, kind };
    this.log.push(m);
    if (this.log.length > 60) this.log.shift();
    this.emit('message', m);
  }

  // ------------------------------------------------------------------ geometry
  get target() {
    return this.targets[this.targetIndex] ?? null;
  }
  // where the target's damage is centred now: the middle of its surviving pieces
  aimPoint(t = this.target) {
    if (!t) return null;
    if (t.pos) return t.pos;
    const live = t.pieces.filter((p) => !p.dead);
    const list = live.length ? live : t.pieces;
    const x = list.reduce((s, p) => s + p.x, 0) / list.length, z = list.reduce((s, p) => s + p.z, 0) / list.length;
    return { x, z, y: heightAt(x, z) };
  }
  bearingFor(tr) {
    return BERTHA.base - tr;
  }
  // the bore's direction and the muzzle in the world for a traverse and an elevation
  muzzle(tr = this.gun.tr, el = this.gun.el, out = {}) {
    const b = this.bearingFor(tr), ce = Math.cos(el);
    out.dx = Math.sin(b) * ce;
    out.dy = Math.sin(el);
    out.dz = -Math.cos(b) * ce;
    out.x = BERTHA.pos.x + out.dx * GUN.muzzle;
    out.y = this.ground + GUN.trunnion + out.dy * GUN.muzzle;
    out.z = BERTHA.pos.z + out.dz * GUN.muzzle;
    return out;
  }

  // ------------------------------------------------------------------ orders (Feuerleitung)
  nextTarget() {
    this.targetIndex = this.targets.findIndex((t) => t.alive);
    if (this.targetIndex < 0) return;
    const t = this.target, a = this.aimPoint(t);
    // the map and the survey are not perfect: the first data carry an error along and across the line
    const e = this.range ? 0.4 : this.diff.map, b = bearingOf(a.x - BERTHA.pos.x, a.z - BERTHA.pos.z);
    const along = (this.rng() - 0.5) * 2 * 220 * e, across = (this.rng() - 0.5) * 2 * 90 * e;
    this.est = { x: a.x + Math.sin(b) * along + Math.cos(b) * across, z: a.z - Math.cos(b) * along + Math.sin(b) * across };
    this.ffe = false;
    this.issueOrder('ranging');
  }

  issueOrder(kind, rounds = 1) {
    const t = this.target;
    const gx = BERTHA.pos.x, gz = BERTHA.pos.z;
    const D = Math.hypot(this.est.x - gx, this.est.z - gz);
    const dh = heightAt(this.est.x, this.est.z) - (this.ground + GUN.trunnion);
    // keep the shell and charge of the last order on this target, or of a round already in the gun, while they reach
    const prev = this.order?.target === t.id ? this.order : null, L = this.gun.loaded;
    const keep = (sh, c) => sh && c >= 1 && D < table(sh, c).rMax * 0.97 && D > table(sh, c).rMax * 0.55 ? { shell: sh, charge: c } : null;
    const pick = keep(prev?.shell, prev?.charge) ?? keep(L?.shell, L?.bags) ?? choose(D);
    if (!pick) {
      this.say(`Feuerleitung: ${t.name} liegt außer Schussweite.`, `${t.en} is out of range.`, 'warn');
      t.alive = false;
      this.order = null;
      this.nextOrderAt = this.time + 5;
      return;
    }
    const sol = solve(pick.shell, pick.charge, D, dh);
    const B = bearingOf(this.est.x - gx, this.est.z - gz);
    const defl = Math.round((BERTHA.base - B) / STRICH) * STRICH;
    const el = Math.round(sol.el / STRICH) * STRICH;
    this.orderN++;
    this.order = {
      n: this.orderN, kind, target: t.id, name: t.name, en: t.en, grid: gridRef(this.est.x, this.est.z),
      shell: pick.shell, fuze: t.fuze, charge: pick.charge, defl, el, range: D, tof: sol.tof,
      rounds, fired: 0, acked: false, at: this.time,
      // the last order's figures on the same target, so the console can show the correction
      prev: prev ? { defl: prev.defl, el: prev.el, charge: prev.charge, shell: prev.shell } : null,
    };
    const o = this.order;
    const what = kind === 'ranging' ? 'Einschießen' : kind === 'ffe' ? `Wirkungsschießen, ${rounds} Schuss` : 'Verbesserung';
    this.say(
      `Schießbefehl ${o.n}: ${o.name} (${o.grid}). ${what}. ${SHELLS[o.shell].name}, ${FUZES[o.fuze].short}, Ladung ${o.charge}. Seite ${fmtDefl(o.defl)}, Erhöhung ${toStrich(o.el)}.`,
      `Fire order ${o.n}: ${o.en}. ${kind === 'ranging' ? 'Ranging' : kind === 'ffe' ? `Fire for effect, ${rounds} rounds` : 'Correction'}. ${SHELLS[o.shell].en}, ${FUZES[o.fuze].en}, charge ${o.charge}. Line ${fmtDefl(o.defl, 'en')}, elevation ${toStrich(o.el)} mils.`,
      'order'
    );
    this.emit('order', o);
  }

  // an observer's report on a burst, and the Feuerleitung's next order from it
  report(r) {
    const t = this.targets.find((x) => x.id === r.target);
    if (!t) return;
    const who = t.unit ? 'Fliegerbeobachter' : 'Ballonbeobachter';
    let de, en;
    if (r.lost) {
      de = 'Schuss nicht beobachtet, weit vom Ziel';
      en = 'round not seen, far off the target';
      this.say(`${who}: Schuss nicht beobachtet. Weit vom Ziel. Ladung und Geschoss prüfen!`, 'Observer: round not seen, far off the target. Check the charge and the shell!', 'warn');
    } else if (r.dist < 15) {
      de = 'Volltreffer';
      en = 'direct hit';
      this.say(`${who}: Volltreffer!`, 'Observer: direct hit!', 'report');
    } else {
      const a = Math.round(r.along / 10) * 10, c = Math.round(r.across / 10) * 10;
      const parts = [];
      if (Math.abs(a) >= 10) parts.push(`${Math.abs(a)} m ${a > 0 ? 'zu weit' : 'zu kurz'}`);
      if (Math.abs(c) >= 10) parts.push(`${Math.abs(c)} m ${c > 0 ? 'rechts' : 'links'}`);
      const ens = [];
      if (Math.abs(a) >= 10) ens.push(`${Math.abs(a)} m ${a > 0 ? 'over' : 'short'}`);
      if (Math.abs(c) >= 10) ens.push(`${Math.abs(c)} m ${c > 0 ? 'right' : 'left'}`);
      de = parts.join(', ') || 'im Ziel';
      en = ens.join(', ') || 'on the target';
      this.say(`${who}: ${de}.`, `Observer: ${en}.`, 'report');
    }
    // the fall of the last round, for the order card
    this.lastReport = { order: r.order, target: r.target, de, en, at: this.time, dist: r.dist, lost: r.lost };
    if (t !== this.target || !t.alive || this.state !== 'playing') return;
    // correct the aim by what was seen (the observer's eye is not perfect)
    if (!r.lost && r.order === this.order?.n) {
      const k = 0.85 + this.rng() * 0.2;
      this.est.x -= r.ox * k;
      this.est.z -= r.oz * k;
    }
    const o = this.order;
    if (o && o.fired >= o.rounds && r.order === o.n) {
      if (!r.lost && r.dist < 60) {
        this.ffe = true;
        this.issueOrder('ffe', 2);
      } else this.issueOrder(this.ffe ? 'ffe' : 'correction', this.ffe ? 2 : 1);
    }
  }

  // ------------------------------------------------------------------ the drill
  // What the player can do at a station now: [{ key, id, label, en, dur }] and a reason when nothing is possible.
  actions(station = this.station) {
    const g = this.gun, o = this.order, out = [];
    let why = null;
    if (this.state !== 'playing') return { list: out, why };
    if (station === 'cmd') {
      if (o && !o.acked) out.push({ key: 'E', id: 'ack', label: 'Befehl wiederholen', en: 'read back the order', dur: DUR.ack });
      else why = o ? W('Befehl quittiert. Die Bedienung arbeitet.', 'Order acknowledged. The detachment is at work.') : W('Warten auf den Schießbefehl.', 'Waiting for the fire order.');
    } else if (station === 'load') {
      if (g.loaded && this.mismatch()) out.push({ key: 'R', id: 'unload', label: 'Entladen (falsche Ladung)', en: 'unload the wrong round', dur: DUR.unload });
      if (g.loaded) why = this.mismatch() ? W('Geladen, aber nicht wie befohlen!', 'Loaded, but not as ordered!') : W('Geladen. Verschluss zu.', 'Loaded. The breech is closed.');
      else if (!g.breechOpen) {
        if (g.el > GUN.loadEl + 0.6 * DEG) why = W('Rohr zum Laden senken (Höhenrichtkanonier, 3)', 'Lower the barrel to load (elevation layer, 3)');
        else out.push({ key: 'E', id: 'open', label: g.spent ? 'Verschluss öffnen, Hülse auswerfen' : 'Verschluss öffnen', en: 'open the wedge', dur: DUR.open });
      } else if (!g.tray && !g.rammed && !(o?.acked && o.fired < o.rounds)) why = W('Warten auf den Befehl: welches Geschoss? (Batterieführer, 1)', 'Wait for the order: which shell? (gun commander, 1)');
      else if (!g.tray && !g.rammed) {
        const wrong = !!o && (this.selShell !== o.shell || this.selFuze !== o.fuze);
        out.push({ key: 'E', id: 'hoist', label: `${SHELLS[this.selShell].name} (${FUZES[this.selFuze].short}) aufkranen`, en: `hoist the ${SHELLS[this.selShell].en} (${FUZES[this.selFuze].enShort} fuze)`, dur: DUR.hoist, warn: wrong });
      }
      else if (g.tray) out.push({ key: 'E', id: 'ram', label: 'Geschoss ansetzen', en: 'ram the shell', dur: DUR.ram });
      else if (!g.caseIn) {
        const n = o?.acked ? o.charge : null;
        if (g.bags < MAX_BAGS) out.push({ key: 'E', id: 'bag', label: `Vorkartusche ${g.bags + 1}${n != null ? ` von ${n}` : ''} einführen`, en: `add charge bag ${g.bags + 1}${n != null ? ` of ${n}` : ''}`, dur: DUR.bag, warn: n != null && g.bags >= n });
        out.push({ key: 'R', id: 'case', label: `Hauptkartusche (Ladung ${g.bags})`, en: `brass case: charge ${g.bags}`, dur: DUR.case, warn: n != null && g.bags !== n });
      } else out.push({ key: 'E', id: 'close', label: 'Verschluss schließen', en: 'close the wedge', dur: DUR.close });
    } else if (station === 'fire') {
      if (!g.loaded) why = W('Nicht geladen.', 'Not loaded.');
      else if (!o || !o.acked) why = W('Kein Feuerbefehl.', 'No fire order.');
      else if (o.fired >= o.rounds) why = W('Befehl ausgeführt. Warten auf Beobachtung.', 'Order carried out. Waiting for the observer.');
      else if (g.el < 8 * DEG) why = W('Rohr zu tief! Erst richten.', 'Barrel too low! Lay the gun first.');
      else out.push({ key: 'E', id: 'fire', label: 'Abziehen! (Feuer)', en: 'pull the lanyard', dur: DUR.fire });
    } else if (station === 'trav' || station === 'elev') {
      why = null;
    }
    return { list: out, why };
  }

  // The next job of the drill for one man working every station in turn (the console's "Next" line and the lit
  // station): { st, key, de, en, wait } or null. `wait` marks dead time (no order yet, a round in the air).
  // The order follows the tutorial: read back, barrel down, load, elevation, line, fire.
  next() {
    const g = this.gun, o = this.order;
    if (this.state !== 'playing') return null;
    const J = (st, key, de, en, wait = false) => ({ st, key, de, en, wait });
    if (!o) return J('cmd', null, 'Warten auf den nächsten Schießbefehl', 'waiting for the next fire order', true);
    if (!o.acked) return J('cmd', 'E', 'Befehl am Fernsprecher wiederholen', 'read back the order on the telephone');
    if (this.mismatch()) return J('load', 'R', 'falsche Ladung entladen', 'unload the wrong round');
    if (o.fired >= o.rounds) {
      // while the round is in the air: make ready for the next one (barrel down, wedge open, the case out)
      if (!g.loaded && !g.breechOpen && g.el > GUN.loadEl + 0.6 * DEG) return J('elev', 'S', 'Rohr für den nächsten Schuss auf 2° senken', 'lower the barrel to 2° for the next round');
      if (!g.loaded && !g.breechOpen) return J('load', 'E', 'Verschluss öffnen, die leere Hülse auswerfen', 'open the wedge and throw out the empty case');
      const sh = this.shells.find((s) => s.own && s.alive && s.order === o.n);
      if (sh) return J('cmd', null, `Granate in der Luft, Einschlag in ${Math.max(0, Math.round(o.tof - sh.t))} s`, `round in the air, ${Math.max(0, Math.round(o.tof - sh.t))} s to the burst`, true);
      return J('cmd', null, 'Warten auf die Meldung des Beobachters', 'waiting for the observer\'s report', true);
    }
    const laid = this.laid(o);
    if (!g.loaded) {
      if (!g.breechOpen && !g.tray && !g.rammed && g.el > GUN.loadEl + 0.6 * DEG) return J('elev', 'S', 'Rohr auf den Ladewinkel 2° senken', 'lower the barrel to the loading angle, 2°');
      const acts = this.actions('load');
      let a = acts.list[0];
      if (!a) return J('load', null, acts.why?.de ?? '', acts.why?.en ?? '');
      if (a.id === 'bag' && g.bags >= o.charge) a = acts.list.find((x) => x.id === 'case') ?? a;
      if (a.id === 'hoist' && (this.selShell !== o.shell || this.selFuze !== o.fuze)) {
        const k = this.selShell !== o.shell ? 'Q' : 'Z';
        return J('load', k, k === 'Q' ? `Geschoss wählen: ${SHELLS[o.shell].name}` : `Zünder wählen: ${FUZES[o.fuze].short}`, k === 'Q' ? `pick the ${SHELLS[o.shell].en}` : `pick the ${FUZES[o.fuze].enShort} fuze`);
      }
      return J('load', a.key, a.label, a.en);
    }
    if (!laid.quad) return J('elev', g.quad < o.el ? '↑' : '↓', `Libellenquadrant auf ${toStrich(o.el)} stellen`, `set the clinometer to ${toStrich(o.el)}`);
    if (!laid.elev) return J('elev', g.el < o.el ? 'W' : 'S', 'Rohr kurbeln, bis die Libelle einspielt', 'crank the barrel until the bubble centres');
    if (!laid.sight) return J('trav', g.sight < o.defl ? '←' : '→', `Seite ${fmtDefl(o.defl)} am Rundblickfernrohr stellen`, `set ${fmtDefl(o.defl, 'en')} on the panoramic sight`);
    if (!laid.line) return J('trav', g.tr < o.defl ? 'A' : 'D', 'Lafette schwenken, bis die Richtlatte am Faden steht', 'swing the carriage until the aiming post is on the hair');
    return J('fire', 'E', 'Abziehen!', 'pull the lanyard');
  }

  // the held keys: { trav, elev, sight, quad: -1..1, fine, hold: 'E' | 'R' | null }
  setInput(inp) {
    Object.assign(this.input, inp);
  }

  // checks per station for the console's checklist and the crew: is the gun laid as ordered?
  laid(o = this.order) {
    if (!o) return { line: false, elev: false, sight: false, quad: false };
    const g = this.gun;
    return {
      line: Math.abs(g.tr - o.defl) <= TOL * STRICH,
      elev: Math.abs(g.el - o.el) <= TOL * STRICH,
      sight: Math.abs(g.sight - o.defl) <= STRICH,
      quad: Math.abs(g.quad - o.el) <= STRICH,
    };
  }

  // the round in the gun is not the one the acknowledged order calls for
  mismatch(o = this.order) {
    const L = this.gun.loaded;
    return !!(L && o?.acked && (L.shell !== o.shell || L.bags !== o.charge || L.fuze !== o.fuze));
  }

  doAction(id) {
    const g = this.gun, at = this.muzzleBreech();
    switch (id) {
      case 'ack':
        this.order.acked = true;
        this.say(`Batterieführer: Schießbefehl ${this.order.n} verstanden.`, `Gun commander: order ${this.order.n} understood.`, 'ack');
        this.emit('ack', this.order);
        break;
      case 'open':
        g.breechOpen = true;
        if (g.spent) {
          g.spent = false;
          this.emit('step', 'case', at);
        }
        this.emit('step', 'breech', at);
        break;
      case 'hoist':
        g.tray = { shell: this.selShell, fuze: this.selFuze };
        this.emit('step', 'crane', at);
        break;
      case 'ram':
        g.rammed = g.tray;
        g.tray = null;
        this.emit('step', 'ram', at);
        break;
      case 'bag':
        g.bags++;
        this.emit('step', 'cartridge', at);
        break;
      case 'case':
        g.caseIn = true;
        this.emit('step', 'cartridge', at);
        break;
      case 'close':
        g.breechOpen = false;
        g.loaded = { ...g.rammed, bags: g.bags };
        this.emit('step', 'breech', at);
        this.emit('step', 'ready', at);
        break;
      case 'unload':
        // the wedge open, the brass case and the bags drawn, the shell pulled back with the extractor
        g.loaded = g.rammed = null;
        g.bags = 0;
        g.caseIn = false;
        g.breechOpen = true;
        this.say('Ladekanonier: Geschütz entladen.', 'Loader: gun unloaded.', 'info');
        this.emit('step', 'breech', at);
        break;
      case 'fire':
        this.fire();
        break;
    }
    this.anim = { step: id, t: 0, dur: 0.6, at: this.time };
  }
  muzzleBreech() {
    return { x: BERTHA.pos.x, y: this.ground + GUN.trunnion, z: BERTHA.pos.z };
  }

  fire() {
    const g = this.gun, o = this.order, r = this.rng;
    const gauss = () => (r() + r() + r() + r() - 2) * 0.866;
    const L = g.loaded;
    const tr = g.tr + gauss() * GUN.disp.tr, el = g.el + gauss() * GUN.disp.el;
    const v = muzzleV(L.shell, L.bags) * (1 + gauss() * GUN.disp.v);
    const m = this.muzzle(tr, el);
    const sh = {
      id: this.nextId++, own: true, alive: true, calibre: GUN.calibre, shell: L.shell, fuze: L.fuze, bags: L.bags,
      model: SHELLS[L.shell].model, k: SHELLS[L.shell].k, t: 0,
      s: { x: m.x, y: m.y, z: m.z, vx: m.dx * v, vy: m.dy * v, vz: m.dz * v },
      pos: { x: m.x, y: m.y, z: m.z }, prev: { x: m.x, y: m.y, z: m.z }, vel: { x: m.dx * v, y: m.dy * v, z: m.dz * v },
      target: this.target?.id, order: o?.n,
    };
    this.shells.push(sh);
    g.loaded = null;
    g.rammed = null;
    g.bags = 0;
    g.caseIn = false;
    g.spent = true;
    g.firedAt = this.time;
    g.signature++;
    this.roundsFired++;
    if (o) o.fired++;
    if (this.target) this.target.rounds++;
    // the sound rangers have it after the second round; the first British salvo follows
    if (g.signature >= 2 && this.cb.next === Infinity && !this.range) this.cb.next = this.time + (55 + this.rng() * 30) / this.diff.cb;
    this.emit('fire', sh, m);
  }

  // ------------------------------------------------------------------ the frame
  update(dt) {
    if (dt <= 0) return;
    this.acc += Math.min(dt, 2);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
    this.alpha = this.acc / STEP;
  }

  step(dt) {
    this.time += dt;
    const g = this.gun, inp = this.input;
    if (this.state === 'playing') {
      // the Feuerleitung's calls
      if (!this.order && this.time >= this.nextOrderAt) {
        if (this.targetIndex < 0 || !this.target?.alive) this.nextTarget();
        if (this.order) this.emit('phone');
      }
      this.crank(dt, inp, this.station);
      // the held action at the player's station
      const acts = this.actions(this.station).list;
      const want = acts.find((a) => a.key === inp.hold);
      if (want) {
        if (!this.action || this.action.id !== want.id || this.action.station !== this.station) this.action = { id: want.id, t: 0, dur: want.dur, station: this.station };
        this.action.t += dt;
        if (this.action.t >= this.action.dur) {
          this.doAction(want.id);
          this.action = null;
        }
      } else this.action = null;
      if (this.assist) this.crew(dt);
      this.counterBattery();
    }
    // breech animation follows the state
    g.breech += ((g.breechOpen ? 1 : 0) - g.breech) * Math.min(1, dt * 2.5);
    this.anim.t += dt;
    this.stepShells(dt);
    for (let i = this.pendingReports.length - 1; i >= 0; i--) {
      const r = this.pendingReports[i];
      if (this.time >= r.at) {
        this.pendingReports.splice(i, 1);
        this.report(r);
      }
    }
  }

  // The player's handwheels and instrument knobs. Each is turned toward its mark (the ordered figure on the sight
  // and the clinometer, the post on the hair for the carriage, the centred bubble or the loading angle for the
  // barrel): the man eases off over the last 8 mils and stops on the mark, and the key must be let go and pressed
  // again to go past it (this.latch). Shift is the fine wheel. Only the player's station; the crew lays by itself.
  crank(dt, inp, station) {
    const g = this.gun, o = this.order?.acked ? this.order : null;
    const k = inp.fine ? GUN.fine : 1;
    for (const a of ['trav', 'sight', 'elev', 'quad']) if (this.latch[a] && this.latch[a] !== Math.sign(inp[a] || 0)) this.latch[a] = 0;
    if (station === 'trav') {
      if (inp.trav) g.tr = this.wheel('trav', g.tr, inp.trav, GUN.trRate * k * dt, -GUN.trMax, GUN.trMax, o ? [g.sight] : []);
      if (inp.sight) g.sight = this.wheel('sight', g.sight, inp.sight, (inp.fine ? 2 : 40) * STRICH * dt, -GUN.trMax, GUN.trMax, o ? [o.defl] : []);
      // the scale clicks onto the ordered figure when let go within a mil of it
      else if (this.order && Math.abs(g.sight - this.order.defl) <= STRICH) g.sight = this.order.defl;
    } else if (station === 'elev') {
      // the barrel cannot be moved with the wedge open (the tray is behind it)
      if (inp.elev && !g.breechOpen) g.el = this.wheel('elev', g.el, inp.elev, GUN.elRate * k * dt, GUN.elMin, GUN.elMax, g.loaded ? [g.quad] : [GUN.loadEl]);
      if (inp.quad) g.quad = this.wheel('quad', g.quad, inp.quad, (inp.fine ? 2 : 60) * STRICH * dt, 0, GUN.elMax, o ? [o.el] : []);
      else if (this.order && Math.abs(g.quad - this.order.el) <= STRICH) g.quad = this.order.el;
    }
  }

  // one step of a wheel from cur in direction dir (+-1) by up to `step`, easing onto and stopping at the first
  // mark ahead; returns the new value (this.latch[axis] = dir while it sits on a mark with the key held)
  wheel(axis, cur, dir, step, lo, hi, marks) {
    const clamp = (v) => Math.max(lo, Math.min(hi, v));
    if (this.latch[axis] === dir) return cur;
    let next = cur + dir * step;
    for (const m of marks) {
      const d = m - cur;
      if (Math.abs(d) < 1e-9 || Math.sign(d) !== dir) continue;
      const near = Math.abs(d) / (8 * STRICH);
      if (near < 1) next = cur + dir * step * Math.max(0.15, near);
      if (Math.abs(next - cur) >= Math.abs(d)) {
        this.latch[axis] = dir;
        this.emit('mark', axis);
        return clamp(m);
      }
    }
    return clamp(next);
  }

  // the rest of the detachment, when assist is on: every station but the player's works the drill
  crew(dt) {
    const g = this.gun, o = this.order, me = this.station;
    const wait = (st, s) => {
      this.crewT[st] = (this.crewT[st] ?? 0) + dt;
      if (this.crewT[st] < s) return false;
      this.crewT[st] = 0;
      return true;
    };
    if (me !== 'cmd' && o && !o.acked && wait('cmd', 3)) this.doAction('ack');
    const toward = (cur, goal, rate) => (Math.abs(goal - cur) <= rate * dt ? goal : cur + Math.sign(goal - cur) * rate * dt);
    if (me !== 'trav' && o?.acked) {
      g.sight = toward(g.sight, o.defl, 40 * STRICH);
      if (g.sight === o.defl) g.tr = toward(g.tr, o.defl, GUN.trRate);
    }
    if (me !== 'elev') {
      if (!g.loaded && !g.breechOpen) g.el = toward(g.el, GUN.loadEl, GUN.elRate);
      else if (g.loaded && o?.acked) {
        g.quad = toward(g.quad, o.el, 60 * STRICH);
        if (g.quad === o.el) g.el = toward(g.el, o.el, GUN.elRate);
      }
    }
    if (me !== 'load' && this.mismatch() && wait('load', DUR.unload * 1.3)) this.doAction('unload');
    if (me !== 'load' && !g.loaded && o?.acked) {
      // the loaders take the ordered shell, fuze and charge
      this.selShell = o.shell;
      this.selFuze = o.fuze;
      const acts = this.actions('load').list;
      let a = acts[0];
      if (a?.id === 'bag' && g.bags >= o.charge) a = acts.find((x) => x.id === 'case');
      if (a && wait('load', a.dur * 1.3)) this.doAction(a.id);
    }
    if (me !== 'fire' && g.loaded && o?.acked && o.fired < o.rounds) {
      const l = this.laid(o);
      if (l.line && l.elev && !this.mismatch() && this.actions('fire').list.length && wait('fire', 3)) this.doAction('fire');
    }
  }

  // ------------------------------------------------------------------ shells
  stepShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      if (!sh.alive) {
        if ((sh.dead = (sh.dead ?? 0) + dt) > 1) this.shells.splice(i, 1);
        continue;
      }
      const s = sh.s;
      sh.prev.x = s.x; sh.prev.y = s.y; sh.prev.z = s.z;
      stepBallistic(s, dt, sh.k, this.wind.x, this.wind.z);
      sh.t += dt;
      sh.pos.x = s.x; sh.pos.y = s.y; sh.pos.z = s.z;
      sh.vel.x = s.vx; sh.vel.y = s.vy; sh.vel.z = s.vz;
      if (s.vy < 0) {
        const h = heightAt(s.x, s.z);
        if (s.y <= h) {
          // back to the crossing of the ground between the last two steps
          const h0 = heightAt(sh.prev.x, sh.prev.z), d0 = sh.prev.y - h0, d1 = s.y - h;
          const f = d0 > 0 ? d0 / (d0 - d1) : 1;
          sh.pos.x = sh.prev.x + (s.x - sh.prev.x) * f;
          sh.pos.z = sh.prev.z + (s.z - sh.prev.z) * f;
          sh.pos.y = heightAt(sh.pos.x, sh.pos.z);
          sh.alive = false;
          if (sh.own) this.burst(sh);
          else this.enemyBurst(sh);
        }
      }
      if (sh.t > 200) sh.alive = false;
    }
  }

  burst(sh) {
    const p = sh.pos, ground = groundKindAt(p.x, p.z);
    const crater = sh.shell === 'schwer' ? 9 : 7;
    const info = { calibre: GUN.calibre, fuze: sh.fuze === 'mV' ? 'delay' : 'instant', ground, crater: sh.fuze === 'mV' ? crater * 1.2 : crater, own: true };
    this.emit('burst', sh, p, info);
    // damage: every target's pieces within reach (a stray round can hit the wrong battery)
    const R = LETHAL[sh.shell][sh.fuze];
    for (const t of this.targets) {
      if (!t.alive) continue;
      if (t.pos) {
        const d = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
        if (d < t.r) {
          t.hpLeft -= d < t.r * 0.45 ? 2 : 1;
          t.hits++;
          this.say(`Ballonbeobachter: Treffer in ${t.place === 'Ypres' ? 'Ypern' : t.name}.`, `Observer: hit in ${t.en}.`, 'hit');
          if (t.hpLeft <= 0) this.destroyTarget(t);
        }
        continue;
      }
      for (const pc of t.pieces) {
        if (pc.dead) continue;
        const d = Math.hypot(p.x - pc.x, p.z - pc.z);
        if (d < R) pc.dmg = 1;
        else if (d < R * 2.2) pc.dmg += 0.55 * (1 - (d - R) / (R * 1.2));
        if (pc.dmg >= 1) {
          pc.dead = true;
          this.score += 25;
          this.say(`Fliegerbeobachter: Geschütz ${pc.i + 1} von ${t.name} vernichtet!`, `Observer: gun ${pc.i + 1} of ${t.en} destroyed!`, 'hit');
          this.emit('pieceDestroyed', t, pc);
        }
      }
      if (t.pieces.every((pc) => pc.dead)) this.destroyTarget(t);
    }
    // the observer's report comes in a little later
    const t = this.targets.find((x) => x.id === sh.target);
    if (!t) return;
    const a = this.aimPoint(t);
    const ox = p.x - a.x, oz = p.z - a.z, dist = Math.hypot(ox, oz);
    const b = bearingOf(a.x - BERTHA.pos.x, a.z - BERTHA.pos.z), ux = Math.sin(b), uz = -Math.cos(b);
    const err = () => 1 + (this.rng() - 0.5) * 0.2;
    this.pendingReports.push({
      at: this.time + 4 + this.rng() * 5, target: t.id, order: sh.order,
      ox: ox * err(), oz: oz * err(), dist, lost: dist > 1400,
      along: (ox * ux + oz * uz) * err(), across: (ox * -uz + oz * ux) * err(),
    });
  }

  destroyTarget(t) {
    if (!t.alive) return;
    t.alive = false;
    const bonus = Math.max(0, 60 - 8 * t.rounds);
    this.score += t.points + bonus;
    this.say(`Feuerleitung: ${t.name} ausgeschaltet. Gut gemacht, Bedienung!`, `Fire direction: ${t.en} knocked out. Well done.`, 'kill');
    this.emit('targetDestroyed', t, t.points + bonus);
    if (t === this.target) {
      this.order = null;
      this.nextOrderAt = this.time + 12;
    }
    if (this.targets.every((x) => !x.alive)) this.end('victory');
  }

  // ------------------------------------------------------------------ British counter-battery
  counterBattery() {
    if (this.time < this.cb.next) return;
    const gx = BERTHA.pos.x, gz = BERTHA.pos.z;
    // every British unit with a gun left that can reach fires
    const srcs = this.targets.filter((t) => t.alive && t.unit && t.pieces.some((p) => !p.dead)).filter((t) => maxBrit(t.kind) > Math.hypot(t.pieces[0].x - gx, t.pieces[0].z - gz) * 1.01);
    this.cb.next = this.time + (70 + this.rng() * 50) / this.diff.cb;
    if (!srcs.length) return;
    const src = srcs[Math.floor(this.rng() * srcs.length)];
    const n = src.kind === 'rail' || src.kind === 'bl15' ? 1 : 2;
    const err = this.cb.err;
    this.cb.err = Math.max(45, this.cb.err * 0.8);
    this.cb.salvos++;
    for (let i = 0; i < n; i++) {
      const pc = src.pieces.find((p) => !p.dead);
      const ang = this.rng() * Math.PI * 2, rr = err * Math.sqrt(this.rng());
      const ax = gx + Math.cos(ang) * rr, az = gz + Math.sin(ang) * rr;
      const D = Math.hypot(ax - pc.x, az - pc.z), dh = heightAt(ax, az) - pc.y - 2;
      const c = autoBrit(pc.kind, D);
      if (c < 0) continue;
      const sol = solveBrit(pc.kind, c, D, dh);
      if (!sol) continue;
      const v = BRIT_GUNS[pc.kind].charges[c].v, b = bearingOf(ax - pc.x, az - pc.z), ce = Math.cos(sol.el);
      const vx = Math.sin(b) * ce * v, vy = Math.sin(sol.el) * v, vz = -Math.cos(b) * ce * v;
      const y = pc.y + 2;
      const sh = {
        id: this.nextId++, own: false, alive: true, calibre: BRIT_SHELLS[pc.kind]?.calibre ?? 9, kind: pc.kind, model: pc.kind, k: shellK(pc.kind), t: -i * 2.5,
        s: { x: pc.x, y, z: pc.z, vx, vy, vz }, pos: { x: pc.x, y, z: pc.z }, prev: { x: pc.x, y, z: pc.z }, vel: { x: vx, y: vy, z: vz },
        tof: sol.tof,
      };
      this.shells.push(sh);
      this.emit('enemyFire', src, pc, sh);
      this.emit('incoming', sh);
    }
    if (this.cb.salvos === 1) this.say('Schallmeßtrupp meldet: der Engländer hat uns angeschnitten. Vorsicht!', 'Sound rangers: the British have located us. Look out!', 'warn');
  }

  enemyBurst(sh) {
    const p = sh.pos, cd = CB_DAMAGE[sh.kind] ?? { R: 30, D: 30 };
    const info = { calibre: sh.calibre, fuze: 'instant', ground: groundKindAt(p.x, p.z), crater: (BRIT_SHELLS[sh.kind]?.crater ?? 4), own: false };
    this.emit('burst', sh, p, info);
    const d = Math.hypot(p.x - BERTHA.pos.x, p.z - BERTHA.pos.z);
    if (d < cd.R) {
      const dmg = Math.round(cd.D * (1 - d / cd.R) * this.diff.dmg);
      if (dmg > 0) {
        this.gun.hp = Math.max(0, this.gun.hp - dmg);
        this.say(`Einschlag am Geschütz! Schaden ${dmg}. ${this.gun.hp > 0 ? 'Weiterfeuern!' : ''}`, `Hit at the gun! ${dmg} damage.`, 'hit-us');
        this.emit('hit', dmg, p);
        if (this.gun.hp <= 0) this.end('defeat');
      }
    } else if (d < 150) this.say(`Einschlag ${Math.round(d)} m vom Geschütz.`, `A British shell ${Math.round(d)} m from the gun.`, 'near');
  }

  end(s) {
    if (this.state !== 'playing') return;
    this.state = s;
    if (s === 'victory') this.say('Feuerleitung: Alle Ziele bekämpft. Feuerpause.', 'Fire direction: every target engaged. Cease firing.', 'kill');
    else this.say('Das Geschütz ist ausgefallen.', 'The gun is out of action.', 'warn');
    this.emit('state', s);
  }
}

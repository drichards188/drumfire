// The test fire range (a game page with ?range=1, in any era: ?mode=ww2 | ww1). The era's own map on the lessons'
// scripted range (sim.newGame({ scripted: true }): no timetable, no enemy unless asked, daylight, the guns
// invulnerable) with one gun alone in the field, drawn and usable: one gun of the battery the player came with (&kind=,
// any battery of the era, earned or not; every other battery and gun is out of the sim, so the render hides it). They
// may set its upgrades, lay on any target and fire it, from the console or in person at the gun (the WW2 gunner, P:
// `sim.range` lets the scripted game allow it); nothing is scored or paid. The card on the left of the 3D view holds:
//   battery  the seven parts at any level (research.js PARTS): a change starts the range again with them (the sim's
//            loadout, this gun only: their effect on the gun, not their look)
//   targets  every site on the map, nearest first, with its range from the battery and whether it can reach it: Mission
//            (an observed mission given to the battery, the aeroplane reporting each fall) or Lay (the guns laid on it)
//   debug    invulnerable guns, endless ammunition, no errors (no wind, calibration, map error or dispersion: every
//            round where the lay puts it), and things to set going: a hostile battery shelling the battery, an attack
//            with its SOS, a convoy, a train, clear the range
// The setup is in the URL (&kind=, &lv=shells3.barrel1, &perfect=1, &endless=0, &invuln=0, &tab=), so a test can be linked
// and opened again; window.__drumfire.range is this module's API for the console. main.js wires it (`host`).
import { PARTS, modsOf } from '../research.js';
import { autoCharge } from '../sim/shells.js';
import { wrapPi } from '../sim/guns.js';
import { bearingOf, SECTORS } from '../sector.js';
import { lenU, lenShort } from './theatre.js';

const ROMAN = ['-', 'I', 'II', 'III'];
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const btn = (text, title, fn, cls = '') => {
  const b = el('button', `tc-btn ${cls}`.trim(), text);
  b.type = 'button';
  if (title) b.title = title;
  // (and gives up the focus: Space is the console's FIRE, not this button again)
  b.addEventListener('click', (e) => { b.blur(); fn(e); });
  return b;
};
const BATTERIES = new Set(['battery', 'abattery', 'amedium', 'sbattery']);
const isBattery = (t) => BATTERIES.has(t.kind) || !!t.battery;

// host: { sim(), units, kind, selectedId(), select(index), restart({ loadout }), hint(text), href(params) }
export function mountRange(host, query) {
  const units = host.units, kind = host.kind;
  // the gun's levels on the range (no upgrades to begin with)
  const levels = { [kind]: {} };
  const opts = { invuln: query.get('invuln') !== '0', endless: query.get('endless') !== '0', perfect: query.get('perfect') === '1' };
  for (const part of (query.get('lv') ?? '').split('.')) {
    const m = /^([a-z]+)(\d)$/.exec(part);
    if (m && PARTS.some((p) => p.id === m[1])) levels[kind][m[1]] = +m[2];
  }
  // the sim's loadout: one gun of this battery alone (its kind the only one allowed in the field), its upgrades
  const loadout = () => ({ [kind]: { guns: 1, mods: modsOf(levels[kind]) } });

  // ---------------------------------------------------------------- the sim side
  const sim = () => host.sim();
  let stock = new Map(); // unit id -> its ammunition at the start
  function setup() {
    const s = sim();
    for (const u of s.units) u.mode = 'manual'; // the scripted range holds them; here the player fires at once
    stock = new Map(s.units.map((u) => [u.id, { ...u.ammo }]));
    s.invulnerable = opts.invuln;
    perfect(opts.perfect);
  }
  // no errors: no wind, no calibration, no lay's map error, no dispersion (kept to put back)
  function perfect(on) {
    const s = sim();
    opts.perfect = on;
    s.rangeWind ??= s.wind;
    s.wind = on ? { ...s.rangeWind, speed: 0, wx: 0, wz: 0 } : s.rangeWind;
    for (const u of s.units) {
      if (!('rangeMods' in u)) u.rangeMods = u.mods;
      u.mods = on ? { ...(u.rangeMods ?? modsOf({})), disp: 0, bias: 0 } : u.rangeMods;
      if (on) u.bias = { over: 0, right: 0 };
      for (const p of u.pieces) {
        p.rangeCalib ??= p.calib;
        p.calib = on ? { v: 0, line: 0 } : p.rangeCalib;
      }
    }
  }
  function begin() {
    host.restart({ loadout: loadout() });
    setup();
    refresh(true);
  }
  // per frame: the endless ammunition
  function update() {
    const s = sim();
    if (!opts.endless || !s) return;
    for (const u of s.units) {
      const a = stock.get(u.id);
      if (!a) continue;
      for (const k of Object.keys(a)) if ((u.ammo[k] ?? 0) < a[k]) u.ammo[k] = a[k];
    }
  }

  const unit = () => sim()?.unitById(host.selectedId());
  // can the battery reach it: '' or why not
  function reach(u, t) {
    const D = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (autoCharge(u.kind, D) < 0) {
      // under the shortest range or over the longest: the first charge's table says which
      return autoCharge(u.kind, D * 1.5) >= 0 ? 'too close' : 'out of range';
    }
    const p = u.pieces.find((q) => q.state !== 'dead');
    if (p && Math.abs(wrapPi(p.bearing - bearingOf(t.pos.x - u.pos.x, t.pos.z - u.pos.z))) > u.arc) return 'out of arc';
    return '';
  }
  const targets = () => (sim()?.targets ?? []).filter((t) => !t.offmap && t.parts?.length);

  // ---------------------------------------------------------------- actions
  const api = {
    begin, update,
    // an observed mission on a target for the battery (the aeroplane reports every fall)
    mission(id) {
      const s = sim(), u = unit(), t = s.targetById(id);
      if (!u || !t) return null;
      if (!t.alive) s.targetAI.revive(t);
      const open = s.missions.find((m) => m.targetId === id && m.state !== 'done' && m.state !== 'failed');
      if (open) { s.director.assign(u, open); return open; }
      return s.script.mission(id, { observer: 'air', unitId: u.id });
    },
    lay(id) {
      const s = sim(), u = unit(), t = s.targetById(id);
      if (u && t) s.command(u.id, 'lay', { x: t.pos.x, z: t.pos.z });
    },
    revive() {
      const s = sim();
      for (const t of targets()) if (!t.alive) s.targetAI.revive(t);
      host.hint('Every target rebuilt', 1400);
    },
    // a hostile battery shells the selected battery: the nearest that stands
    hostile() {
      const s = sim(), u = unit();
      if (!u) return null;
      const bats = s.targets.filter((t) => isBattery(t) && t.alive).sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) - Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z));
      if (!bats.length) { host.hint('No hostile battery stands on this map', 1800); return null; }
      const m = s.script.hostile(bats[0].id, { at: u.id, interval: 12, start: 400, walk: 70, grace: 6 });
      if (!m) host.hint('That battery cannot fire on the range', 1800);
      return m;
    },
    sos() {
      const s = sim();
      const ids = SECTORS.map((q) => q.id).filter((id) => (s.front?.[id] ?? 1) > 0);
      this.sosN = ((this.sosN ?? -1) + 1) % Math.max(1, ids.length);
      try {
        const a = s.script.assault(ids[this.sosN] ?? 'B', 1);
        if (!a) host.hint('No attack on this map', 1800);
        return a;
      } catch (e) { console.warn('range: sos', e); host.hint('No attack on this map', 1800); return null; }
    },
    convoy() { try { return sim().script.convoy() ?? (host.hint('No road traffic on this map', 1800), null); } catch { host.hint('No road traffic on this map', 1800); return null; } },
    train() { try { return sim().script.train() ?? (host.hint('No railhead on this map', 1800), null); } catch { host.hint('No railhead on this map', 1800); return null; } },
    clear() {
      const s = sim();
      s.script.quiet();
      s.script.clear();
      for (const u of s.units) u.mode = 'manual';
      host.hint('Range cleared', 1200);
    },
    set(name, on) {
      if (name === 'perfect') perfect(on);
      else if (name === 'invuln') { opts.invuln = on; sim().invulnerable = on; }
      else if (name === 'endless') opts.endless = on;
      refresh(true);
    },
    // the gun's levels: { shells, barrel, ... } (a change starts the range again)
    level(part, v) {
      const u = unit();
      if (!u) return;
      levels[kind][part] = v;
      const id = u.id;
      begin();
      const i = units.findIndex((q) => q.id === id);
      if (i >= 0) host.select(i);
    },
    // this setup as a link
    link() {
      const u = unit(), l = u ? levels[u.kind] ?? {} : {};
      const lv = Object.entries(l).filter(([, v]) => v > 0).map(([k, v]) => `${k}${v}`).join('.');
      return host.href({ kind: u?.kind, lv: lv || null, perfect: opts.perfect ? 1 : null, endless: opts.endless ? null : 0, invuln: opts.invuln ? null : 0, tab: tab === 'targets' ? null : tab });
    },
    opts, levels,
  };

  // ---------------------------------------------------------------- the card
  const card = el('div', null);
  card.id = 'range-card';
  const head = el('div', 'rc-head');
  const fold = btn('Hide', 'Fold the card away (H hides every panel)', () => { card.classList.toggle('folded'); fold.textContent = card.classList.contains('folded') ? 'Show' : 'Hide'; });
  // three tabs, one shown at a time, so the card stays clear of the gun
  const TABS = [['targets', 'Targets'], ['battery', 'Upgrades'], ['debug', 'Debug']];
  let tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'targets';
  const tabs = el('div', 'rc-tabs');
  for (const [k, label] of TABS) tabs.append(btn(label, null, () => { tab = k; refresh(true); }, `small tab-${k}`));
  head.append(el('span', null, 'Test range'), tabs, fold);
  const body = el('div', 'rc-body');
  card.append(head, body);
  document.getElementById('view')?.append(card);
  document.body.classList.add('range');

  let key = '', t0 = 0;
  function refresh(force = false) {
    const s = sim(), u = unit();
    if (!s || !u) return;
    const now = performance.now();
    // the target list's state (who is alive, which have missions) and the battery: rebuild when it changes
    const k = [tab, u.id, u.alive, ...targets().map((t) => `${t.id}${t.alive ? 1 : 0}${s.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed') ? 'm' : ''}`), JSON.stringify(opts), JSON.stringify(levels[u.kind] ?? {})].join('|');
    if (!force && (k === key || now - t0 < 300)) return;
    key = k;
    t0 = now;
    const scroll = body.querySelector('.rc-list')?.scrollTop ?? 0;
    for (const b of tabs.children) b.classList.toggle('on', b.classList.contains(`tab-${tab}`));
    body.replaceChildren(tab === 'battery' ? batteryBlock(u) : tab === 'debug' ? debugBlock() : targetBlock(s, u));
    const list = body.querySelector('.rc-list');
    if (list) list.scrollTop = scroll;
  }

  function batteryBlock(u) {
    const box = el('section', 'rc-sec');
    box.append(el('h3', null, u.name));
    const l = levels[u.kind] ?? {}, rows = el('div', 'rc-levels');
    const row = (label, part, n, cur, names) => {
      const r = el('div', 'rc-row');
      r.append(el('span', 'rc-label', label));
      const pips = el('span', 'rc-pips');
      for (let v = part === 'guns' ? 1 : 0; v <= n; v++) {
        const b = btn(names ? names[v] : String(v), `${label}: ${names ? (v ? `level ${names[v]}` : 'none') : `${v} gun${v > 1 ? 's' : ''}`}`, () => api.level(part, v), v === cur ? 'on' : '');
        pips.append(b);
      }
      r.append(pips);
      rows.append(r);
    };
    for (const p of PARTS) row(p.name, p.id, 3, l[p.id] ?? 0, ROMAN);
    box.append(rows, el('p', 'rc-small', 'A change starts the range again with these upgrades (their effect, not their look). Another gun: Try on the range from its card in the menu.'));
    return box;
  }

  function targetBlock(s, u) {
    const box = el('section', 'rc-sec');
    box.append(el('h3', null, `${u.name}: targets`), el('p', 'rc-note', 'Mission: the aeroplane reports each fall. Lay: the gun laid, no observer. Or click the board. Nothing is scored or paid; [ and ] change the time.'));
    const list = el('div', 'rc-list');
    const ts = targets().map((t) => ({ t, D: Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z), why: reach(u, t) })).sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || a.D - b.D);
    for (const { t, D, why } of ts) {
      const r = el('div', `rc-t${why ? ' far' : ''}${t.alive ? '' : ' dead'}`);
      const name = el('span', 'rc-tname', t.name);
      name.title = `${t.name} (${t.kind})${why ? `: ${why}` : ''}`;
      const busy = s.missions.some((m) => m.targetId === t.id && m.state !== 'done' && m.state !== 'failed');
      r.append(name, el('span', 'rc-tr', `${Math.round(D / lenU()).toLocaleString('en-US')} ${lenShort()}`), el('span', 'rc-tw', why || (t.alive ? '' : 'destroyed')),
        btn(busy ? 'Take' : 'Mission', 'An observed mission for the battery: the aeroplane reports each fall', () => { api.mission(t.id); refresh(true); }, 'small'),
        btn('Lay', 'Lay the gun on it, no observer', () => api.lay(t.id), 'small'));
      list.append(r);
    }
    box.append(list, btn('Rebuild all targets', 'Every destroyed target stands again', () => { api.revive(); refresh(true); }, 'small'));
    return box;
  }

  function debugBlock() {
    const box = el('section', 'rc-sec');
    box.append(el('h3', null, 'Debug'));
    const tog = (name, label, tip) => {
      const l = el('label', 'rc-tog');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = !!opts[name];
      c.addEventListener('change', () => { c.blur(); api.set(name, c.checked); });
      l.title = tip;
      l.append(c, ' ', label);
      return l;
    };
    box.append(tog('invuln', 'Invulnerable gun', 'Hostile shells burst but do no harm to the gun or its crew'),
      tog('endless', 'Endless ammunition', 'The stock is filled up as it is fired'),
      tog('perfect', 'No errors', 'No wind, calibration, map error or dispersion: every round lands where the lay puts it'));
    const acts = el('div', 'rc-acts');
    acts.append(btn('Hostile fire', 'The nearest hostile battery shells this battery (and sound ranging gives its counter-battery mission)', () => api.hostile(), 'small'),
      btn('SOS attack', 'Infantry attack a sector of the front, with red rockets and the SOS mission (each press the next sector)', () => api.sos(), 'small'),
      btn('Convoy', 'Traffic on the road at the crossroads, a harassing fire mission', () => api.convoy(), 'small'),
      btn('Train', 'A train in at the railhead, a mission', () => api.train(), 'small'),
      btn('Clear', 'Every mission, shell, report and attack gone; hostile fire stops', () => { api.clear(); refresh(true); }, 'small'),
      btn('Copy link', 'This setup as a link (battery, upgrades, switches)', async () => {
        const url = new URL(api.link(), location.href).href;
        try { await navigator.clipboard.writeText(url); host.hint('Link copied', 1200); } catch { host.hint(url, 4000); }
      }, 'small'));
    box.append(acts);
    return box;
  }

  api.refresh = refresh;
  api.card = card;
  return api;
}

import { Progression } from '../progression.js';
import { CAMPAIGN, BATTERIES } from '../campaign-data.js';
import { TREES, PARTS, LEVELS, maxGuns, partEffect, nodeOf, levelOf, modsOf, crewOf, detachmentOf, DETACHMENT } from '../research.js';
import { menuItems, hrefOf, itemForQuery, DIFFICULTIES, LESSONS_KEY, ERAS, ROSTER_WW1, WIP_KINDS, WIP_LINE, STILLS, stillsOf, stillUrl } from '../menuItems.js';
import { GUNS } from '../sim/tables.js';
import { rangeTable } from '../sim/shells.js';
import { createHangar } from './hangar.js';
import { OPS as OPS_WW1 } from '../ww1/ops.js';
import './menu.css';

// The main menu, laid out as a tank game's garage: a top bar with the era and nation tabs, the two screens (the Hangar:
// a battery's gun in 3D, its details, its modifications and the era's batteries along the bottom; Research: the era's
// tree) and the mission chooser with To battle beside it. Choosing a mission, a battery or a screen never reloads the
// page; To battle opens the mission's game page, which loads the world behind its own loading screen (ui/loading.js).
// Only the hangar's 3D view loads three.js (ui/hangar.js), the first time it shows a gun.
const STORE = 'drumfire.menu'; // { view, era, sel: { era: key }, tab, difficulty, rs: { era: kind } }: the viewer's last choices
const VIEWS = [['hangar', 'Hangar'], ['research', 'Research']];
const TABS = [['battles', 'Battles'], ['campaign', 'Campaign'], ['tutorials', 'Tutorials']];
const ERA_TABS = [['1917', '1917', 'British'], ['ww1', 'WW1', 'German'], ['ww2', 'WW2', 'German']];
const KEYS = '<li><kbd>1</kbd>-<kbd>9</kbd> select battery</li><li><kbd>Drag</kbd> orbit</li><li><kbd>Wheel</kbd> zoom</li><li><kbd>F</kbd> follow the shell to its burst</li><li><kbd>C</kbd> free camera</li><li><kbd>M</kbd> mute</li><li><kbd>[</kbd> <kbd>]</kbd> time compression</li><li><kbd>H</kbd> hide overlay</li><li><kbd>F3</kbd> stats</li>';
// the testing switches in the top bar's right corner: dev mode and unlimited points, and beside them the career reset
// (two clicks: the first arms it for 4 s)
const SWITCHES = '<div class="mn-switches"><div class="mn-sw-stack">'
  + '<button class="dev-unlock" data-switch="dev" type="button" aria-pressed="false" title="Dev mode puts every battery in the open battles, researched and fully upgraded, for testing; switch it off to play your own career. Saved in this browser."><span class="dev-light"></span>Dev mode <b class="dev-state">OFF</b></button>'
  + '<button class="dev-unlock" data-switch="free" type="button" aria-pressed="false" title="Unlimited points: research and modifications cost nothing (the tree order still holds), for testing. Saved in this browser."><span class="dev-light"></span>Unlimited points <b class="dev-state">OFF</b></button>'
  + '</div><button class="mn-reset" type="button" title="Reset the career: research, upgrades, points, battles and campaign wins back to a new career. The switches stay. Click twice to confirm.">Reset</button></div>';

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// the mark of an entry still being built (menuItems.js WIP_KINDS)
const wipBadge = () => { const b = el('span', 'wip-badge', 'WIP'); b.title = WIP_LINE; return b; };
const num = (n) => n.toLocaleString('en-US');
const ROMAN = ['I', 'II', 'III', 'IV'];
const nameOf = (kind) => BATTERIES.find((b) => b.kind === kind)?.name ?? kind;
// a row of level marks: `have` lit of `of`
const pips = (have, of) => { const p = el('span', 'rs-pips'); p.setAttribute('aria-hidden', 'true'); for (let i = 0; i < of; i++) p.append(el('i', i < have ? 'on' : null)); return p; };
// an action button; `act` keeps the focus on it across a render
// the test range (src/ui/range.js) with this battery selected, in its era (the menu's settings passed on)
const rangeHref = (era, kind) => {
  const p = new URLSearchParams();
  if (era !== '1917') p.set('mode', era);
  p.set('range', 1);
  p.set('kind', kind);
  const from = new URLSearchParams(location.search);
  for (const k of ['quality', 'hour', 'weather']) if (from.get(k)) p.set(k, from.get(k));
  return `index.html?${p}`;
};
const rangeBtn = (era, kind) => actBtn('Try on the range', `range:${kind}`, '', () => { location.href = rangeHref(era, kind); });
const actBtn = (text, act, why, onClick) => {
  const b = el('button', 'rs-act', text);
  b.type = 'button';
  b.dataset.act = act;
  b.disabled = !!why;
  if (why) b.title = why[0].toUpperCase() + why.slice(1) + '.';
  b.addEventListener('click', onClick);
  return b;
};

// An era's batteries in the order the screens show them (a research era: its tree; the WW1 sandbox: its roster), and
// the one shown (the one clicked, or the first)
const kindsOf = (era) => (TREES[era] ? TREES[era].map((n) => n.kind) : ROSTER_WW1.map((b) => b.kind));
const shownIn = (era, shown) => (kindsOf(era).includes(shown) ? shown : kindsOf(era)[0]);

// A researched battery's modifications: its points, then more guns and each part, level by level, bought with them.
// `onHover(part)` (the hangar: its camera to that upgrade's spot) as the pointer or the focus comes and goes on a row
function modsBlock(career, kind, onChange, onHover = null) {
  const box = el('div', 'rs-mods');
  const pts = el('p', 'rs-pts');
  pts.append(el('b', null, career.free ? 'Unlimited' : num(career.bp[kind] ?? 0)), ' battery points', el('small', null, career.free ? ' · unlimited points is on' : ' · earned by its own fire in battle'));
  const rows = el('div', 'rs-parts');
  const row = (label, stat, have, of, now, next, part) => {
    const r = el('div', 'rs-part');
    const l = el('div', 'rs-part-name');
    l.append(el('b', null, label), el('small', null, stat));
    const fx = el('div', 'rs-part-fx');
    fx.append(pips(have, of), el('small', null, now || 'Standard'));
    const cost = career.upgradeCost(kind, part), why = career.upgradeBlock(kind, part);
    const a = cost == null ? el('span', 'rs-top', 'At its best') : actBtn(`${part === 'guns' ? 'Add a gun' : 'Upgrade'} · ${num(cost)}`, `up:${kind}:${part}`, why, () => { career.upgrade(kind, part); onChange(); });
    if (cost != null && next) a.title = (a.title ? a.title + ' ' : '') + `Next: ${next}.`;
    r.append(l, fx, a);
    if (onHover) {
      r.addEventListener('mouseenter', () => onHover(part));
      r.addEventListener('mouseleave', () => onHover(null));
      r.addEventListener('focusin', () => onHover(part));
    }
    rows.append(r);
  };
  const g = career.level(kind, 'guns', false), gm = maxGuns(kind);
  if (gm > 1) row('Guns', 'More pits manned', g, gm, `${g} of ${gm} in action`, `${g + 1} guns`, 'guns');
  for (const p of PARTS) {
    const l = career.level(kind, p.id, false);
    row(p.name, p.stat, l, LEVELS, partEffect(p, l), partEffect(p, l + 1), p.id);
  }
  box.append(pts, rows);
  return box;
}
// A battery not yet researched: its cost, what must come first, and the button
function researchBlock(career, kind, onChange) {
  const box = el('div', 'rs-mods');
  const node = nodeOf(kind), why = career.researchBlock(kind);
  box.append(actBtn(`Research · ${num(node.cost)} RP`, `research:${kind}`, why, () => { career.research(kind); onChange(); }),
    el('p', 'rs-help', why ? `Not yet: ${why}.` : 'Research it to take it into the open battle with one gun, then earn its other guns and parts with its own points.'));
  return box;
}

// The Research screen of a research era (research.js, progression.js): the era's research points and its tree by tier
// (click a battery to see it) beside the battery shown, with its picture: research it, or spend its own points on its
// guns and parts. It shows the career itself; dev mode only lays every battery at its top over it in battle.
function researchView(career, era, shown, onShow, onChange, onHangar) {
  const tree = TREES[era], kind = shownIn(era, shown), node = nodeOf(kind);
  const root = el('div', 'rs');
  const side = el('div', 'rs-side');
  const purse = el('p', 'rs-purse');
  purse.append(el('b', null, career.free ? 'Unlimited' : num(career.rp[era])), ' research points', el('small', null, ` · ${career.battles[era]} ${career.battles[era] === 1 ? 'battle' : 'battles'} fought`));
  side.append(purse);
  if (career.dev) side.append(el('p', 'rs-note', 'Dev mode is on: in battle every battery is researched and at its best. This is your own career; switch dev mode off to play it.'));
  const cols = el('div', 'rs-tree');
  for (let t = 1; t <= 4; t++) {
    const col = el('div', 'rs-tier');
    col.append(el('small', 'rs-tier-n', `Tier ${ROMAN[t - 1]}`));
    for (const n of tree.filter((q) => q.tier === t)) {
      const own = career.owns(n.kind), why = career.researchBlock(n.kind);
      const b = el('button', 'rs-node');
      b.type = 'button';
      b.dataset.act = `show:${n.kind}`;
      b.classList.toggle('own', own);
      b.classList.toggle('ready', !own && !why);
      b.classList.toggle('on', n.kind === kind);
      b.setAttribute('aria-pressed', String(n.kind === kind));
      const name = el('b', null, nameOf(n.kind));
      if (WIP_KINDS.has(n.kind)) name.append(wipBadge());
      b.append(name, el('small', null, own ? (maxGuns(n.kind) > 1 ? `${career.level(n.kind, 'guns', false)} of ${maxGuns(n.kind)} guns` : 'Researched') : n.after && !career.owns(n.after) ? `After the ${nameOf(n.after)}` : `${num(n.cost)} RP`));
      b.addEventListener('click', () => onShow(n.kind));
      col.append(b);
    }
    cols.append(col);
  }
  side.append(cols, el('p', 'rs-help', 'Every battle in the era\'s open battle pays research points, won or lost, and each battery its own points for its upgrades.'));
  root.append(side);
  // the battery shown, with its picture from the game
  const card = el('section', 'rs-card');
  if (STILLS.has(kind)) {
    const pic = el('div', 'rs-pic');
    pic.style.backgroundImage = `url("${stillUrl(kind)}")`;
    pic.setAttribute('role', 'img');
    pic.setAttribute('aria-label', `The ${nameOf(kind)} firing`);
    card.append(pic);
  }
  const head = el('header', 'rs-card-head');
  const title = el('div');
  title.append(el('small', null, `Tier ${ROMAN[node.tier - 1]} · ${BATTERIES.find((b) => b.kind === kind)?.role ?? ''}`), el('h3', null, nameOf(kind)));
  const acts = el('div', 'rs-head-acts');
  acts.append(actBtn('Preview the full battery', `preview:${kind}`, '', () => onHangar(kind)), rangeBtn(era, kind));
  head.append(title, acts);
  card.append(head, career.owns(kind) ? modsBlock(career, kind, onChange) : researchBlock(career, kind, onChange));
  root.append(card);
  return root;
}

// The background: the selected entry's still from the game (menuItems.js stillsOf: its own, or its era's in turn every
// ROTATE ms), crossfaded between two layers once the next has loaded and drifting slowly (menu.css). For a viewer who
// asks for less motion it neither drifts nor turns. Returns show(ids).
const ROTATE = 10000;
function backdrop(root) {
  const bg = el('div', 'mn-bg');
  bg.setAttribute('aria-hidden', 'true');
  const layers = [el('div', 'mn-still'), el('div', 'mn-still')];
  bg.append(...layers, el('div', 'mn-shade'));
  root.prepend(bg);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let list = [], i = 0, shown = null, want = null, front = 0, timer = 0;
  const show = (id) => {
    if (id === shown) return;
    want = id;
    const img = new Image();
    img.onload = () => {
      if (want !== id) return; // another was asked for meanwhile
      front ^= 1;
      const L = layers[front];
      L.style.backgroundImage = `url("${stillUrl(id)}")`;
      L.style.animation = 'none'; // the drift starts again with the picture
      void L.offsetWidth;
      L.style.animation = '';
      L.classList.add('on');
      layers[front ^ 1].classList.remove('on');
      shown = id;
      if (list.length > 1) new Image().src = stillUrl(list[(i + 1) % list.length]); // the next in turn, ahead
    };
    img.src = stillUrl(id);
  };
  return (ids) => {
    if (ids.join() === list.join()) return;
    list = ids;
    i = Math.max(0, ids.indexOf(shown)); // a rotation that holds the picture shown goes on from it
    clearInterval(timer);
    if (!ids.length) return;
    show(ids[i]);
    if (ids.length > 1 && !calm) timer = setInterval(() => { i = (i + 1) % list.length; show(list[i]); }, ROTATE);
  };
}

// ---------------------------------------------------------------- the hangar's panels
const reach = new Map();
// the battery's furthest range on its top charge (the game's own range table), in metres
const maxRange = (kind) => {
  if (!reach.has(kind)) {
    let m = 0;
    for (let c = 0; c < (GUNS[kind]?.charges.length ?? 0); c++) for (const r of rangeTable(kind, c).rows) m = Math.max(m, r.range);
    reach.set(kind, m);
  }
  return reach.get(kind);
};
const roleOf = (kind) => BATTERIES.find((b) => b.kind === kind)?.role ?? ROSTER_WW1.find((b) => b.kind === kind)?.role ?? '';
// a WW1 German battery's guns (its open battle position; the Paris Gun's own mission)
const gunsWW1 = (kind) => Object.values(OPS_WW1).flatMap((op) => op.units).find((u) => u.kind === kind)?.pieces.length ?? 1;
const nameIn = (kind) => BATTERIES.find((b) => b.kind === kind)?.name ?? ROSTER_WW1.find((b) => b.kind === kind)?.name ?? kind;

// The battery on parade in the hangar (ui/hangar.js): as it takes the field (dev mode: at its best), its guns and the men
// of each gun (the detachment and its relief crews); or, to preview it from Research, the full battery at its drill
// strength (every gun, the detachment without reliefs)
function parade(career, era, kind, preview = false) {
  const name = nameIn(kind), drill = GUNS[kind]?.crew ?? 8, base = detachmentOf(kind, drill);
  if (!TREES[era]) return { kind, name, guns: gunsWW1(kind), men: base, base, levels: {} };
  if (preview) return { kind, name, guns: maxGuns(kind), men: base, base, levels: {} };
  const lv = career.lineupLevels(era)[kind] ?? {};
  const levels = Object.fromEntries(PARTS.map((p) => [p.id, levelOf(lv, p.id)]));
  // `next`: what more guns and the first relief crews would bring, so the hangar keeps their places and shows them on hover
  const next = { guns: maxGuns(kind), reliefs: crewOf(kind, { crew: 1 }, drill) - base };
  return { kind, name, guns: levelOf(lv, 'guns'), men: crewOf(kind, lv, drill), base, levels, next };
}
// the batteries the hangar shows: those in the lineup (dev mode: all), and every one in the WW1 sandbox
const hangarKinds = (career, era) => (TREES[era] ? kindsOf(era).filter((k) => career.unlocked(k)) : kindsOf(era));

// The battery's details beside the guns: what it is for, its figures as it takes the field (or, previewed, at its full
// drill strength), where it stands
function hangarInfo(career, era, kind, preview = false) {
  const box = el('div', 'hg-info-in');
  const node = nodeOf(kind), g = GUNS[kind], sandbox = !TREES[era];
  const own = sandbox || career.owns(kind);
  const levels = sandbox ? {} : preview ? { guns: maxGuns(kind) } : career.lineupLevels(era)[kind] ?? career.levels[kind] ?? {}, mods = modsOf(levels);
  box.append(el('small', 'mn-kicker', sandbox ? 'WW1 German · sandbox' : `Tier ${ROMAN[node.tier - 1]} · ${era === 'ww2' ? 'WW2 German' : '1917 British'}`));
  const h = el('h1', 'hg-name', nameIn(kind));
  if (WIP_KINDS.has(kind)) h.append(wipBadge());
  box.append(h, el('p', 'hg-role', roleOf(kind)));
  if (g) {
    const load = g.load.reduce((a, st) => a + st.dur, 0);
    const guns = sandbox ? gunsWW1(kind) : levelOf(levels, 'guns');
    const figs = [
      ['Range', `${(maxRange(kind) / 1000).toFixed(1)} km`],
      ['Shell', g.mass ? `${num(g.mass)} kg` : '-'],
      ['Reload', `${Math.round(load * mods.load)} s${mods.load < 1 ? ` (was ${Math.round(load)})` : ''}`],
      ['Guns', sandbox ? String(guns) : `${guns} of ${maxGuns(kind)}`],
      ['Crew', (() => { const base = detachmentOf(kind, g.crew), all = crewOf(kind, levels, g.crew); return `${base} a gun${all > base ? ` + ${all - base} reliefs` : ''}${DETACHMENT[kind]?.est ? ' (est.)' : ''}`; })()],
      ['Traverse', `±${Math.round((g.traverse * 180) / Math.PI)}°`],
    ];
    const dl = el('dl', 'hg-figs');
    for (const [k, v] of figs) dl.append(el('dt', null, k), el('dd', null, v));
    box.append(dl);
  }
  // the test range: any battery, earned or not, with any upgrades, nothing paid
  const tr = rangeBtn(era, kind);
  tr.classList.add('hg-range');
  tr.title = 'Fire it on the test range: any target, any upgrades, nothing scored';
  box.append(tr);
  box.append(el('p', 'hg-state', sandbox ? 'Yours from the start: the WW1 German era is a sandbox.' : own ? 'Researched: in your lineup for the open battle.'
    : career.dev ? `In the lineup in dev mode; your own career has not researched it (${career.researchBlock(kind)}).` : `Not researched: ${career.researchBlock(kind)}.`));
  if (career.dev && !sandbox) box.append(el('p', 'rs-note', 'Dev mode is on: on parade and in battle every battery is researched and at its best. The modifications are your own career.'));
  return box;
}

// The modifications panel on the right: the battery's upgrades, or its research, or (WW1) none
function hangarMods(career, era, kind, onChange, onResearch, onHover) {
  const box = el('div', 'hg-mods-in');
  box.append(el('h2', 'hg-panel-h', !TREES[era] || career.owns(kind) ? 'Modifications' : 'Research'));
  if (!TREES[era]) box.append(el('p', 'rs-help', 'No upgrades in this era: the Gruppe fights as it stands.'));
  else if (career.owns(kind)) box.append(modsBlock(career, kind, onChange, onHover));
  else {
    box.append(researchBlock(career, kind, onChange));
    box.append(actBtn('Open the research tree', `tree:${kind}`, '', onResearch));
  }
  return box;
}

// The batteries along the bottom, one card each (`kinds`: the lineup's): its tier, name and guns
function slotCards(career, era, kind, onPick, kinds = kindsOf(era)) {
  return kinds.map((k) => {
    const n = nodeOf(k), sandbox = !TREES[era], own = sandbox || career.owns(k), why = sandbox ? '' : career.researchBlock(k);
    const b = el('button', 'hg-slot');
    b.type = 'button';
    b.dataset.act = `slot:${k}`;
    b.classList.toggle('on', k === kind);
    b.classList.toggle('own', own);
    b.classList.toggle('ready', !own && !why);
    b.setAttribute('aria-pressed', String(k === kind));
    if (n) b.append(el('span', 'hg-slot-tier', ROMAN[n.tier - 1]));
    const name = el('b', null, nameIn(k));
    if (WIP_KINDS.has(k)) name.append(wipBadge());
    b.append(name);
    if (own && !sandbox && maxGuns(k) > 1) b.append(pips(career.level(k, 'guns', false), maxGuns(k)));
    b.append(el('small', null, sandbox ? 'Yours' : own ? `${career.level(k, 'guns', false)} of ${maxGuns(k)} ${maxGuns(k) === 1 ? 'gun' : 'guns'}` : n.after && !career.owns(n.after) ? `After the ${nameOf(n.after)}` : `${num(n.cost)} RP`));
    b.addEventListener('click', () => onPick(k));
    return b;
  });
}

export function mountMenu(root = document.getElementById('menu')) {
  const query = new URLSearchParams(location.search);
  let storage;
  try { storage = window.localStorage; } catch { /* a session-only career */ }
  const career = new Progression(storage);
  const memo = read(STORE, {});
  memo.sel ??= {};
  let items = [];
  let era = ERAS.includes(query.get('mode')) ? query.get('mode') : query.has('mode') ? '1917' : ERAS.includes(memo.era) ? memo.era : '1917';
  let tab = query.get('lessons') ? 'tutorials' : TABS.some(([t]) => t === memo.tab) ? memo.tab : 'battles';
  // ?view=research (the end card's Research button) opens that screen; otherwise the last one
  let view = VIEWS.some(([v]) => v === query.get('view')) ? query.get('view') : VIEWS.some(([v]) => v === memo.view) ? memo.view : 'hangar';
  let difficulty = DIFFICULTIES.includes(memo.difficulty) ? memo.difficulty : 'Normal';
  let sel = null, open = query.has('lessons') || query.has('campaign');

  root.innerHTML = `<header class="mn-top">
    <div class="mn-top-in">
      <b class="mn-mark">DRUMFIRE</b>
      <nav class="mn-eras" aria-label="Era and nation">${ERA_TABS.map(([e, n, side]) => `<button type="button" data-era="${e}">${n} <small>${side}</small></button>`).join('')}</nav>
      <nav class="mn-views" aria-label="Screens">${VIEWS.map(([v, name]) => `<button type="button" data-view="${v}">${name}<span class="mn-view-n"></span></button>`).join('')}</nav>
      <div class="mn-go">
        <button type="button" class="mn-mode" aria-haspopup="dialog" aria-expanded="false" title="Choose the battle, campaign mission or lesson"><small class="mn-mode-k"></small><b class="mn-mode-t"></b><span class="mn-mode-d"></span></button>
        <button type="button" id="mn-play">To battle</button>
      </div>
      ${SWITCHES}
    </div>
  </header>
  <section class="mn-drop" role="dialog" aria-label="Choose a mission" hidden>
    <button type="button" class="mn-drop-close" aria-label="Close">\u2715</button>
    <div class="mn-drop-list">
      <nav class="mn-tabs" aria-label="Lists">${TABS.map(([t, name]) => `<button type="button" data-tab="${t}">${name} <span class="mn-count"></span></button>`).join('')}</nav>
      <p class="mn-help"></p>
      <div class="mn-list" role="listbox" aria-label="Missions"></div>
    </div>
    <div class="mn-drop-detail">
      <div class="mn-detail" aria-live="polite"><small class="mn-kicker"></small><h2 class="mn-title"></h2><p class="mn-sub"></p><p class="mn-blurb"></p><ul class="mn-lines"></ul></div>
      <div class="mn-difficulty" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `<button type="button" role="radio" data-d="${d}">${d}</button>`).join('')}</div>
      <button type="button" class="mn-play2">To battle</button>
      <ul class="keys mn-keys">${KEYS}</ul>
    </div>
  </section>
  <main class="mn-hangar" data-for="hangar">
    <div class="hg-stage" aria-hidden="true"></div>
    <div class="hg-preview" hidden><span>Preview: the full battery</span><button type="button" class="rs-act" data-act="back-research">Back to research</button></div>
    <section class="hg-info" aria-label="Battery"></section>
    <aside class="hg-mods" aria-label="Modifications"></aside>
    <footer class="hg-bar"><div class="hg-slots" role="toolbar" aria-label="Batteries"></div><div class="mn-status"><span class="mn-save"></span></div></footer>
  </main>
  <div class="mn-rsv" data-for="research" hidden>
    <header class="rsv-head"><div><small class="mn-kicker">FIELD COMMAND</small><h1 class="rsv-title">Research</h1></div></header>
    <p class="rsv-help"></p>
    <div class="rsv-body"></div>
    <ul class="mn-roster" hidden></ul>
    <footer class="mn-foot"><span class="mn-save"></span></footer>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => root.querySelectorAll(s);
  const list = $('.mn-list'), drop = $('.mn-drop'), modeBtn = $('.mn-mode');
  const still = backdrop(root);
  // the loading screen: up until the hangar's first parade stands drawn (or a minute has passed, whatever happens)
  const loading = el('div', 'mn-loading');
  loading.setAttribute('role', 'status');
  loading.innerHTML = '<div class="ml-in"><h1 class="ml-brand">DRUMFIRE</h1><p class="ml-era"></p><div class="ml-bar"><i></i></div><p class="ml-step">Loading</p></div>';
  root.append(loading);
  let loaded = false;
  const lift = () => {
    if (loaded) return;
    loaded = true;
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 700);
  };
  setTimeout(lift, 60000);
  const hangar = createHangar($('.hg-stage'), {
    onProgress: (text, k) => {
      if (loaded) return;
      loading.querySelector('.ml-step').textContent = text;
      loading.querySelector('.ml-bar i').style.width = `${Math.round(k * 100)}%`;
    },
    onReady: lift,
  });
  window.__menuHangar = hangar; // the headless tools look at the hangar through it

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ view, era, sel: memo.sel, tab, difficulty, rs: memo.rs })); } catch { /* private mode */ } };
  const playable = (i) => i && i.era === era && !i.locked;
  const firstOf = (t) => items.find((i) => i.tab === t && playable(i));
  const HELP = {
    battles: { '1917': 'The open battle with the batteries you have researched. It pays research points, won or lost.', ww1: 'The open battle with the whole Gruppe from the start, nothing to earn; the Paris Gun\'s own mission; or crew the Big Bertha demo.', ww2: 'The open battle with the batteries you have researched (it pays research points, won or lost), or a special weapon\'s own operation (open to all).' },
    campaign: { ww1: 'No campaign in this era: the open battle is a sandbox and every battery is yours from the start.', other: 'One-off challenges, in any order: each loans you a battery for a set task, and the first win pays research points.' },
    tutorials: { ww1: 'No lessons of its own yet: the 1917 and WW2 lessons teach the same drill (lay from the board, range, fire for effect).', other: 'Short lessons on a quiet range, in daylight.' },
  };
  const RESEARCH_HELP = {
    ww1: 'Nothing to research in this era: every battery of the Gruppe is yours from the start.',
    other: 'Research points buy new batteries. Each battery starts with one gun; its own points buy its other guns and better parts.',
  };
  const shown = () => shownIn(era, memo.rs?.[era]);
  // the battery in the hangar: the one chosen if it is in the lineup, else the lineup's first; or the one previewed
  let preview = null;
  const inHangar = () => { const ks = hangarKinds(career, era), k = shown(); return preview ?? (ks.includes(k) ? k : ks[0] ?? k); };
  const pick = (kind, to = view) => { (memo.rs ??= {})[era] = kind; view = to; preview = null; save(); render(); };

  function select(item, focus = false) {
    if (!playable(item)) return;
    sel = item;
    memo.sel[era] = item.key;
    save();
    render();
    if (focus) list.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.focus();
  }
  const setOpen = (on) => {
    open = on;
    drop.hidden = !on;
    modeBtn.setAttribute('aria-expanded', String(on));
    if (on) render();
  };

  // the top bar: the era tabs, the screens (Research with the era's RP), the chosen mission; the dev switch, the save line
  function renderTop() {
    for (const b of $$('[data-view]')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
      if (b.dataset.view === 'research') b.querySelector('.mn-view-n').textContent = TREES[era] ? (career.free ? 'unlimited' : `${num(career.rp[era])} RP`) : '';
    }
    for (const w of $$('[data-for]')) w.hidden = w.dataset.for !== view;
    for (const b of $$('[data-era]')) { b.classList.toggle('on', b.dataset.era === era); b.setAttribute('aria-pressed', String(b.dataset.era === era)); }
    $('.mn-mode-k').textContent = sel.kicker;
    $('.mn-mode-t').textContent = sel.title;
    $('.mn-mode-d').textContent = sel.difficulty ? difficulty : '';
    for (const sw of $$('[data-switch]')) {
      const on = sw.dataset.switch === 'free' ? career.free : career.dev;
      sw.setAttribute('aria-pressed', String(on));
      sw.querySelector('.dev-state').textContent = on ? 'ON' : 'OFF';
    }
    for (const s of $$('.mn-save')) s.textContent = career.saved ? 'Saved in this browser' : 'Saving unavailable: progress is lost on leaving';
    document.title = era === 'ww2' ? 'Drumfire WW2: German artillery' : era === 'ww1' ? 'Drumfire WW1: German heavy artillery, 1918' : 'Drumfire: heavy artillery, Ypres 1917';
  }

  // the mission chooser: the lists (battles, campaign missions, lessons) and the chosen one's orders
  function renderDrop() {
    $('.mn-kicker').textContent = sel.kicker;
    $('.mn-title').textContent = sel.title;
    if (sel.wip) $('.mn-title').append(wipBadge());
    $('.mn-sub').textContent = sel.sub;
    $('.mn-blurb').textContent = sel.blurb;
    $('.mn-lines').replaceChildren(...sel.lines.map((t) => el('li', null, t)));
    $('.mn-difficulty').hidden = !sel.difficulty;
    for (const b of $$('[data-d]')) { b.classList.toggle('on', b.dataset.d === difficulty); b.setAttribute('aria-checked', String(b.dataset.d === difficulty)); }
    const ofEra = items.filter((i) => i.era === era), missions = CAMPAIGN.filter((m) => m.era === era);
    const counts = {
      campaign: missions.length ? `${missions.filter((m) => career.completed.has(m.id)).length}/${missions.length}` : '',
      tutorials: `${ofEra.filter((i) => i.tab === 'tutorials' && i.done).length}/${ofEra.filter((i) => i.tab === 'tutorials').length}`,
    };
    for (const b of $$('[data-tab]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
      b.querySelector('.mn-count').textContent = counts[b.dataset.tab] ?? '';
    }
    $('.mn-help').textContent = HELP[tab][era] ?? HELP[tab].other;
    list.replaceChildren(...ofEra.filter((i) => i.tab === tab).map((i, n) => {
      const row = el('button', 'mn-row');
      row.type = 'button';
      row.dataset.key = i.key;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === sel));
      row.classList.toggle('on', i === sel);
      row.classList.toggle('done', !!i.done);
      row.disabled = !!i.locked;
      if (i.locked) row.title = `Locked: ${i.locked}.`;
      const label = el('span', 'mn-label');
      const name = el('b', null, i.title);
      if (i.wip) name.append(wipBadge());
      label.append(name, el('small', null, i.locked ? `Locked: ${i.locked}` : i.side));
      row.append(el('span', 'mn-n', i.n ?? String(n + 1).padStart(2, '0')), label);
      row.addEventListener('click', () => select(i));
      row.addEventListener('dblclick', () => { select(i); go(); });
      return row;
    }));
    if (!list.children.length) list.append(el('p', 'mn-empty', tab === 'campaign' ? 'No campaign missions in this era.' : 'Nothing here yet.'));
  }

  // keep the focus on the control that was pressed when a screen is built again
  const keepFocus = (box, build) => {
    const focus = document.activeElement?.dataset?.act;
    build();
    if (focus) box.querySelector(`[data-act="${CSS.escape(focus)}"]`)?.focus();
  };

  // the Hangar: the battery on parade in 3D, its details, its modifications, the lineup's batteries along the bottom
  // (a battery previewed from Research: at full strength, with the way back)
  function renderHangar() {
    const kind = inHangar();
    hangar.setActive(true);
    hangar.show({ era, battery: parade(career, era, kind, !!preview) });
    $('.hg-preview').hidden = !preview;
    keepFocus($('.mn-hangar'), () => {
      $('.hg-info').replaceChildren(hangarInfo(career, era, kind, !!preview));
      $('.hg-mods').replaceChildren(hangarMods(career, era, kind, render, () => pick(kind, 'research'), (part) => hangar.lookAt(part)));
      $('.hg-slots').replaceChildren(...slotCards(career, era, preview ? null : kind, (k) => pick(k), hangarKinds(career, era)));
    });
  }

  // the Research screen of the era: its tree and the battery shown (the WW1 German sandbox: its roster)
  function renderResearch() {
    hangar.setActive(false);
    const sandbox = !TREES[era];
    $('.rsv-help').textContent = sandbox ? RESEARCH_HELP.ww1 : RESEARCH_HELP.other;
    $('.mn-roster').hidden = !sandbox;
    $('.rsv-body').hidden = sandbox;
    if (sandbox) {
      still(stillsOf({ era }));
      $('.mn-roster').replaceChildren(...ROSTER_WW1.map((b) => {
        const row = el('li', 'available');
        const bn = el('b', null, b.name);
        if (WIP_KINDS.has(b.kind)) bn.append(wipBadge());
        row.append(bn, el('small', null, 'Yours from the start'));
        return row;
      }));
      return;
    }
    const kind = shown();
    still(STILLS.has(kind) ? [kind] : stillsOf({ era }));
    keepFocus($('.rsv-body'), () => $('.rsv-body').replaceChildren(researchView(career, era, kind, (k) => pick(k), render, (k) => { (memo.rs ??= {})[era] = k; view = 'hangar'; preview = k; save(); render(); root.scrollTop = 0; })));
  }

  function render() {
    items = menuItems(career, read(LESSONS_KEY, {}));
    // the entries are built again (a lock may have opened): the selection is held by its key
    sel = items.find((i) => i.key === sel?.key && playable(i)) ?? items.find((i) => i.key === memo.sel[era] && playable(i)) ?? firstOf('battles');
    renderTop();
    if (!loaded) loading.querySelector('.ml-era').textContent = `${ERA_TABS.find(([e]) => e === era).slice(1).join(' ')} · the batteries drawn up for inspection`;
    if (open) renderDrop();
    if (view === 'research') renderResearch(); else renderHangar();
    // the hangar is loaded behind the loading screen whichever screen opens first
    if (view === 'research' && !loaded) hangar.show({ era, battery: parade(career, era, inHangar()) });
  }

  // (the test range opens with the battery shown in the hangar)
  const go = () => { if (playable(sel)) location.href = sel.key.startsWith('range:') ? rangeHref(era, inHangar()) : hrefOf(sel, difficulty, query); };

  $('[data-act="back-research"]').addEventListener('click', () => pick(preview ?? shown(), 'research'));
  for (const b of $$('[data-view]')) b.addEventListener('click', () => {
    if (b.dataset.view === view && !preview) return;
    view = b.dataset.view;
    preview = null;
    save();
    render();
    root.scrollTop = 0;
  });
  for (const b of $$('[data-era]')) b.addEventListener('click', () => {
    if (b.dataset.era === era) return;
    era = b.dataset.era;
    sel = null;
    preview = null;
    save();
    render();
    // the address remembers the era (a reload or a game's way back keeps it); nothing is loaded
    const url = new URL(location.href);
    if (era !== '1917') url.searchParams.set('mode', era); else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
  });
  for (const b of $$('[data-tab]')) b.addEventListener('click', () => { tab = b.dataset.tab; save(); render(); });
  for (const b of $$('[data-d]')) b.addEventListener('click', () => { difficulty = b.dataset.d; save(); render(); });
  $('[data-switch="dev"]').addEventListener('click', () => { career.setDev(!career.dev); render(); });
  $('[data-switch="free"]').addEventListener('click', () => { career.setFree(!career.free); render(); });
  // the career reset: the first click arms it ("Confirm?") for 4 s, the second resets
  const resetBtn = $('.mn-reset');
  let armed = 0;
  const disarm = () => { clearTimeout(armed); armed = 0; resetBtn.classList.remove('armed'); resetBtn.textContent = 'Reset'; };
  resetBtn.addEventListener('click', () => {
    if (!armed) {
      resetBtn.classList.add('armed');
      resetBtn.textContent = 'Confirm?';
      armed = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    career.reset();
    preview = null;
    render();
    resetBtn.textContent = 'Done';
    setTimeout(() => { if (!armed) resetBtn.textContent = 'Reset'; }, 1500);
  });
  modeBtn.addEventListener('click', () => setOpen(!open));
  $('.mn-drop-close').addEventListener('click', () => { setOpen(false); modeBtn.focus(); });
  $('#mn-play').addEventListener('click', go);
  $('.mn-play2').addEventListener('click', go);
  // a click outside the chooser closes it
  addEventListener('pointerdown', (e) => { if (open && !drop.contains(e.target) && !modeBtn.contains(e.target)) setOpen(false); });
  // Escape closes the chooser; in it Up and Down walk the list; Enter goes to battle; in the hangar Left and Right
  // walk the batteries
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) { setOpen(false); modeBtn.focus(); return; }
    if (e.code === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); go(); return; }
    if (!open && view === 'hangar' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !e.target.closest?.('input')) {
      const ks = hangarKinds(career, era), k = ks.indexOf(inHangar());
      e.preventDefault();
      pick(ks[(k + (e.code === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]);
      return;
    }
    if (!open || (e.code !== 'ArrowDown' && e.code !== 'ArrowUp')) return;
    const rows = items.filter((i) => i.era === era && i.tab === tab && playable(i));
    if (!rows.length) return;
    e.preventDefault();
    const k = rows.indexOf(sel);
    select(rows[k < 0 ? 0 : (k + (e.code === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length], true);
  });

  // a way back from a game (?sel=) or an old address (?op=, ?campaign=) selects its entry
  items = menuItems(career, read(LESSONS_KEY, {}));
  const asked = query.get('sel') ? items.find((i) => i.key === query.get('sel')) : query.get('op') || query.get('campaign') ? itemForQuery(query, items) : null;
  if (asked) { era = asked.era; if (playable(asked)) { sel = asked; memo.sel[era] = asked.key; tab = asked.tab; } }
  render();
  setOpen(open);
  save();
  if (['sel', 'op', 'campaign', 'lessons', 'view'].some((k) => query.has(k))) {
    const url = new URL(location.href);
    for (const k of ['sel', 'op', 'campaign', 'lessons', 'view']) url.searchParams.delete(k);
    if (era !== '1917') url.searchParams.set('mode', era); else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
  }
  document.body.classList.add('ready');
}

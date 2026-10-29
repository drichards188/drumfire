import { Progression } from '../progression.js';
import { CAMPAIGN, BATTERIES } from '../campaign-data.js';
import { TREES, LINES, PARTS, LEVELS, maxGuns, partEffect, nodeOf, eraOfKind, levelOf, modsOf, crewOf, detachmentOf, DETACHMENT, gunEraOf, isOffmap } from '../research.js';
import { menuItems, hrefOf, itemForQuery, DIFFICULTIES, LESSONS_KEY, NATIONS, NATION_OF, ROSTER_WW1, WIP_KINDS, WIP_LINE, STILLS, stillsOf, stillUrl, stillOf } from '../menuItems.js';
import { GUNS } from '../sim/tables.js';
import { rangeTable } from '../sim/shells.js';
import { createHangar } from './hangar.js';
import { OPS as OPS_WW1 } from '../ww1/ops.js';
import { THREAT, MAX_LEVEL, threatOf, rollModifiers, modifierOf, SLOTS } from '../threat.js';
import { capabilities, recommendedLevel } from '../capability.js';
import { showSummary, loadSummary, markSeen } from './summary.js';
import './menu.css';

// The main menu, laid out as a tank game's garage: a top bar with the nation tabs (Germany: the 1918 and the WW2
// entries and one tree; Britain is hidden for now), the two screens (the Hangar: a battery's gun in 3D, its details, its
// modifications and the lineup's batteries along the bottom; Research: the tree in its lines) and the mission chooser
// with To battle beside it. Choosing a mission, a battery or a screen never reloads the
// page; To battle opens the mission's game page, which loads the world behind its own loading screen (ui/loading.js).
// Only the hangar's 3D view loads three.js (ui/hangar.js), the first time it shows a gun.
const STORE = 'drumfire.menu'; // { view, era (the nation), sel: { era: key }, tab, difficulty, rs: { era: kind } }: the viewer's last choices
const VIEWS = [['hangar', 'Hangar'], ['research', 'Research']];
const TABS = [['battles', 'Battles'], ['campaign', 'Campaign'], ['tutorials', 'Tutorials']];
const SHOWN = NATIONS.filter((n) => !n.hidden);
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
// the test range (src/ui/range.js) with this battery selected, on its own era's map (the menu's settings passed on)
const rangeHref = (era, kind) => {
  const p = new URLSearchParams(), e = gunEraOf(kind);
  if (e !== '1917') p.set('mode', e);
  p.set('range', 1);
  p.set('kind', kind);
  const from = new URLSearchParams(location.search);
  for (const k of ['quality', 'hour', 'weather']) if (from.get(k)) p.set(k, from.get(k));
  return `index.html?${p}`;
};
const rangeBtn = (era, kind) => actBtn('Try on the range', `range:${kind}`, isOffmap(kind) ? 'off-map support fires only in battle' : '', () => { location.href = rangeHref(era, kind); });
// a progress bar (0 to 1)
const bar = (k) => { const b = el('span', 'rs-bar'), f = el('i'); f.style.width = `${Math.round(Math.min(1, k) * 100)}%`; b.append(f); return b; };
const lineOf = (kind) => LINES[eraOfKind(kind)]?.find((l) => l.id === nodeOf(kind)?.line);
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
// A battery not yet researched: how far its research has got, and the button that makes it the research target (with
// unlimited points on, one that researches it at once); what must come first when it cannot be researched yet
function researchBlock(career, kind, onChange) {
  const box = el('div', 'rs-mods');
  const node = nodeOf(kind), why = career.researchBlock(kind), on = career.targetOf(eraOfKind(kind)) === kind;
  const pts = el('p', 'rs-pts');
  pts.append(el('b', null, num(node.cost - career.costLeft(kind))), ` of ${num(node.cost)} research points`);
  box.append(pts, bar(career.researchShare(kind)));
  if (on) box.append(el('p', 'rs-on', 'Researching: every battle\'s research points go to it until it is done.'));
  else box.append(actBtn('Research this battery', `target:${kind}`, why, () => { career.setTarget(kind); onChange(); }));
  if (career.free) box.append(actBtn('Research now · unlimited points', `research:${kind}`, why, () => { career.research(kind); onChange(); }));
  box.append(el('p', 'rs-help', why ? `Not yet: ${why}.` : isOffmap(kind)
    ? 'Off-map support: in battle you pick it and give it a target; it fires in its own time and takes long to be ready again.'
    : 'Once researched it takes the open battle with one gun; its own points then buy its other guns and better parts.'));
  return box;
}

// The Research screen (research.js, progression.js): the battery being researched and how far it has got, the tree in
// its lines (a column each, the batteries in the order they are researched, each with its rank; click one to see it)
// beside the battery shown, with its picture: make it the research target, or spend its own points on its guns and
// parts. It shows the career itself; dev mode only lays every battery at its top over it in battle.
function researchView(career, era, shown, onShow, onChange, onHangar) {
  const tree = TREES[era], kind = shownIn(era, shown), node = nodeOf(kind), tgt = career.targetOf(era);
  const root = el('div', 'rs');
  const side = el('div', 'rs-side');
  const purse = el('div', 'rs-purse');
  if (tgt) {
    const n = nodeOf(tgt);
    purse.append(el('small', null, 'Researching'), el('b', null, nameOf(tgt)), bar(career.researchShare(tgt)),
      el('small', null, `${num(n.cost - career.costLeft(tgt))} of ${num(n.cost)} RP · ${career.battles[era]} ${career.battles[era] === 1 ? 'battle' : 'battles'} fought`));
  } else purse.append(el('small', null, 'Research'), el('b', null, 'Every battery researched'), el('small', null, `${num(career.rp[era])} RP to spare`));
  side.append(purse);
  if (career.dev) side.append(el('p', 'rs-note', 'Dev mode is on: any battery can join the lineup, and in battle each is at its best. This is your own career; switch dev mode off to play it.'));
  const cols = el('div', 'rs-tree');
  cols.style.setProperty('--lines', LINES[era].length);
  for (const line of LINES[era]) {
    const col = el('div', 'rs-line');
    const h = el('div', 'rs-line-n');
    h.append(el('b', null, line.name), el('small', null, line.de ?? ''));
    col.append(h);
    for (const n of tree.filter((q) => q.line === line.id)) {
      const own = career.owns(n.kind), why = career.researchBlock(n.kind), on = n.kind === tgt;
      const b = el('button', 'rs-node');
      b.type = 'button';
      b.dataset.act = `show:${n.kind}`;
      b.classList.toggle('own', own);
      b.classList.toggle('ready', !own && !why);
      b.classList.toggle('target', on);
      b.classList.toggle('on', n.kind === kind);
      b.setAttribute('aria-pressed', String(n.kind === kind));
      const name = el('b', null, nameOf(n.kind));
      if (WIP_KINDS.has(n.kind)) name.append(wipBadge());
      b.append(el('span', 'rs-rank', ROMAN[n.tier - 1]), name);
      if (on) b.append(bar(career.researchShare(n.kind)));
      b.append(el('small', null, own ? (maxGuns(n.kind) > 1 ? `${career.level(n.kind, 'guns', false)} of ${maxGuns(n.kind)} guns` : 'Researched')
        : on ? `Researching · ${Math.round(career.researchShare(n.kind) * 100)}%` : why ? `After the ${nameOf(n.after)}` : `${num(n.cost)} RP`));
      b.addEventListener('click', () => onShow(n.kind));
      col.append(b);
    }
    cols.append(col);
  }
  side.append(cols, el('p', 'rs-help', 'Each line is researched in order, and the first of every line is open from the start. Every open battle pays research points to the battery you are researching, won or lost, and each battery its own points for its upgrades.'));
  root.append(side);
  // the battery shown, with its picture from the game
  const card = el('section', 'rs-card');
  if (stillOf(kind)) {
    const pic = el('div', 'rs-pic');
    pic.style.backgroundImage = `url("${stillUrl(stillOf(kind))}")`;
    pic.setAttribute('role', 'img');
    pic.setAttribute('aria-label', `The ${nameOf(kind)} firing`);
    card.append(pic);
  }
  const head = el('header', 'rs-card-head');
  const title = el('div');
  title.append(el('small', null, `Rank ${ROMAN[node.tier - 1]} · ${lineOf(kind)?.name ?? ''} · ${BATTERIES.find((b) => b.kind === kind)?.role ?? ''}`), el('h3', null, nameOf(kind)));
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
  const lv = career.ownedLevels(era)[kind] ?? {};
  const levels = Object.fromEntries(PARTS.map((p) => [p.id, levelOf(lv, p.id)]));
  // `next`: what more guns and the first relief crews would bring, so the hangar keeps their places and shows them on hover
  const next = { guns: maxGuns(kind), reliefs: crewOf(kind, { crew: 1 }, drill) - base };
  return { kind, name, guns: levelOf(lv, 'guns'), men: crewOf(kind, lv, drill), base, levels, next };
}
// the batteries the hangar shows: the lineup's (the bench is reached by a slot's swap), and every one in the WW1 sandbox
const hangarKinds = (career, era) => (TREES[era] ? career.lineupKinds(era) : kindsOf(era));

// The battery's details beside the guns: what it is for, its figures as it takes the field (or, previewed, at its full
// drill strength), where it stands
function hangarInfo(career, era, kind, preview = false, onLineup = null) {
  const box = el('div', 'hg-info-in');
  const node = nodeOf(kind), g = GUNS[kind], sandbox = !TREES[era];
  const own = sandbox || career.owns(kind);
  const levels = sandbox ? {} : preview ? { guns: maxGuns(kind) } : career.ownedLevels(era)[kind] ?? career.levels[kind] ?? {}, mods = modsOf(levels);
  box.append(el('small', 'mn-kicker', sandbox ? 'WW1 German · sandbox' : `Rank ${ROMAN[node.tier - 1]} · ${lineOf(kind)?.name ?? ''} · ${{ ww1: '1914 to 1918', ww2: 'WW2', '1917': '1917 British' }[gunEraOf(kind)]}`));
  const h = el('h1', 'hg-name', nameIn(kind));
  if (WIP_KINDS.has(kind)) h.append(wipBadge());
  box.append(h, el('p', 'hg-role', roleOf(kind)));
  if (isOffmap(kind)) {
    // the weapons that fire from off the map: no range table or reload of their own in battle
    const dl = el('dl', 'hg-figs'), reachKm = Math.round((BATTERIES.find((b) => b.kind === kind)?.range ?? 0) / 1000);
    for (const [k, v] of [['Fires', 'from off the map'], ['Reach', reachKm ? `${num(reachKm)} km` : '-'], ['In battle', 'one at a time, then a long wait'], ['Crew', `${detachmentOf(kind, g?.crew ?? 8)} a site${DETACHMENT[kind]?.est ? ' (est.)' : ''}`]]) dl.append(el('dt', null, k), el('dd', null, v));
    box.append(dl);
  } else if (g) {
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
  // the lineup: take it into the open battle, or leave it out (SLOTS in threat.js)
  if (!sandbox && !preview && career.unlocked(kind)) {
    const inIt = career.inLineup(kind), why = career.lineupBlock(kind);
    const lb = actBtn(inIt ? 'Leave out of battle' : 'Take into battle', `lineup:${kind}`, why, () => { career.toggleLineup(kind); onLineup?.(); });
    lb.classList.add('hg-lineup');
    box.append(lb);
  }
  // the test range: any battery, earned or not, with any upgrades, nothing paid
  const tr = rangeBtn(era, kind);
  tr.classList.add('hg-range');
  tr.title = 'Fire it on the test range: any target, any upgrades, nothing scored';
  box.append(tr);
  box.append(el('p', 'hg-state', sandbox ? 'Yours from the start: the WW1 German era is a sandbox.' : own ? `Researched${career.inLineup(kind) ? `: in your lineup for the open battle${isOffmap(kind) ? ', as off-map support' : ''}` : ', not in your lineup'}.`
    : career.dev ? `${career.inLineup(kind) ? 'In your lineup' : 'Not in your lineup'} by dev mode: your own career has not researched it${career.researchBlock(kind) ? ` (${career.researchBlock(kind)})` : ''}.` : `Not researched: ${career.researchBlock(kind)}.`));
  if (career.dev && !sandbox) box.append(el('p', 'rs-note', 'Dev mode is on: any battery can join the lineup, and on parade and in battle each is at its best. The modifications are your own career.'));
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
    b.classList.toggle('lineup', !sandbox && career.inLineup(k));
    b.setAttribute('aria-pressed', String(k === kind));
    if (n) b.append(el('span', 'hg-slot-tier', ROMAN[n.tier - 1]));
    if (!sandbox && career.inLineup(k)) { const m = el('span', 'hg-slot-in', 'In battle'); m.title = 'In the lineup: it takes the field in the open battle'; b.append(m); }
    const name = el('b', null, nameIn(k));
    if (WIP_KINDS.has(k)) name.append(wipBadge());
    b.append(name);
    if (own && !sandbox && maxGuns(k) > 1) b.append(pips(career.level(k, 'guns', false), maxGuns(k)));
    b.append(el('small', null, sandbox ? 'Yours' : own ? (isOffmap(k) ? 'Off-map support' : `${career.level(k, 'guns', false)} of ${maxGuns(k)} ${maxGuns(k) === 1 ? 'gun' : 'guns'}`)
      : career.targetOf(era) === k ? `Researching · ${Math.round(career.researchShare(k) * 100)}%` : why ? `After the ${nameOf(n.after)}` : `${num(n.cost)} RP`));
    b.addEventListener('click', () => onPick(k));
    return b;
  });
}

// The slot bar of a career: the lineup's SLOTS.map batteries on the map and SLOTS.support off it (threat.js), each
// slot with a swap that opens the bench (`swap`: the slot open, { off, out }), an empty slot opening it at once
function lineupSlots(career, era, kind, onPick, swap, onSwap) {
  const ks = career.lineupKinds(era), cells = [];
  for (const off of [false, true]) {
    const mine = ks.filter((k) => isOffmap(k) === off), n = off ? SLOTS.support : SLOTS.map;
    for (let i = 0; i < n; i++) {
      const k = mine[i] ?? null, cell = el('div', `hg-cell${off ? ' off' : ''}${off && i === 0 ? ' first-off' : ''}`);
      const open = !!swap && swap.off === off && swap.out === k;
      cell.classList.toggle('swapping', open);
      if (k) {
        const [card] = slotCards(career, era, kind, onPick, [k]);
        // (as it takes the field: its guns, dev mode's included, never its research)
        card.classList.remove('lineup', 'ready');
        card.classList.add('own');
        card.querySelector('.hg-slot-in')?.remove();
        card.querySelector('.rs-pips')?.remove();
        const g = career.level(k, 'guns'), m = maxGuns(k);
        if (!off && m > 1) card.querySelector('small').before(pips(g, m));
        card.querySelector('small').textContent = off ? 'Off-map support' : `${g} of ${m} ${m === 1 ? 'gun' : 'guns'}${career.owns(k) ? '' : ' · dev mode'}`;
        if (off) card.prepend(el('span', 'hg-slot-in', 'Off-map'));
        const sw = el('button', 'hg-swap', '⇄');
        sw.type = 'button';
        sw.dataset.act = `swap:${k}`;
        sw.title = `Swap the ${nameIn(k)} for another battery`;
        sw.setAttribute('aria-label', sw.title);
        sw.setAttribute('aria-expanded', String(open));
        sw.addEventListener('click', (e) => { e.stopPropagation(); onSwap(open ? null : { off, out: k }); });
        cell.append(card, sw);
      } else {
        const b = el('button', 'hg-slot empty');
        b.type = 'button';
        b.dataset.act = `fill:${off ? 'off' : 'map'}`;
        b.setAttribute('aria-expanded', String(open));
        b.append(el('b', null, 'Empty slot'), el('small', null, off ? 'Add off-map support' : 'Add a battery'));
        b.addEventListener('click', () => onSwap(open ? null : { off, out: null }));
        cell.append(b);
      }
      cells.push(cell);
    }
  }
  return cells;
}

// The bench above the slot bar: the batteries the career has that could take the slot, and leaving the slot empty
function benchCard(career, era, swap, onChoose, onLeave, onResearch, onClose) {
  const box = el('div', 'hg-bench');
  box.setAttribute('role', 'dialog');
  const head = el('div', 'hg-bench-h');
  head.append(el('span', null, swap.out ? `In place of the ${nameIn(swap.out)}` : swap.off ? 'Off-map support' : 'Into the empty slot'));
  const x = el('button', 'hg-bench-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', onClose);
  head.append(x);
  box.append(head);
  const bench = career.benchOf(era, swap.off);
  const list = el('div', 'hg-bench-list');
  for (const k of bench) {
    const n = nodeOf(k), b = el('button', 'hg-bench-row');
    b.type = 'button';
    b.dataset.act = `bench:${k}`;
    const name = el('b', null, nameIn(k));
    if (WIP_KINDS.has(k)) name.append(wipBadge());
    b.append(el('span', 'hg-slot-tier', ROMAN[n.tier - 1]), name,
      el('small', null, `${lineOf(k)?.name ?? ''}${swap.off ? '' : ` · ${career.level(k, 'guns')} of ${maxGuns(k)} ${maxGuns(k) === 1 ? 'gun' : 'guns'}`}${career.owns(k) ? '' : ' · dev mode'}`));
    b.addEventListener('click', () => onChoose(k));
    list.append(b);
  }
  if (!bench.length) {
    const p = el('p', 'hg-bench-none', `No other ${swap.off ? 'off-map weapon' : 'battery'} to take: research one first.`);
    const r = el('button', 'rs-act', 'Open the research tree');
    r.type = 'button';
    r.addEventListener('click', onResearch);
    list.append(p, r);
  }
  box.append(list);
  if (swap.out) {
    const why = career.lineupBlock(swap.out);
    box.append(actBtn(`Leave the ${nameIn(swap.out)} out`, `leave:${swap.out}`, why, onLeave));
  }
  return box;
}

export function mountMenu(root = document.getElementById('menu')) {
  const query = new URLSearchParams(location.search);
  let storage;
  try { storage = window.localStorage; } catch { /* a session-only career */ }
  const career = new Progression(storage);
  const memo = read(STORE, {});
  memo.sel ??= {};
  let items = [];
  // the nation: a game's way back (?mode=ww1|ww2) or the last one shown (only Germany for now)
  let era = SHOWN.find((n) => n.id === NATION_OF[query.get('mode') ?? ''])?.id ?? SHOWN.find((n) => n.id === memo.era)?.id ?? SHOWN[0].id;
  let tab = query.get('lessons') ? 'tutorials' : TABS.some(([t]) => t === memo.tab) ? memo.tab : 'battles';
  // ?view=research (the end card's Research button) opens that screen; otherwise the last one
  let view = VIEWS.some(([v]) => v === query.get('view')) ? query.get('view') : VIEWS.some(([v]) => v === memo.view) ? memo.view : 'hangar';
  let difficulty = DIFFICULTIES.includes(memo.difficulty) ? memo.difficulty : 'Normal';
  // the career battle's threat level (threat.js) and the seed its modifiers are rolled from (a new one after each battle)
  let level = Math.max(1, Math.min(MAX_LEVEL, memo.level | 0 || 1));
  memo.modSeed ??= (Math.random() * 1e9) | 0;
  const levelNow = () => (career.levelUnlocked(era, level) ? level : Math.max(1, ...THREAT.filter((t) => career.levelUnlocked(era, t.n)).map((t) => t.n)));
  const modsNow = () => rollModifiers(levelNow(), memo.modSeed);
  let sel = null, open = query.has('lessons') || query.has('campaign');

  root.innerHTML = `<header class="mn-top">
    <div class="mn-top-in">
      <b class="mn-mark">DRUMFIRE</b>
      <nav class="mn-eras" aria-label="Nation">${SHOWN.map((n) => `<button type="button" data-era="${n.id}">${n.name} <small>${n.sub}</small></button>`).join('')}</nav>
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
      <div class="mn-level" hidden>
        <div class="mn-lv-row" role="radiogroup" aria-label="Threat level">${THREAT.map((t) => `<button type="button" role="radio" data-lv="${t.n}">${t.n}</button>`).join('')}</div>
        <div class="mn-lv-card"></div>
      </div>
      <button type="button" class="mn-play2">To battle</button>
      <ul class="keys mn-keys">${KEYS}</ul>
    </div>
  </section>
  <main class="mn-hangar" data-for="hangar">
    <div class="hg-stage" aria-hidden="true"></div>
    <div class="hg-preview" hidden><span>Preview: the full battery</span><button type="button" class="rs-act" data-act="back-research">Back to research</button></div>
    <section class="hg-info" aria-label="Battery"></section>
    <aside class="hg-mods" aria-label="Modifications"></aside>
    <footer class="hg-bar"><div class="hg-slots" role="toolbar" aria-label="Batteries"></div><div class="mn-status"><span class="hg-count"></span><span class="mn-save"></span></div></footer>
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

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ view, era, sel: memo.sel, tab, difficulty, rs: memo.rs, level, modSeed: memo.modSeed })); } catch { /* private mode */ } };
  const playable = (i) => i && NATION_OF[i.era] === era && !i.locked;
  const firstOf = (t) => items.find((i) => i.tab === t && playable(i));
  const HELP = {
    battles: { de: 'The open battle of 1918 with your career\'s batteries (it pays research points, won or lost), the WW2 open battle as a sandbox, the special weapons\' own missions, the Big Bertha demo and the test range.', '1917': 'The open battle with the batteries you have researched. It pays research points, won or lost.', ww1: 'The open battle with the whole Gruppe from the start, nothing to earn; the Paris Gun\'s own mission; or crew the Big Bertha demo.', ww2: 'The open battle with the batteries you have researched (it pays research points, won or lost), or a special weapon\'s own operation (open to all).' },
    campaign: { ww1: 'No campaign in this era: the open battle is a sandbox and every battery is yours from the start.', other: 'One-off challenges, in any order: each loans you a battery for a set task, and the first win pays research points.' },
    tutorials: { ww1: 'No lessons of its own yet: the 1917 and WW2 lessons teach the same drill (lay from the board, range, fire for effect).', other: 'Short lessons on a quiet range, in daylight.' },
  };
  const RESEARCH_HELP = {
    ww1: 'Nothing to research in this era: every battery of the Gruppe is yours from the start.',
    other: 'Pick the battery to research: every battle\'s research points go to it. Each line is researched in order. A battery takes the field with one gun; its own points buy its other guns and better parts.',
  };
  const shown = () => shownIn(era, memo.rs?.[era]);
  // the battery in the hangar: the one chosen if it is in the lineup, else the lineup's first; or the one previewed
  let preview = null;
  const inHangar = () => { const ks = hangarKinds(career, era), k = shown(); return preview ?? (ks.includes(k) ? k : ks[0] ?? k); };
  const pick = (kind, to = view) => { (memo.rs ??= {})[era] = kind; view = to; preview = null; swap = null; save(); render(); };
  // the lineup slot whose bench is open ({ off, out }: off the map or on it, the battery in it or null), or null
  let swap = null;
  const setSwap = (s) => { swap = s; render(); };

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
      const t = career.targetOf(era);
      if (b.dataset.view === 'research') b.querySelector('.mn-view-n').textContent = TREES[era] ? (t ? `${Math.round(career.researchShare(t) * 100)}%` : 'done') : '';
    }
    for (const w of $$('[data-for]')) w.hidden = w.dataset.for !== view;
    for (const b of $$('[data-era]')) { b.classList.toggle('on', b.dataset.era === era); b.setAttribute('aria-pressed', String(b.dataset.era === era)); }
    $('.mn-mode-k').textContent = sel.kicker;
    $('.mn-mode-t').textContent = sel.title;
    $('.mn-mode-d').textContent = sel.level ? `Level ${levelNow()}` : sel.difficulty ? difficulty : '';
    for (const sw of $$('[data-switch]')) {
      const on = sw.dataset.switch === 'free' ? career.free : career.dev;
      sw.setAttribute('aria-pressed', String(on));
      sw.querySelector('.dev-state').textContent = on ? 'ON' : 'OFF';
    }
    for (const s of $$('.mn-save')) s.textContent = career.saved ? 'Saved in this browser' : 'Saving unavailable: progress is lost on leaving';
    document.title = era === 'de' ? 'Drumfire: German artillery' : 'Drumfire: heavy artillery, Ypres 1917';
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
    renderLevel();
    const ofEra = items.filter((i) => NATION_OF[i.era] === era), missions = CAMPAIGN.filter((m) => NATION_OF[m.era] === era);
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

  // the lineup's capabilities and recommended level (capability.js), worked out again only when the lineup changes
  const CAP_NAME = { soft: 'Soft targets', armour: 'Tank laagers', heavy: 'Their heavy batteries', deep: 'Deep targets', hard: 'Concrete' };
  const CAP_SAY = { ready: 'ready', slow: 'slow: only just, or not every time', no: 'out of its reach or beyond its shells' };
  let capKey = '', capMemo = null;
  const lineupCaps = () => {
    const lv = career.lineupLevels(era), key = JSON.stringify(lv);
    if (key !== capKey) { capKey = key; capMemo = { caps: capabilities(lv), rec: recommendedLevel(lv) }; }
    return capMemo;
  };

  // the threat level of a battle played at one: the ten levels (a locked one says what opens it) and the chosen one's
  // card: what its day holds, the lineup it fits, its pay and the modifiers rolled for it
  function renderLevel() {
    $('.mn-level').hidden = !sel.level;
    if (!sel.level) return;
    const n = levelNow(), t = threatOf(n);
    for (const b of $$('[data-lv]')) {
      const k = +b.dataset.lv, open = career.levelUnlocked(era, k);
      b.disabled = !open;
      b.title = open ? `Level ${k}: ${threatOf(k).name} (${threatOf(k).en})` : `Locked: play level ${k - 1} to its end to open it`;
      b.classList.toggle('on', k === n);
      b.setAttribute('aria-checked', String(k === n));
    }
    const card = $('.mn-lv-card');
    const head = el('div', 'mn-lv-head');
    head.append(el('small', null, `Level ${n} · ${t.en}`), el('h3', null, t.name));
    const pay = el('span', 'mn-lv-pay', t.pay > 1 ? `Pay +${Math.round((t.pay - 1) * 100)}%` : 'Pay ×1');
    head.append(pay);
    const list = el('ul', 'mn-lv-lines');
    for (const line of t.lines) list.append(el('li', null, line));
    const fits = el('p', 'mn-lv-fits');
    fits.append(el('b', null, 'Fits: '), t.fits, '.');
    // what the lineup can do against the kinds of target this level brings (capability.js), and the level it suits
    const { caps, rec } = lineupCaps();
    const can = el('ul', 'mn-lv-caps');
    for (const tier of t.sites) {
      const v = caps[tier] ?? 'no', li = el('li', `v-${v}`);
      li.append(el('b', null, CAP_NAME[tier] ?? tier), ` ${CAP_SAY[v]}`);
      can.append(li);
    }
    const recP = el('p', 'mn-lv-rec', rec >= n ? `Your lineup suits up to level ${rec}.` : `Your lineup suits level ${rec}: this one asks more than it has. What it cannot do goes to the neighbouring Gruppe, unpaid.`);
    recP.classList.toggle('over', rec < n);
    card.replaceChildren(head, el('p', 'mn-lv-sub', t.sub), list, fits, el('small', 'mn-lv-k', 'Your lineup'), can, recP);
    const mods = modsNow().map(modifierOf);
    if (mods.length) {
      const ml = el('ul', 'mn-lv-mods');
      for (const m of mods) { const li = el('li'); li.append(el('b', null, m.name), ` ${m.line}`); ml.append(li); }
      card.append(el('small', 'mn-lv-k', mods.length === 1 ? 'Modifier' : 'Modifiers'), ml);
    }
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
    hangar.show({ era: gunEraOf(kind), battery: parade(career, era, kind, !!preview) });
    $('.hg-preview').hidden = !preview;
    keepFocus($('.mn-hangar'), () => {
      $('.hg-info').replaceChildren(hangarInfo(career, era, kind, !!preview, render));
      $('.hg-mods').replaceChildren(hangarMods(career, era, kind, render, () => pick(kind, 'research'), (part) => hangar.lookAt(part)));
      $('.hg-slots').replaceChildren(...(TREES[era] ? lineupSlots(career, era, preview ? null : kind, (k) => pick(k), swap, setSwap) : slotCards(career, era, preview ? null : kind, (k) => pick(k), kindsOf(era))));
      const bench = $('.hg-bar > .hg-bench');
      if (swap && TREES[era]) {
        const card = benchCard(career, era, swap, (k) => { career.swapLineup(swap.out, k); pick(k); },
          () => { career.toggleLineup(swap.out); swap = null; render(); }, () => pick(inHangar(), 'research'), () => setSwap(null));
        bench ? bench.replaceWith(card) : $('.hg-bar').prepend(card);
      } else bench?.remove();
    });
    // the lineup's slots taken (threat.js SLOTS)
    const ks = TREES[era] ? career.lineupKinds(era) : [], off = ks.filter(isOffmap).length;
    $('.hg-count').textContent = TREES[era] ? `Lineup ${ks.length - off} of ${SLOTS.map} · off-map ${off} of ${SLOTS.support}` : '';
    $('.hg-slots .hg-slot.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    edges();
  }

  // the slot bar's fading ends while there is more of the lineup to scroll to on that side
  const slots = $('.hg-slots');
  const edges = () => {
    slots.classList.toggle('more-l', slots.scrollLeft > 2);
    slots.classList.toggle('more-r', slots.scrollLeft + slots.clientWidth < slots.scrollWidth - 2);
  };
  slots.addEventListener('scroll', edges, { passive: true });
  addEventListener('resize', edges);

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
    still(stillOf(kind) ? [stillOf(kind)] : stillsOf({ era }));
    keepFocus($('.rsv-body'), () => $('.rsv-body').replaceChildren(researchView(career, era, kind, (k) => pick(k), render, (k) => { (memo.rs ??= {})[era] = k; view = 'hangar'; preview = k; save(); render(); root.scrollTop = 0; })));
  }

  function render() {
    items = menuItems(career, read(LESSONS_KEY, {}));
    // the entries are built again (a lock may have opened): the selection is held by its key
    sel = items.find((i) => i.key === sel?.key && playable(i)) ?? items.find((i) => i.key === memo.sel[era] && playable(i)) ?? firstOf('battles');
    renderTop();
    if (!loaded) loading.querySelector('.ml-era').textContent = `${NATIONS.find((n) => n.id === era).name} · the batteries drawn up for inspection`;
    if (open) renderDrop();
    if (view === 'research') renderResearch(); else renderHangar();
    // the hangar is loaded behind the loading screen whichever screen opens first
    if (view === 'research' && !loaded) hangar.show({ era: gunEraOf(inHangar()), battery: parade(career, era, inHangar()) });
  }

  // (the test range opens with the battery shown in the hangar)
  const onMap = () => (isOffmap(inHangar()) ? hangarKinds(career, era).find((k) => !isOffmap(k)) ?? 'k17' : inHangar());
  const go = () => {
    if (!playable(sel)) return;
    const href = sel.key.startsWith('range:') ? rangeHref(era, onMap()) : hrefOf(sel, difficulty, query, { level: levelNow(), mods: modsNow() });
    // the next battle at a level rolls its modifiers afresh
    if (sel.level) { memo.modSeed = (Math.random() * 1e9) | 0; save(); }
    location.href = href;
  };

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
    swap = null;
    save();
    render();
    // the address remembers the era (a reload or a game's way back keeps it); nothing is loaded
    const url = new URL(location.href);
    url.searchParams.delete('mode'); // (the nation is remembered with the menu's choices)
    history.replaceState(null, '', url);
  });
  for (const b of $$('[data-tab]')) b.addEventListener('click', () => { tab = b.dataset.tab; save(); render(); });
  for (const b of $$('[data-d]')) b.addEventListener('click', () => { difficulty = b.dataset.d; save(); render(); });
  for (const b of $$('[data-lv]')) b.addEventListener('click', () => { level = +b.dataset.lv; save(); render(); });
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
  // and one outside the bench and the slot bar closes the bench
  addEventListener('pointerdown', (e) => { if (swap && !e.target.closest?.('.hg-bench, .hg-slots')) setSwap(null); });
  // Escape closes the chooser; in it Up and Down walk the list; Enter goes to battle; in the hangar Left and Right
  // walk the batteries
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) { setOpen(false); modeBtn.focus(); return; }
    if (e.code === 'Escape' && swap) { setSwap(null); return; }
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
  // (an entry in no list, the test range or the WW2 sandbox, selects nothing)
  if (asked && SHOWN.some((n) => n.id === NATION_OF[asked.era])) { era = NATION_OF[asked.era]; if (playable(asked) && TABS.some(([t]) => t === asked.tab)) { sel = asked; memo.sel[era] = asked.key; tab = asked.tab; } }
  render();
  setOpen(open);
  save();
  if (['sel', 'op', 'campaign', 'lessons', 'view'].some((k) => query.has(k))) {
    const url = new URL(location.href);
    for (const k of ['sel', 'op', 'campaign', 'lessons', 'view', 'mode']) url.searchParams.delete(k);
    history.replaceState(null, '', url);
  }
  document.body.classList.add('ready');
  // a battle left without its summary seen (the page closed during it): the summary now, once
  const last = loadSummary();
  if (last && !last.seen) {
    markSeen();
    const page = showSummary(last, { actions: [
      { label: 'Research', onClick: () => { page.close(); view = 'research'; preview = null; save(); render(); } },
      { label: 'Continue', primary: true, onClick: () => page.close() },
    ] });
  }
}

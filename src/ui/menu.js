import { Progression } from '../progression.js';
import { exportSave, importSave } from '../saves.js';
import { BATTERIES } from '../campaign-data.js';
import { TREES, LINES, PARTS, LEVELS, maxGuns, partEffect, nodeOf, eraOfKind, levelOf, modsOf, crewOf, detachmentOf, DETACHMENT, gunEraOf, isOffmap } from '../research.js';
import { menuItems, hrefOf, GUIDE, itemForQuery, DIFFICULTIES, LESSONS_KEY, NATIONS, NATION_OF, ROSTER_WW1, WIP_KINDS, WIP_LINE, STILLS, stillsOf, stillUrl, stillOf, TABS } from '../menuItems.js';
import { GUNS } from '../sim/tables.js';
import { rangeTable } from '../sim/shells.js';
import { createHangar } from './hangar.js';
import { OPS as OPS_WW1, RIDGE_MORE } from '../ww1/ops.js';
import { THREAT, MAX_LEVEL, threatOf, rollModifiers, modifierOf, SLOTS } from '../threat.js';
import { capabilities, recommendedLevel } from '../capability.js';
import { showSummary, loadSummary, markSeen } from './summary.js';
import { shouldInvite, showInvite } from './invite.js';
import './menu.css';

// The main menu, laid out as a tank game's garage: a top bar with the nation tabs (Germany: the 1918 and the WW2
// entries and one tree; Britain is hidden for now), the two screens (the Hangar: a battery's gun in 3D, its details, its
// modifications and the lineup's batteries along the bottom; Research: the tree in its lines) and the mission chooser
// with To battle beside it. Choosing a mission, a battery or a screen never reloads the
// page; To battle opens the mission's game page, which loads the world behind its own loading screen (ui/loading.js).
// Only the hangar's 3D view loads three.js (ui/hangar.js), the first time it shows a gun.
const STORE = 'drumfire.menu'; // { view, era (the nation), sel: { era: key }, tab, difficulty, rs: { era: kind }, level, guided: { key: bool } }: the viewer's last choices
const VIEWS = [['hangar', 'Hangar'], ['research', 'Research']];
const SHOWN = NATIONS.filter((n) => !n.hidden);
// the testing switches in the top bar's right corner: dev mode and unlimited points, and beside them the career reset
// (two clicks: the first arms it for 4 s)
const SWITCHES = '<div class="mn-switches"><div class="mn-sw-stack">'
  + '<button class="dev-unlock" data-switch="dev" type="button" aria-pressed="false" title="Dev mode puts every battery in the open battles, researched and fully upgraded, for testing; switch it off to play your own career. Saved in this browser."><span class="dev-light"></span>Dev mode <b class="dev-state">OFF</b></button>'
  + '<button class="dev-unlock" data-switch="free" type="button" aria-pressed="false" title="Unlimited points: research and modifications cost nothing (the tree order still holds), for testing. Saved in this browser."><span class="dev-light"></span>Unlimited points <b class="dev-state">OFF</b></button>'
  + '</div><button class="mn-reset" type="button" title="Reset the career: research, upgrades, points, battles and campaign wins back to a new career. The switches stay. Click twice to confirm.">Reset</button></div>';

// the save as a file, beside the "Saved in this browser" line (src/saves.js): kept by the player, it survives cleared
// browser data and a browser that will not store anything in itch.io's frame
const SAVE_FILE = '<span class="mn-files"><button type="button" class="mn-file" data-file="export" title="Download your career (research, upgrades, points, lessons, menu choices) as a small file. Keep it to carry the career to another browser or computer, or to get it back if this browser\'s data is cleared.">Export save</button>'
  + '<button type="button" class="mn-file" data-file="import" title="Load a career from a saved file. It replaces the career in this browser.">Import save</button></span>';

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
const RIDGE_ONLY = new Set(RIDGE_MORE.map((u) => u.kind));
const rangeHref = (era, kind) => {
  const p = new URLSearchParams(), e = gunEraOf(kind);
  // (the tree's batteries that only stand on the career's 1918 ridge, src/ww1/ops.js RIDGE_MORE: its range)
  if (e !== '1917') p.set('mode', RIDGE_ONLY.has(kind) ? 'ww1' : e);
  p.set('range', 1);
  p.set('kind', kind);
  const from = new URLSearchParams(location.search);
  for (const k of ['quality', 'hour', 'weather']) if (from.get(k)) p.set(k, from.get(k));
  return `index.html?${p}`;
};
// the off-map weapons with a special mission of their own are not on the range (one gun alone in its pit): their
// "Try it" opens the mission's guided first run (menuItems.js GUIDE) instead; the Gotha strike has none
const TRY_GUIDE = { paris: 'ww1:paris', v1: 'op:v1', v2: 'op:v2' };
const guideHref = (kind) => {
  const t = TRY_GUIDE[kind] && menuItems(null, {}).find((i) => i.key === `tutorial:${GUIDE[TRY_GUIDE[kind]]}`);
  return t ? hrefOf(t, null, new URLSearchParams(location.search)) : null;
};
const rangeBtn = (era, kind) => {
  const g = guideHref(kind);
  if (g) {
    const b = actBtn('Try it · guided run', `range:${kind}`, '', () => { location.href = g; });
    b.title = 'Its special mission\'s guided first run: a lesson, nothing scored';
    return b;
  }
  return actBtn('Try on the range', `range:${kind}`, isOffmap(kind) ? 'off-map support: it can only be called in an open battle' : '', () => { location.href = rangeHref(era, kind); });
};
// a progress bar (0 to 1)
const bar = (k) => { const b = el('span', 'rs-bar'), f = el('i'); f.style.width = `${Math.round(Math.min(1, k) * 100)}%`; b.append(f); return b; };
const lineOf = (kind) => LINES[eraOfKind(kind)]?.find((l) => l.id === nodeOf(kind)?.line);
// what a locked battery waits for (on the Research screen an arrow points from it)
const afterText = (career, kind) => `After the ${nameOf(career.blockerOf(kind))}`;
// The Research tree's arrows: an SVG over the grid (sized by CSS to the grid, never by its own drawing, which would
// hold the tree at an old width), drawn from where the nodes landed and again whenever the tree changes size. Down a line, bottom edge to top edge; across to the line beside it (a `via`), out of the side, along
// the gap between the columns and into the other side. `state(link)` gives its look: 'own' (both researched), 'open'
// (the next to research) or 'shut'.
const SVG = 'http://www.w3.org/2000/svg';
function treeArrows(box, nodes, links, state) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('rs-arrows');
  svg.setAttribute('aria-hidden', 'true');
  const draw = () => {
    const o = box.getBoundingClientRect();
    const head = ['shut', 'open', 'own'].map((k) => `<marker id="rs-head-${k}" class="${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z"/></marker>`).join('');
    const paths = links.map((l) => {
      const a = nodes[l.from]?.getBoundingClientRect(), b = nodes[l.to]?.getBoundingClientRect();
      if (!a || !b) return '';
      const ax = a.left - o.left, ay = a.top - o.top, bx = b.left - o.left, by = b.top - o.top;
      let d;
      if (Math.abs(ax - bx) < 2) d = `M${ax + a.width / 2} ${ay + a.height}V${by - 1}`;
      else {
        const right = bx > ax, x0 = right ? ax + a.width : ax, x1 = right ? bx - 1 : bx + b.width + 1, xm = (x0 + x1) / 2;
        const y0 = ay + a.height / 2, y1 = by + Math.min(b.height / 2, 18);
        d = `M${x0} ${y0}H${xm}V${y1}H${x1}`;
      }
      const k = state(l);
      return `<path class="${k}" d="${d}" marker-end="url(#rs-head-${k})"/>`;
    });
    // the lit paths last, so they lie over the dim ones
    const order = ['shut', 'open', 'own'];
    svg.innerHTML = `<defs>${head}</defs>` + paths.map((p, i) => [p, order.indexOf(state(links[i]))]).sort((p, q) => p[1] - q[1]).map((p) => p[0]).join('');
  };
  const ro = new ResizeObserver(() => { if (!box.isConnected) { ro.disconnect(); return; } draw(); });
  ro.observe(box);
  return svg;
}
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
  // the strip over the tree: what is being researched and how far it has got, and the one rule to know
  const head = el('div', 'rs-head');
  const purse = el('div', 'rs-purse'), what = el('div'), how = el('div', 'rs-purse-p');
  if (tgt) {
    const n = nodeOf(tgt);
    what.append(el('small', null, 'Researching'), el('b', null, nameOf(tgt)));
    how.append(bar(career.researchShare(tgt)), el('small', null, `${num(n.cost - career.costLeft(tgt))} of ${num(n.cost)} RP · ${career.battles[era]} ${career.battles[era] === 1 ? 'battle' : 'battles'} fought`));
  } else {
    what.append(el('small', null, 'Research'), el('b', null, 'Every battery researched'));
    how.append(el('small', null, `${num(career.rp[era])} RP to spare`));
  }
  purse.append(what, how);
  head.append(purse, el('p', 'rs-help', 'Every battle\'s research points go to the battery you are researching. Follow the arrows: each battery opens the next.'));
  if (career.dev) head.append(el('p', 'rs-note', 'Dev mode is on: every battery can join the lineup, at its best in battle.'));
  root.append(head);
  const side = el('div', 'rs-side');
  // the tree as War Thunder draws it: a column per line, a horizontal band per rank (I at the top), and an arrow from
  // each battery to the ones it opens (down its line, and across to the line beside it for a `via`)
  const lines = LINES[era], ranks = [...new Set(tree.map((n) => n.tier))].sort((a, b) => a - b);
  const rows = Object.fromEntries(ranks.map((t) => [t, Math.max(...lines.map((l) => tree.filter((q) => q.line === l.id && q.tier === t).length))]));
  const cols = el('div', 'rs-tree'), wrap = el('div', 'rs-tree-wrap');
  cols.style.setProperty('--lines', lines.length);
  let row = 2;
  const start = {};
  for (const t of ranks) {
    start[t] = row;
    const band = el('div', 'rs-band');
    band.style.gridRow = `${row} / span ${rows[t]}`;
    band.append(el('span', null, ROMAN[t - 1]));
    band.title = `Rank ${ROMAN[t - 1]}`;
    cols.append(band);
    row += rows[t];
  }
  const nodes = {};
  lines.forEach((line, c) => {
    const h = el('div', 'rs-line-n');
    h.style.gridColumn = c + 2;
    h.append(el('b', null, line.name), el('small', null, line.de ?? ''));
    cols.append(h);
    const seen = {};
    for (const n of tree.filter((q) => q.line === line.id)) {
      const own = career.owns(n.kind), why = career.researchBlock(n.kind), on = n.kind === tgt;
      const b = el('button', 'rs-node');
      b.type = 'button';
      b.dataset.act = `show:${n.kind}`;
      b.style.gridColumn = c + 2;
      b.style.gridRow = start[n.tier] + (seen[n.tier] = (seen[n.tier] ?? -1) + 1);
      b.classList.toggle('own', own);
      b.classList.toggle('ready', !own && !why);
      b.classList.toggle('target', on);
      b.classList.toggle('on', n.kind === kind);
      b.setAttribute('aria-pressed', String(n.kind === kind));
      b.classList.toggle('shut', !own && !!why);
      b.title = `Rank ${ROMAN[n.tier - 1]} · ${nameOf(n.kind)}${why && !own ? ` · ${afterText(career, n.kind)}` : ''}`;
      const name = el('b', null, nameOf(n.kind));
      if (WIP_KINDS.has(n.kind)) name.append(wipBadge());
      b.append(name);
      if (on) b.append(bar(career.researchShare(n.kind)));
      b.append(el('small', null, own ? (maxGuns(n.kind) > 1 ? `${career.level(n.kind, 'guns', false)} of ${maxGuns(n.kind)} guns` : 'Researched')
        : on ? `Researching · ${Math.round(career.researchShare(n.kind) * 100)}%` : `${num(n.cost)} RP`));
      b.addEventListener('click', () => onShow(n.kind));
      cols.append(b);
      nodes[n.kind] = b;
    }
  });
  const links = tree.flatMap((n) => [n.after, n.via].filter(Boolean).map((from) => ({ from, to: n.kind })));
  cols.append(treeArrows(cols, nodes, links, (l) => (career.owns(l.to) ? 'own' : career.owns(l.from) ? 'open' : 'shut')));
  wrap.append(cols);
  side.append(wrap);
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
  const chead = el('header', 'rs-card-head');
  const title = el('div');
  title.append(el('small', null, `Rank ${ROMAN[node.tier - 1]} · ${lineOf(kind)?.name ?? ''} · ${BATTERIES.find((b) => b.kind === kind)?.role ?? ''}`), el('h3', null, nameOf(kind)));
  const acts = el('div', 'rs-head-acts');
  acts.append(actBtn('Preview the full battery', `preview:${kind}`, '', () => onHangar(kind)), rangeBtn(era, kind));
  chead.append(title, acts);
  card.append(chead, career.owns(kind) ? modsBlock(career, kind, onChange) : researchBlock(career, kind, onChange));
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
  if (!guideHref(kind) && !isOffmap(kind)) tr.title = 'Fire it on the test range: any target, any upgrades, nothing scored';
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
      : career.targetOf(era) === k ? `Researching · ${Math.round(career.researchShare(k) * 100)}%` : why ? afterText(career, k) : `${num(n.cost)} RP`));
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
  let tab = query.get('lessons') ? 'training' : TABS.some(([t]) => t === memo.tab) ? memo.tab : 'battle';
  // ?view=research (the end card's Research button) opens that screen; otherwise the last one
  let view = VIEWS.some(([v]) => v === query.get('view')) ? query.get('view') : VIEWS.some(([v]) => v === memo.view) ? memo.view : 'hangar';
  let difficulty = DIFFICULTIES.includes(memo.difficulty) ? memo.difficulty : 'Normal';
  // the career battle's threat level (threat.js) and the seed its modifiers are rolled from (a new one after each battle)
  let level = Math.max(1, Math.min(MAX_LEVEL, memo.level | 0 || 1));
  memo.modSeed ??= (Math.random() * 1e9) | 0;
  const levelNow = () => (career.levelUnlocked(era, level) ? level : Math.max(1, ...THREAT.filter((t) => career.levelUnlocked(era, t.n)).map((t) => t.n)));
  const modsNow = () => rollModifiers(levelNow(), memo.modSeed);
  let sel = null, open = query.has('lessons');
  // a special mission played as its guided first run (its lesson, menuItems.js GUIDE) or straight: the player's last
  // choice for it, else guided until its lesson is done
  memo.guided ??= {};

  root.innerHTML = `<header class="mn-top">
    <div class="mn-top-in">
      <b class="mn-mark">DRUMFIRE</b>
      <nav class="mn-eras" aria-label="Nation">${SHOWN.map((n) => `<button type="button" data-era="${n.id}">${n.name} <small>${n.sub}</small></button>`).join('')}</nav>
      <nav class="mn-views" aria-label="Screens">${VIEWS.map(([v, name]) => `<button type="button" data-view="${v}">${name}<span class="mn-view-n"></span></button>`).join('')}</nav>
      <div class="mn-go">
        <button type="button" class="mn-mode" aria-haspopup="dialog" aria-expanded="false" title="Choose what to play: the open battle and its threat level, a special mission, or the training"><small class="mn-mode-k"></small><b class="mn-mode-t"></b><span class="mn-mode-d"></span><i class="mn-dot" hidden></i></button>
        <button type="button" id="mn-play">To battle</button>
      </div>
      ${SWITCHES}
    </div>
  </header>
  <section class="mn-drop" role="dialog" aria-label="Choose what to play" hidden>
    <button type="button" class="mn-drop-close" aria-label="Close">\u2715</button>
    <nav class="mn-tabs" aria-label="What to play">${TABS.map(([t, name]) => `<button type="button" data-tab="${t}">${name} <span class="mn-count"></span></button>`).join('')}</nav>
    <div class="mn-body" aria-live="polite"></div>
    <div class="mn-drop-foot">
      <div class="mn-run" role="radiogroup" aria-label="How to play it" hidden><button type="button" role="radio" data-run="guided"><b>Guided first run</b><small></small></button><button type="button" role="radio" data-run="mission"><b>The mission</b><small>On your own</small></button></div>
      <div class="mn-difficulty" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `<button type="button" role="radio" data-d="${d}">${d}</button>`).join('')}</div>
      <button type="button" class="mn-play2">To battle</button>
    </div>
  </section>
  <main class="mn-hangar" data-for="hangar">
    <div class="hg-stage" aria-hidden="true"></div>
    <div class="hg-preview" hidden><span>Preview: the full battery</span><button type="button" class="rs-act" data-act="back-research">Back to research</button></div>
    <section class="hg-info" aria-label="Battery"></section>
    <aside class="hg-mods" aria-label="Modifications"></aside>
    <footer class="hg-bar"><div class="hg-slots" role="toolbar" aria-label="Batteries"></div><div class="mn-status"><span class="hg-count"></span><span class="mn-save"></span>${SAVE_FILE}</div></footer>
  </main>
  <div class="mn-rsv" data-for="research" hidden>
    <p class="rsv-help"></p>
    <div class="rsv-body"></div>
    <ul class="mn-roster" hidden></ul>
    <footer class="mn-foot"><span class="mn-save"></span>${SAVE_FILE}</footer>
  </div>
  <input type="file" class="mn-file-in" accept=".json,application/json" hidden>`;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => root.querySelectorAll(s);
  const body = $('.mn-body'), drop = $('.mn-drop'), modeBtn = $('.mn-mode');
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
    // until the lesson is finished or Stop reminding me: the invitation to the basic training (ui/invite.js), once the hangar stands; not over a
    // battle's summary
    setTimeout(() => { if (shouldInvite() && !document.querySelector('.sm-page')) showInvite(); }, 500);
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
  const RESEARCH_HELP = {
    ww1: 'Nothing to research in this era: every battery of the Gruppe is yours from the start.',
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
    memo.sel[`${era}:${item.tab}`] = item.key; // (each list's last choice, for coming back to it)
    save();
    render();
    if (focus) body.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.focus();
  }
  // another list: its last choice (else its first entry) is chosen unless the choice is already in it, so To battle
  // always plays what the open list shows
  const toTab = (t) => {
    tab = t;
    if (sel?.tab !== t) {
      const rows = items.filter((i) => i.tab === t && playable(i));
      const pick = rows.find((i) => i.key === memo.sel[`${era}:${t}`]) || rows[0];
      if (pick) { sel = pick; memo.sel[era] = pick.key; }
    }
    save();
  };
  // the open battle's list is its threat levels: a row picks the level (and the battle)
  const setLevel = (n, focus = false) => {
    level = n;
    const b = items.find((i) => i.tab === 'battle' && playable(i));
    if (b) select(b); else { save(); render(); }
    if (focus) body.querySelector(`[data-lv="${n}"]`)?.focus();
  };
  // a special mission's way to play: its guided first run (while its lesson is not done, unless the player chose) or
  // the mission itself
  const lessonOf = (i) => (i?.guide ? items.find((q) => q.key === `tutorial:${i.guide}`) : null);
  const guided = (i = sel) => !!lessonOf(i) && (memo.guided[i.key] ?? !lessonOf(i).done);
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
    root.classList.toggle('on-research', view === 'research');
    for (const b of $$('[data-era]')) { b.classList.toggle('on', b.dataset.era === era); b.setAttribute('aria-pressed', String(b.dataset.era === era)); }
    // the chooser's button: what To battle plays (marked until the basic training is done)
    const fresh = !items.find((i) => i.key === 'tutorial:training')?.done, dot = modeBtn.querySelector('.mn-dot');
    dot.hidden = !fresh;
    dot.title = 'New here? Start with the basic training (Training)';
    const lv = threatOf(levelNow());
    $('.mn-mode-k').textContent = sel.tab === 'battle' ? 'Open battle' : sel.tab === 'special' ? 'Special mission' : 'Training';
    $('.mn-mode-t').textContent = sel.level ? `Level ${lv.n} · ${lv.name}` : sel.title;
    $('.mn-mode-d').textContent = sel.level ? '' : guided() ? 'Guided first run' : sel.difficulty ? difficulty : '';
    // the go button says what it starts (the bar's and the chooser's)
    const goText = guided() ? 'Start the guided run' : sel.tab === 'training' ? 'Start the training' : 'To battle';
    for (const b of [$('#mn-play'), $('.mn-play2')]) b.textContent = goText;
    for (const sw of $$('[data-switch]')) {
      const on = sw.dataset.switch === 'free' ? career.free : career.dev;
      sw.setAttribute('aria-pressed', String(on));
      sw.querySelector('.dev-state').textContent = on ? 'ON' : 'OFF';
    }
    for (const s of $$('.mn-save')) s.textContent = career.saved ? 'Saved in this browser' : 'Saving unavailable: progress is lost on leaving';
    document.title = era === 'de' ? 'Drumfire: German artillery' : 'Drumfire: heavy artillery, Ypres 1917';
  }

  // The chooser (menu design kept to what a player takes in at a glance: a few chunks per view, short labels, the rest
  // on hover). Three tabs; the open battle's threat level picked from a row of ten steps (Helldivers 2's difficulty
  // bar) with the chosen level's name, four facts and its threats; the special missions as picture cards; the training
  // as one card. The foot: how to play a special mission, its difficulty, and the go button.
  const CAP_NAME = { soft: 'Soft targets', armour: 'Tank laagers', heavy: 'Their heavy batteries', deep: 'Deep targets', hard: 'Concrete', fort: 'Strongpoints (28 cm and up)' };
  const CAP_SAY = { ready: 'ready', slow: 'slow', no: 'out of reach' };
  const DAY = { morning: 'Morning', day: 'Until evening', night: 'Day and night', full: 'Full day' };
  // a special mission's or the training's line under its card (ten words or so)
  const TAGLINE = {
    'ww1:paris': 'Build the giant gun, then shell targets 120 km away.',
    'op:sevastopol': 'Lay the 80 cm railway gun, then breach the fortress.',
    'op:karl': 'Drive the siege mortar into place and break the citadel.',
    'op:v1': 'Ready the catapult and launch the flying bombs.',
    'op:v2': 'Erect, fuel and launch the A4 rocket.',
    'tutorial:training': 'The console, then a gun served in person. Start here.',
  };
  let capKey = '', capMemo = null;
  const lineupCaps = () => {
    const lv = career.lineupLevels(era), key = JSON.stringify(lv);
    if (key !== capKey) { capKey = key; capMemo = { caps: capabilities(lv), rec: recommendedLevel(lv) }; }
    return capMemo;
  };
  const chip = (text, cls = '', title = '') => { const c = el('span', `mn-chip${cls ? ` ${cls}` : ''}`, text); if (title) c.title = title; return c; };

  function renderDrop() {
    const lesson = guided() ? lessonOf(sel) : null, les = lessonOf(sel);
    const ofEra = items.filter((i) => NATION_OF[i.era] === era && playable(i));
    const specials = ofEra.filter((i) => i.tab === 'special'), training = ofEra.find((i) => i.key === 'tutorial:training');
    const counts = { battle: `level ${levelNow()}`, special: `${specials.filter((i) => i.done).length} of ${specials.length} won`, training: training?.done ? 'done' : 'start here' };
    for (const b of $$('[data-tab]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
      b.querySelector('.mn-count').textContent = counts[b.dataset.tab] ?? '';
    }
    // the foot
    const run = $('.mn-run');
    run.hidden = !les;
    if (les) {
      run.querySelector('[data-run="guided"] small').textContent = `${les.side} · nothing scored${les.done ? ' · done' : ''}`;
      for (const b of run.querySelectorAll('[data-run]')) { const on = (b.dataset.run === 'guided') === guided(); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    }
    $('.mn-difficulty').hidden = !sel.difficulty || !!lesson;
    for (const b of $$('[data-d]')) { b.classList.toggle('on', b.dataset.d === difficulty); b.setAttribute('aria-checked', String(b.dataset.d === difficulty)); }
    if (tab === 'battle') return renderLevel();
    // the special missions and the training: picture cards, the chosen one's line under them
    const cards = el('div', `mn-cards${tab === 'training' ? ' one' : ''}`);
    for (const i of ofEra.filter((q) => q.tab === tab)) {
      const c = el('button', 'mn-card');
      c.type = 'button';
      c.dataset.key = i.key;
      c.setAttribute('aria-pressed', String(i === sel));
      c.classList.toggle('on', i === sel);
      const pic = el('span', 'mn-card-pic');
      const st = i.still ?? stillOf(i.kind);
      if (st) pic.style.backgroundImage = `url("${stillUrl(st)}")`;
      const name = el('b', null, i.title);
      if (i.wip) name.append(wipBadge());
      const note = i.tab === 'training' ? (i.done ? '✓ Done' : i.side) : i.done ? '✓ Won' : `+${num(specialRP(i))} RP on first win`;
      c.append(pic, name, el('small', i.done ? 'won' : null, note));
      c.addEventListener('click', () => select(i));
      c.addEventListener('dblclick', () => { select(i); go(); });
      cards.append(c);
    }
    const head = el('div', 'mn-pick');
    if (tab !== 'training') head.append(el('h3', null, sel.title)); // (the training's one card already names it)
    head.append(el('p', null, TAGLINE[sel.key] ?? sel.sub));
    head.title = sel.blurb;
    body.replaceChildren(cards, head);
  }
  // a special mission's first-win RP (from its line in menuItems.js, which says it in words)
  const specialRP = (i) => +(/\+([\d,]+)/.exec(i.lines.find((l) => l.startsWith('First win')) ?? '')?.[1]?.replace(/,/g, '') ?? 0);

  // the threat level: ten steps, the chosen one and those under it lit, the lineup's own marked; the chosen level's
  // name and line, four facts, the threats it brings, the lineup's fit and the modifiers rolled
  function renderLevel() {
    const n = levelNow(), t = threatOf(n), { caps, rec } = lineupCaps();
    const meter = el('div', 'lv-meter');
    meter.setAttribute('role', 'radiogroup');
    meter.setAttribute('aria-label', 'Threat level');
    for (const q of THREAT) {
      const open1 = career.levelUnlocked(era, q.n);
      const b = el('button', `lv-seg${q.n <= n ? ' lit' : ''}${q.n === n ? ' on' : ''}${q.n === rec ? ' rec' : ''}`);
      b.type = 'button';
      b.dataset.lv = q.n;
      b.style.setProperty('--k', String((q.n - 1) / 9));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(q.n === n));
      b.disabled = !open1;
      b.title = open1 ? `Level ${q.n}: ${q.name} (${q.en})` : `Locked: play level ${q.n - 1} to its end`;
      b.append(el('b', null, String(q.n)));
      if (q.n === rec) b.append(el('small', null, 'your lineup'));
      b.addEventListener('click', () => setLevel(q.n));
      b.addEventListener('dblclick', () => { setLevel(q.n); go(); });
      meter.append(b);
    }
    const head = el('div', 'lv-head');
    head.append(el('small', null, `Level ${n} · ${t.en}`), el('h3', null, t.name), el('p', null, t.sub));
    head.title = t.lines.join('\n');
    const fact = (k, v) => { const f = el('div', 'lv-fact'); f.append(el('small', null, k), el('b', null, v)); return f; };
    const facts = el('div', 'lv-facts');
    facts.append(fact('Length', DAY[t.day] ?? t.day), fact('Goal', t.need ? `${t.need} fire mission${t.need > 1 ? 's' : ''}` : 'Win at X-Zeit'),
      fact('Attacks', t.attacks ? String(t.attacks) : 'None'), fact('Pay', `×${t.pay}`));
    const threats = el('div', 'lv-chips');
    if (t.cb >= 0.5) threats.append(chip(t.cb >= 0.7 ? 'Counter-battery' : 'Some counter-battery'));
    if (t.spotters || t.raids) threats.append(chip(t.raids ? 'Air raids' : 'Spotter aircraft'));
    if (t.heavies) threats.append(chip('Heavy guns'));
    if (t.tanks) threats.append(chip('Tanks'));
    if (t.forts) threats.append(chip(`${t.forts} strongpoints`, '', 'Concrete in the lanes of our assault: only 28 cm shells and heavier break it'));
    for (const m of modsNow().map(modifierOf)) threats.append(chip(m.name, 'mod', m.line));
    if (!threats.children.length) threats.append(chip('Little to fear', 'calm'));
    const fit = el('p', `lv-fit${rec < n ? ' over' : ''}`, rec >= n ? '✓ Your lineup is ready for this level' : `Above your lineup: it suits level ${rec}`);
    fit.title = `Your lineup against this level's targets: ${t.sites.map((k) => `${CAP_NAME[k] ?? k} ${CAP_SAY[caps[k] ?? 'no']}`).join('; ')}. Fits: ${t.fits}.${rec < n ? ' What it cannot do goes to the neighbouring Gruppe, unpaid.' : ''}`;
    body.replaceChildren(meter, head, facts, threats, fit);
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
    // the chosen slot into view along the bar, sideways only (scrollIntoView also scrolled the page past the top bar on a phone)
    const slotOn = $('.hg-slots .hg-slot.on'), slotBar = $('.hg-slots');
    if (slotOn && slotBar) {
      const a = slotOn.getBoundingClientRect(), b = slotBar.getBoundingClientRect();
      if (a.left < b.left) slotBar.scrollLeft += a.left - b.left;
      else if (a.right > b.right) slotBar.scrollLeft += a.right - b.right;
    }
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
    $('.rsv-help').textContent = sandbox ? RESEARCH_HELP.ww1 : '';
    $('.rsv-help').hidden = !sandbox;
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
    sel = items.find((i) => i.key === sel?.key && playable(i)) ?? items.find((i) => i.key === memo.sel[era] && playable(i) && TABS.some(([t]) => t === i.tab)) ?? firstOf('battle');
    renderTop();
    if (!loaded) loading.querySelector('.ml-era').textContent = `${NATIONS.find((n) => n.id === era).name} · the batteries drawn up for inspection`;
    if (open) renderDrop();
    if (view === 'research') renderResearch(); else renderHangar();
    // the hangar is loaded behind the loading screen whichever screen opens first
    if (view === 'research' && !loaded) hangar.show({ era: gunEraOf(inHangar()), battery: parade(career, era, inHangar()) });
  }

  // (the test range opens with the battery shown in the hangar)
  const onMap = () => (isOffmap(inHangar()) ? hangarKinds(career, era).find((k) => !isOffmap(k)) ?? 'rk92' : inHangar());
  const go = () => {
    if (!playable(sel)) return;
    const lesson = guided() ? lessonOf(sel) : null;
    const href = sel.key.startsWith('range:') ? rangeHref(era, onMap()) : lesson ? hrefOf(lesson, difficulty, query) : hrefOf(sel, difficulty, query, { level: levelNow(), mods: modsNow() });
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
  for (const b of $$('[data-tab]')) b.addEventListener('click', () => { toTab(b.dataset.tab); render(); });
  for (const b of $$('[data-run]')) b.addEventListener('click', () => { if (lessonOf(sel)) { memo.guided[sel.key] = b.dataset.run === 'guided'; save(); render(); } });
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
  // the save file: Export downloads it; Import reads one back and reloads the page, so everything reads it afresh
  const saveNote = (t) => { for (const s of $$('.mn-save')) s.textContent = t; clearTimeout(saveNote.t); saveNote.t = setTimeout(render, 4000); };
  const fileIn = $('.mn-file-in');
  for (const b of $$('[data-file]')) b.addEventListener('click', () => {
    if (b.dataset.file === 'import') { fileIn.value = ''; fileIn.click(); return; }
    saveNote(exportSave() ? 'Save file downloaded' : 'Nothing saved yet to export');
  });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    const why = await importSave(f);
    if (why) { saveNote(`Import failed: ${why}`); return; }
    saveNote('Save loaded');
    location.reload();
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
    if (!open || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    const fwd = e.code === 'ArrowDown' || e.code === 'ArrowRight';
    if (tab === 'battle') {
      const open1 = THREAT.filter((t) => career.levelUnlocked(era, t.n)).map((t) => t.n), k = open1.indexOf(levelNow());
      e.preventDefault();
      setLevel(open1[Math.max(0, Math.min(open1.length - 1, k + (fwd ? 1 : -1)))], true);
      return;
    }
    const rows = items.filter((i) => NATION_OF[i.era] === era && i.tab === tab && playable(i));
    if (!rows.length) return;
    e.preventDefault();
    const k = rows.indexOf(sel);
    select(rows[k < 0 ? 0 : (k + (fwd ? 1 : rows.length - 1)) % rows.length], true);
  });

  // a way back from a game (?sel=) or an old address (?op=, ?campaign=) selects its entry
  items = menuItems(career, read(LESSONS_KEY, {}));
  let asked = query.get('sel') ? items.find((i) => i.key === query.get('sel')) : query.get('op') ? itemForQuery(query, items) : null;
  // (back from a guided first run: its special mission)
  if (asked?.guideFor) asked = items.find((i) => i.key === asked.guideFor) ?? asked;
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

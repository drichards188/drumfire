import { Progression } from '../progression.js';
import { CAMPAIGN, rosterFor } from '../campaign-data.js';
import { menuItems, hrefOf, itemForQuery, DIFFICULTIES, LESSONS_KEY, ERAS, ROSTER_WW1, WIP_KINDS, WIP_LINE, stillsOf, stillUrl } from '../menuItems.js';
import './menu.css';

// The main menu: DOM only, nothing of the battlefield is built here. One entry is selected at a time (a battle, a
// campaign mission or a lesson, in either era); Play mission opens its game page, which loads the world behind its
// own loading screen (ui/loading.js). Switching era or tab never reloads the page.
const STORE = 'drumfire.menu'; // { era, sel: { era: key }, tab, difficulty }: the viewer's last choices
const TABS = [['battles', 'Battles'], ['campaign', 'Campaign'], ['tutorials', 'Tutorials'], ['batteries', 'Your batteries']];
const KEYS = '<li><kbd>1</kbd>-<kbd>9</kbd> select battery</li><li><kbd>Drag</kbd> orbit</li><li><kbd>Wheel</kbd> zoom</li><li><kbd>F</kbd> follow the shell to its burst</li><li><kbd>C</kbd> free camera</li><li><kbd>M</kbd> mute</li><li><kbd>[</kbd> <kbd>]</kbd> time compression</li><li><kbd>H</kbd> hide overlay</li><li><kbd>F3</kbd> stats</li>';

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// the mark of an entry still being built (menuItems.js WIP_KINDS)
const wipBadge = () => { const b = el('span', 'wip-badge', 'WIP'); b.title = WIP_LINE; return b; };

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
  let difficulty = DIFFICULTIES.includes(memo.difficulty) ? memo.difficulty : 'Normal';
  let sel = null;

  root.innerHTML = `<div class="mn-wrap">
    <section class="mn-left">
      <h1 class="mn-brand">DRUMFIRE</h1>
      <nav class="mn-eras" aria-label="Era"><button type="button" data-era="1917">1917 <small>British</small></button><button type="button" data-era="ww1">WW1 <small>German</small></button><button type="button" data-era="ww2">WW2 <small>German</small></button></nav>
      <div class="mn-detail" aria-live="polite"><small class="mn-kicker"></small><h2 class="mn-title"></h2><p class="mn-sub"></p><p class="mn-blurb"></p><ul class="mn-lines"></ul></div>
      <div class="mn-difficulty" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `<button type="button" role="radio" data-d="${d}">${d}</button>`).join('')}</div>
      <button type="button" id="mn-play">Play mission</button>
      <ul class="keys mn-keys">${KEYS}</ul>
    </section>
    <section class="mn-folio" aria-label="Missions">
      <header class="mn-head"><div><small>FIELD COMMAND</small><h2>Choose a mission</h2></div><span class="mn-total"></span></header>
      <nav class="mn-tabs" aria-label="Lists">${TABS.map(([t, name]) => `<button type="button" data-tab="${t}">${name} <span class="mn-count"></span></button>`).join('')}</nav>
      <p class="mn-help"></p>
      <div class="mn-list" role="listbox" aria-label="Missions"></div>
      <ul class="mn-roster" hidden></ul>
      <footer class="mn-foot"><span class="mn-save"></span><button id="dev-unlock" type="button" aria-pressed="false" title="Dev mode opens every battery and mission for testing; switch it off to return to your earned career. Saved in this browser."><span class="dev-light"></span>Dev mode <b class="dev-state">OFF</b></button></footer>
    </section>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const list = $('.mn-list'), play = $('#mn-play');
  const still = backdrop(root);

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ era, sel: memo.sel, tab, difficulty })); } catch { /* private mode */ } };
  const playable = (i) => i && i.era === era && !i.locked;
  const firstOf = (t) => items.find((i) => i.tab === t && playable(i));
  const HELP = {
    battles: { '1917': 'A battle with the batteries you have earned.', ww1: 'The open battle with the whole Gruppe from the start, nothing to earn; the Paris Gun\'s own mission; or crew the Big Bertha demo.', ww2: 'A battle with the batteries you have earned. Each other operation opens when the campaign earns its gun.' },
    campaign: { ww1: 'No campaign in this era: the open battle is a sandbox and every battery is yours from the start.', other: 'Each mission loans you a new battery: win it to keep it.' },
    tutorials: { ww1: 'No lessons of its own yet: the 1917 and WW2 lessons teach the same drill (lay from the board, range, fire for effect).', other: 'Short lessons on a quiet range, in daylight.' },
    batteries: { ww1: 'Every battery of the Gruppe is yours from the start.', other: 'Earn batteries in the campaign, then take them into battle.' },
  };

  function select(item, focus = false) {
    if (!playable(item)) return;
    sel = item;
    memo.sel[era] = item.key;
    save();
    render();
    if (focus) list.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.focus();
  }

  function render() {
    items = menuItems(career, read(LESSONS_KEY, {}));
    // the entries are built again (a lock may have opened): the selection is held by its key
    sel = items.find((i) => i.key === sel?.key && playable(i)) ?? items.find((i) => i.key === memo.sel[era] && playable(i)) ?? firstOf('battles');
    document.title = era === 'ww2' ? 'Drumfire WW2: German artillery' : era === 'ww1' ? 'Drumfire WW1: German heavy artillery, 1918' : 'Drumfire: heavy artillery, Ypres 1917';
    for (const b of root.querySelectorAll('[data-era]')) b.classList.toggle('on', b.dataset.era === era);
    // the selection, and its picture behind the menu
    still(stillsOf(sel));
    $('.mn-kicker').textContent = sel.kicker;
    $('.mn-title').textContent = sel.title;
    if (sel.wip) $('.mn-title').append(wipBadge());
    $('.mn-sub').textContent = sel.sub;
    $('.mn-blurb').textContent = sel.blurb;
    $('.mn-lines').replaceChildren(...sel.lines.map((t) => el('li', null, t)));
    $('.mn-difficulty').hidden = !sel.difficulty;
    for (const b of root.querySelectorAll('[data-d]')) { b.classList.toggle('on', b.dataset.d === difficulty); b.setAttribute('aria-checked', String(b.dataset.d === difficulty)); }
    // the tabs and the list of the open one
    // the WW1 era is a sandbox: its whole roster is the player's and it has no campaign
    const sandbox = era === 'ww1';
    const ofEra = items.filter((i) => i.era === era), roster = sandbox ? ROSTER_WW1 : rosterFor(era), missions = CAMPAIGN.filter((m) => m.era === era);
    const has = (b) => sandbox || career.unlocked(b.kind);
    const counts = {
      campaign: missions.length ? `${missions.filter((m) => career.completed.has(m.id)).length}/${missions.length}` : '',
      tutorials: `${ofEra.filter((i) => i.tab === 'tutorials' && i.done).length}/${ofEra.filter((i) => i.tab === 'tutorials').length}`,
      batteries: `${roster.filter(has).length}/${roster.length}`,
    };
    for (const b of root.querySelectorAll('[data-tab]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
      b.querySelector('.mn-count').textContent = counts[b.dataset.tab] ?? '';
    }
    $('.mn-total').textContent = sandbox ? 'Sandbox' : `${counts.campaign} missions`;
    $('.mn-help').textContent = HELP[tab][era] ?? HELP[tab].other;
    list.hidden = tab === 'batteries';
    $('.mn-roster').hidden = tab !== 'batteries';
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
    if (!list.hidden && !list.children.length) list.append(el('p', 'mn-empty', tab === 'campaign' ? 'No campaign missions in this era.' : 'Nothing here yet.'));
    $('.mn-roster').replaceChildren(...roster.map((b) => {
      const row = el('li');
      row.classList.toggle('available', has(b));
      const m = CAMPAIGN.find((q) => q.reward === b.kind && q.era === era);
      const bn = el('b', null, b.name);
      if (WIP_KINDS.has(b.kind)) bn.append(wipBadge());
      row.append(bn, el('small', null, sandbox ? 'Yours from the start' : career.unlocked(b.kind) ? (b.sandbox === false ? 'Earned: fires in its own operation' : 'Available in battle') : m ? `Earn in “${m.title}”` : 'Starting battery'));
      return row;
    }));
    const dev = $('#dev-unlock');
    dev.setAttribute('aria-pressed', String(career.dev));
    dev.querySelector('.dev-state').textContent = career.dev ? 'ON' : 'OFF';
    $('.mn-save').textContent = career.saved ? 'Saved in this browser' : 'Saving unavailable: progress is lost on leaving';
  }

  const go = () => { if (playable(sel)) location.href = hrefOf(sel, difficulty, query); };

  for (const b of root.querySelectorAll('[data-era]')) b.addEventListener('click', () => {
    if (b.dataset.era === era) return;
    era = b.dataset.era;
    sel = null;
    save();
    render();
    // the address remembers the era (a reload or a game's way back keeps it); nothing is loaded
    const url = new URL(location.href);
    if (era !== '1917') url.searchParams.set('mode', era); else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
  });
  for (const b of root.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { tab = b.dataset.tab; save(); render(); });
  for (const b of root.querySelectorAll('[data-d]')) b.addEventListener('click', () => { difficulty = b.dataset.d; save(); render(); });
  $('#dev-unlock').addEventListener('click', () => { career.setDev(!career.dev); render(); });
  play.addEventListener('click', go);
  // Up and Down walk the open list, Enter plays the selection
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); go(); return; }
    if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
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
  save();
  if (query.has('sel') || query.has('op') || query.has('campaign') || query.has('lessons')) {
    const url = new URL(location.href);
    for (const k of ['sel', 'op', 'campaign', 'lessons']) url.searchParams.delete(k);
    if (era !== '1917') url.searchParams.set('mode', era); else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
  }
  document.body.classList.add('ready');
}

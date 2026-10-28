import { Progression } from '../progression.js';
import { menuItems, itemForQuery, menuHref, DIFFICULTIES, WIP_LINE } from '../menuItems.js';
import { threatOf, parseModifiers, modifierOf } from '../threat.js';
import './menu.css';

// The game page's loading screen: the operation order for the entry being played (from the page's own URL), shown
// before main.js is even fetched and kept up while the world builds behind it; hud.setLoading fills its bar.
export function showLoading(q, root = document.getElementById('loading')) {
  let storage;
  try { storage = window.localStorage; } catch { /* a session-only career */ }
  const item = itemForQuery(q, menuItems(new Progression(storage)));
  const $ = (s) => root.querySelector(s);
  const diff = DIFFICULTIES.includes(q.get('difficulty')) ? q.get('difficulty') : 'Normal';
  $('.ld-kicker').textContent = item.kicker;
  // an entry played at a threat level: the level and its modifiers instead of a difficulty
  const lv = item.level ? threatOf(+q.get('level') || 1) : null, mods = item.level ? parseModifiers(q.get('mods')).map(modifierOf) : [];
  $('.ld-diff').textContent = lv ? `Level ${lv.n} · ${lv.name}` : item.difficulty ? diff : '';
  $('.ld-title').textContent = item.title;
  if (item.wip) { const b = document.createElement('span'); b.className = 'wip-badge'; b.textContent = 'WIP'; b.title = WIP_LINE; $('.ld-title').append(b); }
  $('.ld-sub').textContent = item.sub;
  $('.ld-blurb').textContent = item.blurb;
  const lines = lv ? [...item.lines, ...lv.lines, ...mods.map((m) => `Modifier: ${m.name}. ${m.line}`)] : item.lines;
  $('.ld-lines').replaceChildren(...lines.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  $('.ld-back').href = menuHref(q, item.key);
  document.title = `Drumfire: ${item.title}`;
  root.hidden = false;
  document.body.classList.add('loading');
  return item;
}

// the world is up and the battle started: the order fades and the page is the game's
export function hideLoading(root = document.getElementById('loading')) {
  document.body.classList.add('loaded');
  setTimeout(() => { root.hidden = true; document.body.classList.remove('loading', 'loaded'); }, 700);
}

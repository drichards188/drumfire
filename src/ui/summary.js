// The battle's summary page (War Thunder's battle results): shown when a career battle ends, when it is left early, and
// by the menu for a battle left without seeing it (the tab closed). Built from a plain record (main.js battleRecord):
//   { v, at, seen, title, sub, outcome ('victory' | 'defeat' | 'left'), level: { n, name, en } | null, mods: [names],
//     minutes, rp: { fought, time, win, total }, research: { target, from, to, researched: [names] }, opened: { n, name } | null,
//     batteries: [{ name, callsign, points, rounds, kills }], tally: { kill, part, men, mission, hit }, top: [{ act, what, who, pts }] }
// The record is kept in localStorage (SUMMARY_KEY) until seen. Plain DOM, no three.js.
import './summary.css';

export const SUMMARY_KEY = 'drumfire.lastBattle';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const num = (n) => Math.round(n).toLocaleString('en-US');
const OUTCOME = { victory: 'Victory', defeat: 'Defeat', left: 'Left the battle' };

export function saveSummary(rec) {
  try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(rec)); } catch { /* private mode: the page shows it anyway */ }
}
export function loadSummary() {
  try { const r = JSON.parse(localStorage.getItem(SUMMARY_KEY)); return r?.v === 1 ? r : null; } catch { return null; }
}
export function markSeen() {
  const r = loadSummary();
  if (r && !r.seen) saveSummary({ ...r, seen: true });
}

// the page over `root`; `actions`: [{ label, onClick, primary }] (the menu, Research, fight again); returns { close }
export function showSummary(rec, { root = document.body, actions = [] } = {}) {
  const page = el('div', `sm-page sm-${rec.outcome}`);
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-label', 'Battle summary');
  const sheet = el('div', 'sm-sheet');
  // the head: how it ended, the battle, the level, how long
  const head = el('header', 'sm-head');
  head.append(el('small', 'sm-kicker', ['Battle summary', rec.level ? `Level ${rec.level.n} · ${rec.level.name}` : null, `${num(rec.minutes)} min`].filter(Boolean).join(' · ')),
    el('h1', 'sm-outcome', OUTCOME[rec.outcome] ?? rec.outcome), el('p', 'sm-title', rec.title));
  if (rec.sub) head.append(el('p', 'sm-sub', rec.sub));
  if (rec.mods?.length) head.append(el('p', 'sm-mods', `Modifiers: ${rec.mods.join(', ')}`));
  // the rewards: the research points and what they bought, each battery's points
  const left = el('section', 'sm-col');
  left.append(el('h2', null, 'Rewards'));
  const big = el('p', 'sm-big');
  big.append(el('b', null, `+${num(rec.rp.total)}`), ' research points');
  const rows = el('dl', 'sm-rows');
  for (const [k, v] of [['Kills, damage and missions', rec.rp.fought], ['Time in action', rec.rp.time], ['Victory', rec.rp.win]]) {
    if (!v && k === 'Victory') continue;
    rows.append(el('dt', null, k), el('dd', null, `+${num(v)}`));
  }
  left.append(big, rows);
  if (rec.outcome === 'left') left.append(el('p', 'sm-note', 'You left early: everything earned until then is yours. The victory bonus is paid only for a battle won.'));
  if (rec.research) {
    const r = rec.research, box = el('div', 'sm-research');
    if (r.target) {
      box.append(el('small', null, 'Researching'), el('b', null, r.target));
      const bar = el('span', 'sm-bar'), was = el('i', 'was'), now = el('i', 'now');
      was.style.width = `${Math.round(Math.min(1, r.from) * 100)}%`;
      now.style.width = `${Math.round(Math.min(1, r.to) * 100)}%`;
      bar.append(now, was);
      box.append(bar, el('small', null, `${Math.round(r.from * 100)}% to ${Math.round(r.to * 100)}%`));
    }
    if (r.researched?.length) box.append(el('p', 'sm-new', `Researched: ${r.researched.join(', ')}`));
    left.append(box);
  }
  if (rec.opened) left.append(el('p', 'sm-new', `Level ${rec.opened.n} is open: ${rec.opened.name}`));
  if (rec.batteries?.length) {
    left.append(el('h3', null, 'Battery points'));
    const t = el('table', 'sm-bats');
    const hr = el('tr');
    for (const h of ['Battery', 'Rounds', 'Kills', 'Points']) hr.append(el('th', null, h));
    t.append(hr);
    for (const b of rec.batteries) {
      const tr = el('tr');
      const name = el('td');
      name.append(el('b', null, b.callsign ?? ''), ` ${b.name}`);
      tr.append(name, el('td', null, num(b.rounds ?? 0)), el('td', null, num(b.kills ?? 0)), el('td', 'pts', `+${num(b.points)}`));
      t.append(tr);
    }
    left.append(t);
  }
  // the actions: the counts, then the biggest of them
  const right = el('section', 'sm-col');
  right.append(el('h2', null, 'Actions'));
  const tally = el('div', 'sm-tally');
  for (const [k, label] of [['kill', 'Destroyed'], ['part', 'Knocked out'], ['men', 'Enemy casualties'], ['mission', 'Missions done']]) {
    const c = el('div');
    c.append(el('b', null, num(rec.tally?.[k] ?? 0)), el('small', null, label));
    tally.append(c);
  }
  right.append(tally);
  if (rec.top?.length) {
    const list = el('ol', 'sm-top');
    for (const a of rec.top) {
      const li = el('li', `sm-a-${a.kind ?? 'kill'}`);
      li.append(el('small', null, a.act), el('span', null, a.what), el('i', null, a.who ?? ''), el('em', null, `+${num(a.pts)}`));
      list.append(li);
    }
    right.append(list);
  } else right.append(el('p', 'sm-note', 'Nothing destroyed this time.'));
  if (rec.tally?.hit) right.append(el('p', 'sm-note', `Hits that did not kill earned ${num(rec.tally.hit)} more.`));
  const body = el('div', 'sm-body');
  body.append(left, right);
  const foot = el('footer', 'sm-foot');
  for (const a of actions) {
    const b = el('button', a.primary ? 'sm-btn primary' : 'sm-btn', a.label);
    b.type = 'button';
    b.addEventListener('click', a.onClick);
    foot.append(b);
  }
  sheet.append(head, body, foot);
  page.append(sheet);
  root.append(page);
  foot.querySelector('.primary')?.focus();
  return { close: () => page.remove(), el: page };
}

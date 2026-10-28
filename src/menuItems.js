import { OPS, OP_IDS } from './ww2/ops.js';
import { BATTERIES, CAMPAIGN, rosterFor } from './campaign-data.js';
import { TUTORIALS } from './tutorial.js';
import { WW2_TUTORIALS } from './ww2/tutorial.js';
import { OPS as OPS_WW1 } from './ww1/ops.js';
import { maxGuns, missionBonus, TREES, isOffmap } from './research.js';

// The menu's entries and the game pages they open (plain data, Node-safe). The menu (ui/menu.js) builds none of
// the battlefield: a game page is a URL with play, tutorial, sandbox or range (src/boot.js), and its loading screen
// (ui/loading.js) is described from that same URL. Keys: battle:ypres, op:<id>, ww1:<id>, bertha:ww1 (the Big Bertha demo, in the WW1 German era only), range:<era> (the test range),
// campaign:<id>, tutorial:<id>. Eras: '1917' (British), 'ww1' (German, 1918: a sandbox era, every battery from the
// start, no campaign), 'ww2' (German).
export const ERAS = ['1917', 'ww1', 'ww2'];
// The menu's nations (its top tabs): Germany holds the 1918 and the WW2 entries and the one German tree; Britain (the
// 1917 game) is hidden for now, its entries and tree kept for when it comes back
export const NATIONS = [{ id: 'de', name: 'Germany', sub: 'WW1 · WW2', eras: ['ww1', 'ww2'] }, { id: '1917', name: 'Britain', sub: '1917', eras: ['1917'], hidden: true }];
export const NATION_OF = { '1917': '1917', ww1: 'de', ww2: 'de' };
// the era a game or menu URL belongs to (?mode=ww1 | ww2; anything else is the British game)
export const eraOf = (q) => (q.get('mode') === 'ww1' || q.get('mode') === 'ww2' ? q.get('mode') : '1917');
// the WW1 German era's roster (the open battle's and the Paris Gun's): every battery is the player's from the start
export const ROSTER_WW1 = Object.values(OPS_WW1).flatMap((op) => op.units).map((u) => ({ kind: u.kind, name: u.name, role: u.role }));
export const isGame = (q) => ['play', 'tutorial', 'sandbox', 'range'].some((k) => q.has(k));
// Still being built (the user's call): the Paris Gun and the Gustav, wherever they are the entry's gun, and the Big
// Bertha demo. Their entries carry `wip` (the menu and the loading screen badge them) and lead with WIP_LINE; main
// badges the unit's name in the game (hud.setUnit).
export const WIP_KINDS = new Set(['paris', 'gustav']);
export const WIP_LINE = 'Work in progress: still being built, so expect rough edges and changes.';
const wip = (item, on = true) => (on ? { ...item, wip: true, lines: [WIP_LINE, ...item.lines] } : item);
// The menu's background stills (public/menu/<id>.jpg, captured from the game by tools/menushots.mjs: a gun of each kind
// firing). An entry shows its own (`still`: its operation's gun, the battery its campaign mission earns, its lesson's
// weapon); one without shows its era's in turn (ERA_STILLS).
export const STILLS = new Set(['bl15', 'bl92', 'bl6', 'bl60', 'rail', 'max38', 'gamma', 'm16', 'sfh13', 'k17', 'paris', 'bertha-demo',
  'lefh18', 'sfh18', 'k18', 'mrs18', 'nbw41', 'gustav', 'karl', 'v1', 'v2']);
export const ERA_STILLS = { '1917': ['bl15', 'rail', 'bl92', 'bl60', 'bl6'], ww1: ['max38', 'paris', 'gamma', 'm16'], ww2: ['gustav', 'nbw41', 'v2', 'karl', 'k18'], de: ['max38', 'gustav', 'nbw41', 'paris', 'v2', 'k18'] };
// a battery's still (Bertha's is the demo's)
export const stillOf = (kind) => (kind === 'bertha' ? 'bertha-demo' : STILLS.has(kind) ? kind : null);
const stillFor = stillOf;
export const stillsOf = (item) => (item?.still ? [item.still] : ERA_STILLS[item?.era] ?? []);
export const stillUrl = (id) => `menu/${id}.jpg`; // (relative, as every link here: the build may live in a subfolder)
// the settings a menu URL hands on to the game it opens (in the game the gear menu sets them)
const PASS = ['quality', 'hour', 'weather'];
export const DIFFICULTIES = ['Easy', 'Normal', 'Hard'];
export const LESSONS_KEY = 'drumfire.tutorials';
const pad = (n) => String(n).padStart(2, '0');
const battery = (kind) => BATTERIES.find((b) => b.kind === kind);
const missionsOf = (era) => CAMPAIGN.filter((m) => m.era === era);
const numberOf = (m) => missionsOf(m.era).indexOf(m) + 1;
// the open battle's lineup: the batteries researched (all in dev mode), each with the guns it has earned (a tree:
// its batteries in their lines, the off-map support apart)
const earned = (career, era, ok = () => true) => {
  const all = (TREES[era] ? TREES[era].map((n) => battery(n.kind)).filter(Boolean) : rosterFor(era)).filter(ok);
  // (a tree with a lineup: the batteries chosen for battle, SLOTS in threat.js)
  const list = career?.lineupKinds && TREES[era] ? career.lineupKinds(era).map(battery).filter(Boolean) : all.filter((b) => !career || career.unlocked(b.kind));
  const guns = (b) => (career && maxGuns(b.kind) > 1 ? ` (${career.level(b.kind, 'guns')} of ${maxGuns(b.kind)} guns)` : '');
  const on = list.filter((b) => !isOffmap(b.kind)), off = list.filter((b) => isOffmap(b.kind));
  return `${TREES[era] ? 'Your lineup' : 'Your batteries'}: ${on.map((b) => b.name + guns(b)).join(', ')}${off.length ? `; off-map support: ${off.map((b) => b.name).join(', ')}` : ''}${TREES[era] ? ' (set in the hangar).' : list.length < all.length ? '. Research earns the rest.' : '.'}`;
};
const PAYS = 'Every kill pays as it happens: research points to the battery you are researching, and each battery its own points for its upgrades. Leaving early keeps them.';
// the career's open battle, whatever the lineup and the level (its batteries and the level's day are in its lines)
const CAREER_BLURB = 'The Gruppe on the ridge east of Ypres, firing west at the British: your lineup, up to five batteries and one weapon off the map, with the guns and parts they have earned. Lay the guns from the board, range on the observers\' calls, fire for effect and answer the red rockets. The threat level decides how long the day runs and what comes at you.';
const forceLine = (k) => {
  const b = battery(k);
  return `${b.name}: ${b.role}${b.fuze ? ` (${b.fuze} fuze, ${Math.round(b.damage * 100)}% effective target damage, ${b.rounds}+ ${b.rounds === 1 ? 'round' : 'rounds'})` : ' (bearing ±1°, range ±1%, no oxygen shortfall)'}.`;
};

// every entry, with its marks for this career (missions done, batteries earned) and the lessons done ({ id: true }); every
// mission, operation and lesson is open from the start, in any order (an entry's `locked` reason would grey it out)
export function menuItems(career = null, lessons = {}) {
  const items = [];
  items.push({
    key: 'battle:ypres', era: '1917', tab: 'battles', title: 'Ypres salient', side: 'Heavy Artillery Group',
    kicker: 'Battle · 1917 British', sub: 'Heavy artillery, Ypres salient, 1917',
    blurb: 'A Heavy Artillery Group in the mud before Passchendaele: a 15-inch howitzer, 9.2s, 6-inch howitzers, 60-pounders and an 18-inch railway gun. Lay the guns from the board, read the observers, walk the shells onto pillboxes, batteries and dumps, and hold the line when the counter-attack comes.',
    lines: [earned(career, '1917'), PAYS], query: { play: 1 }, difficulty: true, still: 'bl15',
  });
  // the career's open battle (the 1918 ridge: the German tree's lineup, any of its batteries), the Paris Gun's own
  // mission (as the WW2 V-weapons have theirs), and the Bertha demo
  for (const op of Object.values(OPS_WW1)) {
    const battle = op.kind === 'battle';
    items.push(wip({
      key: `ww1:${op.id}`, era: 'ww1', tab: 'battles', title: op.short, side: battle ? 'Your lineup' : op.units[0].name,
      kicker: battle ? 'Battle · your career' : 'Battle · WW1 German', sub: op.tag, blurb: battle ? CAREER_BLURB : op.blurb,
      lines: battle ? [earned(career, 'de'), PAYS] : [],
      // (the career's battle is played at a threat level, threat.js, instead of a difficulty)
      query: { mode: 'ww1', op: op.id, play: 1 }, difficulty: !battle, level: battle, still: battle ? 'max38' : stillFor(op.units[0].kind),
    }, !battle && WIP_KINDS.has(op.units[0].kind)));
  }
  for (const id of OP_IDS) {
    // the special weapons' operations are open from the start, with their whole roster (only the open battle's
    // batteries are earned)
    const op = OPS[id], b = battery(op.units[0].kind);
    items.push(wip({
      // (the WW2 open battle: every WW2 battery, nothing earned, until the difficulty levels bring the career here)
      key: `op:${id}`, era: 'ww2', tab: id === 'flanders' ? 'hidden' : 'battles', title: id === 'flanders' ? `${op.short}, WW2` : op.short, side: id === 'flanders' ? 'Sandbox: every WW2 battery' : b.name,
      kicker: 'Battle · WW2 German', sub: `German artillery, ${op.title}`, blurb: op.blurb,
      lines: id === 'flanders' ? ['A sandbox for now: every WW2 battery, nothing earned or paid. The career fights the open battle of 1918.'] : [], query: { mode: 'ww2', op: id, play: 1 }, difficulty: true,
      still: id === 'flanders' ? 'nbw41' : stillFor(op.units[0].kind),
    }, id !== 'flanders' && WIP_KINDS.has(op.units[0].kind)));
  }
  items.push(wip({
    key: 'bertha:ww1', era: 'ww1', tab: 'battles', title: 'Big Bertha', side: 'demo', kicker: 'Demo · first person',
    sub: 'A German 42 cm howitzer crew', blurb: 'Crew a German 42 cm howitzer in first person: command, traverse, elevate, load and fire, one station at a time.',
    lines: [], page: 'bertha.html', query: { play: 1 }, pass: ['quality'], still: 'bertha-demo',
  }));
  // the test fire range of each nation (src/ui/range.js): any battery, any target, nothing scored (the German one opens
  // on the map of the battery shown, menu.js rangeHref); in no list (tab 'hidden': the hangar's "Try on the range"
  // opens it), kept for the range page's own loading screen
  for (const era of ['1917', 'de']) {
    items.push({
      key: `range:${era}`, era: era === 'de' ? 'ww2' : era, tab: 'hidden', title: 'Test range', side: 'The hangar\'s battery', kicker: 'Range · nothing scored',
      sub: 'One gun and its upgrades on any target', still: null,
      blurb: 'A quiet range on the battle\'s own map, in daylight, with one gun of the battery shown in the hangar (earned or not) and nothing else: set its upgrades, lay on any target and fire it from the console or in person at the gun. Observed missions, hostile fire, an attack with its SOS and the traffic come when you ask for them. Nothing is scored or paid.',
      lines: ['The card on the left of the view has the gun\'s upgrades, the targets in reach and the debug switches. "Try on the range" on a battery\'s card opens it too.'], query: { ...(era === '1917' ? {} : { mode: 'ww2' }), range: 1 },
    });
  }
  for (const m of CAMPAIGN) {
    const n = numberOf(m), b = battery(m.reward), done = !!career?.completed.has(m.id);
    items.push(wip({
      key: `campaign:${m.id}`, era: m.era, tab: 'campaign', n: done ? '✓' : pad(n), done, title: m.title, side: b.name,
      kicker: `Campaign · mission ${pad(n)}`, sub: `A challenge for the ${b.name}`, blurb: m.briefing,
      lines: [`Loaned battery: ${b.name}. ${done ? 'Won: its research bonus is paid.' : `First win: +${missionBonus(m).toLocaleString('en-US')} research points.`}`, ...m.roster.map(forceLine)],
      query: { ...(m.era === 'ww2' ? { mode: 'ww2' } : {}), campaign: m.id, play: 1 }, difficulty: true, still: stillFor(m.reward),
    }, WIP_KINDS.has(m.reward)));
  }
  for (const [era, defs] of [['1917', TUTORIALS], ['ww2', WW2_TUTORIALS]]) defs.forEach((d, i) => {
    const done = !!lessons[d.id];
    items.push(wip({
      key: `tutorial:${d.id}`, era, tab: 'tutorials', n: done ? '✓' : pad(i + 1), done, title: d.name, side: `${d.steps.length} steps`,
      kicker: `Tutorial · ${d.steps.length} steps`, sub: 'A quiet range in daylight. Nothing is scored and nothing is lost.', blurb: d.blurb,
      lines: [], query: era === 'ww2' ? { mode: 'ww2', op: d.op, tutorial: d.id } : { tutorial: d.id },
      still: era !== 'ww2' ? null : d.id === 'w-werfer' ? 'nbw41' : d.op === 'flanders' ? 'lefh18' : stillFor(OPS[d.op]?.units[0].kind),
    }, era === 'ww2' && d.op !== 'flanders' && WIP_KINDS.has(OPS[d.op]?.units[0].kind)));
  });
  return items;
}

// the URL that plays an entry; `from` is the menu's own query (its settings pass on); `level` and `mods`: the threat
// level and its modifiers (threat.js) for an entry played at a level
export function hrefOf(item, difficulty, from, { level = 1, mods = [] } = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(item.query)) p.set(k, v);
  if (item.difficulty && DIFFICULTIES.includes(difficulty)) p.set('difficulty', difficulty);
  if (item.level) { p.set('level', level); if (mods.length) p.set('mods', mods.join(',')); }
  for (const k of item.pass ?? PASS) if (from?.get(k)) p.set(k, from.get(k));
  return `${item.page ?? 'index.html'}?${p}`;
}

// the entry a game URL plays (the loading screen), or the one an old-style menu URL points at
export function itemForQuery(q, items) {
  const find = (key) => items.find((i) => i.key === key);
  if (q.get('campaign') && find(`campaign:${q.get('campaign')}`)) return find(`campaign:${q.get('campaign')}`);
  if (q.get('tutorial') && find(`tutorial:${q.get('tutorial')}`)) return find(`tutorial:${q.get('tutorial')}`);
  if (q.get('range')) return find(`range:${NATION_OF[eraOf(q)]}`);
  if (q.get('sandbox')) return { key: 'sandbox', era: '1917', title: 'Test range', kicker: 'Sandbox', sub: 'No battle', blurb: 'B fires a blast and a shell, N a burst ahead, K a star shell, L a Very light, J an S.O.S. rocket.', lines: [] };
  if (q.get('mode') === 'ww2') return find(`op:${OPS[q.get('op')] ? q.get('op') : 'flanders'}`);
  if (q.get('mode') === 'ww1') return find(`ww1:${OPS_WW1[q.get('op')] ? q.get('op') : 'ridge'}`);
  return find('battle:ypres');
}

// back to the menu from a game: its era, with the entry just played selected (and the menu's settings kept); `view`
// opens a screen of the menu ('research')
export function menuHref(q, sel = null, view = null) {
  const p = new URLSearchParams();
  if (eraOf(q) !== '1917') p.set('mode', eraOf(q));
  if (sel) p.set('sel', sel);
  if (view) p.set('view', view);
  for (const k of PASS) if (q.get(k)) p.set(k, q.get(k));
  const s = p.toString();
  return s ? `index.html?${s}` : 'index.html';
}

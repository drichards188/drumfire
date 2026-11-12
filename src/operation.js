// The career open battle's mission (Helldivers 2's way; DESIGN.md "Missions", docs/PROGRESSION.md): for a threat
// level, a seed and the lineup in the field, one generated mission with a shape (an archetype: counter-battery, their
// supply, their tanks, their command), its main objectives and its secondaries. Node-safe and pure: the menu's level
// card, the loading screen's briefing and the battle (ww1/director.js, sim/objectives.js) deal the same mission from
// the same three things.
//
// The design rules (from a research pass on Helldivers 2, Deep Rock Galactic, Into the Breach and XCOM 2, 2026-11-12):
//   - every objective is a named target on the map the player can see and choose the order of, and says what it does
//     to the battle (`why`); most do it (a dump gone slows their counter-battery fire, the HQ gone thins their attacks,
//     a laager broken up keeps its tanks out of the next attack, a battery silenced stops shelling our guns)
//   - main objectives never fail on a clock (an observer's window may close: the mission comes again, at a cost to the
//     level's `fails`); only secondaries are timed (a laager before its attack, the trains while they run)
//   - the attacks are pressure, never an objective: the enemy's timetable must not decide when the player is done
//   - when the mains are done the player calls the end (or X-Zeit, the finale); the secondaries pay only before it
//   - a mission has a shape (an archetype), not a random mix; and only what a battery of the lineup can finish is dealt
//     (capability.js siteVerdict): the same seed always deals the same mission
import { threatOf } from './threat.js';
import { OPS, RIDGE_ROLE_SITES, RIDGE_FORTS, RIDGE_BALLOON } from './ww1/ops.js';
import { siteVerdict } from './capability.js';
import { mulberry32 } from './noise.js';

const SITES = Object.fromEntries([...OPS.ridge.sites, ...RIDGE_ROLE_SITES, ...RIDGE_FORTS, ...RIDGE_BALLOON].map((s) => [s.id, s]));
const NAMES = ['Lerche', 'Hagel', 'Distel', 'Kranich', 'Eiche', 'Falke', 'Reiher', 'Wetterleuchten', 'Nebelkrähe', 'Wacholder',
  'Sturmvogel', 'Elster', 'Brachvogel', 'Holunder', 'Schwalbe', 'Ginster', 'Rohrdommel', 'Habicht', 'Kiebitz', 'Schlehdorn'];
export const LAAGER = { A: 'T1', B: 'T1', C: 'T2', D: 'T2' }; // the tank laager behind each sector

// The objectives' kinds. `sites` where one may be dealt (by the level's kinds of site: capability.js tierOf); a main
// objective may name two or three of them on the higher levels (all of them to be done: a main is one to three fire
// missions). `title(ts, n)` the order in the player's words (ts the sites), `short` the HUD's, `why` what it does to
// the battle (the briefing), `done` the radio's word on it done, `effect` what the director does then ('supply': the
// dumps' own rule, ww1/enemy.js supply; 'attacks': the attacks to come thinner; 'traffic': their supply held up)
const place = (t) => t.name.split(', ')[1] ?? t.name;
const and = (a) => (a.length < 2 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const BATTERY_NAME = (t) => t.name.replace(/^British /, '').replace(/^18-pounder battery, /, '18-pounders on the ');
export const OBJECTIVES = {
  battery: { sites: ['F1', 'F2', 'G1', 'G2', 'G3', 'G4', 'G5'], w: (t) => (t.kind === 'bfield' ? 1 : 1.3),
    title: (ts) => `Silence ${and(ts.map((t) => `the ${BATTERY_NAME(t)}`))}`,
    short: (ts) => (ts.length > 1 ? `Silence ${ts.length} batteries` : BATTERY_NAME(ts[0]).replace(/^18-pounders on the /, '18-pdrs, ')),
    why: 'They are shelling our guns. Half its guns out and a battery falls silent until a new one moves in.',
    done: 'they have fallen silent' },
  dump: { sites: ['D1', 'D2'], w: () => 1.2, effect: 'supply',
    title: (ts) => (ts.length > 1 ? 'Blow up both ammunition dumps' : `Blow up the ammunition dump at ${place(ts[0])}`),
    short: (ts) => (ts.length > 1 ? 'Both dumps' : `Dump, ${place(ts[0])}`),
    why: 'Their guns draw their shells from it: with it gone, their counter-battery fire slows.', done: 'their guns are short of shells' },
  hq: { sites: ['H1'], w: () => 1, effect: 'attacks',
    title: () => 'Shell the brigade HQ in the Ypres ramparts', short: () => 'Brigade HQ',
    why: 'Without their HQ their attacks come thinner.', done: 'their attacks will come thinner' },
  laager: { sites: ['T1', 'T2'], w: () => 1,
    title: (ts) => (ts.length > 1 ? 'Break up both tank laagers' : `Break up the tank laager at ${place(ts[0])}`),
    short: (ts) => (ts.length > 1 ? 'Both laagers' : `Laager, ${place(ts[0])}`),
    why: 'Half its tanks out and a laager is broken up: its tanks stay out of the fight.', done: 'no tanks from there' },
  deep: { sites: ['W1', 'W2', 'W3'], w: () => 1.8, role: 'deep',
    title: (ts) => `Deep strike: ${and(ts.map((t) => `the ${t.name}`))}`, short: (ts) => (ts.length > 1 ? `${ts.length} deep targets` : ts[0].name),
    why: 'Far behind their line: only the long guns reach it.', done: 'their rear is burning' },
  concrete: { sites: ['V1', 'V2', 'V3'], w: () => 1.6, role: 'hard', effect: 'attacks',
    title: (ts) => `Break the concrete shelter${ts.length > 1 ? 's' : ''} at ${and(ts.map(place))}`,
    short: (ts) => (ts.length > 1 ? `${ts.length} shelters` : `Shelter, ${place(ts[0])}`),
    why: 'Their reserves shelter in them: broken, their attacks come thinner. Only heavy shells break concrete.', done: 'their reserves are without cover' },
  railgun: { sites: ['G5'], w: () => 2, value: 2,
    title: () => 'Hunt down the British 18-inch railway howitzer', short: () => 'The railway gun',
    why: 'It comes up to fire a few rounds, then withdraws out of sight. Each round it fires firms the sound rangers\' fix on its firing point: lay on the fix, and catch it when it fires again.',
    done: 'their railway gun is wrecked' },
  xzeit: { title: () => 'X-Zeit: put our assault into their line', short: () => 'X-Zeit',
    why: 'The finale, when you call it: the Feuervorbereitung, then the Feuerwalze lifted on the timetable ahead of our men.' },
  // secondaries only
  traffic: { effect: 'traffic', title: (_, n) => `Wreck ${n === 1 ? 'a train or a convoy' : `${n} trains or convoys`}`, short: () => 'Trains, convoys',
    why: 'They come and go: at Hellfire Corner and at the railhead. Each one wrecked holds their supply up for a while.', done: 'their supply is held up' },
  tanks: { title: (ts) => `Break up the laager at ${place(ts[0])} before their attack`, short: (ts) => `Laager, ${place(ts[0])}, in time`,
    why: 'Its tanks go in with their next attack on that side unless half of them are out by then.', done: 'their attack goes in without tanks' },
  balloon: { effect: 'blind', title: () => 'Bring down their kite balloon over Ypres', short: () => 'Kite balloon',
    why: 'Its observer watches our guns: while it is up their counter-battery fire finds us sooner. Shell its winch on the ground: every near miss has them haul it down for a while, and the winch wrecked brings it down for good.',
    done: 'their counter-battery fire is half blind until another goes up' },
  forts: { title: (_, n) => `Break the ${n} strongpoints in the X-Zeit lanes`, short: () => 'Strongpoints',
    why: 'Each left standing fires on our assault. Only 28 cm shells and heavier break them.', done: 'the lanes are clear' },
};
// the deep sites by what they are (the corps HQ thins the attacks, the depots slow their fire)
const DEEP_EFFECT = { W1: 'supply', W2: 'supply', W3: 'attacks' };

// The archetypes: a mission's shape. `mains` the kinds its main objectives come from (in order of preference), `sides`
// its secondaries' kinds; it is dealt only when the lineup can finish at least one main of its kinds at the level
export const ARCHETYPES = [
  { id: 'cb', name: 'Gegenbatterie', en: 'Counter-battery', line: 'Their batteries have the range of ours. Silence them, battery by battery.',
    mains: ['battery'], sides: ['balloon', 'railgun', 'dump', 'traffic', 'tanks', 'hq'] },
  { id: 'supply', name: 'Nachschub', en: 'Their supply', line: 'Their dumps and depots feed the guns that shell us. Burn them.',
    mains: ['dump', 'deep'], sides: ['traffic', 'railgun', 'battery', 'tanks', 'hq'] },
  { id: 'tanks', name: 'Tankabwehr', en: 'Their tanks', line: 'Their tanks are gathering behind the line for the next attack. Break them up first.',
    mains: ['laager', 'battery'], sides: ['tanks', 'dump', 'battery', 'traffic'] },
  { id: 'command', name: 'Führung', en: 'Their command', line: 'Their HQs and the shelters of their reserves. Without them their attacks falter.',
    mains: ['hq', 'concrete', 'deep'], sides: ['battery', 'balloon', 'dump', 'traffic', 'tanks'] },
];

// what a mission pays (×the level's pay, research.js battleReward): each main objective, each secondary, every
// secondary done (the full clear), each medal; a main is about two and a half secondaries (Helldivers 2's ratio)
export const OBJECTIVE_PAY = { main: 100, side: 40, clear: 80, medal: 25 };
// the medals on the end card (not objectives: failed early, they would nag the rest of the battle)
export const MEDALS = {
  nogun: { title: 'No gun lost', why: 'Every gun of the Gruppe in action to the end.' },
  nobreach: { title: 'Not one of theirs in our trenches', why: 'Every attack stopped short of our front line.' },
};

const verdictOf = (bats, s, L) => siteVerdict(bats, { kind: s.kind, pos: s.pos, role: s.role ?? null, minHard: s.minHard, partHp: s.partHp }, { deadlineK: L.deadline });
const TIER = { railgun: () => 'heavy', battery: (s) => (s.kind === 'bfield' ? 'soft' : 'heavy'), dump: () => 'soft', hq: () => 'soft', laager: () => 'armour', deep: () => 'deep', concrete: () => 'hard' };

// generateOperation(level, seed, batteries): { name, archetype, level, seed, objectives, attacks, xzeit, forts, medals }
//   batteries  the lineup on the map ({ kind, guns, mods, pos }: capability.js batteriesOf, or the sim's units)
//   objectives [{ id, kind, main, title, short, why, doneLine, effect, targets: [site ids], n, timed, before, reveal }]
//              `reveal` the day's time the secondary is reported (0: in the briefing)
//   attacks    [{ t, sector, size }] on the day's clock: pressure, the level's count
export function generateOperation(level, seed, batteries) {
  const L = threatOf(level), rnd = mulberry32(((seed >>> 0) ^ 0x0b1ec7) >>> 0);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const verdicts = new Map();
  const verdict = (id) => { if (!verdicts.has(id)) verdicts.set(id, SITES[id] ? verdictOf(batteries, SITES[id], L) : 'no'); return verdicts.get(id); };
  // (a main only where the lineup is 'ready' for it: a main it can only just finish fails over and over; a secondary
  // may be a stretch)
  const can = (id, main = false) => (main ? verdict(id) === 'ready' : verdict(id) !== 'no');
  // the sites of a kind the level offers and the lineup can finish, in a rolled order
  const sitesFor = (kind, main = false) => shuffle((OBJECTIVES[kind].sites ?? []).filter((id) => L.sites.includes(TIER[kind]?.(SITES[id]) ?? 'soft') && can(id, main)));
  const name = `Unternehmen ${pick(NAMES)}`;

  // the attacks: the level's count, spread over the mission's likely length, each in a rolled sector (never the same
  // twice running); pressure, not an objective
  const attacks = [];
  let at = 480 + rnd() * 140;
  for (let i = 0; i < L.attacks; i++) {
    let sec = pick(['A', 'B', 'C', 'D']);
    if (attacks.length && sec === attacks[attacks.length - 1].sector) sec = pick(['A', 'B', 'C', 'D'].filter((s) => s !== sec));
    attacks.push({ t: Math.round(at), sector: sec, size: [0.6, 0.6, 0.5, 0.5, 0.55][i] ?? 0.5 });
    at += 230 + rnd() * 110;
  }
  const xzeit = rnd() < (L.xzeit ?? 0);

  // the archetype: one whose main kinds the lineup can serve at this level, rolled
  const fits = ARCHETYPES.filter((a) => a.mains.some((k) => sitesFor(k, true).length));
  const arch = fits.length ? pick(fits) : ARCHETYPES[0];
  const used = new Set(), mains = [];
  // a main's targets of one kind, up to the share of the level's work (`work`, in fire missions) it should carry
  const share = (L.work ?? L.mains ?? 1) / Math.max(1, L.mains ?? 1);
  const take = (kind, w = 0, main = false) => {
    // (the railway-gun hunt, the research's "duel of deduction": a secondary from level 5 that pays double; as a main it
    // decided whole battles on its hardest moment, and the crews on auto never caught the gun, 2026-11-12)
    if (kind === 'railgun' && (main || L.n < 5)) return null;
    const ids = sitesFor(kind, main).filter((s) => !used.has(s)), got = [];
    let sum = 0;
    for (const id of ids) {
      if (got.length && (sum >= w - 0.4 || got.length >= 3 || kind === 'railgun')) break;
      got.push(id);
      sum += OBJECTIVES[kind].w?.(SITES[id]) ?? 1;
    }
    if (!got.length) return null;
    for (const id of got) used.add(id);
    return { kind, targets: got };
  };
  // its mains, from its kinds in turn; topped up from the others' if it runs short
  const mainKinds = [...arch.mains, ...ARCHETYPES.flatMap((a) => a.mains).filter((k) => !arch.mains.includes(k))];
  for (let i = 0; mains.length < (L.mains ?? 1) && i < 12; i++) {
    let got = null;
    for (const k of i < arch.mains.length ? [arch.mains[i % arch.mains.length], ...arch.mains] : mainKinds) { got = take(k, share, true); if (got) break; }
    if (!got) for (const k of mainKinds) { got = take(k, share, true); if (got) break; }
    if (!got) break;
    mains.push(got);
  }
  // its secondaries: the archetype's kinds first, then whatever fits; the laager in time only before an attack on its
  // side (and not a laager that is a main), the trains and convoys only while they run (a timed one each, at most)
  const sides = [];
  const forts = xzeit ? L.forts ?? 0 : 0;
  if (forts) sides.push({ kind: 'forts', targets: RIDGE_FORTS.slice(0, forts).map((s) => s.id), n: forts });
  const sideOf = (kind) => {
    if (kind === 'traffic') return sides.some((s) => s.kind === 'traffic') || !(can('X1') || can('R1')) ? null : { kind, targets: ['X1', 'R1'], n: L.attacks >= 2 ? 2 : 1, timed: true };
    // (the balloon from level 3: its winch on the ground, a target any battery that reaches it can shell)
    if (kind === 'balloon') return sides.some((s) => s.kind === 'balloon') || L.cb < 0.5 || !can('L1') ? null : { kind, targets: ['L1'] };
    if (kind === 'tanks') {
      if (!L.tanks || sides.some((s) => s.kind === 'tanks')) return null;
      const a = attacks.find((q) => can(LAAGER[q.sector]) && !used.has(LAAGER[q.sector]));
      if (!a) return null;
      used.add(LAAGER[a.sector]);
      return { kind, targets: [LAAGER[a.sector]], before: a.t, timed: true };
    }
    return take(kind);
  };
  const sideKinds = [...arch.sides, 'battery', 'dump', 'traffic', 'hq', 'laager', 'deep', 'concrete', 'tanks', 'balloon'];
  // (the archetype's own kinds first, in a rolled order: a fixed order dealt the same first secondary every time)
  const own = shuffle(arch.sides);
  for (let guard = 0; sides.length < (L.sides ?? 1) && guard < sideKinds.length * 2; guard++) {
    const k = guard < own.length ? own[guard] : sideKinds[Math.floor(rnd() * sideKinds.length)];
    const s = sideOf(k);
    if (s) sides.push(s);
  }

  const objectives = [];
  const add = (c, main, reveal = 0) => {
    const O = OBJECTIVES[c.kind], ts = (c.targets ?? []).map((id) => SITES[id]).filter(Boolean), n = c.n ?? Math.max(1, ts.length);
    objectives.push({ id: `o${objectives.length + 1}`, kind: c.kind, main, title: O.title(ts, n), short: O.short(ts, n), why: O.why, doneLine: O.done ?? '',
      effect: c.kind === 'deep' ? DEEP_EFFECT[c.targets[0]] ?? null : O.effect ?? null, role: O.role ?? null,
      targets: c.targets ?? [], n, timed: !!c.timed, before: c.before ?? null, reveal, value: O.value ?? 1 });
  };
  // the mains in the briefing, and from level 4 the last `later` of them reported during the battle, about the first
  // attack (so the work runs into the attacks, and the report is a moment of its own)
  const later = Math.min(L.later ?? 0, mains.length - 1), t1 = attacks[0]?.t ?? 420;
  mains.forEach((c, i) => add(c, true, i >= mains.length - later ? Math.round(t1 - 60 + rnd() * 160) : 0));
  if (xzeit) add({ kind: 'xzeit' }, true);
  // two secondaries in the briefing; the rest reported during the battle
  sides.forEach((c, i) => add(c, false, i < 2 ? 0 : 260 + (i - 2) * 240));
  const medals = ['nogun', ...(attacks.length ? ['nobreach'] : [])];
  return { name, archetype: arch.id, title: arch.name, en: arch.en, line: arch.line, level: L.n, seed: seed >>> 0, objectives, attacks, xzeit, forts, medals };
}

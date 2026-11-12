// The career open battle's threat levels (Helldivers 2's difficulties: the player picks one before battle; docs/
// PROGRESSION.md, DESIGN.md "Threat levels"). Node-safe data. Level 1 is comfortable for a new career's lone Ringkanone C/92; level
// 10 challenges a full lineup at its best. A level sets the battle, never the player's own guns: its orders, the
// enemy's pressure, the kinds of target, the modifiers, the pay. Every level is open from the start: the player
// picks any.
//
// The display fields (n, name, en, sub, lines, fits, pay, modifiers) are the menu's, the loading screen's and the end
// card's. The battle fields are the sim's (src/operation.js deals the mission from them; the theatre's director and enemy
// read sim.level); see DESIGN.md "Threat levels" and "Missions" for what each does.
//   day      the kind of day (the old fixed days' name: 'morning', 'day', 'night', 'full'); a level's battle ends on its
//            mission, never on the clock (ww1/director.js)
//   mains, sides  how many main objectives (targets: each done, the player may end the battle) and secondaries the
//            mission deals (src/operation.js); `work` the mains' weight in fire missions (a main names two or three
//            targets of its kind on the higher levels), `later` how many of the mains are reported during the battle; `xzeit` the chance it ends with X-Zeit, the finale the player calls
//            (our assault behind the Feuerwalze, whose men in decide it). `fails` how many of the main objectives'
//            fire missions may fail (an observer's window closing; the mission comes again); one more loses
//   attacks  how many British attacks with their Sperrfeuer (pressure, never an objective), `assault` their size
//   cb, raids, spotters, heavies  the counter-battery fire's rate, the air raids' rate (0: none), the spotter
//            aircraft, the British heavies answering in their pits
//   tanks    tanks with the attacks; `sites` the kinds of target the mission may deal: 'soft', 'armour', 'heavy',
//            'deep', 'hard'; `forts` the concrete strongpoints in the X-Zeit lanes (levels 6 to 10, ww1/ops.js
//            RIDGE_FORTS, with X-Zeit only): only shells of 28 cm and more break them, and each left standing fires on
//            our assault (ww1/infantry.js)
//   deadline the observers' windows, `dmg` the enemy's damage to the guns, `sig` how fast the guns are located; `zero`
//            the share of our men that must reach the British line at X-Zeit, `cover` the Feuerwalze's bursts on each
//            lane in 20 s that keep the garrison's heads down (ww1/infantry.js; 6 without a level). From level 6 a
//            super-heavy takes one of the five slots a field battery had, so `zero` is lower there (tuned on 72 seeds
//            with capability.js REFERENCE, 2026-11-02)
export const THREAT = [
  { n: 1, name: 'Ruhige Front', en: 'Quiet front', fits: 'Ringkanone C/92, one gun', pay: 1, modifiers: 0,
    sub: 'One main objective on soft targets; no attacks, little to fear.',
    lines: ['One main objective and one secondary. When the main is done, end the battle when you are ready.', 'Field batteries, dumps, the HQ and the traffic on their roads.', 'No attacks, almost no counter-battery fire, no aircraft.'],
    day: 'morning', mains: 1, work: 1, later: 0, sides: 1, xzeit: 0, fails: 3, attacks: 0, assault: 0.4, cb: 0.25, raids: 0, spotters: false, heavies: false, tanks: false, sites: ['soft'], deadline: 1.4, dmg: 0.5, sig: 0.6, zero: 0.5, cover: 6 },
  { n: 2, name: 'Stellungskrieg', en: 'Trench routine', fits: 'Ringkanone C/92, two guns', pay: 1, modifiers: 0,
    sub: 'One main objective and two secondaries; one small attack.',
    lines: ['One main objective and two secondaries.', 'One small British attack: answer the red rockets with Sperrfeuer.', 'Light counter-battery fire.'],
    day: 'day', mains: 1, work: 1.3, later: 0, sides: 2, xzeit: 0, fails: 3, attacks: 1, assault: 0.45, cb: 0.4, raids: 0, spotters: false, heavies: false, tanks: false, sites: ['soft'], deadline: 1.3, dmg: 0.6, sig: 0.7, zero: 0.5, cover: 6 },
  { n: 3, name: 'Störungsfeuer', en: 'Harassing fire', fits: 'Ringkanone C/92 and a battery of FK 16', pay: 1.25, modifiers: 0,
    sub: 'Two main objectives; two attacks, and their field batteries answer.',
    lines: ['Two main objectives and two secondaries.', 'Two attacks.', 'The British field batteries shoot back.'],
    day: 'night', mains: 2, work: 2.6, later: 0, sides: 2, xzeit: 0, fails: 4, attacks: 2, assault: 0.55, cb: 0.55, raids: 0, spotters: false, heavies: false, tanks: false, sites: ['soft'], deadline: 1.2, dmg: 0.7, sig: 0.8, zero: 0.5, cover: 6 },
  { n: 4, name: 'Gegenbatterie', en: 'Counter-battery', fits: 'A K 17, a battery of sFH 13 and a Mörser 16', pay: 1.5, modifiers: 0,
    sub: 'Their heavies hunt you, and their tanks gather in laagers.',
    lines: ['Two main objectives and three secondaries.', 'The British heavies answer from their pits; spotter aircraft find your guns.', 'Tank laagers and the heavies among the targets; two attacks.'],
    day: 'night', mains: 2, work: 4.6, later: 1, sides: 3, xzeit: 0, fails: 4, attacks: 2, assault: 0.65, cb: 0.7, raids: 0, spotters: true, heavies: true, tanks: false, sites: ['soft', 'armour', 'heavy'], deadline: 1.1, dmg: 0.8, sig: 0.9, zero: 0.55, cover: 6 },
  { n: 5, name: 'Großkampftag', en: 'Day of battle', fits: 'K 17, sFH 13, leFH 18 and Mörser 16', pay: 1.75, modifiers: 1,
    sub: 'Three attacks with their tanks; one mission in two ends with X-Zeit.',
    lines: ['Two main objectives and three secondaries. One mission in two ends with X-Zeit, when you call it: our own attack behind the Feuerwalze.', 'Three attacks, bigger where their tank laagers still stand; Camels raid the loudest battery.', 'One modifier.'],
    day: 'full', mains: 2, work: 5.6, later: 1, sides: 3, xzeit: 0.5, fails: 4, attacks: 3, assault: 0.75, cb: 0.85, raids: 0.7, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy'], deadline: 1, dmg: 0.9, sig: 1, zero: 0.675, cover: 7 },
  { n: 6, name: 'Materialschlacht', en: 'Battle of materiel', fits: 'K 18, sFH 13, leFH 18, Mörser 16 and the Langer Max', pay: 2, modifiers: 1,
    sub: 'Concrete and deep targets: bring a super-heavy and a long gun.',
    lines: ['Two main objectives and three secondaries. X-Zeit three missions in five, with two strongpoints in its lanes that only 28 cm shells and heavier break.', 'Deep targets and concrete shelters; three attacks.', 'One modifier.'],
    day: 'full', mains: 2, work: 6.2, later: 1, sides: 3, xzeit: 0.6, fails: 4, attacks: 3, assault: 0.85, cb: 1, raids: 1, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard', 'fort'], forts: 2, deadline: 1, dmg: 1, sig: 1, zero: 0.63, cover: 8 },
  { n: 7, name: 'Abwehrschlacht', en: 'Defensive battle', fits: 'Five upgraded: K 18, sFH 18, sFH 13, leFH 18 and the Gamma', pay: 2.5, modifiers: 1,
    sub: 'Four attacks, and the counter-battery fire comes quicker.',
    lines: ['Three main objectives and three secondaries. X-Zeit three missions in five.', 'Four attacks; the counter-battery fire comes quicker; more raids by day.', 'One modifier.'],
    day: 'full', mains: 3, work: 7.2, later: 1, sides: 3, xzeit: 0.6, fails: 4, attacks: 4, assault: 0.95, cb: 1.2, raids: 1.2, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard', 'fort'], forts: 2, deadline: 0.95, dmg: 1.1, sig: 1.1, zero: 0.69, cover: 9 },
  { n: 8, name: 'Trommelfeuer', en: 'Drumfire', fits: 'K 18, sFH 18, leFH 18, Mörser 18 and the Beta-Gerät, upgraded, and the V-1', pay: 3, modifiers: 2,
    sub: 'Two modifiers, concrete in numbers, the sky theirs.',
    lines: ['Three main objectives and four secondaries. X-Zeit seven missions in ten, with three strongpoints.', 'Four bigger attacks; concrete and deep targets.', 'Two modifiers.'],
    day: 'full', mains: 3, work: 8, later: 1, sides: 4, xzeit: 0.7, fails: 3, attacks: 4, assault: 1.05, cb: 1.45, raids: 1.4, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard', 'fort'], forts: 3, deadline: 0.9, dmg: 1.2, sig: 1.2, zero: 0.61, cover: 10 },
  { n: 9, name: 'Feuersturm', en: 'Firestorm', fits: 'K 18, sFH 18, leFH 18, Mörser 18 and the Gamma, well upgraded, and the V-2', pay: 3.5, modifiers: 2,
    sub: 'Bigger attacks, harder counter-battery fire, tighter windows.',
    lines: ['Three main objectives and four secondaries. X-Zeit three missions in four, with three strongpoints.', 'Four big attacks; the observers\' windows close sooner.', 'The heaviest counter-battery fire yet; two modifiers.'],
    day: 'full', mains: 3, work: 8.6, later: 1, sides: 4, xzeit: 0.75, fails: 3, attacks: 4, assault: 1.2, cb: 1.7, raids: 1.6, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard', 'fort'], forts: 3, deadline: 0.8, dmg: 1.35, sig: 1.35, zero: 0.62, cover: 11 },
  { n: 10, name: 'Stahlgewitter', en: 'Storm of steel', fits: 'K 38, sFH 18, Hummel, leFH 18 and the Gamma at their best, and the V-2', pay: 4, modifiers: 2,
    sub: 'Everything at full strength, with nothing to spare.',
    lines: ['Three main objectives and four secondaries. X-Zeit four missions in five, with four strongpoints.', 'Five attacks, the heaviest counter-battery fire, raids all day.', 'Two modifiers.'],
    day: 'full', mains: 3, work: 9.5, later: 1, sides: 4, xzeit: 0.8, fails: 3, attacks: 5, assault: 1.35, cb: 2, raids: 1.8, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard', 'fort'], forts: 4, deadline: 0.75, dmg: 1.5, sig: 1.5, zero: 0.58, cover: 12 },
];
export const MAX_LEVEL = THREAT.length;
export const threatOf = (n) => THREAT[Math.max(1, Math.min(MAX_LEVEL, n | 0)) - 1];

// The modifiers (Helldivers 2's operation modifiers): rolled for a battle from its seed, shown before it, carried in the
// game page's URL (?mods=mist,air). `weather` sets the page's weather; the sim reads the rest from sim.modifiers.
export const MODIFIERS = [
  { id: 'mist', name: 'Ground mist', line: 'Mist on the ground: the observers report slower.', weather: 'Mist' },
  { id: 'air', name: 'Enemy air superiority', line: 'Twice the raids and the spotters, and no aeroplane to observe for you.' },
  { id: 'shells', name: 'Shell shortage', line: 'Fewer shells at the guns, and slower resupply.' },
  { id: 'sound', name: 'Enemy sound ranging', line: 'Your batteries are located half as fast again.' },
  { id: 'intel', name: 'Poor intelligence', line: 'Targets stay unknown until an observer reports them.' },
  { id: 'rain', name: 'Rain', line: 'Rain and mud: the ammunition comes slower and the crews work slower.', weather: 'Rain' },
];
export const modifierOf = (id) => MODIFIERS.find((m) => m.id === id) ?? null;
// a level's modifiers for a seed (none below level 5), distinct, in a stable order
export function rollModifiers(n, seed) {
  const k = threatOf(n).modifiers;
  let s = (seed >>> 0) || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pool = MODIFIERS.map((m) => m.id), out = [];
  while (out.length < k && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return MODIFIERS.map((m) => m.id).filter((id) => out.includes(id));
}
// the modifiers named in a URL (?mods=), known ones only
export const parseModifiers = (s) => (s ?? '').split(',').filter((id) => modifierOf(id));

// The lineup's slots (War Thunder's crew slots): this many batteries on the map and off it take the field
export const SLOTS = { map: 5, support: 1 };

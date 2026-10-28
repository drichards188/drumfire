// The career open battle's threat levels (Helldivers 2's difficulties: the player picks one before battle; docs/
// PROGRESSION.md, DESIGN.md "Threat levels"). Node-safe data. Level 1 is comfortable for a new career's lone K 17; level
// 10 challenges a full lineup at its best. A level sets the battle, never the player's own guns: the day's length, the
// enemy's pressure, the kinds of target, the modifiers, the pay. Playing a level to its end, won or lost, unlocks the
// next (progression.js): they are played in order.
//
// The display fields (n, name, en, sub, lines, fits, pay, modifiers) are the menu's, the loading screen's and the end
// card's. The battle fields (day, attacks, assault, cb, raids, spotters, heavies, tanks, sites, deadline, dmg, sig,
// zero) are the sim's (the theatre's director and enemy read sim.level); see DESIGN.md for what each does.
//   day      'morning' (Einschießen and the Artilleriekampf, about 15 min), 'day' (to the evening: the attacks),
//            'night' (through the night), 'full' (with X-Zeit and the Feuerwalze); `need`, the site missions a shorter
//            day must see done (ww1/director.js dayEnd)
//   attacks  how many British attacks with their Sperrfeuer, and `assault` their size (1: today's Normal)
//   cb, raids, spotters, heavies  the counter-battery fire's rate, the air raids' rate (0: none), the spotter
//            aircraft, the British heavies answering in their pits
//   tanks    tanks with the attacks; `sites` the site missions' kinds: 'soft', 'armour', 'heavy', 'deep', 'hard'
//   deadline the missions' time, `dmg` the enemy's damage to the guns, `sig` how fast the guns are located; `zero`
//            the share of our men that must reach the British line at X-Zeit, `cover` the Feuerwalze's bursts on each
//            lane in 20 s that keep the garrison's heads down (ww1/infantry.js; 6 without a level)
export const THREAT = [
  { n: 1, name: 'Ruhige Front', en: 'Quiet front', fits: 'K 17, one gun', pay: 1, modifiers: 0,
    sub: 'Morning only: soft targets in reach, no attacks, little to fear.',
    lines: ['Dawn and the morning, about 15 minutes: finish one fire mission and hold the line.', 'Field batteries, dumps, the HQ and the traffic on their roads.', 'No attacks, almost no counter-battery fire, no aircraft.'],
    day: 'morning', need: 1, attacks: 0, assault: 0.4, cb: 0.25, raids: 0, spotters: false, heavies: false, tanks: false, sites: ['soft'], deadline: 1.4, dmg: 0.5, sig: 0.6, zero: 0.5, cover: 6 },
  { n: 2, name: 'Stellungskrieg', en: 'Trench routine', fits: 'K 17, two guns', pay: 1, modifiers: 0,
    sub: 'Into the afternoon: one small attack and its Sperrfeuer.',
    lines: ['The morning and the afternoon: finish two fire missions and hold the line.', 'One small British attack: answer the red rockets.', 'Light counter-battery fire.'],
    day: 'day', need: 2, attacks: 1, assault: 0.45, cb: 0.4, raids: 0, spotters: false, heavies: false, tanks: false, sites: ['soft'], deadline: 1.3, dmg: 0.6, sig: 0.7, zero: 0.5, cover: 6 },
  { n: 3, name: 'Störungsfeuer', en: 'Harassing fire', fits: 'K 17 and sFH 13, two guns each', pay: 1.25, modifiers: 0,
    sub: 'Through the night: two attacks, their field batteries answer.',
    lines: ['The day and the night, with harassing fire on their roads: finish ten fire missions and hold the line.', 'Two attacks.', 'The British field batteries shoot back.'],
    day: 'night', need: 10, attacks: 2, assault: 0.55, cb: 0.55, raids: 0, spotters: false, heavies: false, tanks: false, sites: ['soft'], deadline: 1.2, dmg: 0.7, sig: 0.8, zero: 0.5, cover: 6 },
  { n: 4, name: 'Gegenbatterie', en: 'Counter-battery', fits: 'A K 17, a battery of sFH 13 and a Mörser 16', pay: 1.5, modifiers: 0,
    sub: 'Their heavies hunt you, and their tanks gather in laagers.',
    lines: ['The day and the night: finish seventeen fire missions and hold the line.', 'The British heavies answer from their pits; spotter aircraft find your guns.', 'Tank laagers and the heavies to silence; two attacks.'],
    day: 'night', need: 17, attacks: 2, assault: 0.65, cb: 0.7, raids: 0, spotters: true, heavies: true, tanks: false, sites: ['soft', 'armour', 'heavy'], deadline: 1.1, dmg: 0.8, sig: 0.9, zero: 0.55, cover: 6 },
  { n: 5, name: 'Großkampftag', en: 'Day of battle', fits: 'K 17, sFH 13, leFH 18 and Mörser 16', pay: 1.75, modifiers: 1,
    sub: 'The whole day, to X-Zeit and the Feuerwalze; their tanks swell the attacks.',
    lines: ['The whole day, ending with our own attack at X-Zeit behind the Feuerwalze: get our men into the British line.', 'Three attacks, bigger where their tank laagers still stand; Camels raid the loudest battery.', 'One modifier.'],
    day: 'full', attacks: 3, assault: 0.75, cb: 0.85, raids: 0.7, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy'], deadline: 1, dmg: 0.9, sig: 1, zero: 0.72, cover: 7 },
  { n: 6, name: 'Materialschlacht', en: 'Battle of materiel', fits: 'Five batteries with a K 18 and the Langer Max', pay: 2, modifiers: 1,
    sub: 'Deep targets and concrete join the day.',
    lines: ['The whole day, to X-Zeit.', 'Deep targets beyond the field guns, concrete shelters only heavy shells break.', 'Three attacks; one modifier.'],
    day: 'full', attacks: 3, assault: 0.85, cb: 1, raids: 1, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard'], deadline: 1, dmg: 1, sig: 1, zero: 0.71, cover: 8 },
  { n: 7, name: 'Abwehrschlacht', en: 'Defensive battle', fits: 'Five upgraded: K 18, sFH 18, sFH 13, leFH 18 and the Gamma', pay: 2.5, modifiers: 1,
    sub: 'Four attacks, and the counter-battery fire comes quicker.',
    lines: ['The whole day, to X-Zeit.', 'Four attacks; the counter-battery fire comes quicker.', 'More raids by day; one modifier.'],
    day: 'full', attacks: 4, assault: 0.95, cb: 1.2, raids: 1.2, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard'], deadline: 0.95, dmg: 1.1, sig: 1.1, zero: 0.73, cover: 9 },
  { n: 8, name: 'Trommelfeuer', en: 'Drumfire', fits: 'Five upgraded with a Mörser 18, and the V-1', pay: 3, modifiers: 2,
    sub: 'Two modifiers, concrete in numbers, the sky theirs.',
    lines: ['The whole day, to X-Zeit.', 'Four bigger attacks; concrete and deep targets.', 'Two modifiers.'],
    day: 'full', attacks: 4, assault: 1.05, cb: 1.45, raids: 1.4, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard'], deadline: 0.9, dmg: 1.2, sig: 1.2, zero: 0.7, cover: 10 },
  { n: 9, name: 'Feuersturm', en: 'Firestorm', fits: 'Five well upgraded, and the V-2', pay: 3.5, modifiers: 2,
    sub: 'Bigger attacks, harder counter-battery fire, tighter deadlines.',
    lines: ['The whole day, to X-Zeit.', 'Four big attacks; tight deadlines.', 'The heaviest counter-battery fire yet; two modifiers.'],
    day: 'full', attacks: 4, assault: 1.2, cb: 1.7, raids: 1.6, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard'], deadline: 0.8, dmg: 1.35, sig: 1.35, zero: 0.72, cover: 11 },
  { n: 10, name: 'Stahlgewitter', en: 'Storm of steel', fits: 'Five at their best, and the V-2', pay: 4, modifiers: 2,
    sub: 'Everything at full strength, with nothing to spare.',
    lines: ['The whole day, to X-Zeit.', 'Five attacks, the heaviest counter-battery fire, raids all day.', 'Two modifiers.'],
    day: 'full', attacks: 5, assault: 1.35, cb: 2, raids: 1.8, spotters: true, heavies: true, tanks: true, sites: ['soft', 'armour', 'heavy', 'deep', 'hard'], deadline: 0.75, dmg: 1.5, sig: 1.5, zero: 0.67, cover: 12 },
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

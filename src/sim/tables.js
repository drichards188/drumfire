// Game tables: guns, shells, targets, difficulty. Arcade values with period flavour, not weapons data.
// Angles in radians, lengths in metres, times in seconds, masses in kg (calibres in inches for display).
import { DEG } from '../sector.js';
import { GUNS_WW2, SHELLS_WW2, TARGETS_WW2, FFE_WW2 } from './tables_ww2.js';
import { GUNS_WW1, SHELLS_WW1, TARGETS_WW1, FFE_WW1 } from './tables_ww1.js';

export const G = 9.81;
export const STEP = 0.05;
const D = (d) => d * DEG;

// loadEl matches the models' rig.loadEl (the 15-inch muzzle must clear its earth box, the 9.2-inch
// loads at the handbook's 3 degrees of depression).
// Loading steps in order. The heavies depress to `loadEl` first; `lay` takes the piece back to the ordered
// elevation and line (its duration is a minimum: the step ends when the piece is laid).
// Each entry is { step, dur }; the render layer animates crew and rig from piece.job.step.
const seq = (...a) => a.map(([step, dur]) => ({ step, dur }));

export const GUNS = {
  bl15: {
    name: '15-inch howitzer', short: '15in', calibre: 15, mass: 635, shell: 'bl15',
    // muzzle velocity per charge (m/s); the top charge gives the maximum range of about 9.7 km at 45 degrees
    charges: [{ name: 'Charge 1', v: 188 }, { name: 'Charge 2', v: 242 }, { name: 'Charge 3', v: 292 }, { name: 'Charge 4', v: 336 }],
    elMin: D(15), elMax: D(45), restEl: D(40), loadEl: D(17), traverse: D(48),
    azRate: D(2.0), elRate: D(5),
    load: seq(['depress', 6], ['open', 4], ['shell', 13], ['ram', 6], ['cartridge', 8], ['close', 3], ['prime', 2], ['lay', 8]),
    crew: 12, hp: 170, recoil: 0.9, runout: 5, sheaf: 40,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0006,
    ammo: { he: 60, shrapnel: 0 }, sig: 0.07, cd: 0.2,
    fuzes: ['instant', 'delay'],
  },
  bl92: {
    name: '9.2-inch howitzer', short: '9.2in', calibre: 9.2, mass: 130, shell: 'bl92',
    charges: [{ name: 'Charge 1', v: 233 }, { name: 'Charge 2', v: 303 }, { name: 'Charge 3', v: 364 }, { name: 'Charge 4', v: 409 }],
    elMin: D(15), elMax: D(50), restEl: D(35), loadEl: D(-3), traverse: D(58),
    azRate: D(3.0), elRate: D(6),
    load: seq(['depress', 3], ['open', 2], ['shell', 6], ['ram', 3], ['cartridge', 4], ['close', 2], ['prime', 1], ['lay', 4]),
    crew: 10, hp: 110, recoil: 0.7, runout: 4, sheaf: 30,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0008,
    ammo: { he: 110, shrapnel: 0 }, sig: 0.05, cd: 0.2,
    fuzes: ['instant', 'delay'],
  },
  bl6: {
    name: '6-inch 26 cwt howitzer', short: '6in', calibre: 6, mass: 45, shell: 'bl6',
    charges: [{ name: 'Charge 1', v: 187 }, { name: 'Charge 2', v: 250 }, { name: 'Charge 3', v: 313 }, { name: 'Charge 4', v: 373 }],
    elMin: D(5), elMax: D(45), restEl: D(25), loadEl: D(7.5), traverse: D(68),
    azRate: D(2.0), elRate: D(2.0),
    load: seq(['open', 1], ['shell', 2.5], ['ram', 1.5], ['cartridge', 2], ['close', 1.5], ['prime', 1.5], ['lay', 2]),
    crew: 8, hp: 70, recoil: 0.5, runout: 2.5, sheaf: 22,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0010,
    ammo: { he: 200, shrapnel: 0 }, sig: 0.035, cd: 0.2,
    fuzes: ['instant', 'delay'],
  },
  bl60: {
    name: '60-pounder', short: '60pdr', calibre: 5, mass: 27, shell: 'bl60',
    // the Mk I carriage stops at 21.5 degrees (the breech meets the trail above it); the charges are set so the
    // reach at 21.5 is what it was at 30 (Full about 11 km, the railyard just inside it)
    charges: [{ name: 'Reduced', v: 317 }, { name: 'Normal', v: 408 }, { name: 'Full', v: 508 }],
    elMin: D(4), elMax: D(21.5), restEl: D(15), loadEl: D(3.5), traverse: D(65),
    azRate: D(2.2), elRate: D(2.2),
    load: seq(['open', 1], ['shell', 2.5], ['ram', 1.5], ['cartridge', 1.5], ['close', 1], ['prime', 1], ['lay', 1.5]),
    crew: 8, hp: 55, recoil: 0.6, runout: 2, sheaf: 20,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0012,
    ammo: { he: 180, shrapnel: 90 }, sig: 0.035, cd: 0.2,
    fuzes: ['instant', 'delay', 'shrapnel'],
  },
  rail: {
    // The what-if British 18-inch railway howitzer on the "Boche-Buster" car (ordered 1918, proofed 1920 to 1921, never
    // fired in the war). Muzzle velocity 570 m/s on the top charge as the handbook gives; the game drag (cd) is
    // set so that charge reaches about 20 km at 40 degrees, the handbook's 20.4 km. Real traverse is 2 degrees on
    // the car and the rest by moving the car on its curved spur; the game folds both into one +-48 degree slew
    // at a slow 1.2 degrees a second (the spur curve and the shunting), so every site in the sector is reachable.
    // The cycle is about 90 s of game time (the real gun fired one round in four to six minutes). Crew 14 is the
    // men drawn at the car (the real crew was about 50).
    name: '18-inch railway howitzer', short: 'Rail', calibre: 18, mass: 1134, shell: 'rail',
    charges: [{ name: 'Charge 1', v: 340 }, { name: 'Charge 2', v: 450 }, { name: 'Charge 3', v: 570 }],
    elMin: D(10), elMax: D(40), restEl: D(30), loadEl: D(3.5), traverse: D(48),
    azRate: D(1.2), elRate: D(3.5),
    load: seq(['depress', 7], ['open', 6], ['shell', 24], ['ram', 13], ['cartridge', 18], ['close', 5], ['prime', 4], ['lay', 11]),
    crew: 14, hp: 170, recoil: 1.2, runout: 9, sheaf: 35,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0007,
    ammo: { he: 36, shrapnel: 0 }, sig: 0.1, cd: 0.32,
    fuzes: ['instant', 'delay'],
  },
};

// Shell effects by calibre: crater radius (the contract list), HE damage against soft and hard
// targets as { R: radius of effect, D: peak damage }, lethal radius against men in the open, and the
// wire cutting radius. German shells carry the same fields (they only damage pieces and crews).
export const SHELLS = {
  bl15: { calibre: 15, crater: 8, soft: { R: 60, D: 75 }, hard: { R: 30, D: 100 }, lethal: 52, wire: 40, pieceR: 60 },
  rail: { calibre: 18, crater: 10, soft: { R: 68, D: 85 }, hard: { R: 34, D: 120 }, lethal: 58, wire: 44, pieceR: 66 },
  bl92: { calibre: 9.2, crater: 5, soft: { R: 44, D: 50 }, hard: { R: 18, D: 55 }, lethal: 36, wire: 28, pieceR: 40 },
  bl6: { calibre: 6, crater: 3, soft: { R: 30, D: 28 }, hard: { R: 8, D: 14 }, lethal: 25, wire: 20, pieceR: 25 },
  bl60: { calibre: 5, crater: 2, soft: { R: 22, D: 20 }, hard: { R: 5, D: 6 }, lethal: 18, wire: 15, pieceR: 18 },
  // German (CB and harassing); damage fields apply to our pieces
  fh15: { calibre: 5.9, crater: 3, soft: { R: 26, D: 36 }, lethal: 25, pieceR: 26, enemy: true },
  m21: { calibre: 8.3, crater: 4.5, soft: { R: 34, D: 56 }, lethal: 33, pieceR: 36, enemy: true },
  fk77: { calibre: 3, crater: 1.5, soft: { R: 12, D: 12 }, lethal: 12, pieceR: 12, enemy: true },
};

// Fuze factors: 106 'instant' (graze, best for wire and men), 'delay' (buried, best against concrete and
// dumps), 'shrapnel' (airburst, 60-pdr only: men in the open, wire a little, the balloon).
export const FUZE = {
  instant: { soft: 1, hard: 0.7, men: 1, wire: 1, crater: 0.8 },
  delay: { soft: 1.1, hard: 1.45, men: 0.45, wire: 0.25, crater: 1.25 },
  shrapnel: { soft: 0.3, hard: 0.05, men: 2.0, wire: 0.45, crater: 0 },
};

// Targets: parts are laid out by targets.js around the site position. hp is per part.
export const TARGETS = {
  battery: { hardness: 'soft', parts: 4, partHp: 24, spread: 28, observer: 'air', score: 60, priority: 8 },
  mebu: { hardness: 'hard', parts: 1, partHp: 70, spread: 0, observer: 'foo', score: 40, priority: 5 },
  dump: { hardness: 'soft', parts: 5, partHp: 24, spread: 30, observer: 'air', score: 45, priority: 4 },
  balloon: { hardness: 'soft', parts: 2, partHp: 14, spread: 0, observer: 'foo', score: 30, priority: 3 },
  hq: { hardness: 'soft', parts: 3, partHp: 40, spread: 0, observer: 'air', score: 50, priority: 5 },
  crossroads: { hardness: 'soft', parts: 4, partHp: 18, spread: 55, observer: 'map', score: 35, priority: 4 },
  railyard: { hardness: 'soft', parts: 9, partHp: 18, spread: 90, observer: 'map', score: 60, priority: 5 },
};

// How many rounds per piece a fire for effect needs, by gun kind (what a sensible crew orders); the
// rest is dispersion. Index by target kind.
export const FFE = {
  bl15: { battery: 3, mebu: 4, dump: 3, hq: 3, balloon: 2, crossroads: 2, railyard: 3, wire: 2, sos: 3 },
  rail: { battery: 3, mebu: 4, dump: 3, hq: 3, balloon: 2, crossroads: 2, railyard: 4, wire: 2, sos: 3 },
  bl92: { battery: 5, mebu: 7, dump: 4, hq: 5, balloon: 2, crossroads: 3, railyard: 4, wire: 3, sos: 4 },
  bl6: { battery: 8, mebu: 12, dump: 6, hq: 8, balloon: 3, crossroads: 4, railyard: 5, wire: 6, sos: 6 },
  bl60: { battery: 8, mebu: 14, dump: 6, hq: 8, balloon: 3, crossroads: 4, railyard: 5, wire: 5, sos: 6 },
};

// Difficulty: err scales the first-round map error, cb the German counter-battery rate, dmg the damage to
// our pieces, assault the size of the German assaults, time the mission deadlines, ammo our supply,
// crew the AI crews' competence (1 = the tuned imperfect crews).
export const DIFFICULTY = {
  Easy: { err: 0.6, cb: 0.55, dmg: 0.5, assault: 0.7, time: 1.35, ammo: 1.5, sig: 0.6, zero: 0.5 },
  Normal: { err: 1, cb: 1.2, dmg: 1, assault: 1.15, time: 1, ammo: 1, sig: 1, zero: 0.6 },
  Hard: { err: 1.6, cb: 2.6, dmg: 1.8, assault: 1.9, time: 0.7, ammo: 0.8, sig: 1.5, zero: 0.7 },
};

// The game clock as a time lapse: sim seconds -> hour of day (a day and a night in about 38 minutes).
export const CLOCK_KEYS = [[0, 4.75], [330, 6.2], [900, 14.5], [1300, 19.5], [1850, 29.1], [2300, 30.7]];

// Request-for-fire phases (sim seconds): see director.js
export const PHASES = [
  { n: 1, title: 'Registration', sub: 'A quiet dawn. Range the guns on the first targets.', t0: 0 },
  { n: 2, title: 'The bombardment', sub: 'Pillboxes, batteries and dumps. The Germans will answer.', t0: 330 },
  { n: 3, title: 'The counter-attack', sub: 'Red rockets: every gun on the SOS lines.', t0: 900 },
  { n: 4, title: 'Night', sub: 'Harassing fire on the roads and the railhead.', t0: 1300 },
  { n: 5, title: 'Zero hour', sub: 'The creeping barrage. Lift it on the timetable.', t0: 1850 },
];

// The German guns, shells and targets of the WW2 mode join the same tables under their own kind names
// (tables_ww2.js); nothing British reads them.
Object.assign(GUNS, GUNS_WW2);
Object.assign(SHELLS, SHELLS_WW2);
Object.assign(TARGETS, TARGETS_WW2);
Object.assign(FFE, FFE_WW2);
// and those of the WW1 German mode (tables_ww1.js); the shared 42 cm row gains the WW1 targets beside its WW2 ones
Object.assign(GUNS, GUNS_WW1);
Object.assign(SHELLS, SHELLS_WW1);
Object.assign(TARGETS, TARGETS_WW1);
for (const [k, row] of Object.entries(FFE_WW1)) FFE[k] = { ...(FFE[k] ?? {}), ...row };

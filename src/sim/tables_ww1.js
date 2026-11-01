// German WW1 guns, their shells, the British targets and the British shells for the WW1 German mode (src/ww1/).
// Merged into the shared tables (tables.js) under their own kind names, like tables_ww2.js. Arcade values with
// period flavour: the real figures are in docs/WW1.md beside each game number and why it differs.
// Angles in radians, lengths in metres, times in seconds, masses in kg, calibres in inches (for fx and sound).
// The sim agent's rows: ranges checked with the integrator (shells.js rangeTable), `cd` set so the top charge gives
// the game range. The model agents' rigs match `loadEl` and the elevation limits (DESIGN.md "Models").
import { DEG } from '../sector.js';

const D = (d) => d * DEG;
const seq = (...a) => a.map(([step, dur]) => ({ step, dur }));
const IN = (mm) => mm / 25.4;

// Every row carries `metric: true` (metres and Strich on the console), `side: 'german'`, `era: 'ww1'` (1917 dress for
// the crews, render/crews_ww1.js) and `rowStep` (the range table's row spacing). The 42 cm M-Gerät is the shared
// `bertha` row of tables_ww2.js (about 12 km on its top charge).
export const GUNS_WW1 = {
  sfh13: {
    // 15 cm schwere Feldhaubitze 13: the standard heavy field howitzer, 42 kg shell, 377 m/s on the top of its seven
    // charges, about 8.6 to 8.9 km. Four of the charges are offered (1, 3, 5, 7). Real traverse 5 degrees (widened
    // for play), elevation -4 to +45.
    name: '15 cm sFH 13', short: '15 cm sFH', calibre: IN(149.1), mass: 42, shell: 'sfh13',
    charges: [{ name: 'Ladung 1', v: 190 }, { name: 'Ladung 3', v: 250 }, { name: 'Ladung 5', v: 315 }, { name: 'Ladung 7', v: 377 }],
    elMin: D(2), elMax: D(45), restEl: D(15), loadEl: D(5), traverse: D(60),
    azRate: D(2.2), elRate: D(2.2),
    load: seq(['open', 1], ['shell', 2.5], ['ram', 1.5], ['cartridge', 2], ['close', 1.5], ['prime', 1.5], ['lay', 2]),
    crew: 8, hp: 70, recoil: 0.5, runout: 2.5, sheaf: 25,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0010,
    ammo: { he: 200, shrapnel: 0 }, sig: 0.035, cd: 0.26, // top charge 8.8 km
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  m16: {
    // 21 cm Mörser 16: 113 kg shell, 393 m/s, 10.2 km (11.1 km with the long shell; the game gives the one shell the
    // longer reach). Elevation -6 to +70; the game lays on the low branch from +10. Real traverse 4 degrees.
    name: '21 cm Mörser 16', short: '21 cm', calibre: IN(211), mass: 113, shell: 'm16',
    charges: [{ name: 'Ladung 1', v: 200 }, { name: 'Ladung 3', v: 270 }, { name: 'Ladung 5', v: 335 }, { name: 'Ladung 6', v: 393 }],
    elMin: D(10), elMax: D(70), restEl: D(35), loadEl: D(3), traverse: D(58),
    azRate: D(1.6), elRate: D(3),
    load: seq(['depress', 3], ['open', 2], ['shell', 6], ['ram', 3], ['cartridge', 4], ['close', 2], ['prime', 1], ['lay', 4]),
    crew: 10, hp: 110, recoil: 0.7, runout: 4, sheaf: 30,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0008,
    ammo: { he: 110, shrapnel: 0 }, sig: 0.05, cd: 0.2, // top charge 11.1 km
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  k17: {
    // 10 cm Kanone 17: the answer to the British 60-pounder, 18.5 kg shell at 650 m/s to 16.5 km. Two charges; the
    // shrapnel round is for the traffic and the balloon. Real traverse 6 degrees, elevation -2 to +45.
    name: '10 cm K 17', short: '10 cm K', calibre: IN(105), mass: 18.5, shell: 'k17',
    charges: [{ name: 'Kleine Ladung', v: 450 }, { name: 'Große Ladung', v: 650 }],
    elMin: D(2), elMax: D(45), restEl: D(15), loadEl: D(3), traverse: D(60),
    azRate: D(2.4), elRate: D(2.4),
    load: seq(['open', 1], ['shell', 2], ['ram', 1.2], ['cartridge', 1.5], ['close', 1], ['prime', 1], ['lay', 1.5]),
    crew: 7, hp: 55, recoil: 0.6, runout: 2, sheaf: 22,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0012,
    ammo: { he: 180, shrapnel: 90 }, sig: 0.035, cd: 0.22, // 11 km small, 16.4 km big charge
    fuzes: ['instant', 'delay', 'shrapnel'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  max38: {
    // 38 cm SK L/45 "Langer Max" on its rail-and-bed mounting: the 750 kg HE shell at 800 m/s reached 34.2 km (the
    // 400 kg light shell 47.5 km emplaced; about 22 km at 18.5 degrees on rails). The game gives the bedded mounting's
    // elevation and traverse and the heavy shell's 34 km, which covers the whole map; the lower charges come down to
    // 6 km. Loaded at zero elevation, re-laid every shot.
    name: '38 cm SK L/45 "Langer Max"', short: '38 cm', calibre: IN(380), mass: 750, shell: 'max38',
    charges: [{ name: 'Hauptkartusche', v: 600 }, { name: '+ 1 Vorkartusche', v: 700 }, { name: '+ 2 Vorkartuschen', v: 800 }],
    elMin: D(5), elMax: D(45), restEl: D(20), loadEl: D(0), traverse: D(48),
    azRate: D(1.0), elRate: D(3),
    load: seq(['depress', 7], ['open', 6], ['shell', 24], ['ram', 13], ['cartridge', 18], ['close', 5], ['prime', 4], ['lay', 11]),
    crew: 14, hp: 170, recoil: 1.3, runout: 9, sheaf: 0,
    disp: { r: 0.0026, l: 0.0009 }, calib: { v: 0.0010, line: 0.0005 }, wearPerRound: 0.0012,
    ammo: { he: 30, shrapnel: 0 }, sig: 0.12, cd: 0.24, // 23.5, 28.7, 33.6 km
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  gamma: {
    // 42 cm Gamma-Mörser: the fixed fortress mortar on its bed, 1,160 kg shell, 452 m/s to 14.2 km, +43 to +75
    // degrees, 46 degrees of traverse. A mortar: it lays on the falling branch (`high`), steepest for the shortest
    // range; the game uses the real +43 to +75 (the model is clear from 0 to 78). Set up and ready (special.js 'gamma').
    // The ram is three strokes of the long staff (10 s).
    name: '42 cm Gamma-Mörser', short: '42 cm γ', calibre: IN(420), mass: 1160, shell: 'gamma',
    charges: [{ name: 'Ladung 1', v: 330 }, { name: 'Ladung 2', v: 380 }, { name: 'Ladung 3', v: 420 }, { name: 'Ladung 4', v: 452 }],
    elMin: D(43), elMax: D(75), restEl: D(45), loadEl: D(0), traverse: D(23), high: true,
    azRate: D(0.6), elRate: D(1.6),
    load: seq(['depress', 10], ['open', 4], ['shell', 18], ['ram', 10], ['cartridge', 10], ['close', 4], ['prime', 2], ['lay', 14]),
    crew: 14, hp: 220, recoil: 1.2, runout: 7, sheaf: 0,
    disp: { r: 0.0026, l: 0.0009 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0012,
    ammo: { he: 16, shrapnel: 0 }, sig: 0.14, cd: 0.45, // 7.0 to 8.8 km on Ladung 1 ... 11.1 to 14.1 km on Ladung 4
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100, special: 'gamma',
  },
  paris: {
    // Paris-Geschütz: 106 kg shell at 1,640 m/s, 50 to 55 degrees, about 130 km at most, a 182 s flight to a 40 km
    // apogee. The game flies the same integrator on the falling branch (`high`): 115.6 km at 55 degrees to 122.8 km
    // at 50 with a new barrel (apex about 49 km, flight about 200 s). Its target is off the map; the controller
    // (src/ww1/special.js) sets the shot's velocity from the charge against the bore's wear, adds the Earth's turning
    // and the wind aloft, flies it out of the map and reports where it fell. `wearPerRound` stays 0: the controller
    // owns the barrel's wear (65 rounds, then a new barrel).
    name: 'Paris-Geschütz', short: 'Paris', calibre: IN(211), mass: 106, shell: 'paris',
    charges: [{ name: 'Ladung (Rohr neu)', v: 1640 }],
    elMin: D(50), elMax: D(55), restEl: D(50), loadEl: D(0), traverse: D(30), high: true, // the racer's arc (the model's 36 degrees each way)
    azRate: D(0.5), elRate: D(1.2),
    load: seq(['depress', 20], ['open', 6], ['shell', 25], ['ram', 12], ['cartridge', 20], ['close', 6], ['prime', 4], ['lay', 30]),
    crew: 16, hp: 200, recoil: 1.6, runout: 12, sheaf: 0,
    disp: { r: 0.004, l: 0.0015 }, calib: { v: 0.0008, line: 0.0004 }, wearPerRound: 0.0,
    ammo: { he: 65, shrapnel: 0 }, sig: 0.2, cd: 0.032,
    fuzes: ['instant'], metric: true, side: 'german', era: 'ww1', rowStep: 1000, special: 'paris',
  },

  // ------------------------------------------------------------------ the tree's earlier and lighter batteries
  // (research.js TREES.de; positions on the ridge in ops.js RIDGE_MORE)
  fk16: {
    // 7.7 cm Feldkanone 16: the division's field gun, 7.2 kg shell, 545 to 600 m/s, about 10 km with the long shell.
    // Fixed rounds (the shell in its brass case): the loader swings the block, the round goes in in one movement.
    // Shrapnel with the time fuze was its first round over infantry. Real traverse 4 degrees, elevation -10 to +40.
    name: '7.7 cm FK 16', short: '7.7 cm FK', calibre: IN(77), mass: 7.2, shell: 'fk16',
    charges: [{ name: 'Abgekürzte Ladung', v: 420 }, { name: 'Volle Ladung', v: 600 }],
    elMin: D(2), elMax: D(40), restEl: D(10), loadEl: D(3), traverse: D(60),
    azRate: D(5), elRate: D(5),
    load: seq(['open', 0.6], ['shell', 1.4], ['ram', 0.6], ['close', 0.5], ['prime', 0.4], ['lay', 1.2]),
    crew: 6, hp: 40, recoil: 0.45, runout: 1.2, sheaf: 20,
    disp: { r: 0.0030, l: 0.0011 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0011,
    ammo: { he: 240, shrapnel: 160 }, sig: 0.022, cd: 0.334,
    fuzes: ['instant', 'shrapnel', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  k16: {
    // 15 cm Kanone 16 (Krupp): 51.4 kg shell at 757 m/s, about 22 km; the long gun that outranged every British
    // field piece. Travelled in two loads. Real traverse 8 degrees (widened for play), elevation -3 to +42.
    name: '15 cm K 16', short: '15 cm K', calibre: IN(149.3), mass: 51.4, shell: 'k16',
    charges: [{ name: 'Kleine Ladung', v: 520 }, { name: 'Mittlere Ladung', v: 640 }, { name: 'Große Ladung', v: 757 }],
    elMin: D(2), elMax: D(42), restEl: D(15), loadEl: D(3), traverse: D(60),
    azRate: D(1.8), elRate: D(2),
    load: seq(['open', 1.2], ['shell', 3], ['ram', 1.8], ['cartridge', 2.2], ['close', 1.2], ['prime', 1], ['lay', 2.5]),
    crew: 9, hp: 90, recoil: 0.8, runout: 3, sheaf: 28,
    disp: { r: 0.0027, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0012,
    ammo: { he: 130, shrapnel: 0 }, sig: 0.05, cd: 0.228,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  m99: {
    // 21 cm Mörser 99 (Krupp, about 1900): no recoil system. Two wooden ramps lie behind its wheels on the firing
    // platform: at the shot the wheels run up them and the gun rolls back down into position by its own weight. It
    // never comes back exactly where it was, and with no traversing gear the crew levers it back onto its line with
    // handspikes and lays it afresh by the aiming posts ('relay'), so every round carries a new laying error
    // (`runback`, guns.js): each one lands like a ranging round. 119 kg shell, about 6.8 to 8.3 km. Real rate about a
    // round in three minutes; here about one a minute. Real traverse none on the carriage (the whole gun levered round).
    name: '21 cm Mörser 99', short: '21 cm M99', calibre: IN(211), mass: 119, shell: 'm99',
    charges: [{ name: 'Ladung 1', v: 210 }, { name: 'Ladung 2', v: 255 }, { name: 'Ladung 3', v: 300 }],
    elMin: D(10), elMax: D(65), restEl: D(35), loadEl: D(5), traverse: D(58),
    azRate: D(1.2), elRate: D(2.2),
    load: seq(['depress', 3], ['relay', 28], ['open', 2], ['shell', 7], ['ram', 3], ['cartridge', 4], ['close', 2], ['prime', 1], ['lay', 9]),
    crew: 10, hp: 100, recoil: 2.4, runout: 2.2, sheaf: 30, // (runout: the roll back down the ramps)
    disp: { r: 0.0030, l: 0.0011 }, calib: { v: 0.0014, line: 0.0007 }, wearPerRound: 0.0008,
    runback: { r: 0.006, l: 0.0035 }, // the fresh lay after the roll back: one standard deviation in velocity and line
    ammo: { he: 90, shrapnel: 0 }, sig: 0.05, cd: 0.084,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  rk92: {
    // 15 cm Ringkanone C/92 (Krupp), the fortress and siege gun pulled out of the fortresses for the field when the
    // army ran short of heavy guns: no recoil system. Wooden ramps behind the wheels: at the shot the wheels run up
    // them and the gun rolls back down by its own weight; with no traversing gear it is levered back onto its line
    // and laid afresh after every shot ('relay'; `runback` as the Mörser 99's: each round falls like a ranging round).
    // 40 kg shell, 10.5 to 12 km (en.wikipedia "15 cm Ring Kanone C/92"); real rate 2 a minute, here about 3, and the
    // re-lay error smaller than the Mörser 99's: the career's first battery, it must carry threat level 1 alone (92 %
    // of 24 seeds, the K 17 96 %; with a 16 s re-lay and the Mörser's error 50 %). Charges and elevation [E].
    name: '15 cm Ringkanone C/92', short: '15 cm RK', calibre: IN(149.1), mass: 40, shell: 'rk92',
    charges: [{ name: 'Kleine Ladung', v: 360 }, { name: 'Große Ladung', v: 500 }],
    elMin: D(2), elMax: D(38), restEl: D(12), loadEl: D(3), traverse: D(58),
    azRate: D(1.4), elRate: D(2),
    load: seq(['relay', 9], ['open', 1], ['shell', 2.5], ['ram', 1.5], ['cartridge', 2], ['close', 1], ['prime', 1], ['lay', 2]),
    crew: 8, hp: 60, recoil: 1.6, runout: 2.2, sheaf: 24, // (runout: the roll back down the ramps)
    disp: { r: 0.0030, l: 0.0011 }, calib: { v: 0.0013, line: 0.0007 }, wearPerRound: 0.0012,
    runback: { r: 0.003, l: 0.002 },
    ammo: { he: 140, shrapnel: 40 }, sig: 0.045, cd: 0.26, // 8.1 km small, 12 km big charge
    fuzes: ['instant', 'delay', 'shrapnel'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  sfh93: {
    // 15 cm schwere Feldhaubitze 93, the sFH 13's grandfather: no recoil system (en.wikipedia "15 cm sFH 93": "in the
    // field, only ramps were used"; the wheels ran up wooden ramps and the gun came back by gravity, to be re-laid
    // after every shot). 870 still in store in 1914, taken to the front by the reserve Fußartillerie. 42 kg shell to
    // 6 km; real rate 2 a minute, here a little under. Charges and elevation [E].
    name: '15 cm sFH 93', short: '15 cm sFH 93', calibre: IN(149.1), mass: 42, shell: 'sfh93',
    charges: [{ name: 'Ladung 1', v: 170 }, { name: 'Ladung 2', v: 230 }, { name: 'Ladung 3', v: 290 }],
    elMin: D(2), elMax: D(55), restEl: D(15), loadEl: D(5), traverse: D(58),
    azRate: D(1.5), elRate: D(2.2),
    load: seq(['relay', 13], ['open', 1.2], ['shell', 3], ['ram', 1.8], ['cartridge', 2.2], ['close', 1.2], ['prime', 1], ['lay', 2.5]),
    crew: 8, hp: 60, recoil: 1.2, runout: 2.2, sheaf: 24,
    disp: { r: 0.0030, l: 0.0011 }, calib: { v: 0.0013, line: 0.0007 }, wearPerRound: 0.0010,
    runback: { r: 0.005, l: 0.003 },
    ammo: { he: 160, shrapnel: 0 }, sig: 0.04, cd: 0.278, // 2.5, 4.2 and 6 km
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100,
  },
  beta: {
    // 30.5 cm Beta-Gerät (the schwerer Küstenmörser on its siege bed, Krupp 1909): 410 kg shell, about 8.2 km, the
    // Beta 09 about 12 km with the light shell; the game gives one shell the longer reach. Fires from a steel bed
    // like the Gamma (special.js BedCtl, `rebed` beyond its arc), +40 to +75 degrees on the falling branch.
    name: '30.5 cm Beta-Gerät', short: '30.5 cm β', calibre: IN(305), mass: 410, shell: 'beta',
    charges: [{ name: 'Ladung 1', v: 270 }, { name: 'Ladung 2', v: 310 }, { name: 'Ladung 3', v: 345 }, { name: 'Ladung 4', v: 380 }],
    elMin: D(40), elMax: D(75), restEl: D(45), loadEl: D(0), traverse: D(30), high: true,
    azRate: D(0.8), elRate: D(1.8),
    load: seq(['depress', 8], ['open', 3], ['shell', 12], ['ram', 6], ['cartridge', 7], ['close', 3], ['prime', 2], ['lay', 10]),
    crew: 12, hp: 180, recoil: 1.0, runout: 5, sheaf: 0,
    disp: { r: 0.0026, l: 0.0009 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0011,
    ammo: { he: 30, shrapnel: 0 }, sig: 0.1, cd: 0.192,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 100, special: 'beta',
  },
  gotha: {
    // the Gotha strike (off-map support, sim/support.js): no piece in the field. A row for what reads a kind's GUNS row
    // (the hangar's figures, the crew's dress): the flight's 100 kg bombs, dropped at its speed; `launcher` as the V sites
    name: 'Gotha G.V', short: 'Gotha', calibre: 6, mass: 100, shell: 'gotha', charges: [{ name: 'Abwurf', v: 42 }],
    elMin: 0, elMax: 0, restEl: 0, loadEl: 0, traverse: 0, azRate: 0, elRate: 0, load: [],
    crew: 3, hp: 60, recoil: 0, runout: 1, sheaf: 0, disp: { r: 0, l: 0 }, calib: { v: 0, line: 0 }, wearPerRound: 0,
    ammo: { he: 12, shrapnel: 0 }, sig: 0, cd: 0.3, fuzes: ['instant'], metric: true, side: 'german', era: 'ww1', rowStep: 100, launcher: true,
  },
  smw: {
    // 25 cm schwerer Minenwerfer n.A. (1916): a short rifled muzzle-loader on its wheeled firing platform in a pit
    // behind the front trench, 97 kg bomb (47 kg of explosive), about 300 to 1,000 m. The charge goes down the muzzle
    // first, then the bomb, its studs in the rifling. Fires +45 to +75 degrees (`high`), the bomb slow and visible.
    // Wire, saps, the trenches opposite and the Sperrfeuer; nothing deeper. Real traverse 20 degrees on the platform (the game gives 50 either way: it covers the trenches opposite).
    name: '25 cm schwerer Minenwerfer', short: '25 cm sMW', calibre: IN(250), mass: 97, shell: 'smw',
    charges: [{ name: 'Ladung 1', v: 72 }, { name: 'Ladung 2', v: 88 }, { name: 'Ladung 3', v: 104 }],
    elMin: D(45), elMax: D(75), restEl: D(50), loadEl: D(45), traverse: D(50), high: true, // (widened for play: the pit's wall)
    azRate: D(3), elRate: D(3),
    load: seq(['cartridge', 3], ['shell', 9], ['ram', 3], ['prime', 2], ['lay', 4]),
    crew: 8, hp: 50, recoil: 0.25, runout: 1.2, sheaf: 30,
    disp: { r: 0.012, l: 0.009 }, calib: { v: 0.004, line: 0.002 }, wearPerRound: 0.0006,
    ammo: { he: 70, shrapnel: 0 }, sig: 0.03, cd: 0.382,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', era: 'ww1', rowStep: 25,
  },
};

// Shell effects (the British SHELLS layout). The British shells fired at us: the 18-pounder and 4.5-inch here; the
// heavier ones (bl6, bl60, bl92, bl15, rail) are the British game's own rows in tables.js.
export const SHELLS_WW1 = {
  sfh13: { calibre: IN(149.1), crater: 3, soft: { R: 30, D: 28 }, hard: { R: 8, D: 15 }, lethal: 25, wire: 20, pieceR: 25 },
  m16: { calibre: IN(211), crater: 5, soft: { R: 44, D: 50 }, hard: { R: 18, D: 58 }, lethal: 36, wire: 28, pieceR: 40 },
  k17: { calibre: IN(105), crater: 1.8, soft: { R: 22, D: 21 }, hard: { R: 5, D: 6 }, lethal: 20, wire: 15, pieceR: 20 },
  max38: { calibre: IN(380), crater: 9, soft: { R: 62, D: 78 }, hard: { R: 30, D: 110 }, lethal: 54, wire: 40, pieceR: 62 },
  gamma: { calibre: IN(420), crater: 11, soft: { R: 70, D: 95 }, hard: { R: 36, D: 140 }, deep: { R: 12, D: 140 }, lethal: 60, wire: 46, pieceR: 70 },
  paris: { calibre: IN(211), crater: 4, soft: { R: 36, D: 40 }, hard: { R: 10, D: 20 }, lethal: 30, wire: 0, pieceR: 30 },
  fk16: { calibre: IN(77), crater: 1.4, soft: { R: 12, D: 12 }, lethal: 14, wire: 10, pieceR: 12 }, // the 7.7 cm field gun (the career's battery, and the division's guns in director.js)
  k16: { calibre: IN(149.3), crater: 3, soft: { R: 30, D: 28 }, hard: { R: 8, D: 14 }, lethal: 25, wire: 18, pieceR: 25 },
  m99: { calibre: IN(211), crater: 5, soft: { R: 44, D: 50 }, hard: { R: 18, D: 56 }, lethal: 36, wire: 28, pieceR: 40 },
  rk92: { calibre: IN(149.1), crater: 3, soft: { R: 28, D: 26 }, hard: { R: 7, D: 12 }, lethal: 24, wire: 18, pieceR: 24 }, // the old 15 cm Granate, 40 kg
  sfh93: { calibre: IN(149.1), crater: 3, soft: { R: 29, D: 27 }, hard: { R: 8, D: 14 }, lethal: 24, wire: 19, pieceR: 24 },
  beta: { calibre: IN(305), crater: 7.5, soft: { R: 56, D: 68 }, hard: { R: 26, D: 100 }, deep: { R: 6, D: 90 }, lethal: 48, wire: 36, pieceR: 55 },
  smw: { calibre: IN(250), crater: 4.2, soft: { R: 34, D: 40 }, hard: { R: 12, D: 46 }, lethal: 32, wire: 60, pieceR: 32 }, // the big bomb's blast: wire and trenches
  gotha: { calibre: 6, crater: 3.4, soft: { R: 30, D: 38 }, hard: { R: 8, D: 20 }, lethal: 28, wire: 14, pieceR: 30 }, // a Gotha's 100 kg P.u.W. bomb (sim/support.js)
  b18: { calibre: 3.3, crater: 1.5, soft: { R: 14, D: 16 }, lethal: 14, pieceR: 14, enemy: true }, // British 18-pounder
  cooper: { calibre: 2.5, crater: 1.2, soft: { R: 14, D: 22 }, lethal: 12, pieceR: 14, enemy: true }, // a Camel's 25 lb Cooper bomb
  b45: { calibre: 4.5, crater: 2.2, soft: { R: 20, D: 26 }, lethal: 20, pieceR: 20, enemy: true }, // British 4.5-inch howitzer
};

// The British side (sides turned round on the game's Ypres map). parts must match models/t/ww1/layout_*.js.
export const TARGETS_WW1 = {
  bgun15: { hardness: 'soft', parts: 1, partHp: 60, spread: 0, observer: 'air', score: 120, priority: 8 }, // the 15-inch howitzer
  bgun92: { hardness: 'soft', parts: 2, partHp: 40, spread: 20, observer: 'air', score: 90, priority: 8 }, // 9.2-inch section
  bgun6: { hardness: 'soft', parts: 4, partHp: 24, spread: 28, observer: 'sound', score: 70, priority: 8 }, // 6-inch battery
  bgun60: { hardness: 'soft', parts: 2, partHp: 22, spread: 20, observer: 'sound', score: 60, priority: 8 }, // 60-pounder section
  bgunrail: { hardness: 'soft', parts: 1, partHp: 70, spread: 0, observer: 'air', score: 140, priority: 7 }, // 18-inch railway gun
  bfield: { hardness: 'soft', parts: 4, partHp: 20, spread: 28, observer: 'foo', score: 50, priority: 8 }, // 18-pounder battery
  btanks: { hardness: 'hard', parts: 4, partHp: 18, spread: 30, observer: 'foo', score: 70, priority: 7 }, // Mark IV laager
  bballoon: { hardness: 'soft', parts: 2, partHp: 14, spread: 0, observer: 'foo', score: 30, priority: 3 }, // kite balloon
  bdump: { hardness: 'soft', parts: 5, partHp: 24, spread: 30, observer: 'air', score: 45, priority: 4 },
  bpost: { hardness: 'soft', parts: 3, partHp: 12, spread: 14, observer: 'foo', score: 35, priority: 5 }, // a forward post: Lewis guns, a Stokes mortar
  bconvoy: { hardness: 'soft', parts: 4, partHp: 16, spread: 55, observer: 'map', score: 35, priority: 4 },
};

// rounds per piece a sensible German crew orders for effect, by target kind (and 'sos' for the Sperrfeuer).
// bertha's row is merged into the WW2 one (tables.js), not replaced.
const ALL = (n) => ({ bgun15: n, bgun92: n, bgun6: n, bgun60: n, bgunrail: n, bfield: n, btanks: n, bballoon: n, bdump: n, bconvoy: n, hq: n, railyard: n, sos: n, bpost: n });
// (the British side's kinds alone, and the concrete shelters of the career's battle: for the WW2 rows below)
const BRIT = (n) => ({ bgun15: n, bgun92: n, bgun6: n, bgun60: n, bgunrail: n, bfield: n, btanks: n, bballoon: n, bdump: n, bconvoy: n, mebu: n, bpost: n });
export const FFE_WW1 = {
  sfh13: { ...ALL(6), btanks: 7, bconvoy: 4, bballoon: 3, sos: 5 },
  m16: { ...ALL(4), bconvoy: 3, bballoon: 2, sos: 4 },
  k17: { ...ALL(6), bconvoy: 4, bballoon: 3, sos: 6 },
  bertha: { ...ALL(2), bconvoy: 1, bballoon: 1 },
  max38: ALL(1),
  gamma: ALL(1),
  paris: ALL(1),
  fk16: { ...ALL(8), btanks: 6, bconvoy: 5, bballoon: 4, mebu: 10, sos: 8 },
  k16: { ...ALL(5), bconvoy: 3, bballoon: 3, mebu: 6, sos: 5 },
  m99: { ...ALL(3), bconvoy: 2, bballoon: 1, mebu: 4, sos: 3 },
  rk92: { ...ALL(4), bconvoy: 3, bballoon: 2, mebu: 5, sos: 4 },
  sfh93: { ...ALL(4), btanks: 5, bconvoy: 3, bballoon: 2, mebu: 5, sos: 4 },
  beta: { ...ALL(2), bconvoy: 1, bballoon: 1, mebu: 2 },
  smw: { ...ALL(3), mebu: 4, sos: 4 },
  // the German career's WW2 batteries on the ridge (src/ww1/ops.js RIDGE_WW2), as their WW2 rows; merged into those
  // (tables.js), so without 'sos', 'hq' and 'railyard', which the WW2 rows give for both battles
  lefh18: { ...BRIT(8), btanks: 10, bdump: 6, bconvoy: 4, bballoon: 4 },
  sfh18: { ...BRIT(6), btanks: 7, bdump: 5, bconvoy: 4, bballoon: 3 },
  k18: { ...BRIT(5), btanks: 6, bdump: 4, bconvoy: 3, bballoon: 3 },
  mrs18: { ...BRIT(4), btanks: 5, bdump: 3, bconvoy: 3, bballoon: 2, mebu: 5 },
  nbw41: { ...BRIT(2), bconvoy: 1, bballoon: 1 },
  karl: BRIT(1),
  gustav: BRIT(1),
  k38: { ...BRIT(4), btanks: 5, bdump: 4, bconvoy: 3, bballoon: 2, mebu: 5 },
  hm1: { ...BRIT(2), bconvoy: 1, bballoon: 1 },
  bruno: { ...BRIT(2), bconvoy: 1, bballoon: 1 },
  k5: { ...BRIT(2), bconvoy: 1, bballoon: 1 },
  k12: { ...BRIT(2), bconvoy: 1, bballoon: 1 },
  wespe: { ...BRIT(8), btanks: 10, bdump: 6, bconvoy: 4, bballoon: 4 },
  hummel: { ...BRIT(6), btanks: 7, bdump: 5, bconvoy: 4, bballoon: 3 },
  nbw42: { ...BRIT(2), bconvoy: 1, bballoon: 1 },
  swg40: { ...BRIT(1), mebu: 2 },
};

// German WW2 guns, their shells, the Allied and Soviet targets and the enemy's shells for the WW2 mode (src/ww2/).
// Merged into the shared tables (tables.js) under their own kind names, so the integrator, the range tables,
// the loading cycle, the render layer and the console treat them like the British guns. Arcade values with
// period flavour: the real figures are in docs/WW2.md beside each game number and why it differs.
// Angles in radians, lengths in metres, times in seconds, masses in kg, calibres in inches (for fx and sound).
import { DEG } from '../sector.js';

const D = (d) => d * DEG;
const seq = (...a) => a.map(([step, dur]) => ({ step, dur }));
const IN = (mm) => mm / 25.4;

// Every German gun row carries `metric: true` (the console speaks metres and Strich), `side: 'german'`, and
// `rowStep` (the range table's row spacing, 100 m). `high: true` lays on the falling branch (the Karl-Gerät
// fires only above 55 degrees). `salvo` (the Nebelwerfer): one round is a ripple of n rockets, `dt` apart.
// `special` marks a unit whose readiness a WW2 controller holds (src/ww2/special.js): it cannot load or fire
// while `unit.gate` names a reason.
export const GUNS_WW2 = {
  lefh18: {
    name: '10.5 cm leFH 18', short: '10.5 cm', calibre: IN(105), mass: 14.8, shell: 'lefh18',
    // six charges (Ladungen 1 to 6); Ladung 6 gives 470 m/s and 10.7 km
    charges: [{ name: 'Ladung 1', v: 200 }, { name: 'Ladung 2', v: 230 }, { name: 'Ladung 3', v: 270 }, { name: 'Ladung 4', v: 320 }, { name: 'Ladung 5', v: 390 }, { name: 'Ladung 6', v: 470 }],
    elMin: D(2), elMax: D(42), restEl: D(12), loadEl: D(4), traverse: D(60),
    azRate: D(4), elRate: D(4),
    load: seq(['open', 0.8], ['shell', 2], ['ram', 1.2], ['cartridge', 1.6], ['close', 0.8], ['prime', 0.6], ['lay', 1.6]),
    crew: 6, hp: 50, recoil: 0.5, runout: 1.6, sheaf: 25,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0010,
    ammo: { he: 220, shrapnel: 60 }, sig: 0.03, cd: 0.215,
    fuzes: ['instant', 'delay', 'shrapnel'], metric: true, side: 'german', rowStep: 100,
  },
  sfh18: {
    name: '15 cm sFH 18', short: '15 cm sFH', calibre: IN(149), mass: 43.5, shell: 'sfh18',
    // eight charges in the real gun (7 and 8 wore the bore); the game offers five to 520 m/s and 13.3 km
    charges: [{ name: 'Ladung 1', v: 210 }, { name: 'Ladung 3', v: 280 }, { name: 'Ladung 5', v: 345 }, { name: 'Ladung 7', v: 450 }, { name: 'Ladung 8', v: 520 }],
    elMin: D(2), elMax: D(45), restEl: D(18), loadEl: D(4), traverse: D(60),
    azRate: D(2.6), elRate: D(2.6),
    load: seq(['open', 1], ['shell', 3], ['ram', 1.6], ['cartridge', 2.2], ['close', 1.2], ['prime', 1], ['lay', 2.2]),
    crew: 8, hp: 70, recoil: 0.6, runout: 2.2, sheaf: 30,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0010,
    ammo: { he: 180, shrapnel: 0 }, sig: 0.04, cd: 0.249,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  k18: {
    // the 17 cm Kanone 18 in Mörserlafette: the long-range counter-battery gun; the barrel and cradle recoil on
    // the top carriage and the top carriage on the lower (Doppelrücklauf). 925 m/s, 29.6 km on the top charge.
    name: '17 cm K 18', short: '17 cm', calibre: IN(172.5), mass: 62.8, shell: 'k18',
    charges: [{ name: 'Kleine Ladung', v: 560 }, { name: 'Mittlere Ladung', v: 740 }, { name: 'Große Ladung', v: 925 }],
    elMin: D(2), elMax: D(50), restEl: D(20), loadEl: D(0), traverse: D(60),
    // the carriage swings 16 degrees on its own; the rest is the whole gun turned on its firing platform (slow)
    azRate: D(1.2), elRate: D(2.4),
    load: seq(['depress', 4], ['open', 2], ['shell', 7], ['ram', 3], ['cartridge', 4], ['close', 2], ['prime', 1.5], ['lay', 5]),
    crew: 10, hp: 120, recoil: 1.3, runout: 4, sheaf: 30,
    disp: { r: 0.0026, l: 0.0009 }, calib: { v: 0.0011, line: 0.0006 }, wearPerRound: 0.0009,
    ammo: { he: 90, shrapnel: 0 }, sig: 0.06, cd: 0.169,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  mrs18: {
    // the 21 cm Mörser 18 on the same carriage: a heavy plunging shell against fieldworks and concrete
    name: '21 cm Mrs 18', short: '21 cm', calibre: IN(210.9), mass: 113, shell: 'mrs18',
    charges: [{ name: 'Ladung 1', v: 300 }, { name: 'Ladung 3', v: 400 }, { name: 'Ladung 5', v: 490 }, { name: 'Ladung 6', v: 565 }],
    elMin: D(8), elMax: D(70), restEl: D(30), loadEl: D(0), traverse: D(60),
    azRate: D(1.1), elRate: D(2.4),
    load: seq(['depress', 5], ['open', 2], ['shell', 8], ['ram', 3], ['cartridge', 4], ['close', 2], ['prime', 1.5], ['lay', 6]),
    crew: 10, hp: 120, recoil: 1.2, runout: 4, sheaf: 30,
    disp: { r: 0.0026, l: 0.0009 }, calib: { v: 0.0011, line: 0.0006 }, wearPerRound: 0.0008,
    ammo: { he: 80, shrapnel: 0 }, sig: 0.06, cd: 0.238,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  nbw41: {
    // the 15 cm Nebelwerfer 41: six tubes on a two-wheeled carriage, rockets ignited electrically from cover.
    // One "round" is a ripple of six; the crew reloads the tubes from behind (the rockets go in from the breech end).
    name: '15 cm Nebelwerfer 41', short: '15 cm NbW', calibre: IN(158.5), mass: 34, shell: 'nbw41',
    charges: [{ name: 'Wurfgranate 41', v: 340 }],
    elMin: D(5), elMax: D(45), restEl: D(25), loadEl: D(10), traverse: D(50),
    azRate: D(5), elRate: D(5),
    load: seq(['open', 2], ['shell', 30], ['prime', 6], ['lay', 3], ['cover', 5]),
    crew: 5, hp: 35, recoil: 0, runout: 1, sheaf: 60,
    disp: { r: 0.012, l: 0.007 }, calib: { v: 0.002, line: 0.001 }, wearPerRound: 0.0002,
    ammo: { he: 72, shrapnel: 0 }, sig: 0.11, cd: 0.251,
    fuzes: ['instant'], metric: true, side: 'german', rowStep: 100,
    salvo: { n: 6, dt: 1.6 }, rocket: { burn: 1.8 },
  },
  gustav: {
    // 80 cm Kanone (E) "Schwerer Gustav": no traverse of its own, it is laid for line by where it stands on the
    // curved firing track (the game slews it slowly through +-10 degrees: the shunting along the curve). A 4.8 t
    // Sprenggranate at 820 m/s reached 47 km; the 7.1 t Betongranate 38 km. Real cycle: 30 to 45 minutes.
    name: '80 cm K (E) Gustav', short: '80 cm', calibre: IN(800), mass: 4800, shell: 'gustav',
    charges: [{ name: 'Ladung 1', v: 560 }, { name: 'Ladung 2', v: 720 }, { name: 'Ladung 3', v: 820 }],
    elMin: D(10), elMax: D(48), restEl: D(40), loadEl: D(0), traverse: D(10),
    azRate: D(0.08), elRate: D(0.35),
    load: seq(['depress', 25], ['open', 12], ['shell', 70], ['ram', 30], ['cartridge', 50], ['close', 12], ['prime', 8], ['lay', 40]),
    crew: 24, hp: 600, recoil: 1.6, runout: 14, sheaf: 0,
    disp: { r: 0.0022, l: 0.0008 }, calib: { v: 0.0008, line: 0.0004 }, wearPerRound: 0.0035,
    ammo: { he: 8, shrapnel: 0 }, sig: 0.25, cd: 0.149,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100, special: 'gustav',
  },
  bertha: {
    // 42 cm M-Gerät "Dicke Bertha" (Krupp 1914): an alternate-history guest in the WW2 mode. The demo's own numbers
    // (src/bertha/ballistics.js): the 810 kg schwere Granate to about 9.3 km, here on four charges to about 12 km.
    name: '42 cm M-Gerät (Big Bertha)', short: '42 cm', calibre: 16.5, mass: 810, shell: 'bertha',
    charges: [{ name: '1 Vorkartusche', v: 300 }, { name: '2 Vorkartuschen', v: 330 }, { name: '3 Vorkartuschen', v: 360 }, { name: '4 Vorkartuschen', v: 390 }],
    elMin: D(20), elMax: D(65), restEl: D(40), loadEl: D(2), traverse: D(11.5),
    azRate: D(0.9), elRate: D(2.2),
    load: seq(['depress', 8], ['open', 3], ['shell', 14], ['ram', 5], ['cartridge', 8], ['close', 3], ['prime', 2], ['lay', 12]),
    crew: 12, hp: 200, recoil: 1.1, runout: 6, sheaf: 0,
    disp: { r: 0.0026, l: 0.0009 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0012,
    ammo: { he: 24, shrapnel: 0 }, sig: 0.12, cd: 0.25,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  karl: {
    // 60 cm Mörser Karl-Gerät 040: self-propelled, lowered onto the ground to fire, 4 degrees of traverse each
    // way (the rest by steering the whole vehicle), 55 to 70 degrees only. The 2,170 kg heavy shell reached about
    // 4.3 km, the 1,250 kg light one 6.6 km. Real cycle: about 10 minutes.
    name: '60 cm Karl-Gerät 040', short: '60 cm', calibre: IN(600), mass: 2170, shell: 'karl',
    charges: [{ name: 'Ladung 1', v: 185 }, { name: 'Ladung 2', v: 220 }, { name: 'Ladung 3 (leichte Gr.)', v: 283 }],
    elMin: D(55), elMax: D(70), restEl: D(60), loadEl: D(0), traverse: D(4), high: true,
    azRate: D(0.4), elRate: D(1.2),
    load: seq(['depress', 30], ['open', 6], ['shell', 30], ['ram', 10], ['cartridge', 10], ['close', 6], ['prime', 3], ['lay', 25]),
    crew: 18, hp: 260, recoil: 1.2, runout: 6, sheaf: 0,
    disp: { r: 0.0035, l: 0.0012 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0015,
    ammo: { he: 8, shrapnel: 0 }, sig: 0.2, cd: 0.36,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 50, special: 'karl',
  },
  // ------------------------------------------------------------------ the tree's later batteries (research.js TREES.de;
  // positions on the career's ridge in src/ww1/ops.js RIDGE_MORE)
  k38: {
    // 21 cm Kanone 38 (Krupp): 120 kg shell at 905 m/s, 33.9 km; on its own platform it turned all round. The
    // barrel travels on its own trailer. Few were built; the game gives it the long reach and a slow, heavy drill.
    name: '21 cm K 38', short: '21 cm K', calibre: IN(210.9), mass: 120, shell: 'k38',
    charges: [{ name: 'Kleine Ladung', v: 600 }, { name: 'Mittlere Ladung', v: 760 }, { name: 'Große Ladung', v: 905 }],
    elMin: D(2), elMax: D(50), restEl: D(20), loadEl: D(0), traverse: D(60),
    azRate: D(1.0), elRate: D(2.2),
    load: seq(['depress', 5], ['open', 2], ['shell', 9], ['ram', 4], ['cartridge', 5], ['close', 2], ['prime', 1.5], ['lay', 6]),
    crew: 12, hp: 140, recoil: 1.5, runout: 5, sheaf: 30,
    disp: { r: 0.0025, l: 0.0009 }, calib: { v: 0.0010, line: 0.0005 }, wearPerRound: 0.0010,
    ammo: { he: 70, shrapnel: 0 }, sig: 0.07, cd: 0.162,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  hm1: {
    // 35.5 cm Haubitze M1 (Rheinmetall, 1939): 575 kg HE (926 kg concrete-piercing) at 570 m/s, 20.8 km; +45 to +75
    // degrees, the shell swung up by the crane on its firing platform. A siege gun of the Maginot line and Sevastopol.
    name: '35.5 cm Haubitze M1', short: '35.5 cm', calibre: IN(356), mass: 575, shell: 'hm1',
    charges: [{ name: 'Ladung 1', v: 400 }, { name: 'Ladung 2', v: 460 }, { name: 'Ladung 3', v: 520 }, { name: 'Ladung 4', v: 570 }],
    elMin: D(45), elMax: D(75), restEl: D(50), loadEl: D(0), traverse: D(30), high: true,
    azRate: D(0.7), elRate: D(1.8),
    load: seq(['depress', 8], ['open', 3], ['shell', 14], ['ram', 5], ['cartridge', 8], ['close', 3], ['prime', 2], ['lay', 12]),
    crew: 14, hp: 220, recoil: 1.4, runout: 6, sheaf: 0,
    disp: { r: 0.0025, l: 0.0009 }, calib: { v: 0.0011, line: 0.0005 }, wearPerRound: 0.0010,
    ammo: { he: 22, shrapnel: 0 }, sig: 0.12, cd: 0.242,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  bruno: {
    // 28 cm Kurze Bruno K (E): the first of the 1930s railway guns, 240 kg shell at 820 m/s, 29.5 km. Barely any
    // traverse on its mount: it is laid for line by where it stands on a curved firing spur, so the game swings it
    // slowly (the shunting along the curve).
    name: '28 cm Kurze Bruno K (E)', short: '28 cm Bruno', calibre: IN(283), mass: 240, shell: 'bruno',
    charges: [{ name: 'Kleine Ladung', v: 560 }, { name: 'Mittlere Ladung', v: 700 }, { name: 'Große Ladung', v: 820 }],
    elMin: D(5), elMax: D(45), restEl: D(15), loadEl: D(0), traverse: D(14),
    azRate: D(0.12), elRate: D(2.2),
    load: seq(['depress', 6], ['open', 4], ['shell', 16], ['ram', 8], ['cartridge', 10], ['close', 4], ['prime', 2], ['lay', 10]),
    crew: 14, hp: 170, recoil: 1.4, runout: 7, sheaf: 0,
    disp: { r: 0.0025, l: 0.0009 }, calib: { v: 0.0010, line: 0.0005 }, wearPerRound: 0.0011,
    ammo: { he: 30, shrapnel: 0 }, sig: 0.1, cd: 0.195,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  k5: {
    // 28 cm K5 (E) (Krupp, 1937): 255 kg shell at 1,120 m/s, 62 km; the best railway gun of the war. The mount turns
    // only a degree or so; laid for line on a Vögele turntable, a ring of track the whole gun is run onto and turned on
    // (the game: any bearing, but slowly, about 0.4 degree a second; a target across the map costs minutes).
    name: '28 cm K5 (E)', short: '28 cm K5', calibre: IN(283), mass: 255, shell: 'k5',
    charges: [{ name: 'Ladung 1', v: 520 }, { name: 'Ladung 2', v: 720 }, { name: 'Ladung 3', v: 920 }, { name: 'Ladung 4', v: 1120 }],
    elMin: D(5), elMax: D(50), restEl: D(15), loadEl: D(0), traverse: D(180),
    azRate: D(0.4), elRate: D(2.4),
    load: seq(['depress', 7], ['open', 4], ['shell', 16], ['ram', 8], ['cartridge', 12], ['close', 4], ['prime', 2], ['lay', 10]),
    crew: 16, hp: 200, recoil: 1.5, runout: 7, sheaf: 0,
    disp: { r: 0.0023, l: 0.0008 }, calib: { v: 0.0009, line: 0.0004 }, wearPerRound: 0.0012,
    ammo: { he: 24, shrapnel: 0 }, sig: 0.12, cd: 0.086,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  k12: {
    // 21 cm K 12 (E) (Krupp, 1939): the longest-ranged gun of the war, 107.5 kg shell at 1,500 m/s, 115 km, fired
    // across the Channel. The longest barrel on rails (33.3 m), its mount raised on jacks to clear the breech at full
    // elevation. On this map it reaches everything from its siding far behind the ridge; the lower charges bring it in
    // to the British gun line. Laid for line on a curved spur, slowly, as the Bruno.
    name: '21 cm K 12 (E)', short: '21 cm K 12', calibre: IN(211), mass: 107.5, shell: 'k12',
    charges: [{ name: 'Ladung 1', v: 520 }, { name: 'Ladung 2', v: 780 }, { name: 'Ladung 3', v: 1100 }, { name: 'Hauptladung', v: 1500 }],
    elMin: D(5), elMax: D(55), restEl: D(20), loadEl: D(0), traverse: D(12),
    azRate: D(0.1), elRate: D(1.6),
    load: seq(['depress', 10], ['open', 4], ['shell', 14], ['ram', 9], ['cartridge', 14], ['close', 4], ['prime', 2], ['lay', 14]),
    crew: 16, hp: 180, recoil: 1.6, runout: 9, sheaf: 0,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0010, line: 0.0005 }, wearPerRound: 0.0016,
    ammo: { he: 20, shrapnel: 0 }, sig: 0.12, cd: 0.034,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100,
  },
  wespe: {
    // 10.5 cm leFH 18/2 auf Fgst. Panzerkampfwagen II "Wespe" (1943): the leFH 18 on a tank chassis, 32 rounds aboard.
    // The gun turns 17 degrees either way in its open fighting compartment; past that the driver turns the vehicle
    // (the game: any bearing, the hull pivoting on its tracks). Shoot and move: T drives it to its other position
    // before the counter-battery fire comes down (special.js MoveCtl).
    name: '10.5 cm Wespe', short: 'Wespe', calibre: IN(105), mass: 14.8, shell: 'wespe',
    charges: [{ name: 'Ladung 1', v: 200 }, { name: 'Ladung 2', v: 230 }, { name: 'Ladung 3', v: 270 }, { name: 'Ladung 4', v: 320 }, { name: 'Ladung 5', v: 390 }, { name: 'Ladung 6', v: 470 }],
    elMin: D(2), elMax: D(42), restEl: D(8), loadEl: D(4), traverse: D(180),
    azRate: D(9), elRate: D(4),
    load: seq(['open', 0.8], ['shell', 2.2], ['ram', 1.2], ['cartridge', 1.6], ['close', 0.8], ['prime', 0.6], ['lay', 1.8]),
    crew: 5, hp: 45, recoil: 0.5, runout: 1.6, sheaf: 25,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0010,
    ammo: { he: 160, shrapnel: 40 }, sig: 0.03, cd: 0.215,
    fuzes: ['instant', 'delay', 'shrapnel'], metric: true, side: 'german', rowStep: 100, special: 'move',
  },
  hummel: {
    // 15 cm sFH 18/1 auf Geschützwagen III/IV "Hummel" (1943): the sFH 18 on a tank chassis, 18 rounds aboard (an
    // ammunition carrier beside it). As the Wespe: the hull turns it past its 15 degrees, T moves it.
    name: '15 cm Hummel', short: 'Hummel', calibre: IN(149), mass: 43.5, shell: 'hummel',
    charges: [{ name: 'Ladung 1', v: 210 }, { name: 'Ladung 3', v: 280 }, { name: 'Ladung 5', v: 345 }, { name: 'Ladung 7', v: 450 }, { name: 'Ladung 8', v: 520 }],
    elMin: D(2), elMax: D(42), restEl: D(10), loadEl: D(4), traverse: D(180),
    azRate: D(7), elRate: D(2.6),
    load: seq(['open', 1], ['shell', 3.2], ['ram', 1.6], ['cartridge', 2.2], ['close', 1.2], ['prime', 1], ['lay', 2.4]),
    crew: 6, hp: 60, recoil: 0.6, runout: 2.2, sheaf: 30,
    disp: { r: 0.0028, l: 0.0010 }, calib: { v: 0.0012, line: 0.0006 }, wearPerRound: 0.0010,
    ammo: { he: 130, shrapnel: 0 }, sig: 0.04, cd: 0.249,
    fuzes: ['instant', 'delay'], metric: true, side: 'german', rowStep: 100, special: 'move',
  },
  nbw42: {
    // 21 cm Nebelwerfer 42: five tubes, 112.6 kg rockets at 320 m/s to 7.85 km. As the 15 cm: a ripple a round,
    // fired from cover, the tubes reloaded from behind; the smoke gives the battery away.
    name: '21 cm Nebelwerfer 42', short: '21 cm NbW', calibre: IN(210), mass: 112.6, shell: 'nbw42',
    charges: [{ name: 'Wurfgranate 42', v: 320 }],
    elMin: D(5), elMax: D(45), restEl: D(25), loadEl: D(10), traverse: D(50),
    azRate: D(4), elRate: D(4),
    load: seq(['open', 2], ['shell', 34], ['prime', 6], ['lay', 3], ['cover', 5]),
    crew: 6, hp: 40, recoil: 0, runout: 1, sheaf: 60,
    disp: { r: 0.011, l: 0.0065 }, calib: { v: 0.002, line: 0.001 }, wearPerRound: 0.0002,
    ammo: { he: 60, shrapnel: 0 }, sig: 0.12, cd: 0.233,
    fuzes: ['instant'], metric: true, side: 'german', rowStep: 100,
    salvo: { n: 5, dt: 1.8 }, rocket: { burn: 1.8 },
  },
  swg40: {
    // schweres Wurfgerät 40: four 28 cm Wurfkörper (82 kg, 50 kg of explosive) fired from their own wooden packing
    // crates laid on a frame, 145 m/s, 750 m to 1.9 km; an area drenched at short range. The crates are lifted onto
    // the frame by four men each. As the Nebelwerfer: a ripple a round, from cover.
    name: 'schweres Wurfgerät 40', short: 'sWG 40', calibre: IN(280), mass: 82, shell: 'swg40',
    charges: [{ name: 'Wurfkörper Spreng', v: 150 }],
    elMin: D(5), elMax: D(42), restEl: D(30), loadEl: D(30), traverse: D(50), // (the frames are turned by hand: wide for play)
    azRate: D(2), elRate: D(2),
    load: seq(['open', 2], ['shell', 36], ['prime', 6], ['lay', 3], ['cover', 5]),
    crew: 6, hp: 40, recoil: 0, runout: 1, sheaf: 50,
    disp: { r: 0.016, l: 0.010 }, calib: { v: 0.003, line: 0.0015 }, wearPerRound: 0.0001,
    ammo: { he: 40, shrapnel: 0 }, sig: 0.12, cd: 0.235,
    fuzes: ['instant'], metric: true, side: 'german', rowStep: 25,
    salvo: { n: 4, dt: 1.2 }, rocket: { burn: 1.2 },
  },
  // the V-weapon launch sites are units with a piece (for the site's model, its crew and the enemy's bombs) but no
  // loading cycle: their controller (src/ww2/special.js) runs the drill and launches; `launcher` marks them
  v1: {
    name: 'Walter catapult (V-1)', short: 'V-1', calibre: 22, mass: 2150, shell: 'v1', charges: [{ name: 'Katapult', v: 108 }],
    elMin: D(6), elMax: D(6), restEl: D(6), loadEl: D(6), traverse: 0, azRate: 0, elRate: 0, load: [],
    crew: 14, hp: 140, recoil: 0, runout: 1, sheaf: 0, disp: { r: 0, l: 0 }, calib: { v: 0, line: 0 }, wearPerRound: 0,
    ammo: { he: 6, shrapnel: 0 }, sig: 0.4, cd: 0.3, fuzes: ['instant'], metric: true, side: 'german', rowStep: 100, special: 'v1', launcher: true,
  },
  v2: {
    name: 'A4 firing table (V-2)', short: 'V-2', calibre: 26, mass: 12500, shell: 'v2', charges: [{ name: 'Brennschluß', v: 1600 }],
    elMin: D(89), elMax: D(89), restEl: D(89), loadEl: D(89), traverse: 0, azRate: 0, elRate: 0, load: [],
    crew: 14, hp: 120, recoil: 0, runout: 1, sheaf: 0, disp: { r: 0, l: 0 }, calib: { v: 0, line: 0 }, wearPerRound: 0,
    ammo: { he: 3, shrapnel: 0 }, sig: 0.5, cd: 0.3, fuzes: ['instant'], metric: true, side: 'german', rowStep: 100, special: 'v2', launcher: true,
  },
};

// Shell effects (the British SHELLS layout: crater radius, damage against soft and hard parts, lethal radius
// against men, wire, and pieceR, the radius at which an enemy shell harms a gun). `deep` is the reach against a
// target buried under rock or many metres of concrete (the Sevastopol magazine, fort casemates): only the
// heaviest delay-fuzed shells count there.
export const SHELLS_WW2 = {
  lefh18: { calibre: IN(105), crater: 1.8, soft: { R: 22, D: 21 }, hard: { R: 5, D: 6 }, lethal: 20, wire: 15, pieceR: 20 },
  sfh18: { calibre: IN(149), crater: 3, soft: { R: 30, D: 28 }, hard: { R: 8, D: 15 }, lethal: 25, wire: 20, pieceR: 25 },
  k18: { calibre: IN(172.5), crater: 3.4, soft: { R: 32, D: 32 }, hard: { R: 10, D: 20 }, lethal: 27, wire: 22, pieceR: 28 },
  mrs18: { calibre: IN(210.9), crater: 5, soft: { R: 44, D: 50 }, hard: { R: 18, D: 58 }, lethal: 36, wire: 28, pieceR: 40 },
  nbw41: { calibre: IN(158.5), crater: 2.2, soft: { R: 30, D: 22 }, hard: { R: 5, D: 6 }, lethal: 30, wire: 18, pieceR: 24 },
  gustav: { calibre: IN(800), crater: 16, soft: { R: 140, D: 220 }, hard: { R: 70, D: 420 }, deep: { R: 30, D: 600 }, lethal: 120, wire: 90, pieceR: 140 },
  bertha: { calibre: 16.5, crater: 9, soft: { R: 64, D: 80 }, hard: { R: 32, D: 125 }, deep: { R: 10, D: 120 }, lethal: 55, wire: 42, pieceR: 64 },
  karl: { calibre: IN(600), crater: 13, soft: { R: 100, D: 160 }, hard: { R: 50, D: 300 }, deep: { R: 22, D: 380 }, lethal: 90, wire: 70, pieceR: 100 },
  k38: { calibre: IN(210.9), crater: 4.6, soft: { R: 40, D: 44 }, hard: { R: 14, D: 40 }, lethal: 33, wire: 25, pieceR: 36 },
  hm1: { calibre: IN(356), crater: 8.5, soft: { R: 60, D: 76 }, hard: { R: 30, D: 120 }, deep: { R: 8, D: 110 }, lethal: 52, wire: 40, pieceR: 60 },
  bruno: { calibre: IN(283), crater: 6, soft: { R: 50, D: 58 }, hard: { R: 20, D: 70 }, lethal: 42, wire: 32, pieceR: 48 },
  k5: { calibre: IN(283), crater: 6, soft: { R: 50, D: 60 }, hard: { R: 20, D: 72 }, lethal: 42, wire: 32, pieceR: 48 },
  k12: { calibre: IN(211), crater: 4.5, soft: { R: 40, D: 44 }, hard: { R: 12, D: 34 }, lethal: 33, wire: 24, pieceR: 36 },
  wespe: { calibre: IN(105), crater: 1.8, soft: { R: 22, D: 21 }, hard: { R: 5, D: 6 }, lethal: 20, wire: 15, pieceR: 20 },
  hummel: { calibre: IN(149), crater: 3, soft: { R: 30, D: 28 }, hard: { R: 8, D: 15 }, lethal: 25, wire: 20, pieceR: 25 },
  nbw42: { calibre: IN(210), crater: 3.2, soft: { R: 38, D: 30 }, hard: { R: 7, D: 10 }, lethal: 36, wire: 24, pieceR: 30 },
  swg40: { calibre: IN(280), crater: 4.6, soft: { R: 46, D: 40 }, hard: { R: 14, D: 40 }, lethal: 42, wire: 40, pieceR: 38 },
  // the strategic weapons, for the burst only (they never meet the damage table: the strategic result is the score)
  v1: { calibre: 22, crater: 6, soft: { R: 80, D: 120 }, hard: { R: 30, D: 120 }, lethal: 70, wire: 0, pieceR: 0 },
  v2: { calibre: 26, crater: 12, soft: { R: 90, D: 140 }, hard: { R: 40, D: 160 }, lethal: 80, wire: 0, pieceR: 0 },
  // enemy shells (they harm our pieces only)
  q25: { calibre: 3.45, crater: 1.6, soft: { R: 15, D: 18 }, lethal: 15, pieceR: 15, enemy: true }, // British 25-pounder
  m55: { calibre: 5.5, crater: 2.8, soft: { R: 26, D: 34 }, lethal: 25, pieceR: 26, enemy: true }, // British 5.5-inch medium
  rp3: { calibre: 3.0, crater: 1.6, soft: { R: 16, D: 30 }, lethal: 14, pieceR: 16, enemy: true }, // Typhoon's 60 lb rocket
  bomb: { calibre: 9, crater: 4.5, soft: { R: 34, D: 60 }, lethal: 33, pieceR: 34, enemy: true }, // 500 lb bomb (Crossbow raids)
  s76: { calibre: 3, crater: 1.5, soft: { R: 12, D: 12 }, lethal: 12, pieceR: 12, enemy: true }, // Soviet 76 mm
  s122: { calibre: 4.8, crater: 2.4, soft: { R: 22, D: 26 }, lethal: 22, pieceR: 22, enemy: true }, // Soviet 122 mm
  s152: { calibre: 6, crater: 3, soft: { R: 28, D: 36 }, lethal: 26, pieceR: 28, enemy: true }, // Soviet 152 mm
};

// Targets of the WW2 operations. hardness 'soft' | 'hard' | 'deep' (deep: only a shell with a `deep` row and the
// delay fuze harms it). parts and partHp as the British TARGETS; models/t/layout.js places the parts.
export const TARGETS_WW2 = {
  // Flanders 1944 (Allied)
  abattery: { hardness: 'soft', parts: 4, partHp: 22, spread: 28, observer: 'air', score: 60, priority: 8 }, // 25-pounders
  amedium: { hardness: 'soft', parts: 4, partHp: 28, spread: 30, observer: 'sound', score: 70, priority: 8 }, // 5.5-inch mediums
  tanks: { hardness: 'hard', parts: 5, partHp: 16, spread: 30, observer: 'foo', score: 70, priority: 7 }, // Sherman laager
  adump: { hardness: 'soft', parts: 5, partHp: 22, spread: 30, observer: 'air', score: 45, priority: 4 },
  aconvoy: { hardness: 'soft', parts: 4, partHp: 16, spread: 55, observer: 'map', score: 35, priority: 4 },
  aop: { hardness: 'soft', parts: 3, partHp: 12, spread: 30, observer: 'foo', score: 40, priority: 6 }, // Auster AOP strip
  // Sevastopol 1942 (Soviet)
  turret: { hardness: 'hard', parts: 2, partHp: 140, spread: 0, observer: 'air', score: 220, priority: 9 }, // armoured 305 mm turrets
  fort: { hardness: 'hard', parts: 3, partHp: 90, spread: 0, observer: 'air', score: 150, priority: 7 },
  magazine: { hardness: 'deep', parts: 1, partHp: 300, spread: 0, observer: 'air', score: 300, priority: 9 }, // under the cliff
  sbattery: { hardness: 'soft', parts: 4, partHp: 22, spread: 28, observer: 'air', score: 60, priority: 8 },
  // Brest-Litovsk 1941 (Soviet garrison in the 19th-century fortress)
  citadel: { hardness: 'hard', parts: 4, partHp: 70, spread: 0, observer: 'foo', score: 120, priority: 7 }, // ring barracks
  gate: { hardness: 'hard', parts: 1, partHp: 110, spread: 0, observer: 'foo', score: 120, priority: 8 },
  eastfort: { hardness: 'hard', parts: 3, partHp: 90, spread: 0, observer: 'foo', score: 150, priority: 7 },
};

// rounds per piece a sensible German crew orders for effect, by target kind (and 'sos' for the Sperrfeuer)
const T = (o) => o;
export const FFE_WW2 = {
  lefh18: T({ abattery: 8, amedium: 8, tanks: 10, adump: 6, aconvoy: 4, aop: 4, hq: 8, railyard: 5, sbattery: 8, citadel: 12, gate: 12, eastfort: 12, fort: 12, turret: 12, magazine: 1, sos: 6 }),
  sfh18: T({ abattery: 6, amedium: 6, tanks: 7, adump: 5, aconvoy: 4, aop: 3, hq: 6, railyard: 5, sbattery: 6, citadel: 8, gate: 8, eastfort: 8, fort: 8, turret: 8, magazine: 1, sos: 5 }),
  k18: T({ abattery: 5, amedium: 5, tanks: 6, adump: 4, aconvoy: 3, aop: 3, hq: 5, railyard: 4, sbattery: 5, citadel: 6, gate: 6, eastfort: 6, fort: 6, turret: 6, magazine: 1, sos: 4 }),
  mrs18: T({ bunker: 5, abattery: 4, amedium: 4, tanks: 5, adump: 3, aconvoy: 3, aop: 2, hq: 4, railyard: 3, sbattery: 4, citadel: 5, gate: 4, eastfort: 5, fort: 5, turret: 5, magazine: 1, sos: 4 }),
  nbw41: T({ abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 3 }),
  gustav: T({ bunker: 1, abattery: 1, amedium: 1, tanks: 1, adump: 1, aconvoy: 1, aop: 1, hq: 1, railyard: 1, sbattery: 1, citadel: 1, gate: 1, eastfort: 1, fort: 1, turret: 1, magazine: 1, sos: 1 }),
  bertha: T({ abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 2 }),
  karl: T({ bunker: 1, abattery: 1, amedium: 1, tanks: 1, adump: 1, aconvoy: 1, aop: 1, hq: 1, railyard: 1, sbattery: 1, citadel: 1, gate: 1, eastfort: 1, fort: 1, turret: 1, magazine: 1, sos: 1 }),
  k38: T({ abattery: 4, amedium: 4, tanks: 5, adump: 4, aconvoy: 3, aop: 2, hq: 4, railyard: 4, sbattery: 4, citadel: 5, gate: 5, eastfort: 5, fort: 5, turret: 5, magazine: 1, sos: 3 }),
  hm1: T({ bunker: 2, abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 2 }),
  bruno: T({ bunker: 2, abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 1 }),
  k5: T({ bunker: 2, abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 1 }),
  k12: T({ bunker: 1, abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 1 }),
  wespe: T({ abattery: 8, amedium: 8, tanks: 10, adump: 6, aconvoy: 4, aop: 4, hq: 8, railyard: 5, sbattery: 8, citadel: 12, gate: 12, eastfort: 12, fort: 12, turret: 12, magazine: 1, sos: 6 }),
  hummel: T({ abattery: 6, amedium: 6, tanks: 7, adump: 5, aconvoy: 4, aop: 3, hq: 6, railyard: 5, sbattery: 6, citadel: 8, gate: 8, eastfort: 8, fort: 8, turret: 8, magazine: 1, sos: 5 }),
  nbw42: T({ abattery: 2, amedium: 2, tanks: 2, adump: 2, aconvoy: 1, aop: 1, hq: 2, railyard: 2, sbattery: 2, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 3 }),
  swg40: T({ abattery: 1, amedium: 1, tanks: 1, adump: 1, aconvoy: 1, aop: 1, hq: 1, railyard: 1, sbattery: 1, citadel: 2, gate: 2, eastfort: 2, fort: 2, turret: 2, magazine: 1, sos: 2 }),
};

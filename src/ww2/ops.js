// The WW2 mode's operations: where each happens on the shared map, which German units serve in it, its targets,
// its phases and its words. Plain data and pure functions (Node-safe). The weapons never served together, so each
// operation is a separate scenario with its own place and year; `history` says what is real and what is not.
//
// The map is the game's one stage (the Ypres salient of 1917 and the country around it). The Flanders battle uses
// the salient itself with the sides turned round: the German batteries stand on the ridge where the WW1 German
// batteries stood and fire west at the Allied gun line, which sits in the British gun pits. The other operations
// stand in the open, undisturbed country 25 km and more west of the salient (terrainHeight.js "far country"), so
// none of them shows the 1917 craters.
import { DEG } from '../sector.js';

const P = (x, z) => ({ x, z });

// unit definitions follow sector.js UNITS: id, kind, name, callsign, battery, pos, zero (bearing of the zero line),
// pieces [{ kind, dx, dz }]; plus `role` (what the unit is for), `note` (shown on the console), `alt` (an
// alternate-history label shown wherever the unit is), `special` (a controller in special.js gates it).
const LEFH = (id, pos, zero, callsign = 'Anton') => ({
  id, kind: 'lefh18', name: '10.5 cm leFH 18', callsign, battery: '1. Batterie, leichte Abteilung', pos, zero,
  pieces: [{ kind: 'lefh18', dx: 0, dz: -45 }, { kind: 'lefh18', dx: 4, dz: -15 }, { kind: 'lefh18', dx: 2, dz: 15 }, { kind: 'lefh18', dx: -3, dz: 45 }],
  role: 'Field howitzers: quick, plentiful, the support fire and the Sperrfeuer. Shrapnel-like airbursts (Doppelzünder) over infantry.',
});
const SFH = (id, pos, zero, callsign = 'Bruno') => ({
  id, kind: 'sfh18', name: '15 cm sFH 18', callsign, battery: '4. Batterie, schwere Abteilung', pos, zero,
  pieces: [{ kind: 'sfh18', dx: 0, dz: -54 }, { kind: 'sfh18', dx: 5, dz: -18 }, { kind: 'sfh18', dx: 2, dz: 18 }, { kind: 'sfh18', dx: -4, dz: 54 }],
  role: 'Heavy howitzers, the backbone: batteries, tank assemblies, dumps, strongpoints.',
});
const MRS = (id, pos, zero, callsign = 'Emil') => ({
  id, kind: 'mrs18', name: '21 cm Mrs 18', callsign, battery: 'schwere Artillerie-Abteilung (mot.)', pos, zero,
  pieces: [{ kind: 'mrs18', dx: 0, dz: -30 }, { kind: 'mrs18', dx: 3, dz: 30 }],
  role: 'Heavy mortars: plunging 113 kg shells against concrete, HQs and deep dugouts.',
});

export const OPS = {
  // ------------------------------------------------------------------ the backbone battle
  flanders: {
    id: 'flanders', title: 'Flanders, autumn 1944', short: 'Flanders 1944',
    sub: 'An Artillerie-Kommandeur\'s group holds the old Ypres ridge against a British and Canadian attack.',
    blurb: 'Seven German units on the ridge where the 1917 German batteries stood: field and heavy howitzers, the long 17 cm gun, the 21 cm mortars, the Nebelwerfer, and two alternate-history guests, the Gustav railway gun and Big Bertha. Counter-battery fire against the Allied gun line, Sperrfeuer when their infantry comes, a Feuerwalze for our own counter-attack.',
    history: 'A fictional engagement, staged on the game\'s 1917 Ypres map (its WW1 craters and trenches are kept). It is modelled on the German rearguard battles in Flanders and on the Scheldt in September and October 1944. Every gun but two served there: the Gustav railway gun never fired in the West, and Big Bertha is a 1914 to 1918 weapon; both are labelled as alternate history.',
    kind: 'battle', enemy: 'british', clockStart: 5.25,
    units: [
      LEFH(1, P(7200, -2600), 270 * DEG),
      SFH(2, P(8100, 1500), 265 * DEG),
      {
        id: 3, kind: 'k18', name: '17 cm K 18', callsign: 'Cäsar', battery: 'schwere Artillerie-Abteilung 768 (fict.)',
        pos: P(9300, -600), zero: 272 * DEG, pieces: [{ kind: 'k18', dx: 0, dz: -32 }, { kind: 'k18', dx: 3, dz: 32 }],
        role: 'Long-range guns: counter-battery against the Allied mediums, the railhead, the HQ and the AOP strip.',
      },
      MRS(4, P(7600, 3800), 262 * DEG),
      {
        id: 5, kind: 'nbw41', name: '15 cm Nebelwerfer 41', callsign: 'Fritz', battery: 'Werfer-Batterie',
        pos: P(5700, -500), zero: 270 * DEG, pieces: [{ kind: 'nbw41', dx: 0, dz: -22 }, { kind: 'nbw41', dx: 2, dz: 0 }, { kind: 'nbw41', dx: -1, dz: 22 }],
        role: 'Rocket launchers: six-rocket ripples that drench an area. Short range, slow to reload, and the smoke gives the battery away.',
      },
      {
        id: 6, kind: 'gustav', name: '80 cm Schwerer Gustav', callsign: 'Gustav', battery: 'schwere Artillerie-Abteilung (E) 672',
        pos: P(13500, 600), zero: 268 * DEG, pieces: [{ kind: 'gustav', dx: 0, dz: 0 }], special: 'gustav',
        role: 'The railway slot: a 1,350 t gun that must be built on its curved track before it can fire, with a handful of 4.8 t shells.',
        alt: 'Alternate history: the Gustav never fired in the West (it served at Sevastopol in 1942).',
        ammo: 8,
      },
      {
        id: 7, kind: 'bertha', name: '42 cm Big Bertha', callsign: 'Bertha', battery: 'kurze Marinekanone-Batterie (M-Gerät)',
        pos: P(10000, -2600), zero: 268 * DEG, pieces: [{ kind: 'bertha', dx: 0, dz: 0 }],
        role: 'The 1914 siege howitzer: 810 kg shells against the hardest targets in reach.',
        alt: 'Alternate history: Big Bertha is a First World War weapon (1914 to 1918), here as a guest.',
      },
    ],
    // the Allied side: batteries in the British gun pits, the AOP strip, tanks, dumps, the HQ, traffic and the railhead
    sites: [
      { id: 'A1', kind: 'abattery', name: '25-pdr battery "Able"', pos: P(400, -1300), bearing: 95 * DEG, r: 60 },
      { id: 'A2', kind: 'amedium', name: '5.5-inch battery "Baker"', pos: P(-600, 900), bearing: 88 * DEG, r: 60 },
      { id: 'A3', kind: 'abattery', name: '25-pdr battery "Charlie"', pos: P(900, 1800), bearing: 85 * DEG, r: 60 },
      { id: 'A4', kind: 'amedium', name: '5.5-inch battery "Dog"', pos: P(-1800, -400), bearing: 92 * DEG, r: 60 },
      { id: 'T1', kind: 'tanks', name: 'Tank laager, Wieltje', pos: P(1500, -2500), bearing: 90 * DEG, r: 40 },
      { id: 'T2', kind: 'tanks', name: 'Tank laager, Hooge', pos: P(2300, 2900), bearing: 80 * DEG, r: 40 },
      { id: 'D1', kind: 'adump', name: 'Supply dump, Potijze', pos: P(-300, -2900), bearing: 0, r: 45 },
      { id: 'D2', kind: 'adump', name: 'Supply dump, Zillebeke', pos: P(-1300, 3600), bearing: 30 * DEG, r: 45 },
      { id: 'O1', kind: 'aop', name: 'AOP strip', pos: P(-2400, -3800), bearing: 0, r: 40 },
      { id: 'H1', kind: 'hq', name: 'Brigade HQ, Ypres ramparts', pos: P(-1300, 2200), bearing: 80 * DEG, r: 40 },
      { id: 'X1', kind: 'aconvoy', name: 'Hellfire Corner', pos: P(1500, 300), bearing: 0, r: 30 },
      { id: 'R1', kind: 'railyard', name: 'Railhead, Vlamertinghe line', pos: P(-3430, -2700), bearing: 0, r: 120 },
    ],
    phases: [
      { n: 1, t0: 0, title: 'Einschießen', sub: 'Dawn. Register the batteries on the first targets.' },
      { n: 2, t0: 330, title: 'The Allied build-up', sub: 'Counter-battery, the AOP, the tanks forming up. Their mediums will answer.' },
      { n: 3, t0: 900, title: 'The attack', sub: 'Red flares from our front: Sperrfeuer on the lanes.' },
      { n: 4, t0: 1300, title: 'Night', sub: 'Störungsfeuer on their roads and the railhead.' },
      { n: 5, t0: 1850, title: 'Gegenangriff', sub: 'Our counter-attack at first light: the Feuerwalze. Lift it on time.' },
    ],
    clock: [[0, 5.25], [330, 6.5], [900, 14.5], [1300, 19.5], [1850, 29.2], [2300, 30.7]],
  },

  // ------------------------------------------------------------------ the Gustav at Sevastopol
  sevastopol: {
    id: 'sevastopol', title: 'Sevastopol, June 1942', short: 'Sevastopol 1942',
    sub: 'Build the Gustav on its firing curve at Bakhchisaray, then spend its few shells on the fortress.',
    blurb: 'The 80 cm Gustav arrives in pieces on five trains. Lay the curved double track, assemble it with the gantry cranes, bring up the ammunition train and the flak, then fire: each 4.8 t shell is precious. A 21 cm Mörser battery supports. Targets: the Maxim Gorky coastal battery, Fort Stalin, Fort Molotov, the White Cliff magazine.',
    history: 'Historical: the Gustav fired 48 rounds at Sevastopol from 5 to 17 June 1942 from a position near Bakhchisaray, about 25 km from its targets. Preparing the position took weeks and thousands of men; the game compresses it to minutes. The ground is the game\'s generic country, not the Crimea, and the targets are stylised.',
    kind: 'gustav', enemy: 'soviet', clockStart: 8,
    units: [
      {
        id: 1, kind: 'gustav', name: '80 cm Schwerer Gustav', callsign: 'Gustav', battery: 'schwere Artillerie-Abteilung (E) 672',
        pos: P(-27000, -16000), zero: 180 * DEG, pieces: [{ kind: 'gustav', dx: 0, dz: 0 }], special: 'gustav', ammo: 10,
        role: 'Build the position, then destroy the fortress\'s hardest works with as few shells as you can.',
      },
      { ...MRS(2, P(-26200, -3000), 180 * DEG, 'Emil'), role: 'Support: the field works and batteries the Gustav should not waste shells on.' },
    ],
    sites: [
      { id: 'G1', kind: 'turret', name: 'Coastal battery "Maxim Gorky I"', pos: P(-29500, 10500), bearing: 0, r: 40 },
      { id: 'G2', kind: 'fort', name: 'Fort Stalin', pos: P(-25500, 8200), bearing: 0, r: 40 },
      { id: 'G3', kind: 'fort', name: 'Fort Molotov', pos: P(-23500, 9600), bearing: 10 * DEG, r: 40 },
      { id: 'G4', kind: 'magazine', name: 'White Cliff magazine', pos: P(-27600, 12400), bearing: 350 * DEG, r: 30 },
      { id: 'G5', kind: 'sbattery', name: 'Soviet battery (122 mm)', pos: P(-26800, 6800), bearing: 0, r: 60 },
      { id: 'G6', kind: 'sbattery', name: 'Soviet battery (152 mm)', pos: P(-24200, 7000), bearing: 350 * DEG, r: 60 },
    ],
    phases: [
      { n: 1, t0: 0, title: 'Railway preparation', sub: 'Survey, track, cranes, assembly, ammunition, flak.' },
      { n: 2, t0: 600, title: 'The bombardment', sub: 'The Storch spots for the Gustav. Every shell counts.' },
    ],
    clock: [[0, 8], [600, 10], [2400, 19]],
  },

  // ------------------------------------------------------------------ the Karl-Gerät at Brest-Litovsk
  karl: {
    id: 'karl', title: 'Brest-Litovsk, 22 June 1941', short: 'Karl-Gerät, Brest 1941',
    sub: 'Bring the 60 cm Karl "Thor" into action against the Brest Fortress.',
    blurb: 'Drive the 124 t Karl into its firing position, steer it onto the target (it traverses only 4 degrees each way), lower the hull onto the ground, and load 2.2 t shells from the Munitionsschlepper\'s crane. An sFH 18 battery supports. Targets: the citadel\'s ring barracks, the Terespol gate, the Eastern Fort.',
    history: 'Historical in outline: two Karl-Geräte of schwere Artillerie-Abteilung 833 fired on the Brest Fortress from 22 June 1941. The approach, the positions and the targets\' layout are the game\'s, on its generic country.',
    kind: 'karl', enemy: 'soviet', clockStart: 3.25,
    units: [
      {
        id: 1, kind: 'karl', name: '60 cm Karl-Gerät "Thor"', callsign: 'Thor', battery: 'schwere Artillerie-Abteilung 833',
        pos: P(-24500, 30000), zero: 270 * DEG, pieces: [{ kind: 'karl', dx: 0, dz: 0 }], special: 'karl', ammo: 12,
        role: 'Siege mortar: 2.2 t concrete-piercing shells at 4 km. Emplace, load by crane, fire, displace when they find you.',
      },
      SFH(2, P(-21500, 32500), 270 * DEG, 'Bruno'),
    ],
    sites: [
      { id: 'K1', kind: 'citadel', name: 'Citadel ring barracks', pos: P(-28400, 29600), bearing: 90 * DEG, r: 80 },
      { id: 'K2', kind: 'gate', name: 'Terespol gate', pos: P(-28050, 30700), bearing: 90 * DEG, r: 15 },
      { id: 'K3', kind: 'eastfort', name: 'Eastern Fort', pos: P(-27900, 28000), bearing: 80 * DEG, r: 50 },
      { id: 'K4', kind: 'sbattery', name: 'Soviet battery (76 mm)', pos: P(-28700, 31600), bearing: 90 * DEG, r: 50 },
    ],
    // where the Karl may go into action (the player picks one): distance in m from the start and what it gives
    positions: [
      { id: 'a', name: 'Stellung A, edge of the wood', pos: P(-24900, 29900), cover: 0.8, note: 'covered, 3.6 km to the citadel' },
      { id: 'b', name: 'Stellung B, the railway embankment', pos: P(-24400, 30900), cover: 0.6, note: 'open, 4.0 km, the gate in reach' },
      { id: 'c', name: 'Stellung C, the farm', pos: P(-24600, 28600), cover: 0.7, note: 'half covered, the Eastern Fort at 3.4 km' },
    ],
    phases: [
      { n: 1, t0: 0, title: 'Into action', sub: 'Drive to a position, lay, lower the hull.' },
      { n: 2, t0: 240, title: 'The bombardment', sub: 'Concrete-piercing shells on the fortress works.' },
    ],
    clock: [[0, 3.25], [240, 4.5], [2400, 13]],
  },

  // ------------------------------------------------------------------ the strategic weapons
  v1: {
    id: 'v1', title: 'V-1 launch site, autumn 1944', short: 'V-1 (Fi 103)',
    sub: 'Flak-Regiment 155 (W): prepare and launch flying bombs at the port of Antwerp.',
    blurb: 'At a launch site in the woods: bring the missile from the store, fit the wings, align its compass in the Richthaus, set the air log for the range, fuel it, charge the steam generator, clear the ramp and fire the catapult. Then follow it out: fighters and the anti-aircraft belt wait on its route. Allied bombers come for the site.',
    history: 'Historical in outline (the Walter steam catapult, the compass alignment, the air-log range setting, the Flak-Regiment 155 (W)). The V-1 was chiefly a weapon against cities: about 10,000 were fired at England and thousands at Antwerp, killing thousands of civilians. The game sets the target as the port of Antwerp, scores only the launch drill and whether the missile reached the target area, and never counts casualties.',
    kind: 'v1', enemy: 'british', clockStart: 7,
    units: [{
      id: 1, kind: 'v1', name: 'Walter catapult (V-1)', callsign: 'Kirschkern', battery: 'Flak-Regiment 155 (W), Feuerstellung',
      pos: P(-28000, 2000), zero: 265 * DEG, pieces: [{ kind: 'v1', dx: 0, dz: 0 }], special: 'v1', ammo: 5,
      role: 'The launch crew: prepare each flying bomb by the drill and launch it. Mistakes crash it on the ramp or send it astray.',
    }],
    sites: [],
    target: { name: 'Port of Antwerp', dist: 160000, bearing: 265 * DEG },
    phases: [{ n: 1, t0: 0, title: 'Feuerstellung', sub: 'Prepare and launch. Watch the sky for bombers.' }],
    clock: [[0, 7], [2400, 17]],
  },
  v2: {
    id: 'v2', title: 'V-2 mobile battery, autumn 1944', short: 'V-2 (A4)',
    sub: 'A mobile A4 battery in the woods: erect, align, fuel and launch at the port of Antwerp.',
    blurb: 'The convoy is in the clearing. Erect the rocket on the firing table with the Meillerwagen, turn the table onto the target, set the cut-off for the range, run the checks, fuel alcohol and then liquid oxygen (which boils off: launch soon), withdraw the Meillerwagen, then pre-stage and main stage. Fighter-bombers hunt the launch areas.',
    history: 'Historical in outline (the Meillerwagen, the Brennstand, the fuelling order, the Vorstufe and Hauptstufe, Brennschluss range control). The V-2 was a weapon against cities, built with concentration-camp forced labour at Mittelwerk, where thousands of prisoners died. The game sets the target as the port of Antwerp, scores the launch drill and whether the rocket reached the target area, and never counts casualties.',
    kind: 'v2', enemy: 'british', clockStart: 9,
    units: [{
      id: 1, kind: 'v2', name: 'A4 firing table (V-2)', callsign: 'Hagen', battery: 'Artillerie-Abteilung 485, Zug 1',
      pos: P(-24000, 9000), zero: 262 * DEG, pieces: [{ kind: 'v2', dx: 0, dz: 0 }], special: 'v2', ammo: 3,
      role: 'The launch platoon: erect, align, fuel and fire the A4. The liquid oxygen will not wait.',
    }],
    sites: [],
    target: { name: 'Port of Antwerp', dist: 180000, bearing: 262 * DEG },
    phases: [{ n: 1, t0: 0, title: 'Feuerstellung', sub: 'Erect, align, fuel, fire. Fighter-bombers patrol.' }],
    clock: [[0, 9], [2400, 17]],
  },
};

export const OP_IDS = ['flanders', 'sevastopol', 'karl', 'v1', 'v2'];

// Every WW2 position levels its ground (sector.js flatPads reads this): the gun platforms and the launch sites.
export function ww2Pads() {
  const pads = [];
  const size = { gustav: [16, 60], karl: [12, 16], v1: [14, 40], v2: [30, 30], bertha: [10, 13], k18: [9, 9], mrs18: [9, 9], nbw41: [6, 6] };
  for (const op of Object.values(OPS)) for (const u of op.units) {
    const big = size[u.kind] ?? [8, 8];
    for (const p of u.pieces) pads.push({ x: u.pos.x + p.dx, z: u.pos.z + p.dz, rx: big[0], rz: big[1], heading: -(p.bearing ?? u.zero), blend: 20 });
    for (const q of op.positions ?? []) pads.push({ x: q.pos.x, z: q.pos.z, rx: 12, rz: 16, heading: -u.zero, blend: 20 });
  }
  for (const op of Object.values(OPS)) if (op.id !== 'flanders') for (const s of op.sites) {
    const r = Math.min(s.r, 60);
    pads.push({ x: s.pos.x, z: s.pos.z, rx: r, rz: r, heading: -s.bearing, blend: 25 });
  }
  return pads;
}

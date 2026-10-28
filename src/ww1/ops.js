// The WW1 German mode's operations. Plain data and pure functions (Node-safe). The open battle ('ridge'): the German
// heavy artillery of a Gruppe on the ridge east of Ypres in the spring of 1918, firing west at the British gun line,
// which stands in the British game's own gun pits (sector.js UNITS); the whole roster but the Paris Gun (the sandbox:
// no locks), the Gamma set up and ready to fire (`ready: true`, special.js). The Paris Gun's own mission ('paris'), as
// the WW2 mode's Gustav, V-1 and V-2 have theirs: the gun set up on its bed by the gangs the player dispatches, then
// worked round by round (src/ww1/paris.js), the Armee's orders on targets off the map.
//
// The map is the game's one stage with the sides turned round, as the WW2 Flanders battle does it: the German front
// line of 1917 is ours, the British trenches and the country behind them to Ypres are theirs. The history and the
// sources stay in `history` here and in docs/WW1.md; the game's text makes no claims about real events.
import { DEG, UNITS, headingFor } from '../sector.js';
import { gustavLayout } from '../ww2/gustav_layout.js';

const P = (x, z) => ({ x, z });
// the guns that never answer the Sperrfeuer (too slow, too few shells, or off the map; the career's Gustav and Karl too)
export const SUPER_WW1 = new Set(['bertha', 'max38', 'gamma', 'paris', 'gustav', 'karl', 'v1', 'v2']);
const BRIT = Object.fromEntries(UNITS.map((u) => [u.kind, u]));

// unit definitions follow sector.js UNITS (id, kind, name, callsign, battery, pos, zero, pieces [{ kind, dx, dz }])
// plus `role` (the console's line on the unit), `special` (a controller in special.js), `ready` (set up, no drill),
// `ammo` (the shells at the gun, for the specials).
export const OPS = {
  ridge: {
    id: 'ridge', title: 'Flanders, spring 1918', short: 'Open battle', kind: 'battle', enemy: 'british',
    sub: 'An Artillerie-Gruppe on the ridge: the whole heavy roster against the British gun line.',
    tag: 'German heavy artillery, 1918',
    blurb: 'Six German units on the ridge east of Ypres: the long 10 cm K 17, 15 cm heavy field howitzers, 21 cm Mörser, the 38 cm Langer Max on its railway mounting, the 42 cm Dicke Bertha and the 42 cm Gamma-Mörser. Gegenbatterie against the British heavies in their pits, Sperrfeuer when their infantry comes, Störungsfeuer at night, and at X-Zeit a short Feuervorbereitung and the Feuerwalze for our own attack.',
    history: 'A fictional engagement on the game\'s 1917 Ypres map with the sides turned round. It borrows from the German spring offensives of 1918 (the Lys battle, Operation Georgette, April 1918, and the Bruchmüller fire plans). A Gamma and a Langer Max never served side by side here; the open battle puts the whole roster together as a sandbox. docs/WW1.md has the sources.',
    clockStart: 5.5,
    units: [
      // ordered by calibre, smallest first (the unit keys 1 to 6 and the tab column follow the ids)
      {
        id: 1, kind: 'k17', name: '10 cm Kanone 17', callsign: 'Cäsar', battery: 'Batterie 721 (10 cm Kanonen)', pos: P(9300, -600), zero: 272 * DEG,
        pieces: [{ kind: 'k17', dx: 0, dz: -18 }, { kind: 'k17', dx: 3, dz: 18 }], // the British 60-pounder section's spacing, framed by the unit's camera
        role: 'Long guns: the railhead, the roads and the batteries deep in the rear, shrapnel on the traffic.',
      },
      {
        id: 2, kind: 'sfh13', name: '15 cm sFH 13', callsign: 'Anton', battery: '4. Batterie, Fußartillerie-Regiment 9', pos: P(7200, -2600), zero: 270 * DEG,
        pieces: [{ kind: 'sfh13', dx: 0, dz: -54 }, { kind: 'sfh13', dx: 5, dz: -18 }, { kind: 'sfh13', dx: 2, dz: 18 }, { kind: 'sfh13', dx: -4, dz: 54 }],
        role: 'Heavy field howitzers, the backbone: the 18-pounders, the 6-inch, the Sperrfeuer and the Feuerwalze.',
      },
      {
        id: 3, kind: 'm16', name: '21 cm Mörser 16', callsign: 'Emil', battery: 'Fußartillerie-Batterie 214', pos: P(7600, 3800), zero: 262 * DEG,
        pieces: [{ kind: 'm16', dx: 0, dz: -22 }, { kind: 'm16', dx: 3, dz: 22 }], // as close as the British 9.2-inch pair, so the unit's camera frames both
        role: 'Heavy mortars: plunging 113 kg shells on the British heavies, the tank laagers and the dumps.',
      },
      {
        id: 4, kind: 'max38', name: '38 cm SK L/45 "Langer Max"', callsign: 'Max', battery: 'Marine-Sonderkommando, Eisenbahngeschütz', pos: P(12800, -1800), zero: 268 * DEG,
        pieces: [{ kind: 'max38', dx: 0, dz: 0 }],
        role: 'The long naval gun on its railway mounting: 750 kg shells anywhere on the map, the railhead and the 18-inch first.',
      },
      {
        id: 5, kind: 'bertha', name: '42 cm M-Gerät "Dicke Bertha"', callsign: 'Bertha', battery: 'Kurze Marinekanonen-Batterie 3',
        // nearer the front than the demo's bed (sector.js BERTHA): from here the 12 km of its heavy shell and its 11.5
        // degrees each way reach all five British heavies and the HQ
        pos: P(8400, -1650), zero: 256.5 * DEG, pieces: [{ kind: 'bertha', dx: 0, dz: 0 }],
        special: 'bertha', resupply: 1, // its bed can be relaid (special.js); special units get no resupply unless they say so
        role: 'The 42 cm siege howitzer: the British 15-inch, the 18-inch railway gun, the HQ and the dumps. Few shells, slow, terrible.',
      },
      {
        id: 6, kind: 'gamma', name: '42 cm Gamma-Mörser', callsign: 'Gamma', battery: 'Kurze Marinekanonen-Batterie 5', pos: P(11200, 1800), zero: 265 * DEG,
        pieces: [{ kind: 'gamma', dx: 0, dz: 0 }], special: 'gamma', ready: true,
        role: 'The 42 cm fortress mortar on its concrete bed, set up and ready: 1,160 kg shells, the heaviest on the ridge.',
      },
    ],
    // the British side: their heavies in the British game's own pits (sector.js UNITS, facing east), two 18-pounder
    // batteries forward, tank laagers, dumps, the HQ in the Ypres ramparts, traffic at Hellfire Corner and the railhead
    // on the Vlamertinghe line (no kite balloon: its missions are left out; the bballoon kind and model remain)
    sites: [
      { id: 'G1', kind: 'bgun15', name: 'British 15-inch howitzer', pos: { ...BRIT.bl15.pos }, bearing: BRIT.bl15.zero, r: 30, unit: 1 },
      { id: 'G2', kind: 'bgun92', name: 'British 9.2-inch section', pos: { ...BRIT.bl92.pos }, bearing: BRIT.bl92.zero, r: 45, unit: 2 },
      { id: 'G3', kind: 'bgun6', name: 'British 6-inch battery', pos: { ...BRIT.bl6.pos }, bearing: BRIT.bl6.zero, r: 70, unit: 3 },
      { id: 'G4', kind: 'bgun60', name: 'British 60-pounder section', pos: { ...BRIT.bl60.pos }, bearing: BRIT.bl60.zero, r: 30, unit: 4 },
      { id: 'G5', kind: 'bgunrail', name: 'British 18-inch railway howitzer', pos: { ...BRIT.rail.pos }, bearing: BRIT.rail.zero, r: 40, unit: 5 },
      { id: 'F1', kind: 'bfield', name: '18-pounder battery, Frezenberg road', pos: P(2500, -1900), bearing: 92 * DEG, r: 60 },
      { id: 'F2', kind: 'bfield', name: '18-pounder battery, Zouave Wood', pos: P(2700, 1500), bearing: 86 * DEG, r: 60 },
      { id: 'T1', kind: 'btanks', name: 'Tank laager, Wieltje', pos: P(1300, -2600), bearing: 90 * DEG, r: 40 },
      { id: 'T2', kind: 'btanks', name: 'Tank laager, Hooge', pos: P(2000, 3300), bearing: 80 * DEG, r: 40 },
      { id: 'D1', kind: 'bdump', name: 'Ammunition dump, Potijze', pos: P(-300, -2900), bearing: 0, r: 45 },
      { id: 'D2', kind: 'bdump', name: 'Ammunition dump, Zillebeke', pos: P(-1300, 3600), bearing: 30 * DEG, r: 45 },
      { id: 'H1', kind: 'hq', name: 'Brigade HQ, Ypres ramparts', pos: P(-1300, 2200), bearing: 80 * DEG, r: 40 },
      { id: 'X1', kind: 'bconvoy', name: 'Hellfire Corner', pos: P(1500, 300), bearing: 0, r: 30 },
      { id: 'R1', kind: 'railyard', name: 'Railhead, Vlamertinghe line', pos: P(-3430, -2700), bearing: 0, r: 120 },
    ],
    phases: [
      { n: 1, t0: 0, title: 'Einschießen', sub: 'Dawn. Register the batteries on the first targets.' },
      { n: 2, t0: 330, title: 'Artilleriekampf', sub: 'Gegenbatterie on the British heavies. Their RE8s will find us; their guns will answer.' },
      { n: 3, t0: 900, title: 'The British attack', sub: 'Red flares from our front: Sperrfeuer on the lanes.' },
      { n: 4, t0: 1300, title: 'Night', sub: 'Störungsfeuer on their roads, the railhead and the dumps.' },
      { n: 5, t0: 1850, title: 'X-Zeit', sub: 'Our attack: a short Feuervorbereitung, then the Feuerwalze. Lift it on the timetable.' },
    ],
    // April: first light about 05:30; X-Zeit before dawn, the Feuerwalze into the morning
    clock: [[0, 5.5], [330, 6.7], [900, 14.5], [1300, 19.8], [1850, 28.6], [2300, 30.4]],
  },

  // ------------------------------------------------------------------ the Paris Gun's own mission
  paris: {
    id: 'paris', title: 'The long-range gun', short: 'Paris Gun', kind: 'paris', enemy: 'british',
    sub: 'Set the Paris-Geschütz up on its bed, then fire on the Armee\'s orders at targets 120 km away.',
    tag: 'German long-range gun, 1918',
    blurb: 'The gun arrives at its prepared concrete bed in pieces. Send the work gangs to the Stellungsbau: the turntable and racer, the firing frame, the barrel lowered in by the portal crane, the truss that holds it straight, the field railway and the shell store, the weather station and the Rechenstelle, and the camouflage and flak if there is time. Then work every round: gauge the bore and raise the charge for its wear, lay the firing data for the Earth\'s turning and the wind aloft, load the numbered shell, fire, and correct by the agents\' fall reports. The Armee orders rounds onto four military targets far off the map; British Camels come looking for the site by day. Carry out four of the five orders.',
    history: 'Historical in outline (the 21 cm barrels in sets of numbered shells, each fatter than the last as the bore wore, the charge raised to match, the corrections for the Earth\'s rotation and the wind aloft, the agents\' fall reports, the barrel change after about 65 rounds; the Camel raids are the game\'s own threat to it). The Paris Gun was a weapon against a city: it fired on Paris from March to August 1918 from the forest of Crépy and elsewhere, killing over 250 civilians. The game sets its targets as military ones off the map, never a town and never named after a place, scores only the procedure and the rounds in the target areas, and never counts casualties. docs/WW1.md has the sources.',
    clockStart: 6,
    units: [{
      id: 1, kind: 'paris', name: 'Paris-Geschütz', callsign: 'Wilhelm', battery: 'Marine-Sonderkommando, Feuerstellung', pos: P(16000, -3500), zero: 270 * DEG,
      pieces: [{ kind: 'paris', dx: 0, dz: 0 }], special: 'paris', ammo: 65,
      role: 'The long-range gun: set it up on its bed, then fire on military targets about 120 km west, far off the map, on the Armee\'s orders. Raise the charge with the wear, correct for the Earth\'s turning and the wind aloft, change the barrel after about 65 rounds.',
    }],
    sites: [],
    phases: [{ n: 1, t0: 0, title: 'Feuerstellung', sub: 'Set the gun up, then fire on the Armee\'s orders. Watch the sky for their machines.' }],
    clock: [[0, 6], [2700, 18]],
    // the mission ends when every order is settled (paris.js), or at the latest here
    timeLimit: 2700,
    // the Paris Gun's targets (special.js): military targets far off the map, never a town, and never named after a
    // place. All lie in the gun's band (115.6 to 122.8 km on a new barrel, with room for the wind's correction) and its
    // 30 degrees either way of 270. The first is the standing target. `tip` is the console's word on it; `effect` what
    // a round in the area does (special.js; here only the aerodrome's: fewer raids on the gun, enemy.js).
    paris: {
      targets: [
        { id: 'J', name: 'Bahnknoten', en: 'the railway junction', dist: 119000, bearing: 262 * DEG,
          tip: 'The junction that feeds their front: rounds in the area hold up the ammunition trains.' },
        { id: 'T', name: 'Tankpark', en: 'the tank depot', dist: 117800, bearing: 274 * DEG,
          tip: 'Their tanks are parked and repaired here before they go up to the line.' },
        { id: 'C', name: 'Truppenlager', en: 'the reserve camp', dist: 120000, bearing: 252 * DEG,
          tip: 'The camp where their reserves wait to march up for an attack.' },
        { id: 'A', name: 'Flugplatz', en: 'the aerodrome', dist: 118400, bearing: 287 * DEG, effect: 'air', cut: 'their raids cut',
          tip: 'The aerodrome of the Camels that come looking for this gun: rounds in the area keep them on the ground (15% fewer raids a round, up to 45%, wearing off over 10 minutes).' },
      ],
      // the Armee's orders: [at (s after the gun stands), target, rounds in the area, minutes to do it (times the
      // difficulty's), why]. The mission is these orders: it is won with WIN (paris.js) of them carried out.
      orders: [
        [30, 'J', 1, 9, 'Their morning trains are on the line: stop them at the junction.'],
        [330, 'A', 1, 8, 'Their machines are out looking for this gun: keep them on the ground.'],
        [660, 'T', 2, 11, 'Their tanks are going up to the line tonight: hold them in the depot.'],
        [1020, 'C', 1, 8, 'Their reserves are forming for an attack: hold them up before they march.'],
        [1380, 'J', 2, 11, 'Their guns must run short tomorrow: stop the ammunition trains.'],
      ],
    },
  },
};

export const OP_IDS = ['ridge', 'paris'];

// The German career's open battle is the ridge (research.js TREES.de: the 1918 and the WW2 guns in one tree). Its WW2
// batteries take the field only when the lineup names them (ww1Theatre({ kinds })); without a lineup the ridge is the
// 1918 sandbox above, unchanged. They stand where the WW2 Flanders battle has them, but for the three whose spot is a
// 1918 battery's (the leFH 18 on the sFH 13's, the K 18 on the K 17's, the Mörser 18 on the Mörser 16's): those stand
// 1.3 to 1.5 km off, clear of the villages and woods. The Karl arrives set up (`ready`) at its first prepared stop, as
// in the sandbox Flanders battle (campaign.js sandboxTheatre); the Gustav stands assembled on its curve.
export const RIDGE_WW2 = [
  {
    id: 7, kind: 'lefh18', name: '10.5 cm leFH 18', callsign: 'Ludwig', battery: '1. Batterie, leichte Abteilung', pos: P(6400, -3600), zero: 268 * DEG,
    pieces: [{ kind: 'lefh18', dx: 0, dz: -45 }, { kind: 'lefh18', dx: 4, dz: -15 }, { kind: 'lefh18', dx: 2, dz: 15 }, { kind: 'lefh18', dx: -3, dz: 45 }],
    role: 'Field howitzers: quick, plentiful, the support fire and the Sperrfeuer; shrapnel over infantry.',
  },
  {
    id: 8, kind: 'nbw41', name: '15 cm Nebelwerfer 41', callsign: 'Fritz', battery: 'Werfer-Batterie', pos: P(5700, -500), zero: 270 * DEG,
    pieces: [{ kind: 'nbw41', dx: 0, dz: -22 }, { kind: 'nbw41', dx: 2, dz: 0 }, { kind: 'nbw41', dx: -1, dz: 22 }],
    role: 'Rocket launchers: six-rocket ripples that drench an area. Short range, slow to reload, and the smoke gives the battery away.',
  },
  {
    id: 9, kind: 'sfh18', name: '15 cm sFH 18', callsign: 'Bruno', battery: '4. Batterie, schwere Abteilung', pos: P(8100, 1500), zero: 265 * DEG,
    pieces: [{ kind: 'sfh18', dx: 0, dz: -54 }, { kind: 'sfh18', dx: 5, dz: -18 }, { kind: 'sfh18', dx: 2, dz: 18 }, { kind: 'sfh18', dx: -4, dz: 54 }],
    role: 'Heavy howitzers, the backbone: batteries, tank laagers, dumps, strongpoints.',
  },
  {
    id: 10, kind: 'k18', name: '17 cm K 18', callsign: 'Heinrich', battery: 'schwere Artillerie-Abteilung (mot.)', pos: P(10400, 400), zero: 270 * DEG,
    pieces: [{ kind: 'k18', dx: 0, dz: -32 }, { kind: 'k18', dx: 3, dz: 32 }],
    role: 'Long-range guns: counter-battery against the British heavies, the railhead, the HQ and the depots far behind.',
  },
  {
    id: 11, kind: 'mrs18', name: '21 cm Mrs 18', callsign: 'Julius', battery: 'schwere Artillerie-Abteilung (mot.)', pos: P(8900, 3300), zero: 263 * DEG,
    pieces: [{ kind: 'mrs18', dx: 0, dz: -30 }, { kind: 'mrs18', dx: 3, dz: 30 }],
    role: 'Heavy mortars: plunging 113 kg shells against concrete, HQs and deep dugouts.',
  },
  {
    id: 12, kind: 'karl', name: '60 cm Karl-Gerät "Thor"', callsign: 'Thor', battery: 'schwere Artillerie-Abteilung 833', pos: P(6000, 1800), zero: 270 * DEG,
    pieces: [{ kind: 'karl', dx: 0, dz: 0 }], special: 'karl', ammo: 12, ready: true, mode: 'auto',
    role: 'Siege mortar: 2.2 t shells at 3 to 6.5 km, 4 degrees of traverse; the vehicle turns onto the target.',
  },
  {
    id: 13, kind: 'gustav', name: '80 cm Schwerer Gustav', callsign: 'Gustav', battery: 'schwere Artillerie-Abteilung (E) 672', pos: P(13500, 600), zero: 272 * DEG, arc: 18 * DEG,
    pieces: [{ kind: 'gustav', dx: 0, dz: 0 }], special: 'gustav', ammo: 8,
    role: 'The railway gun: a 1,350 t gun assembled on its curved track, with a handful of 4.8 t shells.',
  },
];
// the Karl's prepared stops (its controller, ww2/special.js KarlCtl: set up in the first)
export const RIDGE_POSITIONS = [
  { id: 'a', name: 'Stellung A, northern approach', pos: P(5700, 1800), cover: 0.7 },
  { id: 'b', name: 'Stellung B, central approach', pos: P(4500, -1300), cover: 0.8 },
];
// the heavy and the long guns' targets in the career's battle (`role`, sim/specialists.js: offered only while a battery
// that can serve them is in the field), as WW2 Flanders has them: deep, 11 to 15 km west, past every gun's reach but
// the long ones'; hard, concrete shelters behind the British line that only the heavy shells break
export const RIDGE_ROLE_SITES = [
  { id: 'W1', kind: 'bdump', name: 'Corps ammunition depot', pos: P(-12500, -2000), bearing: 20 * DEG, r: 45, role: 'deep' },
  { id: 'W2', kind: 'bdump', name: 'Army supply depot', pos: P(-14500, 2500), bearing: 0, r: 45, role: 'deep' },
  { id: 'W3', kind: 'hq', name: 'Corps HQ', pos: P(-11000, 4500), bearing: 80 * DEG, r: 40, role: 'deep' },
  { id: 'V1', kind: 'mebu', name: 'Concrete shelter, Potijze', pos: P(-900, -1800), bearing: 90 * DEG, r: 30, role: 'hard' },
  { id: 'V2', kind: 'mebu', name: 'Concrete shelter, Zillebeke', pos: P(300, 3300), bearing: 85 * DEG, r: 30, role: 'hard' },
  { id: 'V3', kind: 'mebu', name: 'Concrete shelter, Ypres', pos: P(-2600, 1200), bearing: 95 * DEG, r: 30, role: 'hard' },
];

// the levelled ground under the career's WW2 batteries (sizes as ww2Pads; the Karl's arrival and its stops as
// sandboxTheatre's), for those in the field only
export function ridgeWW2Pads(units) {
  const pads = [];
  const size = { gustav: [55, 190], karl: [40, 50], k18: [9, 9], mrs18: [9, 9], nbw41: [6, 6] };
  for (const u of units) {
    const big = size[u.kind] ?? [8, 8];
    for (const p of u.pieces) pads.push({ x: u.pos.x + p.dx, z: u.pos.z + p.dz, rx: big[0], rz: big[1], heading: -(p.bearing ?? u.zero), blend: u.kind === 'karl' ? 25 : 20 });
    if (u.kind === 'gustav') {
      // the straight behind the firing curve, level with the station (gustav_layout.js, as ww2Pads)
      const L = gustavLayout({ arc: u.arc, yard: false }), th = headingFor(u.zero), c = Math.cos(th), s = Math.sin(th);
      const m = L.onStraight(L.RUN / 2, 2);
      pads.push({ x: u.pos.x + m.x * c + m.z * s, z: u.pos.z - m.x * s + m.z * c, rx: 35, rz: L.RUN / 2 + 12, heading: th + L.A0, blend: 25, ref: { x: u.pos.x, z: u.pos.z } });
    }
    if (u.kind === 'karl') for (const q of RIDGE_POSITIONS) pads.push({ x: q.pos.x, z: q.pos.z, rx: 12, rz: 16, heading: -u.zero, blend: 20 });
  }
  return pads;
}

// Every WW1 German position levels its ground (sector.js flatPads reads PAD_EXTRA). The British sites stand on the
// British game's own pits and ground.
export function ww1Pads() {
  const pads = [];
  // half-sizes: the field pits (gun_sites_ww1.js) are 12 to 15 m across with the dugout walk up to 9 m behind the gun
  // [rx, rz, back, right]: back and right move the pad's middle that far behind the piece and to its right, so the
  // pad covers the site as built (measured in the site's frame: the Langer Max x -63 to 64, z -24 to 52; the Gamma
  // x -36 to 12, z -14 to 32; the Paris Gun x -28 to 18, z -34 to 48)
  // Bertha's and the Gamma's beds can be relaid onto any line (special.js), their emplacements turning with them: their
  // pads are squares round the gun that hold the site at any bearing (it reaches 22 and 48 m from the gun)
  const size = { bertha: [22, 22], max38: [64, 38, 14, 0], gamma: [48, 48], paris: [23, 41, 7, -5], m16: [10, 12], sfh13: [9, 12], k17: [9, 12] };
  for (const op of Object.values(OPS)) for (const u of op.units) {
    const big = size[u.kind] ?? [8, 8];
    const b = u.zero, back = big[2] ?? 0, right = big[3] ?? 0;
    const ox = -Math.sin(b) * back + Math.cos(b) * right, oz = Math.cos(b) * back + Math.sin(b) * right;
    for (const p of u.pieces) pads.push({ x: u.pos.x + p.dx + ox, z: u.pos.z + p.dz + oz, rx: big[0], rz: big[1], heading: -(p.bearing ?? u.zero), blend: 20 });
  }
  return pads;
}

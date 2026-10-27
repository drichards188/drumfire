// The sector: a stretch of the Ypres salient, autumn 1917, laid out in game metres.
// World frame: metres, y up, origin at the centre of the Group's gun line, north -Z, east +X.
// A bearing b (radians, clockwise from north) at range r is x = r sin b, z = -r cos b.
// Everything here is plain data and pure functions (Node-safe): the sim, the world builder, the
// render layer and the console all read it. Keep positions here, never hard-code them elsewhere.

export const YARD = 0.9144;
export const DEG = Math.PI / 180;
export const MIN = DEG / 60; // one minute of arc, the unit of line corrections

export const fromBearing = (b, r, out = { x: 0, z: 0 }) => {
  out.x = r * Math.sin(b);
  out.z = -r * Math.cos(b);
  return out;
};
export const bearingOf = (dx, dz) => {
  const b = Math.atan2(dx, -dz);
  return b < 0 ? b + 2 * Math.PI : b;
};
// rotation.y that turns model space (front -Z) to face bearing b
export const headingFor = (b) => -b;

// ---------------------------------------------------------------------------------------------
// The Group: five units, keys 1 to 5, smallest calibre first (as the German rosters). `pieces` are the guns of the
// unit (model kind, offset from the unit position in metres, platform bearing). `zero` is the bearing of the
// unit's zero line (the line the guns were laid on when they came into action, roughly at the enemy).
export const UNITS = [
  {
    id: 1, kind: 'bl60', name: '60-pounders', callsign: 'Long Tom',
    battery: '1/1st Lowland Heavy Battery', pos: { x: 900, z: 1800 }, zero: 85 * DEG,
    pieces: [{ kind: 'bl60', dx: 0, dz: -18 }, { kind: 'bl60', dx: 3, dz: 18 }],
  },
  {
    id: 2, kind: 'bl6', name: '6-inch 26 cwt howitzers', callsign: 'Ginger',
    battery: '118th Siege Battery', pos: { x: 400, z: -1300 }, zero: 95 * DEG,
    pieces: [
      { kind: 'bl6', dx: 0, dz: -60 }, { kind: 'bl6', dx: 5, dz: -20 },
      { kind: 'bl6', dx: 2, dz: 20 }, { kind: 'bl6', dx: -4, dz: 60 },
    ],
  },
  {
    id: 3, kind: 'bl92', name: '9.2-inch howitzers', callsign: 'Mother',
    battery: '91st Siege Battery', pos: { x: -600, z: 900 }, zero: 88 * DEG,
    pieces: [{ kind: 'bl92', dx: 0, dz: 0 }, { kind: 'bl92', dx: 0, dz: 45 }],
  },
  {
    id: 4, kind: 'bl15', name: '15-inch howitzer', callsign: 'Granny',
    battery: 'No. 3 RMA Howitzer', pos: { x: -1800, z: -400 }, zero: 92 * DEG,
    pieces: [{ kind: 'bl15', dx: 0, dz: 0 }],
  },
  {
    id: 5, kind: 'rail', name: '18-inch railway howitzer', callsign: 'Wolfe',
    battery: 'No. 13 Railway Siege Battery', pos: { x: -3200, z: 300 }, zero: 90 * DEG,
    pieces: [{ kind: 'rail', dx: 0, dz: 0 }],
  },
];

// Standard gauge. The main line runs north-south behind the gun line; the railway gun stands on a
// curved firing spur that leaves it and swings east, so the car lies on the zero line (the 18-inch
// traverses only 2 degrees on its car: the curve of the spur is the coarse laying). The car is about 20 m long and
// rolls back about 6 m along the track on firing, so the spur is straight for 170 m, 80 m behind the car and
// 130 m ahead of it, and the pad under it is 60 m long along the line of fire.
export const RAIL_MAIN = [
  { x: -3420, z: -6000 }, { x: -3425, z: -3000 }, { x: -3420, z: -1200 }, { x: -3440, z: 600 },
  { x: -3480, z: 2400 }, { x: -3600, z: 4400 }, { x: -3750, z: 7000 },
];
export const RAIL_SPUR = [
  { x: -3420, z: -1200 }, { x: -3412, z: -600 }, { x: -3400, z: -250 }, { x: -3384, z: 20 },
  { x: -3360, z: 160 }, { x: -3328, z: 245 }, { x: -3296, z: 282 }, { x: -3262, z: 298 }, { x: -3232, z: 300 },
  { x: -3200, z: 300 }, { x: -3130, z: 300 }, { x: -3070, z: 300 },
];

// ---------------------------------------------------------------------------------------------
// Trench lines as control points from north to south; the world builder zig-zags them into fire bays
// and traverses, the sim uses them for the front, SOS lines and infantry. British trenches are drawn
// blue on the map board and German trenches red, as on the period trench maps.
export const LINES = {
  britishFront: [
    { x: 3200, z: -7000 }, { x: 3700, z: -4500 }, { x: 4100, z: -2000 }, { x: 4300, z: 0 },
    { x: 4200, z: 2200 }, { x: 3800, z: 4500 }, { x: 3300, z: 7000 },
  ],
  britishSupport: [
    { x: 2700, z: -7000 }, { x: 3200, z: -4500 }, { x: 3600, z: -2000 }, { x: 3800, z: 0 },
    { x: 3700, z: 2200 }, { x: 3300, z: 4500 }, { x: 2800, z: 7000 },
  ],
  germanFront: [
    { x: 3500, z: -7000 }, { x: 4000, z: -4500 }, { x: 4400, z: -2000 }, { x: 4600, z: 0 },
    { x: 4500, z: 2200 }, { x: 4100, z: 4500 }, { x: 3600, z: 7000 },
  ],
  germanSupport: [
    { x: 4200, z: -7000 }, { x: 4700, z: -4500 }, { x: 5100, z: -2000 }, { x: 5300, z: 0 },
    { x: 5200, z: 2200 }, { x: 4800, z: 4500 }, { x: 4300, z: 7000 },
  ],
  germanReserve: [
    { x: 5600, z: -7000 }, { x: 6000, z: -4500 }, { x: 6400, z: -2000 }, { x: 6600, z: 0 },
    { x: 6500, z: 2200 }, { x: 6100, z: 4500 }, { x: 5600, z: 7000 },
  ],
};

// Front sectors: the SOS lines. Each is a stretch of no man's land in front of the British front
// line; red rockets from a sector call every gun onto its SOS line.
export const SECTORS = [
  { id: 'A', name: 'Frezenberg', from: -6000, to: -2600 },
  { id: 'B', name: 'Zonnebeke road', from: -2600, to: 800 },
  { id: 'C', name: 'Polygon', from: 800, to: 3800 },
  { id: 'D', name: 'Gheluvelt', from: 3800, to: 6500 },
];

// ---------------------------------------------------------------------------------------------
// The Dicke Bertha demo mode (src/bertha/): a German 42 cm M-Gerät on the reverse slope of the ridge, behind
// the railhead, laid on a base line (`base`, the Grundrichtung) toward the British gun line 9.7 to 13.5 km off.
// It is not part of the main battle; only its levelled firing bed (flatPads) touches the shared terrain.
export const BERTHA = { pos: { x: 10000, z: -2600 }, base: 253 * DEG };

// ---------------------------------------------------------------------------------------------
// Fixed enemy sites (the sim spawns its targets from these; the world builder does not draw them,
// the render layer does, from models/targets.js). `r` is the footprint radius in metres.
export const SITES = [
  { id: 'B1', kind: 'battery', name: 'Hostile battery 1', pos: { x: 7200, z: -2600 }, bearing: 270 * DEG, r: 60 },
  { id: 'B2', kind: 'battery', name: 'Hostile battery 2', pos: { x: 8100, z: 1500 }, bearing: 265 * DEG, r: 60 },
  { id: 'B3', kind: 'battery', name: 'Hostile battery 3', pos: { x: 9300, z: -600 }, bearing: 275 * DEG, r: 60 },
  { id: 'B4', kind: 'battery', name: 'Hostile battery 4', pos: { x: 7600, z: 3800 }, bearing: 260 * DEG, r: 60 },
  { id: 'M1', kind: 'mebu', name: 'Pillbox "Iberian"', pos: { x: 5000, z: -1500 }, bearing: 270 * DEG, r: 8 },
  { id: 'M2', kind: 'mebu', name: 'Pillbox "Potsdam"', pos: { x: 5200, z: 600 }, bearing: 270 * DEG, r: 8 },
  { id: 'M3', kind: 'mebu', name: 'Pillbox "Bremen"', pos: { x: 4900, z: 2600 }, bearing: 265 * DEG, r: 8 },
  { id: 'M4', kind: 'mebu', name: 'Pillbox "Gallipoli"', pos: { x: 5600, z: -3600 }, bearing: 275 * DEG, r: 8 },
  { id: 'D1', kind: 'dump', name: 'Ammunition dump', pos: { x: 8800, z: -3400 }, bearing: 0, r: 45 },
  { id: 'D2', kind: 'dump', name: 'Ammunition dump', pos: { x: 9800, z: 2300 }, bearing: 30 * DEG, r: 45 },
  { id: 'K1', kind: 'balloon', name: 'Kite balloon', pos: { x: 9500, z: 400 }, bearing: 0, r: 25, alt: 900 },
  { id: 'H1', kind: 'hq', name: 'Chateau HQ', pos: { x: 10500, z: 3000 }, bearing: 250 * DEG, r: 40 },
  { id: 'X1', kind: 'crossroads', name: 'Crossroads', pos: { x: 8500, z: -100 }, bearing: 0, r: 30 },
  { id: 'R1', kind: 'railyard', name: 'Railhead', pos: { x: 11500, z: -1500 }, bearing: 15 * DEG, r: 120 },
  // The heavy and long guns' targets (`role`, sim/specialists.js: only offered while a battery that can serve them is in
  // the field). Deep, 13 to 16 km out, past every gun's reach but the 18-inch railway howitzer's: depots and a corps HQ.
  { id: 'E1', kind: 'dump', name: 'Corps ammunition depot', pos: { x: 14200, z: -2600 }, bearing: 10 * DEG, r: 45, role: 'deep' },
  { id: 'E2', kind: 'hq', name: 'Corps headquarters', pos: { x: 15200, z: 2400 }, bearing: 260 * DEG, r: 40, role: 'deep' },
  { id: 'E3', kind: 'dump', name: 'Railhead depot', pos: { x: 13400, z: 4600 }, bearing: 40 * DEG, r: 45, role: 'deep' },
  // Hard, in the German support line: groups of concrete shelters only the 9.2-inch and heavier break.
  { id: 'S1', kind: 'bunker', name: 'Concrete shelters, Zonnebeke spur', pos: { x: 6300, z: -2300 }, bearing: 270 * DEG, r: 30, role: 'hard' },
  { id: 'S2', kind: 'bunker', name: 'Blockhouse group, Polygon', pos: { x: 6500, z: 3200 }, bearing: 265 * DEG, r: 30, role: 'hard' },
  { id: 'S3', kind: 'bunker', name: 'Concrete shelters, Frezenberg', pos: { x: 5900, z: -4700 }, bearing: 275 * DEG, r: 30, role: 'hard' },
];

// Places for the world builder (ruins, shattered woods) and for the map board's lettering.
export const PLACES = [
  { name: 'Ypres', kind: 'town', pos: { x: -2000, z: 2600 }, r: 700 },
  { name: 'Hellfire Corner', kind: 'crossroads', pos: { x: 1500, z: 300 }, r: 60 },
  { name: 'Wieltje', kind: 'village', pos: { x: 1700, z: -3200 }, r: 220 },
  { name: 'Frezenberg', kind: 'village', pos: { x: 4700, z: -3900 }, r: 200 },
  { name: 'Zonnebeke', kind: 'village', pos: { x: 6900, z: -1000 }, r: 320 },
  { name: 'Passchendaele', kind: 'village', pos: { x: 9800, z: -5200 }, r: 380 },
  { name: 'Gheluvelt', kind: 'village', pos: { x: 6800, z: 4800 }, r: 300 },
  { name: 'Polygon Wood', kind: 'wood', pos: { x: 5900, z: 1700 }, r: 600 },
  { name: 'Sanctuary Wood', kind: 'wood', pos: { x: 3600, z: 3600 }, r: 450 },
  { name: 'Houthulst Forest', kind: 'wood', pos: { x: 6000, z: -9000 }, r: 1600 },
];

// Ground: Flanders is low and flat on the British side (~20 m) and rises to the low ridges the
// Germans held (Passchendaele ridge to the north-east, the Gheluvelt plateau to the east, ~55 m).
// The world builder's height function should honour these so the sim and map agree.
export const GROUND = { base: 18, ridge: 55, ridgeX: 8000 };

// The devastated zone: craters, mud, flooded shell holes, between these x limits (fading at the edges).
export const ZONE = { from: 2400, full: 3400, to: 8200, fade: 10500 };

// ---------------------------------------------------------------------------------------------
// The trench map grid (British 1:20,000 sheet system, sheet 28 "Ypres"): 6000-yard lettered squares
// A to X (four rows of six), each cut into 36 numbered 1000-yard squares, each quartered a b c d
// (a north-west, b north-east, c south-west, d south-east), and a point in a quarter given in
// tenths (50 yards) of easting then northing: "J.14.c.3.7". The world origin sits at these grid yards:
export const SHEET = { name: '28', e0: 11000, n0: 13500, cols: 6, rows: 4, big: 6000 };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX';

export const toGrid = (x, z) => ({ e: SHEET.e0 + x / YARD, n: SHEET.n0 - z / YARD });
export const fromGrid = (e, n) => ({ x: (e - SHEET.e0) * YARD, z: -(n - SHEET.n0) * YARD });

// precision 1: 50-yard tenths ("J.14.c.3.7"); 2: 5-yard hundredths ("J.14.c.35.70")
export function gridRef(x, z, precision = 1) {
  const { e, n } = toGrid(x, z);
  const col = Math.floor(e / SHEET.big), rowUp = Math.floor(n / SHEET.big);
  if (col < 0 || col >= SHEET.cols || rowUp < 0 || rowUp >= SHEET.rows) return 'off sheet';
  const row = SHEET.rows - 1 - rowUp;
  const le = e - col * SHEET.big, ln = n - rowUp * SHEET.big;
  const sc = Math.floor(le / 1000), sr = 5 - Math.floor(ln / 1000);
  const num = sr * 6 + sc + 1;
  const qe = le % 1000, qn = ln % 1000;
  const q = qn >= 500 ? (qe < 500 ? 'a' : 'b') : (qe < 500 ? 'c' : 'd');
  const k = precision === 2 ? 100 : 10;
  const de = Math.min(k - 1, Math.floor(((qe % 500) / 500) * k));
  const dn = Math.min(k - 1, Math.floor(((qn % 500) / 500) * k));
  const pad = (v) => String(v).padStart(precision, '0');
  return `${LETTERS[row * SHEET.cols + col]}.${num}.${q}.${pad(de)}.${pad(dn)}`;
}

// "J.14.c.3.7" or "J.14.c.35.70" (or "J.14.c", "J.14") -> world point at the centre of what it names
export function fromGridRef(ref) {
  const m = /^([A-X])\.(\d{1,2})(?:\.([abcd])(?:\.(\d{1,2})\.(\d{1,2}))?)?$/.exec(ref.trim());
  if (!m) return null;
  const li = LETTERS.indexOf(m[1]);
  const row = Math.floor(li / SHEET.cols), col = li % SHEET.cols;
  const rowUp = SHEET.rows - 1 - row;
  const num = Number(m[2]) - 1;
  if (num < 0 || num > 35) return null;
  const sr = Math.floor(num / 6), sc = num % 6;
  let e = col * SHEET.big + sc * 1000, n = rowUp * SHEET.big + (5 - sr) * 1000;
  let size = 1000;
  if (m[3]) {
    if (m[3] === 'b' || m[3] === 'd') e += 500;
    if (m[3] === 'a' || m[3] === 'b') n += 500;
    size = 500;
    if (m[4] != null) {
      const k = m[4].length === 2 ? 100 : 10;
      e += (Number(m[4]) / k) * 500;
      n += (Number(m[5]) / k) * 500;
      size = 500 / k;
    }
  }
  return fromGrid(e + size / 2, n + size / 2);
}

// Distance from point to a polyline (for "is this in the trench", SOS lines, infantry)
export function polylineDistance(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

// x of a north-south polyline at a given z (lines above run north to south, z increasing)
export function lineX(pts, z) {
  if (z <= pts[0].z) return pts[0].x;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (z <= b.z) return a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x);
  }
  return pts[pts.length - 1].x;
}

// World positions of every piece (gun) of a unit, with the platform bearing (the zero line)
export function piecePlacements(unit) {
  return unit.pieces.map((p, i) => ({
    i, kind: p.kind, x: unit.pos.x + p.dx, z: unit.pos.z + p.dz, bearing: p.bearing ?? unit.zero,
  }));
}

// Extra pads a mode adds before the terrain is first sampled (the WW2 mode's positions, src/ww2/theatre.js): empty in
// the British game, so its ground is exactly as it was.
export const PAD_EXTRA = [];

// Pads the terrain levels (terrainHeight.js format): gun platforms, the railway spur bed, sites.
// { x, z, rx, rz, heading, blend }: a rectangle of half-sizes rx by rz turned by heading, blended out over `blend` m.
export function flatPads() {
  const pads = [];
  for (const u of UNITS) for (const p of piecePlacements(u)) {
    // the 15-inch platform with its crane and shell stack is ~15 m across; the 18-inch car is about 20 m long and rolls back 6 m
    const big = u.kind === 'rail' ? [7, 30] : u.kind === 'bl15' ? [12, 12] : [8, 8];
    pads.push({ x: p.x, z: p.z, rx: big[0], rz: big[1], heading: headingFor(p.bearing), blend: 18 });
  }
  // the Bertha's firing bed: the steel Bettung, the shell and charge stores beside it
  pads.push({ x: BERTHA.pos.x, z: BERTHA.pos.z, rx: 10, rz: 13, heading: headingFor(BERTHA.base), blend: 20 });
  for (const s of SITES) if (s.kind !== 'balloon') {
    const r = Math.min(s.r, 60);
    pads.push({ x: s.pos.x, z: s.pos.z, rx: r, rz: r, heading: headingFor(s.bearing), blend: 25 });
  }
  pads.push(...PAD_EXTRA);
  return pads;
}

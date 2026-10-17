import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shells and cartridges at true size. Every shell is built along Z with the nose toward -Z (the
// way the barrel points at zero elevation) and centred on its middle, so the loading scenes can
// lay it on a tray and the flight renderer can orient it by velocity. One merged geometry per
// material; the materials are cached and shared. A shell kind is
//   bl15 | bl92 | bl6 | bl60 | rail  British HE, yellow body with the red band of a lyddite filling,
//                                       copper driving band, brass No. 106 fuze nose
//   fh15 | m21 | fk77                 German: field grey (the 7.7 cm black with a coloured nose band),
//                                       copper band, steel nose fuze
// WW2 mode (DESIGN.md "WW2 mode"):
//   lefh18 | sfh18 | k18 | mrs18      German HE (Feldgrau body, a black stencil band, copper band, steel fuze)
//   gustav | karl | bertha            the 80 cm 4.8 t HE, the 60 cm heavy shell, the 42 cm (the m42 shape)
//   nbw41                             15 cm Wurfgranate 41: spin-stabilised rocket, motor in front, the venturi
//                                       ring of 26 angled nozzles two thirds back, the HE warhead at the rear
//   q25 | m55                         British 25-pounder and 5.5-inch HE (buff with a red ring, WW2 style)
//   s76 | s122 | s152                 Soviet HE (khaki-grey, a black band)
//   rp3                               the RP-3 rocket: 3-inch motor tube, four fins, the 60 lb SAP head
//   bomb                              British 500 lb GP bomb with its box tail
//   v1 | v2                           delegated to models/v/de/missiles.js buildMissile (a plain stand-in until it exists)

export const SHELL_KINDS = ['bl15', 'bl92', 'bl6', 'bl60', 'rail', 'fh15', 'm21', 'fk77', 'm42', 'm42l',
  'lefh18', 'sfh18', 'k18', 'mrs18', 'nbw41', 'gustav', 'karl', 'bertha', 'q25', 'm55', 'rp3', 'bomb', 's76', 's122', 's152', 'v1', 'v2'];

// the missiles' builder (another file, may be absent): buildShell('v1' | 'v2') delegates to it
const MISSILES = import.meta.glob('./v/de/missiles.js', { eager: true });

// d: calibre (m), L: overall length (m), og: ogive length in calibres, rho: ogive radius in calibres,
// band: where the driving band sits (fraction of L from the base), paint, stripe, nose colours.
const SPEC = {
  bl15: { d: 0.381, L: 1.52, og: 1.35, rho: 2.0, band: 0.1, paint: 0xb89a2a, stripe: 0x8a1c14, nose: 'brass' },
  bl92: { d: 0.234, L: 0.95, og: 1.4, rho: 2.0, band: 0.1, paint: 0xb89a2a, stripe: 0x8a1c14, nose: 'brass' },
  bl6: { d: 0.152, L: 0.58, og: 1.5, rho: 2.0, band: 0.1, paint: 0xb89a2a, stripe: 0x8a1c14, nose: 'brass' },
  bl60: { d: 0.127, L: 0.62, og: 1.8, rho: 2.5, band: 0.1, paint: 0xb89a2a, stripe: 0x8a1c14, nose: 'brass' },
  rail: { d: 0.457, L: 2.01, og: 1.7, rho: 2.4, band: 0.1, paint: 0xb89a2a, stripe: 0x8a1c14, nose: 'brass' }, // 18-inch HE Mk 2D, 2,500 lb, 6 ft 7 in
  fh15: { d: 0.149, L: 0.56, og: 1.4, rho: 2.0, band: 0.1, paint: 0x585d58, stripe: 0xc8a82a, nose: 'steel' },
  m21: { d: 0.211, L: 0.72, og: 1.3, rho: 2.0, band: 0.1, paint: 0x4b4f4b, stripe: 0xc8a82a, nose: 'steel' },
  fk77: { d: 0.077, L: 0.34, og: 1.6, rho: 2.5, band: 0.12, paint: 0x23262a, stripe: 0xb03a22, nose: 'steel' },
  // the Dicke Bertha demo: the 42 cm schwere Granate (810 kg) and the longer-ranged leichte Granate (400 kg)
  m42: { d: 0.42, L: 1.65, og: 1.4, rho: 2.0, band: 0.12, paint: 0x4b4f4b, stripe: 0xc8a82a, nose: 'steel' },
  m42l: { d: 0.42, L: 1.3, og: 1.5, rho: 2.2, band: 0.12, paint: 0x5a5e58, stripe: 0x3a6a3a, nose: 'steel' },
  // WW2 German HE: field grey with a black stencil band round the ogive
  lefh18: { d: 0.105, L: 0.45, og: 1.6, rho: 2.6, band: 0.12, paint: 0x5a5f52, stripe: 0x2a2b27, nose: 'steel' }, // 10.5 cm FH Gr 38, 14.8 kg
  sfh18: { d: 0.149, L: 0.63, og: 1.7, rho: 2.8, band: 0.1, paint: 0x5a5f52, stripe: 0x2a2b27, nose: 'steel' }, // 15 cm Gr 19, 43.5 kg
  k18: { d: 0.1725, L: 0.84, og: 2.1, rho: 4, band: 0.1, paint: 0x5a5f52, stripe: 0x2a2b27, nose: 'steel' }, // 17 cm Gr 39, 62.8 kg
  mrs18: { d: 0.211, L: 0.98, og: 1.7, rho: 3, band: 0.1, paint: 0x5a5f52, stripe: 0x2a2b27, nose: 'steel' }, // 21 cm Gr 18, 113 kg
  gustav: { d: 0.8, L: 3.7, og: 1.9, rho: 3.2, band: 0.08, paint: 0x5a5f52, stripe: 0x2a2b27, nose: 'steel' }, // 80 cm Sprenggranate, 4.8 t
  karl: { d: 0.6, L: 2.5, og: 1.4, rho: 2.4, band: 0.08, paint: 0x5a5f52, stripe: 0x2a2b27, nose: 'steel' }, // 60 cm schwere Betongranate, 2,170 kg
  bertha: { d: 0.42, L: 1.65, og: 1.4, rho: 2.0, band: 0.12, paint: 0x4b4f4b, stripe: 0xc8a82a, nose: 'steel' }, // the m42 shape
  // the enemy's: British WW2 HE buff with a red ring and a brass fuze; Soviet khaki-grey with a black band
  q25: { d: 0.0876, L: 0.43, og: 1.8, rho: 2.6, band: 0.12, paint: 0xa8935a, stripe: 0x8a1c14, nose: 'brass' },
  m55: { d: 0.14, L: 0.6, og: 1.8, rho: 2.8, band: 0.1, paint: 0xa8935a, stripe: 0x8a1c14, nose: 'brass' },
  s76: { d: 0.0762, L: 0.36, og: 1.7, rho: 2.6, band: 0.12, paint: 0x6b6a52, stripe: 0x1e1e1c, nose: 'steel' },
  s122: { d: 0.1219, L: 0.56, og: 1.7, rho: 2.6, band: 0.1, paint: 0x6b6a52, stripe: 0x1e1e1c, nose: 'steel' },
  s152: { d: 0.1524, L: 0.66, og: 1.7, rho: 2.6, band: 0.1, paint: 0x6b6a52, stripe: 0x1e1e1c, nose: 'steel' },
};

const matCache = new Map();
const mat = (key, color, rough, metal) => {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(key);
};
const M = {
  copper: () => mat('copper', 0xa8643a, 0.4, 0.85),
  brass: () => mat('brass', 0xb08c3c, 0.35, 0.85),
  steel: () => mat('steel', 0x8a8e92, 0.45, 0.8),
  bag: () => mat('bag', 0xc7b48c, 0.95, 0),
  tie: () => mat('tie', 0x8a3a2c, 0.9, 0),
  paint: (c) => mat('paint' + c, c, 0.55, 0.15),
};

// The outline of a shell as radius at distance s from the base.
function profile(sp) {
  const { d, L } = sp, R = d / 2, lo = sp.og * d, rho = sp.rho * d, rn = R * 0.22, nl = R * 0.5;
  const sOg = L - nl - lo; // ogive starts here
  // ogive circle: centre at (sOg, R - rho); radius rho. Truncated where r falls to rn.
  const cosMax = (rn - (R - rho)) / rho;
  const thMax = Math.acos(Math.min(1, Math.max(-1, cosMax)));
  const lenOg = rho * Math.sin(thMax);
  const k = lo / lenOg; // stretch so the ogive ends exactly at L - nl
  const r = (s) => {
    if (s <= 0) return R * 0.8;
    if (s < L * 0.035) return R * (0.8 + 0.2 * (s / (L * 0.035))); // boat-tail chamfer
    if (s <= sOg) return R;
    if (s <= L - nl) {
      const x = (s - sOg) / k, th = Math.asin(Math.min(1, x / rho));
      return Math.max(rn, R - rho + rho * Math.cos(th));
    }
    // fuze nose: cylinder with a domed tip
    const t = (s - (L - nl)) / nl;
    return t > 0.75 ? rn * Math.sqrt(Math.max(0, 1 - ((t - 0.75) / 0.25) ** 2)) + 0.0005 : rn;
  };
  return { R, r, sOg, nl, lo, rn };
}

// A band of the outline from s0 to s1 as a lathe along Z (nose -Z), centred by `half`.
function slice(r, s0, s1, half, n = 10, bulge = 0, closeBase = false, seg = 24) {
  if (seg <= 8) n = Math.max(1, n >> 1);
  const pts = [];
  if (closeBase) pts.push(new THREE.Vector2(0.0001, s0));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    pts.push(new THREE.Vector2(r(s) + bulge, s));
  }
  if (s1 >= half * 2 - 1e-6) pts.push(new THREE.Vector2(0.0001, s1));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(-Math.PI / 2); // lathe's +Y (the nose) becomes -Z
  g.translate(0, 0, half);
  return g;
}

const merge = (list) => {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  list.forEach((x) => x.dispose());
  return g;
};

// seg: radial segments (24 default; stacks of shells use 8 to keep the triangle count down)
export function buildShell(kind, seg = 24) {
  if (CUSTOM[kind]) return CUSTOM[kind](seg);
  const sp = SPEC[kind];
  if (!sp) throw new Error('unknown shell kind ' + kind);
  const { d, L } = sp, { R, r, sOg, nl } = profile(sp), half = L / 2;
  const body = [], band = [], stripe = [], nose = [];
  const bw = d * 0.26, b0 = L * sp.band, b1 = b0 + bw; // the driving band, a hair proud and chamfered
  const bandR = (s) => r(s) + 0.0035 * (d / 0.15 > 1 ? Math.min(2, d / 0.15) : 1) * Math.min(1, Math.min((s - b0) / 0.006, (b1 - s) / 0.006));
  band.push(slice(bandR, b0, b1, half, 6, 0, false, seg));
  body.push(slice(r, 0, b0, half, 3, 0, true, seg), slice(r, b1, sOg, half, 2, 0, false, seg));
  // red (or coloured) band round the ogive, then the bare ogive paint, then the nose
  const og0 = sOg, og1 = L - nl, sa = og0 + (og1 - og0) * 0.1, sb = og0 + (og1 - og0) * 0.4;
  body.push(slice(r, og0, sa, half, 3, 0, false, seg), slice(r, sb, og1, half, 6, 0, false, seg));
  stripe.push(slice((s) => r(s) + 0.0007, sa, sb, half, 4, 0, false, seg));
  nose.push(slice(r, og1, L, half, 5, 0, false, seg));
  // a thin ridge where the nose fuze screws in
  if (seg >= 16) nose.push(slice((s) => r(s) + 0.002, og1, og1 + nl * 0.14, half, 2, 0, false, seg));
  const parts = [
    { geometry: merge(body), material: M.paint(sp.paint) },
    { geometry: merge(band), material: M.copper() },
    { geometry: merge(stripe), material: M.paint(sp.stripe) },
    { geometry: merge(nose), material: sp.nose === 'brass' ? M.brass() : M.steel() },
  ];
  for (const p of parts) p.geometry.computeBoundingSphere();
  return { parts, length: L, radius: R };
}

// Bagged propellant (the British 6-inch up to the 15-inch, the 60-pdr, the German 15 and 21 cm) or a
// brass cartridge case (the 7.7 cm FK 16): along Z, centred, `length` and `radius` as for shells.
// opts.charges: sections of a bagged charge laid end to end (default 1).
const CART = {
  bl15: { l: 0.46, r: 0.15, brass: false }, bl92: { l: 0.4, r: 0.1, brass: false }, bl6: { l: 0.34, r: 0.07, brass: false },
  bl60: { l: 0.42, r: 0.055, brass: false }, rail: { l: 0.62, r: 0.19, brass: false },
  fh15: { l: 0.4, r: 0.065, brass: false }, m21: { l: 0.4, r: 0.09, brass: false }, fk77: { l: 0.28, r: 0.04, brass: true },
  m42: { l: 0.42, r: 0.19, brass: false }, m42c: { l: 0.95, r: 0.205, brass: true }, // the 42 cm Vorkartusche bag and brass Hauptkartusche
  // WW2 German: the field howitzers' charges in brass cases; the heavies a bag in front of a brass case
  // (`case`: the case's length at the rear, the bag l in front of it)
  lefh18: { l: 0.18, r: 0.062, brass: true }, sfh18: { l: 0.27, r: 0.083, brass: true },
  k18: { l: 0.5, r: 0.088, brass: false, case: 0.32, cr: 0.098 }, mrs18: { l: 0.45, r: 0.104, brass: false, case: 0.3, cr: 0.116 },
  nbw41: { l: 0.1, r: 0.02, brass: false }, // the igniter lead's plug (the rockets carry their own propellant)
  gustav: { l: 0.9, r: 0.37, brass: false }, gustavc: { l: 1.3, r: 0.48, brass: true }, // Vorkartusche bags, the brass Hauptkartusche
  karl: { l: 0.55, r: 0.27, brass: false, case: 0.5, cr: 0.31 },
  bertha: { l: 0.42, r: 0.19, brass: false },
};
export function buildCartridge(kind, { charges = 1 } = {}) {
  const c = CART[kind];
  if (!c) throw new Error('unknown cartridge kind ' + kind);
  const L = c.l * charges + (c.case ?? 0), bag = [], tie = [], brass = [];
  if (c.case) {
    // the brass case at the rear (base at +Z), its mouth toward the bag
    const cl = c.case, cr = c.cr ?? c.r;
    const pts = [[0.0001, 0], [cr * 0.92, 0], [cr * 1.08, 0.012], [cr * 1.08, 0.022], [cr * 0.98, 0.03], [cr, cl]].map(([x, y]) => new THREE.Vector2(x, y));
    brass.push(new THREE.LatheGeometry(pts, 20).rotateX(-Math.PI / 2).translate(0, 0, L / 2));
  }
  if (c.brass) {
    const pts = [[0.0001, 0], [c.r * 0.9, 0], [c.r * 1.08, 0.012], [c.r * 1.08, 0.02], [c.r * 0.8, 0.03], [c.r * 0.82, L * 0.7], [c.r * 0.7, L], [c.r * 0.66, L]].map(([x, y]) => new THREE.Vector2(x, y));
    brass.push(new THREE.LatheGeometry(pts, 20).rotateX(-Math.PI / 2).translate(0, 0, L / 2));
  } else {
    for (let i = 0; i < charges; i++) {
      // a bulging cloth bag, gathered at both ends and laced
      const l = c.l, z0 = -L / 2 + i * l;
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, e = Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.35;
        pts.push(new THREE.Vector2(0.0001 + c.r * (0.25 + 0.75 * e) * (k === 0 || k === 10 ? 0.4 : 1), z0 + t * l));
      }
      bag.push(new THREE.LatheGeometry(pts, 14).rotateX(Math.PI / 2).translate(0, 0, l * 0 + 0));
      const t0 = z0 + l * 0.08;
      tie.push(new THREE.TorusGeometry(c.r * 0.55, 0.004, 5, 14).translate(0, 0, t0));
      tie.push(new THREE.TorusGeometry(c.r * 0.55, 0.004, 5, 14).translate(0, 0, z0 + l * 0.92));
    }
  }
  const parts = [];
  if (bag.length) parts.push({ geometry: merge(bag), material: M.bag() }, { geometry: merge(tie), material: M.tie() });
  if (brass.length) parts.push({ geometry: merge(brass), material: M.brass() });
  return { parts, length: L, radius: Math.max(c.r, c.cr ?? 0) };
}

// ---------------------------------------------------------------- WW2 rockets, bombs and missiles

// A surface of revolution from [s, r] pairs, s measured from the base (rear) toward the nose (-Z), centred on L.
const revolve = (pts, L, seg = 24) => new THREE.LatheGeometry(pts.map(([s, r]) => new THREE.Vector2(Math.max(r, 0.0001), s)), seg).rotateX(-Math.PI / 2).translate(0, 0, L / 2);
const done = (parts, length, radius) => { for (const p of parts) p.geometry.computeBoundingSphere(); return { parts, length, radius }; };
const fin = (span, chord, t, z, a) => new THREE.BoxGeometry(t, span, chord).translate(0, span / 2, z).rotateZ(a);

const CUSTOM = {
  // 15 cm Wurfgranate 41: 979 mm, 158 mm, 34 kg. The motor in front (ogive nose), the venturi ring of 26 nozzles
  // angled 14 degrees for the spin two thirds back, behind it the HE warhead with its flat base.
  nbw41(seg) {
    const L = 0.979, R = 0.079, n = Math.max(8, seg);
    const body = [revolve([[0, 0], [0, R * 0.86], [0.014, R], [0.33, R]], L, n), revolve([[0.43, R * 0.97], [0.8, R * 0.97], [0.86, R * 0.9], [0.92, R * 0.66], [0.955, R * 0.38], [0.972, R * 0.2], [L, 0]], L, n)];
    const ringG = [revolve([[0.33, R * 1.02], [0.43, R * 1.02]], L, n)];
    const holes = [];
    if (seg >= 16) {
      // the 26 nozzle mouths round the ring, each a short dark cylinder canted for the spin
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const g = new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6).rotateX(Math.PI / 2).rotateY(0.24).translate(Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96, L / 2 - 0.4);
        holes.push(g);
      }
    }
    holes.push(revolve([[0.0, 0.02], [0.006, 0.02], [0.006, 0]], L, 10)); // base plug
    return done([
      { geometry: merge(body), material: M.paint(0x5a5f52) },
      { geometry: merge(ringG), material: M.steel() },
      { geometry: merge(holes), material: M.paint(0x161616) },
    ], L, R);
  },
  // RP-3: 3-inch (82.5 mm) motor tube with four fins, the 60 lb semi-armour-piercing head (152 mm) in front
  rp3(seg) {
    const L = 1.75, R = 0.076, r = 0.041, n = Math.max(8, seg);
    const motor = [revolve([[0, r * 0.8], [0.02, r], [1.3, r], [1.32, r * 1.1], [1.33, r * 0.9]], L, n)];
    const head = [revolve([[1.33, R * 0.6], [1.36, R], [1.53, R], [1.62, R * 0.86], [1.69, R * 0.55], [1.73, R * 0.22], [L, 0]], L, n)];
    const fins = [];
    for (let i = 0; i < 4; i++) fins.push(fin(0.13, 0.26, 0.006, L / 2 - 0.16, i * Math.PI / 2 + Math.PI / 4));
    return done([
      { geometry: merge(motor), material: M.paint(0x5e6252) },
      { geometry: merge(head), material: M.paint(0x4a4a44) },
      { geometry: merge(fins), material: M.paint(0x5e6252) },
    ], L, R);
  },
  // British 500 lb GP bomb: a 330 mm body with a rounded nose, the tail cone and the box tail, a nose fuze
  bomb(seg) {
    const L = 1.75, R = 0.165, n = Math.max(8, seg);
    const body = [revolve([[0.35, 0.05], [0.4, R * 0.55], [0.55, R * 0.9], [0.65, R], [1.3, R], [1.45, R * 0.93], [1.58, R * 0.72], [1.66, R * 0.42], [1.7, R * 0.2], [1.71, 0.03]], L, n)];
    const tail = [revolve([[0.0, 0.03], [0.35, 0.05]], L, 10)];
    // the box tail: four fins and the square box round their tips
    for (let i = 0; i < 4; i++) tail.push(fin(0.17, 0.36, 0.004, L / 2 - 0.18, i * Math.PI / 2 + Math.PI / 4));
    const bx = 0.2, bz = L / 2 - 0.18;
    tail.push(new THREE.BoxGeometry(bx * 2, 0.004, 0.2).translate(0, bx, bz), new THREE.BoxGeometry(bx * 2, 0.004, 0.2).translate(0, -bx, bz));
    tail.push(new THREE.BoxGeometry(0.004, bx * 2, 0.2).translate(bx, 0, bz), new THREE.BoxGeometry(0.004, bx * 2, 0.2).translate(-bx, 0, bz));
    const band = [revolve([[1.1, R + 0.001], [1.16, R + 0.001]], L, n)];
    const fz = [revolve([[1.71, 0.03], [1.74, 0.025], [L, 0.0]], L, 10)];
    return done([
      { geometry: merge(body), material: M.paint(0x4b5034) },
      { geometry: merge(tail), material: M.paint(0x4b5034) },
      { geometry: merge(band), material: M.paint(0x8a1c14) },
      { geometry: merge(fz), material: M.steel() },
    ], L, R);
  },
  v1: (seg) => missile('v1', seg),
  v2: (seg) => missile('v2', seg),
};

// v1 / v2: the missiles agent's buildMissile when its file exists, else a plain painted cylinder of the right size
const MISSILE_SIZE = { v1: { L: 8.3, R: 0.425, paint: 0x6a6e5a }, v2: { L: 14, R: 0.825, paint: 0x8a8a7c } };
function missile(kind, seg) {
  const mod = Object.values(MISSILES)[0];
  if (mod && typeof mod.buildMissile === 'function') {
    try {
      const m = mod.buildMissile(kind, seg);
      if (m && m.parts) return m;
    } catch (e) { console.warn('shells: buildMissile failed', e.message); }
  }
  const { L, R, paint } = MISSILE_SIZE[kind], n = Math.max(8, seg);
  const g = revolve([[0, R * 0.7], [0.4, R], [L * 0.75, R], [L * 0.92, R * 0.6], [L, 0]], L, n);
  return done([{ geometry: merge([g]), material: M.paint(paint) }], L, R);
}

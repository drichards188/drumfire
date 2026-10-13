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

export const SHELL_KINDS = ['bl15', 'bl92', 'bl6', 'bl60', 'rail', 'fh15', 'm21', 'fk77'];

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
};
export function buildCartridge(kind, { charges = 1 } = {}) {
  const c = CART[kind];
  if (!c) throw new Error('unknown cartridge kind ' + kind);
  const L = c.l * charges, bag = [], tie = [], brass = [];
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
  return { parts, length: L, radius: c.r };
}

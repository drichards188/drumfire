import * as THREE from 'three';
import { V, box, xTube, zTube, rod, loft, xf, zLathe, Parts, projectUV, vehicleMats, tyreGeometry } from '../../kit.js';
import { mulberry32 } from '../../../noise.js';

// Aircraft of the WW2 mode (DESIGN.md "WW2 mode"): the Hawker Typhoon Ib fighter-bomber of autumn 1944
// (Ocean Grey and Dark Green over Medium Sea Grey, invasion stripes kept under the wings and the rear
// fuselage, four 20 mm cannon, eight RP-3 rockets on rails), the Ilyushin Il-2M3 Sturmovik (two-tone
// green over light blue, red stars, the rear gunner), the Fieseler Fi 156 Storch (the German spotter:
// RLM 70/71 splinter over 65, stalky long-stroke legs, the greenhouse cabin, the slatted high wing) and
// the Taylorcraft Auster AOP (the Allied air observation post, parked on the 'aop' target).
//
// buildAircraft(kind) -> {
//   root     Group; model space nose toward -Z, metres, real sizes
//   body     the airframe inside root: setParked(true) (the default) pitches it into its three-point
//            attitude with the wheels on y = 0; setParked(false) levels it with the origin on the thrust
//            line near the centre of gravity, for flight
//   prop     Object3D named 'prop' (spin it about its Z: prop.rotation.z += w * dt); prop.userData.disc
//            is a faint blur disc (hidden) to show at full revs instead of the blades
//   gear     the retractable undercarriage group (setGear(0) hides it; the Storch's and Auster's is fixed)
//   stores   [Object3D] rockets and bombs, one per round, to hide as they are fired (Typhoon 8 RP-3,
//            Il-2 4 RS-82 and 2 FAB-100)
//   parts    [Mesh] every mesh of the airframe (to char or hide)
//   length, span, height (parked), setParked(on), setGear(k)
// }

const TAU = Math.PI * 2;
const SPEC = {
  typhoon: { upper: [0x5c6168, 0x3c4a33], under: 0x8e9294, pattern: 'wave', seed: 3 },
  il2: { upper: [0x56633a, 0x2f3a24], under: 0x8cb2c8, pattern: 'wave', seed: 5 },
  storch: { upper: [0x4a5238, 0x2e3528], under: 0x9cb0bc, pattern: 'splinter', seed: 7 },
  auster: { upper: [0x45503a, 0x6e5c3e], under: 0xb0b8a0, pattern: 'wave', seed: 9 },
};

// ------------------------------------------------------------------------------------- materials
const matCache = new Map();
function camoTex(spec) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), r = mulberry32(spec.seed);
  const hex = (h) => '#' + h.toString(16).padStart(6, '0');
  g.fillStyle = hex(spec.upper[0]);
  g.fillRect(0, 0, S, S);
  g.fillStyle = hex(spec.upper[1]);
  const shapes = [];
  for (let i = 0; i < 9; i++) {
    const cx = r() * S, cy = r() * S, pts = [];
    if (spec.pattern === 'splinter') { // the Luftwaffe's hard-edged splinter: angular polygons
      const n = 4 + ((r() * 2) | 0), R = 60 + r() * 90;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU + r() * 0.6; pts.push([cx + Math.cos(a) * R * (0.6 + r() * 0.6), cy + Math.sin(a) * R * (0.6 + r() * 0.6)]); }
    } else { // the RAF's and the VVS's soft-edged waves: smooth blobs
      const n = 9, R = 50 + r() * 80;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU; pts.push([cx + Math.cos(a) * R * (0.55 + r() * 0.7) * 1.4, cy + Math.sin(a) * R * (0.55 + r() * 0.7)]); }
    }
    shapes.push(pts);
  }
  for (const pts of shapes) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { // drawn nine times so the tile wraps
    g.beginPath();
    if (spec.pattern === 'splinter') pts.forEach(([x, y], k) => (k ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy)));
    else {
      const m = (k) => pts[(k + pts.length) % pts.length];
      g.moveTo((m(0)[0] + m(1)[0]) / 2 + ox, (m(0)[1] + m(1)[1]) / 2 + oy);
      for (let k = 1; k <= pts.length; k++) g.quadraticCurveTo(m(k)[0] + ox, m(k)[1] + oy, (m(k)[0] + m(k + 1)[0]) / 2 + ox, (m(k)[1] + m(k + 1)[1]) / 2 + oy);
    }
    g.fill();
  }
  // weathering: exhaust and oil streaks, faded panels
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '20,20,18' : '200,200,190'},${0.02 + r() * 0.04})`;
    g.fillRect(r() * S, r() * S, 8 + r() * 60, 2 + r() * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function mats(kind) {
  if (matCache.has(kind)) return matCache.get(kind);
  const base = vehicleMats('green');
  const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.05, vertexColors: true, ...o });
  const m = {
    dark: base.dark, steel: base.steel, tyre: base.tyre, rim: base.rim, rubber: base.rubber, glass: base.glass,
    camo: std({ map: camoTex(SPEC[kind]), roughness: 0.75 }),
    flat: matCache.get('flat') || std({}),
    decal: matCache.get('decal') || std({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    disc: matCache.get('disc') || new THREE.MeshBasicMaterial({ color: 0x1a1a18, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  };
  matCache.set('flat', m.flat);
  matCache.set('decal', m.decal);
  matCache.set('disc', m.disc);
  matCache.set(kind, m);
  return m;
}

// ------------------------------------------------------------------------------------- geometry
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
// interpolate a station table [{ z, y, w, t, b, p }] at z
function station(tab, z) {
  if (z <= tab[0].z) return tab[0];
  for (let i = 0; i < tab.length - 1; i++) {
    const a = tab[i], b = tab[i + 1];
    if (z <= b.z) {
      const f = (z - a.z) / (b.z - a.z), o = { z };
      for (const k of ['y', 'w', 't', 'b', 'p']) o[k] = (a[k] ?? 2) + ((b[k] ?? 2) - (a[k] ?? 2)) * f;
      return o;
    }
  }
  return tab[tab.length - 1];
}
// a fuselage cross-section: super-ellipse, half width w, t above and b below the centre y
function fring(s, n = 20, scale = 1) {
  const o = [], e = 2 / (s.p ?? 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a), sn = Math.sin(a);
    o.push(V(s.w * scale * spow(c, e), s.y + (sn > 0 ? s.t : s.b) * scale * spow(sn, e), s.z));
  }
  return o;
}
// NACA 00xx thickness at chord fraction t (half thickness per unit chord for thickness ratio th)
const naca = (t, th) => 5 * th * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
// an airfoil ring as [t (0 LE .. 1 TE), offset (+ upper)] in chord units, with a little camber
function airfoil(th, n = 8, camber = 0.02) {
  const o = [];
  for (let i = n; i >= 0; i--) { const t = (1 - Math.cos((i / n) * Math.PI)) / 2; o.push([t, naca(t, th) + camber * Math.sin(Math.PI * t)]); }
  for (let i = 1; i < n; i++) { const t = (1 - Math.cos((i / n) * Math.PI)) / 2; o.push([t, -naca(t, th) + camber * Math.sin(Math.PI * t)]); }
  return o;
}
// wing section at span x: leading edge z, chord, centre height y, thickness ratio
const wring = (x, z, c, y, th, n) => airfoil(th, n).map(([t, d]) => V(x, y + d * c, z + t * c));
// fin section at height y: leading edge z, chord, thickness ratio (thickness across x)
const fin = (y, z, c, th, n) => airfoil(th, n, 0).map(([t, d]) => V(d * c, y, z + t * c));

function lofts(rings, crease = 0.75) {
  const out = [];
  for (let i = 0; i < rings.length - 1; i++) out.push(loft([rings[i], rings[i + 1]], { top: i === rings.length - 2, bottom: i === 0, crease }));
  return out;
}

class Air {
  constructor(kind) {
    this.kind = kind;
    this.P = new Parts(mats(kind));
    this.under = SPEC[kind].under;
  }

  // add a skin geometry split by facing: upward and sideways faces take the camouflage, faces turned
  // down past `split` the under colour (or `lower`, a tint for the invasion stripes)
  // (or by `below(x, y, z)` of the face's first vertex: loft starts both triangles of a quad on the same
  // ring point, so a quad is never split and the demarcation line along a fuselage stays clean)
  skin(g, { split = -0.3, lower = this.under, upperTint = null, below = null } = {}) {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const up = [[], []], dn = [[], []];
    for (let i = 0; i < p.length; i += 9) {
      const ny = (n[i + 1] + n[i + 4] + n[i + 7]) / 3;
      const isDown = below ? below(p[i], p[i + 1], p[i + 2]) : ny < split;
      const dst = isDown ? dn : up;
      for (let k = 0; k < 9; k++) { dst[0].push(p[i + k]); dst[1].push(n[i + k]); }
    }
    const mk = ([pp, nn]) => {
      const b = new THREE.BufferGeometry();
      b.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      b.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      return b;
    };
    if (up[0].length) {
      const u = mk(up);
      if (upperTint != null) this.P.add('flat', u, { tint: upperTint });
      else { projectUV(u, 7); this.P.add('camo', u, { uv: true }); }
    }
    if (dn[0].length) this.P.add('flat', mk(dn), { tint: lower });
  }

  fuselage(tab, zs, bands = []) {
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1], band = bands.find((b) => z0 >= b[0] - 1e-6 && z1 <= b[1] + 1e-6);
      const g = loft([fring(station(tab, z0)), fring(station(tab, z1))], { top: i === zs.length - 2, bottom: i === 0, crease: 0.8 });
      // the demarcation runs low along the sides (camouflage down to about a third of the depth below
      // the centre line), the invasion stripes cover the lower half
      const below = (x, y, z) => { const s = station(tab, z); return y - s.y < (band ? 0.02 : -0.55 * s.b); };
      this.skin(g, { lower: band ? band[2] : this.under, below });
    }
  }

  // wing from span stations [{ x, z, c, y, th }]; mirrored; `bands` [x0, x1, tint] colour the lower surface
  wing(st, bands = [], { n = 9, mirror = true } = {}) {
    for (const s of mirror ? [-1, 1] : [1]) {
      for (let i = 0; i < st.length - 1; i++) {
        const a = st[i], b = st[i + 1];
        const g = loft([wring(s * a.x, a.z, a.c, a.y, a.th, n), wring(s * b.x, b.z, b.c, b.y, b.th, n)], { top: i === st.length - 2, bottom: i === 0, crease: 0.9 });
        const band = bands.find((q) => Math.min(a.x, b.x) >= q[0] - 1e-6 && Math.max(a.x, b.x) <= q[1] + 1e-6);
        this.skin(g, { split: 0, lower: band ? band[2] : this.under });
      }
    }
  }

  fin(st, n = 7) {
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1];
      this.skin(loft([fin(a.y, a.z, a.c, a.th, n), fin(b.y, b.z, b.c, b.th, n)], { crease: 0.9 }));
    }
  }

  add(key, g, o) { this.P.add(key, g, o); }
}

// span station interpolation for decals: the wing's upper surface height at span x (max thickness line)
function wingTop(st, x) {
  let a = st[0], b = st[st.length - 1];
  for (let i = 0; i < st.length - 1; i++) if (x >= st[i].x && x <= st[i + 1].x) { a = st[i]; b = st[i + 1]; break; }
  const f = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x || 1)));
  const c = a.c + (b.c - a.c) * f, z = a.z + (b.z - a.z) * f, y = a.y + (b.y - a.y) * f, th = a.th + (b.th - a.th) * f;
  return { y: y + (naca(0.3, th) + 0.02 * Math.sin(Math.PI * 0.3)) * c, yb: y + (-naca(0.3, th) + 0.02 * Math.sin(Math.PI * 0.3)) * c, z: z + 0.3 * c, c };
}

// roundels and crosses: concentric discs (outer first), facing 'x+', 'x-', 'y' (up) or '-y' (down)
function disc(A, rings, x, y, z, face) {
  const rot = { 'x+': [0, Math.PI / 2, 0], 'x-': [0, -Math.PI / 2, 0], y: [-Math.PI / 2, 0, 0], '-y': [Math.PI / 2, 0, 0] }[face];
  rings.forEach(([R, tint], i) => {
    const g = new THREE.CircleGeometry(R, 28).applyMatrix4(xf(0, 0, 0.002 * i)).applyMatrix4(xf(x, y, z, rot[0], rot[1], rot[2]));
    A.add('decal', g, { tint });
  });
}
const ROUNDEL_C1 = (R) => [[R, 0xc8a020], [R * 0.86, 0x283a6a], [R * 0.5, 0xd8d4c8], [R * 0.4, 0x8a2a24]];
const ROUNDEL_C = (R) => [[R, 0x283a6a], [R * 0.4, 0x8a2a24]];
const ROUNDEL_B = (R) => [[R, 0x283a6a], [R * 0.4, 0x8a2a24]];
function plateDecal(A, shape, tint, x, y, z, face, lift = 0) {
  const rot = { 'x+': [0, Math.PI / 2, 0], 'x-': [0, -Math.PI / 2, 0], y: [-Math.PI / 2, 0, 0], '-y': [Math.PI / 2, 0, 0] }[face];
  A.add('decal', new THREE.ShapeGeometry(shape).applyMatrix4(xf(0, 0, lift)).applyMatrix4(xf(x, y, z, rot[0], rot[1], rot[2])), { tint });
}
function starShape(R) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.4 : R; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return s;
}
function redStar(A, R, x, y, z, face) {
  plateDecal(A, starShape(R * 1.18), 0xd8d4c8, x, y, z, face, 0);
  plateDecal(A, starShape(R), 0x9a1e18, x, y, z, face, 0.003);
}
function crossShape(R, w) { // Balkenkreuz: a cross of four arms of width w
  const s = new THREE.Shape(), a = w / 2;
  [[-a, -R], [a, -R], [a, -a], [R, -a], [R, a], [a, a], [a, R], [-a, R], [-a, a], [-R, a], [-R, -a], [-a, -a]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return s;
}
function balkenkreuz(A, R, x, y, z, face) {
  plateDecal(A, crossShape(R, R * 0.62), 0xd8d4c8, x, y, z, face, 0);
  plateDecal(A, crossShape(R * 0.9, R * 0.36), 0x161616, x, y, z, face, 0.003);
}

// a propeller: n blades of radius R round the hub, a spinner from z0 to z1 (z0 the point); in its own group
function propeller(m, n, R, spinner, { chord = 0.26, tips = 0xc8a020, pitch = 0.35 } = {}) {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const P = new Parts(m);
  const [sl, sr, tint] = spinner;
  P.add(tint == null ? 'dark' : 'flat', zLathe([[-sl, 0.001], [-sl * 0.7, sr * 0.62], [-sl * 0.3, sr * 0.92], [0, sr], [0.05, sr]], 16), { tint: tint ?? 0xffffff });
  for (let i = 0; i < n; i++) {
    const rings = [[0.12, chord * 0.7, 0.07], [R * 0.35, chord, 0.04], [R * 0.85, chord * 0.85, 0.02], [R, chord * 0.45, 0.012]].map(([r, c, t]) => {
      const pts = [[-c / 2, -t / 2], [c / 2, -t / 2], [c / 2, t / 2], [-c / 2, t / 2]];
      return pts.map(([u, w]) => V(u * Math.cos(pitch) - w * Math.sin(pitch), r, u * Math.sin(pitch) + w * Math.cos(pitch) - sl * 0.4));
    });
    const rot = new THREE.Matrix4().makeRotationZ((i / n) * TAU);
    for (const g of lofts(rings, 0)) P.add('dark', g.applyMatrix4(rot), { tint: 0x707070 });
    if (tips != null) P.add('decal', loft([rings[2], rings[3]]).applyMatrix4(rot), { tint: tips });
  }
  P.build(prop);
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 32), m.disc);
  d.position.z = -sl * 0.4;
  d.visible = false;
  d.userData.noShadow = true;
  prop.add(d);
  prop.userData.disc = d;
  return prop;
}

// a main wheel on a leg: wheel centre (x, y, z), radius R, width W, leg top (lx, ly, lz)
function wheelLeg(A, x, y, z, R, W, top, legR = 0.05) {
  A.add('tyre', tyreGeometry(R, W, 0, 22).applyMatrix4(xf(x, y, z)));
  A.add('rim', xTube(x - W * 0.45, x + W * 0.45, R * 0.55, R * 0.55, 12, y, z));
  A.add('steel', rod(V(x - Math.sign(x || 1) * W * 0.5, y, z), V(...top), legR, 8));
}

// ---------------------------------------------------------------------------------------- Typhoon
function typhoon() {
  const m = mats('typhoon'), A = new Air('typhoon'), G = new Air('typhoon');
  const W = 0x1a1a1a, Wh = 0xd8d6cc;
  const tab = [
    { z: -4.55, y: 0.0, w: 0.5, t: 0.52, b: 0.55 }, { z: -4.0, y: 0.0, w: 0.6, t: 0.6, b: 0.95, p: 2.3 }, { z: -3.0, y: 0.0, w: 0.64, t: 0.63, b: 1.02, p: 2.4 },
    { z: -2.0, y: 0.0, w: 0.66, t: 0.66, b: 0.88, p: 2.4 }, { z: -1.0, y: 0.02, w: 0.63, t: 0.7, b: 0.78, p: 2.4 }, { z: 0.4, y: 0.02, w: 0.56, t: 0.66, b: 0.72, p: 2.3 },
    { z: 1.6, y: 0.06, w: 0.46, t: 0.5, b: 0.62 }, { z: 3.0, y: 0.1, w: 0.31, t: 0.36, b: 0.44 }, { z: 4.4, y: 0.16, w: 0.15, t: 0.28, b: 0.24 }, { z: 4.9, y: 0.18, w: 0.04, t: 0.16, b: 0.06 },
  ];
  // invasion stripes, five 18-inch bands, kept on the lower half of the rear fuselage
  const sb = [2.0, 2.457, 2.914, 3.371, 3.828, 4.285];
  const bands = sb.slice(0, 5).map((z, i) => [z, sb[i + 1], i % 2 ? W : Wh]);
  A.fuselage(tab, [-4.55, -4.0, -3.4, -2.8, -2.0, -1.0, -0.2, 0.4, 1.0, 1.6, ...sb, 4.6, 4.9], bands);
  // the chin radiator's mouth, the exhaust stubs, the bubble canopy and its frame
  A.add('dark', box(0.62, 0.42, 0.05, 0, -0.68, -4.12, -0.2));
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) A.add('dark', box(0.08, 0.08, 0.16, s * 0.6, 0.12, -3.9 + k * 0.28, 0, 0, s * 0.3));
  A.add('glass', new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI / 2).applyMatrix4(xf(0, 0.62, -0.35, 0, 0, 0, V(0.42, 0.52, 0.95))));
  A.add('dark', new THREE.TorusGeometry(0.44, 0.022, 5, 20, Math.PI).applyMatrix4(xf(0, 0.64, -0.75, 0, 0, 0, V(0.95, 1.12, 1))));
  A.add('dark', new THREE.TorusGeometry(0.44, 0.02, 5, 20, Math.PI).applyMatrix4(xf(0, 0.64, 0.15, 0, 0, 0, V(0.95, 1.1, 1))));
  A.add('glass', box(0.5, 0.38, 0.05, 0, 0.88, -1.32, -0.75));
  // wing: thick, flat centre section to the undercarriage, 5.5 degrees of dihedral outboard, elliptical tips
  const dih = Math.tan(5.5 * Math.PI / 180), wy = (x) => -0.5 + Math.max(0, x - 1.9) * dih;
  const st = [[0.4, -1.95, 2.75, 0.19], [1.9, -1.88, 2.55, 0.18], [3.2, -1.7, 2.15, 0.16], [4.7, -1.45, 1.75, 0.13], [5.8, -1.15, 1.3, 0.11], [6.33, -0.85, 0.55, 0.09]].map(([x, z, c, th]) => ({ x, z, c, y: wy(x), th }));
  // the lower-surface invasion stripes outboard of the undercarriage, under the rocket rails
  const wb = [2.1, 2.557, 3.014, 3.471, 3.928, 4.385];
  const span = [st[0], st[1], ...wb.map((x) => { const q = wingTop(st, x); return { x, z: q.z - 0.3 * q.c, c: q.c, y: wy(x), th: st[1].th + (st[3].th - st[1].th) * (x - 1.9) / 2.8 }; }), st[3], st[4], st[5]];
  span.sort((a, b) => a.x - b.x);
  A.wing(span, wb.slice(0, 5).map((x, i) => [x, wb[i + 1], i % 2 ? W : Wh]));
  // four 20 mm Hispanos in their fairings
  for (const s of [-1, 1]) for (const x of [2.45, 2.95]) {
    A.add('dark', zTube(-2.65, -1.6 + (x - 2) * 0.12, 0.03, 0.03, 8, s * x, wy(x) + 0.02));
    A.add('flat', zTube(-2.05, -1.6, 0.06, 0.07, 10, s * x, wy(x) + 0.02), { tint: 0x5c6168 });
  }
  // tailplane and fin with rudder
  A.wing([{ x: 0.1, z: 3.95, c: 1.15, y: 0.25, th: 0.1 }, { x: 2.35, z: 4.25, c: 0.62, y: 0.28, th: 0.08 }], [], { n: 6 });
  A.fin([{ y: 0.2, z: 3.6, c: 1.45, th: 0.1 }, { y: 1.15, z: 4.05, c: 0.98, th: 0.09 }, { y: 1.7, z: 4.35, c: 0.5, th: 0.08 }]);
  // markings: C1 roundels on the fuselage, C roundels on the upper wings, the fin flash, the Sky spinner band
  for (const s of [-1, 1]) {
    const f = station(tab, 1.2);
    disc(A, ROUNDEL_C1(0.46), s * (f.w + 0.015), f.y + 0.05, 1.2, s > 0 ? 'x+' : 'x-');
    const q = wingTop(st, 4.7);
    disc(A, ROUNDEL_C(0.6), s * 4.7, q.y + 0.012, q.z + 0.15, 'y');
    A.add('decal', box(0.012, 0.5, 0.18, s * 0.075, 0.6, 4.3), { tint: 0x8a2a24 });
    A.add('decal', box(0.012, 0.5, 0.1, s * 0.07, 0.6, 4.16), { tint: 0xd8d4c8 });
    A.add('decal', box(0.012, 0.5, 0.18, s * 0.062, 0.6, 4.02), { tint: 0x283a6a });
  }
  // undercarriage (retracts): wide-track legs with doors, the tail wheel
  for (const s of [-1, 1]) {
    wheelLeg(G, s * 1.85, -1.97, -1.45, 0.43, 0.2, [s * 1.75, -0.6, -1.6], 0.06);
    G.add('flat', box(0.02, 1.0, 0.55, s * 1.95, -1.25, -1.5), { tint: 0x8e9294 });
  }
  wheelLeg(G, 0, -0.62, 4.2, 0.15, 0.08, [0, -0.1, 3.9], 0.035);
  // eight RP-3 rockets on their rails under the outer wings, each its own mesh
  const stores = [];
  for (const s of [-1, 1]) for (const x of [3.25, 3.7, 4.15, 4.6]) {
    const q = wingTop(st, x), y = q.yb - 0.02;
    A.add('dark', box(0.04, 0.06, 1.75, s * x, y - 0.03, -1.0));
    const R = new Parts(m);
    R.add('flat', zTube(-0.4, 1.0, 0.042, 0.042, 8, 0, 0), { tint: 0x4a5040 });
    R.add('flat', zTube(-0.78, -0.4, 0.04, 0.076, 10, 0, 0), { tint: 0x6a6648 });
    R.add('flat', zTube(-0.92, -0.78, 0.01, 0.04, 8, 0, 0), { tint: 0x6a6648 });
    for (let k = 0; k < 4; k++) R.add('flat', box(0.006, 0.3, 0.22, 0, 0, 0.88).applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI / 4 * 2 + Math.PI / 4)), { tint: 0x4a5040 });
    const g = new THREE.Group();
    g.position.set(s * x, y - 0.13, -1.05);
    R.build(g);
    stores.push(g);
  }
  const prop = propeller(m, 4, 2.13, [0.8, 0.3, 0xb8c4a6], { chord: 0.3 });
  prop.position.set(0, 0.0, -4.55);
  return { A, G, prop, stores, main: [1.85, -2.4, -1.45], tail: [0, -0.77, 4.2], length: 9.73, span: 12.67 };
}

// --------------------------------------------------------------------------------------------- Il-2
function il2() {
  const m = mats('il2'), A = new Air('il2'), G = new Air('il2');
  const tab = [
    { z: -5.25, y: 0, w: 0.4, t: 0.42, b: 0.46, p: 2.4 }, { z: -4.3, y: 0, w: 0.6, t: 0.55, b: 0.72, p: 3 }, { z: -2.6, y: 0, w: 0.68, t: 0.6, b: 0.85, p: 3 },
    { z: -1.5, y: 0, w: 0.68, t: 0.64, b: 0.86, p: 2.8 }, { z: 0.6, y: 0.02, w: 0.62, t: 0.62, b: 0.76, p: 2.6 }, { z: 1.6, y: 0.05, w: 0.5, t: 0.5, b: 0.62, p: 2.3 },
    { z: 3.5, y: 0.12, w: 0.3, t: 0.36, b: 0.42 }, { z: 5.5, y: 0.2, w: 0.12, t: 0.28, b: 0.18 }, { z: 6.3, y: 0.24, w: 0.04, t: 0.16, b: 0.05 },
  ];
  A.fuselage(tab, [-5.25, -4.3, -3.4, -2.6, -1.5, -0.4, 0.6, 1.6, 2.5, 3.5, 4.5, 5.5, 6.3]);
  // the long cockpit greenhouse for pilot and gunner, the gunner's UBT machine gun, the armoured nose's oil cooler
  A.add('glass', loft([fring({ z: -1.7, y: 0.55, w: 0.3, t: 0.05, b: 0.02, p: 3 }, 12), fring({ z: -1.2, y: 0.55, w: 0.42, t: 0.42, b: 0.02, p: 3 }, 12)], { crease: 0.8 }));
  A.add('glass', loft([fring({ z: -1.2, y: 0.55, w: 0.42, t: 0.42, b: 0.02, p: 3 }, 12), fring({ z: 0.9, y: 0.55, w: 0.4, t: 0.36, b: 0.02, p: 3 }, 12)], { crease: 0.8 }));
  for (const z of [-1.2, -0.45, 0.2, 0.9]) A.add('dark', box(0.84, 0.03, 0.04, 0, 0.55 + 0.38, z));
  A.add('dark', zTube(0.9, 1.9, 0.02, 0.02, 6, 0, 0.92));
  A.add('dark', box(0.4, 0.28, 0.4, 0, -0.85, -3.4));
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) A.add('dark', box(0.08, 0.08, 0.14, s * 0.62, 0.2, -4.0 + k * 0.25));
  // centre section flat, outer panels swept back 15 degrees with dihedral
  const dih = Math.tan(6 * Math.PI / 180), wy = (x) => -0.62 + Math.max(0, x - 2.4) * dih, sw = Math.tan(15 * Math.PI / 180);
  const st = [[0.4, -1.85, 3.25, 0.17], [2.4, -1.75, 3.0, 0.16], [4.6, -1.75 + 2.2 * sw, 2.35, 0.13], [6.9, -1.75 + 4.5 * sw, 1.65, 0.11], [7.3, -1.75 + 4.9 * sw + 0.15, 1.15, 0.1]].map(([x, z, c, th]) => ({ x, z, c, y: wy(x), th }));
  A.wing(st);
  // undercarriage pods under the wing (always there) with the legs and wheels (retract backwards into them)
  for (const s of [-1, 1]) {
    for (const g of lofts([fring({ z: -2.1, y: -0.82, w: 0.04, t: 0.04, b: 0.04 }, 10), fring({ z: -1.6, y: -0.85, w: 0.26, t: 0.24, b: 0.32 }, 10), fring({ z: 0.2, y: -0.8, w: 0.26, t: 0.24, b: 0.32 }, 10), fring({ z: 0.9, y: -0.75, w: 0.05, t: 0.06, b: 0.06 }, 10)])) A.skin(g.applyMatrix4(xf(s * 2.25, 0, 0)));
    wheelLeg(G, s * 2.25, -2.2, -1.45, 0.42, 0.22, [s * 2.25, -0.9, -1.2], 0.07);
    G.add('steel', rod(V(s * 2.25, -2.0, -1.4), V(s * 2.25, -0.95, -0.4), 0.04, 6));
  }
  wheelLeg(G, 0, -0.78, 5.3, 0.17, 0.1, [0, -0.2, 5.05], 0.04);
  // tail surfaces
  A.wing([{ x: 0.1, z: 4.9, c: 1.3, y: 0.32, th: 0.1 }, { x: 2.0, z: 5.35, c: 0.75, y: 0.32, th: 0.08 }], [], { n: 6 });
  A.fin([{ y: 0.3, z: 4.7, c: 1.55, th: 0.1 }, { y: 1.3, z: 5.25, c: 1.0, th: 0.09 }, { y: 1.75, z: 5.6, c: 0.55, th: 0.08 }]);
  // red stars on the fuselage, the fin and under the wings
  for (const s of [-1, 1]) {
    const f = station(tab, 3.2);
    redStar(A, 0.4, s * (f.w + 0.012), f.y + 0.03, 3.2, s > 0 ? 'x+' : 'x-');
    redStar(A, 0.3, s * 0.085, 1.0, 5.45, s > 0 ? 'x+' : 'x-');
    const q = wingTop(st, 5.4);
    redStar(A, 0.55, s * 5.4, q.yb - 0.012, q.z + 0.1, '-y');
  }
  // stores: four RS-82 rockets under the outer wings, two FAB-100 bombs under the centre section
  const stores = [];
  for (const s of [-1, 1]) for (const x of [3.6, 4.2]) {
    const q = wingTop(st, x), y = q.yb - 0.05;
    A.add('dark', box(0.04, 0.05, 1.3, s * x, y, q.z - 0.1));
    const R = new Parts(m);
    R.add('flat', zTube(-0.42, 0.42, 0.041, 0.041, 8), { tint: 0x5a5a4a });
    R.add('flat', zTube(-0.55, -0.42, 0.01, 0.041, 8), { tint: 0x5a5a4a });
    for (let k = 0; k < 4; k++) R.add('flat', box(0.006, 0.22, 0.18, 0, 0, 0.36).applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI / 2 + Math.PI / 4)), { tint: 0x5a5a4a });
    const g = new THREE.Group();
    g.position.set(s * x, y - 0.09, q.z - 0.1);
    R.build(g);
    stores.push(g);
  }
  for (const s of [-1, 1]) {
    const R = new Parts(m);
    R.add('flat', zTube(-0.5, 0.35, 0.13, 0.13, 12), { tint: 0x5a5e4a });
    R.add('flat', zTube(-0.7, -0.5, 0.04, 0.13, 12), { tint: 0x5a5e4a });
    R.add('flat', zTube(0.35, 0.65, 0.13, 0.05, 12), { tint: 0x5a5e4a });
    for (let k = 0; k < 4; k++) R.add('flat', box(0.006, 0.34, 0.22, 0, 0, 0.6).applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI / 2)), { tint: 0x5a5e4a });
    const g = new THREE.Group();
    g.position.set(s * 1.25, -1.05, -0.9);
    R.build(g);
    stores.push(g);
  }
  const prop = propeller(m, 3, 1.8, [0.75, 0.24, null], { chord: 0.28, tips: null });
  prop.position.set(0, 0.0, -5.25);
  return { A, G, prop, stores, main: [2.25, -2.62, -1.45], tail: [0, -0.95, 5.3], length: 11.6, span: 14.6 };
}

// ------------------------------------------------------------------------------------------ Storch
function storch() {
  const m = mats('storch'), A = new Air('storch'), G = new Air('storch');
  const tab = [
    { z: -3.95, y: 0.02, w: 0.3, t: 0.3, b: 0.4, p: 3 }, { z: -3.1, y: 0.02, w: 0.42, t: 0.42, b: 0.48, p: 3 }, { z: -2.3, y: 0.0, w: 0.48, t: 0.48, b: 0.52, p: 3 },
    { z: -1.2, y: -0.05, w: 0.52, t: 0.3, b: 0.52, p: 3 }, { z: 0.0, y: 0.0, w: 0.48, t: 0.42, b: 0.48, p: 2.6 }, { z: 1.5, y: 0.05, w: 0.3, t: 0.3, b: 0.32, p: 2.4 },
    { z: 3.5, y: 0.08, w: 0.15, t: 0.18, b: 0.16 }, { z: 5.6, y: 0.12, w: 0.06, t: 0.1, b: 0.06 }, { z: 6.0, y: 0.14, w: 0.02, t: 0.05, b: 0.02 },
  ];
  A.fuselage(tab, [-3.95, -3.1, -2.3, -1.6, -1.2, -0.6, 0.0, 0.8, 1.5, 2.5, 3.5, 4.6, 5.6, 6.0]);
  // the greenhouse cabin: big panes bulging out past the fuselage sides, under the wing
  const cab = (z, w, y0, y1) => fring({ z, y: (y0 + y1) / 2, w, t: (y1 - y0) / 2, b: (y1 - y0) / 2, p: 3.2 }, 12);
  for (const g of lofts([cab(-2.35, 0.45, 0.35, 0.9), cab(-1.9, 0.6, 0.15, 1.3), cab(-0.6, 0.64, 0.12, 1.32), cab(0.05, 0.5, 0.2, 1.3)], 0.6)) A.add('glass', g);
  for (const z of [-1.9, -1.25, -0.6]) A.add('dark', box(1.3, 0.03, 0.035, 0, 0.72, z));
  for (const z of [-1.9, -1.25, -0.6]) for (const s of [-1, 1]) A.add('dark', box(0.03, 1.12, 0.035, s * 0.62, 0.72, z));
  A.add('dark', box(0.2, 0.25, 0.3, 0, -0.42, -3.2)); // the Argus's air intake
  for (const s of [-1, 1]) A.add('dark', zTube(-3.4, -2.6, 0.035, 0.035, 6, s * 0.36, -0.3));
  // the high wing with its leading-edge slats and the slotted flaps and ailerons trailing below
  const st = [[0.4, -2.2, 2.05, 0.13], [6.6, -2.2, 2.05, 0.12], [7.12, -2.05, 1.6, 0.1]].map(([x, z, c, th]) => ({ x, z, c, y: 1.38 + (x - 0.4) * 0.025, th }));
  A.wing(st);
  for (const s of [-1, 1]) {
    A.add('flat', box(6.0, 0.03, 0.22, s * 3.7, 1.36 + 3.3 * 0.025, -2.42), { tint: SPEC.storch.upper[0] });
    A.add('flat', box(6.4, 0.03, 0.4, s * 3.8, 1.25 + 3.3 * 0.025, 0.05, -0.12), { tint: SPEC.storch.upper[1] });
    // V struts from the lower fuselage to the wing, and the jury struts
    for (const z of [-1.9, -0.55]) A.add('steel', rod(V(s * 0.35, -0.45, z), V(s * 3.1, 1.3, z - 0.1), 0.035, 6));
    A.add('steel', rod(V(s * 1.6, 0.38, -1.25), V(s * 1.6, 1.33, -1.25), 0.02, 5));
  }
  // tail
  A.wing([{ x: 0.05, z: 5.0, c: 1.15, y: 0.25, th: 0.08 }, { x: 2.2, z: 5.2, c: 0.8, y: 0.25, th: 0.07 }], [], { n: 6 });
  A.fin([{ y: 0.15, z: 4.95, c: 1.25, th: 0.08 }, { y: 0.85, z: 5.2, c: 1.0, th: 0.08 }, { y: 1.3, z: 5.45, c: 0.6, th: 0.07 }]);
  // crosses: fuselage sides, upper and lower wings (no tail emblem)
  for (const s of [-1, 1]) {
    const f = station(tab, 2.4);
    balkenkreuz(A, 0.38, s * (f.w + 0.012), f.y, 2.4, s > 0 ? 'x+' : 'x-');
    const q = wingTop(st, 5.2);
    balkenkreuz(A, 0.55, s * 5.2, q.y + 0.012, q.z + 0.15, 'y');
    balkenkreuz(A, 0.55, s * 5.2, q.yb - 0.012, q.z + 0.15, '-y');
  }
  // the fixed long-stroke undercarriage: oleo legs up to the cabin roof, V braces to the fuselage floor
  for (const s of [-1, 1]) {
    const w = [s * 1.45, -1.62, -1.75];
    A.add('tyre', tyreGeometry(0.33, 0.18, 0, 22).applyMatrix4(xf(...w)));
    A.add('rim', xTube(w[0] - 0.08, w[0] + 0.08, 0.17, 0.17, 12, w[1], w[2]));
    A.add('steel', rod(V(w[0] - s * 0.1, w[1] + 0.05, w[2]), V(s * 0.55, 0.95, -1.95), 0.05, 8));
    A.add('dark', rod(V(w[0] - s * 0.1, w[1] + 0.3, w[2]), V(s * 0.95, -0.25, w[2] + 0.04), 0.075, 8));
    A.add('steel', rod(V(w[0] - s * 0.1, w[1] + 0.05, w[2]), V(s * 0.3, -0.5, -1.2), 0.03, 6));
    A.add('steel', rod(V(w[0] - s * 0.1, w[1] + 0.05, w[2]), V(s * 0.3, -0.5, -2.2), 0.03, 6));
  }
  wheelLeg(A, 0, -0.32, 5.6, 0.12, 0.06, [0, 0.0, 5.4], 0.03);
  const prop = propeller(m, 2, 1.3, [0.35, 0.16, null], { chord: 0.2, tips: null, pitch: 0.4 });
  prop.position.set(0, 0.06, -3.95);
  return { A, G, prop, stores: [], main: [1.45, -1.95, -1.75], tail: [0, -0.44, 5.6], length: 9.9, span: 14.25 };
}

// ------------------------------------------------------------------------------------------- Auster
function auster() {
  const m = mats('auster'), A = new Air('auster');
  const tab = [
    { z: -3.0, y: 0.0, w: 0.36, t: 0.32, b: 0.32, p: 2.6 }, { z: -2.3, y: 0.02, w: 0.48, t: 0.42, b: 0.45, p: 3 }, { z: -1.6, y: 0.0, w: 0.5, t: 0.5, b: 0.48, p: 3.4 },
    { z: 0.3, y: 0.0, w: 0.48, t: 0.82, b: 0.46, p: 3.4 }, { z: 1.0, y: 0.04, w: 0.38, t: 0.42, b: 0.4, p: 3 }, { z: 3.0, y: 0.1, w: 0.13, t: 0.2, b: 0.13, p: 2.4 },
    { z: 3.8, y: 0.12, w: 0.03, t: 0.06, b: 0.03 },
  ];
  A.fuselage(tab, [-3.0, -2.3, -1.6, -0.6, 0.3, 1.0, 2.0, 3.0, 3.8]);
  // the cabin glazing: sloped windscreen, the side windows and the AOP's extended rear glazing
  A.add('glass', box(0.84, 0.5, 0.03, 0, 0.72, -1.55, -0.55));
  for (const s of [-1, 1]) {
    A.add('glass', box(0.02, 0.48, 1.25, s * 0.5, 0.65, -0.6));
    A.add('glass', box(0.02, 0.35, 0.5, s * 0.46, 0.62, 0.45, 0, s * 0.12, 0));
  }
  const st = [[0.4, -1.55, 1.6, 0.13], [5.15, -1.55, 1.6, 0.12], [5.49, -1.45, 1.25, 0.1]].map(([x, z, c, th]) => ({ x, z, c, y: 0.95 + (x - 0.4) * 0.03, th }));
  A.wing(st);
  for (const s of [-1, 1]) {
    for (const z of [-1.3, -0.25]) A.add('steel', rod(V(s * 0.45, -0.4, z), V(s * 2.5, 0.98, z), 0.03, 6));
    // main gear legs and wheels (fixed)
    const w = [s * 0.95, -1.05, -1.2];
    A.add('tyre', tyreGeometry(0.25, 0.14, 0, 20).applyMatrix4(xf(...w)));
    A.add('rim', xTube(w[0] - 0.06, w[0] + 0.06, 0.12, 0.12, 10, w[1], w[2]));
    A.add('steel', rod(V(w[0] - s * 0.08, w[1], w[2]), V(s * 0.4, -0.35, -1.5), 0.035, 6));
    A.add('steel', rod(V(w[0] - s * 0.08, w[1], w[2]), V(s * 0.4, -0.35, -0.8), 0.03, 6));
    const f = station(tab, 1.7);
    disc(A, ROUNDEL_C1(0.3), s * (f.w + 0.012), f.y + 0.02, 1.7, s > 0 ? 'x+' : 'x-');
    const q = wingTop(st, 3.6);
    disc(A, ROUNDEL_B(0.55), s * 3.6, q.y + 0.012, q.z + 0.1, 'y');
  }
  wheelLeg(A, 0, -0.3, 3.4, 0.08, 0.05, [0, -0.05, 3.2], 0.02);
  A.wing([{ x: 0.05, z: 3.0, c: 0.85, y: 0.15, th: 0.08 }, { x: 1.7, z: 3.15, c: 0.6, y: 0.15, th: 0.07 }], [], { n: 6 });
  A.fin([{ y: 0.12, z: 2.9, c: 0.95, th: 0.08 }, { y: 0.7, z: 3.25, c: 0.6, th: 0.08 }, { y: 0.95, z: 3.45, c: 0.35, th: 0.07 }]);
  for (const [i, t] of [[0, 0x8a2a24], [1, 0xd8d4c8], [2, 0x283a6a]]) for (const s of [-1, 1]) A.add('decal', box(0.01, 0.28, 0.09, s * 0.05, 0.42, 3.05 + i * 0.09), { tint: t });
  const prop = propeller(m, 2, 0.95, [0.22, 0.13, null], { chord: 0.16, tips: 0xc8a020, pitch: 0.4 });
  prop.position.set(0, 0.0, -3.02);
  return { A, G: null, prop, stores: [], main: [0.95, -1.3, -1.2], tail: [0, -0.38, 3.4], length: 6.83, span: 10.97 };
}

const BUILDERS = { typhoon, il2, storch, auster };
export const AIRCRAFT_KINDS = Object.keys(BUILDERS);

export function buildAircraft(kind = 'typhoon') {
  const f = BUILDERS[kind];
  if (!f) throw new Error('unknown aircraft kind ' + kind);
  const b = f();
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'aircraft-' + kind;
  root.add(body);
  const parts = [...b.A.P.build(body)];
  let gear = null;
  if (b.G) {
    gear = new THREE.Group();
    gear.name = 'gear';
    parts.push(...b.G.P.build(gear));
    body.add(gear);
  }
  body.add(b.prop);
  for (const s of b.stores) body.add(s);
  // parked: rotate about x so the main wheels and the tail wheel both touch y = 0
  const [, my, mz] = b.main, [, ty, tz] = b.tail;
  const pitch = Math.atan2(ty - my, tz - mz);
  const out = {
    root, body, prop: b.prop, gear, stores: b.stores, parts, length: b.length, span: b.span, kind,
    setParked(on) {
      if (on) {
        body.rotation.set(pitch, 0, 0);
        body.position.set(0, -(my * Math.cos(pitch) - mz * Math.sin(pitch)), 0);
      } else {
        body.rotation.set(0, 0, 0);
        body.position.set(0, 0, 0);
      }
      out.parked = on;
    },
    setGear(k) { if (gear) gear.visible = k > 0.5; },
  };
  out.setParked(true);
  root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  out.height = new THREE.Box3().setFromObject(root).max.y;
  return out;
}

import * as THREE from 'three';
import { V, box, xTube, zTube, yTube, rod, loft, xf, zLathe, Parts, projectUV, vehicleMats, tyreGeometry } from '../../kit.js';

// British aircraft of the WW1 German mode (DESIGN.md "WW1 German mode"): the Royal Aircraft
// Factory R.E.8, the two-seat artillery spotter (RAF 4a V12 with its big air scoop and the two exhaust stacks
// standing above the upper wing, the long upper-wing extensions on raked struts, the observer's Scarff ring, a
// four-bladed propeller), and the Sopwith F.1 Camel on ground attack (the Clerget rotary turning with the
// propeller inside its open-bottomed cowling, the hump over the twin Vickers, a flat upper wing with its cut-out
// over a lower wing with 5 degrees of dihedral, four 20 lb Cooper bombs under the fuselage). PC10 khaki-green over
// clear doped linen, Type A roundels (blue, white, red), rudder stripes blue-white-red.
//
// buildAircraft1918(kind) -> the interface of models/t/ww2/aircraft.js buildAircraft:
//   root     Group; model space nose toward -Z, metres, real sizes
//   body     the airframe inside root: setParked(true) (the default) sits it on its wheels and tail skid with the
//            wheels on y = 0; setParked(false) levels it with the origin on the thrust line, for flight
//   prop     Object3D named 'prop' (spin it about its Z: prop.rotation.z += w * dt); the Camel's rotary engine
//            turns with it; prop.userData.disc is a faint blur disc (hidden) to show at full revs
//   gear     null (the undercarriage is fixed); setGear(k) does nothing
//   stores   [Object3D] the Camel's four Cooper bombs, one per round, to hide as they drop (none on the R.E.8)
//   parts    [Mesh] every mesh of the airframe (to char or hide)
//   length, span, height (parked), kind, setParked(on), setGear(k)
//   crew     [Object3D] the heads of the pilot (and the observer), to hide on the ground if wanted

const TAU = Math.PI * 2;
const PC10 = 0x5a5838, CDL = 0xd6caa0, GREY = 0x9a9c96, PLY = 0x9a7048, WOOD = 0x8a6a40;
const ROUNDEL = (R) => [[R, 0x283a6a], [R * 0.66, 0xe0dccc], [R * 0.33, 0x9a2a24]];

// ------------------------------------------------------------------------------------- materials
let MATS = null;
function ribTexture() { // doped linen over the ribs: a faint rib tape every tile, the fabric's weave
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.13)';
  g.fillRect(0, 0, 5, S);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(5, 0, 2, S);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.04)`;
    g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 12, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function mats() {
  if (MATS) return MATS;
  const base = vehicleMats('green');
  const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.02, vertexColors: true, ...o });
  MATS = {
    dark: base.dark, steel: base.steel, tyre: base.tyre, rim: base.rim, glass: base.glass,
    fabric: std({ map: ribTexture(), roughness: 0.8 }),
    flat: std({}),
    metal: std({ roughness: 0.45, metalness: 0.55 }),
    decal: std({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    disc: new THREE.MeshBasicMaterial({ color: 0x1a1a18, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  };
  return MATS;
}

// ------------------------------------------------------------------------------------- geometry
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
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
// a fuselage cross-section: super-ellipse of half width w, t above and b below the centre y (WW1 fuselages are
// flat-sided boxes with a rounded decking: p 4 and more)
function fring(s, n = 16) {
  const o = [], e = 2 / (s.p ?? 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a), sn = Math.sin(a);
    o.push(V(s.w * spow(c, e), s.y + (sn > 0 ? s.t : s.b) * spow(sn, e), s.z));
  }
  return o;
}
// a thin cambered wing section (RAF 15 like: 6 to 8 % thick, the camber well forward)
const naca = (t, th) => 5 * th * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
function airfoil(th, n = 7, camber = 0.04) {
  const o = [];
  for (let i = n; i >= 0; i--) { const t = (1 - Math.cos((i / n) * Math.PI)) / 2; o.push([t, naca(t, th) + camber * Math.sin(Math.PI * t ** 0.8)]); }
  for (let i = 1; i < n; i++) { const t = (1 - Math.cos((i / n) * Math.PI)) / 2; o.push([t, -naca(t, th) * 0.6 + camber * Math.sin(Math.PI * t ** 0.8)]); }
  return o;
}
const wring = (x, z, c, y, th) => airfoil(th).map(([t, d]) => V(x, y + d * c, z + t * c));
const fin = (y, z, c, th) => airfoil(th, 6, 0).map(([t, d]) => V(d * c, y, z + t * c));

class Air {
  constructor() { this.P = new Parts(mats()); }
  add(key, g, o) { this.P.add(key, g, o); }
  // a fabric skin split by facing: up and sideways faces take `upper`, faces turned down the linen (or `lower`)
  skin(g, { split = -0.35, upper = PC10, lower = CDL, below = null } = {}) {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array, up = [[], []], dn = [[], []];
    for (let i = 0; i < p.length; i += 9) {
      const ny = (n[i + 1] + n[i + 4] + n[i + 7]) / 3;
      const dst = (below ? below(p[i], p[i + 1], p[i + 2]) : ny < split) ? dn : up;
      for (let k = 0; k < 9; k++) { dst[0].push(p[i + k]); dst[1].push(n[i + k]); }
    }
    const mk = ([pp, nn], tint) => {
      if (!pp.length) return;
      const b = new THREE.BufferGeometry();
      b.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      b.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      projectUV(b, 0.36);
      this.P.add('fabric', b, { tint, uv: true });
    };
    mk(up, upper);
    mk(dn, lower);
  }
  // fuselage from z stations; bands [z0, z1, key, tint] paint a stretch (the engine's metal panels, plywood)
  fuselage(tab, zs, bands = []) {
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1], band = bands.find((b) => z0 >= b[0] - 1e-6 && z1 <= b[1] + 1e-6);
      const g = loft([fring(station(tab, z0)), fring(station(tab, z1))], { top: i === zs.length - 2, bottom: i === 0, crease: 0.8 });
      if (band) this.add(band[2], g, { tint: band[3] });
      else this.skin(g, { below: (x, y, z) => { const s = station(tab, z); return y - s.y < -0.88 * s.b; } });
    }
  }
  // wing panels between span stations [{ x, z, c, y, th }] (x > 0), mirrored
  wing(st, { mirror = true } = {}) {
    for (const s of mirror ? [-1, 1] : [1]) for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1];
      this.skin(loft([wring(s * a.x, a.z, a.c, a.y, a.th), wring(s * b.x, b.z, b.c, b.y, b.th)], { crease: 0.9 }), { split: 0 });
    }
  }
  fin(st, o) {
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1];
      this.skin(loft([fin(a.y, a.z, a.c, a.th), fin(b.y, b.z, b.c, b.th)], { crease: 0.9 }), o);
    }
  }
}
// the wing's upper (y) and lower (yb) surface height at span x, and the chord's quarter point z
function wingAt(st, x) {
  let a = st[0], b = st[st.length - 1];
  for (let i = 0; i < st.length - 1; i++) if (x >= st[i].x && x <= st[i + 1].x) { a = st[i]; b = st[i + 1]; break; }
  const f = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x || 1)));
  const c = a.c + (b.c - a.c) * f, z = a.z + (b.z - a.z) * f, y = a.y + (b.y - a.y) * f, th = a.th + (b.th - a.th) * f;
  return { y: y + (naca(0.3, th) + 0.04) * c, yb: y + (-naca(0.3, th) * 0.6 + 0.04) * c, z, c, mid: y + 0.04 * c };
}
// concentric discs facing 'x+', 'x-', 'y' (up) or '-y' (down)
function disc(A, rings, x, y, z, face) {
  const rot = { 'x+': [0, Math.PI / 2, 0], 'x-': [0, -Math.PI / 2, 0], y: [-Math.PI / 2, 0, 0], '-y': [Math.PI / 2, 0, 0] }[face];
  rings.forEach(([R, tint], i) => A.add('decal', new THREE.CircleGeometry(R, 28).applyMatrix4(xf(0, 0, 0.002 * i)).applyMatrix4(xf(x, y, z, rot[0], rot[1], rot[2])), { tint }));
}
// a streamlined strut (wood) or a wire from a to b
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _d = new THREE.Vector3();
function strut(a, b, w = 0.035, d = 0.09) {
  _d.subVectors(b, a);
  const L = _d.length();
  _q.setFromUnitVectors(V(0, 1, 0), _d.normalize());
  return new THREE.CylinderGeometry(1, 1, L, 8).applyMatrix4(new THREE.Matrix4().makeScale(w, 1, d / 2)).applyMatrix4(_m.compose(a.clone().add(b).multiplyScalar(0.5), _q, V(1, 1, 1)));
}
const wire = (a, b) => rod(a, b, 0.005, 3);
// rudder stripes on both sides: blue (forward), white, red, from z0 to z1 between y0 and y1
function stripes(A, x, z0, z1, y0, y1) {
  const w = (z1 - z0) / 3;
  [0x283a6a, 0xe0dccc, 0x9a2a24].forEach((tint, i) => {
    for (const s of [-1, 1]) A.add('decal', box(0.006, y1 - y0, w, s * x, (y0 + y1) / 2, z0 + w * (i + 0.5)), { tint });
  });
}

// a wooden propeller: n blades of radius R round the hub; its own group, spun about Z
function propeller(m, n, R, { chord = 0.2, pitch = 0.4, hub = 0.1 } = {}) {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const P = new Parts(m);
  P.add('flat', zTube(-0.12, 0.08, hub, hub, 14), { tint: 0x6a6a68 });
  P.add('flat', zTube(-0.16, -0.12, hub * 0.7, hub, 14), { tint: 0x6a6a68 });
  for (let i = 0; i < n; i++) {
    const rings = [[0.06, chord * 0.75, 0.09], [R * 0.3, chord * 1.05, 0.05], [R * 0.7, chord, 0.03], [R * 0.96, chord * 0.7, 0.018], [R, chord * 0.3, 0.012]].map(([r, c, t]) => {
      const pts = [[-c / 2, -t / 2], [c / 2, -t / 2], [c / 2, t / 2], [-c / 2, t / 2]], pp = pitch * (1 - r / (R * 2.2));
      return pts.map(([u, w]) => V(u * Math.cos(pp) - w * Math.sin(pp), r, u * Math.sin(pp) + w * Math.cos(pp) - 0.04));
    });
    const rot = new THREE.Matrix4().makeRotationZ((i / n) * TAU);
    for (let k = 0; k < rings.length - 1; k++) P.add('flat', loft([rings[k], rings[k + 1]], { top: k === rings.length - 2, bottom: k === 0 }).applyMatrix4(rot), { tint: 0x7a5232 });
  }
  P.build(prop);
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 32), m.disc);
  d.position.z = -0.04;
  d.visible = false;
  d.userData.noShadow = true;
  prop.add(d);
  prop.userData.disc = d;
  return prop;
}
// a wire-spoked wheel under a fabric cover disc: centre (x, y, z), radius R, width W
function wheel(A, x, y, z, R, W) {
  A.add('tyre', tyreGeometry(R, W, 0, 22).applyMatrix4(xf(x, y, z)));
  for (const s of [-1, 1]) A.add('flat', new THREE.CircleGeometry(R * 0.8, 20).applyMatrix4(xf(x + s * W * 0.25, y, z, 0, s * Math.PI / 2, 0)), { tint: 0xc8c0a4 });
  A.add('dark', xTube(x - W * 0.45, x + W * 0.45, 0.04, 0.04, 8, y, z));
}
// a seated head and shoulders in a leather flying helmet
function head(m, x, y, z) {
  const g = new THREE.Group(), P = new Parts(m);
  P.add('flat', new THREE.SphereGeometry(0.11, 10, 8).scale(1, 1.1, 1.05), { tint: 0x4a3426 });
  P.add('flat', box(0.38, 0.2, 0.24, 0, -0.2, 0.02), { tint: 0x5a4a34 });
  P.add('dark', box(0.15, 0.04, 0.03, 0, 0.02, -0.11));
  P.build(g);
  g.position.set(x, y, z);
  return g;
}

// ------------------------------------------------------------------------------------------- R.E.8
function re8() {
  const m = mats(), A = new Air();
  // fuselage: deep at the engine, the pilot under the upper wing's trailing edge, the observer behind
  const tab = [
    { z: -3.72, y: -0.02, w: 0.4, t: 0.42, b: 0.46, p: 3 }, { z: -3.2, y: -0.02, w: 0.46, t: 0.45, b: 0.6, p: 4 }, { z: -2.2, y: 0, w: 0.48, t: 0.47, b: 0.62, p: 5 },
    { z: -0.9, y: 0, w: 0.47, t: 0.48, b: 0.58, p: 5 }, { z: 0.5, y: 0.02, w: 0.42, t: 0.44, b: 0.5, p: 4.5 }, { z: 2.0, y: 0.06, w: 0.28, t: 0.32, b: 0.36, p: 4 },
    { z: 3.6, y: 0.1, w: 0.14, t: 0.2, b: 0.18, p: 3 }, { z: 4.25, y: 0.12, w: 0.04, t: 0.1, b: 0.06, p: 2.5 },
  ];
  A.fuselage(tab, [-3.72, -3.2, -2.6, -2.2, -1.6, -0.9, -0.2, 0.5, 1.2, 2.0, 2.8, 3.6, 4.25], [[-3.72, -1.6, 'metal', GREY]]);
  // the RAF 4a: two banks of finned cylinders standing out of the cowling, the big air scoop over them, the two
  // exhaust stacks up past the upper wing
  for (const s of [-1, 1]) {
    A.add('dark', box(0.2, 0.22, 1.05, s * 0.17, 0.52, -2.85, 0, 0, s * 0.35), { tint: 0x8a8a84 });
    A.add('steel', zTube(-3.25, -2.6, 0.05, 0.05, 8, s * 0.28, 0.66));
    A.add('dark', yTube(0.62, 1.9, 0.055, 0.05, 8, s * 0.3, -2.62));
    A.add('dark', yTube(1.9, 1.96, 0.07, 0.07, 8, s * 0.3, -2.62));
  }
  A.add('metal', loft([[[-0.22, 0.48], [0.22, 0.48], [0.22, 0.85], [-0.22, 0.85]].map(([x, y]) => V(x, y, -3.55)), [[-0.12, 0.48], [0.12, 0.48], [0.12, 0.62], [-0.12, 0.62]].map(([x, y]) => V(x, y, -2.75))]), { tint: GREY });
  A.add('dark', box(0.4, 0.33, 0.02, 0, 0.67, -3.56));
  A.add('dark', box(0.5, 0.25, 0.3, 0, -0.55, -3.0)); // the oil sump and radiator-less belly
  // the pilot's windscreen and cockpit, the observer's Scarff ring with its Lewis gun, the pilot's Vickers on the port side
  A.add('dark', new THREE.TorusGeometry(0.3, 0.025, 5, 16).rotateX(Math.PI / 2).translate(0, 0.48, -1.1));
  A.add('glass', box(0.4, 0.2, 0.02, 0, 0.6, -1.42, -0.4));
  A.add('dark', new THREE.TorusGeometry(0.38, 0.03, 5, 20).rotateX(Math.PI / 2).translate(0, 0.47, 0.25));
  A.add('dark', zTube(-0.35, 0.45, 0.03, 0.03, 6, 0.28, 0.72).applyMatrix4(xf(0, 0, 0, 0, 0.5, 0)));
  A.add('dark', yTube(0.0, 0.05, 0.13, 0.13, 12, 0.08, 0.76));
  A.add('dark', zTube(-2.9, -1.4, 0.04, 0.04, 8, -0.5, 0.22));
  // wings: the upper with its long extensions, staggered ahead of the lower; 3 degrees of dihedral
  const dih = Math.tan(3 * Math.PI / 180);
  const up = [[0.0, -2.0, 1.72], [2.0, -2.0, 1.72], [6.1, -2.0, 1.72], [6.49, -1.85, 1.3]].map(([x, z, c]) => ({ x, z, c, y: 1.32 + x * dih, th: 0.07 }));
  const lo = [[0.48, -1.62, 1.72], [4.6, -1.62, 1.72], [4.97, -1.5, 1.35]].map(([x, z, c]) => ({ x, z, c, y: -0.58 + (x - 0.48) * dih, th: 0.07 }));
  A.wing(up);
  A.wing(lo);
  // struts: cabane to the upper centre section, two bays of interplane struts, the raked struts out to the extensions
  for (const s of [-1, 1]) {
    for (const z of [-1.8, -0.6]) A.add('flat', strut(V(s * 0.3, 0.42, z + 0.1), V(s * 0.55, wingAt(up, 0.55).yb, z)), { tint: WOOD });
    for (const x of [2.3, 4.35]) {
      const u = wingAt(up, x), l = wingAt(lo, x), dz = u.z - l.z;
      for (const f of [0.18, 0.72]) A.add('flat', strut(V(s * x, l.y, l.z + f * 1.72), V(s * x, u.yb, l.z + f * 1.72 + dz)), { tint: WOOD });
      A.add('steel', wire(V(s * (x - 2.0), l.y, l.z + 0.3), V(s * x, u.yb, u.z + 0.3)));
      A.add('steel', wire(V(s * (x - 2.0), wingAt(up, x - 2.0).yb, u.z + 0.3), V(s * x, l.y, l.z + 0.3)));
    }
    const l = wingAt(lo, 4.55);
    for (const f of [0.18, 0.72]) A.add('flat', strut(V(s * 4.55, l.y, l.z + f * 1.72), V(s * 5.9, wingAt(up, 5.9).yb, up[0].z + f * 1.72)), { tint: WOOD });
    // roundels on the upper wing top and the lower wing underside near the tips, on the fuselage sides
    const u = wingAt(up, 5.0);
    disc(A, ROUNDEL(0.72), s * 5.0, u.y + 0.01, up[0].z + 0.86, 'y');
    const b = wingAt(lo, 3.7);
    disc(A, ROUNDEL(0.66), s * 3.7, b.yb - 0.01, lo[0].z + 0.86, '-y');
    const f = station(tab, 1.25);
    disc(A, ROUNDEL(0.32), s * (f.w + 0.012), f.y + 0.02, 1.25, s > 0 ? 'x+' : 'x-');
  }
  // tail: tailplane, the enlarged fin and the rudder with its stripes, the tail skid
  A.wing([{ x: 0.05, z: 3.35, c: 1.1, y: 0.18, th: 0.06 }, { x: 1.8, z: 3.45, c: 0.95, y: 0.18, th: 0.05 }, { x: 2.05, z: 3.6, c: 0.65, y: 0.18, th: 0.05 }]);
  A.fin([{ y: 0.25, z: 3.5, c: 0.95, th: 0.07 }, { y: 0.85, z: 3.85, c: 0.62, th: 0.07 }, { y: 1.05, z: 4.0, c: 0.35, th: 0.06 }], { upper: PC10, lower: PC10 });
  A.fin([{ y: -0.15, z: 4.25, c: 0.38, th: 0.06 }, { y: 1.0, z: 4.15, c: 0.48, th: 0.06 }], { upper: CDL, lower: CDL });
  stripes(A, 0.02, 4.2, 4.62, -0.1, 0.95);
  A.add('dark', rod(V(0, -0.08, 3.6), V(0, -0.42, 3.95), 0.03, 5));
  // undercarriage: V legs from the fuselage to the axle, wheels with their covers
  for (const s of [-1, 1]) {
    A.add('dark', strut(V(s * 0.4, -0.6, -2.55), V(s * 0.82, -1.25, -2.15), 0.03, 0.07));
    A.add('dark', strut(V(s * 0.4, -0.6, -1.5), V(s * 0.82, -1.25, -2.15), 0.03, 0.07));
    wheel(A, s * 0.85, -1.25, -2.15, 0.36, 0.11);
  }
  A.add('dark', xTube(-0.85, 0.85, 0.035, 0.035, 6, -1.25, -2.15));
  const prop = propeller(m, 4, 1.42, { chord: 0.2, pitch: 0.45, hub: 0.12 });
  prop.position.set(0, 0.04, -3.86);
  return { A, prop, stores: [], crew: [head(m, 0, 0.62, -1.0), head(m, 0, 0.62, 0.3)], main: [0.85, -1.61, -2.15], tail: [0, -0.45, 3.97], length: 8.5, span: 12.98 };
}

// ------------------------------------------------------------------------------------------- Camel
function camel() {
  const m = mats(), A = new Air();
  const tab = [
    { z: -2.25, y: 0, w: 0.42, t: 0.42, b: 0.44, p: 2.4 }, { z: -1.75, y: 0, w: 0.4, t: 0.42, b: 0.46, p: 3.5 }, { z: -1.0, y: 0, w: 0.38, t: 0.4, b: 0.46, p: 4.5 },
    { z: -0.2, y: 0, w: 0.36, t: 0.36, b: 0.44, p: 4.5 }, { z: 0.8, y: 0.02, w: 0.27, t: 0.3, b: 0.34, p: 4 }, { z: 2.0, y: 0.06, w: 0.13, t: 0.18, b: 0.18, p: 3 },
    { z: 2.65, y: 0.08, w: 0.04, t: 0.08, b: 0.05, p: 2.5 },
  ];
  A.fuselage(tab, [-2.25, -1.75, -1.0, -0.2, 0.3, 0.8, 1.4, 2.0, 2.65], [[-2.25, -1.75, 'metal', GREY]]);
  // the round cowling, open at the bottom, with its front plate round the crankcase
  A.add('metal', new THREE.CylinderGeometry(0.52, 0.5, 0.48, 24, 1, true, Math.PI * 0.2, Math.PI * 1.6).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 0, -2.5), { tint: 0xb4b6b0 });
  A.add('metal', new THREE.RingGeometry(0.2, 0.52, 24).rotateY(Math.PI).translate(0, 0, -2.74), { tint: 0xb4b6b0 });
  // the hump over the twin Vickers, the guns' barrels and their cooling jackets ahead of the windscreen
  const hump = [fring({ z: -1.8, y: 0.38, w: 0.2, t: 0.05, b: 0.02, p: 3 }, 12), fring({ z: -1.35, y: 0.38, w: 0.26, t: 0.24, b: 0.02, p: 3 }, 12), fring({ z: -0.75, y: 0.36, w: 0.24, t: 0.22, b: 0.02, p: 3 }, 12)];
  for (let k = 0; k < 2; k++) A.add('flat', loft([hump[k], hump[k + 1]], { bottom: k === 0, top: k === 1 }), { tint: PC10 });
  for (const s of [-1, 1]) {
    A.add('dark', zTube(-1.95, -1.3, 0.045, 0.045, 8, s * 0.12, 0.6));
    A.add('dark', zTube(-2.08, -1.95, 0.018, 0.018, 6, s * 0.12, 0.6));
  }
  A.add('glass', box(0.3, 0.14, 0.02, 0, 0.68, -0.72, -0.5));
  for (const sd of [-1, 1]) A.add('decal', box(0.006, 0.3, 0.75, sd * (station(tab, -0.6).w + 0.012), 0.12, -0.6), { tint: PLY }); // plywood round the cockpit
  A.add('dark', new THREE.TorusGeometry(0.26, 0.03, 5, 16).rotateX(Math.PI / 2).translate(0, 0.38, -0.35));
  // wings: the upper flat, its centre section cut away over the cockpit; the lower with 5 degrees of dihedral
  const dih = Math.tan(5 * Math.PI / 180);
  const uy = 0.98, c = 1.37;
  const up = [[0.62, -1.5, c], [3.95, -1.5, c], [4.265, -1.36, 1.02]].map(([x, z, cc]) => ({ x, z, c: cc, y: uy, th: 0.065 }));
  A.wing(up);
  A.wing([{ x: 0, z: -1.5, c: 0.82, y: uy, th: 0.065 }, { x: 0.62, z: -1.5, c: 0.82, y: uy, th: 0.065 }], { mirror: true });
  const lo = [[0.36, -1.05, c], [3.95, -1.05, c], [4.265, -0.92, 1.02]].map(([x, z, cc]) => ({ x, z, c: cc, y: -0.45 + (x - 0.36) * dih, th: 0.065 }));
  A.wing(lo);
  for (const s of [-1, 1]) {
    // cabane N-struts, the single bay of interplane struts, the flying and landing wires
    A.add('flat', strut(V(s * 0.22, 0.42, -1.55), V(s * 0.45, uy - 0.02, -1.3)), { tint: WOOD });
    A.add('flat', strut(V(s * 0.22, 0.4, -0.85), V(s * 0.45, uy - 0.02, -0.4)), { tint: WOOD });
    const l = wingAt(lo, 3.35);
    for (const f of [0.15, 0.72]) A.add('flat', strut(V(s * 3.35, l.y, l.z + f * c), V(s * 3.35, uy - 0.02, -1.5 + f * c)), { tint: WOOD });
    A.add('steel', wire(V(s * 0.36, -0.45, -0.9), V(s * 3.35, uy, -1.2)));
    A.add('steel', wire(V(s * 0.45, uy, -1.2), V(s * 3.35, l.y, -0.85)));
    disc(A, ROUNDEL(0.55), s * 3.2, wingAt(up, 3.2).y + 0.01, -1.5 + 0.68, 'y');
    disc(A, ROUNDEL(0.55), s * 3.0, wingAt(lo, 3.0).yb - 0.01, -1.05 + 0.68, '-y');
    const f = station(tab, 0.9);
    disc(A, ROUNDEL(0.3), s * (f.w + 0.012), f.y + 0.01, 0.9, s > 0 ? 'x+' : 'x-');
  }
  // tail: tailplane, the small fin and the big rounded rudder with its stripes, the skid
  A.wing([{ x: 0.04, z: 1.95, c: 0.82, y: 0.12, th: 0.06 }, { x: 1.15, z: 2.0, c: 0.72, y: 0.12, th: 0.05 }, { x: 1.3, z: 2.12, c: 0.45, y: 0.12, th: 0.05 }]);
  A.fin([{ y: 0.12, z: 2.15, c: 0.55, th: 0.07 }, { y: 0.48, z: 2.4, c: 0.26, th: 0.06 }], { upper: PC10, lower: PC10 });
  A.fin([{ y: -0.2, z: 2.63, c: 0.28, th: 0.06 }, { y: 0.05, z: 2.6, c: 0.42, th: 0.06 }, { y: 0.55, z: 2.62, c: 0.4, th: 0.06 }, { y: 0.78, z: 2.68, c: 0.22, th: 0.05 }], { upper: CDL, lower: CDL });
  stripes(A, 0.022, 2.62, 3.0, -0.15, 0.7);
  A.add('dark', rod(V(0, -0.1, 2.2), V(0, -0.33, 2.45), 0.025, 5));
  // undercarriage: V legs, the axle with its fairing, the wheels
  const wy = -1.08, wz = -1.4;
  for (const s of [-1, 1]) {
    A.add('dark', strut(V(s * 0.3, -0.45, -1.85), V(s * 0.7, wy, wz), 0.025, 0.06), { tint: 0x3a3a30 });
    A.add('dark', strut(V(s * 0.3, -0.45, -1.0), V(s * 0.7, wy, wz), 0.025, 0.06), { tint: 0x3a3a30 });
    wheel(A, s * 0.75, wy, wz, 0.33, 0.1);
  }
  A.add('flat', box(1.4, 0.05, 0.14, 0, wy, wz), { tint: PC10 });
  // four 20 lb Cooper bombs on their rack under the fuselage behind the undercarriage, each its own Group
  A.add('dark', box(0.75, 0.04, 0.5, 0, -0.5, -0.45));
  const stores = [];
  for (const x of [-0.27, -0.09, 0.09, 0.27]) {
    const R = new Parts(m), g = new THREE.Group();
    R.add('flat', zLathe([[-0.3, 0.001], [-0.26, 0.04], [-0.18, 0.062], [0.08, 0.062], [0.18, 0.04], [0.22, 0.025]], 10), { tint: 0x6a6a5a });
    for (let k = 0; k < 4; k++) R.add('flat', box(0.004, 0.14, 0.12, 0, 0, 0.26).applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI / 2 + Math.PI / 4)), { tint: 0x6a6a5a });
    R.add('decal', zTube(-0.2, -0.17, 0.063, 0.063, 10), { tint: 0x9a2a24 });
    R.build(g);
    g.position.set(x, -0.6, -0.45);
    stores.push(g);
  }
  // the propeller and the Clerget turning with it: nine cylinders round the crankcase, inside the cowling
  const prop = propeller(m, 2, 1.3, { chord: 0.19, pitch: 0.42, hub: 0.11 });
  prop.position.set(0, 0, -2.8);
  const E = new Parts(m);
  E.add('steel', zTube(0.08, 0.36, 0.17, 0.17, 14));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU, g = yTube(0.15, 0.43, 0.065, 0.065, 8).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)).translate(0, 0, 0.26);
    E.add('steel', g, { tint: 0x8a8a84 });
    E.add('dark', rod(V(Math.sin(-a) * 0.43, Math.cos(a) * 0.43, 0.22), V(Math.sin(-a) * 0.12, Math.cos(a) * 0.12, 0.12), 0.012, 4));
  }
  E.build(prop);
  return { A, prop, stores, crew: [head(m, 0, 0.55, -0.32)], main: [0.75, -1.41, wz], tail: [0, -0.38, 2.45], length: 5.72, span: 8.53 };
}

const BUILDERS = { re8, camel };
export const AIRCRAFT_KINDS_1918 = Object.keys(BUILDERS);

export function buildAircraft1918(kind = 're8') {
  const f = BUILDERS[kind];
  if (!f) throw new Error('unknown aircraft kind ' + kind);
  const b = f();
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'aircraft-' + kind;
  root.add(body);
  const parts = [...b.A.P.build(body)];
  body.add(b.prop);
  for (const s of b.stores) body.add(s);
  for (const c of b.crew) body.add(c);
  // parked: rotate about x so the wheels and the tail skid both touch y = 0
  const [, my, mz] = b.main, [, ty, tz] = b.tail;
  const pitch = Math.atan2(ty - my, tz - mz);
  const out = {
    root, body, prop: b.prop, gear: null, stores: b.stores, crew: b.crew, parts, length: b.length, span: b.span, kind,
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
    setGear() {},
  };
  out.setParked(true);
  root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  out.height = new THREE.Box3().setFromObject(root).max.y;
  return out;
}

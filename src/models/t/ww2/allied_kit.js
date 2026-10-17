import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, loft, xf, tyreGeometry, frontProfile } from '../../kit.js';
import { FParts } from '../mats.js';
import { rng } from '../props.js';

// Shared pieces of the Allied (British and Canadian, NW Europe 1944) targets: the M4 Sherman, the
// Universal carrier, lorries (Bedford QL, Austin K5, AEC Matador), the Morris Quad and its No. 27
// limber, ridge tents, jerrycans, ammunition boxes, sandbag pits and camouflage nets. Every builder
// adds into an FParts collector `P` at a transform, or returns a Group with its own moving bits.
// Model space as everywhere: front -Z, ground y = 0, metres. Paint: the British SCC 15 olive drab of
// 1944 is the 'green' scheme's camo key; stars and markings are 'white'.

export const OD = 'green'; // FParts scheme for Allied paint
const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => g.applyMatrix4(xf(x, y, z, rx, ry, rz));
export const at = (x, z, ry = 0, y = 0) => (g) => place(g, x, y, z, ry);

// A pneumatic tyre with a plain disc wheel, axis X, centre (x, y, z); light enough for a vehicle park.
export function tyre(P, x, y, z, R, W, side = 1, seg = 26) {
  P.add('tyre', tyreGeometry(R, W, 16, seg).applyMatrix4(xf(x, y, z)));
  P.add('rim', xTube(x - W * 0.42, x + W * 0.42, R * 0.66, R * 0.66, 14, y, z));
  P.add('dark', xTube(x + side * W * 0.42, x + side * (W * 0.5 + 0.03), R * 0.22, R * 0.18, 10, y, z));
}

/** A cross-section ring at z: base y0, top y1, half width hw at the base and ht at the top, top corners rounded by rad. */
export function section(z, y0, y1, hw, ht = hw, rad = 0.05, n = 3) {
  const pts = [V(-hw, y0, z), V(hw, y0, z)];
  for (let i = 0; i <= n; i++) { // right top corner, from the side to the roof
    const a = (i / n) * Math.PI / 2;
    pts.push(V(ht - rad + rad * Math.cos(a), y1 - rad + rad * Math.sin(a), z));
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI / 2;
    pts.push(V(-ht + rad + rad * Math.cos(a), y1 - rad + rad * Math.sin(a), z));
  }
  return pts;
}
// loft consecutive rings one pair at a time (each pair is convex, so the loft orients its faces right)
export function tube(rings, o = {}) {
  const out = [];
  for (let i = 0; i < rings.length - 1; i++) out.push(loft([rings[i], rings[i + 1]], { top: i === rings.length - 2 && o.end !== false, bottom: i === 0 && o.start !== false, crease: o.crease ?? 0 }));
  return out;
}

/** A five-pointed star of outer radius R in the XY plane facing +Z (ring: also a circle round it). */
export function star(R, ring = false) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.382 : R;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(s);
  if (!ring) return g;
  const c = new THREE.RingGeometry(R * 1.12, R * 1.24, 28);
  return [g, c];
}
// add a star decal: centre (x, y, z), facing direction 'x+', 'x-', 'y', 'z+' or 'z-'
export function addStar(P, R, x, y, z, face, ring = false) {
  const rot = { 'x+': [0, Math.PI / 2, 0], 'x-': [0, -Math.PI / 2, 0], y: [-Math.PI / 2, 0, 0], 'z+': [0, 0, 0], 'z-': [0, Math.PI, 0] }[face];
  const gs = star(R, ring);
  for (const g of Array.isArray(gs) ? gs : [gs]) P.add('white', g.applyMatrix4(xf(x, y, z, rot[0], rot[1], rot[2])), { tint: 0xe8e6da });
}

// a run of track as boxes between points [z, y] (closed loop), centred at x, width w
function trackLoop(P, x, w, pts, t = 0.07) {
  for (let i = 0; i < pts.length; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[(i + 1) % pts.length];
    const len = Math.hypot(z1 - z0, y1 - y0);
    if (len < 1e-3) continue;
    P.add('dark', box(w, t, len + 0.02, x, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(-(y1 - y0), z1 - z0)));
  }
}
const arc = (cz, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; };

// ------------------------------------------------------------------------------------------- Sherman
/**
 * M4 Sherman (75 mm), 5.9 m x 2.62 m x 2.74 m. cast: the M4A1's rounded cast upper hull, else the welded
 * M4/M4A4 hull with its flat plates. Returns { group, hull, turret, hatch } so the damage states can
 * blow the turret askew and the commander's hatch open.
 */
export function sherman({ cast = false, seed = 1, stowage = true, number = 0 } = {}) {
  const r = rng(seed);
  const group = new THREE.Group(), P = new FParts(OD);
  // running gear: three VVSS bogies a side, the sprocket forward, the idler aft, return rollers on the bogies
  for (const s of [-1, 1]) {
    const x = s * 1.1;
    const loop = [
      ...arc(-2.55, 0.74, 0.36, Math.PI / 2, Math.PI * 1.32, 4),
      [-1.95, 0.035], [1.95, 0.035],
      ...arc(2.55, 0.38, 0.33, -Math.PI * 0.42, Math.PI / 2, 4),
      [1.6, 1.0], [-0.1, 1.0], [-1.8, 1.08],
    ];
    trackLoop(P, x, 0.42, loop);
    for (const bz of [-1.55, 0, 1.55]) {
      P.add('camo', box(0.3, 0.38, 0.6, x - s * 0.03, 0.5, bz));
      P.add('dark', box(0.12, 0.4, 0.12, x - s * 0.03, 0.78, bz + 0.12));
      P.add('dark', xTube(x - 0.1, x + 0.1, 0.09, 0.09, 10, 0.89, bz + 0.12));
      for (const dz of [-0.33, 0.33]) {
        P.add('rubber', xTube(x - 0.19, x + 0.19, 0.255, 0.255, 16, 0.27, bz + dz));
        P.add('rim', xTube(x - 0.2, x + 0.2, 0.17, 0.17, 12, 0.27, bz + dz));
      }
    }
    P.add('dark', xTube(x - 0.2, x + 0.2, 0.33, 0.33, 14, 0.74, -2.55));
    P.add('camo', xTube(x - 0.21, x + 0.21, 0.15, 0.15, 10, 0.74, -2.55));
    P.add('dark', xTube(x - 0.18, x + 0.18, 0.28, 0.28, 14, 0.38, 2.55));
  }
  // lower hull between the tracks, the rounded transmission cover at the nose
  P.add('camo', box(1.76, 0.72, 5.0, 0, 0.78, 0.1));
  P.add('camo', xTube(-0.86, 0.86, 0.42, 0.42, 14, 0.76, -2.5));
  P.add('camo', box(1.72, 0.1, 0.5, 0, 1.12, -2.55));
  // upper hull: welded plates or the cast hull's rounded body, out over the tracks
  const rad = cast ? 0.32 : 0.04, ht = cast ? 1.2 : 1.31;
  const hullRings = [
    section(-2.78, 1.08, 1.18, 1.0, 1.0, 0.04),
    section(-1.72, 1.08, 1.9, 1.31, ht, rad),
    section(2.5, 1.08, 1.9, 1.31, ht, rad),
    section(2.92, 1.08, 1.5, 1.24, ht - 0.06, rad * 0.8),
  ];
  for (const g of tube(hullRings, { crease: cast ? 0.7 : 0 })) P.add('camo', g);
  // engine deck: grille, hatches, the rear plate with exhausts and stowage bins
  P.add('dark', box(1.3, 0.03, 0.9, 0, 1.915, 1.8));
  for (const sx of [-1, 1]) P.add('camo', box(0.7, 0.03, 0.9, sx * 0.4, 1.915, 0.75));
  P.add('dark', box(1.5, 0.35, 0.1, 0, 0.75, 2.95));
  for (const sx of [-1, 1]) P.add('dark', zTube(2.9, 3.05, 0.08, 0.08, 8, sx * 0.55, 0.9));
  // hatches for driver and co-driver, periscopes, the hull MG ball, headlights with their guards
  for (const sx of [-1, 1]) {
    P.add('camo', yTube(1.88, 1.96, 0.3, 0.3, 12, sx * 0.5, -1.4));
    P.add('dark', box(0.14, 0.08, 0.1, sx * 0.5, 2.0, -1.62));
    P.add('lens', box(0.18, 0.18, 0.06, sx * 0.72, 1.32, -2.62));
    P.add('dark', rod(V(sx * 0.6, 1.25, -2.66), V(sx * 0.84, 1.4, -2.66), 0.015, 4));
  }
  P.add('camo', sphere(0.12, 0.5, 1.5, -2.25, 1, 1, 1, 10));
  P.add('dark', zTube(-2.62, -2.3, 0.025, 0.025, 6, 0.5, 1.48));
  // British stowage: spare track links on the glacis, a box on the rear deck, a tarpaulin roll
  for (let i = 0; i < 5; i++) P.add('dark', box(0.34, 0.05, 0.62, -0.9 + i * 0.36 + (i > 2 ? 0.36 : 0), 1.54, -2.3, -0.6), { tint: 0x9a8a78 });
  if (stowage) {
    P.add('camo', box(1.4, 0.4, 0.45, 0, 1.25, 3.15));
    P.add('cloth', xTube(-0.9, 0.9, 0.17, 0.17, 10, 2.09, 2.3), { tint: 0x9a9070 });
    for (let i = 0; i < 3; i++) P.add('dark', box(0.32, 0.46, 0.18, -0.6 + i * 0.36, 2.16, 2.62), { tint: 0x6a6650 }); // jerrycans
  }
  // the white Allied star on the hull sides and, inside a circle, on the engine deck for the aircraft
  for (const s of [-1, 1]) addStar(P, 0.32, s * 1.325, 1.5, 0.55, s > 0 ? 'x+' : 'x-');
  addStar(P, 0.42, 0, 1.925, 1.0, 'y', true);
  P.build(group, { dirt: 0.6 });

  // turret: the cast 75 mm turret with its bustle, mantlet, gun, cupola and the loader's hatch
  const turret = new THREE.Group();
  turret.position.set(0, 1.9, -0.25);
  turret.rotation.y = (r() - 0.5) * 0.4;
  const T = new FParts(OD);
  const tr = (y, rx, f, b) => { const o = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); o.push(V(rx * s, y, -c * (c > 0 ? f : b))); } return o; };
  for (const g of tube([tr(0, 0.94, 0.9, 1.1), tr(0.42, 0.93, 0.92, 1.18), tr(0.66, 0.78, 0.72, 1.02), tr(0.76, 0.56, 0.48, 0.74)], { crease: 0.7 })) T.add('camo', g);
  T.add('camo', rbox(1.0, 0.5, 0.26, 0.06, 0, 0.36, -0.98));
  T.add('camo', rbox(0.62, 0.38, 0.22, 0.05, 0, 0.36, -1.16));
  T.add('dark', zTube(-1.2, -1.75, 0.085, 0.07, 12, 0, 0.36));
  T.add('dark', zTube(-1.75, -3.35, 0.062, 0.055, 12, 0, 0.36));
  T.add('dark', zTube(-3.38, -3.18, 0.075, 0.075, 12, 0, 0.36));
  T.add('dark', zTube(-1.2, -1.45, 0.025, 0.025, 6, 0.24, 0.36));
  // commander's split hatch rear right, loader's hatch left, periscopes, smoke mortar, aerial
  T.add('camo', yTube(0.74, 0.86, 0.36, 0.34, 14, 0.3, 0.32));
  T.add('camo', yTube(0.74, 0.8, 0.24, 0.24, 10, -0.36, -0.05));
  T.add('dark', box(0.12, 0.1, 0.12, -0.38, 0.84, -0.35));
  T.add('dark', box(0.12, 0.1, 0.12, 0.05, 0.84, -0.42));
  T.add('dark', zTube(-0.2, -0.45, 0.04, 0.04, 6, -0.6, 0.62));
  T.add('dark', yTube(0.7, 3.0, 0.008, 0.006, 4, -0.5, 0.75));
  if (stowage) {
    T.add('camo', box(1.2, 0.36, 0.42, 0, 0.32, 1.3));
    T.add('cloth', xTube(-0.6, 0.6, 0.15, 0.15, 10, 0.62, 1.15), { tint: 0x7a7460 });
  }
  T.add('white', box(0.02, 0.3, 0.3, 0.92, 0.32, 0.05), { tint: number ? 0xd8d4c4 : 0x5a5a40 });
  T.build(turret, { dirt: 0.2, y0: 1.9 });
  const hatch = new THREE.Group();
  hatch.position.set(0.3, 0.86, 0.32);
  const H = new FParts(OD);
  H.add('camo', box(0.66, 0.05, 0.34, 0, 0, 0.17));
  H.build(hatch, { dirt: 0 });
  hatch.rotation.x = -1.2; // standing open, as a commander rides head out
  turret.add(hatch);
  group.add(turret);
  return { group, turret, hatch };
}

// ------------------------------------------------------------------------- Universal (Bren) carrier
/** The Universal carrier, 3.65 m x 2.06 m x 1.57 m: open steel hull, Horstmann bogies, the Bren at the front. */
export function carrier(P, x, z, ry = 0) {
  const A = at(x, z, ry);
  for (const s of [-1, 1]) {
    const tx = s * 0.82;
    trackLoop({ add: (k, g, o) => P.add(k, A(g), o) }, tx, 0.28, [...arc(-1.5, 0.38, 0.3, Math.PI / 2, Math.PI * 1.4, 3), [-1.15, 0.035], [1.15, 0.035], ...arc(1.55, 0.36, 0.3, -Math.PI * 0.4, Math.PI / 2, 3), [0, 0.7]], 0.05);
    for (const wz of [-1.0, -0.45, 0.65]) P.add('rubber', A(xTube(tx - 0.12, tx + 0.12, 0.25, 0.25, 14, 0.27, wz)));
    P.add('dark', A(xTube(tx - 0.12, tx + 0.12, 0.28, 0.28, 12, 0.38, 1.55)));
    P.add('camo', A(box(0.34, 0.04, 3.1, s * 0.85, 0.74, 0.05))); // track guard
    P.add('camo', A(box(0.3, 0.32, 1.1, s * 0.88, 0.92, 0.6))); // stowage lockers over the tracks
  }
  P.add('camo', A(box(1.36, 0.6, 3.3, 0, 0.62, 0.05)));
  // sloped nose plates and the raised armoured front of the driver and the Bren gunner
  P.add('camo', A(frontProfile([[-0.68, 0], [0.68, 0], [0.68, 0.22], [-0.68, 0.22]], 0, 0.5).applyMatrix4(xf(0, 0.6, -1.85, -0.7))));
  P.add('camo', A(box(1.3, 0.55, 0.06, 0, 1.15, -1.3, -0.25)));
  P.add('camo', A(box(1.4, 0.06, 0.6, 0, 0.94, -1.0)));
  P.add('camo', A(box(0.62, 0.22, 0.06, -0.33, 1.47, -1.36, -0.15)));
  P.add('dark', A(zTube(-1.4, -2.15, 0.02, 0.02, 6, -0.35, 1.5)));
  P.add('dark', A(box(0.08, 0.16, 0.3, -0.35, 1.58, -1.25)));
  // the engine cover in the middle, sides up to 1.1 m, the crew's kit
  P.add('camo', A(box(0.5, 0.36, 1.4, 0, 1.0, 0.3)));
  for (const s of [-1, 1]) P.add('camo', A(box(0.05, 0.42, 2.9, s * 0.67, 1.1, 0.2)));
  P.add('camo', A(box(1.36, 0.42, 0.05, 0, 1.1, 1.67)));
  P.add('cloth', A(box(0.4, 0.25, 0.5, 0.42, 1.25, 1.2)), { tint: 0x8a8264 });
  P.add('dark', A(box(0.18, 0.4, 0.3, -0.42, 1.25, 1.35)), { tint: 0x6a6650 });
  addStar({ add: (k, g, o) => P.add(k, A(g), o) }, 0.18, 0.95, 0.93, 0.6, 'x+');
  addStar({ add: (k, g, o) => P.add(k, A(g), o) }, 0.18, -0.95, 0.93, 0.6, 'x-');
}

// ------------------------------------------------------------------------------------------- lorries
/**
 * A British 3-ton lorry, front -Z. type 'ql' (Bedford QL: forward control, the cab over the engine,
 * a GS body with canvas tilt), 'k5' (Austin K5: bonnet ahead of the cab), 'matador' (AEC Matador
 * medium artillery tractor: long bonnet, big single wheels, a box body). tilt false: an open body.
 */
export function lorry(P, x, z, ry = 0, { type = 'ql', tilt = true, tarp = 0xd8d0a8, tiltP = null, info = {} } = {}) {
  // tiltP: a separate collector for the canvas tilt (centred on info.tiltAt), so damage can burn it away
  const A = at(x, z, ry);
  const Q = { add: (k, g, o) => P.add(k, A(g), o) };
  const S = {
    ql: { R: 0.52, W: 0.3, fz: -1.95, rz: 1.95, front: -2.95, cab: [-2.95, -1.35], body: [-1.3, 3.0], bodyW: 2.3, floor: 1.3, tilt: 3.05 },
    k5: { R: 0.5, W: 0.28, fz: -2.2, rz: 1.75, front: -3.05, cab: [-1.75, -0.6], body: [-0.5, 2.95], bodyW: 2.25, floor: 1.25, tilt: 2.85, bonnet: [-3.05, -1.75] },
    matador: { R: 0.57, W: 0.36, fz: -2.3, rz: 1.7, front: -3.15, cab: [-1.7, -0.45], body: [-0.35, 3.15], bodyW: 2.4, floor: 1.32, tilt: 3.05, bonnet: [-3.15, -1.7] },
  }[type];
  const { R, W } = S;
  P.add('dark', A(box(0.95, 0.24, S.body[1] - S.front - 0.2, 0, R + 0.18, (S.body[1] + S.front) / 2)));
  for (const wz of [S.fz, S.rz]) for (const s of [-1, 1]) {
    Q.add('tyre', tyreGeometry(R, W, 16, 24).applyMatrix4(xf(s * 0.92, R, wz)));
    Q.add('rim', xTube(s * 0.82, s * 1.04, R * 0.62, R * 0.62, 12, R, wz));
    Q.add('dark', xTube(-0.9, 0.9, 0.09, 0.09, 8, R, wz));
  }
  const [c0, c1] = S.cab;
  if (S.bonnet) { // bonnet, radiator grille, wings over the front wheels
    const [b0, b1] = S.bonnet;
    P.add('camo', A(box(1.1, 0.75, b1 - b0, 0, R + 0.75, (b0 + b1) / 2)));
    P.add('camo', A(box(1.12, 0.1, b1 - b0, 0, R + 1.12, (b0 + b1) / 2, 0.04)));
    P.add('dark', A(box(0.9, 0.7, 0.06, 0, R + 0.72, b0 - 0.02)));
    for (const s of [-1, 1]) {
      P.add('camo', A(box(0.48, 0.06, 1.25, s * 0.85, R * 2 + 0.12, S.fz)));
      P.add('camo', A(box(0.48, 0.5, 0.06, s * 0.85, R * 2 - 0.12, S.fz - 0.62, -0.5)));
      P.add('lens', A(zTube(b0 - 0.05, b0 + 0.05, 0.1, 0.1, 10, s * 0.68, R * 2 + 0.25)));
    }
    P.add('camo', A(box(2.1, 1.5, c1 - c0, 0, R + 1.2, (c0 + c1) / 2)));
    P.add('glass', A(box(1.8, 0.5, 0.04, 0, R + 1.6, c0 - 0.02)));
    if (type === 'matador') P.add('camo', A(box(2.2, 0.08, c1 - c0 + 0.1, 0, R + 1.98, (c0 + c1) / 2)));
    else P.add('cloth', A(box(2.1, 0.08, c1 - c0, 0, R + 1.98, (c0 + c1) / 2)), { tint: 0x5a5a40 });
  } else { // forward control: a flat-fronted cab over the engine, the canvas cab roof
    P.add('camo', A(box(2.2, 1.4, c1 - c0, 0, R + 1.0, (c0 + c1) / 2)));
    P.add('glass', A(box(1.9, 0.48, 0.04, 0, R + 1.5, c0 - 0.02)));
    P.add('dark', A(box(1.0, 0.5, 0.05, 0, R + 0.55, c0 - 0.03)));
    P.add('cloth', A(box(2.2, 0.1, c1 - c0, 0, R + 1.76, (c0 + c1) / 2)), { tint: 0x5a5a40 });
    P.add('camo', A(yTube(R + 1.8, R + 1.9, 0.3, 0.3, 12, 0.5, c0 + 0.6)));
    for (const s of [-1, 1]) {
      P.add('camo', A(box(0.45, 0.06, 1.2, s * 0.92, R * 2 + 0.08, S.fz)));
      P.add('lens', A(zTube(c0 - 0.06, c0 + 0.04, 0.1, 0.1, 10, s * 0.75, R + 0.4)));
    }
  }
  // the GS body: drop sides, wheel arches, the tilt on its hoops
  const [d0, d1] = S.body, bw = S.bodyW, fl = S.floor, mid = (d0 + d1) / 2, len = d1 - d0;
  P.add('wood', A(box(bw, 0.12, len, 0, fl, mid)), { tint: 0x9a9070 });
  for (const s of [-1, 1]) P.add('camo', A(box(0.05, 0.55, len, s * bw / 2, fl + 0.3, mid)));
  P.add('camo', A(box(bw, 0.55, 0.05, 0, fl + 0.3, d0)));
  P.add('camo', A(box(bw, 0.55, 0.05, 0, fl + 0.3, d1)));
  for (const s of [-1, 1]) P.add('camo', A(box(0.4, 0.06, 1.3, s * (bw / 2 - 0.15), R * 2 + 0.1, S.rz)));
  if (tilt) {
    const h = S.tilt - fl;
    const g = frontProfile([[-bw / 2, 0], [bw / 2, 0], [bw / 2, h * 0.86], [bw / 2 - 0.25, h], [-bw / 2 + 0.25, h], [-bw / 2, h * 0.86]], -len / 2, len / 2);
    if (tiltP) {
      info.tiltAt = [0, fl + 0.02 + h / 2, mid];
      tiltP.add('cloth', g.applyMatrix4(xf(0, -h / 2, 0)), { tint: tarp });
    } else P.add('cloth', A(g.applyMatrix4(xf(0, fl + 0.02, mid))), { tint: tarp });
  } else {
    P.add('wood', A(box(bw - 0.2, 0.6, len * 0.7, 0, fl + 0.36, mid + len * 0.1)), { tint: 0x7a6a4a });
  }
  P.add('red', A(box(0.12, 0.08, 0.04, -bw / 2 + 0.15, R + 0.45, d1 + 0.04)));
  // the formation sign and the unit serial plate on the tailboard
  P.add('white', A(box(0.3, 0.22, 0.02, bw / 2 - 0.3, fl + 0.3, d1 + 0.04)), { tint: 0x9a3a2a });
}

/** Morris C8 Quad field artillery tractor, 4.5 m x 2.2 m x 2.26 m: the beetle-backed steel body, short bonnet. */
export function quad(P, x, z, ry = 0) {
  const A = at(x, z, ry);
  const R = 0.46;
  for (const wz of [-1.25, 1.25]) for (const s of [-1, 1]) {
    P.add('tyre', A(tyreGeometry(R, 0.3, 16, 24).applyMatrix4(xf(s * 0.86, R, wz))));
    P.add('rim', A(xTube(s * 0.76, s * 0.98, R * 0.6, R * 0.6, 12, R, wz)));
  }
  P.add('dark', A(box(0.9, 0.24, 4.1, 0, R + 0.12, 0)));
  // bonnet sloping down to the grille, wings
  for (const g of tube([section(-2.25, 0.62, 1.22, 0.62, 0.55, 0.12), section(-1.25, 0.62, 1.42, 0.7, 0.62, 0.14)])) P.add('camo', A(g));
  P.add('dark', A(box(0.9, 0.5, 0.05, 0, 0.95, -2.27, 0.15)));
  for (const s of [-1, 1]) {
    P.add('camo', A(box(0.42, 0.06, 1.2, s * 0.86, 1.0, -1.3)));
    P.add('lens', A(zTube(-2.12, -2.02, 0.09, 0.09, 10, s * 0.55, 1.22)));
  }
  // the body: sloped sides, a rounded roof and the long slope down the back
  const body = [
    section(-1.25, 0.6, 2.05, 1.08, 0.86, 0.3), section(0.55, 0.6, 2.26, 1.1, 0.88, 0.4),
    section(1.55, 0.6, 2.0, 1.1, 0.88, 0.45), section(2.25, 0.6, 1.25, 1.06, 0.8, 0.35),
  ];
  for (const g of tube(body)) P.add('camo', A(g));
  P.add('glass', A(box(1.5, 0.38, 0.04, 0, 1.72, -1.27, -0.22)));
  for (const s of [-1, 1]) P.add('glass', A(box(0.04, 0.36, 0.7, s * 1.0, 1.7, -0.6)));
  P.add('camo', A(box(0.06, 1.0, 0.8, 1.06, 1.25, -0.55)));
  P.add('dark', A(box(0.1, 0.1, 1.4, 0, 2.28, 0.4)));
  P.add('wood', A(box(1.3, 0.18, 0.5, 0, 2.35, 0.3)), { tint: 0x8a8264 });
  P.add('dark', A(xTube(-0.4, 0.4, 0.16, 0.16, 10, 0.85, -2.33))); // the winch drum under the nose
}

/** No. 27 ammunition trailer (limber) of the 25-pounder: two wheels, a sloped steel box, the drawbar. */
export function limber27(P, x, z, ry = 0) {
  const A = at(x, z, ry);
  for (const s of [-1, 1]) {
    P.add('tyre', A(tyreGeometry(0.45, 0.24, 14, 22).applyMatrix4(xf(s * 0.82, 0.45, 0))));
    P.add('rim', A(xTube(s * 0.72, s * 0.92, 0.28, 0.28, 12, 0.45, 0)));
  }
  P.add('dark', A(xTube(-0.8, 0.8, 0.05, 0.05, 8, 0.45, 0)));
  for (const g of tube([section(-0.8, 0.55, 1.15, 0.62, 0.62, 0.05), section(-0.3, 0.55, 1.35, 0.66, 0.6, 0.08), section(0.8, 0.55, 1.35, 0.66, 0.6, 0.08)])) P.add('camo', A(g));
  P.add('dark', A(box(1.2, 0.04, 0.04, 0, 1.36, 0.1)));
  P.add('camo', A(box(0.12, 0.1, 1.5, 0, 0.5, -1.5)));
  P.add('dark', A(new THREE.TorusGeometry(0.07, 0.018, 6, 10).rotateX(Math.PI / 2).translate(0, 0.48, -2.25)));
  P.add('camo', A(yTube(0, 0.45, 0.04, 0.04, 6, 0, -2.1)));
}

// ----------------------------------------------------------------------------------- camp and dump
/** A British ridge tent: canvas over a ridge pole, low walls, guy lines; w across, d long (along z). */
export function ridgeTent(P, x, z, ry = 0, { w = 3.0, d = 4.3, h = 2.3, wall = 0.6, tint = 0xd8d0b0 } = {}) {
  const A = at(x, z, ry);
  P.add('cloth', A(frontProfile([[-w / 2, 0], [w / 2, 0], [w / 2, wall], [0, h], [-w / 2, wall]], -d / 2, d / 2)), { tint });
  P.add('cloth', A(frontProfile([[-w / 2 - 0.15, wall - 0.12], [0, h + 0.04], [w / 2 + 0.15, wall - 0.12], [0, h - 0.06]], -d / 2 - 0.1, d / 2 + 0.1)), { tint: new THREE.Color(tint).multiplyScalar(0.92).getHex() });
  P.add('dark', A(box(0.5, 1.4, 0.03, 0, 0.7, -d / 2 - 0.02)), { tint: 0x5a5440 });
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) P.add('rope', A(rod(V(s * (w / 2 + 0.1), wall, k * d * 0.4), V(s * (w / 2 + 1.0), 0, k * d * 0.4), 0.008, 3)));
  for (const k of [-1, 1]) P.add('wood', A(yTube(0, h + 0.15, 0.03, 0.03, 5, 0, k * (d / 2 + 0.05))));
}

/** A stack of jerrycans: cols x rows, `layers` high (0.47 m tall, 0.35 wide, 0.17 thick), petrol or water. */
export function jerrycans(P, x, z, cols, rows, layers = 1, ry = 0, { tint = 0x5a6040, rnd = null } = {}) {
  const A = at(x, z, ry);
  for (let l = 0; l < layers; l++) for (let i = 0; i < cols - l; i++) for (let j = 0; j < rows; j++) {
    const cx = (i - (cols - l - 1) / 2) * 0.19, cz = (j - (rows - 1) / 2) * 0.37, y = l * 0.49;
    const k = rnd ? 0.85 + rnd() * 0.3 : 1;
    const c = new THREE.Color(tint).multiplyScalar(k).getHex();
    P.add('matte', A(box(0.17, 0.47, 0.35, cx, y + 0.235, cz)), { tint: c });
    P.add('dark', A(box(0.04, 0.05, 0.22, cx, y + 0.49, cz - 0.03)), { tint: 0x5a5a50 });
  }
}

/** Ammunition boxes in a block: cols x rows x layers of (w, h, d) boxes, tint, with lid bands. */
export function boxStack(P, x, z, cols, rows, layers, ry = 0, { w = 0.8, h = 0.3, d = 0.32, tint = 0x5c5a3e, key = 'matte', band = true, rnd = null, y = 0 } = {}) {
  const A = at(x, z, ry);
  for (let l = 0; l < layers; l++) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const cx = (i - (cols - 1) / 2) * (w + 0.04), cz = (j - (rows - 1) / 2) * (d + 0.04), cy = y + l * (h + 0.01) + h / 2;
    const jit = rnd ? (rnd() - 0.5) * 0.04 : 0;
    P.add(key, A(box(w, h, d, cx + jit, cy, cz, 0, jit, 0)), { tint: rnd ? new THREE.Color(tint).multiplyScalar(0.88 + rnd() * 0.24).getHex() : tint });
    if (band) P.add('dark', A(box(w * 0.04, h + 0.01, d + 0.01, cx + jit - w * 0.32, cy, cz)));
  }
}

/** Shells lying in a pyramid (nose out), rows wide, layers high; len and rad the shell. Buff British HE. */
export function shellPyramid(P, x, z, rows, layers, ry, { len = 0.55, rad = 0.07, tint = 0xb8a070, band = 0x9a3a2a } = {}) {
  const A = at(x, z, ry);
  for (let l = 0; l < layers; l++) for (let i = 0; i < rows - l; i++) {
    const cx = (i - (rows - l - 1) / 2) * rad * 2.05, cy = rad + l * rad * 1.75;
    P.add('matte', A(zTube(-len / 2 + len * 0.3, len / 2, rad, rad, 10, cx, cy, 0)), { tint });
    P.add('matte', A(zTube(-len / 2, -len / 2 + len * 0.3, rad * 0.25, rad, 10, cx, cy, 0)), { tint });
    P.add('matte', A(zTube(-len * 0.12, -len * 0.06, rad * 1.01, rad * 1.01, 10, cx, cy, 0)), { tint: band });
  }
}

/** A camouflage net on poles over (w x d) at height y, sagging, draped down to the ground at the edges. */
export function netOver(P, w, d, y, { sag = 0.3, seed = 1, drape = 1.2, open = false } = {}) {
  // open: the front edge (-Z) stays up on its poles instead of being pegged down, so a gun can fire out
  const r = rng(seed), g = new THREE.PlaneGeometry(w + drape * 2, d + drape * (open ? 1 : 2), 12, 12).rotateX(-Math.PI / 2);
  if (open) g.translate(0, 0, drape / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i), u = Math.min(1, Math.abs(px) / (w / 2)), v = Math.min(1, Math.abs(pz) / (d / 2));
    const out = Math.min(1, Math.max(Math.abs(px) - w / 2, open && pz < 0 ? 0 : Math.abs(pz) - d / 2, 0) / drape);
    let h = y - sag * (1 - u * u) * (1 - v * v) + (r() - 0.5) * 0.12;
    h = h * (1 - out) + 0.05 * out;
    p.setY(i, h);
  }
  g.computeVertexNormals();
  P.add('net', g);
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) P.add('wood', rod(V(px, 0, pz), V(px, y - (px || pz ? 0 : sag) + 0.05, pz), 0.04, 5));
}

/** A shallow gun pit: an open-backed ring of sandbags (radius R, open to +Z by `gap` radians) with earth banked outside. */
export function pit(P, R, { courses = 3, gap = 1.3, seed = 1, earth = 0xa08c6c } = {}) {
  const r = rng(seed), n = 16;
  const a0 = gap / 2, a1 = Math.PI * 2 - gap / 2; // angle from +Z round through -Z (the front)
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const x0 = Math.sin(t0) * R, z0 = Math.cos(t0) * R, x1 = Math.sin(t1) * R, z1 = Math.cos(t1) * R;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ryy = Math.atan2(-dz, dx);
    for (let c = 0; c < courses; c++) P.add('sandbag', box(len + 0.05, 0.17, 0.55 * Math.pow(0.9, c)).applyMatrix4(xf((x0 + x1) / 2, 0.17 * (c + 0.5), (z0 + z1) / 2, 0, ryy, 0)), { tint: c % 2 ? 0xe0d4b8 : 0xf0e4c8 });
    const tm = (t0 + t1) / 2;
    P.add('earth', sphere(1, Math.sin(tm) * (R + 0.9), 0.1, Math.cos(tm) * (R + 0.9), 1.0 + r() * 0.3, 0.42 + r() * 0.12, 0.9 + r() * 0.3, 8), { tint: earth });
  }
}

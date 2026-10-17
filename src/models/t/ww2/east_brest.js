import * as THREE from 'three';
import { box, sphere, sideProfile, topProfile, loft, xf, yTube } from '../../kit.js';
import { FParts } from '../mats.js';
import { damageable, finishTarget } from '../damage.js';
import { partLayout } from '../layout.js';
import { rng } from '../props.js';
import { ss, arch, opening, field, span } from './east_kit.js';
import { CITADEL_R } from './layout_east.js';

// Brest-Litovsk, 22 June 1941: the targets of the Karl-Geraet. The fortress of the 1840s, red brick under
// earth: the two-storey ring barracks of the citadel, a gate tower in the ring, the Eastern Fort. Faces
// local -Z (out across the moat toward the German side); the citadel's court is at +Z.

const BRICK = 0xd8b8a8; // tint over the brick texture: the Brest brick is a warm, slightly dull red
const DARKB = 0xb89888; // string courses, cornices and voussoirs in a darker brick
const GRASS = 0x9aa070;

// An adder that transforms every geometry by M before it goes into P (lets the helpers that add in a
// local frame, like `opening`, work on a segment turned along a curve).
const at = (P, M) => ({ add: (k, g, o) => P.add(k, g.applyMatrix4(M), o) });

/**
 * One stretch of the ring barracks, L long (along X) and D deep, eaves at Hh: the outer (moat) facade in
 * three slabs that can fall (two tiers of round-headed embrasures between pilaster strips, a corbelled
 * cornice), the court facade with two storeys of tall arched windows and doors, the earth roof with its
 * chimneys. Adds to `part`; returns the groups damage moves.
 */
function barracks(part, L, { D = 15, Hh = 9, r, court = true, chunks = 3 } = {}) {
  const body = new THREE.Group(), roof = new THREE.Group(), slabs = [];
  part.add(body, roof);
  const B = new FParts('green');
  B.add('brick', box(L, Hh + 2, D - 0.8, 0, Hh / 2 - 1, 0.4), { tint: BRICK });
  B.add('brick', box(L + 0.1, 0.5, D - 0.6, 0, Hh - 0.1, 0.4), { tint: DARKB });
  B.add('brick', box(L + 0.1, 0.9, 0.3, 0, 0.35, D / 2 + 0.1), { tint: DARKB }); // the plinth
  if (court) {
    const n = Math.max(1, Math.round(L / 3.6)), g = L / n;
    for (let k = 0; k < n; k++) {
      const x = -L / 2 + g * (k + 0.5);
      if (k % 4 === 1) B.add('char', arch(1.8, 3.0, 0.2, x, 0, D / 2 + 0.1), { tint: 0x2a2622 }); // a door
      else opening(B, x, 1.0, D / 2, 1.5, 2.4, 1, { tint: DARKB });
      opening(B, x, 5.2, D / 2, 1.5, 2.5, 1, { tint: DARKB });
    }
    B.add('brick', box(L + 0.1, 0.3, 0.25, 0, 4.6, D / 2 + 0.12), { tint: DARKB });
  }
  B.build(body, { dirt: 0.3 });
  // the moat facade: slabs pivoting at their foot so they can fall outward
  const w = L / chunks;
  for (let c = 0; c < chunks; c++) {
    const g = new THREE.Group();
    g.position.set(-L / 2 + w * (c + 0.5), -2, -D / 2 + 0.4);
    const F = new FParts('green');
    F.add('brick', box(w + 0.02, Hh + 2, 0.8, 0, (Hh + 2) / 2, 0), { tint: BRICK });
    F.add('brick', box(w + 0.02, 0.6, 0.3, 0, Hh + 1.6, -0.5), { tint: DARKB }); // cornice
    for (let k = 0; k < Math.round(w / 0.9); k++) F.add('brick', box(0.35, 0.3, 0.25, -w / 2 + 0.45 + k * 0.9, Hh + 1.15, -0.45), { tint: DARKB }); // corbels
    F.add('brick', box(w + 0.02, 1.2, 0.2, 0, 2.6, -0.45), { tint: DARKB }); // the plinth over the water line
    const n = Math.max(1, Math.round(w / 3.3)), gap = w / n;
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + gap * (k + 0.5);
      opening(F, x, 3.5, -0.4, 0.9, 1.6, -1, { tint: DARKB, sill: false });
      opening(F, x, 7.0, -0.4, 1.1, 2.0, -1, { tint: DARKB, sill: false });
      if (k % 2 === 0) F.add('brick', box(0.7, Hh + 0.6, 0.25, x - gap / 2, (Hh + 0.6) / 2 + 1, -0.45), { tint: BRICK }); // pilaster strips
    }
    F.build(g, { dirt: 0.4, y0: -2 });
    part.add(g);
    slabs.push(g);
  }
  // the earth roof: a flat-topped bank turfed over, chimneys through it on the court side
  roof.position.y = Hh;
  const R = new FParts('green');
  R.add('earth', sideProfile([[-D / 2 - 0.3, 0], [D / 2 + 0.2, 0], [D / 2 - 2.5, 2.3], [-D / 2 + 3.5, 2.6]], L + 0.05), { tint: GRASS });
  for (let k = 0; k < Math.round(L / 9); k++) {
    const x = -L / 2 + 4 + k * 9 + (r() - 0.5) * 2;
    R.add('brick', box(0.9, 2.2, 0.9, x, 2.0, D / 2 - 2.2), { tint: DARKB });
    R.add('brick', box(1.1, 0.2, 1.1, x, 3.1, D / 2 - 2.2), { tint: DARKB });
  }
  R.build(roof, { dirt: 0, y0: Hh });
  return { body, roof, slabs };
}

/** The moat before a stretch of wall: a berm at the foot, the water, the far bank. Local frame of the stretch. */
function moat(P, L, D, { width = 20, dy = 0, fan = 0 } = {}) {
  // fan: extra length out at the far bank, so the stretches along an arc leave no wedges between them
  P.add('earth', box(L + 0.6, 0.6, 4, 0, 0.1 + dy, -D / 2 - 2), { tint: GRASS });
  P.add('water', box(L + 0.6 + fan * 0.6, 0.1, width, 0, 0.15 + dy, -D / 2 - 4 - width / 2));
  P.add('earth', sideProfile([[-D / 2 - 4 - width - 8, -0.5], [-D / 2 - 4 - width + 0.5, -0.5], [-D / 2 - 4 - width - 1.5, 1.4 + dy], [-D / 2 - 4 - width - 8, 1.6 + dy]], L + 0.6 + fan), { tint: GRASS });
}

/**
 * A heap of brick rubble (w x d, turned by ry at x, z) that grows in with damage: returns the damage bit.
 * It lives outside the part so it keeps the brick's colour against the charred shell.
 */
function heap(parent, x, z, ry, w, d, r, k0 = 0.4) {
  const g = new THREE.Group(), P = new FParts('green');
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  P.add('earth', sphere(1, 0, -0.2, 0, w / 2, 1.6, d / 2, 10), { tint: 0xa08070 });
  for (let k = 0; k < 18; k++) {
    const a = r() * 6.28, f = Math.sqrt(r()), s = 0.4 + r() * 0.9;
    P.add('brick', box(s * 1.6, s * 0.6, s, Math.cos(a) * f * w * 0.45, 0.6 + (1 - f) * 0.8, Math.sin(a) * f * d * 0.45, r() * 3, r() * 3, r() * 3), { tint: r() < 0.3 ? 0x806050 : BRICK });
  }
  P.build(g, { dirt: 0.3 });
  g.scale.setScalar(0.001);
  parent.add(g);
  return { obj: g, k0, k1: Math.min(1, k0 + 0.4), scale: 1000 };
}

function tree(P, x, z, r, s = 1) {
  const h = (5 + r() * 4) * s;
  P.add('wood', yTube(-0.5, h * 0.6, 0.25 * s, 0.16 * s, 6, x, z), { tint: 0x6a5a48 });
  P.add('matte', sphere(1, x, h * 0.7, z, 2.6 * s, 2.4 * s, 2.6 * s, 8), { tint: 0x4a5a2e });
  P.add('matte', sphere(1, x + 1.2 * s, h * 0.85, z - 0.6, 1.8 * s, 1.6 * s, 1.8 * s, 7), { tint: 0x56663a });
}

// ------------------------------------------------------------------ citadel

// Four stretches of the ring barracks along the citadel's arc (radius CITADEL_R, centre in the court at +Z),
// each about 40 m: two storeys of red brick under an earth roof, the moat before them, the court behind
// with its trees. Damage tips the moat facade's slabs into the water, drops the roof in, blackens it.
export function buildCitadel() {
  const root = new THREE.Group(), r = rng(1941);
  const lay = partLayout('citadel');
  const parts = [], D = 15, L = 40.6;
  const W = new FParts('green');
  lay.forEach((l, i) => {
    const part = new THREE.Group();
    part.position.set(l.x, 0, l.z);
    part.rotation.y = Math.asin(-l.x / CITADEL_R); // tangent to the ring
    root.add(part);
    const { roof, slabs } = barracks(part, L, { D, r });
    const M = xf(l.x, 0, l.z, 0, part.rotation.y, 0);
    const Q = at(W, M);
    moat(Q, L, D, { dy: i * 0.01, fan: 2 * (D / 2 + 32) * Math.tan(L / CITADEL_R / 2) });
    for (let k = 0; k < 3; k++) tree(Q, -L / 2 + 6 + k * 14 + r() * 4, D / 2 + 9 + r() * 10, r);
    Q.add('earth', box(L + 0.6, 0.08, 8, 0, 0.04, D / 2 + 4), { tint: 0x8a7a62 }); // the court's road
    const c = Math.cos(part.rotation.y), sn = Math.sin(part.rotation.y), lx = (u, v) => l.x + u * c + v * sn, lz = (u, v) => l.z - u * sn + v * c;
    const heaps = [-12, 10].map((u, j) => heap(root, lx(u, -D / 2 - 2.5), lz(u, -D / 2 - 2.5), part.rotation.y, 16, 6, r, 0.35 + j * 0.2));
    damageable(part, {
      scorch: 18, char: 0.85, sink: 0.3, squash: 0.72,
      bits: [...heaps,
        { obj: roof, k0: 0.15, k1: 0.85, pos: [0.3, -3.2, 0.4], rot: [0.06, 0, (i % 2 ? 1 : -1) * 0.05], scale: 0.95 },
        ...slabs.map((s, c) => ({ obj: s, k0: 0.3 + c * 0.15, k1: 0.75 + c * 0.1, pos: [0, -0.8, -0.6], rot: [-1.0 - ((c + i) % 3) * 0.2, 0, (c - 1) * 0.08] })),
      ],
    });
    parts.push(part);
  });
  W.build(root, { dirt: 0.2 });
  return finishTarget(root, parts);
}

// ------------------------------------------------------------------ gate

// A gate of the citadel in the manner of the Terespol and Kholm gates: a three-storey brick tower over the
// gate passage in the ring barracks, octagonal turrets at its corners, a corbelled and crenellated parapet,
// blind arcading, the passage arched through at the foot; the barracks run off to each side and a brick
// bridge crosses the moat to the gate. One part, the tower: damage brings the parapet and turret heads
// down, slumps the tower and blackens it.
export function buildGate() {
  const root = new THREE.Group(), r = rng(1842);
  const part = new THREE.Group();
  root.add(part);
  const TW = 17, TD = 21, TH = 15.5; // the tower's body; the top tier rises to 21 m
  const body = new THREE.Group(), top = new THREE.Group();
  top.position.y = TH;
  part.add(body, top);
  const B = new FParts('green');
  B.add('brick', box(TW, TH + 2, TD, 0, TH / 2 - 1, 0), { tint: BRICK });
  B.add('char', arch(5.2, 7.6, TD + 0.2, 0, -0.01, 0)); // the passage
  for (const s of [-1, 1]) {
    const z = s * TD / 2;
    opening(B, 0, 0, z, 5.2, 7.6, s, { tint: DARKB, rim: 0.6, sill: false });
    for (const y of [9.6]) for (const x of [-4.5, 0, 4.5]) opening(B, x, y, z, 1.6, 3.0, s, { tint: DARKB, rim: 0.3 });
    for (const x of [-5.5, 5.5]) B.add('brick', arch(2.4, 6.2, 0.2, x, 1.0, z + s * 0.08), { tint: 0xa87868 }); // blind arcading
    B.add('brick', box(TW + 0.2, 0.4, 0.3, 0, 8.6, z + s * 0.1), { tint: DARKB });
  }
  // corner turrets, lower shafts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('brick', yTube(-2, TH, 1.7, 1.7, 8, sx * TW / 2, sz * TD / 2), { tint: BRICK });
  B.build(body, { dirt: 0.3 });
  // the side windows over the barracks roof, on the tower's flanks
  const S = new FParts('green');
  for (const s of [-1, 1]) for (const z of [-4, 4]) opening(at(S, xf(s * TW / 2, 0, z, 0, -s * Math.PI / 2, 0)), 0, 12.5, 0, 1.4, 2.6, -1, { tint: DARKB, rim: 0.3 });
  S.build(body, { dirt: 0.3 });
  const T = new FParts('green');
  // the top tier: storey with windows, corbel table, parapet and merlons; turret heads with their own crenels
  T.add('brick', box(TW, 3.0, TD, 0, 1.5, 0), { tint: BRICK });
  for (const s of [-1, 1]) for (const x of [-4.5, 0, 4.5]) opening(T, x, 0.3, s * TD / 2, 1.2, 2.2, s, { tint: DARKB, rim: 0.25 });
  T.add('brick', box(TW + 0.8, 0.5, TD + 0.8, 0, 3.25, 0), { tint: DARKB });
  for (let k = 0; k < 16; k++) for (const s of [-1, 1]) {
    T.add('brick', box(0.4, 0.4, 0.4, -TW / 2 + 0.6 + k * (TW - 1.2) / 15, 2.85, s * (TD / 2 + 0.2)), { tint: DARKB });
    T.add('brick', box(0.4, 0.4, 0.4, s * (TW / 2 + 0.2), 2.85, -TD / 2 + 0.6 + k * (TD - 1.2) / 15), { tint: DARKB });
  }
  for (const s of [-1, 1]) { // parapet walls
    T.add('brick', box(TW + 0.8, 1.0, 0.6, 0, 4.0, s * (TD / 2 + 0.1)), { tint: BRICK });
    T.add('brick', box(0.6, 1.0, TD + 0.8, s * (TW / 2 + 0.1), 4.0, 0), { tint: BRICK });
    for (let k = 0; k < 8; k++) {
      T.add('brick', box(1.0, 1.1, 0.6, -TW / 2 + 1.6 + k * (TW - 3.2) / 7, 5.05, s * (TD / 2 + 0.1)), { tint: BRICK });
      T.add('brick', box(0.6, 1.1, 1.0, s * (TW / 2 + 0.1), 5.05, -TD / 2 + 1.6 + k * (TD - 3.2) / 7), { tint: BRICK });
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * TW / 2, z = sz * TD / 2;
    T.add('brick', yTube(0, 5.0, 1.7, 1.7, 8, x, z), { tint: BRICK });
    T.add('brick', yTube(5.0, 5.6, 1.7, 2.1, 8, x, z), { tint: DARKB });
    T.add('brick', yTube(5.6, 6.0, 2.1, 2.1, 8, x, z), { tint: BRICK });
    for (let k = 0; k < 8; k += 2) {
      const a = (k + 0.5) / 8 * Math.PI * 2;
      T.add('brick', box(0.9, 1.0, 0.5, x + Math.sin(a) * 1.85, 6.5, z + Math.cos(a) * 1.85, 0, a), { tint: BRICK });
    }
    T.add('char', box(0.25, 1.2, 0.25, x + sx * 1.62, 2.5, z + sz * 0.3)); // a slit
  }
  T.build(top, { dirt: 0, y0: TH });
  damageable(part, {
    scorch: 20, char: 0.85, sink: 0.4, squash: 0.8,
    bits: [{ obj: top, k0: 0.25, k1: 0.9, pos: [1.2, -4.0, -1.0], rot: [-0.14, 0.1, -0.18], scale: 0.9 },
      heap(root, -6, -TD / 2 - 3, 0, 9, 6, r, 0.3), heap(root, 5, -TD / 2 - 2, 0.3, 8, 5, r, 0.5), heap(root, 3, TD / 2 + 3, 0, 10, 6, r, 0.45)],
  });

  // the barracks either side (dressing), the moat and the bridge to the gate
  const W = new FParts('green');
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * (TW / 2 + 17), 0, 0);
    root.add(g);
    barracks(g, 34, { D: 15, r });
    moat(at(W, xf(s * (TW / 2 + 17), 0, 0)), 34, 15);
  }
  moat(W, TW + 0.2, 15);
  W.add('brick', box(6.5, 1.1, 24, 0, 1.0, -TD / 2 - 10), { tint: BRICK }); // the bridge deck
  for (const s of [-1, 1]) W.add('brick', box(0.5, 1.0, 24, s * 3.0, 2.0, -TD / 2 - 10), { tint: DARKB });
  for (const z of [-17, -25]) W.add('brick', box(6.5, 2.5, 2.0, 0, -0.3, z), { tint: DARKB }); // piers
  W.add('earth', box(7, 0.08, 30, 0, 0.6, -50), { tint: 0x8a7a62 });
  W.build(root, { dirt: 0.2 });
  return finishTarget(root, [part]);
}

// ------------------------------------------------------------------ eastfort

// The Eastern Fort: a horseshoe of earth rampart (8 m, open behind at the gorge) inside a wet moat, the
// rampart's inner face a two-storey brick casemate wall looking onto the court, and in the court the keep,
// a smaller horseshoe of two-storey brick casemates under earth. A caponier at the apex sweeps the moat.
// Parts: the left flank of the rampart, the keep, the right flank. Damage slumps the rampart, brings its
// casemate wall down and chars it; the keep loses its roof and walls.
const RO = 48, ZA = 34, RK = 17, ZK = 8;
const sdist = (x, z) => (z <= 0 ? Math.hypot(x, z) - RO : z <= ZA ? Math.abs(x) - RO : Math.hypot(Math.abs(x) - RO, z - ZA));
// points along a horseshoe of radius R (front at -Z) and arm length zA, side -1 left, +1 right
function shoe(R, zA, side, n = 7, m = 2) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI / 2; pts.push([side * R * Math.sin(a), -R * Math.cos(a)]); }
  for (let k = 1; k <= m; k++) pts.push([side * R, (zA * k) / m]);
  return pts;
}
/**
 * Brick casemate wall along pts, mitred at the bends: its inner face (toward the fort's axis) at the line,
 * D more of casemate behind it; windows and doors on the inner face and/or embrasures on the outer one,
 * and optionally the earth roof over it.
 */
function casemateWall(P, pts, { H = 8.2, t = 1.2, inner = true, outer = false, tint = BRICK, earth = false, brick = true, D = 0 } = {}) {
  const n = pts.length, th = [], nrm = [], m = [];
  for (let k = 0; k < n - 1; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2, mz = (pts[k][1] + pts[k + 1][1]) / 2;
    th.push(Math.atan2(mx, mz > 0 ? 0 : mz)); // local -Z toward the axis: x = 0 on the arms, the centre on the round
    nrm.push([Math.sin(th[k]), Math.cos(th[k])]); // local +Z, outward
  }
  for (let k = 0; k < n; k++) { // mitre vectors at the vertices
    const a = nrm[Math.max(0, k - 1)], b = nrm[Math.min(n - 2, k)], d = 1 + a[0] * b[0] + a[1] * b[1];
    m.push([(a[0] + b[0]) / d, (a[1] + b[1]) / d]);
  }
  if (Math.abs(pts[0][0]) < 1e-6) m[0] = [0, 1 / nrm[0][1]]; // the apex on the axis: mitred against the other half's mirror image
  const off = (k, o) => [pts[k][0] + m[k][0] * o, pts[k][1] + m[k][1] * o];
  const quad = (k, o0, o1) => [off(k, o0), off(k + 1, o0), off(k + 1, o1), off(k, o1)];
  const sect = (k, rows) => rows.map(([o, y]) => { const [x, z] = off(k, o); return new THREE.Vector3(x, y, z); });
  for (let k = 0; k < n - 1; k++) {
    if (earth) {
      const rows = [[-t / 2 - 0.3, H], [t / 2 + D + 0.3, H], [t / 2 + D - 2, H + 2.2], [-t / 2 + 2, H + 2.2]];
      P.add('earth', loft([sect(k, rows), sect(k + 1, rows)]), { tint: GRASS });
    }
    if (!brick) continue;
    P.add('brick', topProfile(quad(k, -t / 2, t / 2 + D), -2, H), { tint });
    P.add('brick', topProfile(quad(k, -t / 2 - 0.25, -t / 2 + 0.05), H - 0.45, H), { tint: DARKB });
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], len = Math.hypot(bx - ax, bz - az);
    const Q = at(P, xf((ax + bx) / 2, 0, (az + bz) / 2, 0, th[k], 0));
    const nw = Math.max(1, Math.round(len / 3.4)), g = len / nw;
    for (let i = 0; i < nw; i++) {
      const x = -len / 2 + g * (i + 0.5);
      if (inner) {
        if (i % 3 === 1) Q.add('char', arch(1.8, 3.0, 0.2, x, 0, -t / 2 - 0.1), { tint: 0x2a2622 });
        else opening(Q, x, 1.0, -t / 2, 1.4, 2.3, -1, { tint: DARKB });
        opening(Q, x, 4.9, -t / 2, 1.4, 2.3, -1, { tint: DARKB });
      }
      if (outer) {
        opening(Q, x, 1.6, t / 2 + D, 0.8, 1.4, 1, { tint: DARKB, sill: false });
        opening(Q, x, 5.2, t / 2 + D, 0.8, 1.4, 1, { tint: DARKB, sill: false });
      }
    }
  }
}

/** The moat's water round one flank: a ribbon between offsets s0 and s1 from the rampart's centre line. */
function moatRibbon(side, s0, s1, y) {
  const path = (s) => {
    const R = RO + s, out = [];
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI / 2; out.push([side * R * Math.sin(a), -R * Math.cos(a)]); }
    for (let k = 1; k <= 4; k++) out.push([side * R, ((ZA + 3.5) * k) / 4]);
    return out;
  };
  const A = path(s0), B = path(s1), pos = [];
  for (let k = 0; k < A.length - 1; k++) {
    const a0 = [A[k][0], y, A[k][1]], a1 = [A[k + 1][0], y, A[k + 1][1]], b0 = [B[k][0], y, B[k][1]], b1 = [B[k + 1][0], y, B[k + 1][1]];
    pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { // wind it to face up
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), yy = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, yy, z); }
    g.computeVertexNormals();
  }
  return g;
}

export function buildEastFort() {
  const root = new THREE.Group(), r = rng(1878);
  const parts = [];
  // the flanks: each half of the rampart (a heightfield split at x = 0) with its casemate wall
  for (const side of [-1, 1]) {
    const part = new THREE.Group(), wall = new THREE.Group();
    part.add(wall);
    root.add(part);
    const xs = side < 0 ? span(-92, 0, 31) : span(0, 92, 31);
    const H = new FParts('green');
    H.add('earth', field(xs, span(-92, ZA + 3.5, 44), (x, z) => {
      const s = sdist(x, z);
      if (s < -7.4) return -1.5; // the court (the casemate wall is the rampart's inner face)
      if (s < 0) return 8.2 + Math.sin(x * 0.2) * 0.15;
      if (s < 13) return 8.2 * (1 - ss(2.5, 13, s));
      if (s < 27) return -0.4; // under the moat's water
      if (s > 44 || (z > ZA && Math.abs(x) < RO - 8)) return -1.5; // beyond the glacis, and the gorge
      return 1.6 * ss(27, 30, s) * (1 - ss(30, 44, s)) - 0.4 * (1 - ss(27, 30, s)) - 0.6 * ss(38, 44, s); // the glacis
    }), { tint: GRASS });
    H.add('water', moatRibbon(side, 11.5, 27.5, 0.15));
    H.build(part, { dirt: 0.1 });
    const C = new FParts('green');
    casemateWall(C, shoe(RO - 7.4 - 0.6, ZA + 3.5, side, 8, 3));
    // the rampart's gorge end: a brick revetment with a postern
    C.add('brick', box(21.8, 10.4, 1.2, side * (RO + 2.4), 3.2, ZA + 4.1), { tint: BRICK });
    C.add('brick', box(22.2, 0.5, 1.5, side * (RO + 2.4), 8.4, ZA + 4.1), { tint: DARKB });
    opening(C, side * (RO - 2), 0, ZA + 4.7, 2.2, 3.0, 1, { tint: DARKB });
    C.build(wall, { dirt: 0.3 });
    damageable(part, {
      scorch: 22, char: 0.7, squash: 0.88,
      bits: [{ obj: wall, k0: 0.3, k1: 1, pos: [side * -0.6, -3.5, 0.4], rot: [0.05, 0, side * 0.12] },
      heap(root, side * 34, -18, side * 0.9, 18, 6, r, 0.35), heap(root, side * 37.5, 14, 0, 6, 16, r, 0.5)],
    });
    parts.push(part);
  }
  // the keep: a small horseshoe of casemates in the court, windows both sides, earth on the roof
  const keep = new THREE.Group(), kroof = new THREE.Group();
  keep.position.set(0, 0, 0);
  keep.add(kroof);
  root.add(keep);
  const K = new FParts('green'), KR = new FParts('green');
  for (const side of [-1, 1]) {
    const pts = shoe(RK, ZK, side, 6, 1);
    casemateWall(K, pts, { H: 7.6, t: 1.0, inner: true, outer: true, D: 8 });
    casemateWall(KR, pts, { H: 7.6, t: 1.0, D: 8, earth: true, brick: false });
  }
  K.build(keep, { dirt: 0.3 });
  KR.build(kroof, { dirt: 0, y0: 0 });
  damageable(keep, {
    scorch: 16, char: 0.85, sink: 0.4, squash: 0.7,
    bits: [{ obj: kroof, k0: 0.15, k1: 0.85, pos: [0, -3.5, 0.5], rot: [0.08, 0.05, -0.06] },
      heap(root, -22, -22, 0.8, 14, 6, r, 0.3), heap(root, 24, -19, -0.9, 12, 6, r, 0.5), heap(root, 0, -31, 0, 10, 5, r, 0.6)],
  });
  parts.splice(1, 0, keep);
  // the caponier at the apex in the moat, the road in through the gorge, the court's trees
  const W = new FParts('green');
  W.add('brick', box(9, 5.5, 12, 0, 1.75, -RO - 16), { tint: BRICK });
  W.add('earth', sideProfile([[-RO - 22.3, 4.5], [-RO - 9.7, 4.5], [-RO - 12, 6.2], [-RO - 20, 6.2]], 9.4), { tint: GRASS });
  for (const s of [-1, 1]) for (const z of [-RO - 12, -RO - 18]) opening(at(W, xf(s * 4.5, 0, z, 0, -s * Math.PI / 2, 0)), 0, 1.6, 0, 0.7, 1.2, -1, { tint: DARKB, sill: false });
  W.add('earth', box(8, 0.08, 70, 0, 0.04, ZA + 10), { tint: 0x8a7a62 });
  for (let k = 0; k < 7; k++) {
    const a = (r() - 0.5) * 2.6, d = 28 + r() * 6;
    tree(W, Math.sin(a) * d, -Math.cos(a) * d * 0.8, r, 0.9);
  }
  W.build(root, { dirt: 0.2 });
  return finishTarget(root, parts);
}

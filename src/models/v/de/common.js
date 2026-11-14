import * as THREE from 'three';
import { V, box, xTube, yTube, zTube, rod, xf, CAMO, zLathe } from '../../kit.js';
import { ring, TAU } from '../../t/fieldkit.js';

// Shared parts and paint for the WW2 German guns (leFH 18, sFH 18, K 18 / Mrs 18, Nebelwerfer 41). Other German
// model files may import these read-only; the exports are stable.
//
// Paint schemes (registered in kit.js CAMO on import, so makeRig(scheme) / vehicleMats(scheme) know them):
//   'dgelb'     Dunkelgelb (RAL 7028) from 1943 with sprayed olive green and red-brown bands: Flanders 1944
//   'feldgrau'  Dunkelgrau (RAL 7021), the plain dark grey of 1939 to 1942: Brest 1941, Sevastopol 1942
CAMO.dgelb ??= { green: [0x9a8858, 0x585d36, 0x5a3f2c], disruptive: true, seed: 87 };
CAMO.feldgrau ??= { green: [0x4a4d4b, 0x52554f, 0x3f4240], seed: 97 };
export const DE_SCHEMES = ['dgelb', 'feldgrau'];

// Pressed steel disc wheel with a solid rubber tyre (the motorised artillery's wheel): axis along X, centre
// (x, y, z). R outer radius (over the rubber), tw tyre width, holes: lightening holes in a ring round the
// hub (0 for a plain disc), side +1/-1: which way the hub faces.
export function discWheel(P, x, y, { R = 0.65, tw = 0.12, holes = 10, side = 1, z = 0, hub = 0.12, dish = 0.04, rubber = 0.07 } = {}) {
  const at = (g) => g.applyMatrix4(xf(x, y, z));
  const Rr = R - rubber;
  P.add('tyre', at(ring(Rr - 0.01, R, -tw / 2, tw / 2, 40)));
  P.add('rim', at(ring(Rr - 0.04, Rr, -tw * 0.42, tw * 0.42, 36)));
  // the disc: dished toward the outside, the hole ring as separate spokes between holes
  const r0 = hub * 1.35, r1 = Rr - 0.04;
  if (holes > 0) {
    const rm = (r0 + r1) / 2, hr = Math.min((r1 - r0) * 0.36, (TAU * rm / holes) * 0.32);
    P.add('camo', at(ring(r0, rm - hr, side * dish * 0.6 - 0.008, side * dish * 0.6 + 0.008, 28)));
    P.add('camo', at(ring(rm + hr, r1, side * dish * 0.15 - 0.008, side * dish * 0.15 + 0.008, 36)));
    for (let i = 0; i < holes; i++) {
      const a = (i / holes + 0.5 / holes) * TAU, w = (TAU * rm / holes) - hr * 2;
      P.add('camo', at(box(0.016, hr * 2.2, Math.max(0.02, w), side * dish * 0.38, Math.cos(a) * rm, Math.sin(a) * rm, -a)));
    }
    // rolled lips round the holes read as dark rings
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * TAU;
      P.add('dark', at(new THREE.TorusGeometry(hr, 0.007, 4, 12).rotateY(Math.PI / 2).translate(side * dish * 0.38, Math.cos(a) * rm, Math.sin(a) * rm)));
    }
  } else P.add('camo', at(ring(r0, r1, side * dish * 0.3 - 0.008, side * dish * 0.3 + 0.008, 36)));
  // hub, hub cap, wheel nuts
  P.add('camo', at(xTube(-0.09, side * 0.11 + 0.0, hub, hub * 0.9, 16)));
  P.add('dark', at(xTube(side * 0.1, side * 0.16, hub * 0.62, hub * 0.45, 12)));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    P.add('steel', at(xTube(side * 0.1, side * 0.12, 0.012, 0.012, 6, Math.cos(a) * hub * 0.85, Math.sin(a) * hub * 0.85)));
  }
}

// Steel spoked wheel of the early leFH 18 (horse drawn): a steel felloe with a rubber tread, twelve flat pressed
// steel spokes, a big hub.
export function spokedSteelWheel(P, x, y, { R = 0.65, tw = 0.1, spokes = 12, side = 1, z = 0, hub = 0.12 } = {}) {
  const at = (g) => g.applyMatrix4(xf(x, y, z));
  P.add('tyre', at(ring(R - 0.035, R, -tw / 2, tw / 2, 44)));
  P.add('camo', at(ring(R - 0.08, R - 0.035, -tw * 0.45, tw * 0.45, 40)));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    P.add('camo', at(rod(V(side * -0.02, ca * hub, sa * hub), V(side * 0.0, ca * (R - 0.07), sa * (R - 0.07)), 0.022, 5).applyMatrix4(xf(0, 0, 0, 0, 0, 0, V(0.6, 1, 1)))));
  }
  P.add('camo', at(xTube(-0.1, side * 0.12, hub, hub * 0.9, 16)));
  P.add('dark', at(xTube(side * 0.11, side * 0.17, hub * 0.6, hub * 0.42, 12)));
}

// A box-section trail leg from a hinge point to the spade, straight in plan: stations along the leg carry
// (width, depth); `a` the hinge (Vector3), `b` the end on the ground side. Ends with a spade plate and a
// lifting handle. Returns nothing: geometry goes into P.
export function trailLeg(P, a, b, { w0 = 0.2, h0 = 0.24, w1 = 0.13, h1 = 0.16, spade = [0.36, 0.34], handle = true, key = 'camo' } = {}) {
  const d = b.clone().sub(a), len = d.length(), yaw = Math.atan2(d.x, d.z), pitch = Math.asin(d.y / len);
  const m = new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')), V(1, 1, 1));
  const n = 4, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = w0 + (w1 - w0) * t, h = h0 + (h1 - h0) * t, z = len * t;
    pts.push([V(-w / 2, -h / 2, z), V(w / 2, -h / 2, z), V(w / 2, h / 2, z), V(-w / 2, h / 2, z)]);
  }
  const rings = pts;
  // loft per segment (convex pieces)
  for (let i = 0; i < n; i++) P.add(key, loftQuad(rings[i], rings[i + 1]).applyMatrix4(m));
  // flange strips along the top edges
  P.add('dark', box(w0 * 0.98, 0.012, len * 0.96, 0, (h0 + h1) / 4 + 0.006, len / 2).applyMatrix4(m));
  if (spade) {
    // the spade: a plate standing down into the ground at the end, braced back
    const [sw, sh] = spade;
    const sp = box(sw, sh, 0.03, 0, -sh / 2 + h1 / 2, len - 0.04, -0.25);
    P.add(key, sp.applyMatrix4(m));
    P.add('dark', box(0.03, sh * 0.6, 0.18, 0, -sh * 0.25, len - 0.12, 0.6).applyMatrix4(m));
  }
  if (handle) {
    for (const s of [-1, 1]) P.add('steel', rod(V(s * w1 / 2, 0, len * 0.7), V(s * (w1 / 2 + 0.07), 0, len * 0.76), 0.012, 5).applyMatrix4(m));
    P.add('steel', rod(V(-w1 / 2 - 0.07, 0, len * 0.76), V(w1 / 2 + 0.07, 0, len * 0.76), 0.012, 5).applyMatrix4(m));
  }
  return { len, m };
}

function loftQuad(A, B) {
  const g = new THREE.BufferGeometry(), pos = [];
  const quad = (a, b, c, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(A[i], A[j], B[j], B[i]); }
  quad(A[3], A[2], A[1], A[0]);
  quad(B[0], B[1], B[2], B[3]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // fix winding outward: the loft goes along +z; faces are built consistently, flip if the normal points in
  g.computeVertexNormals();
  return fixWinding(g);
}
function fixWinding(g) {
  const p = g.attributes.position, c = new THREE.Vector3(), n = p.count;
  for (let i = 0; i < n; i++) { c.x += p.getX(i) / n; c.y += p.getY(i) / n; c.z += p.getZ(i) / n; }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    e1.subVectors(b, a).cross(e2.subVectors(d, a));
    const m = a.clone().add(b).add(d).divideScalar(3).sub(c);
    if (e1.dot(m) < 0) { p.setXYZ(i + 1, d.x, d.y, d.z); p.setXYZ(i + 2, b.x, b.y, b.z); }
  }
  g.computeVertexNormals();
  return g;
}

// The panoramic sight (Rundblickfernrohr 16/32): a vertical body with the rotating head and the angled
// eyepiece toward the layer, on a short stalk. Built at (x, y, z), the eyepiece facing `side` (-1 left).
export function panoramicSight(P, x, y, z, side = -1) {
  P.add('dark', yTube(y, y + 0.1, 0.014, 0.014, 6, x, z));
  P.add('dark', yTube(y + 0.1, y + 0.24, 0.032, 0.032, 12, x, z));
  P.add('dark', yTube(y + 0.24, y + 0.3, 0.038, 0.034, 12, x, z)); // azimuth ring
  P.add('dark', box(0.06, 0.07, 0.07, x, y + 0.34, z)); // head
  P.add('glass', box(0.045, 0.035, 0.005, x, y + 0.345, z - 0.036));
  P.add('dark', rod(V(x, y + 0.18, z), V(x + side * 0.1, y + 0.2, z + 0.06), 0.017, 8)); // eyepiece arm
  P.add('rubber', xTube(x + side * 0.1, x + side * 0.14, 0.022, 0.024, 10, y + 0.2, z + 0.06));
}

// A two-baffle muzzle brake (leFH 18M, the Mrs 18 had none) along -Z from z0 (rear) with radius r.
export function muzzleBrake(P, z0, r, len = 0.4) {
  const a = z0, b = z0 - len;
  P.add('camo', zTube(a, a - 0.06, r * 0.9, r * 0.95, 18));
  for (const k of [0.15, 0.55, 0.92]) {
    const zc = a - len * k;
    P.add('camo', zTube(zc + 0.04, zc - 0.04, r, r, 18));
  }
  // side plates between the baffles (the ports open left and right)
  for (const s of [-1, 1]) for (const k of [0.35, 0.74]) P.add('dark', box(0.01, r * 1.1, len * 0.28, s * r * 0.55, 0, a - len * k));
  for (const s of [-1, 1]) P.add('camo', box(r * 2, r * 0.45, len * 0.98, 0, s * r * 0.78, a - len / 2));
  P.add('char', new THREE.CircleGeometry(r * 0.55, 14).rotateY(Math.PI).translate(0, 0, b - 0.001));
}

// The horizontal sliding breech block: the breech ring is a squared block on the barrel (built by the gun); the
// block (child of the `breech` pivot) slides out to the right (+X) by `travel` m at setBreech(1).
export function slidingBlock(rig, pivot, travel) {
  const x0 = pivot.position.x;
  rig.setBreech = (k) => { pivot.position.x = x0 + Math.min(1, Math.max(0, k)) * travel; };
  rig.breechOpen = { axis: 'x', slide: travel };
  rig.setBreech(0);
}

// The rear wall of a German horizontal sliding breech ring, the part that makes the breech read as German from behind
// (refs/fk16, sfh13, sfh18, k18_mrs18, k5 photos): a cast plate with the loading opening, round on the bore, through which
// the block's face (its firing lock on the bore) shows when shut and the chamber when open; the block slides in the
// ring's slot ahead of the plate and leaves it on the right. The opening runs out to the plate's left edge on the field
// and medium guns (chan 'edge': a U lying on its side), as a short tongue on the K5 ('tongue', length `tl`, half
// height `th`), or is a plain round hole ('hole'). The outline is a rounded rectangle [x0, x1] x [y0, y1] with corner
// radius `cr`, or a disc of radius `R` when R > 0; the bore at (0, 0). The plate stands between z1 - t and z1 (z1 the
// breech face), its edges rounded by `bevel` without growing past the outline.
export function keyholePlate({ x0 = 0, x1 = 0, y0 = 0, y1 = 0, cr = 0, R = 0, r, chan = 'edge', tl = 0, th = 0, t, z1, bevel = 0.01 }) {
  const s = new THREE.Shape();
  if (R > 0 && chan === 'edge') {
    // the round ring's rear part as a C (the 38 cm's, refs/max38/photos/17_Leugenboom_breech_ring.jpg): clockwise
    // round the rim from the channel's top edge, in along its bottom edge, round the opening's end and out again
    const a = Math.asin(Math.min(0.999, r / R)), xr = -R * Math.cos(a);
    s.moveTo(xr, r);
    s.absarc(0, 0, R, Math.PI - a, -Math.PI + a, true);
    s.lineTo(0, -r);
    s.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(xr, r);
    return extrudeBack(s, t, z1, bevel, 40);
  }
  if (R > 0) s.absarc(0, 0, R, 0, Math.PI * 2, false);
  else if (chan === 'edge') {
    // clockwise from the opening's top edge at the plate's left side, round the outline, in along the opening's bottom
    // edge, round its end on the bore and out again
    s.moveTo(x0, r);
    s.lineTo(x0, y1 - cr); s.absarc(x0 + cr, y1 - cr, cr, Math.PI, Math.PI / 2, true);
    s.lineTo(x1 - cr, y1); s.absarc(x1 - cr, y1 - cr, cr, Math.PI / 2, 0, true);
    s.lineTo(x1, y0 + cr); s.absarc(x1 - cr, y0 + cr, cr, 0, -Math.PI / 2, true);
    s.lineTo(x0 + cr, y0); s.absarc(x0 + cr, y0 + cr, cr, -Math.PI / 2, -Math.PI, true);
    s.lineTo(x0, -r); s.lineTo(0, -r);
    s.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(x0, r);
    return extrudeBack(s, t, z1, bevel);
  } else {
    s.moveTo(x0 + cr, y0);
    s.lineTo(x1 - cr, y0); s.absarc(x1 - cr, y0 + cr, cr, -Math.PI / 2, 0, false);
    s.lineTo(x1, y1 - cr); s.absarc(x1 - cr, y1 - cr, cr, 0, Math.PI / 2, false);
    s.lineTo(x0 + cr, y1); s.absarc(x0 + cr, y1 - cr, cr, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0 + cr); s.absarc(x0 + cr, y0 + cr, cr, Math.PI, Math.PI * 1.5, false);
  }
  // the round opening, with its tongue to the left for 'tongue'
  const h = new THREE.Path();
  if (chan === 'tongue') {
    const a = Math.asin(Math.min(0.999, th / r)), xe = -r * Math.cos(a), xt = xe - tl + th;
    h.moveTo(xe, th);
    h.lineTo(xt, th);
    h.absarc(xt, 0, th, Math.PI / 2, Math.PI * 1.5, false);
    h.lineTo(xe, -th);
    h.absarc(0, 0, r, Math.PI + a, Math.PI * 3 - a, false);
  } else h.absarc(0, 0, r, 0, Math.PI * 2, false);
  s.holes.push(h);
  return extrudeBack(s, t, z1, bevel, R > 0 ? 40 : 12);
}

// a shape extruded along z between z1 - t and z1, its edges rounded by `bevel` inside the outline (`seg` points per
// curve: the big round rings of the railway guns want more than the field guns' corners)
function extrudeBack(s, t, z1, bevel, seg = 12) {
  const b = Math.min(bevel, t * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: seg });
  return g.translate(0, 0, z1 - t + b);
}

// The naval guns' round breech ring over the wedge's slot (refs/max38/photos/17_Leugenboom_breech_ring.jpg: the 38 cm
// SK L/45's ring, one smooth round mass with the slot cut right through it, guide rails along the slot's edges): the
// ring's top and bottom left standing above and below a slot of half height `h`, as two circular segments of radius
// `R` from z0 to z1; the slot open on both sides, so the wedge shows through it.
export function slotCaps(R, h, z0, z1, seg = 28) {
  const out = [];
  for (const sy of [1, -1]) {
    const a = Math.asin(Math.min(0.999, h / R)), s = new THREE.Shape();
    s.moveTo(R * Math.cos(a), sy * h);
    s.absarc(0, 0, R, sy > 0 ? a : -a, sy > 0 ? Math.PI - a : -Math.PI + a, sy < 0);
    s.lineTo(R * Math.cos(a), sy * h);
    out.push(new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: seg }).translate(0, 0, Math.min(z0, z1)));
  }
  return out;
}

// A lathe-turned barrel from [z, r] stations (muzzle first) along the bore at y = 0.
export const barrel = (pts, seg = 24) => zLathe(pts, seg);

// Equilibrator: a cylinder from a carriage point (traverse frame) to a cradle point (elevation frame) that
// follows the elevation. `out` pairs are updated by rig.update without allocating.
export function makeStrut(parent, mat, r0, r1) {
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, 1, 14).translate(0, 0.5, 0), mat.outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, 1, 10).translate(0, 0.5, 0), mat.inner);
  parent.add(outer, inner);
  return { outer, inner };
}
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// place the strut between a (fixed, in the strut's parent frame) and b (moving, given in the same frame);
// the outer tube covers `share` of the length from a (or a fixed `outerLen` m, the spring case), the rod the rest
export function setStrut(st, a, b, share = 0.62, outerLen = 0) {
  _s.copy(b).sub(a);
  const len = _s.length();
  _t.copy(_s).divideScalar(len || 1);
  st.outer.position.copy(a);
  st.outer.quaternion.setFromUnitVectors(_up, _t);
  st.outer.scale.set(1, outerLen > 0 ? Math.min(len * 0.92, outerLen) : len * share, 1);
  st.inner.position.copy(a);
  st.inner.quaternion.copy(st.outer.quaternion);
  st.inner.scale.set(1, len, 1);
}

// The top or bottom wall of a breech ring over the block's slot (shared by the K 17, sFH 13 and Mörser 16): the part
// of the ring's cast outline o = { x0, x1, y0, y1, cr } (a rounded rectangle about the bore) between heights ya and
// yb, from z0 to z1 with square ends; run into the bevelled front and rear walls by their bevel, it fills their
// rounded edges there, so the casting shows no seam round the slot.
export function ringBand(o, ya, yb, z0, z1) {
  const pts = [], n = 6;
  const cs = [[o.x1 - o.cr, o.y1 - o.cr], [o.x0 + o.cr, o.y1 - o.cr], [o.x0 + o.cr, o.y0 + o.cr], [o.x1 - o.cr, o.y0 + o.cr]];
  cs.forEach(([cx, cy], q) => { for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; pts.push([cx + o.cr * Math.cos(a), cy + o.cr * Math.sin(a)]); } });
  // clipped to ya <= y <= yb (Sutherland-Hodgman against the two lines)
  const clip = (p, inside, yc) => {
    const out = [];
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length], ia = inside(a[1]), ib = inside(b[1]);
      if (ia) out.push(a);
      if (ia !== ib) out.push([a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), yc]);
    });
    return out;
  };
  const q = clip(clip(pts, (y) => y >= ya, ya), (y) => y <= yb, yb);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(q.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false });
  return g.translate(0, 0, z0);
}

// The cast breech ring of the Krupp horizontal sliding-block guns (the K 18, the Mörser 18, the K 38, the 35.5 cm
// H M1 and the sFH 18 build theirs with it). One casting with generously rounded edges, the block's slot running across it and
// open on the right, where the block leaves (refs/k18_mrs18 21cmM_rser18FortSillRear2005, Obsluga_uchenia_K18_breech
// _drill; refs/sfh18 15_cm_sFH_18_howitzer_1, Borden_2): the front part is pierced for the chamber, the rear wall
// carries the loading opening, round on the bore and running out through the ring's left side (a C seen from behind),
// so the block's machined face shows through it while it is shut and the dark chamber once it is open.
// The outline seen from behind (x right, y up, the bore at the origin): `top` its corners [x, y, fillet] from the
// left side's top end to the right side's top end, `bot` from the right side's bottom end back to the left side's;
// both sides upright and straight where the slot (half height `sy`, from `sx0` out through the right side) and the
// opening (radius `ro`) cut them. Along the bore: `z0` the ring's front, `zf` and `zs` the slot's front and rear,
// `z1` the breech face; `b` rounds the front and rear edges; `ch` the chamber's radius, `deep` how far it runs forward.
export function castRing(P, { top, bot, sx0, sy, ro, ch, z0, zf, zs, z1, b = 0.02, deep = 0.5, mat = 'camo', opt }) {
  // (an edge rounded deeper than a convex corner's fillet turns the inset outline inside out: keep it inside them)
  const x0 = top[0][0], x1 = top[top.length - 1][0], bv = Math.min(b, 0.6 * Math.min(...[...top, ...bot].map((p) => p[2]))), fo = Math.max(0.012, bv * 1.8);
  const disc = (r, n = 28) => Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * TAU), r * Math.sin(i / n * TAU), 0]);
  const half = Array.from({ length: 17 }, (_, i) => { const a = -Math.PI / 2 + Math.PI * i / 16; return [ro * Math.cos(a), ro * Math.sin(a), 0]; });
  P.add(mat, castPlate([...top, ...bot], [disc(ch)], z0, zf, bv), opt); // the front part round the chamber mouth
  // the top, left and bottom walls round the slot, run into the plates' rounded edges so no seam opens between them
  P.add(mat, castPlate([...top, [x1, sy, 0.008], [sx0, sy, 0.006], [sx0, -sy, 0.006], [x1, -sy, 0.008], ...bot], [], zf - bv, zs + bv, 0), opt);
  // the rear wall: clockwise round the outline from the opening's top edge at the left side, in along its bottom
  // edge, round its end on the bore and out again
  P.add(mat, castPlate([[x0, ro, fo], ...top, ...bot, [x0, -ro, fo], ...half], [], zs, z1, bv), opt);
  // the dark chamber, seen from inside: just within the front part's hole, on the same corners, so none of the hole's
  // lit wall shows between them
  P.add('char', zTube(z0 - deep, zf, ch - 0.002, ch - 0.002, 28, 0, 0, true).scale(-1, 1, 1));
  P.add('char', new THREE.CircleGeometry(ch, 28).translate(0, 0, z0 - deep));
}

// The sliding block in its slot (castRing's), on the breech pivot at (px, 0, pz): its machined rear face, bright
// through the loading opening while it is shut, with the firing lock on the bore. Returns the face's z in the pivot.
export function slotBlock(K, { sx0, x1, sy, zf, zs, px, pz, lock }) {
  const w = x1 - sx0 - 0.004, d = zs - zf - 0.006, cx = (sx0 + x1) / 2 - px, cz = (zf + zs) / 2 - pz - 0.001, kf = cz + d / 2;
  K.add('camo', box(w, sy * 2 - 0.004, d, cx, 0, cz));
  K.add('steel', box(w - 0.012, sy * 2 - 0.016, 0.003, cx, 0, kf + 0.0015));
  K.add('dark', zTube(kf - 0.004, kf + 0.016, lock, lock * 0.88, 14, -px, 0)); // the firing lock's housing
  K.add('steel', zTube(kf + 0.016, kf + 0.02, lock * 0.45, lock * 0.4, 10, -px, 0));
  K.add('char', new THREE.CircleGeometry(lock * 0.16, 8).translate(-px, 0, kf + 0.0205)); // the firing pin's hole
  return kf;
}

// A flat outline [x, y, fillet] (its corners rounded by quadratic fillets) with polygon holes, extruded along z from
// za to zb, the front and rear edges rounded by `bev` without growing past the outline.
function castPlate(pts, holes, za, zb, bev) {
  const s = filletShape(pts);
  for (const h of holes) s.holes.push(filletShape(h, new THREE.Path()));
  const t = zb - za, bb = Math.min(bev, t * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * bb, bevelEnabled: bb > 0, bevelThickness: bb, bevelSize: bb, bevelOffset: -bb, bevelSegments: 2, curveSegments: 5 });
  return g.translate(0, 0, za + bb);
}
function filletShape(pts, s = new THREE.Shape()) {
  const n = pts.length, T = pts.map(([x, y, r], i) => {
    const [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
    let ux = ax - x, uy = ay - y, vx = bx - x, vy = by - y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const h = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
    const d = r > 0 && h > 1e-3 ? Math.min(r / Math.tan(h), lu * 0.45, lv * 0.45) : 0;
    return [x + ux * d, y + uy * d, x, y, x + vx * d, y + vy * d, d];
  });
  s.moveTo(T[0][4], T[0][5]);
  for (let i = 1; i <= n; i++) {
    const t = T[i % n];
    s.lineTo(t[0], t[1]);
    if (t[6] > 0) s.quadraticCurveTo(t[2], t[3], t[4], t[5]);
  }
  return s;
}

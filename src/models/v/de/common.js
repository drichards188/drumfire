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

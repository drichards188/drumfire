import * as THREE from 'three';
import { V, box, sphere, rod, xTube, yTube, zTube, xf, loft } from '../../kit.js';
import { FParts } from '../mats.js';
import { damageable, finishTarget } from '../damage.js';
import { horse, rng } from '../props.js';
import { addWheel, ring } from '../fieldkit.js';
import { layoutRear } from './layout_rear.js';

// The British rear areas as the WW1 German mode's targets (DESIGN.md "WW1 German mode"): a laager
// of Mark IV tanks and the road traffic of the Army Service Corps. Same contract as the WW2 Allied targets
// (models/t/ww2/allied.js): { root, parts, setDamage(i, k), anchors: { burn, top, center } }; parts stand at
// layout_rear.js's positions, the site faces local -Z (the Germans, to the east).
//   btanks   four Mark IVs (male, female, male, female): the rhomboid hull with the tracks all round, the
//            sponsons (6-pounders or Lewis guns), the unditching beam on its rails, no tail; bell tents, petrol
//            tins and ammunition among them; damage burns them out, throws the beam and a track run off
//   bconvoy  an AEC Y-type with a canvas tilt, a GS wagon behind four horses with its riders, a Thornycroft J
//            with an open load, a GS wagon and pair (moved along the road by the sim: parts face -Z and the
//            render layer turns each to its direction of travel); a road sign, a heap of road metal
// buildBritishTraffic(kind) gives each vehicle on its own ('aec' | 'thornycroft' | 'gs4' | 'gs2').
// Paint: the British service khaki of 1917 ('wkhaki' scheme); the tanks a dark brown over it (a tint).

const KHAKI = 'wkhaki';
const BROWN = 0xb89c8a; // tints the khaki camo texture to the Mark IV's brown
const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => g.applyMatrix4(xf(x, y, z, rx, ry, rz));
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _d = new THREE.Vector3();
// a box of section w x h from a to b (a strap, a rail, a strut)
function bar(a, b, w, h) {
  _d.subVectors(b, a);
  const L = _d.length();
  _q.setFromUnitVectors(V(0, 0, 1), _d.normalize());
  return new THREE.BoxGeometry(w, h, L).applyMatrix4(_m.compose(a.clone().add(b).multiplyScalar(0.5), _q, V(1, 1, 1)));
}

// drop zero-area triangles (an extrusion's triangulation makes a few): their zero normals turn to NaN in the
// shader, and the post chain spreads one NaN pixel over the whole frame
function clean(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position.array, keep = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    e1.set(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]);
    e2.set(p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]);
    if (e1.cross(e2).lengthSq() > 1e-12) for (let k = 0; k < 9; k++) keep.push(p[i + k]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  out.computeVertexNormals();
  return out;
}

// ------------------------------------------------------------------------------------------ Mark IV
// The side outline of the track frame, (z, y) corners with their rounding radius: the tall pointed front horn
// (its tip 1.3 m up), the lower run rising from the ground contact at about 25 degrees, the level top run, the
// blunter rear horn. This is the track's pitch line; the frame plate sits just inside it.
const LOOP = [[-4.02, 1.38, 0.4], [-2.75, 2.5, 0.85], [3.2, 2.36, 0.6], [4.0, 1.05, 0.45], [2.25, 0.05, 0.8], [-0.75, 0.05, 1.0]];
const TRACK_X0 = 0.83, TRACK_X1 = 1.35; // each track frame and its track, either side of the hull
function roundLoop(verts, n = 7) {
  const out = [], N = verts.length;
  for (let i = 0; i < N; i++) {
    const [pz, py, r] = verts[i], [az, ay] = verts[(i + N - 1) % N], [bz, by] = verts[(i + 1) % N];
    const la = Math.hypot(az - pz, ay - py), lb = Math.hypot(bz - pz, by - py);
    const u1 = [(az - pz) / la, (ay - py) / la], u2 = [(bz - pz) / lb, (by - py) / lb];
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))) / 2;
    const d = Math.min(r / Math.tan(th), la * 0.48, lb * 0.48);
    const t1 = [pz + u1[0] * d, py + u1[1] * d], t2 = [pz + u2[0] * d, py + u2[1] * d];
    for (let k = 0; k <= n; k++) { // a quadratic Bezier through the corner: near enough a circular fillet
      const t = k / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push([a * t1[0] + b * pz + c * t2[0], a * t1[1] + b * py + c * t2[1]]);
    }
  }
  return out;
}
const PATH = roundLoop(LOOP);
const PC = PATH.reduce((s, p) => [s[0] + p[0] / PATH.length, s[1] + p[1] / PATH.length], [0, 0]);
// points every `pitch` metres round the loop with their tangent and outward normal
function walk(pts, pitch) {
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > 1e-4) { segs.push({ a, b, l, s: L }); L += l; }
  }
  const n = Math.round(L / pitch), out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * L;
    while (j < segs.length - 1 && segs[j].s + segs[j].l < s) j++;
    const g = segs[j], f = (s - g.s) / g.l, tz = (g.b[0] - g.a[0]) / g.l, ty = (g.b[1] - g.a[1]) / g.l;
    const z = g.a[0] + (g.b[0] - g.a[0]) * f, y = g.a[1] + (g.b[1] - g.a[1]) * f;
    let nz = -ty, ny = tz;
    if (nz * (z - PC[0]) + ny * (y - PC[1]) < 0) { nz = -nz; ny = -ny; }
    out.push({ z, y, tz, ty, nz, ny });
  }
  return out;
}
const PLATES = walk(PATH, 0.2);
// the frame outline: the pitch line moved in by d along its normal
const inset = (d) => walk(PATH, 0.12).map((p) => [p.z - p.nz * d, p.y - p.ny * d]);
const FRAME = inset(0.045);
// the frame's top and bottom at z (for paint and straps that must stay on the plate)
function span(z) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < FRAME.length; i++) {
    const a = FRAME[i], b = FRAME[(i + 1) % FRAME.length];
    if ((a[0] - z) * (b[0] - z) > 0 || a[0] === b[0]) continue;
    const y = a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return [lo, hi];
}
let frameGeo = null;
function frameGeometry() { // a side frame, x 0..-w (moved into place by the caller)
  if (!frameGeo) {
    const sh = new THREE.Shape(FRAME.map(([z, y]) => new THREE.Vector2(z, y)));
    frameGeo = clean(new THREE.ExtrudeGeometry(sh, { depth: TRACK_X1 - TRACK_X0, bevelEnabled: false, curveSegments: 1 }).applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  }
  return frameGeo.clone();
}
// track plates round one frame (into P), each with its grouser
function track(P, x) {
  const W = TRACK_X1 - TRACK_X0 - 0.02;
  for (const p of PLATES) {
    const rx = Math.atan2(-p.ty, p.tz);
    P.add('rust', box(W, 0.045, 0.18, x, p.y, p.z, rx), { tint: 0xa09080 });
    P.add('dark', box(W * 0.96, 0.04, 0.05, x, p.y + p.ny * 0.04, p.z + p.nz * 0.04, rx));
  }
}

/**
 * A Mark IV, front -Z, 8.05 m long: male (two 6-pounders in the big sponsons, 4.12 m wide) or female (Lewis guns
 * in the small ones, 3.2 m wide). Returns { group, beam, hatch, guns: [Group], trackRun, sponsons } so the damage
 * states can throw the beam, blow the hatch, droop the guns and lay a broken track run on the ground.
 */
export function markIV({ male = true, seed = 1, beamOn = true } = {}) {
  const r = rng(seed), group = new THREE.Group(), P = new FParts(KHAKI);
  const paint = { tint: BROWN };
  // the two track frames with the tracks round them
  for (const s of [-1, 1]) {
    P.add('camo', frameGeometry().applyMatrix4(xf(s > 0 ? TRACK_X1 : -TRACK_X0, 0, 0)), paint);
    track(P, s * (TRACK_X0 + TRACK_X1) / 2);
    const xo = s * (TRACK_X1 + 0.006);
    // cover straps and joints on the side plate, the round hatch behind the sponson, the track adjuster at the horn
    for (const z of [-2.75, -1.75, 1.05, 2.35, 3.3]) {
      const [lo, hi] = span(z);
      P.add('camo', box(0.012, hi - lo - 0.12, 0.09, xo, (lo + hi) / 2, z), paint);
    }
    P.add('camo', box(0.012, 0.07, 5.6, xo, span(0.6)[1] - 0.12, 0.2), paint);
    P.add('camo', xTube(s * TRACK_X1, s * (TRACK_X1 + 0.035), 0.3, 0.3, 16, 1.25, 1.85), paint);
    P.add('dark', xTube(s * TRACK_X1, s * (TRACK_X1 + 0.06), 0.06, 0.06, 8, 1.25, 1.85));
    P.add('camo', box(0.03, 0.16, 0.36, xo, span(-3.45)[1] - 0.25, -3.45, 0.6), paint);
    // the white-red-white recognition stripes on the front horns (from Cambrai on)
    [[-3.25, 0xe4e0d4], [-3.07, 0x9a2a20], [-2.89, 0xe4e0d4]].forEach(([z, tint]) => {
      const [lo, hi] = span(z);
      P.add('white', box(0.012, hi - lo - 0.16, 0.18, s * (TRACK_X1 + 0.014), (lo + hi) / 2, z), { tint });
    });
  }
  // the hull between the frames: the cab across the front, the roof, the rear plate, the belly
  const hw = TRACK_X0;
  const hull = [[-3.0, 2.46], [-1.95, 2.46], [-1.95, 2.24], [3.5, 2.24], [3.72, 1.05], [2.4, 0.42], [-1.3, 0.42], [-3.0, 1.15]];
  const sh = new THREE.Shape(hull.map(([z, y]) => new THREE.Vector2(z, y)));
  P.add('camo', clean(new THREE.ExtrudeGeometry(sh, { depth: hw * 2, bevelEnabled: false }).applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)).applyMatrix4(xf(hw, 0, 0))), paint);
  // cab front: the driver's and commander's vision flaps, the Lewis gun's ball mount between them
  for (const x of [-0.42, 0.42]) {
    P.add('camo', box(0.36, 0.22, 0.05, x, 2.1, -3.03), paint);
    P.add('dark', box(0.2, 0.025, 0.02, x, 2.08, -3.06));
  }
  P.add('camo', sphere(0.12, 0, 1.78, -3.02, 1, 1, 0.6, 10), paint);
  P.add('dark', zTube(-3.5, -3.08, 0.035, 0.035, 8, 0, 1.78));
  P.add('dark', box(0.4, 0.08, 0.05, 0, 1.3, -2.85, -0.6)); // towing eye under the cab
  // the roof: the exhaust out of the roof to the silencer lying along it, ventilator, the rear door and shackles
  P.add('dark', yTube(2.2, 2.52, 0.07, 0.07, 8, -0.35, 0.15));
  P.add('dark', zTube(0.15, 1.95, 0.15, 0.15, 12, -0.35, 2.58));
  P.add('dark', zTube(1.95, 2.25, 0.15, 0.05, 12, -0.35, 2.58));
  P.add('camo', box(0.5, 0.12, 0.5, 0.3, 2.3, 0.9), paint);
  P.add('camo', box(0.9, 0.85, 0.05, 0, 1.55, 3.68, 0.17), paint);
  for (const x of [-0.6, 0.6]) P.add('dark', box(0.08, 0.16, 0.14, x, 1.0, 3.72));
  // the unditching beam's rails: from the frame tops at the front horns, up and back over the roof to the rear
  const RX = 0.98, RY = 2.98;
  for (const s of [-1, 1]) {
    const x = s * RX, f = V(x, span(-3.05)[1] + 0.03, -3.05), b = V(x, span(3.35)[1] + 0.02, 3.35);
    P.add('dark', bar(f, V(x, RY, -1.55), 0.07, 0.09));
    P.add('dark', bar(V(x, RY, -1.55), V(x, RY, 3.2), 0.07, 0.09));
    P.add('dark', bar(V(x, RY, 3.2), b, 0.07, 0.09));
    P.add('dark', bar(V(x, RY, 0.6), V(x, 2.44, 0.6), 0.05, 0.05)); // a stay to the frame top
  }
  P.build(group, { dirt: 0.75 });

  // the beam: oak, iron-shod, lashed across the rails at the back (its own group, thrown off when hit)
  const beam = new THREE.Group();
  beam.position.set(0, RY + 0.2, 2.9);
  const B = new FParts(KHAKI);
  B.add('wood', box(3.3, 0.3, 0.3, 0, 0, 0), { tint: 0x9a8264 });
  for (const x of [-1.5, -0.5, 0.5, 1.5]) B.add('dark', box(0.08, 0.32, 0.32, x, 0, 0));
  B.build(beam, { dirt: 0.2, y0: RY });
  beam.visible = beamOn;
  group.add(beam);
  // the roof hatch behind the cab
  const hatch = new THREE.Group();
  hatch.position.set(0.3, 2.25, -1.6);
  const H = new FParts(KHAKI);
  H.add('camo', box(0.55, 0.05, 0.55, 0, 0.03, 0.27), paint);
  H.build(hatch, { dirt: 0 });
  group.add(hatch);

  // the sponsons: male a deep box with the 6-pounder in its angled front face and a Lewis port behind, female a
  // shallow one with two Lewis guns in their mantlets and a door beneath
  const guns = [], sponsons = [];
  for (const s of [-1, 1]) {
    const S = new FParts(KHAKI), sp = new THREE.Group();
    const D = male ? 0.71 : 0.26, z0 = male ? -1.6 : -1.35, z1 = male ? 0.85 : 0.75, zf = male ? -1.05 : -1.15, zr = male ? 0.45 : 0.55;
    const yb = male ? 0.65 : 1.0, ym = male ? 1.28 : 1.35, yt = 2.12;
    const ringAt = (d, y) => [V(s * TRACK_X1, y, z0 + (zf - z0) * (1 - d)), V(s * (TRACK_X1 + D * d), y, zf), V(s * (TRACK_X1 + D * d), y, zr), V(s * TRACK_X1, y, z1 + (zr - z1) * (1 - d))];
    S.add('camo', loft([ringAt(0.12, yb), ringAt(1, ym)]), paint);
    S.add('camo', loft([ringAt(1, ym), ringAt(1, yt)]), paint);
    S.add('camo', box(0.03, 0.05, zr - zf + 0.1, s * (TRACK_X1 + D + 0.01), ym, (zf + zr) / 2), paint);
    if (male) {
      // the Lewis port in the rear face
      const rmx = s * (TRACK_X1 + D * 0.5), rmz = (zr + z1) / 2;
      S.add('camo', yTube(1.55, 1.85, 0.11, 0.11, 10, rmx, rmz), paint);
      S.add('dark', zTube(rmz, rmz + 0.4, 0.03, 0.03, 6, rmx, 1.72));
    } else {
      S.add('camo', box(0.025, 0.85, 0.75, s * (TRACK_X1 + 0.015), 0.7, -0.35), paint); // the door under the sponson
      for (const z of [-0.85, 0.15]) {
        S.add('camo', xTube(s * (TRACK_X1 + D), s * (TRACK_X1 + D + 0.08), 0.15, 0.15, 12, 1.75, z), paint);
        S.add('dark', xTube(s * (TRACK_X1 + D + 0.08), s * (TRACK_X1 + D + 0.55), 0.045, 0.045, 8, 1.75, z));
        S.add('dark', xTube(s * (TRACK_X1 + D + 0.55), s * (TRACK_X1 + D + 0.68), 0.018, 0.018, 6, 1.75, z));
      }
    }
    S.build(sp, { dirt: 0.6 });
    group.add(sp);
    sponsons.push(sp);
    if (male) { // the 6-pounder in its round shield, turned out from the sponson's angled face
      const g = new THREE.Group(), G = new FParts(KHAKI);
      const cx = s * (TRACK_X1 + D * 0.5), cz = (z0 + zf) / 2;
      g.position.set(cx, 1.72, cz);
      g.rotation.y = -s * 0.45 + (r() - 0.5) * 0.2;
      G.add('camo', yTube(-0.3, 0.3, 0.26, 0.26, 14), paint);
      G.add('dark', zTube(-0.15, -1.15, 0.055, 0.045, 10));
      G.add('dark', zTube(-1.15, -1.2, 0.06, 0.06, 10));
      G.add('dark', zTube(-0.6, -0.15, 0.1, 0.08, 10));
      G.build(g, { dirt: 0.2, y0: 1.72 });
      group.add(g);
      guns.push(g);
    }
  }

  // a broken track run, shown only when the tank is wrecked (scaled up from nothing), lying out behind
  const trackRun = new THREE.Group(), T = new FParts(KHAKI);
  const side = r() < 0.5 ? -1 : 1;
  for (let k = 0; k < 18; k++) {
    const z = 2.6 + k * 0.2, y = 0.04 + Math.max(0, 0.3 - k * 0.05) + (k > 12 ? (k - 12) * 0.03 : 0);
    T.add('rust', box(0.5, 0.045, 0.18, side * 1.09 + k * 0.05 * side, y, z + 1.2, 0, side * 0.12 * k / 18), { tint: 0xa09080 });
  }
  T.build(trackRun, { dirt: 0.6 });
  trackRun.scale.setScalar(0.001);
  group.add(trackRun);
  return { group, beam, hatch, guns, sponsons, trackRun };
}

// a bell tent: the canvas cone on its pole, the wall skirt, guy lines out to pegs
function bellTent(P, x, z, { R = 2.1, h = 3.0, tint = 0xd6cfb0, rnd = Math.random } = {}) {
  P.add('fabric', new THREE.ConeGeometry(R, h - 0.55, 14, 1, true).translate(x, 0.55 + (h - 0.55) / 2, z), { tint });
  P.add('fabric', new THREE.CylinderGeometry(R, R * 1.03, 0.55, 14, 1, true).translate(x, 0.27, z), { tint: 0xd8d0b8 });
  P.add('dark', box(0.5, 1.2, 0.03, x + R * 0.4, 0.6, z - R * 0.92, 0, 0.4), { tint: 0x5a5444 });
  P.add('wood', yTube(h - 0.1, h + 0.15, 0.03, 0.02, 5, x, z));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rnd() * 0.2;
    P.add('dark', rod(V(x + Math.cos(a) * R * 0.9, 0.9, z + Math.sin(a) * R * 0.9), V(x + Math.cos(a) * (R + 1.3), 0.02, z + Math.sin(a) * (R + 1.3)), 0.006, 3), { tint: 0x8a826a });
  }
}
// stacks of small boxes (2-gallon petrol tins, ammunition boxes)
function boxes(P, x, z, cols, rows, layers, ry, { w = 0.25, h = 0.33, d = 0.18, tint = 0x6a6a5a, key = 'camo', rnd, y = 0 } = {}) {
  for (let l = 0; l < layers; l++) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (l && rnd && rnd() < 0.2) continue;
    const ox = (i - (cols - 1) / 2) * (w + 0.02), oz = (j - (rows - 1) / 2) * (d + 0.02), c = Math.cos(ry), s = Math.sin(ry);
    P.add(key, box(w, h, d, x + ox * c + oz * s, y + h / 2 + l * h, z - ox * s + oz * c, 0, ry + (rnd ? (rnd() - 0.5) * 0.08 : 0)), { tint });
  }
}

function buildTanks() {
  const root = new THREE.Group(), r = rng(53);
  const lay = layoutRear('btanks');
  const parts = lay.map((l, i) => {
    const t = markIV({ male: i % 2 === 0, seed: 70 + i });
    const part = t.group;
    part.position.set(l.x, 0, l.z);
    part.rotation.y = (i === 3 ? 0.35 : -0.15 + i * 0.1) + (r() - 0.5) * 0.12;
    root.add(part);
    const bits = [
      { obj: t.hatch, k0: 0.15, k1: 0.4, rot: [-1.9, 0, 0] },
      { obj: t.beam, k0: 0.3, k1: 0.65, pos: [(r() - 0.5) * 3, -t.beam.position.y + 0.15, 2.4 + r()], rot: [0.1, 0.4 + r() * 0.6, 0.1] },
      { obj: t.trackRun, k0: 0.5, k1: 0.75, scale: 1000 },
      ...t.guns.map((g) => ({ obj: g, k0: 0.4, k1: 0.85, rot: [0.25, (r() - 0.5) * 0.4, 0] })),
      ...t.sponsons.map((s, k) => ({ obj: s, k0: 0.6, k1: 1, pos: [(k ? 0.12 : -0.12), -0.1, 0], rot: [0, 0, (k ? -0.06 : 0.06)] })),
    ];
    // the third tank sits under a scrim net on poles: the net goes first
    if (i === 3) {
      const N = new FParts(KHAKI), ng = new THREE.Group();
      const g = new THREE.PlaneGeometry(9, 12, 10, 10).rotateX(-Math.PI / 2), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const u = Math.abs(p.getX(k)) / 4.5, v = Math.abs(p.getZ(k)) / 6, out = Math.max(u, v);
        p.setY(k, out > 0.75 ? 3.3 * (1 - (out - 0.75) / 0.25) + 0.05 : 3.4 - 0.25 * (1 - u * u) * (1 - v * v) + (r() - 0.5) * 0.1);
      }
      g.computeVertexNormals();
      N.add('net', g);
      for (const [px, pz] of [[-3.3, -4.4], [3.3, -4.4], [-3.3, 4.4], [3.3, 4.4]]) N.add('wood', rod(V(px, 0, pz), V(px, 3.35, pz), 0.05, 5));
      N.build(ng, { dirt: 0 });
      part.add(ng);
      bits.unshift({ obj: ng, k0: 0.0, k1: 0.5, pos: [0.5, -3.0, 0.4], rot: [0.12, 0.3, 0.15], scale: 0.7 });
    }
    return damageable(part, { scorch: 7, char: 0.97, sink: 0.12, tilt: [0.03, 0, (r() - 0.5) * 0.12], bits });
  });
  // the laager: bell tents of the crews, 2-gallon petrol tins, 6-pounder boxes, oil drums, ruts worn in
  const D = new FParts(KHAKI);
  bellTent(D, -12, 16, { rnd: r, tint: 0xf0e8d8 });
  bellTent(D, -6, 21, { rnd: r, tint: 0xf0e8d8 });
  bellTent(D, 14, 18, { rnd: r, tint: 0xd8d0b8 });
  boxes(D, 22, 2, 6, 3, 3, 0.3, { rnd: r });
  boxes(D, -24, 6, 4, 2, 2, -0.2, { tint: 0x6e6248, w: 0.5, h: 0.28, d: 0.32, key: 'wood', rnd: r });
  for (let k = 0; k < 5; k++) D.add('matte', yTube(0, 0.88, 0.29, 0.29, 12, 20 + (k % 3) * 0.62, 7 + (k > 2 ? 0.62 : 0)), { tint: 0x4a4a40 });
  D.add('cloth', box(3.4, 0.05, 2.6, -1, 0.3, 4, 0.08, 0.2, 0.04), { tint: 0x6e6a4c });
  for (const s of [-1, 1]) for (const [x0, z0, x1, z1] of [[-16, -4, -17, 14], [-3, -9, -5, 12], [11, -5, 13, 14]]) {
    D.add('earth', bar(V(x0 + s * 1.09, 0.02, z0 + 4), V(x1 + s * 1.09, 0.02, z1), 0.5, 0.02), { tint: 0xb4a484 });
  }
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

// ------------------------------------------------------------------------------------------ convoy
// a cast steel spoked wheel with a solid rubber tyre (twin on the rear axle), axis X, centre (x, y, z)
function steelWheel(P, x, y, z, R, W, side, { twin = false, spokes = 10 } = {}) {
  const tyre = (cx) => {
    P.add('tyre', ring(R - 0.09, R, cx - W / 2, cx + W / 2, 28).applyMatrix4(xf(0, y, z)));
    P.add('dark', ring(R - 0.12, R - 0.09, cx - W * 0.45, cx + W * 0.45, 24).applyMatrix4(xf(0, y, z)));
  };
  tyre(x);
  if (twin) tyre(x - side * (W + 0.02));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    P.add('camo', rod(V(x, y + Math.cos(a) * 0.1, z + Math.sin(a) * 0.1), V(x, y + Math.cos(a) * (R - 0.11), z + Math.sin(a) * (R - 0.11)), 0.028, 5));
  }
  P.add('dark', xTube(x - side * 0.08, x + side * 0.1, 0.12, 0.09, 12, y, z));
}
// a seated or riding soldier: greatcoat, Brodie helmet (or a cap), arms forward to the reins or the wheel
function man(P, x, y, z, { helmet = true, ry = 0 } = {}) {
  const at = (g) => place(g, x, y, z, ry);
  P.add('cloth', at(box(0.4, 0.55, 0.26, 0, 0.3, 0)), { tint: 0x7a6e4c });
  P.add('cloth', at(box(0.36, 0.16, 0.5, 0, 0.0, -0.18)), { tint: 0x6a6044 });
  for (const s of [-1, 1]) P.add('cloth', at(rod(V(s * 0.2, 0.5, 0), V(s * 0.16, 0.3, -0.32), 0.05, 5)), { tint: 0x7a6e4c });
  P.add('matte', at(sphere(0.11, 0, 0.7, 0, 1, 1.1, 1, 8)), { tint: 0xb88a6a });
  if (helmet) P.add('camo', at(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 12).translate(0, 0.76, 0)), { tint: 0x9a9070 });
  else P.add('cloth', at(yTube(0.74, 0.84, 0.12, 0.13, 10)), { tint: 0x6a6044 });
  if (helmet) P.add('camo', at(sphere(0.13, 0, 0.77, 0, 1, 0.6, 1, 10)), { tint: 0x9a9070 });
}

/**
 * An Army Service Corps 3-ton lorry, front -Z: 'aec' (AEC Y-type: the tall radiator with its rounded header,
 * a canvas tilt on hoops over the body) or 'thornycroft' (the J type: the square radiator with the cast header
 * tank, bare hoops over an open load of boxes and sacks). Open cab with a board roof on four posts, solid tyres
 * on cast steel wheels, twin at the back. tiltP: the tilt's own collector (centred on info.tiltAt).
 */
function asclorry(P, { type = 'aec', tiltP = null, info = {}, rnd = Math.random } = {}) {
  const thorny = type === 'thornycroft', fz = -2.45, rz = 1.55, Rf = 0.45, Rr = 0.5;
  for (const s of [-1, 1]) {
    P.add('dark', box(0.08, 0.22, 6.2, s * 0.45, 0.78, 0.05));
    steelWheel(P, s * 0.82, Rf, fz, Rf, 0.12, s);
    steelWheel(P, s * 0.88, Rr, rz, Rr, 0.13, s, { twin: true });
  }
  P.add('dark', xTube(-0.8, 0.8, 0.05, 0.05, 8, Rf, fz));
  P.add('dark', box(0.9, 0.3, 0.3, 0, Rr, rz)); // the rear axle's differential
  // radiator, bonnet, the scuttle; the oil side lamps and the acetylene headlamps
  const rf = -3.12;
  P.add('dark', box(0.82, 0.86, 0.1, 0, 1.22, rf + 0.05));
  P.add('camo', box(0.9, 0.08, 0.14, 0, 1.68, rf + 0.06));
  if (thorny) P.add('camo', box(0.92, 0.2, 0.2, 0, 1.78, rf + 0.08)); // the cast header tank
  else P.add('camo', xTube(-0.42, 0.42, 0.14, 0.14, 12, 1.72, rf + 0.08)); // the AEC's rounded header
  P.add('camo', box(0.86, 0.62, 1.32, 0, 1.3, rf + 0.78));
  P.add('camo', box(0.9, 0.05, 1.32, 0, 1.63, rf + 0.78, 0, 0, 0));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) P.add('dark', box(0.01, 0.3, 0.025, s * 0.435, 1.3, rf + 0.45 + k * 0.13)); // louvres in the bonnet side
    P.add('brass', zTube(rf - 0.12, rf + 0.08, 0.1, 0.11, 10, s * 0.5, 1.1));
    P.add('dark', box(0.12, 0.16, 0.12, s * 0.82, 1.62, -1.72));
    // the front wings, a running board to the body
    P.add('camo', box(0.36, 0.04, 1.0, s * 0.82, Rf * 2 + 0.12, fz - 0.05));
    P.add('camo', box(0.36, 0.04, 0.28, s * 0.82, Rf * 2 + 0.03, fz - 0.65, -0.6));
    P.add('wood', box(0.3, 0.04, 0.9, s * 0.86, 0.72, -1.4), { tint: 0x7a6e58 });
  }
  P.add('camo', box(1.7, 0.45, 0.1, 0, 1.6, -1.78));
  // the cab: seat bench, back panel, board roof on posts, steering wheel on the right
  P.add('camo', box(1.6, 0.25, 0.55, 0, 1.38, -1.18));
  P.add('wood', box(1.6, 0.4, 0.12, 0, 1.68, -0.98), { tint: 0x5a4a38 });
  P.add('camo', box(1.8, 0.7, 0.05, 0, 1.6, -0.88));
  for (const sx of [-1, 1]) for (const z of [-1.78, -0.9]) P.add('dark', yTube(1.25, 2.45, 0.025, 0.025, 6, sx * 0.86, z));
  P.add('camo', box(1.9, 0.05, 1.3, 0, 2.46, -1.38));
  P.add('dark', new THREE.TorusGeometry(0.2, 0.018, 5, 14).rotateX(-1.0).translate(0.45, 1.98, -1.55));
  P.add('dark', rod(V(0.45, 1.98, -1.55), V(0.45, 1.25, -2.0), 0.025, 5));
  // the body: floor, drop sides with their stakes, the tailboard; serial in white on the bonnet side
  const b0 = -0.82, b1 = 3.2, bw = 2.1, fl = 1.25, mid = (b0 + b1) / 2, len = b1 - b0;
  P.add('wood', box(bw, 0.1, len, 0, fl, mid), { tint: 0x8a8466 });
  for (const s of [-1, 1]) {
    P.add('wood', box(0.05, 0.5, len, s * bw / 2, fl + 0.3, mid), { tint: 0x8a8466 });
    for (let k = 0; k < 5; k++) P.add('dark', box(0.06, 0.55, 0.06, s * (bw / 2 + 0.03), fl + 0.28, b0 + 0.2 + k * (len - 0.4) / 4));
    P.add('camo', box(0.38, 0.05, 1.2, s * 0.9, Rr * 2 + 0.1, rz));
    P.add('white', box(0.01, 0.12, 0.42, s * 0.44, 1.38, rf + 0.85), { tint: 0xe0dccc });
  }
  P.add('wood', box(bw, 0.5, 0.05, 0, fl + 0.3, b0), { tint: 0x8a8466 });
  P.add('wood', box(bw, 0.5, 0.05, 0, fl + 0.3, b1), { tint: 0x8a8466 });
  P.add('red', box(0.1, 0.1, 0.05, -0.85, 0.95, b1 + 0.04));
  const hoops = (Q, ox, oy, oz) => {
    for (let k = 0; k < 4; k++) {
      const z = b0 + 0.25 + k * (len - 0.5) / 3 - oz;
      for (const s of [-1, 1]) Q.add('dark', rod(V(s * bw / 2 - ox, fl + 0.5 - oy, z), V(s * bw / 2 - ox, fl + 1.35 - oy, z), 0.02, 4));
      Q.add('dark', rod(V(-bw / 2 - ox, fl + 1.35 - oy, z), V(bw / 2 - ox, fl + 1.35 - oy, z), 0.02, 4));
    }
  };
  if (!thorny) {
    // the canvas tilt: walls and a flat top over the hoops, the rear flaps rolled up
    const h = 1.5;
    const g = new THREE.Shape([[-bw / 2, 0], [bw / 2, 0], [bw / 2, h * 0.88], [bw / 2 - 0.2, h], [-bw / 2 + 0.2, h], [-bw / 2, h * 0.88]].map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = clean(new THREE.ExtrudeGeometry(g, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2));
    const Q = tiltP ?? P;
    if (tiltP) { info.tiltAt = [0, fl + 0.3 + h / 2, mid]; Q.add('fabric', geo.translate(0, -h / 2, 0), { tint: 0xf0ead8 }); } else Q.add('fabric', geo.translate(0, fl + 0.3, mid), { tint: 0xf0ead8 });
    const rq = tiltP ? [0, info.tiltAt[1], 0] : [0, 0, 0];
    Q.add('cloth', xTube(-bw / 2, bw / 2, 0.1, 0.1, 8, fl + 1.65 - rq[1], b1 - (tiltP ? mid : 0) + 0.02), { tint: 0xb0a47c });
  } else {
    hoops(P, 0, 0, 0);
    boxes(P, -0.45, mid - 0.9, 3, 4, 2, 0, { w: 0.32, h: 0.25, d: 0.42, tint: 0x6e6248, key: 'wood', rnd, y: fl + 0.05 });
    for (let k = 0; k < 6; k++) P.add('cloth', sphere(1, 0.5 + (k % 2) * 0.1, fl + 0.3 + (k > 3 ? 0.35 : 0), mid + 0.6 + (k % 4) * 0.5 - 0.7, 0.3, 0.2, 0.4, 8), { tint: 0xb0a07a });
  }
  man(P, 0.45, fl + 0.18, -1.2, { helmet: true });
}

/** A General Service wagon Mk X: box body on wooden wheels, the pole forward to the team. In P, front -Z at z0. */
function gsWagon(P, z0, { load = 'tarp', rnd = Math.random } = {}) {
  const fz = z0 + 0.95, rz = z0 + 3.05, bz = z0 + 2.05;
  for (const s of [-1, 1]) {
    addWheel(P, s * 0.82, 0.58, { R: 0.58, tw: 0.08, spokes: 12, side: s, nave: 0.11, z: fz });
    addWheel(P, s * 0.85, 0.72, { R: 0.72, tw: 0.08, spokes: 14, side: s, nave: 0.12, z: rz });
  }
  P.add('dark', xTube(-0.85, 0.85, 0.045, 0.045, 8, 0.58, fz));
  P.add('dark', xTube(-0.88, 0.88, 0.05, 0.05, 8, 0.72, rz));
  P.add('wood', box(0.14, 0.14, 2.4, 0, 0.82, bz), { tint: 0x6a6a52 });
  P.add('camo', box(1.45, 0.08, 3.1, 0, 1.12, bz));
  for (const s of [-1, 1]) P.add('camo', box(0.05, 0.55, 3.1, s * 0.72, 1.42, bz));
  P.add('camo', box(1.45, 0.55, 0.05, 0, 1.42, bz + 1.55));
  P.add('camo', box(1.45, 0.75, 0.05, 0, 1.52, bz - 1.55));
  P.add('camo', box(1.3, 0.08, 0.4, 0, 1.92, bz - 1.38)); // the driver's seat board
  P.add('camo', box(1.3, 0.05, 0.4, 0, 1.15, bz - 1.85, 0.5)); // footboard
  P.add('dark', rod(V(0.8, 0.9, rz - 0.15), V(0.82, 1.7, rz - 0.6), 0.02, 4)); // the brake lever
  P.add('wood', rod(V(0, 0.9, fz - 0.2), V(0, 1.15, z0 - 2.7), 0.05, 6), { tint: 0x7a6a50 }); // the pole, between the wheelers
  P.add('wood', xTube(-0.55, 0.55, 0.04, 0.04, 6, 1.0, z0 - 0.2), { tint: 0x7a6a50 }); // swingletree
  if (load === 'tarp') {
    P.add('cloth', box(1.3, 0.55, 2.9, 0, 1.55, bz + 0.05), { tint: 0x8e8664 });
    P.add('cloth', xTube(-0.66, 0.66, 0.3, 0.3, 10, 1.75, bz + 0.05).applyMatrix4(new THREE.Matrix4().makeScale(1, 0.5, 1).setPosition(0, 0.9, 0)), { tint: 0x8e8664 });
  } else {
    boxes(P, 0, bz + 0.2, 3, 5, 2, 0, { w: 0.4, h: 0.25, d: 0.5, tint: 0x6e6248, key: 'wood', rnd, y: 1.16 });
    for (let k = 0; k < 3; k++) P.add('cloth', box(0.5, 0.35, 0.8, -0.35 + k * 0.35, 1.85, bz - 0.6 + (k % 2) * 0.2, 0, 0.3), { tint: 0xb8a878 });
  }
}

const COATS = [0x6a4326, 0x3a2a20, 0x7a5a3a, 0x4a3a2a, 0x8a6a46, 0x2a2420];
// a vehicle of the convoy: { group, horses: [Group], tilt }
function trafficVehicle(kind, r) {
  const g = new THREE.Group(), horses = [], P = new FParts(KHAKI);
  let tilt = null;
  if (kind === 'aec' || kind === 'thornycroft') {
    const T = new FParts(KHAKI), info = {};
    asclorry(P, { type: kind, tiltP: kind === 'aec' ? T : null, info, rnd: r });
    if (info.tiltAt) {
      tilt = new THREE.Group();
      tilt.position.set(...info.tiltAt);
      T.build(tilt, { dirt: 0, y0: info.tiltAt[1] });
      g.add(tilt);
    }
    P.build(g, { dirt: 0.55 });
    return { group: g, horses, tilt };
  }
  // GS wagons: four horses (leaders and wheelers, the near-side ones ridden) or a pair driven from the seat
  const four = kind === 'gs4', z0 = four ? 0.0 : -1.4;
  gsWagon(P, z0, { load: four ? 'tarp' : 'boxes', rnd: r });
  if (!four) man(P, -0.25, 1.98, z0 + 0.65, { helmet: true });
  P.build(g, { dirt: 0.5 });
  const team = four ? [[-0.62, -1.4, true], [0.62, -1.4, false], [-0.62, -4.0, true], [0.62, -4.0, false]] : [[-0.62, -2.8, false], [0.62, -2.8, false]];
  team.forEach(([x, z, rider], i) => {
    const hg = new THREE.Group(), H = new FParts(KHAKI);
    hg.position.set(x, 0, z);
    horse(H, 0, 0, 0, COATS[(i + ((r() * 6) | 0)) % COATS.length]);
    // collar, saddle, traces back to the swingletree or the horse ahead's
    H.add('dark', new THREE.TorusGeometry(0.24, 0.05, 5, 10).rotateX(Math.PI / 2 * 0.8).translate(0, 1.58, -0.6), { tint: 0x3a2a1c });
    H.add('dark', box(0.5, 0.05, 0.42, 0, 1.67, -0.05, 0, 0, 0), { tint: 0x4a3424 });
    const tz = (four && i < 2) || !four ? (z0 - 0.2) - z : 2.6;
    H.add('dark', rod(V(0.2, 1.3, -0.5), V(x > 0 ? -0.25 : 0.25, 1.05, tz), 0.012, 3));
    H.add('dark', rod(V(-0.2, 1.3, -0.5), V(x > 0 ? -0.65 : -0.15, 1.05, tz), 0.012, 3));
    if (rider) man(H, 0, 1.55, 0.0, { helmet: true });
    H.build(hg, { dirt: 0.2 });
    g.add(hg);
    horses.push(hg);
  });
  return { group: g, horses, tilt };
}

/** One vehicle of the British road traffic on its own, front -Z, origin on the ground at its middle. */
export function buildBritishTraffic(kind, seed = 1) {
  return trafficVehicle(kind, rng(seed)).group;
}

const CONVOY = ['aec', 'gs4', 'thornycroft', 'gs2'];
function buildConvoy() {
  const root = new THREE.Group(), r = rng(61);
  const parts = layoutRear('bconvoy').map((l, i) => {
    const v = trafficVehicle(CONVOY[i], r), part = v.group;
    part.position.set(l.x, 0, l.z);
    root.add(part);
    const bits = v.horses.map((h, k) => ({ obj: h, k0: 0.1 + k * 0.08, k1: 0.45 + k * 0.1, pos: [(k % 2 ? 0.5 : -0.5), 0.3, 0.3], rot: [0.15, (r() - 0.5) * 0.8, (k % 2 ? -1 : 1) * 1.5] }));
    if (v.tilt) bits.push({ obj: v.tilt, k0: 0.25, k1: 0.7, scale: 0.02, pos: [0, -0.6, 0] });
    const lorry = !v.horses.length;
    return damageable(part, { scorch: 6, char: lorry ? 0.95 : 0.85, sink: 0.05, tilt: [0.03, (r() - 0.5) * 0.3, lorry ? 0.16 : 0.3], bits });
  });
  // the junction: a finger post, a sandbagged traffic control post, a heap of road metal for the menders, a fallen pole
  const S = new FParts(KHAKI);
  S.add('wood', yTube(0, 2.8, 0.07, 0.07, 6, -12, -8));
  for (let k = 0; k < 3; k++) S.add('white', box(1.1, 0.24, 0.04, -12 + 0.4, 2.55 - k * 0.32, -8, 0, k * 1.1 - 0.4, 0), { tint: k === 1 ? 0x2a2a28 : 0xd8d4c4 });
  for (let c = 0; c < 4; c++) for (const [x0, z0, x1, z1] of [[13, -12, 16, -12], [16, -12, 16, -9], [13, -12, 13, -9]]) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    S.add('sandbag', box(len + 0.5, 0.17, 0.5 * 0.92 ** c).applyMatrix4(xf((x0 + x1) / 2, 0.17 * (c + 0.5), (z0 + z1) / 2, 0, Math.atan2(-dz, dx), 0)), { tint: c % 2 ? 0xe0d4b8 : 0xf0e4c8 });
  }
  S.add('rust', box(3.4, 0.05, 3.4, 14.5, 0.75, -10.5, 0.05), { tint: 0x8a7a66 });
  for (let k = 0; k < 9; k++) S.add('earth', sphere(1, -16 + (r() - 0.5) * 3, 0.1, 9 + (r() - 0.5) * 6, 1.0 + r() * 0.8, 0.45 + r() * 0.3, 1.0 + r() * 0.8, 7), { tint: 0x8a8478 });
  S.add('wood', rod(V(18, 0.2, 10), V(26, 0.5, 6), 0.11, 5));
  S.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

export const BUILD = { btanks: buildTanks, bconvoy: buildConvoy };

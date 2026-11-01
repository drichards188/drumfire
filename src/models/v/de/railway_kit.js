import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, rivetRow, sideProfile, shellGeometry, Parts, vehicleMats, earthTextures } from '../../kit.js';
import { wheelSet } from './heavy_common.js';
import { createHeavyScrimTexture } from './heavy_gustav_site.js';

// Shared railway parts of the WW2 railway guns laid for line on a curved firing spur (bruno.js, k12.js): the bogies and
// their wheelsets, the span bolsters of a bogie group, the curve's geometry, the track (ballast, sleepers, rails) and the
// ammunition wagon coupled behind the gun, the camouflage nets on poles.
//
// The curve (the Gustav's rule, gustav.js): the rig's `traverse` pivot stands at the centre of the firing curve, (-R, 0,
// 0) in the rig's root frame, and the gun hangs in a node at (+R, 0, 0) inside it, so setTraverse(az) rolls the whole
// gun along the curve and turns it with the tangent. The track's centreline is the circle of radius R about the pivot:
// it passes through the root's origin (the piece's place in the sim) heading -Z. The car's body is straight: it stands on
// the chord between its two bogie (or bogie group) centres at z = +-zc, so its middle is the sagitta s = R - sqrt(R^2 -
// zc^2) left of the track at z = 0; the builders hang the body in a node at x = -s inside the gun node, and lay
// everything of the body in that frame (the car's middle at x = 0).
//
// Frames here: a bogie, wagon or track is built with the rail head at y = 0 and the track along z; the guns put them at
// the rail head's height (RH above the ground: sleepers and ballast lie between).
export const GA = 0.7175; // half gauge (rail centre), standard gauge
export const RH = 0.5; // the rail head above the ground

export const sagitta = (R, z) => R - Math.sqrt(Math.max(0, R * R - z * z));
// the track's centreline in a straight body's frame (its chord on the curve at z = +-zc): x and heading (rotation.y)
export const trackX = (R, zc, z) => sagitta(R, zc) - sagitta(R, z);
export const trackYaw = (R, z) => -Math.asin(Math.max(-1, Math.min(1, z / R)));

// points along the firing curve in the rig's root (site) frame: the circle of radius R + xo about (-R, 0, 0), from angle
// a0 to a1 (a = the gun's traverse that brings its middle there; a > 0 is ahead and to the left). Each { x, z, a }, `a`
// the heading there.
export function arcPoints(R, a0, a1, step = 1, xo = 0) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * (R + xo)) / step)), out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: -R + (R + xo) * Math.cos(a), z: -(R + xo) * Math.sin(a), a });
  }
  return out;
}
// a straight run of n points from p (heading a) back along -heading (behind it) for len metres
export function straightBack(p, len, step = 1) {
  const n = Math.max(1, Math.ceil(len / step)), out = [];
  const bx = Math.sin(p.a), bz = Math.cos(p.a); // backward (+Z of the heading frame)
  for (let i = n; i >= 1; i--) { const d = (len * i) / n; out.push({ x: p.x + bx * d, z: p.z + bz * d, a: p.a }); }
  return out;
}

// ---------------------------------------------------------------- bogies
// A bogie's frame in its own frame (the rail head y = 0, the axles across x, the middle at z = 0): plate frames outside
// the wheels with horn guides, axle boxes and leaf springs at every axle, brake blocks, headstocks, a centre transom
// with the pivot bowl the body (or a span bolster) bears on at `top`.
export function bogieParts(P, { axles = 5, pitch = 1.45, wr = 0.5, top = 1.3, fx = 0.95 } = {}) {
  const L = (axles - 1) * pitch, half = L / 2 + 0.55;
  for (const s of [-1, 1]) {
    const x = s * fx;
    P.add('camo', box(0.07, 0.32, 2 * half, x, wr + 0.42, 0)); // top member
    P.add('camo', box(0.2, 0.06, 2 * half, x - s * 0.06, wr + 0.6, 0));
    for (let i = 0; i < axles - 1; i++) {
      const z = -L / 2 + (i + 0.5) * pitch;
      P.add('camo', box(0.07, 0.24, pitch - 0.52, x, wr - 0.02, z)); // bottom member between the horns
      // the frame's lightening hole between the horns, dark through the plate
      P.add('dark', box(0.075, 0.16, pitch - 0.8, x, wr + 0.26, z));
    }
    for (const e of [-1, 1]) P.add('camo', box(0.07, 0.72, 0.5, x, wr + 0.2, e * (half - 0.25)));
    for (let i = 0; i < axles; i++) {
      const z = -L / 2 + i * pitch;
      P.add('dark', box(0.26, 0.32, 0.34, x, wr, z)); // axle box
      P.add('dark', box(0.08, 0.5, 0.48, x + s * 0.03, wr + 0.04, z)); // horn guides
      for (let k = 0; k < 4; k++) P.add('dark', box(0.13, 0.026, 0.84 - k * 0.16, x, wr + 0.2 + k * 0.03, z)); // leaf spring
      P.add('dark', box(0.1, 0.18, 0.12, x - s * 0.18, wr, z + pitch * 0.36)); // brake block
    }
    P.add('dark', rivetRow(V(x + s * 0.038, wr + 0.5, -half + 0.12), V(x + s * 0.038, wr + 0.5, half - 0.12), 0.3, V(s, 0, 0), 0.02));
  }
  for (const e of [-1, 1]) {
    P.add('camo', box(2.1, 0.3, 0.16, 0, wr + 0.32, e * half)); // headstocks
    P.add('dark', box(0.5, 0.12, 0.2, 0, wr + 0.12, e * (half + 0.05))); // the brake rigging's cross bar
  }
  P.add('camo', box(2 * fx, 0.4, 0.9, 0, top - 0.32, 0)); // the centre transom
  P.add('camo', box(0.9, top - wr - 0.6, 0.6, 0, (top + wr + 0.08) / 2 - 0.3, 0));
  P.add('dark', yTube(top - 0.12, top, 0.42, 0.42, 18, 0, 0)); // the pivot bowl
  for (const s of [-1, 1]) P.add('dark', box(0.3, 0.1, 0.4, s * 0.72, top - 0.07, 0)); // side bearers
}
// one wheelset in its own frame (the axle's centre at the origin): the axle, two spoked wheels with flanges inside the rails
export function wheelsetParts(P, wr = 0.5) {
  P.add('steel', xTube(-1.0, 1.0, 0.075, 0.075, 8));
  for (const s of [-1, 1]) {
    P.add('steel', xTube(s * (GA - 0.07), s * (GA + 0.07), wr, wr, 26)); // tyre
    P.add('steel', xTube(s * (GA - 0.09), s * (GA - 0.065), wr + 0.035, wr + 0.035, 26)); // flange
    P.add('dark', xTube(s * (GA - 0.05), s * (GA + 0.05), wr - 0.07, wr - 0.07, 16)); // the wheel's centre
    P.add('dark', xTube(s * (GA + 0.02), s * (GA + 0.16), 0.14, 0.11, 10)); // hub
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.add('steel', box(0.03, 0.05, wr * 1.75, s * (GA + 0.06), 0, 0, a, 0, 0)); } // spokes
  }
}

// A bogie standing on the curve: its frame and its rolling wheelsets, under `parent` at (x, y, z) turned `yaw` (y the rail
// head's height in parent's frame). turn(a) rolls its wheels to angle a (the same for every bogie on one track).
export function curveBogie(parent, mats, spec, x, y, z, yaw, name = 'bogie') {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  parent.add(g);
  const P = new Parts(mats);
  bogieParts(P, spec);
  P.build(g, { dirt: 0.55, y0: y });
  const W = new Parts(mats), tmp = new THREE.Group();
  wheelsetParts(W, spec.wr ?? 0.5);
  W.build(tmp, { dirt: 0.5, y0: (spec.wr ?? 0.5) + y });
  const L = ((spec.axles ?? 5) - 1) * (spec.pitch ?? 1.45);
  const places = Array.from({ length: spec.axles ?? 5 }, (_, i) => new THREE.Vector3(0, spec.wr ?? 0.5, -L / 2 + i * (spec.pitch ?? 1.45)));
  const ws = wheelSet(tmp, places, g, name + '-wheels');
  return { group: g, turn: ws.turn };
}

// A span bolster (Zwischenträger) over two bogies `pitch` apart, in its own frame (its middle at the origin, the rail
// head y = 0): a fish-bellied box beam from bogie pivot to bogie pivot at `y0` up to its top at `y1`, carrying the body on
// its centre pivot (or, on the K 12, the jacks).
export function spanBolsterParts(P, pitch, y0, y1, w = 1.9) {
  const L = pitch + 2.4;
  const prof = [[-L / 2, y1], [L / 2, y1], [L / 2, y1 - 0.45], [L / 2 - 1.1, y0 + 0.08], [-L / 2 + 1.1, y0 + 0.08], [-L / 2, y1 - 0.45]];
  for (const s of [-1, 1]) {
    // two webs (a top plate and a bottom plate join them), so the box reads hollow from below
    P.add('camo', sideProfile(prof, 0.05).translate(s * (w / 2 - 0.03), 0, 0));
    P.add('dark', rivetRow(V(s * (w / 2 + 0.005), y1 - 0.08, -L / 2 + 0.15), V(s * (w / 2 + 0.005), y1 - 0.08, L / 2 - 0.15), 0.3, V(s, 0, 0), 0.02));
    for (let z = -L / 2 + 1.3; z < L / 2 - 1.2; z += 0.8) P.add('camo', box(0.05, y1 - y0 - 0.25, 0.12, s * (w / 2 + 0.02), (y0 + y1) / 2 + 0.05, z)); // stiffeners
  }
  P.add('camo', box(w, 0.06, L, 0, y1 - 0.03, 0)); // top plate
  P.add('camo', box(w * 0.8, 0.05, L - 2.4, 0, y0 + 0.1, 0)); // bottom plate
  for (const e of [-1, 1]) P.add('dark', yTube(y0 - 0.06, y0 + 0.1, 0.36, 0.36, 18, 0, (e * pitch) / 2)); // on the bogies' pivots
  return L;
}

// ---------------------------------------------------------------- the track
// A track along a polyline of { x, z, a } (rail head y = RH over the ground, y = 0): the ballast bed (its top `bed`
// wide), sleepers every 0.65 m and the two rails. Into P: 'ballast', 'timber', 'steel', 'dark'.
export function layTrack(P, pts, { bed = 3.6, foot = 0.9, sleeper = 0.65, guard = false, gauge = GA } = {}) {
  const yb = RH - 0.25; // the ballast's top, a little below the sleepers' top
  const pos = [];
  const prof = [[-bed / 2 - foot, -0.05], [-bed / 2, yb], [bed / 2, yb], [bed / 2 + foot, -0.05]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const P0 = (u, p) => [p.x + Math.cos(p.a) * u, p.z - Math.sin(p.a) * u];
    for (let j = 0; j < prof.length - 1; j++) {
      const [u0, y0] = prof[j], [u1, y1] = prof[j + 1];
      const [ax, az] = P0(u0, a), [bx, bz] = P0(u1, a), [cx, cz] = P0(u1, b), [dx, dz] = P0(u0, b);
      pos.push(ax, y0, az, cx, y1, cz, bx, y1, bz, ax, y0, az, dx, y0, dz, cx, y1, cz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 3; uv[i * 2 + 1] = pos[i * 3 + 2] / 3; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  P.add('ballast', g, { uv: true });
  // sleepers along the length
  let len = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); cum.push(len); }
  const at = (d) => {
    let i = 1;
    while (i < pts.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i], k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, a: a.a + (b.a - a.a) * k };
  };
  for (let d = sleeper / 2; d < len; d += sleeper) {
    const p = at(d);
    P.add('timber', box(2.6, 0.16, 0.26, p.x, RH - 0.23, p.z, 0, p.a, 0));
  }
  // rails: a head, web and foot per segment, both sides (and a guard rail inside the left one on a firing curve)
  const sides = guard ? [-gauge, gauge, gauge - 0.32] : [-gauge, gauge];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (const u of sides) {
      const ax = a.x + Math.cos(a.a) * u, az = a.z - Math.sin(a.a) * u, bx = b.x + Math.cos(b.a) * u, bz = b.z - Math.sin(b.a) * u;
      const l = Math.hypot(bx - ax, bz - az) + 0.01, yaw = Math.atan2(-(bx - ax), -(bz - az)), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const guardRail = u === gauge - 0.32;
      P.add(guardRail ? 'dark' : 'steel', box(0.07, 0.05, l, mx, RH - 0.025, mz, 0, yaw, 0));
      P.add('dark', box(0.03, 0.08, l, mx, RH - 0.09, mz, 0, yaw, 0));
      P.add('dark', box(0.14, 0.02, l, mx, RH - 0.14, mz, 0, yaw, 0));
    }
  }
  return len;
}

// the materials a site needs beyond a gun's: ballast stone, earth, the scrim of the nets
let SITE_MATS = null;
export function siteMats(scheme) {
  SITE_MATS ??= (() => {
    const et = earthTextures();
    return {
      earth: new THREE.MeshStandardMaterial({ map: et.map, normalMap: et.normal, roughness: 1, metalness: 0, vertexColors: true }),
      ballast: new THREE.MeshStandardMaterial({ color: 0x8c877c, roughness: 1, metalness: 0, vertexColors: true }),
      net: new THREE.MeshStandardMaterial({ map: createHeavyScrimTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0, vertexColors: true }),
    };
  })();
  return { ...vehicleMats(scheme), ...SITE_MATS };
}

// ---------------------------------------------------------------- the ammunition wagon
// A four-wheeled flat wagon with stakes (a Rungenwagen) in its own frame (rail head y = 0, its middle at the origin, the
// front at -Z): the deck, the next rounds on timber chocks lying along it, the charges in their cases at the back, a
// tarpaulin over the rest. `rounds` [{ x, z }] are the shells' middles on the deck (x across), `deck` its top.
export const WAGON = { len: 7.6, deck: 1.22, wr: 0.47, wheelbase: 4.0 };
export function ammoWagonParts(P, { shell, rounds = [], charge = null, len = WAGON.len } = {}) {
  const D = WAGON.deck, wr = WAGON.wr, wb = WAGON.wheelbase;
  P.add('camo', box(2.7, 0.08, len, 0, D - 0.04, 0)); // the deck's planking
  for (let x = -1.25; x <= 1.26; x += 0.25) P.add('timber', box(0.22, 0.02, len - 0.1, x, D + 0.005, 0));
  for (const s of [-1, 1]) {
    P.add('camo', box(0.1, 0.3, len, s * 1.3, D - 0.2, 0)); // sole bars
    P.add('dark', box(0.12, 0.14, len, s * 1.0, D - 0.3, 0));
    for (let z = -len / 2 + 0.6; z < len / 2 - 0.4; z += 1.5) P.add('dark', box(0.08, 0.9, 0.08, s * 1.36, D + 0.4, z)); // stakes
  }
  for (const e of [-1, 1]) {
    P.add('camo', box(2.8, 0.3, 0.14, 0, D - 0.18, (e * len) / 2));
    for (const x of [-0.85, 0.85]) {
      P.add('dark', zTube((e * len) / 2, (e * len) / 2 + e * 0.38, 0.06, 0.06, 8, x, D - 0.2));
      P.add('steel', zTube((e * len) / 2 + e * 0.32, (e * len) / 2 + e * 0.4, 0.2, 0.2, 18, x, D - 0.2));
    }
  }
  for (const e of [-1, 1]) {
    const z = (e * wb) / 2;
    P.add('steel', xTube(-0.95, 0.95, 0.07, 0.07, 8, wr, z));
    for (const s of [-1, 1]) {
      P.add('steel', xTube(s * (GA - 0.07), s * (GA + 0.07), wr, wr, 22, wr, z));
      P.add('steel', xTube(s * (GA - 0.09), s * (GA - 0.065), wr + 0.03, wr + 0.03, 22, wr, z));
      P.add('dark', xTube(s * (GA - 0.05), s * (GA + 0.05), wr - 0.06, wr - 0.06, 14, wr, z));
      P.add('dark', box(0.24, 0.3, 0.3, s * 1.0, wr, z)); // axle box
      for (let k = 0; k < 4; k++) P.add('dark', box(0.12, 0.025, 1.3 - k * 0.24, s * 1.0, wr + 0.22 + k * 0.03, z));
    }
  }
  if (shell) {
    const g = shellGeometry(shell.len, shell.rad);
    for (const r of rounds) {
      for (const dz of [-shell.len * 0.28, shell.len * 0.28]) P.add('timber', box(shell.rad * 2.4, 0.08, 0.14, r.x, D + 0.04, r.z + dz));
      for (const [geo, k] of [[g.body, 'shell'], [g.band, 'brass'], [g.fuze, 'steel']]) P.add(k, geo.clone().translate(r.x, D + 0.08 + shell.rad, r.z));
    }
  }
  if (charge) {
    // the charges' cases in racks at the back, under a tarpaulin rolled half back
    for (let i = 0; i < 6; i++) {
      const x = -0.9 + (i % 3) * 0.6, z = len / 2 - 1.0 - Math.floor(i / 3) * 0.7;
      P.add('brass', zTube(z - charge.len / 2, z + charge.len / 2, charge.rad, charge.rad, 16, x, D + 0.05 + charge.rad));
    }
    P.add('cloth', box(2.6, 0.5, 1.2, 0, D + 0.55, len / 2 - 2.6), { tint: 0x6a6650 });
  }
}

// ---------------------------------------------------------------- nets
// a camouflage net between poles: a sagging sheet over x0..x1, z0..z1 at `top(x, z)`, its edges pulled down
export function drapeNet(x0, x1, z0, z1, top, rnd, sagK = 0.35) {
  const nx = Math.max(4, Math.round((x1 - x0) / 1.5)), nz = Math.max(4, Math.round((z1 - z0) / 1.5));
  const g = new THREE.PlaneGeometry(1, 1, nx, nz).rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getZ(i) + 0.5, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const sag = sagK * Math.sin(u * Math.PI * nx / 2) ** 2 * Math.sin(v * Math.PI * nz / 2) ** 2 + (rnd() - 0.5) * 0.12;
    const y = top(x, z) - sag - (edge < 0.001 ? 1.4 : 0);
    p.setXYZ(i, x + (edge < 0.001 ? (u < 0.001 ? -1 : u > 0.999 ? 1 : 0) : 0), y, z + (edge < 0.001 ? (v < 0.001 ? -1 : v > 0.999 ? 1 : 0) : 0));
    uv.setXY(i, x / 6, z / 6);
  }
  g.computeVertexNormals();
  return g;
}
// A net along the firing curve: a strip `w` wide over the arc a0..a1 at height h, on poles every ~6 m both sides; the gun
// stands under it at every bearing. Into P ('net', 'timber').
export function curveNet(P, R, a0, a1, w, h, rnd, xo = 0) {
  const n = Math.max(4, Math.round((Math.abs(a1 - a0) * R) / 1.5)), m = 6;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    for (let j = 0; j <= m; j++) {
      const v = j / m, u = (v - 0.5) * w, edge = j === 0 || j === m || i === 0 || i === n;
      const r = R + xo + u * (edge && (j === 0 || j === m) ? 1.25 : 1);
      const sag = 0.4 * Math.sin(v * Math.PI * m / 2) ** 2 * Math.abs(Math.sin(i * 0.9)) + (rnd() - 0.5) * 0.15;
      const y = h - sag - (j === 0 || j === m ? 1.5 : 0) - (i === 0 || i === n ? 1.2 : 0);
      pos.push(-R + r * Math.cos(a), y, -r * Math.sin(a));
      uv.push((a * R) / 6, u / 6);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const k = i * (m + 1) + j;
    idx.push(k, k + 1, k + m + 1, k + 1, k + m + 2, k + m + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  P.add('net', g, { uv: true });
  const step = 6 / R, np = Math.max(2, Math.round(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= np; i++) {
    const a = a0 + ((a1 - a0) * i) / np;
    for (const s of [-1, 1]) {
      const r = R + xo + (s * w) / 2;
      P.add('timber', yTube(0, h - 0.1, 0.07, 0.05, 6, -R + r * Math.cos(a), -r * Math.sin(a)));
    }
  }
  // the guy lines out from the end poles
  for (const a of [a0, a1]) for (const s of [-1, 1]) {
    const r = R + xo + (s * w) / 2, x = -R + r * Math.cos(a), z = -r * Math.sin(a), ox = Math.cos(a) * s * 2.5, oz = -Math.sin(a) * s * 2.5;
    P.add('rope', rod(V(x, h - 0.2, z), V(x + ox, 0.05, z + oz), 0.012, 4));
  }
}

// ---------------------------------------------------------------- the loading gear on the rear platform
// The loading trolley (pivot `car`: its origin at the bore's height, position.z the shell's middle on it) on rails at
// RAILX either side, the rails' bridge to the breech (pivot `bridge`, the rig's `tray`: setTray(1) runs it back under
// the platform, 0 out to the breech over BRIDGE [z0, z1]), the runway beam's crab (pivot `crab`, its underside at BEAM)
// and the hook block (pivot `hoist`, position.y the hook's height) with the chains between them. Sets rig.setTray,
// setTrolley, setHoist, setCrab, the shell props 'tray' (on the trolley) and 'hoist' (under the hook), rig.shell; returns
// { update() } to stretch the chains to the hook.
export function loadingGear(rig, mk, { car, bridge, crab, hoist, DECK, TY, SHELL, HANDLES, RAILX, BRIDGE, BEAM, HANG, HOOK }) {
  {
    const Q = mk(), yr = DECK + 0.1 - TY, wr = 0.16, wy = yr + wr; // rail head and wheel centres in the trolley frame
    Q.add('camo', box(0.66, 0.05, 1.3, 0, wy + 0.2, 0.15));
    for (const s of [-1, 1]) {
      Q.add('camo', box(0.04, -SHELL.rad - wy - 0.15, 1.3, s * 0.32, (wy + 0.18 - SHELL.rad) / 2, 0.15));
      Q.add('camo', box(0.07, 0.05, 1.3, s * 0.34, -SHELL.rad - 0.04, 0.15)); // the side rail on top
      for (const z of [-0.35, 0.65]) {
        Q.add('dark', xTube(s * 0.38, s * 0.48, wr, wr, 18, wy, z));
        Q.add('dark', xTube(s * 0.38, s * 0.4, wr + 0.025, wr + 0.025, 18, wy, z));
        Q.add('dark', box(0.08, 0.12, 0.16, s * 0.35, wy, z));
      }
      for (const hz of HANDLES) Q.add('dark', rod(V(s * 0.34, -0.55, hz - 0.12), V(s * 0.5, -0.55, hz), 0.02, 5));
    }
    for (const z of [-0.35, 0.65]) Q.add('steel', xTube(-0.46, 0.46, 0.035, 0.035, 8, wy, z));
    for (const z of [-0.3, 0.5]) for (const s of [-1, 1]) Q.add('timber', box(0.14, 0.09, 0.16, s * 0.15, -SHELL.rad - 0.03, z, 0, 0, -s * 0.55));
    for (const s of [-1, 1]) Q.add('dark', rod(V(s * 0.28, wy + 0.2, 0.8), V(s * 0.28, -0.3, 0.95), 0.022, 5));
    Q.add('dark', xTube(-0.3, 0.3, 0.022, 0.022, 6, -0.3, 0.95));
    Q.build(car, { dirt: 0.15, y0: TY });
  }
  // the bridge: the rails' forward section on a light frame, out to the breech (deployed) or back under the platform
  {
    const Q = mk(), z0 = BRIDGE[0], z1 = BRIDGE[1];
    for (const s of [-1, 1]) {
      Q.add('steel', box(0.07, 0.1, z1 - z0, s * RAILX, DECK + 0.05, (z0 + z1) / 2));
      Q.add('dark', box(0.1, 0.12, z1 - z0, s * RAILX, DECK - 0.06, (z0 + z1) / 2));
    }
    for (const z of [z0 + 0.1, (z0 + z1) / 2, z1 - 0.1]) Q.add('dark', box(2 * RAILX + 0.1, 0.06, 0.08, 0, DECK - 0.09, z));
    Q.build(bridge, { dirt: 0.1, y0: DECK });
  }
  const BL = BRIDGE[1] - BRIDGE[0];
  rig.setTray = (k) => {
    k = Math.min(1, Math.max(0, k));
    const d = Math.min(1, k / 0.3), r = Math.max(0, (k - 0.3) / 0.7);
    bridge.position.y = -0.24 * d * d * (3 - 2 * d);
    bridge.position.z = (BL + 0.1) * r * r * (3 - 2 * r);
  };
  rig.setTray(1);
  {
    // the crab: a two-wheeled trolley hung on the beam's bottom flange, the chain block under it
    const Q = mk();
    Q.add('dark', box(0.36, 0.22, 0.5, 0, -0.03, 0));
    for (const s of [-1, 1]) for (const dz of [-0.17, 0.17]) Q.add('steel', xTube(s * 0.03, s * 0.13, 0.07, 0.07, 12, 0.08, dz));
    Q.add('camo', box(0.3, 0.26, 0.36, 0, -0.27, 0));
    Q.add('iron', xTube(-0.2, 0.2, 0.12, 0.12, 14, -0.27, 0));
    Q.build(crab, { dirt: 0, y0: BEAM });
    const H = mk(), barY = -(HANG - SHELL.rad);
    H.add('dark', rbox(0.2, 0.3, 0.16, 0.03, 0, 0.05, 0));
    H.add('steel', new THREE.TorusGeometry(0.08, 0.025, 6, 12, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.17, 0));
    H.add('chain', rod(V(0, -0.22, 0), V(0, barY, -0.42), 0.012, 4));
    H.add('chain', rod(V(0, -0.22, 0), V(0, barY, 0.42), 0.012, 4));
    H.add('steel', zTube(-0.45, 0.45, 0.012, 0.012, 6, 0, barY));
    H.build(hoist, { dirt: 0, y0: HOOK.up });
  }
  const unit = new THREE.CylinderGeometry(0.016, 0.016, 1, 5).translate(0, -0.5, 0);
  const strands = [-0.05, 0.05].map((dz) => { const m = new THREE.Mesh(unit, rig.mats.chain); m.position.set(0, -0.35, dz); crab.add(m); return m; });

  const addShell = (where, parent, y) => {
    const g = new THREE.Group();
    g.name = 'shell-' + where;
    const s = shellGeometry(SHELL.len, SHELL.rad);
    for (const [geo, m] of [[s.body, rig.mats.shell], [s.band, rig.mats.brass], [s.fuze, rig.mats.steel]]) g.add(new THREE.Mesh(geo, m));
    g.position.y = y;
    g.visible = false;
    parent.add(g);
    rig.props[where] = g;
  };
  addShell('tray', car, 0);
  addShell('hoist', hoist, -HANG);
  rig.props.trolley = rig.props.tray;
  rig.props.crane = rig.props.hoist;
  rig.shell = { len: SHELL.len, rad: SHELL.rad };
  rig.setTrolley = (z) => { car.position.z = z; };
  rig.setHoist = (y) => { hoist.position.y = y; };
  rig.setCrab = (z) => { crab.position.z = z; hoist.position.z = z; };
  const update = () => {
    const len = Math.max(0.05, BEAM - 0.35 - (hoist.position.y + 0.18));
    for (const m of strands) m.scale.y = len;
  };
  update();
  return { update };
}

// The ready rack for the charges (a bag ahead of a brass case): a two-shelf rack on brackets against the walkway's outer
// railing (or wall), the top shelf where the next charge lies (the crew's prop, its middle at RK), a spare on the lower
// shelf. Into P ('camo', 'rope', 'brass'). `out` the railing's x (the rack's back).
export function readyRack(P, RK, DECK, { bag, br, case: cl, cr }, out) {
  const L = bag + cl, h = L / 2 - 0.1, back = out - 0.04;
  for (const z of [RK.z - h, RK.z + h]) {
    P.add('camo', rod(V(back, DECK, z), V(back, RK.y + 0.12, z), 0.025, 5));
    for (const y of [RK.y - cr - 0.02, DECK + 0.14]) {
      P.add('camo', box(back - RK.x + 0.16, 0.04, 0.07, (back + RK.x - 0.16) / 2, y, z));
      P.add('camo', rod(V(RK.x - 0.15, y + 0.02, z), V(RK.x - 0.15, y + 0.1, z), 0.015, 4)); // the lip
    }
  }
  for (const y of [RK.y - cr - 0.02, DECK + 0.14]) P.add('camo', box(0.03, 0.03, 2 * h, RK.x - 0.15, y + 0.08, RK.z));
  const y = DECK + 0.16 + cr, z0 = RK.z - L / 2;
  P.add('rope', zTube(z0, z0 + bag, br, br, 14, RK.x, y)); // the spare: the fore charge bag
  P.add('brass', zTube(z0 + bag, z0 + L, cr, cr, 18, RK.x, y)); // and its brass main case
}

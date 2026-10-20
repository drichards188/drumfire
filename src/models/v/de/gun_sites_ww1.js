import * as THREE from 'three';
import { Mesher, h2, grey, rgbk } from '../../../world/mesher.js';
import { worldMats } from '../../../world/mats.js';
import { shellStack, sandWall, crate } from '../../../world/props.js';

/**
 * The WW1 German gun positions of the Flanders salient, 1917-18 (the WW1 German mode): buildGunSite1918(kind, seed)
 * -> { root } in the piece's frame (front -Z, x right, ground y = 0), for kinds 'sfh13' | 'm16' | 'k17' | 'bertha'.
 * The integration agent places the root at the piece's placement turned to its zero line (src/ww1/render.js).
 *
 * In the salient the water stood a spade's depth down, so the German batteries built their positions up rather than
 * digging them in: a floor of trodden mud at ground level with a plank platform (Bettung) under the wheels and an
 * arc of planks where the trail's spade is shifted for the traverse; a low breastwork of sandbags revetted inside
 * with posts and wattle hurdles, the spoil banked outside it and stuck with brushwood; lower in front, under the
 * barrel; open at the back where a duckboard walk leads in from the dugout's timbered entrance. A camouflage net on
 * poles over the crew's half, rolled back from the muzzle; the ready rounds on dunnage by the
 * wall, a timbered shell niche in the breastwork, wicker cartridge baskets and charge boxes; puddles; two aiming
 * posts (Richtlatten) out in front on the left. The 42 cm stands in a much larger emplacement: walls round its bed,
 * a timber-and-iron ammunition shelter behind, the dugout, the net on tall poles.
 *
 * Clearances (checked against the rigs at full traverse): the wall's inner face follows a radius that depends on the
 * bearing from the pivot under the axle: the trail and the men at its end sweep the rear sector, the detachment the
 * sides, only the barrel the front. The ready rounds lie where neither the trail nor the crew's homes reach (for the
 * sFH 13 and the Mörser 16 on their rigs' shellStack anchors; the 10 cm K 17's pile is on its own safe spot, see
 * PITS.k17.pile). The net's poles stand in the breastwork, its front edge behind the breech's sweep.
 */
const DEG = Math.PI / 180;

// Pit layout per kind, metres in the piece frame. front/side/rear: the wall's inner radius in the front sector (bearing
// from the rear axis over a2), the sides (a1..a2) and the rear (under a1), degrees; gate: half the rear opening (deg);
// wall: breastwork height at the sides (the front is lower); plat: the wheels' plank platform; arc: the trail's plank
// arc [inner, outer, half angle]; net: the scrim over the crew's half; pile: the ready rounds [x, z] (outside the trail's
// and the crew's sweep); niche: bearing of the shell niche; shell: the ready rounds' size and paint.
const PITS = {
  sfh13: { front: 3.0, side: 4.0, rear: 5.0, a1: 70, a2: 135, gate: 12, wall: 0.8, plat: { x: 1.5, z0: -1.3, z1: 1.5 }, arc: [3.45, 4.5, 64],
    net: { x: 3.9, z0: 1.2, z1: 4.7, hBack: 2.8, hFront: 2.55 }, pile: { phi: 95, r: 3.45, bask: [106, 113, 3.55], crate: [121, 3.25] }, niche: -100, dug: -1, shell: { r: 0.075, len: 0.6, cols: 4, tiers: 2 } },
  m16: { front: 3.4, side: 4.4, rear: 5.8, a1: 88, a2: 135, gate: 11, wall: 0.9, plat: { x: 1.8, z0: -1.4, z1: 1.7 }, arc: [3.35, 4.45, 62],
    net: { x: 5.0, z0: 2.8, z1: 5.6, hBack: 3.15, hFront: 2.95 }, pile: { phi: -102, r: 3.37, bask: [-112, -118, 3.5], crate: [-90, 3.65] }, niche: 118, dug: 1, shell: { r: 0.106, len: 0.8, cols: 3, tiers: 2 } },
  k17: { front: 3.4, side: 4.3, rear: 5.0, a1: 72, a2: 135, gate: 12, wall: 0.75, plat: { x: 1.5, z0: -1.3, z1: 1.5 }, arc: [3.4, 4.4, 64],
    net: { x: 4.1, z0: 1.3, z1: 4.7, hBack: 2.8, hFront: 2.55 }, pile: { phi: 95, r: 3.6, bask: [106, 113, 3.7], crate: [121, 3.45] }, niche: -100, dug: -1, shell: { r: 0.053, len: 0.5, cols: 5, tiers: 2 } },
};
const PAINT = 0x5a5e55, BAND = 0xc8a82a, BRASS = 0x8a7236;

export function buildGunSite1918(kind, seed = 1) {
  const root = new THREE.Group();
  root.name = `${kind}-position-1918`;
  const m = new Mesher(), h = () => 0;
  if (kind === 'bertha') bertha(m, seed, h);
  else pit(m, PITS[kind] ?? PITS.sfh13, seed, h);
  m.build(root, worldMats(), { name: `${kind}-site-` });
  // the floor's mud and the puddles take shadows but cast none (they lie on the ground)
  root.traverse((o) => { if (o.isMesh && /mud|water/.test(o.name)) o.castShadow = false; });
  return { root };
}

// ---------------------------------------------------------------- the field gun pit
function pit(m, K, seed, h) {
  // the wall's inner radius at bearing phi (from +Z toward +X, radians), blended across the sector borders
  const R = (phi) => {
    const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))) / DEG, mix = (x, a0, a1) => Math.min(1, Math.max(0, (x - a0) / (a1 - a0)));
    const s1 = mix(a, K.a1 - 4, K.a1 + 4), s2 = mix(a, K.a2 - 6, K.a2 + 6);
    return K.rear + (K.side - K.rear) * s1 + (K.front - K.side) * s2;
  };
  const P = (phi, r) => [r * Math.sin(phi), r * Math.cos(phi)];
  const th = 0.9;

  // the floor: trodden mud within the wall, ragged at its edge, with puddles
  const n = 36;
  for (let i = 0; i < n; i++) {
    const p0 = (i / n) * 2 * Math.PI - Math.PI, p1 = ((i + 1) / n) * 2 * Math.PI - Math.PI;
    const r0 = R(p0) + 0.4 + h2(i, seed, 1) * 0.5, r1 = R(p1) + 0.4 + h2(i + 1 === n ? 0 : i + 1, seed, 1) * 0.5;
    const a = P(p0, r0), b = P(p1, r1);
    m.tri('mud', [0, 0.012, 0], [b[0], 0.012, b[1]], [a[0], 0.012, a[1]], grey(0.78 + h2(i, seed, 2) * 0.16), [[0, 0], [b[0], b[1]], [a[0], a[1]]]);
  }
  for (let k = 0; k < 5; k++) {
    const phi = (h2(k, seed, 3) - 0.5) * 2 * Math.PI, r = 1.8 + h2(k, seed, 4) * (R(phi) - 2.3);
    puddle(m, ...P(phi, r), 0.35 + h2(k, seed, 5) * 0.45, seed + k);
  }

  // the wheels' plank platform and the trail's arc of planks (the spade shifted along it for the traverse)
  const pl = K.plat;
  for (let x = -pl.x + 0.13; x < pl.x; x += 0.27) m.box('plank', x, 0.025, (pl.z0 + pl.z1) / 2, 0.25, 0.05, pl.z1 - pl.z0 - h2(x * 7, seed, 6) * 0.15, 0, grey(0.75 + h2(x * 9, seed, 7) * 0.2), { u0: x * 3 });
  for (const z of [pl.z0 + 0.15, pl.z1 - 0.15]) m.box('timber', 0, 0.006, z, pl.x * 2, 0.012, 0.18, 0, grey(0.6));
  const [ai, ao, ah] = K.arc;
  for (let a = -ah; a <= ah; a += 4.2) {
    const phi = a * DEG, c = P(phi, (ai + ao) / 2);
    m.box('plank', c[0], 0.03, c[1], 0.25, 0.06, ao - ai, phi, grey(0.7 + h2(a, seed, 8) * 0.25), { u0: a });
  }
  for (const r of [ai + 0.1, ao - 0.1]) for (let a = -ah; a < ah; a += 8) {
    const p0 = P(a * DEG, r), p1 = P((a + 8) * DEG, r);
    m.beam('timber', [p0[0], 0.008, p0[1]], [p1[0], 0.008, p1[1]], 0.16, 0.016, grey(0.55));
  }

  // the breastwork: sandbag courses round the pit (lower in front), revetted inside with posts and wattle
  // hurdles, the spoil banked against it outside; open at the back (the gate)
  const step = 6, g = K.gate;
  for (let a = g; a < 360 - g - 0.1; a += step) {
    const a1 = Math.min(360 - g, a + step), p0 = a * DEG, p1 = a1 * DEG;
    const fr = (phi) => Math.abs(((phi / DEG + 180) % 360) - 180) > K.a2 + 10;
    const hh = fr((p0 + p1) / 2) ? K.wall * 0.7 : K.wall;
    const r0 = R(p0) + th / 2, r1 = R(p1) + th / 2;
    sandWall(m, h, P(p0, r0), P(p1, r1), { hh, th, seed: seed * 13 + a });
    // the revetment on the inner face
    const i0 = P(p0, R(p0) - 0.02), i1 = P(p1, R(p1) - 0.02), len = Math.hypot(i1[0] - i0[0], i1[1] - i0[1]);
    const yaw = Math.atan2(-(i1[0] - i0[0]), -(i1[1] - i0[1]));
    m.box('wattle', (i0[0] + i1[0]) / 2, hh / 2, (i0[1] + i1[1]) / 2, 0.06, hh, len + 0.02, yaw, grey(0.8 + h2(a, seed, 9) * 0.2), { u0: a * 0.13 });
    m.cyl('timber', i0[0], 0, i0[1], 0.055, 0.05, hh + 0.12 + h2(a, seed, 10) * 0.1, 6, grey(0.62));
    // the spoil bank outside, a ragged ridge, and brushwood stuck along the top
    const o0 = P(p0, R(p0) + th + 0.45), o1 = P(p1, R(p1) + th + 0.45);
    m.slope('earth', [o0[0], -0.02, o0[1]], [o1[0], -0.02, o1[1]], 1.5, 0.5, hh * (0.6 + h2(a, seed, 11) * 0.2), grey(0.82 + h2(a, seed, 12) * 0.15), { u0: a * 0.1 });
    if (h2(a, seed, 13) > 0.55) brush(m, ...P((p0 + p1) / 2, R((p0 + p1) / 2) + th * 0.5), hh, seed + a);
  }
  // the gate's posts and the duckboard walk out of it, turning to the dugout's entrance
  const gr = K.rear + th / 2, gx = gr * Math.sin(g * DEG);
  for (const s of [-1, 1]) m.cyl('timber', s * gx, 0, gr * Math.cos(g * DEG), 0.08, 0.07, K.wall + 0.35, 7, grey(0.6));
  const dz0 = K.arc[1] + 0.1, dz1 = K.rear + 3.4, dx = K.dug * 3.2;
  duckboard(m, [0, dz0], [0, dz1], seed);
  duckboard(m, [0, dz1 + 0.35], [dx - K.dug * 1.0, dz1 + 0.35], seed + 1);
  dugout(m, dx, dz1 + 0.35, K.dug > 0 ? Math.PI / 2 : -Math.PI / 2, seed);

  // the ready rounds on their dunnage by the right wall (or wherever the kind's pile is), charge boxes and wicker
  // cartridge baskets beside them; a timbered shell niche in the breastwork
  const pp = K.pile, [px, pz] = P(pp.phi * DEG, pp.r);
  shellStack(m, h, px, pz, pp.phi * DEG, { r: K.shell.r, len: K.shell.len, cols: K.shell.cols, tiers: K.shell.tiers, paint: PAINT, band: BAND });
  for (let k = 0; k < 4; k++) {
    const [bx, bz] = P((pp.bask[0] + (pp.bask[1] - pp.bask[0]) * (k >> 1)) * DEG, pp.bask[2] + (k & 1) * 0.32);
    m.cyl('wattle', bx, 0, bz, 0.13, 0.15, 0.48, 9, grey(0.85 + h2(k, seed, 14) * 0.15));
    m.cyl('dark', bx, 0.48, bz, 0.15, 0.13, 0.03, 9, grey(0.7));
  }
  const [cx, cz] = P(pp.crate[0] * DEG, pp.crate[1]);
  crate(m, h, cx, cz, pp.crate[0] * DEG, 0.62, 0.32, 0.4, 0, grey(0.85));
  niche(m, K.niche * DEG, R(K.niche * DEG), K.wall, K.shell, seed);

  // the net over the crew's half, rolled back from the muzzle; brushwood on it
  net(m, K.net, seed);
  // two aiming posts out in front on the left (the layer's Richtlatten), red and white
  for (const [x, z] of [[-4.5, -9], [-4.8, -15]]) richtlatte(m, x, z);
}

// ---------------------------------------------------------------- the 42 cm emplacement
function bertha(m, seed, h) {
  // the bed and the carriage stand in a walled emplacement 15 m across; the rear corners of the loading stage sweep
  // x to 6.1 at the 11.5 degree traverse, the sergeant stands at x -4.2
  const X = 7.6, Z0 = -6.0, Z1 = 12.6, GX = 2.4, th = 1.0, hw = 1.0;
  // the floor
  for (let x = -X; x < X; x += 2.2) for (let z = Z0; z < Z1 + 3; z += 2.3) {
    const w = Math.min(2.2, X - x), d = Math.min(2.3, Z1 + 3 - z);
    m.quad('mud', [x, 0.012, z + d], [x + w, 0.012, z + d], [x + w, 0.012, z], [x, 0.012, z], grey(0.76 + h2(x, z, seed) * 0.18), [[x, z + d], [x + w, z + d], [x + w, z], [x, z]]);
  }
  for (let k = 0; k < 7; k++) puddle(m, (h2(k, seed, 1) - 0.5) * 2 * (X - 1.2), Z0 + 1 + h2(k, seed, 2) * (Z1 - Z0 - 1), 0.5 + h2(k, seed, 3) * 0.7, seed + k);
  // the walls: sides and front, the rear in two pieces either side of the gate; revetted, banked outside
  const runs = [[[-X - th / 2, Z0 - th / 2], [-X - th / 2, Z1 + th / 2], hw], [[X + th / 2, Z1 + th / 2], [X + th / 2, Z0 - th / 2], hw],
    [[X + th / 2, Z0 - th / 2], [-X - th / 2, Z0 - th / 2], hw * 0.75], [[-X - th / 2, Z1 + th / 2], [-GX, Z1 + th / 2], hw], [[GX, Z1 + th / 2], [X + th / 2, Z1 + th / 2], hw]];
  for (const [a, b, hh] of runs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i < k; i++) {
      const t0 = i / k, t1 = (i + 1) / k, p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      sandWall(m, h, p0, p1, { hh, th, seed: seed * 7 + i });
      // the inner face: nx, nz point into the emplacement
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz), yaw = Math.atan2(-dx, -dz);
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, f = (-dz * -mx + dx * ((Z0 + Z1) / 2 - mz)) > 0 ? 1 : -1;
      const nx = (-dz / l) * f, nz = (dx / l) * f;
      const ix = (p0[0] + p1[0]) / 2 + nx * (th / 2 + 0.03), iz = (p0[1] + p1[1]) / 2 + nz * (th / 2 + 0.03);
      m.box('wattle', ix, hh / 2, iz, 0.06, hh, l + 0.02, yaw, grey(0.85 + h2(i, seed, 4) * 0.15), { u0: i * 0.7 });
      m.cyl('timber', p0[0] + nx * (th / 2 + 0.06), 0, p0[1] + nz * (th / 2 + 0.06), 0.07, 0.065, hh + 0.15, 7, grey(0.6));
      const ox = -nx * (th / 2 + 0.9), oz = -nz * (th / 2 + 0.9);
      m.slope('earth', [p0[0] + ox, -0.02, p0[1] + oz], [p1[0] + ox, -0.02, p1[1] + oz], 2.6, 0.6, hh * (0.9 + h2(i, seed, 5) * 0.2), grey(0.84 + h2(i, seed, 6) * 0.12), { u0: i * 1.6 });
      if (h2(i, seed, 7) > 0.4) brush(m, (p0[0] + p1[0]) / 2 - nx * 0.3, (p0[1] + p1[1]) / 2 - nz * 0.3, hh, seed + i * 3);
    }
  }
  // the walk in through the gate, the ammunition shelter behind on the right, the dugout on the left
  duckboard(m, [0, Z1 - 1.5], [0, Z1 + 4.2], seed);
  duckboard(m, [0.3, Z1 + 4.2], [5.2, Z1 + 4.2], seed + 1);
  duckboard(m, [-0.3, Z1 + 4.2], [-4.4, Z1 + 4.2], seed + 2);
  shelter(m, 7.6, Z1 + 4.2, seed);
  dugout(m, -5.4, Z1 + 4.2, -Math.PI / 2, seed);
  // ready charges in their brass cases on a pallet inside the right wall, behind the carriage's sweep
  for (let k = 0; k < 6; k++) {
    const x = X - 0.6 - (k % 2) * 0.46, z = 10.4 + ((k / 2) | 0) * 0.5;
    m.cyl('paint', x, 0.1, z, 0.205, 0.2, 0.95, 12, BRASS);
    m.cyl('dark', x, 1.05, z, 0.2, 0.18, 0.02, 12, grey(0.3));
  }
  m.box('timber', X - 0.83, 0.05, 10.9, 1.1, 0.1, 1.7, 0, grey(0.65));
  niche(m, -Math.PI / 2, 0, hw, { r: 0.21, len: 1.65 }, seed, [-X, 7.0]);
  // the net on tall poles over the back half of the emplacement (the barrel rises in front of it)
  net(m, { x: X - 0.4, z0: 3.4, z1: Z1 + 0.3, hBack: 7.4, hFront: 6.9 }, seed);
  // the firer's breastwork out on the left (the long lanyard runs to it) and the aiming posts
  for (const [a, b] of [[[-13.6, 2.4], [-11.4, 2.4]], [[-13.6, 2.4], [-13.6, 4.6]], [[-11.4, 2.4], [-11.4, 4.0]]]) sandWall(m, h, a, b, { hh: 1.1, th: 0.7, seed: seed + 50 });
  for (const [x, z] of [[-8, -14], [-8.6, -22]]) richtlatte(m, x, z);
}

// ---------------------------------------------------------------- pieces of dressing

// a puddle: an irregular disc of standing water just over the mud
function puddle(m, x, z, r, seed) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    const r0 = r * (0.65 + h2(i, seed, 21) * 0.5), r1 = r * (0.65 + h2((i + 1) % n, seed, 21) * 0.5);
    m.tri('water', [x, 0.03, z], [x + Math.sin(a1) * r1, 0.03, z + Math.cos(a1) * r1], [x + Math.sin(a0) * r0, 0.03, z + Math.cos(a0) * r0], 0xffffff, [[0, 0], [1, 0], [0, 1]]);
  }
}

// a duckboard walk from a to b ([x, z]): two runners and slats across, raised a hand off the mud
function duckboard(m, a, b, seed) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, yaw = Math.atan2(-dx, -dz);
  for (const s of [-1, 1]) m.box('timber', (a[0] + b[0]) / 2 + nx * s * 0.24, 0.05, (a[1] + b[1]) / 2 + nz * s * 0.24, 0.07, 0.07, L, yaw, grey(0.55));
  for (let t = 0.1; t < L; t += 0.16) {
    const x = a[0] + ux * t, z = a[1] + uz * t, j = h2(t * 10, seed, 22);
    m.box('plank', x, 0.095, z, 0.62, 0.025, 0.09, yaw + (j - 0.5) * 0.06, grey(0.62 + j * 0.25), { u0: t });
  }
}

// brushwood thrown over a wall top: cut branches lying across it, their leafy ends flattened, a few twigs sticking up
function brush(m, x, z, y, seed) {
  for (let i = 0; i < 3; i++) {
    const a = h2(i, seed, 23) * 6.3, l = 0.5 + h2(i, seed, 24) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
    const x0 = x + (h2(i, seed, 25) - 0.5) * 0.5, z0 = z + (h2(i, seed, 26) - 0.5) * 0.5;
    m.tube('timber', [x0 - sa * l * 0.5, y + 0.02, z0 - ca * l * 0.5], [x0 + sa * l * 0.5, y + 0.1, z0 + ca * l * 0.5], 0.016, 0.006, 4, grey(0.42), { capA: false });
    m.ell('foliage', x0 + sa * l * 0.35, y + 0.08, z0 + ca * l * 0.35, 0.24, 0.07, 0.15, a, rgbk(0.24 + h2(i, seed, 27) * 0.12, 0.26 + h2(i, seed, 28) * 0.05, 0.14), 7, 0.7);
    m.tube('timber', [x0, y + 0.05, z0], [x0 + sa * 0.15, y + 0.35 + h2(i, seed, 29) * 0.2, z0 + ca * 0.15], 0.01, 0.004, 3, grey(0.4), { capA: false });
  }
}

// the dugout's entrance at (x, z) facing `yaw` (rotation.y convention: 0 faces -Z): a mound of spoil and sandbags
// over the timbered frame, the doorway's dark opening with the top of its steps, a sheet of corrugated iron
function dugout(m, x, z, yaw, seed) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const at = (lx, y, lz) => { const p = L(lx, lz); return [p[0], y, p[1]]; };
  const [mx, mz] = L(0, 1.3);
  m.ell('earth', mx, 0.0, mz, 2.0, 1.1, 1.9, yaw, grey(0.85), 10, 0.25);
  // sandbagged front either side of the door, the frame, the lintel and the iron over it
  for (const sx of [-1, 1]) sandWall(m, () => 0, L(sx * 0.55, 0.15), L(sx * 1.6, 0.35), { hh: 1.1, th: 0.6, seed: seed + 60 + sx });
  for (const sx of [-1, 1]) m.box('timber', ...at(sx * 0.48, 0.75, 0.05), 0.14, 1.5, 0.14, yaw, grey(0.58));
  m.box('timber', ...at(0, 1.55, 0.05), 1.2, 0.16, 0.18, yaw, grey(0.55));
  m.box('iron', ...at(0, 1.66, 0.55), 1.6, 0.03, 1.3, yaw, grey(0.7), { rx: -0.08 });
  sandWall(m, () => 1.66, L(-0.7, 0.4), L(0.7, 0.4), { hh: 0.3, th: 0.6, seed: seed + 64 });
  // the dark doorway and the first steps going down inside it
  const d0 = at(-0.4, 0.0, 0.35), d1 = at(0.4, 0.0, 0.35), d2 = at(0.4, 1.47, 0.35), d3 = at(-0.4, 1.47, 0.35);
  m.quad('dark', d1, d0, d3, d2, grey(0.25));
  m.quad('dark', d0, d1, d2, d3, grey(0.25));
  for (let k = 0; k < 3; k++) m.box('timber', ...at(0, 0.05 - k * 0.16, 0.12 + k * 0.08), 0.78, 0.05, 0.2, yaw, grey(0.5 - k * 0.1));
}

// a timbered shell niche in the breastwork at bearing phi (or at [x, z] when given), a few rounds lying in it
function niche(m, phi, r, hh, shell, seed, xz = null) {
  const yaw = xz ? -Math.PI / 2 : phi; // local +Z runs out into the wall, the opening faces the pit
  const x = xz ? xz[0] : r * Math.sin(phi), z = xz ? xz[1] : r * Math.cos(phi);
  const c = Math.cos(yaw), s = Math.sin(yaw), w = Math.max(0.8, shell.len + 0.3), d = 0.55;
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const at = (lx, y, lz) => { const p = L(lx, lz); return [p[0], y, p[1]]; };
  for (const sx of [-1, 1]) m.box('timber', ...at(sx * w / 2, hh / 2, 0.25), 0.1, hh, d, yaw, grey(0.6));
  m.box('timber', ...at(0, hh + 0.05, 0.25), w + 0.2, 0.1, d + 0.1, yaw, grey(0.55));
  m.box('dark', ...at(0, hh / 2, 0.5), w, hh, 0.05, yaw, grey(0.3));
  m.box('plank', ...at(0, 0.04, 0.25), w, 0.08, d, yaw, grey(0.7));
  for (let k = 0; k < Math.min(3, Math.floor(hh / (shell.r * 2.1))); k++) {
    const y = 0.08 + shell.r + k * shell.r * 2.02, a = at(-shell.len / 2, y, 0.28), b = at(shell.len / 2 - shell.r, y, 0.28), e = at(shell.len / 2 + shell.r * 0.4, y, 0.28);
    m.tube('paint', a, b, shell.r, shell.r, 10, PAINT, { capB: false });
    m.tube('paint', b, e, shell.r, shell.r * 0.25, 10, grey(0.4), { capA: false });
  }
}

// the camouflage net: a sagging scrim sheet on poles over x in [-N.x, N.x], z in [N.z0, N.z1], the front edge
// rolled back into a fat roll of hessian, skirts drooping at the sides and back (the world's scrim and hessian,
// so the game's cutaway draws it back over the selected unit's guns; the poles stay)
function net(m, N, seed) {
  const nx = 6, nz = 4, x0 = -N.x, x1 = N.x;
  const yAt = (u, v) => N.hBack + (N.hFront - N.hBack) * v - Math.sin(u * Math.PI) * 0.3 - Math.sin(v * Math.PI) * 0.2;
  const P = (u, v) => [x0 + (x1 - x0) * u, yAt(u, v) + (h2(u * 7, v * 5, seed) - 0.5) * 0.06, N.z1 + (N.z0 - N.z1) * v];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const A = P(i / nx, k / nz), B = P((i + 1) / nx, k / nz), C = P((i + 1) / nx, (k + 1) / nz), D = P(i / nx, (k + 1) / nz);
    const du = (x1 - x0) / nx, dv = (N.z1 - N.z0) / nz;
    m.quad('scrim', A, B, C, D, grey(0.9 + h2(i, k, seed + 1) * 0.2), [[i * du, k * dv], [(i + 1) * du, k * dv], [(i + 1) * du, (k + 1) * dv], [i * du, (k + 1) * dv]]);
  }
  // poles at the corners and the middle of the long sides, guy ropes pegged out
  for (const u of [0, 1]) for (const v of [0, 0.5, 1]) {
    const p = P(u, v);
    m.cyl('timber', p[0], 0, p[2], 0.07, 0.055, p[1] + 0.05, 6, grey(0.6));
    const gx = p[0] + (u ? 0.9 : -0.9), gz = p[2] + (v === 0 ? 0.6 : v === 1 ? -0.3 : 0);
    m.tube('timber', [p[0], p[1], p[2]], [gx, 0.05, gz], 0.008, 0.008, 3, grey(0.45), { capA: false, capB: false });
  }
  // skirts at the sides and the back
  const skirt = (a, b, drop) => m.quad('scrim', a, [a[0], a[1] - drop, a[2]], [b[0], b[1] - drop, b[2]], b, grey(0.88), [[0, 0], [0, drop], [Math.hypot(b[0] - a[0], b[2] - a[2]), drop], [Math.hypot(b[0] - a[0], b[2] - a[2]), 0]]);
  skirt(P(0, 0), P(1, 0), 1.0);
  skirt(P(0, 1), P(0, 0), 0.8);
  skirt(P(1, 0), P(1, 1), 0.8);
  const f0 = P(0, 1), f1 = P(1, 1);
  m.tube('hessian', [f0[0], f0[1] - 0.04, f0[2]], [f1[0], f1[1] - 0.04, f1[2]], 0.13, 0.13, 8, rgbk(0.55, 0.58, 0.44), { capA: true, capB: true });
}

// an aiming post: a striped red and white rod standing in the mud
function richtlatte(m, x, z) {
  for (let k = 0; k < 5; k++) m.cyl('paint', x, k * 0.4, z, 0.025, 0.025, 0.4, 6, k % 2 ? 0xe8e2d0 : 0x9a2a1e, { cap: k === 4 });
}

// the 42 cm's ammunition shelter: a timber frame under corrugated iron and a layer of earth, open toward the walk,
// the heavy shells on dunnage inside and charges in their cases
function shelter(m, x, z, seed) {
  const w = 3.4, d = 4.2, hh = 2.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) m.cyl('timber', x + sx * w / 2, 0, z + sz * d / 2, 0.1, 0.09, hh, 7, grey(0.6));
  for (const sx of [-1, 1]) m.beam('timber', [x + sx * w / 2, hh, z - d / 2], [x + sx * w / 2, hh, z + d / 2], 0.18, 0.18, grey(0.55));
  m.arch('iron', [x, hh, z - d / 2 - 0.2], [x, hh, z + d / 2 + 0.2], w / 2 + 0.25, grey(0.75), { seg: 8, sy: 0.45 });
  m.ell('earth', x, hh + 0.2, z, w / 2 + 0.5, 0.75, d / 2 + 0.5, 0, grey(0.85), 10, 0.25);
  // the back and the far side walled with sandbags; the side to the walk open
  sandWall(m, () => 0, [x + w / 2 + 0.3, z - d / 2], [x + w / 2 + 0.3, z + d / 2], { hh: hh - 0.2, th: 0.6, seed: seed + 70 });
  sandWall(m, () => 0, [x - w / 2, z - d / 2 - 0.3], [x + w / 2, z - d / 2 - 0.3], { hh: hh - 0.2, th: 0.6, seed: seed + 71 });
  sandWall(m, () => 0, [x - w / 2, z + d / 2 + 0.3], [x + w / 2, z + d / 2 + 0.3], { hh: hh - 0.2, th: 0.6, seed: seed + 72 });
  shellStack(m, () => 0, x + 0.6, z, Math.PI / 2, { r: 0.21, len: 1.65, cols: 3, tiers: 2, paint: PAINT, band: BAND });
  for (let k = 0; k < 4; k++) m.cyl('paint', x - 0.9, 0.0, z - 1.4 + k * 0.48, 0.205, 0.2, 0.95, 12, BRASS);
}

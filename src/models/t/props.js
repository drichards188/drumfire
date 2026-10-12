import * as THREE from 'three';
import { V, box, rbox, sphere, xTube, yTube, zTube, rod, frontProfile, loft, xf } from '../kit.js';
import { buildShell } from '../shells.js';
import { mulberry32 } from '../../noise.js';
import { addWheel } from './fieldkit.js';

// Shared props for the targets: shell stacks, sandbags, horses, wagons, a lorry, a locomotive and
// wagons, roofs. All add into an FParts collector `P` (mats.js) at a transform (x, y, z, heading).
// Model space as everywhere: front -Z, ground y = 0, metres.

const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => g.applyMatrix4(xf(x, y, z, rx, ry, rz));

/** Shells standing nose up in a block of cols x rows, `layers` high, on a timber skid. */
export function shellBlock(P, kind, x, z, cols, rows, { layers = 1, ry = 0, tilt = 0, rnd = null, y = 0 } = {}) {
  const s = buildShell(kind, 6), R = s.radius, pitch = R * 2.15, L = s.length;
  const keys = ['matte', 'matte', 'matte', 'steel'];
  const tints = s.parts.map((p) => p.material.color.getHex());
  const w = cols * pitch, d = rows * pitch;
  P.add('wood', place(box(w + 0.2, 0.1, d + 0.2), x, y + 0.05, z, ry));
  for (let l = 0; l < layers; l++) {
    const y0 = y + 0.1 + l * (L + 0.06);
    if (l) P.add('wood', place(box(w + 0.1, 0.04, d + 0.1), x, y0 - 0.03, z, ry));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const ox = (i - (cols - 1) / 2) * pitch, oz = (j - (rows - 1) / 2) * pitch;
      const c = Math.cos(ry), sn = Math.sin(ry);
      const jx = rnd ? (rnd() - 0.5) * 0.02 : 0;
      for (let k = 0; k < s.parts.length; k++) {
        const g = s.parts[k].geometry.clone();
        // the shell lies along Z (nose -Z); stand it nose up: rotate about X by +90 degrees (-Z to +Y)
        g.applyMatrix4(xf(0, 0, 0, Math.PI / 2, 0, 0));
        place(g, x + ox * c + oz * sn + jx, y0 + L / 2, z - ox * sn + oz * c, ry, tilt ? (rnd ? (rnd() - 0.5) * tilt : tilt) : 0);
        P.add(keys[k], g, { tint: tints[k] });
      }
    }
  }
}

/** One shell lying on the ground (scattered by damage, or in a rack). */
export function lyingShell(P, kind, x, y, z, ry) {
  const s = buildShell(kind, 6), keys = ['matte', 'matte', 'matte', 'steel'];
  s.parts.forEach((p, k) => P.add(keys[k], place(p.geometry.clone(), x, y + s.radius, z, ry), { tint: p.material.color.getHex() }));
}

/** A run of sandbags from (x0, z0) to (x1, z1), `courses` high, thickness t (a stacked wall). */
export function sandbagWall(P, x0, z0, x1, z1, { courses = 3, t = 0.55, h = 0.17, taper = 0.9 } = {}) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
  for (let c = 0; c < courses; c++) {
    const f = Math.pow(taper, c);
    P.add('sandbag', place(rbox(len, h, t * f, 0.05, 0, 0, 0), (x0 + x1) / 2, h * (c + 0.5), (z0 + z1) / 2, ry), { tint: c % 2 ? 0xe0d4b8 : 0xf0e4c8 });
  }
}

/** A gabled roof prism, ridge along Z: width w, depth d, height h on y, with an overhang. */
export function gableRoof(P, key, w, d, h, y, x = 0, z = 0, o = 0.3, ry = 0) {
  const g = frontProfile([[-w / 2 - o, y], [w / 2 + o, y], [0, y + h]], -d / 2 - o, d / 2 + o);
  P.add(key, place(g, x, 0, z, ry));
}

/** A hipped roof: eaves rectangle w x d at y, ridge at y + h. */
export function hipRoof(P, key, w, d, h, y, x = 0, z = 0, o = 0.3, ry = 0) {
  const W = w / 2 + o, D = d / 2 + o, r = Math.max(0.02, W - D);
  const rings = [
    [V(-W, y, -D), V(W, y, -D), V(W, y, D), V(-W, y, D)],
    [V(-r, y + h, -0.02), V(r, y + h, -0.02), V(r, y + h, 0.02), V(-r, y + h, 0.02)],
  ];
  P.add(key, place(loft(rings), x, 0, z, ry));
}

/** A horse, 1.6 m at the withers, facing -Z at heading ry: coat tint, dark mane and hooves. */
export function horse(P, x, z, ry, coat = 0x6a4326, { y = 0, lying = false } = {}) {
  const parts = [];
  const add = (key, g, tint) => parts.push([key, g, tint]);
  add('matte', sphere(1, 0, 1.3, 0.0, 0.3, 0.36, 0.66, 12), coat); // barrel
  add('matte', sphere(1, 0, 1.38, -0.52, 0.28, 0.32, 0.3, 10), coat); // chest
  add('matte', sphere(1, 0, 1.36, 0.5, 0.29, 0.33, 0.32, 10), coat); // haunch
  add('matte', rod(V(0, 1.5, -0.62), V(0, 1.95, -0.92), 0.13, 8), coat); // neck
  add('matte', rod(V(0, 1.95, -0.92), V(0, 1.68, -1.3), 0.085, 8), coat); // head
  add('dark', rod(V(0, 1.98, -0.9), V(0, 1.6, -0.66), 0.04, 5), 0x1a1612); // mane
  add('dark', rod(V(0, 1.45, 0.78), V(0.02, 0.75, 0.9), 0.03, 5), 0x1a1612); // tail
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * 0.16, lz = sz * 0.5;
    add('matte', rod(V(lx, 1.15, lz), V(lx, 0.32, lz + sz * 0.02), 0.06, 6), coat);
    add('dark', yTube(0.0, 0.3, 0.06, 0.05, 6, lx, lz + sz * 0.02), 0x1a1612);
  }
  add('dark', box(0.16, 0.05, 0.12, 0, 1.7, -1.32), 0x1a1612); // muzzle
  for (const [key, g, t] of parts) {
    if (lying) g.applyMatrix4(xf(0, 0, 0, 0, 0, Math.PI / 2 * 0.98)).applyMatrix4(xf(0, 0.27, 0));
    P.add(key, place(g, x, y, z, ry), { tint: t });
  }
}

/** A heavy two-axle farm wagon (the German Heeres-Fahrzeug): ladder sides, canvas tilt, spoked wheels. */
export function wagon(P, x, z, ry = 0, { tilt = true, load = 0x5a4a30 } = {}) {
  const at = (g) => place(g, x, 0, z, ry);
  P.add('wood', at(box(1.5, 0.12, 3.8, 0, 0.95, 0)));
  for (const sx of [-1, 1]) {
    P.add('wood', at(box(0.08, 0.5, 3.8, sx * 0.75, 1.25, 0)));
    for (let i = 0; i < 6; i++) P.add('wood', at(box(0.06, 0.4, 0.06, sx * 0.76, 1.65, -1.6 + i * 0.64)));
  }
  P.add('wood', at(box(1.5, 0.5, 0.08, 0, 1.25, 1.9)));
  P.add('wood', at(box(1.5, 0.5, 0.08, 0, 1.25, -1.9)));
  P.add('steel', at(xTube(-0.8, 0.8, 0.045, 0.045, 8, 0.75, -1.2)));
  P.add('steel', at(xTube(-0.8, 0.8, 0.05, 0.05, 8, 0.8, 1.2)));
  P.add('wood', at(box(0.12, 0.16, 3.0, 0, 0.82, 0)));
  P.add('wood', at(box(0.08, 0.08, 2.4, 0, 0.9, -3.2))); // the pole
  for (const sx of [-1, 1]) {
    addWheel(P, sx * 0.95, 0.5, { R: 0.5, tw: 0.08, spokes: 10, side: sx, nave: 0.1, z: -1.2 });
    addWheel(P, sx * 0.95, 0.65, { R: 0.65, tw: 0.08, spokes: 12, side: sx, nave: 0.1, z: 1.2 });
  }
  if (tilt) {
    P.add('cloth', at(box(1.6, 0.06, 3.7, 0, 2.18, 0)), { tint: 0xb8b090 });
    for (const sx of [-1, 1]) P.add('cloth', at(box(0.06, 0.9, 3.7, sx * 0.8, 1.76, 0, 0, 0, sx * -0.2)), { tint: 0xb0a888 });
    P.add('cloth', at(box(1.6, 1.0, 0.05, 0, 1.7, 1.9)), { tint: 0xa8a080 });
    for (let i = 0; i < 4; i++) P.add('wood', at(rod(V(-0.8, 1.35, -1.4 + i * 0.95), V(0, 2.2, -1.4 + i * 0.95), 0.025, 4)));
  } else {
    P.add('matte', at(box(1.3, 0.5, 3.3, 0, 1.3, 0)), { tint: load });
  }
}

/** A two-wheeled gun limber with its ammunition chest (and a trail pole). */
export function limber(P, x, z, ry = 0) {
  const at = (g) => place(g, x, 0, z, ry);
  for (const sx of [-1, 1]) addWheel(P, sx * 0.85, 0.65, { R: 0.65, tw: 0.08, spokes: 12, side: sx, nave: 0.1 });
  P.add('steel', at(xTube(-0.9, 0.9, 0.05, 0.05, 8, 0.65, 0)));
  P.add('camo', at(box(1.3, 0.6, 1.1, 0, 1.2, 0)));
  P.add('camo', at(box(1.34, 0.08, 1.14, 0, 1.54, 0)));
  P.add('wood', at(box(0.12, 0.12, 2.8, 0, 0.95, -1.6)));
  P.add('wood', at(box(1.3, 0.08, 0.5, 0, 1.0, -0.8)));
  P.add('steel', at(new THREE.TorusGeometry(0.08, 0.02, 6, 12).translate(0, 0.9, 1.15)));
}

/** A 3-ton lorry with solid tyres, bonnet, cab, flat bed with a tarpaulin load. Faces -Z. */
export function lorry(P, x, z, ry = 0, { tarp = 0x7a7456, bed = true, winch = false } = {}) {
  const at = (g) => place(g, x, 0, z, ry);
  P.add('dark', at(box(1.0, 0.25, 6.0, 0, 0.78, 0.3)));
  P.add('camo', at(box(1.9, 0.9, 1.6, 0, 1.4, -2.0))); // bonnet
  P.add('camo', at(box(1.9, 0.2, 1.7, 0, 1.9, -2.0, 0.08)));
  P.add('dark', at(box(1.3, 0.8, 0.1, 0, 1.4, -2.85))); // radiator
  P.add('camo', at(box(2.0, 1.5, 1.2, 0, 1.75, -0.7))); // cab
  P.add('cloth', at(box(2.1, 0.08, 1.4, 0, 2.55, -0.65)), { tint: 0x5a5a40 });
  P.add('glass', at(box(1.6, 0.5, 0.04, 0, 2.0, -1.31)));
  if (bed) {
    P.add('wood', at(box(2.2, 0.15, 3.4, 0, 1.05, 2.1)));
    for (const sx of [-1, 1]) P.add('wood', at(box(0.06, 0.45, 3.4, sx * 1.07, 1.3, 2.1)));
    P.add('wood', at(box(2.2, 0.45, 0.06, 0, 1.3, 3.8)));
    if (winch) { // the balloon winch: a drum on a frame with a tarpaulin and a small engine
      P.add('dark', at(box(1.8, 0.7, 1.4, 0, 1.55, 3.0)));
      P.add('steel', at(xTube(-0.8, 0.8, 0.45, 0.45, 14, 2.1, 1.8)));
      for (const sx of [-1, 1]) P.add('steel', at(xTube(sx * 0.8, sx * 0.86, 0.6, 0.6, 14, 2.1, 1.8)));
      P.add('cloth', at(box(1.3, 0.5, 1.2, 0.2, 2.0, 3.2)), { tint: 0x6a6a54 });
    } else {
      P.add('cloth', at(box(2.1, 0.9, 3.0, 0, 1.75, 2.2)), { tint: tarp });
      P.add('cloth', at(box(2.0, 0.25, 2.9, 0, 2.3, 2.2)), { tint: tarp });
    }
  }
  for (const [wz, wr] of [[-2.0, 0.5], [2.4, 0.55]]) for (const sx of [-1, 1]) {
    P.add('tyre', at(xTube(sx * 0.82, sx * 1.1, wr, wr, 18, wr, wz)));
    P.add('rim', at(xTube(sx * 1.1, sx * 1.14, wr * 0.55, wr * 0.55, 12, wr, wz)));
  }
  P.add('lens', at(box(0.2, 0.2, 0.05, -0.6, 1.5, -2.88)));
  P.add('lens', at(box(0.2, 0.2, 0.05, 0.6, 1.5, -2.88)));
}

/** Prussian G8 style 0-8-0 goods locomotive with tender, 13 m, on standard gauge, facing -Z. */
export function locomotive(P, x, z, ry = 0) {
  const at = (g) => place(g, x, 0, z, ry);
  P.add('dark', at(zTube(-5.4, 0.8, 0.95, 0.95, 20, 0, 2.2))); // boiler
  P.add('dark', at(zTube(-5.9, -5.4, 0.95, 0.95, 20, 0, 2.2))); // smokebox
  P.add('steel', at(new THREE.CircleGeometry(0.85, 18).rotateY(Math.PI).translate(0, 2.2, -5.92))); // smokebox door
  P.add('dark', at(yTube(2.8, 3.9, 0.22, 0.3, 12, 0, -5.5))); // chimney
  P.add('dark', at(yTube(3.9, 3.98, 0.36, 0.36, 12, 0, -5.5)));
  P.add('brass', at(yTube(3.1, 3.55, 0.45, 0.28, 12, 0, -3.0))); // dome
  P.add('dark', at(yTube(3.1, 3.5, 0.3, 0.22, 10, 0, -1.4))); // sand dome
  P.add('camo', at(box(2.6, 2.5, 2.2, 0, 2.5, 1.9))); // cab
  P.add('dark', at(box(2.8, 0.12, 2.5, 0, 3.78, 1.9)));
  P.add('dark', at(box(2.6, 0.2, 11.0, 0, 1.2, -0.6))); // frame
  P.add('dark', at(box(2.9, 0.1, 7.0, 0, 1.55, -2.5))); // running boards
  P.add('dark', at(box(2.4, 0.9, 3.0, 0, 1.05, 2.5)));
  // tender
  P.add('dark', at(box(2.9, 1.9, 4.6, 0, 2.15, 6.6)));
  P.add('char', at(box(2.5, 0.6, 4.0, 0, 3.3, 6.6)));
  P.add('dark', at(box(2.4, 0.3, 5.2, 0, 1.0, 6.4)));
  for (const sx of [-1, 1]) {
    for (const wz of [-3.5, -2.1, -0.7, 0.7]) { // four coupled axles
      P.add('dark', at(xTube(sx * 1.2, sx * 1.35, 0.68, 0.68, 20, 0.68, wz)));
      P.add('steel', at(xTube(sx * 1.35, sx * 1.4, 0.2, 0.2, 10, 0.68, wz)));
    }
    P.add('steel', at(rod(V(sx * 1.45, 0.78, -3.5), V(sx * 1.45, 0.6, 0.7), 0.05, 6)));
    P.add('steel', at(rod(V(sx * 1.5, 1.0, -4.7), V(sx * 1.5, 0.78, -3.5), 0.07, 6))); // piston rod
    P.add('dark', at(box(0.3, 0.3, 1.0, sx * 1.3, 1.1, -4.6)));
    for (const wz of [3.9, 5.3, 7.9, 9.2]) P.add('dark', at(xTube(sx * 1.2, sx * 1.3, 0.55, 0.55, 18, 0.55, wz)));
    P.add('steel', at(box(0.3, 0.3, 0.3, sx * 0.9, 1.1, -6.1)));
  }
  P.add('lens', at(box(0.3, 0.3, 0.1, 0, 3.0, -5.95)));
  P.add('red', at(box(2.6, 0.2, 0.1, 0, 1.45, -6.0)));
  P.add('dark', at(box(1.2, 0.1, 0.2, 0, 1.3, 9.0)));
}

/** Covered goods wagon (G10 pattern), 8 m long, standard gauge, door on both sides. Faces -Z. */
export function boxcar(P, x, z, ry = 0, { tint = 0x6e4a36, open = false, load = 0x5a4a30, body = null } = {}) {
  const Q = body || P; // the box (walls, doors, roof) can go to another collector so it can be moved on its own
  const at = (g) => place(g, x, 0, z, ry);
  P.add('dark', at(box(2.5, 0.3, 8.0, 0, 0.95, 0))); // underframe
  for (const wz of [-2.6, 2.6]) for (const sx of [-1, 1]) {
    P.add('dark', at(xTube(sx * 1.0, sx * 1.07, 0.5, 0.5, 18, 0.5, wz)));
    P.add('steel', at(xTube(sx * 1.07, sx * 1.1, 0.12, 0.12, 8, 0.5, wz)));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('steel', at(zTube(sz * 4.0, sz * 4.35, 0.07, 0.06, 8, sx * 0.85, 1.05)));
  if (open) {
    for (const sx of [-1, 1]) Q.add('wood', at(box(0.08, 1.0, 8.0, sx * 1.25, 1.6, 0)), { tint });
    for (const sz of [-1, 1]) Q.add('wood', at(box(2.5, 1.0, 0.08, 0, 1.6, sz * 3.96)), { tint });
    Q.add('matte', at(box(2.3, 0.7, 7.6, 0, 1.55, 0)), { tint: load });
    return;
  }
  Q.add('wood', at(box(2.6, 2.3, 7.9, 0, 2.3, 0)), { tint });
  for (const sx of [-1, 1]) {
    Q.add('dark', at(box(0.06, 2.1, 1.8, sx * 1.33, 2.2, 0.4))); // sliding door
    Q.add('dark', at(box(0.08, 0.1, 3.2, sx * 1.34, 3.2, 0.4)));
    for (let i = 0; i < 5; i++) Q.add('dark', at(box(0.05, 2.2, 0.06, sx * 1.32, 2.3, -3.6 + i * 1.8)));
  }
  Q.add('dark', at(box(2.5, 0.35, 8.1, 0, 3.55, 0)));
  gableRoofPlain(Q, at, 2.8, 8.1, 0.45, 3.6);
}
function gableRoofPlain(P, at, w, d, h, y) {
  P.add('dark', at(frontProfile([[-w / 2, y], [w / 2, y], [0, y + h]], -d / 2, d / 2)));
}

/** The seeded generator the target builders share, so a given kind always builds the same. */
export const rng = (seed) => mulberry32(seed);

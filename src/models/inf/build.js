import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Soldier geometry in the rest pose: a 1.75 m man standing, front -Z, right +X, feet at y = 0, one
// merged geometry per side and detail level. Every vertex carries the body part it belongs to
// (`aPart`, see PART) and an optional kit tag (`aKit`, 0 = always worn, 1..4 = an item only some men
// carry), and the vertex shader in pose.js bends the parts about the joints listed in DIM. The
// colours are baked into the vertices (field grey, khaki, leather, steel), so one material serves a
// whole side and a wave of two hundred men costs a handful of draw calls.

export const PART = { PELVIS: 0, TORSO: 1, HEAD: 2, UAL: 3, FAL: 4, UAR: 5, FAR: 6, THL: 7, SHL: 8, THR: 9, SHR: 10, RIFLE: 11 };

// Joint positions shared with the shader (metres, rest pose).
export const DIM = { hip: 0.945, hipX: 0.095, knee: 0.505, ankle: 0.065, spine: 1.0, neck: 1.52, shX: 0.2, shY: 1.43, upper: 0.29, fore: 0.27 };

const C = (h) => new THREE.Color(h);

const PAL = {
  german: {
    tunic: C(0x586155), trousers: C(0x535a4e), boot: C(0x2b2622), shinLo: C(0x2b2622), helmet: C(0x4a524d),
    web: C(0x3b2d20), pack: C(0x6b6955), bag: C(0x7a7457), canister: C(0x616a5f), wood: C(0x6a4a2c),
    steel: C(0x2d2f30), tin: C(0x5b5f52), roll: C(0x6e6a57), collar: C(0x4c5449),
  },
  british: {
    tunic: C(0x7b7355), trousers: C(0x766e51), boot: C(0x2a2420), shinLo: C(0x6a6346), helmet: C(0x656850),
    web: C(0x8d8a6b), pack: C(0x77734f), bag: C(0x7d7a59), canister: C(0x7a7656), wood: C(0x5e3f27),
    steel: C(0x2d2f30), tin: C(0x9aa0a4), roll: C(0x6d684a), collar: C(0x726a4e),
  },
};
const SKIN = [C(0xc39a7f), C(0xb98a6c), C(0xcaa388)];

// ---------------------------------------------------------------- primitives

function tag(g, part, color, kit = 0) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), p = new Float32Array(n).fill(part), kt = new Float32Array(n).fill(kit);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(p, 1));
  g.setAttribute('aKit', new THREE.BufferAttribute(kt, 1));
  return g;
}

// Cylinder between y0 and y1 (r0 at the top), optional elliptical scale and offset.
const cyl = (r0, r1, y0, y1, seg, x = 0, z = 0, sx = 1, sz = 1, open = false) =>
  new THREE.CylinderGeometry(r0, r1, y1 - y0, seg, 1, open).scale(sx, 1, sz).translate(x, (y0 + y1) / 2, z);
const ell = (rx, ry, rz, x, y, z, w = 8, h = 6) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
const bx = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return g.translate(x, y, z);
};
const lathe = (pts, seg, sx = 1, sz = 1, x = 0, z = 0) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(sx, 1, sz).translate(x, 0, z);

// Smooth solid through superelliptic rings stacked along +Y (torso and pelvis).
function loft(rings, n) {
  const pos = [], idx = [];
  for (const R of rings) {
    const e = 2 / (R.ex || 2.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push((R.cx || 0) + Math.sign(c) * Math.abs(c) ** e * R.rx, R.y, (R.cz || 0) + Math.sign(s) * Math.abs(s) ** e * R.rz);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const top = rings[rings.length - 1], bot = rings[0];
  pos.push(top.cx || 0, top.y, top.cz || 0, bot.cx || 0, bot.y, bot.cz || 0);
  const tc = pos.length / 3 - 2, bc = tc + 1;
  const K = (rings.length - 1) * n;
  for (let i = 0; i < n; i++) { idx.push(K + i, tc, K + ((i + 1) % n)); idx.push(i, ((i + 1) % n), bc); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the man

/**
 * Build the merged rest-pose geometry for a side ('german' | 'british') at a detail level (0 full,
 * 1 low: fewer segments and no small kit, used beyond about 100 m where the shader enlarges the men).
 */
export function buildSoldier(side, lod = 0) {
  const P = PAL[side], de = side === 'german', lo = lod > 0;
  const sg = lo ? 5 : 8; // radial segments of limbs
  const skin = SKIN[0];
  const L = [];
  const add = (g, part, color, kit = 0) => L.push(tag(g, part, color, kit));
  const { hip, hipX, knee, ankle, shX, shY } = DIM;

  // ---- pelvis: trousers seat, belt, belt kit
  add(loft([
    { y: 0.84, rx: 0.12, rz: 0.09 }, { y: 0.9, rx: 0.155, rz: 0.108 }, { y: 0.98, rx: 0.16, rz: 0.11 }, { y: 1.02, rx: 0.15, rz: 0.104 },
  ], sg + 1), PART.PELVIS, P.trousers);
  add(cyl(0.162, 0.162, 0.97, 1.03, sg + 3, 0, 0, 1, 0.7), PART.PELVIS, P.web); // belt
  if (de) {
    if (!lo) {
      for (const s of [-1, 1]) add(bx(0.075, 0.1, 0.05, s * 0.075, 0.99, -0.125), PART.PELVIS, P.web); // cartridge pouches
      add(bx(0.06, 0.2, 0.2, -0.19, 0.9, 0.06), PART.PELVIS, P.bag); // bread bag
      add(bx(0.03, 0.34, 0.07, 0.17, 0.82, 0.07, 0, 0, 0.04), PART.PELVIS, P.steel, 4); // spade
    }
    for (const s of [-1, 1]) { // stick grenades in the belt: handle below, tin head above
      add(cyl(0.015, 0.015, 0.84, 1.09, 5, s * 0.055, -0.14), PART.PELVIS, P.wood, 3);
      add(cyl(0.04, 0.04, 1.07, 1.17, 6, s * 0.055, -0.14), PART.PELVIS, P.tin, 3);
    }
  } else {
    if (!lo) {
      for (const s of [-1, 1]) add(bx(0.1, 0.09, 0.05, s * 0.085, 0.99, -0.125), PART.PELVIS, P.web); // ammunition pouches
      add(cyl(0.045, 0.045, 0.8, 0.98, 6, 0.19, 0.04), PART.PELVIS, P.bag); // water bottle
      add(bx(0.2, 0.2, 0.07, -0.14, 0.94, 0.12), PART.PELVIS, P.bag); // haversack
      add(bx(0.03, 0.34, 0.05, 0.18, 0.84, 0.08), PART.PELVIS, P.wood, 4); // entrenching tool helve
    }
  }

  // ---- torso: tunic, shoulders, webbing, packs
  add(loft([
    { y: 1.0, rx: 0.15, rz: 0.1 }, { y: 1.1, rx: 0.16, rz: 0.108 }, { y: 1.24, rx: 0.176, rz: 0.118, cz: -0.004 },
    { y: 1.36, rx: 0.195, rz: 0.118 }, { y: 1.45, rx: 0.17, rz: 0.1 }, { y: 1.5, rx: 0.08, rz: 0.07 }, { y: 1.53, rx: 0.05, rz: 0.05 },
  ], sg + 1), PART.TORSO, P.tunic);
  for (const s of [-1, 1]) add(ell(0.062, 0.058, 0.062, s * shX, shY - 0.005, 0, 6, 5), PART.TORSO, P.tunic);
  add(cyl(0.062, 0.07, 1.5, 1.545, sg, 0, 0.005), PART.TORSO, P.collar); // collar
  if (de) {
    add(cyl(0.055, 0.055, 0.92, 1.14, 7, 0, -0.165, 1, 0.8), PART.TORSO, P.canister, 2); // gas mask canister at the chest
    add(bx(0.32, 0.27, 0.12, 0, 1.24, 0.165), PART.TORSO, P.pack, 1); // assault pack
    add(cyl(0.055, 0.055, -0.17, 0.17, 6, 0, 0, 1, 1).rotateZ(Math.PI / 2).translate(0, 1.42, 0.165), PART.TORSO, P.roll, 1); // rolled Zeltbahn
    if (!lo) for (const s of [-1, 1]) add(bx(0.035, 0.38, 0.012, s * 0.09, 1.25, -0.12, 0, 0, s * 0.08), PART.TORSO, P.web); // Y-straps
  } else {
    for (const s of [-1, 1]) add(bx(0.045, 0.46, 0.012, s * 0.08, 1.25, -0.124, 0, 0, -s * 0.12), PART.TORSO, P.web); // braces
    add(bx(0.22, 0.2, 0.09, 0, 1.2, -0.158), PART.TORSO, P.canister, 2); // small box respirator haversack at the chest
    if (!lo) for (const s of [-1, 1]) add(bx(0.115, 0.09, 0.05, s * 0.1, 1.05, -0.135), PART.TORSO, P.web); // ammunition pouches (front)
    add(bx(0.28, 0.25, 0.1, 0, 1.24, 0.16), PART.TORSO, P.pack, 1); // small pack
    add(cyl(0.045, 0.045, -0.15, 0.15, 6, 0, 0).rotateZ(Math.PI / 2).translate(0, 1.4, 0.17), PART.TORSO, P.roll, 1); // rolled groundsheet
  }

  // ---- head: neck, face, helmet
  add(cyl(0.05, 0.055, 1.5, 1.58, 6), PART.HEAD, skin);
  add(ell(0.083, 0.105, 0.095, 0, 1.635, -0.012, lo ? 6 : 9, lo ? 4 : 7), PART.HEAD, skin);
  if (de) { // Stahlhelm: deep skirt, neck guard, short peak
    add(lathe([[0.135, 1.6], [0.134, 1.64], [0.122, 1.7], [0.075, 1.752], [0.0, 1.77]], lo ? 7 : 10, 1, 1.06, 0, -0.005), PART.HEAD, P.helmet);
    add(bx(0.24, 0.07, 0.04, 0, 1.612, 0.125, 0.45), PART.HEAD, P.helmet);
    add(bx(0.2, 0.012, 0.06, 0, 1.665, -0.155, -0.12), PART.HEAD, P.helmet);
  } else { // Brodie: shallow dish with a wide brim
    add(lathe([[0.178, 1.648], [0.172, 1.66], [0.108, 1.685], [0.1, 1.71], [0.065, 1.745], [0.0, 1.757]], lo ? 8 : 12, 1, 1.05), PART.HEAD, P.helmet);
    if (!lo) add(lathe([[0.172, 1.652], [0.1, 1.655]], 12, 1, 1.05), PART.HEAD, P.helmet);
  }

  // ---- arms (upper arm then forearm and fist), left -X, right +X
  for (const s of [-1, 1]) {
    const ua = s < 0 ? PART.UAL : PART.UAR, fa = s < 0 ? PART.FAL : PART.FAR;
    add(cyl(0.052, 0.044, shY - DIM.upper, shY + 0.01, sg, s * shX), ua, P.tunic);
    const y1 = shY - DIM.upper, y2 = y1 - DIM.fore;
    add(cyl(0.045, 0.036, y2, y1 + 0.005, sg, s * shX), fa, P.tunic);
    add(ell(0.036, 0.048, 0.042, s * shX, y2 - 0.035, -0.003, 6, 5), fa, skin);
  }

  // ---- legs: thigh, shin with boot or puttee, and the boot
  for (const s of [-1, 1]) {
    const th = s < 0 ? PART.THL : PART.THR, sh = s < 0 ? PART.SHL : PART.SHR, x = s * hipX;
    add(cyl(0.088, 0.066, knee, hip + 0.03, sg, x), th, P.trousers);
    add(cyl(0.068, 0.062, knee - 0.1, knee, sg, x), sh, P.trousers);
    add(cyl(0.062, 0.05, ankle + 0.02, knee - 0.1, sg, x), sh, de ? P.shinLo : P.shinLo);
    if (!de) add(cyl(0.066, 0.066, ankle + 0.1, ankle + 0.13, sg, x), sh, P.trousers); // puttee turn
    add(bx(0.1, 0.085, 0.2, x, 0.045, -0.05), sh, P.boot);
    add(ell(0.05, 0.04, 0.07, x, 0.045, -0.15, 6, 4), sh, P.boot);
  }

  // ---- rifle: butt at the origin, along +Y (butt plate, stock, action, barrel, bayonet)
  add(bx(0.04, 0.5, 0.075, 0, 0.25, 0), PART.RIFLE, P.wood);
  add(bx(0.036, 0.1, 0.05, 0, 0.47, -0.01), PART.RIFLE, P.steel);
  add(cyl(0.017, 0.02, 0.5, 0.86, 5, 0, -0.012), PART.RIFLE, P.wood);
  add(cyl(0.01, 0.012, 0.86, de ? 1.22 : 1.1, 5, 0, -0.012), PART.RIFLE, P.steel);
  if (!de) add(bx(0.012, 0.42, 0.034, 0, 1.31, -0.04), PART.RIFLE, P.tin); // 17-inch bayonet, fixed

  const g = mergeGeometries(L, false);
  for (const x of L) x.dispose();
  g.computeBoundingSphere();
  return g;
}

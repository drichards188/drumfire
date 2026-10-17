import * as THREE from 'three';
import { V, box, xTube, zTube, rod, zLathe, sideProfile, topProfile, mergeAll } from '../../kit.js';

// The German strategic weapons in flight (DESIGN.md "WW2 mode"), built like models/shells.js shells: along Z
// with the nose toward -Z, centred on the middle, one merged geometry per material, materials cached and
// shared. buildMissile(kind) -> { parts: [{ geometry, material }], length, radius }; buildShell('v1' | 'v2')
// delegates here. The launch sites (v1.js, v2.js) take the same pieces through v1Pieces() / a4Pieces() so
// the missile on the ramp or the Meillerwagen is the one that flies.
//   v1  Fieseler Fi 103 A-1: 8.32 m overall (the Argus As 014 pulse jet's tail pipe is the aft end),
//       5.37 m span, fuselage 0.85 m across; wings two panels slid onto the spar tube through the fuel tank.
//       Painted RLM 02 grey-green, the jet left bare and burnt.
//   v2  A4: 14.0 m, 1.65 m body, 3.56 m across the fins, the operational dark green with a few stencils.

export const MISSILE_KINDS = ['v1', 'v2'];

const matCache = new Map();
const mat = (key, color, rough, metal, extra = {}) => {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
};
export const MM = {
  v1paint: () => mat('v1paint', 0x7c8370, 0.6, 0.25), // RLM 02 grey-green
  v1jet: () => mat('v1jet', 0x3e3933, 0.55, 0.7), // the pulse jet tube, heat-darkened steel
  v1grid: () => mat('v1grid', 0x8a7a5c, 0.45, 0.8), // the intake's shutter grid and the air log, bare metal
  a4paint: () => mat('a4paint', 0x3b4533, 0.62, 0.15), // operational dark green
  a4grey: () => mat('a4grey', 0x6b7064, 0.6, 0.15), // the grey-green control vanes and the joint band
  white: () => mat('white', 0xd6d6c8, 0.7, 0.05), // stencils
  dark: () => mat('dark', 0x18191a, 0.5, 0.4), // nozzles, holes, the jet vanes
};

// ---------------------------------------------------------------- V-1

export const V1 = { L: 8.32, span: 5.37, R: 0.425, jetY: 0.8, wingS: 3.08, chord: 0.94 };
const v1z = (s) => s - V1.L / 2; // s: metres from the nose

// The fuselage radius at s metres from the nose: a blunt ogive over the warhead, the cylindrical fuel tank, then
// the long taper of the tail cone ending at about 7 m (the jet pipe runs on beyond it).
const V1R = [[0, 0.04], [0.12, 0.12], [0.35, 0.21], [0.7, 0.3], [1.1, 0.37], [1.6, 0.415], [2.0, 0.425], [4.7, 0.425], [5.2, 0.41], [5.8, 0.36], [6.4, 0.27], [6.85, 0.18], [7.08, 0.12], [7.1, 0.0]];

// One wing panel in its own frame: origin at the root on the spar axis (fuselage side), span along +x
// (side = +1) or -x, leading edge toward -Z. Constant chord with rounded tips; a thin aerofoil slab with a
// round leading edge.
function v1WingPanel(side) {
  const c = V1.chord, sp = V1.span / 2 - V1.R + 0.04, t = 0.11, le = -c * 0.35, te = c * 0.65, k = side;
  const pts = [[0, le], [sp - 0.18, le], [sp - 0.05, le + 0.08], [sp, le + 0.3], [sp - 0.02, te - 0.12], [sp - 0.12, te], [0, te]];
  const g = [topProfile(pts.map(([x, z]) => [k * x, z]), -t / 2, t / 2), xTube(0, k * (sp - 0.15), t / 2, t / 2 * 0.9, 8, 0, le)];
  // a thinner lip along the trailing edge that catches the light
  g.push(topProfile([[0, te - 0.2], [sp - 0.1, te - 0.2], [sp - 0.12, te], [0, te]].map(([x, z]) => [k * x, z]), -t / 2 - 0.005, -t / 2 + 0.02));
  return mergeAll(g);
}

// The V-1's parts by material, without the wings: { v1paint, v1jet, v1grid, dark } geometry lists in the missile
// frame; wing(side) gives a wing panel in its own frame and wingAt the place of its root on the fuselage.
export function v1Pieces() {
  const paint = [], jet = [], grid = [], dark = [];
  paint.push(zLathe(V1R.map(([s, r]) => [v1z(s), r]), 28));
  // the air log: a small two-bladed propeller on a spindle at the nose (it counted the distance flown)
  grid.push(zTube(v1z(-0.12), v1z(0.06), 0.012, 0.03, 8), zTube(v1z(-0.16), v1z(-0.12), 0.0, 0.02, 8));
  for (const a of [0, Math.PI]) grid.push(box(0.17, 0.02, 0.008, Math.cos(a) * 0.09, Math.sin(a) * 0.09, v1z(-0.1), 0, 0, a + 0.3));
  // seams between the sections: warhead / fuel tank / compressed air spheres / tail
  for (const s of [1.95, 4.35, 5.55]) paint.push(zTube(v1z(s - 0.012), v1z(s + 0.012), Math.min(0.432, rAt(V1R, s) + 0.008), Math.min(0.432, rAt(V1R, s) + 0.008), 28, 0, 0, true));
  // the launch lug under the belly (the catapult's piston pushed on it) and the filler cap on top
  paint.push(sideProfile([[v1z(3.3), -0.36], [v1z(3.6), -0.5], [v1z(3.75), -0.5], [v1z(3.75), -0.36]], 0.05));
  dark.push(zTube(v1z(2.6), v1z(2.62), 0.06, 0.06, 10, 0, 0.42));
  // the pulse jet: the bell of the intake with its shutter grid, the combustion chamber, the long tail pipe
  const J = V1.jetY, s0 = V1.L - 3.48;
  jet.push(zLathe([[v1z(s0), 0.26], [v1z(s0 + 0.08), 0.29], [v1z(s0 + 0.5), 0.29], [v1z(s0 + 0.95), 0.26], [v1z(s0 + 1.5), 0.2], [v1z(s0 + 2.3), 0.19], [v1z(V1.L - 0.02), 0.205], [v1z(V1.L), 0.2]].map(([z, r]) => [z, r]), 24).translate(0, J, 0));
  grid.push(zTube(v1z(s0 - 0.02), v1z(s0 + 0.02), 0.27, 0.27, 24, 0, J));
  dark.push(zTube(v1z(s0 + 0.01), v1z(s0 + 0.03), 0.25, 0.25, 20, 0, J)); // the shutter grid seen as a dark disc
  for (let i = -3; i <= 3; i++) grid.push(box(0.5 * Math.sqrt(1 - (i / 4) ** 2), 0.012, 0.02, 0, J + i * 0.065, v1z(s0 - 0.03)));
  dark.push(zTube(v1z(V1.L - 0.01), v1z(V1.L + 0.001), 0.18, 0.18, 18, 0, J)); // the open pipe end
  // bands round the tube where it was assembled
  for (const s of [s0 + 0.95, s0 + 1.9]) jet.push(zTube(v1z(s - 0.025), v1z(s + 0.025), 0.215, 0.215, 20, 0, J));
  // the front pylon (a streamlined strut from the fuel tank's top to the jet) and the fin, which carries the pipe
  paint.push(sideProfile([[v1z(4.9), 0.38], [v1z(5.0), J - 0.2], [v1z(5.45), J - 0.2], [v1z(5.55), 0.36]], 0.07));
  paint.push(sideProfile([[v1z(6.25), 0.2], [v1z(6.55), J - 0.17], [v1z(7.45), J - 0.17], [v1z(7.6), 0.62], [v1z(7.45), 0.0], [v1z(7.08), 0.0], [v1z(6.6), 0.15]], 0.05));
  // the tailplane: a plain rectangle across the tail cone below the pipe
  paint.push(topProfile([[-1.0, v1z(6.55)], [1.0, v1z(6.55)], [1.0, v1z(7.12)], [-1.0, v1z(7.12)]], -0.025, 0.025));
  paint.push(xTube(-1.0, 1.0, 0.026, 0.026, 8, 0, v1z(6.56)));
  const wingAt = (side) => V(side * (V1.R - 0.04), 0, v1z(V1.wingS + V1.chord * 0.35));
  return { lists: { v1paint: paint, v1jet: jet, v1grid: grid, dark }, wing: v1WingPanel, wingAt };
}

function rAt(tab, s) {
  for (let i = 0; i < tab.length - 1; i++) if (s >= tab[i][0] && s <= tab[i + 1][0]) return tab[i][1] + (tab[i + 1][1] - tab[i][1]) * (s - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
  return tab[tab.length - 1][1];
}

// ---------------------------------------------------------------- A4 (V-2)

export const A4 = { L: 14.0, R: 0.825, fin: 1.78, lox: [3.75, 7.0] }; // lox: the oxidizer tank's zone, metres above the base
const a4z = (s) => s - A4.L / 2;

// The A4 outline at s metres from the nose: the long ogive over the warhead and the instrument compartment, the
// cylindrical tank section (alcohol forward, liquid oxygen aft), the tapering tail round the motor.
const A4R = [[0, 0.02], [0.15, 0.1], [0.5, 0.21], [1.0, 0.33], [1.6, 0.45], [2.2, 0.56], [3.0, 0.67], [3.8, 0.76], [4.5, 0.81], [5.0, 0.825], [10.3, 0.825], [11.0, 0.8], [12.0, 0.73], [13.0, 0.64], [13.9, 0.555], [14.0, 0.55]];

// The A4's parts by material in the missile frame: { a4paint, a4grey, white, dark }. `fins` at the given
// roll angle of the first fin (0: fins on +-X and +-Y).
export function a4Pieces(roll = 0) {
  const paint = [], grey = [], white = [], dark = [];
  paint.push(zLathe(A4R.map(([s, r]) => [a4z(s), r]), 36));
  // the motor's nozzle in the base and the four graphite jet vanes in its mouth
  dark.push(zLathe([[a4z(13.25), 0.12], [a4z(13.6), 0.28], [a4z(13.98), 0.37], [a4z(14.0), 0.53]], 24));
  dark.push(zTube(a4z(13.96), a4z(14.01), 0.53, 0.53, 24));
  for (let i = 0; i < 4; i++) {
    const a = roll + i * Math.PI / 2;
    dark.push(box(0.04, 0.24, 0.3, Math.cos(a) * 0.3, Math.sin(a) * 0.3, a4z(13.95), 0, 0, a + Math.PI / 2));
  }
  // the band at the joint of the instrument compartment and the tank section, and a stencil band forward
  grey.push(zTube(a4z(3.42), a4z(3.5), 0.7787, 0.7837, 36, 0, 0, true));
  white.push(zTube(a4z(10.2), a4z(10.26), 0.828, 0.828, 36, 0, 0, true));
  // stencils: small white rectangles on the tank section and the tail (handling marks, the round's number)
  for (const [s, a, w, h] of [[6.0, 0.4, 0.5, 0.18], [6.3, 0.4, 0.3, 0.1], [8.5, 0.4 + Math.PI, 0.6, 0.14], [11.4, Math.PI * 0.25, 0.3, 0.12]]) {
    const r = rAt(A4R, s) + 0.004;
    white.push(box(w, h, 0.004, 0, 0, 0).rotateX(0).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).translate(r, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(roll + a)).translate(0, 0, a4z(s)));
  }
  // four fins: a curved, swept leading edge from the tail's shoulder out to a tip that runs straight back to
  // the base; the control vane at each tip's trailing edge and the antenna rod on it
  const fin = [[0.58, 13.99], [0.62, 12.8], [0.72, 11.6], [0.8, 10.5], [1.05, 11.0], [1.33, 11.6], [1.58, 12.3], [1.74, 12.85], [1.78, 13.2], [1.78, 13.99]];
  for (let i = 0; i < 4; i++) {
    const a = roll + i * Math.PI / 2, rad = V(Math.cos(a), Math.sin(a), 0), tan = V(Math.sin(a), -Math.cos(a), 0);
    const basis = new THREE.Matrix4().makeBasis(rad, V(0, 0, 1), tan);
    const sh = new THREE.Shape(fin.map(([u, s]) => new THREE.Vector2(u, a4z(s))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -0.035).applyMatrix4(basis);
    paint.push(g);
    const vane = new THREE.ExtrudeGeometry(new THREE.Shape([[1.42, 13.55], [1.79, 13.55], [1.79, 14.0], [1.42, 14.0]].map(([u, s]) => new THREE.Vector2(u, a4z(s)))), { depth: 0.1, bevelEnabled: false });
    grey.push(vane.translate(0, 0, -0.05).applyMatrix4(basis));
    dark.push(rod(rad.clone().multiplyScalar(1.8).setZ(a4z(13.3)), rad.clone().multiplyScalar(1.8).setZ(a4z(14.15)), 0.012, 5));
  }
  return { lists: { a4paint: paint, a4grey: grey, white, dark } };
}

// ---------------------------------------------------------------- flight models

export const MISSILE_EXHAUST = {
  v1: { x: 0, y: V1.jetY, z: V1.L / 2 }, // the open end of the pulse jet's tail pipe, above the tail
  v2: { x: 0, y: 0, z: A4.L / 2 }, // the nozzle exit in the base
};

const built = new Map();
export function buildMissile(kind) {
  if (built.has(kind)) return cloneSet(built.get(kind));
  let lists, length, radius;
  if (kind === 'v1') {
    const p = v1Pieces();
    lists = p.lists;
    for (const side of [-1, 1]) lists.v1paint.push(p.wing(side).translate(p.wingAt(side).x, 0, p.wingAt(side).z));
    length = V1.L;
    radius = V1.span / 2;
  } else if (kind === 'v2') {
    lists = a4Pieces(Math.PI / 4).lists;
    length = A4.L;
    radius = A4.fin;
  } else throw new Error('unknown missile kind ' + kind);
  const parts = [];
  for (const [key, list] of Object.entries(lists)) if (list.length) {
    const g = mergeAll(list);
    g.computeBoundingSphere();
    parts.push({ geometry: g, material: MM[key]() });
  }
  const set = { parts, length, radius };
  built.set(kind, set);
  return cloneSet(set);
}
// callers may dispose what they get, so every call returns its own geometries (the materials stay shared)
const cloneSet = (s) => ({ parts: s.parts.map((p) => ({ geometry: p.geometry.clone(), material: p.material })), length: s.length, radius: s.radius });

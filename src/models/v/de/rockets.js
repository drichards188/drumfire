import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The rockets of the two WW2 rocket batteries added to the German tree on 2026-11-01, in the shape models/shells.js
 * returns ({ parts: [{ geometry, material }], length, radius }, along Z, nose toward -Z, centred), so shells.js can
 * hand them out as its own kinds and the launchers' models can show them in their tubes and crates.
 *   nbw42   21 cm Wurfgranate 42: 1.25 m, 210 mm, 110 kg (Wikipedia, "21 cm Nebelwerfer 42"). Unlike the 15 cm round
 *           the HE head is in front: a plain cylinder with a blunt ogive and the nose fuze; the motor behind it, the
 *           nozzle plate at the base with its ring of 22 canted venturis round the rim.
 *   swg40   28 cm Wurfkörper Spreng: 82 kg, about 1.19 m. The bulbous 280 mm warhead (50 kg of TNT, a short
 *           artillery-type nose fuze, a pink band) on the 15 cm motor tube (158 mm) whose base carries the nozzles;
 *           the head narrows to the motor in a short taper.
 * buildRocket(kind, seg) -> { parts, length, radius }
 */
const mats = new Map();
const paint = (c, rough = 0.62, metal = 0.12) => {
  const k = c + ':' + rough + ':' + metal;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  return mats.get(k);
};
const merge = (gs) => { const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x))); g.computeBoundingSphere(); return g; };
// a solid of revolution from [s, r] pairs (s from the base toward the nose), laid along Z with the nose at -Z, centred
const revolve = (pts, L, n) => new THREE.LatheGeometry(pts.map(([s, r]) => new THREE.Vector2(Math.max(r, 1e-4), s - L / 2)), n).rotateX(-Math.PI / 2);
const done = (parts, length, radius) => ({ parts: parts.filter((p) => p.geometry.attributes.position.count), length, radius });

// the nozzle mouths on the base plate: n small dark discs on a ring of radius rr, canted for the spin
function nozzles(n, rr, r, L, cant) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(new THREE.CylinderGeometry(r, r, 0.006, 6).rotateX(Math.PI / 2).rotateY(cant).translate(Math.cos(a) * rr, Math.sin(a) * rr, L / 2 + 0.001));
  }
  return out;
}

const BUILD = {
  nbw42(seg) {
    const L = 1.25, R = 0.105, n = Math.max(8, seg);
    // the base: a rim round the nozzle plate, the motor body, the joint to the head at 0.62, the head and its ogive
    const body = [revolve([[0, 0.088], [0.004, 0.1], [0.012, R], [0.6, R], [0.6, R - 0.003], [0.625, R - 0.003], [0.625, R], [0.98, R],
      [1.03, 0.101], [1.08, 0.092], [1.13, 0.077], [1.17, 0.058], [1.195, 0.04], [1.2, 0.034]], L, n)];
    const band = [revolve([[0.86, R + 0.0008], [0.9, R + 0.0008]], L, n)]; // the stencilled band round the head
    const fuze = [revolve([[1.2, 0.03], [1.225, 0.026], [1.24, 0.016], [L, 0]], L, Math.max(8, n >> 1))];
    const dark = seg >= 16 ? nozzles(22, 0.072, 0.009, L, 0.28) : [];
    dark.push(revolve([[0, 0], [0.001, 0.03], [0.002, 0.03]], L, 10)); // the igniter socket in the middle of the plate
    return done([
      { geometry: merge(body), material: paint(0x5a5f52) },
      { geometry: merge(band), material: paint(0x2a2b27) },
      { geometry: merge(fuze), material: paint(0x8a8c88, 0.4, 0.6) },
      { geometry: merge(dark), material: paint(0x161616, 0.9, 0) },
    ], L, R);
  },
  swg40(seg) {
    const L = 1.19, R = 0.14, r = 0.079, n = Math.max(8, seg);
    const motor = [revolve([[0, 0.066], [0.006, r], [0.6, r], [0.61, r + 0.004], [0.63, r + 0.004]], L, n)];
    // the head: from the motor's collar out to 280 mm, the cylindrical belly, the blunt ogive to the fuze seat
    const head = [revolve([[0.63, r + 0.004], [0.66, 0.1], [0.7, 0.122], [0.75, 0.135], [0.8, R], [0.95, R], [1.01, 0.132], [1.06, 0.115],
      [1.1, 0.092], [1.13, 0.068], [1.15, 0.045], [1.155, 0.036]], L, n)];
    const band = [revolve([[0.86, R + 0.0008], [0.892, R + 0.0008]], L, n)]; // the HE's pink band (TTT: 1 1/4 in)
    const fuze = [revolve([[1.155, 0.034], [1.17, 0.03], [1.182, 0.018], [L, 0]], L, Math.max(8, n >> 1))];
    const dark = seg >= 16 ? nozzles(26, 0.056, 0.0065, L, 0.24) : [];
    dark.push(revolve([[0, 0], [0.001, 0.022], [0.002, 0.022]], L, 10));
    return done([
      { geometry: merge(motor), material: paint(0x4f5449) },
      { geometry: merge(head), material: paint(0x5a5f52) },
      { geometry: merge(band), material: paint(0xc8869a, 0.7, 0) },
      { geometry: merge(fuze), material: paint(0x8a8c88, 0.4, 0.6) },
      { geometry: merge(dark), material: paint(0x161616, 0.9, 0) },
    ], L, R);
  },
};

export const ROCKET_KINDS = Object.keys(BUILD);
export function buildRocket(kind, seg = 24) {
  const b = BUILD[kind];
  if (!b) throw new Error('unknown rocket kind ' + kind);
  return b(seg);
}

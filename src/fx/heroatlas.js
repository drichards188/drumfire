import { noise3 } from '../noise.js';

// The max-quality battery's puff atlas (shots/maxq/PLAN.md 3.7, W2 of the effects audit): eight tiles in a 4x2 grid,
// for the hero gun's smoke, dust and earth only (every other puff keeps fx/atlas.js). The old atlas takes its normals
// from the gradient of a density that is clamped to 1 over most of the tile, so a puff is flat inside and the sun lights
// it evenly: a cloud reads as a pile of discs. Here the shape and the light come from a thickness field instead:
//   h = dome^0.8 * (0.55 + 0.85 * billows)   (a hemisphere carrying billows of |noise|, softened; 0 at the rim)
// rg = the billboard-space normal of h (bumps lit on the sun's side, creases dark), b = the thickness h (the shader
// darkens the thick middle of a puff turned away from the sun and lets the light through its thin rim), a = density,
// which reaches 1 only in the inner third and is ragged and translucent towards the edge.
// Tiles 0 to 5 are smoke (0, 1 dense round billows, 2, 3 broken ones, 4, 5 torn wisps); 6 and 7 are dirt (thrown earth:
// granular clumps with holes), for the spray. Pure (no three, no DOM): node can dump it to a picture.
export const HERO_TILES = 8, HERO_SMOKE_TILES = 6;

export function makeHeroAtlasData(size = 256) {
  const W = size * 4, H = size * 2;
  const data = new Uint8Array(W * H * 4);
  const n = size * size;
  const hgt = new Float32Array(n), den = new Float32Array(n), bil = new Float32Array(n), rad = new Float32Array(n), r0a = new Float32Array(n), fin = new Float32Array(n), tmp = new Float32Array(n);
  for (let tile = 0; tile < 8; tile++) {
    const o = 11.7 + tile * 23.9;
    const dirt = tile >= 6, torn = tile >= 4 && !dirt, broken = tile >= 2 && tile < 4;
    let lo = 9, hi = -9;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size, v = (y + 0.5) / size, i = y * size + x;
        const r0 = Math.hypot(u - 0.5, v - 0.5) / 0.5;
        // a lumpy outline: the radius warped by low-frequency noise (more for the torn and the dirt tiles)
        const warp = torn ? 0.42 : dirt ? 0.36 : 0.26;
        let r = r0 * (1 + warp * noise3(u * 2.3 + o, v * 2.3 - o, 0.7 + tile * 0.37));
        // billows: the sum of |noise| (rounded bumps with sharp creases between them, cauliflower; 1 - |noise| would
        // be ridges, which light up like crumpled rock), three octaves for the shape and the light
        let b = 0, amp = 0.55, f = torn ? 2.0 : 2.4;
        for (let k = 0; k < 3; k++) {
          b += amp * Math.abs(noise3(u * f + o, v * f - o * 0.5, k * 2.9 + tile * 1.3));
          amp *= 0.42;
          f *= 2.1;
        }
        // and two fine octaves that only fray the density at the edge
        let e = 0;
        for (let k = 0; k < 2; k++) e += (k ? 0.35 : 0.65) * noise3(u * (9 + 9 * k) - o, v * (9 + 9 * k) + o, 5.3 + k + tile);
        fin[i] = e;
        bil[i] = b; rad[i] = r; r0a[i] = r0;
        if (r < 0.9) { if (b < lo) lo = b; if (b > hi) hi = b; }
      }
    }
    const span = Math.max(1e-3, hi - lo);
    for (let i = 0; i < n; i++) {
      const b = Math.min(1, Math.max(0, (bil[i] - lo) / span)), r = rad[i], r0 = r0a[i];
      // fades to nothing before the tile's edge, warped outline or not
      const edge = Math.min(1, Math.max(0, (1 - r) * 3.5)) * Math.min(1, Math.max(0, (0.97 - r0) * 7));
      const dome = Math.sqrt(Math.max(0, 1 - r * r));
      let d;
      if (dirt) {
        // thrown earth: clumps of a few pixels with holes between, denser to the middle
        const x = (i % size) / size, y = Math.floor(i / size) / size;
        const g = 0.5 + 0.5 * noise3(x * 15 + o, y * 15 - o, 3.3 + tile) + 0.25 * noise3(x * 34 - o, y * 34 + o, 7.1);
        const core = 1 - Math.pow(r, 1.3);
        d = sstep(0.38, 0.62, g * (0.55 + 0.6 * core) + (b - 0.5) * 0.5) * sstep(0, 0.35, core);
      } else {
        // a body that fills its inner part whatever the billows do (the light shows them), frayed at the rim by
        // the billows and the fine noise; the torn tiles fray from further in
        const core = 1 - Math.pow(r, torn ? 1.3 : 1.7);
        d = sstep(0, 1, core * 1.15 - (torn ? 0.28 : broken ? 0.18 : 0.1) + (b - 0.5) * (torn ? 0.8 : broken ? 0.6 : 0.4) + fin[i] * (0.06 + (torn ? 0.4 : 0.25) * r));
      }
      d *= edge;
      den[i] = d;
      // the thickness: a dome carrying the billows, thinned where the density is low (holes have no thickness)
      hgt[i] = Math.pow(dome, 0.8) * (0.55 + 0.85 * b) * Math.min(1, d * 1.6);
    }
    const ox = (tile % 4) * size, oy = Math.floor(tile / 4) * size;
    const at = (a, xx, yy) => a[Math.min(size - 1, Math.max(0, yy)) * size + Math.min(size - 1, Math.max(0, xx))];
    // soften the thickness (two passes of a separable box, radius size/96): the light then rolls over the billows
    const br = Math.max(1, Math.round(size / 96));
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let a = 0; for (let k = -br; k <= br; k++) a += at(hgt, x + k, y); tmp[y * size + x] = a / (2 * br + 1); }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let a = 0; for (let k = -br; k <= br; k++) a += at(tmp, x, y + k); hgt[y * size + x] = a / (2 * br + 1); }
    }
    // normals of the thickness field, per tile radius (half a tile): a dome's rim tilts well over
    const gk = 0.5 * (size / 2) * 0.55;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (at(hgt, x + 1, y) - at(hgt, x - 1, y)) * gk;
        const gy = (at(hgt, x, y + 1) - at(hgt, x, y - 1)) * gk;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const j = ((oy + y) * W + ox + x) * 4;
        data[j] = (-gx * inv * 0.5 + 0.5) * 255;
        data[j + 1] = (-gy * inv * 0.5 + 0.5) * 255;
        data[j + 2] = Math.min(1, at(hgt, x, y) / 1.2) * 255;
        data[j + 3] = at(den, x, y) * 255;
      }
    }
  }
  return { data, W, H };
}

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

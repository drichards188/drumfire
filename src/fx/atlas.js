import { noise3 } from '../noise.js';

// The smoke puff atlas: four tiles in a 2x2 grid. rg = billboard-space normal from the density
// gradient, b = 255, a = density. Each tile is a cauliflower of billows (folded noise) inside a
// lumpy disc, with holes and ragged edges, so a column of them reads as turbulent smoke and not as
// a pile of soft balls. Pure (no three, no DOM): node can dump it to a picture.
export function makeAtlasData(size = 128) {
  const N = size * 2;
  const data = new Uint8Array(N * N * 4);
  for (let tile = 0; tile < 4; tile++) {
    const dens = new Float32Array(size * size), bil = new Float32Array(size * size), rad = new Float32Array(size * size), r0 = new Float32Array(size * size);
    const o = tile * 17.3;
    const wisp = tile >= 2 ? 1 : 0; // two denser tiles, two more ragged ones
    let lo = 9, hi = -9;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size, v = (y + 0.5) / size;
        let r = Math.hypot(u - 0.5, v - 0.5) / 0.5;
        r0[y * size + x] = r;
        r *= 1 + 0.3 * noise3(u * 2.6 + o, v * 2.6, 1.7 + tile);
        // billows: folded noise, bumps with creases between them
        let b = 0, amp = 0.5, f = 3.2;
        for (let k = 0; k < 5; k++) {
          b += amp * (1 - Math.abs(noise3(u * f + o, v * f - o, k * 3.1 + tile)));
          amp *= 0.55;
          f *= 2.05;
        }
        const i = y * size + x;
        bil[i] = b; rad[i] = r;
        if (r < 0.9) { lo = Math.min(lo, b); hi = Math.max(hi, b); }
      }
    }
    for (let i = 0; i < size * size; i++) {
      const b = (bil[i] - lo) / (hi - lo), r = rad[i];
      const core = 1 - r * r;
      let d = (core * 0.7 + (b - 0.5) * (wisp ? 1.6 : 1.2) - 0.08) * 2.0;
      d = Math.max(0, Math.min(1, d)) * Math.min(1, Math.max(0, (1 - r) * 4), Math.max(0, (0.97 - r0[i]) * 6)); // fades to nothing before the tile edge, warped or not
      dens[i] = d * d * (3 - 2 * d);
    }
    const ox = (tile % 2) * size, oy = Math.floor(tile / 2) * size;
    const at = (xx, yy) => dens[Math.min(size - 1, Math.max(0, yy)) * size + Math.min(size - 1, Math.max(0, xx))];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (at(x + 1, y) - at(x - 1, y)) * 3.2;
        const gy = (at(x, y + 1) - at(x, y - 1)) * 3.2;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const i = ((oy + y) * N + ox + x) * 4;
        data[i] = (-gx * inv * 0.5 + 0.5) * 255;
        data[i + 1] = (-gy * inv * 0.5 + 0.5) * 255;
        data[i + 2] = 255;
        data[i + 3] = at(x, y) * 255;
      }
    }
  }
  return { data, N };
}

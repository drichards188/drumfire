// The max crew tier's cloth, leather, paint, metal and wood (crew_maxmat.js samples them): texture layers made from
// typed arrays (no canvas, so a worker makes them, crewWorker.js, the same to the bit as the main thread would), each
// tiling over 0.6 m (the vertex uv is metres / 0.3: the shader halves it), so at 1024 a texel is 0.59 mm, what a 1080p
// screen resolves at half a metre. Two RGBA8 arrays, a layer a surface in crew_hd.js LAYER order:
//   A: rgb the albedo multiplier / 1.25 (0.8 is 1), a the roughness offset (0.5 is none)
//   N: rg the normal's x and y (tangent space), b the cavity's occlusion (1 open), a the height
export const LAYERS = ['wool', 'drill', 'canvas', 'felt', 'leather', 'boot', 'paint', 'metal', 'wood'];

const hash = (x) => { let h = Math.imul((x * 2654435761) | 0, 0x9e3779b1) ^ 0x85ebca6b; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const sm = (t) => t * t * (3 - 2 * t);
// periodic value noise: lattice of P x P cells over the tile, seed s; (x, y) in [0, 1)
function noise(P, s) {
  const L = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) L[i] = hash(i * 7 + s * 104729);
  return (x, y) => {
    const fx = x * P, fy = y * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const x0 = ((ix % P) + P) % P, x1 = (x0 + 1) % P, y0 = ((iy % P) + P) % P, y1 = (y0 + 1) % P;
    const a = L[y0 * P + x0], b = L[y0 * P + x1], c = L[y1 * P + x0], d = L[y1 * P + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
// periodic cellular noise: distance to the nearest of one jittered point a cell, in cell units (0 at a point)
function cells(P, s) {
  const J = new Float32Array(P * P * 2);
  for (let i = 0; i < P * P; i++) { J[i * 2] = hash(i * 3 + s * 7919); J[i * 2 + 1] = hash(i * 5 + s * 6151 + 1); }
  return (x, y) => {
    const fx = x * P, fy = y * P, ix = Math.floor(fx), iy = Math.floor(fy);
    let best = 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ((ix + dx) % P + P) % P, cy = ((iy + dy) % P + P) % P, k = cy * P + cx;
      const px = ix + dx + J[k * 2], py = iy + dy + J[k * 2 + 1], d = (px - fx) ** 2 + (py - fy) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

// each surface: (x, y) in [0, 1) and the pixel's hash -> [height 0..1, albedo multiplier, roughness offset]
function recipes(N) {
  const T = N / 1024; // (lattices in texels at 1024: halved at 512 so the features keep their size in metres)
  const n = (p, s) => noise(Math.max(4, Math.round(p * T)), s);
  const w1 = n(64, 1), w2 = n(256, 2), w3 = n(512, 3), d1 = n(128, 4), d2 = n(512, 5), c1 = n(512, 6), f1 = n(64, 7), f2 = n(256, 8);
  const lc = cells(Math.round(640 * T), 9), lc2 = n(32, 10), bc = cells(Math.round(900 * T), 11), p1 = n(128, 12), p2 = n(512, 13), m1 = n(16, 14), wd = n(48, 15);
  const tw = (x, y, per) => 0.5 + 0.5 * Math.sin(((x + y) * N / (per * T)) * Math.PI * 2);
  return [
    // wool: felted field-grey cloth, heathered fibres over a faint twill
    (x, y, h) => { const t = tw(x, y, 4.5); const H = 0.4 * w1(x, y) + 0.32 * w2(x, y) + 0.18 * w3(x, y) + 0.1 * t; return [H, 0.88 + 0.08 * w2(x, y) + 0.06 * (h - 0.5) + 0.04 * w3(x, y), 0.03 * (w1(x, y) - 0.5)]; },
    // drill: the herringbone of a cotton twill
    (x, y, h) => { const band = Math.floor(x * N / (10 * T)) % 2, t = 0.5 + 0.5 * Math.sin(((band ? x + y : x - y) * N / (3.5 * T)) * Math.PI * 2); const H = 0.6 * t + 0.25 * d1(x, y) + 0.15 * d2(x, y); return [H, 0.93 + 0.08 * t + 0.06 * (h - 0.5), 0]; },
    // canvas: a plain weave
    (x, y, h) => { const a = Math.sin((x * N / (3.2 * T)) * Math.PI), b = Math.sin((y * N / (3.2 * T)) * Math.PI); const t = 0.5 + 0.5 * a * b; const H = 0.6 * t + 0.4 * c1(x, y); return [H, 0.92 + 0.1 * t + 0.06 * (h - 0.5), 0.02 * (t - 0.5)]; },
    // felt: the canteen's cover, soft lumps
    (x, y) => { const H = 0.6 * f1(x, y) + 0.4 * f2(x, y); return [H, 0.92 + 0.12 * f2(x, y), 0]; },
    // belt leather: a pebble grain and slow creases
    (x, y) => { const g = Math.min(1, lc(x, y)); const cr = Math.abs(lc2(x, y) - 0.5) < 0.03 ? 1 : 0; const H = 0.75 * (1 - g * g) - 0.35 * cr; return [H, 0.92 + 0.12 * (1 - g) - 0.1 * cr, 0.08 * g - 0.04 + 0.08 * cr]; },
    // boot leather: a finer grain, glossier where it is worn smooth
    (x, y) => { const g = Math.min(1, bc(x, y)); const H = 0.6 * (1 - g * g) + 0.2 * p1(x, y); return [H, 0.94 + 0.08 * (1 - g), 0.06 * g - 0.05 * p1(x, y)]; },
    // paint: the helmet's orange peel and sand-rough finish
    (x, y, h) => { const H = 0.55 * p1(x, y) + 0.3 * p2(x, y) + 0.15 * h; return [H, 0.95 + 0.06 * p1(x, y) + 0.04 * (h - 0.5), 0.1 * (h - 0.5) + 0.05 * (p2(x, y) - 0.5)]; },
    // metal: buttons and buckles, fine scratches along u
    (x, y, h) => { const s = noise(Math.max(4, Math.round(8 * T)), 16); const H = 0.5 + 0.4 * (m1(x, y) - 0.5) + 0.25 * (h - 0.5) * (s(x, y) > 0.6 ? 1 : 0.2); return [H, 0.95 + 0.05 * m1(x, y), 0.08 * (h - 0.5)]; },
    // wood: the spade's and the grips' grain along u
    (x, y) => { const g = 0.5 + 0.5 * Math.sin((y * N / (6 * T) + wd(x, y) * 3) * Math.PI * 2); const H = 0.4 * g + 0.3 * wd(x, y); return [H, 0.88 + 0.16 * g, 0.05 * (g - 0.5)]; },
  ];
}

// the two arrays at N x N a layer (a generator: it yields a layer at a time)
export function* makeLayers(N = 1024) {
  const R = recipes(N), L = R.length, A = new Uint8Array(N * N * 4 * L), Nm = new Uint8Array(N * N * 4 * L), H = new Float32Array(N * N);
  for (let l = 0; l < L; l++) {
    const f = R[l], o = l * N * N * 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, [h, m, r] = f(x / N, y / N, hash(i + l * 1299709));
      H[i] = h;
      A[o + i * 4] = A[o + i * 4 + 1] = Math.max(0, Math.min(255, Math.round((m / 1.25) * 255)));
      A[o + i * 4 + 2] = Math.max(0, Math.min(255, Math.round((m * 0.985 / 1.25) * 255)));
      A[o + i * 4 + 3] = Math.max(0, Math.min(255, Math.round((0.5 + r) * 255)));
    }
    // the normal from the height's slopes (tiling), the cavity from the height below its neighbourhood
    const k = 2.2 * (N / 1024);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = (a) => H[y * N + ((a + N) % N)], hy = (b) => H[((b + N) % N) * N + x];
      const dx = (hx(x + 1) - hx(x - 1)) * k, dy = (hy(y + 1) - hy(y - 1)) * k, l2 = Math.sqrt(dx * dx + dy * dy + 1);
      const avg = (hx(x - 2) + hx(x + 2) + hy(y - 2) + hy(y + 2)) / 4, cav = Math.max(0, Math.min(1, 1 - Math.max(0, avg - H[y * N + x]) * 1.6));
      const i = o + (y * N + x) * 4;
      Nm[i] = Math.round((-dx / l2 * 0.5 + 0.5) * 255); Nm[i + 1] = Math.round((dy / l2 * 0.5 + 0.5) * 255);
      Nm[i + 2] = Math.round(cav * 255); Nm[i + 3] = Math.round(Math.max(0, Math.min(1, H[y * N + x])) * 255);
    }
    yield l;
  }
  return { A, N: Nm, size: N, layers: L };
}

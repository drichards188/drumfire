// Signed distance fields and their mesher for the max crew tier (crew_hd.js PROFILE.max: the faces, ears and fists).
// Pure functions of their arguments, no DOM: the same code in a worker (crewWorker.js) and on the main thread gives
// the same arrays to the bit.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const bump = (a, b, x) => sstep(a, (a + b) / 2, x) * (1 - sstep((a + b) / 2, b, x));
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
// an integer hash to [0, 1)
export const hash = (x) => { let h = Math.imul((x * 2654435761) | 0, 0x9e3779b1) ^ 0x85ebca6b; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// ellipsoid (a bound close to the distance near the surface)
export function sdEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz, k0 = Math.sqrt(a * a + b * b + c * c), k1 = Math.sqrt(a * a / (rx * rx) + b * b / (ry * ry) + c * c / (rz * rz));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
// capsule from a to b, radius ra to rb
export function sdCap(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const qx = px - dx * h, qy = py - dy * h, qz = pz - dz * h;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + (rb - ra) * h);
}
// a chain of capsules through points [[x, y, z, r], ...] (smooth radii along it), the nearest segment's distance
export function sdChain(x, y, z, P) {
  let d = 1e9;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], e = sdCap(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]);
    if (e < d) d = e;
  }
  return d;
}

// Surface nets on a lattice of spacing H over the box [x0, x1] x [y0, y1] x [z0, z1], the field f(x, y, z) (negative
// inside). A generator: it yields after each slab so the caller can spread it over frames; it returns
// { pos, nrm, idx } (Float32Array, Float32Array, Uint32Array). Options:
//   keep(x, y, z)  false where the surface is not wanted (a quad goes when all four of its corners are not kept)
//   relax          passes of tangential smoothing (each vertex toward its neighbours' mean, back onto the surface)
//   coarse         evaluate the field on a lattice this many times coarser first and fill the cells it shows to be
//                  far from the surface with their sign (the narrow band; 0: every point)
export function* meshSDF(f, box, H, { keep = null, relax = 2, coarse = 4 } = {}) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const NX = Math.ceil((x1 - x0) / H) + 1, NY = Math.ceil((y1 - y0) / H) + 1, NZ = Math.ceil((z1 - z0) / H) + 1;
  const F = new Float32Array(NX * NY * NZ);
  const at = (i, j, k) => (k * NY + j) * NX + i;
  if (coarse > 1) {
    // the coarse lattice: a cell whose corners all lie further from the surface than its diagonal is filled by sign
    const C = coarse, CX = Math.ceil((NX - 1) / C) + 1, CY = Math.ceil((NY - 1) / C) + 1, CZ = Math.ceil((NZ - 1) / C) + 1;
    const G = new Float32Array(CX * CY * CZ), far = H * C * 2.2, done = new Uint8Array(NX * NY * NZ);
    for (let k = 0; k < CZ; k++) for (let j = 0; j < CY; j++) for (let i = 0; i < CX; i++) G[(k * CY + j) * CX + i] = f(x0 + i * C * H, y0 + j * C * H, z0 + k * C * H);
    yield;
    for (let ck = 0; ck < CZ - 1; ck++) {
      for (let cj = 0; cj < CY - 1; cj++) for (let ci = 0; ci < CX - 1; ci++) {
        let mn = 1e9, mx = -1e9;
        for (let c = 0; c < 8; c++) { const v = G[((ck + (c >> 2)) * CY + cj + ((c >> 1) & 1)) * CX + ci + (c & 1)]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const fill = mn > far ? far : mx < -far ? -far : 0;
        const ia = ci * C, ja = cj * C, ka = ck * C, ib = Math.min(NX - 1, ia + C), jb = Math.min(NY - 1, ja + C), kb = Math.min(NZ - 1, ka + C);
        // (a point a far cell shares with a near one takes the near one's true value, whichever comes first)
        for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
          const n = at(i, j, k);
          if (fill === 0) { if (done[n] !== 2) { F[n] = f(x0 + i * H, y0 + j * H, z0 + k * H); done[n] = 2; } } else if (!done[n]) { F[n] = fill; done[n] = 1; }
        }
      }
      if (ck % 2 === 1) yield;
    }
  } else {
    for (let k = 0; k < NZ; k++) {
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) F[at(i, j, k)] = f(x0 + i * H, y0 + j * H, z0 + k * H);
      if (k % 6 === 5) yield;
    }
  }
  // one vertex in every cell the surface crosses, at the mean of its edge crossings
  const vid = new Int32Array(NX * NY * NZ).fill(-1), P = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1], v = new Float32Array(8);
  for (let k = 0; k < NZ - 1; k++) {
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { v[c] = F[at(i + cx[c], j + cy[c], k + cz[c])]; if (v[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        if ((v[a] < 0) === (v[b] < 0)) continue;
        const t = v[a] / (v[a] - v[b]);
        sx += cx[a] + (cx[b] - cx[a]) * t; sy += cy[a] + (cy[b] - cy[a]) * t; sz += cz[a] + (cz[b] - cz[a]) * t; n++;
      }
      vid[at(i, j, k)] = P.length / 3;
      P.push(x0 + (i + sx / n) * H, y0 + (j + sy / n) * H, z0 + (k + sz / n) * H);
    }
    if (k % 8 === 7) yield;
  }
  const quads = [];
  const quad = (a, b, c, d, flip) => { if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (flip) quads.push(a, d, c, b); else quads.push(a, b, c, d); } };
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const f0 = F[at(i, j, k)] < 0;
    if (f0 !== (F[at(i + 1, j, k)] < 0)) quad(vid[at(i, j - 1, k - 1)], vid[at(i, j, k - 1)], vid[at(i, j, k)], vid[at(i, j - 1, k)], !f0);
    if (f0 !== (F[at(i, j + 1, k)] < 0)) quad(vid[at(i - 1, j, k - 1)], vid[at(i - 1, j, k)], vid[at(i, j, k)], vid[at(i, j, k - 1)], !f0);
    if (f0 !== (F[at(i, j, k + 1)] < 0)) quad(vid[at(i - 1, j - 1, k)], vid[at(i, j - 1, k)], vid[at(i, j, k)], vid[at(i - 1, j, k)], !f0);
  }
  yield;
  const nv = P.length / 3, pos = Float64Array.from(P), nrm = new Float64Array(nv * 3);
  const e = H * 0.12;
  const onto = (i) => { // a Newton step onto the surface along the gradient, the gradient kept as the normal
    for (let it = 0; it < 2; it++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      gx /= l; gy /= l; gz /= l;
      const d = f(x, y, z);
      pos[i * 3] = x - gx * d; pos[i * 3 + 1] = y - gy * d; pos[i * 3 + 2] = z - gz * d;
      nrm[i * 3] = gx; nrm[i * 3 + 1] = gy; nrm[i * 3 + 2] = gz;
    }
  };
  // the cut first: only what is kept (and its first ring, for the smoothing) is worked on
  const kept = keep ? new Uint8Array(nv) : null;
  if (keep) for (let i = 0; i < nv; i++) kept[i] = keep(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) ? 1 : 0;
  const act = new Uint8Array(nv);
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    if (!kept || kept[a] || kept[b] || kept[c] || kept[d]) act[a] = act[b] = act[c] = act[d] = 1;
  }
  for (let i = 0; i < nv; i++) if (act[i]) onto(i);
  yield;
  if (relax > 0) {
    // neighbours from the quads' edges (CSR lists)
    const deg = new Int32Array(nv + 1);
    for (let q = 0; q < quads.length; q += 4) for (let c = 0; c < 4; c++) deg[quads[q + c]] += 2;
    const off = new Int32Array(nv + 1);
    for (let i = 0; i < nv; i++) off[i + 1] = off[i] + deg[i];
    const nb = new Int32Array(off[nv]), fillN = off.slice(0, nv);
    for (let q = 0; q < quads.length; q += 4) for (let c = 0; c < 4; c++) { const a = quads[q + c], b = quads[q + ((c + 1) & 3)], d = quads[q + ((c + 3) & 3)]; nb[fillN[a]++] = b; nb[fillN[a]++] = d; }
    const tmp = new Float64Array(nv * 3);
    for (let pass = 0; pass < relax; pass++) {
      for (let i = 0; i < nv; i++) {
        if (!act[i]) continue;
        let mx = 0, my = 0, mz = 0, n = 0;
        for (let k = off[i]; k < off[i + 1]; k++) { const j = nb[k]; mx += pos[j * 3]; my += pos[j * 3 + 1]; mz += pos[j * 3 + 2]; n++; }
        if (!n) { tmp[i * 3] = pos[i * 3]; tmp[i * 3 + 1] = pos[i * 3 + 1]; tmp[i * 3 + 2] = pos[i * 3 + 2]; continue; }
        let dx = mx / n - pos[i * 3], dy = my / n - pos[i * 3 + 1], dz = mz / n - pos[i * 3 + 2];
        const dn = dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2];
        dx -= dn * nrm[i * 3]; dy -= dn * nrm[i * 3 + 1]; dz -= dn * nrm[i * 3 + 2];
        tmp[i * 3] = pos[i * 3] + dx * 0.6; tmp[i * 3 + 1] = pos[i * 3 + 1] + dy * 0.6; tmp[i * 3 + 2] = pos[i * 3 + 2] + dz * 0.6;
      }
      for (let i = 0; i < nv; i++) if (act[i]) { pos[i * 3] = tmp[i * 3]; pos[i * 3 + 1] = tmp[i * 3 + 1]; pos[i * 3 + 2] = tmp[i * 3 + 2]; onto(i); }
      yield;
    }
  }
  // the cut (again, where the smoothing moved them), and every quad split along its shorter diagonal
  if (keep) for (let i = 0; i < nv; i++) kept[i] = act[i] && keep(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) ? 1 : 0;
  const tri = [];
  const d2 = (a, b) => { const x = pos[a * 3] - pos[b * 3], y = pos[a * 3 + 1] - pos[b * 3 + 1], z = pos[a * 3 + 2] - pos[b * 3 + 2]; return x * x + y * y + z * z; };
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    if (kept && ((!kept[a] && !kept[b] && !kept[c] && !kept[d]) || !act[a] || !act[b] || !act[c] || !act[d])) continue; // (a corner never worked on: out)
    if (d2(a, c) <= d2(b, d)) tri.push(a, b, c, a, c, d); else tri.push(a, b, d, b, c, d);
  }
  // only the vertices the triangles use
  const remap = new Int32Array(nv).fill(-1), oP = [], oN = [], oI = new Uint32Array(tri.length);
  for (let t = 0; t < tri.length; t++) {
    const i = tri[t];
    if (remap[i] < 0) { remap[i] = oP.length / 3; oP.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); oN.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]); }
    oI[t] = remap[i];
  }
  return { pos: Float32Array.from(oP), nrm: Float32Array.from(oN), idx: oI };
}

// run a generator to its end and give back what it returns
export function runAll(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

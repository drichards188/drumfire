// Signed distance fields for the HD gun forgings (k18_hd.js: the Mörser 18's breech ring) and their mesher. Pure
// functions, no DOM, Node-safe. The mesher is the crew tier's surface nets (models/v/crew_sdf.js) made synchronous and
// leaner for hard forms: a narrow band from a coarse lattice, one vertex a cell, a Newton step onto the surface with
// the field's gradient as the normal, tangential relaxation, then the triangles split by a material function so each
// finish gets its own geometry. crew_sdf.js itself is not touched (the crew tier's arrays stay bit-identical).
import * as THREE from 'three';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// polynomial smooth min / max: k is the width of the blend (a fillet of about k / 4 at a right-angled junction)
export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
// a smooth subtraction of b from a
export const ssub = (a, b, k) => smax(a, -b, k);

// a 2D rounded rectangle (half sizes hx, hy) with its corner radius r
export function rrect(x, y, hx, hy, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
  return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - r;
}
// a 2D section d2 extruded over |w| <= hw, the extrusion's two rims rounded by r (exact for a convex section)
export function extrude(d2, w, hw, r) {
  const qx = d2 + r, qy = Math.abs(w) - hw + r, mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
  return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - r;
}
// a box centred at (cx, cy, cz) with half sizes (hx, hy, hz), every edge rounded by r
export function rbox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0, m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
  return Math.sqrt(mx * mx + my * my + mz * mz) + (m < 0 ? m : 0) - r;
}
// a box from (x0, y0, z0) to (x1, y1, z1), edges rounded by r
export const rboxAt = (x, y, z, x0, y0, z0, x1, y1, z1, r) => rbox(x, y, z, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, r);
// a capped cylinder along an axis ('x', 'y' or 'z') through (u, v) in the other two axes (in order: x -> (y, z),
// y -> (x, z), z -> (x, y)), radius R, from a0 to a1, its two rims rounded by r
export function cylA(x, y, z, axis, u, v, R, a0, a1, r) {
  const [a, p, q] = axis === 'z' ? [z, x, y] : axis === 'x' ? [x, y, z] : [y, x, z];
  const du = p - u, dv = q - v;
  return extrude(Math.sqrt(du * du + dv * dv) - R, a - (a0 + a1) / 2, (a1 - a0) / 2, r);
}
// an ellipse's distance in 2D (a bound close to the distance near the curve; semi-axes a, b)
export function ell2(x, y, a, b) {
  const xa = x / a, yb = y / b, k0 = Math.sqrt(xa * xa + yb * yb), k1 = Math.sqrt(xa * xa / (a * a) + yb * yb / (b * b));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b);
}
// a capsule from a to b with radius r
export function cap(x, y, z, ax, ay, az, bx, by, bz, r) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const ex = px - dx * h, ey = py - dy * h, ez = pz - dz * h;
  return Math.sqrt(ex * ex + ey * ey + ez * ez) - r;
}

// Mesh the field f (negative inside) over box = [x0, y0, z0, x1, y1, z1] at cell size H. Options:
//   mat(x, y, z, nx, ny, nz) -> a key: each triangle goes to the geometry of its centroid's key (default 'camo')
//   keep(x, y, z, nx, ny, nz) -> false where no surface is wanted (a triangle goes when its centroid is not kept)
//   relax: tangential smoothing passes
//   ao: { k: strength }: an occlusion term from the field along the normal (per vertex, returned in `occ`)
//   merge: true (default) to merge the flat faces square to an axis into fans (no T-junctions: every vertex on a
//          merged patch's rim stays, only the inner ones go), so a big flat face costs a few triangles, not thousands
// The field is sampled on an octree narrow band: a cell whose centre lies further from the surface than its half
// diagonal (with a margin for the blends, which are bounds rather than distances) is filled with that sign unsplit.
// Returns { geos: { key: BufferGeometry (indexed, position + normal) }, occ: { key: Float32Array per vertex }, verts, tris }
export function meshSDF(f, box, H, { mat = null, keep = null, relax = 1, ao = null, merge = true, levels = 4 } = {}) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const NX = Math.ceil((x1 - x0) / H) + 1, NY = Math.ceil((y1 - y0) / H) + 1, NZ = Math.ceil((z1 - z0) / H) + 1;
  const F = new Float32Array(NX * NY * NZ), done = new Uint8Array(NX * NY * NZ);
  const at = (i, j, k) => (k * NY + j) * NX + i;
  { // the octree narrow band
    const top = 1 << levels;
    let cells = [];
    for (let k = 0; k < NZ - 1; k += top) for (let j = 0; j < NY - 1; j += top) for (let i = 0; i < NX - 1; i += top) cells.push(i, j, k);
    for (let l = 0; l <= levels; l++) {
      const sz = top >> l, next = [];
      for (let c = 0; c < cells.length; c += 3) {
        const i = cells[c], j = cells[c + 1], k = cells[c + 2], i1 = Math.min(i + sz, NX - 1), j1 = Math.min(j + sz, NY - 1), k1 = Math.min(k + sz, NZ - 1);
        const di = i1 - i, dj = j1 - j, dk = k1 - k;
        const v = f(x0 + (i + i1) * 0.5 * H, y0 + (j + j1) * 0.5 * H, z0 + (k + k1) * 0.5 * H);
        if (Math.abs(v) > 0.5 * H * Math.sqrt(di * di + dj * dj + dk * dk) * 1.3 + H * 0.2) {
          for (let kk = k; kk <= k1; kk++) for (let jj = j; jj <= j1; jj++) { const r = at(0, jj, kk); for (let ii = i; ii <= i1; ii++) if (done[r + ii] !== 2) { F[r + ii] = v; done[r + ii] = 1; } }
        } else if (sz > 1) {
          const h = sz >> 1;
          for (let q = 0; q < 8; q++) { const ci = i + (q & 1) * h, cj = j + ((q >> 1) & 1) * h, ck = k + (q >> 2) * h; if (ci < NX - 1 && cj < NY - 1 && ck < NZ - 1) next.push(ci, cj, ck); }
        } else {
          for (let q = 0; q < 8; q++) { const ii = i + (q & 1), jj = j + ((q >> 1) & 1), kk = k + (q >> 2), n = at(ii, jj, kk); if (done[n] !== 2) { F[n] = f(x0 + ii * H, y0 + jj * H, z0 + kk * H); done[n] = 2; } }
        }
      }
      cells = next;
    }
  }
  // one vertex in every cell the surface crosses, at the mean of its edge crossings
  const vid = new Int32Array(NX * NY * NZ).fill(-1), P = [];
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const v = new Float32Array(8);
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const n0 = at(i, j, k);
    if (done[n0] !== 2 && done[n0 + 1] !== 2 && done[n0 + NX] !== 2 && done[n0 + NX * NY] !== 2) {
      // (a cell with no evaluated corner lies wholly in a far cell: no crossing; checked on four corners cheaply, the
      // rest below)
      let any = false;
      for (let c = 0; c < 8 && !any; c++) any = done[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))] === 2;
      if (!any) continue;
    }
    let neg = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))]; if (v[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = E[e], b = E[e + 1];
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t; n++;
    }
    vid[n0] = P.length / 3;
    P.push(x0 + (i + sx / n) * H, y0 + (j + sy / n) * H, z0 + (k + sz / n) * H);
  }
  // the quads, each with its axis and its place on the lattice (for the flat-face merge)
  const quads = [], qm = [];
  const quad = (a, b, c, d, flip, ax, i, j, k) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) quads.push(a, d, c, b); else quads.push(a, b, c, d);
    qm.push(ax, i, j, k);
  };
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const n0 = at(i, j, k), f0 = F[n0] < 0;
    if (f0 !== (F[n0 + 1] < 0)) quad(vid[at(i, j - 1, k - 1)], vid[at(i, j, k - 1)], vid[n0], vid[at(i, j - 1, k)], !f0, 0, i, j, k);
    if (f0 !== (F[n0 + NX] < 0)) quad(vid[at(i - 1, j, k - 1)], vid[at(i - 1, j, k)], vid[n0], vid[at(i, j, k - 1)], !f0, 1, i, j, k);
    if (f0 !== (F[n0 + NX * NY] < 0)) quad(vid[at(i - 1, j - 1, k)], vid[at(i, j - 1, k)], vid[n0], vid[at(i - 1, j, k)], !f0, 2, i, j, k);
  }
  const nv = P.length / 3, pos = Float64Array.from(P), nrm = new Float64Array(nv * 3);
  const e = H * 0.1;
  // a Newton step onto the surface along the gradient (a tetrahedral difference: four samples), the gradient kept as
  // the normal
  const onto = (i) => {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    let gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= l; gy /= l; gz /= l;
    const dist = (a + b + c + d) * 0.25;
    pos[i * 3] = x - gx * dist; pos[i * 3 + 1] = y - gy * dist; pos[i * 3 + 2] = z - gz * dist;
    nrm[i * 3] = gx; nrm[i * 3 + 1] = gy; nrm[i * 3 + 2] = gz;
  };
  for (let i = 0; i < nv; i++) onto(i);
  if (relax > 0) {
    const deg = new Int32Array(nv + 1);
    for (let q = 0; q < quads.length; q += 4) for (let c = 0; c < 4; c++) deg[quads[q + c]] += 2;
    const off = new Int32Array(nv + 1);
    for (let i = 0; i < nv; i++) off[i + 1] = off[i] + deg[i];
    const nb = new Int32Array(off[nv]), fillN = off.slice(0, nv);
    for (let q = 0; q < quads.length; q += 4) for (let c = 0; c < 4; c++) { const a = quads[q + c]; nb[fillN[a]++] = quads[q + ((c + 1) & 3)]; nb[fillN[a]++] = quads[q + ((c + 3) & 3)]; }
    const tmp = new Float64Array(nv * 3);
    for (let pass = 0; pass < relax; pass++) {
      for (let i = 0; i < nv; i++) {
        let mx = 0, my = 0, mz = 0, n = 0;
        for (let k = off[i]; k < off[i + 1]; k++) { const j = nb[k]; mx += pos[j * 3]; my += pos[j * 3 + 1]; mz += pos[j * 3 + 2]; n++; }
        if (!n) { tmp[i * 3] = pos[i * 3]; tmp[i * 3 + 1] = pos[i * 3 + 1]; tmp[i * 3 + 2] = pos[i * 3 + 2]; continue; }
        let dx = mx / n - pos[i * 3], dy = my / n - pos[i * 3 + 1], dz = mz / n - pos[i * 3 + 2];
        const dn = dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2];
        dx -= dn * nrm[i * 3]; dy -= dn * nrm[i * 3 + 1]; dz -= dn * nrm[i * 3 + 2];
        tmp[i * 3] = pos[i * 3] + dx * 0.5; tmp[i * 3 + 1] = pos[i * 3 + 1] + dy * 0.5; tmp[i * 3 + 2] = pos[i * 3 + 2] + dz * 0.5;
      }
      pos.set(tmp);
      for (let i = 0; i < nv; i++) onto(i);
    }
  }
  // the occlusion along the normal (the classic field AO: how much nearer the surface is than the distance walked)
  const occ = ao ? new Float32Array(nv) : null;
  if (ao) {
    const ds = ao.d ?? [H * 2, H * 4.5, H * 9];
    for (let i = 0; i < nv; i++) {
      let s = 0, w = 1, ws = 0;
      for (const d of ds) {
        const q = f(pos[i * 3] + nrm[i * 3] * d, pos[i * 3 + 1] + nrm[i * 3 + 1] * d, pos[i * 3 + 2] + nrm[i * 3 + 2] * d);
        s += w * Math.max(0, d - q) / d; ws += w; w *= 0.7;
      }
      occ[i] = clamp(1 - (ao.k ?? 0.8) * s / ws, 0, 1);
    }
  }
  // extra vertices (the merged patches' centres) go after the surface's own
  const xP = [], xN = [], xO = [];
  const lists = new Map();
  const listOf = (key) => { let l = lists.get(key); if (!l) lists.set(key, (l = [])); return l; };
  const nq = quads.length / 4, qkey = new Array(nq), used = new Uint8Array(nq);
  for (let q = 0; q < nq; q++) {
    const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3];
    let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (const t of [a, b, c, d]) { cx += pos[t * 3]; cy += pos[t * 3 + 1]; cz += pos[t * 3 + 2]; nx += nrm[t * 3]; ny += nrm[t * 3 + 1]; nz += nrm[t * 3 + 2]; }
    cx /= 4; cy /= 4; cz /= 4;
    qkey[q] = keep && !keep(cx, cy, cz, nx, ny, nz) ? null : mat ? mat(cx, cy, cz, nx, ny, nz) : 'camo';
  }
  if (merge) {
    // flat quads: all four normals square to the quad's axis (one sign), all four corners on one plane and in one band
    // of the occlusion (a patch's centre takes its band's middle, so the shading over a merged patch stays as it was)
    const groups = new Map(), BAND = 0.04;
    for (let q = 0; q < nq; q++) {
      if (qkey[q] == null) continue;
      const ax = qm[q * 4];
      let sgn = 0, ok = true, c0 = 0, b0 = 0;
      for (let t = 0; t < 4 && ok; t++) {
        const vtx = quads[q * 4 + t], nn = nrm[vtx * 3 + ax], b = occ ? Math.round(occ[vtx] / BAND) : 0;
        if (Math.abs(nn) < 0.99995) ok = false;
        else if (t === 0) { sgn = Math.sign(nn); c0 = pos[vtx * 3 + ax]; b0 = b; } else if (Math.sign(nn) !== sgn || Math.abs(pos[vtx * 3 + ax] - c0) > H * 0.002 || b !== b0) ok = false;
      }
      if (!ok) continue;
      const i = qm[q * 4 + 1], j = qm[q * 4 + 2], k = qm[q * 4 + 3];
      const [sl, u, w] = ax === 0 ? [i, j, k] : ax === 1 ? [j, i, k] : [k, i, j];
      const gk = `${ax}|${sl}|${sgn}|${qkey[q]}|${b0}`;
      let g = groups.get(gk);
      if (!g) groups.set(gk, (g = { ax, sl, sgn, key: qkey[q], ao: Math.min(1, b0 * BAND), cells: new Map() }));
      g.cells.set(u * 100003 + w, q);
    }
    const vat = (ax, sl, U, W) => (ax === 0 ? vid[at(sl, U, W)] : ax === 1 ? vid[at(U, sl, W)] : vid[at(U, W, sl)]);
    for (const g of groups.values()) {
      const keys = [...g.cells.keys()].sort((p, q) => p - q);
      for (const key0 of keys) {
        const q0 = g.cells.get(key0);
        if (used[q0]) continue;
        const u0 = Math.floor(key0 / 100003), w0 = key0 - u0 * 100003;
        let u1 = u0;
        while (g.cells.has((u1 + 1) * 100003 + w0) && !used[g.cells.get((u1 + 1) * 100003 + w0)]) u1++;
        let w1 = w0;
        for (;;) {
          let row = true;
          for (let u = u0; u <= u1 && row; u++) { const qq = g.cells.get(u * 100003 + w1 + 1); row = qq !== undefined && !used[qq]; }
          if (!row) break;
          w1++;
        }
        if (u1 === u0 && w1 === w0) continue; // a lone quad stays as it is
        for (let u = u0; u <= u1; u++) for (let w = w0; w <= w1; w++) used[g.cells.get(u * 100003 + w)] = 1;
        // the rim: the vertex grid from (u0 - 1, w0 - 1) to (u1, w1), walked round
        const rim = [];
        for (let U = u0 - 1; U < u1; U++) rim.push(vat(g.ax, g.sl, U, w0 - 1));
        for (let W = w0 - 1; W < w1; W++) rim.push(vat(g.ax, g.sl, u1, W));
        for (let U = u1; U > u0 - 1; U--) rim.push(vat(g.ax, g.sl, U, w1));
        for (let W = w1; W > w0 - 1; W--) rim.push(vat(g.ax, g.sl, u0 - 1, W));
        if (rim.some((r) => r < 0)) { for (let u = u0; u <= u1; u++) for (let w = w0; w <= w1; w++) used[g.cells.get(u * 100003 + w)] = 0; continue; }
        const c4 = [vat(g.ax, g.sl, u0 - 1, w0 - 1), vat(g.ax, g.sl, u1, w0 - 1), vat(g.ax, g.sl, u1, w1), vat(g.ax, g.sl, u0 - 1, w1)];
        const ci = nv + xP.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (const t of c4) { cx += pos[t * 3] / 4; cy += pos[t * 3 + 1] / 4; cz += pos[t * 3 + 2] / 4; }
        xP.push(cx, cy, cz); xN.push(g.ax === 0 ? g.sgn : 0, g.ax === 1 ? g.sgn : 0, g.ax === 2 ? g.sgn : 0); xO.push(g.ao);
        // the winding from the whole fan's signed area against the face's normal (one triangle's can be degenerate: its
        // two rim points in line with the centre, and a wrong sign flipped whole patches)
        const l = listOf(g.key), A1 = (g.ax + 1) % 3, A2 = (g.ax + 2) % 3, cc = [cx, cy, cz];
        let area = 0;
        for (let r = 0; r < rim.length; r++) {
          const p = rim[r], q = rim[(r + 1) % rim.length];
          area += (pos[p * 3 + A1] - cc[A1]) * (pos[q * 3 + A2] - cc[A2]) - (pos[p * 3 + A2] - cc[A2]) * (pos[q * 3 + A1] - cc[A1]);
        }
        const fwd = area * g.sgn > 0;
        for (let r = 0; r < rim.length; r++) { const p = rim[r], q = rim[(r + 1) % rim.length]; if (fwd) l.push(ci, p, q); else l.push(ci, q, p); }
      }
    }
  }
  // the rest: each quad along its shorter diagonal
  const d2 = (a, b) => { const x = pos[a * 3] - pos[b * 3], y = pos[a * 3 + 1] - pos[b * 3 + 1], z = pos[a * 3 + 2] - pos[b * 3 + 2]; return x * x + y * y + z * z; };
  for (let q = 0; q < nq; q++) {
    if (used[q] || qkey[q] == null) continue;
    const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3], l = listOf(qkey[q]);
    if (d2(a, c) <= d2(b, d)) l.push(a, b, c, a, c, d); else l.push(a, b, d, b, c, d);
  }
  const geos = {}, occs = {};
  let verts = 0, tris = 0;
  const tot = nv + xP.length / 3;
  const px = (i, c) => (i < nv ? pos[i * 3 + c] : xP[(i - nv) * 3 + c]), nx = (i, c) => (i < nv ? nrm[i * 3 + c] : xN[(i - nv) * 3 + c]);
  for (const [key, l] of lists) {
    const remap = new Int32Array(tot).fill(-1), oP = [], oN = [], oO = [], oI = new Uint32Array(l.length);
    for (let t = 0; t < l.length; t++) {
      const i = l[t];
      if (remap[i] < 0) {
        remap[i] = oP.length / 3;
        oP.push(px(i, 0), px(i, 1), px(i, 2)); oN.push(nx(i, 0), nx(i, 1), nx(i, 2));
        if (occ) oO.push(i < nv ? occ[i] : xO[i - nv]);
      }
      oI[t] = remap[i];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(oP), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(oN), 3));
    g.setIndex(new THREE.BufferAttribute(oI, 1));
    if (occ) occs[key] = Float32Array.from(oO);
    geos[key] = g;
    verts += oP.length / 3; tris += l.length / 3;
  }
  return { geos, occ: occs, verts, tris };
}

// the baked occlusion as HDParts' `shade` (HDParts.add calls it once per vertex, in the geometry's vertex order)
export function occShade(o) {
  if (!o) return undefined;
  let i = 0;
  return () => o[i++ % o.length];
}

// ---------------------------------------------------------------- profiles of revolution

// The exact signed distance to a closed polygon in 2D (pts flat [x0, y0, x1, y1, ...], negative inside, either
// winding). Edges with both ends on x = 0 count for the sign but not the distance: a profile of revolution drawn in
// (radius, axis) closes along its axis, which is no surface.
export function polySDF2(pts) {
  const n = pts.length / 2;
  return (px, py) => {
    let d = Infinity, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      const ex = xj - xi, ey = yj - yi, wx = px - xi, wy = py - yi;
      if (xi !== 0 || xj !== 0) {
        const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1), bx = wx - ex * t, by = wy - ey * t;
        const q = bx * bx + by * by;
        if (q < d) d = q;
      }
      const c1 = py >= yi, c2 = py < yj, c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  };
}

// f(x, y) sampled once on a grid of cell h over [x0, x1] x [y0, y1] and read back bilinearly (an exact field stays exact
// to a fraction of h away from its medial axis); outside the grid `out(x, y)` answers
export function grid2(f, x0, y0, x1, y1, h, out) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, G = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) G[j * nx + i] = f(x0 + i * h, y0 + j * h);
  const xm = x0 + (nx - 1) * h, ym = y0 + (ny - 1) * h;
  return (x, y) => {
    if (x < x0 || y < y0 || x >= xm || y >= ym) return out(x, y);
    const u = (x - x0) / h, v = (y - y0) / h, i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * nx + i;
    return (G[k] * (1 - fu) + G[k + 1] * fu) * (1 - fv) + (G[k + nx] * (1 - fu) + G[k + nx + 1] * fu) * fv;
  };
}

// a quarter of an ellipse's arc as profile points: centre (cx, cy), semi-axes (ax, ay), from angle a0 to a1, n steps
export function arc2(cx, cy, ax, ay, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push(cx + Math.cos(a) * ax, cy + Math.sin(a) * ay); }
  return out;
}

// ---------------------------------------------------------------- seamless box UVs

// Metric box UVs for a surface-nets mesh without its saw teeth. Box UVs per vertex (the face its normal points at most)
// smear a triangle whose corners chose different faces across the texture, and per triangle they step along the
// lattice. Here each triangle is cut along the lines where the dominant axis of the interpolated normal changes
// (the argmax of three linear functions: a clean partition, the same on both sides of every edge, so no cracks), and
// each piece is projected on its own axis: the seams run as smooth curves along the fillets, as on a turned or bent
// part. Returns { geo (indexed: position, normal, uv in metres), occ (the per-vertex values carried over) }.
export function splitUV(g, occ = null) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array, nv = P.length / 3;
  const oP = [], oN = [], oU = [], oO = [], oI = [];
  const reuse = new Int32Array(nv * 3).fill(-1);
  const put = (x, y, z, nx, ny, nz, o, k) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    oP.push(x, y, z); oN.push(nx / l, ny / l, nz / l); oO.push(o);
    if (k === 0) oU.push(z, y); else if (k === 1) oU.push(x, z); else oU.push(x, y);
    return oP.length / 3 - 1;
  };
  const vert = (v, k) => {
    const r = v * 3 + k;
    if (reuse[r] < 0) reuse[r] = put(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], occ ? occ[v] : 1, k);
    return reuse[r];
  };
  // a triangle, unless it has no area (a clip through a corner leaves slivers of none; they draw nothing and only confuse
  // what reads the mesh's edges and solids)
  const tri = (a, b, c) => {
    const ux = oP[b * 3] - oP[a * 3], uy = oP[b * 3 + 1] - oP[a * 3 + 1], uz = oP[b * 3 + 2] - oP[a * 3 + 2];
    const wx = oP[c * 3] - oP[a * 3], wy = oP[c * 3 + 1] - oP[a * 3 + 1], wz = oP[c * 3 + 2] - oP[a * 3 + 2];
    const x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx;
    if (x * x + y * y + z * z > 1e-24) oI.push(a, b, c);
  };
  // a polygon's corner: barycentric weights over the triangle's three vertices
  const A = [0, 0, 0];
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    const a = v.map((q) => [Math.abs(N[q * 3]), Math.abs(N[q * 3 + 1]), Math.abs(N[q * 3 + 2])]);
    const cls = a.map((w) => (w[0] >= w[1] && w[0] >= w[2] ? 0 : w[1] >= w[2] ? 1 : 2));
    if (cls[0] === cls[1] && cls[1] === cls[2]) { tri(vert(v[0], cls[0]), vert(v[1], cls[0]), vert(v[2], cls[0])); continue; }
    for (let k = 0; k < 3; k++) {
      // the part of the triangle where axis k leads: clipped by a_k - a_j >= 0 for both other axes
      let poly = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      for (const j of [0, 1, 2]) {
        if (j === k || !poly.length) continue;
        const g3 = a.map((w) => w[k] - w[j]), val = (b) => b[0] * g3[0] + b[1] * g3[1] + b[2] * g3[2], next = [];
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length], fp = val(p), fq = val(q);
          if (fp >= 0) next.push(p);
          if ((fp >= 0) !== (fq >= 0)) {
            // (both triangles on an edge find the same point: it depends only on the edge's two ends, to far below a
            // float32 step)
            const t0 = fp / (fp - fq);
            next.push([p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0, p[2] + (q[2] - p[2]) * t0]);
          }
        }
        poly = next;
      }
      if (poly.length < 3) continue;
      const ids = poly.map((b) => {
        const c = b[0] > 0.999999 ? 0 : b[1] > 0.999999 ? 1 : b[2] > 0.999999 ? 2 : -1;
        if (c >= 0) return vert(v[c], k);
        A[0] = b[0]; A[1] = b[1]; A[2] = b[2];
        const mix = (arr, s, o) => A[0] * arr[v[0] * s + o] + A[1] * arr[v[1] * s + o] + A[2] * arr[v[2] * s + o];
        return put(mix(P, 3, 0), mix(P, 3, 1), mix(P, 3, 2), mix(N, 3, 0), mix(N, 3, 1), mix(N, 3, 2), occ ? mix(occ, 1, 0) : 1, k);
      });
      for (let i = 1; i + 1 < ids.length; i++) tri(ids[0], ids[i], ids[i + 1]);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(oP), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(oN), 3));
  out.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(oU), 2));
  out.setIndex(new THREE.BufferAttribute(Uint32Array.from(oI), 1));
  return { geo: out, occ: Float32Array.from(oO) };
}

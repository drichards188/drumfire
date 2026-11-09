// The edge analysis behind the max-quality gun materials (models/maxq.js), pure JS on typed arrays so it can run in a
// module worker: for a triangle soup, per corner, the signed distances to the nearest convex creases (aEdge).
// As a worker it answers { id, items: [{ pos, nrm, n }] } with { id, out: [Float32Array], stats }.

// For a non-indexed triangle soup: per corner, the signed distances (metres, positive inside) to the lines of the up
// to four nearest convex creases bounding the triangle's chart (a run of surface without a crease), linear over each
// triangle so the interpolation is exact; 10 where there is none. A crease is a hard edge (the two sides' vertex
// normals differ) over 25 degrees, or any edge over 60; an edge with one triangle (an open rim where a part stands on
// another) does not wear, nor does an edge onto a face lying flat against another part (buried).
const EDGE_R = 0.06; // the farthest a chip reaches from an edge (the shader: about 5 cm)
// smooth: a surface-nets mesh (k18_hd.js's forgings): no edge wear from its shape at all. Its facets lean up to 30
// degrees on one another and its cuts are filleted 4 to 5 mm, so any curvature rule chipped every window rim, claw and
// boss (29 % of the ring's paint within 2 cm of a chip with the field's normals, 39 % with the faces'), where the
// photographs show a clean forging worn bright only on the loading opening's lip: that wear comes from the rig's
// contact hints (k18_hd.js wearHints), as a hand's or a slide's does elsewhere.
export function edgeAttr(pos, nrm, nC, stats, smooth = false) {
  const nT = (nC / 3) | 0;
  const out = new Float32Array(nC * 4).fill(10);
  if (!nT || !nrm || smooth) return out;
  const T0 = performance.now();
  // weld corners to vertex ids (0.4 mm)
  const Q = 2500, H = 131072, vid = new Int32Array(nC), map = new Map();
  let nv = 0;
  for (let c = 0; c < nC; c++) {
    const k = ((Math.round(pos[c * 3] * Q) + H) * 262144 + (Math.round(pos[c * 3 + 1] * Q) + H)) * 262144 + (Math.round(pos[c * 3 + 2] * Q) + H);
    let id = map.get(k);
    if (id === undefined) { id = nv++; map.set(k, id); }
    vid[c] = id;
  }
  // face normals, centroids
  const fn = new Float32Array(nT * 3), cen = new Float32Array(nT * 3), dead = new Uint8Array(nT);
  for (let t = 0; t < nT; t++) {
    const a = t * 9;
    const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2];
    const wx = pos[a + 6] - pos[a], wy = pos[a + 7] - pos[a + 1], wz = pos[a + 8] - pos[a + 2];
    let x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx;
    const l = Math.hypot(x, y, z);
    if (l < 1e-10) { dead[t] = 1; continue; }
    fn[t * 3] = x / l; fn[t * 3 + 1] = y / l; fn[t * 3 + 2] = z / l;
    cen[t * 3] = (pos[a] + pos[a + 3] + pos[a + 6]) / 3; cen[t * 3 + 1] = (pos[a + 1] + pos[a + 4] + pos[a + 7]) / 3; cen[t * 3 + 2] = (pos[a + 2] + pos[a + 5] + pos[a + 8]) / 3;
  }
  const sn = fn;
  const T1 = performance.now();
  // buried faces: lying flat on another face of the mesh, facing it (a stiffener's foot on a girder)
  const buried = buriedFaces(pos, fn, cen, dead, nT);
  const T2 = performance.now();
  // edges
  const emap = new Map(), eT1 = [], eT2 = [], eN = [], eA = [], eB = [];
  for (let t = 0; t < nT; t++) {
    if (dead[t]) continue;
    for (let k = 0; k < 3; k++) {
      const c0 = t * 3 + k, c1 = t * 3 + ((k + 1) % 3), v0 = vid[c0], v1 = vid[c1];
      if (v0 === v1) continue;
      const key = v0 < v1 ? v0 * nv + v1 : v1 * nv + v0;
      let e = emap.get(key);
      if (e === undefined) { e = eT1.length; emap.set(key, e); eT1.push(t); eT2.push(-1); eN.push(1); eA.push(c0); eB.push(c1); }
      else { if (eN[e] === 1) eT2[e] = t; eN[e]++; }
    }
  }
  const nE = eT1.length, crease = new Uint8Array(nE), convex = new Uint8Array(nE);
  const cosHard = Math.cos(25 * Math.PI / 180), cosSharp = Math.cos(60 * Math.PI / 180);
  const cornerOf = (t, v) => (vid[t * 3] === v ? t * 3 : vid[t * 3 + 1] === v ? t * 3 + 1 : t * 3 + 2);
  const cosSoft = Math.cos(12 * Math.PI / 180);
  for (let e = 0; e < nE; e++) {
    if (eN[e] !== 2) { crease[e] = 1; continue; } // open rims and overlapping parts: charts end, nothing wears
    const t1 = eT1[e], t2 = eT2[e];
    const d = sn[t1 * 3] * sn[t2 * 3] + sn[t1 * 3 + 1] * sn[t2 * 3 + 1] + sn[t1 * 3 + 2] * sn[t2 * 3 + 2];
    if (d > cosSoft) continue;
    const va = vid[eA[e]], vb = vid[eB[e]];
    // convex when the second triangle's far corner lies behind the first's plane
    let far = t2 * 3;
    for (let k = 0; k < 3; k++) if (vid[t2 * 3 + k] !== va && vid[t2 * 3 + k] !== vb) far = t2 * 3 + k;
    const s = (pos[far * 3] - pos[eA[e] * 3]) * sn[t1 * 3] + (pos[far * 3 + 1] - pos[eA[e] * 3 + 1]) * sn[t1 * 3 + 1] + (pos[far * 3 + 2] - pos[eA[e] * 3 + 2]) * sn[t1 * 3 + 2];
    const isConvex = s < -1e-6 && !buried[t1] && !buried[t2];
    // smooth shading across the edge (the same vertex normals on both sides) means a curved surface, unless sharp;
    // a tightly curved convex one (a rounded edge, a thin rod: over 25 degrees a metre... per 4 cm) still wears
    const a1 = cornerOf(t1, va), a2 = cornerOf(t2, va), b1 = cornerOf(t1, vb), b2 = cornerOf(t2, vb);
    const same = (c, cc) => nrm[c * 3] * nrm[cc * 3] + nrm[c * 3 + 1] * nrm[cc * 3 + 1] + nrm[c * 3 + 2] * nrm[cc * 3 + 2] > 0.985;
    if (d > cosHard || (d > cosSharp && same(a1, a2) && same(b1, b2))) {
      const gap = Math.hypot(cen[t1 * 3] - cen[t2 * 3], cen[t1 * 3 + 1] - cen[t2 * 3 + 1], cen[t1 * 3 + 2] - cen[t2 * 3 + 2]);
      if (isConvex && Math.acos(Math.min(1, d)) / Math.max(gap, 1e-4) > 25) convex[e] = 1;
      continue;
    }
    crease[e] = 1;
    if (isConvex) convex[e] = 1;
  }
  const T3 = performance.now();
  // charts: triangles joined across smooth edges
  const par = new Int32Array(nT);
  for (let t = 0; t < nT; t++) par[t] = t;
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let e = 0; e < nE; e++) if (!crease[e] && eN[e] === 2) { const a = find(eT1[e]), b = find(eT2[e]); if (a !== b) par[a] = b; }
  // the convex creases as boundary segments of each chart beside them: endpoints and the inward in-surface normal m
  const seg = []; // [chart, ax, ay, az, bx, by, bz, mx, my, mz]
  const triSeg = new Int32Array(nT * 3).fill(-1); // a triangle's own edges among them
  for (let e = 0; e < nE; e++) {
    if (!convex[e]) continue;
    const A = eA[e] * 3, B = eB[e] * 3;
    const ex = pos[B] - pos[A], ey = pos[B + 1] - pos[A + 1], ez = pos[B + 2] - pos[A + 2];
    for (const t of [eT1[e], eT2[e]]) {
      const nx = sn[t * 3], ny = sn[t * 3 + 1], nz = sn[t * 3 + 2];
      let mx = ny * ez - nz * ey, my = nz * ex - nx * ez, mz = nx * ey - ny * ex;
      const l = Math.hypot(mx, my, mz);
      if (l < 1e-12) continue;
      mx /= l; my /= l; mz /= l;
      if ((cen[t * 3] - pos[A]) * mx + (cen[t * 3 + 1] - pos[A + 1]) * my + (cen[t * 3 + 2] - pos[A + 2]) * mz < 0) { mx = -mx; my = -my; mz = -mz; }
      for (let k = 0; k < 3; k++) if (triSeg[t * 3 + k] < 0) { triSeg[t * 3 + k] = seg.length / 10; break; }
      seg.push(find(t), pos[A], pos[A + 1], pos[A + 2], pos[B], pos[B + 1], pos[B + 2], mx, my, mz);
    }
  }
  const nS = seg.length / 10;
  const T4 = performance.now();
  // segments by chart; a chart with many gets its own grid (cells of EDGE_R)
  const G = EDGE_R, gk = (i, j, k) => ((i + 2048) * 4096 + (j + 2048)) * 4096 + (k + 2048);
  const byChart = new Map();
  for (let q = 0; q < nS; q++) {
    const ch = seg[q * 10];
    let l = byChart.get(ch);
    if (!l) byChart.set(ch, (l = []));
    l.push(q);
  }
  const grids = new Map();
  const gridOf = (ch, list) => {
    let grid = grids.get(ch);
    if (grid) return grid;
    grid = new Map();
    for (const q of list) {
      const o = q * 10;
      const i0 = Math.floor(Math.min(seg[o + 1], seg[o + 4]) / G), i1 = Math.floor(Math.max(seg[o + 1], seg[o + 4]) / G);
      const j0 = Math.floor(Math.min(seg[o + 2], seg[o + 5]) / G), j1 = Math.floor(Math.max(seg[o + 2], seg[o + 5]) / G);
      const k0 = Math.floor(Math.min(seg[o + 3], seg[o + 6]) / G), k1 = Math.floor(Math.max(seg[o + 3], seg[o + 6]) / G);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const key = gk(i, j, k);
        let l = grid.get(key);
        if (!l) grid.set(key, (l = []));
        l.push(q);
      }
    }
    grids.set(ch, grid);
    return grid;
  };
  // the size of each chart: on a small part (a rivet head, a nut) the chips shrink with it, or it would be all rim
  const cb = new Float32Array(nT * 6);
  for (let t = 0; t < nT; t++) { const r = find(t) * 6; cb[r] = cb[r + 1] = cb[r + 2] = Infinity; cb[r + 3] = cb[r + 4] = cb[r + 5] = -Infinity; }
  for (let t = 0; t < nT; t++) {
    if (dead[t]) continue;
    const r = find(t) * 6, a = t * 9;
    for (let k = 0; k < 9; k += 3) {
      cb[r] = Math.min(cb[r], pos[a + k]); cb[r + 1] = Math.min(cb[r + 1], pos[a + k + 1]); cb[r + 2] = Math.min(cb[r + 2], pos[a + k + 2]);
      cb[r + 3] = Math.max(cb[r + 3], pos[a + k]); cb[r + 4] = Math.max(cb[r + 4], pos[a + k + 1]); cb[r + 5] = Math.max(cb[r + 5], pos[a + k + 2]);
    }
  }
  const chartScale = (ch) => { const r = ch * 6, d = Math.hypot(cb[r + 3] - cb[r], cb[r + 4] - cb[r + 1], cb[r + 5] - cb[r + 2]); return d < 0.04 ? 0.04 / Math.max(d, 0.004) : 1; };
  // per triangle: the nearest segments of its own chart whose span covers it
  const best = new Float64Array(4), bestS = new Int32Array(4), stamp = new Int32Array(nS).fill(-1);
  let used = 0, dropped = 0, tri = 0;
  const segDist = (o, x, y, z) => {
    const ax = seg[o + 1], ay = seg[o + 2], az = seg[o + 3], bx = seg[o + 4] - ax, by = seg[o + 5] - ay, bz = seg[o + 6] - az;
    const l2 = bx * bx + by * by + bz * bz;
    let t = l2 > 0 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t);
  };
  let nb = 0, a = 0, x0 = 0, y0 = 0, z0 = 0, x1 = 0, y1 = 0, z1 = 0, Rq = G;
  const consider = (q) => {
    if (stamp[q] === tri) return;
    stamp[q] = tri;
    const o = q * 10;
    // boxes first: the segment against the triangle's box grown by the search radius
    if (Math.max(seg[o + 1], seg[o + 4]) < x0 - Rq || Math.min(seg[o + 1], seg[o + 4]) > x1 + Rq) return;
    if (Math.max(seg[o + 2], seg[o + 5]) < y0 - Rq || Math.min(seg[o + 2], seg[o + 5]) > y1 + Rq) return;
    if (Math.max(seg[o + 3], seg[o + 6]) < z0 - Rq || Math.min(seg[o + 3], seg[o + 6]) > z1 + Rq) return;
    let d = segDist(o, cen[tri * 3], cen[tri * 3 + 1], cen[tri * 3 + 2]);
    for (let c = 0; c < 3; c++) d = Math.min(d, segDist(o, pos[a + c * 3], pos[a + c * 3 + 1], pos[a + c * 3 + 2]));
    if (d > EDGE_R) return;
    let i2 = nb < 4 ? nb : -1;
    if (i2 < 0) { let w = 0; for (let k = 1; k < 4; k++) if (best[k] > best[w]) w = k; if (best[w] > d) i2 = w; else return; }
    // the line stands for the segment only where the triangle lies within the segment's span (+-5 cm) and on its
    // inner side (holes and reflex corners)
    const ax = seg[o + 1], ay = seg[o + 2], az = seg[o + 3], bx = seg[o + 4] - ax, by = seg[o + 5] - ay, bz = seg[o + 6] - az;
    const L = Math.hypot(bx, by, bz);
    for (let c = 0; c < 3; c++) {
      const px = pos[a + c * 3] - ax, py = pos[a + c * 3 + 1] - ay, pz = pos[a + c * 3 + 2] - az;
      const u = (px * bx + py * by + pz * bz) / L;
      if (u < -0.05 || u > L + 0.05 || px * seg[o + 7] + py * seg[o + 8] + pz * seg[o + 9] < -0.002) { dropped++; return; }
    }
    if (i2 === nb) nb++;
    best[i2] = d;
    bestS[i2] = q;
  };
  for (tri = 0; tri < nT; tri++) {
    if (dead[tri] || buried[tri]) continue;
    const list = byChart.get(find(tri));
    if (!list) continue;
    a = tri * 9;
    x0 = Math.min(pos[a], pos[a + 3], pos[a + 6]); x1 = Math.max(pos[a], pos[a + 3], pos[a + 6]);
    y0 = Math.min(pos[a + 1], pos[a + 4], pos[a + 7]); y1 = Math.max(pos[a + 1], pos[a + 4], pos[a + 7]);
    z0 = Math.min(pos[a + 2], pos[a + 5], pos[a + 8]); z1 = Math.max(pos[a + 2], pos[a + 5], pos[a + 8]);
    nb = 0;
    // a triangle with a convex edge of its own: every point of it lies within its own size of that edge, so no line
    // farther than that can be the nearest (the search shrinks to the triangle, which matters on thin tubes)
    Rq = G;
    for (let k = 0; k < 3; k++) if (triSeg[tri * 3 + k] >= 0) consider(triSeg[tri * 3 + k]);
    if (nb) Rq = Math.min(G, Math.max(x1 - x0, y1 - y0, z1 - z0) * 1.75 + 0.002);
    if (list.length <= 48) for (const q of list) consider(q);
    else {
      const grid = gridOf(find(tri), list);
      for (let i = Math.floor((x0 - Rq) / G); i <= Math.floor((x1 + Rq) / G); i++) for (let j = Math.floor((y0 - Rq) / G); j <= Math.floor((y1 + Rq) / G); j++) for (let k = Math.floor((z0 - Rq) / G); k <= Math.floor((z1 + Rq) / G); k++) {
        const l = grid.get(gk(i, j, k));
        if (l) for (const q of l) consider(q);
      }
    }
    const sc = chartScale(find(tri));
    for (let q = 0; q < nb; q++) {
      const o = bestS[q] * 10;
      for (let c = 0; c < 3; c++) {
        const cc = tri * 3 + c;
        out[cc * 4 + q] = sc * ((pos[cc * 3] - seg[o + 1]) * seg[o + 7] + (pos[cc * 3 + 1] - seg[o + 2]) * seg[o + 8] + (pos[cc * 3 + 2] - seg[o + 3]) * seg[o + 9]);
      }
    }
    if (nb) used++;
  }
  const T5 = performance.now();
  if (stats) { stats.ph = stats.ph ?? [0, 0, 0, 0, 0]; stats.ph[0] += T1 - T0; stats.ph[1] += T2 - T1; stats.ph[2] += T3 - T2; stats.ph[3] += T4 - T3; stats.ph[4] += T5 - T4; }
  if (stats) { stats.tris += nT; stats.withEdges += used; stats.dropped += dropped; stats.segments += nS; stats.buried += buried.reduce((s, b) => s + b, 0); }
  return out;
}

// Faces lying flat against a face of the same mesh and facing it, within 2 mm (their edges are inside corners).
function buriedFaces(pos, fn, cen, dead, nT) {
  const out = new Uint8Array(nT), G = 0.1, grid = new Map();
  const gk = (i, j, k) => ((i + 2048) * 4096 + (j + 2048)) * 4096 + (k + 2048);
  for (let t = 0; t < nT; t++) {
    if (dead[t]) continue;
    const a = t * 9;
    const x0 = Math.min(pos[a], pos[a + 3], pos[a + 6]), x1 = Math.max(pos[a], pos[a + 3], pos[a + 6]);
    const y0 = Math.min(pos[a + 1], pos[a + 4], pos[a + 7]), y1 = Math.max(pos[a + 1], pos[a + 4], pos[a + 7]);
    const z0 = Math.min(pos[a + 2], pos[a + 5], pos[a + 8]), z1 = Math.max(pos[a + 2], pos[a + 5], pos[a + 8]);
    const cells = (Math.floor(x1 / G) - Math.floor(x0 / G) + 1) * (Math.floor(y1 / G) - Math.floor(y0 / G) + 1) * (Math.floor(z1 / G) - Math.floor(z0 / G) + 1);
    if (cells > 4000) continue;
    for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(y0 / G); j <= Math.floor(y1 / G); j++) for (let k = Math.floor(z0 / G); k <= Math.floor(z1 / G); k++) {
      const key = gk(i, j, k);
      let l = grid.get(key);
      if (!l) grid.set(key, (l = []));
      l.push(t);
    }
  }
  for (let t = 0; t < nT; t++) {
    if (dead[t]) continue;
    const cx = cen[t * 3], cy = cen[t * 3 + 1], cz = cen[t * 3 + 2];
    const l = grid.get(gk(Math.floor(cx / G), Math.floor(cy / G), Math.floor(cz / G)));
    if (!l) continue;
    for (const u of l) {
      if (u === t) continue;
      const d = fn[t * 3] * fn[u * 3] + fn[t * 3 + 1] * fn[u * 3 + 1] + fn[t * 3 + 2] * fn[u * 3 + 2];
      if (d > -0.985) continue;
      const a = u * 9;
      const h = (cx - pos[a]) * fn[u * 3] + (cy - pos[a + 1]) * fn[u * 3 + 1] + (cz - pos[a + 2]) * fn[u * 3 + 2];
      if (h < -0.0005 || h > 0.002) continue;
      if (inTri(pos, a, fn, u, cx, cy, cz)) { out[t] = 1; break; }
    }
  }
  return out;
}
function inTri(pos, a, fn, u, px, py, pz) {
  const nx = fn[u * 3], ny = fn[u * 3 + 1], nz = fn[u * 3 + 2];
  for (let k = 0; k < 3; k++) {
    const i = a + k * 3, j = a + ((k + 1) % 3) * 3;
    const ex = pos[j] - pos[i], ey = pos[j + 1] - pos[i + 1], ez = pos[j + 2] - pos[i + 2];
    const qx = px - pos[i], qy = py - pos[i + 1], qz = pz - pos[i + 2];
    if ((ey * qz - ez * qy) * nx + (ez * qx - ex * qz) * ny + (ex * qy - ey * qx) * nz < -1e-7) return false;
  }
  return true;
}


// as a module worker
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const { id, items } = e.data;
    const stats = { tris: 0, withEdges: 0, dropped: 0, segments: 0, buried: 0 };
    const t0 = performance.now();
    const slow = [];
    const out = items.map((it) => { const t = performance.now(), r = edgeAttr(it.pos, it.nrm, it.n, stats, it.smooth); slow.push([Math.round(performance.now() - t), it.n / 3]); return r; });
    stats.slow = slow.sort((a, b) => b[0] - a[0]).slice(0, 6);
    stats.ms = performance.now() - t0;
    self.postMessage({ id, out, stats }, out.map((x) => x.buffer));
  };
}

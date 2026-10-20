import * as THREE from 'three';
import { V, box, rod, frontProfile, sideProfile, xf, projectUV } from '../../kit.js';
import { mulberry32, smoothstep } from '../../../noise.js';

// Shared pieces of the eastern targets (east.js, east_brest.js): round-headed openings, heightfields
// for earthworks and the limestone escarpment, wire, trenches, camouflage nets. Everything adds into an
// FParts collector (mats.js) or returns a geometry; model space as everywhere (front -Z, ground y = 0).

export const ss = (a, b, x) => smoothstep(a, b, x);
export const place = (g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => g.applyMatrix4(xf(x, y, z, rx, ry, rz));

/** [x, y] outline of a round-headed (or segmental, `rise` < w/2) opening w wide and h tall, base at y 0. */
export function archShape(w, h, rise = w / 2, n = 6) {
  const r = (w * w / 4 + rise * rise) / (2 * rise), cy = h - r, a0 = Math.asin(Math.min(1, w / 2 / r));
  const pts = [[-w / 2, 0], [w / 2, 0]];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - a0 + (2 * a0 * i) / n;
    pts.push([Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
/** A round-headed slab w x h, d thick (along z), base centre at (x, y, z), turned by ry. */
export const arch = (w, h, d, x, y, z, ry = 0, rise = w / 2, n = 6) => place(frontProfile(archShape(w, h, rise, n), -d / 2, d / 2), x, y, z, ry);

/**
 * An arched window or embrasure on a wall face: a dark opening and a brick (or stone) surround a little
 * proud of the wall. `side` -1 for a face looking -Z, +1 for +Z; the face is at z (wall-local).
 */
export function opening(P, x, y, z, w, h, side, { frame = 'brick', tint = 0xc89880, rim = 0.22, rise = w / 2, sill = true } = {}) {
  P.add(frame, arch(w + rim * 2, h + rim, 0.12, x, y - 0.02, z + side * 0.05, 0, rise + rim * 0.6), { tint });
  P.add('char', arch(w, h, 0.12, x, y, z + side * 0.1, 0, rise), { tint: 0x2a2622 });
  if (sill) P.add(frame, box(w + rim * 2.4, 0.14, 0.3, x, y - 0.08, z + side * 0.12), { tint });
}

/**
 * Heightfield over the sample columns xs and rows zs: fn(x, z) gives y (or [x, y, z] to displace a
 * vertex sideways, for steep faces). Triangles with every corner below `drop` are left out, so the
 * earthwork ends under the terrain. Returns an indexed geometry with smooth normals.
 */
export function field(xs, zs, fn, { drop = -0.6 } = {}) {
  const nx = xs.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), lo = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, r = fn(xs[i], zs[j]);
    const p = Array.isArray(r) ? r : [xs[i], r, zs[j]];
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    lo[k] = p[1] < drop ? 1 : 0;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (lo[a] && lo[b] && lo[c] && lo[d]) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** n + 1 evenly spaced samples from a to b. */
export const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// Pale Crimean limestone (tile 16 m): beds of slightly different tone with wavy partings, weathered
// patches and fine grit from tiling value noise, a few joints and rain streaks. Neutral and light so the
// escarpment's vertex colours (face, scree, scrub on top) carry the hue.
let rockMat = null;
export function limestone() {
  if (rockMat) return rockMat;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), r = mulberry32(301), img = g.createImageData(S, S);
  const lat = (n, seed) => { const q = mulberry32(seed), a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = q(); return a; };
  const L = [[4, lat(4, 1)], [8, lat(8, 2)], [16, lat(16, 3)], [32, lat(32, 4)], [64, lat(64, 5)]];
  const noise = (u, v, n, a) => { // tiling bilinear value noise with smooth weights
    const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), i0 = x0 % n, i1 = (x0 + 1) % n, j0 = (y0 % n) * n, j1 = ((y0 + 1) % n) * n;
    return (a[j0 + i0] * (1 - sx) + a[j0 + i1] * sx) * (1 - sy) + (a[j1 + i0] * (1 - sx) + a[j1 + i1] * sx) * sy;
  };
  const beds = []; // bed tones down the tile
  for (let y = 0; y < S;) { const h = 14 + r() * 40; beds.push([y, y + h, 0.9 + r() * 0.12]); y += h; }
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S;
    const big = noise(u, v, 4, L[0][1]) * 0.5 + noise(u, v, 8, L[1][1]) * 0.3 + noise(u, v, 16, L[2][1]) * 0.2;
    const fine = noise(u, v, 32, L[3][1]) * 0.6 + noise(u, v, 64, L[4][1]) * 0.4;
    const yy = py + (noise(u, v, 8, L[1][1]) - 0.5) * 10; // wavy partings
    let tone = 1, part = 0;
    for (const [a, b, t] of beds) if (yy >= a && yy < b) { tone = t; part = Math.min(yy - a, b - yy); break; }
    let k = tone * (0.86 + big * 0.2 + (fine - 0.5) * 0.12);
    if (part < 1.6) k *= 0.88 + part * 0.075; // the parting: a thin shadowed line
    k *= 1 - ss(0.62, 0.8, big) * 0.12; // weathered grey patches
    const i = (py * S + px) * 4;
    img.data[i] = 226 * k; img.data[i + 1] = 220 * k; img.data[i + 2] = 206 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(70,64,56,0.3)';
  for (let i = 0; i < 9; i++) { // a few joints, mostly vertical
    let x = r() * S, y = r() * S;
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 8; y += 8 + r() * 14; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 24; i++) { // rain streaks
    const x = r() * S, gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(70,64,56,0)');
    gr.addColorStop(0.5, `rgba(70,64,56,${0.04 + r() * 0.08})`);
    gr.addColorStop(1, 'rgba(70,64,56,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 2 + r() * 5, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  rockMat = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.95, metalness: 0 });
  return rockMat;
}

/**
 * A heightfield mesh with its own vertex colours (paint(x, y, z, ny) -> THREE.Color) on the limestone
 * material, for the escarpment: Parts would flatten the colours to one tint.
 */
export function rockMesh(geom, paint, tile = 16) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  projectUV(g, tile);
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = paint(p.getX(i), p.getY(i), p.getZ(i), n.getY(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, limestone());
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A belt of wire on screw pickets from (x0, z0) to (x1, z1): pickets every ~3 m, three strands and crossed aprons. */
export function wire(P, x0, z0, x1, z1, r = Math.random) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)), nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = x0 + (x1 - x0) * f + (r() - 0.5) * 0.4, z = z0 + (z1 - z0) * f + (r() - 0.5) * 0.4, h = 1.1 + r() * 0.3;
    P.add('rust', rod(V(x, -0.2, z), V(x + (r() - 0.5) * 0.15, h, z), 0.025, 3));
    pts.push([x, z, h]);
  }
  for (let i = 0; i < n; i++) {
    const [ax, az, ah] = pts[i], [bx, bz, bh] = pts[i + 1];
    for (const f of [0.35, 0.7, 1]) P.add('rust', rod(V(ax, ah * f, az), V(bx, bh * f, bz), 0.008, 3));
    P.add('rust', rod(V(ax, ah, az), V(bx, 0.1, bz), 0.008, 3));
    P.add('rust', rod(V(ax, 0.1, az), V(bx, bh, bz), 0.008, 3));
    for (const s of [-1, 1]) P.add('rust', rod(V(ax, ah, az), V(ax + nx * s * 1.4, 0.05, az + nz * s * 1.4), 0.007, 3)); // apron guys
  }
}

/** A fire trench along the polyline pts [[x, z], ...]: a dark floor between two low parapets of spoil. */
export function trench(P, pts, { w = 1.3, r = Math.random, tint = 0xb8a47e } = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, nx = -dz / len, nz = dx / len;
    P.add('earth', place(box(len + w * 0.6, 0.06, w), cx, 0.05, cz, ry), { tint: 0x3a3024 });
    for (const s of [-1, 1]) {
      const h = s < 0 ? 0.5 : 0.35; // the parapet toward the enemy is the higher one
      const b = 0.9 + r() * 0.3; // a berm with sloped sides, a little longer than the bay so the corners close
      P.add('earth', place(sideProfile([[-b, -0.1], [b, -0.1], [0.25, h], [-0.25, h]], len + 0.5), cx + nx * s * (w / 2 + b * 0.7), 0, cz + nz * s * (w / 2 + b * 0.7), ry), { tint });
    }
  }
}

/** A camouflage net w x d on four poles with a sag, top at y, centred on the origin (the net key of fieldMats). */
export function net(P, w, d, y, sag, seed) {
  const r = mulberry32(seed), g = new THREE.PlaneGeometry(w, d, 10, 10).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2);
    p.setY(i, y - sag * (1 - u * u) * (1 - v * v) + (r() - 0.5) * 0.08 - Math.max(0, Math.abs(u) - 0.75) * 2.2 - Math.max(0, Math.abs(v) - 0.8) * 1.6);
  }
  g.computeVertexNormals();
  P.add('net', g);
  for (const [px, pz] of [[-w * 0.38, -d * 0.4], [w * 0.38, -d * 0.4], [-w * 0.38, d * 0.4], [w * 0.38, d * 0.4]]) P.add('wood', rod(V(px, 0, pz), V(px, y - 0.05, pz), 0.05, 5));
}

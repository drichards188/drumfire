import * as THREE from 'three';
import { Parts, V, box, rbox, rod, sphere, xTube, yTube, zTube, grainTextures, woodTextures, loft } from '../../kit.js';
import { mulberry32 } from '../../../noise.js';
import { conifer, sandbagWall, siteMats } from './vweap_kit.js';

// The shared works behind a battery, in the gun's local frame (forward -Z).
// Each segment samples the real terrain; the long connecting trench follows the slope.
let shared;
function materials() {
  if (shared) return shared;
  const grain = grainTextures(), wood = woodTextures();
  return shared = {
    ...siteMats(),
    sod: new THREE.MeshStandardMaterial({ color: 0x555b3d, roughness: 1, normalMap: grain.normal, vertexColors: true }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x72634d, roughness: 1, normalMap: grain.normal, vertexColors: true }),
    net: new THREE.MeshStandardMaterial({ color: 0x646748, roughness: 1, side: THREE.DoubleSide, vertexColors: true }),
    soil: new THREE.MeshStandardMaterial({ color: 0x62513c, roughness: 1, normalMap: grain.normal, normalScale: new THREE.Vector2(0.65, 0.65), vertexColors: true }),
    trench: new THREE.MeshStandardMaterial({ color: 0x302b23, roughness: 1, normalMap: grain.normal, vertexColors: true }),
    log: new THREE.MeshStandardMaterial({ color: 0x756550, roughness: 1, map: wood.map, normalMap: wood.normal, vertexColors: true }),
    wire: new THREE.MeshStandardMaterial({ color: 0x272923, roughness: 0.95, vertexColors: true }),
    tarp: new THREE.MeshStandardMaterial({ color: 0x464c38, roughness: 1, side: THREE.DoubleSide, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4e5047, roughness: 0.8, metalness: 0.35, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x20221f, roughness: 0.96, vertexColors: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x384947, roughness: 0.34, metalness: 0.15, vertexColors: true }),
  };
}

// Profiled earth follows the ground at every cross section, including the outer toe.
function earthBank(P, a, b, h, { width = 1.65, height = 0.85, tint = 0xffffff } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const nx = dz / len, nz = -dx / len, n = Math.max(1, Math.ceil(len / 1.1)), rings = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + dx * t, z = a.z + dz * t;
    const crest = height * (0.95 + 0.08 * Math.sin(x * 2.3 + z * 1.7));
    rings.push([[-0.5, -0.08], [-0.34, crest * 0.85], [-0.02, crest], [0.5, 0.015]].map(([u, y]) => {
      const px = x + nx * u * width, pz = z + nz * u * width;
      return V(px, h(px, pz) + y, pz);
    }));
  }
  P.add('soil', loft(rings), { tint });
}

function groundStrip(P, a, b, h, width, key = 'trench', lift = 0.035) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const nx = dz / len * width / 2, nz = -dx / len * width / 2;
  const vertices = [];
  const n = Math.max(1, Math.ceil(len / 1.3));
  for (let i = 0; i < n; i++) {
    const point = (t, side) => {
      const x = a.x + dx * t + side * nx, z = a.z + dz * t + side * nz;
      return V(x, h(x, z) + lift, z);
    };
    const a0 = point(i / n, -1), a1 = point(i / n, 1), b0 = point((i + 1) / n, -1), b1 = point((i + 1) / n, 1);
    vertices.push(a0, b0, a1, a1, b0, b1);
  }
  const g = new THREE.BufferGeometry().setFromPoints(vertices);
  g.computeVertexNormals();
  P.add(key, g);
}

function segment(P, a, b, h, { roof = false, wire = false } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const yaw = Math.atan2(dx, dz), nx = Math.cos(yaw), nz = -Math.sin(yaw);
  const n = Math.max(1, Math.ceil(len / 1.6));
  groundStrip(P, a, b, h, 1.65);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = a.x + dx * t, z = a.z + dz * t, y = h(x, z), l = len / n + 0.08;
    for (const side of [-1, 1]) {
      const sx = x + side * nx * 1.35, sz = z + side * nz * 1.35;
      // Leave the banks open where a communicating trench enters another route.
      const junction = P.trenchJunctions?.some(p => Math.hypot(sx - p.x, sz - p.z) < 1.65);
      if (junction) continue;
      earthBank(P, { x: sx - dx / n / 2, z: sz - dz / n / 2 },
        { x: sx + dx / n / 2, z: sz + dz / n / 2 }, h, { tint: i % 3 ? 0xffffff : 0xd1c2a7 });
      for (let row = 0; row < 3; row++) P.add('log', box(0.09, 0.18, l, x + side * nx * 0.72, y + 0.16 + row * 0.19,
        z + side * nz * 0.72, 0, yaw), { tint: row % 2 ? 0xb6aa92 : 0xe0d3b6 });
      P.add('log', rod(V(x + side * nx * 0.65, y + 0.02, z + side * nz * 0.65),
        V(x + side * nx * 0.7, y + 0.83, z + side * nz * 0.7), 0.065, 6));
      if (i % 3 !== 1) P.add('sod', sphere(1, sx + side * nx * 0.2, h(sx, sz) + 0.78, sz + side * nz * 0.2, 0.48, 0.13, 0.45, 6));
    }
    // Duckboards leave a dark drainage channel visible on either side.
    for (let j = 0; j < 3; j++) {
      const offset = (j - 1) * l / 3, px = x + Math.sin(yaw) * offset, pz = z + Math.cos(yaw) * offset;
      P.add('plank', box(0.91, 0.055, l / 3 - 0.07, px, h(px, pz) + 0.08, pz, 0, yaw), { tint: i % 3 ? 0xb0a28b : 0x8b806c });
    }
    if (roof && i % 11 === 4) {
      for (let j = -2; j <= 2; j++) P.add('log', box(2.8, 0.16, 0.19, x + Math.sin(yaw) * j * 0.22, y + 0.94, z + Math.cos(yaw) * j * 0.22, 0, yaw));
      P.add('sod', box(2.75, 0.18, 1.15, x, y + 1.1, z, 0, yaw));
    }
    if (wire) {
      const t0 = i / n, t1 = (i + 1) / n;
      const cable = t => { const px = a.x + dx * t + nx * 0.57, pz = a.z + dz * t + nz * 0.57; return V(px, h(px, pz) + 0.14, pz); };
      P.add('wire', rod(cable(t0), cable(t1), 0.012, 4));
    }
  }
}

function trenchPath(P, pts, h, options = {}) {
  (P.trenchRoutes ??= []).push({ pts, h, options });
}

function buildTrenches(P) {
  const routes = P.trenchRoutes || [];
  P.trenchJunctions = [];
  // Feed the later branches into the already laid route, even across a zigzag.
  for (let r = 1; r < routes.length; r++) {
    let nearest = null, endpoint = null, distance = 4.3;
    for (const p of [routes[r].pts[0], routes[r].pts.at(-1)]) {
      for (let q = 0; q < r; q++) for (let i = 1; i < routes[q].pts.length; i++) {
        const a = routes[q].pts[i - 1], b = routes[q].pts[i], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        const x = a.x + t * dx, z = a.z + t * dz, d = Math.hypot(p.x - x, p.z - z);
        if (d < distance) { nearest = { x, z }; endpoint = p; distance = d; }
      }
    }
    if (nearest) Object.assign(endpoint, nearest);
  }
  // An endpoint close to another route opens both banks into a usable junction.
  for (const route of routes) for (const p of [route.pts[0], route.pts.at(-1)]) {
    for (const other of routes) {
      if (other === route) continue;
      for (let i = 1; i < other.pts.length; i++) {
        const a = other.pts[i - 1], b = other.pts[i], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        const x = a.x + t * dx, z = a.z + t * dz;
        if (Math.hypot(p.x - x, p.z - z) < 2.5) P.trenchJunctions.push({ x, z });
      }
    }
  }
  for (const { pts, h, options } of routes) for (let i = 0; i < pts.length - 1; i++) segment(P, pts[i], pts[i + 1], h, options);
}

// Open weave with uneven strips, a sagging outline and actual gaps to the roof below.
function camouflage(P, x, z, w, d, h, y, rnd) {
  const at = (u, v) => V(x + u * w, y + 0.65 * (u * u + v * v) + 0.09 * Math.sin(u * 13 + v * 9), z + v * d);
  for (const u of [-0.5, 0.5]) for (const v of [-0.5, 0.5]) {
    const p = at(u, v);
    P.add('log', rod(V(p.x, h(p.x, p.z), p.z), p, 0.055, 6));
    const anchor = V(p.x + u * 2, h(p.x + u * 2, p.z + v * 2) + 0.05, p.z + v * 2);
    P.add('wire', rod(p, anchor, 0.012, 4));
  }
  const cols = Math.ceil(w / 0.45), rows = Math.ceil(d / 0.5);
  for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) {
    const u = i / cols - 0.5, v = j / rows - 0.5;
    P.add('wire', rod(at(u, v), at(u, v + 1 / rows), 0.012, 4));
    if (i === cols) continue;
    P.add('wire', rod(at(u, v), at(u + 1 / cols, v), 0.012, 4));
    if (rnd() < 0.22) continue;
    const a = at(u + 0.04 / cols, v + 0.05 / rows), b = at(u + 0.91 / cols, v + 0.2 / rows);
    const c = at(u + 0.8 / cols, v + 0.9 / rows), e = at(u + 0.15 / cols, v + 0.72 / rows);
    const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, e]); g.computeVertexNormals();
    P.add('net', g, { tint: rnd() < 0.45 ? 0x9e8b61 : rnd() < 0.5 ? 0x606747 : 0xc3bb92 });
  }
}

function shelter(P, x, z, h, rnd, { w = 5.2, d = 4.4, open = false, command = false } = {}) {
  const y = h(x, z), left = x - w / 2, right = x + w / 2;
  P.add('trench', box(w - 0.4, 0.05, d - 0.3, x, y + 0.035, z));
  for (const side of [-1, 1]) {
    P.add('soil', box(1.1, 1.45, d + 0.65, x + side * (w / 2 + 0.15), y + 0.63, z));
    P.add('log', box(0.12, 1.14, d - 0.2, x + side * (w / 2 - 0.45), y + 0.58, z));
    for (let t = -d / 2 + 0.35; t < d / 2; t += 0.55)
      P.add('log', box(0.1, 1.25, 0.1, x + side * (w / 2 - 0.46), y + 0.63, z + t));
  }
  P.add('soil', box(w + 1.4, 1.45, 0.95, x, y + 0.64, z + d / 2 + 0.15));
  for (const side of [-1, 1]) P.add('soil', box((w - 1.65) / 2, 1.25, 0.75,
    x + side * ((w + 1.65) / 4), y + 0.57, z - d / 2));
  for (let t = -w / 2; t < w / 2; t += 0.55) P.add('log', box(0.22, 0.14, d + 0.3, x + t, y + 1.33, z));
  if (!open) {
    P.add('soil', loft([
      [V(x-w/2-1, y+1.28, z-d/2-0.5), V(x+w/2+1, y+1.28, z-d/2-0.5), V(x+w/2+1, y+1.28, z+d/2+0.7), V(x-w/2-1, y+1.28, z+d/2+0.7)],
      [V(x-w/2+0.2, y+1.85, z-d/2+0.4), V(x+w/2-0.2, y+1.78, z-d/2+0.4), V(x+w/2-0.2, y+1.85, z+d/2-0.2), V(x-w/2+0.2, y+1.8, z+d/2-0.2)],
    ]));
    for (let i = 0; i < 13; i++) {
      const sx = x + (rnd() - 0.5) * (w + 1.4), sz = z + (rnd() - 0.5) * (d + 0.7);
      P.add('sod', sphere(1, sx, y + 1.85, sz, 0.3, 0.09, 0.22, 7), { tint: rnd() < 0.5 ? 0x908d68 : 0xffffff });
    }
  } else {
    for (const side of [-1, 1]) P.add('tarp', box(0.6, 0.035, d + 0.4, x + side * (w / 2 - 0.3), y + 1.48, z));
  }
  // Dark recess, heavy jambs and lintel make the entrance readable under the earth roof.
  P.add('trench', box(1.45, 1.12, 0.04, x, y + 0.58, z - d / 2 + 0.55));
  for (const side of [-1, 1]) P.add('log', yTube(y, y + 1.4, 0.13, 0.11, 8, x + side * 0.84, z - d / 2 - 0.2));
  P.add('log', xTube(x - 1.03, x + 1.03, 0.15, 0.15, 8, y + 1.34, z - d / 2 - 0.2));
  P.add('plank', box(1.6, 0.13, 0.7, x, y + 0.12, z - d / 2 - 0.6));
  P.add('plank', box(1.6, 0.13, 0.7, x, y + 0.23, z - d / 2 - 1.15));
  if (command) {
    camouflage(P, x, z - d / 2 - 0.9, w + 1.4, 3.2, h, y + 2.1, rnd);
    P.add('steel', yTube(y + 1.8, y + 2.55, 0.1, 0.1, 8, x - w / 2 + 0.7, z + 1));
    P.add('steel', box(0.35, 0.06, 0.35, x - w / 2 + 0.7, y + 2.57, z + 1));
    P.add('plank', box(1.6, 0.12, 0.88, x - 0.9, y + 0.85, z + 0.3));
    for (const dx of [-1.5, -0.3]) P.add('log', box(0.09, 0.8, 0.09, x + dx, y + 0.42, z + 0.3));
    P.add('steel', box(0.42, 0.25, 0.4, x + 1.05, y + 0.26, z + 0.5)); // field telephone
    P.add('wire', rod(V(x + 1.05, y + 0.48, z + 0.5), V(x + 1.6, y + 0.1, z + 1.4), 0.012, 5));
    P.add('log', yTube(y, y + 4.8, 0.055, 0.035, 6, x + w / 2 + 1.4, z + d / 2 - 0.3));
    for (const s of [-1, 1]) P.add('wire', rod(V(x + w / 2 + 1.4, y + 4.55, z + d / 2 - 0.3),
      V(x + w / 2 + 1.4 + s * 2.1, y + 0.2, z + d / 2 + 1.1), 0.007, 4));
  }
  return { left, right, front: z - d / 2, back: z + d / 2 };
}

function ammunition(P, x, z, h, rnd, kind) {
  const y = h(x, z), w = kind === 'nbw41' ? 8 : 10;
  P.add('trench', box(w, 0.04, 7.5, x, y + 0.025, z));
  for (const side of [-1, 1]) {
    P.add('soil', box(1.3, 1.2, 8.2, x + side * (w / 2 + 0.35), y + 0.48, z));
    P.add('log', box(0.13, 0.9, 7.5, x + side * (w / 2 - 0.4), y + 0.47, z));
  }
  P.add('soil', box(w + 1.7, 1.25, 1.1, x, y + 0.49, z + 4));
  P.add('log', box(w + 1, 0.13, 0.2, x, y + 1.1, z + 3.35));
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    const cx = x + side * 2.25, cz = z - 2.2 + i * 1.75;
    if (kind === 'nbw41') {
      P.add('plank', rbox(1.15, 0.55, 1.05, 0.04, cx, y + 0.3, cz));
      P.add('log', box(1.2, 0.06, 0.08, cx, y + 0.59, cz));
    } else {
      const r = kind === 'mrs18' ? 0.12 : kind === 'k18' ? 0.1 : 0.075;
      for (let j = 0; j < 3; j++) {
        const sx = cx + (j - 1) * 0.27;
        P.add('steel', zTube(cz - 0.47, cz + 0.38, r, r, 10, sx, y + r + 0.11));
        P.add('steel', zTube(cz - 0.7, cz - 0.47, 0.015, r, 10, sx, y + r + 0.11));
        P.add('plank', box(0.12, 0.12, 1.15, sx, y + 0.07, cz - 0.1));
      }
    }
  }
  for (let i = 0; i < 8; i++) P.add('log', box(w - 0.4, 0.13, 0.22, x, y + 2.1, z + 0.2 + i * 0.46));
  P.add('tarp', box(w - 0.2, 0.03, 3.6, x, y + 2.22, z + 1.8), { tint: 0xb2ae91 });
  camouflage(P, x, z + 1.2, w + 2.4, 6, h, y + 2.6, rnd);
  for (const side of [-1, 1]) for (let stack = 0; stack < 2; stack++) {
    const cx = x + side * (w / 2 - 1.2), cz = z + 2.2;
    P.add('plank', box(1.3, 0.48, 0.75, cx, y + 0.28 + stack * 0.5, cz), { tint: stack ? 0xc2b79b : 0x9c927b });
    for (const strap of [-0.42, 0.42]) P.add('steel', box(0.055, 0.49, 0.77, cx + strap, y + 0.28 + stack * 0.5, cz));
  }
  for (let i = 0; i < 7; i++) {
    const sx = x - w / 2 + 0.5 + i * (w - 1) / 6;
    P.add('log', rod(V(sx, y + 0.1, z - 0.2), V(sx, y + 2.15, z + 0.2), 0.06, 5));
  }
  for (let i = 0; i < 14; i++) {
    const bx = x + (rnd() - 0.5) * (w + 3), bz = z + (rnd() - 0.5) * 9;
    if (Math.abs(bx - x) < w / 2 - 0.4 && Math.abs(bz - z) < 3.5) continue;
    P.add('foliage', sphere(1, bx, h(bx, bz) + 0.15, bz, 0.38, 0.2, 0.32, 7));
  }
}

function observation(P, x, z, h, rnd) {
  const y = h(x, z);
  P.add('trench', box(3.2, 0.04, 2.6, x, y + 0.02, z));
  sandbagWall(P, x - 2, z - 1.5, x + 2, z - 1.5, 3, y, 31);
  for (const side of [-1, 1]) P.add('soil', box(0.85, 0.7, 3, x + side * 1.95, y + 0.3, z));
  P.add('log', yTube(y + 0.3, y + 1.55, 0.035, 0.035, 6, x + 0.3, z + 0.2));
  P.add('steel', box(0.35, 0.18, 0.22, x + 0.3, y + 1.56, z + 0.2)); // binocular head
  for (const side of [-1, 1]) {
    P.add('steel', zTube(z - 0.23, z + 0.17, 0.065, 0.06, 8, x + 0.3 + side * 0.11, y + 1.56));
    P.add('glass', zTube(z - 0.24, z - 0.23, 0.055, 0.055, 8, x + 0.3 + side * 0.11, y + 1.56));
  }
  for (const [dx, dz] of [[-0.5, 0.45], [0.5, 0.45], [0, -0.45]]) P.add('steel', rod(V(x + 0.3, y + 1.15, z + 0.2), V(x + 0.3 + dx, y + 0.08, z + 0.2 + dz), 0.025, 5));
  camouflage(P, x, z + 0.1, 5.5, 3.9, h, y + 2.25, rnd);
  for (let i = 0; i < 6; i++) P.add('foliage', sphere(1, x - 2.5 + rnd() * 5, y + 0.3, z - 1.5 + rnd() * 0.7, 0.35, 0.18, 0.3, 7));
}

function foxhole(P, x, z, h) {
  const y = h(x, z);
  P.add('trench', box(1.5, 0.04, 1.9, x, y + 0.02, z));
  sandbagWall(P, x - 0.95, z - 1, x + 0.95, z - 1, 2, y, 49);
  P.add('soil', box(0.55, 0.42, 2.1, x - 1.05, y + 0.18, z));
  P.add('soil', box(0.55, 0.42, 2.1, x + 1.05, y + 0.18, z));
}

function truck(x, y, z, yaw) {
  const root = new THREE.Group(); root.name = 'battery-supply-truck';
  root.position.set(x, y, z); root.rotation.y = yaw;
  const P = new Parts(materials());
  P.add('steel', box(1.9, 0.3, 5.6, 0, 0.72, 0));
  P.add('steel', box(1.9, 1.25, 1.6, 0, 1.55, -1.45));
  P.add('steel', box(1.55, 0.75, 0.9, 0, 1.2, -2.55));
  P.add('glass', box(1.55, 0.52, 0.035, 0, 1.89, -2.27, -0.12));
  P.add('plank', box(2.06, 0.17, 3.25, 0, 1.1, 1.1));
  P.add('tarp', rbox(2.1, 1.35, 3.25, 0.28, 0, 1.82, 1.05));
  for (const s of [-1, 1]) {
    for (const zz of [-1.65, 1.65]) {
      P.add('tyre', xTube(s * 0.91 - 0.16, s * 0.91 + 0.16, 0.5, 0.5, 16, 0.52, zz));
      P.add('steel', xTube(s * 1.08, s * 1.12, 0.23, 0.23, 12, 0.52, zz));
    }
    P.add('glass', box(0.025, 0.42, 0.66, s * 0.96, 1.84, -1.45));
    P.add('steel', box(0.13, 0.15, 0.18, s * 0.82, 1.02, -2.9));
  }
  for (const xx of [-0.62, 0.62]) P.add('glass', sphere(0.13, xx, 1.4, -3.02, 1, 1, 0.45, 8));
  P.build(root);
  return root;
}

export function buildGermanBatteryWorks({ kind, origin, bearing, pieces, terrain, seed = 1, woodland = true }) {
  const rnd = mulberry32(seed * 337 + 83), root = new THREE.Group();
  root.name = `${kind}-battery-works`;
  const theta = -bearing, cs = Math.cos(theta), sn = Math.sin(theta), y0 = terrain.heightAt(origin.x, origin.z);
  root.position.set(origin.x, y0, origin.z); root.rotation.y = theta;
  const h = (x, z) => terrain.heightAt(origin.x + x * cs + z * sn, origin.z - x * sn + z * cs) - y0;
  const local = pieces.map((p) => {
    const dx = p.x - origin.x, dz = p.z - origin.z;
    return { x: dx * cs - dz * sn, z: dx * sn + dz * cs };
  }).sort((a, b) => a.x - b.x);
  const P = new Parts(materials());

  if (kind === 'gustav') {
    // The rail and gantry installation already exists; keep its route unobstructed.
    const command = shelter(P, -32, 24, h, rnd, { w: 7, d: 5, command: true });
    ammunition(P, -34, 40, h, rnd, 'mrs18');
    observation(P, -28, -52, h, rnd);
    trenchPath(P, [{ x: -29, z: -50 }, { x: -34, z: -28 }, { x: -29, z: -8 }, { x: -35, z: 12 }, { x: -32, z: command.front }], h, { roof: true, wire: true });
    for (const [x, z] of [[-30, -76], [30, -67], [-34, 67], [33, 74]]) foxhole(P, x, z, h);
    for (let z = -65; z <= 65; z += 12) if (rnd() < 0.78) {
      const x = -43 - rnd() * 5;
      conifer(P, x, z, 7 + rnd() * 5, rnd, h(x, z));
    }
  } else {
    const single = local.length === 1;
    const rear = kind === 'karl' ? 30 : kind === 'bertha' ? 20 : kind === 'nbw41' ? 13 :
      kind === 'k18' || kind === 'mrs18' ? 20 : kind === 'sfh18' ? 17 : 16;
    const xs = local.map((p) => p.x), left = Math.min(...xs) - (single ? 13 : 12), right = Math.max(...xs) + (single ? 15 : 12);
    const mid = (left + right) / 2, lineZ = rear;
    const line = [{ x: left, z: lineZ }];
    for (let x = left + 11, i = 0; x < right; x += 11, i++) line.push({ x, z: lineZ + (i % 2 ? -2.8 : 2.8) });
    line.push({ x: right, z: lineZ });
    trenchPath(P, line, h, { roof: kind !== 'nbw41', wire: true });
    const side = kind === 'bertha' || kind === 'karl' ? 8 : kind === 'k18' || kind === 'mrs18' ? 6 : kind === 'sfh18' ? 4.5 : 3.7;
    for (const p of local) {
      const tx = p.x - side - 2.4;
      trenchPath(P, [{ x: tx, z: p.z + (kind === 'nbw41' ? 7 : kind === 'karl' ? 13 : 11) },
        { x: tx - 1.9, z: lineZ - 5 }, { x: tx, z: lineZ }], h, { roof: false, wire: true });
      foxhole(P, p.x + side + 4.5, p.z - 10, h);
    }
    const cmdX = mid - 8, cmdZ = rear + 16;
    const command = shelter(P, cmdX, cmdZ, h, rnd, { w: single ? 5.6 : 6.2, d: 5, command: true });
    trenchPath(P, [{ x: cmdX, z: rear + 1 }, { x: cmdX - 2, z: rear + 6 }, { x: cmdX, z: command.front - 1.3 }], h, { roof: false, wire: true });
    shelter(P, mid - 23, rear + 17, h, rnd, { w: 5, d: 4.5 });
    trenchPath(P, [{ x: mid - 23, z: rear + 1 }, { x: mid - 21, z: rear + 7 }, { x: mid - 23, z: rear + 13 }], h);
    ammunition(P, mid + 13, rear + 16, h, rnd, kind);
    trenchPath(P, [{ x: mid + 13, z: rear + 1 }, { x: mid + 11, z: rear + 8 }, { x: mid + 13, z: rear + 12 }], h, { wire: true });
    observation(P, left - 10, -25, h, rnd);
    trenchPath(P, [{ x: left, z: rear }, { x: left - 7, z: rear - 12 }, { x: left - 8, z: -8 }, { x: left - 10, z: -22 }], h, { wire: true });
    for (const x of [left - 6, right + 7]) foxhole(P, x, rear + 7, h);
    // The rear approach is disguised by trees/brush; wheel ruts lead to the reserve ammunition bay.
    const approach = [{ x: mid + 13, z: rear + 20 }, { x: mid + 7, z: rear + 28 }, { x: mid + 6.5, z: rear + 39 }, { x: mid + 10, z: rear + 51 }];
    for (let i = 1; i < approach.length; i++) {
      const a = approach[i - 1], b = approach[i], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      groundStrip(P, a, b, h, 3.5, 'dirt', 0.023);
      for (const side of [-1, 1]) {
        const nx = dz / len * side * 0.92, nz = -dx / len * side * 0.92;
        groundStrip(P, { x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz }, h, 0.48, 'trench', 0.035);
      }
    }
    if (woodland) {
      for (let x = left - 17; x < right + 20; x += 8.5) {
        if (Math.abs(x - mid - 6.5) < 8 || rnd() < 0.25) continue;
        const tx = x + (rnd() - 0.5) * 2, tz = rear + 34 + rnd() * 8;
        conifer(P, tx, tz, 6 + rnd() * 4, rnd, h(tx, tz));
      }
    } else for (let i = 0; i < 18; i++) {
      const x = left - 12 + rnd() * (right - left + 24), z = rear + 27 + rnd() * 18;
      P.add('foliage', sphere(1, x, h(x, z) + 0.28, z, 0.55, 0.3, 0.42, 7), { tint: 0xa79f79 });
    }
    root.add(truck(mid + 6.5, h(mid + 6.5, rear + 34), rear + 34, Math.PI / 2));
  }
  buildTrenches(P);
  P.build(root);
  return { root };
}

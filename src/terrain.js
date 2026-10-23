import * as THREE from 'three';
import { heightAt, heightLod, normalAt, padMask, los, wetAt, waterTable, groundSmooth, groundKindAt, CRATER_LAYERS, CRATER } from './terrainHeight.js';
import { fieldGLSL } from './terrainField.js';
import { patchMaterial, noiseGLSL, globalUniforms } from './shaderlib.js';
import { makeTileableNormalMap } from './noise.js';
import { Trees } from './vegetation.js';
import { Grass } from './grass.js';
import { Craters, profileGLSL } from './craters.js';
import { segmentsIn, TRACK_WIDTH } from './trenchlines.js';
import { ZONE, PLACES } from './sector.js';

export { heightAt, normalAt, los };

// Camera-centred geometry clipmap built on the CPU from the same pure heightAt the sim uses.
// Level k is an (N+1)^2 grid with cell 2.5 * 2^k metres whose vertices sit on the world grid; the
// level above it is drawn with the quads under the finer one left out. Cracks between levels are
// hidden by skirts. Levels re-centre in steps of two cells and reuse the heights they already have.
// Levels 0 to 2 also carry the runtime craters (patched in when a crater lands).
const N = 80;
const BASE_CELL = 2.5;
const LEVELS = 10; // 200 m, 400 m ... 102 km across
const CRATER_LEVELS = 3; // levels whose vertices dent
const STRIDE = 5; // per grid point cache: height, water table, wetness, pad, smooth ground

const DBG = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('tdbg') || '' : ''; // shader bisecting aid

const QUALITY = {
  Low: { grass: 30000, trees: 0.45, grassRadius: 38 },
  Medium: { grass: 80000, trees: 0.8, grassRadius: 48 },
  High: { grass: 150000, trees: 1, grassRadius: 58 },
  Ultra: { grass: 240000, trees: 1.2, grassRadius: 70 },
};

class Level {
  constructor(k, terrain) {
    this.k = k;
    this.terrain = terrain;
    this.cell = BASE_CELL * 2 ** k;
    const G = N + 3; // one extra ring of heights for the normals
    this.G = G;
    this.h = new Float32Array(G * G * STRIDE);
    this.h2 = new Float32Array(G * G * STRIDE);
    this.gx0 = 1e9; // global grid index of h[0]
    this.gz0 = 1e9;
    this.cx = 1e9; // snapped centre (world metres)
    this.cz = 1e9;
    this.valid = false;
    const V = (N + 1) * (N + 1), P = 4 * N;
    this.V = V;
    this.pos = new Float32Array((V + P) * 3);
    this.nrm = new Float32Array((V + P) * 3);
    this.info = new Float32Array((V + P) * 4); // pad + 2 * level, wetness, smooth ground, water table
    this.index = new Uint16Array(N * N * 6 + P * 6);
    this.geo = new THREE.BufferGeometry();
    const dyn = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('normal', dyn(this.nrm, 3));
    this.geo.setAttribute('aInfo', dyn(this.info, 4));
    this.geo.setIndex(new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.hole = null; // finer level's rect { x0, x1, z0, z1 } in world metres, or null
    this.holeKey = '';
    // perimeter order: south (x up), east (z up), north (x down), west (z down)
    const per = [];
    for (let i = 0; i < N; i++) per.push(i); // z = 0
    for (let j = 0; j < N; j++) per.push(j * (N + 1) + N); // x = N
    for (let i = N; i > 0; i--) per.push(N * (N + 1) + i); // z = N
    for (let j = N; j > 0; j--) per.push(j * (N + 1)); // x = 0
    this.per = per;
    this.detail = k <= 3;
    this.dents = k < CRATER_LEVELS;
  }

  // one grid point of the cache
  sample(arr, o, gx, gz) {
    const c = this.cell, x = gx * c, z = gz * c;
    let h = heightLod(x, z, c);
    if (this.dents) h += this.terrain.craters.delta(x, z, true);
    arr[o] = h;
    arr[o + 1] = waterTable(x, z);
    arr[o + 2] = wetAt(x, z);
    arr[o + 3] = this.detail ? padMask(x, z) : 0;
    arr[o + 4] = groundSmooth(x, z);
  }

  // world index of grid point (gx, gz) -> height, computing what the previous centre did not have
  rebuild(cx, cz) {
    const c = this.cell, G = this.G, half = N / 2;
    const gx0 = Math.round(cx / c) - half - 1, gz0 = Math.round(cz / c) - half - 1;
    const old = this.h, nu = this.h2;
    const ox = this.gx0, oz = this.gz0;
    for (let b = 0; b < G; b++) {
      const gz = gz0 + b;
      for (let a = 0; a < G; a++) {
        const gx = gx0 + a;
        const oa = gx - ox, ob = gz - oz, o = (b * G + a) * STRIDE;
        if (this.valid && oa >= 0 && oa < G && ob >= 0 && ob < G) {
          const s = (ob * G + oa) * STRIDE;
          for (let q = 0; q < STRIDE; q++) nu[o + q] = old[s + q];
        } else this.sample(nu, o, gx, gz);
      }
    }
    this.h = nu;
    this.h2 = old;
    this.gx0 = gx0;
    this.gz0 = gz0;
    this.cx = cx;
    this.cz = cz;
    this.valid = true;
    this.finalize(0, N, 0, N);
    this.holeKey = '';
  }

  // vertices i0..i1, j0..j1 (inclusive) from the cache, and the skirt around the perimeter
  finalize(i0, i1, j0, j1) {
    const c = this.cell, G = this.G, h = this.h, gx0 = this.gx0, gz0 = this.gz0;
    const pos = this.pos, nrm = this.nrm, info = this.info;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * (N + 1) + i;
        const a = i + 1, b = j + 1; // centre of the (N+3) array
        const o = (b * G + a) * STRIDE;
        pos[idx * 3] = (gx0 + a) * c;
        pos[idx * 3 + 1] = h[o];
        pos[idx * 3 + 2] = (gz0 + b) * c;
        const dx = h[o - STRIDE] - h[o + STRIDE];
        const dz = h[o - G * STRIDE] - h[o + G * STRIDE];
        const inv = 1 / Math.sqrt(dx * dx + 4 * c * c + dz * dz);
        nrm[idx * 3] = dx * inv;
        nrm[idx * 3 + 1] = 2 * c * inv;
        nrm[idx * 3 + 2] = dz * inv;
        info[idx * 4] = h[o + 3] * 0.999 + 2 * this.k; // pad 0..1, plus twice the level
        info[idx * 4 + 1] = h[o + 2];
        info[idx * 4 + 2] = h[o + 4];
        info[idx * 4 + 3] = h[o + 1];
      }
    }
    const V = this.V, skirt = c * 0.55 + 0.5;
    for (let s = 0; s < this.per.length; s++) {
      const src = this.per[s], dst = V + s;
      pos[dst * 3] = pos[src * 3];
      pos[dst * 3 + 1] = pos[src * 3 + 1] - skirt;
      pos[dst * 3 + 2] = pos[src * 3 + 2];
      nrm[dst * 3] = nrm[src * 3];
      nrm[dst * 3 + 1] = nrm[src * 3 + 1];
      nrm[dst * 3 + 2] = nrm[src * 3 + 2];
      for (let q = 0; q < 4; q++) info[dst * 4 + q] = info[src * 4 + q];
    }
    for (const a of ['position', 'normal', 'aInfo']) this.geo.attributes[a].needsUpdate = true;
  }

  // a crater landed in the world rectangle: re-sample the grid points under it and redo the vertices
  patch(x0, z0, x1, z1) {
    if (!this.valid) return;
    const c = this.cell, G = this.G;
    const a0 = Math.max(0, Math.floor(x0 / c) - this.gx0), a1 = Math.min(G - 1, Math.ceil(x1 / c) - this.gx0);
    const b0 = Math.max(0, Math.floor(z0 / c) - this.gz0), b1 = Math.min(G - 1, Math.ceil(z1 / c) - this.gz0);
    if (a0 > a1 || b0 > b1) return;
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) this.sample(this.h, (b * G + a) * STRIDE, this.gx0 + a, this.gz0 + b);
    this.finalize(Math.max(0, a0 - 2), Math.min(N, a1), Math.max(0, b0 - 2), Math.min(N, b1));
  }

  // the quads under the finer level are dropped
  setHole(r) {
    const key = r ? `${r.x0}|${r.x1}|${r.z0}|${r.z1}|${this.gx0}|${this.gz0}` : 'none';
    if (key === this.holeKey) return;
    this.holeKey = key;
    const c = this.cell, idx = this.index;
    let n = 0;
    for (let j = 0; j < N; j++) {
      const z0 = (this.gz0 + 1 + j) * c, z1 = z0 + c;
      for (let i = 0; i < N; i++) {
        const x0 = (this.gx0 + 1 + i) * c, x1 = x0 + c;
        if (r && x0 >= r.x0 - 1e-3 && x1 <= r.x1 + 1e-3 && z0 >= r.z0 - 1e-3 && z1 <= r.z1 + 1e-3) continue;
        const a = j * (N + 1) + i, b = a + N + 1;
        idx[n++] = a; idx[n++] = b; idx[n++] = a + 1;
        idx[n++] = a + 1; idx[n++] = b; idx[n++] = b + 1;
      }
    }
    const P = this.per.length, V = this.V;
    for (let s = 0; s < P; s++) {
      const a = this.per[s], b = this.per[(s + 1) % P], a2 = V + s, b2 = V + ((s + 1) % P);
      idx[n++] = a; idx[n++] = b; idx[n++] = a2;
      idx[n++] = b; idx[n++] = b2; idx[n++] = a2;
    }
    this.geo.index.needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }
}

// ---------------------------------------------------------------- trench and road masks
// Two camera-centred textures the shader reads, rasterised from the trench and track polylines:
// near (256 m at 0.5 m): R distance to the nearest trench centre (0..6 m), G distance to the
// nearest road or track (0..8 m), B its kind, A the trench kind; mid (2 km at 2 m) and far (8 km at
// 8 m): R trench coverage, G track coverage (the zig-zag scars for views from altitude).
const NEAR = { size: 512, extent: 256 };
const MID = { size: 1024, extent: 2048 };
const FAR = { size: 1024, extent: 8192 };
class GroundMasks {
  constructor() {
    const mk = (s) => {
      const t = new THREE.DataTexture(new Uint8Array(s * s * 4), s, s, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      return t;
    };
    this.near = mk(NEAR.size);
    this.mid = mk(MID.size);
    this.far = mk(FAR.size);
    this.nearWin = new THREE.Vector4(1e9, 1e9, NEAR.extent, 0);
    this.midWin = new THREE.Vector4(1e9, 1e9, MID.extent, 0);
    this.farWin = new THREE.Vector4(1e9, 1e9, FAR.extent, 0);
    this.ncx = 1e9; this.ncz = 1e9; this.mcx = 1e9; this.mcz = 1e9; this.fcx = 1e9; this.fcz = 1e9;
  }

  // true when it rebuilt something (Terrain.update spreads the heavy work over frames)
  update(p, all) {
    let did = false;
    if (all || Math.abs(p.x - this.ncx) > 56 || Math.abs(p.z - this.ncz) > 56) { this.rebuildNear(Math.round(p.x / 32) * 32, Math.round(p.z / 32) * 32); did = true; }
    if (all || Math.abs(p.x - this.mcx) > 480 || Math.abs(p.z - this.mcz) > 480) { this.rebuildCover(this.mid, this.midWin, MID, Math.round(p.x / 128) * 128, Math.round(p.z / 128) * 128, 'm'); did = true; }
    if (all || Math.abs(p.x - this.fcx) > 1800 || Math.abs(p.z - this.fcz) > 1800) { this.rebuildCover(this.far, this.farWin, FAR, Math.round(p.x / 512) * 512, Math.round(p.z / 512) * 512, 'f'); did = true; }
    return did;
  }

  rebuildNear(cx, cz) {
    this.ncx = cx; this.ncz = cz;
    const S = NEAR.size, ext = NEAR.extent, tx = ext / S, x0 = cx - ext / 2, z0 = cz - ext / 2;
    this.nearWin.set(x0, z0, ext, 1 / S);
    const d = this.near.image.data;
    for (let i = 0; i < S * S; i++) { d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 0; }
    const raster = (segs, reach, ch, kindCh, width) => {
      for (const s of segs) {
        const abx = s.bx - s.ax, abz = s.bz - s.az, l2 = abx * abx + abz * abz + 1e-9;
        const i0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - reach - x0) / tx)), i1 = Math.min(S - 1, Math.ceil((Math.max(s.ax, s.bx) + reach - x0) / tx));
        const j0 = Math.max(0, Math.floor((Math.min(s.az, s.bz) - reach - z0) / tx)), j1 = Math.min(S - 1, Math.ceil((Math.max(s.az, s.bz) + reach - z0) / tx));
        for (let j = j0; j <= j1; j++) {
          const pz = z0 + (j + 0.5) * tx;
          for (let i = i0; i <= i1; i++) {
            const px = x0 + (i + 0.5) * tx;
            const t = Math.max(0, Math.min(1, ((px - s.ax) * abx + (pz - s.az) * abz) / l2));
            const dx = px - s.ax - abx * t, dz = pz - s.az - abz * t;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist >= reach) continue;
            const v = Math.round((dist / reach) * 255), o = (j * S + i) * 4;
            if (v < d[o + ch]) { d[o + ch] = v; d[o + kindCh] = s.kind * 85 + (kindCh === 3 ? 0 : 85); }
          }
        }
      }
    };
    raster(segmentsIn(x0 - 8, z0 - 8, x0 + ext + 8, z0 + ext + 8, 'trench'), 6, 0, 3);
    raster(segmentsIn(x0 - 9, z0 - 9, x0 + ext + 9, z0 + ext + 9, 'track'), 8, 1, 2);
    this.near.needsUpdate = true;
  }

  rebuildCover(tex, win, W, cx, cz, which) {
    if (which === 'm') { this.mcx = cx; this.mcz = cz; } else { this.fcx = cx; this.fcz = cz; }
    const S = W.size, ext = W.extent, tx = ext / S, x0 = cx - ext / 2, z0 = cz - ext / 2;
    win.set(x0, z0, ext, 1 / S);
    const acc = (this.acc ??= {})[S] ??= new Float32Array(S * S * 2); // reused: 8 MB a call at 1024 (GC, zeroing)
    acc.fill(0);
    const splat = (segs, ch, width, trackKinds) => {
      const step = Math.min(2, tx * 0.5), w = (step * width) / (tx * tx);
      for (const s of segs) {
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az), n = Math.max(1, Math.ceil(len / step));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, u = (s.ax + (s.bx - s.ax) * t - x0) / tx - 0.5, v = (s.az + (s.bz - s.az) * t - z0) / tx - 0.5;
          const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
          if (i < 0 || j < 0 || i >= S - 1 || j >= S - 1) continue;
          const o = (j * S + i) * 2 + ch, ww = w * (len / n / step);
          acc[o] += ww * (1 - fu) * (1 - fv); acc[o + 2] += ww * fu * (1 - fv);
          acc[o + 2 * S] += ww * (1 - fu) * fv; acc[o + 2 * S + 2] += ww * fu * fv;
        }
      }
    };
    splat(segmentsIn(x0, z0, x0 + ext, z0 + ext, 'trench'), 0, which === 'm' ? 4.4 : 4.2);
    splat(segmentsIn(x0, z0, x0 + ext, z0 + ext, 'track'), 1, which === 'm' ? 5.2 : 6);
    const d = tex.image.data;
    for (let i = 0; i < S * S; i++) {
      d[i * 4] = Math.min(255, acc[i * 2] * 255);
      d[i * 4 + 1] = Math.min(255, acc[i * 2 + 1] * 255);
      d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
    }
    tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- GLSL: the old craters, per pixel
const f1 = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
function oldCraterGLSL() {
  const layers = CRATER_LAYERS.map((L) => `
    wm = clamp((${f1(L.rm)} / meshCell - 0.5) / 0.7, 0.0, 1.0);
    w = (1.0 - wm) * (1.0 - smoothstep(0.7, 1.6, fp / ${f1(L.rm)}));
    if (w > 0.004) t += craterLayer(p, ${f1(L.cell)}, ${L.s}, ${f1(L.r0)}, ${f1(L.r1)}, ${f1(L.p)}, w, fp);`).join('');
  return /* glsl */ `
  ${profileGLSL()}
  float zoneMaskGL(float x) { return smoothstep(${f1(ZONE.from)}, ${f1(ZONE.full)}, x) * (1.0 - smoothstep(${f1(ZONE.to)}, ${f1(ZONE.fade)}, x)); }
  float craterDensityGL(vec2 p) {
    float zm = zoneMaskGL(p.x);
    if (zm <= 0.0) return 0.0;
    float zc = min(1.0, p.y * p.y / 49000000.0);
    float b = (p.x - (4600.0 - 1000.0 * zc)) / 1300.0;
    return zm * (0.4 + 0.6 * exp(-b * b));
  }
  // one layer of the cellular field: (height, d/dx, d/dz, bowl 0..1), scaled by w
  vec4 craterLayer(vec2 p, float cell, int si, float r0, float r1, float pr, float w, float fp) {
    vec2 c = p / cell;
    ivec2 ic = ivec2(floor(c));
    vec2 f = c - vec2(ic);
    ivec2 o0 = ivec2(f.x < 0.5 ? -1 : 0, f.y < 0.5 ? -1 : 0);
    vec4 sum = vec4(0.0);
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        int ci = ic.x + o0.x + i, cj = ic.y + o0.y + j;
        vec2 pc = (vec2(float(ci), float(cj)) + vec2(ihash(ci, cj, si), ihash(ci, cj, si + 1))) * cell;
        if (ihash(ci, cj, si + 2) >= craterDensityGL(pc) * pr) continue;
        float R = r0 + (r1 - r0) * ihash(ci, cj, si + 3);
        vec2 dv = p - pc;
        float d2 = dot(dv, dv);
        if (d2 > R * R * 3.6) continue;
        float e1 = (ihash(ci, cj, si + 4) - 0.5) * ${f1(CRATER.ecc)};
        float e2 = (ihash(ci, cj, si + 5) - 0.5) * ${f1(CRATER.ecc)};
        float iv = d2 > 1e-6 ? 1.0 / d2 : 0.0;
        float d = sqrt(d2);
        float u = d / R * (1.0 + e1 * (dv.x * dv.x - dv.y * dv.y) * iv + e2 * 2.0 * dv.x * dv.y * iv);
        float D = R * (${f1(CRATER.kd0)} + ${f1(CRATER.kd1)} * ihash(ci, cj, si + 6));
        float dh = 0.0;
        if (u < 1.0) dh = 4.0 * u * (1.0 - u * u);
        // the lip's slope flips within lipW * R: once a pixel spans that it only flickers, so it fades out first
        float lf = 1.0 - smoothstep(0.5, 1.5, fp / (${f1(CRATER.lipW)} * R));
        if (u < 1.8 && lf > 0.0) { float q = (u - ${f1(CRATER.lipAt)}) / ${f1(CRATER.lipW)}; dh += ${f1(CRATER.lip)} * exp(-q * q) * (-2.0 * q / ${f1(CRATER.lipW)}) * (1.0 - smoothstep(1.4, 1.8, u)) * lf; }
        float g = D * dh / R / max(d, 1e-3) * w;
        sum += vec4(D * craterProfile(u) * w, dv.x * g, dv.y * g, 0.0);
        sum.w = max(sum.w, (u < 1.0 ? 1.0 - u * u : 0.0) * w);
      }
    }
    return sum;
  }
  // the old craters' share the mesh does not carry, at pixel scale; meshCell: the level's grid, fp: pixel footprint in metres
  vec4 oldCraters(vec2 p, float meshCell, float fp) {
    vec4 t = vec4(0.0);
    if (p.x < 2300.0 || p.x > 10700.0) return t;
    float wm, w;
    ${layers}
    return t;
  }`;
}

export class Terrain {
  constructor(scene, { quality = 'Medium' } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);

    this.craters = new Craters(this, { quality });
    this.masks = new GroundMasks();
    this.heightAt = (x, z) => heightAt(x, z) + this.craters.delta(x, z);
    this.detailN = makeTileableNormalMap({ size: 256, seed: 7, minFreq: 3, maxFreq: 40, strength: 1.6 });
    this.material = this.buildMaterial();
    this.levels = [];
    this.meshes = [];
    for (let k = 0; k < LEVELS; k++) {
      const lv = new Level(k, this);
      const mesh = new THREE.Mesh(lv.geo, this.material);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.name = `terrain-${k}`;
      this.group.add(mesh);
      this.levels.push(lv);
      this.meshes.push(mesh);
    }
    // the crater maps are stamped from inside the first draw of the frame (they need the renderer)
    this.meshes[0].onBeforeRender = (renderer, _s, camera) => this.craters.flush(renderer, camera);

    // the finest level's heights, for the grass shader
    this.nearTex = new THREE.DataTexture(new Float32Array((N + 1) * (N + 1) * 2), N + 1, N + 1, THREE.RGFormat, THREE.FloatType);
    this.nearTex.minFilter = this.nearTex.magFilter = THREE.NearestFilter;
    this.nearInfo = new THREE.Vector4(0, 0, BASE_CELL, N + 1); // origin x, origin z, cell, size

    this.trees = new Trees(this);
    this.grass = new Grass(this);
    this.group.add(this.trees.group, this.grass.mesh);
    this.setQuality(quality);
    this._v = new THREE.Vector3();
    this._clock = performance.now();
    this.update({ position: new THREE.Vector3(0, 10, 0) }, true);
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.Medium;
    this.quality = q;
    this.grass.setCount(q.grass, q.grassRadius);
    this.trees.setDensity(q.trees);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.5, hx0 = this.heightAt(x - e, z), hx1 = this.heightAt(x + e, z), hz0 = this.heightAt(x, z - e), hz1 = this.heightAt(x, z + e);
    const dx = hx0 - hx1, dz = hz0 - hz1, inv = 1 / Math.sqrt(dx * dx + 4 * e * e + dz * dz);
    return out.set(dx * inv, 2 * e * inv, dz * inv);
  }

  /** True if the straight line from A to B clears the ground. */
  los(ax, ay, az, bx, by, bz) {
    return los(ax, ay, az, bx, by, bz);
  }

  /** 'mud' | 'water' | 'grass' | 'road' | 'concrete' | 'rubble' under a point (burst fx and sound); a filled new crater counts as water. */
  groundAt(x, z) {
    const h = this.heightAt(x, z);
    const k = groundKindAt(x, z, h);
    if (k === 'mud') {
      const i = this.craters.at(x, z);
      if (i >= 0 && this.craters.fill(i) > 0.6) return 'water';
    }
    return k;
  }

  /** A crater landed: dent the clipmap's fine levels around it. */
  patchCraters(x, z, r) {
    for (let k = 0; k < CRATER_LEVELS; k++) this.levels[k].patch(x - r, z - r, x + r, z + r);
    this.updateNear(this.levels[0]);
  }

  /** Recentre the camera-following geometry (call every frame; it rebuilds only when a level moves). */
  update(camera, all = false) {
    const now = performance.now(), dt = Math.min(0.1, (now - this._clock) / 1000);
    this._clock = now;
    this.craters.update(dt);
    const p = camera.position;
    // While the camera sweeps across the map (the glide from one battery to another, tens of metres a frame), a level
    // it crosses in a few frames is not re-centred: the next coarser level covers that ground (it is drawn wherever
    // the finer one is not), and re-sampling the finest levels on every frame of the glide cost 40 to 60 ms a frame.
    // They catch up as the camera slows; `all` rebuilds everything.
    const moved = this._p ? Math.hypot(p.x - this._p.x, p.z - this._p.z) : 0;
    (this._p ??= new THREE.Vector3()).copy(p);
    // one level a frame (about 10 ms for the finest), so the catch-up after a sweep is spread over frames too
    let budget = all ? LEVELS : 1;
    const L = this.levels;
    for (let k = 0; k < LEVELS; k++) {
      const lv = L[k], step = lv.cell * 2;
      const cx = Math.round(p.x / step) * step, cz = Math.round(p.z / step) * step;
      if (cx !== lv.cx || cz !== lv.cz) {
        if (!all && lv.valid && moved > lv.cell * N * 0.05) continue;
        if (budget <= 0) continue;
        budget--;
        lv.rebuild(cx, cz);
        if (k === 0) this.updateNear(lv);
      }
    }
    for (let k = 0; k < LEVELS; k++) {
      const lv = L[k];
      if (!lv.valid) continue;
      if (k === 0) {
        lv.setHole(null);
        continue;
      }
      const f = L[k - 1];
      const e = (N * f.cell) / 2;
      lv.setHole(f.valid ? { x0: f.cx - e, x1: f.cx + e, z0: f.cz - e, z1: f.cz + e } : null);
    }
    // the trench and track masks and the trees (re-planted every 110 m, 20 to 50 ms each) wait the same way, and each
    // takes a frame of its own: none while a level was rebuilt, the trees not while the masks were
    const sweeping = !all && moved > BASE_CELL * N * 0.05;
    const busy = !all && budget < 1;
    const masked = !sweeping && !busy && this.masks.update(p, all);
    if (!sweeping && (all || (!busy && !masked))) this.trees.update(camera, all);
    this.grass.update(camera);
  }

  updateNear(lv) {
    const t = this.nearTex.image.data, G = lv.G;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const o = j * (N + 1) + i, s = ((j + 1) * G + i + 1) * STRIDE;
        t[o * 2] = lv.h[s];
        // grass thins on pads and where the ground stands in water
        t[o * 2 + 1] = Math.max(lv.h[s + 3], lv.h[s] < lv.h[s + 1] + 0.1 ? 1 : 0);
      }
    }
    this.nearTex.needsUpdate = true;
    this.nearInfo.set((lv.gx0 + 1) * lv.cell, (lv.gz0 + 1) * lv.cell, lv.cell, N + 1);
  }

  // ---------------------------------------------------------------- materials
  buildMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const detailN = this.detailN, craters = this.craters, masks = this.masks;
    const sites = [];
    for (const p of PLACES) {
      const type = p.kind === 'wood' ? 1 : p.kind === 'village' || p.kind === 'town' ? 2 : 0;
      if (type) sites.push(new THREE.Vector4(p.pos.x, p.pos.z, p.r, type));
    }
    while (sites.length < 12) sites.push(new THREE.Vector4(0, 0, 0, 0));
    patchMaterial(mat, 'terrain-drumfire', (shader) => {
      shader.uniforms.uDetailN = { value: detailN };
      shader.uniforms.uCrNear = { value: null };
      shader.uniforms.uCrFar = { value: null };
      shader.uniforms.uCrNearWin = { value: new THREE.Vector4() };
      shader.uniforms.uCrFarWin = { value: new THREE.Vector4() };
      shader.uniforms.uMkNear = { value: masks.near };
      shader.uniforms.uMkMid = { value: masks.mid };
      shader.uniforms.uMkNearWin = { value: masks.nearWin };
      shader.uniforms.uMkMidWin = { value: masks.midWin };
      shader.uniforms.uMkFar = { value: masks.far };
      shader.uniforms.uMkFarWin = { value: masks.farWin };
      shader.uniforms.uSites = { value: sites };
      // the crater maps exist once the first flush has run; until then a black texture
      const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
      blank.needsUpdate = true;
      shader.uniforms.uCrNear.value = craters.maps ? craters.maps[0].texture : blank;
      shader.uniforms.uCrFar.value = craters.maps ? craters.maps[1].texture : blank;
      shader.uniforms.uCrNearWin.value = craters.maps ? craters.maps[0].win : new THREE.Vector4(1e9, 1e9, 256, 0);
      shader.uniforms.uCrFarWin.value = craters.maps ? craters.maps[1].win : new THREE.Vector4(1e9, 1e9, 4096, 0);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nvarying vec4 vInfo;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = position;\nvWNormal = normal;\nvInfo = aInfo;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos;
          varying vec3 vWNormal;
          varying vec4 vInfo;
          uniform sampler2D uDetailN;
          uniform sampler2D uCrNear;
          uniform sampler2D uCrFar;
          uniform vec4 uCrNearWin;
          uniform vec4 uCrFarWin;
          uniform sampler2D uMkNear;
          uniform sampler2D uMkMid;
          uniform vec4 uMkNearWin;
          uniform vec4 uMkMidWin;
          uniform sampler2D uMkFar;
          uniform vec4 uMkFarWin;
          uniform vec4 uSites[12];
          ${DBG.split('').map((c) => `#define DBG_${c}`).join('\n')}
          ${noiseGLSL}
          ${fieldGLSL}
          ${oldCraterGLSL()}
          float tDist;
          vec3 tWN;
          vec2 tBump;
          vec2 tGrad;
          float tWater;
          float tRough;
          float tMud;
          // runtime craters: (height of the small ones, scorch, spoil, water deficit); near map blended into the far one
          vec4 craterMaps(vec2 p, out vec2 grad) {
            grad = vec2(0.0);
            vec2 un = (p - uCrNearWin.xy) / uCrNearWin.z;
            float wn = smoothstep(0.0, 0.08, min(min(un.x, un.y), min(1.0 - un.x, 1.0 - un.y)));
            vec4 r = vec4(0.0);
            if (wn < 1.0) {
              vec2 uf = (p - uCrFarWin.xy) / uCrFarWin.z;
              if (uf.x > 0.0 && uf.y > 0.0 && uf.x < 1.0 && uf.y < 1.0) r = texture2D(uCrFar, uf);
            }
            if (wn > 0.0) {
              vec4 n = texture2D(uCrNear, un);
              float e = uCrNearWin.w;
              float hx = texture2D(uCrNear, un + vec2(e, 0.0)).x, hz = texture2D(uCrNear, un + vec2(0.0, e)).x;
              grad = vec2(hx - n.x, hz - n.x) / (e * uCrNearWin.z) * wn;
              r = mix(r, n, wn);
            }
            return r;
          }`
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          vec3 wp = vWPos;
          tDist = length(wp - cameraPosition);
          tWN = normalize(vWNormal);
          vec2 q = wp.xz;
          float fp = clamp(max(fwidth(q.x), fwidth(q.y)), 0.004, 500.0);
          float lvK = floor(vInfo.x * 0.5);
          float padK = (vInfo.x - 2.0 * lvK) / 0.999, wetV = vInfo.y, Gs = vInfo.z, Wt = vInfo.w;
          bool coarse = lvK > 1.5;
          float meshCell = coarse ? 1.0e9 : 2.5 * exp2(lvK);
          float nFar = fbm2(q * 0.0012 + 4.0);
          float nMid = tDist < 7000.0 ? fbm2(q * 0.02) : 0.5;
          float nNear = tDist < 500.0 ? vnoise(q * 1.3) : 0.5;
          float nFine = tDist < 90.0 ? vnoise(q * 9.0) : 0.5;
          float devx = zoneMaskGL(q.x);
          float dev = smoothstep(0.1, 0.75, devx + (nMid - 0.5) * 0.22 * (1.0 - abs(devx * 2.0 - 1.0)));
          tBump = vec2(0.0);
          tGrad = vec2(0.0);
          tRough = 0.92;

          // ---- farmland: the iads field patchwork, in autumn colours, with hedges
          vec3 col = vec3(0.1);
          if (dev < 0.98) {
            FieldInfo fi = fieldAt(q);
            float k = fi.kind;
            float fieldT = ihash(fi.i, fi.j, 61);
            vec3 farm = fieldBaseColor(k, smoothstep(0.35, 0.7, nFar * 0.7 + nMid * 0.5 - 0.1));
            farm *= 0.82 + 0.36 * fieldT;
            farm *= 0.8 + 0.4 * nMid;
            farm *= 0.85 + 0.3 * nNear;
            farm *= 0.9 + 0.2 * nFine;
            float mpp = max(fp, 1e-4);
            if (k < 4.5) {
              float per = k == 2.0 ? 0.95 : k == 3.0 ? 0.3 : 0.5;
              float ph = fi.eL / per * 6.2831853;
              float aa = 1.0 - smoothstep(0.2, 0.55, mpp / per);
              float row = sin(ph) * aa;
              vec2 gu = vec2(F_C, F_S);
              if (k == 2.0) {
                float clod = vnoise(q * vec2(9.0, 7.0));
                float cf = 1.0 - smoothstep(0.15, 0.7, fp / 0.12); // clods and furrows blur to their mean when a pixel spans them
                farm *= mix(1.0, (0.82 + 0.4 * (0.5 + 0.5 * row)) * (0.8 + 0.4 * clod), cf);
                tBump += gu * cos(ph) * 0.5 * aa;
              } else {
                farm *= 1.0 + 0.16 * row;
                tBump += gu * cos(ph) * 0.1 * aa;
              }
            }
            float eb = (1.0 - smoothstep(0.5, 1.6 + tDist * 0.0006, fi.edge)) * (1.0 - smoothstep(1500.0, 5000.0, tDist));
            farm = mix(farm, vec3(0.13, 0.1, 0.06), eb * 0.5);
            float hw = 3.0 + tDist * 0.0012;
            float hb = (1.0 - smoothstep(hw * 0.4, hw * 1.7, fi.hedge)) * (1.0 - smoothstep(9000.0, 18000.0, tDist));
            farm = mix(farm, vec3(0.018, 0.032, 0.012), hb * 0.8);
            // sodden pasture along the becks
            farm = mix(farm, vec3(0.04, 0.06, 0.025), smoothstep(0.55, 1.0, wetV) * 0.7);
            col = farm;
          }

          // ---- the churned ground: grey-brown spoil, black wet clay, pale clay, dark slurry
          vec3 mud = vec3(0.1);
          float lipK = 0.0, bowlK = 0.0;
          float shore = 0.0;
          tWater = 0.0;
          if (dev > 0.02 || wetV > 0.3) {
            float a = fbm2(q * 0.3 + 11.0), b = vnoise(q * 1.6 + 3.0), c = vnoise(q * 6.5);
            vec3 grey = vec3(0.09, 0.083, 0.072), clay = vec3(0.165, 0.138, 0.1), dark = vec3(0.035, 0.03, 0.026);
            mud = mix(grey, clay, smoothstep(0.38, 0.72, a));
            mud = mix(mud, dark, smoothstep(0.5, 0.85, b) * 0.55);
            mud *= 0.8 + 0.4 * c;
            mud *= 0.7 + 0.6 * nMid;
            mud = mix(mud, mud * vec3(1.3, 1.15, 0.9), smoothstep(0.45, 0.8, fbm2(q * 0.004 + 21.0)) * 0.5); // dry clay bands on the rises
            mud = mix(mud, mud * 0.55, smoothstep(0.55, 0.85, fbm2(q * 0.009 + 7.0)) * 0.6);
            // specks: splintered boards, wire, brass, bone-white chalk
            if (tDist < 60.0) mud = mix(mud, mud * 2.2, step(0.965, vnoise(q * 14.0 + 7.0)) * 0.6);

            // old shell holes below the mesh's resolution, and the battle's own craters
            vec4 oc = vec4(0.0);
            #ifndef DBG_c
            oc = oldCraters(q, meshCell, fp);
            #endif
            vec2 rg;
            vec4 rc = craterMaps(q, rg);
            tGrad = oc.yz + rg;
            bowlK = oc.w;
            lipK = smoothstep(0.02, 0.35, oc.x + rc.x);
            mud = mix(mud, dark * 1.2, smoothstep(0.05, 0.8, bowlK) * 0.75);
            mud = mix(mud, clay * 1.7, lipK * 0.75 * (1.0 - bowlK) * (0.5 + nMid));
            mud = mix(mud, clay * 1.35, clamp(rc.z, 0.0, 1.0) * 0.8); // fresh spoil
            mud = mix(mud, vec3(0.012, 0.011, 0.01), clamp(rc.y, 0.0, 1.0) * 0.9); // scorch

            // standing water: the pool is where the (pixel-scale) ground is below the water table
            float hPix = (coarse ? Gs : wp.y) + oc.x + rc.x;
            float wd = (Wt - rc.w) - hPix + (nFine - 0.5) * 0.04;
            float wetZ = smoothstep(0.2, 0.45, wetV);
            tWater = smoothstep(0.0, 0.03 + fp * 0.4, wd) * wetZ;
            #ifdef DBG_w
            tWater = 0.0;
            #endif
            shore = smoothstep(-0.45, 0.0, wd) * wetZ * (1.0 - tWater);
            mud = mix(mud, dark * 1.3, shore * 0.8);
            tMud = shore;
            // glossy wet patches on the open mud
            float slick = smoothstep(0.5, 0.75, fbm2(q * 0.11 + 5.0)) * wetV;
            tRough = mix(0.82, 0.4, max(slick * 0.8, wetV * 0.55));
            tRough = mix(tRough, 0.22, shore);
            // water: dark body, mirror at grazing angles (metal with a grey F0 so the sky shows)
            vec3 V = normalize(cameraPosition - wp);
            float fres = 0.22 + 0.78 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
            float turb = 1.0 - smoothstep(0.0, 0.5, wd);
            vec3 waterBase = mix(vec3(0.95, 0.93, 0.88), vec3(0.6, 0.5, 0.38), turb * 0.6) * (0.5 + 0.5 * fres);
            mud = mix(mud, waterBase * vec3(1.0, 0.95, 0.86), tWater);
            tRough = mix(tRough, 0.03, tWater);
          }
          col = mix(col, mud, max(dev, max(tWater, shore * 0.8)));

          // ---- woods and ruins: leaf litter and brush, brick dust
          for (int s = 0; s < 12; s++) {
            vec4 st = uSites[s];
            if (st.w < 0.5) continue;
            float d = distance(q, st.xy) + (nMid - 0.5) * st.z * 0.25;
            if (st.w < 1.5) {
              float wood = 1.0 - smoothstep(st.z * 0.82, st.z * 1.1, d);
              col = mix(col, mix(vec3(0.05, 0.04, 0.028), vec3(0.085, 0.06, 0.035), nNear), wood * (1.0 - tWater) * 0.75);
            } else {
              float ruin = 1.0 - smoothstep(st.z * 0.5, st.z * 0.85, d);
              vec3 brick = mix(vec3(0.14, 0.09, 0.07), vec3(0.17, 0.15, 0.13), vnoise(q * 0.8)) * (0.7 + 0.5 * nFine);
              col = mix(col, brick, ruin * 0.8 * (1.0 - tWater));
            }
          }

          // ---- trenches, roads and tracks from the masks
          {
            vec2 un = (q - uMkNearWin.xy) / uMkNearWin.z;
            float wnN = smoothstep(0.0, 0.06, min(min(un.x, un.y), min(1.0 - un.x, 1.0 - un.y)));
            float trenchD = 99.0, trackD = 99.0, trackKind = 0.0, tkindT = 0.0;
            float trCov = 0.0, tkCov = 0.0;
            if (wnN > 0.0) {
              vec4 m = texture2D(uMkNear, un);
              trenchD = m.r * 6.0; trackD = m.g * 8.0; trackKind = m.b * 3.0; tkindT = m.a * 3.0;
            }
            if (wnN < 1.0) {
              vec2 um = (q - uMkMidWin.xy) / uMkMidWin.z, uf = (q - uMkFarWin.xy) / uMkFarWin.z;
              float wm = smoothstep(0.0, 0.08, min(min(um.x, um.y), min(1.0 - um.x, 1.0 - um.y)));
              vec2 cv = vec2(0.0);
              if (uf.x > 0.0 && uf.y > 0.0 && uf.x < 1.0 && uf.y < 1.0 && wm < 1.0) cv = texture2D(uMkFar, uf).rg;
              if (wm > 0.0) cv = mix(cv, texture2D(uMkMid, um).rg, wm);
              trCov = min(1.0, cv.r * 1.8) * (1.0 - wnN); tkCov = min(1.0, cv.g * 1.6) * (1.0 - wnN);
            }
            // trench: floor (dark, wet), walls (damp clay), then the spoil heaped either side
            float tf = (1.0 - smoothstep(0.7, 1.15, trenchD)) * wnN;
            float tw = (1.0 - smoothstep(1.1, 2.1, trenchD)) * wnN;
            float tp = (1.0 - smoothstep(1.8, 3.6, trenchD)) * smoothstep(1.1, 2.0, trenchD) * wnN;
            vec3 clayT = vec3(0.2, 0.165, 0.11) * (0.8 + 0.4 * nNear);
            col = mix(col, clayT, tp * 0.55);
            col = mix(col, vec3(0.06, 0.05, 0.04), tw * 0.8);
            col = mix(col, vec3(0.03, 0.026, 0.022), tf * 0.9);
            col = mix(col, col * 0.3 + vec3(0.012, 0.01, 0.008), trCov * 0.9);
            tRough = mix(tRough, 0.4, tf * 0.7);
            // roads: pave, plank roads, duckboards
            float tw0 = trackKind < 1.5 ? 2.6 : trackKind < 2.5 ? 1.8 : 0.5;
            float onT = (1.0 - smoothstep(tw0 - 0.25, tw0 + 0.2 + fp * 0.5, trackD)) * wnN;
            vec3 tc = trackKind < 1.5 ? vec3(0.1, 0.095, 0.085) * (0.7 + 0.6 * nFine) : vec3(0.11, 0.075, 0.045) * (0.75 + 0.5 * vnoise(q * vec2(2.0, 14.0)));
            tc = mix(tc, vec3(0.045, 0.04, 0.034), smoothstep(0.55, 0.85, nNear) * 0.6);
            col = mix(col, tc, onT * (1.0 - tWater * 0.6));
            col = mix(col, vec3(0.1, 0.09, 0.075), tkCov * 0.6);
            tRough = mix(tRough, 0.8, onT);
            tWater *= 1.0 - onT * 0.9;
            // trenches: flooded in stretches, duckboarded and dry between
            tWater *= 1.0 - tf * (1.0 - smoothstep(0.55, 0.72, fbm2(q * 0.045 + 9.0)));
          }

          // levelled pads: trodden earth and gravel
          vec3 gravel = vec3(0.2, 0.15, 0.1) * (0.75 + 0.5 * nFine) * (0.85 + 0.3 * nNear);
          col = mix(col, gravel, smoothstep(0.3 + 0.35 * nNear, 1.0, padK) * (1.0 - tWater));
          diffuseColor.rgb = col;
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          #include <roughnessmap_fragment>
          roughnessFactor = tRough;
          `
        )
        .replace(
          '#include <metalnessmap_fragment>',
          /* glsl */ `
          #include <metalnessmap_fragment>
          metalnessFactor = tWater;
          `
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `
          #include <normal_fragment_maps>
          {
            float dk = (1.0 - smoothstep(25.0, 200.0, tDist));
            // the tiling normal map is a lattice of sines: blend two rotations and break it with noise
            mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
            float bl = smoothstep(0.3, 0.7, vnoise(q * 0.05));
            vec2 d1 = mix(texture2D(uDetailN, q * 0.21).xy, texture2D(uDetailN, rot * q * 0.173 + 0.41).xy, bl) * 2.0 - 1.0;
            // clods: value-noise gradients at two scales
            vec2 cq = q * 2.3;
            float c0 = vnoise(cq), cx = vnoise(cq + vec2(0.35, 0.0)) - c0, cz = vnoise(cq + vec2(0.0, 0.35)) - c0;
            vec2 cq2 = q * 7.7 + 3.0;
            float e0 = vnoise(cq2), ex = vnoise(cq2 + vec2(0.3, 0.0)) - e0, ez = vnoise(cq2 + vec2(0.0, 0.3)) - e0;
            vec2 rough = (vec2(cx, cz) * 0.9 + vec2(ex, ez) * 0.8) * (1.0 - smoothstep(8.0, 70.0, tDist)) + d1 * 0.2;
            vec3 nW = normalize(tWN + vec3(rough.x, 0.0, rough.y) * dk * mix(0.5, 1.2, dev) + vec3(tBump.x, 0.0, tBump.y) * (1.0 - smoothstep(60.0, 400.0, tDist)));
            nW = normalize(nW + vec3(-tGrad.x, 0.0, -tGrad.y) * (1.0 - tWater));
            vec2 rip = d1 * 0.03 * (1.0 - smoothstep(20.0, 160.0, tDist));
            nW = normalize(mix(nW, normalize(vec3(rip.x, 1.0, rip.y)), tWater));
            normal = normalize(mat3(viewMatrix) * nW);
            // specular anti-aliasing (Kaplanyan and Hill 2016): where the normal turns within a pixel (crater
            // rims, puddle edges, clods far off) widen the highlight instead of letting it sparkle and crawl
            vec3 nDu = dFdx(nW), nDv = dFdy(nW);
            float kv = min(0.5 * (dot(nDu, nDu) + dot(nDv, nDv)), 0.18);
            float ra = roughnessFactor * roughnessFactor;
            roughnessFactor = sqrt(sqrt(clamp(ra * ra + kv, 0.0, 1.0)));
          }
          `
        );
    });
    return mat;
  }
}

// Runtime craters: the holes this battle digs. One analytic profile (bowl plus raised lip) with
// three consumers: the CPU height (`delta`, a spatial hash of the crater list; fx, camera and the
// terrain's heightAt read it), the clipmap's fine levels (terrain.js patches their vertices), and
// two camera-centred world-space render targets the terrain shader reads (the maxgfx FoamMap
// pattern: stamps drawn additively, the whole list re-stamped when a window moves, so there is no
// decay pass and no readback). Channels: R height of craters too small for the mesh (m), G scorch,
// B fresh spoil, A how far below the water table the pool stands (m; 0 once full).
//
// The pure heightAt (terrainHeight.js) never sees these: they are visual only.
import * as THREE from 'three';
import { craterProfile, CRATER, wetAt } from './terrainHeight.js';

const CAP = 4096;
const MESH_R = 2.4; // craters smaller than this are not worth a vertex: the shader carries them
const CELL = 32; // spatial hash cell
const FILL_TIME = 70; // seconds for a shell hole on wet ground to fill
const sm = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const frac = (v) => v - Math.floor(v);
// per-crater ellipse, from its seed (the same two lines are in the stamp shader)
const ecc = (seed) => [(frac(Math.sin(seed * 12.9898) * 43758.5453) - 0.5) * CRATER.ecc, (frac(Math.sin(seed * 78.233 + 1.7) * 43758.5453) - 0.5) * CRATER.ecc];

export class Craters {
  constructor(terrain, { quality = 'Medium' } = {}) {
    this.terrain = terrain;
    this.n = 0; // total added (the ring index is n % CAP)
    this.x = new Float32Array(CAP);
    this.z = new Float32Array(CAP);
    this.r = new Float32Array(CAP);
    this.d = new Float32Array(CAP);
    this.scorch = new Float32Array(CAP);
    this.seed = new Float32Array(CAP);
    this.t0 = new Float32Array(CAP);
    this.water = new Int8Array(CAP); // -1 never, 0 auto (wet ground), 1 forced
    this.grid = new Map();
    this.time = 0;
    this.filling = 0; // craters still filling (restamp the maps every so often while > 0)
    this.fillTimer = 0;
    this.maps = [new CraterMap(this, 1024, 256), new CraterMap(this, 1024, 4096)]; // near 0.25 m texels, far 4 m
    this.dirty = true;
  }

  get count() {
    return Math.min(this.n, CAP);
  }

  key(i, j) {
    return (i + 8192) * 16384 + (j + 8192);
  }

  /** A new crater: radius and depth in metres. scorch 0..1 blackens the ground around it; water: true forces a pool, false never, undefined: on wet ground it fills over a minute. */
  add(x, z, radius, depth, { scorch = 1, water } = {}) {
    // a spot already churned takes a shallower hole (no digging through the world)
    const d0 = this.delta(x, z);
    depth *= Math.min(1, Math.max(0.2, 1 + d0 / (radius * 0.55)));
    const i = this.n % CAP;
    if (this.n >= CAP) this.rehash(i);
    this.x[i] = x; this.z[i] = z; this.r[i] = radius; this.d[i] = depth;
    this.scorch[i] = scorch;
    this.seed[i] = ((this.n * 0.6180339) % 1) * 97 + 1;
    this.t0[i] = this.time;
    this.water[i] = water === true ? 1 : water === false ? -1 : 0;
    this.n++;
    this.hashIn(i);
    this.dirty = true;
    if (this.water[i] >= 0 && (this.water[i] === 1 || wetAt(x, z) > 0.45)) this.filling++;
    if (radius >= MESH_R) this.terrain.patchCraters?.(x, z, radius * 2.1);
    return i;
  }

  hashIn(i) {
    const e = this.r[i] * 2, x = this.x[i], z = this.z[i];
    for (let a = Math.floor((x - e) / CELL); a <= Math.floor((x + e) / CELL); a++) {
      for (let b = Math.floor((z - e) / CELL); b <= Math.floor((z + e) / CELL); b++) {
        const k = this.key(a, b);
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(i);
      }
    }
  }

  // the ring overwrote slot `gone`: drop it from the hash (rare: one sweep per 4096 craters)
  rehash(gone) {
    for (const l of this.grid.values()) {
      const k = l.indexOf(gone);
      if (k >= 0) l.splice(k, 1);
    }
  }

  /** Height change of all craters at a point (metres: negative in bowls, positive on lips). bigOnly: just those the mesh carries. */
  delta(x, z, bigOnly = false) {
    const l = this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return 0;
    let s = 0;
    for (let n = 0; n < l.length; n++) {
      const i = l[n], R = this.r[i];
      if (bigOnly && R < MESH_R) continue;
      const dx = x - this.x[i], dz = z - this.z[i], d2 = dx * dx + dz * dz;
      if (d2 > R * R * 3.6) continue;
      const [e1, e2] = ecc(this.seed[i]);
      const iv = d2 > 1e-6 ? 1 / d2 : 0;
      const u = (Math.sqrt(d2) / R) * (1 + e1 * (dx * dx - dz * dz) * iv + e2 * 2 * dx * dz * iv);
      s += this.d[i] * craterProfile(u);
    }
    return s;
  }

  /** The newest crater covering a point, or -1 (for fx that want to know about water in it). */
  at(x, z) {
    const l = this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return -1;
    let best = -1;
    for (const i of l) {
      const dx = x - this.x[i], dz = z - this.z[i];
      if (dx * dx + dz * dz < this.r[i] * this.r[i] && (best < 0 || this.t0[i] > this.t0[best])) best = i;
    }
    return best;
  }

  /** Fill fraction 0..1 of crater i's pool (0 for a dry hole). */
  fill(i) {
    const w = this.water[i];
    if (w < 0) return 0;
    if (w === 0) {
      const wet = wetAt(this.x[i], this.z[i]);
      if (wet < 0.45) return 0;
    }
    return sm(0, FILL_TIME, this.time - this.t0[i]);
  }

  /** Per-frame: advance the fill clock (call from Terrain.update with the real dt). */
  update(dt) {
    this.time += dt;
    if (this.filling > 0) {
      this.fillTimer -= dt;
      if (this.fillTimer <= 0) {
        this.fillTimer = 0.6;
        this.dirty = true;
        // count the holes still filling (a crater stops after FILL_TIME)
        let f = 0;
        for (let k = 0, n = this.count; k < n; k++) if (this.water[k] >= 0 && this.time - this.t0[k] < FILL_TIME + 1) f++;
        this.filling = f;
      }
    }
  }

  // ---------------------------------------------------------------- render targets
  /** Re-stamp the maps if a crater arrived or a window needs to move. Called from the terrain's onBeforeRender. */
  flush(renderer, camera) {
    for (const m of this.maps) m.flush(renderer, camera, this.dirty);
    this.dirty = false;
  }
}

// instanced additive stamps into a camera-centred RGBA16F target
const STAMP_VS = /* glsl */ `
  attribute vec4 aA; // x, z, radius, depth
  attribute vec4 aB; // scorch, water deficit (m), seed, small (height stamped)
  uniform vec4 uWin; // x0, z0, size
  varying vec2 vLocal;
  varying vec4 vB;
  varying float vD;
  void main() {
    vLocal = position.xy * 2.6;
    vB = aB;
    vD = aA.w;
    vec2 w = aA.xy + position.xy * aA.z * 2.6;
    vec2 uv = (w - uWin.xy) / uWin.z;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  }
`;
const STAMP_FS = /* glsl */ `
  varying vec2 vLocal;
  varying vec4 vB;
  varying float vD;
  float hsh(float n) { return fract(sin(n) * 43758.5453); }
  ${profileGLSL()}
  void main() {
    float seed = vB.z;
    float e1 = (fract(sin(seed * 12.9898) * 43758.5453) - 0.5) * ${CRATER.ecc.toFixed(3)};
    float e2 = (fract(sin(seed * 78.233 + 1.7) * 43758.5453) - 0.5) * ${CRATER.ecc.toFixed(3)};
    float d2 = dot(vLocal, vLocal);
    float iv = d2 > 1e-6 ? 1.0 / d2 : 0.0;
    float u = sqrt(d2) * (1.0 + e1 * (vLocal.x * vLocal.x - vLocal.y * vLocal.y) * iv + e2 * 2.0 * vLocal.x * vLocal.y * iv);
    float ang = atan(vLocal.y, vLocal.x);
    // scorch: blackened out to ~2 radii, raggedly (blast rays), darkest at the lip
    float ray = 0.65 + 0.35 * sin(ang * 5.0 + seed * 6.28) * sin(ang * 3.0 - seed * 2.1);
    float sc = vB.x * (1.0 - smoothstep(0.9, 1.0 + 1.3 * ray, u)) * (0.55 + 0.45 * smoothstep(0.0, 1.0, u));
    // fresh spoil thrown on the lip and beyond
    float sp = (1.0 - smoothstep(1.1, 2.4 * ray + 0.2, u)) * smoothstep(0.55, 1.05, u);
    float h = vB.w > 0.5 ? vD * craterProfile(u) : 0.0;
    float def = vB.y * (1.0 - smoothstep(0.78, 1.0, u));
    gl_FragColor = vec4(h, sc, sp, def);
  }
`;

function profileGLSL() {
  return /* glsl */ `
  float craterProfile(float u) {
    float h = 0.0;
    if (u < 1.0) { float t = 1.0 - u * u; h = -t * t; }
    if (u < 1.8) { float q = (u - ${CRATER.lipAt.toFixed(3)}) / ${CRATER.lipW.toFixed(3)}; h += ${CRATER.lip.toFixed(3)} * exp(-q * q) * (1.0 - smoothstep(1.4, 1.8, u)); }
    return h;
  }`;
}

class CraterMap {
  constructor(craters, res, extent) {
    this.craters = craters;
    this.res = res;
    this.extent = extent;
    this.rt = new THREE.WebGLRenderTarget(res, res, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    this.win = new THREE.Vector4(1e9, 1e9, extent, 1 / res); // x0, z0, size (the shader's uniform)
    this.cx = 1e9;
    this.cz = 1e9;
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.a = new Float32Array(CAP * 4);
    this.b = new Float32Array(CAP * 4);
    geo.setAttribute('aA', new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(this.b, 4).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uWin: { value: this.win } },
      vertexShader: STAMP_VS, fragmentShader: STAMP_FS,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.cam = new THREE.Camera();
    this.mat = mat;
    this.cleared = false;
  }

  get texture() {
    return this.rt.texture;
  }

  dispose() {
    this.rt.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }

  flush(renderer, camera, dirty) {
    const p = camera.position, step = this.extent / 8;
    const cx = Math.round(p.x / step) * step, cz = Math.round(p.z / step) * step;
    const moved = Math.abs(cx - this.cx) > step * 3 || Math.abs(cz - this.cz) > step * 3 || this.cx > 1e8;
    if (!dirty && !moved) return;
    if (moved) { this.cx = cx; this.cz = cz; }
    const x0 = this.cx - this.extent / 2, z0 = this.cz - this.extent / 2;
    this.win.set(x0, z0, this.extent, 1 / this.res);
    const C = this.craters, near = this.extent < 1000;
    let n = 0;
    const t = C.time;
    for (let k = 0, m = C.count; k < m; k++) {
      const R = C.r[k], x = C.x[k], z = C.z[k];
      if (x + R * 2.6 < x0 || x - R * 2.6 > x0 + this.extent || z + R * 2.6 < z0 || z - R * 2.6 > z0 + this.extent) continue;
      // the far map has texels of 4 m: only holes it can show
      if (!near && R < 1.2) continue;
      const fill = C.fill(k);
      const w = C.water[k];
      const deficit = (1 - fill) * C.d[k] - (w === 1 ? 0.7 * fill : 0);
      const o = n * 4;
      this.a[o] = x; this.a[o + 1] = z; this.a[o + 2] = R; this.a[o + 3] = C.d[k];
      this.b[o] = C.scorch[k]; this.b[o + 1] = deficit; this.b[o + 2] = C.seed[k]; this.b[o + 3] = near && R < MESH_R ? 1 : 0;
      n++;
    }
    this.geo.instanceCount = n;
    this.geo.attributes.aA.needsUpdate = true;
    this.geo.attributes.aB.needsUpdate = true;
    // render into the target without disturbing the frame in progress (we run inside onBeforeRender)
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevShadow = renderer.shadowMap.needsUpdate;
    const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAuto;
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.shadowMap.needsUpdate = prevShadow;
  }
}

/** GLSL twin of terrainHeight.js's old craters, for the terrain fragment shader (needs ihash from fieldGLSL). */
export { profileGLSL };

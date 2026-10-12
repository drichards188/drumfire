import * as THREE from 'three';
import { globalUniforms, MAX_FLARE_LIGHTS } from './shaderlib.js';

const rr = (a, b) => a + (b - a) * Math.random();
const _v = new THREE.Vector3();
const G = 9.8;

// The night lights of the Western Front, as game values. `I` is the light's strength in shader units
// (irradiance times distance squared: a surface 1.2 km from I = 1.5e6 gets about 1, the level a
// full moon lights the ground with is far less), `soft` the softening radius, `reach` where it
// fades out. A star shell is the big one: it hangs ~300 m up and lights no man's land for ~40 s.
const KINDS = {
  very: { color: [1.0, 0.95, 0.82], I: 1.5e5, soft: 100, reach: 2400, burn: 8, glow: 55, size: 4 },
  sos: { color: [1.0, 0.14, 0.07], I: 5e5, soft: 300, reach: 5200, burn: 7, glow: 80, size: 6 },
  star: { color: [0.80, 0.91, 1.0], I: 6e5, soft: 350, reach: 6000, burn: 40, glow: 110, size: 8, sink: 5, fuzeAlt: 290 },
};
const MAX_SPRITES = 160;
const MAX_ITEMS = 40;
const MAX_FLASHES = 48;

/**
 * Night lights as analytic point lights (shaderlib.js: every lit material, the smoke and the clouds
 * pick up the brightest MAX_FLARE_LIGHTS each frame, ranked by strength over distance to the camera)
 * plus sprites for the visible candles. Kinds, launched with launch(pos, kind):
 *   'very'  a white Very light: climbs ~80 m on an arc and burns ~8 s as it falls, no parachute
 *   'sos'   a red rocket: climbs ~170 m, bursts into red stars that drift down
 *   'star'  a star shell: rises to ~300 m, opens a parachute, burns ~40 s drifting with the wind
 * flash(pos, color, intensity, life) adds a brief light (muzzle blast, burst, cook-off).
 */
export class Flares {
  constructor(scene, { ground = () => 0 } = {}) {
    this.ground = ground;
    this.items = [];
    this.flashes = [];
    this.cand = [];
    this.onIgnite = null; // (pos, kind) when a star shell opens or a rocket bursts
    this.wind = new THREE.Vector3();

    const q = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = q.index;
    g.setAttribute('position', q.attributes.position);
    const attr = () => new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aA = attr();
    this.aB = attr();
    this.aC = attr();
    g.setAttribute('iA', this.aA);
    g.setAttribute('iB', this.aB);
    g.setAttribute('iC', this.aC);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPixel: { value: 0.0016 }, uFogDensity: { value: 0.00022 } },
      vertexShader: /* glsl */ `
        attribute vec4 iA; // position, size
        attribute vec4 iB; // hdr colour, alpha
        attribute vec4 iC; // kind (0 flare, 1 smoke trail, 2 float light), trail length, seed
        uniform float uPixel;
        uniform float uFogDensity;
        varying vec4 vCol;
        varying vec2 vQ;
        varying float vKind;
        varying float vH;
        void main() {
          vKind = iC.x;
          vQ = position.xy * 2.0;
          vH = 0.0;
          float dist = length(iA.xyz - cameraPosition);
          if (iC.x > 0.5 && iC.x < 1.5) {
            // the flare's own smoke, hanging along the path it has come down, lit from below
            vec3 up = vec3(0.0, 1.0, 0.0);
            vec3 toCam = normalize(cameraPosition - iA.xyz);
            vec3 side = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0));
            float k = position.y + 0.5;
            float w = max(mix(iA.w * 0.5, iA.w * 2.5, k), dist * uPixel * 1.5);
            vec3 world = iA.xyz + up * k * iC.y + side * position.x * w;
            vH = k;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          } else {
            // never smaller than a few pixels, so a flare far out still reads as a point of light
            float s = max(iA.w, dist * uPixel * (iC.x > 1.5 ? 3.0 : 6.0));
            vec4 mv = viewMatrix * vec4(iA.xyz, 1.0);
            mv.xy += position.xy * s;
            gl_Position = projectionMatrix * mv;
          }
          vCol = iB * exp(-dist * uFogDensity);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec4 vCol;
        varying vec2 vQ;
        varying float vKind;
        varying float vH;
        void main() {
          float a;
          if (vKind < 0.5) {
            float r = length(vQ);
            a = exp(-r * r * 16.0) + exp(-r * 4.5) * 0.08;
            a *= 1.0 - smoothstep(0.75, 1.0, r);
          } else if (vKind < 1.5) {
            a = exp(-vQ.x * vQ.x * 2.5) * exp(-vH * 2.2) * smoothstep(0.0, 0.05, vH);
          } else {
            float r = length(vQ * vec2(1.0, 0.7));
            a = exp(-r * r * 10.0) + exp(-r * 5.0) * 0.1;
            a *= 1.0 - smoothstep(0.8, 1.0, r);
          }
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }

  /** Forget everything (a new game). */
  clear() {
    this.items.length = 0;
    this.flashes.length = 0;
    globalUniforms.uFlareCount.value = 0;
  }

  /**
   * A night light leaves `pos` (the sim's launch point). kind: 'very' | 'sos' | 'star'. A pos already
   * well above the ground (a flare placed in the air) starts burning there.
   */
  launch(pos, kind = 'very', { dir = null } = {}) {
    const K = KINDS[kind];
    if (!K) return null;
    const gy = this.ground(pos.x, pos.z);
    const f = {
      kind, K, t: 0, phase: 'rise', seed: Math.random() * 100, life: K.burn * rr(0.9, 1.1), top: pos.y, s: 0, score: 0,
      pos: new THREE.Vector3(pos.x, Math.max(pos.y, gy + 1.5), pos.z), vel: new THREE.Vector3(),
      stars: null, cx: 0, cz: 0, burstAt: 0,
    };
    const a = dir ? Math.atan2(dir.x, dir.z) : Math.random() * Math.PI * 2;
    if (kind === 'very') {
      const h = rr(5, 10);
      f.vel.set(Math.sin(a) * h, rr(37, 42), Math.cos(a) * h);
      f.phase = 'burn';
    } else if (kind === 'sos') {
      f.vel.set(Math.sin(a) * rr(2, 6), rr(66, 74), Math.cos(a) * rr(2, 6));
      f.burstAt = rr(2.3, 2.7);
    } else f.vel.set(Math.sin(a) * rr(3, 9), rr(84, 90), Math.cos(a) * rr(3, 9));
    if (pos.y > gy + 120) {
      // already airborne (placed by a test or a shell burst): skip the climb
      f.vel.set(0, 0, 0);
      if (kind === 'sos') this.burstRocket(f);
      else if (kind === 'star') this.openChute(f);
    }
    if (this.items.length >= MAX_ITEMS) this.items.shift();
    this.items.push(f);
    return f;
  }

  /**
   * A brief light: a muzzle blast, a shell burst, an ammunition dump going up. `intensity` is the
   * flash's peak power as the fx module sends it (a 15-inch muzzle flash ~1e7, a burst ~3e6); it is
   * scaled down to light units here (a surface at distance d gets about 0.02 * intensity / d^2). It
   * dies off as (1 - age/life)^2 over `life` seconds. The softening radius and the reach follow the
   * intensity unless given in `opts` { radius, reach }.
   */
  flash(pos, color = 0xffc070, intensity = 2e6, life = 0.25, opts = {}) {
    // the callers' numbers are peak flash power (a 15-inch muzzle ~1e7); on the ground the light is
    // cut to what looks right through the exposure: ~3 sun-strengths at 100 m, 0.25 at a kilometre
    const rt = Math.sqrt(intensity);
    intensity *= 0.02;
    const soft = opts.radius ?? 12 + 0.012 * rt;
    const reach = opts.reach ?? 600 + 0.9 * rt;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const fl = this.flashes.length >= MAX_FLASHES ? this.flashes.shift() : { pos: new THREE.Vector3(), c: new THREE.Color(), score: 0, s: 0 };
    fl.pos.set(pos.x, pos.y, pos.z);
    fl.c.copy(c);
    fl.I = intensity;
    fl.soft = soft;
    fl.reach = reach;
    fl.life = Math.max(life, 0.03);
    fl.t = 0;
    this.flashes.push(fl);
  }

  burstRocket(f) {
    f.phase = 'burn';
    f.t = 0;
    f.life = f.K.burn * rr(0.85, 1.1);
    f.stars = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr(-0.3, 0.3), e = rr(-0.2, 0.9), sp = rr(9, 17);
      f.stars.push({ x: 0, y: 0, z: 0, vx: Math.sin(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.cos(a) * Math.cos(e) * sp });
    }
    f.vel.set(0, 0, 0);
    this.onIgnite?.(f.pos, 'sos');
  }

  openChute(f) {
    f.phase = 'burn';
    f.t = 0;
    f.top = f.pos.y;
    f.vel.multiplyScalar(0.2);
    this.onIgnite?.(f.pos, 'star');
    this.flash(f.pos, 0xe6f2ff, 2e6, 0.5, { radius: 40, reach: 3500 });
  }

  /** Light strength 0..1 of an item at its age (ramps up, flickers, gutters out). */
  strength(f) {
    if (f.phase !== 'burn') return f.kind === 'sos' ? 0.25 : 0; // the climbing rocket is a faint red spark
    const up = Math.min(1, f.t / (f.kind === 'star' ? 0.7 : 0.15));
    const out = Math.min(1, (f.life - f.t) / (f.kind === 'star' ? 5 : 1.5));
    const flick = 0.93 + 0.04 * Math.sin(f.t * 23 + f.seed) + 0.03 * Math.sin(f.t * 61 + f.seed * 3);
    return Math.max(0, up * out * flick);
  }

  /**
   * How well lit a point is by the burning night lights (about 1 at 1.2 km from a star shell's
   * 1.5e6 light units): what a spotter needs to see the wire by.
   */
  lightAt(p) {
    let sum = 0;
    for (const f of this.items) {
      const s = this.strength(f);
      if (s <= 0) continue;
      const d2 = f.pos.distanceToSquared(p) + f.K.soft * f.K.soft;
      sum += (s * f.K.I) / d2 / 1.04;
    }
    return sum;
  }

  update(dt, camera, pixel) {
    this.mat.uniforms.uPixel.value = pixel;
    const wind = this.wind;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      const gy = this.ground(f.pos.x, f.pos.z);
      if (f.phase === 'rise') {
        f.vel.multiplyScalar(Math.exp(-dt * 0.12));
        f.vel.y -= G * dt;
        f.pos.addScaledVector(f.vel, dt);
        if (f.kind === 'sos' && f.t >= f.burstAt) this.burstRocket(f);
        else if (f.kind === 'star' && (f.pos.y - gy > f.K.fuzeAlt || f.vel.y < 4)) this.openChute(f);
      } else if (f.kind === 'very') {
        // arcs up and over, then drifts down on its own drag (a tiny, fast star: no canopy)
        f.vel.y -= G * dt;
        if (f.vel.y < -7) f.vel.y = -7;
        f.vel.x += (wind.x - f.vel.x) * (1 - Math.exp(-dt * 0.4)) * 0.3;
        f.vel.z += (wind.z - f.vel.z) * (1 - Math.exp(-dt * 0.4)) * 0.3;
        f.pos.addScaledVector(f.vel, dt);
      } else if (f.kind === 'star') {
        f.vel.lerp(_v.set(wind.x, -f.K.sink, wind.z), 1 - Math.exp(-dt * 1.2));
        f.pos.addScaledVector(f.vel, dt);
      } else if (f.stars) {
        // the burst stars spread, slow in the air and sink; the light sits at their middle
        f.pos.x += wind.x * dt * 0.6;
        f.pos.z += wind.z * dt * 0.6;
        f.pos.y -= 3.2 * dt;
        const d = Math.exp(-dt * 1.4);
        for (const st of f.stars) {
          st.vx *= d; st.vy = st.vy * d - 1.2 * dt; st.vz *= d;
          st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
        }
      }
      const gone = f.phase === 'burn' && f.t > f.life;
      if (gone || f.pos.y < gy + 0.6 || f.t > 120) this.items.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t += dt;
      if (fl.t >= fl.life) this.flashes.splice(i, 1);
    }

    // the brightest lights (strength over distance to the camera) become the scene's analytic lights
    const cand = this.cand;
    cand.length = 0;
    const cp = camera.position;
    for (const f of this.items) {
      f.s = this.strength(f);
      if (f.s <= 0.01) continue;
      f.score = (f.K.I * f.s) / (f.pos.distanceToSquared(cp) + f.K.soft * f.K.soft);
      cand.push(f);
    }
    for (const fl of this.flashes) {
      const k = 1 - fl.t / fl.life;
      fl.s = k * k;
      fl.score = (fl.I * fl.s) / (fl.pos.distanceToSquared(cp) + fl.soft * fl.soft);
      cand.push(fl);
    }
    cand.sort((a, b) => b.score - a.score);
    const n = Math.min(cand.length, MAX_FLARE_LIGHTS);
    const U = globalUniforms;
    for (let i = 0; i < n; i++) {
      const c = cand[i];
      U.uFlarePos.value[i].copy(c.pos);
      if (c.K) {
        const col = c.K.color;
        U.uFlareCol.value[i].set(col[0], col[1], col[2]).multiplyScalar(c.K.I * c.s * (c.kind === 'sos' && c.phase !== 'burn' ? 0.1 : 1));
        U.uFlareRng.value[i].set(c.phase === 'burn' ? c.K.soft : 40, c.K.reach);
      } else {
        U.uFlareCol.value[i].set(c.c.r, c.c.g, c.c.b).multiplyScalar(c.I * c.s);
        U.uFlareRng.value[i].set(c.soft, c.reach);
      }
    }
    U.uFlareCount.value = n;

    // sprites
    const A = this.aA.array, B = this.aB.array, C = this.aC.array;
    let k = 0;
    const put = (x, y, z, size, r, g, b, kind, len, seed) => {
      if (k >= MAX_SPRITES) return;
      const o = k * 4;
      A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = size;
      B[o] = r; B[o + 1] = g; B[o + 2] = b; B[o + 3] = 1;
      C[o] = kind; C[o + 1] = len; C[o + 2] = seed; C[o + 3] = 0;
      k++;
    };
    for (const f of this.items) {
      const c = f.K.color, p = f.pos;
      const s = f.phase === 'burn' ? this.strength(f) : 0.4;
      if (s <= 0.01) continue;
      const g = f.K.glow * s;
      if (f.stars) {
        for (const st of f.stars) put(p.x + st.x, p.y + st.y, p.z + st.z, f.K.size, c[0] * g, c[1] * g, c[2] * g, 0, 0, f.seed);
      } else put(p.x, p.y, p.z, f.K.size, c[0] * g, c[1] * g, c[2] * g, 0, 0, f.seed);
      // the smoke it leaves, hanging along the path it has come down (the climb of a rocket too)
      const len = Math.min(f.top - p.y + (f.phase === 'rise' || f.kind === 'sos' ? p.y - this.ground(p.x, p.z) : 0), 140);
      if (f.kind === 'star' && f.phase === 'burn' && f.top - p.y > 2) put(p.x, p.y + 1, p.z, 5, 0.5 * s, 0.5 * s, 0.5 * s, 1, Math.min(f.top - p.y, 140), f.seed);
      else if (f.kind !== 'star' && f.kind !== 'sos' && len > 2) put(p.x, p.y + 1, p.z, 2.5, 0.35 * s, 0.33 * s, 0.3 * s, 1, Math.min(len, 60), f.seed);
    }
    for (const a of [this.aA, this.aB, this.aC]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, k * 4);
      a.needsUpdate = true;
    }
    this.mesh.geometry.instanceCount = k;
    this.mesh.visible = k > 0;
  }

  get burning() {
    return this.items.filter((f) => f.phase === 'burn').length;
  }
}

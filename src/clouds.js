import * as THREE from 'three';
import { globalUniforms, noiseGLSL, MAX_FLARE_LIGHTS } from './shaderlib.js';
import { mulberry32 } from './noise.js';

// Fair-weather cumulus: clusters of lit, soft billboards at 1000-1700 m, recycled around the
// camera and drifting with the wind. Sorted back to front every frame. Over Flanders in autumn the
// sky is mostly a low grey deck instead: one big camera-following plane at DECK_Y with fbm holes,
// lit from below by the ambient (and by star shells), from above by the sun (a shell that climbs
// through it comes out into the light).
const FIELD = 44000;
const DECK_Y = 800;

export class Clouds {
  constructor(scene, { count = 130 } = {}) {
    const rand = mulberry32(5);
    this.clouds = [];
    const puffs = [];
    for (let c = 0; c < count; c++) {
      const cloud = {
        x: (rand() - 0.5) * FIELD,
        z: (rand() - 0.5) * FIELD,
        base: 1000 + rand() * 350,
        size: 0.8 + rand() * 1.5,
        puffs: [],
      };
      const n = Math.round(16 + cloud.size * 26);
      const w = 270 * cloud.size, tall = 280 * cloud.size;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand());
        // a flat base layer, then towers that narrow upward
        const h = Math.pow(rand(), 1.6);
        const narrow = 1 - h * 0.6;
        const p = {
          cloud,
          ox: Math.cos(a) * d * w * narrow,
          oz: Math.sin(a) * d * w * 0.75 * narrow,
          oy: h * tall + 30,
          s: (100 + rand() * 130) * cloud.size * (1 - h * 0.3),
          seed: rand() * 100,
        };
        cloud.puffs.push(p);
        puffs.push(p);
      }
      this.clouds.push(cloud);
    }
    this.puffs = puffs;
    this.wind = new THREE.Vector2(-4, 1.5);

    const q = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = q.index;
    g.setAttribute('position', q.attributes.position);
    g.setAttribute('uv', q.attributes.uv);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA);
    g.setAttribute('iB', this.aB);
    g.instanceCount = puffs.length;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uLightView: { value: new THREE.Vector3(0, 1, 0) },
          uSun: { value: new THREE.Color(1, 1, 1) },
          uAmbient: { value: new THREE.Color(0.5, 0.6, 0.7) },
          uCover: { value: 1 },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute vec4 iA; // centre, size
        attribute vec4 iB; // height in cloud 0..1, seed, cloud base, unused
        varying vec2 vUv;
        varying vec4 vB;
        varying float vY;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = viewMatrix * vec4(iA.xyz, 1.0);
          mvPosition.xy += position.xy * iA.w;
          vUv = uv;
          vB = iB;
          vY = iA.y + position.y * iA.w * 0.6 - iB.z;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLightView;
        uniform vec3 uSun;
        uniform vec3 uAmbient;
        uniform float uCover;
        varying vec2 vUv;
        varying vec4 vB;
        varying float vY;
        ${noiseGLSL}
        #include <fog_pars_fragment>
        void main() {
          vec2 q = vUv * 2.0 - 1.0;
          float r = length(q);
          if (r > 1.0) discard;
          vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));
          // billowy, lumpy edges instead of a disc
          float lump = fbm2(q * 2.3 + vB.y) - 0.5;
          float fine = fbm2(q * 7.0 - vB.y * 1.7) - 0.5;
          float rr = r + lump * 0.3 + fine * 0.12;
          float dens = smoothstep(1.0, 0.5, rr);
          // flat, dark bases; bright, billowing tops
          dens *= smoothstep(-30.0, 40.0, vY);
          if (dens < 0.01) discard;
          float ndl = dot(n, uLightView);
          float hk = clamp(vY / 500.0, 0.0, 1.0);
          vec3 lit = uSun * (0.35 + 0.65 * max(ndl, 0.0)) * (0.55 + 0.45 * hk);
          lit += uSun * pow(max(-uLightView.z, 0.0), 6.0) * (1.0 - dens) * 0.6; // silver lining
          vec3 col = uAmbient * (0.6 + 0.5 * hk) + lit * 0.9;
          // parachute flares light the cloud bases from below (softened close in: a billboard is
          // not a volume, and a flare hanging just under one would blow it out)
          for (int fi = 0; fi < ${MAX_FLARE_LIGHTS}; fi++) {
            if (fi >= uFlareCount) break;
            vec3 fd = uFlarePos[fi] - vFogWorldPos;
            col += uFlareCol[fi] * flareAtt(fi, dot(fd, fd) + 1.0e6) * 0.15 * (1.0 - 0.5 * hk);
          }
          gl_FragColor = vec4(col, dens * 0.92 * uCover);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    Object.assign(this.mat.uniforms, globalUniforms);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    const dq = new THREE.PlaneGeometry(1, 1);
    dq.rotateX(-Math.PI / 2);
    this.deckMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uSun: { value: new THREE.Color(1, 1, 1) },
          uAmbient: { value: new THREE.Color(0.5, 0.6, 0.7) },
          uDeck: { value: 0 },
          uOff: { value: new THREE.Vector2() },
          uDeckY: { value: DECK_Y },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform vec3 uAmbient;
        uniform float uDeck;
        uniform vec2 uOff;
        uniform float uDeckY;
        ${noiseGLSL}
        #include <fog_pars_fragment>
        void main() {
          vec2 q = vFogWorldPos.xz * 0.00075 + uOff;
          // broad banks, torn thin patches and a fine mottling, all drifting with the wind
          float f = fbm2(q) * 0.55 + fbm2(q * 2.7 + 7.0) * 0.3 + fbm2(q * 9.0 + 3.0) * 0.15;
          float lo = 0.86 - 0.7 * uDeck;
          float a = smoothstep(lo, lo + 0.16, f);
          float thick = smoothstep(lo, lo + 0.45, f);
          // flat grey underside, darker where the deck is thick; sunlit top
          bool above = cameraPosition.y > uDeckY;
          vec3 col = above ? uAmbient * 0.9 + uSun * (0.55 + 0.35 * thick) : uAmbient * (0.95 - 0.75 * thick) + uSun * 0.16 * (1.0 - thick);
          for (int fi = 0; fi < ${MAX_FLARE_LIGHTS}; fi++) {
            if (fi >= uFlareCount) break;
            vec3 fd = uFlarePos[fi] - vFogWorldPos;
            col += uFlareCol[fi] * flareAtt(fi, dot(fd, fd) + 4.0e5) * 0.25 * (above ? 0.2 : 1.0);
          }
          // thin toward the horizon so the deck melts into the haze rather than ending in a line
          gl_FragColor = vec4(col, a * 0.97);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    Object.assign(this.deckMat.uniforms, globalUniforms);
    this.deck = new THREE.Mesh(dq, this.deckMat);
    this.deck.scale.setScalar(90000);
    this.deck.position.y = DECK_Y;
    this.deck.frustumCulled = false;
    this.deck.renderOrder = 1;
    scene.add(this.deck);
    this.order = new Float64Array(puffs.length);
    this._v = new THREE.Vector3();
  }

  update(dt, camera, { sunDir, sunColor, sunIntensity = 6.5, ambient, cover = 1, deck = 0 }) {
    const du = this.deckMat.uniforms;
    du.uDeck.value = deck;
    du.uSun.value.copy(sunColor).multiplyScalar(sunIntensity / Math.PI * 0.5);
    du.uAmbient.value.copy(ambient);
    du.uOff.value.x += this.wind.x * dt * 0.00075 * 0.5;
    du.uOff.value.y += this.wind.y * dt * 0.00075 * 0.5;
    this.deck.visible = deck > 0.02;
    this.deck.position.x = camera.position.x;
    this.deck.position.z = camera.position.z;
    cover *= 1 - 0.85 * deck;
    const cx = camera.position.x, cz = camera.position.z;
    const half = FIELD / 2;
    for (const c of this.clouds) {
      c.x += this.wind.x * dt;
      c.z += this.wind.y * dt;
      // wrap around the camera so the sky never runs out
      if (c.x - cx > half) c.x -= FIELD;
      if (c.x - cx < -half) c.x += FIELD;
      if (c.z - cz > half) c.z -= FIELD;
      if (c.z - cz < -half) c.z += FIELD;
    }
    const e = camera.matrixWorldInverse.elements;
    const P = this.puffs;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const x = p.cloud.x + p.ox, y = p.cloud.base + p.oy, z = p.cloud.z + p.oz;
      p.x = x;
      p.y = y;
      p.z = z;
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      this.order[i] = Math.floor((vz + 100000) * 4) * 16384 + i;
    }
    const sorted = this.order.sort();
    const A = this.aA.array, B = this.aB.array;
    for (let k = 0; k < P.length; k++) {
      const p = P[sorted[k] % 16384];
      const o = k * 4;
      A[o] = p.x;
      A[o + 1] = p.y;
      A[o + 2] = p.z;
      A[o + 3] = p.s;
      B[o] = p.oy / 400;
      B[o + 1] = p.seed;
      B[o + 2] = p.cloud.base;
    }
    this.aA.needsUpdate = true;
    this.aB.needsUpdate = true;
    const u = this.mat.uniforms;
    u.uLightView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    u.uSun.value.copy(sunColor).multiplyScalar(sunIntensity / Math.PI);
    u.uAmbient.value.copy(ambient);
    u.uCover.value = cover;
  }
}

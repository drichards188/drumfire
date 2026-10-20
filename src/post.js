import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

const fsVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const linearDepthGLSL = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  float linDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }
`;

// ---------------------------------------------------------------- scene pass
// Renders the scene once into an HDR target with a depth texture that the
// AO and depth of field reuse, then resolves it.
// The resolve doubles as the place where blast waves and heat shimmer bend the picture: it already
// runs once per frame over the whole screen, so the refraction costs one depth fetch and nothing when
// no wave is alive. The ring is a shell of radius (now - t0) * speed around the blast in world space,
// rebuilt from depth, so it sweeps over hills, stops at the sky and fades with the distance.
export const MAX_SHOCKS = 4;
const resolveFrag = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform mat4 uViewProj;
  uniform mat4 uInvViewProj;
  uniform vec3 uCam;
  uniform float uNow;
  uniform int uShockN;
  uniform int uHeatN;
  uniform vec4 uShock[${MAX_SHOCKS}];  // centre, start time
  uniform vec4 uShockP[${MAX_SHOCKS}]; // max radius, speed, strength, attenuation distance
  uniform vec4 uHeat[${MAX_SHOCKS}];   // centre, radius
  uniform vec4 uHeatP[${MAX_SHOCKS}];  // strength (envelope), 0, 0, 0
  varying vec2 vUv;
  float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    if (uShockN + uHeatN == 0) { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); return; }
    float depth = texture2D(tDepth, vUv).x;
    vec4 wp4 = uInvViewProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 world = wp4.xyz / wp4.w;
    bool sky = depth > 0.99995;
    vec2 off = vec2(0.0);
    float lift = 0.0;
    for (int i = 0; i < ${MAX_SHOCKS}; i++) {
      if (i < uShockN && !sky) {
        float R = (uNow - uShock[i].w) * uShockP[i].y;
        if (R > 0.0 && R < uShockP[i].x) {
          float w = 5.0 + 0.12 * R;
          float x = (distance(world, uShock[i].xyz) - R) / w;
          float ring = exp(-x * x);
          float fade = 1.0 - R / uShockP[i].x;
          float amp = uShockP[i].z * fade * fade / (1.0 + distance(uShock[i].xyz, uCam) / uShockP[i].w);
          vec3 n = normalize(world - uShock[i].xyz);
          vec3 src = world - n * (w * 0.75 * amp * ring);
          vec4 pc = uViewProj * vec4(src, 1.0);
          vec2 d = pc.xy / pc.w * 0.5 + 0.5 - vUv;
          off += clamp(d, vec2(-0.05), vec2(0.05));
          lift += ring * amp * 0.12; // the condensation front
        }
      }
      if (i < uHeatN && !sky) {
        float r = uHeat[i].w;
        vec3 dc = world - uHeat[i].xyz;
        float m = exp(-dot(dc, dc) / (r * r)) * uHeatP[i].x;
        vec2 q = world.xz * 0.35 + vec2(0.0, world.y * 0.9 - uNow * 4.0);
        off += (vec2(vn(q), vn(q + 7.3)) - 0.5) * 0.012 * m;
      }
    }
    vec3 col = texture2D(tDiffuse, clamp(vUv + off, vec2(0.001), vec2(0.999))).rgb;
    gl_FragColor = vec4(col * (1.0 + lift), 1.0);
  }
`;

class ScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture });
    this.depthTexture = depthTexture;
    const vec4s = () => Array.from({ length: MAX_SHOCKS }, () => new THREE.Vector4());
    this.resolve = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: this.rt.texture },
          tDepth: { value: depthTexture },
          uViewProj: { value: new THREE.Matrix4() },
          uInvViewProj: { value: new THREE.Matrix4() },
          uCam: { value: new THREE.Vector3() },
          uNow: { value: 0 },
          uShockN: { value: 0 },
          uHeatN: { value: 0 },
          uShock: { value: vec4s() },
          uShockP: { value: vec4s() },
          uHeat: { value: vec4s() },
          uHeatP: { value: vec4s() },
        },
        vertexShader: fsVertex,
        fragmentShader: resolveFrag,
        depthTest: false,
        depthWrite: false,
      })
    );
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const u = this.resolve.material.uniforms;
    if (u.uShockN.value + u.uHeatN.value > 0) {
      u.uViewProj.value.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      u.uInvViewProj.value.copy(u.uViewProj.value).invert();
      u.uCam.value.copy(this.camera.position);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.resolve.render(renderer);
  }
  dispose() {
    this.rt.dispose();
    this.resolve.dispose();
  }
}

// ---------------------------------------------------------------- auto exposure
// Center-weighted log-average luminance, reduced on the GPU (64 -> 16 -> 4 -> 1)
// and smoothed over time like an eye adapting.
class ExposurePass extends Pass {
  constructor() {
    super();
    const rt = (s) => new THREE.WebGLRenderTarget(s, s, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
    this.chain = [rt(64), rt(16), rt(4), rt(1)];
    this.adapt = [rt(1), rt(1)];
    this.ping = 0;
    this.first = true;
    this.params = { auto: true, key: 0.2, min: 0.25, max: 2.0, up: 2.5, down: 1.0 };
    this.dt = 1 / 60;
    this.dazzle = 0; // extra stop-down, set by PostFX.dazzle

    this.lumQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: fsVertex,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          float acc = 0.0;
          for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
            vec2 o = (vec2(float(i), float(j)) - 1.5) / 256.0;
            vec3 c = texture2D(tDiffuse, vUv + o).rgb;
            acc += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
          }
          vec2 d = (vUv - 0.5) * 2.0;
          float w = exp(-dot(d, d) * 1.5) + 0.15;
          gl_FragColor = vec4(acc / 16.0 * w, w, 0.0, 1.0);
        }
      `,
    }));
    this.reduceQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null } },
      vertexShader: fsVertex,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc;
        void main() {
          ivec2 b = ivec2(gl_FragCoord.xy) * 4;
          vec4 s = vec4(0.0);
          for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) s += texelFetch(tSrc, b + ivec2(i, j), 0);
          gl_FragColor = s / 16.0;
        }
      `,
    }));
    this.adaptQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tPrev: { value: null }, tCur: { value: null }, uDt: { value: 0 }, uUp: { value: 2 }, uDown: { value: 1 }, uReset: { value: 1 } },
      vertexShader: fsVertex,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPrev;
        uniform sampler2D tCur;
        uniform float uDt, uUp, uDown, uReset;
        void main() {
          vec4 c = texelFetch(tCur, ivec2(0), 0);
          float cur = c.r / max(c.g, 1e-4);
          float prev = texelFetch(tPrev, ivec2(0), 0).r;
          float speed = cur > prev ? uUp : uDown;
          float v = uReset > 0.5 ? cur : prev + (cur - prev) * (1.0 - exp(-uDt * speed));
          gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
        }
      `,
    }));
    this.applyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tAdapt: { value: null },
        uKey: { value: 0.2 }, uMin: { value: 0.25 }, uMax: { value: 3.5 }, uOn: { value: 1 }, uDazzle: { value: 0 },
      },
      vertexShader: fsVertex,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tAdapt;
        uniform float uKey, uMin, uMax, uOn, uDazzle;
        varying vec2 vUv;
        void main() {
          float avg = exp(texelFetch(tAdapt, ivec2(0), 0).r);
          float e = uOn > 0.5 ? clamp(uKey / avg, uMin, uMax) : 1.0;
          e /= 1.0 + uDazzle; // a blast beside the camera: the eye stops down hard and takes seconds to open
          gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * e, 1.0);
        }
      `,
    }));
  }

  render(renderer, writeBuffer, readBuffer) {
    const p = this.params;
    this.lumQuad.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.chain[0]);
    this.lumQuad.render(renderer);
    for (let i = 1; i < this.chain.length; i++) {
      this.reduceQuad.material.uniforms.tSrc.value = this.chain[i - 1].texture;
      renderer.setRenderTarget(this.chain[i]);
      this.reduceQuad.render(renderer);
    }
    const prev = this.adapt[this.ping], next = this.adapt[1 - this.ping];
    const au = this.adaptQuad.material.uniforms;
    au.tPrev.value = prev.texture;
    au.tCur.value = this.chain[3].texture;
    au.uDt.value = this.dt;
    au.uUp.value = p.up;
    au.uDown.value = p.down;
    au.uReset.value = this.first ? 1 : 0;
    renderer.setRenderTarget(next);
    this.adaptQuad.render(renderer);
    this.first = false;
    this.ping = 1 - this.ping;

    const u = this.applyQuad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tAdapt.value = next.texture;
    u.uKey.value = p.key;
    u.uMin.value = p.min;
    u.uMax.value = p.max;
    u.uOn.value = p.auto ? 1 : 0;
    u.uDazzle.value = this.dazzle || 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.applyQuad.render(renderer);
  }
}

// ---------------------------------------------------------------- depth of field
const DoFShader = {
  name: 'DoFShader',
  defines: { SAMPLES: 48 },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    uFocus: { value: 20 },
    uAuto: { value: 0 },
    uAperture: { value: 0.6 },
    uMaxBlur: { value: 14 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: fsVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFocus, uAuto, uAperture, uMaxBlur;
    uniform vec2 uResolution;
    varying vec2 vUv;
    ${linearDepthGLSL}
    float coc(float d, float f) { return clamp(uAperture * abs(d - f) / max(d, 1e-3), 0.0, 1.0) * uMaxBlur; }
    void main() {
      float focus = uFocus;
      if (uAuto > 0.5) {
        focus = 0.0;
        for (int i = 0; i < 5; i++) {
          vec2 o = vec2(float(i % 3) - 1.0, float(i / 3) - 0.5) * 0.02;
          focus += linDepth(vec2(0.5) + o);
        }
        focus /= 5.0;
      }
      float d0 = linDepth(vUv);
      float r0 = coc(d0, focus);
      vec3 c0 = texture2D(tDiffuse, vUv).rgb;
      if (r0 < 0.5) { gl_FragColor = vec4(c0, 1.0); return; }
      vec3 acc = c0;
      float wsum = 1.0;
      vec2 px = 1.0 / uResolution;
      float ga = 2.39996323;
      for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i) + 0.5;
        float r = sqrt(fi / float(SAMPLES)) * r0;
        float a = fi * ga;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * px;
        float sd = linDepth(uv);
        float sr = coc(sd, focus);
        if (sd > d0) sr = min(sr, r0); // sharp foreground must not smear onto blurred background
        float w = clamp(sr - r + 1.0, 0.0, 1.0);
        acc += texture2D(tDiffuse, uv).rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, 1.0);
    }
  `,
};

// ---------------------------------------------------------------- lens
// God rays, lens flare and chromatic aberration, driven by the actual
// brightness at the sun's screen position so they are occluded naturally.
const LensShader = {
  name: 'LensShader',
  defines: { RAY_SAMPLES: 48 },
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uSunOnScreen: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAspect: { value: 1 },
    uCA: { value: 0.012 },
    uFlare: { value: 1 },
    uRays: { value: 1 },
  },
  vertexShader: fsVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uSunOnScreen;
    uniform vec3 uSunColor;
    uniform float uAspect;
    uniform float uCA;
    uniform float uFlare;
    uniform float uRays;
    varying vec2 vUv;

    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec2 dir = vUv - 0.5;
      float d2 = dot(dir, dir);
      vec2 off = dir * d2 * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      if (uSunOnScreen > 0.001) {
        float vis = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236;
          vec2 o = vec2(cos(a), sin(a) * uAspect) * 0.004 * float(1 + i % 3);
          vis += smoothstep(3.0, 20.0, lum(texture2D(tDiffuse, uSun + o).rgb));
        }
        vis = vis / 12.0 * uSunOnScreen;

        vec2 delta = (uSun - vUv) / float(RAY_SAMPLES) * 0.85;
        vec2 p = vUv;
        float decay = 1.0, rays = 0.0;
        float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
        p += delta * jitter;
        for (int i = 0; i < RAY_SAMPLES; i++) {
          p += delta;
          float l = lum(texture2D(tDiffuse, p).rgb);
          rays += smoothstep(2.0, 10.0, l) * decay;
          decay *= 0.965;
        }
        rays /= float(RAY_SAMPLES);
        vec2 sd = (vUv - uSun) * vec2(uAspect, 1.0);
        float falloff = exp(-length(sd) * 2.2);
        col += uSunColor * rays * falloff * uRays * 0.35 * uSunOnScreen;

        vec3 flare = vec3(0.0);
        vec2 axis = vec2(0.5) - uSun;
        float ghostPos[5] = float[](0.35, 0.7, 1.15, 1.45, 1.9);
        float ghostSize[5] = float[](0.05, 0.02, 0.09, 0.035, 0.13);
        vec3 ghostTint[5] = vec3[](vec3(0.4, 0.8, 1.0), vec3(1.0, 0.6, 0.3), vec3(0.5, 1.0, 0.6), vec3(1.0, 0.4, 0.8), vec3(0.3, 0.5, 1.0));
        for (int i = 0; i < 5; i++) {
          vec2 gp = uSun + axis * ghostPos[i];
          float gd = length((vUv - gp) * vec2(uAspect, 1.0));
          float g = smoothstep(ghostSize[i], ghostSize[i] * 0.6, gd);
          g *= 0.6 + 0.4 * smoothstep(ghostSize[i] * 0.5, ghostSize[i], gd);
          flare += ghostTint[i] * g * 0.05;
        }
        vec2 hv = normalize(vUv - vec2(0.5)) * 0.32 + vec2(0.5);
        float halo = smoothstep(0.08, 0.0, abs(length((vUv - vec2(0.5)) * vec2(uAspect, 1.0)) - length((uSun - vec2(0.5)) * vec2(uAspect, 1.0)) * 0.7));
        halo *= exp(-length((vUv - hv) * vec2(uAspect, 1.0)) * 3.0) * 0.03;
        float streak = exp(-abs(sd.y) * 260.0) * exp(-abs(sd.x) * 2.2) * 0.35;
        float glow = exp(-length(sd) * 12.0) * 0.25;
        col += uSunColor * (flare + halo + streak + glow) * vis * uFlare;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ---------------------------------------------------------------- grade
export const GRADES = {
  Kodachrome: { saturation: 1.18, contrast: 1.1, shadow: [0.95, 0.99, 1.06], highlight: [1.08, 1.01, 0.9] },
  Natural: { saturation: 1.1, contrast: 1.05, shadow: [0.97, 1.0, 1.04], highlight: [1.03, 1.0, 0.96] },
  // the default: autumn Flanders, a little drained and warm, fire still reads orange
  Flanders: { saturation: 0.86, contrast: 1.08, shadow: [1.0, 0.99, 0.95], highlight: [1.06, 1.01, 0.92] },
  Cinematic: { saturation: 1.05, contrast: 1.12, shadow: [0.88, 1.0, 1.12], highlight: [1.1, 1.0, 0.88] },
  Warm: { saturation: 1.15, contrast: 1.06, shadow: [1.02, 0.98, 0.92], highlight: [1.1, 1.02, 0.86] },
  Cool: { saturation: 0.95, contrast: 1.04, shadow: [0.9, 0.98, 1.12], highlight: [0.96, 1.0, 1.06] },
  Vivid: { saturation: 1.4, contrast: 1.1, shadow: [0.98, 1.0, 1.02], highlight: [1.02, 1.0, 0.98] },
  Newsreel: { saturation: 0, contrast: 1.3, shadow: [0.98, 0.98, 1], highlight: [1.04, 1.02, 0.97] },
  // autumn 1917: drained colour, warm brown shadows and creamy highlights
  '1917': { saturation: 0.52, contrast: 1.12, shadow: [1.07, 0.97, 0.82], highlight: [1.1, 1.03, 0.88] },
};

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.03 },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.05 },
    uShadowTint: { value: new THREE.Color(0.97, 1.0, 1.04) },
    uHighlightTint: { value: new THREE.Color(1.03, 1.0, 0.96) },
    uSharpen: { value: 0.35 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uFade: { value: 0 },
    uNight: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: fsVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uSaturation, uContrast, uSharpen, uFade, uNight, uFlash;
    uniform vec3 uShadowTint, uHighlightTint;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 px = 1.0 / uResolution;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // contrast-adaptive sharpening
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
      vec3 mn = min(c, min(min(n, s), min(e, w)));
      vec3 mx = max(c, max(max(n, s), max(e, w)));
      vec3 amp = clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0);
      vec3 wgt = -sqrt(amp) * uSharpen * 0.2;
      c = clamp((c + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);

      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      c *= mix(uShadowTint, uHighlightTint, smoothstep(0.1, 0.8, l));
      // night: the eye's rods see dim light without colour and a little blue (the Purkinje
      // shift); flares, fires and tracers are bright enough to keep theirs
      float scot = uNight * (1.0 - smoothstep(0.04, 0.45, l));
      c = mix(c, vec3(l) * vec3(0.78, 0.9, 1.14), scot * 0.8);
      vec2 v = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.9, dot(v, v) * 2.2);
      float g = fract(sin(dot(vUv * 1000.0 + uTime * 17.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += g * uGrain * (1.0 - l * 0.6);
      c = mix(c, vec3(1.0), uFlash); // the white-out of a blast beside the camera
      c *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

// ---------------------------------------------------------------- upscale
// When the scene renders below the canvas resolution (quality preset, dynamic resolution) the last
// pass scales it up itself instead of leaving it to the browser's bilinear stretch: a Catmull-Rom
// bicubic (9 bilinear taps) and a contrast-adaptive sharpen in the spirit of AMD's CAS/RCAS, which
// keeps edges and the crater field crisp without ringing on the smoke.
const UpscaleShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSrc: { value: new THREE.Vector2(1, 1) }, // source size in pixels
    uSharp: { value: 0.25 }, // 0 bicubic only, 1 strongest (the grade pass has its own sharpen before this)
  },
  vertexShader: fsVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSrc;
    uniform float uSharp;
    varying vec2 vUv;
    vec3 catmullRom(vec2 uv) {
      vec2 pos = uv * uSrc;
      vec2 c = floor(pos - 0.5) + 0.5;
      vec2 f = pos - c;
      vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
      vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
      vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
      vec2 w3 = f * f * (-0.5 + 0.5 * f);
      vec2 w12 = w1 + w2;
      vec2 inv = 1.0 / uSrc;
      vec2 t0 = (c - 1.0) * inv, t3 = (c + 2.0) * inv, t12 = (c + w2 / w12) * inv;
      vec3 r = texture2D(tDiffuse, vec2(t0.x, t0.y)).rgb * w0.x * w0.y
        + texture2D(tDiffuse, vec2(t12.x, t0.y)).rgb * w12.x * w0.y
        + texture2D(tDiffuse, vec2(t3.x, t0.y)).rgb * w3.x * w0.y
        + texture2D(tDiffuse, vec2(t0.x, t12.y)).rgb * w0.x * w12.y
        + texture2D(tDiffuse, vec2(t12.x, t12.y)).rgb * w12.x * w12.y
        + texture2D(tDiffuse, vec2(t3.x, t12.y)).rgb * w3.x * w12.y
        + texture2D(tDiffuse, vec2(t0.x, t3.y)).rgb * w0.x * w3.y
        + texture2D(tDiffuse, vec2(t12.x, t3.y)).rgb * w12.x * w3.y
        + texture2D(tDiffuse, vec2(t3.x, t3.y)).rgb * w3.x * w3.y;
      return max(r, 0.0);
    }
    void main() {
      vec3 c = catmullRom(vUv);
      if (uSharp > 0.0) {
        // the cross one source pixel away; the sharpening weight backs off where the local contrast is
        // already high (or near black and white), so edges do not ring
        vec2 px = 1.0 / uSrc;
        vec3 n = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb, s = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
        vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
        vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
        vec3 k = -amp * mix(0.125, 0.2, uSharp);
        c = clamp((c + k * (n + s + e + w)) / (1.0 + 4.0 * k), 0.0, 1.0);
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.camera = camera;
    const size = renderer.getSize(new THREE.Vector2());

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);

    this.scenePass = new ScenePass(scene, camera);
    this.composer.addPass(this.scenePass);

    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.setGBuffer(this.scenePass.depthTexture); // normals reconstructed from the scene depth
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 1.0;
    this.gtao.updateGtaoMaterial({
      radius: 1.4,
      distanceExponent: 1.5,
      thickness: 2.0,
      scale: 1.25,
      samples: 16,
      distanceFallOff: 1,
      screenSpaceRadius: false,
    });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.gtao);

    this.exposure = new ExposurePass();
    this.composer.addPass(this.exposure);

    this.dof = new ShaderPass(DoFShader);
    this.dof.uniforms.tDepth.value = this.scenePass.depthTexture;
    this.dof.enabled = false;
    this.composer.addPass(this.dof);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, 2.5);
    // The bright pass hands HDR texels to the blur chain whole: facing a low sun, the disc (thousands of times the
    // threshold after exposure) and a wide band of sky just over the threshold (auto exposure lifts a dark muddy
    // scene) were spread by the mips into a disc of white over the whole frame (a clear morning). Two changes: only
    // the part of a texel's luminance above the threshold goes in (`uKnee` 1; 0 is three's whole texel), and that is
    // capped (`uCap`, its colour kept), so a fireball or a flare still blooms hard and the sky does not.
    // main's params `bloomCap` and `bloomKnee` set them.
    {
      const hp = this.bloom.materialHighPassFilter, end = 'gl_FragColor = mix( outputColor, texel, alpha );';
      hp.uniforms.uCap = { value: 8 };
      hp.uniforms.uKnee = { value: 1 };
      if (hp.fragmentShader.includes(end)) {
        hp.fragmentShader = hp.fragmentShader.replace('uniform float smoothWidth;', 'uniform float smoothWidth;\nuniform float uCap;\nuniform float uKnee;')
          .replace(end, `texel.rgb *= min( max( v - luminosityThreshold * uKnee, 0.0 ), uCap ) / max( v, 1e-4 );\n${end}`);
        hp.needsUpdate = true;
      } else console.warn('post: the bloom bright pass changed; the bloom cap is not applied');
    }
    this.composer.addPass(this.bloom);

    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.upscale = new ShaderPass(UpscaleShader);
    this.upscale.enabled = false;
    this.composer.addPass(this.upscale);

    this.setSize(size.x, size.y);
    this._v = new THREE.Vector3();
    this._now = 0; // the effects' own clock (seconds of real time)
    this._shocks = []; // { x, y, z, t0, radius, speed, strength }, newest last, at most MAX_SHOCKS
    this._heat = []; // { x, y, z, radius, t0, life, strength }
    this._dzFast = 0; // the white-out and bloom flare of a blast: gone in a second
    this._dzSlow = 0; // the eye's recovery: stopped down for several seconds
  }

  /**
   * A blast wave: a ring of refraction expanding from worldPos at `speed` m/s up to `radius`, rebuilt
   * from depth so it runs over the ground and ignores the sky. strength 1 is a big shell near the
   * camera; the effect fades with the distance of the blast from the camera and as the ring grows.
   */
  shockwave(worldPos, { radius = 300, speed = 343, strength = 1 } = {}) {
    if (this._shocks.length >= MAX_SHOCKS) this._shocks.shift();
    this._shocks.push({ x: worldPos.x, y: worldPos.y, z: worldPos.z, t0: this._now, radius, speed, strength });
  }

  /** A heat shimmer: the air over worldPos wobbling for `life` seconds (muzzle blasts, fires). */
  heat(worldPos, { radius = 6, life = 1.2, strength = 1 } = {}) {
    if (this._heat.length >= MAX_SHOCKS) this._heat.shift();
    this._heat.push({ x: worldPos.x, y: worldPos.y, z: worldPos.z, radius, t0: this._now, life, strength });
  }

  /** A blast beside the camera: k 0..1 whites the picture out, flares the bloom and stops the eye down for seconds. */
  dazzle(k = 1) {
    k = THREE.MathUtils.clamp(k, 0, 1.5);
    this._dzFast = Math.max(this._dzFast, k);
    this._dzSlow = Math.max(this._dzSlow, k * 0.85);
  }

  /**
   * w, h: the canvas in CSS pixels; pr: the scene's pixel ratio (defaults to the renderer's). Below the
   * renderer's own ratio the chain runs at pr and the upscale pass fills the canvas.
   */
  setSize(w, h, pr = this.renderer.getPixelRatio()) {
    const out = this.renderer.getPixelRatio();
    pr = Math.min(pr, out);
    this.pixelRatio = pr;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const sw = Math.max(1, Math.floor(w * pr)), sh = Math.max(1, Math.floor(h * pr));
    this.dof.uniforms.uResolution.value.set(sw, sh);
    this.grade.uniforms.uResolution.value.set(sw, sh);
    this.upscale.enabled = pr < out - 1e-3;
    this.upscale.uniforms.uSrc.value.set(sw, sh);
  }

  setGrade(name) {
    const g = GRADES[name] || GRADES.Natural;
    const u = this.grade.uniforms;
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uShadowTint.value.setRGB(...g.shadow);
    u.uHighlightTint.value.setRGB(...g.highlight);
  }

  update(t, dt, sunDir, sunColor, sunElevation) {
    const u = this.lens.uniforms;
    const v = this._v.copy(this.camera.position).addScaledVector(sunDir, 1000).project(this.camera);
    const inFront = v.z < 1 && v.z > -1;
    u.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    const edge = Math.max(Math.abs(v.x), Math.abs(v.y));
    const onScreen = inFront ? THREE.MathUtils.smoothstep(1.35 - edge, 0, 0.4) : 0;
    u.uSunOnScreen.value = onScreen * THREE.MathUtils.smoothstep(sunElevation, -2, 3);
    u.uRays.value = THREE.MathUtils.lerp(1.4, 0.35, THREE.MathUtils.smoothstep(sunElevation, 5, 45));
    u.uSunColor.value.copy(sunColor);
    u.uAspect.value = this.camera.aspect;

    const d = this.dof.uniforms;
    d.cameraNear.value = this.camera.near;
    d.cameraFar.value = this.camera.far;

    this.grade.uniforms.uTime.value = t;
    this.exposure.dt = dt;

    // blast waves and heat shimmer into the resolve shader; the dazzle decays
    this._now += dt;
    const ru = this.scenePass.resolve.material.uniforms;
    ru.uNow.value = this._now;
    let n = 0;
    for (let i = this._shocks.length - 1; i >= 0; i--) {
      const s = this._shocks[i];
      if ((this._now - s.t0) * s.speed > s.radius) this._shocks.splice(i, 1);
    }
    for (const s of this._shocks) {
      ru.uShock.value[n].set(s.x, s.y, s.z, s.t0);
      ru.uShockP.value[n].set(s.radius, s.speed, s.strength, 700);
      n++;
    }
    ru.uShockN.value = n;
    n = 0;
    for (let i = this._heat.length - 1; i >= 0; i--) if (this._now - this._heat[i].t0 > this._heat[i].life) this._heat.splice(i, 1);
    for (const h of this._heat) {
      const k = 1 - (this._now - h.t0) / h.life;
      ru.uHeat.value[n].set(h.x, h.y, h.z, h.radius);
      ru.uHeatP.value[n].set(h.strength * k * k, 0, 0, 0);
      n++;
    }
    ru.uHeatN.value = n;
    this._dzFast *= Math.exp(-dt * 4.5);
    this._dzSlow *= Math.exp(-dt * 0.42);
    this.exposure.dazzle = this._dzSlow * 2.5 + this._dzFast * 1.5;
    this.grade.uniforms.uFlash.value = Math.max(0, this._dzFast - 0.25) * 0.9;
  }

  render(dt) {
    // the blast flare on the bloom is added for this frame only, so main's own bloom setting stays its own
    const b0 = this.bloom.strength;
    this.bloom.strength = b0 + this._dzFast * 1.2;
    this.composer.render(dt);
    this.bloom.strength = b0;
  }
}

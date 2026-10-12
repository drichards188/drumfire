import * as THREE from 'three';
import { patchMaterial } from '../../shaderlib.js';

// The pose is computed in the vertex shader from four per-instance vec4s, so a man costs 64 bytes
// per frame and no CPU skinning. Angles follow three's rotation convention: a limb hanging along -Y
// swings forward (toward -Z) with a positive rotX, and a standing body pitches onto its back with a
// positive pitch, face down with a negative one.
//
//   aPos   x, y, z (feet on the ground, or height of the feet above it while thrown), heading (rotation.y)
//   aPose  gait phase (cycles), swing amplitude (thigh angle, rad), crouch 0..1, pitch about the hips
//   aLie   flail 0..1 (limp or thrown limbs), rifle mode 0..3, crawl 0..1, seed 0..1
//   aStyle forward lean (rad), size, lift of a lying body (m, negative), fade 0..1 (sinks into the mud)
//
// Rifle modes: 0 port arms (diagonal across the chest), 1 carried in the right hand, 2 ready on the
// ground in front (crawling), 3 dropped beside the body. Hold angles for the arms were solved for
// the hand targets with a two-bone search (shoulder pitch, outward swing, elbow flex).

const GLSL_PARS = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aPose;
attribute vec4 aLie;
attribute vec4 aStyle;
attribute float aPart;
attribute float aKit;
uniform float uT;
uniform vec3 uEye;
uniform float uPxW;
uniform float uMinPx;
uniform vec4 uKitP;
varying float vSeed;
varying float vRestY;
varying float vLie;
varying float vDist;
vec3 gSolPos;

void rotX(inout vec3 p, inout vec3 n, vec3 o, float a) {
  float c = cos(a), s = sin(a);
  vec3 d = p - o;
  p = o + vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z);
  n = vec3(n.x, c * n.y - s * n.z, s * n.y + c * n.z);
}
void rotY(inout vec3 p, inout vec3 n, vec3 o, float a) {
  float c = cos(a), s = sin(a);
  vec3 d = p - o;
  p = o + vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
}
void rotZ(inout vec3 p, inout vec3 n, vec3 o, float a) {
  float c = cos(a), s = sin(a);
  vec3 d = p - o;
  p = o + vec3(c * d.x - s * d.y, s * d.x + c * d.y, d.z);
  n = vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z);
}

const vec3 RP[3] = vec3[3](vec3(0.30, 0.95, -0.30), vec3(0.25, 1.145, 0.275), vec3(0.08, 1.35, -0.14));
const vec2 RR[3] = vec2[3](vec2(0.0, 0.67), vec2(-1.87, 0.0), vec2(0.0, 0.0));
const vec3 HAR[3] = vec3[3](vec3(-0.2, -0.2, 1.75), vec3(-0.15, 0.1, 1.2), vec3(2.15, 0.2, 1.35));
const vec3 HAL[3] = vec3[3](vec3(0.65, 0.7, 2.2), vec3(0.65, 0.7, 2.2), vec3(2.6, 0.25, 0.65));
const vec2 HW[3] = vec2[3](vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)); // hold weight right, left

void soldierXform(inout vec3 p, inout vec3 n) {
  float part = aPart + 0.5;
  float seed = aLie.w;
  float kit = aKit;
  vRestY = p.y;
  if (kit > 0.5) {
    float on = step(fract(seed * (kit * 7.31 + 3.17) + kit * 0.413), uKitP[int(kit - 0.5)]);
    if (on < 0.5) { p = vec3(0.0); n = vec3(0.0, 1.0, 0.0); return; }
  }
  float ph = aPose.x * 6.2831853;
  float amp = aPose.y, cr = aPose.z, pitch = aPose.w;
  float flail = aLie.x, crawl = aLie.z;
  float lean = aStyle.x, scl = aStyle.y, lift = aStyle.z, fade = aStyle.w;
  float sd1 = sin(seed * 57.3), sd2 = sin(seed * 91.7 + 1.3), sd3 = sin(seed * 33.1 + 2.1), sd4 = sin(seed * 71.9 + 0.7);
  float idle = 1.0 - smoothstep(0.02, 0.15, amp);
  float sway = idle * 0.025 * sin(uT * 1.3 + seed * 40.0);
  float phL = ph, phR = ph + 3.14159265;
  float sL = sin(phL), sR = sin(phR);
  float kw = 1.0 + 0.5 * (1.0 - smoothstep(0.25, 0.6, amp)); // knees come higher in the mud
  float sw = amp * (1.0 - crawl);
  float thL = sw * sL + cr * 0.55 + flail * (0.45 * sd1 + 0.2);
  float thR = sw * sR + cr * 0.55 + flail * (0.45 * sd2 + 0.2);
  float kbL = sw * 2.2 * kw * max(0.0, cos(phL)) + cr * 1.1 + flail * (0.5 + 0.4 * sd3);
  float kbR = sw * 2.2 * kw * max(0.0, cos(phR)) + cr * 1.1 + flail * (0.5 + 0.4 * sd4);
  float cL = 0.5 + 0.5 * sL, cR = 0.5 + 0.5 * sR;
  thL = mix(thL, 0.25 * cL, crawl); thR = mix(thR, 0.25 * cR, crawl);
  kbL = mix(kbL, 0.2 + 1.3 * cL, crawl); kbR = mix(kbR, 0.2 + 1.3 * cR, crawl);
  float azL = 0.05 + 0.5 * crawl * cL + flail * (0.2 + 0.3 * abs(sd3));
  float azR = 0.05 + 0.5 * crawl * cR + flail * (0.2 + 0.3 * abs(sd4));
  float dL = 0.44 * cos(thL) + 0.44 * cos(thL - kbL) + 0.065;
  float dR = 0.44 * cos(thR) + 0.44 * cos(thR - kbR) + 0.065;
  float upright = (1.0 - flail) * (1.0 - smoothstep(0.3, 0.9, abs(sin(pitch))));
  float dy = (max(dL, dR) - 0.945) * upright;
  float tl = lean + sway;
  float ty = 0.22 * amp * sin(ph) * (1.0 - crawl);
  float tz = 0.07 * amp * sin(ph + 1.57) * (1.0 - crawl) + flail * 0.2 * sd2;
  vec3 SP = vec3(0.0, 1.0, 0.0);
  vec3 O = vec3(0.0);

  if (part < 1.0) {
    // pelvis: only the bob below
  } else if (part < 2.0) {
    rotY(p, n, SP, ty); rotX(p, n, SP, -tl); rotZ(p, n, SP, tz);
  } else if (part < 3.0) {
    vec3 NK = vec3(0.0, 1.52, 0.0);
    rotX(p, n, NK, 0.8 * tl + crawl * 1.0 + flail * 0.5 * sd3);
    rotY(p, n, NK, -ty * 0.8);
    rotY(p, n, SP, ty); rotX(p, n, SP, -tl); rotZ(p, n, SP, tz);
  } else if (part < 7.0) {
    float side = part < 5.0 ? -1.0 : 1.0;
    float fore = mod(part, 2.0) < 1.0 ? 1.0 : 0.0; // parts 4 and 6 are forearms
    float rm = mix(aLie.y, 3.0, flail);
    float f = fract(rm);
    int i0 = int(floor(rm));
    int i1 = min(i0 + 1, 3);
    float cwS = crawl * 0.25 * sin(ph + (side < 0.0 ? 0.0 : 3.14159));
    // frs swing (walking) and thrown or limp arms
    float sw1 = -amp * 1.1 * (side < 0.0 ? sL : sR) * (1.0 - crawl);
    vec3 frs = vec3(sw1 + flail * (1.2 + 1.5 * (side < 0.0 ? sd1 : sd2)), 0.08 + flail * (0.4 + 0.6 * abs(side < 0.0 ? sd3 : sd4)), 0.25 + amp * 1.1 + cr * 0.5 + flail * (0.5 + 0.4 * sd4));
    vec3 h0 = side < 0.0 ? (i0 < 3 ? HAL[i0] : frs) : (i0 < 3 ? HAR[i0] : frs);
    vec3 h1 = side < 0.0 ? (i1 < 3 ? HAL[i1] : frs) : (i1 < 3 ? HAR[i1] : frs);
    float w0 = i0 < 3 ? (side < 0.0 ? HW[i0].y : HW[i0].x) : 0.0;
    float w1 = i1 < 3 ? (side < 0.0 ? HW[i1].y : HW[i1].x) : 0.0;
    vec3 a0 = mix(frs, h0, w0), a1 = mix(frs, h1, w1);
    vec3 a = mix(a0, a1, f);
    a.x += cwS;
    vec3 S = vec3(side * 0.2, 1.43, 0.0);
    vec3 E = S - vec3(0.0, 0.29, 0.0);
    if (fore > 0.5) rotX(p, n, E, a.z);
    rotX(p, n, S, a.x); rotZ(p, n, S, side * a.y);
    rotY(p, n, SP, ty); rotX(p, n, SP, -tl); rotZ(p, n, SP, tz);
  } else if (part < 11.0) {
    float side = part < 9.0 ? -1.0 : 1.0;
    bool shin = mod(part, 2.0) < 1.0; // parts 8 and 10 are shins
    float th = side < 0.0 ? thL : thR, kb = side < 0.0 ? kbL : kbR, az = side < 0.0 ? azL : azR;
    vec3 H = vec3(side * 0.095, 0.945, 0.0);
    vec3 K = vec3(side * 0.095, 0.505, 0.0);
    if (shin) rotX(p, n, K, -kb);
    rotX(p, n, H, th); rotZ(p, n, H, side * az);
  } else {
    // rifle: butt at the origin, +Y along the barrel
    float rm = mix(aLie.y, 3.0, flail);
    float f = fract(rm);
    int i0 = int(floor(rm));
    int i1 = min(i0 + 1, 3);
    float gz = sign(sin(pitch) + 1e-3) * 0.11;
    vec3 gp = vec3((seed > 0.5 ? 1.0 : -1.0) * (0.45 + 0.2 * abs(sd1)), 0.75 + 0.3 * sd2, gz);
    vec2 gr = vec2(0.0, sd3 * 0.5);
    vec3 pa = i0 < 3 ? RP[i0] : gp; vec3 pb = i1 < 3 ? RP[i1] : gp;
    vec2 ra = i0 < 3 ? RR[i0] : gr; vec2 rb = i1 < 3 ? RR[i1] : gr;
    vec3 rp = mix(pa, pb, f); vec2 rr = mix(ra, rb, f);
    rotX(p, n, O, rr.x); rotZ(p, n, O, rr.y);
    p += rp;
    float held = 1.0 - smoothstep(2.0, 3.0, rm);
    if (held > 0.0) {
      rotY(p, n, SP, ty * held); rotX(p, n, SP, -tl * held); rotZ(p, n, SP, tz * held);
    }
  }
  p.y += dy;
  rotX(p, n, vec3(0.0, 0.945, 0.0), pitch);
  p.y += lift;

  // enlarge distant men so they keep a minimum size on screen
  vec3 root = aPos.xyz;
  float dist = distance(root, uEye);
  float g = abs(sin(pitch));
  float k = max(1.0, uMinPx * mix(1.0, 0.45, g) * dist * uPxW / 1.75);
  k = min(k, 30.0) * (1.0 - smoothstep(0.7, 1.0, fade));
  p = p * (k * scl);
  p.y -= fade * 0.5;
  rotY(p, n, O, aPos.w);
  p += root;
  vSeed = seed; vLie = g; vDist = dist;
}
`;

const FRAG_PARS = /* glsl */ `
varying float vSeed;
varying float vRestY;
varying float vLie;
varying float vDist;
uniform float uFarDark;
`;

const FRAG_COLOR = /* glsl */ `
  {
    float v1 = fract(vSeed * 7.31), v2 = fract(vSeed * 3.77);
    diffuseColor.rgb *= 0.86 + 0.28 * v1;
    float mud = clamp(smoothstep(1.2, 0.05, vRestY) * (0.3 + 0.55 * v2) + vLie * 0.35, 0.0, 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.042, 0.028), mud * 0.6);
    diffuseColor.rgb *= mix(1.0, uFarDark, smoothstep(120.0, 900.0, vDist));
  }
`;

/** Shared uniforms; the Infantry class updates them once per frame. */
export function makeUniforms() {
  return {
    uT: { value: 0 },
    uEye: { value: new THREE.Vector3() },
    uPxW: { value: 0.001 },
    uMinPx: { value: 4.5 },
    uFarDark: { value: 0.5 },
  };
}

/** The lit material of one side (vertex colours from build.js) and its shadow depth material. */
export function makeMaterials(key, shared, kitP) {
  const U = { ...shared, uKitP: { value: new THREE.Vector4(...kitP) } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  patchMaterial(mat, `inf-${key}`, (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_PARS}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal);\n  vec3 sPos = position;\n  soldierXform(sPos, objectNormal);\n  gSolPos = sPos;')
      .replace('#include <begin_vertex>', 'vec3 transformed = gSolPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`);
  });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  patchMaterial(depth, `inf-depth-${key}`, (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 sn = vec3(normal);\n  vec3 transformed = position;\n  soldierXform(transformed, sn);');
  });
  return { mat, depth };
}

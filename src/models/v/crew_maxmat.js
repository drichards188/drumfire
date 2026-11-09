import * as THREE from 'three';

// The max crew tier's material (crew_hd.js PROFILE.max; PLAN.md 3.4): one MeshPhysicalMaterial, one program, one draw
// a figure. On top of the hd tier's vertex colours and per-vertex surface (aSurf: roughness, metalness, normal map
// strength, texture strength) it reads aMax (texture layer, skin weight, ambient occlusion, the headgear whose brim
// shades the face) and aFace (the skin detail's masks: beard, brow, hair, lip; on the eyeballs the iris colour):
//   - skin: light wraps round the terminator per channel (red furthest, the scattered light of skin); pores, stubble,
//     brow hairs and cropped hair drawn in the fragment shader from the bind-pose position (no texture, no seam, faded
//     out by the pixel's footprint so they never shimmer);
//   - the brim's shade: the sun's direction taken into the head bone's frame in the vertex shader and tested against the
//     helmet's rim (or the cap's peak), so a face under a Stahlhelm is shaded as the 9 to 15 cm shadow map never could;
//   - eyes: the iris drawn from the eyeball's own coordinates (fibres, a darker limbal ring, the pupil), the cornea wet;
//   - wool: the soft sheen of cloth at grazing angles (three's Charlie sheen), weighted by the surface;
//   - the roughness is set before shaderlib's rain block, so a wet day still darkens and glosses the cloth.
// In the game it is patched for the fog through shaderlib's patchMaterial (key 'crew-max-fog'); unpatched in the viewer.

const glslNoise = /* glsl */ `
float cHash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float cNoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cHash3(i), cHash3(i + vec3(1, 0, 0)), u.x), mix(cHash3(i + vec3(0, 1, 0)), cHash3(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(cHash3(i + vec3(0, 0, 1)), cHash3(i + vec3(1, 0, 1)), u.x), mix(cHash3(i + vec3(0, 1, 1)), cHash3(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
`;

// The brim test (GLSL): from bind-space point p toward the sun d, does the ray leave under the rim (1, lit) or meet the
// steel or the cap (0)? kind 1 M1935, 2 M1916, 3 the M43 cap's peak. A soft edge of a few millimetres.
const glslBrim = /* glsl */ `
float crewRimY(int kind, float F, float Bk) {
  return kind == 1 ? 1.618 + 0.082 * F * F - 0.026 * pow(Bk, 1.3) : 1.6 + 0.104 * F * F - 0.034 * pow(Bk, 1.3);
}
float crewRimR(int kind, float a, float F, float Bk) {
  float rx = 0.111, rz = kind == 1 ? 0.128 : 0.129;
  float r0 = 1.0 / length(vec2(sin(a) / rx, cos(a) / rz));
  float flare = kind == 1 ? 0.012 + 0.004 * F + 0.022 * pow(Bk, 1.2) : 0.022 + 0.008 * F + 0.034 * pow(Bk, 1.2);
  return r0 + 0.004 + flare;
}
float crewBrim(int kind, vec3 p, vec3 d) {
  if (kind <= 0 || d.y <= 0.02) return 1.0;
  if (kind == 3) {
    // the cap: its band and crown over the head, the peak in front at 1.688
    float t = (1.688 - p.y) / d.y;
    if (t < 0.0) return 1.0;
    vec3 q = p + d * t;
    float a = atan(q.x, -(q.z - 0.006)), r = length(vec2(q.x / 0.0945, (q.z - 0.006) / 0.1095));
    if (r < 1.0) return smoothstep(0.92, 1.0, r);
    float w = abs(a) < 1.0 ? pow(cos(a * 1.5708), 0.6) : 0.0;
    float ro = length(vec2(q.x / (0.093 + 0.058 * w), (q.z - 0.006) / (0.109 + 0.064 * w)));
    return smoothstep(0.96, 1.04, ro);
  }
  // the helmet: march up to the rim's height, then ask whether the ray is inside the rim's outline there
  float t0 = 0.0, t1 = (1.86 - p.y) / d.y;
  for (int i = 0; i < 12; i++) {
    float t = 0.5 * (t0 + t1);
    vec3 q = p + d * t;
    float a = atan(q.x, -(q.z - 0.012)), F = max(0.0, cos(a)), Bk = max(0.0, -cos(a));
    if (q.y > crewRimY(kind, F, Bk)) t1 = t; else t0 = t;
  }
  vec3 q = p + d * t1;
  float a = atan(q.x, -(q.z - 0.012)), F = max(0.0, cos(a)), Bk = max(0.0, -cos(a));
  float r = length(q.xz - vec2(0.0, 0.012)), R = crewRimR(kind, a, F, Bk);
  return smoothstep(-0.004, 0.006, r - R);
}
`;

const NO_MAN = { uMan: new THREE.Vector4(1, 1, 0, 0), uIris: new THREE.Vector4(0, 0, 0, 0) };

// The cloth's, leather's and paint's texture layers (crew_tex.js), shared by every instance: neutral one-texel
// layers until setMaxTextures brings the real ones (render/crewhd.js has a worker make them while the game loads), so
// the program never changes and nothing recompiles.
const LAYERS = 9;
const TEX = {
  tCrewA: { value: arrayTex(new Uint8Array(LAYERS * 4).fill(204).map((v, i) => (i % 4 === 3 ? 128 : v)), 1) },
  tCrewN: { value: arrayTex(new Uint8Array(LAYERS * 4).map((v, i) => [128, 128, 255, 128][i % 4]), 1) },
};
function arrayTex(data, n) {
  const t = new THREE.DataArrayTexture(data, n, n, LAYERS);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
/** The layers from crew_tex.js makeLayers ({ A, N, size }); anisotropy: the renderer's most (16 where it has it). */
export function setMaxTextures(L, anisotropy = 8) {
  if (!L) return;
  for (const [k, data] of [['tCrewA', L.A], ['tCrewN', L.N]]) {
    const t = arrayTex(data, L.size);
    t.anisotropy = anisotropy;
    const old = TEX[k].value;
    TEX[k].value = t;
    old.dispose();
  }
}
// mat: the material instance being compiled (its man's uniforms: render/crewhd.js gives each man his own instance)
export function maxPatch(shader, mat = null) {
  shader.uniforms.uSunDirW ??= { value: new THREE.Vector3(-0.45, 0.78, -0.34).normalize() }; // (the viewer's sun)
  const man = mat?.userData?.man ?? NO_MAN;
  shader.uniforms.uMan = { value: man.uMan };
  shader.uniforms.uIris = { value: man.uIris };
  shader.uniforms.tCrewA = TEX.tCrewA;
  shader.uniforms.tCrewN = TEX.tCrewN;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec4 aSurf;
attribute vec4 aMax;
attribute vec4 aFace;
varying vec4 vSurf;
varying vec4 vMax;
varying vec4 vFace;
varying vec3 vBind;
varying vec2 vCrewUv;
varying float vBrim;
uniform vec3 uSunDirW;
${glslBrim}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf; vMax = aMax; vFace = aFace; vBind = position; vCrewUv = uv;')
    .replace('#include <skinning_vertex>', `#include <skinning_vertex>
vBrim = 1.0;
#ifdef USE_SKINNING
if (aMax.w > 0.5) {
  // the sun's direction in the head bone's bind frame (rotations only: the transpose undoes them)
  mat3 Mh = mat3(modelMatrix) * mat3(bindMatrixInverse) * mat3(boneMatX) * mat3(bindMatrix);
  vec3 dB = normalize(transpose(Mh) * uSunDirW);
  vBrim = crewBrim(int(aMax.w + 0.5), position, dB);
}
#endif`);
  const lightsPhys = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
    `vec3 irrDiff = irradiance;
	if ( vMax.y > 0.001 ) {
		// skin: the light wraps round, red furthest (light scattered under the skin)
		vec3 w = vMax.y * vec3( 0.42, 0.21, 0.11 );
		irrDiff = clamp( ( vec3( dot( geometryNormal, directLight.direction ) ) + w ) / ( 1.0 + w ), 0.0, 1.0 ) * directLight.color;
	}
	reflectedLight.directDiffuse += irrDiff * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`);
  const begin = THREE.ShaderChunk.lights_fragment_begin, at = begin.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const lightsBegin = at < 0 ? begin : begin.slice(0, at) + begin.slice(at).replace('RE_Direct( directLight, geometryPosition', 'directLight.color *= vBrim;\n\t\tRE_Direct( directLight, geometryPosition');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec4 vSurf;
varying vec4 vMax;
varying vec4 vFace;
varying vec3 vBind;
varying vec2 vCrewUv;
varying float vBrim;
// the man (render/crewhd.js): x skin brightness, y stubble, z ruddiness, w dirt; his irises (w > 0: instead of the
// vertex's)
uniform vec4 uMan;
uniform vec4 uIris;
uniform highp sampler2DArray tCrewA;
uniform highp sampler2DArray tCrewN;
float crewRoughD = 0.0, crewCav = 1.0;
${glslNoise}`)
    // the cloth's texture and the skin's and the eyes' detail
    .replace('#include <map_fragment>', `
if ( vMax.x > -0.5 ) {
  // the surface's texture layer (crew_tex.js): over 0.6 m (the uv is metres / 0.3)
  vec4 tA = texture( tCrewA, vec3( vCrewUv * 0.5, floor( vMax.x + 0.5 ) ) );
  diffuseColor.rgb *= mix( vec3( 1.0 ), tA.rgb * 1.25, vSurf.w );
  crewRoughD = ( tA.a - 0.5 ) * 0.6 * vSurf.w;
}` + `
float crewH = 0.0; // bump height (metres) of the skin's detail
{
  vec3 q = vBind * 1000.0; // millimetres
  float fw = length( fwidth( vBind ) ) * 1000.0; // millimetres a pixel covers
  if ( vMax.x < -1.5 ) {
    // the eye: the iris from the eyeball's own millimetres (uv), fibres, a darker ring at its edge, the pupil
    float r = length( vCrewUv ), an = atan( vCrewUv.y, vCrewUv.x );
    if ( r < 6.6 && vFace.w > 0.5 ) {
      float fib = cNoise3( vec3( an * 9.0, r * 1.6, 0.0 ) ) * 0.6 + cNoise3( vec3( an * 23.0, r * 3.1, 3.0 ) ) * 0.4;
      vec3 irisC = mix( vFace.rgb, uIris.rgb, uIris.w ) * ( 0.72 + 0.56 * fib ) * ( 1.0 + 0.25 * smoothstep( 3.6, 2.6, r ) );
      irisC *= mix( 1.0, 0.45, smoothstep( 4.9, 6.0, r ) );
      vec3 c = mix( irisC, vec3( 0.012 ), smoothstep( 2.15, 1.95, r ) );
      diffuseColor.rgb = mix( c, diffuseColor.rgb, smoothstep( 5.95, 6.45, r ) );
    }
  } else if ( vMax.y > 0.5 ) {
    diffuseColor.rgb *= uMan.x * mix( vec3( 1.0 ), vec3( 1.04, 0.97, 0.95 ), uMan.z ) * ( 1.0 - 0.4 * uMan.w );
    float kP = 1.0 - smoothstep( 0.12, 0.5, fw ), kS = 1.0 - smoothstep( 0.2, 0.9, fw );
    // pores and the fine grain of skin (not on the lips)
    float pores = cNoise3( q * 1.9 ) * 0.65 + cNoise3( q * 4.3 + 7.0 ) * 0.35;
    crewH += kP * ( 1.0 - vFace.w ) * 0.00006 * ( pores - 0.5 );
    crewH += kS * 0.00012 * ( cNoise3( q * 0.45 + 3.0 ) - 0.5 );
    // stubble: dark dots in the beard's zone, their average when a pixel covers many
    float st = smoothstep( 0.52, 0.78, cNoise3( q * 2.6 + 11.0 ) );
    diffuseColor.rgb *= 1.0 - vFace.x * uMan.y * mix( 0.05, 0.16 * st, kS );
    // brows: hairs streaked along the brow; cropped hair: a fine grain
    float br = cNoise3( vec3( q.x * 0.55, q.y * 3.4, q.z * 3.4 ) );
    diffuseColor.rgb *= 1.0 - vFace.y * 0.35 * mix( 0.5, br, kS );
    crewH += vFace.y * kS * 0.00012 * br;
    float hg = cNoise3( q * 3.2 + 5.0 );
    diffuseColor.rgb *= 1.0 + vFace.z * 0.3 * ( hg - 0.5 ) * kS;
    crewH += vFace.z * kS * 0.00008 * hg;
    // the lips: fine vertical lines
    crewH -= vFace.w * kP * 0.00005 * smoothstep( 0.6, 0.9, cNoise3( vec3( q.x * 2.4, q.y * 0.35, q.z * 0.35 ) ) );
  }
}`)
    .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace('float roughnessFactor = roughness;', 'float roughnessFactor = clamp( vSurf.x + crewRoughD, 0.03, 1.0 );'))
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
    .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = vec3( 0.0, 0.0, 1.0 );
	if ( vMax.x > -0.5 ) {
		vec4 tN = texture( tCrewN, vec3( vCrewUv * 0.5, floor( vMax.x + 0.5 ) ) );
		mapN.xy = tN.xy * 2.0 - 1.0;
		mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );
		crewCav = mix( 1.0, tN.b, vSurf.w );
	}`).replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vSurf.z;') + `
{
  // the skin's bump from crewH (the surface gradient, no tangents needed)
  vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition );
  float dhx = dFdx( crewH ), dhy = dFdy( crewH );
  vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
  float det = dot( dpx, r1 );
  if ( abs( det ) > 1e-12 ) normal = normalize( abs( det ) * normal - sign( det ) * ( dhx * r1 + dhy * r2 ) );
}`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
// the sheen by surface: wool and felt full, drill and canvas less, nothing else
{
  float sw = vMax.x < -0.5 ? 0.0 : vMax.x < 0.5 ? 1.0 : vMax.x < 1.5 ? 0.6 : vMax.x < 2.5 ? 0.45 : vMax.x < 3.5 ? 1.0 : 0.0;
  material.sheenColor *= sw * ( 0.5 + diffuseColor.rgb );
}
#endif`)
    .replace('#include <lights_physical_pars_fragment>', lightsPhys)
    .replace('#include <lights_fragment_begin>', lightsBegin)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vMax.z * crewCav;
reflectedLight.indirectSpecular *= mix( 1.0, vMax.z, 0.7 );`);
}

let mat = null, patcher = null;
const men = new Map(); // man id -> his material (the same program as the base: only uniforms differ)
function prep(m) {
  if (patcher) patcher(m, 'crew-max-fog', (sh) => maxPatch(sh, m));
  else { m.onBeforeCompile = (sh) => maxPatch(sh, m); m.customProgramCacheKey = () => 'crew-max'; }
  return m;
}
/** The max tier's material (created on first use); with a man ({ id, uMan, uIris }) his own instance of it. */
export function maxMaterial(textures = {}, man = null) {
  if (!mat) {
    mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, map: textures.map ?? null, normalMap: textures.normalMap ?? null, normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.9, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.2, 0.21, 0.19),
    });
    mat.name = 'crew-max';
    prep(mat);
  }
  if (!man || man.id == null) return mat;
  let m = men.get(man.id);
  if (!m) {
    m = mat.clone(); // (clone keeps neither onBeforeCompile nor the cache key: prep sets them again)
    m.name = `crew-max-${man.id}`;
    m.userData = { man: { uMan: new THREE.Vector4(...(man.uMan ?? [1, 1, 0, 0])), uIris: new THREE.Vector4(...(man.uIris ?? [0, 0, 0, 0])) } };
    men.set(man.id, prep(m));
  }
  return m;
}
/** In the game: pass shaderlib's patchMaterial (the fog's uniforms, then the max changes), for every instance. */
export function patchCrewMax(patchMaterial, textures) {
  const m = maxMaterial(textures);
  if (!patcher) {
    patcher = patchMaterial;
    prep(m);
    for (const x of men.values()) prep(x);
  }
  return m;
}

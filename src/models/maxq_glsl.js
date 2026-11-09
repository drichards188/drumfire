// GLSL for the max-quality gun materials (models/maxq.js): the chunks spliced into MeshStandardMaterial's shaders,
// the GPU micro-detail tiles and the ambient-occlusion field bake. Plain strings, no three.js import, so the module
// stays cheap to load. Everything here works without shaderlib.js (the hangar and the model viewer have none); the
// game page's extras (wetness) are read only under MQ_WORLD.
//
// Spaces: vMqP is the rest rig space (the rig's root frame with every pivot at rest: elevation 0, recoil 0, block shut,
// tray on), so the camouflage and the weathering run on across the parts and move with each one; vMqL / vMqLN are the
// mesh's own space (the micro-detail is glued to the part, struts and handwheels included).

export const HINTS = 32; // contact hints a rig may carry (uniform arrays)

// material kinds (defines MQ_<kind>) and their bit in a hint's material mask
export const KIND_BIT = { PAINT: 1, BLACK: 2, STEEL: 4, TYRE: 8, CHAR: 16, RUBBER: 32 };

// ---------------------------------------------------------------- shared noise (fragment)

const NOISE = /* glsl */ `
uvec3 mqPcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 mqH3(vec3 c) { return vec3(mqPcg3(uvec3(ivec3(c) + 65536))) * (1.0 / 4294967295.0); }
// three independent channels of quintic value noise, 0..1
vec3 mqN3(vec3 p) {
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 a = mqH3(i), b = mqH3(i + vec3(1.0, 0.0, 0.0)), c = mqH3(i + vec3(0.0, 1.0, 0.0)), d = mqH3(i + vec3(1.0, 1.0, 0.0));
  vec3 e = mqH3(i + vec3(0.0, 0.0, 1.0)), g = mqH3(i + vec3(1.0, 0.0, 1.0)), h = mqH3(i + vec3(0.0, 1.0, 1.0)), k = mqH3(i + vec3(1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
`;

// ---------------------------------------------------------------- material patch

export const vertPars = /* glsl */ `
attribute vec4 aP;
attribute vec3 aN;
attribute vec4 aEdge;
varying vec4 vMqP;
varying vec3 vMqN;
varying vec3 vMqL;
varying vec3 vMqLN;
varying vec4 vMqE;
`;

export const vertMain = /* glsl */ `
vMqP = aP;
vMqN = aN;
vMqL = position;
vMqLN = objectNormal;
vMqE = aEdge;
`;

export const fragPars = /* glsl */ `
varying vec4 vMqP;
varying vec3 vMqN;
varying vec3 vMqL;
varying vec3 vMqLN;
varying vec4 vMqE;
#ifndef USE_NORMALMAP_OBJECTSPACE
uniform mat3 normalMatrix;
#endif
uniform float uMqSeed;
uniform float uMqStyle;
uniform float uMqWear;
uniform float uMqSoot;
uniform float uMqHeat;
uniform float uMqTileK;
uniform float uMqDetail;
uniform float uMqDebug;
uniform vec3 uMqC0;
uniform vec3 uMqC1;
uniform vec3 uMqC2;
uniform vec3 uMqUnder;
uniform vec3 uMqPrimer;
uniform vec3 uMqBase;
uniform vec4 uMqSurf;
uniform vec3 uMqBandDir;
uniform vec4 uMqBore;
uniform vec4 uMqMuzzle;
uniform vec4 uMqAOMin;
uniform vec4 uMqAOInv;
uniform highp sampler3D uMqAO;
uniform sampler2D uMqTA;
uniform sampler2D uMqTB;
uniform vec4 uMqHA[${HINTS}];
uniform vec4 uMqHB[${HINTS}];
uniform vec4 uMqHC[${HINTS}];
uniform int uMqHN;
${NOISE}
// a field x crossing threshold t as a sprayed edge: about MQ_FEATHER metres wide on the surface at any distance,
// never sharper than a pixel (foot: metres a pixel)
// The width comes from the smooth field alone; sp (the overspray speckle) only moves the edge within it.
float mqSoft(float x, float sp, float t, float foot, float feather) {
  float g = length(vec2(dFdx(x), dFdy(x)));
  float w = g * max(0.7, feather / foot) + 1e-5;
  return smoothstep(t - w, t + w, x + sp * min(1.0, w * 12.0));
}
// steps of a layered value with a pixel's antialiasing
float mqStep(float t, float x, float fw) { return smoothstep(t - fw, t + fw, x); }
// (the screen derivatives are scaled to unit size first, which leaves the result as it was: det and grad both scale by
// k * k. On a sliver triangle a fraction of a pixel wide a quad's helper lanes extrapolate far past it, these
// derivatives can reach 1e20, det overflowed to infinity and abs(det) * n - grad to NaN, and one NaN pixel blacked
// out the whole view through the bloom's mip chain. Derivatives past all use leave the normal unbumped.)
vec3 mqBumpN(vec3 surfPos, vec3 n, vec2 dH) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  float k = max(max(length(sx), length(sy)), 1e-20);
  if (!(k < 1e15) || !(abs(dH.x) + abs(dH.y) < 1e15)) return n;
  sx /= k; sy /= k; dH /= k;
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 b = abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2);
  float l = dot(b, b);
  return l > 1e-24 && l < 1e30 ? b * inversesqrt(l) : n;
}
`;

// Replaces #include <map_fragment>: the whole surface (albedo, roughness, metalness, wear and weathering) from rest
// space, the AO field and the micro-detail tiles. Leaves mqRough / mqMetal for the roughness and metalness chunks,
// the tile samples and the bump height for the normal stage, mqAO for the lighting.
export const fragSurface = /* glsl */ `
vec3 mqP = vMqP.xyz;
vec3 mqNR = normalize(vMqN);
vec3 mqWN = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
float mqFoot = max(0.5 * (length(dFdx(mqP)) + length(dFdy(mqP))), 1e-5);
// ---- ambient occlusion from the baked field (rest space), and the share of open sky above
float mqAO = 1.0, mqSky = clamp(mqNR.y * 0.5 + 0.5, 0.0, 1.0);
if (uMqAOMin.w > 0.5) {
  vec2 aov = texture(uMqAO, (mqP + mqNR * uMqAOInv.w - uMqAOMin.xyz) * uMqAOInv.xyz).rg;
  mqAO = clamp(aov.r * 2.0, 0.0, 1.0);
  mqSky = clamp(aov.g * 1.15, 0.0, 1.0);
}
// low parts that do not face up are in the ground's shade (the bake has no ground)
mqAO *= mix(0.62, 1.0, clamp(smoothstep(0.0, 0.4, mqP.y) + step(0.35, mqNR.y), 0.0, 1.0));
// ---- micro-detail tiles, triplanar in the part's own space
vec3 mqLN = normalize(vMqLN);
vec3 mqBW = pow(abs(mqLN), vec3(4.0));
mqBW /= dot(mqBW, vec3(1.0));
vec3 mqSg = step(0.0, mqLN) * 2.0 - 1.0;
vec2 mqUX = vMqL.zy * uMqTileK, mqUY = vMqL.xz * uMqTileK, mqUZ = vMqL.xy * uMqTileK;
mqUX.x *= mqSg.x; mqUY.x *= mqSg.y; mqUZ.x *= -mqSg.z;
vec4 mqAX = texture(uMqTA, mqUX), mqAY = texture(uMqTA, mqUY), mqAZ = texture(uMqTA, mqUZ);
vec4 mqTa = mqAX * mqBW.x + mqAY * mqBW.y + mqAZ * mqBW.z;
vec4 mqTb = texture(uMqTB, mqUX * 0.5 + 0.31) * mqBW.x + texture(uMqTB, mqUY * 0.5 + 0.57) * mqBW.y + texture(uMqTB, mqUZ * 0.5 + 0.13) * mqBW.z;
// ---- contact hints: hands, boots and slides polish; oil films; soot
float mqGrip = 0.0, mqBoot = 0.0, mqSlide = 0.0, mqOil = 0.0, mqSootH = 0.0;
for (int i = 0; i < ${HINTS}; i++) {
  if (i >= uMqHN) break;
  vec4 hA = uMqHA[i], hB = uMqHB[i], hC = uMqHC[i];
  if ((int(hC.z) & MQ_BIT) == 0) continue;
  vec3 ab = hB.xyz - hA.xyz;
  float l2 = dot(ab, ab);
  float t = l2 > 1e-8 ? clamp(dot(mqP - hA.xyz, ab) / l2, 0.0, 1.0) : 0.0;
  float dist = length(mqP - hA.xyz - ab * t);
  float w = (1.0 - smoothstep(hA.w * 0.4, hA.w, dist)) * hC.x * smoothstep(hC.y - 0.15, hC.y, mqNR.y);
  int kk = int(hB.w + 0.5);
  if (kk == 0) mqGrip = max(mqGrip, w);
  else if (kk == 1) mqBoot = max(mqBoot, w);
  else if (kk == 2) mqSlide = max(mqSlide, w);
  else if (kk == 3) mqOil = max(mqOil, w);
  else mqSootH = max(mqSootH, w);
}
float mqTouch = max(mqGrip, max(mqBoot * (0.55 + 0.45 * smoothstep(0.25, 0.75, mqTb.r)), mqSlide));
// ---- the low-frequency fields (rest space, seeded per gun): the paint's patches and the weathering's patchiness
vec3 mqPs = mqP + uMqSeed * vec3(17.13, 3.31, 29.71);
vec3 mqWarp = mqN3(mqPs * 0.55 + 1.3) - 0.5;
vec3 mqQ = mqPs + mqWarp * 0.45;
vec3 mqF = mqN3(mqQ * 0.85) * 0.6 + mqN3(mqQ * 2.1 + 7.7) * 0.28 + mqN3(mqQ * 4.9 + 3.1) * 0.12;
// ---- the layered surface
vec3 mqAlb = uMqBase;
float mqRough = uMqSurf.x, mqMetal = uMqSurf.y, mqDK = 1.0, mqH = 1.0;
float mqEdgeD = max(0.0, min(min(vMqE.x, vMqE.y), min(vMqE.z, vMqE.w)));
float mqExpo = 0.65 + 0.45 * smoothstep(0.3, 0.9, mqNR.y);
float mqCav = 1.0 - mqAO;
#if defined(MQ_PAINT) || defined(MQ_BLACK)
  #if defined(MQ_PAINT)
  {
    float sp = (mqTb.g - 0.5) * 0.07;
    if (uMqStyle < 0.5) { // sprayed patches (the late war's olive, sand and brown)
      float ka = mqSoft(mqF.x, sp, 0.555, mqFoot, 0.028);
      float kb = mqSoft(mqF.y, sp * 0.8, 0.585, mqFoot, 0.022);
      mqAlb = mix(mix(uMqC0, uMqC1, ka), uMqC2, kb * (1.0 - ka * 0.65));
    } else if (uMqStyle < 1.5) { // sprayed bands round the gun (Dunkelgelb with olive and red-brown)
      float s = dot(mqQ, uMqBandDir) / 0.95 + (mqF.z - 0.5) * 1.6 + (mqF.x - 0.5) * 0.5;
      float q = abs(fract(s) - 0.5);
      float ko = mqSoft(q, sp, 0.37, mqFoot, 0.03);
      float kr = 1.0 - mqSoft(q, -sp, 0.12, mqFoot, 0.03);
      mqAlb = mix(mix(uMqC0, uMqC1, ko), uMqC2, kr);
    } else { // one colour, touched up in places
      float kt = mqSoft(mqF.y, 0.0, 0.62, mqFoot, 0.01);
      mqAlb = mix(uMqC0, uMqC1, kt * 0.8);
    }
    // the spray's mottle, the orange peel's sheen, and the sun's fading on what faces up
    mqAlb *= 1.0 + (mqF.z - 0.5) * 0.16 + (mqTa.b - 0.5) * 0.05;
    float fade = smoothstep(0.2, 0.9, mqNR.y) * 0.13;
    float lum = dot(mqAlb, vec3(0.2126, 0.7152, 0.0722));
    mqAlb = mix(mqAlb, vec3(lum) * 1.25 + mqAlb * 0.15, fade);
    mqRough = clamp(uMqSurf.x + (mqTa.b - 0.5) * 0.22 + (mqF.z - 0.5) * 0.1, 0.4, 1.0);
  }
  #else
  mqAlb = uMqBase * (1.0 + (mqF.z - 0.5) * 0.2);
  mqRough = clamp(uMqSurf.x + (mqTa.b - 0.5) * 0.18, 0.3, 0.9);
  #endif
  // edge wear: chips through the coats on convex edges and where hands, boots and slides rub, kept out of hollows.
  // Along an edge the reach comes and goes (a 10 cm field), so the wear breaks into chips and clean stretches.
  {
    float along = mqN3(mqPs * 8.5 + 4.1).x;
    float reach = (0.0025 + 0.026 * uMqWear * (mqExpo + mqTouch * 1.4)) * smoothstep(0.32, 0.78, along * 0.75 + mqF.y * 0.5);
    float chip = clamp((mqTb.r - 0.5) * 2.4 + 0.5, 0.0, 1.0);
    float depth = clamp((reach - mqEdgeD) / max(reach, 1e-4) * 1.2 + (chip - 0.5) * 1.35 - 0.12, 0.0, 1.0);
    // hands and slides rub through to the steel; boots scuff the top coat and, in the middle of the path, the primer
    depth = max(depth, max(mqGrip, mqSlide) * smoothstep(0.2, 0.6, chip * 0.5 + max(mqGrip, mqSlide) * 0.6));
    depth = max(depth, mqBoot * smoothstep(0.35, 0.8, chip * 0.6 + mqBoot * 0.45) * 0.62);
    depth *= smoothstep(0.25, 0.7, mqAO + mqTouch * 0.4);
    float fw = fwidth(depth) * 0.75 + 1e-4;
    float l1 = mqStep(0.36, depth, fw), l2 = mqStep(0.58, depth, fw), l3 = mqStep(0.78, depth, fw);
    #if defined(MQ_PAINT)
    vec3 under = uMqUnder * (1.0 + (chip - 0.5) * 0.2);
    #else
    vec3 under = uMqPrimer;
    l1 = l2;
    #endif
    // where hands polish, the paint goes straight to dark steel (no red primer on a handwheel's rim)
    vec3 steel = vec3(0.27, 0.265, 0.255) * (0.85 + 0.3 * mqTb.g);
    float rubbed = max(mqGrip, mqSlide);
    vec3 a = mix(mqAlb, under, l1 * (1.0 - rubbed));
    a = mix(a, mix(uMqPrimer * (0.9 + 0.2 * chip), steel * 0.7, rubbed), l2);
    // a thin dark line round each chip: the coat's broken edge
    float rim = (l1 - l2) * (1.0 - smoothstep(0.36, 0.5, depth)) + (l2 - l3) * (1.0 - smoothstep(0.58, 0.68, depth));
    a *= 1.0 - 0.2 * clamp(rim, 0.0, 1.0);
    // bare steel: polished where it is handled, rusty at the rim of old chips that nobody touches
    float rust = (1.0 - rubbed) * smoothstep(0.78, 0.86, depth) * (1.0 - smoothstep(0.86, 0.97, depth));
    vec3 bare = mix(steel * mix(1.0, 1.18, rubbed), vec3(0.2, 0.09, 0.04), rust * 0.75);
    mqAlb = mix(a, bare, l3);
    mqRough = mix(mqRough, mix(0.46, 0.3, rubbed), l3);
    mqRough = mix(mqRough, 0.88, rust * l3);
    mqMetal = mix(mqMetal, 1.0 - rust * 0.7, l3);
    mqDK = mix(1.0, 0.45, l3);
    mqH = 1.0 - (l1 * 0.3 + l2 * 0.3 + l3 * 0.4);
    // boots bring the field in with them: trodden dirt on the walkways
    float trod = mqBoot * smoothstep(0.35, 0.8, mqTb.a * 0.6 + mqF.x * 0.6);
    mqAlb = mix(mqAlb, vec3(0.085, 0.068, 0.048), trod * 0.55);
    mqRough = mix(mqRough, 0.95, trod * 0.6);
    mqMetal *= 1.0 - trod * 0.6;
  }
  // grime in the hollows
  mqAlb *= mix(0.72, 1.0, smoothstep(0.15, 0.8, mqAO));
#elif defined(MQ_STEEL)
  {
    // machined and bare steel: a darker oiled film where nobody rubs, bright where the slides and hands polish it
    mqAlb = uMqBase * (0.8 + 0.4 * mqTa.b) * (1.0 + (mqF.z - 0.5) * 0.25);
    mqRough = clamp(uMqSurf.x + (mqTa.b - 0.5) * 0.25 + (mqF.y - 0.5) * 0.12, 0.12, 0.8);
    mqAlb = mix(mqAlb, uMqBase * 1.3, mqTouch);
    mqRough = mix(mqRough, 0.24, mqTouch);
    mqAlb *= mix(0.6, 1.0, smoothstep(0.15, 0.8, mqAO));
    mqDK = 0.8;
    // tarnish and old rust in what nobody touches and the rain reaches
    float tarn = (1.0 - mqTouch) * smoothstep(0.5, 0.95, mqF.x + mqCav * 0.5) * 0.7;
    mqAlb = mix(mqAlb, vec3(0.13, 0.08, 0.05), tarn * 0.6);
    mqRough = mix(mqRough, 0.75, tarn);
    mqMetal = mix(uMqSurf.y, 0.4, tarn);
  }
#elif defined(MQ_TYRE) || defined(MQ_RUBBER)
  {
    // solid rubber: crazed and bloomed grey where the weather reaches it, black in the grooves
    float bloom = smoothstep(0.2, 0.9, mqSky) * (0.45 + 0.55 * mqF.x);
    mqAlb = mix(uMqBase, vec3(0.032, 0.031, 0.029), bloom * 0.75) * (0.85 + 0.3 * mqTa.b);
    mqRough = clamp(uMqSurf.x + (mqTa.b - 0.5) * 0.15 - bloom * 0.05, 0.6, 1.0);
    mqDK = 1.0;
  }
#elif defined(MQ_CHAR)
  mqAlb = uMqBase * (0.8 + 0.4 * mqTa.b);
  mqRough = uMqSurf.x;
  mqDK = 0.6;
#endif
// ---- the bore: soot over the rifling, darker the deeper it goes
#if defined(MQ_BLACK) || defined(MQ_CHAR)
{
  vec2 rd = mqP.xy - uMqBore.xy;
  float rr = length(rd);
  if (rr < uMqBore.z + 0.004 && dot(mqNR.xy, rd) < -0.5 * rr) {
    float deep = clamp((mqP.z - uMqMuzzle.z) / 0.6, 0.0, 1.0);
    float ang = atan(rd.y, rd.x) / 6.2831853;
    float ph = (ang - (mqP.z - uMqMuzzle.z) / 5.9) * 64.0;
    // lands and grooves, faded to their average where 64 of them shrink under a pixel (else they alias into rings)
    float fp = fwidth(ph);
    float land = mix(smoothstep(0.32 - fp, 0.4 + fp, abs(fract(ph) - 0.5)), 0.45, smoothstep(0.25, 0.7, fp));
    mqAlb = mix(vec3(0.03, 0.028, 0.026), vec3(0.075, 0.072, 0.068), land) * (1.0 - 0.75 * deep);
    mqRough = mix(0.62, 0.42, land);
    mqMetal = mix(0.08, 0.22, land) * (1.0 - deep);
    mqDK = 0.3;
    mqH = land;
    mqAO = min(mqAO, 1.0 - 0.85 * deep);
  }
}
#endif
vec3 mqDbgW = vec3(0.0);
// ---- weathering by place: muzzle soot, oil, dust settled on what faces up, mud thrown up from the ground
{
  // soot blown back over the muzzle, heaviest on top, and the burnt paint on the muzzle face
  float bz = mqP.z - uMqMuzzle.z;
  float onBarrel = step(abs(mqP.x - uMqBore.x), 0.6) * step(abs(mqP.y - uMqBore.y), 0.6);
  float soot = uMqSoot * onBarrel * exp(-max(0.0, bz) / 0.45) * (0.55 + 0.45 * max(mqNR.y, 0.0)) * (0.65 + 0.7 * mqF.z);
  soot = max(soot, mqSootH * mqSootH * uMqSoot * smoothstep(0.2, 0.7, mqF.z * 0.7 + mqTb.b * 0.45));
  soot = clamp(soot * (0.8 + 0.4 * mqTb.b), 0.0, 1.0);
  mqAlb = mix(mqAlb, vec3(0.022, 0.02, 0.018), soot * 0.92);
  mqRough = mix(mqRough, 0.78, soot);
  mqMetal *= 1.0 - soot;
  // oil: a dark satin film in patches at the glands, the trunnions and the breech
  float oil = mqOil * mqOil * (0.3 + 0.7 * smoothstep(0.35, 0.75, mqF.x * 0.6 + mqTb.b * 0.5));
  mqAlb *= 1.0 - 0.38 * oil;
  mqRough = mix(mqRough, 0.3, oil * 0.8);
  // dust settles in patches on what faces up now and in the corners under the open sky
  float dust = smoothstep(0.45, 0.95, mqWN.y) * (0.3 + 0.7 * mqSky) * smoothstep(0.25, 0.85, mqF.x * 0.8 + mqTa.a * 0.4) * (1.0 - mqTouch);
  dust += mqCav * 0.3 * mqTa.a * mqSky;
  dust = clamp(dust * 0.42 * uMqSurf.z, 0.0, 0.6);
  mqAlb = mix(mqAlb, vec3(0.31, 0.27, 0.2), dust);
  mqDbgW = vec3(oil, dust, 0.0);
  mqRough = mix(mqRough, 1.0, dust * 0.85);
  mqMetal *= 1.0 - dust;
  // mud thrown up from the ground: a ragged line, splashes above it, caked in the hollows
  float mh = mqP.y + (mqF.y - 0.5) * 0.5 + (mqTb.b - 0.5) * 0.12;
  float mud = (1.0 - smoothstep(0.12, 0.62, mh)) * (0.55 + 0.6 * mqF.x);
  mud += smoothstep(0.62, 0.86, mqTb.a) * (1.0 - smoothstep(0.2, 1.0, mqP.y)) * 0.8;
  mud = clamp(mud * uMqSurf.w * (1.0 - 0.6 * mqTouch), 0.0, 1.0);
  vec3 mudC = mix(vec3(0.05, 0.036, 0.022), vec3(0.11, 0.085, 0.058), smoothstep(0.3, 0.8, mqF.z));
  float wetM = 0.0;
#ifdef MQ_WORLD
  wetM = uWetness;
#endif
  mqAlb = mix(mqAlb, mudC * (1.0 - 0.3 * wetM), mud);
  mqRough = mix(mqRough, mix(0.95, 0.35, wetM), mud);
  mqMetal *= 1.0 - mud;
  mqDK = mix(mqDK, 0.7, mud);
  mqDbgW.z = mud;
}
// debug views (uMqDebug): 1 the AO field, 2 the distance to the nearest edge (white at 5 cm), 3 the hints (grip red,
// boots and slides green, oil blue), 4 the open sky
if (uMqDebug > 0.5) {
  if (uMqDebug < 1.5) mqAlb = vec3(mqAO);
  else if (uMqDebug < 2.5) mqAlb = vec3(clamp(mqEdgeD / 0.05, 0.0, 1.0));
  else if (uMqDebug < 3.5) mqAlb = vec3(mqGrip, max(mqBoot, mqSlide), mqOil);
  else if (uMqDebug < 4.5) mqAlb = vec3(mqSky);
  else if (uMqDebug < 5.5) mqAlb = mqTa.rgb;
  else if (uMqDebug < 6.5) mqAlb = mqTb.rgb;
  else mqAlb = mqDbgW;
  mqRough = 1.0; mqMetal = 0.0; mqDK = 0.0; mqH = 1.0;
}
diffuseColor.rgb *= mqAlb;
`;

// Replaces #include <normal_fragment_maps>: the triplanar micro-detail in the part's own space (whiteout blend),
// the coats' broken edges, then the specular antialiasing for the detailed normal.
export const fragNormal = /* glsl */ `
{
  vec2 nx = mqAX.xy * 2.0 - 1.0, ny = mqAY.xy * 2.0 - 1.0, nz = mqAZ.xy * 2.0 - 1.0;
  float k = uMqDetail * mqDK;
  nx *= k; ny *= k; nz *= k;
  nx.x *= mqSg.x; ny.x *= mqSg.y; nz.x *= -mqSg.z;
  vec3 tx = vec3(nx + mqLN.zy, sqrt(max(0.0, 1.0 - dot(nx, nx))) * mqLN.x);
  vec3 ty = vec3(ny + mqLN.xz, sqrt(max(0.0, 1.0 - dot(ny, ny))) * mqLN.y);
  vec3 tz = vec3(nz + mqLN.xy, sqrt(max(0.0, 1.0 - dot(nz, nz))) * mqLN.z);
  vec3 nl = normalize(tx.zyx * mqBW.x + ty.xzy * mqBW.y + tz.xyz * mqBW.z);
  normal = normalize(normalMatrix * nl);
  // the coats' thickness at a chip's edge (a fraction of a millimetre, seen as a fine line close up)
  vec2 dH = vec2(dFdx(mqH), dFdy(mqH)) * 0.00035;
  normal = mqBumpN(-vViewPosition, normal, dH);
  vec3 dn = fwidth(normal);
  float dn2 = dot(dn, dn); // (a helper lane's normal can be far off on a sliver: no NaN into the roughness)
  roughnessFactor = sqrt(clamp(roughnessFactor * roughnessFactor + (dn2 < 0.1 ? 2.0 * dn2 : 0.2), 0.0, 1.0));
}
`;

// After #include <aomap_fragment>: the baked occlusion on the ambient and reflected light (the bore and the gaps go
// dark), and a little on the sun where the shadow map is too coarse for the crevices.
export const fragAO = /* glsl */ `
{
  reflectedLight.indirectDiffuse *= mqAO;
  float nv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(nv, mqAO, material.roughness);
  float micro = mix(1.0, mqAO, 0.35);
  reflectedLight.directDiffuse *= micro;
  reflectedLight.directSpecular *= micro;
}
`;

// ---------------------------------------------------------------- GPU tiles

export const tileVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Periodic noise for tiles that wrap: lattice cells taken modulo the period.
const TILE_NOISE = /* glsl */ `
uvec3 tPcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float tHash(vec2 c, float per, float s) { c = mod(c, per); return float(tPcg(uvec3(uvec2(c), uint(s))).x) * (1.0 / 4294967295.0); }
vec2 tHash2(vec2 c, float per, float s) { c = mod(c, per); uvec3 h = tPcg(uvec3(uvec2(c), uint(s))); return vec2(h.xy) * (1.0 / 4294967295.0); }
// gradient noise on a lattice of per x per cells over the tile (uv 0..1), 0..1: value noise would show its square
// lattice in the derivatives the normal is made of (a fine cross-hatch at a metre or two)
vec2 tGrad(vec2 c, vec2 per, float s) { c = mod(c, per); float a = float(tPcg(uvec3(uvec2(c), uint(s))).x) * (6.2831853 / 4294967295.0); return vec2(cos(a), sin(a)); }
float tPerlin2(vec2 uv, vec2 per, float s) {
  vec2 p = uv * per, i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(tGrad(i, per, s), f), b = dot(tGrad(i + vec2(1.0, 0.0), per, s), f - vec2(1.0, 0.0));
  float c = dot(tGrad(i + vec2(0.0, 1.0), per, s), f - vec2(0.0, 1.0)), d = dot(tGrad(i + vec2(1.0), per, s), f - vec2(1.0));
  return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.75 + 0.5, 0.0, 1.0);
}
float tNoise(vec2 uv, float per, float s) { return tPerlin2(uv, vec2(per), s); }
// anisotropic: px cells across u, py along v
float tNoiseA(vec2 uv, float px, float py, float s) { return tPerlin2(uv, vec2(px, py), s); }
float tFbm(vec2 uv, float per, int oct, float s) {
  float v = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * tNoise(uv + float(i) * vec2(0.37, 0.61), per, s + float(i) * 13.0);
    n += a; a *= 0.5; per *= 2.0;
  }
  return v / n;
}
// cellular: distance to the nearest of one jittered point per cell (F1) and the second nearest (F2)
vec2 tWorley(vec2 uv, float per, float s) {
  vec2 p = uv * per, i = floor(p), f = p - i;
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 q = o + tHash2(i + o, per, s) - f;
    float d = dot(q, q);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}
`;

// The tiles' height per kind (pass 1, a float target): TILE_PAINT, TILE_STEEL, TILE_RUBBER.
export const tileHeightFrag = /* glsl */ `
varying vec2 vUv;
${TILE_NOISE}
float height(vec2 uv) {
#if defined(TILE_PAINT)
  // orange peel (2 to 3 mm), the spray's runs, faint mill-scale streaks of the rolled plate under the paint, grit
  float peel = tFbm(uv, 180.0, 3, 1.0);
  float runs = tNoiseA(uv, 60.0, 6.0, 7.0);
  float mill = tNoiseA(uv, 3.0, 90.0, 11.0);
  vec2 w = tWorley(uv, 140.0, 19.0);
  float grit = 1.0 - smoothstep(0.0, 0.18, w.x);
  return peel * 0.55 + runs * 0.18 + mill * 0.12 + grit * 0.35;
#elif defined(TILE_STEEL)
  // machining marks along u, fine scratches at angles, a few pits
  float marks = tNoiseA(uv, 2.0, 220.0, 3.0) * 0.5 + tNoiseA(uv, 4.0, 330.0, 5.0) * 0.3;
  float scr = 0.0;
  for (int k = 0; k < 3; k++) {
    float a = 0.35 + float(k) * 0.9;
    vec2 r = vec2(cos(a) * uv.x - sin(a) * uv.y, sin(a) * uv.x + cos(a) * uv.y);
    scr += smoothstep(0.93, 1.0, tNoiseA(r, 3.0, 300.0, 23.0 + float(k))) * 0.4;
  }
  vec2 w = tWorley(uv, 90.0, 29.0);
  float pit = 1.0 - smoothstep(0.0, 0.12, w.x);
  return marks * 0.4 + scr - pit * 0.6;
#elif defined(TILE_RUBBER)
  // crazing (the cracks of old rubber) over a fine mould grain
  vec2 w = tWorley(uv, 70.0, 31.0);
  float craze = smoothstep(0.0, 0.06, w.y - w.x);
  float grain = tFbm(uv, 220.0, 2, 37.0);
  return craze * 0.6 + grain * 0.25;
#else
  return 0.0;
#endif
}
void main() { gl_FragColor = vec4(height(vUv), 0.0, 0.0, 1.0); }
`;

// Pass 2: rg the tangent normal from the height's neighbours (the tile wraps), b roughness modulation, a cavity.
export const tileNormalFrag = /* glsl */ `
uniform sampler2D uH;
uniform float uTexel;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float e = uTexel;
  float hc = texture(uH, vUv).r;
  float hx = texture(uH, vUv + vec2(e, 0.0)).r - texture(uH, vUv - vec2(e, 0.0)).r;
  float hy = texture(uH, vUv + vec2(0.0, e)).r - texture(uH, vUv - vec2(0.0, e)).r;
  vec2 g = vec2(hx, hy) * 0.5 * uStrength;
  vec3 n = normalize(vec3(-g, 1.0));
  float avg = (texture(uH, vUv + vec2(3.0 * e, 0.0)).r + texture(uH, vUv - vec2(3.0 * e, 0.0)).r + texture(uH, vUv + vec2(0.0, 3.0 * e)).r + texture(uH, vUv - vec2(0.0, 3.0 * e)).r) * 0.25;
  float rough = clamp(0.5 + (hc - 0.45) * 0.9, 0.0, 1.0);
  float cav = clamp(0.5 + (avg - hc) * 4.0, 0.0, 1.0);
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, rough, cav);
}
`;

// The noise channels (one pass): r chip shapes (1 to 3 cm), g speckle (4 mm), b streaks (narrow across u, long
// along v), a splash spots.
export const tileNoiseFrag = /* glsl */ `
varying vec2 vUv;
${TILE_NOISE}
void main() {
  vec2 uv = vUv;
  float chip = tFbm(uv, 36.0, 4, 41.0);
  float speck = tNoise(uv, 128.0, 43.0) * 0.6 + tNoise(uv, 256.0, 47.0) * 0.4;
  float streak = tNoiseA(uv, 90.0, 3.0, 53.0) * 0.65 + tNoiseA(uv, 180.0, 6.0, 59.0) * 0.35;
  vec2 w = tWorley(uv, 26.0, 61.0);
  vec2 w2 = tWorley(uv, 70.0, 67.0);
  float spots = max(1.0 - smoothstep(0.08, 0.4, w.x), (1.0 - smoothstep(0.05, 0.3, w2.x)) * 0.8);
  gl_FragColor = vec4(chip, speck, streak, spots);
}
`;

// ---------------------------------------------------------------- AO field bake

// Depth along a direction in rest space: the rig's rest positions (aP) through an orthographic frame (uX, uY across,
// looking along -uZ from the plane uC + uZ * uR). The stored value s is the distance from that plane, 0..2R.
export const aoDepthVert = /* glsl */ `
attribute vec4 aP;
uniform vec3 uC;
uniform vec3 uX;
uniform vec3 uY;
uniform vec3 uZ;
uniform float uR;
varying float vS;
void main() {
  vec3 d = aP.xyz - uC;
  float s = uR - dot(d, uZ);
  vS = s;
  gl_Position = vec4(dot(d, uX) / uR, dot(d, uY) / uR, s / uR - 1.0, 1.0);
}
`;
export const aoDepthFrag = /* glsl */ `
varying float vS;
void main() { gl_FragColor = vec4(vS, 0.0, 0.0, 1.0); }
`;

// One z slice of the field: every voxel looks along the batch's directions and counts the ones open to the sky
// (R: over the whole sphere, so an open point beside a flat face scores 0.5; G: weighted by how much a direction
// points up). Added into the slice (the batches accumulate).
export const aoAccumFrag = /* glsl */ `
uniform highp sampler2DArray uDepth;
uniform vec3 uMin;
uniform float uCell;
uniform float uSlice;
uniform vec3 uC;
uniform float uR;
uniform float uBias;
uniform vec3 uDX[16];
uniform vec3 uDY[16];
uniform vec3 uDZ[16];
uniform vec2 uW[16];
uniform int uN;
void main() {
  vec3 P = uMin + vec3(gl_FragCoord.xy, uSlice + 0.5) * uCell;
  vec3 d = P - uC;
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec2 uv = vec2(dot(d, uDX[i]), dot(d, uDY[i])) / uR * 0.5 + 0.5;
    float s = uR - dot(d, uDZ[i]);
    float m = texture(uDepth, vec3(uv, float(i))).r;
    acc += (s < m - uBias ? 1.0 : 0.0) * uW[i];
  }
  gl_FragColor = vec4(acc, 0.0, 1.0);
}
`;
export const quadVert = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

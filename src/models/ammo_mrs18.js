import * as THREE from 'three';
import { chainPatch } from './kit.js';
import { chamferBox, tubeAlong, mergeHD } from './hdkit.js';
import * as TX from './ammo_tex.js';

// The 21 cm Mörser 18's ammunition at maximum quality, for the basic training's lent battery only (shots/maxq/PLAN.md,
// hero only; research and sources in shots/maxq/research/mrs18-ammunition.md and refs/ammo_de/README.md). Nothing here
// runs at import and nothing outside the hero path calls it: buildShell, buildCartridge and every other gun are as before.
//
//   gr18Prop / buildGr18       the 21 cm Gr 18 to G.R. 295a (13 B 1606), 0.873 m with its fuze AZ 23 umg, whose setting
//                              head turns on its own node between the OV and MV marks; LODs 'hd' (0.4 m), 'lod', 'flight'
//   case6351                   the cartridge case 6351 (TM 9-1985-3 p. 523): rim, straight taper, the C/12 nA primer; with
//                              the leatherboard cup and label and the six bags (each its own node), or spent
//   canister                   the sheet-steel charge container with its hinged clamp lid (setOpen)
//   basket                     the wicker basket a shell travels in (one to a basket: TM p. 523)
//   buildReadyAmmo             the ready rounds at a hero gun: Gr 18 on baulks and battens under a half-drawn tarpaulin,
//                              empty baskets aside, the charge containers at the charge point, one open
//   ammoMaterials              every material, made once (before the shader warm-up); patchAmmoFog(patchMaterial) gives
//                              them the scene's fog in the game
//   prebuildAmmo(Async)        everything built ahead (Async: the atlases drawn in a worker while the page loads)
//
// Conventions as models/shells.js: shells and cases along Z, nose (mouth) toward -Z, centred on their middle, metres;
// the containers, baskets and the ready group stand on y = 0. Geometry is Node-safe; the textures need a canvas
// (ammo_tex.js) and fall back to plain colours without one. Estimates (where the sources are silent) are marked so.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the lathe

/**
 * A surface of revolution about Z from runs of [s, r] points (s along the axis from the base, r the radius): position
 * (r cos phi, r sin phi, zc - s) with phi = phi0 - TAU u, so u = 0.25 is +Y (up) and text drawn left to right on a
 * canvas reads correctly from outside. Within a run the normals are smooth; between runs they are smooth unless the next
 * run is `hard` (every run has its own vertices, so its UVs may differ). Listed from the base toward the nose the faces
 * look out; listed backwards they look in (an inner wall). run.uv(s, r, u) -> [U, V]; run.mod(s, r, u) -> r (a radial
 * relief, then the normals are recomputed when opts.relief is set).
 */
export function lathe(runs, { seg = 64, zc = 0, phi0 = Math.PI, relief = false } = {}) {
  const pos = [], nrm = [], uv = [], idx = [];
  const tan = (k, i) => {
    const P = runs[k].pts;
    let a = P[i - 1], b = P[i + 1];
    if (!a && k > 0 && !runs[k].hard) { const Q = runs[k - 1].pts; a = Q[Q.length - 2]; }
    if (!b && k < runs.length - 1 && !runs[k + 1].hard) { const Q = runs[k + 1].pts; b = Q[1]; }
    a ??= P[i]; b ??= P[i];
    let ds = b[0] - a[0], dr = b[1] - a[1];
    const l = Math.hypot(ds, dr) || 1;
    return [ds / l, dr / l];
  };
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k], P = run.pts, base = pos.length / 3;
    for (let i = 0; i < P.length; i++) {
      const [s, r] = P[i], [ds, dr] = tan(k, i);
      for (let j = 0; j <= seg; j++) {
        const u = j / seg, phi = phi0 - TAU * u, c = Math.cos(phi), sn = Math.sin(phi), rr = run.mod ? run.mod(s, r, u) : r;
        pos.push(rr * c, rr * sn, zc - s);
        nrm.push(ds * c, ds * sn, dr);
        const t = run.uv ? run.uv(s, r, u, c, sn) : [u, 0];
        uv.push(t[0], t[1]);
      }
    }
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (relief) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const R = (pts, o = {}) => ({ pts, ...o }); // a run
const hard = (pts, o = {}) => ({ pts, hard: true, ...o });
// a quadratic Bezier corner from a through the corner c to b, n points (a fillet that meets both lines tangentially)
const fillet = (a, c, b, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, m = 1 - t; return [m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]; });
const line = (a, b, n = 1) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);

// ---------------------------------------------------------------- materials

// The ammunition's own small patch (kit chainPatch, a unique key each): the paint, brass and cloth vary a little in tone
// and roughness by object-space noise seeded per instance (the stack's shells, cases and containers are drawn instanced
// from one texture: without it every one would carry the same cloud of tarnish). Inserted after the roughness map, so
// shaderlib's fog, flare loop and wetness chunks stay as they are.
const AM_NOISE = /* glsl */ `
float amH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float amN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(amH(i), amH(i + vec3(1, 0, 0)), f.x), mix(amH(i + vec3(0, 1, 0)), amH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(amH(i + vec3(0, 0, 1)), amH(i + vec3(1, 0, 1)), f.x), mix(amH(i + vec3(0, 1, 1)), amH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
function grime(m, key, { f1 = 9, f2 = 40, tone = 0.05, rough = 0.06 } = {}) {
  chainPatch(m, 'ammo-' + key, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAmP;\nvarying vec3 vAmS;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vAmP = position;
#ifdef USE_INSTANCING
vAmS = fract(instanceMatrix[3].xyz * vec3(3.17, 5.31, 7.13));
#else
vAmS = vec3(0.21, 0.57, 0.83);
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAmP;\nvarying vec3 vAmS;\n' + AM_NOISE)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float amA = amN(vAmP * ${f1.toFixed(2)} + vAmS * 37.0), amB = amN(vAmP * ${f2.toFixed(2)} + vAmS * 11.0), amW = 1.0;
#if defined(USE_FOG) && !defined(SKIP_WET)
  amW = 1.0 - uWetness; // (shaderlib's wet block ran just before: rain evens the variation out instead of undoing the gloss)
#endif
  diffuseColor.rgb *= 1.0 + ${tone.toFixed(3)} * (amA * 2.0 - 1.0);
  roughnessFactor = clamp(roughnessFactor + amW * ${rough.toFixed(3)} * (amB * 2.0 - 1.0), 0.04, 1.0);
}`);
  });
  m.userData.ammo = key;
  return m;
}

let MATS = null;
/**
 * Every material of the ammunition, made once and shared (the stack, the drill's props, both guns). Call it before the
 * scene's patchSceneFog and the shader warm-up (buildReadyAmmo's group carries every one of them into the scene).
 * Keys: paint, paintFlight, copper, copperFlight, fuze, brass, brassSpent, cloth, cup, can, steel, rubber, wicker, tarp,
 * wood, rope.
 */
export function ammoMaterials() {
  if (MATS) return MATS;
  const sh = TX.shellAtlas(), bd = TX.bandAtlas(), fz = TX.fuzeAtlas(), cs = TX.caseAtlas(), bg = TX.bagAtlas(), cp = TX.cupAtlas(), cn = TX.canAtlas();
  const wk = TX.wickerAtlas(), tp = TX.tarpAtlas(), wd = TX.woodAtlas();
  // a standard material on an albedo + packed surface pair (or the fallback colour, roughness and metalness)
  const std = (atl, mapK, surfK, fb, extra = {}, Phys = THREE.MeshStandardMaterial) => {
    const surf = atl?.[surfK] ?? null;
    const o = atl ? { map: atl[mapK], ...(surf ? { roughnessMap: surf, metalnessMap: surf, bumpMap: surf, roughness: 1, metalness: 1, bumpScale: extra.bump ?? 1 } : { roughness: fb[1], metalness: fb[2] }) }
      : { color: fb[0], roughness: fb[1], metalness: fb[2] };
    delete extra.bump;
    return new Phys({ ...o, ...extra });
  };
  const ol = new THREE.Color().setRGB(...TX.OLIVE.map((v) => v / 255), THREE.SRGBColorSpace);
  MATS = {
    paint: grime(std(sh, 'map', 'surf', [ol, 0.55, 0], { bump: 0.7 }), 'paint', { tone: 0.035, rough: 0.04 }),
    paintFlight: grime(std(sh && { map: sh.flight, surf: null }, 'map', 'surf', [ol, 0.55, 0]), 'paint-flight', { tone: 0.02, rough: 0.03 }),
    copper: grime(std(bd, 'map', 'surf', [0xa8643a, 0.4, 1], { bump: 0.6 }), 'copper', { tone: 0.06, rough: 0.06 }),
    copperFlight: grime(std(bd && { map: bd.flightMap, surf: bd.flightSurf }, 'map', 'surf', [0xa8643a, 0.35, 1], { bump: 1.5 }), 'copper-flight'),
    fuze: grime(std(fz, 'map', 'surf', [0x3e403e, 0.6, 0.5], { bump: 1.2 }), 'fuze', { tone: 0.05, rough: 0.05 }),
    brass: grime(std(cs, 'map', 'surf', [0xb5904e, 0.38, 0.95], { bump: 0.8 }), 'brass', { f1: 6, tone: 0.05, rough: 0.06 }),
    brassSpent: grime(std(cs && { map: cs.spentMap, surf: cs.spentSurf }, 'map', 'surf', [0x8a6a3a, 0.6, 0.6], { bump: 1.0 }), 'brass-spent', { f1: 6, tone: 0.08, rough: 0.06 }),
    // raw silk: a cloth sheen (MeshPhysical), no metal
    cloth: grime(std(bg, 'map', 'surf', [0xe2dac4, 0.95, 0], { bump: 1.6, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.9, 0.86, 0.78) }, THREE.MeshPhysicalMaterial), 'cloth', { f1: 14, tone: 0.06, rough: 0.02 }),
    cup: grime(std(cp, 'map', 'surf', [0x70604e, 0.88, 0], { bump: 1.2 }), 'cup', { tone: 0.06, rough: 0.04 }),
    can: grime(std(cn, 'map', 'surf', [0x565a4a, 0.6, 0], { bump: 0.8 }), 'can', { f1: 5, tone: 0.06, rough: 0.06 }),
    steel: grime(new THREE.MeshStandardMaterial({ color: 0x3c3d3a, roughness: 0.5, metalness: 0.85 }), 'steel', { f1: 30, tone: 0.1, rough: 0.1 }),
    rubber: grime(new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.85, metalness: 0 }), 'rubber'),
    wicker: grime(std(wk, 'map', 'surf', [0x9a7c52, 0.8, 0], { bump: 2.5 }), 'wicker', { f1: 3, tone: 0.1, rough: 0.04 }),
    tarp: grime(std(tp, 'map', 'surf', [0x4e503c, 0.92, 0], { bump: 1.4, side: THREE.DoubleSide, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.35, 0.36, 0.3) }, THREE.MeshPhysicalMaterial), 'tarp', { f1: 1.1, f2: 7, tone: 0.16, rough: 0.04 }),
    wood: grime(std(wd, 'map', 'surf', [0x70604a, 0.9, 0], { bump: 1.6 }), 'wood', { f1: 2, tone: 0.1, rough: 0.03 }),
    rope: grime(new THREE.MeshStandardMaterial({ color: 0x8c7a58, roughness: 0.95, metalness: 0 }), 'rope', { f1: 60, tone: 0.12 }),
  };
  return MATS;
}

let fogDone = false;
/**
 * In the game: gives every ammunition material the scene's fog and flare uniforms through shaderlib's patchMaterial
 * (passed in, so this file stays free of shaderlib and the viewers work without it), under the same 'fog' key
 * patchSceneFog uses. Call it once before the props go into the scene, so a prop added after patchSceneFog (a drill
 * prop made later) still compiles with the fog. Without it, patchSceneFog patches whatever is in the scene then.
 */
export function patchAmmoFog(patchMaterial) {
  const M = ammoMaterials();
  if (fogDone || typeof patchMaterial !== 'function') return M;
  fogDone = true;
  for (const m of Object.values(M)) patchMaterial(m, 'fog');
  return M;
}

// ---------------------------------------------------------------- the 21 cm Gr 18

// G.R. 295a (21 cm Gr 18 Stg., 13 B 1606; the Gr 18 is "of the same dimensions", TM 9-1985-3), s from the base (m):
//   base face 189 mm across with a rounded edge into the 6 degree streamline taper (199 mm at s 0, TM 7.48 in base) over
//   the last 54 mm; the rear bourrelet 210.6 mm to s 108, relieved to 209 mm round the bands (the 1:1 detail); the rear
//   band 117 to 131.5 (216.8 mm, a 217.5 mm lip at its rear edge, a 45 degree front chamfer), the front band 141 to 155.5
//   (216 mm, its front face 60 degrees): the drawing's 117 and 141 put the bands 9.5 mm apart (research 1.1 read the
//   "4" of the 1:1 detail, which is the band seat's depth, as the gap); relief to 161, bourrelet 210.6 to 184; the body
//   209.2 mm; the front bourrelet 210.6 mm from 390 (the drawing's step) to the ogive, which starts at 433.6 where the
//   secant arc of radius 2,100 mm (centre s 267.2, r -1,988.1) meets the bourrelet with a 4.5 degree kink and runs to
//   the 60.2 mm nose face at 846; the fuze stands 27 mm proud: 873 mm overall.
const GR = { L: 0.8731, R: 0.10875, nose: 0.846, ogive: 0.4336 };
const ogR = (s) => -1.9881 + Math.sqrt(4.41 - (s - 0.2672) ** 2);
const SU = TX.SHELL_UV;
const sideUV = (s, r, u) => [u, ((SU.top - s) / SU.top) * SU.sideH / SU.H];
const baseUV = (s, r, u, c, sn) => [(SU.base.cx + (r * c / SU.base.r) * SU.base.R) / SU.W, (SU.base.cy - (r * sn / SU.base.r) * SU.base.R) / SU.H];
const bandUV = (s, r, u) => [u, Math.min(1, Math.max(0, (s - 0.117) / 0.0385))];

function gr18Body(lod) {
  const hd = lod === 'hd', nO = hd ? 64 : lod === 'lod' ? 20 : 14, side = { uv: sideUV };
  const og = [];
  for (let i = 0; i <= nO; i++) { const t = i / nO, s = GR.ogive + (GR.nose - GR.ogive) * (1 - (1 - t) ** 1.25); og.push([s, ogR(s)]); }
  og[og.length - 1] = [GR.nose, 0.0301];
  const step = (a, b) => hard([a, b], side);
  return [
    R([[0, 0], [0, 0.06], [0, 0.0946]], { uv: baseUV }),
    R([...fillet([0, 0.0946], [0, 0.0996], [0.0052, 0.10015], hd ? 6 : 2), [0.054, 0.1053]], side),
    hard([[0.054, 0.1053], [0.108, 0.1053]], side), step([0.108, 0.1053], [0.1088, 0.1045]), hard([[0.1088, 0.1045], [0.117, 0.1045]], side),
    hard([[0.1315, 0.1045], [0.141, 0.1045]], side), // (the 9.5 mm between the bands, painted)
    hard([[0.1555, 0.1045], [0.1605, 0.1045]], side), step([0.1605, 0.1045], [0.1613, 0.1053]), hard([[0.1613, 0.1053], [0.184, 0.1053]], side),
    step([0.184, 0.1053], [0.1848, 0.1046]), hard(line([0.1848, 0.1046], [0.389, 0.1046], hd ? 8 : 2), side),
    step([0.389, 0.1046], [0.3898, 0.1053]), hard([[0.3898, 0.1053], [GR.ogive, 0.1053]], side),
    hard(og, side),
    hard([[GR.nose, 0.0301], [GR.nose, 0.0293]], side), hard([[GR.nose, 0.0293], [GR.nose - 0.008, 0.0293]], side),
  ];
}
function gr18Bands(lod, flight) {
  const o = { uv: bandUV };
  if (flight) {
    // engraved by the 64 grooves of the bore (CEOM p. 101): the lands cut channels down to the calibre, 210 mm; the
    // grooves leave ribs at the band's full height (the twist is left out)
    o.mod = (s, r, u) => (r > 0.1053 && ((u * 64) % 1) < 0.45 ? Math.max(0.1051, r - 0.0034) : r);
  }
  const fs = lod === 'hd' || flight ? 4 : 2;
  return [
    hard([[0.117, 0.1045], [0.117, 0.1068]], o), hard(fillet([0.117, 0.1068], [0.117, 0.10875], [0.1186, 0.10875], fs), o),
    hard([[0.1186, 0.10875], [0.1198, 0.10875]], o), hard([[0.1198, 0.10875], [0.1203, 0.1084]], o),
    hard([[0.1203, 0.1084], [0.1285, 0.1084]], o), hard([[0.1285, 0.1084], [0.1315, 0.1045]], o),
    hard([[0.141, 0.1045], [0.141, 0.1062]], o), hard([[0.141, 0.1062], [0.1433, 0.108]], o),
    hard([[0.1433, 0.108], [0.1505, 0.108]], o), hard([[0.1505, 0.108], [0.1555, 0.1045]], o),
  ];
}
// the fuze AZ 23 umg (HEA Pamphlet 12 fig. 6, TM p. 575): the flange (58.7 mm) seated in the nose, the retaining ring
// with the index line, and the setting head: a short concave cone under a collar and a metal disc, 27 mm proud in all
const FU = TX.FUZE_UV;
const ringUV = (s, r, u) => [u, (FU.ring[0] + ((0.8531 - s) / 0.0076) * (FU.ring[1] - FU.ring[0])) / FU.H];
const headUV = (s, r, u) => [u, s <= 0.869 ? (40 + ((0.869 - s) / 0.0159) * 120) / FU.H : Math.max(0, (0.8731 - s) / 0.0041) * 40 / FU.H];
// the flat top (the metal disc in its collar) mapped flat onto the atlas's disk: a strip mapped round it smeared the
// atlas into a pinwheel
const topUV = (s, r, u, c, sn) => [(FU.disk.cx + (r * c / 0.0122) * FU.disk.R) / FU.W, (FU.disk.cy - (r * sn / 0.0122) * FU.disk.R) / FU.H];
function fuzeBody() {
  const o = { uv: ringUV };
  return [hard([[0.8455, 0.0293], [0.8478, 0.0293]], o), hard([[0.8478, 0.0293], [0.8486, 0.0286]], o), hard([[0.8486, 0.0286], [0.8486, 0.0276]], o),
    hard([[0.8486, 0.0276], [0.8531, 0.0268]], o), hard([[0.8531, 0.0268], [0.8531, 0.0262]], o)];
}
function fuzeHead(lod) {
  const o = { uv: headUV }, n = lod === 'hd' ? 10 : 4, cone = [];
  for (let i = 0; i <= n; i++) { const t = i / n; cone.push([0.8536 + 0.0154 * t, 0.0259 - 0.0113 * t ** 0.82]); } // (slightly concave, fig. 6)
  return [hard([[0.8531, 0.0261], [0.8536, 0.0259]], o), hard(cone, o), hard([[0.869, 0.0146], [0.869, 0.0122]], o),
    hard([[0.869, 0.0122], [0.8724, 0.0122], [0.873, 0.0116]], o), hard([[0.873, 0.0116], [0.8731, 0.007], [0.8731, 0]], { uv: topUV })];
}

const SEG = { hd: 128, lod: 40, flight: 32 };
const gr18Cache = new Map();
/**
 * The 21 cm Gr 18 as buildShell returns a shell: { parts: [{ geometry, material, name }], length, radius, head } along Z,
 * nose -Z, centred; `head` the fuze's setting head ({ geometry, material }) apart, to turn on its own node (gr18Prop).
 * lod: 'hd' (128 round, smooth at 0.4 m), 'lod' (40, the stack), 'flight' (32, the bands engraved, the lettering smeared).
 * Geometry is built once per lod and shared. withHead: the head in `parts` too (ShellViews, a stack: nothing turns).
 */
export function buildGr18({ lod = 'hd', withHead = false } = {}) {
  const flight = lod === 'flight', M = ammoMaterials();
  let G = gr18Cache.get(lod);
  if (!G) {
    const seg = SEG[lod] ?? 64, zc = GR.L / 2;
    G = {
      body: lathe(gr18Body(lod), { seg, zc }),
      bands: lathe(gr18Bands(lod, flight), { seg: flight ? 256 : lod === 'hd' ? 192 : seg, zc, relief: flight }),
      fuze: lathe(fuzeBody(), { seg: Math.min(seg, 64), zc }),
      head: lathe(fuzeHead(lod), { seg: Math.min(seg, 64), zc }),
    };
    gr18Cache.set(lod, G);
  }
  const parts = [
    { geometry: G.body, material: flight ? M.paintFlight : M.paint, name: 'gr18-body' },
    { geometry: G.bands, material: flight ? M.copperFlight : M.copper, name: 'gr18-bands' },
    { geometry: G.fuze, material: M.fuze, name: 'gr18-fuze' },
  ];
  if (withHead) parts.push({ geometry: G.head, material: M.fuze, name: 'gr18-head' }); // (the whole shell as plain parts)
  return { parts, length: GR.L, radius: GR.R, head: { geometry: G.head, material: M.fuze } };
}

// the setting head's angle for a setting: OV (ohne Verzögerung, non-delay) at the index line, MV (mit Verzögerung,
// delay) a quarter turn on (HEA: "two lines at right angles ... set to an index line on the retaining ring")
export const FUZE_SET = { OV: 0, MV: Math.PI / 2 };
export const fuzeAngle = (set) => (typeof set === 'number' ? set : FUZE_SET[set] ?? 0);
/** Turns a gr18Prop's (or an instanced stack's prop) setting head: 'OV', 'MV' or an angle in radians. */
export function setFuze(prop, set) { if (prop?.fuzeHead) prop.fuzeHead.rotation.z = fuzeAngle(set); }
/** The setting for the unit's order (u.order.fuze: 'instant' is AZ o.V., OV; 'delay' is AZ m.V., MV; ww1/ui.js). */
export const fuzeSetOf = (orderFuze) => (orderFuze === 'delay' ? 'MV' : 'OV');
/**
 * How many bags stay in the case for a charge: the sim's four charges of the Mrs 18 are Ladung 1, 3, 5 and 6
 * (tables_ww2.js), so pass the charge's name ('Ladung 5' -> 5) or its index in that list (u.order.charge: 0 -> 1,
 * 1 -> 3, 2 -> 5, 3 -> 6). case.setCharge(n) shows bags 1 to n; case.bags.slice(n) are the increments taken out.
 */
export const LADUNG = [1, 3, 5, 6];
export const ladungOf = (charge) => (typeof charge === 'number' ? LADUNG[Math.max(0, Math.min(3, charge | 0))] : Math.max(1, Math.min(6, +(/(\d+)/.exec(String(charge ?? ''))?.[1] ?? 6))));

/**
 * The Gr 18 as a drill prop, shaped as crews.js propOf makes one (a Group, rotation order YXZ, hidden, its meshes casting
 * shadows), plus prop.fuzeHead (an Object3D on the shell's axis: rotation.z turns the head; setFuze) and
 * userData { ammo: 'gr18', length, radius }. opts: { lod = 'hd', set = 'OV', roll = 0 (the stencils face up at 0) }.
 */
export function gr18Prop({ lod = 'hd', set = 'OV', roll = 0, visible = false } = {}) {
  const b = buildGr18({ lod }), g = new THREE.Group(), inner = new THREE.Group();
  g.rotation.order = 'YXZ'; g.name = 'gr18'; inner.name = 'gr18-roll'; inner.rotation.z = roll;
  for (const p of b.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.name = p.name; m.castShadow = true; m.receiveShadow = true; inner.add(m); }
  const head = new THREE.Group(); head.name = 'fuzeHead';
  const hm = new THREE.Mesh(b.head.geometry, b.head.material); hm.name = 'gr18-head'; hm.castShadow = true;
  head.add(hm); inner.add(head); g.add(inner);
  g.fuzeHead = head; g.visible = visible;
  g.userData = { ammo: 'gr18', length: b.length, radius: b.radius };
  setFuze(g, set);
  return g;
}

// ---------------------------------------------------------------- the cartridge case 6351 and its charge

// TM 9-1985-3 p. 523: 410 mm long, 222 mm at the neck, 241 mm at the base (the rim), no shoulder: a straight taper from
// 232.6 mm above the rim to 222.2 at the mouth (estimate within those figures), the wall 2.5 mm at the mouth, the head
// about 34 mm thick inside (estimate), the rim 10.5 mm. The C/12 nA screw primer (lip 31.75 mm: TM, HEA P14) flush in
// the head. Base (head) at +Z, mouth toward -Z, centred: s from the head face.
const CA = TX.CASE_UV, CL = 0.41, CUP_S = 0.393, BAG_S0 = 0.044;
const caseSide = (s, r, u) => [u, ((CL - s) / CL) * CA.sideH / CA.H];
const caseHead = (s, r, u, c, sn) => [(CA.head.cx + (r * c / CA.head.r) * CA.head.R) / CA.W, (CA.head.cy - (r * sn / CA.head.r) * CA.head.R) / CA.H];
// (inset 6 px from the inside region's edges: the mipmaps bled the head's brass in as a bright hairline at the seam)
const caseIn = (s, r, u) => [(CA.inner[0] + 6 + u * (CA.inner[2] - CA.inner[0] - 12)) / CA.W, (CA.inner[1] + 6 + ((CL - s) / CL) * (CA.inner[3] - CA.inner[1] - 12)) / CA.H];
function caseRuns(lod, spent) {
  const side = { uv: caseSide }, head = { uv: caseHead }, inn = { uv: caseIn }, hd = lod === 'hd';
  // the primer's face: flush; spent, the cap struck in by the firing pin (a dimple 2 mm deep)
  const primer = spent ? [[0.0022, 0], [0.0016, 0.0013], [0.0005, 0.0027], [0, 0.0037], [0, 0.0159]] : [[0, 0], [0, 0.0159]];
  return [
    R(primer, head), hard([[0, 0.0159], [0.0006, 0.016], [0.0006, 0.0163], [0, 0.0164]], head), hard([[0, 0.0164], [0, 0.07], [0, 0.1185]], head),
    hard(fillet([0, 0.1185], [0, 0.1205], [0.0018, 0.1205], 3), side), R([[0.0018, 0.1205], [0.0105, 0.1205]], side),
    hard([[0.0105, 0.1205], [0.0112, 0.1196], [0.0116, 0.1172]], side), R([[0.0116, 0.1172], [0.0124, 0.1163]], side),
    hard(line([0.0124, 0.1163], [CL, 0.1111], hd ? 10 : 3), side),
    hard(fillet([CL - 0.0004, 0.1111], [CL, 0.10985], [CL - 0.0004, 0.1086], 3), side),
    hard(line([CL - 0.0004, 0.1086], [0.042, 0.1122], hd ? 6 : 2), inn), R([...fillet([0.042, 0.1122], [0.034, 0.1122], [0.034, 0.104], 3), [0.034, 0.004], [0.034, 0]], inn),
  ];
}
// the leatherboard cup pressed 17 mm into the mouth (TM p. 351: "a cardboard or leatherboard cup is used to close the
// mouth"; its shape and depth are estimates after the 10.5 cm and 15 cm cased charges): a disc with a short skirt toward
// the mouth, the label on it, a cloth pull tab
const CU = TX.CUP_UV;
const cupDisk = (s, r, u, c, sn) => [(CU.disk.cx - (r * c / 0.1055) * CU.disk.R) / CU.W, (CU.disk.cy - (r * sn / 0.1055) * CU.disk.R) / CU.H];
// the skirt is leatherboard too (the row between the disk and the tab's strip)
const cupSkirt = (s, r, u) => [u, 473 / CU.H];
const cupRuns = () => [hard([[0.405, 0.1084], [0.405, 0.1066]], { uv: cupSkirt }), hard([[0.405, 0.1066], [0.3935, 0.1062], [CUP_S, 0.1055]], { uv: cupSkirt }), hard([[CUP_S, 0.1055], [CUP_S, 0.06], [CUP_S, 0]], { uv: cupDisk })];
// a strip of cloth along a polyline (points in xyz), w wide (across `side`), t thick
function ribbon(pts, w, t, side, uv0 = [0, 0], uv1 = [1, 1]) {
  const P = [], N = [], U = [], I = [], n = pts.length, sd = side.clone().normalize();
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    const tg = q.clone().sub(o).normalize(), up = new THREE.Vector3().crossVectors(sd, tg).normalize();
    for (const [a, b] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const v = p.clone().addScaledVector(sd, a * w / 2).addScaledVector(up, b * t / 2);
      P.push(v.x, v.y, v.z); N.push(...(b > 0 ? up : up.clone().negate()).toArray());
      U.push(uv0[0] + (uv1[0] - uv0[0]) * (a > 0 ? 1 : 0), uv0[1] + (uv1[1] - uv0[1]) * i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 4, b = a + 4; I.push(a, b, a + 1, a + 1, b, b + 1, a + 3, a + 2, b + 3, a + 2, b + 2, b + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

// The six bags (TX.BAGS): disc-shaped cloth bags of Digl. sticks stacked in the case from the base bag (with its
// igniter pad on its underside, against the primer) to increment 6 under the cup. How the real charge was made up is
// not found (research 1.3, 1.7): stacked bags in the case, the top ones taken out for a lower charge, as the field
// howitzers' cased charges (leFH 18, sFH 18) were, is the simplest reading (estimate). Each bag: a cushion of silk, the
// side panel sewn to two discs (the welts at the edges), domed a little by the sticks inside, a tape loop across the
// top to lift it out (estimate).
const BU = TX.BAG_UV;
function bagRuns(i, h, lod) {
  const r0 = TX.BAG_R, e = Math.min(0.011, h / 3.2), hd = lod === 'hd', n = hd ? 5 : 2;
  const y0 = i * BU.strip, sideV = (s) => (y0 + 4 + (1 - s / h) * (BU.strip - 8)) / BU.H;
  const slot = (k, flip) => (s, r, u, c, sn) => [(k * BU.disk.size + BU.disk.size / 2 + (flip ? -1 : 1) * (r * c / r0) * BU.disk.size * 0.48) / BU.W, (BU.disk.y + BU.disk.size / 2 - (r * sn / r0) * BU.disk.size * 0.48) / BU.H];
  const bulge = (t) => 0.0018 * Math.sin(Math.PI * t), dome = Math.min(0.004, h * 0.08);
  const sidePts = [];
  for (let k = 0; k <= (hd ? 6 : 2); k++) { const t = k / (hd ? 6 : 2), s = e + (h - 2 * e) * t; sidePts.push([s, r0 + bulge(t)]); }
  return [
    R([[-dome, 0], [-dome * 0.7, r0 * 0.5], [0, r0 - e]], { uv: slot(i === 0 ? 6 : i, false) }), // the bottom, seen from below
    R(fillet([0, r0 - e], [0, r0], [e, r0], n), { uv: (s) => [0, sideV(s)] }),
    R(sidePts, { uv: (s, r, u) => [u, sideV(s)] }),
    R(fillet([h - e, r0], [h, r0], [h, r0 - e], n), { uv: (s, r, u) => [u, sideV(s)] }),
    R([[h, r0 - e], [h + dome * 0.7, r0 * 0.5], [h + dome, 0]], { uv: slot(i, true) }), // the top, seen from the mouth
  ];
}
const bagGeoCache = new Map();
function bagGeo(i, lod) {
  const key = i + lod;
  if (bagGeoCache.has(key)) return bagGeoCache.get(key);
  const h = TX.BAGS[i].h, seg = lod === 'hd' ? 72 : 24, list = [lathe(bagRuns(i, h, lod), { seg, zc: h / 2 })];
  if (i === 0) {
    // the igniter pad, quilted, stitched to the base bag's bottom (HEA P12: "an igniter ... stitched to the base of the bag")
    const pad = [[-0.0085, 0], [-0.008, 0.026], [-0.006, 0.039], [-0.001, 0.0455], [0, 0.046]];
    list.push(lathe([R(pad, { uv: (s, r, u, c, sn) => [(6 * BU.disk.size + BU.disk.size / 2 + (r * c / TX.BAG_R) * BU.disk.size * 0.48) / BU.W, (BU.disk.y + BU.disk.size / 2 - (r * sn / TX.BAG_R) * BU.disk.size * 0.48) / BU.H] })], { seg: Math.min(seg, 48), zc: h / 2 }));
  } else {
    // the tape loop across the top, sewn at the edges, lying on the dome with a little slack (the cup presses it down;
    // estimate): it follows the dome so its ends are sewn to the cloth, not floating
    const dome = Math.min(0.004, h * 0.08), re = TX.BAG_R - Math.min(0.011, h / 3.2), pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, x = (t - 0.5) * 2 * (TX.BAG_R - 0.012), d = dome * Math.max(0, 1 - (x / re) ** 2); pts.push(new THREE.Vector3(x, 0, -h / 2 - d - 0.0011 - 0.003 * Math.sin(Math.PI * t))); }
    list.push(ribbon(pts, 0.022, 0.0016, new THREE.Vector3(0, 1, 0), [1900 / BU.W, 1000 / BU.H], [2040 / BU.W, 1010 / BU.H]));
  }
  const g = mergeHD(list);
  g.computeBoundingSphere();
  bagGeoCache.set(key, g);
  return g;
}

const caseCache = new Map();
/**
 * The cartridge case 6351 as a Group (rotation order YXZ, along Z, mouth -Z, head +Z, centred): case.body (the brass),
 * case.cup (the leatherboard cup with its label and pull tab, or null), case.bags (six Object3Ds, the base bag first,
 * each at its place in the stack: move one to pull it out), case.setCharge(n) (shows bags 1 to n), case.setCup(on).
 * opts: { lod = 'hd' | 'lod', cup = true, bags = true, spent = false (sooted, struck, empty) }.
 * userData { ammo: 'case6351', length: 0.41, radius: 0.1205, mouth: z of the mouth (-0.205), cupDepth }.
 */
export function case6351({ lod = 'hd', cup = true, bags = true, spent = false, visible = true } = {}) {
  const M = ammoMaterials(), seg = lod === 'hd' ? 128 : 40, key = lod + (spent ? 's' : '');
  let G = caseCache.get(key);
  if (!G) {
    G = { body: lathe(caseRuns(lod, spent), { seg, zc: CL / 2 }) };
    if (!spent) {
      const tabPts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; tabPts.push(new THREE.Vector3((t - 0.5) * 0.05, 0, CL / 2 - CUP_S - 0.0015 - 0.011 * Math.sin(Math.PI * t))); }
      G.cup = mergeHD([lathe(cupRuns(), { seg: Math.min(seg, 72), zc: CL / 2 }), ribbon(tabPts, 0.016, 0.0018, new THREE.Vector3(0, 1, 0), [0, 484 / CU.H], [1, 508 / CU.H])]);
    }
    caseCache.set(key, G);
  }
  const g = new THREE.Group();
  g.rotation.order = 'YXZ'; g.name = spent ? 'case6351-spent' : 'case6351'; g.visible = visible;
  const body = new THREE.Mesh(G.body, spent ? M.brassSpent : M.brass);
  body.name = 'case-body'; body.castShadow = body.receiveShadow = true; g.add(body); g.body = body;
  g.cup = null; g.bags = [];
  if (!spent && cup) {
    const c = new THREE.Mesh(G.cup, M.cup); c.name = 'case-cup'; c.castShadow = c.receiveShadow = true; g.add(c); g.cup = c;
  }
  if (!spent && bags) {
    let s = BAG_S0;
    TX.BAGS.forEach((b, i) => {
      const m = new THREE.Mesh(bagGeo(i, lod), M.cloth);
      m.name = 'bag-' + b.n; m.castShadow = m.receiveShadow = true;
      m.position.z = CL / 2 - (s + b.h / 2);
      m.userData = { bag: b.n, kg: b.kg, h: b.h, home: m.position.z };
      s += b.h;
      g.add(m); g.bags.push(m);
    });
  }
  g.setCharge = (n) => { g.bags.forEach((m, i) => { m.visible = i < n; }); };
  g.setCup = (on) => { if (g.cup) g.cup.visible = !!on; };
  g.userData = { ammo: 'case6351', length: CL, radius: 0.1205, mouth: -CL / 2, cupDepth: CL - CUP_S, spent };
  return g;
}

/**
 * The case as one geometry and material ({ geometry, material, length, radius }), for an InstancedMesh (a pile or a row
 * of spent cases). Along Z, mouth -Z, head +Z, centred, as case6351.
 */
export function caseParts({ lod = 'lod', spent = true } = {}) {
  const c = case6351({ lod, spent, cup: false, bags: false });
  return { geometry: c.body.geometry, material: c.body.material, length: CL, radius: 0.1205 };
}

// ---------------------------------------------------------------- the charge container

// A seam-welded sheet-steel cylinder for one cased charge (estimates: a collector's 450 mm container "for the 21 cm Mrs
// 18" with paint markings on its lid, bocn.co.uk 95717; the build after an sFH 18 special-charge container, "rolled
// steel seam welded cylindrical container with a welded on flanged base; the lid is a steel pressing with a wire handle",
// gunstar.co.uk; the beads as the containers on planks in Bundesarchiv 101I-278-0895-14): 270 mm across, 454 mm to the
// rim, a flanged base, two rolled beads, a pressed lid with a raised ring, a rubber gasket, a wire bail on two ears,
// hinged on one side and held by a lever clamp on the other. Stands on y = 0, the stencils facing +Z.
const NU = TX.CAN_UV, CAN_H = 0.454, CAN_R = 0.135;
const canSide = (s, r, u) => [u, ((0.47 - s) / 0.47) * NU.sideH / NU.H];
const canIn = (s, r, u) => [(NU.inner[0] + u * (NU.inner[2] - NU.inner[0])) / NU.W, (NU.inner[1] + (1 - s / CAN_H) * (NU.inner[3] - NU.inner[1])) / NU.H];
const lidTop = (s, r, u, c, sn) => [(NU.lid.cx - (r * c / 0.14) * NU.lid.R) / NU.W, (NU.lid.cy - (r * sn / 0.14) * NU.lid.R) / NU.H];
// the flat discs inside (the floor, the lid's underside, the bottom) mapped flat onto the inside region
const inFlat = (s, r, u, c, sn) => [(NU.inner[0] + (0.5 + r * c / 0.3) * (NU.inner[2] - NU.inner[0])) / NU.W, (NU.inner[1] + (0.5 - r * sn / 0.3) * (NU.inner[3] - NU.inner[1])) / NU.H];
const bead = (s0, n) => { const p = []; for (let k = 0; k <= n; k++) { const t = k / n; p.push([s0 + 0.014 * t, CAN_R + 0.0024 * Math.sin(Math.PI * t)]); } return p; };
function canRuns(lod) {
  const o = { uv: canSide }, n = lod === 'hd' ? 8 : 4;
  return [
    R([[0, 0], [0, 0.1385]], { uv: inFlat }), hard([[0, 0.1385], [0.008, 0.1385]], o), hard([[0.008, 0.1385], [0.0085, CAN_R]], o),
    hard([[0.0085, CAN_R], [0.055, CAN_R]], o), R(bead(0.055, n), o), R(line([0.069, CAN_R], [0.4, CAN_R], 4), o), R(bead(0.4, n), o),
    R([[0.414, CAN_R], [0.445, CAN_R]], o), hard(fillet([0.445, CAN_R], [0.452, 0.1372], [0.454, 0.1352], 3), o),
    R([[0.454, 0.1352], [0.4525, 0.1336]], o), hard([[0.4525, 0.1336], [0.012, 0.1336]], { uv: canIn }), hard([[0.012, 0.1336], [0.012, 0]], { uv: inFlat }),
  ];
}
function lidRuns(lod) {
  const n = lod === 'hd' ? 5 : 2, o = { uv: canSide }, top = { uv: lidTop };
  return [
    R([[0.004, 0], [0.004, 0.133]], { uv: inFlat }), R([[0.004, 0.133], [0.0005, 0.1373]], { uv: inFlat }),
    hard(fillet([0.0005, 0.1373], [-0.0006, 0.1385], [0.0005, 0.1397], 2), o), R([[0.0005, 0.1397], [0.016, 0.1397]], o),
    R(fillet([0.016, 0.1397], [0.0215, 0.1397], [0.0215, 0.1345], n), o),
    hard([[0.0215, 0.1345], [0.0215, 0.112], [0.0235, 0.108], [0.0235, 0.094], [0.0215, 0.09], [0.0225, 0.05], [0.0228, 0]], top),
  ];
}
const canCache = new Map();
/**
 * The charge container as a Group standing on y = 0: can.lid (the hinge pivot: the lid, its bail and gasket turn with
 * it), can.latch (the clamp lever's pivot), can.content (an Object3D at the bottom inside: a cased charge put in stands
 * on it, mouth up), can.setOpen(k) (0 shut and clamped; to 0.3 the clamp lever swings down; to 1 the lid is up 115
 * degrees). opts: { lod = 'hd' | 'lod', open = 0, charge = false (a case6351 with its cup inside), set }.
 */
export function canister({ lod = 'hd', open = 0, charge = false } = {}) {
  const M = ammoMaterials(), seg = lod === 'hd' ? 96 : 32;
  let G = canCache.get(lod);
  if (!G) {
    const up = (g) => g.rotateX(Math.PI / 2); // the lathe's -Z (s up) to +Y
    G = { body: up(lathe(canRuns(lod), { seg, zc: 0 })), lid: up(lathe(lidRuns(lod), { seg, zc: 0 })) };
    // the gasket under the lid's rim
    G.gasket = new THREE.TorusGeometry(0.1355, 0.0028, 6, Math.min(seg, 64)).rotateX(Math.PI / 2).translate(0, 0.004, 0);
    // the hinge: two knuckles on the body, one on the lid, the pin; the clamp's bracket on the body and its lever with
    // the wire loop that hooks over the catch on the lid's edge; the lid's two ears and the wire bail lying flat
    const kn = (z, l) => new THREE.CylinderGeometry(0.0055, 0.0055, l, 12).rotateX(Math.PI / 2).translate(0, 0, z);
    G.hingeBody = mergeHD([kn(-0.028, 0.022), kn(0.028, 0.022), chamferBox(0.014, 0.02, 0.022, 0.002, 0.006, -0.012, -0.028), chamferBox(0.014, 0.02, 0.022, 0.002, 0.006, -0.012, 0.028)]);
    G.hingeLid = mergeHD([kn(0, 0.03), chamferBox(0.016, 0.006, 0.03, 0.002, 0.009, 0.006, 0), new THREE.CylinderGeometry(0.0022, 0.0022, 0.09, 8).rotateX(Math.PI / 2)]);
    G.bracket = mergeHD([chamferBox(0.012, 0.04, 0.034, 0.002, -0.006, -0.01, 0), new THREE.CylinderGeometry(0.004, 0.004, 0.044, 10).rotateX(Math.PI / 2)]);
    const loop = [new THREE.Vector3(0.0, 0.04, -0.012), new THREE.Vector3(-0.004, 0.056, -0.012), new THREE.Vector3(-0.012, 0.064, -0.006), new THREE.Vector3(-0.012, 0.064, 0.006), new THREE.Vector3(-0.004, 0.056, 0.012), new THREE.Vector3(0.0, 0.04, 0.012)];
    G.lever = mergeHD([chamferBox(0.008, 0.06, 0.02, 0.002, 0.008, 0.022, 0), tubeAlong(loop, 0.0018, { seg: 6, per: 0.01 })]);
    G.catch = chamferBox(0.01, 0.008, 0.024, 0.002, 0, 0, 0);
    const bail = [];
    for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; bail.push(new THREE.Vector3(-0.065 * Math.cos(a), 0.003, -0.075 * Math.sin(a) + 0.015)); }
    G.bail = mergeHD([tubeAlong(bail, 0.0026, { seg: 8, per: 0.01 }), chamferBox(0.012, 0.012, 0.016, 0.002, -0.065, 0.005, 0.015), chamferBox(0.012, 0.012, 0.016, 0.002, 0.065, 0.005, 0.015)]);
    canCache.set(lod, G);
  }
  const g = new THREE.Group(), mk = (geo, mat, name, parent = g) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  g.name = 'canister';
  mk(G.body, M.can, 'can-body');
  // the hinge on -X at the rim, its axis along Z
  const hx = -0.1425, hy = CAN_H + 0.004;
  const hb = mk(G.hingeBody, M.steel, 'can-hinge'); hb.position.set(hx, hy, 0);
  const lid = new THREE.Group(); lid.name = 'can-lid'; lid.position.set(hx, hy, 0); g.add(lid);
  const lm = mk(G.lid, M.can, 'can-lid', lid); lm.position.set(-hx, CAN_H - 0.004 - hy, 0);
  const gk = mk(G.gasket, M.rubber, 'can-gasket', lid); gk.position.copy(lm.position);
  mk(G.hingeLid, M.steel, 'can-hinge-lid', lid);
  const bl = mk(G.bail, M.steel, 'can-bail', lid); bl.position.set(-hx, CAN_H - 0.004 - hy + 0.0235, 0);
  const ct = mk(G.catch, M.steel, 'can-catch', lid); ct.position.set(-hx + 0.143, CAN_H - 0.004 - hy + 0.012, 0);
  // the clamp on +X: a bracket below the rim, the lever on its pin
  const br = mk(G.bracket, M.steel, 'can-bracket'); br.position.set(CAN_R + 0.006, CAN_H - 0.065, 0);
  const latch = new THREE.Group(); latch.name = 'can-latch'; latch.position.set(CAN_R + 0.008, CAN_H - 0.065, 0); g.add(latch);
  mk(G.lever, M.steel, 'can-lever', latch);
  const content = new THREE.Object3D(); content.name = 'can-content'; content.position.y = 0.012; g.add(content);
  g.lid = lid; g.latch = latch; g.content = content;
  g.setOpen = (k) => {
    k = Math.max(0, Math.min(1, k));
    const kl = Math.min(1, k / 0.3), kd = Math.max(0, (k - 0.3) / 0.7), sm = (t) => t * t * (3 - 2 * t);
    latch.rotation.z = -2.1 * sm(kl); // the lever swings out and down, the loop off the catch
    lid.rotation.z = (115 * Math.PI / 180) * sm(kd);
    g.userData.open = k;
  };
  if (charge) {
    // the cased charge, cup on, standing on its head
    const c = case6351({ lod, cup: true, bags: true });
    c.rotation.set(Math.PI / 2, 0, 0); c.position.y = CL / 2;
    content.add(c); g.charge = c;
  }
  g.setOpen(open);
  g.userData = { ...g.userData, ammo: 'canister', height: CAN_H + 0.026, radius: 0.1425 };
  return g;
}

// ---------------------------------------------------------------- the wicker basket

// One shell to a wicker basket (TM 9-1985-3 p. 523); for 15 cm shells "the shell is upside down in the basket, resting on
// a support block (Auflegeklotz) at the bottom", the basket "protects the copper driving ring and fuse" (museum and
// collector's notes, low). Its size for the 21 cm is an estimate from the shell: 272 mm across and 0.93 m tall, willow
// stakes and weavers (the weave in the texture), a three-rod border, two twisted handles, the block inside. Stands on y = 0.
const WK_H = 0.93, WK_R = 0.136, WT = 0.15; // the weave's tile (m)
const wkUV = (s, r, u) => [u * 6, s / WT];
function basketRuns(lod) {
  const n = lod === 'hd' ? 24 : 6, o = { uv: wkUV };
  return [
    R([[0, 0], [0, 0.124]], { uv: (s, r, u, c, sn) => [r * c / WT, r * sn / WT] }), R(fillet([0, 0.124], [0, WK_R], [0.014, WK_R], 3), o),
    R(line([0.014, WK_R], [WK_H - 0.01, WK_R + 0.004], n), o), hard(line([WK_H - 0.01, WK_R - 0.012], [0.02, WK_R - 0.013], n), o),
    R([[0.02, WK_R - 0.013], [0.02, 0]], { uv: (s, r, u, c, sn) => [r * c / WT, r * sn / WT] }),
  ];
}
// a coil of twisted rods round a circle of radius rr at height y (the border), or along a curve
function twisted(curvePts, rods, rodR, twistR, turns, seg = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(curvePts, closed), L = curve.getLength(), n = Math.max(24, Math.ceil(L / 0.006)), out = [];
  const fr = curve.computeFrenetFrames(n, closed);
  for (let k = 0; k < rods; k++) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = TAU * (turns * t + k / rods), p = curve.getPointAt(t);
      pts.push(p.addScaledVector(fr.normals[i], Math.cos(a) * twistR).addScaledVector(fr.binormals[i], Math.sin(a) * twistR));
    }
    out.push(tubeAlong(pts, rodR, { seg, closed: false, per: 0.006 }));
  }
  return mergeHD(out);
}
const basketCache = new Map();
/**
 * A wicker basket as a Group standing on y = 0: basket.content (an Object3D on the support block, the shell's nose goes
 * down onto it: a Gr 18 put in stands nose down). opts: { lod = 'hd' | 'lod', shell = false (a Gr 18 in it), lid = false
 * (the lid on), lying = false (on its side) }.
 */
export function basket({ lod = 'hd', shell = false, lid = false } = {}) {
  const M = ammoMaterials(), seg = lod === 'hd' ? 96 : 28;
  let G = basketCache.get(lod);
  if (!G) {
    G = { body: lathe(basketRuns(lod), { seg, zc: 0 }).rotateX(Math.PI / 2) };
    const circ = (r, y, n = 48) => Array.from({ length: n }, (_, i) => new THREE.Vector3(Math.cos(TAU * i / n) * r, y, Math.sin(TAU * i / n) * r));
    G.border = lod === 'hd' ? twisted(circ(WK_R - 0.004, WK_H - 0.004), 3, 0.0055, 0.0075, 22, 6, true) : new THREE.TorusGeometry(WK_R - 0.004, 0.012, 6, 32).rotateX(Math.PI / 2).translate(0, WK_H - 0.004, 0);
    const handle = (sx) => { const pts = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push(new THREE.Vector3(sx * (WK_R + 0.004 + 0.032 * Math.sin(a)), WK_H - 0.09 + 0.012 * Math.sin(a), 0.055 * Math.cos(a))); } return pts; };
    G.handles = mergeHD([twisted(handle(1), 2, 0.004, 0.0045, 4, 5), twisted(handle(-1), 2, 0.004, 0.0045, 4, 5)]);
    // the support block: a turned wooden disc with a conical seat for the ogive (estimate)
    G.block = lathe([R([[0, 0], [0, 0.1]], { uv: (s, r, u) => [u * 3, r * 4] }), hard([[0, 0.1], [0.06, 0.1]], { uv: (s, r, u) => [u * 3, s * 4] }), hard([[0.06, 0.1], [0.06, 0.07], [0.03, 0.035], [0.03, 0]], { uv: (s, r, u) => [u * 3, r * 4] })], { seg: Math.min(seg, 48), zc: 0 }).rotateX(Math.PI / 2).translate(0, 0.02, 0);
    G.lid = mergeHD([lathe([R([[0, 0], [0, WK_R + 0.008]], { uv: (s, r, u, c, sn) => [r * c / WT, r * sn / WT] }), hard([[0, WK_R + 0.008], [0.03, WK_R + 0.008]], { uv: wkUV }), hard([[0.03, WK_R + 0.008], [0.03, WK_R - 0.002], [0.004, WK_R - 0.002]], { uv: wkUV })], { seg, zc: 0 }).rotateX(-Math.PI / 2)]);
    basketCache.set(lod, G);
  }
  const g = new THREE.Group(), mk = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  g.name = 'basket';
  mk(G.body, M.wicker, 'basket-body'); mk(G.border, M.wicker, 'basket-border'); mk(G.handles, M.wicker, 'basket-handles'); mk(G.block, M.wood, 'basket-block');
  const content = new THREE.Object3D(); content.name = 'basket-content'; content.position.y = 0.08; g.add(content); g.content = content;
  if (lid) { const l = mk(G.lid, M.wicker, 'basket-lid'); l.position.y = WK_H + 0.03; g.lidMesh = l; }
  if (shell) {
    const s = gr18Prop({ lod, visible: true });
    s.rotation.set(-Math.PI / 2, 0, 0); // nose down
    s.position.y = 0.06 + GR.L / 2 - 0.035; content.add(s); g.shell = s;
  }
  g.userData = { ammo: 'basket', height: WK_H, radius: WK_R + 0.04 };
  return g;
}

// ---------------------------------------------------------------- timber and the tarpaulin

// a chamfered beam with metric UVs on the wood atlas (0.5 m by 0.25 m tile), the grain along its length axis
function beam(lx, ly, lz, c = 0.006) {
  const g = chamferBox(lx, ly, lz, c), p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  const ax = lx >= ly && lx >= lz ? 0 : lz >= ly ? 2 : 1, sh = (lx * 7.1 + lz * 3.3) % 1;
  for (let i = 0; i < p.count; i++) {
    const P = [p.getX(i), p.getY(i), p.getZ(i)], N = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
    const f = N[0] > N[1] && N[0] > N[2] ? 0 : N[1] > N[2] ? 1 : 2, o = [0, 1, 2].filter((k) => k !== f);
    let u, v;
    if (f === ax) { u = P[o[0]] / 0.5 + 0.37; v = P[o[1]] / 0.25 + 0.61; } // the end grain: across the tile
    else { const other = o.find((k) => k !== ax); u = P[ax] / 0.5 + sh; v = P[other] / 0.25 + f * 0.31; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * A tarpaulin draped by a short cloth simulation (Verlet, distance constraints, collisions with `solids`): a sheet of
 * w by d metres at height y0 over (cx, cz), cells of `cell` m. solids: [{ type: 'cyl', a: [x, y, z], b: [x, y, z], r },
 * { type: 'box', min: [], max: [] }]; the ground at y = 0 with friction. fold: { x } a line along Z where the sheet is
 * drawn back on itself (the near side rolled into a bundle). Returns a BufferGeometry (both sides drawn). Node-safe and
 * deterministic.
 */
const tarpCache = new Map();
export function drapeTarp(o = {}) {
  const key = JSON.stringify({ ...o, pin: String(o.pin) });
  if (!tarpCache.has(key)) tarpCache.set(key, drape(o));
  return tarpCache.get(key);
}
function drape({ w, d, cx, cz, y0, cell = 0.04, solids = [], iters = 260, pin = null, seed = 5 } = {}) {
  const nx = Math.round(w / cell) + 1, nz = Math.round(d / cell) + 1, N = nx * nz;
  const P = new Float32Array(N * 3), O = new Float32Array(N * 3);
  let rs = seed;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3;
    P[k] = cx - w / 2 + i * cell; P[k + 1] = y0 + rnd() * 0.004; P[k + 2] = cz - d / 2 + j * cell;
    O[k] = P[k]; O[k + 1] = P[k + 1]; O[k + 2] = P[k + 2];
  }
  // the pinned particles (the edge under the roll): they never move, the constraints pull only their neighbours
  const fixed = new Uint8Array(N);
  if (pin) for (let a = 0; a < N; a++) fixed[a] = pin(P[a * 3], P[a * 3 + 2]) ? 1 : 0;
  const C = [];
  const add = (a, b) => C.push(a, b, Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * nx + i;
    if (i < nx - 1) add(a, a + 1);
    if (j < nz - 1) add(a, a + nx);
    if (i < nx - 1 && j < nz - 1) { add(a, a + nx + 1); add(a + 1, a + nx); }
    if (i < nx - 2) add(a, a + 2);
    if (j < nz - 2) add(a, a + 2 * nx);
  }
  const collide = (k) => {
    let x = P[k], y = P[k + 1], z = P[k + 2];
    const th = 0.006;
    for (const s of solids) {
      if (s.type === 'cyl') {
        // a cylinder from a to b (the shells lying along Z, the rolled bundle)
        const ax = s.a, bx = s.b, dx = bx[0] - ax[0], dy = bx[1] - ax[1], dz = bx[2] - ax[2], L2 = dx * dx + dy * dy + dz * dz;
        let t = ((x - ax[0]) * dx + (y - ax[1]) * dy + (z - ax[2]) * dz) / L2;
        if (t < -0.02 || t > 1.02) continue;
        t = Math.max(0, Math.min(1, t));
        const qx = ax[0] + dx * t, qy = ax[1] + dy * t, qz = ax[2] + dz * t, ex = x - qx, ey = y - qy, ez = z - qz, e = Math.hypot(ex, ey, ez), rr = s.r + th;
        if (e < rr && e > 1e-6) { x = qx + ex / e * rr; y = qy + ey / e * rr; z = qz + ez / e * rr; O[k] = O[k] * 0.4 + x * 0.6; O[k + 1] = O[k + 1] * 0.4 + y * 0.6; O[k + 2] = O[k + 2] * 0.4 + z * 0.6; } // (canvas on painted steel: friction)
      } else {
        const m = s.min, M = s.max;
        if (x > m[0] - th && x < M[0] + th && y > m[1] - th && y < M[1] + th && z > m[2] - th && z < M[2] + th) {
          // out by the nearest face (the top for anything near it)
          const dTop = M[1] + th - y, dX0 = x - (m[0] - th), dX1 = M[0] + th - x, dZ0 = z - (m[2] - th), dZ1 = M[2] + th - z, mn = Math.min(dTop, dX0, dX1, dZ0, dZ1);
          if (mn === dTop) y = M[1] + th; else if (mn === dX0) x = m[0] - th; else if (mn === dX1) x = M[0] + th; else if (mn === dZ0) z = m[2] - th; else z = M[2] + th;
        }
      }
    }
    if (y < th) { y = th; O[k] = P[k] * 0.5 + O[k] * 0.5; O[k + 2] = P[k + 2] * 0.5 + O[k + 2] * 0.5; } // the ground holds it
    P[k] = x; P[k + 1] = y; P[k + 2] = z;
  };
  const g9 = 9.81 * (1 / 60) ** 2;
  for (let it = 0; it < iters; it++) {
    for (let a = 0; a < N; a++) {
      const k = a * 3;
      if (fixed[a]) continue;
      const vx = (P[k] - O[k]) * 0.985, vy = (P[k + 1] - O[k + 1]) * 0.985, vz = (P[k + 2] - O[k + 2]) * 0.985;
      O[k] = P[k]; O[k + 1] = P[k + 1]; O[k + 2] = P[k + 2];
      P[k] += vx; P[k + 1] += vy - g9; P[k + 2] += vz;
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let c = 0; c < C.length; c += 3) {
        const ia = C[c], ib = C[c + 1], a = ia * 3, b = ib * 3, L = C[c + 2], wa = fixed[ia] ? 0 : 1, wb = fixed[ib] ? 0 : 1;
        if (!wa && !wb) continue;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], e = Math.hypot(dx, dy, dz) || 1e-9, f = (e - L) / e / (wa + wb);
        if (e < L * 0.9 || e > L) { P[a] += dx * f * wa; P[a + 1] += dy * f * wa; P[a + 2] += dz * f * wa; P[b] -= dx * f * wb; P[b + 1] -= dy * f * wb; P[b + 2] -= dz * f * wb; }
      }
      for (let a = 0; a < N; a++) if (!fixed[a]) collide(a * 3);
    }
  }
  // the mesh: positions, UVs in metres over the tarp atlas's 0.25 m tile
  const idx = [], uv = new Float32Array(N * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * nx + i; uv[a * 2] = (i * cell) / 0.25; uv[a * 2 + 1] = (j * cell) / 0.25; }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- the ready ammunition at a gun

// Where things lie (rest root space of the Mörser 18's rig, metres; +X right of the gun, +Z behind it). The anchors
// come from the rig (anchors.shellStack, the ammo2 man's post) so the group follows them; LAYOUT holds the offsets.
// The pair takes each round off the dunnage where the drill has always picked it up (crews.js: the anchor's x, 0.2 m
// up, 0.2 m behind it, lying along Z nose forward): that place is `pick`. The stock lies beyond it on the side away from
// the gun, out of the pair's and the ammunition men's ways (measured with the routes: shots/maxq/ammo/routes.md).
// Measured (shots/maxq/ammo/routes.md, the hero drill in all five traverse scenarios): the carrying pair stands astride the
// pick round and walks round it out to x 4.4; ammo2 goes west from his post along z 5.0; ammo1 runs a diagonal near x 4.8
// from z 1 to 3.2. So the pick round lies on two narrow blocks (no baulks where the pair's feet go), the stock starts
// 1.6 m out (its baulks from x 4.75), the baskets lie ahead of it (z 2.8, x 5.2 and more), and the containers stand in
// a row behind ammo2's open one, 0.64 m in front of him (he faces +X, crouching; his foot comes to x 4.94).
export const LAYOUT = {
  pickDz: 0.2, pickY: 0.2, // the pick place from the anchor (crews.js pairMan: S.z + 0.2, 0.2 + the radius)
  stack: { dx: 1.6, dz: 0.2, pitch: 0.245, lower: 4, upper: 3 }, // the stack's first shell from the anchor; shells side by side across X
  baskets: [[1.95, 0, -0.95, 0.3], [2.3, 0, -1.07, 1.4], [2.95, 0, -0.98, 'lying']], // [dx, dy, dz, yaw | 'lying'] from the anchor
  cans: { dx: 0.64, dz: 0, pitch: 0.3, n: 5, open: 0 }, // from ammo2's post: the open one in front of him, the rest behind it (+Z)
};
// The same inside the Mörser 18's pit in the game (models/v/de/gun_sites.js buildGermanGunSite, heavy: the right-hand
// plank wall's posts stand at x 5.01 to 5.15, the berm beyond): everything at x 4.95 or less, in rest root space. The pick
// round stays where the pair has always taken it; the stock lies along the wall behind the charge point (z 6.8 to 7.9),
// the empty baskets west of it, the containers in a block of four behind ammo2's post (he kneels at his post facing
// them, +Z: the open one 0.62 m behind his post, the surplus increments laid on the shut one to its west), and the
// spent cases stand in two rows of six north of ammo1's post (z 1.36 and 1.62), the far row first. Measured against
// the hero drill's routes and the carriage swept over its traverse (shots/maxq/ammo/drill/notes.md): clear of the steel
// to 0.52 rad either way (the drill's pick place, from before, is under the trail's rear beyond 0.4).
export const LAYOUT_PIT = {
  pickDz: 0.2, pickY: 0.2,
  stack: { at: [3.92, 7.32], pitch: 0.245, lower: 4, upper: 3 },
  tarp: { w: 0.82, d: 1.16 },
  baskets: [[3.41, 0, 6.72, 0.3, 'abs'], [3.38, 0, 7.07, 1.4, 'abs'], [3.5, 0, 8.32, 'lying', 'abs']],
  cans: { at: [[4.62, 5.62], [4.3, 5.62], [4.62, 5.94], [4.3, 5.94]], open: 0, spare: 1, yaw: Math.PI },
  row: { x0: 3.35, z0: 1.36, dx: 0.26, dz: 0.26, per: 6, rows: 2 },
};

/**
 * The ready ammunition of one hero gun, a Group to add to rig.root (not rig.body: the kick must not move it), named
 * 'shell-ready' and tagged userData.tier 'hd' and hdGun (the crew field, crewcheck's steel and applyMaxq leave it out,
 * so the men's routes are exactly as before). Returns
 *   { group, pick, spare, stock, setRounds(n), showPick(on), cans: [...], open: the open can, charge: the case in it,
 *     caseSpot(i, out?), caseSlots, solids: [{ type: 'box', min: [x, y, z], max: [...] , what }] (root space, for
 *     clearance checks), materials }
 * pick: an Object3D where the next round lies for the pair (its rotation the shell's: nose -Z); the group's own pick
 * shell is hidden with showPick(false) while the drill draws its own there. setRounds(n): how many rounds are left in
 * the stack (0 to stack.lower + stack.upper; the upper tier goes first). spare: an Object3D on the next container's shut lid
 * where removed increments can be laid. opts: { seed, lod = 'lod', rounds, fuzed = true }.
 */
export function buildReadyAmmo(rig, { seed = 1, lod = 'lod', rounds, fuzed = true, layout = LAYOUT } = {}) {
  const M = ammoMaterials(), L = layout;
  const g = new THREE.Group();
  g.name = 'shell-ready'; g.userData.tier = 'hd'; g.userData.hdGun = true;
  let rs = (seed * 9301 + 49297) % 233280;
  const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
  const S = rig?.anchors?.shellStack?.position ?? new THREE.Vector3(3.4, 0.15, 3.8);
  const am2 = rig?.anchors?.crew?.find?.((c) => c.role === 'ammo2') ?? { x: 4.5, z: 5.0 };
  const solids = [], box = (what, x0, y0, z0, x1, y1, z1) => solids.push({ type: 'box', what, min: [x0, y0, z0], max: [x1, y1, z1] });
  const wood = [], woodAt = (lx, ly, lz, x, y, z, ry = 0, what = 'wood') => {
    const b = beam(lx, ly, lz); b.rotateY(ry); b.translate(x, y, z); wood.push(b);
    const hx = Math.abs(Math.cos(ry)) * lx / 2 + Math.abs(Math.sin(ry)) * lz / 2, hz = Math.abs(Math.sin(ry)) * lx / 2 + Math.abs(Math.cos(ry)) * lz / 2;
    box(what, x - hx, y - ly / 2, z - hz, x + hx, y + ly / 2, z + hz);
  };

  // ---- the pick place: two short baulks across X under the round, 0.2 m up (20 cm squared timber)
  const px = S.x, pz = S.z + L.pickDz, sr = GR.R;
  const pick = new THREE.Object3D(); pick.name = 'ready-pick'; pick.position.set(px, L.pickY + sr, pz); g.add(pick);
  // (two blocks 12 cm square under the body, 0.32 m apart: the pair waits with their feet beside the round and, once it
  // has gone, where it lay, so nothing wider or further out)
  for (const dz of [-0.16, 0.16]) woodAt(0.12, L.pickY, 0.12, px, L.pickY / 2, pz + dz, 0, 'pick block');
  // ---- the stack: two long baulks (planks under them) across X beyond the pick, the lower tier lying on them along Z
  // nose forward, chocked at the ends; the upper tier on two battens laid across the lower tier, in its hollows
  const st = L.stack, nL = st.lower, nU = st.upper, sx0 = st.at ? st.at[0] : px + st.dx, sz = st.at ? st.at[1] : S.z + st.dz, bh = 0.12;
  const baulkLen = (nL - 1) * st.pitch + 0.5, bx = sx0 + (nL - 1) * st.pitch / 2;
  for (const dz of [-0.24, 0.24]) { woodAt(baulkLen + 0.1, 0.03, 0.22, bx, 0.015, sz + dz, 0, 'plank'); woodAt(baulkLen, bh, 0.15, bx, 0.03 + bh / 2, sz + dz, 0, 'baulk'); }
  for (const dz of [-0.24, 0.24]) for (const sgn of [-1, 1]) {
    // wedges at both ends of each baulk (a chock is a short beam turned 45 degrees: near enough at this size)
    const w = beam(0.08, 0.06, 0.12), wx = bx + sgn * (baulkLen / 2 - 0.06), wy = 0.03 + bh + 0.025;
    w.rotateZ(sgn * 0.5); w.translate(wx, wy, sz + dz); wood.push(w);
    box('chock', wx - 0.06, wy - 0.045, sz + dz - 0.065, wx + 0.06, wy + 0.045, sz + dz + 0.065);
  }
  const yL = 0.03 + bh + sr; // the lower tier's axis height
  const yU = yL + Math.sqrt(Math.max(0, (2 * sr + 0.03) ** 2 - (st.pitch / 2) ** 2)); // nested in the hollows (on 25 mm battens)
  for (const dz of [-0.3, 0.3]) woodAt((nL - 1) * st.pitch + 0.3, 0.025, 0.07, bx, yL + sr + 0.0125, sz + dz, 0, 'batten');
  const places = [];
  for (let i = 0; i < nL; i++) places.push([sx0 + i * st.pitch, yL, sz]);
  for (let i = 0; i < nU; i++) places.push([sx0 + (i + 0.5) * st.pitch, yU, sz]);
  box('stack', sx0 - sr, 0, sz - GR.L / 2, sx0 + (nL - 1) * st.pitch + sr, yU + sr, sz + GR.L / 2);
  // the rounds, instanced per part (body, bands, fuze and head merged with the head at OV), each turned at random about
  // its axis and a hair off true, with its own tone of the olive
  const b = buildGr18({ lod }), n = 1 + places.length;
  const fz = fuzed ? mergeHD([b.parts[2].geometry, b.head.geometry]) : null;
  const parts = [[b.parts[0].geometry, b.parts[0].material, 'ready-body'], [b.parts[1].geometry, b.parts[1].material, 'ready-bands']];
  if (fz) parts.push([fz, M.fuze, 'ready-fuze']);
  const inst = parts.map(([geo, mat, name]) => { const m = new THREE.InstancedMesh(geo, mat, n); m.name = name; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; g.add(m); return m; });
  const mats = [], q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const all = [[px, L.pickY + sr, pz], ...places];
  all.forEach((p, i) => {
    q.setFromEuler(e.set((rnd() - 0.5) * 0.01, (rnd() - 0.5) * (i ? 0.03 : 0), rnd() * TAU, 'YXZ'));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2] + (i ? (rnd() - 0.5) * 0.03 : 0)), q, one);
    mats.push(m);
    const t = 0.94 + rnd() * 0.1;
    col.setRGB(t, t * (0.98 + rnd() * 0.04), t * (0.96 + rnd() * 0.06));
    inst.forEach((im, k) => { im.setMatrixAt(i, m); im.setColorAt(i, k === 0 ? col : col.setRGB(1, 1, 1)); });
  });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let left = places.length, pickOn = true;
  const apply = () => {
    for (const im of inst) {
      im.setMatrixAt(0, pickOn ? mats[0] : zero);
      // the stock: the lower tier fills places 1..nL, the upper nL+1..; the upper tier is used first
      for (let i = 0; i < places.length; i++) {
        const keep = i < nL ? i < Math.min(nL, left) : i - nL < left - nL;
        im.setMatrixAt(i + 1, keep ? mats[i + 1] : zero);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  };
  // ---- the tarpaulin, drawn halfway: over the upper tier and down the far side and the back, the near half rolled back
  const shellSolids = places.map((p) => ({ type: 'cyl', a: [p[0], p[1], p[2] - GR.L / 2 + 0.03], b: [p[0], p[1], p[2] + GR.L / 2], r: sr + 0.004 }));
  const rollX = sx0 + st.pitch * 0.9, rollY = yU + sr + 0.05;
  const tarpW = L.tarp?.w ?? 1.35, tarpD = L.tarp?.d ?? 1.2, tcx = rollX + tarpW / 2 - 0.08;
  const tarp = drapeTarp({
    w: tarpW, d: tarpD, cx: tcx, cz: sz + 0.08, y0: yU + sr + 0.06, cell: lod === 'hd' ? 0.03 : 0.04, seed: 7,
    // (the boxes grown by 2 cm for the cloth: the triangles between its particles cut a box's corners, and the planks'
    // ends and the chocks showed through)
    solids: [...shellSolids, ...solids.filter((s) => ['baulk', 'batten', 'chock', 'plank'].includes(s.what) && s.min[0] > sx0 - 0.6).map((s) => ({ ...s, min: s.min.map((v) => v - 0.02), max: s.max.map((v) => v + 0.02) }))],
    // the near edge held by the roll lying on top
    pin: (x) => x < rollX + 0.02,
  });
  const tm = new THREE.Mesh(tarp, M.tarp); tm.name = 'ready-tarp'; tm.castShadow = tm.receiveShadow = true; g.add(tm);
  // the rolled-back half: a lumpy roll along Z on top of the stack
  const rollPts = [];
  for (let k = 0; k <= 14; k++) { const t = k / 14; rollPts.push(new THREE.Vector3(rollX + Math.sin(t * 7.3) * 0.012, rollY + Math.sin(t * 5.1 + 1) * 0.008, sz + 0.08 - tarpD / 2 + t * tarpD)); }
  const roll = mergeHD([tubeAlong(rollPts, 0.05, { seg: 14, per: 0.03 }), tubeAlong(rollPts.map((p) => p.clone().add(new THREE.Vector3(0.035, -0.01, 0))), 0.035, { seg: 10, per: 0.03 })]);
  const rm = new THREE.Mesh(roll, M.tarp); rm.name = 'ready-tarp-roll'; rm.castShadow = rm.receiveShadow = true; g.add(rm);
  // the stack's footprint with the tarp hanging off it
  box('tarp', rollX - 0.1, 0, sz + 0.08 - tarpD / 2, tcx + tarpW / 2, yU + sr + 0.1, sz + 0.08 + tarpD / 2);
  // ---- the empty baskets: one standing, one beside it, one lying on its side with its lid by it
  for (const [dx0, dy, dz0, yaw, abs] of L.baskets) {
    // (abs: the place in root space, not from the anchor: LAYOUT_PIT)
    const dx = abs ? dx0 - S.x : dx0, dz = abs ? dz0 - S.z : dz0;
    const k = basket({ lod: lod === 'hd' ? 'hd' : 'lod', lid: false });
    if (yaw === 'lying') { k.rotation.set(0, 0.4 + rnd() * 0.3, Math.PI / 2); k.position.set(S.x + dx, WK_R + 0.006, S.z + dz); }
    else { k.rotation.y = yaw; k.position.set(S.x + dx, dy, S.z + dz); }
    g.add(k);
    const r = WK_R + 0.03;
    if (yaw === 'lying') box('basket', S.x + dx - WK_H / 2 - 0.05, 0, S.z + dz - WK_H / 2 - 0.05, S.x + dx + WK_H / 2 + 0.05, 2 * r, S.z + dz + WK_H / 2 + 0.05);
    else box('basket', S.x + dx - r, 0, S.z + dz - r, S.x + dx + r, WK_H + 0.02, S.z + dz + r);
  }
  // ---- the charge point: the containers in a row on two planks in front of ammo2's post, the nearest open, its cased
  // charge standing in it (the cup still in, the label up)
  const C = L.cans, cx = am2.x + C.dx, cans = [], zm = am2.z + C.dz + C.pitch * (C.n - 1) / 2;
  if (C.at) {
    // (LAYOUT_PIT: the containers at their own places, two planks under each row of them along X)
    const rows = new Map();
    for (const [x, z] of C.at) { const r = rows.get(z) ?? [x, x]; r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); rows.set(z, r); }
    for (const [z, [x0, x1]] of rows) for (const dz of [-0.07, 0.07]) woodAt(x1 - x0 + 0.36, 0.03, 0.12, (x0 + x1) / 2, 0.015, z + dz, 0, 'plank');
  } else {
    woodAt(0.2, 0.03, C.pitch * (C.n - 1) + 0.4, cx - 0.07, 0.015, zm, 0, 'plank');
    woodAt(0.2, 0.03, C.pitch * (C.n - 1) + 0.4, cx + 0.12, 0.015, zm, 0, 'plank');
  }
  const nCan = C.at ? C.at.length : C.n;
  for (let i = 0; i < nCan; i++) {
    const open = i === C.open, c = canister({ lod: lod === 'hd' ? 'hd' : 'lod', open: open ? 1 : 0, charge: open });
    const x = C.at ? C.at[i][0] : cx, z = C.at ? C.at[i][1] : am2.z + C.dz + i * C.pitch;
    c.position.set(x + (rnd() - 0.5) * 0.02, 0.03, z);
    // the stencils toward the gun's side (-X), the hinge away from ammo2 so the lid opens toward him (LAYOUT_PIT: C.yaw,
    // the open one turned so its hinge is away from him and its clamp to his hand)
    c.rotation.y = (C.yaw ?? -Math.PI / 2) + (open && C.at ? 0 : (rnd() - 0.5) * 0.3);
    g.add(c); cans.push(c);
    box('can', x - 0.15, 0, z - 0.15, x + 0.15, CAN_H + 0.06, z + 0.15);
  }
  // ---- where the spent cases go: standing on their heads in two rows of six beside the containers, on the side away
  // from ammo2 (the gun's side is his way out), 0.26 m apart (the rim is 241 mm). German orders were to return the
  // empties with their packing (Tactical and Technical Trends no. 7, 1942, about small arms; for artillery low): a row by
  // the empty containers instead of a loose heap (research 3.1.8). The drill stands case i at caseSpot(i).
  const rowX = cx + 0.4, rowZ0 = am2.z + C.dz - 0.02, ROW = L.row?.per ?? 6, CASES = L.row ? L.row.per * L.row.rows : 12;
  // (LAYOUT_PIT: rows along X from (x0, z0), the next row dz further on)
  const caseSpot = L.row ? (i, out = new THREE.Vector3()) => out.set(L.row.x0 + (i % ROW) * L.row.dx, CL / 2, L.row.z0 + Math.floor(i / ROW) * L.row.dz)
    : (i, out = new THREE.Vector3()) => out.set(rowX + Math.floor(i / ROW) * 0.27, CL / 2, rowZ0 + (i % ROW) * 0.26);
  if (L.row) box('case row', L.row.x0 - 0.13, 0, L.row.z0 - 0.13, L.row.x0 + (ROW - 1) * L.row.dx + 0.13, CL + 0.01, L.row.z0 + (L.row.rows - 1) * L.row.dz + 0.13);
  else box('case row', rowX - 0.13, 0, rowZ0 - 0.13, rowX + 0.27 + 0.13, CL + 0.01, rowZ0 + (ROW - 1) * 0.26 + 0.13);
  // the shut containers and the baskets drawn instanced, one draw per part (their groups stay as placeholders: positions,
  // nodes; their meshes hidden): about 25 draws for the group instead of 65
  instanceLike(cans.filter((c, i) => i !== C.open), g, 'ready-can');
  instanceLike(g.children.filter((o) => o.name === 'basket'), g, 'ready-basket');
  const wg = mergeHD(wood), wm = new THREE.Mesh(wg, M.wood); wm.name = 'ready-timber'; wm.castShadow = wm.receiveShadow = true; g.add(wm);
  // where the drill lays the increments it takes out for a lower charge: on the shut lid of the next container (the
  // ground by ammo2's post is his way out; estimate)
  const spare = new THREE.Object3D(); spare.name = 'ready-spare';
  const nx = cans[C.spare ?? C.open + 1] ?? cans[C.open - 1];
  if (nx) spare.position.set(nx.position.x, nx.position.y + CAN_H + 0.028, nx.position.z);
  g.add(spare);
  const ready = {
    group: g, pick, spare, cans, open: cans[C.open], charge: cans[C.open]?.charge ?? null, solids, materials: M,
    stock: places.length,
    // spent cases: caseSpot(i, out?) the centre of the i-th place (0 to caseSlots - 1; root space, the case standing
    // mouth up: rotation.x = PI / 2 for a case6351 or caseParts, whose mouth is at -Z); beyond 12 the places repeat
    caseSpot: (i, out) => caseSpot(((i % CASES) + CASES) % CASES, out), caseSlots: CASES,
    setRounds(nr) { left = Math.max(0, Math.min(places.length, nr | 0)); apply(); },
    showPick(on) { pickOn = !!on; apply(); },
  };
  ready.setRounds(rounds ?? places.length);
  g.userData.ready = ready;
  return ready;
}

// Several copies of one prop (the same meshes in the same order) drawn as one InstancedMesh per mesh; the copies stay in
// place with their meshes hidden.
function instanceLike(list, parent, name) {
  if (!list.length) return [];
  const meshesOf = (o) => { const out = []; o.traverse((m) => { if (m.isMesh) out.push(m); }); return out; };
  parent.updateMatrixWorld(true);
  const per = list.map(meshesOf), inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), m4 = new THREE.Matrix4(), out = [];
  per[0].forEach((m0, k) => {
    const im = new THREE.InstancedMesh(m0.geometry, m0.material, list.length);
    im.name = name + '-' + m0.name; im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    for (let i = 0; i < list.length; i++) { const m = per[i][k]; im.setMatrixAt(i, m4.multiplyMatrices(inv, m.matrixWorld)); m.visible = false; }
    parent.add(im); out.push(im);
  });
  return out;
}

/** Every geometry and material the hero ammunition uses, built now (for a loading step before the warm-up). */
export function prebuildAmmo() {
  ammoMaterials();
  for (const lod of ['hd', 'lod', 'flight']) buildGr18({ lod });
  case6351({ lod: 'hd' }); case6351({ lod: 'hd', spent: true }); case6351({ lod: 'lod' }); canister({ lod: 'lod' }); basket({ lod: 'lod' });
}

// the atlases' size and state, for the callers that decide them (render/crews_ammo.js, render/guns.js)
export { ammoTexScale, ammoTexScaleNow, atlasesReady } from './ammo_tex.js';

let pending = null;
/**
 * prebuildAmmo with the atlases drawn in a module worker (models/ammoTexWorker.js) while the page loads: the drawing
 * took about 5 s of main thread under SwiftShader (the shell's 2048 px atlas alone 2.9 s). Resolves { ms, how } once the
 * materials and geometry are ready: how 'worker', or 'main' (no Worker or OffscreenCanvas, the worker failed or took
 * longer than `timeout` ms; the atlases are then drawn here as before). Call ammoTexScale first for a lean page. Safe
 * to call more than once; ammoMaterials() called meanwhile still works (it draws here, and the worker's copy is dropped).
 */
export function prebuildAmmoAsync({ timeout = 60000 } = {}) {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const t0 = performance.now();
    let w = null, timer = 0;
    const done = (how) => {
      clearTimeout(timer); try { w?.terminate(); } catch { /* gone */ }
      prebuildAmmo();
      resolve({ ms: Math.round(performance.now() - t0), how });
    };
    if (MATS || TX.atlasesReady() || !TX.canDraw() || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') { done('main'); return; }
    try { w = new Worker(new URL('./ammoTexWorker.js', import.meta.url), { type: 'module' }); } catch { done('main'); return; }
    timer = setTimeout(() => done('main (worker timed out)'), timeout);
    w.onmessage = (e) => {
      if (e.data?.out) TX.installAtlases(e.data.out);
      done(e.data?.out ? 'worker' : 'main (' + (e.data?.error ?? 'no atlases') + ')');
    };
    w.onerror = (e) => { e.preventDefault?.(); done('main (worker error)'); };
    w.postMessage({ id: 1, scale: TX.ammoTexScaleNow() });
  });
  return pending;
}

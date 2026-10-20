import * as THREE from 'three';
import { concreteTextures, grainTextures, woodTextures, projectUV, surfaceFinish, mergeAll, yTube, sphere, rbox } from '../../kit.js';
import { mulberry32 } from '../../../noise.js';
import { MM } from './missiles.js';

// Shared bits of the V-weapon launch sites (v1.js, v2.js): the site materials that the vehicle set lacks
// (concrete, brick, tarred roofing, sandbags, the frost on the oxygen tanks), meshes from the missiles' piece
// lists, and a few dressing helpers. The material keys here are added to the rig's material set so Parts can
// merge them like the others; they get metric box-projected UVs from addP().

let brickTex;
function brickTextures() {
  if (brickTex) return brickTex;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d'), rnd = mulberry32(19);
  // a 2 m tile: 8 bricks of 0.25 m across, 27 courses of 0.074 m (stretcher bond, the grey mortar showing)
  c.fillStyle = '#857b6e';
  c.fillRect(0, 0, S, S);
  const rows = 27, bw = S / 8, bh = S / rows;
  for (let r = 0; r < rows; r++) for (let i = -1; i < 9; i++) {
    const x = i * bw + (r % 2 ? bw / 2 : 0), y = r * bh, k = 0.75 + rnd() * 0.35;
    c.fillStyle = `rgb(${Math.round(138 * k)}, ${Math.round(72 * k)}, ${Math.round(52 * k)})`;
    c.fillRect(x + 2, y + 2, bw - 4, bh - 3);
  }
  for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(30, 24, 18, ${rnd() * 0.18})`; c.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 6, 2 + rnd() * 3); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return (brickTex = t);
}

let shared;
// Materials shared by every site (cached). Every one reads the vertex colour (Parts' tint and dirt).
export function siteMats() {
  if (shared) return shared;
  const grain = grainTextures(), con = concreteTextures(0x8e8b82), wood = woodTextures();
  const std = (c, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, vertexColors: true, ...extra });
  const fin = (m, key, mud = 0.6, dust = 0.4) => { m.roughnessMap = m.roughnessMap || grain.rough; return surfaceFinish(m, 'vw-' + key, { mud, dust, mudTop: 0.8 }); };
  const concrete = std(0xffffff, 1, 0, { map: con.map, normalMap: con.normal, roughnessMap: con.rough });
  shared = {
    concrete: fin(concrete, 'concrete', 0.7, 0.3),
    brick: fin(std(0xffffff, 0.95, 0, { map: brickTextures(), normalMap: grain.normal }), 'brick', 0.5, 0.2),
    roof: fin(std(0x2c2b29, 0.9, 0.05), 'roof', 0.1, 0.15), // tarred felt on boards
    sandbag: fin(std(0x8c7f60, 1, 0, { normalMap: grain.normal }), 'sandbag', 0.6, 0.4),
    plank: fin(std(0xffffff, 0.95, 0, { map: wood.map, normalMap: wood.normal, roughnessMap: wood.rough }), 'plank', 0.8, 0.4),
    hose: std(0x1e1e1c, 0.7, 0.05), // rubber fuel hoses
    line: std(0xe8e4d0, 0.8, 0.0), // the painted alignment line
    lagging: fin(std(0x8f9286, 0.7, 0.3), 'lagging', 0.5, 0.4), // the oxygen trailer's insulated tank, aluminium paint
    foliage: cutaway(std(0x34442a, 0.95, 0.0), 'vw-foliage'), // the needles of the wood's conifers
    bark: cutaway(std(0x6a5a4a, 1, 0.0), 'vw-bark'),
  };
  return shared;
}

// The wood round a site is cut away between the camera and the unit it orbits, as the world's camouflage nets are:
// a wedge on the ground from the camera (a) to the focus (b), radius r (0 off), never past the focus. VCUT's uniforms are off
// until the game links them to the world's CUTAWAY (src/ww2/render.js; main sets those every frame), so the
// model viewers need no shader library. The patch chains under whatever the scene's fog patch sets later.
export const VCUT = { a: { value: new THREE.Vector3() }, b: { value: new THREE.Vector3() }, r: { value: 0 } };
function cutaway(mat, key) {
  let outer = null, outerKey = null;
  const patch = (shader) => {
    shader.uniforms.uCutA = VCUT.a;
    shader.uniforms.uCutB = VCUT.b;
    shader.uniforms.uCutR = VCUT.r;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCutW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform float uCutR;\nvarying vec3 vCutW;')
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      if ( uCutR > 0.0 ) {
        // on the ground plane, so a tree goes whole (no crown left floating over a cut trunk)
        vec2 ab = uCutB.xz - uCutA.xz, ap = vCutW.xz - uCutA.xz;
        float h = dot( ap, ab ) / max( dot( ab, ab ), 1e-3 );
        if ( h > 0.0 && h < 0.97 && length( ap - ab * h ) < uCutR * ( 0.45 + 0.9 * h ) ) discard;
      }`);
  };
  Object.defineProperty(mat, 'onBeforeCompile', {
    configurable: true,
    get: () => (shader, renderer) => { if (outer) outer(shader, renderer); patch(shader); },
    set: (f) => { outer = f; },
  });
  Object.defineProperty(mat, 'customProgramCacheKey', {
    configurable: true,
    get: () => () => (outerKey ? outerKey() : '') + '|' + key,
    set: (f) => { outerKey = f; },
  });
  return mat;
}

// Material keys that take metric box-projected UVs from addP (tile metres per key).
const UV = { concrete: 6, brick: 2, plank: 4, sandbag: 1.5, roof: 4, lagging: 4 };
// Parts.add with projected UVs for the site keys.
export function addP(P, key, g, o) {
  if (UV[key]) {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.normal) g.computeVertexNormals();
    projectUV(g, UV[key]);
    return P.add(key, g, { ...o, uv: true });
  }
  return P.add(key, g, o);
}

// The vehicle material set plus the site keys, so one Parts collector merges both.
export function withSiteMats(rig) {
  rig.mats = { ...rig.mats, ...siteMats() };
  return rig.mats;
}

// The attributes Parts gives its merged meshes (white vertex colour; aH, the height for the surface finish's mud
// line), for the few meshes built outside it (hoses, rams, cables).
export function paintable(g, h = 2) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(h), 1));
  return g;
}

// Meshes for a missile's piece lists (from missiles.js) under `parent`, one per material.
export function missileMeshes(parent, lists, mats = {}) {
  const out = [];
  for (const [key, list] of Object.entries(lists)) if (list.length) {
    const m = new THREE.Mesh(mergeAll(list), mats[key] || MM[key]());
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    out.push(m);
  }
  return out;
}

// A row of sandbags along a line from (x0, z0) to (x1, z1), `layers` high, bags 0.6 x 0.3 x 0.15 m.
export function sandbagWall(P, x0, z0, x1, z1, layers = 4, y = 0, seed = 5) {
  const rnd = mulberry32(seed), len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.58)), ry = Math.atan2(-(z1 - z0), x1 - x0);
  for (let l = 0; l < layers; l++) for (let i = 0; i < n - (l % 2); i++) {
    const t = (i + 0.5 + (l % 2) * 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    addP(P, 'sandbag', rbox(0.6, 0.15, 0.32, 0.06, x, y + 0.075 + l * 0.14, z, (rnd() - 0.5) * 0.08, ry + (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.08), { tint: rnd() < 0.3 ? 0xd8d0bc : 0xffffff });
  }
}

// A plain conifer (spruce or pine of the wood round a firing point): trunk and stacked cones.
export function conifer(P, x, z, h, rnd, ground = 0) {
  P.add('bark', yTube(ground, ground + h * 0.5, 0.26 * h / 18, 0.14 * h / 18, 7, x, z), { tint: 0x9a8a7a });
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y0 = h * (0.32 + i * 0.16), r = h * 0.2 * (1 - i / (n + 0.5)) * (0.9 + rnd() * 0.2);
    P.add('foliage', yTube(ground + y0, ground + y0 + h * 0.3, r, 0.02, 7, x, z), { tint: rnd() < 0.5 ? 0xffffff : 0xd0dcc8 });
  }
}

// An earth mound (a bunker's cover, a spoil heap) of a few squashed spheres.
export function mound(P, x, z, w, d, h, rnd, n = 5) {
  for (let i = 0; i < n; i++) P.add('soil', sphere(1, x + (rnd() - 0.5) * w * 0.5, 0, z + (rnd() - 0.5) * d * 0.5, w * (0.45 + rnd() * 0.2), h * (0.8 + rnd() * 0.3), d * (0.45 + rnd() * 0.2), 9));
}


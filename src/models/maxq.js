import * as THREE from 'three';
import { chainPatch, CAMO } from './kit.js';
import * as GL from './maxq_glsl.js';
import { edgeAttr } from './maxq_edges.js';

// Max-quality materials for a hero battery's guns (shots/maxq/PLAN.md 3.5): applyMaxq(rig, opts) swaps the rig's
// painted, black, bare-steel, rubber and soot materials for a per-rig set whose surface is worked out in the shader
// from rest rig space, so it is sharp at any distance and has no seams:
//   * the camouflage sprayed in patches or bands with soft edges, the paint's orange peel, grit and mottle
//     (micro-detail tiles rendered on the GPU, triplanar in each part's own space, at the device's full anisotropy);
//   * a baked ambient-occlusion field (a 3D texture in rest space, shared by both guns of a kind) that darkens the
//     crevices, the bore and the gaps, and tells the dust where the open sky is;
//   * chips through the coats (top coat, earlier coat, red primer, bare steel) on convex edges, found per triangle
//     from the merged geometry (exact signed distances to the nearest creases), and polished steel where hands, boots
//     and slides rub (contact hints: rig.wearHints or the kind's own list);
//   * soot at the muzzle that grows with the rounds fired (handle.update), a sooty rifled bore, oil at the glands,
//     dust on what faces up, mud thrown up from the ground.
// Nothing shared is changed: the standard materials and textures stay as they were (kept on mesh.userData.mqStd for
// restore()); mesh names, the color and aH attributes and the shadow flags are kept; geometry gets three attributes
// (aP rest position and part, aN rest normal, aEdge distances), computed once per kind and shared by both guns.
// No lights, no per-frame allocation: update() sets uniform values only. Works without shaderlib (the model viewer,
// the hangar); on a game page the fog, cloud shadow, flares and wetness chunks stay in place.

const KEY_KIND = { camo: 'PAINT', paint: 'PAINT', dark: 'BLACK', steel: 'STEEL', tyre: 'TYRE', rubber: 'RUBBER', char: 'CHAR' };
const PART = { traverse: 1, carriage: 2, elevation: 3, recoil: 4, breech: 5, loadTray: 6 };
// [roughness, metalness, dust, mud] and the base colour (linear) of each kind; PAINT's colours come from the scheme
const SURF = {
  PAINT: { s: [0.74, 0, 1, 1], base: [0.3, 0.3, 0.3], detail: 0.28 },
  BLACK: { s: [0.5, 0.05, 0.8, 0.9], base: [0.024, 0.025, 0.024], detail: 0.3 },
  STEEL: { s: [0.46, 1, 0.45, 0.6], base: [0.2, 0.198, 0.192], detail: 0.35 },
  TYRE: { s: [0.88, 0, 0.6, 1.25], base: [0.013, 0.013, 0.012], detail: 0.75 },
  RUBBER: { s: [0.88, 0, 0.4, 0.4], base: [0.016, 0.016, 0.015], detail: 0.6 },
  CHAR: { s: [0.95, 0, 0.3, 0.2], base: [0.008, 0.0075, 0.007], detail: 0.3 },
};
// the coat under the scheme (chips show it), and the style: 0 patches, 1 bands, 2 one colour
const UNDER = { upgreen: 0x9a8858, dgelb: 0x4a4d4b, feldgrau: 0x5a4436 };
const STYLE = { upgreen: 0, dgelb: 1, feldgrau: 2 };
const PRIMER = 0x6e3b2a;
const HINT_KIND = { grip: 0, boot: 1, slide: 2, oil: 3, soot: 4 };
const ALL = 63;
const SOOT0 = 0.38; // the gun has fired before the lesson
// The AO field is baked with the breech block shut, in rest space: a block slid out to load would keep the darkness of
// the slot it left (a black slab beside the ring). Its occlusion fades as it comes out (uMqBlockOut, set by update()
// from the block's pivot); every other part reads the field as before.
const BLOCK_AO = `if (abs(vMqP.w - 5.0) < 0.5 && uMqBlockOut > 0.0) { mqAO = mix(mqAO, max(mqAO, 0.85), uMqBlockOut); mqSky = mix(mqSky, max(mqSky, 0.6), uMqBlockOut); }
`;

// Contact hints for the Mörserlafette (k18.js constants, rest rig space) until the rig publishes rig.wearHints:
// the layer's and the traverser's handwheels, the jack cranks, the trail spike, the block's crank and the firing
// lever; boots on the walkways, the footplates and the deck; the top carriage's rails; oil at the recoil cylinder's
// gland, the breech ring's rear face, the trunnions, the hubs and the centre pivot.
const sym = (h) => [h, { ...h, p: [-h.p[0], h.p[1], h.p[2]], a: h.a && [-h.a[0], h.a[1], h.a[2]] }];
const CARRIAGE_HINTS = [
  ...sym({ kind: 'grip', p: [0.78, 1.8, 0.55], r: 0.24 }),
  ...sym({ kind: 'grip', p: [0.76, 1.2, -1.97], a: [0.96, 1.2, -2.07], r: 0.1 }),
  { kind: 'grip', p: [0.69, 0.84, 2.3], a: [0.69, 0.84, 4.25], r: 0.06 },
  { kind: 'grip', p: [0.262, 2.126, 1.85], a: [0.339, 2.237, 2.1], r: 0.06 },
  { kind: 'grip', p: [0.35, 2.448, 1.75], a: [0.4, 2.51, 1.88], r: 0.05 },
  ...sym({ kind: 'boot', p: [1.1, 1.1, 1.0], a: [1.1, 1.1, 4.7], r: 0.5, up: 0.6 }),
  ...sym({ kind: 'boot', p: [1.05, 0.68, 0.15], a: [1.05, 0.68, 0.9], r: 0.42, up: 0.6 }),
  { kind: 'boot', p: [0, 1.1, 3.3], a: [0, 1.1, 4.95], r: 0.6, up: 0.6 },
  ...sym({ kind: 'slide', p: [0.5, 1.06, -2.0], a: [0.5, 1.06, 4.9], r: 0.075, up: 0.6 }),
  { kind: 'oil', p: [0, 2.65, 0.95], r: 0.22 },
  { kind: 'oil', p: [0, 2.2, 1.78], r: 0.2 },
  ...sym({ kind: 'oil', p: [0.6, 2.2, 0.05], r: 0.26 }),
  ...sym({ kind: 'oil', p: [1.3, 0.84, -1.45], r: 0.2 }),
  { kind: 'oil', p: [0, 0.32, 0], r: 0.22 },
];
const KIND_HINTS = { mrs18: CARRIAGE_HINTS, k18: CARRIAGE_HINTS };

const byKind = new Map(); // kind -> { sig, attrs[], ao, stats }
const soups = new WeakMap(); // indexed geometry -> its triangle soup (the per-triangle edge distances need one)

// A triangle soup of an indexed geometry: the same triangles, attributes and bounds, built once (both guns share it).
// A mesh that shares its source with another mesh of the rig at a different place gets its own copy.
function soupOf(g, claimed, rest) {
  if (!g.index) return g;
  let c = soups.get(g);
  if (!c) {
    c = g.toNonIndexed();
    c.computeBoundingSphere();
    c.computeBoundingBox();
    c.userData = { ...g.userData, mqFrom: g };
    // a builder's note on what these materials do themselves (k18_hd.js userData.mqBake, the surface-nets forgings
    // and machined steel only): the occlusion baked into the colour comes out (the AO field takes its place, so the
    // hollows are not darkened twice), and a tint for steel lighter than SURF's
    const bk = g.userData.mqBake, col = c.attributes.color;
    if (bk && col) for (let i = 0, ix = g.index.array; i < ix.length; i++) {
      const k = (bk.tint ?? 1) / (bk.occ ? Math.max(0.05, bk.occ[ix[i]]) : 1);
      col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
    }
    soups.set(g, c);
  }
  const at = claimed.get(c);
  if (at && !at.equals(rest)) { c = c.clone(); c.userData = { ...g.userData, mqFrom: g }; }
  claimed.set(c, rest);
  return c;
}
const byRenderer = new WeakMap(); // renderer -> { tiles by tier }
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3();

// ---------------------------------------------------------------- rest space

// The rig's meshes with their keys, part ids and rest matrices (rig root frame, every pivot at rest: its rotation and
// scale left out, so the tray counts as hooked on and the barrel as level).
function restMeshes(rig, keyOf) {
  const pivots = new Set(Object.values(rig.pivots ?? {}));
  const partOf = new Map(Object.entries(rig.pivots ?? {}).map(([k, o]) => [o, PART[k] ?? 7]));
  const out = [];
  const walk = (o, M, part, skip) => {
    for (const c of o.children) {
      const L = new THREE.Matrix4();
      if (pivots.has(c)) L.makeTranslation(c.position.x, c.position.y, c.position.z);
      else { c.updateMatrix(); L.copy(c.matrix); }
      const W = M.clone().multiply(L);
      const p = partOf.get(c) ?? part;
      const sk = skip || /^(shell-|look-)/.test(c.name) || c.userData?.crew;
      if (c.isMesh && !sk) out.push({ mesh: c, key: keyOf(c.material), part: p, rest: W, tier: c.userData?.tier ?? null });
      walk(c, W, p, sk);
    }
  };
  walk(rig.root, new THREE.Matrix4(), 0, false);
  return out;
}

// the rest position of a node (an anchor) in the root frame
function restPoint(rig, node) {
  if (!node) return null;
  const pivots = new Set(Object.values(rig.pivots ?? {}));
  const chain = [];
  for (let o = node; o && o !== rig.root; o = o.parent) chain.push(o);
  const M = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = chain[i], L = new THREE.Matrix4();
    if (pivots.has(c)) L.makeTranslation(c.position.x, c.position.y, c.position.z);
    else { c.updateMatrix(); L.copy(c.matrix); }
    M.multiply(L);
  }
  return new THREE.Vector3().setFromMatrixPosition(M);
}

// aP (rest position, part id) and aN (rest normal) for one mesh
function restAttrs(geo, rest, part) {
  const p = geo.attributes.position, n = geo.attributes.normal, N = p.count;
  const aP = new Float32Array(N * 4), aN = new Float32Array(N * 3);
  _n3.getNormalMatrix(rest);
  for (let i = 0; i < N; i++) {
    _v.fromBufferAttribute(p, i).applyMatrix4(rest);
    aP[i * 4] = _v.x; aP[i * 4 + 1] = _v.y; aP[i * 4 + 2] = _v.z; aP[i * 4 + 3] = part;
    if (n) _v.fromBufferAttribute(n, i).applyMatrix3(_n3).normalize(); else _v.set(0, 1, 0);
    aN[i * 3] = _v.x; aN[i * 3 + 1] = _v.y; aN[i * 3 + 2] = _v.z;
  }
  return { aP: new THREE.BufferAttribute(aP, 4), aN: new THREE.BufferAttribute(aN, 3) };
}

// The edge analysis for the target meshes, in a module worker (copies of the positions and normals go over) or, without
// one, right here. Resolves to { out: [Float32Array per work item], stats }.
let worker = null, jobs = 0;
const waiting = new Map();
function edgesAsync(targets, work, sync) {
  const items = work.map((i) => {
    const g = targets[i].mesh.geometry;
    // (smooth: a surface-nets forging, whose facets are no edges: its curvature read from the field's normals)
    return { pos: g.attributes.position.array.slice(), nrm: g.attributes.normal?.array.slice() ?? null, n: g.attributes.position.count, smooth: !!g.userData.mqBake?.smooth };
  });
  const here = () => {
    const stats = { tris: 0, withEdges: 0, dropped: 0, segments: 0, buried: 0 }, t0 = performance.now();
    const out = items.map((it) => edgeAttr(it.pos, it.nrm, it.n, stats, it.smooth));
    stats.ms = performance.now() - t0;
    return { out, stats };
  };
  if (sync || typeof Worker === 'undefined') return Promise.resolve(here());
  try {
    if (!worker) {
      worker = new Worker(new URL('./maxq_edges.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); w?.resolve(e.data); };
      worker.onerror = (e) => { for (const w of waiting.values()) w.reject(e); waiting.clear(); worker = null; };
    }
    const id = ++jobs;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, items }, items.flatMap((it) => [it.pos.buffer, ...(it.nrm ? [it.nrm.buffer] : [])]));
    }).catch(() => here());
  } catch {
    return Promise.resolve(here());
  }
}

// ---------------------------------------------------------------- GPU passes

function saveState(renderer) {
  const c = new THREE.Color();
  renderer.getClearColor(c);
  return { rt: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(), c, a: renderer.getClearAlpha(), auto: renderer.autoClear, sh: renderer.shadowMap.needsUpdate, xr: renderer.xr?.enabled };
}
function restoreState(renderer, s) {
  renderer.setRenderTarget(s.rt, s.face, s.mip);
  renderer.setClearColor(s.c, s.a);
  renderer.autoClear = s.auto;
  renderer.shadowMap.needsUpdate = s.sh;
  if (renderer.xr && s.xr !== undefined) renderer.xr.enabled = s.xr;
}

const quadGeo = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
};

// The micro-detail tiles: paint, machined steel and rubber (normal xy, roughness, cavity) and the noise channels.
// Height first into a float target, then the normal from its neighbours, so each texel evaluates the height once.
function makeTiles(renderer, lean) {
  let cache = byRenderer.get(renderer);
  if (!cache) byRenderer.set(renderer, (cache = {}));
  const key = lean ? 'lean' : 'full';
  if (cache[key]) return cache[key];
  const t0 = performance.now();
  const st = saveState(renderer);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geo = quadGeo();
  const mesh = new THREE.Mesh(geo);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const final = (size) => {
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.NoColorSpace, anisotropy: aniso });
    rt.texture.anisotropy = aniso;
    return rt;
  };
  const run = (mat, rt) => { mesh.material = mat; renderer.setRenderTarget(rt); renderer.render(scene, cam); mat.dispose(); };
  const heightRT = (size) => new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  const tile = (define, size, strength) => {
    const rt = final(size);
    if (define === 'TILE_NOISE') {
      run(new THREE.ShaderMaterial({ vertexShader: GL.tileVert, fragmentShader: GL.tileNoiseFrag, depthTest: false, depthWrite: false }), rt);
      return rt;
    }
    // pass 1: the height into a float target; pass 2: the normal, roughness and cavity from it
    const h = heightRT(size);
    run(new THREE.ShaderMaterial({ vertexShader: GL.tileVert, fragmentShader: GL.tileHeightFrag, defines: { [define]: 1 }, uniforms: {}, depthTest: false, depthWrite: false }), h);
    run(new THREE.ShaderMaterial({ vertexShader: GL.tileVert, fragmentShader: GL.tileNormalFrag, uniforms: { uH: { value: h.texture }, uTexel: { value: 1 / size }, uStrength: { value: strength * size } }, depthTest: false, depthWrite: false }), rt);
    h.dispose();
    return rt;
  };
  const S = lean ? { paint: 1024, other: 512 } : { paint: 2048, other: 1024 };
  const out = {
    paint: tile('TILE_PAINT', S.paint, 0.0016).texture,
    steel: tile('TILE_STEEL', S.other, 0.0012).texture,
    rubber: tile('TILE_RUBBER', S.other, 0.003).texture,
    noise: tile('TILE_NOISE', S.other, 0).texture,
    ms: 0,
  };
  geo.dispose();
  restoreState(renderer, st);
  out.ms = performance.now() - t0;
  cache[key] = out;
  return out;
}

// The ambient-occlusion field: for a voxel grid over the rig's rest box, the share of directions open to the sky (R,
// over the whole sphere) and the open share of the upper hemisphere (G), from depth maps of the rig along N
// directions (orthographic, rest space). RG half floats, shared by both guns of a kind. No lights involved.
function bakeAO(renderer, entries, { cell, dirs, map, bias }) {
  if (!renderer.capabilities.isWebGL2 && renderer.capabilities.isWebGL2 !== undefined) return null;
  if (!renderer.extensions.has('EXT_color_buffer_float')) return null;
  const t0 = performance.now();
  const box = new THREE.Box3();
  const scene = new THREE.Scene();
  const depthMat = new THREE.ShaderMaterial({
    vertexShader: GL.aoDepthVert, fragmentShader: GL.aoDepthFrag, side: THREE.DoubleSide,
    uniforms: { uC: { value: new THREE.Vector3() }, uX: { value: new THREE.Vector3() }, uY: { value: new THREE.Vector3() }, uZ: { value: new THREE.Vector3() }, uR: { value: 1 } },
  });
  for (const e of entries) {
    const g = e.mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    box.union(g.boundingBox.clone().applyMatrix4(e.rest));
    const m = new THREE.Mesh(g, depthMat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(e.rest);
    m.frustumCulled = false;
    scene.add(m);
  }
  box.expandByScalar(0.15);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), R = size.length() / 2 + 0.05;
  const nx = Math.ceil(size.x / cell), ny = Math.ceil(size.y / cell), nz = Math.ceil(size.z / cell);
  const st = saveState(renderer);
  const depth = new THREE.WebGLArrayRenderTarget(map, map, 16, { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const field = new THREE.WebGL3DRenderTarget(nx, ny, nz, { type: THREE.HalfFloatType, format: THREE.RGFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: false });
  field.texture.wrapR = THREE.ClampToEdgeWrapping;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // directions: a Fibonacci sphere
  const D = [];
  let wG = 0;
  for (let i = 0; i < dirs; i++) {
    const y = 1 - (2 * (i + 0.5)) / dirs, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    const z = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize();
    const up = Math.abs(z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, z).normalize(), yy = new THREE.Vector3().crossVectors(z, x);
    D.push({ x, y: yy, z });
    wG += Math.max(0, z.y);
  }
  const quad = new THREE.Mesh(quadGeo(), null);
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);
  const U = {
    uDepth: { value: depth.texture }, uMin: { value: box.min.clone() }, uCell: { value: cell }, uSlice: { value: 0 }, uC: { value: c }, uR: { value: R }, uBias: { value: bias },
    uDX: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) }, uDY: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
    uDZ: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) }, uW: { value: Array.from({ length: 16 }, () => new THREE.Vector2()) }, uN: { value: 0 },
  };
  quad.material = new THREE.ShaderMaterial({ vertexShader: GL.quadVert, fragmentShader: GL.aoAccumFrag, uniforms: U, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation });
  renderer.autoClear = false;
  const far = new THREE.Color(2 * R + 10, 0, 0);
  for (let z = 0; z < nz; z++) { renderer.setRenderTarget(field, z); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); }
  depthMat.uniforms.uC.value.copy(c);
  depthMat.uniforms.uR.value = R;
  for (let b0 = 0; b0 < dirs; b0 += 16) {
    const n = Math.min(16, dirs - b0);
    for (let i = 0; i < n; i++) {
      const d = D[b0 + i];
      depthMat.uniforms.uX.value.copy(d.x); depthMat.uniforms.uY.value.copy(d.y); depthMat.uniforms.uZ.value.copy(d.z);
      renderer.setRenderTarget(depth, i);
      renderer.setClearColor(far, 1);
      renderer.clear(true, true, false);
      renderer.render(scene, cam);
      U.uDX.value[i].copy(d.x); U.uDY.value[i].copy(d.y); U.uDZ.value[i].copy(d.z);
      U.uW.value[i].set(1 / dirs, Math.max(0, d.z.y) / Math.max(wG, 1e-6));
    }
    U.uN.value = n;
    for (let z = 0; z < nz; z++) {
      U.uSlice.value = z;
      renderer.setRenderTarget(field, z);
      renderer.render(qScene, cam);
    }
  }
  restoreState(renderer, st);
  depth.dispose();
  depthMat.dispose();
  quad.material.dispose();
  quad.geometry.dispose();
  return { tex: field.texture, rt: field, min: box.min.clone(), inv: new THREE.Vector3(1 / (nx * cell), 1 / (ny * cell), 1 / (nz * cell)), dims: [nx, ny, nz], cell, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------- materials

const lin = (hex) => new THREE.Color(hex);
const linv = (a) => new THREE.Color().setRGB(a[0], a[1], a[2], THREE.LinearSRGBColorSpace);

function schemeOf(rig, opts, fromMat) {
  if (opts.scheme && CAMO[opts.scheme]) return opts.scheme;
  // the camo material's program key names its scheme ('veh-camo<scheme>', kit.js vehicleMats)
  const k = fromMat?.customProgramCacheKey?.() ?? '';
  const m = /veh-camo([a-z0-9]+)/i.exec(k);
  if (m && CAMO[m[1]]) return m[1];
  return rig.scheme && CAMO[rig.scheme] ? rig.scheme : 'dgelb';
}

function paintUniforms(U, scheme) {
  const c = CAMO[scheme]?.green ?? [0x5a5a4a, 0x5a5a4a, 0x5a5a4a];
  U.uMqC0.value.copy(lin(c[0])); U.uMqC1.value.copy(lin(c[1])); U.uMqC2.value.copy(lin(c[2]));
  U.uMqUnder.value.copy(lin(UNDER[scheme] ?? 0x6b6650));
  U.uMqStyle.value = STYLE[scheme] ?? (CAMO[scheme]?.disruptive ? 0 : 2);
}

function hintUniforms(hints) {
  const A = Array.from({ length: GL.HINTS }, () => new THREE.Vector4()), B = Array.from({ length: GL.HINTS }, () => new THREE.Vector4()), C = Array.from({ length: GL.HINTS }, () => new THREE.Vector4());
  let n = 0;
  for (const h of hints ?? []) {
    if (n >= GL.HINTS || !(h.kind in HINT_KIND) || !h.p) continue;
    const a = h.a ?? h.p;
    A[n].set(h.p[0], h.p[1], h.p[2], h.r ?? 0.1);
    B[n].set(a[0], a[1], a[2], HINT_KIND[h.kind]);
    // hands polish what they hold (black paint, steel, rubber), not the painted face behind it
    C[n].set(h.k ?? 1, h.up ?? -2, h.mats ?? (h.kind === 'grip' ? GL.KIND_BIT.BLACK | GL.KIND_BIT.STEEL | GL.KIND_BIT.RUBBER : ALL), 0);
    n++;
  }
  return { A, B, C, n };
}

export function applyMaxq(rig, opts = {}) {
  if (!rig?.root || !rig.mats || rig.maxq) return rig?.maxq ?? null;
  const { renderer = null, lean = false, seed = 0 } = opts;
  const kind = opts.kind ?? rig.kind ?? 'gun';
  const t0 = performance.now();
  // material -> key: the rig's own set and, after applyLook, the scheme's camo and paint that replaced them
  const keyOf = new Map();
  for (const [k, m] of Object.entries(rig.mats)) if (KEY_KIND[k] && m) keyOf.set(m, k);
  let camoNow = null;
  rig.root.traverse((o) => {
    if (!o.isMesh || keyOf.has(o.material) || !o.material?.customProgramCacheKey) return;
    const k = o.material.customProgramCacheKey?.() ?? '';
    if (/veh-camo/.test(k)) { keyOf.set(o.material, 'camo'); camoNow ??= o.material; }
    else if (/veh-paint/.test(k)) keyOf.set(o.material, 'paint');
  });
  const scheme = schemeOf(rig, opts, camoNow ?? rig.mats.camo);
  const entries = restMeshes(rig, (m) => keyOf.get(m) ?? null);
  const targets = entries.filter((e) => e.key && KEY_KIND[e.key]);
  if (!targets.length || !renderer) return null; // without a renderer there are no tiles: leave the standard look
  // indexed meshes (the HD tier, the struts) become triangle soups, kept for restore()
  const claimed = new Map();
  for (const e of targets) {
    const g = e.mesh.geometry, c = soupOf(g, claimed, e.rest);
    if (c !== g) { e.mesh.userData.mqGeo ??= g; e.mesh.geometry = c; }
  }
  // per kind: rest attributes and edge distances, built once (the second gun of the kind shares them)
  const sig = targets.map((e) => `${e.mesh.geometry.attributes.position.count}${e.tier ? e.tier[0] : ''}`).join(',');
  let K = byKind.get(kind);
  const tA = performance.now();
  if (!K || K.sig !== sig) {
    const attrs = targets.map((e) => {
      const g = e.mesh.geometry, r = restAttrs(g, e.rest, e.part);
      return { ...r, aEdge: new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(10), 4) };
    });
    K = { sig, attrs, ao: null, stats: null, analysisMs: performance.now() - tA };
    // the edge distances: in a worker when there is one (the guns show without chips for the moment it takes), else here
    // (only the painted and the black parts chip: steel, rubber and soot never read the distances)
    const work = targets.map((e, i) => (e.tier !== 'micro' && (KEY_KIND[e.key] === 'PAINT' || KEY_KIND[e.key] === 'BLACK') ? i : null)).filter((i) => i !== null);
    const fill = (out, stats) => {
      work.forEach((i, k) => { K.attrs[i].aEdge.array.set(out[k]); K.attrs[i].aEdge.needsUpdate = true; });
      K.stats = stats;
    };
    K.ready = edgesAsync(targets, work, opts.sync).then(({ out, stats }) => fill(out, stats)).catch((err) => console.warn('maxq: edge analysis failed', err));
    byKind.set(kind, K);
  }
  targets.forEach((e, i) => {
    const g = e.mesh.geometry, a = K.attrs[i];
    if (g.attributes.aP !== a.aP) { g.setAttribute('aP', a.aP); g.setAttribute('aN', a.aN); g.setAttribute('aEdge', a.aEdge); }
  });
  // the GPU parts: tiles per page, the AO field per kind
  const tiles = renderer ? makeTiles(renderer, lean) : null;
  // Low quality keeps the materials but not the AO field (PLAN 2)
  if (renderer && !K.ao && !K.aoFailed && opts.quality !== 'Low') {
    try {
      const occ = entries.filter((e) => e.mesh.visible !== false && e.tier !== 'micro' && e.part !== 6 && !(rig.hd && rig.std?.includes?.(e.mesh)));
      K.ao = bakeAO(renderer, occ, lean ? { cell: 0.045, dirs: 32, map: 512, bias: 0.03 } : { cell: 0.03, dirs: 96, map: 1024, bias: 0.018 });
      if (!K.ao) K.aoFailed = true;
    } catch (err) {
      console.warn('maxq: AO bake failed', err);
      K.aoFailed = true;
    }
  }
  // the bore and the muzzle (rest space), for the soot and the rifling
  const muzzle = restPoint(rig, rig.anchors?.muzzle) ?? new THREE.Vector3(0, 2, -5);
  const boreR = (rig.shell?.rad ?? 0.1) * 1.14 + 0.004;
  // per rig: the shared uniform values (one object each, so update() sets them for every material at once)
  const shared = {
    uMqSeed: { value: ((seed * 0.618034) % 1) * 97.0 + 3.0 },
    uMqWear: { value: 0.75 },
    uMqSoot: { value: SOOT0 },
    uMqHeat: { value: 0 },
    uMqBlockOut: { value: 0 },
    uMqTileK: { value: 2.0 },
    uMqBandDir: { value: new THREE.Vector3(0.32, 0.22, 1).normalize() },
    uMqBore: { value: new THREE.Vector4(muzzle.x, muzzle.y, boreR, 0) },
    uMqMuzzle: { value: new THREE.Vector4(muzzle.x, muzzle.y, muzzle.z, 0) },
    uMqAOMin: { value: new THREE.Vector4(0, 0, 0, 0) },
    uMqAOInv: { value: new THREE.Vector4(1, 1, 1, 0.045) },
    uMqAO: { value: K.ao?.tex ?? null },
    uMqTB: { value: tiles?.noise ?? null },
    uMqPrimer: { value: lin(PRIMER) },
  };
  if (K.ao) {
    shared.uMqAOMin.value.set(K.ao.min.x, K.ao.min.y, K.ao.min.z, 1);
    shared.uMqAOInv.value.set(K.ao.inv.x, K.ao.inv.y, K.ao.inv.z, K.ao.cell * 1.5);
  }
  // the sliding breech block (part 5) leaves the slot the AO field was baked round: how far out it is, for BLOCK_AO
  const blockPivot = rig.breechOpen?.axis === 'x' && rig.breechOpen.slide > 0 ? rig.pivots?.breech ?? null : null;
  const blockX0 = blockPivot?.position.x ?? 0, blockSlide = rig.breechOpen?.slide ?? 1;
  const H = hintUniforms(rig.wearHints ?? KIND_HINTS[kind]);
  shared.uMqHA = { value: H.A }; shared.uMqHB = { value: H.B }; shared.uMqHC = { value: H.C }; shared.uMqHN = { value: H.n };
  const paintU = { uMqC0: { value: new THREE.Color() }, uMqC1: { value: new THREE.Color() }, uMqC2: { value: new THREE.Color() }, uMqUnder: { value: new THREE.Color() }, uMqStyle: { value: 0 } };
  paintUniforms(paintU, scheme);
  const world = { value: false };
  const mats = {};
  const matFor = (key) => {
    const mk = KEY_KIND[key];
    if (mats[mk]) return mats[mk];
    const S = SURF[mk];
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: S.s[0], metalness: S.s[1], vertexColors: true });
    m.name = 'maxq-' + mk.toLowerCase();
    m.defines = { ['MQ_' + mk]: '', MQ_BIT: GL.KIND_BIT[mk] };
    const own = {
      uMqBase: { value: linv(S.base) }, uMqSurf: { value: new THREE.Vector4(...S.s) }, uMqDetail: { value: S.detail }, uMqDebug: { value: 0 },
      uMqTA: { value: tiles ? (mk === 'STEEL' ? tiles.steel : mk === 'TYRE' || mk === 'RUBBER' ? tiles.rubber : tiles.paint) : null },
    };
    m.userData.mq = own;
    chainPatch(m, 'maxq-' + mk.toLowerCase(), (shader) => {
      const isWorld = shader.uniforms.uWetness !== undefined;
      world.value ||= isWorld;
      Object.assign(shader.uniforms, shared, paintU, own);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + GL.vertPars)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GL.vertMain);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + (isWorld ? '#define MQ_WORLD\n' : '') + GL.fragPars + 'uniform float uMqBlockOut;\n')
        .replace('#include <map_fragment>', GL.fragSurface.replace('// low parts that do not face up', BLOCK_AO + '// low parts that do not face up'))
        .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace('float roughnessFactor = roughness;', 'float roughnessFactor = mqRough;'))
        .replace('#include <metalnessmap_fragment>', THREE.ShaderChunk.metalnessmap_fragment.replace('float metalnessFactor = metalness;', 'float metalnessFactor = mqMetal;'))
        .replace('#include <normal_fragment_maps>', GL.fragNormal)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + GL.fragAO);
    });
    mats[mk] = m;
    return m;
  };
  for (const e of targets) {
    const m = e.mesh;
    m.userData.mqStd ??= m.material;
    m.material = matFor(e.key);
  }
  const handle = {
    kind, scheme, lean, mats, rig,
    ready: K.ready ?? Promise.resolve(),
    info: { meshes: targets.length, analysisMs: K.analysisMs, get edges() { return K.stats; }, tilesMs: tiles.ms, ao: K.ao ? { dims: K.ao.dims, cell: K.ao.cell, ms: K.ao.ms } : null, ms: 0 },
    // soot by the rounds fired (the piece's wear grows by about 0.001 a round) and the barrel's heat after a shot;
    // pure functions of the piece, so time jumps and fastForward come out right
    update(dt, p, now) {
      if (blockPivot) shared.uMqBlockOut.value = Math.min(1, Math.max(0, (blockPivot.position.x - blockX0) / blockSlide));
      if (!p) return;
      shared.uMqSoot.value = SOOT0 + (1 - SOOT0) * (1 - Math.exp(-(p.wear ?? 0) / 0.012));
      const since = (now ?? 0) - (p.firedAt ?? -999);
      shared.uMqHeat.value = since >= 0 && since < 900 ? Math.exp(-since / 120) : 0;
    },
    setSoot(k) { shared.uMqSoot.value = k; },
    setWear(k) { shared.uMqWear.value = k; },
    repaint(s) { if (CAMO[s]) { paintUniforms(paintU, s); handle.scheme = s; } },
    restore() {
      rig.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.mqStd) { o.material = o.userData.mqStd; delete o.userData.mqStd; }
        if (o.userData.mqGeo) { o.geometry = o.userData.mqGeo; delete o.userData.mqGeo; }
      });
      rig.maxq = null;
    },
    dispose() { handle.restore(); for (const m of Object.values(mats)) m.dispose(); },
  };
  handle.info.ms = performance.now() - t0;
  rig.maxq = handle;
  return handle;
}

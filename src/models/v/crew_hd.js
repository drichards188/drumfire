import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CREW_FRAME, registerCrewTier } from './crew.js';
import { FACES, faceField, meshFace, headWeight, headPaint, lidRows, gridArrays, eyeRadius, meshEar, ER as EYE_R } from './crew_face.js';
import { maxMaterial as maxMat0, patchCrewMax as patchMax0 } from './crew_maxmat.js';

/**
 * The close tier of the German gun crews (1917: outfits 'german', 'german-cap', 'german-drill'; 1944: 'german44',
 * 'german44-gaiters', 'german44-cap'): the figure the player stands among when he serves a gun in person (the gunner,
 * src/ww2/gunnerView.js). Same skeleton, same bones, same rigid skinning as crew.js (every vertex on one bone), so
 * a figure changes tier by swapping its SkinnedMesh's geometry and material and every pose and drill is unchanged
 * (crew.js fig.setTier('hd'); render/crewhd.js does it for the manned gun).
 *
 * What it adds over crew.js (refs/crew_de/README.md has the photographs): a face (brow, shallow sockets, cheekbones,
 * nose, thin lips, jaw, chin) meshed by surface nets from a signed distance field, with eyeballs (a muted sclera,
 * grey-brown irises) under almond-shaped lids that rise out of the skin, ears, cropped hair, stubble and a lid crease; fists with four fingers of three phalanges and a thumb curled round the grip point the drills use; cloth
 * folds (the blouse bunched over the belt, creases at the elbows, knees and boot tops) displaced in the lofts and
 * darkened in their hollows; pockets, flaps, straps and the kit conformed to the body (the pleated pockets with
 * scalloped flaps, the collar with its Litzen, shoulder straps piped red, five buttons; belt, box buckle, Y straps
 * with D-rings, triple pouches, bread bag, canteen and cup, spade and bayonet, the fluted gas mask canister); the
 * helmets with their rolled rims, liner band, lugs and rivets seated on the steel, and the chin strap worn snug under
 * the chin, round the rear skirt or up on the visor (by the man); marching boots with a heel, a welted sole and the
 * concertina folds at the ankle, or ankle boots and canvas gaiters.
 *
 * The material is the vertex colours times a wool fleck texture, with a tiling twill normal map; a per-vertex
 * surface (aSurf: roughness, metalness, normal map strength, fleck strength) makes the leather glossier, the
 * helmet paint a little shiny and keeps the skin free of the weave. One material, one draw call a figure.
 * In the game it must be patched for the fog like every material (render/crewhd.js passes shaderlib's
 * patchMaterial to patchCrewHD); the model viewer uses it unpatched.
 *
 * About 37k to 42k triangles a figure (crew.js: 5.5k to 6.4k). Built lazily per outfit and skin, cached:
 *   hdHas(o)   the geometry is built            hdBuild(o)  build it now (20 to 35 ms, more the first time a face is meshed)
 *   hdStep(o, ms)  the same spread over frames: the face mesher (150 to 250 ms in all) in slices of about ms, then
 *              the figure; returns the geometry when it is ready, else null
 *   hdFor(o)   the tier has a figure for this outfit (the German ones)
 */

const { BI, L_TH, L_UA, L_FA, SH_X, SH_Y, SH_Z, HIP_X, HIP_Y, ANKLE_Y, TILE, COL } = CREW_FRAME;
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const SIDE = [-1, 1], SFX = ['L', 'R'];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (a, b, x) => sstep(a, (a + b) / 2, x) * (1 - sstep((a + b) / 2, b, x)); // 0 outside [a, b], 1 in the middle
// an integer hash to [0, 1) (a sine hash of a linear index draws diagonal stripes)
const hash = (x) => { let h = Math.imul((x * 2654435761) | 0, 0x9e3779b1) ^ 0x85ebca6b; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// surfaces: roughness, metalness, normal map strength, fleck strength
const SURF = {
  wool: [0.93, 0, 1, 1], drill: [0.88, 0, 0.7, 0.7], canvas: [0.9, 0, 0.8, 0.85], felt: [0.97, 0, 0.6, 1],
  leather: [0.48, 0, 0.12, 0.25], boot: [0.36, 0, 0.08, 0.2], sole: [0.85, 0, 0.3, 0.3],
  paint: [0.6, 0.15, 0.1, 0.35], metal: [0.38, 0.6, 0.02, 0.1], wood: [0.7, 0, 0.3, 0.6],
  skin: [0.62, 0, 0.03, 0.1], lip: [0.45, 0, 0.02, 0.05], hair: [0.8, 0, 0.5, 0.8], eye: [0.18, 0, 0, 0],
};
const C = (h) => new THREE.Color(h);
const _c = new THREE.Color();

// The quality profile a figure is built with (build() sets it for the call): segment counts scale by SEG and the torso
// rings and the lathes' profiles are resampled to RING times their spacing. The 'hd' profile is 1 and 1, so its
// figures are exactly what they were; 'max' (the lesson's battery, PLAN.md C2) is finer everywhere.
let SEG = 1, RING = 1;
const segs = (n) => (SEG === 1 ? n : Math.round(n * SEG));

// ---------------------------------------------------------------- the body, part by part

class HBody {
  // max: the max tier's figure, whose every part also carries aMax (texture layer, skin weight, wear, under the brim)
  // and aFace (the skin detail's masks: beard, brow, hair, lip; on the eyes the iris)
  constructor(max = false) { this.list = []; this.max = max; }
  // bone: a name, (x, y, z) => name, or 'head+neck' (the max head's skin, blended between them, crew_face.js
  // headWeight); colour: hex or (x, y, z) => hex | THREE.Color; shade: per vertex multiplier; ext (max only):
  // { surf(i) -> [4], max(i) -> [4], face(i) -> [4] } per vertex instead of the surface's defaults
  add(g, bone, colour, surf = 'wool', shadeOf = null, ext = null) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    const n = g.attributes.position.count, p = g.attributes.position;
    if (!g.index) g.setIndex([...Array(n).keys()]); // (mergeGeometries wants all indexed; shade(i) is per vertex)
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), sf = new Float32Array(n * 4);
    const S = SURF[surf] ?? SURF.wool;
    const am = this.max ? new Float32Array(n * 4) : null, af = this.max ? new Float32Array(n * 4) : null, M = this.max ? maxDefaults(surf) : null;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = typeof colour === 'function' ? colour(x, y, z, i) : colour;
      if (h && h.isColor) _c.copy(h); else _c.setHex(h);
      const k = shadeOf ? shadeOf(i) : 1;
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      if (bone === 'head+neck') {
        const w = headWeight(x - HC.x, y - HC.y, z - HC.z);
        si[i * 4] = BI.head; si[i * 4 + 1] = BI.neck; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w;
      } else {
        si[i * 4] = BI[typeof bone === 'function' ? bone(x, y, z) : bone];
        sw[i * 4] = 1;
      }
      const sv = ext?.surf ? ext.surf(i) : S;
      sf[i * 4] = sv[0]; sf[i * 4 + 1] = sv[1]; sf[i * 4 + 2] = sv[2]; sf[i * 4 + 3] = sv[3];
      if (am) {
        am.set(ext?.max ? ext.max(i) : M, i * 4);
        if (ext?.face) af.set(ext.face(i), i * 4);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('aSurf', new THREE.BufferAttribute(sf, 4));
    if (am) { g.setAttribute('aMax', new THREE.BufferAttribute(am, 4)); g.setAttribute('aFace', new THREE.BufferAttribute(af, 4)); }
    this.list.push(g);
  }
  geometry() {
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    this.list.length = 0;
    g.computeBoundingBox();
    // the same sphere crew.js gives the mesh (it covers every pose)
    g.boundingSphere = new THREE.Sphere(new V3(0, 1.05, -0.1), 1.45);
    return g;
  }
}

// ---------------------------------------------------------------- geometry from rows of points

// rows: arrays of Vector3 (each row closed by repeating its first point when `closed`), uvs alike; returns indexed
// geometry with smooth normals, seams and poles welded. flip reverses the winding.
function grid(rows, uvs, { flip = false, shade = null } = {}) {
  const cols = rows[0].length, pos = new Float32Array(rows.length * cols * 3), uv = new Float32Array(rows.length * cols * 2), idx = [];
  rows.forEach((r, k) => r.forEach((p, i) => { const j = k * cols + i; pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z; uv[j * 2] = uvs[k][i][0] / TILE; uv[j * 2 + 1] = uvs[k][i][1] / TILE; }));
  for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < cols - 1; i++) {
    const a = k * cols + i, b = a + cols, c = a + 1, d = b + 1;
    if (flip) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  weldNormals(g);
  if (shade) g.userData.shade = shade;
  return g;
}

// average the normals of coincident vertices (seams, poles, the ends of rows)
function weldNormals(g) {
  const p = g.attributes.position, n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 2e4)},${Math.round(p.getY(i) * 2e4)},${Math.round(p.getZ(i) * 2e4)}`;
    let a = map.get(key);
    if (!a) map.set(key, a = []);
    a.push(i);
  }
  const s = new V3();
  for (const a of map.values()) {
    if (a.length < 2) continue;
    s.set(0, 0, 0);
    for (const i of a) s.x += n.getX(i), s.y += n.getY(i), s.z += n.getZ(i);
    s.normalize();
    for (const i of a) n.setXYZ(i, s.x, s.y, s.z);
  }
}

// flip every triangle when the faces on the whole point toward ref rather than away from it
function orient(g, ref) {
  const p = g.attributes.position, ix = g.index, a = new V3(), b = new V3(), c = new V3(), n = new V3();
  const m = ix ? ix.count : p.count, at = (k) => (ix ? ix.getX(k) : k);
  let sum = 0;
  for (let k = 0; k < m; k += 3) {
    a.fromBufferAttribute(p, at(k)); b.fromBufferAttribute(p, at(k + 1)); c.fromBufferAttribute(p, at(k + 2));
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    sum += n.dot(a.add(b).add(c).multiplyScalar(1 / 3).sub(ref));
  }
  if (sum >= 0) return g;
  if (!ix) g.setIndex([...Array(p.count).keys()]);
  const I = g.index;
  for (let k = 0; k < I.count; k += 3) { const t = I.getX(k); I.setX(k, I.getX(k + 1)); I.setX(k + 1, t); }
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

// Superelliptic loft about +Y: rings { y, rx, rz, cx, cz, ex }, angle a from the front (-Z) toward +X.
// mod(a, y, x, z) returns a displacement along the ring's outward normal (folds); hollows come out darker.
function loft(rings, n, mod = null, darken = 18) {
  n = segs(n);
  const rows = [], uvs = [], shade = [];
  let v = 0;
  rings.forEach((R, k) => {
    const e = 2 / (R.ex || 2.5), row = [], ur = [];
    if (k) v += Math.abs(R.y - rings[k - 1].y);
    const per = Math.PI * (R.rx + R.rz);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, s = Math.sin(a), c = Math.cos(a);
      const sx = Math.sign(s) * Math.abs(s) ** e, sz = Math.sign(c) * Math.abs(c) ** e;
      let x = (R.cx || 0) + sx * R.rx, z = (R.cz || 0) - sz * R.rz;
      let d = 0;
      if (mod && R.rx > 0.002) {
        d = mod(a, R.y, x, z);
        // outward normal of the superellipse at this point
        let nx = Math.sign(s) * Math.abs(sx) ** (R.ex - 1 || 1) / R.rx, nz = -Math.sign(c) * Math.abs(sz) ** (R.ex - 1 || 1) / R.rz;
        const l = Math.hypot(nx, nz) || 1;
        x += (nx / l) * d; z += (nz / l) * d;
      }
      row.push(new V3(x, R.y, z));
      ur.push([(i / n - 0.5) * per, v]);
      shade.push(clamp(1 + d * darken, 0.82, 1.06));
    }
    rows.push(row); uvs.push(ur);
  });
  const g = grid(rows, uvs);
  g.userData.shade = shade;
  return g;
}

// Surface of revolution about +Y through (x, y, z) from [dy, r] pairs bottom to top; mod as in loft.
function lathe(prof, seg, x, y, z, sx = 1, sz = 1, mod = null, darken = 18) {
  if (RING < 1) prof = finer(prof, 0.012 * RING);
  return loft(prof.map(([dy, r]) => ({ y: y + dy, rx: Math.max(r * sx, 1e-4), rz: Math.max(r * sz, 1e-4), cx: x, cz: z, ex: 2 })), seg, mod, darken);
}

// a [dy, r] profile with extra points so no step along it is longer than `step` (straight between the given points)
function finer(prof, step) {
  const out = [prof[0]];
  for (let i = 1; i < prof.length; i++) {
    const [a0, r0] = prof[i - 1], [a1, r1] = prof[i], k = Math.ceil(Math.abs(a1 - a0) / step);
    for (let j = 1; j < k; j++) out.push([lerp(a0, a1, j / k), lerp(r0, r1, j / k)]);
    out.push(prof[i]);
  }
  return out;
}

// A tube along points with radii (r or [r1, r2], r1 along the frame normal), rounded ends; `up` per point (optional)
// orients the cross-section's first axis (a strap lies flat on the body).
function tube(pts, rad, seg, { capA = true, capB = true, up = null } = {}) {
  seg = segs(seg);
  const n = pts.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(new V3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
  for (let i = 0; i < n; i++) {
    let nn;
    if (up) nn = up[i].clone().addScaledVector(T[i], -up[i].dot(T[i])).normalize();
    else if (i === 0) { const a = Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0); nn = a.addScaledVector(T[0], -a.dot(T[0])).normalize(); }
    else { nn = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i])).normalize(); }
    N.push(nn); B.push(new V3().crossVectors(nn, T[i]));
  }
  const R = (i) => (Array.isArray(rad[i]) ? rad[i] : [rad[i], rad[i]]);
  const rows = [], uvs = [];
  let v = 0;
  const ring = (c, i, k, back) => {
    const [r1, r2] = R(i), row = [], ur = [];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      row.push(c.clone().addScaledVector(N[i], ca * r1 * k).addScaledVector(B[i], sa * r2 * k));
      ur.push([(j / seg) * Math.PI * (r1 + r2), v + back]);
    }
    rows.push(row); uvs.push(ur);
  };
  const capRings = 4;
  if (capA) for (let q = capRings; q >= 1; q--) { const ph = (q / capRings) * Math.PI / 2, r = R(0)[0]; ring(pts[0].clone().addScaledVector(T[0], -Math.sin(ph) * Math.min(r, R(0)[1])), 0, Math.cos(ph) + 1e-3, -Math.sin(ph) * r); }
  for (let i = 0; i < n; i++) { if (i) v += pts[i].distanceTo(pts[i - 1]); ring(pts[i], i, 1, 0); }
  if (capB) for (let q = 1; q <= capRings; q++) { const ph = (q / capRings) * Math.PI / 2, r = R(n - 1)[0]; ring(pts[n - 1].clone().addScaledVector(T[n - 1], Math.sin(ph) * Math.min(r, R(n - 1)[1])), n - 1, Math.cos(ph) + 1e-3, Math.sin(ph) * r); }
  return grid(rows, uvs);
}

// Rounded box (radius r) centred at the origin, then placed: rotation (Euler XYZ) and translation.
function rbox(w, h, d, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  sg = segs(sg);
  const g = new THREE.BoxGeometry(w, h, d, sg, sg, sg);
  const p = g.attributes.position, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new V3(), q = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(q);
    if (v.lengthSq() > 1e-12) v.setLength(r);
    v.add(q);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.max(w, d)) / TILE, (uv.getY(i) * h) / TILE);
  g.computeVertexNormals();
  weldNormals(g);
  return place(g, x, y, z, rx, ry, rz);
}

const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _one = new V3(1, 1, 1), _p4 = new V3();
function place(g, x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  return g.applyMatrix4(_m4.compose(_p4.set(x, y, z), _q4.setFromEuler(_e4.set(rx, ry, rz, order)), _one));
}

function ellip(rx, ry, rz, x, y, z, w = 16, h = 12) {
  const g = new THREE.SphereGeometry(1, segs(w), segs(h));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * TAU * (rx + rz) / 2) / TILE, (uv.getY(i) * Math.PI * ry) / TILE);
  return g.scale(rx, ry, rz).translate(x, y, z);
}

// a disc button (dome on a rim) facing direction (nx, nz) in the horizontal plane, or up the given normal
function button(x, y, z, r, nrm) {
  const g = new THREE.LatheGeometry([[0, 0], [r, 0], [r, r * 0.25], [r * 0.85, r * 0.45], [r * 0.4, r * 0.55], [0.0001, r * 0.55]].map(([a, b]) => new THREE.Vector2(Math.max(a, 1e-4), b)), segs(8));
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), nrm.clone().normalize());
  g.applyQuaternion(q).translate(x, y, z);
  return g;
}

// a flat ring (D-ring, buckle frame) of radius r and wire thickness t about axis nrm
function ring(x, y, z, r, t, nrm, arc = TAU) {
  const g = new THREE.TorusGeometry(r, t, segs(5), segs(12), arc);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), nrm.clone().normalize())).translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------- the torso surface (pockets and straps sit on it)

// the outside of the blouse, merged over the three overlapping torso pieces (crew.js's proportions)
const TORSO = [
  [0.765, 0.188, 0.134, 0.01], [0.84, 0.193, 0.137, 0.01], [0.93, 0.192, 0.134, 0.006], [1.01, 0.183, 0.127, 0.002],
  [1.08, 0.177, 0.123, 0], [1.16, 0.182, 0.126, -0.003], [1.23, 0.188, 0.128, -0.005], [1.25, 0.19, 0.13, -0.007],
  [1.33, 0.196, 0.132, -0.01], [1.4, 0.197, 0.126, -0.006], [1.445, 0.183, 0.114, 0.002], [1.482, 0.132, 0.09, 0.01], [1.505, 0.072, 0.066, 0.014],
].map(([y, rx, rz, cz]) => ({ y, rx, rz, cz, ex: 2.5 }));
function ringAt(y) {
  if (y <= TORSO[0].y) return TORSO[0];
  for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i].y) {
    const A = TORSO[i - 1], B = TORSO[i], t = (y - A.y) / (B.y - A.y);
    return { y, rx: lerp(A.rx, B.rx, t), rz: lerp(A.rz, B.rz, t), cz: lerp(A.cz, B.cz, t), ex: 2.5 };
  }
  return TORSO[TORSO.length - 1];
}
// a resampled run of the profile between y0 and y1, a ring every `dy`
function torsoRings(y0, y1, dy = 0.018) {
  dy *= RING;
  const n = Math.max(2, Math.ceil((y1 - y0) / dy)), out = [];
  for (let i = 0; i <= n; i++) out.push({ ...ringAt(lerp(y0, y1, i / n)) });
  return out;
}
// the point on the torso at x (front when side < 0, back when > 0) and height y, its outward normal
function onTorso(x, y, side = -1, out = { p: new V3(), n: new V3() }) {
  const f = (xx, yy, o) => {
    const R = ringAt(yy), u = clamp(Math.abs(xx) / R.rx, 0, 0.999);
    o.set(xx, yy, R.cz + side * R.rz * (1 - u ** R.ex) ** (1 / R.ex));
    return o;
  };
  const a = f(x, y, out.p), b = f(x + 0.002, y, new V3()), c = f(x, y + 0.002, new V3());
  out.n.crossVectors(b.sub(a), c.sub(a)).normalize();
  if (out.n.z * side < 0) out.n.negate();
  return out;
}

// A raised slab on the torso: (u, v) in [0, 1]^2 maps through map(u, v) -> [x, y] onto the surface (front or back),
// lifted `lift` and `thick` more in the middle, the edge rounded over `edge` of the width; walls down to the body.
// relief(u, v) adds to the thickness (pleats, seams). Returns a geometry.
function slab(map, nu, nv, { side = -1, lift = 0.004, thick = 0.005, edge = 0.12, relief = null } = {}) {
  nu = segs(nu); nv = segs(nv);
  const rows = [], uvs = [], S = { p: new V3(), n: new V3() };
  const top = (u, v) => {
    const [x, y] = map(u, v);
    onTorso(x, y, side, S);
    const e = Math.min(sstep(0, edge, u), sstep(0, edge, 1 - u), sstep(0, edge, v), sstep(0, edge, 1 - v));
    const t = lift + thick * (0.35 + 0.65 * e) + (relief ? relief(u, v) : 0);
    return [S.p.clone().addScaledVector(S.n, t), [x, y]];
  };
  const base = (u, v) => { const [x, y] = map(u, v); onTorso(x, y, side, S); return S.p.clone().addScaledVector(S.n, lift * 0.2); };
  for (let j = 0; j <= nv; j++) {
    const row = [], ur = [];
    for (let i = 0; i <= nu; i++) { const [p, xy] = top(i / nu, j / nv); row.push(p); ur.push(xy); }
    rows.push(row); uvs.push(ur);
  }
  const [cx, cy] = map(0.5, 0.5), mid = onTorso(cx, cy, side);
  const g1 = orient(grid(rows, uvs), mid.p.clone().addScaledVector(mid.n, -0.1));
  // walls: the border loop, top to base
  const loop = [];
  for (let i = 0; i <= nu; i++) loop.push([i / nu, 0]);
  for (let j = 1; j <= nv; j++) loop.push([1, j / nv]);
  for (let i = nu - 1; i >= 0; i--) loop.push([i / nu, 1]);
  for (let j = nv - 1; j >= 0; j--) loop.push([0, j / nv]);
  const wr = [loop.map(([u, v]) => top(u, v)[0]), loop.map(([u, v]) => base(u, v))];
  const wu = [loop.map((_, i) => [i * 0.01, 0]), loop.map((_, i) => [i * 0.01, 0.01])];
  const g2 = orient(grid(wr, wu), mid.p.clone().addScaledVector(mid.n, lift + thick * 0.5));
  const a1 = g1.toNonIndexed(), a2 = g2.toNonIndexed();
  const g = mergeGeometries([a1, a2]);
  // the walls (the seam's shadow) darker than the face
  g.userData.shade = Array.from({ length: g.attributes.position.count }, (_, i) => (i < a1.attributes.position.count ? 1 : 0.72));
  g1.dispose(); g2.dispose(); a1.dispose(); a2.dispose();
  return g;
}

// points along the torso surface between two (x, y) marks, lifted, with their normals (for straps as flat tubes)
function surfPath(marks, n, side, lift, more = null) {
  n = segs(n);
  const pts = [], up = [], S = { p: new V3(), n: new V3() };
  for (let k = 0; k < marks.length - 1; k++) for (let i = 0; i < n; i++) {
    const t = i / n, x = lerp(marks[k][0], marks[k + 1][0], t), y = lerp(marks[k][1], marks[k + 1][1], t);
    onTorso(x, y, side, S);
    pts.push(S.p.clone().addScaledVector(S.n, lift + (more ? more(y) : 0))); up.push(S.n.clone());
  }
  const [x, y] = marks[marks.length - 1];
  onTorso(x, y, side, S);
  pts.push(S.p.clone().addScaledVector(S.n, lift + (more ? more(y) : 0))); up.push(S.n.clone());
  return { pts, up };
}

// ---------------------------------------------------------------- the head: a field projected onto a sphere

const HC = new V3(0, 1.672, 0.008); // head centre (crew.js: eyes at 1.674, the head bone at 1.6)
function sdEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz, k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / rx, b / ry, c / rz);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function sdCap(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - lerp(ra, rb, h);
}
// head relative to HC; the face looks down -Z. var: small per-skin differences (jaw, nose)
function headSDF(x, y, z, vr) {
  const ax = Math.abs(x);
  let d = sdEll(x, y, z, 0, 0.018, 0.014, 0.077, 0.096, 0.098); // cranium
  d = smin(d, sdEll(x, y, z, 0, -0.05, -0.02, 0.066 + vr.jaw, 0.062, 0.07), 0.035); // jaw and face
  d = smin(d, sdEll(ax, y, z, 0.055 + vr.jaw, -0.058, 0.004, 0.018, 0.03, 0.032), 0.025); // the angles of the jaw
  d = smin(d, sdEll(x, y, z, 0, -0.099, -0.064, 0.024, 0.019, 0.02), 0.022); // chin
  d = smin(d, sdEll(ax, y, z, 0.047, -0.014, -0.056, 0.026, 0.016, 0.021), 0.02); // cheekbones
  d = smin(d, sdEll(x, y, z, 0, 0.022, -0.082, 0.058, 0.014, 0.014), 0.016); // brow ridge
  // the eye sockets, pressed in under the brow
  d = smax(d, -sdEll(ax, y, z, 0.032, 0.0, -0.099, 0.017, 0.012, 0.012), 0.014); // a shallow socket: the lids and eyeball come through it
  // (the eyelids are smooth meshes of their own round the eyeball: build(), eyes)
  // the nose: bridge to tip, the wings at the nostrils
  d = smin(d, sdCap(x, y, z, 0, 0.012, -0.088, 0, -0.027, -0.111 - vr.nose, 0.0058, 0.0085), 0.011);
  d = smin(d, sdEll(ax, y, z, 0.0098, -0.031, -0.0955, 0.0062, 0.0052, 0.007), 0.008);
  d = smax(d, -sdEll(ax, y, z, 0.007, -0.037, -0.104, 0.0036, 0.0024, 0.004), 0.002); // nostrils
  // the mouth: the philtrum, two lips, the line between
  d = smin(d, sdEll(x, y, z, 0, -0.0515, -0.088, 0.021, 0.0045, 0.0068), 0.007);
  d = smin(d, sdEll(x, y, z, 0, -0.0605, -0.0865, 0.018, 0.0048, 0.007), 0.007);
  d = smax(d, -sdEll(x, y, z, 0, -0.056, -0.094, 0.019, 0.0009, 0.006), 0.002);
  return d;
}
function headColour(x, y, z, skin, hair, lip, brow) {
  const ax = Math.abs(x);
  // lips: a soft blend over the (thin) lip shapes, not far from the skin
  const lipK = clamp(Math.max(1 - Math.max(0, sdEll(x, y, z, 0, -0.0515, -0.088, 0.021, 0.0048, 0.0071)) / 0.0025, 1 - Math.max(0, sdEll(x, y, z, 0, -0.0605, -0.0865, 0.018, 0.005, 0.0073)) / 0.0025), 0, 1);
  const out = skin.clone();
  // cropped hair: the back and sides above the ears (under the helmet or cap it shows at the nape), short sideburns
  const hairK = sstep(-0.01, 0.01, y + 0.012 - 0.35 * Math.max(0, -z - 0.03)) * sstep(-0.05, -0.02, z) * (1 - sstep(0.07, 0.085, -z));
  const side = sstep(0.062, 0.072, ax) * sstep(-0.012, 0.004, y) * sstep(-0.045, -0.025, z);
  out.lerp(hair, clamp(Math.max(hairK * 0.85, side * 0.4), 0, 1));
  // brows: thin, not much darker than the skin at a few metres
  const browK = (1 - sstep(0.0, 0.003, Math.abs(y - 0.0215 + 0.9 * (ax - 0.03) ** 2))) * sstep(0.01, 0.016, ax) * (1 - sstep(0.044, 0.05, ax)) * sstep(0.074, 0.082, -z);
  out.lerp(brow, browK * 0.5);
  // the upper lid's crease, a little shadow under the brow ridge
  const e = Math.hypot((ax - 0.032) / 0.0165, (y - 0.003) / 0.0118);
  out.multiplyScalar(1 - 0.07 * (1 - sstep(0, 0.14, Math.abs(e - 1))) * sstep(0.004, 0.008, y) * sstep(0.08, 0.088, -z));
  out.multiplyScalar(1 - 0.07 * sstep(0.005, 0.012, y) * (1 - sstep(0.015, 0.022, y)) * (1 - sstep(0.018, 0.026, Math.abs(ax - 0.032))));
  // stubble: a grey-blue shadow on the jaw, the chin and the upper lip
  const beard = Math.max(sstep(-0.03, -0.055, y) * sstep(0.0, 0.05, -z + 0.03), sstep(-0.042, -0.05, y) * (1 - sstep(-0.035, -0.03, y))) * (1 - lipK);
  out.lerp(STUBBLE, 0.13 * clamp(beard, 0, 1)).multiplyScalar(1 - 0.05 * clamp(beard, 0, 1));
  const cheek = Math.max(0, 1 - Math.hypot(ax - 0.045, (y + 0.02) * 1.4, (z + 0.07) * 1.2) / 0.025);
  out.lerp(lip, cheek * 0.06);
  out.lerp(lip, lipK * 0.5);
  // a touch darker in the sockets
  const sock = Math.max(0, 1 - Math.hypot((ax - 0.032) / 0.024, (y - 0.004) / 0.02, (z + 0.086) / 0.03));
  out.multiplyScalar(1 - 0.05 * sock);
  return out;
}
const STUBBLE = new THREE.Color(0x5b5650);

const headCache = new Map(); // per face variant: the meshed field (positions, normals, index)
// The field meshed by surface nets on a 4.6 mm lattice, each vertex pulled onto the surface and lit by the field's
// gradient; everything under the helmet's rim (or above the cap's band) is left out: every one of these outfits wears
// one, and that part of the head is never seen.
// helmet: the M35's or M1916's rim line (crew_hd.js helmetShell) and a margin, under which nothing shows; else the cap's band
function headCut(helmet) {
  if (!helmet) return (x, y) => y < 0.032;
  return (x, y, z) => {
    const a = Math.atan2(x, -z), F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a));
    return y < 1.618 + 0.082 * F ** 2 - 0.026 * Bk ** 1.3 - HC.y + 0.022 + 0.022 * (1 - F) * (1 - Bk);
  };
}
// The mesher is a generator (it yields after each slab of the lattice) so the game can spread it over frames
// (hdStep); the meshed face is cached per variant (skin parity) and cut per headgear afterwards.
const meshes = new Map(), meshers = new Map();
function* headMesher(vi, H = 0.0046) {
  const vr = { jaw: [0, 0.003][vi], nose: [0, 0.003][vi] };
  const x0 = -0.092, y0 = -0.128, z0 = -0.128, NX = Math.ceil(0.184 / H) + 1, NY = Math.ceil(0.19 / H) + 1, NZ = Math.ceil(0.25 / H) + 1;
  const F = new Float32Array(NX * NY * NZ), at = (i, j, k) => (k * NY + j) * NX + i;
  // only near the surface is the field needed: well outside a bounding ellipsoid it is +1, well inside a core -1
  for (let k = 0; k < NZ; k++) {
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = x0 + i * H, y = y0 + j * H, z = z0 + k * H;
      const out = Math.hypot(x / 0.09, (y + 0.03) / 0.16, (z + 0.005) / 0.125), core = Math.hypot(x / 0.055, (y + 0.005) / 0.07, (z - 0.01) / 0.07);
      F[at(i, j, k)] = out > 1.06 ? 1 : core < 0.92 ? -1 : headSDF(x, y, z, vr);
    }
    if (k % 6 === 5) yield;
  }
  const sdf = (x, y, z) => headSDF(x, y, z, vr);
  const grad = (x, y, z, o) => { const e = 0.0006; o.set(sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)).normalize(); return o; };
  const vid = new Int32Array(NX * NY * NZ).fill(-1), pos = [], nrm = [], quads = [], g = new V3();
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1], v = new Float32Array(8);
  for (let k = 0; k < NZ - 1; k++) {
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { v[c] = F[at(i + cx[c], j + cy[c], k + cz[c])]; if (v[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        if ((v[a] < 0) === (v[b] < 0)) continue;
        const t = v[a] / (v[a] - v[b]);
        sx += cx[a] + (cx[b] - cx[a]) * t; sy += cy[a] + (cy[b] - cy[a]) * t; sz += cz[a] + (cz[b] - cz[a]) * t; n++;
      }
      let px = x0 + (i + sx / n) * H, py = y0 + (j + sy / n) * H, pz = z0 + (k + sz / n) * H;
      const d = sdf(px, py, pz); grad(px, py, pz, g); px -= g.x * d; py -= g.y * d; pz -= g.z * d; // onto the surface
      vid[at(i, j, k)] = pos.length / 3;
      pos.push(px, py, pz); nrm.push(g.x, g.y, g.z);
    }
    if (k % 8 === 7) yield;
  }
  const quad = (a, b, c, d, flip) => { if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quads.push(...(flip ? [a, d, c, b] : [a, b, c, d])); };
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const f0 = F[at(i, j, k)] < 0;
    if (f0 !== (F[at(i + 1, j, k)] < 0)) quad(vid[at(i, j - 1, k - 1)], vid[at(i, j, k - 1)], vid[at(i, j, k)], vid[at(i, j - 1, k)], f0);
    if (f0 !== (F[at(i, j + 1, k)] < 0)) quad(vid[at(i - 1, j, k - 1)], vid[at(i - 1, j, k)], vid[at(i, j, k)], vid[at(i, j, k - 1)], f0);
    if (f0 !== (F[at(i, j, k + 1)] < 0)) quad(vid[at(i - 1, j - 1, k)], vid[at(i, j - 1, k)], vid[at(i, j, k)], vid[at(i - 1, j, k)], f0);
  }
  // the winding agrees with the gradient (a vote decides the global flip)
  const A = new V3(), Bv = new V3(), Cv = new V3(), N = new V3();
  let vote = 0;
  for (let q = 0; q < quads.length; q += 40) {
    A.fromArray(pos, quads[q] * 3); Bv.fromArray(pos, quads[q + 1] * 3); Cv.fromArray(pos, quads[q + 2] * 3);
    N.crossVectors(Bv.sub(A), Cv.sub(A));
    vote += N.x * nrm[quads[q] * 3] + N.y * nrm[quads[q] * 3 + 1] + N.z * nrm[quads[q] * 3 + 2];
  }
  meshes.set(`${vi}|${H}`, { pos, nrm, quads, flip: vote < 0 });
}
// advance the face variant's mesher (lattice H) for up to `ms` (Infinity: to the end); true when it is meshed
function meshHead(vi, ms = Infinity, H = 0.0046) {
  const mk = `${vi}|${H}`;
  if (meshes.has(mk)) return true;
  let it = meshers.get(mk);
  if (!it) meshers.set(mk, it = headMesher(vi, H));
  const t0 = performance.now();
  while (!it.next().done) if (performance.now() - t0 > ms) return false;
  meshers.delete(mk);
  return true;
}
function headGeometry(skinI, helmet = false, H = 0.0046) {
  const vi = skinI % 2, key = vi + (helmet ? 'h' : 'c') + `|${H}`;
  if (!headCache.has(key)) {
    meshHead(vi, Infinity, H);
    const { pos, nrm, quads, flip } = meshes.get(`${vi}|${H}`), keep = headCut(helmet), idx = [];
    const k = (q) => keep(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
    for (let q = 0; q < quads.length; q += 4) {
      const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
      if (!k(a) && !k(b) && !k(c) && !k(d)) continue;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    // (only the vertices the cut keeps)
    const remap = new Int32Array(pos.length / 3).fill(-1), P = [], Nn = [], U = [];
    const out = idx.map((q) => {
      if (remap[q] < 0) {
        remap[q] = P.length / 3;
        P.push(pos[q * 3] + HC.x, pos[q * 3 + 1] + HC.y, pos[q * 3 + 2] + HC.z); Nn.push(nrm[q * 3], nrm[q * 3 + 1], nrm[q * 3 + 2]);
        U.push((pos[q * 3] * 0.8 + pos[q * 3 + 2] * 0.6) / TILE, pos[q * 3 + 1] / TILE);
      }
      return remap[q];
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setIndex(out);
    headCache.set(key, geo);
  }
  return headCache.get(key).clone();
}

// ---------------------------------------------------------------- textures and the material

let mat = null;
function makeTextures() {
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
  // height: a 2/2 twill (diagonal wales every 6 texels, ~7 mm), felted wool lumps, stray fibres
  const lat = (P, s) => Float32Array.from({ length: P * P }, (_, i) => hash(i + s * 7919));
  const L1 = lat(16, 3), L2 = lat(32, 9), L3 = lat(64, 17);
  const vn = (L, P, u, v) => {
    const x = u * P, y = v * P, ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => L[((b % P + P) % P) * P + ((a % P + P) % P)];
    return lerp(lerp(g(ix, iy), g(ix + 1, iy), fx), lerp(g(ix, iy + 1), g(ix + 1, iy + 1), fx), fy);
  };
  // height: felted wool (soft lumps at two scales) over a faint fine twill (period 4 texels, ~4.7 mm)
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const tw = 0.5 + 0.5 * Math.sin(((x + y) / 4) * TAU);
    H[y * N + x] = 0.08 * tw + 0.5 * vn(L2, 32, u, v) + 0.36 * vn(L3, 64, u, v);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = (a, b) => H[((b + N) % N) * N + ((a + N) % N)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * 1.1, dy = (h(x, y + 1) - h(x, y - 1)) * 1.1;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(cv);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.colorSpace = THREE.NoColorSpace;
  normal.anisotropy = 4;
  // fleck: mottled wool, multipliers about 0.88 to 1.06
  const cv2 = document.createElement('canvas');
  cv2.width = cv2.height = N;
  const c2 = cv2.getContext('2d'), im2 = c2.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, f = 0.55 * vn(L2, 32, u, v) + 0.3 * vn(L3, 64, u, v) + 0.15 * hash(y * N + x + 104729);
    const m = clamp(0.86 + 0.22 * f, 0, 1) * 255, i = (y * N + x) * 4;
    im2.data[i] = m; im2.data[i + 1] = m; im2.data[i + 2] = m * 0.99; im2.data[i + 3] = 255;
  }
  c2.putImageData(im2, 0, 0);
  const fleck = new THREE.CanvasTexture(cv2);
  fleck.wrapS = fleck.wrapT = THREE.RepeatWrapping;
  fleck.colorSpace = THREE.NoColorSpace;
  fleck.anisotropy = 4;
  return { normal, fleck };
}

// the shader changes for aSurf (shared by the raw and the fog-patched material)
export function hdPatch(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aSurf;\nvarying vec4 vSurf;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vSurf;')
    // (the chunks are still #includes here: expand the two that change)
    .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor.rgb *= mix( vec3( 1.0 ), sampledDiffuseColor.rgb, vSurf.w );'))
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
    .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vSurf.z;'));
}

/** The one material of the close tier (created on first use). */
export function hdMaterial() {
  if (!mat) {
    const t = typeof document !== 'undefined' ? makeTextures() : {};
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.fleck ?? null, normalMap: t.normal ?? null, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, metalness: 0 });
    mat.name = 'crew-hd';
    mat.onBeforeCompile = hdPatch;
    mat.customProgramCacheKey = () => 'crew-hd';
  }
  return mat;
}
/** In the game: pass shaderlib's patchMaterial (the fog uniforms, then the aSurf changes). */
export function patchCrewHD(patchMaterial) {
  const m = hdMaterial();
  if (!m.userData.patched) patchMaterial(m, 'crew-hd-fog', hdPatch);
  return m;
}

// The max tier's material (crew_maxmat.js: its own program, own key, own primer in render/crewhd.js); the cloth's
// textures are the hd tier's for now.
export function maxMaterial(fig = null) { hdMaterial(); return maxMat0({ map: mat.map, normalMap: mat.normalMap }, fig?.man ?? null); }
export function patchCrewMax(patchMaterial) { hdMaterial(); return patchMax0(patchMaterial, { map: mat.map, normalMap: mat.normalMap }); }

// ---------------------------------------------------------------- the figure

// The tier's quality profiles: 'hd' serves the battles' first-person figures (as it always has); 'max' the lesson's
// battery (PLAN.md 3.4): a 2.5 mm face lattice, 1.75 times the segments, rings 2.5 times closer along the body.
export const PROFILE = {
  hd: Object.freeze({ name: 'hd', H: 0.0046, seg: 1, ring: 1, max: false }),
  max: Object.freeze({ name: 'max', H: 0.0025, seg: 1.3, ring: 0.6, max: true }),
};
const cache = new Map(), maxCache = new Map();
const isGerman = (o) => o.vest === 'german44' || o.vest === 'german1917';
export const hdHas = (o) => cache.has(o.key);
export const hdFor = (o) => isGerman(o);
export function hdBuild(o) {
  if (!isGerman(o)) return null;
  if (!cache.has(o.key)) cache.set(o.key, build(o, PROFILE.hd));
  return cache.get(o.key);
}
// Spread over frames: advance the build of outfit o by about `ms` (the face's mesher in slices, then the figure in
// one go, 15 to 25 ms); the geometry when it is ready, else null.
export function hdStep(o, ms = 6) {
  if (!isGerman(o)) return null;
  if (cache.has(o.key)) return cache.get(o.key);
  if (!meshHead(o.skin % 2, ms)) return null;
  return hdBuild(o);
}
// The same for the max tier; `fig` (optional) is the figure it is for (its man's face and kit, item 7).
const maxKey = (o, fig) => `${o.key}|${maxVariant(o, fig)}`;
function maxVariant(o, fig) { return `f${faceOf(o, fig)}${fig?.man?.gloves ? 'g' : ''}`; }
export const maxHas = (o, fig) => maxCache.has(maxKey(o, fig));

// The worker's half (crewWorker.js): build a figure of tier 'hd' or 'max' for outfit o (crew.js options()) and man,
// as plain arrays to transfer: { key, attrs: { name: [array, itemSize, normalized] }, index }. The main thread's half,
// adoptArrays, puts them in the tier's cache as a BufferGeometry, so fig.setTier finds it built.
export function buildArrays(tier, o, man = null, keep = true) {
  const fig = man ? { man } : null, g = tier === 'max' ? maxBuild(o, fig) : hdBuild(o);
  if (!g) return null;
  const attrs = {}, key = tier === 'max' ? maxKey(o, fig) : o.key;
  for (const [k, a] of Object.entries(g.attributes)) attrs[k] = [a.array, a.itemSize, a.normalized];
  if (!keep) (tier === 'max' ? maxCache : cache).delete(key); // (a worker sends its arrays away: none stays behind)
  return { key, attrs, index: g.index.array };
}
export function adoptArrays(tier, data) {
  const c = tier === 'max' ? maxCache : cache;
  if (!data || c.has(data.key)) return c.get(data?.key) ?? null;
  const g = new THREE.BufferGeometry();
  for (const [k, [arr, size, norm]] of Object.entries(data.attrs)) g.setAttribute(k, k === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, size, norm) : new THREE.BufferAttribute(arr, size, norm));
  g.setIndex(new THREE.BufferAttribute(data.index, 1));
  g.computeBoundingBox();
  g.boundingSphere = new THREE.Sphere(new V3(0, 1.05, -0.1), 1.45);
  c.set(data.key, g);
  return g;
}
// the cache key a figure of this tier would have (render/crewhd.js asks before it sends work to a worker)
export const tierKey = (tier, o, man = null) => (tier === 'max' ? maxKey(o, man ? { man } : null) : o.key);
export function maxBuild(o, fig = null) {
  if (!isGerman(o)) return null;
  const k = maxKey(o, fig);
  if (!maxCache.has(k)) maxCache.set(k, build(o, PROFILE.max, fig));
  return maxCache.get(k);
}
export function maxStep(o, ms = 6, fig = null) {
  if (!isGerman(o)) return null;
  const k = maxKey(o, fig);
  if (maxCache.has(k)) return maxCache.get(k);
  if (!meshMax(o, fig, ms)) return null;
  return maxBuild(o, fig);
}

function build(o, q = PROFILE.hd, fig = null) {
  const seg0 = SEG, ring0 = RING;
  SEG = q.seg; RING = q.ring;
  try { return buildFigure(o, q, fig); } finally { SEG = seg0; RING = ring0; }
}

function buildFigure(o, q, fig) {
  const B = new HBody(q.max);
  const ww2 = o.vest === 'german44';
  const cloth = C(o.jacket ?? COL[o.pattern]), legC = C(o.trousers ?? COL[o.pattern]);
  const drill = o.jacket != null, cmd = o.headgear === 'm43' || (o.headgear === 'feldmuetze' && !drill);
  // skin: crew.js's tones a touch less orange (toward their own grey: at 4 m the face matches the standard tier's within
  // 3 %, so a man changing tier does not change colour); lips a deeper shade of it, brows like the hair
  const skin = C(COL.skin[o.skin % 4]), sl = skin.r * 0.3 + skin.g * 0.59 + skin.b * 0.11;
  skin.lerp(new THREE.Color(sl, sl, sl * 1.02), 0.05);
  const hair = C(COL.hair[o.skin % 4]), lipC = skin.clone().lerp(C(0x8a4f46), 0.4), brow = C(o.skin === 2 ? COL.hair[3] : COL.hair[o.skin % 4]).multiplyScalar(0.9);
  const wool = drill ? 'drill' : 'wool';
  const sh = (g) => (g.userData.shade ? (i) => g.userData.shade[i] : null);
  const addS = (g, bone, col, surf) => B.add(g, bone, col, surf, sh(g));
  // kit by the man (photographs: men at the gun often in the blouse and belt alone): skin 0 and 2 wear the Y straps
  // and pouches (1917: the cartridge pouches), 1 and 3 the belt; everyone the bread bag and canteen
  const straps = !cmd && o.skin % 2 === 0;
  const black = C(ww2 ? COL.ystrap : COL.gbelt), pouchC = C(ww2 ? COL.pouch44 : 0x2a2420);

  // ---- head, eyes, ears, neck (max: crew_face.js's head)
  if (q.max) maxHead(B, o, q, fig, skin, hair, lipC, brow);
  else {
    B.add(headGeometry(o.skin % 4, o.headgear === 'm35' || o.headgear === 'stahlhelm', q.H), 'head', (x, y, z) => headColour(x - HC.x, y - HC.y, z - HC.z, skin, hair, lipC, brow), 'skin');
    // eyes: a muted sclera barely brighter than the skin, grey-brown irises mostly; the lids are smooth shells round the
    // eyeball (upper and lower, a margin along each edge) so the opening is narrow and clean, not an iso-surface edge
    const iris = C([0x4a3d32, 0x5a5953, 0x3d332b, 0x4c5056][o.skin % 4]), sclera = skin.clone().lerp(C(0xc4bdb2), 0.3);
    const lidC = skin.clone().lerp(lipC, 0.08), ER = 0.0115;
    for (const s of SIDE) {
      const ex = s * 0.032, ey = HC.y + 0.0, ez = HC.z - 0.079; // set back so only the lids' opening shows the eyeball
      B.add(ellip(ER, ER, ER, ex, ey, ez, 24, 18), 'head', (x, y, z) => {
        const dz = ez - z, r = Math.hypot(x - ex, y - ey);
        return dz > 0.0095 && r < 0.0052 ? (r < 0.0021 ? C(0x0e0c0b) : iris) : sclera;
      }, 'eye');
      // the lids: two shells on a sphere a little larger than the eyeball, their edges an almond (widest a little in from
      // the middle, meeting at the corners), with a fine margin along each edge
      const tilt = s * 0.06; // the outer corner a touch higher
      const edge = (al, up) => (up ? 0.36 : -0.27) * Math.max(0, Math.cos(clamp(al * 1.18 - s * 0.08, -Math.PI / 2, Math.PI / 2))) ** 0.75;
      // each lid rises out of the skin: its outer rows sit just under the face and take the face's normals, so there is no
      // seam where it meets the face, and it swells to its edge over the eyeball
      const vr = { jaw: [0, 0.003][o.skin % 2], nose: [0, 0.003][o.skin % 2] }, gn = new V3();
      const lidGeo = (r, up) => {
        const rows = [], uvs = [], NA = segs(20), NE = segs(7);
        for (let k = 0; k <= NE; k++) {
          const row = [], ur = [], rk = lerp(ER * 0.95, r, sstep(0, 1, k / NE) ** 0.7);
          for (let i = 0; i <= NA; i++) {
            const al = lerp(-1.45, 1.45, i / NA), e0 = edge(al, up), e1 = up ? 1.35 : -1.35, el = lerp(e1, e0, k / NE);
            row.push(new V3(ex + Math.sin(al) * Math.cos(el) * rk, ey + Math.sin(el) * rk + Math.sin(al) * tilt * rk * 0.3, ez - Math.cos(al) * Math.cos(el) * rk));
            ur.push([al * r, el * r]);
          }
          rows.push(row); uvs.push(ur);
        }
        const g = orient(grid(rows, uvs), new V3(ex, ey, ez)), P = g.attributes.position, N = g.attributes.normal, sn = new V3();
        for (let k = 0; k <= NE; k++) for (let i = 0; i <= NA; i++) {
          const j = k * (NA + 1) + i, x = P.getX(j) - HC.x, y = P.getY(j) - HC.y, z = P.getZ(j) - HC.z, e = 0.0006;
          gn.set(headSDF(x + e, y, z, vr) - headSDF(x - e, y, z, vr), headSDF(x, y + e, z, vr) - headSDF(x, y - e, z, vr), headSDF(x, y, z + e, vr) - headSDF(x, y, z - e, vr)).normalize();
          sn.set(N.getX(j), N.getY(j), N.getZ(j));
          gn.lerp(sn, sstep(0.3, 1, k / NE)).normalize();
          N.setXYZ(j, gn.x, gn.y, gn.z);
        }
        return g;
      };
      B.add(lidGeo(ER * 1.05, true), 'head', lidC, 'skin');
      B.add(lidGeo(ER * 1.035, false), 'head', lidC, 'skin');
      for (const [up, r, k] of [[true, ER * 1.05, 0.0009], [false, ER * 1.035, 0.0006]]) {
        const pts = [];
        for (let i = 0, nm = segs(16); i <= nm; i++) {
          const al = lerp(-1.4, 1.4, i / nm), el = edge(al, up);
          pts.push(new V3(ex + Math.sin(al) * Math.cos(el) * r, ey + Math.sin(el) * r + Math.sin(al) * tilt * r * 0.3, ez - Math.cos(al) * Math.cos(el) * r));
        }
        B.add(tube(pts, pts.map(() => k), 5), 'head', lidC.clone().multiplyScalar(up ? 0.86 : 0.93), 'skin');
      }
      // ear: a flattened shell, its bowl pressed in, turned back a little
      const eg = ellip(0.0105, 0.03, 0.02, 0, 0, 0, 12, 12), ep = eg.attributes.position;
      for (let i = 0; i < ep.count; i++) {
        const x = ep.getX(i), y = ep.getY(i), z = ep.getZ(i), r = Math.hypot(y / 0.03, z / 0.02);
        if (x > 0) ep.setX(i, x - 0.009 * Math.max(0, 1 - r * r * 1.4));
      }
      eg.computeVertexNormals();
      if (s < 0) eg.scale(-1, 1, 1);
      place(eg, s * 0.079, HC.y - 0.006, HC.z + 0.012, 0.12, s * 0.28, 0);
      if (s < 0) { const ix = eg.index; if (ix) for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i); ix.setX(i, ix.getX(i + 1)); ix.setX(i + 1, t); } eg.computeVertexNormals(); }
      B.add(eg, 'head', skin.clone().lerp(lipC, 0.12), 'skin');
    }
    addS(lathe([[-0.06, 0.056], [0.0, 0.055], [0.06, 0.05], [0.1, 0.049], [0.14, 0.046]], 20, 0, 1.49, 0.018, 1, 0.95), 'neck', skin, 'skin');
  }

  // ---- torso: the blouse in three overlapping pieces, folds displaced
  const front = (a) => Math.max(0, Math.cos(a));
  const tmod = (a, y, x) => {
    let d = 0;
    // bunched over the belt and flared under it, vertical wrinkles in the bunch
    d += 0.006 * bump(1.04, 1.13, y) * (1 + 0.45 * Math.sin(a * 13 + 0.7) + 0.25 * Math.sin(a * 29));
    d += 0.004 * bump(0.9, 1.0, y) * (1 + 0.4 * Math.sin(a * 11 + 2));
    // the fly or button placket down the front
    d += 0.0025 * (1 - sstep(0.012, 0.022, Math.abs(x - 0.005))) * sstep(0.84, 0.86, y) * front(a);
    // side seams and a back seam
    d -= 0.0014 * (1 - sstep(0, 0.05, Math.abs(Math.abs(a - Math.PI) - Math.PI / 2)));
    d -= 0.0012 * (1 - sstep(0, 0.03, Math.abs(a - Math.PI))) * sstep(1.05, 1.1, y);
    // drag lines from the armpits across the chest and back
    d += 0.0018 * bump(1.24, 1.42, y) * sstep(0.9, 1.25, Math.abs(Math.sin(a))) * Math.sin((y - 1.2) * 95 + a * 2.5);
    // gentle drape over the shoulder blades and chest
    d += 0.0015 * Math.sin(a * 5 + y * 30) * bump(1.12, 1.44, y);
    return d;
  };
  const tc = cloth;
  addS(loft(torsoRings(0.765, 1.08).map((r, i) => (i === 0 ? { ...r, rx: r.rx * 0.985, rz: r.rz * 0.985 } : r)).concat([]), 40, tmod), 'hips', tc, wool);
  addS(loft(torsoRings(0.99, 1.235), 40, tmod), 'spine', tc, wool);
  const chestR = torsoRings(1.15, 1.505, 0.015);
  addS(loft(chestR.concat([{ y: 1.512, rx: 0.04, rz: 0.04, cz: 0.014, ex: 2 }, { y: 1.514, rx: 0.0005, rz: 0.0005, cz: 0.014 }]), 40, tmod), 'chest', tc, wool);
  // the hem's underside (the blouse is worn outside the trousers)
  addS(loft([{ y: 0.763, rx: 0.0005, rz: 0.0005, cz: 0.01 }, { y: 0.764, rx: 0.18, rz: 0.128, cz: 0.01, ex: 2.5 }, { y: 0.765, rx: 0.185, rz: 0.132, cz: 0.01, ex: 2.5 }], 40), 'hips', cloth.clone().multiplyScalar(0.7), wool);
  // shoulders: rounded sleeve heads over the joint
  for (const s of SIDE) addS(ellip(0.064, 0.062, 0.068, s * 0.178, 1.43, 0.01, 16, 12), 'chest', tc, wool);

  // collar: the stand round the neck and the turned-down points lying on the chest (1944 with the Litzen)
  const collarC = ww2 ? cloth : drill ? cloth : C(COL.gcollar);
  addS(lathe([[0.0, 0.073], [0.022, 0.075], [0.04, 0.073], [0.052, 0.068], [0.058, 0.062]], 32, 0, 1.468, 0.016, 1, 0.97,
    (a) => -0.012 * (1 - sstep(0.0, 0.42, Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))))), 'chest', collarC, wool); // open at the throat
  for (const s of SIDE) {
    const cmap = (u, v) => [s * (0.006 + 0.07 * u), lerp(1.448 + 0.036 * u, 1.5 + 0.004 * u, v)];
    addPart(B, slab(cmap, 8, 6, { lift: 0.004, thick: 0.004, edge: 0.2 }), 'chest', collarC, wool);
    if (ww2) { // Litzen: a dark green tab with two pale bars, on the collar point
      const L = onTorso(s * 0.045, 1.478, -1), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, -1), L.n);
      const g = rbox(0.032, 0.014, 0.003, 0.0012).applyQuaternion(q).translate(L.p.x + L.n.x * 0.011, L.p.y + L.n.y * 0.011, L.p.z + L.n.z * 0.011);
      B.add(g, 'chest', (x, y) => (Math.abs(((y - 1.478 + 0.0105) * 1000) % 7) < 2.6 ? C(0xa8a898) : C(COL.tab44)), 'wool');
    }
  }

  // shoulder straps (1944 piped in the artillery's red) with a button at the collar end
  for (const s of SIDE) {
    const strap = (w, h, d) => {
      const g = rbox(w, h, d, Math.min(0.004, h / 2 - 1e-4), 0, 0, 0, 0, 0, 0, 4), gp = g.attributes.position;
      for (let i = 0; i < gp.count; i++) { const x = gp.getX(i); if (x > w / 2 - 0.03) gp.setZ(i, gp.getZ(i) * (1 - (x - w / 2 + 0.03) * 12)); } // pointed at the collar
      g.computeVertexNormals();
      return place(g, s * 0.136, 1.493, 0.004, 0, s > 0 ? Math.PI : 0, 0.09);
    };
    if (ww2) B.add(strap(0.112, 0.005, 0.054), 'chest', C(COL.red44), 'wool');
    B.add(strap(0.106, 0.007, 0.048).translate(0, 0.0012, 0), 'chest', cloth, wool);
    B.add(button(s * 0.098, 1.5025, 0.004, 0.0062, new V3(s * -0.09, 1, 0)), 'chest', ww2 ? C(COL.button44) : C(COL.gbuckle), 'metal');
  }

  // front: buttons (1944: five; the drill jacket: six), pockets
  if (ww2 || drill) {
    const nb = ww2 ? 5 : 6, S = { p: new V3(), n: new V3() };
    for (let k = 0; k < nb; k++) {
      const y = 1.435 - k * (ww2 ? 0.1 : 0.085);
      onTorso(0.005, y, -1, S);
      B.add(button(S.p.x, S.p.y, S.p.z - 0.002, 0.0072, S.n), y < 1.16 ? (y < 1.04 ? 'hips' : 'spine') : 'chest', C(ww2 ? COL.button44 : 0x7a7768), 'metal');
    }
  }
  const pleat = (u) => -0.0018 * (1 - sstep(0.02, 0.06, Math.abs(u - 0.5))) + 0.0012 * (1 - sstep(0.06, 0.11, Math.abs(u - 0.5)));
  for (const s of SIDE) {
    if (ww2) {
      // pleated chest pockets with scalloped flaps
      const x0 = s * 0.035, x1 = s * 0.148, S = { p: new V3(), n: new V3() };
      addPart(B, slab((u, v) => [lerp(x0, x1, u), lerp(1.235, 1.355, v)], 10, 10, { thick: 0.004, relief: (u) => pleat(u) }), 'chest', cloth, wool);
      addPart(B, slab((u, v) => { const yb = 1.338 - 0.016 * Math.sin(Math.PI * u) ** 0.7; return [lerp(x0 - s * 0.003, x1 + s * 0.003, u), lerp(yb, 1.382, v)]; }, 12, 6, { lift: 0.008, thick: 0.004 }), 'chest', cloth.clone().multiplyScalar(0.98), wool);
      onTorso((x0 + x1) / 2, 1.33, -1, S);
      B.add(button(S.p.x, S.p.y, S.p.z, 0.0062, S.n.clone().add(new V3(0, 0, -0.01))), 'chest', C(COL.button44), 'metal');
      // hip pockets with their flaps (below the belt)
      const h0 = s * 0.04, h1 = s * 0.172;
      addPart(B, slab((u, v) => [lerp(h0, h1, u), lerp(0.8, 0.94, v)], 10, 10, { thick: 0.005, relief: (u) => pleat(u) }), 'hips', cloth, wool);
      addPart(B, slab((u, v) => { const yb = 0.925 - 0.016 * Math.sin(Math.PI * u) ** 0.7; return [lerp(h0 - s * 0.003, h1 + s * 0.003, u), lerp(yb, 0.965, v)]; }, 12, 6, { lift: 0.009, thick: 0.004 }), 'hips', cloth.clone().multiplyScalar(0.98), wool);
      onTorso((h0 + h1) / 2, 0.918, -1, S);
      B.add(button(S.p.x, S.p.y, S.p.z, 0.0062, S.n), 'hips', C(COL.button44), 'metal');
    } else {
      // M1915 Bluse: slanted hip pockets under flaps, no chest pockets (the drill jacket: plain)
      if (!drill) addPart(B, slab((u, v) => [lerp(s * 0.06, s * 0.175, u), lerp(0.905, 0.945, v) + (s > 0 ? -u : u - 1) * 0.03 * s * s], 12, 5, { lift: 0.006, thick: 0.004 }), 'hips', cloth, wool);
    }
  }
  // the back: a seam and (1944) the cloth tab of the belt hooks
  // ---- the belt and its buckle
  const beltY0 = 1.0, beltY1 = 1.046;
  addS(loft([0.998, 1.0, 1.046, 1.048].map((y, i) => { const R = ringAt(y); const k = i === 0 || i === 3 ? 0.006 : 0.0095; return { y, rx: R.rx + k, rz: R.rz + k, cz: R.cz, ex: 2.5 }; }), 48, null), 'spine', black, 'leather');
  {
    const S = onTorso(0, 1.023, -1);
    const bz = S.p.z - 0.011;
    B.add(rbox(0.062, 0.048, 0.008, 0.004, 0, 1.023, bz), 'spine', C(ww2 ? COL.gbuckle : COL.gbuckle), 'metal');
    B.add(button(0, 1.023, bz - 0.004, 0.015, new V3(0, 0, -1)), 'spine', C(ww2 ? 0x8a8a80 : 0x8d8d84), 'metal'); // the roundel, plain
    // belt hooks on the sides (the blouse's cloth tabs carry it)
    for (const s of SIDE) B.add(rbox(0.02, 0.03, 0.006, 0.002, s * 0.19, 1.023, 0.0, 0, s * Math.PI / 2, 0), 'spine', black, 'leather');
  }

  // ---- arms: loose sleeves with creases, cuffs, then the fists
  for (const s of SIDE) {
    const Sx = SFX[SIDE.indexOf(s)], x = s * SH_X, ey = SH_Y - L_UA, wy = ey - L_FA;
    const inner = (a) => Math.max(0, -Math.sin(a) * s); // toward the body
    const fwd = (a) => Math.max(0, Math.cos(a));
    const umod = (a, y) => 0.0025 * bump(SH_Y - 0.33, SH_Y - 0.2, y) * fwd(a) * Math.sin((y - ey) * 160 + a) // creases above the elbow
      + 0.0016 * Math.sin(a * 4 + y * 40) + 0.002 * bump(SH_Y - 0.12, SH_Y + 0.02, y) * inner(a) * Math.sin(y * 210);
    addS(lathe([[-0.345, 0.001], [-0.343, 0.03], [-0.33, 0.046], [-0.3, 0.053], [-0.22, 0.056], [-0.12, 0.06], [-0.04, 0.063], [0.0, 0.061], [0.03, 0.044], [0.046, 0.016], [0.05, 0.001]].map(([dy, r]) => [dy, r]), 26, x, SH_Y, SH_Z, 1, 1.06, umod), 'upperArm' + Sx, cloth, wool);
    // forearm: elbow creases at the top in front, the sleeve bunched above the cuff
    const fmod = (a, y) => 0.0032 * bump(ey - 0.07, ey + 0.03, y) * fwd(a) * (0.5 + 0.5 * Math.sin((y - ey) * 190 + a * 1.5))
      + 0.0026 * bump(wy + 0.06, wy + 0.13, y) * (0.6 + 0.4 * Math.sin(a * 6 + y * 120)) + 0.0012 * Math.sin(a * 3 + y * 55);
    addS(lathe([[-0.272, 0.001], [-0.27, 0.03], [-0.262, 0.044], [-0.245, 0.048], [-0.2, 0.047], [-0.12, 0.05], [-0.04, 0.054], [0.0, 0.054], [0.032, 0.042], [0.048, 0.02], [0.052, 0.001]], 22, x, ey, SH_Z, 1, 1.06, fmod), 'forearm' + Sx, cloth, wool);
    // cuff: a turned band, its slit at the back
    addS(lathe([[-0.272, 0.001], [-0.27, 0.047], [-0.262, 0.05], [-0.225, 0.051], [-0.22, 0.049], [-0.215, 0.001]], 22, x, ey, SH_Z, 1, 1.06, (a) => -0.003 * (1 - sstep(0, 0.25, Math.abs(a - Math.PI)))), 'forearm' + Sx, drill ? cloth : cloth.clone().multiplyScalar(0.97), wool);
    // the wrist and the fist
    hand(B, s, skin, lipC, q.max ? { nails: true, glove: fig?.man?.gloves ? 0.0013 : 0 } : null);
  }

  // ---- legs: trousers with creases, boots
  for (const s of SIDE) {
    const Sx = SFX[SIDE.indexOf(s)], x = s * HIP_X, ky = HIP_Y - L_TH;
    const outer = (a) => Math.max(0, Math.sin(a) * s);
    const thmod = (a, y) => 0.0022 * Math.sin(a * 3 + y * 25 + s) + 0.003 * bump(HIP_Y - 0.1, HIP_Y + 0.04, y) * Math.max(0, -Math.sin(a) * s) * Math.sin(a * 9 + y * 80) // crotch drag
      + 0.0028 * bump(ky - 0.02, ky + 0.09, y) * Math.max(0, -Math.cos(a)) * Math.sin(y * 170); // behind the knee
    const pipe = (px, py, pz) => (!ww2 && Math.abs(Math.atan2(px - x, -(pz + 0.004)) - s * Math.PI / 2) < 0.06 ? C(COL.piping) : legC);
    addS(lathe([[-0.48, 0.001], [-0.466, 0.05], [-0.425, 0.074], [-0.37, 0.081], [-0.28, 0.089], [-0.18, 0.096], [-0.08, 0.1], [0.0, 0.1], [0.03, 0.094], [0.065, 0.064], [0.085, 0.001]], 22, x, HIP_Y, -0.004, 1, 1.06, thmod), 'thigh' + Sx, pipe, wool);
    if (o.legs === 'gaiters') {
      // trousers to the ankle, gathered into canvas gaiters with two straps over laced ankle boots
      const smod = (a, y) => 0.0026 * bump(ky - 0.08, ky + 0.03, y) * Math.max(0, Math.cos(a)) * Math.sin(y * 160) + 0.004 * bump(ANKLE_Y + 0.12, ANKLE_Y + 0.2, y) * (0.6 + 0.4 * Math.sin(a * 7));
      addS(lathe([[-0.3, 0.001], [-0.29, 0.054], [-0.27, 0.062], [-0.2, 0.064], [-0.12, 0.068], [-0.05, 0.073], [0.0, 0.074], [0.04, 0.058], [0.062, 0.001]], 22, x, ky, 0.0, 1, 1.06, smod), 'shin' + Sx, pipe, wool);
      addS(lathe([[-0.005, 0.001], [0.0, 0.054], [0.05, 0.055], [0.12, 0.059], [0.135, 0.057], [0.142, 0.001]], 24, x, ANKLE_Y, 0.004, 1, 1.1, (a) => 0.0012 * Math.sin(a * 5)), 'shin' + Sx, C(COL.gaiter), 'canvas');
      for (const dy of [0.045, 0.1]) {
        addS(lathe([[-0.006, 0.0582], [0.006, 0.0582]], 24, x, ANKLE_Y + dy, 0.004, 1, 1.1), 'shin' + Sx, C(COL.ystrap), 'leather');
        B.add(rbox(0.004, 0.014, 0.012, 0.0015, x + s * 0.064, ANKLE_Y + dy, 0.004), 'shin' + Sx, C(0x6a6a62), 'metal');
      }
      boot(B, s, 'ankle');
    } else {
      // tucked into marching boots: the trousers bag over the boot tops
      const smod = (a, y) => 0.006 * bump(ANKLE_Y + 0.31, ANKLE_Y + 0.4, y) * (0.7 + 0.3 * Math.sin(a * 7 + s)) + 0.0025 * bump(ky - 0.07, ky + 0.03, y) * Math.max(0, Math.cos(a)) * Math.sin(y * 170);
      addS(lathe([[-0.11, 0.001], [-0.104, 0.062], [-0.08, 0.075], [-0.04, 0.076], [0.0, 0.075], [0.04, 0.058], [0.062, 0.001]], 22, x, ky, 0.0, 1, 1.06, smod), 'shin' + Sx, pipe, wool);
      boot(B, s, 'jack');
    }
  }

  // ---- kit on the belt and the straps
  const bone = (x, y) => (y < 0.995 ? 'hips' : y < 1.17 ? 'spine' : 'chest');
  if (straps) {
    if (ww2) {
      // two triple pouches either side of the buckle, flaps over each cell
      for (const s of SIDE) for (let k = 0; k < 3; k++) {
        const cx = s * (0.068 + k * 0.043), S = onTorso(cx, 1.075, -1), yaw = Math.atan2(-S.n.x, -S.n.z);
        const px = S.p.x + S.n.x * 0.026, pz = S.p.z + S.n.z * 0.026;
        B.add(rbox(0.04, 0.074, 0.038, 0.006, px, 1.062, pz, 0, yaw, 0), 'spine', pouchC, 'leather');
        const fl = rbox(0.043, 0.03, 0.04, 0.007, px + S.n.x * 0.002, 1.093, pz + S.n.z * 0.002, 0.05, yaw, 0);
        B.add(fl, 'spine', pouchC.clone().multiplyScalar(1.12), 'leather');
        B.add(button(px + S.n.x * 0.022, 1.075, pz + S.n.z * 0.022, 0.0035, S.n), 'spine', C(0x55554d), 'metal');
      }
      // Y straps: up from the pouches over the shoulders, down the back to the ring, one strap to the belt
      for (const s of SIDE) {
        const fr = surfPath([[s * 0.1, 1.11], [s * 0.104, 1.3], [s * 0.112, 1.43]], 8, -1, 0.0045, (y) => 0.0135 * sstep(1.215, 1.235, y) * (1 - sstep(1.385, 1.405, y)));
        const top = [new V3(s * 0.118, 1.47, -0.07), new V3(s * 0.124, 1.494, -0.02), new V3(s * 0.12, 1.49, 0.04), new V3(s * 0.11, 1.46, 0.09)];
        const bk = surfPath([[s * 0.1, 1.42], [s * 0.04, 1.3], [s * 0.008, 1.24]], 6, 1, 0.0045);
        const pts = [...fr.pts, ...top, ...bk.pts], up = [...fr.up, ...top.map((p) => new V3(s * 0.25, 1, p.z * 3).normalize()), ...bk.up];
        B.add(tube(pts, pts.map(() => [0.0022, 0.0125]), 6, { up }), bone, black, 'leather');
        const S = onTorso(s * 0.103, 1.2, -1);
        B.add(ring(S.p.x + S.n.x * 0.006, 1.2, S.p.z + S.n.z * 0.006, 0.009, 0.0016, S.n, Math.PI * 1.2), 'chest', C(0x55554d), 'metal');
      }
      const bk = surfPath([[0, 1.24], [0, 1.06]], 6, 1, 0.0045);
      B.add(tube(bk.pts, bk.pts.map(() => [0.0022, 0.014]), 6, { up: bk.up }), bone, black, 'leather');
      const S = onTorso(0, 1.245, 1);
      B.add(ring(S.p.x, 1.245, S.p.z + 0.006, 0.012, 0.002, S.n), 'chest', C(0x55554d), 'metal');
    } else {
      // 1917: the M1909 cartridge pouches, three a side, and the belt's braces
      for (const s of SIDE) for (let k = 0; k < 3; k++) {
        const cx = s * (0.07 + k * 0.044), S = onTorso(cx, 1.07, -1), yaw = Math.atan2(-S.n.x, -S.n.z);
        const px = S.p.x + S.n.x * 0.022, pz = S.p.z + S.n.z * 0.022;
        B.add(rbox(0.042, 0.07, 0.032, 0.007, px, 1.064, pz, 0, yaw, 0), 'spine', pouchC, 'leather');
        B.add(rbox(0.044, 0.026, 0.034, 0.008, px, 1.094, pz, 0.08, yaw, 0), 'spine', pouchC.clone().multiplyScalar(1.15), 'leather');
      }
      for (const s of SIDE) {
        const fr = surfPath([[s * 0.1, 1.11], [s * 0.11, 1.43]], 8, -1, 0.004);
        const top = [new V3(s * 0.118, 1.47, -0.07), new V3(s * 0.124, 1.494, -0.02), new V3(s * 0.12, 1.49, 0.04)];
        const bk = surfPath([[s * 0.11, 1.42], [s * 0.1, 1.06]], 8, 1, 0.004);
        const pts = [...fr.pts, ...top, ...bk.pts], up = [...fr.up, ...top.map((p) => new V3(s * 0.25, 1, p.z * 3).normalize()), ...bk.up];
        B.add(tube(pts, pts.map(() => [0.0022, 0.012]), 6, { up }), bone, black, 'leather');
      }
    }
  }
  // bread bag (right hip, behind) with its flap and tabs, the canteen and cup hung over it
  {
    const bx = 0.14, by = 0.915, bz = 0.125, yaw = -0.4;
    B.add(rbox(0.2, 0.16, 0.055, 0.02, bx, by, bz, 0, yaw, 0), 'hips', C(COL.brot), 'canvas');
    B.add(rbox(0.205, 0.08, 0.06, 0.018, bx + Math.sin(yaw) * 0.004, by + 0.045, bz + Math.cos(yaw) * 0.004, 0, yaw, 0), 'hips', C(COL.brot).multiplyScalar(1.05), 'canvas');
    for (const k of [-1, 1]) B.add(rbox(0.016, 0.07, 0.004, 0.002, bx + Math.cos(yaw) * k * 0.06 + Math.sin(yaw) * 0.032, by + 0.03, bz + Math.cos(yaw) * 0.032 - Math.sin(yaw) * k * 0.06, 0, yaw, 0), 'hips', black, 'leather');
    // canteen in its felt cover (1944: the black cup over the neck)
    const cx = 0.205, cz = 0.075;
    B.add(ellip(0.05, 0.088, 0.033, cx, 0.875, cz, 18, 14), 'hips', C(ww2 ? 0x6a5c44 : COL.canteen), 'felt');
    B.add(lathe([[0, 0.001], [0.0, 0.036], [0.045, 0.038], [0.048, 0.034], [0.05, 0.001]], 16, cx, 0.915, cz, 1, 0.75), 'hips', C(ww2 ? 0x24231f : 0x3a3530), 'paint');
    B.add(rbox(0.014, 0.16, 0.005, 0.002, cx + 0.02, 0.9, cz - 0.03, 0, -0.6, 0), 'hips', black, 'leather');
  }
  // the spade in its carrier on the left hip, the bayonet's scabbard strapped over it
  if (!cmd) {
    const sx = -0.205, sz = 0.04;
    B.add(rbox(0.032, 0.17, 0.15, 0.012, sx, 0.875, sz, 0.15, 0.25, 0), 'hips', C(ww2 ? COL.pouch44 : 0x2e2620), 'leather');
    B.add(tube([new V3(sx - 0.004, 0.79, sz - 0.03), new V3(sx - 0.006, 0.62, sz - 0.075)], [0.014, 0.012], 10), 'hips', C(0x6a4a2c), 'wood');
    B.add(tube([new V3(sx - 0.022, 0.96, sz - 0.05), new V3(sx - 0.026, 0.7, sz - 0.02)], [0.011, 0.008], 10), 'hips', C(0x2a2a28), 'paint');
    B.add(tube([new V3(sx - 0.022, 1.0, sz - 0.052), new V3(sx - 0.022, 0.96, sz - 0.05)], [0.012, 0.012], 8), 'hips', C(0x5a4030), 'wood'); // the grip
  } else {
    // the commander's pistol in its holster on the left front of the belt
    const S = onTorso(-0.15, 1.0, -1), yaw = Math.atan2(-S.n.x, -S.n.z);
    B.add(rbox(0.045, 0.13, 0.04, 0.014, S.p.x + S.n.x * 0.025, 0.97, S.p.z + S.n.z * 0.025, 0, yaw, 0.15), 'hips', black.clone().multiplyScalar(1.4), 'leather');
    B.add(rbox(0.05, 0.035, 0.044, 0.012, S.p.x + S.n.x * 0.026, 1.04, S.p.z + S.n.z * 0.026, 0.1, yaw, 0.15), 'hips', black.clone().multiplyScalar(1.6), 'leather');
  }
  // the gas mask canister: 1944 fluted, slung behind on the left; 1917 the tin at the chest in the ready position
  const flute = [];
  for (let k = 0; k <= 12; k++) { const y = -0.13 + k * 0.0216; flute.push([y, k === 0 || k === 12 ? 0.001 : 0.052 + (k % 2 ? 0.0028 : 0)]); }
  flute.splice(1, 0, [-0.128, 0.049]); flute.splice(flute.length - 1, 0, [0.128, 0.05]);
  if (ww2) {
    const g = lathe(flute, 22, 0, 0, 0);
    B.add(g.rotateZ(0.5).translate(-0.12, 0.98, 0.175), 'hips', C(COL.can44), 'paint');
    B.add(lathe([[0, 0.001], [0, 0.055], [0.025, 0.055], [0.03, 0.001]], 22, 0, 0.13, 0).rotateZ(0.5).translate(-0.12, 0.98, 0.175), 'hips', C(COL.can44).multiplyScalar(0.92), 'paint'); // lid
    if (!straps) B.add(tube([new V3(-0.16, 1.06, 0.2), new V3(-0.1, 1.2, 0.17), new V3(0.0, 1.38, 0.13)], [[0.002, 0.008], [0.002, 0.008], [0.002, 0.008]], 6), bone, C(0x4a4a3c), 'canvas');
  } else {
    const g = lathe(flute.map(([y, r]) => [y * 0.82, r]), 22, 0, 0, 0);
    B.add(g.rotateX(-0.12).rotateZ(0.35).translate(-0.075, 1.21, -0.178), 'chest', C(COL.gascan), 'paint');
    B.add(tube([new V3(-0.04, 1.3, -0.15), new V3(0.06, 1.4, -0.13), new V3(0.13, 1.47, -0.06), new V3(0.13, 1.47, 0.06), new V3(0.04, 1.32, 0.135), new V3(-0.1, 1.12, 0.13)], Array(6).fill([0.002, 0.009]), 6), bone, C(COL.strap), 'canvas');
  }

  // ---- headgear
  headgear(B, o, cloth, ww2, q.max ? faceField(FACES[faceOf(o, fig)]) : null);
  return B.geometry();
}

// ---------------------------------------------------------------- the max tier's head (crew_face.js)

// aMax by surface: [texture layer (crew_tex.js; -1 skin, -2 eye), skin weight (light wraps round skin), wear, under
// the brim (the helmet's analytic shade falls on it)]
const LAYER = { wool: 0, drill: 1, canvas: 2, felt: 3, leather: 4, boot: 5, sole: 5, paint: 6, metal: 7, wood: 8, skin: -1, lip: -1, hair: -1, eye: -2 };
function maxDefaults(surf) { return [LAYER[surf] ?? 0, surf === 'skin' || surf === 'lip' ? 1 : 0, 1, 0]; }
// the headgear whose brim shades the face (crew_maxmat.js crewBrim): 1 M1935, 2 M1916, 3 the M43 cap's peak
const brimKind = (o) => ({ m35: 1, stahlhelm: 2, m43: 3 })[o.headgear] ?? 0;
// crew_maxmat.js's brim test in JS: 1 when the ray from bind-space p along d leaves under the rim, 0 when it meets it
function brimLit(kind, px, py, pz, dx, dy, dz) {
  if (kind <= 0 || dy <= 0.02) return 1;
  if (kind === 3) {
    const t = (1.688 - py) / dy;
    if (t < 0) return 1;
    const qx = px + dx * t, qz = pz + dz * t, a = Math.atan2(qx, -(qz - 0.006)), r = Math.hypot(qx / 0.0945, (qz - 0.006) / 0.1095);
    if (r < 1) return sstep(0.92, 1, r);
    const w = Math.abs(a) < 1 ? Math.cos(a * 1.5708) ** 0.6 : 0;
    return sstep(0.96, 1.04, Math.hypot(qx / (0.093 + 0.058 * w), (qz - 0.006) / (0.109 + 0.064 * w)));
  }
  let t0 = 0, t1 = (1.86 - py) / dy;
  const rimAt = (t) => { const qx = px + dx * t, qz = pz + dz * t, a = Math.atan2(qx, -(qz - 0.012)), F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a)); return { qx, qz, a, F, Bk, y: rimY(kind === 1, F, Bk) }; };
  for (let i = 0; i < 12; i++) { const t = (t0 + t1) / 2; if (py + dy * t > rimAt(t).y) t1 = t; else t0 = t; }
  const q = rimAt(t1), rx = 0.111, rz = kind === 1 ? 0.128 : 0.129;
  const R = 1 / Math.hypot(Math.sin(q.a) / rx, Math.cos(q.a) / rz) + 0.004 + (kind === 1 ? 0.012 + 0.004 * q.F + 0.022 * q.Bk ** 1.2 : 0.022 + 0.008 * q.F + 0.034 * q.Bk ** 1.2);
  return sstep(-0.004, 0.006, Math.hypot(q.qx, q.qz - 0.012) - R);
}
// the sky a head vertex sees past the brim (ambient occlusion by the helmet): cosine-weighted directions about its normal
const AO_DIRS = Array.from({ length: 24 }, (_, i) => { const u = (i + 0.5) / 24, ph = i * 2.39996; const r = Math.sqrt(u); return [r * Math.cos(ph), Math.sqrt(1 - u), r * Math.sin(ph)]; });
function brimAO(kind, p, n) {
  if (kind <= 0) return 1;
  // a frame about the normal
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let bx = n[1] * t[2] - n[2] * t[1], by = n[2] * t[0] - n[0] * t[2], bz = n[0] * t[1] - n[1] * t[0];
  const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
  const cx = n[1] * bz - n[2] * by, cy = n[2] * bx - n[0] * bz, cz = n[0] * by - n[1] * bx;
  let s = 0, w = 0;
  for (const [a, h, b] of AO_DIRS) {
    const dx = bx * a + n[0] * h + cx * b, dy = by * a + n[1] * h + cy * b, dz = bz * a + n[2] * h + cz * b;
    const sky = 0.35 + 0.65 * Math.max(0, dy); // (the sky above gives more than the ground's bounce)
    s += sky * brimLit(kind, p[0], p[1], p[2], dx, dy, dz); w += sky;
  }
  return lerp(0.35, 1, s / w);
}
const headKind = (o) => (o.headgear === 'm35' ? 'helmet35' : o.headgear === 'stahlhelm' ? 'helmet16' : o.headgear === 'm43' || o.headgear === 'feldmuetze' ? 'cap' : 'none');
// which of the five faces a figure has: its man's (fig.man.face, render/crewhd.js gives each man of the lesson's battery
// his own), else by the outfit's skin
export const faceOf = (o, fig) => (fig?.man?.face ?? o.skin) % FACES.length;

// the meshed heads and ears by face, cut and lattice (the slow part: built a slice at a time by maxStep)
const faceMeshes = new Map(), faceMeshers = new Map();
function* headPrep(fi, kind, H) {
  const k = `${fi}|${kind}|${H}`;
  if (!faceMeshes.has(k)) faceMeshes.set(k, yield* meshFace(FACES[fi], kind, H));
  if (kind === 'cap' || kind === 'none') for (const s of SIDE) {
    const ke = `ear|${fi}|${s}`;
    if (!faceMeshes.has(ke)) faceMeshes.set(ke, yield* meshEar(FACES[fi], s));
  }
}
// advance the meshing a figure's head needs by up to `ms` (Infinity: to the end); true when it is all meshed
function meshMax(o, fig, ms = Infinity) {
  const fi = faceOf(o, fig), kind = headKind(o), k = `${fi}|${kind}|${PROFILE.max.H}`;
  if (faceMeshes.has(k) && (kind === 'helmet35' || kind === 'helmet16' || faceMeshes.has(`ear|${fi}|1`))) return true;
  let it = faceMeshers.get(k);
  if (!it) faceMeshers.set(k, it = headPrep(fi, kind, PROFILE.max.H));
  const t0 = performance.now();
  while (!it.next().done) if (performance.now() - t0 > ms) return false;
  faceMeshers.delete(k);
  return true;
}

const lin = (c) => [c.r, c.g, c.b];
function arraysGeo(pos, idx, nrm = null, off = HC) {
  const g = new THREE.BufferGeometry(), P = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { P[i] = pos[i] + off.x; P[i + 1] = pos[i + 1] + off.y; P[i + 2] = pos[i + 2] + off.z; }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(nrm), 3));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1));
  if (!nrm) { g.computeVertexNormals(); weldNormals(g); }
  return g;
}

function maxHead(B, o, q, fig, skin, hair, lipC, brow) {
  const fi = faceOf(o, fig), F = FACES[fi], kind = headKind(o), BK = brimKind(o);
  meshMax(o, fig);
  const field = faceField(F);
  // the man's colours (per-man tints come in through fig.man: render/crewhd.js)
  const man = fig?.man ?? {};
  // (the skin's albedo 5 % under the hd tier's: the max material's wrapped light gives it back on the lit side)
  const P = {
    skin: lin(skin).map((v) => v * 0.95), hair: lin(hair), brow: lin(brow), lip: lin(lipC),
    stubble: lin(C(0x4e4c4a)), flush: lin(skin.clone().lerp(C(0xa0544a), 0.55)),
    ruddy: man.ruddy ?? 1, beard: man.beard ?? 1,
  };
  const paint = { c: [0, 0, 0], r: 0.5, m: [0, 0, 0, 0] };
  // the face and neck: one surface, skinned between the head and the neck
  {
    const m = faceMeshes.get(`${fi}|${kind}|${q.H}`), n = m.pos.length / 3;
    const cols = new Float32Array(n * 3), rough = new Float32Array(n), masks = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      headPaint(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], F, P, paint);
      cols.set(paint.c, i * 3); rough[i] = paint.r; masks.set(paint.m, i * 4);
    }
    const g = arraysGeo(m.pos, m.idx, m.nrm);
    const cc = new THREE.Color();
    const bk = brimKind(o), ao = new Float32Array(n), Pp = g.attributes.position.array, Nn = g.attributes.normal.array;
    for (let i = 0; i < n; i++) ao[i] = brimAO(bk, Pp.subarray(i * 3, i * 3 + 3), Nn.subarray(i * 3, i * 3 + 3));
    B.add(g, 'head+neck', (x, y, z, i) => cc.setRGB(cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]), 'skin', null, {
      surf: (i) => [rough[i], 0, 0.03, 0.1], max: (i) => [-1, 1, ao[i], bk], face: (i) => masks.subarray(i * 4, i * 4 + 4),
    });
  }
  // the ears (a helmet covers them)
  if (kind === 'cap' || kind === 'none') for (const s of SIDE) {
    const m = faceMeshes.get(`ear|${fi}|${s}`), g = arraysGeo(m.pos, m.idx, m.nrm), red = skin.clone().lerp(C(0xa0544a), 0.2);
    B.add(g, 'head', red, 'skin', null, { surf: () => [0.5, 0, 0.03, 0.1], max: () => [-1, 1, 1, brimKind(o)] });
  }
  // the eyes, the lids round them, the lash and tear lines, the caruncle
  // irises: grey-blue, brown, green-grey, hazel, dark brown
  const iris = C([0x8796a0, 0x7a5a40, 0x8a8f78, 0x9a7a52, 0x5a4232][(man.iris ?? o.skin) % 5]), sclera = C(0xc2bbb0).lerp(skin, 0.15);
  const lidC = skin.clone().lerp(lipC, 0.12).multiplyScalar(0.97);
  // sink: lid points behind the face's surface go just under it (the face covers the lid's outer rows)
  const e = 0.0002, gr = new V3();
  const sink = (p) => {
    for (let it = 0; it < 3; it++) {
      const f0 = field(p[0], p[1], p[2]);
      if (f0 > 0.0006) return p;
      gr.set(field(p[0] + e, p[1], p[2]) - field(p[0] - e, p[1], p[2]), field(p[0], p[1] + e, p[2]) - field(p[0], p[1] - e, p[2]), field(p[0], p[1], p[2] + e) - field(p[0], p[1], p[2] - e)).normalize();
      const t = f0 + 0.0004;
      if (t < 0) return p;
      p[0] -= gr.x * t; p[1] -= gr.y * t; p[2] -= gr.z * t;
    }
    return p;
  };
  for (const s of SIDE) {
    const cx = s * F.eyeX, cy = F.eyeY, cz = -0.080;
    // the eyeball: the sclera's sphere with the cornea's bulge in front; uv: millimetres off its axis (the iris)
    const eg = new THREE.SphereGeometry(1, segs(30), segs(22)), ep = eg.attributes.position, euv = eg.attributes.uv, v = new V3();
    for (let i = 0; i < ep.count; i++) {
      v.fromBufferAttribute(ep, i);
      const t = Math.acos(clamp(-v.z, -1, 1)), r = eyeRadius(t);
      ep.setXYZ(i, cx + v.x * r + HC.x, cy + v.y * r + HC.y, cz + v.z * r + HC.z);
      euv.setXY(i, v.x * r * 1000, v.y * r * 1000);
    }
    eg.computeVertexNormals(); weldNormals(eg);
    B.add(eg, 'head', (x, y, z) => {
      const dx = x - cx - HC.x, dy = y - cy - HC.y, front = -(z - cz - HC.z), rr = Math.hypot(dx, dy);
      if (front < 0.004) return sclera;
      return rr < 0.0021 ? C(0x0b0a09) : rr < 0.0059 ? iris : rr < 0.0064 ? iris.clone().multiplyScalar(0.55).lerp(sclera, sstep(0.0061, 0.0066, rr)) : sclera;
    }, 'eye', null, {
      surf: (i) => { const z = ep.getZ(i) - HC.z - cz; return [-z > 0.0095 ? 0.04 : 0.16, 0, 0, 0]; },
      max: () => [-2, 0, 0.7, BK], face: () => [iris.r, iris.g, iris.b, 1],
    });
    const L = lidRows(F, s, segs(20));
    const rowsU = L.upper.map((r) => r.map(sink)), rowsL = L.lower.map((r) => r.map(sink));
    const eyeC = new V3(cx + HC.x, cy + HC.y, cz + HC.z);
    const lidGeo = (rows) => {
      const a = gridArrays(rows), g = orient(arraysGeo(a.pos, a.idx), eyeC); // (faces away from the eyeball)
      // the outer rows take the face's normals (no seam where the lid goes under the face)
      const N = g.attributes.normal, Pp = g.attributes.position, m = rows[0].length, gn = new V3();
      for (let k = 0; k < rows.length; k++) for (let i = 0; i < m; i++) {
        const j = k * m + i, x = Pp.getX(j) - HC.x, y = Pp.getY(j) - HC.y, z = Pp.getZ(j) - HC.z;
        const w = sstep(0.45, 1, k / (rows.length - 1));
        if (w <= 0) continue;
        gn.set(field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e)).normalize();
        v.set(N.getX(j), N.getY(j), N.getZ(j)).lerp(gn, w).normalize();
        N.setXYZ(j, v.x, v.y, v.z);
      }
      return g;
    };
    const wet = (rows, kWet) => (i) => [Math.floor(i / rows[0].length) < kWet ? 0.18 : 0.48, 0, 0.03, 0.1];
    B.add(lidGeo(rowsU), 'head', lidC, 'skin', null, { surf: wet(rowsU, 1), max: () => [-1, 1, 0.8, BK] });
    B.add(lidGeo(rowsL), 'head', lidC, 'skin', null, { surf: wet(rowsL, 1), max: () => [-1, 1, 0.8, BK] });
    const dark = C(0x15110e), lashC = brow.clone().multiplyScalar(0.55);
    B.add(tube(L.lashLine.map((p) => new V3(p[0] + HC.x, p[1] + HC.y, p[2] + HC.z)), L.lashLine.map(() => 0.00042), 4, { capA: false, capB: false }), 'head', dark, 'hair', null, { surf: () => [0.6, 0, 0, 0], max: () => [-1, 0, 0.8, BK] });
    for (const flip of [false, true]) {
      const a = gridArrays(L.lashes, flip), g = arraysGeo(a.pos, a.idx);
      B.add(g, 'head', lashC, 'hair', null, { surf: () => [0.65, 0, 0, 0], max: () => [-1, 0, 0.8, BK] });
    }
    B.add(tube(L.tearLine.map((p) => new V3(p[0] + HC.x, p[1] + HC.y, p[2] + HC.z)), L.tearLine.map(() => 0.0003), 4, { capA: false, capB: false }), 'head', skin.clone().lerp(C(0xc07a70), 0.5), 'skin', null, { surf: () => [0.05, 0, 0, 0], max: () => [-1, 0.5, 0.75, BK] });
    const ci = L.inner;
    B.add(ellip(0.0018, 0.0022, 0.0016, ci[0] + HC.x - s * 0.0006, ci[1] + HC.y, ci[2] + HC.z + 0.0008, 8, 6), 'head', skin.clone().lerp(C(0xb46a62), 0.6), 'skin', null, { surf: () => [0.12, 0, 0, 0], max: () => [-1, 1, 0.8, BK] });
  }
}

function addPart(B, g, bone, col, surf) { B.add(g, bone, col, surf, g.userData.shade ? (i) => g.userData.shade[i] : null); }

// The fist: palm, four fingers of three phalanges curled round the grip point (crew.js GRIP: 0.032 in, 0.092 down
// from the wrist), the thumb across them. Rigid on the hand bone.
// max (opt): { nails, glove } the max tier's fist: nails on the bare fingers, or the whole fist in a leather work glove
// (glove: the leather's thickness) with a cuff over the wrist, for the men at the shells (the Norway photographs)
function hand(B, s, skin0, lipC, opt = null) {
  const Sx = SFX[SIDE.indexOf(s)], W = new V3(s * SH_X, SH_Y - L_UA - L_FA, SH_Z);
  const IN = new V3(-s, 0, 0), DN = new V3(0, -1, 0), FW = new V3(0, 0, -1);
  const at = (i, d, f) => W.clone().addScaledVector(IN, i).addScaledVector(DN, d).addScaledVector(FW, f);
  const gl = opt?.glove ?? 0, skin = gl ? C(0x4b3a2b) : skin0, surf = gl ? 'leather' : 'skin';
  const knuckle = gl ? skin.clone().multiplyScalar(1.12) : skin.clone().lerp(lipC, opt ? 0.22 : 0.1);
  const R = (r) => r + gl; // (the glove's leather over every part)
  // wrist and palm
  B.add(tube([at(0, -0.035, 0), at(0, 0.0, 0), at(0.002, 0.02, 0)], [[R(0.023), R(0.03)], [R(0.022), R(0.029)], [R(0.019), R(0.032)]], 14, { capA: false, up: [IN, IN, IN] }), 'hand' + Sx, skin, surf);
  if (gl) { // the glove's cuff, flared over the sleeve's end
    B.add(tube([at(0, -0.06, 0), at(0, -0.035, 0), at(0, -0.012, 0)], [[0.034, 0.04], [0.031, 0.037], [R(0.024), R(0.031)]], 18, { up: [IN, IN, IN] }), 'hand' + Sx, skin.clone().multiplyScalar(0.92), surf);
  }
  // the palm and the back of the hand: a loft down from the wrist, thin at the edges, domed over the back
  const PR = [[0.012, 0.021, 0.027, 0, 0.001], [-0.008, 0.02, 0.03, 0.001, 0], [-0.035, 0.0175, 0.037, 0.003, -0.002], [-0.065, 0.016, 0.041, 0.004, 0],
    [-0.088, 0.0155, 0.042, 0.004, 0.001], [-0.1, 0.0125, 0.038, 0.005, 0.001], [-0.106, 0.007, 0.028, 0.005, 0.001], [-0.108, 0.0005, 0.0005, 0.005, 0.001]];
  const pg = loft(PR.map(([dy, t, w, ci, cz]) => ({ y: W.y + dy, rx: t + (t > 0.001 ? gl : 0), rz: w + (w > 0.001 ? gl : 0), cx: W.x + IN.x * ci, cz: W.z + cz, ex: 2.3 })), 20,
    (a) => 0.003 * Math.max(0, Math.sin(a) * s)); // the back of the hand (outward) a little fuller than the palm
  B.add(pg, 'hand' + Sx, skin, surf);
  B.add(ellip(R(0.012), R(0.03), R(0.018), W.x + IN.x * 0.011, W.y - 0.05, W.z - 0.028, 10, 8), 'hand' + Sx, skin, surf); // thenar
  // fingers: index (front) to little (back)
  const F = [
    { z: -0.026, y: 0.096, L: [0.044, 0.027, 0.021], r: 0.0094 },
    { z: -0.0085, y: 0.1, L: [0.048, 0.03, 0.023], r: 0.0097 },
    { z: 0.0095, y: 0.098, L: [0.045, 0.028, 0.022], r: 0.0092 },
    { z: 0.026, y: 0.09, L: [0.036, 0.021, 0.019], r: 0.0082 },
  ];
  F.forEach((f, k) => {
    let th = 1.2 + k * 0.03, p = at(0.003, f.y, f.z * 1.0);
    const pts = [p.clone()], rad = [f.r * 1.08];
    const bends = [1.62, 0.98];
    for (let j = 0; j < 3; j++) {
      const d = DN.clone().multiplyScalar(Math.cos(th)).addScaledVector(IN, Math.sin(th));
      const mid = p.clone().addScaledVector(d, f.L[j] * 0.5);
      p = p.clone().addScaledVector(d, f.L[j]);
      pts.push(mid, p.clone());
      rad.push(f.r * (1 - j * 0.07), f.r * (j === 2 ? 0.82 : 0.97 - j * 0.07));
      if (j < 2) th += bends[j];
    }
    B.add(tube(pts, rad.map(R), 8), 'hand' + Sx, (x, y, z) => skin, surf);
    B.add(ellip(R(f.r * 1.1), R(f.r * 1.05), R(f.r * 1.1), pts[0].x - IN.x * 0.003, pts[0].y + 0.002, pts[0].z, 8, 6), 'hand' + Sx, knuckle, surf);
    if (opt?.nails && !gl) {
      // the nail: a thin curved plate on the back of the last phalanx (away from the grip it curls round), pale, its
      // free edge whiter
      const a = pts[4], b = pts[6], dir = b.clone().sub(a).normalize(), mid = a.clone().lerp(b, 0.62);
      const out = mid.clone().sub(at(0.032, 0.092, f.z)), r = f.r * 0.86;
      out.addScaledVector(dir, -out.dot(dir)).normalize();
      const ng = ellip(r * 0.74, 0.0062, 0.0011, 0, 0, 0, 10, 8), m4 = new THREE.Matrix4().makeBasis(dir.clone().cross(out).normalize(), dir, out);
      ng.applyMatrix4(m4).translate(mid.x + out.x * r * 0.93, mid.y + out.y * r * 0.93, mid.z + out.z * r * 0.93);
      const nc = skin.clone().lerp(C(0xe8cfc4), 0.45), tip = C(0xefe3d8);
      B.add(ng, 'hand' + Sx, (x, y, z) => nc.clone().lerp(tip, sstep(0.0035, 0.0058, (x - mid.x) * dir.x + (y - mid.y) * dir.y + (z - mid.z) * dir.z)), 'skin', null, { surf: () => [0.3, 0, 0.02, 0.1], max: () => [-1, 0.4, 1, 0] });
    }
  });
  // thumb: from the base of the palm in front, down across the index finger
  const tp = [at(0.006, 0.032, -0.03), at(0.016, 0.055, -0.042), at(0.032, 0.074, -0.04), at(0.047, 0.088, -0.033), at(0.054, 0.097, -0.026)];
  B.add(tube(tp, [0.0125, 0.0115, 0.0105, 0.0098, 0.0085].map(R), 10), 'hand' + Sx, skin, surf);
  if (opt?.nails && !gl) { // the thumbnail
    const a = tp[3], b = tp[4], dir = b.clone().sub(a).normalize(), mid = a.clone().lerp(b, 0.5), out = IN.clone().multiplyScalar(-1).addScaledVector(FW, 0.6);
    out.addScaledVector(dir, -out.dot(dir)).normalize();
    const ng = ellip(0.0068, 0.0064, 0.0011, 0, 0, 0, 10, 8), m4 = new THREE.Matrix4().makeBasis(dir.clone().cross(out).normalize(), dir, out);
    ng.applyMatrix4(m4).translate(mid.x + out.x * 0.0082, mid.y + out.y * 0.0082, mid.z + out.z * 0.0082);
    B.add(ng, 'hand' + Sx, skin.clone().lerp(C(0xe8cfc4), 0.45), 'skin', null, { surf: () => [0.3, 0, 0.02, 0.1], max: () => [-1, 0.4, 1, 0] });
  }
}

// The boots. jack: the marching boot to below the knee, concertina folds at the ankle, a heel and welted sole.
// ankle: the laced ankle boot under the gaiter.
function boot(B, s, kind) {
  const Sx = SFX[SIDE.indexOf(s)], x = s * HIP_X, leather = C(COL.jackboot), dark = leather.clone().multiplyScalar(0.7);
  if (kind === 'jack') {
    const fold = (a, y) => {
      const k = bump(ANKLE_Y + 0.02, ANKLE_Y + 0.17, y);
      return k * 0.0065 * Math.sin((y - ANKLE_Y) * 120 + Math.sin(a * 2 + s) * 1.8) + 0.0012 * Math.sin(a * 3 + y * 20);
    };
    const g = lathe([[-0.03, 0.001], [-0.025, 0.054], [0.04, 0.057], [0.14, 0.058], [0.26, 0.064], [0.33, 0.069], [0.335, 0.067], [0.338, 0.063], [0.34, 0.001]], 24, x, ANKLE_Y, 0.006, 1, 1.1, fold, 30);
    B.add(g, 'shin' + Sx, (px, py) => (py > ANKLE_Y + 0.326 ? dark : leather), 'boot', (i) => g.userData.shade[i]);
    // the back seam of the shaft
    B.add(tube([new V3(x, ANKLE_Y + 0.05, 0.006 + 0.063), new V3(x, ANKLE_Y + 0.33, 0.006 + 0.076)], [0.0025, 0.0025], 6), 'shin' + Sx, dark, 'boot');
  } else {
    const g = lathe([[-0.03, 0.001], [-0.025, 0.05], [0.03, 0.052], [0.05, 0.05], [0.055, 0.001]], 26, x, ANKLE_Y, 0.008, 1, 1.12);
    B.add(g, 'shin' + Sx, leather, 'boot');
  }
  // the foot: the upper as a loft from heel to toe, then the sole and the heel block
  const rings = [
    { y: -0.085, rx: 0.026, rz: 0.03, cz: 0.05 }, { y: -0.075, rx: 0.042, rz: 0.048, cz: 0.052 }, { y: -0.04, rx: 0.049, rz: 0.06, cz: 0.062 },
    { y: 0.0, rx: 0.052, rz: 0.062, cz: 0.062 }, { y: 0.04, rx: 0.054, rz: 0.058, cz: 0.058 }, { y: 0.09, rx: 0.056, rz: 0.046, cz: 0.046 },
    { y: 0.14, rx: 0.056, rz: 0.04, cz: 0.04 }, { y: 0.18, rx: 0.052, rz: 0.035, cz: 0.034 }, { y: 0.205, rx: 0.044, rz: 0.03, cz: 0.03 },
    { y: 0.222, rx: 0.03, rz: 0.024, cz: 0.026 }, { y: 0.23, rx: 0.012, rz: 0.012, cz: 0.024 }, { y: 0.232, rx: 0.0005, rz: 0.0005, cz: 0.022 },
  ].map((r) => ({ ...r, ex: 2.4 }));
  const fg = loft(rings, 20, (a, y) => (kind === 'jack' ? 0.0012 * bump(0.04, 0.09, y) * Math.sin(a * 8) : 0));
  const fp = fg.attributes.position;
  for (let i = 0; i < fp.count; i++) if (fp.getZ(i) < 0.014) fp.setZ(i, 0.014); // flat on the sole
  fg.computeVertexNormals();
  fg.rotateX(-Math.PI / 2).translate(x, 0, 0);
  B.add(fg, 'foot' + Sx, leather, 'boot');
  // the sole: a slab a little proud of the upper, the heel block under the back
  const sole = new THREE.Shape();
  const outline = [[-0.045, 0.085], [-0.054, 0.04], [-0.058, -0.04], [-0.058, -0.13], [-0.05, -0.19], [-0.03, -0.226], [0.0, -0.236], [0.03, -0.226], [0.05, -0.19], [0.058, -0.13], [0.056, -0.04], [0.052, 0.04], [0.045, 0.085], [0.0, 0.095]];
  outline.forEach(([a, b], i) => (i ? sole.lineTo(a, b) : sole.moveTo(a, b)));
  const sg = new THREE.ExtrudeGeometry(sole, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 });
  sg.rotateX(Math.PI / 2).translate(x, 0.016, 0);
  B.add(sg, 'foot' + Sx, (px, py) => (py < 0.006 ? C(0x141210) : C(0x2a2520)), 'sole');
  B.add(rbox(0.07, 0.022, 0.075, 0.006, x, 0.011, 0.058), 'foot' + Sx, C(0x1e1b18), 'sole');
}

// ---------------------------------------------------------------- headgear

function helmetShell(m35) {
  const n = segs(48), rows = [], uvs = [], RX = 0.111, RZ = m35 ? 0.128 : 0.129, CZ = 0.012;
  const R = (a) => 1 / Math.hypot(Math.sin(a) / RX, Math.cos(a) / RZ);
  const prof = m35
    ? [['d', 0], ['d', 0.15], ['d', 0.3], ['d', 0.45], ['d', 0.6], ['d', 0.75], ['d', 0.9], ['d', 1.05], ['d', 1.18], ['d', 1.25], ['s', 0], ['k', 0.2], ['k', 0.45], ['k', 0.7], ['k', 0.88], ['k', 1], ['r', 0.5], ['r', 1], ['i', 1], ['i', 0.5], ['i', 0]]
    : [['d', 0], ['d', 0.15], ['d', 0.3], ['d', 0.45], ['d', 0.6], ['d', 0.75], ['d', 0.9], ['d', 1.05], ['d', 1.16], ['d', 1.22], ['s', 0], ['s', 0.06], ['k', 0.2], ['k', 0.45], ['k', 0.7], ['k', 0.88], ['k', 1], ['r', 0.5], ['r', 1], ['i', 1], ['i', 0.5], ['i', 0]];
  for (const [kind, v] of prof) {
    const row = [], ur = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a)), r0 = R(a);
      let yStep, yRim, flare, dPh, dTop;
      if (m35) { yStep = 1.708 + 0.008 * F - 0.01 * Bk; yRim = 1.618 + 0.082 * F ** 2 - 0.026 * Bk ** 1.3; flare = 0.012 + 0.004 * F + 0.022 * Bk ** 1.2; dPh = 1.25; dTop = 0.13; } else { yStep = 1.712 + 0.01 * F - 0.012 * Bk; yRim = 1.6 + 0.104 * F ** 2 - 0.034 * Bk ** 1.3; flare = 0.022 + 0.008 * F + 0.034 * Bk ** 1.2; dPh = 1.22; dTop = 0.128; }
      let r, y;
      if (kind === 'd') { const ph = Math.min(v, dPh); r = r0 * Math.sin(ph) / Math.sin(dPh); y = yStep + dTop * (Math.cos(ph) - Math.cos(dPh)); }
      else if (kind === 's') { r = r0 + 0.002 + v * 0.1 * flare; y = yStep - 0.006 - v * 0.012; }
      else if (kind === 'k') { const e = v * v, y0 = yStep - (m35 ? 0.006 : 0.012); r = r0 + 0.004 + e * flare; y = y0 + (yRim - y0) * v; }
      else if (kind === 'r') { const ph = v * Math.PI; r = r0 + 0.004 + flare + Math.sin(ph) * 0.0028 - (1 - Math.cos(ph)) * 0.0012; y = yRim - (1 - Math.cos(ph)) * 0.0022; } // the rolled edge
      else { r = r0 - 0.004 + v * (flare - 0.002); y = yStep - 0.012 + (yRim + 0.002 - yStep + 0.012) * v; }
      row.push(new V3(Math.sin(a) * r, y, CZ - Math.cos(a) * r));
      ur.push([a * 0.12, y]);
    }
    rows.push(row); uvs.push(ur);
  }
  return grid(rows, uvs, { flip: true });
}

// the liner's leather band: a strip inside the shell following the rim line up from it
function linerBand(m35) {
  const n = segs(48), rows = [], uvs = [], RX = 0.111, RZ = 0.128, CZ = 0.012;
  const R = (a) => 1 / Math.hypot(Math.sin(a) / RX, Math.cos(a) / RZ);
  for (const up of [0.026, 0.004]) {
    const row = [], ur = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a));
      const yRim = m35 ? 1.618 + 0.082 * F ** 2 - 0.026 * Bk ** 1.3 : 1.6 + 0.104 * F ** 2 - 0.034 * Bk ** 1.3;
      const r = R(a) - 0.009 + (m35 ? 0.012 : 0.02) * Bk * 0.5;
      row.push(new V3(Math.sin(a) * r, yRim + up, CZ - Math.cos(a) * r));
      ur.push([a * 0.11, up]);
    }
    rows.push(row); uvs.push(ur);
  }
  return flipAll(orient(grid(rows, uvs), new V3(0, 1.66, 0.012))); // faces inward
}
function flipAll(g) { const I = g.index; for (let k = 0; k < I.count; k += 3) { const t = I.getX(k); I.setX(k, I.getX(k + 1)); I.setX(k + 1, t); } g.computeVertexNormals(); weldNormals(g); return g; }

// the helmet's rim line and its outer surface (helmetShell's formulas) at angle a from the front and height y: the point
// and the outward normal, so the lugs, rivets, decal and strap sit on the steel
const rimY = (m35, F, Bk) => (m35 ? 1.618 + 0.082 * F ** 2 - 0.026 * Bk ** 1.3 : 1.6 + 0.104 * F ** 2 - 0.034 * Bk ** 1.3);
function shellR(m35, a, y) {
  const RX = 0.111, RZ = m35 ? 0.128 : 0.129, F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a));
  const r0 = 1 / Math.hypot(Math.sin(a) / RX, Math.cos(a) / RZ);
  const yStep = m35 ? 1.708 + 0.008 * F - 0.01 * Bk : 1.712 + 0.01 * F - 0.012 * Bk;
  const flare = m35 ? 0.012 + 0.004 * F + 0.022 * Bk ** 1.2 : 0.022 + 0.008 * F + 0.034 * Bk ** 1.2;
  const dPh = m35 ? 1.25 : 1.22, dTop = m35 ? 0.13 : 0.128, y0 = yStep - (m35 ? 0.006 : 0.012);
  if (y >= yStep) { const ph = Math.acos(clamp((y - yStep) / dTop + Math.cos(dPh), -1, 1)); return (r0 * Math.sin(ph)) / Math.sin(dPh); }
  if (y >= y0) return r0 + 0.003;
  const v = clamp((y0 - y) / (y0 - rimY(m35, F, Bk)), 0, 1);
  return r0 + 0.004 + v * v * flare;
}
function shellAt(m35, a, y, out = { p: new V3(), n: new V3() }) {
  const P = (aa, yy, o) => { const r = shellR(m35, aa, yy); return o.set(Math.sin(aa) * r, yy, 0.012 - Math.cos(aa) * r); };
  P(a, y, out.p);
  const da = P(a + 0.01, y, new V3()).sub(out.p), dy = P(a, y + 0.002, new V3()).sub(out.p);
  out.n.crossVectors(da, dy).normalize();
  if (out.n.x * Math.sin(a) - out.n.z * Math.cos(a) < 0) out.n.negate();
  return out;
}

// The chin strap, worn three ways (by the man): snug under the chin (skin 0), over the rear skirt (1 and 3), or up
// on the visor (2); the 1917 helmets shift the choice by one so a battery mixes them.
// field: the max head's field (crew_face.js; the strap lies on that face), else the hd head's
function chinStrap(B, o, m35, strapC, field = null) {
  const style = ['chin', 'back', 'visor', 'back'][(o.skin + (m35 ? 0 : 1)) % 4], S = { p: new V3(), n: new V3() }, buckleC = C(0x6a6a62);
  const flat = (pts, up) => B.add(tube(pts, pts.map(() => [0.0016, 0.0072]), 6, { up }), 'head', strapC, 'leather');
  if (style === 'chin') {
    // from the liner inside the rim at each side, down along the jaw, close under the chin
    const vr = { jaw: [0, 0.003][o.skin % 2], nose: [0, 0.003][o.skin % 2] }, g = new V3();
    for (const s of SIDE) {
      const ctrl = [[s * 0.094, 1.636, 0.012], [s * 0.078, 1.6, 0.004], [s * 0.062, 1.572, -0.016], [s * 0.038, 1.553, -0.038], [0, 1.545, -0.05]];
      const pts = new THREE.CatmullRomCurve3(ctrl.map((c) => new V3(...c))).getPoints(segs(12)), up = [];
      for (const p of pts) {
        const l = p.clone().sub(HC);
        if (p.y < 1.62) for (let it = 0; it < 4; it++) { // onto the face, 2.5 mm off it
          const sd = field ?? ((a, b, c) => headSDF(a, b, c, vr));
          const d = sd(l.x, l.y, l.z) - 0.0025, e = 0.0006;
          g.set(sd(l.x + e, l.y, l.z) - sd(l.x - e, l.y, l.z), sd(l.x, l.y + e, l.z) - sd(l.x, l.y - e, l.z), sd(l.x, l.y, l.z + e) - sd(l.x, l.y, l.z - e)).normalize();
          l.addScaledVector(g, -d);
        }
        p.copy(l).add(HC);
        up.push(l.clone().normalize());
      }
      flat(pts, up);
      if (s < 0) { const q = pts[7]; B.add(rbox(0.015, 0.011, 0.004, 0.0015, q.x, q.y, q.z, 0.4, -0.6, 0.6), 'head', buckleC, 'metal'); }
    }
    return;
  }
  // round the outside of the skirt a little above the rim: behind from side to side, or across the front
  const a0 = style === 'back' ? Math.PI / 2 : -Math.PI / 2, a1 = style === 'back' ? 3 * Math.PI / 2 : Math.PI / 2, n = segs(28), pts = [], up = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n), F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a));
    shellAt(m35, a, rimY(m35, F, Bk) + (style === 'back' ? 0.016 : 0.012), S);
    pts.push(S.p.clone().addScaledVector(S.n, 0.0022)); up.push(S.n.clone());
  }
  flat(pts, up);
  const q = pts[Math.round(n * 0.62)], qn = up[Math.round(n * 0.62)];
  const bk = rbox(0.016, 0.012, 0.004, 0.0015).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), qn));
  B.add(bk.translate(q.x + qn.x * 0.002, q.y + qn.y * 0.002, q.z + qn.z * 0.002), 'head', buckleC, 'metal');
}

function headgear(B, o, cloth, ww2, field = null) {
  const strapC = C(ww2 ? COL.ystrap : COL.strap), liner = C(0x3a2a1c);
  if (o.headgear === 'm35' || o.headgear === 'stahlhelm') {
    const m35 = o.headgear === 'm35', hc = C(m35 ? COL.helm44 : COL.stahl);
    B.add(helmetShell(m35), 'head', hc, 'paint');
    // the leather liner band inside, just above the rim all round
    B.add(linerBand(m35), 'head', liner, 'leather');
    const S = { p: new V3(), n: new V3() };
    for (const s of SIDE) {
      // the vent lugs, seated on the shell: the M35's small grommets, the M1916's big lugs (for the brow plate)
      shellAt(m35, s * Math.PI / 2 - s * 0.12, m35 ? 1.738 : 1.718, S);
      if (m35) B.add(button(S.p.x, S.p.y, S.p.z, 0.0052, S.n), 'head', hc, 'paint');
      else { // a squat cylinder standing about 1.5 cm proud, its end flat with a rounded edge
        const g = new THREE.CylinderGeometry(0.0085, 0.009, 0.017, 14).translate(0, 0.0065, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), S.n)).translate(S.p.x, S.p.y, S.p.z);
        B.add(g, 'head', hc, 'paint');
      }
    }
    // the liner's three rivets in the skirt (sides and back), flush
    for (const a of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
      const F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a));
      shellAt(m35, a, rimY(m35, F, Bk) + 0.03, S);
      B.add(button(S.p.x, S.p.y, S.p.z, 0.0038, S.n), 'head', hc, 'paint');
    }
    chinStrap(B, o, m35, strapC, field);
    if (m35) { // the national colours' decal is long gone on a 1944 helmet; the left side keeps a worn decal patch, left
      // blank (no emblem, at any tier); the max tier's barely shows through the paint
      shellAt(true, -Math.PI / 2 + 0.25, 1.69, S);
      const g = rbox(0.026, 0.022, 0.0016, field ? 0.009 : 0.004).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), S.n));
      B.add(g.translate(S.p.x + S.n.x * 0.0004, S.p.y + S.n.y * 0.0004, S.p.z + S.n.z * 0.0004), 'head', hc.clone().multiplyScalar(field ? 0.95 : 0.84), 'paint');
    }
  } else if (o.headgear === 'm43') {
    // Einheitsfeldmütze: soft crown dipping at the front, the turned-up flap buttoned at the front, the peak
    const crown = (a, y) => -0.006 * Math.max(0, Math.cos(a)) * sstep(1.77, 1.795, y) + 0.0015 * Math.sin(a * 6) * sstep(1.73, 1.79, y);
    B.add(loft([
      { y: 1.682, rx: 0.091, rz: 0.106, cz: 0.006 }, { y: 1.71, rx: 0.093, rz: 0.108, cz: 0.006 }, { y: 1.74, rx: 0.094, rz: 0.109, cz: 0.005 },
      { y: 1.77, rx: 0.092, rz: 0.107, cz: 0.004 }, { y: 1.788, rx: 0.087, rz: 0.102, cz: 0.004 }, { y: 1.797, rx: 0.075, rz: 0.09, cz: 0.004 },
      { y: 1.801, rx: 0.045, rz: 0.055, cz: 0.004 }, { y: 1.802, rx: 0.0005, rz: 0.0005, cz: 0.004 },
    ].map((r) => ({ ...r, ex: 2.2 })), 40, crown), 'head', cloth, 'wool');
    B.add(loft([{ y: 1.68, rx: 0.0945, rz: 0.1095, cz: 0.006 }, { y: 1.722, rx: 0.0968, rz: 0.1118, cz: 0.006 }, { y: 1.724, rx: 0.0935, rz: 0.1085, cz: 0.006 }].map((r) => ({ ...r, ex: 2.2 })), 40, (a, y) => (y > 1.715 ? -0.004 * Math.max(0, Math.cos(a)) ** 4 : 0)), 'head', cloth.clone().multiplyScalar(0.96), 'wool');
    B.add(peak(), 'head', cloth.clone().multiplyScalar(0.94), 'wool');
    for (const s of SIDE) B.add(button(s * 0.011, 1.704, -0.111, 0.0055, new V3(0, 0, -1)), 'head', C(COL.button44), 'metal');
    B.add(rbox(0.032, 0.017, 0.003, 0.002, 0, 1.748, -0.108, -0.1), 'head', C(0x9a9a8c), 'wool'); // the badge's place: a blank patch
    B.add(button(0, 1.731, -0.109, 0.0055, new V3(0, 0.1, -1)), 'head', C(COL.cockade), 'metal');
  } else if (o.headgear === 'feldmuetze') {
    // the round field cap of 1917: a dark band piped red top and bottom, a soft crown, the two cockades
    B.add(loft([{ y: 1.686, rx: 0.0895, rz: 0.1045, cz: 0.006 }, { y: 1.728, rx: 0.0915, rz: 0.1065, cz: 0.006 }].map((r) => ({ ...r, ex: 2 })), 40), 'head', C(COL.capband), 'wool');
    for (const y of [1.687, 1.727]) B.add(lathe([[-0.0025, 0.0925], [0.0025, 0.0925]], 40, 0, y, 0.006, 1, 1.163), 'head', C(COL.piping), 'wool');
    B.add(loft([
      { y: 1.721, rx: 0.0915, rz: 0.1065, cz: 0.006 }, { y: 1.725, rx: 0.0955, rz: 0.1108, cz: 0.006 }, { y: 1.733, rx: 0.0985, rz: 0.1138, cz: 0.005 },
      { y: 1.743, rx: 0.0995, rz: 0.1148, cz: 0.004 }, { y: 1.751, rx: 0.0965, rz: 0.1115, cz: 0.004 }, { y: 1.757, rx: 0.087, rz: 0.101, cz: 0.004 },
      { y: 1.761, rx: 0.062, rz: 0.073, cz: 0.004 }, { y: 1.763, rx: 0.0005, rz: 0.0005, cz: 0.004 },
    ].map((r) => ({ ...r, ex: 2 })), 40, (a, y) => 0.0018 * Math.sin(a * 5 + 1) * sstep(1.73, 1.75, y) - 0.002 * Math.max(0, Math.cos(a)) * bump(1.722, 1.732, y)), 'head', cloth, 'wool');
    B.add(button(0, 1.707, -0.1012, 0.007, new V3(0, 0, -1)), 'head', C(COL.cockade), 'metal');
    B.add(button(0, 1.741, -0.1135, 0.0062, new V3(0, 0.15, -1)), 'head', C(COL.piping), 'metal');
  }
}

// the M43 cap's peak: a curved stiff visor round the front, a little down
function peak() {
  const rows = [], uvs = [], n = segs(16);
  const a0 = -1.0, a1 = 1.0;
  for (const [dy, out] of [[0.004, 0], [0.004, 1], [-0.002, 1], [-0.002, 0]]) {
    const row = [], ur = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n), w = Math.cos((a / a1) * Math.PI / 2) ** 0.6;
      const rx = 0.093 + out * 0.058 * w, rz = 0.109 + out * 0.064 * w;
      row.push(new V3(Math.sin(a) * rx, 1.688 - out * 0.012 * w + dy, 0.006 - Math.cos(a) * rz));
      ur.push([a * 0.1, out * 0.06]);
    }
    rows.push(row); uvs.push(ur);
  }
  rows.push(rows[0]); uvs.push(uvs[0]);
  return grid(rows, uvs, { flip: true });
}

registerCrewTier('hd', { geometry: hdBuild, material: hdMaterial, has: hdHas, step: hdStep, covers: hdFor, profile: PROFILE.hd });
registerCrewTier('max', { geometry: maxBuild, material: maxMaterial, has: maxHas, step: maxStep, covers: hdFor, profile: PROFILE.max, shadowProxy: true });

import * as THREE from 'three';
import { buildUnterstand, dugoutOf1918, UNTERSTAND_NEED } from '../models/v/de/gun_sites_ww1.js';
import { disposeDetached } from './dispose.js';

// The crews' shelters for taking cover (DECKUNG: sim/guns.js setCover, the ranging counter-battery; the men's way to
// them is render/cover.js). German pages only, and only in a battle where the crews can take cover (sim.cbModel); main
// calls reset(sim) after the render layers' own (their positions must stand first). One shelter for each gun:
// - a 1918 position (models/v/de/gun_sites_ww1.js: the pits and the 42 cm emplacement) has its dugout already: the crew
//   runs to its doorway (dugoutOf1918);
// - a rocket launcher has its slit trench in the model (rig.anchors.cover): the crew crouches in it;
// - any other gun gets an Unterstand of its own (buildUnterstand), placed from the position's measured footprint: the
//   position's scenery (its walls, banks, stores and nets, the battery's works) rasterized in plan through a man's
//   height (LO to HI), and what lies low on the ground (walks, platforms, tracks: LOW to LO), the gun swept through its
//   whole traverse (all but what stays overhead, above ROOF), the crew's posts (swept too), the ready rounds, the
//   battery's other guns and the shelters placed before it are kept clear; of the places left, the one the crew reaches
//   by the shortest walk from its posts (round the walls, not a straight line), behind the gun rather than beside it and
//   never in front, on ground that does not tilt it, its door turned to the crew. It is drawn with the position (a child
//   of its root, so it turns with a relaid bed and goes with the position's own culling), or in the scene for a gun
//   without one. A self-propelled gun has one at each of its positions, the Karl one at each of its stops, each placed
//   with the rig standing there; with no room at all the men get down in the open behind their gun.
// The crew's spec, nearest first at the time of cover (render/cover.js coverFrame):
//   crew.shelters = [{ kind: 'dug' | 'trench', parent, x, z, yaw, slots, grid, obj, world, rootAt, withRoot }]
//   parent: the Object3D whose frame x, z, yaw (the doorway, 'dug') and slots ([{ x, z }], 'trench') are given in;
//   grid: what a man cannot run through, in the rig root's frame as it stood (rootAt), good while it stands there or
//   (withRoot) turns with its position ({ x0, z0, w, h, cell, solid }).
// Everything here runs once a battle (reset), never per frame.

const CELL = 0.25; // the grid's cells (m)
// the height band (above the gun's ground) in which scenery is in a man's way (he ducks under a net's skirt)
const LO = 0.15, HI = 1.6;
const ROOF = 2.4; // an Unterstand's top (its stovepipe 1.8 m) with room to spare
const LOW = 0.04; // (below it the ground's own patches: the mud, the puddles, the trodden ground)
const ANGLES = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 105, -105, 120, -120].map((d) => d * Math.PI / 180);
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _box = new THREE.Box3();
const _c = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3()), _S = new THREE.Matrix4();

class Grid {
  constructor(x0, z0, x1, z1) {
    this.cell = CELL;
    this.w = Math.max(1, Math.ceil((x1 - x0) / CELL)); this.h = Math.max(1, Math.ceil((z1 - z0) / CELL));
    this.x0 = x0; this.z0 = z0;
    this.solid = new Uint8Array(this.w * this.h);
    // what lies low on the ground that a man walks over but no dugout should stand on: a walk, a platform, a track
    this.low = new Uint8Array(this.w * this.h);
  }
  i(x) { return Math.floor((x - this.x0) / this.cell); }
  j(z) { return Math.floor((z - this.z0) / this.cell); }
  // mark the cells a plan triangle touches (within tol of it)
  tri(occ, ax, az, bx, bz, cx, cz, tol) {
    const C = this.cell, x0 = this.x0, z0 = this.z0, w = this.w, h = this.h;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - tol - x0) / C)), i1 = Math.min(w - 1, Math.floor((Math.max(ax, bx, cx) + tol - x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - tol - z0) / C)), j1 = Math.min(h - 1, Math.floor((Math.max(az, bz, cz) + tol - z0) / C));
    if (i0 > i1 || j0 > j1) return;
    const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + (j + 0.5) * C;
      for (let i = i0; i <= i1; i++) {
        const k = j * w + i;
        if (occ[k]) continue;
        const px = x0 + (i + 0.5) * C;
        let hit = false;
        if (Math.abs(d) > 1e-9) {
          const u = ((px - ax) * (cz - az) - (pz - az) * (cx - ax)) / d, v = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) / d;
          hit = u >= 0 && v >= 0 && u + v <= 1;
        }
        if (!hit) hit = segD(px, pz, ax, az, bx, bz) < tol || segD(px, pz, bx, bz, cx, cz) < tol || segD(px, pz, cx, cz, ax, az) < tol;
        if (hit) occ[k] = 1;
      }
    }
  }
  rect(occ, xa, za, xb, zb) {
    const i0 = Math.max(0, this.i(Math.min(xa, xb))), i1 = Math.min(this.w - 1, this.i(Math.max(xa, xb)));
    const j0 = Math.max(0, this.j(Math.min(za, zb))), j1 = Math.min(this.h - 1, this.j(Math.max(za, zb)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * this.w + i] = 1;
  }
  disk(occ, x, z, r) {
    const i0 = Math.max(0, this.i(x - r)), i1 = Math.min(this.w - 1, this.i(x + r)), j0 = Math.max(0, this.j(z - r)), j1 = Math.min(this.h - 1, this.j(z + r));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = this.x0 + (i + 0.5) * this.cell - x, pz = this.z0 + (j + 0.5) * this.cell - z;
      if (px * px + pz * pz <= r * r) occ[j * this.w + i] = 1;
    }
  }
  at(occ, x, z) {
    const i = this.i(x), j = this.j(z);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? 2 : occ[j * this.w + i];
  }
}

function segD(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  let t = l > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

// a position's scenery into the grid's layers (solid: what reaches into a man's height band; low: what lies low on the
// ground), in the frame whose inverse world matrix is inv
function rasterScenery(g, root, inv) {
  root.updateMatrixWorld(true);
  const gx1 = g.x0 + g.w * g.cell, gz1 = g.z0 + g.h * g.cell;
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const geo = o.geometry, pos = geo?.attributes?.position;
    if (!pos) return;
    const n = o.isInstancedMesh ? Math.min(o.count, 4000) : 1;
    for (let k = 0; k < n; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, _m); _m.premultiply(o.matrixWorld); } else _m.copy(o.matrixWorld);
      _m.premultiply(inv);
      // (a mesh whose bounds lie wholly outside the window or the band is passed over)
      if (!geo.boundingBox) geo.computeBoundingBox();
      _box.copy(geo.boundingBox).applyMatrix4(_m);
      if (_box.max.y < LOW || _box.min.y > HI || _box.min.x > gx1 || _box.max.x < g.x0 || _box.min.z > gz1 || _box.max.z < g.z0) continue;
      const e = _m.elements, idx = geo.index, cnt = idx ? idx.count : pos.count, a = pos.array, st = pos.itemSize ?? 3;
      const tx = (q) => e[0] * a[q] + e[4] * a[q + 1] + e[8] * a[q + 2] + e[12];
      const ty = (q) => e[1] * a[q] + e[5] * a[q + 1] + e[9] * a[q + 2] + e[13];
      const tz = (q) => e[2] * a[q] + e[6] * a[q + 1] + e[10] * a[q + 2] + e[14];
      if (pos.isInterleavedBufferAttribute) continue; // (none in the positions: their geometry is merged)
      for (let t = 0; t + 2 < cnt; t += 3) {
        const qa = (idx ? idx.getX(t) : t) * st, qb = (idx ? idx.getX(t + 1) : t + 1) * st, qc = (idx ? idx.getX(t + 2) : t + 2) * st;
        const ya = ty(qa), yb = ty(qb), yc = ty(qc);
        const top = Math.max(ya, yb, yc);
        if (top < LOW || Math.min(ya, yb, yc) > HI) continue;
        g.tri(top < LO ? g.low : g.solid, tx(qa), tz(qa), tx(qb), tz(qb), tx(qc), tz(qc), CELL * 0.5);
      }
    }
  });
}

// A position's scenery rasterized once, in its own root's frame (within 100 m of it), kept per position: every gun
// near it takes it into its own frame (stamp), instead of each rasterizing every triangle of the battery again
const SCENERY = new WeakMap();
function sceneryOf(root) {
  let sg = SCENERY.get(root);
  if (sg) return sg;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _box.copy(o.geometry.boundingBox).applyMatrix4(_m.copy(inv).multiply(o.matrixWorld));
    x0 = Math.min(x0, _box.min.x); z0 = Math.min(z0, _box.min.z); x1 = Math.max(x1, _box.max.x); z1 = Math.max(z1, _box.max.z);
  });
  if (!(x1 > x0)) { x0 = z0 = -1; x1 = z1 = 1; }
  sg = new Grid(Math.max(-100, x0 - 0.5), Math.max(-100, z0 - 0.5), Math.min(100, x1 + 0.5), Math.min(100, z1 + 0.5));
  rasterScenery(sg, root, inv);
  SCENERY.set(root, sg);
  return sg;
}
// the scenery sg of a position into a gun's grid g (S: the gun's root frame to the position's)
function stamp(g, sg, S) {
  const e = S.elements;
  // (only the gun's cells that the position's grid covers: its corners taken into the gun's frame)
  _m.copy(S).invert();
  const f = _m.elements, cx = [sg.x0, sg.x0 + sg.w * sg.cell], cz = [sg.z0, sg.z0 + sg.h * sg.cell];
  let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
  for (const x of cx) for (const z of cz) {
    const gx = f[0] * x + f[8] * z + f[12], gz = f[2] * x + f[10] * z + f[14];
    ax = Math.min(ax, gx); az = Math.min(az, gz); bx = Math.max(bx, gx); bz = Math.max(bz, gz);
  }
  const i0 = Math.max(0, g.i(ax)), i1 = Math.min(g.w - 1, g.i(bx)), j0 = Math.max(0, g.j(az)), j1 = Math.min(g.h - 1, g.j(bz));
  for (let j = j0; j <= j1; j++) {
    const z = g.z0 + (j + 0.5) * g.cell;
    for (let i = i0; i <= i1; i++) {
      const x = g.x0 + (i + 0.5) * g.cell, lx = e[0] * x + e[8] * z + e[12], lz = e[2] * x + e[10] * z + e[14];
      const si = Math.floor((lx - sg.x0) / sg.cell), sj = Math.floor((lz - sg.z0) / sg.cell);
      if (si < 0 || sj < 0 || si >= sg.w || sj >= sg.h) continue;
      const k = sj * sg.w + si, q = j * g.w + i;
      if (sg.solid[k]) g.solid[q] = 1;
      if (sg.low[k]) g.low[q] = 1;
    }
  }
}

// the gun into the keep-clear layer: each part's bounds in plan, the turning parts swept through the whole traverse
function rasterRig(g, keep, rig, inv, arc, skip) {
  rig.root.updateMatrixWorld(true);
  const tv = rig.pivots.traverse, px = tv ? tv.position.x : 0, pz = tv ? tv.position.z : 0;
  const full = arc > 2.6, step = 4 * Math.PI / 180, n = full ? 0 : Math.max(1, Math.ceil((2 * arc) / step));
  rig.root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || skip(o)) return;
    const geo = o.geometry;
    if (!geo?.attributes?.position) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox;
    _m.copy(inv).multiply(o.matrixWorld);
    for (let k = 0; k < 8; k++) _c[k].set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(_m);
    // (steel that stays above an Unterstand's top, a long barrel swinging overhead, cannot hit it)
    let low = Infinity;
    for (const c of _c) low = Math.min(low, c.y);
    if (low > ROOF) return;
    let turns = false;
    for (let q = o.parent; q && q !== rig.root; q = q.parent) if (q === tv) turns = true;
    if (!turns) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const c of _c) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z); }
      g.rect(keep, x0, z0, x1, z1);
      return;
    }
    if (full) {
      // (a gun that turns all the way round, on its turntable: its whole circle)
      let r = 0;
      for (const c of _c) r = Math.max(r, Math.hypot(c.x - px, c.z - pz));
      g.disk(keep, px, pz, r);
      return;
    }
    for (let s = 0; s <= n; s++) {
      const a = -arc + (2 * arc * s) / n, ca = Math.cos(a), sa = Math.sin(a);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const c of _c) {
        const dx = c.x - px, dz = c.z - pz, x = dx * ca + dz * sa + px, z = -dx * sa + dz * ca + pz;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      g.rect(keep, x0, z0, x1, z1);
    }
  });
}

// the walking distance (m) from the crew's middle to every cell, round the scenery (the gun is not in it: the men go
// round that on the way, render/cover.js): a breadth-first flood over the 8-neighbour grid, a step a cell whichever
// way (it only ranks the places, so a diagonal counted as a straight step does no harm, and each cell is taken once)
function walkField(g, sx, sz) {
  const n = g.w * g.h, D = new Float32Array(n).fill(Infinity), w = g.w, h = g.h, Q = new Int32Array(n);
  let i0 = g.i(sx), j0 = g.j(sz);
  if (i0 < 0 || j0 < 0 || i0 >= w || j0 >= h) return D;
  // (start from the nearest open cell)
  if (g.solid[j0 * w + i0]) {
    let best = -1, bd = Infinity;
    for (let j = Math.max(0, j0 - 12); j <= Math.min(h - 1, j0 + 12); j++) for (let i = Math.max(0, i0 - 12); i <= Math.min(w - 1, i0 + 12); i++) {
      const d = (i - i0) ** 2 + (j - j0) ** 2;
      if (!g.solid[j * w + i] && d < bd) { bd = d; best = j * w + i; }
    }
    if (best < 0) return D;
    i0 = best % w; j0 = (best / w) | 0;
  }
  let head = 0, tail = 0;
  const s = j0 * w + i0;
  D[s] = 0; Q[tail++] = s;
  while (head < tail) {
    const k = Q[head++], ki = k % w, kj = (k / w) | 0, dn = D[k] + g.cell;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ki + di, nj = kj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (D[nk] !== Infinity || g.solid[nk]) continue;
      if (di && dj && (g.solid[kj * w + ni] || g.solid[nj * w + ki])) continue;
      D[nk] = dn; Q[tail++] = nk;
    }
  }
  return D;
}

// a point of a shelter's own frame (the door at the origin, opening toward -Z, turned by yaw) at (x, z)
const local = (x, z, yaw, lx, lz, out) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = x + lx * c + lz * s; out.z = z - lx * s + lz * c;
  return out;
};

// Where an Unterstand goes for this gun, in the rig root's frame: { x, z, yaw } of its doorway, or null
// (shut: the crew's way out of its position is one the grid does not know, so a place it cannot reach round the scenery
// will do at the straight way's cost)
function placeUnterstand(g, keep, D, cx, cz, rig, terrain, rMax, shut = false) {
  const need = UNTERSTAND_NEED, P = { x: 0, z: 0 }, A = { x: 0, z: 0 };
  const root = rig.root, cy = Math.cos(root.rotation.y), sy = Math.sin(root.rotation.y), rx = root.position.x, rz = root.position.z, y0 = root.position.y;
  const worldY = (x, z) => terrain?.heightAt ? terrain.heightAt(rx + x * cy + z * sy, rz - x * sy + z * cy) - y0 : 0;
  let best = null, bs = Infinity;
  for (let r = 3; r <= rMax; r += 0.5) {
    if (best && r > bs + 3) break;
    for (const th of ANGLES) {
      // the door on the ring round the crew's middle, opening toward it
      const dx = cx + r * Math.sin(th), dz = cz + r * Math.cos(th), yaw = th;
      let ok = true;
      for (let lz = need.z0; lz <= need.z1 && ok; lz += CELL) for (let lx = need.x0; lx <= need.x1; lx += CELL) {
        local(dx, dz, yaw, lx, lz, P);
        if (g.at(keep, P.x, P.z) !== 0) { ok = false; break; }
      }
      if (!ok) continue;
      // reached round the scenery (from the approach, two metres before the door); a crew shut in its position (a
      // turntable's pit, a gun up on its track: the men climb out by ladders the grid does not know) the straight way,
      // dearer
      local(dx, dz, yaw, 0, -1.8, A);
      const ia = g.i(A.x), ja = g.j(A.z);
      let walk = ia >= 0 && ja >= 0 && ia < g.w && ja < g.h ? D[ja * g.w + ia] : Infinity;
      if (!Number.isFinite(walk)) { if (!shut) continue; walk = Math.hypot(A.x - cx, A.z - cz) * 1.6 + 4; }
      // ground that tilts it (the corners against the door) and a place beside the gun rather than behind it cost more
      let tilt = 0;
      const h0 = worldY(dx, dz);
      for (const [lx, lz] of [[need.x0, need.z0], [need.x1, need.z0], [need.x0, need.z1], [need.x1, need.z1]]) { local(dx, dz, yaw, lx, lz, P); tilt = Math.max(tilt, Math.abs(worldY(P.x, P.z) - h0)); }
      if (tilt > 1.2) continue;
      const score = walk + tilt * 4 + Math.abs(th) * 1.2;
      if (score < bs) { bs = score; best = { x: dx, z: dz, yaw, y: h0 }; }
    }
  }
  return best;
}

// what of a rig is the crew's (the men, their props, the drill's own gear): not the gun's steel
function skipOf(crew) {
  const mine = new Set([crew.shellA, crew.shellB, crew.bag, crew.staff, crew.rope, crew.heavyDrill?.root, crew.loadingCart, crew.chargeRest, ...crew.men.map((m) => m.root)].filter(Boolean));
  return (o) => { for (let q = o; q; q = q.parent) { if (mine.has(q) || q.name === 'crew2') return true; if (q === crew.rig.root) return false; } return false; };
}

// a rig's reach in plan from its origin, its own steel only (Box3.setFromObject would take in the men, and the lifelike
// men's skinned bodies are measured afresh at every call): kept per rig
const EXTENT = new WeakMap();
function extent(v) {
  let e = EXTENT.get(v.rig);
  if (e) return e;
  const rig = v.rig, skip = skipOf(v.crew);
  rig.root.updateMatrixWorld(true);
  _inv.copy(rig.root.matrixWorld).invert();
  let r = 0;
  rig.root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || skip(o) || !o.geometry?.attributes?.position) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    _m.copy(_inv).multiply(o.matrixWorld);
    for (let k = 0; k < 8; k++) { _v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(_m); r = Math.max(r, Math.hypot(_v.x, _v.z)); }
  });
  EXTENT.set(rig, e = { r });
  return e;
}

export function createShelters({ scene, terrain, renderLayer, sources = () => ({}) }) {
  const built = [];
  const api = { reset, built, specs: new Map(), ms: 0 };

  function clear() {
    for (const o of built) { o.removeFromParent(); renderLayer?.detail?.remove?.(`shelter:${o.uuid}`); }
    if (built.length) disposeDetached(scene, built);
    built.length = 0;
    api.specs.clear();
    for (const v of renderLayer?.guns?.allViews ?? []) if (v.crew) v.crew.shelters = null;
  }

  // every position object of the German render layers near a point (world), with the one that is this piece's own
  function positionsOf(v) {
    const src = sources(), out = [], key = v.key, uid = `${v.unit.id}`, p = v.rig.root.position;
    let own = null, own1918 = false;
    for (const [layer, R] of [['ww1', src.ww1], ['ww2', src.ww2]]) {
      if (!R) continue;
      for (const map of [R.gunPositions, R.sites, R.batteryWorks]) {
        if (!map) continue;
        for (const [k, o] of map) {
          const root = o?.root;
          if (!root || !root.parent) continue;
          if (root.position.distanceTo(p) > 160) continue;
          out.push(root);
          // (the piece's pit, or the site of a battery of one gun)
          if (map !== R.batteryWorks && (k === key || (k === uid && v.unit.pieces.length === 1))) { own = root; own1918 = layer === 'ww1' && map === R.gunPositions; }
        }
      }
    }
    return { all: out, own, own1918 };
  }

  // (moved: the rig stood at another of its places for this one, atPlace)
  function shelterFor(v, sim, placed, moved) {
    const rig = v.rig, crew = v.crew, u = v.unit, p = v.piece, kind = p.kind;
    rig.root.updateMatrixWorld(true);
    _inv.copy(rig.root.matrixWorld).invert();
    const inv = _inv.clone();
    const { all, own, own1918 } = positionsOf(v);
    const world = (sx, sz) => { _v.set(sx, 0, sz).applyMatrix4(rig.root.matrixWorld); return { x: _v.x, z: _v.z }; };
    // the grid holds while the gun stands where it stood now, or turns with its position (a relaid bed: the rig and the
    // position's root turn together); a gun that drives or turns its hull leaves it (render/cover.js: the steel alone)
    const frame = (parent) => ({ rootAt: { x: rig.root.position.x, z: rig.root.position.z, yaw: rig.root.rotation.y }, withRoot: !!own && parent === own });
    // the window: the gun and a good run round it; for a shelter the position has already, its own scenery is enough
    // (the grid is then only for the men's way out of it)
    const trench = rig.anchors.cover?.length > 0, d = !trench && own1918 ? dugoutOf1918(kind) : null, mine = trench || d;
    const rr = extent(v).r;
    const W = mine ? Math.max(20, rr + 14) : Math.min(80, Math.max(30, rr + 28));
    const g = new Grid(-W, -W, W, W);
    for (const root of all) {
      if (mine && root !== own) continue;
      const sg = sceneryOf(root); // (before _m is set: it uses _m)
      _m.copy(root.matrixWorld).invert();
      stamp(g, sg, _S.multiplyMatrices(_m, rig.root.matrixWorld));
    }
    // a rocket launcher's slit trench (its rig's): the crew crouches there
    if (trench) {
      const c0 = rig.anchors.cover[0];
      return [{ kind: 'trench', parent: rig.root, slots: rig.anchors.cover.map((c) => ({ x: c.x, z: c.z })), grid: g, obj: null, world: world(c0.x, c0.z), ...frame(rig.root) }];
    }
    // a 1918 position's own dugout
    if (d) {
      _v.set(d.x, 0, d.z).applyMatrix4(own.matrixWorld);
      return [{ kind: 'dug', parent: own, x: d.x, z: d.z, yaw: d.yaw, grid: g, obj: null, world: { x: _v.x, z: _v.z }, ...frame(own) }];
    }
    // an Unterstand of its own: clear of the scenery, the gun's sweep, the posts, the rounds and the other guns
    // (keep: what the Unterstand must stand clear of; the low layer goes in last, so a position paved all round (a
    // turntable's apron) can do without it)
    const keep = g.solid.slice();
    rasterRig(g, keep, rig, inv, u.arc ?? 0, skipOf(crew));
    let cx = 0, cz = 0, n = 0;
    const tv = rig.pivots.traverse, px = tv ? tv.position.x : 0, pz = tv ? tv.position.z : 0, arc = Math.min(u.arc ?? 0, Math.PI);
    for (const m of crew.men) {
      const hx = m.sx, hz = m.sz;
      cx += hx; cz += hz; n++;
      if (m.world || arc < 0.02) { g.disk(keep, hx, hz, 0.8); continue; }
      for (let a = -arc; a <= arc + 1e-6; a += Math.max(0.05, arc / 12)) {
        const dx = hx - px, dz = hz - pz;
        g.disk(keep, dx * Math.cos(a) + dz * Math.sin(a) + px, -dx * Math.sin(a) + dz * Math.cos(a) + pz, 0.8);
      }
    }
    if (n) { cx /= n; cz /= n; }
    const st = rig.anchors.shellStack;
    if (st) { st.getWorldPosition(_w).applyMatrix4(inv); g.disk(keep, _w.x, _w.z, 1.4); }
    // the battery's other guns and every shelter placed so far
    for (const o of renderLayer.guns.views) {
      if (o === v || o.rig.root.position.distanceTo(rig.root.position) > W * 1.5) continue;
      _v.copy(o.rig.root.position).applyMatrix4(inv);
      g.disk(keep, _v.x, _v.z, Math.max(3, extent(o).r) + 1);
    }
    for (const q of placed) {
      _v.set(q.x, 0, q.z).applyMatrix4(inv);
      g.disk(keep, _v.x, _v.z, 4.5);
    }
    const D = walkField(g, cx, cz);
    const bare = keep.slice();
    for (let i = 0; i < keep.length; i++) keep[i] |= g.low[i];
    // (in turn: clear of everything and reached round the scenery; then on the low things too; then, for a crew shut in
    // its position, wherever there is room)
    const place = (k, shut) => placeUnterstand(g, k, D, cx, cz, rig, terrain, W - 6, shut);
    const at = place(keep, false) ?? place(bare, false) ?? place(keep, true) ?? place(bare, true);
    // (no room anywhere near: the crew gets down beside its gun, behind it, in the open)
    if (!at) {
      const slots = [0, 1, 2, 3, 4, 5].map((i) => ({ x: cx + (i % 2 ? 1 : -1) * (1.5 + i * 0.4), z: cz + 4 + (i >> 1) * 0.8 }));
      return [{ kind: 'trench', parent: rig.root, slots, grid: g, obj: null, world: world(slots[0].x, slots[0].z), ...frame(rig.root) }];
    }
    // the Unterstand at its doorway (rig root frame), a child of the position (or of the scene: no position, or another
    // place than the one the gun stands at now)
    const { root } = buildUnterstand((u.id * 31 + p.i * 7) | 0);
    _v.set(at.x, 0, at.z).applyMatrix4(rig.root.matrixWorld);
    const wx = _v.x, wz = _v.z, wy = terrain?.heightAt ? terrain.heightAt(wx, wz) : _v.y;
    const wyaw = rig.root.rotation.y + at.yaw, parent = !moved && own ? own : scene;
    parent.updateMatrixWorld(true);
    _m.copy(parent.matrixWorld).invert();
    _w.set(wx, wy, wz).applyMatrix4(_m);
    const pyaw = parent === scene ? 0 : parent.rotation.y;
    root.position.copy(_w);
    root.rotation.y = wyaw - pyaw;
    parent.add(root);
    built.push(root);
    // (one standing on its own takes part in the sub-pixel cull, as the positions do: render/detail.js)
    if (parent === scene) renderLayer?.detail?.add?.(`shelter:${root.uuid}`, root);
    placed.push({ x: wx, z: wz });
    return [{ kind: 'dug', parent, x: _w.x, z: _w.z, yaw: wyaw - pyaw, grid: g, obj: root, world: { x: wx, z: wz }, ...frame(parent) }];
  }

  // The places a gun stands at in a battle, as (x, z) offsets from where its rig stands now: a self-propelled gun's
  // positions (special.js MoveCtl; the first is this one), the Karl's prepared stops (it drives to the first as the
  // battle starts); one shelter at each, placed with the rig standing there
  function placesOf(v, sim) {
    const rp = v.rig.root.position, ps = v.unit.def?.positions, stops = v.piece.kind === 'karl' ? sim.theatre?.op?.positions : null;
    if (stops?.length) return stops.map((q) => [q.pos.x - rp.x, q.pos.z - rp.z]);
    if (v.piece.mobile && ps?.length > 1) return ps.map((q) => [q.pos.x - ps[0].pos.x, q.pos.z - ps[0].pos.z]);
    return [[0, 0]];
  }
  function atPlace(v, ox, oz, fn) {
    const r = v.rig.root, x = r.position.x, y = r.position.y, z = r.position.z, moved = Math.abs(ox) + Math.abs(oz) > 0.5;
    if (moved) { r.position.set(x + ox, terrain?.heightAt ? terrain.heightAt(x + ox, z + oz) : y, z + oz); r.updateMatrixWorld(true); }
    try { return fn(moved); } finally { if (moved) { r.position.set(x, y, z); r.updateMatrixWorld(true); } }
  }

  function reset(sim) {
    clear();
    if (!sim?.cbModel || !renderLayer?.guns) return;
    const placed = [];
    const t0 = performance.now();
    for (const v of renderLayer.guns.views) {
      if (!v.crew?.men?.length || !v.crew.field) continue; // (a gun crew's: the V-weapons' launch crews have none)
      try {
        const list = [];
        for (const [ox, oz] of placesOf(v, sim)) list.push(...atPlace(v, ox, oz, (moved) => shelterFor(v, sim, placed, moved)));
        v.crew.shelters = list;
        api.specs.set(v.key, v.crew.shelters);
      } catch (e) {
        console.warn(`shelter ${v.key}:`, e.message);
        v.crew.shelters = null;
      }
    }
    api.ms = performance.now() - t0;
  }

  return api;
}

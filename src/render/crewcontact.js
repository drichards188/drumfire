// Contact audit for the crew drills (crewcheck.js, tools/crewaudit.mjs): what the clearance and motion audits cannot
// see, because they measure a hand against the point the drill sent it to and never against the thing it should hold.
//   float: a visible prop of the drill (the shells, the cartridge, the staff, the rope, carts, slings: anything the crew
//     code added to the rig) that nothing bears: no hand within a fist of it, and not on the steel, the ground, a pit
//     box, a man's body or another prop that is itself borne.
//   grip: a hand meant to hold something (an IK grip at full weight, or a pose whose hands hold a load, a staff, a rope
//     or a handwheel: HOLD) with nothing within a fist of its grip point (steel, a prop, another man, the ground).
// Results per role and per prop in seconds of the run and the worst gap, plus `moments`: the worst instants, with the
// point to look at, for the contact sheet (crewcheck's &shots=t<time>:<x>:<y>:<z>).
import * as THREE from 'three';

// the poses whose hands hold something, and which hands (models/v/crew.js): lay winds the handwheel with the right hand
// and has the left at the sight, lanyard holds the cord in the right
const HOLD = { carry: 'LR', carryWalk: 'LR', carryShoulder: 'R', reachUp: 'LR', push: 'LR', ram: 'LR', ramLow: 'LR', ramLoad: 'LR', lay: 'LR', operate: 'LR', haul: 'LR', lanyard: 'R' };
const FIST = 0.07; // the grip point sits inside the fist: a hand within this of a surface touches it
const REST = 0.045; // a prop's surface within this of what bears it
const STEEL_REST = 0.06; // the same against the steel, which crewcheck samples every 5 cm
const FAR = 0.5; // gaps are measured up to here
const BIG = 0.15; // a gap anyone sees at a glance (counted apart)
const BLEND = 0.3; // seconds after a pose change (crews.js cross-fades) when a pose's hands are not judged

const _v = new THREE.Vector3(), _im = new THREE.Matrix4();

// squared distance from p to triangle T[o..o+8] (Ericson, Real-Time Collision Detection 5.1.5)
function triDist2(px, py, pz, T, o) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2];
  const abx = T[o + 3] - ax, aby = T[o + 4] - ay, abz = T[o + 5] - az, acx = T[o + 6] - ax, acy = T[o + 7] - ay, acz = T[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - T[o + 3], bpy = py - T[o + 4], bpz = pz - T[o + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3), x = apx - abx * v, y = apy - aby * v, z = apz - abz * v; return x * x + y * y + z * z; }
  const cpx = px - T[o + 6], cpy = py - T[o + 7], cpz = pz - T[o + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6), x = apx - acx * w, y = apy - acy * w, z = apz - acz * w; return x * x + y * y + z * z; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6)), bcx = T[o + 6] - T[o + 3], bcy = T[o + 7] - T[o + 4], bcz = T[o + 8] - T[o + 5];
    const x = bpx - bcx * w, y = bpy - bcy * w, z = bpz - bcz * w; return x * x + y * y + z * z;
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  const x = apx - abx * v - acx * w, y = apy - aby * v - acy * w, z = apz - abz * v - acz * w;
  return x * x + y * y + z * z;
}

// a mesh's triangles (local, unindexed) and points on its surface (the corners and about one every `step` metres)
function localTris(mesh) {
  const g = mesh.geometry, p = g.attributes.position, idx = g.index, n = idx ? idx.count : p.count, T = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { _v.fromBufferAttribute(p, idx ? idx.getX(i) : i); T[i * 3] = _v.x; T[i * 3 + 1] = _v.y; T[i * 3 + 2] = _v.z; }
  return T;
}
function surfacePts(T, step = 0.04, cap = 500) {
  const pts = [], seen = new Set();
  const put = (x, y, z) => { const k = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`; if (!seen.has(k)) { seen.add(k); pts.push(x, y, z); } };
  for (let o = 0; o < T.length; o += 9) {
    for (let k = 0; k < 9; k += 3) put(T[o + k], T[o + k + 1], T[o + k + 2]);
    const ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], wx = T[o + 6] - T[o], wy = T[o + 7] - T[o + 1], wz = T[o + 8] - T[o + 2];
    const area = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2, m = Math.min(200, Math.floor(area / (step * step)));
    for (let i = 0; i < m; i++) {
      let a = ((i + 0.5) * 0.7548776662466927) % 1, b = ((i + 0.5) * 0.5698402909980532) % 1;
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      put(T[o] + ux * a + wx * b, T[o + 1] + uy * a + wy * b, T[o + 2] + uz * a + wz * b);
    }
  }
  const n = pts.length / 3;
  if (n <= cap) return new Float32Array(pts);
  const s = n / cap, out = new Float32Array(cap * 3);
  for (let i = 0; i < cap; i++) { const j = Math.floor(i * s) * 3; out[i * 3] = pts[j]; out[i * 3 + 1] = pts[j + 1]; out[i * 3 + 2] = pts[j + 2]; }
  return out;
}
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

// one prop: its drawn triangles and surface points in world space this frame
class Item {
  constructor(obj, name) {
    this.obj = obj; this.name = name;
    this.min = [0, 0, 0]; this.max = [0, 0, 0];
    this.build();
  }

  // (again whenever its meshes change: a drill may add parts to a prop after the crew is made, as the K5's staff gets
  // its cross handles in the drill's first step)
  build() {
    this.parts = [];
    // (an instanced mesh is a part per instance, at its own matrix: the Wurfgerät's spent crates)
    this.obj.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const T = localTris(o), P = surfacePts(T);
      for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) this.parts.push({ mesh: o, inst: o.isInstancedMesh ? i : -1, T, P });
    });
    this.W = new Float32Array(this.parts.reduce((a, p) => a + p.T.length, 0));
    this.Q = new Float32Array(this.parts.reduce((a, p) => a + p.P.length, 0));
    this.nW = 0; this.nQ = 0;
  }

  update() {
    let n = 0;
    this.obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) n += o.isInstancedMesh ? o.count : 1; });
    if (n !== this.parts.length) this.build();
    let w = 0, q = 0;
    const mn = this.min, mx = this.max;
    mn[0] = mn[1] = mn[2] = 1e9; mx[0] = mx[1] = mx[2] = -1e9;
    const xf = (src, dst, at, e) => {
      for (let i = 0; i < src.length; i += 3) {
        const x = src[i], y = src[i + 1], z = src[i + 2];
        const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
        dst[at + i] = X; dst[at + i + 1] = Y; dst[at + i + 2] = Z;
        if (X < mn[0]) mn[0] = X; if (Y < mn[1]) mn[1] = Y; if (Z < mn[2]) mn[2] = Z;
        if (X > mx[0]) mx[0] = X; if (Y > mx[1]) mx[1] = Y; if (Z > mx[2]) mx[2] = Z;
      }
    };
    for (const p of this.parts) {
      if (!shown(p.mesh)) continue;
      let e = p.mesh.matrixWorld.elements;
      if (p.inst >= 0) {
        p.mesh.getMatrixAt(p.inst, _im);
        if (Math.abs(_im.determinant()) < 1e-12) continue; // (put away by a zero scale)
        e = _im.premultiply(p.mesh.matrixWorld).elements;
      }
      xf(p.T, this.W, w, e); w += p.T.length;
      xf(p.P, this.Q, q, e); q += p.P.length;
    }
    this.nW = w; this.nQ = q;
    return w > 0;
  }

  // distance from a point to the drawn surface, or Infinity beyond `lim`
  dist(x, y, z, lim) {
    const mn = this.min, mx = this.max;
    const bx = Math.max(mn[0] - x, 0, x - mx[0]), by = Math.max(mn[1] - y, 0, y - mx[1]), bz = Math.max(mn[2] - z, 0, z - mx[2]);
    if (bx * bx + by * by + bz * bz > lim * lim) return Infinity;
    let best = lim * lim;
    const W = this.W;
    for (let o = 0; o < this.nW; o += 9) {
      // a quick reject on the triangle's box before the exact distance
      const ax = W[o], bx = W[o + 3], cx = W[o + 6];
      if (x - Math.max(ax, bx, cx) > lim || Math.min(ax, bx, cx) - x > lim) continue;
      const ay = W[o + 1], by_ = W[o + 4], cy = W[o + 7];
      if (y - Math.max(ay, by_, cy) > lim || Math.min(ay, by_, cy) - y > lim) continue;
      const az = W[o + 2], bz = W[o + 5], cz = W[o + 8];
      if (z - Math.max(az, bz, cz) > lim || Math.min(az, bz, cz) - z > lim) continue;
      const d = triDist2(x, y, z, W, o);
      if (d < best) best = d;
    }
    return best < lim * lim ? Math.sqrt(best) : Infinity;
  }

  get centre() { return [(this.min[0] + this.max[0]) / 2, (this.min[1] + this.max[1]) / 2, (this.min[2] + this.max[2]) / 2]; }
}

// shortest distance from p to a man's body capsules (crewcheck's bodyOf), minus their radii
function bodyGap(caps, x, y, z) {
  let best = Infinity;
  for (const c of caps) {
    const ux = c.b.x - c.a.x, uy = c.b.y - c.a.y, uz = c.b.z - c.a.z, uu = ux * ux + uy * uy + uz * uz || 1e-9;
    let t = ((x - c.a.x) * ux + (y - c.a.y) * uy + (z - c.a.z) * uz) / uu;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(c.a.x + ux * t - x, c.a.y + uy * t - y, c.a.z + uz * t - z) - c.r;
    if (d < best) best = d;
  }
  return best;
}

export class Contacts {
  // pre: every object under rig.root before the crew was made (the gun itself)
  constructor(rig, crew, steel, walls, pre, DT) {
    Object.assign(this, { rig, crew, steel, walls, pre, DT });
    this.items = []; this.known = new Set(); this.n = 0;
    this.res = { grip: {}, props: {}, moments: [] };
    this.scan();
  }

  // the crew's props: what was added to the rig and is not a man (the super-heavies' equipment group holds several)
  scan() {
    const men = new Set(this.crew.men.map((m) => m.root));
    const add = (o) => {
      if (this.known.has(o)) return;
      this.known.add(o);
      let meshes = 0;
      o.traverse((x) => { if (x.isMesh) meshes++; });
      if (meshes) this.items.push(new Item(o, this.nameOf(o)));
    };
    // (and the model's own drill props: what it names 'shell-', which is not steel (crewcheck.js Steel), such as the
    // Wurfgerät's carried crate, the Nebelwerfers' rockets, the shell passed up into the Wespe and the Hummel)
    this.rig.root.traverse((o) => { if (o !== this.rig.root && o.name?.startsWith('shell-') && !men.has(o)) { let up = false; for (let p = o.parent; p && p !== this.rig.root; p = p.parent) if (p.name?.startsWith('shell-')) up = true; if (!up) add(o); } });
    for (const o of this.rig.root.children) {
      if (this.pre.has(o) || men.has(o)) continue;
      if (o.name === 'crew-heavy-equipment') for (const c of o.children) add(c);
      else add(o);
    }
  }

  // the crew's field that holds the object (one level into plain objects and arrays), for a readable name
  nameOf(o) {
    const seen = new Set();
    const look = (obj, path, depth) => {
      if (!obj || typeof obj !== 'object' || seen.has(obj) || obj.isObject3D && obj !== this.crew) return null;
      seen.add(obj);
      for (const [k, v] of Object.entries(obj)) {
        if (v === o) return path + k;
        if (depth > 0 && v && typeof v === 'object' && !v.isObject3D && k !== 'rig' && k !== 'men' && k !== 'field') { const r = look(v, path + k + '.', depth - 1); if (r) return r; }
      }
      return null;
    };
    return look(this.crew, '', 2) ?? (o.name || `prop${this.items.length}`);
  }

  // one thing off this frame: cls is the result it goes in (grip, props, and crewbody.js's joint, self, hit), gap how far
  // off (metres, or degrees for a joint), big the amount anyone sees at a glance (counted apart and used to rank)
  log(cls, key, gap, c, T, what, pt, big = BIG) {
    const R = this.res[cls][key] ??= { t: 0, big: 0, worst: 0, at: '', what: '' };
    R.t += this.DT;
    if (gap > big) R.big += this.DT;
    const step = `${c.s ?? c.st}`, k = (c.k ?? 0).toFixed(2);
    if (gap > R.worst) { R.worst = gap; R.at = `@${step} k=${k} t=${T.toFixed(2)}`; R.what = what; }
    // the worst instant of each thing in each step is a candidate for the contact sheet
    const mk = `${what.split(':')[0]}|${step}`, M = this.res.moments, old = M.find((x) => x.key === mk);
    const rec = { key: mk, slot: R, cls, sev: gap / big, gap: +gap.toFixed(3), t: +T.toFixed(2), step, k: +k, what, pt: pt.map((v) => +v.toFixed(2)) };
    if (!old) M.push(rec); else if (rec.sev > old.sev) Object.assign(old, rec);
  }

  // one sampled frame (every `every` frames: the seconds count that many frames each)
  check(c, T, bodies, every) {
    const { crew, steel, walls } = this, DT0 = this.DT;
    this.DT = DT0 * every;
    if (++this.n % 15 === 1) this.scan();
    const vis = this.items.filter((it) => shown(it.obj) && it.update());
    const now = c.now ?? T;
    // every hand, and whether it is meant to hold something
    const hands = [];
    crew.men.forEach((m, i) => {
      if (!m.root.visible || !bodies[i]) return;
      const A = m._audit ?? {}, hold = HOLD[m._pose] ?? '', settled = !(now - (m.poseAt ?? -1e9) < BLEND);
      for (const side of ['L', 'R']) {
        m.fig.anchors['hand' + side].getWorldPosition(_v);
        const ik = !!A.grip?.[side];
        hands.push({ m, i, side, x: _v.x, y: _v.y, z: _v.z, need: ik ? 'ik' : settled && hold.includes(side) ? m._pose : null });
      }
    });
    const pitGap = (x, y, z) => {
      let best = Infinity;
      for (const b of walls) best = Math.min(best, Math.hypot(Math.max(b.min[0] - x, 0, x - b.max[0]), Math.max(b.min[1] - y, 0, y - b.max[1]), Math.max(b.min[2] - z, 0, z - b.max[2])));
      return best;
    };
    const steelGap = (x, y, z, lim) => { const h = steel.hit(x, y, z, x, y, z, lim, -1e9); return h.d > 0 ? lim - h.d : Infinity; };
    // does any steel surface point come within `lim` of the prop's triangles (exact, so only the steel's 5 cm sampling
    // limits it; the prop's own sparse points against the steel's points put a 1.5 m shell up to 10 cm off)
    const steelTouches = (it, lim) => {
      if (!steel.dim) return false;
      const c = steel.cell, [dx, dy, dz] = steel.dim, [ox, oy, oz] = steel.org, W = steel.world, S = steel.start, mn = it.min, mx = it.max;
      const i0 = Math.max(0, ((mn[0] - lim - ox) / c) | 0), i1 = Math.min(dx - 1, ((mx[0] + lim - ox) / c) | 0);
      const j0 = Math.max(0, ((mn[1] - lim - oy) / c) | 0), j1 = Math.min(dy - 1, ((mx[1] + lim - oy) / c) | 0);
      const k0 = Math.max(0, ((mn[2] - lim - oz) / c) | 0), k1 = Math.min(dz - 1, ((mx[2] + lim - oz) / c) | 0);
      for (let iz = k0; iz <= k1; iz++) for (let iy = j0; iy <= j1; iy++) for (let ix = i0; ix <= i1; ix++) {
        const k = (iz * dy + iy) * dx + ix;
        for (let s = S[k]; s < S[k + 1]; s++) {
          const i = steel.sorted[s];
          if (it.dist(W[i * 3], W[i * 3 + 1], W[i * 3 + 2], lim) < Infinity) return true;
        }
      }
      return false;
    };

    // ---- the props: borne by a hand, a body, the steel, the ground, a pit box; then by a borne prop
    const borne = new Map();
    for (const it of vis) {
      const R = this.res.props[it.name] ??= { shown: 0, t: 0, big: 0, worst: 0, at: '', by: {} };
      R.shown += this.DT;
      let by = null;
      for (const h of hands) if (it.dist(h.x, h.y, h.z, FIST) < Infinity) { by = h.m.role; R.by[by] = 1; break; }
      if (!by && it.min[1] < REST) by = 'ground';
      const Q = it.Q, n = it.nQ / 3, stride = Math.max(1, Math.floor(n / 160));
      if (!by && steelTouches(it, STEEL_REST)) by = 'steel';
      if (!by) for (let i = 0; i < n && !by; i += stride) {
        const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2];
        if (walls.length && pitGap(x, y, z) < REST) by = 'pit';
        else for (let j = 0; j < bodies.length && !by; j++) if (bodies[j] && bodyGap(bodies[j], x, y, z) < REST) by = 'body:' + crew.men[j].role;
      }
      // in the bore or the chamber (inside the steel with no surface near)
      if (!by) for (let i = 0; i < n && !by; i += stride * 8) if (steel.inside(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2])) by = 'steel';
      borne.set(it, by);
    }
    for (let pass = 0; pass < 3; pass++) for (const it of vis) {
      if (borne.get(it)) continue;
      const Q = it.Q, n = it.nQ / 3, stride = Math.max(1, Math.floor(n / 160));
      for (const o of vis) {
        if (o === it || !borne.get(o)) continue;
        let hit = false;
        for (let i = 0; i < n && !hit; i += stride) hit = o.dist(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2], REST) < Infinity;
        if (hit) { borne.set(it, 'on:' + o.name); break; }
      }
    }
    for (const it of vis) {
      if (borne.get(it)) continue;
      // how far it is from being borne: the nearest hand, the ground, the steel
      let gap = Math.max(0, it.min[1]);
      for (const h of hands) gap = Math.min(gap, it.dist(h.x, h.y, h.z, FAR));
      const Q = it.Q, n = it.nQ / 3, stride = Math.max(1, Math.floor(n / 40));
      for (let i = 0; i < n; i += stride) gap = Math.min(gap, steelGap(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2], FAR));
      this.log('props', it.name, Math.min(gap, FAR), c, T, 'float ' + it.name, it.centre);
    }

    // ---- the hands meant to hold something
    for (const h of hands) {
      if (!h.need) continue;
      const { x, y, z } = h;
      let ok = false;
      for (const it of vis) if (it.dist(x, y, z, FIST) < Infinity) { ok = true; break; }
      if (!ok) ok = steelGap(x, y, z, FIST) < FIST || steel.inside(x, y, z) || (walls.length && pitGap(x, y, z) < FIST) || (h.need === 'ik' && y < FIST);
      if (!ok) for (let j = 0; j < bodies.length && !ok; j++) if (j !== h.i && bodies[j] && bodyGap(bodies[j], x, y, z) < FIST - 0.02) ok = true;
      if (ok) continue;
      let gap = Math.min(FAR, steelGap(x, y, z, FAR));
      for (const it of vis) gap = Math.min(gap, it.dist(x, y, z, FAR));
      this.log('grip', `${h.m.role} ${h.side}`, gap, c, T, `hand ${h.m.role} ${h.side} (${h.need})`, [x, y, z]);
    }
    this.DT = DT0;
  }

  // the worst instants, at least `apart` seconds from each other: the worst of each thing (a hand, a prop, a joint, a
  // pair of limbs), the things that are off longest at a glance first, taken in turn from each kind of fault so every
  // kind shows, then the next worst steps of the same things
  moments(n = 6, apart = 0.6) {
    const out = [], all = [...this.res.moments].sort((a, b) => b.sev - a.sev), firsts = new Map();
    for (const m of all) if (!firsts.has(m.slot)) firsts.set(m.slot, m);
    const things = [...firsts.values()].sort((a, b) => b.slot.big - a.slot.big || b.slot.t - a.slot.t || b.sev - a.sev);
    const byCls = new Map();
    for (const m of things) { if (!byCls.has(m.cls)) byCls.set(m.cls, []); byCls.get(m.cls).push(m); }
    const turns = [];
    for (let i = 0; turns.length < things.length; i++) for (const L of byCls.values()) if (L[i]) turns.push(L[i]);
    for (const m of [...turns, ...all]) {
      if (out.length >= n) break;
      if (out.includes(m) || out.some((o) => Math.abs(o.t - m.t) < apart)) continue;
      out.push(m);
    }
    return out.sort((a, b) => a.t - b.t).map(({ slot, ...m }) => m);
  }
}

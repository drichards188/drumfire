import * as THREE from 'three';
import { pitSolids } from '../world/battery.js';

// Where a crewman's body may stand: a plan-view occupancy grid of the gun's steel (and the pit's walls,
// stack and crates) in the rig's root frame at zero traverse, seen through the height band of a man
// standing on a floor (feet + 0.16 m to feet + 1.75 m). Two flavours: `home` is the union of every pose
// the gun takes (elevations, breech open or shut, the recoil, the crane's swing, the trolley's run; the railway car's roll-back is not swept: its men ride it), for
// the places men stand at the shot; `work` leaves the recoil out (the gun sits run out while it is loaded).
// From it: `snap` (nearest standing place with clearance), `route` (a path round the steel, string pulled)
// and `free`. Built once per gun kind (the rig part is cached); the pit is overlaid per position.
// Everything is a pure function of the geometry, so the choreography stays a pure function of job time.

const CELL = 0.1, LO = 0.1, HI = 1.75;
const MOVERS = new Set(['elevation', 'recoil', 'breech', 'tray', 'crane', 'hoist', 'trolley']);
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const cache = new Map();

function groupOf(o) {
  let g = null;
  for (let p = o.parent; p; p = p.parent) {
    if (p.name === 'crane' || p.name === 'trolley') return p.name;
    if (MOVERS.has(p.name)) g = 'gun';
  }
  return g;
}

class Raster {
  constructor(b) {
    this.x0 = b.x0; this.z0 = b.z0; this.w = b.w; this.h = b.h;
  }
  // mark the cells a triangle (plan view) touches, when it overlaps the band [lo, hi] in y
  tri(occ, ax, ay, az, bx, by, bz, cx, cy, cz, lo, hi) {
    if (Math.max(ay, by, cy) < lo || Math.min(ay, by, cy) > hi) return;
    const { x0, z0, w, h } = this, tol = CELL * 0.6;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - tol - x0) / CELL)), i1 = Math.min(w - 1, Math.floor((Math.max(ax, bx, cx) + tol - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - tol - z0) / CELL)), j1 = Math.min(h - 1, Math.floor((Math.max(az, bz, cz) + tol - z0) / CELL));
    if (i0 > i1 || j0 > j1) return;
    const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        const k = j * w + i;
        if (occ[k]) continue;
        const px = x0 + (i + 0.5) * CELL;
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
}
function segD(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  let t = l > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

// the steel of a rig for the given floors, in two layers: `rot` (under the traverse pivot, drawn at zero
// traverse, in the gun's own frame) and `fix` (the rest, in the root frame). Each holds the `home` and
// `work` flavours per floor level, and the decks (what tops out at a floor's height) per level.
function buildRig(rig, kind, floors, g, bounds) {
  const R = new Raster(bounds), n = bounds.w * bounds.h;
  const items = [];
  rig.root.updateMatrixWorld(true);
  rig.root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    for (let p = o; p; p = p.parent) if (p.name && p.name.startsWith('shell-')) return;
    let layer = 'fix';
    for (let p = o.parent; p; p = p.parent) if (p.name === 'traverse') layer = 'rot';
    items.push({ mesh: o, group: groupOf(o), layer });
  });
  const mk = () => floors.map(() => new Uint8Array(n));
  const occ = { rot: { home: mk(), work: mk(), fixed: mk(), surf: mk() }, fix: { home: mk(), work: mk(), fixed: mk(), surf: mk() } };
  const draw = (list, key) => {
    rig.root.updateMatrixWorld(true);
    _inv.copy(rig.root.matrixWorld).invert();
    for (const it of list) {
      const out = occ[it.layer][key], geo = it.mesh.geometry, pos = geo.attributes.position, idx = geo.index;
      _m.multiplyMatrices(_inv, it.mesh.matrixWorld);
      const nt = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < nt; t++) {
        for (let k = 0; k < 3; k++) _p[k].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(_m);
        for (let l = 0; l < floors.length; l++) R.tri(out[l], _p[0].x, _p[0].y, _p[0].z, _p[1].x, _p[1].y, _p[1].z, _p[2].x, _p[2].y, _p[2].z, floors[l] + LO, floors[l] + HI);
        if (key === 'fixed') {
          // decks: topping out at a floor's height, up to 12 cm below it (a platform a man steps up onto)
          const top = Math.max(_p[0].y, _p[1].y, _p[2].y);
          for (let l = 0; l < floors.length; l++) if (floors[l] > 0.05 && top <= floors[l] + 0.03 && top >= floors[l] - 0.12) R.tri(occ[it.layer].surf[l], _p[0].x, 0, _p[0].z, _p[1].x, 0, _p[1].z, _p[2].x, 0, _p[2].z, -1, 1);
        }
      }
    }
  };
  const rest = { t: rig.pivots.trolley ? rig.pivots.trolley.position.z : 0 };
  const reset = () => { rig.setCar?.(0); rig.setTraverse(0); rig.setRecoil(0); rig.setBreech(0); rig.setTray?.(1); rig.setElevation(g.restEl); rig.update?.(0.016); if (rig.pivots.crane) rig.pivots.crane.rotation.y = Math.PI; if (rig.pivots.hoist) rig.pivots.hoist.position.y = rig.hoistRange?.up ?? 3.6; if (rig.pivots.trolley) rig.pivots.trolley.position.z = rest.t; };
  reset();
  draw(items.filter((i) => !i.group), 'fixed');
  const sweep = (list, poses, flavours) => {
    for (const pose of poses) {
      reset(); pose();
      for (const f of flavours) draw(list, f);
    }
    reset();
  };
  const heavy = g.load[0].step === 'depress';
  // loading happens at the loading elevation (heavies) or any laid elevation (the others); the shot at any
  const elsW = heavy ? [g.loadEl] : [0, 0.25, 0.5, 0.75, 1].map((k) => g.elMin + (g.elMax - g.elMin) * k);
  const els = heavy ? [g.loadEl, g.restEl, g.elMin, g.elMax] : elsW;
  const gun = items.filter((i) => i.group === 'gun'), crane = items.filter((i) => i.group === 'crane'), trol = items.filter((i) => i.group === 'trolley');
  // the block opens with the tray out, then the tray comes in; at the close the tray goes out and the block shuts (guns.js loadPose)
  const posesFor = (list) => {
    const o = [], ks = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
    for (const e of list) {
      for (const b of ks) o.push(() => { rig.setElevation(e); rig.setBreech(b); rig.setTray?.(1); rig.update?.(0.016); });
      for (const t of ks) o.push(() => { rig.setElevation(e); rig.setBreech(1); rig.setTray?.(t); rig.update?.(0.016); });
    }
    return o;
  };
  sweep(gun, posesFor(elsW), ['work']);
  const recPoses = [];
  for (const e of els) recPoses.push(() => { rig.setElevation(e); rig.setRecoil(1); rig.update?.(0.016); });
  sweep(gun, posesFor(els).concat(recPoses), ['home']);
  if (crane.length) {
    // at the shot the jib may be anywhere; while loading it swings from the pick-up (PI) to the tray
    const cr = rig.pivots.crane, up = rig.hoistRange?.up ?? 3.6;
    reset(); rig.setElevation(g.loadEl); rig.root.updateMatrixWorld(true);
    _inv.copy(rig.root.matrixWorld).invert();
    const T = rig.anchors.tray.getWorldPosition(new THREE.Vector3()).applyMatrix4(_inv);
    const aT = Math.atan2(T.z - cr.position.z, -(T.x - cr.position.x));
    // the real path: lowered at the pick-up and at the tray, carried high between (crews.js mechanisms)
    const swing = [], pose = (a, hy) => swing.push(() => { rig.setElevation(g.loadEl); rig.update?.(0.016); cr.rotation.y = a; if (rig.pivots.hoist) rig.pivots.hoist.position.y = hy; });
    for (const a of [Math.PI, aT]) for (let q = 0; q <= 4; q++) pose(a, 1.7 + (up - 1.7) * (q / 4));
    for (let i = 1; i < 10; i++) pose(Math.PI + (aT - Math.PI) * (i / 10), up);
    sweep(crane, swing, ['work', 'home']);
  }
  if (trol.length) sweep(trol, [0, 1, 2, 3].map((k) => () => { rig.pivots.trolley.position.z = rest.t - k; }), ['work', 'home']);
  for (const ly of ['rot', 'fix']) for (const f of ['home', 'work']) for (let l = 0; l < floors.length; l++) { const o = occ[ly][f][l], s = occ[ly].fixed[l]; for (let i = 0; i < n; i++) o[i] |= s[i]; }
  return occ;
}

export class CrewField {
  constructor(rig, kind, g, floors, place, workY = 0) {
    this.floors = floors;
    // bounds: the rig's plan, the crew spots, the pit
    const box = new THREE.Box3().setFromObject(rig.root);
    let x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z;
    for (const s of rig.anchors.crew) { x0 = Math.min(x0, s.x - 2); x1 = Math.max(x1, s.x + 2); z0 = Math.min(z0, s.z - 2); z1 = Math.max(z1, s.z + 2); }
    const pit = pitSolids(kind, place.x, place.z);
    for (const b of pit) if (b.name !== 'wall') { x0 = Math.min(x0, b.x0 - 1); x1 = Math.max(x1, b.x1 + 1); z0 = Math.min(z0, b.z0 - 1); z1 = Math.max(z1, b.z1 + 1); }
    // the 18-inch car is 21 m long and stands behind the pit's usual 24 m limit (its men and the hoist's stack are at z 8 to 12)
    const zLo = kind === 'rail' ? -16 : -8, zHi = kind === 'rail' ? 32 : 24;
    x0 = Math.max(x0 - 1.5, -16); x1 = Math.min(x1 + 1.5, 16); z0 = Math.max(z0 - 1.5, zLo); z1 = Math.min(z1 + 1.5, zHi);
    const cb = cache.get(kind + '|' + floors.join(','));
    this.b = cb ? cb.b : { x0: Math.floor(x0 * 10) / 10, z0: Math.floor(z0 * 10) / 10, w: Math.ceil((x1 - x0) / CELL), h: Math.ceil((z1 - z0) / CELL) };
    const key = kind + '|' + floors.join(',');
    let base = cache.get(key);
    if (!base) { base = buildRig(rig, kind, floors, g, this.b); cache.set(key, { occ: base, b: this.b }); } else base = base.occ;
    const { w, h } = this.b, n = w * h;
    // the pit goes into the fixed layer; distances per layer, flavour and level
    this.ca = 1; this.sa = 0;
    const tv = rig.pivots.traverse; // the mounting turns about this point (the 18-inch's is 0.8 m forward of the car's middle)
    this.px = tv ? tv.position.x : 0; this.pz = tv ? tv.position.z : 0;
    this.dist = { rot: { home: [], work: [] }, fix: { home: [], work: [] } };
    this.fixOcc = { home: [], work: [] };
    for (const f of ['home', 'work']) floors.forEach((fy, l) => {
      const o = base.fix[f][l].slice();
      for (const b of pit) {
        const i0 = Math.max(0, Math.floor((b.x0 - this.b.x0) / CELL)), i1 = Math.min(w - 1, Math.floor((b.x1 - this.b.x0) / CELL));
        const j0 = Math.max(0, Math.floor((b.z0 - this.b.z0) / CELL)), j1 = Math.min(h - 1, Math.floor((b.z1 - this.b.z0) / CELL));
        if (b.h < fy + LO) continue;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) o[j * w + i] = 1;
      }
      this.fixOcc[f][l] = o;
      this.dist.fix[f][l] = distance(o, w, h);
      this.dist.rot[f][l] = distance(base.rot[f][l], w, h);
    });
    this.n = n;
    this.pit = pit;
    // for walks that climb from the ground to the work floor: the work band blocked, or the ground band blocked
    // where it is not a deck (a case on the ground stops him, the platform's skirt does not)
    this.lwI = this.level(workY); this.l0I = this.level(0);
    if (this.lwI !== this.l0I) {
      for (const ly of ['rot', 'fix']) {
        const src = ly === 'fix' ? this.fixOcc : base[ly], o = src.work[this.lwI].slice(), g0 = base[ly].work[this.l0I], g1 = src.work[this.l0I], sf = this.deckOf(base, ly, workY);
        for (let i = 0; i < o.length; i++) if ((g0[i] && !sf[i]) || (g1[i] && !g0[i])) o[i] = 1;
        this.dist[ly].comb = [];
        this.dist[ly].comb[this.lwI] = distance(o, w, h);
      }
      this.hasComb = true;
    }
    // standing places must stay clear however the gun is traversed: each frame's home field also holds the
    // other layer turned through the gun's whole traverse
    this.homeD = { rot: [], fix: [] };
    const trav = Math.min(g.traverse ?? 0, 0.35), step = 0.026; // the first 20 degrees either way; beyond, the men and the carriage part ways (see crewcheck scn 3 and 4)
    floors.forEach((fy, l) => {
      for (const ly of ['rot', 'fix']) {
        const src = ly === 'rot' ? this.fixOcc.home[l] : base.rot.home[l], mine = ly === 'rot' ? base.rot.home[l] : this.fixOcc.home[l], o = mine.slice();
        // src is the other layer: into the rot frame turn it by -az, into the root frame by +az
        for (let a = -trav; a <= trav + 1e-6; a += step) {
          const c = Math.cos(a), sn = Math.sin(a);
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            if (!src[j * w + i]) continue;
            const x = this.b.x0 + (i + 0.5) * CELL, z = this.b.z0 + (j + 0.5) * CELL;
            const ex = x - this.px, ez = z - this.pz;
            const nx = (ly === 'rot' ? ex * c - ez * sn : ex * c + ez * sn) + this.px, nz = (ly === 'rot' ? ex * sn + ez * c : -ex * sn + ez * c) + this.pz;
            const ii = Math.floor((nx - this.b.x0) / CELL), jj = Math.floor((nz - this.b.z0) / CELL);
            if (ii >= 0 && jj >= 0 && ii < w && jj < h) o[jj * w + ii] = 1;
          }
        }
        this.homeD[ly][l] = distance(o, w, h);
      }
    });
    const dr = this.deckOf(base, 'rot', workY), df = this.deckOf(base, 'fix', workY);
    this.surfL = dr.map((v, i) => v | df[i]);
    this.g = new Float32Array(n); this.from = new Int32Array(n); this.stamp = new Uint32Array(n); this.closed = new Uint8Array(n);
    this.heap = new Int32Array(n + 8); this.f = new Float32Array(n);
    this.okS = new Uint32Array(n); this.okV = new Uint8Array(n); // a cell's clearance, once per search (route)
    this.cur = 0;
    this.blk = [];
    this.ends = null;
    this.relax = 0.28;
  }

  // every deck at or below the work floor, as one mask
  deckOf(base, ly, workY) {
    const m = new Uint8Array(this.b.w * this.b.h);
    this.floors.forEach((f, l) => { if (f > 0.05 && f <= workY + 0.01) for (let i = 0; i < m.length; i++) m[i] |= base[ly].surf[l][i]; });
    return m;
  }

  // the gun's traverse: the rotating layer turns against the fixed one
  setAz(az) { this.ca = Math.cos(az); this.sa = Math.sin(az); }

  level(y) {
    let best = 0, bd = 1e9;
    this.floors.forEach((f, i) => { const d = Math.abs(f - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  cellD(D, x, z) {
    const { x0, z0, w, h } = this.b, i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    return i < 0 || j < 0 || i >= w || j >= h ? 9 : D[j * w + i];
  }

  // clearance at a point of the man's frame: the gun's own frame (world false) or the root's (world true)
  dAt(fl, l, x, z, world = false) {
    const c = this.ca, s = this.sa, px = this.px, pz = this.pz;
    let rx, rz, fx, fz;
    if (world) { const dx = x - px, dz = z - pz; fx = x; fz = z; rx = dx * c - dz * s + px; rz = dx * s + dz * c + pz; } else { const dx = x - px, dz = z - pz; rx = x; rz = z; fx = dx * c + dz * s + px; fz = -dx * s + dz * c + pz; }
    return Math.min(this.cellD(this.dist.rot[fl][l], rx, rz), this.cellD(this.dist.fix[fl][l], fx, fz));
  }

  free(fl, l, x, z, r, world = false) {
    if (this.dAt(fl, l, x, z, world) < r) return false;
    for (const b of this.blk) if (Math.hypot(b[0] - x, b[1] - z) < r + b[2]) return false;
    return true;
  }

  // like snap, for a standing place at construction: clear whatever the traverse
  snapHome(l, x, z, r, out, world) {
    const D = world ? this.homeD.fix[l] : this.homeD.rot[l], keep = this.dist;
    this.dist = { rot: { home: [], work: [] }, fix: { home: [], work: [] } };
    this.dist.rot.home[l] = D; this.dist.fix.home[l] = D;
    this.snap('home', l, x, z, r, out, false);
    this.dist = keep;
    return out;
  }

  // nearest standing place with clearance r (rings outward, 5 cm steps)
  snap(fl, l, x, z, r, out, world = false) {
    if (this.free(fl, l, x, z, r, world)) { out.x = x; out.z = z; return out; }
    // a spot in a sandbag wall goes inboard, not out of the pit
    let inward = false;
    for (const b of this.pit) if (b.name === 'wall' && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) inward = true;
    for (let rad = 0.05; rad < 4; rad += 0.05) {
      let best = -1, bx = x, bz = z;
      const steps = Math.max(8, Math.ceil(rad * 40));
      for (let a = 0; a < steps; a++) {
        const th = (a / steps) * Math.PI * 2, px = x + Math.cos(th) * rad, pz = z + Math.sin(th) * rad;
        if (!this.free(fl, l, px, pz, r, world) || (inward && Math.abs(px) > Math.abs(x))) continue;
        const sc = this.dAt(fl, l, px, pz, world);
        if (sc > best) { best = sc; bx = px; bz = pz; }
      }
      if (best >= 0) { out.x = bx; out.z = bz; return out; }
    }
    out.x = x; out.z = z;
    return out;
  }

  // clearance asked of a walker at (x, z): r in the open, relaxed to 0.2 at either end of his walk (he starts and ends close to things)
  rAt(x, z, ends, r) {
    const d = Math.min(Math.hypot(x - ends[0], z - ends[1]), Math.hypot(x - ends[2], z - ends[3]));
    return Math.min(r, this.relax + d * 0.5);
  }

  lineFree(fl, l, ax, az, bx, bz, r, world) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (CELL * 0.5))), E = this.ends;
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (!this.free(fl, l, x, z, E ? this.rAt(x, z, E, r) : r, world)) return false;
    }
    return true;
  }

  // a path from a to b keeping r from the steel (and from the registered blockers): fills poly { n, x[], z[], len }
  route(fl, l, ax, az, bx, bz, r, poly, world = false, relax = 0.28) {
    this.relax = relax;
    poly.n = 0; poly.len = 0;
    const E = this.ends = [ax, az, bx, bz], rr = r;
    const push = (x, z) => { poly.x[poly.n] = x; poly.z[poly.n] = z; poly.n++; };
    if (this.lineFree(fl, l, ax, az, bx, bz, r, world)) { push(ax, az); push(bx, bz); this.ends = null; return finish(poly); }
    const { x0, z0, w, h } = this.b;
    const ci = (x, z) => Math.min(w - 1, Math.max(0, Math.floor((z - z0) / CELL))) * w + Math.min(w - 1, Math.max(0, Math.floor((x - x0) / CELL)));
    const s = ci(ax, az), e = ci(bx, bz), st = ++this.cur;
    const G = this.g, F = this.f, P = this.from, S = this.stamp, C = this.closed, H = this.heap;
    let hn = 0;
    const ex = e % w, ez = (e / w) | 0;
    const hf = (k) => { const dx = Math.abs((k % w) - ex), dz = Math.abs(((k / w) | 0) - ez); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * CELL; };
    const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (F[H[p]] <= F[H[i]]) break; const t = H[p]; H[p] = H[i]; H[i] = t; i = p; } };
    const down = (i) => { for (;;) { let m = i; const l1 = 2 * i + 1, r1 = l1 + 1; if (l1 < hn && F[H[l1]] < F[H[m]]) m = l1; if (r1 < hn && F[H[r1]] < F[H[m]]) m = r1; if (m === i) break; const t = H[m]; H[m] = H[i]; H[i] = t; i = m; } };
    // a cell's clearance is asked up to 24 times a search (each neighbour, the diagonals' corners): remember it
    const OS = this.okS, OV = this.okV;
    const ok = (k) => {
      if (OS[k] === st) return OV[k] === 1;
      OS[k] = st;
      const x = x0 + ((k % w) + 0.5) * CELL, z = z0 + (((k / w) | 0) + 0.5) * CELL, re = this.rAt(x, z, E, rr);
      let v = this.dAt(fl, l, x, z, world) >= re;
      if (v) for (const b of this.blk) if (Math.hypot(b[0] - x, b[1] - z) < re + b[2]) { v = false; break; }
      OV[k] = v ? 1 : 0;
      return v;
    };
    G[s] = 0; F[s] = hf(s); S[s] = st; C[s] = 0; P[s] = -1; H[hn++] = s;
    let found = false, nx = 0;
    while (hn) {
      const k = H[0]; H[0] = H[--hn]; down(0);
      if (C[k]) continue;
      C[k] = 1;
      nx++;
      if (k === e) { found = true; break; }
      const ki = k % w, kj = (k / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ki + di, nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        if (nk !== e && !ok(nk)) continue;
        if (di && dj && (!ok(kj * w + ni) || !ok(nj * w + ki))) continue;
        const dn = this.dAt(fl, l, x0 + (ni + 0.5) * CELL, z0 + (nj + 0.5) * CELL, world), near = dn < rr + 0.2 ? (rr + 0.2 - dn) * 4 : 0;
        const ng = G[k] + (di && dj ? 1.414 : 1) * CELL * (1 + near);
        if (S[nk] === st && ng >= G[nk]) continue;
        S[nk] = st; G[nk] = ng; F[nk] = ng + hf(nk); P[nk] = k; C[nk] = 0;
        if (hn < H.length - 1) { H[hn] = nk; up(hn++); }
      }
    }
    this.nExp = nx; // (cells expanded, for profiling)
    if (!found) {
      // boxed in by the other men: try again past them, then give up and walk straight
      this.ends = null;
      if (relax > 0.3) { this.route(fl, l, ax, az, bx, bz, r, poly, world, 0.28); return poly; }
      if (this.blk.length) { const keep = this.blk.slice(); this.blk.length = 0; this.route(fl, l, ax, az, bx, bz, r, poly, world, relax); this.blk.push(...keep); return poly; }
      if (this.debug) console.warn('route failed', fl, l, ax, az, bx, bz, r);
      push(ax, az); push(bx, bz);
      return finish(poly);
    }
    // cells back to points, then string pulled
    const cells = [];
    for (let k = e; k >= 0; k = P[k]) { cells.push(k); if (k === s) break; }
    cells.reverse();
    // only the corners of the grid path (where its step turns) are candidates for the pulled string: the straight
    // runs between them add nothing, and testing lines to every cell from the far end back cost tens of ms a route
    const keep = cells.filter((k, n) => n === 0 || n === cells.length - 1 || k - cells[n - 1] !== cells[n + 1] - k);
    const pts = keep.map((k) => [x0 + ((k % w) + 0.5) * CELL, z0 + (((k / w) | 0) + 0.5) * CELL]);
    pts[0] = [ax, az]; pts[pts.length - 1] = [bx, bz];
    let i = 0;
    push(ax, az);
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(fl, l, pts[i][0], pts[i][1], pts[j][0], pts[j][1], r, world)) j--;
      if (poly.n < poly.x.length - 1) push(pts[j][0], pts[j][1]);
      i = j;
    }
    this.ends = null;
    return finish(poly);
  }

  onSurf(l, x, z) {
    const { x0, z0, w, h } = this.b, i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    return i >= 0 && j >= 0 && i < w && j < h && this.surfL[j * w + i] === 1;
  }

  // the spot nearest (gx, gz) that he can walk to from (ax, az) in at most maxLen metres of path (a flood fill)
  closest(fl, l, ax, az, gx, gz, r, maxLen, out, world = false) {
    const { x0, z0, w, h } = this.b, G = this.g, S = this.stamp, F = this.f, H = this.heap, C = this.closed, st = ++this.cur;
    const E = this.ends = [ax, az, ax, az];
    const s = Math.min(h - 1, Math.max(0, Math.floor((az - z0) / CELL))) * w + Math.min(w - 1, Math.max(0, Math.floor((ax - x0) / CELL)));
    let hn = 0, best = 1e9, bk = s;
    const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (F[H[p]] <= F[H[i]]) break; const t = H[p]; H[p] = H[i]; H[i] = t; i = p; } };
    const down = (i) => { for (;;) { let m = i; const l1 = 2 * i + 1, r1 = l1 + 1; if (l1 < hn && F[H[l1]] < F[H[m]]) m = l1; if (r1 < hn && F[H[r1]] < F[H[m]]) m = r1; if (m === i) break; const t = H[m]; H[m] = H[i]; H[i] = t; i = m; } };
    G[s] = 0; F[s] = 0; S[s] = st; C[s] = 0; H[hn++] = s;
    while (hn) {
      const k = H[0]; H[0] = H[--hn]; down(0);
      if (C[k]) continue;
      C[k] = 1;
      const ki = k % w, kj = (k / w) | 0, x = x0 + (ki + 0.5) * CELL, z = z0 + (kj + 0.5) * CELL, d = Math.hypot(x - gx, z - gz);
      if (d < best && this.free(fl, l, x, z, r, world)) { best = d; bk = k; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ki + di, nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nx = x0 + (ni + 0.5) * CELL, nz = z0 + (nj + 0.5) * CELL;
        if (!this.free(fl, l, nx, nz, this.rAt(nx, nz, E, r), world)) continue;
        const nk = nj * w + ni, ng = G[k] + (di && dj ? 1.414 : 1) * CELL;
        if (ng > maxLen || (S[nk] === st && ng >= G[nk])) continue;
        S[nk] = st; G[nk] = ng; F[nk] = ng; C[nk] = 0;
        if (hn < H.length - 1) { H[hn] = nk; up(hn++); }
      }
    }
    this.ends = null;
    out.x = x0 + ((bk % w) + 0.5) * CELL; out.z = z0 + (((bk / w) | 0) + 0.5) * CELL;
    return out;
  }

  // where along a route the man steps up onto something (the first point the ground-level band is blocked), or -1
  findStep(poly, lg, lw, down = false) {
    if (lg === lw) return -1;
    let found = -1;
    for (let d = 0; d <= poly.len; d += 0.05) {
      let i = 1;
      while (i < poly.n - 1 && poly.c[i] < d) i++;
      const a = i - 1, f = poly.c[i] > poly.c[a] ? (d - poly.c[a]) / (poly.c[i] - poly.c[a]) : 0;
      if (this.onSurf(lw, poly.x[a] + (poly.x[i] - poly.x[a]) * f, poly.z[a] + (poly.z[i] - poly.z[a]) * f)) { found = d; if (!down) return d; }
    }
    return found;
  }

  // an ASCII plan (debug), layers merged
  ascii(fl, l, r = 0) {
    const { w, h } = this.b, rows = [];
    for (let j = 0; j < h; j += 2) {
      let s = '';
      for (let i = 0; i < w; i += 2) {
        const d = Math.min(this.dist.rot[fl][l][j * w + i], this.dist.fix[fl][l][j * w + i]);
        s += d <= 0 ? '#' : d < r ? '+' : ' ';
      }
      rows.push((this.b.z0 + j * CELL).toFixed(1).padStart(5) + ' ' + s);
    }
    return rows;
  }
}

export function newPoly(cap = 24) {
  return { n: 0, len: 0, x: new Float32Array(cap), z: new Float32Array(cap), c: new Float32Array(cap) };
}
export function finishPoly(poly) { return finish(poly); }
function finish(poly) {
  poly.c[0] = 0;
  for (let i = 1; i < poly.n; i++) poly.c[i] = poly.c[i - 1] + Math.hypot(poly.x[i] - poly.x[i - 1], poly.z[i] - poly.z[i - 1]);
  poly.len = poly.c[poly.n - 1];
  return poly;
}

// the point at distance s along a polyline, the heading turned smoothly through corners
export function polyAt(poly, s, out, headingOf, smooth, wrapPi) {
  const n = poly.n;
  s = s < 0 ? 0 : s > poly.len ? poly.len : s;
  let i = 1;
  while (i < n - 1 && poly.c[i] < s) i++;
  const a = i - 1, l = poly.c[i] - poly.c[a], f = l > 1e-6 ? (s - poly.c[a]) / l : 0;
  out.x = poly.x[a] + (poly.x[i] - poly.x[a]) * f;
  out.z = poly.z[a] + (poly.z[i] - poly.z[a]) * f;
  const hd = (j) => headingOf(poly.x[j + 1] - poly.x[j], poly.z[j + 1] - poly.z[j]);
  let h = hd(a);
  // blend toward the neighbouring segment within 0.5 m of a corner
  if (i < n - 1) h += wrapPi(hd(i) - h) * smooth(s, poly.c[i] - 0.5, poly.c[i] + 0.5);
  if (a > 0) h = hd(a - 1) + wrapPi(h - hd(a - 1)) * smooth(s, poly.c[a] - 0.5, poly.c[a] + 0.5);
  out.h = h;
  out.d = s;
  return out;
}

// Euclidean-ish distance to the nearest occupied cell, metres (two chamfer passes); occupied cells are 0
function distance(occ, w, h) {
  const D = new Float32Array(w * h), BIG = 1e3, a = CELL, b = CELL * 1.414;
  for (let i = 0; i < D.length; i++) D[i] = occ[i] ? 0 : BIG;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    let v = D[k];
    if (i > 0) v = Math.min(v, D[k - 1] + a);
    if (j > 0) { v = Math.min(v, D[k - w] + a); if (i > 0) v = Math.min(v, D[k - w - 1] + b); if (i < w - 1) v = Math.min(v, D[k - w + 1] + b); }
    D[k] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i;
    let v = D[k];
    if (i < w - 1) v = Math.min(v, D[k + 1] + a);
    if (j < h - 1) { v = Math.min(v, D[k + w] + a); if (i < w - 1) v = Math.min(v, D[k + w + 1] + b); if (i > 0) v = Math.min(v, D[k + w - 1] + b); }
    D[k] = v;
  }
  return D;
}

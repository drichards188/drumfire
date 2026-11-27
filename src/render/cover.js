import * as THREE from 'three';
import { COVER } from '../sim/guns.js';
import { trap, along, turn } from './drill_pace.js';
import { way } from './crewspace.js';
import { smooth, headingOf } from './anim.js';

// The crews taking cover (DECKUNG: sim/guns.js setCover, the ranging counter-battery): each man drops what he is doing
// and runs to his gun's shelter (render/shelters.js: the dugout's doorway, or a rocket launcher's slit trench), the men
// a moment apart, the doorway taken one at a time; a man on a platform goes across it to its side and climbs down (steps
// down off a low one) first. He ducks through the doorway and is gone (in a slit trench he crouches). The gun stands
// unmanned. Sent back to the guns, they come up out of the shelter and go back to their posts the same way, the last one
// there by manAt, and the drill takes over again where the gun stands (its job waits in the sim while the crew is away,
// so the place each man left is the place he comes back to).
// All of it is a pure function of the crew's turns (sim/guns.js setCover: u.coverLog, the times it turned since it last
// stood at its guns, and u.manAt), the time and the drill's own places, through one clock (wayClock: the seconds of the
// way to the shelter done), so time compression and a jump in time give the same men, and a crew sent back to cover
// halfway back turns where it is.
// The ways are searched once a turn of cover for the crew (the posts do not move while the guns stand) and kept; the
// gun the player serves in person (piece.manned) keeps its crew. Called from GunCrew.update (crews.js):
//   const cv = coverFrame(crew, piece, sim, now)   null while every man is at his post
//   coverMen(crew, cv)                             after every man's drill: each one on his way, at the shelter or in it
//   coverProps(crew, cv)                           after the props: what the men put down lies where they left it

const RUN = 3.0, RUN_MAX = 3.4, DECK_V = 2.0, CLIMB_V = 1.0, CLIMB_MAX = 1.8, HOP_Y = 1.3, HOP_T = 0.6;
const DUCK_T = 0.85, APPROACH = 1.1, INSIDE = 0.75, GAP = 0.4, RAMP = 0.25, JOG = 1.7;
const BUDGET = COVER.run - 0.15; // (every man in within COVER.run, and so back at his post by manAt)
const DUCK_MIN = 0.55, D_MIN = 0.05;
const UP = 0.6; // sent back, the moment before the first man comes up the steps
const CELL = 0.25, CLEAR = 0.22, ENDS = 0.6;
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _P = { x: 0, z: 0, h: 0, d: 0, len: 0 };

// the shelter's places in the rig root's frame this frame: its doorway (approach, door, inside) or its slots
function resolve(crew, spec, F) {
  // (the rig's matrix is this frame's, GunCrew.update; the parent's is last frame's: it stands still)
  _inv.copy(crew.rig.root.matrixWorld).invert();
  _m.copy(_inv).multiply(spec.parent.matrixWorld);
  F.spec = spec;
  if (spec.kind === 'trench') {
    while (F.slots.length < spec.slots.length) F.slots.push({ x: 0, z: 0 });
    F.slots.length = spec.slots.length;
    for (let i = 0; i < spec.slots.length; i++) {
      _v.set(spec.slots[i].x, 0, spec.slots[i].z).applyMatrix4(_m);
      F.slots[i].x = _v.x; F.slots[i].z = _v.z;
    }
    return F;
  }
  const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
  doorAt(spec, c, s, -APPROACH, F.app); doorAt(spec, c, s, 0, F.door); doorAt(spec, c, s, INSIDE, F.ins);
  F.inH = headingOf(F.ins.x - F.app.x, F.ins.z - F.app.z);
  return F;
}
// a point lz along the doorway's line (+ in, - out) into out, in the rig root's frame (_m: the parent's frame to it)
function doorAt(spec, c, s, lz, out) {
  _v.set(spec.x + lz * s, 0, spec.z + lz * c).applyMatrix4(_m);
  out.x = _v.x; out.y = _v.y; out.z = _v.z;
}

// The way's clock at time t: the seconds of the way to the shelter done, from the crew's turns (log: into cover at
// log[0], out at log[1], in again at log[2] ...). Rising a second a second while in cover, up to `end` (the crew's
// last man in); sent back, after a moment (UP) falling a second a second, never later than to be 0 at manAt (the men
// back at their posts by the time the sim has the guns manned). Plain arithmetic: the same for the same times.
function wayClock(log, t, end) {
  let tau = 0;
  for (let i = 0; i < log.length; i++) {
    const a = log[i], b = Math.min(t, i + 1 < log.length ? log[i + 1] : t);
    if (b < a) break;
    if (i % 2 === 0) tau = Math.min(end, tau + (b - a));
    else {
      // (the pause shortened when the way back would not fit before manAt otherwise)
      const up = Math.min(UP, Math.max(0, COVER.run - tau - 0.05));
      tau = Math.max(0, Math.min(tau, tau - (b - a - up), a + COVER.run - b));
    }
  }
  return tau;
}

// Which of the crew's shelters (the nearest to the gun at the turn's start: a self-propelled gun has one at each of its
// positions) and where its places are; null while the crew is at its guns
export function coverFrame(crew, p, sim, now) {
  const u = crew.unit, list = crew.shelters, log = u?.coverLog;
  if (!u || !list?.length || !log?.length || p.manned || p.state === 'dead' || (!u.cover && u.manAt == null)) { if (crew.cv) crew.cv.plans = null; return null; }
  const F = crew.cv ??= { spec: null, app: { x: 0, y: 0, z: 0 }, door: { x: 0, y: 0, z: 0 }, ins: { x: 0, y: 0, z: 0 }, inH: 0, slots: [], plans: null, tau: 0, now: 0, end: 0, going: true, key: NaN };
  F.now = now; F.going = !!u.cover;
  // the shelter and the men's ways, settled for this turn (a fresh one from the guns: log[0] its start)
  if (F.key !== log[0] || !F.spec) {
    const rp = crew.rig.root.position;
    let best = list[0], bd = Infinity;
    for (const s of list) { const d = Math.hypot(s.world.x - rp.x, s.world.z - rp.z); if (d < bd) { bd = d; best = s; } }
    // (a self-propelled gun driven away from its positions has none near: its men stay as they are)
    if (bd > 60) return null;
    F.plans = null;
    F.spec = best;
    F.key = log[0];
  }
  resolve(crew, F.spec, F);
  return F;
}

// After every man's drill this frame: the crew's ways (once a turn of cover, from the places the drill has them: their
// posts, the job standing still), then each man on his way, at the shelter or gone into it (a man not yet set off, or
// back at his post, is left as his drill put him).
export function coverMen(crew, F) {
  const men = crew.men, n = men.length;
  if (!F.plans) {
    F.plans = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (crew.gone(i)) continue;
      retime(F.plans[i] = planMan(crew, F, men[i], i));
    }
    // (at the doorway one at a time)
    if (F.spec.kind !== 'trench') stagger(F.plans);
    F.end = 0;
    for (const P of F.plans) if (P) F.end = Math.max(F.end, P.d + P.end);
  }
  F.tau = wayClock(crew.unit.coverLog, F.now, F.end);
  if (F.tau > 0) for (let i = 0; i < n; i++) if (!crew.gone(i) && F.plans[i]) coverMan(crew, men[i], F.plans[i], F);
}

// One man's way, once a turn: his legs from the place the drill has him to the shelter (walk along a platform, hop or
// climb down off it, run, duck in or crouch), timed, and his reaction (0.1 to 0.7 s, by his number: no random number).
//   { sx, sz, sy, sh, legs: [{ type, t0, dur, ... }], end, arrive, d }
function planMan(crew, F, m, i) {
  const S = m.sp, sx = S ? S.rawX : m.x, sz = S ? S.rawZ : m.z, sy = S ? S.rawY : m.y, sh = S ? S.rawH : m.h;
  const P = { sx, sz, sy, sh, legs: [], end: 0, d: 0.12 + 0.55 * frac(Math.sin((i + 1) * 12.9898 + crew.kind.length * 7.233) * 43758.5453) };
  const trench = F.spec.kind === 'trench';
  const goal = trench ? F.slots[i % F.slots.length] : F.app;
  let gx = sx, gz = sz;
  // off a platform: across it to its side edge on his own side of the gun, then down that side (each man where he is,
  // not the whole crew at the one end nearest the shelter)
  if (sy > 0.45) {
    const side = (sx - crew.pvx) * crew.rt.x + (sz - crew.pvz) * crew.rt.z < 0 ? -1 : 1;
    const E = deckEdge(crew, sx, sz, sy, sx + crew.rt.x * side * 40, sz + crew.rt.z * side * 40, goal.x, goal.z);
    if (E) {
      const pts = routeDeck(crew, sx, sz, sy, E.x, E.z);
      const dl = polyLen(pts);
      if (pts.length > 1 && dl > 0.05) P.legs.push({ type: 'walk', pts, y: sy, v: DECK_V, len: dl });
      const hop = sy <= HOP_Y;
      P.legs.push({ type: hop ? 'hop' : 'climb', ax: E.x, az: E.z, bx: E.cx, bz: E.cz, y: sy, v: CLIMB_V, len: sy });
      gx = E.cx; gz = E.cz;
    } else {
      // (no edge found: he gets down where he is)
      P.legs.push({ type: 'hop', ax: sx, az: sz, bx: sx, bz: sz, y: sy, v: CLIMB_V, len: sy });
    }
  }
  // (the walls' grid only while the gun stands as it stood when the grid was made, or turns with its position)
  const sp = F.spec, r = crew.rig.root, at = sp.rootAt;
  const still = at && Math.abs(r.position.x - at.x) < 0.3 && Math.abs(r.position.z - at.z) < 0.3 && Math.abs(r.rotation.y - at.yaw) < 0.01;
  const grid = sp.withRoot || still ? sp.grid : null;
  const pts = routeGround(crew, grid, gx, gz, goal.x, goal.z);
  P.legs.push({ type: 'run', pts, y: 0, v: RUN, len: polyLen(pts) });
  if (trench) {
    // facing his gun from the trench
    P.legs.push({ type: 'crouch', x: goal.x, z: goal.z, h: headingOf(crew.pvx - goal.x, crew.pvz - goal.z), dur: 0.45 });
  } else P.legs.push({ type: 'duck', dur: DUCK_T });
  time(P);
  return P;
}

// The legs' times at their own pace; a way too long for the budget is fitted by, in turn, a quicker reaction, the
// runs, walks and climbs at their quickest (never faster than the spacing lets a man be shown moving: crewspace.js
// V_MAX, or he would fall behind his place and vanish short of the door), a quicker duck, and only then everything
// pressed together
const legDur = (L, k) => L.type === 'walk' || L.type === 'run' ? L.len / Math.min(RUN_MAX, L.v * k) + RAMP
  : L.type === 'climb' ? L.len / Math.min(CLIMB_MAX, L.v * k) + 0.3 : L.type === 'hop' ? HOP_T : L.dur;
function time(P) {
  for (const L of P.legs) L.dur = legDur(L, 1);
  retime(P);
  let over = P.d + P.end - BUDGET;
  if (over > 0) { const cut = Math.min(over, P.d - D_MIN); P.d -= cut; over -= cut; }
  if (over > 0) { for (const L of P.legs) L.dur = legDur(L, 4); retime(P); over = P.d + P.end - BUDGET; }
  const duck = P.legs[P.legs.length - 1];
  if (over > 0 && duck.type === 'duck') { const cut = Math.min(over, duck.dur - DUCK_MIN); duck.dur -= cut; retime(P); over -= cut; }
  if (over > 0) {
    const f = (BUDGET - P.d) / P.end;
    for (const L of P.legs) L.dur *= f;
    retime(P);
  }
}

// The doorway takes one man at a time, GAP apart: of two men who would get there together the later one runs a little
// slower (down to a jog), and only past that sets off later
function stagger(plans) {
  const order = plans.filter(Boolean).sort((a, b) => (a.d + a.arrive) - (b.d + b.arrive));
  let last = -Infinity;
  for (const P of order) {
    let extra = last + GAP - (P.d + P.arrive);
    if (extra > 0) {
      const run = P.legs.find((L) => L.type === 'run');
      const slow = run ? Math.min(extra, Math.max(0, run.len / JOG + RAMP - run.dur), BUDGET - P.d - P.end) : 0;
      if (slow > 0) { run.dur += slow; extra -= slow; retime(P); }
      if (extra > 0) P.d = Math.max(P.d, Math.min(BUDGET - P.end, P.d + extra));
    }
    last = P.d + P.arrive;
  }
}
// the legs' starts, the arrival at the doorway and the end after a leg's length changed
function retime(P) {
  let t = 0;
  for (const L of P.legs) { L.t0 = t; t += L.dur; if (L.type === 'run') P.arrive = t; }
  P.end = t;
}

const frac = (x) => x - Math.floor(x);
function polyLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return l;
}

// The deck's edge that a man on floor y reaches from (sx, sz) nearest the point (tx, tz) (a flood over the deck, 0.2 m
// steps), and the ground just off it below, a step further toward the shelter at (gx, gz): { x, z, cx, cz }, or null
const STEPS = [0.2, 0, -0.2, 0, 0, 0.2, 0, -0.2];
function deckEdge(crew, sx, sz, sy, tx, tz, gx, gz) {
  const F = crew.field;
  if (!F?.deckAt) return null;
  const l = F.level(sy), step = 0.2, R = 40, N = Math.ceil((2 * R) / step), seen = new Uint8Array(N * N), q = [];
  const ix = (x) => Math.round((x - sx) / step) + (N >> 1), jz = (z) => Math.round((z - sz) / step) + (N >> 1);
  const ok = (x, z) => F.deckAt(l, x, z, true) && F.dAt('work', l, x, z, true) >= 0.15;
  // (he may stand just off the deck's mask at his post: start from the nearest deck cell)
  let x0 = sx, z0 = sz;
  if (!ok(x0, z0)) {
    let found = false;
    for (let r = step; r < 1.2 && !found; r += step) for (let a = 0; a < 16 && !found; a++) {
      const x = sx + Math.cos(a * Math.PI / 8) * r, z = sz + Math.sin(a * Math.PI / 8) * r;
      if (ok(x, z)) { x0 = x; z0 = z; found = true; }
    }
    if (!found) return null;
  }
  q.push(x0, z0);
  seen[jz(z0) * N + ix(x0)] = 1;
  let bx = x0, bz = z0, bd = Infinity;
  for (let h = 0; h < q.length && h < 60000; h += 2) {
    const x = q[h], z = q[h + 1], d = Math.hypot(x - tx, z - tz);
    if (d < bd) { bd = d; bx = x; bz = z; }
    for (let k = 0; k < 8; k += 2) {
      const nx = x + STEPS[k], nz = z + STEPS[k + 1], i = ix(nx), j = jz(nz);
      if (i < 0 || j < 0 || i >= N || j >= N || seen[j * N + i]) continue;
      seen[j * N + i] = 1;
      if (ok(nx, nz)) q.push(nx, nz);
    }
  }
  // down its side: off the deck on the way he was going (toward the point, else the shelter), to ground clear of the steel
  let ux = tx - bx, uz = tz - bz;
  if (ux * ux + uz * uz < 0.01) { ux = gx - bx; uz = gz - bz; }
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  const l0 = F.level(0);
  for (let t = 0.3; t <= 3; t += 0.1) {
    const cx = bx + ux * t, cz = bz + uz * t;
    if (!F.deckAt(l, cx, cz, true) && F.dAt('work', l0, cx, cz, true) >= 0.3) return { x: bx, z: bz, cx, cz };
  }
  return { x: bx, z: bz, cx: bx + ux * 0.6, cz: bz + uz * 0.6 };
}

function routeDeck(crew, sx, sz, sy, ex, ez) {
  const F = crew.field, poly = crew.cvPoly ??= { n: 0, x: new Float32Array(64), z: new Float32Array(64), len: 0, c: new Float32Array(64) };
  F.blk.length = 0;
  F.route('work', F.level(sy), sx, sz, ex, ez, 0.2, poly, true);
  const pts = [];
  for (let i = 0; i < poly.n; i++) pts.push({ x: poly.x[i], z: poly.z[i] });
  if (!pts.length) pts.push({ x: sx, z: sz }, { x: ex, z: ez });
  return pts;
}

// A way on the ground from (ax, az) to (bx, bz) round the position's walls (the shelter's grid, in the rig root frame
// at the battle's start) and the gun's steel (the crew's field at its traverse now), CLEAR off them, string pulled: an A*
// over 0.25 m cells in a window round the two ends. With none, a way round the steel alone; with none at all, the
// straight line.
const AS = { w: 0, h: 0, g: null, f: null, from: null, st: null, heap: null, stamp: 0, open: null };
function routeGround(crew, grid, ax, az, bx, bz) {
  return search(crew, grid, ax, az, bx, bz) ?? (grid ? search(crew, null, ax, az, bx, bz) : null) ?? [{ x: ax, z: az }, { x: bx, z: bz }];
}
function search(crew, grid, ax, az, bx, bz) {
  const F = crew.field, l0 = F ? F.level(0) : 0;
  const nearEnd = (x, z) => Math.hypot(x - ax, z - az) < ENDS || Math.hypot(x - bx, z - bz) < ENDS;
  const free = (x, z) => {
    if (nearEnd(x, z)) return true;
    if (grid && grid.solid) {
      const i = Math.floor((x - grid.x0) / grid.cell), j = Math.floor((z - grid.z0) / grid.cell);
      if (i >= 0 && j >= 0 && i < grid.w && j < grid.h && grid.solid[j * grid.w + i]) return false;
    }
    return !F || F.dAt('work', l0, x, z, true) >= CLEAR;
  };
  const line = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 0.1));
    for (let k = 0; k <= n; k++) if (!free(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n)) return false;
    return true;
  };
  if (line(ax, az, bx, bz)) return [{ x: ax, z: az }, { x: bx, z: bz }];
  const pad = 8, X0 = Math.min(ax, bx) - pad, Z0 = Math.min(az, bz) - pad;
  const w = Math.ceil((Math.max(ax, bx) + pad - X0) / CELL), h = Math.ceil((Math.max(az, bz) + pad - Z0) / CELL), n = w * h;
  if (n > 400000) return null;
  if (!AS.g || AS.g.length < n) {
    const m = Math.max(n, 65536);
    AS.g = new Float32Array(m); AS.f = new Float32Array(m); AS.from = new Int32Array(m); AS.st = new Uint32Array(m); AS.open = new Uint32Array(m); AS.heap = new Int32Array(m + 8); AS.ok = new Uint32Array(m); AS.okv = new Uint8Array(m);
  }
  const G = AS.g, Fh = AS.f, P = AS.from, S = AS.st, C = AS.open, H = AS.heap, OK = AS.ok, OV = AS.okv, st = ++AS.stamp;
  const cx = (k) => X0 + ((k % w) + 0.5) * CELL, cz = (k) => Z0 + (((k / w) | 0) + 0.5) * CELL;
  const ci = (x, z) => Math.min(h - 1, Math.max(0, Math.floor((z - Z0) / CELL))) * w + Math.min(w - 1, Math.max(0, Math.floor((x - X0) / CELL)));
  const ok = (k) => { if (OK[k] === st) return OV[k] === 1; OK[k] = st; const v = free(cx(k), cz(k)); OV[k] = v ? 1 : 0; return v; };
  const s = ci(ax, az), e = ci(bx, bz), ex = e % w, ez = (e / w) | 0;
  const hf = (k) => { const dx = Math.abs((k % w) - ex), dz = Math.abs(((k / w) | 0) - ez); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * CELL; };
  let hn = 0;
  const up = (i) => { while (i > 0) { const q = (i - 1) >> 1; if (Fh[H[q]] <= Fh[H[i]]) break; const t = H[q]; H[q] = H[i]; H[i] = t; i = q; } };
  const down = (i) => { for (;;) { let m = i; const l1 = 2 * i + 1, r1 = l1 + 1; if (l1 < hn && Fh[H[l1]] < Fh[H[m]]) m = l1; if (r1 < hn && Fh[H[r1]] < Fh[H[m]]) m = r1; if (m === i) break; const t = H[m]; H[m] = H[i]; H[i] = t; i = m; } };
  G[s] = 0; Fh[s] = hf(s); S[s] = st; C[s] = 0; P[s] = -1; H[hn++] = s;
  let found = false, guard = 0;
  while (hn && guard++ < 200000) {
    const k = H[0]; H[0] = H[--hn]; down(0);
    if (C[k] === st) continue;
    C[k] = st;
    if (k === e) { found = true; break; }
    const ki = k % w, kj = (k / w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ki + di, nj = kj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (nk !== e && !ok(nk)) continue;
      if (di && dj && (!ok(kj * w + ni) || !ok(nj * w + ki))) continue;
      const ng = G[k] + (di && dj ? 1.414 : 1) * CELL;
      if (S[nk] === st && ng >= G[nk]) continue;
      S[nk] = st; G[nk] = ng; Fh[nk] = ng + hf(nk); P[nk] = k;
      if (C[nk] === st) C[nk] = 0;
      if (hn < H.length - 1) { H[hn] = nk; up(hn++); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = e; k >= 0; k = P[k]) { cells.push(k); if (k === s) break; }
  cells.reverse();
  const pts = cells.map((k) => ({ x: cx(k), z: cz(k) }));
  pts[0] = { x: ax, z: az }; pts[pts.length - 1] = { x: bx, z: bz };
  // pulled tight: from each corner, the furthest point it sees
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !line(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------- the men

// The man after his drill this frame: on his way, at the shelter or gone into it. False while he has not set off yet
// (the drill has him), or is back at his post.
function coverMan(crew, m, P, F) {
  const s = F.tau - P.d;
  if (s <= 0) return false;
  const S = m.sp;
  if (S) { S.askAt[0] = S.askAt[1] = NaN; S.fixedAt = NaN; }
  m.noEars = true;
  if (s >= P.end - 1e-6) {
    const last = P.legs[P.legs.length - 1];
    if (last.type === 'crouch') { m.put(last.x, 0, last.z, last.h, 'crouch', crew.idleT + m.seed); return true; }
    m.root.visible = false;
    return true;
  }
  let L = P.legs[0];
  for (let q = 1; q < P.legs.length; q++) if (s >= P.legs[q].t0) L = P.legs[q];
  const k = Math.min(1, Math.max(0, (s - L.t0) / Math.max(1e-3, L.dur))), back = !F.going;
  switch (L.type) {
    case 'walk': case 'run': {
      const e = trap(k, Math.min(0.45, RAMP / L.dur)), first = L === P.legs[0], last = L.type === 'run';
      along(L.pts, L.pts.length, e, _P);
      // his heading: from his drill's at the start, along the way, into the doorway at its end; coming back the
      // other way round, into his drill's at his post
      // (dS never 0: a way of no length gave 0 / 0, and one man's NaN goes to every man through the spacing)
      const hf = _P.h, dS = Math.max(0.02, Math.min(0.7, _P.len / 2));
      const wS = first ? smooth(_P.d, 0, dS) : 1, wE = last ? smooth(_P.d, _P.len - dS, _P.len) : 0;
      const endH = F.spec.kind === 'trench' ? hf : F.inH;
      let h = back ? hf + Math.PI : hf;
      if (wE > 0) h = turn(h, back ? endH + Math.PI : endH, wE);
      h = turn(P.sh, h, wS);
      const moving = e > 0 && e < 1;
      if (!Number.isFinite(_P.x + _P.z + h)) return false;
      way(crew, m, L.pts[0].x, L.pts[0].z, L.pts[L.pts.length - 1].x, L.pts[L.pts.length - 1].z);
      m.put(_P.x, L.y, _P.z, h, moving ? 'walk' : 'stand', crew.idleT + m.seed);
      break;
    }
    case 'hop': {
      // a step off a low platform: out and down, landing on bent knees
      const x = L.ax + (L.bx - L.ax) * smooth(k, 0, 1), z = L.az + (L.bz - L.az) * smooth(k, 0, 1), y = L.y * (1 - k * k);
      const h = headingOf(L.bx - L.ax, L.bz - L.az);
      m.put(x, Math.max(0, y), z, back ? h + Math.PI : h, k > 0.6 ? 'crouch' : 'stand', crew.idleT + m.seed);
      break;
    }
    case 'climb': {
      // down the platform's side facing it, stepping off it at the top and onto the ground at the foot
      const out = smooth(k, 0, 0.12) * 0.5 + smooth(k, 0.88, 1) * 0.5, y = L.y * (1 - smooth(k, 0.05, 0.95));
      const x = L.ax + (L.bx - L.ax) * out, z = L.az + (L.bz - L.az) * out;
      m.put(x, y, z, headingOf(L.ax - L.bx, L.az - L.bz), 'climb', y / 0.6); // (the climb's cycle run backwards: down)
      break;
    }
    case 'duck': {
      // bent double through the doorway and down its first steps, out of sight behind the curtain's dark
      const e = smooth(k, 0, 1), A = F.app, I = F.ins;
      const x = A.x + (I.x - A.x) * e, z = A.z + (I.z - A.z) * e, y = -0.25 * smooth(k, 0.5, 1);
      m.put(x, y, z, back ? F.inH + Math.PI : F.inH, 'stoopWalk', (APPROACH + INSIDE) * e / 0.6);
      break;
    }
    case 'crouch':
      // (turning to face his gun as he gets down: the spacing turns him at a man's pace)
      m.put(L.x, 0, L.z, L.h, k < 0.5 ? 'stand' : 'crouch', crew.idleT + m.seed);
      break;
  }
  return true;
}

// What the men put down when they ran: a shell or a cartridge they had in their arms lies on the ground where they
// were (it settles there over a moment as they let go, and comes up into their arms as they take it again), the
// rammer's staff lies beside his post, the lanyard is not held. The gun's own (on its tray, in a hoist, on a cart) stays.
const HELD = { carry: 'shellA', pair0: 'shellA', pair1: 'shellA', bag: 'bag' };
export function coverProps(crew, F) {
  const plans = F.plans;
  if (!plans) return;
  for (let i = 0; i < crew.men.length; i++) {
    const m = crew.men[i], P = plans[i];
    if (!P) continue;
    const s = F.tau - P.d;
    if (s <= 0) continue;
    const w = smooth(s, 0, 0.3);
    const key = HELD[m.beh];
    const o = key ? crew[key] : null;
    if (o?.visible && Math.hypot(o.position.x - P.sx, o.position.z - P.sz) < 1.3 && o.position.y - P.sy > 0.25) {
      const r = key === 'bag' ? 0.12 : crew.srad;
      o.position.y += (P.sy + r - o.position.y) * w;
      o.rotation.x *= 1 - w;
    }
    if (m.beh === 'lan' && crew.rope.visible) crew.rope.visible = false;
    if (crew.staffOwner === m && crew.staff.visible && !(crew.staffE > 0.5)) {
      // stood on its butt before him: laid on the ground beside his post
      const st = crew.staff, L = crew.staffLen;
      st.rotation.x = Math.PI / 2 * (1 - w);
      st.position.y = P.sy + 0.04 + (L - 0.04) * (1 - w);
      st.updateMatrix();
    }
  }
}

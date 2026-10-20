import * as THREE from 'three';
import { buildCrewman, crewForRoleDE, CREW_GAITS } from '../models/v/crew.js';
import { STEP } from '../sim/tables.js';
import { QUICK } from '../ww2/special.js';
import { A4_VANES } from '../models/v/de/missiles.js';
import { ramp, smooth, lerp, wrapPi, clamp01, headingOf, facing } from './anim.js';

// The V-weapon launch sites at work: the V-1's Walter ramp and the A4's firing table posed through their drills
// (the trolley, the wings, the generator, the hoses; the Meillerwagen, the table, the platforms, the frost), the
// crew that works every step, and the framing a camera should give each step. Everything here is a pure function
// of the controller's state (unit.special: the step in hand, its state, st.t against the step's dur, the cover,
// the fault, the launch time) and the sim's clock, so time compression and fastForward land on the same picture.
// The controller (src/ww2/special.js) owns the drill's rules; nothing here writes to it.
//   poseVSite(rig, unit, sim)        the machinery, every frame (src/ww2/render.js)
//   new VCrew(rig, kind)             the crew, driven like render/crews.js GunCrew: setLevel(n), update(piece, sim, dt, level)
//   vFraming(rig, unit, sim, out)    the step's framing in the site's frame: { x, y, z, yaw, pitch, dist, key }
//   drillClock(unit, sim, out)       where the drill stands (the step, its progress k 0..1, the time since the launch)
// The sites' places come from the rigs (rig.layout: V1_LAYOUT, V2_LAYOUT in models/v/de/v1.js, v2.js).

export const VKINDS = new Set(['v1', 'v2']);
const PI = Math.PI, HALF = PI / 2;
const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride, RISE = CREW_GAITS.climb.rise;
// the steps a set-up (quick) site's crew does not do: the round comes to the ramp prepared (the drill's own list)
const QUICK_PREP = { v1: QUICK.v1.prep, v2: QUICK.v2.prep };
// ease only the first and last metre of a walk or a push
const travel = (k) => {
  k = clamp01(k);
  const e = 0.14, v = 1 / (1 - e);
  return k < e ? v * k * k / (2 * e) : k > 1 - e ? 1 - v * (1 - k) ** 2 / (2 * e) : v * (k - e / 2);
};
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
const angLerp = (a, b, k) => a + wrapPi(b - a) * k;

// ---------------------------------------------------------------- the drill's clock
// The step in hand and how far it has got. working: the crew is on it (st.doing on this step, not a repair or a
// top-up, which also set st.doing); fault: it stopped on a fault; a step that is re-run after its fault was fixed
// holds its finished pose (the rig remembers the step's furthest progress, see rerun()).
export function drillClock(u, sim, c = {}) {
  const st = u.special, alpha = sim.alpha ?? 0;
  c.st = st;
  c.now = sim.time + alpha * STEP;
  c.kind = st.kind;
  c.quick = !!st.quick;
  const s = st.steps?.[st.i] ?? null;
  c.i = st.i;
  c.id = s?.id ?? null;
  c.dur = Math.max(0.01, s?.dur ?? 1);
  c.working = !!s && s.state === 'doing' && !!st.doing && st.repair == null && st.topup == null;
  c.fault = !!st.fault && !!s && s.state === 'doing';
  c.fixing = c.working && st.t < 0;
  c.cover = !!st.cover;
  const run = c.working && !c.cover && !c.fixing;
  c.t = c.working ? Math.max(0, st.t) + (run ? alpha * STEP : 0) : 0;
  c.k = c.fault || c.fixing ? 1 : c.working ? clamp01(c.t / c.dur) : 0;
  c.active = c.working || c.fault;
  c.since = st.launchT >= 0 ? c.now - st.launchT : 1e9;
  c.prep = c.quick ? QUICK_PREP[c.kind] ?? null : null;
  return c;
}
const stepIndex = (c, id) => { const S = c.st.steps; for (let j = 0; j < S.length; j++) if (S[j].id === id) return j; return -1; };
const isDone = (c, id) => { const S = c.st.steps; for (let j = 0; j < S.length; j++) if (S[j].id === id) return S[j].state === 'done'; return false; };
// a step that faulted, was fixed and runs again keeps its finished pose (the machinery does not run back)
function rerun(holder, c) {
  const key = `${c.st.n ?? 0}:${c.i}:${c.id}`;
  const m = holder._vrun ??= { key: '', max: 0, re: false };
  if (m.key !== key) { m.key = key; m.max = 0; m.re = false; }
  if (!c.active) return;
  if (c.k < m.max - 0.4) m.re = true;
  m.max = Math.max(m.max, c.k);
  if (m.re) c.k = 1;
}

// ---------------------------------------------------------------- V-1: the machinery
// The loading trolley's way from the turntable to the ramp's foot (BEND in V1_LAYOUT): a polyline with lengths.
function bendPath(L) {
  if (L._bend) return L._bend;
  const B = L.BEND, pts = [[L.TURN.x, L.TURN.z], [L.TURN.x, B.z0]];
  for (let i = 1; i <= 10; i++) { const a = -i / 10 * HALF; pts.push([B.x1 + B.r1 * Math.cos(a), B.z0 + B.r1 * Math.sin(a)]); }
  for (let i = 0; i <= 14; i++) { const a = HALF + i / 14 * HALF; pts.push([B.x2 + B.r2 * Math.cos(a), B.foot + B.r2 * Math.sin(a)]); }
  const x = pts.map((p) => p[0]), z = pts.map((p) => p[1]), s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]));
  const sTurn = B.z0 > L.TURN.z ? 0 : L.TURN.z - B.z0; // (24, 13.6): where the bend leaves the line through the door
  const sArc = s[12]; // (6, 10.6): the start of the bend between the walls
  return (L._bend = { x, z, s, len: s[s.length - 1], sTurn, sArc });
}
function pathAt(P, d, out) {
  d = Math.min(P.len, Math.max(0, d));
  let i = 1;
  while (i < P.s.length - 1 && P.s[i] < d) i++;
  const f = (d - P.s[i - 1]) / Math.max(1e-6, P.s[i] - P.s[i - 1]);
  out.x = lerp(P.x[i - 1], P.x[i], f);
  out.z = lerp(P.z[i - 1], P.z[i], f);
  return out;
}
const _pa = { x: 0, z: 0 }, _pb = { x: 0, z: 0 };
function pathPose(P, d, out) {
  pathAt(P, d, out);
  pathAt(P, Math.max(0, d - 0.7), _pa);
  pathAt(P, Math.min(P.len, d + 0.7), _pb);
  out.h = headingOf(_pb.x - _pa.x, _pb.z - _pa.z); // nose first along the path
  return out;
}

// the steps that move the trolley; the one after which the empty trolley goes home
const TROLLEY_STEPS = new Set(['bring', 'wings', 'compass', 'airlog', 'ramp', 'fuel', 'steam']);
const retStep = (c) => (c.quick ? 'steam' : 'fuel');
// The trolley in step `id` at progress k: { x, z, h, y, lift, slide, empty, d (metres pushed so far) }
function trolleyPose(L, c, id, k, o) {
  o.lift = 0; o.slide = 0; o.empty = false; o.h = 0; o.d = 0; o.moving = false; o.rev = false;
  const A = L.TROLLEY, S = L.STORE, T = L.TURN;
  const P = bendPath(L);
  if (id === 'bring') {
    const f = travel(ramp(k, 0.15, 0.9));
    o.x = A.x; o.z = lerp(S.z, A.z, f); o.d = f * (A.z - S.z); o.moving = k > 0.15 && k < 0.9; o.rev = true;
  } else if (id === 'wings') {
    o.x = A.x; o.z = A.z;
  } else if (id === 'compass') {
    const f = travel(ramp(k, 0.1, 0.34)), u = ramp(k, 0.38, 0.88);
    o.x = A.x; o.z = lerp(A.z, T.z, f); o.d = f * (T.z - A.z); o.moving = k > 0.1 && k < 0.34; o.rev = true;
    // swung on the turntable through a few headings while the compass is read, then laid on the line
    o.h = 0.24 * Math.sin(2 * PI * u) * (1 - u * 0.6) * (u < 1 ? 1 : 0);
  } else if (id === 'airlog') {
    o.x = T.x; o.z = T.z;
  } else if (id === 'ramp') {
    const f = travel(ramp(k, 0.05, 0.45));
    if (c.quick) {
      // a prepared round comes from the apron: back to the bend's start first, then the bend
      const f1 = ramp(f, 0, 0.12), f2 = ramp(f, 0.12, 1);
      if (f1 < 1) { o.x = A.x; o.z = lerp(A.z, L.BEND.z0, f1); o.d = f1 * (L.BEND.z0 - A.z); o.rev = true; } else { pathPose(P, lerp(P.sTurn, P.len, f2), o); o.d = (L.BEND.z0 - A.z) + f2 * (P.len - P.sTurn); }
    } else { pathPose(P, f * P.len, o); o.d = f * P.len; }
    o.moving = k > 0.05 && k < 0.45;
    o.lift = ramp(k, 0.45, 0.52) * (1 - ramp(k, 0.74, 0.78));
    o.slide = smooth(k, 0.52, 0.74);
    o.empty = k >= 0.74;
    if (k > 0.78) { // pulled back clear along the bend, tail first
      const g = travel(ramp(k, 0.78, 1));
      pathPose(P, lerp(P.len, P.sArc, g), o);
      o.d = g * (P.len - P.sArc); o.moving = k < 1; o.rev = true;
    }
  } else if (id === retStep(c)) {
    // the empty trolley goes home: back along the bend to the door's line (tail first), then down it to the store
    const f1 = travel(ramp(k, 0.06, 0.5)), f2 = travel(ramp(k, 0.5, 0.92));
    o.empty = true;
    if (f2 <= 0) { pathPose(P, lerp(P.sArc, P.sTurn, f1), o); o.d = f1 * (P.sArc - P.sTurn); o.rev = true; } else { o.x = A.x; o.z = lerp(L.BEND.z0, S.z, f2); o.h = 0; o.d = (P.sArc - P.sTurn) + f2 * (L.BEND.z0 - S.z); }
    o.moving = k > 0.06 && k < 0.92;
  } else {
    // resting: where the last step that moved it left it (none this round: in the store with the next missile)
    const S2 = c.st.steps;
    let j = stepIndex(c, id) - 1;
    for (; j >= 0; j--) if (TROLLEY_STEPS.has(S2[j].id) && !c.prep?.has(S2[j].id)) break;
    if (j >= 0) return trolleyPose(L, c, S2[j].id, 1, o);
    o.x = S.x; o.z = S.z;
  }
  // the floor under it: the Richthaus slab is 5 cm higher than the paths
  const inRH = Math.abs(o.x - L.RH.x) < L.RH.w / 2 && Math.abs(o.z - L.RH.z) < L.RH.l / 2 + 0.6;
  o.y = inRH ? 0.15 + 0.05 * clamp01((L.RH.l / 2 + 0.6 - Math.abs(o.z - L.RH.z)) / 0.6) : 0.15;
  return o;
}
// the wings: the first panel over 0.12..0.55 of the step, the second over 0.55..0.98 (rig.setWings maps 0..0.5, 0.5..1)
const wingsK = (k) => 0.5 * ramp(k, 0.12, 0.55) + 0.5 * ramp(k, 0.55, 0.98);

const _tp = { x: 0, z: 0, h: 0, y: 0, lift: 0, slide: 0, empty: false, d: 0, moving: false, rev: false };
function poseV1(rig, c) {
  const L = rig.layout, id = c.id, k = c.k, act = c.active;
  // the step the machinery shows: the one in hand, or (waiting for the key) where the last one left it
  const cur = act ? id : null;
  trolleyPose(L, c, cur ?? id ?? 'bring', cur ? k : 0, _tp);
  rig.setTrolley(_tp.x, _tp.z, _tp.h, _tp.y);
  rig.setLift(_tp.lift);
  rig.setSlide(_tp.slide);
  const mounted = isDone(c, 'ramp') || (cur === 'ramp' && _tp.slide >= 1);
  // the catapult's run (the controller has already begun the next round): the missile still on its sled
  const running = c.since < L.RUN + 0.05;
  rig.setMissile(mounted || running ? 'ramp' : _tp.empty ? 'none' : 'trolley');
  rig.setWings(running || isDone(c, 'wings') ? 1 : cur === 'wings' ? wingsK(k) : 0);
  // the generator: rolled up and coupled at the start of its step; after a shot rolled back by its two men
  let gen = isDone(c, 'steam') ? 1 : cur === 'steam' ? ramp(k, 0.08, 0.33) : 0;
  if (c.since < 28 && !(cur === 'steam')) gen = Math.max(gen, 1 - ramp(c.since, 12, 28));
  rig.setGenerator(gen);
  const engine = cur === 'fire';
  rig.setHoses({
    fuel: cur === 'fuel' && k > 0.12 && k < 0.55,
    air: (cur === 'fuel' && k > 0.55 && k < 0.95) || (cur === 'clear' && k > 0.1) || engine,
    charge: cur === 'steam' && k > 0.47 && k < 0.95,
  });
  rig.setSled(c.since < 4.5 || c.since > 30 || cur === 'ramp' || isDone(c, 'ramp'));
  rig.launch(c.since < 4.5 ? c.since : null);
  c.engine = engine ? k : running ? 1 : -1;
}

// ---------------------------------------------------------------- V-2: the machinery
function v2State(c, id, k, o) {
  // m: the Meillerwagen (0 at the table, 1 withdrawn 30 m), e: the rocket erected, cl: the collars open
  o.m = 1; o.e = 0; o.cl = 1;
  if (id === 'erect') { o.m = 1 - smooth(k, 0.04, 0.32); o.e = ramp(k, 0.42, 0.9); o.cl = ramp(k, 0.92, 0.99); return o; }
  if (id === 'withdraw') { o.m = ramp(k, 0.32, 1); o.e = 1; return o; }
  const iw = stepIndex(c, 'withdraw'), ie = stepIndex(c, 'erect'), i = stepIndex(c, id);
  if (i > iw) { o.m = 1; o.e = 1; } else if (i > ie) { o.m = 0; o.e = 1; }
  return o;
}
// The rudder test of the electrical checks (k the step's progress, so time compression lands on the same pose):
// the gyros run up first, then three rounds of pitch one way and the other, yaw, roll, each throw held a moment and
// a pause after each round; at the jet vanes' full throw (the air vanes follow at two thirds). -> [pitch, yaw, roll]
const VANE_MAX = A4_VANES.jet.max;
const VANE_TEST = [[1, 0, 0], [-1, 0, 0], [0, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 0], [0, 0, 1], [0, 0, -1], [0, 0, 0]];
const _vt = [0, 0, 0];
function vaneTest(k, out) {
  out[0] = out[1] = out[2] = 0;
  const f = ramp(k, 0.16, 0.94) * 3; // the three rounds
  if (f <= 0 || f >= 3) return out;
  const n = VANE_TEST.length, x = (f % 1) * n, j = Math.floor(x), m = smooth(x - j, 0, 0.35); // move, then hold
  const a = VANE_TEST[(j + n - 1) % n], b = VANE_TEST[j];
  for (let i = 0; i < 3; i++) out[i] = lerp(a[i], b[i], m) * VANE_MAX;
  return out;
}
// small corrections under the flame (the gyros live, the jet buffeting the vanes): a pure function of the clock
function vaneTwitch(t, amp, out) {
  const A = amp * (2 * PI) / 180;
  out[0] = A * (0.6 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 12.9 + 1.3));
  out[1] = A * (0.6 * Math.sin(t * 8.1 + 2.0) + 0.4 * Math.sin(t * 14.7 + 0.4));
  out[2] = A * 0.5 * Math.sin(t * 10.3 + 4.1);
  return out;
}
const _v2 = { m: 1, e: 0, cl: 1 };
function poseV2(rig, c, u) {
  const st = c.st, id = c.id, k = c.k, cur = c.active ? id : null;
  v2State(c, cur ?? id ?? 'erect', cur ? k : 0, _v2);
  if (!cur && id === 'erect') { _v2.m = 1; _v2.e = 0; }
  // after a lift-off the next rocket comes up on the Meillerwagen (once the smoke has cleared)
  const launched = c.since < 1e8;
  rig.setRocket(st.left > 0 && (!launched || c.since > 15 || isDone(c, 'erect') || cur === 'erect'));
  rig.setErect(_v2.e);
  rig.setMeiller(_v2.m);
  rig.setClamps(_v2.cl);
  // the table: turned onto the line in its step (the controller's from and to), held there after
  let tb = st.table ?? 0;
  if (cur === 'align') {
    const from = st.tableFrom ?? 0, want = st.settings?.compass;
    const to = want != null ? angDiff(want, (u.zero * 180) / PI) * PI / 180 : tb;
    tb = from + (to - from) * smooth(k, 0.15, 0.85);
  }
  rig.setTable(tb);
  const lox = cur === 'lox' ? smooth(k, 0.18, 0.95) : st.loxOn ? (st.lox ?? 100) / 100 : 0;
  const wk = cur === 'withdraw' ? k : 0;
  rig.setFuel({ alcohol: isDone(c, 'alcohol') ? 1 : cur === 'alcohol' ? k : 0, lox });
  rig.setHoses({
    alcohol: cur === 'alcohol' && k > 0.1 && k < 0.95,
    tstoff: cur === 'tstoff' && k > 0.12 && k < 0.92,
    lox: (cur === 'lox' && k > 0.12) || (isDone(c, 'lox') && !isDone(c, 'withdraw') && wk < 0.14) || (st.topup != null && !isDone(c, 'withdraw')),
  });
  c.flame = cur === 'prestage' ? 0.5 * k : cur === 'fire' ? 0.5 + 0.5 * k : -1;
  // the rudders: swung through their test in the electrical checks, live and twitching in the flame of the Vorstufe
  // and the Hauptstufe, neutral otherwise
  if (rig.setVanes) {
    if (cur === 'checks') vaneTest(k, _vt);
    else if (cur === 'prestage' || cur === 'fire') vaneTwitch(c.now, cur === 'fire' ? 1 : 0.4 + 0.6 * k, _vt);
    else _vt[0] = _vt[1] = _vt[2] = 0;
    rig.setVanes(_vt[0], _vt[1], _vt[2]);
  }
  c.lox = lox;
  c.vent = (cur === 'lox' && k > 0.3) || st.loxOn ? 1 : 0;
}

/** The machinery of a V-weapon site, from the controller's state (call every frame; cheap, idempotent). */
const _c0 = {};
export function poseVSite(rig, u, sim, c = _c0) {
  if (!rig?.layout || !u?.special?.steps) return null;
  drillClock(u, sim, c);
  rerun(rig, c);
  if (c.kind === 'v1') poseV1(rig, c);
  else if (c.kind === 'v2') poseV2(rig, c, u);
  return c;
}

// ---------------------------------------------------------------- the crew
// A man's doing in a step: where he stands (x, y, z in the rig's root space), his heading, his pose and its
// phase, and up to two hand targets. Scripts fill one of these; the crew walks him between them.
function newDo() { return { x: 0, y: 0, z: 0, h: 0, pose: 'stand', t: 0, hl: null, hr: null, wl: 0, wr: 0, own: false, _hl: [0, 0, 0], _hr: [0, 0, 0] }; }
const put = (D, x, z, h, pose = 'stand', y = 0, t = 0) => { D.x = x; D.z = z; D.y = y; D.h = h; D.pose = pose; D.t = t; D.hl = D.hr = null; D.own = false; return D; };
const look = (D, x, z, tx, tz, pose = 'stand', y = 0, t = 0) => put(D, x, z, facing(x, z, tx, tz), pose, y, t);
const hands = (D, l, r, w = 1) => {
  if (l) { D._hl[0] = l[0]; D._hl[1] = l[1]; D._hl[2] = l[2]; D.hl = D._hl; D.wl = w; }
  if (r) { D._hr[0] = r[0]; D._hr[1] = r[1]; D._hr[2] = r[2]; D.hr = D._hr; D.wr = w; }
  return D;
};
// a point beside a body at (x, z) heading h: `along` metres ahead (its -Z), `side` to its right (+X)
const off = (x, z, h, along, side, out = _off) => { const s = Math.sin(h), co = Math.cos(h); out[0] = x - s * along + co * side; out[1] = z - co * along - s * side; return out; };
const _off = [0, 0], _off2 = [0, 0];
// a walk from (ax, az) to (bx, bz) a fraction f of the way, turning from the first heading into the walk and into
// the last at the end; the height changes over the first steps going down, the last going up
function walkTo(D, ax, az, ah, bx, bz, bh, f, y0 = 0, y1 = y0) {
  const d = Math.hypot(bx - ax, bz - az), k = travel(f);
  const wh = d > 0.05 ? headingOf(bx - ax, bz - az) : bh;
  let h = angLerp(ah, wh, smooth(f, 0, 0.12));
  h = angLerp(h, bh, smooth(f, 0.88, 1));
  const moving = f > 0 && f < 1 && d > 0.05;
  const y = y1 < y0 ? lerp(y0, y1, smooth(f, 0, 0.12)) : lerp(y0, y1, smooth(f, 0.88, 1));
  put(D, lerp(ax, bx, k), lerp(az, bz, k), h, moving ? 'walk' : 'stand', y, (d * k) / STRIDE);
  D.own = true;
  return D;
}
// the same along waypoints [[x, z], ...] (round the bunker's walls to its door)
function walkVia(D, A, pts, bh, f, y1 = 0) {
  let len = 0, px = A.x, pz = A.z;
  for (const p of pts) { len += Math.hypot(p[0] - px, p[1] - pz); px = p[0]; pz = p[1]; }
  let d = travel(f) * len;
  px = A.x; pz = A.z;
  let ph = A.h;
  for (let j = 0; j < pts.length; j++) {
    const p = pts[j], l = Math.hypot(p[0] - px, p[1] - pz);
    if (d <= l || j === pts.length - 1) {
      const g = l > 1e-3 ? Math.min(1, d / l) : 1;
      const wh = l > 0.05 ? headingOf(p[0] - px, p[1] - pz) : ph;
      const moving = f > 0 && f < 1;
      put(D, lerp(px, p[0], g), lerp(pz, p[1], g), j === 0 ? angLerp(A.h, wh, smooth(f, 0, 0.08)) : wh, moving ? 'walk' : 'stand',
        A.y > y1 ? lerp(A.y, y1, smooth(f, 0, 0.1)) : y1, (travel(f) * len) / STRIDE);
      if (f >= 1) D.h = bh;
      D.own = true;
      return D;
    }
    ph = l > 0.05 ? headingOf(p[0] - px, p[1] - pz) : ph;
    d -= l; px = p[0]; pz = p[1];
  }
  return D;
}

// ---- V-1 crew: ten men. The launch crew's NCO and the firer (caps), two trolley pushers, two fitters (the wings,
// the mallets in the Richthaus), the Richtmeister (compass, air log, fuzes), the fueller, the generator's two.
const V1_ROLES = ['officer', 'firer', 'p1', 'p2', 'w1', 'w2', 'rm', 'fuel', 'g1', 'g2'];
const V1_HOME = {
  officer: [-5.6, 8.2, 0.5], firer: [-18.45, 4.0, -HALF], p1: [22.4, -5.2, 0], p2: [25.6, -5.2, 0], w1: [19.9, 6.2, 0.6], w2: [28.2, 6.2, -0.6],
  rm: [20.8, 13.2, -HALF], fuel: [-2.0, -2.4, 2.2], g1: [-2.3, 14.4, 0.4], g2: [2.4, 16.6, -0.3],
};
// in cover for the shot: the firer at his switch in the bunker, the rest crouched in the slit trench behind the
// walls (out of the platform by its open rear end), the trolley's two in the trench by the store
const V1_TRENCH_AT = { officer: 0.6, rm: 1.9, w1: 3.2, fuel: 4.5, w2: 5.8, g1: 7.1, g2: 8.4 };
function v1Cover(L) {
  if (L._cover) return L._cover;
  const T = L.TRENCH, out = { firer: [-18.45, 4.0] };
  for (const [role, d0] of Object.entries(V1_TRENCH_AT)) {
    let d = d0;
    for (let j = 0; j < T.length - 1; j++) {
      const l = Math.hypot(T[j + 1][0] - T[j][0], T[j + 1][1] - T[j][1]);
      if (d <= l || j === T.length - 2) { const f = Math.min(1, d / l); out[role] = [lerp(T[j][0], T[j + 1][0], f), lerp(T[j][1], T[j + 1][1], f)]; break; }
      d -= l;
    }
  }
  const T2 = L.TRENCH2;
  out.p1 = [lerp(T2[0][0], T2[1][0], 0.3), lerp(T2[0][1], T2[1][1], 0.3)];
  out.p2 = [lerp(T2[0][0], T2[1][0], 0.7), lerp(T2[0][1], T2[1][1], 0.7)];
  return (L._cover = out);
}
// inside the walls a man leaves the platform by its open rear end
const inWalls = (x, z) => Math.abs(x) < 4.3 && z < 4.6 && z > -10.5;

function v1Place(L, c, role, id, k, D, A) {
  const tp = trolleyPose(L, c, id, k, _tp2);
  const TY = tp.y + 0.62 + 0.46 + L.LIFT_H * tp.lift; // the missile's axis over the trolley
  switch (id) {
    case 'bring': case 'compass': {
      // pushed tail first: the two pushers beside the nose section, the hands on the fuselage, leaning into it;
      // a fitter walks beside the tail; in the Richthaus the fitters knock the airframe with their mallets
      // while the trolley is swung and the Richtmeister reads the compass at the nose
      const swing = id === 'compass' && k > 0.36;
      if (role === 'p1' || role === 'p2') {
        const sd = role === 'p1' ? -1 : 1;
        if (swing) {
          off(tp.x, tp.z, tp.h, sd < 0 ? 2.6 : -2.4, sd * 0.85);
          look(D, _off[0], _off[1], tp.x, tp.z, 'push', tp.y, c.now * 0.6);
          off(tp.x, tp.z, tp.h, sd < 0 ? 2.6 : -2.4, sd * 0.38, _off2);
          return hands(D, [_off2[0], TY + 0.05, _off2[1]], [_off2[0], TY + 0.15, _off2[1]], 0.9);
        }
        off(tp.x, tp.z, tp.h, 2.0, sd * 0.82);
        put(D, _off[0], _off[1], tp.h + PI, tp.moving ? 'walk' : 'stand', tp.y, tp.d / (STRIDE * 0.8));
        off(tp.x, tp.z, tp.h, 1.55, sd * 0.4, _off2);
        return hands(D, [_off2[0], TY + 0.12, _off2[1]], [_off2[0], TY - 0.04, _off2[1] + 0.25], 0.85);
      }
      if (role === 'w1') {
        if (swing) { off(tp.x, tp.z, tp.h, -0.6, 1.0); look(D, _off[0], _off[1], tp.x, tp.z, 'operate', tp.y, c.now * 2.2); return D; }
        off(tp.x, tp.z, tp.h, -3.2, -0.95);
        put(D, _off[0], _off[1], tp.h + PI, tp.moving ? 'walk' : 'stand', tp.y, tp.d / STRIDE + 0.5);
        off(tp.x, tp.z, tp.h, -3.0, -0.3, _off2);
        return hands(D, null, [_off2[0], TY + 0.15, _off2[1]], 0.7);
      }
      if (role === 'w2' && swing) { off(tp.x, tp.z, tp.h, 0.9, -1.0); return look(D, _off[0], _off[1], tp.x, tp.z, 'operate', tp.y, c.now * 2.2 + 0.4); }
      if (role === 'rm' && id === 'compass') {
        if (k < 0.3) return look(D, L.RH.x - 3.2, L.RH.z - L.RH.l / 2 - 1.2, tp.x, tp.z);
        off(tp.x, tp.z, tp.h, 4.7, 0.25);
        look(D, _off[0], _off[1], tp.x, tp.z, 'operate', tp.y, c.now * 0.4);
        off(tp.x, tp.z, tp.h, 4.05, 0.05, _off2);
        return hands(D, [_off2[0], TY + 0.12, _off2[1]], [_off2[0] + 0.1, TY + 0.2, _off2[1]], 0.9);
      }
      if (role === 'officer') {
        if (id === 'bring') return look(D, L.TROLLEY.x - 3.0, L.TROLLEY.z - 2.6, tp.x, tp.z, tp.moving ? 'signal' : 'stand', 0.15, c.now * 0.8);
        return look(D, L.RH.x - 4.4, L.RH.z - L.RH.l / 2 - 1.8, tp.x, tp.z, k < 0.36 ? 'signal' : 'point', 0.15, c.now * 0.8);
      }
      break;
    }
    case 'wings': {
      // the panels from the trestle onto the spar stubs: the first by a pusher and a fitter, the second by the others
      const pi = role === 'w1' || role === 'p1' ? 0 : role === 'w2' || role === 'p2' ? 1 : -1;
      if (pi >= 0) {
        const k0 = pi === 0 ? 0.12 : 0.55, kk = smooth(k, k0, k0 + 0.43);
        const atTip = role === 'w1' || role === 'w2';
        wingEnd(L, pi, kk, atTip, _we);
        const lift = Math.sin(PI * kk) * 0.5;
        const x = _we.x + _we.nx * 0.62, z = _we.z + _we.nz * 0.62;
        const moving = kk > 0.02 && kk < 0.97;
        put(D, x, z, headingOf(-_we.nx, -_we.nz), moving ? 'carryWalk' : kk >= 0.97 ? 'push' : 'crouch', 0.15, (kk * _we.path) / CSTRIDE);
        if (k < k0 - 0.02) D.pose = 'stand';
        return hands(D, [_we.x - _we.sx * 0.22, _we.y + lift, _we.z - _we.sz * 0.22], [_we.x + _we.sx * 0.22, _we.y + lift, _we.z + _we.sz * 0.22], 0.95);
      }
      if (role === 'officer') return look(D, L.TROLLEY.x - 3.4, L.TROLLEY.z - 3.0, L.TROLLEY.x, L.TROLLEY.z, 'point', 0.15);
      break;
    }
    case 'airlog': {
      if (role === 'rm') {
        // at the nose: the air log's counter set for the range (the little propeller turned by hand to the mark)
        off(tp.x, tp.z, tp.h, 4.75, 0);
        look(D, _off[0], _off[1], tp.x, tp.z, 'operate', tp.y, c.now * 0.5);
        off(tp.x, tp.z, tp.h, 4.22, 0, _off2);
        return hands(D, [_off2[0] - 0.06, TY + 0.02, _off2[1]], [_off2[0] + 0.06, TY - 0.02 + 0.05 * Math.sin(c.now * 3), _off2[1]], 1);
      }
      if (role === 'p1' || role === 'p2') { off(tp.x, tp.z, tp.h, 1.6, role === 'p1' ? -1.6 : 1.6); return look(D, _off[0], _off[1], tp.x, tp.z, 'stand', tp.y); }
      if (role === 'officer') return look(D, L.RH.x + 3.4, L.RH.z - L.RH.l / 2 - 1.4, tp.x, tp.z - 4, 'stand', 0.15);
      break;
    }
    case 'ramp': {
      // round the bend to the foot (two at the tail pushing, two at the nose steering), the cradle cranked up to
      // the ramp's line, the missile pushed up onto the sled, then the empty trolley pulled back clear
      const sd = role === 'p1' || role === 'w1' ? -1 : 1;
      if (role === 'p1' || role === 'p2' || role === 'w1' || role === 'w2') {
        const tail = role === 'p1' || role === 'p2';
        if (k < 0.45) {
          off(tp.x, tp.z, tp.h, tail ? -3.3 : 1.85, sd * (tail ? 0.78 : 0.95));
          put(D, _off[0], _off[1], tp.h, tp.moving ? 'walk' : 'stand', tp.y, tp.d / (STRIDE * 0.8));
          off(tp.x, tp.z, tp.h, tail ? -2.85 : 1.6, sd * 0.36, _off2);
          return hands(D, [_off2[0], TY + 0.05, _off2[1]], [_off2[0], TY + 0.15, _off2[1]], 0.85);
        }
        if (k < 0.52) {
          // the jacks: one man at each handwheel, the other two stand clear of the wings
          if (!tail) { off(tp.x, tp.z, tp.h, 2.2, sd * 1.6); return look(D, _off[0], _off[1], tp.x, tp.z, 'stand', tp.y); }
          const az = sd < 0 ? 0.95 : -1.55;
          off(tp.x, tp.z, tp.h, az, 1.05);
          look(D, _off[0], _off[1], tp.x, tp.z, 'crouch', tp.y, c.now);
          off(tp.x, tp.z, tp.h, az, 0.62, _off2);
          const w = 0.12 * Math.sin(c.now * 4);
          return hands(D, [_off2[0], tp.y + 0.7 + w, _off2[1]], [_off2[0], tp.y + 0.7 - w, _off2[1]], 0.9);
        }
        if (k > 0.78 && !tail) {
          // the empty trolley pushed back from its front
          off(tp.x, tp.z, tp.h, 3.55, sd * 0.42);
          put(D, _off[0], _off[1], tp.h + PI, tp.moving ? 'walk' : 'stand', tp.y, tp.d / (STRIDE * 0.8));
          off(tp.x, tp.z, tp.h, 2.05, sd * 0.35, _off2);
          return hands(D, [_off2[0], tp.y + 0.55, _off2[1]], [_off2[0] - 0.1 * sd, tp.y + 0.55, _off2[1]], 0.8);
        }
        // the slide: the missile pushed up the ramp's line onto the sled, the men walking up beside it (on the
        // platform, beside the girder), then standing clear
        const sl = smooth(k, 0.52, 0.74), sm = -4.563 + L.SLIDE * sl; // the missile's middle up the slope
        const sMan = tail ? Math.min(0.4, sm - 4.4) : Math.min(2.6, sm + 1.75);
        const z = -sMan * Math.cos(L.SLOPE);
        if (k > 0.75) return look(D, tail ? -2.9 - 0.9 * sd : 2.6, tail ? 7.4 + 0.5 * sd : 6.8 + 0.8 * sd, 0, -4, 'stand', tail ? 0 : 0.15);
        put(D, sd * (tail ? 0.85 : 1.0), z, 0, 'walk', L.APRON, (sMan + 9) / STRIDE);
        const sh = tail ? sm - 3.6 : sm + 1.45, yh = L.Y0 + L.MIS_Y * Math.cos(L.SLOPE) + sh * Math.sin(L.SLOPE);
        return hands(D, [sd * 0.38, yh + 0.05, -sh * Math.cos(L.SLOPE)], [sd * 0.34, yh + 0.15, -sh * Math.cos(L.SLOPE) - 0.2], 0.85);
      }
      if (role === 'officer') return look(D, -3.6, 13.4, tp.x, tp.z, tp.moving ? 'signal' : 'point', 0, c.now * 0.8);
      break;
    }
    case 'fuel': {
      // up on the step at the filler with the hose, the generator man at the cart's pump; then the air bottles
      // charged from the starter cart; the two pushers take the empty trolley home
      const S = L.STEP, top = L.APRON + S.h;
      const sg = Math.sign(S.x);
      if (role === 'fuel') return onStep(L, D, k, 0.06, -5.95, top, k < 0.6 ? [[sg * 0.18, 3.08, -5.66], [sg * 0.42, 3.0, -5.7]] : null, c);
      if (role === 'g1' && k < 0.62) {
        const F = L.FUELCART, cs = -Math.sign(F.x), w = 0.12 * Math.sin(c.now * 5);
        look(D, F.x + cs * 1.05, F.z + 0.3, F.x, F.z + 0.3, k > 0.12 ? 'operate' : 'stand', L.APRON, c.now * 1.6);
        return hands(D, [F.x + cs * 0.72, L.APRON + 1.42 + w, F.z + 0.28], [F.x + cs * 0.62, L.APRON + 1.44 + w, F.z + 0.36], 1);
      }
      if (role === 'rm' && k > 0.5) {
        const Q = L.STARTER;
        look(D, Q.x + 0.75, Q.z + 0.4, Q.x, Q.z, 'operate', L.APRON, c.now * 0.5);
        return hands(D, [Q.x + 0.25, 0.9, Q.z + 0.1], [Q.x + 0.2, 0.95, Q.z - 0.2], 0.9);
      }
      if (!c.quick && (role === 'p1' || role === 'p2')) return trolleyMen(L, c, role, tp, D);
      break;
    }
    case 'steam': {
      // the generator trolley pushed along its rails to the breech and coupled, then charged with T-Stoff from the
      // drums' pump (its hose to the tank's filler) and Z-Stoff
      const gz = L.GEN_OFF + (L.GEN_ON - L.GEN_OFF) * smooth(k, 0.08, 0.33);
      if (role === 'g1' || role === 'g2') {
        const sd = role === 'g1' ? -1 : 1;
        if (k < 0.34) {
          put(D, sd * 0.45, gz + 4.75, 0, k > 0.08 && k < 0.33 ? 'walk' : 'stand', L.APRON, (L.GEN_OFF - gz) / (STRIDE * 0.75));
          return hands(D, [sd * 0.38, 0.68, gz + 4.25], [sd * 0.52, 0.66, gz + 4.25], 0.9);
        }
        if (k < 0.47) {
          look(D, sd * 0.78, 0.25, 0, 0.6, 'crouch', L.APRON, c.now);
          return hands(D, [sd * 0.24, 1.12, 0.6], [sd * 0.18, 0.96, 0.66], 1);
        }
        if (sd < 0) {
          const Dr = L.DRUMS, w = 0.1 * Math.sin(c.now * 5);
          look(D, Dr.x + 0.95, Dr.z + 0.45, Dr.x, Dr.z, k < 0.95 ? 'operate' : 'stand', L.APRON, c.now * 1.6);
          return hands(D, [Dr.x + 0.48, L.APRON + 1.12 + w, Dr.z + 0.02], [Dr.x + 0.42, L.APRON + 1.14 + w, Dr.z - 0.04], 1);
        }
        look(D, 0.72, 2.75, 0, 2.82, 'operate', L.APRON, c.now * 0.4);
        return hands(D, [0.06, 1.74, 2.8], [0.16, 1.66, 2.95], 0.9);
      }
      if (c.quick && (role === 'p1' || role === 'p2')) return trolleyMen(L, c, role, tp, D);
      break;
    }
    case 'arm': {
      const sg = Math.sign(L.STEP.x);
      if (role === 'rm') return onStep(L, D, k, 0.0, -7.55, L.APRON + L.STEP.h, [[sg * 0.12, 3.2, -7.7], [sg * 0.3, 3.12, -7.5]], c, 0.2, A);
      if (role === 'officer') return look(D, L.STEP.x + sg * 1.5, L.STEP.z + 1.8, 0, -7.5, 'point', L.APRON);
      break;
    }
    case 'clear': case 'fire': {
      const cv = v1Cover(L)[role];
      if (!cv || role === 'firer') break;
      const f = id === 'clear' ? ramp(k, 0.02, 0.8) : 1, bh = facing(cv[0], cv[1], 0, -10);
      if (f >= 1 || !A) return look(D, cv[0], cv[1], 0, -10, 'crouch', 0, c.now * 0.3);
      if (inWalls(A.x, A.z)) { _way[0][0] = A.x < 0 ? -2.6 : 2.6; _way[1][0] = cv[0]; _way[1][1] = cv[1]; return walkVia(D, A, _way, bh, f, 0); }
      return walkTo(D, A.x, A.z, A.h, cv[0], cv[1], bh, f, A.y, 0);
    }
  }
  return null;
}
// up the treads onto the working step (from wherever he was), then at work at the missile's side
function onStep(L, D, k, k0, z, top, hs, c, kw = 0.1, A = null) {
  const S = L.STEP, sg = Math.sign(S.x), fx = S.x + sg * 0.62, fz = S.z + S.l / 2 + 0.55;
  if (k < k0 + kw) {
    if (A && Math.hypot(A.x - fx, A.z - fz) > 0.4) return walkTo(D, A.x, A.z, A.h, fx, fz, 0, ramp(k, k0, k0 + kw), A.y, L.APRON);
    return look(D, fx, fz, fx, fz - 1, 'stand', L.APRON);
  }
  if (k < k0 + kw + 0.04) { const f = ramp(k, k0 + kw, k0 + kw + 0.04); return put(D, fx - sg * 0.42 * f, fz - 0.6 * f, 0, 'climb', L.APRON + S.h * f, f * S.h / RISE); }
  look(D, S.x - sg * 0.05, z, 0, z, hs ? 'operate' : 'stand', top, c.now * 0.4);
  if (hs) hands(D, hs[0], hs[1], 1);
  return D;
}
// the two pushers taking the empty trolley home (fuel, or steam on a set-up site)
function trolleyMen(L, c, role, tp, D) {
  const sd = role === 'p1' ? -1 : 1, back = tp.rev;
  // backing along the bend they push its front; down the line to the store they push its rear
  off(tp.x, tp.z, tp.h, back ? 3.55 : -3.2, sd * 0.45);
  put(D, _off[0], _off[1], back ? tp.h + PI : tp.h, tp.moving ? 'walk' : 'stand', tp.y, tp.d / (STRIDE * 0.8));
  off(tp.x, tp.z, tp.h, back ? 2.05 : -2.05, sd * 0.35, _off2);
  return hands(D, [_off2[0], tp.y + 0.55, _off2[1]], [_off2[0] - 0.08 * sd, tp.y + 0.55, _off2[1]], 0.8);
}
// The leading edge at one end of a wing panel on its way from its trestle to the spar stub (as rig.setWings
// poses it, the trolley on the apron): the point, its outward normal, the span direction, the path length.
// On its trestle a panel lies span along +Z, turned a quarter about Y (its leading edge outward); fitted, it spans
// out from the missile's side, its leading edge forward (-Z).
const _we = { x: 0, y: 0, z: 0, nx: 0, nz: 0, sx: 0, sz: 0, path: 0 };
function wingEnd(L, i, kk, tip, o) {
  const side = i === 0 ? -1 : 1, A = L.TROLLEY, st = L.WSTACKS[i];
  const fitX = A.x + side * (0.425 - 0.04), fitZ = A.z - 0.71, fitY = 0.15 + 0.62 + 0.46;
  const stX = st.x + side * 0.15, stZ = st.z - 1.15, stY = st.y + 0.07;
  const th = -side * HALF * (1 - kk);
  const sx = side * Math.cos(th), sz = -side * Math.sin(th); // the span
  const nx = -Math.sin(th), nz = -Math.cos(th); // the leading edge's outward normal
  const rx = lerp(stX, fitX, kk), rz = lerp(stZ, fitZ, kk), ry = lerp(stY, fitY, kk);
  const along = tip ? 1.85 : 0.45;
  o.x = rx + sx * along + nx * 0.35; o.z = rz + sz * along + nz * 0.35; o.y = ry;
  o.nx = nx; o.nz = nz; o.sx = sx; o.sz = sz;
  o.path = Math.hypot(fitX - stX, fitZ - stZ) + 0.8;
  return o;
}
const _tp2 = { x: 0, z: 0, h: 0, y: 0, lift: 0, slide: 0, empty: false, d: 0, moving: false, rev: false };
const _way = [[-2.6, 6.2], [0, 0]];

// ---- V-2 crew: twelve men. The battery officer and the firer in the Feuerleitpanzer (caps), the Meillerwagen's
// operator, two at the table (the crank and the aiming circle, the fins' pads), two on the platforms, the alcohol,
// T-Stoff and two oxygen men, the power truck's man.
const V2_ROLES = ['officer', 'firer', 'meiller', 't1', 't2', 'u1', 'u2', 'alc', 'tst', 'lox1', 'lox2', 'power'];
function v2Home(L) {
  if (L._home) return L._home;
  const ry = Math.atan2(-(0 - L.FLP.x), -(0 - L.FLP.z)), co = Math.cos(ry), s = Math.sin(ry);
  const fl = (lx, lz) => [L.FLP.x + lx * co + lz * s, L.FLP.z - lx * s + lz * co];
  const f = fl(1.9, -1.2);
  return (L._home = {
    officer: [-5.6, -5.4, 0.8], firer: [f[0], f[1], ry], meiller: [2.25, L.PIV.z + 7.25 + L.WITHDRAW, -HALF], t1: [-2.9, -2.4, -2.4], t2: [3.0, -2.6, 2.4],
    u1: [-2.6, 3.4, PI * 0.8], u2: [2.8, 3.7, -PI * 0.8], alc: [L.PUMP.x - 1.25, L.PUMP.z - 0.25, -HALF], tst: [L.TST.x - 3.55, L.TST.z + 0.9, PI],
    lox1: [L.LOX.x + 0.15, L.LOX.z + 4.4, 0], lox2: [L.LOX.x + 1.6, L.LOX.z + 2.2, HALF], power: [L.PWR.x + 1.45, L.PWR.z + 1.6, HALF],
  });
}
function v2Cover(L) {
  if (L._cover) return L._cover;
  const T = L.TRENCHES, at = (n, u) => { const [x, z, ry] = T[n]; return [x + Math.sin(ry) * u, z + Math.cos(ry) * u]; };
  return (L._cover = {
    officer: at(0, -1.4), t1: at(0, 0), u1: at(0, 1.4), t2: at(2, -1.3), u2: at(2, 0), tst: at(2, 1.3),
    alc: at(1, -1.4), lox1: at(1, 0), lox2: at(1, 1.4), power: [L.PWR.x + 1.3, L.PWR.z - 1.0], meiller: [3.4, L.PIV.z + 6.0 + L.WITHDRAW],
  });
}
// a man on the standing Meillerwagen's ladder (the rungs on the beams' outer faces) or its work platforms
const platY = (L, n) => L.PIV.y + L.PLAT[n].z + 0.04;
const platX = (L, n, sd) => sd * ((L.PLAT[n].w0 + L.PLAT[n].w1) / 2 + 0.06);
function climb(L, D, sd, y0, y1, f) {
  const y = lerp(y0, y1, f);
  put(D, sd * 1.02, 1.12, sd < 0 ? -HALF : HALF, f > 0 && f < 1 ? 'climb' : 'stand', y, Math.abs(y - y0) / RISE);
  return D;
}
const V2_COVER_K = [0.3, 0.75]; // the withdraw step's walk to the trenches

function v2Place(L, c, role, id, k, D, A) {
  const st = v2State(c, id, k, _v2b), mz = L.WITHDRAW * smooth(st.m, 0.02, 1);
  const R = (h) => L.rocketR(h);
  switch (id) {
    case 'erect': {
      if (role === 'meiller') {
        // walks beside the trailer at its control valves as it is backed in, then works the rams
        const vz = L.PIV.z + 7.25 + mz, backing = k > 0.04 && k < 0.32, rams = k > 0.42 && k < 0.92;
        put(D, 2.25, vz, -HALF, rams ? 'operate' : backing ? 'walk' : 'stand', 0, backing ? (L.WITHDRAW - mz) / STRIDE : c.now * 0.7);
        if (backing) D.h = 0;
        if (rams) return hands(D, [1.55, 1.42, vz - 0.1], [1.55, 1.38, vz + 0.12], 1);
        return D;
      }
      if (role === 't1' || role === 't2') {
        const sd = role === 't1' ? -1 : 1;
        if (k < 0.32) return look(D, sd * 3.0, 1.0, 0, 8, 'signal', 0, c.now * 0.9 + sd);
        if (k < 0.42) { look(D, sd * 3.2, -0.05, sd * 2.6, 0.6, 'crouch', 0, c.now); return hands(D, [sd * 2.62, 0.95, 0.55], [sd * 2.58, 0.92, 0.65], 0.9); }
        if (k < 0.9) return look(D, sd * 3.1, -1.8, 0, 2, 'stand');
        look(D, sd * 1.8, -1.6, sd * 1.25, -1.25, 'crouch', 0, c.now);
        return hands(D, [sd * 1.22, 1.55, -1.2], [sd * 1.28, 1.5, -1.12], 0.9);
      }
      if (role === 'officer') return look(D, -6.5, 2.0, 0, 6, k < 0.42 ? 'point' : 'stand');
      break;
    }
    case 'align': {
      if (role === 't1') {
        const C = L.CRANK, turning = k > 0.15 && k < 0.85, a = c.now * 5;
        put(D, C.x - 0.55, C.z, -HALF, turning ? 'operate' : 'stand', 0, c.now * 1.5);
        return hands(D, [C.x, C.y + 0.12 * Math.cos(a), C.z + 0.12 * Math.sin(a)], [C.x - 0.05, C.y - 0.12 * Math.cos(a), C.z - 0.12 * Math.sin(a)], turning ? 1 : 0.6);
      }
      if (role === 't2') { const Q = L.CIRCLE; put(D, Q.x, Q.z - 0.55, PI, 'operate', 0, c.now * 0.2); return hands(D, [Q.x - 0.06, 1.45, Q.z - 0.12], [Q.x + 0.1, 1.42, Q.z - 0.05], 0.9); }
      if (role === 'u1') {
        if (k < 0.12) return A ? walkTo(D, A.x, A.z, A.h, -1.02, 1.12, -HALF, k / 0.12, A.y, 1.3) : look(D, -1.02, 1.12, 0, 1.12, 'stand', 1.3);
        if (k < 0.92) return climb(L, D, -1, 1.3, platY(L, 1), ramp(k, 0.12, 0.92));
        return look(D, platX(L, 1, -1), 0.3, 0, 0.3, 'stand', platY(L, 1));
      }
      if (role === 'officer') return look(D, L.CIRCLE.x - 1.6, L.CIRCLE.z + 1.2, 0, 0, 'stand');
      break;
    }
    case 'cutoff': case 'checks': case 'alcohol': case 'tstoff': case 'lox': {
      if (role === 'u1') {
        const y = platY(L, 1), x = platX(L, 1, -1);
        if (id === 'alcohol' && k > 0.08) {
          look(D, x, 0.7, 0, 0.7, 'crouch', y, c.now);
          const hy = L.T + 14 - 3.75;
          return hands(D, [-0.22, hy + 0.15, R(hy) + 0.06], [-0.08, hy - 0.05, R(hy) + 0.1], 0.9);
        }
        const work = id === 'cutoff' || id === 'checks';
        look(D, x, 0.25, 0, 0.25, work ? 'operate' : 'stand', y, c.now * 0.5);
        if (work) return hands(D, [-R(y + 1) - 0.03, y + 1.05, 0.05], [-R(y + 1) - 0.03, y + 1.12, 0.38], 0.9);
        return D;
      }
      if (role === 'u2') {
        const y = platY(L, 0), x = platX(L, 0, 1);
        if (id === 'cutoff') {
          if (k < 0.1) return A ? walkTo(D, A.x, A.z, A.h, 1.02, 1.12, HALF, k / 0.1, A.y, 1.3) : look(D, 1.02, 1.12, 0, 1.12, 'stand', 1.3);
          if (k < 0.85) return climb(L, D, 1, 1.3, y, ramp(k, 0.1, 0.85));
        }
        if (id === 'lox' && k > 0.08) {
          look(D, x, 0.7, 0, 0.7, 'crouch', y, c.now);
          const hy = L.T + 14 - 6.75;
          return hands(D, [0.22, hy + 0.15, R(hy) + 0.06], [0.1, hy - 0.05, R(hy) + 0.1], 0.9);
        }
        look(D, x, 0.25, 0, 0.25, id === 'checks' ? 'operate' : 'stand', y, c.now * 0.5 + 1);
        if (id === 'checks') return hands(D, [R(y + 1) + 0.03, y + 1.0, 0.1], [R(y + 1) + 0.03, y + 1.08, 0.42], 0.9);
        return D;
      }
      if (id === 'checks') {
        if (role === 'officer') return look(D, -4.2, -3.6, 0, 0, 'phone', 0, c.now * 0.2);
        if (role === 'power') { const P = L.PWR; look(D, P.x + 1.45, P.z + 1.6, P.x + 0.6, P.z + 1.6, 'operate', 0, c.now * 0.4); return hands(D, [P.x + 1.0, 1.25, P.z + 1.5], [P.x + 1.0, 1.2, P.z + 1.75], 0.8); }
        if (role === 't1') { const M = L.MAST; look(D, M.x - 0.75, M.z + 0.55, M.x, M.z + 0.12, 'operate', 0, c.now * 0.6); return hands(D, [M.x - 0.12, 1.15, M.z + 0.22], [M.x - 0.1, 1.05, M.z + 0.05], 0.9); }
      }
      if (id === 'alcohol' && role === 'alc') {
        const P = L.PUMP;
        look(D, P.x - 1.25, P.z - 0.25, P.x, P.z - 0.25, k > 0.1 && k < 0.95 ? 'operate' : 'stand', 0, c.now * 0.7);
        return hands(D, [P.x - 0.55, 1.05, P.z - 0.35], [P.x - 0.55, 1.0, P.z - 0.05], 0.85);
      }
      if (id === 'tstoff') {
        if (role === 'tst') { const P = L.TST; look(D, P.x - 3.55, P.z + 0.9, P.x - 3.0, P.z, k > 0.12 && k < 0.92 ? 'operate' : 'stand', 0, c.now * 0.8); return hands(D, [P.x - 3.15, 1.0, P.z + 0.3], [P.x - 3.1, 0.95, P.z + 0.5], 0.85); }
        if (role === 't1' && k > 0.08) { look(D, 0.5, -1.6, 0, -0.7, 'stand', 1.3); return hands(D, [0.08, L.T + 2.05, -0.86], [0.2, L.T + 1.95, -0.9], 0.9); }
      }
      if (id === 'lox' && (role === 'lox1' || role === 'lox2')) {
        const P = L.LOX;
        if (role === 'lox1') { look(D, P.x + 0.15, P.z + 4.4, P.x, P.z + 3.6, k > 0.12 ? 'operate' : 'stand', 0, c.now * 0.5); return hands(D, [P.x - 0.2, 1.55, P.z + 3.68], [P.x + 0.3, 1.45, P.z + 3.7], 0.9); }
        return look(D, P.x + 1.6, P.z + 2.2, P.x, P.z + 2.2, 'stand', 0);
      }
      if (role === 'officer' && id !== 'checks') return look(D, -5.0, -4.6, 0, 0, id === 'lox' ? 'point' : 'stand');
      break;
    }
    case 'withdraw': {
      if (role === 'meiller') {
        const vz = L.PIV.z + 7.25 + mz, going = k > 0.32 && k < 0.98;
        put(D, 2.25, vz, going ? 0 : -HALF, going ? 'walk' : 'operate', 0, mz / STRIDE);
        if (!going) return hands(D, [1.55, 1.42, vz - 0.1], [1.55, 1.38, vz + 0.12], 0.8);
        return D;
      }
      const cv = v2Cover(L)[role];
      if (role === 'u1' || role === 'u2') {
        const n = role === 'u1' ? 1 : 0, sd = role === 'u1' ? -1 : 1;
        if (k < 0.04) return look(D, platX(L, n, sd), 0.3, sd * 1.0, 1.1, 'stand', platY(L, n));
        if (k < 0.28) return climb(L, D, sd, platY(L, n), 1.3, smooth(k, 0.04, 0.28));
        return walkTo(D, sd * 1.02, 1.12, sd < 0 ? -HALF : HALF, cv[0], cv[1], facing(cv[0], cv[1], 0, 0), ramp(k, 0.28, 0.7), 1.3, 0);
      }
      if (!cv) break;
      const f = ramp(k, V2_COVER_K[0], V2_COVER_K[1]);
      if (f >= 1 || !A) return look(D, cv[0], cv[1], 0, 0, 'crouch', 0, c.now * 0.3);
      if (f <= 0) return null;
      return walkTo(D, A.x, A.z, A.h, cv[0], cv[1], facing(cv[0], cv[1], 0, 0), f, A.y, 0);
    }
    case 'prestage': case 'fire': {
      const cv = v2Cover(L)[role];
      if (cv) return look(D, cv[0], cv[1], 0, 0, role === 'officer' ? 'stand' : 'crouch', 0, c.now * 0.3);
      break;
    }
  }
  return null;
}
const _v2b = { m: 1, e: 0, cl: 1 };

// ---- the crew
const SCRIPT = {
  v1: {
    roles: V1_ROLES,
    home: (L, role) => V1_HOME[role],
    cover: (L, role) => v1Cover(L)[role],
    place: v1Place,
    // the firer waits in the bunker by the firing switch through the whole drill
    hold: (L, role, D, c) => (role === 'firer' ? look(D, -18.45, 4.0, 0, 4.0, c.id === 'fire' && c.active ? 'operate' : 'stand', 0, c.now * 0.3) : null),
  },
  v2: {
    roles: V2_ROLES,
    home: (L, role) => v2Home(L)[role],
    cover: (L, role) => v2Cover(L)[role] ?? null,
    place: v2Place,
    hold: (L, role, D, c) => {
      if (role !== 'firer') return null;
      const h = v2Home(L).firer;
      return put(D, h[0], h[1], h[2], c.id === 'checks' || c.id === 'prestage' || c.id === 'fire' ? 'phone' : 'stand', 0, c.now * 0.2);
    },
  },
};

const _h = new THREE.Vector3();
class VMan {
  constructor(crew, role, i) {
    this.role = role;
    this.fig = buildCrewman(crewForRoleDE(role, i));
    this.root = this.fig.root;
    this.root.visible = false;
    this.seed = i * 1.37;
    crew.rig.root.add(this.root);
    this.x = 0; this.y = 0; this.z = 0; this.h = 0;
  }
}

export class VCrew {
  constructor(rig, kind) {
    if (!SCRIPT[kind] || !rig.layout) throw new Error(`no launch crew for ${kind}`);
    this.rig = rig;
    this.kind = kind;
    this.S = SCRIPT[kind];
    this.L = rig.layout;
    this.men = this.S.roles.map((r, i) => new VMan(this, r, i));
    this.level = 2;
    this.blend = 1;
    this.c = {};
    this.A = newDo(); this.B = newDo(); this.D = newDo(); this.Z = newDo();
    this.coverK = 0;
    this.lastT = null;
    this.unit = null;
  }

  setLevel(level) {
    this.level = level;
    if (level <= 0) for (const m of this.men) m.root.visible = false;
  }

  // the man's place at the end of the last step this round's crew did before index i (home at a round's start)
  endBefore(c, role, i, D) {
    const S = c.st.steps;
    for (let j = i - 1; j >= 0; j--) {
      const id = S[j].id;
      if (c.prep?.has(id)) continue;
      if (this.S.place(this.L, c, role, id, 1, D, this.Z)) return D;
    }
    const hm = this.S.home(this.L, role);
    return put(D, hm[0], hm[1], hm[2], 'stand', 0, c.now * 0.2 + 0.3);
  }

  // where man m is and what he does this frame
  plan(m, c) {
    const L = this.L, S = this.S, role = m.role;
    const held = S.hold(L, role, this.B, c);
    if (held) return held;
    // after the shot: in cover for a few seconds, then back to the round's start
    if (c.since < 10 && !c.active) {
      const cv = S.cover(L, role);
      if (cv) {
        const hm = S.home(L, role), f = ramp(c.since, 5.5, 10);
        if (f <= 0) return look(this.D, cv[0], cv[1], 0, 0, c.since < 3.5 ? 'ears' : 'crouch', 0, c.now * 0.3);
        return walkTo(this.D, cv[0], cv[1], 0, hm[0], hm[1], hm[2], f, 0);
      }
    }
    const A = this.endBefore(c, role, c.i, this.A);
    if (!c.active) return copyDo(this.D, A); // waiting for the next key: where the last step left him
    const B = S.place(L, c, role, c.id, c.k, this.B, A);
    if (!B) return copyDo(this.D, A); // not his step: he stays where he was
    if (B.own) return B;
    // walk in from his last place to his first place in this step; the step's own motion starts after the walk
    const lead = 0.1;
    if (c.k < lead) {
      const B0 = S.place(L, c, role, c.id, lead, this.D, A);
      const d = Math.hypot(B0.x - A.x, B0.z - A.z);
      if (d > 0.35 || Math.abs(B0.y - A.y) > 0.2) {
        const bx = B0.x, bz = B0.z, by = B0.y, bh = B0.h;
        return walkTo(this.D, A.x, A.z, A.h, bx, bz, bh, c.k / lead, A.y, by);
      }
    }
    return B;
  }

  update(p, sim, rawDt, level) {
    this.level = level;
    if (level <= 0) { this.setLevel(0); return; }
    const u = this.unit && this.unit.pieces[0] === p ? this.unit : (this.unit = sim.units.find((q) => q.pieces?.[0] === p) ?? null);
    if (!u?.special?.steps) { for (const m of this.men) m.root.visible = false; return; }
    const c = poseVSite(this.rig, u, sim, this.c);
    if (!c) return;
    // the crew's shelter in a raid: eased in game time (a cover order is not a teleport)
    const dtg = this.lastT == null ? 2 : Math.max(0, Math.min(2, sim.time - this.lastT));
    this.lastT = sim.time;
    this.coverK += ((c.cover ? 1 : 0) - this.coverK) * (1 - Math.exp(-dtg * 0.9));
    this.blend = 1 - Math.exp(-12 * Math.max(rawDt, 0.008));
    const gone = Math.max(0, p.crewMax - p.crew), dead = p.state === 'dead' || !u.alive;
    const shot = (c.id === 'fire' && c.active && c.k > (this.kind === 'v1' ? 0.55 : 0.2)) || c.since < 3.5;
    for (let n = 0; n < this.men.length; n++) {
      const m = this.men[n];
      if (dead || n >= this.men.length - gone) { m.root.visible = false; continue; }
      m.root.visible = true;
      let D = this.plan(m, c);
      if (this.coverK > 0.02 && m.role !== 'firer' && !(c.since < 10 && !c.active)) {
        const cv = this.S.cover(this.L, m.role);
        if (cv) {
          const f = this.coverK;
          D = f > 0.97 ? look(this.A, cv[0], cv[1], 0, 0, 'crouch', 0, c.now * 0.3) : walkTo(this.A, D.x, D.z, D.h, cv[0], cv[1], 0, f, D.y, 0);
        }
      }
      // the shot: men turn away and cover their ears as the round goes
      this.apply(m, D, shot && D.pose !== 'walk' && D.pose !== 'climb' && m.role !== 'firer');
    }
  }

  apply(m, D, ears) {
    m.x = D.x; m.y = D.y; m.z = D.z; m.h = D.h; m.pose = D.pose;
    m.root.position.set(D.x, D.y, D.z);
    m.root.rotation.y = D.h;
    m.fig.pose(ears ? 'ears' : D.pose, D.t + (D.pose === 'stand' || D.pose === 'crouch' ? m.seed : 0), this.blend);
    if (this.level >= 2 && !ears) {
      if (D.hl) this.reach(m, 'L', D.hl, D.wl);
      if (D.hr) this.reach(m, 'R', D.hr, D.wr);
    }
  }

  reach(m, side, p, w) {
    const dx = p[0] - m.x, dz = p[2] - m.z, ch = Math.cos(m.h), sh = Math.sin(m.h), sc = 1 / m.root.scale.x;
    _h.set((dx * ch - dz * sh) * sc, (p[1] - m.y) * sc, (dx * sh + dz * ch) * sc);
    // within an arm's length of the shoulder (about 1.4 m up, a little to the side), else the pose's own hands
    const sy = m.pose === 'crouch' ? 0.95 : 1.38;
    if (Math.hypot(_h.x, _h.y - sy, _h.z) > 0.95) return;
    m.fig.reach(side, _h, Math.min(1, w));
  }
}

function copyDo(D, A) {
  D.x = A.x; D.y = A.y; D.z = A.z; D.h = A.h; D.pose = A.pose; D.t = A.t; D.own = A.own;
  D.hl = A.hl ? (D._hl[0] = A.hl[0], D._hl[1] = A.hl[1], D._hl[2] = A.hl[2], D._hl) : null; D.wl = A.wl;
  D.hr = A.hr ? (D._hr[0] = A.hr[0], D._hr[1] = A.hr[1], D._hr[2] = A.hr[2], D._hr) : null; D.wr = A.wr;
  return D;
}

// ---------------------------------------------------------------- the camera
// Each step framed so the work shows: the focus (site frame), the camera's yaw about it (0: behind the site, from
// +Z), its pitch and distance. The sites face west, so the cameras keep to their south and east sides where they
// can (the sun behind them most of the day, the work front-lit instead of a glare). The launch is framed wide and from the side; the render layer then follows the
// missile out. key changes when the shot changes (the camera reframes then, and otherwise leaves the player be).
const FR_V1 = {
  bring: [null, 1.4, null, -1.0, 0.3, 30],
  wings: [24.6, 1.4, 8.6, -1.05, 0.38, 17],
  compass: [24, 1.6, 18.8, PI + 0.28, 0.13, 17],
  airlog: [24.2, 1.3, 17.6, PI + 0.42, 0.2, 8.5],
  ramp: [null, 1.6, null, -0.62, 0.42, 30],
  fuel: [-0.6, 2.3, -5.0, -HALF + 0.55, 0.36, 12],
  steam: [-0.4, 1.2, 3.8, -0.6, 0.36, 14],
  arm: [-0.4, 2.8, -7.2, -HALF + 0.6, 0.32, 9.5],
  clear: [-6, 1.6, 3, -0.45, 0.42, 34],
  fire: [0, 3, -14, -HALF + 0.42, 0.26, 48],
};
const FR_V2 = {
  erect: [0, 5.5, 7, -HALF + 0.38, 0.3, 30],
  align: [-1.0, 1.8, 0, -HALF - 0.25, 0.55, 15],
  cutoff: [0, 11.5, 0.3, -HALF - 0.4, 0.12, 20],
  checks: [0, 2.8, 0.8, -HALF - 1.1, 0.06, 12.5], // low on the tail, sunlit side: the air and jet vanes exercise in this step
  alcohol: [3, 5, 5, -HALF + 0.45, 0.28, 26],
  tstoff: [1.5, 3, -5, -HALF + 0.5, 0.3, 22],
  lox: [-3.6, 5.5, 3, -HALF + 0.5, 0.26, 26],
  withdraw: [0, 4, 10, -HALF + 0.2, 0.4, 30],
  prestage: [0, 8, 0, -HALF + 0.4, 0.12, 44],
  fire: [0, 8, 0, -HALF + 0.4, 0.12, 44],
};
const _ft = { x: 0, z: 0, h: 0, y: 0, lift: 0, slide: 0, empty: false, d: 0, moving: false, rev: false };
const _cf = {};
export function vFraming(rig, u, sim, out = {}) {
  if (!rig?.layout || !u?.special?.steps) return null;
  const c = drillClock(u, sim, _cf), L = rig.layout;
  const T = c.kind === 'v1' ? FR_V1 : FR_V2;
  // just after a shot: the launch view (the follow is the render layer's)
  const sg0 = Math.sin(u.zero ?? 0) > 0 ? -1 : 1;
  if (c.since < (c.kind === 'v1' ? 8 : 22)) { out.key = `launch:${c.st.n}`; out.launch = true; out.since = c.since; const f = T.fire; return fill(out, f[0], f[1], f[2], sg0 * f[3], f[4], f[5]); }
  out.launch = false;
  const id = c.id ?? (c.kind === 'v1' ? 'bring' : 'erect');
  const f = T[id] ?? T[c.kind === 'v1' ? 'clear' : 'withdraw'];
  out.key = `${c.st.n ?? 0}:${id}`;
  // the cameras keep to the site's sunny side: mirrored for a site that faces east
  const sg = Math.sin(u.zero ?? 0) > 0 ? -1 : 1;
  let x = f[0], z = f[2];
  if (x == null) {
    // the trolley's steps: the focus rides with it
    trolleyPose(L, c, id, c.active ? c.k : 0, _ft);
    x = _ft.x; z = _ft.z;
    if (id === 'ramp' && c.k > 0.45) { x = 0.3; z = 0.5; }
  }
  return fill(out, x, f[1], z, sg * f[3], f[4], f[5]);
}
const fill = (o, x, y, z, yaw, pitch, dist) => { o.x = x; o.y = y; o.z = z; o.yaw = yaw; o.pitch = pitch; o.dist = dist; return o; };

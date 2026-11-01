import * as THREE from 'three';
import { GUNS, STEP } from '../sim/tables.js';
import { smooth, lerp, wrapPi, headingOf, clamp01 } from './anim.js';
import { CREW_GAITS } from '../models/v/crew.js';
import { paced, pacedT, turn, along, pathLen } from './drill_pace.js';

// The WW2 German guns' crews for crews.js (DESIGN.md "WW2 mode"). The field howitzers and the Mörserlafette pair
// reuse the British behaviours (crews.js): the leFH 18 and sFH 18 drill is the 6-inch's (one man brings the shell,
// one the brass case, the rammer and the loader at the sliding block), the K 18 / Mrs 18 the 9.2-inch's (two men
// carry the shell to the tray on the loading platform, a rammer pair, the cartridge man from the crates).
//
// The Nebelwerfer 41 has its own drill, written here as behaviours GunCrew calls through DE_ACT and DE_PROPS:
//   open    the loader opens the tubes' rear latches
//   shell   (30 s) two rocket carriers bring the six rockets one at a time from the crates (alternating trips,
//           each about 7.5 s from 3.6 s into the step, the time the carriers need to be back from cover after the
//           last ripple: pick up, walk, line it up behind its tube from the right of its line and walk it home,
//           walk back); the loader, by the tubes' left rear corner, feeds each one in at the rear plate and drops the
//           latch over it. The rig shows the rockets as they go in (rig.setRounds, nbwRounds()).
//   prime   the loader connects the igniter leads, tube by tube; the carriers, done, walk off to the slit trench
//   lay     the layer at the sight
//   cover   the layer and the loader run to the slit trench by the firer (rig.anchors.cover) and crouch
// They stay in cover through the ripple (piece.ripple, state 'ready' and 'recoil') and run back after it, at a steady
// run whatever the distance (drill_pace.js), turning into their places instead of snapping round.
// Everything stays a pure function of the job, the time since the shot and the piece's ripple record.

export const ROLES_DE = {
  lefh18: { officer: 'cmd', layer: 'lay', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan' },
  sfh18: { officer: 'cmd', layer: 'lay', sight: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan' },
  k18: { officer: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'pair0', loader2: 'pair1', rammer1: 'ram', rammer2: 'ram', ammo1: 'idle', ammo2: 'bag' },
  mrs18: { officer: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'pair0', loader2: 'pair1', rammer1: 'ram', rammer2: 'ram', ammo1: 'idle', ammo2: 'bag' },
  nbw41: { firer: 'nbFirer', layer: 'nbLayer', loader: 'nbLoader', rocket0: 'nbRocket', rocket1: 'nbRocket' },
};
// kinds drilled like the British light guns: the shell and cartridge men turn with the gun's traverse, no
// rammer staff for the cartridge, the loader alone swings the block
export const LIGHT_DE = new Set(['lefh18', 'sfh18', 'nbw41']);
// roles that stay in the world frame (the Nebelwerfer's cover is 12 m away: it must not swing with the traverse)
export const WORLD_DE = { nbw41: new Set(['firer', 'rocket0', 'rocket1']) };
export const STAFF_DE = { lefh18: 1.7, sfh18: 2.1, k18: 2.9, mrs18: 2.9, nbw41: 1.2 };

// ---------------------------------------------------------------- the Nebelwerfer

const OFF = 0.12, SLOT = (1 - OFF) / 7, TRIP = 2 * SLOT; // rocket i's trip starts at OFF + i * SLOT of the 'shell' step and lasts TRIP
const IN = 0.72; // share of a trip at which the rocket is home in its tube
const RIPPLE_END = 0.18; // the sim's recoil kick before the run out (sim/guns.js), after the last rocket

// Rockets in the tubes for the piece's state (0..n): empty after the ripple, filled one by one in the 'shell' step,
// full from then until the ripple, which empties them in its order. The render layer may call it for rig.setRounds.
export function nbwRounds(p, alpha = 0, kStep = null) {
  const g = GUNS[p.kind] ?? GUNS.nbw41, n = p.tubes ?? g.salvo?.n ?? 6;
  if (p.state === 'dead') return 0;
  if (p.ripple) return Math.max(0, n - p.ripple.i);
  const j = p.job;
  if (j) {
    if (j.step === 'open') return 0;
    if (j.step === 'shell') {
      const k = kStep ?? clamp01((j.t + alpha * STEP) / Math.max(0.01, j.dur));
      let c = 0;
      for (let i = 0; i < 6; i++) if (k >= OFF + i * SLOT + IN * TRIP) c++;
      return Math.min(n, c);
    }
    return p.loaded || j.i > 0 ? n : 0;
  }
  return p.loaded ? n : 0;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 }, _q = { x: 0, z: 0 };

// per-frame shared state: tube rear points (root space), the carriers' trips, the cover/return progress
function frame(crew, c) {
  const F = crew.nb ??= {
    c: null, rear: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()), rk: [new THREE.Vector3(), new THREE.Vector3()],
    hand: { x: 0, z: 0 }, stack: { x: 0, z: 0 }, stacks: [{ x: 0, z: 0 }, { x: 0, z: 0 }], cover: null, loaded: 0,
  };
  if (F.c === c) return F;
  F.c = c;
  const rig = crew.rig;
  _inv.copy(rig.root.matrixWorld).invert();
  const tubes = rig.anchors.tubes;
  for (let i = 0; i < 6; i++) {
    const o = tubes?.[i];
    if (o) o.getWorldPosition(F.rear[i]).applyMatrix4(_inv); else F.rear[i].copy(crew.B);
  }
  // the carriers hand the rocket in from the right of the cluster's rear, a step behind it
  F.hand.x = crew.B.x - crew.bd.x * 0.95 + crew.rt.x * 0.8;
  F.hand.z = crew.B.z - crew.bd.z * 0.95 + crew.rt.z * 0.8;
  F.stack.x = crew.S.x - 0.55; F.stack.z = crew.S.z + 0.3;
  if (!F.staged) {
    // Both waiting marks are clear of the ammunition boxes and the handoff lane.
    F.stacks.forEach((s, i) => {
      crew.field.blk.length = 0;
      crew.field.snap('work', crew.l0, crew.S.x - 0.85, crew.S.z + 0.3 + i * 0.9, 0.35, s, true);
      const m = crew.byRole.get('rocket' + i);
      if (m) { m.sx = s.x; m.sz = s.z; }
    });
    F.staged = true;
  }
  F.cover = rig.anchors.cover ?? null;
  // cover: going (seconds since the step that sends a man off began: prime for the carriers, cover for the layer and
  // the loader; tGo), in it (loaded and waiting, the ripple: inside), coming back (seconds since the ripple ended: tBack)
  const p = c.p, g = GUNS[p.kind], j = p.job;
  F.inside = !!(p.ripple || c.st === 'ready' || c.st === 'recoil' || (p.loaded && !j));
  F.tPrime = -1; F.tCover = -1; F.tBack = Infinity;
  if (j && (c.s === 'prime' || c.s === 'lay' || c.s === 'cover')) {
    // the earlier steps' lengths from the table, scaled as this step is (crew upgrades shorten them all alike)
    const L = g.load, dur = (st) => L.find((q) => q.step === st)?.dur ?? 0, sc = j.dur / Math.max(0.01, dur(c.s));
    const into = c.k * j.dur;
    F.tPrime = c.s === 'prime' ? into : c.s === 'lay' ? dur('prime') * sc + into : (dur('prime') + dur('lay')) * sc + into;
    if (c.s === 'cover') { F.tCover = into; F.coverDur = j.dur; }
  } else if (!F.inside && p.firedAt > 0) {
    const n = p.tubes ?? g.salvo?.n ?? 6, tEnd = p.firedAt + (n - 1) * (g.salvo?.dt ?? 0) + RIPPLE_END + (g.runout ?? 1);
    F.tBack = c.now - tEnd;
  }
  return F;
}

const RUN = 2.9, RSTRIDE = CREW_GAITS.run.stride, WSTRIDE = CREW_GAITS.walk.stride, WALKV = 1.45;
const CROUCH_H = -Math.PI / 2; // in the slit trench, facing the launcher over the parapet
const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }], _P = { x: 0, z: 0, h: 0, d: 0, len: 0 };

// a point of the launcher's traverse frame in the root frame
function trav(crew, x, z, out) {
  const dx = x - crew.pvx, dz = z - crew.pvz;
  out.x = dx * crew.ca + dz * crew.sa + crew.pvx; out.z = -dx * crew.sa + dz * crew.ca + crew.pvz;
  return out;
}

// Going to, staying in or coming back from cover; true when it has placed the man. dest/destH: his place and heading
// at the launcher; via: a waypoint (traverse frame) round the trail; early: he walks off when the priming begins (the
// carriers, done with the rockets) instead of running when the cover step begins.
function inCover(crew, m, c, slot, dest, destH, via, early) {
  const F = frame(crew, c);
  if (!F.cover) return false;
  const cv = F.cover[Math.min(slot, F.cover.length - 1)];
  const going = F.inside || (early ? F.tPrime >= 0 : F.tCover >= 0);
  if (!going && !(F.tBack < Infinity)) return false;
  if (F.inside || (!going && F.tBack < 0)) { m.put(cv.x, 0, cv.z, CROUCH_H, 'crouch', crew.idleT + m.seed); return true; }
  let n = 2;
  _path[0].x = dest.x; _path[0].z = dest.z;
  if (via) { trav(crew, via[0], via[1], _path[1]); n = 3; }
  _path[n - 1].x = cv.x; _path[n - 1].z = cv.z;
  const len = pathLen(_path, n);
  if (going) {
    let e, tA, gait, stride;
    if (early) {
      e = pacedT(F.tPrime, len, WALKV, 0.3); tA = F.tPrime - (len / WALKV + 0.3); gait = 'walk'; stride = WSTRIDE;
    } else {
      const D = F.coverDur, tw = Math.min(0.86 * D, len / RUN + 0.45);
      e = paced(F.tCover / D, 0, 0.86, D, len, RUN, 0.45); tA = F.tCover - tw; gait = 'run'; stride = RSTRIDE;
    }
    if (e < 1) { along(_path, n, e, _P, destH, null); m.put(_P.x, 0, _P.z, _P.h, gait, _P.d / stride); return true; }
    // there: he turns round to face the launcher, then gets down
    along(_path, n, 1, _P);
    const w = clamp01(tA / 0.5);
    m.put(cv.x, 0, cv.z, turn(_P.h, CROUCH_H, w), w < 1 ? 'stand' : 'crouch', crew.idleT + m.seed);
    return true;
  }
  // back after the ripple: up and turned to the way (0.5 s), the run, then into his place facing his work
  const tb = F.tBack;
  for (let i = 0, j = n - 1; i < j; i++, j--) { const tx = _path[i].x, tz = _path[i].z; _path[i].x = _path[j].x; _path[i].z = _path[j].z; _path[j].x = tx; _path[j].z = tz; }
  const e = pacedT(tb - 0.5, len, RUN, 0.45);
  if (e >= 1) return false;
  along(_path, n, e, _P, null, destH);
  if (tb < 0.5) m.put(cv.x, 0, cv.z, turn(CROUCH_H, _P.h, tb / 0.5), 'stand', crew.idleT + m.seed);
  else m.put(_P.x, 0, _P.z, _P.h, 'run', _P.d / RSTRIDE);
  return true;
}

function homeXZ(h, out) { out.x = h.x; out.z = h.z; return out; }

// the NCO at the firing box in the slit trench: he never leaves it
function nbFirer(crew, m, c, h) {
  m.noEars = true;
  const F = frame(crew, c);
  const busy = c.s === 'prime' || c.s === 'cover' || F.inside;
  h.x = m.spot.x; h.z = m.spot.z; // (the rig's spot behind the box: the clearance field moved him out of reach of it)
  m.put(h.x, h.y, h.z, h.h, busy ? 'crouch' : 'stand', crew.idleT + m.seed);
  // his right hand on the firing box's key (models/v/de/nbw41.js: on a sandbag in front of him)
  if (busy) m.hand('R', h.x - Math.sin(h.h) * 0.44, 0.43, h.z - Math.cos(h.h) * 0.44, 1);
}

function nbLayer(crew, m, c, h) {
  m.noEars = true;
  if (inCover(crew, m, c, 0, homeXZ(h, _q), h.h, null, false)) return;
  const p = c.p, moving = c.s === 'lay' || Math.abs(p.cmd.az - p.az) > 3e-4 || Math.abs(p.cmd.el - p.el) > 3e-4;
  m.put(h.x, h.y, h.z, h.h, moving ? 'lay' : 'stand', moving ? (p.az + p.el) * 30 : crew.idleT + m.seed);
}

// the loader at his place behind the tubes, between the trail legs: out to cover by the gap between the spades
const LOADER_VIA = [-0.1, 2.95], ROCKET_VIA = [0.2, 3.1];
const _hs = { x: 0, z: 0 }, _he = { x: 0, z: 0 };
function nbLoader(crew, m, c, h) {
  m.noEars = true;
  // his place is the rig's spot (between the trail legs, a step behind the rear plate), not the clearance field's
  // snapped one: the field keeps a standing man 0.3 m clear of the legs and pushed him back out of reach of the tubes
  m.sx = m.spot.x; m.sz = m.spot.z; // (the carriers' routes keep clear of where he really stands)
  trav(crew, m.spot.x, m.spot.z, h);
  const face = headingOf(crew.B.x - h.x, crew.B.z - h.z);
  if (inCover(crew, m, c, 2, homeXZ(h, _q), face, LOADER_VIA, false)) return;
  const F = frame(crew, c), s = c.s, k = c.k, order = crew.rig.loadOrder;
  let busy = false;
  if (s === 'open' || s === 'prime') {
    // the latches opened (open), then the igniter leads clipped on (prime), tube by tube
    const j = Math.min(5, Math.floor(k * 6)), r = F.rear[j], phase = Math.min(0.999, k * 6 % 1);
    const w = s === 'open' ? smooth(phase, 0.05, 0.2) * (1 - smooth(phase, 0.72, 0.95)) : smooth(phase, 0.08, 0.25) * (1 - smooth(phase, 0.7, 0.95));
    busy = true;
    m.put(h.x, h.y, h.z, face, 'operate', crew.idleT + m.seed);
    m.hand('R', r.x, r.y + (s === 'open' ? 0.06 : 0.08), r.z + (s === 'open' ? 0 : 0.02), w);
  } else if (s === 'shell') {
    // the rocket coming in: both hands feed it into the tube at the rear plate as the carrier walks it home, then the
    // right hand drops the latch over its base
    for (let i = 0; i < 6; i++) {
      const u = (k - OFF - i * SLOT) / TRIP;
      if (u < 0.5 || u > 0.82) continue;
      const r = F.rear[order ? 5 - i : i] ?? F.rear[0];
      const feed = smooth(u, 0.5, 0.56) * (1 - smooth(u, 0.68, 0.73)), latch = smooth(u, 0.71, 0.75) * (1 - smooth(u, 0.78, 0.82));
      _v.copy(r).addScaledVector(crew.u, -0.1);
      busy = true;
      m.put(h.x, h.y, h.z, face, 'operate', crew.idleT + m.seed);
      m.hand('L', _v.x - crew.rt.x * 0.07, _v.y + 0.03, _v.z - crew.rt.z * 0.07, feed);
      m.hand('R', _v.x + crew.rt.x * 0.07, _v.y + 0.03, _v.z + crew.rt.z * 0.07, feed);
      if (latch > 0.01) m.hand('R', r.x, r.y + 0.07, r.z, latch);
      break;
    }
  }
  if (!busy) m.put(h.x, h.y, h.z, face, 'stand', crew.idleT + m.seed);
}

// a rocket carrier: trips from the crates to the launcher's rear (his own props: crew.shellA / shellB)
function nbRocket(crew, m, c, h) {
  m.noEars = true;
  const F = frame(crew, c), ci = m.role === 'rocket1' ? 1 : 0, prop = ci ? crew.shellB : crew.shellA;
  prop.visible = false;
  const stack = F.stacks[ci];
  const S = crew.S, faceStack = headingOf(S.x - stack.x, S.z - stack.z);
  // (out to cover behind the spades, clear of the trail)
  if (inCover(crew, m, c, 3 + ci, stack, faceStack, ROCKET_VIA, true)) return;
  const rig = crew.rig, s = c.s, k = c.k, L = crew.slen;
  let trip = -1, u = 0;
  if (s === 'shell') for (let i = ci; i < 6; i += 2) { const uu = (k - OFF - i * SLOT) / TRIP; if (uu >= 0 && uu < 1) { trip = i; u = uu; } }
  if (trip < 0) {
    // waiting at the crates (before the first trip, between and after the loading), facing them
    m.put(stack.x, 0, stack.z, faceStack, 'stand', crew.idleT + m.seed);
    return;
  }
  const goP = crew.plan(m, 'nbgo', crew.l0, stack.x, stack.z, F.hand.x - crew.rt.x * 0.65 - crew.bd.x * 0.6, F.hand.z - crew.rt.z * 0.65 - crew.bd.z * 0.6, 0.45, false, false, 'work', 0.28, { x: F.hand.x, z: F.hand.z });
  const backP = crew.plan(m, 'nbback', crew.l0, F.hand.x, F.hand.z, stack.x, stack.z, 0.3, false, false, 'work', 0.28,
    { x: F.hand.x + crew.rt.x * 1.05 - crew.bd.x * 0.45, z: F.hand.z + crew.rt.z * 1.05 - crew.bd.z * 0.45, head: true });
  const tube = F.rear[rig.loadOrder ? 5 - trip : trip] ?? F.rear[0];
  let have = true, pose = 'carry';
  const faceTube = headingOf(tube.x - F.hand.x, tube.z - F.hand.z);
  const lift = smooth(u, 0.025, 0.16);
  // the walks at an even pace (drill_pace.js): out with the rocket, arriving as the window closes, back at a walk
  const tripS = TRIP * (c.p.job?.dur ?? 30);
  if (u < 0.16) { m.put(stack.x, 0, stack.z, faceStack, 'lift', lift); pose = 'lift'; }
  else if (u < 0.44) m.follow(goP, paced(u, 0.16, 0.44, tripS, goP.len, 1.25, 0.35, true), 0, 'carryWalk', faceStack, faceTube);
  else if (u < 0.76) {
    // At the tube: a step in beside its line (Hs), the push home walking it in (He), a step back to where the walk
    // back starts (F.hand). He stands to the right of the rocket's line, so the loader feeding it in at the rear
    // plate and the rocket itself are never in his way.
    const hs = _hs, he = _he, ox = crew.bd.x, oz = crew.bd.z;
    hs.x = tube.x + crew.rt.x * 0.5 - ox * 0.98; hs.z = tube.z + crew.rt.z * 0.5 - oz * 0.98;
    he.x = tube.x + crew.rt.x * 0.44 - ox * 0.5; he.z = tube.z + crew.rt.z * 0.44 - oz * 0.5;
    let x, z, mv = 0, d = 0;
    if (u < 0.5) { const e = smooth(u, 0.44, 0.5); x = lerp(F.hand.x, hs.x, e); z = lerp(F.hand.z, hs.z, e); d = Math.hypot(hs.x - F.hand.x, hs.z - F.hand.z); mv = e > 0 && e < 1 ? d * e : 0; }
    else if (u < 0.7) { const e = smooth(u, 0.54, 0.7); x = lerp(hs.x, he.x, e); z = lerp(hs.z, he.z, e); d = Math.hypot(he.x - hs.x, he.z - hs.z); mv = e > 0 && e < 1 ? d * e : 0; }
    else { const e = smooth(u, 0.7, 0.76); x = lerp(he.x, F.hand.x, e); z = lerp(he.z, F.hand.z, e); d = Math.hypot(F.hand.x - he.x, F.hand.z - he.z); mv = e > 0 && e < 1 ? -d * e : 0; }
    // facing the rear plate all the while (the step back is walked backwards)
    m.put(x, 0, z, headingOf(tube.x - x, tube.z - z), mv ? 'carryWalk' : u < 0.66 ? 'carry' : 'stand', mv ? mv / CREW_GAITS.carryWalk.stride : crew.idleT + m.seed);
    have = u < IN;
  } else { m.follow(backP, paced(u, 0.76, 1, tripS, backP.len, 1.4, 0.35), 0, 'walk', faceTube, faceStack); have = false; }
  if (!have) return;
  // the rocket: from the crate into his arms, carried across the body, lined up behind the tube, pushed in
  const fx = -Math.sin(m.h), fz = -Math.cos(m.h);
  let cx = m.x + fx * 0.42, cy = 1.07, cz = m.z + fz * 0.42, yaw = m.h - Math.PI / 2, pitch = 0, inT = 0;
  if (pose === 'lift') {
    cx = m.x + fx * lerp(0.48, 0.42, lift); cy = lerp(0.45, 1.07, lift); cz = m.z + fz * lerp(0.48, 0.42, lift);
  } else if (u >= 0.44) {
    const e1 = smooth(u, 0.44, 0.54), e2 = smooth(u, 0.54, 0.7);
    const back = (L / 2 + 0.05) - e2 * (L + 0.08);
    _w.copy(tube).addScaledVector(crew.u, -back);
    cx = lerp(cx, _w.x, e1); cy = lerp(cy, _w.y, e1); cz = lerp(cz, _w.z, e1);
    yaw += wrapPi(crew.az - yaw) * e1;
    pitch = Math.asin(crew.u.y) * e1;
    inT = e1 >= 1 ? e2 : 0;
  }
  _v.set(cx, cy, cz);
  crew.placeProp(prop, _v, yaw, pitch, true);
  if (u < 0.66) {
    const nx = -Math.sin(yaw) * Math.cos(pitch), ny = Math.sin(pitch), nz = -Math.cos(yaw) * Math.cos(pitch);
    const grip = smooth(u, 0, 0.025) * (1 - smooth(u, 0.6, 0.66));
    // carried by both ends; once lined up the hands go to its rear half (the front goes into the tube) and push the base
    const a0 = lerp(-0.28, -0.46, inT) * L, a1 = lerp(0.28, -0.12, Math.min(1, inT * 1.6)) * L, dy = -crew.srad * 0.9 * (1 - inT * 0.6);
    m.hand('L', cx + nx * a0, cy + ny * a0 + dy, cz + nz * a0, grip);
    m.hand('R', cx + nx * a1, cy + ny * a1 + dy, cz + nz * a1, grip);
  }
}

// props for the Nebelwerfer: no staff, bag or lanyard; the rockets in the tubes follow the drill
function nbProps(crew, c) {
  for (const o of [crew.staff, crew.bag, crew.rope]) o.visible = false;
  crew.rig.setRounds?.(nbwRounds(c.p, 0, c.s === 'shell' ? c.k : null)); // c.k carries the frame's interpolation
}

export const DE_ACT = { nbFirer, nbLayer, nbLoader, nbRocket };
export const DE_PROPS = { nbw41: nbProps };

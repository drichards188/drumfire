import * as THREE from 'three';
import { GUNS, STEP } from '../sim/tables.js';
import { smooth, lerp, wrapPi, headingOf, clamp01 } from './anim.js';

// The WW2 German guns' crews for crews.js (DESIGN.md "WW2 mode"). The field howitzers and the Mörserlafette pair
// reuse the British behaviours (crews.js): the leFH 18 and sFH 18 drill is the 6-inch's (one man brings the shell,
// one the brass case, the rammer and the loader at the sliding block), the K 18 / Mrs 18 the 9.2-inch's (two men
// carry the shell to the tray on the loading platform, a rammer pair, the cartridge man from the crates).
//
// The Nebelwerfer 41 has its own drill, written here as behaviours GunCrew calls through DE_ACT and DE_PROPS:
//   open    the loader opens the tubes' rear latches
//   shell   (30 s) two rocket carriers bring the six rockets one at a time from the crates (alternating trips,
//           each about 8.6 s: pick up, walk, hand it in at the rear of the tube, walk back); the loader pushes each
//           one home. The rig shows the rockets as they go in (rig.setRounds, from nbwRounds()).
//   prime   the loader connects the igniter leads, tube by tube
//   lay     the layer at the sight
//   cover   everyone runs to the slit trench by the firer (rig.anchors.cover) and crouches
// They stay in cover through the ripple (piece.ripple, state 'ready' and 'recoil') and walk back after it.
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

const SLOT = 1 / 7, TRIP = 2 / 7; // rocket i's trip starts at i * SLOT of the 'shell' step and lasts TRIP
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
      for (let i = 0; i < 6; i++) if (k >= i * SLOT + IN * TRIP) c++;
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
    hand: { x: 0, z: 0 }, stack: { x: 0, z: 0 }, stacks: [{ x: 0, z: 0 }, { x: 0, z: 0 }], cover: null, ins: -1, insE: 0, loaded: 0,
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
  // cover: going (the 'cover' step), in it (loaded and waiting, the ripple), coming back (after the ripple)
  const p = c.p, g = GUNS[p.kind];
  let go = 0, back = 1;
  if (c.s === 'cover') go = smooth(c.k, 0, 0.7);
  else if (p.ripple || c.st === 'ready' || c.st === 'recoil' || (p.loaded && !p.job)) go = 1;
  else if (p.firedAt > 0) {
    const n = p.tubes ?? g.salvo?.n ?? 6, tEnd = p.firedAt + (n - 1) * (g.salvo?.dt ?? 0) + RIPPLE_END + (g.runout ?? 1);
    back = clamp01((c.now - tEnd) / 3.5);
  }
  F.go = go; F.back = back;
  // which rocket is being pushed home (for the loader's hands), its progress
  F.ins = -1; F.insE = 0;
  if (c.s === 'shell') for (let i = 0; i < 6; i++) {
    const u = (c.k - i * SLOT) / TRIP;
    if (u >= 0.44 && u < IN) { F.ins = i; F.insE = smooth(u, 0.54, 0.7); }
  }
  return F;
}

// a walk through straight legs (root space points), k of the whole way
function walkPath(m, pts, n, k, gait = 'walk') {
  let tot = 0;
  for (let i = 0; i < n - 1; i++) tot += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  let d = clamp01(k) * tot;
  for (let i = 0; i < n - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    if (d <= l || i === n - 2) { m.walk(pts[i], pts[i + 1], l > 0 ? d / l : 1, 0, gait); return; }
    d -= l;
  }
}

const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
// handle going to / staying in / coming back from cover; true when it has placed the man
function inCover(crew, m, c, h, slot, dest) {
  const F = frame(crew, c);
  if (!F.cover || (F.go <= 0 && F.back >= 1)) return false;
  const cv = F.cover[Math.min(slot, F.cover.length - 1)];
  const from = F.go > 0 ? dest : cv, to = F.go > 0 ? cv : dest, k = F.go > 0 ? F.go : F.back;
  if (k >= 1 && F.go > 0) {
    m.put(cv.x, 0, cv.z, -Math.PI / 2, 'crouch', crew.idleT + m.seed);
    return true;
  }
  // the men at the launcher go round behind the trail legs
  _path[0].x = from.x; _path[0].z = from.z;
  let n = 2;
  if (!m.world) {
    const wx = Math.min(dest.x, -1.3), wz = Math.max(dest.z + 0.4, 2.3);
    if (F.go > 0) { _path[1].x = wx; _path[1].z = wz; _path[2].x = to.x; _path[2].z = to.z; n = 3; } else { _path[1].x = wx; _path[1].z = wz; _path[2].x = to.x; _path[2].z = to.z; n = 3; }
  } else { _path[1].x = to.x; _path[1].z = to.z; }
  walkPath(m, _path, n, k, 'walk');
  return true;
}

function homeXZ(h, out) { out.x = h.x; out.z = h.z; return out; }

// the NCO at the firing box in the slit trench: he never leaves it
function nbFirer(crew, m, c, h) {
  m.noEars = true;
  const F = frame(crew, c);
  const busy = c.s === 'prime' || c.s === 'cover' || F.go > 0;
  m.put(h.x, h.y, h.z, h.h, busy ? 'crouch' : 'stand', crew.idleT + m.seed);
  if (busy) m.hand('R', h.x - Math.sin(h.h) * 0.36, 0.17, h.z - Math.cos(h.h) * 0.36, 1);
}

function nbLayer(crew, m, c, h) {
  m.noEars = true;
  if (inCover(crew, m, c, h, 0, homeXZ(h, _q))) return;
  const p = c.p, moving = c.s === 'lay' || Math.abs(p.cmd.az - p.az) > 3e-4 || Math.abs(p.cmd.el - p.el) > 3e-4;
  m.put(h.x, h.y, h.z, h.h, moving ? 'lay' : 'stand', moving ? (p.az + p.el) * 30 : crew.idleT + m.seed);
}

function nbLoader(crew, m, c, h) {
  m.noEars = true;
  if (inCover(crew, m, c, h, 2, homeXZ(h, _q))) return;
  const F = frame(crew, c), s = c.s, k = c.k;
  m.put(h.x, h.y, h.z, headingOf(crew.B.x - h.x, crew.B.z - h.z), s === 'shell' && F.ins >= 0 ? 'ramLoad' : 'stand', s === 'shell' && F.ins >= 0 ? F.insE : crew.idleT + m.seed);
  if (s === 'open') {
    const r = F.rear[Math.min(5, Math.floor(k * 6))];
    const phase = Math.min(0.999, k * 6 % 1);
    m.hand('R', r.x, r.y + 0.06, r.z, smooth(phase, 0.05, 0.2) * (1 - smooth(phase, 0.72, 0.95)));
  } else if (s === 'prime') {
    // the igniter lead clipped to each tube in turn
    const j = Math.min(5, Math.floor(k * 6)), r = F.rear[j];
    const phase = Math.min(0.999, k * 6 % 1);
    m.hand('R', r.x, r.y + 0.08, r.z + 0.02, smooth(phase, 0.08, 0.25) * (1 - smooth(phase, 0.7, 0.95)));
  } else if (s === 'shell' && F.ins >= 0) {
    // both hands on the base of the rocket going in: push it home
    const r = F.rear[crew.rig.loadOrder ? 5 - F.ins : F.ins] ?? F.rear[0];
    const L = crew.slen, back = (L + 0.05) * (1 - F.insE) - 0.03;
    _v.copy(r).addScaledVector(crew.u, -back);
    const grip = smooth((k - F.ins * SLOT) / TRIP, 0.46, 0.54);
    m.hand('R', _v.x + crew.rt.x * 0.06, _v.y, _v.z + crew.rt.z * 0.06, grip);
    m.hand('L', _v.x - crew.rt.x * 0.06, _v.y, _v.z - crew.rt.z * 0.06, grip);
  }
}

// a rocket carrier: trips from the crates to the launcher's rear (his own props: crew.shellA / shellB)
function nbRocket(crew, m, c, h) {
  m.noEars = true;
  const F = frame(crew, c), ci = m.role === 'rocket1' ? 1 : 0, prop = ci ? crew.shellB : crew.shellA;
  prop.visible = false;
  const stack = F.stacks[ci];
  if (inCover(crew, m, c, h, 3 + ci, stack)) return;
  const rig = crew.rig, s = c.s, k = c.k, L = crew.slen;
  let trip = -1, u = 0;
  if (s === 'shell') for (let i = ci; i < 6; i += 2) { const uu = (k - i * SLOT) / TRIP; if (uu >= 0 && uu < 1) { trip = i; u = uu; } }
  const S = crew.S, faceStack = headingOf(S.x - stack.x, S.z - stack.z);
  if (trip < 0) {
    // waiting at the crates (before the first trip, between and after the loading)
    m.put(stack.x, 0, stack.z, s === 'shell' || s === 'open' ? faceStack : headingOf(crew.B.x - stack.x, crew.B.z - stack.z), 'stand', crew.idleT + m.seed);
    return;
  }
  const goP = crew.plan(m, 'nbgo', crew.l0, stack.x, stack.z, F.hand.x - crew.rt.x * 0.65 - crew.bd.x * 0.6, F.hand.z - crew.rt.z * 0.65 - crew.bd.z * 0.6, 0.45, false, false, 'work', 0.28, { x: F.hand.x, z: F.hand.z });
  const backP = crew.plan(m, 'nbback', crew.l0, F.hand.x, F.hand.z, stack.x, stack.z, 0.3, false, false, 'work', 0.28,
    { x: F.hand.x + crew.rt.x * 1.05 - crew.bd.x * 0.45, z: F.hand.z + crew.rt.z * 1.05 - crew.bd.z * 0.45, head: true });
  const tube = F.rear[rig.loadOrder ? 5 - trip : trip] ?? F.rear[0];
  let have = true, pose = 'carry';
  const faceTube = headingOf(tube.x - F.hand.x, tube.z - F.hand.z);
  const lift = smooth(u, 0.025, 0.16);
  if (u < 0.16) { m.put(stack.x, 0, stack.z, faceStack, 'lift', lift); pose = 'lift'; }
  else if (u < 0.44) m.follow(goP, smooth(u, 0.16, 0.44), 0, 'carryWalk', faceStack, faceTube);
  else if (u < 0.76) { m.put(F.hand.x, 0, F.hand.z, faceTube, u < 0.61 ? 'carry' : 'stand', 0); have = u < IN; }
  else { m.follow(backP, smooth(u, 0.76, 1), 0, 'walk', faceTube, faceStack); have = false; }
  if (!have) return;
  // the rocket: from the crate into his arms, carried across the body, lined up behind the tube, pushed in
  const fx = -Math.sin(m.h), fz = -Math.cos(m.h);
  let cx = m.x + fx * 0.42, cy = 1.07, cz = m.z + fz * 0.42, yaw = m.h - Math.PI / 2, pitch = 0;
  if (pose === 'lift') {
    cx = m.x + fx * lerp(0.48, 0.42, lift); cy = lerp(0.45, 1.07, lift); cz = m.z + fz * lerp(0.48, 0.42, lift);
  } else if (u >= 0.44) {
    const e1 = smooth(u, 0.44, 0.54), e2 = smooth(u, 0.54, 0.7);
    const back = (L / 2 + 0.05) - e2 * (L + 0.08);
    _w.copy(tube).addScaledVector(crew.u, -back);
    cx = lerp(cx, _w.x, e1); cy = lerp(cy, _w.y, e1); cz = lerp(cz, _w.z, e1);
    yaw += wrapPi(crew.az - yaw) * e1;
    pitch = Math.asin(crew.u.y) * e1;
  }
  _v.set(cx, cy, cz);
  crew.placeProp(prop, _v, yaw, pitch, true);
  if (u < 0.62) {
    const nx = -Math.sin(yaw) * Math.cos(pitch), ny = Math.sin(pitch), nz = -Math.cos(yaw) * Math.cos(pitch);
    const grip = smooth(u, 0, 0.025) * (1 - smooth(u, 0.54, 0.62));
    for (const [side, sg] of [['L', -1], ['R', 1]]) m.hand(side, cx + nx * L * 0.28 * sg, cy + ny * L * 0.28 * sg - crew.srad * 0.9, cz + nz * L * 0.28 * sg, grip);
  }
}

// props for the Nebelwerfer: no staff, bag or lanyard; the rockets in the tubes follow the drill
function nbProps(crew, c) {
  for (const o of [crew.staff, crew.bag, crew.rope]) o.visible = false;
  crew.rig.setRounds?.(nbwRounds(c.p, 0, c.s === 'shell' ? c.k : null)); // c.k carries the frame's interpolation
}

export const DE_ACT = { nbFirer, nbLayer, nbLoader, nbRocket };
export const DE_PROPS = { nbw41: nbProps };

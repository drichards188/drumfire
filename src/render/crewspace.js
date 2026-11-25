import { smooth, wrapPi, headingOf } from './anim.js';
import { CREW_GAITS } from '../models/v/crew.js';

// The spaced drill (GunCrew.spacing: every German crew; the British crews are parked as they stand, never spaced). The
// drill stays a pure function of the piece's job and its routes stay planned one man at a time; what it puts out is
// then settled so that no man is shown inside another, inside the gun or jumping, his grips lie before him and his
// feet step to the ground he really covers. Ported from the Godot version's drill (DrillSpacing.cs, DrillStance.cs,
// DrillGait.cs, 2026-11-24), where it was measured on the sFH 13, the Mörser 18, the Hummel and Bertha.
//
// Spacing (spacePut from Man.put, spaceStep after every man has been put):
// - Each man is a capsule in plan along his heading, sized by his pose (a stride, the load carried, the elbows out with
//   the hands on the ears). After every man has been put, the overlaps are pushed apart where the men will stand next
//   frame (this frame's place moved on by this frame's step). A man at his work (the staff in his hands counts, walking
//   or not) hardly gives way; a man standing gives way to one at work, a walker to anyone standing, going round him.
//   Of two walkers the one with the lesser right of way gives way (a pair with its shell, then a man with a load, then
//   the pair going back, then a man walking; of equals, the one walking into the other): he waits, held back along his
//   own way until the other has passed, or, meeting him head on, steps aside to the side away from the steel. A walker
//   is also pushed out of the steel (the crew field's clearance) to 22 cm; on a walk the drill names the ends of (way),
//   never further than 15 cm or the ends are, and not at all on one that ends in what the field counts as steel (onto
//   the gun); not while he steps up or down. A man not walking is never pushed nearer the steel than a body may stand
//   or than his own place is. The result is the man's sep for the next frame: a walker's lasts while the push lasts,
//   then runs out over a third of a second (a man stopped at his place gets back to it at once). The drill's clock is
//   never touched: a man held back is at most SEP_MAX behind his place.
// - off takes up a change of place faster than a run or of heading faster than a quick turn between two frames, and
//   anything that would still carry him faster than V_MAX or W_MAX; it then runs out at a walk's pace: a jump becomes
//   a short slide or turn.
// - The two men of a pair carry one shell between them: they are moved as one, kept their carrying width apart, and a
//   little wider while they crouch to lift it from the stack.
// Hands and stance (Man.hand only asks; hands() after the man's drill for the frame):
// - Of two asked grips the right hand takes the one further round to his right, as seen from above: arms do not cross.
//   Kept until the grips are clearly the other way round, and not changed back within half a second.
// - The stance: a hand's grip should lie between a little across his middle and out towards its own side (two hands
//   at work: well before him; one hand alone, a staff stood by him: anywhere on its side), not behind him; nearer than
//   his own trunk he stands back from it, beyond his arm in plan he steps up to it. What is wrong is mended by a turn
//   and a step on his place, never more than H_MAX and S_MAX, no faster than a man shifts his feet, never nearer the
//   steel than he was; it stays while he works and for T_HOLD after, then runs out.
// - A hand goes with its grip while the grip moves as it has been moving. A grip that is suddenly elsewhere (another
//   handle, the staff a heave further down) is a change of grip: the hand lets go over T_OFF, staying where the old
//   grip was, and takes the new hold over T_ON; a weight the drill eases on or off itself the hand follows as it is. A
//   grip beyond his arm is let go by the old drill's measure, as far as it is beyond. (The Godot version also kept a
//   hand that had lost its grip for want of reach off it until the grip had stayed in reach for 0.35 s; here that left
//   the heavy guns' rammers with their hands in the air through the stroke, so it is not ported.)
// Gait (in spacePut):
// - a walking pose's phase advances with the ground the man is really shown to cover along his heading, backwards when
//   he backs (a sidestep's with the ground covered to his side); not moving he stands (with his load, if he carries
//   one) until he moves again; faster than a walk covers he runs; a man walking with his hands free faces the way the
//   drill sends him.
// Everything is in seconds of the drill's clock (sim time), so it is the same at any frame rate and under time
// compression; nothing is allocated per frame. A Man.put called twice in one frame (a drill that tries one behaviour
// and falls back to another) starts again from the frame's first state, so the last call wins.
//
// Where this departs from the Godot version, which was measured on four guns (this game drills about thirty German
// ones, many of them with teams working one staff, handle or roller side by side; tools/crewaudit.mjs measured each
// change on all of them):
// - A man with a hand on something fixed (atWork: a handle, the staff, the gun, not a load in his arms) is at his work
//   whatever his pose: two men at work are not pushed apart (the drill placed them on their handles), he is not turned
//   to face his way nor set running, and only a step faster than V_JUMP_WORK is a jump for him (he goes with what he
//   holds).
// - A hand follows the drill's own eased weight; the hand's times are only for what changes in a frame. A load in his
//   arms is the drill's to time altogether.
// - No lost-grip rule (see above); the stance leaves alone a grip well beyond his arm or behind him.
// - The grips' angle round him is wrapped to a half turn (a grip behind him read as a whole turn off).

const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride, SIDE_STRIDE = CREW_GAITS.sidestep.stride;
const RUN_STRIDE = CREW_GAITS.run.stride, STOOP_STRIDE = CREW_GAITS.stoopWalk.stride;

// off runs out with this time constant, never faster than V_OFF (m/s) and W_OFF (rad/s); a step faster than V_JUMP
// (m/s) or a turn faster than W_JUMP (rad/s) is a jump; what is shown never moves faster than V_MAX or turns faster
// than W_MAX
const TAU_OFF = 0.12, V_OFF = 1.6, W_OFF = 6.0, V_JUMP = 2.8, W_JUMP = 8.0, V_MAX = 3.5, W_MAX = 10;
// (a man at his work goes with what he holds: the railway guns' rammer teams walk the staff back at 3 to 4 m/s, and
// held back as from a jump they were left behind their own hands; only a step faster than these is a jump for him)
const V_JUMP_WORK = 6, V_MAX_WORK = 8;
// sep runs out with this time constant when nothing holds it (a walker's; a man stopped at his place makes it up
// quicker), and is never more than SEP_MAX (m)
const TAU_SEP = 0.35, TAU_SEP_STOP = 0.15, SEP_MAX = 0.9;
// the room kept between two men's capsules (m), a walker's clearance from the steel (m), a pair's lift (m), how near
// the steel a man not walking may be pushed (m)
const MARGIN = 0.03, STEEL_NEED = 0.22, PAIR_LIFT = 0.9, STAND_CLEAR = 0.14;
// a grip may lie this far out to its hand's side (two hands at work; one hand alone) and this far across his middle
// (rad from straight ahead)
const A_OUT = 0.96, A_OUT_ONE = 2.2, A_IN = 0.6;
// the most he turns (at his work; walking with a load that is not the staff) and steps for his grips (rad, m), how fast
// (rad/s, m/s; eased with TAU_ST), how long it stays after the last grip (s); a hand asked with less than STANCE_W does
// not count; what his grips no longer need runs out at W_RELAX and V_RELAX while he works
const H_MAX = 0.9, H_WALK = 0.3, S_MAX = 0.25, W_ST = 1.4, V_ST = 0.3, TAU_ST = 0.12, T_HOLD = 0.6, STANCE_W = 0.3, W_RELAX = 0.35, V_RELAX = 0.08;
// a grip nearer his middle than this (m, in plan, at trunk height) is inside him; one further from it in plan than
// this is a stretch
const D_NEAR = 0.24, D_FAR = 0.75;
// a grip further than this from where it was going has changed (m; plus what a change of speed of A_GRIP m/s2 gives,
// or a speed of V_GRIP m/s while its speed is not known yet)
const J_GRIP = 0.06, A_GRIP = 30, V_GRIP = 3;
// letting go and taking hold (s)
const T_OFF = 0.12, T_ON = 0.16;
// the two grips change hands when they are this far the other way round (rad; at first sight, and after), and not
// again within this time (s)
const UNCROSS_FIRST = 0.09, UNCROSS = 0.21, T_SWAP = 0.5;
// how fast a hand slides along the staff (m/s)
const V_SLIDE = 2.5;
// slower than V_STILL for T_STILL he stands, faster than V_GO he walks (m/s, s); over V_RUN he runs, under V_UNRUN he
// walks again (m/s); faster than V_FACE he faces his way, at W_FACE (m/s, rad/s), by no more than FACE_MAX, and not
// when his way is more than FACE_BACK off his heading (rad): he backs away
const V_STILL = 0.12, V_GO = 0.22, T_STILL = 0.15, V_RUN = 2.3, V_UNRUN = 1.9, V_FACE = 0.5, W_FACE = 3, FACE_MAX = 1.3, FACE_BACK = 1.9;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sq = (v) => v * v;
const walking = (p) => p === 'walk' || p === 'carryWalk' || p === 'sidestep' || p === 'stoopWalk' || p === 'run';
const carrying = (p) => p === 'carry' || p === 'carryWalk' || p === 'carryShoulder' || p === 'lift' || p === 'crouch';
// His hands on something fixed (a handle, a staff, the gun), not on a load he carries: he is at his work, walking or
// not. (The German drills of this game walk whole teams along the staff's cross handles and the rollers: as walkers
// they were pushed off their handles, turned to face their way and set running.)
const atWork = (S) => (S.gripW[0] > 0.5 || S.gripW[1] > 0.5) && !carrying(S.drillPose);
const _home = { x: 0, y: 0, z: 0, h: 0 };
const _seg = { ax: 0, az: 0, bx: 0, bz: 0 };

// A man's spaced state (m.sp): where the drill put him this frame, the offsets laid on that place, his hands and his
// gait. Every field is made here, once.
export class ManSpace {
  constructor() {
    // the drill's own place and heading this frame, before the spacing (root frame, before a railway car's run)
    this.rawX = 0; this.rawY = 0; this.rawZ = 0; this.rawH = 0;
    // sep (clear of the others and the steel) and off (a jump taken up): for this frame, made last frame
    this.sepX = 0; this.sepZ = 0; this.OffX = 0; this.OffY = 0; this.OffZ = 0; this.OffH = 0;
    // off as laid on this frame
    this.offX = 0; this.offY = 0; this.offZ = 0; this.offH = 0;
    this.prevTx = 0; this.prevTy = 0; this.prevTz = 0; this.prevTh = 0; this.pRawX = 0; this.pRawY = 0; this.pRawZ = 0;
    this.spacedAt = NaN; this.track = false;
    // where he was shown last frame and this frame (root frame, before the car's run)
    this.lastX = 0; this.lastY = 0; this.lastZ = 0; this.lastH = 0;
    this.shownX = 0; this.shownY = 0; this.shownZ = 0; this.shownH = 0;
    // the ends of the walk he is on, when the drill names them (root frame), and when he last had the staff in hand
    this.wayAt = NaN; this.wayAx = 0; this.wayAz = 0; this.wayBx = 0; this.wayBz = 0; this.heldAt = NaN;
    // the frame's scratch: next frame's place without the spacing (n), with it (p), his step, his shape in plan
    this.nx = 0; this.nz = 0; this.px = 0; this.pz = 0; this.vx = 0; this.vz = 0;
    this.mob = 0; this.need = 0; this.sr = 0; this.sf = 0; this.sb = 0;
    this.walks = false; this.blocked = false; this.touched = false; this.work = false;
    // what the drill asked of each hand this frame (0 left, 1 right): the grip in the root frame, its weight, when
    this.askX = new Float64Array(2); this.askY = new Float64Array(2); this.askZ = new Float64Array(2); this.askW = new Float64Array(2);
    this.askAt = new Float64Array([NaN, NaN]);
    // the weight the hand wanted last frame (its reach included), to tell an eased weight from one changed in a frame
    this.askW0 = new Float64Array(2);
    // the grip each hand is on (root frame), how firmly (0: off), and its speed
    this.gripX = new Float64Array(2); this.gripY = new Float64Array(2); this.gripZ = new Float64Array(2); this.gripW = new Float64Array(2);
    this.gripVx = new Float64Array(2); this.gripVy = new Float64Array(2); this.gripVz = new Float64Array(2);
    // on a grip; letting go of it for another; its speed known
    this.gripOn = [false, false]; this.gripGo = [false, false]; this.gripVel = [false, false];
    // the two asked grips are given to the other hands; both hands were asked last frame; when they last changed
    this.swapped = false; this.both = false; this.swapAt = -Infinity;
    // the drill gave each hand its grip itself this frame (a wheel's two hands); the wheel's own state
    this.fixedAt = NaN; this.workAt = -Infinity; this.workFirst = false;
    // where along the staff each hand holds it, from its head (m), and when that was
    this.slideZ = new Float64Array(2); this.slideAt = new Float64Array([NaN, NaN]);
    // the stance: a step and a turn on his place, for the next frame (St) and as laid on this frame's (st)
    this.StX = 0; this.StZ = 0; this.StH = 0; this.stX = 0; this.stZ = 0; this.stH = 0; this.stanceAt = -Infinity;
    // the gait: the pose the drill asked this frame (the spacing goes by it), the gait's own phase, for how long he has
    // not moved, running; the turn that faces a walker his way (for the next frame, FaceH, and as laid on, faceH)
    this.drillPose = 'stand'; this.gaitT = 0; this.still = 0; this.gaitOn = false; this.run = false; this.FaceH = 0; this.faceH = 0;
    // the gait as it was at the frame's first put
    this.g0T = 0; this.g0Still = 0; this.g0On = false; this.g0Run = false; this.g0Face = 0;
  }
}

// ---------------------------------------------------------------- the clock

// the frame's length on the drill's clock (a pause is 0; a gap, the first frame or a level change start afresh)
export function spaceClock(crew, now) {
  const dt = now - crew.spLast;
  crew.spLast = now; crew.spNow = now;
  if (dt >= 0 && dt <= 0.5) { crew.spDt = dt; return; }
  crew.spDt = 0; crew.staffE = NaN;
  for (const m of crew.men) forget(m.sp);
}

function forget(S) {
  S.track = false;
  S.sepX = S.sepZ = S.OffX = S.OffY = S.OffZ = S.OffH = S.offX = S.offY = S.offZ = S.offH = 0;
  S.StX = S.StZ = S.StH = S.stX = S.stZ = S.stH = S.FaceH = S.faceH = 0; S.gaitOn = false;
  dropHands(S);
}

export function spaceReset(crew) {
  for (const m of crew.men) forget(m.sp);
  crew.spLast = NaN; crew.staffE = NaN;
}

// the ends of the walk man m is on this frame (root frame): he may come as near the steel as they are
export function way(crew, m, ax, az, bx, bz) {
  if (!crew.spacing) return;
  const S = m.sp;
  S.wayAt = crew.spNow; S.wayAx = ax; S.wayAz = az; S.wayBx = bx; S.wayBz = bz;
}

// man m has his hands on the staff this frame: walking with it, he is at his work
export function holding(crew, m) { if (crew.spacing) m.sp.heldAt = crew.spNow; }

// a hand asked onto a grip (Man.hand)
export function ask(crew, m, i, x, y, z, w) {
  const S = m.sp;
  S.askX[i] = x; S.askY[i] = y; S.askZ[i] = z; S.askW[i] = w; S.askAt[i] = crew.spNow;
}

// ---------------------------------------------------------------- the place

// an offset run down towards nothing, never faster than vmax
const runOut = (l, dt, vmax) => Math.max(0, l - Math.min(l * (1 - Math.exp(-dt / TAU_OFF)), vmax * dt));

// Man m is put at (x, y, z) heading h in a pose (name: the pose as the figure has it) at phase t: the place settled
// (last frame's sep on it, and off for a jump) and the gait fitted to how he then really moves. Into out: x, y, z, h,
// pose, t.
export function spacePut(crew, m, x, y, z, h, pose, name, t, out) {
  const S = m.sp, now = crew.spNow, dt = crew.spDt;
  if (S.spacedAt !== now) {
    S.lastX = S.shownX; S.lastY = S.shownY; S.lastZ = S.shownZ; S.lastH = S.shownH;
    S.g0T = S.gaitT; S.g0Still = S.still; S.g0On = S.gaitOn; S.g0Run = S.run; S.g0Face = S.FaceH;
  } else { S.gaitT = S.g0T; S.still = S.g0Still; S.gaitOn = S.g0On; S.run = S.g0Run; S.FaceH = S.g0Face; }
  S.rawX = x; S.rawY = y; S.rawZ = z; S.rawH = h; S.spacedAt = now;
  // (and the stance worked out from last frame's grips)
  S.stX = S.StX; S.stZ = S.StZ; S.stH = S.StH; S.faceH = S.FaceH;
  if (!S.track) S.offX = S.offY = S.offZ = S.offH = 0;
  else {
    const tx = x + S.sepX + S.stX, tz = z + S.sepZ + S.stZ, th = h + S.stH + S.faceH;
    let ox = S.OffX, oy = S.OffY, oz = S.OffZ, oh = S.OffH;
    const wk = atWork(S), vJump = wk ? V_JUMP_WORK : V_JUMP, vMax = wk ? V_MAX_WORK : V_MAX;
    if (dt > 0) {
      // what is left of earlier jumps runs out, never faster than a brisk step or a quick turn
      const l = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (l > 1e-6) { const k = runOut(l, dt, V_OFF) / l; ox *= k; oy *= k; oz *= k; }
      const ah = Math.abs(oh);
      if (ah > 1e-6) oh *= runOut(ah, dt, W_OFF) / ah;
      // a jump is taken up whole
      const dx = tx - S.prevTx, dy = y - S.prevTy, dz = tz - S.prevTz;
      if (dx * dx + dy * dy + dz * dz > sq(vJump * dt + 0.005)) { ox -= dx; oy -= dy; oz -= dz; }
      const dh = wrapPi(th - S.prevTh);
      if (Math.abs(dh) > W_JUMP * dt + 0.005) oh -= dh;
      // and whatever would still be too quick
      const sx = tx + ox - S.lastX, sy = y + oy - S.lastY, sz = tz + oz - S.lastZ, s = Math.sqrt(sx * sx + sy * sy + sz * sz), vm = vMax * dt;
      if (s > vm) { const k = vm / s; ox = S.lastX + sx * k - tx; oy = S.lastY + sy * k - y; oz = S.lastZ + sz * k - tz; }
      const sh = wrapPi(th + oh - S.lastH);
      if (Math.abs(sh) > W_MAX * dt) oh = S.lastH + Math.sign(sh) * W_MAX * dt - th;
    }
    S.offX = ox; S.offY = oy; S.offZ = oz; S.offH = oh;
    x = tx + ox; y += oy; z = tz + oz; h = th + oh;
  }
  gait(crew, m, S, x, z, h, pose, name, t, out);
  out.x = x; out.y = y; out.z = z; out.h = h;
  S.shownX = x; S.shownY = y; S.shownZ = z; S.shownH = h;
}

// The gait fitted to the ground covered (out.pose, out.t). The old drill gives a walker his phase from the way the drill
// meant him to go: turned on the spot, held back by the spacing, pushed aside or making up lost ground he walks in
// place, slides or skates. The two who carry a shell between them each step to their own ground.
function gait(crew, m, S, x, z, h, pose, name, t, out) {
  S.drillPose = name;
  out.pose = pose; out.t = t;
  const dt = crew.spDt, moved = S.track && dt > 0, now = crew.spNow;
  const dx = x - S.lastX, dz = z - S.lastZ, v = moved ? Math.sqrt(dx * dx + dz * dz) / dt : 0;
  if (moved) {
    // the way the drill sends him (his own way, not what the spacing pushes him: turned to face a push he would be
    // pushed again) against the heading the drill and the spacing give him without this turn
    let want = 0;
    const rx = S.rawX - S.pRawX, rz = S.rawZ - S.pRawZ, vr = Math.sqrt(rx * rx + rz * rz) / dt;
    if (pose === 'walk' && vr > V_FACE && !atWork(S)) {
      want = wrapPi(headingOf(rx, rz) - (h - S.faceH));
      want = Math.abs(want) > FACE_BACK ? 0 : clamp(want, -FACE_MAX, FACE_MAX);
    } else if (pose === 'walk' && vr > V_STILL) want = S.FaceH; // (slowing to a stop he keeps facing as he is)
    S.FaceH += clamp(want - S.FaceH, -W_FACE * dt, W_FACE * dt);
  }
  if (!walking(pose)) { S.gaitOn = false; return; }
  if (!S.gaitOn) {
    // (a walk begins standing: he walks once he moves)
    S.gaitOn = true; S.gaitT = t; S.still = T_STILL; S.run = pose === 'run';
  }
  if (moved) {
    const sh = Math.sin(h), ch = Math.cos(h), f = -(dx * sh + dz * ch), l = dx * ch - dz * sh;
    if (v > V_GO) S.still = 0; else if (v < V_STILL) S.still += dt;
    if (pose === 'walk') { if (!S.run) S.run = v > V_RUN && !atWork(S); else if (v < V_UNRUN) S.run = false; }
    if (pose === 'sidestep') S.gaitT += l / SIDE_STRIDE;
    // (along his heading: what he covers across it, pushed aside, is not stepped)
    else S.gaitT += f / (pose === 'carryWalk' ? CSTRIDE : pose === 'stoopWalk' ? STOOP_STRIDE : S.run || pose === 'run' ? RUN_STRIDE : STRIDE);
  }
  // (not a man with the staff in his hands: between two steps with it he stays as he is, not as one with a round)
  const staff = (now - S.heldAt <= dt + 1e-6 && now >= S.heldAt) || atWork(S);
  if (S.still >= T_STILL && !staff) {
    out.pose = pose === 'carryWalk' ? 'carry' : 'stand';
    out.t = out.pose === 'carry' ? 0 : crew.idleT + m.seed;
    return;
  }
  out.pose = S.run && pose === 'walk' ? 'run' : pose;
  out.t = S.gaitT;
}

// the clearance from the steel at a root-frame point on man m's floor (as the crew field has it)
function clear(crew, m, x, z) {
  const F = crew.field;
  let fx = x, fz = z;
  if (!m.world) { const dx = x - crew.pvx, dz = z - crew.pvz; fx = dx * crew.ca - dz * crew.sa + crew.pvx; fz = dx * crew.sa + dz * crew.ca + crew.pvz; }
  // (the floor nearest his feet: CrewField.level without its closure)
  const fl = F.floors, y = m.sp.rawY;
  let l = 0, bd = 1e9;
  for (let i = 0; i < fl.length; i++) { const d = Math.abs(fl[i] - y); if (d < bd) { bd = d; l = i; } }
  return F.dAt('work', l, fx, fz, m.world);
}

// (a man shown and put this frame)
const on = (crew, m) => m.root.visible && m.sp.spacedAt === crew.spNow;
// (one of the two men who carry a shell between them)
const isPair = (crew, m) => m === crew.pair0 || m === crew.pair1;

// after every man has been put: next frame's sep for each
export function spaceStep(crew) {
  const dt = crew.spDt, dOff = dt > 0 ? Math.exp(-dt / TAU_OFF) : 1, men = crew.men, n = men.length, now = crew.spNow;
  for (let i = 0; i < n; i++) {
    const m = men[i], S = m.sp;
    if (!on(crew, m)) { forget(S); continue; }
    let vx = 0, vz = 0;
    if (S.track && dt > 0) { vx = S.rawX - S.pRawX; vz = S.rawZ - S.pRawZ; }
    S.vx = vx; S.vz = vz;
    S.nx = S.rawX + vx; S.nz = S.rawZ + vz;
    shape(crew, m, S, dt);
    // (a walker's is held while the push that made it lasts, and runs out once he is clear; a man standing always makes
    // his way back to his place)
    const dSep = dt > 0 && !(S.touched && S.walks) ? Math.exp(-dt / (walking(S.drillPose) && S.heldAt !== now ? TAU_SEP : TAU_SEP_STOP)) : 1;
    S.touched = false;
    S.px = S.nx + S.sepX * dSep + S.offX * dOff + S.StX;
    S.pz = S.nz + S.sepZ * dSep + S.offZ * dOff + S.StZ;
  }
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const a = men[i];
      if (!on(crew, a)) continue;
      for (let j = i + 1; j < n; j++) if (on(crew, men[j])) apart(crew, a, men[j]);
    }
    for (let i = 0; i < n; i++) {
      const m = men[i];
      if (!on(crew, m)) continue;
      if (m.sp.need > 0) outOfSteel(crew, m); else if (!walking(m.sp.drillPose)) offSteel(crew, m, dOff);
    }
  }
  for (let i = 0; i < n; i++) {
    const m = men[i], S = m.sp;
    if (!on(crew, m)) continue;
    let sx = S.px - S.nx - S.offX * dOff - S.StX, sz = S.pz - S.nz - S.offZ * dOff - S.StZ;
    const l = Math.sqrt(sx * sx + sz * sz);
    if (l > SEP_MAX) { sx *= SEP_MAX / l; sz *= SEP_MAX / l; }
    S.prevTx = S.rawX + S.sepX + S.stX; S.prevTy = S.rawY; S.prevTz = S.rawZ + S.sepZ + S.stZ; S.prevTh = S.rawH + S.stH + S.faceH;
    S.sepX = sx; S.sepZ = sz;
    S.OffX = S.offX; S.OffY = S.offY; S.OffZ = S.offZ; S.OffH = S.offH;
    S.pRawX = S.rawX; S.pRawY = S.rawY; S.pRawZ = S.rawZ;
    S.track = true;
  }
}

// his capsule in plan (radius, reach ahead and behind along his heading), how readily he gives way, how far from the
// steel he keeps
function shape(crew, m, S, dt) {
  const p = S.drillPose, now = crew.spNow;
  S.blocked = false; S.work = false;
  S.walks = walking(p) && sq(S.vx) + sq(S.vz) > sq(0.2 * dt);
  if (walking(p)) { S.sr = 0.235; S.sf = p === 'carryWalk' ? 0.38 : S.run ? 0.4 : 0.25; S.sb = S.run ? 0.3 : 0.2; S.mob = 1; }
  else if (p === 'carry' || p === 'carryShoulder') { S.sr = 0.24; S.sf = 0.38; S.sb = 0.05; S.mob = 0.4; }
  else if (p === 'ears') { S.sr = 0.25 + 0.16 * crew.ears; S.sf = 0.05; S.sb = 0.05; S.mob = 0.5; }
  else if (p === 'stand' || p === 'phone' || p === 'dead') { S.sr = 0.25 + (m.noEars ? 0 : 0.16 * crew.ears); S.sf = 0.05; S.sb = 0.05; S.mob = 0.5; }
  // at his work: his hands are on the gun, the staff or the round
  else { S.sr = 0.24; S.sf = 0.3; S.sb = 0.05; S.mob = 0.08; }
  S.need = 0;
  // (walking the staff up the bore is work)
  if (S.heldAt === now || atWork(S)) { S.mob = 0.08; S.walks = false; S.work = true; return; }
  if (isPair(crew, m)) S.mob = Math.min(S.mob, 0.35);
  if (m === crew.player) S.mob = Math.min(S.mob, 0.05);
  // (not while he steps up or down: the field is the floor's he is leaving or reaching)
  if (walking(p) && (p !== 'sidestep' || S.wayAt === now) && Math.abs(S.rawY - S.pRawY) < 1e-4 && S.track) {
    let need = STEEL_NEED;
    if (S.wayAt === now) {
      // (a walk that ends in what the field counts as steel is the drill's own, onto the gun: left alone; one that ends
      // near it keeps 15 cm on the way and closes the last few on arrival)
      const ends = Math.min(clear(crew, m, S.wayAx, S.wayAz), clear(crew, m, S.wayBx, S.wayBz));
      need = ends < 0.05 ? 0 : Math.min(need, Math.max(0.15, ends));
    } else { m.home(_home); need = Math.min(need, clear(crew, m, _home.x, _home.z)); }
    S.need = need;
  }
}

// two men's capsules pushed apart where they overlap
function apart(crew, a, b) {
  const A = a.sp, B = b.sp, pair = isPair(crew, a) && isPair(crew, b);
  // (two men both at their work keep the places the drill gave them: a team on one staff, or at one block)
  if (A.work && B.work) return;
  let ax0, az0, ax1, az1, bx0, bz0, bx1, bz1, need;
  if (pair) {
    // the pair either side of their shell: never nearer than they carry it, a little wider while they crouch to lift it
    ax0 = ax1 = A.px; az0 = az1 = A.pz; bx0 = bx1 = B.px; bz0 = bz1 = B.pz;
    need = A.drillPose === 'lift' || B.drillPose === 'lift' ? PAIR_LIFT : 2 * (crew.pairW ?? 0.38) - 0.02;
  } else {
    const fa = -Math.sin(a.h), ga = -Math.cos(a.h), fb = -Math.sin(b.h), gb = -Math.cos(b.h);
    ax0 = A.px - fa * A.sb; az0 = A.pz - ga * A.sb; ax1 = A.px + fa * A.sf; az1 = A.pz + ga * A.sf;
    bx0 = B.px - fb * B.sb; bz0 = B.pz - gb * B.sb; bx1 = B.px + fb * B.sf; bz1 = B.pz + gb * B.sf;
    need = A.sr + B.sr + MARGIN;
  }
  // (a quick reject: the capsules are short)
  if (sq(A.px - B.px) + sq(A.pz - B.pz) > sq(need + 1.0)) return;
  segClosest(ax0, az0, ax1, az1, bx0, bz0, bx1, bz1, _seg);
  let ux = _seg.ax - _seg.bx, uz = _seg.az - _seg.bz;
  const d = Math.sqrt(ux * ux + uz * uz), pen = need - d;
  if (pen <= 0) return;
  if (d > 1e-6) { ux /= d; uz /= d; } else { ux = Math.cos(a.h); uz = -Math.sin(a.h); }
  // how much each is walking into the other (his step against the way to the other)
  const ia = into(A, -ux, -uz), ib = into(B, ux, uz);
  // (the pair apart from each other: not as one)
  if (pair) { A.px += ux * pen / 2; A.pz += uz * pen / 2; B.px -= ux * pen / 2; B.pz -= uz * pen / 2; return; }
  let sa;
  if (A.walks && B.walks) {
    const ra = rank(crew, a), rb = rank(crew, b);
    if (ra !== rb) sa = ra > rb ? 0 : 1; // the load goes first, two men before one
    else if (ia > 0.5 && ib > 0.5) sa = A.blocked === B.blocked ? 0.5 : A.blocked ? 0 : 1; // head on: both step aside
    else sa = ia >= ib ? 1 : 0; // the one walking into the other waits
  } else if (A.blocked !== B.blocked) sa = A.blocked ? 0 : 1; // (one held off the steel cannot give way: the other does)
  else { const ma = A.mob, mb = B.mob, s = ma + mb; sa = s > 0 ? ma / s : 0.5; }
  push(crew, a, ux, uz, pen * sa, ia, B.walks ? ib : -1);
  push(crew, b, -ux, -uz, pen * (1 - sa), ib, A.walks ? ia : -1);
}

// who goes first of two walkers: a pair with its shell, a man with a load, the pair going back, a man walking
const rank = (crew, m) => (m.sp.drillPose === 'carryWalk' ? 2 : 0) + (isPair(crew, m) ? 1 : 0);

// how much man m's step goes along (ux, uz), towards the other (0 when he stands)
function into(S, ux, uz) {
  if (!S.walks) return 0;
  const v = Math.sqrt(S.vx * S.vx + S.vz * S.vz);
  return (S.vx * ux + S.vz * uz) / v;
}

// Man m pushed by amount along (ux, uz), away from the other. Walking into him: if the other walks too, he waits (held
// back along his own step), or, the other coming at him (other > 0.5), steps to his right; if the other stands, he
// goes round him on the side he is already on. (other: how much the other walks into him, -1 when he stands)
function push(crew, m, ux, uz, amount, intoK, other) {
  if (amount <= 0) return;
  const S = m.sp;
  let px = ux, pz = uz;
  if (intoK > 0.3) {
    const v = Math.sqrt(S.vx * S.vx + S.vz * S.vz), fx = S.vx / v, fz = S.vz / v;
    if (other > 0.5) {
      // (to his right, or to his left if the right is the nearer the steel)
      let rx = -fz, rz = fx;
      if (clear(crew, m, S.px - rx * 0.3, S.pz - rz * 0.3) > clear(crew, m, S.px + rx * 0.3, S.pz + rz * 0.3) + 0.05) { rx = -rx; rz = -rz; }
      px += rx * intoK; pz += rz * intoK;
    } else if (other >= 0) { const k = 1 / Math.max(0.5, intoK); px = -fx * k; pz = -fz * k; }
    else {
      // (the side: where the way off the other already points, across his step; dead ahead, his right)
      let cx = ux + fx * intoK, cz = uz + fz * intoK, c = Math.sqrt(cx * cx + cz * cz);
      if (c < 0.2) { cx = -fz; cz = fx; c = 1; }
      px += cx / c * intoK; pz += cz / c * intoK;
    }
  }
  move(crew, m, px * amount, pz * amount);
}

// man m moved in plan; the two men of a pair move as one, or the shell between them would be dropped
function move(crew, m, dx, dz) {
  const S = m.sp;
  S.px += dx; S.pz += dz; S.touched = true;
  const mate = m === crew.pair0 ? crew.pair1 : m === crew.pair1 ? crew.pair0 : null;
  if (mate && on(crew, mate)) { mate.sp.px += dx; mate.sp.pz += dz; mate.sp.touched = true; }
}

// a walker pushed out of the steel to his clearance, along the field's slope
function outOfSteel(crew, m) {
  const S = m.sp, c = clear(crew, m, S.px, S.pz);
  if (c >= S.need) return;
  for (let e = 0.1; e < 0.45; e += 0.15) {
    const gx = clear(crew, m, S.px + e, S.pz) - clear(crew, m, S.px - e, S.pz), gz = clear(crew, m, S.px, S.pz + e) - clear(crew, m, S.px, S.pz - e), g = Math.sqrt(gx * gx + gz * gz);
    if (g < 1e-6) continue;
    const step = Math.min(S.need - c, 0.15);
    move(crew, m, gx / g * step, gz / g * step); S.blocked = true;
    return;
  }
}

// A man who is not walking, pushed by another: never nearer the steel than a body may stand, or than his own place is.
// He then gives no more way: the other does.
function offSteel(crew, m, dOff) {
  const S = m.sp, rx = S.nx + S.offX * dOff + S.StX, rz = S.nz + S.offZ * dOff + S.StZ, sx = S.px - rx, sz = S.pz - rz;
  if (sx * sx + sz * sz < 1e-8) return;
  const lim = Math.min(STAND_CLEAR, clear(crew, m, rx, rz));
  if (clear(crew, m, S.px, S.pz) >= lim) return;
  // (as far along the push as the steel lets him)
  let lo = 0, hi = 1;
  for (let i = 0; i < 4; i++) { const k = (lo + hi) / 2; if (clear(crew, m, rx + sx * k, rz + sz * k) >= lim) lo = k; else hi = k; }
  move(crew, m, rx + sx * lo - S.px, rz + sz * lo - S.pz); S.blocked = true;
}

// the closest points of segments p0-p1 and q0-q1 in plan (into out: ax, az on p, bx, bz on q)
function segClosest(p0x, p0z, p1x, p1z, q0x, q0z, q1x, q1z, out) {
  const d1x = p1x - p0x, d1z = p1z - p0z, d2x = q1x - q0x, d2z = q1z - q0z, rx = p0x - q0x, rz = p0z - q0z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = t = 0; }
  else if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1z * rz;
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  out.ax = p0x + d1x * s; out.az = p0z + d1z * s; out.bx = q0x + d2x * t; out.bz = q0z + d2z * t;
}

// ---------------------------------------------------------------- hands and stance

function dropHands(S) {
  for (let i = 0; i < 2; i++) { S.gripOn[i] = S.gripGo[i] = S.gripVel[i] = false; S.gripW[i] = 0; }
  S.swapped = S.both = false;
}

// man m's drill for the frame is done: his hands onto what was asked of them, and his stance for the next frame
export function hands(crew, m) {
  const S = m.sp, now = crew.spNow;
  if (crew.level < 2) { dropHands(S); stance(crew, m, S, false, false); return; }
  const l = S.askAt[0] === now, r = S.askAt[1] === now;
  if (l && r && S.fixedAt !== now) uncross(m, S); else S.swapped = S.both = false;
  stance(crew, m, S, l, r);
  grip(crew, m, S, 0, l); grip(crew, m, S, 1, r);
}

function uncross(m, S) {
  const ch = Math.cos(m.h), sh = Math.sin(m.h);
  const lx = S.askX[0] - m.x, lz = S.askZ[0] - m.z, rx = S.askX[1] - m.x, rz = S.askZ[1] - m.z;
  const lr = lx * ch - lz * sh, lf = -(lx * sh + lz * ch), rr = rx * ch - rz * sh, rf = -(rx * sh + rz * ch);
  const fresh = !S.both, now = m.crew.spNow;
  S.both = true;
  if (fresh) S.swapped = false;
  // (a grip over his own middle is on neither side)
  if (lr * lr + lf * lf > 0.01 && rr * rr + rf * rf > 0.01) {
    // how much further round to his right the grip asked of the right hand is
    const d = wrapPi(Math.atan2(rr, rf) - Math.atan2(lr, lf));
    if (fresh) S.swapped = d < -UNCROSS_FIRST;
    else if (now - S.swapAt > T_SWAP && (S.swapped ? d > UNCROSS : d < -UNCROSS)) { S.swapped = !S.swapped; S.swapAt = now; }
  }
  if (!S.swapped) return;
  let t = S.askX[0]; S.askX[0] = S.askX[1]; S.askX[1] = t;
  t = S.askY[0]; S.askY[0] = S.askY[1]; S.askY[1] = t;
  t = S.askZ[0]; S.askZ[0] = S.askZ[1]; S.askZ[1] = t;
  t = S.askW[0]; S.askW[0] = S.askW[1]; S.askW[1] = t;
}

// a difference run down, eased at the end and never faster than vmax
const ease = (d, dt, vmax) => Math.sign(d) * Math.min(Math.abs(d) * (1 - Math.exp(-dt / TAU_ST)), vmax * dt);

// the turn and the step for his grips as asked this frame (after uncross), on top of what he has: next frame's
function stance(crew, m, S, l, r) {
  const dt = crew.spDt, now = crew.spNow, ch = Math.cos(m.h), sh = Math.sin(m.h);
  l = l && S.askW[0] >= STANCE_W; r = r && S.askW[1] >= STANCE_W;
  // (one hand alone goes further round to its side: a staff stood beside him, a handle at his hip)
  let lo = -Infinity, hi = Infinity, pr = 0, pf = 0;
  const aOut = l && r ? A_OUT : A_OUT_ONE;
  const sc = 1 / m.root.scale.x;
  for (let i = 0; i < 2; i++) {
    if (!(i === 0 ? l : r)) continue;
    const dx = S.askX[i] - m.x, dz = S.askZ[i] - m.z, rr = dx * ch - dz * sh, ff = -(dx * sh + dz * ch), u = S.askY[i] - m.y;
    // (a grip well beyond his arm is the drill's to bring nearer, and one behind him the drill's own choice, a load
    // towed at his back: stepping and turning for them took men into each other and an arm through his body)
    if (ff < 0 || Math.hypot(dx * sc, u * sc - 1.33, dz * sc) > 0.95) continue;
    const hd = Math.sqrt(rr * rr + ff * ff);
    // the right turns that leave this grip where its hand takes it
    if (hd > 0.12) {
      const az = Math.atan2(rr, ff);
      if (i === 1) { lo = Math.max(lo, az - aOut); hi = Math.min(hi, az + A_IN); } else { lo = Math.max(lo, az - A_IN); hi = Math.min(hi, az + aOut); }
    }
    if (hd < D_NEAR && u > 0.8 && u < 1.55) {
      // inside his own trunk: back from it (over his middle: straight back)
      if (hd < 0.02) pf -= D_NEAR; else { const k = (D_NEAR - hd) / hd; pr -= rr * k; pf -= ff * k; }
    } else if (hd > D_FAR) {
      // beyond his arm in plan (a low or a high grip is the pose's to reach): up to it
      const k = (hd - D_FAR) / hd; pr += rr * k; pf += ff * k;
    }
  }
  if (dt <= 0) { if (l || r) S.stanceAt = now; return; }
  // the turn, to the right (his heading turns left)
  const th = -S.StH;
  let dth;
  if (l || r) {
    S.stanceAt = now;
    if (lo > hi) dth = ease((lo + hi) / 2, dt, W_ST); // (no turn brings both right: between them)
    else if (lo > 0) dth = ease(lo, dt, W_ST);
    else if (hi < 0) dth = ease(hi, dt, W_ST);
    // (within the bounds nothing is needed: what he has turned runs out slowly, as far as the bounds let it)
    else dth = clamp(clamp(-th, lo, hi), -W_RELAX * dt, W_RELAX * dt);
  } else dth = now - S.stanceAt > T_HOLD || now < S.stanceAt ? ease(-th, dt, W_ST) : 0;
  // (a man walking goes where his feet point: only a little, unless he walks the staff up the bore)
  const hMax = walking(S.drillPose) && S.heldAt !== now ? H_WALK : H_MAX, lim = Math.max(hMax, Math.abs(th) - W_ST * dt);
  S.StH = -clamp(clamp(th + dth, th - W_ST * dt, th + W_ST * dt), -lim, lim);
  // the step
  let nx, nz;
  if (pr !== 0 || pf !== 0) {
    const sx = pr * ch - pf * sh, sz = -pr * sh - pf * ch, sl = Math.sqrt(sx * sx + sz * sz), e = ease(sl, dt, V_ST) / sl;
    nx = S.StX + sx * e; nz = S.StZ + sz * e;
    const nl = Math.sqrt(nx * nx + nz * nz);
    if (nl > S_MAX) { nx *= S_MAX / nl; nz *= S_MAX / nl; }
    // (never nearer the steel than he is, unless he stays well clear)
    const bx = S.shownX - S.stX, bz = S.shownZ - S.stZ, c = clear(crew, m, bx + nx, bz + nz);
    if (c < STEEL_NEED && c < clear(crew, m, bx + S.StX, bz + S.StZ) - 1e-4) return;
  } else {
    // (nothing asks for it: back to his place, slowly while he works, then as he came)
    const sl = Math.sqrt(S.StX * S.StX + S.StZ * S.StZ);
    if (sl < 1e-6) return;
    const working = l || r || !(now - S.stanceAt > T_HOLD || now < S.stanceAt);
    const e = 1 - (working ? Math.min(sl, V_RELAX * dt) : ease(sl, dt, V_ST)) / sl;
    nx = S.StX * e; nz = S.StZ * e;
  }
  S.StX = nx; S.StZ = nz;
}

// hand i of man m onto the grip asked of it, in a hand's time
function grip(crew, m, S, i, asked) {
  const dt = crew.spDt, now = crew.spNow, sc = 1 / m.root.scale.x;
  const ax = S.askX[i], ay = S.askY[i], az = S.askZ[i];
  // (the drill's own weight window, eased over a few frames: the hand follows it as it is. The hand's own times are for
  // what the drill does in a frame, a weight from nothing to full or a grip somewhere else)
  let want = 0, far = 1;
  if (asked) {
    // (as the old drill: a grip beyond the arm is let go)
    far = smooth(Math.hypot((ax - m.x) * sc, (ay - m.y) * sc - 1.33, (az - m.z) * sc), 0.88, 1.02);
    want = Math.min(1, S.askW[i]) * (1 - far);
  }
  // (a load in his arms is the drill's to time: its lift and its setting down move it with his hands, and a hand late
  // on it left it hanging in the air)
  const w0 = S.askW0[i], dw = Math.abs(want - w0), follow = asked && (dw <= 0.35 || carrying(S.drillPose)) ? dw : 0;
  S.askW0[i] = want;
  // (a hand no longer asked in a new pose is the pose's at once: the figure fades from one pose to the next itself)
  if (!asked && m.poseAt === now) { S.gripOn[i] = S.gripGo[i] = false; S.gripW[i] = 0; }
  if (!S.gripOn[i]) {
    if (!asked || want <= 0.01) { S.gripW[i] = 0; return; }
    S.gripOn[i] = true; S.gripGo[i] = S.gripVel[i] = false;
    S.gripX[i] = ax; S.gripY[i] = ay; S.gripZ[i] = az;
    // (a man shown for the first time has his hands where they are)
    S.gripW[i] = S.track && dt > 0 ? Math.min(want, Math.max(dt / T_ON, follow)) : want;
  } else {
    if (asked && want > 0.01 && !S.gripGo[i]) {
      // is the grip still where the hand is going?
      let ex = ax - S.gripX[i], ey = ay - S.gripY[i], ez = az - S.gripZ[i];
      if (S.gripVel[i]) { ex -= S.gripVx[i] * dt; ey -= S.gripVy[i] * dt; ez -= S.gripVz[i] * dt; }
      const thr = J_GRIP + (S.gripVel[i] ? A_GRIP * dt * dt : V_GRIP * dt);
      if (ex * ex + ey * ey + ez * ez > thr * thr) S.gripGo[i] = true;
    }
    if (S.gripGo[i]) {
      // letting go for a new hold
      S.gripW[i] -= dt / T_OFF;
      if (S.gripW[i] <= 0) {
        S.gripW[i] = 0; S.gripGo[i] = S.gripVel[i] = false;
        if (asked && want > 0.01) { S.gripX[i] = ax; S.gripY[i] = ay; S.gripZ[i] = az; } else S.gripOn[i] = false;
      }
    } else {
      if (asked && want >= S.gripW[i] - 0.05) {
        // holding on or taking hold: the hand goes with its grip
        if (dt > 0) { S.gripVx[i] = (ax - S.gripX[i]) / dt; S.gripVy[i] = (ay - S.gripY[i]) / dt; S.gripVz[i] = (az - S.gripZ[i]) / dt; S.gripVel[i] = true; }
        S.gripX[i] = ax; S.gripY[i] = ay; S.gripZ[i] = az;
        S.gripW[i] = Math.min(want, S.gripW[i] + Math.max(dt / T_ON, follow));
      } else {
        // letting go: the hand opens on the grip while the drill still names it (left in the air where the grip had
        // been, it stood off what it held as that moved on), else it stays where the grip was
        if (asked) { S.gripX[i] = ax; S.gripY[i] = ay; S.gripZ[i] = az; }
        S.gripVel[i] = false;
        S.gripW[i] = Math.max(want, S.gripW[i] - Math.max(dt / T_OFF, follow));
      }
      if (S.gripW[i] <= 0.01) {
        S.gripW[i] = 0; S.gripOn[i] = false;
      }
    }
  }
  if (S.gripW[i] > 0.01) m.reach(i ? 'R' : 'L', S.gripX[i], S.gripY[i], S.gripZ[i], S.gripW[i], false);
}

// where along the staff hand i of man m holds it this frame (from the head), moved no faster than a hand slides along
// it: the old drill's place changes in a frame from one step of the loading to the next
export function slide(crew, m, i, z) {
  const S = m.sp, now = crew.spNow, dt = crew.spDt, since = now - S.slideAt[i];
  if (since === 0) z = S.slideZ[i];
  else if (dt > 0 && since > 0 && since <= dt + 1e-6) z = S.slideZ[i] + clamp(z - S.slideZ[i], -V_SLIDE * dt, V_SLIDE * dt);
  S.slideZ[i] = z; S.slideAt[i] = now;
  return z;
}

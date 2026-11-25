import * as THREE from 'three';
import { clamp, smooth, slerpQ } from './math.js';
import { MAX_TURN } from './settle.js';
import { POSED_ROLL } from './limits.js';

// The crewman's feet held on the ground (the port of the Godot game's FootPlant.cs; the animator runs it after the arms
// are settled): a foot the shown pose has on the ground stays where it was put in the gun's root frame while the man
// moves, turns or changes pose over it, and the leg is solved to it; it steps when that gets out of hand.
//   A foot is FREE while the pose has it in the air. When the pose sets it down it is PLANTED there: its place over the
// ground and its heading held in the root frame (its pitch and roll the pose's, rolled about the part of the sole that
// bears), its height the pose's. The leg is a two-bone IK from the hip as shown to the held ankle. When the pose lifts
// the foot it is let go (MOVING, its offset from the pose's fading out). When the held foot gets too far from the
// pose's, turned too far, the leg too long or near its limits, or the feet crossed, and the other foot bears, it steps.
// The hips sink up to MAX_GIVE where a held foot wants a straight leg longer than it is (give, which the animator takes
// before the hands go on their grips). In rates and distances, not frames.

const FREE = 0, PLANTED = 1, MOVING = 2;
const ANKLE_DOWN = 0.11, BALL_DOWN = 0.063;
const STEP_FAR = 0.16, STEP_TURN = (32 * Math.PI) / 180;
const STEP_SECONDS = 0.16, STEP_LONG = 0.08, STEP_LIFT = 0.045, STEP_LIFT_LONG = 0.04;
const RELEASE_SECONDS = 0.2, LAND_STEP = 0.9, LAND_RELEASE = 0.5, STEP_RISE = 0.15;
const MAX_GIVE = 0.04, GIVE_RATE = 0.3, HEIGHT_RATE = 1.5, POLE_TURN = 8, GRIP_KEEP = 1, BLEND_SECONDS = 0.1;
const COMFORT = 0.975, REACH = 0.998;
const KNEE_EASY = 142, KNEE_HARD = 151, EXT_EASY = 30, EXT_HARD = 37, ABD_EASY = 46, ABD_HARD = 56, ADD_EASY = 24, ADD_HARD = 32;
const GAP = 0.25, CROSS = 0.05, DRAG_SPEED = 0.4, HOVER = 0.03, BEYOND = 1.03;
const SETTLE_FAR = 0.05, SETTLE_TURN = (10 * Math.PI) / 180, SETTLE_SECONDS = 0.6, SETTLE_STILL = 0.1;

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const pairV = () => [V(), V()], pairQ = () => [Q(), Q()];
const TAU = 2 * Math.PI;
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
const yawQ = (y, o) => o.set(0, Math.sin(y / 2), 0, Math.cos(y / 2));
const R2D = 180 / Math.PI;

export class FootPlant {
  constructor(sk) {
    this.sk = sk;
    this.hipsB = sk.hips;
    this.thigh = [0, 0]; this.shin = [0, 0]; this.foot = [0, 0];
    this.l1 = [0, 0]; this.l2 = [0, 0]; this.restA = [0, 0]; this.restB = [0, 0];
    this.ball = pairV();
    for (let i = 0; i < 2; i++) {
      this.thigh[i] = sk.solver[11 + i * 3]; this.shin[i] = sk.solver[12 + i * 3]; this.foot[i] = sk.solver[13 + i * 3];
      this.l1[i] = sk.off[this.shin[i]].length(); this.l2[i] = sk.off[this.foot[i]].length();
      this.restA[i] = sk.head[this.foot[i]].y;
      const t = sk.index(i === 0 ? 'toeL' : 'toeR');
      if (t >= 0 && sk.parent[t] === this.foot[i]) this.ball[i].copy(sk.off[t]);
      else this.ball[i].set(0, -this.restA[i] + 0.045, -0.13);
      this.restB[i] = this.restA[i] + this.ball[i].y;
    }
    this.st = [FREE, FREE];
    this.held = pairV(); this.from = pairV(); this.off = pairV();
    this.heldYaw = [0, 0]; this.fromYaw = [0, 0]; this.offYaw = [0, 0]; this.lift = [0, 0]; this.u = [0, 0]; this.dur = [1, 1]; this.w = [0, 0];
    this.lastRot = pairQ();
    this.primed = false;
    this.lastPole = pairV(); this.poled = [false, false];
    this.lastTh = pairQ(); this.lastSh = pairQ(); this.shownOk = [false, false];
    this.frameDt = 0; this.giveMax = MAX_GIVE; this.give = 0;
    this.clipW = pairV(); this.target = pairV(); this.clipB = pairV(); this.clipWas = pairV();
    this.clipYaw = [0, 0]; this.still = [0, 0]; this.down = [false, false];
    this.gTh = pairQ(); this.gSh = pairQ(); this.gFt = pairQ();
    this.dir = V(); this.pole = V(); this.f2 = V(); this.u0 = V(); this.f0 = V(); this.u1 = V(); this.f1 = V(); this.hx = V(); this.a = V(); this.c = V(); this.v = V();
    this.q = Q(); this.r = Q(); this.yq = Q(); this.rw = Q();
    this.knee = [0, 0]; this.ext = [0, 0]; this.abd = [0, 0]; this.add = [0, 0]; this.reach = [0, 0];
    this.m = { kn: 0, ex: 0, ab: 0, ad: 0, re: 0 }; // (the pose's own leg, measured)
    this.hipE = 0; this.hipAb = 0;
    this.steps = 0;
  }

  // the feet taken as the pose has them next frame (a cut, a man shown again, far away)
  reset() {
    this.primed = false; this.give = 0; this.poled[0] = this.poled[1] = false;
    for (let i = 0; i < 2; i++) { this.st[i] = FREE; this.w[i] = 0; }
  }

  yawOf(g) { this.v.set(0, 0, -1).applyQuaternion(g); return Math.atan2(this.v.x, this.v.z); }

  // One frame of the pose as it will be shown (after the arms are settled): G and P scratch for its walk, the man's
  // place and heading in the root frame, the frame's length, how far the drill holds his hands on the gun.
  apply(pose, G, P, x, y, z, h, dt, grip = 0) {
    pose.walk(this.sk, G, P, true);
    this.frameDt = dt;
    // (hands held on grips keep the hips where they are: sinking them bends the arms onto the body)
    this.giveMax = MAX_GIVE * (1 - GRIP_KEEP * clamp(grip, 0, 1));
    const fresh = !this.primed || !(dt > 0) || dt > GAP;
    const st = this.st, held = this.held, clipW = this.clipW, clipB = this.clipB, clipYaw = this.clipYaw, foot = this.foot, down = this.down;
    if (fresh) for (let i = 0; i < 2; i++) { st[i] = FREE; this.w[i] = 0; this.poled[i] = false; }
    const ch = Math.cos(h), sh = Math.sin(h);
    // the pose's feet in the root frame, and whether it has them down (where they would be had the hips not sunk)
    for (let i = 0; i < 2; i++) {
      const A = P[foot[i]], c = this.c;
      c.copy(this.ball[i]).applyQuaternion(G[foot[i]]).add(A);
      c.y += this.give;
      down[i] = A.y + this.give < ANKLE_DOWN && c.y < BALL_DOWN;
      clipB[i].copy(c);
      clipW[i].set(A.x * ch + A.z * sh + x, A.y + this.give + y, -A.x * sh + A.z * ch + z);
      clipYaw[i] = this.yawOf(G[foot[i]]) + h;
    }
    // moves run on; a foot the pose lifts is let go; one it sets down is held there
    for (let i = 0; i < 2; i++) {
      if (st[i] === MOVING) {
        this.u[i] += dt / this.dur[i];
        if (this.u[i] >= 1) {
          if (down[i]) this.plant(i, clipW[i], clipYaw[i], G, h); else st[i] = FREE;
        }
        // a foot the pose sets down before the move is done is held where it is
        else if (down[i] && this.u[i] >= (this.lift[i] > 0 ? LAND_STEP : LAND_RELEASE)) this.plant(i, held[i], this.heldYaw[i], G, h);
      }
      if (st[i] === PLANTED && !down[i]) this.move(i, 0, RELEASE_SECONDS);
      else if (st[i] === FREE && down[i]) this.plant(i, clipW[i], clipYaw[i], G, h);
    }
    this.primed = true;
    // where each foot goes: held (rolled over its sole), or the pose's with what is left of a move
    for (let i = 0; i < 2; i++) {
      if (st[i] === PLANTED) this.roll(i, G, h, ch, sh, x, y, z);
      else if (st[i] === MOVING) this.carried(i, G, ch, sh, x, y, z);
    }
    // a held foot too far from the pose's, turned too far, the leg too long or near its limits, the feet crossed: it
    // steps, when the other bears; past the hard marks with the other off the ground, it is dragged
    let want = -1, most = 0;
    for (let i = 0; i < 2; i++) {
      if (st[i] !== PLANTED) continue;
      this.solve(i, P, G, this.target[i], true);
      let need = this.need(i, P, G);
      // (standing still a while with the foot off the pose's: the least wish to step)
      const sx = held[i].x - clipW[i].x, sz = held[i].z - clipW[i].z;
      const mx = clipW[i].x - this.clipWas[i].x, mz = clipW[i].z - this.clipWas[i].z;
      const off2 = sx * sx + sz * sz > SETTLE_FAR * SETTLE_FAR || Math.abs(wrap(this.heldYaw[i] - clipYaw[i])) > SETTLE_TURN;
      this.still[i] = !fresh && off2 && mx * mx + mz * mz < SETTLE_STILL * SETTLE_STILL * dt * dt ? this.still[i] + dt : 0;
      if (need === 0 && this.still[i] >= SETTLE_SECONDS) need = 1;
      if (need > most) { most = need; want = i; }
    }
    if (want >= 0) {
      const o = 1 - want;
      // (the other on the ground, or all but: a pose that hovers a foot must not keep the other from stepping)
      if (st[o] === PLANTED || (st[o] === FREE && clipW[o].y - y < ANKLE_DOWN + HOVER && clipB[o].y < BALL_DOWN + HOVER)) {
        const d = Math.hypot(held[want].x - clipW[want].x, held[want].z - clipW[want].z), k = Math.min(1, d / 0.4);
        this.move(want, STEP_LIFT + STEP_LIFT_LONG * k, STEP_SECONDS + STEP_LONG * k);
        this.steps++;
        this.carried(want, G, ch, sh, x, y, z);
      }
    }
    for (let i = 0; i < 2; i++) if (st[i] === PLANTED && this.hard(i, P, G)) this.drag(i, P, G, ch, sh, x, y, z);
    // the legs onto their feet
    for (let i = 0; i < 2; i++) {
      const on = st[i] !== FREE;
      this.w[i] = fresh ? (on ? 1 : 0) : on ? Math.min(1, this.w[i] + dt / BLEND_SECONDS) : Math.max(0, this.w[i] - dt / BLEND_SECONDS);
      // (a free foot under sunk hips is put back where the pose has it, so it is not pushed into the ground)
      const k = Math.max(smooth(this.w[i]), Math.min(1, this.give / 0.005));
      if (fresh) this.shownOk[i] = false;
      if (k <= 0) {
        this.poled[i] = false;
        this.lastTh[i].copy(G[this.thigh[i]]); this.lastSh[i].copy(G[this.shin[i]]); this.shownOk[i] = true;
        continue;
      }
      // (a foot let go and faded out is on the pose's own: the IK only eases off)
      if (!on) toFig(clipW[i], ch, sh, x, y, z, this.target[i]);
      this.solve(i, P, G, this.target[i], false);
      this.write(i, pose, G, k, !on);
      this.shownOk[i] = true;
    }
    // how far the hips should sink for the held feet to be reached by legs all but straight: eased, for the next frame
    let sink = 0;
    for (let i = 0; i < 2; i++) {
      this.clipWas[i].copy(clipW[i]);
      if (st[i] !== PLANTED) { this.still[i] = 0; continue; }
      const H = P[this.thigh[i]], t = this.target[i];
      const dx = t.x - H.x, dz = t.z - H.z, l = 0.999 * (this.l1[i] + this.l2[i]), flat = dx * dx + dz * dz;
      if (flat < l * l) sink = Math.max(sink, this.give + (H.y - t.y) - Math.sqrt(l * l - flat));
    }
    sink = clamp(sink, 0, this.giveMax);
    this.give = fresh ? sink : this.give + clamp(sink - this.give, -GIVE_RATE * dt, GIVE_RATE * dt);
  }

  // held where it stands now in the root frame, heading as it is
  plant(i, at, yaw, G, h) {
    this.st[i] = PLANTED;
    this.held[i].copy(at); this.heldYaw[i] = yaw;
    yawQ(h + wrap(yaw - this.clipYaw[i]), this.yq);
    this.lastRot[i].multiplyQuaternions(this.yq, G[this.foot[i]]);
  }

  // a move from where the foot is (held, or a move under way) to the pose's foot: liftH 0 when the pose lifts it itself
  move(i, liftH, seconds) {
    if (this.st[i] === FREE) { this.from[i].copy(this.clipW[i]); this.fromYaw[i] = this.clipYaw[i]; }
    else { this.from[i].copy(this.held[i]); this.fromYaw[i] = this.heldYaw[i]; }
    this.off[i].subVectors(this.from[i], this.clipW[i]); this.off[i].y = 0;
    this.offYaw[i] = wrap(this.fromYaw[i] - this.clipYaw[i]);
    this.st[i] = MOVING; this.u[i] = 0; this.dur[i] = seconds; this.lift[i] = liftH;
  }

  // the held foot rolled over the part of its sole that bears: that point stays put over the ground, the foot turning as
  // the pose turns it under the held heading; its height is the pose's
  roll(i, G, h, ch, sh, x, y, z) {
    const A = G[this.foot[i]], held = this.held[i];
    const bA = this.clipW[i].y - y - this.restA[i], bB = this.clipB[i].y - this.restB[i];
    const k = clamp(0.5 + (bA - bB) / 0.03, 0, 1);
    // the foot's rotation in the root frame now: the pose's, turned onto the held heading
    yawQ(h + wrap(this.heldYaw[i] - this.clipYaw[i]), this.yq);
    this.rw.multiplyQuaternions(this.yq, A);
    // the bearing point where it was last frame, and the ankle from it now
    this.a.copy(this.ball[i]).multiplyScalar(k).applyQuaternion(this.lastRot[i]).add(held);
    this.c.copy(this.ball[i]).multiplyScalar(k).applyQuaternion(this.rw);
    held.x = this.a.x - this.c.x; held.z = this.a.z - this.c.z;
    held.y += clamp(this.clipW[i].y - held.y, -HEIGHT_RATE * this.frameDt, HEIGHT_RATE * this.frameDt);
    this.lastRot[i].copy(this.rw);
    toFig(held, ch, sh, x, y, z, this.target[i]);
    this.gFt[i].copy(yawQ(wrap(this.heldYaw[i] - this.clipYaw[i]), this.yq)).multiply(A);
  }

  // the pose's foot with what is left of a move's offset and its lift
  carried(i, G, ch, sh, x, y, z) {
    let k;
    const a = this.a;
    if (this.lift[i] > 0) {
      k = smooth((this.u[i] - STEP_RISE) / (1 - 2 * STEP_RISE));
      a.lerpVectors(this.from[i], this.clipW[i], k);
      a.y += this.lift[i] * Math.sin(Math.PI * clamp(this.u[i], 0, 1));
    } else {
      k = smooth(this.u[i]);
      a.copy(this.clipW[i]).addScaledVector(this.off[i], 1 - k);
    }
    toFig(a, ch, sh, x, y, z, this.target[i]);
    // (the foot's own rotation: the pose's, turned by what is left of the way from its heading at the start)
    const turn = (this.lift[i] > 0 ? wrap(this.fromYaw[i] - this.clipYaw[i]) : this.offYaw[i]) * (1 - k);
    this.gFt[i].copy(yawQ(turn, this.yq)).multiply(G[this.foot[i]]);
    this.held[i].copy(a); this.heldYaw[i] = this.clipYaw[i] + turn;
  }

  // how much a held foot wants to step: 0 for not at all, past 1 by how far over its worst mark it is
  need(i, P, G) {
    const held = this.held[i], clipW = this.clipW[i];
    const dx = held.x - clipW.x, dz = held.z - clipW.z;
    let n = Math.sqrt(dx * dx + dz * dz) / STEP_FAR;
    n = Math.max(n, Math.abs(wrap(this.heldYaw[i] - this.clipYaw[i])) / STEP_TURN);
    // the limits against the pose's own leg
    const m = this.measure(i, P, G);
    n = Math.max(n, over(this.knee[i], m.kn, KNEE_EASY), over(this.ext[i], m.ex, EXT_EASY), over(this.abd[i], m.ab, ABD_EASY), over(this.add[i], m.ad, ADD_EASY));
    if (this.reach[i] > Math.max(COMFORT, m.re + 0.01)) n = Math.max(n, 1.01);
    // feet crossed (and the pose's are not): the one further from its own steps
    const o = 1 - i, other = this.st[o] === FREE ? P[this.foot[o]] : this.target[o], t = this.target[i];
    const side = i === 0 ? other.x - t.x : t.x - other.x, pside = Math.abs(P[this.foot[1]].x - P[this.foot[0]].x);
    if (side < CROSS && pside >= CROSS) {
      const dx2 = this.target[o].x - P[this.foot[o]].x, dz2 = this.target[o].z - P[this.foot[o]].z;
      if (this.st[o] !== PLANTED || Math.sqrt(dx * dx + dz * dz) >= Math.sqrt(dx2 * dx2 + dz2 * dz2)) n = Math.max(n, 1.01);
    }
    return n > 1 ? n : 0;
  }

  hard(i, P, G) {
    const m = this.measure(i, P, G);
    return this.knee[i] > Math.max(KNEE_HARD, m.kn + 2) || this.ext[i] > Math.max(EXT_HARD, m.ex + 2) || this.abd[i] > Math.max(ABD_HARD, m.ab + 2)
      || this.add[i] > Math.max(ADD_HARD, m.ad + 2) || this.reach[i] > Math.max(REACH, m.re + 0.002);
  }

  // the held foot drawn towards the pose's the least that brings the leg inside its hard marks (halving the way)
  drag(i, P, G, ch, sh, x, y, z) {
    const held = this.held[i], clipW = this.clipW[i];
    // (a foot the leg cannot reach at all is not where it is held anyway: it is drawn to where it can be)
    const beyond = this.reach[i] > BEYOND;
    const ox = held.x, oz = held.z, oy = this.heldYaw[i];
    let lo = 0, hi = 1;
    for (let it = 0; it < 6; it++) {
      const s = (lo + hi) / 2;
      held.x = ox + (clipW.x - ox) * s; held.z = oz + (clipW.z - oz) * s;
      toFig(held, ch, sh, x, y, z, this.target[i]);
      this.solve(i, P, G, this.target[i], true);
      if (this.hard(i, P, G)) lo = s; else hi = s;
    }
    // (no faster than a foot may creep over the ground: past the hard marks for a frame or two rather than slid)
    const far = Math.hypot(clipW.x - ox, clipW.z - oz);
    if (!beyond && far * hi > DRAG_SPEED * this.frameDt) hi = (DRAG_SPEED * this.frameDt) / far;
    held.x = ox + (clipW.x - ox) * hi; held.z = oz + (clipW.z - oz) * hi;
    this.heldYaw[i] = oy + wrap(this.clipYaw[i] - oy) * hi;
    toFig(held, ch, sh, x, y, z, this.target[i]);
    this.gFt[i].copy(yawQ(wrap(this.heldYaw[i] - this.clipYaw[i]), this.yq)).multiply(G[this.foot[i]]);
  }

  // The leg of side i solved to put its ankle at t (the figure's frame): the thigh's and shin's rotations in the
  // figure's frame into gTh, gSh (gFt is the foot's, set by the caller), and with measure its joints.
  solve(i, P, G, t, measure) {
    const H = P[this.thigh[i]], K = P[this.shin[i]], F = P[this.foot[i]], L1 = this.l1[i], L2 = this.l2[i];
    const dir = this.dir, pole = this.pole, f2 = this.f2, a = this.a, c = this.c, u0 = this.u0, f0 = this.f0, u1 = this.u1, f1 = this.f1;
    dir.subVectors(t, H);
    let dist = dir.length();
    // (the reach as it will be once the hips have sunk as far as they may: a leg that only wants that is not held back)
    const sunk = Math.max(0, this.giveMax - this.give), dy = dir.y + sunk;
    this.reach[i] = Math.sqrt(dir.x * dir.x + dy * dy + dir.z * dir.z) / (L1 + L2);
    if (dist < 1e-6) { this.gTh[i].copy(G[this.thigh[i]]); this.gSh[i].copy(G[this.shin[i]]); return; }
    dir.divideScalar(dist);
    dist = clamp(dist, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    // the knee's side: the pose's own knee off the pose's own line from hip to ankle, the thigh's front where the
    // pose's leg is all but straight; then square to the new line
    f2.subVectors(F, H).normalize();
    pole.subVectors(K, H);
    pole.addScaledVector(f2, -pole.dot(f2));
    const bent = pole.length() / L1;
    if (bent < 0.25) {
      a.set(0, 0, -1).applyQuaternion(G[this.thigh[i]]);
      a.addScaledVector(f2, -a.dot(f2));
      pole.addScaledVector(a, (0.25 - bent) * L1);
    }
    pole.addScaledVector(dir, -pole.dot(dir));
    if (pole.lengthSq() < 1e-10) { pole.set(0, 0, -1); pole.addScaledVector(dir, -pole.dot(dir)); }
    if (pole.lengthSq() < 1e-10) pole.set(0, 1, 0);
    pole.normalize();
    // (the knee turns no faster than a joint may: the pose's own knee can swing round when its phase jumps)
    if (!measure) {
      const ang = Math.acos(clamp(pole.dot(this.lastPole[i]), -1, 1)), most = POLE_TURN * this.frameDt;
      if (this.poled[i] && ang > most) {
        c.crossVectors(this.lastPole[i], pole);
        if (c.lengthSq() > 1e-18) {
          this.r.setFromAxisAngle(c.normalize(), most);
          pole.copy(this.lastPole[i]).applyQuaternion(this.r);
          pole.addScaledVector(dir, -pole.dot(dir)).normalize();
        }
      }
      this.lastPole[i].copy(pole); this.poled[i] = true;
    }
    const ca = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    u1.copy(dir).multiplyScalar(ca).addScaledVector(pole, sa);
    f1.copy(dir).multiplyScalar(dist).addScaledVector(u1, -L1).normalize();
    u0.subVectors(K, H).normalize();
    f0.subVectors(F, K).normalize();
    // the thigh the shortest way onto its new line, then rolled so its hinge (its -X) is within POSED_ROLL of the knee's
    this.q.setFromUnitVectors(u0, u1);
    this.gTh[i].multiplyQuaternions(this.q, G[this.thigh[i]]);
    const hx = this.hx.crossVectors(pole, dir);
    if (hx.lengthSq() > 1e-12) {
      hx.normalize();
      a.set(-1, 0, 0).applyQuaternion(this.gTh[i]);
      a.addScaledVector(u1, -a.dot(u1));
      if (a.lengthSq() > 1e-12) {
        a.normalize();
        c.crossVectors(a, hx);
        const roll = Math.atan2(c.dot(u1), a.dot(hx)), keep = (POSED_ROLL * Math.PI) / 180;
        const turn = roll > keep ? roll - keep : roll < -keep ? roll + keep : 0;
        if (turn !== 0) this.gTh[i].premultiply(this.r.setFromAxisAngle(u1, turn));
      }
    }
    // the shin carried with the thigh, then onto its own new line
    this.r.copy(G[this.thigh[i]]).invert().premultiply(this.gTh[i]);
    this.gSh[i].multiplyQuaternions(this.r, G[this.shin[i]]);
    f0.applyQuaternion(this.r);
    this.q.setFromUnitVectors(f0, f1);
    this.gSh[i].premultiply(this.q);
    if (!measure) return;
    // the joints as the crew audit measures them: from the joints' places
    this.knee[i] = Math.acos(clamp(u1.dot(f1), -1, 1)) * R2D;
    this.hip(i, u1, G);
    this.ext[i] = this.hipE; this.abd[i] = this.hipAb; this.add[i] = -this.hipAb;
  }

  hip(i, thighDir, G) {
    const v = this.v.copy(thighDir).applyQuaternion(this.r.copy(G[this.hipsB]).invert());
    const sx = (i === 0 ? -1 : 1) * v.x;
    this.hipE = Math.asin(clamp(v.z, -1, 1)) * R2D;
    this.hipAb = Math.asin(clamp(sx, -1, 1)) * R2D;
  }

  // the pose's own leg, measured the same way
  measure(i, P, G) {
    const m = this.m, f2 = this.f2.subVectors(P[this.shin[i]], P[this.thigh[i]]).normalize();
    const v = this.c.subVectors(P[this.foot[i]], P[this.shin[i]]).normalize();
    m.kn = Math.acos(clamp(f2.dot(v), -1, 1)) * R2D;
    this.hip(i, f2, G);
    m.ex = this.hipE; m.ab = this.hipAb; m.ad = -this.hipAb;
    m.re = P[this.thigh[i]].distanceTo(P[this.foot[i]]) / (this.l1[i] + this.l2[i]);
    return m;
  }

  // The solved leg into the pose, k of the way from the pose's own: thigh, shin and foot joints. own: the foot keeps the
  // pose's rotation (a foot let go, the IK easing off), else gFt.
  write(i, pose, G, k, own) {
    const th = this.thigh[i], sn = this.shin[i], ft = this.foot[i], gTh = this.gTh[i], gSh = this.gSh[i], gFt = this.gFt[i];
    if (own) gFt.copy(G[ft]);
    if (k < 1) {
      slerpQ(G[th], gTh, k, gTh);
      slerpQ(G[sn], gSh, k, gSh);
      slerpQ(G[ft], gFt, k, gFt);
    }
    // (and the thigh and shin no faster than a joint may turn from how they were shown)
    if (this.shownOk[i]) {
      const step = MAX_TURN * this.frameDt;
      cap(this.lastTh[i], gTh, step);
      cap(this.lastSh[i], gSh, step);
    }
    pose.Q[th].copy(G[this.hipsB]).invert().multiply(gTh);
    pose.Q[sn].copy(gTh).invert().multiply(gSh);
    pose.Q[ft].copy(gSh).invert().multiply(gFt);
    this.lastTh[i].copy(gTh); this.lastSh[i].copy(gSh);
  }
}

// over its mark (1 at the mark): the easy mark, or the pose's own a little past it where the pose goes further
function over(v, own, mark) {
  const m = Math.max(mark, own + 5);
  return v > m ? 1 + (v - m) / 10 : 0;
}

function toFig(wp, ch, sh, x, y, z, o) {
  const dx = wp.x - x, dz = wp.z - z;
  o.set(dx * ch - dz * sh, wp.y - y, dx * sh + dz * ch);
}

function cap(was, q, step) {
  const go = was.angleTo(q);
  if (go > step) slerpQ(was, q, step / go, q);
}

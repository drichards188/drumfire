import * as THREE from 'three';
import { smooth, headingOf } from './anim.js';
import { CREW_GAITS } from '../models/v/crew.js';
import { GUNS } from '../sim/tables.js';
import { paced, turn } from './drill_pace.js';

// The drill of a gun without a recoil system that fires off wooden ramps (Rücklaufkeile): the 21 cm Mörser 99, the
// 15 cm Ringkanone C/92 and the 15 cm sFH 93 (render/ww1/<kind>.js spread these hooks into their exports). The
// sources (en.wikipedia "21 cm Mörser 99", "15 cm Ring Kanone C/92", "15 cm sFH 93"): wooden ramps lay behind the
// wheels; at the shot the wheels ran up them and the gun was returned to position by gravity; with no traversing gear
// it was levered back onto its line and re-aimed after every shot.
//   the shot   the carriage runs up the ramps (rig.holdRecoil), stops at the top and rolls back down by its own
//              weight, faster as it comes, with a small rebound at the foot; it comes to rest a degree or so off its
//              line (a turn drawn from the time of the shot, rig.holdLay)
//   relay      0-out1      the two handspike men walk to the handspikes in the wheels
//              heave0-1    three heaves: they bear on the spikes and the gun comes round a third of the way each
//                          time, the left-hand man stepping back to sight between them
//              home0-1     back to their posts
// Everything is a pure function of the piece's job and the time since the shot, as in crews.js. The rig brings the
// places the drill uses (rig.ramp: anchors spikeL, spikeL2, spikeR, spikeR2 and gripAt(side, k, out)), and
// rig.holdRecoil, rig.holdLay and rig.setSpikes; so this module imports no model file.
//
// rampDrill({ spike, t, off, walk }) -> { mechanisms, act, props }
//   spike   { role: -1 | 1 } the two men who work the handspikes (left, right)
//   t       { up, top, down, end } the run up the ramps and the roll back down, s after the shot
//   off     the most the gun comes to rest off its line (degrees)
//   walk    the share of the relay step for the walk out (the same back at the end)
const STRIDE = CREW_GAITS.walk.stride;
const N = 3, V_WALK = 1.4, TURN = 0.7; // heaves; walking speed; seconds for a turn on the spot
const SP_OUT = 0.06, SP_BACK = 0.3; // the handspike man's place off the butt's grip: outboard, behind

const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _g = { x: 0, y: 0, z: 0 };
const toRoot = (crew, x, z, out) => { out.x = x * crew.ca + z * crew.sa; out.z = -x * crew.sa + z * crew.ca; return out; };
const at = (node, out) => node.getWorldPosition(out).applyMatrix4(_inv);

export function rampDrill({ spike = { layer: -1, elevator: 1 }, t = { up: 0.35, top: 0.6, down: 2.2, end: 2.9 }, off = 1.6, walk = 0.16 } = {}) {
  const W = { out1: walk, heave0: walk + 0.02, heave1: 1 - walk - 0.06, home0: 1 - walk - 0.04, home1: 0.97 };
  const OFF = off * Math.PI / 180;
  // how far up the ramps the carriage stands (0 at their foot, 1 at the top) `tf` s after the shot: it decelerates
  // up, stops, and rolls back down under gravity (the distance from the top grows with the square of the time),
  // bumping at the foot
  const backAt = (tf) => {
    if (!(tf >= 0) || tf >= t.end) return 0;
    if (tf < t.up) { const u = tf / t.up; return 1 - (1 - u) * (1 - u); }
    if (tf < t.top) return 1;
    if (tf < t.down) { const u = (tf - t.top) / (t.down - t.top); return 1 - u * u; }
    const u = (tf - t.down) / (t.end - t.down);
    return 0.07 * Math.sin(u * Math.PI) * (1 - u);
  };
  // where the roll left the gun off its line (rad, + left), the same for a shot whatever the frame: from its time
  const offOf = (firedAt) => { const h = Math.sin(firedAt * 12.9898 + 78.233) * 43758.5453; return (h - Math.floor(h) - 0.5) * 2 * OFF; };
  // the share of the way back onto the line at k of the relay step (a third a heave, each in its middle)
  const levered = (k) => {
    if (k < W.heave0) return 0;
    if (k >= W.heave1) return 1;
    const q = (k - W.heave0) / (W.heave1 - W.heave0) * N, i = Math.min(N - 1, Math.floor(q));
    return (i + smooth(q - i, 0.15, 0.6)) / N;
  };
  const heave = (k) => { const q = (k - W.heave0) / (W.heave1 - W.heave0) * N; return q - Math.floor(q); };
  const state0 = (crew) => (crew.ramp ??= { v: 0, off: 0, on: false, ri: GUNS[crew.kind].load.findIndex((s) => s.step === 'relay'), A: { x: 0, z: 0 } });

  function mechanisms(crew, c) {
    const rig = crew.rig, K = rig.ramp;
    if (!K || !rig.holdRecoil) return false;
    const S = state0(crew), p = c.p, fired = p.firedAt > -900;
    S.v = fired ? backAt(c.tf) : 0;
    rig.holdRecoil(S.v);
    // off its line from the foot of the roll until the relay's heaves bring it round (a new cycle starts laid)
    const o = fired ? offOf(p.firedAt) : 0;
    let k = 0;
    if (c.s === 'relay') k = levered(c.k);
    else if (p.job && p.job.i > S.ri) k = 1;
    else if (!p.job && (p.loaded || p.state === 'ready')) k = 1;
    S.off = o * smooth(c.tf, t.top, t.down) * (1 - k);
    rig.holdLay?.(S.off);
    S.on = c.s === 'relay' && fired && c.k < W.home1;
    rig.setSpikes?.(S.on && c.k > W.out1 - 0.01 && c.k < W.home0);
    if (S.on) {
      rig.root.updateMatrixWorld(true);
      _inv.copy(rig.root.matrixWorld).invert();
    }
    return false; // crews.js's own (it updates the rig) goes on
  }

  function act(crew, m, c, h) {
    const S = crew.ramp, K = crew.rig.ramp;
    if (!S?.on || !K) return false;
    const side = spike[m.role];
    if (!side) return false;
    const k = c.k, dur = c.p.job?.dur ?? 20;
    const hx = h.x, hz = h.z, hh = h.h;
    // behind the handspike's butt, a little outboard, facing the gun's way; the carriage stands at the foot of the ramps
    const A = S.A;
    K.gripAt(side, 0, _g);
    toRoot(crew, _g.x + side * SP_OUT, _g.z + SP_BACK, A);
    const face = crew.az;
    let x = A.x, z = A.z, hd = face, pose = 'push', tt = 0;
    if (k < W.out1) {
      // out from his post: a turn into the walk, the walk, a turn to face his work
      const d = Math.hypot(A.x - hx, A.z - hz), way = headingOf(A.x - hx, A.z - hz), ts = k * dur, kw = W.out1 - TURN / dur;
      const e = paced(k, TURN * 0.5 / dur, kw, dur, d, V_WALK, 0.3);
      x = hx + (A.x - hx) * e; z = hz + (A.z - hz) * e;
      hd = ts < kw * dur ? turn(hh, way, ts / TURN) : turn(way, face, (ts - kw * dur) / TURN);
      pose = e > 0 && e < 1 ? 'walk' : 'stand'; tt = e > 0 && e < 1 ? (d * e) / STRIDE : crew.idleT + m.seed;
    } else if (k >= W.home0) {
      // home: a turn, the walk, a turn into his place
      const d = Math.hypot(hx - A.x, hz - A.z), way = headingOf(hx - A.x, hz - A.z), ts = (k - W.home0) * dur, k0 = W.home0 + TURN * 0.6 / dur, k1 = W.home1 - TURN / dur;
      const e = paced(k, k0, k1, dur, d, V_WALK, 0.3);
      x = A.x + (hx - A.x) * e; z = A.z + (hz - A.z) * e;
      hd = k < k1 ? turn(face, way, ts / TURN) : turn(way, hh, (k - k1) * dur / TURN);
      pose = e > 0 && e < 1 ? 'walk' : 'stand'; tt = e > 0 && e < 1 ? (d * e) / STRIDE : crew.idleT + m.seed;
    } else if (k >= W.heave0) {
      // a heave: bear on the spike (the push pose's effort in the middle of the heave), then ease and look along
      // the line (the left-hand man steps back half a pace to sight it between heaves)
      const f = heave(k), bear = smooth(f, 0.05, 0.3) * (1 - smooth(f, 0.6, 0.8));
      tt = bear;
      if (side < 0 && bear < 0.05) {
        const fx = -Math.sin(face), fz = -Math.cos(face);
        x -= fx * 0.35; z -= fz * 0.35; pose = 'stand'; tt = crew.idleT + m.seed;
      }
    }
    m.noEars = true;
    m.put(x, h.y, z, hd, pose, tt);
    // the hands on the handspike's butt while he works it
    if (k < W.out1 || k >= W.home0 || pose === 'stand') return true;
    at(side < 0 ? K.anchors.spikeL : K.anchors.spikeR, _a);
    at(side < 0 ? K.anchors.spikeL2 : K.anchors.spikeR2, _c);
    m.hand(side < 0 ? 'L' : 'R', _a.x, _a.y, _a.z, 1);
    m.hand(side < 0 ? 'R' : 'L', _c.x, _c.y, _c.z, 1);
    return true;
  }

  // the ropes of an old haul (the Mörser 99's rig still has them) are not used: the gun rolls back by its own weight
  function props(crew) {
    const rig = crew.rig;
    if (!rig.setRope || crew.ramp?.ropesOff) return false;
    for (let i = 0; i < 4; i++) rig.setRope(i, null);
    if (crew.ramp) crew.ramp.ropesOff = true;
    return false;
  }

  return { mechanisms, act, props, backAt };
}

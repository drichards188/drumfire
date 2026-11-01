import * as THREE from 'three';
import { smooth, lerp, headingOf } from '../anim.js';
import { CREW_GAITS } from '../../models/v/crew.js';
import { paced, pacedT, turn, along, pathLen } from '../drill_pace.js';
import { GUNS } from '../../sim/tables.js';

// The 28 cm K5 (E) drill on its Vögele turntable (render/crews.js calls these hooks before its own; picked up by
// crews_ww1.js's glob of render/de/). The whole gun, its loading platform and the ammunition wagon coupled behind turn
// with the turntable, so every man rides the traverse frame. The gun is loaded level (loadEl 0). Per loading step (k is
// the step's 0..1):
//   open       the lanyard man walks round to the wedge's handwheel on top of the breech ring and winds it open
//   shell      0-.12 the crane's hook comes down over the ammunition wagon behind the gun, .12-.2 the slinger (on the
//              wagon) hooks the shell on, .2-.36 it is hoisted clear of the platform's rear railing, .36-.54 the crab
//              runs it forward along the runway over the shell car waiting at the crane, .54-.6 it is lowered onto the
//              car (the car men steadying it), .6-.64 unhooked, then the hook goes up and the crab back over the wagon;
//              .66-.95 the car men push the car forward to the breech, then step aside onto the left walkway
//   ram        the left pair of rammers lifts the 4.4 m staff off the left railing and swings it into line while the
//              right pair crosses behind the car to the right of it; all four ram the shell home 1.45 m past the
//              breech face, draw the staff back, swing it out and hang it up again
//   cartridge  the two charge men lift the charge (the fore charge bag ahead of the brass main case) off the rack on
//              the right of the platform, carry it forward between them along the right of the platform and lay it on
//              the car; the rammers ram it in behind the shell. The car men come back to the car.
//   close      the wedge is wound shut (the lanyard man at its handwheel); the car men run the car back to the crane
//              (through the close and the prime: the breech dips into the well ahead of the platform as the gun is
//              laid, so the car must be clear of it by then)
//   prime      the lanyard man primes the lock behind the breech;  lay / ready / the shot: crews.js
// Meanwhile the fuze man sets the fuze of the next round on the wagon. Every walk runs at an even pace with short ramps
// and every turn takes its time (drill_pace.js). Worked in the turntable's frame at zero elevation (crew.az turns it into
// the rig's root frame), as a pure function of the piece's step, its time in the step and the time since the shot.
export const ROLES = {
  chief: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'k5Lan',
  rammer1: 'k5Ram', rammer2: 'k5Ram', rammer3: 'k5Ram', rammer4: 'k5Ram',
  car1: 'k5Car', car2: 'k5Car', charge1: 'k5Chg', charge2: 'k5Chg', hoist: 'k5Winch', sling: 'k5Sling', fuze: 'k5Fuze',
};
export const STAFF = 4.4;

// the places the drill uses come with the rig (rig.k5, models/v/de/k5.js K5), so this module does not import the
// model's file (crews.js loads it with every crew)
let K5 = null, TY, BRE, WALK, ZB, ZL, ZW, HOOK, SEAT, RACK, SR, SHELL, HANDLES, HALF, SLING;
function use(crew) {
  const K = crew.rig.k5;
  if (K === K5) return !!K;
  K5 = K;
  if (!K) return false;
  ({ TY, BRE, PY: WALK, ZB, ZL, ZW, HOOK, SEAT, RACK, STAFF_REST: SR, SHELL, HANDLES, SLING } = K);
  HALF = SHELL.len / 2;
  return true;
}
const STRIDE = CREW_GAITS.walk.stride, SSTRIDE = CREW_GAITS.sidestep.stride;
const V_WALK = 1.25; // m/s, a brisk walk on the platform
const RAM_OFF = [2.3, 3.25]; // where the front and rear pairs hold the staff behind its head
const ASIDE = [[-1.8, 1.95], [-1.8, 2.9]]; // the car men out of the rammers' way, on the left walkway beside the breech
const CAR_LANE = -1.1; // the car men's lane on the left of the car (its wheels reach 0.78 from the middle)
const RAIL_TOP = { x: -0.42, dy: -0.16 }; // the car's top side rail (car frame: x, y below the bore's height)
const CHG_X = 1.85; // the charge men's lane on the right of the platform
const LANE = 1.05; // the rammers walk beside the car, clear of its wheels, and push on the staff's cross handles
const TAKE_X = -1.85; // the left pair stands here to lift the staff off its hooks on the left railing
const BAR = 0.8; // the cross handles' half length
const WRENCH_X = 1.4; // where the lanyard man stands to wind the wedge's handwheel (on the right walkway, abreast of it)
const PRIME = { x: 0.95, dz: 0.42 }; // and to prime the lock, behind the breech's right corner (z: BRE + dz)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _p = { x: 0, z: 0 };
const _path3 = [0, 1, 2, 3].map(() => ({ x: 0, z: 0 }));
const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }], _P = { x: 0, z: 0, h: 0, d: 0, len: 0 };

// the hook's and the crab's windows in the shell step
const HK = { down: [0, 0.12], sling: [0.12, 0.2], up: [0.2, 0.36], run: [0.36, 0.54], set: [0.54, 0.6], free: [0.6, 0.64], back: [0.64, 0.76], home: [0.64, 0.82], push: [0.66, 0.95] };
// The rammer staff's stroke windows (shares of the step): swung into line off the hooks, the push, the draw back, swung
// out. The rammers' own walks fit round them.
// The left pair stand by the staff's hooks (their posts), the right pair on the right of the car's track behind the
// breech, so nobody crosses the platform behind the car.
const RAMW = {
  ram: { take: [0, 0.06], cross: [0, 0.12], swing: [0.06, 0.2], push: [0.21, 0.52], draw: [0.55, 0.81], out: [0.83, 0.95] },
  cartridge: { take: [0.2, 0.25], cross: [0.22, 0.34], swing: [0.25, 0.36], push: [0.4, 0.56], draw: [0.6, 0.74], out: [0.76, 0.87] },
};
// the step lengths (s) of the job (crew upgrades scale them all alike)
const durOf = (c) => c.p.job?.dur ?? 10;
// the close and the prime from the table, for the car's run back through both
const LOAD = GUNS.k5?.load ?? [];
const D_CLOSE = LOAD.find((s) => s.step === 'close')?.dur ?? 4, D_PRIME = LOAD.find((s) => s.step === 'prime')?.dur ?? 2;
function stroke(c, crew) {
  const W = RAMW[c.s];
  if (!W) return null;
  const k = c.k, dur = durOf(c), ram = c.s === 'ram';
  const z0 = ram ? ZB + HALF : ZB + 0.05 + crew.bagLen / 2, z1 = ram ? SEAT + HALF : BRE - 0.02, L = Math.abs(z0 - z1);
  const line = smooth(k, W.swing[0], W.swing[1]) * (1 - smooth(k, W.out[0], W.out[1]));
  const pushE = paced(k, W.push[0], W.push[1], dur, L, ram ? 1.0 : 0.9, 0.35);
  const drawE = paced(k, W.draw[0], W.draw[1], dur, L, 1.1, 0.35);
  return { W, line, z: lerp(z0, z1, pushE * (1 - drawE)), z0, z1, pushE, drawE };
}

// the staff's head (turntable frame) and how far it is in line with the bore (0 on its hooks, 1 in line)
function staffAt(c, crew, out) {
  const S = stroke(c, crew);
  const line = S ? S.line : 0, z = S ? S.z : ZB + HALF;
  out.x = lerp(SR.x, 0, line); out.y = lerp(SR.y, TY, line) + Math.sin(line * Math.PI) * 0.25; out.z = lerp(SR.z, z, line);
  out.line = line; out.S = S;
  return out;
}
const STAFF_P = { x: 0, y: 0, z: 0, line: 0, S: null };

// The shell car's run: { z, a, b, dir } with a and b the seconds since it set off and since it stopped (a < 0 before,
// b > 0 after), dir +1 back toward the crane; null while it stands still.
const RUN = { z: 0, a: 0, b: 0, dir: 0 };
const V_CAR = 1.15, R_CAR = 0.5;
function carRun(c) {
  const s = c.s, k = c.k, dur = durOf(c), d = ZL - ZB;
  if (s === 'shell') {
    const t0 = HK.push[0] * dur, tw = Math.min((HK.push[1] - HK.push[0]) * dur, d / V_CAR + R_CAR), t = k * dur;
    RUN.z = lerp(ZL, ZB, paced(k, HK.push[0], HK.push[1], dur, d, V_CAR, R_CAR));
    RUN.a = t - t0; RUN.b = t - t0 - tw; RUN.dir = -1;
    return RUN;
  }
  if (s === 'close' || s === 'prime') {
    // back through the close and the prime, setting off as the wedge starts to close
    const dc = s === 'close' ? dur : dur * D_CLOSE / D_PRIME, dp = s === 'close' ? dur * D_PRIME / D_CLOSE : dur;
    const t = s === 'close' ? k * dur : dc + k * dur, t0 = 0.35, tw = Math.min(dc + dp - t0 - 0.2, d / V_CAR + R_CAR);
    const tt = Math.max(0, Math.min(1, (t - t0) / tw));
    RUN.z = lerp(ZB, ZL, pacedT(tt * tw, d, d / Math.max(0.1, tw - R_CAR), R_CAR));
    RUN.a = t - t0; RUN.b = t - t0 - tw; RUN.dir = 1;
    return RUN;
  }
  RUN.z = s === 'ram' || s === 'cartridge' ? ZB : ZL;
  RUN.a = -1e3; RUN.b = -1e3; RUN.dir = 0;
  return RUN;
}
const carZ = (c) => carRun(c).z;
// in the ram step: how long the car had stood at the breech when the shell step ended (the shell step's length from
// the table, scaled like the ram's)
const D_SHELL = LOAD.find((s) => s.step === 'shell')?.dur ?? 16, D_RAM = LOAD.find((s) => s.step === 'ram')?.dur ?? 8;
const D_CART = LOAD.find((s) => s.step === 'cartridge')?.dur ?? 12;
function carStopEnd(ramDur) {
  const dur = ramDur * D_SHELL / D_RAM, d = ZL - ZB;
  return Math.max(0, (1 - HK.push[0]) * dur - Math.min((HK.push[1] - HK.push[0]) * dur, d / V_CAR + R_CAR));
}
// the hook's height and the crab's place along the runway
function hookY(c) {
  if (c.s !== 'shell') return HOOK.up;
  const k = c.k;
  if (k < HK.down[1]) return lerp(HOOK.up, HOOK.down, smooth(k, HK.down[0], HK.down[1]));
  if (k < HK.up[0]) return HOOK.down;
  if (k < HK.up[1]) return lerp(HOOK.down, HOOK.lift, smooth(k, HK.up[0], HK.up[1]));
  if (k < HK.set[0]) return HOOK.lift;
  if (k < HK.set[1]) return lerp(HOOK.lift, HOOK.set, smooth(k, HK.set[0], HK.set[1]));
  if (k < HK.back[0]) return HOOK.set;
  return lerp(HOOK.set, HOOK.up, smooth(k, HK.back[0], HK.back[1]));
}
function crabZ(c) {
  if (c.s !== 'shell') return ZW;
  const k = c.k;
  if (k < HK.run[0]) return ZW;
  if (k < HK.home[0]) return lerp(ZW, ZL, smooth(k, HK.run[0], HK.run[1]));
  return lerp(ZL, ZW, smooth(k, HK.home[0], HK.home[1]));
}

// The charge: on the rack, lifted and carried forward between the two charge men along the right of the platform at
// hip height (they fetch it during the ram, while the rack is clear, and walk on with it into the cartridge step), laid
// on the car, rammed. CHR, CHC: the charge men's windows in the ram and the cartridge steps.
const CHR = { walk: [0.45, 0.55], lift: [0.55, 0.65], turn1: [0.65, 0.7], carry: [0.72, 1] };
const CHC = { carry: [0, 0.2], turn2: [0.2, 0.23], lay: [0.23, 0.3], back: [0.3, 0.36], home: [0.38, 0.8] };
const CARRY_X = CHG_X - 0.4, CARRY_DY = 0.8; // the charge between them: inboard of their lane, at hip height
// the carry's share done: one even walk from the rack to the car across the end of the ram and the start of the cartridge
function carryE(c) {
  const dur = durOf(c), ram = c.s === 'ram';
  const dR = ram ? dur : dur * D_RAM / D_CART, dC = ram ? dur * D_CART / D_RAM : dur;
  const T = (CHR.carry[1] - CHR.carry[0]) * dR + (CHC.carry[1] - CHC.carry[0]) * dC;
  const t = ram ? (c.k - CHR.carry[0]) * dR : (CHR.carry[1] - CHR.carry[0]) * dR + c.k * dC;
  const D = RACK.z - ZB - 0.05;
  return pacedT(Math.max(0, t), D, D / Math.max(0.5, T - 0.4), 0.4);
}
function bagAt(c, crew, out) {
  const s = c.s, k = c.k, L = crew.bagLen;
  out.vis = true;
  out.x = RACK.x; out.y = RACK.y; out.z = RACK.z;
  const zc = ZB + 0.05, cy = WALK + CARRY_DY;
  if (s === 'ram') {
    if (k < CHR.lift[0]) return out;
    if (k < CHR.carry[0]) { const e = smooth(k, CHR.lift[0], CHR.lift[1]); out.x = lerp(RACK.x, CARRY_X, e); out.y = lerp(RACK.y, cy, e) + 0.08 * Math.sin(Math.PI * e); return out; }
    out.x = CARRY_X; out.y = cy; out.z = lerp(RACK.z, zc, carryE(c));
    return out;
  }
  if (s !== 'cartridge') return out;
  if (k < CHC.lay[0]) { out.x = CARRY_X; out.y = cy; out.z = lerp(RACK.z, zc, carryE(c)); return out; }
  const S = stroke(c, crew);
  if (k < CHC.back[0]) { const e = smooth(k, CHC.lay[0], CHC.lay[1]); out.x = lerp(CARRY_X, 0, e); out.y = lerp(cy, TY, e) + 0.12 * Math.sin(Math.PI * e); out.z = zc; return out; }
  out.x = 0; out.y = TY;
  out.z = lerp(zc, BRE - 0.02 - L / 2, S ? S.pushE : 0);
  out.vis = !S || S.drawE <= 0;
  return out;
}
const BAG_P = { x: 0, y: 0, z: 0, vis: true };

// turntable frame -> rig root
const toRoot = (crew, x, z, out = _p) => { out.x = x * crew.ca + z * crew.sa; out.z = -x * crew.sa + z * crew.ca; return out; };
const toRootV = (crew, x, y, z, v) => v.set(x * crew.ca + z * crew.sa, y, -x * crew.sa + z * crew.ca);
function place(crew, m, x, y, z, h, pose, t) {
  toRoot(crew, x, z);
  m.put(_p.x, y, _p.z, h + crew.az, pose, t);
}
// a walk in the turntable frame from a to b, e its share of the way (from paced), heading from h0 into the walk and out
// of it to h1 (each over the walk's first and last 0.6 m)
function walkE(crew, m, ax, az, bx, bz, e, y, h0, h1, gait = 'walk') {
  _path[0].x = ax; _path[0].z = az; _path[1].x = bx; _path[1].z = bz;
  along(_path, 2, e, _P, h0, h1);
  const moving = e > 0 && e < 1 && _P.len > 0.05;
  const stride = gait === 'carryWalk' ? CREW_GAITS.carryWalk.stride : STRIDE;
  place(crew, m, _P.x, y, _P.z, moving ? _P.h : e >= 1 ? h1 : h0, moving ? gait : 'stand', moving ? _P.d / stride : crew.idleT + m.seed);
}
const hand = (crew, m, side, x, y, z, w) => { toRootV(crew, x, y, z, _v); m.hand(side, _v.x, _v.y, _v.z, w); };
const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
const win = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));

export function state(crew, c) {
  if (!use(crew)) return false;
  if (!crew.k5Bars) {
    // the staff's cross handles, where the two pairs push
    crew.k5Bars = true;
    const iron = crew.staff.children[1]?.material;
    for (const off of RAM_OFF) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2 * BAR, 6).rotateZ(Math.PI / 2), iron);
      bar.position.z = off;
      bar.castShadow = true;
      crew.staff.add(bar);
    }
  }
  // nothing of crews.js's generic tray and staff: this drill places its own
  crew.staffA = null;
  crew.shellA_a = null;
  crew.ramK = 0;
  staffAt(c, crew, STAFF_P);
  bagAt(c, crew, BAG_P);
  return true;
}

export function mechanisms(crew, c) {
  if (!use(crew)) return false;
  const rig = crew.rig;
  rig.setTrolley?.(carZ(c));
  rig.setCrab?.(crabZ(c));
  rig.setHoist?.(hookY(c));
  rig.update?.(0.016);
  return true;
}

export function act(crew, m, c, h) {
  if (!use(crew)) return false;
  switch (m.beh) {
    case 'k5Ram': ramMan(crew, m, c); return true;
    case 'k5Car': carMan(crew, m, c); return true;
    case 'k5Chg': chargeMan(crew, m, c); return true;
    case 'k5Lan': return lanyardMan(crew, m, c, h);
    case 'k5Winch': {
      // the hook down, up, the crab's run forward, the lowering, the hook up and the crab home: he winds the crank
      const k = c.s === 'shell' ? c.k : -1, on = (k >= 0 && k < HK.down[1]) || (k > HK.up[0] && k < HK.set[1]) || (k > HK.back[0] && k < HK.home[1]);
      place(crew, m, m.spot.x, m.spot.y, m.spot.z, m.spot.heading, on ? 'operate' : 'stand', on ? c.now * 1.3 : crew.idleT + m.seed);
      return true;
    }
    case 'k5Sling': {
      // on the wagon's deck beside the shell: he steps in, stoops and hooks the sling on round it, steps back
      const k = c.s === 'shell' ? c.k : -1;
      const e = smooth(k, 0.07, 0.11) * (1 - smooth(k, 0.2, 0.24)), w = smooth(k, 0.11, 0.135) * (1 - smooth(k, 0.17, 0.2));
      const moving = e > 0.001 && e < 0.999, back = k > 0.2, d = m.spot.x - SLING.x;
      place(crew, m, m.spot.x - d * e, m.spot.y, m.spot.z, m.spot.heading, moving ? 'walk' : e >= 0.999 ? 'lift' : 'stand', moving ? (back ? -1 : 1) * d * (back ? 1 - e : e) / STRIDE : e >= 0.999 ? 0.6 : crew.idleT + m.seed);
      if (w > 0.01) {
        const y = K5.WAGON_Y + SHELL.rad + 0.04;
        hand(crew, m, 'L', 0.12, y, ZW + 0.45, w);
        hand(crew, m, 'R', 0.12, y, ZW - 0.45, w);
      }
      return true;
    }
    case 'k5Fuze': {
      // sets the fuze of the next round lying on the wagon's other cradle while the crane works
      const k = c.s === 'shell' ? c.k : -1, w = win(k, 0.24, 0.3, 0.52, 0.58);
      place(crew, m, m.spot.x, m.spot.y, m.spot.z, m.spot.heading, w > 0.5 ? 'operate' : 'stand', w > 0.5 ? c.now * 0.8 : crew.idleT + m.seed);
      if (w > 0.01) hand(crew, m, 'R', -0.75, K5.WAGON_Y + 0.03, ZW - HALF - 0.02, w);
      return true;
    }
  }
  return false;
}

// The rammers. The left pair (1, 3) step to the staff on its hooks, lift it, carry it into line sidestepping to their
// lane; the right pair (2, 4) cross behind the car to theirs and take hold once it is in line. All four walk the
// stroke facing the breech in one gait, the phase their place along the lane, so their feet stay put through the
// push, the hold and the draw. Then the right pair let go and go home, the left pair swing it out and hang it up.
function ramMan(crew, m, c) {
  const i = +m.role.slice(-1) - 1, pair = i >> 1, side = i % 2 ? 1 : -1, off = RAM_OFF[pair];
  const hx = m.spot.x, hz = m.spot.z, hh = m.spot.heading, k = c.k, st = STAFF_P, S = st.S, dur = durOf(c);
  if (!S) { place(crew, m, hx, WALK, hz, hh, 'stand', crew.idleT + m.seed); return; }
  const W = S.W, lx = side * LANE, zS = S.z0 + off, zH = SR.z + off;
  const left = side < 0;
  const inLane = () => place(crew, m, lx, WALK, S.z + off, 0, 'walk', (zS - (S.z + off)) / STRIDE);
  let hold = 0;
  if (left) {
    // (their post is by the hooks: a turn on the spot to face along the staff, a step if crews.js moved the post)
    const t0 = W.take[0], d0 = dist(hx, hz, TAKE_X, zH);
    const homeK = W.out[1] + 0.01, dH = dist(TAKE_X, zH, hx, hz);
    if (k < t0) place(crew, m, hx, WALK, hz, hh, 'stand', crew.idleT + m.seed);
    else if (k < W.swing[0]) {
      if (d0 > 0.1) walkE(crew, m, hx, hz, TAKE_X, zH, paced(k, t0, W.swing[0], dur, d0, V_WALK, 0.3), WALK, hh, 0);
      else place(crew, m, TAKE_X, WALK, zH, turn(hh, 0, (k - t0) * dur / 0.4), 'stand', crew.idleT + m.seed);
      hold = smooth(k, W.swing[0] - 0.02, W.swing[0]);
    }
    else if (k < W.swing[1]) { swingMan(crew, m, st.line, lx, zH, zS); hold = 1; }
    else if (k < W.out[0]) { inLane(); hold = 1; }
    else if (k < W.out[1]) { swingMan(crew, m, st.line, lx, zH, zS); hold = 1; }
    else if (k < homeK) { place(crew, m, TAKE_X, WALK, zH, 0, 'stand', crew.idleT + m.seed); hold = 1 - smooth(k, homeK - 0.01, homeK); }
    else if (dH > 0.1) walkE(crew, m, TAKE_X, zH, hx, hz, paced(k, homeK, 1, dur, dH, V_WALK, 0.3), WALK, 0, hh);
    else place(crew, m, TAKE_X, WALK, zH, turn(0, hh, (k - homeK) * dur / 0.4), 'stand', crew.idleT + m.seed);
  } else {
    const d0 = dist(hx, hz, lx, zS), go = W.out[0] + 0.02, dH = dist(lx, zS, hx, hz);
    if (k < W.cross[0]) place(crew, m, hx, WALK, hz, hh, 'stand', crew.idleT + m.seed);
    else if (k < W.push[0] && st.line < 0.999) step(crew, m, hx, hz, lx, zS, k, W.cross[0], W.cross[1], dur, hh, 0);
    else if (k < go) inLane();
    else step(crew, m, lx, zS, hx, hz, k, go, Math.min(1, go + 0.12), dur, 0, hh);
    hold = k < go ? smooth(st.line, 0.85, 0.98) : 1 - smooth(k, go - 0.02, go);
  }
  // hands on the staff at his hold point: on the cross handle's end once it is in line, on the staff itself on the hooks
  if (hold > 0.01) {
    const hz2 = st.z + off, hx2 = st.x + side * 0.68 * st.line;
    hand(crew, m, 'R', hx2, st.y, hz2 - 0.05, hold);
    hand(crew, m, 'L', hx2 + side * 0.12 * st.line, st.y, hz2 + 0.05, hold);
  }
}

// a short step from a to b in the window k0..k1, turning from h0 to h1 on the way (over at least 0.6 s)
function step(crew, m, ax, az, bx, bz, k, k0, k1, dur, h0, h1) {
  const d = dist(ax, az, bx, bz), e = paced(k, k0, k1, dur, d, 0.9, 0.3), moving = e > 0 && e < 1 && d > 0.05;
  const h = turn(h0, h1, (k - k0) * dur / Math.max(0.6, d / 0.9 + 0.3));
  place(crew, m, lerp(ax, bx, e), WALK, lerp(az, bz, e), h, moving ? 'walk' : 'stand', moving ? d * e / STRIDE : crew.idleT + m.seed);
}

// a left rammer while the staff swings between its hooks (outboard of him) and the line (inboard): he sidesteps
// inboard with it and gives back a step as it passes across in front of him, so it never goes through him
function swingMan(crew, m, e, lx, zH, zS) {
  const x = lerp(TAKE_X, lx, e), z = lerp(zH, zS, e) + 0.42 * Math.sin(Math.PI * e);
  place(crew, m, x, WALK, z, 0, e > 0.01 && e < 0.99 ? 'sidestep' : 'stand', (x - TAKE_X) / SSTRIDE);
}

// The two car men in their lane on the left of the car. Standing by it they face it; to move it they turn into the
// direction of travel over 0.4 s before it sets off (and back after it stops), the inner hand on its top rail, walking
// at its pace. When it is at the breech they step aside onto the left walkway and come back in the cartridge step.
function carMan(crew, m, c) {
  const j = m.role === 'car1' ? 0 : 1, s = c.s, k = c.k, R = carRun(c), zc = R.z, hzc = HANDLES[j], dur = durOf(c);
  const FACE = -Math.PI / 2; // facing the car (+X)
  const at = (z) => z + hzc;
  let grip = 0, inner = 'L';
  // aside after the car reaches the breech (in the shell step once it has stopped, through the ram), back for the close
  const awayT = s === 'shell' && R.b > 0 ? R.b : s === 'ram' ? carStopEnd(dur) + k * dur : -1;
  const dA = dist(CAR_LANE, at(ZB), ASIDE[j][0], ASIDE[j][1]);
  if (awayT >= 0) {
    const e = pacedT(Math.max(0, awayT - 0.3), dA, V_WALK, 0.3);
    walkE(crew, m, CAR_LANE, at(ZB), ASIDE[j][0], ASIDE[j][1], e, WALK, 0, FACE);
  } else if (s === 'cartridge') {
    const e = paced(k, 0.84, 1, dur, dA, 1.1, 0.3);
    walkE(crew, m, ASIDE[j][0], ASIDE[j][1], CAR_LANE, at(ZB), e, WALK, FACE, FACE);
  } else {
    let h = FACE, moving = false;
    if (R.dir) {
      const travel = R.dir > 0 ? Math.PI : 0;
      // turned into the way before it sets off, back to face the car after it stops
      h = R.a < 0 ? turn(FACE, travel, (R.a + 0.45) / 0.4) : R.b > 0 ? turn(travel, FACE, R.b / 0.4) : travel;
      moving = R.a > 0 && R.b < 0;
      inner = R.dir > 0 ? 'L' : 'R';
      grip = smooth(R.a, -0.5, -0.1) * (1 - smooth(R.b, 0.1, 0.5));
    }
    place(crew, m, CAR_LANE, WALK, at(zc), h, moving ? 'walk' : 'stand', moving ? zc / STRIDE * (R.dir > 0 ? 1 : -1) : crew.idleT + m.seed);
    // facing the car while the shell comes down onto it: both hands on the rail, steadying it
    if (s === 'shell' && k > HK.set[0] && k < HK.free[1]) grip = Math.max(grip, win(k, HK.set[0], HK.set[0] + 0.03, HK.free[1] - 0.03, HK.free[1]));
  }
  if (grip > 0.01) {
    hand(crew, m, inner, RAIL_TOP.x, TY + RAIL_TOP.dy, zc + hzc, grip);
    if (s === 'shell' && k > HK.set[0] && k < HK.free[1]) hand(crew, m, inner === 'L' ? 'R' : 'L', RAIL_TOP.x, TY + RAIL_TOP.dy, zc + hzc + (j ? 0.3 : -0.3), win(k, HK.set[0], HK.set[0] + 0.03, HK.free[1] - 0.03, HK.free[1]));
  }
}

// The two charge men: walk to the rack during the ram, lift the charge off it together, turn and carry it forward in
// file along the right of the platform (the inner hand on its end, the outer arm swinging) into the cartridge step, turn
// to the car, step in and lay it on, step back, and go back to their places by the rack.
function chargeMan(crew, m, c) {
  const j = m.role === 'charge1' ? 0 : 1, s = c.s, k = c.k, b = BAG_P, L = crew.bagLen, dur = durOf(c);
  const hx = m.spot.x, hz = m.spot.z, FACE = Math.PI / 2; // facing the rack and the car (-X)
  const endZ = (zc) => zc + (j ? 1 : -1) * (L / 2 + 0.12); // his end of the charge (charge1 the front)
  const lane = CHG_X, inX = 1.15, zc0 = ZB + 0.05;
  let hands = 0, both = false;
  const carrying = () => {
    const e = carryE(c), z = endZ(lerp(RACK.z, zc0, e));
    place(crew, m, lane, WALK, z, 0, e > 0 && e < 1 ? 'walk' : 'stand', (RACK.z - lerp(RACK.z, zc0, e)) / STRIDE);
    hands = 1;
  };
  if (s === 'ram') {
    if (k < CHR.walk[0]) place(crew, m, hx, WALK, hz, FACE, 'stand', crew.idleT + m.seed);
    else if (k < CHR.walk[1]) step(crew, m, hx, hz, lane, endZ(RACK.z), k, CHR.walk[0], CHR.walk[1], dur, FACE, FACE);
    else if (k < CHR.turn1[0]) { place(crew, m, lane, WALK, endZ(RACK.z), FACE, 'lift', 0.35 + 0.5 * smooth(k, CHR.lift[0], CHR.lift[1])); hands = smooth(k, CHR.lift[0], CHR.lift[0] + 0.02); both = true; }
    else if (k < CHR.carry[0]) { place(crew, m, lane, WALK, endZ(RACK.z), turn(FACE, 0, smooth(k, CHR.turn1[0], CHR.turn1[1])), 'stand', 0); hands = 1; }
    else carrying();
  } else if (s === 'cartridge') {
    if (k < CHC.carry[1]) carrying();
    else if (k < CHC.lay[0]) { place(crew, m, lane, WALK, endZ(zc0), turn(0, FACE, smooth(k, CHC.turn2[0], CHC.turn2[1])), 'stand', 0); hands = 1; }
    else if (k < CHC.back[0]) {
      // two steps in toward the car with it, lifting it over the car's side
      const e = paced(k, CHC.lay[0], CHC.lay[0] + 0.05, dur, lane - inX, 1.0, 0.25);
      place(crew, m, lerp(lane, inX, e), WALK, endZ(zc0), FACE, e > 0 && e < 1 ? 'walk' : 'operate', e > 0 && e < 1 ? (lane - inX) * e / STRIDE : 0);
      hands = 1 - smooth(b.x, 0.5, 0.25); both = true;
    } else if (k < CHC.back[1]) {
      // and back out, stepping backwards
      const e = paced(k, CHC.back[0], CHC.back[1], dur, lane - inX, 0.9, 0.25);
      place(crew, m, lerp(inX, lane, e), WALK, endZ(zc0), FACE, e > 0 && e < 1 ? 'walk' : 'stand', e > 0 && e < 1 ? -(lane - inX) * e / STRIDE : crew.idleT + m.seed);
    } else if (k < CHC.home[0]) place(crew, m, lane, WALK, endZ(zc0), FACE, 'stand', crew.idleT + m.seed);
    else {
      // back to their places by the rack along the right of the platform
      const d = dist(lane, endZ(zc0), hx, hz);
      walkE(crew, m, lane, endZ(zc0), hx, hz, paced(k, CHC.home[0], CHC.home[1], dur, d, V_WALK, 0.3), WALK, FACE, FACE);
    }
  } else place(crew, m, hx, WALK, hz, FACE, 'stand', crew.idleT + m.seed);
  if (hands > 0.01) {
    // the inner hand under his end of the charge (both while lifting it and laying it in)
    const ez = b.z + (j ? 1 : -1) * (L / 2 - 0.1);
    hand(crew, m, j ? 'L' : 'R', b.x + 0.04, b.y - 0.12, ez, hands);
    if (both) hand(crew, m, j ? 'R' : 'L', b.x + 0.04, b.y - 0.12, ez - (j ? 0.25 : -0.25), hands);
  }
}

// The lanyard man steps from his post on the right walkway to the wedge's handwheel on the right of the breech ring as
// the gun comes down to load, winds it open, steps back while the shell comes up and the charge goes in, winds it shut,
// goes round behind the breech's right corner to prime the lock on its rear face, and is back at his post during the
// lay (behind the breech first, which drops into the well as the gun is laid), where crews.js's lanyard drill takes
// over.
function lanyardMan(crew, m, c, h) {
  const s = c.s, k = c.k, rig = crew.rig, dur = durOf(c);
  const hx = m.spot.x, hz = m.spot.z, hh = m.spot.heading;
  const wx = WRENCH_X, wz = K5.TZ + K5.CRANK.z, px = PRIME.x, pz = BRE + PRIME.dz;
  const FACE = Math.PI / 2; // facing the breech (-X)
  const faceP = headingOf(K5.LOCK.x - px, BRE - pz);
  let work = 0, target = null;
  _inv.copy(rig.root.matrixWorld).invert();
  const wheelAt = (spin, out) => {
    // a point on the handwheel's rim (it turns in the y-z plane, its axis across the bore), in root space
    _w.set(K5.CRANK.x + 0.05, K5.CRANK.y + Math.sin(spin) * 0.18, K5.CRANK.z + Math.cos(spin) * 0.18);
    return rig.pivots.recoil.localToWorld(out.copy(_w)).applyMatrix4(_inv);
  };
  const dW = dist(hx, hz, wx, wz);
  const atWheel = (w) => { place(crew, m, wx, WALK, wz, FACE, 'operate', crew.idleT + m.seed); work = w; target = 'wheel'; };
  // round behind the breech's right corner: from the wheel to the lock (e 0..1), or from the lock to his post (back)
  const corner = (e, back) => {
    const a = back ? [px, pz] : [wx, wz], b = back ? [hx, hz] : [px, pz];
    _path3[0].x = a[0]; _path3[0].z = a[1]; _path3[1].x = 1.55; _path3[1].z = pz; _path3[2].x = b[0]; _path3[2].z = b[1];
    along(_path3, 3, e, _P, back ? faceP : FACE, back ? hh : faceP);
    const moving = e > 0 && e < 1;
    place(crew, m, _P.x, WALK, _P.z, moving ? _P.h : e >= 1 ? (back ? hh : faceP) : (back ? faceP : FACE), moving ? 'walk' : 'stand', moving ? _P.d / STRIDE : crew.idleT + m.seed);
  };
  const cornerLen = (back) => (back ? dist(px, pz, 1.55, pz) + dist(1.55, pz, hx, hz) : dist(wx, wz, 1.55, pz) + dist(1.55, pz, px, pz));
  if (s === 'depress' && k > 0.7) walkE(crew, m, hx, hz, wx, wz, paced(k, 0.7, 0.95, dur, dW, 0.9, 0.3), WALK, hh, FACE);
  else if (s === 'open') atWheel(win(k, 0.05, 0.12, 0.82, 0.9));
  else if (s === 'shell' && k < 0.12) walkE(crew, m, wx, wz, hx, hz, paced(k, 0.02, 0.12, dur, dW, 0.9, 0.3), WALK, FACE, hh);
  else if (s === 'cartridge' && k > 0.85) walkE(crew, m, hx, hz, wx, wz, paced(k, 0.85, 0.97, dur, dW, 0.9, 0.3), WALK, hh, FACE);
  else if (s === 'close' && k < 0.5) atWheel(win(k, 0.03, 0.1, 0.42, 0.5));
  else if (s === 'close') corner(paced(k, 0.5, 0.97, dur, cornerLen(false), 1.0, 0.3), false);
  else if (s === 'prime') { place(crew, m, px, WALK, pz, faceP, 'operate', crew.idleT + m.seed); work = win(k, 0.08, 0.2, 0.75, 0.92); target = 'lock'; }
  else if (s === 'lay' && k < 0.3) corner(paced(k, 0, 0.3, dur, cornerLen(true), V_WALK, 0.3), true);
  else { crew.lanyardMan(m, c, h); return true; }
  if (work > 0.01) {
    if (target === 'wheel') {
      // both hands on the rim, half a turn apart, winding
      const spin = c.now * 2.4;
      wheelAt(spin, _v); m.hand('R', _v.x, _v.y, _v.z, work);
      wheelAt(spin + Math.PI, _v); m.hand('L', _v.x, _v.y, _v.z, work * 0.9);
    } else {
      _w.set(K5.LOCK.x, K5.LOCK.y, K5.LOCK.z);
      rig.pivots.recoil.localToWorld(_v.copy(_w)).applyMatrix4(_inv);
      m.hand('R', _v.x, _v.y, _v.z, work);
    }
  }
  return true;
}

export function props(crew, c) {
  if (!use(crew)) return false;
  const A = crew.shellA, B = crew.shellB, s = c.s, k = c.k;
  const yaw = crew.az, S = STAFF_P.S;
  // the next shell on the wagon under the crane
  const onWagon = !((s === 'shell' && k >= HK.sling[0]) || s === 'ram');
  toRootV(crew, 0, K5.WAGON_Y, ZW, _v);
  crew.placeProp(B, _v, yaw, 0, onWagon);
  // the shell in hand: slung, hoisted, run forward on the crab, on the car, rammed (with the staff's head, until home)
  let vis = false;
  if (s === 'shell' && k >= HK.sling[0]) {
    vis = true;
    if (k < HK.up[0]) toRootV(crew, 0, K5.WAGON_Y, ZW, _v);
    else if (k < HK.free[0]) toRootV(crew, 0, hookY(c) - K5.HANG, crabZ(c), _v);
    else toRootV(crew, 0, TY, carZ(c), _v);
  } else if (s === 'ram' && S && S.drawE <= 0) {
    vis = true;
    toRootV(crew, 0, TY, lerp(ZB, SEAT, S.pushE), _v);
  }
  crew.placeProp(A, _v, yaw, 0, vis);
  // the charge: on the rack, carried, on the car, rammed
  const b = BAG_P;
  toRootV(crew, b.x, b.y, b.z, _v);
  crew.placeProp(crew.bag, _v, yaw, 0, b.vis);
  // the staff: on its hooks, or in the rammers' hands
  const st = STAFF_P;
  toRootV(crew, st.x, st.y, st.z, _v);
  crew.placeProp(crew.staff, _v, yaw, 0, true);
  crew.staff.rotation.z = (1 - st.line) * Math.PI / 2; // on its hooks the cross handles stand upright, out of the walkway
  crew.staff.updateMatrix();
  return true;
}

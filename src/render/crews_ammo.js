// The max-quality battery's ammunition at the gun (shots/maxq/PLAN.md, hero only; the research and its estimates in
// shots/maxq/research/mrs18-ammunition.md): what a hero GunCrew of the Mörser 18 does with the real rounds instead of the
// game's generic props. render/crews.js calls in only behind `crew.ammo`, which only a hero crew of a kind in AMMO_KINDS
// gets, so every other drill is untouched.
//
//   the props        the 21 cm Gr 18 with its AZ 23 umg (models/ammo_mrs18.js gr18Prop) in place of buildShell's round,
//                    the cartridge case 6351 with its leatherboard cup and six bags in place of buildCartridge's
//                    bag-ahead-of-a-case, the ready rounds and the charge point round the gun (buildReadyAmmo, laid
//                    inside the pit: LAYOUT_PIT), loose increments and the cup for the make-up
//   ammo1, the fuze  the round for the next cycle lies on its blocks from the shot on (the drill's pick place); after the
//                    shot ammo1 walks to its nose, kneels and turns the setting head from the delivered o.V. (OV, an
//                    estimate: the delivered setting is not found) to the order's (u.order.fuze 'delay' is AZ m.V., MV: a
//                    quarter turn, HEA Pamphlet 12 "by turning the head"); for o.V. he checks it. Then back to his post;
//                    the spent case is still his (crews_hero.js)
//   ammo2, the charge  from the start of the cycle he kneels at the open container behind his post: clamp off, lid up,
//                    the case drawn out and stood on its head, the cup out, the increments above the ordered charge pulled
//                    out one by one by their tape loops and laid on the next container's lid (Ladung 1, 3, 5, 6 of six:
//                    the six-bag make-up is the research's analogy with the field howitzers' cased charges, an estimate),
//                    the cup back in, the surplus increments put into the emptied container and its lid shut (to go back
//                    with the empties: an estimate after the 1942 order to return packing), the case taken up in his arms
//                    (Bundesarchiv 101I-118-0379-20); GunCrew.carryMan carries it to the breech and puts it in by hand
//                    (chargeIn, chargeSeat)
//
// Purity: every pose and prop is a function of the piece's job, the time since the shot and the unit's order, on the
// crew's cycle clock (crew.tl) or the shot's; nothing accumulates but the shots counted for the stock (as the spent-case
// row: crews_hero.js). crew.cueS[name] holds the sim second of each named moment of this frame's schedule (NaN: none),
// for render/foley.js (herocues.js ['crew', name] cues). No allocation per frame.
import * as THREE from 'three';
import { smooth, lerp, wrapPi, headingOf, clamp01 } from './anim.js';
import { gr18Prop, case6351, caseParts, buildReadyAmmo, LAYOUT_PIT, fuzeAngle, fuzeSetOf, ladungOf, ammoTexScale, ammoTexScaleNow, atlasesReady } from '../models/ammo_mrs18.js';
import { reachTo } from './crews_hero.js';
import { PIVOT_STEP } from '../models/v/crew.js';

export const AMMO_KINDS = new Set(['mrs18']);
// the Gr 18's measures (models/ammo_mrs18.js GR) and the case's, known before the props are built (the drill's
// distances follow them from the first frame)
const GR_L = 0.8731, GR_R = 0.10875, CASE_L = 0.41;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const Q_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, 'YXZ')); // a case or bag standing, mouth up

/** The drill's measures for the hero rounds (crew.half, srad, slen, bagLen), before the props exist. */
export function heroAmmoDims(crew) {
  crew.half = GR_L / 2; crew.srad = GR_R; crew.slen = GR_L; crew.bagLen = CASE_L;
}

/**
 * The hero props and the ready ammunition, built once (crew.ammo); before the scene's patchSceneFog and the warm-up.
 * Draws the stencil atlases here unless they are ready (models/ammo_mrs18.js prebuildAmmoAsync, render/guns.js).
 */
export function heroAmmoBuild(crew) {
  if (crew.ammo) return crew.ammo;
  const rig = crew.rig;
  // (a headless page draws the atlases at half size, as PLAN's lean pages do; guns.js sets it for the game)
  if (!atlasesReady() && ammoTexScaleNow() === 1 && typeof navigator !== 'undefined' && navigator.webdriver) ammoTexScale(0.5);
  for (const o of [crew.shellA, crew.shellB, crew.bag]) o?.parent?.remove(o);
  crew.shellA = gr18Prop({ lod: 'hd' }); crew.shellB = gr18Prop({ lod: 'lod' });
  const ch = case6351({ lod: 'hd', visible: false });
  ch.rotation.order = 'YXZ';
  crew.bag = ch;
  heroAmmoDims(crew);
  rig.root.add(crew.shellA, crew.shellB, ch);
  // the increments pulled out (bags 1 to 5; the base bag with its igniter never comes out) and the cup, drawn loose
  const loose = ch.bags.map((b, i) => {
    const m = new THREE.Mesh(b.geometry, b.material);
    m.name = 'bag-loose-' + (i + 1); m.visible = false; m.castShadow = true; m.receiveShadow = true;
    rig.root.add(m);
    return m;
  });
  const cup = new THREE.Group(), cm = new THREE.Mesh(ch.cup.geometry, ch.cup.material);
  cup.name = 'cup-loose'; cup.visible = false; cm.castShadow = true;
  cm.position.z = 0.393 - CASE_L / 2; // (the cup's disc, at z -0.188 in the case, at the group's origin)
  cup.add(cm); rig.root.add(cup);
  const ready = buildReadyAmmo(rig, { seed: 1 + Math.round((rig.root.position.x * 7.3 + rig.root.position.z * 3.1) % 97), lod: 'lod', layout: LAYOUT_PIT });
  ready.showPick(false); // (the drill draws the round on its blocks: crews.js pairMan)
  rig.root.add(ready.group);
  // the spent case: the 0.41 m case 6351, sooted and struck (crews_hero.js throws, carries and stands it; herofx.js
  // smokes it), and the empties standing in their rows (ready.caseSpot) in place of the loose heap
  if (crew.caseProp) { crew.caseProp.parent?.remove(crew.caseProp); const i = crew.extraProps?.indexOf(crew.caseProp) ?? -1; if (i >= 0) crew.extraProps.splice(i, 1); }
  crew.casePile?.parent?.remove(crew.casePile);
  const spent = case6351({ lod: 'hd', spent: true, cup: false, bags: false, visible: false });
  spent.name = 'spent-case'; spent.rotation.order = 'YXZ';
  rig.root.add(spent);
  const cp = caseParts({ lod: 'lod', spent: true }), row = new THREE.InstancedMesh(cp.geometry, cp.material, ready.caseSlots);
  row.name = 'case-row'; row.castShadow = row.receiveShadow = true; row.count = 0; row.frustumCulled = false;
  rig.root.add(row);
  crew.caseProp = spent; crew.casePile = row;
  (crew.extraProps ??= []).push(spent);
  const A = crew.ammo = {
    ready, charge: ch, loose, cup, stock: ready.stock,
    sch: new Float64Array(24), fz: new Float64Array(10), n: 6, set: 'OV', unitFor: null, unit: null,
  };
  crew.cueS = {};
  (crew.extraProps ??= []).push(...loose, cup);
  crew.ammoAt = (name, out) => ammoAt(crew, name, out);
  return A;
}

// ---------------------------------------------------------------- the order
// the unit of this piece (cached per piece object: a new game makes new pieces) and its order's fuze and charge
function orderOf(crew, p) {
  const A = crew.ammo;
  if (A.unitFor !== p) { A.unitFor = p; A.unit = crew.sim?.units?.find?.((u) => u.pieces?.includes?.(p)) ?? null; }
  const o = A.unit?.order;
  // (no unit, as in render/crewcheck.js: the longest make-up, Ladung 1, and the delay setting, so a review sees both)
  A.n = o ? ladungOf(o.charge >= 0 ? o.charge : 3) : 1;
  A.set = o ? fuzeSetOf(o.fuze) : 'MV';
}

// ---------------------------------------------------------------- per frame, before the men
const BAG_OUT = [0, 1, 2, 3, 4, 5].map((j) => 'bagOut' + j), BAG_DOWN = [0, 1, 2, 3, 4, 5].map((j) => 'bagDown' + j);
const CUES = ['lidOpen', 'lidUp', 'caseLift', 'caseDown', 'cupOut', 'bagOut1', 'bagOut2', 'bagOut3', 'bagOut4', 'bagOut5', 'bagDown1', 'bagDown2', 'bagDown3', 'bagDown4', 'bagDown5',
  'cupIn', 'chargeUp', 'surplusUp', 'surplusIn', 'lidShut', 'latchOn', 'fuzeGrip', 'fuzeTurn', 'fuzeCheck', 'caseStand'];
export function heroAmmoFrame(crew, c) {
  const A = crew.ammo;
  if (!A) return;
  const p = c.p, T = crew.tl, now = c.now, S = crew.cueS;
  orderOf(crew, p);
  for (const k of CUES) S[k] = NaN;
  // the stock: one round fewer for every round fired (it comes up to the blocks at the shot, while all eyes are on the
  // muzzle), filled again when it is out
  const shots = Math.max(0, crew.caseShots ?? 0), left = A.stock - (shots % (A.stock + 1));
  if (left !== A.left) { A.left = left; A.ready.setRounds(left); } // (its matrices sent only when it changes)
  // the loose props start hidden each frame; the men who hold them place them
  for (const m of A.loose) m.visible = false;
  A.cup.visible = false;
  A.mk = makeUp(crew, T);
  // the open container and the case in it: shut with a charge inside between cycles, opened and emptied by the make-up,
  // shut again at its end with the surplus put back in (the refill happens while it is shut)
  const can = A.ready.open, inner = A.ready.charge;
  let open = 0, full = true;
  if (A.mk) {
    const t = T.now, s = A.sch;
    open = smooth(t, s[1], s[2]) * (1 - smooth(t, s[20], s[21]));
    full = t < s[2] || t >= s[21];
  }
  can?.setOpen?.(open);
  if (inner) inner.visible = full;
  // the surplus increments lying on the next container's lid, from when each is laid there until they are taken up again
  if (A.mk) {
    const t = T.now, take = A.sch[15];
    for (let j = 5; j >= A.n; j--) {
      if (!(t >= A.sch[8 + j] && t < take)) continue;
      const mesh = A.loose[j];
      stackPos(A, j, mesh.position); mesh.quaternion.copy(Q_UP); mesh.visible = crew.level > 0;
    }
  }
  // the charge in the case: every bag until the make-up takes the surplus out, then the ordered charge
  if (A.mk && T.now >= A.sch[4]) {
    for (let i = 0; i < 6; i++) A.charge.bags[i].visible = i < A.n || T.now < A.sch[8 + i];
  } else A.charge.setCharge(6);
  // the cue moments in sim seconds (the cycle's second t is now - T.now + t)
  if (A.mk && Number.isFinite(T.now)) {
    const o = now - T.now, s = A.sch;
    S.lidOpen = o + s[1]; S.lidUp = o + s[1] + 0.3 * (s[2] - s[1]); S.caseLift = o + s[3]; S.caseDown = o + s[4]; S.cupOut = o + s[5];
    for (let j = 5; j >= A.n; j--) { S[BAG_OUT[j]] = o + bagT(A, j, 0.25); S[BAG_DOWN[j]] = o + bagT(A, j, 0.93); }
    S.cupIn = o + s[14] + 0.6 * (s[15] - s[14]); S.chargeUp = o + s[16] + 0.3 * (s[17] - s[16]);
    if (A.n < 6) { S.surplusUp = o + s[15] + 0.4 * (s[19] - s[15]); S.surplusIn = o + s[19] + 0.75 * (s[20] - s[19]); }
    S.lidShut = o + s[20] + 0.6 * (s[21] - s[20]); S.latchOn = o + s[21] - 0.08 * (s[21] - s[20]);
  }
  heroFuze(crew, c);
}

// The make-up on the cycle clock (A.sch, cycle seconds): [0] start (turn and kneel), [1] at the clamp, [2] the lid up,
// [3] the case drawn, [4] stood on the ground, [5] the cup out, [6] the cup laid by, [8 + j] bag j down on the lid (j from 5
// down to n, each beat from the last one's end: bagT), [14] the cup taken up again, [15] in, [19] the surplus taken up off
// the lid, [20] put into the emptied container, [21] its lid shut and clamped, [16] the case taken up (= [21]), [17] up in
// his arms at his post (facing it), [18] g0: he sets off for the breech. Null (no make-up) outside a cycle, or when it
// cannot fit before he must set off (the case is then already in his arms: crews.js carryMan's old hold).
function makeUp(crew, T) {
  const A = crew.ammo;
  A.mkNoRoom = false;
  if (!T || !Number.isFinite(T.now) || !crew.cp) return null;
  const s = A.sch, g0 = crew.cp[0], r = T.r ?? 1, out = 5 - A.n + 1; // (bags 6 down to n + 1: indices 5 .. n)
  // turn and kneel, clamp and lid, draw, cup, (cup aside), each bag, cup in, take up, the surplus up, into the container, shut
  const D = [1.0, 1.3, 1.6, 1.0, 0.8, 1.2, 0.9, 1.6, 1.1, 0.9, 1.2];
  const need = (D[0] + D[1] + D[2] + D[3] + D[4] + out * D[5] + D[6] + D[7] + (out ? D[8] + D[9] : 0) + D[10]) * r;
  // (as late as it can start and still be done 0.8 s before he sets off, so he does not stand about with the case in his
  // arms; never before the cycle's first 0.4 s; once begun its start and pace are kept to the end of the cycle, so a
  // route searched again under him or a step's pace that comes in late cannot jump him to another beat)
  const at = crew.c.now - T.now; // (the cycle's start in sim seconds)
  let t0, f;
  if (A.mkAt != null && Math.abs(A.mkAt - at) < 0.5 && T.now >= A.mkT0) { t0 = A.mkT0; f = A.mkF; }
  else {
    t0 = Math.max(T.at('depress', 0) + 0.4, g0 - 0.8 - need);
    const room = g0 - 0.5 - t0;
    if (room < need * 0.55) { A.mkAt = null; A.mkNoRoom = true; return null; }
    f = Math.min(1, room / need) * r;
    A.mkAt = at; A.mkT0 = t0; A.mkF = f;
  }
  let t = t0;
  s[0] = t; t += D[0] * f; s[1] = t; t += D[1] * f; s[2] = t; t += D[2] * f * 0.55; s[3] = t; t += D[2] * f * 0.45; s[4] = t;
  t += D[3] * f; s[5] = t; t += D[4] * f; s[6] = t;
  for (let j = 5; j >= 0; j--) { if (j >= A.n) t += D[5] * f; s[8 + j] = t; } // (bag j down; its beat starts at the last one's: bagT)
  s[14] = t; t += D[6] * f; s[15] = t;
  t += (out ? D[8] : 0) * f; s[19] = t; t += (out ? D[9] : 0) * f; s[20] = t; t += D[10] * f; s[21] = t;
  s[16] = t; t += D[7] * f; s[17] = t; s[18] = g0;
  return s;
}
// the cycle second at fraction u of bag j's beat (j from 5 down to n: the beat starts when bag j + 1 is down)
function bagT(A, j, u) {
  const s = A.sch, a = j === 5 ? s[6] : s[8 + j + 1], b = s[8 + j];
  return a + (b - a) * u;
}

// bag j's place in the surplus stack on the spare lid (root space: bag 6 at the bottom, laid first)
function stackPos(A, j, out) {
  const sp = A.ready.spare.position;
  let y = sp.y;
  for (let i = 5; i > j; i--) y += A.charge.bags[i].userData.h + 0.002;
  return out.set(sp.x, y + A.charge.bags[j].userData.h / 2 + 0.002, sp.z);
}

// where the ammunition man kneels at the open container (root space), facing it; and the case's place on the ground
function kneelAt(crew, out) {
  const can = crew.ammo.ready.open;
  out.x = can.position.x - 0.17; out.z = can.position.z - 0.5; out.h = Math.PI; // (facing +Z, between the open container and the next)
  return out;
}
const _k = { x: 0, z: 0, h: 0 };
function casePlace(crew, out) {
  const can = crew.ammo.ready.open;
  return out.set(can.position.x - 0.17, CASE_L / 2 + 0.002, can.position.z - 0.2); // (straight before him, between the two containers)
}

// ---------------------------------------------------------------- ammo2: the charge made up
// From GunCrew.carryMan for the cartridge man of a hero crew, after the walk's phase is known: true when it posed him
// (the make-up before he sets off, standing at his post between cycles and after his walk back). The walk to the breech,
// the putting in and the walk back stay carryMan's.
export function heroChargeMan(crew, m, c, h, phase, have) {
  const A = crew.ammo, T = crew.tl, t = T?.now, s = A.mk;
  if (phase === 'go' || phase === 'place' || phase === 'back') return false;
  const K = kneelAt(crew, _k);
  if (!s) {
    // in a cycle with no room for the make-up: carryMan's old drill (the case in his arms at his post); between cycles
    // (and in a cycle's first frame, before carryMan has timed his walk) standing at his post, the charge in its container
    if (Number.isFinite(t) && A.mkNoRoom) return false;
    m.put(h.x, h.y, h.z, h.h, 'stand', crew.idleT + m.seed);
    return true;
  }
  if (t >= s[17] && t < s[18]) return false; // (the case in his arms at his post: carryMan's hold draws it)
  if (t < s[0] || t >= s[18]) { m.put(h.x, h.y, h.z, h.h, 'stand', crew.idleT + m.seed); return true; }
  makeUpMan(crew, m, c, h, K, t);
  return true;
}

// turned on the spot from his post's heading to the container's and down onto his right knee, or the reverse (k 0..1)
function kneelDown(crew, m, h, K, k, up = false) {
  const turn = smooth(k, 0, 0.55), down = smooth(k, 0.45, 1), hh = up ? K.h + wrapPi(h.h - K.h) * smooth(k, 0.45, 1) : h.h + wrapPi(K.h - h.h) * turn;
  const x = lerp(up ? K.x : h.x, up ? h.x : K.x, up ? smooth(k, 0.45, 1) : turn), z = lerp(up ? K.z : h.z, up ? h.z : K.z, up ? smooth(k, 0.45, 1) : turn);
  const d = up ? 1 - smooth(k, 0, 0.55) : down;
  if (d < 0.5) m.put(x, h.y, z, hh, 'pivot', wrapPi(hh - h.h) / PIVOT_STEP);
  else m.put(x, h.y, z, hh, 'crouch', 0);
}

function makeUpMan(crew, m, c, h, K, t) {
  const A = crew.ammo, s = A.sch, inv = crew.invRoot(), can = A.ready.open, ch = A.charge;
  m.carry = null;
  if (t < s[1]) { kneelDown(crew, m, h, K, (t - s[0]) / Math.max(0.01, s[1] - s[0])); return; }
  if (t >= s[16]) { takeUp(crew, m, h, K, (t - s[16]) / Math.max(0.01, s[17] - s[16]), t); return; }
  m.stoop = 0.3; m.put(K.x, h.y, K.z, K.h, 'crouch', crew.idleT * 0.2 + m.seed); m.stoop = 0;
  let wR = 0, wL = 0;
  if (t < s[2]) {
    // the clamp lever off with the right hand, then the lid up by its edge with the left
    const k = (t - s[1]) / Math.max(0.01, s[2] - s[1]);
    can.latch.getWorldPosition(_a).applyMatrix4(inv); _a.y += 0.025;
    _b.set(0.27, 0.03, 0); can.lid.localToWorld(_b).applyMatrix4(inv);
    reachTo(m, 'R', _a.x, _a.y, _a.z, smooth(k, 0, 0.15) * (1 - smooth(k, 0.3, 0.45)), _p.set(0.6, -0.7, 0.2));
    reachTo(m, 'L', _b.x, _b.y, _b.z, smooth(k, 0.25, 0.4) * (1 - smooth(k, 0.85, 1)), _p.set(0.6, -0.7, 0.2));
    return;
  }
  // the case: in the container, drawn up out of it and stood on its head before him
  casePlace(crew, _c);
  if (t < s[4]) {
    A.ready.charge.getWorldPosition(_a).applyMatrix4(inv);
    // straight up out of it (its head clear of the rim), over and down onto the ground before him
    const k = (t - s[2]) / Math.max(0.01, s[4] - s[2]), up = smooth(k, 0.05, 0.55), over = smooth(k, 0.5, 0.95);
    const yUp = _a.y + (CASE_L + 0.08) * up;
    _v.copy(_a).lerp(_c, over);
    _v.y = lerp(yUp, _c.y, over) + 0.12 * Math.sin(Math.PI * over);
    placeCase(crew, _v, Q_UP, true);
    const g = smooth(k, 0, 0.12);
    wR = wL = g;
  } else placeCase(crew, _c, Q_UP, true);
  ch.setCup(t < s[5] || t >= s[15]);
  const top = _w.copy(ch.position); top.y += CASE_L / 2; // the mouth
  if (t < s[4]) {
    // both hands on the case below its mouth, either side
    const P = ch.position, rx = Math.cos(K.h) * 0.12, rz = -Math.sin(K.h) * 0.12;
    reachTo(m, 'R', P.x + rx, P.y + 0.12, P.z + rz, wR, _p.set(0.6, -0.7, 0.2));
    reachTo(m, 'L', P.x - rx, P.y + 0.12, P.z - rz, wL, _p.set(0.6, -0.7, 0.2));
    return;
  }
  if (t >= s[15]) { putAway(crew, m, K, t); return; }
  // the cup: drawn out by its tab and held in the left hand by his knee, then put back
  if (t >= s[4] && t < s[15]) {
    const out = t < s[6] ? smooth(t, s[4] + 0.1 * (s[5] - s[4]), s[5]) : t >= s[14] ? 1 - smooth(t, s[14], s[15]) : 1;
    _a.copy(top); _a.y -= 0.017;
    _b.set(K.x + Math.cos(K.h) * -0.22, h.y + 0.42, K.z - Math.sin(K.h) * -0.22); // (by his left knee)
    _v.copy(_a).lerp(_b, smooth(out, 0.3, 1)); _v.y += 0.12 * Math.sin(Math.PI * clamp01(out));
    if (out > 0.02) {
      A.cup.visible = crew.level > 0; A.cup.position.copy(_v); A.cup.quaternion.copy(Q_UP);
      ch.setCup(false);
      reachTo(m, 'L', _v.x, _v.y + 0.02, _v.z, 1, _p.set(0.6, -0.7, 0.2));
    } else reachTo(m, 'L', _a.x, _a.y + 0.03, _a.z, smooth(t, s[4], s[4] + 0.1 * (s[5] - s[4])) + smooth(t, s[14], s[15]), _p.set(0.6, -0.7, 0.2));
  }
  // the increments: each by its loop out of the mouth, over to the next container's lid, laid on the stack there
  const n = A.n;
  for (let j = 5; j >= n; j--) {
    const b = ch.bags[j], hb = b.userData.h, a0 = bagT(A, j, 0), a1 = s[8 + j];
    if (t < a0 || t >= a1) continue; // (laid: heroAmmoFrame draws the stack)
    const k = (t - a0) / Math.max(0.01, a1 - a0);
    // in the case: bag j's middle, the case standing (its local -Z up)
    _a.copy(ch.position); _a.y -= b.userData.home;
    stackPos(A, j, _b);
    const mesh = A.loose[j];
    const lift = smooth(k, 0.15, 0.45), over = smooth(k, 0.4, 0.8), down = smooth(k, 0.75, 0.95);
    _v.copy(_a); _v.y = lerp(_a.y, top.y + hb / 2 + 0.06, lift);
    _v.x = lerp(_v.x, _b.x, over); _v.z = lerp(_v.z, _b.z, over);
    _v.y = lerp(_v.y, _b.y + 0.08, over) - 0.08 * down;
    mesh.visible = crew.level > 0; mesh.position.copy(_v); mesh.quaternion.copy(Q_UP);
    b.visible = false;
    // the right hand on its loop (the bag's top), in from above
    const g = smooth(k, 0, 0.15) * (1 - smooth(k, 0.92, 1));
    // (a deep one: his fingers in at the mouth on its loop, the bag coming up to them)
    reachTo(m, 'R', _v.x, Math.max(_v.y + hb / 2 + 0.01, top.y - 0.06), _v.z, Math.max(g, 0.4), _p.set(0.7, -0.5, 0.3));
    m.carry = 'charge';
  }
}

// the case taken up off the ground into his arms (k 0..1), as he rises and turns back to his post's heading: it ends
// exactly where carryMan's hold draws it (his chest, across him)
function takeUp(crew, m, h, K, k, t) {
  const A = crew.ammo, ch = A.charge;
  casePlace(crew, _c);
  const rise = smooth(k, 0.35, 1), turn = smooth(k, 0.4, 1);
  const hh = K.h + wrapPi(h.h - K.h) * turn, x = lerp(K.x, h.x, turn), z = lerp(K.z, h.z, turn);
  if (k < 0.35) m.put(K.x, h.y, K.z, K.h, 'crouch', 0);
  else m.put(x, h.y, z, hh, 'lift', 0.25 + 0.75 * rise);
  // the carry place at this heading (carryMan's hold: 0.42 m before him, 1.07 m up, across him)
  const fx = -Math.sin(hh), fz = -Math.cos(hh);
  _v.set(x + fx * 0.42, h.y + lerp(0.45, 1.07, rise), z + fz * 0.42);
  const tilt = smooth(k, 0.05, 0.35);
  _e.set(0, hh - Math.PI / 2, 0); _q2.setFromEuler(_e);
  _q.copy(Q_UP).slerp(_q2, tilt);
  _a.copy(_c).lerp(_v, smooth(k, 0.1, 0.6));
  if (k >= 0.6) _a.copy(_v);
  placeCase(crew, _a, _q, true);
  m.carry = 'charge';
  // the hands either side of it (across him: his right and left), below its mouth while it stands, then palms under it
  // once it lies across his arms
  const rx = Math.cos(hh) * 0.12, rz = -Math.sin(hh) * 0.12, dy = lerp(0.15, -0.1, tilt), w = smooth(k, 0, 0.12);
  reachTo(m, 'R', _a.x + rx, _a.y + dy, _a.z + rz, w, _p.set(0.6, -0.7, 0.2));
  reachTo(m, 'L', _a.x - rx, _a.y + dy, _a.z - rz, w, _p.set(0.6, -0.7, 0.2));
  void t;
}

function placeCase(crew, pos, quat, vis) {
  const ch = crew.ammo.charge;
  ch.visible = vis && crew.level > 0;
  ch.position.copy(pos); ch.quaternion.copy(quat);
}

// the end of the make-up (s[15] to s[21]): the surplus increments taken up off the next container's lid together, put into
// the emptied container (let go over its mouth: a kneeling man reaches no deeper), its lid brought down and clamped
function putAway(crew, m, K, t) {
  const A = crew.ammo, s = A.sch, inv = crew.invRoot(), can = A.ready.open, spare = A.ready.spare, n = A.n;
  const inK = t < s[19] ? 0.4 * smooth(t, s[15], s[19]) : t < s[20] ? 0.4 + 0.6 * smooth(t, s[19], s[20]) : 1;
  can.getWorldPosition(_c).applyMatrix4(inv);
  for (let j = 5; j >= n; j--) {
    const mesh = A.loose[j];
    stackPos(A, j, _a);
    if (inK >= 0.86) continue; // (dropped in)
    const lift = smooth(inK, 0, 0.35), over = smooth(inK, 0.35, 0.75), down = smooth(inK, 0.75, 0.86);
    const y0 = _a.y + 0.12 * lift, y1 = 0.6 + (_a.y - spare.position.y) - 0.1 * down;
    _v.set(lerp(_a.x, _c.x, over), lerp(y0, y1, over), lerp(_a.z, _c.z, over));
    mesh.visible = crew.level > 0; mesh.position.copy(_v); mesh.quaternion.copy(Q_UP);
  }
  if (n < 6 && t < s[20]) {
    // both hands under the stack's lowest bag, either side
    const k = (t - s[15]) / Math.max(0.01, s[20] - s[15]), b0 = A.loose[5];
    if (!b0.visible) return;
    const P = b0.position, rx = Math.cos(K.h) * 0.11, rz = -Math.sin(K.h) * 0.11, w = smooth(k, 0, 0.12) * (1 - smooth(k, 0.86, 0.95));
    reachTo(m, 'R', P.x + rx, P.y, P.z + rz, w, _p.set(0.6, -0.7, 0.2));
    reachTo(m, 'L', P.x - rx, P.y, P.z - rz, w, _p.set(0.6, -0.7, 0.2));
    m.carry = 'charge';
  } else if (t >= s[20]) {
    // the lid down by its edge (left), the clamp lever up onto the catch (right)
    const k = (t - s[20]) / Math.max(0.01, s[21] - s[20]);
    _b.set(0.27, 0.03, 0); can.lid.localToWorld(_b).applyMatrix4(inv);
    can.latch.getWorldPosition(_a).applyMatrix4(inv); _a.y += 0.025;
    reachTo(m, 'L', _b.x, _b.y, _b.z, smooth(k, 0, 0.12) * (1 - smooth(k, 0.6, 0.75)), _p.set(0.6, -0.7, 0.2));
    reachTo(m, 'R', _a.x, _a.y, _a.z, smooth(k, 0.6, 0.75) * (1 - smooth(k, 0.95, 1)), _p.set(0.6, -0.7, 0.2));
  }
}

// ---------------------------------------------------------------- ammo1: the fuze set at the gun
// The beat in sim seconds after the shot (A.fz): [0] he sets off from his post, [1] at the round's nose, [2] knelt, [3]
// his hand on the head, [4] turned (or checked), [5] let go, [6] up, [7] back at his post. Squeezed to end before the
// pair lifts the round (crews.js pairMan's lift) and skipped when it cannot be; null without a shot (the first round of a
// game lies set already).
const FZ = [1.3, 3.0, 0.5, 0.25, 0.35, 0.2, 0.5, 4.0];
function fuzePlan(crew, p, now) {
  const A = crew.ammo, f = A.fz;
  if (!(p.firedAt > -900)) return null;
  // (planned once per shot, at the first frame after it: the pair's lift is only estimated until the cycle runs, and a
  // plan changed under him would jump him)
  if (A.fzFor === p.firedAt && Math.abs(now - A.fzAt) < 120) return A.fzOk ? f : null;
  A.fzFor = p.firedAt; A.fzAt = now; A.fzOk = false;
  const T = crew.tl;
  // when the pair takes the round up (sim seconds): known on the cycle clock once the cycle runs, else at least the
  // recoil's length after the shot
  let lift = Infinity;
  if (T && Number.isFinite(T.now) && crew.pairLift != null) lift = now - T.now + crew.pairLift;
  else if (T && T.now === -Infinity) lift = p.firedAt + 4.2 + Math.max(0, crew.pairLift ?? 4);
  // (the walk there and the work at the nose before the lift; the walk back, at an easy pace with its turns on the spot,
  // after it if need be (he goes away from the pair), but done before his spent-case fetch, crews_hero.js heroCaseMan)
  let need = 0;
  for (let i = 1; i < FZ.length - 1; i++) need += FZ[i];
  const t0 = p.firedAt + FZ[0], room = lift - 0.4 - t0, k = room >= need ? 1 : room / need;
  if (k < 0.6) return null;
  let t = t0;
  f[0] = t;
  for (let i = 1; i < FZ.length - 1; i++) { t += FZ[i] * k; f[i] = t; }
  const fetch = T ? p.firedAt + 4.2 + T.at('shell', 0.33) + 1.15 : Infinity;
  f[7] = t + Math.min(FZ[7], Math.max(2.6, fetch - 0.2 - t));
  A.fzOk = true;
  return f;
}

// the round's fuze head (the drill's shellA on its blocks or in the pair's hands, the rammed round) turned to its setting
function heroFuze(crew, c) {
  const A = crew.ammo, p = c.p, now = c.now, S = crew.cueS;
  const f = A.fzOn = fuzePlan(crew, p, now);
  const want = fuzeAngle(A.set);
  let ang = want;
  if (f && now < f[4] && now - p.firedAt < 60) {
    // delivered at o.V. (estimate), turned at [3] to [4]
    ang = lerp(0, want, smooth(now, f[3], f[4]));
    if (want === 0) ang = 0.06 * Math.sin(Math.PI * smooth(now, f[3], f[4])); // (the check: the head tried against its detent)
  }
  if (crew.shellA?.fuzeHead) crew.shellA.fuzeHead.rotation.z = ang;
  if (f) { S.fuzeGrip = f[3]; if (want) S.fuzeTurn = f[4]; else S.fuzeCheck = f[3] + 0.6 * (f[4] - f[3]); }
}

// a walk of ammo1's on route P (progress u of a W s window), turned on the spot at either end (GunCrew.pairAlong)
function fuzeLeg(crew, m, h, P, u, W, hs, he, toRound) {
  const B = crew.tmp[9] ??= { x: 0, z: 0, h: 0, s: 0, dist: 0, moving: false };
  crew.pairAlong(P, u, W, hs, he, B, 0.12, 3.0);
  if (B.moving && Number.isFinite(B.turn) && B.turnAll > 0.1) m.put(B.x, h.y, B.z, B.h, 'pivot', B.turn / PIVOT_STEP);
  else if (B.moving) m.put(B.x, h.y, B.z, B.h, 'walk', B.dist / 1.25);
  // (standing still at the round's end of the walk: the kneel's pose at its top, so no one-frame stand between them)
  else if (toRound ? u > 0.5 : u < 0.5) m.put(B.x, h.y, B.z, B.h, 'lift', 1);
  else m.put(B.x, h.y, B.z, B.h, 'stand', crew.idleT + m.seed);
}

/** ammo1 between the shot and the pair's lift: true when the fuze beat posed him (crews.js act, before his case work). */
export function heroFuzeMan(crew, m, c, h) {
  const A = crew.ammo, f = A?.fzOn, now = c.now;
  if (!f || now < f[0] || now >= f[7]) return false;
  // in front of the round's nose (the pick place: crews.js pairMan draws it there), kneeling and facing it
  const S = crew.S, nz = S.z + 0.2 - GR_L / 2, fx = S.x + 0.04, fz = nz - 0.5, face = headingOf(S.x - fx, nz - fz);
  const l = crew.l0;
  const P1 = crew.plan(m, 'f1', l, h.x, h.z, fx, fz, 0.3), P2 = crew.plan(m, 'f2', l, fx, fz, h.x, h.z, 0.3);
  if (m.plans.f1) m.plans.f1.lock = now >= f[0] && now < f[1];
  if (m.plans.f2) m.plans.f2.lock = now >= f[6] && now < f[7];
  if (now < f[1]) { fuzeLeg(crew, m, h, P1, (now - f[0]) / (f[1] - f[0]), f[1] - f[0], h.h, face, true); return true; }
  if (now >= f[6]) { fuzeLeg(crew, m, h, P2, (now - f[6]) / (f[7] - f[6]), f[7] - f[6], face, h.h, false); return true; }
  // down onto his knee, the right hand on the setting head (the left on the shell's ogive), turned, let go, up
  const down = now < f[2] ? smooth(now, f[1], f[2]) : now >= f[5] ? 1 - smooth(now, f[5], f[6]) : 1;
  if (down > 0.5) m.put(fx, h.y, fz, face, 'crouch', 0);
  else m.put(fx, h.y, fz, face, 'lift', 1 - 0.8 * down);
  const head = crew.shellA?.fuzeHead;
  if (head && crew.shellA.visible) {
    fuzePoint(crew, _a);
    const g = smooth(now, f[2], f[3]) * (1 - smooth(now, f[5], f[5] + 0.6 * (f[6] - f[5])));
    reachTo(m, 'R', _a.x - 0.012, _a.y + 0.02, _a.z, g, _p.set(0.6, -0.8, 0.2));
    reachTo(m, 'L', _a.x + 0.09, _a.y - 0.02, _a.z + 0.16, g * 0.9, _p.set(0.6, -0.8, 0.2));
  }
  return true;
}

// the setting head (root space): its node turns on the shell's axis at the middle; the head itself is at the nose
function fuzePoint(crew, out) {
  crew.shellA.updateMatrixWorld(true);
  return crew.shellA.localToWorld(out.set(0, 0, -GR_L / 2 + 0.012)).applyMatrix4(crew.invRoot());
}

// ---------------------------------------------------------------- the case at its seat
// After the cartridge man lets go (carryMan's place ends at cartridge 0.74), the case stays seated in the chamber until
// the block has slid across behind it (close k 0.55): it does not vanish in front of the firer's eyes.
export function heroChargeSeated(crew, c) {
  const A = crew.ammo, ch = A?.charge;
  if (!ch || !crew.cp) return;
  const T = crew.tl, t = T?.now;
  const on = Number.isFinite(t) && t >= crew.cp[1] && (c.s === 'cartridge' || (c.s === 'close' && c.k < 0.55));
  if (!on || ch.visible) return;
  // the seat: the rim at the chamber's mouth (rig.anchors.chamber; else the breech face), along the bore
  seatAt(crew, _a);
  ch.visible = crew.level > 0;
  ch.position.copy(_a);
  ch.rotation.set(Math.asin(crew.u.y), crew.az, 0);
  ch.setCup(true);
  for (let i = 0; i < 6; i++) ch.bags[i].visible = i < A.n;
}

/** The case's middle seated (root space): its rim at the chamber's mouth, along the bore (trayAt(a): the bore's axis at
 * a metres from the breech anchor). */
export function seatAt(crew, out) {
  return crew.trayAt(chamberA(crew) + CASE_L / 2, out);
}
/** The axial place (from the breech anchor, along the bore) of the chamber's mouth. */
export function chamberA(crew) {
  const ch = crew.rig.anchors.chamber;
  if (!ch) return 0.02;
  ch.getWorldPosition(_w).applyMatrix4(crew.invRoot());
  return _w.sub(crew.B).dot(crew.u);
}

// ---------------------------------------------------------------- where the foley sounds (render/foley.js)
function ammoAt(crew, name, out) {
  const A = crew.ammo;
  if (!A) return null;
  switch (name) {
    case 'fuze': return crew.shellA ? crew.shellA.localToWorld(out.set(0, 0, -GR_L / 2 + 0.012)) : null;
    case 'can': { A.ready.open.getWorldPosition(out); out.y += 0.47; return out; }
    case 'spare': return A.ready.spare.getWorldPosition(out);
    case 'charge': return A.charge.visible ? A.charge.getWorldPosition(out) : (A.ready.open.getWorldPosition(out), out.y += 0.3, out);
    case 'row': return crew.caseProp?.visible ? crew.caseProp.getWorldPosition(out) : null;
    default: return null;
  }
}

void _m; void clamp;

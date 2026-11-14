// Body audit for the crew drills (crewcheck.js, tools/crewaudit.mjs): a man must move as if he had bones and a body.
//   joint: a joint turned past what a body allows, in degrees past the limit: an elbow or a knee bent backwards or
//     folded flat, a shoulder reaching behind the back or across it, or twisted round so the forearm points where no
//     forearm can, a wrist, hip, ankle, spine or neck beyond its range, a knee turned off the hip, a foot off the knee.
//   self: a limb through his own body: a forearm or a hand through or behind his head, an arm through his chest, the
//     arms through each other, the legs through each other.
//   hit: a man (his arms and hands too, which crewcheck's clearance test leaves out) into another man, the gun's
//     steel or the pit; a hand counts in the steel only when the whole fist is inside it (a grip closes round a rim).
// Depths (m) and angles (degrees) go to the contact audit's log (crewcontact.js): seconds, the worst, and the worst
// instants for its `moments`.
import * as THREE from 'three';

const DEG = 180 / Math.PI;
const HIT = 0.03; // the capsules sit a little inside the skin: overlaps under this are skin touching
const HIT_BIG = 0.08; // an overlap anyone sees at a glance (counted apart)
const JOINT_MIN = 3, JOINT_BIG = 20; // degrees past a limit: counted, and seen at a glance

// Ranges of motion (degrees), from the clinical tables and a little generous, since the figure has no shoulder blade
// or collar bone and the twist is measured against a reference rather than the man's own neutral:
//   shoulder: back 60 with the arm down to 10 overhead; across the body 55 in front, 15 behind; turned out 100, in 110
//     (judged only with the elbow bent over 30: a straight arm's twist does not show on the turned sleeve)
//   elbow 0 to 150; wrist bend 80, twist 100 (the forearm's turn: the figure puts it in the wrist)
//   hip forward 130, back 30, out 50, across 30, knee turned 60; knee 0 to 155, 10 sideways
//   ankle toe up 50 (the rigid boot tips onto its toe cap, so the toes' bend shows in the ankle), down 60, the foot
//     turned 40 off its knee, rolled 30
//   spine forward 85, back 30, twisted 50, sideways 35; neck chin down 65, head back 55, turned 80, tilted 40
const pw = (x, pts) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * (x - a) / (b - a); }
  return pts[pts.length - 1][1];
};
const clamp1 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
const V = () => new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), FWD = new THREE.Vector3(0, 0, -1), SIDEX = new THREE.Vector3(1, 0, 0);
// A shoulder's twist is the forearm's bend direction against a neutral one carried along the shortest swing from a
// reference arm pointing forward, out and down. Its opposite (up, back and across) is out of a shoulder's reach, so the
// measure never flips inside the range a man uses. (A hip's reference is the leg hanging down: no thigh points up.)
const R0 = [-1, 1].map((s) => new THREE.Vector3(s * 0.45, -0.6, -0.65).normalize());
const F0 = R0.map((r) => FWD.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(DOWN, r)));
const _h = V(), _f = V(), _n = V(), _e = V(), _t = V(), _d = V();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');

// signed angle (degrees) from n to f about the axis h, positive toward s (h x n): outward for a limb on side s
function twistOf(h, f, n, s) {
  _e.crossVectors(h, n).multiplyScalar(s);
  _t.copy(f).addScaledVector(h, -f.dot(h));
  return Math.atan2(_t.dot(_e), _t.dot(n)) * DEG;
}

// the joints of a man past their range: [{ name, over, label, bone }] (bone: where to look)
export function jointsOf(b, out) {
  out.length = 0;
  let w = 0, lab = '';
  const over = (v, lim, l) => { if (v - lim > w) { w = v - lim; lab = `${l} ${v.toFixed(0)}° (limit ${lim.toFixed(0)}°)`; } };
  const put = (name, bone) => { if (w > JOINT_MIN) out.push({ name, over: w, label: lab, bone }); w = 0; lab = ''; };
  for (const [i, s, S] of [[0, -1, 'L'], [1, 1, 'R']]) {
    // elbow: a hinge that bends the forearm toward the upper arm's -Z (crew.js solve2)
    _d.copy(DOWN).applyQuaternion(b['forearm' + S].quaternion);
    const elbow = Math.atan2(-_d.z, -_d.y) * DEG;
    over(elbow, 150, 'folded'); over(-elbow, 5, 'bent backwards'); over(Math.abs(Math.asin(clamp1(_d.x)) * DEG), 15, 'bent sideways');
    put('elbow ' + S, b['forearm' + S]);
    // shoulder, in the chest's frame
    const qa = b['upperArm' + S].quaternion;
    _h.copy(DOWN).applyQuaternion(qa); _f.copy(FWD).applyQuaternion(qa);
    const up = _h.y, fwd = -_h.z;
    over(Math.asin(clamp1(_h.z)) * DEG, pw(up, [[-0.5, 60], [0, 40], [0.9, 10], [1, 5]]), 'reaching back');
    over(Math.asin(clamp1(-s * _h.x)) * DEG, Math.min(pw(fwd, [[-0.2, 15], [0.3, 55]]), up > 0.6 ? 30 : 90), 'across the body');
    if (elbow > 30) {
      _q.setFromUnitVectors(R0[i], _h); _n.copy(F0[i]).applyQuaternion(_q);
      const tw = twistOf(_h, _f, _n, s);
      over(tw, 100, 'upper arm turned out'); over(-tw, 110, 'upper arm turned in');
    }
    put('shoulder ' + S, b['upperArm' + S]);
    // wrist: the hand's turn about the forearm and its bend
    const qh = b['hand' + S].quaternion;
    let tw = 2 * Math.atan2(qh.y, qh.w);
    tw = Math.atan2(Math.sin(tw), Math.cos(tw));
    _q.set(0, Math.sin(tw / 2), 0, Math.cos(tw / 2)).invert();
    _q2.copy(qh).multiply(_q);
    over(Math.abs(tw) * DEG, 100, 'turned'); over(2 * Math.acos(Math.min(1, Math.abs(_q2.w))) * DEG, 80, 'bent');
    put('wrist ' + S, b['hand' + S]);
    // hip, in the pelvis' frame: the knee points along the thigh's -Z (the shin bends toward +Z)
    const qt = b['thigh' + S].quaternion;
    _h.copy(DOWN).applyQuaternion(qt); _f.copy(FWD).applyQuaternion(qt);
    const flex = Math.atan2(-_h.z, -_h.y) * DEG, out_ = Math.asin(clamp1(s * _h.x)) * DEG;
    over(flex, 130, 'thigh raised'); over(-flex, 30, 'thigh back'); over(out_, 50, 'leg out'); over(-out_, 30, 'leg across');
    _q.setFromUnitVectors(DOWN, _h); _n.copy(FWD).applyQuaternion(_q);
    const kt = twistOf(_h, _f, _n, s);
    over(Math.abs(kt), 60, kt > 0 ? 'knee turned out' : 'knee turned in');
    put('hip ' + S, b['thigh' + S]);
    // knee
    _d.copy(DOWN).applyQuaternion(b['shin' + S].quaternion);
    const knee = Math.atan2(_d.z, -_d.y) * DEG;
    over(knee, 155, 'folded'); over(-knee, 5, 'bent backwards'); over(Math.abs(Math.asin(clamp1(_d.x)) * DEG), 10, 'bent sideways');
    put('knee ' + S, b['shin' + S]);
    // ankle, in the shin's frame (+Y up the shin to the knee)
    const qf = b['foot' + S].quaternion;
    _t.copy(FWD).applyQuaternion(qf);
    const pitch = Math.asin(clamp1(_t.y)) * DEG;
    over(pitch, 50, 'toe up'); over(-pitch, 60, 'toe down');
    if (Math.abs(_t.y) < 0.8) { const yaw = s * Math.atan2(_t.x, -_t.z) * DEG; over(yaw, 40, 'foot turned out'); over(-yaw, 40, 'foot turned in'); }
    _e.copy(SIDEX).applyQuaternion(qf);
    over(Math.abs(Math.asin(clamp1(_e.y)) * DEG), 30, 'foot rolled');
    put('ankle ' + S, b['foot' + S]);
  }
  _eu.setFromQuaternion(_q.copy(b.spine.quaternion).multiply(b.chest.quaternion), 'YXZ');
  over(-_eu.x * DEG, 85, 'bent forward'); over(_eu.x * DEG, 30, 'bent back'); over(Math.abs(_eu.y) * DEG, 50, 'twisted'); over(Math.abs(_eu.z) * DEG, 35, 'bent sideways');
  put('spine', b.chest);
  _eu.setFromQuaternion(_q.copy(b.neck.quaternion).multiply(b.head.quaternion), 'YXZ');
  over(-_eu.x * DEG, 65, 'chin down'); over(_eu.x * DEG, 55, 'head back'); over(Math.abs(_eu.y) * DEG, 80, 'head turned'); over(Math.abs(_eu.z) * DEG, 40, 'head tilted');
  put('neck', b.head);
  return out;
}

// ---------------------------------------------------------------- the body as capsules
// radii (m, for a 1.78 m man) a little inside the skin: the torso is its core (the chest is wider than deep)
const PARTS = [
  // name, from bone, to bone (or a point in the head's frame), radius
  ['torso', 'hips', 'neck', 0.11], ['neck', 'neck', 'head', 0.05], ['head', 'skull', 'skull', 0.095],
  ['upper arm L', 'upperArmL', 'forearmL', 0.045], ['forearm L', 'forearmL', 'handL', 0.04], ['hand L', 'gripL', 'gripL', 0.04],
  ['upper arm R', 'upperArmR', 'forearmR', 0.045], ['forearm R', 'forearmR', 'handR', 0.04], ['hand R', 'gripR', 'gripR', 0.04],
  ['thigh L', 'thighL', 'shinL', 0.075], ['shin L', 'shinL', 'footL', 0.055], ['thigh R', 'thighR', 'shinR', 0.075], ['shin R', 'shinR', 'footR', 0.055],
];
const PI = Object.fromEntries(PARTS.map((p, i) => [p[0], i]));
const SKULL = new THREE.Vector3(0, 0.085, -0.015); // the middle of the head from the head joint

// own-body pairs: [part, part, trim of the first, trim of the second] (a trim is the stretch of the segment tested:
// an upper arm leaves its shoulder end out, the thighs their tops beside each other at the hips)
const SELF = [];
for (const [S, O] of [['L', 'R'], ['R', 'L']]) {
  for (const p of ['head', 'neck', 'torso']) SELF.push([`forearm ${S}`, p], [`hand ${S}`, p]);
  SELF.push([`upper arm ${S}`, 'head', [0.25, 1]]);
  SELF.push([`forearm ${S}`, `upper arm ${O}`, null, [0.25, 1]], [`hand ${S}`, `upper arm ${O}`, null, [0.25, 1]], [`hand ${S}`, `forearm ${O}`]);
  for (const l of ['thigh L', 'thigh R', 'shin L', 'shin R']) SELF.push([`forearm ${S}`, l, null, l.startsWith('thigh') ? [0.3, 1] : null]);
}
SELF.push(['forearm L', 'forearm R'], ['upper arm L', 'upper arm R', [0.25, 1], [0.25, 1]], ['hand L', 'hand R']);
SELF.push(['thigh L', 'thigh R', [0.35, 1], [0.35, 1]], ['shin L', 'shin R'], ['thigh L', 'shin R', [0.35, 1]], ['thigh R', 'shin L', [0.35, 1]]);
const SELF_I = SELF.map(([a, b, ta, tb]) => [PI[a], PI[b], ta ?? [0, 1], tb ?? [0, 1], `${a}/${b}`]);

// closest distance between segments p0 p1 and q0 q1 (flat arrays at offsets), Ericson 5.1.9
function segSeg(A, a, ta, B, b, tb) {
  const a0 = ta[0], a1 = ta[1], b0 = tb[0], b1 = tb[1];
  const ux = A[a + 3] - A[a], uy = A[a + 4] - A[a + 1], uz = A[a + 5] - A[a + 2];
  const vx = B[b + 3] - B[b], vy = B[b + 4] - B[b + 1], vz = B[b + 5] - B[b + 2];
  const px = A[a] + ux * a0, py = A[a + 1] + uy * a0, pz = A[a + 2] + uz * a0, qx = B[b] + vx * b0, qy = B[b + 1] + vy * b0, qz = B[b + 2] + vz * b0;
  const dx = ux * (a1 - a0), dy = uy * (a1 - a0), dz = uz * (a1 - a0), ex = vx * (b1 - b0), ey = vy * (b1 - b0), ez = vz * (b1 - b0);
  const rx = px - qx, ry = py - qy, rz = pz - qz;
  const aa = dx * dx + dy * dy + dz * dz, ee = ex * ex + ey * ey + ez * ez, f = ex * rx + ey * ry + ez * rz;
  let s, t;
  if (aa < 1e-9 && ee < 1e-9) { s = t = 0; } else if (aa < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / ee)); } else {
    const c = dx * rx + dy * ry + dz * rz;
    if (ee < 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / aa)); } else {
      const bb = dx * ex + dy * ey + dz * ez, den = aa * ee - bb * bb;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (bb * f - c * ee) / den)) : 0;
      t = (bb * s + f) / ee;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / aa)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (bb - c) / aa)); }
    }
  }
  const x = px + dx * s - (qx + ex * t), y = py + dy * s - (qy + ey * t), z = pz + dz * s - (qz + ez * t);
  _c[0] = (px + dx * s + qx + ex * t) / 2; _c[1] = (py + dy * s + qy + ey * t) / 2; _c[2] = (pz + dz * s + qz + ez * t) / 2;
  return Math.sqrt(x * x + y * y + z * z);
}
const _c = [0, 0, 0];

export class Body {
  constructor(crew, steel, walls, contacts) {
    Object.assign(this, { crew, steel, walls, contacts });
    Object.assign(contacts.res, { joint: {}, self: {}, hit: {} });
    this.segs = crew.men.map(() => ({ P: new Float32Array(PARTS.length * 6), R: new Float32Array(PARTS.length), box: [0, 0, 0, 0] }));
    this.js = [];
  }

  // a man's capsules this frame (world space)
  capsules(m, S) {
    const b = m.fig.bones, sc = m.root.scale.x, P = S.P;
    const at = (name, v) => {
      if (name === 'skull') return v.copy(SKULL).applyMatrix4(b.head.matrixWorld);
      if (name === 'gripL' || name === 'gripR') return m.fig.anchors['hand' + name[4]].getWorldPosition(v);
      return b[name].getWorldPosition(v);
    };
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    PARTS.forEach(([, a, bb, r], i) => {
      at(a, _h); at(bb, _f);
      P.set([_h.x, _h.y, _h.z, _f.x, _f.y, _f.z], i * 6); S.R[i] = r * sc;
      x0 = Math.min(x0, _h.x, _f.x); x1 = Math.max(x1, _h.x, _f.x); z0 = Math.min(z0, _h.z, _f.z); z1 = Math.max(z1, _h.z, _f.z);
    });
    S.box[0] = x0; S.box[1] = z0; S.box[2] = x1; S.box[3] = z1;
    return S;
  }

  // one sampled frame (every `every` frames: the seconds count that many frames each)
  // (props: the carried shells into the steel this frame, from crewcheck: { name, d, own, pt })
  check(c, T, every, props = []) {
    const { crew, steel, walls, contacts } = this, men = crew.men, L = (cls, key, v, what, pt, big) => contacts.log(cls, key, v, c, T, what, pt, big);
    const DT0 = contacts.DT;
    contacts.DT = DT0 * every;
    const segs = men.map((m, i) => (m.root.visible ? this.capsules(m, this.segs[i]) : null));
    men.forEach((m, i) => {
      const S = segs[i];
      if (!S) return;
      const b = m.fig.bones, role = m.role;
      // joints past their range
      for (const j of jointsOf(b, this.js)) { j.bone.getWorldPosition(_h); L('joint', `${role} ${j.name}`, j.over, `joint ${role} ${j.name}: ${j.label}`, [_h.x, _h.y, _h.z], JOINT_BIG); }
      // his own limbs through his body: the worst pair of each kind
      for (const [pa, pb, ta, tb, name] of SELF_I) {
        const d = S.R[pa] + S.R[pb] - segSeg(S.P, pa * 6, ta, S.P, pb * 6, tb);
        if (d > HIT) L('self', `${role} ${name}`, d, `self ${role} ${name.replace('/', ' through ')}`, _c, HIT_BIG);
      }
      // into the steel: the legs above the ankle (the boots stand on the platforms), the forearm short of the wrist
      // (a hand on a handle brings the wrist to the steel), a hand only when the whole fist is inside
      let worst = 0, part = '', own = '', pt = null;
      const yMin = m.y + 0.1;
      PARTS.forEach(([name], k) => {
        if (name === 'neck' || name.startsWith('hand')) return;
        const P = S.P, o = k * 6, leg = name.startsWith('thigh') || name.startsWith('shin'), e = name.startsWith('forearm') ? 0.7 : 1;
        const h = steel.hit(P[o], P[o + 1], P[o + 2], P[o] + (P[o + 3] - P[o]) * e, P[o + 1] + (P[o + 4] - P[o + 1]) * e, P[o + 2] + (P[o + 5] - P[o + 2]) * e, S.R[k], leg ? yMin : -1e9);
        if (h.d > worst) { worst = h.d; part = name; own = steel.ownerOf(h.i); pt = [steel.world[h.i * 3], steel.world[h.i * 3 + 1], steel.world[h.i * 3 + 2]]; }
      });
      for (const side of ['L', 'R']) {
        const o = PI['hand ' + side] * 6, P = S.P;
        if (!steel.inside(P[o], P[o + 1], P[o + 2])) continue;
        const h = steel.hit(P[o], P[o + 1], P[o + 2], P[o], P[o + 1], P[o + 2], 0.3, -1e9), depth = h.d > 0 ? 0.3 - h.d : 0.3;
        if (depth - 0.01 > worst) { worst = depth - 0.01; part = 'hand ' + side; own = 'the steel (the whole fist)'; pt = [P[o], P[o + 1], P[o + 2]]; }
      }
      if (worst > HIT) L('hit', `${role} in steel`, worst, `hit ${role} ${part} in ${own.split('>').slice(-2).join('>')}`, pt, HIT_BIG);
      // into the pit's sandbags and the battery's boxes
      worst = 0;
      for (const bx of walls) PARTS.forEach(([name], k) => {
        if (name.startsWith('hand')) return;
        const P = S.P, o = k * 6, leg = name.startsWith('thigh') || name.startsWith('shin');
        if (m.y >= bx.max[1] - 0.12) return; // standing on it
        for (let u = 0; u <= 4; u++) {
          const t = u / 4, x = P[o] + (P[o + 3] - P[o]) * t, y = P[o + 1] + (P[o + 4] - P[o + 1]) * t, z = P[o + 2] + (P[o + 5] - P[o + 2]) * t, r = S.R[k];
          if (leg && y < yMin || y - r > bx.max[1] || y + r < bx.min[1]) continue;
          const dx = Math.max(bx.min[0] - x, 0, x - bx.max[0]), dy = Math.max(bx.min[1] - y, 0, y - bx.max[1]), dz = Math.max(bx.min[2] - z, 0, z - bx.max[2]), d = Math.hypot(dx, dy, dz);
          const pen = d > 0 ? r - d : r + Math.min(x - bx.min[0], bx.max[0] - x, z - bx.min[2], bx.max[2] - z);
          if (pen > worst) { worst = pen; part = name; own = bx.name; pt = [x, y, z]; }
        }
      });
      if (worst > HIT) L('hit', `${role} in ${own}`, worst, `hit ${role} ${part} in ${own}`, pt, HIT_BIG);
      // into the other men (every part, the arms and hands too)
      for (let j = i + 1; j < men.length; j++) {
        const Q = segs[j];
        if (!Q || S.box[0] > Q.box[2] + 0.3 || Q.box[0] > S.box[2] + 0.3 || S.box[1] > Q.box[3] + 0.3 || Q.box[1] > S.box[3] + 0.3) continue;
        let w = 0, pa = '', pb = '', at = null;
        for (let a = 0; a < PARTS.length; a++) for (let k = 0; k < PARTS.length; k++) {
          const d = S.R[a] + Q.R[k] - segSeg(S.P, a * 6, [0, 1], Q.P, k * 6, [0, 1]);
          if (d > w) { w = d; pa = PARTS[a][0]; pb = PARTS[k][0]; at = [..._c]; }
        }
        if (w > HIT) L('hit', `${role} in ${men[j].role}`, w, `hit ${role} ${pa} in ${men[j].role} ${pb}`, at, HIT_BIG);
      }
    });
    for (const h of props) if (h.d > HIT) L('hit', `${h.name} in steel`, h.d, `hit ${h.name} in ${h.own.split('>').slice(-2).join('>')}`, h.pt, HIT_BIG);
    contacts.DT = DT0;
  }
}

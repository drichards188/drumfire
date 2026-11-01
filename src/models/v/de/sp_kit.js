import * as THREE from 'three';
import { V, box, xTube, yTube, zTube, rod, xLathe, rivets } from '../../kit.js';
import { wheelSet, instanceOf } from './heavy_common.js';
import { ring } from '../../t/fieldkit.js';

// The tracked-vehicle kit of the WW2 self-propelled howitzers (wespe.js, hummel.js): the running gear (road wheels,
// drive sprocket, idler and return rollers as instanced sets, the track as instanced links run round them), the
// drive (rig.setDrive, rig.driveBy, the tracks counter-running as the hull pivots on the spot) and small fittings
// shared by both hulls. Everything is built once; the per-frame work is matrix updates into preallocated arrays.
//
// Frames: the gear is built in the vehicle's frame (the rig's traverse pivot: x right, y up from the ground, front -Z),
// the drive sprocket at the front (-Z), the idler at the rear, as on the Panzer II and Panzer IV chassis.

export const TAU = Math.PI * 2;
const wrapPi = (a) => a - TAU * Math.round(a / TAU);

// ---------------------------------------------------------------- the belt
// The track's centre line in the (z, y) plane: a closed loop of circles taken in order (the ground run toward +Z under
// the road wheels, up round the idler, forward over the return rollers, down round the sprocket), joined by their outer
// tangents and the arcs between. The loop must be convex (each roller's top above the line from its neighbours').
// Returns { z, y, s, n, len }: the polyline and its running length.
function belt(circles) {
  const n = circles.length, AIN = new Float32Array(n), AOUT = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = circles[i], b = circles[(i + 1) % n];
    const dz = b.z - a.z, dy = b.y - a.y, D = Math.hypot(dz, dy) || 1, ux = dz / D, uy = dy / D;
    const s = Math.max(-1, Math.min(1, (a.r - b.r) / D)), c = Math.sqrt(1 - s * s);
    const nz = uy * c + ux * s, ny = -ux * c + uy * s; // the right-hand normal, tilted for unequal radii
    AOUT[i] = Math.atan2(ny, nz); AIN[(i + 1) % n] = AOUT[i];
  }
  const Z = [], Y = [];
  for (let i = 0; i < n; i++) {
    const C = circles[i];
    let da = ((AOUT[i] - AIN[i]) % TAU + TAU) % TAU;
    if (da > TAU - 1e-3) da = 0;
    const k = Math.max(1, Math.ceil(da / (12 * Math.PI / 180)));
    for (let q = 0; q <= k; q++) {
      const a = AIN[i] + (da * q) / k;
      Z.push(C.z + C.r * Math.cos(a)); Y.push(C.y + C.r * Math.sin(a));
      if (da === 0) break;
    }
  }
  const N = Z.length, S = new Float32Array(N + 1);
  for (let i = 1; i <= N; i++) { const j = i % N, p = i - 1; S[i] = S[p] + Math.hypot(Z[j] - Z[p], Y[j] - Y[p]); }
  return { z: Float32Array.from(Z), y: Float32Array.from(Y), s: S, n: N, len: S[N] };
}

/**
 * The running gear of one tracked hull, both sides.
 *   o.tx         track centre (x of its middle plane)
 *   o.th         link thickness (the belt runs th/2 outside the road wheels' tyres)
 *   o.pitch      link pitch (the number of links is the loop's length over it, rounded)
 *   o.wheels     [{ z, y, r }] the road wheel stations, front to rear (r over the tyre)
 *   o.sprocket   { z, y, r } (r: the pitch radius), o.idler { z, y, r }, o.rollers [{ z, y, r }] front to rear
 *   o.parts      () => a new Parts of the rig's materials
 *   o.wheel(P, s), o.sprocketP(P, s), o.idlerP(P, s), o.rollerP(P, s): the parts about their own centre (axis x), s the
 *                side (+1 right: its outer face toward +x)
 *   o.shoe(P)    one link about its centre: x across, z along the run, its ground face toward -y
 * Returns { run(dl, dr) }: dl and dr how far each track has run (metres; + = driving forward), which turns the wheels
 * and moves the links. Instanced: per side one InstancedMesh per material for each kind of wheel, and the links.
 */
export function trackGear(parent, o) {
  const groups = {};
  const tpl = (name, fn, s, y0) => {
    const P = o.parts();
    fn(P, s);
    const g = new THREE.Group();
    P.build(g, { dirt: 0.5, y0 });
    return g;
  };
  const sets = [];
  for (const s of [-1, 1]) {
    const x = s * o.tx;
    const w = wheelSet(tpl('wheel', o.wheel, s, o.wheels[0].y), o.wheels.map((q) => V(x, q.y, q.z)), parent, 'road-wheels');
    const sp = wheelSet(tpl('sprocket', o.sprocketP, s, o.sprocket.y), [V(x, o.sprocket.y, o.sprocket.z)], parent, 'sprocket');
    const id = wheelSet(tpl('idler', o.idlerP, s, o.idler.y), [V(x, o.idler.y, o.idler.z)], parent, 'idler');
    const rr = o.rollers.length ? wheelSet(tpl('roller', o.rollerP, s, o.rollers[0].y), o.rollers.map((q) => V(x, q.y, q.z)), parent, 'return-rollers') : null;
    sets.push({ w, sp, id, rr });
  }
  groups.sets = sets;
  // the belt: the first and last road wheel carry the ground run, the rollers the top run
  const w0 = o.wheels[0], w1 = o.wheels[o.wheels.length - 1], h = o.th / 2;
  const circles = [{ z: w0.z, y: w0.y, r: w0.r + h }, { z: w1.z, y: w1.y, r: w1.r + h }, { ...o.idler, r: o.idler.r + h }];
  for (let i = o.rollers.length - 1; i >= 0; i--) circles.push({ ...o.rollers[i], r: o.rollers[i].r + h });
  circles.push({ ...o.sprocket });
  const B = belt(circles);
  const NSH = Math.round(B.len / o.pitch);
  const tSh = new THREE.Group(), PSH = o.parts();
  o.shoe(PSH);
  PSH.build(tSh, { dirt: 0.7, y0: 0.05 });
  const shoes = instanceOf(tSh, NSH * 2, parent, 'track');
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _x = new THREE.Vector3(1, 0, 0);
  const last = [NaN, NaN];
  const placeSide = (side, dist) => {
    const pitch = B.len / NSH, off = side * NSH, x = (side ? 1 : -1) * o.tx;
    let seg = 0;
    for (let i = 0; i < NSH; i++) {
      let sv = (i * pitch + dist) % B.len;
      if (sv < 0) sv += B.len;
      if (B.s[seg] > sv) seg = 0;
      while (seg < B.n - 1 && B.s[seg + 1] < sv) seg++;
      const a = seg, b = (seg + 1) % B.n, f = (sv - B.s[a]) / Math.max(1e-6, B.s[seg + 1] - B.s[a]);
      const tz = B.z[b] - B.z[a], ty = B.y[b] - B.y[a], l = Math.hypot(tz, ty) || 1;
      _q.setFromAxisAngle(_x, Math.atan2(-ty / l, tz / l));
      _p.set(x, B.y[a] + ty * f, B.z[a] + tz * f);
      _m.compose(_p, _q, _s);
      for (const im of shoes) im.setMatrixAt(off + i, _m);
    }
    for (const im of shoes) im.instanceMatrix.needsUpdate = true;
  };
  const run = (dl, dr) => {
    for (let side = 0; side < 2; side++) {
      const d = side ? dr : dl;
      if (d === last[side]) continue;
      last[side] = d;
      const S = sets[side];
      S.w.turn(-d / w0.r);
      S.sp.turn(-d / o.sprocket.r);
      S.id.turn(-d / o.idler.r);
      if (S.rr) S.rr.turn(-d / o.rollers[0].r);
      placeSide(side, d);
    }
  };
  run(0, 0);
  for (const im of shoes) im.computeBoundingSphere();
  return { run, links: NSH, length: B.len };
}

/**
 * The drive of a rig whose traverse pivot is the whole vehicle: rig.setDrive(v) (m/s, + forward; rig.update(dt)
 * integrates it), rig.driveBy(d) (metres at once), and rig.setTraverse(r) turning the hull with its tracks running
 * against each other (a pivot turn: the outer track forward, the inner one back, each by the angle times the half gauge).
 * Returns { update(dt) } for the rig's own update to call.
 */
export function trackDrive(rig, trav, gear, tx) {
  let speed = 0, az = trav.rotation.y, dl = 0, dr = 0;
  const wrapRun = (d) => (Math.abs(d) > 1e5 ? d % (gear.length * 1000) : d);
  rig.setDrive = (v) => { speed = Number.isFinite(v) ? v : 0; };
  rig.driveBy = (d) => { if (d) { dl = wrapRun(dl + d); dr = wrapRun(dr + d); gear.run(dl, dr); } };
  rig.setTraverse = (r) => {
    const d = wrapPi(r - az);
    az = r;
    trav.rotation.y = r;
    if (d) { dl = wrapRun(dl - d * tx); dr = wrapRun(dr + d * tx); gear.run(dl, dr); }
  };
  return { update(dt) { if (speed && dt > 0) rig.driveBy(speed * dt); }, speed: () => speed };
}

// ---------------------------------------------------------------- parts for the wheel templates (axis x, centre 0)

// A rubber-tyred double road wheel (two pressed discs either side of the guide horns), r over the tyre, `gap` the
// space between the pair, `w` each tyre's width, `bolts` round the hub.
export function doubleRoadWheel(P, s, { r, w = 0.09, gap = 0.08, tyre = 0.05, bolts = 8, dish = 0.025, hub = 0.09 }) {
  for (const k of [-1, 1]) {
    const c = k * (gap / 2 + w / 2);
    P.add('tyre', xTube(c - w / 2, c + w / 2, r, r, 30));
    P.add('camo', xTube(c - w / 2 - 0.004, c + w / 2 + 0.004, r - tyre, r - tyre, 26));
    // the dished disc: its outer ring set back, the middle standing out toward the wheel's outer face
    const o = k * (w / 2 + 0.004);
    P.add('camo', ring(r * 0.55, r - tyre, c + o - k * dish - 0.006, c + o - k * dish + 0.006, 26));
    P.add('camo', ring(hub, r * 0.58, c + o - 0.006, c + o + 0.006, 22));
  }
  const xo = s * (gap / 2 + w + 0.01);
  P.add('camo', xTube(-gap / 2 - w, gap / 2 + w, hub * 0.8, hub * 0.8, 12));
  P.add('dark', xTube(xo, xo + s * 0.05, hub * 0.75, hub * 0.55, 14)); // the hub cap
  const bp = [];
  for (let i = 0; i < bolts; i++) { const a = (i / bolts) * TAU; bp.push(V(xo, Math.cos(a) * hub * 1.3, Math.sin(a) * hub * 1.3)); }
  P.add('steel', rivets(bp, V(s, 0, 0), 0.012));
}

// A drive sprocket: two toothed rings on a dished hub with lightening holes shown as dark discs, the final drive cover.
export function sprocketParts(P, s, { r, teeth = 19, w = 0.07, gap = 0.1, holes = 6 }) {
  for (const k of [-1, 1]) {
    const c = k * (gap / 2 + w / 2);
    P.add('camo', xTube(c - w / 2, c + w / 2, r - 0.04, r - 0.04, 28));
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU;
      P.add('steel', box(w, 0.05, 0.07, c, Math.cos(a) * (r + 0.005), Math.sin(a) * (r + 0.005), a));
    }
  }
  const xo = s * (gap / 2 + w + 0.005);
  P.add('camo', xLathe(s > 0 ? [[xo - 0.02, r - 0.06], [xo + 0.03, r * 0.5], [xo + 0.05, r * 0.25], [xo + 0.05, 0.0001]] : [[xo - 0.05, 0.0001], [xo - 0.05, r * 0.25], [xo - 0.03, r * 0.5], [xo + 0.02, r - 0.06]], 22));
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * TAU + 0.3;
    P.add('dark', xTube(xo + s * 0.02, xo + s * 0.035, r * 0.12, r * 0.12, 10, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55));
  }
  P.add('dark', xTube(xo, xo + s * 0.09, r * 0.22, r * 0.18, 14));
  const bp = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; bp.push(V(xo + s * 0.05, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3)); }
  P.add('steel', rivets(bp, V(s, 0, 0), 0.011));
}

// A spoked idler: a double steel rim on `spokes` flat spokes, a big hub.
export function idlerParts(P, s, { r, spokes = 6, w = 0.07, gap = 0.1 }) {
  for (const k of [-1, 1]) {
    const c = k * (gap / 2 + w / 2);
    P.add('steel', xTube(c - w / 2, c + w / 2, r, r, 28));
    P.add('camo', xTube(c - w / 2 + 0.005, c + w / 2 - 0.005, r - 0.035, r - 0.035, 26));
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + (k > 0 ? 0 : Math.PI / spokes);
      P.add('camo', box(0.025, r - 0.08, 0.06, c, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, a - Math.PI / 2));
    }
  }
  P.add('camo', xTube(-gap / 2 - w, gap / 2 + w, 0.07, 0.07, 14));
  P.add('dark', xTube(s * (gap / 2 + w), s * (gap / 2 + w + 0.05), 0.06, 0.045, 12));
}

// A return roller: a rubber-tyred (or steel) double roller on its stub.
export function rollerParts(P, s, { r, w = 0.06, gap = 0.07, rubber = true }) {
  for (const k of [-1, 1]) {
    const c = k * (gap / 2 + w / 2);
    P.add(rubber ? 'tyre' : 'steel', xTube(c - w / 2, c + w / 2, r, r, 16));
    P.add('camo', xTube(c - w / 2 - 0.003, c + w / 2 + 0.003, r * 0.62, r * 0.62, 12));
  }
  P.add('dark', xTube(-gap / 2 - w, s * (gap / 2 + w + 0.03), r * 0.3, r * 0.3, 10));
}

// One track link: the plate with a ground cleat (toward -y), the hinge knuckles, a centre guide horn inside (+y).
export function shoeParts(P, { w, pitch, t = 0.03, horn = 0.07, cleat = true }) {
  P.add('dark', box(w, t, pitch * 0.86, 0, 0, 0));
  if (cleat) P.add('dark', box(w - 0.02, 0.022, 0.035, 0, -t / 2 - 0.009, 0.01));
  for (const z of [-pitch / 2 + 0.012, pitch / 2 - 0.012]) {
    for (const x of [-w * 0.33, w * 0.33]) P.add('dark', xTube(x - w * 0.15, x + w * 0.15, t * 0.62, t * 0.62, 6, 0, z));
  }
  P.add('dark', box(0.035, horn, pitch * 0.55, 0, t / 2 + horn / 2 - 0.005, 0)); // guide horn
}

// ---------------------------------------------------------------- fittings

// A handwheel facing along z (axis z): rim, spokes, hub, a crank handle on the rim.
export function handwheelZ(P, x, y, z, R, dz = 1) {
  P.add('dark', new THREE.TorusGeometry(R, 0.011, 6, 22).translate(x, y, z));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    P.add('dark', rod(V(x, y, z), V(x + Math.cos(a) * R, y + Math.sin(a) * R, z), 0.0065, 4));
  }
  P.add('dark', zTube(z - 0.03, z + 0.03, 0.022, 0.022, 10, x, y));
  const hx = x + R * Math.cos(0.3 + TAU / 10), hy = y + R * Math.sin(0.3 + TAU / 10);
  P.add('dark', zTube(z, z + dz * 0.08, 0.01, 0.01, 6, hx, hy));
  P.add('dark', zTube(z + dz * 0.04, z + dz * 0.09, 0.015, 0.015, 6, hx, hy));
}

// A handwheel facing along x (axis x).
export function handwheelX(P, x, y, z, R, dx = 1) {
  P.add('dark', new THREE.TorusGeometry(R, 0.011, 6, 22).rotateY(Math.PI / 2).translate(x, y, z));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    P.add('dark', rod(V(x, y, z), V(x, y + Math.cos(a) * R, z + Math.sin(a) * R), 0.0065, 4));
  }
  P.add('dark', xTube(x - 0.03, x + 0.03, 0.022, 0.022, 10, y, z));
  P.add('dark', xTube(x, x + dx * 0.09, 0.012, 0.012, 6, y + R * Math.cos(0.3), z + R * Math.sin(0.3)));
}

// A 20-litre jerrycan standing upright at (x, y, z), its broad face along x when ry = 0.
export function jerrycan(P, x, y, z, ry = 0) {
  P.add('camo', box(0.165, 0.47, 0.345, x, y + 0.235, z, 0, ry, 0), { tint: 0xc8c8b8 });
  for (const k of [-1, 1]) P.add('dark', box(0.17, 0.02, 0.3, x, y + 0.24 + k * 0.1, z, 0, ry, 0));
  P.add('dark', box(0.04, 0.05, 0.2, x, y + 0.49, z, 0, ry, 0));
}

// A shovel, a pick or a crowbar strapped flat on a deck (along z), its head toward +z.
export function tool(P, kind, x, y, z, len = 1.0) {
  P.add('timber', zTube(z - len / 2, z + len / 2 - 0.2, 0.018, 0.018, 6, x, y + 0.02));
  if (kind === 'shovel') P.add('dark', box(0.2, 0.012, 0.26, x, y + 0.012, z + len / 2 - 0.08));
  else if (kind === 'pick') P.add('dark', box(0.5, 0.03, 0.04, x, y + 0.03, z + len / 2 - 0.18));
  else P.add('dark', zTube(z + len / 2 - 0.2, z + len / 2, 0.016, 0.01, 6, x, y + 0.02));
  for (const dz of [-len * 0.3, len * 0.2]) P.add('dark', box(0.06, 0.03, 0.03, x, y + 0.015, z + dz)); // clamps
}

// A Notek blackout lamp on a short bracket, facing -z.
export function notek(P, x, y, z) {
  P.add('dark', yTube(y, y + 0.08, 0.012, 0.012, 6, x, z));
  P.add('dark', zTube(z - 0.06, z + 0.06, 0.06, 0.055, 12, x, y + 0.12));
  P.add('lens', zTube(z - 0.065, z - 0.06, 0.04, 0.04, 10, x, y + 0.12));
  P.add('dark', box(0.13, 0.02, 0.06, x, y + 0.165, z - 0.04)); // the hood
}

// A silencer: a drum along x from x0 to x1 at (y, z) with domed ends.
export function silencer(P, x0, x1, y, z, r) {
  P.add('rust', xTube(x0 + r * 0.3, x1 - r * 0.3, r, r, 18, y, z), { tint: 0x8c7464 });
  P.add('rust', xLathe([[x0, 0.0001], [x0 + r * 0.1, r * 0.6], [x0 + r * 0.3, r]], 18).translate(0, y, z), { tint: 0x8c7464 });
  P.add('rust', xLathe([[x1 - r * 0.3, r], [x1 - r * 0.1, r * 0.6], [x1, 0.0001]], 18).translate(0, y, z), { tint: 0x8c7464 });
  for (const x of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75]) P.add('dark', xTube(x - 0.02, x + 0.02, r + 0.008, r + 0.008, 18, y, z));
}

// The ready rounds standing in a bin: an open box with the rounds in rows (shell noses down, the brass case bases up
// where a charge is seated), from (x0, z0) to (x1, z1) on a floor at y, `h` high; `top` the material of what shows
// (brass cartridge cases, or 'shell' for the projectiles of separate-loading rounds, base up)
export function roundBin(P, x0, x1, z0, z1, y, h, r, rows, cols, top = 'brass') {
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  P.add('camo', box(w, 0.02, d, xm, y + 0.01, zm));
  for (const z of [z0, z1]) P.add('camo', box(w, h, 0.012, xm, y + h / 2, z));
  for (const x of [x0, x1]) P.add('camo', box(0.012, h, d, x, y + h / 2, zm));
  P.add('camo', box(w, 0.012, d, xm, y + h * 0.7, zm)); // the holding plate with its holes (the rounds through it)
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + (i + 0.5) * w / cols, z = z0 + (j + 0.5) * d / rows;
    P.add(top, yTube(y + h * 0.7, y + h + 0.01, r, r, 10, x, z), top === 'shell' ? { tint: 0x5a5f52 } : undefined);
    P.add(top === 'shell' ? 'brass' : 'dark', yTube(y + h + 0.01, y + h + 0.015, r * (top === 'shell' ? 0.85 : 0.35), r * (top === 'shell' ? 0.85 : 0.35), 8, x, z)); // the primer, or the driving band's edge
  }
}

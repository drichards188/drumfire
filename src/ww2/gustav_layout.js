// The Gustav's railway works (plain data and pure functions, Node-safe): heavy_gustav_site.js lays them,
// gustav_works.js moves the trains, the gun and the cranes on them, ops.js levels their ground.
//
// As the sources describe it (refs/gustav, docs/WW2.md): the gun came in pieces on special wagons and was
// assembled on a straight three-track section (the two gun tracks and a delivery track) under two gantry
// cranes running on rails of their own outside them; the parts were lifted off the wagons on the delivery
// track and set on the gun; two diesel locomotives then moved the finished gun onto the double-track firing
// curve. Here the straight runs back from the curve's rear end; behind it a small yard holds the parts trains
// on their sidings from the start, so nothing arrives from nowhere.
//
// Site frame (the gun's rig at its firing station at az = 0, as buildGustavSite): x right, z back, rail head
// y = 0. The firing curve (radius R about (-R, 0, 0)) runs from A0 (its rear end) to A1. `s` is the distance
// along the gun tracks' centreline from the straight's far end (the curve starts at s = RUN). On the straight,
// (d, x) is d metres back from the curve's start and x to the right of the centreline.
export const R = 250;
export const TRACK_X = 2.4, GA = 0.7175; // the gun tracks' centres, half gauge (rail centre)
export const DEL_X = 7.6; // the delivery track (the third track of the assembly section)
export const AMMO_X = -27; // the ammunition train's siding, out beyond the cranes' derricks and stacked sections
export const CRANE_X = [-7.2, 12.2]; // the gantry cranes' own rails, spanning all three tracks
export const D_ASM = 50; // the gun's centre on the straight while it is assembled
export const CRANE_D = [12, 150]; // the crane rails' extent along the straight
// a gantry crane in its own frame (centred between its rails, on the straight, legs along d): half-span, the legs'
// spacing along the rail, the bridge's underside; each side built of SEG sections, put up by the derricks
export const CRANE = { cx: (CRANE_X[0] + CRANE_X[1]) / 2, hs: (CRANE_X[1] - CRANE_X[0]) / 2, D: 2.2, H: 19.5, SEG: 3 };
// the four hand derricks on their timber platforms (one each side of each crane, outside its rails), and where the
// sections stand ready beside them (crane frame x, outward of the derrick). Each crane is put up on its own ground:
// its derricks stand on its far side from the other crane (z, crane frame: the curve's side for the first, the
// yard's for the second) and guy away from it, so no guy runs over a stack of sections
export const DERRICK = { x: CRANE.hs + 4.8, mast: 26, boom: 22, foot: 1.6, stack: [CRANE.hs + 7.2, CRANE.hs + 9.6, CRANE.hs + 12.0], z: [-9, 9] };
// The flak cover (two army flak battalions guarded the gun in the sources; four positions stand for them here): in the
// order they come in, light (2 cm Flakvierling, the best answer to low ground-attack aircraft) and heavy (8.8 cm), each
// with the ring of its pit and the field it waits in before its tractor tows it in (site frame, ground level)
export const FLAK = [[-86, 98, 'light'], [-118, -42, 'heavy'], [92, -104, 'light'], [112, 58, 'heavy']].map(([x, z, kind]) => {
  const r = Math.hypot(x, z), ux = x / r, uz = z / r;
  return { x, z, kind, ring: kind === 'heavy' ? 5.4 : 3.2, rows: kind === 'heavy' ? 5 : 4, yaw: Math.atan2(x, z) + Math.PI, wait: { x: x + ux * 170, z: z + uz * 170 } };
});
// the yard: a ladder of three sidings off the delivery track, each leaving the one before it, 8 m apart (the widest
// part, the upper carriage, is 7.1 m), so every train waits clear of the others' way out
export const SIDING_X = [DEL_X + 8, DEL_X + 16, DEL_X + 24], SIDING_D = [150, 200, 250];
const SWITCH = 40;

export function gustavLayout({ arc = 0.2, yard = false } = {}) {
  const half = Math.max(0.3, arc + 0.1), A0 = -half, A1 = half;
  const RUN = yard ? 360 : 80;
  const LT = RUN + R * (A1 - A0), S_STATION = RUN + R * half;
  const sa = Math.sin(A0), ca = Math.cos(A0);
  const C0 = { x: -R + R * ca, z: -R * sa };
  // a point on the gun tracks (xo to the right of the centreline) at s, with its heading (rotation.y)
  const at = (s, xo = 0, out = { x: 0, z: 0, a: 0 }) => {
    if (s < RUN) return onStraight(RUN - s, xo, out);
    const a = A0 + (s - RUN) / R;
    out.x = -R + (R + xo) * Math.cos(a);
    out.z = -(R + xo) * Math.sin(a);
    out.a = a;
    return out;
  };
  const onStraight = (d, x, out = { x: 0, z: 0, a: 0 }) => {
    out.x = C0.x + d * sa + x * ca;
    out.z = C0.z + d * ca - x * sa;
    out.a = A0;
    return out;
  };
  // a track as a sampled polyline from its far end (u = 0) forward: points in the site frame, the distance
  // along it, and d (back from the curve's start) where it is on the straight, so a stop can be found by d
  const polyline = (pts) => {
    const n = pts.length, x = new Float64Array(n), z = new Float64Array(n), u = new Float64Array(n), d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = pts[i].x; z[i] = pts[i].z; d[i] = pts[i].d ?? NaN;
      u[i] = i ? u[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]) : 0;
    }
    return { n, x, z, u, d, len: u[n - 1] };
  };
  const straightPath = (xOf, d0, d1, step = 1) => {
    const pts = [];
    for (let d = d0; d >= d1 - 1e-6; d -= step) { const p = onStraight(d, xOf(d)); pts.push({ x: p.x, z: p.z, d }); }
    return polyline(pts);
  };
  // a turnout's S: from x0 at d = b + SWITCH to x1 at d = b (a cosine ramp, as near a pair of switch curves as a game needs)
  const gunPath = (xo) => {
    const pts = [];
    for (let s = 0; s <= LT + 1e-6; s += 1) { const p = at(s, xo); pts.push({ x: p.x, z: p.z, d: s <= RUN ? RUN - s : NaN }); }
    return polyline(pts);
  };
  const paths = {
    L: gunPath(-TRACK_X), R: gunPath(TRACK_X), C: gunPath(0),
    del: straightPath(() => DEL_X, RUN, 8),
    ammo: straightPath(() => AMMO_X, yard ? 220 : RUN, 10),
  };
  // the yard: each siding's route runs back down the ladder onto the delivery track and up it to its end
  let xOf = () => DEL_X;
  SIDING_X.forEach((sx, i) => {
    const prev = xOf, b = SIDING_D[i], x0 = i ? SIDING_X[i - 1] : DEL_X;
    xOf = (d) => (d <= b ? prev(d) : d >= b + SWITCH ? sx : x0 + (sx - x0) * (1 - Math.cos((Math.PI * (d - b)) / SWITCH)) / 2);
    paths[`sd${i + 1}`] = straightPath(xOf, RUN, 8);
  });
  // where the ammunition siding leaves the left gun track (drawn only: its train stands beyond it)
  paths.ammoSwitch = straightPath((d) => (d >= 290 ? -TRACK_X : d <= 220 ? AMMO_X : AMMO_X + (-TRACK_X - AMMO_X) * (1 - Math.cos((Math.PI * (d - 220)) / 70)) / 2), 290, 220);
  return { R, A0, A1, RUN, LT, S_STATION, at, onStraight, paths, yard };
}

// the point on a polyline at distance u (clamped), with the heading of its segment
export function pathAt(P, u, out = { x: 0, z: 0, a: 0 }) {
  const n = P.n;
  if (u <= 0) u = 0; else if (u >= P.len) u = P.len;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.u[m] <= u) lo = m; else hi = m; }
  const k = (u - P.u[lo]) / Math.max(1e-9, P.u[hi] - P.u[lo]);
  out.x = P.x[lo] + (P.x[hi] - P.x[lo]) * k;
  out.z = P.z[lo] + (P.z[hi] - P.z[lo]) * k;
  out.a = Math.atan2(-(P.x[hi] - P.x[lo]), -(P.z[hi] - P.z[lo])); // rotation.y that points -Z along the path
  return out;
}

// the distance along a polyline where it passes d (back from the curve's start, on the straight)
export function pathU(P, d) {
  for (let i = 1; i < P.n; i++) {
    const a = P.d[i - 1], b = P.d[i];
    if ((a - d) * (b - d) <= 0 && a !== b) return P.u[i - 1] + ((a - d) / (a - b)) * (P.u[i] - P.u[i - 1]);
  }
  return d >= P.d[0] ? 0 : P.len;
}

// a vehicle on a path: its body between two points `pitch` apart (its bogie centres), centred at u
export function vehicleAt(P, u, pitch, out = { x: 0, z: 0, a: 0 }) {
  const f = pathAt(P, u + pitch / 2, _f), b = pathAt(P, u - pitch / 2, _b);
  out.x = (f.x + b.x) / 2; out.z = (f.z + b.z) / 2;
  out.a = Math.atan2(-(f.x - b.x), -(f.z - b.z));
  return out;
}
const _f = { x: 0, z: 0, a: 0 }, _b = { x: 0, z: 0, a: 0 };

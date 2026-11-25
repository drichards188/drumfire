// Small shared maths of the lifelike crewman's clip layer (the port of the Godot game's drill/Drumfire.Drill/Clips):
// rotations kept as four numbers and slerped the short way, as Rot4 there. Nothing here allocates.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

// between (ax..aw) and (bx..bw) the short way, f of the way, into the quaternion o
export function slerp4(ax, ay, az, aw, bx, by, bz, bw, f, o) {
  if (f <= 0) return o.set(ax, ay, az, aw);
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  if (f >= 1) return o.set(bx, by, bz, bw);
  let s = 1 - f, t = f;
  if (dot < 0.9995) {
    const th = Math.acos(dot), sn = Math.sin(th);
    s = Math.sin(s * th) / sn; t = Math.sin(t * th) / sn;
    return o.set(ax * s + bx * t, ay * s + by * t, az * s + bz * t, aw * s + bw * t);
  }
  return o.set(ax * s + bx * t, ay * s + by * t, az * s + bz * t, aw * s + bw * t).normalize();
}

// (the same with its own body for two quaternions and for runs of numbers: a call that hands eight numbers to slerp4
// boxes each of them when the browser does not inline it, garbage on the hottest path)
export function slerpQ(a, b, f, o) {
  const ax = a.x, ay = a.y, az = a.z, aw = a.w;
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (f <= 0) return o.set(ax, ay, az, aw);
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  if (f >= 1) return o.set(bx, by, bz, bw);
  let s = 1 - f, t = f;
  if (dot < 0.9995) { const th = Math.acos(dot), sn = Math.sin(th); s = Math.sin(s * th) / sn; t = Math.sin(t * th) / sn; }
  o.set(ax * s + bx * t, ay * s + by * t, az * s + bz * t, aw * s + bw * t);
  return dot < 0.9995 ? o : o.normalize();
}

// between two samples of a run of numbers (x, y, z, w at ia and ib); unit: made unit again (float32 is unit only to
// seven places, and a bone turned by a rotation a little off unit would change length)
export function slerpRun(A, ia, B, ib, f, o, unit) {
  const ax = A[ia], ay = A[ia + 1], az = A[ia + 2], aw = A[ia + 3];
  let bx = B[ib], by = B[ib + 1], bz = B[ib + 2], bw = B[ib + 3];
  let s = 1 - f, t = f, dot = ax * bx + ay * by + az * bz + aw * bw;
  if (f <= 0) { s = 1; t = 0; } else {
    if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
    if (f >= 1) { s = 0; t = 1; } else if (dot < 0.9995) { const th = Math.acos(dot), sn = Math.sin(th); s = Math.sin(s * th) / sn; t = Math.sin(t * th) / sn; } else unit = true;
  }
  o.set(ax * s + bx * t, ay * s + by * t, az * s + bz * t, aw * s + bw * t);
  return unit ? o.normalize() : o;
}
export const slerpF = (a, ia, b, ib, f, o) => slerpRun(a, ia, b, ib, f, o, true);

// the turn of a rotation (rad), and between two the short way
export const angleOf = (q) => 2 * Math.atan2(Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z), Math.abs(q.w));
export function between(a, b) {
  const x = a.w * b.x - a.x * b.w - a.y * b.z + a.z * b.y, y = a.w * b.y + a.x * b.z - a.y * b.w - a.z * b.x, z = a.w * b.z - a.x * b.y + a.y * b.x - a.z * b.w;
  return 2 * Math.atan2(Math.sqrt(x * x + y * y + z * z), Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
}

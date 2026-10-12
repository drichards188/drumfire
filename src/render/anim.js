// Small timing helpers shared by the render modules. Everything here is a pure function of time.
export const TAU = Math.PI * 2;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, k) => a + (b - a) * k;
/** 0..1 across [a, b], linear. */
export const ramp = (t, a, b) => clamp01((t - a) / (b - a));
/** 0..1 across [a, b], eased in and out. */
export const smooth = (t, a, b) => {
  const k = ramp(t, a, b);
  return k * k * (3 - 2 * k);
};
export const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  return (a < 0 ? a + TAU : a) - Math.PI;
};
/** heading (rotation.y) that faces from (x, z) toward (tx, tz) */
export const facing = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
/** heading of a direction vector */
export const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

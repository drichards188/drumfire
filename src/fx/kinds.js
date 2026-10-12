import { mulberry32 } from '../noise.js';

// kinds (smoke system)
export const SMOKE = { FLAK: 0, PUFF: 1, TRAIL: 2, BLACK: 3, CORDITE: 4, SPRAY: 5, MIST: 6, HAZE: 7, HANG: 8 };
// kinds (glow system)
export const FLAME = 0, FLASH = 1, SPARK = 2;

// Effects are render-only, so they may use Math.random; the sandbox seeds them for repeatable captures.
let rng = Math.random;
export const rand = () => rng();
export const seedFx = (s) => { rng = s == null ? Math.random : mulberry32(s); };
export const rr = (a, b) => a + (b - a) * rng();
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** A uniformly random unit vector into o (seedable, unlike THREE's randomDirection). */
export function rdir(o) {
  const z = rng() * 2 - 1, a = rng() * 6.283185, r = Math.sqrt(1 - z * z);
  return o.set(r * Math.cos(a), z, r * Math.sin(a));
}

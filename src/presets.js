// Shared between the main game (main.js) and the Dicke Bertha mode (bertha/index.js): the quality presets,
// the sun of the game day and the camera trauma of a blast.

export const QUALITY = {
  Low: { pixelRatio: 0.75, shadowMap: 2048, shadowExtent: 120, ao: false, raySamples: 16, dofSamples: 16, fx: 0.5, maxSmoke: 3500 },
  Medium: { pixelRatio: 1, shadowMap: 2048, shadowExtent: 150, ao: true, raySamples: 32, dofSamples: 32, fx: 0.75, maxSmoke: 5500 },
  High: { pixelRatio: 1.5, shadowMap: 4096, shadowExtent: 180, ao: true, raySamples: 48, dofSamples: 48, fx: 1, maxSmoke: 7000 },
  Ultra: { pixelRatio: 2, shadowMap: 4096, shadowExtent: 220, ao: true, raySamples: 64, dofSamples: 64, fx: 1.25, maxSmoke: 9000 },
};

// Camera trauma from a blast of `calibre` inches at `d` metres: a 15-inch beside the camera
// is full trauma, a 60-pounder a nudge, and everything falls away with the square of the distance.
export const blastTrauma = (calibre, d, k = 1) => {
  const r0 = 25 + 6 * calibre;
  return Math.min(1, ((calibre / 15) ** 1.2 * 1.15 * k) / (1 + (d / r0) ** 2));
};

// Time of day from the game clock (hours; 5.25 = 05:15). A game day, not an almanac: the sim's clock
// starts at 04:45 for stand-to, so the sun rises early (~05:05) and the battle opens in the first light
// instead of the dark; it sets at ~19:00, 26 degrees at noon. Returns elevation (degrees) and bearing.
export const SUN = { rise: 5.1, set: 19.0, noon: 26, midnight: 38 };
export function sunAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const day = SUN.set - SUN.rise;
  if (h >= SUN.rise && h <= SUN.set) {
    const u = (h - SUN.rise) / day;
    return { elevation: SUN.noon * Math.sin(Math.PI * u), bearing: 105 + 150 * u };
  }
  const v = (((h - SUN.set + 24) % 24) / (24 - day));
  return { elevation: -SUN.midnight * Math.sin(Math.PI * v), bearing: (255 + 210 * v) % 360 };
}

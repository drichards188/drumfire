// Part positions (site frame: metres, front -Z toward the enemy at the site's bearing, +X its right, y over the site's
// ground) of the WW1 German mode's British targets: the British game's own five units in their gun pits, the 18-pounder
// battery, the kite balloon and the ammunition dump (DESIGN.md "WW1 German mode"). Node-safe: the sim places target
// parts with it (models/t/layout.js partLayout) and british.js builds the models at the same points. null for a kind
// it does not own.
//
// The British guns (bgun15 bgun92 bgun6 bgun60 bgunrail) are the pieces of sector.js UNITS where the world already digs
// their pits: a site of one of these kinds must stand at its unit's `pos` with bearing `zero` (britishGunSite(kind)),
// and its parts are then the pieces' placements seen from there.
import { UNITS, piecePlacements } from '../../../sector.js';

export const BGUN_UNIT = { bgun15: 1, bgun92: 2, bgun6: 3, bgun60: 4, bgunrail: 5 };

/** Where a British gun site must stand so its parts sit in the world's pits: { pos: { x, z }, bearing, unit }. */
export function britishGunSite(kind) {
  const u = UNITS.find((q) => q.id === BGUN_UNIT[kind]);
  return u ? { pos: { x: u.pos.x, z: u.pos.z }, bearing: u.zero, unit: u } : null;
}

// a world offset (dx, dz) from the site seen in the site's frame at bearing b (the inverse of sim/targets.js make())
const local = (dx, dz, b) => ({ x: dx * Math.cos(b) + dz * Math.sin(b), z: -dx * Math.sin(b) + dz * Math.cos(b), y: 0 });

export function layoutBritish(kind, { alt = 800 } = {}) {
  if (BGUN_UNIT[kind]) {
    const { unit: u } = britishGunSite(kind);
    return piecePlacements(u).map((p) => local(p.x - u.pos.x, p.z - u.pos.z, u.zero));
  }
  switch (kind) {
    case 'bfield': // four 18-pounders in hasty pits along the battery front
      return [{ x: -30, z: -4, y: 0 }, { x: -10, z: 4, y: 0 }, { x: 10, z: -3, y: 0 }, { x: 30, z: 5, y: 0 }];
    case 'bballoon': // the Caquot at `alt` over the site, its winch lorry down the cable (the balloon rides downwind)
      return [{ x: 0, z: 0, y: alt }, { x: -alt * 0.5, z: 0, y: 0 }];
    case 'bdump': // five stacks: 18-pr boxes, 6-inch shells, cartridge boxes, 9.2-inch shells, mixed stores
      return [{ x: -18, z: -10, y: 0 }, { x: 3, z: -17, y: 0 }, { x: 20, z: -3, y: 0 }, { x: -8, z: 9, y: 0 }, { x: 13, z: 17, y: 0 }];
    default:
      return null;
  }
}

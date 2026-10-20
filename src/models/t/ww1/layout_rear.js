// Part positions of the WW1 German mode's British tank laager and road convoy (DESIGN.md "WW1 German mode"), in the
// site's frame as layout.js (metres; local -Z is the way the site faces, +X its right; y over the site's ground).
// Node-safe (models/t/layout.js partLayout): the sim places its parts from here and rear.js builds the same
// positions. null for a kind it does not own. Counts match TARGETS_WW1 (btanks 4, bconvoy 4).
export function layoutRear(kind) {
  switch (kind) {
    case 'btanks': // four Mark IVs (male, female, male, female) parked in a wood's edge, noses out to the front
      return [{ x: -16, z: -4, y: 0 }, { x: -3, z: -9, y: 0 }, { x: 11, z: -5, y: 0 }, { x: 3, z: 12, y: 0 }];
    case 'bconvoy': // AEC Y-type lorry, GS wagon and its four-horse team, Thornycroft J lorry, GS wagon and pair
      // (moved along the road by the sim: each part faces -Z and the render layer turns it to its way of travel)
      return [{ x: -9, z: 5, y: 0 }, { x: 11, z: -7, y: 0 }, { x: 2, z: 12, y: 0 }, { x: -5, z: -12, y: 0 }];
    default:
      return null;
  }
}

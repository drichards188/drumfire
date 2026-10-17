// Part layouts of the WW2 mode's eastern targets (Sevastopol 1942, Brest-Litovsk 1941), in the site's local frame as
// layout.js (metres; local -Z is the way the site faces, +X its right; y over the site's ground). Pure data, Node-safe:
// the sim places its parts from here and the models (east.js, east_brest.js) build at the same positions.

// The citadel's ring barracks follow an arc of this radius (centre in the court, at +Z): the four stretches stand on it.
export const CITADEL_R = 266.7;
const arcZ = (x) => CITADEL_R - Math.sqrt(CITADEL_R * CITADEL_R - x * x) - (CITADEL_R - Math.sqrt(CITADEL_R * CITADEL_R - 400));

export function layoutEast(kind) {
  switch (kind) {
    case 'turret': // the two armoured twin 305 mm turrets on the battery block's roof (3.2 m up; y stays 0: the sim
      // reads a part's y > 0 as an absolute height, as for the balloon)
      return [{ x: -18, z: 0, y: 0 }, { x: 18, z: 0, y: 0 }];
    case 'fort': // three casemates along the salient's front: left face, apex, right face
      return [{ x: -25, z: 0, y: 0 }, { x: 0, z: -12, y: 0 }, { x: 25, z: 0, y: 0 }];
    case 'magazine': // the magazine in the rock behind the tunnel mouths at the cliff foot (one part)
      return [{ x: 0, z: 4, y: 0 }];
    case 'sbattery': // four 122 mm howitzers M-30 in their pits
      return [{ x: -27, z: -6, y: 0 }, { x: -9, z: 6, y: 0 }, { x: 9, z: -5, y: 0 }, { x: 27, z: 7, y: 0 }];
    case 'citadel': // four stretches of the ring barracks along the arc, about 40 m each
      return [-60, -20, 20, 60].map((x) => ({ x, z: Math.round(arcZ(x) * 100) / 100, y: 0 }));
    case 'gate': // the gate tower
      return [{ x: 0, z: 0, y: 0 }];
    case 'eastfort': // left flank of the rampart, the keep in the court, right flank
      return [{ x: -40, z: 0, y: 0 }, { x: 0, z: 0, y: 0 }, { x: 40, z: 0, y: 0 }];
    default:
      return null;
  }
}

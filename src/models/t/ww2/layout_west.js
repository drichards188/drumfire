// Part layouts of the WW2 mode's Allied targets (Flanders 1944) and the aircraft-free sites, in the site's local
// frame as layout.js (metres; local -Z is the way the site faces, +X its right; y over the site's ground).
// Pure data, Node-safe: the sim places its parts from here and the models build the same positions.
export function layoutWest(kind) {
  switch (kind) {
    case 'abattery': // four 25-pounders in a line of pits, each with its Quad tractor dug in behind
    case 'amedium': // four 5.5-inch mediums
      return [{ x: -30, z: -5, y: 0 }, { x: -10, z: 5, y: 0 }, { x: 10, z: -4, y: 0 }, { x: 30, z: 6, y: 0 }];
    case 'tanks': // a laager of five Shermans
      return [{ x: -22, z: -8, y: 0 }, { x: 0, z: -14, y: 0 }, { x: 22, z: -6, y: 0 }, { x: -12, z: 14, y: 0 }, { x: 14, z: 16, y: 0 }];
    case 'adump': // five stacks: shell boxes, jerrycans, cartridge boxes, shells, mixed stores
      return [{ x: -18, z: -10, y: 0 }, { x: 3, z: -17, y: 0 }, { x: 20, z: -3, y: 0 }, { x: -8, z: 9, y: 0 }, { x: 13, z: 17, y: 0 }];
    case 'aconvoy': // lorry, lorry, Sherman, carrier (moved along the road by the sim)
      return [{ x: -9, z: 5, y: 0 }, { x: 11, z: -7, y: 0 }, { x: 2, z: 12, y: 0 }, { x: -5, z: -12, y: 0 }];
    case 'aop': // two Austers and the tent beside the strip
      return [{ x: -20, z: 0, y: 0 }, { x: 15, z: 4, y: 0 }, { x: 0, z: 24, y: 0 }];
    default:
      return null;
  }
}

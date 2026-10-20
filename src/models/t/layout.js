// Where the destroyable parts of each target kind stand, in the site's local frame (metres, before
// the site's bearing turns it: local -Z is the way the site faces, local +X its right). Pure data,
// Node-safe, so the sim can place `parts: [{ x, z, hp }]` from it and the render layer's
// buildTarget (targets.js) builds the same positions. `alt` is the kite balloon's height.
// y is the height above the site's ground.

import { layoutWest } from './ww2/layout_west.js';
import { layoutEast } from './ww2/layout_east.js';
import { layoutBritish } from './ww1/layout_british.js';
import { layoutRear } from './ww1/layout_rear.js';

export function partLayout(kind, { alt = 900 } = {}) {
  const ww2 = layoutWest(kind) ?? layoutEast(kind);
  if (ww2) return ww2;
  const ww1 = layoutBritish(kind, { alt }) ?? layoutRear(kind);
  if (ww1) return ww1;
  switch (kind) {
    case 'battery': // four howitzers staggered along the battery front, each in its own pit
      return [{ x: -27, z: -6, y: 0 }, { x: -9, z: 6, y: 0 }, { x: 9, z: -5, y: 0 }, { x: 27, z: 7, y: 0 }];
    case 'mebu':
      return [{ x: 0, z: 0, y: 0 }];
    case 'dump': // five stacks: shells, shells, cartridge baskets, shells, mixed boxes
      return [{ x: -18, z: -10, y: 0 }, { x: 3, z: -17, y: 0 }, { x: 20, z: -3, y: 0 }, { x: -8, z: 9, y: 0 }, { x: 13, z: 17, y: 0 }];
    case 'balloon': // the Drachen over the site, its winch lorry down the cable
      return [{ x: 0, z: 0, y: alt }, { x: -alt * 0.5, z: 0, y: 0 }];
    case 'hq': // west wing, main block, east wing with the tower
      return [{ x: -15, z: 0, y: 0 }, { x: 0, z: 0, y: 0 }, { x: 15, z: 0, y: 0 }];
    case 'crossroads': // two wagons, a gun limber with its team, a lorry
      return [{ x: -9, z: 5, y: 0 }, { x: 11, z: -7, y: 0 }, { x: 2, z: 12, y: 0 }, { x: -5, z: -12, y: 0 }];
    case 'railyard': // loco, four ammunition wagons, two open wagons, water tower, goods shed
      return [
        { x: 0, z: -45, y: 0 }, { x: 0, z: -29.5, y: 0 }, { x: 0, z: -20.8, y: 0 }, { x: 0, z: -12.1, y: 0 }, { x: 0, z: -3.4, y: 0 },
        { x: 8, z: 24, y: 0 }, { x: 8, z: 32.7, y: 0 }, { x: -26, z: 40, y: 0 }, { x: 26, z: -22, y: 0 },
      ];
    default:
      return [];
  }
}

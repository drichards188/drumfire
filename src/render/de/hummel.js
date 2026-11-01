import { spPass } from './wespe.js';

// The Hummel's drill for render/crews.js (see render/crews_ww1.js for what this module may export). As the Wespe's
// (render/de/wespe.js): a light gun's drill on the cycle clock inside an open compartment of a vehicle that turns as a
// whole, every man's place turning with it. Six men (GUNS.hummel.crew):
//   officer    the commander at the right front of the compartment (crews.js cmd)
//   layer      at the panoramic sight and the handwheels left of the gun (crews.js lay)
//   loader     right of the breech: steps up to the sliding block and works it, primes (crews.js breech)
//   shell      from the shells' bin at the right rear: carries each round to the breech and lays it in its mouth, where
//              it is pushed home (crews.js carry; no rammer staff in the compartment)
//   cartridge  from the cartridges' bin at the left rear: brings the brass case and puts it in (crews.js bag)
//   passer     on the ground behind: hands the next round up over the rear plate into the bin (render/de/wespe.js spPass)
export const ROLES = { officer: 'cmd', layer: 'lay', loader: 'breech', shell: 'carry', cartridge: 'bag', passer: 'spPass' };
export const LIGHT = true;
export const TIMED = true;
export const BAG_SIDE = -0.42; // the cartridge goes in from the left, the shell man comes up on the right
export const STAFF = 2.1;

export function act(crew, m, c, h) {
  if (m.beh === 'spPass') { spPass(crew, m, c, h); return true; }
  return false;
}

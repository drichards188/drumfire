import { rampDrill } from '../ramp_drill.js';

// The 15 cm sFH 93's drill for render/crews.js (see render/crews_ww1.js for what this module may export). Eight men
// [E], the sFH 13's light-gun drill: the barrel drops to its loading elevation while the loader opens the block, one
// man brings the 42 kg shell up the right of the trail and lays it in, the rammer seats it, the cartridge man brings
// the bag and the loader closes the block; the layer at the sight and the second layer ('elevator') at the elevating
// handwheel, the lanyard man fires from the right. No recoil system (en.wikipedia "15 cm sFH 93": "in the field, only
// ramps were used"; the gun came back by gravity and was re-laid after every shot): render/ramp_drill.js runs it up
// the ramps and back, and in the 'relay' step the two layers lever it round with the handspikes.
export const ROLES = { officer: 'cmd', layer: 'lay', elevator: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan' };
export const LIGHT = true;
export const TIMED = true;
export const STAFF = 2.2;
export const BAG_SIDE = 0.32;

export const { mechanisms, act, props } = rampDrill({ spike: { layer: -1, elevator: 1 }, t: { up: 0.28, top: 0.48, down: 1.8, end: 2.4 }, off: 1.5 });

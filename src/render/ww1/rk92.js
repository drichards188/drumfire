import { rampDrill } from '../ramp_drill.js';

// The 15 cm Ringkanone C/92's drill for render/crews.js (see render/crews_ww1.js for what this module may export).
// Eight men [E], drilled as a light gun on the cycle clock like the K 17: the gun commander points, the layer works the
// sight and the elevating handwheel on the left, the loader opens and shuts the block, the rammer seats the shell with
// the staff, the shell (40 kg, in the arms) and the silk cartridge come up the right of the trail from the stack, and
// the lanyard man fires from the right. The gun has no recoil system (en.wikipedia "15 cm Ring Kanone C/92": wooden
// ramps behind the wheels, the wheels rolled up them and the gun was returned to position by gravity, levered back
// onto its line and re-aimed after every shot): render/ramp_drill.js runs it up the ramps and back, and in the
// 'relay' step the layer and the second layer ('elevator') lever it round with the handspikes.
export const ROLES = { officer: 'cmd', layer: 'lay', elevator: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan' };
export const LIGHT = true;
export const TIMED = true;
export const STAFF = 2.6; // the rammers stand clear of the trail's run back up the ramps
export const BAG_SIDE = 0.34;

export const { mechanisms, act, props } = rampDrill({ spike: { layer: -1, elevator: 1 }, t: { up: 0.3, top: 0.5, down: 1.9, end: 2.5 }, off: 1.4, walk: 0.26 });

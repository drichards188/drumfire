import { rampDrill } from '../ramp_drill.js';

// The 21 cm Mörser 99's drill (render/crews.js calls these hooks before its own; see render/crews_ww1.js). At the
// breech it is the Mörser 16's (the pair carries the shell to the tray, the rammers drive it home, the lanyard man
// works the wedge, the charge from the baskets); render/ramp_drill.js adds what the old mortar without a recoil system
// did (en.wikipedia "21 cm Mörser 99": the wheels ran up two wooden ramps and were returned to position by gravity;
// the gun had to be re-aimed after every shot, levered into position since it had no traversing gear): the run up
// the ramps and the roll back down, and in the 'relay' step the layer and the elevating number at the handspikes.
export const ROLES = { officer: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'pair0', loader2: 'pair1', rammer1: 'ram', rammer2: 'ram', ammo1: 'idle', ammo2: 'bag' };
export const STAFF = 3.5; // the rammers wait clear of the tail's run back, 3.7 m behind the breech
export const TIMED = true;
export const BLOCK_MAN = 'lanyard';
export const BAG_SIDE = -0.5; // the charge comes up the left of the tray (the shell's pair comes up the right)

export const { mechanisms, act, props } = rampDrill({ spike: { layer: -1, elevator: 1 } });

// The 15 cm K 16's drill for render/crews.js (see render/crews_ww1.js for what this module may export).
// Nine men, drilled as a light gun on the cycle clock like the K 17 (the same maker's drill, a bigger gun): the gun
// commander points from the left, the layer works the sight and the elevating and traversing handwheels on the left,
// the second layer the right elevating handwheel; the loader steps up and slides the block open and shut, the shell
// (51 kg, carried in the arms) comes up the right of the trail from the stack, the rammer seats it with the long staff
// (the chamber lies deep behind the tall breech ring) and the cased charge follows; the lanyard man fires from the
// right, the ammunition man readies the next round at the stack.
export const ROLES = { officer: 'cmd', layer: 'lay', elevator: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan', ammo: 'idle' };
export const LIGHT = true;
export const TIMED = true;
export const STAFF = 2.6;
export const BAG_SIDE = 0.34; // the cartridge man's place right of the bore (clear of the shell man walking back)

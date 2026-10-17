// Loading choreography roles of the super-heavy German pieces (render/crews.js merges these into its ROLES):
// role (the rig's crew spot) -> behaviour. The behaviours are crews.js's: cmd, lay, wheel, lan, guide0/1
// (steady the shell on the tray), ram (the rammer team), bag (carries the charges to the breech), winch,
// signal and sling (the crane men), plus the Gustav's lift men: liftL (the shell lift and the transfer
// trolley), liftR (the charge lift) and shove (roll the shell from the wagon into the lift's cage).
export const ROLES_HEAVY = {
  // 80 cm Gustav: the shell comes up the lift at the rear, crosses the platform and is laid on the tray; a
  // rammer team on the platform, the charges carried from the charge lift; the layer and the elevating
  // controller on the walkways beside the cradle
  gustav: {
    chief: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
    rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram', bagman: 'bag',
    lift1: 'liftL', lift2: 'liftR', ammoA: 'shove', ammoB: 'shove', phone: 'idle',
  },
  // 60 cm Karl-Gerät: the carrier's crane men lift the shell out of its hold onto the tray at the stern, two
  // loaders steady it, the rammer team on the stern platform; the cartridges come from the carrier's locker
  karl: {
    sergeant: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
    rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram',
    crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'bag',
  },
  // 42 cm Bertha: the stage's jib crane swings the shell from the cart onto the tray, two rammers, the bags
  // from the rack at the back of the stage, the two layers at their handwheels
  bertha: {
    sergeant: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
    rammer1: 'ram', rammer2: 'ram', kran: 'winch', cart: 'sling', bagman: 'bag',
  },
};

import { nbwRounds } from '../crews_de.js';
import { inCover } from '../crews_rocket.js';

// The 21 cm Nebelwerfer 42's crew (models/v/de/nbw42.js): the 15 cm launcher's drill (render/crews_de.js, the
// behaviours nbFirer, nbLayer, nbLoader, nbRocket), five tubes instead of six:
//   open    the loader opens the tubes' rear latches
//   shell   (34 s) the two rocket carriers bring the five 110 kg rockets one at a time from the crates, in turn;
//           the loader feeds each into its tube at the rear plate and drops the latch over it
//   prime   the loader clips on the igniter leads; the carriers and the ammunition man walk off to the slit trench
//   lay     the layer at the sight
//   cover   the layer and the loader run to the slit trench by the firer, all crouch through the ripple
// The sixth man (ammo) kneels at the opened crate by the stack, taking off the transport caps and checking the
// igniters of the next rockets while the others load, and goes to cover with the carriers.
export const ROLES = { firer: 'nbFirer', layer: 'nbLayer', loader: 'nbLoader', rocket0: 'nbRocket', rocket1: 'nbRocket', ammo: 'nbAmmo' };
export const LIGHT = true;
export const WORLD = new Set(['firer', 'rocket0', 'rocket1', 'ammo']);
export const STAFF = 1.2;

const _home = { x: 0, z: 0 };

export function act(crew, m, c) {
  if (m.beh !== 'nbAmmo') return false;
  m.noEars = true;
  m.world = true; // (also when the crew was built as another kind's: the stack does not turn with the launcher)
  _home.x = m.spot.x; _home.z = m.spot.z;
  const cover = crew.rig.anchors.cover;
  if (inCover(crew, m, c, cover?.[5] ?? cover?.[cover.length - 1], _home, m.spot.heading, null, true)) return true;
  m.put(_home.x, 0, _home.z, m.spot.heading, 'crouch', crew.idleT + m.seed);
  // working along the rocket in the opened crate in front of him (models/v/de/nbw42.js: 0.75 m ahead, its top 0.2 m up)
  if (c.s === 'shell' || c.s === 'open') {
    const fx = -Math.sin(m.h), fz = -Math.cos(m.h), rx = Math.cos(m.h), rz = -Math.sin(m.h), u = c.now * 0.35 + m.seed;
    const along = 0.35 * Math.sin(u * 2.1), w = 0.6 + 0.4 * Math.sin(u * 3.7);
    m.hand('R', _home.x + fx * 0.72 + rx * (along + 0.1), 0.24, _home.z + fz * 0.72 + rz * (along + 0.1), w);
    m.hand('L', _home.x + fx * 0.72 + rx * (along - 0.14), 0.24, _home.z + fz * 0.72 + rz * (along - 0.14), w);
  }
  return true;
}

// The rockets in the tubes follow the drill, as nbw41's (crews_de.js DE_PROPS; this one is used until that table
// lists nbw42 too); no rammer staff, cartridge or lanyard.
export function props(crew, c) {
  for (const o of [crew.staff, crew.bag, crew.rope]) o.visible = false;
  crew.rig.setRounds?.(nbwRounds(c.p, 0, c.s === 'shell' ? c.k : null));
  return true;
}

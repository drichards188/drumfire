// Loading choreography of the WW1 German mode's pieces (DESIGN.md "WW1 German mode"): render/crews.js merges these
// into its tables and calls the hooks before its own drill. One module per kind in render/ww1/ (each owned by the
// agent who builds that gun) may export:
//   ROLES     { role: behaviour } for the rig's crew spots (behaviours are crews.js's: cmd, lay, wheel, lan, breech,
//             ram, carry, bag, pair0/1, guide0/1, winch, signal, sling, idle, ... and the heavy ones of crews_heavy.js)
//   LIGHT     true: drilled as a light gun (the shell and cartridge men turn with the traverse, the loader works the block)
//   WORLD     a Set of roles that stay in the world frame (do not turn with the traverse)
//   STAFF     the rammer staff's length in metres
//   state(crew, c), mechanisms(crew, c), act(crew, man, c, h), props(crew, c)
//             optional hooks, called like crews_heavy.js's (return true when the kind's own drill handled the step)
import * as sfh13 from './ww1/sfh13.js';
import * as m16 from './ww1/m16.js';
import * as k17 from './ww1/k17.js';
import * as max38 from './ww1/max38.js';
import * as gamma from './ww1/gamma.js';
import * as paris from './ww1/paris.js';

const MODS = { sfh13, m16, k17, max38, gamma, paris };
const each = (f) => Object.fromEntries(Object.entries(MODS).map(([k, m]) => [k, f(m)]).filter(([, v]) => v != null));

export const ROLES_WW1 = each((m) => m.ROLES);
export const LIGHT_WW1 = new Set(Object.keys(each((m) => (m.LIGHT ? true : null))));
export const WORLD_WW1 = each((m) => m.WORLD);
export const STAFF_WW1 = each((m) => m.STAFF);

// Bertha's kind is shared with the WW2 mode (where its crew wears 1944 dress); main sets CREW_ERA.ww1 on a WW1 page
// so every German crew there wears the 1917 dress of crew.js ('german', 'german-cap', 'german-drill').
export const CREW_ERA = { ww1: false };
export function crewForRoleWW1(role, i = 0) {
  const skin = [0, 1, 2, 0, 3, 1][i % 6];
  if (/officer|sergeant|chief|cmd/.test(role)) return { outfit: 'german-cap', skin };
  return { outfit: i % 4 === 2 ? 'german-drill' : 'german', skin };
}

const hook = (name) => (crew, ...a) => MODS[crew.kind]?.[name]?.(crew, ...a) ?? false;
export const ww1State = hook('state');
export const ww1Mechanisms = hook('mechanisms');
export const ww1Act = hook('act');
export const ww1Props = hook('props');

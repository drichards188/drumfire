// Dormant since 2026-11-26: the 28 cm Kurze Bruno K (E) was cut from the German tree at the user's word (DESIGN.md changelog);
// kept here unreachable (no tree, battle or menu fields it). Commit 1dd259b has it whole and in play: restore from it.
// The 28 cm Kurze Bruno K (E)'s loading drill (render/crews_ww1.js picks this module up by its kind): the shared railway
// gun drill of render/rail_drill_de.js on the places the model gives (models/v/de/bruno.js BRUNO, as rig.rail).
export { ROLES, state, mechanisms, act, props } from '../rail_drill_de.js';
export const STAFF = 5.0;

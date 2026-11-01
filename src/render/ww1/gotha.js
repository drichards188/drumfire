// The Gotha G.V's ground crew for render/crews.js (see render/crews_ww1.js for what this module may export): the bomber
// is off-map support with no loading drill (GUNS.gotha.load is empty), so its three aircrew and four mechanics stand
// at their places round the parked aircraft (models/v/de/gotha.js).
export const ROLES = { officer: 'idle', pilot: 'idle', gunner: 'idle', mech1: 'idle', mech2: 'idle', mech3: 'idle', mech4: 'idle' };
export const WORLD = new Set(['officer', 'pilot', 'gunner', 'mech1', 'mech2', 'mech3', 'mech4']); // (they do not turn with the nose gunner's ring)

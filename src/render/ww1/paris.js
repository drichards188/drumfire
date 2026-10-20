// The Paris Gun's drill for render/crews.js (see render/crews_ww1.js for what this module may export). A naval
// detachment served it (the men wear the 1917 German dress crews_ww1.js gives every WW1 kind). The generic heavy
// drill fits the rig (models/v/de/paris.js): the gun comes down to 0 degrees, the block slides out to the right, a
// small slewing crane on the frame's right rear corner lifts the 106 kg shell off its cart on the ground and lowers
// it onto the tray (crane1 at the winch on the gallery, crane2 signalling from the ground, ammo1 slinging it at the
// cart), two loaders steady it, two rammers drive it home with a short staff, the bagman brings the brass case and
// its bags from the rack at the platform's rear. Nobody is a world-frame role: the frame turns on its turntable
// and every man, the cart and the crane go with it.
export const ROLES = {
  chief: 'cmd', layer: 'lay', elevator: 'wheel', traverser: 'wheel', lanyard: 'lan',
  loader1: 'guide0', loader2: 'guide1', rammer1: 'ram', rammer2: 'ram', bagman: 'bag',
  crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'idle', meter: 'idle', phone: 'idle',
};
export const STAFF = 2.6;

// The frame not yet on its bed (rig.assembly < 1, the Stellungsbau: src/ww1/render.js poseParisSetup): no galleries
// to stand on, so the men work on the ground on the gun's left, between the frame's run-in and the portal crane's rail
// (the Gustav's rule, render/crews_heavy.js). Root frame, which does not turn with the traverse.
export function act(crew, m, c) {
  if ((crew.rig.assembly ?? 1) >= 1) return false;
  const i = crew.men.indexOf(m), busy = i % 3 !== 1;
  m.put(-4.6 - 1.3 * (i & 1), 0, -6 + (i >> 1) * 2.6 + 1.3 * (i & 1), -Math.PI / 2, // facing the gun
    busy ? 'operate' : 'stand', busy ? c.now * 1.1 + m.seed : crew.idleT + m.seed);
  return true;
}

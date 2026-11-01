import { smooth, headingOf } from '../anim.js';

// The 35.5 cm Haubitze M1's drill for render/crews.js (see render/crews_ww1.js for what this module may export). A
// crane-loaded heavy, drilled like the British 15-inch by crews.js's own behaviours: the barrel comes down to zero, the
// block is run open and the tray hooked on, the crane on the loading platform lifts the 575 kg shell off the trolley
// beside the carriage and swings it onto the tray (crews.js mechanisms: the jib and the hook from the rig's crane
// contract), the two loaders steady it as it comes down, the four rammers drive it home with the long staff, the
// charge man brings the charges from the rack at the platform's rear, the block is shut and the tray lifted off. The
// layer and the traverser on their galleries either side of the top carriage, the man at the firing lever on the
// right gallery, the Geschützführer off the left. The crane men (crews.js only stands them at their posts) are acted
// here: the winch man hauls while the hook moves, the signaller on the ground gives the hand signals while the shell is
// in the air, and the sling man at the trolley stoops to hook the slings on and steadies the shell as it lifts off.
export const ROLES = {
  sergeant: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
  rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram', crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'bag',
};
export const STAFF = 3.4; // the rammer staff (m): the shell is 1.45 m long and the rammers stand on the platform behind

const win = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));

export function act(crew, m, c, h) {
  const s = c.s, k = c.k;
  if (m.beh === 'winch') {
    // hauling through the crane's whole run (crews.js mechanisms: down 0-0.15, the lift 0.27-0.42, the slew, down onto
    // the tray 0.74-0.95; back up and round in the ram's first half)
    const on = (s === 'shell' && (k < 0.15 || (k > 0.27 && k < 0.42) || (k > 0.74 && k < 0.97))) || (s === 'ram' && k < 0.6);
    m.put(h.x, h.y, h.z, h.h, on ? 'operate' : 'stand', on ? c.now * 1.3 : crew.idleT + m.seed);
    return true;
  }
  if (m.beh === 'signal') {
    const on = s === 'shell' && k > 0.1 && k < 0.97;
    // he turns to watch the load: at the trolley while it is slung, then the tray
    const pk = crew.pick, tx = k < 0.45 ? pk.x : crew.T.x, tz = k < 0.45 ? pk.z : crew.T.z;
    const face = on ? headingOf(tx - h.x, tz - h.z) : h.h;
    m.put(h.x, h.y, h.z, face, on ? 'signal' : 'stand', on ? 0.12 + c.now * 0.6 : crew.idleT + m.seed);
    return true;
  }
  if (m.beh === 'sling') {
    // at the trolley: steps in and stoops to sling the shell while the hook is down, steadies it as it lifts off,
    // then stands back
    const pk = crew.pick;
    const w = s === 'shell' ? win(k, 0.08, 0.16, 0.36, 0.44) : 0;
    const hx = h.x + (pk.x - h.x) * 0.45 * w, hz = h.z + (pk.z - h.z) * 0.45 * w;
    const face = w > 0.01 ? headingOf(pk.x - hx, pk.z - hz) : h.h;
    m.put(hx, h.y, hz, face, w > 0.5 && k < 0.27 ? 'crouch' : 'stand', crew.idleT + m.seed);
    if (w > 0.01) {
      const lift = s === 'shell' && k > 0.27 ? (crew.craneY ?? 0) - crew.lowHoist : 0;
      const y = pk.y + crew.srad + Math.max(0, lift);
      m.hand('R', pk.x + crew.rt.x * 0.0, y, pk.z - 0.3, w);
      m.hand('L', pk.x, y, pk.z + 0.3, w);
    }
    return true;
  }
  return false;
}

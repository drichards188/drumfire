// The weapons off the map in flight (src/sim/support.js): render/shells.js draws each as a shell of its kind (the V-1,
// the A4, the Paris shell), nose along its velocity; here the V-1's pulse-jet flame and smoke while its motor runs
// (fx.trail 'v1', as src/ww2/render.js does over the launch site). The V-2 falls burnt out and the Paris shell
// unpowered, so they draw no trail: they are seen only as they come down.
const _tw = { x: 0, y: 0, z: 0 };
export function supportTrails(fx, sim, dt) {
  if (!(dt > 0) || !fx?.trail) return;
  for (const sh of sim.shells) {
    if (!sh.alive || !sh.support || sh.kind !== 'v1' || sh.engineOff) continue;
    // the flame comes out of the tail pipe: 4.2 m behind the middle and 0.7 m up
    const sp = Math.hypot(sh.vel.x, sh.vel.y, sh.vel.z) || 1;
    _tw.x = sh.pos.x - (sh.vel.x / sp) * 4.2;
    _tw.y = sh.pos.y - (sh.vel.y / sp) * 4.2 + 0.72;
    _tw.z = sh.pos.z - (sh.vel.z / sp) * 4.2;
    fx.trail(_tw, sh.vel, 'v1', dt);
  }
}

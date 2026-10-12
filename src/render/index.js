import { Infantry } from '../models/infantry.js';
import { GunViews } from './guns.js';
import { ShellViews } from './shells.js';
import { TargetViews } from './targets.js';

// The render layer: gun rigs posed from the sim with their loading crews, shells in flight, German
// targets, the infantry. main.js calls createRender(...) once, update() every frame, reset(sim) on a new
// game and forwards the event hooks (see DESIGN.md "Render layer"). Nothing here allocates per frame.
//
//   const render = createRender({ scene, sim, terrain, fx, rigs, camera? });
//   render.update(dt, rawDt, sim, fx, camera?)   // dt is time-compressed, rawDt is real time
//   render.reset(sim)                            // after sim.newGame
//   render.hooks.fire(unit, piece, shell)        // sim.events.fire: stamps nothing (recoil follows piece.firedAt)
//   render.onFire(unit, piece)                   // -> { x, y, z, dx, dy, dz, calibre } muzzle record (shared, copy it)
//   render.onEnemyFire(srcId, part, shell)       // -> the same record for a German battery gun (also recoils it)
//   render.onBurst(pos, info)                    // infantry near a burst are thrown
//   render.eye(unitId, out)                      // Vector3: a point to aim the camera at for the unit's first piece
//   render.newestShell(unitId)                   // sim shell for the F key
//   render.select(unitId)                        // the unit with the full-detail crews
export function createRender({ scene, sim, terrain, fx, rigs, camera = null, onlyRigs = false }) {
  const guns = new GunViews(scene, sim, terrain, rigs ?? new Map(), fx, onlyRigs);
  const shells = new ShellViews(scene);
  const targets = new TargetViews(scene, sim, terrain, fx);
  let inf = null;
  try {
    inf = new Infantry(scene, { max: 1500 });
  } catch (e) {
    console.warn('Infantry failed:', e.message);
  }
  guns.camera = camera;

  const render = {
    guns, shells, targets, inf, camera,
    update(dt, rawDt, s = sim, f = fx, cam = render.camera) {
      render.camera = cam;
      guns.camera = cam;
      guns.update(dt, rawDt, s);
      shells.update(s, cam);
      targets.update(rawDt, s, cam);
      inf?.update(dt, s.infantry, terrain.heightAt, cam);
    },
    reset(s = sim) {
      guns.reset(s);
      targets.reset(s);
      inf?.reset();
    },
    select(unitId) {
      guns.selected = unitId;
    },
    onFire: (unit, piece) => guns.fired(unit, piece),
    onEnemyFire: (src, part, shell) => targets.onEnemyFire(src, part, shell),
    onBurst(pos, info = {}) {
      const cal = info.calibre ?? 6;
      inf?.blast(pos.x, pos.z, 8 + cal * 3.2);
    },
    eye(unitId, out) {
      const v = guns.views.find((q) => q.unit.id === unitId);
      if (!v) return null;
      return v.rig.root.getWorldPosition(out).setY(v.rig.root.position.y + 2.5);
    },
    newestShell: (unitId) => shells.newest(sim, unitId),
    hooks: {},
  };
  render.hooks.shellBurst = (shell, pos, info) => render.onBurst(pos, info);
  return render;
}

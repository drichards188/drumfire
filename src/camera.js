import * as THREE from 'three';

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const ease = (t) => t * t * (3 - 2 * t);
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Third-person orbit camera. It circles a focus point (the selected unit's eye anchor): left-drag
 * orbits, the wheel zooms between 6 and 250 m, changing the target glides over 0.8 s and swings the
 * view behind the new vehicle, and the camera never goes under the ground. padlock(point) swings the
 * view to sit behind the vehicle looking toward a world point (a track); null releases it.
 * free(true) detaches from the unit for a free orbit (wheel out to 3 km, WASD moves the focus).
 * follow(obj) chases a flying object ({ pos, vel, alive }) from behind and above; when it ends the view
 * holds on the last point for a moment (the burst), then calls onEnd. follow(null) releases.
 * cine(true) is the title screen's slow drifting orbit (distance and pitch breathe).
 * shake(trauma) adds camera trauma 0..1 (amplitude is trauma squared, it decays ~1.2/s), the maxgfx
 * gunner model. followShell(shell, { onBurst }) rides a sim shell { pos, prev, vel, alive } from
 * behind and above, looking along its velocity (drag to orbit round it); when it dies the view cuts to
 * a wide tripod shot of the burst for a few seconds (watch), then calls onBurst and goes back to the
 * unit. update(dt, alpha) takes the sim's render interpolation alpha.
 */
export class ChaseCamera {
  constructor(camera, dom, { ground = () => 0 } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.ground = ground;
    this.target = null;
    this.focus = new THREE.Vector3(0, 10, 0);
    this.from = new THREE.Vector3();
    this.t = 1; // glide progress 0..1
    this.yaw = 0; // camera azimuth around the focus: the camera sits at focus + (sin yaw, ., cos yaw) * d
    this.pitch = 0.2;
    this.dist = 28;
    this.goalYaw = 0;
    this.goalPitch = 0.2;
    this.goalDist = 28;
    this.minDist = 6;
    this.maxDist = 250;
    this.pad = null;
    this.padYaw = 0;
    this.dragging = false;
    this.freeMode = false;
    this.autoOrbit = 0; // rad/s, for the title screen
    this.lookAt = new THREE.Vector3();
    this.keys = new Set();
    this.height = 3.2; // look this far above the target origin when no anchor is given
    this.enabled = true;
    this.fol = null; // the chased flyer
    this.folHold = 0;
    this.folEnd = null;
    this.folLast = new THREE.Vector3();
    this.folDir = new THREE.Vector3(0, 0, -1);
    this.cineOn = false;
    this.cineT = 0;
    this.trauma = 0;
    this.shakeT = 0;
    this.shakeOn = true;
    this.shell = null; // the shell being ridden { obj, onBurst, yaw, pitch, last, dir, dead }
    this.tripod = null; // a fixed shot { point, from, t, seconds, onEnd }
    this.dragT = 0; // seconds since the pointer last dragged (the shell ride lets the player's orbit stand)

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.dragging = true;
      this.lx = e.clientX;
      this.ly = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lx, dy = e.clientY - this.ly;
      this.lx = e.clientX;
      this.ly = e.clientY;
      if (this.shell) {
        this.shell.yaw -= dx * 0.0055;
        this.shell.pitch = THREE.MathUtils.clamp(this.shell.pitch + dy * 0.0042, -0.6, 1.4);
        this.dragT = 0;
        return;
      }
      this.goalYaw -= dx * 0.0055;
      this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + dy * 0.0042, -0.12, 1.45);
      this.yaw = this.goalYaw; // direct: dragging should not lag
      this.pitch = this.goalPitch;
      this.autoOrbit = 0;
    });
    const up = (e) => {
      this.dragging = false;
      dom.releasePointerCapture?.(e.pointerId);
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.goalDist = THREE.MathUtils.clamp(this.goalDist * Math.exp(e.deltaY * 0.0012), this.minDist, this.maxDist);
      },
      { passive: false }
    );
    addEventListener('keydown', (e) => {
      if (this.freeMode && !e.ctrlKey && !e.metaKey) this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** Orbit this Object3D (its world position is the focus). Glides over 0.8 s and swings behind it. */
  setTarget(obj, { behind = true } = {}) {
    this.fol = null;
    this.folEnd = null;
    this.minDist = 6;
    this.freeMode = false;
    this.maxDist = 250;
    this.goalDist = Math.min(this.goalDist, 250);
    this.shell = this.tripod = null;
    this.from.copy(this.focus);
    this.t = 0;
    this.target = obj;
    this.pad = null;
    if (behind && obj) {
      obj.getWorldQuaternion(_q);
      _f.set(0, 0, -1).applyQuaternion(_q); // the vehicle's front
      // the camera sits opposite the front
      this.goalYaw = this.yaw + wrap(Math.atan2(-_f.x, -_f.z) - this.yaw);
      this.goalPitch = 0.2;
    }
  }

  /** Swing the view so the unit is between the camera and a world point; null releases. */
  padlock(point) {
    this.pad = point ? (this.pad || new THREE.Vector3()).copy(point) : null;
  }

  /** Chase a flyer ({ pos, vel, alive }); onEnd runs once it has been gone for a moment. */
  follow(obj, onEnd = null) {
    this.shell = this.tripod = null;
    this.fol = obj;
    this.folEnd = onEnd;
    this.folHold = 0;
    if (!obj) return;
    this.freeMode = false;
    this.pad = null;
    this.minDist = 5;
    this.maxDist = 250;
    this.folLast.copy(obj.pos);
    this.folDir.copy(obj.vel).normalize();
    this.from.copy(this.focus);
    this.t = 0;
    this.goalDist = 26;
    this.goalPitch = 0.16;
  }

  /** Title screen drift: orbit with a breathing distance and pitch. */
  cine(on) {
    this.cineOn = on;
    if (on) this.cineT = 0;
  }

  /** Free orbit around the current focus (detached from the unit). */
  free(on) {
    if (on) this.follow(null);
    if (on === this.freeMode) return;
    this.freeMode = on;
    this.pad = null;
    this.maxDist = on ? 3000 : 250;
    if (!on) this.goalDist = Math.min(this.goalDist, 250);
  }

  /** Add camera trauma 0..1 (a blast): the shake is trauma squared, so small hits barely show. */
  shake(trauma) {
    this.trauma = Math.min(1, this.trauma + trauma);
  }

  /**
   * Ride a sim shell { pos, prev, vel, alive } from behind and above, looking along its velocity.
   * Dragging orbits round it. When `alive` drops: a wide tripod shot of the burst (watch), then
   * onBurst(point) and back to the unit. followShell(null) releases at once.
   */
  followShell(shell, { onBurst = null } = {}) {
    this.fol = null;
    this.folEnd = null;
    this.tripod = null;
    if (!shell) {
      this.shell = null;
      return;
    }
    this.freeMode = false;
    this.pad = null;
    this.minDist = 6;
    this.maxDist = 250;
    this.goalDist = 38;
    const last = new THREE.Vector3(shell.pos.x, shell.pos.y, shell.pos.z);
    const dir = new THREE.Vector3(shell.vel.x, shell.vel.y, shell.vel.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.5, -1);
    this.shell = { obj: shell, onBurst, yaw: 0, pitch: 0.28, last, dir: dir.normalize(), t: 0, dead: 0 };
    this.focus.copy(last);
    this.t = 1;
  }

  /**
   * A fixed (tripod) shot: the camera stands at `from` (default: 220 m short of the point, on the side
   * it came from, a little above the ground) and looks at `point` for `seconds`, then onEnd and back to
   * the unit. A hard cut, like a film camera set up on the ground.
   */
  watch(point, from = null, seconds = 4, onEnd = null) {
    this.fol = null;
    this.folEnd = null;
    this.shell = null;
    const p = new THREE.Vector3(point.x, point.y ?? this.ground(point.x, point.z), point.z);
    const f = new THREE.Vector3();
    if (from) f.set(from.x, from.y ?? 0, from.z);
    else {
      const dx = this.camera.position.x - p.x, dz = this.camera.position.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      // from the side the shell came from, offset a little to one side so the geyser is not end-on
      f.set(p.x + (dx / d) * 220 + (-dz / d) * 70, 0, p.z + (dz / d) * 220 + (dx / d) * 70);
      f.y = this.ground(f.x, f.z) + 14;
    }
    this.tripod = { point: p, from: f, t: 0, seconds, onEnd, look: p.clone().add(new THREE.Vector3(0, 25, 0)) };
    this.camera.position.copy(f);
    this.camera.lookAt(this.tripod.look);
  }

  /** Leave a shell ride or tripod shot at once and go back to orbiting the unit. */
  releaseShot() {
    this.shell = this.tripod = null;
    this.backToTarget();
  }

  get mode() {
    return this.tripod ? 'tripod' : this.shell ? 'shell' : this.fol ? 'follow' : this.freeMode ? 'free' : 'unit';
  }

  backToTarget() {
    if (this.target && !this.freeMode) {
      this.target.getWorldPosition(this.focus);
      this.t = 1;
    }
    this.minDist = 6;
    this.goalDist = Math.min(Math.max(this.goalDist, 12), 90);
    this.dist = this.goalDist;
  }

  update(dt, alpha = 1) {
    this.trauma = Math.max(0, this.trauma - dt * 1.2);
    this.shakeT += dt;
    if (this.tripod) this.updateTripod(dt);
    else if (this.shell) this.updateShell(dt, alpha);
    else this.updateOrbit(dt);
    this.applyShake();
    this.camera.updateMatrixWorld();
  }

  updateTripod(dt) {
    const T = this.tripod;
    T.t += dt;
    const cam = this.camera;
    cam.position.copy(T.from);
    const g = this.ground(cam.position.x, cam.position.z) + 2;
    if (cam.position.y < g) cam.position.y = g;
    // a slow push toward the burst and a look that settles on the rising column
    cam.position.lerp(T.point, Math.min(0.06, T.t * 0.012));
    this.lookAt.copy(T.point);
    this.lookAt.y += 20 + Math.min(60, T.t * 14);
    cam.lookAt(this.lookAt);
    if (T.t >= T.seconds) {
      this.tripod = null;
      this.backToTarget();
      T.onEnd?.(T.point);
    }
  }

  updateShell(dt, alpha) {
    const S = this.shell, o = S.obj;
    S.t += dt;
    const k = 1 - Math.exp(-dt * 6);
    if (o.alive) {
      const a = THREE.MathUtils.clamp(alpha, 0, 1);
      S.last.set(o.prev.x + (o.pos.x - o.prev.x) * a, o.prev.y + (o.pos.y - o.prev.y) * a, o.prev.z + (o.pos.z - o.prev.z) * a);
      if (o.vel.x * o.vel.x + o.vel.y * o.vel.y + o.vel.z * o.vel.z > 1) _f.set(o.vel.x, o.vel.y, o.vel.z).normalize();
      else _f.copy(S.dir);
      S.dir.lerp(_f, k).normalize();
    } else S.dead += dt;
    this.dragT += dt;
    this.focus.copy(S.last);
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 9));
    // the camera sits behind the flight path, raised by the pitch and swung by the player's orbit
    const dir = S.dir;
    const baseYaw = Math.atan2(-dir.x, -dir.z); // behind, in the camera-orbit convention
    const horiz = Math.hypot(dir.x, dir.z);
    const baseElev = Math.atan2(-dir.y, Math.max(horiz, 1e-3)); // elevation of the point behind the shell
    const yaw = baseYaw + S.yaw;
    const el = THREE.MathUtils.clamp(baseElev + S.pitch, 0.1, 1.5);
    const cp = Math.cos(el);
    const cam = this.camera.position;
    cam.set(this.focus.x + Math.sin(yaw) * cp * this.dist, this.focus.y + Math.sin(el) * this.dist, this.focus.z + Math.cos(yaw) * cp * this.dist);
    for (let i = 0; i < 3; i++) {
      const g = this.ground(cam.x + (this.focus.x - cam.x) * i * 0.12, cam.z + (this.focus.z - cam.z) * i * 0.12) + 2 + i * 0.4;
      if (cam.y < g) cam.y = g;
    }
    // look a little ahead along the path so the way it is going (and the ground it falls on) shows
    this.lookAt.copy(this.focus).addScaledVector(dir, this.dist * 0.45);
    this.camera.lookAt(this.lookAt);
    if (!o.alive && S.dead > 0.05) {
      const point = this.focus.clone();
      const cb = S.onBurst;
      this.shell = null;
      // the tripod stands on the gun side of the burst, off to one side
      const dx = -dir.x, dz = -dir.z, d = Math.hypot(dx, dz);
      let from = null;
      if (d > 0.2) {
        const ux = dx / d, uz = dz / d;
        from = { x: point.x + ux * 230 - uz * 90, z: point.z + uz * 230 + ux * 90 };
        from.y = this.ground(from.x, from.z) + 12;
      }
      this.watch(point, from, 4, cb);
    }
  }

  applyShake() {
    const s = this.trauma * this.trauma;
    if (s < 1e-4 || !this.shakeOn) return;
    const t = this.shakeT * 21;
    const n = (a) => Math.sin(t * a) * 0.6 + Math.sin(t * a * 2.13 + 1.7) * 0.4;
    _e.set(n(1.1) * 0.05 * s, n(0.9) * 0.05 * s, n(1.3) * 0.07 * s);
    _q.setFromEuler(_e);
    this.camera.quaternion.multiply(_q);
    this.camera.position.x += n(1.7) * 0.25 * s;
    this.camera.position.y += n(1.9) * 0.3 * s;
    this.camera.position.z += n(2.3) * 0.25 * s;
  }

  updateOrbit(dt) {
    const k = 1 - Math.exp(-dt * 7);
    if (this.fol) {
      const f = this.fol;
      if (f.alive) {
        this.folLast.copy(f.pos);
        if (f.vel.lengthSq() > 1) this.folDir.copy(f.vel).normalize();
      } else this.folHold += dt;
      if (this.t < 1) {
        this.t = Math.min(1, this.t + dt / 0.35);
        this.focus.lerpVectors(this.from, this.folLast, ease(this.t));
      } else this.focus.copy(this.folLast);
      if (!this.dragging && f.alive) {
        // sit behind and a little above, swinging with the flight path
        const h = Math.hypot(this.folDir.x, this.folDir.z);
        if (h > 0.2) this.goalYaw = this.yaw + wrap(Math.atan2(-this.folDir.x, -this.folDir.z) - this.yaw);
      }
      if (!f.alive && this.folHold > 2.4) {
        const cb = this.folEnd;
        this.fol = null;
        this.folEnd = null;
        this.minDist = 6;
        cb?.();
      }
    } else if (!this.freeMode && this.target) {
      this.target.getWorldPosition(_w);
      if (this.t < 1) {
        this.t = Math.min(1, this.t + dt / 0.8);
        this.focus.lerpVectors(this.from, _w, ease(this.t));
      } else this.focus.copy(_w);
    } else if (this.freeMode) {
      const sp = (this.keys.has('ShiftLeft') ? 6 : 1.4) * this.dist * dt;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (this.keys.has('KeyW')) this.focus.x += fx * sp, this.focus.z += fz * sp;
      if (this.keys.has('KeyS')) this.focus.x -= fx * sp, this.focus.z -= fz * sp;
      if (this.keys.has('KeyA')) this.focus.x += fz * sp, this.focus.z -= fx * sp;
      if (this.keys.has('KeyD')) this.focus.x -= fz * sp, this.focus.z += fx * sp;
      if (this.keys.has('KeyQ')) this.focus.y -= sp * 0.5;
      if (this.keys.has('KeyE')) this.focus.y += sp * 0.5;
    }

    if (this.pad && !this.freeMode && !this.dragging) {
      // sit behind the unit on the line from the point through the unit
      const dx = this.focus.x - this.pad.x, dz = this.focus.z - this.pad.z;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 1) {
        this.goalYaw = this.yaw + wrap(Math.atan2(dx, dz) - this.yaw);
        const elev = Math.atan2(this.pad.y - this.focus.y, horiz);
        this.goalPitch = THREE.MathUtils.clamp(0.16 + Math.max(0, elev) * 0.35, 0.1, 0.6);
      }
    }
    if (this.autoOrbit) this.goalYaw += this.autoOrbit * dt;
    if (this.cineOn && !this.dragging && !this.fol) {
      this.cineT += dt;
      this.goalYaw += 0.05 * dt;
      this.goalDist = 62 + 34 * Math.sin(this.cineT * 0.09);
      this.goalPitch = 0.2 + 0.13 * Math.sin(this.cineT * 0.13 + 1.3);
    }

    if (!this.dragging) {
      this.yaw += wrap(this.goalYaw - this.yaw) * k;
      this.pitch += (this.goalPitch - this.pitch) * k;
    }
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 9));

    const cp = Math.cos(this.pitch);
    const off = _w.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist);
    const cam = this.camera.position;
    cam.copy(this.focus).add(off);
    // stay above the ground, here and a little toward the focus (so a rise does not cut the view)
    for (let i = 0; i < 3; i++) {
      const gx = cam.x + (this.focus.x - cam.x) * i * 0.12, gz = cam.z + (this.focus.z - cam.z) * i * 0.12;
      const g = this.ground(gx, gz) + 1.8 + i * 0.4;
      if (cam.y < g) cam.y = g;
    }
    this.lookAt.copy(this.focus);
    if (this.fol) {
      // keep the nose in the lower half of the frame so what it is flying at shows
      _f.copy(this.folDir).multiplyScalar(this.dist * (this.fol.alive ? 0.4 : 0));
      this.lookAt.add(_f);
    } else if (this.pad && !this.freeMode) {
      // look a little toward the point so it stays in the frame
      _f.subVectors(this.pad, this.focus).normalize().multiplyScalar(Math.min(60, this.dist * 1.2));
      this.lookAt.add(_f);
    }
    this.camera.lookAt(this.lookAt);
  }
}

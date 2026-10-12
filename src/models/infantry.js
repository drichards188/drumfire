import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { buildSoldier } from './inf/build.js';
import { makeUniforms, makeMaterials } from './inf/pose.js';

/**
 * Infantry: the German storm troops and the British infantry as an instanced crowd.
 *
 *   const inf = new Infantry(scene, { max: 1500 });
 *   inf.update(dt, groups, heightAt, camera);   // groups = sim.infantry, camera optional but wanted
 *   inf.blast(x, z, radius);                    // a burst: men within radius are thrown or go to ground
 *
 * One InstancedBufferGeometry per side and detail level (4 draw calls, plus the shadow pass); the
 * pose is computed in the vertex shader (inf/pose.js) from 4 vec4s per man, so a frame is one
 * buffer fill and no skinning. Men closer than `lodDist` use the full model, the rest a lighter
 * one, and men outside the view frustum are skipped. The shader also enlarges men with distance so
 * a wave 1 to 3 km away still reads as a line of dark dots (`minPx`, about the on-screen height
 * floor in CSS pixels) and darkens them against the mud (`farDark`).
 *
 * Group frame (same as everywhere in the project, model space): a man at (dx, dz) stands at
 * pos + R(bearing) (dx, dz) with dx to the right and dz toward the rear, so dz < 0 is ahead;
 * x = pos.x + dx cos b - dz sin b, z = pos.z + dx sin b + dz cos b. Men face their direction of
 * travel (the group bearing when standing still). `t` is not used.
 *
 * Gaits: a plod with the rifle at the port (British) or carried (German) through the mud, a rush
 * and a crouch-run from the measured speed, going to ground and crawling when a burst comes near,
 * thrown tumbling by a close burst, a shot man falling forward or back and lying still where he
 * fell. Dead bodies stay until their group is removed, then sink into the mud and fade.
 */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const LIE = 1.5; // pitch of a lying body (rad), a hair under 90 degrees so the shoulders stay propped

function hash(id, i) {
  let h = 2166136261 ^ i;
  const s = String(id);
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// per group state: crouch (0..1), top ground speed (m/s)
const GS = {
  forming: { cr: 0.5, vmax: 3 },
  advancing: { cr: 0.06, vmax: 4 },
  assault: { cr: 0.32, vmax: 7 },
  broken: { cr: 0.22, vmax: 6.5 },
  in: { cr: 0.62, vmax: 3 },
};

class Man {
  constructor(seed, k, x, z, hd) {
    this.seed = seed; this.k = k;
    this.x = x; this.z = z; this.gy = 0; this.hd = hd;
    this.pace = 0.9 + 0.2 * ((seed * 13.7) % 1);
    this.leanVar = (((seed * 31.3) % 1) - 0.4) * 0.07;
    this.size = 0.95 + 0.1 * ((seed * 57.1) % 1);
    this.mode = 'move'; // move | air | fall | dead
    this.alive = true;
    this.spd = 0; this.dirx = 0; this.dirz = 0;
    this.ph = (seed * 91.7) % 1; this.amp = 0; this.cr = 0; this.lean = 0.04;
    this.pitch = 0; this.pitchV = 0; this.flail = 0; this.crawl = 0; this.rm = 0;
    this.h = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.downT = 0; this.downPitch = -LIE; this.fallT = 0; this.fallDir = seed > 0.45 ? 1 : -1;
    this.age = 0; this.hdV = 0;
  }
}

class Rec {
  constructor(id, side) {
    this.id = id; this.side = side; this.men = []; this.fade = 0; this.seen = true;
    this.bearing = 0;
  }
}

export class Infantry {
  constructor(scene, { max = 1500, minPx = 4.5, farDark = 0.5, lodDist = 110, shadows = true } = {}) {
    this.max = max;
    this.lodDist = lodDist;
    this.recs = new Map();
    this.time = 0;
    this.frame = 0;
    this.rng = mulberry32(1917);
    this.stats = { men: 0, drawn: 0, lod0: 0, lod1: 0 };
    this.U = makeUniforms();
    this.minPx = minPx;
    this.U.uFarDark.value = farDark;
    this.viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
    this.group = new THREE.Group();
    this.group.name = 'infantry';
    scene.add(this.group);
    this.frustum = new THREE.Frustum();
    this._pv = new THREE.Matrix4();
    this._sph = new THREE.Sphere();
    this._v = new THREE.Vector3();
    const kitP = { german: [0.7, 0.75, 0.9, 0.6], british: [0.6, 0.8, 0.5, 0.55] };
    this.sets = { german: [], british: [] };
    for (const side of ['german', 'british']) {
      const { mat, depth } = makeMaterials(side, this.U, kitP[side]);
      for (let lod = 0; lod < 2; lod++) {
        const base = buildSoldier(side, lod);
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = null;
        for (const k of Object.keys(base.attributes)) geo.setAttribute(k, base.attributes[k]);
        const mk = (name) => {
          const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
          a.setUsage(THREE.DynamicDrawUsage);
          geo.setAttribute(name, a);
          return a;
        };
        const set = { geo, a: [mk('aPos'), mk('aPose'), mk('aLie'), mk('aStyle')], n: 0 };
        geo.instanceCount = 0;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.customDepthMaterial = depth;
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.name = `inf-${side}-${lod}`;
        this.group.add(mesh);
        set.mesh = mesh;
        this.sets[side].push(set);
      }
    }
  }

  setShadows(on) {
    for (const s of ['german', 'british']) for (const set of this.sets[s]) set.mesh.castShadow = on;
  }

  /** Forget every group (a new game). */
  reset() {
    this.recs.clear();
  }

  dispose() {
    this.group.removeFromParent();
    for (const s of ['german', 'british']) for (const set of this.sets[s]) set.geo.dispose();
  }

  // ------------------------------------------------------------ the update

  update(dt, groups, heightAt, camera) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.frame++;
    const U = this.U;
    U.uT.value = this.time;
    let culling = false;
    U.uMinPx.value = camera ? this.minPx : 0;
    if (camera) {
      camera.updateMatrixWorld();
      U.uEye.value.setFromMatrixPosition(camera.matrixWorld);
      this.viewportH = typeof window !== 'undefined' ? window.innerHeight : this.viewportH;
      U.uPxW.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.viewportH);
      this._pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this._pv);
      culling = true;
    }

    for (const r of this.recs.values()) r.seen = false;
    if (groups) {
      for (const g of groups) {
        let r = this.recs.get(g.id);
        if (!r) { r = new Rec(g.id, g.side); this.recs.set(g.id, r); }
        r.seen = true;
        r.fade = 0;
        r.side = g.side;
        r.bearing = g.bearing;
        const st = GS[g.state] || GS.advancing;
        const c = Math.cos(g.bearing), s = Math.sin(g.bearing);
        const men = g.men;
        for (let i = 0; i < men.length; i++) {
          const src = men[i];
          const tx = g.pos.x + src.dx * c - src.dz * s, tz = g.pos.z + src.dx * s + src.dz * c;
          let m = r.men[i];
          if (!m) {
            m = r.men[i] = new Man(hash(g.id, i), i, tx, tz, -g.bearing);
            if (heightAt) m.gy = heightAt(tx, tz);
            if (src.alive === false) this._setDead(m, true);
            else m.age = -1; // new arrivals rise out of the ground
          }
          this._step(m, dt, src.alive !== false, tx, tz, g.bearing, g.state, st, r.side === 'german', heightAt, 0);
        }
        r.men.length = Math.min(r.men.length, men.length);
      }
    }
    // groups that left the sim: sink and fade
    for (const [id, r] of this.recs) {
      if (r.seen) continue;
      r.fade += dt / 3;
      if (r.fade >= 1) { this.recs.delete(id); continue; }
      const st = GS.advancing;
      for (const m of r.men) this._step(m, dt, m.alive, m.x, m.z, r.bearing, 'advancing', st, r.side === 'german', heightAt, m.alive ? Math.min(1, r.fade * 3) : r.fade);
    }

    // fill the instance buffers
    for (const side of ['german', 'british']) for (const set of this.sets[side]) set.n = 0;
    let total = 0, drawn = 0;
    const eye = U.uEye.value, ld2 = this.lodDist * this.lodDist;
    const sph = this._sph;
    outer: for (const r of this.recs.values()) {
      const sets = this.sets[r.side] || this.sets.german;
      for (const m of r.men) {
        total++;
        if (drawn >= this.max) break outer;
        const dx = m.x - eye.x, dz = m.z - eye.z, dy = m.gy - eye.y;
        const d2 = dx * dx + dz * dz + dy * dy;
        if (culling) {
          sph.center.set(m.x, m.gy + 1, m.z);
          sph.radius = 2 + Math.sqrt(d2) * 0.03;
          if (!this.frustum.intersectsSphere(sph)) continue;
        }
        const set = culling && d2 > ld2 ? sets[1] : sets[0];
        const i = set.n++;
        const gp = Math.abs(Math.sin(m.pitch));
        const lift = -0.805 * gp * clamp(1 - m.h / 0.8, 0, 1);
        const fade = Math.max(r.fade, m.age < 0 ? clamp(-m.age, 0, 1) : 0);
        const a = set.a;
        let o = i * 4;
        a[0].array[o] = m.x; a[0].array[o + 1] = m.gy + m.h; a[0].array[o + 2] = m.z; a[0].array[o + 3] = m.hd;
        a[1].array[o] = m.ph; a[1].array[o + 1] = m.amp; a[1].array[o + 2] = m.cr; a[1].array[o + 3] = m.pitch;
        a[2].array[o] = m.flail; a[2].array[o + 1] = m.rm; a[2].array[o + 2] = m.crawl; a[2].array[o + 3] = m.seed;
        a[3].array[o] = m.lean; a[3].array[o + 1] = m.size; a[3].array[o + 2] = lift; a[3].array[o + 3] = fade;
        drawn++;
      }
    }
    for (const side of ['german', 'british']) {
      for (const set of this.sets[side]) {
        set.geo.instanceCount = set.n;
        for (const a of set.a) {
          a.clearUpdateRanges();
          if (set.n) a.addUpdateRange(0, set.n * 4);
          a.needsUpdate = set.n > 0;
        }
      }
    }
    this.stats.men = total;
    this.stats.drawn = drawn;
    this.stats.lod0 = this.sets.german[0].n + this.sets.british[0].n;
    this.stats.lod1 = this.sets.german[1].n + this.sets.british[1].n;
  }

  // ------------------------------------------------------------ one man

  _setDead(m, instant) {
    m.alive = false;
    m.mode = 'dead';
    m.flail = instant ? 1 : m.flail;
    m.pitch = (m.fallDir > 0 ? 1 : -1) * LIE;
    m.crawl = 0; m.cr = 0.1; m.amp = 0; m.rm = 3; m.lean = 0;
    m.hd += (m.seed - 0.5) * 1.6;
    m.age = instant ? 1 : m.age;
  }

  _kill(m) {
    m.alive = false;
    if (m.mode === 'air' || m.mode === 'dead') return;
    if (m.downT > 0 || Math.abs(m.pitch) > 1.0) { // already on the ground
      m.mode = 'dead';
      m.fallDir = m.pitch > 0 ? 1 : -1;
      return;
    }
    m.mode = 'fall';
    m.fallT = 0;
    m.vx = m.dirx * m.spd * 0.8; m.vz = m.dirz * m.spd * 0.8;
    m.vy = 1.2 + this.rng() * 1.2;
    m.h = 0.02;
  }

  _step(m, dt, alive, tx, tz, bearing, gstate, st, german, heightAt, fade) {
    if (m.age < 0) m.age = Math.min(0, m.age + dt / 0.7);
    if (!alive && m.alive) this._kill(m);
    const frame = this.frame;
    const rng = this.rng;

    if (m.mode === 'move') {
      // chase the formation slot, slowly if pinned
      const g = Math.abs(Math.sin(m.pitch));
      const ex = tx - m.x, ez = tz - m.z, d = Math.hypot(ex, ez);
      const vmax = (st.vmax * (0.85 + 0.3 * ((m.seed * 5.3) % 1))) * (1 - 0.92 * g);
      const vd = Math.min(d * 5, vmax);
      let step = Math.min(vd * dt, d);
      if (d > 1e-5) {
        m.x += (ex / d) * step; m.z += (ez / d) * step;
        m.dirx += ((ex / d) - m.dirx) * damp(6, dt); m.dirz += ((ez / d) - m.dirz) * damp(6, dt);
      } else step = 0;
      // landing slide
      if (m.vx * m.vx + m.vz * m.vz > 0.01) {
        m.x += m.vx * dt; m.z += m.vz * dt;
        const k = Math.exp(-4 * dt); m.vx *= k; m.vz *= k;
      }
      const sp = dt > 0 ? step / dt : 0;
      m.spd += (sp - m.spd) * damp(6, dt);
      const v = m.spd;
      // heading: the way he goes, the group's way when standing
      let hdT = -bearing;
      if (v > 0.45 && (m.dirx || m.dirz)) hdT = Math.atan2(-m.dirx, -m.dirz);
      if (g > 0.5 && v < 0.15) hdT = m.hd; // keep lying as he lies
      let dh = hdT - m.hd; dh -= TAU * Math.floor((dh + Math.PI) / TAU);
      m.hd += dh * damp(v > 0.45 ? 7 : 3, dt);
      m.hd += m.hdV * dt; m.hdV *= Math.exp(-3 * dt);

      // gait from the speed: stride and cadence match so the boots do not skate
      const f = (0.8 + 0.12 * v) * m.pace * (german ? 1 : 0.93);
      const ampT = v < 0.15 ? 0 : Math.asin(clamp(v / (3.5 * f), 0, 0.93));
      m.amp += (ampT - m.amp) * damp(8, dt);
      m.ph = (m.ph + (v < 0.15 ? 0.12 : f) * dt * (1 - 0.5 * g)) % 1;
      const pinned = m.downT > 0;
      if (pinned) m.downT -= dt;
      let crT = st.cr + (v > 2.8 ? 0.18 : 0) + (german ? 0.08 : 0);
      if (gstate === 'advancing' && v < 1.8) crT = st.cr + (german ? 0.1 : 0);
      m.cr += (crT - m.cr) * damp(4, dt);
      const leanT = 0.04 + 0.05 * Math.min(v, 4) + 0.5 * m.cr + m.leanVar;
      m.lean += (leanT - m.lean) * damp(5, dt);
      const rmT = pinned || g > 0.5 ? 2 : german ? 1 : 0;
      m.rm += (rmT - m.rm) * damp(pinned ? 8 : 4, dt);
      const pT = pinned ? m.downPitch : 0;
      m.pitch += (pT - m.pitch) * damp(pinned ? 9 : 4, dt);
      const crawlT = pinned && m.downPitch < 0 ? clamp(v / 0.25, 0, 1) : 0;
      m.crawl += (crawlT - m.crawl) * damp(6, dt);
      const flT = pinned && m.downPitch > 0 ? 0.45 : 0;
      m.flail += (flT - m.flail) * damp(6, dt);
      if (pinned && m.crawl > 0.5) m.amp = 0.3; // the crawl amplitude is the shader's phase scale
    } else if (m.mode === 'air' || m.mode === 'fall') {
      m.x += m.vx * dt; m.z += m.vz * dt;
      m.h += m.vy * dt; m.vy -= 9.8 * dt;
      m.hd += m.hdV * dt;
      if (m.mode === 'air') {
        m.pitch += m.pitchV * dt;
        m.flail += (1 - m.flail) * damp(10, dt);
        m.amp += (0 - m.amp) * damp(8, dt);
        m.crawl += (0 - m.crawl) * damp(8, dt);
        m.rm += (3 - m.rm) * damp(10, dt);
      } else {
        // shot: buckle, throw the arms up, go down forward or back
        m.fallT += dt;
        const pT = m.fallDir * LIE;
        m.pitch += (pT - m.pitch) * damp(m.fallT < 0.12 ? 2 : 7, dt);
        m.flail += (1 - m.flail) * damp(5, dt);
        m.rm += (3 - m.rm) * damp(6, dt);
        m.cr += (0.25 - m.cr) * damp(5, dt);
        m.amp += (0 - m.amp) * damp(6, dt);
        m.crawl += (0 - m.crawl) * damp(6, dt);
        m.lean += (0 - m.lean) * damp(5, dt);
      }
      if (m.h <= 0 && m.vy < 0) {
        m.h = 0;
        if (m.vy < -2.5 && m.mode === 'air' && m.vy > -40) { // one bounce
          m.vy *= -0.25; m.vx *= 0.5; m.vz *= 0.5; m.h = 0.01; m.pitchV *= 0.4;
        } else {
          const lying = Math.sin(m.pitch) >= 0 ? 1 : -1;
          m.fallDir = lying;
          m.pitch = ((m.pitch + Math.PI) % TAU + TAU) % TAU - Math.PI; // wrap, then ease to the nearest lie
          m.vy = 0; m.pitchV = 0;
          if (!m.alive) { m.mode = 'dead'; m.pitch = lying * Math.min(Math.abs(m.pitch), LIE) || lying * LIE; }
          else {
            m.mode = 'move';
            m.downT = 2.5 + rng() * 4;
            m.downPitch = lying * LIE;
            m.spd = 0;
          }
        }
      }
      if (m.mode === 'fall' && m.fallT > 1.0 && m.h === 0) { m.mode = 'dead'; }
      const k = Math.exp(-(m.h > 0 ? 0.2 : 4) * dt); m.vx *= k; m.vz *= k;
    } else { // dead
      m.pitch += ((m.fallDir > 0 ? 1 : -1) * LIE - m.pitch) * damp(10, dt);
      m.flail += (1 - m.flail) * damp(6, dt);
      m.rm += (3 - m.rm) * damp(8, dt);
      m.cr += (0.1 - m.cr) * damp(4, dt);
      m.amp += (0 - m.amp) * damp(8, dt);
      m.crawl += (0 - m.crawl) * damp(8, dt);
      m.lean += (0 - m.lean) * damp(8, dt);
      m.h += (0 - m.h) * damp(10, dt);
      if (m.vx * m.vx + m.vz * m.vz > 0.0004) {
        m.x += m.vx * dt; m.z += m.vz * dt;
        const k = Math.exp(-4 * dt); m.vx *= k; m.vz *= k;
      }
      m.hd += m.hdV * dt; m.hdV *= Math.exp(-3 * dt);
    }
    // ground under him (every few frames; always while he moves)
    if (heightAt && (m.mode !== 'dead' || ((frame + m.k) & 7) === 0) && (((frame + m.k) & 3) === 0 || m.mode === 'air')) m.gy = heightAt(m.x, m.z);
  }

  // ------------------------------------------------------------ bursts

  /** A burst at (x, z): men near it are flung, further out they throw themselves down. */
  blast(x, z, radius) {
    const rng = this.rng;
    for (const r of this.recs.values()) {
      for (const m of r.men) {
        if (m.mode === 'air') continue;
        const dx = m.x - x, dz = m.z - z, d = Math.hypot(dx, dz);
        if (d > radius) continue;
        const k = 1 - d / radius;
        if (k > (m.alive ? 0.5 : 0.4)) {
          const ax = d > 0.05 ? dx / d : Math.cos(rng() * TAU), az = d > 0.05 ? dz / d : Math.sin(rng() * TAU);
          const sp = (3 + 11 * k) * (0.6 + 0.8 * rng());
          m.vx = ax * sp; m.vz = az * sp;
          m.vy = (3 + 7 * k) * (0.6 + 0.6 * rng());
          m.pitchV = (rng() - 0.5) * 16 + (rng() < 0.5 ? 3 : -3);
          m.hdV = (rng() - 0.5) * 6;
          m.mode = 'air';
          m.h = 0.05;
          m.downT = 0;
        } else if (k > 0.1 && m.alive && m.mode === 'move' && m.downT <= 0) {
          m.downT = 2.5 + rng() * 5 * (0.4 + k);
          m.downPitch = -LIE;
        }
      }
    }
  }
}

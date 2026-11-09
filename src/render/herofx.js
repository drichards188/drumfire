// Effects that stay with the max-quality battery's guns (shots/maxq/PLAN.md 3.7; owned by the effects track): bore
// wisps after a shot, fumes out of the breech when the case leaves (HERO_CUES caseOut), the hot case's smoke, the
// barrel's heat shimmer, and the dust the shot shakes off the carriage. render/guns.js creates one per GunViews,
// createHeroFx(fx, post), and calls fired(view, now) from GunViews.fired and update(view, dt, now) every frame for each
// hero view. Creating it builds the hero puff atlas (fx.enableHero) and routes the hero blast waves and shimmers to
// post with their hero flag. Allocates nothing per frame.
import * as THREE from 'three';
import { SMOKE, rand, rr } from '../fx/kinds.js';
import { CLOD } from '../fx/clods.js';
import { HERO_CUES } from './herocues.js';

const _p = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Vector3();

// Where the Mrs 18's carriage holds dust (rig root space, front -Z: the platform's rim, the wheels and mudguards, the
// walkways and the trail's deck, the top carriage's cheeks), and on the cradle (the elevation pivot's space: the recoil
// cylinder's top, the cradle's shoulders). From models/v/de/k18.js: platform radius 1.3, wheels at x 1.15, z -1.45, R
// 0.76, the deck at 1.1 m, trunnions 2.2 m up.
const DUST_ROOT = [
  [1.25, 0.12, 0], [-1.25, 0.12, 0], [0, 0.12, -1.25], [0.9, 0.12, 0.9], [-0.9, 0.12, 0.9], [0.9, 0.12, -0.9], [-0.9, 0.12, -0.9],
  [1.15, 1.62, -1.45], [-1.15, 1.62, -1.45], [1.2, 1.5, -1.95], [-1.2, 1.5, -1.95],
  [1.35, 1.12, 0.9], [-1.35, 1.12, 0.9], [1.35, 1.12, 2.4], [-1.35, 1.12, 2.4], [1.1, 1.12, 3.9], [-1.1, 1.12, 3.9], [0, 1.12, 5.2],
  [0.62, 2.55, 0.35], [-0.62, 2.55, 0.35],
];
const DUST_EL = [[0, 0.62, -0.8], [0, 0.62, 0.35], [0.34, 0.3, -1.05], [-0.34, 0.3, -1.05]];

export function createHeroFx(fx, post, opts = {}) {
  if (!fx) return { fired() {}, update() {} };
  // (lean: the headless tools' cheaper bake, PLAN.md section 2; render/guns.js may pass it, else webdriver decides)
  fx.enableHero?.({ renderer: post?.renderer, lean: opts.lean ?? (typeof navigator !== 'undefined' && !!navigator.webdriver) });
  // the hero blast waves and shimmers go to post with their flag (faded near the camera; weighted by the view ray)
  const sho = { radius: 300, speed: 343, strength: 1, hero: true }, ho = { radius: 1, life: 1, strength: 1, hero: true };
  if (post) {
    fx.heroShock = (p, radius, speed, strength) => { sho.radius = radius; sho.speed = speed; sho.strength = strength; post.shockwave?.(p, sho); };
    fx.heroHeat = (p, radius, life, strength) => { ho.radius = radius; ho.life = life; ho.strength = strength; post.heat?.(p, ho); };
  }
  // one options object for every puff (refilled before each spawn)
  const so = { glow: 0, drag: 1.4, buoy: 0.35, len: 0, hug: 0, gy: null, grav: 0, stretch: null, hero: true, spin: null };
  const opt = (drag, buoy, grav = 0, spin = null) => { so.drag = drag; so.buoy = buoy; so.grav = grav; so.spin = spin; return so; };
  const co = { life: 6, drag: 0.3, fuse: 0, gy: 0, flat: 1, stream: 0 };
  const state = new WeakMap();
  const stOf = (v) => {
    let s = state.get(v);
    if (!s) state.set(v, (s = { last: -1e9, shot: -1e9, wisp: 0, fumesFor: -1e9, trickle: 0, caseAcc: 0, heat: 0, heatT: 0, heatAlt: 0 }));
    return s;
  };
  const camDist = (rig) => fx._cam.distanceTo(rig.root.position);

  // the muzzle (world) into _p and the bore's direction into _d, from the anchor's last world matrix
  const muzzle = (rig) => {
    const m = rig.anchors?.muzzle;
    if (!m) return false;
    const e = m.matrixWorld.elements;
    _p.set(e[12], e[13], e[14]);
    _d.set(-e[8], -e[9], -e[10]).normalize();
    return true;
  };
  // the chamber's mouth (world) into _b
  const breech = (rig) => {
    const m = rig.anchors?.chamber ?? rig.anchors?.breech;
    if (!m) return false;
    const e = m.matrixWorld.elements;
    _b.set(e[12], e[13], e[14]);
    return true;
  };

  return {
    /** The view's gun has just fired (its rig posed for the shot): the carriage sheds its dust. */
    fired(v, now) {
      const rig = v?.rig, p = v?.piece;
      if (!rig || !p) return;
      const s = stOf(v);
      s.shot = now;
      s.heat += 1;
      if (camDist(rig) > 400) return;
      const q = Math.max(0.4, Math.min(1.2, fx.budget));
      rig.root.updateMatrixWorld(true);
      const gy = fx.ground(rig.root.position.x, rig.root.position.z);
      const el = rig.pivots?.elevation;
      const n = DUST_ROOT.length + (el ? DUST_EL.length : 0);
      for (let i = 0; i < n; i++) {
        if (rand() > q) continue;
        const onEl = i >= DUST_ROOT.length, d = onEl ? DUST_EL[i - DUST_ROOT.length] : DUST_ROOT[i];
        _q.set(d[0] + rr(-0.15, 0.15), d[1], d[2] + rr(-0.15, 0.15)).applyMatrix4(onEl ? el.matrixWorld : rig.root.matrixWorld);
        // (thinner right by the camera: the gunner on the deck sees the dust jump, not a wall of it)
        const k = rand() < 0.5 ? 2 : 1, a = 0.26 * Math.min(1, Math.max(0.3, (_q.distanceTo(fx._cam) - 1.5) / 4));
        for (let j = 0; j < k; j++) {
          so.gy = gy;
          fx.addSmoke(SMOKE.PUFF, _q.x, _q.y + 0.1, _q.z, rr(-0.6, 0.6), rr(0.5, 2), rr(-0.6, 0.6), rr(2, 4), 0.25, rr(1.6, 3.2), 0.36, 0.32, 0.26, a, opt(1.6, 0.1, 0, rr(-0.3, 0.3)));
          so.gy = null;
        }
        if (rand() < 0.35) {
          co.life = rr(3, 5); co.gy = gy;
          fx.clods.add(CLOD.EARTH, _q.x, _q.y + 0.05, _q.z, rr(-1.2, 1.2), rr(1, 3), rr(-1.2, 1.2), rr(0.03, 0.06), 0.24, 0.2, 0.15, co);
        }
      }
    },

    /** Every frame for each hero view: what keeps smoking after the shot, and the barrel's shimmer. */
    update(v, dt, now) {
      const rig = v?.rig, p = v?.piece;
      if (!rig || !p || p.state === 'dead' || !(dt > 0)) return;
      const s = stOf(v);
      // a jump in time (fastForward, a new battle): nothing carries over
      if (now < s.last || now - s.last > 0.5) { s.wisp = 0; s.trickle = 0; s.caseAcc = 0; s.heatT = 0; }
      s.last = now;
      s.heat *= Math.exp(-dt / 240);
      const tf = now - p.firedAt;
      const d = camDist(rig);
      if (d > 600) return;
      const b = Math.max(0.4, fx.budget);

      // wisps from the bore: thin smoke curling out of the muzzle for twenty seconds, following it down for loading
      if (tf > 0.3 && tf < 25) {
        s.wisp += dt * 7 * Math.exp(-(tf - 0.3) / 5) * b * (d < 150 ? 1 : 0.5);
        if (s.wisp >= 1 && muzzle(rig)) {
          while (s.wisp >= 1) {
            s.wisp -= 1;
            const f = rr(0.3, 1.2), u = rr(0.4, 1), c = rr(0.62, 0.7);
            fx.addSmoke(SMOKE.TRAIL, _p.x + rr(-0.06, 0.06), _p.y + rr(-0.06, 0.06), _p.z + rr(-0.06, 0.06), _d.x * f, _d.y * f + u, _d.z * f, rr(3, 6), 0.18, rr(1.2, 2.4), c, c * 0.99, c * 0.95, 0.24 * Math.exp(-tf / 12), opt(1.4, 0.35, 0, rr(-0.5, 0.5)));
          }
        }
      }

      // fumes out of the breech as the block opens and the case comes out (HERO_CUES caseOut; until the drill has its
      // cues, the open step at two thirds), then a thin trickle while the breech stands open
      const j = p.job, cue = HERO_CUES[p.kind]?.caseOut, tl = v.crew?.tl;
      let out = false, open = false;
      if (j && p.firedAt > -900 && tf < 180) {
        if (cue && tl?.at) {
          const tc = tl.at(cue[0], cue[1]);
          out = tl.now >= tc && tl.now - tc < 1.5;
        } else out = j.step === 'open' && j.t >= 0.66 * j.dur;
        open = j.step === 'open' || j.step === 'shell';
      }
      if (out && s.fumesFor !== p.firedAt && breech(rig) && muzzle(rig)) {
        s.fumesFor = p.firedAt;
        s.trickle = 0;
        const n = Math.round(12 * Math.min(1, b));
        for (let i = 0; i < n; i++) {
          const f = rr(1.5, 4), u = rr(0.5, 1.5), c = rr(0.58, 0.66);
          fx.addSmoke(SMOKE.CORDITE, _b.x + rr(-0.08, 0.08), _b.y + rr(-0.08, 0.08), _b.z + rr(-0.08, 0.08), -_d.x * f + rr(-0.5, 0.5), -_d.y * f + u, -_d.z * f + rr(-0.5, 0.5), rr(2.5, 5), 0.25, rr(1.2, 2.2), c, c * 0.94, c * 0.84, 0.42, opt(1.8, 0.5, 0, rr(-0.6, 0.6)));
        }
      } else if (open && s.fumesFor === p.firedAt) {
        s.trickle += dt * 2 * b;
        if (s.trickle >= 1 && breech(rig) && muzzle(rig)) {
          while (s.trickle >= 1) {
            s.trickle -= 1;
            const c = rr(0.6, 0.68);
            fx.addSmoke(SMOKE.TRAIL, _b.x, _b.y, _b.z, -_d.x * rr(0.3, 0.9), -_d.y * 0.5 + rr(0.3, 0.7), -_d.z * rr(0.3, 0.9), rr(2.5, 4.5), 0.15, rr(0.8, 1.5), c, c * 0.97, c * 0.92, 0.2, opt(1.5, 0.4, 0, rr(-0.5, 0.5)));
          }
        }
      }

      // the hot case: a wisp off it for a quarter of a minute wherever it lies or is carried (the drill's crew.caseProp,
      // the spent case, and crew.caseT, the seconds since it left the chamber; its last world matrix is near enough)
      const cp = v.crew?.caseProp, age = cp && cp.visible !== false ? v.crew.caseT ?? -1 : -1;
      if (age >= 0 && age < 15) { const e = cp.matrixWorld.elements; _q.set(e[12], e[13], e[14]); }
      if (age >= 0 && age < 15 && d < 120) {
        s.caseAcc += dt * (1.5 - 1.2 * (age / 15)) * b;
        while (s.caseAcc >= 1) {
          s.caseAcc -= 1;
          const c = rr(0.62, 0.7);
          fx.addSmoke(SMOKE.TRAIL, _q.x + rr(-0.04, 0.04), _q.y + 0.05, _q.z + rr(-0.04, 0.04), rr(-0.1, 0.1), rr(0.3, 0.6), rr(-0.1, 0.1), rr(2, 4), 0.06, rr(0.5, 0.9), c, c, c * 0.96, 0.2, opt(1.2, 0.3, 0, rr(-0.5, 0.5)));
        }
      } else s.caseAcc = 0;

      // the barrel's heat: after a few rounds the air over it shimmers for minutes (post.js weights a hero shimmer by
      // the view ray's closest approach, so it shows against the sky); laid end to end, by the muzzle and mid-barrel
      if (s.heat > 0.05 && d < 70) {
        s.heatT -= dt;
        if (s.heatT <= 0 && muzzle(rig) && breech(rig)) {
          s.heatT = 0.6;
          s.heatAlt ^= 1;
          const k = s.heatAlt ? 0.15 : 0.55;
          _q.copy(_p).lerp(_b, k).y += 0.35;
          fx.heatAt(_q, 0.9, 0.9, Math.min(0.6, 0.15 + 0.12 * s.heat), true);
        }
      }
    },
  };
}

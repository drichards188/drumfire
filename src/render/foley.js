// The max-quality battery's drill heard (shots/maxq/PLAN.md 3.6; owned by the sound track). render/guns.js creates one
// per GunViews, createFoley({ audio, terrain }), and calls update(view, dt, now, camera) every frame for each hero view,
// after the drill has posed the men. It plays the drill's sounds (src/audioHero.js FOLEY_CUES) on the moments the men
// and the steel do them (render/herocues.js HERO_CUES on the crew's clocks: crew.tl, crew.shotT, the time since the
// shot), at their places on the rig (the chamber, the tray, the firing lever, the staff's hooks, the case where it
// lands); the gears turning while the gun is laid (loops by the laying's rate, a detent as a wheel stops); the men's
// boots on the steel and on the earth (their gaits' heel strikes); and the player's hands over his ears in first
// person (audio.setEars). It sets audio.heroFoley once it carries a hero gun's drill (main then leaves audio.load out
// for the hero units) and audio.speakerAt for the crew's voices (src/ww2/voices.js shouts from the man who speaks).
// mark(axis): the gunner's wheel onto its mark, a detent at that wheel (main calls it in place of its console click).
// It reads the sim and the render, never changes them (Math.random is fine here); allocates nothing per frame; says
// nothing after a jump of the sim's time (fastForward, a new game) or under fast time compression.
import * as THREE from 'three';
import { GUNS } from '../sim/tables.js';
import { HERO_CUES, shotIn, caseDue } from './herocues.js';
import { FOLEY_CUES, HERO } from '../audioHero.js';

const HEAR = 120; // m from the camera: beyond, a gun's drill is not played (it would not carry over the battle)
const STEPS_AT = 30; // m: the men's footsteps
const PER_FRAME = 6; // one-shots a gun plays in one frame at most
const STEP_FRAME = 4; // footsteps a gun plays in one frame at most
const JUMP = 0.5; // s of sim time in one frame: a jump, nothing is played for it
const SURFACE = { mud: 'mud', water: 'mud', grass: 'grass' }; // terrain.groundAt -> the boots' bank (else earth)
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A cue's clock and moment: { clock: 'cycle', step, k, dt } | { clock: 'shot' | 'tf', m } (m: seconds from the shot) |
 * { clock: 'crew', name, dt } (the crew's own schedule, crew.cueS[name] in sim seconds: render/crews_ammo.js).
 */
function resolve(kind, cue, dt, fb) {
  const c = cue && HERO_CUES[kind]?.[cue];
  const [a, b, d] = c ? [c[0], c[1], dt ?? 0] : [fb[0], fb[1], fb[2] ?? 0];
  if (a === 'crew') return { clock: 'crew', name: b, dt: d };
  return a === 'shot' || a === 'tf' ? { clock: a, m: b + d } : { clock: 'cycle', step: a, k: b, dt: d };
}

// the cue lists by kind, resolved once (HERO_CUES is fixed)
const LISTS = new Map();
function cuesOf(kind) {
  if (LISTS.has(kind)) return LISTS.get(kind);
  const H = HERO[kind], src = FOLEY_CUES[kind];
  const list = !H || !src ? null : src.map((c) => ({ ...c, group: c.group ?? H.foley, when: resolve(kind, c.cue, c.dt, c.fb), fitW: c.fit ? resolve(kind, c.fit[0], 0, c.fit[1]) : null }));
  LISTS.set(kind, list);
  return list;
}

export function createFoley({ audio = null, terrain = null } = {}) {
  const states = new Map(); // view -> its state, made once
  const views = new Map(); // `${unitId}:${pi}` -> view (the voices' speakers)
  const pos = new THREE.Vector3(), tmp = new THREE.Vector3(), eye = new THREE.Vector3(), muz = new THREE.Vector3();
  let earsAt = -1; // the wall second a view last held the ears (the player's man, seen from his eyes)

  // the crew's voices: where the man in `role` of gun `pi` of unit `unitId` stands (out), false when he is not drawn
  if (audio) {
    const spk = new THREE.Vector3();
    audio.speakerAt = (unitId, pi, role, out) => {
      const m = views.get(`${unitId}:${pi}`)?.crew?.byRole?.get(role);
      if (!m?.root?.visible) return false;
      m.root.getWorldPosition(spk);
      out.x = spk.x;
      out.y = spk.y + 1.6 * (m.root.scale?.y ?? 1); // (his mouth)
      out.z = spk.z;
      return true;
    };
  }

  function state(view) {
    let s = states.get(view);
    if (s) return s;
    const p = view.piece, n = view.crew?.men?.length ?? 0;
    s = { now: NaN, wall: 0, scale: 1, tn: NaN, sh: Infinity, tf: NaN, el: p.el, az: p.az, at: NaN, ue: 0, ua: 0, er: 0, ar: 0, eOn: false, aOn: false, eRun: 0, aRun: 0,
      ph: new Float32Array(n).fill(NaN), kit: 0, caseFor: new Float64Array(64).fill(-1e12), key: view.key, idE: view.key + ':elev', idA: view.key + ':trav' };
    states.set(view, s);
    return s;
  }

  // a node's world position into `out` (null when there is no node)
  const at = (node, out) => (node ? node.getWorldPosition(out) : null);
  // a rest root-space point into world space
  const local = (rig, x, y, z, out) => rig.root.localToWorld(out.set(x, y, z));

  /** Where a cue sounds on the rig (world space, into `out`). */
  function where(view, name, out) {
    const rig = view.rig, A = rig.anchors ?? {}, crew = view.crew;
    switch (name) {
      case 'tray': return at(A.tray ?? A.breech, out) ?? local(rig, 0, 2.2, 2.4, out);
      case 'lever': return at(rig.knobs?.lever ?? A.breech, out) ?? local(rig, 0.35, 2.45, 1.75, out);
      case 'hooks': return at(A.staffHooks?.[0] ?? A.tray, out) ?? local(rig, 0.58, 1.18, 3.55, out);
      case 'elev': return at(rig.gear?.wheelL, out) ?? local(rig, -0.78, 1.8, 0.55, out);
      case 'trav': return at(rig.gear?.wheelR, out) ?? local(rig, 0.78, 1.8, 0.55, out);
      case 'sight': return at(rig.gear?.sightHead, out) ?? local(rig, -0.92, 2.38, 0.39, out);
      case 'case': {
        // where the spent case lands: the case itself when the drill throws one, else on the deck behind the breech
        if (crew?.caseProp?.visible) return crew.caseProp.getWorldPosition(out);
        if (!at(A.chamber ?? A.breech, out)) return local(rig, 0, 1.15, 2.6, out);
        if (at(A.muzzle, muz)) {
          const dx = out.x - muz.x, dz = out.z - muz.z, l = Math.hypot(dx, dz) || 1;
          out.x += (dx / l) * 1.3;
          out.z += (dz / l) * 1.3;
        }
        out.y = rig.root.getWorldPosition(muz).y + (HERO[view.piece.kind]?.deck ?? 1.1) + 0.05;
        return out;
      }
      // the ammunition's places (render/crews_ammo.js crew.ammoAt): the next round's fuze, the charge container, the lid
      // the surplus is laid on, the case in hand, the case stood in its row
      case 'fuze': case 'can': case 'spare': case 'charge': case 'row':
        return crew?.ammoAt?.(name, out) ?? at(A.shellStack, out) ?? local(rig, 3.4, 0.3, 4, out);
      default: return at(A.chamber ?? A.breech, out) ?? local(rig, 0, 2.2, 1.6, out);
    }
  }

  function play(view, c, until, gain) {
    where(view, c.at, pos);
    audio.foley(c.s, pos, { gain, rate: (c.rate ?? 1) * (0.97 + 0.06 * Math.random()), until, group: c.group, loud: !!c.loud });
  }

  function update(view, dt, now, camera) {
    const crew = view?.crew, p = view?.piece, rig = view?.rig;
    if (!audio?.ctx || !crew || !p || !rig || !camera) return;
    const kind = p.kind, list = cuesOf(kind), H = HERO[kind], g = GUNS[kind];
    if (!list || !g || !audio.heroOn?.(kind)) return; // (no hero banks yet: main still plays its load steps)
    audio.heroFoley = true;
    views.set(view.key, view);
    const s = state(view), wall = performance.now() / 1000;
    const dSim = now - s.now, dWall = wall - s.wall;
    s.now0 = s.now; // (last frame's sim second: the crew cues fall between the two)
    const jump = !(dSim >= -1e-6 && dSim <= JUMP); // (a first frame is a jump: NaN)
    if (!jump && dWall > 1e-4) s.scale += (clamp(dSim / dWall, 0, 64) - s.scale) * 0.25;
    s.now = now;
    s.wall = wall;
    const scale = s.scale, d = Number.isFinite(view.dist) && view.dist > 0 ? view.dist : camera.position.distanceTo(rig.root.position);
    const hear = !jump && scale <= 6 && d < HEAR && p.state !== 'dead';
    const T = crew.tl, tn = T?.now ?? NaN, sh = Number.isFinite(crew.shotT) || crew.shotT === Infinity ? crew.shotT : shotIn(p, now), tf = now - p.firedAt;
    let n = 0;
    if (hear) {
      // the cycle clock: +Infinity once the cycle is over (its last cues count to its end); a cycle just begun counts from 0
      const t1 = tn === Infinity && Number.isFinite(s.tn) ? T.end : tn, t0 = s.tn === -Infinity && Number.isFinite(tn) && tn < 0.6 ? 0 : s.tn;
      const cyc = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 && t1 - t0 < 0.6;
      const due = caseDue(p);
      for (let i = 0; i < list.length && n < PER_FRAME; i++) {
        const c = list[i], w = c.when;
        let t = NaN;
        if (w.clock === 'cycle') {
          if (!cyc) continue;
          t = T.at(w.step, w.k) + w.dt;
          if (!(t0 < t && t <= t1)) continue;
        } else if (w.clock === 'crew') {
          // the crew's own schedule: its sim second falling between this frame's and the last
          const tc = (crew.cueS?.[w.name] ?? NaN) + w.dt;
          if (!(Number.isFinite(tc) && s.now0 < tc && tc <= now && now - s.now0 < 0.6)) continue;
        } else if (w.clock === 'shot') {
          // the time to the shot falling through the moment (a shot given at once, 0 from Infinity: the pull with it)
          const th = -w.m;
          if (!(s.sh > th && sh <= th && th - sh < 0.3)) continue;
        } else if (!(s.tf < w.m && w.m <= tf && tf - w.m < 0.6)) continue;
        // a spent case only in a cycle after a shot, once per shot
        if (c.case) {
          if (!due || s.caseFor[i] === p.firedAt) continue;
          s.caseFor[i] = p.firedAt;
        }
        // a slide cut where its motion ends (cycle seconds, in the audio's seconds under time compression)
        let until = null;
        if (c.fitW?.clock === 'cycle' && Number.isFinite(t)) {
          until = (T.at(c.fitW.step, c.fitW.k) + c.fitW.dt - t) / Math.max(1, scale);
          if (until < 0.04) continue;
        }
        play(view, c, until, c.g * (scale > 2 ? 0.7 : 1));
        n++;
      }
    }
    s.tn = tn;
    s.sh = sh;
    s.tf = tf;
    // the gears: the laying's rate against the gun's own (its slew), over at least 0.15 s of sim time (the sim moves the
    // barrel in 0.05 s steps: frame by frame the rate flickers between nothing and more), then smoothed
    if (jump || !Number.isFinite(s.at)) {
      s.at = now;
      s.el = p.el;
      s.az = p.az;
      s.er = s.ar = 0;
    } else if (now - s.at >= 0.15) {
      const w = now - s.at;
      s.er = Math.abs(p.el - s.el) / w / g.elRate;
      s.ar = Math.abs(wrapPi(p.az - s.az)) / w / g.azRate;
      s.at = now;
      s.el = p.el;
      s.az = p.az;
    }
    const kk = 1 - Math.exp(-Math.max(dWall, 0) / 0.08);
    s.ue += (clamp(s.er, 0, 1.5) - s.ue) * kk;
    s.ua += (clamp(s.ar, 0, 1.5) - s.ua) * kk;
    const lk = hear && scale <= 2 ? 1 : 0, ue = Math.min(1, s.ue), ua = Math.min(1, s.ua);
    if (lk || s.eOn || s.ue > 0.01) audio.foleyLoop(s.idE, 'mlaf_elev', where(view, 'elev', pos), 0.5 * ue * lk, 0.6 + 0.6 * ue);
    if (lk || s.aOn || s.ua > 0.01) audio.foleyLoop(s.idA, 'mlaf_trav', where(view, 'trav', pos), 0.55 * ua * lk, 0.7 + 0.5 * ua);
    // a wheel stopped after a real turn (0.4 s of sim time at least): the gear's backlash taken up, once
    s.eRun = s.ue > 0.35 ? s.eRun + Math.max(0, dSim) : s.ue < 0.06 ? 0 : s.eRun;
    s.aRun = s.ua > 0.35 ? s.aRun + Math.max(0, dSim) : s.ua < 0.06 ? 0 : s.aRun;
    if (s.eOn && s.ue < 0.06) {
      s.eOn = false;
      if (hear) audio.foley('wheelStop', where(view, 'elev', pos), { gain: 0.45, group: H.foley });
    } else if (!s.eOn && s.eRun > 0.4) s.eOn = true;
    if (s.aOn && s.ua < 0.06) {
      s.aOn = false;
      if (hear) audio.foley('wheelStop', where(view, 'trav', pos), { gain: 0.4, rate: 0.9, group: H.foley });
    } else if (!s.aOn && s.aRun > 0.4) s.aOn = true;
    // the boots: a heel strike when a gait's phase crosses 0 (the left foot) or 0.5 (the right), on the steel or the earth
    const men = crew.men, ph = s.ph, steps = hear && scale <= 2 && d < STEPS_AT + 15;
    let k = 0;
    for (let i = 0; i < men.length && i < ph.length; i++) {
      const m = men[i], on = !!m.gait && Number.isFinite(m.phase) && m.root?.visible, q = ph[i];
      ph[i] = on ? m.phase : NaN;
      if (!steps || !on || !Number.isFinite(q) || k >= STEP_FRAME) continue;
      let dp = m.phase - q;
      if (dp > 0.5) dp -= 1;
      else if (dp < -0.5) dp += 1;
      if (Math.floor(2 * (q + dp)) === Math.floor(2 * q)) continue;
      m.root.getWorldPosition(tmp);
      if (tmp.distanceTo(camera.position) > STEPS_AT) continue;
      const steel = m.onDeck || m.gait === 'climb';
      const surf = steel ? 'grate' : SURFACE[terrain?.groundAt?.(tmp.x, tmp.z)] ?? 'earth';
      const load = m.carry === 'shell' ? 1.2 : m.carry ? 1 : 0.75;
      audio.foley('step_' + surf, tmp, { gain: load, ref: 6, rate: (m.carry === 'shell' ? 0.88 : 1) * (0.95 + 0.1 * Math.random()), group: H.foley });
      if (++s.kit % 3 === 0) audio.foley('kit', tmp, { gain: 0.22, ref: 5, group: H.foley });
      k++;
    }
    // first person: the player's man's hands over his ears (not the firer's: he has the lanyard). The gunner's view is
    // at his eyes or just over his shoulder (src/ww2/gunnerView.js VIEW: up to 0.9 m back and up)
    if (crew.player && crew.eye?.(eye) != null && eye.distanceTo(camera.position) < 1.4) {
      audio.setEars?.(crew.player.noEars ? 0 : crew.ears ?? 0);
      earsAt = wall;
    } else if (earsAt > 0 && wall - earsAt > 0.25) {
      audio.setEars?.(0);
      earsAt = -1;
    }
  }

  /**
   * The gunner's handwheel brought onto its mark (sim.events.gunner('mark', axis): 'el' or 'az'): a detent's clack at that
   * wheel of the gun he serves, when it is a hero gun. True when it played (main then leaves its console click out).
   */
  function mark(axis) {
    if (!audio?.ctx) return false;
    for (const view of views.values()) {
      if (!view.crew?.player || !audio.heroOn?.(view.piece?.kind)) continue;
      audio.foley('wheelMark', where(view, axis === 'az' ? 'trav' : 'elev', pos), { gain: 0.6, ref: 4, group: HERO[view.piece.kind].foley });
      return true;
    }
    return false;
  }

  return { update, mark, views };
}

import { GUNS } from '../sim/tables.js';
import { clamp01 } from './anim.js';
import { CREW_GAITS } from '../models/v/crew.js';
import { paced, pacedT, turn, along, pathLen } from './drill_pace.js';

// Going to and coming back from the slit trench for the rocket batteries' men who are not the Nebelwerfer 41's own
// (render/crews_de.js has those): the 21 cm Nebelwerfer's ammunition man (render/de/nbw42.js) and the schweres
// Wurfgerät's crate carriers and layer (render/de/swg40.js). The same rules as crews_de.js's inCover: the men in
// cover while the launcher is loaded and waiting and through the ripple, back at a steady run once the last rocket is
// away; the ones done early (the carriers) walk off when the priming begins, the rest run when the cover step does.
// A pure function of the piece's job, its ripple and the time since the shot.

const RIPPLE_END = 0.18; // the sim's recoil kick after the last rocket (sim/guns.js), before the run out
const RUN = 2.9, RSTRIDE = CREW_GAITS.run.stride, WSTRIDE = CREW_GAITS.walk.stride, WALKV = 1.45;
export const CROUCH_H = -Math.PI / 2; // in the trench, facing the launcher over the parapet (the trench is to its left)

// where the piece is in its round: inside (in cover: loaded and waiting, the ripple), tPrime (s since the priming
// began, -1 before), tCover (s since the cover step began, -1 before), coverDur, tBack (s since the ripple ended)
export function coverPhase(c, out) {
  const p = c.p, g = GUNS[p.kind], j = p.job;
  out.inside = !!(p.ripple || c.st === 'ready' || c.st === 'recoil' || (p.loaded && !j));
  out.tPrime = -1; out.tCover = -1; out.tBack = Infinity; out.coverDur = 1;
  if (j && (c.s === 'prime' || c.s === 'lay' || c.s === 'cover')) {
    // the earlier steps' lengths from the table, scaled as this step is (crew upgrades shorten them all alike)
    const L = g.load, dur = (st) => L.find((q) => q.step === st)?.dur ?? 0, sc = j.dur / Math.max(0.01, dur(c.s));
    const into = c.k * j.dur;
    out.tPrime = c.s === 'prime' ? into : c.s === 'lay' ? dur('prime') * sc + into : (dur('prime') + dur('lay')) * sc + into;
    if (c.s === 'cover') { out.tCover = into; out.coverDur = j.dur; }
  } else if (!out.inside && p.firedAt > 0) {
    const n = p.tubes ?? g.salvo?.n ?? 1, tEnd = p.firedAt + (n - 1) * (g.salvo?.dt ?? 0) + RIPPLE_END + (g.runout ?? 1);
    out.tBack = c.now - tEnd;
  }
  return out;
}

const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }], _P = { x: 0, z: 0, h: 0, d: 0, len: 0 }, _F = {};

// Going to, staying in or coming back from cover; true when it has placed the man. cv: his place in the trench
// ({ x, z }, root space); dest, destH: his place and heading at work; via: a waypoint ({ x, z }, root space) or null;
// early: he walks off when the priming begins instead of running when the cover step does.
export function inCover(crew, m, c, cv, dest, destH, via, early) {
  if (!cv) return false;
  const F = coverPhase(c, _F);
  const going = F.inside || (early ? F.tPrime >= 0 : F.tCover >= 0);
  if (!going && !(F.tBack < Infinity)) return false;
  if (F.inside || (!going && F.tBack < 0)) { m.put(cv.x, 0, cv.z, CROUCH_H, 'crouch', crew.idleT + m.seed); return true; }
  let n = 2;
  _path[0].x = dest.x; _path[0].z = dest.z;
  if (via) { _path[1].x = via.x; _path[1].z = via.z; n = 3; }
  _path[n - 1].x = cv.x; _path[n - 1].z = cv.z;
  const len = pathLen(_path, n);
  if (going) {
    let e, tA, gait, stride;
    if (early) {
      e = pacedT(F.tPrime, len, WALKV, 0.3); tA = F.tPrime - (len / WALKV + 0.3); gait = 'walk'; stride = WSTRIDE;
    } else {
      const D = F.coverDur, tw = Math.min(0.86 * D, len / RUN + 0.45);
      e = paced(F.tCover / D, 0, 0.86, D, len, RUN, 0.45); tA = F.tCover - tw; gait = 'run'; stride = RSTRIDE;
    }
    if (e < 1) { along(_path, n, e, _P, destH, null); m.put(_P.x, 0, _P.z, _P.h, gait, _P.d / stride); return true; }
    // there: he turns round to face the launcher, then gets down
    along(_path, n, 1, _P);
    const w = clamp01(tA / 0.5);
    m.put(cv.x, 0, cv.z, turn(_P.h, CROUCH_H, w), w < 1 ? 'stand' : 'crouch', crew.idleT + m.seed);
    return true;
  }
  // back after the ripple: up and turned to the way (0.5 s), the run, then into his place facing his work
  const tb = F.tBack;
  for (let i = 0, j = n - 1; i < j; i++, j--) { const tx = _path[i].x, tz = _path[i].z; _path[i].x = _path[j].x; _path[i].z = _path[j].z; _path[j].x = tx; _path[j].z = tz; }
  const e = pacedT(tb - 0.5, len, RUN, 0.45);
  if (e >= 1) return false;
  along(_path, n, e, _P, null, destH);
  if (tb < 0.5) m.put(cv.x, 0, cv.z, turn(CROUCH_H, _P.h, tb / 0.5), 'stand', crew.idleT + m.seed);
  else m.put(_P.x, 0, _P.z, _P.h, 'run', _P.d / RSTRIDE);
  return true;
}

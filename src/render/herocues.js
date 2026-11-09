// The named moments of the max-quality battery's drill (shots/maxq/PLAN.md 3.3; owned by the motion track), read by
// render/foley.js (sound) and render/herofx.js (effects). HERO_CUES[kind][name] = [step, k]: the moment the loading
// step `step` reaches fraction k on the crew's cycle clock, crew.tl.at(step, k) (cycle seconds; crew.tl.now is the
// cycle second now, -Infinity before a cycle and +Infinity after one). Two kinds of entry are not on that clock:
//   ['shot', s]   s seconds from the shot (negative before it), on shotIn(p, now): the shot itself is the sim's
//   ['tf', s]     s seconds after the shot, on now - p.firedAt
//   ['crew', n]   the moment the crew's own schedule gives this frame (crew.cueS[n], sim seconds, NaN when none): the
//                 ammunition's beats, whose times follow the order (how many increments come out) and the men's routes
//                 (render/crews_ammo.js)
// The drill in render/crews.js (crew.hero) is built to these numbers, so a sound or a puff keyed on a cue lands on the
// frame where the men and the steel do it. shotIn(p, now, simTime) is the predicted time to the shot in seconds (0 at
// the shot, Infinity when none is coming), a pure function of the piece and the time.
import { GUNS, STEP } from '../sim/tables.js';

// The Mörser 18's cycle (GUNS.mrs18.load at the table pace: depress 5 s, open 2, shell 8, ram 3, cartridge 4, close 2,
// prime 1.5, lay 6; a short crew stretches every step alike, crew.tl follows it)
const MRS18 = {
  // the block man turns the operating crank: the wedge unlocks with a clunk and starts to slide out (+X)
  blockOpen: ['open', 0.0],
  // the extractors throw the spent case out of the chamber, backward and a little up (only in a cycle after a shot:
  // p.firedAt > -900, once per p.firedAt); it tumbles over the rear of the top carriage
  caseOut: ['open', 0.66],
  // the wedge hits its stop, fully open
  blockOpened: ['open', 0.7],
  // the case strikes the walkway's grating (a hollow brass clank), bounces once and slides to rest by ['open', 1.0]
  caseLand: ['open', 0.9],
  // the loading tray seats on the breech ring (iron on steel)
  trayOn: ['open', 0.98],
  // the carrying pair sets the 113 kg shell down on the tray (a heavy dull knock), then slides it up the tray
  shellSet: ['shell', 0.91],
  // the shell slid home to the rear of the tray, the pair lets go
  shellSlid: ['shell', 0.98],
  // the staff's owner takes the staff up off its hooks (wood on iron) while the pair sets the shell; he holds it at his
  // hip and swings it into the bore's line with his mate over ram k 0.02 to 0.17
  staffUp: ['shell', 0.86],
  // the staff's head against the shell's base: the run begins (two men, two or three steps)
  ram: ['ram', 0.18],
  // the driving band meets the forcing cone, one hard shove and it bites (a deep metallic thunk; the staff jolts)
  shellSeat: ['ram', 0.6],
  // the staff drawn clear of the breech
  staffOut: ['ram', 0.95],
  // the staff laid back on its hooks
  staffHung: ['cartridge', 0.16],
  // the cased charge enters the chamber mouth (brass on steel, a sliding scrape)
  chargeIn: ['cartridge', 0.55],
  // the case's rim seats against the breech face
  chargeSeat: ['cartridge', 0.69],
  // the tray lifted off the ring
  trayOff: ['close', 0.05],
  // the block man starts the crank back: the wedge slides in
  blockClose: ['close', 0.4],
  // the wedge home and locked (a heavy final clack)
  blockLocked: ['close', 0.99],
  // the firing lanyard hooked onto the firing lever (a small click), then taken up with slack
  lanyardHook: ['prime', 0.55],
  // "Fertig!": the gun commander's arm starts up (only when a shot is coming: shotIn; up by -0.95)
  armUp: ['shot', -1.4],
  // the firer takes the slack out of the lanyard and leans back (taut by -0.25)
  lanyardTaut: ['shot', -0.6],
  // the pull: the firer's hand drawn back sharply (drawn by -0.04), the lever trips at the shot; the commander's arm
  // falls over the last 0.12 s ("Feuer!")
  lanyardPull: ['shot', -0.2],
  // the men who covered their ears take their hands down (crew.ears falls through 0.5)
  earsOff: ['tf', 0.95],
  // the barrel home on the recuperators (a soft hydraulic thump into the counter-recoil buffer, render/herorig.js)
  runOutHome: ['tf', 2.05],
  // the top carriage home on its rails (a deeper thump)
  carriageHome: ['tf', 3.35],
  // the ammunition (render/crews_ammo.js; the research's estimates there):
  // ammo1 at the next round's nose after the shot: his hand on the setting head, then the head turned a quarter turn
  // onto MV (a detent's click) or, for o.V., tried against its detent (a tick)
  fuzeGrip: ['crew', 'fuzeGrip'],
  fuzeSet: ['crew', 'fuzeTurn'],
  fuzeCheck: ['crew', 'fuzeCheck'],
  // ammo2 at the charge container: the clamp lever off, the lid swung up, the case drawn out (brass on sheet steel) and
  // stood on its head, the leatherboard cup pulled, each surplus increment drawn out by its loop (silk) and laid on the
  // next container's lid, the cup pressed back, the case taken up in his arms
  lidOpen: ['crew', 'lidOpen'],
  lidUp: ['crew', 'lidUp'],
  caseLift: ['crew', 'caseLift'],
  caseDown: ['crew', 'caseDown'],
  cupOut: ['crew', 'cupOut'],
  bagOut1: ['crew', 'bagOut1'], bagOut2: ['crew', 'bagOut2'], bagOut3: ['crew', 'bagOut3'], bagOut4: ['crew', 'bagOut4'], bagOut5: ['crew', 'bagOut5'],
  bagDown1: ['crew', 'bagDown1'], bagDown2: ['crew', 'bagDown2'], bagDown3: ['crew', 'bagDown3'], bagDown4: ['crew', 'bagDown4'], bagDown5: ['crew', 'bagDown5'],
  cupIn: ['crew', 'cupIn'],
  chargeUp: ['crew', 'chargeUp'],
  // back from the breech: the surplus taken up and put into the empty container, the lid shut and clamped
  surplusUp: ['crew', 'surplusUp'],
  surplusIn: ['crew', 'surplusIn'],
  lidShut: ['crew', 'lidShut'],
  latchOn: ['crew', 'latchOn'],
  // ammo1 stands the spent case on its head in the row of empties (brass on the earth, a clink against its neighbour)
  caseStand: ['crew', 'caseStand'],
};

export const HERO_CUES = { mrs18: MRS18 };

// The cycle second of cue `name` for this crew (crew.tl.at), or NaN (no such cue for the kind, a 'shot' or 'tf' cue,
// or no cycle clock yet).
export function cueAt(crew, name) {
  const c = HERO_CUES[crew?.kind]?.[name];
  if (!c || c[0] === 'shot' || c[0] === 'tf' || !crew.tl) return NaN;
  // (a crew-scheduled moment: its sim second back onto the cycle clock while a cycle runs)
  if (c[0] === 'crew') { const t = crew.cueS?.[c[1]]; return Number.isFinite(crew.tl.now) && Number.isFinite(t) ? crew.tl.now - (crew.c?.now ?? 0) + t : NaN; }
  return crew.tl.at(c[0], c[1]);
}

// True when cycle cue `name` fell between two readings of the cycle clock (crew.tl.now last frame and this frame).
// A reading that jumped more than `maxGap` cycle seconds (time compressed past it, a fastForward) does not count, so a
// skipped cue stays silent instead of firing late.
export function cueCrossed(crew, name, prev, now, maxGap = 0.6) {
  if (!(Number.isFinite(prev) && Number.isFinite(now)) || now <= prev || now - prev > maxGap) return false;
  const t = cueAt(crew, name);
  return prev < t && t <= now;
}

// Seconds to the shot as the crew can know it (Infinity: none coming): the order to fire stands and the gun is ready
// (its fireAt: the next round of a series, the firer's pull held by the gunner or by his crew, src/ww2/gunner.js
// fireAt = now + PULL - held), or the gun is in the last step of its cycle laid on the command (sim/guns.js fires it the
// step it comes ready: every round of a series, an order given while it loads). An order given to a gun already ready
// fires it at once (guns.js fire: fireAt = now): nobody can see that one coming, 0. A pure function of p.rounds,
// p.state, p.fireAt, p.job, p.az/el, p.cmd, p.layK, p.manned and the time: `now` the render's time (sim.time +
// alpha * STEP), `simTime` the sim's (for the job's time; the same when not given, at most a step early).
export function shotIn(p, now, simTime = now) {
  if (!p || !(p.rounds > 0) || p.state === 'dead' || p.state === 'recoil') return Infinity;
  const fa = Number.isFinite(p.fireAt) ? p.fireAt - now : Infinity;
  if (p.state === 'ready') return fa > 0 ? fa : 0;
  const j = p.job;
  // (a manned gun waits for the player's pull, which comes as fireAt once he holds it)
  if (p.manned || !j || j.step !== 'lay' || j.i !== j.n - 1) return Infinity;
  const g = GUNS[p.kind], lk = p.layK ?? 1;
  if (!g) return Infinity;
  const slew = Math.max(Math.abs(p.cmd.az - p.az) / (g.azRate * lk), Math.abs(p.cmd.el - p.el) / (g.elRate * lk));
  const rem = Math.max(j.dur - j.t - Math.max(0, now - simTime), slew) + STEP;
  return fa > rem ? fa : rem;
}

// Whether this cycle has a spent case to throw (a round was fired since the piece was set up): caseOut and caseLand
// happen only then, once per p.firedAt.
export const caseDue = (p) => p.firedAt > -900;

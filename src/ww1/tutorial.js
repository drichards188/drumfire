// The German career's basic training: the first lesson a new player is offered (src/ui/invite.js), on the career's own
// ridge (the WW1 German page, ?mode=ww1&tutorial=training) and run by the same Tutorials class as every lesson
// (src/tutorial.js). The Gruppe lends the player a battery well above a new career's: the WW2 21 cm Mörser 18 pair
// "Julius" (src/ww1/ops.js RIDGE_WW2) with every upgrade, so the career's first battle with its one 10 cm K 17 feels the
// difference. Two halves: the console (take a call, range one gun, read the VB, correct, bracket, fire for effect) and
// the gun in person (man it, lay, fire, read back a new command, load, fire again, leave), then both guns finish the
// second target. The screen is dark but for each step's work (`spotlight`) and every step must be done (`noSkip`);
// Exit leaves at any time. Node-safe (the menu lists it); each step has a demo, so
// `__drumfire.tutorial.autoplaySync({ id: 'training' })` plays it unattended.
import { LESSON_KIT } from '../tutorial.js';
import { loadoutOf, maxedLevels } from '../research.js';
import { POSTS } from '../ww2/gunner.js';

const { inFlight, readyN, targetDown, idle, bracketDemo } = LESSON_KIT;

const KIND = 'mrs18';
const UNIT = 11; // the ridge's Mörser 18 battery (ops.js RIDGE_WW2)
const LEVELS = maxedLevels(KIND); // both guns, every part at its top
// The console's target is a tank laager: hard, so one 21 cm hit wrecks a tank or two, not the laager (the fire for effect
// has work to do); the gun's is an ammunition dump, soft, which the one corrected round can wreck by itself. The first
// round at the gun lands 160 m over, so there is always a correction to read back (not a battery: a battery's aim point
// carries a 70 to 200 m location error, director.js cbErr, which could cancel the planned miss).
const MAIN_SITE = 'T2', MAIN = { observer: 'foo', title: 'Tank laager, Hooge', firstError: { over: 170, right: -60 } };
const POV_SITE = 'D2', POV = { observer: 'foo', title: 'Ammunition dump, Zillebeke', firstError: { over: 160, right: 0 } };

// the player at the gun (src/ww2/gunner.js st) and the piece he serves
const G = (T) => T.sim.gunner?.st ?? null;
const gp = (T) => { const st = G(T); return st ? T.sim.unitById(st.unitId)?.pieces[st.pi] ?? null : null; };
// No. 1 gun's rounds since the player was sent to it (counted in keep): the gun steps go by them, not by the step's own
// start, so a player who fires before the card has moved on (the round goes the moment the gun is ready) is never
// left on a step already done; steps already passed are skipped (`ahead`)
const gunShots = (T) => T.life.gunShots ?? 0;
const ahead = (T) => gunShots(T) >= 2 || targetDown(T, 'pov');
// the demos' hands on the gun's keys (main reads T.gunInput in place of the keyboard)
const KEYS = { E: { work: true }, A: { az: 1 }, D: { az: -1 }, W: { el: 1 }, S: { el: -1 } };
const drillDemo = (T, post) => {
  const st = G(T);
  if (!st) return;
  if (post && st.post !== post) T.act('post', { post });
  const n = st.next, inp = { az: 0, el: 0, fine: false, work: false };
  if (n?.key && n.post === st.post) Object.assign(inp, KEYS[n.key] ?? {});
  T.gunInput = inp;
};
// A step at the gun: if the player has left it, say how to come back (once a step). `help` holds the crew help where the
// lesson wants it: on for the first round (the crew loads, the player lays and fires), off from that shot (the player
// works every post for the next), null where it is the player's (the C key, a fresh P put it back as the player had it).
const atGun = (T, help = null) => {
  const st = G(T);
  if (!st) {
    if (!T.mem.away) { T.mem.away = true; T.hint('You have left the gun. Press P to man it again.'); }
    return;
  }
  if (help != null && st.assist !== help) {
    T.act('assist', { on: help });
    if (T.mem.held) T.hint(help ? 'Crew help stays on for this round.' : 'Crew help stays off for now: this round every post is yours.');
    T.mem.held = true;
  }
};
const stepOf = (p) => (p?.state === 'loading' ? p.job?.step : null);
// the loading drill's steps in words (the piece's job.step)
const DOING = { depress: 'barrel down to the loading angle', open: 'opening the breech', shell: 'bringing up the shell', ram: 'ramming the shell', cartridge: 'putting in the cartridge', close: 'closing the breech', prime: 'fitting the primer', lay: 'laying on the target' };
const REPORT = '[data-tut~="report"]'; // the spotlight on the newest report slip (ui/consoles/messagePad.js)
const povReports = (T) => T.m('pov')?.reports.length ?? 0;
// the battery's aim moved since the VB's first report on the dump (keep records the aim then)
const povCorrected = (T) => { const a = T.life.adj0, o = T.u?.order.adj; return !!a && !!o && Math.hypot(o.add - a.add, o.right - a.right) > 1; };

// The console steps' goals as game state, never as "since this step opened": each reads what the battle holds now, so a
// player ahead of the card (Enter, Space and the keys work under the spotlight) finds the steps done and the card moves on
// (the lesson is `instant`). Each is also true once a later one is, so the chain holds whatever order things happened in.
const main = (T) => T.m('main');
const wrecked = (T) => targetDown(T) || (T.sim.targetById(MAIN_SITE)?.damage ?? 0) >= 0.74;
const firedOn = (T) => main(T)?.fired?.[UNIT] ?? 0; // rounds the battery has fired on the laager's call (sim/guns.js)
const reportsOn = (T) => main(T)?.reports ?? [];
const forEffect = (T) => T.u?.ffeVolley != null || wrecked(T); // a fire for effect given (sim/guns.js u.ffeVolley)
const onTarget = (T) => reportsOn(T).some((r) => r.ok) || forEffect(T);
const takenMain = (T) => (!!main(T) && T.u?.missionId === main(T).id) || firedOn(T) > 0 || wrecked(T);
const firedMain = (T) => firedOn(T) > 0 || wrecked(T);
const reported = (T) => reportsOn(T).length > 0 || onTarget(T);
const corrected = (T) => T.corrected() || reportsOn(T).length > 1 || onTarget(T);
// how far the battery's last two rounds fell from a target (m; 0 before any): rounds for effect go unobserved, so a
// wrong aim there would go on missing without a word (src/tutorial.js life.fall)
const missBy = (T, site) => {
  const t = T.sim.targetById(site), f = T.life.fall.filter((q) => q.unitId === UNIT).slice(-2);
  return t && f.length ? f.reduce((a, q) => a + Math.hypot(q.x - t.pos.x, q.z - t.pos.z), 0) / f.length : 0;
};
// why the battery cannot carry out its order ('' when it can: sim/guns.js problem)
const problem = (T) => (T.u ? T.sim.guns.problem(T.u, false) : '');

const steps = [
  {
    id: 'welcome', title: 'Basic training',
    text: 'For this lesson you have a borrowed battery: "Julius", two 21 cm Mörser 18 with every upgrade, each shell 113 kg.\n\nEvery step waits until you have done it; Exit tutorial leaves at any time.',
    spot: [],
  },
  {
    id: 'look', title: 'The guns',
    text: 'The left half of the screen is your battery in 3D. Hold the left mouse button and drag to walk the camera round the mortars; the wheel zooms.',
    goal: 'Drag in the 3D view, or turn the wheel', spot: ['#view'],
    enter: (T) => { T.mem.cam = T.host.cam(); },
    done: (T) => { const c = T.host.cam(); return Math.abs(c.yaw - T.mem.cam.yaw) > 0.3 || Math.abs(c.dist - T.mem.cam.dist) > 6; },
    demo: (T) => T.once('cam', () => T.host.nudgeCam()),
  },
  // the console, one section at a time
  {
    id: 'header', title: 'The battery',
    text: 'The top of the console: the battery you command, its status line (what it is doing, or why it cannot fire), and AUTO, MANUAL and HOLD. On AUTO the battery\'s own commander fights it; any order you give puts it on MANUAL. A to D call Sperrfeuer, the barrage that stops an attack, on a sector of the front.',
    spot: ['header', 'status', 'mode'],
  },
  {
    id: 'board', title: 'The map board',
    text: 'The map: our lines in blue, theirs in red, your battery and its reach, the targets as symbols. Click a target to take its call for fire, or the map to lay the guns on a point; drag pans, the wheel zooms.',
    spot: ['board'],
  },
  {
    id: 'order', title: 'The fire order',
    text: 'What the guns are laid to: the target, line, range and elevation. Below them the charge (Q and E), the rounds per gun (R), the fuze (Z), how many guns fire (G), the corrections (the arrow keys), FIRE (Space) and CEASE (Backspace).',
    spot: ['order'],
  },
  {
    id: 'rtab', title: 'The range table',
    text: 'The elevation and the time of flight for each range at the chosen charge. The row of the present target is lit.',
    spot: ['rtab'],
  },
  {
    id: 'gunscard', title: 'The guns',
    text: 'Each gun of the battery: its crew, its lamps (LAID, LOADED, READY), its loading drill ticked off step by step, its health and barrel wear, and MAN to serve it in person.',
    spot: ['guns'],
  },
  {
    id: 'calls', title: 'Calls for fire',
    text: 'Each slip is a target an observer wants hit: what it is, its range, and how long the call stays open. Tab moves along the slips, Enter takes one.',
    spot: ['missions'],
  },
  {
    id: 'messages', title: 'Messages and signals',
    text: 'Orders from the artillery commander and the observers\' reports by telephone: where each round fell, with the correction pencilled under it.',
    spot: ['pad'],
  },
  {
    id: 'take', title: 'Take the call',
    text: 'A VB (forward observer) has called fire on a British tank laager. Its call is a slip in the list: take it (or click the slip).',
    goal: 'Press Tab to select the call, then Enter to take it', spot: ['missions'],
    done: takenMain,
    stuck: () => 'Tab selects the slip and Enter takes it; or click the slip.',
    demo: (T) => T.once('take', () => T.act('mission', { id: main(T).id })),
  },
  {
    id: 'loading', title: 'Laying and loading',
    text: (T) => {
      const p = T.u?.pieces[0], s = p?.state === 'loading' ? p.job?.step : null;
      const now = p?.state === 'ready' ? 'READY' : p?.state === 'laying' ? 'laying on the target' : s ? DOING[s] ?? s : 'waiting';
      return `Taking the call lays the battery on the target. The crews load (the barrel comes down level, the shell and the cartridge go in, the breech closes, the primer is fitted) and lay the guns: the barrel swings onto the line and rises to the elevation. Watch No. 1 gun in the view; the guns card ticks off each step. ] speeds time.\n\nNo. 1 gun: ${now}.`;
    },
    goal: 'Wait until a gun is READY', spot: ['#view', 'guns'],
    enter: (T) => T.host.closeUp?.(0), // (the camera in close on No. 1 gun)
    done: (T) => readyN(T.u) > 0 || firedMain(T),
    stuck: (T) => problem(T) || 'the crews are still at work: ] speeds time.',
    limit: 300,
  },
  {
    id: 'range', title: 'Fire a ranging round',
    text: 'Loaded and laid. Never fire the whole battery at a first guess: range with one gun and one round. GUNS must say 1 GUN (G changes it), then press Space or FIRE.',
    goal: 'Set GUNS to 1 GUN and press Space to fire one ranging round', spot: ['#view', 'gunsel', 'fire'],
    // (more than one gun went: said once, and the lesson carries on with what fell)
    tick: (T) => { if (firedOn(T) > 1 && !forEffect(T) && !T.life.saidGuns) { T.life.saidGuns = true; T.hint('That was more than one gun: ranging is done with ONE gun (G sets 1 GUN).'); } },
    done: firedMain,
    stuck: (T) => problem(T) || (readyN(T.u) ? 'press Space (GUNS on 1 GUN).' : 'no gun is ready yet: the guns card shows the crews at work.'),
    demo: (T) => T.once('fire', () => T.act('fire', { guns: 1 })),
  },
  {
    id: 'follow', title: 'Ride the shell',
    text: 'Press F to ride your 113 kg shell to the target; F again comes back to the guns. On the board its burst will be marked by the target. The flight takes a while: ] speeds time up, [ slows it.',
    goal: 'Press F and ride the shell to its burst', spot: ['#view', 'board'],
    // (to the burst: the view stays lit for the whole flight)
    done: (T) => (firedMain(T) && !inFlight(T)) || reported(T),
    stuck: () => 'the round is still in the air: ] speeds time.',
    demo: (T) => T.once('f', () => T.host.follow()),
  },
  {
    id: 'report', title: 'Fall of shot',
    text: 'The VB watched the burst and telephones the fall of shot: how far over or short, how far left or right. It arrives on the message pad.',
    goal: 'Wait for the VB\'s report', spot: ['pad'],
    done: reported,
    stuck: () => 'the VB reports a few seconds after the burst: ] speeds time.',
  },
  {
    id: 'correct', title: 'Correct',
    text: 'The message pad pencils the correction under the report: "kürzer" (drop) when the round went over, "weiter" (add) when short, "links" and "rechts". Press . (full stop) to apply it; the arrow keys correct by hand.',
    goal: 'Apply the correction: press .', spot: [REPORT, 'corrections', 'keypad'],
    done: corrected,
    stuck: () => 'press . (full stop), or click APPLY under the newest report.',
    demo: (T) => { const r = T.rep.last; if (r && !r.ok && r.corr) T.once('corr', () => T.act('correct', { add: r.corr.add, right: r.corr.right })); },
  },
  {
    id: 'bracket', title: 'Walk the rounds on',
    text: 'Fire one more ranging round on the corrected aim. Fire, read the report, correct, fire again, until the VB says "Ziel!": on target.',
    goal: 'Range until the VB reports on target', spot: ['#view', 'fire', 'pad'],
    done: onTarget,
    stuck: (T) => problem(T) || (inFlight(T) ? 'a round is in the air: ] speeds time.' : T.rep.last && !T.rep.last.ok && !T.corrected() ? 'the newest report has a correction to apply: press .' : 'fire again: Space.'),
    demo: bracketDemo, limit: 900,
  },
  {
    id: 'effect', title: 'Fire for effect',
    text: 'On target. Now both guns, several rounds each: that is fire for effect.',
    goal: 'Press R until ROUNDS PER GUN is 3 or more, check GUNS says SECTION (both guns), then press Space', spot: ['#view', 'rounds', 'gunsel', 'fire'],
    done: forEffect,
    stuck: (T) => problem(T) || (T.u.order.rounds < 2 ? 'ROUNDS PER GUN is 1: press R to raise it.' : 'press Space.'),
    demo: (T) => { T.once('rounds', () => T.act('rounds', { n: 4 })); if (T.u.order.rounds >= 3) T.once('fire', () => T.act('fire', { guns: 'all' })); },
  },
  {
    id: 'kill', title: 'Wreck the laager',
    text: (T) => `Two 21 cm mortars firing for effect: tanks are hard, a shell must burst close to wreck one. Fire again whenever the guns fall silent, until three of its four tanks are wrecked (now ${Math.round((T.sim.targetById(MAIN_SITE)?.damage ?? 0) * 100)}% destroyed; F rides a shell, ] speeds time).`,
    goal: 'Wreck three of the four tanks', spot: ['#view', 'board'],
    done: wrecked,
    stuck: (T) => {
      const d = missBy(T, MAIN_SITE);
      if (problem(T)) return problem(T);
      if (d > 60) return `your rounds are falling about ${Math.round(d / 10) * 10} m from the laager, and the VB does not report rounds fired for effect. Fire one ranging round (R down to 1, G for 1 GUN, Space), then apply his correction (.).`;
      return idle(T) ? 'the guns are silent: press Space to fire again.' : 'rounds are on their way: ] speeds time.';
    },
    demo: (T) => {
      if (!idle(T)) return;
      const r = T.rep.last;
      // each report's correction once (as the console's . does), whatever the aim was when it came
      if (r && !r.ok && r.corr && T.mem.applied !== T.rep.n && !T.corrected()) { T.mem.applied = T.rep.n; T.act('correct', { add: r.corr.add, right: r.corr.right }); return; }
      // off target: one ranging round for a fresh report
      if (missBy(T, MAIN_SITE) > 60 && T.mem.ranged !== T.rep.n) { T.mem.ranged = T.rep.n; T.act('rounds', { n: 1 }); T.act('fire', { guns: 1 }); return; }
      if (T.u.order.rounds < 3) T.act('rounds', { n: 4 });
      T.act('fire', { guns: 'all' });
    },
    limit: 600,
  },
  {
    id: 'man', title: 'Serve a gun yourself',
    text: 'The other half of the game: you can take a place in a gun\'s detachment and work the drill in person, while the console still commands the battery. The battery is laid on a new call, an ammunition dump at Zillebeke, one round a gun.',
    goal: 'Press P (or MAN on the guns card) to man No. 1 gun', spot: ['#view', 'guns'],
    enter: (T) => { T.act('cease'); T.life.gunFrom = T.u.pieces[0].firedAt ?? -1; }, // (rounds still queued for the laager)
    // the new call once the laager's last shells are down (one landing after it would be reported against the dump)
    tick: (T) => {
      if (T.mem.laid || !idle(T)) return;
      const m = T.ensure('pov', POV_SITE, POV);
      if (m) T.act('mission', { id: m.id });
      T.act('rounds', { n: 1 });
      T.mem.laid = true;
    },
    done: (T) => !!G(T) && !!T.m('pov') && T.u.missionId === T.m('pov').id,
    stuck: (T) => (!T.mem.laid ? 'the laager\'s last rounds are still in the air.' : 'press P, or MAN on No. 1 gun\'s row of the guns card.'),
    demo: (T) => T.once('man', () => T.act('man', { piece: 0, post: 'lay', assist: true })),
  },
  {
    id: 'lay', title: 'The layer',
    text: 'You are the Richtkanonier, the layer (post 2). The top of the gun card always says the one thing to do now, and its key. The crew loads (crew help is on); you lay: crank the line onto the ordered mark with A and D and the elevation with W and S (Shift: the fine wheel). The wheels stop on the mark by themselves; TO LAY counts down to nothing. ] speeds time.',
    goal: 'Follow the card until the gun is loaded and laid (READY)', spot: ['#view'],
    skipIf: (T) => gunShots(T) >= 1,
    tick: (T) => atGun(T, true),
    done: (T) => gp(T)?.state === 'ready' || gunShots(T) >= 1,
    demo: (T) => drillDemo(T, 'lay'), limit: 400,
  },
  {
    id: 'fire', title: 'Feuer!',
    text: 'Loaded and laid. Press 4, the Abzugskanonier (firer), and hold E to pull the lanyard.',
    goal: 'Press 4, then hold E', spot: ['#view'],
    // (from the shot the crew help is off: the next round is the player's at every post)
    skipIf: (T) => gunShots(T) >= 1,
    tick: (T) => atGun(T, gunShots(T) < 1),
    done: (T) => gunShots(T) >= 1,
    demo: (T) => drillDemo(T, 'fire'),
  },
  {
    id: 'commander', title: 'The gun commander',
    text: 'For the next round the crew waits for you: crew help is off, every post is yours. While the shell flies, go to post 1, the Geschützführer (gun commander): every new fire command rings at his post, and he reads it back before the layer gets his marks.',
    goal: 'Press 1', spot: ['#view'],
    skipIf: ahead,
    tick: (T) => atGun(T, false),
    done: (T) => G(T)?.post === 'cmd' || ahead(T),
    demo: (T) => { if (G(T) && G(T).post !== 'cmd') T.act('post', { post: 'cmd' }); },
  },
  {
    id: 'readback', title: 'A new command',
    text: (T) => `${povReports(T) ? 'The VB\'s report is on the message pad.' : 'Wait for the VB\'s report on the message pad (] speeds time).'} The console still commands the battery while you are at the gun: press . to apply the correction, and a new command rings at your post. Hold E to read it back.`,
    goal: 'Apply the correction (.), then hold E to read the new command back', spot: ['#view', 'pad'],
    tick: (T) => atGun(T, false),
    skipIf: ahead,
    // the aim changed since the VB's report (his correction, or the player's own) and the gun's command now is read back
    // (game state: re-manning the gun reads back the command in hand, so "a command newer than the round" was not enough)
    done: (T) => { const st = G(T); return (povCorrected(T) && !!st?.order?.acked) || ahead(T); },
    stuck: (T) => {
      const st = G(T);
      if (!st) return null;
      if (!povReports(T)) return 'the VB has not reported yet: ] speeds time.';
      if (!povCorrected(T)) return 'apply the VB\'s correction: press . (the console works while you are at the gun).';
      if (st.order && !st.order.acked) return st.post === 'cmd' ? 'hold E to read the new command back.' : 'a new command waits at post 1: press 1, then hold E.';
      return 'apply the VB\'s correction: press . (the console works while you are at the gun).';
    },
    demo: (T) => {
      const r = T.m('pov')?.reports.at(-1);
      if (r?.corr && !r.ok) T.once('corr', () => T.act('correct', { add: r.corr.add, right: r.corr.right }));
      drillDemo(T, 'cmd');
    },
    limit: 400,
  },
  {
    id: 'down', title: 'Barrel down',
    text: 'A mortar loads with its barrel level. Press 2 (the layer) and hold S to run it down to the loading angle.',
    goal: 'Press 2, then hold S until the barrel is down', spot: ['#view'],
    tick: (T) => atGun(T, false),
    skipIf: ahead,
    done: (T) => { const p = gp(T); return ahead(T) || (!!p && (!!p.loaded || (p.state === 'loading' && stepOf(p) !== 'depress'))); },
    demo: (T) => drillDemo(T, 'lay'), limit: 300,
  },
  {
    id: 'load', title: 'The loader',
    text: 'Press 3, the Ladekanonier (loader), and hold E through his drill: open the breech, bring up the 113 kg shell, ram it, put in the cartridge, close the breech. The drill row on the card ticks off each step.',
    goal: 'Press 3, then hold E until the breech is closed on the round', spot: ['#view'],
    tick: (T) => atGun(T, false),
    skipIf: ahead,
    done: (T) => { const p = gp(T); return ahead(T) || (!!p?.loaded && (p.state !== 'loading' || ['prime', 'lay'].includes(stepOf(p)))); },
    demo: (T) => drillDemo(T, 'load'), limit: 300,
  },
  {
    id: 'prime', title: 'The primer',
    text: 'Press 4: the firer fits the primer to the breech. Hold E.',
    goal: 'Press 4, then hold E to fit the primer', spot: ['#view'],
    tick: (T) => atGun(T, false),
    skipIf: ahead,
    done: (T) => { const p = gp(T); return ahead(T) || (!!p && (p.state === 'ready' || p.state === 'laying' || (p.state === 'loading' && stepOf(p) === 'lay'))); },
    demo: (T) => drillDemo(T, 'fire'), limit: 300,
  },
  {
    id: 'relay', title: 'Lay on the new command',
    text: 'Press 2 and lay on the corrected command: A and D for the line, W and S for the elevation, until the card says the lay is checked.',
    goal: 'Press 2, then lay until the gun is READY', spot: ['#view'],
    tick: (T) => atGun(T, false),
    skipIf: ahead,
    done: (T) => gp(T)?.state === 'ready' || ahead(T),
    demo: (T) => drillDemo(T, 'lay'), limit: 300,
  },
  {
    id: 'fire2', title: 'Feuer!',
    text: 'Press 4 and hold E. This one should land in the dump.',
    goal: 'Press 4, then hold E', spot: ['#view'],
    tick: (T) => atGun(T, false),
    skipIf: ahead,
    done: (T) => ahead(T),
    demo: (T) => drillDemo(T, 'fire'),
  },
  {
    id: 'impact', title: 'Watch it land',
    text: 'F rides the shell (F again comes back), ] speeds time. The one round you laid, loaded and fired weighs 113 kg.',
    goal: 'Wait for the burst', spot: ['#view', 'timescale', 'pad'],
    done: (T) => targetDown(T, 'pov') || povReports(T) >= 2 || (gunShots(T) >= 2 && !inFlight(T)),
    demo: (T) => T.once('f', () => T.host.follow()), limit: 300,
  },
  {
    id: 'help', title: 'Crew help',
    text: 'You have worked every post. In battle the crew can do the posts you are not at: press C to switch crew help on (the gun card shows it), and stay at the one post you like.',
    goal: 'Press C', spot: ['#view'],
    skipIf: (T) => !G(T), // (already back at the console: nothing to switch)
    tick: (T) => atGun(T),
    done: (T) => !!G(T)?.assist,
    demo: (T) => T.once('c', () => T.act('assist', { on: true })),
  },
  {
    id: 'leave', title: 'Back to the console',
    text: 'The crew carries on without you. Press P to leave the gun (or LEAVE on the guns card): the camera goes back to the battery.',
    goal: 'Press P', spot: ['#view', 'guns'],
    skipIf: (T) => !G(T),
    done: (T) => !G(T),
    demo: (T) => T.once('unman', () => T.act('unman')),
  },
  {
    // (only when the round from the gun left the battery standing)
    id: 'finish', title: 'Finish the dump', skipIf: (T) => targetDown(T, 'pov'),
    text: (T) => { const t = T.sim.targetById(POV_SITE); return `Close, but it still stands (${Math.round((t?.damage ?? 0) * 100)}% destroyed). Finish it from the console: correct with . if the VB asks, then ROUNDS 3 or more (R), GUNS on SECTION (G), Space.`; },
    goal: 'Destroy the ammunition dump', spot: ['#view', 'rounds', 'gunsel', 'fire', 'pad'],
    done: (T) => targetDown(T, 'pov'),
    demo: (T) => {
      if (!idle(T)) return;
      const r = T.m('pov')?.reports.at(-1);
      if (r?.corr && !r.ok) T.once(`corr${T.m('pov').reports.length}`, () => T.act('correct', { add: r.corr.add, right: r.corr.right }));
      if (T.u.order.rounds < 3) T.act('rounds', { n: 4 });
      T.act('fire', { guns: 'all' });
    },
    limit: 900,
  },
];

// The card at the gun follows the drill: under each step's text, a line read from the gun every refresh (the gunner's
// own `next`, src/ww2/gunner.js): the post the player is at, and the job now, whose it is and its key
const POST = Object.fromEntries(POSTS.map((q) => [q.id, q]));
const live = (T) => {
  const st = G(T);
  if (!st) return 'You are not at the gun: press P to man it.';
  const me = POST[st.post], n = st.next, at = `You are at post ${me.key}, the ${me.en}.`;
  if (!n) return at;
  if (n.wait) return `${at} Now: ${n.text}.`;
  if (n.post === st.post) return `${at} Your job now: ${n.text}: hold ${n.key}.`;
  const q = POST[n.post];
  return st.assist ? `${at} The crew's ${q.en} is at work: ${n.text}.` : `${at} Next: ${n.text}. That is the ${q.en}'s job: press ${q.key} to go there.`;
};
for (const st of steps) {
  if (!['man', 'lay', 'fire', 'commander', 'readback', 'down', 'load', 'prime', 'relay', 'fire2', 'impact', 'help', 'leave'].includes(st.id)) continue;
  const base = st.text;
  st.text = (T) => `${typeof base === 'function' ? base(T) : base}\n\nAT THE GUN: ${live(T)}`;
}

export const WW1_TUTORIALS = [
  {
    id: 'training', name: 'Basic training', unit: UNIT, units: [UNIT], kinds: [KIND], levels: { [KIND]: LEVELS },
    loadout: loadoutOf({ [KIND]: LEVELS }), gunnerFrom: 'man', spotlight: true, noSkip: true, instant: true,
    // after this long without a step's goal met, the card says what holds it (the step's stuck, else this)
    stall: 20, stuck: (T) => (G(T) ? live(T) : problem(T) || null),
    after: { label: 'To battle' },
    blurb: 'How the game is played, step by step: lay the guns from the console, range on the observer\'s reports, fire for effect, then serve a gun in person. With a borrowed battery of two 21 cm Mörser 18, every upgrade fitted.',
    outro: 'That was a borrowed battery: two 21 cm Mörser 18, every upgrade fitted. Your own career starts with a single 10 cm K 17 and its 18 kg shells.\n\nEvery battle pays research points. Research the mortar line (Mörser 16, then Mörser 18), then buy the second gun and the parts with the battery\'s own points, and Julius is yours.',
    setup: (T) => T.ensure('main', MAIN_SITE, MAIN),
    keep: (T) => {
      const p0 = T.u?.pieces[0];
      if (T.life.gunFrom != null && p0 && (p0.firedAt ?? -1) > T.life.gunFrom) {
        T.life.gunFrom = p0.firedAt;
        T.life.gunShots = gunShots(T) + 1;
      }
      if (!T.life.adj0 && povReports(T) && T.u) T.life.adj0 = { ...T.u.order.adj }; // (the aim when the VB first reported)
      if (!T.ms.pov) T.ensure('main', MAIN_SITE, MAIN); // (the laager's call is left once the dump's comes)
      if (T.ms.pov) T.ensure('pov', POV_SITE, POV);
    },
    steps,
  },
];

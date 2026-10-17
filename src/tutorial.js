import { YARD } from './sector.js';
import { setHighlight } from './ui/highlight.js';

// Tutorials: six lessons, each a list of steps run on the scripted range (main.js host.enter:
// sim.newGame({ scripted: true }): no director, nothing spawns on its own, our pieces take no damage, the
// clock is held at 10:00; sim.script places the missions, hostile fire and assaults a lesson needs). A step
// shows an instruction card over the 3D view, pulses the console controls it is about (data-tut names, see
// src/ui/highlight.js) and completes when its done(T) reads true from the sim state; a step without done only
// explains and advances with Next.
//
// Step fields: id, title, text (string or (T) => string), goal (the objective line), hi (data-tut names to
// pulse), enter(T), tick(T, rawDt), done(T), demo(T), limit (sim seconds before autoplay gives up).
// demo(T) performs the step's goal with the commands the console sends (T.act) and the actions main handles
// (T.host), and is called every tick while the step is open in autoplay, so it guards itself with T.once.
// Lesson fields: id, name, blurb, outro, unit (where it starts), units (the keys 1 to 5 that work), setup(T),
// keep(T) (every tick: re-arms a lapsed mission, so a step can never stall).

const STORE = 'drumfire.tutorials';
const yd = (m) => Math.round(m / YARD);

// ---------------------------------------------------------------------------------------------------
// helpers the scripts share
const inFlight = (T, id = T.uid) => T.sim.shells.some((s) => s.alive && s.own && s.unitId === id);
const readyN = (u) => u.pieces.filter((p) => p.state === 'ready').length;
const queued = (u) => u.pieces.some((p) => p.rounds > 0);
const shots = (T) => T.u.stats.rounds - (T.mem.r0 ?? 0); // rounds fired by the unit since the step began
const target = (T, key = 'main') => {
  const m = T.m(key);
  return m?.targetId ? T.sim.targetById(m.targetId) : null;
};
// destroyed, or the mission closed as done (a battery is silenced before its last gun burns)
const targetDown = (T, key = 'main') => {
  const t = target(T, key);
  return (!!t && !t.alive) || !!T.life.closed[key];
};
const taken = (T, key = 'main') => !!T.m(key) && T.u.missionId === T.m(key).id;
// the dead-reckoned "has the gun a round to go": loaded or loading something worth firing
const idle = (T) => !inFlight(T) && !queued(T.u);
// the pieces that have fired, or are set to fire, since the step began (or since `T.mem.rt`, set when a wrong
// number of guns fired and the player is asked to try again): the GUNS selector's work
const sinceT = (T) => T.mem.rt ?? T.mem.t0 ?? 0;
const gunsUsed = (T) => T.u.pieces.filter((p) => p.state !== 'dead' && (p.firedAt >= sinceT(T) || p.rounds > 0)).length;
const gunsLive = (T) => T.u.pieces.filter((p) => p.state !== 'dead').length;
// what the GUNS selector calls "every gun" on this unit: BATTERY for the four 6-inch, SECTION for a pair
const allGuns = (T) => ((T.u?.pieces.length ?? 1) > 2 ? 'BATTERY (all four guns)' : 'SECTION (both guns)');

// the adjustment (metres, as order.adj) that would carry the unit's rounds onto the German battery B1: read
// from where its last bursts fell, the way the player reads the numbered marks on the board
const counterNeed = (T) => {
  const b = T.sim.targetById('B1'), u = T.u, t = u.order.target;
  const f = T.life.fall.filter((q) => q.unitId === u.id).slice(-6);
  if (!b || !t || !f.length) return null;
  const dx = t.x - u.pos.x, dz = t.z - u.pos.z, r = Math.hypot(dx, dz) || 1, fx = dx / r, fz = dz / r;
  let add = 0, right = 0;
  for (const q of f) {
    const ex = b.pos.x - q.x, ez = b.pos.z - q.z;
    add += q.adj.add + ex * fx + ez * fz;
    right += q.adj.right - ex * fz + ez * fx;
  }
  return { add: add / f.length, right: right / f.length };
};

// the steps that several lessons share
const takeStep = (o = {}) => ({
  id: o.id ?? 'take',
  title: o.title ?? 'Take the mission',
  text: o.text,
  goal: o.goal ?? 'Press Tab to select the task, then Enter to take it',
  hi: ['missions'],
  done: (T) => taken(T, o.key),
  demo: (T) => T.once('take', () => T.act('mission', { id: T.m(o.key).id })),
});
// a ranging round: one press of Space with GUNS on 1 GUN and ROUNDS at 1; done when exactly one piece fired
const rangeStep = (o = {}) => ({
  id: 'range',
  title: o.title ?? 'A ranging round',
  text: o.text,
  goal: 'Set GUNS to 1 GUN and press Space to fire one ranging round',
  hi: ['gunsel', 'fire', 'guns'],
  done: (T) => shots(T) >= 1 && gunsUsed(T) === 1,
  tick: (T) => {
    // more than one gun fired: a battery, not a ranging round; say so and count again from here
    if (gunsUsed(T) > 1 && gunsLive(T) > 1 && !T.mem.said) {
      T.mem.said = true;
      T.mem.rt = T.sim.time + 0.01;
      T.hint('That was more than one gun. Ranging is done with ONE gun: set 1 GUN (G) and fire again.');
    }
  },
  demo: (T) => T.once('fire', () => T.act('fire', { guns: 1 })),
});
const reportStep = (o = {}) => ({
  id: 'report',
  title: o.title ?? 'Fall of shot',
  text: o.text,
  goal: o.goal ?? 'Wait for the observer\'s report',
  hi: ['pad', 'board'],
  done: (T) => T.rep.n >= 1,
});
// correct as the report says, fire again, until the observer calls it on target
const bracketDemo = (T) => {
  const u = T.u, R = T.rep;
  if (!idle(T) || targetDown(T)) return;
  if (u.stats.rounds - (T.lr0[T.uid] ?? 0) > R.n) {
    // a report is due; if none comes the observer lost the round (the aim has strayed far from the target): come back half way
    if (T.sim.time - u.lastShot < 40) return;
    T.once(`lost${u.stats.rounds}`, () => T.act('correct', { add: -u.order.adj.add / 2, right: -u.order.adj.right / 2 }));
    T.lr0[T.uid] = u.stats.rounds - R.n;
    R.last = null; // that report's correction is no longer wanted
    return;
  }
  if (R.last && !R.last.ok && !T.corrected()) T.act('correct', { add: R.last.corr.add, right: R.last.corr.right });
  else if (readyN(u) > 0 || u.pieces.some((p) => p.state !== 'dead')) T.act('fire', { guns: 1 });
};
// fire for effect: ROUNDS up, GUNS on the whole battery (the selector goes there by itself once the observer
// says on target or ROUNDS is above 1); done when every live piece is firing
const effectStep = (o = {}) => ({
  id: 'effect',
  title: 'Fire for effect',
  text: o.text,
  goal: o.goal ?? ((T) => `Press R until ROUNDS PER GUN is 4 or more, check GUNS says ${allGuns(T)}, then press Space`),
  hi: ['rounds', 'gunsel', 'fire'],
  done: (T) => (T.u.order.rounds >= 3 && shots(T) >= 1 && gunsUsed(T) >= gunsLive(T)) || targetDown(T),
  tick: (T) => {
    if (T.u.order.rounds >= 3 && shots(T) >= 1 && gunsUsed(T) < gunsLive(T) && !T.mem.said) {
      T.mem.said = true;
      T.hint('Only some of the guns fired. Set the selector to the whole battery (G) and press Space again.');
    }
  },
  demo: (T) => {
    T.once('rounds', () => T.act('rounds', { n: o.n ?? 6 }));
    if (T.u.order.rounds >= 3) T.once('fire', () => T.act('fire', { guns: 'all' }));
  },
});
const killStep = (o = {}) => ({
  id: 'kill',
  title: o.title ?? 'Target destroyed',
  text: o.text,
  goal: o.goal ?? 'Destroy the target',
  hi: ['guns', 'board'],
  done: (T) => targetDown(T, o.key),
  tick: (T) => {
    // the guns fell silent and it still stands: say so, and the demo fires again
    if (!T.mem.said && idle(T) && T.sim.time - (T.mem.t0 ?? 0) > 20 && shots(T) > 0 && !targetDown(T, o.key)) {
      T.mem.said = true;
      T.hint('It still stands. Fire again.');
    }
  },
  demo: (T) => {
    if (!idle(T)) return;
    if (T.rep.last && !T.rep.last.ok && !T.corrected()) T.act('correct', { add: T.rep.last.corr.add, right: T.rep.last.corr.right });
    if (T.u.order.rounds < 3) T.act('rounds', { n: o.n ?? 6 });
    T.act('fire', { guns: 'all' });
  },
});

// ---------------------------------------------------------------------------------------------------
// the lessons
export const TUTORIALS = [
  {
    id: 'basics',
    name: 'The basics',
    unit: 1,
    units: [1, 2, 3, 4, 5],
    blurb: 'The screen, the five units, the camera and the console. Then watch the 15-inch load and fire, and ride its shell.',
    outro: 'That is the whole loop: take a task, load, fire, watch. The next lessons teach you to hit what you aim at.',
    setup: (T) => {
      // Group has already laid Granny on a pillbox, so she loads while the player reads
      T.ensure('main', 'M2', { observer: 'foo', title: 'Pillbox "Potsdam"', firstError: { over: 0, right: 0 } });
      T.act('mission', { id: T.m().id });
    },
    keep: (T) => T.ensure('main', 'M2', { observer: 'foo', title: 'Pillbox "Potsdam"', firstError: { over: 0, right: 0 } }),
    steps: [
      {
        id: 'welcome',
        title: 'The Heavy Artillery Group',
        text: 'Ypres, autumn 1917. You command five units, from a 15-inch howitzer to a railway gun. The left half of the screen is the unit you have selected; the right half is its fire control console. This range is quiet and the sun is up, so take your time.',
        hi: ['header'],
      },
      {
        id: 'camera',
        title: 'Look round the gun',
        text: 'Hold the left mouse button in the 3D view and drag to walk the camera round the howitzer. The wheel zooms. C lets the camera roam (WASD to move); C again brings it back.',
        goal: 'Drag, or use the wheel',
        enter: (T) => {
          T.mem.cam = T.host.cam();
        },
        done: (T) => {
          const c = T.host.cam();
          return Math.abs(c.yaw - T.mem.cam.yaw) > 0.3 || Math.abs(c.dist - T.mem.cam.dist) > 6;
        },
        demo: (T) => T.once('cam', () => T.host.nudgeCam()),
      },
      {
        id: 'units',
        title: 'Five units',
        text: 'Keys 1 to 5 select a unit, and so do the tabs above the console: the 15-inch, the 9.2s, the 6-inch battery, the 60-pounders and the railway gun. Units you are not at go on fighting under their own crews, in whatever mode you left them.',
        goal: 'Press 3 to visit the 6-inch battery, then 1 to come back',
        hi: ['tabs'],
        tick: (T) => {
          if (T.host.selectedId() === 3) T.mem.left = true;
        },
        done: (T) => !!T.mem.left && T.host.selectedId() === 1,
        demo: (T) => {
          if (!T.mem.left) T.once('go', () => T.host.select(3));
          else if (T.sim.time - T.mem.t0 > 2) T.once('back', () => T.host.select(1));
        },
      },
      {
        id: 'board',
        title: 'The board and the tasks',
        text: 'The artillery board is a trench map: our lines are blue, theirs red. Click it to lay the guns on a point, or click a target to take its mission. The MISSIONS card lists the calls for fire from the observers; Tab walks the list and Enter takes one. Group has already given Granny a task.',
        hi: ['board', 'missions'],
      },
      {
        id: 'order',
        title: 'The fire order and the guns',
        text: 'The FIRE ORDER card gives the line, range in yards, elevation, charge, fuze and rounds. THE GUNS shows each piece through its drill. The MODE switch: AUTO lets the crew fire on its own, MANUAL only on your word, HOLD is cease fire.',
        hi: ['order', 'guns', 'mode'],
      },
      {
        id: 'time',
        title: 'Time compression',
        text: 'A 15-inch takes nearly a minute to load. Press ] to run time faster, up to eight times, and [ to slow it again. The buttons by the clock do the same, and clicking the readout returns to normal speed.',
        goal: 'Speed time up with ]',
        hi: ['timescale'],
        done: (T) => T.host.scale() > 1,
        demo: (T) => T.once('scale', () => T.host.setScale(4)),
      },
      {
        id: 'load',
        title: 'Loading a 15-inch',
        text: 'Watch the crew. The gun comes down to loading elevation, the breech swings open, the crane lifts a 1,400 pound shell and swings it over the tray, the rammer drives it home, the cartridge bags follow and the breech closes. She is ready when the READY lamp lights.',
        goal: 'Wait until the gun is loaded and laid',
        hi: ['guns'],
        limit: 600,
        done: (T) => readyN(T.u) > 0,
      },
      {
        id: 'fire',
        title: 'Fire!',
        text: 'Press Space, or click the FIRE key. The crew cover their ears and the gun runs back on its slide. Stand clear.',
        goal: 'Fire the gun',
        hi: ['fire'],
        enter: (T) => T.host.setScale(1),
        done: (T) => shots(T) >= 1,
        demo: (T) => T.once('fire', () => T.act('fire')),
      },
      {
        id: 'ride',
        title: 'Ride the shell',
        text: 'Press F now to ride the shell up through the cloud and down onto the target. The flight takes about forty seconds. F again, a unit key or C brings you back to the gun.',
        goal: 'Press F while the shell is in flight',
        tick: (T) => {
          if (inFlight(T)) T.mem.saw = true;
          if (T.host.following()) T.mem.f = true;
          // it fell before the player rode it: another round
          if (T.mem.saw && !T.mem.f && !inFlight(T) && T.sim.time - T.mem.t0 > 5) {
            T.hint('The shell has landed. Fire again, and press F while it flies.');
            T.goto('fire');
          }
        },
        done: (T) => !!T.mem.f && !T.host.following() && !inFlight(T),
        demo: (T) => {
          if (inFlight(T)) T.once('ride', () => T.host.follow());
        },
      },
      {
        id: 'end',
        title: 'Well fired',
        text: 'That is the loop: take a task, load, fire, watch the burst. The shell fell wherever the lay put it, and that is the next problem: the first round of a new lay is always wrong. Lesson two teaches how to put it right.',
      },
    ],
  },

  {
    id: 'ranging',
    name: 'Ranging with the F.O.O.',
    unit: 3,
    units: [3],
    blurb: 'The 6-inch battery on a hostile battery: take the task, a ranging round, the observer\'s telephone report, corrections, fire for effect.',
    outro: 'Range first, then fire for effect: the first round of a fresh lay is never right. Next, the aeroplane observer and the clock code.',
    keep: (T) => T.ensure('main', 'B1', { observer: 'foo', title: 'Hostile battery 1', firstError: { over: -150, right: 60 } }),
    steps: [
      {
        id: 'brief',
        title: 'A call for fire',
        text: 'A forward observer in the front trench has found a hostile battery and telephones for fire. Ginger, four 6-inch howitzers, will do the work. The method is old and sound: range with single rounds until the observer says on target, then fire for effect.',
        hi: ['header'],
      },
      takeStep({
        text: 'The call is on the MISSIONS card. Press Tab to put the cursor on it, then Enter to take it. The crew lays all four guns on the target at once.',
      }),
      {
        id: 'order',
        title: 'Read the fire order',
        text: 'The FIRE ORDER card now shows the target reference, the line in degrees and minutes, the range in yards, the elevation from the range table and the charge. The board draws the line of fire. ROUNDS is 1: a ranging round.',
        hi: ['order', 'board', 'rtab'],
      },
      {
        id: 'guns',
        title: 'Which guns fire',
        text: 'A battery ranges with ONE gun, the directing gun, usually No. 1, so that four shells do not land in four places and confuse the observer. When he says on target, the whole battery fires for effect. The GUNS selector on the order card chooses: 1 GUN, SECTION (two guns) or BATTERY (all four). Press G, or click it, to cycle. While ranging it sits on 1 GUN by itself, and goes to BATTERY when the observer says on target. The FIRE key says what will fire: FIRE No. 1.',
        hi: ['gunsel', 'fire'],
      },
      rangeStep({
        text: 'The guns load in about twelve seconds. With GUNS on 1 GUN, press Space and No. 1 fires one round as soon as it is ready (if it is not, the next ready gun takes the round). You can run time faster with ].',
      }),
      reportStep({
        text: 'The shell takes some time to land. The board marks the fall of shot with a number. Then the observer telephones; his message appears on the pad as a written slip.',
      }),
      {
        id: 'read',
        title: 'Correct the range and line',
        text: (T) =>
          `The slip reads: "${T.rep.last?.text ?? '...'}" ADD means move the next round farther, DROP nearer, LEFT and RIGHT along the line. The pad pencils the correction for you. Press the full stop key or click "apply", or use the arrow keys (X changes the step, Shift makes it 10 yards). CORRECTIONS MADE shows what has been applied.`,
        goal: 'Apply the correction the observer asks for',
        hi: ['pad', 'apply', 'corrections', 'keypad'],
        done: (T) => !!T.rep.last && T.corrected(),
        demo: (T) => T.once(`c${T.rep.n}`, () => T.act('correct', { add: T.rep.last.corr.add, right: T.rep.last.corr.right })),
      },
      {
        id: 'bracket',
        title: 'Bracket the target',
        text: 'Fire again with the same one gun. Each report should bring the round nearer: that is bracketing. Correct, fire, wait for the report, and repeat until the observer says "on target". Usually it takes two or three rounds.',
        goal: 'Get an "on target" report',
        hi: ['fire', 'pad', 'keypad'],
        limit: 500,
        done: (T) => !!T.m()?.reports.some((r) => r.ok) || targetDown(T),
        demo: bracketDemo,
      },
      effectStep({
        text: 'The observer is satisfied. Now all four guns fire together. GUNS has gone to BATTERY by itself (G changes it, FIRE BATTERY says what will fire). Press R until ROUNDS PER GUN is 4 or more (the card says "fire for effect"), then Space. The battery fires in a ripple.',
      }),
      killStep({
        n: 6,
        text: 'Watch the hostile battery go. If the guns fall silent and it still stands, fire again, and apply any correction the observer sends.',
        goal: 'Destroy the hostile battery',
      }),
    ],
  },

  {
    id: 'clockcode',
    name: 'The aeroplane and the clock code',
    unit: 2,
    units: [2],
    blurb: 'The 9.2-inch section with an R.F.C. observer: the wireless message and decoding its clock code into a correction.',
    outro: 'Letter for distance, number for the hour, twelve at true north: that is all the code. The observer in the air sees what the trench cannot.',
    keep: (T) => T.ensure('main', 'B2', { observer: 'air', title: 'Hostile battery 2', firstError: { over: -150, right: 0 } }),
    steps: [
      {
        id: 'brief',
        title: 'Eyes in the sky',
        text: 'An aeroplane of the Royal Flying Corps is over a hostile battery. He cannot telephone, so he sends the fall of shot by wireless in the clock code. Mother, a section of two 9.2-inch howitzers, will answer him.',
        hi: ['header'],
      },
      {
        id: 'code',
        title: 'The clock code',
        text: 'Imagine the target at the centre of a clock face, with twelve o\'clock at TRUE NORTH, not along the line of fire. The letter gives the distance of the burst from the target: Y 10 yards, Z 25, A 50, B 100, C 200, D 300, E 400, F 500. The number is the hour. "B 3" is 100 yards east. The message pad shows the code and the correction.',
        hi: ['pad'],
      },
      takeStep({
        text: 'Take the task on the MISSIONS card: Tab, then Enter. The section lays both guns. They load slowly, about twenty-five seconds.',
      }),
      rangeStep({
        text: 'Fire one ranging round with Space. The GUNS selector is on 1 GUN (FIRE No. 1): a section ranges with one gun, and fires both for effect. Time of flight is half a minute or more, then the aeroplane has to watch, code and send.',
      }),
      reportStep({
        title: 'The wireless message',
        text: 'The message arrives on the pad as a slip, such as "D 9", with the correction written beneath it. Aeroplane messages come a little later than a telephone call.',
        goal: 'Wait for the aeroplane\'s message',
        hi: ['pad'],
      }),
      {
        id: 'decode',
        title: 'Decode it',
        text: (T) => {
          const r = T.rep.last;
          return `The message is ${r?.clock ? `"${r.clock}"` : 'on the pad'}. Read the hour as the direction from the target. The guns are to the west, so a burst west of the target (hours 7 to 11) fell SHORT and wants ADD; east of it (hours 1 to 5) fell OVER and wants DROP; north and south mean LEFT or RIGHT. The letter says how many yards. The pad pencils the answer; the full stop key applies it.`;
        },
        goal: 'Apply the correction from the code',
        hi: ['pad', 'apply', 'keypad'],
        done: (T) => !!T.rep.last && T.corrected(),
        demo: (T) => T.once(`c${T.rep.n}`, () => T.act('correct', { add: T.rep.last.corr.add, right: T.rep.last.corr.right })),
      },
      {
        id: 'bracket',
        title: 'Walk it in',
        text: 'Fire again and decode the next message. The circles shrink as you close in; the aeroplane calls "on target" at A (50 yards) or better. A letter Y or Z is excellent.',
        goal: 'Get a message of A or better',
        hi: ['fire', 'pad'],
        limit: 600,
        done: (T) => !!T.m()?.reports.some((r) => r.ok) || targetDown(T),
        demo: bracketDemo,
      },
      effectStep({
        n: 4,
        text: 'Fire for effect. Mother is a section of two 9.2-inch howitzers, so here the whole unit is SECTION: GUNS has gone there by itself. Press R until ROUNDS PER GUN is 4 or more, then Space, and both guns fire their series; each shell weighs 290 pounds.',
      }),
      killStep({
        n: 4,
        text: 'Watch the hostile battery. If it still stands, correct from the aeroplane\'s next message and fire again.',
        goal: 'Destroy the hostile battery',
      }),
    ],
  },

  {
    id: 'heavy',
    name: 'The heavies',
    unit: 1,
    units: [1, 5],
    blurb: 'Granny, the 15-inch, on a concrete pillbox with the delay fuze and the long flight; then Wolfe, the 18-inch railway gun, on the railhead.',
    outro: 'Delay fuzes for concrete, the biggest guns for the deepest targets. Counter-battery work is next.',
    keep: (T) => {
      T.ensure('main', 'M1', { observer: 'foo', title: 'Pillbox "Iberian"', firstError: { over: -70, right: 30 } });
      if (T.mem.rail) T.ensure('rail', 'R1', { observer: 'map', title: 'Railhead', firstError: { over: 0, right: 0 } });
    },
    steps: [
      {
        id: 'brief',
        title: 'Pillboxes',
        text: 'The Germans hold the ridge with concrete blockhouses, called pillboxes. A shell that bursts on the surface throws earth and little else. Granny, the 15-inch, fires a shell of 1,400 pounds, and with the right fuze it will go through the roof.',
        hi: ['header'],
      },
      takeStep({ text: 'A forward observer reports the pillbox "Iberian". Press Tab, then Enter, to take the task.' }),
      {
        id: 'fuze',
        title: 'The delay fuze',
        text: 'The fuze selector offers 106, the instantaneous fuze for open ground and wire, and DELAY, which lets the shell bury itself before it bursts. Concrete wants DELAY.',
        goal: 'Set the fuze to DELAY (Z cycles it)',
        hi: ['fuze'],
        done: (T) => T.u.order.fuze === 'delay',
        demo: (T) => T.once('fuze', () => T.act('fuze', { fuze: 'delay' })),
      },
      {
        id: 'load',
        title: 'The crane cycle',
        text: 'Granny has one gun and a long drill. The tray tilts down, the crane lifts the shell from the stack and swings it round, the rammer drives it home, then the bags go in. Run time faster with ] if you wish; watching the crane from the side is worth the minute.',
        goal: 'Wait until the gun is loaded and laid',
        hi: ['guns'],
        limit: 600,
        done: (T) => readyN(T.u) > 0,
      },
      {
        id: 'fire',
        title: 'Fire',
        text: 'Space. The muzzle blast of a 15-inch throws dust across the whole gun pit.',
        goal: 'Fire the gun',
        hi: ['fire'],
        enter: (T) => T.host.setScale(1),
        done: (T) => shots(T) >= 1,
        demo: (T) => T.once('fire', () => T.act('fire')),
      },
      {
        id: 'ride',
        title: 'The long flight',
        text: 'The shell climbs for most of the flight and takes the better part of a minute. Press F to ride it, and watch it come down.',
        goal: 'Press F while the shell is in flight',
        tick: (T) => {
          if (inFlight(T)) T.mem.saw = true;
          if (T.host.following()) T.mem.f = true;
          if (T.mem.saw && !T.mem.f && !inFlight(T) && T.sim.time - T.mem.t0 > 5) T.mem.f = true; // too late for the ride; go on
        },
        done: (T) => !!T.mem.f && !T.host.following() && !inFlight(T),
        demo: (T) => {
          if (inFlight(T)) T.once('ride', () => T.host.follow());
        },
      },
      {
        id: 'result',
        title: 'Has it gone?',
        text: 'The observer reports the fall of shot on the pad. A pillbox is a small target and a hard one: if it still stands, apply his correction and fire again with the delay fuze.',
        goal: 'Destroy the pillbox',
        hi: ['pad', 'fire'],
        limit: 900,
        done: (T) => targetDown(T),
        demo: (T) => {
          if (!idle(T)) return;
          if (T.rep.last && !T.rep.last.ok && !T.corrected()) T.act('correct', { add: T.rep.last.corr.add, right: T.rep.last.corr.right });
          T.act('fire');
        },
      },
      {
        id: 'wolfe',
        title: 'Wolfe',
        text: 'Number 5 is Wolfe, an 18-inch howitzer on a railway car, firing from a curved spur: a shell of 2,500 pounds. (A what-if gun: the real one was not proved until after the war.) She reaches deeper than any other gun in the Group. Press 5 to go to her.',
        goal: 'Press 5',
        hi: ['tabs'],
        enter: (T) => {
          T.mem.rail = true;
          T.manual(5);
          T.sim.script?.train?.();
        },
        done: (T) => T.host.selectedId() === 5,
        demo: (T) => T.once('sel', () => T.use(5)),
      },
      takeStep({
        id: 'take-rail',
        key: 'rail',
        title: 'The railhead',
        text: 'A train has stopped at the railhead behind the German lines, 16,000 yards away. Too far for anything but Wolfe, and no observer can see it, so it is a map shoot: no reports, just a good map reference. Tab, Enter.',
      }),
      {
        id: 'fire-rail',
        title: 'Deep fire',
        text: 'Wolfe is slower still, about a minute and a half to load. Press Space; she fires when ready. Press F to ride her shell the whole way.',
        goal: 'Fire Wolfe',
        hi: ['fire'],
        limit: 600,
        done: (T) => shots(T) >= 1 && !inFlight(T),
        demo: (T) => {
          T.once('fire', () => T.act('fire'));
          if (inFlight(T)) T.once('ride', () => T.host.follow());
        },
      },
    ],
  },

  {
    id: 'counter',
    name: 'Counter-battery',
    unit: 3,
    units: [3, 4],
    blurb: 'German shells walk onto your guns. Go quiet with HOLD, then answer with the 60-pounders on the sound rangers\' reference.',
    outro: 'Every round you fire is heard. Fall silent to be forgotten, and hit the enemy guns while they are busy looking for you.',
    setup: (T) => {
      T.ensure('main', 'D1', { observer: 'map', title: 'Ammunition dump', firstError: { over: 0, right: 0 } });
    },
    keep: (T) => T.ensure('main', 'D1', { observer: 'map', title: 'Ammunition dump', firstError: { over: 0, right: 0 } }),
    steps: [
      {
        id: 'brief',
        title: 'Heard and seen',
        text: 'The Germans find our batteries by the flash and by sound ranging. The more you fire, the better they know where you are. THE GUNS card has a bar: ENEMY HAS LOCATED US. When it fills, their guns come looking.',
        hi: ['guns'],
      },
      {
        id: 'noise',
        title: 'Make some noise',
        text: 'Group has given Ginger a dump to bombard and the guns are laid. Press Space and the four howitzers fire in a ripple. Watch the bar climb.',
        goal: 'Fire the battery',
        hi: ['fire', 'guns'],
        enter: (T) => {
          T.act('mission', { id: T.m().id });
          T.act('rounds', { n: 3 });
        },
        done: (T) => shots(T) >= 4,
        demo: (T) => T.once('fire', () => T.act('fire', { guns: 'all' })),
      },
      {
        id: 'incoming',
        title: 'Counter-battery fire',
        text: 'A German battery has been listening. Hear that? The first rounds fall about 500 yards from you and then walk in, 100 yards a time. Your guns cannot be hurt on this range, but in a real fight they could be.',
        goal: 'Survive two German bursts',
        enter: (T) => {
          T.life.eb = 0;
          T.ms.cb = T.sim.script?.hostile?.('B1', { at: 3, interval: 12, start: 450, walk: 90 }) ?? null;
        },
        limit: 300,
        done: (T) => T.life.eb >= 2,
      },
      {
        id: 'hold',
        title: 'Go quiet',
        text: 'The cure is silence. Click HOLD on the MODE switch: the crews cease fire and stand down. A battery on hold fades from the enemy\'s record much faster than one that is firing.',
        goal: 'Click HOLD',
        hi: ['mode'],
        done: (T) => T.u.mode === 'hold',
        demo: (T) => T.once('hold', () => T.act('mode', { mode: 'hold' })),
      },
      {
        id: 'silence',
        title: 'Wait it out',
        text: 'Watch the bar fall. When the German battery has nothing to aim at, it stops. Press ] to wait faster.',
        goal: 'Wait until the German fire stops',
        hi: ['guns'],
        limit: 400,
        tick: (T) => {
          // a battery that will not quit is stopped by the script: the lesson never stalls
          if (T.sim.time - T.mem.t0 > 150) T.once('quiet', () => T.sim.script?.quiet?.());
        },
        done: (T) => T.sim.time - Math.max(T.life.lastEB ?? 0, T.mem.t0 + 5) > 20 && !T.sim.shells.some((s) => s.alive && !s.own),
      },
      {
        id: 'sixty',
        title: 'The sixty-pounders',
        text: 'Now the answer. The 60-pounders are far from Ginger and have not been heard. Press 4 to go to Long Tom.',
        goal: 'Press 4',
        hi: ['tabs'],
        enter: (T) => T.manual(4),
        done: (T) => T.host.selectedId() === 4,
        demo: (T) => T.once('sel', () => T.use(4)),
      },
      takeStep({
        key: 'cb',
        title: 'The sound rangers\' reference',
        text: 'The sound rangers have fixed the German battery from the time its report reached their microphones. Their task is on the card as COUNTER-BATTERY with a map reference, and no one is watching the fall of shot. Tab, Enter.',
      }),
      {
        id: 'fire',
        title: 'Fire blind',
        text: 'There will be no reports, and the reference has an error of a few hundred yards. So fire a big series at once: press R until ROUNDS is 8, then Space. GUNS goes to SECTION by itself, so both guns fire. The long, flat 60-pounder trajectory gets there fast.',
        goal: 'Set ROUNDS PER GUN to 4 or more and fire',
        hi: ['rounds', 'fire'],
        limit: 400,
        done: (T) => T.u.order.rounds >= 3 && shots(T) >= 1,
        demo: (T) => {
          T.once('rounds', () => T.act('rounds', { n: 8 }));
          if (T.u.order.rounds >= 3) T.once('fire', () => T.act('fire', { guns: 'all' }));
        },
      },
      {
        id: 'adjust',
        title: 'Correct by eye',
        text: 'Look at the board once the shells have burst. The numbered marks are the fall of shot; the red symbol is the German battery. A sound-ranging reference is never exact, so your rounds fell wide. Move the aim with the arrow keys (X sets the step, Shift makes it 10 yards) until the next series would land on the symbol.',
        goal: 'Correct the aim onto the battery',
        hi: ['board', 'keypad', 'corrections'],
        limit: 400,
        done: (T) => {
          const need = counterNeed(T);
          const a = T.u.order.adj;
          return !!need && (Math.abs(a.add - need.add) < 80 && Math.abs(a.right - need.right) < 80);
        },
        demo: (T) => {
          const need = counterNeed(T), a = T.u.order.adj;
          if (need && idle(T)) T.once(`c${T.life.fall.length}`, () => T.act('correct', { add: need.add - a.add, right: need.right - a.right }));
        },
      },
      {
        id: 'silenced',
        title: 'Cripple the battery',
        text: 'Keep firing, and keep correcting onto the red symbol after every series, until the German battery has lost half its strength. Sixty-pounders are light, so it takes a while: press ] to hurry.',
        goal: 'Cripple the German battery',
        hi: ['guns', 'board'],
        limit: 900,
        done: (T) => {
          const b = T.sim.targetById('B1');
          return !b || !b.alive || b.parts.reduce((n, p) => n + Math.max(0, p.hp), 0) <= b.parts.length * 12; // half its strength gone
        },
        demo: (T) => {
          if (!idle(T)) return;
          const need = counterNeed(T), a = T.u.order.adj;
          if (need) T.act('correct', { add: need.add - a.add, right: need.right - a.right });
          T.act('rounds', { n: 8 });
          T.act('fire', { guns: 'all' });
        },
      },
    ],
  },

  {
    id: 'sos',
    name: 'S.O.S.',
    unit: 3,
    units: [1, 2, 3, 4, 5],
    blurb: 'Red rockets over the front: call the S.O.S., every gun on the line, shrapnel from the 60-pounders, break the attack.',
    outro: 'When the rockets go up, every gun on the S.O.S. line, at once. The infantry in the trench are counting on you.',
    steps: [
      {
        id: 'brief',
        title: 'The S.O.S.',
        text: 'When the Germans attack, our infantry fire red rockets: S.O.S., every gun to the barrage line in front of the trench at once. The front is cut into four sectors, A to D, and the four keys by the header are the S.O.S. for each. A key flashes when its sector is calling.',
        hi: ['sos'],
      },
      {
        id: 'wait',
        title: 'Wait for the rockets',
        text: 'The enemy are massing in Sector B, the Zonnebeke road. Watch the German trench on the board. Press ] if the wait is long.',
        goal: 'Wait for the red rockets',
        hi: ['board', 'sos'],
        enter: (T) => {
          T.life.assault = T.sim.script?.assault?.('B', 1) ?? null;
        },
        limit: 300,
        done: (T) => T.sim.assaults?.some((a) => a.state === 'called'),
      },
      {
        id: 'call',
        title: 'Red rockets!',
        text: 'There they go. The B key is flashing. Press S: it calls the S.O.S. on the alarmed sector, and every unit that can reach lays on the line and opens fire. Do not wait to range; the line is pre-registered.',
        goal: 'Press S (or click the flashing key)',
        hi: ['sos'],
        enter: (T) => {
          T.mem.rounds0 = T.sim.stats.rounds;
          T.life.hint = true;
        },
        done: (T) => T.sim.units.filter((u) => u.alive && u.missionId != null && T.sim.missionById(u.missionId)?.kind === 'sos').length >= 3,
        demo: (T) => T.once('sos', () => T.act('sos', { sector: 'B' })),
      },
      {
        id: 'watch',
        title: 'The barrage',
        text: 'Look at the guns. Press 1 to 5 to visit them: each is firing on the line in its own time, the 15-inch last. The shells burst along the line and in no man\'s land, and German infantry caught there are shredded.',
        goal: 'Wait for the barrage to build (8 rounds)',
        hi: ['guns', 'board'],
        limit: 300,
        done: (T) => T.sim.stats.rounds - (T.mem.rounds0 ?? 0) >= 8,
      },
      {
        id: 'shrapnel',
        title: 'Shrapnel',
        text: 'Against men in the open, shrapnel is better than high explosive: the shell bursts in the air and throws its bullets forward. Only the 60-pounders have it. Press 4, then Z until the fuze is SHRAPNEL.',
        goal: 'On the 60-pounders, select SHRAPNEL',
        hi: ['tabs', 'fuze'],
        done: (T) => T.sim.unitById(4).order.fuze === 'shrapnel',
        demo: (T) => {
          T.once('sel', () => T.use(4));
          T.once('fuze', () => T.act('fuze', { fuze: 'shrapnel' }, 4));
        },
      },
      {
        id: 'break',
        title: 'Break the attack',
        text: 'Keep firing until the German infantry break. Watch the line from the 60-pounders: shrapnel bursts above the wire.',
        goal: 'Wait for the attack to be broken',
        hi: ['board'],
        limit: 400,
        done: (T) => !T.sim.infantry.some((g) => g.side === 'german' && ['forming', 'advancing', 'assault'].includes(g.state)),
      },
      {
        id: 'cease',
        title: 'Cease fire',
        text: 'The attack is broken. The S.O.S. series was long, so the guns are still firing. Backspace is cease fire on the unit you are at; CEASE does the same. Ammunition is dear.',
        goal: 'Press Backspace to cease fire',
        hi: ['cease'],
        done: (T) => !T.u.firing && !queued(T.u),
        demo: (T) => {
          for (const u of T.sim.units) T.act('cease', {}, u.id);
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------
export class Tutorials {
  /**
   * sim: the Sim. hud: the HUD. host: what only main can do: enter(def) (starts the scripted game), leave()
   * (back to the demonstration battle), select(id), selectedId(), cam(), nudgeCam(), scale(), setScale(k),
   * follow() (F), following(), hint(text), frame(dt, draw).
   */
  // defs: the lessons (the British TUTORIALS by default; the WW2 mode passes its own, src/ww2/tutorial.js)
  constructor({ sim, hud, host, defs = TUTORIALS }) {
    this.sim = sim;
    this.hud = hud;
    this.host = host;
    this.defs = defs;
    this.run = null; // the lesson in progress
    this.auto = null;
    this.done = this.load();
    this.card = document.getElementById('tut-card');
    this.q = (s) => this.card.querySelector(s);
    this.buildMenu();
    document.getElementById('tut-back').addEventListener('click', () => this.closeMenu());
    // the card's buttons must not take keyboard focus, or Space would press them instead of the console
    for (const b of this.card.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.preventDefault());
    this.q('#tc-next').addEventListener('click', () => (this.run?.finished ? this.nextLesson() : this.next()));
    this.q('#tc-skip').addEventListener('click', () => (this.run?.finished ? this.start(this.run.def.id) : this.next(true)));
    this.q('#tc-exit').addEventListener('click', () => this.exit());
  }

  get active() {
    return !!this.run;
  }

  get step() {
    return this.run ? this.run.def.steps[this.run.i] ?? null : null;
  }

  get u() {
    return this.sim.unitById(this.uid);
  }

  get script() {
    return this.sim.script ?? null;
  }

  // ---------------------------------------------------------------- the list
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) ?? {};
    } catch (e) {
      return {};
    }
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.done));
    } catch (e) { /* private mode */ }
  }

  buildMenu() {
    const list = document.getElementById('tut-list');
    list.replaceChildren();
    this.items = new Map();
    for (const d of this.defs) {
      const b = document.createElement('button');
      b.className = 'tut-item';
      b.type = 'button';
      b.dataset.id = d.id;
      b.innerHTML = '<span class="ti-mark">✓</span><b></b><i></i>';
      b.querySelector('b').textContent = d.name;
      b.querySelector('b').insertAdjacentHTML('beforeend', `<small>${d.steps.length} steps</small>`);
      b.querySelector('i').textContent = d.blurb;
      b.addEventListener('click', () => this.start(d.id));
      list.append(b);
      this.items.set(d.id, b);
    }
    this.refreshMenu();
  }

  refreshMenu() {
    for (const [id, b] of this.items) b.classList.toggle('done', !!this.done[id]);
  }

  openMenu() {
    this.refreshMenu();
    this.hud.showTutorialMenu(true);
  }

  closeMenu() {
    this.hud.showTutorialMenu(false);
  }

  get menuOpen() {
    return document.body.classList.contains('tut-menu');
  }

  // Esc: a lesson goes back to the list, the list back to the title. True when it was used.
  escape() {
    if (this.run) {
      this.exit();
      return true;
    }
    if (this.menuOpen && document.body.classList.contains('title')) {
      this.closeMenu();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- running a lesson
  start(id) {
    const def = this.defs.find((d) => d.id === id);
    if (!def || !this.sim) return false;
    // a WW2 lesson of another operation is a page load away (the theatre is fixed for the page)
    if (this.host.redirect?.(def)) return false;
    if (this.run) this.stopRun();
    this.hud.showTutorialMenu(false);
    this.host.enter(def);
    this.ms = {}; // lesson missions by key
    this.life = { eb: 0, lastEB: 0, fall: [], closed: {} }; // facts that outlive a step
    this.lr0 = {}; // rounds each unit had fired when the lesson began
    this.log = [];
    this.rep = { n: 0, last: null, base: { add: 0, right: 0 } };
    this.mem = { t0: this.sim.time };
    this.t0 = this.sim.time;
    this.auto = null;
    for (const u of this.sim.units) {
      u.mode = 'hold'; // the scripted range starts every unit on hold; the lesson wakes the ones it uses
      this.lr0[u.id] = u.stats.rounds;
    }
    this.uid = def.unit;
    this.run = { def, i: -1, finished: false, ok: false, doneT: 0, stepT0: this.sim.time };
    this.manual(def.unit);
    this.hud.setTutorial(true);
    def.setup?.(this);
    this.goto(0);
    return true;
  }

  stopRun() {
    setHighlight([]);
    this.script?.quiet?.();
    this.script?.clear?.();
    this.run = null;
    this.auto = null;
  }

  exit() {
    if (!this.run) return;
    this.stopRun();
    this.hud.setTutorial(false);
    this.host.leave();
    this.openMenu();
  }

  goto(i) {
    const run = this.run;
    if (typeof i === 'string') i = run.def.steps.findIndex((s) => s.id === i);
    if (i < 0) return;
    if (i >= run.def.steps.length) return this.finish();
    run.i = i;
    run.ok = false;
    run.doneT = 0;
    run.stepT0 = this.sim.time;
    this.mem = { t0: this.sim.time, r0: this.u?.stats.rounds ?? 0 };
    const step = run.def.steps[i];
    step.enter?.(this);
    setHighlight(step.hi ?? []);
    this.render();
  }

  next(skip = false) {
    const run = this.run;
    if (!run || run.finished) return;
    const step = run.def.steps[run.i];
    if (step.done && !run.ok && !skip) return;
    this.noteStep(step, skip && !run.ok);
    this.goto(run.i + 1);
  }

  noteStep(step, skipped) {
    this.log.push({ id: step.id, title: step.title, sim: Math.round(this.sim.time - this.run.stepT0), skipped: !!skipped });
  }

  nextLesson() {
    const i = this.defs.findIndex((d) => d.id === this.run?.def.id);
    const d = this.defs[i + 1];
    if (d) this.start(d.id);
    else this.exit();
  }

  finish() {
    const run = this.run;
    run.finished = true;
    this.done[run.def.id] = true;
    this.save();
    this.refreshMenu();
    this.script?.quiet?.();
    this.script?.clear?.();
    setHighlight([]);
    this.host.setScale(1);
    this.report = {
      id: run.def.id,
      finished: true,
      simTime: Math.round(this.sim.time - this.t0),
      steps: this.log,
      stalled: this.log.filter((s) => s.skipped).map((s) => s.id),
    };
    this.render();
    this.auto?.resolve?.(this.report);
  }

  // per frame, after the sim has stepped
  update(rawDt) {
    const run = this.run;
    if (!run || run.finished) return;
    const def = run.def;
    const step = def.steps[run.i];
    this.track();
    def.keep?.(this);
    step.tick?.(this, rawDt);
    if (this.auto) this.autoStep(step, rawDt);
    if (this.run !== run || run.finished || run.def.steps[run.i] !== step) return;
    if (step.done && !run.ok && step.done(this)) {
      run.ok = true;
      run.doneT = 0;
      this.render();
    }
    if (run.ok) {
      run.doneT += rawDt;
      if (run.doneT > (this.auto ? 0.2 : 1.3)) this.next();
    }
    // a text that quotes the sim is refreshed a few times a second
    this.textT = (this.textT ?? 0) - rawDt;
    if (this.textT <= 0 && typeof step.text === 'function') {
      this.textT = 0.4;
      this.render();
    }
  }

  // autoplay: demo the step's goal; steps with nothing to do advance on their own; a step that cannot be
  // finished (the sim does not do what the script expects) is skipped and reported, never waited on
  autoStep(step, rawDt) {
    const a = this.auto, run = this.run;
    if (this.host.scale() < a.scale && !step.slow) this.host.setScale(a.scale);
    if (!step.done) {
      a.idle += rawDt;
      if (a.idle > 0.5) {
        a.idle = 0;
        this.next();
      }
      return;
    }
    if (run.ok) return;
    step.demo?.(this);
    if (this.sim.time - run.stepT0 > (step.limit ?? 300)) {
      this.hint(`autoplay: skipped "${step.id}"`);
      this.next(true);
    }
  }

  // ---------------------------------------------------------------- autoplay
  // Plays the running lesson (or starts `id`) unattended with time compression. Returns a promise for the
  // report; autoplaySync drives host.frame itself (no drawing), which is how the tests run it.
  autoplay({ id = null, scale = 6 } = {}) {
    if (id || !this.run) this.start(id ?? this.defs[0].id);
    return new Promise((resolve) => {
      this.auto = { scale, idle: 0, resolve };
      if (this.run.finished) resolve(this.report);
    });
  }

  autoplaySync({ id = null, scale = 6, dt = 0.05, maxFrames = 60000, stopAt = null } = {}) {
    if (id || !this.run) this.start(id ?? this.defs[0].id);
    this.auto = { scale, idle: 0, resolve: null };
    for (let n = 0; n < maxFrames && this.run && !this.run.finished; n++) {
      if (stopAt != null && this.run.i >= stopAt) break;
      this.host.frame(dt, false);
    }
    return this.report && this.run?.finished ? this.report : { id: this.run?.def.id, finished: false, step: this.run?.i, simTime: Math.round(this.sim.time - this.t0), steps: this.log };
  }

  // ---------------------------------------------------------------- the card
  render() {
    const run = this.run;
    if (!run) return;
    const def = run.def;
    const n = def.steps.length;
    const card = this.card;
    card.classList.toggle('ok', run.ok);
    card.classList.toggle('finish', run.finished);
    this.q('.tc-name').textContent = def.name;
    const bar = this.q('.tc-bar i');
    const last = this.defs[this.defs.length - 1] === def;
    if (run.finished) {
      this.q('.tc-step').textContent = 'complete';
      bar.style.width = '100%';
      this.q('.tc-title').textContent = 'Lesson complete';
      this.q('.tc-text').textContent = def.outro;
      this.q('.tc-goal').hidden = true;
      this.q('#tc-exit').textContent = 'Back to menu';
      this.q('#tc-skip').textContent = 'Replay';
      this.q('#tc-skip').hidden = false;
      this.q('#tc-skip').disabled = false;
      const next = this.q('#tc-next');
      next.hidden = last;
      next.disabled = false;
      next.textContent = 'Next lesson';
      return;
    }
    const step = def.steps[run.i];
    this.q('.tc-step').textContent = `step ${run.i + 1} / ${n}`;
    bar.style.width = `${(run.i / n) * 100}%`;
    this.q('.tc-title').textContent = step.title;
    this.q('.tc-text').textContent = typeof step.text === 'function' ? step.text(this) : step.text;
    const goal = this.q('.tc-goal');
    const goalText = typeof step.goal === 'function' ? step.goal(this) : step.goal;
    goal.hidden = !goalText;
    goal.querySelector('span').textContent = goalText ?? '';
    this.q('#tc-exit').textContent = 'Exit';
    const skip = this.q('#tc-skip');
    skip.textContent = 'Skip step';
    skip.hidden = !step.done;
    skip.disabled = false;
    const next = this.q('#tc-next');
    next.hidden = false;
    next.textContent = run.i === n - 1 && !step.done ? 'Finish' : 'Next';
    next.disabled = !!step.done && !run.ok;
  }

  // ---------------------------------------------------------------- script helpers (T)
  hint(text) {
    this.host.hint(text);
  }

  // run fn once per step under a key (the demos call this every tick)
  once(key, fn) {
    this.mem.did ??= new Set();
    if (this.mem.did.has(key)) return false;
    this.mem.did.add(key);
    fn();
    return true;
  }

  // the command the console sends for a button or key (a unit on auto is switched to manual by the sim)
  act(name, args = {}, id = this.uid) {
    return this.sim.command(id, name, args);
  }

  // the unit the lesson is about: select it as the player's key would and wake its crew
  use(id) {
    this.uid = id;
    this.manual(id);
    this.host.select(id);
  }

  manual(id) {
    const u = this.sim.unitById(id);
    if (u && u.mode === 'hold') u.mode = 'manual';
  }

  // the lesson mission under `key`
  m(key = 'main') {
    const m = this.ms?.[key];
    return m ? this.sim.missionById(m.id) ?? null : null;
  }

  // make the mission if it is missing or has lapsed (the keep pattern: a step can never stall)
  ensure(key, site, o) {
    const cur = this.m(key);
    if (this.life.closed[key]) return cur;
    if (cur?.state === 'done') this.life.closed[key] = true;
    if (cur && cur.state !== 'failed') return cur;
    if (!this.script?.mission) {
      if (!this.warned) this.hint('The scripted range is not available in this build.');
      this.warned = true;
      return null;
    }
    const m = this.script.mission(site, { deadline: this.sim.time + 1800, ...o });
    if (m) {
      this.ms[key] = m;
      if (cur) this.hint('The old task lapsed: a new call for fire has come in.');
      if (key === 'main') this.rep = { n: 0, last: null, base: { add: 0, right: 0 } };
    }
    return m;
  }

  // fall-of-shot reports of the lesson's main mission: how many, the last, and what was already applied when it came
  track() {
    const m = this.m('main');
    const n = m?.reports.length ?? 0;
    if (n !== this.rep.n) {
      const o = this.u?.order.adj ?? { add: 0, right: 0 };
      this.rep = { n, last: n ? m.reports[n - 1] : null, base: { add: o.add, right: o.right } };
    }
  }

  // has the correction of the latest report been applied (or none was wanted)
  corrected() {
    const r = this.rep.last;
    if (!r) return false;
    if (r.ok || r.over == null) return true;
    const a = this.u.order.adj;
    return Math.abs(a.add - this.rep.base.add - r.corr.add) < 45 && Math.abs(a.right - this.rep.base.right - r.corr.right) < 45;
  }

  // ---------------------------------------------------------------- events from main
  onBurst(shell, pos, info) {
    if (!this.run || !info) return;
    if (info.own === false) {
      this.life.eb++;
      this.life.lastEB = this.sim.time;
    } else if (shell.unitId != null) {
      const o = this.sim.unitById(shell.unitId)?.order.adj;
      this.life.fall.push({ unitId: shell.unitId, x: pos.x, z: pos.z, adj: { add: o?.add ?? 0, right: o?.right ?? 0 } });
    }
  }
}

// the shared steps and helpers, for the WW2 mode's lessons (src/ww2/tutorial.js)
export const LESSON_KIT = { inFlight, readyN, queued, shots, target, targetDown, taken, idle, gunsUsed, gunsLive, takeStep, rangeStep, reportStep, bracketDemo, effectStep, killStep };

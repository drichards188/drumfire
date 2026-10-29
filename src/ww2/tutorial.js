// The WW2 mode's lessons, run by the same Tutorials class as the British ones (src/tutorial.js) on the scripted
// range of their operation (a lesson of another operation reloads the page there: main's host.redirect). Each step
// has a demo, so `__drumfire.tutorial.autoplaySync({ id })` plays a lesson unattended (that is how they are tested).
import { LESSON_KIT } from '../tutorial.js';

const { shots, targetDown, takeStep, rangeStep, reportStep, effectStep, idle } = LESSON_KIT;
const sp = (T) => T.u?.special;
const stepDone = (T, id) => sp(T)?.steps?.find((s) => s.id === id)?.state === 'done';

// a correction step: apply the observer's pencilled correction (the . key)
const correctStep = (o = {}) => ({
  id: 'correct',
  title: o.title ?? 'Correct the fall of shot',
  text: o.text ?? 'The forward observer (VB) telephones where the round fell, in metres: "weiter 150" (add 150), "kürzer" (drop), "rechts" and "links". The message pad pencils the correction under the slip. Press . (full stop) to apply it, or use the arrow keys yourself.',
  goal: 'Apply the correction (. or the arrow keys)',
  hi: ['pad', 'corrections', 'keypad'],
  done: (T) => T.corrected() || !!T.rep.last?.ok,
  demo: (T) => { const r = T.rep.last; if (r && !r.ok && r.corr) T.once('corr', () => T.act('correct', { add: r.corr.add, right: r.corr.right })); },
});
// the launch drill (src/ww2/special.js LaunchCtl): Enter starts it and the crew carries on by itself; it holds for
// the settings, a fault and the firing key (`hold`)
const startStep = (title, text) => ({
  id: 'start', title, text, goal: 'Press Enter (START THE DRILL)', hi: ['next'],
  done: (T) => !!sp(T).run || sp(T).steps[0].state !== 'todo',
  demo: (T) => T.once('go', () => T.act('step')),
});
const dialStep = (id, key, o) => ({
  id, title: o.title, text: o.text, goal: o.goal, hi: o.hi ?? ['dials'],
  done: (T) => { const s = sp(T); return s.settings[key] != null && Math.abs(key === 'compass' ? ((s.settings[key] - s.solution[key] + 540) % 360) - 180 : s.settings[key] - s.solution[key]) <= (s.tol?.[key] ?? (key === 'compass' ? 0.25 : 0.6)) + 1e-6; },
  demo: (T) => T.once('dial', () => T.act('set', { [key]: sp(T).solution[key] })),
});
const waitFire = (title, text, goal) => ({
  id: 'work', title, text, goal, hi: ['gauges', 'timescale'],
  done: (T) => sp(T).hold === 'fire',
  limit: 900,
});
const followStep = {
  id: 'follow', title: 'Ride it', text: 'Press F to follow the round in flight (F again comes back). On the way out it leaves the map; the ROUNDS card follows it, and what became of it arrives as a report.',
  goal: 'Press F', hi: ['rounds'],
  done: (T) => T.host.following() || T.sim.time - T.mem.t0 > 20,
  demo: (T) => T.once('f', () => T.host.follow()),
};
const resultStep = (wait) => ({
  id: 'result', title: 'The report', text: (T) => sp(T).flights[0]?.state === 'flying' ? wait : `No. 1: ${sp(T).flights[0]?.text ?? ''} The plot shows where it fell.`,
  goal: 'Wait for the report', hi: ['rounds', 'plot'],
  done: (T) => sp(T).flights[0] && sp(T).flights[0].state !== 'flying',
  limit: 900,
});

export const WW2_TUTORIALS = [
  {
    id: 'w-werfer', op: 'flanders', name: 'Der Nebelwerfer', unit: 5, units: [5],
    blurb: 'Six rockets a ripple, a long reload, and a cloud of smoke that gives the battery away. Drench an Allied battery.',
    outro: 'A Nebelwerfer battery hits hard and briefly, then must reload while the enemy looks for its smoke. Move on or go to HOLD when the counter-battery fire comes.',
    setup: (T) => T.ensure('main', 'A1', { observer: 'foo', title: '25-pdr battery "Able"', firstError: { over: -120, right: 80 } }),
    keep: (T) => T.ensure('main', 'A1', { observer: 'foo', title: '25-pdr battery "Able"', firstError: { over: -120, right: 80 } }),
    steps: [
      { id: 'intro', title: 'Three launchers, eighteen tubes', text: 'Each 15 cm Nebelwerfer 41 has six tubes. The crew loads the rockets from behind, connects the igniters and runs to cover; the ripple goes off one tube every 1.6 s. Reloading takes the better part of a minute. Rockets scatter: this is an area weapon.', hi: ['guns'] },
      takeStep({ text: 'Take the call on the 25-pounder battery.' }),
      rangeStep({ title: 'One launcher\'s ripple', text: 'Range with one launcher: GUNS on 1 GUN. A "round" is the whole ripple of six.' }),
      reportStep({ text: 'The VB reports the centre of the ripple.' }),
      correctStep(),
      effectStep({ n: 3, goal: 'Press R until ROUNDS is 3 (three ripples a launcher), check GUNS says BATTERY, then press Space' }),
      {
        id: 'drench', title: 'Drench it', text: (T) => { const t = T.sim.targetById('A1'); return `Keep the ripples coming until the battery is badly hit (now ${Math.round((t?.damage ?? 0) * 100)}% destroyed). Watch your own smoke: every ripple tells the enemy where you are.`; },
        goal: 'Wreck half the battery (fire again whenever the launchers are reloaded)', hi: ['fire', 'guns'],
        done: (T) => (T.sim.targetById('A1')?.damage ?? 0) >= 0.45 || targetDown(T),
        demo: (T) => { if (T.u.pieces.some((p) => p.state === 'ready') && !T.u.pieces.some((p) => p.rounds > 0)) T.act('fire', { guns: 'all' }); },
        limit: 900,
      },
    ],
  },
  {
    id: 'w-gustav', op: 'sevastopol', name: 'Gustav: railway preparation', unit: 1, units: [1, 2],
    blurb: 'Build the 80 cm Gustav on its firing curve with the work gangs and the gantry cranes, then fire a 4.8 t shell at Fort Stalin.',
    outro: 'The Gustav has only a handful of shells. Spend each one on the hardest target in reach, with the delay fuze.',
    steps: [
      { id: 'welcome', title: 'The firing curve', text: 'The Gustav arrives in pieces. Before it can fire, the position must be surveyed, the curved double track laid, the gantry cranes raised, the gun assembled and the ammunition train brought up. The PREPARATION card lists the tasks; the + and - put work gangs on them.', hi: ['special'] },
      {
        id: 'gang', title: 'Put the gangs to work', text: 'Three work gangs. A task that waits for another is greyed out. Start with the survey.', goal: 'Put a gang on the survey (+)', hi: ['special'],
        done: (T) => sp(T).tasks.find((t) => t.id === 'survey').gangs > 0 || stepDone(T, 'survey'),
        demo: (T) => T.once('g', () => T.act('gang', { task: 'survey', d: 1 })),
      },
      {
        id: 'build', title: 'Build it', text: (T) => `Keep the gangs busy (ALL HANDS, or J, puts them on the critical path) and speed time up with ]. Assembly ${Math.round((sp(T)?.assembly ?? 0) * 100)}%.`,
        goal: 'Finish the preparation: the gun reports Feuerbereit', hi: ['special', 'timescale'],
        done: (T) => !!sp(T)?.ready,
        demo: (T) => { T.once('h', () => T.act('hurry')); T.once('s', () => T.host.setScale(8)); },
        limit: 1500,
      },
      {
        id: 'task', title: 'Fort Stalin', text: 'The Storch spotter has the fort. Take the task: the gun shunts slowly along its curve onto the line, then loads (the hoist, the 4.8 t shell, the charges). The delay fuze is set for concrete.',
        hi: ['missions'],
        enter: (T) => T.ensure('main', 'G2', { observer: 'air', title: 'Fort Stalin', firstError: { over: 70, right: -30 } }),
        done: (T) => T.u.missionId === T.m('main')?.id,
        demo: (T) => T.once('take', () => T.act('mission', { id: T.m('main').id })),
      },
      {
        id: 'fire', title: 'Fire', text: 'When the gun reports READY, press Space. A round costs minutes: time compression helps.', goal: 'Fire one round', hi: ['fire'],
        done: (T) => shots(T) >= 1,
        demo: (T) => { T.once('s', () => T.host.setScale(8)); if (T.u.pieces[0].state === 'ready') T.once('f', () => T.act('fire')); },
        limit: 900,
      },
      followStep,
      reportStep({ text: 'The Storch radios the fall of shot. Correct before the next precious round.' }),
    ],
  },
  {
    id: 'w-karl', op: 'karl', name: 'Karl-Gerät', unit: 1, units: [1, 2],
    blurb: 'Drive the 124 t mortar into a firing position, turn the whole vehicle onto the target, lower the hull and fire a 2.2 t shell at the Terespol gate.',
    outro: 'The Karl must be emplaced, turned and lowered for every new line, and its carrier brings four shells a trip. Displace when the fortress guns find you.',
    steps: [
      { id: 'welcome', title: 'Thor', text: 'The 60 cm Karl "Thor" stands on the approach road. It has only 4 degrees of traverse each way, so the whole vehicle is the coarse laying; it must lower its hull onto the ground before it fires. The KARL card has the positions, TURN (T), LOWER and RAISE (L) and the ammunition carrier (Y).', hi: ['special'] },
      {
        id: 'drive', title: 'Into position', text: 'Pick a firing position: A is covered, B is open but reaches the gate, C reaches the Eastern Fort.', goal: 'Click STELLUNG A or B and wait for the Karl to arrive', hi: ['special'],
        done: (T) => !!sp(T).posId,
        demo: (T) => { T.once('go', () => T.act('goto', { id: 'b' })); T.once('s', () => T.host.setScale(8)); },
        limit: 600,
      },
      {
        id: 'take', title: 'The Terespol gate', text: 'Take the task on the gate. If the line is outside the 4 degrees the order card says so.', hi: ['missions'],
        enter: (T) => T.ensure('main', 'K2', { observer: 'foo', title: 'Terespol gate', firstError: { over: 40, right: 25 } }),
        done: (T) => T.u.missionId === T.m('main')?.id,
        demo: (T) => T.once('take', () => T.act('mission', { id: T.m('main').id })),
      },
      {
        id: 'turn', title: 'Turn the vehicle', text: 'TURN (T) steers the whole Karl onto the laid line.', goal: 'Press T and wait until the line is in the arc', hi: ['special'],
        done: (T) => T.u.order.why !== 'out of arc' && sp(T).stage === 'emplace',
        demo: (T) => { if (sp(T).stage === 'emplace' && T.u.order.why === 'out of arc') T.act('pivot'); },
        limit: 300,
      },
      {
        id: 'lower', title: 'Hull down', text: 'LOWER (L) lets the hull down onto the ground so the recoil goes into the earth, not the running gear.', goal: 'Press L', hi: ['special'],
        done: (T) => sp(T).lower >= 1,
        demo: (T) => T.once('l', () => T.act('lower')),
        limit: 300,
      },
      {
        id: 'fire', title: 'Fire', text: 'The Munitionsschlepper\'s crane lifts the shell onto the tray; the barrel comes down to load and goes back up to 55 to 70 degrees. When READY, press Space.', goal: 'Fire one round', hi: ['fire'],
        done: (T) => shots(T) >= 1,
        demo: (T) => { if (T.u.pieces[0].state === 'ready') T.once('f', () => T.act('fire')); },
        limit: 600,
      },
      reportStep({ text: 'The VB reports the fall of shot. A hit within a few tens of metres breaks the gate.' }),
    ],
  },
  {
    id: 'w-v1', op: 'v1', name: 'V-1: the launch drill', unit: 1, units: [1],
    blurb: 'Prepare a flying bomb at its Walter ramp: compass, air log, fuel, the steam generator, and the catapult.',
    outro: 'The crew works the drill; you set it, decide its faults, take cover from the bombers and fire. The game scores the drill and whether the missile reached the target area.',
    steps: [
      { id: 'welcome', title: 'The launch site', text: 'A launch site in the woods. The LAUNCH DRILL card shows the step in hand and what the crew is doing. The big key always says what to do next; Enter (or Space) presses it. Faults and air raids are switched off on this range.', hi: ['drill', 'next'] },
      startStep('From the store', 'Press Enter: the crew brings the missile out of the store and fits its wings, then carries on step by step by itself. It stops only where it needs you.'),
      dialStep('compass', 'compass', { title: 'The compass', text: 'The drill stops at the Richthaus, where the master compass is set to the course. FIRING DATA gives the bearing: dial COMPASS with the left and right arrows (Shift: whole degrees) until it says MATCH. The cross on the plot shows where the setting sends the round: a degree off is almost 3 km off at the target.', goal: 'Dial the compass to the firing data (MATCH)', hi: ['dials', 'plot'] }),
      dialStep('airlog', 'range', { title: 'The air log', text: 'A small propeller on the nose counts the air distance flown, then puts the missile into its dive. A tailwind carries it further over the ground, so the log is set short of the ground range; a headwind, long. FIRING DATA has the figure: dial AIR LOG with the up and down arrows (Shift: 10 km).', goal: 'Dial the air log to the firing data (MATCH)', hi: ['dials', 'data'] }),
      waitFire('The crew at work', 'Onto the sled, petrol and compressed air, the steam generator, the fuzes, then everyone into the bunker. Watch the INSTRUMENTS: the steam generator\'s test pressure must stand above the red line, or the catapult throws the missile off too slowly. ] speeds time up.', 'Wait until the big key says FIRE'),
      {
        id: 'launch', title: 'Abschuß', text: 'The pulse jet starts on compressed air and a spark and runs up to full power; then the steam generator fires and the piston throws the missile up the ramp at about 400 km/h.', goal: 'Press Enter: FIRE', hi: ['next'],
        done: (T) => sp(T).flights.length >= 1,
        demo: (T) => { if (!sp(T).doing) T.once('fire', () => T.act('step')); },
      },
      followStep,
      resultStep('Waiting for the report on the flight...'),
    ],
  },
  {
    id: 'w-v2', op: 'v2', name: 'V-2: the A4 drill', unit: 1, units: [1],
    blurb: 'Erect the A4 on its firing table, align it, set the cut-off, fuel it (the liquid oxygen boils away) and launch.',
    outro: 'Nothing can stop the A4 in flight; all the crew can do is make it hit. Mind the oxygen: below 92% the rocket falls short.',
    steps: [
      { id: 'welcome', title: 'A mobile battery', text: 'A clearing in the woods. The Meillerwagen brings the rocket; the firing table takes it upright. The LAUNCH DRILL card shows the step in hand; the big key says what to do next, and Enter presses it. Faults and raids are off on this range.', hi: ['drill', 'next'] },
      startStep('Erect', 'Press Enter: the Meillerwagen\'s hydraulic arm raises the 14 m rocket onto the firing table, and the crew carries on until it needs you.'),
      dialStep('align', 'compass', { title: 'Align the table', text: 'The table turns so the rocket\'s fin I lies on the line of fire. Dial TABLE BEARING to the firing data with the left and right arrows (Shift: whole degrees); the TABLE BEARING instrument follows the table as it turns.', goal: 'Dial the table bearing to the firing data (MATCH)', hi: ['dials', 'gauges'] }),
      dialStep('cutoff', 'range', { title: 'Brennschluss', text: 'The I-Gerät cuts the engine when the rocket reaches the speed that carries it to the range: the BRENNSCHLUSS counter shows that speed in m/s. Dial the range with the up and down arrows.', goal: 'Dial the Brennschluss range to the firing data (MATCH)', hi: ['dials', 'gauges'] }),
      waitFire('Checks and fuel', 'The gyros run up in the checks; then alcohol, T-Stoff and Z-Stoff, and the liquid oxygen last: from then on it boils off (the A-STOFF gauge). Below 92% the rocket falls short; T tops it up. ] speeds time up.', 'Wait until the big key says VORSTUFE'),
      {
        id: 'vorstufe', title: 'Vorstufe', text: 'Press Enter: the igniter lights and the propellants flow under gravity, a flame of about 8 t that cannot lift the rocket. The crew watches it (the VORSTUFE lamp): a ragged flame means trouble.', goal: 'Press Enter: VORSTUFE', hi: ['next', 'gauges'],
        done: (T) => stepDone(T, 'prestage') || sp(T).flights.length > 0,
        demo: (T) => { if (!sp(T).doing) T.once('vor', () => T.act('step')); },
      },
      {
        id: 'launch', title: 'Hauptstufe', text: 'The flame is steady. Press Enter: the turbopump comes up, 25 t of thrust, and the rocket rises off the table, then turns toward the target.', goal: 'Press Enter: HAUPTSTUFE', hi: ['next'],
        done: (T) => sp(T).flights.length >= 1,
        demo: (T) => { if (!sp(T).doing) T.once('main', () => T.act('step')); },
      },
      followStep,
      resultStep('Five minutes of flight, eighty kilometres up...'),
    ],
  },
];
void idle; void effectStep;

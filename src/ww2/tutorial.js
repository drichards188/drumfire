// The WW2 mode's lessons, run by the same Tutorials class as the British ones (src/tutorial.js) on the scripted
// range of their operation (a lesson of another operation reloads the page there: main's host.redirect). Each step
// has a demo, so `__drumfire.tutorial.autoplaySync({ id })` plays a lesson unattended (that is how they are tested).
import { LESSON_KIT } from '../tutorial.js';

const { shots, targetDown, takeStep, rangeStep, reportStep, bracketDemo, effectStep, killStep, idle } = LESSON_KIT;
const sp = (T) => T.u?.special;
const stepIs = (T, id) => sp(T)?.steps?.[sp(T).i]?.id === id;
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
const bracketStep = (o = {}) => ({
  id: 'bracket',
  title: 'Walk the rounds onto the target',
  text: o.text ?? 'Fire one round, read the report, correct, fire again. Two or three rounds usually bring the VB\'s "Ziel!": on target.',
  goal: 'Range until the observer reports on target',
  hi: ['fire', 'pad'],
  done: (T) => !!T.rep.last?.ok || targetDown(T),
  demo: bracketDemo,
  limit: 900,
});

// a launch-drill step: start the next steps with Enter until `until` is the current step
const drillTo = (id, until, o) => ({
  id, title: o.title, text: o.text, goal: o.goal ?? 'Press Enter (NEXT STEP) to start each step; wait while the crew works it',
  hi: ['special'],
  done: (T) => stepIs(T, until) || stepDone(T, until),
  demo: (T) => { if (!sp(T).doing) T.act('step'); },
  limit: 900,
});
const dialStep = (id, key, o) => ({
  id, title: o.title, text: o.text, goal: o.goal,
  hi: ['special'],
  done: (T) => { const s = sp(T); return s.settings[key] != null && Math.abs(s.settings[key] - s.solution[key]) <= (key === 'compass' ? 0.25 : 0.6); },
  demo: (T) => T.once('dial', () => T.act('set', { [key]: sp(T).solution[key] })),
});
const followStep = {
  id: 'follow', title: 'Ride it', text: 'Press F to follow the round in flight (F again comes back). On the way out it leaves the map: what became of it arrives as a report.',
  goal: 'Press F', hi: [],
  done: (T) => T.host.following() || T.sim.time - T.mem.t0 > 20,
  demo: (T) => T.once('f', () => T.host.follow()),
};

export const WW2_TUTORIALS = [
  {
    id: 'w-basics', op: 'flanders', name: 'Die Grundlagen (leFH 18)', unit: 1, units: [1, 2, 3, 4, 5, 6, 7],
    blurb: 'The German side: seven units, a console in metres and Strich, the VB\'s reports. Range the field howitzers onto an Allied dump.',
    outro: 'Metres and Strich, weiter and kürzer: the same loop as 1917, from the other side of the wire. The other lessons cover the special weapons.',
    setup: (T) => T.ensure('main', 'D1', { observer: 'foo', title: 'Supply dump, Potijze', firstError: { over: 160, right: -70 } }),
    keep: (T) => T.ensure('main', 'D1', { observer: 'foo', title: 'Supply dump, Potijze', firstError: { over: 160, right: -70 } }),
    steps: [
      { id: 'welcome', title: 'Flanders, autumn 1944', text: 'You command a German artillery group on the old Ypres ridge, facing the British and Canadians across the 1917 battlefield. The battle is fictional; the guns are real, except two guests labelled alternate history: the Gustav railway gun and Big Bertha.', hi: ['header'] },
      {
        id: 'units', title: 'Seven units', text: 'Keys 1 to 7 select a unit: 1 the 10.5 cm leFH 18, 2 the 15 cm sFH 18, 3 the 17 cm K 18, 4 the 21 cm Mörser 18, 5 the Nebelwerfer, 6 the Gustav, 7 Big Bertha.',
        goal: 'Press 5 to visit the Nebelwerfer, then 1 to come back', hi: ['tabs'],
        tick: (T) => { if (T.host.selectedId() === 5) T.mem.left = true; },
        done: (T) => !!T.mem.left && T.host.selectedId() === 1,
        demo: (T) => { if (!T.mem.left) T.once('go', () => T.host.select(5)); else if (T.sim.time - T.mem.t0 > 2) T.once('back', () => T.host.select(1)); },
      },
      { id: 'metric', title: 'Metres and Strich', text: 'The board is the same map with our lines in blue and theirs in red. Ranges are in metres, the line and the elevation in Strich (6400 to the circle: 48-00 is due west). References are the German grid in kilometres: r (Rechtswert, east) and h (Hochwert, north).', hi: ['board', 'order'] },
      takeStep({ text: 'A VB (forward observer) has called fire on a supply dump. Take the task.' }),
      rangeStep({ text: 'Range with one gun: GUNS on 1 GUN, ROUNDS 1, Space.' }),
      reportStep({ text: 'The VB watches the burst and telephones the fall of shot in metres.' }),
      correctStep(),
      bracketStep(),
      effectStep({ n: 6 }),
      killStep({ n: 6 }),
    ],
  },
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
    outro: 'At Sevastopol the Gustav fired 48 shells in twelve days; here a handful. Spend each one on the hardest target in reach, with the delay fuze.',
    steps: [
      { id: 'welcome', title: 'Bakhchisaray, June 1942', text: 'The Gustav arrives in pieces. Before it can fire, the position must be surveyed, the curved double track laid, the gantry cranes raised, the gun assembled and the ammunition train brought up. The PREPARATION card lists the tasks; the + and - put work gangs on them.', hi: ['special'] },
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
      { id: 'welcome', title: 'Brest-Litovsk, 22 June 1941', text: 'The 60 cm Karl "Thor" stands on the approach road. It has only 4 degrees of traverse each way, so the whole vehicle is the coarse laying; it must lower its hull onto the ground before it fires. The KARL card has the positions, TURN (T), LOWER and RAISE (L) and the ammunition carrier (Y).', hi: ['special'] },
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
    blurb: 'Prepare a flying bomb at its Walter ramp: compass, air log, fuel, steam generator, and the catapult.',
    outro: 'The game scores the drill and whether the missile reached the target area. The V-1 was chiefly a weapon against cities; thousands of civilians were killed by it. docs/WW2.md has the history.',
    steps: [
      { id: 'welcome', title: 'Flak-Regiment 155 (W)', text: 'A launch site in the woods, autumn 1944. The DRILL card has the firing data (the target\'s bearing and range, the wind), two settings to dial, and the checklist. Enter starts the next step; the crew works it. Faults and air raids are switched off on this range.', hi: ['special'] },
      drillTo('prepare', 'compass', { title: 'From the store', text: 'Bring the missile out and fit its wings.' }),
      dialStep('compass', 'compass', { title: 'The compass', text: 'In the Richthaus the master compass is set to the launch bearing. Dial the COMPASS to the firing data\'s bearing (left and right arrows, Shift for whole degrees). A degree off is almost 3 km off at the target.', goal: 'Dial the compass to the firing data (within 0.2 degrees)' }),
      dialStep('airlog', 'range', { title: 'The air log', text: 'The propeller on the nose counts the air distance flown, then puts the missile into its dive. Dial the range from the firing data (it allows for the wind; up and down arrows).', goal: 'Dial the air log range to the firing data' }),
      drillTo('ready', 'fire', { title: 'Ready the round', text: 'Compass, air log, onto the sled, fuel and air, the steam generator, the fuzes, then everyone into the bunker.' }),
      {
        id: 'launch', title: 'Abschuß', text: 'The pulse jet starts; the steam catapult throws the missile off the ramp at about 400 km/h.', goal: 'Press Enter: FIRE', hi: ['special'],
        done: (T) => sp(T).flights.length >= 1,
        demo: (T) => { if (!sp(T).doing) T.act('step'); },
      },
      followStep,
      { id: 'result', title: 'The report', text: (T) => sp(T).flights[0]?.state === 'flying' ? 'Waiting for the report on the flight...' : `No. 1: ${sp(T).flights[0]?.text ?? ''}`, goal: 'Wait for the report', hi: ['special'], done: (T) => sp(T).flights[0] && sp(T).flights[0].state !== 'flying', limit: 900 },
    ],
  },
  {
    id: 'w-v2', op: 'v2', name: 'V-2: the A4 drill', unit: 1, units: [1],
    blurb: 'Erect the A4 on its firing table, align it, set the cut-off, fuel it (the liquid oxygen boils away) and launch.',
    outro: 'Nothing could stop the A4 in flight; its makers could only make it hit. It was built by concentration-camp prisoners at Mittelwerk, thousands of whom died. The game scores the drill only.',
    steps: [
      { id: 'welcome', title: 'A mobile battery', text: 'A clearing in the woods, autumn 1944. The Meillerwagen brings the rocket; the firing table takes it upright. The DRILL card has the firing data, two settings and the checklist. Faults and raids are off on this range.', hi: ['special'] },
      drillTo('erect', 'align', { title: 'Erect', text: 'The Meillerwagen\'s hydraulic arm raises the 14 m rocket onto the firing table.' }),
      dialStep('align', 'compass', { title: 'Align the table', text: 'The table turns so the rocket\'s fin I faces the target. Dial the TABLE BEARING to the firing data.', goal: 'Dial the bearing to the firing data (within 0.2 degrees)' }),
      dialStep('cutoff', 'range', { title: 'Brennschluß', text: 'The engine is cut off at the speed that carries the rocket to the target\'s range. Dial the range.', goal: 'Dial the cut-off range to the firing data' }),
      drillTo('fuel', 'withdraw', { title: 'Checks and fuel', text: 'Electrical checks, alcohol, T-Stoff and Z-Stoff, then the liquid oxygen last: from then on it boils off, so launch soon or top up.' }),
      drillTo('clear', 'fire', { title: 'Clear the table', text: 'The Meillerwagen withdraws, the crew goes to the Feuerleitpanzer. Then the Vorstufe: the pre-stage flame, watched for a steady burn.' }),
      {
        id: 'launch', title: 'Hauptstufe', text: 'The turbopump comes up to speed: 25 tonnes of thrust, the rocket rises off the table, turns toward the target and is gone.', goal: 'Press Enter: HAUPTSTUFE', hi: ['special'],
        done: (T) => sp(T).flights.length >= 1,
        demo: (T) => { if (!sp(T).doing) T.act('step'); },
      },
      followStep,
      { id: 'result', title: 'The report', text: (T) => sp(T).flights[0]?.state === 'flying' ? 'Five minutes of flight, eighty kilometres up...' : `No. 1: ${sp(T).flights[0]?.text ?? ''}`, goal: 'Wait for the report', hi: ['special'], done: (T) => sp(T).flights[0] && sp(T).flights[0].state !== 'flying', limit: 900 },
    ],
  },
];
void idle; void effectStep;

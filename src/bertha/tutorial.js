import { GUN } from './ballistics.js';
import { STATIONS, toStrich } from './game.js';
import { t, L, getLang } from './i18n.js';
import { shellName, fuzeName, defl } from './hud.js';

// The Dicke Bertha tutorial: two rounds of one fire mission on the quiet range (BerthaGame { range: true }:
// a single target, a small map error, no British reply), on the card #tut-card.
//
// Every step is a short "why" and a checklist of things to do, each with its key and, where it helps, a live
// reading and the direction to go ("the post is 12 mils left of the hair: hold D"). A step that belongs to a
// station first asks the player to go there (the station's number key, or its button on the bar, which is
// lit). Items tick as they are done; the first open item is marked as the one to do now. The step ends when
// its `done` is true (a moment later the next one opens), or on Next for a step with nothing to do.
//   step { station, hi, title, why, todo(g, v) -> [{ en, de, done, optional }], done(g, v), finish }
// Text: { en, de }, or a function of the game; {X} in an item becomes a key cap.
// The host is the page: { game(), view(), start(), leave(), play(), setHighlight(station, ids) }.
const DEG = Math.PI / 180;
const both = (en, de) => ({ en, de });
const o_ = (g) => g.order ?? {};
const deg = (r) => (r / DEG).toFixed(1);
const mils = (r) => toStrich(r);
const STATION = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
const kbd = (s) => s.replace(/\{([^}]+)\}/g, '<kbd>$1</kbd>');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// "Press 3 (or click ... on the bar)": the first item of every station step
const goTo = (id) => (g) => {
  const s = STATION[id];
  return {
    en: `Press {${s.key}} (or click "${s.en}" on the bar at the bottom) to take this man's place`,
    de: `{${s.key}} drücken (oder unten "${s.name}" anklicken), um an diesen Posten zu gehen`,
    done: g.station === id,
  };
};

// the live checks of the drill, shared by the step-by-step round and the round-two checklist
const C = {
  acked: (g, n) => (g.order?.n ?? 0) >= n && g.order.acked,
  down: (g) => g.gun.el <= GUN.loadEl + 0.6 * DEG || g.gun.breechOpen || !!g.gun.loaded,
  open: (g) => g.gun.breechOpen || !!g.gun.tray || !!g.gun.rammed || !!g.gun.loaded,
  shellOk: (g) => g.selShell === g.order?.shell,
  fuzeOk: (g) => g.selFuze === g.order?.fuze,
  onTray: (g) => {
    const s = g.gun.tray ?? g.gun.rammed ?? g.gun.loaded;
    return !!s && s.shell === g.order?.shell && s.fuze === g.order?.fuze;
  },
  rammed: (g) => !!g.gun.rammed || !!g.gun.loaded,
  bags: (g) => (g.gun.loaded ? g.gun.loaded.bags : g.gun.bags) === g.order?.charge,
  caseIn: (g) => g.gun.caseIn || !!g.gun.loaded,
  closed: (g) => !!g.gun.loaded,
  quad: (g) => g.laid().quad,
  elev: (g) => g.laid().elev,
  sight: (g) => g.laid().sight,
  line: (g) => g.laid().line,
};
// which way to hold, from the live state
const dirElev = (g, goal) => (g.gun.el < goal ? 'W' : 'S');
const dirQuad = (g) => (g.gun.quad < (g.order?.el ?? 0) ? '↑' : '↓');
const dirSight = (g) => (g.gun.sight < (g.order?.defl ?? 0) ? '←' : '→');
const dirLine = (g) => (g.gun.tr < (g.order?.defl ?? 0) ? 'A' : 'D');
// where the aiming post sits against the hair, in mils (+ = right of it), as the sight shows it
const postOff = (g) => toStrich(g.gun.tr - g.gun.sight);

export const STEPS = [
  {
    title: both('Big Bertha', 'Die Dicke Bertha'),
    why: both(
      'You are the crew of a German 42 cm howitzer: five jobs, and you do each of them in turn. This lesson takes you through one shot, one key at a time. Nobody shoots back.',
      'Sie sind die Bedienung eines deutschen 42-cm-Mörsers: fünf Posten, und Sie übernehmen jeden der Reihe nach. Diese Übung führt Taste für Taste durch einen Schuss. Niemand schießt zurück.'
    ),
    todo: (g, v) => [
      { en: 'Click the 3D view once, then move the mouse to look around ({Esc} gives the mouse back)', de: 'Einmal in die 3D-Ansicht klicken, dann mit der Maus umsehen ({Esc} gibt die Maus frei)', done: v.looked },
      { en: 'The five jobs are the buttons at the bottom; keys {1} to {5} or {Tab} move you between them', de: 'Die fünf Posten sind die Knöpfe unten; {1} bis {5} oder {Tab} wechseln', done: v.looked },
      { en: 'Click {Next} on this card', de: '{Weiter} auf dieser Karte anklicken', done: false },
    ],
  },
  {
    station: 'cmd',
    title: both('1 · Take the fire order', '1 · Den Schießbefehl aufnehmen'),
    why: both('Orders come by field telephone to the gun commander. He reads each order back so the crew knows what to fire.', 'Die Befehle kommen per Feldfernsprecher zum Batterieführer. Er wiederholt jeden Befehl, damit die Bedienung weiß, was zu schießen ist.'),
    todo: (g) => [
      { en: 'Wait for the telephone to ring (a few seconds)', de: 'Warten, bis der Fernsprecher läutet (ein paar Sekunden)', done: !!g.order },
      { en: 'Hold {E} until the bar under the prompt fills', de: '{E} halten, bis sich der Balken unter der Anzeige füllt', done: C.acked(g, 1) },
    ],
    done: (g) => C.acked(g, 1),
  },
  {
    hi: ['order'],
    title: both('The order card', 'Die Befehlskarte'),
    why: both(
      'The order now sits on the card at the top left. Each line is one job, and the small number on the left is the station that does it. The ticks on the right fill in as the work gets done.',
      'Der Befehl steht jetzt auf der Karte oben links. Jede Zeile ist eine Aufgabe, die kleine Zahl links der Posten, der sie erledigt. Die Haken rechts füllen sich mit der Arbeit.'
    ),
    todo: (g) => {
      const o = o_(g);
      return [
        { en: `Shell: ${shellName(o.shell)}, ${fuzeName(o.fuze)} fuze, charge ${o.charge}: the loader (4)`, de: `Geschoss: ${shellName(o.shell)}, Zünder ${fuzeName(o.fuze)}, Ladung ${o.charge}: Ladekanonier (4)`, done: false, note: true },
        { en: `Elevation: ${mils(o.el)} mils (${deg(o.el)}°): the elevation layer (3)`, de: `Erhöhung: ${mils(o.el)} Strich (${deg(o.el)}°): Höhenrichtkanonier (3)`, done: false, note: true },
        { en: `Line: ${defl(o.defl)} mils: the line layer (2)`, de: `Seite: ${defl(o.defl)} Strich: Seitenrichtkanonier (2)`, done: false, note: true },
        { en: 'Then the firer (5) pulls. A mil is 1/6400 of a circle', de: 'Dann zieht der Abzugskanonier (5) ab. Ein Strich ist 1/6400 des Kreises', done: false, note: true },
        { en: 'Click {Next}', de: '{Weiter} anklicken', done: false },
      ];
    },
  },
  {
    station: 'elev',
    title: both('2 · Lower the barrel', '2 · Das Rohr senken'),
    why: both('The shell can only be loaded with the barrel almost level, at 2°.', 'Geladen wird nur bei fast waagerechtem Rohr, bei 2°.'),
    todo: (g) => [
      goTo('elev')(g),
      { en: `Hold {S} to crank the barrel down. Barrel now ${deg(g.gun.el)}°, load at ${deg(GUN.loadEl)}°`, de: `{S} halten und das Rohr herunterkurbeln. Rohr jetzt ${deg(g.gun.el)}°, Ladewinkel ${deg(GUN.loadEl)}°`, done: C.down(g) },
    ],
    done: (g) => C.down(g),
  },
  {
    station: 'load',
    title: both('3 · Open the breech', '3 · Den Verschluss öffnen'),
    why: both('You are now on the loading platform behind the gun. The breech is closed by a sliding steel block.', 'Sie stehen jetzt auf der Ladebühne hinter dem Geschütz. Der Verschluss ist ein seitlich gleitender Stahlkeil.'),
    todo: (g) => [goTo('load')(g), { en: 'Hold {E} until the bar fills: the block slides out to the right', de: '{E} halten, bis der Balken voll ist: der Keil gleitet nach rechts heraus', done: C.open(g) }],
    done: (g) => C.open(g),
  },
  {
    station: 'load',
    hi: ['readout'],
    title: both('4 · Pick and crane the shell', '4 · Granate wählen und aufkranen'),
    why: both('The panel at the bottom left shows the shell and fuze you have picked. They must match the order.', 'Unten links steht das gewählte Geschoss mit Zünder. Beides muss zum Befehl passen.'),
    todo: (g) => [
      goTo('load')(g),
      { en: `Press {Q} until the shell reads "${shellName(o_(g).shell)}" (now: ${shellName(g.selShell)})`, de: `{Q} drücken, bis "${shellName(o_(g).shell)}" dasteht (jetzt: ${shellName(g.selShell)})`, done: C.shellOk(g) || C.onTray(g) },
      { en: `Press {Z} until the fuze reads "${fuzeName(o_(g).fuze)}" (now: ${fuzeName(g.selFuze)})`, de: `{Z} drücken, bis Zünder "${fuzeName(o_(g).fuze)}" dasteht (jetzt: ${fuzeName(g.selFuze)})`, done: C.fuzeOk(g) || C.onTray(g) },
      { en: 'Hold {E} (about 7 s): the crane lifts the shell off the cart onto the tray', de: '{E} halten (etwa 7 s): der Kran hebt die Granate vom Wagen in die Ladeschale', done: C.onTray(g) },
    ],
    done: (g) => C.onTray(g),
  },
  {
    station: 'load',
    title: both('5 · Ram the shell', '5 · Die Granate ansetzen'),
    why: both('The rammer pushes the shell up the barrel until it jams in place.', 'Der Ansetzer schiebt die Granate ins Rohr, bis sie festsitzt.'),
    todo: (g) => [goTo('load')(g), { en: 'Hold {E} until the bar fills', de: '{E} halten, bis der Balken voll ist', done: C.rammed(g) }],
    done: (g) => C.rammed(g),
  },
  {
    station: 'load',
    hi: ['readout'],
    title: both('6 · Load the charge', '6 · Die Ladung einführen'),
    why: (g) => both(
      `The charge number is the number of powder bags: charge ${o_(g).charge} = ${o_(g).charge} bags, then the brass cartridge case behind them.`,
      `Die Ladungsnummer ist die Zahl der Pulverbeutel: Ladung ${o_(g).charge} = ${o_(g).charge} Vorkartuschen, dahinter die Hauptkartusche aus Messing.`
    ),
    todo: (g) => {
      const n = o_(g).charge, have = g.gun.loaded ? g.gun.loaded.bags : g.gun.bags, over = have > n;
      const items = [
        goTo('load')(g),
        { en: `Hold {E} once for each bag, letting go after each: ${have} of ${n} in`, de: `{E} je Beutel einmal halten und loslassen: ${have} von ${n} drin`, done: C.bags(g) || (have >= n && C.caseIn(g)) },
        { en: 'Then hold {R} for the brass cartridge case', de: 'Dann {R} halten für die Hauptkartusche', done: C.caseIn(g) },
      ];
      if (over || (C.caseIn(g) && !C.bags(g)))
        items.push({ en: 'Wrong number of bags! Finish with {R}, close with {E}, then hold {R} to unload, and start again from step 3', de: 'Falsche Beutelzahl! Mit {R} abschließen, mit {E} schließen, dann {R} halten zum Entladen und ab Schritt 3 neu', done: false, warn: true });
      return items;
    },
    done: (g) => C.bags(g) && C.caseIn(g),
  },
  {
    station: 'load',
    title: both('7 · Close the breech', '7 · Den Verschluss schließen'),
    why: both('With the block closed the gun is loaded.', 'Mit geschlossenem Keil ist das Geschütz geladen.'),
    todo: (g) => [goTo('load')(g), { en: 'Hold {E} until the bar fills', de: '{E} halten, bis der Balken voll ist', done: C.closed(g) }],
    done: (g) => C.closed(g),
  },
  {
    station: 'elev',
    title: both('8 · Lay for elevation', '8 · Die Höhe richten'),
    why: both(
      'The elevation layer uses a clinometer: a spirit level on a scale (the dial on the right). First set the scale to the order, then raise the barrel until the bubble sits between the two marks.',
      'Der Höhenrichtkanonier arbeitet mit dem Libellenquadranten: eine Wasserwaage auf einer Teilung (die Scheibe rechts). Erst die Teilung auf den Befehl stellen, dann das Rohr heben, bis die Blase zwischen den Marken steht.'
    ),
    todo: (g) => {
      const o = o_(g);
      return [
        goTo('elev')(g),
        { en: `Hold {${dirQuad(g)}} to set the scale to ${mils(o.el)}. Now ${mils(g.gun.quad)} (add {Shift} for single steps)`, de: `{${dirQuad(g)}} halten und die Teilung auf ${mils(o.el)} stellen. Jetzt ${mils(g.gun.quad)} (mit {Shift} in Einzelschritten)`, done: C.quad(g) },
        { en: `Hold {${dirElev(g, o.el)}} to move the barrel. Barrel now ${deg(g.gun.el)}°, wanted ${deg(o.el)}°. Let go near the end and finish with {Shift}+{${dirElev(g, o.el)}}`, de: `{${dirElev(g, o.el)}} halten und das Rohr bewegen. Rohr jetzt ${deg(g.gun.el)}°, gewollt ${deg(o.el)}°. Kurz davor loslassen, mit {Shift}+{${dirElev(g, o.el)}} fertig richten`, done: C.elev(g) },
      ];
    },
    done: (g) => C.quad(g) && C.elev(g),
  },
  {
    station: 'trav',
    title: both('9 · Lay for line', '9 · Die Seite richten'),
    why: both(
      'The line layer aims with a periscope sight at a red and white post planted out in front, to the left of the gun. Set the ordered number on the sight, then swing the whole gun until the post sits on the vertical line in the sight.',
      'Der Seitenrichtkanonier richtet mit dem Rundblickfernrohr auf eine rot-weiße Latte, die links vor dem Geschütz steht. Die befohlene Zahl am Fernrohr stellen, dann das ganze Geschütz schwenken, bis die Latte am senkrechten Faden steht.'
    ),
    todo: (g, v) => {
      const o = o_(g), off = postOff(g);
      const where = off === 0 ? both('on the line', 'am Faden') : both(`${Math.abs(off)} mils ${off > 0 ? 'right' : 'left'} of the line`, `${Math.abs(off)} Strich ${off > 0 ? 'rechts' : 'links'} vom Faden`);
      return [
        goTo('trav')(g),
        { en: `Hold {${dirSight(g)}} to set the sight to ${defl(o.defl)}. Now ${defl(g.gun.sight)} (add {Shift} for single steps)`, de: `{${dirSight(g)}} halten und das Fernrohr auf ${defl(o.defl)} stellen. Jetzt ${defl(g.gun.sight)} (mit {Shift} in Einzelschritten)`, done: C.sight(g) },
        { en: 'Press {V} to look through the sight', de: '{V} drücken, um ins Fernrohr zu schauen', done: v.instrument || C.line(g) },
        { en: `Hold {${dirLine(g)}} to swing the gun. The post is ${where.en}. The gun is heavy: let go early, finish with {Shift}+{${dirLine(g)}}`, de: `{${dirLine(g)}} halten und das Geschütz schwenken. Die Latte steht ${where.de}. Das Geschütz ist schwer: früh loslassen, mit {Shift}+{${dirLine(g)}} fertig`, done: C.line(g) },
      ];
    },
    done: (g) => C.sight(g) && C.line(g),
  },
  {
    station: 'fire',
    title: both('10 · Fire', '10 · Feuer'),
    why: both('The firer stands behind sandbags 15 m away with a long lanyard. When everything is ticked, he pulls.', 'Der Abzugskanonier steht 15 m entfernt hinter Sandsäcken mit einer langen Abzugsleine. Wenn alles abgehakt ist, zieht er ab.'),
    todo: (g) => [
      goTo('fire')(g),
      { en: 'Hold {E}: the whistle blows, everyone covers their ears, and the gun fires', de: '{E} halten: Pfiff, alle halten sich die Ohren zu, und der Schuss bricht', done: g.roundsFired >= 1 },
    ],
    done: (g) => g.roundsFired >= 1,
  },
  {
    title: both('11 · Watch the shell', '11 · Der Granate nachsehen'),
    why: (g) => both(
      `The shell is in the air for about ${Math.round(o_(g).tof ?? 40)} seconds. An observer will report where it lands.`,
      `Die Granate fliegt etwa ${Math.round(o_(g).tof ?? 40)} Sekunden. Ein Beobachter meldet, wo sie einschlägt.`
    ),
    todo: (g, v) => {
      const sh = g.shells.find((s) => s.own && s.alive);
      return [
        { en: 'Optional: press {F} to fly along with the shell ({F} again to come back)', de: 'Wahlweise: {F} drücken und mit der Granate fliegen ({F} noch einmal: zurück)', done: v.rode, optional: true },
        { en: 'Optional: press {]} to speed up time ({[} slows it again)', de: 'Wahlweise: {]} beschleunigt die Zeit ({[} verlangsamt wieder)', done: v.scale > 1, optional: true },
        { en: sh ? `Wait for the report: the shell lands in about ${Math.max(0, Math.round((o_(g).tof ?? 40) - sh.t))} s` : 'Wait for the observer\'s report (a few seconds after the burst)', de: sh ? `Auf die Meldung warten: Einschlag in etwa ${Math.max(0, Math.round((o_(g).tof ?? 40) - sh.t))} s` : 'Auf die Meldung des Beobachters warten (ein paar Sekunden nach dem Einschlag)', done: (g.order?.n ?? 1) >= 2 || g.state !== 'playing' },
      ];
    },
    done: (g) => (g.order?.n ?? 1) >= 2 || g.state !== 'playing',
  },
  {
    hi: ['order'],
    title: both('12 · Round two, on your own', '12 · Zweiter Schuss, selbstständig'),
    why: both(
      'The observer saw how far off it fell (bottom right), and the next order corrects line and elevation. Do the whole drill again. The checklist below follows you, and the lit buttons at the bottom show which jobs still have work.',
      'Der Beobachter hat gemeldet, wie weit daneben (unten rechts), und der neue Befehl verbessert Seite und Höhe. Die ganze Arbeit noch einmal. Die Liste folgt Ihnen, und die leuchtenden Knöpfe unten zeigen, wo noch Arbeit ist.'
    ),
    todo: (g) => {
      const o = o_(g);
      const r2 = (o.n ?? 1) >= 2, a = r2 && o.acked;
      return [
        { en: '{1} gun commander: hold {E} to take the new order', de: '{1} Batterieführer: {E} halten, neuer Befehl', done: a },
        { en: '{3} elevation layer: hold {S}, barrel down to 2°', de: '{3} Höhenrichtkanonier: {S} halten, Rohr auf 2°', done: a && C.down(g) },
        { en: `{4} loader: {E} open, {Q}/{Z} ${shellName(o.shell)}, ${fuzeName(o.fuze)}, {E} crane, {E} ram`, de: `{4} Ladekanonier: {E} öffnen, {Q}/{Z} ${shellName(o.shell)}, ${fuzeName(o.fuze)}, {E} aufkranen, {E} ansetzen`, done: a && C.rammed(g) && C.onTray(g) },
        { en: `{4} loader: {E} × ${o.charge} bags, {R} case, {E} close`, de: `{4} Ladekanonier: {E} × ${o.charge} Beutel, {R} Kartusche, {E} schließen`, done: a && C.closed(g) },
        { en: `{3} elevation layer: scale ${mils(o.el)} with {↑}/{↓}, then {W} to the bubble`, de: `{3} Höhenrichtkanonier: Teilung ${mils(o.el)} mit {↑}/{↓}, dann {W} bis zur Libelle`, done: a && C.quad(g) && C.elev(g) },
        { en: `{2} line layer: sight ${defl(o.defl)} with {←}/{→}, {V}, then {A}/{D} to the post`, de: `{2} Seitenrichtkanonier: Fernrohr ${defl(o.defl)} mit {←}/{→}, {V}, dann {A}/{D} zur Latte`, done: a && C.sight(g) && C.line(g) },
        { en: '{5} firer: hold {E}', de: '{5} Abzugskanonier: {E} halten', done: g.roundsFired >= 2 },
      ];
    },
    done: (g) => g.roundsFired >= 2 || g.state !== 'playing',
  },
  {
    finish: true,
    title: both('You know the drill', 'Die Bedienung sitzt'),
    why: both(
      'Order, load, lay, fire, correct: that is the whole job. Keep firing here if you like (two shells close to the target bring "fire for effect"), or go to the battle. There the British find you after your second shot and fire back, so be quick. Tick "Crew assists" on the title screen to let the crew do the jobs you are not at. F1 shows this drill at any time.',
      'Befehl, laden, richten, feuern, verbessern: das ist die ganze Arbeit. Hier gern weiterschießen (zwei Schuss nahe am Ziel bringen das Wirkungsschießen), oder in die Schlacht. Dort findet Sie der Engländer nach dem zweiten Schuss und schießt zurück, also schnell sein. "Bedienung hilft" auf dem Titelbild lässt die Bedienung die Posten besetzen, an denen Sie nicht stehen. F1 zeigt diese Arbeit jederzeit.'
    ),
  },
];

export class BerthaTutorial {
  constructor(host) {
    this.host = host;
    this.active = false;
    this.i = 0;
    this.okT = 0;
    const $ = (s) => document.querySelector(s);
    this.el = { card: $('#tut-card'), name: $('#tut-card .tc-name'), step: $('#tut-card .tc-step'), bar: $('#tut-card .tc-bar i'), title: $('#tut-card .tc-title'), text: $('#tut-card .tc-text'), todo: $('#tut-card .tc-todo'), goal: $('#tut-card .tc-goal'), exit: $('#tc-exit'), skip: $('#tc-skip'), next: $('#tc-next') };
    this.el.exit.addEventListener('click', () => this.stop());
    this.el.skip.addEventListener('click', () => this.go(this.i + 1));
    this.el.next.addEventListener('click', () => {
      if (STEPS[this.i].finish) {
        this.stop(false);
        this.host.play();
      } else this.go(this.i + 1);
    });
    this.cache = '';
  }

  start() {
    this.active = true;
    document.body.classList.add('tutorial');
    this.host.start();
    this.go(0);
  }

  // leave the lesson; back to the title unless the page is starting something else
  stop(toTitle = true) {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('tutorial');
    this.host.setHighlight(null, []);
    if (toTitle) this.host.leave();
  }

  go(i) {
    this.i = Math.min(STEPS.length - 1, i);
    this.okT = 0;
    this.cache = '';
    const s = STEPS[this.i];
    this.host.setHighlight(s.station ?? null, s.hi ?? []);
    this.render();
  }

  render() {
    const s = STEPS[this.i], g = this.host.game(), v = this.host.view();
    const pick = (x) => L(typeof x === 'function' ? x(g) : x);
    const done = !!s.done && s.done(g, v);
    const items = s.todo ? s.todo(g, v) : [];
    // the first open item (not a note, not optional) is the one to do now
    const now = items.findIndex((it) => !it.done && !it.note && !it.optional && !it.warn);
    const lang = getLang();
    const list = items.map((it, k) => {
      const cls = [it.done ? 'done' : '', k === now && !done ? 'now' : '', it.note ? 'note' : '', it.optional ? 'opt' : '', it.warn ? 'warn' : ''].join(' ');
      return `<li class="${cls}"><i></i><span>${kbd(esc(it[lang] ?? it.en))}</span></li>`;
    }).join('');
    const html = [pick(s.title), pick(s.why), list, done, this.i, lang].join('|');
    if (html === this.cache) return;
    this.cache = html;
    const e = this.el;
    e.name.textContent = t('tutName');
    e.step.textContent = t('tutStep', this.i + 1, STEPS.length);
    e.bar.style.width = `${((this.i + (done ? 1 : 0)) / STEPS.length) * 100}%`;
    e.title.textContent = pick(s.title);
    e.text.textContent = pick(s.why);
    e.todo.innerHTML = list;
    e.goal.hidden = !done;
    if (done) e.goal.querySelector('span').innerHTML = lang === 'de' ? 'Erledigt! Weiter geht es&hellip;' : 'Done! Moving on&hellip;';
    e.card.classList.toggle('ok', done);
    e.card.classList.toggle('finish', !!s.finish);
    e.exit.innerHTML = t('tutExit');
    e.skip.innerHTML = t('tutSkip');
    e.skip.hidden = !s.done;
    e.next.innerHTML = s.finish ? t('tutDone') : t('tutNext');
    e.next.hidden = !!s.done;
  }

  relabel() {
    this.cache = '';
    if (this.active) this.render();
  }

  update(rawDt) {
    if (!this.active) return;
    const s = STEPS[this.i], g = this.host.game(), v = this.host.view();
    if (s.done?.(g, v)) {
      // the list ticks, then the next step after a moment
      this.okT += rawDt;
      if (this.okT > 1.2) this.go(this.i + 1);
    }
    this.render();
  }
}

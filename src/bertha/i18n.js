// The Dicke Bertha page's language: English by default, German on the switch (title screen, settings, or
// ?lang=de), remembered in localStorage 'drumfire.bertha.lang'. Static text in bertha.html carries
// data-i18n="key" (innerHTML from STR); code calls t(key, ...args) for the table below and L({ de, en })
// for strings the game makes in both languages (messages, reasons, names).
const STORE = 'drumfire.bertha.lang';
let lang = 'en';
try {
  const q = new URLSearchParams(location.search).get('lang');
  const v = q ?? localStorage.getItem(STORE);
  if (v === 'de' || v === 'en') lang = v;
} catch {
  // private window or no storage: English
}
const listeners = new Set();

export const getLang = () => lang;
export const L = (o) => (o == null ? '' : typeof o === 'string' ? o : o[lang] ?? o.en ?? '');
export function t(key, ...args) {
  const v = STR[lang][key] ?? STR.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
// t() for places that set textContent (the shared HUD's hint, toast, kill and end card): entities decoded
let _dec = null;
export function tt(key, ...args) {
  _dec ??= document.createElement('textarea');
  _dec.innerHTML = t(key, ...args);
  return _dec.value;
}
export function setLang(l) {
  if (l !== 'en' && l !== 'de') return;
  lang = l;
  try {
    localStorage.setItem(STORE, l);
  } catch {
    // not remembered: fine
  }
  applyStatic();
  for (const f of listeners) f(l);
}
export const onLang = (f) => listeners.add(f);
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  document.title = STR[lang].pageTitle;
  for (const el of root.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-lang]')) el.classList.toggle('on', el.dataset.lang === lang);
}

const K = (...k) => k.map((x) => `<kbd>${x}</kbd>`).join('');

const STR = {
  en: {
    title: 'BIG BERTHA',
    pageTitle: 'Big Bertha: Drumfire',
    sub: '42 cm M-Ger&auml;t, Flanders 1917 &middot; Demo',
    blurb: 'The other side of the wire. One 42 cm howitzer behind the Passchendaele ridge and its detachment, and you are each of them in turn: take the fire order on the field telephone, lay the line through the panoramic sight, set the clinometer and crank the barrel, hoist, ram and charge the 810 kg shell, and pull the lanyard. The British gun line is 10 to 13 km to the west, and it will answer.',
    loading: 'Bringing up the gun by rail',
    assist: 'Crew assists: the stations you are not at work themselves',
    wipTag: 'WIP', wipLine: 'Work in progress: still being built, so expect rough edges and changes.',
    assistBtn: 'Crew assists', assistOn: 'on: they work', assistOff: 'off: they wait', assistNo: 'not in the tutorial',
    assistTip: 'C: crew assists. On: the stations you are not at work the drill themselves. Off: every job waits for you.',
    assistNowOn: 'Crew assists: the stations you are not at work themselves.',
    assistNowOff: 'Crew assists off: every job waits for you.',
    assistTut: 'The tutorial teaches every job by hand: the crew does not assist here.',
    play: 'Fall in',
    tutorial: 'Tutorial',
    back: '&larr; Drumfire',
    language: 'Language',
    keys: `<li>${K('1')}-${K('5')} / ${K('Tab')} station</li><li>${K('Mouse')} look (click to capture)</li><li>${K('E')} hold: act</li><li>${K('A')} ${K('D')} / ${K('W')} ${K('S')} crank</li><li>${K('&larr;')}${K('&rarr;')} / ${K('&uarr;')}${K('&darr;')} set the instrument</li><li>${K('Shift')} fine</li><li>${K('V')} look through the instrument</li><li>${K('F')} ride the shell</li><li>${K('C')} crew assists on/off</li><li>${K('[')} ${K(']')} time</li><li>${K('F1')} help</li>`,
    gunName: 'Big Bertha',
    gunCall: '42 cm M-Ger&auml;t, KMK Battery 3',
    score: 'Score',
    clock: 'Time',
    hp: 'Gun',
    helpTitle: 'The drill',
    help: `<ol>
      <li><b>1 Gun commander</b>: the telephone rings. Hold ${K('E')} to read the order back. The order card (top left) then shows the target, shell, fuze, charge, line and elevation.</li>
      <li><b>3 Elevation layer</b>: the barrel loads level. ${K('S')} cranks it down to the loading angle (2&deg;).</li>
      <li><b>4 Loader</b> (you direct the loading detachment from the back of the stage): ${K('E')} opens the breech (and throws out the last brass case). ${K('Q')} picks the shell, ${K('Z')} the fuze, then hold ${K('E')} to crane it onto the tray and ${K('E')} again to ram it. ${K('E')} adds one charge bag per charge number, ${K('R')} puts in the brass case, ${K('E')} closes the breech.</li>
      <li><b>3 Elevation layer</b>: ${K('&uarr;')}${K('&darr;')} set the clinometer to the ordered elevation, then ${K('W')} raises the barrel until the bubble centres. ${K('Shift')} for the fine wheel; ${K('V')} to look at the instrument.</li>
      <li><b>2 Line layer</b>: ${K('&larr;')}${K('&rarr;')} set the deflection on the panoramic sight, then ${K('A')} ${K('D')} swing the carriage until the red and white aiming post sits on the vertical hair (${K('V')} looks through the sight).</li>
      <li><b>5 Firer</b>: when laid and loaded, hold ${K('E')}. Whistle, everybody covers his ears, and the round goes.</li>
      <li>The shell flies for 30 to 60 s (${K('F')} rides it, ${K(']')} speeds time). The observer reports the fall and fire direction sends a corrected order. A round within 60 m brings fire for effect.</li>
    </ol><p>Mils: 6400 to a circle (17.8 to a degree). The line under the prompt always names the next job, and the button marked Next is where it is done. Every wheel stops on its mark (the ordered figure, the centred bubble, the post on the hair): press the key again to go past it. The British find you after the second round: while a round is in the air, lower the barrel and open the wedge for the next one.</p>`,
    helpClose: 'Carry on',
    again: 'Again',
    // the order card
    orderTitle: 'Fire order',
    orderNew: 'new',
    waitOrder: 'Waiting for fire direction&hellip;',
    phoneRings: 'The telephone is ringing!',
    phoneHow: 'Station 1, hold E',
    kind: { ranging: 'Ranging', ffe: 'Fire for effect', correction: 'Correction' },
    shell: 'Shell', charge: 'Charge', breech: 'Breech', line: 'Line', elevation: 'Elevation', rounds: 'Rounds',
    breechState: { loaded: 'loaded', open: 'open', shut: 'closed' },
    legend: '&#10003;&#10003; = instrument set, gun laid',
    hold: 'hold',
    // readouts
    sightSet: 'Panoramic sight', ordered: 'ordered',
    postNow: (o) => `Aiming post: <b>${o === 0 ? 'on the line' : `${Math.abs(o)} mils ${o > 0 ? 'right' : 'left'}`}</b> ${o === 0 ? '<i class="ok">&#10003;</i>' : `(hold <kbd>${o > 0 ? 'D' : 'A'}</kbd>)`}`,
    barrelNow: (d, m, l) => `Barrel: <b>${d}&deg;</b> = ${m} mils <small>(loads at ${l}&deg;)</small>`,
    travKeys: `${K('&larr;')}${K('&rarr;')} set the scale &middot; ${K('A')}${K('D')} swing the carriage &middot; ${K('Shift')} fine &middot; ${K('V')}`,
    travLook: (on) => (on ? 'back' : 'into the sight'),
    travHint: 'Set the ordered deflection on the sight, then swing the carriage until the aiming post is on the vertical hair.',
    quadSet: 'Clinometer',
    elevKeys: `${K('&uarr;')}${K('&darr;')} set the clinometer &middot; ${K('W')}${K('S')} raise/lower &middot; ${K('Shift')} fine &middot; ${K('V')}`,
    elevLook: (on) => (on ? 'back' : 'clinometer'),
    elevLower: 'Lower the barrel to the loading angle (S): the bubble does not matter for loading.',
    elevLay: 'Set the ordered elevation on the clinometer, then crank until the bubble centres.',
    elevOpen: 'The wedge is open: the barrel stays at the loading angle until the loader closes it.',
    loadShell: 'Shell', loadFuze: 'Fuze', loadBags: 'Charge bags in the bore', loadCase: ' + brass case', loadLoaded: (s, c) => ` &middot; loaded: ${s}, charge ${c}`,
    loadHint: 'You direct the loading detachment from the back of the stage: open, crane, ram, one bag (E) per charge number, the brass case (R), close. The tray runs back by itself when the wedge shuts.',
    fireLoaded: 'Loaded', fireLine: 'Line', fireElev: 'Elevation',
    fireHint: 'Wait until the gun is loaded and laid, then hold E to pull. You are 15 m off, behind sandbags.',
    cmdWind: (w, n) => `Wind: ${w} m/s &middot; rounds fired ${n}`,
    cmdHint: 'Take the order on the telephone, then go round the stations (1 to 5 or Tab). The line under the prompt and the marked button say what comes next.',
    sightLabel: 'Deflection', quadLabel: 'Clinometer',
    // page messages
    toastSub: '42 cm M-Ger&auml;t, Flanders 1917',
    noShell: 'No shell in flight',
    riding: 'Riding the shell (F: back to the gun)',
    shot: 'Fire! (F: ride the shell)',
    phoneHint: 'The telephone is ringing: gun commander (1)',
    hitUs: (d) => `Hit at the gun! (${d})`,
    gunKilled: (n) => `Gun destroyed: ${n}`,
    targetKilled: (n) => `${n}: knocked out`,
    orderToast: (n) => `Fire order ${n}`,
    soundOff: 'Sound off', soundOn: 'Sound on',
    crewStations: 'Gun commander: crew to your stations! (F1 for the drill)',
    endWin: 'Cease fire', endLose: 'The gun is out of action',
    endWinSub: 'Every British gun in reach is silenced and Ypres has felt the 42 cm.',
    endLoseSub: 'The British counter-battery fire has wrecked the gun.',
    stScore: 'Score', stRounds: 'Rounds', stTargets: 'Targets', stGun: 'Gun', stTime: 'Time',
    // the next job, refusals, the order card's additions
    nextTag: 'Next', nextHere: 'Here:', press: 'press',
    crewDoes: (n) => `The crew (${n})`,
    whyTrav: 'Line layer: &larr; &rarr; set the sight, A D swing the carriage.',
    whyElev: 'Elevation layer: &uarr; &darr; set the clinometer, W S crank the barrel.',
    warnWrongRound: 'The round in the gun is not the one ordered: it will fall wrong.',
    warnNotLaid: 'The gun is not laid as ordered: the round will go astray.',
    readingBack: 'reading back',
    chargeIs: (n) => `= ${n} bag${n === 1 ? '' : 's'} + case`,
    corrL: (d) => `(${Math.abs(d)} ${d > 0 ? 'L' : 'R'})`,
    tofIs: (s) => `${s} s flight`,
    inFlight: (s) => `Round in the air: ${s} s to the burst`,
    flightKeys: 'F rides the shell &middot; ] speeds up time',
    splash: 'Burst. The observer is reporting&hellip;',
    lastFall: 'Last round',
    sightRing: 'ring', sightDrum: 'drum',
    carriage: 'Carriage',
    trStop: (n) => `(stops at ${n} either side)`,
    bubble: (d) => (d === 0 ? 'Bubble: centred <i class="ok">&#10003;</i>' : `Bubble: barrel <b>${Math.abs(d)} mils too ${d > 0 ? 'high' : 'low'}</b> (hold <kbd>${d > 0 ? 'S' : 'W'}</kbd>)`),
    notOrdered: 'not as ordered',
    chamberIs: (shell, bags, caseIn, want) => `${shell ?? 'no shell'} &middot; ${bags} bag${bags === 1 ? '' : 's'}${caseIn ? ' + brass case' : ''}${want != null ? ` &middot; ordered: charge ${want}` : ''}`,
    fireReady: 'Loaded and laid: hold E to fire.',
    // refusals and feedback (the line under the prompt)
    qzWhere: 'Q and Z pick the shell and the fuze: that is the loader&rsquo;s job (4).',
    qzLate: 'The shell is already up: it goes in as it is. A wrong round is unloaded with R once the wedge is shut.',
    qzLoaded: 'The gun is loaded. To change the round, the loader (4) unloads it with R.',
    picked: (what, good) => `${what}${good ? ' <i class="ok">&#10003;</i>' : ' <i class="no">(not the ordered one)</i>'}`,
    vWhere: 'V looks through an instrument: the panoramic sight (2) or the clinometer (3).',
    wsWhere: 'W and S crank the barrel: the elevation layer&rsquo;s handwheel (3).',
    adWhere: 'A and D swing the carriage: the line layer&rsquo;s handwheel (2).',
    udWhere: '&uarr; and &darr; set the clinometer: the elevation layer (3).',
    lrWhere: '&larr; and &rarr; set the panoramic sight: the line layer (2).',
    elevOpenLock: 'The wedge is open and the tray is up against the breech: the barrel stays at 2&deg; until the loader (4) closes it.',
    elStop: (d) => `The barrel is at its stop (${d}&deg;).`,
    trStopHit: 'The carriage is at the end of its traversing arc.',
    mark_trav: 'The aiming post is on the hair: laid for line <i class="ok">&#10003;</i>',
    mark_sight: 'The sight is set to the ordered deflection <i class="ok">&#10003;</i>',
    mark_elev: 'The bubble centres: laid for elevation <i class="ok">&#10003;</i>',
    mark_quad: 'The clinometer is set to the ordered elevation <i class="ok">&#10003;</i>',
    markLoad: 'Barrel at the loading angle, 2&deg; <i class="ok">&#10003;</i>',
    titleHint: 'New here? Start with the tutorial: one round, key by key, in about five minutes.',
    // tutorial card
    tutName: 'Tutorial', tutExit: 'Exit', tutSkip: 'Skip step', tutNext: 'Next', tutDone: 'Fight the battle', tutStep: (i, n) => `Step ${i} of ${n}`,
  },
  de: {
    title: 'DICKE BERTHA',
    pageTitle: 'Dicke Bertha: Drumfire',
    sub: '42 cm M-Ger&auml;t, Flandern 1917 &middot; Demo',
    blurb: 'Die andere Seite des Drahts. Ein 42-cm-M&ouml;rser hinter dem Passchendaele-R&uuml;cken und seine Bedienung, und Sie sind jeder Mann der Reihe nach: den Schie&szlig;befehl am Feldfernsprecher aufnehmen, die Seite mit dem Rundblickfernrohr richten, den Libellenquadranten stellen und das Rohr kurbeln, die 810-kg-Granate aufkranen, ansetzen und laden, und abziehen. Die englische Artillerie steht 10 bis 13 km im Westen, und sie wird antworten.',
    loading: 'Das Ger&auml;t kommt mit der Bahn',
    assist: 'Bedienung hilft: die Posten, an denen Sie nicht stehen, arbeiten selbst',
    wipTag: 'IN ARBEIT', wipLine: 'In Arbeit: noch im Bau, also mit Ecken und Kanten und Änderungen rechnen.',
    assistBtn: 'Bedienung hilft', assistOn: 'an: sie arbeitet', assistOff: 'aus: sie wartet', assistNo: 'nicht in der Einweisung',
    assistTip: 'C: Bedienung hilft. An: die Posten, an denen Sie nicht stehen, arbeiten selbst. Aus: jede Arbeit wartet auf Sie.',
    assistNowOn: 'Bedienung hilft: die Posten, an denen Sie nicht stehen, arbeiten selbst.',
    assistNowOff: 'Bedienung hilft nicht mehr: jede Arbeit wartet auf Sie.',
    assistTut: 'Die Einweisung lehrt jede Arbeit von Hand: hier hilft die Bedienung nicht.',
    play: 'Antreten',
    tutorial: 'Ausbildung',
    back: '&larr; Drumfire',
    language: 'Sprache',
    keys: `<li>${K('1')}-${K('5')} / ${K('Tab')} Posten</li><li>${K('Maus')} umsehen (klicken zum Fangen)</li><li>${K('E')} halten: handeln</li><li>${K('A')} ${K('D')} / ${K('W')} ${K('S')} kurbeln</li><li>${K('&larr;')}${K('&rarr;')} / ${K('&uarr;')}${K('&darr;')} Instrument stellen</li><li>${K('Shift')} fein</li><li>${K('V')} ins Instrument schauen</li><li>${K('F')} mit der Granate fliegen</li><li>${K('C')} Bedienung hilft an/aus</li><li>${K('[')} ${K(']')} Zeit</li><li>${K('F1')} Hilfe</li>`,
    gunName: 'Dicke Bertha',
    gunCall: '42 cm M-Ger&auml;t, KMK-Batterie 3',
    score: 'Punkte',
    clock: 'Uhrzeit',
    hp: 'Gesch&uuml;tz',
    helpTitle: 'Die Bedienung',
    help: `<ol>
      <li><b>1 Batterief&uuml;hrer</b>: der Fernsprecher l&auml;utet. ${K('E')} halten, um den Befehl zu wiederholen. Die Befehlskarte (oben links) zeigt dann Ziel, Geschoss, Z&uuml;nder, Ladung, Seite und Erh&ouml;hung.</li>
      <li><b>3 H&ouml;henrichtkanonier</b>: geladen wird mit waagerechtem Rohr. ${K('S')} kurbelt es auf den Ladewinkel (2&deg;).</li>
      <li><b>4 Ladekanonier</b> (Sie leiten die Ladebedienung vom hinteren Ende der B&uuml;hne): ${K('E')} &ouml;ffnet den Verschluss (und wirft die alte H&uuml;lse aus). ${K('Q')} w&auml;hlt das Geschoss, ${K('Z')} den Z&uuml;nder, dann ${K('E')} halten zum Aufkranen und noch einmal ${K('E')} zum Ansetzen. ${K('E')} f&uuml;hrt je Ladungsnummer eine Vorkartusche ein, ${K('R')} die Hauptkartusche, ${K('E')} schlie&szlig;t den Verschluss.</li>
      <li><b>3 H&ouml;henrichtkanonier</b>: ${K('&uarr;')}${K('&darr;')} stellt den Quadranten auf die befohlene Erh&ouml;hung, dann ${K('W')} das Rohr heben, bis die Libelle einspielt. ${K('Shift')} f&uuml;r das Feinrad; ${K('V')} zum Instrument.</li>
      <li><b>2 Seitenrichtkanonier</b>: ${K('&larr;')}${K('&rarr;')} stellt die Seite am Rundblickfernrohr, dann ${K('A')} ${K('D')} die Lafette schwenken, bis die rot-wei&szlig;e Richtlatte am senkrechten Faden steht (${K('V')} ins Fernrohr).</li>
      <li><b>5 Abzugskanonier</b>: geladen und gerichtet ${K('E')} halten. Pfiff, alle halten sich die Ohren zu, und der Schuss geht.</li>
      <li>Die Granate fliegt 30 bis 60 s (${K('F')} fliegt mit, ${K(']')} schneller). Der Beobachter meldet die Lage, die Feuerleitung schickt die Verbesserung. Ein Schuss unter 60 m bringt das Wirkungsschie&szlig;en.</li>
    </ol><p>Strich: 6400 auf den Kreis (17,8 auf den Grad). Die Zeile unter der Anzeige nennt immer die n&auml;chste Arbeit, der mit Weiter markierte Knopf den Posten dazu. Jedes Handrad h&auml;lt auf seiner Marke (befohlener Wert, einspielende Libelle, Latte am Faden): die Taste noch einmal dr&uuml;cken, um weiterzudrehen. Nach dem zweiten Schuss hat der Engl&auml;nder Sie gefunden: solange eine Granate fliegt, das Rohr senken und den Keil f&uuml;r den n&auml;chsten Schuss &ouml;ffnen.</p>`,
    helpClose: 'Weiter',
    again: 'Noch einmal',
    orderTitle: 'Schie&szlig;befehl',
    orderNew: 'neu',
    waitOrder: 'Warten auf die Feuerleitung&hellip;',
    phoneRings: 'Der Fernsprecher l&auml;utet!',
    phoneHow: 'Posten 1, E halten',
    kind: { ranging: 'Einschie&szlig;en', ffe: 'Wirkungsschie&szlig;en', correction: 'Verbesserung' },
    shell: 'Geschoss', charge: 'Ladung', breech: 'Verschluss', line: 'Seite', elevation: 'Erh&ouml;hung', rounds: 'Schuss',
    breechState: { loaded: 'geladen', open: 'offen', shut: 'zu' },
    legend: '&#10003;&#10003; = Instrument gestellt, Gesch&uuml;tz gerichtet',
    hold: 'halten',
    sightSet: 'Rundblickfernrohr', ordered: 'Befehl',
    postNow: (o) => `Richtlatte: <b>${o === 0 ? 'am Faden' : `${Math.abs(o)} Strich ${o > 0 ? 'rechts' : 'links'}`}</b> ${o === 0 ? '<i class="ok">&#10003;</i>' : `(<kbd>${o > 0 ? 'D' : 'A'}</kbd> halten)`}`,
    barrelNow: (d, m, l) => `Rohr: <b>${d}&deg;</b> = ${m} Strich <small>(Ladewinkel ${l}&deg;)</small>`,
    travKeys: `${K('&larr;')}${K('&rarr;')} Teilung stellen &middot; ${K('A')}${K('D')} Lafette schwenken &middot; ${K('Shift')} fein &middot; ${K('V')}`,
    travLook: (on) => (on ? 'zur&uuml;ck' : 'ins Fernrohr'),
    travHint: 'Die befohlene Seite am Fernrohr stellen, dann die Lafette schwenken, bis die Richtlatte am senkrechten Faden steht.',
    quadSet: 'Libellenquadrant',
    elevKeys: `${K('&uarr;')}${K('&darr;')} Quadrant stellen &middot; ${K('W')}${K('S')} Rohr heben/senken &middot; ${K('Shift')} fein &middot; ${K('V')}`,
    elevLook: (on) => (on ? 'zur&uuml;ck' : 'Quadrant'),
    elevLower: 'Das Rohr auf den Ladewinkel senken (S): zum Laden spielt die Libelle keine Rolle.',
    elevLay: 'Die befohlene Erh&ouml;hung am Quadranten stellen, dann kurbeln, bis die Libelle einspielt.',
    elevOpen: 'Der Keil ist offen: das Rohr bleibt im Ladewinkel, bis der Ladekanonier schlie&szlig;t.',
    loadShell: 'Geschoss', loadFuze: 'Z&uuml;nder', loadBags: 'Vorkartuschen im Rohr', loadCase: ' + Hauptkartusche', loadLoaded: (s, c) => ` &middot; geladen: ${s}, Ladung ${c}`,
    loadHint: 'Sie leiten die Ladebedienung vom hinteren Ende der B&uuml;hne: &ouml;ffnen, aufkranen, ansetzen, je Ladungsnummer eine Vorkartusche (E), die Hauptkartusche (R), schlie&szlig;en. Die Ladeschale l&auml;uft beim Schlie&szlig;en von selbst zur&uuml;ck.',
    fireLoaded: 'Geladen', fireLine: 'Seite', fireElev: 'H&ouml;he',
    fireHint: 'Warten, bis geladen und gerichtet ist, dann E halten zum Abziehen. Sie stehen 15 m entfernt hinter Sands&auml;cken.',
    cmdWind: (w, n) => `Wind: ${w} m/s &middot; Schuss gesamt ${n}`,
    cmdHint: 'Den Befehl am Fernsprecher aufnehmen, dann die Posten abgehen (1 bis 5 oder Tab). Die Zeile unter der Anzeige und der markierte Knopf sagen, was als N&auml;chstes kommt.',
    sightLabel: 'Seitenrichtung', quadLabel: 'Libellenquadrant',
    toastSub: '42 cm M-Ger&auml;t, Flandern 1917',
    noShell: 'Keine Granate in der Luft',
    riding: 'Mit der Granate (F: zur&uuml;ck zum Gesch&uuml;tz)',
    shot: 'Schuss! (F: mit der Granate fliegen)',
    phoneHint: 'Der Fernsprecher l&auml;utet: Batterief&uuml;hrer (1)',
    hitUs: (d) => `Treffer am Gesch&uuml;tz! (${d})`,
    gunKilled: (n) => `Gesch&uuml;tz vernichtet: ${n}`,
    targetKilled: (n) => `${n}: ausgeschaltet`,
    orderToast: (n) => `Schie&szlig;befehl ${n}`,
    soundOff: 'Ton aus', soundOn: 'Ton an',
    crewStations: 'Batterief&uuml;hrer: Bedienung an die Gesch&uuml;tze! (F1: Hilfe)',
    endWin: 'Feuerpause', endLose: 'Das Gesch&uuml;tz ist ausgefallen',
    endWinSub: 'Jedes englische Gesch&uuml;tz in Reichweite schweigt, und Ypern hat die 42 cm gesp&uuml;rt.',
    endLoseSub: 'Das englische Gegenfeuer hat das Gesch&uuml;tz zerst&ouml;rt.',
    stScore: 'Punkte', stRounds: 'Schuss', stTargets: 'Ziele', stGun: 'Gesch&uuml;tz', stTime: 'Zeit',
    nextTag: 'Weiter', nextHere: 'Hier:', press: 'Taste',
    crewDoes: (n) => `Die Bedienung (${n})`,
    whyTrav: 'Seitenrichtkanonier: &larr; &rarr; Fernrohr stellen, A D Lafette schwenken.',
    whyElev: 'H&ouml;henrichtkanonier: &uarr; &darr; Quadrant stellen, W S Rohr kurbeln.',
    warnWrongRound: 'Die Ladung im Rohr ist nicht die befohlene: der Schuss liegt falsch.',
    warnNotLaid: 'Das Gesch&uuml;tz ist nicht wie befohlen gerichtet: der Schuss geht fehl.',
    readingBack: 'wird wiederholt',
    chargeIs: (n) => `= ${n} Beutel + H&uuml;lse`,
    corrL: (d) => `(${Math.abs(d)} ${d > 0 ? 'li' : 're'})`,
    tofIs: (s) => `${s} s Flugzeit`,
    inFlight: (s) => `Granate in der Luft: Einschlag in ${s} s`,
    flightKeys: 'F: mitfliegen &middot; ]: Zeit schneller',
    splash: 'Einschlag. Der Beobachter meldet&hellip;',
    lastFall: 'Letzter Schuss',
    sightRing: 'Teilring', sightDrum: 'Trommel',
    carriage: 'Lafette',
    trStop: (n) => `(Anschlag bei ${n} beiderseits)`,
    bubble: (d) => (d === 0 ? 'Libelle: spielt ein <i class="ok">&#10003;</i>' : `Libelle: Rohr <b>${Math.abs(d)} Strich zu ${d > 0 ? 'hoch' : 'tief'}</b> (<kbd>${d > 0 ? 'S' : 'W'}</kbd> halten)`),
    notOrdered: 'nicht befohlen',
    chamberIs: (shell, bags, caseIn, want) => `${shell ?? 'kein Geschoss'} &middot; ${bags} Vorkartusche${bags === 1 ? '' : 'n'}${caseIn ? ' + Hauptkartusche' : ''}${want != null ? ` &middot; befohlen: Ladung ${want}` : ''}`,
    fireReady: 'Geladen und gerichtet: E halten zum Abziehen.',
    qzWhere: 'Q und Z w&auml;hlen Geschoss und Z&uuml;nder: das macht der Ladekanonier (4).',
    qzLate: 'Die Granate ist schon oben: sie geht so hinein. Eine falsche Ladung wird mit R entladen, wenn der Keil zu ist.',
    qzLoaded: 'Das Gesch&uuml;tz ist geladen. Zum Wechseln entl&auml;dt der Ladekanonier (4) mit R.',
    picked: (what, good) => `${what}${good ? ' <i class="ok">&#10003;</i>' : ' <i class="no">(nicht befohlen)</i>'}`,
    vWhere: 'V schaut ins Instrument: Rundblickfernrohr (2) oder Libellenquadrant (3).',
    wsWhere: 'W und S kurbeln das Rohr: Handrad des H&ouml;henrichtkanoniers (3).',
    adWhere: 'A und D schwenken die Lafette: Handrad des Seitenrichtkanoniers (2).',
    udWhere: '&uarr; und &darr; stellen den Libellenquadranten: H&ouml;henrichtkanonier (3).',
    lrWhere: '&larr; und &rarr; stellen das Rundblickfernrohr: Seitenrichtkanonier (2).',
    elevOpenLock: 'Der Keil ist offen und die Ladeschale liegt am Verschluss: das Rohr bleibt auf 2&deg;, bis der Ladekanonier (4) schlie&szlig;t.',
    elStop: (d) => `Das Rohr steht am Anschlag (${d}&deg;).`,
    trStopHit: 'Die Lafette steht am Ende des Schwenkbogens.',
    mark_trav: 'Die Richtlatte steht am Faden: Seite gerichtet <i class="ok">&#10003;</i>',
    mark_sight: 'Das Fernrohr steht auf der befohlenen Seite <i class="ok">&#10003;</i>',
    mark_elev: 'Die Libelle spielt ein: H&ouml;he gerichtet <i class="ok">&#10003;</i>',
    mark_quad: 'Der Quadrant steht auf der befohlenen Erh&ouml;hung <i class="ok">&#10003;</i>',
    markLoad: 'Rohr im Ladewinkel, 2&deg; <i class="ok">&#10003;</i>',
    titleHint: 'Neu hier? Am besten mit der Ausbildung anfangen: ein Schuss, Taste f&uuml;r Taste, etwa f&uuml;nf Minuten.',
    tutName: 'Ausbildung', tutExit: 'Ende', tutSkip: '&Uuml;berspringen', tutNext: 'Weiter', tutDone: 'Zur Schlacht', tutStep: (i, n) => `Schritt ${i} von ${n}`,
  },
};

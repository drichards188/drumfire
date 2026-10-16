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
    play: 'Fall in',
    tutorial: 'Tutorial',
    back: '&larr; Drumfire',
    language: 'Language',
    keys: `<li>${K('1')}-${K('5')} / ${K('Tab')} station</li><li>${K('Mouse')} look (click to capture)</li><li>${K('E')} hold: act</li><li>${K('A')} ${K('D')} / ${K('W')} ${K('S')} crank</li><li>${K('&larr;')}${K('&rarr;')} / ${K('&uarr;')}${K('&darr;')} set the instrument</li><li>${K('Shift')} fine</li><li>${K('V')} look through the instrument</li><li>${K('F')} ride the shell</li><li>${K('[')} ${K(']')} time</li><li>${K('F1')} help</li>`,
    gunName: 'Big Bertha',
    gunCall: '42 cm M-Ger&auml;t, KMK Battery 3',
    score: 'Score',
    clock: 'Time',
    hp: 'Gun',
    helpTitle: 'The drill',
    help: `<ol>
      <li><b>1 Gun commander</b>: the telephone rings. Hold ${K('E')} to read the order back. The order card (top left) then shows the target, shell, fuze, charge, line and elevation.</li>
      <li><b>3 Elevation layer</b>: the barrel loads level. ${K('S')} cranks it down to the loading angle (2&deg;).</li>
      <li><b>4 Loader</b>: ${K('E')} opens the breech (and throws out the last brass case). ${K('Q')} picks the shell, ${K('Z')} the fuze, then hold ${K('E')} to crane it onto the tray and ${K('E')} again to ram it. ${K('E')} adds one charge bag per charge number, ${K('R')} puts in the brass case, ${K('E')} closes the breech.</li>
      <li><b>3 Elevation layer</b>: ${K('&uarr;')}${K('&darr;')} set the clinometer to the ordered elevation, then ${K('W')} raises the barrel until the bubble centres. ${K('Shift')} for the fine wheel; ${K('V')} to look at the instrument.</li>
      <li><b>2 Line layer</b>: ${K('&larr;')}${K('&rarr;')} set the deflection on the panoramic sight, then ${K('A')} ${K('D')} swing the carriage until the red and white aiming post sits on the vertical hair (${K('V')} looks through the sight).</li>
      <li><b>5 Firer</b>: when laid and loaded, hold ${K('E')}. Whistle, everybody covers his ears, and the round goes.</li>
      <li>The shell flies for 30 to 60 s (${K('F')} rides it, ${K(']')} speeds time). The observer reports the fall and fire direction sends a corrected order. A round within 60 m brings fire for effect.</li>
    </ol><p>Mils: 6400 to a circle (17.8 to a degree). The British find you after the second round: keep the rounds going.</p>`,
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
    legend: (tof) => `&#10003;&#10003; = instrument set, gun laid &middot; ${tof} s flight`,
    hold: 'hold',
    // readouts
    sightSet: 'Panoramic sight', ordered: 'ordered',
    postNow: (o) => `Aiming post: <b>${o === 0 ? 'on the line' : `${Math.abs(o)} mils ${o > 0 ? 'right' : 'left'}`}</b> ${o === 0 ? '<i class="ok">&#10003;</i>' : `(hold <kbd>${o > 0 ? 'D' : 'A'}</kbd>)`}`,
    barrelNow: (d, l) => `Barrel: <b>${d}&deg;</b> <small>(loads at ${l}&deg;)</small>`,
    travKeys: `${K('&larr;')}${K('&rarr;')} set the scale &middot; ${K('A')}${K('D')} swing the carriage &middot; ${K('Shift')} fine &middot; ${K('V')}`,
    travLook: (on) => (on ? 'back' : 'into the sight'),
    travHint: 'Set the ordered deflection on the sight, then swing the carriage until the aiming post is on the vertical hair.',
    quadSet: 'Clinometer',
    elevKeys: `${K('&uarr;')}${K('&darr;')} set the clinometer &middot; ${K('W')}${K('S')} raise/lower &middot; ${K('Shift')} fine &middot; ${K('V')}`,
    elevLook: (on) => (on ? 'back' : 'clinometer'),
    elevLower: 'Lower the barrel to the loading angle (S): the bubble does not matter for loading.',
    elevLay: 'Set the ordered elevation on the clinometer, then crank until the bubble centres.',
    elevOpen: ' The breech is open: the barrel stays at the loading angle.',
    loadShell: 'Shell', loadFuze: 'Fuze', loadBags: 'Charge bags in the bore', loadCase: ' + brass case', loadLoaded: (s, c) => ` &middot; loaded: ${s}, charge ${c}`,
    loadHint: 'Open, crane, ram, one bag (E) per charge number, the brass case (R), close.',
    fireLoaded: 'Loaded', fireLine: 'Line', fireElev: 'Elevation',
    fireHint: 'When the gun is loaded and laid, hold E to pull. You are 15 m off, behind sandbags.',
    cmdWind: (w, n) => `Wind: ${w} m/s &middot; rounds fired ${n}`,
    cmdHint: 'Take the order on the telephone, then go round the stations (1 to 5 or Tab). The checklist on the order card shows what is still to do; a lit station has work waiting.',
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
    play: 'Antreten',
    tutorial: 'Ausbildung',
    back: '&larr; Drumfire',
    language: 'Sprache',
    keys: `<li>${K('1')}-${K('5')} / ${K('Tab')} Posten</li><li>${K('Maus')} umsehen (klicken zum Fangen)</li><li>${K('E')} halten: handeln</li><li>${K('A')} ${K('D')} / ${K('W')} ${K('S')} kurbeln</li><li>${K('&larr;')}${K('&rarr;')} / ${K('&uarr;')}${K('&darr;')} Instrument stellen</li><li>${K('Shift')} fein</li><li>${K('V')} ins Instrument schauen</li><li>${K('F')} mit der Granate fliegen</li><li>${K('[')} ${K(']')} Zeit</li><li>${K('F1')} Hilfe</li>`,
    gunName: 'Dicke Bertha',
    gunCall: '42 cm M-Ger&auml;t, KMK-Batterie 3',
    score: 'Punkte',
    clock: 'Uhrzeit',
    hp: 'Gesch&uuml;tz',
    helpTitle: 'Die Bedienung',
    help: `<ol>
      <li><b>1 Batterief&uuml;hrer</b>: der Fernsprecher l&auml;utet. ${K('E')} halten, um den Befehl zu wiederholen. Die Befehlskarte (oben links) zeigt dann Ziel, Geschoss, Z&uuml;nder, Ladung, Seite und Erh&ouml;hung.</li>
      <li><b>3 H&ouml;henrichtkanonier</b>: geladen wird mit waagerechtem Rohr. ${K('S')} kurbelt es auf den Ladewinkel (2&deg;).</li>
      <li><b>4 Ladekanonier</b>: ${K('E')} &ouml;ffnet den Verschluss (und wirft die alte H&uuml;lse aus). ${K('Q')} w&auml;hlt das Geschoss, ${K('Z')} den Z&uuml;nder, dann ${K('E')} halten zum Aufkranen und noch einmal ${K('E')} zum Ansetzen. ${K('E')} f&uuml;hrt je Ladungsnummer eine Vorkartusche ein, ${K('R')} die Hauptkartusche, ${K('E')} schlie&szlig;t den Verschluss.</li>
      <li><b>3 H&ouml;henrichtkanonier</b>: ${K('&uarr;')}${K('&darr;')} stellt den Quadranten auf die befohlene Erh&ouml;hung, dann ${K('W')} das Rohr heben, bis die Libelle einspielt. ${K('Shift')} f&uuml;r das Feinrad; ${K('V')} zum Instrument.</li>
      <li><b>2 Seitenrichtkanonier</b>: ${K('&larr;')}${K('&rarr;')} stellt die Seite am Rundblickfernrohr, dann ${K('A')} ${K('D')} die Lafette schwenken, bis die rot-wei&szlig;e Richtlatte am senkrechten Faden steht (${K('V')} ins Fernrohr).</li>
      <li><b>5 Abzugskanonier</b>: geladen und gerichtet ${K('E')} halten. Pfiff, alle halten sich die Ohren zu, und der Schuss geht.</li>
      <li>Die Granate fliegt 30 bis 60 s (${K('F')} fliegt mit, ${K(']')} schneller). Der Beobachter meldet die Lage, die Feuerleitung schickt die Verbesserung. Ein Schuss unter 60 m bringt das Wirkungsschie&szlig;en.</li>
    </ol><p>Strich: 6400 auf den Kreis (17,8 auf den Grad). Nach dem zweiten Schuss hat der Engl&auml;nder Sie gefunden: weiterfeuern.</p>`,
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
    legend: (tof) => `&#10003;&#10003; = Instrument gestellt, Gesch&uuml;tz gerichtet &middot; ${tof} s Flugzeit`,
    hold: 'halten',
    sightSet: 'Rundblickfernrohr', ordered: 'Befehl',
    postNow: (o) => `Richtlatte: <b>${o === 0 ? 'am Faden' : `${Math.abs(o)} Strich ${o > 0 ? 'rechts' : 'links'}`}</b> ${o === 0 ? '<i class="ok">&#10003;</i>' : `(<kbd>${o > 0 ? 'D' : 'A'}</kbd> halten)`}`,
    barrelNow: (d, l) => `Rohr: <b>${d}&deg;</b> <small>(Ladewinkel ${l}&deg;)</small>`,
    travKeys: `${K('&larr;')}${K('&rarr;')} Teilung stellen &middot; ${K('A')}${K('D')} Lafette schwenken &middot; ${K('Shift')} fein &middot; ${K('V')}`,
    travLook: (on) => (on ? 'zur&uuml;ck' : 'ins Fernrohr'),
    travHint: 'Die befohlene Seite am Fernrohr stellen, dann die Lafette schwenken, bis die Richtlatte am senkrechten Faden steht.',
    quadSet: 'Libellenquadrant',
    elevKeys: `${K('&uarr;')}${K('&darr;')} Quadrant stellen &middot; ${K('W')}${K('S')} Rohr heben/senken &middot; ${K('Shift')} fein &middot; ${K('V')}`,
    elevLook: (on) => (on ? 'zur&uuml;ck' : 'Quadrant'),
    elevLower: 'Das Rohr auf den Ladewinkel senken (S): zum Laden spielt die Libelle keine Rolle.',
    elevLay: 'Die befohlene Erh&ouml;hung am Quadranten stellen, dann kurbeln, bis die Libelle einspielt.',
    elevOpen: ' Der Verschluss ist offen: das Rohr bleibt im Ladewinkel.',
    loadShell: 'Geschoss', loadFuze: 'Z&uuml;nder', loadBags: 'Vorkartuschen im Rohr', loadCase: ' + Hauptkartusche', loadLoaded: (s, c) => ` &middot; geladen: ${s}, Ladung ${c}`,
    loadHint: '&Ouml;ffnen, aufkranen, ansetzen, je Ladungsnummer eine Vorkartusche (E), die Hauptkartusche (R), schlie&szlig;en.',
    fireLoaded: 'Geladen', fireLine: 'Seite', fireElev: 'H&ouml;he',
    fireHint: 'Geladen und gerichtet: E halten zum Abziehen. Sie stehen 15 m entfernt hinter Sands&auml;cken.',
    cmdWind: (w, n) => `Wind: ${w} m/s &middot; Schuss gesamt ${n}`,
    cmdHint: 'Den Befehl am Fernsprecher aufnehmen, dann die Posten abgehen (1 bis 5 oder Tab). Die Befehlskarte zeigt, was noch fehlt; ein leuchtender Posten hat Arbeit.',
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
    tutName: 'Ausbildung', tutExit: 'Ende', tutSkip: '&Uuml;berspringen', tutNext: 'Weiter', tutDone: 'Zur Schlacht', tutStep: (i, n) => `Schritt ${i} von ${n}`,
  },
};

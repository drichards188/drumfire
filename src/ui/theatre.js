// What the console says and measures with, by mode. The British game (the default, unchanged) speaks yards, degrees
// and minutes and the sheet 28 trench map; the WW2 mode (src/ww2/ui.js calls setUiTheatre before the panel is built)
// speaks metres and Strich (6400 to the circle) on a German grid, names its missions and observers in German, and
// may have no salient to draw (the operations away from Ypres).
import { SECTORS, LINES, lineX, gridRef, YARD, DEG } from '../sector.js';

export const TH = {
  metric: false,
  salient: true, // draw the Ypres salient (lines, places, roads, the sheet grid)
  sectors: SECTORS,
  ref: gridRef,
  refHint: 'J.14.c.3.7 : sheet 28, square, quarter, 50-yard tenths',
  sosX: (z) => lineX(LINES.britishFront, z) + 120,
  sos: 'S.O.S.',
  lines: null, // { own: { key, label, colour }, enemy: {...} } or null for the British labels
  orderStamp: 'F.O.',
  hq: 'Group H.Q.',
  fit: null, // (sim, unit) => { cx, cz, w, h } for the board's FIT, or null for the British fit
  // (unit) => how the reports and the missions list name a battery, or null for the British words (its full name on
  // a report, its type on the list); the German pages give its callsign, as the board and the tabs do
  unitName: null,
  // IDLE on a battery's tab means it has no mission (ui/panel.js; STANDBY: on one, the guns not at work): the German
  // battles. Otherwise IDLE is the guns' state, as in the British game and the special missions' drills (the Paris
  // Gun, the V-weapons, the Gustav siege), whose guns take no fire missions
  idleMission: false,
};

export function setUiTheatre(t) {
  Object.assign(TH, t);
}

export const STRICH = (2 * Math.PI) / 6400;
// one unit of length on the console (a yard or a metre), its name and its short name
export const lenU = () => (TH.metric ? 1 : YARD);
export const lenName = () => (TH.metric ? 'metres' : 'yards');
export const lenShort = () => (TH.metric ? 'm' : 'yds');
// an angle in Strich, as the German sight and the order give it: "48-20"
export function strich(rad, w = 4) {
  let s = Math.round((((rad / STRICH) % 6400) + 6400) % 6400);
  const t = String(s).padStart(w, '0');
  return w >= 4 ? `${t.slice(0, -2)}-${t.slice(-2)}` : t;
}
export { DEG };

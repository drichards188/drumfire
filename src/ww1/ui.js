// The console's words and measures for the WW1 German mode (ui/theatre.js), set once before the panel is built, as
// src/ww2/ui.js does for the WW2 mode: metres and Strich, the 1918 German names of the missions, the observers and
// the fuzes (docs/WW1.md "Words"), the Planquadrat reference (ww1/grid.js), the Arko as the voice of the orders, and
// the board's lines turned round (ours are the German trenches of 1917). Also the console's rows for the WW1 kinds
// (common.js KINDS and KIND_SHORT), which only this mode's pages use.
import { setUiTheatre } from '../ui/theatre.js';
import { reachFit } from '../ui/board.js';
import { MISSION_NAME, OBSERVER, FUZE, KINDS, KIND_SHORT } from '../ui/consoles/common.js';
import { LINES, lineX } from '../sector.js';
import { ww1Ref, WW1_REF_HINT } from './grid.js';
import { parisOverlay, parisHover } from '../ui/consoles/parisMap.js';
import { MANNABLE } from '../ww2/gunner.js';

export const WW1_KINDS = {
  bertha: { pieces: 1, title: '42 CM M-GERÄT "DICKE BERTHA"', note: 'The siege howitzer: 810 kg shells to 12 km against the heaviest works and the British heavies in their pits', rounds: [1, 2], fuzes: ['instant', 'delay'], charges: 4 },
  m16: { pieces: 2, title: '21 CM MÖRSER 16', note: 'Two heavy mortars, 113 kg shells plunging onto gun pits, dugouts and dumps', rounds: [1, 2, 3, 4], fuzes: ['instant', 'delay'], charges: 4 },
  sfh13: { pieces: 4, title: '15 CM sFH 13', note: 'Battery of four heavy field howitzers, 42 kg shells: the Sperrfeuer, the Feuerwalze and the field batteries', rounds: [1, 2, 4, 6, 8], fuzes: ['instant', 'delay'], charges: 4 },
  k17: { pieces: 2, title: '10 CM KANONE 17', note: 'Two long guns, 18.5 kg shells to 16 km: the rear, the roads, the balloon; shrapnel on the traffic', rounds: [1, 2, 4, 8], fuzes: ['instant', 'delay', 'shrapnel'], charges: 2, deep: true },
  max38: { pieces: 1, title: '38 CM SK L/45 "LANGER MAX"', note: 'A naval gun on its railway mounting: 750 kg shells anywhere on the map, a slow cycle', rounds: [1, 2, 3], fuzes: ['instant', 'delay'], charges: 3, deep: true },
  gamma: { pieces: 1, title: '42 CM GAMMA-MÖRSER', note: 'The fortress mortar on its concrete bed: 1,160 kg shells, high angle only, a narrow arc', rounds: [1, 2], fuzes: ['instant', 'delay'], charges: 4 },
  paris: { pieces: 1, title: 'PARIS-GESCHÜTZ', note: 'The long-range gun: one shell at a time at military targets 120 km off the map, on the Armee\'s orders; every round wears the bore', rounds: [1], fuzes: ['instant'], charges: 1, deep: true },
};
const SHORT = { bertha: '42 cm M', m16: '21 cm Mrs', sfh13: '15 cm sFH', k17: '10 cm K', max38: '38 cm SK', gamma: '42 cm γ', paris: 'Paris' };

export function ww1Ui(th) {
  const battle = (th.op?.kind ?? 'battle') === 'battle';
  Object.assign(KINDS, WW1_KINDS);
  Object.assign(KIND_SHORT, SHORT);
  Object.assign(MISSION_NAME, { cb: 'GEGENBATTERIE', destroy: 'ZERSTÖRUNG', sos: 'SPERRFEUER', harass: 'STÖRUNGSFEUER', barrage: 'FEUERWALZE', wire: 'DRAHTZERSTÖRUNG' });
  Object.assign(OBSERVER, {
    foo: 'V.B. (forward observer)', air: 'Artillerieflieger', balloon: 'Fesselballon', sound: 'Schallmeßtrupp',
    flash: 'Lichtmeßtrupp', map: 'Karte (map shoot)', railspot: 'Bahnbeobachter',
  });
  Object.assign(FUZE, {
    instant: { main: 'AZ o.V.', sub: 'instant' },
    delay: { main: 'AZ m.V.', sub: 'delay' },
    shrapnel: { main: 'DOPP.Z.', sub: 'shrapnel' },
  });
  setUiTheatre({
    metric: true,
    mannable: MANNABLE, // the guns the player can serve in person (ww2/gunner.js): MAN on the guns card
    mppMax: 120,
    salient: battle, // the Ypres map: the lines, places and roads (our front is the German line of 1917)
    sectors: th.sectors ?? [],
    // the Paris Gun's mission: a map wide enough for its targets 120 km off, drawn by ui/consoles/parisMap.js
    ...(th.op?.kind === 'paris' ? {
      mppMax: 450, overlay: parisOverlay, hoverText: parisHover,
      boardHint: 'click a target: lay the gun on it   drag: pan   wheel: zoom   FIT: the gun and its targets',
      fitTip: 'Fit the gun and its four targets, about 120 km west', aimTip: 'Centre on the target the gun is laid on',
    } : {}),
    ref: th.ref ?? ww1Ref,
    refHint: WW1_REF_HINT,
    // the Sperrfeuer falls just in front of our wire, on the British side
    sosX: (z) => lineX(LINES.germanFront, z) - 120,
    sos: 'SPERRFEUER',
    lines: battle ? { british: 'ENEMY FRONT LINE', german: 'OUR FRONT LINE' } : null,
    orderStamp: 'Feuerbefehl',
    hq: 'Arko (artillery commander)',
    observerFrom: {
      foo: 'V.B., B-Stelle', air: 'Artillerieflieger (Funk)', balloon: 'Fesselballon (Fernsprecher)', sound: 'Schallmeßtrupp',
      flash: 'Lichtmeßtrupp', map: 'Arko', railspot: 'Bahnbeobachter',
    },
    // FIT: the selected battery and its reach (board.js reachFit); for the Paris Gun every unit and site, with its
    // targets 120 km west
    fit: (sim, unit) => {
      if (unit && unit.kind !== 'paris') return reachFit(sim, unit);
      const pts = [...sim.units.map((u) => u.pos), ...sim.targets.filter((t) => !t.offmap).map((t) => t.pos)];
      if (unit?.kind === 'paris') for (const T of unit.special?.targets ?? []) pts.push({ x: T.x, z: T.z });
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      // the Paris Gun's map: room round the targets for their names and the inset
      const m = unit?.kind === 'paris' ? 0.45 * (x1 - x0) : 1200;
      return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: Math.max(2000, x1 - x0 + m), h: Math.max(2000, z1 - z0 + m) };
    },
  });
}

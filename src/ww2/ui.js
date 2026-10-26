// The console's words and measures for the WW2 mode (ui/theatre.js), set once before the panel is built.
import { setUiTheatre } from '../ui/theatre.js';
import { MISSION_NAME, OBSERVER, FUZE } from '../ui/consoles/common.js';
import { LINES, lineX } from '../sector.js';
import { ww2Ref } from './theatre.js';
import { MANNABLE } from './gunner.js';

export function ww2Ui(th) {
  const op = th.op, battle = op.kind === 'battle';
  Object.assign(MISSION_NAME, { cb: 'GEGENBATTERIE', destroy: 'ZERSTÖRUNG', sos: 'SPERRFEUER', harass: 'STÖRUNGSFEUER', barrage: 'FEUERWALZE', wire: 'DRAHT' });
  Object.assign(OBSERVER, { foo: 'VB (forward observer)', air: 'Storch (air observer)', sound: 'Schall- und Lichtmeß', map: 'Kartenschießen', railspot: 'Bahnbeobachter', balloon: 'Fesselballon' });
  Object.assign(FUZE, {
    instant: { main: 'AZ o.V.', sub: 'instant' },
    delay: { main: 'AZ m.V.', sub: 'delay' },
    shrapnel: { main: 'ZEITZ.', sub: 'airburst' },
  });
  setUiTheatre({
    metric: true,
    mppMax: 120,
    salient: battle,
    sectors: th.sectors,
    ref: ww2Ref,
    refHint: 'r 54.32  h 46.87 : the grid in km (Rechtswert, Hochwert)',
    sosX: (z) => lineX(LINES.germanFront, z) - 120,
    sos: 'SPERRFEUER',
    lines: battle ? { british: 'ENEMY FRONT LINE', german: 'OUR FRONT LINE' } : null,
    orderStamp: 'Feuerkdo.',
    mannable: MANNABLE, // the guns the player can serve in person (gunner.js): MAN on the guns card
    hq: 'Arko (artillery commander)',
    observerFrom: { foo: 'VB, forward post', air: 'Storch (wireless)', sound: 'Schallmeßtrupp', map: 'Arko', railspot: 'Bahnbeobachter' },
    // FIT: every unit and every site of the operation, with a margin
    fit: (sim, unit) => {
      const pts = [...sim.units.map((u) => u.pos), ...sim.targets.map((t) => t.pos), ...(op.positions ?? []).map((q) => q.pos)];
      if (op.target) {
        // the strategic missions: the site and 12 km of the way out
        pts.push({ x: unit.pos.x + Math.sin(op.target.bearing) * 12000, z: unit.pos.z - Math.cos(op.target.bearing) * 12000 });
      }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: Math.max(2000, x1 - x0 + 1200), h: Math.max(2000, z1 - z0 + 1200) };
    },
  });
}

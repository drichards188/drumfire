// The WW1 German mode's observers: the WW2 mode's German fall-of-shot reports in metres ("weiter 200, links 50") from
// the VB (vorgeschobener Beobachter) by telephone, the Flieger (an artillery aeroplane, by wireless: rounded to 50 m,
// loses rounds more often) and the Fesselballon; the Schallmeßtrupp and Lichtmeßtrupp (observer 'sound') and the
// Kartenschießen ('map') give no reports. The director (director.js obsName) names them.
import { ObserversWW2 } from '../ww2/observers.js';

export class ObserversWW1 extends ObserversWW2 {
  // a threat level's tank laager: the observer reads the burst against the tank the guns are laid on (director.js); the
  // kite balloon's against its winch on the ground, the mission's target (the balloon itself rides 250 m downwind)
  refPoint(m) {
    if (m.aimPart) return { x: m.aimPart.x, z: m.aimPart.z };
    const t = m.targetId ? this.sim.targetById(m.targetId) : null;
    if (t?.kind === 'bballoon' && t.parts[1]) return { x: t.parts[1].x, z: t.parts[1].z };
    return super.refPoint(m);
  }
}

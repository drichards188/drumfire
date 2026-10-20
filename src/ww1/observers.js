// The WW1 German mode's observers: the WW2 mode's German fall-of-shot reports in metres ("weiter 200, links 50") from
// the VB (vorgeschobener Beobachter) by telephone, the Flieger (an artillery aeroplane, by wireless: rounded to 50 m,
// loses rounds more often) and the Fesselballon; the Schallmeßtrupp and Lichtmeßtrupp (observer 'sound') and the
// Kartenschießen ('map') give no reports. The director (director.js obsName) names them.
import { ObserversWW2 } from '../ww2/observers.js';

export class ObserversWW1 extends ObserversWW2 {}

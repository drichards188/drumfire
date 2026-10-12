// The message log: observers' reports, wireless from the aeroplanes, tasks from Group. Collected from
// the sim's missions and reports each frame (nothing to wire), plus whatever main forwards from
// `sim.events.radio` through Panel.radio(). Slips are plain data; consoles/messagePad.js draws them.
import { YARD } from '../sector.js';
import { ref, MISSION_NAME, sectorAt } from './consoles/common.js';

const FROM = {
  foo: 'F.O.O., forward post', air: 'R.F.C. aeroplane (wireless)', balloon: 'Kite balloon section', sound: 'Sound-ranging section',
  map: 'Group H.Q.',
};
const CODE = { Y: 10, Z: 25, A: 50, B: 100, C: 200, D: 300, E: 400, F: 500 };
export const CLOCK_YARDS = CODE;
export function parseClock(c) {
  const m = c && /^([YZABCDEF])\s*(\d{1,2})$/i.exec(c);
  return m ? { letter: m[1].toUpperCase(), hour: Number(m[2]), yards: CODE[m[1].toUpperCase()] } : null;
}

const r5 = (m) => Math.round(m / YARD / 5) * 5;

export class Mail {
  constructor(onSlip) {
    this.slips = [];          // newest first
    this.onSlip = onSlip;
    this.seenReports = new Set();
    this.seenMissions = new Set();
    this.n = 0;
    this.lastText = new Map();
  }
  reset() { this.slips.length = 0; this.seenReports.clear(); this.seenMissions.clear(); this.lastText.clear(); }

  push(s, sim) {
    s.id = ++this.n;
    s.clock = s.clock != null ? s.clock : sim.clock;
    const last = this.lastText.get(s.text);
    if (last != null && (sim.time || 0) - last < 3) return;
    this.lastText.set(s.text, sim.time || 0);
    this.slips.unshift(s);
    if (this.slips.length > 14) this.slips.length = 14;
    if (this.onSlip) this.onSlip(s);
  }

  scan(sim, tracker) {
    const fresh = [];
    for (const m of sim.missions || []) {
      if (!this.seenMissions.has(m.id)) {
        this.seenMissions.add(m.id);
        if (m.state === 'open' || m.state === 'ranging' || m.state === 'ffe') {
          const r = m.gridRef || ref(m.x, m.z);
          const dl = m.deadline != null ? ` Engage within ${Math.max(1, Math.round((m.deadline - (sim.time || 0)) / 60))} minutes.` : '';
          const what = m.kind === 'sos' ? `S.O.S. called on ${sectorAt(m.z).name} front. All guns to the S.O.S. line.` : `${m.title || MISSION_NAME[m.kind]} at ${r}.${dl}`;
          fresh.push({ kind: 'order', from: 'Group H.Q.', text: what, mission: m.id, tag: `TASK ${m.id}`, clock: sim.clock - ((sim.time || 0) - (m.t0 || 0)) / 3600 });
        }
      }
      for (const rp of m.reports || []) {
        const k = `${m.id}:${rp.shellId}:${rp.t}`;
        if (this.seenReports.has(k)) continue;
        this.seenReports.add(k);
        const air = m.observer === 'air';
        const hasErr = rp.over != null && rp.right != null;
        const slip = {
          kind: air ? 'wireless' : m.observer === 'sound' ? 'sound' : 'phone', from: FROM[m.observer] || 'Observer', mission: m.id, unitId: rp.unitId,
          text: rp.text, clock: sim.clock - ((sim.time || 0) - rp.t) / 3600, code: air ? parseClock(rp.clock) : null, rawCode: rp.clock,
          round: tracker ? tracker.numbers.get(rp.shellId) : null, ok: !!rp.ok,
          corr: hasErr && !rp.ok ? { add: -rp.over, right: -rp.right } : null, tag: `M${m.id}`,
        };
        if (slip.corr) {
          const a = r5(slip.corr.add), r = r5(slip.corr.right);
          slip.note = [a ? `${a > 0 ? 'ADD' : 'DROP'} ${Math.abs(a)}` : '', r ? `${r > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(r)}` : ''].filter(Boolean).join(', ') || 'no correction';
        } else if (rp.ok) slip.note = 'ON TARGET. Fire for effect.';
        fresh.push(slip);
      }
    }
    // several arriving in one frame (a loaded game, the first frame) go in in the order they happened
    fresh.sort((a, b) => a.clock - b.clock);
    for (const s of fresh) this.push(s, sim);
  }

  radio(text, kind, sim) {
    if (!text) return;
    const k = kind === 'wireless' ? 'wireless' : kind === 'phone' ? 'phone' : kind === 'alert' ? 'alert' : kind === 'warn' ? 'alert' : kind === 'kill' ? 'kill' : 'order';
    if (kind === 'info') return;           // the task slips already tell this
    this.push({ kind: k, from: k === 'wireless' ? 'Wireless' : k === 'phone' ? 'Telephone' : k === 'kill' ? 'Observer' : 'Group H.Q.', text, tag: '' }, sim);
  }
}

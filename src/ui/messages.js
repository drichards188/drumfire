// The message log: observers' reports, wireless from the aeroplanes, tasks from Group. Collected from
// the sim's missions and reports each frame (nothing to wire), plus whatever main forwards from
// `sim.events.radio` through Panel.radio(). Slips are plain data; consoles/messagePad.js draws them.
import { YARD } from '../sector.js';
import { ref, MISSION_NAME, sectorAt } from './consoles/common.js';

const FROM = {
  foo: 'F.O.O., forward post', air: 'R.F.C. aeroplane (wireless)', balloon: 'Kite balloon section', sound: 'Sound-ranging section',
  map: 'Group H.Q.', railspot: 'Rail spotters',
};
const CODE = { Y: 10, Z: 25, A: 50, B: 100, C: 200, D: 300, E: 400, F: 500 };
export const CLOCK_YARDS = CODE;
export function parseClock(c) {
  const m = c && /^([YZABCDEF])\s*(\d{1,2})$/i.exec(c);
  return m ? { letter: m[1].toUpperCase(), hour: Number(m[2]), yards: CODE[m[1].toUpperCase()] } : null;
}

const r5 = (m) => Math.round(m / YARD / 5) * 5;
export const corrText = (c) => {
  const a = r5(c.add), r = r5(c.right);
  return [a ? `${a > 0 ? 'ADD' : 'DROP'} ${Math.abs(a)}` : '', r ? `${r > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(r)}` : ''].filter(Boolean).join(', ');
};

// A report corrects the lay its round was fired with. Read against the lay of now (corrections made since come
// off), so applying an older report never doubles a correction already made. `null` when the slip no longer
// applies: another unit's, a newer report on the same task, or the unit has been laid on another target since.
export function slipCorr(s, unit) {
  if (!s.corr || !unit || s.unitId !== unit.id || s.superseded) return null;
  const o = unit.order;
  if (!o || !o.target) return null;
  if (s.tgt0 && Math.hypot(o.target.x - s.tgt0.x, o.target.z - s.tgt0.z) > 150) return null;
  const a0 = s.adj0 || o.adj || { add: 0, right: 0 }, a = o.adj || { add: 0, right: 0 };
  // The pad prints five-yard increments; apply those same increments to the order.
  return {
    add: r5(s.corr.add + a0.add - a.add) * YARD,
    right: r5(s.corr.right + a0.right - a.right) * YARD,
  };
}

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
  clear() { this.slips.length = 0; this.lastText.clear(); }

  push(s, sim) {
    s.id = ++this.n;
    s.clock = s.clock != null ? s.clock : sim.clock;
    const last = this.lastText.get(s.text);
    if (last != null && (sim.time || 0) - last < 3 && s.task == null) return; // two guns' reports may read alike
    this.lastText.set(s.text, sim.time || 0);
    this.slips.unshift(s);
    if (this.slips.length > 40) this.slips.length = 40;
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
        const f = tracker ? tracker.fired.get(rp.shellId) : null;
        const u = (sim.units || []).find((q) => q.id === rp.unitId);
        const piece = f ? f.piece : rp.piece;
        const slip = {
          kind: air ? 'wireless' : m.observer === 'sound' ? 'sound' : 'phone', from: FROM[m.observer] || 'Observer', mission: m.id, unitId: rp.unitId,
          text: rp.text, clock: sim.clock - ((sim.time || 0) - rp.t) / 3600, code: air ? parseClock(rp.clock) : null, rawCode: rp.clock,
          round: tracker ? tracker.numbers.get(rp.shellId) : null, ok: !!rp.ok,
          corr: hasErr && !rp.ok ? { add: -rp.over, right: -rp.right } : null, tag: `M${m.id}`,
          // battery and gun that fired the round, plus the lay it went with
          battery: u?.name || '', gun: piece != null && (u?.pieces?.length || 1) > 1 ? piece + 1 : null,
          adj0: f?.adj || null, tgt0: f?.target || null,
          task: m.id, title: m.title || MISSION_NAME[m.kind] || '',
        };
        if (slip.corr) slip.note = corrText(slip.corr) || 'no correction';
        else if (rp.ok) slip.note = 'ON TARGET. Fire for effect.';
        fresh.push(slip);
      }
    }
    // several arriving in one frame (a loaded game, the first frame) go in in the order they happened
    fresh.sort((a, b) => a.clock - b.clock);
    for (const s of fresh) {
      // a newer report on the same task replaces the older ones: only the latest fall of shot is corrected from
      if (s.unitId != null && (s.corr || s.ok)) for (const o of this.slips) if (o.unitId === s.unitId && o.mission === s.mission && o.corr && !o.applied) o.superseded = s.round || true;
      this.push(s, sim);
    }
  }

  radio(text, kind, sim) {
    if (!text) return;
    const k = kind === 'wireless' ? 'wireless' : kind === 'phone' ? 'phone' : kind === 'alert' ? 'alert' : kind === 'warn' ? 'alert' : kind === 'kill' ? 'kill' : 'order';
    if (kind === 'info') return;           // the task slips already tell this
    this.push({ kind: k, from: k === 'wireless' ? 'Wireless' : k === 'phone' ? 'Telephone' : k === 'kill' ? 'Observer' : 'Group H.Q.', text, tag: '' }, sim);
  }
}

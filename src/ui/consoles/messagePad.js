// The message pad: written slips, newest on top (telephone messages from the F.O.O.s in yards, wireless
// from the aeroplanes in the RFC clock code, the sound rangers, tasks from Group), with the pencilled
// correction the battery commander works out, and under them the clock-code diagram that decodes the
// latest aeroplane report: the target at the centre, twelve o'clock true north, rings Y to F.
import { el, setText, setCls, card, snd, hw } from '../widgets.js';
import { tut } from '../highlight.js';
import { clockStr, taskNo } from './common.js';
import { CLOCK_YARDS, slipCorr, corrText } from '../messages.js';
import { DEG } from '../../sector.js';

const SERIF = "'Bitstream Charter','Liberation Serif',serif";
const TYPE = "'Courier 10 Pitch','Liberation Mono',monospace";
const KIND = {
  phone: 'TELEPHONE', wireless: 'WIRELESS', sound: 'SOUND RANGING', order: 'GROUP ORDERS', alert: 'WARNING', kill: 'REPORT',
};
const DIR = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export class MessagePad {
  constructor({ apply }) {
    this.apply = apply;
    const c = card('MESSAGES AND SIGNALS', 'Army Form C.2121', 'pad');
    this.el = c.el;
    this.list = el('div', 'slips');
    this.cv = el('canvas', 'clock');
    this.decode = el('div', 'cdec', 'RFC clock code: letter = distance, number = hour');
    const lower = el('div', 'clk');
    tut(lower, 'clock'); tut(this.list, 'slips');
    lower.append(this.cv, this.decode);
    c.body.append(this.list, lower);
    this.g = this.cv.getContext('2d');
    this.shown = new Map();
    this.ids = '';
    this.clockKey = '';
    this.dpr = 0;
    this.latest = null;
  }

  build(s) {
    const e = el('div', `slip ${s.kind}`);
    e.style.setProperty('--rot', `${((s.id * 37) % 21 - 10) / 8}deg`);
    const head = el('div', 'sh');
    head.append(el('b', null, KIND[s.kind] || 'MESSAGE'), el('i', null, `${s.from}`), el('span', 'stime', clockStr(s.clock)));
    const body = el('div', 'sb');
    // round, battery, gun, and task for this report
    if (s.round || s.battery || s.task != null) {
      const who = el('div', 'sfor');
      if (s.round) who.append(el('span', 'sround', `Round ${s.round}`));
      if (s.battery) who.append(el('span', 'sbattery', s.battery));
      const bits = [s.gun ? `No. ${s.gun} gun` : '', s.task != null ? `${taskNo(s.task)} ${s.title || ''}`.trim() : ''].filter(Boolean);
      if (bits.length) who.append(el('span', 'swho', bits.join(' · ')));
      body.append(who);
    }
    const dup = s.code && s.text.replace(/\s/g, '').toUpperCase().includes(s.rawCode.replace(/\s/g, '').toUpperCase());
    if (s.code) body.append(el('span', 'scode', s.rawCode));
    if (!dup) body.append(el('span', 'stext', s.text));
    e.append(head, body);
    if (s.note) {
      const n = el('button', 'snote');
      n.type = 'button';
      n.tabIndex = -1;
      const lab = el('i', null, s.corr ? 'Corr.' : 'Note'), txt = el('b', null, s.note);
      n.append(lab, txt);
      e._note = { lab, txt, key: '' };
      if (s.corr) {
        tut(n, 'apply');
        n.append(el('em', null, 'apply'));
        n.addEventListener('pointerdown', (ev) => { ev.preventDefault(); snd('click'); this.apply(s); });
      }
      e.append(n);
    }
    return e;
  }

  update({ mail, unit }) {
    // this unit's reports, and everything addressed to the whole Group (tasks, warnings)
    const slips = mail.slips.filter((s) => s.unitId == null || s.unitId === unit.id);
    const ids = slips.map((s) => s.id).join(',');
    if (ids !== this.ids) {
      this.ids = ids;
      for (const s of slips) if (!this.shown.has(s.id)) { const e = this.build(s); e.classList.add('new'); this.shown.set(s.id, e); setTimeout(() => e.classList.remove('new'), 900); }
      this.list.replaceChildren(...slips.map((s) => this.shown.get(s.id)));
      for (const id of this.shown.keys()) if (!slips.some((s) => s.id === id)) this.shown.delete(id);
    }
    for (const s of slips) {
      const e = this.shown.get(s.id);
      if (!e) continue;
      setCls(e, 'applied', !!s.applied);
      if (!s.corr || !e._note || s.applied) continue;
      // the pencilled correction is kept against the lay of now; an older or outdated report is struck off
      const c = slipCorr(s, unit), t = c && corrText(c);
      const lab = s.superseded ? 'Old' : !c ? 'Old' : t !== s.note ? 'Corr. now' : 'Corr.';
      const txt = s.superseded ? `superseded by ${s.superseded === true ? 'a later report' : `round ${s.superseded}`}` : !c ? 'laid on another target since' : t || 'already made';
      const key = lab + txt;
      if (key === e._note.key) continue;
      e._note.key = key;
      setText(e._note.lab, lab); setText(e._note.txt, txt);
      setCls(e, 'old', !c || !t);
    }
    // the clock diagram follows the latest aeroplane report
    const latest = slips.find((s) => s.code) || null;
    const key = `${latest ? latest.id : 0}|${hw.scale}|${unit.id}|${unit.order && unit.order.line ? unit.order.line.toFixed(2) : 0}`;
    if (key !== this.clockKey) { this.clockKey = key; this.drawClock(latest, unit); }
  }

  drawClock(s, unit) {
    const cv = this.cv, g = this.g;
    const css = 118, dpr = Math.min(2, window.devicePixelRatio || 1) * (hw.scale || 1);
    if (cv.width !== Math.round(css * dpr)) { cv.width = cv.height = Math.round(css * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, css, css);
    const cx = css / 2, cy = css / 2, R = css / 2 - 12;
    const rad = (yds) => 7 + (R - 7) * (Math.log(yds / 10) / Math.log(50));
    g.fillStyle = 'rgba(236,228,200,.8)'; g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,60,100,.55)'; g.lineWidth = 0.8;
    g.font = `7px ${TYPE}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const L of Object.keys(CLOCK_YARDS)) {
      const r = rad(CLOCK_YARDS[L]);
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#26356a'; g.fillText(L, cx + 0.5, cy - r - 0.5 + (L === 'Y' ? 0 : 0));
    }
    g.lineWidth = 0.6;
    for (let h = 1; h <= 12; h++) {
      const a = h * 30 * DEG, s0 = Math.sin(a), c0 = -Math.cos(a);
      g.beginPath(); g.moveTo(cx + s0 * 5, cy + c0 * 5); g.lineTo(cx + s0 * R, cy + c0 * R); g.stroke();
      g.fillStyle = h === 12 ? '#a8241b' : '#1b1913'; g.font = `${h === 12 ? 'bold ' : ''}9px ${TYPE}`;
      g.fillText(String(h), cx + s0 * (R + 5.5), cy + c0 * (R + 5.5));
    }
    // the battery lies along the line of fire behind the target
    if (unit.order && unit.order.target) {
      const b = unit.order.line + Math.PI, bx = cx + Math.sin(b) * (R - 2), by = cy - Math.cos(b) * (R - 2);
      g.strokeStyle = 'rgba(29,63,143,.7)'; g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#1d3f8f'; g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#a8241b'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(cx - 4, cy); g.lineTo(cx + 4, cy); g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 4); g.stroke();
    if (s && s.code) {
      const { letter, hour, yards } = s.code;
      const a = hour * 30 * DEG, r = rad(yards);
      const px = cx + Math.sin(a) * r, py = cy - Math.cos(a) * r;
      g.strokeStyle = '#a8241b'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px - 4, py - 4); g.lineTo(px + 4, py + 4); g.moveTo(px + 4, py - 4); g.lineTo(px - 4, py + 4); g.stroke();
      g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.lineWidth = 1; g.stroke();
      const comp = DIR[Math.round(((hour % 12) * 30) / 22.5) % 16];
      setText(this.decode, `${s.rawCode}: ${yards} yds, ${hour} o'clock (${comp} of target)`);
    } else setText(this.decode, 'RFC clock code: letter = distance in yards, number = hour, 12 = true north');
  }
}

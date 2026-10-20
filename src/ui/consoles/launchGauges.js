// INSTRUMENTS for a launch site (consoles/launch.js): round gauges on an enamel panel, drawn on one canvas from
// unit.special.gauges (src/ww2/special.js pose()). The V-1: petrol, compressed air, the steam generator's test
// pressure (and the speed it gives off the ramp), the pulse jet, the compass and the air log as set. The A4: alcohol
// (and T-Stoff), liquid oxygen (boiling off, with the line below which it falls short), the gyros, the flame of the
// Vorstufe and Hauptstufe, the table bearing and the Brennschluss speed. The faces, scales and bezels are drawn once
// into a layer (again on a resize); each frame draws only the needles, lamps and readings.
import { el, card, hw } from '../widgets.js';
import { tut } from '../highlight.js';

const TAU = Math.PI * 2;
const SERIF = "'Bitstream Charter','Liberation Serif','DejaVu Serif',Georgia,serif";
const TYPE = "'Courier 10 Pitch','Liberation Mono','FreeMono',monospace";
const A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5; // the scale runs from 7:30 round to 4:30

// the panel's instruments in reading order (two columns, three rows)
const SPEC = {
  v1: [
    { k: 'dial', key: 'fuel', title: 'PETROL', unit: 'litres', max: 600, ticks: [0, 200, 400, 600] },
    { k: 'dial', key: 'air', title: 'COMPRESSED AIR', unit: 'bar', max: 160, ticks: [0, 40, 80, 120, 160] },
    { k: 'dial', key: 'steam', title: 'STEAM GENERATOR', unit: 'bar', max: 80, ticks: [0, 20, 40, 60, 80], red: [0, 50] },
    { k: 'lamp', key: 'jet' },
    { k: 'rose', key: 'compass', title: 'COMPASS SET' },
    { k: 'counter', key: 'airlog', title: 'AIR LOG SET', unit: 'km of air distance', n: 5 },
  ],
  v2: [
    { k: 'dial', key: 'alc', title: 'B-STOFF (alcohol)', unit: 't', max: 4, ticks: [0, 1, 2, 3, 4] },
    { k: 'dial', key: 'lox', title: 'A-STOFF (LOX)', unit: '%', max: 100, ticks: [0, 25, 50, 75, 100], red: [0, 92], soft: true },
    { k: 'dial', key: 'gyro', title: 'GYROS', unit: 'rpm %', max: 100, ticks: [0, 50, 100], red: [0, 90], soft: true },
    { k: 'lamp', key: 'flame' },
    { k: 'rose', key: 'table', title: 'TABLE BEARING' },
    { k: 'counter', key: 'cutoff', title: 'BRENNSCHLUSS', unit: 'm/s at cut-off', n: 4 },
  ],
};

export class GaugesCard {
  constructor({ kind }) {
    this.kind = kind;
    this.spec = SPEC[kind] ?? SPEC.v1;
    const c = card('INSTRUMENTS', kind === 'v1' ? 'Feuerstellung' : 'Feuerleitpanzer', 'lgauge');
    this.el = c.el;
    tut(this.el, 'gauges');
    this.cv = el('canvas');
    c.body.append(this.cv);
    this.g = this.cv.getContext('2d');
    this.layer = document.createElement('canvas');
    this.W = 0; this.H = 0; this.dpr = 1;
    this.shown = {}; // needles ease toward their readings
    this.at = [];
    this.r = 0;
  }

  resize() {
    const cw = this.cv.clientWidth, ch = this.cv.clientHeight;
    if (!cw || !ch) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (hw.scale || 1);
    if (cw !== this.W || ch !== this.H || Math.abs(dpr - this.dpr) > 0.01) {
      this.W = cw; this.H = ch; this.dpr = dpr;
      for (const c of [this.cv, this.layer]) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      const cols = 2, rows = 3, w = cw / cols, rh = (ch - 4) / rows;
      this.r = Math.min(w * 0.34, rh * 0.31);
      this.at = this.spec.map((_, i) => [w * (i % cols) + w / 2, 2 + rh * Math.floor(i / cols) + rh * 0.47]);
      this.drawStatic();
    }
    return true;
  }

  ease(key, v, dt) {
    const s = this.shown;
    if (s[key] == null || !isFinite(s[key])) s[key] = v;
    s[key] += (v - s[key]) * Math.min(1, dt * 6);
    return s[key];
  }

  // the faces, once
  drawStatic() {
    const g = this.layer.getContext('2d'), W = this.W, H = this.H, r = this.r;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3a3a33'); bg.addColorStop(1, '#2a2a24');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // brass screws in the corners
    for (const [x, y] of [[7, 7], [W - 7, 7], [7, H - 7], [W - 7, H - 7]]) {
      g.fillStyle = '#8d6c26'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
      g.strokeStyle = '#3b2a0a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 2, y - 1); g.lineTo(x + 2, y + 1); g.stroke();
    }
    this.spec.forEach((o, i) => {
      const [x, y] = this.at[i];
      if (o.k === 'dial') this.dialFace(g, x, y, r, o);
      else if (o.k === 'rose') this.roseFace(g, x, y, r, o);
      else if (o.k === 'counter') this.counterFace(g, x, y, r, o);
      else if (o.k === 'lamp') { const R = r * 0.55; g.fillStyle = '#8d6c26'; g.beginPath(); g.arc(x, y, R + 4, 0, TAU); g.fill(); }
      if (o.title) this.title(g, x, y - (o.k === 'counter' ? r * 0.31 + 4 : r * 1.12), o.title);
    });
  }

  update(u, st, dt, now) {
    if (!this.resize()) return;
    const g = this.g, G = st.gauges || {}, r = this.r, T = now / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.layer, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.spec.forEach((o, i) => {
      const [x, y] = this.at[i], q = this.read(o.key, st, G, T);
      if (o.k === 'dial') this.needle(g, x, y, r, A0 + SWEEP * Math.max(0, Math.min(1, this.ease(o.key, q.v, dt) / o.max)));
      else if (o.k === 'rose') this.roseNeedles(g, x, y, r, q.set, q.data);
      else if (o.k === 'counter') this.digits(g, x, y, r, q.value);
      else if (o.k === 'lamp') this.lamp(g, x, y, r, q);
      this.reading(g, x, y + (o.k === 'counter' ? r * 0.31 + 14 : o.k === 'lamp' ? r * 0.69 + 2 : r * 1.14 + 1), q.text, q.sub, q.bad);
    });
  }

  // what an instrument reads now: { v | set, data | value | on, flick, title; text, sub, bad }
  read(key, st, G, T) {
    switch (key) {
      case 'fuel': return { v: G.fuel ?? 0, text: `${Math.round(G.fuel ?? 0)} l` };
      case 'air': return { v: G.air ?? 0, text: `${Math.round(G.air ?? 0)} bar` };
      case 'steam': {
        const p = G.steam ?? 0, low = p > 0 && p < (G.steamMin ?? 50) && !G.testing;
        return { v: p, text: G.testing ? `pressure test ${Math.round(p)} bar` : p > 0 ? `${Math.round(p)} bar${low ? ' LOW' : ''}` : G.charge ? `charging ${Math.round(G.charge * 100)}%` : 'empty', sub: G.rampV ? `gives ${G.rampV} km/h off the ramp` : `the red: below ${G.steamMin ?? 50} bar, a slow launch`, bad: low };
      }
      case 'jet': {
        const jet = G.jet ?? 0, v = G.speed;
        return { on: jet > 0, flick: jet > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(T * 47)) : 0, title: 'PULSE JET', text: jet > 0 ? 'RUNNING' : v ? `${v} km/h` : 'off', sub: jet > 0 ? 'full power' : v ? 'off the ramp, last launch' : '', bad: !jet && v && v < 380 };
      }
      case 'compass': return this.roseRead(st.settings.compass, st.solution.compass);
      case 'airlog': return { value: st.settings.range != null ? st.settings.range.toFixed(1).padStart(5, '0') : '---.-' };
      case 'alc': return { v: G.alc ?? 0, text: `${(G.alc ?? 0).toFixed(2)} t`, sub: `T-Stoff, Z-Stoff ${Math.round((G.tz ?? 0) * 100)}%` };
      case 'lox': {
        const lp = G.loxPct ?? 0;
        return { v: lp, text: lp > 0 ? `${lp.toFixed(1)}%  ${(G.lox ?? 0).toFixed(2)} t` : 'empty', sub: st.loxOn ? 'boiling off 0.26 t/min' : '', bad: st.loxOn && lp < (G.loxShort ?? 92) };
      }
      case 'gyro': return { v: (G.gyro ?? 0) * 100, text: G.gyro ? `${Math.round(G.gyro * 100)}%` : 'stopped', bad: G.gyro > 0 && G.gyro < 0.9 && st.fault?.id === 'gyro' };
      case 'flame': {
        const fl = G.flame ?? 0;
        return { on: fl > 0, flick: fl === 0.5 ? 0.3 + 0.7 * Math.abs(Math.sin(T * 23) * Math.sin(T * 7)) : fl ? 0.85 + 0.15 * Math.sin(T * 40) : 0, title: fl === 2 ? 'HAUPTSTUFE' : 'VORSTUFE', text: fl === 0.5 ? 'RAGGED' : fl ? `${(G.thrust ?? 0).toFixed(0)} t thrust` : 'no flame', sub: fl === 1 ? 'steady' : fl === 2 ? 'lift-off' : '', bad: fl === 0.5 };
      }
      case 'table': return this.roseRead(G.table, st.solution.compass);
      case 'cutoff': return { value: G.cutoff ? String(G.cutoff).padStart(4, '0') : '----' };
    }
    return {};
  }

  roseRead(set, data) {
    const d = set != null && data != null ? ((set - data + 540) % 360) - 180 : null;
    return { set, data, text: set != null ? `${set.toFixed(1)}°` : 'not set', sub: d != null ? (Math.abs(d) < 0.05 ? 'on the data' : `${Math.abs(d).toFixed(1)}° ${d > 0 ? 'right' : 'left'} of the data`) : 'red: the data', bad: d != null && Math.abs(d) > 0.25 };
  }

  title(g, x, y, t) {
    g.textAlign = 'center'; g.font = `bold 8.5px ${SERIF}`; g.fillStyle = '#d8cba0'; g.textBaseline = 'bottom';
    g.fillText(t, x, y - 1);
  }

  reading(g, x, y, text, sub, bad) {
    g.textAlign = 'center'; g.textBaseline = 'top';
    if (text) { g.font = `bold 10px ${TYPE}`; g.fillStyle = bad ? '#ff7a5e' : '#ffe08a'; g.fillText(text, x, y); }
    if (sub) { g.font = `italic 8.5px ${SERIF}`; g.fillStyle = '#b8ab84'; g.fillText(sub, x, y + 12); }
  }

  bezel(g, x, y, r) {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r * 1.12);
    gr.addColorStop(0, '#f2dc92'); gr.addColorStop(0.7, '#b8923a'); gr.addColorStop(1, '#5a4218');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.1, 0, TAU); g.fill();
    g.fillStyle = '#efe6cc'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
  }

  dialFace(g, x, y, r, o) {
    this.bezel(g, x, y, r);
    const ang = (v) => A0 + SWEEP * Math.max(0, Math.min(1, v / o.max));
    if (o.red) {
      g.strokeStyle = o.soft ? 'rgba(200,60,40,.45)' : 'rgba(200,40,30,.75)'; g.lineWidth = r * 0.12;
      g.beginPath(); g.arc(x, y, r * 0.82, ang(o.red[0]), ang(o.red[1])); g.stroke();
    }
    g.strokeStyle = '#2a2418'; g.lineWidth = 1;
    for (let k = 0; k <= 20; k++) {
      const a = A0 + SWEEP * k / 20, l = k % 5 ? 0.1 : 0.18;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.lineTo(x + Math.cos(a) * r * (0.9 - l), y + Math.sin(a) * r * (0.9 - l)); g.stroke();
    }
    g.font = `${Math.max(7, r * 0.2)}px ${TYPE}`; g.fillStyle = '#2a2418'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of o.ticks) { const a = ang(t); g.fillText(String(t), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); }
    g.font = `italic ${Math.max(7, r * 0.18)}px ${SERIF}`; g.fillText(o.unit, x, y + r * 0.42);
  }

  needle(g, x, y, r, a) {
    g.strokeStyle = '#8a1a10'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.15, y - Math.sin(a) * r * 0.15); g.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); g.stroke();
    g.fillStyle = '#3b2a0a'; g.beginPath(); g.arc(x, y, r * 0.09, 0, TAU); g.fill();
  }

  // the compass card or the table: the set bearing (needle) against the firing data (red mark)
  roseFace(g, x, y, r) {
    this.bezel(g, x, y, r);
    g.strokeStyle = '#2a2418'; g.lineWidth = 1;
    for (let k = 0; k < 36; k++) {
      const a = k / 36 * TAU - Math.PI / 2, l = k % 9 ? 0.08 : 0.16;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.lineTo(x + Math.cos(a) * r * (0.9 - l), y + Math.sin(a) * r * (0.9 - l)); g.stroke();
    }
    g.font = `bold ${Math.max(7, r * 0.2)}px ${SERIF}`; g.fillStyle = '#2a2418'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['N', 'E', 'S', 'W'].forEach((t, i) => { const a = i * Math.PI / 2 - Math.PI / 2; g.fillText(t, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); });
  }

  roseNeedles(g, x, y, r, set, data) {
    const dir = (deg) => deg * Math.PI / 180 - Math.PI / 2;
    if (data != null) {
      const a = dir(data);
      g.strokeStyle = 'rgba(168,36,27,.9)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); g.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98); g.stroke();
    }
    if (set != null) {
      const a = dir(set);
      g.strokeStyle = '#1d3f8f'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.3, y - Math.sin(a) * r * 0.3); g.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); g.stroke();
      g.fillStyle = '#1d3f8f'; g.beginPath(); g.arc(x, y, r * 0.08, 0, TAU); g.fill();
    }
  }

  // a mechanical counter (the air log's preset, the Brennschluss speed)
  counterFace(g, x, y, r, o) {
    const w = r * 2.1, h = r * 0.62;
    g.fillStyle = '#5a4218'; g.fillRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6);
    g.fillStyle = '#14110b'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.font = `italic 8.5px ${SERIF}`; g.fillStyle = '#b8ab84'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(o.unit, x, y + h / 2 + 5);
  }

  digits(g, x, y, r, s) {
    const w = r * 2.1, h = r * 0.62, n = s.length, cw = w / n;
    g.font = `bold ${Math.round(h * 0.7)}px ${TYPE}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const cx = x - w / 2 + cw * (i + 0.5), dot = s[i] === '.';
      g.fillStyle = dot ? '#14110b' : '#efe6cc'; g.fillRect(cx - cw * 0.42, y - h * 0.4, cw * 0.84, h * 0.8);
      g.fillStyle = dot ? '#efe6cc' : '#14110b'; g.fillText(s[i], cx, y + 1);
    }
  }

  // a jewel lamp with its title (the pulse jet, the flame)
  lamp(g, x, y, r, o) {
    const R = r * 0.55;
    const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
    if (o.on) {
      const k = o.flick;
      gr.addColorStop(0, `rgba(255,${Math.round(240 - 60 * (1 - k))},${Math.round(180 * k)},1)`); gr.addColorStop(1, `rgba(${Math.round(200 + 40 * k)},${Math.round(70 + 60 * k)},20,1)`);
    } else { gr.addColorStop(0, '#5a5446'); gr.addColorStop(1, '#1f1b12'); }
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    if (o.on) { g.fillStyle = `rgba(255,170,60,${0.25 * o.flick})`; g.beginPath(); g.arc(x, y, R * 1.9, 0, TAU); g.fill(); }
    this.title(g, x, y - R * 1.4, o.title);
  }
}

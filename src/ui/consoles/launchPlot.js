// FIRING DATA for a launch site (consoles/launch.js): the target, the wind on the route, the two settings to dial
// (compass or table bearing, air log or Brennschluss range) with their match against the firing data, and a plot of
// the target area: the line from the site, the target area, where the dialled settings send the round (the cross
// and its spread), the rounds coming in at the end of their flight and where each one fell.
import { el, setText, setCls, card, Btn, hw } from '../widgets.js';
import { tut } from '../highlight.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const SERIF = "'Bitstream Charter','Liberation Serif','DejaVu Serif',Georgia,serif";
const TYPE = "'Courier 10 Pitch','Liberation Mono','FreeMono',monospace";
const INK = '#1b1913', BLUE = '#1d3f8f', RED = '#a8241b', GREEN = '#2f6a2a';
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
const f1 = (v) => (v == null ? '---.-' : (Math.round(v * 10) / 10).toFixed(1));
const km1 = (m) => `${(Math.abs(m) / 1000).toFixed(1)} km`;

// where a round with these settings lands relative to the aiming point, without the random spread: along the line
// (+ over) and across it (+ right), metres; the same sums as LaunchCtl.launch()
export function predict(st, settings = st.settings, lox = st.kind === 'v2' && st.loxOn ? st.lox : 100) {
  if (settings.compass == null || settings.range == null) return null;
  const T = st.target, sol = st.solution;
  const bErr = angDiff(settings.compass, sol.compass), rErr = settings.range / sol.range - 1;
  const short = st.kind === 'v2' && lox < 92 ? (92 - lox) * 0.03 : 0;
  return { along: T.dist * (rErr - short), lat: Math.sin(bErr * DEG) * T.dist, bErr, rErr, short };
}

// the dial's verdict against the firing data: { ok, text }
export function verdict(st, key) {
  const v = st.settings[key], sol = st.solution[key], tol = st.tol?.[key] ?? (key === 'compass' ? 0.25 : 0.6);
  if (v == null) return { ok: false, none: true, text: 'not set' };
  const d = key === 'compass' ? angDiff(v, sol) : v - sol;
  if (Math.abs(d) <= tol + 1e-6) return { ok: true, text: 'MATCH' };
  if (key === 'compass') return { ok: false, text: `${Math.abs(d).toFixed(1)}° ${d > 0 ? 'RIGHT' : 'LEFT'}: ${km1(Math.sin(d * DEG) * st.target.dist)} off` };
  return { ok: false, text: `${Math.abs(d).toFixed(1)} km ${d > 0 ? 'OVER' : 'SHORT'}` };
}

export class FiringCard {
  constructor({ kind, send }) {
    this.kind = kind;
    this.send = send;
    const v1 = kind === 'v1';
    const c = card('FIRING DATA', 'Schußwerte', 'lfire');
    this.el = c.el;
    this.body = c.body;
    tut(this.el, 'data');
    // the data: target, bearing, range; the wind (or the oxygen) line under it
    const data = el('div', 'fd-data');
    const fld = (t) => { const w = el('div', 'fd-f'); const v = el('b', null, '--'); w.append(el('i', null, t), v); data.append(w); return v; };
    this.vTarget = fld('TARGET');
    this.vBearing = fld('BEARING');
    this.vRange = fld(v1 ? 'GROUND RANGE' : 'RANGE');
    this.vSet = fld(v1 ? 'AIR LOG FOR' : 'CUT-OFF FOR');
    this.note = el('div', 'fd-note');
    this.body.append(data, this.note);
    // the plot
    this.wrap = el('div', 'fd-plot');
    this.cv = el('canvas');
    this.wrap.append(this.cv);
    tut(this.wrap, 'plot');
    this.body.append(this.wrap);
    this.g = this.cv.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1;
    // the dials
    const dials = el('div', 'fd-dials');
    tut(dials, 'dials');
    const dial = (title, keys, key, steps, unit) => {
      const w = el('div', 'fd-dial');
      const head = el('div', 'fd-dh');
      head.append(el('b', null, title), el('i', null, keys));
      const row = el('div', 'fd-drow');
      const v = el('b', 'fd-dv', '---.-');
      const mk = (s) => new Btn({ main: s > 0 ? `+${s}` : `−${-s}`, cls: 'mini', onClick: () => this.nudge(key, s), tip: `${s > 0 ? '+' : '−'}${Math.abs(s)} ${unit}` }).el;
      row.append(mk(-steps[1]), mk(-steps[0]), v, el('span', 'fd-du', unit), mk(steps[0]), mk(steps[1]));
      const ver = el('div', 'fd-ver');
      const data = el('i', null, '');
      const lamp = el('b', null, '');
      ver.append(data, lamp);
      w.append(head, row, ver);
      dials.append(w);
      return { w, v, data, lamp };
    };
    this.dC = dial(v1 ? 'COMPASS' : 'TABLE BEARING', '← →  Shift 1°', 'compass', [0.1, 1], '°');
    this.dR = dial(v1 ? 'AIR LOG' : 'BRENNSCHLUSS', '↑ ↓  Shift 10', 'range', [1, 10], 'km');
    this.body.append(dials);
    this.st = null;
  }

  // a dial turned by a button or an arrow key: from the setting, or from the target's round figures when unset
  nudge(key, d) {
    const st = this.st;
    if (!st) return;
    const cur = st.settings[key] ?? (key === 'compass' ? Math.round(st.target.bearing / DEG) : Math.round(st.target.dist / 1000));
    const v = Math.round((cur + d) * 10) / 10;
    this.send('set', { [key]: key === 'compass' ? ((v % 360) + 360) % 360 : Math.max(0, v) });
  }

  update(u, st, sim) {
    this.st = st;
    const v1 = this.kind === 'v1', sol = st.solution, w = st.wind;
    setText(this.vTarget, st.target.name);
    setText(this.vBearing, `${f1(sol.compass)}°`);
    setText(this.vRange, `${(st.target.dist / 1000).toFixed(1)} km`);
    setText(this.vSet, `${f1(sol.range)} km`);
    if (v1) {
      const hw_ = w.headwind, k = Math.abs(sol.range - st.target.dist / 1000);
      setText(this.note, `Wind on the route from ${String(w.from).padStart(3, '0')}° at ${w.speed} m/s: ${Math.abs(hw_) < 0.3 ? 'no head or tail wind, the log counts the ground distance' : `a ${hw_ > 0 ? 'head' : 'tail'}wind of ${Math.abs(hw_).toFixed(1)} m/s, so the log counts ${k.toFixed(1)} km ${hw_ > 0 ? 'more' : 'less'} than the ground`}.`);
    } else {
      const lox = st.loxOn ? st.lox : null;
      setText(this.note, `The I-Gerät cuts the engine at the speed for the range. Liquid oxygen below 92% falls short${lox != null ? `: now ${lox.toFixed(1)}%${lox < 92 ? `, about ${km1((92 - lox) * 0.03 * st.target.dist)} short` : ''}` : ''}.`);
    }
    setCls(this.note, 'warn', !v1 && st.loxOn && st.lox < 92);
    const dial = (d, key) => {
      const ver = verdict(st, key);
      setText(d.v, f1(st.settings[key]));
      setText(d.data, `data ${f1(sol[key])}`);
      setText(d.lamp, ver.none ? 'SET IT' : ver.text);
      setCls(d.w, 'ok', ver.ok);
      setCls(d.w, 'off', !ver.ok && !ver.none);
      setCls(d.w, 'none', !!ver.none);
      const s = st.steps[st.i];
      setCls(d.w, 'want', st.hold === 'dial' && s?.set === key);
    };
    dial(this.dC, 'compass');
    dial(this.dR, 'range');
    this.draw(st, sim);
  }

  resize() {
    const cw = this.cv.clientWidth, ch = this.cv.clientHeight;
    if (!cw || !ch) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (hw.scale || 1);
    if (cw !== this.W || ch !== this.H || Math.abs(dpr - this.dpr) > 0.01) {
      this.W = cw; this.H = ch; this.dpr = dpr;
      this.cv.width = Math.round(cw * dpr); this.cv.height = Math.round(ch * dpr);
    }
    return true;
  }

  // the target-area plot, north up, centred on the aiming point
  draw(st, sim) {
    if (!this.resize()) return;
    const g = this.g, W = this.W, H = this.H, T = st.target;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#e9dfbf';
    g.fillRect(0, 0, W, H);
    const half = (st.area ?? 8000) * 3, mpp = (half * 2) / Math.min(W, H * 1.35);
    const cx = W / 2, cz = H / 2;
    const b = T.bearing, ux = Math.sin(b), uz = -Math.cos(b), nx = Math.cos(b), nz = Math.sin(b); // along, right
    const P = (along, lat) => [cx + (ux * along + nx * lat) / mpp, cz + (uz * along + nz * lat) / mpp];
    // grid every 5 km
    g.lineWidth = 0.8;
    for (let k = -12; k <= 12; k++) {
      const x = cx + (k * 5000) / mpp, z = cz + (k * 5000) / mpp;
      g.strokeStyle = k % 2 ? 'rgba(40,80,140,.16)' : 'rgba(40,80,140,.3)';
      if (x > 0 && x < W) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      if (z > 0 && z < H) { g.beginPath(); g.moveTo(0, z); g.lineTo(W, z); g.stroke(); }
    }
    // the target area, hatched
    const R = (st.area ?? 8000) / mpp;
    g.save();
    g.beginPath(); g.arc(cx, cz, R, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(168,36,27,.16)'; g.lineWidth = 1;
    for (let k = -R * 2; k < R * 2; k += 6) { g.beginPath(); g.moveTo(cx + k - R, cz - R); g.lineTo(cx + k + R, cz + R); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(168,36,27,.7)'; g.lineWidth = 1.4; g.setLineDash([5, 4]);
    g.beginPath(); g.arc(cx, cz, R, 0, TAU); g.stroke(); g.setLineDash([]);
    g.font = `italic 10px ${SERIF}`; g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'top';
    this.halo(g, `target area ${((st.area ?? 8000) / 1000).toFixed(0)} km`, cx, cz + R + 3);
    // the line of fire from the site, coming in from the far edge, ticked every 5 km
    const far = half * 1.6;
    const [ax, az] = P(-far, 0);
    g.strokeStyle = BLUE; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(ax, az); g.lineTo(cx, cz); g.stroke();
    for (let k = 1; k * 5000 < far; k++) {
      const [x, z] = P(-k * 5000, 0);
      g.beginPath(); g.moveTo(x - nx * 4, z - nz * 4); g.lineTo(x + nx * 4, z + nz * 4); g.stroke();
    }
    // where it comes from, written along the line near the plot's edge (on the side the line leaves by)
    const sx = -ux, sz = -uz, m = 14;
    const tx = sx > 0.01 ? (W - m - cx) / sx : sx < -0.01 ? (m - cx) / sx : 1e9, tz = sz > 0.01 ? (H - m - cz) / sz : sz < -0.01 ? (m - cz) / sz : 1e9;
    const te = Math.min(tx, tz) * 0.97, ex = cx + sx * te, ez = cz + sz * te;
    g.font = `bold 10px ${TYPE}`; g.fillStyle = BLUE; g.textBaseline = 'bottom';
    g.textAlign = tx < tz ? (sx > 0 ? 'right' : 'left') : 'center';
    this.halo(g, `from the site: ${(T.dist / 1000).toFixed(0)} km on ${f1(st.solution.compass)}°`, ex, ez - 7);
    // the aiming point
    g.strokeStyle = RED; g.lineWidth = 1.7;
    g.beginPath(); g.arc(cx, cz, 6, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(cx - 12, cz); g.lineTo(cx - 3, cz); g.moveTo(cx + 3, cz); g.lineTo(cx + 12, cz); g.moveTo(cx, cz - 12); g.lineTo(cx, cz - 3); g.moveTo(cx, cz + 3); g.lineTo(cx, cz + 12); g.stroke();
    // the settings' prediction: the dialled line, the cross and the spread
    const pr = predict(st);
    const clampP = (x, z) => [Math.max(10, Math.min(W - 10, x)), Math.max(10, Math.min(H - 10, z))];
    if (pr) {
      const [px, pz] = P(pr.along, pr.lat);
      const [qx, qz] = clampP(px, pz), out = qx !== px || qz !== pz;
      // the dialled bearing from the site: a dashed line that ends at the cross
      const bd = pr.bErr * DEG, dx = Math.sin(b + bd), dz = -Math.cos(b + bd);
      const L = far / mpp;
      g.strokeStyle = 'rgba(29,63,143,.75)'; g.lineWidth = 1.2; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(px - dx * L, pz - dz * L); g.lineTo(px, pz); g.stroke(); g.setLineDash([]);
      // the 1-sigma spread around it (along the line and across)
      const sa = (st.sigma ?? 5000) / mpp, sl = (st.sigma ?? 5000) * 0.7 / mpp;
      g.save(); g.translate(qx, qz); g.rotate(Math.atan2(uz, ux));
      g.strokeStyle = 'rgba(29,63,143,.45)'; g.lineWidth = 1; g.setLineDash([2, 3]);
      g.beginPath(); g.ellipse(0, 0, sa, sl, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      g.restore();
      const good = Math.hypot(pr.along, pr.lat) <= (st.area ?? 8000) * 0.5;
      g.strokeStyle = good ? GREEN : BLUE; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(qx - 8, qz); g.lineTo(qx + 8, qz); g.moveTo(qx, qz - 8); g.lineTo(qx, qz + 8); g.stroke();
      // labelled on the far side from the site, clear of the line; off the plot, said at the top
      g.font = `bold 10px ${TYPE}`; g.fillStyle = good ? GREEN : BLUE;
      if (out) {
        const words = [Math.abs(pr.along) > 500 ? `${km1(pr.along)} ${pr.along > 0 ? 'over' : 'short'}` : '', Math.abs(pr.lat) > 500 ? `${km1(pr.lat)} ${pr.lat > 0 ? 'right' : 'left'}` : ''].filter(Boolean).join(', ');
        g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'top';
        this.halo(g, `Your settings send it ${words}: off the plot (the cross at the edge)`, W / 2, 8);
      } else {
        g.textAlign = ux < 0 ? 'right' : 'left'; g.textBaseline = 'top';
        this.halo(g, 'your settings', Math.max(8, Math.min(W - 8, qx + ux * 10)), qz + 7);
      }
    } else {
      g.font = `italic 11px ${SERIF}`; g.fillStyle = BLUE; g.textAlign = 'center'; g.textBaseline = 'top';
      this.halo(g, 'Dial both settings: a cross shows where they send the round', W / 2, 8);
    }
    // the fall of each round that reached the end of its flight, and the rounds coming in now
    for (const f of st.flights) {
      if (f.state === 'target area' || f.state === 'missed') {
        const [x0, z0] = P(f.along, f.lat), [x, z] = clampP(x0, z0);
        const ok = f.state === 'target area', recent = sim.time - (f.endT ?? 0) < 6;
        g.strokeStyle = ok ? GREEN : RED; g.lineWidth = recent ? 2.6 : 1.8;
        const s = recent ? 7 : 5;
        g.beginPath(); g.moveTo(x - s, z - s); g.lineTo(x + s, z + s); g.moveTo(x + s, z - s); g.lineTo(x - s, z + s); g.stroke();
        if (recent) { const a = (sim.time - (f.endT ?? 0)) / 6; g.globalAlpha = 1 - a; g.beginPath(); g.arc(x, z, s + 4 + a * 22, 0, TAU); g.stroke(); g.globalAlpha = 1; }
        g.font = `italic bold 12px ${SERIF}`; g.fillStyle = ok ? GREEN : RED; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        this.halo(g, String(f.n), x + s + 2, z - s + 2);
      } else if (f.state === 'flying' && f.eta > f.t0) {
        // the last part of its way: a dot coming in along the line it was laid on
        const p = Math.min(f.at ?? 1, (sim.time - f.t0) / (f.eta - f.t0)), togo = (1 - p) * (T.dist + f.along);
        if (togo > half * 1.5) continue;
        const k = 1 - togo / Math.max(1, T.dist + f.along);
        const along = f.along - togo, lat = f.lat * k;
        const [x, z] = P(along, lat);
        g.fillStyle = '#d9a62a'; g.strokeStyle = '#2a1d06'; g.lineWidth = 1;
        g.beginPath(); g.arc(x, z, 4.5, 0, TAU); g.fill(); g.stroke();
        g.font = `italic bold 11px ${SERIF}`; g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'bottom';
        this.halo(g, String(f.n), x + 6, z - 3);
      }
    }
    // scale bar and north
    const bar = 5000 / mpp;
    g.fillStyle = INK; g.fillRect(10, H - 14, bar, 2.5);
    g.fillRect(10, H - 18, 1.2, 9); g.fillRect(10 + bar - 1, H - 18, 1.2, 9);
    g.font = `9px ${TYPE}`; g.textAlign = 'left'; g.textBaseline = 'bottom';
    this.halo(g, '5 km', 12, H - 17);
    g.fillStyle = INK; g.beginPath(); g.moveTo(W - 16, 8); g.lineTo(W - 12, 22); g.lineTo(W - 20, 22); g.closePath(); g.fill();
    g.font = `bold 9px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('N', W - 16, 24);
  }

  halo(g, t, x, y) {
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(233,223,191,.9)'; g.lineWidth = 3; g.strokeText(t, x, y);
    g.fillText(t, x, y);
  }
}

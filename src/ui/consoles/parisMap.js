// The Paris Gun's map on the artillery board (src/ui/board.js calls TH.overlay and TH.hoverText; src/ww1/ui.js sets
// them for the Paris Gun's mission): the gun, the four targets about 120 km west with their areas and the Armee's
// orders on them, the band the gun can reach (its traverse on the racer and its range with a new barrel) and the line
// it is laid on, and where each round fell (from the agents' reports, the round's number beside it). A magnified inset
// in the corner shows the target laid on: its 400 m area, the 1 km ring and the falls of the rounds fired at it, so a
// correction can be read off at a glance, and a blue ring where the next round should fall on the data laid now (the
// newest fall moved by the corrections since: it moves as the player corrects). Reads unit.special (src/ww1/paris.js); pure drawing, no state of its own.
import { AREA, NEAR, nextFall } from '../../ww1/paris.js';

const TAU = Math.PI * 2;
const SERIF = "'Bitstream Charter','Liberation Serif','DejaVu Serif',Georgia,serif";
const TYPE = "'Courier 10 Pitch','Liberation Mono','FreeMono',monospace";
const RED = '#a8241b', BLUE = '#1d3f8f', GREEN = '#2f6b2a';
const REACH = [115600, 122800]; // m: the table's band on a new barrel (50 to 55 degrees)
const INSET = { w: 150, r: 1600 }; // px square, m from its centre to its edge
const deg = (r) => Math.round(((r * 180 / Math.PI) % 360 + 360) % 360);
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s)) % 60).padStart(2, '0')}`;

// where a flight fell, on the map: its target plus `along` the line from the gun and `lat` to the right of it
function fallAt(T, f) {
  const fx = Math.sin(T.bearing), fz = -Math.cos(T.bearing);
  return { x: T.x + fx * f.along - fz * f.lat, z: T.z + fz * f.along + fx * f.lat };
}

const openOrder = (st, T) => st.orders?.find((o) => o.target === T.id && o.state === 'open');

export function parisOverlay(b, g, sim, unit, T) {
  const st = unit?.special;
  if (!st?.targets || st.kind !== 'paris') return;
  const ux = unit.pos.x, uz = unit.pos.z, X0 = b.sx(ux), Z0 = b.sz(uz);
  const mpp = b.view.mpp;
  // the reach: an annular sector, the racer's 30 degrees either way of the zero line, 115.6 to 122.8 km
  const arc = unit.arc ?? 30 * Math.PI / 180, b0 = unit.zero - arc, b1 = unit.zero + arc;
  const ang = (br) => br - Math.PI / 2; // a bearing (from north, clockwise) as a canvas angle
  g.save();
  g.beginPath();
  g.arc(X0, Z0, REACH[1] / mpp, ang(b0), ang(b1));
  g.arc(X0, Z0, REACH[0] / mpp, ang(b1), ang(b0), true);
  g.closePath();
  g.fillStyle = 'rgba(185,146,58,.16)'; g.fill();
  g.strokeStyle = 'rgba(154,116,33,.55)'; g.lineWidth = 1; g.stroke();
  g.setLineDash([3, 5]); g.strokeStyle = 'rgba(29,63,143,.35)';
  for (const br of [b0, b1]) { g.beginPath(); g.moveTo(X0, Z0); g.lineTo(X0 + Math.sin(br) * REACH[1] / mpp, Z0 - Math.cos(br) * REACH[1] / mpp); g.stroke(); }
  g.setLineDash([]);
  // the line laid on: the piece's bearing, out past the band
  const p = unit.pieces?.[0];
  if (p && st.ready !== false) {
    const br = p.bearing - p.az, L = (REACH[1] + 4000) / mpp;
    g.strokeStyle = 'rgba(29,63,143,.75)'; g.lineWidth = 1.4; g.setLineDash([8, 5]);
    g.beginPath(); g.moveTo(X0, Z0); g.lineTo(X0 + Math.sin(br) * L, Z0 - Math.cos(br) * L); g.stroke();
    g.setLineDash([]);
  }
  // the targets: area to scale (at least a few pixels), the order on each
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const Tg of st.targets) {
    const X = b.sx(Tg.x), Z = b.sz(Tg.z), on = Tg === st.target, o = openOrder(st, Tg);
    const r = Math.max(5, AREA / mpp);
    g.beginPath(); g.arc(X, Z, r, 0, TAU);
    g.fillStyle = on ? 'rgba(168,36,27,.22)' : 'rgba(168,36,27,.1)'; g.fill();
    g.strokeStyle = RED; g.lineWidth = on ? 2 : 1.2; g.stroke();
    g.beginPath(); g.moveTo(X - r - 3, Z); g.lineTo(X + r + 3, Z); g.moveTo(X, Z - r - 3); g.lineTo(X, Z + r + 3); g.stroke();
    if (on) { g.strokeStyle = 'rgba(20,46,122,.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(X, Z, r + 5 + Math.sin(T * 3), 0, TAU); g.stroke(); }
    g.font = `${on ? 'bold ' : ''}italic 10px ${SERIF}`; g.fillStyle = '#6e1810';
    b.halo(g, `${Tg.name} (${Tg.en.replace(/^the /, '')})`, X, Z + r + 4);
    if (o) {
      g.font = `bold 9px ${TYPE}`; g.fillStyle = RED;
      b.halo(g, `ORDER ${o.got}/${o.need} · ${mmss(o.due - (sim.time ?? 0))}`, X, Z + r + 16);
    }
  }
  // the falls: a cross per settled round, green in the area, ochre near it, grey wide
  g.lineWidth = 1.4;
  for (const f of st.flights ?? []) {
    if (f.state !== 'fallen') continue;
    const Tg = st.targets.find((t) => t.id === f.target);
    if (!Tg) continue;
    const q = fallAt(Tg, f), X = b.sx(q.x), Z = b.sz(q.z);
    g.strokeStyle = f.result === 'area' ? GREEN : f.result === 'near' ? '#9a7421' : '#6a655a';
    g.beginPath(); g.moveTo(X - 3, Z - 3); g.lineTo(X + 3, Z + 3); g.moveTo(X + 3, Z - 3); g.lineTo(X - 3, Z + 3); g.stroke();
  }
  // the shell in flight: a dashed line toward its target while the report is awaited
  for (const f of st.flights ?? []) {
    if (f.state !== 'flying') continue;
    const Tg = st.targets.find((t) => t.id === f.target);
    if (!Tg) continue;
    const k = Math.min(1, Math.max(0, ((sim.time ?? 0) - f.t0) / Math.max(1, f.eta - f.t0)));
    const X = X0 + (b.sx(Tg.x) - X0) * k, Z = Z0 + (b.sz(Tg.z) - Z0) * k;
    g.fillStyle = '#d9a62a'; g.strokeStyle = '#2a1d06'; g.lineWidth = 1;
    g.beginPath(); g.arc(X, Z, 3.5, 0, TAU); g.fill(); g.stroke();
    g.font = `italic bold 10px ${SERIF}`; g.fillStyle = '#142a6e'; g.textAlign = 'left';
    b.halo(g, `Schuss ${f.n}`, X + 6, Z - 6);
    g.textAlign = 'center';
  }
  inset(b, g, sim, st, T);
  g.restore();
}

// the magnified inset round the target laid on (bottom right, above the readout)
function inset(b, g, sim, st, T) {
  const Tg = st.target;
  if (!Tg) return;
  const W = INSET.w, x0 = b.W - W - 8, y0 = b.H - W - 30, s = (W / 2) / INSET.r, cx = x0 + W / 2, cy = y0 + W / 2;
  g.fillStyle = 'rgba(236,228,200,.94)'; g.fillRect(x0, y0, W, W);
  g.strokeStyle = '#3a2e17'; g.lineWidth = 1.2; g.strokeRect(x0, y0, W, W);
  g.save();
  g.beginPath(); g.rect(x0, y0, W, W); g.clip();
  g.beginPath(); g.arc(cx, cy, NEAR * s, 0, TAU); g.setLineDash([3, 3]); g.strokeStyle = 'rgba(154,116,33,.8)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
  g.beginPath(); g.arc(cx, cy, AREA * s, 0, TAU); g.fillStyle = 'rgba(47,107,42,.18)'; g.fill(); g.strokeStyle = GREEN; g.lineWidth = 1.2; g.stroke();
  // the line of fire through the target (the shells come from the gun's side)
  const fx = Math.sin(Tg.bearing), fz = -Math.cos(Tg.bearing);
  g.strokeStyle = 'rgba(29,63,143,.45)'; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(cx - fx * W, cy - fz * W); g.lineTo(cx + fx * W, cy + fz * W); g.stroke(); g.setLineDash([]);
  g.strokeStyle = RED; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(cx - 5, cy); g.lineTo(cx + 5, cy); g.moveTo(cx, cy - 5); g.lineTo(cx, cy + 5); g.stroke();
  // the falls of the rounds fired at it, the newest bold
  const fl = (st.flights ?? []).filter((f) => f.state === 'fallen' && f.target === Tg.id).slice(-8);
  g.font = `bold 9px ${TYPE}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  fl.forEach((f, i) => {
    const q = fallAt(Tg, f), X = cx + (q.x - Tg.x) * s, Z = cy + (q.z - Tg.z) * s;
    const newest = i === fl.length - 1;
    const Xc = Math.max(x0 + 4, Math.min(x0 + W - 4, X)), Zc = Math.max(y0 + 4, Math.min(y0 + W - 4, Z));
    const out = Xc !== X || Zc !== Z;
    g.strokeStyle = f.result === 'area' ? GREEN : f.result === 'near' ? '#9a7421' : '#6a655a';
    g.lineWidth = newest ? 2.2 : 1.3;
    const r = newest ? 4.5 : 3.2;
    if (out) { g.beginPath(); g.arc(Xc, Zc, 3, 0, TAU); g.stroke(); }
    else { g.beginPath(); g.moveTo(X - r, Z - r); g.lineTo(X + r, Z + r); g.moveTo(X + r, Z - r); g.lineTo(X - r, Z + r); g.stroke(); }
    g.fillStyle = '#142a6e';
    b.halo(g, String(f.n), Xc + 5, Zc - 5);
  });
  // where the next round should fall: the newest fall moved by the corrections laid since it was fired
  const q = fl.length ? nextFall(st, fl[fl.length - 1]) : null;
  if (q) {
    const clampX = (v) => Math.max(x0 + 5, Math.min(x0 + W - 5, v)), clampZ = (v) => Math.max(y0 + 5, Math.min(y0 + W - 5, v));
    const p0 = fallAt(Tg, fl[fl.length - 1]), p1 = fallAt(Tg, q);
    const X0 = clampX(cx + (p0.x - Tg.x) * s), Z0 = clampZ(cy + (p0.z - Tg.z) * s), X1 = clampX(cx + (p1.x - Tg.x) * s), Z1 = clampZ(cy + (p1.z - Tg.z) * s);
    g.strokeStyle = BLUE; g.lineWidth = 1.4;
    if (Math.hypot(X1 - X0, Z1 - Z0) > 6) { g.setLineDash([3, 2]); g.beginPath(); g.moveTo(X0, Z0); g.lineTo(X1, Z1); g.stroke(); g.setLineDash([]); }
    g.beginPath(); g.arc(X1, Z1, 5.5, 0, TAU); g.stroke();
    g.fillStyle = BLUE; g.font = `bold 8px ${TYPE}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    b.halo(g, 'next', X1 - 8, Z1 + 1);
  }
  g.restore();
  g.font = `bold 9px ${TYPE}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#3a2e17';
  b.halo(g, `${Tg.name}: falls`, x0 + 4, y0 + 3);
  g.textBaseline = 'bottom'; g.font = `9px ${TYPE}`;
  b.halo(g, '1 km ring · 400 m area', x0 + 4, y0 + W - 2);
  if (!fl.length) { g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#6a655a'; b.halo(g, 'no fall yet', cx, cy + AREA * s + 14); }
  g.textAlign = 'center'; g.textBaseline = 'top';
}

// the target under the cursor (px, py on the board), or null
export function parisPick(b, px, py) {
  const st = b.last?.unit?.special;
  if (!st?.targets) return null;
  let best = null, bd = 18;
  for (const T of st.targets) {
    const d = Math.hypot(b.sx(T.x) - px, b.sz(T.z) - py);
    if (d < bd) { bd = d; best = T; }
  }
  return best;
}

// the readout under the cursor, in English: a target, the reach band, the inset, or null (the board's own grid line)
export function parisHover(b, x, z, sim, unit) {
  const st = unit?.special;
  if (!st?.targets) return null;
  const h = b.hover;
  if (h) {
    const W = INSET.w, x0 = b.W - W - 8, y0 = b.H - W - 30;
    if (h.px >= x0 && h.px <= x0 + W && h.py >= y0 && h.py <= y0 + W) return `Close-up of ${st.target.name} (${st.target.en}): the green circle is its 400 m area, the dashed ring 1 km; crosses are where your rounds fell (numbered), the blue ring where the next round should fall on the data laid now (it moves as you correct SEITE and ENTFERNUNG), the line is the line of fire`;
    const T = parisPick(b, h.px, h.py);
    if (T) {
      const o = openOrder(st, T);
      return `${T.name} (${T.en}), ${(T.dist / 1000).toFixed(1)} km on ${deg(T.bearing)}°: ${T.hits} rounds in its area so far${o ? `; ORDER: ${o.need - o.got} more within ${mmss(o.due - (sim.time ?? 0))}` : ''}. Click to lay the gun on it`;
    }
  }
  const r = Math.hypot(x - unit.pos.x, z - unit.pos.z);
  if (r > 100000) return `${(r / 1000).toFixed(1)} km from the gun. The shaded band is where it can reach: 116 to 123 km, 30 degrees either way of its zero line`;
  return null;
}

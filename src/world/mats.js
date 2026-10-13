import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { patchMaterial } from '../shaderlib.js';

// Materials of the world dressing. Every texture is drawn on a canvas and tiles in metres (the Mesher
// writes UVs in metres, `tile` is the size of one repeat), so a sandbag is the same size on a trench
// wall, a gun pit and a dugout. Colours are the autumn 1917 palette of refs/battlefield: khaki-grey
// bags, grey-brown clay, soot-darkened brick, weathered timber, rusted iron.

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const clamp = (v) => Math.max(0, Math.min(255, v));

// speckle a canvas with small noise so nothing is flat
function grit(ctx, w, h, rnd, amt = 18, n = 1) {
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = (rnd() - 0.5) * amt * n;
    d[i] = clamp(d[i] + k); d[i + 1] = clamp(d[i + 1] + k); d[i + 2] = clamp(d[i + 2] + k * 0.9);
  }
  ctx.putImageData(id, 0, 0);
}

// soft blotches (mud, soot, damp) by drawing blurred circles
function blotch(ctx, w, h, rnd, count, rMin, rMax, col, a) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h, r = rMin + rnd() * (rMax - rMin);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
      g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

function toTex(c, tile, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const tw = Array.isArray(tile) ? tile : [tile, tile];
  t.repeat.set(1 / tw[0], 1 / tw[1]);
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  return t;
}

// ---------------------------------------------------------------- the textures

// courses of sandbags, 4 courses by 2 bags in a 0.9 x 0.84 m tile, alternate courses staggered
function sandbags() {
  const W = 256, H = 256, color = cv(W, H), bump = cv(W, H);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(11);
  a.fillStyle = '#2b2820'; a.fillRect(0, 0, W, H);
  b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
  const rows = 4, cols = 2, bh = H / rows, bw = W / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0) + (rnd() - 0.5) * 6, y = r * bh + (rnd() - 0.5) * 3;
    const tone = 0.8 + rnd() * 0.35, tint = rnd();
    const base = tint < 0.55 ? [150, 138, 104] : tint < 0.85 ? [128, 120, 96] : [108, 100, 80]; // khaki, grey-buff, damp
    for (const wrapX of [0, -W, W]) {
      const px = x + wrapX;
      const g = a.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, rgb(base[0] * tone * 1.12, base[1] * tone * 1.12, base[2] * tone * 1.1));
      g.addColorStop(0.5, rgb(base[0] * tone, base[1] * tone, base[2] * tone));
      g.addColorStop(1, rgb(base[0] * tone * 0.7, base[1] * tone * 0.7, base[2] * tone * 0.72));
      a.fillStyle = g;
      a.beginPath(); a.roundRect(px + 3, y + 2, bw - 6, bh - 4, [bh * 0.4, bh * 0.35, bh * 0.4, bh * 0.35]); a.fill();
      // the tied end and the sag seam
      a.strokeStyle = 'rgba(40,34,24,0.45)'; a.lineWidth = 1.5;
      a.beginPath(); a.moveTo(px + bw * 0.15, y + bh * 0.5); a.lineTo(px + bw * 0.85, y + bh * 0.5 + (rnd() - 0.5) * 3); a.stroke();
      const hg = b.createRadialGradient(px + bw / 2, y + bh / 2, 2, px + bw / 2, y + bh / 2, bw * 0.55);
      hg.addColorStop(0, '#fff'); hg.addColorStop(1, '#000');
      b.fillStyle = hg;
      b.beginPath(); b.roundRect(px + 2, y + 1, bw - 4, bh - 2, [bh * 0.4]); b.fill();
    }
  }
  blotch(a, W, H, rnd, 14, 20, 60, [62, 48, 32], 0.35);
  grit(a, W, H, rnd, 26);
  return { map: toTex(color, [0.9, 0.84]), bump: toTex(bump, [0.9, 0.84], { srgb: false }) };
}

// brick, 8 courses of 4 in a 0.88 x 0.52 m tile; soot, orange and purple-brown bricks, pale mortar
function brick() {
  const W = 256, H = 256, color = cv(W, H), bump = cv(W, H);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(5);
  a.fillStyle = '#625d54'; a.fillRect(0, 0, W, H);
  b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
  const rows = 8, cols = 4, bh = H / rows, bw = W / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
    const t = rnd(), k = 0.78 + rnd() * 0.4;
    const base = t < 0.5 ? [108, 68, 54] : t < 0.8 ? [92, 60, 48] : t < 0.93 ? [68, 50, 44] : [124, 90, 70];
    for (const wx of [0, -W, W]) {
      a.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
      a.fillRect(x + 2 + wx, y + 2, bw - 4, bh - 3);
      b.fillStyle = '#fff'; b.fillRect(x + 2 + wx, y + 2, bw - 4, bh - 3);
    }
  }
  blotch(a, W, H, rnd, 26, 16, 56, [24, 21, 20], 0.5);
  grit(a, W, H, rnd, 34);
  return { map: toTex(color, [0.88, 0.52]), bump: toTex(bump, [0.88, 0.52], { srgb: false }) };
}

// horizontal boards (about 0.17 m), weathered timber with grain streaks and nail heads; 1 x 1 m
function planks(seed = 3, base = [112, 88, 58]) {
  const W = 256, H = 256, color = cv(W, H), bump = cv(W, H);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(seed);
  const n = 6, bh = H / n;
  b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const k = 0.72 + rnd() * 0.5;
    a.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k * 0.95);
    a.fillRect(0, i * bh, W, bh - 3);
    b.fillStyle = '#fff'; b.fillRect(0, i * bh + 1, W, bh - 4);
    for (let j = 0; j < 22; j++) { // grain
      a.strokeStyle = `rgba(30,22,14,${0.08 + rnd() * 0.2})`; a.lineWidth = 1 + rnd();
      const y = i * bh + rnd() * (bh - 4), x = rnd() * W;
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + 60 + rnd() * 140, y + (rnd() - 0.5) * 3); a.stroke();
    }
    a.fillStyle = 'rgba(20,16,12,0.7)';
    for (const x of [14, W - 14]) { a.beginPath(); a.arc(x, i * bh + bh / 2 - 1, 2, 0, 7); a.fill(); }
  }
  blotch(a, W, H, rnd, 10, 20, 70, [48, 38, 26], 0.4);
  grit(a, W, H, rnd, 20);
  return { map: toTex(color, 1), bump: toTex(bump, 1, { srgb: false }) };
}

// corrugated iron: vertical ridges every 76 mm, 4 ridges across a 0.3 m tile (1 m tall), rust and grey
function corrugated() {
  const W = 128, H = 256, color = cv(W, H), bump = cv(W, H);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(8);
  for (let x = 0; x < W; x++) {
    const s = Math.sin((x / W) * Math.PI * 8) * 0.5 + 0.5;
    a.fillStyle = rgb(92 + s * 56, 86 + s * 50, 78 + s * 44); a.fillRect(x, 0, 1, H);
    b.fillStyle = rgb(s * 255, s * 255, s * 255); b.fillRect(x, 0, 1, H);
  }
  for (let i = 0; i < 40; i++) { // rust streaks running down
    const x = rnd() * W, y = rnd() * H, l = 20 + rnd() * 120;
    const g = a.createLinearGradient(0, y, 0, y + l);
    g.addColorStop(0, 'rgba(110,56,26,0)'); g.addColorStop(0.3, `rgba(110,56,26,${0.2 + rnd() * 0.3})`); g.addColorStop(1, 'rgba(110,56,26,0)');
    a.fillStyle = g; a.fillRect(x, y, 2 + rnd() * 6, l);
  }
  blotch(a, W, H, rnd, 8, 12, 40, [60, 40, 24], 0.35);
  grit(a, W, H, rnd, 22);
  return { map: toTex(color, [0.304, 1]), bump: toTex(bump, [0.304, 1], { srgb: false }) };
}

// woven willow hurdles: upright stakes every 0.2 m, withies over and under; 0.8 m tile
function wattle() {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(21);
  a.fillStyle = '#2a2016'; a.fillRect(0, 0, W, W);
  b.fillStyle = '#000'; b.fillRect(0, 0, W, W);
  const stakes = 4, sw = W / stakes, rows = 16, rh = W / rows;
  for (let r = 0; r < rows; r++) for (let s = 0; s < stakes; s++) {
    const over = (r + s) % 2;
    const k = 0.75 + rnd() * 0.45;
    a.fillStyle = rgb(120 * k, 92 * k, 58 * k);
    a.fillRect(s * sw + (over ? 0 : 5), r * rh + 1, sw - (over ? 0 : 5), rh - 2);
    b.fillStyle = over ? '#fff' : '#777'; b.fillRect(s * sw, r * rh + 1, sw, rh - 2);
  }
  for (let s = 0; s < stakes; s++) { a.fillStyle = 'rgba(70,52,30,0.95)'; a.fillRect(s * sw + sw / 2 - 5, 0, 10, W); b.fillStyle = '#ddd'; b.fillRect(s * sw + sw / 2 - 5, 0, 10, W); }
  blotch(a, W, W, rnd, 8, 20, 60, [40, 30, 20], 0.4);
  grit(a, W, W, rnd, 24);
  return { map: toTex(color, 0.8), bump: toTex(bump, 0.8, { srgb: false }) };
}

// churned clay: grey-brown with lighter dry crumbs and dark wet patches; 3 m tile
function earth(base = [92, 78, 60], seed = 31) {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(seed);
  a.fillStyle = rgb(...base); a.fillRect(0, 0, W, W);
  b.fillStyle = '#666'; b.fillRect(0, 0, W, W);
  blotch(a, W, W, rnd, 40, 10, 50, [60, 48, 36], 0.4);
  blotch(a, W, W, rnd, 26, 8, 36, [128, 112, 86], 0.3);
  for (let i = 0; i < 700; i++) { // clods
    const x = rnd() * W, y = rnd() * W, r = 1 + rnd() * 4, k = 0.6 + rnd() * 0.8;
    a.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k); a.beginPath(); a.arc(x, y, r, 0, 7); a.fill();
    b.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
  }
  grit(a, W, W, rnd, 20);
  return { map: toTex(color, 3), bump: toTex(bump, 3, { srgb: false }) };
}

// brick rubble and plaster, mortar dust and splinters; 3 m tile
function rubble() {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(44);
  a.fillStyle = '#5c5146'; a.fillRect(0, 0, W, W);
  b.fillStyle = '#555'; b.fillRect(0, 0, W, W);
  blotch(a, W, W, rnd, 30, 14, 50, [160, 146, 124], 0.4);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W, y = rnd() * W, r = 2 + rnd() * 6, t = rnd(), k = 0.6 + rnd() * 0.6;
    const base = t < 0.45 ? [120, 60, 44] : t < 0.7 ? [104, 96, 86] : t < 0.85 ? [150, 140, 124] : [60, 42, 36];
    a.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
    a.save(); a.translate(x, y); a.rotate(rnd() * 3);
    a.fillRect(-r, -r * 0.6, r * 2, r * 1.2); a.restore();
    b.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; b.fillRect(x - r * 0.7, y - r * 0.4, r * 1.4, r * 0.8);
  }
  blotch(a, W, W, rnd, 12, 18, 50, [30, 26, 22], 0.3);
  grit(a, W, W, rnd, 28);
  return { map: toTex(color, 3), bump: toTex(bump, 3, { srgb: false }) };
}

// rounded pave setts (granite cobbles, mud between) in staggered rows; 1.5 m tile
function cobbles() {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(61);
  a.fillStyle = '#3a3329'; a.fillRect(0, 0, W, W);
  b.fillStyle = '#000'; b.fillRect(0, 0, W, W);
  const rows = 14, rh = W / rows;
  for (let r = 0; r < rows; r++) {
    const n = 11; const off = (r % 2) * (W / n / 2);
    for (let c = -1; c <= n; c++) {
      const x = c * (W / n) + off, y = r * rh, k = 0.7 + rnd() * 0.5, g = 96 * k;
      for (const wx of [0, -W, W]) {
        a.fillStyle = rgb(g, g * 0.97, g * 0.9); a.beginPath(); a.roundRect(x + wx + 1.5, y + 1.5, W / n - 3, rh - 3, 4); a.fill();
        b.fillStyle = '#fff'; b.beginPath(); b.roundRect(x + wx + 1.5, y + 1.5, W / n - 3, rh - 3, 5); b.fill();
      }
    }
  }
  blotch(a, W, W, rnd, 24, 20, 70, [50, 38, 26], 0.5);
  grit(a, W, W, rnd, 22);
  return { map: toTex(color, 1.5), bump: toTex(bump, 1.5, { srgb: false }) };
}

// coarse track ballast / cinders; 2 m tile
function ballast() {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(72);
  a.fillStyle = '#4a4640'; a.fillRect(0, 0, W, W);
  b.fillStyle = '#444'; b.fillRect(0, 0, W, W);
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * W, y = rnd() * W, r = 1.5 + rnd() * 4, k = 0.5 + rnd() * 0.9;
    a.fillStyle = rgb(88 * k, 84 * k, 76 * k); a.beginPath(); a.arc(x, y, r, 0, 7); a.fill();
    b.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.5})`; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
  }
  blotch(a, W, W, rnd, 10, 20, 60, [36, 30, 24], 0.4);
  return { map: toTex(color, 2), bump: toTex(bump, 2, { srgb: false }) };
}

// Flemish pantiles (S-profile clay), 0.9 m wide pairs, 0.8 m rows; mossy and soot streaked
function pantiles(base = [158, 78, 52], seed = 91) {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(seed);
  a.fillStyle = '#2e2018'; a.fillRect(0, 0, W, W);
  const rows = 8, cols = 4, rh = W / rows, cw = W / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
    const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh, k = 0.72 + rnd() * 0.5;
    for (const wx of [0, -W, W]) {
      const g = a.createLinearGradient(x + wx, 0, x + wx + cw, 0);
      g.addColorStop(0, rgb(base[0] * k * 0.6, base[1] * k * 0.6, base[2] * k * 0.6));
      g.addColorStop(0.5, rgb(base[0] * k * 1.1, base[1] * k * 1.1, base[2] * k * 1.1));
      g.addColorStop(1, rgb(base[0] * k * 0.7, base[1] * k * 0.7, base[2] * k * 0.7));
      a.fillStyle = g; a.fillRect(x + wx + 1, y, cw - 2, rh - 1);
      const hg = b.createLinearGradient(x + wx, 0, x + wx + cw, 0);
      hg.addColorStop(0, '#000'); hg.addColorStop(0.5, '#fff'); hg.addColorStop(1, '#000');
      b.fillStyle = hg; b.fillRect(x + wx + 1, y, cw - 2, rh - 1);
    }
  }
  blotch(a, W, W, rnd, 14, 16, 50, [66, 80, 44], 0.3);
  blotch(a, W, W, rnd, 10, 16, 50, [24, 20, 18], 0.35);
  grit(a, W, W, rnd, 26);
  return { map: toTex(color, 0.9), bump: toTex(bump, 0.9, { srgb: false }) };
}

// canvas tent / marquee: pale grubby drab with seams; 1 m tile
function canvas() {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(17);
  a.fillStyle = '#a79c82'; a.fillRect(0, 0, W, W);
  b.fillStyle = '#888'; b.fillRect(0, 0, W, W);
  for (let i = 0; i < W; i += 2) { a.fillStyle = `rgba(60,50,36,${rnd() * 0.12})`; a.fillRect(i, 0, 1, W); a.fillRect(0, i, W, 1); }
  a.fillStyle = 'rgba(60,50,36,0.4)'; a.fillRect(W / 2 - 1, 0, 2, W);
  blotch(a, W, W, rnd, 14, 20, 70, [70, 56, 38], 0.3);
  grit(a, W, W, rnd, 18);
  return { map: toTex(color, 1), bump: toTex(bump, 1, { srgb: false }) };
}

// hessian screening: coarse brown weave; 0.6 m tile
function hessian() {
  const W = 256, color = cv(W), bump = cv(W);
  const a = color.getContext('2d'), b = bump.getContext('2d'), rnd = mulberry32(52);
  a.fillStyle = '#6d5a3a'; a.fillRect(0, 0, W, W);
  b.fillStyle = '#333'; b.fillRect(0, 0, W, W);
  const n = 32, s = W / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = 0.75 + rnd() * 0.5, o = (x + y) % 2;
    a.fillStyle = rgb(124 * k, 100 * k, 64 * k); a.fillRect(x * s + 1, y * s + (o ? 1 : 2), s - 2, s - (o ? 2 : 3));
    b.fillStyle = o ? '#fff' : '#999'; b.fillRect(x * s, y * s, s, s);
  }
  blotch(a, W, W, rnd, 8, 20, 60, [36, 30, 20], 0.4);
  return { map: toTex(color, 0.6), bump: toTex(bump, 0.6, { srgb: false }) };
}

// camouflage scrim: a rope net with garnish strips in green, brown and sand; opaque enough to cut shadows
// but with open holes; alpha-tested. 3 m tile.
function scrim() {
  const W = 256, color = cv(W);
  const a = color.getContext('2d'), rnd = mulberry32(81);
  a.clearRect(0, 0, W, W);
  a.strokeStyle = 'rgb(70,60,40)'; a.lineWidth = 2.5;
  const n = 8;
  for (let i = 0; i <= n; i++) {
    a.beginPath(); a.moveTo(i * W / n, 0); a.lineTo(i * W / n, W); a.stroke();
    a.beginPath(); a.moveTo(0, i * W / n); a.lineTo(W, i * W / n); a.stroke();
  }
  const cols = [[74, 86, 46], [92, 74, 44], [130, 114, 74], [52, 58, 36], [108, 100, 70], [60, 50, 34]];
  for (let i = 0; i < 520; i++) { // garnish strips and rags tied on
    const x = rnd() * W, y = rnd() * W, c = cols[(rnd() * cols.length) | 0], k = 0.8 + rnd() * 0.4;
    a.fillStyle = rgb(c[0] * k, c[1] * k, c[2] * k);
    a.save(); a.translate(x, y); a.rotate(rnd() * 6.3);
    const l = 8 + rnd() * 26, w = 3 + rnd() * 6;
    for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) { a.save(); a.translate(ox, oy); a.fillRect(0, 0, l, w); a.restore(); }
    a.restore();
  }
  const t = toTex(color, 3);
  return { map: t };
}

// loose barbed wire: tangles of thin grey strands with barbs, on transparent; 2 x 1 m tile. Transparent
// with mipmaps: close up it is strands, far away a grey haze (alpha averages down), which is what wire looks like.
function wireTex() {
  const W = 512, H = 256, color = cv(W, H);
  const a = color.getContext('2d'), rnd = mulberry32(99);
  a.clearRect(0, 0, W, H);
  a.lineCap = 'round';
  for (let i = 0; i < 46; i++) { // coils: loops of wire drawn as rolling sine strands
    const y0 = rnd() * H, amp = 8 + rnd() * 40, ph = rnd() * 6.3, fr = 0.02 + rnd() * 0.05;
    a.strokeStyle = `rgba(${40 + rnd() * 50},${38 + rnd() * 40},${34 + rnd() * 30},${0.75 + rnd() * 0.25})`;
    a.lineWidth = 1.2 + rnd() * 1.2;
    a.beginPath();
    for (let x = 0; x <= W; x += 4) { const y = (y0 + Math.sin(x * fr + ph) * amp + H * 4) % H; x ? a.lineTo(x, y) : a.moveTo(x, y); }
    a.stroke();
    // wrap copy
    a.beginPath();
    for (let x = 0; x <= W; x += 4) { const y = (y0 + Math.sin(x * fr + ph) * amp + H * 4) % H - H; x ? a.lineTo(x, y) : a.moveTo(x, y); }
    a.stroke();
    a.beginPath();
    for (let x = 0; x <= W; x += 4) { const y = (y0 + Math.sin(x * fr + ph) * amp + H * 4) % H + H; x ? a.lineTo(x, y) : a.moveTo(x, y); }
    a.stroke();
  }
  a.strokeStyle = 'rgba(70,64,58,0.9)'; a.lineWidth = 1.2;
  for (let i = 0; i < 150; i++) { // barbs
    const x = rnd() * W, y = rnd() * H, an = rnd() * 6.3;
    a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(an) * 5, y + Math.sin(an) * 5); a.stroke();
  }
  const t = toTex(color, [2, 1], { aniso: 4 });
  return { map: t };
}

// ---------------------------------------------------------------- the material set

const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...o });

// The cutaway: camouflage scrim between the camera and what it looks at (the selected gun) is not
// drawn, so the nets never hide the gun the player is working. main.js sets a (camera), b (focus) and
// r each frame; r = 0 turns it off. The hole widens toward the focus to clear a whole gun.
// `p` adds the selected unit's own nets: drawn back over each of its pieces (x, z, radius; radius 0 = unused),
// as a crew in action would, so a battery spread over 120 m shows every gun, not only the one at the focus.
export const CUTAWAY = {
  a: { value: new THREE.Vector3() }, b: { value: new THREE.Vector3() }, r: { value: 0 },
  p: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
};
const cutaway = (shader) => {
  shader.uniforms.uCutA = CUTAWAY.a;
  shader.uniforms.uCutB = CUTAWAY.b;
  shader.uniforms.uCutR = CUTAWAY.r;
  shader.uniforms.uCutP = CUTAWAY.p;
  shader.fragmentShader = 'uniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform float uCutR;\nuniform vec3 uCutP[4];\n' + shader.fragmentShader.replace(
    '#include <alphatest_fragment>',
    `#include <alphatest_fragment>
    #ifdef USE_FOG
    if (uCutR > 0.0) {
      vec3 ab = uCutB - uCutA;
      float h = clamp(dot(vFogWorldPos - uCutA, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
      if (length(vFogWorldPos - uCutA - ab * h) < uCutR * (0.35 + 0.9 * h)) discard;
    }
    for (int i = 0; i < 4; i++) if (uCutP[i].z > 0.0 && length(vFogWorldPos.xz - uCutP[i].xy) < uCutP[i].z) discard;
    #endif`
  );
};

let MATS = null;
export function worldMats() {
  if (MATS) return MATS;
  const sb = sandbags(), br = brick(), pl = planks(3), pl2 = planks(7, [96, 90, 80]), co = corrugated(), wa = wattle(), ea = earth(), ea2 = earth([70, 62, 50], 33);
  const ru = rubble(), cob = cobbles(), bal = ballast(), pan = pantiles(), sla = pantiles([88, 92, 98], 93), can = canvas(), hes = hessian(), scr = scrim(), wi = wireTex();
  const m = {
    sandbag: std({ map: sb.map, bumpMap: sb.bump, bumpScale: 2.2 }),
    brick: std({ map: br.map, bumpMap: br.bump, bumpScale: 2 }),
    plank: std({ map: pl.map, bumpMap: pl.bump, bumpScale: 1.4 }),
    timber: std({ map: pl2.map, bumpMap: pl2.bump, bumpScale: 1.4 }),
    iron: std({ map: co.map, bumpMap: co.bump, bumpScale: 3, roughness: 0.6, metalness: 0.5 }),
    wattle: std({ map: wa.map, bumpMap: wa.bump, bumpScale: 2.5 }),
    earth: std({ map: ea.map, bumpMap: ea.bump, bumpScale: 3 }),
    mud: std({ map: ea2.map, bumpMap: ea2.bump, bumpScale: 3, roughness: 0.55 }),
    rubble: std({ map: ru.map, bumpMap: ru.bump, bumpScale: 4 }),
    cobble: std({ map: cob.map, bumpMap: cob.bump, bumpScale: 3, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    ballast: std({ map: bal.map, bumpMap: bal.bump, bumpScale: 3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    pantile: std({ map: pan.map, bumpMap: pan.bump, bumpScale: 3 }),
    slate: std({ map: sla.map, bumpMap: sla.bump, bumpScale: 3 }),
    canvas: std({ map: can.map, bumpMap: can.bump, bumpScale: 1, side: THREE.DoubleSide }),
    hessian: std({ map: hes.map, bumpMap: hes.bump, bumpScale: 1.5, side: THREE.DoubleSide }),
    scrim: std({ map: scr.map, alphaTest: 0.5, side: THREE.DoubleSide }),
    wire: std({ map: wi.map, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, alphaTest: 0.02 }),
    steel: std({ color: 0x4b4a46, roughness: 0.5, metalness: 0.8 }),
    dark: std({ color: 0x2a2724, roughness: 0.9 }),
    water: std({ color: 0x4b4a3c, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.88, envMapIntensity: 1.4 }),
    paint: std({ color: 0xffffff, roughness: 0.8 }),
    foliage: std({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }),
  };
  m.wire.userData.noShadow = true;
  m.scrim.userData.noShadow = true;
  m.water.userData.noShadow = true;
  for (const [k, v] of Object.entries(m)) patchMaterial(v, k === 'scrim' ? 'scrim-cutaway' : 'fog', k === 'scrim' ? cutaway : undefined);
  MATS = m;
  return m;
}

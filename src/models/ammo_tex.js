import * as THREE from 'three';

// The Mörser 18's ammunition at maximum quality (shots/maxq/research/mrs18-ammunition.md): the stencils, stamps and
// surfaces as canvas textures, drawn at load from text and noise (procedural, no images, no fetched fonts). Hero only:
// nothing here runs at import, nothing else in the game reads it. Text only (PLAN.md rule 5): the acceptance stamps that
// carried an emblem are left out; only the struck numbers and letters remain.
//
// Every atlas is drawn once and cached. Each item gets an albedo canvas (sRGB, the paint and the stencils baked in) and a
// surface canvas packed for three's maps: R the bump height (bumpMap reads .r), G the roughness (roughnessMap .g), B the
// metalness (metalnessMap .b). UV v runs down the canvas (flipY false), so a canvas drawn upright reads upright where
// the builders map it (ammo_mrs18.js uses the layouts exported below). Without a canvas (Node) every atlas is null and
// the builders fall back to plain colours.

export const canDraw = () => typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';

// ---------------------------------------------------------------- layouts shared with ammo_mrs18.js

// The shell: the side (u round the shell, v from the nose face at the top down to the base) and the base face as a disk
// below it. Round the shell 2048 px over 0.66 m (3.1 px/mm), along it 1536 px over 0.846 m (1.8 px/mm): the lot lines'
// 16 mm letters are 29 px tall, about the screen's own density at 0.4 m from the camera.
export const SHELL_UV = { W: 2048, H: 2048, sideH: 1536, top: 0.846, base: { cx: 256, cy: 1792, R: 250, r: 0.1 } };
// the fuze AZ 23 umg: the setting head's cone and collar (top strip) and the retaining ring and flange (bottom strip)
export const FUZE_UV = { W: 1024, H: 512, head: [0, 160], ring: [160, 256], disk: { cx: 256, cy: 384, R: 120 } };
// (the top disk below the strips, mapped flat: the metal disc and collar seen from the nose)
// the copper bands: u round, v across both bands (0 the rear band's rear edge, 1 the front band's front edge)
export const BAND_UV = { W: 1024, H: 64 };
// the cartridge case 6351: the side (mouth at the top), the head disk below, the inside strip on the right
export const CASE_UV = { W: 1024, H: 1024, sideH: 640, len: 0.41, head: { cx: 200, cy: 832, R: 190, r: 0.1205 }, inner: [400, 640, 1024, 1024] };
// the six bags: a side strip each (rows of 128 px), the top disks in a row below, the bottom disk with the igniter pad
export const BAG_UV = { W: 2048, H: 1024, strip: 128, disk: { y: 768, size: 256 } };
// the leatherboard cup and its label (one disk), the pull tab's strip at the bottom
export const CUP_UV = { W: 512, H: 512, disk: { cx: 256, cy: 236, R: 230 }, tab: [0, 480, 512, 512] };
// the charge container: side (top rim at the top), the lid's top disk, the lid's skirt, the inside
export const CAN_UV = { W: 1024, H: 1024, sideH: 512, lid: { cx: 256, cy: 768, R: 250 }, skirt: [512, 512, 1024, 576], inner: [512, 600, 1024, 1024] };

// ---------------------------------------------------------------- canvas helpers

function cv(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
// (in the worker, CAPTURE below, every canvas is a software one: a GPU canvas's transferred ImageBitmap lost its backing
// when it came to be uploaded on the main thread (Chrome: "non-existent mailbox"), and every atlas drew black)
const ctx2 = (c) => c.getContext('2d', { willReadFrequently: CAPTURE });

// a seeded generator (mulberry32): the textures repeat from load to load, so captures compare
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// value noise by upscaling a small random canvas (smooth, native, fast): grey around 128 with the given spread. nw by
// nh values plus one column and one row that repeat the first, so the noise drawn from pixel centre 0 to pixel centre n
// is periodic: seamless round a solid of revolution (u wraps) and across the tiling atlases (wicker, tarpaulin, timber).
function noiseCanvas(nw, nh, R, spread = 1) {
  const w = nw + 1, h = nh + 1, v = new Float32Array(nw * nh);
  for (let i = 0; i < v.length; i++) v[i] = 128 + (R() - 0.5) * 255 * spread;
  const c = cv(w, h), x = ctx2(c), img = x.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) {
    const i = (y * w + k) * 4;
    d[i] = d[i + 1] = d[i + 2] = v[(y % nh) * nw + (k % nw)]; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// fbm over a rectangle with a composite op: octaves of upscaled noise, each half the cell of the one before; the cell
// count divides the rectangle exactly, so every octave wraps at its edges
function fbm(ctx, x0, y0, w, h, R, { cell = 64, oct = 4, alpha = 0.3, op = 'overlay', aspect = 1 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  let a = alpha, c = cell;
  for (let o = 0; o < oct; o++) {
    const nw = Math.max(2, Math.round(w / (c * aspect))), nh = Math.max(2, Math.round(h / c));
    ctx.globalAlpha = a;
    ctx.drawImage(noiseCanvas(nw, nh, R), 0.5, 0.5, nw, nh, x0, y0, w, h);
    a *= 0.6; c = Math.max(1, c / 2);
  }
  ctx.restore();
}
// an ellipse drawn again one tile width (and height) over where it crosses an edge, for the tiling atlases
function wrapEllipse(c, x, y, rx, ry, rot, W, H) {
  for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) {
    if ((dx && Math.abs(x + dx - W / 2) > W / 2 + Math.max(rx, ry)) || (dy && Math.abs(y + dy - H / 2) > H / 2 + Math.max(rx, ry))) continue;
    c.beginPath(); c.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2); c.fill();
  }
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const grey = (v, a = 1) => rgb(v, v, v, a);

// Pack three greyscale canvases into one surface map: R bump, G roughness, B metalness.
function pack(bump, rough, metal) {
  const w = bump.width, h = bump.height, out = cv(w, h), o = ctx2(out);
  const B = ctx2(bump).getImageData(0, 0, w, h).data, G = ctx2(rough).getImageData(0, 0, w, h).data, M = ctx2(metal).getImageData(0, 0, w, h).data;
  const img = o.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h * 4; i += 4) { d[i] = B[i]; d[i + 1] = G[i]; d[i + 2] = M[i]; d[i + 3] = 255; }
  o.putImageData(img, 0, 0);
  return out;
}
// a surface set: three canvases of one size filled with base values, drawn on together through `all`
function surfSet(w, h, bump = 128, rough = 140, metal = 0) {
  const s = { bump: cv(w, h), rough: cv(w, h), metal: cv(w, h) };
  s.b = ctx2(s.bump); s.r = ctx2(s.rough); s.m = ctx2(s.metal);
  s.b.fillStyle = grey(bump); s.b.fillRect(0, 0, w, h);
  s.r.fillStyle = grey(rough); s.r.fillRect(0, 0, w, h);
  s.m.fillStyle = grey(metal); s.m.fillRect(0, 0, w, h);
  return s;
}

// The atlases' size: 1 draws them as laid out above (about 100 MB of textures with their mipmaps); set 0.5 before the
// first build for a lean page (the headless tests) or Low quality: each finished canvas is scaled down, the UVs hold.
let SCALE = 1;
export const ammoTexScale = (s) => { SCALE = Math.max(0.125, Math.min(1, s)); };
export const ammoTexScaleNow = () => SCALE;
export const ammoTexBytes = () => bytes;
let bytes = 0;
// the atlases drawn so far, by name (shell, band, fuze, case, bag, cup, can, wicker, tarp, wood)
const C = {};
// In the worker (drawAtlasesForTransfer) tex() hands back the canvas and its settings instead of a texture; the main
// thread makes the textures from the transferred bitmaps (installAtlases).
let CAPTURE = false;
function tex(c, srgb, o = {}) {
  if (SCALE < 1) {
    const d = cv(Math.max(4, Math.round(c.width * SCALE)), Math.max(4, Math.round(c.height * SCALE))), x = ctx2(d);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, d.width, d.height);
    c = d;
  }
  if (CAPTURE) return { canvas: c, srgb, repeat: !!o.repeat, aniso: o.aniso ?? 8 };
  return texFrom(c, srgb, o);
}
function texFrom(img, srgb, { repeat = false, aniso = 8 } = {}) {
  bytes += img.width * img.height * 4 * 4 / 3;
  const t = img.getContext ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = THREE.RepeatWrapping; // (u runs round a solid of revolution: the seam must wrap)
  t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * In a worker (models/ammoTexWorker.js): draws every atlas and returns { out, transfer }: out[name][key] =
 * { bitmap, srgb, repeat, aniso }, transfer the ImageBitmaps to post. The same code as the main thread's, so the same
 * pixels.
 */
export function drawAtlasesForTransfer(scale) {
  CAPTURE = true;
  if (scale) ammoTexScale(scale);
  const all = { shell: shellAtlas, band: bandAtlas, fuze: fuzeAtlas, case: caseAtlas, bag: bagAtlas, cup: cupAtlas, can: canAtlas, wicker: wickerAtlas, tarp: tarpAtlas, wood: woodAtlas };
  const out = {}, transfer = [];
  for (const [name, f] of Object.entries(all)) {
    const a = f();
    if (!a) continue;
    out[name] = {};
    for (const [key, d] of Object.entries(a)) {
      const bitmap = d.canvas.transferToImageBitmap();
      out[name][key] = { bitmap, srgb: d.srgb, repeat: d.repeat, aniso: d.aniso };
      transfer.push(bitmap);
    }
  }
  return { out, transfer };
}
/** On the main thread: the worker's atlases become the cached textures (an atlas already drawn here is kept). */
export function installAtlases(out) {
  for (const [name, a] of Object.entries(out ?? {})) {
    if (C[name] != null) { for (const d of Object.values(a)) d.bitmap?.close?.(); continue; }
    const o = {};
    for (const [key, d] of Object.entries(a)) o[key] = texFrom(d.bitmap, d.srgb, d);
    C[name] = o;
  }
}
/** True once every atlas is drawn (here or installed from the worker). */
export const atlasesReady = () => ['shell', 'band', 'fuze', 'case', 'bag', 'cup', 'can', 'wicker', 'tarp', 'wood'].every((n) => C[n] != null);

// ---------------------------------------------------------------- stencil and stamp lettering

// The period stencils are a condensed sans (DIN 1451 style). The browser's own sans serif, condensed, stands in; the
// stencil bridges are cut into the closed letters, the edges get a little overspray and the paint a few holes.
const FONT = (px, w = 'bold') => `${w} ${px}px "DejaVu Sans Condensed", "Liberation Sans Narrow", "Arial Narrow", "DejaVu Sans", Arial, sans-serif`;
const BRIDGE2 = new Set([...'0OQ689']), BRIDGE1 = new Set([...'ABDPR4']);

/**
 * Draws `str` centred on (cx, cy) with capitals `cap` px tall, stretched sideways by `sx` (the side textures wrap a
 * solid of revolution: a letter's width on the canvas is its width in mm times the px/mm round the solid at that place).
 * o: { color, stencil (bridges), spray (overspray alpha), wear (holes), R (rng), weight, ctx2: a second context drawn
 * with the same glyphs (the bump of a struck stamp) and its colour, rot (radians, for text round a disk) }.
 */
function letter(ctx, str, cx, cy, cap, sx = 1, o = {}) {
  const px = cap / 0.72, R = o.R ?? Math.random;
  const tmpW = Math.ceil(px * str.length * 1.1 * sx + px), tmpH = Math.ceil(px * 1.6);
  const t = cv(tmpW, tmpH), x = ctx2(t);
  x.font = FONT(px, o.weight ?? 'bold');
  x.textBaseline = 'alphabetic';
  // glyph by glyph (the bridges need each glyph's place)
  const adv = [...str].map((ch) => x.measureText(ch).width * sx * (o.track ?? 1));
  const total = adv.reduce((a, b) => a + b, 0), base = tmpH * 0.78;
  let gx = (tmpW - total) / 2;
  x.fillStyle = '#fff';
  const glyphs = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    x.save(); x.translate(gx, base); x.scale(sx, 1); x.fillText(ch, 0, 0); x.restore();
    glyphs.push([ch, gx, adv[i]]);
    gx += adv[i];
  }
  if (o.stencil) {
    x.globalCompositeOperation = 'destination-out';
    for (const [ch, g0, w] of glyphs) {
      const mid = g0 + w * (ch === '4' ? 0.62 : 0.5), bw = Math.max(1, cap * 0.075);
      if (BRIDGE2.has(ch)) { x.fillRect(mid - bw / 2, base - cap * 1.05, bw, cap * 0.24); x.fillRect(mid - bw / 2, base - cap * 0.2, bw, cap * 0.3); }
      else if (BRIDGE1.has(ch)) x.fillRect(mid - bw / 2, base - cap * (ch === 'A' ? 0.62 : 1.05), bw, cap * 0.24);
    }
    x.globalCompositeOperation = 'source-over';
  }
  if (o.wear) {
    // the paint lost in flecks where the shells rubbed
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < str.length * 6 * o.wear; i++) {
      x.beginPath();
      x.ellipse(R() * tmpW, base - R() * cap * 1.1, (0.5 + R() * 1.6) * Math.max(1, cap / 30), (0.4 + R()) * Math.max(1, cap / 40), R() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }
  // colour it
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = o.color ?? '#141412';
  x.fillRect(0, 0, tmpW, tmpH);
  const draw = (c, alpha, blur) => {
    // a blur is made on the glyphs' own small canvas: ctx.filter on the big atlas cost a layer the atlas's size per
    // letter (3.6 s for the bags in SwiftShader)
    let src = t;
    if (blur) { src = cv(tmpW, tmpH); const bx = ctx2(src); bx.filter = `blur(${blur}px)`; bx.drawImage(t, 0, 0); }
    c.save();
    c.translate(cx, cy);
    if (o.rot) c.rotate(o.rot);
    c.globalAlpha = alpha;
    c.drawImage(src, -tmpW / 2, -(base - cap / 2));
    c.restore();
  };
  if (o.spray) draw(ctx, o.spray, Math.max(1, cap * 0.05));
  draw(ctx, o.alpha ?? 0.93, 0);
  if (o.ctx2) {
    // the same glyphs into another canvas (a stamp's bump, a stencil's roughness)
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = o.color2 ?? '#000';
    x.fillRect(0, 0, tmpW, tmpH);
    draw(o.ctx2, o.alpha2 ?? 1, o.blur2 ?? 0);
  }
}

// a struck stamp: small characters sunk into the steel (bump), the bottoms a shade darker (grime) in the albedo
function stamp(alb, bump, str, cx, cy, cap, sx, R, rot = 0) {
  letter(alb, str, cx, cy, cap, sx, { color: 'rgba(20,20,16,1)', alpha: 0.13, weight: 'normal', R, rot, ctx2: bump, color2: '#000', alpha2: 0.85, blur2: 0.6 });
}

// ---------------------------------------------------------------- the shell

// The 21 cm Gr 18's outline (ammo_mrs18.js GR18) as radius at s from the base; the stencils' sideways stretch needs it.
export function gr18Radius(s) {
  if (s < 0.054) return 0.0996 + (s / 0.054) * 0.0057;
  if (s < 0.4336) return s < 0.108 || (s > 0.161 && s < 0.184) || s > 0.39 ? 0.1053 : 0.1046;
  return Math.max(0.0301, -1.9881 + Math.sqrt(4.41 - (s - 0.2672) ** 2));
}
const sY = (s) => ((SHELL_UV.top - s) / SHELL_UV.top) * SHELL_UV.sideH; // canvas y of s
const PXV = SHELL_UV.sideH / SHELL_UV.top / 1000; // px per mm along the shell
const sxAt = (r) => SHELL_UV.W / (2 * Math.PI * r * 1000) / PXV; // sideways stretch at radius r (m)

// Deep olive (TM 9-1985-3 p. 349: "Sprgr.: deep olive green"; the shade is a reading, research 1.6): sRGB about #50553f.
export const OLIVE = [80, 85, 63];

/** The shell's albedo and surface maps ({ map, surf, flight }), or null without a canvas. */
export function shellAtlas() {
  if (C.shell != null) return C.shell;
  if (!canDraw()) return (C.shell = null);
  const { W, H, sideH } = SHELL_UV, R = rng(1806);
  const a = cv(W, H), A = ctx2(a);
  const S = surfSet(W / 2, H / 2, 128, 128, 0); // the surface at half size (6.6 MB less, the stamps still 8 px)
  const half = (c) => { c.save(); c.scale(0.5, 0.5); return c; };
  // ---- the paint: a factory spray coat, even in tone (the wartime photos show the shells uniformly dark), with a faint
  // cloud of thicker and thinner coats and a fine orange peel
  A.fillStyle = rgb(...OLIVE); A.fillRect(0, 0, W, H);
  fbm(A, 0, 0, W, H, R, { cell: 256, oct: 4, alpha: 0.07, op: 'overlay', aspect: 1.5 }); // coats
  fbm(A, 0, 0, W, H, R, { cell: 8, oct: 2, alpha: 0.05, op: 'overlay' }); // grit
  // a slightly browner cast toward the base (the lacquer yellows where the shell stood and was handled)
  A.save(); A.globalCompositeOperation = 'soft-light'; A.globalAlpha = 0.25;
  const cast = A.createLinearGradient(0, 0, 0, sideH);
  cast.addColorStop(0, rgb(70, 76, 58)); cast.addColorStop(1, rgb(64, 58, 44));
  A.fillStyle = cast; A.fillRect(0, 0, W, sideH); A.restore();
  // the surface: satin paint (roughness 0.52 to 0.6), a fine orange peel in the bump (a sprayed coat, not hammered)
  S.r.fillStyle = grey(140); S.r.fillRect(0, 0, W, H);
  fbm(S.r, 0, 0, W / 2, H / 2, R, { cell: 64, oct: 4, alpha: 0.16, op: 'overlay' });
  fbm(S.b, 0, 0, W / 2, H / 2, R, { cell: 4, oct: 2, alpha: 0.09, op: 'source-over' });
  // ---- wear: where a shell rubs in its basket, on the dunnage and on the tray (the bourrelets, the base edge) the
  // paint is burnished and in places worn to a dull, darkened steel, in fine strokes round the shell; elsewhere only a
  // few knocks and light scratches. Bare steel that has been handled is grey, not bright (estimate from museum shells).
  const scuffZone = (s0, s1, n, len, alpha) => {
    for (let i = 0; i < n; i++) {
      const y = sY(s0 + (s1 - s0) * R()), x = R() * W, l = len * (0.25 + R()), th = 0.5 + R() * 1.2, k = R(), a = alpha * (0.4 + 0.6 * R());
      const st = 88 + k * 34;
      A.fillStyle = rgb(st, st + 1, st - 3, a);
      wrapEllipse(A, x, y, l, th, (R() - 0.5) * 0.06, W, 1e6);
      for (const [c, v] of [[S.m, 150], [S.r, 110], [S.b, 118]]) {
        c.fillStyle = grey(v, a); c.beginPath(); c.ellipse(x / 2, y / 2, l / 2, Math.max(0.5, th / 2), 0, 0, Math.PI * 2); c.fill();
      }
    }
  };
  // the burnish first: a band of paint rubbed smoother and a shade darker on each bourrelet's crest
  const burnish = (s0, s1, a) => {
    // feathered to nothing at both edges and faint: a hard-edged darker stripe reads as a colour band, which German HE
    // does not carry (TM p. 350)
    const y0 = sY(s1), y1 = sY(s0), g = A.createLinearGradient(0, y0, 0, y1), gr = S.r.createLinearGradient(0, y0 / 2, 0, y1 / 2);
    for (const [t, k] of [[0, 0], [0.35, 1], [0.65, 1], [1, 0]]) { g.addColorStop(t, rgb(52, 56, 42, a * k)); gr.addColorStop(t, grey(112, a * 3 * k)); }
    A.fillStyle = g; A.fillRect(0, y0, W, y1 - y0);
    S.r.fillStyle = gr; S.r.fillRect(0, y0 / 2, W / 2, (y1 - y0) / 2);
  };
  burnish(0.062, 0.106, 0.06); burnish(0.395, 0.432, 0.05); burnish(0.165, 0.182, 0.04);
  scuffZone(0.064, 0.104, 90, 26, 0.6); // the rear bourrelet
  scuffZone(0.165, 0.181, 30, 18, 0.45); // the bourrelet above the bands
  scuffZone(0.396, 0.43, 80, 26, 0.55); // the front bourrelet
  scuffZone(0.001, 0.008, 110, 16, 0.7); // the base edge
  scuffZone(0.1, 0.84, 22, 8, 0.3); // knocks anywhere
  for (let i = 0; i < 9; i++) {
    // long light scratches along the body
    const x = R() * W, y0 = sY(0.05 + R() * 0.7), len = 30 + R() * 140, ang = (R() - 0.5) * 1.2;
    A.strokeStyle = rgb(112, 114, 106, 0.22); A.lineWidth = 0.8; A.beginPath(); A.moveTo(x, y0); A.lineTo(x + Math.cos(ang) * len, y0 + Math.sin(ang) * len * 0.5); A.stroke();
  }
  // ---- the stencils (TM 9-1985-3 pp. 349 to 350, fig. 532 for the 21 cm Gr 18 Be), black unless noted, on one face
  // (u 0.25: up at roll 0). Sizes from fig. 532 at the shell's own scale.
  const U = 0.25 * W, st = (str, s, cap, o = {}) => letter(A, str, U + (o.du ?? 0) * W, sY(s), cap * PXV, sxAt(gr18Radius(s)) * (o.cond ?? 0.86), { stencil: true, spray: 0.22, wear: 0.6, R, color: o.color, ctx2: half(S.r), color2: grey(160), alpha2: 1, ...o });
  // the filler numeral below the fuze hole: 14, cast TNT (the drawing: "Sprengstoff (gegossen)")
  st('14', 0.715, 26); S.r.restore();
  // R near the tip: the smoke box (G.R. 295a: "einschl. Zdlg. u. R.")
  st('R', 0.79, 17, { du: 0.0 }); S.r.restore();
  // the filling plant, date and lot on the shoulder (fig. 532's format "29 She _.1.41.E."; a 1943 lot)
  st('31 She 18.2.43 E.', 0.462, 16); S.r.restore();
  // the weight class in Roman numerals near the bourrelet: II (fig. 532)
  st('II', 0.322, 46, { cond: 0.8 }); S.r.restore();
  // the assembly plant, date and lot just above the bands, "in 1-inch black or red lettering" (TM p. 349; fig. 532's
  // "She 23._.41.E."): capitals 22 mm, the line about 25 mm
  st('She 23.2.43 E.', 0.209, 22); S.r.restore();
  // KPS in white above the band: the copper-clad iron (bimetal) bands
  st('KPS', 0.1735, 12, { color: '#d9d6c8', du: 0.0 }); S.r.restore();
  // ---- the struck stamps (bump only; no acceptance stamps, they carried an emblem): delivery number, firm and year
  // on the ogive, the design number and a delivery number above the bands, the same by the base
  const sb = (str, s, cap, du = 0) => { stamp(A, half(S.b), str, U + du * W, sY(s), cap * PXV, sxAt(gr18Radius(s)) * 0.8, R); S.b.restore(); };
  sb('4711 dbg 43', 0.505, 6, 0.06);
  sb('Gr 18', 0.235, 7, -0.07);
  sb('873 dbg 43', 0.235, 6, 0.07);
  sb('1105 dbg 43', 0.03, 5.5, 0.03);
  // ---- the base face (a disk below the side): paint, the worn edge, the stamps
  const B0 = SHELL_UV.base;
  A.save(); A.beginPath(); A.arc(B0.cx, B0.cy, B0.R + 6, 0, Math.PI * 2); A.clip();
  fbm(A, B0.cx - B0.R, B0.cy - B0.R, B0.R * 2, B0.R * 2, R, { cell: 50, oct: 4, alpha: 0.12, op: 'overlay' });
  // grime from the dunnage and the basket's block, the edge ring rubbed to dull steel
  A.fillStyle = rgb(60, 52, 40, 0.18); A.beginPath(); A.arc(B0.cx, B0.cy, B0.R * 0.8, 0, Math.PI * 2); A.fill();
  for (let i = 0; i < 160; i++) {
    const t = R() * Math.PI * 2, rr = B0.R * (0.92 + R() * 0.08);
    A.fillStyle = rgb(108, 110, 104, 0.45 * R()); A.beginPath(); A.ellipse(B0.cx + Math.cos(t) * rr, B0.cy + Math.sin(t) * rr, 2 + R() * 5, 0.8 + R() * 1.2, t + Math.PI / 2, 0, Math.PI * 2); A.fill();
  }
  A.restore();
  const bs = (str, x, y, cap, rot = 0) => { stamp(A, half(S.b), str, B0.cx + x * B0.R, B0.cy + y * B0.R, cap * B0.R / 100, 0.85, R, rot); S.b.restore(); };
  bs('Gr 18', 0, -0.05, 10); bs('2096 dbg 43', 0, 0.22, 8); bs('37', -0.42, -0.35, 8); bs('E', 0.45, -0.35, 8);
  // ---- done: the flight map is the same paint with the lettering smeared into rings (a 21 cm shell turns about a
  // hundred times a second in flight, research 3.1.9)
  const map = tex(a, true, { aniso: 16 });
  const surf = tex(pack(S.bump, S.rough, S.metal), false, { aniso: 16 });
  const fl = cv(64, 512), F = ctx2(fl);
  F.imageSmoothingEnabled = true; F.drawImage(a, 0, 0, W, sideH, 0, 0, 64, 384); F.drawImage(a, 0, sideH, W, H - sideH, 0, 384, 64, 128);
  const fd = F.getImageData(0, 0, 64, 384), d = fd.data;
  for (let y = 0; y < 384; y++) {
    let r = 0, g = 0, b = 0;
    for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; d[i] = r / 64; d[i + 1] = g / 64; d[i + 2] = b / 64; }
  }
  F.putImageData(fd, 0, 0);
  const flight = tex(fl, true, { aniso: 4 });
  return (C.shell = { map, surf, flight });
}

/** The copper bands ({ map, surf, flightMap, flightSurf }): darkened copper; in flight engraved by the 64 grooves. */
export function bandAtlas() {
  if (C.band != null) return C.band;
  if (!canDraw()) return (C.band = null);
  const { W, H } = BAND_UV, R = rng(64);
  const mk = (flight) => {
    const a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, flight ? 90 : 105, 255);
    // copper-clad iron (KPS) gone a dull brownish copper in store (TM p. 349; the shade is an estimate)
    A.fillStyle = rgb(150, 92, 60); A.fillRect(0, 0, W, H);
    fbm(A, 0, 0, W, H, R, { cell: 64, oct: 4, alpha: 0.22, op: 'overlay', aspect: 3 });
    // tarnish: browner and darker in soft patches; a few bright knocks
    A.fillStyle = rgb(92, 56, 38, 0.16); for (let i = 0; i < 30; i++) wrapEllipse(A, R() * W, R() * H, 14 + R() * 40, 4 + R() * 8, 0, W, 1e6);
    fbm(S.r, 0, 0, W, H, R, { cell: 30, oct: 3, alpha: 0.35 });
    if (!flight) for (let i = 0; i < 40; i++) { const x = R() * W, y = R() * H; A.fillStyle = rgb(225, 150, 105, 0.5); A.fillRect(x, y, 3 + R() * 9, 1 + R()); S.r.fillStyle = grey(70); S.r.fillRect(x, y, 3 + R() * 9, 1 + R()); }
    if (flight) {
      // 64 grooves cut by the lands: bright scraped copper on the lands' flanks, dark in the grooves (the twist ignored)
      const p = W / 64;
      for (let i = 0; i < 64; i++) {
        const x = i * p;
        A.fillStyle = rgb(60, 34, 24, 0.85); A.fillRect(x, 0, p * 0.42, H);
        A.fillStyle = rgb(236, 168, 120, 0.9); A.fillRect(x + p * 0.42, 0, p * 0.12, H);
        S.b.fillStyle = grey(40); S.b.fillRect(x, 0, p * 0.42, H);
        S.r.fillStyle = grey(70); S.r.fillRect(x + p * 0.42, 0, p * 0.58, H);
      }
    }
    return { map: tex(a, true, { aniso: 16 }), surf: tex(pack(S.bump, S.rough, S.metal), false, { aniso: 16 }) };
  };
  const st = mk(false), fl = mk(true);
  return (C.band = { map: st.map, surf: st.surf, flightMap: fl.map, flightSurf: fl.surf });
}

/**
 * The fuze AZ 23 umg (HEA Pamphlet 12 fig. 6): rust-proofed steel (dark grey phosphate), on the setting head two
 * engraved lines at right angles marked OV and MV, on the retaining ring the index line and "AZ 23 umg" with the maker's
 * code and year stamped above the flange. u round the fuze (the same turn as the shell), v down from the top.
 */
export function fuzeAtlas() {
  if (C.fuze != null) return C.fuze;
  if (!canDraw()) return (C.fuze = null);
  const { W, H } = FUZE_UV, R = rng(23);
  const a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, 150, 120);
  // rust-proofed steel (HEA fig. 6: "rust proofed steel body"): an even dark phosphate grey with a fine crystalline
  // grain, not a mottle (the shade is an estimate)
  A.fillStyle = rgb(60, 62, 60); A.fillRect(0, 0, W, H);
  fbm(A, 0, 0, W, H, R, { cell: 96, oct: 3, alpha: 0.07, op: 'overlay', aspect: 2 });
  fbm(A, 0, 0, W, H, R, { cell: 4, oct: 2, alpha: 0.08, op: 'overlay' });
  fbm(S.r, 0, 0, W, H, R, { cell: 8, oct: 3, alpha: 0.18 });
  fbm(S.m, 0, 0, W, H, R, { cell: 32, oct: 2, alpha: 0.12 });
  // handling: the setting head's rim and the collar rubbed a little brighter and smoother by the fingers
  for (let i = 0; i < 70; i++) { const x = R() * W, y = 4 + R() * 150; A.fillStyle = rgb(104, 106, 102, 0.18); A.fillRect(x, y, 3 + R() * 10, 1); S.r.fillStyle = grey(110, 0.4); S.r.fillRect(x, y, 3 + R() * 10, 1); }
  // the setting lines (head strip, 0 to 160 px: collar 0 to 40, the cone 40 to 160): engraved full height of the cone,
  // at u 0.25 (OV, up when the head is set to OV) and u 0.5 (MV: a quarter turn on; HEA P12: "two lines at right angles
  // ... marked MV and ... OV"); the letters engraved beside them, bright in the cut
  const line = (u) => {
    A.fillStyle = rgb(150, 152, 148, 0.85); A.fillRect(u * W - 2, 46, 4, 110);
    S.b.fillStyle = grey(30); S.b.fillRect(u * W - 2.5, 46, 5, 110);
    S.m.fillStyle = grey(230); S.r.fillStyle = grey(70); S.m.fillRect(u * W - 2, 46, 4, 110); S.r.fillRect(u * W - 2, 46, 4, 110);
  };
  line(0.25); line(0.5);
  for (const [t, u] of [['OV', 0.25], ['MV', 0.5]]) letter(A, t, u * W + 26, 110, 26, 1.1, { color: 'rgba(150,152,148,1)', weight: 'bold', R, ctx2: S.b, color2: '#000', alpha2: 0.8, blur2: 0.5 });
  // the retaining ring and the flange (160 to 256): the index line at u 0.25 and the designation stamped round above the
  // flange (HEA P12: "identified by the designation stamped above the flange"; fig. 6 has "AZ 23 umg 0,15" and "bvw 42";
  // this is the drawing's other fuze, the m.2V with the OV and MV head)
  A.fillStyle = rgb(160, 162, 156, 0.9); A.fillRect(0.25 * W - 2, 160, 4, 60);
  S.b.fillStyle = grey(30); S.b.fillRect(0.25 * W - 2.5, 160, 5, 60);
  const st = { color: 'rgba(96,98,94,1)', weight: 'normal', R, ctx2: S.b, color2: '#000', alpha2: 0.75 };
  letter(A, 'AZ 23 umg m.2V', 0.56 * W, 204, 20, 1.15, st);
  letter(A, 'bvw 43', 0.9 * W, 204, 20, 1.15, st);
  // the top (a flat disk below the strips): the metal disc's face, turned, and the collar round it
  const D = FUZE_UV.disk;
  for (let r = 2; r < D.R; r += 1.6) { A.strokeStyle = rgb(R() < 0.5 ? 84 : 46, 70, 66, 0.12); A.lineWidth = 0.9; A.beginPath(); A.arc(D.cx, D.cy, r, 0, Math.PI * 2); A.stroke(); }
  A.strokeStyle = rgb(34, 35, 34, 0.9); A.lineWidth = 2; A.beginPath(); A.arc(D.cx, D.cy, D.R * 0.57, 0, Math.PI * 2); A.stroke();
  S.b.strokeStyle = grey(70); S.b.lineWidth = 3; S.b.beginPath(); S.b.arc(D.cx, D.cy, D.R * 0.57, 0, Math.PI * 2); S.b.stroke();
  return (C.fuze = { map: tex(a, true, { aniso: 16 }), surf: tex(pack(S.bump, S.rough, S.metal), false, { aniso: 16 }) });
}

// ---------------------------------------------------------------- the cartridge case 6351

/**
 * The brass case 6351 (TM 9-1985-3 p. 523): tarnished brass with handling smudges; the head struck with the model
 * number, the weapon, a maker's code, a lot and the year (as on the 17 cm case 6324/78C, HEA fig. 17), and stencilled in
 * black with the charge's propellant (as the 15 cm K Mrs Laf's, HEA Pamphlet 14). { map, surf, spentMap, spentSurf }:
 * the spent case sooted at the mouth and inside, heat-tinted, the primer struck.
 */
export function caseAtlas() {
  if (C.case != null) return C.case;
  if (!canDraw()) return (C.case = null);
  const { W, H, sideH } = CASE_UV, R = rng(6351), Hd = CASE_UV.head;
  const draw = (spent) => {
    const a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, 92, 240);
    // drawn brass: an even yellow brass, faint streaks along the case from the drawing dies, a soft dulling tarnish in
    // store, a few dings and handling smudges (museum cases and the period photos; the tones are estimates)
    A.fillStyle = rgb(184, 148, 82); A.fillRect(0, 0, W, H);
    fbm(A, 0, 0, W, sideH, R, { cell: 140, oct: 3, alpha: 0.055, op: 'overlay', aspect: 0.12 }); // die streaks
    fbm(A, 0, 0, W, sideH, R, { cell: 220, oct: 4, alpha: 0.06, op: 'overlay', aspect: 1.2 }); // tarnish
    A.save(); A.globalCompositeOperation = 'multiply'; A.fillStyle = rgb(236, 226, 206, 0.5); A.fillRect(0, 0, W, sideH); A.restore();
    fbm(S.r, 0, 0, W, H, R, { cell: 90, oct: 4, alpha: 0.2, aspect: 0.4 });
    // handling: a few smudged prints (a little darker and duller) round the middle, where the case is carried
    for (let i = 0; i < 14; i++) {
      const x = R() * W, y = sideH * (0.35 + R() * 0.5), rw = 8 + R() * 8, rh = 10 + R() * 12, t = R();
      A.fillStyle = rgb(110, 84, 46, 0.06); wrapEllipse(A, x, y, rw, rh, t, W, 1e6);
      S.r.fillStyle = grey(150, 0.35); wrapEllipse(S.r, x, y, rw, rh, t, W, 1e6);
    }
    // dings: small dents catch a darker edge
    for (let i = 0; i < 18; i++) { const x = R() * W, y = R() * sideH; A.fillStyle = rgb(96, 72, 36, 0.35); A.beginPath(); A.ellipse(x, y, 1 + R() * 2.5, 0.6 + R(), R() * 3, 0, Math.PI * 2); A.fill(); S.b.fillStyle = grey(90, 0.7); S.b.beginPath(); S.b.arc(x, y, 1.5, 0, Math.PI * 2); S.b.fill(); }
    // the head: turned rings, struck lettering round it, the black stencil, the primer C/12 nA (TM, HEA P14: lip 31.75)
    const cx = Hd.cx, cy = Hd.cy, k = Hd.R / Hd.r / 1000; // px per mm on the head
    A.save(); A.beginPath(); A.arc(cx, cy, Hd.R + 4, 0, Math.PI * 2); A.clip();
    A.fillStyle = rgb(178, 142, 78); A.fillRect(cx - Hd.R - 4, cy - Hd.R - 4, Hd.R * 2 + 8, Hd.R * 2 + 8);
    for (let r = 4; r < Hd.R; r += 1.4) { A.strokeStyle = R() < 0.5 ? rgb(214, 176, 108, 0.07) : rgb(120, 92, 48, 0.07); A.lineWidth = 0.9; A.beginPath(); A.arc(cx, cy, r, 0, Math.PI * 2); A.stroke(); }
    fbm(A, cx - Hd.R, cy - Hd.R, Hd.R * 2, Hd.R * 2, R, { cell: 60, oct: 3, alpha: 0.12, op: 'overlay' });
    // the head stands on the ground and the dunnage: a little scuffed and grimy toward the rim
    const rg = A.createRadialGradient(cx, cy, Hd.R * 0.55, cx, cy, Hd.R);
    rg.addColorStop(0, rgb(90, 70, 40, 0)); rg.addColorStop(1, rgb(90, 70, 40, 0.22));
    A.fillStyle = rg; A.fillRect(cx - Hd.R, cy - Hd.R, Hd.R * 2, Hd.R * 2);
    A.restore();
    S.r.fillStyle = grey(84); S.r.beginPath(); S.r.arc(cx, cy, Hd.R, 0, Math.PI * 2); S.r.fill();
    const hs = (str, ang, rr, cap) => {
      const x = cx + Math.sin(ang) * rr * k, y = cy - Math.cos(ang) * rr * k;
      letter(A, str, x, y, cap * k, 0.9, { color: 'rgba(60,44,20,1)', alpha: 0.35, weight: 'normal', R, rot: ang, ctx2: S.b, color2: '#000', alpha2: 0.9, blur2: 0.5 });
    };
    hs('6351', 0, 72, 9); hs('21cm Mrs.18', Math.PI, 72, 7); hs('P186', -Math.PI / 2, 76, 7); hs('43', Math.PI / 2, 78, 8); hs('37', -Math.PI / 4, 78, 6);
    // the propellant's weight stencilled in black across the head (as on the 15 cm K Mrs Laf's case, HEA P14): paint is
    // not metal, so the same glyphs take the metal out of the surface map and roughen it, and only there
    const paint = (str, y, cap, seed) => {
      const o = { stencil: true, spray: 0.2, wear: 0.5, color: '#151310' };
      letter(A, str, cx, y, cap, 0.85, { ...o, R: rng(seed) });
      letter(S.m, str, cx, y, cap, 0.85, { ...o, color: '#000', R: rng(seed) });
      letter(S.r, str, cx, y, cap, 0.85, { ...o, color: grey(196), R: rng(seed) });
    };
    paint('Digl.R.P.', cy - 34 * k, 8.5 * k, 61); paint('15,80 kg', cy + 34 * k, 9 * k, 62);
    // the primer: a slightly paler brass lip with a turned groove, two spanner holes, the cap in the middle
    const pr = 15.9 * k;
    A.fillStyle = rgb(196, 160, 96); A.beginPath(); A.arc(cx, cy, pr, 0, Math.PI * 2); A.fill();
    A.strokeStyle = rgb(70, 50, 24, 0.9); A.lineWidth = 1.6; A.beginPath(); A.arc(cx, cy, pr, 0, Math.PI * 2); A.stroke();
    A.beginPath(); A.arc(cx, cy, pr * 0.62, 0, Math.PI * 2); A.stroke();
    S.b.strokeStyle = grey(40); S.b.lineWidth = 2.5; S.b.beginPath(); S.b.arc(cx, cy, pr, 0, Math.PI * 2); S.b.stroke();
    S.b.lineWidth = 1.5; S.b.beginPath(); S.b.arc(cx, cy, pr * 0.62, 0, Math.PI * 2); S.b.stroke();
    for (const sgn of [-1, 1]) {
      A.fillStyle = rgb(40, 28, 14); A.beginPath(); A.arc(cx + sgn * pr * 0.8, cy, 2.1 * k, 0, Math.PI * 2); A.fill();
      S.b.fillStyle = grey(0); S.b.beginPath(); S.b.arc(cx + sgn * pr * 0.8, cy, 2.1 * k, 0, Math.PI * 2); S.b.fill();
    }
    // the inside (right half of the lower block): bare drawn brass, darker
    const [ix0, iy0, ix1, iy1] = CASE_UV.inner;
    A.fillStyle = rgb(150, 116, 62); A.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
    fbm(A, ix0, iy0, ix1 - ix0, iy1 - iy0, R, { cell: 50, oct: 3, alpha: 0.35, op: 'overlay' });
    if (spent) {
      // soot from the mouth down (outside: a ragged band 40 to 70 mm; inside: all of it), a straw-to-purple heat tint
      // below it, the primer's cap struck and blackened
      // (outside, the gas blown back past the mouth leaves a sooty band of 2 to 4 cm, ragged; the rest stays brass with a
      // faint straw-to-violet heat tint; estimate after fired large cases in museums)
      const sb = sideH * 0.085, g = A.createLinearGradient(0, 0, 0, sb);
      g.addColorStop(0, rgb(26, 22, 17, 0.9)); g.addColorStop(0.5, rgb(42, 34, 24, 0.55)); g.addColorStop(1, rgb(60, 45, 25, 0));
      A.fillStyle = g; A.fillRect(0, 0, W, sb);
      // ragged: streaks of soot blown along the case from the mouth, sooty and matt in the surface maps too
      for (let i = 0; i < 160; i++) {
        const x = R() * W, w = 1 + R() * 4, l = sb * (0.4 + R() * 1.1), sg = A.createLinearGradient(0, 0, 0, l);
        sg.addColorStop(0, rgb(30, 25, 19, 0.5)); sg.addColorStop(1, rgb(30, 25, 19, 0));
        A.fillStyle = sg; A.fillRect(x, 0, w, l);
        S.m.fillStyle = grey(60, 0.5); S.m.fillRect(x, 0, w, l * 0.8); S.r.fillStyle = grey(220, 0.5); S.r.fillRect(x, 0, w, l * 0.8);
      }
      const t = A.createLinearGradient(0, sb * 0.8, 0, sideH * 0.4);
      t.addColorStop(0, rgb(110, 70, 100, 0)); t.addColorStop(0.3, rgb(110, 70, 100, 0.08)); t.addColorStop(0.7, rgb(170, 120, 60, 0.08)); t.addColorStop(1, rgb(170, 120, 60, 0));
      A.fillStyle = t; A.fillRect(0, sb * 0.8, W, sideH * 0.4 - sb * 0.8);
      A.fillStyle = rgb(22, 18, 14, 0.95); A.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
      fbm(A, ix0, iy0, ix1 - ix0, iy1 - iy0, R, { cell: 20, oct: 3, alpha: 0.3, op: 'overlay' });
      for (const [c, v] of [[S.r, 235], [S.m, 30]]) { const gg = c.createLinearGradient(0, 0, 0, sideH * 0.1); gg.addColorStop(0, grey(v)); gg.addColorStop(1, grey(v, 0)); c.fillStyle = gg; c.fillRect(0, 0, W, sideH * 0.1); c.fillStyle = grey(v); c.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0); }
      A.fillStyle = rgb(30, 24, 18, 0.85); A.beginPath(); A.arc(cx, cy, 4.5 * k, 0, Math.PI * 2); A.fill();
    }
    return { map: tex(a, true, { aniso: 16 }), surf: tex(pack(S.bump, S.rough, S.metal), false, { aniso: 16 }) };
  };
  const live = draw(false), spent = draw(true);
  return (C.case = { map: live.map, surf: live.surf, spentMap: spent.map, spentSurf: spent.surf });
}

// ---------------------------------------------------------------- the six bags

// What each bag says. The Mörser 18's own charge sheet is not online (research 1.3, 1.7): the layout of the lines follows
// the sister 17 cm K Mrs Laf's sections (HEA Pamphlet 12 fig. 16: the section, the gun, the weight, the powder and its
// lot, the filler's code and date); the German names and the masses are estimates (game numbers: 2.48 kg for charge 1 up
// to 15.8 kg for charge 6).
// h: the bag's height (m), its share by mass (about 1 kg a litre, estimate) of the 0.339 m between the inner bottom and
// the cup: the case's inside from 34 mm above the head to the cup 17 mm below the mouth, less the igniter pad under the
// base bag and the top bag's dome and tape loop (the stack must not push through the cup).
export const BAGS = [
  { n: 1, name: 'Grundladung', kg: 2.48 },
  { n: 2, name: 'Teilkart. 2', kg: 1.72 },
  { n: 3, name: 'Teilkart. 3', kg: 2.0 },
  { n: 4, name: 'Teilkart. 4', kg: 2.4 },
  { n: 5, name: 'Teilkart. 5', kg: 3.2 },
  { n: 6, name: 'Teilkart. 6', kg: 4.0 },
].map((b) => ({ ...b, h: (0.339 * b.kg) / 15.8 }));
export const BAG_R = 0.1045; // the bags' radius (the case is 0.1085 inside at the mouth)

// a plain weave (the bags' silk, the cup's tab, the tarpaulin): threads over and under, each a little different. Drawn
// once as a tile of 16 by 16 threads and laid as a pattern (a gradient per thread over a whole atlas took a second).
function weave(A, B, x0, y0, w, h, p, R, { dark = 0.1, bump = 70 } = {}) {
  const n = p * 16, t = cv(n, n), T = ctx2(t), tb = cv(n, n), TB = ctx2(tb);
  for (let y = 0; y < n; y += p) for (let x = 0; x < n; x += p) {
    const over = ((x / p) + (y / p)) % 2 === 0, v = R();
    T.fillStyle = grey(over ? 255 : 214, 1); T.fillRect(x, y, p, p);
    T.fillStyle = grey(0, dark * (0.3 + v * 0.7)); T.fillRect(x, y, p, p);
    const gr = TB.createLinearGradient(x, y, over ? x + p : x, over ? y : y + p);
    gr.addColorStop(0, grey(128 - bump / 2)); gr.addColorStop(0.5, grey(128 + bump / 2)); gr.addColorStop(1, grey(128 - bump / 2));
    TB.fillStyle = gr; TB.fillRect(x, y, p, p);
  }
  const lay = (c, src) => { c.save(); c.translate(x0, y0); c.fillStyle = c.createPattern(src, 'repeat'); c.fillRect(0, 0, w, h); c.restore(); };
  lay(A, t);
  if (B) { B.save(); B.globalCompositeOperation = 'source-over'; lay(B, tb); B.restore(); }
}

/** The bags' cloth (off-white raw silk with a weave) with the black stencils: { map, surf }. */
export function bagAtlas() {
  if (C.bag != null) return C.bag;
  if (!canDraw()) return (C.bag = null);
  const { W, H, strip, disk } = BAG_UV, R = rng(18);
  const a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, 242, 0);
  A.fillStyle = rgb(222, 212, 186); A.fillRect(0, 0, W, H);
  A.save(); A.globalCompositeOperation = 'multiply'; weave(A, S.b, 0, 0, W, H, 3, R, { dark: 0.09, bump: 90 }); A.restore();
  fbm(A, 0, 0, W, H, R, { cell: 60, oct: 4, alpha: 0.18, op: 'overlay' });
  // handling grime and a few powder-grey stains (the Digl. sticks rub through)
  for (let i = 0; i < 90; i++) { A.fillStyle = rgb(120, 112, 92, 0.06 + R() * 0.06); A.beginPath(); A.ellipse(R() * W, R() * H, 8 + R() * 40, 6 + R() * 20, R() * 3, 0, Math.PI * 2); A.fill(); }
  const ink = { stencil: true, spray: 0.25, wear: 0.3, R, color: 'rgba(22,20,18,1)', ctx2: S.r, color2: grey(220), alpha2: 1 };
  const pxAround = W / (2 * Math.PI * BAG_R * 1000); // px per mm round a bag
  BAGS.forEach((b, i) => {
    const y0 = i * strip, cyl = y0 + strip / 2, pxV = strip / (b.h * 1000), sx = pxAround / pxV, mm = (v) => v * pxV;
    // the side strip: the number large at two places round the bag, the lines between (HEA fig. 16's order)
    for (const u of [0.125, 0.625]) letter(A, String(b.n), u * W, cyl, mm(Math.min(40, b.h * 1000 * 0.55)), sx, { ...ink });
    const cap = Math.min(6.5, (b.h * 1000) / 6.2), lines = [`${b.name}  21cm Mrs 18`, `${b.kg.toFixed(3).replace('.', ',')} kg Digl.R.P. G1,5 (450-5/2)`, 'dbg 1943/2  Ku 14.7.43 W.'];
    for (const u of [0.375, 0.875]) lines.forEach((l, j) => letter(A, l, u * W, cyl + mm(cap * 1.65 * (j - 1)), mm(cap), sx * 0.95, { ...ink, wear: 0.2, spray: 0.15, stencil: false, weight: 'normal' }));
    // the top disk: the number large, the section's name under it
    const dx = i * disk.size + disk.size / 2, dy = disk.y + disk.size / 2;
    letter(A, String(b.n), dx, dy, disk.size * 0.42, 1, { ...ink });
    letter(A, b.n === 1 ? 'Grundl.' : 'Teilk.', dx, dy + disk.size * 0.33, disk.size * 0.075, 1, { ...ink, stencil: false, weight: 'normal' });
  });
  // the base bag's bottom disk (slot 6): the igniter pad, quilted, a little darker silk (its colour is an estimate)
  const ix = 6 * disk.size + disk.size / 2, iy = disk.y + disk.size / 2, ir = disk.size * 0.2;
  A.fillStyle = rgb(196, 176, 150); A.beginPath(); A.arc(ix, iy, ir, 0, Math.PI * 2); A.fill();
  A.strokeStyle = rgb(110, 90, 70, 0.7); A.lineWidth = 1.5;
  for (let k = -3; k <= 3; k++) { A.beginPath(); A.moveTo(ix - ir, iy + k * ir / 3.5); A.lineTo(ix + ir, iy + k * ir / 3.5); A.stroke(); A.beginPath(); A.moveTo(ix + k * ir / 3.5, iy - ir); A.lineTo(ix + k * ir / 3.5, iy + ir); A.stroke(); }
  S.b.strokeStyle = grey(60); S.b.lineWidth = 2;
  for (let k = -3; k <= 3; k++) { S.b.beginPath(); S.b.moveTo(ix - ir, iy + k * ir / 3.5); S.b.lineTo(ix + ir, iy + k * ir / 3.5); S.b.stroke(); S.b.beginPath(); S.b.moveTo(ix + k * ir / 3.5, iy - ir); S.b.lineTo(ix + k * ir / 3.5, iy + ir); S.b.stroke(); }
  // the seams' stitches: a dashed line along the top and bottom of each strip
  A.strokeStyle = rgb(120, 110, 90, 0.6); A.lineWidth = 1.2; A.setLineDash([5, 4]);
  for (let i = 0; i < 6; i++) for (const y of [i * strip + 5, (i + 1) * strip - 5]) { A.beginPath(); A.moveTo(0, y); A.lineTo(W, y); A.stroke(); }
  A.setLineDash([]);
  return (C.bag = { map: tex(a, true, { aniso: 16 }), surf: tex(pack(S.bump, S.rough, S.metal), false, { aniso: 16 }) });
}

// ---------------------------------------------------------------- the cup (leatherboard) and its label

/** The leatherboard cup that closes the case's mouth with its paper label (TM 9-1985-3 p. 351): { map, surf }. */
export function cupAtlas() {
  if (C.cup != null) return C.cup;
  if (!canDraw()) return (C.cup = null);
  const { W, H, disk } = CUP_UV, R = rng(351);
  const a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, 225, 0);
  A.fillStyle = rgb(112, 96, 78); A.fillRect(0, 0, W, H);
  fbm(A, 0, 0, W, H, R, { cell: 30, oct: 5, alpha: 0.14, op: 'overlay' }); // pressed fibres
  fbm(S.b, 0, 0, W, H, R, { cell: 4, oct: 2, alpha: 0.5, op: 'source-over' });
  // the label: off-white paper, printed black, its edge a little lifted and grubby
  const lr = disk.R * 0.62;
  A.fillStyle = rgb(222, 214, 192); A.beginPath(); A.arc(disk.cx, disk.cy, lr, 0, Math.PI * 2); A.fill();
  fbm(A, disk.cx - lr, disk.cy - lr, lr * 2, lr * 2, R, { cell: 20, oct: 3, alpha: 0.12, op: 'overlay' });
  A.strokeStyle = rgb(30, 28, 24, 0.85); A.lineWidth = 2; A.beginPath(); A.arc(disk.cx, disk.cy, lr * 0.93, 0, Math.PI * 2); A.stroke();
  S.r.fillStyle = grey(200); S.r.beginPath(); S.r.arc(disk.cx, disk.cy, lr, 0, Math.PI * 2); S.r.fill();
  S.b.strokeStyle = grey(170); S.b.lineWidth = 2; S.b.beginPath(); S.b.arc(disk.cx, disk.cy, lr, 0, Math.PI * 2); S.b.stroke();
  const pr = { color: 'rgba(24,22,20,1)', weight: 'normal', R, alpha: 0.9 };
  const L = [['21 cm Mrs 18', 22, 'bold'], ['Hülsenkart. 6351', 14], ['Ladung 1 bis 6', 14], ['15,80 kg Digl.R.P.', 14], ['G1,5 (450-5/2)', 12], ['dbg 1943/2', 12], ['Ku 14.7.43 W.', 12]];
  let y = disk.cy - lr * 0.62;
  for (const [t, c, w] of L) { letter(A, t, disk.cx, y, c, 1, { ...pr, weight: w ?? 'normal' }); y += c * 1.75 + 4; }
  // the tab strip: the same cloth as the bags
  const [tx0, ty0, tx1, ty1] = CUP_UV.tab;
  A.fillStyle = rgb(214, 204, 180); A.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
  A.save(); A.globalCompositeOperation = 'multiply'; weave(A, S.b, tx0, ty0, tx1 - tx0, ty1 - ty0, 3, R, { dark: 0.1 }); A.restore();
  return (C.cup = { map: tex(a, true), surf: tex(pack(S.bump, S.rough, S.metal), false) });
}

// ---------------------------------------------------------------- the charge container

/**
 * The sheet-steel charge container (collector's note of a 450 mm container for the 21 cm Mrs 18, bocn.co.uk 95717; the
 * construction after an sFH 18 container: estimates): field grey-green paint, chipped to the steel at the rims and the
 * beads, the lid stencilled in white. { map, surf }.
 */
export function canAtlas() {
  if (C.can != null) return C.can;
  if (!canDraw()) return (C.can = null);
  const { W, H, sideH, lid } = CAN_UV, R = rng(450);
  const a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, 150, 0);
  // a brushed-on field grey-green, even in tone with faint brush marks round the can (estimate)
  A.fillStyle = rgb(84, 88, 72); A.fillRect(0, 0, W, H);
  fbm(A, 0, 0, W, H, R, { cell: 160, oct: 4, alpha: 0.08, op: 'overlay' });
  fbm(A, 0, 0, W, H, R, { cell: 40, oct: 3, alpha: 0.06, op: 'overlay', aspect: 6 });
  fbm(S.r, 0, 0, W, H, R, { cell: 40, oct: 3, alpha: 0.2 });
  // chips to bare steel and rust: thick along the top and bottom rims and the two beads (side rows at v 0, 0.13,
  // 0.87, 1), sparse elsewhere
  const chip = (x, y, s) => {
    A.fillStyle = rgb(70, 46, 30, 0.8); A.beginPath(); A.ellipse(x, y, s * 1.3, s * 0.9, R() * 3, 0, Math.PI * 2); A.fill();
    A.fillStyle = rgb(128, 128, 122, 0.9); A.beginPath(); A.ellipse(x, y, s * 0.8, s * 0.5, R() * 3, 0, Math.PI * 2); A.fill();
    S.m.fillStyle = grey(200); S.m.beginPath(); S.m.ellipse(x, y, s * 0.8, s * 0.5, 0, 0, Math.PI * 2); S.m.fill();
    S.r.fillStyle = grey(120); S.r.beginPath(); S.r.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); S.r.fill();
    S.b.fillStyle = grey(100); S.b.beginPath(); S.b.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); S.b.fill();
  };
  for (const v of [0.01, 0.13, 0.87, 0.99]) for (let i = 0; i < 45; i++) chip(R() * W, sideH * (v + (R() - 0.5) * 0.025), 1.2 + R() * 3.2);
  for (let i = 0; i < 24; i++) chip(R() * W, R() * sideH, 1 + R() * 2.5);
  // a rust run from the lower bead
  for (let i = 0; i < 6; i++) { const x = R() * W; const g = A.createLinearGradient(0, sideH * 0.87, 0, sideH); g.addColorStop(0, rgb(110, 60, 30, 0.35)); g.addColorStop(1, rgb(110, 60, 30, 0)); A.fillStyle = g; A.fillRect(x, sideH * 0.87, 3 + R() * 5, sideH * 0.13); }
  // white stencils on the side (u 0.25: the front)
  const k = sideH / 470; // px per mm along the side
  const w = { stencil: true, spray: 0.25, wear: 0.8, R, color: 'rgba(222,220,206,1)' };
  const sx = W / (2 * Math.PI * 135) / k; // round the 270 mm can
  letter(A, '21 cm Mrs. 18', 0.25 * W, 0.36 * sideH, 22 * k, sx * 0.85, w);
  letter(A, 'Hülsenkart.', 0.25 * W, 0.5 * sideH, 16 * k, sx * 0.85, w);
  letter(A, 'Ladung 1-6', 0.25 * W, 0.62 * sideH, 16 * k, sx * 0.85, w);
  // the lid's top: the gun and the contents in white (a collector's "paint markings on lid"; the words are estimates)
  A.save(); A.beginPath(); A.arc(lid.cx, lid.cy, lid.R, 0, Math.PI * 2); A.clip();
  A.fillStyle = rgb(84, 88, 72); A.fillRect(lid.cx - lid.R, lid.cy - lid.R, lid.R * 2, lid.R * 2);
  fbm(A, lid.cx - lid.R, lid.cy - lid.R, lid.R * 2, lid.R * 2, R, { cell: 60, oct: 4, alpha: 0.1, op: 'overlay' });
  for (let i = 0; i < 80; i++) { const t = R() * Math.PI * 2, rr = lid.R * (0.88 + R() * 0.12); chip(lid.cx + Math.cos(t) * rr, lid.cy + Math.sin(t) * rr, 1.5 + R() * 3); }
  A.restore();
  const kl = lid.R / 139; // px per mm on the lid
  letter(A, '21 cm Mrs 18', lid.cx, lid.cy - 52 * kl, 20 * kl, 0.9, w);
  letter(A, '6351', lid.cx, lid.cy - 18 * kl, 18 * kl, 0.9, w);
  letter(A, 'Kart. 6', lid.cx, lid.cy + 52 * kl, 20 * kl, 0.9, w);
  // the skirt and the inside: plain paint, the inside duller and a little dusty
  const [ix0, iy0, ix1, iy1] = CAN_UV.inner;
  A.fillStyle = rgb(74, 76, 66); A.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  fbm(A, ix0, iy0, ix1 - ix0, iy1 - iy0, R, { cell: 40, oct: 3, alpha: 0.05, op: 'overlay' });
  S.r.fillStyle = grey(190); S.r.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  return (C.can = { map: tex(a, true, { aniso: 16 }), surf: tex(pack(S.bump, S.rough, S.metal), false, { aniso: 16 }) });
}

// ---------------------------------------------------------------- tiling materials: wicker, tarpaulin, timber, rubber

/**
 * Willow wicker (one 15 cm tile, repeated in metres): upright stakes with the weavers going over and under them, each
 * rod its own buff to tan, peeled willow greying where it is weathered. { map, surf } (RepeatWrapping both ways).
 */
export function wickerAtlas() {
  if (C.wicker != null) return C.wicker;
  if (!canDraw()) return (C.wicker = null);
  const N = 512, R = rng(380), a = cv(N, N), A = ctx2(a), S = surfSet(N, N, 60, 200, 0);
  A.fillStyle = rgb(70, 56, 38); A.fillRect(0, 0, N, N); // the gaps
  // 8 stakes across the tile (about 19 mm apart at 0.15 m), 24 weavers down it (6 mm rods)
  const stakes = 8, rows = 24, sw = N / stakes, rh = N / rows;
  for (let j = 0; j < rows; j++) {
    const tone = 0.75 + R() * 0.3, y = j * rh;
    for (let i = 0; i < stakes; i++) {
      const over = (i + j) % 2 === 0, x = i * sw;
      // the weaver: a rod swelling where it passes over a stake (bright, high), thin where it goes under (dark, low)
      const g = A.createLinearGradient(0, y, 0, y + rh);
      const c = (k) => rgb(176 * tone * k, 140 * tone * k, 88 * tone * k);
      g.addColorStop(0, c(0.55)); g.addColorStop(0.45, c(over ? 1.08 : 0.85)); g.addColorStop(1, c(0.5));
      A.fillStyle = g; A.fillRect(x, y + 0.5, sw, rh - 1);
      const gb = S.b.createLinearGradient(0, y, 0, y + rh);
      gb.addColorStop(0, grey(70)); gb.addColorStop(0.45, grey(over ? 230 : 160)); gb.addColorStop(1, grey(70));
      S.b.fillStyle = gb; S.b.fillRect(x, y + 0.5, sw, rh - 1);
      if (!over) {
        // the stake shows where the weaver goes behind it
        const st = A.createLinearGradient(x + sw * 0.3, 0, x + sw * 0.7, 0);
        st.addColorStop(0, c(0.5)); st.addColorStop(0.5, c(1.0)); st.addColorStop(1, c(0.5));
        A.fillStyle = st; A.fillRect(x + sw * 0.3, y, sw * 0.4, rh);
        const sb = S.b.createLinearGradient(x + sw * 0.3, 0, x + sw * 0.7, 0);
        sb.addColorStop(0, grey(110)); sb.addColorStop(0.5, grey(250)); sb.addColorStop(1, grey(110));
        S.b.fillStyle = sb; S.b.fillRect(x + sw * 0.3, y, sw * 0.4, rh);
      }
    }
  }
  fbm(A, 0, 0, N, N, R, { cell: 64, oct: 4, alpha: 0.18, op: 'overlay' });
  // weathering: a few grey patches (each drawn wrapped, so the tile has no seam; the big variation is the material's
  // object-space noise, not the tile)
  A.fillStyle = rgb(130, 126, 116, 0.1); for (let i = 0; i < 10; i++) wrapEllipse(A, R() * N, R() * N, 20 + R() * 40, 10 + R() * 24, 0, N, N);
  return (C.wicker = { map: tex(a, true, { repeat: true }), surf: tex(pack(S.bump, S.rough, S.metal), false, { repeat: true }) });
}

/** The battery's tarpaulin: heavy olive canvas, weathered and mottled, a coarse weave (one 0.25 m tile). */
export function tarpAtlas() {
  if (C.tarp != null) return C.tarp;
  if (!canDraw()) return (C.tarp = null);
  const N = 512, R = rng(77), a = cv(N, N), A = ctx2(a), S = surfSet(N, N, 128, 235, 0);
  A.fillStyle = rgb(78, 80, 60); A.fillRect(0, 0, N, N);
  A.save(); A.globalCompositeOperation = 'multiply'; weave(A, S.b, 0, 0, N, N, 4, R, { dark: 0.12, bump: 80 }); A.restore();
  // only a fine mottle in the 0.25 m tile: big blotches repeated as a quilt; the fading and the damp patches come from
  // the material's object-space noise (ammo_mrs18.js grime, at a metre's scale)
  fbm(A, 0, 0, N, N, R, { cell: 32, oct: 3, alpha: 0.1, op: 'overlay' });
  return (C.tarp = { map: tex(a, true, { repeat: true }), surf: tex(pack(S.bump, S.rough, S.metal), false, { repeat: true }) });
}

/** Rough-sawn timber, weathered grey-brown, the grain along u (one 0.5 m by 0.25 m tile); the end grain at v 0.85 up. */
export function woodAtlas() {
  if (C.wood != null) return C.wood;
  if (!canDraw()) return (C.wood = null);
  const W = 1024, H = 512, R = rng(9), a = cv(W, H), A = ctx2(a), S = surfSet(W, H, 128, 225, 0);
  A.fillStyle = rgb(112, 96, 74); A.fillRect(0, 0, W, H);
  // grain: long wavy streaks
  for (let i = 0; i < 260; i++) {
    const y = R() * H, dark = R() < 0.6, amp = 2 + R() * 6, f = (2 * Math.PI * (1 + Math.floor(R() * 10))) / W, ph = R() * 6;
    A.strokeStyle = dark ? rgb(70, 58, 44, 0.25 + R() * 0.3) : rgb(150, 132, 104, 0.2 + R() * 0.2); A.lineWidth = 0.6 + R() * 2.2;
    S.b.strokeStyle = grey(dark ? 90 : 170, 0.5); S.b.lineWidth = A.lineWidth;
    for (const c of [A, S.b]) { c.beginPath(); for (let x = 0; x <= W; x += 16) { const yy = y + Math.sin(x * f + ph) * amp; if (x) c.lineTo(x, yy); else c.moveTo(x, yy); } c.stroke(); }
  }
  // knots
  for (let i = 0; i < 6; i++) {
    const x = R() * W, y = R() * H, r = 5 + R() * 12;
    for (let k = 4; k > 0; k--) { A.fillStyle = rgb(60 + k * 12, 46 + k * 10, 32 + k * 8, 0.6); wrapEllipse(A, x, y, r * k / 3, r * k / 5, 0, W, H); }
  }
  // weathering to grey on the faces, saw marks across
  fbm(A, 0, 0, W, H, R, { cell: 90, oct: 4, alpha: 0.35, op: 'overlay', aspect: 4 });
  A.fillStyle = rgb(150, 146, 136, 0.15); A.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 9 + R() * 6) { A.strokeStyle = rgb(80, 70, 55, 0.08); A.lineWidth = 2; for (const dx of [0, -W]) { A.beginPath(); A.moveTo(x + dx, 0); A.lineTo(x + dx + 30, H); A.stroke(); } }
  fbm(S.r, 0, 0, W, H, R, { cell: 40, oct: 3, alpha: 0.3 });
  return (C.wood = { map: tex(a, true, { repeat: true }), surf: tex(pack(S.bump, S.rough, S.metal), false, { repeat: true }) });
}

import * as THREE from 'three';
import { V, box, xTube, zTube, rod, zLathe, sideProfile, topProfile, mergeAll } from '../../kit.js';

// The German strategic weapons in flight (DESIGN.md "WW2 mode"), built like models/shells.js shells: along Z
// with the nose toward -Z, centred on the middle, one merged geometry per material, materials cached and
// shared. buildMissile(kind) -> { parts: [{ geometry, material }], length, radius }; buildShell('v1' | 'v2')
// delegates here. The launch sites (v1.js, v2.js) take the same pieces through v1Pieces() / a4Pieces() so
// the missile on the ramp or the Meillerwagen is the one that flies.
//   v1  Fieseler Fi 103 A-1: 8.32 m overall (the Argus As 014 pulse jet's tail pipe is the aft end),
//       5.37 m span, fuselage 0.85 m across; wings two panels slid onto the spar tube through the fuel tank.
//       Dark grey-green over light blue-grey, the jet painted the same (one atlas, v1Skin).
//   v2  A4: 14.0 m, 1.65 m body, 3.56 m across the fins; the 1944 operational splinter camouflage (one atlas, a4Skin).

export const MISSILE_KINDS = ['v1', 'v2'];

const matCache = new Map();
const mat = (key, color, rough, metal, extra = {}) => {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
};
export const MM = {
  v1paint: () => mat('v1paint', 0xffffff, 0.58, 0.2, { map: v1Skin() }), // the painted skin: an atlas (v1Skin, below)
  v1jet: () => mat('v1jet', 0x3e3933, 0.55, 0.7), // the pulse jet tube, heat-darkened steel
  v1grid: () => mat('v1grid', 0x8a7a5c, 0.45, 0.8), // the intake's shutter grid and the air log, bare metal
  a4paint: () => mat('a4paint', 0xffffff, 0.66, 0.06, { map: a4Skin() }), // the A4's painted skin: an atlas (a4Skin, below)
  a4grey: () => mat('a4grey', 0x6b7064, 0.6, 0.15), // the grey-green control vanes and the joint band
  white: () => mat('white', 0xd6d6c8, 0.7, 0.05), // stencils
  dark: () => mat('dark', 0x18191a, 0.5, 0.4), // nozzles, holes, the jet vanes
};

// ---------------------------------------------------------------- V-1

// Fieseler Fi 103 A-1 (refs/v1/README.md): 8.32 m overall to the end of the pulse jet's tail pipe, 5.37 m span,
// the fuselage 0.85 m across, 1.42 m high (Wikipedia, NASM). Stations scaled off the broadside photographs of the
// IWM Duxford example on its ramp (the 8.32 m as the scale): the wing root's leading edge 3.1 m behind the nose,
// chord about 1 m; the Argus As 014's intake lip 4.82 m, the jet 3.5 m long (3.5 to 3.66 m quoted), its axis
// 0.73 m over the fuselage's (1.44 m from the belly to the jet's top); the fin 6.7 to 7.45 m with the rudder; the
// tail cone closed at 7.3 m.
export const V1 = { L: 8.32, span: 5.37, R: 0.425, jetY: 0.73, wingS: 3.1, chord: 1.0, jetS: 4.82, jetL: 3.5, tailY: 0.02 };
const v1z = (s) => s - V1.L / 2; // s: metres from the nose

// The fuselage radius at s metres from the nose: the blunt nose fairing (the master compass and the air log's
// counter behind it), the warhead, the cylindrical fuel tank (the wing spar passes through it), the compressed
// air spheres' bay, then the tail cone with the autopilot and the servos. V1_SEAMS: the sections' lap joints,
// raised a few millimetres in the lathe so they catch the light (the photos show them as rings of rivets).
const V1R = [[0, 0.03], [0.04, 0.075], [0.12, 0.14], [0.25, 0.205], [0.45, 0.268], [0.7, 0.322], [1.0, 0.362], [1.27, 0.387], [1.7, 0.41], [2.1, 0.421], [2.42, 0.425], [5.08, 0.425], [5.4, 0.413], [5.9, 0.377], [6.4, 0.312], [6.8, 0.238], [7.05, 0.17], [7.2, 0.11], [7.28, 0.05], [7.3, 0.0]];
const V1_SEAMS = [0.42, 1.27, 2.42, 3.95, 5.08, 5.9];
// The As 014 along its own length from the intake lip: the lip rolled in round the recessed shutter grid, the
// intake and combustion chamber at 0.56 m, a band, the cone, the long tail pipe (0.41 m) and its open end.
const V1J = [[0.1, 0.236], [0.03, 0.24], [0.006, 0.25], [0.0, 0.263], [0.012, 0.277], [0.04, 0.282], [0.58, 0.282], [0.6, 0.287], [0.64, 0.287], [0.66, 0.282], [1.15, 0.28], [1.17, 0.284], [1.19, 0.278], [1.95, 0.208], [1.97, 0.212], [1.99, 0.205], [2.58, 0.205], [2.6, 0.211], [2.66, 0.211], [2.68, 0.205], [3.46, 0.205], [3.5, 0.211], [3.5, 0.19], [3.3, 0.19]];

// ---- the skin: one canvas atlas carries the paint of the whole missile. The fuselage unrolled in u 0..0.5
// (round from the bottom: the right side at 0.125, the top 0.25) and v 1..0.25 (nose to tail, SKIN_FUS m), the
// jet the same in u 0.5..1 over its length, the flat surfaces (wings, tailplane) in v 0..0.25, their upper
// sides in u 0..0.5 and lower sides in u 0.5..1 (u along the span, SKIN_SPAN m; v along the chord).
// The 1944 finish (NASM: "operational V-1s usually wore camouflage of greens and light blue"; the Duxford
// example): a dark grey-green over the upper surfaces with a soft, wavy sprayed edge down the sides,
// light blue-grey beneath, the white handling stencils of the photos, soot at the tail pipe's mouth.
const SKIN_FUS = 7.4, SKIN_SPAN = 2.4;
const V1_UP = '#596150', V1_LO = '#a3b0ae';

function v1Rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let v1SkinTex = null;
function v1Skin() {
  if (v1SkinTex) return v1SkinTex;
  const S = 1024, H = 768, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d'), rnd = v1Rng(103);
  // fuselage: x = phi / 2pi * 512 (0 at the bottom), y = s * py; the jet: x + 512, y = s' * jy
  const py = H / SKIN_FUS, jy = H / V1.jetL;
  // the camouflage edge: phi of the upper colour's lower edge on the right (r) and left (l) sides at station s
  const edgeR = (s) => Math.PI / 2 + 0.22 * Math.sin(s * 2.3 + 0.7) + 0.1 * Math.sin(s * 5.9 + 1.3) - 0.05;
  const edgeL = (s) => Math.PI * 1.5 - 0.22 * Math.sin(s * 2.1 + 2.4) - 0.1 * Math.sin(s * 6.3) + 0.05;
  const twoTone = (x0, w, len, sy, k) => {
    c.save();
    c.beginPath();
    c.rect(x0, 0, w, H);
    c.clip();
    c.fillStyle = V1_LO;
    c.fillRect(x0, 0, w, H);
    c.filter = 'blur(4px)';
    c.fillStyle = V1_UP;
    c.beginPath();
    for (let s = -0.1; s <= len + 0.1; s += 0.05) c.lineTo(x0 + edgeR(s * k) / (Math.PI * 2) * w, s * sy);
    for (let s = len + 0.1; s >= -0.1; s -= 0.05) c.lineTo(x0 + edgeL(s * k) / (Math.PI * 2) * w, s * sy);
    c.closePath();
    c.fill();
    c.filter = 'none';
    c.restore();
  };
  twoTone(0, 512, SKIN_FUS, py, 1);
  twoTone(512, 512, V1.jetL, jy, 1.6);
  // flat surfaces: upper and lower
  c.fillStyle = V1_UP;
  c.fillRect(0, H, 512, S - H);
  c.fillStyle = V1_LO;
  c.fillRect(512, H, 512, S - H);
  // mottle: soft blotches of a darker and a lighter green on the upper colour, faint ones underneath
  c.filter = 'blur(6px)';
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 22;
    const up = x < 512 ? (y > H || (Math.abs(x - 256) < 120)) : (y > H ? false : Math.abs(x - 768) < 110);
    c.fillStyle = up ? (rnd() < 0.6 ? 'rgba(66, 75, 56, 0.2)' : 'rgba(112, 120, 96, 0.14)') : 'rgba(120, 130, 125, 0.1)';
    c.beginPath();
    c.ellipse(x, y, r * (1 + rnd()), r, rnd() * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = 'none';
  // lap joints round the fuselage and the jet with their rivets
  const ring = (x0, w, y, n) => {
    c.fillStyle = 'rgba(25, 27, 22, 0.55)';
    c.fillRect(x0, y - 1, w, 2);
    c.fillStyle = 'rgba(255, 255, 240, 0.12)';
    c.fillRect(x0, y + 1, w, 1);
    for (const dy of [-4, 4]) for (let i = 0; i < n; i++) dot(x0 + (i + 0.5) * w / n, y + dy, 1.3);
  };
  const dot = (x, y, r) => {
    c.fillStyle = 'rgba(30, 32, 26, 0.5)';
    c.beginPath();
    c.arc(x, y + 0.5, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 240, 0.18)';
    c.beginPath();
    c.arc(x - 0.4, y - 0.4, r * 0.6, 0, Math.PI * 2);
    c.fill();
  };
  for (const s of V1_SEAMS) ring(0, 512, s * py, 44);
  for (const s of [0.6, 1.17, 1.97]) ring(512, 512, s * jy, 30);
  // the jet's welded seam along its top, and the panel rows along the tank (the wing spar's doubler plates)
  c.fillStyle = 'rgba(35, 35, 30, 0.45)';
  c.fillRect(767, 0, 2, H);
  for (const x of [128, 384]) for (let s = 3.05; s < 3.85; s += 0.07) dot(x + (x < 256 ? -22 : 22), s * py, 1.2);
  // hatches: the compass access in the nose, the autopilot and servo hatches on the tail cone, the fuel filler
  c.strokeStyle = 'rgba(28, 30, 24, 0.6)';
  c.lineWidth = 1.5;
  const hatch = (phi, s0, s1, wPhi) => {
    const x = phi / (Math.PI * 2) * 512, w = wPhi / (Math.PI * 2) * 512;
    c.beginPath();
    c.roundRect ? c.roundRect(x - w / 2, s0 * py, w, (s1 - s0) * py, 4) : c.rect(x - w / 2, s0 * py, w, (s1 - s0) * py);
    c.stroke();
  };
  hatch(Math.PI * 0.75, 0.62, 1.0, 0.5);
  hatch(Math.PI * 1.25, 0.62, 1.0, 0.5);
  hatch(Math.PI * 0.62, 5.3, 5.8, 0.55);
  hatch(Math.PI * 1.38, 5.3, 5.8, 0.55);
  hatch(Math.PI, 6.15, 6.5, 0.6);
  c.beginPath();
  c.arc(256, 2.65 * py, 6, 0, Math.PI * 2);
  c.stroke();
  // the white handling stencils (as on the photographed examples), lettered along the fuselage
  const stencil = (phi, s, lines, size = 9) => {
    c.save();
    // the unrolled skin is a mirror image of the surface: letter the right side to read toward the nose, the
    // left side and the top toward the tail, upright as seen from beside the missile
    if (phi < Math.PI * 0.98) c.transform(0, -1, -1, 0, phi / (Math.PI * 2) * 512, s * py);
    else c.transform(0, 1, 1, 0, phi / (Math.PI * 2) * 512, s * py);
    c.fillStyle = 'rgba(232, 232, 220, 0.85)';
    c.font = `bold ${size}px sans-serif`;
    lines.forEach((t, i) => c.fillText(t, 0, (i - (lines.length - 1) / 2) * (size + 2)));
    c.restore();
  };
  stencil(Math.PI, 0.55, ['Nicht auftreten']);
  stencil(Math.PI * 0.62, 1.05, ['Abstellpallung N', 'Herkules'], 8);
  stencil(Math.PI * 1.38, 1.05, ['Abstellpallung N', 'Herkules'], 8);
  stencil(Math.PI * 0.45, 1.75, ['Hier aufbocken', 'Auf Abstellbock'], 8);
  stencil(Math.PI * 1.55, 1.75, ['Hier aufbocken', 'Auf Abstellbock'], 8);
  stencil(Math.PI * 0.72, 2.55, ['Kfz Verladung', 'Pallungsabstand b2', 'Herkules N'], 7);
  stencil(Math.PI * 0.7, 4.6, ['Klebestreifen auf', 'Unterseite vor', 'Abstellbock entfernen'], 7);
  stencil(Math.PI * 0.4, 5.25, ['TW 76 A', 'Doppelpallung'], 7);
  // dirt: streaks back from the seams and grime along the belly where hands and slings went
  for (let i = 0; i < 120; i++) {
    const x = rnd() * 512, y = rnd() * H, l = 10 + rnd() * 40;
    c.fillStyle = `rgba(40, 38, 30, ${0.04 + rnd() * 0.06})`;
    c.fillRect(x, y, 1 + rnd() * 2, l);
  }
  // the tail pipe's last metre: soot and heat tint at the mouth (the engine ran for some seconds on the ramp
  // before the catapult fired; in flight the render layer adds the flame)
  {
    const y0 = 2.5 * jy, g = c.createLinearGradient(0, y0, 0, H);
    g.addColorStop(0, 'rgba(48, 46, 42, 0)');
    g.addColorStop(0.45, 'rgba(56, 52, 46, 0.55)');
    g.addColorStop(0.8, 'rgba(40, 38, 36, 0.9)');
    g.addColorStop(1, 'rgba(22, 20, 18, 1)');
    c.fillStyle = g;
    c.fillRect(512, y0, 512, H - y0);
    c.filter = 'blur(3px)';
    for (let i = 0; i < 50; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(70, 72, 96, 0.22)' : 'rgba(110, 88, 60, 0.2)';
      c.beginPath();
      c.ellipse(512 + rnd() * 512, (2.9 + rnd() * 0.6) * jy, 6 + rnd() * 16, 3 + rnd() * 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.filter = 'none';
  }
  // wings and tailplane: the spar line, rib rows and the trailing edge's lap, upper and lower
  for (const x0 of [0, 512]) {
    c.fillStyle = 'rgba(25, 27, 22, 0.35)';
    c.fillRect(x0, H + 0.36 * 256, 512, 2);
    c.fillRect(x0, H + 0.82 * 256, 512, 1);
    for (let a = 0.12; a < 1; a += 0.13) for (let b = 0.06; b < 0.95; b += 0.07) dot(x0 + a * 512, H + b * 256, 0.9);
    for (let a = 0.02; a < 1; a += 0.02) dot(x0 + a * 512, H + 0.36 * 256 + 5, 0.9);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return (v1SkinTex = t);
}

// Atlas uv for a lathe about the missile's z axis (kit zLathe: uv.x runs round from the bottom): u0 the region's
// left edge, the station s - s0 metres over `len` down the region.
function v1LatheUV(g, u0, s0, len) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, 1 - 0.75 * Math.min(1, Math.max(0, (p.getZ(i) + V1.L / 2 - s0) / len)));
  return g;
}
// Atlas uv for an upright surface (pylon, fin, rudder) beside the fuselage: the side band of the fuselage's
// region (u 0.125 at y0, the top at y1) at its station, so the camouflage's edge runs across it as on the real one.
function v1BandUV(g, y0, y1) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const h = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))) * 0.125;
    uv[i * 2] = n.getX(i) >= 0 ? 0.125 + h : 0.375 - h;
    uv[i * 2 + 1] = 1 - 0.75 * Math.min(1, (p.getZ(i) + V1.L / 2) / SKIN_FUS);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// The same for a part that is all lower or all upper colour (u at the bottom or the top of the fuselage).
function v1FlatUV(g, top) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = top ? 0.25 : 0.01;
    uv[i * 2 + 1] = 1 - 0.75 * Math.min(1, Math.max(0, (p.getZ(i) + V1.L / 2) / SKIN_FUS));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// The fuselage profile with the lap joints raised (2 cm wide, 4 mm proud).
function v1Seamed(prof, seams) {
  const out = prof.filter(([s]) => !seams.some((q) => Math.abs(s - q) < 0.02));
  for (const q of seams) {
    const r = rAt(prof, q);
    out.push([q - 0.012, rAt(prof, q - 0.012)], [q - 0.005, r + 0.004], [q + 0.005, r + 0.004], [q + 0.012, rAt(prof, q + 0.012)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// A thin aerofoil panel (wing, tailplane, fin): span along +x from x0 to x1 (mirrored for side -1), chord from z
// le to te (le < te), thickness t of the chord (NACA 00xx section), the outer end rounded off over `tip` m. The
// upper and lower skins are separate smooth grids (they take the atlas' upper and lower flat areas: u along the
// span from `a0` m, v along the chord); `same` puts both in the upper area. Returns a non-indexed geometry.
function v1Panel({ x0, x1, le, te, t = 0.11, tip = 0.15, side = 1, y = 0, a0 = 0, same = false }) {
  const AF = [0, 0.012, 0.04, 0.1, 0.2, 0.32, 0.45, 0.6, 0.75, 0.88, 1];
  const half = (x) => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const span = x1 - x0, xs = [x0, x0 + (span - tip) * 0.5, x1 - tip];
  if (tip > 0) for (const u of [0.45, 0.75, 0.92, 1]) xs.push(x1 - tip + tip * u);
  const mid = le + (te - le) * 0.42, out = [];
  for (const sg of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (const x of xs) {
      const u = tip > 0 ? Math.max(0, (x - (x1 - tip)) / tip) : 0, k = Math.cbrt(1 - u * u * u);
      for (const f of AF) {
        const z = mid + (le + (te - le) * f - mid) * k;
        pos.push(side * x, y + sg * half(f) * t * (te - le) * k, z);
        uv.push((sg > 0 || same ? 0 : 0.5) + 0.5 * Math.min(1, (x - x0 + a0) / SKIN_SPAN), 0.25 * (1 - f));
      }
    }
    const n = AF.length, flip = (sg > 0) !== (side < 0);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = (i + 1) * n + j, c2 = i * n + j + 1, d = (i + 1) * n + j + 1;
      if (flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    out.push(g);
  }
  return mergeAll(out);
}

// One wing panel in its own frame: origin at the root on the spar axis (fuselage side), span along +x (side +1)
// or -x, leading edge toward -Z, the spar at 35 % of the chord. Constant chord, the tip rounded at its corners
// (the photos), a 12 % section; the root rib closes the end that slides over the spar stub.
function v1WingPanel(side) {
  const c = V1.chord, sp = V1.span / 2 - V1.R + 0.04, le = -c * 0.35, te = c * 0.65;
  const g = [v1Panel({ x0: 0, x1: sp, le, te, t: 0.12, tip: 0.2, side, a0: 0.1 })];
  // the root rib: a flat plate over the section, and the sleeve that takes the spar tube
  g.push(v1FlatUV(topProfile([[0, le + 0.02], [0, te - 0.02], [0.01, te - 0.02], [0.01, le + 0.02]].map(([x, z]) => [side * x, z]), -0.045, 0.045), true));
  g.push(v1FlatUV(xTube(0, side * 0.05, 0.05, 0.05, 10, 0, 0), true));
  return mergeAll(g);
}

// The V-1's parts by material, without the wings: { v1paint, v1grid, dark } geometry lists in the missile frame
// (nose toward -Z, centred on the middle of its 8.32 m). v1paint takes the skin atlas. wing(side) gives a wing
// panel in its own frame and wingAt(side) the place of its root on the fuselage.
export function v1Pieces() {
  const paint = [], grid = [], dark = [];
  const J = V1.jetY, s0 = V1.jetS;
  // the fuselage: one lathe with its lap joints
  paint.push(v1LatheUV(zLathe(v1Seamed(V1R, V1_SEAMS).map(([s, r]) => [v1z(s), r]), 40), 0, 0, SKIN_FUS));
  // the air log: a small two-bladed propeller on a spindle at the nose (every 30 turns counted down one unit of
  // the range set before launch; at zero the elevators were locked down and the bomb dived)
  grid.push(zTube(v1z(-0.1), v1z(0.03), 0.012, 0.02, 8));
  grid.push(zLathe([[v1z(-0.135), 0.0], [v1z(-0.128), 0.014], [v1z(-0.11), 0.022], [v1z(-0.09), 0.022], [v1z(-0.085), 0.014]], 10));
  for (const a of [0.5, 0.5 + Math.PI]) grid.push(box(0.15, 0.007, 0.042).rotateX(0.6).translate(0.095, 0, 0).rotateZ(a).translate(0, 0, v1z(-0.1)));
  // the wing spar's stubs through the fuel tank (the panels slide over them; seen when the wings are off)
  for (const s of [-1, 1]) grid.push(xTube(s * (V1.R - 0.05), s * (V1.R + 0.32), 0.038, 0.038, 10, 0, v1z(V1.wingS + V1.chord * 0.35)));
  // the launch lug under the belly that the catapult's piston engaged, the fuel filler and the hoisting points
  dark.push(sideProfile([[v1z(3.28), -0.4], [v1z(3.36), -0.5], [v1z(3.72), -0.5], [v1z(3.76), -0.4]], 0.07));
  dark.push(box(0.16, 0.025, 0.12, 0, -0.505, v1z(3.54)));
  dark.push(rod(V(0, 0.41, v1z(2.65)), V(0, 0.432, v1z(2.65)), 0.035, 10));
  for (const s of [1.9, 5.2]) dark.push(rod(V(0, 0.41, v1z(s)), V(0, 0.45, v1z(s)), 0.022, 8));
  // the pulse jet: lathe with the intake's lip and bands, the recessed shutter grid (flap valves behind a grid of
  // slats, the fuel nozzles' hub in its middle), the open end of the tail pipe
  paint.push(v1LatheUV(zLathe(V1J.map(([s, r]) => [v1z(s0 + s), r]), 32), 0.5, s0, V1.jetL).translate(0, J, 0));
  dark.push(zTube(v1z(s0 + 0.1), v1z(s0 + 0.11), 0.236, 0.236, 24, 0, J));
  for (let i = -3; i <= 3; i++) grid.push(box(0.46 * Math.sqrt(1 - (i / 3.8) ** 2), 0.014, 0.02, 0, J + i * 0.062, v1z(s0 + 0.095)));
  grid.push(box(0.014, 0.46, 0.02, 0, J, v1z(s0 + 0.094)));
  grid.push(zTube(v1z(s0 + 0.06), v1z(s0 + 0.1), 0.045, 0.06, 12, 0, J));
  dark.push(zTube(v1z(s0 + 3.3), v1z(s0 + 3.31), 0.19, 0.19, 20, 0, J));
  // the starting air connections and the spark plug's boss on the front of the jet
  for (const a of [-0.9, 0, 0.9]) grid.push(rod(V(Math.sin(a) * 0.29, J + Math.cos(a) * 0.29, v1z(s0 + 0.25)), V(Math.sin(a) * 0.31, J + Math.cos(a) * 0.31, v1z(s0 + 0.32)), 0.014, 6));
  grid.push(rod(V(0, J + 0.27, v1z(s0 + 0.85)), V(0, J + 0.32, v1z(s0 + 0.85)), 0.022, 8));
  // the front pylon: a narrow streamlined fairing from the tank's top up under the jet's intake section
  paint.push(v1BandUV(sideProfile([[v1z(s0 + 0.36), 0.38], [v1z(s0 + 0.18), J - 0.2], [v1z(s0 + 0.95), J - 0.2], [v1z(s0 + 1.02), 0.4]], 0.1, 0.02), 0.3, J));
  // the fin, which carries the tail pipe on its top, and the rudder behind it (a gap at the hinge)
  const up = (g) => g.rotateZ(Math.PI / 2);
  paint.push(v1BandUV(up(v1Panel({ x0: 0.04, x1: J - 0.17, le: v1z(6.7), te: v1z(7.2), t: 0.09, tip: 0, same: true })), 0.1, J - 0.2));
  paint.push(v1BandUV(up(v1Panel({ x0: 0.0, x1: J - 0.21, le: v1z(7.215), te: v1z(7.46), t: 0.1, tip: 0, same: true })), 0.1, J - 0.2));
  // the tailplane across the tail cone below the pipe, its elevators behind (rounded tips)
  for (const sd of [-1, 1]) {
    paint.push(v1Panel({ x0: 0, x1: 1.0, le: v1z(6.6), te: v1z(7.0), t: 0.09, tip: 0.1, side: sd, y: V1.tailY }));
    paint.push(v1Panel({ x0: 0.05, x1: 0.98, le: v1z(7.015), te: v1z(7.24), t: 0.1, tip: 0.08, side: sd, y: V1.tailY }));
  }
  const wingAt = (side) => V(side * (V1.R - 0.04), 0, v1z(V1.wingS + V1.chord * 0.35));
  return { lists: { v1paint: paint, v1grid: grid, dark }, wing: v1WingPanel, wingAt };
}

function rAt(tab, s) {
  for (let i = 0; i < tab.length - 1; i++) if (s >= tab[i][0] && s <= tab[i + 1][0]) return tab[i][1] + (tab[i + 1][1] - tab[i][1]) * (s - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
  return tab[tab.length - 1][1];
}

// ---------------------------------------------------------------- A4 (V-2)

// Aggregat 4 (refs/v2/README.md): 14.0 m long, 1.65 m across the body, 3.56 m across the fins (Wikipedia, NASM).
// Stations s (metres from the nose) scaled off the broadside photograph of the Peenemünde replica on its table and
// the Eberhard Marx cutaway: the warhead with the impact fuze in its tip to the first joint at 2.0 m, the instrument
// compartment (four access doors) to 3.4 m, the tank section (alcohol forward, liquid oxygen aft) to 9.6 m, then
// the tail round the motor, tapering to about 0.92 m across the base. The fins: the root from 10.1 m, a straight
// swept leading edge out to the tip at 11.45 m, the tip edge parallel to the axis down to the base; the air vane in
// each tip's trailing corner with its actuator fairing, an antenna rod, the four graphite jet vanes in the nozzle.
// lox: the oxygen tank's zone in metres above the base; plug: the umbilical plug's fairing (station, roll from fin I)
export const A4 = { L: 14.0, R: 0.825, fin: 1.78, lox: [4.3, 7.5], joints: [2.0, 3.4, 9.6], plug: { s: 13.15, da: Math.PI * 1.25 } };
const a4z = (s) => s - A4.L / 2;
const A4R = [[0.28, 0.092], [0.6, 0.175], [1.0, 0.268], [1.5, 0.37], [2.0, 0.46], [2.5, 0.54], [3.0, 0.61], [3.4, 0.66], [4.0, 0.725], [4.6, 0.775], [5.2, 0.805], [5.8, 0.82], [6.4, 0.825], [9.7, 0.825], [10.2, 0.815], [10.8, 0.78], [11.4, 0.73], [12.0, 0.67], [12.6, 0.605], [13.2, 0.54], [13.7, 0.49], [14.0, 0.46]];
export const a4Radius = (s) => rAt(A4R, s);
// The fin outline [u (out from the axis), s]: root along the tail (sunk 2 cm into it), the swept leading edge, the
// tip edge, the cut-out the air vane turns in (its rounded edges a centimetre clear of the vane), the bottom edge
// at the base, and the chamfered heel by the nozzle (the replica's red triangles)
const A4FIN = [[0.795, 10.1], [1.25, 10.66], [1.72, 11.37], [1.765, 11.43], [1.78, 11.5], [1.78, 13.535], [1.47, 13.535], [1.47, 14.0], [0.8, 14.0],
  ...[13.62, 13.2, 12.6, 12.0, 11.4, 10.8, 10.35].map((s) => [rAt(A4R, s) - 0.02, s])];
const A4_FIN_T = 0.08, A4_FIN_BEVEL = 0.022;
// The control vanes: the air vane (Luftruder) in each fin's tip turns about a radial hinge line at its leading edge,
// the graphite jet vane (Strahlruder) in the exhaust about its radial shaft; s the hinge's station, max the throw.
// One servo in each fin worked both, the air vane through a linkage at two thirds of the jet vane's angle (airK).
export const A4_VANES = { air: { s: 13.6, max: (10 * Math.PI) / 180 }, jet: { s: 13.98, max: (15 * Math.PI) / 180 }, airK: 2 / 3 };

// ---- the skin: one canvas atlas. The body unrolled in u 0..0.5 (kit zLathe: round from the bottom, the right
// side at 0.125) and v 1..0 (nose to base); the fins' faces in eight slots of u 0.505..1 (column: 0.125 wide,
// row: 0.25 high; slot = fin * 2 + face, face 1 the +tan side), u out along the fin, v down to the base.
// The 1944 to 1945 operational finish (the rockets captured at Wirsberg and in the British photographs of April
// 1945, the Dayton example's restoration): a dark olive green splinter pattern in zig-zag bands wound round a sand
// ground, softly sprayed edges; the serial number in white, the fin numbers I to IV near the base.
const A4_FIN_U0 = 0.4, A4_FIN_U1 = 1.9, A4_FIN_S0 = 9.95, A4_FIN_S1 = 14.15;
const a4Slot = (fin, face) => ({ x: 516 + ((fin * 2 + face) % 4) * 127, y: Math.floor((fin * 2 + face) / 4) * 256 });
const a4RollU = (a) => ((((a + Math.PI / 2) / (Math.PI * 2)) % 1) + 1) % 1; // a roll angle's lathe u
const A4_ROLL = Math.PI / 4; // fin I's roll as the trailer, the table and the flight carry it (the atlas assumes it)

// The camouflage at (around, along) metres: 0 sand .. 1 green. The colours change across a run of zig-zag rings
// down the body at uneven spacing, each with one to three straight-edged teeth round the circumference and its
// own phase, so the bands slant, narrow and widen and sometimes pinch off into splinters (the Dayton rocket's
// pattern; the Wirsberg photograph); the edges softly sprayed.
const A4_BANDS = [[0.75, 0.4, 0.1, 2], [1.75, 0.55, 0.6, 1], [2.9, 0.6, 0.3, 2], [3.75, 0.45, 0.85, 3], [5.1, 0.8, 0.45, 1], [6.1, 0.5, 0.05, 2], [7.2, 0.65, 0.7, 2], [8.3, 0.75, 0.25, 1], [9.25, 0.6, 0.95, 3], [10.5, 0.7, 0.5, 2], [11.5, 0.55, 0.1, 1], [12.6, 0.6, 0.65, 2], [13.5, 0.5, 0.3, 2]];
function a4Camo(a, t) {
  const w = a / (Math.PI * 2 * A4.R), tri = (x) => 2 * Math.abs(x - Math.floor(x + 0.5)) - 0.5;
  let n = 0, near = 1;
  for (const [t0, amp, ph, teeth] of A4_BANDS) {
    const b = t0 + amp * tri(w * teeth + ph) + 0.03 * Math.sin(Math.PI * 2 * (w * 5 + ph) + t * 1.7);
    if (t > b) n++;
    near = Math.min(near, Math.abs(t - b));
  }
  const k = Math.min(1, near / 0.025) * 0.5;
  return n % 2 ? 0.5 - k : 0.5 + k;
}

let a4SkinTex = null;
function a4Skin() {
  if (a4SkinTex) return a4SkinTex;
  const S = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d'), rnd = a4Rng(4);
  const C = Math.PI * 2 * A4.R, sy = S / A4.L;
  const sand = [156, 145, 106], green = [66, 78, 54];
  const img = c.createImageData(S, S), d = img.data;
  const put = (i, k, n) => {
    for (let ch = 0; ch < 3; ch++) d[i + ch] = (sand[ch] + (green[ch] - sand[ch]) * k) * n;
    d[i + 3] = 255;
  };
  // fine grain of the sprayed paint: a cheap hash, a few per cent either way
  const grain = (x, y) => 0.97 + 0.06 * (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < 516; x++) {
    const u = (x % 512) / 512, t = (y + 0.5) / sy;
    put((y * S + x) * 4, a4Camo(u * C, t), grain(x, y));
  }
  for (let fin = 0; fin < 4; fin++) for (let face = 0; face < 2; face++) {
    const { x: x0, y: y0 } = a4Slot(fin, face), uRoot = a4RollU(A4_ROLL + fin * Math.PI / 2);
    for (let y = y0; y < y0 + 256; y++) for (let x = x0; x < Math.min(S, x0 + 127); x++) {
      const uf = A4_FIN_U0 + (x - x0 + 0.5) / 127 * (A4_FIN_U1 - A4_FIN_U0), s = A4_FIN_S0 + (y - y0 + 0.5) / 256 * (A4_FIN_S1 - A4_FIN_S0);
      put((y * S + x) * 4, a4Camo(uRoot * C + (uf - rAt(A4R, s)) * (face ? 0.9 : -0.9), s), grain(x, y));
    }
  }
  c.putImageData(img, 0, 0);
  // weathering: faint streaks down the length, a few scuffs
  for (let i = 0; i < 160; i++) {
    c.fillStyle = `rgba(${rnd() < 0.5 ? '40, 40, 30' : '210, 205, 180'}, ${0.03 + rnd() * 0.05})`;
    c.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 8 + rnd() * 40);
  }
  const dot = (x, y, r) => {
    c.fillStyle = 'rgba(30, 32, 26, 0.45)';
    c.beginPath(); c.arc(x, y + 0.5, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255, 255, 240, 0.15)';
    c.beginPath(); c.arc(x - 0.4, y - 0.4, r * 0.6, 0, Math.PI * 2); c.fill();
  };
  // the section joints with their rivet rows, the tank section's longitudinal seams, the skin's frames
  for (const s of A4.joints) {
    c.fillStyle = 'rgba(22, 24, 20, 0.6)';
    c.fillRect(0, s * sy - 1.5, 516, 3);
    for (const dy of [-5, 5]) for (let i = 0; i < 64; i++) dot((i + 0.5) * 8, s * sy + dy, 1.1);
  }
  c.fillStyle = 'rgba(22, 24, 20, 0.28)';
  for (const u of [0.0625, 0.3125]) c.fillRect(u * 512 - 0.5, 3.4 * sy, 1.5, 6.2 * sy);
  for (let s = 4.2; s < 9.6; s += 0.8) c.fillRect(0, s * sy, 512, 1);
  for (let s = 10.3; s < 13.9; s += 0.7) c.fillRect(0, s * sy, 512, 1);
  // the instrument compartment's four access doors (between the fins' planes), the tail's access panels, the
  // alcohol filler at the top of the fuel tank, the oxygen filler and vent lower down
  c.strokeStyle = 'rgba(22, 24, 20, 0.7)';
  c.lineWidth = 1.5;
  c.save();
  c.beginPath(); c.rect(0, 0, 512, S); c.clip();
  for (let k = 0; k < 5; k++) {
    const x = (k / 4) * 512; // between the fins' planes (the lathe's seam runs through one: drawn on both edges)
    c.strokeRect(x - 30, 2.15 * sy, 60, 1.05 * sy);
    dot(x + 24, 2.68 * sy, 1.6);
  }
  c.restore();
  for (const [u, s, w, h] of [[0.25, 10.6, 26, 22], [0.25, 11.7, 20, 16], [0.75, 11.0, 24, 20], [0.5, 12.6, 18, 14], [0.0, 12.6, 18, 14]]) c.strokeRect(u * 512 - w / 2, s * sy, w, h);
  for (const [u, s] of [[0.5, 3.75], [0.5, 6.75], [0.53, 9.35]]) {
    c.beginPath(); c.arc(u * 512, s * sy, 6, 0, Math.PI * 2); c.stroke();
  }
  // the white markings: the round's serial number, the propellant names at the fillers, lettered upright as seen
  // with the rocket lying on its trailer and reading toward the nose (the unrolled skin is seen mirrored, so the
  // right side's letters are turned one way and the left side's the other)
  const text = (u, s, str, size, right = true) => {
    c.save();
    if (right) c.transform(0, -1, -1, 0, u * 512, s * sy); else c.transform(0, 1, 1, 0, u * 512, s * sy);
    c.fillStyle = 'rgba(232, 230, 214, 0.88)';
    c.font = `bold ${size}px sans-serif`;
    c.textAlign = 'center';
    c.fillText(str, 0, 0);
    c.restore();
  };
  for (const [u, right] of [[0.25, true], [0.75, false]]) {
    // the serial in large digits stacked round the body (upright with the rocket lying), as on the Dayton rocket
    c.fillStyle = 'rgba(52, 62, 42, 0.95)';
    c.fillRect(u * 512 - 60, 6.12 * sy, 120, 0.4 * sy);
    [...'20918'].forEach((ch, i) => text(u + (right ? -1 : 1) * (i - 2) * 0.045 + (right ? 0.018 : -0.018), 6.42, ch, 22, right));
    text(u, 4.7, 'FH 04/20918', 10, right);
  }
  text(0.46, 3.75, 'B-Stoff', 10, true);
  text(0.46, 6.75, 'A-Stoff', 10, true);
  // the fin numbers near the foot of each fin, on both faces (face 1 is seen mirrored in the atlas)
  for (let fin = 0; fin < 4; fin++) for (let face = 0; face < 2; face++) {
    const { x: x0, y: y0 } = a4Slot(fin, face), x = x0 + (1.55 - A4_FIN_U0) / (A4_FIN_U1 - A4_FIN_U0) * 127, y = y0 + (13.45 - A4_FIN_S0) / (A4_FIN_S1 - A4_FIN_S0) * 256;
    c.save();
    c.translate(x, y);
    if (face) c.scale(-1, 1);
    c.fillStyle = 'rgba(232, 230, 214, 0.9)';
    c.font = 'bold 15px serif';
    c.textAlign = 'center';
    c.fillText(['I', 'II', 'III', 'IV'][fin], 0, 0);
    c.restore();
  }
  // soot from the nozzle round the base
  c.filter = 'blur(5px)';
  c.fillStyle = 'rgba(30, 28, 24, 0.35)';
  c.fillRect(0, 13.75 * sy, 516, S - 13.75 * sy);
  c.filter = 'none';
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (a4SkinTex = t);
}
function a4Rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// atlas uv of the body's lathe (u round from zLathe, v from the station)
function a4BodyUV(g) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * 0.5, 1 - (p.getZ(i) + A4.L / 2) / A4.L);
  return g;
}
// one atlas point for a small painted part (a fairing): the body at station s and roll angle a
function a4ConstUV(g, a, s) {
  g = g.index ? g.toNonIndexed() : g;
  const uv = new Float32Array(g.attributes.position.count * 2);
  for (let i = 0; i < uv.length; i += 2) { uv[i] = a4RollU(a) * 0.5; uv[i + 1] = 1 - s / A4.L; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// the body's profile with the section joints raised 6 mm over 5 cm (they catch the light)
function a4Seamed() {
  const out = A4R.filter(([s]) => !A4.joints.some((q) => Math.abs(s - q) < 0.03));
  for (const q of A4.joints) {
    const r = rAt(A4R, q);
    out.push([q - 0.025, rAt(A4R, q - 0.025)], [q - 0.012, r + 0.006], [q + 0.012, r + 0.006], [q + 0.025, rAt(A4R, q + 0.025)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
// faces turned inside out (the nozzle is seen from within)
function a4Inward(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv?.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; const m = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = m; }
  if (uv) for (let i = 0; i < uv.length; i += 6) for (let k = 0; k < 2; k++) { const t = uv[i + 2 + k]; uv[i + 2 + k] = uv[i + 4 + k]; uv[i + 4 + k] = t; }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

// The vanes in their hinge frames: fin I at roll 0 (along +X, its +tan face toward -Y), the hinge line along +X
// through the origin, aft toward +Z. Built once; a4VaneHinge places one at fin i of a rocket rolled `roll`.
let vaneGeoms = null;
function a4VaneGeoms() {
  if (vaneGeoms) return vaneGeoms;
  const basis0 = new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 0, 1), V(0, -1, 0));
  // the air vane in the tip's trailing corner, a little proud of the fin's faces, its outer edge flush with the tip's
  const air = new THREE.ExtrudeGeometry(new THREE.Shape([[1.5, 13.58], [1.8, 13.58], [1.8, 14.03], [1.5, 14.03]].map(([u, s]) => new THREE.Vector2(u, a4z(s)))), { depth: 0.13, bevelEnabled: false })
    .translate(0, 0, -0.065).applyMatrix4(basis0).translate(0, 0, -a4z(A4_VANES.air.s));
  // the jet vane in the nozzle's mouth, proud of the base
  const jet = box(0.2, 0.05, 0.42, 0.25, 0, a4z(14.03) - a4z(A4_VANES.jet.s));
  return (vaneGeoms = { air, jet });
}
// fin i's hinge frame at deflection d (radians, + swings the trailing edge toward the fin's +tan side)
const _vr = new THREE.Matrix4();
function a4VaneHinge(set, roll, i, d = 0, out = new THREE.Matrix4()) {
  return out.makeRotationZ(roll + i * Math.PI / 2).multiply(_vr.makeTranslation(0, 0, a4z(A4_VANES[set].s))).multiply(_vr.makeRotationX(d));
}
// The A4's mixing (each vane's own angle from pitch, yaw, roll; radians of jet vane, each clamped to its throw):
// pitch swings the trailing edges of vanes I and III the same way across the rocket (toward fin IV for pitch > 0),
// yaw those of II and IV (toward fin I), roll all four the same way round the axis.
function a4VaneMix(set, pitch, yaw, roll, out) {
  const k = set === 'air' ? A4_VANES.airK : 1, m = A4_VANES[set].max;
  const c = (d) => Math.max(-m, Math.min(m, d * k));
  out[0] = c(pitch + roll); out[1] = c(yaw + roll); out[2] = c(roll - pitch); out[3] = c(roll - yaw);
  return out;
}

// The A4's parts by material in the missile frame (nose toward -Z, centred on its middle): { a4paint, a4grey,
// dark }. `roll` is the roll angle of fin I (0: fins on +-X and +-Y; the trailer, the table and the flight use A4_ROLL).
// The air and jet vanes are in the lists at neutral, or with { split: true } left out and returned as
// `vanes` { air, jet, roll } for a4Vanes (moving) or a4VaneLists (fixed at an angle).
export function a4Pieces(roll = A4_ROLL, { split = false } = {}) {
  const paint = [], grey = [], dark = [];
  paint.push(a4BodyUV(zLathe(a4Seamed().map(([s, r]) => [a4z(s), r]), 48)));
  // the nose: the impact fuze's cap and its spike
  grey.push(zLathe([[a4z(0.0), 0.006], [a4z(0.04), 0.02], [a4z(0.1), 0.042], [a4z(0.2), 0.07], [a4z(0.3), 0.097], [a4z(0.32), 0.05], [a4z(0.33), 0.0]], 20));
  grey.push(zTube(a4z(-0.16), a4z(0.01), 0.006, 0.01, 6));
  // the base: the rim round the nozzle's mouth, the nozzle (its expansion cone to the throat), soot-black inside
  dark.push(new THREE.RingGeometry(0.36, 0.462, 40).translate(0, 0, a4z(14.0)));
  dark.push(a4Inward(zLathe([[a4z(12.95), 0.2], [a4z(13.3), 0.24], [a4z(13.7), 0.305], [a4z(14.0), 0.37]], 32)));
  dark.push(new THREE.CircleGeometry(0.21, 20).translate(0, 0, a4z(12.95)));
  // the umbilical plug's fairing low on the tail, between fins III and IV (the cable mast's side)
  {
    const a = roll + A4.plug.da, r = rAt(A4R, A4.plug.s);
    paint.push(a4ConstUV(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.1, 0.07, 0.3).rotateZ(a - Math.PI / 2)
      .translate(Math.cos(a) * (r - 0.02), Math.sin(a) * (r - 0.02), a4z(A4.plug.s)), a, A4.plug.s));
  }
  for (let i = 0; i < 4; i++) {
    const a = roll + i * Math.PI / 2, rad = V(Math.cos(a), Math.sin(a), 0), tan = V(Math.sin(a), -Math.cos(a), 0);
    const basis = new THREE.Matrix4().makeBasis(rad, V(0, 0, 1), tan);
    // the fin: a thick plate with rounded edges; uv from its own place (u out, s down, the face's slot)
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(A4FIN.map(([u, s]) => new THREE.Vector2(u, a4z(s)))), { depth: A4_FIN_T, bevelEnabled: true, bevelThickness: A4_FIN_BEVEL, bevelSize: A4_FIN_BEVEL, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -A4_FIN_T / 2);
    {
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < p.count; k++) {
        const face = p.getZ(k) > 0 ? 1 : 0, sl = a4Slot(i, face);
        const x = sl.x + (p.getX(k) - A4_FIN_U0) / (A4_FIN_U1 - A4_FIN_U0) * 127, y = sl.y + (p.getY(k) + A4.L / 2 - A4_FIN_S0) / (A4_FIN_S1 - A4_FIN_S0) * 256;
        uv.setXY(k, x / 1024, 1 - y / 1024);
      }
    }
    paint.push(g.applyMatrix4(basis));
    // the air vane in the tip's trailing corner (a4VaneGeoms) and the hinge gap above it
    dark.push(box(0.3, 0.012, A4_FIN_T + 2 * A4_FIN_BEVEL + 0.01, 1.645, a4z(13.565), 0).applyMatrix4(basis));
    // the vane's actuator fairings on both faces, running down to it
    for (const sd of [-1, 1]) {
      const f = new THREE.SphereGeometry(1, 10, 6).scale(0.05, 0.62, 0.045).translate(1.6, a4z(12.95), sd * (A4_FIN_T / 2 + 0.02));
      const p = f.attributes.position, uv = f.attributes.uv, sl = a4Slot(i, sd > 0 ? 1 : 0);
      for (let k = 0; k < p.count; k++) uv.setXY(k, (sl.x + (1.6 - A4_FIN_U0) / (A4_FIN_U1 - A4_FIN_U0) * 127) / 1024, 1 - (sl.y + (12.95 - A4_FIN_S0) / (A4_FIN_S1 - A4_FIN_S0) * 256) / 1024);
      paint.push(f.applyMatrix4(basis));
    }
    // the antenna rod standing off the +tan face near the tip, on two small posts
    const at = (u, s, off) => V(u, a4z(s), off).applyMatrix4(basis);
    dark.push(rod(at(1.36, 12.95, 0.1), at(1.36, 13.75, 0.1), 0.011, 5));
    for (const s of [13.05, 13.6]) dark.push(rod(at(1.36, s, A4_FIN_T / 2), at(1.36, s, 0.1), 0.008, 4));
    // the graphite jet vane's mounting (the vane itself in a4VaneGeoms) with the servo's shaft
    dark.push(box(0.11, 0.2, 0.36, 0, 0, 0).translate(0.425, 0, a4z(13.93)).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)));
    grey.push(xTube(0.33, 0.47, 0.03, 0.03, 8, 0, a4z(13.98)).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)));
  }
  const lists = { a4paint: paint, a4grey: grey, dark };
  const vanes = { ...a4VaneGeoms(), roll };
  if (split) return { lists, vanes };
  a4VaneLists(lists, vanes);
  return { lists };
}

// The vanes put into a4Pieces' lists, fixed at pitch, yaw, roll (radians of jet vane, a4VaneMix): the air vanes
// with a4grey, the jet vanes with dark, appended after everything else.
const _vd = [0, 0, 0, 0], _vh = new THREE.Matrix4();
export function a4VaneLists(lists, vanes, pitch = 0, yaw = 0, roll = 0) {
  for (const [set, key] of [['air', 'a4grey'], ['jet', 'dark']]) {
    a4VaneMix(set, pitch, yaw, roll, _vd);
    for (let i = 0; i < 4; i++) lists[key].push(vanes[set].clone().applyMatrix4(a4VaneHinge(set, vanes.roll, i, _vd[i], _vh)));
  }
  return lists;
}

// The vanes as moving parts under `parent` (the missile frame of a4Pieces): two InstancedMeshes of four (one draw a
// set), posed by set(pitch, yaw, roll) in radians of jet vane (a4VaneMix; the air vanes follow at A4_VANES.airK).
// Nothing is allocated per call, and an unchanged setting is not uploaded again.
export function a4Vanes(parent, vanes) {
  const sets = [['air', 'a4grey'], ['jet', 'dark']].map(([set, key]) => {
    const m = new THREE.InstancedMesh(vanes[set].clone(), MM[key](), 4); // its own copy (a rig's disposal frees it)
    m.name = `a4${set}Vanes`;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return { set, m };
  });
  const last = [NaN, NaN, NaN];
  const set = (pitch = 0, yaw = 0, roll = 0) => {
    if (pitch === last[0] && yaw === last[1] && roll === last[2]) return;
    last[0] = pitch; last[1] = yaw; last[2] = roll;
    for (const s of sets) {
      a4VaneMix(s.set, pitch, yaw, roll, _vd);
      for (let i = 0; i < 4; i++) s.m.setMatrixAt(i, a4VaneHinge(s.set, vanes.roll, i, _vd[i], _vh));
      s.m.instanceMatrix.needsUpdate = true;
    }
  };
  set(0, 0, 0);
  // the culling sphere from the neutral vanes, with room for their throw
  for (const s of sets) { s.m.computeBoundingSphere(); s.m.boundingSphere.radius += 0.15; }
  return { meshes: sets.map((s) => s.m), set };
}

// ---------------------------------------------------------------- flight models

export const MISSILE_EXHAUST = {
  v1: { x: 0, y: V1.jetY, z: V1.L / 2 }, // the open end of the pulse jet's tail pipe, above the tail
  v2: { x: 0, y: 0, z: A4.L / 2 }, // the nozzle exit in the base
};

// The flying A4's pitch program as its vanes show it: the v2 parts with vanes carry a morph target (the vanes at
// A4_PITCH, vanes I and III) and `morph(round)`, its weight for a round in flight (render/shells.js sets it per
// instance): a steady deflection while the program turns the rocket over (the sim, src/ww2/special.js: vertical for
// 4 s, then 1.1 degrees a second to 48 degrees), neutral in the vertical rise, after the turn and once burnt out.
const A4_PITCH = (6 * Math.PI) / 180;
const sstep = (t, a, b) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
export const a4PitchProgram = (sh) => (sh.burning && !sh.failing ? sstep(sh.t, 4, 5.5) * (1 - sstep(sh.t, 46.5, 48.5)) : 0);

const built = new Map();
export function buildMissile(kind) {
  if (built.has(kind)) return cloneSet(built.get(kind));
  let lists, length, radius, morph = null;
  if (kind === 'v1') {
    const p = v1Pieces();
    lists = p.lists;
    for (const side of [-1, 1]) lists.v1paint.push(p.wing(side).translate(p.wingAt(side).x, 0, p.wingAt(side).z));
    length = V1.L;
    radius = V1.span / 2;
  } else if (kind === 'v2') {
    const p = a4Pieces(A4_ROLL, { split: true });
    lists = a4VaneLists(p.lists, p.vanes); // the vanes at neutral, last in their lists
    morph = a4VaneLists({ a4grey: [], dark: [] }, p.vanes, A4_PITCH); // and at the pitch program's deflection
    length = A4.L;
    radius = A4.fin;
  } else throw new Error('unknown missile kind ' + kind);
  const parts = [];
  for (const [key, list] of Object.entries(lists)) if (list.length) {
    const g = mergeAll(list), part = { geometry: g, material: MM[key]() };
    if (morph?.[key]?.length) {
      // the same vertices with the vanes' (the last ones) moved
      const pos = g.attributes.position.clone(), d = mergeAll(morph[key]).attributes.position.array;
      pos.array.set(d, pos.array.length - d.length);
      g.morphAttributes.position = [pos];
      part.morph = a4PitchProgram;
    }
    g.computeBoundingSphere();
    parts.push(part);
  }
  const set = { parts, length, radius };
  built.set(kind, set);
  return cloneSet(set);
}
// callers may dispose what they get, so every call returns its own geometries (the materials stay shared)
const cloneSet = (s) => ({ parts: s.parts.map((p) => ({ ...p, geometry: p.geometry.clone() })), length: s.length, radius: s.radius });

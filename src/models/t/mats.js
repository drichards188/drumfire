import * as THREE from 'three';
import { Parts, vehicleMats, grainTextures, concreteTextures, earthTextures, surfaceFinish, projectUV } from '../kit.js';
import { mulberry32 } from '../../noise.js';

// Materials and a parts collector for the field models (light guns, German guns, targets).
// Everything the heavy models agent's kit gives us (painted steel with the mud line, bare steel,
// tyres, cloth) plus the period materials the Salient needs: weathered oak, concrete, brick and
// plaster, roof tile, wicker, sandbags, balloon fabric, char. All carry vertex colours, so a Parts
// merge can tint each piece and the damage states can blacken a part by editing its colours.

const tex = (size, draw, { srgb = true } = {}) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};
const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

// Weathered oak and elm: long grain streaks, a few knots (tile 1 m, grain along v).
function woodTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(11);
    g.fillStyle = hex(122, 98, 68);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      const x = r() * s, w = 1 + r() * 3, k = 0.7 + r() * 0.5;
      g.fillStyle = `rgba(${60 * k},${44 * k},${28 * k},${0.1 + r() * 0.25})`;
      g.fillRect(x, r() * s * 0.3, w, s * (0.4 + r() * 0.7));
      g.fillStyle = `rgba(190,165,120,${r() * 0.12})`;
      g.fillRect(x + w, r() * s, 1, s * 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const x = r() * s, y = r() * s;
      const gr = g.createRadialGradient(x, y, 0, x, y, 9);
      gr.addColorStop(0, 'rgba(40,28,16,0.7)');
      gr.addColorStop(1, 'rgba(40,28,16,0)');
      g.fillStyle = gr;
      g.fillRect(x - 10, y - 10, 20, 20);
    }
  });
}

// Flemish brick (tile 2 m): running bond, 9 courses per 0.6 m so a brick reads at 20 m, soot streaks.
function brickTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(21);
    g.fillStyle = hex(170, 160, 142);
    g.fillRect(0, 0, s, s);
    const bh = s / 28, bw = s / 8;
    for (let row = 0; row < 28; row++) for (let i = -1; i < 9; i++) {
      const x = i * bw + (row % 2) * bw * 0.5, k = 0.75 + r() * 0.5;
      g.fillStyle = hex(150 * k, 78 * k, 56 * k);
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * s, gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, 'rgba(20,18,16,0)');
      gr.addColorStop(0.5, `rgba(20,18,16,${0.1 + r() * 0.12})`);
      gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr;
      g.fillRect(x, 0, 2 + r() * 6, s);
    }
  });
}

// Lime plaster with stains and a few chips showing the brick, for chateau walls and stonework.
function plasterTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(31);
    g.fillStyle = hex(196, 184, 160);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${90 + r() * 80},${80 + r() * 60},${60 + r() * 50},${0.04 + r() * 0.08})`;
      g.beginPath();
      g.arc(r() * s, r() * s, 3 + r() * 16, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = hex(140 + r() * 20, 76, 54);
      const x = r() * s, y = r() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos(k) * (6 + r() * 14), y + Math.sin(k) * (6 + r() * 12));
      g.fill();
    }
    for (let i = 0; i < 24; i++) {
      const x = r() * s, gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, 'rgba(40,34,26,0)');
      gr.addColorStop(0.4, `rgba(40,34,26,${0.12 + r() * 0.12})`);
      gr.addColorStop(1, 'rgba(40,34,26,0)');
      g.fillStyle = gr;
      g.fillRect(x, 0, 3 + r() * 8, s);
    }
  });
}

// Clay roof tiles (tile 1 m): overlapping rows, moss and soot.
function tileTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(41);
    g.fillStyle = hex(80, 40, 30);
    g.fillRect(0, 0, s, s);
    const rows = 16, w = s / 10;
    for (let row = 0; row < rows; row++) for (let i = -1; i < 11; i++) {
      const k = 0.7 + r() * 0.6, moss = r() < 0.12;
      g.fillStyle = moss ? hex(70 * k, 80 * k, 44 * k) : hex(158 * k, 70 * k, 46 * k);
      g.fillRect(i * w + (row % 2) * w * 0.5 + 1, row * (s / rows), w - 2, s / rows - 2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(i * w + (row % 2) * w * 0.5 + 1, row * (s / rows) + s / rows - 4, w - 2, 3);
    }
  });
}

// Wicker (tile 0.5 m): diagonal weave in straw browns, for cartridge baskets.
function wickerTexture() {
  return tex(128, (g, s) => {
    const r = mulberry32(51);
    g.fillStyle = hex(120, 88, 46);
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) {
      const k = 0.7 + r() * 0.6, odd = ((x + y) / 8) % 2;
      g.fillStyle = hex((odd ? 170 : 130) * k, (odd ? 130 : 98) * k, (odd ? 70 : 50) * k);
      g.fillRect(x + 1, y + 1, 7, 7);
    }
  });
}

// Burlap sandbags (tile 1 m): stacked bags with stitched seams and mud.
function sandbagTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(61);
    g.fillStyle = hex(90, 80, 56);
    g.fillRect(0, 0, s, s);
    const bh = s / 6, bw = s / 3;
    for (let row = 0; row < 6; row++) for (let i = -1; i < 4; i++) {
      const x = i * bw + (row % 2) * bw * 0.5, k = 0.7 + r() * 0.5;
      g.fillStyle = hex(150 * k, 128 * k, 84 * k);
      g.beginPath();
      g.roundRect(x + 2, row * bh + 2, bw - 4, bh - 4, 10);
      g.fill();
      g.strokeStyle = 'rgba(40,30,16,0.35)';
      g.lineWidth = 1;
      for (let j = 0; j < 12; j++) { g.beginPath(); g.moveTo(x + r() * bw, row * bh + 4); g.lineTo(x + r() * bw, row * bh + bh - 4); g.stroke(); }
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(50,38,24,${r() * 0.18})`;
      g.beginPath();
      g.arc(r() * s, r() * s, 2 + r() * 10, 0, 7);
      g.fill();
    }
  });
}

// Doped kite-balloon fabric (tile 4 m): olive-buff with seam lines, the Drachen's patchwork.
function fabricTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(71);
    g.fillStyle = hex(172, 158, 108);
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const k = 0.9 + r() * 0.2;
      g.fillStyle = hex(172 * k, 158 * k, 108 * k);
      g.fillRect(x * s / 4 + 2, y * s / 4 + 2, s / 4 - 4, s / 4 - 4);
    }
    g.strokeStyle = 'rgba(70,60,34,0.7)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke();
    }
  });
}

// Camouflage netting (tile 3 m): hessian strips in earth colours on a mesh, with gaps (alpha test).
function netTexture() {
  return tex(256, (g, s) => {
    const r = mulberry32(91);
    g.clearRect(0, 0, s, s);
    const cols = ['#4a4a2a', '#6a5a36', '#3a3e28', '#7a7050', '#52422a'];
    for (let i = 0; i < 420; i++) {
      g.fillStyle = cols[(r() * cols.length) | 0];
      g.save();
      g.translate(r() * s, r() * s);
      g.rotate(r() * 3.14);
      g.fillRect(-2, -(6 + r() * 20), 3 + r() * 4, 12 + r() * 40);
      g.restore();
    }
    g.fillStyle = '#4a4a2a';
    for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 1.5, s);
    for (let y = 0; y < s; y += 16) g.fillRect(0, y, s, 1.5);
  });
}

// A soft dark blotch for scorch marks and shadows under wrecks (alpha falls off to the rim).
export function scorchTexture() {
  return tex(128, (g, s) => {
    const r = mulberry32(81);
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, d = r() * s * 0.2, x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, rr = s * (0.12 + r() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(12,10,8,0.5)');
      gr.addColorStop(1, 'rgba(12,10,8,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }
  });
}

const std = (c, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, vertexColors: true, ...extra });

// Metric tile size per material key: parts of these keys get box-projected UVs at that scale.
const TILE = { net: 3, wood: 1, brick: 2, plaster: 2, tile: 1, wicker: 0.5, sandbag: 1, fabric: 4, concrete: 6, earth: 8 };

const cache = new Map();

/**
 * The field material set for a paint scheme ('green' British guns, 'khaki', 'tri' German camouflage).
 * Keys: everything vehicleMats gives (camo paint, dark, steel, tyre, rim, rubber, brass, rust, cloth,
 * white, red, amber, glass) plus wood, brick, plaster, tile, wicker, sandbag, fabric, concrete, earth,
 * char (burnt black), ash.
 */
export function fieldMats(scheme = 'green') {
  if (cache.has(scheme)) return cache.get(scheme);
  const base = vehicleMats(scheme), grain = grainTextures();
  const dirt = 0x8a7f62;
  const fin = (m, key, { ns = 0.6, mud = 0.7, dust = 0.5, top = 1.1, dustColor = dirt, rough = grain.rough, normal = grain.normal } = {}) => {
    m.roughnessMap = rough;
    m.normalMap = normal;
    m.normalScale.set(ns, ns);
    return surfaceFinish(m, 'fld-' + key, { mud, dust, mudTop: top, dustColor });
  };
  const con = concreteTextures(0x8c8a82), earth = earthTextures();
  const m = {
    ...base,
    wood: fin(std(0xffffff, 0.85, 0, { map: woodTexture() }), 'wood', { mud: 0.9, dust: 0.4, top: 1.0 }),
    brick: fin(std(0xffffff, 0.92, 0, { map: brickTexture() }), 'brick', { mud: 0.6, dust: 0.5, top: 0.8 }),
    plaster: fin(std(0xffffff, 0.92, 0, { map: plasterTexture() }), 'plaster', { mud: 0.5, dust: 0.5, top: 0.8 }),
    tile: fin(std(0xffffff, 0.8, 0, { map: tileTexture() }), 'tile', { mud: 0, dust: 0.5 }),
    wicker: fin(std(0xffffff, 0.95, 0, { map: wickerTexture() }), 'wicker', { mud: 0.6, dust: 0.5, top: 0.6 }),
    sandbag: fin(std(0xffffff, 1, 0, { map: sandbagTexture() }), 'sandbag', { mud: 0.8, dust: 0.5, top: 0.9 }),
    fabric: std(0xffffff, 0.8, 0, { map: fabricTexture(), side: THREE.DoubleSide }),
    concrete: fin(std(0xffffff, 0.92, 0, { map: con.map }), 'concrete', { ns: 1, mud: 0.95, dust: 0.5, top: 1.4, rough: con.rough, normal: con.normal }),
    earth: fin(std(0xffffff, 1, 0, { map: earth.map }), 'earth', { ns: 1, mud: 0, dust: 0, rough: earth.rough, normal: earth.normal }),
    matte: std(0xffffff, 0.6, 0.12), // anything painted a single tint: shells, crates, horses
    water: std(0x4d5a58, 0.08, 0.2, { envMapIntensity: 1.5 }),
    net: std(0xffffff, 1, 0, { map: netTexture(), side: THREE.DoubleSide, alphaTest: 0.5 }),
    char: std(0x1a1816, 0.95, 0),
    ash: std(0x4a4640, 1, 0),
  };
  cache.set(scheme, m);
  return m;
}

// Parts collector with metric UVs for the period keys above.
export class FParts extends Parts {
  constructor(scheme = 'green') {
    super(fieldMats(scheme));
  }

  add(key, geom, o = {}) {
    if (TILE[key] && !o.uv) {
      const g = geom.index ? geom.toNonIndexed() : geom.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      projectUV(g, TILE[key]);
      return super.add(key, g, { ...o, uv: true });
    }
    return super.add(key, geom, o);
  }
}

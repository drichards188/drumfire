import * as THREE from 'three';
import { box, zTube, xTube, yTube } from './kit.js';
import { newGunRig, anchor, crewSpot, finishGun } from './rig.js';
import { buildBL15 } from './v/bl15.js';
import { buildBL92 } from './v/bl92.js';
import { buildRail } from './v/rail.js';

// The gun registry. buildGun(kind) returns a rig per the contract in DESIGN.md "Models":
//   rig.root, rig.pivots { traverse, elevation, recoil, breech, (crane, hoist | trolley) }, rig.anchors
//   { eye, muzzle, breech, tray, shellStack, crew: [{ role, x, y, z, heading, pose }] }, rig.recoilLength,
//   rig.loadEl, rig.setBreech(k), rig.setShell(where, visible), rig.boxes, plus setRecoil(k), setElevation(r),
//   setTraverse(r) and rig.shell { len, rad }.
// bl15, bl92 and rail live here (v/bl15.js, v/bl92.js, v/rail.js). bl6 and bl60 belong to the field models
// agent (v/bl6.js buildBL6, v/bl60.js buildBL60); they are loaded lazily and guarded, so a missing or broken
// file never takes the others down. loadGuns() starts that load (it also runs at import) and resolves when
// every builder that exists has been tried; buildGun is synchronous. Until bl6 or bl60 have loaded (or if
// their file is absent or throws), buildGun returns a plain stand-in of the right size so callers never fail.
export const GUN_KINDS = ['bl15', 'bl92', 'bl6', 'bl60', 'rail'];
// The WW2 mode's German pieces and launch sites (src/models/v/de/, DESIGN.md "WW2 mode"), loaded the same lazy way.
export const GUN_KINDS_WW2 = ['lefh18', 'sfh18', 'k18', 'mrs18', 'nbw41', 'gustav', 'bertha', 'karl', 'v1', 'v2'];
// The WW1 German mode's pieces (src/models/v/de/, DESIGN.md "WW1 German mode"); the 42 cm M-Gerät is the shared
// `bertha`, built in its 1917 colours on a WW1 page (GUN_ERA.ww1, set by main before the rigs are built).
export const GUN_KINDS_WW1 = ['sfh13', 'm16', 'k17', 'bertha', 'max38', 'gamma', 'paris'];
export const GUN_ERA = { ww1: false };

const EXT = {
  bl6: { glob: import.meta.glob('./v/bl6.js') },
  bl60: { glob: import.meta.glob('./v/bl60.js') },
  lefh18: { glob: import.meta.glob('./v/de/lefh18.js') },
  sfh18: { glob: import.meta.glob('./v/de/sfh18.js') },
  k18: { glob: import.meta.glob('./v/de/k18.js') },
  mrs18: { glob: import.meta.glob('./v/de/k18.js') },
  nbw41: { glob: import.meta.glob('./v/de/nbw41.js') },
  gustav: { glob: import.meta.glob('./v/de/gustav.js') },
  bertha: { glob: import.meta.glob('./v/de/bertha.js') },
  karl: { glob: import.meta.glob('./v/de/karl.js') },
  v1: { glob: import.meta.glob('./v/de/v1.js') },
  v2: { glob: import.meta.glob('./v/de/v2.js') },
  sfh13: { glob: import.meta.glob('./v/de/sfh13.js') },
  m16: { glob: import.meta.glob('./v/de/m16.js') },
  k17: { glob: import.meta.glob('./v/de/k17.js') },
  max38: { glob: import.meta.glob('./v/de/max38.js') },
  gamma: { glob: import.meta.glob('./v/de/gamma.js') },
  paris: { glob: import.meta.glob('./v/de/paris.js') },
};
const NAMES = {
  bl6: 'buildBL6', bl60: 'buildBL60', lefh18: 'buildLeFH18', sfh18: 'buildSFH18', k18: 'buildK18', mrs18: 'buildMrs18',
  nbw41: 'buildNbW41', gustav: 'buildGustav', bertha: 'buildBerthaGun', karl: 'buildKarl', v1: 'buildV1Site', v2: 'buildV2Site',
  sfh13: 'buildSFH13', m16: 'buildM16', k17: 'buildK17', max38: 'buildMax38', gamma: 'buildGamma', paris: 'buildParis',
};
// extra builders a module may export beside its gun (the Gustav's firing position): loadGuns() collects them here
export const EXTRAS = {};
const EXTRA_NAMES = {
  gustav: ['buildGustavSite'],
  // the WW1 German mode: the 42 cm in its 1917 colours, and the firing positions of the railway and fixed guns
  bertha: ['buildBerthaGun1917'], max38: ['buildMax38Site'], gamma: ['buildGammaSite'], paris: ['buildParisSite'],
};
const loaded = {};
const pending = {};

// loadGuns() loads the British field guns' builders (as it always did); loadGuns(GUN_KINDS_WW2) the WW2 mode's.
// Resolves when every builder asked for has been tried.
export function loadGuns(kinds = ['bl6', 'bl60']) {
  return Promise.all(kinds.filter((k) => EXT[k]).map((kind) => (pending[kind] ??= (async () => {
    try {
      const load = Object.values(EXT[kind].glob)[0];
      if (!load) return;
      const mod = await Promise.race([load(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 8000))]);
      if (typeof mod[NAMES[kind]] === 'function') loaded[kind] = mod[NAMES[kind]];
      for (const n of EXTRA_NAMES[kind] ?? []) if (typeof mod[n] === 'function') EXTRAS[n] = mod[n];
    } catch (e) {
      console.warn(`guns: ${kind} builder failed to load:`, e.message);
    }
  })()))).then(() => ({ ...loaded }));
}
loadGuns();

// A plain stand-in: a box trail, a barrel and two wheels, sized by calibre.
const STANDIN = {
  bl6: { len: 2.4, r: 0.17, y: 1.1, name: 'bl6' },
  bl60: { len: 4.2, r: 0.14, y: 1.25, name: 'bl60' },
  lefh18: { len: 2.9, r: 0.08, y: 1.1 }, sfh18: { len: 4.4, r: 0.11, y: 1.4 }, k18: { len: 8.5, r: 0.13, y: 2.2 },
  mrs18: { len: 6.5, r: 0.15, y: 2.2 }, nbw41: { len: 1.3, r: 0.25, y: 0.9 }, gustav: { len: 32, r: 0.7, y: 7 },
  bertha: { len: 5, r: 0.35, y: 2.4 }, karl: { len: 5, r: 0.45, y: 2.4 }, v1: { len: 45, r: 0.3, y: 1 }, v2: { len: 7, r: 0.8, y: 7 },
  sfh13: { len: 2.6, r: 0.1, y: 1.1 }, m16: { len: 3.2, r: 0.14, y: 1.6 }, k17: { len: 4.7, r: 0.07, y: 1.2 },
  max38: { len: 17, r: 0.32, y: 3.4 }, gamma: { len: 6.7, r: 0.4, y: 2.6 }, paris: { len: 34, r: 0.3, y: 4 },
};
function buildStandIn(kind) {
  const s = STANDIN[kind], rig = newGunRig(kind, 'drab'), P = rig.P, root = rig.root;
  const tr = new THREE.Group(), el = new THREE.Group(), rec = new THREE.Group();
  tr.name = 'traverse'; el.name = 'elevation'; rec.name = 'recoil';
  el.position.set(0, s.y, 0);
  tr.add(el); el.add(rec); root.add(tr);
  rig.pivots.traverse = tr; rig.pivots.elevation = el; rig.pivots.recoil = rec; rig.pivots.breech = new THREE.Group();
  rec.add(rig.pivots.breech);
  const Pt = rig.P;
  Pt.add('iron', zTube(-s.len * 0.7, s.len * 0.3, s.r, s.r * 1.4, 14));
  Pt.add('camo', box(0.9, 0.3, 3, 0, s.y - 0.4, 1.8));
  Pt.add('camo', xTube(-0.9, 0.9, 0.05, 0.05, 8, s.y - 0.3, 0));
  Pt.build(root, { y0: 0 });
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4a30 }));
    w.position.set(sx * 0.95, 0.7, 0);
    root.add(w);
  }
  anchor(rig, rec, 'muzzle', 0, 0, -s.len * 0.7);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, s.len * 0.3);
  anchor(rig, el, 'tray', 0, 0, s.len * 0.3 + 0.5);
  anchor(rig, root, 'eye', 0, s.y, 0);
  anchor(rig, root, 'shellStack', 2, 0.2, 2);
  rig.recoilLength = 0.8;
  rig.loadEl = 0;
  crewSpot(rig, 'layer', -1.4, 0, 0.5, Math.PI / 2);
  rig.boxes.push({ min: new THREE.Vector3(-1.1, 0, -s.len), max: new THREE.Vector3(1.1, s.y + 0.5, 4.5) });
  return finishGun(rig);
}

const BUILDERS = { bl15: buildBL15, bl92: buildBL92, rail: buildRail };

export function buildGun(kind) {
  if (BUILDERS[kind]) return BUILDERS[kind]();
  if (GUN_ERA.ww1 && kind === 'bertha' && EXTRAS.buildBerthaGun1917) {
    try { return EXTRAS.buildBerthaGun1917(); } catch (e) { console.warn('guns: bertha (1917) builder threw:', e.message); }
  }
  if (loaded[kind]) {
    try { return loaded[kind](); } catch (e) { console.warn(`guns: ${kind} builder threw:`, e.message); }
  }
  if (STANDIN[kind]) return buildStandIn(kind);
  throw new Error(`unknown gun kind: ${kind}`);
}

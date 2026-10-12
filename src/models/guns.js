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

const EXT = {
  bl6: { glob: import.meta.glob('./v/bl6.js') },
  bl60: { glob: import.meta.glob('./v/bl60.js') },
};
const NAMES = { bl6: 'buildBL6', bl60: 'buildBL60' };
const loaded = {};
let loading = null;

export function loadGuns() {
  if (!loading) {
    loading = Promise.all(Object.keys(EXT).map(async (kind) => {
      try {
        const load = Object.values(EXT[kind].glob)[0];
        if (!load) return;
        const mod = await Promise.race([load(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 8000))]);
        if (typeof mod[NAMES[kind]] === 'function') loaded[kind] = mod[NAMES[kind]];
      } catch (e) {
        console.warn(`guns: ${kind} builder failed to load:`, e.message);
      }
    })).then(() => ({ ...loaded }));
  }
  return loading;
}
loadGuns();

// A plain stand-in: a box trail, a barrel and two wheels, sized by calibre.
const STANDIN = {
  bl6: { len: 2.4, r: 0.17, y: 1.1, name: 'bl6' },
  bl60: { len: 4.2, r: 0.14, y: 1.25, name: 'bl60' },
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
  if (loaded[kind]) {
    try { return loaded[kind](); } catch (e) { console.warn(`guns: ${kind} builder threw:`, e.message); }
  }
  if (STANDIN[kind]) return buildStandIn(kind);
  throw new Error(`unknown gun kind: ${kind}`);
}

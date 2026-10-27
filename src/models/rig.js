import * as THREE from 'three';
import { V, box, rbox, vehicleMats, Parts, shellGeometry } from './kit.js';

// Rig plumbing shared by the vehicle builders.

export function newRig(scheme) {
  const root = new THREE.Group();
  const rig = { root, scheme, mats: vehicleMats(scheme), pivots: {}, anchors: { muzzles: [], missileSlots: [] }, boxes: [], slots: [], setLoaded: null };
  rig.P = new Parts(rig.mats);
  rig.setLoaded = (i, loaded) => { const s = rig.slots[i]; if (s) for (const o of s) o.visible = loaded; };
  return rig;
}

export function node(parent, name, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  parent.add(o);
  return o;
}

export function pivotAt(rig, parent, key, x, y, z) {
  const g = new THREE.Group();
  g.name = key;
  g.position.set(x, y, z);
  parent.add(g);
  rig.pivots[key] = g;
  return g;
}

export const hb = (rig, x0, y0, z0, x1, y1, z1) => rig.boxes.push({ min: V(x0, y0, z0), max: V(x1, y1, z1) });


// ---------------------------------------------------------------- gun rigs (Drumfire)

// A rig for one artillery piece, per the contract in DESIGN.md "Models". Builders fill it in:
//   pivots   traverse (rotation.y), elevation (rotation.x, + = muzzle up), recoil (position.z, + = back),
//            breech (the block carrier, swings about y), plus crane / hoist (bl15), trolley (rail)
//   anchors  eye, muzzle, breech, tray, shellStack (Object3D), crew [{ role, x, y, z, heading, pose }]
//   recoilLength, loadEl, setBreech(k), setShell(where, visible), boxes, update?(dt)
// and the conveniences setRecoil(k 0..1), setElevation(rad), setTraverse(rad), shell { len, rad }.
export function newGunRig(kind, scheme = 'earth') {
  const rig = newRig(scheme);
  rig.kind = kind;
  rig.anchors = { muzzles: [], missileSlots: [], crew: [] };
  rig.recoilLength = 1;
  rig.loadEl = 0;
  rig.breechOpen = { axis: 'y', angle: 1.9 }; // how far the carrier swings at setBreech(1)
  rig.props = {}; // shells shown by setShell: tray / crane / trolley
  rig.setRecoil = (k) => { if (rig.pivots.recoil) rig.pivots.recoil.position.z = k * rig.recoilLength; };
  rig.setElevation = (r) => { if (rig.pivots.elevation) rig.pivots.elevation.rotation.x = r; };
  rig.setTraverse = (r) => { if (rig.pivots.traverse) rig.pivots.traverse.rotation.y = r; };
  rig.setBreech = (k) => {
    const b = rig.pivots.breech;
    if (b) b.rotation[rig.breechOpen.axis] = k * rig.breechOpen.angle;
    // a viewer that only knows the breech gets a sensible tray: out beside the gun until the block is open
    // (the render layer follows with setTray from the loading step)
    rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25)));
  };
  rig.setTray = null; // trayMount() installs it on the guns that have a tray
  rig.recoilFade = null; // (el) -> 0..1 share of the recoil stroke available at that elevation
  rig.setShell = (where, visible) => { const g = rig.props[where]; if (g) g.visible = !!visible; };
  return rig;
}

// An anchor Object3D registered in rig.anchors[name].
export function anchor(rig, parent, name, x = 0, y = 0, z = 0, ry = 0) {
  const o = node(parent, name, x, y, z, 0, ry, 0);
  rig.anchors[name] = o;
  return o;
}

// A crew spot in root space: y is where the feet stand, heading is rotation.y (0 faces -Z, the muzzle).
export function crewSpot(rig, role, x, y, z, heading = 0, pose = 'stand') {
  rig.anchors.crew.push({ role, x, y, z, heading, pose });
}

// The shell a setShell(where) call shows: hidden at first, nose toward -Z of `parent`, at the given
// place. The group's origin is the shell's middle.
export function addShellProp(rig, where, parent, len, rad, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.Group();
  g.name = 'shell-' + where;
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  const s = shellGeometry(len, rad), m = rig.mats;
  for (const [geo, mat] of [[s.body, m.shell], [s.band, m.brass], [s.fuze, m.steel]]) {
    const o = new THREE.Mesh(geo, mat);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  g.visible = false;
  parent.add(g);
  rig.props[where] = g;
  rig.shell = { len, rad };
  return g;
}

// Final touches for a gun rig: shadows, default hit boxes, and the build-time collections dropped.
export function finishGun(rig) {
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  delete rig.P;
  delete rig.mats;
  return rig;
}

// The loading tray rides a cross slide on the carriage (the tray on its loading arm: ref bl92in "loading
// arm lowered and tray removed"): raised, it lies behind the breech along the bore at the loading
// elevation, bridging to the breech ring; stowed it has slid `slide` m to the left, clear of the recoiling
// breech and the swinging block (which hinges on the right). `pivots.tray` carries the tray's meshes in a
// frame whose origin is the tray's front hinge point (hy, hz in the elevation frame) at rig.loadEl.
// anchors.tray stays on the elevation frame (tilted back to the loading slope as the gun is raised, as
// before) so the crew's idea of where the shell lies does not move with the slide. update() keeps it.
export function trayMount(rig, trav, elev, hy, hz, ay, az, slide) {
  const p = pivotAt(rig, trav, 'tray', 0, 0, 0);
  const e = rig.loadEl, c = Math.cos(e), s = Math.sin(e);
  p.position.set(elev.position.x, elev.position.y + hy * c - hz * s, elev.position.z + hy * s + hz * c);
  p.rotation.x = e;
  const x0 = p.position.x;
  rig.setTray = (k) => { p.position.x = x0 - Math.min(1, Math.max(0, k)) * slide; };
  const tilt = node(elev, 'trayTilt', 0, hy, hz);
  const a = node(tilt, 'tray', 0, ay, az);
  rig.anchors.tray = a;
  rig.trayTilt = () => { tilt.rotation.x = -Math.max(0, elev.rotation.x - rig.loadEl); };
  rig.trayTilt();
  rig.setTray(1);
  return p;
}

// Recoil that shortens as the gun is raised, so the breech tail (`tailZ` behind the trunnion axis along the
// bore, radius `tailR`) stays `m` above the floor `ty` below the trunnions: the stroke the cradle allows at
// that elevation as a share of rig.recoilLength, never below `min`.
export function floorFade(rig, ty, tailZ, tailR, m = 0.06, min = 0.3) {
  rig.recoilFade = (el) => {
    if (el <= 0.02) return 1;
    const room = (ty - m - tailR * Math.cos(el)) / Math.sin(el) - tailZ;
    return Math.min(1, Math.max(min, room / rig.recoilLength));
  };
}

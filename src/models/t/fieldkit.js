import * as THREE from 'three';
import { V, box, xTube, zTube, yTube, rod, loft, lathe, xf, sideProfile } from '../kit.js';
import { node, pivotAt, hb } from '../rig.js';
import { FParts, fieldMats } from './mats.js';
import { buildShell, buildCartridge } from '../shells.js';

// Pieces shared by the field guns (6-inch 26 cwt, 60-pounder, the German guns): spoked wheels with
// girdles, handwheels, a box trail lofted from stations, the dial sight, and the rig plumbing
// (loading tray shell, setBreech, crew spots).

export const TAU = Math.PI * 2;

export function makeRig(scheme = 'green') {
  const root = new THREE.Group();
  const rig = { root, mats: fieldMats(scheme), pivots: {}, anchors: { crew: [] }, boxes: [], recoilLength: 0.9, loadEl: 0.08 };
  rig.P = new FParts(scheme);
  rig.part = () => new FParts(scheme);
  // the same conveniences the heavy models' newGunRig gives (rig.js)
  rig.setRecoil = (k) => { if (rig.pivots.recoil) rig.pivots.recoil.position.z = k * rig.recoilLength; };
  rig.setElevation = (r) => { if (rig.pivots.elevation) rig.pivots.elevation.rotation.x = r; };
  rig.setTraverse = (r) => { if (rig.pivots.traverse) rig.pivots.traverse.rotation.y = r; };
  return rig;
}

// Final touches: shadows, drop the build-time collections, muzzles list like newGunRig.
export function finishRig(rig, kind, shellKind) {
  rig.kind = kind;
  rig.anchors.muzzles = [rig.anchors.muzzle];
  const s = buildShell(shellKind);
  rig.shell = { len: s.length, rad: s.radius };
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  delete rig.P;
  delete rig.part;
  return rig;
}
export { node, pivotAt, hb };

// Annulus about the X axis between radii rIn and rOut over x0..x1 (a closed lathe, normals outward).
export function ring(rIn, rOut, x0, x1, seg = 40) {
  const pts = [[rIn, x0], [rOut, x0], [rOut, x1], [rIn, x1], [rIn, x0]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, seg).rotateZ(-Math.PI / 2);
}

/**
 * A wooden artillery wheel with its axis along X, centre at (x, y, 0): steel tyre, felloe ring,
 * spokes, nave with iron bands and a hub cap. `side` (+1/-1) says which way the hub cap faces.
 * girdle: pedrail shoes strapped round the tyre (the Ypres mud fix), a belt of steel plates with ribs.
 */
export function addWheel(P, x, y, { R = 0.79, tw = 0.1, spokes = 14, side = 1, nave = 0.13, girdle = false, z = 0 } = {}) {
  const at = (g) => g.applyMatrix4(xf(x, y, z));
  P.add('dark', at(ring(R - 0.025, R, -tw / 2, tw / 2, 48)));
  P.add('wood', at(ring(R - 0.1, R - 0.025, -tw * 0.42, tw * 0.42, 40)));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + 0.1, ca = Math.cos(a), sa = Math.sin(a);
    // spokes are dished a little toward the outside of the wheel and slightly flattened across x
    const g = rod(V(side * -0.03, ca * nave * 0.9, sa * nave * 0.9), V(side * 0.0, ca * (R - 0.1), sa * (R - 0.1)), 0.026, 6);
    P.add('wood', at(g.applyMatrix4(xf(0, 0, 0, 0, 0, 0, V(1.1, 1, 1)))));
  }
  P.add('wood', at(xTube(-0.2, 0.2, nave, nave * 0.95, 14)));
  for (const s of [-1, 1]) P.add('dark', at(xTube(s * 0.16, s * 0.2, nave * 1.12, nave * 1.12, 14)));
  P.add('dark', at(xTube(0.0, 0.0 + side * 0.01, nave * 1.15, nave * 1.15, 14)));
  P.add('steel', at(xTube(side * 0.2, side * 0.27, nave * 0.55, nave * 0.4, 10)));
  if (girdle) {
    const n = 10, gw = 0.3, rr = R + 0.012;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), chord = (TAU * rr) / n;
      P.add('rust', at(box(gw, 0.02, chord * 0.92, 0, ca * rr, sa * rr, a)));
      P.add('dark', at(box(gw * 0.98, 0.035, 0.02, 0, ca * (rr + 0.02), sa * (rr + 0.02), a)));
    }
    for (const sx of [-1, 1]) { // the two chain/strap edges
      P.add('dark', at(ring(R + 0.0, R + 0.03, sx * gw * 0.48 - 0.01, sx * gw * 0.48 + 0.01, 48)));
    }
  }
}

// Handwheel (axis X): rim, six spokes, hub and a handle knob.
export function addHandwheel(P, x, y, z, r = 0.14, side = -1) {
  const g = new THREE.TorusGeometry(r, 0.012, 5, 18).rotateY(Math.PI / 2);
  P.add('dark', g.applyMatrix4(xf(x, y, z)));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    P.add('dark', rod(V(x, y, z), V(x, y + Math.cos(a) * r, z + Math.sin(a) * r), 0.007, 4));
  }
  P.add('steel', xTube(x, x + side * 0.1, 0.02, 0.02, 8, y, z));
  P.add('dark', xTube(x + side * 0.03, x + side * 0.1, 0.012, 0.012, 6, y + r, z));
}

/** Box-section trail between stations [{ z, y, w, h }] (centre height y, width w, depth h). */
export function trailBeam(P, key, st) {
  const rings = st.map(({ z, y, w, h }) => [V(-w / 2, y - h / 2, z), V(w / 2, y - h / 2, z), V(w / 2, y + h / 2, z), V(-w / 2, y + h / 2, z)]);
  P.add(key, loft(rings));
}

// Dial sight on a bracket: a short drum with a prism head and a graduated ring (brass, steel).
export function addDialSight(P, x, y, z) {
  P.add('steel', yTube(y, y + 0.14, 0.012, 0.012, 6, x, z));
  P.add('brass', yTube(y + 0.14, y + 0.2, 0.05, 0.045, 14, x, z));
  P.add('dark', yTube(y + 0.2, y + 0.23, 0.052, 0.052, 14, x, z));
  P.add('steel', zTube(z - 0.1, z + 0.03, 0.017, 0.017, 8, x, y + 0.27));
  P.add('dark', box(0.05, 0.06, 0.05, x, y + 0.27, z - 0.12));
  P.add('brass', box(0.04, 0.08, 0.04, x, y + 0.24, z + 0.06));
}

// Rig plumbing: the breech door, the tray shell, crew spots, hit boxes.
export function breechSetter(rig, hinge, maxAngle = 1.9) {
  rig.setBreech = (k) => { hinge.rotation.y = Math.min(1, Math.max(0, k)) * maxAngle; };
  rig.setBreech(0);
}

/** A shell (or bag) shown on the loading tray, lying along the bore (child of `tray`). */
export function trayShells(rig, tray, kind) {
  const mk = (b) => {
    const g = new THREE.Group();
    for (const p of b.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = true;
      g.add(m);
    }
    g.visible = false;
    tray.add(g);
    return g;
  };
  const shell = buildShell(kind), bag = buildCartridge(kind);
  const gs = mk(shell), gc = mk(bag);
  gs.position.z = shell.length / 2 + 0.02; // lies behind the breech, nose to the muzzle
  gc.position.z = bag.length / 2 + 0.02;
  gs.position.y = shell.radius + 0.02;
  gc.position.y = bag.radius + 0.02;
  rig.setShell = (where, visible) => {
    if (where === 'tray' || where === 'crane' || where === 'trolley') gs.visible = visible;
    else if (where === 'cartridge') gc.visible = visible;
  };
  return { shell: gs, bag: gc };
}

export const crew = (rig, role, x, z, heading, pose, y = 0) => rig.anchors.crew.push({ role, x, y, z, heading, pose });
export const L90 = -Math.PI / 2; // heading that faces +X (rotation.y convention, front = -Z)
export const R90 = Math.PI / 2; // faces -X

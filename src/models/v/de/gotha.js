import * as THREE from 'three';
import { V, box, xTube, yTube, zTube, rod } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, crew, L90, R90 } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { buildAircraft1918 } from '../../t/ww1/aircraft.js';

/**
 * The Gotha G.V on the ground (the off-map support's bomber, sim/support.js; the aircraft itself is
 * models/t/ww1/aircraft.js 'gotha', which the battle flies): a gun-rig-shaped object for the menu's hangar parade, the
 * bomber parked on its wheels and tail skid with a bomb trolley beside its nose, its three aircrew and four mechanics
 * standing round it. 23.7 m span, 12.4 m long, 4.3 m high.
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the aircraft's datum (the main wheels 1.2 m ahead of it, between
 * the wings), front -Z (the nose). The pivots are the
 * nose gunner's Parabellum: `traverse` his ring (rotation.y), `elevation` the gun's cradle, `recoil` the gun (so the
 * hangar's muzzle cover finds a barrel), `breech` its receiver; `muzzle` and `breech` anchors on the gun, `tray` and
 * `shellStack` on the trolley's bombs. recoilLength 0.05, loadEl 0. buildGotha({ scheme })
 */
export function buildGotha({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---------------------------------------------------------------- the aircraft, parked (its own materials)
  const air = buildAircraft1918('gotha');
  air.setParked(true);
  for (const h of air.crew) h.visible = false; // (the aircrew stand beside it)
  // the nose gun is the rig's own (below), so its pivots carry it; the rear gunner's stays as the aircraft has it
  const noseGun = air.guns.find((g) => g.name === 'noseGun');
  if (noseGun) noseGun.visible = false;
  root.add(air.root);
  rig.aircraft = air;

  // ---------------------------------------------------------------- the nose gunner's ring and Parabellum (the pivots)
  const ringR = noseGun?.userData.ring ?? 0.36;
  const trav = pivotAt(rig, air.body, 'traverse', noseGun?.position.x ?? 0, noseGun?.position.y ?? 0.47, noseGun?.position.z ?? -4.9);
  const T = rig.part();
  T.add('dark', new THREE.TorusGeometry(ringR, 0.028, 6, 24).rotateX(Math.PI / 2));
  T.add('dark', yTube(0, 0.32, 0.02, 0.02, 8, 0, -ringR * 0.6));
  T.add('dark', box(0.06, 0.05, 0.1, 0, 0.32, -ringR * 0.6));
  T.build(trav, { dirt: 0 });
  const el = pivotAt(rig, trav, 'elevation', 0, 0.38, -ringR * 0.6);
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const G = rig.part();
  G.add('dark', zTube(-0.55, 0.35, 0.026, 0.026, 10)); // the receiver and the slim cooling jacket
  for (let k = 0; k < 6; k++) G.add('dark', zTube(-0.5 + k * 0.08, -0.47 + k * 0.08, 0.029, 0.029, 10)); // its rings
  G.add('dark', zTube(-0.62, -0.55, 0.012, 0.012, 6)); // the muzzle
  G.add('dark', xTube(0.03, 0.12, 0.08, 0.08, 14, 0, 0.08)); // the drum
  G.add('dark', box(0.12, 0.06, 0.04, 0, -0.04, 0.4)); // the spade grips
  G.add('steel', box(0.01, 0.06, 0.01, 0, 0.05, -0.5)); // the foresight
  G.build(rc, { dirt: 0 });
  const br = pivotAt(rig, rc, 'breech', 0, 0, 0.2);
  const K = rig.part();
  K.add('dark', box(0.07, 0.1, 0.18, 0, -0.02, 0));
  K.build(br, { dirt: 0 });
  rig.setBreech = () => {};

  // ---------------------------------------------------------------- the bomb trolley beside the nose
  // a low four-wheeled frame with its drawbar, two 100 kg P.u.W. bombs in the cradles, a third on the grass
  const TX = 2.1, TZ = -4.4;
  const P = rig.part();
  P.add('wood', box(0.7, 0.07, 2.0, TX, 0.36, TZ));
  for (const s of [-1, 1]) {
    P.add('wood', box(0.08, 0.1, 2.0, TX + s * 0.31, 0.29, TZ));
    for (const dz of [-0.75, 0.75]) {
      P.add('dark', xTube(TX + s * 0.36, TX + s * 0.42, 0.17, 0.17, 16, 0.17, TZ + dz)); // the wheels
      P.add('steel', xTube(TX + s * 0.42, TX + s * 0.45, 0.05, 0.05, 8, 0.17, TZ + dz));
    }
  }
  for (const dz of [-0.75, 0.75]) P.add('dark', xTube(TX - 0.4, TX + 0.4, 0.025, 0.025, 6, 0.17, TZ + dz));
  for (const dz of [-0.5, 0.45]) for (const dx of [-0.16, 0.16]) P.add('wood', box(0.2, 0.1, 0.08, TX + dx, 0.44, TZ + dz)); // the cradles
  P.add('dark', rod(V(TX, 0.25, TZ - 1.0), V(TX, 0.08, TZ - 2.1), 0.025, 6)); // the drawbar on the ground
  P.add('steel', new THREE.TorusGeometry(0.07, 0.015, 6, 12).rotateX(Math.PI / 2).translate(TX, 0.06, TZ - 2.15));
  // a hand-cart wheel chock and the fuze box on the frame
  P.add('wood', box(0.3, 0.2, 0.25, TX + 0.12, 0.49, TZ + 0.85));
  P.add('dark', box(0.31, 0.03, 0.26, TX + 0.12, 0.6, TZ + 0.85));
  P.build(root, { dirt: 0.4 });
  const bomb = buildShell('gotha', 14), bombs = [];
  const put = (x, y, z, ry = 0, rz = 0) => {
    const g = new THREE.Group();
    for (const part of bomb.parts) g.add(new THREE.Mesh(part.geometry, part.material));
    g.position.set(x, y, z);
    g.rotation.set(0, ry, rz);
    root.add(g);
    bombs.push(g);
    return g;
  };
  put(TX - 0.16, 0.5 + bomb.radius, TZ);
  put(TX + 0.16, 0.5 + bomb.radius, TZ);
  put(TX + 1.0, bomb.radius, TZ + 0.3, 0.25, 0);

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(root, 'eye', 0, 3.0, 1.0);
  air.root.updateMatrixWorld(true);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, -0.62);
  rig.anchors.breech = node(el, 'breech', 0, 0, 0.3);
  rig.anchors.tray = node(root, 'tray', TX - 0.16, 0.5 + bomb.radius, TZ);
  rig.anchors.shellStack = node(root, 'shellStack', TX + 1.0, 0.1, TZ + 0.3);
  rig.setShell = () => {}; // (the bombs are on the trolley)
  rig.recoilLength = 0.05;
  rig.loadEl = 0;

  // the aircrew in front of the nose facing out (the commander, who aimed the bombs from the nose, the pilot, the rear
  // gunner), the mechanics at the trolley, the engines and the tail
  crew(rig, 'officer', -1.4, -7.0, 0, 'stand');
  crew(rig, 'pilot', -0.6, -7.1, 0, 'stand');
  crew(rig, 'gunner', 0.2, -7.0, 0, 'stand');
  crew(rig, 'mech1', TX + 0.85, TZ - 0.6, R90, 'stand');
  crew(rig, 'mech2', -2.95, 2.4, 0, 'stand');
  crew(rig, 'mech3', 2.95, 2.4, 0, 'stand');
  crew(rig, 'mech4', 1.2, 6.6, L90 - 0.6, 'stand');

  hb(rig, -0.7, 0.3, -6.3, 0.7, 2.0, 6.8); // the fuselage
  hb(rig, -11.9, 0.9, -2.0, 11.9, 4.5, 0.6); // the wings
  hb(rig, -3.5, 0, -2.8, 3.5, 2.2, 1.3); // the engines and the undercarriage
  return finishRig(rig, 'gotha', 'gotha');
}

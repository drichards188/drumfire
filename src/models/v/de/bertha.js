import * as THREE from 'three';
import { buildBertha } from '../../../bertha/model.js';
import { GUN } from '../../../bertha/ballistics.js';
import { Parts, vehicleMats, box, xTube } from '../../kit.js';
import { clamp01 } from './heavy_common.js';

// The 42 cm M-Gerät "Dicke Bertha" as a gun rig for the main game's render layer (DESIGN.md "Models" and
// "WW2 mode"): an adapter over the demo's own model (src/bertha/model.js, unchanged: the demo builds its
// own copy). This copy's nodes are rearranged so the generic choreography (render/crews.js) can drive it:
//   breech   a group at the wedge's right end holding the demo's `wedge`; setBreech(k) slides it out to the
//            right (+X, 1.15 m), so crews.js finds the block's free edge where the hands go
//   crane    the jib, moved from the carriage to the root (y = 0 the ground) and kept over its post as the
//            carriage traverses (setTraverse moves it); rotation.y PI + az lies over the shell cart
//            (rig.craneRest follows), toward the tray it swings to the left
//   hoist    the demo's hook, on the crane at (-jib, y, 0): position.y is its height above the ground
//            (rig.hoistRange.up at the jib, .down at the cart); the rope's fall follows in update()
//   tray     fixed on the stage at the loading elevation (setTray is a no-op: it never slides)
// Anchors eye, muzzle, breech, tray (the shell's middle on the tray), shellStack (the shell on the cart, which
// rides the carriage on the right as in the demo); crew spots with roles for ROLES_HEAVY.bertha.
const CART = { x: 3.45, z: 3.0, top: 0.62 }; // the shell cart (trav frame, y above the bed top), as position.js has it
const HANG = 0.55;

export function buildBerthaGun() {
  const b = buildBertha();
  const root = b.root, P = b.pivots, A = b.anchors;
  const trav = P.traverse, elev = P.elevation, rec = P.recoil, wedge = P.wedge, mcrane = P.crane, hook = P.hook;
  const BED = b.bed, LP = b.loadStage, C = b.craneSpec, TZ = (b.trayZ.z0 + b.trayZ.z1) / 2;
  const TR = GUN.trunnion - BED, BRE = 1.62;
  root.name = 'bertha-gun';

  // ---- the breech: the wedge inside a group at its right end
  const BX = 0.62, BZ = BRE + 0.18;
  const brk = new THREE.Group();
  brk.name = 'breech';
  brk.position.set(BX, 0, BZ);
  rec.remove(wedge);
  brk.add(wedge);
  wedge.position.set(-BX, 0, -BZ);
  rec.add(brk);

  // ---- the crane: jib and hook into the root frame (the hook's height is then a height above the ground)
  const crane = new THREE.Group();
  crane.name = 'crane';
  root.add(crane);
  trav.remove(mcrane);
  crane.add(mcrane);
  mcrane.position.set(0, BED + LP, 0);
  mcrane.rotation.set(0, 0, 0);
  mcrane.remove(hook);
  crane.add(hook);
  const UP = BED + LP + C.h - 0.3;
  hook.position.set(-C.jib, UP, 0);
  hook.name = 'hoist';
  for (const k of Object.keys(b.props.hook)) b.props.hook[k].visible = false;
  crane.rotation.y = Math.PI;

  // ---- the shell cart on the carriage's right, as the demo's position has it (the crane reaches it)
  {
    const T = new Parts(vehicleMats('bunt'));
    const cx = CART.x, cz = CART.z;
    T.add('timber', box(1.0, 0.1, 1.6, cx, 0.36, cz));
    T.add('dark', box(0.9, 0.12, 0.12, cx, 0.24, cz - 0.6));
    T.add('dark', box(0.9, 0.12, 0.12, cx, 0.24, cz + 0.6));
    for (const s of [-1, 1]) for (const dz of [-0.6, 0.6]) T.add('dark', xTube(cx + s * 0.5 - 0.04, cx + s * 0.5 + 0.04, 0.16, 0.16, 12, 0.18, cz + dz));
    for (const s of [-1, 1]) T.add('timber', box(0.12, 0.14, 1.5, cx + s * 0.3, 0.48, cz));
    for (const s of [-1, 1]) T.add('steel', box(0.07, 0.06, 3.6, cx + s * 0.5, 0.03, cz));
    T.build(trav, { y0: BED });
  }

  // ---- anchors (the demo's own ones stay in b.anchors and are carried over)
  const node = (parent, name, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const e = GUN.loadEl, ce = Math.cos(e), se = Math.sin(e);
  const anchors = {
    ...A,
    muzzle: A.muzzle,
    muzzles: [A.muzzle],
    breech: node(rec, 'breech-face', 0, 0, BRE),
    // the shell's middle lying on the tray (the trough is fixed at the loading elevation about the trunnions)
    tray: node(trav, 'tray-shell', 0, TR + (-0.05) * ce - TZ * se, (-0.05) * se + TZ * ce),
    eye: node(trav, 'eye', 0, TR + 0.5, 0.4),
    shellStack: node(trav, 'shellStack', CART.x, CART.top + 0.21, CART.z),
    crew: [],
  };

  const rig = {
    kind: 'bertha', root, anchors, boxes: [], props: {},
    pivots: { traverse: trav, elevation: elev, recoil: rec, breech: brk, crane, hoist: hook, wedge },
    recoilLength: 1.25,
    loadEl: GUN.loadEl,
    breechOpen: { axis: 'x', angle: 0 },
    hoistRange: { up: UP, down: BED + CART.top + 0.21 + HANG },
    hoistHang: HANG,
    pickY: BED + CART.top + 0.21,
    craneRest: Math.PI,
    staffLen: 4.2,
    shell: { len: 1.65, rad: 0.21 },
    recoilFade: null,
    berthaModel: b, // the demo's handles: wheels, props, fall
  };
  rig.setTraverse = (az) => {
    trav.rotation.y = az;
    // the jib stays on its post (which rides the carriage), and its rest lies over the cart, which rides too
    const c = Math.cos(az), s = Math.sin(az);
    crane.position.set(C.x * c + C.z * s, 0, -C.x * s + C.z * c);
    rig.craneRest = Math.PI + az;
    rig.pickYaw = az; // the cart's shell lies along the carriage
  };
  rig.setElevation = (r) => { elev.rotation.x = r; };
  rig.setRecoil = (k) => { rec.position.z = k * rig.recoilLength; };
  rig.setBreech = (k) => { brk.position.x = BX + clamp01(k) * 1.15; };
  rig.setTray = () => {};
  rig.trayTilt = () => {};
  rig.setShell = (where, vis) => {
    if (where === 'tray') { const s = b.props.tray.schwer; s.visible = !!vis; s.position.set(0, -0.05, TZ); }
    else if (where === 'crane' || where === 'hoist') b.props.hook.schwer.visible = !!vis;
  };
  const fall = b.fall, FTOP = C.h - 0.1;
  rig.update = () => {
    fall.position.set(-C.jib, FTOP, 0);
    fall.scale.y = Math.max(0.05, BED + LP + FTOP - hook.position.y);
  };
  rig.setTraverse(0);
  rig.update();

  // hit boxes: the carriage and stage, the barrel
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  rig.boxes.push({ min: V(-2.1, 0, -1.6), max: V(2.1, 3.4, 7.4) });
  rig.boxes.push({ min: V(-0.6, BED + TR - 0.6, -GUN.muzzle), max: V(0.6, BED + TR + 0.6, 0) });
  rig.boxes.push({ min: V(CART.x - 0.6, 0, CART.z - 0.9), max: V(CART.x + 0.6, 1.3, CART.z + 0.9) });

  // crew spots (root space at zero traverse; y is where the feet stand). The men on the carriage are not
  // world-frame roles, so they ride the traverse (crews.js); the commander stands on the ground.
  const spot = (role, x, y, z, heading, pose = 'stand') => anchors.crew.push({ role, x, y, z, heading, pose });
  const S = BED + LP, E = -Math.PI / 2, W = Math.PI / 2, N = 0;
  spot('sergeant', -4.2, 0, 0.6, E, 'point');
  spot('layer', -1.66, BED, 1.42, E, 'lay'); // line: the panoramic sight and the traverse handwheel, left
  spot('elevator', 1.69, BED, 1.32, W, 'operate'); // the elevation handwheel, right
  spot('lanyard', 0.95, S, TZ + 1.35, N, 'lanyard');
  spot('loader1', -0.72, S, TZ - 0.2, E, 'carry');
  spot('loader2', 0.72, S, TZ + 0.55, W, 'carry');
  spot('rammer1', -0.35, S, b.trayZ.z1 + 0.85, N, 'ram');
  spot('rammer2', 0.35, S, b.trayZ.z1 + 0.85, N, 'ram');
  spot('kran', 1.33, S, 3.38 + 0.0, -0.98, 'operate'); // at the crane's winch on the stage
  spot('cart', 2.72, BED, CART.z, E, 'stand'); // at the shell cart: slings the shell
  spot('bagman', -1.05, S, 4.6, N, 'stand'); // the charge bags from the rack at the back of the stage
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rig;
}

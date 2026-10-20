import * as THREE from 'three';
import { buildBertha, recoilLength } from '../../../bertha/model.js';
import { GUN } from '../../../bertha/ballistics.js';
import { Parts, box, rbox, xTube, rod, V } from '../../kit.js';
import { clamp01 } from './heavy_common.js';

// The 42 cm M-Gerät "Dicke Bertha" as a gun rig for the main game's render layer (DESIGN.md "Models" and
// "WW2 mode"): an adapter over the demo's own model (src/bertha/model.js; the demo builds its own copy).
// buildBerthaGun() wears the 1914 field grey (the WW2 mode), buildBerthaGun1917() the demo's 1917 colours (the
// WW1 German mode). Its nodes are rearranged so the generic choreography (render/crews.js) can drive it:
//   breech   a group at the wedge's right end holding the demo's `wedge`; setBreech(k) slides it out to the
//            right (+X, 1.15 m), so crews.js finds the block's free edge where the hands go
//   crane    the jib, moved from the carriage to the root (y = 0 the ground) and kept over its post as the
//            carriage traverses (setTraverse moves it); its rest (rig.craneRest, a shade short of PI + az) lies
//            over the shell cart, so crews_heavy.js swings it to the tray over the back of the stage, as the
//            demo does, not over the shield
//   hoist    the demo's hook, on the crane at (-jib, y, 0): position.y is its height above the ground
//            (rig.hoistRange.up at the jib, .down at the cart); the rope's fall follows in update(), and the
//            block keeps square to the carriage (its spreader along the shell); the shell hangs the demo's
//            sling length below it, under the spreader
//   tray     the demo's tray carriage on the stage rails, trough fixed at the loading elevation:
//            setTray(k) runs it back k * trayBack (0 against the breech for loading, 1 clear of the recoil),
//            as the demo's page does; anchors.tray stays where the shell lies when it is forward
// Anchors eye, muzzle, breech, tray (the shell's middle on the tray), shellStack (the shell on the cart, which
// rides the carriage on the right as in the demo); crew spots with roles for ROLES_HEAVY.bertha.
const CART = { x: 3.45, z: 3.0, top: 0.62 }; // the shell cart (trav frame, y above the bed top), as position.js has it

export function buildBerthaGun() {
  // the 1914 finish: the plain field grey the M-Geräte wore at Liège (the demo's own copy is in the 1917 colours)
  return berthaRig('1914');
}

// The WW1 German mode's 42 cm (buildGun('bertha') on a WW1 page, models/guns.js GUN_ERA.ww1): the same rig in the
// demo's 1917 Buntfarbenanstrich (green-grey, ochre and rust-brown), as the guns stood in Flanders in 1917 and 1918.
export function buildBerthaGun1917() {
  return berthaRig('bunt');
}

function berthaRig(finish) {
  const b = buildBertha({ finish });
  const root = b.root, P = b.pivots, A = b.anchors;
  const trav = P.traverse, elev = P.elevation, rec = P.recoil, wedge = P.wedge, mcrane = P.crane, hook = P.hook;
  const BED = b.bed, LP = b.loadStage, C = b.craneSpec, TZ = (b.trayZ.z0 + b.trayZ.z1) / 2, HANG = b.hang;
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

  // ---- the shell trolley on the carriage's right, as the demo's position has it (the crane reaches it): an iron
  // frame on four flanged wheels running on a short track, two cradle blocks shaped to the shell, a push bar
  {
    const T = new Parts(b.mats);
    const cx = CART.x, cz = CART.z;
    for (const s of [-1, 1]) {
      T.add('steel', box(0.07, 0.06, 3.6, cx + s * 0.5, 0.03, cz));
      for (const z of [-1.5, -0.75, 0, 0.75, 1.5]) T.add('timber', box(1.3, 0.06, 0.16, cx, -0.01, cz + z), { tint: 0xd8d0c4 });
      T.add('iron', box(0.08, 0.14, 1.5, cx + s * 0.42, 0.3, cz));
      for (const dz of [-0.55, 0.55]) {
        T.add('iron', xTube(cx + s * 0.46, cx + s * 0.54, 0.15, 0.15, 14, 0.18, cz + dz));
        T.add('dark', xTube(cx + s * 0.54, cx + s * 0.57, 0.17, 0.17, 14, 0.18, cz + dz)); // the flange
        T.add('steel', xTube(cx + s * 0.38, cx + s * 0.6, 0.035, 0.035, 8, 0.18, cz + dz));
      }
    }
    T.add('iron', box(0.92, 0.06, 1.5, cx, 0.4, cz));
    for (const dz of [-0.5, 0.5]) {
      T.add('timber', box(0.62, 0.12, 0.22, cx, 0.49, cz + dz));
      for (const s of [-1, 1]) T.add('timber', box(0.14, 0.1, 0.22, cx + s * 0.24, 0.6, cz + dz, 0, 0, s * 0.5));
    }
    for (const s of [-1, 1]) T.add('iron', rod(V(cx + s * 0.38, 0.42, cz + 0.72), V(cx + s * 0.32, 1.0, cz + 1.05), 0.025, 6));
    T.add('iron', xTube(cx - 0.36, cx + 0.36, 0.03, 0.03, 8, 1.0, cz + 1.05));
    T.add('dark', rbox(0.2, 0.12, 0.12, 0.02, cx + 0.5, 0.42, cz - 0.78)); // the brake block
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
    // the jib stays on its post (which rides the carriage), and its rest lies over the cart, which rides too.
    // The tray's middle is 3 cm ahead of the post, so from PI the shortest turn would be over the shield and the
    // breech; resting 0.06 rad short of PI it turns the other way, behind the post over the back of the stage
    const c = Math.cos(az), s = Math.sin(az);
    crane.position.set(C.x * c + C.z * s, 0, -C.x * s + C.z * c);
    rig.craneRest = Math.PI - 0.06 + az;
    rig.pickYaw = az; // the cart's shell lies along the carriage
  };
  rig.setElevation = (r) => { elev.rotation.x = r; };
  // the demo model's variable recoil: the full stroke at low elevation, shortened as the barrel rises
  rig.setRecoil = (k) => { rec.position.z = k * recoilLength(elev.rotation.x); };
  // the wedge's crank is on its shaft only while the block is worked (shut for the shot it is off: it would foul
  // the stage beside the deck opening as the breech recoils through it), as on the demo's page
  const crank = b.wheels.wedge.node;
  rig.setBreech = (k) => { brk.position.x = BX + clamp01(k) * 1.15; crank.visible = k > 0.001; };
  rig.setTray = (k) => { b.pivots.tray.position.z = clamp01(k) * b.trayBack; };
  rig.trayTilt = () => {}; // (the trough is fixed at the loading elevation on its carriage)
  rig.setShell = (where, vis) => {
    if (where === 'tray') { const s = b.props.tray.schwer; s.visible = !!vis; s.position.set(0, -0.05, TZ); }
    else if (where === 'crane' || where === 'hoist') b.props.hook.schwer.visible = !!vis;
  };
  const fall = b.fall, FTOP = C.h - 0.1;
  rig.update = () => {
    fall.position.set(-C.jib, FTOP, 0);
    fall.scale.y = Math.max(0.05, BED + LP + FTOP - hook.position.y);
    hook.rotation.y = trav.rotation.y - crane.rotation.y; // square to the carriage, along the slung shell
  };
  rig.setTraverse(0);
  rig.setBreech(0);
  rig.setTray(1); // built with the block shut and the tray run back, as it stands for the shot
  rig.update();

  // hit boxes: the carriage and stage, the barrel
  rig.boxes.push({ min: V(-2.2, 0, -2.6), max: V(2.2, 4.8, 7.8) });
  rig.boxes.push({ min: V(-0.6, BED + TR - 0.6, -GUN.muzzle), max: V(0.6, BED + TR + 0.6, 0) });
  rig.boxes.push({ min: V(CART.x - 0.6, 0, CART.z - 0.9), max: V(CART.x + 0.6, 1.3, CART.z + 0.9) });

  // crew spots (root space at zero traverse; y is where the feet stand). The men on the carriage are not
  // world-frame roles, so they ride the traverse (crews.js); the commander stands on the ground.
  const spot = (role, x, y, z, heading, pose = 'stand') => anchors.crew.push({ role, x, y, z, heading, pose });
  const S = BED + LP, E = -Math.PI / 2, W = Math.PI / 2, N = 0;
  spot('sergeant', -4.2, 0, 0.6, E, 'point');
  spot('layer', -1.66, BED, 1.42, E, 'lay'); // line: the panoramic sight and the traverse handwheel, left
  spot('elevator', 1.69, BED, 1.32, W, 'operate'); // the elevation handwheel, right
  spot('lanyard', 2.3, BED, 4.9, W, 'lanyard'); // on the ground behind the stage's right corner, the lanyard run out to him
  // the rammers, the second loader and the bagman wait at the back of the stage either side of the tray's run, not
  // where the trough comes to rest when it is run back for the shot (z0 + trayBack to z1 + trayBack, the middle)
  spot('loader1', -0.72, S, TZ - 0.2, E, 'carry');
  spot('loader2', 0.88, S, 4.05, W, 'carry');
  spot('rammer1', -0.9, S, 3.95, N, 'ram');
  spot('rammer2', 0.88, S, 4.7, N, 'ram');
  spot('kran', 1.33, S, 3.38 + 0.0, -0.98, 'operate'); // at the crane's winch on the stage
  spot('cart', 2.72, BED, CART.z, E, 'stand'); // at the shell cart: slings the shell
  spot('bagman', -0.9, S, 4.57, N, 'stand'); // the charge bags from the rack at the back of the stage
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rig;
}

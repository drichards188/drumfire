import * as THREE from 'three';
import { V, DEG, box, xTube, yTube, rod } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, crew, L90 } from '../../t/fieldkit.js';
import { buildRocket } from './rockets.js';
import './common.js'; // (registers the German paint schemes, dgelb and feldgrau, with kit.js CAMO)

/**
 * schweres Wurfgerät 40. A light wooden frame (Holzgestell, about 52 kg; the sWG 41 the same in steel tube, 110 kg)
 * on which four 28 cm Wurfkörper Spreng lie side by side in their own wooden packing crates (Packkiste), the crates
 * doubling as the launching rails: the rocket goes out of the crate it came in (Lone Sentry, Tactical and Technical
 * Trends 7 and 8: "a wooden ramp", four projectors, 5 to 42 degrees, fired electrically at 2 s intervals; Wikipedia,
 * "28/32 cm Nebelwerfer 41": the 28 and 32 cm crates share their outside size). The rocket (rockets.js): the 280 mm
 * head on the 15 cm motor, 82 kg, about 1.19 m; the crate a skeleton of three square end frames round the round,
 * corner battens, side slats and rope handles, the head's nose standing out of the front frame.
 *
 * The frame here: a squared sill on the ground at the rear, staked, the ramp hinged to it (three beams and three
 * crossbars, a stop strip at the rear that the crates' bases bear against), and two legs under the ramp's front end
 * on foot boards; the legs set the angle (here they follow the elevation: their length is drawn to fit). Nothing
 * recoils. The firing position as the Nebelwerfer's: the slit trench 15 yards to the flank with the firing box.
 *
 * Rig (DESIGN.md "WW2 mode"): origin on the ground under the middle of the frame, front -Z. `traverse` the whole frame
 * (lifted round by the crew), `elevation` the ramp about its hinge on the sill, `recoil` and `breech` empty (setBreech
 * is a no-op). Extras:
 *   rig.setRounds(n, spent): n full crates on the frame (the last n of the firing order) and `spent` empty crates (the
 *     first `spent` of it, those already fired); spent left out keeps the last count (as far as n leaves room)
 *   rig.setLitter(i, m4 | null): loose crate i (0..3) at the matrix m4 (root space), or hidden: the spent crates the
 *     crew carry off and the pile they lie on; rig.litterRest(i, out) the pile's place for crate i
 *   rig.slotMatrix(j, out): the full or spent crate of firing-order slot j, its matrix in root space (current pose)
 *   rig.crateProp: a full crate (crate and rocket) for the crew to carry, a child of root, hidden at first
 *   rig.anchors.muzzles[0..3] the rocket noses in firing order (shell.tube indexes them), anchors.tubes[0..3] the
 *     crates' rear ends, anchors.cover [{ x, z }] the places in the slit trench (root space), anchors.pickup
 *     { x, y, z, h } where the next crate lies at the ammunition stack (root space), rig.fireOrder, rig.loadOrder
 *   rig.crate { len, w, h, rocketZ } the crate's size and the rocket's middle in it (crate space, front -Z)
 * Crew roles: firer (the firing box), layer, crate0..crate3 (the carrying party, four to a crate). buildSWG40({ scheme })
 */
const PY = 0.16, PZ = 0.6; // the ramp's hinge on the sill (root): the sill's top edge
const RL = 1.12; // the ramp's beams from the hinge forward
const BX = 0.8; // the side beams (half spread)
const CW = 0.34, CL = 1.0; // crate: square section, length
const XB = 0.15; // crossbars' top (elevation frame): the crates lie on them
const SLOTS = [-0.555, -0.185, 0.185, 0.555]; // crate i across the ramp
const CZ = -CL / 2; // the crates' middle along the ramp (their bases against the stop at z = 0)
const CY = XB + CW / 2;
const ROCKET_Z = 0.48; // the rocket's base in the crate (crate space): the motor's end just inside the rear frame
const FIRE = [0, 3, 1, 2]; // outer crates first, then the inner ones
const COVER = { x: -12.4, z: 2.4 }; // the slit trench, as the Nebelwerfer's
const LEGX = 0.74, LEGZ = -1.0, FOOTZ = PZ - 1.0 * Math.cos(30 * DEG); // legs: across, hinge along the ramp; foot (root)
const PICK = { x: 1.95, y: CW / 2, z: 2.95, h: 0.45 }; // the next crate at the stack, its nose turned toward the frame
// the spent crates, laid aside to the left (away from the stack, so the layer carrying them off never meets the party)
const PILE = (i) => ({ x: -1.62 - 0.38 * i, y: CW / 2, z: 0.15 + 0.05 * (i % 2), h: 0.04 * (i - 1.5) });

// A Packkiste (crate space: centred, its length along Z, the rocket's nose toward -Z): three square frames round the
// round (the rear one round the motor's base, one round the motor near the head, the front one round the head's
// belly), corner battens, two slats a side, rope handles a side, a stencilled band; iron straps round the front frame.
function crateParts(P) {
  const h = CW / 2, rear = CL / 2, front = -CL / 2;
  // a square frame of four boards at z, depth d, round an opening of half-width o
  const frame = (z, d, o) => {
    const w = h - o;
    P.add('wood', box(CW, w, d, 0, h - w / 2, z));
    P.add('wood', box(CW, w, d, 0, -h + w / 2, z));
    P.add('wood', box(w, CW - 2 * w, d, h - w / 2, 0, z));
    P.add('wood', box(w, CW - 2 * w, d, -h + w / 2, 0, z));
  };
  frame(rear - 0.025, 0.05, 0.1); // round the motor's base (its nozzles vent through it)
  frame(-0.02, 0.04, 0.095);
  frame(front + 0.04, 0.08, 0.143); // round the head's belly
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.add('wood', box(0.036, 0.036, CL, sx * (h - 0.018), sy * (h - 0.018), 0));
  for (const sx of [-1, 1]) {
    for (const y of [-0.07, 0.07]) P.add('wood', box(0.016, 0.07, CL - 0.12, sx * (h - 0.006), y, 0.02), { tint: 0xd8ccb0 });
    P.add('wood', box(0.018, 0.09, 0.2, sx * (h + 0.002), 0, 0.16), { tint: 0x3a3a34 }); // stencil band (contents, lot)
    // rope handles, front and rear of each side, looped through two holes
    for (const z of [-0.3, 0.3]) {
      P.add('rope', new THREE.TorusGeometry(0.05, 0.008, 5, 10, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI).translate(sx * (h + 0.01), -0.02, z));
    }
  }
  for (const z of [front + 0.01, front + 0.07]) { // iron straps round the front frame
    P.add('dark', box(CW + 0.006, 0.006, 0.02, 0, h + 0.002, z));
    P.add('dark', box(CW + 0.006, 0.006, 0.02, 0, -h - 0.002, z));
    P.add('dark', box(0.006, CW + 0.006, 0.02, h + 0.002, 0, z));
    P.add('dark', box(0.006, CW + 0.006, 0.02, -h - 0.002, 0, z));
  }
}

export function buildSWG40({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;
  const rk = buildRocket('swg40', 12);

  // ---- the ammunition stack (root, does not traverse): crates two high under a tarpaulin's edge, an opened one
  const S = rig.part();
  const CP = rig.part();
  crateParts(CP);
  const crateMeshes = CP.build(new THREE.Group(), { dirt: 0.3, y0: 0.4 });
  const stackAt = [[2.5, 0, 3.75, 0.02], [2.88, 0, 3.75, -0.03], [3.26, 0, 3.75, 0.01], [2.69, 1, 3.76, 0.04], [3.07, 1, 3.74, -0.02]];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const rocketOff = new THREE.Matrix4().makeTranslation(0, 0, ROCKET_Z - rk.length / 2);
  const stackM = stackAt.map(([x, k, z, a]) => new THREE.Matrix4().compose(_p.set(x, CW / 2 + k * CW, z), _q.setFromEuler(_e.set(0, a, 0)), _s));
  const stack = new THREE.Group();
  stack.name = 'stack';
  root.add(stack);
  const instanced = (parts, n, parent, name) => parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geometry, p.material, n);
    m.name = name;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  });
  const rocketParts = rk.parts;
  for (const m of instanced(crateMeshes, stackM.length, stack, 'stack')) { stackM.forEach((M, i) => m.setMatrixAt(i, M)); m.computeBoundingSphere(); }
  for (const m of instanced(rocketParts, stackM.length, stack, 'stack')) { stackM.forEach((M, i) => m.setMatrixAt(i, _m.copy(M).multiply(rocketOff))); m.computeBoundingSphere(); }
  // the sill the stack stands on and a tarpaulin folded over the back of it
  S.add('wood', box(1.3, 0.06, 0.12, 2.88, 0.03, 3.4));
  S.add('wood', box(1.3, 0.06, 0.12, 2.88, 0.03, 4.1));
  S.add('fabric', box(1.32, 0.02, 0.6, 2.88, CW * 2 + 0.01, 3.95), { tint: 0x7a7458 });
  S.add('fabric', box(1.32, 0.66, 0.02, 2.88, CW, 4.26, 0.05, 0, 0), { tint: 0x7a7458 });
  S.build(root, { dirt: 0.5 });

  // ---- the firing position off to the flank: slit trench, sandbags, the firing box, the cable (out of the bounds)
  const W = rig.part();
  const px = COVER.x + 0.65;
  for (let i = 0; i < 10; i++) {
    const z = COVER.z - 1.9 + i * 0.5;
    W.add('sandbag', box(0.42, 0.18, 0.5, px, 0.09, z, 0, 0, 0.04 * (i % 2 ? 1 : -1)));
    if (i % 2 === 0) W.add('sandbag', box(0.4, 0.16, 0.5, px, 0.26, z + 0.25, 0, 0, 0));
  }
  W.add('soil', box(0.9, 0.06, 5.2, COVER.x + 1.3, 0.02, COVER.z + 0.3, 0, 0, 0.08));
  W.add('sandbag', box(0.4, 0.26, 0.46, px - 0.27, 0.13, COVER.z - 0.55, 0, 0, 0.03));
  W.add('dark', box(0.22, 0.14, 0.12, px - 0.27, 0.33, COVER.z - 0.55));
  W.add('steel', box(0.04, 0.03, 0.04, px - 0.27, 0.415, COVER.z - 0.55));
  W.add('dark', xTube(px - 0.16, px - 0.1, 0.012, 0.012, 6, 0.34, COVER.z - 0.55));
  const cable = (pts, r, seg, radial) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), seg, r, radial, false);
  W.add('rubber', cable([V(-0.95, 0.12, PZ + 0.05), V(-1.2, 0.015, PZ + 0.5), V(-1.6, 0.015, 1.5), V(-3.2, 0.015, 1.85), V(-5.5, 0.015, 1.4), V(-8, 0.015, 2.05),
    V(-10.2, 0.015, 1.7), V(px - 0.02, 0.03, COVER.z - 0.55), V(px - 0.1, 0.34, COVER.z - 0.55)], 0.008, 120, 4));
  const remote = new THREE.Group();
  remote.name = 'remote';
  root.add(remote);
  W.build(remote, { dirt: 0.2 });

  // ---- the frame on the ground (traverse): the sill with its stakes and hinge straps, the legs' foot boards
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  T.add('wood', box(1.98, 0.14, 0.16, 0, 0.07, PZ + 0.02));
  for (const s of [-1, 1]) {
    T.add('wood', box(0.05, 0.3, 0.05, s * 1.04, 0.1, PZ + 0.13, 0.12, 0, 0)); // stakes behind the sill's ends
    T.add('wood', box(0.05, 0.3, 0.05, s * 0.55, 0.1, PZ + 0.13, 0.1, 0, 0));
    T.add('dark', box(0.06, 0.06, 0.06, s * 1.04, 0.24, PZ + 0.11)); // their heads, battered
    T.add('wood', box(0.3, 0.035, 0.42, s * LEGX, 0.018, FOOTZ)); // a leg's foot board
    T.add('wood', box(0.32, 0.03, 0.06, s * LEGX, 0.045, FOOTZ - 0.14)); // its cleats
    T.add('wood', box(0.32, 0.03, 0.06, s * LEGX, 0.045, FOOTZ + 0.14));
  }
  for (const x of [-BX, 0, BX]) {
    T.add('dark', box(0.11, 0.008, 0.2, x, 0.144, PZ + 0.03)); // the hinge strap on the sill
    T.add('dark', xTube(x - 0.06, x + 0.06, 0.016, 0.016, 10, PY, PZ)); // its knuckle
  }
  T.add('steel', xTube(-BX - 0.08, BX + 0.08, 0.008, 0.008, 6, PY, PZ)); // the hinge rod through all three
  T.build(trav, { dirt: 0.6 });

  // ---- the ramp (elevation): three beams, three crossbars, the stop strip, the bolts, an elevation scale
  const el = pivotAt(rig, trav, 'elevation', 0, PY, PZ);
  const E = rig.part();
  for (const x of [-BX, 0, BX]) {
    E.add('wood', box(0.07, 0.09, RL + 0.08, x, 0.045, -RL / 2 + 0.04));
    E.add('dark', box(0.08, 0.1, 0.04, x, 0.045, 0.06)); // iron shoe on the beam's heel, the hinge's other half
  }
  for (const z of [-0.06, -0.55, LEGZ]) {
    E.add('wood', box(2 * BX + 0.12, 0.06, 0.09, 0, XB - 0.03, z));
    for (const x of [-BX, 0, BX]) E.add('dark', yTube(XB - 0.003, XB + 0.004, 0.012, 0.012, 6, x, z)); // bolt heads
  }
  E.add('wood', box(2 * BX + 0.12, 0.06, 0.05, 0, XB + 0.03, 0.025), { tint: 0xd8ccb0 }); // the stop strip at the rear
  // guide battens between the crates on the crossbars (each crate lies in its lane)
  for (let i = 0; i <= 4; i++) {
    const x = i === 0 ? SLOTS[0] - CW / 2 - 0.02 : i === 4 ? SLOTS[3] + CW / 2 + 0.02 : (SLOTS[i - 1] + SLOTS[i]) / 2;
    E.add('wood', box(0.025, 0.04, CL - 0.1, x, XB + 0.02, CZ + 0.03), { tint: 0xe0d4b8 });
  }
  // a diagonal brace under the ramp (the frame must not rack when the outer crates fire)
  E.add('wood', rod(V(-BX, 0.02, -0.1), V(BX, 0.02, LEGZ + 0.05), 0.022, 6));
  // the elevation scale on the left beam, read against a pointer on the left leg's head
  E.add('white', box(0.006, 0.06, 0.16, -BX - 0.038, 0.05, LEGZ + 0.12));
  for (let i = 0; i < 5; i++) E.add('dark', box(0.008, 0.003 + (i % 2) * 0.01, 0.004, -BX - 0.04, 0.05, LEGZ + 0.05 + i * 0.035));
  E.build(el, { dirt: 0.25, y0: 0.5 });

  // the legs: one group under the front crossbar (both legs and the brace between them, drawn a metre long down -Y),
  // turned and stretched each time the world matrices are made so their feet stay on the foot boards
  const legs = new THREE.Group();
  legs.name = 'legs';
  legs.position.set(0, 0, LEGZ);
  el.add(legs);
  const G = rig.part();
  for (const s of [-1, 1]) {
    G.add('wood', box(0.075, 1, 0.075, s * LEGX, -0.5, 0));
    G.add('dark', box(0.085, 0.06, 0.085, s * LEGX, -0.04, 0)); // the iron cap and hinge pin at the head
    G.add('dark', xTube(s * LEGX - 0.06, s * LEGX + 0.06, 0.012, 0.012, 6, -0.03, 0));
  }
  G.add('wood', box(2 * LEGX, 0.05, 0.035, 0, -0.55, 0.04)); // the brace across
  G.build(legs, { dirt: 0.3, y0: 0.3 });
  legs.updateMatrixWorld = function (force) {
    const e = el.rotation.x, ce = Math.cos(e), se = Math.sin(e);
    // the hinge in the traverse frame: the pivot plus (0, 0, LEGZ) turned by e
    const hy = PY - LEGZ * se, hz = PZ + LEGZ * ce;
    const dy = 0.045 - hy, dz = FOOTZ - hz, len = Math.hypot(dy, dz);
    // (0, -1, 0) turned by a about X is (0, -cos a, -sin a): toward the foot
    this.rotation.x = Math.atan2(-dz, -dy) - e;
    this.scale.y = Math.max(0.05, len);
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };

  // ---- the crates on the ramp (full and spent), the loose ones, the carried one
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  pivotAt(rig, rc, 'breech', 0, CY, 0);
  const slotM = SLOTS.map((x) => new THREE.Matrix4().makeTranslation(x, CY, CZ));
  const slotR = slotM.map((m) => m.clone().multiply(rocketOff));
  const gone = new THREE.Matrix4().makeScale(0, 0, 0);
  const crates = instanced(crateMeshes, 4, rc, 'shell-crate'); // full and spent alike
  const rockets = instanced(rocketParts, 4, rc, 'shell-rocket');
  const litter = instanced(crateMeshes, 4, root, 'litter');
  for (const m of [...crates, ...rockets, ...litter]) for (let i = 0; i < 4; i++) m.setMatrixAt(i, gone);
  rig.fireOrder = FIRE.slice();
  rig.loadOrder = FIRE.slice().reverse();
  rig.rounds = -1; rig.spent = 0;
  rig.setRounds = (n, spent) => {
    n = Math.max(0, Math.min(4, n | 0));
    spent = Math.max(0, Math.min(4 - n, spent == null ? rig.spent : spent | 0));
    if (n === rig.rounds && spent === rig.spent) return;
    rig.rounds = n; rig.spent = spent;
    for (let j = 0; j < 4; j++) {
      const i = FIRE[j], full = j >= 4 - n, crate = full || j < spent;
      for (const m of crates) m.setMatrixAt(i, crate ? slotM[i] : gone);
      for (const m of rockets) m.setMatrixAt(i, full ? slotR[i] : gone);
    }
    for (const m of [...crates, ...rockets]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  };
  rig.setRounds(4, 0);
  const shown = [false, false, false, false];
  rig.setLitter = (i, m4) => {
    if (!m4 && !shown[i]) return;
    shown[i] = !!m4;
    for (const m of litter) { m.setMatrixAt(i, m4 ?? gone); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  };
  rig.litterRest = (i, out = new THREE.Matrix4()) => {
    const p = PILE(i);
    return out.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(0, p.h, 0)), _s);
  };
  rig.slotMatrix = (j, out = new THREE.Matrix4()) => {
    rc.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, false);
    return out.copy(root.matrixWorld).invert().multiply(rc.matrixWorld).multiply(slotM[FIRE[j]]);
  };
  // the crate the crew carry: crate and rocket as plain meshes sharing the instanced geometry, YXZ (heading, pitch)
  const prop = new THREE.Group();
  prop.name = 'shell-crateProp';
  prop.rotation.order = 'YXZ';
  for (const p of crateMeshes) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; prop.add(m); }
  for (const p of rocketParts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.position.z = ROCKET_Z - rk.length / 2;
    m.castShadow = true;
    prop.add(m);
  }
  prop.visible = false;
  root.add(prop);
  rig.crateProp = prop;
  rig.crate = { len: CL, w: CW, h: CW, rocketZ: ROCKET_Z - rk.length / 2 };
  rig.setBreech = () => {};
  rig.setShell = () => {};
  rig.recoilLength = 0;

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 1.25, 1.7);
  rig.anchors.muzzle = node(el, 'muzzle', 0, CY, CZ + ROCKET_Z - rk.length);
  rig.anchors.breech = node(el, 'breech', 0, CY, 0);
  rig.anchors.tray = node(el, 'tray', 0, CY, 0.2);
  rig.anchors.shellStack = node(root, 'shellStack', PICK.x, 0.1, PICK.z);
  const muzzles = FIRE.map((i) => node(el, 'muzzle' + i, SLOTS[i], CY, CZ + ROCKET_Z - rk.length));
  rig.anchors.tubes = FIRE.map((i) => node(el, 'tube' + i, SLOTS[i], CY, 0.0));
  rig.anchors.cover = [0, 1, 2, 3, 4, 5].map((i) => ({ x: COVER.x - 0.1 * (i % 2), z: COVER.z - 1.4 + i * 0.75 }));
  rig.anchors.pickup = { ...PICK };
  rig.loadEl = 30 * DEG;
  rig.setElevation(rig.loadEl);

  // the carrying party waits round the next crate at the stack, as they will lift it (render/de/swg40.js FORM)
  const ch = Math.cos(PICK.h), sh = Math.sin(PICK.h);
  const at = (r, f) => ({ x: PICK.x + r * ch - f * sh, z: PICK.z - r * sh - f * ch });
  crew(rig, 'firer', COVER.x - 0.06, COVER.z - 0.55, L90, 'crouch');
  crew(rig, 'layer', -1.15, 0.95, -0.9, 'stand');
  [[-0.45, 0.12], [0.45, 0.12], [-0.16, -0.82], [0.16, -0.82]].forEach(([r, f], i) => { const p = at(r, f); crew(rig, 'crate' + i, p.x, p.z, PICK.h, 'stand'); });

  hb(rig, -0.95, 0, -1.3, 0.95, 1.2, 0.75);
  // (finishRig sizes rig.shell from shells.js: the 15 cm's stands in until it knows 'swg40', then the real one)
  const out = finishRig(rig, 'swg40', 'nbw41');
  out.shell = { len: rk.length, rad: rk.radius };
  out.anchors.muzzles = muzzles;
  remote.traverse((o) => { if (o.isMesh) o.geometry.boundingBox = new THREE.Box3(); });
  return out;
}

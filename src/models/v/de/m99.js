import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sphere, sideProfile, gearArc, zLathe, rivetRow, rivetPoly, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, L90, R90, TAU } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * 21 cm Mörser 99 (Krupp, about 1900), the old heavy mortar of the Fußartillerie, in its firing position as a 1916
 * photograph shows it (lovettartillery.com, "21cm Mörser in a firing position with the small wheel set"; a second
 * one of the carriage in transport) and as the Wikipedia articles (de, en) describe it: a short fat barrel of
 * 2.11 m (L/10) with a horizontal sliding wedge, held by its trunnions in a rigid U-shaped carriage of two tall
 * riveted cheek plates, high at the trunnions and falling in a long straight slope to the tail, which stands on the
 * planks as a deep transom plate; no recoil system at all. For firing the transport axle came off and a small iron
 * wheel was fitted on a stub axle at the front of each cheek; two wooden ramps (Rücklaufkeile) lay behind them on the
 * wooden firing platform (Bettung). At the shot the wheels ran up the ramps and the gun rolled back down into
 * position by its own weight (en.wikipedia "21 cm Mörser 99"; the Versuchmörser 06 the same), never quite on its old
 * line: with no traversing gear the crew levered it round with handspikes and laid it afresh by the aiming posts,
 * so the old mortar fired a round in three minutes (the game about one a minute). 4,820 kg in action. Elevation
 * +6 to +70 degrees (the game: 10 to 65). Proportions: the photograph against the men beside the gun (trunnions at
 * about 1.3 m, the small wheel about 0.72 m across, the carriage about 3.3 m from the wheel to the tail); the rest
 * [E] estimate. Paint: 'bunt' (the 1917 Buntfarbenanstrich) or 'feldgrau'.
 *
 * Rig (DESIGN.md "Models"): origin on the ground under the wheels' axis, front -Z. The plank platform (PLAT high) is
 * fixed in the root and does not turn. `traverse` turns the carriage and its ramps about the wheels' axis. `recoil`
 * is the WHOLE carriage: setRecoil(k) runs it back RL m along +Z and up the ramps (the front rises RISE, the carriage
 * pivoting about its tail on the planks) and rolls the wheels; `elevation` at the trunnions, inside it; `breech` the
 * wedge (setBreech slides it +X); `loadTray` the Ladeschale hooked onto the ring (as the Mörser 16's).
 * The crew module (render/ww1/m99.js, render/ramp_drill.js) poses the run up the ramps and the roll back down by `rig.holdRecoil(k)`, and
 * the carriage swung off its line by the roll and levered back in the 'relay' step by `rig.holdLay(r)` (an offset on
 * the traverse); setRecoil and setTraverse from the render layer give way to those values while they are fresh (a few
 * frames, so the crew's every-third-frame updates at middle distance hold them too), and are obeyed as usual when no
 * crew drives the gun (the hangar, the model viewer, a far gun: render/guns.js's own run out, GUNS.m99.runout).
 * Props for the drill: the two handspikes in the wheels (rig.setSpikes(on)), their grips anchors in the carriage
 * (rig.m99.anchors); rig.setRope (four rope segments) is kept but no longer used.
 * buildM99({ scheme: 'bunt' | 'feldgrau' })
 */
const PLAT = 0.08; // the platform's top
const WR = 0.36, WX = 0.64; // the small iron wheels: radius, centre plane
const AXY = PLAT + WR; // their axis at rest (z = 0)
const TR = { y: 1.3, z: 0.22 }; // trunnion axis in root space
const MZ = -1.02, BR = 1.09, RING0 = 0.66; // muzzle, breech face, front of the ring (along the bore from the trunnions)
const RG = { w: 0.29, top: 0.29, bot: -0.29, slot: 0.15 }; // breech ring half width, top, bottom, the wedge's slot
const CX = 0.4, CT = 0.035; // the cheeks' inner face, their thickness
const TAILZ = 3.25; // where the tail stands on the planks
const RL = 1.4, RISE = 0.3; // the run back and the rise up the ramps at full run back
const RAMP = { len: 1.55, h: 0.336, top: 0.15, w: 0.3 }; // the ramps: the slope's length and height, a flat on top
const PF = { x: 3.8, z0: -1.9, z1: 5.7 }; // the plank platform: half width, front and rear
const ARC = { r0: 0.55, r1: 0.62, a0: 50 * DEG, a1: 110 * DEG, x: 0.335 }; // the elevating arcs under the barrel
const RIV = 0xd0c8b4;

// the cheek in side view (z, y), root space: tall round the trunnions, the long slope to the tail, the bottom edge
// rising forward from the tail to the stub axle
const CHEEK = [[-0.62, 0.36], [-0.62, 0.92], [-0.42, 1.2], [-0.12, 1.47], [0.5, 1.47], [0.7, 1.36], [3.02, 0.8], [TAILZ, 0.72],
  [TAILZ, PLAT + 0.01], [2.4, 0.16], [1.0, 0.24], [0.4, 0.27]];
const topY = (z) => z <= 0.7 ? 1.36 : 1.36 + (z - 0.7) * (0.8 - 1.36) / (3.02 - 0.7);

export const M99 = { PLAT, WR, WX, AXY, TR, TAILZ, RL, RISE, RAMP };

export function buildM99({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  rig.scheme = scheme;
  const { root } = rig;
  const sh = buildShell('m99');

  // ---------------------------------------------------------------- the platform (fixed)
  const F = rig.part();
  platform(F);
  F.build(root, { dirt: 0.3 });

  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  // ---------------------------------------------------------------- the ramps (turn with the carriage)
  const RP = rig.part();
  for (const s of [-1, 1]) ramp(RP, s * WX);
  RP.build(trav, { dirt: 0.4 });

  // ---------------------------------------------------------------- the carriage (recoil: the whole of it)
  const rc = pivotAt(rig, trav, 'recoil', 0, PLAT, TAILZ);
  const cf = node(rc, 'carriage', 0, -PLAT, -TAILZ); // root coordinates inside the moving carriage
  const C = rig.part();
  carriage(C);
  C.build(cf, { dirt: 0.5 });
  // the wheels on their stub axles (roll as the carriage runs back)
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = node(cf, s < 0 ? 'wheelL' : 'wheelR', s * WX, AXY, 0);
    const W = rig.part();
    ironWheel(W, s);
    W.build(w, { dirt: 0.6, y0: AXY });
    wheels.push(w);
  }

  // ---------------------------------------------------------------- the barrel (elevation)
  const el = pivotAt(rig, cf, 'elevation', 0, TR.y, TR.z);
  const B = rig.part();
  barrelParts(B);
  B.build(el, { dirt: 0.15, y0: TR.y });

  // ---- the wedge
  const fz = RING0 + 0.13, bl = BR - fz, bz = (BR + fz) / 2, bw = RG.w * 2 - 0.12;
  const br = pivotAt(rig, el, 'breech', 0, 0, bz);
  const K = rig.part();
  K.add('camo', box(bw, RG.slot * 2 - 0.006, bl - 0.004, 0.06, 0, 0));
  K.add('steel', zTube(bl / 2 - 0.002, bl / 2 + 0.025, 0.035, 0.035, 12, 0, 0)); // firing lock
  K.add('dark', box(0.08, 0.08, 0.05, -0.1, 0.03, bl / 2 + 0.02));
  K.add('steel', rod(V(-0.1, 0.05, bl / 2 + 0.04), V(-0.12, 0.28, bl / 2 + 0.08), 0.02, 6)); // the crank handle
  K.add('steel', rod(V(-0.12, 0.28, bl / 2 + 0.08), V(-0.21, 0.31, bl / 2 + 0.14), 0.02, 6));
  K.add('dark', sphere(0.03, -0.21, 0.31, bl / 2 + 0.14, 1.3, 1, 1, 8));
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, bw - 0.04);
  const block = rig.setBreech;
  rig.setBreech = (k) => { block(k); rig.setTray?.(1 - Math.min(1, Math.max(0, (k - 0.75) / 0.25))); };

  // ---- the loading tray (Ladeschale) hooked onto the ring's slot while the round goes in (the Mörser 16's)
  rig.loadEl = 5 * DEG;
  const sr = sh.radius, yb = -RG.slot;
  const tp = pivotAt(rig, el, 'loadTray', 0, yb, BR - 0.05);
  const R = rig.part(), tw = sr + 0.03, tlen = sh.length * 0.85 + 0.12, fy = -sr - yb, z0 = 0.05;
  R.add('camo', box(tw * 2, 0.014, tlen, 0, fy - 0.007, z0 + tlen / 2));
  R.add('dark', box(tw * 2 - 0.04, 0.012, z0 + 0.012, 0, 0.006, (z0 + 0.012) / 2));
  R.add('dark', box(tw * 2 - 0.04, Math.max(0.02, fy), 0.014, 0, fy / 2, z0 + 0.007));
  for (const z of [z0 + tlen * 0.35, z0 + tlen - 0.06]) R.add('dark', box(tw * 2 - 0.02, 0.03, 0.04, 0, fy - 0.029, z));
  for (const s of [-1, 1]) {
    R.add('camo', box(0.014, 0.08, tlen, s * tw, fy + 0.03, z0 + tlen / 2, 0, 0, s * -0.35));
    R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tlen * 0.3), V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.32), 0.012, 5));
    R.add('steel', rod(V(s * (tw + 0.02), fy + 0.01, z0 + tlen * 0.7), V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.68), 0.012, 5));
    R.add('steel', rod(V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.32), V(s * (tw + 0.08), fy - 0.03, z0 + tlen * 0.68), 0.012, 5));
  }
  R.build(tp, { dirt: 0.05, y0: TR.y });
  const TIP = 0.6;
  let trayK = 1;
  const placeTray = () => {
    const on = trayK < 0.98 && Math.abs(el.rotation.x - rig.loadEl) < 0.01;
    tp.visible = on;
    tp.rotation.x = on ? -TIP * trayK : 0;
    tp.scale.setScalar(on ? 1 : 1e-3);
  };
  rig.setTray = (k) => { trayK = Math.min(1, Math.max(0, k)); placeTray(); };
  rig.setTray(1);
  rig.setElevation = (r) => { el.rotation.x = r; placeTray(); };

  // ---------------------------------------------------------------- the run back up the ramps
  // k 0..1 of the run back: the carriage goes back k * RL along the planks, its front rises up the ramps (the wheels
  // climb RISE over the run) and it tips about its tail; the wheels roll.
  rig.recoilLength = RL;
  let frame = 0, holdV = null, holdAt = -99;
  const pose = (k) => {
    k = Math.min(1, Math.max(0, k));
    const d = k * RL, h = RISE * k;
    rc.position.z = TAILZ + d;
    rc.rotation.x = Math.asin(h / TAILZ);
    for (const w of wheels) w.rotation.x = d / WR - rc.rotation.x;
    rig.recoilK = k;
  };
  rig.setRecoil = (k) => pose(holdV != null && frame - holdAt <= 4 ? holdV : k);
  // the crew module's hold (render/ww1/m99.js): null lets the render layer's value through again
  rig.holdRecoil = (k) => { holdV = k; holdAt = frame; if (k != null) pose(k); };
  // the line: the render layer's traverse plus the crew's offset (the gun come back off its line, levered round)
  let az = 0, layV = 0, layAt = -99;
  const turnTo = () => { trav.rotation.y = az + (frame - layAt <= 4 ? layV : 0); };
  rig.setTraverse = (r) => { az = r; turnTo(); };
  rig.holdLay = (r) => { layV = r; layAt = frame; turnTo(); };
  rig.update = () => { frame++; placeTray(); };
  rig.recoilK = 0;

  // ---------------------------------------------------------------- the drill's props: ropes and handspikes
  const hemp = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 1 });
  const ropeGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 6).translate(0, 0.5, 0);
  const ropes = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ropeGeo, hemp);
    m.name = 'rope';
    m.visible = false;
    m.castShadow = true;
    root.add(m);
    ropes.push(m);
  }
  const _y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
  // segment i from a to b (root space); a null a hides it
  rig.setRope = (i, a, b) => {
    const m = ropes[i];
    if (!m) return;
    if (!a) { m.visible = false; return; }
    _d.copy(b).sub(a);
    const len = Math.max(0.01, _d.length());
    m.position.copy(a);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(_y, _d.multiplyScalar(1 / len));
    m.visible = true;
  };
  const spikes = node(cf, 'handspikes', 0, 0, 0);
  const H = rig.part();
  const SPK = [];
  for (const s of [-1, 1]) {
    // a 1.7 m ash handspike: its iron-shod point in the wheel between two spokes behind the hub, the butt back
    // and out over the man's hands (he bears on it to lever the wheel, and the gun with it, round onto its line)
    const a = V(s * (WX - 0.02), AXY + 0.12, 0.18), b = V(s * (WX + 0.42), AXY + 0.62, 1.68);
    H.add('wood', rod(a, b, 0.032, 7));
    H.add('iron', rod(a, a.clone().lerp(b, 0.09), 0.036, 7));
    SPK.push({ s, a, b });
  }
  H.build(spikes, { dirt: 0.2 });
  spikes.visible = false;
  rig.setSpikes = (on) => { spikes.visible = !!on; };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 2.2, 1.2);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, 0, BR + sh.length / 2 + 0.06);
  // the rounds lie on the planks on the right behind the wheel, outside the carriage's swing; the cartridges in their
  // baskets on the left
  rig.anchors.shellStack = node(root, 'shellStack', 3.3, PLAT + sh.radius + 0.02, 1.6);
  trayShells(rig, node(tp, 'shell-tray', 0, -yb - sr - 0.02, z0 + 0.04), 'm99');
  rig.slideMats = ['camo', 'steel', 'char', 'dark'];
  // the drill's places (render/ww1/m99.js): the ropes' hooks on the cheeks' fronts, the handspikes' butts
  const A = {
    hookL: node(cf, 'rope-hook-l', -(CX + CT + 0.03), 0.62, -0.66), hookR: node(cf, 'rope-hook-r', CX + CT + 0.03, 0.62, -0.66),
    spikeL: node(cf, 'spike-grip-l', SPK[0].b.x - 0.02, SPK[0].b.y - 0.04, SPK[0].b.z - 0.12),
    spikeR: node(cf, 'spike-grip-r', SPK[1].b.x + 0.02, SPK[1].b.y - 0.04, SPK[1].b.z - 0.12),
    spikeL2: node(cf, 'spike-grip-l2', SPK[0].a.x + (SPK[0].b.x - SPK[0].a.x) * 0.84, SPK[0].a.y + (SPK[0].b.y - SPK[0].a.y) * 0.84, SPK[0].a.z + (SPK[0].b.z - SPK[0].a.z) * 0.84),
    spikeR2: node(cf, 'spike-grip-r2', SPK[1].a.x + (SPK[1].b.x - SPK[1].a.x) * 0.84, SPK[1].a.y + (SPK[1].b.y - SPK[1].a.y) * 0.84, SPK[1].a.z + (SPK[1].b.z - SPK[1].a.z) * 0.84),
  };
  // a handspike's butt grip (side -1 left, +1 right) in the traverse frame with the carriage at k of its run back,
  // worked out as setRecoil poses it (the crew's walks to and from it are planned before the carriage gets there)
  const g0 = A.spikeR.position;
  const gripAt = (side, k, out) => {
    k = Math.min(1, Math.max(0, k));
    const a = Math.asin((RISE * k) / TAILZ), c = Math.cos(a), s = Math.sin(a), y = g0.y - PLAT, z = g0.z - TAILZ;
    out.x = side * g0.x; out.y = PLAT + y * c - z * s; out.z = TAILZ + k * RL + y * s + z * c;
    return out;
  };
  rig.m99 = rig.ramp = { ...M99, anchors: A, gripAt }; // (rig.ramp: the shared ramp drill, render/ramp_drill.js)

  // The detachment of ten (research.js DETACHMENT, an estimate): the Mörser 16's drill at the breech (two carry the
  // shell to the tray between them, two ram, the charge from the baskets), the layer at the sight on the left, a man
  // at the elevating handwheel on the right of the trail, the lanyard man off the right. Nobody stands behind the
  // tail or within its swing: the carriage runs 1.4 m back up the ramps at every shot. The rammers wait clear of it
  // and the haul is done from in front (render/ww1/m99.js).
  const y = PLAT;
  crew(rig, 'officer', -2.8, -1.4, L90, 'point', y);
  crew(rig, 'layer', -1.25, 0.9, L90, 'lay', y); // at the sight and the elevating handwheel
  crew(rig, 'lanyard', 2.0, 2.7, R90, 'lanyard', y); // works the wedge and fires
  crew(rig, 'elevator', 2.3, 4.2, R90, 'operate', y); // levers the tail round for line
  crew(rig, 'loader1', 2.6, 2.4, 0, 'carry', y);
  crew(rig, 'loader2', 2.6, 3.2, 0, 'carry', y);
  crew(rig, 'rammer1', -0.55, 5.0, 0, 'ram', y);
  crew(rig, 'rammer2', 0.55, 5.0, 0, 'ram', y);
  crew(rig, 'ammo1', -3.2, 2.0, L90, 'stand', y);
  crew(rig, 'ammo2', -3.2, 0.9, L90, 'carry', y);

  hb(rig, -0.95, 0, -0.8, 0.95, 1.9, 3.4);
  hb(rig, -PF.x, 0, PF.z0, PF.x, PLAT, PF.z1);
  return finishRig(rig, 'm99', 'm99');
}

// ---------------------------------------------------------------- the platform
// Heavy planks laid across on five sleepers along it, spiked down; the sleepers' ends show at front and rear; an
// iron eye at the front for the carriage's chain; a few planks a shade lighter (renewed). Wicker charge baskets on
// the left.
function platform(P) {
  const n = Math.round((PF.z1 - PF.z0) / 0.26);
  const dz = (PF.z1 - PF.z0) / n;
  for (let i = 0; i < n; i++) {
    const z = PF.z0 + (i + 0.5) * dz, j = Math.sin(i * 12.9898) * 0.5 + 0.5;
    P.add('wood', box(PF.x * 2 + 0.06 * (j - 0.5), 0.07, dz - 0.012, 0.03 * (j - 0.5), PLAT - 0.035, z), { tint: [0xffffff, 0xe8dcc8, 0xd2c6b2, 0xf4ecdc][i % 4] });
    for (const x of [-PF.x + 0.15, -1.9, 0, 1.9, PF.x - 0.15]) P.add('dark', yTube(PLAT - 0.002, PLAT + 0.006, 0.013, 0.013, 5, x + (i % 2) * 0.04, z));
  }
  for (const x of [-PF.x + 0.15, -1.9, 0, 1.9, PF.x - 0.15]) P.add('wood', box(0.22, 0.12, PF.z1 - PF.z0 + 0.2, x, PLAT - 0.13, (PF.z0 + PF.z1) / 2), { tint: 0xb4a890 });
  // the iron eye ahead of the carriage
  P.add('iron', box(0.3, 0.02, 0.2, 0, PLAT + 0.01, -1.3));
  P.add('iron', new THREE.TorusGeometry(0.06, 0.016, 6, 12).translate(0, PLAT + 0.07, -1.3));
  // the charge baskets on the right
  for (const [x, z] of [[-3.6, 0.15], [-3.58, -0.22], [-3.24, -0.3]]) {
    P.add('wicker', yTube(PLAT, PLAT + 0.48, 0.15, 0.16, 12, x, z));
    P.add('dark', yTube(PLAT + 0.48, PLAT + 0.5, 0.16, 0.16, 12, x, z));
  }
}

// ---------------------------------------------------------------- a ramp (Rücklaufkeil) behind a wheel
// Built up of planks, the slope faced with an iron strap the tyre runs on, a chock across its top end.
function ramp(P, x) {
  const L = RAMP.len, h = RAMP.h, t = RAMP.top, w = RAMP.w;
  P.add('wood', sideProfile([[0, PLAT], [L, PLAT + h], [L + t, PLAT + h], [L + t, PLAT]], w).translate(x, 0, 0), { tint: 0xe0d4be });
  // plank seams on the sides
  for (let i = 1; i < 4; i++) {
    const yy = PLAT + (h * i) / 4;
    for (const s of [-1, 1]) P.add('char', box(0.004, 0.008, L + t - (L * i) / 4, x + s * (w / 2 + 0.001), yy, (L * i) / 4 + (L + t - (L * i) / 4) / 2));
  }
  const sl = Math.atan2(h, L), len = Math.hypot(L, h);
  P.add('iron', box(w * 0.8, 0.012, len, x, PLAT + h / 2 + 0.006, L / 2, -sl));
  P.add('iron', box(w * 0.8, 0.012, t, x, PLAT + h + 0.006, L + t / 2));
  P.add('wood', box(w + 0.04, 0.16, 0.12, x, PLAT + h + 0.08, L + t - 0.06), { tint: 0xc8bca4 });
  // the iron toe plate it starts from, spiked to the platform
  P.add('iron', box(w, 0.012, 0.18, x, PLAT + 0.006, -0.06));
  for (const s of [-1, 1]) P.add('dark', yTube(PLAT, PLAT + 0.02, 0.014, 0.014, 5, x + s * w * 0.35, -0.1));
}

// ---------------------------------------------------------------- the carriage
function carriage(P) {
  for (const s of [-1, 1]) {
    const xo = s * (CX + CT / 2);
    P.add('camo', sideProfile(CHEEK, CT).translate(xo, 0, 0));
    P.add('camo', rivetPoly(CHEEK, (z, y) => V(s * (CX + CT + 0.001), y, z), 0.035, 0.085, V(s, 0, 0), 0.012), { tint: RIV });
    P.add('camo', rivetPoly(CHEEK, (z, y) => V(s * (CX - 0.001), y, z), 0.035, 0.085, V(-s, 0, 0), 0.012), { tint: RIV });
    // the angle iron flanged out along the top edge, from the front over the trunnions and down the slope
    for (let i = 0; i < 6; i++) {
      const [z0, y0] = CHEEK[i], [z1, y1] = CHEEK[i + 1], l = Math.hypot(z1 - z0, y1 - y0);
      P.add('camo', box(0.1, 0.025, l + 0.02, s * (CX + CT + 0.03), (y0 + y1) / 2 - 0.012, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    // and along the bottom edge
    for (let i = 8; i < CHEEK.length; i++) {
      const [z0, y0] = CHEEK[i], [z1, y1] = CHEEK[(i + 1) % CHEEK.length], l = Math.hypot(z1 - z0, y1 - y0);
      P.add('camo', box(0.08, 0.022, l + 0.02, s * (CX + CT + 0.025), (y0 + y1) / 2 + 0.011, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    // the stiffening angle irons across the cheek's outside (the photograph's riveted ribs)
    P.add('camo', box(0.035, 1.12, 0.06, s * (CX + CT + 0.017), 0.88, -0.36, 0.08));
    P.add('camo', box(0.035, 0.9, 0.06, s * (CX + CT + 0.017), 0.78, 1.1, -0.42));
    P.add('camo', box(0.035, 0.62, 0.06, s * (CX + CT + 0.017), 0.52, 2.15, -0.5));
    // the trunnion's bearing boss and its cap, bolted
    P.add('camo', xTube(s * (CX + CT), s * (CX + CT + 0.07), 0.17, 0.16, 22, TR.y, TR.z));
    P.add('steel', xTube(s * (CX + CT + 0.07), s * (CX + CT + 0.085), 0.08, 0.08, 14, TR.y, TR.z));
    P.add('camo', box(0.05, 0.12, 0.42, s * (CX + CT + 0.03), TR.y + 0.2, TR.z));
    for (let i = 0; i < 8; i++) {
      const b = (i / 8) * TAU;
      P.add('steel', xTube(s * (CX + CT + 0.07), s * (CX + CT + 0.09), 0.017, 0.017, 6, TR.y + Math.sin(b) * 0.125, TR.z + Math.cos(b) * 0.125));
    }
    // the stub axle for the small wheel through a boss low at the front
    P.add('camo', xTube(s * (CX + CT), s * (CX + CT + 0.05), 0.13, 0.12, 18, AXY, 0));
    P.add('steel', xTube(s * (CX - 0.02), s * (WX + 0.1), 0.055, 0.055, 12, AXY, 0));
    // the eyes for the handspikes along the tail (levering it round to lay for line)
    for (const z of [2.55, 3.05]) {
      const yy = topY(z) - 0.2;
      P.add('dark', new THREE.TorusGeometry(0.05, 0.014, 5, 10).rotateY(Math.PI / 2).translate(s * (CX + CT + 0.04), yy, z));
      P.add('dark', box(0.03, 0.05, 0.12, s * (CX + CT + 0.012), yy, z));
    }
    // the rope hooks on the cheek's front
    P.add('dark', box(0.05, 0.08, 0.08, s * (CX + CT + 0.025), 0.62, -0.6));
    P.add('steel', new THREE.TorusGeometry(0.035, 0.012, 5, 10).rotateY(Math.PI / 2).translate(s * (CX + CT + 0.03), 0.62, -0.68));
  }
  // the transoms: across the front (bolted, with the chain's hook under it), a low one in the middle clear of the
  // breech's path at high elevation, the deep tail plate standing on the planks
  P.add('camo', box(CX * 2, 0.5, 0.035, 0, 0.66, -0.58));
  P.add('camo', rivetRow(V(-CX + 0.04, 0.86, -0.6), V(CX - 0.04, 0.86, -0.6), 0.08, V(0, 0, -1), 0.011), { tint: RIV });
  P.add('camo', rivetRow(V(-CX + 0.04, 0.46, -0.6), V(CX - 0.04, 0.46, -0.6), 0.08, V(0, 0, -1), 0.011), { tint: RIV });
  P.add('camo', box(CX * 2, 0.035, 0.45, 0, 0.43, -0.38)); // the front floor plate
  P.add('dark', yTube(0.32, 0.43, 0.025, 0.025, 6, 0, -0.62));
  P.add('dark', new THREE.TorusGeometry(0.05, 0.014, 5, 10).translate(0, 0.27, -0.62));
  P.add('camo', box(CX * 2, 0.24, 0.035, 0, 0.32, 1.62));
  P.add('camo', box(CX * 2, 0.03, TAILZ - 1.62, 0, 0.19, (TAILZ + 1.62) / 2 + 0.01, Math.atan2(0.19 - 0.12, TAILZ - 1.62) * 0)); // the trail's floor
  // the tail: a deep transom plate, a wider shoe of iron under it, the handles and a lifting ring
  P.add('camo', box(1.1, 0.64, 0.04, 0, PLAT + 0.32, TAILZ - 0.02));
  P.add('camo', rivetRow(V(-0.5, PLAT + 0.58, TAILZ + 0.001), V(0.5, PLAT + 0.58, TAILZ + 0.001), 0.08, V(0, 0, 1), 0.012), { tint: RIV });
  P.add('camo', rivetRow(V(-0.5, PLAT + 0.06, TAILZ + 0.001), V(0.5, PLAT + 0.06, TAILZ + 0.001), 0.08, V(0, 0, 1), 0.012), { tint: RIV });
  for (const s of [-1, 1]) P.add('camo', sideProfile([[TAILZ - 0.32, PLAT + 0.01], [TAILZ - 0.02, PLAT + 0.01], [TAILZ - 0.02, PLAT + 0.6]], 0.03).translate(s * 0.53, 0, 0)); // gussets
  P.add('iron', box(1.14, 0.03, 0.5, 0, PLAT + 0.015, TAILZ - 0.24));
  for (const s of [-1, 1]) {
    P.add('steel', rod(V(s * 0.3, PLAT + 0.45, TAILZ + 0.02), V(s * 0.3, PLAT + 0.45, TAILZ + 0.14), 0.016, 6));
    P.add('steel', rod(V(s * 0.3, PLAT + 0.45, TAILZ + 0.14), V(s * 0.15, PLAT + 0.45, TAILZ + 0.14), 0.016, 6));
  }
  P.add('dark', new THREE.TorusGeometry(0.06, 0.016, 5, 12).translate(0, PLAT + 0.67, TAILZ + 0.02));
  // left: the elevating gear. The pinion on the arc, its shaft out through the cheek to a bevel box, a shaft back
  // along the cheek (inside the wheel) to the handwheel behind the wheel; the sight on a pillar off the cheek above it
  const pa = 115 * DEG, pr = ARC.r1 + 0.05, py = TR.y - pr * Math.sin(pa), pz = TR.z + pr * Math.cos(pa);
  P.add('dark', xTube(-(ARC.x - 0.05), -(ARC.x + 0.05), 0.055, 0.055, 12, py, pz));
  P.add('dark', xTube(-(ARC.x + 0.05), -(CX + CT + 0.05), 0.022, 0.022, 8, py, pz));
  P.add('camo', box(0.1, 0.12, 0.14, -(CX + CT + 0.06), py, pz));
  P.add('dark', zTube(pz + 0.07, 0.7, 0.02, 0.02, 8, -(CX + CT + 0.06), py));
  P.add('camo', box(0.1, 0.12, 0.12, -(CX + CT + 0.06), py, 0.74));
  P.add('dark', handwheelX(0.16).translate(-(CX + CT + 0.17), py, 0.74));
  P.add('camo', box(0.06, 0.34, 0.08, -(CX + CT + 0.05), topY(0.72) + 0.1, 0.72));
  P.add('camo', box(0.16, 0.04, 0.1, -(CX + CT + 0.12), topY(0.72) + 0.27, 0.72));
  panoramicSight(P, -(CX + CT + 0.17), topY(0.72) + 0.29, 0.72, -1);
}

// A small handwheel (axis X, handle toward +X): rim, five spokes, boss and handle.
function handwheelX(R) {
  const g = [new THREE.TorusGeometry(R, 0.013, 5, 20).rotateY(Math.PI / 2), xTube(-0.04, 0.04, 0.03, 0.026, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.009, 4)); }
  g.push(xTube(0, -0.07, 0.01, 0.01, 6, R, 0), xTube(-0.07, -0.12, 0.016, 0.016, 6, R, 0));
  return mergeAll(g);
}

// ---------------------------------------------------------------- the small iron wheel
// Cast in one: a wide flat tyre, eight oval spokes, a deep hub with its cap and linch pin (axis X, centre at the
// origin, `side` the way the hub faces).
function ironWheel(P, side) {
  const R = WR, tw = 0.13;
  P.add('dark', new THREE.CylinderGeometry(R, R, tw, 36, 1, true).rotateZ(Math.PI / 2));
  P.add('camo', xTube(-tw * 0.45, tw * 0.45, R - 0.03, R - 0.03, 36, 0, 0, true));
  for (const s of [-1, 1]) P.add('camo', new THREE.RingGeometry(R - 0.075, R, 36).rotateY(s * Math.PI / 2).translate(s * tw / 2, 0, 0));
  P.add('camo', xTube(-tw * 0.3, tw * 0.3, R - 0.075, R - 0.075, 32, 0, 0, true));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    P.add('camo', rod(V(side * 0.01, Math.cos(a) * 0.08, Math.sin(a) * 0.08), V(-side * 0.01, Math.cos(a) * (R - 0.07), Math.sin(a) * (R - 0.07)), 0.026, 6).scale(0.7, 1, 1));
  }
  P.add('camo', xTube(-0.1, 0.1, 0.1, 0.095, 18));
  P.add('dark', xTube(side * 0.1, side * 0.16, 0.07, 0.055, 14));
  P.add('steel', xTube(side * 0.16, side * 0.175, 0.03, 0.03, 8));
  P.add('steel', rod(V(side * 0.135, 0.07, 0), V(side * 0.135, -0.07, 0), 0.008, 5)); // the linch pin
}

// ---------------------------------------------------------------- the barrel
// One forging: the plain chase with a band at the muzzle, a short step to the jacket, the trunnion band with square
// bolted plates either side (the photograph's), a lifting lug on top; the square breech ring with the wedge's slot
// open to the right; the two toothed elevating arcs hung under it behind the trunnions on webs.
function barrelParts(B) {
  const st = -0.36;
  B.add('camo', zLathe([[MZ + 0.32, 0.1055], [MZ, 0.1055], [MZ, 0.185], [MZ + 0.015, 0.2], [MZ + 0.11, 0.2], [MZ + 0.13, 0.188], [st, 0.205], [st, 0.235], [st + 0.05, 0.25], [RING0 - 0.03, 0.262], [RING0, 0.27], [RING0, 0.116], [RING0 - 0.42, 0.116], [RING0 - 0.42, 0.0001]], 32));
  B.add('char', new THREE.CircleGeometry(0.1055, 20).rotateY(Math.PI).translate(0, 0, MZ + 0.32));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    B.add('dark', box(0.01, 0.005, 0.3, Math.cos(a) * 0.103, Math.sin(a) * 0.103, MZ + 0.15, 0, 0, a + Math.PI / 2));
  }
  // the trunnion band and its plates, the trunnions
  B.add('camo', zTube(-0.22, 0.22, 0.272, 0.272, 30));
  for (const z of [-0.22, 0.22]) B.add('camo', zTube(z - 0.02, z + 0.02, 0.282, 0.282, 30));
  for (const s of [-1, 1]) {
    B.add('camo', box(0.05, 0.38, 0.38, s * 0.275, 0, 0));
    for (const [yy, zz] of [[0.14, 0.14], [0.14, -0.14], [-0.14, 0.14], [-0.14, -0.14]]) B.add('steel', xTube(s * 0.3, s * 0.315, 0.022, 0.018, 6, yy, zz));
    B.add('steel', xTube(s * 0.3, s * (CX + 0.004), 0.085, 0.085, 16));
  }
  B.add('camo', box(0.1, 0.08, 0.16, 0, 0.29, 0.05)); // the lifting lug
  B.add('dark', new THREE.TorusGeometry(0.05, 0.016, 5, 10).rotateY(Math.PI / 2).translate(0, 0.37, 0.05));
  // the ring: front plate round the chamber's mouth, top and bottom, the left wall; the wedge's slot open right
  const fz = RING0 + 0.13, ch = 0.122;
  B.add('camo', rbox(RG.w * 2, RG.top - ch, 0.13, 0.04, 0, (RG.top + ch) / 2, RING0 + 0.065));
  B.add('camo', rbox(RG.w * 2, -ch - RG.bot, 0.13, 0.04, 0, (RG.bot - ch) / 2, RING0 + 0.065));
  for (const s of [-1, 1]) B.add('camo', box(RG.w - ch, ch * 2, 0.13, s * (RG.w + ch) / 2, 0, RING0 + 0.065));
  B.add('camo', rbox(RG.w * 2, RG.top - RG.slot, BR - fz, 0.035, 0, (RG.top + RG.slot) / 2, (BR + fz) / 2));
  B.add('camo', rbox(RG.w * 2, -RG.slot - RG.bot, BR - fz, 0.035, 0, (RG.bot - RG.slot) / 2, (BR + fz) / 2));
  B.add('camo', box(0.12, RG.slot * 2, BR - fz, -RG.w + 0.06, 0, (BR + fz) / 2));
  B.add('char', new THREE.CircleGeometry(0.116, 20).translate(0, 0, RING0 - 0.419));
  for (const yy of [-RG.slot, RG.slot]) B.add('dark', box(RG.w + 0.18, 0.01, 0.004, (RG.w - 0.18) / 2, yy, BR + 0.001));
  B.add('dark', box(0.01, RG.slot * 2, 0.004, -0.18, 0, BR + 0.001));
  // the lanyard's lever on the ring's top right
  B.add('dark', box(0.06, 0.06, 0.06, 0.2, RG.top + 0.03, BR - 0.08));
  B.add('steel', rod(V(0.2, RG.top + 0.05, BR - 0.08), V(0.24, RG.top + 0.2, BR - 0.02), 0.016, 6));
  // the elevating arcs on their webs
  const web = [[ARC.r0 * Math.cos(ARC.a0), -ARC.r0 * Math.sin(ARC.a0) + 0.02], [ARC.r0 * Math.cos(80 * DEG), -ARC.r0 * Math.sin(80 * DEG) + 0.02],
    [ARC.r0 * Math.cos(ARC.a1), -ARC.r0 * Math.sin(ARC.a1) + 0.02], [-0.21, -0.2], [0.42, -0.2]];
  for (const s of [-1, 1]) {
    B.add('dark', gearArc(ARC.r0, ARC.r1, ARC.a0, ARC.a1, 0.04, 16, 0.022).translate(s * ARC.x, 0, 0));
    B.add('camo', sideProfile(web, 0.025).translate(s * (ARC.x - 0.025), 0, 0));
  }
  B.add('camo', box(ARC.x * 2 - 0.02, 0.07, 0.62, 0, -0.235, 0.1)); // the saddle joining the webs under the barrel
}

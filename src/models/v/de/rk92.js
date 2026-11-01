import * as THREE from 'three';
import { V, DEG, box, rbox, xTube, yTube, zTube, rod, sideProfile, gearArc, zLathe, rivetRow, rivetPoly, mergeAll } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, trayShells, crew, ring, L90, R90, TAU } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { panoramicSight, slidingBlock } from './common.js';

/**
 * 15 cm Ringkanone C/92 (Krupp, 1892), the fortress and siege gun of the Fußartillerie pulled out of the fortresses for
 * the field army in the First World War, as the en.wikipedia article ("15 cm Ring Kanone C/92") describes it and its
 * pictures show it (the Bulgarian gun at Adrianople on its plank platform; the French line drawing of the M1892 with
 * its carriage and elevating gear; the 1864 pattern siege carriage in Meyers, "the type of every carriage of the
 * German siege and fortress artillery since 1864"): a built-up steel barrel of 4.47 m (L/30) of a rifled tube with
 * reinforcing hoops, a slim tapering chase and a big round breech ring ("Ring") with a horizontal sliding wedge, the
 * forerunner of Krupp's round-backed wedge; the trunnions on a hoop just ahead of the ring. A tall, narrow carriage (so
 * the gun fired over a parapet or a berm) of two riveted iron cheeks, high brackets with the trunnion bearings on top
 * and a long box trail falling to the planks; two big wooden wheels of twelve spokes with iron tyres; no recoil system
 * and no shield. 6,032 kg in action, elevation -4 to +40 degrees (the game: 2 to 38), no traversing gear. For siege use
 * two wooden ramps lay behind the wheels on the plank platform: at the shot the wheels ran up them and the gun came back
 * down by gravity, off its line, and was levered back with handspikes and laid afresh after every shot.
 * Dimensions: the barrel length is the source's; the rest [E] estimates read from the pictures against the barrel and
 * the men: wheels 1.56 m, track 1.6 m, trunnions 1.66 m above the ground (the wheel's top), the trunnions 1.28 m ahead
 * of the breech face, the breech ring 0.6 m across, the trail 4.0 m from the axle to its end, the ramps 0.31 m high.
 * Paint: 'bunt' (the 1917 Buntfarbenanstrich) or 'feldgrau'.
 *
 * Rig (DESIGN.md "Models"), the Mörser 99's mechanism (m99.js): origin on the ground under the wheels' axis, front -Z.
 * The plank platform (PLAT high) is fixed in the root and does not turn. `traverse` turns the carriage and its ramps
 * about the wheels' axis. `recoil` is the WHOLE carriage: setRecoil(k) runs it back RL m along +Z and up the ramps (the
 * front rises RISE, the carriage pivoting about its tail on the planks) and rolls the wheels; `elevation` at the
 * trunnions inside it; `breech` the wedge (setBreech slides it +X until its loading hole is on the bore). No loading
 * tray: the shell went into the open breech by hand and the rammer seated it (as the K 17's). The crew module
 * (render/ww1/rk92.js through render/ramp_drill.js) poses the run up the ramps and the roll back by rig.holdRecoil(k)
 * and the carriage off its line by rig.holdLay(r); setRecoil and setTraverse give way to those while they are fresh
 * (a few frames). Props for the drill: the two handspikes in the wheels (rig.setSpikes(on)) and their grips
 * (rig.ramp.anchors, rig.ramp.gripAt).
 * buildRK92({ scheme: 'bunt' | 'feldgrau' })
 */
const PLAT = 0.08; // the platform's top
const WR = 0.78, WX = 0.8; // the wooden wheels: radius [E], centre plane
const AXY = PLAT + WR; // their axis at rest (z = 0)
const TR = { y: 1.66, z: 0.1 }; // trunnion axis in root space [E]
const BR = 1.28, MZ = BR - 4.47; // the breech face, the muzzle (L/30) along the bore from the trunnions
const RING0 = 0.5, FZ = BR - 0.3; // front of the breech ring, front of the wedge's slot
const RR = 0.3, SL = 0.12, BORE = 0.0745; // the ring's radius, the slot's half height, the bore
const WT = 0.17; // the wedge's travel: its loading hole comes onto the bore
const CX = 0.34, CT = 0.04; // the cheeks' inner face, their thickness
const TAILZ = 4.0; // where the trail stands on the planks
const RL = 1.3, RISE = 0.28; // the run back and the rise up the ramps at full run back
const RAMP = { z0: 0.1, len: 1.45, h: 0.312, top: 0.16, w: 0.26 }; // the ramps: toe, the slope's length and height, a flat on top
const PF = { x: 3.4, z0: -1.8, z1: 6.2 }; // the plank platform: half width, front and rear
const ARC = { r0: 0.52, r1: 0.58, a0: 24 * DEG, a1: 76 * DEG, pa: 70 * DEG }; // the elevating arc under the barrel, its pinion's place
const RIV = 0xd0c8b4;

// the cheek in side view (z, y), root space: the bracket rising to the trunnion bearing, the top edge falling steeply
// behind it and then along the trail to its end; the bottom edge from the axle down to the shoe on the planks
const TOP = [[-0.42, 0.6], [-0.42, 1.0], [-0.22, 1.42], [-0.12, 1.6], [0.32, 1.6], [0.56, 1.42], [0.98, 1.12], [1.3, 0.8], [TAILZ - 0.1, 0.55], [TAILZ, 0.5]];
const BOT = [[TAILZ, PLAT + 0.01], [TAILZ - 0.5, PLAT + 0.01], [1.4, 0.48], [0.45, 0.64], [0.2, 0.64]];
const CHEEK = [...TOP, ...BOT];
const lerpY = (pts, z) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    if (z <= z1 || i === pts.length - 2) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
};
const topY = (z) => lerpY(TOP.slice(4, -1), z);
const botY = (z) => lerpY(BOT.slice(1).reverse(), z);

export const RK92 = { PLAT, WR, WX, AXY, TR, TAILZ, RL, RISE, RAMP };

export function buildRK92({ scheme = 'bunt' } = {}) {
  const rig = makeRig(scheme);
  rig.scheme = scheme;
  const { root } = rig;
  const sh = buildShell('rk92');

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
  // the wheels on the axle (roll as the carriage runs back)
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = node(cf, s < 0 ? 'wheelL' : 'wheelR', s * WX, AXY, 0);
    const W = rig.part();
    woodWheel(W, s);
    W.build(w, { dirt: 0.6, y0: AXY });
    wheels.push(w);
  }

  // ---------------------------------------------------------------- the barrel (elevation)
  const el = pivotAt(rig, cf, 'elevation', 0, TR.y, TR.z);
  const B = rig.part();
  barrelParts(B);
  B.build(el, { dirt: 0.15, y0: TR.y });

  // ---- the wedge: a block across the ring's slot with the loading hole through it, offset left by its travel, so
  // the open wedge (slid out to the right) brings the hole onto the bore
  const bl = BR - FZ, bz = (BR + FZ) / 2, bw = 0.54;
  const br = pivotAt(rig, el, 'breech', 0, 0, bz);
  const K = rig.part();
  const hole = [];
  for (let i = 0; i < 18; i++) { const a = -(i / 18) * TAU; hole.push([-WT + (BORE + 0.006) * Math.cos(a), (BORE + 0.006) * Math.sin(a)]); }
  K.add('camo', plate([[-bw / 2, -SL + 0.004], [bw / 2, -SL + 0.004], [bw / 2, SL - 0.004], [-bw / 2, SL - 0.004]], [hole], -bl / 2 + 0.002, bl / 2 - 0.002));
  K.add('steel', zTube(bl / 2 - 0.002, bl / 2 + 0.03, 0.035, 0.035, 12, 0.06, 0)); // the firing lock
  K.add('dark', box(0.07, 0.07, 0.05, bw / 2 - 0.06, 0.02, bl / 2 + 0.02)); // the crank's boss on the right
  K.add('steel', rod(V(bw / 2 - 0.06, 0.04, bl / 2 + 0.04), V(bw / 2 + 0.02, 0.2, bl / 2 + 0.07), 0.018, 6)); // the crank handle
  K.add('steel', rod(V(bw / 2 + 0.02, 0.2, bl / 2 + 0.07), V(bw / 2 + 0.1, 0.22, bl / 2 + 0.12), 0.018, 6));
  K.add('dark', box(0.02, SL * 2 - 0.03, bl - 0.03, bw / 2 + 0.01, 0, 0)); // the stop plate on the wedge's right end
  K.build(br, { dirt: 0 });
  slidingBlock(rig, br, WT);
  rig.loadEl = 3 * DEG; // GUNS.rk92.loadEl

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
  // the crew module's hold (render/ww1/rk92.js): null lets the render layer's value through again
  rig.holdRecoil = (k) => { holdV = k; holdAt = frame; if (k != null) pose(k); };
  // the line: the render layer's traverse plus the crew's offset (the gun come back off its line, levered round)
  let az = 0, layV = 0, layAt = -99;
  const turnTo = () => { trav.rotation.y = az + (frame - layAt <= 4 ? layV : 0); };
  rig.setTraverse = (r) => { az = r; turnTo(); };
  rig.holdLay = (r) => { layV = r; layAt = frame; turnTo(); };
  rig.update = () => { frame++; };
  rig.recoilK = 0;

  // ---------------------------------------------------------------- the drill's props: the handspikes
  const spikes = node(cf, 'handspikes', 0, 0, 0);
  const H = rig.part();
  const SPK = [];
  for (const s of [-1, 1]) {
    // a 1.7 m ash handspike: its iron-shod point in the wheel between two spokes behind the nave, the butt back and
    // out at the man's hands (he bears on it to roll the wheel, and the gun with it, round onto its line)
    const a = V(s * (WX - 0.03), AXY + 0.1, 0.24), b = V(s * (WX + 0.46), 1.1, 1.82);
    H.add('wood', rod(a, b, 0.032, 7));
    H.add('iron', rod(a, a.clone().lerp(b, 0.09), 0.036, 7));
    SPK.push({ s, a, b });
  }
  H.build(spikes, { dirt: 0.2 });
  spikes.visible = false;
  rig.setSpikes = (on) => { spikes.visible = !!on; };

  // ---------------------------------------------------------------- anchors and crew
  rig.anchors.eye = node(trav, 'eye', 0, 2.5, 1.6);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, MZ);
  rig.anchors.breech = node(el, 'breech', 0, 0, BR + 0.02);
  // no loading tray: `tray` (where crews.js lays the round) is on the bore just inside the breech face (the K 17's)
  const mid = BR - 0.02;
  rig.anchors.tray = node(el, 'tray', 0, 0, mid);
  // the rounds lie on the planks on the right, outside the carriage's run back; the cartridges in their baskets by them
  rig.anchors.shellStack = node(root, 'shellStack', 2.9, PLAT + sh.radius + 0.02, 2.0);
  trayShells(rig, node(el, 'trayShell', 0, -(sh.radius + 0.02), mid - sh.length / 2 - 0.02), 'rk92');
  rig.slideMats = ['camo', 'steel', 'char', 'dark'];
  const at84 = (p) => V(p.a.x + (p.b.x - p.a.x) * 0.84, p.a.y + (p.b.y - p.a.y) * 0.84, p.a.z + (p.b.z - p.a.z) * 0.84);
  const A = {
    spikeL: node(cf, 'spike-grip-l', SPK[0].b.x - 0.02, SPK[0].b.y - 0.04, SPK[0].b.z - 0.12),
    spikeR: node(cf, 'spike-grip-r', SPK[1].b.x + 0.02, SPK[1].b.y - 0.04, SPK[1].b.z - 0.12),
    spikeL2: node(cf, 'spike-grip-l2', ...at84(SPK[0]).toArray()),
    spikeR2: node(cf, 'spike-grip-r2', ...at84(SPK[1]).toArray()),
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
  rig.rk92 = rig.ramp = { ...RK92, anchors: A, gripAt }; // (rig.ramp: the shared ramp drill, render/ramp_drill.js)

  // Eight men [E] (render/ww1/rk92.js): the layer at the sight and the elevating handwheel on the left, the second
  // layer at the right handwheel, the loader left of the breech, the rammer behind him by the trail, the shell and the
  // cartridge up the right from the stack, the lanyard man off the right. Everyone stands outside the wheels' and the
  // trail's run back up the ramps (1.3 m at every shot); crews.js walks them in to their work.
  const y = PLAT;
  crew(rig, 'officer', -2.8, -0.6, L90, 'point', y);
  crew(rig, 'layer', -1.4, 1.1, L90, 'lay', y);
  crew(rig, 'elevator', 1.4, 1.1, R90, 'operate', y);
  crew(rig, 'loader', -1.1, 2.5, 0, 'ram', y);
  crew(rig, 'rammer', -0.9, 3.4, 0, 'ram', y);
  crew(rig, 'shell', 1.45, 2.8, R90, 'carry', y);
  crew(rig, 'cartridge', 1.4, 3.6, R90, 'carry', y);
  crew(rig, 'lanyard', 2.1, 1.45, R90, 'lanyard', y);

  hb(rig, -1.1, 0, -3.3, 1.1, 2.1, 1.6);
  hb(rig, -0.5, 0, 1.6, 0.5, 1.2, TAILZ + 0.3);
  hb(rig, -PF.x, 0, PF.z0, PF.x, PLAT, PF.z1);
  return finishRig(rig, 'rk92', 'rk92');
}

// A flat plate from a front outline [x, y] with holes, between z0 and z1.
function plate(outline, holes, z0, z1) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 6 });
  return g.translate(0, 0, Math.min(z0, z1));
}

// The part of a cylinder (axis Z, radius r) above the chord y = c, between z0 and z1; `down` the part below -c.
function segment(r, c, z0, z1, down = false) {
  const a0 = Math.asin(c / r), pts = [];
  for (let i = 0; i <= 20; i++) { const a = a0 + (Math.PI - 2 * a0) * (i / 20); pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  const g = plate(pts, [], z0, z1);
  return down ? g.rotateZ(Math.PI) : g;
}

// ---------------------------------------------------------------- the platform
// Heavy planks laid across on five sleepers along it, spiked down; a few planks a shade lighter (renewed); the iron
// eye ahead of the carriage; the wicker cartridge baskets on the right by the shell stack.
function platform(P) {
  const n = Math.round((PF.z1 - PF.z0) / 0.26);
  const dz = (PF.z1 - PF.z0) / n;
  for (let i = 0; i < n; i++) {
    const z = PF.z0 + (i + 0.5) * dz, j = Math.sin(i * 12.9898) * 0.5 + 0.5;
    P.add('wood', box(PF.x * 2 + 0.06 * (j - 0.5), 0.07, dz - 0.012, 0.03 * (j - 0.5), PLAT - 0.035, z), { tint: [0xffffff, 0xe8dcc8, 0xd2c6b2, 0xf4ecdc][i % 4] });
    for (const x of [-PF.x + 0.15, -1.7, 0, 1.7, PF.x - 0.15]) P.add('dark', yTube(PLAT - 0.002, PLAT + 0.006, 0.013, 0.013, 5, x + (i % 2) * 0.04, z));
  }
  for (const x of [-PF.x + 0.15, -1.7, 0, 1.7, PF.x - 0.15]) P.add('wood', box(0.22, 0.12, PF.z1 - PF.z0 + 0.2, x, PLAT - 0.13, (PF.z0 + PF.z1) / 2), { tint: 0xb4a890 });
  P.add('iron', box(0.3, 0.02, 0.2, 0, PLAT + 0.01, -1.2));
  P.add('iron', new THREE.TorusGeometry(0.06, 0.016, 6, 12).translate(0, PLAT + 0.07, -1.2));
  for (const [x, z] of [[3.05, 3.0], [3.1, 3.38], [2.76, 3.3]]) {
    P.add('wicker', yTube(PLAT, PLAT + 0.5, 0.15, 0.16, 12, x, z));
    P.add('dark', yTube(PLAT + 0.5, PLAT + 0.52, 0.16, 0.16, 12, x, z));
  }
}

// ---------------------------------------------------------------- a ramp (Rücklaufkeil) behind a wheel
// Built up of planks, the slope faced with an iron strap the tyre runs on, a chock across its top end; its toe starts
// a little behind the wheel's foot, where the big wheel first meets the slope.
function ramp(P, x) {
  const z0 = RAMP.z0, L = RAMP.len, h = RAMP.h, t = RAMP.top, w = RAMP.w;
  P.add('wood', sideProfile([[z0, PLAT], [z0 + L, PLAT + h], [z0 + L + t, PLAT + h], [z0 + L + t, PLAT]], w).translate(x, 0, 0), { tint: 0xe0d4be });
  for (let i = 1; i < 4; i++) {
    const yy = PLAT + (h * i) / 4, za = z0 + (L * i) / 4;
    for (const s of [-1, 1]) P.add('char', box(0.004, 0.008, z0 + L + t - za, x + s * (w / 2 + 0.001), yy, (za + z0 + L + t) / 2));
  }
  const sl = Math.atan2(h, L), len = Math.hypot(L, h);
  P.add('iron', box(w * 0.8, 0.012, len, x, PLAT + h / 2 + 0.006, z0 + L / 2, -sl));
  P.add('iron', box(w * 0.8, 0.012, t, x, PLAT + h + 0.006, z0 + L + t / 2));
  P.add('wood', box(w + 0.04, 0.18, 0.12, x, PLAT + h + 0.09, z0 + L + t - 0.06), { tint: 0xc8bca4 });
  P.add('iron', box(w, 0.012, 0.16, x, PLAT + 0.006, z0 - 0.06));
  for (const s of [-1, 1]) P.add('dark', yTube(PLAT, PLAT + 0.02, 0.014, 0.014, 5, x + s * w * 0.35, z0 - 0.09));
}

// ---------------------------------------------------------------- the carriage
function carriage(P) {
  for (const s of [-1, 1]) {
    const xo = s * (CX + CT / 2), xs = s * (CX + CT);
    P.add('camo', sideProfile(CHEEK, CT).translate(xo, 0, 0));
    P.add('camo', rivetPoly(CHEEK, (z, y) => V(s * (CX + CT + 0.001), y, z), 0.04, 0.1, V(s, 0, 0), 0.012), { tint: RIV });
    P.add('camo', rivetPoly(CHEEK, (z, y) => V(s * (CX - 0.001), y, z), 0.04, 0.1, V(-s, 0, 0), 0.012), { tint: RIV });
    // the angle iron flanged out along the top edge and along the bottom
    for (let i = 0; i < TOP.length - 1; i++) {
      const [z0, y0] = CHEEK[i], [z1, y1] = CHEEK[i + 1], l = Math.hypot(z1 - z0, y1 - y0);
      P.add('camo', box(0.07, 0.025, l + 0.02, s * (CX + CT + 0.02), (y0 + y1) / 2 - 0.012, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    for (let i = TOP.length; i < CHEEK.length; i++) {
      const [z0, y0] = CHEEK[i], [z1, y1] = CHEEK[(i + 1) % CHEEK.length], l = Math.hypot(z1 - z0, y1 - y0);
      P.add('camo', box(0.06, 0.022, l + 0.02, s * (CX + CT + 0.02), (y0 + y1) / 2 + 0.011, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)));
    }
    // the riveted stiffeners across the cheek's outside: the bracket's struts and the trail's ribs
    P.add('camo', box(0.035, 0.9, 0.06, xs + s * 0.017, 1.08, -0.28, -0.32));
    P.add('camo', box(0.035, 0.86, 0.06, xs + s * 0.017, 1.08, 0.5, 0.42));
    for (const z of [1.6, 2.3, 3.0]) P.add('camo', box(0.035, topY(z) - botY(z) - 0.06, 0.06, xs + s * 0.017, (topY(z) + botY(z)) / 2, z));
    // the trunnion bearing on the bracket's top: the boss, its cap strapped over and bolted
    P.add('camo', xTube(xs - s * 0.005, xs + s * 0.07, 0.16, 0.15, 22, TR.y, TR.z));
    P.add('steel', xTube(xs + s * 0.07, xs + s * 0.085, 0.085, 0.085, 14, TR.y, TR.z));
    P.add('camo', box(CT + 0.08, 0.1, 0.4, xo + s * 0.03, TR.y + 0.13, TR.z));
    for (const z of [-0.14, 0.14]) {
      P.add('dark', yTube(TR.y - 0.12, TR.y + 0.2, 0.016, 0.016, 6, xs + s * 0.05, TR.z + z));
      P.add('dark', yTube(TR.y + 0.18, TR.y + 0.21, 0.03, 0.03, 6, xs + s * 0.05, TR.z + z));
    }
    // the axle's bed through the cheek, bolted
    P.add('camo', xTube(xs - s * 0.005, xs + s * 0.06, 0.13, 0.12, 18, AXY, 0));
    P.add('camo', box(CT + 0.06, 0.08, 0.5, xo + s * 0.02, AXY - 0.16, 0));
    // the elevating gear: the pinion's shaft out through the cheek to a bevel box, a shaft back along the cheek
    // outside to the handwheel behind the wheel (the layer's on the left, the second layer's on the right)
    const pr = ARC.r1 + 0.04, py = TR.y - pr * Math.sin(ARC.pa), pz = TR.z + pr * Math.cos(ARC.pa), hz = 0.98, hx = s * 0.62;
    P.add('dark', xTube(s * (CX - 0.02), xs + s * 0.08, 0.025, 0.025, 8, py, pz));
    P.add('camo', box(0.12, 0.13, 0.14, xs + s * 0.08, py, pz));
    P.add('dark', zTube(pz + 0.07, hz - 0.06, 0.022, 0.022, 8, xs + s * 0.08, py));
    P.add('camo', box(0.12, 0.12, 0.12, xs + s * 0.08, py, hz - 0.03));
    P.add('dark', xTube(xs + s * 0.08, hx, 0.02, 0.02, 8, py, hz - 0.03));
    P.add('dark', handwheelX(0.15, s).translate(hx, py, hz - 0.03));
    // a stay from the cheek to carry the handwheel's shaft
    P.add('camo', rod(V(xs, botY(hz) + 0.1, hz + 0.1), V(xs + s * 0.08, py - 0.05, hz - 0.03), 0.018, 6));
    // the handspike eyes along the trail's end and its lifting handles
    for (const z of [3.2, 3.65]) {
      const yy = topY(z) - 0.16;
      P.add('dark', new THREE.TorusGeometry(0.05, 0.014, 5, 10).rotateY(Math.PI / 2).translate(xs + s * 0.04, yy, z));
      P.add('dark', box(0.03, 0.05, 0.12, xs + s * 0.012, yy, z));
    }
  }
  // the axle tree right across, with the linch pins outside the naves
  P.add('dark', xTube(-(WX + 0.26), WX + 0.26, 0.055, 0.055, 14, AXY, 0));
  P.add('camo', box(CX * 2, 0.16, 0.2, 0, AXY, 0));
  // the elevating pinion's shaft across between the cheeks, with its pinion under the arc
  {
    const pr = ARC.r1 + 0.04, py = TR.y - pr * Math.sin(ARC.pa), pz = TR.z + pr * Math.cos(ARC.pa);
    P.add('dark', xTube(-CX, CX, 0.025, 0.025, 8, py, pz));
    P.add('dark', xTube(-0.04, 0.04, 0.06, 0.06, 14, py, pz));
    P.add('camo', box(CX * 2, 0.04, 0.3, 0, py - 0.12, pz)); // the bearing transom under it
  }
  // the transoms: across the bracket's front, the floor under the breech's sweep, the trail's floor and step plates
  P.add('camo', box(CX * 2, 0.4, 0.035, 0, 0.82, -0.4));
  P.add('camo', rivetRow(V(-CX + 0.04, 0.98, -0.42), V(CX - 0.04, 0.98, -0.42), 0.08, V(0, 0, -1), 0.011), { tint: RIV });
  P.add('camo', rivetRow(V(-CX + 0.04, 0.66, -0.42), V(CX - 0.04, 0.66, -0.42), 0.08, V(0, 0, -1), 0.011), { tint: RIV });
  const fl = (z0, z1, t = 0.025) => {
    const a = botY(z0) + t / 2, b = botY(z1) + t / 2;
    return box(CX * 2, t, Math.hypot(z1 - z0, b - a), 0, (a + b) / 2, (z0 + z1) / 2, -Math.atan2(b - a, z1 - z0));
  };
  P.add('camo', fl(0.5, 1.9));
  P.add('dark', fl(2.2, 2.9, 0.03)); // the chequered step plate between the cheeks
  P.add('dark', fl(3.1, 3.5, 0.03));
  for (const z of [1.95, 3.0]) P.add('camo', box(CX * 2, 0.24, 0.035, 0, botY(z) + 0.12, z));
  // the trail's end: the iron shoe on the planks, the deep end plate, the lunette, the handspike's socket
  P.add('iron', box(CX * 2 + CT * 2 + 0.08, 0.035, 0.6, 0, PLAT + 0.018, TAILZ - 0.28));
  P.add('camo', box(CX * 2, 0.42, 0.04, 0, PLAT + 0.21, TAILZ - 0.02));
  P.add('camo', rivetRow(V(-CX + 0.04, PLAT + 0.36, TAILZ + 0.001), V(CX - 0.04, PLAT + 0.36, TAILZ + 0.001), 0.08, V(0, 0, 1), 0.012), { tint: RIV });
  P.add('steel', new THREE.TorusGeometry(0.09, 0.025, 8, 16).rotateX(Math.PI / 2).translate(0, PLAT + 0.3, TAILZ + 0.13));
  P.add('steel', zTube(TAILZ, TAILZ + 0.05, 0.04, 0.04, 10, 0, PLAT + 0.3));
  P.add('camo', box(0.16, 0.12, 0.18, 0, PLAT + 0.46, TAILZ - 0.1));
  // a rammer staff stowed along the right cheek, a spare handspike along the left
  P.add('wood', rod(V(CX + CT + 0.05, topY(1.3) - 0.12, 1.3), V(CX + CT + 0.05, topY(3.6) - 0.12, 3.6), 0.022, 6));
  P.add('wood', rod(V(-(CX + CT + 0.05), topY(1.6) - 0.14, 1.6), V(-(CX + CT + 0.05), topY(3.5) - 0.14, 3.5), 0.03, 6));
  for (const [s, z] of [[1, 1.5], [1, 3.4], [-1, 1.8], [-1, 3.3]]) P.add('dark', box(0.05, 0.05, 0.03, s * (CX + CT + 0.04), topY(z) - 0.13, z));
  // the sight on a bracket off the left cheek, ahead of the handwheel
  const sz = 0.72;
  P.add('camo', box(0.05, 0.36, 0.08, -(CX + CT + 0.04), topY(sz) + 0.06, sz));
  P.add('camo', box(0.18, 0.04, 0.1, -(CX + CT + 0.12), topY(sz) + 0.25, sz));
  panoramicSight(P, -(CX + CT + 0.18), topY(sz) + 0.27, sz, -1);
}

// A handwheel (axis X, handle toward `side`): rim, five spokes, boss and handle.
function handwheelX(R, side) {
  const g = [new THREE.TorusGeometry(R, 0.013, 5, 20).rotateY(Math.PI / 2), xTube(-0.04, 0.04, 0.03, 0.026, 10)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), 0.009, 4)); }
  g.push(xTube(0, side * 0.07, 0.01, 0.01, 6, R, 0), xTube(side * 0.07, side * 0.12, 0.016, 0.016, 6, R, 0));
  return mergeAll(g);
}

// ---------------------------------------------------------------- the wooden wheel
// Twelve painted wooden spokes, dished, in a painted felloe with a broad iron tyre bolted through, the nave with its
// iron bands and the hub cap with the linch pin (axis X, centre at the origin, `side` the way the hub faces).
function woodWheel(P, side) {
  const R = WR;
  P.add('dark', ring(R - 0.03, R, -0.065, 0.065, 56));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    P.add('steel', xTube(side * 0.05, side * 0.058, 0.01, 0.01, 5, Math.cos(a) * (R - 0.07), Math.sin(a) * (R - 0.07)));
  }
  P.add('camo', ring(R - 0.11, R - 0.03, -0.05, 0.05, 44));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13, ca = Math.cos(a), sa = Math.sin(a);
    P.add('camo', taper(V(side * -0.035, ca * 0.14, sa * 0.14), V(side * 0.006, ca * (R - 0.1), sa * (R - 0.1)), 0.04, 0.028, 7));
  }
  P.add('camo', xTube(-0.2, 0.2, 0.15, 0.135, 18));
  for (const s of [-1, 1]) P.add('dark', xTube(s * 0.16, s * 0.205, 0.158, 0.158, 18));
  P.add('dark', xTube(side * 0.2, side * 0.26, 0.085, 0.065, 14));
  P.add('steel', xTube(side * 0.26, side * 0.275, 0.035, 0.035, 8));
  P.add('steel', rod(V(side * 0.235, 0.08, 0), V(side * 0.235, -0.08, 0), 0.009, 5)); // the linch pin
}

// A cylinder from a (radius r0) to b (radius r1).
function taper(a, b, r0, r1, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// ---------------------------------------------------------------- the barrel
// Built up: the slim rifled tube tapering to a small swell at the muzzle, the first layer of hoops stepping out at
// the chase's end, the trunnion hoop with the trunnions, and the big round breech ring with the wedge's slot right
// across it (the wedge's ends show on both sides); the elevating arc hung under the barrel on its webs, the sights.
function barrelParts(B) {
  B.add('camo', zLathe([[MZ + 0.3, BORE], [MZ, BORE], [MZ, 0.128], [MZ + 0.015, 0.14], [MZ + 0.09, 0.14], [MZ + 0.12, 0.128], [-1.25, 0.158], [-1.25, 0.19], [-1.22, 0.2],
    [-0.44, 0.214], [-0.44, 0.232], [-0.42, 0.244], [0.34, 0.244], [0.36, 0.232], [0.44, 0.236], [0.44, 0.28], [RING0, RR], [FZ, RR], [FZ, BORE], [FZ - 0.6, BORE], [FZ - 0.6, 0.0001]], 36));
  B.add('char', new THREE.CircleGeometry(BORE, 20).rotateY(Math.PI).translate(0, 0, MZ + 0.3));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    B.add('dark', box(0.009, 0.005, 0.28, Math.cos(a) * (BORE - 0.002), Math.sin(a) * (BORE - 0.002), MZ + 0.14, 0, 0, a + Math.PI / 2));
  }
  // the hoops' joints (dark seams) along the jacket
  for (const [z, r] of [[-0.9, 0.209], [-0.62, 0.213]]) B.add('dark', zTube(z - 0.006, z + 0.006, r + 0.002, r + 0.002, 32));
  // the trunnions
  for (const s of [-1, 1]) {
    B.add('camo', xTube(s * 0.2, s * 0.27, 0.12, 0.11, 20));
    B.add('steel', xTube(s * 0.27, s * (CX + 0.004), 0.085, 0.085, 16));
  }
  // the ring behind the slot: the parts above and below it
  B.add('camo', segment(RR, SL, FZ, BR));
  B.add('camo', segment(RR, SL, FZ, BR, true));
  B.add('dark', zTube(BR - 0.004, BR + 0.002, RR - 0.015, RR - 0.015, 36, 0, 0, true)); // the chamfer's line round the face
  // the slot's edges on the face and the sides
  for (const yy of [-SL, SL]) B.add('dark', box(0.56, 0.008, 0.004, 0, yy, BR + 0.001));
  // the lanyard's lever on the ring's top right, the tangent sight's socket on the top left, the front sight's blade
  B.add('dark', box(0.06, 0.06, 0.06, 0.16, RR - 0.01, BR - 0.1));
  B.add('steel', rod(V(0.16, RR + 0.01, BR - 0.1), V(0.2, RR + 0.16, BR - 0.04), 0.016, 6));
  B.add('dark', box(0.06, 0.08, 0.08, -0.18, RR - 0.04, BR - 0.12));
  B.add('steel', box(0.02, 0.22, 0.02, -0.18, RR + 0.1, BR - 0.12));
  B.add('steel', box(0.06, 0.02, 0.02, -0.18, RR + 0.2, BR - 0.12));
  B.add('dark', box(0.04, 0.05, 0.06, -0.17, 0.25, 0.0));
  B.add('steel', box(0.01, 0.05, 0.03, -0.17, 0.29, 0.0));
  // the lifting eye over the trunnions
  B.add('camo', box(0.1, 0.06, 0.16, 0, 0.26, 0.12));
  B.add('dark', new THREE.TorusGeometry(0.05, 0.016, 5, 10).rotateY(Math.PI / 2).translate(0, 0.33, 0.12));
  // the toothed elevating arc on its webs under the barrel, between the trunnion hoop and the ring
  B.add('dark', gearArc(ARC.r0, ARC.r1, ARC.a0, ARC.a1, 0.06, 18, 0.022));
  const web = [[ARC.r0 * Math.cos(ARC.a0), -ARC.r0 * Math.sin(ARC.a0)], [ARC.r0 * Math.cos(50 * DEG), -ARC.r0 * Math.sin(50 * DEG)],
    [ARC.r0 * Math.cos(ARC.a1), -ARC.r0 * Math.sin(ARC.a1)], [0.0, -0.2], [0.5, -0.2]];
  for (const s of [-1, 1]) B.add('camo', sideProfile(web, 0.022).translate(s * 0.045, 0, 0));
  B.add('camo', rbox(0.12, 0.05, 0.56, 0.01, 0, -0.225, 0.2)); // the saddle the webs hang from
}

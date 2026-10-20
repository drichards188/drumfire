import * as THREE from 'three';
import { V, DEG, xf, box, xTube, yTube, zTube, rod, sideProfile, zLathe, xLathe, tyreGeometry, rivets, gearArc } from '../../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, ring, addHandwheel, crew, L90, R90, TAU } from '../../t/fieldkit.js';
import { buildShell } from '../../shells.js';
import { panoramicSight } from './common.js';

/**
 * 15 cm Nebelwerfer 41 (refs/nebelwerfer41: README with the sources and photos).
 * Six 1.30 m launching tubes (51 in, TM-E 30-451 VII-87; 158 mm bore with three riveted guide rails inside)
 * touching one another in a flat-topped hexagon (rows of two, the middle pair widest; museum front views at
 * Aberdeen, Overloon, Bovington), held by one broad clamping collar just ahead of the trunnions (Troarn, July 1944,
 * and the museum side views) and a rear plate carrying each tube's hook latch and firing contact. The contacts lead to a junction box on the upper
 * right-hand side of the cluster (TM-E 30-451); the firer sits in a slit trench about 15 yards to the flank with
 * his firing box on the cable. Carriage of the 3.7 cm PaK 35/36: a box axle beam with lightening slots, pressed
 * steel disc wheels on pneumatic tyres, tubular split-trail legs with small spades, a front support with a round
 * foot let down in action (US Intelligence Bulletin photographs). On the axle a turntable carries the upper
 * carriage: two side plates up to the trunnions, a horizontal traversing sector at the front, the elevating arc
 * under the cradle driven by a cross shaft from the handwheel on the left, the sight in its light-metal box with
 * a hinged lid on the left over the wheel (Intelligence Bulletin, March 1945).
 *
 * Rig (DESIGN.md "WW2 mode"): origin on the ground under the axle centre, front -Z. `traverse` the upper carriage
 * on the turntable, `elevation` the tube cluster at the trunnions, `recoil` and `breech` are empty (no recoil, no
 * breech: setBreech is a no-op). Extras: rig.setRounds(n) shows n rockets in the tubes (0..6; the last n of the
 * firing order, so the ripple empties them in order and the loading fills them in reverse), rig.anchors.muzzles[0..5]
 * the tube mouths in firing order, rig.anchors.tubes[0..5] the tubes' rear openings (same order), rig.anchors.cover
 * [{ x, z }] the crew's places in the slit trench (root space), rig.fireOrder (tube index per shot), rig.loadOrder.
 * Crew roles: firer (in cover, at the firing box), layer, loader, rocket0, rocket1. buildNbW41({ scheme })
 */
const WR = 0.36, WX = 0.68, TW = 0.14; // wheel radius over the tyre, half track, tyre width (1.6 m over the hubs)
const AXY = 0.39; // axle beam centre height
const TRY = 0.84, TRZ = 0.12; // trunnions (root): the cluster's axis about 0.95 m up (museum front and side views)
const CY = 0.1; // cluster axis above the trunnion axis (front views: the trunnions sit at the middle row's foot)
const TZ0 = -0.8, TZ1 = 0.5; // tube mouths and rear ends (elevation frame): 1.30 m
const RT = 0.086, RI = 0.081, RC = 2 * RT; // tube outer and inner radius; centres on a ring, so the tubes touch
const ANG = [30, 90, 150, 210, 270, 330].map((a) => a * DEG); // tube i about the cluster axis, from the top toward +X
const FIRE = [0, 3, 1, 4, 2, 5]; // the ripple's order: opposite tubes in turn, so the blast never tips the launcher
const COVER = { x: -12.4, z: 2.4 }; // the slit trench, about 15 yards to the flank (TM-E 30-451)
const COLLAR = -0.07; // the broad clamping collar just ahead of the trunnions (elevation frame)
const LEG = 2.3, SPREAD = 25 * DEG; // trail legs: length and the half angle they open to

const tubeAt = (i) => ({ x: Math.sin(ANG[i]) * RC, y: CY + Math.cos(ANG[i]) * RC, a: ANG[i] });

// The cluster's outline offset by m (convex hull of the six tubes: an arc round each, straight runs between),
// counter-clockwise as THREE.Shape wants it, relative to the cluster axis.
function outline(m, n = 6) {
  const pts = [];
  for (let i = 5; i >= 0; i--) {
    const cx = Math.sin(ANG[i]) * RC, cy = Math.cos(ANG[i]) * RC;
    for (let k = n; k >= 0; k--) {
      const b = ANG[i] - 30 * DEG + (60 * DEG * k) / n;
      pts.push(new THREE.Vector2(cx + Math.sin(b) * (RT + m), cy + Math.cos(b) * (RT + m)));
    }
  }
  return pts;
}
const hole = (x, y, r) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, true); return p; };
const extrude = (s, depth, curve = 10) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: curve });
// a frame plate round the cluster: the outline offset m, holes for the tubes (and the open middle), z0..z0+depth
function framePlate(m, z0, depth, middle = 0) {
  const s = new THREE.Shape(outline(m));
  for (let i = 0; i < 6; i++) { const t = tubeAt(i); s.holes.push(hole(t.x, t.y - CY, RT - 0.002)); } // inside the wall: touching tubes, holes apart
  if (middle) s.holes.push(hole(0, 0, middle));
  return extrude(s, depth, 14).translate(0, CY, z0);
}
// a hollow band round the outside of the cluster (the clamping ring), m0 inside, m1 outside
function band(m0, m1, z0, depth) {
  const s = new THREE.Shape(outline(m1));
  s.holes.push(new THREE.Path(outline(m0).reverse()));
  return extrude(s, depth).translate(0, CY, z0);
}
// a cable along a smooth curve through the points
const cable = (pts, r, seg = 40, radial = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), seg, r, radial, false);
// a horizontal toothed sector about the vertical axis (radius r0..r1 + teeth, angles a0..a1 from -Z toward +X)
function hSector(r0, r1, a0, a1, y0, t, teeth = 0, tooth = 0.012) {
  const s = new THREE.Shape(), n = 28;
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); s[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r0, -Math.cos(a) * r0); }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (a1 - a0) * (i / n), r = r1 + (teeth && Math.round((i / n) * teeth * 2) % 2 ? tooth : 0);
    s.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
  }
  // the shape is drawn as (x, -z) and extruded t thick, then laid flat (its y becomes world -Z)
  return extrude(s, t, 4).rotateX(Math.PI / 2).translate(0, y0 + t, 0);
}

// A PaK 35/36 wheel: pressed steel disc dished out to the hub, five wheel nuts, the hub boss and its cap.
function wheel(P, s) {
  const x = s * WX, Rr = WR * 0.7;
  P.add('tyre', tyreGeometry(WR, TW, 30, 72).applyMatrix4(xf(x, WR, 0)));
  P.add('camo', ring(Rr - 0.028, Rr + 0.004, x - TW * 0.42, x + TW * 0.42, 40).translate(0, WR, 0)); // the rim
  // the disc: from the rim in the tyre's middle plane out to the hub, 6 mm plate; listed so the faces point out
  const face = [[0.0, Rr - 0.02], [0.012, Rr - 0.05], [0.03, 0.16], [0.045, 0.1], [0.05, 0.06]];
  let pts = face.concat(face.slice().reverse().map(([dx, r]) => [dx - 0.007, r]));
  pts = pts.map(([dx, r]) => [s * dx, r]);
  if (s > 0) pts.reverse();
  P.add('camo', xLathe(pts, 32).applyMatrix4(xf(x, WR, 0)));
  P.add('camo', xTube(x + s * 0.045, x + s * 0.1, 0.07, 0.06, 16, WR, 0)); // hub boss
  P.add('dark', xTube(x + s * 0.1, x + s * 0.135, 0.042, 0.03, 12, WR, 0)); // hub cap
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    P.add('steel', xTube(x + s * 0.044, x + s * 0.062, 0.011, 0.011, 6, WR + Math.cos(a) * 0.098, Math.sin(a) * 0.098));
  }
}

export function buildNbW41({ scheme = 'dgelb' } = {}) {
  const rig = makeRig(scheme);
  const { root } = rig;

  // ---- lower carriage (does not traverse): axle beam, wheels, trail legs, front support, traversing sector
  const L = rig.part();
  for (const s of [-1, 1]) wheel(L, s);
  L.add('camo', box(0.96, 0.13, 0.15, 0, AXY, 0)); // the axle beam
  for (const s of [-1, 1]) {
    L.add('dark', box(0.2, 0.05, 0.006, s * 0.23, AXY, -0.076)); // lightening slots in the beam's face
    L.add('dark', box(0.2, 0.05, 0.006, s * 0.23, AXY, 0.076));
    L.add('camo', xTube(s * 0.47, s * 0.58, 0.072, 0.072, 16, AXY - 0.01, 0)); // spring drum (torsion suspension)
    L.add('dark', xTube(s * 0.578, s * 0.592, 0.06, 0.06, 14, AXY - 0.01, 0));
    L.add('camo', box(0.05, 0.1, 0.08, s * 0.6, (AXY + WR) / 2 - 0.01, 0.0)); // the crank down to the stub axle
    L.add('dark', xTube(s * 0.6, s * 0.67, 0.034, 0.034, 10, WR, 0));
    // the trail leg hinge on the beam's rear corner, the leg (a steel tube), its sleeve, clips, the spade
    const a = V(s * 0.25, AXY - 0.02, 0.1), d = V(s * Math.sin(SPREAD), 0, Math.cos(SPREAD));
    const b = a.clone().addScaledVector(d, LEG).setY(0.09);
    L.add('dark', box(0.1, 0.16, 0.12, s * 0.27, AXY - 0.01, 0.1)); // hinge lug
    L.add('dark', yTube(AXY - 0.1, AXY + 0.09, 0.022, 0.022, 8, s * 0.27, 0.1)); // hinge pin
    L.add('camo', rod(a, b, 0.038, 12));
    L.add('camo', rod(a.clone().lerp(b, 0.04), a.clone().lerp(b, 0.2), 0.047, 12)); // reinforcing sleeve
    for (const k of [0.38, 0.6, 0.8]) { // clips for the aiming posts and cleaning rods
      const c = a.clone().lerp(b, k);
      L.add('dark', box(0.03, 0.06, 0.03, c.x, c.y + 0.05, c.z, 0, s * SPREAD, 0));
    }
    // a stowed pole along the outside of each leg: aiming post on the left, cleaning rod on the right
    const off = V(s * Math.cos(SPREAD) * 0.05, 0.035, -s * Math.sin(SPREAD) * 0.05);
    L.add(s < 0 ? 'rust' : 'wood', rod(a.clone().lerp(b, 0.33).add(off), a.clone().lerp(b, 0.86).add(off), 0.014, 6));
    // the end: a short spade dug in, a lifting handle; the left leg carries the towing eye
    const e = b.clone().addScaledVector(d, 0.05);
    L.add('camo', box(0.11, 0.07, 0.14, e.x, 0.1, e.z, 0, s * SPREAD, 0)); // end fitting
    L.add('camo', box(0.26, 0.24, 0.014, e.x, 0.02, e.z + 0.08, -0.35, s * SPREAD, 0)); // spade
    L.add('dark', box(0.014, 0.16, 0.12, e.x, 0.05, e.z + 0.02, 0.7, s * SPREAD, 0)); // its brace
    const hn = V(Math.cos(SPREAD) * 0.07, 0, -s * Math.sin(SPREAD) * 0.07); // across the leg
    const h0 = e.clone().addScaledVector(d, -0.12).setY(0.16), h1 = h0.clone().addScaledVector(d, -0.14).setY(0.2);
    L.add('steel', rod(h0.clone().sub(hn), h0.clone().add(hn), 0.01, 6)); // the lifting handle across the leg
    L.add('steel', rod(h0.clone().sub(hn), h1.clone().sub(hn).setY(0.15), 0.008, 5));
    L.add('steel', rod(h0.clone().add(hn), h1.clone().add(hn).setY(0.15), 0.008, 5));
    if (s < 0) L.add('dark', new THREE.TorusGeometry(0.055, 0.014, 6, 16).rotateX(Math.PI / 2).rotateY(SPREAD).translate(e.x - Math.sin(SPREAD) * 0.1, 0.13, e.z + Math.cos(SPREAD) * 0.1));
  }
  // the front support let down in action: two tubular struts from the beam's front corners in a V to the
  // round foot, which has short spikes underneath (museum front views)
  const foot = V(0, 0.03, -0.5);
  for (const s of [-1, 1]) {
    L.add('dark', box(0.08, 0.07, 0.06, s * 0.3, AXY - 0.03, -0.09)); // hinge lug
    L.add('camo', rod(V(s * 0.3, AXY - 0.04, -0.1), V(s * 0.035, 0.09, foot.z + 0.01), 0.026, 10));
  }
  L.add('camo', box(0.12, 0.05, 0.08, 0, 0.085, foot.z + 0.01)); // the struts' shoe on the foot
  L.add('camo', yTube(0.004, 0.035, 0.16, 0.17, 24, foot.x, foot.z)); // the foot plate with its rim
  L.add('dark', yTube(0.035, 0.06, 0.04, 0.035, 10, foot.x, foot.z));
  // the turntable's lower race on the beam and the traversing sector at its front (teeth for the pinion)
  L.add('dark', yTube(AXY + 0.065, AXY + 0.075, 0.16, 0.16, 28, 0, 0));
  L.add('camo', hSector(0.12, 0.33, -58 * DEG, 58 * DEG, AXY + 0.04, 0.014));
  L.add('dark', hSector(0.33, 0.345, -58 * DEG, 58 * DEG, AXY + 0.04, 0.014, 36, 0.01));
  // the rocket crates by the stack (anchors.shellStack): wooden boxes with lids, rope handles, a stencilled band
  for (let i = 0; i < 4; i++) {
    const x = 2.5 + (i % 2) * 0.34, y = 0.13 + Math.floor(i / 2) * 0.27, z = 3.1, ry = 0.05 * i;
    L.add('wood', box(0.3, 0.24, 1.1, x, y - 0.01, z, 0, ry, 0));
    L.add('wood', box(0.31, 0.03, 1.11, x, y + 0.12, z, 0, ry, 0), { tint: 0xc8bca0 }); // lid
    L.add('dark', box(0.305, 0.07, 0.04, x, y, z - 0.3, 0, ry, 0)); // stencil band (contents and lot)
    for (const e of [-1, 1]) L.add('rope', box(0.012, 0.03, 0.12, x + Math.cos(ry) * 0.155, y + 0.02, z + e * 0.4 - Math.sin(ry) * 0.155));
  }
  L.build(root, { dirt: 0.55 });

  // ---- the firing position off to the flank (DESIGN.md: the crew fire from cover): a slit trench with a low
  // sandbag parapet toward the launcher, the firing box, the cable from the launcher. Kept out of the rig's
  // bounding box (geometry.boundingBox emptied below) so a viewer frames the launcher; drawing is unaffected.
  const W = rig.part();
  const px = COVER.x + 0.65;
  for (let i = 0; i < 9; i++) {
    const z = COVER.z - 1.9 + i * 0.5;
    W.add('sandbag', box(0.42, 0.18, 0.5, px, 0.09, z, 0, 0, 0.04 * (i % 2 ? 1 : -1)));
    if (i % 2 === 0) W.add('sandbag', box(0.4, 0.16, 0.5, px, 0.26, z + 0.25, 0, 0, 0));
  }
  W.add('soil', box(0.9, 0.06, 4.6, COVER.x + 1.3, 0.02, COVER.z, 0, 0, 0.08)); // spoil, thrown up toward the launcher
  W.add('dark', box(0.22, 0.14, 0.12, px - 0.3, 0.07, COVER.z - 0.55)); // the firing box (Glühzündgerät)
  W.add('steel', box(0.04, 0.03, 0.04, px - 0.3, 0.155, COVER.z - 0.55));
  W.add('dark', xTube(px - 0.19, px - 0.13, 0.012, 0.012, 6, 0.08, COVER.z - 0.55)); // the cable's plug
  // the firing cable: from the turntable (where the lead comes down the right side plate) along the ground,
  // under the trail, out to the trench
  W.add('rubber', cable([V(0.05, AXY + 0.06, 0.12), V(0.12, 0.28, 0.24), V(0.16, 0.02, 0.46), V(0.05, 0.015, 0.95),
    V(-0.55, 0.015, 1.3), V(-2.4, 0.015, 1.65), V(-5, 0.015, 1.35), V(-8, 0.015, 2.05), V(-10.2, 0.015, 1.7), V(px - 0.18, 0.02, COVER.z - 0.55)], 0.008, 140, 4));
  const remote = new THREE.Group();
  remote.name = 'remote';
  root.add(remote);
  W.build(remote, { dirt: 0.2 });

  // ---- upper carriage (traverse) on the turntable: side plates up to the trunnions, the elevating and
  // traversing gear and handwheels on the left, the sight box
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const T = rig.part();
  T.add('camo', yTube(AXY + 0.075, AXY + 0.09, 0.15, 0.15, 28, 0, 0)); // the turntable's upper race
  for (const s of [-1, 1]) {
    T.add('camo', box(0.26, 0.026, 0.44, s * 0.235, AXY + 0.1, -0.06)); // the saddle each side of the elevating arc
    // the side plate from the saddle up to the trunnion boss, a flange along its front edge
    const plate = [[-0.26, AXY + 0.09], [0.16, AXY + 0.09], [0.22, 0.66], [0.2, TRY + 0.07], [0.08, TRY + 0.09], [0.02, TRY + 0.02], [-0.15, 0.6]];
    T.add('camo', sideProfile(plate, 0.02).translate(s * 0.36, 0, 0));
    T.add('camo', rod(V(s * 0.36, AXY + 0.1, -0.26), V(s * 0.36, 0.57, -0.14), 0.016, 6).applyMatrix4(xf(0, 0, 0, 0, 0, 0, V(1.2, 1, 1))));
    T.add('camo', xTube(s * 0.35, s * 0.405, 0.05, 0.05, 16, TRY, TRZ)); // trunnion boss
    T.add('dark', xTube(s * 0.405, s * 0.42, 0.034, 0.034, 12, TRY, TRZ)); // its cap
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      T.add('steel', xTube(s * 0.405, s * 0.415, 0.007, 0.007, 6, TRY + Math.cos(a) * 0.04, TRZ + Math.sin(a) * 0.04));
    }
  }
  T.add('camo', box(0.74, 0.05, 0.05, 0, AXY + 0.11, -0.27)); // front cross member
  // elevating gear: the cross shaft from the handwheel on the left to the pinion under the cradle's arc
  const PE = { y: TRY - 0.355 * Math.cos(40 * DEG), z: TRZ - 0.355 * Math.sin(40 * DEG) };
  T.add('dark', xTube(-0.47, 0.03, 0.014, 0.014, 8, PE.y, PE.z));
  T.add('dark', xTube(-0.016, 0.016, 0.031, 0.031, 14, PE.y, PE.z)); // pinion
  T.add('camo', box(0.05, 0.07, 0.06, -0.39, PE.y, PE.z)); // bearing outside the left plate
  addHandwheel(T, -0.47, PE.y, PE.z, 0.1, -1);
  // traversing gear: the pinion on the sector, its shaft and bevel box, the handwheel on the left
  T.add('dark', yTube(AXY + 0.035, AXY + 0.075, 0.025, 0.025, 12, 0, -0.37));
  T.add('dark', yTube(AXY + 0.075, AXY + 0.15, 0.012, 0.012, 8, 0, -0.37));
  T.add('camo', box(0.07, 0.06, 0.07, 0, AXY + 0.17, -0.37)); // bevel box
  T.add('dark', xTube(-0.47, -0.03, 0.012, 0.012, 8, AXY + 0.17, -0.37));
  T.add('camo', box(0.05, 0.06, 0.05, -0.39, AXY + 0.17, -0.33));
  addHandwheel(T, -0.47, AXY + 0.17, -0.37, 0.085, -1);
  // the sight in its light-metal box on the left (lid sloping down to the front, hinged there), the sight's
  // head and eyepiece above it
  const SB = { x: -0.48, w: 0.16, z0: 0.01, z1: 0.29, y0: 0.8, yf: 0.96, yr: 1.02 };
  T.add('camo', sideProfile([[SB.z0, SB.y0], [SB.z1, SB.y0], [SB.z1, SB.yr], [SB.z0, SB.yf]], SB.w).translate(SB.x, 0, 0));
  const lid = Math.atan2(SB.yr - SB.yf, SB.z1 - SB.z0), lz = (SB.z0 + SB.z1) / 2, ly = (SB.yf + SB.yr) / 2 + 0.006;
  T.add('camo', box(SB.w + 0.012, 0.008, Math.hypot(SB.z1 - SB.z0, SB.yr - SB.yf) + 0.012, SB.x, ly, lz, -lid, 0, 0)); // the lid
  T.add('steel', xTube(SB.x - SB.w / 2, SB.x + SB.w / 2, 0.006, 0.006, 6, SB.yf + 0.004, SB.z0)); // its hinge
  T.add('steel', box(0.03, 0.03, 0.012, SB.x, SB.yr - 0.04, SB.z1 + 0.006)); // catch
  T.add('camo', box(0.08, 0.06, 0.12, -0.39, SB.y0 + 0.06, lz)); // bracket to the side plate
  panoramicSight(T, SB.x + 0.01, SB.y0 + 0.12, 0.17, -1);
  // the firing lead down the right side plate from the trunnion to the turntable
  T.add('rubber', cable([V(0.43, TRY - 0.03, TRZ + 0.04), V(0.42, TRY - 0.16, TRZ + 0.1), V(0.39, 0.6, 0.16), V(0.25, AXY + 0.13, 0.14), V(0.05, AXY + 0.07, 0.12)], 0.008, 24, 5));
  T.build(trav, { dirt: 0.5 });

  // ---- the tube cluster (elevation): tubes, collar, rear plate, latches and contacts, contact rods, leads,
  // the junction box, the cradle with its trunnions and the elevating arc
  const el = pivotAt(rig, trav, 'elevation', 0, TRY, TRZ);
  const E = rig.part();
  const tubes = [];
  const rv = [];
  for (let i = 0; i < 6; i++) {
    const t = tubeAt(i);
    tubes.push(t);
    // the tube: rolled bead at the mouth, the plain sheet-steel body; the bore inside (normals inward)
    E.add('camo', zLathe([[TZ0, RT + 0.002], [TZ0 + 0.004, RT + 0.004], [TZ0 + 0.012, RT], [TZ1, RT]], 28).translate(t.x, t.y, 0));
    E.add('char', zLathe([[TZ1, RI], [TZ0, RI]], 28).translate(t.x, t.y, 0)); // the bore, sooted (matte, no sheen)
    E.add('camo', new THREE.RingGeometry(RI, RT + 0.002, 28).rotateY(Math.PI).translate(t.x, t.y, TZ0)); // the mouth's edge
    E.add('dark', new THREE.RingGeometry(RI, RT, 28).translate(t.x, t.y, TZ1)); // the rear end
    // three guide rails inside, at the top and 120 degrees either side; their rivet heads in rows outside
    for (let j = 0; j < 3; j++) {
      const ga = (j * TAU) / 3, sx = Math.sin(ga), sy = Math.cos(ga);
      E.add('iron', box(0.011, 0.008, TZ1 - TZ0 - 0.02, t.x + sx * (RI - 0.004), t.y + sy * (RI - 0.004), (TZ0 + TZ1) / 2, 0, 0, -ga));
      for (let k = 0; k < 7; k++) rv.push({ p: V(t.x + sx * RT, t.y + sy * RT, TZ0 + 0.06 + k * 0.17), n: V(sx, sy, 0) });
    }
  }
  // rivet heads, merged by direction (rivets() takes one normal per call)
  for (let j = 0; j < 3; j++) {
    const ga = (j * TAU) / 3, n = V(Math.sin(ga), Math.cos(ga), 0);
    E.add('camo', rivets(rv.filter((r, k) => k % 21 >= j * 7 && k % 21 < j * 7 + 7).map((r) => r.p), n, 0.007, 0.7));
  }
  E.add('camo', band(-0.001, 0.03, COLLAR - 0.055, 0.11)); // the collar
  for (const dz of [-0.035, 0.035]) E.add('dark', box(0.04, 0.034, 0.03, 0, CY + RC * Math.cos(30 * DEG) + RT + 0.04, COLLAR + dz)); // its clamp bolts
  E.add('camo', framePlate(0.03, COLLAR - 0.008, 0.016, RC - RT - 0.012));
  E.add('camo', framePlate(0.036, TZ1 - 0.026, 0.026)); // the rear plate, flush with the tube ends
  E.add('camo', band(0.0, 0.036, TZ1 - 0.07, 0.07));
  for (let i = 0; i < 6; i++) {
    const t = tubes[i], ox = Math.sin(t.a), oy = Math.cos(t.a);
    // bolts round each tube on the rear plate
    for (const da of [-50, -18, 18, 50]) {
      const b = t.a + da * DEG, r = RT + 0.018;
      E.add('dark', zTube(TZ1, TZ1 + 0.008, 0.007, 0.007, 6, t.x + Math.sin(b) * r, t.y + Math.cos(b) * r));
    }
    // the hook latch that holds the rocket in: pivot block on the rim, the hook over the tube's edge, the loop handle
    const pr = RC + RT + 0.02, bx = Math.sin(t.a) * pr, by = CY + Math.cos(t.a) * pr;
    E.add('dark', box(0.032, 0.022, 0.03, bx, by, TZ1 + 0.012, 0, 0, -t.a));
    E.add('steel', rod(V(bx, by, TZ1 + 0.024), V(bx - ox * 0.04, by - oy * 0.04, TZ1 + 0.02), 0.005, 5));
    E.add('steel', new THREE.TorusGeometry(0.026, 0.004, 4, 10, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2 - t.a).translate(bx + ox * 0.004, by + oy * 0.004, TZ1 + 0.028));
    // the contact rod along the tube from the collar to its lever at the rear plate (the knobbed rods of the photos)
    const ra = t.a + 34 * DEG, rr = RT + 0.011, rx = t.x + Math.sin(ra) * rr, ry = t.y + Math.cos(ra) * rr;
    E.add('steel', zTube(COLLAR + 0.07, TZ1 - 0.03, 0.006, 0.006, 6, rx, ry));
    E.add('dark', zTube(COLLAR + 0.05, COLLAR + 0.08, 0.012, 0.012, 8, rx, ry)); // knob
    E.add('dark', box(0.02, 0.016, 0.02, rx, ry, (COLLAR + TZ1) / 2, 0, 0, -ra)); // clip
    // the firing contact (turned aside for loading) beside it, its lead
    const ca = t.a + 34 * DEG, cr = RT + 0.02, cx = t.x + Math.sin(ca) * cr, cy = t.y + Math.cos(ca) * cr;
    E.add('dark', box(0.026, 0.02, 0.036, cx, cy, TZ1 + 0.016, 0, 0, -ca));
    E.add('steel', rod(V(cx, cy, TZ1 + 0.034), V(cx - Math.sin(ca) * 0.026, cy - Math.cos(ca) * 0.026, TZ1 + 0.04), 0.004, 4));
    // the lead: out to the loom round the rear plate, round the outline to the junction box's side (upper
    // right, 60 degrees), then forward along the groove between tubes 0 and 1 into the box
    const lp = [V(cx, cy, TZ1 + 0.02)];
    const a0 = Math.atan2(cx, cy - CY), a1 = 60 * DEG;
    let da = a1 - a0;
    if (da > Math.PI) da -= TAU;
    if (da < -Math.PI) da += TAU;
    // the loom hugs the rear band (radius 0.30) and the leads lie side by side in it (z steps of 1 cm)
    const lr = RC + RT + 0.042, lz = TZ1 - 0.012 - 0.009 * i, steps = Math.max(2, Math.ceil(Math.abs(da) / (20 * DEG)));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      lp.push(V(Math.sin(a) * lr, CY + Math.cos(a) * lr, lz));
    }
    lp.push(V(Math.sin(a1) * (lr - 0.012), CY + Math.cos(a1) * (lr - 0.012), TZ1 - 0.12), V(Math.sin(a1) * 0.285, CY + Math.cos(a1) * 0.285, 0.34));
    E.add('rubber', cable(lp, 0.004, 12 + steps * 4, 4));
  }
  // the junction box on the upper right-hand side (TM-E 30-451), its cover and the firing lead's socket
  const JA = 60 * DEG, JR = RC * Math.cos(30 * DEG) + RT + 0.045, jx = Math.sin(JA) * JR, jy = CY + Math.cos(JA) * JR;
  E.add('camo', box(0.11, 0.09, 0.15, jx, jy, 0.27, 0, 0, -JA));
  E.add('camo', box(0.118, 0.014, 0.158, jx + Math.sin(JA) * 0.048, jy + Math.cos(JA) * 0.048, 0.27, 0, 0, -JA)); // the cover
  E.add('dark', box(0.112, 0.004, 0.152, jx + Math.sin(JA) * 0.04, jy + Math.cos(JA) * 0.04, 0.27, 0, 0, -JA)); // its seam
  for (const dz of [-0.06, 0.06]) E.add('steel', box(0.02, 0.018, 0.012, jx + Math.sin(JA) * 0.05 - Math.cos(JA) * 0.05, jy + Math.cos(JA) * 0.05 + Math.sin(JA) * 0.05, 0.27 + dz, 0, 0, -JA)); // clips
  E.add('dark', zTube(0.12, 0.2, 0.014, 0.014, 8, jx + 0.03, jy - 0.02));
  E.add('rubber', cable([V(jx + 0.03, jy - 0.02, 0.13), V(0.33, CY + 0.02, 0.08), V(0.33, -0.05, 0.04), V(0.345, -0.03, 0.01)], 0.008, 16, 5));
  // the cradle under the cluster: a U-section trough, its sides up to the trunnion pins
  const U = [[-0.306, 0.1], [-0.306, -0.08], [-0.18, -0.157], [0.18, -0.157], [0.306, -0.08], [0.306, 0.1], [0.294, 0.1], [0.294, -0.074], [0.175, -0.145], [-0.175, -0.145], [-0.294, -0.074], [-0.294, 0.1]];
  E.add('camo', extrude(new THREE.Shape(U.map(([x, y]) => new THREE.Vector2(x, y))), 0.6, 1).translate(0, 0, -0.16));
  for (const s of [-1, 1]) {
    E.add('steel', xTube(s * 0.306, s * 0.352, 0.032, 0.032, 14, 0, 0)); // trunnion pin
    E.add('camo', xTube(s * 0.3, s * 0.315, 0.06, 0.06, 16, 0, 0)); // its reinforcing plate on the cradle side
  }
  // the elevating arc under the cradle (teeth outward for the pinion), on a web plate
  E.add('dark', gearArc(0.29, 0.32, 82 * DEG, 138 * DEG, 0.03, 18, 0.016));
  const web = [];
  for (let k = 0; k <= 8; k++) { const a = (82 + 56 * (k / 8)) * DEG; web.push([0.291 * Math.cos(a), -0.291 * Math.sin(a)]); }
  web.push([-0.17, -0.15], [0.035, -0.15]);
  E.add('camo', sideProfile(web, 0.016));
  E.build(el, { dirt: 0.25, y0: TRY });

  // ---- rockets in the tubes (setRounds), the empty recoil and breech pivots of the contract
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  pivotAt(rig, rc, 'breech', 0, CY, TZ1);
  const rk = buildShell('nbw41', 12), rocketLen = rk.length;
  // One instanced mesh per material for the six rockets (3 draws, not 18): a rocket out of its tube is a
  // zero-scale instance. Loaded, the base sits 3 cm inside the rear end (the crew drill pushes it that far).
  const shown = tubes.map((t) => new THREE.Matrix4().makeTranslation(t.x, t.y, TZ1 - 0.03 - rocketLen / 2));
  const gone = new THREE.Matrix4().makeScale(0, 0, 0);
  const inst = rk.parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geometry, p.material, 6);
    m.name = 'shell-rocket';
    for (let i = 0; i < 6; i++) m.setMatrixAt(i, shown[i]);
    m.computeBoundingSphere();
    m.computeBoundingBox();
    rc.add(m);
    return m;
  });
  rig.fireOrder = FIRE.slice();
  rig.loadOrder = FIRE.slice().reverse();
  rig.rounds = -1;
  rig.setRounds = (n) => {
    n = Math.max(0, Math.min(6, n | 0));
    if (n === rig.rounds) return;
    rig.rounds = n;
    for (let j = 0; j < 6; j++) {
      const i = FIRE[j], on = j >= 6 - n;
      for (const m of inst) m.setMatrixAt(i, on ? shown[i] : gone);
    }
    for (const m of inst) m.instanceMatrix.needsUpdate = true;
  };
  rig.setRounds(6);
  rig.setBreech = () => {};
  rig.setShell = () => {};
  rig.recoilLength = 0;

  // ---- anchors
  rig.anchors.eye = node(trav, 'eye', 0, 1.2, 0.6);
  rig.anchors.muzzle = node(el, 'muzzle', 0, CY, TZ0);
  rig.anchors.breech = node(el, 'breech', 0, CY, TZ1 + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, CY, TZ1 + rocketLen / 2 + 0.05);
  rig.anchors.shellStack = node(root, 'shellStack', 2.5, 0.12, 2.8);
  const muzzles = FIRE.map((i) => node(el, 'muzzle' + i, tubes[i].x, tubes[i].y, TZ0));
  rig.anchors.tubes = FIRE.map((i) => node(el, 'tube' + i, tubes[i].x, tubes[i].y, TZ1));
  rig.anchors.cover = [0, 1, 2, 3, 4].map((i) => ({ x: COVER.x - 0.1 * (i % 2), z: COVER.z - 1.4 + i * 0.75 }));
  rig.loadEl = 10 * DEG;

  crew(rig, 'firer', COVER.x, COVER.z - 0.55, L90, 'crouch');
  crew(rig, 'layer', -0.75, 0.45, L90, 'lay');
  crew(rig, 'loader', -0.3, 1.9, 0, 'stand');
  crew(rig, 'rocket0', 1.3, 1.9, R90, 'stand');
  crew(rig, 'rocket1', 1.9, 2.4, R90, 'stand');

  hb(rig, -0.85, 0, -0.95, 0.85, 1.3, 0.7);
  hb(rig, -1.3, 0, 0.7, 1.3, 0.4, 2.3);
  const out = finishRig(rig, 'nbw41', 'nbw41');
  out.anchors.muzzles = muzzles;
  // the remote firing position stays out of the bounds (see above): an empty box adds nothing to Box3.setFromObject
  remote.traverse((o) => { if (o.isMesh) o.geometry.boundingBox = new THREE.Box3(); });
  return out;
}

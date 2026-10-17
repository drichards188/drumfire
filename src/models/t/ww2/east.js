import * as THREE from 'three';
import { V, box, rbox, sphere, rod, xTube, yTube, zTube, loft, projectUV } from '../../kit.js';
import { FParts } from '../mats.js';
import { damageable, finishTarget } from '../damage.js';
import { partLayout } from '../layout.js';
import { rng } from '../props.js';
import { makeRig, pivotAt, node, ring, addHandwheel, addDialSight, crew, L90, R90 } from '../fieldkit.js';
import { ss, place, arch, field, span, rockMesh, limestone, wire, trench, net } from './east_kit.js';
import { buildCitadel, buildGate, buildEastFort } from './east_brest.js';

// The WW2 mode's eastern targets (DESIGN.md "WW2 mode (German side)"), in the target API of
// models/targets.js: { root, parts, setDamage(i, k), anchors: { burn, top, center }, rigs? }, parts at
// partLayout(kind) (ww2/layout_east.js). Sevastopol, June 1942 here; Brest-Litovsk, June 1941 in
// east_brest.js. Every site faces local -Z (toward the German guns).

// ------------------------------------------------------------------ turret

// A coastal battery of the Maxim Gorky I type (30th Battery): the concrete battery block buried in a
// hillside, two MB-2-12 armoured twin 305 mm turrets on its roof (low gunhouses with a sloped front
// plate, a long crosswise rangefinder on the roof's rear, two 52-calibre barrels 16 m long), the
// command post with its own armoured cupola and rangefinder behind them, ventilation heads, the
// rear wall of the block with its entrances between concrete wing walls, wire round the foot of the hill.
// Parts: the two turrets. Damage knocks a gunhouse askew on its roller path, drops the barrels and chars it.
const TOP = 3.2; // the block's roof (and the hill's plateau) over the site's ground
const DRY = 0xc8b48a; // tint over the earth texture: the dry Crimean summer grass

function gunhouse(i, l, r) {
  const part = new THREE.Group();
  part.position.set(l.x, TOP, l.z);
  const house = new THREE.Group(), guns = [];
  house.position.y = 0.45;
  house.rotation.y = (i ? -1 : 1) * 0.05;
  part.add(house);
  const P = new FParts('green'), S = new FParts('green');
  // the barbette: the concrete apron round the well and the armoured glacis ring
  S.add('concrete', yTube(-1.2, 0.05, 10.5, 10.5, 32), { tint: 0xd8d4c8 });
  S.add('iron', yTube(0.05, 0.5, 6.9, 6.7, 32));
  S.build(part, { dirt: 0.3, y0: TOP });
  // gunhouse: plan with a flat front, chamfers and a round back; the top ring set in so the front plate slopes
  const plan = [[-4.4, -5.8], [4.4, -5.8], [6.1, -3.6]];
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI; plan.push([Math.cos(a) * 6.3, 0.4 + Math.sin(a) * 6.0]); }
  plan.push([-6.1, -3.6]);
  const ringAt = (y, f) => plan.map(([x, z]) => V(x * f, y, z < 0 ? z * (f - (y > 1 ? 0.2 : 0)) : z * f));
  P.add('camo', loft([ringAt(0, 1), ringAt(3.0, 0.95)], { crease: 0.5 }), { tint: 0xb8beb0 });
  P.add('iron', loft([ringAt(-0.05, 1.02), ringAt(0.25, 1.02)], { crease: 0.5 }));
  // the rangefinder across the roof's rear, its armoured hoods out over the sides
  P.add('camo', box(14.2, 1.0, 1.4, 0, 3.4, 2.4), { tint: 0xb0b6a8 });
  for (const s of [-1, 1]) P.add('camo', rbox(1.3, 1.6, 1.9, 0.2, s * 7.1, 3.35, 2.4), { tint: 0xb0b6a8 });
  P.add('dark', box(14.4, 0.25, 0.08, 0, 3.55, 1.66));
  // roof furniture: commander's and gunlayers' periscope cupolas, hatches, the ventilator, lifting eyes
  for (const [x, z] of [[-2.6, -1.4], [2.6, -1.4], [0, 0.8]]) {
    P.add('iron', yTube(2.95, 3.5, 0.55, 0.45, 12, x, z));
    P.add('dark', box(0.5, 0.12, 0.08, x, 3.32, z - 0.47));
  }
  for (const s of [-1, 1]) P.add('iron', box(1.2, 0.12, 1.0, s * 3.8, 3.05, 4.4));
  P.add('iron', yTube(3.0, 3.3, 0.35, 0.35, 10, 0, 4.6));
  // the gun ports in the front plate, with their armoured shields
  for (const s of [-1, 1]) {
    P.add('char', box(1.6, 1.4, 0.4, s * 1.45, 1.55, -5.25, -0.42));
    P.add('iron', box(2.1, 2.0, 0.3, s * 1.45, 1.55, -5.45, -0.42));
  }
  P.build(house, { dirt: 0.25, y0: TOP });
  // the barrels: each on its own trunnion so damage can drop them
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 1.45, 1.55, -5.4);
    g.rotation.x = 0.03 + r() * 0.03;
    const B = new FParts('green');
    B.add('iron', zTube(0.5, -1.2, 0.62, 0.6, 18)); // the mantlet sleeve
    B.add('iron', zTube(-1.2, -6.5, 0.46, 0.4, 18));
    B.add('iron', zTube(-6.5, -14.0, 0.4, 0.31, 18));
    B.add('iron', zTube(-14.0, -14.6, 0.36, 0.36, 18));
    B.add('char', new THREE.CircleGeometry(0.2, 12).rotateY(Math.PI).translate(0, 0, -14.62));
    B.build(g, { dirt: 0, y0: 5 });
    house.add(g);
    guns.push(g);
  }
  damageable(part, {
    scorch: 16, char: 0.8,
    bits: [
      { obj: house, k0: 0.25, k1: 0.95, pos: [i ? -0.6 : 0.6, -0.7, 0.5], rot: [0.1, i ? -0.45 : 0.4, i ? 0.16 : -0.14] },
      { obj: guns[0], k0: 0.15, k1: 0.8, rot: [-0.3, 0.06, 0.05] },
      { obj: guns[1], k0: 0.3, k1: 1, pos: [0.3, -0.2, 0.6], rot: [-0.18, -0.12, 0] },
    ],
  });
  return part;
}

function buildTurret() {
  const root = new THREE.Group(), r = rng(1942);
  const lay = partLayout('turret');
  const parts = lay.map((l, i) => { const p = gunhouse(i, l, r); root.add(p); return p; });

  // the hill: a plateau at the block's roof, a long glacis to the front, the rear cut off by the block's back wall
  const H = new FParts('green');
  H.add('earth', field(span(-62, 62, 50), span(-50, 30, 40), (x, z) => {
    const ax = Math.abs(x), env = (1 - ss(34, 58, ax)) * ss(-48, -12, z) * (1 - ss(14, 28, z));
    if (ax < 35 && z > 15.6) return -1.5;
    return (TOP + Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.25) * env - 0.8 * (1 - env); // the skirt runs under the terrain
  }), { tint: DRY });
  H.build(root, { dirt: 0.2 });

  const C = new FParts('green');
  // the block's rear wall with its entrances (portals with steel doors and blast walls), wing walls, the roof's edge
  C.add('concrete', box(70.6, TOP + 1.6, 1.4, 0, (TOP - 1.6) / 2 + 0.4, 16.3), { tint: 0xd0ccc0 });
  C.add('concrete', box(71, 0.5, 2.0, 0, TOP + 0.25, 16.2), { tint: 0xc8c4b8 });
  for (const s of [-1, 1]) C.add('concrete', place(box(1.2, TOP + 1.2, 10.5), s * 35.4, (TOP - 1.2) / 2 + 0.3, 21, s * -0.25), { tint: 0xd0ccc0 });
  for (const x of [-24, -6, 6, 24]) {
    C.add('char', box(2.2, 2.6, 0.3, x, 1.3, 17.05));
    C.add('dark', box(2.0, 2.4, 0.1, x + 0.1, 1.25, 17.2));
    C.add('concrete', box(3.4, 0.5, 0.6, x, 2.85, 17.2), { tint: 0xc0bcb0 });
    C.add('concrete', box(4.6, 2.8, 0.9, x, 1.4, 20.4), { tint: 0xd0ccc0 }); // blast wall in front of the door
  }
  for (let k = 0; k < 14; k++) C.add('dark', box(0.5, 0.35, 0.1, -32 + k * 4.9, 2.2, 17.05)); // ventilation grilles
  // the command post: concrete base, an armoured conning cupola, the rangefinder arms
  C.add('concrete', yTube(TOP - 0.5, TOP + 1.0, 4.4, 3.8, 20, 0, 8), { tint: 0xd8d4c8 });
  C.add('iron', yTube(TOP + 1.0, TOP + 2.6, 2.3, 2.0, 18, 0, 8));
  C.add('iron', sphere(2.0, 0, TOP + 2.6, 8, 1, 0.35, 1, 18));
  C.add('char', box(2.6, 0.18, 0.3, 0, TOP + 2.1, 5.95));
  C.add('iron', xTube(-4.5, 4.5, 0.32, 0.32, 12, TOP + 2.4, 8.2));
  for (const s of [-1, 1]) C.add('iron', rbox(0.9, 1.0, 1.1, 0.15, s * 4.8, TOP + 2.4, 8.2));
  // ventilation heads (mushrooms) and armoured observation slits on the plateau
  for (const [x, z] of [[-30, 4], [-6, 9], [6, 9], [30, 4], [-2, -9], [2, -9], [0, 13]]) {
    C.add('concrete', yTube(TOP - 0.4, TOP + 0.9, 0.32, 0.3, 10, x, z), { tint: 0xa8a498 });
    C.add('iron', yTube(TOP + 0.9, TOP + 1.15, 0.6, 0.25, 12, x, z));
  }
  // a stair down the side, the access road round the hill to the rear
  C.add('concrete', place(box(3, 0.4, 14), 40, 1.2, 14, 0.15, -0.18), { tint: 0xc8c4b8 });
  C.add('earth', place(box(6, 0.12, 50), 0, 0.06, 40), { tint: 0xd8c8a8 });
  C.build(root, { dirt: 0.35 });

  // perimeter: trenches and two belts of wire round the foot of the hill, scrub on the slopes
  const W = new FParts('green');
  trench(W, [[-58, -40], [-40, -46], [-22, -42], [-6, -50], [10, -44], [28, -49], [46, -41], [60, -30]], { r });
  for (const [a, b] of [[[-70, -52], [-30, -60]], [[-30, -60], [10, -58]], [[10, -58], [50, -60]], [[50, -60], [72, -40]]]) wire(W, a[0], a[1], b[0], b[1], r);
  for (let k = 0; k < 34; k++) {
    const x = (r() - 0.5) * 120, z = -50 + r() * 70;
    if (Math.abs(Math.abs(x) - 18) < 12 && Math.abs(z) < 12) continue;
    const ex = 1 - ss(34, 58, Math.abs(x)), y = Math.abs(x) < 35 && z > 15 ? 0 : TOP * ex * ss(-48, -12, z) * (1 - ss(14, 28, z));
    W.add('matte', sphere(1, x, y + 0.2, z, 0.5 + r() * 0.6, 0.4 + r() * 0.3, 0.5 + r() * 0.6, 7), { tint: r() < 0.5 ? 0x48502e : 0x5e5a38 });
  }
  W.build(root, { dirt: 0.2 });
  return finishTarget(root, parts);
}

// ------------------------------------------------------------------ fort

// One of the Sevastopol forts of the northern sector (Fort Stalin, Fort Molotov): an earth-covered
// concrete work on a low rise, its front a blunt salient with three casemates (the parts) whose fronts
// stand out of the earth, each with a gun embrasure between splayed wing walls, an armoured
// observation cupola on the earth roof, fire trenches and two belts of wire before it, concrete entrances
// behind. Damage lifts and cracks a casemate's roof slab, drops its front wall into the ditch and kicks the gun out.
const FORT_FRONT = (x) => { const a = Math.abs(x); return a < 25 ? -16 + (a / 25) * 12 : -4 + (a - 25) * 0.25; }; // the front line of the trace

function casemate(l, i, r) {
  const part = new THREE.Group();
  part.position.set(l.x, 0, l.z);
  part.rotation.y = l.x === 0 ? 0 : -Math.sign(l.x) * 0.45; // the flank casemates face out along the salient's faces
  const body = new THREE.Group(), roof = new THREE.Group(), front = new THREE.Group(), gun = new THREE.Group();
  part.add(body, roof, front, gun);
  const B = new FParts('green');
  B.add('concrete', box(11, 5.6, 9, 0, 1.6, 0.5), { tint: 0xc8c4b8 });
  for (const s of [-1, 1]) B.add('concrete', place(box(1.0, 4.0, 6.5), s * 8.3, 0.9, -3.1, s * 1.07), { tint: 0xc8c4b8 }); // wing walls splayed back from the front corners
  B.build(body, { dirt: 0.5 });
  const F = new FParts('green');
  front.position.set(0, -1.2, -4.0);
  F.add('concrete', box(10, 5.4, 1.2, 0, 2.7, 0), { tint: 0xd0ccc0 });
  F.add('char', box(2.6, 1.3, 1.4, 0, 3.1, 0)); // the embrasure, stepped
  F.add('concrete', box(3.6, 0.35, 1.5, 0, 3.95, -0.1), { tint: 0xb8b4a8 });
  F.add('concrete', box(3.6, 0.35, 1.5, 0, 2.3, -0.1), { tint: 0xb8b4a8 });
  F.add('iron', box(1.4, 1.0, 0.2, 0, 3.1, -0.4)); // the gun shield in the embrasure
  F.build(front, { dirt: 0.5, y0: -1.2 });
  const G = new FParts('green');
  gun.position.set(0, 1.9, -4.3);
  G.add('iron', zTube(0.2, -3.6, 0.09, 0.08, 10));
  G.add('iron', zTube(0.2, -0.6, 0.18, 0.18, 10));
  G.build(gun, { dirt: 0 });
  const R = new FParts('green');
  roof.position.y = 4.4;
  R.add('concrete', box(12, 1.3, 10, 0, 0, 0.3), { tint: 0xbcb8ac });
  R.add('earth', sphere(1, 0, 0.55, 1.4, 6.6, 1.5, 5.2, 12), { tint: DRY });
  R.add('iron', yTube(1.4, 2.4, 1.0, 0.9, 14, 2.5, 1.0)); // observation cupola
  R.add('iron', sphere(0.9, 2.5, 2.4, 1.0, 1, 0.4, 1, 12));
  R.add('char', box(1.0, 0.15, 0.2, 2.5, 2.1, 0.08));
  R.build(roof, { dirt: 0.2, y0: 4.4 });
  damageable(part, {
    scorch: 12, char: 0.8, sink: 0.4,
    bits: [
      { obj: roof, k0: 0.2, k1: 0.9, pos: [0.4, -1.3, 0.6], rot: [0.16, 0.1, i === 1 ? -0.14 : 0.12] },
      { obj: front, k0: 0.4, k1: 1, pos: [0, -0.6, -0.8], rot: [-0.55, 0.08, 0.1] },
      { obj: gun, k0: 0.3, k1: 0.8, pos: [0.4, -1.3, -1.6], rot: [-0.5, 0.6, 0.3] },
    ],
  });
  return part;
}

function buildFort() {
  const root = new THREE.Group(), r = rng(1941);
  const lay = partLayout('fort');
  const parts = lay.map((l, i) => { const p = casemate(l, i, r); root.add(p); return p; });
  // the earth cover: rises from the casemate fronts to a crest 5.5 m up, falls away behind
  const ground = (x, z) => {
    const fz = FORT_FRONT(x), env = (1 - ss(40, 62, Math.abs(x))) * ss(fz - 1, fz + 9, z) * (1 - ss(14, 34, z));
    return (5.6 + Math.sin(x * 0.3 + z * 0.2) * 0.2) * env - 0.8 * (1 - env);
  };
  const H = new FParts('green');
  H.add('earth', field(span(-70, 70, 56), span(-34, 40, 37), ground), { tint: DRY });
  H.build(root, { dirt: 0.2 });
  const D = new FParts('green');
  // entrances at the back: concrete portals cut into the rear slope with a road between
  for (const x of [-16, 16]) {
    D.add('concrete', box(5, 3.4, 4, x, 1.4, 27), { tint: 0xc8c4b8 });
    D.add('char', box(2.0, 2.4, 0.3, x, 1.2, 29.1));
    for (const s of [-1, 1]) D.add('concrete', place(box(0.8, 2.6, 6), x + s * 2.8, 1.0, 31.5, s * 0.3), { tint: 0xc8c4b8 });
  }
  D.add('earth', place(box(5, 0.1, 40), 0, 0.05, 50), { tint: 0xd8c8a8 });
  // trenches before the front, a communication trench round the flank, two belts of wire
  trench(D, [[-58, -16], [-44, -22], [-30, -19], [-18, -30], [-6, -27], [6, -33], [18, -29], [30, -21], [44, -24], [58, -16]], { r });
  trench(D, [[-58, -16], [-62, 0], [-56, 16], [-48, 30]], { r });
  trench(D, [[58, -16], [62, 0], [56, 16]], { r });
  const belt = (off) => {
    const pts = [[-66, -16], [-40, -30], [0, -42], [40, -30], [66, -16]].map(([x, z]) => [x, z - off]);
    for (let k = 0; k < pts.length - 1; k++) wire(D, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], r);
  };
  belt(6);
  belt(14);
  D.build(root, { dirt: 0.3 });
  return finishTarget(root, parts);
}

// ------------------------------------------------------------------ magazine

// The Special Arsenal in the White Cliff above Severnaya Bay (Sukharnaya Balka): a pale limestone
// escarpment some 34 m high (on our terrain there is no bay, so the cliff is an outcrop whose ends
// and back fall to the ground), four tunnel mouths with masonry portals at its foot, a narrow-gauge
// spur along the foot with a branch into each tunnel, a pair of ammunition trucks on it. One part:
// the magazine in the rock, whose portals are what is seen. Damage brings rock down over the portals,
// chars them, and `anchors.vents` (the tunnel mouths) let the render layer pour smoke out of each.
const CLIFF_H = 34;
const faceZ = (x) => 1 + 2 * Math.sin(x * 0.07) + 1.2 * Math.sin(x * 0.19 + 1) + 5 * Math.exp(-(((x - 18) / 3.5) ** 2)) + 4 * Math.exp(-(((x + 42) / 4) ** 2)); // two gullies cut back
const PORTALS = [-27, -9, 9, 27];

function cliffAt(x, z, disp = true) {
  const fz = faceZ(x), e = 1 - ss(46, 76, Math.abs(x));
  const env = e * (1 - ss(fz + 45, fz + 105, z)); // the ends and the back fall to the ground
  const pm = Math.max(...PORTALS.map((px) => 1 - ss(5, 9, Math.abs(x - px)))); // the scree is cleared before the portals
  const scree = 2.6 * ss(fz - 7, fz + 0.3, z) * (1 - pm * (1 - ss(fz - 0.5, fz + 1, z)));
  const t = ss(fz + 0.2, fz + 3.0 + (1 - e) * 30, z); // the face: near vertical, easing to a slope at the ends
  let y = env * (scree + (CLIFF_H - 2.6 + Math.sin(x * 0.11) * 1.5 + Math.sin(x * 0.037 + 1) * 3 + Math.sin(x * 0.05 + z * 0.04) * t) * t) - 0.8 * (1 - env);
  if (z < fz - 7) y = -1;
  if (!disp) return y;
  // rough up the steep face: weathered bulges and the beds standing out as ledges (a sawtooth in y)
  const w = ss(fz - 0.5, fz + 1, z) * (1 - ss(fz + 3, fz + 5, z)) * e;
  const bed = (y % 4.2) / 4.2;
  const dz = (0.8 * Math.sin(0.31 * x + 0.23 * y) + 0.5 * Math.sin(0.9 * x - 0.5 * y + 2) - 0.7 * bed * bed) * w;
  return [x, y, z + dz];
}

function buildMagazine() {
  const root = new THREE.Group(), r = rng(1854);
  // the escarpment: dense rows over the face, sparse behind
  const zs = [...span(-14, -3.5, 4), ...span(-3, 9, 30).slice(1), ...span(9, 130, 26).slice(1)];
  const lime = new THREE.Color(), tmp = new THREE.Color();
  const cliff = rockMesh(field(span(-88, 88, 70), zs, (x, z) => cliffAt(x, z)), (x, y, z, ny) => {
    const n = 0.5 + 0.25 * Math.sin(x * 0.37 + z * 0.21) + 0.25 * Math.sin(x * 0.11 - z * 0.33);
    if (y < 3.2 && ny > 0.35) return lime.set(0xcfc8b4).lerp(tmp.set(0xa8a088), n * 0.5); // scree at the foot
    if (ny > 0.72) return lime.set(0x8c8a5c).lerp(tmp.set(0xb0a478), n); // dry grass and scrub on the top
    if (ny > 0.42) return lime.set(0xd0c8b0).lerp(tmp.set(0x8e8a5e), 0.3 + n * 0.5); // scrubby slopes at the ends
    const k = 0.9 + 0.08 * Math.sin(y * 1.9) + 0.06 * Math.sin(x * 0.5);
    return lime.set(0xf2ead8).multiplyScalar(k).lerp(tmp.set(0xa8a090), y < 3 ? 0.35 : 0); // the face, darker at the foot
  });
  root.add(cliff);

  const part = new THREE.Group();
  root.add(part);
  const vents = [], falls = [];
  const P = new FParts('green');
  for (const x of PORTALS) {
    const fz = faceZ(x);
    // a dressed-stone portal built out from the face: the arch, its parapet, retaining walls each side
    P.add('concrete', box(8.4, 7.2, 3.2, x, 3.0, fz - 0.4), { tint: 0xe6e0d0 });
    P.add('concrete', box(9.0, 0.6, 3.6, x, 6.9, fz - 0.4), { tint: 0xd6d0c0 });
    P.add('concrete', arch(5.4, 5.6, 0.3, x, -0.1, fz - 2.08), { tint: 0xc8c2b0 });
    P.add('char', arch(4.4, 5.0, 0.3, x, 0, fz - 2.14));
    P.add('char', box(4.4, 4.6, 6, x, 2.3, fz + 1.2)); // the dark tunnel behind
    for (const s of [-1, 1]) P.add('concrete', place(box(0.9, 3.6, 5), x + s * 6.0, 1.3, fz - 1.4, s * -0.5), { tint: 0xe0dacb });
    vents.push(node(part, 'vent', x, 2.6, fz - 2.6));
  }
  P.build(part, { dirt: 0.5 });
  // the rock that comes down in front of the portals (hidden until damaged): limestone blocks on the rock material
  const lime2 = { ...P.mats, lime: limestone() };
  for (const x of PORTALS) {
    const g = new THREE.Group(), fz = faceZ(x);
    g.position.set(x, 0, fz - 3.5);
    const F = new FParts('green');
    F.mats = lime2;
    for (let k = 0; k < 14; k++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 5, s = 0.6 + r() * 1.6;
      const b = rbox(s * (1 + r()), s * (0.6 + r() * 0.5), s * (1 + r()), s * 0.2, Math.cos(a) * d, s * 0.3, Math.sin(a) * d * 0.6, r() * 2, r() * 3, r() * 2).toNonIndexed();
      b.computeVertexNormals();
      projectUV(b, 4);
      F.add('lime', b, { tint: 0xe0d8c4, uv: true });
    }
    F.build(g, { dirt: 0.3 });
    g.scale.setScalar(0.001);
    root.add(g); // outside the part, so the char of the burning portals leaves the fresh rock pale
    falls.push(g);
  }
  damageable(part, {
    scorch: 0, char: 0.75,
    bits: falls.map((g, k) => ({ obj: g, k0: 0.25 + k * 0.12, k1: 0.6 + k * 0.1, scale: 1000 })),
  });

  // the narrow-gauge spur along the foot, a branch into each tunnel, the line away to the bay road
  const T = new FParts('green');
  const track = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    const n = Math.round(len / 0.9), c = Math.cos(ry), s = Math.sin(ry);
    for (const o of [-0.4, 0.4]) T.add('steel', place(box(len, 0.1, 0.06), (x0 + x1) / 2 + s * o, 0.2, (z0 + z1) / 2 + c * o, ry));
    for (let k = 0; k <= n; k++) { const f = k / n; T.add('wood', place(box(0.16, 0.1, 1.4), x0 + dx * f, 0.1, z0 + dz * f, ry), { tint: 0x8a7a64 }); }
  };
  track(-60, -13, 42, -13);
  track(-60, -13, -76, -40);
  for (const x of PORTALS) track(x - 4, -13, x, faceZ(x) - 2);
  T.add('concrete', place(box(110, 0.12, 6), -8, 0.06, -13), { tint: 0xe8e0d0 }); // the ballast bed, limestone grit
  // two narrow-gauge ammunition trucks with crates, a buffer stop, a hand crane by the second portal
  for (const x of [-40, -33]) {
    T.add('dark', box(1.3, 0.3, 4.0, x, 0.6, -13, 0, Math.PI / 2));
    for (const s of [-1, 1]) for (const w of [-1.2, 1.2]) T.add('dark', place(xTube(-0.05, 0.05, 0.3, 0.3, 10, 0, 0), x + w, 0.32, -13 + s * 0.45, Math.PI / 2));
    for (let k = 0; k < 6; k++) T.add('wood', box(0.9, 0.45, 0.6, x - 1.4 + (k % 3) * 1.4, 0.98 + Math.floor(k / 3) * 0.47, -13), { tint: 0x7a7a50 });
  }
  T.add('wood', box(1.6, 0.9, 0.4, 42.4, 0.5, -13, 0, Math.PI / 2));
  T.add('steel', rod(V(-6, 0.2, -6), V(-6, 5, -6), 0.15, 8));
  T.add('steel', rod(V(-6, 5, -6), V(-3, 5.4, -6), 0.1, 6));
  for (let k = 0; k < 30; k++) { // loose stones along the foot
    const x = (r() - 0.5) * 140;
    T.add('concrete', box(0.4 + r(), 0.3 + r() * 0.5, 0.4 + r(), x, 0.2, faceZ(x) - 6 - r() * 4, r(), r(), r()), { tint: 0xe0d8c8 });
  }
  T.build(root, { dirt: 0.3 });
  const out = finishTarget(root, [part]);
  out.anchors.vents = [vents]; // per part: the tunnel mouths, where the render layer lets the smoke out
  return out;
}

// ------------------------------------------------------------------ sbattery

// The 122 mm howitzer M1938 (M-30) as a rig (the render layer recoils and flashes it): a split-trail
// carriage on two disc wheels with solid tyres, a wide flat shield with a sliding top plate and a
// lower apron, the long cradle under the 23-calibre barrel with the recuperator above it, no muzzle brake.
function beam(P, key, a, b, w, h) {
  const len = a.distanceTo(b), m = new THREE.Matrix4().lookAt(a, b, V(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  P.add(key, box(w, h, len).applyMatrix4(m));
}

function buildM30() {
  const rig = makeRig('green'), { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const WR = 0.56, WX = 0.83, TY = 1.2, TZ = 0.1;
  const P = rig.part();
  for (const s of [-1, 1]) {
    P.add('tyre', ring(0.4, WR, s * WX - 0.1, s * WX + 0.1, 28).translate(0, WR, 0));
    P.add('rim', xTube(s * WX - 0.07, s * WX + 0.07, 0.41, 0.41, 20, WR, 0));
    P.add('dark', xTube(s * WX, s * (WX + 0.14), 0.13, 0.1, 12, WR, 0));
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; P.add('dark', box(0.03, 0.05, 0.05, s * (WX + 0.08), WR + Math.cos(a) * 0.3, Math.sin(a) * 0.3)); }
  }
  P.add('dark', xTube(-WX, WX, 0.07, 0.07, 10, WR, 0));
  // the upper carriage cheeks, the pedestal, the split trails opened out with their spades
  for (const s of [-1, 1]) P.add('camo', box(0.04, 0.7, 1.2, s * 0.3, TY - 0.25, 0.15));
  P.add('camo', box(0.64, 0.2, 1.2, 0, WR + 0.12, 0.1));
  for (const s of [-1, 1]) {
    const a = V(s * 0.28, WR + 0.02, 0.3), b = V(s * 1.35, 0.22, 4.1);
    beam(P, 'camo', a, b, 0.2, 0.26);
    P.add('camo', place(box(0.6, 0.5, 0.06), b.x, 0.18, b.z + 0.1, -s * 0.28, -0.35));
    P.add('dark', place(box(0.08, 0.08, 0.3), b.x, 0.45, b.z - 0.25));
  }
  // the shield: main plate with a sight window, the sliding top plate, the apron between the wheels, the side wings
  P.add('camo', box(2.05, 0.8, 0.02, 0, 1.25, -0.42, -0.08));
  P.add('camo', box(1.5, 0.22, 0.02, 0, 1.76, -0.38, -0.08)); // the sliding top plate
  for (const s of [-1, 1]) P.add('camo', place(box(0.3, 0.8, 0.02), s * 1.12, 1.25, -0.36, -s * 0.5, -0.08)); // the edges turned back
  P.add('camo', box(1.3, 0.38, 0.02, 0, 0.62, -0.3, 0.1)); // the apron under the axle
  P.add('dark', box(0.5, 0.62, 0.03, 0, 1.2, -0.44, -0.08)); // the barrel's slot
  P.add('char', box(0.16, 0.1, 0.03, -0.55, 1.45, -0.45));
  addHandwheel(P, -0.36, 1.0, 0.5, 0.11, -1);
  addHandwheel(P, 0.36, 0.95, 0.35, 0.1, 1);
  P.build(trav, { dirt: 0.55 });

  const el = pivotAt(rig, trav, 'elevation', 0, TY, TZ);
  const E = rig.part();
  E.add('camo', zTube(-1.55, 0.55, 0.15, 0.15, 14, 0, -0.17)); // the cradle and buffer under the barrel
  E.add('dark', zTube(-1.6, -1.55, 0.12, 0.12, 12, 0, -0.17));
  E.add('camo', zTube(-1.2, 0.35, 0.075, 0.075, 10, 0, 0.17)); // the recuperator above
  for (const s of [-1, 1]) E.add('camo', xTube(s * 0.14, s * 0.32, 0.08, 0.08, 10, 0, 0));
  E.add('dark', box(0.05, 0.5, 0.5, 0.24, -0.35, 0.2)); // the elevating arc
  addDialSight(E, -0.32, 0.12, 0.25);
  E.build(el, { dirt: 0.25, y0: TY });
  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('camo', zTube(-2.42, -0.3, 0.085, 0.105, 16));
  B.add('camo', zTube(-2.47, -2.42, 0.095, 0.095, 16));
  B.add('dark', zTube(-0.3, 0.62, 0.16, 0.16, 16));
  B.add('dark', box(0.26, 0.3, 0.12, 0, 0, 0.66));
  B.add('char', new THREE.CircleGeometry(0.06, 10).rotateY(Math.PI).translate(0, 0, -2.475));
  B.build(rc, { dirt: 0.15, y0: TY });
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, -2.5);
  rig.anchors.breech = node(el, 'breech', 0, 0, 0.7);
  rig.anchors.eye = node(trav, 'eye', 0, 1.7, 1.0);
  rig.anchors.muzzles = [rig.anchors.muzzle];
  rig.recoilLength = 0.95;
  rig.loadEl = 0.1;
  rig.kind = 'm30';
  crew(rig, 'layer', -0.9, 0.4, L90, 'lay');
  crew(rig, 'loader', 0.3, 1.6, 0, 'ram');
  crew(rig, 'lanyard', 1.0, 0.6, R90, 'lanyard');
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  delete rig.P;
  delete rig.part;
  return rig;
}

// A Soviet field battery: four M-30s, each in a round pit with an earth parapet open to the rear, a
// camouflage net on poles, olive ammunition boxes in a niche, a slit trench for the crew; the command dugout
// and the telephone line behind. parts[i] the pit of gun i, target.rigs (and .guns) the four rigs.
function buildSBattery() {
  const root = new THREE.Group(), r = rng(1938);
  const lay = partLayout('sbattery');
  const parts = [], rigs = [];
  lay.forEach((l, i) => {
    const part = new THREE.Group();
    part.position.set(l.x, 0, l.z);
    part.rotation.y = (r() - 0.5) * 0.14;
    const rig = buildM30();
    rig.setElevation(0.28 + r() * 0.15);
    rig.setTraverse((r() - 0.5) * 0.06);
    part.add(rig.root);
    rigs.push(rig);
    const P = new FParts('green');
    // the parapet: a ring of spoil open behind the trails, as a heightfield so it reads as one bank
    P.add('earth', field(span(-7, 7, 24), span(-6.2, 7.8, 24), (x, z) => {
      const d = Math.hypot(x, z - 0.8), a = Math.abs(Math.atan2(x, 0.8 - z)), k = (1 - ss(0.2, 1.7, Math.abs(d - 4.7))) * (1 - ss(2.4, 2.9, a));
      return (0.85 + Math.sin(a * 5 + i) * 0.12) * k - 0.4 * (1 - k);
    }), { tint: 0xb8a47e });
    P.add('earth', place(box(7, 0.06, 7.5), 0, 0.04, 1.2), { tint: 0x7a6a50 }); // the dug floor
    for (let k = 0; k < 6; k++) P.add('wood', box(0.9, 0.42, 0.55, 3.2 + (k % 2) * 0.95, 0.22 + Math.floor(k / 2) * 0.43, 2.4 - (k % 3) * 0.2), { tint: 0x72744a });
    P.add('earth', place(box(5, 0.06, 0.8), -3.4, 0.05, 4.8, 0.4), { tint: 0x3a3024 }); // the crew slit
    P.add('earth', place(sphere(1, 0, 0, 0, 2.6, 0.4, 0.6, 8), -3.2, 0, 4.0, 0.4), { tint: 0xa08e6a });
    P.build(part, { dirt: 0.5 });
    const N = new FParts('green'), ng = new THREE.Group();
    ng.position.set(0, 0, 1.9);
    net(N, 6.6, 5.2, 2.5, 0.35, 70 + i); // over the breech and the crew: the barrel shows
    N.build(ng, { dirt: 0 });
    part.add(ng);
    damageable(part, {
      scorch: 7, char: 0.9, sink: 0.15,
      bits: [
        { obj: ng, k0: 0.0, k1: 0.6, pos: [0, -2.4, 0], rot: [0.2, 0.3, 0.25], scale: 0.5 },
        { obj: rig.pivots.recoil, k0: 0.3, k1: 0.8, pos: [0.3, 0.6, 1.2], rot: [-0.4, 0.4, 0.6] },
        { obj: rig.pivots.elevation, k0: 0.4, k1: 1, rot: [-0.3, 0, 0] },
        { obj: rig.pivots.traverse, k0: 0.2, k1: 1, rot: [0.05, 0.4, 0.3], pos: [0, -0.15, 0] },
      ],
    });
    root.add(part);
    parts.push(part);
  });
  // the battery commander's dugout behind the guns: a log-roofed mound, its entrance and the telephone wire
  const D = new FParts('green');
  D.add('earth', sphere(1, 0, 0.0, 24, 4.5, 1.6, 3.2, 14), { tint: 0xb8a47e });
  D.add('wood', box(1.4, 1.5, 0.3, 0, 0.75, 20.9), { tint: 0x8a7458 });
  D.add('char', box(0.9, 1.2, 0.1, 0, 0.62, 20.7));
  for (let k = 0; k < 5; k++) D.add('wood', xTube(-1.0, 1.0, 0.12, 0.12, 6, 1.55 + (k % 2) * 0.05, 20.9 - k * 0.24), { tint: 0x7a6448 });
  for (const l of lay) { // paths trodden from the pits to the dugout
    const dx = -l.x, dz = 21 - (l.z + 5), len = Math.hypot(dx, dz);
    D.add('earth', place(box(0.6, 0.04, len), l.x + dx / 2, 0.03, l.z + 5 + dz / 2, Math.atan2(dx, dz)), { tint: 0xb8a47e });
  }
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts, { rigs, guns: rigs });
}

export const BUILD = { turret: buildTurret, fort: buildFort, magazine: buildMagazine, sbattery: buildSBattery, citadel: buildCitadel, gate: buildGate, eastfort: buildEastFort };

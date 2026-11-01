import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile, zLathe, rivets, rivetRow, rivetPoly, handwheel, gearArc, chain, Parts, DEG, projectUV, earthTextures, concreteTextures, vehicleMats, shellGeometry } from '../../kit.js';
import { newGunRig, anchor, crewSpot, finishGun, pivotAt, hb } from '../../rig.js';
import { mulberry32 } from '../../../noise.js';
import { createHeavyScrimTexture } from './heavy_gustav_site.js';
import './common.js'; // registers the Dunkelgelb scheme ('dgelb') in kit.js CAMO

// 28 cm K5 (E) (Krupp, 1937) on a Vögele turntable, as the Anzio guns "Robert" and "Leopold" stood in 1944. Sources:
// Wikipedia (Krupp K5: barrel 21.54 m, L/76, twelve 7 mm grooves, 0 to 50 degrees, 1 to 2 degrees of traverse on the
// mount, 218 t, two 12-wheel bogies; the Vögele turntable: a raised firing bed that runs on a circular track, a central
// jack taking part of the weight), historyofwar.org (the carriage's own shell handling gear, the ramp up onto the
// turntable's carriage and its sideways-mounted wheels at each end), lonesentry.com (the 70 ft 8 in barrel in a sleeve
// cradle), and the photographs of Leopold (Aberdeen, Fort Lee) and of the Batterie Todt gun: the deep box girder
// ("gondola") humped round the trunnions and bellied down between the bogies so the breech can drop between its sides
// at high angles, each end on a span bolster over two three-axle trucks, the long slender barrel stepping down from its
// jacket, the square Krupp breech ring with its horizontal sliding wedge, the loading platform at the rear with its
// railings. Game estimates [E]: the girder's heights, the platform's layout, the shell crane over it (a gantry whose
// runway reaches back over the ammunition wagon coupled behind), the turntable's size (a ring of 34.4 m) and its trucks.
//
// Frames (rig root: ground y = 0, the turntable's pivot at x = z = 0, -Z the line of fire at zero traverse):
//   root       nothing of its own: the ring track, the centre pivot's foundation, the spur and the stores are the
//              site's (buildK5Site, in the same frame)
//   traverse   the turntable's bridge (two girders under the track, the plank deck, an end truck at each end with four
//              wheels on the ring track, the turning drum over the centre pivot and its jack, the hand winch that
//              turns it) and everything standing on it: the gun on its bogies, the ammunition wagon coupled behind
//   elevation  at the trunnions (TY above the ground, z = TZ): the sleeve cradle, its recoil cylinders and the
//              toothed elevating arcs
//   recoil     the barrel (z MUZ to BRE in this frame), 1.2 m stroke [E]
//   breech     the horizontal sliding wedge: setBreech(k) slides it 0.5 m to the right
//   trolley    the shell car on its rails on the loading platform (position.z = the shell's middle; origin at the bore's
//              height)
//   crab       the crane's crab on its runway (position.z); hoist: the hook block (position.y = hook height, K5.HOOK,
//              position.z follows the crab)
// loadEl is 0: the shell car runs the round level into the breech from the platform. render/de/k5.js drives the car,
// the crab and the hook through the loading steps (setTrolley, setCrab, setHoist); render/guns.js drives the wedge.

const yRing = (y0, y1, r0, r1, seg, x = 0, z = 0) => new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y0), new THREE.Vector2(r1, y1), new THREE.Vector2(r0, y1), new THREE.Vector2(r0, y0)], seg).translate(x, 0, z);
// a flat bar along a segment in the z-y plane (flanges), w across x
const bar = (z0, y0, z1, y1, w, h, x) => {
  const len = Math.hypot(z1 - z0, y1 - y0);
  return box(w, h, len, x, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0));
};
const polyY = (poly, z, pick) => {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) {
      const y = a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]);
      best = best == null ? y : pick(best, y);
    }
  }
  return best;
};

// ---- dimensions (metres, traverse frame at zero elevation)
// the turntable
const RR = 17.2; // the ring track's middle (two rails, RR -+ RG)
const RG = 0.5;
const RAIL_RING = 0.2; // the ring rails' head above the ground
const BL = 17.6; // the bridge's ends
const DECK = 1.15; // the bridge's plank deck and its girders' top
const RY = 1.3; // the bridge's track: rail head
const BX = 2.3; // the deck's outer edge
// the gun
const GA = 0.7175; // half gauge
const WR = 0.47; // bogie wheels
const ZF = -12.2, ZR = 8.2; // the span bolsters' middles (each over two three-axle trucks 4.6 m apart)
const F = -16.8, R = 12.8; // the girders' ends
const GX = 1.1; // the side girders' middle (plates 0.12 thick)
const SB = RY + 1.45; // the girders' underside over the bogies (the span bolsters' top)
const BELLY = RY + 0.45; // and between them
const PY = RY + 2.75; // walkways and the loading platform (4.05)
const HUMP = PY + 0.8; // the girders' top round the trunnions
const TY = PY + 1.15, TZ = -1.0; // the trunnion axis (the bore at the loading angle)
const BREC = 4.3, MUZC = BREC - 21.54; // breech face and muzzle in the recoil frame (z + = back of the trunnions)
const BRE = TZ + BREC; // the breech face in the traverse frame (3.3)
const P0 = 3.6; // the loading platform's front edge (the breech's well ahead of it)
const WX = 2.2, PX = 2.4; // the walkways' and the platform's railings
const RAILX = 0.72, RAILY = PY + 0.12; // the shell car's rails
const SHELL = { len: 1.28, rad: 0.1415 }; // 28 cm Sprenggranate 35, 255 kg
const ZB = BRE + 0.12 + SHELL.len / 2; // the car at the breech: the shell's middle
const ZL = 9.6; // the car's place under the crane, where the shell is set on it
const ZW = 15.1; // the next shell's middle on the ammunition wagon behind the gun
const WAGON_DECK = RY + 1.0; // the wagon's deck
const WAGON_Y = WAGON_DECK + 0.14 + SHELL.rad; // the shell's middle lying in the wagon's cradles
const HANG = 0.5; // shell's middle below the hook
const YB = 7.5; // the crane's runway
const CY = 7.1; // the crab's sheave block under the runway (where the rope leaves it)
const RECOIL = 1.2; // [E]
const WEDGE = 0.5; // the wedge's travel to open
const STAFF = 4.4; // the rammer staff
const PZ = [8.8, 12.5]; // the crane's posts (x +-POSTX)
const POSTX = 2.3;

// shared with the drill (render/de/k5.js): every place it uses, in the traverse frame at zero elevation
export const K5 = {
  TY, TZ, BRE, PY, DECK, ZB, ZL, ZW, HANG, WAGON_Y, RAILY, STAFF, SHELL, P0, PX,
  HOOK: { up: 6.55, down: WAGON_Y + HANG, lift: TY + 0.35 + HANG, set: TY + HANG },
  SEAT: BRE - 1.45 - SHELL.len / 2, // the shell's middle rammed home: its base 1.45 m inside, the charge fills the chamber behind it
  RACK: { x: 1.2, y: PY + 0.9, z: 10.4 }, // the charge (fore charge bag ahead of the brass main case) on the rack's top shelf
  STAFF_REST: { x: -2.15, y: PY + 0.85, z: 4.0 }, // the rammer staff's head on its hooks on the left railing (the staff runs back from it)
  LOCK: { x: 0.4, y: 0.3, z: BREC + 0.03 }, // the firing lock on the rear face (recoil frame), primed before the lay
  CRANK: { x: 0.64, y: 0.0, z: BREC - 0.76 }, // the wedge's handwheel on the right of the breech ring, ahead of the slot (recoil frame)
  HANDLES: [-0.05, 1.05], // the shell car's side handles (car frame z; x 0.6, y -0.45)
  WINCH: { x: 2.1, y: PY + 0.95, z: 12.0 }, // the crane winch's crank handle
  SLING: { x: 0.45, z: ZW }, // where the slinger stoops to the shell (on the wagon's deck beside it)
  WAGON_DECK,
};

// a square ring round the bore along z (the breech ring's rear behind the wedge, open for the rounds to go in)
const sqRing = (P, key, h, hole, z0, z1, o) => {
  const d = z1 - z0, zc = (z0 + z1) / 2, w = h - hole;
  P.add(key, box(2 * h, w, d, 0, hole + w / 2, zc), o);
  P.add(key, box(2 * h, w, d, 0, -hole - w / 2, zc), o);
  P.add(key, box(w, 2 * hole, d, hole + w / 2, 0, zc), o);
  P.add(key, box(w, 2 * hole, d, -hole - w / 2, 0, zc), o);
};

let CONC = null;
function concreteMat(tone = 0x7c786e) {
  const t = concreteTextures(tone);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.map, roughness: 0.95, metalness: 0, vertexColors: true });
  if (t.normal) { m.normalMap = t.normal; m.normalScale.set(0.6, 0.6); }
  return m;
}
const conc = (P, g, tint = 0xa49f94) => {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.normal) n.computeVertexNormals();
  projectUV(n, 6);
  P.add('concrete', n, { uv: true, tint });
};

// The breech's room to recoil at an elevation (share of the stroke): the breech ring's corners stay clear of the loading
// platform's front edge, the rear bogie and the turntable's deck below. A table by whole degrees, built once.
const FADE = (() => {
  const out = new Float32Array(91);
  for (let d = 0; d <= 90; d++) {
    const t = d * DEG, c = Math.cos(t), s = Math.sin(t);
    let ok = 0;
    for (let r = RECOIL; r >= 0; r -= 0.02) {
      let clear = true;
      for (const yc of [-0.58, 0.58]) for (const zc of [BREC - 0.75 + r, BREC + 0.06 + r]) {
        const y = TY + yc * c - zc * s, z = TZ + yc * s + zc * c;
        if ((y < PY + 0.06 && z > P0 - 0.12) || y < RY + 0.12 || (z > ZR - 4.4 && y < SB - 0.4)) clear = false;
      }
      if (clear) { ok = r; break; }
    }
    out[d] = ok / RECOIL;
  }
  return out;
})();

export function buildK5() {
  const rig = newGunRig('k5', 'dgelb');
  const root = rig.root;
  const mats = rig.mats;
  const mk = () => new Parts(mats);
  const PT = mk(), PE = mk(), PR = mk(), PB = mk(), PC = mk(), PH = mk(), PK = mk();
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const elev = pivotAt(rig, trav, 'elevation', 0, TY, TZ);
  const rec = pivotAt(rig, elev, 'recoil', 0, 0, 0);
  const brc = pivotAt(rig, rec, 'breech', 0, 0, BREC - 0.28);
  const car = pivotAt(rig, trav, 'trolley', 0, TY, ZL);
  const crab = pivotAt(rig, trav, 'crab', 0, YB, ZW);
  const hoist = pivotAt(rig, trav, 'hoist', 0, K5.HOOK.up, ZW);
  rig.recoilLength = RECOIL;
  rig.loadEl = 0;
  rig.staffLen = STAFF;
  rig.hoistRange = { up: K5.HOOK.up, down: K5.HOOK.down };
  rig.hoistHang = HANG;
  rig.trolleyRange = { breech: ZB, wait: ZL };
  rig.k5 = K5; // the drill's places (render/de/k5.js)

  // ================================================================ the turntable's bridge (traverse)
  // two plate girders under the rails, deepest over the centre pivot, shallow at the end trucks
  const bg = [[-BL, DECK], [BL, DECK], [BL, 0.75], [9, 0.55], [2.2, 0.36], [-2.2, 0.36], [-9, 0.55], [-BL, 0.75]];
  for (const s of [-1, 1]) {
    PT.add('iron', sideProfile(bg, 0.1).translate(s * GA, 0, 0));
    for (const [z0, y0, z1, y1] of [[-BL, DECK, BL, DECK], [-BL, 0.75, -9, 0.55], [-9, 0.55, -2.2, 0.36], [-2.2, 0.36, 2.2, 0.36], [2.2, 0.36, 9, 0.55], [9, 0.55, BL, 0.75]]) {
      PT.add('iron', bar(z0, y0 + (y0 > 1 ? -0.02 : 0.02), z1, y1 + (y1 > 1 ? -0.02 : 0.02), 0.32, 0.04, s * GA));
    }
    for (let z = -BL + 0.6; z < BL; z += 1.2) {
      const bot = polyY(bg, z, Math.min);
      PT.add('iron', box(0.04, DECK - bot - 0.06, 0.08, s * (GA + 0.07), (DECK + bot) / 2, z));
    }
    PT.add('dark', rivetPoly(bg, (z, y) => V(s * (GA + 0.055), y, z), 0.07, 0.3, V(s, 0, 0), 0.02));
    // the rails on their base plates, a check rail inside each
    PT.add('steel', box(0.07, 0.15, 2 * BL, s * GA, DECK + 0.075, 0));
    PT.add('dark', box(0.2, 0.02, 2 * BL, s * GA, DECK + 0.01, 0));
  }
  // cross frames between the girders, the outriggers and the plank deck either side (full length: the crew walks it)
  for (let z = -BL + 0.4; z < BL; z += 2.2) {
    PT.add('iron', box(2 * GA - 0.1, 0.22, 0.12, 0, DECK - 0.15, z));
    for (const s of [-1, 1]) PT.add('iron', rod(V(s * (GA + 0.06), Math.max(0.5, polyY(bg, z, Math.min) + 0.1), z), V(s * (BX - 0.1), DECK - 0.08, z), 0.04, 5));
  }
  const planks = (x0, x1) => {
    for (let z = -BL + 0.15; z < BL - 0.1; z += 0.33) PT.add('timber', box(x1 - x0, 0.05, 0.3, (x0 + x1) / 2, DECK - 0.025, z));
  };
  planks(GA + 0.12, BX);
  planks(-BX, -GA - 0.12);
  planks(-GA + 0.12, GA - 0.12);
  for (const s of [-1, 1]) PT.add('iron', box(0.08, 0.14, 2 * BL, s * BX, DECK - 0.07, 0)); // the deck's edge angles
  // the turning drum over the centre pivot, with the central jack's screw and capstan bars between the girders
  PT.add('iron', yTube(0.3, 0.38, 0.95, 0.95, 32));
  PT.add('dark', rivets(Array.from({ length: 24 }, (_, i) => V(Math.cos(i / 24 * 6.283) * 0.85, 0.38, Math.sin(i / 24 * 6.283) * 0.85)), V(0, 1, 0), 0.025));
  PT.add('iron', box(2 * GA - 0.1, 0.36, 1.6, 0, 0.56, 0));
  PT.add('steel', yTube(0.74, 1.0, 0.16, 0.16, 14, 0, 0));
  // the end trucks: a cross girder under each end, the bridge's girders bolted on, two wheels on each ring rail, the
  // wheels' axles radial so they roll round the ring
  const endTruck = (e) => {
    const zc = e * (RR - 0.05);
    PT.add('iron', box(2 * BX + 0.6, 0.34, 1.5, 0, 0.6, zc));
    PT.add('dark', rivetRow(V(-BX, 0.72, zc - e * 0.76), V(BX, 0.72, zc - e * 0.76), 0.25, V(0, 0, -e), 0.022));
    for (const x of [-1.6, -0.6, 0.6, 1.6]) {
      for (const rr of [RR - RG, RR + RG]) {
        const z = e * Math.sqrt(rr * rr - x * x), a = Math.atan2(x, Math.abs(z));
        const w = zTube(-0.05, 0.05, 0.22, 0.22, 18).rotateY(e * a).translate(x, RAIL_RING + 0.22, z);
        PT.add('steel', w);
        PT.add('dark', zTube(-0.06, -0.04, 0.26, 0.26, 18).rotateY(e * a).translate(x, RAIL_RING + 0.22, z)); // flange
      }
      PT.add('dark', box(0.2, 0.28, 1.35, x, 0.44, zc));
    }
  };
  endTruck(-1);
  endTruck(1);
  // the hand winch that turns it, on the right of the rear end truck (a crank, gearing down to a wheel on the outer rail)
  const TW = { x: BX + 0.6, z: RR - 0.75 };
  PT.add('iron', box(1.2, 0.06, 1.2, TW.x, DECK - 0.03, TW.z)); // the winchman's step
  for (const dz of [-0.5, 0.5]) PT.add('iron', rod(V(TW.x + 0.25, DECK - 0.05, TW.z + dz), V(BX, 0.45, TW.z + dz), 0.035, 5));
  PT.add('iron', box(0.3, 0.7, 0.4, BX + 0.15, DECK + 0.35, TW.z - 0.45));
  PT.add('steel', xTube(BX - 0.05, BX + 0.45, 0.2, 0.2, 18, DECK + 0.55, TW.z - 0.45));
  PT.add('steel', xTube(BX + 0.3, BX + 0.5, 0.035, 0.035, 8, DECK + 0.9, TW.z - 0.45));
  PT.add('iron', handwheel(0.24, 5, 0.02, 0.045).translate(BX + 0.52, DECK + 0.9, TW.z - 0.45));
  PT.add('steel', yTube(0.35, DECK + 0.3, 0.04, 0.04, 8, BX + 0.15, TW.z - 0.45));
  // the ramp ends (the gun was pushed up onto the bridge from the spur): hinged rail flaps at each end
  for (const e of [-1, 1]) for (const s of [-1, 1]) PT.add('steel', box(0.14, 0.05, 0.5, s * GA, DECK + 0.03, e * (BL - 0.25), e * 0.12, 0, 0));

  // ================================================================ the gun's bogies (traverse; they stand on the bridge)
  const subTruck = (zc) => {
    const L = 3.0; // three axles at 1.5 m
    for (const s of [-1, 1]) {
      PT.add('camo', box(0.14, 0.44, L + 1.0, s * 1.02, RY + WR + 0.22, zc));
      PT.add('dark', rivetRow(V(s * 1.095, RY + WR + 0.38, zc - L / 2 - 0.4), V(s * 1.095, RY + WR + 0.38, zc + L / 2 + 0.4), 0.2, V(s, 0, 0), 0.02));
      for (let i = 0; i < 3; i++) {
        const z = zc - L / 2 + i * 1.5;
        PT.add('dark', box(0.24, 0.3, 0.32, s * 1.0, RY + WR, z)); // the axle box
        for (let k = 0; k < 4; k++) PT.add('dark', box(0.1, 0.025, 0.9 - k * 0.16, s * 1.02, RY + WR + 0.2 + k * 0.03, z)); // leaf springs
        PT.add('steel', xTube(s * (GA - 0.06), s * (GA + 0.08), WR, WR, 26, RY + WR, z));
        PT.add('steel', xTube(s * (GA - 0.06), s * (GA - 0.04), WR + 0.035, WR + 0.035, 26, RY + WR, z));
        PT.add('dark', new THREE.CylinderGeometry(WR - 0.05, WR - 0.05, 0.04, 22).rotateZ(Math.PI / 2).translate(s * (GA + 0.02), RY + WR, z));
      }
    }
    for (let i = 0; i < 3; i++) PT.add('steel', xTube(-0.95, 0.95, 0.07, 0.07, 10, RY + WR, zc - L / 2 + i * 1.5));
    PT.add('camo', box(2.2, 0.3, 1.2, 0, RY + WR + 0.42, zc)); // its bolster
    PT.add('steel', yTube(RY + WR + 0.57, RY + 1.08, 0.36, 0.36, 18, 0, zc));
    for (const e of [-1, 1]) PT.add('camo', box(2.2, 0.2, 0.26, 0, RY + WR + 0.25, zc + e * (L / 2 + 0.45)));
  };
  // a span bolster over each pair, the girders' bearing on top, the buffer beam and buffers on its outer end
  const span = (zc, e) => {
    subTruck(zc - 2.3);
    subTruck(zc + 2.3);
    const L = 8.8;
    for (const s of [-1, 1]) {
      PT.add('camo', sideProfile([[zc - L / 2, RY + 1.1], [zc + L / 2, RY + 1.1], [zc + L / 2 - 0.4, SB], [zc - L / 2 + 0.4, SB]], 0.14).translate(s * 0.95, 0, 0));
      PT.add('dark', rivetRow(V(s * 1.03, SB - 0.08, zc - L / 2 + 0.6), V(s * 1.03, SB - 0.08, zc + L / 2 - 0.6), 0.22, V(s, 0, 0), 0.022));
    }
    PT.add('camo', box(1.9, 0.1, L - 0.8, 0, SB - 0.05, zc));
    for (const dz of [-2.3, 2.3]) PT.add('camo', box(1.9, 0.3, 0.9, 0, RY + 1.2, zc + dz)); // the pivots onto the trucks
    const ze = zc + e * (L / 2 + 0.05), yb = RY + 1.06;
    PT.add('camo', box(2.9, 0.5, 0.22, 0, yb, ze));
    for (const x of [-0.88, 0.88]) {
      PT.add('camo', zTube(ze + e * 0.1, ze + e * 0.3, 0.14, 0.14, 14, x, yb));
      PT.add('steel', zTube(ze + e * 0.2, ze + e * 0.4, 0.065, 0.065, 10, x, yb));
      PT.add('steel', zTube(ze + e * 0.36, ze + e * 0.42, 0.22, 0.22, 22, x, yb));
    }
    PT.add('dark', box(0.2, 0.2, 0.3, 0, yb - 0.08, ze + e * 0.25));
    PT.add('dark', chain(V(0, yb - 0.05, ze + e * 0.35), V(0.3, yb - 0.25, ze + e * 0.4), 0.06, 0.06));
  };
  span(ZF, -1);
  span(ZR, 1);

  // ================================================================ the girder carriage ("gondola", traverse)
  const gp = [[F, 3.15], [F, PY], [-6.2, PY], [-4.4, HUMP], [1.4, HUMP], [2.3, PY], [R, PY], [R, SB], [ZR - 3.9, SB], [ZR - 5.0, BELLY], [-7.0, BELLY], [ZF + 4.1, SB], [F + 1.4, SB]];
  for (const s of [-1, 1]) {
    PT.add('camo', sideProfile(gp, 0.12, 0.01).translate(s * GX, 0, 0));
    PT.add('dark', rivetPoly(gp, (z, y) => V(s * (GX + 0.065), y, z), 0.09, 0.24, V(s, 0, 0), 0.022));
    for (let z = F + 0.6; z <= R - 0.3; z += 0.95) {
      if (Math.abs(z - TZ) < 1.0) continue; // the trunnion bearing
      const top = polyY(gp, z, Math.max), bot = polyY(gp, z, Math.min);
      PT.add('camo', box(0.05, top - bot - 0.12, 0.1, s * (GX + 0.085), (top + bot) / 2, z)); // stiffeners
    }
    const edges = [[F, PY, -6.2, PY], [-6.2, PY, -4.4, HUMP], [-4.4, HUMP, 1.4, HUMP], [1.4, HUMP, 2.3, PY], [2.3, PY, R, PY], [R, SB, ZR - 3.9, SB], [ZR - 3.9, SB, ZR - 5.0, BELLY], [ZR - 5.0, BELLY, -7.0, BELLY], [-7.0, BELLY, ZF + 4.1, SB], [ZF + 4.1, SB, F + 1.4, SB], [F + 1.4, SB, F, 3.15]];
    for (const [z0, y0, z1, y1] of edges) {
      const top = y0 >= PY - 0.01 && y1 >= PY - 0.01;
      PT.add('camo', bar(z0, y0 + (top ? -0.025 : 0.025), z1, y1 + (top ? -0.025 : 0.025), 0.34, 0.05, s * GX));
    }
    // a row of lightening holes low in the belly (dark recesses), as on the photographs
    for (let z = -5.6; z <= 1.6; z += 1.8) PT.add('dark', new THREE.CylinderGeometry(0.3, 0.3, 0.02, 18).rotateZ(Math.PI / 2).scale(1, 0.7, 1.3).translate(s * (GX + 0.065), BELLY + 0.55, z));
  }
  // the nose: a sloping plate over the front, the headstock and the barrel's travelling crutch folded down
  PT.add('camo', box(2 * GX + 0.12, PY - 3.15, 0.14, 0, (PY + 3.15) / 2, F));
  PT.add('camo', box(2 * GX + 0.12, 0.08, 1.8, 0, 3.0, F + 0.7, -Math.atan2(SB - 3.15, 1.4)));
  PT.add('camo', box(2 * GX + 0.12, PY - SB, 0.14, 0, (PY + SB) / 2, R));
  for (const s of [-1, 1]) PT.add('camo', rod(V(s * 0.85, PY + 0.06, F + 0.5), V(s * 0.25, PY + 0.06, F + 2.8), 0.06, 6));
  PT.add('camo', box(0.7, 0.1, 0.4, 0, PY + 0.06, F + 2.9));
  // cross girders: over the bogies, the front of the well and the back of it (behind the breech's swing)
  for (const z of [F + 1.6, ZF - 2.3, ZF + 2.3, ZR - 2.3, ZR + 2.3, R - 1.2]) PT.add('camo', box(2 * GX - 0.1, 0.5, 0.14, 0, SB + 0.3, z));
  PT.add('camo', box(2 * GX - 0.1, PY - BELLY - 0.1, 0.24, 0, (PY + BELLY) / 2 + 0.05, -5.5));
  PT.add('camo', box(2 * GX - 0.1, PY - BELLY - 0.1, 0.24, 0, (PY + BELLY) / 2 + 0.05, P0 + 0.15));
  // the bottom chord's tie plates under the well (clear of the breech's swing, which stays above BELLY + 0.1)
  for (const z of [-6.4, -4.3, P0 + 1.0]) PT.add('camo', box(2 * GX - 0.1, 0.06, 0.4, 0, BELLY + 0.04, z));
  // the front deck between the girders, ahead of the cradle's arcs
  PT.add('camo', box(2 * GX - 0.1, 0.06, -4.2 - F, 0, PY - 0.03, (F - 4.2) / 2));
  for (let z = F + 0.6; z < -4.4; z += 1.4) PT.add('dark', box(2 * GX - 0.2, 0.012, 0.02, 0, PY + 0.003, z));

  // ---- walkways along both sides, the loading platform at the rear
  const plankRun = (x0, x1, z0, z1) => {
    const n = Math.max(1, Math.round((x1 - x0) / 0.27));
    for (let i = 0; i < n; i++) PT.add('timber', box((x1 - x0) / n - 0.012, 0.05, z1 - z0, x0 + ((i + 0.5) * (x1 - x0)) / n, PY - 0.025, (z0 + z1) / 2));
  };
  const W0 = -9.6; // the walkways begin here (the front deck between the girders is reached over the nose)
  for (const s of [-1, 1]) {
    const xs = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    plankRun(...xs(GX + 0.07, WX), W0, P0);
    PT.add('camo', box(WX - GX, 0.06, P0 - W0, s * (GX + WX) / 2, PY - 0.08, (P0 + W0) / 2));
    for (let z = W0 + 0.4; z < P0; z += 1.6) PT.add('camo', rod(V(s * (GX + 0.07), PY - 0.75, z), V(s * (WX - 0.05), PY - 0.1, z), 0.035, 6));
  }
  // the platform: a steel deck over the girders from the well's edge back to the end, timber treads either side of the
  // car's rails, its wings out to PX
  PT.add('camo', box(2 * PX, 0.08, R - P0 + 0.25, 0, PY - 0.07, (P0 + R + 0.25) / 2));
  for (const s of [-1, 1]) {
    const xs = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    plankRun(...xs(RAILX + 0.12, PX - 0.05), P0 + 0.05, R + 0.2);
    plankRun(...xs(0.02, RAILX - 0.12), P0 + 0.05, R + 0.2);
    for (let z = P0 + 0.6; z < R; z += 1.8) PT.add('camo', rod(V(s * (GX + 0.07), PY - 0.9, z), V(s * (PX - 0.05), PY - 0.1, z), 0.04, 6));
    // the car's rails, their stringers, the stop chocks at either end
    PT.add('steel', box(0.07, 0.12, R - P0 - 0.1, s * RAILX, PY + 0.06, (P0 + R) / 2));
    PT.add('dark', box(0.18, 0.14, 0.14, s * RAILX, RAILY + 0.07, P0 + 0.12));
    PT.add('dark', box(0.2, 0.3, 0.2, s * RAILX, RAILY + 0.15, R - 0.15));
  }
  PT.add('dark', box(2 * GX, 0.05, 0.1, 0, PY + 0.005, P0 + 0.02)); // the platform's front lip over the well
  // railings: pipe stanchions, top and middle rails; gaps at the ladders
  const railRun = (x0, z0, x1, z1, y = PY) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.2));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; PT.add('dark', rod(V(x, y, z), V(x, y + 1.0, z), 0.022, 5)); }
    PT.add('dark', rod(V(x0, y + 1.0, z0), V(x1, y + 1.0, z1), 0.024, 6));
    PT.add('dark', rod(V(x0, y + 0.5, z0), V(x1, y + 0.5, z1), 0.018, 5));
  };
  for (const s of [-1, 1]) {
    railRun(s * WX, W0 + 0.8, s * WX, P0);
    railRun(s * WX, P0, s * PX, P0);
    railRun(s * PX, P0, s * PX, R - 1.1);
    railRun(s * GX, W0 + 0.05, s * WX, W0 + 0.05);
    // ladders from the turntable's deck: at the walkways' front end and at the platform's rear corners
    for (const [lz, lx] of [[W0 + 0.35, WX + 0.1], [R - 0.6, PX + 0.1]]) {
      for (const dz of [-0.22, 0.22]) PT.add('dark', rod(V(s * lx, DECK, lz + dz), V(s * lx, PY + 1.0, lz + dz), 0.022, 5));
      for (let y = DECK + 0.3; y < PY; y += 0.3) PT.add('dark', rod(V(s * lx, y, lz - 0.22), V(s * lx, y, lz + 0.22), 0.016, 5));
    }
  }
  railRun(-PX, R - 0.05, -0.7, R - 0.05);
  railRun(0.7, R - 0.05, PX, R - 0.05);

  // ---- the trunnion bearings on the hump, the elevating gear and the layer's sight
  for (const s of [-1, 1]) {
    PT.add('camo', box(0.4, TY + 0.25 - HUMP, 1.6, s * GX, (TY + 0.25 + HUMP) / 2, TZ));
    PT.add('camo', rbox(0.48, 0.34, 1.05, 0.05, s * GX, TY + 0.36, TZ));
    for (const dz of [-0.6, 0.6]) PT.add('dark', yTube(TY + 0.5, TY + 0.6, 0.05, 0.05, 6, s * (GX - 0.12), TZ + dz));
    PT.add('dark', rivetRow(V(s * (GX + 0.21), HUMP + 0.15, TZ - 0.7), V(s * (GX + 0.21), HUMP + 0.15, TZ + 0.7), 0.18, V(s, 0, 0), 0.024));
  }
  const aP = 76 * DEG, RPIN = 2.76, py = TY - RPIN * Math.sin(aP), pz = TZ + RPIN * Math.cos(aP);
  PT.add('steel', xTube(-GX - 0.2, GX + 0.06, 0.06, 0.06, 10, py, pz));
  for (const s of [-1, 1]) PT.add('steel', xTube(s * 0.5 - 0.09, s * 0.5 + 0.09, 0.12, 0.12, 14, py, pz));
  PT.add('camo', rbox(0.26, 0.3, 0.3, 0.04, -GX - 0.22, py, pz));
  PT.add('steel', yTube(py, PY + 0.9, 0.045, 0.045, 8, -GX - 0.25, pz));
  PT.add('camo', rbox(0.3, 0.32, 0.36, 0.04, -GX - 0.25, PY + 0.95, pz));
  PT.add('steel', xTube(-1.45, -GX - 0.25, 0.04, 0.04, 8, PY + 1.0, pz));
  PT.add('iron', handwheel(0.28, 6, 0.022, 0.055).translate(-1.48, PY + 1.0, pz));
  PT.add('camo', box(0.12, 0.45, 0.25, -GX - 0.28, PY + 1.2, pz - 0.75));
  PT.add('brass', yTube(PY + 1.42, PY + 1.62, 0.05, 0.05, 10, -GX - 0.28, pz - 0.75));
  PT.add('dark', zTube(pz - 1.0, pz - 0.6, 0.03, 0.026, 8, -GX - 0.28, PY + 1.58));
  // the elevation scale on the left bearing
  PT.add('brass', box(0.02, 0.5, 0.06, -GX - 0.21, TY - 0.25, TZ - 0.85));

  // ---- the loading platform's furniture: the crane, the charge rack, the staff's hooks
  // the gantry: four posts, top frames, two runway beams cantilevered back over the ammunition wagon with stays
  const ZE = ZW + 0.9; // the runway's end
  for (const s of [-1, 1]) {
    for (const z of PZ) {
      PT.add('camo', box(0.2, YB - PY + 0.1, 0.24, s * POSTX, (YB + PY) / 2, z));
      PT.add('camo', box(0.36, 0.08, 0.4, s * POSTX, PY + 0.04, z));
    }
    PT.add('camo', box(0.18, 0.32, PZ[1] - PZ[0] + 0.24, s * POSTX, YB - 0.1, (PZ[0] + PZ[1]) / 2));
    PT.add('camo', rod(V(s * POSTX, PY + 1.2, PZ[0]), V(s * POSTX, YB - 0.3, PZ[1]), 0.04, 5));
    // the runway beams (I-sections) and their stays
    PT.add('camo', box(0.16, 0.36, ZE - PZ[0] + 0.4, s * 0.34, YB, (PZ[0] + ZE - 0.2) / 2));
    PT.add('dark', box(0.04, 0.02, ZE - PZ[0] + 0.4, s * 0.34, YB - 0.19, (PZ[0] + ZE - 0.2) / 2));
    PT.add('camo', rod(V(s * POSTX, YB - 1.6, PZ[1]), V(s * 0.4, YB - 0.15, ZE - 0.3), 0.05, 6));
    PT.add('camo', rod(V(s * POSTX, YB + 0.1, PZ[1]), V(s * 0.4, YB + 0.1, ZE - 0.3), 0.035, 5));
  }
  for (const z of PZ) PT.add('camo', box(2 * POSTX + 0.2, 0.32, 0.22, 0, YB + 0.05, z));
  PT.add('camo', box(0.9, 0.22, 0.22, 0, YB + 0.05, ZE - 0.3));
  PT.add('dark', box(0.75, 0.18, 0.18, 0, YB - 0.12, ZE - 0.12)); // the end stop
  // the winch on the right rear post: a drum, gearing and the crank; its rope up the post and along the runway
  const W = K5.WINCH;
  PT.add('camo', box(0.36, 0.6, 0.7, POSTX - 0.05, W.y, PZ[1] - 0.1));
  PT.add('iron', zTube(PZ[1] - 0.42, PZ[1] + 0.22, 0.17, 0.17, 18, POSTX - 0.05, W.y + 0.12));
  PT.add('rope', zTube(PZ[1] - 0.38, PZ[1] + 0.18, 0.185, 0.185, 18, POSTX - 0.05, W.y + 0.12));
  PT.add('iron', zTube(PZ[1] - 0.52, PZ[1] - 0.46, 0.27, 0.27, 24, POSTX - 0.05, W.y));
  PT.add('steel', zTube(W.z, PZ[1] - 0.45, 0.035, 0.035, 8, W.x + 0.2, W.y));
  PT.add('dark', rod(V(W.x + 0.2, W.y, W.z), V(W.x, W.y + 0.18, W.z), 0.025, 5));
  PT.add('dark', xTube(W.x - 0.15, W.x, 0.022, 0.022, 6, W.y + 0.18, W.z));
  PT.add('rope', rod(V(POSTX - 0.05, W.y + 0.3, PZ[1]), V(POSTX - 0.05, YB - 0.25, PZ[1]), 0.018, 5));
  PT.add('rope', rod(V(POSTX - 0.05, YB - 0.25, PZ[1]), V(0.1, YB - 0.25, PZ[1]), 0.018, 5));
  PT.add('iron', zTube(PZ[1] - 0.06, PZ[1] + 0.06, 0.12, 0.12, 14, 0.1, YB - 0.25));
  // the charge rack on the right of the platform: two frames, the next charge on the top shelf, a spare below
  const RK = K5.RACK;
  for (const z of [RK.z - 0.45, RK.z + 0.45]) {
    for (const dx of [-0.22, 0.22]) PT.add('camo', rod(V(RK.x + dx, PY, z), V(RK.x + dx, RK.y + 0.1, z), 0.025, 5));
    for (const y of [RK.y - 0.19, PY + 0.45]) PT.add('camo', box(0.48, 0.05, 0.08, RK.x, y, z));
    for (const y of [RK.y - 0.19, PY + 0.45]) for (const dx of [-0.17, 0.17]) PT.add('camo', box(0.06, 0.1, 0.08, RK.x + dx, y + 0.07, z));
  }
  {
    const L = 0.7 + 1.0, zf = RK.z - L / 2, zc = zf + 0.7, yc = PY + 0.45 + 0.17;
    PT.add('rope', zTube(zf + 0.03, zc, 0.13, 0.13, 14, RK.x, yc)); // the spare: the silk fore charge bag
    PT.add('rope', new THREE.SphereGeometry(0.13, 12, 6).scale(1, 1, 0.25).translate(RK.x, yc, zf + 0.04));
    PT.add('brass', zTube(zc, zc + 1.0, 0.15, 0.15, 18, RK.x, yc)); // and its brass main charge case
    PT.add('brass', zTube(zc + 0.98, zc + 1.0, 0.162, 0.162, 18, RK.x, yc));
  }
  // the rammer staff's hooks on the left railing
  const SR = K5.STAFF_REST;
  for (const z of [SR.z + 0.6, SR.z + 3.5]) PT.add('dark', rod(V(-PX, SR.y - 0.08, z), V(SR.x + 0.02, SR.y - 0.08, z), 0.02, 5));
  // a tool chest and the fuze box at the platform's front corner, the battery telephone on the left walkway
  PT.add('camo', rbox(0.8, 0.45, 0.45, 0.04, -1.85, PY + 0.23, 11.9));
  PT.add('camo', rbox(0.35, 0.35, 0.5, 0.03, -2.1, PY + 0.18, P0 + 0.4));
  PT.add('dark', box(0.25, 0.3, 0.14, -WX + 0.1, PY + 1.05, -4.6));
  PT.add('dark', rod(V(-WX + 0.1, PY + 0.95, -4.6), V(-WX + 0.1, PY + 0.2, -4.0), 0.012, 4));

  // ================================================================ the ammunition wagon coupled behind (traverse)
  {
    const z0 = 13.25, z1 = 16.95, zc = (z0 + z1) / 2, L = z1 - z0;
    // a two-axle flat with cradles for two shells (the next round on the rear pair, by the crane's hook)
    for (const s of [-1, 1]) {
      PK.add('camo', box(0.14, 0.32, L - 0.3, s * 1.0, WAGON_DECK - 0.3, zc));
      for (const dz of [-1.0, 1.0]) {
        PK.add('steel', xTube(s * (GA - 0.06), s * (GA + 0.07), 0.42, 0.42, 22, RY + 0.42, zc + dz));
        PK.add('dark', box(0.22, 0.28, 0.3, s * 1.0, RY + 0.42, zc + dz));
        for (let k = 0; k < 3; k++) PK.add('dark', box(0.09, 0.025, 0.8 - k * 0.18, s * 1.0, RY + 0.62 + k * 0.03, zc + dz));
      }
    }
    for (const dz of [-1.0, 1.0]) PK.add('steel', xTube(-0.95, 0.95, 0.06, 0.06, 10, RY + 0.42, zc + dz));
    PK.add('camo', box(2.5, 0.12, L - 0.3, 0, WAGON_DECK - 0.06, zc));
    for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.3) PK.add('timber', box(2.4, 0.03, 0.27, 0, WAGON_DECK + 0.005, z));
    for (const e of [-1, 1]) {
      const ze = e > 0 ? z1 : z0;
      PK.add('camo', box(2.6, 0.3, 0.16, 0, RY + 1.06, ze - e * 0.12));
      for (const x of [-0.88, 0.88]) {
        PK.add('steel', zTube(ze - e * 0.06, ze + e * 0.1, 0.06, 0.06, 10, x, RY + 1.06));
        PK.add('steel', zTube(ze + e * 0.06, ze + e * 0.12, 0.2, 0.2, 20, x, RY + 1.06));
      }
    }
    // the shell cradles (timber saddles) for two rounds side by side, and the second round in its place
    for (const x of [0, -0.75]) for (const dz of [-0.4, 0.4]) for (const sx of [-1, 1]) PK.add('timber', box(0.12, 0.12, 0.16, x + sx * 0.13, WAGON_DECK + 0.07, ZW + dz, 0, 0, sx * 0.55));
    const sg = shellGeometry(SHELL.len, SHELL.rad);
    for (const [geo, k] of [[sg.body, 'shell'], [sg.band, 'brass'], [sg.fuze, 'steel']]) PK.add(k, geo.clone().translate(-0.75, WAGON_Y, ZW));
    // a brake standard and a charge box at the far end
    PK.add('dark', yTube(WAGON_DECK, WAGON_DECK + 1.0, 0.04, 0.04, 8, 1.0, z1 - 0.3));
    PK.add('iron', handwheel(0.2, 5, 0.018, 0.04).rotateZ(Math.PI / 2).translate(1.0, WAGON_DECK + 1.02, z1 - 0.3));
    PK.add('camo', rbox(1.0, 0.6, 0.7, 0.04, 0.6, WAGON_DECK + 0.3, z1 - 0.6));
  }

  // ================================================================ cradle (elevation)
  const CR0 = -5.6, CR1 = 2.2;
  PE.add('camo', zTube(CR0, CR1, 0.64, 0.64, 32));
  PE.add('camo', zTube(CR0 - 0.05, CR0 + 0.25, 0.7, 0.7, 32));
  for (const z of [-3.6, -1.6, 0.6, CR1 - 0.06]) PE.add('steel', zTube(z - 0.04, z + 0.04, 0.675, 0.675, 32));
  for (const s of [-1, 1]) {
    PE.add('camo', xTube(s * 0.55, s * 0.92, 0.38, 0.38, 22));
    PE.add('steel', xTube(s * 0.92, s * 1.28, 0.24, 0.24, 20));
    PE.add('dark', rivets(Array.from({ length: 10 }, (_, i) => V(s * 0.92, Math.sin(i * Math.PI / 5) * 0.31, Math.cos(i * Math.PI / 5) * 0.31)), V(s, 0, 0), 0.028));
    PE.add('camo', box(0.06, 0.52, CR1 - CR0 - 0.6, s * 0.62, 0, (CR0 + CR1) / 2));
  }
  // the recoil brake (under) and the two recuperator cylinders (over)
  const cyl = [[-0.34, 0.72, 0.12], [0.34, 0.72, 0.12], [0, -0.8, 0.17]];
  for (const [x, y, r] of cyl) {
    PE.add('camo', zTube(CR0 + 0.1, CR1 - 0.2, r, r, 16, x, y));
    PE.add('steel', zTube(CR0 + 0.02, CR0 + 0.16, r * 1.12, r * 1.12, 16, x, y));
    for (const z of [-3.2, -1.2, 1.0]) PE.add('steel', zTube(z - 0.04, z + 0.04, r * 1.15, r * 1.15, 14, x, y));
    for (const z of [-4.4, -2.4, -0.4, 1.5]) PE.add('camo', box(0.16, Math.abs(y) - 0.58 - r * 0.6, 0.22, x * 0.8, Math.sign(y) * (0.58 + (Math.abs(y) - 0.58 - r * 0.6) / 2), z));
  }
  // the elevating arcs under the cradle, with their webs
  for (const s of [-1, 1]) {
    PE.add('steel', gearArc(2.4, 2.62, 22 * DEG, 80 * DEG, 0.15, 30, 0.05).translate(s * 0.5, 0, 0));
    const web = [[0.0, -0.66], [2.0, -0.66]];
    for (let i = 0; i <= 8; i++) { const a = (22 + (58 * i) / 8) * DEG; web.push([2.4 * Math.cos(a), -2.4 * Math.sin(a)]); }
    web.push([0.0, -1.0]);
    PE.add('camo', sideProfile(web, 0.06, 0.005).translate(s * 0.5, 0, 0));
  }

  // ================================================================ barrel (recoil) and wedge (breech)
  // the long chase tapering to the muzzle, a step at the jacket's front, the jacket, the square breech ring
  const J0 = -7.6, J1 = -2.0; // the jacket's front step and the second step
  const ra = (z) => 0.27 + (0.375 - 0.27) * Math.min(1, Math.max(0, (z - (MUZC + 0.5)) / (J0 - (MUZC + 0.5))));
  const bp = [[MUZC, SHELL.rad], [MUZC, 0.29], [MUZC + 0.04, 0.305], [MUZC + 0.32, 0.305], [MUZC + 0.38, 0.275], [MUZC + 0.5, 0.27]];
  for (let i = 1; i <= 8; i++) { const z = MUZC + 0.5 + ((J0 - MUZC - 0.5) * i) / 8; bp.push([z, ra(z)]); }
  const S0 = BREC - 0.5, S1 = BREC - 0.06; // the wedge's slot
  bp.push([J0 + 0.08, 0.43], [J1, 0.445], [J1 + 0.06, 0.49], [S0 - 0.3, 0.5], [S0 - 0.3, 0.55], [S0, 0.55], [S0, SHELL.rad], [MUZC + 0.01, SHELL.rad], [MUZC, SHELL.rad]);
  PR.add('camo', zLathe(bp, 40));
  for (const z of [J0 + 0.4, -4.4]) PR.add('camo', zTube(z - 0.035, z + 0.035, 0.455, 0.455, 32)); // shrink bands
  // the bore: dark, with the twelve deep grooves cut into it near the muzzle (lands between them)
  PR.add('dark', zTube(MUZC + 0.002, MUZC + 0.9, SHELL.rad - 0.002, SHELL.rad - 0.002, 24, 0, 0, true));
  PR.add('dark', zTube(MUZC + 0.9, MUZC + 0.92, SHELL.rad, SHELL.rad, 24));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    PR.add('steel', box(0.022, 0.012, 0.88, Math.cos(a) * (SHELL.rad - 0.008), Math.sin(a) * (SHELL.rad - 0.008), MUZC + 0.46, 0, 0, a + Math.PI / 2));
  }
  PR.add('steel', zTube(MUZC - 0.003, MUZC + 0.004, SHELL.rad, 0.29, 32, 0, 0, false));
  // the recoil clip ahead of the cradle and its rods into the cylinders
  const CLIP = CR0 - 0.55, cr = ra(CLIP) + 0.05;
  PR.add('camo', zTube(CLIP - 0.08, CLIP + 0.08, Math.max(cr, 0.46), Math.max(cr, 0.46), 30));
  for (const [x, y, r] of cyl) {
    PR.add('camo', box(Math.max(0.16, Math.abs(x) + 0.16), 0.14, 0.16, x / 2, y * 0.72, CLIP));
    PR.add('steel', zTube(CLIP, CR0 + 0.1, r * 0.32, r * 0.32, 8, x, y));
  }
  // the breech ring: a square housing round the wedge's slot (open on the right), its rear face
  PR.add('camo', box(1.12, 0.18, S1 - S0 + 0.3, 0, 0.47, (S0 + S1) / 2 - 0.15));
  PR.add('camo', box(1.12, 0.18, S1 - S0 + 0.3, 0, -0.47, (S0 + S1) / 2 - 0.15));
  PR.add('camo', box(0.16, 0.78, S1 - S0 + 0.3, -0.48, 0, (S0 + S1) / 2 - 0.15));
  for (const y of [-0.38, 0.38]) PR.add('dark', box(0.02, 0.02, S1 - S0, 0.56, y, (S0 + S1) / 2));
  sqRing(PR, 'camo', 0.56, 0.15, S1, BREC - 0.03);
  sqRing(PR, 'steel', 0.53, 0.15, BREC - 0.03, BREC, { tint: 0xb0b0a8 });
  PR.add('dark', zTube(S1, BREC + 0.002, SHELL.rad + 0.01, SHELL.rad + 0.01, 24, 0, 0, true));
  PR.add('dark', rivets(Array.from({ length: 12 }, (_, i) => V(Math.cos(i / 12 * 6.283) * 0.42, Math.sin(i / 12 * 6.283) * 0.42, BREC + 0.002)), V(0, 0, 1), 0.024));
  const CK = K5.CRANK;
  PR.add('camo', box(0.1, 0.3, 0.3, 0.6, CK.y, CK.z)); // its bracket, the shaft into the housing's rack
  PR.add('steel', xTube(0.56, CK.x + 0.02, 0.032, 0.032, 8, CK.y, CK.z));
  PR.add('iron', handwheel(0.18, 5, 0.018, 0.04).translate(CK.x, CK.y, CK.z));
  PR.add('brass', box(0.12, 0.08, 0.06, K5.LOCK.x, K5.LOCK.y, BREC + 0.03)); // the firing lock's housing
  // the wedge: a block sliding across the ring, its back face bright
  PB.add('camo', box(0.8, 0.74, 0.38, 0, 0, 0));
  PB.add('steel', box(0.78, 0.72, 0.02, 0, 0, 0.195));
  PB.add('steel', box(0.08, 0.28, 0.1, 0.38, 0, 0.11));
  PB.add('dark', rivets(Array.from({ length: 6 }, (_, i) => V(-0.28 + i * 0.11, 0.28, 0.206)), V(0, 0, 1), 0.018));

  // ================================================================ the shell car (trolley)
  {
    const yr = RAILY - TY; // rail head in the car frame
    const R2 = 0.22, wy = yr + R2;
    PC.add('camo', box(0.92, 0.05, 2.1, 0, -0.29, 0.3));
    for (const s of [-1, 1]) {
      PC.add('camo', box(0.03, 0.6, 2.1, s * 0.43, -0.6, 0.3));
      PC.add('camo', box(0.08, 0.05, 2.1, s * 0.455, -0.31, 0.3));
      PC.add('camo', box(0.08, 0.05, 2.1, s * 0.455, -0.88, 0.3));
      for (const z of [-0.4, 0.62]) PC.add('dark', new THREE.CylinderGeometry(0.17, 0.17, 0.012, 16).rotateZ(Math.PI / 2).scale(1, 0.75, 1.25).translate(s * 0.447, -0.6, z));
      PC.add('dark', rivetRow(V(s * 0.448, -0.33, -0.7), V(s * 0.448, -0.33, 1.3), 0.12, V(s, 0, 0), 0.016));
      for (const hz of K5.HANDLES) {
        PC.add('dark', rod(V(s * 0.46, -0.45, hz - 0.14), V(s * 0.6, -0.45, hz - 0.06), 0.022, 5));
        PC.add('dark', rod(V(s * 0.46, -0.45, hz + 0.14), V(s * 0.6, -0.45, hz + 0.06), 0.022, 5));
        PC.add('dark', rod(V(s * 0.6, -0.45, hz - 0.06), V(s * 0.6, -0.45, hz + 0.06), 0.022, 5));
      }
    }
    for (const z of [-0.75, 1.35]) PC.add('camo', box(0.92, 0.6, 0.03, 0, -0.6, z));
    for (const z of [-0.3, 0.45]) for (const s of [-1, 1]) PC.add('timber', box(0.16, 0.09, 0.16, s * 0.15, -0.23, z, 0, 0, -s * 0.55));
    for (const s of [-1, 1]) PC.add('camo', box(0.04, 0.12, 2.1, s * 0.4, -0.22, 0.3));
    for (const z of [0.1, 1.1]) {
      PC.add('steel', xTube(-0.82, 0.82, 0.045, 0.045, 8, wy, z));
      for (const s of [-1, 1]) {
        PC.add('dark', xTube(s * 0.66, s * 0.78, R2, R2, 22, wy, z));
        PC.add('dark', xTube(s * 0.66, s * 0.68, R2 + 0.03, R2 + 0.03, 22, wy, z));
        PC.add('dark', box(0.1, 0.16, 0.2, s * 0.53, wy, z));
      }
    }
    for (const s of [-1, 1]) PC.add('dark', rod(V(s * 0.38, -0.3, 1.36), V(s * 0.38, 0.0, 1.5), 0.025, 5));
    PC.add('dark', xTube(-0.4, 0.4, 0.025, 0.025, 6, 0.0, 1.5));
  }

  // ================================================================ the crab and the hook block (crab, hoist)
  const PCr = mk();
  PCr.add('camo', box(0.5, 0.3, 0.7, 0, -0.08, 0));
  for (const s of [-1, 1]) for (const dz of [-0.25, 0.25]) PCr.add('dark', xTube(s * 0.2, s * 0.3, 0.09, 0.09, 12, 0.12, dz));
  PCr.add('iron', xTube(-0.18, 0.18, 0.13, 0.13, 16, -0.3, 0));
  PCr.add('camo', box(0.44, 0.12, 0.34, 0, -0.32, 0));
  {
    const barY = -(HANG - SHELL.rad);
    PH.add('dark', rbox(0.24, 0.36, 0.2, 0.03, 0, 0.05, 0));
    PH.add('steel', zTube(-0.11, 0.11, 0.11, 0.11, 14, 0, 0.16));
    PH.add('steel', new THREE.TorusGeometry(0.08, 0.025, 6, 14, Math.PI * 1.5).rotateZ(Math.PI * 0.75).translate(0, -0.22, 0));
    PH.add('chain', chain(V(0, -0.28, 0), V(0, barY, -0.5), 0.02, 0.05));
    PH.add('chain', chain(V(0, -0.28, 0), V(0, barY, 0.5), 0.02, 0.05));
    PH.add('steel', zTube(-0.52, 0.52, 0.012, 0.012, 6, 0, barY));
  }

  // ================================================================ build
  PT.build(trav, { dirt: 0.25, y0: 0 });
  PK.build(trav, { dirt: 0.3, y0: 0 });
  PE.build(elev, { dirt: 0.05, y0: TY });
  PR.build(rec, { dirt: 0.03, y0: TY });
  PB.build(brc, { dirt: 0.03, y0: TY });
  PC.build(car, { dirt: 0.15, y0: TY });
  PCr.build(crab, { dirt: 0.1, y0: YB });
  PH.build(hoist, { dirt: 0.0, y0: K5.HOOK.up });

  // the hoist's rope: a pair of unit strands from the crab's sheave to the block, scaled in update()
  const ropeMat = rig.mats.rope;
  const unit = new THREE.CylinderGeometry(0.016, 0.016, 1, 5).translate(0, -0.5, 0);
  const strands = [-0.05, 0.05].map((dz) => { const m = new THREE.Mesh(unit, ropeMat); m.position.set(0, CY, ZW + dz); trav.add(m); return m; });

  // ---- anchors and setters
  anchor(rig, rec, 'muzzle', 0, 0, MUZC);
  rig.anchors.muzzles.push(rig.anchors.muzzle);
  anchor(rig, rec, 'breech', 0, 0, BREC);
  anchor(rig, elev, 'tray', 0, 0, ZB - TZ);
  anchor(rig, trav, 'eye', 0, TY + 0.3, TZ + 0.2);
  anchor(rig, trav, 'shellStack', 0, WAGON_Y, ZW);
  rig.anchors.wagon = rig.anchors.shellStack;
  const addShell = (where, parent, y) => {
    const g = new THREE.Group();
    g.name = 'shell-' + where;
    const s = shellGeometry(SHELL.len, SHELL.rad);
    for (const [geo, m] of [[s.body, rig.mats.shell], [s.band, rig.mats.brass], [s.fuze, rig.mats.steel]]) g.add(new THREE.Mesh(geo, m));
    g.position.y = y;
    g.visible = false;
    parent.add(g);
    rig.props[where] = g;
  };
  addShell('tray', car, 0);
  addShell('hoist', hoist, -HANG);
  rig.props.trolley = rig.props.tray;
  rig.props.crane = rig.props.hoist;
  rig.shell = { len: SHELL.len, rad: SHELL.rad };

  rig.breechOpen = { axis: 'x', angle: WEDGE };
  rig.setBreech = (k) => { brc.position.x = Math.min(1, Math.max(0, k)) * WEDGE; };
  rig.setTrolley = (z) => { car.position.z = z; };
  rig.setCrab = (z) => { crab.position.z = z; hoist.position.z = z; for (const m of strands) m.position.z = z + (m === strands[0] ? -0.05 : 0.05); };
  rig.setHoist = (y) => { hoist.position.y = y; };
  // the car is the drill's (render/de/k5.js moves it with the shell): render/guns.js's per-frame setTray leaves it be
  rig.setTray = () => {};
  rig.recoilFade = (el) => {
    const d = Math.min(90, Math.max(0, el / DEG)), i = Math.floor(d), f = d - i;
    return Math.max(0.12, FADE[i] + (FADE[Math.min(90, i + 1)] - FADE[i]) * f);
  };
  rig.update = () => {
    const len = Math.max(0.05, CY - (hoist.position.y + 0.2));
    for (const m of strands) m.scale.y = len;
  };
  rig.update();

  hb(rig, -BX, 0.3, -BL, BX, DECK, BL);
  hb(rig, -1.2, RY, F - 0.4, 1.2, PY, R + 0.4);
  hb(rig, -PX, PY - 0.1, P0, PX, PY, R);
  hb(rig, -0.75, TY - 1.0, TZ - 6, 0.75, TY + 0.8, BRE + 0.3);
  hb(rig, -1.3, RY, 13.2, 1.3, WAGON_DECK + 0.2, 17.0);

  // ---- crew spots (traverse frame, y = the floor). The drill (render/de/k5.js) moves them; the list order is also the
  // order the men fall out (the last first).
  const E = -Math.PI / 2, Wd = Math.PI / 2, N = 0;
  crewSpot(rig, 'chief', -1.6, PY, -4.0, E, 'point');
  crewSpot(rig, 'layer', -1.9, PY, pz, E, 'lay');
  crewSpot(rig, 'lanyard', 1.75, PY, 2.2, 1.2, 'lanyard');
  // the left pair by the staff's hooks (where they lift it: STAFF_REST.z + 2.3 and + 3.25), the right pair on the right of
  // the car's track behind the breech
  crewSpot(rig, 'rammer1', -1.85, PY, K5.STAFF_REST.z + 2.3, E, 'stand');
  crewSpot(rig, 'rammer2', 1.0, PY, 7.4, Wd, 'stand');
  crewSpot(rig, 'car1', -1.12, PY, ZL, N, 'stand');
  crewSpot(rig, 'car2', -1.12, PY, ZL + 1.0, N, 'stand');
  crewSpot(rig, 'charge1', 1.9, PY, 9.9, Wd, 'stand');
  crewSpot(rig, 'charge2', 1.9, PY, 10.9, Wd, 'stand');
  crewSpot(rig, 'hoist', 1.75, PY, W.z, E, 'operate');
  crewSpot(rig, 'sling', K5.SLING.x + 0.4, WAGON_DECK, ZW, Wd, 'stand');
  crewSpot(rig, 'traverser', TW.x + 0.35, DECK, TW.z - 0.45, Wd, 'operate');
  crewSpot(rig, 'rammer3', -1.85, PY, K5.STAFF_REST.z + 3.25, E, 'stand');
  crewSpot(rig, 'rammer4', 1.0, PY, 8.35, Wd, 'stand');
  crewSpot(rig, 'fuze', -1.55, DECK, ZW - 0.9, E, 'stand');
  return finishGun(rig);
}

// ==================================================================== the position
// buildK5Site(seed) -> { root }: what stays put round the turntable, in the gun's frame at zero traverse (ground y = 0,
// the turntable's pivot at the origin, -Z the zero line). The Vögele turntable's fixed part: the levelled ring of
// ballast with its two ring rails on radial sleepers, the centre pivot's concrete block with its bearing; the approach
// spur running in from behind (+Z) up a ballast ramp to the bridge's rail head; a low earth bank round it all with gaps
// for the spur and a way in; two ammunition wagons waiting on the spur under a camouflage net, a charge store dug in
// beside it, nets on poles over the stores, the crew's dugout.
export function buildK5Site(seed = 1) {
  const rnd = mulberry32(seed * 7919 + 5);
  const mats = vehicleMats('dgelb');
  CONC ??= concreteMat();
  const et = earthTextures();
  const earth = new THREE.MeshStandardMaterial({ map: et.map, normalMap: et.normal, roughness: 1, metalness: 0, vertexColors: true });
  const ballast = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 1, metalness: 0, vertexColors: true });
  const net = new THREE.MeshStandardMaterial({ map: createHeavyScrimTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0, vertexColors: true });
  const M = { ...mats, concrete: CONC, earth, ballast, net };
  const root = new THREE.Group();
  root.name = 'k5-site';
  const P = new Parts(M), PN = new Parts(M);
  const earthG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); projectUV(n, 8); P.add('earth', n, { uv: true }); };
  const ballastG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); projectUV(n, 3); P.add('ballast', n, { uv: true }); };

  // ---- the ring track: a ballast ring, radial sleepers, two rails; a gravel floor inside
  ballastG(new THREE.LatheGeometry([[RR - 1.4, 0.0], [RR - 1.1, 0.12], [RR + 1.1, 0.12], [RR + 1.4, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 120));
  ballastG(new THREE.LatheGeometry([[0.001, 0.03], [RR - 1.35, 0.03], [RR - 1.4, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 64));
  for (let i = 0; i < 160; i++) { const a = (i / 160) * Math.PI * 2; P.add('timber', box(0.22, 0.08, 2.0, Math.sin(a) * RR, 0.13, Math.cos(a) * RR, 0, a, 0)); }
  for (const r of [RR - RG, RR + RG]) {
    P.add('steel', yRing(0.15, RAIL_RING, r - 0.035, r + 0.035, 160));
    P.add('dark', yRing(0.145, 0.16, r - 0.08, r + 0.08, 160));
  }
  // the centre pivot: a concrete block, its steel bearing ring and the jack's foot
  conc(P, yRing(0, 0.2, 0.001, 1.6, 32), 0xb0aba0);
  P.add('steel', yRing(0.2, 0.3, 0.5, 0.9, 32));
  P.add('dark', yRing(0.2, 0.24, 0.001, 0.5, 24));
  P.add('dark', rivets(Array.from({ length: 16 }, (_, i) => V(Math.cos(i / 16 * 6.283) * 1.25, 0.2, Math.sin(i / 16 * 6.283) * 1.25)), V(0, 1, 0), 0.04));
  // ---- the approach spur: in from behind (+Z) up a ballast ramp to the bridge's rail head at its end
  const S0 = BL + 0.1, S1 = 72;
  const spurY = (z) => (z < S0 + 4 ? RY : z > 46 ? 0.15 : RY - (RY - 0.15) * (z - S0 - 4) / (46 - S0 - 4));
  {
    const n = 36;
    for (let i = 0; i < n; i++) {
      const za = S0 + ((S1 - S0) * i) / n, zb = S0 + ((S1 - S0) * (i + 1)) / n, ya = spurY(za) - 0.22, yb = spurY(zb) - 0.22;
      const prof = [[-1.7, 0], [1.7, 0], [1.7 + Math.max(0.5, ya * 1.4), -ya], [-1.7 - Math.max(0.5, ya * 1.4), -ya]];
      const pos = [];
      const q = (p, z, y) => [p[0], y + p[1], z];
      for (let k = 0; k < 4; k++) {
        const p0 = prof[k], p1 = prof[(k + 1) % 4];
        const A = q(p0, za, ya), B = q(p1, za, ya), C = q(p1, zb, yb), D = q(p0, zb, yb);
        pos.push(...A, ...B, ...C, ...A, ...C, ...D);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      ballastG(g);
    }
    for (let z = S0 + 0.3; z < S1; z += 0.7) P.add('timber', box(2.5, 0.14, 0.24, 0, spurY(z) - 0.2, z, Math.atan2(spurY(z + 0.1) - spurY(z), 0.1), 0, 0));
    for (const x of [-GA, GA]) for (let i = 0; i < n; i++) {
      const za = S0 + ((S1 - S0) * i) / n, zb = S0 + ((S1 - S0) * (i + 1)) / n;
      P.add('steel', rod(V(x, spurY(za) - 0.06, za), V(x, spurY(zb) - 0.06, zb), 0.04, 4));
    }
    // the timber crib under the spur's end at the ring, and the rail lock post
    P.add('timber', box(3.0, RY - 0.1, 0.6, 0, (RY - 0.1) / 2, S0 + 0.35));
    P.add('dark', box(0.2, 1.1, 0.2, 1.9, 0.55, S0 + 0.5));
    P.add('dark', box(0.4, 0.1, 0.1, 1.9, 1.05, S0 + 0.5));
  }
  // two ammunition wagons waiting on the spur, their shells in cradles, a tarpaulin over the charges
  const sg = shellGeometry(SHELL.len, SHELL.rad);
  for (const zc of [25.5, 30.0]) {
    const y0 = spurY(zc) - 0.06;
    for (const s of [-1, 1]) {
      P.add('camo', box(0.14, 0.32, 3.4, s * 1.0, y0 + 0.7, zc));
      for (const dz of [-1.0, 1.0]) {
        P.add('steel', xTube(s * (GA - 0.06), s * (GA + 0.07), 0.42, 0.42, 22, y0 + 0.42, zc + dz));
        P.add('dark', box(0.22, 0.28, 0.3, s * 1.0, y0 + 0.42, zc + dz));
      }
    }
    for (const dz of [-1.0, 1.0]) P.add('steel', xTube(-0.95, 0.95, 0.06, 0.06, 10, y0 + 0.42, zc + dz));
    P.add('camo', box(2.5, 0.12, 3.6, 0, y0 + 0.94, zc));
    for (const x of [-0.6, 0, 0.6]) {
      for (const dz of [-0.4, 0.4]) P.add('timber', box(0.36, 0.1, 0.16, x, y0 + 1.05, zc + dz));
      for (const [geo, k] of [[sg.body, 'shell'], [sg.band, 'brass'], [sg.fuze, 'steel']]) P.add(k, geo.clone().translate(x, y0 + 1.1 + SHELL.rad, zc - 0.6));
    }
    P.add('cloth', rbox(2.2, 0.5, 1.2, 0.12, 0, y0 + 1.25, zc + 1.0), { tint: 0x7a7a62 });
    for (const e of [-1, 1]) {
      P.add('camo', box(2.6, 0.3, 0.16, 0, y0 + 1.06, zc + e * 1.95));
      for (const x of [-0.88, 0.88]) P.add('steel', zTube(zc + e * 2.0, zc + e * 2.12, 0.2, 0.2, 20, x, y0 + 1.06));
    }
  }
  // their net, on poles either side of the spur
  {
    const z0 = 21.5, z1 = 34.5, NX = 3.6;
    for (let z = z0; z <= z1 + 0.1; z += (z1 - z0) / 4) for (const x of [-NX, NX]) P.add('timber', yTube(0, 3.6 + spurY(z) * 0.5, 0.06, 0.05, 6, x, z));
    PN.add('net', drape(-NX, NX, z0, z1, (x, z) => 3.6 + spurY(z) * 0.5 + 0.3, rnd));
  }
  // ---- the earth bank round the ring, gaps for the spur (+Z) and a way in on the left (-X)
  {
    const prof = [[23.6, -0.3], [23.3, 0], [21.2, 1.35], [20.6, 1.45], [20.0, 1.35], [19.6, 0], [19.4, -0.3]].map(([r, y]) => new THREE.Vector2(r, y));
    const gaps = [[0, 0.16], [Math.PI * 1.5, 0.1]];
    const cuts = gaps.map(([c, w]) => [c - w, c + w]).sort((a, b) => a[0] - b[0]);
    let start = cuts[0][1];
    for (let i = 1; i <= cuts.length; i++) {
      const end = i < cuts.length ? cuts[i][0] : cuts[0][0] + Math.PI * 2;
      earthG(new THREE.LatheGeometry(prof, Math.max(6, Math.round((end - start) * 18)), start, end - start));
      if (i < cuts.length) start = cuts[i][1];
    }
    for (const [c, w] of gaps) for (const e of [-1, 1]) P.add('timber', box(0.15, 1.4, 3.6, 0, 0.7, 0).translate(0, 0, 21.4).rotateY(c + e * w));
  }
  // ---- the charge store dug in beside the spur, the crew's dugout, shells stacked under a net
  const bunker = (x, z, w, d, h, ang) => {
    const Q = new Parts(M), g = new THREE.Group();
    conc(Q, box(w, h, d, 0, h / 2, 0), 0xd0ccc4);
    conc(Q, box(w + 0.6, 0.35, d + 0.6, 0, h + 0.18, 0), 0xc8c4bc);
    Q.add('dark', box(1.3, 1.9, 0.08, 0, 0.95, -d / 2 - 0.02));
    Q.add('camo', box(1.2, 1.8, 0.05, -0.2, 0.92, -d / 2 - 0.08, 0, 0.35, 0));
    for (const s of [-1, 1]) conc(Q, box(0.45, h, 1.8, s * 1.1, h / 2, -d / 2 - 0.9), 0xc4c0b8);
    Q.build(g, { dirt: 0.2 });
    g.position.set(x, 0, z);
    g.rotation.y = ang;
    root.add(g);
    const m = new THREE.Matrix4().makeRotationY(ang).setPosition(x, 0, z);
    earthG(box(w + 3, 0.9, d + 3, 0, h + 0.75, 0).applyMatrix4(m));
  };
  bunker(9.5, 31, 6, 4.5, 2.6, Math.PI / 2);
  bunker(-29, -4, 5, 4, 2.2, -Math.PI / 2);
  P.add('dark', yTube(2.6, 3.9, 0.05, 0.05, 8, -28.4, -4.6));
  P.add('dark', box(0.14, 0.12, 0.25, -28.4, 3.95, -4.7));
  for (let i = 1; i < 5; i++) {
    const x = -29 - i * 8, z = -4 + i * 3;
    P.add('timber', yTube(0, 5.2, 0.09, 0.07, 7, x, z));
    P.add('timber', box(0.8, 0.07, 0.07, x, 5.0, z));
  }
  // shells in a stack by the store, on timber, under a net on poles
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 6), x = -5.2 + (i % 6) * 0.32 + (row ? 0.16 : 0), y = 0.2 + SHELL.rad + row * 0.26;
    for (const [geo, k] of [[sg.body, 'shell'], [sg.band, 'brass'], [sg.fuze, 'steel']]) P.add(k, geo.clone().translate(x + 13.5, y, 37.5));
  }
  for (const dz of [-0.4, 0.4]) P.add('timber', box(2.4, 0.14, 0.18, 8.5 - 0.15, 0.07, 37.5 + dz));
  {
    const [x0, x1, z0, z1] = [5, 13.5, 27, 40.5];
    for (const s of [x0, x1]) for (const t of [z0, (z0 + z1) / 2, z1]) P.add('timber', yTube(0, 4.2, 0.06, 0.05, 6, s, t));
    PN.add('net', drape(x0, x1, z0, z1, () => 4.4, rnd));
  }
  // timber and rail stacks for the turntable's upkeep, a hand trolley
  for (let i = 0; i < 9; i++) P.add('timber', box(0.24, 0.24, 4.2, -24 + (i % 3) * 0.27, 0.12 + Math.floor(i / 3) * 0.24, 14 + rnd() * 0.2));
  for (let i = 0; i < 6; i++) P.add('steel', box(0.07, 0.15, 8, -26.5 - i * 0.16, 0.08, 9 + rnd() * 0.3));
  P.build(root, { dirt: 0.2 });
  PN.build(root, { dirt: 0 });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== net; o.receiveShadow = true; } });
  return { root };
}

// a camouflage net between poles: a sagging sheet over x0..x1, z0..z1, its edges pulled down toward the ground
function drape(x0, x1, z0, z1, top, rnd) {
  const nx = Math.max(4, Math.round((x1 - x0) / 1.5)), nz = Math.max(4, Math.round((z1 - z0) / 1.5));
  const g = new THREE.PlaneGeometry(1, 1, nx, nz).rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getZ(i) + 0.5, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const sag = 0.35 * Math.sin(u * Math.PI * nx / 2) ** 2 * Math.sin(v * Math.PI * nz / 2) ** 2 + (rnd() - 0.5) * 0.12;
    const y = top(x, z) - sag - (edge < 0.001 ? 1.4 : 0);
    p.setXYZ(i, x + (edge < 0.001 ? (u < 0.001 ? -1 : u > 0.999 ? 1 : 0) : 0), y, z + (edge < 0.001 ? (v < 0.001 ? -1 : v > 0.999 ? 1 : 0) : 0));
    uv.setXY(i, x / 6, z / 6);
  }
  g.computeVertexNormals();
  return g;
}

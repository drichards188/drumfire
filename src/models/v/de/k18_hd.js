import * as THREE from 'three';
import { V, box, xTube, yTube, rod } from '../../kit.js';
import { node } from '../../rig.js';
import { trayShells } from '../../t/fieldkit.js';
import {
  HDParts, meshOf, chamferBox, M4, TAU, lathe, cyl, annulus, bevelPlate, knurled, angleIron, rivetsHD, rowPts, boltsHD,
  nippleProto, oilCupProto, instances, onSurface, dataPlate, cableHD, weldBead, handwheelHD, gearSector, pinion,
  ticksRing, gratingHD, mergeHD, bar, along, castellated, prism, geo, liftingEyeProto,
} from '../../hdkit.js';
import { meshSDF, occShade, rboxAt, rrect, extrude, cylA, smin, smax, ssub, clamp, polySDF2, grid2, arc2, splitUV } from '../../sdfkit.js';

/**
 * The HD tier of the Mörserlafette (buildMrs18({ hd: true }), buildK18({ hd: true })): the max-quality hero gun of the
 * basic training (shots/maxq/PLAN.md 3.1). The standard model is built first, every line as before, and stays in the rig
 * (rig.std), so the crew's clearance field, crewcheck and every pose are the standard gun's; the HD meshes go into
 * groups tagged userData.tier ('hd' and 'micro') under the same pivots. rig.setDetail(0 | 1 | 2): 0 the standard meshes,
 * 1 the HD meshes in their place, 2 HD plus the micro detail (rivets, bolts, ticks: never shadow casters).
 *
 * Parts the HD tier has not rebuilt yet are the standard geometry itself, recorded as k18.js adds it (P.tag names each
 * group of parts) and merged again here with the kit's own UV projection, so they look exactly as before; each HD
 * section replaces its tags. The geometry is built once per kind and shared by both guns of the battery.
 *
 * Also here, for the motion, materials and sound tracks: rig.gear (the handwheels, the sight's head, the elevation
 * dial, the block's crank, the firing lever: each on its own pivot, turned about its local X unless noted), rig.knobs
 * (grip points that move with them), rig.body (the whole gun between the root and its pivots, so a shudder moves the
 * gun and not the men), rig.anchors.chamber/treads/staffHooks/casePile and rig.wearHints.
 */

// machined steel (the slot's faces, the block) under the max-quality materials: their bare steel's base is a dark 0.2,
// right for the oiled rods and bolts, but the machined faces of the slot and block read in the photographs as light as
// the paint (a reflectance near 0.55)
const MACHINED = 2.6;

// tags of the standard build replaced by HD sections (the rest is ported as it is)
const REPLACED = new Set(['handwheels', 'sight', 'dial', 'crank', 'firingLever', 'ladderR',
  'cheeks', 'bearings', 'gearbox', 'pinion', 'arc', 'sightMount', 'footplates',
  'ring', 'lug', 'rod', 'block', 'lock', 'chamber', 'tray', 'barrel', 'bore', 'band',
  'cradle', 'guideRings', 'cylinder', 'trunnions', 'eqArms', 'eqBracket', 'wheels', 'fenders', 'brakes']);
const CACHE = new Map(); // kind -> { items, gear }

// Record the standard parts as k18.js adds them: rig.part() then hands out collectors that remember each (tag, key,
// geometry) and the pivot and options they are built into. The geometry objects are the caller's (Parts.add copies
// them), so nothing is cloned here.
export function recordParts(rig) {
  const rec = [], part = rig.part;
  rig.part = () => {
    const P = part(), add = P.add.bind(P), build = P.build.bind(P), list = [];
    let tag = '';
    P.tag = (t) => { tag = t; return P; };
    P.add = (key, geom, o) => { list.push({ tag, key, geom }); return add(key, geom, o); };
    P.build = (parent, o = {}) => { rec.push({ parent, o, list }); return build(parent, o); };
    return P;
  };
  return rec;
}

// where the moving parts sit (their parent pivot, position, and a fixed base turn for the crank, whose local X is the bore)
function gearDefs(G, c) {
  const { TRY, TRZ, FOOT, BR } = c.K, { rw, rh, rl, fw } = c;
  const bz = (rl - fw) / 2; // the block's rear face in the breech pivot's frame
  return {
    wheelL: { parent: 'carriage', p: [-0.78, FOOT + 1.12, 0.55], y0: FOOT + 1.12 },
    wheelR: { parent: 'carriage', p: [0.78, FOOT + 1.12, 0.55], y0: FOOT + 1.12 },
    sightHead: { parent: 'carriage', p: [-0.92, c.sy + 0.24, 0.39], y0: c.sy + 0.24 },
    elDial: { parent: 'carriage', p: [-0.665, TRY - 0.42, TRZ + 0.18], y0: TRY - 0.42 },
    // on the block's rear face, low on the right; the base turn makes the pivot's local X the bore axis (pointing back)
    crank: { parent: 'breech', p: [rw * 0.3, -rh * 0.12, bz + 0.012], base: [0, -Math.PI / 2, 0], y0: TRY - rh * 0.12 },
    // on the breech ring's right top, turning about X: its arm leans back over the ring, the lanyard on its eye
    lever: { parent: 'recoil', p: [rw * 0.5 + 0.03, rh * 0.4, BR - 0.05], y0: TRY + rh * 0.4 },
    // (internal: the elevating pinion on the left cheek, turned by setElevation so it rolls with the arc)
    pinion: { parent: 'carriage', p: [-0.43, TRY - 0.787, TRZ - 0.069], y0: TRY - 0.787, inner: true },
    // (internal: the equilibrators' cases from their lower pins and their tubes from the arms' pins, placed each pose)
    eqCaseL: { parent: 'carriage', p: [-c.K.EQ.x, c.K.EQ.lo[0], c.K.EQ.lo[1]], y0: c.K.EQ.lo[0], inner: true },
    eqCaseR: { parent: 'carriage', p: [c.K.EQ.x, c.K.EQ.lo[0], c.K.EQ.lo[1]], y0: c.K.EQ.lo[0], inner: true },
    eqTubeL: { parent: 'carriage', p: [-c.K.EQ.x, TRY + c.K.EQ.up[0], TRZ + c.K.EQ.up[1]], y0: TRY + 0.25, inner: true },
    eqTubeR: { parent: 'carriage', p: [c.K.EQ.x, TRY + c.K.EQ.up[0], TRZ + c.K.EQ.up[1]], y0: TRY + 0.25, inner: true },
  };
}

// the tread tops of the stair at the right walkway's rear corner (traverse frame, which is rest rig space at zero traverse)
function treadsOf(c) {
  const { DECK } = c.K, top = DECK - 0.03;
  return [0.22, 0.44, 0.66, 0.88].map((h) => {
    const t = 1 - h / top;
    return [1.44, h, 4.7 + 0.7 * t];
  });
}

export function buildHD(rig, G, c) {
  // the standard meshes the HD tier stands in for: all but the tray's rounds (props; their 64-segment twins below)
  const std = [], keep = new Set();
  rig.root.traverse((o) => {
    if (!o.isMesh || keep.has(o)) return;
    for (let p = o; p; p = p.parent) if (p.name && p.name.startsWith('shell-')) return;
    std.push(o);
  });
  const gear = gearDefs(G, c);
  let spec = CACHE.get(G.kind);
  if (!spec) {
    const t0 = performance.now();
    spec = makeSpec(rig, G, c, gear);
    spec.ms = performance.now() - t0;
    CACHE.set(G.kind, spec);
  }
  const P = { root: rig.root, ...rig.pivots };
  // the moving parts' pivots (plain Object3Ds, not in rig.pivots: the rig contract's pivot list stays as it was)
  rig.gear = {};
  for (const [name, d] of Object.entries(gear)) {
    let parent = P[d.parent];
    if (d.base) parent = node(parent, name + 'Base', ...d.p, ...d.base);
    const pv = d.base ? node(parent, name, 0, 0, 0) : node(parent, name, ...d.p);
    P[name] = pv;
    if (!d.inner) rig.gear[name] = pv;
  }
  // the pinion rolls on the elevating arc: it turns with the elevation by the ratio of their pitch radii
  const pin = P.pinion, el = rig.pivots.elevation, setEl = rig.setElevation, upd = rig.update;
  // the equilibrators: each case stands on its lower pin pointing at the arm's pin, each tube hangs from the arm's pin
  // pointing back at the lower one; nothing stretches (no allocation: the vectors are the rig's)
  const { EQ } = c.K, eqs = [-1, 1].map((s) => ({ s, cs: P[s < 0 ? 'eqCaseL' : 'eqCaseR'], tb: P[s < 0 ? 'eqTubeL' : 'eqTubeR'], a: new THREE.Vector3(s * EQ.x, EQ.lo[0], EQ.lo[1]), b: new THREE.Vector3(), d: new THREE.Vector3() }));
  const UP = new THREE.Vector3(0, 1, 0);
  const placeEq = () => {
    const e = el.rotation.x, co = Math.cos(e), sn = Math.sin(e);
    for (const q of eqs) {
      q.b.set(q.a.x, el.position.y + EQ.up[0] * co - EQ.up[1] * sn, el.position.z + EQ.up[0] * sn + EQ.up[1] * co);
      q.d.copy(q.b).sub(q.a).normalize();
      q.cs.quaternion.setFromUnitVectors(UP, q.d);
      q.tb.position.copy(q.b);
      q.d.negate();
      q.tb.quaternion.setFromUnitVectors(UP, q.d);
    }
  };
  const roll = () => { pin.rotation.x = -el.rotation.x * spec.pinionRatio + spec.pinionPhase; placeEq(); };
  rig.setElevation = (r) => { setEl(r); roll(); };
  rig.update = (dt) => { upd(dt); roll(); };
  roll();
  // the tier groups and the meshes over the shared geometry
  const tiers = { hd: [], micro: [] }, groups = new Map();
  // (lod: a part drawn at one detail only, 1 or 2: the breech forging has a coarse mesh for detail 1 and a fine one
  // for 2; 0 for every other part)
  const group = (at, tier, lod = 0) => {
    const k = at + '|' + tier + '|' + lod;
    let g = groups.get(k);
    if (!g) {
      g = node(P[at], tier);
      g.userData.tier = tier;
      g.userData.hdGun = true; // render/crewfield.js leaves these out of its bounds
      if (lod) g.userData.lod = lod;
      groups.set(k, g);
      tiers[tier].push(g);
    }
    return g;
  };
  const meshes = [];
  for (const it of spec.items) meshes.push(meshOf(group(it.at, it.tier, it.lod), it.geometry, rig.mats, it.key, it.tier, it.shadow !== false));
  // the tray's rounds at 64 segments round; the standard ones join rig.std (rig.setShell drives both sets)
  const trayNode = c.tp.children.find((o) => o.name === 'shell-tray');
  if (trayNode) {
    const stdSet = rig.setShell, hdNode = node(c.tp, 'shell-trayHD', trayNode.position.x, trayNode.position.y, trayNode.position.z);
    hdNode.userData.tier = 'hd';
    hdNode.userData.hdGun = true;
    trayShells(rig, hdNode, G.kind, 64);
    const hdSet = rig.setShell;
    rig.setShell = (where, visible) => { stdSet(where, visible); hdSet(where, visible); };
    trayNode.traverse((o) => { if (o.isMesh) std.push(o); });
    tiers.hd.push(hdNode);
  }

  // grip points that turn with the gear (rig.knobs) and the drill's anchors
  rig.knobs = {
    wheelL: node(rig.gear.wheelL, 'knobL', ...spec.knob.wheelL),
    wheelR: node(rig.gear.wheelR, 'knobR', ...spec.knob.wheelR),
    crank: node(rig.gear.crank, 'knobCrank', ...spec.knob.crank),
    lever: node(rig.gear.lever, 'knobLever', ...spec.knob.lever),
  };
  const { DECK } = c.K;
  rig.anchors.chamber = node(c.rc, 'chamber', 0, 0, c.ring0 + c.fw);
  rig.anchors.treads = treadsOf(c).map((p, i) => node(c.trav, 'tread' + i, ...p));
  rig.anchors.staffHooks = [3.55, 4.95].map((z, i) => node(c.trav, 'staffHook' + i, 0.58, DECK + 0.075, z));
  rig.anchors.casePile = node(rig.root, 'casePile', 3.4, 0, 5.9);
  rig.wearHints = wearHints(G, c);

  // the body: everything of the gun between the root and its pivots (the men, their props and the ground anchors stay
  // on the root), so a shudder of the body moves the steel and not the crew
  const body = new THREE.Group();
  body.name = 'body';
  for (const o of [...rig.root.children]) if (o !== rig.anchors.shellStack && o !== rig.anchors.casePile) body.add(o);
  rig.root.add(body);
  rig.body = body;

  rig.hd = true;
  rig.std = std;
  rig.hdMeshes = meshes;
  rig.hdStats = { buildMs: spec.ms, tris: spec.tris };
  rig.detail = -1;
  rig.setDetail = (lv) => {
    lv = Math.max(0, Math.min(2, lv | 0));
    if (lv === rig.detail) return;
    rig.detail = lv;
    for (const m of std) m.visible = lv === 0;
    for (const g of tiers.hd) g.visible = lv >= 1 && (!g.userData.lod || g.userData.lod === Math.min(lv, 2));
    for (const g of tiers.micro) g.visible = lv >= 2;
  };
  rig.setDetail(2);
  return rig;
}

// The HD geometry of one kind: [{ at, tier, key, geometry, shadow }], built once and shared by every rig of the kind.
function makeSpec(rig, G, c, gear) {
  const items = [], mats = rig.mats;
  const P = { root: rig.root, ...rig.pivots };
  const nameOf = new Map(Object.entries(P).map(([k, v]) => [v, k]));
  const DIRT = {}; // per pivot: the standard build's dirt and y0, reused for the HD parts there
  const put = (at, H, o, tier = 'hd', shadow = true, lod = 0) => { for (const { key, geometry } of H.merge(o)) items.push({ at, tier, key, geometry, shadow, lod }); };

  // the standard parts not rebuilt yet, merged again as they were (same UVs, same vertex colours)
  for (const r of c.rec) {
    const at = nameOf.get(r.parent);
    if (!at) continue;
    DIRT[at] = { dirt: r.o.dirt ?? 0, y0: r.o.y0 ?? 0 };
    const H = new HDParts(mats);
    for (const e of r.list) if (!REPLACED.has(e.tag)) H.add(e.key, e.geom, { uv: 'std' });
    if (!H.empty) put(at, H, DIRT[at]);
  }
  // HD parts: the standard build's dirt for the pivot (or the gear's parent pivot) and the true height of the frame's
  // origin above the ground (the block's standard parts were built with y0 0)
  const { TRY: Y } = c.K, Y0 = { root: 0, traverse: 0, carriage: 0, elevation: Y, recoil: Y, breech: Y, loadTray: Y };
  const dirtAt = (at, extraY = 0) => {
    const g = gear[at], base = g ? g.parent : at;
    return { dirt: DIRT[base]?.dirt ?? 0.2, y0: g ? g.y0 : (Y0[at] ?? 0) + extraY };
  };
  const knob = {};

  // ---- the layer's station and the cheeks (item 3)
  const st = stationHD(c, gear, knob);
  const addAll = (parts) => {
    for (const [at, list] of Object.entries(parts)) for (const [tier, fill, lod, mq] of list) {
      const H = new HDParts(mats);
      fill(H);
      if (H.empty) continue;
      const n0 = items.length;
      put(at, H, dirtAt(at), tier, tier !== 'micro', lod ?? 0);
      // what the max-quality materials (models/maxq.js) do differently here: a forging's baked occlusion comes out of
      // its colour (they bake their own), its curvature is read from the field's smooth normals, machined steel is lighter
      if (mq) for (let i = n0; i < items.length; i++) {
        const k = items[i].key, occ = mq.sdf?.[k] ?? null, tint = mq.tint?.[k] ?? 1;
        if (occ || tint !== 1) items[i].geometry.userData.mqBake = { occ, tint, smooth: !!mq.sdf };
      }
    }
  };
  addAll(st.parts);

  // ---- the breech end (item 4), the barrel and its rifled bore (item 5)
  addAll(breechHD(c, G, knob));
  addAll(barrelHD(c, G));
  // ---- the cradle, the recoil cylinder, the trunnions and the equilibrators (items 6 and 7)
  addAll(cradleHD(c));
  // ---- the road wheels, their mudguards and brakes (item 8)
  addAll(wheelsHD(c));

  // ---- the stair at the right walkway's rear corner (the treads the carrying pair climbs; it stands where the
  // standard ladder stands, inside its footprint): flat-bar stringers and four chequered treads
  {
    const H = new HDParts(mats), { DECK } = c.K, top = DECK - 0.03;
    for (const x of [1.3, 1.58]) {
      const a = V(x, top, 4.7), b = V(x, 0, 5.4), len = a.distanceTo(b);
      const g = chamferBox(0.012, len, 0.07, 0.002);
      g.rotateX(Math.atan2(a.z - b.z, a.y - b.y)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      H.add('camo', g);
    }
    for (const [x, y, z] of treadsOf(c)) H.add('camo', chamferBox(0.27, 0.012, 0.15, 0.003, x, y - 0.006, z));
    for (const z of [3.55, 4.95]) { // the rammer staff's hooks at the deck's right edge
      H.add('steel', chamferBox(0.012, 0.09, 0.03, 0.002, 0.62, DECK + 0.04, z));
      H.add('steel', chamferBox(0.05, 0.012, 0.03, 0.002, 0.6, DECK + 0.004, z));
      H.add('steel', chamferBox(0.012, 0.035, 0.03, 0.002, 0.545, DECK + 0.025, z));
    }
    put('traverse', H, dirtAt('traverse'));
  }

  let tris = 0;
  for (const it of items) tris += it.geometry.index.count / 3;
  return { items, knob, tris, pinionRatio: st.pinionRatio, pinionPhase: st.pinionPhase };
}

// Where the paint wears (PLAN 3.1, for the materials track): spheres { p, r } or capsules { p, a, r } in rest rig space
// (the root frame with the gun at zero traverse, elevation, recoil and the block shut), each with `pivot` (the standard
// pivot it moves with), and `k` (strength) and `up` (the least upward facing it applies to) where it matters.
function wearHints(G, c) {
  const { TRY, TRZ, DECK, FOOT, RAIL, CYL, BR } = c.K, el = (x, y, z) => [x, TRY + y, TRZ + z];
  const { rw, rh, rl, fw, ring0, MZ } = c, bx = rw * 0.11, bzc = ring0 + fw + (rl - fw) / 2;
  const H = [];
  const add = (kind, pivot, p, r, a, more) => H.push({ kind, pivot, p, r, ...(a ? { a } : {}), ...(more ?? {}) });
  // grips: the handwheels, the sight's knobs, the jack cranks, the trail spike, the block's crank, the firing lever
  for (const s of [-1, 1]) add('grip', 'carriage', [s * 0.78, FOOT + 1.12, 0.55], 0.24);
  add('grip', 'carriage', [-0.92, c.sy + 0.27, 0.39], 0.09);
  for (const s of [-1, 1]) add('grip', 'traverse', [s * 0.76, 1.2, -1.97], 0.14);
  add('grip', 'traverse', [0.69, 0.84, 2.3], 0.05, [0.69, 0.84, 4.25]);
  add('grip', 'breech', el(bx + rw * 0.3, -rh * 0.12, bzc + (rl - fw) / 2 + 0.06), 0.17);
  add('grip', 'recoil', el(rw * 0.5 + 0.06, rh * 0.45, BR + 0.02), 0.09);
  // boots: the walkways, the footplates, the deck, the stair, the trail float
  for (const s of [-1, 1]) add('boot', 'traverse', [s * 1.12, DECK, 0.95], 0.5, [s * 1.12, DECK, 4.72], { up: 0.7 });
  for (const s of [-1, 1]) add('boot', 'traverse', [s * 1.045, FOOT, 0.1], 0.42, [s * 1.045, FOOT, 0.95], { up: 0.7 });
  add('boot', 'traverse', [0, DECK, 3.3], 0.6, [0, DECK, 5.0], { up: 0.7 });
  add('boot', 'traverse', [1.44, 0.88, 4.82], 0.17, [1.44, 0.22, 5.26], { up: 0.7 });
  add('boot', 'traverse', [0, 0.05, 5.25], 0.75, null, { up: 0.7 });
  // slides: the top carriage's rails, the block's slot in the ring
  for (const s of [-1, 1]) add('slide', 'traverse', [s * 0.5, RAIL + 0.011, -2.05], 0.04, [s * 0.5, RAIL + 0.011, 4.95], { up: 0.7 });
  add('slide', 'recoil', el(-rw * 0.28, 0, ring0 + fw + 0.02), 0.06, el(rw * 0.5, 0, ring0 + fw + 0.02));
  // the loading opening's lip, worn bright by the rounds and cases (the wartime photographs: bright only there), most at
  // the bottom; five chords round the crown, the channel's side left out
  { const { zr, mouth: m } = breechDims(c), r = m.ro - m.rc * 0.6, z = zr + m.p - 0.006;
    for (let i = 0; i < 5; i++) {
      const a0 = (-150 + i * 60) * Math.PI / 180, a1 = a0 + Math.PI / 3, k = [1, 1, 0.6, 0.45, 0.45][i];
      add('slide', 'recoil', el(r * Math.cos(a0), r * Math.sin(a0), z), 0.034, el(r * Math.cos(a1), r * Math.sin(a1), z), { k });
    } }
  // oil: the recoil cylinder's gland and the piston rod, the trunnions, the pivot housing
  add('oil', 'elevation', el(0, CYL.y, cylEnd(c) + 0.08), 0.2);
  add('oil', 'recoil', el(0, CYL.y, cylEnd(c) + 0.1), 0.06, el(0, CYL.y, breechDims(c).lz0));
  for (const s of [-1, 1]) add('oil', 'elevation', el(s * 0.6, 0, 0), 0.15);
  add('oil', 'traverse', [0, 0.36, 0], 0.3);
  // soot: the muzzle and the breech's rear face round the chamber
  add('soot', 'recoil', el(0, 0, MZ), 0.3);
  add('soot', 'recoil', el(0, 0, BR), 0.35);
  return H;
}

// ---------------------------------------------------------------- shared shapes

// the height of a [z, y] outline's top edge at z (k18.js topAt)
function topAt(poly, z) {
  let b = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    if ((a[0] - z) * (c[0] - z) <= 0 && a[0] !== c[0]) b = Math.max(b, a[1] + ((c[1] - a[1]) * (z - a[0])) / (c[0] - a[0]));
  }
  return b;
}
// the unit normal of the outline's edge a..b that points into the outline (toward the centroid)
function inward(poly, a, b) {
  const cz = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let nz = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
  if (nz * (cz - a[0]) + ny * (cy - a[1]) < 0) { nz = -nz; ny = -ny; }
  return [nz, ny];
}
// points along the inside of an outline (kit.js rivetPoly's rule): [z, y, edge index]
function polyPts(poly, inset, pitch) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < pitch * 0.7) continue;
    const [nz, ny] = inward(poly, a, b), n = Math.max(1, Math.round(L / pitch));
    for (let k = 1; k < n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t + nz * inset, a[1] + (b[1] - a[1]) * t + ny * inset, i]); }
  }
  return out;
}
// a lathe profile [a, r] built for the +a side, for the -a side (mirrored and re-listed so its normals still face out)
const mirrorProf = (prof) => prof.map(([a, r]) => [-a, r]).reverse();
const side = (s, prof) => (s > 0 ? prof : mirrorProf(prof));
// a turned part along a -> b (its profile [along, r] from a)
const latheAlong = (a, b, prof, seg = 24, o = {}) => lathe(prof, { seg, axis: 'y', ...o }).applyMatrix4(along(a, b));

// ---------------------------------------------------------------- item 3: the layer's station and the cheeks

// The cheeks with their flanges and stiffeners as angles and two-row riveting, the trunnion bearings with bolted caps,
// the gearboxes with bolted covers and the HD handwheels on their pivots, the elevating pinion (rolling with the arc)
// and the arc with its web and scale, the elevation dial (its pointer on elDial), the Rundblickfernrohr on its mount
// (its head on sightHead) with the lamp's cable to its battery box, the footplates as gratings, a maker's plate.
function stationHD(c, gear, knob) {
  const { TRY, TRZ, RAIL, FOOT, DECK } = c.K, sy = c.sy, parts = {};
  const add = (at, tier, fill) => (parts[at] ??= []).push([tier, fill]);
  const cheek = [[-1.45, RAIL + 0.06], [2.55, RAIL + 0.06], [2.55, 1.52], [1.55, 1.52], [1.05, 1.95], [0.55, TRY + 0.08],
    [0.35, TRY + 0.24], [-0.25, TRY + 0.24], [-0.5, TRY + 0.08], [-0.95, 1.95], [-1.45, 1.55]];
  const tops = []; // the flanged top edges: [a, b, rx, mid, inward]
  for (let i = 2; i < cheek.length - 1; i++) {
    const a = cheek[i], b = cheek[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    tops.push({ a, b, L, rx: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), mz: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, n: inward(cheek, a, b) });
  }
  const STIFF = [-1.0, -0.62, 0.72, 1.2, 2.05];

  // ---- the cheeks: bevelled plates, the top edges capped with a strip over two angle legs, stiffeners as angles
  add('carriage', 'hd', (H) => {
    for (const s of [-1, 1]) {
      H.add('camo', bevelPlate(cheek, 0.05, { bevel: 0.006 }).translate(s * 0.555, 0, 0));
      for (const t of tops) {
        H.add('camo', chamferBox(0.12, 0.018, t.L + 0.02, 0.004, s * 0.555, t.my, t.mz, t.rx));
        for (const f of [-1, 1]) H.add('camo', chamferBox(0.01, 0.07, t.L - 0.012, 0.002, s * 0.555 + f * 0.0305, t.my + t.n[1] * 0.044, t.mz + t.n[0] * 0.044, t.rx));
      }
      for (const z of STIFF) {
        const top = topAt(cheek, z) - 0.03, y0 = RAIL + 0.08, h = top - y0, ym = (top + y0) / 2;
        H.add('camo', chamferBox(0.008, h, 0.06, 0.002, s * 0.584, ym, z));
        H.add('camo', chamferBox(0.045, h, 0.008, 0.002, s * 0.6025, ym, z + 0.026));
      }
    }
  });
  // ---- their rivets: the border rows at 75 mm, the flanges' legs, the stiffeners
  add('carriage', 'micro', (H) => {
    const pts = [], nrm = [];
    for (const s of [-1, 1]) {
      const N = V(s, 0, 0);
      for (const [z, y, e] of polyPts(cheek, 0.05, 0.075)) {
        if (e >= 2 && e < cheek.length - 1) continue; // the top edges' rows are on their legs
        if (STIFF.some((q) => Math.abs(q + 0.01 - z) < 0.045) && y > RAIL + 0.07) continue;
        pts.push(V(s * 0.58, y, z)); nrm.push(N);
      }
      for (const t of tops) for (const p of rowPts(V(0, t.a[1] + t.n[1] * 0.05, t.a[0] + t.n[0] * 0.05), V(0, t.b[1] + t.n[1] * 0.05, t.b[0] + t.n[0] * 0.05), 0.075, { skipEnds: true })) { pts.push(V(s * 0.5905, p.y, p.z)); nrm.push(N); }
      for (const z of STIFF) {
        const top = topAt(cheek, z) - 0.03;
        for (const p of rowPts(V(0, RAIL + 0.12, z - 0.012), V(0, top - 0.04, z - 0.012), 0.075)) { pts.push(V(s * 0.588, p.y, p.z)); nrm.push(N); }
      }
    }
    H.add('camo', rivetsHD(pts, nrm, 0.0125));
    // the weld round each bearing housing where it meets the plate
    for (const s of [-1, 1]) H.add('camo', weldBead(Array.from({ length: 49 }, (_, i) => V(s * 0.582, TRY + Math.sin((i / 48) * TAU) * 0.213, TRZ + Math.cos((i / 48) * TAU) * 0.213)), 0.0045));
  });

  // ---- the trunnion bearings: a flanged housing round each trunnion, a bolted cap on top
  add('carriage', 'hd', (H) => {
    for (const s of [-1, 1]) {
      const prof = [[0.53, 0.115], [0.53, 0.205], [0.535, 0.21], [0.625, 0.21], [0.629, 0.228], [0.655, 0.228], [0.66, 0.223], [0.66, 0.115], [0.53, 0.115]];
      H.add('camo', lathe(side(s, prof), { seg: 72, axis: 'x', c: [TRY, TRZ], crease: 40 }), { uv: 'keep' });
      H.add('camo', chamferBox(0.13, 0.07, 0.46, 0.008, s * 0.595, TRY + 0.21, TRZ));
    }
  });
  add('carriage', 'micro', (H) => {
    for (const s of [-1, 1]) {
      const top = TRY + 0.245;
      H.add('steel', boltsHD([V(s * 0.573, top, TRZ - 0.18), V(s * 0.617, top, TRZ - 0.18), V(s * 0.573, top, TRZ + 0.18), V(s * 0.617, top, TRZ + 0.18)], V(0, 1, 0), { af: 0.024, h: 0.014, stud: 0.007 }));
      H.add('steel', instances(nippleProto(), [onSurface(V(s * 0.595, top, TRZ - 0.07), V(0, 1, 0)), onSurface(V(s * 0.595, top, TRZ + 0.07), V(0, 1, 0))]));
      H.add('camo', rivetsHD(Array.from({ length: 8 }, (_, i) => V(s * 0.66, TRY + Math.sin(((i + 0.5) * TAU) / 8) * 0.165, TRZ + Math.cos(((i + 0.5) * TAU) / 8) * 0.165)), V(s, 0, 0), 0.013));
    }
  });

  // ---- the gearboxes (cast housings with a bolted round cover) and the handwheels on their pivots
  const hw = handwheelHD(0.17, { spokes: 4 });
  add('carriage', 'hd', (H) => {
    for (const s of [-1, 1]) {
      const y = FOOT + 1.12;
      H.add('camo', chamferBox(0.14, 0.24, 0.26, 0.012, s * 0.65, y, 0.55));
      H.add('camo', lathe(side(s, [[0.72, 0], [0.72, 0.096], [0.7235, 0.096], [0.727, 0.092], [0.727, 0]]), { seg: 48, axis: 'x', c: [y, 0.55] }), { uv: 'keep' });
      H.add('steel', cyl(s * 0.727, s * 0.74, 0.025, 0.025, { seg: 24, axis: 'x', c: [y, 0.55] }));
    }
  });
  add('carriage', 'micro', (H) => {
    for (const s of [-1, 1]) {
      const y = FOOT + 1.12;
      H.add('steel', boltsHD(Array.from({ length: 6 }, (_, i) => V(s * 0.727, y + Math.cos((i * TAU) / 6) * 0.077, 0.55 + Math.sin((i * TAU) / 6) * 0.077)), V(s, 0, 0), { af: 0.017, h: 0.009, washer: false, stud: 0.004 }));
      H.add('brass', instances(oilCupProto(), [onSurface(V(s * 0.66, y + 0.12, 0.48), V(0, 1, 0))]));
    }
  });
  add('wheelL', 'hd', (H) => H.add('dark', hw.geometry.clone().rotateY(Math.PI), { uv: 'cyl', axis: 'x' }));
  add('wheelR', 'hd', (H) => H.add('dark', hw.geometry.clone(), { uv: 'cyl', axis: 'x' }));
  knob.wheelL = [-hw.knob[0], hw.knob[1], -hw.knob[2]];
  knob.wheelR = [...hw.knob];

  // ---- the elevating pinion (on its own node: setElevation rolls it with the arc) and its shaft into the cheek
  const PM = 0.012, PN = 15; // module and teeth: the pitch radius 0.09 meets the arc's 0.70 at the 0.79 m between their axes
  add('pinion', 'hd', (H) => {
    H.add('steel', pinion(PN, PM, 0.05), { uv: 'cyl', axis: 'x' });
    H.add('steel', cyl(-0.1, 0.04, 0.03, 0.03, { seg: 24, axis: 'x', ch: 0.003 }));
  });
  // ---- the arc (elevation): the toothed rim, its web with two lightening holes, the bolts to the cradle, a scale
  const D = Math.PI / 180;
  add('elevation', 'hd', (H) => {
    H.add('camo', gearSector(0.58, 0.7, 25 * D, 95 * D, 0.05, PM).translate(-0.43, 0, 0));
    const web = [], hole = (a, r) => Array.from({ length: 20 }, (_, i) => { const t = (i / 20) * TAU; return [0.44 * Math.cos(a) + Math.cos(t) * r, -0.44 * Math.sin(a) + Math.sin(t) * r]; });
    for (let i = 0; i <= 24; i++) { const a = (25 + (70 * i) / 24) * D; web.push([0.3 * Math.cos(a), -0.3 * Math.sin(a)]); }
    for (let i = 24; i >= 0; i--) { const a = (25 + (70 * i) / 24) * D; web.push([0.585 * Math.cos(a), -0.585 * Math.sin(a)]); }
    H.add('camo', bevelPlate(web, 0.025, { bevel: 0.004, holes: [hole(45 * D, 0.055), hole(73 * D, 0.055)] }).translate(-0.4, 0, 0));
  });
  add('elevation', 'micro', (H) => {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = (30 + (60 * i) / 7) * D; pts.push(V(-0.4125, -0.335 * Math.sin(a), 0.335 * Math.cos(a))); }
    H.add('steel', boltsHD(pts, V(-1, 0, 0), { af: 0.019, h: 0.01, washer: true, stud: 0.005 }));
    // 0 to 70 degrees every degree, every fifth long, on the web's outer face (white paint)
    H.add('white', ticksRing(0.565, 70, { major: 5, len: 0.012, lenMajor: 0.026, w: 0.0018, h: 0.0008, at: -0.4133, a0: 115 * D, a1: 185 * D }));
  });

  // ---- the elevation dial on the left cheek: the drum, a bezel, the face with its ticks; the pointer on elDial
  {
    const y = TRY - 0.42, z = TRZ + 0.18;
    add('carriage', 'hd', (H) => {
      H.add('camo', lathe(mirrorProf([[0.58, 0], [0.58, 0.125], [0.585, 0.13], [0.64, 0.13], [0.645, 0.126], [0.645, 0]]), { seg: 64, axis: 'x', c: [y, z] }), { uv: 'keep' });
      H.add('dark', lathe(mirrorProf([[0.644, 0.104], [0.644, 0.128], [0.65, 0.131], [0.657, 0.128], [0.661, 0.118], [0.661, 0.108], [0.658, 0.104], [0.644, 0.104]]), { seg: 64, axis: 'x', c: [y, z], crease: 50 }), { uv: 'keep' });
      H.add('dark', cyl(-0.65, -0.644, 0.105, 0.105, { seg: 64, axis: 'x', c: [y, z] }));
    });
    add('carriage', 'micro', (H) => {
      H.add('white', ticksRing(0.1, 72, { major: 2, len: 0.008, lenMajor: 0.016, w: 0.0016, h: 0.0008, at: -0.6508 }).translate(0, y, z));
      H.add('steel', instances(prismScrew(), Array.from({ length: 6 }, (_, i) => onSurface(V(-0.661, y + Math.cos((i * TAU) / 6) * 0.113, z + Math.sin((i * TAU) / 6) * 0.113), V(-1, 0, 0)))));
    });
    // the pointer (the pivot sits at x -0.665 on the dial's axis): a brass needle over the face
    add('elDial', 'hd', (H) => {
      H.add('brass', chamferBox(0.002, 0.088, 0.007, 0.0006, 0.0125, 0.036, 0));
      H.add('brass', cyl(0.0105, 0.0135, 0.009, 0.009, { seg: 20, axis: 'x' }));
    });
  }

  // ---- the panoramic sight (Rundblickfernrohr 32) on its mount (Richtaufsatz): the arm and bracket, the socket, the
  // levels and the elevation drum, the body with its eyepiece elbow and rubber cup, the micrometer drum, the lamp
  const sx = -0.92, sz = 0.39;
  add('carriage', 'hd', (H) => {
    H.add('camo', chamferBox(0.3, 0.06, 0.1, 0.006, -0.78, sy - 0.03, sz));
    H.add('camo', chamferBox(0.06, 0.3, 0.1, 0.006, -0.66, sy - 0.15, 0.32));
    H.add('camo', chamferBox(0.05, 0.14, 0.09, 0.005, -0.605, sy - 0.22, 0.32));
    H.add('dark', lathe([[sy - 0.06, 0], [sy - 0.06, 0.042], [sy - 0.055, 0.047], [sy + 0.03, 0.047], [sy + 0.035, 0.041], [sy + 0.035, 0]], { seg: 40, axis: 'y', c: [sx, sz] }), { uv: 'keep' });
    H.add('dark', lathe([[sy + 0.035, 0], [sy + 0.035, 0.016], [sy + 0.1, 0.016], [sy + 0.104, 0.03], [sy + 0.11, 0.034], [sy + 0.232, 0.034], [sy + 0.236, 0.03], [sy + 0.24, 0]], { seg: 40, axis: 'y', c: [sx, sz], fillet: 0.003 }), { uv: 'keep' });
    const e0 = V(sx - 0.02, sy + 0.184, sz + 0.012), e1 = V(sx - 0.1, sy + 0.2, sz + 0.06), dir = e1.clone().sub(e0).normalize();
    H.add('dark', latheAlong(e0, e1, [[-0.01, 0], [-0.01, 0.017], [e0.distanceTo(e1) - 0.004, 0.017], [e0.distanceTo(e1), 0.019], [e0.distanceTo(e1) + 0.006, 0.019], [e0.distanceTo(e1) + 0.006, 0]], 28), { uv: 'box' });
    const c0 = e1.clone().addScaledVector(dir, 0.004), c1 = c0.clone().addScaledVector(dir, 0.045);
    H.add('rubber', latheAlong(c0, c1, [[0, 0], [0, 0.0185], [0.006, 0.0205], [0.034, 0.022], [0.042, 0.0265], [0.045, 0.0262], [0.045, 0.0195], [0.034, 0.0172], [0.031, 0]], 32, { crease: 45 }), { uv: 'box' });
    H.add('glass', latheAlong(c0.clone().addScaledVector(dir, 0.02), c0.clone().addScaledVector(dir, 0.032), [[0, 0], [0, 0.012], [0.011, 0.012], [0.012, 0]], 20), { uv: 'box' });
    // the micrometer drum toward the layer, the elevation drum on the arm, two levels, the throw-out lever
    H.add('brass', knurled(0.022, 0.02, { n: 40, depth: 0.0012, axis: 'z', c: [sx, sy + 0.13], a0: sz + 0.034 }));
    H.add('dark', cyl(sz + 0.03, sz + 0.035, 0.026, 0.026, { seg: 32, axis: 'z', c: [sx, sy + 0.13] }));
    H.add('brass', knurled(0.034, 0.022, { n: 48, depth: 0.0015, axis: 'z', c: [-0.70, sy - 0.03], a0: sz + 0.05 }));
    H.add('brass', cyl(-0.86, -0.79, 0.0075, 0.0075, { seg: 16, axis: 'x', c: [sy + 0.008, sz - 0.025], ch: 0.0015 }));
    H.add('brass', cyl(sz - 0.035, sz + 0.035, 0.0075, 0.0075, { seg: 16, axis: 'z', c: [-0.84, sy + 0.008], ch: 0.0015 }));
    H.add('dark', chamferBox(0.03, 0.003, 0.008, 0.0008, -0.825, sy + 0.0158, sz - 0.025));
    H.add('dark', chamferBox(0.008, 0.003, 0.03, 0.0008, -0.84, sy + 0.0158, sz));
    H.add('steel', bar(V(sx + 0.03, sy + 0.16, sz - 0.02), V(sx + 0.075, sy + 0.18, sz - 0.03), 0.008, 0.006, 0.0015));
    // the lamp on a clamp by the socket, its cable down the mount and the cheek to the battery box
    H.add('dark', cyl(sy + 0.03, sy + 0.064, 0.0125, 0.0115, { seg: 20, axis: 'y', c: [sx + 0.06, sz + 0.055], ch: 0.002 }));
    H.add('dark', chamferBox(0.03, 0.012, 0.03, 0.002, sx + 0.06, sy + 0.022, sz + 0.055));
    H.add('dark', chamferBox(0.06, 0.12, 0.085, 0.006, -0.615, 1.33, 0.06));
  });
  add('carriage', 'micro', (H) => {
    H.add('rubber', cableHD([V(-0.86, sy + 0.035, 0.445), V(-0.78, sy + 0.005, 0.45), V(-0.66, sy - 0.04, 0.415), V(-0.596, 1.9, 0.392), V(-0.594, 1.62, 0.398), V(-0.594, 1.5, 0.3), V(-0.6, 1.4, 0.1)], 0.0045, { clip: 0.22 }));
    H.add('white', ticksRing(0.0222, 50, { major: 5, len: 0.004, lenMajor: 0.008, w: 0.0008, h: 0.0005, face: 'band', at: sz + 0.04, axis: 'x' }).rotateY(-Math.PI / 2).translate(sx, sy + 0.13, 0));
  });
  // the head: the azimuth housing with its scale, the prism head with its window, the cap
  add('sightHead', 'hd', (H) => {
    H.add('dark', lathe([[0, 0], [0, 0.04], [0.004, 0.045], [0.041, 0.045], [0.045, 0.041], [0.047, 0.03], [0.047, 0]], { seg: 48, axis: 'y', fillet: 0.002 }), { uv: 'keep' });
    H.add('dark', chamferBox(0.08, 0.07, 0.075, 0.006, 0, 0.082, 0));
    H.add('dark', chamferBox(0.06, 0.04, 0.004, 0.0015, 0, 0.084, -0.0385));
    H.add('glass', chamferBox(0.05, 0.03, 0.003, 0.001, 0, 0.084, -0.0402));
    H.add('dark', cyl(0.117, 0.125, 0.022, 0.017, { seg: 32, axis: 'y', ch: 0.002 }));
  });
  add('sightHead', 'micro', (H) => H.add('white', ticksRing(0.0452, 128, { major: 2, len: 0.0035, lenMajor: 0.007, w: 0.0008, h: 0.0005, face: 'band', at: 0.03 }).rotateZ(Math.PI / 2)));

  // ---- the footplates (traverse) as gratings on angle brackets, the post to the walkway
  add('traverse', 'hd', (H) => {
    for (const s of [-1, 1]) {
      const g = gratingHD(s * 0.64, s * 1.45, 0.1, 0.95, FOOT, { pitch: 0.025, bar: [0.003, 0.025], cross: 0.08, split: 3 });
      H.add('camo', g.frame); H.add('camo', g.bars);
      H.add('camo', bar(V(s * 0.63, 0.5, 0.5), V(s * 1.38, FOOT - 0.03, 0.5), 0.045, 0.045, 0.003));
      H.add('camo', chamferBox(0.008, 0.16, 0.12, 0.002, s * 0.66, FOOT - 0.09, 0.5)); // gusset at the girder
      H.add('camo', cyl(FOOT - 0.02, DECK - 0.02, 0.02, 0.02, { seg: 16, axis: 'y', c: [s * 1.43, 0.93], ch: 0.003 }));
    }
  });
  add('traverse', 'micro', (H) => {
    for (const s of [-1, 1]) {
      const g = gratingHD(s * 0.64, s * 1.45, 0.1, 0.95, FOOT, { pitch: 0.025, bar: [0.003, 0.025], cross: 0.08, split: 3 });
      if (g.fine) H.add('camo', g.fine);
    }
  });

  // ---- a plain maker's plate on the left cheek below the dial (no emblem: text, if any, comes from the materials)
  add('carriage', 'micro', (H) => H.add('steel', dataPlate(0.14, 0.09).rotateY(-Math.PI / 2).translate(-0.581, 1.43, 0.2)));

  // the pinion's phase: a gap faces the arc's last tooth with the gun level
  return { parts, pinionRatio: 0.7 / (PN * PM / 2), pinionPhase: 10.7 * D };
}

// a slotted screw head (the dial's bezel screws), along +Y
function prismScrew() {
  return mergeHD([lathe([[0, 0], [0, 0.0045], [0.0012, 0.0045], [0.0025, 0.0035], [0.0028, 0]], { seg: 12, axis: 'y', crease: 40 }), chamferBox(0.007, 0.001, 0.0012, 0, 0, 0.0028, 0)]);
}

// ---------------------------------------------------------------- item 4: the breech end

// The breech end as the photographs show it (Fort Sill rear 2005, Bundesarchiv 101I-118-0379-20 and 101I-113-0006-27,
// the K 18 drill photo "Обслуга (учения)"; the reading in refs/k18_mrs18/README.md): the ring is one massive forging,
// wider than tall, standing higher above the bore than below it, every edge filleted, a turned neck forward over the
// barrel. On its left face the block's end shows in the slot's window near the front (a rebate at its upper front
// corner, guide ribs inside); from the window a lower, straight-edged channel runs back along the left-rear into the
// loading opening, over a thick shelf that stands out of the left face with the block's stop pin in its boss. On the
// rear face the opening is a bell mouth: the bore flares out over a rolled lip standing proud of the face, whole over
// the top, the right and the bottom and open to the left where the channel runs in (from behind, a ring with a band
// to its left; from the left rear, the deep bowl). Guide claws along the bottom; a plinth on top with the lug the
// piston rod is nutted to and its latch. The forging is a signed distance field meshed by surface nets (sdfkit.js):
// every junction filleted by a smooth blend, the mouth an exact profile of revolution, the machined faces on steel,
// meshed twice (fine for detail 2, coarse for detail 1), its UVs split along smooth seams. The block (analytic, a
// rounded box) is steel, its firing mechanism behind the opening, and an arm through a slot in the rear wall's lower
// right carries the crank's boss, so the crank turns where it always did (gearDefs) and slides out with the block.
// The cradle's rear yoke and the recoil cylinder's rear cap (cradleHD) complete the end.

// the breech end's numbers (recoil frame: the bore on the z axis, +z back); the Mörser's ring is the reference size.
// The cuts measured on the photographs at their own angles (Fort Sill from about 50 degrees behind side-on, the
// Bundesarchiv rear view square on), as shares of the face: slot window 28 to 79 % of the height from the top, the
// channel 43 to 69 %, the bowl 36 to 81 %; from behind the lip spans 0.47 of the width with the bore 52 % down.
function breechDims(c) {
  const { rw, rh, rl, fw, ring0, ch } = c, { BR, CYL } = c.K, s = rh / 0.62;
  const xr = rw / 2, xl = -xr - 0.04 * s; // the right face where it was; the forging reaches further left (the bore sits right of its middle)
  const hh = rh / 2, yt = hh + 0.035 * s; // the bottom on the cradle's guides as before; the top higher above the bore
  const zs0 = ring0 + fw, zs1 = zs0 + rl * 0.27; // the block's slot: the front wall's rear face to the rear wall's front face
  // the slot from sy0 to sy1, just clear of the chamber's seat above and below, the bore a little above its middle
  const sy0 = -rh * 0.282, sy1 = rh * 0.234, sh = (sy1 - sy0) / 2, sc = (sy0 + sy1) / 2;
  // the loading opening: its bore (just over the cartridge case), the bell's flare (radial a, axial b) up to the lip's
  // crown, the crown's outer roll and the lip's outer face, and the fillet into the rear face
  const mouth = { rb: 0.125 * s, a: 0.025 * s, b: 0.068 * s, p: 0.024 * s, rc: 0.014 * s, ro: 0.162 * s, fl: 0.008 * s };
  return {
    s, xl, xr, xc: (xl + xr) / 2, hh, yt, zf: zs0 - 0.06 * s, zn: ring0, zr: BR, zs0, zs1, sy0, sy1, sh, sc, mouth,
    ro: mouth.rb, // (the opening's bore: the open block's left end clears it)
    chH: 0.08 * s, chY: -0.012 * s, // the channel's half height and middle (it runs from the slot's window into the opening)
    crank: [rw * 0.41, -rh * 0.12], // the crank's hub (gearDefs: on the block's arm, at the rear face)
    seat: ch + 0.015, cy: CYL.y, neck: c.rAt ? c.rAt(-c.MZ + ring0) + 0.012 : 0.25 * s,
    lz0: BR - 0.3 * s, lz1: BR - 0.07 * s, // the lug on the plinth, from front to back
    // the block's left end when shut, set back in its window as on the Fort Sill gun (the window a recess with the slot's
    // faces showing); open (slidingBlock's travel, rw * 0.78, further right) it clears the opening
    bx0: Math.max(xl + 0.06 * s, mouth.rb + 0.012 * s - rw * 0.78),
  };
}

// The mouth as a profile of revolution in (radius, z), the solid side drawn: the rear wall's face out to any radius,
// the fillet up onto the lip's outer face, the crown's roll, the bell's flare down into the opening's bore, the bore to
// just inside the slot, closed along the axis and far forward. Sampled once on a 1.5 mm grid (exact to well under a
// millimetre at the 9 mm lattice).
function mouthField(D) {
  const { zr, zs1, zs0, mouth: m } = D, zA = zs1 - 0.03, zc = zr + m.p, zLo = zs0 - 0.3;
  const pts = [0, zLo, 2, zLo, 2, zr, m.ro + m.fl, zr];
  const push = (arr) => { for (let i = 0; i < arr.length; i += 2) pts.push(arr[i], arr[i + 1]); };
  push(arc2(m.ro + m.fl, zr + m.fl, m.fl, m.fl, -Math.PI / 2, -Math.PI, 5)); // the fillet into the face
  push(arc2(m.ro - m.rc, zc - m.rc, m.rc, m.rc, 0, Math.PI / 2, 7)); // the crown's outer roll
  push(arc2(m.rb + m.a, zc - m.b, m.a, m.b, Math.PI / 2, Math.PI, 18)); // the bell's flare down to the bore
  pts.push(m.rb, zA, 0, zA);
  const f = polySDF2(pts);
  return grid2(f, 0, zA - 0.04, 0.26, zr + 0.08, 0.0015, (r, z) => (r >= 0.26 ? z - zr : z < zA ? z - zA : z - zc));
}

// the guide grooves in the slot's top and bottom faces (half width, depth; times the ring's scale) and the block's ribs
// in them, 3 mm clear all round
const GROOVE = { w: 0.017, d: 0.016 };
// The ring forging's field (recoil frame): negative inside. Each feature is evaluated only where it can change the value:
// a cut leaves d as it is where the cutter lies at least k - d away, a union where the part lies at least d + k away;
// cheap lower bounds from the features' extents along the axes decide (exact, so the field is the same everywhere).
function ringField(D) {
  const { s, xl, xr, xc, hh, yt, zf, zn, zr, zs0, zs1, sy0, sy1, sh, sc, chH, chY, crank, seat, cy, lz0, lz1, neck, mouth } = D;
  const yc = (yt - hh) / 2, hy = (yt + hh) / 2, hx = (xr - xl) / 2, zb = zr + 0.2, zc = (zf + zb) / 2, hl = (zb - zf) / 2;
  const outZ = (z, a, b) => (z < a ? a - z : z > b ? z - b : 0);
  const S = mouthField(D);
  const rz = zs0 + (zs1 - zs0) * 0.42, cr0 = crank[0] - 0.046 * s;
  // the shelf under the channel (its top the channel's floor) and the stop pin's boss on its face, under its front end
  const shY1 = chY - chH, shY0 = shY1 - 0.05 * s, shX0 = xl - 0.04 * s, shZ0 = zs1 - 0.004, shZ1 = zr - 0.05 * s;
  const pinY = shY0 + 0.004 * s, pinZ = shZ0 + 0.045 * s;
  const kSlot = 0.016 * s, kTail = 0.016 * s, kClaw = 0.035 * s, kPl = 0.03 * s, kLug = 0.05 * s, kRear = 0.05 * s, kCh = 0.015 * s;
  return (x, y, z) => {
    // (out of the padded box the box's distance stands in: a lower bound, which is all the mesher's narrow band needs)
    const bound = rboxAt(x, y, z, xl - 0.14, -hh - 0.12, zn - 0.1, xr + 0.12, cy + 0.2 * s, zr + 0.14, 0);
    if (bound > 0) return bound;
    const ax = Math.abs(x);
    // the outer forging: a rounded section, the upper corners rounded most, its front rim rounded; its rear face is the
    // mouth's profile (the face and the lip), the rim between them a smooth blend
    let d = extrude(rrect(x - xc, y - yc, hx, hy, y > yc ? 0.048 * s : 0.03 * s), z - zc, hl, 0.022 * s);
    if (z > zr - 0.3) d = smax(d, S(Math.sqrt(x * x + y * y), z), kRear);
    // the turned neck forward over the barrel's breech end
    if (zf - z - 0.03 < d + 0.03 * s) d = smin(d, cylA(x, y, z, 'z', 0, 0, neck, zn - 0.004, zf + 0.03, 0.006), 0.03 * s);
    // the guide claws along the bottom
    if (y + hh - 0.05 * s < d + kClaw) d = smin(d, rboxAt(x, y, z, xl - 0.025 * s, -hh - 0.003, zf + 0.04 * s, xr + 0.025 * s, -hh + 0.045 * s, zr - 0.06 * s, 0.012 * s), kClaw);
    // the shelf on the left face under the channel, and the stop pin's boss on its face
    if (Math.max(x - xl - 0.01, outZ(y, shY0 - 0.04 * s, shY1), outZ(z, shZ0, shZ1)) < d + 0.02 * s) {
      d = smin(d, rboxAt(x, y, z, shX0, shY0, shZ0, xl + 0.02, shY1, shZ1, 0.016 * s), 0.02 * s);
      d = smin(d, cylA(x, y, z, 'x', pinY, pinZ, 0.028 * s, shX0 - 0.012 * s, xl, 0.008), 0.012 * s);
    }
    // the plinth on top and the lug rising from it to the piston rod
    if (Math.max(yt - 0.03 - y, ax - 0.19 * s, outZ(z, zs0 + 0.09 * s, zr - 0.04 * s)) < d + kPl) d = smin(d, rboxAt(x, y, z, -0.19 * s, yt - 0.03, zs0 + 0.09 * s, 0.19 * s, yt + 0.028 * s, zr - 0.04 * s, 0.012 * s), kPl);
    if (Math.max(yt - y, ax - 0.088 * s, outZ(z, lz0, lz1 + 0.012 * s)) - 0.01 * s < d + kLug) {
      const lug = smin(rboxAt(x, y, z, -0.08 * s, yt, lz0, 0.08 * s, cy + 0.02 * s, lz1, 0.022 * s), cylA(x, y, z, 'z', 0, cy, 0.084 * s, lz0, lz1 + 0.012 * s, 0.014 * s), 0.025 * s);
      d = smin(d, lug, kLug);
    }
    // the cuts: the block's slot through the ring; the channel from the slot's window back into the mouth (a small
    // blend, so its straight edges meet the lip at a clear corner); the arm's slot at the lower right; the chamber's
    // way through the front wall; the rod's bore through the lug; the rebate at the slot's upper front corner
    if (Math.max(outZ(z, zs0, zs1), Math.abs(y - sc) - sh) < kSlot - d) d = ssub(d, rboxAt(x, y, z, xl - 0.2, sy0, zs0, xr + 0.2, sy1, zs1, 0.007), kSlot);
    if (Math.max(x, Math.abs(y - chY) - chH, zs1 - 0.01 - z) < kCh - d) d = ssub(d, rboxAt(x, y, z, xl - 0.3, chY - chH, zs1 - 0.01, 0, chY + chH, zr + 0.2, 0.012 * s), kCh);
    if (Math.max(cr0 - x, Math.abs(y - crank[1]) - 0.042 * s, zs1 - 0.02 - z) < kTail - d) d = ssub(d, rboxAt(x, y, z, cr0, crank[1] - 0.042 * s, zs1 - 0.02, xr + 0.2, crank[1] + 0.042 * s, zr + 0.2, 0.008), kTail);
    if (Math.max(z - zs0 - 0.02, Math.max(ax, Math.abs(y)) - seat - 0.004) < 0.012 - d) d = ssub(d, cylA(x, y, z, 'z', 0, 0, seat + 0.004, zn - 0.2, zs0 + 0.02, 0), 0.012);
    if (Math.max(ax, Math.abs(y - cy)) - 0.048 * s < 0.012 - d) d = ssub(d, cylA(x, y, z, 'z', 0, cy, 0.048 * s, lz0 - 0.2, lz1 + 0.2, 0), 0.012);
    if (Math.max(x - xl - 0.032 * s, sy1 - 0.02 - y, y - sy1 - 0.025 * s, outZ(z, zs0 - 0.04 * s, zs0 + 0.07 * s)) < 0.012 - d) d = ssub(d, rboxAt(x, y, z, xl - 0.2, sy1 - 0.02, zs0 - 0.04 * s, xl + 0.032 * s, sy1 + 0.025 * s, zs0 + 0.07 * s, 0.006), 0.012);
    // the guide grooves in the slot's top and bottom faces, right through (the block's ribs run in them: blockHD)
    const ry = Math.abs(y - sc);
    if (Math.max(outZ(z, rz - GROOVE.w * s, rz + GROOVE.w * s), outZ(ry, sh - 0.004, sh + GROOVE.d * s)) < 0.004 - d) {
      const g = Math.min(rboxAt(x, y, z, xl - 0.2, sy1 - 0.004, rz - GROOVE.w * s, xr + 0.2, sy1 + GROOVE.d * s, rz + GROOVE.w * s, 0.003),
        rboxAt(x, y, z, xl - 0.2, sy0 - GROOVE.d * s, rz - GROOVE.w * s, xr + 0.2, sy0 + 0.004, rz + GROOVE.w * s, 0.003));
      d = ssub(d, g, 0.004);
    }
    return d;
  };
}

// which finish each part of the forging gets: machined steel in the slot and the arm's slot, the chamber's way dark, the
// rest painted (the loading opening too, as on the Fort Sill gun). Each boundary lies on a flat face, where the mesh's
// triangles stand in rows, so it runs straight.
function ringMat(D) {
  const { xr, zs0, zs1, sh, sc, crank, seat, zr, s, bx0 } = D;
  return (x, y, z) => {
    if (z < zs0 + 0.006 && x * x + y * y < (seat + 0.012) ** 2) return 'dark';
    // (machined only where the block runs: the window's walls in front of the shut block's end are painted)
    if (z > zs0 - 0.004 && z < zs1 + 0.004 && Math.abs(y - sc) < sh + 0.004 && x > bx0 - 0.006 && x < xr - 0.02) return 'steel';
    if (x > crank[0] - 0.05 * s && Math.abs(y - crank[1]) < 0.046 * s && z > zs1 - 0.004 && z < zr - 0.02) return 'steel';
    return 'camo';
  };
}

// A cradle's rear yoke (elevation frame): the arched strap round the barrel's collar, up into a saddle under the
// recoil cylinder, its legs bolted down the cradle's sides (Fort Sill rear; the rounded posts either side in the
// Bundesarchiv view).
function yokeField(c) {
  const { CR, CYL } = c.K, z0 = CR.z1 - 0.045, z1 = CR.z1 + 0.035, zc = (z0 + z1) / 2, hz = (z1 - z0) / 2, ri = 0.302, ro = 0.352;
  return (x, y, z) => {
    const bound = rboxAt(x, y, z, -0.42, CR.y0 - 0.05, z0 - 0.04, 0.42, CYL.y + 0.05, z1 + 0.04, 0);
    if (bound > 0.04) return bound;
    const r = Math.hypot(x, y);
    // the arch: an annulus over the top half, the legs straight down the sides to the cradle's bottom plate
    let d = extrude(y > 0 ? Math.max(r - ro, ri - r) : Math.max(Math.abs(Math.abs(x) - (ri + ro) / 2) - (ro - ri) / 2, -y - (-CR.y0 - 0.01)), z - zc, hz, 0.012);
    // the bolting flanges on the legs and the saddle into the cylinder's underside
    const fl = Math.max(rboxAt(x, y, z, -ro - 0.025, CR.y0 + 0.02, z0 - 0.008, ro + 0.025, -0.02, z1 + 0.008, 0.01), ri - Math.abs(x));
    d = smin(d, fl, 0.03);
    d = smin(d, rboxAt(x, y, z, -0.13, ro - 0.04, z0, 0.13, CYL.y - 0.05, z1, 0.015), 0.05);
    d = ssub(d, cylA(x, y, z, 'z', 0, CYL.y, CYL.r + 0.003, z0 - 0.1, z1 + 0.1, 0), 0.02);
    return ssub(d, cylA(x, y, z, 'z', 0, 0, ri, z0 - 0.1, z1 + 0.1, 0), 0.006);
  };
}

// a box with every edge rounded by r (analytic: flat faces, the fillets sampled seg times a quarter), centred
function roundBoxGeo(w, h, d, r, seg = 4) {
  const hx = w / 2, hy = h / 2, hz = d / 2, P = [], N = [], I = [];
  const coords = (hm) => { // along one axis: the fillet's samples, the flat run, the far fillet's
    const c = [-hm];
    for (let i = seg - 1; i >= 1; i--) c.push(-hm + r - r * Math.tan((Math.PI / 4) * (i / seg)));
    c.push(-hm + r, hm - r);
    for (let i = 1; i < seg; i++) c.push(hm - r + r * Math.tan((Math.PI / 4) * (i / seg)));
    c.push(hm);
    return c;
  };
  const C = { x: coords(hx), y: coords(hy), z: coords(hz) }, Hh = { x: hx, y: hy, z: hz };
  const face = (ax, sgn, u, v) => { // ax: the face's normal axis; u, v: the other two (u x v = normal * sgn)
    const base = P.length / 3, cu = C[u], cv = C[v];
    for (const b of cv) for (const a of cu) {
      const p = { [ax]: sgn * Hh[ax], [u]: a, [v]: b };
      const q = { x: clamp(p.x, -hx + r, hx - r), y: clamp(p.y, -hy + r, hy - r), z: clamp(p.z, -hz + r, hz - r) };
      let nx = p.x - q.x, ny = p.y - q.y, nz = p.z - q.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      P.push(q.x + nx * r, q.y + ny * r, q.z + nz * r);
      N.push(nx, ny, nz);
    }
    const nu = cu.length;
    for (let j = 0; j < cv.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = base + j * nu + i, b = a + 1, c2 = a + nu, d2 = c2 + 1;
      if (sgn > 0) I.push(a, b, d2, a, d2, c2); else I.push(a, d2, b, a, c2, d2);
    }
  };
  face('x', 1, 'y', 'z'); face('x', -1, 'y', 'z'); face('y', 1, 'z', 'x'); face('y', -1, 'z', 'x'); face('z', 1, 'x', 'y'); face('z', -1, 'x', 'y');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

function breechHD(c, G, knob) {
  const { CYL, BR } = c.K, { rw, rh, rl, fw, ring0, ch } = c, parts = {};
  // (sdf: the part is a surface-nets forging, { key: per-vertex occlusion baked into its colour }, for the max-quality
  // materials, which bring their own occlusion and read its curvature smoothly; tint: machined steel's brightness there)
  const add = (at, tier, fill, lod = 0, mq = null) => (parts[at] ??= []).push([tier, fill, lod, mq]);
  const D = breechDims(c), { s, xl, xr, hh, yt, zs0, zs1, sh, sc, crank, seat, cy, lz0, lz1, bx0 } = D;
  const H8 = 0.009 * s; // the forging's cell: fillets of 2 to 8 cm hold their shape (about 80k triangles, 0.3 s)
  // the forging twice: fine for detail 2 (the gun within 15 m), coarse for detail 1 (17 to 45 m), where a 2 cm cell
  // is under a pixel and the fine mesh's triangles would only cost; the faces kept closed (the clip check's solids)
  // (meshed here, once per kind: the spec that holds the result is cached by kind, and HDParts copies the arrays)
  const field = ringField(D), mat = ringMat(D);
  const ringAt = (H) => {
    const r = meshSDF(field, [xl - 0.12, -hh - 0.05, ring0 - 0.04, xr + 0.08, cy + 0.12 * s, BR + 0.07], H, { mat, relax: 1, ao: { k: 0.55 } });
    return Object.fromEntries(Object.entries(r.geos).map(([k, g]) => [k, splitUV(g, r.occ[k])]));
  };
  const ring = ringAt(H8), ringLo = ringAt(0.024 * s);
  const forging = (R) => [(H) => { for (const [key, { geo, occ }] of Object.entries(R)) H.add(key, geo, { uv: 'keep', shade: occShade(occ) }); },
    { sdf: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.occ])), tint: { steel: MACHINED } }];
  const chamberShade = (x, y, z) => { const d = Math.max(0, ring0 + fw - z); return 0.08 + 0.92 * Math.pow(1 - Math.min(1, d / 0.45), 2); };
  { const [f, mq] = forging(ring); add('recoil', 'hd', f, 2, mq); }
  { const [f, mq] = forging(ringLo); add('recoil', 'hd', f, 1, mq); }
  add('recoil', 'hd', (H) => {
    // the machined face round the chamber's mouth (bare steel, a hair proud)
    H.add('steel', annulus(zs0, zs0 + 0.0008, seat, seat + 0.034, { seg: 64, ch: 0.0002 }));
    // the piston rod from the cylinder to the lug, its turned cap on the lug's back
    H.add('steel', cyl(CYL.z1 - G.recoil - 0.15, lz0 + 0.02, 0.045, 0.045, { seg: 48, axis: 'z', c: [0, cy] }));
    H.add('camo', lathe([[lz1 - 0.002, 0], [lz1 - 0.002, 0.066], [lz1 + 0.03, 0.066], [lz1 + 0.04, 0.06], [lz1 + 0.046, 0.045], [lz1 + 0.049, 0.02], [lz1 + 0.05, 0]], { seg: 48, axis: 'z', c: [0, cy], fillet: 0.004 }), { uv: 'keep' });
    // the chamber: seat, chamber, forcing cone, then the smooth bore going dark (listed backwards: it faces in)
    H.add('dark', lathe([[zs0, seat], [zs0 - 0.015, seat], [zs0 - 0.015, ch], [zs0 - 0.28, ch]], { seg: 72, crease: 30 }), { uv: 'keep', shade: chamberShade });
    H.add('char', lathe([[zs0 - 0.28, ch], [ring0 - 0.75, ch], [ring0 - 0.9, G.bore], [ring0 - 1.4, G.bore]], { seg: 72, crease: 30 }), { uv: 'keep', shade: chamberShade });
    H.add('char', cyl(ring0 - 1.41, ring0 - 1.4, G.bore + 0.002, G.bore + 0.002, { seg: 32 }));
    // the firing lever's bracket on the ring's right top, with the pin's boss
    H.add('dark', chamferBox(0.05, 0.05, 0.16, 0.006, xr + 0.02, rh * 0.4, BR - 0.12));
    H.add('dark', cyl(xr + 0.03, xr + 0.05, 0.02, 0.02, { seg: 24, axis: 'x', c: [rh * 0.4, BR - 0.05], ch: 0.003 }));
    // the latch on the lug's right: a pivot boss and a curved arm down to a catch on the plinth
    const lx = 0.07 * s, ly = cy - 0.03 * s, lzm = (lz0 + lz1) / 2;
    H.add('dark', cyl(lx, lx + 0.022, 0.022, 0.022, { seg: 24, axis: 'x', c: [ly, lzm + 0.04 * s], ch: 0.003 }));
    const arm = [V(lx + 0.012, ly, lzm + 0.04 * s), V(lx + 0.016, ly - 0.03 * s, lzm + 0.005), V(lx + 0.016, ly - 0.05 * s, lzm - 0.04 * s), V(lx + 0.012, yt + 0.05 * s, lzm - 0.075 * s)];
    for (let i = 0; i < 3; i++) H.add('dark', bar(arm[i], arm[i + 1], 0.016, 0.011, 0.003));
    H.add('dark', chamferBox(0.03, 0.03, 0.04, 0.004, lx + 0.012, yt + 0.042 * s, lzm - 0.08 * s));
  });
  add('recoil', 'micro', (H) => {
    // the plinth's studs, a plain plate on the right face
    H.add('steel', boltsHD([V(-0.15 * s, yt + 0.028 * s, zs0 + 0.12), V(0.15 * s, yt + 0.028 * s, zs0 + 0.12), V(-0.15 * s, yt + 0.028 * s, BR - 0.1), V(0.15 * s, yt + 0.028 * s, BR - 0.1)], V(0, 1, 0), { af: 0.028, h: 0.015, stud: 0.006 }));
    H.add('steel', dataPlate(0.11, 0.065).rotateY(Math.PI / 2).translate(xr + 0.0005, 0.08 * s, BR - 0.13 * s));
  });

  // the block (breech pivot frame: x offset by the pivot, which stands at rw * 0.11; its rear face at bz)
  const px = rw * 0.11, pz = ring0 + fw + (rl - fw) / 2, bz = zs1 - 0.002 - pz, fz = zs0 + 0.002 - pz;
  const b0 = bx0 - px, b1 = xr - px, bw = b1 - b0, bh = 2 * (sh - 0.002), bd = bz - fz, bc = (b0 + b1) / 2, ax = -px;
  const kz = (bz + fz) / 2, rib = zs0 + (zs1 - zs0) * 0.42 - pz;
  add('breech', 'hd', (H) => {
    H.add('steel', roundBoxGeo(bw, bh, bd, 0.012 * s, 4).translate(bc, sc, kz));
    // the arm through the rear wall to the crank's boss
    const cx = crank[0] - px, cy2 = crank[1];
    H.add('steel', roundBoxGeo(0.07 * s, 0.062 * s, BR + 0.004 - pz - bz + 0.01, 0.01 * s, 3).translate(cx, cy2, (bz - 0.01 + BR + 0.004 - pz) / 2));
    const az = BR + 0.004 - pz; // the arm's rear face (gearDefs puts the crank's hub 8 mm behind it)
    H.add('dark', lathe([[az, 0], [az, 0.036], [az + 0.004, 0.038], [az + 0.012, 0.038], [az + 0.014, 0.034], [az + 0.014, 0]], { seg: 32, axis: 'z', c: [cx, cy2] }), { uv: 'keep' });
    // the firing mechanism behind the opening, on the bore: its housing flush in the block's rear face with the bayonet
    // ring, the firing pin's cap and the cocking indicator; the extractor's lever beside it
    H.add('dark', annulus(bz - 0.002, bz + 0.0015, 0.05 * s, 0.062 * s, { seg: 48, axis: 'z', c: [ax, 0], ch: 0.0006 }));
    H.add('steel', lathe([[bz, 0], [bz, 0.046 * s], [bz + 0.003, 0.046 * s], [bz + 0.006, 0.042 * s], [bz + 0.006, 0]], { seg: 40, axis: 'z', c: [ax, 0], crease: 40 }), { uv: 'keep' });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; H.add('steel', chamferBox(0.012, 0.01, 0.008, 0.002, ax + Math.cos(a) * 0.052 * s, Math.sin(a) * 0.052 * s, bz + 0.003, 0, 0, a)); }
    H.add('dark', cyl(bz + 0.005, bz + 0.012, 0.011, 0.009, { seg: 20, axis: 'z', c: [ax, 0], ch: 0.002 }));
    H.add('brass', cyl(bz + 0.004, bz + 0.009, 0.0045, 0.0045, { seg: 12, axis: 'z', c: [ax + 0.024 * s, 0.024 * s], ch: 0.001 }));
    H.add('dark', chamferBox(0.016, 0.1 * s, 0.006, 0.002, ax - 0.1 * s, -0.01, bz + 0.002));
    // the block's left end, shown in the slot's window: its cover plate over the whole end, painted as the ring (Fort
    // Sill), two cap screws in it
    H.add('camo', chamferBox(0.006, bh - 0.008, bd - 0.008, 0.003, b0 - 0.002, sc, kz));
  }, 0, { tint: { steel: MACHINED } });
  // the guide ribs on its top and bottom faces, running in the ring's grooves (GROOVE: 2 to 3 mm clear all round); only
  // with the fine forging (detail 2), whose 9 mm cells hold the grooves (the coarse one's 24 mm cells fill them in)
  add('breech', 'hd', (H) => {
    const rh2 = GROOVE.d * s - 0.001, rw2 = 2 * (GROOVE.w * s - 0.003);
    for (const sy of [-1, 1]) H.add('steel', chamferBox(bw - 0.01, rh2 + 0.002, rw2, 0.0025, bc, sc + sy * (bh / 2 + rh2 / 2 - 0.001), rib));
  }, 2, { tint: { steel: MACHINED } });
  add('breech', 'micro', (H) => {
    H.add('steel', boltsHD([V(b0 - 0.005, sc + 0.09 * s, kz), V(b0 - 0.005, sc - 0.09 * s, kz)], V(-1, 0, 0), { af: 0.026, h: 0.012, stud: 0.006 }));
  });
  // the crank (its frame: local X back along the bore, Y up, Z to the gun's left): hub, a flat arm with rounded ends hanging
  // down at rest, a turned revolving handle on a pin at its end
  add('crank', 'hd', (H) => {
    const L = 0.13, w = 0.02;
    H.add('dark', lathe([[-0.012, 0], [-0.012, 0.028], [0.018, 0.028], [0.022, 0.024], [0.022, 0]], { seg: 32, axis: 'x', crease: 40 }), { uv: 'keep' });
    H.add('dark', prism(6, 0.017, 0.012, 0.003).rotateZ(-Math.PI / 2).translate(0.034, 0, 0));
    const st = [...arcPts(0, 0, w, 0, Math.PI, 8), ...arcPts(0, -L, w * 0.8, Math.PI, 2 * Math.PI, 8)];
    H.add('steel', bevelPlate(st, 0.014, { bevel: 0.003, axis: 'x', curveSegments: 1 }).translate(0.029, 0, 0));
    H.add('dark', lathe([[0.036, 0], [0.036, 0.007], [0.042, 0.007], [0.044, 0.014], [0.07, 0.017], [0.11, 0.0165], [0.126, 0.013], [0.13, 0]], { seg: 24, axis: 'x', c: [-L, 0], fillet: 0.003 }), { uv: 'keep' });
  });
  knob.crank = [0.085, -0.13, 0];
  // the firing lever (lever pivot on the ring's right top, turning about X): a forged arm leaning back over the ring, the
  // lanyard ring hanging from its eye
  add('lever', 'hd', (H) => {
    const tip = V(0.028, 0.075, 0.118);
    H.add('dark', cyl(0.02, 0.04, 0.017, 0.017, { seg: 24, axis: 'x', ch: 0.003 }));
    H.add('dark', bar(V(0.028, 0, 0), tip, 0.012, 0.022, 0.003));
    H.add('dark', cyl(0.02, 0.036, 0.014, 0.014, { seg: 20, axis: 'x', c: [tip.y, tip.z], ch: 0.002 }));
    H.add('steel', keepTorus(0.016, 0.0038, 8, 32).rotateY(Math.PI / 2).translate(0.028, tip.y - 0.024, tip.z + 0.004));
  });
  knob.lever = [0.028, 0.075 - 0.024, 0.122];

  // the cradle's rear yoke (elevation frame), meshed like the ring
  const { CR } = c.K;
  const yk = meshSDF(yokeField(c), [-0.44, CR.y0 - 0.06, CR.z1 - 0.1, 0.44, CYL.y + 0.06, CR.z1 + 0.09], 0.01, { relax: 1, ao: { k: 0.6 } });
  const yoke = Object.fromEntries(Object.entries(yk.geos).map(([k, g]) => [k, splitUV(g, yk.occ[k])]));
  add('elevation', 'hd', (H) => { for (const [key, { geo, occ }] of Object.entries(yoke)) H.add(key, geo, { uv: 'keep', shade: occShade(occ) }); }, 0,
    { sdf: Object.fromEntries(Object.entries(yoke).map(([k, v]) => [k, v.occ])) });
  add('elevation', 'micro', (H) => {
    const pts = [], nrm = [];
    for (const sx of [-1, 1]) for (const y of [-0.06, -0.15, -0.24]) { pts.push(V(sx * 0.378, y, CR.z1 - 0.005)); nrm.push(V(sx, 0, 0)); }
    H.add('steel', boltsHD(pts, nrm, { af: 0.026, h: 0.014, stud: 0.007 }));
  });

  // the loading tray (loadTray pivot: hinged at the lip on the opening's seat): the trough's floor stays at the shell's
  // underside (fy), a 3 mm pressed U with flanged edges, the hook bent over the seat, ribs, two carrying handles
  const { tw, tl, fy, z0 } = c, z1 = z0 + tl;
  add('loadTray', 'hd', (H) => {
    const fw2 = tw - 0.035, r = 0.03, ang = 0.35, hs = 0.062, half = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2 - ang); half.push([fw2 - r + Math.cos(a) * r, fy - 0.0015 + r + Math.sin(a) * r]); }
    const top = [half[6][0] + Math.sin(ang) * hs, half[6][1] + Math.cos(ang) * hs];
    half.push(top, [top[0] + 0.02, top[1]]);
    const line = [...half.slice().reverse().map(([x, y]) => [-x, y]), ...half];
    const off = (d) => line.map((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; return [p[0] - (ty / l) * d, p[1] + (tx / l) * d]; });
    const shape = [...off(0.0015), ...off(-0.0015).reverse()];
    // (the trough starts behind the mouth's lip, which stands proud of the rear face; tray frame: the hinge at the
    // origin, 5 cm inside the face and below the opening's bore)
    const zt = z0 + 0.03, lt = z1 - zt;
    H.add('camo', bevelPlate(shape, lt, { bevel: 0.0012, axis: 'z', curveSegments: 1 }).translate(0, 0, zt + lt / 2));
    // the riser behind the lip's crown, and the hook: a tongue from its foot over the crown, down into the bell
    H.add('dark', chamferBox(tw * 2 - 0.04, fy - 0.008, 0.008, 0.0015, 0, (fy + 0.016) / 2, zt + 0.001));
    const ha = [0.04, zt - 0.001], hb = [0.054, 0.045], hl = Math.hypot(hb[0] - ha[0], hb[1] - ha[1]);
    H.add('dark', chamferBox(0.06, 0.007, hl, 0.002, 0, (ha[0] + hb[0]) / 2, (ha[1] + hb[1]) / 2, Math.atan2(hb[0] - ha[0], ha[1] - hb[1]), 0, 0));
    for (const z of [z0 + tl * 0.35, z1 - 0.06]) H.add('dark', chamferBox(tw * 2 - 0.06, 0.022, 0.035, 0.004, 0, fy - 0.014, z));
    for (const sx of [-1, 1]) {
      const pts = [V(sx * (tw + 0.005), fy + 0.008, z0 + tl * 0.3), V(sx * (tw + 0.08), fy - 0.03, z0 + tl * 0.33), V(sx * (tw + 0.08), fy - 0.03, z0 + tl * 0.67), V(sx * (tw + 0.005), fy + 0.008, z0 + tl * 0.7)];
      for (let i = 0; i < 3; i++) H.add('steel', cyl(0, pts[i].distanceTo(pts[i + 1]), 0.012, 0.012, { seg: 12, axis: 'y' }).applyMatrix4(along(pts[i], pts[i + 1])));
      for (const p of pts.slice(1, 3)) H.add('steel', lathe(Array.from({ length: 7 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / 6; return [Math.sin(a) * 0.012, Math.cos(a) * 0.012]; }), { seg: 12, axis: 'y' }).translate(p.x, p.y, p.z));
      for (const k of [0.3, 0.7]) H.add('steel', chamferBox(0.016, 0.03, 0.03, 0.003, sx * (tw + 0.004), fy + 0.012, z0 + tl * k)); // welded lugs
    }
  });
  return parts;
}

const arcPts = (cx, cy, r, a0, a1, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });

// a THREE torus with metric UVs (rings, eyes)
function keepTorus(R, r, rs, ts) {
  const g = new THREE.TorusGeometry(R, r, rs, ts), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * R, uv.getY(i) * TAU * r);
  return g;
}

// ---------------------------------------------------------------- item 5: the barrel and the rifled bore

// The barrel's outside as one filleted lathe (every step and shoulder rounded, 128 round, a 4 mm crown at the bore's
// edge), the band the guides are fixed to, and the bore seen from the muzzle: 56 grooves 2.5 mm deep with ramps, a turn in
// 25 calibres, over the first 1.2 m, then smooth, going dark (baked occlusion) from the face to 0.4 m in.
function barrelHD(c, G) {
  const { MZ, ring0, ch } = c, parts = {}, b = G.bore, rj = G.prof[G.prof.length - 1][1];
  const add = (at, tier, fill) => (parts[at] ??= []).push([tier, fill]);
  const muzzleShade = (x, y, z) => { const d = Math.max(0, z - MZ); return 0.08 + 0.92 * Math.pow(1 - Math.min(1, d / 0.42), 2); };
  add('recoil', 'hd', (H) => {
    const prof = [[MZ + 0.004, b], [MZ + 0.0012, b + 0.0012], [MZ, b + 0.004]];
    for (const [sAt, r] of G.prof) prof.push([MZ + sAt, r]);
    prof.push([ring0 + 0.01, rj], [ring0 + 0.01, ch]);
    H.add('camo', lathe(prof, { seg: 128, fillet: 0.005, fn: 3, crease: 50 }), { uv: 'keep' });
    H.add('camo', annulus(ring0 - 0.18, ring0 - 0.02, rj - 0.01, rj + 0.022, { seg: 128, ch: 0.004 }), { uv: 'keep' });
    // bare steel at the mouth, then the rough black of the char key (the vertex shade darkens only the diffuse, so a
    // metal key would still mirror the sky deep inside)
    H.add('dark', rifling(b, 0.0025, 56, MZ + 0.002, MZ + 0.12, 25 * 2 * b, 3, MZ + 0.002), { uv: 'keep', shade: muzzleShade });
    H.add('char', rifling(b, 0.0025, 56, MZ + 0.12, MZ + 1.2, 25 * 2 * b, 14, MZ + 0.002), { uv: 'keep', shade: muzzleShade });
    H.add('char', lathe([[MZ + 1.5, b], [MZ + 1.2, b]], { seg: 64 }), { uv: 'keep', shade: muzzleShade });
    H.add('char', cyl(MZ + 1.5, MZ + 1.51, b + 0.003, b + 0.003, { seg: 32 }));
  });
  return parts;
}

// A rifled bore along +z from z0 to z1 (faces in): n grooves `depth` deep, the grooves 60 % of the pitch with short
// ramps, turning once in `turn` metres; `rings` stations along it
function rifling(r, depth, n, z0, z1, turn, rings, zRef = z0) {
  const per = 6, M = n * per; // land, ramp, groove, groove, ramp, land
  const prof = [0, 0.04, 0.1, 0.5, 0.56, 0.6]; // fractions of the pitch where each point sits
  const rr = [0, 0, 1, 1, 0, 0]; // groove (1) or land (0)
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= rings; k++) {
    const z = z0 + ((z1 - z0) * k) / rings, tw = ((z - zRef) / turn) * TAU;
    for (let j = 0; j <= M; j++) {
      const g = Math.floor(j / per) % n, q = j % per, a0 = j === M ? TAU : ((g + prof[q]) / n) * TAU, R = r + depth * rr[q];
      pos.push(Math.cos(a0 + tw) * R, Math.sin(a0 + tw) * R, z);
      uv.push(a0 * r, z - zRef);
    }
  }
  const W = M + 1;
  for (let k = 0; k < rings; k++) for (let j = 0; j < M; j++) {
    const a = k * W + j, b2 = a + 1, c2 = a + W + 1, d = a + W;
    idx.push(a, c2, b2, a, d, c2);
  }
  const g = geo(pos, null, uv, idx);
  g.computeVertexNormals();
  // faces in: every triangle's normal toward the axis
  const p = g.attributes.position, ix = g.index.array, A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    A.fromBufferAttribute(p, ix[t]); B.fromBufferAttribute(p, ix[t + 1]); Cc.fromBufferAttribute(p, ix[t + 2]);
    const mx = (A.x + B.x + Cc.x) / 3, my = (A.y + B.y + Cc.y) / 3;
    B.sub(A); Cc.sub(A); B.cross(Cc);
    if (B.x * -mx + B.y * -my < 0) { const k2 = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k2; }
  }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- items 6 and 7: cradle, recoil cylinder, trunnions, equilibrators

// the convex hull of two circles in a plane (an arm's outline round its hub and its eye), n points a circle
function hull2([x1, y1], r1, [x2, y2], r2, n = 24) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([x1 + Math.cos(a) * r1, y1 + Math.sin(a) * r1], [x2 + Math.cos(a) * r2, y2 + Math.sin(a) * r2]); }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// The cradle sleeve with angle corners, two-row riveting, lifting eyes and brass guide liners; the turned guide collars
// with the front gland's nuts; the recoil cylinder (96 round) with its bolted front flange, the recuperator head's
// castellated crown, hex boss and filling valve, the clamp straps, the saddles, the oil line, the castellated rear gland
// and the guarded filler plug; the trunnions; the forged equilibrator arms with their clamps and pins; the forked lower
// brackets and the equilibrators themselves: a rigid case on each lower pin and a rigid tube on each arm's pin (placed by
// setElevation, see buildHD), domed, eyed and glanded, never stretched.
function cradleHD(c) {
  const { CR, CYL, EQ, TRY, TRZ } = c.K, { rAt, MZ } = c, parts = {};
  const add = (at, tier, fill) => (parts[at] ??= []).push([tier, fill]);
  const cl = CR.z1 - CR.z0, cz = (CR.z0 + CR.z1) / 2, hw = CR.hw;
  const jr = rAt(-MZ + CR.z0) + 0.006, jr2 = rAt(-MZ + CR.z1) + 0.006;
  add('elevation', 'hd', (H) => {
    // the sleeve: plates and corner angles
    H.add('camo', chamferBox(hw * 2, 0.06, cl, 0.006, 0, CR.y0 + 0.03, cz));
    H.add('camo', chamferBox(hw * 2, 0.06, cl, 0.006, 0, CR.y1 - 0.03, cz));
    for (const s of [-1, 1]) {
      H.add('camo', chamferBox(0.06, CR.y1 - CR.y0, cl, 0.006, s * (hw - 0.03), (CR.y0 + CR.y1) / 2, cz));
      for (const [y, t] of [[CR.y1, -1], [CR.y0, 1]]) {
        H.add('camo', chamferBox(0.007, 0.05, cl - 0.01, 0.002, s * (hw + 0.0035), y + t * 0.025, cz));
        H.add('camo', chamferBox(0.05, 0.007, cl - 0.01, 0.002, s * (hw + 0.025), y + t * 0.0035, cz));
      }
    }
    // brass liners at both mouths, the turned guide collars, the front gland
    H.add('brass', annulus(CR.z0 - 0.146, CR.z0 - 0.13, jr - 0.0045, jr + 0.003, { seg: 96, ch: 0.001 }), { uv: 'keep' });
    H.add('brass', annulus(CR.z1 + 0.03, CR.z1 + 0.046, jr2 - 0.0045, jr2 + 0.003, { seg: 96, ch: 0.001 }), { uv: 'keep' });
    H.add('camo', annulus(CR.z0 - 0.14, CR.z0 + 0.02, jr, 0.31, { seg: 96, ch: 0.008 }), { uv: 'keep' });
    H.add('camo', annulus(CR.z0 - 0.165, CR.z0 - 0.138, jr + 0.002, jr + 0.065, { seg: 96, ch: 0.003 }), { uv: 'keep' });
    H.add('camo', annulus(CR.z1 - 0.04, CR.z1 + 0.04, jr2, 0.3, { seg: 96, ch: 0.008 }), { uv: 'keep' });
    // the recoil cylinder on its saddles
    // (the cylinder runs on back over the breech ring's front to its bolted rear cap, as on the Fort Sill gun and in the
    // K 18 drill photo: the piston rod shows only between the cap's gland and the lug on the ring)
    const y = CYL.y, r = CYL.r, z0 = CYL.z0, z1 = cylEnd(c), cc = [0, y];
    H.add('camo', lathe([[z0, 0], [z0, r], [z1 - 0.045, r], [z1 - 0.045, 0]], { seg: 96, axis: 'z', c: cc }), { uv: 'keep' });
    // the rear cap: a flange bolted to the cylinder's own, a dished cover, the gland's boss with its castellated nut
    H.add('camo', lathe([[z1 - 0.09, r - 0.01], [z1 - 0.09, r + 0.004], [z1 - 0.07, r + 0.004], [z1 - 0.062, r + 0.026], [z1 - 0.048, r + 0.026], [z1 - 0.045, r + 0.022], [z1 - 0.045, r - 0.01]], { seg: 96, axis: 'z', c: cc, fillet: 0.003 }), { uv: 'keep' });
    H.add('camo', lathe([[z1 - 0.045, 0], [z1 - 0.045, r + 0.022], [z1 - 0.042, r + 0.026], [z1 - 0.012, r + 0.026], [z1 - 0.008, r + 0.018], [z1 + 0.012, r - 0.02], [z1 + 0.026, 0.085], [z1 + 0.03, 0.075], [z1 + 0.03, 0]], { seg: 96, axis: 'z', c: cc, fillet: 0.004 }), { uv: 'keep' });
    H.add('camo', lathe([[z1 + 0.03, 0], [z1 + 0.03, 0.068], [z1 + 0.062, 0.066], [z1 + 0.066, 0.06], [z1 + 0.066, 0]], { seg: 64, axis: 'z', c: cc, fillet: 0.003 }), { uv: 'keep' });
    H.add('dark', castellated(0.048, 0.064, 0.04, 8, 0.012, { seg: 64, axis: 'z', c: cc, a0: z1 + 0.066 }));
    // the filling valve on the cap's upper quarter, its nozzle pointing back
    H.add('camo', lathe([[z1 - 0.005, 0], [z1 - 0.005, 0.026], [z1 + 0.03, 0.024], [z1 + 0.034, 0.018], [z1 + 0.06, 0.016], [z1 + 0.064, 0.012], [z1 + 0.064, 0]], { seg: 32, axis: 'z', c: [0.07, y + 0.095], fillet: 0.002 }), { uv: 'keep' });
    H.add('dark', prism(6, 0.016, 0.012, 0.002).rotateX(-Math.PI / 2).translate(0.07, y + 0.095, z1 + 0.028));
    for (const z of [-0.95, -0.1, 0.75]) {
      H.add('camo', chamferBox(0.26, y - r - CR.y1 + 0.04, 0.16, 0.01, 0, (CR.y1 + y - r) / 2, z));
      H.add('camo', annulus(z - 0.05, z + 0.05, r - 0.002, r + 0.014, { seg: 96, axis: 'z', c: cc, ch: 0.003 }), { uv: 'keep' });
      for (const k of [-1, 1]) H.add('camo', chamferBox(0.035, 0.04, 0.026, 0.004, r + 0.024, y + 0.012 * k + 0.0, z + k * 0.0, 0, 0, 0).translate(0, 0, 0));
    }
    H.add('camo', lathe([[z0 - 0.05, r - 0.03], [z0 - 0.05, r + 0.026], [z0 - 0.045, r + 0.031], [z0 + 0.025, r + 0.031], [z0 + 0.03, r + 0.026], [z0 + 0.03, r]], { seg: 96, axis: 'z', c: cc }), { uv: 'keep' });
    H.add('camo', lathe([[z0 - 0.3, 0.085], [z0 - 0.3, 0.12], [z0 - 0.05, 0.12], [z0 - 0.05, r - 0.03]], { seg: 96, axis: 'z', c: cc, fillet: 0.006 }), { uv: 'keep' });
    H.add('dark', castellated(0.085, 0.12, 0.06, 16, 0.016, { seg: 96 }).rotateY(Math.PI).translate(0, y, z0 - 0.3));
    H.add('camo', cyl(z0 - 0.31, z0 - 0.3, 0.086, 0.086, { seg: 64, axis: 'z', c: cc }));
    H.add('dark', prism(6, 0.0404, 0.06, 0.006).rotateX(-Math.PI / 2).translate(0, y, z0 - 0.3));
    H.add('dark', prism(6, 0.012, 0.025, 0.003).rotateX(-Math.PI / 2).translate(0.058, y + 0.04, z0 - 0.3));
    H.add('steel', cyl(z0 - 0.338, z0 - 0.325, 0.009, 0.009, { seg: 12, axis: 'z', c: [0.058, y + 0.04], ch: 0.002 }));
    H.add('dark', prism(6, 0.026, 0.035, 0.004).translate(0, y + r - 0.006, -0.6));
    H.add('camo', bar(V(-0.045, y + r - 0.01, -0.62), V(-0.045, y + r + 0.045, -0.6), 0.012, 0.02, 0.002));
    H.add('camo', bar(V(0.045, y + r - 0.01, -0.62), V(0.045, y + r + 0.045, -0.6), 0.012, 0.02, 0.002));
    H.add('camo', chamferBox(0.11, 0.012, 0.03, 0.002, 0, y + r + 0.048, -0.6));
    H.add('steel', cableHD([V(-0.1, y + 0.03, z0 - 0.2), V(-0.155, y, z0 - 0.02), V(-0.162, y - 0.05, -0.5), V(-0.162, y - 0.08, 0.35), V(-0.13, CR.y1 + 0.05, 0.68)], 0.005, { clip: 0.3 }));
    // the trunnions; the forged arms clamped on their ends, with the eyes for the equilibrators' pins
    for (const s of [-1, 1]) {
      H.add('steel', cyl(s * hw, s * 0.69, 0.11, 0.11, { seg: 64, axis: 'x' }));
      H.add('camo', bevelPlate(hull2([0, 0], 0.12, [EQ.up[1], EQ.up[0]], 0.062, 20), 0.09, { bevel: 0.008, axis: 'x', curveSegments: 1 }).translate(s * 0.7, 0, 0));
      H.add('camo', lathe(side(s, [[0.665, 0], [0.665, 0.12], [0.672, 0.127], [0.798, 0.127], [0.805, 0.12], [0.805, 0]]), { seg: 64, axis: 'x' }), { uv: 'keep' });
      H.add('dark', chamferBox(0.142, 0.004, 0.03, 0.001, s * 0.735, 0.1255, 0.0));
      H.add('camo', lathe(side(s, [[0.662, 0], [0.662, 0.064], [0.668, 0.07], [0.722, 0.07], [0.728, 0.064], [0.728, 0]]), { seg: 48, axis: 'x', c: [EQ.up[0], EQ.up[1]] }), { uv: 'keep' });
      H.add('steel', lathe(side(s, [[0.645, 0], [0.645, 0.044], [0.652, 0.048], [0.665, 0.048], [0.665, 0.034], [0.84, 0.034], [0.845, 0.03], [0.845, 0]]), { seg: 32, axis: 'x', c: [EQ.up[0], EQ.up[1]] }), { uv: 'keep' });
    }
  });
  add('elevation', 'micro', (H) => {
    const pts = [], nrm = [];
    for (const s of [-1, 1]) {
      const N = V(s, 0, 0);
      for (const yy of [0.12, -0.18]) for (const p of rowPts(V(s * (hw + 0.001), yy, CR.z0 + 0.08), V(s * (hw + 0.001), yy, CR.z1 - 0.08), 0.075)) { pts.push(p); nrm.push(N); }
      for (const yy of [CR.y1 - 0.03, CR.y0 + 0.03]) for (const p of rowPts(V(s * (hw + 0.007), yy, CR.z0 + 0.05), V(s * (hw + 0.007), yy, CR.z1 - 0.05), 0.075)) { pts.push(p); nrm.push(N); }
    }
    H.add('camo', rivetsHD(pts, nrm, 0.012));
    H.add('steel', boltsHD(Array.from({ length: 12 }, (_, i) => V(Math.cos(((i + 0.5) * TAU) / 12) * 0.165, CYL.y + Math.sin(((i + 0.5) * TAU) / 12) * 0.165, CYL.z0 - 0.05)), V(0, 0, -1), { af: 0.022, h: 0.012, stud: 0.006 }));
    // the rear cap's flange bolts (heads forward of the flange, the nuts behind it)
    const ze = cylEnd(c);
    H.add('steel', boltsHD(Array.from({ length: 12 }, (_, i) => V(Math.cos(((i + 0.5) * TAU) / 12) * (CYL.r + 0.017), CYL.y + Math.sin(((i + 0.5) * TAU) / 12) * (CYL.r + 0.017), ze - 0.09)), V(0, 0, -1), { af: 0.02, h: 0.011, stud: 0.005 }));
    H.add('steel', boltsHD(Array.from({ length: 12 }, (_, i) => V(Math.cos(((i + 0.5) * TAU) / 12) * (CYL.r + 0.017), CYL.y + Math.sin(((i + 0.5) * TAU) / 12) * (CYL.r + 0.017), ze - 0.045)), V(0, 0, 1), { af: 0.02, h: 0.011, stud: 0.005 }));
    H.add('steel', boltsHD(Array.from({ length: 8 }, (_, i) => V(Math.cos(((i + 0.5) * TAU) / 8) * (jr + 0.038), Math.sin(((i + 0.5) * TAU) / 8) * (jr + 0.038), CR.z0 - 0.165)), V(0, 0, -1), { af: 0.019, h: 0.01, stud: 0.005 }));
    for (const z of [-0.95, -0.1, 0.75]) H.add('steel', cyl(CYL.y - 0.035, CYL.y + 0.06, 0.007, 0.007, { seg: 10, axis: 'y', c: [CYL.r + 0.024, z], ch: 0.002 }));
    H.add('steel', instances(liftEye(), [onSurface(V(0.24, CR.y1, -0.62), V(0, 1, 0)), onSurface(V(-0.24, CR.y1, 0.42), V(0, 1, 0))]));
    for (const s of [-1, 1]) H.add('steel', boltsHD([V(s * 0.805, 0.08, 0.0), V(s * 0.805, -0.08, 0.0)], V(s, 0, 0), { af: 0.022, h: 0.012 }));
  });
  // the forked lower brackets on the top carriage, their pins
  add('carriage', 'hd', (H) => {
    for (const s of [-1, 1]) {
      const [y, z] = EQ.lo, x = s * EQ.x;
      H.add('camo', chamferBox(0.28, 0.05, 0.22, 0.006, x - s * 0.02, y - 0.1, z));
      for (const k of [-1, 1]) H.add('camo', bevelPlate(hull2([z, y], 0.07, [z, y - 0.08], 0.1, 16), 0.024, { bevel: 0.004, axis: 'x', curveSegments: 1 }).translate(x + k * 0.077, 0, 0));
      H.add('steel', lathe(side(s, [[0.6, 0], [0.6, 0.042], [0.607, 0.046], [0.62, 0.046], [0.62, 0.03], [0.9, 0.03], [0.905, 0.026], [0.905, 0]]), { seg: 32, axis: 'x', c: [y, z] }), { uv: 'keep' });
    }
  });
  // the equilibrators: the case from its lower eye (+Y toward the arm), the tube from its upper eye (+Y toward the case)
  for (const nm of ['eqCaseL', 'eqCaseR']) add(nm, 'hd', (H) => {
    H.add('camo', cyl(-0.048, 0.048, 0.052, 0.052, { seg: 32, axis: 'x', ch: 0.004 }));
    H.add('camo', cyl(0.03, 0.08, 0.038, 0.038, { seg: 32, axis: 'y' }));
    H.add('camo', lathe([[0.06, 0], [0.068, 0.05], [0.085, 0.09], [0.115, 0.118], [0.13, 0.121], [1.19, 0.121], [1.19, 0.127], [1.25, 0.127], [1.25, 0.094], [1.1, 0.094]], { seg: 64, axis: 'y', fillet: 0.004 }), { uv: 'keep' });
    H.add('dark', castellated(0.094, 0.128, 0.035, 12, 0.01, { seg: 72, axis: 'y', a0: 1.25 }));
  });
  for (const nm of ['eqTubeL', 'eqTubeR']) add(nm, 'hd', (H) => {
    H.add('camo', cyl(-0.029, 0.029, 0.048, 0.048, { seg: 32, axis: 'x', ch: 0.004 }));
    H.add('camo', cyl(0.03, 0.075, 0.03, 0.03, { seg: 32, axis: 'y' }));
    H.add('camo', lathe([[0.06, 0], [0.066, 0.045], [0.08, 0.08], [0.1, 0.0895], [0.78, 0.0895], [0.78, 0]], { seg: 64, axis: 'y', fillet: 0.004 }), { uv: 'keep' });
  });
  return parts;
}
const liftEye = () => liftingEyeProto(0.028, 0.008);
// where the HD recoil cylinder's rear cap stands (the cylinder's end before its gland): just ahead of the breech ring
const cylEnd = (c) => c.ring0 - 0.085;

// ---------------------------------------------------------------- item 8: wheels, tyres, mudguards, brakes

// a flat end cap for a part-turn lathe (a mudguard's cut end): the profile [a, r] as a polygon at angle phi, facing s
function latheCap(prof, axis, c, phi, s) {
  const sh = new THREE.Shape(prof.map(([a, r]) => new THREE.Vector2(a, r))), g = new THREE.ShapeGeometry(sh), p = g.attributes.position;
  const A = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1], U = axis === 'x' ? [0, 0, 1] : [1, 0, 0], W = axis === 'y' ? [0, 0, 1] : [0, 1, 0];
  const C = axis === 'x' ? [0, c[0], c[1]] : axis === 'y' ? [c[0], 0, c[1]] : [c[0], c[1], 0];
  const co = Math.cos(phi), si = Math.sin(phi), R = [0, 1, 2].map((k) => U[k] * co + W[k] * si), T = [0, 1, 2].map((k) => (-U[k] * si + W[k] * co) * s);
  for (let i = 0; i < p.count; i++) { const a = p.getX(i), r = p.getY(i); p.setXYZ(i, C[0] + A[0] * a + R[0] * r, C[1] + A[1] * a + R[1] * r, C[2] + A[2] * a + R[2] * r); }
  const ix = g.index.array, P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    P0.fromBufferAttribute(p, ix[t]); P1.fromBufferAttribute(p, ix[t + 1]); P2.fromBufferAttribute(p, ix[t + 2]);
    P1.sub(P0); P2.sub(P0); P1.cross(P2);
    if (P1.x * T[0] + P1.y * T[1] + P1.z * T[2] < 0) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
  }
  g.computeVertexNormals();
  return g;
}

function wheelsHD(c) {
  const { AX } = c.K, parts = {}, R = AX.R, tw = AX.tw, Rr = R - 0.13;
  const add = (at, tier, fill) => (parts[at] ??= []).push([tier, fill]);
  const arcPts = (ca, cr, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / n; return [ca + Math.cos(t) * r, cr + Math.sin(t) * r]; });
  // the tyre's profile (a across the tread, r out): sidewall with a moulded ring, rounded shoulder, five ribs, and back
  const tyre = [];
  {
    const h = tw / 2, sh = 0.04;
    tyre.push([-h + 0.004, Rr], [-h, Rr + 0.006], [-h, Rr + 0.05], [-h - 0.004, Rr + 0.055], [-h - 0.004, Rr + 0.064], [-h, Rr + 0.069], [-h, R - sh]);
    tyre.push(...arcPts(-h + sh, R - sh, sh, Math.PI, Math.PI / 2, 5).slice(1));
    for (let i = 1; i < 5; i++) { const g = -h + 0.035 + ((tw - 0.07) * i) / 5; tyre.push([g - 0.009, R], [g - 0.005, R - 0.012], [g + 0.005, R - 0.012], [g + 0.009, R]); }
    tyre.push(...arcPts(h - sh, R - sh, sh, Math.PI / 2, 0, 5));
    tyre.push([h, Rr + 0.069], [h + 0.004, Rr + 0.064], [h + 0.004, Rr + 0.055], [h, Rr + 0.05], [h, Rr + 0.006], [h - 0.004, Rr]);
  }
  for (const s of [-1, 1]) {
    const x = s * AX.x, y = AX.y, z = AX.z, cc = [y, z], r0 = R + 0.08;
    add('traverse', 'hd', (H) => {
      H.add('tyre', lathe(tyre.map(([a, r]) => [x + a, r]), { seg: 160, axis: 'x', c: cc, crease: 50 }), { uv: 'keep' });
      // the steel base band with a lip each side, the dished disc with its six pressed holes, the hub
      H.add('camo', annulus(x - tw / 2 - 0.006, x + tw / 2 + 0.006, Rr - 0.06, Rr + 0.008, { seg: 128, axis: 'x', c: cc, ch: 0.004 }), { uv: 'keep' });
      const disc = Array.from({ length: 96 }, (_, i) => { const a = (i / 96) * TAU; return [Math.cos(a) * (Rr - 0.04), Math.sin(a) * (Rr - 0.04)]; });
      const holes = Array.from({ length: 6 }, (_, k) => { const a0 = (k / 6) * TAU; return Array.from({ length: 32 }, (_, i) => { const a = -(i / 32) * TAU; return [Math.cos(a0) * 0.36 + Math.cos(a) * 0.085, Math.sin(a0) * 0.36 + Math.sin(a) * 0.085]; }); });
      const dg = bevelPlate(disc.map(([u, v]) => [v, u]), 0.02, { bevel: 0.003, axis: 'x', holes: holes.map((h) => h.map(([u, v]) => [v, u])), curveSegments: 1 });
      H.add('camo', dg.translate(x + s * 0.04 - 0.01 + 0.01, y, z));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, hy = y + Math.sin(a) * 0.36, hz = z + Math.cos(a) * 0.36;
        H.add('camo', annulus(x + s * 0.03 - (s > 0 ? 0.017 : 0), x + s * 0.03 + (s > 0 ? 0 : 0.017), 0.085, 0.094, { seg: 40, axis: 'x', c: [hy, hz], ch: 0.002 }), { uv: 'keep' });
      }
      H.add('camo', lathe(side(s, [[0.04 + 0.002, 0.27], [0.06, 0.2], [0.085, 0.15]].map(([a, r]) => [a, r])).map(([a, r]) => [x + a, r]), { seg: 96, axis: 'x', c: cc }), { uv: 'keep' });
      H.add('camo', lathe(side(s, [[-0.1, 0], [-0.1, 0.15], [0.12, 0.15], [0.13, 0.148], [0.13, 0.1], [0.19, 0.088], [0.2, 0.08], [0.2, 0]]).map(([a, r]) => [x + a, r]), { seg: 64, axis: 'x', c: cc, fillet: 0.006 }), { uv: 'keep' });
      H.add('dark', prism(6, 0.052, 0.03, 0.006).rotateZ(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(x + s * 0.2, y, z));
      // brake drum: ribbed, its backing plate, the lever and the rod with an adjuster
      H.add('dark', lathe(side(s, [[0.895, 0], [0.895, 0.29], [0.905, 0.29], [0.905, 0.272], [0.92, 0.272], [0.92, 0.285], [0.93, 0.285], [0.93, 0.272], [0.945, 0.272], [0.945, 0.285], [0.955, 0.285], [0.955, 0.272], [0.97, 0.272], [0.97, 0.285], [0.98, 0.285], [0.98, 0.272], [1.0, 0.272], [1.0, 0]]), { seg: 96, axis: 'x', c: cc, crease: 50 }), { uv: 'keep' });
      H.add('steel', bar(V(s * 0.95, y + 0.2, z - 0.1), V(s * 0.6, y + 0.165, z - 0.235), 0.022, 0.022, 0.003));
      H.add('steel', cyl(0, 0.03, 0.012, 0.012, { seg: 6, axis: 'y' }).applyMatrix4(along(V(s * 0.74, y + 0.18, z - 0.18), V(s * 0.7, y + 0.176, z - 0.195))));
      // the mudguard: 96 along, beaded flanges, a stamped crown rib, cut ends capped; its front lip and stays
      const hw = 0.21, t = 0.0035, prof = [];
      prof.push([-hw - t, r0 - 0.05], [-hw - t, r0 + 0.006], [-hw + 0.012, r0 + 0.02], [-0.02, r0 + 0.02], [-0.014, r0 + 0.024], [0.014, r0 + 0.024], [0.02, r0 + 0.02], [hw - 0.012, r0 + 0.02], [hw + t, r0 + 0.006], [hw + t, r0 - 0.05]);
      prof.push(...arcPts(hw, r0 - 0.05, t + 0.003, 0, -Math.PI, 5).slice(1));
      prof.push([hw - t, r0 + 0.003], [hw - 0.012, r0 + 0.0165], [0.02, r0 + 0.0165], [-0.02, r0 + 0.0165], [-hw + 0.012, r0 + 0.0165], [-hw + t, r0 + 0.003], [-hw + t, r0 - 0.05]);
      prof.push(...arcPts(-hw, r0 - 0.05, t + 0.003, 0, -Math.PI, 5).slice(1, -1));
      const fp = prof.map(([a, r]) => [x + a, r]), phi0 = -2 * Math.PI - 0.3, phiLen = Math.PI + 0.42;
      H.add('camo', lathe(fp, { seg: 96, axis: 'x', c: cc, crease: 40, phi0, phiLen }), { uv: 'cyl', axis: 'x', c: cc });
      H.add('camo', latheCap(fp, 'x', cc, phi0, -1));
      H.add('camo', latheCap(fp, 'x', cc, phi0 + phiLen, 1));
      H.add('camo', chamferBox(0.44, 0.012, 0.2, 0.004, x, y - 0.02, z - r0 - 0.06, -0.25, 0, 0));
      H.add('camo', cyl(-0.22, 0.22, 0.012, 0.012, { seg: 16, axis: 'x', c: [y - 0.045, z - r0 - 0.155] }).translate(x, 0, 0));
      // (the standard's two lower stays ran through the wheel's disc: these leave the guard's inner flange and meet the
      // axle bracket inboard of the wheel and its drum)
      for (const [a, b] of [[V(x - s * 0.2, y - 0.02, z - r0 + 0.02), V(s * 0.84, y + 0.1, z - 0.18)], [V(x - s * 0.2, y - 0.13, z + r0 - 0.03), V(s * 0.84, y + 0.1, z + 0.18)], [V(x - s * 0.2, y + r0 * 0.7, z + r0 * 0.7), V(s * 0.63, 0.95, z + 0.75)]]) {
        const d = b.clone().sub(a).normalize(), a1 = a.clone().addScaledVector(d, 0.05), b1 = b.clone().addScaledVector(d, -0.05);
        H.add('camo', cyl(0, a1.distanceTo(b1), 0.015, 0.015, { seg: 16, axis: 'y' }).applyMatrix4(along(a1, b1)));
        H.add('camo', chamferBox(0.03, 0.06, 0.008, 0.002).translate(0, 0.03, 0).applyMatrix4(along(a, a1)));
        H.add('camo', chamferBox(0.03, 0.06, 0.008, 0.002).translate(0, 0.03, 0).applyMatrix4(along(b, b1)));
      }
    });
    add('traverse', 'micro', (H) => {
      // the clamp ring's 24 nuts on the disc, the hub's ten wheel nuts, the hub cap's grease nipple, the adjuster
      H.add('steel', boltsHD(Array.from({ length: 24 }, (_, i) => V(x + s * 0.0325, y + Math.cos((i * TAU) / 24) * (Rr - 0.08), z + Math.sin((i * TAU) / 24) * (Rr - 0.08))), V(s, 0, 0), { af: 0.022, h: 0.012, stud: 0.005 }));
      H.add('steel', boltsHD(Array.from({ length: 10 }, (_, i) => V(x + s * 0.13, y + Math.cos(((i + 0.5) * TAU) / 10) * 0.125, z + Math.sin(((i + 0.5) * TAU) / 10) * 0.125)), V(s, 0, 0), { af: 0.024, h: 0.014, stud: 0.007 }));
      H.add('steel', instances(nippleProto(1.2), [onSurface(V(x + s * 0.23, y + 0.0, z), V(s, 0, 0))]));
      H.add('steel', boltsHD([V(x - s * 0.2, y - 0.02, z - r0 + 0.024), V(x - s * 0.2, y - 0.13, z + r0 - 0.034)], V(-s, 0, 0), { af: 0.017, h: 0.009, stud: 0.004 }));
    });
  }
  return parts;
}

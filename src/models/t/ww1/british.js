import * as THREE from 'three';
import { V, box, sphere, rod, xTube, yTube, zTube, xf } from '../../kit.js';
import { FParts } from '../mats.js';
import { damageable, finishTarget } from '../damage.js';
import { rng, lorry, sandbagWall, shellBlock, lyingShell } from '../props.js';
import { boxStack, shellPyramid, netOver, pit, ridgeTent } from '../ww2/allied_kit.js';
import { buildGun } from '../../guns.js';
import { buildCrewman, crewForRole } from '../../v/crew.js';
import { piecePlacements } from '../../../sector.js';
import { heightAt } from '../../../terrainHeight.js';
import { layoutBritish, britishGunSite } from './layout_british.js';
import { buildQF18, limber18, wagonBody18 } from './qf18.js';

// The British side of the WW1 German mode (DESIGN.md "WW1 German mode"), the German player's targets, same contract
// as the other targets: { root, parts, setDamage(i, k), anchors: { burn, top, center } }; the gun sites add `rigs`
// (one per part: anchors.muzzle, setRecoil(k), update(dt)) so render/targets.js recoils them and flashes their
// muzzles when the sim fires them. Parts stand at layout_british.js's positions; every site faces local -Z.
//   bgun15 bgun92 bgun6 bgun60 bgunrail   the British game's own rigs (models/guns.js) standing in the pits the world
//             digs at sector.js UNITS (the site at the unit's pos and zero bearing: britishGunSite), each part one
//             piece lifted to its own pad, three of its detachment by it (they turn away and cover their ears at each
//             round and lie dead when the piece is knocked out); damage throws the barrel out of its cradle, drops
//             the cradle, twists the mounting, scorches the pit (the railway gun's car rolls back at each round)
//   bfield    four QF 18-pounders in hasty pits under nets, each with its ammunition wagon body unlimbered beside it,
//             two carriage limbers and the command post behind
//   bballoon  a Caquot kite balloon (three lobed tail fins, the rigging girdle, RFC roundels, the basket) at `alt`,
//             its winch lorry down the cable; burns and falls as the German Drachen does (balloon.js)
//   bdump     five stacks (18-pr boxes, 6-inch shells, cartridge boxes, 9.2-inch shells, mixed stores) behind sandbag
//             traverses under tarpaulins, a 60 cm light railway siding with loaded trucks and a petrol tractor
// Crew figures stay outside the damageable parts (their geometry is shared per outfit and must not be charred).

const EARTH = 0x9c8a66;
const KIND = { bgun15: 'bl15', bgun92: 'bl92', bgun6: 'bl6', bgun60: 'bl60', bgunrail: 'rail' };
const ELEV = { bl15: 0.62, bl92: 0.55, bl6: 0.42, bl60: 0.3, rail: 0.58 }; // laid for a long shot at the German batteries
const CREW_ROLES = ['officer', 'sergeant', 'layer', 'ears', 'ammo1', 'ammo2', 'fuze', 'traverser'];

// Up to n of a rig's crew spots (on the ground or platform, not riding a car) as posed figures under `parent`.
function standCrew(rig, parent, n, seed) {
  const spots = [];
  for (const role of CREW_ROLES) {
    const c = rig.anchors.crew.find((q) => q.role === role && !q.car);
    if (c) spots.push(c);
    if (spots.length >= n) break;
  }
  return spots.map((c, i) => {
    const fig = buildCrewman(crewForRole(c.role, i + seed));
    fig.root.position.set(c.x, c.y || 0, c.z);
    fig.root.rotation.y = c.heading || 0;
    fig.idle = c.pose === 'carry' || c.pose === 'ram' ? 'stand' : c.pose || 'stand';
    fig.role = c.role;
    fig.pose(fig.idle, 0, 1);
    fig.shown = fig.idle;
    parent.add(fig.root);
    return fig;
  });
}

// What render/targets.js drives per part: setRecoil(k) every frame (k > 0 after a round), update(dt). Wraps the rig:
// the detachment covers its ears for a moment at each round, the railway gun's car runs back along the spur and is
// hauled forward again, and a knocked-out piece stays as the damage left it.
function targetRig(rig, part, figs, { car = false } = {}) {
  let since = 1e9, last = 0;
  const pose = (f, name) => { if (f.shown !== name) { f.pose(name, 0, 1); f.shown = name; } };
  // the detachment falls with its piece even where nothing calls update (the model viewer)
  const hit = part.userData.setDamage;
  part.userData.setDamage = (k) => { hit(k); for (const f of figs) pose(f, k > 0.5 ? 'dead' : f.idle); };
  return {
    rig, anchors: rig.anchors, crew: figs,
    setRecoil(k) {
      if (k > 0.02 && last <= 0.02) since = 0; // a new round
      last = k;
      if ((part.userData.k ?? 0) < 0.3) rig.setRecoil(k);
    },
    update(dt) {
      since += dt;
      rig.update?.(dt);
      const dead = (part.userData.k ?? 0) > 0.5;
      if (car && rig.setCar && !dead) {
        // 6 m back in about 1.5 s, then winched forward over 25 s
        const t = since, z = t < 1.5 ? Math.sin((t / 1.5) * Math.PI / 2) : Math.max(0, 1 - (t - 1.5) / 25);
        rig.setCar(rig.carRoll * (since > 1e8 ? 0 : z));
      }
      for (const f of figs) pose(f, dead ? 'dead' : since < 2.2 && f.role !== 'officer' && f.role !== 'sergeant' ? 'ears' : f.idle);
    },
  };
}

// ---------------------------------------------------------------------------------- the British guns
function gunSite(kind, opts = {}) {
  const gk = KIND[kind], site = britishGunSite(kind), lay = layoutBritish(kind), places = piecePlacements(site.unit);
  const root = new THREE.Group(), r = rng(71 + gk.length), parts = [], rigs = [];
  const g0 = opts.flat ? 0 : heightAt(site.pos.x, site.pos.z);
  const big = gk === 'bl15' || gk === 'rail' ? 1 : gk === 'bl92' ? 0.8 : 0.6;
  lay.forEach((l, i) => {
    const part = new THREE.Group();
    // each piece on its own levelled pad: the site's ground is the unit's position, the pads differ a little
    part.position.set(l.x, opts.flat ? 0 : heightAt(places[i].x, places[i].z) - g0, l.z);
    const rig = buildGun(gk);
    rig.setElevation?.(ELEV[gk] + (r() - 0.5) * 0.06);
    rig.update?.(0);
    part.add(rig.root);
    const cg = new THREE.Group();
    cg.position.copy(part.position);
    root.add(cg);
    const figs = opts.crew === false ? [] : standCrew(rig, cg, 3, i * 3);
    const p = rig.pivots, bits = [];
    if (p.recoil) bits.push({ obj: p.recoil, k0: 0.35, k1: 0.85, pos: [0.25 * big, -0.35 * big, 0.6 * big], rot: [-0.3, 0.12, 0.3] });
    if (p.elevation) bits.push({ obj: p.elevation, k0: 0.4, k1: 1, rot: [-ELEV[gk] * 0.7, 0, 0] });
    if (p.traverse) bits.push({ obj: p.traverse, k0: 0.2, k1: 1, rot: [0.03, 0.2, 0.08] });
    if (p.crane) bits.push({ obj: p.crane, k0: 0.3, k1: 0.9, rot: [0.2, 0.8, 0.45] });
    if (p.car) bits.push({ obj: p.car, k0: 0.5, k1: 1, pos: [0.4, -0.25, 0], rot: [0, 0.03, 0.1] });
    damageable(part, { scorch: 6 + 6 * big, char: 0.9, sink: 0.1 * big, bits });
    root.add(part);
    parts.push(part);
    rigs.push(targetRig(rig, part, figs, { car: gk === 'rail' }));
  });
  return finishTarget(root, parts, { rigs, guns: rigs });
}

// ------------------------------------------------------------------------------------ 18-pdr battery
function fieldBattery(opts = {}) {
  const root = new THREE.Group(), r = rng(18), lay = layoutBritish('bfield'), parts = [], rigs = [];
  lay.forEach((l, i) => {
    const part = new THREE.Group();
    part.position.set(l.x, 0, l.z);
    part.rotation.y = (r() - 0.5) * 0.12;
    const rig = buildQF18();
    rig.setElevation(0.14 + r() * 0.1);
    part.add(rig.root);
    // the hasty pit: a ring of sandbags open at the back, the ammunition wagon body unlimbered on the right with its
    // armoured door up, rounds in boxes against the wall, empty cases thrown out behind the trail
    const P = new FParts('earth');
    pit(P, 3.9, { courses: 2, gap: 1.5, seed: 50 + i, earth: EARTH });
    wagonBody18(P, 2.15, 0.5, 0, { door: 1 });
    boxStack(P, -2.7, -0.4, 1, 3, 2, Math.PI / 2, { w: 0.62, h: 0.26, d: 0.36, tint: 0x8a7052, key: 'wood', rnd: r });
    for (let k = 0; k < 7; k++) P.add('brass', zTube(0, 0.3, 0.045, 0.045, 8, (r() - 0.5) * 3, 0.045, 3.8 + r() * 2).applyMatrix4(new THREE.Matrix4().makeRotationY((r() - 0.5) * 0.6)));
    P.build(part, { dirt: 0.5 });
    // a net on poles over the gun, its front left up so the gun can fire out
    const N = new FParts('earth');
    netOver(N, 4.8, 4.2, 2.3, { seed: 70 + i, drape: 1.3, open: true });
    const net = new THREE.Group();
    net.position.z = 1.0;
    N.build(net, { dirt: 0, shadow: true });
    part.add(net);
    const cg = new THREE.Group();
    cg.position.copy(part.position);
    cg.rotation.copy(part.rotation);
    root.add(cg);
    const figs = opts.crew === false ? [] : standCrew(rig, cg, 3, i * 2);
    const p = rig.pivots;
    damageable(part, {
      scorch: 6, char: 0.9, sink: 0.12,
      bits: [
        { obj: net, k0: 0, k1: 0.6, pos: [0.4, -2.0, 0.3], rot: [0.15, 0.4, 0.2], scale: 0.6 },
        { obj: p.recoil, k0: 0.35, k1: 0.85, pos: [0.3, 0.5, 1.0], rot: [-0.6, 0.5, 0.8] },
        { obj: p.elevation, k0: 0.4, k1: 1, rot: [-0.3, 0, 0] },
        { obj: p.traverse, k0: 0.2, k1: 1, rot: [0.05, 0.4, 0.35], pos: [0, -0.2, 0] },
      ],
    });
    root.add(part);
    parts.push(part);
    rigs.push(targetRig(rig, part, figs));
  });
  // behind the guns: two carriage limbers left at the position, the command post dugout with its telephone wires to
  // the pits, a tent and spare ammunition boxes
  const D = new FParts('earth'), cz = 26;
  limber18(D, -14, 15, 0.25);
  limber18(D, 9, 16, -0.15);
  D.add('earth', sphere(1, 0, 0.3, cz, 4.2, 1.1, 3.2, 12), { tint: EARTH });
  sandbagWall(D, -1.8, cz - 3.0, 1.8, cz - 3.0, { courses: 4 });
  D.add('dark', box(0.9, 0.8, 0.1, 0, 0.4, cz - 3.3));
  D.add('rust', box(4.6, 0.04, 3.2, 0, 1.15, cz, 0.05), { tint: 0x8a7a66 });
  D.add('dark', yTube(0.8, 3.4, 0.008, 0.006, 4, 1.4, cz));
  for (const l of lay) D.add('dark', rod(V(l.x, 0.04, l.z + 3.5), V(0, 0.04, cz - 3), 0.01, 3));
  ridgeTent(D, 13, cz + 5, -0.3, { tint: 0xc8bf9c });
  boxStack(D, -6, cz - 1, 3, 2, 3, 0.2, { w: 0.62, h: 0.26, d: 0.36, tint: 0x8a7052, key: 'wood', rnd: r });
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts, { rigs, guns: rigs });
}

// ------------------------------------------------------------------------------------- kite balloon
// The Caquot Type R as the RFC flew it from 1917: about 28 m long and 9 m across, a fat round nose, the hull tapering
// to the tail where three inflated lobes stand out (two above splayed in a V, one hanging below), a rigging girdle
// along each side with the lines run down to the basket.
function caquot() {
  const g = new THREE.Group(), E = new FParts('earth');
  const L = 27.5, R = 4.4, N = 32, pts = [];
  const radAt = (t) => (t > 0.7 ? R * Math.sqrt(Math.max(0, 1 - ((t - 0.7) / 0.3) ** 2)) : R * (0.14 + 0.86 * Math.pow(Math.sin((t / 0.7) * Math.PI / 2), 1.15)));
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2(Math.max(0.06, radAt(t)), t * L)); }
  const hull = new THREE.LatheGeometry(pts, 32).rotateX(-Math.PI / 2).translate(0, 0, L / 2); // nose -Z, tail +Z
  const BUFF = 0xcdbb8e;
  E.add('fabric', hull, { tint: BUFF });
  // the three tail lobes: long ellipsoids hung on the hull, their rear ends splayed out
  const zAt = (t) => L / 2 - t * L;
  for (const a of [Math.PI / 2 - 0.85, Math.PI / 2 + 0.85, -Math.PI / 2]) {
    const ca = Math.cos(a), sa = Math.sin(a), d = radAt(0.24) * 0.95 + 1.0;
    const dir = V(ca * 0.2, sa * 0.2, 1).normalize();
    const m = new THREE.Matrix4().compose(V(ca * d, sa * d, zAt(0.2)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir), V(1, 1, 1));
    E.add('fabric', sphere(1, 0, 0, 0, a < 0 ? 1.7 : 1.9, a < 0 ? 1.7 : 1.9, 5.6, 16).applyMatrix4(m), { tint: 0xc4b286 });
  }
  // the girdle (the suspension band) along each side, a seam band round the hull, the nose cap
  for (const s of [-1, 1]) {
    let prev = null;
    for (let i = 2; i <= 12; i++) {
      const t = 0.12 + (i / 12) * 0.76, rr = radAt(t), p = V(s * rr * 0.93, -rr * 0.36, zAt(t));
      if (prev) E.add('cloth', rod(prev, p, 0.07, 4), { tint: 0xa89870 });
      prev = p;
    }
  }
  E.add('fabric', zTube(zAt(0.62) - 0.15, zAt(0.62) + 0.15, radAt(0.62) + 0.02, radAt(0.62) + 0.02, 32), { tint: 0xb8a67a });
  // RFC roundels aft on both flanks
  const tR = 0.44, rr = radAt(tR);
  for (const s of [-1, 1]) {
    const face = (geo, off) => geo.applyMatrix4(xf(s * (Math.sqrt(rr * rr - 0.81) + off), 0.9, zAt(tR), 0, s * Math.PI / 2, 0));
    E.add('matte', face(new THREE.CircleGeometry(1.25, 24), 0.03), { tint: 0x22356e });
    E.add('matte', face(new THREE.CircleGeometry(0.85, 24), 0.05), { tint: 0xe8e4da });
    E.add('matte', face(new THREE.CircleGeometry(0.42, 20), 0.07), { tint: 0xa02222 });
  }
  // rigging to the basket's ring, the basket with its two observers' instruments and a parachute pack on the side
  const by = -R - 8.5;
  for (const s of [-1, 1]) for (const t of [0.3, 0.45, 0.6, 0.75]) {
    const q = radAt(t);
    E.add('dark', rod(V(s * q * 0.93, -q * 0.36, zAt(t)), V(s * 0.25, by + 1.6, -0.3), 0.025, 3));
  }
  E.add('dark', rod(V(0, by + 1.6, -0.3), V(0, by + 0.6, 0), 0.04, 4));
  E.add('wicker', box(1.1, 1.0, 1.0, 0, by, 0));
  E.add('wood', box(1.2, 0.06, 1.1, 0, by + 0.5, 0));
  E.add('dark', box(1.2, 0.05, 1.1, 0, by - 0.5, 0));
  E.add('matte', yTube(by - 0.1, by + 0.5, 0.18, 0.2, 10, 0.68, 0), { tint: 0x8a8060 }); // the parachute container
  E.build(g, { dirt: 0, y0: 0 });
  const bridle = new THREE.Object3D();
  bridle.position.set(0, by + 1.6, -0.3);
  g.add(bridle);
  return { group: g, bridle };
}

function kiteBalloon({ alt = 800 } = {}) {
  const root = new THREE.Group(), lay = layoutBritish('bballoon', { alt });
  const outer = new THREE.Group();
  outer.position.set(lay[0].x, lay[0].y, lay[0].z);
  outer.rotation.y = Math.PI / 2; // nose (-Z) toward the winch at local -X: the balloon rides downwind of it
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.14; // nose a little up, as the Caquot flew
  outer.add(tilt);
  const { group, bridle } = caquot();
  tilt.add(group);
  damageable(outer, { char: 0.95, sink: alt * 0.5, tilt: [0.5, 0.2, 0.35], squash: 0.55, bits: [] });
  root.add(outer);
  // the winch lorry on its standing, a sandbag wall, the crew's bell tent
  const lg = new THREE.Group();
  lg.position.set(lay[1].x, 0, lay[1].z);
  const W = new FParts('khaki');
  lorry(W, 0, 0, -Math.PI / 2, { winch: true });
  sandbagWall(W, 6, -5, 6, 5, { courses: 3 });
  W.add('wood', box(7.5, 0.05, 3.2, 0, 0.03, 0));
  W.add('cloth', new THREE.ConeGeometry(2.0, 3.0, 12).translate(-3, 1.5, 7), { tint: 0xd0c8a8 });
  W.build(lg, { dirt: 0.5 });
  damageable(lg, { char: 0.9, scorch: 6, sink: 0.1, tilt: [0, 0, 0.15] });
  root.add(lg);
  // the cable, from the winch drum up to the basket's bridle; it goes when the envelope burns
  root.updateMatrixWorld(true);
  const C = new FParts('khaki');
  C.add('dark', rod(V(lay[1].x, 2.3, 0), bridle.getWorldPosition(new THREE.Vector3()), 0.05, 4));
  const cable = new THREE.Group();
  C.build(cable, { shadow: false });
  root.add(cable);
  const home = outer.userData.setDamage;
  outer.userData.setDamage = (k) => { home(k); cable.visible = k < 0.15; };
  return finishTarget(root, [outer, lg], { cable, bridle });
}

// -------------------------------------------------------------------------------------------- dump
const HE = { tint: 0xb89a2a, band: 0x8a1c14 }; // British HE: yellow with a red band
function dumpStack(i, kind, r, x, z, ry) {
  const part = new THREE.Group();
  part.position.set(x, 0, z);
  part.rotation.y = ry;
  const base = new FParts('earth');
  base.add('wood', box(6.6, 0.12, 5.2, 0, 0.06, 0)); // the timber floor out of the mud
  for (let k = 0; k < 8; k++) base.add('earth', sphere(1, (r() - 0.5) * 8.5, 0.1, (r() - 0.5) * 7, 0.9 + r(), 0.2 + r() * 0.12, 0.8 + r() * 0.8, 6), { tint: EARTH });
  sandbagWall(base, -3.5, -3.1, 3.5, -3.1, { courses: 5, t: 0.6 }); // the traverse toward the enemy
  base.build(part, { dirt: 0.5 });
  const bits = [];
  for (let j = 0; j < 3; j++) {
    const g = new THREE.Group(), P = new FParts('earth');
    g.position.z = -1.6 + j * 1.6;
    if (kind === '18pr') boxStack(P, 0, 0, 7, 2, 3, 0, { w: 0.62, h: 0.26, d: 0.36, tint: 0x8a7052, key: 'wood', rnd: r, y: 0.12 });
    else if (kind === '6in') { shellPyramid(P, -1.5, 0, 7, 4, 0, { len: 0.6, rad: 0.077, ...HE }); shellPyramid(P, 1.5, 0, 7, 4, 0, { len: 0.6, rad: 0.077, ...HE }); }
    else if (kind === 'cart') boxStack(P, 0, 0, 5, 2, 3, 0, { w: 1.0, h: 0.36, d: 0.42, tint: 0x5e4c36, key: 'wood', rnd: r, y: 0.12 });
    else if (kind === '92in') shellBlock(P, 'bl92', 0, 0, j === 1 ? 6 : 7, 2, { rnd: r, y: 0.12 });
    else { // mixed: fuze boxes, 18-pr rounds in wicker panniers, drums of oil, a heap of empty cases for salvage
      boxStack(P, -1.8, 0, 3, 2, 2, 0.1, { w: 0.45, h: 0.25, d: 0.32, tint: 0x6a6a4a, rnd: r, y: 0.12 });
      for (let k = 0; k < 6; k++) P.add('wicker', yTube(0.12, 0.62, 0.16, 0.16, 10, 0.2 + (k % 3) * 0.36, -0.2 + (k > 2 ? 0.36 : 0)));
      for (let k = 0; k < 2; k++) P.add('matte', yTube(0.12, 1.0, 0.29, 0.29, 12, 1.9 + k * 0.62, 0), { tint: 0x3e4a32 });
      for (let k = 0; k < 14; k++) P.add('brass', zTube(0, 0.3, 0.045, 0.045, 8, -2.6 + r() * 1.2, 0.17 + (k % 3) * 0.08, -0.5 + r()).applyMatrix4(new THREE.Matrix4().makeRotationY((r() - 0.5) * 0.5)));
    }
    P.build(g, { dirt: 0.4, y0: 0.12 });
    part.add(g);
    bits.push({ obj: g, k0: 0.25 + j * 0.12, k1: 0.9, pos: [(r() - 0.5) * 8, 1.5 + r() * 5, (r() - 0.5) * 8 + 2], rot: [(r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3] });
  }
  const T = new FParts('earth');
  T.add('cloth', box(6.4, 0.05, 3.2, 0, 0, 0, 0.25), { tint: i % 2 ? 0x5c5a40 : 0x6c664a });
  T.add('cloth', box(6.4, 1.3, 0.05, 0, -0.65, 1.6), { tint: 0x5c5a40 });
  for (const sx of [-1, 1]) T.add('wood', rod(V(sx * 3.1, -1.45, 1.5), V(sx * 3.1, 0.1, 1.5), 0.04, 4));
  const tarp = new THREE.Group();
  tarp.position.set(0, 1.45, 0.9);
  T.build(tarp, { dirt: 0, y0: 1.2 });
  part.add(tarp);
  bits.push({ obj: tarp, k0: 0.1, k1: 0.5, pos: [0, 4.5, 2.5], rot: [-1.2, 0.6, 0.5] });
  return damageable(part, { scorch: 9, char: 0.95, sink: 0.1, bits });
}

function rail60(D, x, z0, z1) { // a 60 cm light railway siding along z
  for (let z = z0; z <= z1; z += 0.75) D.add('wood', box(1.2, 0.09, 0.15, x, 0.045, z));
  for (const sx of [-0.3, 0.3]) D.add('steel', box(0.045, 0.07, z1 - z0, x + sx, 0.125, (z0 + z1) / 2));
}
function truck60(D, x, z) { // a War Department light railway bogie wagon loaded with shells
  D.add('dark', box(1.5, 0.14, 4.0, x, 0.55, z));
  for (const sz of [-1, 1]) {
    D.add('dark', box(1.0, 0.25, 1.0, x, 0.32, z + sz * 1.4));
    for (const sx of [-1, 1]) for (const s2 of [-0.35, 0.35]) D.add('dark', xTube(x + sx * 0.3, x + sx * 0.36, 0.17, 0.17, 10, 0.2, z + sz * 1.4 + s2));
  }
  shellPyramid(D, x, z - 1, 6, 3, Math.PI / 2, { len: 0.6, rad: 0.077, ...HE });
  D.add('wood', box(1.0, 0.3, 1.6, x, 0.77, z + 1.1));
}

function britishDump() {
  const root = new THREE.Group(), r = rng(19);
  const kinds = ['18pr', '6in', 'cart', '92in', 'mixed'];
  const parts = layoutBritish('bdump').map((l, i) => {
    const p = dumpStack(i, kinds[i], r, l.x, l.z, (r() - 0.5) * 0.5);
    root.add(p);
    return p;
  });
  const D = new FParts('earth');
  rail60(D, -30, -40, 40);
  truck60(D, -30, -12);
  truck60(D, -30, -6.5);
  // the petrol tractor (a protected Simplex): a low armoured box on four wheels, its canopy
  D.add('camo', box(1.2, 0.8, 2.8, -30, 0.75, 3));
  D.add('camo', box(1.1, 0.06, 1.2, -30, 1.95, 3.6));
  for (const sx of [-1, 1]) D.add('dark', rod(V(-30 + sx * 0.5, 1.15, 3.1), V(-30 + sx * 0.5, 1.95, 3.1), 0.03, 4));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.add('dark', xTube(-30 + sx * 0.5, -30 + sx * 0.58, 0.25, 0.25, 12, 0.27, 3 + sz * 0.8));
  // a Nissen hut for the checkers, a notice board, the wire round the dump, shells dropped in the mud
  const hut = new THREE.CylinderGeometry(2.2, 2.2, 8, 14, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  D.add('rust', hut.translate(34, 0, 18), { tint: 0x8a7a66 });
  for (const zz of [14, 22]) D.add('wood', new THREE.CircleGeometry(2.18, 14, 0, Math.PI).translate(34, 0, zz)); // the timber ends, a door in each
  for (const zz of [13.97, 22.03]) D.add('dark', box(1.0, 1.8, 0.04, 34, 0.9, zz));
  D.add('wood', yTube(0, 2.2, 0.05, 0.05, 5, -8, -30));
  D.add('white', box(1.5, 0.8, 0.04, -8, 2.0, -30), { tint: 0xd8d0b8 });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2, x = Math.cos(a) * 42, z = Math.sin(a) * 36;
    D.add('wood', yTube(0, 1.2, 0.04, 0.04, 4, x, z));
    if (k % 8 !== 4) D.add('rust', rod(V(x, 1.0, z), V(Math.cos(a1) * 42, 1.0, Math.sin(a1) * 36), 0.006, 3));
  }
  for (let i = 0; i < 6; i++) lyingShell(D, i % 2 ? 'bl6' : 'bl92', -12 + r() * 30, 0.12, -28 + r() * 56, r() * 3);
  D.build(root, { dirt: 0.5 });
  return finishTarget(root, parts);
}

export const BUILD = {
  bgun15: (o) => gunSite('bgun15', o),
  bgun92: (o) => gunSite('bgun92', o),
  bgun6: (o) => gunSite('bgun6', o),
  bgun60: (o) => gunSite('bgun60', o),
  bgunrail: (o) => gunSite('bgunrail', o),
  bfield: fieldBattery,
  bballoon: kiteBalloon,
  bdump: britishDump,
};

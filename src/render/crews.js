import * as THREE from 'three';
import { buildCrewman, CREW_POSES, CREW_GAITS } from '../models/v/crew.js';
import { buildShell, buildCartridge } from '../models/shells.js';
import { GUNS, STEP } from '../sim/tables.js';
import { ramp, smooth, lerp, wrapPi, headingOf, clamp01 } from './anim.js';
import { CrewField, newPoly, polyAt, finishPoly } from './crewfield.js';
import { crewForRoleDE } from '../models/v/crew.js';
import { ROLES_DE, LIGHT_DE, WORLD_DE, STAFF_DE, DE_ACT, DE_PROPS } from './crews_de.js';
import { ROLES_HEAVY, heavyState, heavyMechanisms, heavyAct, heavyProps } from './crews_heavy.js';
import { ROLES_WW1, LIGHT_WW1, WORLD_WW1, STAFF_WW1, CREW_ERA, crewForRoleWW1, ww1State, ww1Mechanisms, ww1Act, ww1Props } from './crews_ww1.js';
// a node and every parent up to the rig's root are visible (an anchor whose part the rig has hidden is not)
const shown = (node, root) => { for (let n = node; n && n !== root; n = n.parent) if (!n.visible) return false; return !!node; };

// The loading choreography of one gun: the crew (crew.js figures at the rig's crew spots), the shell,
// the bag and the rammer staff as props, and the rig's mechanisms (the 15-inch crane, the railway
// gun's trolley). Everything is a pure function of the piece's job (step, time in step), the time since
// the last shot and the time to the next one, so time compression, dropped frames and fastForward all
// land on the same picture. Geometry is worked in the rig's root space (y up, -Z front at zero
// traverse); the barrel frame comes from the rig's anchors every frame, so a traversed or elevated
// gun is followed. Roles are table driven (ROLES); an unknown role just stands at its spot.
//
// Pace: the sim's steps are short for the light guns (a 6-inch cycle is 12 s), so the shell and the
// bag are carried in the men's arms at the stack until their step starts and only the short walk to
// the tray is played inside the step. The heavies lift the shell from the ground instead.

const POSES = new Set(CREW_POSES);
const FALLBACK = { ram: 'push', ramLow: 'push', lay: 'operate', lanyard: 'stand', ears: 'stand', point: 'stand', phone: 'stand', haul: 'push', dead: 'stand' };
const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride;

const ROLES = {
  bl6: { officer: 'cmd', layer: 'lay', sight: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan', ears: 'idle' },
  bl60: { officer: 'cmd', layer: 'lay', sight: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan', ears: 'idle' },
  bl92: { sergeant: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'pair0', loader2: 'pair1', rammer1: 'ram', rammer2: 'ram', ammo1: 'idle', ammo2: 'bag' },
  bl15: { sergeant: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1', rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram', crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'bag' },
  // (the 2.8 m high loading stage is only reached by ladder, so the cordite is carried by the first loader (on the left, away from the block's swing), who stands on it)
  // the 18-inch railway gun: the 15-inch's drill (a shell hoist, a rammer team on the loading stage) on the car
  rail: { sergeant: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1', rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram', crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'idle' },
  // the WW2 German pieces (crews_de.js, crews_heavy.js)
  ...ROLES_DE, ...ROLES_HEAVY,
  // the WW1 German mode's pieces (crews_ww1.js)
  ...ROLES_WW1,
};
// kinds drilled as light guns (shell and cartridge men turn with the traverse, the loader alone works the block)
const LIGHT = new Set(['bl6', 'bl60', ...LIGHT_DE, ...LIGHT_WW1]);
// roles that stay in the world frame (the rest turn with the gun's traverse)
const WORLD_ROLES = new Set(['crane1', 'crane2', 'ammo1', 'ammo2', 'crane', 'shell', 'cartridge']);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _y = new THREE.Vector3(0, 1, 0);
const _pt = { x: 0, z: 0, h: 0, d: 0 };
const _hand = new THREE.Vector3();
// Ease only the first and last footfall; the middle of a walk keeps a useful steady pace.
const travel = (k) => {
  k = clamp01(k);
  const e = 0.16, v = 1 / (1 - e);
  return k < e ? v * k * k / (2 * e) : k > 1 - e ? 1 - v * (1 - k) ** 2 / (2 * e) : v * (k - e / 2);
};
const R_STAND = 0.3, R_WALK = 0.3;
const _pp = { x: 0, z: 0 }, _pp2 = { x: 0, z: 0 }, _pp3 = { x: 0, z: 0 };

function propOf(built) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  for (const part of built.parts) {
    const m = new THREE.Mesh(part.geometry, part.material);
    m.castShadow = true;
    g.add(m);
  }
  g.visible = false;
  return g;
}

class Man {
  constructor(crew, spot, idx) {
    this.crew = crew;
    this.spot = spot;
    this.role = spot.role;
    this.idx = idx;
    this.beh = ROLES[crew.kind]?.[spot.role] ?? 'idle';
    this.world = spot.world ?? ((WORLD_ROLES.has(spot.role) && !LIGHT.has(crew.kind)) || /sergeant|officer|ears/.test(spot.role) || !!WORLD_DE[crew.kind]?.has(spot.role) || !!WORLD_WW1[crew.kind]?.has(spot.role));
    const o = crewOutfit(spot.role, idx, crew.kind);
    this.fig = buildCrewman(o);
    this.root = this.fig.root;
    this.root.visible = false;
    crew.rig.root.add(this.root);
    this.sx = spot.x; this.sz = spot.z; // the standing place (crews.js moves it clear of the steel)
    this.x = spot.x; this.z = spot.z; this.y = spot.y; this.h = spot.heading;
    this.li = 0; this.plans = {};
    this.seed = idx * 1.37;
    this.noEars = false;
  }

  // the spot in root space for the current traverse
  home(out) {
    const s = this.spot, c = this.crew;
    if (this.world) { out.x = this.sx; out.z = this.sz; out.h = s.heading; } else {
      const dx = this.sx - c.pvx, dz = this.sz - c.pvz;
      out.x = dx * c.ca + dz * c.sa + c.pvx;
      out.z = -dx * c.sa + dz * c.ca + c.pvz;
      out.h = s.heading + c.az;
    }
    out.y = s.y;
    return out;
  }

  put(x, y, z, h, pose, t = 0, groundSlope = null) {
    const c = this.crew;
    if (c.ears > 0.01 && !this.noEars) {
      h += wrapPi(c.az + Math.PI - h) * 0.75 * c.ears;
      if (c.ears > 0.5) pose = 'ears';
    }
    if (this.spot.car) { x += c.carX; z += c.carZ; } // standing on the railway car: it rolls back along the track with the gun
    this.x = x; this.y = y; this.z = z; this.h = h;
    this.root.position.set(x, y, z);
    this.root.rotation.y = h;
    if (this.fig.groundSlope) { this.fig.groundSlope.x = groundSlope?.x ?? 0; this.fig.groundSlope.z = groundSlope?.z ?? 0; }
    this.fig.pose(POSES.has(pose) ? pose : (FALLBACK[pose] ?? 'stand'), t, c.blend);
  }

  // walk from a to b ({x, z}) a fraction k of the way, holding y; gait 'walk' | 'carryWalk'
  walk(a, b, k, y, gait = 'walk') {
    const d = Math.hypot(b.x - a.x, b.z - a.z), kk = clamp01(k);
    const moving = kk > 0 && kk < 1 && d > 0.05;
    const h = d > 0.05 ? headingOf(b.x - a.x, b.z - a.z) : this.h;
    this.put(lerp(a.x, b.x, kk), y, lerp(a.z, b.z, kk), h, moving ? gait : (gait === 'carryWalk' ? 'carry' : 'stand'), moving ? (d * kk) / (gait === 'carryWalk' ? CSTRIDE : STRIDE) : this.crew.idleT + this.seed);
  }

  // walk along a route planned in the field frame (the gun's traverse frame, or the root for world roles)
  follow(poly, k, y, gait = 'walk', startHeading = null, endHeading = null) {
    const c = this.crew, d = clamp01(k) * poly.len;
    polyAt(poly, d, _pt, headingOf, smooth, wrapPi);
    const rot = !this.world, moving = k > 0 && k < 1 && poly.len > 0.05;
    const ux = _pt.x - c.pvx, uz = _pt.z - c.pvz;
    const x = rot ? ux * c.ca + uz * c.sa + c.pvx : _pt.x, z = rot ? -ux * c.sa + uz * c.ca + c.pvz : _pt.z;
    let h = rot ? _pt.h + c.az : _pt.h;
    if (startHeading != null) h = startHeading + wrapPi(h - startHeading) * smooth(k, 0, 0.12);
    if (endHeading != null) h += wrapPi(endHeading - h) * smooth(k, 0.86, 1);
    this.put(x, y, z, h, moving ? gait : (gait === 'carryWalk' ? 'carry' : 'stand'), moving ? d / (gait === 'carryWalk' ? CSTRIDE : STRIDE) : c.idleT + this.seed);
  }

  // put the grip point of a hand on a root-space point (after put)
  hand(side, x, y, z, w = 1) {
    if (w <= 0.01 || this.crew.level < 2) return;
    const dx = x - this.x, dz = z - this.z, ch = Math.cos(this.h), sh = Math.sin(this.h), sc = 1 / this.root.scale.x;
    _hand.set((dx * ch - dz * sh) * sc, (y - this.y) * sc, (dx * sh + dz * ch) * sc);
    this.fig.reach(side, _hand, Math.min(1, w));
  }

  hide() {
    this.root.visible = false;
  }
}

function crewOutfit(role, i, kind) {
  if (GUNS[kind]?.era === 'ww1' || (CREW_ERA.ww1 && GUNS[kind]?.side === 'german')) return crewForRoleWW1(role, i); // 1917 dress (crews_ww1.js)
  if (GUNS[kind]?.side === 'german') return crewForRoleDE(role, i); // the WW2 German crews (crew.js german44)
  if (/sergeant|officer/.test(role)) return { outfit: 'officer', skin: i % 4 };
  const o = (i % 3 === 2) ? 'gunner-tunic' : 'gunner';
  return { outfit: o, skin: i % 4 };
}

export class GunCrew {
  constructor(rig, kind) {
    this.rig = rig;
    this.kind = kind;
    this.men = [];
    this.level = 2;
    this.blend = 1;
    this.idleT = 0;
    this.carX = 0; this.carZ = 0; // how far the railway car has rolled back along the track (rig.pivots.car), metres
    this.ears = 0;
    this.az = 0; this.ca = 1; this.sa = 0;
    // the traverse pivot's place (the 18-inch's mounting turns about a point 0.8 m forward of the car's middle)
    const tv = rig.pivots.traverse;
    this.pvx = tv ? tv.position.x : 0; this.pvz = tv ? tv.position.z : 0;
    this.T = new THREE.Vector3(); this.B = new THREE.Vector3(); this.Mz = new THREE.Vector3(); this.S = new THREE.Vector3();
    this.u = new THREE.Vector3(0, 0, -1);
    this.bd = { x: 0, z: -1 }; this.rt = { x: 1, z: 0 };
    this.aT = -1.5;
    this.tmp = [0, 1, 2, 3, 4, 5].map(() => ({ x: 0, y: 0, z: 0, h: 0, d: 0 }));
    const sb = buildShell(kind === 'rail' ? 'rail' : kind, 14);
    this.half = sb.length / 2; this.srad = sb.radius; this.slen = sb.length;
    this.shellA = propOf(sb); // the shell being carried or on the tray
    this.shellB = propOf(sb); // the next one, lying at the stack
    const bag = buildCartridge(kind === 'rail' ? 'rail' : kind);
    this.bag = propOf(bag);
    this.bagLen = bag.length;
    const staffLen = rig.staffLen ?? { bl6: 1.7, bl60: 1.8, bl92: 2.6, bl15: 3.4, rail: 4.2, ...STAFF_DE, ...STAFF_WW1 }[kind] ?? 2; // (the super-heavies give their own)
    this.staffLen = staffLen;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.8 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.5 });
    this.staff = new THREE.Group();
    this.staff.rotation.order = 'YXZ';
    const sr = Math.max(0.03, this.srad * 0.2);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr, staffLen, 8).rotateX(Math.PI / 2).translate(0, 0, staffLen / 2), wood);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(this.srad * 0.92, this.srad * 0.92, 0.12, 14).rotateX(Math.PI / 2), iron);
    shaft.castShadow = head.castShadow = true;
    this.staff.add(shaft, head);
    this.staff.visible = false;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 1 }));
    rope.visible = false;
    this.rope = rope;
    for (const o of [this.shellA, this.shellB, this.bag, this.staff, rope]) rig.root.add(o);
    // the breech block's free edge (where the hands go to swing it)
    const br = rig.pivots.breech;
    this.grip = new THREE.Object3D();
    if (br) {
      this.grip.position.set(-2 * Math.abs(br.position.x) * 0.9, 0, 0.12);
      br.add(this.grip);
    }
    rig.anchors.crew.forEach((s, i) => this.men.push(new Man(this, s, i)));
    this.byRole = new Map(this.men.map((m) => [m.role, m]));
    // the height of the loading platform behind the breech (the stack is on the ground)
    this.workY = (this.byRole.get('rammer1') ?? this.byRole.get('rammer') ?? this.byRole.get('loader'))?.spot.y ?? 0;
    this.setup();
    this.field = null;
    this.makeField();
    if (rig.loadingStage) {
      this.makeLoadingCart();
      // The real transverse handle on this interrupted-screw carrier.
      this.grip.position.set(-0.21, 0, 0.36);
      for (const m of this.men) if (m.beh === 'ram') { m.sx = m.spot.x; m.sz = m.spot.z; }
    }
  }

  setup() {
    const rig = this.rig;
    this.crane = rig.pivots.crane ?? null;
    this.hoist = rig.pivots.hoist ?? null;
    this.trolley = rig.pivots.trolley ?? null;
    if (this.crane) {
      this.R = -this.hoist.position.x;
      this.cp = this.crane.position;
      // the ground shell sits where the hook can reach it (jib turned to PI, or to rig.craneRest: the Karl's
      // carrier and the Bertha's cart; rig.pickY is the shell's middle there when it is not on the ground)
      const rest = rig.craneRest ?? Math.PI;
      this.pick = new THREE.Vector3(this.cp.x - this.R * Math.cos(rest), rig.pickY ?? 0.52, this.cp.z + this.R * Math.sin(rest));
    }
    this.restHoist = rig.hoistRange?.up ?? 3.6;
    // the shell's middle below the hook and the hook's height at the stack (the 18-inch has a short sling)
    this.hang = rig.hoistHang ?? 1.18;
    this.lowHoist = rig.hoistHang != null ? rig.hoistRange.down : 1.72;
    this.restTrolley = this.trolley ? this.trolley.position.z : 0;
    this.trolleyRear = this.restTrolley;
  }

  // the clearance field: standing places moved clear of the steel, the other men's places as blockers
  makeField() {
    const rig = this.rig, floors = [...new Set(this.men.map((m) => Math.round(m.spot.y * 20) / 20).concat([0, Math.round(this.workY * 20) / 20]))].sort((a, b) => a - b);
    const keep = [rig.root.position.clone(), rig.root.rotation.clone(), rig.root.quaternion.clone()];
    rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0); rig.root.updateMatrixWorld(true);
    const at = rig.root.userData.crewAt ?? { x: keep[0].x, z: keep[0].z };
    const F = this.field = new CrewField(rig, this.kind, GUNS[this.kind], floors, at, this.workY);
    rig.root.position.copy(keep[0]); rig.root.rotation.copy(keep[1]); rig.root.updateMatrixWorld(true);
    const out = { x: 0, z: 0 };
    F.blk.length = 0;
    for (const m of this.men) {
      m.li = F.level(m.spot.y);
      let tx = m.spot.x, tz = m.spot.z;
      // The split-trail howitzer's shell route passes behind the spade; stage the
      // cartridge between the open trails until the shell carrier has returned.
      if (this.kind === 'lefh18' && m.beh === 'bag') { tx = -0.1; tz = 3.2; }
      if (m.beh === 'bag' && m.world) {
        // the cordite man waits by the cartridge crates of the pit
        const cr = F.pit.filter((b) => b.name === 'crate');
        if (cr.length) { tx = cr.reduce((a, b) => a + (b.x0 + b.x1) / 2, 0) / cr.length; tz = cr.reduce((a, b) => a + (b.z0 + b.z1) / 2, 0) / cr.length - 0.9; }
      }
      F.snapHome(m.li, tx, tz, m.spot.pose === 'crouch' ? 0.4 : this.kind === 'rail' ? R_STAND + 0.06 : R_STAND, out, m.world);
      m.sx = out.x; m.sz = out.z;
      if (!m.world) F.blk.push([out.x, out.z, 0.32]); // the next man keeps his distance
    }
    F.blk.length = 0;
    this.lw = F.level(this.workY); this.l0 = F.level(0);
    this.pairLead = this.men.find((q) => /^pair/.test(q.beh)) ?? null;
    this.snapTmp = out;
  }

  // standing men are obstacles for the walkers (not the one asking)
  blockers(except) {
    const b = this.field.blk, ca = this.ca, sa = this.sa;
    b.length = 0;
    for (const m of this.men) {
      if (m === except || /^pair/.test(m.beh)) continue;
      const k = m.bk ??= [0, 0, 0.32];
      // the man's place in root space, then in the asker's frame
      let x = m.sx, z = m.sz;
      if (!m.world) { const dx = m.sx - this.pvx, dz = m.sz - this.pvz; x = dx * ca + dz * sa + this.pvx; z = -dx * sa + dz * ca + this.pvz; }
      if (!except.world) { const dx = x - this.pvx, dz = z - this.pvz; k[0] = dx * ca - dz * sa + this.pvx; k[1] = dx * sa + dz * ca + this.pvz; } else { k[0] = x; k[1] = z; }
      b.push(k);
    }
    return b;
  }

  // to and from the field frame (the gun's traverse frame for the men that turn with it)
  toF(m, x, z, out) {
    if (m.world) { out.x = x; out.z = z; } else { const dx = x - this.pvx, dz = z - this.pvz; out.x = dx * this.ca - dz * this.sa + this.pvx; out.z = dx * this.sa + dz * this.ca + this.pvz; }
    return out;
  }

  // a cached route for man m (tag names the leg), endpoints in the field frame
  plan(m, tag, l, ax, az, bx, bz, r, ignoreBlock = false, down = false, fl = 'work', relax = 0.28, ext = null) {
    const P = m.plans[tag] ??= { poly: newPoly(), k: [1e9, 1e9, 1e9, 1e9, 0, 1e9] };
    const k = P.k;
    if (Math.abs(k[0] - ax) > 0.02 || Math.abs(k[1] - az) > 0.02 || Math.abs(k[2] - bx) > 0.02 || Math.abs(k[3] - bz) > 0.02 || k[4] !== r || Math.abs(k[5] - this.az) > 0.01) {
      k[0] = ax; k[1] = az; k[2] = bx; k[3] = bz; k[4] = r; k[5] = this.az;
      if (ignoreBlock) this.field.blk.length = 0; else this.blockers(m);
      // ext = { x, z, head }: the walk is routed to (bx, bz) and then runs straight to (x, z) (head: it starts at (x, z) instead)
      const poly = P.poly;
      if (ext && ext.head) {
        this.field.route(fl, l, ext.x, ext.z, bx, bz, r, poly, m.world, relax);
        poly.x.copyWithin(1, 0, poly.n); poly.z.copyWithin(1, 0, poly.n);
        poly.x[0] = ax; poly.z[0] = az; poly.n++;
        finishPoly(poly);
      } else {
        this.field.route(fl, l, ax, az, bx, bz, r, poly, m.world, relax);
        if (ext) { poly.x[poly.n] = ext.x; poly.z[poly.n] = ext.z; poly.n++; finishPoly(poly); }
      }
      P.poly.step = this.field.findStep(P.poly, this.l0, l, down);
    }
    return P.poly;
  }

  setLevel(level) {
    this.level = level;
    const vis = level > 0;
    if (this.heavyDrill) this.heavyDrill.root.visible = vis;
    if (this.loadingCart) this.loadingCart.visible = vis;
    if (this.chargeRest) this.chargeRest.visible = vis;
    for (const m of this.men) if (!vis) m.hide();
    if (!vis) for (const o of [this.shellA, this.shellB, this.bag, this.staff, this.rope]) o.visible = false;
  }

  // ---------------------------------------------------------------- frame
  prepare(p) {
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    _inv.copy(rig.root.matrixWorld).invert();
    const toR = (o, v) => o ? o.getWorldPosition(v).applyMatrix4(_inv) : v.set(0, 0, 0);
    toR(rig.anchors.tray, this.T);
    toR(rig.anchors.breech, this.B);
    toR(rig.anchors.muzzle, this.Mz);
    toR(rig.anchors.shellStack, this.S);
    this.u.copy(this.Mz).sub(this.B).normalize();
    // the car's run back along the track, in the root frame (the Gustav's runs along its own axis, turned on its curve)
    const run = rig.pivots.car ? rig.pivots.car.position.z : 0, cy = rig.carYaw?.() ?? 0;
    this.carX = run * Math.sin(cy); this.carZ = run * Math.cos(cy);
    this.az = p.az;
    this.field.setAz(p.az);
    this.ca = Math.cos(p.az); this.sa = Math.sin(p.az);
    this.bd.x = -this.sa; this.bd.z = -this.ca;
    this.rt.x = this.ca; this.rt.z = -this.sa;
    this.aT = _a.copy(this.T).sub(this.B).dot(this.u);
  }

  // root-space centre of a shell lying on the tray with its middle at axial position a (from the breech)
  trayAt(a, out) {
    return out.copy(this.T).addScaledVector(this.u, a - this.aT);
  }

  placeProp(o, c, yaw, pitch, vis = true) {
    o.visible = vis && this.level > 0;
    if (!o.visible) return;
    o.position.copy(c);
    o.rotation.set(pitch, yaw, 0);
  }

  // ---------------------------------------------------------------- the update
  update(p, sim, rawDt, level) {
    this.level = level;
    if (level <= 0) { this.setLevel(level); return; }
    const rig = this.rig, g = GUNS[p.kind];
    const now = sim.time + (sim.alpha ?? 0) * STEP;
    this.blend = 1 - Math.exp(-14 * Math.max(rawDt, 0.008));
    this.idleT = now * 0.25;
    this.prepare(p);
    const job = p.job;
    const s = job ? job.step : null;
    const k = job ? clamp01((job.t + (sim.alpha ?? 0) * STEP) / Math.max(0.01, job.dur)) : 0;
    const tf = now - p.firedAt;
    const tw = p.state === 'ready' && p.rounds > 0 ? Math.max(0, p.fireAt - now) : Infinity;
    const warn = tw < 1.6 ? ramp(1.6 - tw, 0, 0.3) : 0;
    const after = tf < 3 ? 1 - ramp(tf, 2.4, 3) : 0;
    this.ears = Math.max(warn, after);
    const c = { p, s, k, tf, tw, now, st: p.state, loaded: p.loaded, i: job ? job.i : -1 };
    this.c = c;
    this.state(c);
    // Mechanisms and their contact points must belong to this frame before hands are solved.
    this.mechanisms(c);
    rig.root.updateMatrixWorld(true);
    // casualties: the last men of the list leave the gun
    const casualties = Math.max(0, p.crewMax - p.crew);
    for (let i = 0; i < this.men.length; i++) {
      const m = this.men[i];
      const gone = p.state === 'dead' || i >= this.men.length - casualties;
      if (gone) { m.hide(); continue; }
      m.root.visible = true;
      this.act(m, c);
    }
    this.props(c);
    // The props live in the rig's root, not in the parts they rest on: each is drawn only while its part is, so a
    // rig that hides a part (the Gustav's assembly) hides what lies on it. The next shell is the shell stack's; the
    // shell in hand, the cartridges, the staff and the rope are the gun's (its tray).
    if (!shown(rig.anchors.shellStack, rig.root)) this.shellB.visible = false;
    if (!shown(rig.anchors.tray, rig.root)) for (const o of [this.shellA, this.shellB, this.bag, this.staff, this.rope]) o.visible = false;
  }

  // shell and staff state shared by the roles, once per frame
  state(c) {
    const s = c.s, k = c.k;
    // axial position of the shell's middle while it is on the tray (negative: behind the breech)
    let a = null; // the shell A on the tray / in the bore
    const aEnd = this.half + 0.12; // fully in, its base just inside the breech face
    this.shellOnTray = false;
    this.ramK = 0; // 0..1 of the stroke
    if (s === 'ram') {
      this.shellOnTray = true;
      this.ramK = smooth(k, 0.18, 0.72);
      a = lerp(this.aT, aEnd, this.ramK);
    }
    this.shellA_a = a;
    // rammer staff head (the shell's base while ramming)
    this.staffA = null;
    if (s === 'ram') this.staffA = (a ?? this.aT) - this.half - (aEnd - this.aT) * smooth(k, 0.78, 0.92);
    else if (s === 'cartridge') {
      const push = smooth(c.k, 0.55, 0.72) - smooth(c.k, 0.78, 0.95);
      if (c.k > 0.5 && c.k < 0.97 && !LIGHT.has(this.kind)) this.staffA = lerp(-0.7, 0.1, push);
    }
    if (ww1State(this, c)) return;
    if (heavyState(this, c)) return;
    const owner = this.ramList?.[0] ?? this.men.find((m) => m.beh === 'ram');
    if (owner) {
      // The same staff is carried at rest, lowered into line, withdrawn and stood up again.
      // Its transform is shared by the prop and every hand, including the acquisition arcs.
      const h = owner.home(this.tmp[0]), side = owner.sx < 0 ? -1 : 1;
      this.staff.position.set(h.x + Math.cos(h.h) * side * 0.25, h.y + 0.12, h.z - Math.sin(h.h) * side * 0.25 + 0.12);
      let standBack = 0;
      if (this.pairLead && !this.rig.loadingStage) {
        if (s === 'shell') standBack = 1.2 * smooth(k, 0, 0.15);
        else if (s === 'ram') standBack = 1.2 * (1 - smooth(k, 0.55, 0.8));
      }
      this.staff.position.x -= this.bd.x * standBack; this.staff.position.z -= this.bd.z * standBack;
      if (this.rig.loadingStage) this.staff.position.set(h.x + this.rt.x * 0.35, h.y + 0.12, h.z + this.rt.z * 0.35);
      this.staff.rotation.set(-Math.PI / 2, h.h, 0);
      let engage = 0;
      if (s === 'ram') engage = smooth(k, 0, 0.16) * (1 - smooth(k, 0.92, 1));
      else if (s === 'cartridge' && this.staffA != null) engage = smooth(k, 0.5, 0.56) * (1 - smooth(k, 0.92, 0.97));
      if (engage > 0 && this.staffA != null) {
        this.trayAt(this.staffA, _a);
        this.staff.position.lerp(_a, engage);
        _q.setFromEuler(_e.set(Math.asin(this.u.y), this.az, 0));
        this.staff.quaternion.slerp(_q, engage);
      }
      this.staff.updateMatrix();
      this.staffGrip = engage;
      this.staffOwner = owner;
    }
  }

  // ---------------------------------------------------------------- roles
  act(m, c) {
    const h = this.tmp[0];
    m.home(h);
    const p = c.p, s = c.s, k = c.k;
    m.noEars = false;
    if (ww1Act(this, m, c, h)) return;
    if (heavyAct(this, m, c, h)) return;
    const de = DE_ACT[m.beh]; // the Nebelwerfer's drill (crews_de.js)
    if (de) { de(this, m, c, h); return; }
    const moving =Math.abs(p.cmd.az - p.az) > 3e-4 || Math.abs(p.cmd.el - p.el) > 3e-4 || s === 'lay' || s === 'depress';
    switch (m.beh) {
      case 'lay':
        m.put(h.x, h.y, h.z, h.h, 'lay', moving ? (p.az + p.el) * 30 : 0);
        break;
      case 'wheel':
        m.put(h.x, h.y, h.z, h.h, moving ? 'operate' : 'stand', moving ? c.now * 1.4 : this.idleT + m.seed);
        break;
      case 'cmd': {
        const up = (c.st === 'ready' && p.rounds > 0) || s === 'prime';
        m.put(h.x, h.y, h.z, h.h, up ? 'point' : c.st === 'idle' ? 'phone' : 'stand', this.idleT + m.seed);
        break;
      }
      case 'lan': this.lanyardMan(m, c, h); break;
      case 'breech': this.breechMan(m, c, h); break;
      case 'ram': if (this.rig.loadingStage) this.stageRamMan(m, c, h); else this.ramMan(m, c, h); break;
      case 'carry': this.carryMan(m, c, h, 'shell'); break;
      case 'bag': if (!this.rig.loadingStage || !this.stageBreechMan(m, c, h)) this.carryMan(m, c, h, 'bag'); break;
      case 'pair0': case 'pair1': if (this.rig.loadingStage) this.stagePairMan(m, c); else this.pairMan(m, c, h); break;
      case 'guide0': case 'guide1': this.guideMan(m, c, h); break;
      case 'winch': case 'signal': case 'sling': case 'trolley': this.craneMan(m, c, h); break;
      case 'liftL': case 'liftR': case 'shove': this.liftMan(m, c, h); break; // the Gustav's lift men (ROLES_HEAVY)
      default:
        m.put(h.x, h.y, h.z, h.h, 'stand', this.idleT + m.seed);
    }
  }

  lanyardMan(m, c, h) {
    const on = c.s === 'prime' ? c.k > 0.2 : c.st === 'ready' || c.st === 'laying' || (c.st === 'recoil' && c.tf < 0.5);
    m.noEars = c.tw > 0.05 && c.tf > 3;
    if (c.tw < 0.05 || c.tf < 0.5) m.noEars = true;
    // the pull: the hand snaps back at the shot
    m.put(h.x, h.y, h.z, h.h, on ? 'lanyard' : 'stand', on ? clamp01(c.tf * 3) : this.idleT + m.seed);
    const rope = this.rope;
    rope.visible = on && this.level > 1;
    if (rope.visible) {
      m.root.updateMatrixWorld(true);
      m.fig.anchors.handR.getWorldPosition(_a).applyMatrix4(_inv);
      _b.copy(this.B).addScaledVector(this.u, 0.3).add(_c.set(0.15, 0.25, 0));
      _c.copy(_a).sub(_b);
      const len = Math.max(0.05, _c.length());
      rope.position.copy(_b);
      rope.scale.set(1, len, 1);
      rope.quaternion.setFromUnitVectors(_y, _c.normalize());
    }
  }

  breechMan(m, c, h) {
    const s = c.s, k = c.k;
    const open = s === 'open' || s === 'close';
    m.put(h.x, h.y, h.z, h.h, open ? 'ramLoad' : 'stand', open ? smooth(k, 0.12, 0.82) : this.idleT + m.seed);
    if (open) {
      this.grip.getWorldPosition(_a).applyMatrix4(_inv);
      const grip = smooth(k, 0, 0.12) * (1 - smooth(k, 0.88, 1));
      m.hand('R', _a.x, _a.y, _a.z, grip);
      m.hand('L', _a.x, _a.y - 0.1, _a.z + 0.1, grip);
    } else if (s === 'prime') {
      m.hand('R', this.B.x, this.B.y + 0.15, this.B.z, smooth(k, 0, 0.3) * (1 - smooth(k, 0.7, 1)));
    } else if (s === 'cartridge') {
      m.hand('R', this.B.x, this.B.y, this.B.z, smooth(k, 0.4, 0.6) * (1 - smooth(k, 0.75, 0.95)));
    } else if (s === 'shell' && k > 0.7) {
      this.trayAt(this.aT, _a);
      m.hand('R', _a.x, _a.y + this.srad, _a.z, smooth(k, 0.7, 0.85));
    }
  }

  // the rammer team: the staff pushes the shell, then the bag
  ramMan(m, c, h) {
    const rammers = this.ramList ??= this.men.filter((q) => q.beh === 'ram');
    const idx = rammers.indexOf(m);
    const on = this.staffA != null;
    // lunge forward with the stroke, then fall back
    let adv = 0;
    if (c.s === 'ram') adv = this.ramK * (this.half + 0.12 - this.aT) * 0.65 * (1 - smooth(c.k, 0.8, 1));
    else if (c.s === 'cartridge' && on) adv = 0.25 * smooth(c.k, 0.55, 0.72) * (1 - smooth(c.k, 0.78, 0.95));
    // with a pair carrying the shell to the rear of the tray the rammers give them room
    let back = 0;
    if (this.pairLead && this.pairBk && !this.rig.loadingStage) {
      if (c.s === 'shell') back = 1.2 * smooth(c.k, 0, 0.15);
      else if (c.s === 'ram') back = 1.2 * (1 - smooth(c.k, 0.55, 0.8));
      else if (c.s === 'open' || c.s === 'depress') back = 0;
      else if (c.s === 'cartridge') back = 0;
    }
    if (back > 0) { h.x -= this.bd.x * back; h.z -= this.bd.z * back; }
    if (adv > 0) {
      // the body stops at the steel; the staff goes on without him
      this.blockers(m);
      if (this.pairLead && this.pairBk && (c.s === 'ram' && c.k < 0.7)) this.field.blk.push(this.pairBk[0], this.pairBk[1]);
      let reach = 0;
      while (reach < adv && this.field.free("work", m.li, m.sx, m.sz + back - reach - 0.05, 0.5, m.world)) reach += 0.05;
      adv = Math.min(adv, reach);
    }
    const effort = this.ramK * (1 - smooth(c.k, 0.76, 0.95));
    const stepping = (adv > 0.025 && ((c.k > 0.18 && c.k < 0.7) || c.k > 0.8))
      || (back > 0 && (c.s === 'shell' && c.k < 0.15 || c.s === 'ram' && c.k > 0.55 && c.k < 0.8));
    m.put(h.x + this.bd.x * adv, h.y, h.z + this.bd.z * adv, h.h, stepping ? on ? 'carryWalk' : 'walk' : on ? 'ramLoad' : 'stand', stepping ? (adv - back) / (on ? CSTRIDE : STRIDE) : on ? effort : this.idleT + m.seed);
    if (this.staffOwner && (on || m === this.staffOwner)) {
      const hu = this.u.x * this.u.x + this.u.z * this.u.z || 1;
      const base = m.home(this.tmp[1]), startBack = this.pairLead && c.s === 'ram' ? 1.2 : 0;
      const sm = ((base.x - this.bd.x * startBack - this.T.x) * this.u.x + (base.z - this.bd.z * startBack - this.T.z) * this.u.z) / hu;
      const start = c.s === 'cartridge' ? -0.7 : this.aT - this.half;
      // These distances are fixed to the shaft during a stroke: the hands travel with
      // the wood instead of continually sliding to its nearest point beside the man.
      const d = Math.max(0.3, Math.min(this.staffLen - 0.5, start - (this.aT + sm)));
      const hold = Math.min(1.05, this.staffLen - 0.1), e = this.staffGrip ?? 0;
      for (const [side, dd] of [['R', d], ['L', Math.min(this.staffLen - 0.1, d + 0.38)]]) {
        _a.set(0, 0, lerp(hold, dd, e)).applyMatrix4(this.staff.matrix);
        const grip = m === this.staffOwner && side === 'R' ? 1 : smooth(e, 0.45, 0.95);
        m.hand(side, _a.x, _a.y, _a.z, grip);
      }
    }
    // on the heavies the first two heave the breech block round by hand
    if (idx < 2 && !LIGHT.has(this.kind) && (c.s === 'open' || c.s === 'close')) {
      this.grip.getWorldPosition(_a).applyMatrix4(_inv);
      m.hand('R', _a.x, _a.y, _a.z, 1);
      m.hand('L', _a.x, _a.y - 0.12, _a.z + 0.12, 1);
    }
  }

  // one man with the shell or the bag in his arms
  carryMan(m, c, h, what) {
    const s = c.s, k = c.k, shell = what === 'shell';
    const q = this.tmp[2], carry = shell ? this.shellA : this.bag, F = this.field, fq = this.tmp[4], fh = this.tmp[5];
    // his working place: beside the tray (shell) or behind the breech (bag), moved clear of the steel; a round laid in
    // the open breech (the leFH and sFH 18 have no tray) is measured from where it is lined up behind the face
    const tgt = shell ? this.trayAt(this.aT > -this.half ? -(this.half + 0.06) : this.aT, _a) : _a.copy(this.B).addScaledVector(this.u, -0.15);
    // (the 18-inch's block is hinged on the right and swings out there: the cordite comes in from the left)
    const back = shell ? this.half + 0.35 : 0.75, side = shell ? 0.62 : this.kind === 'rail' ? -0.6 : 0.5;
    this.toF(m, tgt.x - this.bd.x * back + this.rt.x * side, tgt.z - this.bd.z * back + this.rt.z * side, fq);
    this.blockers(m);
    const fl = m.spot.y < this.workY - 0.1 && F.hasComb ? 'comb' : 'work';
    if (this.rig.loadingStage && !shell) { fq.x = 0.58; fq.z = 2.1; }
    else F.snap(fl, this.lw, fq.x, fq.z, R_STAND, fq, m.world);
    fh.x = m.sx; fh.z = m.sz;
    // a man far from his work place goes as near as a short walk gets him
    if (Math.hypot(fq.x - fh.x, fq.z - fh.z) > 2.5) {
      const key = m.cq ??= [1e9, 1e9, 1e9, 1e9, 1e9];
      if (Math.abs(key[0] - fq.x) > 0.02 || Math.abs(key[1] - fq.z) > 0.02 || Math.abs(key[2] - fh.x) > 0.02 || Math.abs(key[3] - fh.z) > 0.02 || Math.abs(key[4] - this.az) > 0.01) {
        key[0] = fq.x; key[1] = fq.z; key[2] = fh.x; key[3] = fh.z; key[4] = this.az;
        F.closest(fl, this.lw, fh.x, fh.z, fq.x, fq.z, R_STAND, Math.min(6.5, Math.hypot(fq.x - fh.x, fq.z - fh.z) * 1.6), (m.cqOut ??= { x: 0, z: 0 }), m.world);
      }
      fq.x = m.cqOut.x; fq.z = m.cqOut.z;
    }
    const rc = this.rig.loadingStage && !shell ? 0.2 : shell ? Math.min(0.75, Math.hypot(0.42, this.half) + this.srad * 0.5) : R_WALK;
    const goP = this.plan(m, 'go', this.lw, fh.x, fh.z, fq.x, fq.z, rc, false, false, fl), backP = this.plan(m, 'back', this.lw, fq.x, fq.z, fh.x, fh.z, R_WALK, false, true, fl);
    // the root-space place at the end of the walk
    if (m.world) { q.x = fq.x; q.z = fq.z; } else this.rootXZ(m, fq, q);
    const home = this.tmp[1];
    m.home(home);
    let phase = 'hold', kk = 0, have = true;
    if (shell) {
      if (s === 'shell') { phase = k < 0.68 ? 'go' : 'place'; kk = phase === 'go' ? k / 0.68 : (k - 0.68) / 0.32; }
      else if (s === 'ram') { phase = 'back'; kk = ramp(k, 0.06, 0.94); have = false; }
      else if (s === 'cartridge' && k < 0.55) { phase = 'pick'; kk = k / 0.55; }
    } else if (s === 'cartridge') {
      phase = k < 0.42 ? 'go' : k < 0.74 ? 'place' : 'back';
      kk = phase === 'go' ? k / 0.42 : phase === 'place' ? (k - 0.42) / 0.32 : (k - 0.74) / 0.26;
      have = phase !== 'back';
    } else if (s === 'close' && k < 0.6) { phase = 'pick'; kk = k / 0.6; }
    if (this.rig.loadingStage && !shell && s === 'cartridge' && phase === 'back') { phase = 'place'; kk = 1; have = false; }
    const wy = this.workY, hy = home.y, move = travel(kk);
    const y = phase === 'go' ? lerp(hy, wy, goP.step >= 0 ? smooth(move * goP.len, goP.step - 0.3, goP.step + 0.1) : smooth(move, 0.6, 0.95))
      : phase === 'place' ? wy
      : phase === 'back' ? lerp(wy, hy, backP.step >= 0 ? smooth(move * backP.len, backP.step - 0.1, backP.step + 0.3) : smooth(move, 0.05, 0.4)) : hy;
    const face = headingOf(tgt.x - q.x, tgt.z - q.z);
    const lift = smooth(kk, 0.22, 0.92), release = phase === 'place' ? smooth(kk, 0.82, 1) : 0;
    switch (phase) {
      case 'go': m.follow(goP, move, y, have ? 'carryWalk' : 'walk', home.h, face); break;
      case 'place': m.put(q.x, y, q.z, face, release > 0.95 ? 'stand' : 'carry', 0); break;
      case 'back': m.follow(backP, move, y, 'walk', face, home.h); break;
      case 'pick': m.put(home.x, hy, home.z, home.h, 'lift', lift); break;
      default: m.put(home.x, hy, home.z, home.h, have ? 'carry' : 'stand', this.idleT + m.seed);
    }
    if (!have) { carry.visible = false; return; }
    // The carrier retains ownership until the whole shell rests on the tray. His hands then
    // withdraw while the round stays put; the next step starts from exactly that transform.
    const fx = -Math.sin(m.h), fz = -Math.cos(m.h), len = shell ? this.slen : this.bagLen;
    let cx = m.x + fx * 0.42, cy = y + 1.07, cz = m.z + fz * 0.42, yaw = m.h - Math.PI / 2, pitch = 0;
    if (phase === 'pick') {
      cy = y + lerp(0.45, 1.07, lift);
      cx = m.x + fx * lerp(0.48, 0.42, lift); cz = m.z + fz * lerp(0.48, 0.42, lift);
    } else if (phase === 'place') {
      if (shell) {
        // a round laid in the open breech (aT > -half: the leFH and sFH 18 have no tray) is lifted to the bore's height and
        // turned into line, brought onto the bore behind the face, then pushed in along it: a straight path from the
        // carrier's hands would cut through the cradle under the breech and sweep the nose through the ring
        const inB = this.aT > -this.half, aOut = -(this.half + 0.06);
        const e = smooth(kk, 0.06, inB ? 0.6 : 0.82), r = inB ? smooth(kk, 0.06, 0.36) : e, push = inB ? smooth(kk, 0.62, 0.82) : 0;
        this.trayAt(inB ? lerp(aOut, this.aT, push) : this.aT, _b);
        cx = lerp(cx, _b.x, e); cy = lerp(cy, _b.y, r); cz = lerp(cz, _b.z, e);
        yaw += wrapPi(this.az - yaw) * r;
        pitch = Math.asin(this.u.y) * r;
      } else {
        // Align outside the breech first, then push the entire charge through its face.
        const hb = len / 2 + 0.16, s1 = smooth(kk, 0.02, 0.38), s2 = smooth(kk, 0.4, 0.84);
        const a = lerp(-hb, len / 2 + 0.1, s2);
        const hx = this.B.x + this.u.x * a, hh = this.B.y + this.u.y * a + 0.05, hz = this.B.z + this.u.z * a;
        cx = lerp(cx, hx, s1); cy = lerp(cy, hh, s1); cz = lerp(cz, hz, s1);
        yaw += wrapPi(this.az - yaw) * s1;
        pitch = Math.asin(this.u.y) * s1;
      }
    }
    _c.set(cx, cy, cz);
    this.placeProp(carry, _c, yaw, pitch, shell || phase !== 'place' || kk < 0.86);
    // Grip at two actual points on the pitched round, with palms underneath it.
    const nx = -Math.sin(yaw) * Math.cos(pitch), ny = Math.sin(pitch), nz = -Math.cos(yaw) * Math.cos(pitch);
    const grip = (phase === 'pick' ? smooth(kk, 0, 0.2) : 1) * (this.rig.loadingStage && !shell && phase === 'place' ? 1 - smooth(kk, 0.36, 0.52) : 1 - release);
    for (const [side2, sg] of [['L', -1], ['R', 1]]) {
      m.hand(side2, cx + nx * len * 0.3 * sg, cy + ny * len * 0.3 * sg - this.srad * 0.85, cz + nz * len * 0.3 * sg, grip);
    }
  }

  stageRamMan(m, c, h) {
    const owner = m === this.staffOwner, on = this.staffA != null && (c.s === 'ram' || owner);
    const start = c.s === 'cartridge' ? -0.7 : this.aT - this.half;
    const shift = on ? this.staffA - start : 0;
    const active = on && (this.staffGrip ?? 0) > 0.02;
    const heading = this.az - Math.PI / 2;
    const stepping = active && ((c.s === 'ram' && c.k > 0.18 && c.k < 0.92) || c.s === 'cartridge');
    m.put(h.x + this.bd.x * shift, h.y, h.z + this.bd.z * shift, heading,
      stepping ? 'sidestep' : active ? 'ramLoad' : 'stand', stepping ? -shift / CREW_GAITS.sidestep.stride : active ? this.ramK : this.idleT + m.seed);
    if (!owner && !active) return;
    const hu = this.u.x * this.u.x + this.u.z * this.u.z || 1;
    const sm = ((h.x - this.T.x) * this.u.x + (h.z - this.T.z) * this.u.z) / hu;
    const d = Math.max(0.22, Math.min(this.staffLen - 0.22, start - (this.aT + sm)));
    const e = this.staffGrip ?? 0;
    for (const [hand, offset] of [['L', -0.17], ['R', 0.17]]) {
      const grip = owner && hand === 'R' ? 1 : smooth(e, 0.7, 0.99);
      const along = lerp(1.05, d + offset, e);
      _a.set(0, 0, along).applyMatrix4(this.staff.matrix);
      m.hand(hand, _a.x, _a.y, _a.z, grip);
    }
  }

  stageBreechMan(m, c, h) {
    const s = c.s, k = c.k;
    this.chargeRest.rotation.y = this.az;
    if (s === 'cartridge') return false;
    const work = s === 'open' || s === 'close' || s === 'prime' || s === 'lay';
    if (!work) {
      m.put(h.x, h.y, h.z, h.h, 'stand', this.idleT + m.seed);
      _c.set(h.x - this.rt.x * 0.42, h.y + 0.97055, h.z - this.rt.z * 0.42);
      this.placeProp(this.bag, _c, this.az, 0, true); return true;
    }
    let fromX = 1.05, fromZ = 3.9, toX = 0.82, toZ = 2.28, move = 1;
    if (s === 'open') move = travel(ramp(k, 0, 0.23)) * (1 - travel(ramp(k, 0.78, 1)));
    else if (s === 'close') { fromX = 0.58; fromZ = 2.1; move = travel(ramp(k, 0, 0.23)); }
    else if (s === 'prime') { fromX = 0.82; fromZ = 2.28; toX = 0.65; toZ = 2.25; move = travel(ramp(k, 0, 0.2)); }
    else { fromX = 0.65; fromZ = 2.25; toX = 1.05; toZ = 3.9; move = travel(ramp(k, 0, 0.4)); }
    const x = lerp(fromX, toX, move), z = lerp(fromZ, toZ, move), root = this.rootXZ(m, { x, z }, _pp2);
    this.grip.getWorldPosition(_a).applyMatrix4(_inv);
    if (s === 'prime') _a.set(this.B.x, this.B.y + 0.27, this.B.z + 0.36);
    const targetX = _a.x, targetY = _a.y, targetZ = _a.z;
    const moving = move > 0 && move < 1;
    const face = headingOf(targetX - root.x, targetZ - root.z);
    const direction = headingOf(toX - fromX, toZ - fromZ) + this.az;
    const turn = smooth(move, 0.72, 1), heading = moving ? direction + wrapPi(face - direction) * turn : s === 'lay' ? h.h : face;
    m.put(root.x, h.y, root.z, heading, moving ? 'walk' : s === 'lay' ? 'stand' : 'ramLoad', moving ? Math.hypot(toX - fromX, toZ - fromZ) * move / STRIDE : 0.6);
    const grip = s === 'prime' ? smooth(k, 0.2, 0.35) * (1 - smooth(k, 0.75, 1)) : s === 'open' || s === 'close' ? smooth(k, 0.23, 0.27) * (1 - smooth(k, 0.74, 0.78)) : 0;
    m.hand('R', targetX, targetY, targetZ, grip);
    if (s !== 'prime') m.hand('L', targetX, targetY - 0.08, targetZ + 0.08, grip);
    this.bag.visible = false;
    return true;
  }

  makeLoadingCart() {
    const cart = this.loadingCart = new THREE.Group();
    cart.name = 'crew-loading-cart'; cart.rotation.order = 'YXZ';
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b5639, roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x393d38, roughness: 0.65, metalness: 0.35 });
    const add = (parent, geometry, material, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    add(cart, new THREE.BoxGeometry(1.15, 0.1, 1.15), wood, 0, 0.32, 0);
    for (const side of [-1, 1]) {
      add(cart, new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8).rotateX(Math.PI / 2), iron, side * 0.39, 0.95, 0);
      for (const z of [-0.43, 0.43]) {
        // Broad wheelbase supports the high cradle on the loading ramp.
        add(cart, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12).rotateX(Math.PI / 2), iron, side * 0.55, 0.16, z);
        add(cart, new THREE.BoxGeometry(0.055, 0.63, 0.055), iron, side * 0.39, 0.63, z);
      }
    }
    const saddle = this.loadingSaddle = new THREE.Group(); cart.add(saddle);
    add(saddle, new THREE.BoxGeometry(0.56, 0.07, 1), wood, 0, -0.18, 0);
    for (const side of [-1, 1]) for (const z of [-0.3, 0.3]) add(saddle, new THREE.BoxGeometry(0.1, 0.08, 0.18), wood, side * 0.12, -0.1, z);
    add(cart, new THREE.CylinderGeometry(0.07, 0.07, 0.48, 8), iron, 0, 0.48, 0);
    this.loadingJack = add(cart, new THREE.CylinderGeometry(0.035, 0.035, 1, 8), iron, 0, 0.7, 0);
    this.loadingCrank = add(cart, new THREE.TorusGeometry(0.15, 0.017, 6, 16).rotateY(Math.PI / 2), iron, -0.45, 1.05, 0);
    this.rig.root.add(cart);
    const chargeRest = this.chargeRest = new THREE.Group(); this.rig.root.add(chargeRest);
    add(chargeRest, new THREE.BoxGeometry(0.4, 0.07, 0.55), wood, 0.63, 2.38, 3.9);
    for (const x of [0.48, 0.78]) for (const z of [3.72, 4.08]) add(chargeRest, new THREE.BoxGeometry(0.05, 0.8, 0.05), iron, x, 1.95, z);
    this.stageShell = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.stageRoute = newPoly(4);
  }

  // A screw-lift trolley supports the 130 kg round throughout the approach.
  // Both men push from its downhill side, clear of the tray; they steady the round
  // while rolling it from the raised saddle onto the open trough.
  stagePairMan(m, c) {
    const stage = this.rig.loadingStage, side = m.beh === 'pair0' ? -1 : 1;
    const A = stage.pickup, mid = stage.rampTop, end = this.toF(m, this.T.x, this.T.z, this.tmp[3]);
    end.z += 0;
    let phase = 'wait', progress = 0;
    if (c.s === 'shell') {
      phase = c.k < 0.24 ? 'lift' : c.k < 0.82 ? 'go' : 'place';
      progress = phase === 'lift' ? c.k / 0.24 : phase === 'go' ? (c.k - 0.24) / 0.58 : (c.k - 0.82) / 0.18;
    } else if (c.s === 'ram') { phase = 'back'; progress = ramp(c.k, 0.04, 0.94); }
    const path = this.stageRoute;
    path.n = 3;
    const back = phase === 'back', points = back ? [end, mid, A] : [A, mid, end];
    for (let i = 0; i < 3; i++) { path.x[i] = points[i].x; path.z[i] = points[i].z; }
    finishPoly(path);
    const rolling = phase === 'go' || phase === 'back', k = travel(progress);
    const C = this.tmp[2], heading = -Math.PI / 2;
    let distance = 0;
    if (rolling) {
      polyAt(path, k * path.len, _pt, headingOf, smooth, wrapPi);
      C.x = _pt.x; C.z = _pt.z; distance = _pt.d;
    } else if (phase === 'place') { C.x = end.x; C.z = end.z; }
    else { C.x = A.x; C.z = A.z; }
    const cx = C.x, cz = C.z, fx = cx - stage.crewSide, fz = cz + stage.crewSpacing * side;
    const y = stage.floorAt(fx, fz), world = this.rootXZ(m, { x: fx, z: fz }, _pp2);
    const moving = rolling && k > 0 && k < 1;
    const dx = (stage.floorAt(fx + 0.06, fz) - stage.floorAt(fx - 0.06, fz)) / 0.12;
    const dz = (stage.floorAt(fx, fz + 0.06) - stage.floorAt(fx, fz - 0.06)) / 0.12;
    const slope = m.stageSlope ??= { x: 0, z: 0 };
    slope.x = dx * Math.cos(heading) - dz * Math.sin(heading); slope.z = dx * Math.sin(heading) + dz * Math.cos(heading);
    const gaitT = (back ? -1 : 1) * distance / CSTRIDE;
    m.put(world.x, y, world.z, heading + this.az, phase === 'lift' ? 'operate' : moving ? 'carryWalk' : phase === 'place' ? 'carry' : 'stand', moving ? gaitT : phase === 'lift' ? progress * 3 : 0, slope);
    const root = this.rootXZ(m, C, _pp3), yaw = this.az;
    if (side < 0) {
      // Solve wheel contact over the two ramp joins as well as on its straight slope.
      let grade = 0, floor = stage.floorAt(cx, cz);
      for (let j = 0; j < 5; j++) {
        const cc = Math.cos(grade), ss = Math.sin(grade);
        const lo = stage.floorAt(cx - 0.55 * cc - 0.16 * ss, cz), hi = stage.floorAt(cx + 0.55 * cc - 0.16 * ss, cz);
        grade = Math.asin(Math.min(0.7, Math.max(-0.7, (hi - lo) / 1.1)));
        floor = (hi + lo) / 2 + 0.16 * (1 - Math.cos(grade));
      }
      const cart = this.loadingCart;
      cart.visible = this.level > 0; cart.position.set(root.x, floor, root.z); cart.rotation.set(0, yaw, grade); cart.updateMatrix();
      const raised = phase === 'lift' ? smooth(progress, 0.18, 0.9) : phase === 'go' || phase === 'place' ? 1 : phase === 'back' ? 1 - smooth(progress, 0.7, 1) : 0;
      const seat = lerp(0.65, 1.32, raised);
      this.loadingSaddle.position.y = seat;
      this.loadingJack.position.y = (0.4 + seat - 0.19) / 2; this.loadingJack.scale.y = seat - 0.59;
      this.loadingCrank.rotation.x = raised * Math.PI * 6;
      const ps = this.stageShell;
      _a.set(0, seat, 0).applyMatrix4(cart.matrix);
      ps.x = _a.x; ps.y = _a.y; ps.z = _a.z; ps.yaw = yaw; ps.pitch = 0;
      const visible = c.s === 'shell' || phase === 'wait' && !c.loaded && !['cartridge', 'close', 'prime', 'lay'].includes(c.s);
      if (phase === 'place') {
        const transfer = smooth(progress, 0.08, 0.78);
        ps.x = lerp(ps.x, this.T.x, transfer); ps.y = lerp(ps.y, this.T.y, transfer); ps.z = lerp(ps.z, this.T.z, transfer);
        ps.pitch = Math.asin(this.u.y) * transfer;
      }
      _c.set(ps.x, ps.y, ps.z); this.placeProp(this.shellA, _c, ps.yaw, ps.pitch, visible);
    }
    if (phase === 'place') {
      const ps = this.stageShell, grip = 1 - smooth(progress, 0.8, 1);
      const nx = -Math.sin(ps.yaw) * Math.cos(ps.pitch), ny = Math.sin(ps.pitch), nz = -Math.cos(ps.yaw) * Math.cos(ps.pitch);
      for (const [hand, dd] of [['L', -0.11], ['R', 0.11]]) {
        const d = -side * 0.3 - dd;
        m.hand(hand, ps.x - Math.cos(ps.yaw) * this.srad + nx * d, ps.y - 0.05 + ny * d, ps.z + Math.sin(ps.yaw) * this.srad + nz * d, grip);
      }
    } else if (rolling || phase === 'lift') {
      const grip = phase === 'lift' ? smooth(progress, 0, 0.12) : 1;
      for (const [hand, d] of [['L', -0.15], ['R', 0.15]]) {
        if (phase === 'lift' && side < 0 && hand === 'R') {
          const a = smooth(progress, 0.18, 0.9) * Math.PI * 6;
          _a.set(-0.45, 1.05 + Math.cos(a) * 0.15, Math.sin(a) * 0.15);
        } else _a.set(-0.39, 0.95, side * stage.crewSpacing + d);
        _a.applyMatrix4(this.loadingCart.matrix); m.hand(hand, _a.x, _a.y, _a.z, grip);
      }
    }
  }

  // the two carriers of the 9.2-inch: the pair walks one route (planned for both, 0.84 m apart) from the stack
  // to the rear end of the tray, the shell hanging between them
  pairMan(m, c, h) {
    const side = m.beh === 'pair0' ? -1 : 1, F = this.field, lead = this.pairLead ??= this.men.find((q) => /^pair/.test(q.beh));
    const s = c.s, k = c.k, tgt = this.trayAt(this.aT, _a), ca = this.tmp[3], cb = this.tmp[4], tf = this.tmp[5], C = this.tmp[2];
    // the pair's centre at the stack, and behind the tray's rear end, moved clear of the steel
    this.toF(lead, this.S.x + 0.1, this.S.z + 0.25, ca);
    this.blockers(lead);
    const fl = F.hasComb ? 'comb' : 'work', la = F.hasComb ? this.lw : this.l0;
    this.toF(lead, this.S.x, this.S.z, _pp);
    this.snapPair(fl, la, ca, headingOf(_pp.x - ca.x, _pp.z - ca.z));
    this.toF(lead, tgt.x - this.bd.x * 0.18, tgt.z - this.bd.z * 0.18, cb);
    this.toF(lead, tgt.x, tgt.z, tf);
    this.snapPair(fl, this.lw, cb, headingOf(tf.x - cb.x, tf.z - cb.z));
    { // where the two stand at the tray, for the rammers to keep clear of
      const hb = headingOf(tf.x - cb.x, tf.z - cb.z), bk = this.pairBk ??= [[0, 0, 0.3], [0, 0, 0.3]];
      bk[0][0] = cb.x - Math.cos(hb) * 0.42; bk[0][1] = cb.z + Math.sin(hb) * 0.42; bk[1][0] = cb.x + Math.cos(hb) * 0.42; bk[1][1] = cb.z - Math.sin(hb) * 0.42;
    }
    // the last metre runs straight up the tray's axis, so the pair arrives side on to the tray
    const wp = this.tmp[1];
    wp.x = cb.x - (tf.x - cb.x) / (Math.hypot(tf.x - cb.x, tf.z - cb.z) || 1) * 1.1; wp.z = cb.z - (tf.z - cb.z) / (Math.hypot(tf.x - cb.x, tf.z - cb.z) || 1) * 1.1;
    const goP = this.plan(lead, 'go', this.lw, ca.x, ca.z, wp.x, wp.z, 0.8, false, false, fl, 0.5, { x: cb.x, z: cb.z }), backP = this.plan(lead, 'back', this.lw, cb.x, cb.z, ca.x, ca.z, 0.8, false, true, fl, 0.5, { x: wp.x, z: wp.z, head: true });
    backP.x[0] = cb.x; backP.z[0] = cb.z;
    let kk = 0, phase = 'wait';
    if (s === 'shell') { phase = k < 0.14 ? 'lift' : k < 0.84 ? 'go' : 'place'; kk = phase === 'go' ? (k - 0.14) / 0.7 : phase === 'place' ? (k - 0.84) / 0.16 : k / 0.14; }
    else if (s === 'ram') { phase = 'back'; kk = ramp(k, 0.04, 0.72); }
    if (phase === 'go' || phase === 'back') kk = travel(kk);
    // floor under them: up onto the platform where the route crosses its edge, down again on the way back
    const wy = h.y;
    let y = 0;
    if (phase === 'go') y = goP.step >= 0 ? wy * smooth(kk * goP.len, goP.step - 0.3, goP.step + 0.1) : wy * smooth(kk, 0.6, 0.95);
    else if (phase === 'place') y = wy;
    else if (phase === 'back') y = backP.step >= 0 ? wy * (1 - smooth(kk * backP.len, backP.step - 0.1, backP.step + 0.3)) : wy * (1 - smooth(kk, 0.05, 0.4));
    // the centre (field frame) and its heading, then the man 0.42 m to his side of it
    let hd, moving = false, dist = 0;
    if (phase === 'go' || phase === 'back') {
      const P = phase === 'go' ? goP : backP;
      polyAt(P, kk * P.len, _pt, headingOf, smooth, wrapPi);
      C.x = _pt.x; C.z = _pt.z; hd = _pt.h;
      this.toF(lead, this.S.x, this.S.z, _pp);
      const atStack = headingOf(_pp.x - ca.x, _pp.z - ca.z), atTray = headingOf(tf.x - cb.x, tf.z - cb.z);
      const start = phase === 'go' ? atStack : atTray, end = phase === 'go' ? atTray : atStack;
      hd = start + wrapPi(hd - start) * smooth(kk, 0, 0.12);
      hd += wrapPi(end - hd) * smooth(kk, 0.88, 1);
      moving = kk > 0 && kk < 1 && P.len > 0.05; dist = _pt.d;
    } else if (phase === 'place') { C.x = cb.x; C.z = cb.z; hd = headingOf(tf.x - cb.x, tf.z - cb.z); } else {
      C.x = ca.x; C.z = ca.z;
      this.toF(lead, this.S.x, this.S.z, _pp);
      hd = headingOf(_pp.x - ca.x, _pp.z - ca.z);
    }
    const fx = C.x + Math.cos(hd) * 0.42 * side, fz = C.z - Math.sin(hd) * 0.42 * side, rot = !m.world;
    const rr = this.rootXZ(m, { x: fx, z: fz }, _pp2), rx = rr.x, rz = rr.z, rh = rot ? hd + this.az : hd;
    const pose = phase === 'lift' ? 'lift' : phase === 'go' ? 'carryWalk' : phase === 'place' ? 'carry' : phase === 'back' ? 'walk' : 'stand';
    const gait = phase === 'go' ? CSTRIDE : STRIDE;
    m.put(rx, y, rz, rh, pose, moving ? dist / gait : phase === 'wait' ? this.idleT + m.seed : phase === 'lift' ? smooth(kk, 0.3, 1) : 0);
    // the shell hangs between the two (drawn once, by the left man) at their midpoint
    if (side < 0) {
      const rm = this.rootXZ(m, C, _pp3), mx = rm.x, mz = rm.z, mh = rot ? hd + this.az : hd;
      let cx, cy, cz, yaw = mh, pitch = 0, vis = true;
      if (phase === 'wait' || phase === 'back' || phase === 'lift') {
        if (phase === 'back' || (phase === 'wait' && c.loaded) || s === 'prime' || s === 'lay' || s === 'close' || s === 'cartridge') vis = false;
        cx = this.S.x; cy = 0.2 + this.srad; cz = this.S.z + 0.2; yaw = 0; // lying on the ground
        if (phase === 'lift') { const e = smooth(kk, 0.3, 1); cy = lerp(cy, y + 0.9, e); cx = lerp(cx, mx, e); cz = lerp(cz, mz, e); yaw = wrapPi(mh) * e; }
      } else {
        cx = mx; cy = y + 0.9; cz = mz;
        if (phase === 'place') {
          // lifted to just above the tray first, then carried onto it and set down: from the carry height (below the
          // bore) a straight line ran the round up through the tray's rear end
          const e = smooth(kk, 0.3, 0.78), up = smooth(kk, 0.04, 0.34), down = smooth(kk, 0.74, 0.86);
          cx = lerp(cx, tgt.x, e); cz = lerp(cz, tgt.z, e);
          cy = lerp(cy, tgt.y + 0.05, up) - 0.05 * down;
          yaw += wrapPi(this.az - yaw) * e;
          pitch = Math.asin(this.u.y) * e;
          // Keep it on the tray through the step boundary; the rammer takes over next.
        }
      }
      _c.set(cx, cy, cz);
      this.placeProp(this.shellA, _c, yaw, pitch, vis);
      this.pairShell = { x: cx, y: cy, z: cz, yaw, pitch };
    }
    const ps = this.pairShell;
    if (ps && (phase === 'go' || phase === 'place' || phase === 'lift')) {
      const nx = -Math.sin(ps.yaw) * Math.cos(ps.pitch), ny = Math.sin(ps.pitch), nz = -Math.cos(ps.yaw) * Math.cos(ps.pitch), sx = Math.cos(ps.yaw), sz = -Math.sin(ps.yaw);
      const grip = phase === 'lift' ? smooth(kk, 0, 0.3) : phase === 'place' ? 1 - smooth(kk, 0.8, 1) : 1;
      m.hand('L', ps.x + sx * side * this.srad * 1.1 - nx * 0.2, ps.y - 0.05 - ny * 0.2, ps.z + sz * side * this.srad * 1.1 - nz * 0.2, grip);
      m.hand('R', ps.x + sx * side * this.srad * 1.1 + nx * 0.2, ps.y - 0.05 + ny * 0.2, ps.z + sz * side * this.srad * 1.1 + nz * 0.2, grip);
    }
  }

  // move a pair's centre until both men, 0.42 m either side of it, stand clear
  snapPair(fl, l, c, hd) {
    const F = this.field, ox = Math.cos(hd) * 0.42, oz = -Math.sin(hd) * 0.42;
    const ok = (x, z) => F.free(fl, l, x + ox, z + oz, R_STAND) && F.free(fl, l, x - ox, z - oz, R_STAND);
    if (ok(c.x, c.z)) return;
    for (let r = 0.05; r < 3; r += 0.05) {
      const n = Math.max(8, Math.ceil(r * 40));
      for (let a = 0; a < n; a++) {
        const x = c.x + Math.cos((a / n) * 6.2832) * r, z = c.z + Math.sin((a / n) * 6.2832) * r;
        if (ok(x, z)) { c.x = x; c.z = z; return; }
      }
    }
  }

  rootXZ(m, f, out) {
    if (m.world) { out.x = f.x; out.z = f.z; } else { const dx = f.x - this.pvx, dz = f.z - this.pvz; out.x = dx * this.ca + dz * this.sa + this.pvx; out.z = -dx * this.sa + dz * this.ca + this.pvz; }
    return out;
  }

  mate(m) {
    return this.men.find((q) => q !== m && /^pair/.test(q.beh));
  }

  // loaders at the tray of the crane / trolley guns: hands steady the shell as it comes down
  guideMan(m, c, h) {
    if (this.kind === 'rail' && m.beh === 'guide0' && (c.s === 'cartridge' || (c.s === 'close' && c.k < 0.35))) return this.carryMan(m, c, h, 'bag');
    m.put(h.x, h.y, h.z, h.h, 'stand', this.idleT + m.seed);
    const side = m.beh === 'guide0' ? -1 : 1;
    if (c.s === 'shell' && c.k > 0.6 && c.k < 1.0) {
      const w = smooth(c.k, 0.6, 0.72) * (1 - smooth(c.k, 0.96, 1));
      this.trayAt(this.aT, _a);
      m.hand('R', _a.x + this.rt.x * side * this.srad * -1, _a.y + 0.05, _a.z - this.bd.z * 0.35, w);
      m.hand('L', _a.x + this.rt.x * side * this.srad * -1, _a.y + 0.05, _a.z + this.bd.z * 0.35, w);
    }
  }

  craneMan(m, c, h) {
    m.put(h.x, h.y, h.z, h.h, 'stand', this.idleT + m.seed);
  }

  // ---------------------------------------------------------------- mechanisms and props
  mechanisms(c) {
    if (ww1Mechanisms(this, c)) return;
    if (heavyMechanisms(this, c)) return;
    const rig = this.rig;
    if (rig.loadingStage && (c.s === 'open' || c.s === 'close')) {
      const swing = smooth(c.k, 0.27, 0.74); rig.setBreech(c.s === 'open' ? swing : 1 - swing);
    }
    if (this.kind === 'gustav') this.liftMech(c);
    if (this.crane) {
      const rest = rig.craneRest ?? Math.PI;
      // a crane that rides a traversing carriage (the Bertha's) moves its rest and its pick-up with it
      if (rig.craneRest != null) this.pick.set(this.cp.x - this.R * Math.cos(rest), this.pick.y, this.cp.z + this.R * Math.sin(rest));
      let a = rest, y = this.restHoist;
      const lowY = this.lowHoist;
      const T = this.trayAt(this.aT, _a);
      const aT = Math.atan2(T.z - this.cp.z, -(T.x - this.cp.x));
      const yT = T.y + this.hang;
      this.craneMode = 'idle';
      if (c.s === 'shell') {
        const k = c.k;
        if (k < 0.15) { y = lerp(this.restHoist, lowY, smooth(k, 0, 0.15)); this.craneMode = 'ground'; }
        else if (k < 0.27) { y = lowY; this.craneMode = 'ground'; }
        else if (k < 0.42) { y = lerp(lowY, this.restHoist, smooth(k, 0.27, 0.42)); this.craneMode = 'hang'; }
        else if (k < 0.74) { a = rest + wrapPi(aT - rest) * smooth(k, 0.42, 0.74); a = rest + (aT - rest) * smooth(k, 0.42, 0.74); this.craneMode = 'hang'; }
        else { a = aT; y = lerp(this.restHoist, yT, smooth(k, 0.74, 0.95)); this.craneMode = k < 0.95 ? 'hang' : 'tray'; if (k >= 0.95) y = yT + 0.4 * smooth(k, 0.95, 1); }
      } else if (c.s === 'ram') {
        const k = c.k;
        a = lerp(aT, rest, smooth(k, 0.1, 0.6));
        y = lerp(yT + 0.4, this.restHoist, smooth(k, 0, 0.2));
        this.craneMode = 'tray';
      }
      this.craneA = a; this.craneY = y; this.craneAT = aT; this.craneYT = yT;
      this.crane.rotation.y = a;
      this.hoist.position.y = y;
    }
    if (this.trolley) {
      let z = this.trolleyRear;
      const T = this.trayAt(this.aT, _a);
      // the trolley runs forward with the shell, then back
      if (c.s === 'shell') z = lerp(this.trolleyRear, this.restTrolley - 3.0, smooth(c.k, 0.35, 0.85));
      else if (c.s === 'ram') z = lerp(this.restTrolley - 3.0, this.trolleyRear, smooth(c.k, 0.1, 0.6));
      this.trolley.position.z = z;
      void T;
    }
    rig.update?.(0.016);
  }

  props(c) {
    const rig = this.rig;
    if (DE_PROPS[this.kind]) { DE_PROPS[this.kind](this, c); return; } // the Nebelwerfer's rockets (crews_de.js)
    // never the rig's own tray props: the choreography draws its own shell
    rig.setShell?.('tray', false);
    rig.setShell?.('crane', false);
    rig.setShell?.('trolley', false);
    rig.setShell?.('cartridge', false);
    if (ww1Props(this, c)) return;
    if (heavyProps(this, c)) return;
    const A = this.shellA;
    if (this.kind === 'gustav') this.liftShells(c);
    else if (this.crane) this.craneShells(c);
    else if (this.kind === 'rail') this.railShells(c);
    else if (c.s === 'ram' && this.shellA_a != null) {
      // being rammed home along the tray
      this.trayAt(this.shellA_a, _c);
      this.placeProp(A, _c, this.az, Math.asin(this.u.y), c.k < 0.82);
    }
    // state() has placed the staff before the hands; it remains in its owner's grasp at rest.
    this.staff.visible = !!this.staffOwner && this.level > 0;
  }

  craneShells(c) {
    const A = this.shellA, B = this.shellB;
    const mode = this.craneMode;
    // the shell lying at the pickup point
    const showGround = !(c.s === 'shell' && c.k > 0.27) && !['ram', 'cartridge', 'close'].includes(c.s);
    _c.copy(this.pick);
    this.placeProp(B, _c, Math.PI / 2 + 0.0, 0, showGround && mode !== 'hang');
    B.rotation.set(0, this.rig.pickYaw ?? 0, 0); // (the Karl's lie across its carrier's hold)
    if (mode === 'hang' || mode === 'ground') {
      // hang under the hook, offset toward the tray at the end of the lowering
      const a = this.craneA, y = this.craneY;
      _a.set(this.cp.x - this.R * Math.cos(a), y - this.hang, this.cp.z + this.R * Math.sin(a));
      let pitch = 0, yaw = a;
      if (c.s === 'shell' && c.k > 0.74) {
        const e = smooth(c.k, 0.8, 0.95);
        this.trayAt(this.aT, _b);
        _a.lerp(_b, e);
        pitch = Math.asin(this.u.y) * e;
        yaw = lerp(a, this.az, e);
      }
      if (mode === 'ground') A.visible = false; else this.placeProp(A, _a, yaw, pitch, true);
    } else if (mode === 'tray') {
      const aa = c.s === 'ram' && this.shellA_a != null ? this.shellA_a : this.aT;
      this.trayAt(aa, _c);
      this.placeProp(A, _c, this.az, Math.asin(this.u.y), !(c.s === 'ram' && c.k > 0.82));
    } else A.visible = false;
  }

  // ---------------------------------------------------------------- the 80 cm Gustav (kind 'gustav' only)
  // Its shell comes from the wagon coupled behind (anchors.shellStack) into the shell lift's cage at the rear
  // left (pivot hoist, rig.hoistRange.down at the wagon's deck), up to the platform, across on the transfer
  // trolley to the middle (anchors.liftMid), forward along the platform and onto the tray; the charge lift on
  // the right (hoist2) goes down and comes back up with the cartridges meanwhile. 'shell' step k:
  // 0-0.12 cage down, 0.12-0.3 the shell rolled in, 0.3-0.55 up, 0.55-0.7 across, 0.7-1 forward onto the tray.
  liftMech(c) {
    const H2 = this.rig.pivots.hoist2, up = this.restHoist, dn = this.lowHoist;
    let y = up, y2 = up;
    if (c.s === 'shell') {
      const k = c.k;
      y = k < 0.12 ? lerp(up, dn, smooth(k, 0, 0.12)) : k < 0.3 ? dn : lerp(dn, up, smooth(k, 0.3, 0.55));
      y2 = up - (up - dn) * (smooth(k, 0.08, 0.25) - smooth(k, 0.6, 0.85));
    }
    this.hoist.position.y = y;
    if (H2) H2.position.y = y2;
  }

  liftMan(m, c, h) {
    const k = c.s === 'shell' ? c.k : -1;
    let on;
    if (m.beh === 'shove') on = k > 0.12 && k < 0.3;
    else if (m.beh === 'liftL') on = (k >= 0 && k < 0.12) || (k > 0.3 && k < 0.7);
    else on = (k > 0.08 && k < 0.25) || (k > 0.6 && k < 0.85) || (c.s === 'cartridge' && c.k < 0.3);
    const pose = on ? (m.beh === 'shove' ? 'push' : 'operate') : 'stand';
    m.put(h.x, h.y, h.z, h.h, pose, on ? c.now * 1.2 : this.idleT + m.seed);
  }

  liftShells(c) {
    const A = this.shellA, B = this.shellB, s = c.s, k = c.k, rig = this.rig;
    // the shell's heading on the wagon (it stands on the curve, turned a little from the gun's axis)
    _a.set(0, 0, -1).transformDirection(rig.anchors.shellStack.matrixWorld).transformDirection(_inv);
    const wy = headingOf(_a.x, _a.z);
    const waiting = !(s === 'shell' && k > 0.12) && s !== 'ram' && s !== 'cartridge' && s !== 'close' && s !== 'prime' && !c.loaded;
    this.placeProp(B, this.S, wy, 0, waiting);
    if (s === 'ram' && this.shellA_a != null) {
      this.trayAt(this.shellA_a, _c);
      this.placeProp(A, _c, this.az, Math.asin(this.u.y), k < 0.82);
      return;
    }
    if (s !== 'shell' || k <= 0.12) { A.visible = false; return; }
    this.hoist.getWorldPosition(_a).applyMatrix4(_inv);
    _a.y -= this.hang; // the shell's middle in the cage
    let yaw = this.az, pitch = 0;
    if (k < 0.3) {
      const e = smooth(k, 0.14, 0.28);
      _c.copy(this.S).lerp(_a, e);
      yaw = wy + wrapPi(this.az - wy) * e;
    } else if (k < 0.55) _c.copy(_a);
    else {
      rig.anchors.liftMid.getWorldPosition(_b).applyMatrix4(_inv);
      if (k < 0.7) _c.copy(_a).lerp(_b, smooth(k, 0.57, 0.7));
      else {
        const T = this.trayAt(this.aT, _a), e = smooth(k, 0.72, 0.97), r = smooth(k, 0.88, 0.97);
        _c.set(lerp(_b.x, T.x, e), lerp(_b.y, T.y, r), lerp(_b.z, T.z, e));
        pitch = Math.asin(this.u.y) * r;
      }
    }
    this.placeProp(A, _c, yaw, pitch, true);
  }

  railShells(c) {
    const A = this.shellA, B = this.shellB;
    const tz = this.trolley ? this.trolley.position.z : 0;
    this.trolley?.updateWorldMatrix(true, false);
    if (c.s === 'ram' && this.shellA_a != null) {
      this.trayAt(this.shellA_a, _c);
      this.placeProp(A, _c, this.az, Math.asin(this.u.y), c.k < 0.82);
    } else if (this.trolley && (c.s === 'shell' || (c.s !== 'ram' && c.s !== 'cartridge' && c.s !== 'close' && !c.loaded))) {
      // the next round rides the trolley
      _c.set(0, 0.2, 0);
      this.trolley.localToWorld(_c).applyMatrix4(_inv);
      const k = c.s === 'shell' ? smooth(c.k, 0.8, 1) : 0;
      if (c.s === 'shell' && c.k >= 0.92) {
        this.trayAt(this.aT, _b);
        _c.lerp(_b, smooth(c.k, 0.92, 1));
        this.placeProp(A, _c, this.az, Math.asin(this.u.y) * smooth(c.k, 0.92, 1), true);
      } else this.placeProp(A, _c, this.az, 0, true);
      void k; void tz;
    } else A.visible = false;
    B.visible = false;
  }
}

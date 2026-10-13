import * as THREE from 'three';
import { buildCrewman, CREW_POSES, CREW_GAITS } from '../models/v/crew.js';
import { buildShell, buildCartridge } from '../models/shells.js';
import { GUNS, STEP } from '../sim/tables.js';
import { ramp, smooth, lerp, wrapPi, headingOf, clamp01 } from './anim.js';
import { CrewField, newPoly, polyAt, finishPoly } from './crewfield.js';

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
const FALLBACK = { ram: 'push', lay: 'operate', lanyard: 'stand', ears: 'stand', point: 'stand', phone: 'stand', haul: 'push', dead: 'stand' };
const STRIDE = CREW_GAITS.walk.stride, CSTRIDE = CREW_GAITS.carryWalk.stride;

const ROLES = {
  bl6: { officer: 'cmd', layer: 'lay', sight: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan', ears: 'idle' },
  bl60: { officer: 'cmd', layer: 'lay', sight: 'wheel', loader: 'breech', rammer: 'ram', shell: 'carry', cartridge: 'bag', lanyard: 'lan', ears: 'idle' },
  bl92: { sergeant: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'pair0', loader2: 'pair1', rammer1: 'ram', rammer2: 'ram', ammo1: 'idle', ammo2: 'bag' },
  bl15: { sergeant: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1', rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram', crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'bag' },
  rail: { sergeant: 'cmd', layer: 'lay', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1', rammer1: 'ram', rammer2: 'ram', trolley1: 'trolley', crane: 'winch', ammo1: 'sling' },
};
// roles that stay in the world frame (the rest turn with the gun's traverse)
const WORLD_ROLES = new Set(['crane1', 'crane2', 'ammo1', 'ammo2', 'crane', 'shell', 'cartridge']);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _y = new THREE.Vector3(0, 1, 0);
const _pt = { x: 0, z: 0, h: 0, d: 0 };
const R_STAND = 0.3, R_WALK = 0.3;
const _pp = { x: 0, z: 0 };

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
    this.world = (WORLD_ROLES.has(spot.role) && crew.kind !== 'bl6' && crew.kind !== 'bl60') || /sergeant|officer|ears/.test(spot.role);
    const o = crewOutfit(spot.role, idx);
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
      out.x = this.sx * c.ca + this.sz * c.sa;
      out.z = -this.sx * c.sa + this.sz * c.ca;
      out.h = s.heading + c.az;
    }
    out.y = s.y;
    return out;
  }

  put(x, y, z, h, pose, t = 0) {
    const c = this.crew;
    if (c.ears > 0.01 && !this.noEars) {
      h += wrapPi(c.az + Math.PI - h) * 0.75 * c.ears;
      if (c.ears > 0.5) pose = 'ears';
    }
    this.x = x; this.y = y; this.z = z; this.h = h;
    this.root.position.set(x, y, z);
    this.root.rotation.y = h;
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
  follow(poly, k, y, gait = 'walk') {
    const c = this.crew, d = clamp01(k) * poly.len;
    polyAt(poly, d, _pt, headingOf, smooth, wrapPi);
    const rot = !this.world, moving = k > 0 && k < 1 && poly.len > 0.05;
    const x = rot ? _pt.x * c.ca + _pt.z * c.sa : _pt.x, z = rot ? -_pt.x * c.sa + _pt.z * c.ca : _pt.z, h = rot ? _pt.h + c.az : _pt.h;
    this.put(x, y, z, h, moving ? gait : (gait === 'carryWalk' ? 'carry' : 'stand'), moving ? d / (gait === 'carryWalk' ? CSTRIDE : STRIDE) : c.idleT + this.seed);
  }

  // put the grip point of a hand on a root-space point (after put)
  hand(side, x, y, z, w = 1) {
    if (w <= 0.01 || this.crew.level < 2) return;
    const dx = x - this.x, dz = z - this.z, ch = Math.cos(this.h), sh = Math.sin(this.h), sc = 1 / this.root.scale.x;
    _a.set((dx * ch - dz * sh) * sc, (y - this.y) * sc, (dx * sh + dz * ch) * sc);
    this.fig.reach(side, _a, Math.min(1, w));
  }

  hide() {
    this.root.visible = false;
  }
}

function crewOutfit(role, i) {
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
    this.ears = 0;
    this.az = 0; this.ca = 1; this.sa = 0;
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
    const staffLen = { bl6: 1.7, bl60: 1.8, bl92: 2.6, bl15: 3.4, rail: 3.0 }[kind] ?? 2;
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
  }

  setup() {
    const rig = this.rig;
    this.crane = rig.pivots.crane ?? null;
    this.hoist = rig.pivots.hoist ?? null;
    this.trolley = rig.pivots.trolley ?? null;
    if (this.crane) {
      this.R = -this.hoist.position.x;
      this.cp = this.crane.position;
      // the ground shell sits where the hook can reach it (jib turned to PI)
      this.pick = new THREE.Vector3(this.cp.x + this.R, 0.52, this.cp.z);
    }
    this.restHoist = rig.hoistRange?.up ?? 3.6;
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
      if (m.beh === 'bag' && m.world) {
        // the cordite man waits by the cartridge crates of the pit
        const cr = F.pit.filter((b) => b.name === 'crate');
        if (cr.length) { tx = cr.reduce((a, b) => a + (b.x0 + b.x1) / 2, 0) / cr.length; tz = cr.reduce((a, b) => a + (b.z0 + b.z1) / 2, 0) / cr.length - 0.9; }
      }
      F.snapHome(m.li, tx, tz, m.spot.pose === 'crouch' ? 0.4 : R_STAND, out, m.world);
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
      if (!m.world) { x = m.sx * ca + m.sz * sa; z = -m.sx * sa + m.sz * ca; }
      if (!except.world) { k[0] = x * ca - z * sa; k[1] = x * sa + z * ca; } else { k[0] = x; k[1] = z; }
      b.push(k);
    }
    return b;
  }

  // to and from the field frame (the gun's traverse frame for the men that turn with it)
  toF(m, x, z, out) {
    if (m.world) { out.x = x; out.z = z; } else { out.x = x * this.ca - z * this.sa; out.z = x * this.sa + z * this.ca; }
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
    if (level <= 0) return;
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
    // casualties: the last men of the list leave the gun
    const casualties = Math.max(0, p.crewMax - p.crew);
    for (let i = 0; i < this.men.length; i++) {
      const m = this.men[i];
      const gone = p.state === 'dead' || i >= this.men.length - casualties;
      if (gone) { m.hide(); continue; }
      m.root.visible = true;
      this.act(m, c);
    }
    this.mechanisms(c);
    this.props(c);
  }

  // shell and staff state shared by the roles, once per frame
  state(c) {
    const s = c.s, k = c.k;
    // axial position of the shell's middle while it is on the tray (negative: behind the breech)
    let a = null; // the shell A on the tray / in the bore
    const aEnd = this.half * 0.55; // fully in, its base just inside the breech face
    this.shellOnTray = false;
    this.ramK = 0; // 0..1 of the stroke
    if (s === 'ram') {
      this.shellOnTray = true;
      this.ramK = smooth(k, 0.08, 0.78);
      a = lerp(this.aT, aEnd, this.ramK);
    }
    this.shellA_a = a;
    // rammer staff head (the shell's base while ramming)
    this.staffA = null;
    if (s === 'ram') this.staffA = (a ?? this.aT) - this.half - (k > 0.8 ? 0.9 * smooth(k, 0.8, 1) : 0) + (k > 0.8 ? 0 : 0);
    else if (s === 'cartridge') {
      const push = smooth(c.k, 0.55, 0.72) - smooth(c.k, 0.78, 0.95);
      if (c.k > 0.5 && c.k < 0.97 && this.kind !== 'bl6' && this.kind !== 'bl60') this.staffA = lerp(-0.7, 0.1, push);
    }
  }

  // ---------------------------------------------------------------- roles
  act(m, c) {
    const h = this.tmp[0];
    m.home(h);
    const p = c.p, s = c.s, k = c.k;
    m.noEars = false;
    const moving = Math.abs(p.cmd.az - p.az) > 3e-4 || Math.abs(p.cmd.el - p.el) > 3e-4 || s === 'lay' || s === 'depress';
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
      case 'ram': this.ramMan(m, c, h); break;
      case 'carry': this.carryMan(m, c, h, 'shell'); break;
      case 'bag': this.carryMan(m, c, h, 'bag'); break;
      case 'pair0': case 'pair1': this.pairMan(m, c, h); break;
      case 'guide0': case 'guide1': this.guideMan(m, c, h); break;
      case 'winch': case 'signal': case 'sling': case 'trolley': this.craneMan(m, c, h); break;
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
    m.put(h.x, h.y, h.z, h.h, 'stand', this.idleT + m.seed);
    if (open) {
      this.grip.getWorldPosition(_a).applyMatrix4(_inv);
      m.hand('R', _a.x, _a.y, _a.z, 1);
      m.hand('L', _a.x, _a.y - 0.1, _a.z + 0.1, 0.9);
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
    if (c.s === 'ram') adv = this.ramK * (this.half * 0.55 - this.aT) * 0.9 * (1 - smooth(c.k, 0.8, 1));
    else if (c.s === 'cartridge' && on) adv = 0.25 * smooth(c.k, 0.55, 0.72) * (1 - smooth(c.k, 0.78, 0.95));
    // with a pair carrying the shell to the rear of the tray the rammers give them room
    let back = 0;
    if (this.pairLead && this.pairBk) {
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
    m.put(h.x + this.bd.x * adv, h.y, h.z + this.bd.z * adv, h.h, on ? 'ram' : 'stand', on ? c.k * 2 : this.idleT + m.seed);
    if (on) {
      // both hands on the shaft, at the part of it nearest the man
      const hu = this.u.x * this.u.x + this.u.z * this.u.z || 1;
      const sm = ((m.x - this.T.x) * this.u.x + (m.z - this.T.z) * this.u.z) / hu; // his axial place along the tray line
      const d = Math.max(0.5, Math.min(this.staffLen - 0.9, this.staffA - (this.aT + sm)));
      for (const [side, dd] of [['R', d], ['L', d + 0.45]]) {
        _a.copy(this.T).addScaledVector(this.u, this.staffA - this.aT - dd);
        m.hand(side, _a.x, _a.y, _a.z, 1);
      }
    }
    // on the heavies the first two heave the breech block round by hand
    if (idx < 2 && this.kind !== 'bl6' && this.kind !== 'bl60' && (c.s === 'open' || c.s === 'close')) {
      this.grip.getWorldPosition(_a).applyMatrix4(_inv);
      m.hand('R', _a.x, _a.y, _a.z, 1);
      m.hand('L', _a.x, _a.y - 0.12, _a.z + 0.12, 1);
    }
  }

  // one man with the shell or the bag in his arms
  carryMan(m, c, h, what) {
    const s = c.s, k = c.k, shell = what === 'shell';
    const q = this.tmp[2], carry = shell ? this.shellA : this.bag, F = this.field, fq = this.tmp[4], fh = this.tmp[5];
    // his working place: beside the tray (shell) or behind the breech (bag), moved clear of the steel
    const tgt = shell ? this.trayAt(this.aT, _a) : _a.copy(this.B).addScaledVector(this.u, -0.15);
    const back = shell ? this.half + 0.35 : 0.75, side = shell ? 0.62 : 0.5;
    this.toF(m, tgt.x - this.bd.x * back + this.rt.x * side, tgt.z - this.bd.z * back + this.rt.z * side, fq);
    this.blockers(m);
    const fl = m.spot.y < this.workY - 0.1 && F.hasComb ? 'comb' : 'work';
    F.snap(fl, this.lw, fq.x, fq.z, R_STAND, fq, m.world);
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
    const rc = shell ? Math.min(0.75, Math.hypot(0.42, this.half) + this.srad * 0.5) : R_WALK;
    const goP = this.plan(m, 'go', this.lw, fh.x, fh.z, fq.x, fq.z, rc, false, false, fl), backP = this.plan(m, 'back', this.lw, fq.x, fq.z, fh.x, fh.z, R_WALK, false, true, fl);
    // the root-space place at the end of the walk
    if (m.world) { q.x = fq.x; q.z = fq.z; } else { q.x = fq.x * this.ca + fq.z * this.sa; q.z = -fq.x * this.sa + fq.z * this.ca; }
    const home = this.tmp[1];
    m.home(home);
    let phase = 'hold', kk = 0, have = true;
    if (shell) {
      if (s === 'shell') { phase = k < 0.78 ? 'go' : 'place'; kk = phase === 'go' ? k / 0.78 : (k - 0.78) / 0.22; have = !(phase === 'place' && kk > 0.6); }
      else if (s === 'ram') { phase = 'back'; kk = k; have = false; }
      else if (s === 'cartridge' && k < 0.45) { phase = 'pick'; have = false; }
    } else if (s === 'cartridge') {
      phase = k < 0.5 ? 'go' : k < 0.78 ? 'place' : 'back';
      kk = phase === 'go' ? k / 0.5 : phase === 'place' ? (k - 0.5) / 0.28 : (k - 0.78) / 0.22;
      have = k < 0.72;
    } else if (s === 'close' && k < 0.35) { phase = 'pick'; have = false; }
    const wy = this.workY, hy = home.y;
    const y = phase === 'go' ? lerp(hy, wy, goP.step >= 0 ? smooth(kk * goP.len, goP.step - 0.3, goP.step + 0.1) : smooth(kk, 0.6, 0.95))
      : phase === 'place' ? wy
      : phase === 'back' ? lerp(wy, hy, backP.step >= 0 ? smooth(kk * backP.len, backP.step - 0.1, backP.step + 0.3) : smooth(kk, 0.05, 0.4)) : hy;
    switch (phase) {
      case 'go': m.follow(goP, kk, y, have ? 'carryWalk' : 'walk'); break;
      case 'place': m.put(q.x, y, q.z, headingOf(tgt.x - q.x, tgt.z - q.z), have ? 'carry' : 'stand', 0); break;
      case 'back': m.follow(backP, kk, y, 'walk'); break;
      case 'pick': m.put(home.x, hy, home.z, home.h, 'crouch', 0); break;
      default: m.put(home.x, hy, home.z, home.h, have ? 'carry' : 'stand', this.idleT + m.seed);
    }
    if (!have) { carry.visible = false; return; }
    // the load: held across the body, laid on the tray at the end
    const fx = -Math.sin(m.h), fz = -Math.cos(m.h), len = shell ? this.slen : this.bagLen;
    let cx = m.x + fx * 0.42, cy = y + 1.0, cz = m.z + fz * 0.42, yaw = m.h - Math.PI / 2, pitch = 0;
    if (phase === 'place') {
      const e = smooth(kk, 0.1, 1);
      if (shell) {
        this.trayAt(this.aT, _b);
        cx = lerp(cx, _b.x, e); cy = lerp(cy, _b.y, e); cz = lerp(cz, _b.z, e);
        yaw += wrapPi(this.az - yaw) * e;
        pitch = Math.asin(this.u.y) * e;
      } else {
        // up to a point on the bore axis behind the breech (clear of the tray plate), then along the axis in
        const hb = this.bagLen / 2 + 0.3, s1 = smooth(kk, 0, 0.4), s2 = smooth(kk, 0.4, 0.7);
        const hx = this.B.x - this.u.x * hb, hy = this.B.y - this.u.y * hb + 0.05, hz = this.B.z - this.u.z * hb;
        cx = lerp(cx, hx, s1); cy = lerp(cy, hy, s1); cz = lerp(cz, hz, s1);
        cx = lerp(cx, this.B.x, s2); cy = lerp(cy, this.B.y + 0.05, s2); cz = lerp(cz, this.B.z, s2);
        yaw += wrapPi(this.az - yaw) * s1;
        pitch = Math.asin(this.u.y) * s1;
        if (kk > 0.7) { carry.visible = false; return; }
      }
    }
    _c.set(cx, cy, cz);
    this.placeProp(carry, _c, yaw, pitch, true);
    // both hands under it
    const nx = -Math.sin(yaw), nz = -Math.cos(yaw);
    for (const [side2, sg] of [['L', -1], ['R', 1]]) m.hand(side2, cx + nx * len * 0.3 * sg, cy - this.srad * 0.9, cz + nz * len * 0.3 * sg, 0.9);
  }

  // the two carriers of the 9.2-inch: the pair walks one route (planned for both, 0.84 m apart) from the stack
  // to the rear end of the tray, the shell hanging between them
  pairMan(m, c, h) {
    const side = m.beh === 'pair0' ? -1 : 1, F = this.field, lead = this.pairLead ??= this.men.find((q) => /^pair/.test(q.beh));
    const s = c.s, k = c.k, tgt = this.trayAt(this.aT, _a), ca = this.tmp[3], cb = this.tmp[4], tf = this.tmp[5], C = this.tmp[2];
    // the pair's centre at the stack, and behind the tray's rear end, moved clear of the steel
    this.toF(lead, this.S.x + 0.1, this.S.z + 1.1, ca);
    this.blockers(lead);
    const fl = F.hasComb ? 'comb' : 'work', la = F.hasComb ? this.lw : this.l0;
    this.toF(lead, this.S.x, this.S.z, _pp);
    this.snapPair(fl, la, ca, headingOf(_pp.x - ca.x, _pp.z - ca.z));
    this.toF(lead, tgt.x - this.bd.x * (this.half + 0.6), tgt.z - this.bd.z * (this.half + 0.6), cb);
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
    else if (s === 'ram') { phase = 'back'; kk = ramp(k, 0, 0.7); }
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
      C.x = _pt.x; C.z = _pt.z; hd = _pt.h; moving = kk > 0 && kk < 1 && P.len > 0.05; dist = _pt.d;
    } else if (phase === 'place') { C.x = cb.x; C.z = cb.z; hd = headingOf(tf.x - cb.x, tf.z - cb.z); } else {
      C.x = ca.x; C.z = ca.z;
      this.toF(lead, this.S.x, this.S.z, _pp);
      hd = headingOf(_pp.x - ca.x, _pp.z - ca.z);
    }
    const fx = C.x + Math.cos(hd) * 0.42 * side, fz = C.z - Math.sin(hd) * 0.42 * side, rot = !m.world;
    const rx = rot ? fx * this.ca + fz * this.sa : fx, rz = rot ? -fx * this.sa + fz * this.ca : fz, rh = rot ? hd + this.az : hd;
    const pose = phase === 'lift' ? 'crouch' : phase === 'go' ? 'carryWalk' : phase === 'place' ? 'carry' : phase === 'back' ? 'walk' : 'stand';
    const gait = phase === 'go' ? CSTRIDE : STRIDE;
    m.put(rx, y, rz, rh, pose, moving ? dist / gait : phase === 'wait' ? this.idleT + m.seed : 0);
    // the shell hangs between the two (drawn once, by the left man) at their midpoint
    if (side < 0) {
      const mx = rot ? C.x * this.ca + C.z * this.sa : C.x, mz = rot ? -C.x * this.sa + C.z * this.ca : C.z, mh = rot ? hd + this.az : hd;
      let cx, cy, cz, yaw = mh, pitch = 0, vis = true;
      if (phase === 'wait' || phase === 'back' || phase === 'lift') {
        if (phase === 'back' || (phase === 'wait' && c.loaded) || s === 'prime' || s === 'lay' || s === 'close' || s === 'cartridge') vis = false;
        cx = this.S.x; cy = 0.2 + this.srad; cz = this.S.z + 0.2; yaw = 0; // lying on the ground
        if (phase === 'lift') { const e = smooth(kk, 0.3, 1); cy = lerp(cy, y + 0.85, e); cx = lerp(cx, mx, e); cz = lerp(cz, mz, e); yaw = wrapPi(mh) * e; }
      } else {
        cx = mx; cy = y + 0.9; cz = mz;
        if (phase === 'place') {
          const e = smooth(kk, 0.1, 1);
          cx = lerp(cx, tgt.x, e); cy = lerp(cy, tgt.y, e); cz = lerp(cz, tgt.z, e);
          yaw += wrapPi(this.az - yaw) * e;
          pitch = Math.asin(this.u.y) * e;
          if (kk >= 1) vis = false;
        }
      }
      _c.set(cx, cy, cz);
      this.placeProp(this.shellA, _c, yaw, pitch, vis);
      this.pairShell = { x: cx, y: cy, z: cz, yaw };
    }
    const ps = this.pairShell;
    if (ps && (phase === 'go' || phase === 'place' || phase === 'lift')) {
      const nx = -Math.sin(ps.yaw), nz = -Math.cos(ps.yaw), sx = Math.cos(ps.yaw), sz = -Math.sin(ps.yaw);
      m.hand('L', ps.x + sx * side * this.srad * 1.1 - nx * 0.2, ps.y - 0.05, ps.z + sz * side * this.srad * 1.1 - nz * 0.2, 0.9);
      m.hand('R', ps.x + sx * side * this.srad * 1.1 + nx * 0.2, ps.y - 0.05, ps.z + sz * side * this.srad * 1.1 + nz * 0.2, 0.9);
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
    if (m.world) { out.x = f.x; out.z = f.z; } else { out.x = f.x * this.ca + f.z * this.sa; out.z = -f.x * this.sa + f.z * this.ca; }
    return out;
  }

  mate(m) {
    return this.men.find((q) => q !== m && /^pair/.test(q.beh));
  }

  // loaders at the tray of the crane / trolley guns: hands steady the shell as it comes down
  guideMan(m, c, h) {
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
    const rig = this.rig;
    if (this.crane) {
      const rest = Math.PI;
      let a = rest, y = this.restHoist;
      const lowY = 1.72;
      const T = this.trayAt(this.aT, _a);
      const aT = Math.atan2(T.z - this.cp.z, -(T.x - this.cp.x));
      const yT = T.y + 1.18;
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
    // never the rig's own tray props: the choreography draws its own shell
    rig.setShell?.('tray', false);
    rig.setShell?.('crane', false);
    rig.setShell?.('trolley', false);
    rig.setShell?.('cartridge', false);
    const A = this.shellA;
    if (this.crane) this.craneShells(c);
    else if (this.kind === 'rail') this.railShells(c);
    else if (c.s === 'ram' && this.shellA_a != null) {
      // being rammed home along the tray
      this.trayAt(this.shellA_a, _c);
      this.placeProp(A, _c, this.az, Math.asin(this.u.y), c.k < 0.82);
    } else if (c.s === 'shell' && c.k >= 0.91 && this.kind !== 'bl92') {
      // laid on the tray by the single carrier (his role draws it until then)
      this.trayAt(this.aT, _c);
      this.placeProp(A, _c, this.az, Math.asin(this.u.y), true);
    }
    // the staff
    const S = this.staff;
    if (this.staffA != null && this.level > 0) {
      S.visible = true;
      _a.copy(this.T).addScaledVector(this.u, this.staffA - this.aT);
      S.position.copy(_a);
      S.rotation.set(Math.asin(this.u.y), this.az, 0);
    } else S.visible = false;
  }

  craneShells(c) {
    const A = this.shellA, B = this.shellB;
    const mode = this.craneMode;
    // the shell lying at the pickup point
    const showGround = !(c.s === 'shell' && c.k > 0.27) && !['ram', 'cartridge', 'close'].includes(c.s);
    _c.copy(this.pick);
    this.placeProp(B, _c, Math.PI / 2 + 0.0, 0, showGround && mode !== 'hang');
    B.rotation.set(0, 0, 0);
    if (mode === 'hang' || mode === 'ground') {
      // hang under the hook, offset toward the tray at the end of the lowering
      const a = this.craneA, y = this.craneY;
      _a.set(this.cp.x - this.R * Math.cos(a), y - 1.18, this.cp.z + this.R * Math.sin(a));
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

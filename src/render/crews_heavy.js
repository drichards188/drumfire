import * as THREE from 'three';
import { smooth, ramp, lerp, wrapPi, headingOf } from './anim.js';
import { CREW_GAITS } from '../models/v/crew.js';

// Loading choreography roles of the super-heavy German pieces (render/crews.js merges these into its ROLES):
// role (the rig's crew spot) -> behaviour. The behaviours are crews.js's: cmd, lay, wheel, lan, guide0/1
// (steady the shell on the tray), ram (the rammer team), bag (carries the charges to the breech), winch,
// signal and sling (the crane men), plus the Gustav's lift men: liftL (the shell lift and the transfer
// trolley), liftR (the charge lift) and shove (roll the shell from the wagon into the lift's cage).
export const ROLES_HEAVY = {
  // 80 cm Gustav: the shell comes up the lift at the rear, crosses the platform and is laid on the tray; a
  // rammer team on the platform, the charges carried from the charge lift; the layer and the elevating
  // controller on the walkways beside the cradle
  gustav: {
    chief: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
    rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram', bagman: 'bag',
    lift1: 'liftL', lift2: 'liftR', ammoA: 'shove', ammoB: 'shove', phone: 'idle',
  },
  // 60 cm Karl-Gerät: the carrier's crane men lift the shell out of its hold onto the tray at the stern, two
  // loaders steady it, the rammer team on the stern platform; the cartridges come from the carrier's locker
  karl: {
    sergeant: 'cmd', layer: 'lay', traverser: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
    rammer1: 'ram', rammer2: 'ram', rammer3: 'ram', rammer4: 'ram',
    crane1: 'winch', crane2: 'signal', ammo1: 'sling', ammo2: 'bag',
  },
  // 42 cm Bertha: the stage's jib crane swings the shell from the cart onto the tray, two rammers, the bags
  // from the rack at the back of the stage, the two layers at their handwheels
  bertha: {
    sergeant: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'guide0', loader2: 'guide1',
    rammer1: 'ram', rammer2: 'ram', kran: 'winch', cart: 'sling', bagman: 'bag',
  },
};

// Heavy drills share one clock with their mechanisms. Fractions describe the compressed game cycle,
// with deliberate stops to secure a load, take its weight, land it and remove the lifting gear.
const HEAVY = new Set(Object.keys(ROLES_HEAVY));
const Y = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
const inv = new THREE.Matrix4();
const windowK = (k, a, b, c, d) => smooth(k, a, b) * (1 - smooth(k, c, d));
// the Gustav still being put together (rig.assembly < 1, the railway preparation): no galleries, no platform yet
const unbuilt = (crew) => crew.kind === 'gustav' && (crew.rig.assembly ?? 1) < 1;

function point(crew, node, out, x = 0, y = 0, z = 0) {
  inv.copy(crew.rig.root.matrixWorld).invert();
  return out.set(x, y, z).applyMatrix4(node.matrixWorld).applyMatrix4(inv);
}

function mesh(group, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

function line(root, material, radius = 0.018) {
  return mesh(root, new THREE.CylinderGeometry(radius, radius, 1, 6), material);
}

function span(m, a, b) {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  v.copy(b).sub(a);
  m.scale.y = Math.max(0.001, v.length());
  m.quaternion.setFromUnitVectors(Y, v.normalize());
}

function cart(root, material, radius, length) {
  const g = new THREE.Group();
  root.add(g);
  const base = new THREE.Group();
  g.add(base);
  mesh(base, new THREE.BoxGeometry(radius * 2.8, 0.12, length * 0.76), material, 0, 0.21);
  const columns = [];
  for (const z of [-length * 0.27, length * 0.27]) for (const side of [-1, 1]) {
    const chock = mesh(g, new THREE.BoxGeometry(radius * 0.55, radius * 0.5, 0.14), material, side * radius * 0.7, -radius * 0.78, z);
    chock.rotation.z = -side * 0.45;
    mesh(base, new THREE.CylinderGeometry(0.115, 0.115, 0.09, 10).rotateZ(Math.PI / 2), material, side * radius * 1.2, 0.115, z);
    columns.push(mesh(g, new THREE.BoxGeometry(0.055, 1, 0.055), material, side * radius * 0.7, 0, z));
  }
  g.userData.support = { base, columns, radius };
  g.visible = false;
  return g;
}

function supportCart(g, floor) {
  const { base, columns, radius } = g.userData.support;
  base.position.y = floor - g.position.y;
  const low = base.position.y + 0.24, high = -radius * 0.85;
  for (const col of columns) { col.position.y = (low + high) * 0.5; col.scale.y = Math.max(0.04, high - low); }
}

function drill(crew) {
  if (crew.heavyDrill) return crew.heavyDrill;
  // The generic ground clearance search can escape a small raised deck. Keep these men on the
  // Karl's actual rear platform, with an aisle for the shell and room behind each working pair.
  if (crew.kind === 'karl') {
    const deck = { loader1: [-0.82, 3.9], loader2: [0.9, 3.28], rammer1: [-0.5, 4.75], rammer2: [0.88, 4.75], rammer3: [-0.88, 5.67], rammer4: [0.88, 5.67] };
    for (const m of crew.men) if (deck[m.role]) [m.sx, m.sz] = deck[m.role];
    // the clearance search pushed the men at the handwheels and the lanyard up to 2 m off their places (the traverser
    // to the front of the side platform, the lanyard man across the deck into the first loader): they stand where the
    // rig puts them, at the wheels on the side platforms and behind the breech on the right
    for (const r of ['layer', 'traverser', 'lanyard']) { const m = crew.byRole.get(r); if (m) { m.sx = m.spot.x; m.sz = m.spot.z; } }
  }
  if (crew.kind === 'bertha') {
    // The demo's places (src/bertha/crew.js) on the loading stage: the right loader at the wedge's crank, the left one
    // across the tray from him, the rammers and the bagman at the back either side of the tray's run, the crane man at
    // the winch on the jib's post, the cart man on the ground at the shell cart. The layers stand on their footboards
    // (0.3 m over the bed: src/bertha/model.js), at the wheels; the clearance search had put them off the boards and on
    // the bed, their legs through the plates. [x, z, heading, height over the spot]
    const home = {
      layer: [-1.66, 1.42, -Math.PI / 2, 0.3], elevator: [1.69, 1.32, Math.PI / 2, 0.3],
      loader1: [-1.0, 2.6, -Math.PI / 2 + 0.35], loader2: [1.0, 2.42, -0.2],
      rammer1: [-1.0, 3.6, 0], rammer2: [0.9, 4.65, 0], bagman: [-0.9, 4.57, 0],
      kran: [1.33, 3.38, -0.98], cart: [2.5, 3.0, -Math.PI / 2],
    };
    for (const m of crew.men) {
      const hm = home[m.role];
      if (!hm) continue;
      [m.sx, m.sz, m.hh, m.hy = 0] = hm;
    }
  }
  const root = new THREE.Group();
  root.name = 'crew-heavy-equipment';
  crew.rig.root.add(root);
  const steel = new THREE.MeshStandardMaterial({ color: 0x444b49, roughness: 0.7, metalness: 0.45 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x6e6352, roughness: 0.95 });
  const d = crew.heavyDrill = {
    root, steel, rope, shell: new THREE.Vector3(), pickup: new THREE.Vector3(), hook: new THREE.Vector3(),
    mid: new THREE.Vector3(), cage: new THREE.Vector3(), charge: new THREE.Vector3(),
    shellYaw: 0, shellPitch: 0, visible: false, waiting: false, phase: 'idle',
    sling: [line(root, rope), line(root, rope)], controls: new Map(),
    cart: crew.kind === 'gustav' ? cart(root, steel, crew.srad, crew.slen) : null,
    chargeCart: crew.kind !== 'bertha' ? cart(root, steel, crew.kind === 'gustav' ? 0.37 : 0.31, crew.bagLen) : null,
  };
  if (crew.kind !== 'bertha') {
    // The represented drive carries the thrust of multi-ton projectiles. Men operate and observe it.
    crew.staff.children[0].material = steel;
    d.drive = new THREE.Group();
    root.add(d.drive);
    // it rides the tray floor (3 cm over the shell's underside), narrow enough to run between the Karl's ramp rails
    mesh(d.drive, new THREE.BoxGeometry(0.38, 0.42, 0.65), steel, 0, 0.24 - crew.srad, 0);
    mesh(d.drive, new THREE.CylinderGeometry(0.16, 0.16, 0.8, 12).rotateX(Math.PI / 2), steel, 0, 0.08, -0.24);
    d.drive.visible = false;
  }
  return d;
}

// build the drill's equipment with the crew (render/crews.js GunCrew), so it is drawn by the load's warm-up
export function heavyBuild(crew) {
  if (HEAVY.has(crew.kind)) drill(crew);
}

export function heavyState(crew, c) {
  if (!HEAVY.has(crew.kind)) return false;
  const d = drill(crew), k = c.k;
  // the drill's equipment (the control stations, the carts, the rammer drive, the slings) is the gun's: none of it
  // stands there before the gun does
  d.root.visible = crew.level > 0 && !unbuilt(crew);
  crew.bag.visible = false;
  crew.staffA = null;
  crew.shellA_a = null;
  crew.ramK = 0;
  if (c.s === 'ram') {
    crew.ramK = smooth(k, 0.14, 0.7);
    const end = crew.half + 0.18;
    crew.shellA_a = lerp(crew.aT, end, crew.ramK);
    const start = crew.aT - crew.half - 0.04;
    const seated = end - crew.half - 0.04;
    crew.staffA = lerp(start, seated, crew.ramK) - (seated - start) * smooth(k, 0.79, 0.98);
  } else if (c.s === 'cartridge' && crew.kind === 'bertha') {
    // the bagman lays the charge on the tray and the rammers, still at their places behind it, drive it home with
    // the staff: from where the ram left the head (the shell's base on the tray) to the bag seated in the chamber
    const start = crew.aT - crew.half - 0.04;
    crew.staffA = lerp(start, BAG_SEAT, smooth(k, 0.58, 0.8)) - (BAG_SEAT - start) * smooth(k, 0.83, 0.97);
  }
  d.work = c.s === 'shell' || c.s === 'ram' || c.s === 'cartridge';
  return true;
}

export function heavyMechanisms(crew, c) {
  if (!HEAVY.has(crew.kind)) return false;
  const d = drill(crew), rig = crew.rig, k = c.k;
  d.phase = 'idle';
  if (crew.kind === 'gustav') {
    const up = crew.restHoist, down = crew.lowHoist;
    let lift = up, charge = up;
    if (c.s === 'shell') {
      lift = up - (up - down) * (smooth(k, 0, 0.12) - smooth(k, 0.32, 0.59));
      charge = up - (up - down) * (smooth(k, 0.08, 0.25) - smooth(k, 0.61, 0.88));
      d.phase = k < 0.12 ? 'lower' : k < 0.27 ? 'roll' : k < 0.32 ? 'secure' : k < 0.59 ? 'raise'
        : k < 0.63 ? 'lock' : k < 0.75 ? 'cross' : k < 0.79 ? 'align' : k < 0.96 ? 'transfer' : 'land';
    }
    crew.hoist.position.y = lift;
    rig.pivots.hoist2.position.y = charge;
  } else if (crew.crane) {
    const rest = rig.craneRest ?? Math.PI;
    // A fixed-length jib follows its short arc; keep its pickup fixed while the crane turns.
    point(crew, crew.crane.parent, d.pickup,
      crew.cp.x - crew.R * Math.cos(rest), rig.pickY, crew.cp.z + crew.R * Math.sin(rest));
    point(crew, crew.crane.parent, q, crew.cp.x, 0, crew.cp.z);
    const target = Math.atan2(crew.T.z - q.z, -(crew.T.x - q.x));
    let angle = rest, height = crew.restHoist;
    const trayY = crew.T.y + crew.hang - q.y;
    if (c.s === 'shell') {
      if (k < 0.24) {
        height = lerp(crew.restHoist, crew.lowHoist, smooth(k, 0, 0.12));
        d.phase = k < 0.12 ? 'lower' : 'attach';
      } else if (k < 0.35) {
        height = crew.lowHoist + 0.1 * smooth(k, 0.24, 0.29);
        d.phase = 'test';
      } else if (k < 0.5) {
        height = lerp(crew.lowHoist + 0.1, crew.restHoist, smooth(k, 0.35, 0.5));
        d.phase = 'raise';
      } else if (k < 0.75) {
        angle = rest + wrapPi(target - rest) * smooth(k, 0.51, 0.73);
        d.phase = 'slew';
      } else {
        angle = target;
        height = lerp(crew.restHoist, trayY, smooth(k, 0.76, 0.91));
        if (k > 0.96) height += 0.55 * smooth(k, 0.96, 1);
        d.phase = k < 0.91 ? 'land' : k < 0.96 ? 'release' : 'clear';
      }
    } else if (c.s === 'ram') {
      angle = target + wrapPi(rest - target) * smooth(k, 0.12, 0.62);
      height = lerp(trayY + 0.55, crew.restHoist, smooth(k, 0, 0.1));
      d.phase = 'return';
    }
    crew.crane.rotation.y = angle;
    crew.hoist.position.y = height;
    crew.craneA = angle; crew.craneY = height;
    crew.pick.copy(d.pickup);
    if (crew.kind === 'bertha') berthaWheels(crew, c);
  }
  rig.update?.(0);
  rig.root.updateMatrixWorld(true);
  shellPose(crew, c, d);
  return true;
}

function shellPose(crew, c, d) {
  const rig = crew.rig, k = c.k, s = c.s;
  d.shellPitch = 0;
  d.shellYaw = crew.az;
  d.visible = s === 'shell' || (s === 'ram' && k < 0.72);
  d.waiting = !c.loaded && !['ram', 'cartridge', 'close', 'prime', 'lay'].includes(s);
  if (crew.kind === 'gustav') {
    d.pickup.copy(crew.S);
    point(crew, rig.anchors.shellStack, v, 0, 0, -1).sub(crew.S);
    const wagonYaw = headingOf(v.x, v.z);
    point(crew, crew.hoist, d.cage, 0, -crew.hang, 0);
    point(crew, rig.anchors.liftMid, d.mid);
    d.shell.copy(d.pickup);
    d.shellYaw = wagonYaw;
    if (s === 'shell') {
      d.waiting = k <= 0.14;
      d.visible = k > 0.14;
      if (k < 0.32) {
        const roll = smooth(k, 0.14, 0.27);
        d.shell.lerp(d.cage, roll);
        d.shellYaw += wrapPi(crew.az - wagonYaw) * roll;
      } else if (k < 0.63) { d.shell.copy(d.cage); d.shellYaw = crew.az; }
      else {
        d.shell.copy(d.cage).lerp(d.mid, smooth(k, 0.63, 0.75));
        d.shellYaw = crew.az;
        if (k >= 0.79) {
          d.shell.copy(d.mid).lerp(crew.T, smooth(k, 0.79, 0.96));
          d.shellPitch = Math.asin(crew.u.y) * smooth(k, 0.9, 0.96);
        }
      }
    }
  } else {
    point(crew, crew.hoist, d.hook);
    d.shell.copy(d.pickup);
    d.shellYaw = rig.pickYaw ?? crew.az;
    if (s === 'shell') {
      d.waiting = k < 0.24;
      d.visible = k >= 0.24;
      if (k >= 0.24 && k < 0.91) {
        d.shell.copy(d.hook); d.shell.y -= crew.hang;
        d.shellYaw += wrapPi(crew.az - d.shellYaw) * smooth(k, 0.7, 0.8);
        // The hook is on the jib's radius; the final centimetres settle into the tray's saddle.
        d.shell.lerp(crew.T, smooth(k, 0.83, 0.91));
        d.shellPitch = Math.asin(crew.u.y) * smooth(k, 0.83, 0.91);
      } else if (k >= 0.91) {
        d.shell.copy(crew.T); d.shellYaw = crew.az; d.shellPitch = Math.asin(crew.u.y);
      }
    }
  }
  if (s === 'ram') {
    crew.trayAt(crew.shellA_a, d.shell);
    d.shellYaw = crew.az; d.shellPitch = Math.asin(crew.u.y);
  }
}

export function heavyAct(crew, m, c, h) {
  if (!HEAVY.has(crew.kind)) return false;
  const d = drill(crew), s = c.s, k = c.k;
  // the Gustav still being put together: its galleries and platform are not there yet, so the men work on the
  // ground along its left side, between the gun tracks and the crane rail (on the right the parts trains pass with
  // their wide loads, src/ww2/gustav_works.js)
  if (unbuilt(crew) && m.beh !== 'idle') {
    const i = crew.men.indexOf(m), busy = i % 3 !== 1;
    m.put(-5.0 - 0.5 * (i & 1), 0, -19 + i * 2.5, -Math.PI / 2, // facing the gun
      busy ? 'operate' : 'stand', busy ? c.now * 1.1 + m.seed : crew.idleT + m.seed);
    return true;
  }
  if (crew.kind === 'bertha' && berthaAct(crew, m, c, h, d)) return true;
  if (m.beh === 'ram') {
    if (crew.kind !== 'bertha') {
      // Keep the central delivery rails clear. The front pair works the rammer drive; the rear pair
      // checks the feed and waits for the staff to return before the charge is brought forward.
      const side = m.spot.x < 0 ? -1 : 1, clearance = crew.kind === 'gustav' ? 1.08 : m.role === 'rammer1' ? 0.5 : 0.88;
      const off = side * clearance - m.sx;
      h.x += crew.rt.x * off; h.z += crew.rt.z * off;
      const lead = /[12]$/.test(m.role), on = s === 'ram' && k > 0.1 && k < 0.97;
      const heading = headingOf(crew.T.x - h.x, crew.T.z - h.z);
      m.put(h.x, h.y, h.z, lead ? side < 0 ? -Math.PI / 2 + crew.az : Math.PI / 2 + crew.az : heading,
        lead && on ? 'operate' : 'stand', on ? ramp(k, 0.14, 0.97) * 4 : crew.idleT + m.seed);
      if (lead) control(crew, m, h, on ? ramp(k, 0.14, 0.97) * 4 : 0, on ? 1 : 0, 'rammer');
    } else berthaRammer(crew, m, c, h);
    return true;
  }
  if ((m.beh === 'guide0' || m.beh === 'guide1') && crew.kind === 'karl') { karlGuide(crew, m, c, h, d); return true; }
  if (m.beh === 'guide0' || m.beh === 'guide1') {
    const side = m.beh === 'guide0' ? -1 : 1;
    const open = s === 'open' || s === 'close';
    const feed = crew.kind !== 'bertha' && s === 'cartridge' && k >= 0.64;
    const near = s === 'shell' && d.shell.distanceTo(crew.T) < 0.9;
    const weight = near ? windowK(k, crew.kind === 'gustav' ? 0.91 : 0.78, crew.kind === 'gustav' ? 0.95 : 0.9, 0.96, 0.99) : 0;
    const target = d.shell;
    const approach = s === 'shell' ? windowK(k, crew.kind === 'gustav' ? 0.86 : 0.72, crew.kind === 'gustav' ? 0.93 : 0.85, 0.96, 1) : 0;
    const axial = -crew.half * 0.45;
    q.copy(crew.T).addScaledVector(crew.u, axial);
    const reach = crew.srad + (crew.kind === 'bertha' ? 0.66 : 0.46); // Bertha's stage is open under the tray's run
    const workX = q.x + crew.rt.x * side * reach, workZ = q.z + crew.rt.z * side * reach;
    const x = lerp(h.x, workX, approach), z = lerp(h.z, workZ, approach);
    const heading = headingOf((open ? crew.B.x : target.x) - x, (open ? crew.B.z : target.z) - z);
    const walking = approach > 0.01 && approach < 0.97;
    m.put(x, h.y, z, open || approach > 0 ? heading : h.h,
      open || feed ? 'operate' : walking ? 'walk' : weight > 0 ? 'push' : 'stand', open ? k * 2 : feed ? smooth(k, 0.7, 0.91) : approach * Math.hypot(workX - h.x, workZ - h.z) / 1.15);
    if (open) {
      // The sliding breech is geared; its operators stay at the side controls, outside its sweep.
      control(crew, m, h, (s === 'open' ? k : 1 - k) * 2, windowK(k, 0, 0.08, 0.92, 1), 'breech');
    } else if (feed) {
      control(crew, m, h, smooth(k, 0.7, 0.91), windowK(k, 0.64, 0.7, 0.91, 0.98), 'breech');
    } else if (weight > 0) {
      // Palms rest against the near flank; nobody attempts to support the shell's weight by hand.
      for (const [hand, a] of [['L', -0.22], ['R', 0.22]]) {
        q.copy(target).addScaledVector(crew.u, axial + a);
        q.x += crew.rt.x * side * crew.srad * 0.92;
        q.z += crew.rt.z * side * crew.srad * 0.92;
        q.y += 0.03;
        reachable(m, hand, q, weight);
      }
    }
    return true;
  }
  if (m.beh === 'winch' || m.beh === 'liftL' || m.beh === 'liftR') {
    const phases = m.beh === 'liftR' ? ['lower', 'raise', 'cross', 'align', 'transfer']
      : ['lower', 'test', 'raise', 'slew', 'land', 'clear', 'return', 'cross', 'transfer'];
    const on = (s === 'shell' || s === 'ram') && phases.includes(d.phase);
    const turns = s === 'shell' ? smooth(k, 0, 0.12) + 0.15 * smooth(k, 0.24, 0.29)
      + 1.5 * smooth(k, 0.35, 0.5) + 2 * smooth(k, 0.51, 0.73)
      + 1.4 * smooth(k, 0.76, 0.91) + 0.5 * smooth(k, 0.96, 1) : 3 * smooth(k, 0.12, 0.62);
    m.put(h.x, h.y, h.z, h.h, on ? 'operate' : 'stand', turns);
    control(crew, m, h, turns, on ? 1 : 0, 'hoist');
    return true;
  }
  if (m.beh === 'signal') {
    const active = s === 'shell' || s === 'ram' && k < 0.65;
    if (crew.kind === 'gustav') {
      const look = active ? d.hook : crew.T;
      m.put(h.x, h.y, h.z, headingOf(look.x - h.x, look.z - h.z), active ? 'signal' : 'stand', 0.12);
      return true;
    }
    // he turns from the tray to the hook as the lift begins and back as it is clear (no snap at the steps' ends)
    const w = s === 'shell' ? smooth(k, 0, 0.08) : s === 'ram' ? 1 - smooth(k, 0.55, 0.72) : 0;
    const toT = headingOf(crew.T.x - h.x, crew.T.z - h.z), toH = headingOf(d.hook.x - h.x, d.hook.z - h.z);
    m.put(h.x, h.y, h.z, toT + wrapPi(toH - toT) * w, active ? 'signal' : 'stand', active ? 0.12 + c.now * 0.6 : crew.idleT + m.seed);
    return true;
  }
  if (m.beh === 'sling' || m.beh === 'shove') {
    const attach = s === 'shell' && k > 0.1 && k < (m.beh === 'shove' ? 0.31 : 0.24);
    const target = d.pickup;
    const heading = headingOf(target.x - h.x, target.z - h.z);
    m.put(h.x, h.y, h.z, heading, attach ? m.beh === 'shove' ? 'ramLoad' : 'push' : 'stand',
      attach ? smooth(k, 0.12, 0.27) : crew.idleT + m.seed);
    if (attach) {
      for (const [hand, a] of [['L', -0.2], ['R', 0.2]]) {
        q.copy(target);
        q.z += a;
        q.x += Math.sign(h.x - target.x) * crew.srad;
        reachable(m, hand, q, windowK(k, 0.1, 0.14, 0.25, 0.31));
      }
    }
    return true;
  }
  if (m.beh === 'bag' && crew.kind !== 'bertha') {
    chargeMan(crew, m, c, h, d);
    return true;
  }
  if (m.role === 'phone') {
    m.put(h.x, h.y, h.z, h.h, 'phone', crew.idleT + m.seed);
    return true;
  }
  return false;
}

// Bertha's two rammers walk the staff up the bore as in the demo's drill (src/bertha/crew.js): ahead of the tray's
// rear end the deck is cut away for the recoiling breech, so they stand behind the tray either side of the staff,
// the first 0.75 m behind its head and the second 1.35 m, never past the back of the stage, and the staff runs
// through their hands a grip and a heave at a time. They come over at the start of the ram and go back to their
// places as the bags come up.
const BERTHA_RAM = { rammer1: { side: -1, rear: 0.3 }, rammer2: { side: 1, rear: 0.8 } };
const GRIP = 0.45; // the staff travel per heave
const BAG_SEAT = 0.1; // the staff's head with the charge seated in the chamber (axial, from the breech face)
const STRIDE = CREW_GAITS.walk.stride, SIDE = CREW_GAITS.sidestep.stride, CSTRIDE = CREW_GAITS.carryWalk.stride;
const _st = new THREE.Vector3(), _hm = { x: 0, y: 0, z: 0, h: 0 };

// a rammer's place behind the tray: fixed for the whole stroke, so his feet stay planted in the lunge while the staff
// runs through his hands (it used to follow the staff's head, and the feet skated a metre a cycle)
function berthaStation(crew, r, out) {
  const tz = crew.rig.berthaModel?.trayZ, rear = crew.aT - (tz ? (tz.z1 - tz.z0) / 2 : 0.9);
  const a = rear - r.rear;
  crew.trayAt(a, out);
  out.x += crew.rt.x * r.side * 0.31; out.z += crew.rt.z * r.side * 0.31;
  return a;
}

// A short move from a to b (root space) a fraction e of the way, facing hd the whole time: sideways steps when the move
// is mostly to his side, forward (or backward) steps otherwise, the gait's cycle run by the distance actually covered
// so the feet stay planted. Returns false when he is not moving (the caller poses him).
function shuffle(m, ax, az, bx, bz, e, y, hd) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
  if (!(e > 0.002 && e < 0.998) || d < 0.04) return false;
  const fw = -(dx * Math.sin(hd) + dz * Math.cos(hd)), rt = dx * Math.cos(hd) - dz * Math.sin(hd);
  const x = lerp(ax, bx, e), z = lerp(az, bz, e);
  if (Math.abs(rt) > Math.abs(fw)) m.put(x, y, z, hd, 'sidestep', (rt * e) / SIDE);
  else m.put(x, y, z, hd, 'walk', (fw * e) / STRIDE);
  return true;
}

function berthaHome(crew, m, h) {
  _hm.x = h.x; _hm.z = h.z; _hm.y = h.y + (m.hy ?? 0);
  _hm.h = m.hh != null ? m.hh + crew.az : h.h;
  return _hm;
}

function berthaRammer(crew, m, c, h) {
  const s = c.s, k = c.k, r = BERTHA_RAM[m.role] ?? BERTHA_RAM.rammer2, H = berthaHome(crew, m, h);
  const fwd = headingOf(crew.u.x, crew.u.z);
  const start = crew.aT - crew.half - 0.04; // the staff's head against the shell's base before the stroke
  const a = berthaStation(crew, r, _st);
  // in at the start of the ram, out once the charge is home (the close): side steps facing the breech, about 0.6 m in a
  // second, turning to face it on the way in and back to his place's heading on the way out
  // (in over the last second of the shell's landing and the first of the ram, about 0.7 m: at a walk, not the dash
  // the first tenth of the ram alone made of it)
  // Out again over the end of the charge's stroke and the first second of the close, sideways first: the tray runs back
  // through their places as the block closes (render/guns.js loadPose).
  const dur = c.p.job?.dur ?? 1, tIn = s === 'shell' ? (k - 1) * dur : s === 'ram' ? k * dur : -9;
  const tOut = s === 'cartridge' ? (k - 1) * dur : s === 'close' ? k * dur : -9;
  const inK = s === 'shell' || s === 'ram' ? smooth(tIn, -1.0, 0.7) : s === 'cartridge' || s === 'close' ? 1 - smooth(tOut, -0.4, 0.9) : 0;
  const hd = H.h + wrapPi(fwd - H.h) * Math.min(1, inK * 1.6);
  if (inK < 0.999) {
    if (!shuffle(m, H.x, H.z, _st.x, _st.z, inK, H.y, hd)) {
      if (inK < 0.5) m.put(H.x, H.y, H.z, H.h, 'stand', crew.idleT + m.seed);
      else m.put(_st.x, H.y, _st.z, hd, 'stand', 0);
    }
    return;
  }
  if (crew.staffA == null) return m.put(_st.x, H.y, _st.z, fwd, 'ramLow', 0);
  // each heave: the hands go along with the wood for 80% of GRIP while he lunges into it, then let go and take a
  // fresh hold behind as he straightens (the pose's cycle: lunge over its first half, recover over the second)
  const phase = ((((crew.staffA - start) / GRIP) % 1) + 1) % 1, push = phase < 0.8;
  const travel = push ? phase : 0.8 * (1 - smooth(phase, 0.8, 1));
  const moving = s === 'ram' ? k > 0.14 && k < 0.98 : k > 0.58 && k < 0.97;
  m.put(_st.x, H.y, _st.z, fwd, 'ramLow', moving ? (push ? 0.5 * smooth(phase, 0, 0.8) : 0.5 + 0.5 * smooth(phase, 0.8, 1)) : 0);
  const hold = (s === 'ram' ? smooth(k, 0.1, 0.15) : 1) * (1 - (moving ? windowK(phase, 0.8, 0.85, 0.95, 1) : 0));
  // (the hand nearer the staff leads: the right one for the man on its left, the left one for the man on its right)
  for (const [hand, off] of r.side < 0 ? [['L', 0.15], ['R', 0.34]] : [['R', 0.15], ['L', 0.32]]) {
    crew.trayAt(Math.min(crew.staffA - 0.1, a + off + (moving ? travel * GRIP : 0)), q);
    m.hand(hand, q.x, q.y, q.z, hold); // (the stoop brings the staff in reach: reachable() measures from a standing man)
  }
}

// ---------------------------------------------------------------- the rest of Bertha's detachment

// The model's handwheels turn with what they drive (as the demo's page turns them): line and elevation with the
// carriage's lay, the wedge's crank with the block, the crane's winch with the hook (a whole number of turns a cycle,
// so it is back where it started and the crane man's hands never jump).
function berthaWheels(crew, c) {
  const W = crew.rig.berthaModel?.wheels;
  if (!W) return;
  const s = c.s, k = c.k;
  W.trav && (W.trav.node.rotation.x = -c.p.az * 160);
  W.elev && (W.elev.node.rotation.x = c.p.el * 70);
  const bk = s === 'open' ? k : s === 'close' ? 1 - k : s === 'shell' || s === 'ram' || s === 'cartridge' ? 1 : 0;
  W.wedge && (W.wedge.node.rotation.x = -bk * 9);
  W.crane && (W.crane.node.rotation.x = craneTurns(c) * Math.PI * 2);
  crew.wedgeK = bk;
}

// the crane winch's turns through the cycle (the hoist's run: down, the test lift, up, the slew, down onto the tray,
// the hook clear; the hook back over the cart in the ram), 9 in all
function craneTurns(c) {
  const k = c.k;
  if (c.s === 'shell') return 1.2 * smooth(k, 0, 0.12) + 0.2 * smooth(k, 0.24, 0.29) + 1.6 * smooth(k, 0.35, 0.5) + 0.4 * smooth(k, 0.51, 0.73) + 1.6 * smooth(k, 0.76, 0.91) + 0.5 * smooth(k, 0.96, 1);
  if (c.s === 'ram') return 5.5 + 3.5 * smooth(k, 0, 0.62);
  return 0;
}

// both hands on a handwheel's rim at ten and two (right: the rim angle of the right hand, 0 at the top), working hand
// over hand as the wheel turns (src/bertha/crew.js wheelGrip)
function wheelGrip(crew, m, name, right, w, max = 0) {
  const W = crew.rig.berthaModel?.wheels?.[name];
  if (!W || w <= 0.01) return;
  const rot = W.node.rotation.x;
  for (const [side, a, ph] of [['R', right, 0], ['L', -right, Math.PI]]) {
    // the grip points are taken in the wheel's mounting, not in the turning wheel: in the wheel's own frame they went
    // round with it, a full turn every few seconds, and spent half of it out of reach under the hub
    const ang = a + 0.4 * Math.sin(rot + ph), o = W.node.position;
    point(crew, W.node.parent, q, o.x - 0.03, o.y + Math.cos(ang) * W.R, o.z + Math.sin(ang) * W.R);
    if (max) reachable(m, side, q, w, max); else m.hand(side, q.x, q.y, q.z, w);
  }
}

function berthaAct(crew, m, c, h, d) {
  const s = c.s, k = c.k, p = c.p;
  switch (m.beh) {
    case 'lay': case 'wheel': {
      // on the footboard at his handwheel: winding while the carriage or the barrel moves, else at ease beside it
      const H = berthaHome(crew, m, h), lay = m.beh === 'lay';
      const moving = Math.abs(p.cmd.az - p.az) > 3e-4 || Math.abs(p.cmd.el - p.el) > 3e-4 || s === 'lay' || s === 'depress';
      const busy = lay ? moving && (Math.abs(p.cmd.az - p.az) > 3e-4 || s === 'lay') : moving;
      // At the shot they stay on their boards with both hands on the wheel, braced: turned away from the gun they swung
      // their legs through the carriage beside the board, and hunched over their ears their heads went into the dials.
      m.noEars = true;
      const hold = busy || crew.ears > 0.5;
      m.put(H.x, H.y, H.z, H.h, hold ? 'operate' : 'stand', busy ? c.now * 0.9 : crew.idleT + m.seed);
      // (the big elevation wheel is held nearer the top: at ten and two its far side was out of reach)
      if (hold) wheelGrip(crew, m, lay ? 'trav' : 'elev', lay ? 1.0 : -0.6, busy ? 1 : smooth(crew.ears, 0.5, 0.8));
      return true;
    }
    case 'guide0': case 'guide1': berthaGuide(crew, m, c, h, d); return true;
    case 'ram': berthaRammer(crew, m, c, h); return true;
    case 'winch': {
      // the crane man at the winch on the jib's post: hauling while the hook moves, watching the load
      const H = berthaHome(crew, m, h), on = s === 'shell' ? k < 0.12 || (k > 0.24 && k < 0.29) || (k > 0.35 && k < 0.91) || k > 0.96 : s === 'ram' && k < 0.62;
      // the winch rides the jib round its post: he keeps facing it
      const W = crew.rig.berthaModel?.wheels?.crane;
      const hd = W ? (point(crew, W.node, _st), headingOf(_st.x - H.x, _st.z - H.z)) : H.h;
      m.put(H.x, H.y, H.z, hd, on ? 'operate' : 'stand', on ? craneTurns(c) * 0.5 : crew.idleT + m.seed);
      wheelGrip(crew, m, 'crane', 1.2, on ? 1 : 0, 0.76);
      return true;
    }
    case 'sling': {
      // the cart man: crouched at the shell to hook it on, steadying it as it comes off the cart, then watching it go
      const H = berthaHome(crew, m, h), tgt = d.pickup;
      const face = headingOf(tgt.x - H.x, tgt.z - H.z);
      const hook = s === 'shell' && k > 0.08 && k < 0.3;
      // steadying only while the shell is still within his reach (arms up at nothing once it had risen past them)
      const steady = s === 'shell' && k >= 0.3 && k < 0.47 && d.visible && Math.hypot(d.shell.x - H.x, d.shell.y - H.y - 1.45, d.shell.z - H.z) < 0.95;
      // he follows the shell with his eyes as it goes over, and turns back to the cart as it is rammed
      const lw = s === 'shell' ? smooth(k, 0.47, 0.6) : s === 'ram' ? 1 - smooth(k, 0.1, 0.4) : 0;
      const look = headingOf(crew.T.x - H.x, crew.T.z - H.z); // (where the shell is going: the swinging load flipped his head about)
      // (the tray is behind him: he looks over his shoulder, always the same way round, never through the half turn
      // where the shorter way flips sides)
      let dl = wrapPi(look - face);
      if (dl < -2.0) dl += Math.PI * 2;
      dl = Math.min(dl, 2.4);
      m.put(H.x, H.y, H.z, steady ? face : face + dl * lw,
        hook ? 'crouch' : steady ? 'reachUp' : 'stand', hook || steady ? k * 2 : crew.idleT + m.seed);
      if (hook || steady) {
        const src = d.visible ? d.shell : tgt, w = hook ? windowK(k, 0.08, 0.13, 0.25, 0.3) : windowK(k, 0.3, 0.33, 0.42, 0.47);
        q.set(H.x - src.x, 0, H.z - src.z).normalize().multiplyScalar(crew.srad * 1.05);
        for (const [hand, off] of [['L', 0.16], ['R', -0.16]]) {
          w > 0.01 && reachable(m, hand, _st.set(src.x + q.x + crew.rt.z * off, src.y + 0.02, src.z + q.z - crew.rt.x * off), w, 0.72);
        }
      }
      return true;
    }
    case 'bag': berthaBagman(crew, m, c, h); return true;
  }
  return false;
}

// The two loaders: the right one cranks the wedge open and shut (the model's crank, following the block out to the
// right); both step in beside the tray as the shell comes down onto it, hands on its flanks as it lands, and step back
// as the rammers come up. Always facing the tray (the turn to the shell only when it is close), so no heading snaps at
// the steps' boundaries; the steps in and out take a second or more (they used to run back in half a second).
function berthaGuide(crew, m, c, h, d) {
  const s = c.s, k = c.k, side = m.beh === 'guide0' ? -1 : 1, H = berthaHome(crew, m, h);
  // the right loader's place follows the wedge's crank out to the right as the block opens
  const wk = side > 0 ? 0.42 * (crew.wedgeK ?? 0) : 0;
  const hx = H.x + crew.rt.x * wk, hz = H.z + crew.rt.z * wk;
  // his work place beside the landing shell, level with its middle
  const off = crew.srad + 0.72, wx = crew.T.x + crew.rt.x * side * off, wz = crew.T.z + crew.rt.z * side * off;
  const e = s === 'shell' ? smooth(k, 0.6, 0.74) : s === 'ram' ? 1 - smooth(k, 0, 0.25) : 0;
  const x = lerp(hx, wx, e), z = lerp(hz, wz, e);
  const dS = d.visible ? d.shell.distanceTo(crew.T) : 9, near = 1 - smooth(dS, 1.1, 2);
  const toT = headingOf(crew.T.x - x, crew.T.z - z), toS = d.visible ? headingOf(d.shell.x - x, d.shell.z - z) : toT;
  const crank = side > 0 && (s === 'open' || s === 'close');
  // at rest he keeps his place's heading; he turns to the tray as he steps in, to the shell once it is close
  const face = toT + wrapPi(toS - toT) * near;
  // at the crank he turns a little after it as the block runs out to the right (it ends 0.7 m out past him)
  const base = side > 0 ? H.h - 0.55 * (crew.wedgeK ?? 0) : H.h;
  const hd = crank ? base : base + wrapPi(face - base) * Math.max(smooth(e, 0, 0.5), near);
  if (shuffle(m, hx, hz, wx, wz, e, H.y, hd)) return;
  const weight = s === 'shell' && near > 0.5 ? windowK(k, 0.82, 0.9, 0.96, 0.995) : 0;
  const reach = s === 'shell' && near > 0.2 && k > 0.74 && k < 0.9;
  m.put(x, H.y, z, hd, crank ? 'operate' : weight > 0 ? 'push' : reach && d.shell.y > H.y + 1.75 ? 'reachUp' : 'stand',
    crank ? k * 2 : weight > 0 ? 0.25 : crew.idleT + m.seed);
  if (crank) wheelGrip(crew, m, 'wedge', 1.2, windowK(k, 0, 0.06, 0.94, 1), 0.74);
  else if (reach || weight > 0) {
    // palms on the near flank: steadying the shell as it is lowered, then as it settles on the tray
    const w = weight > 0 ? weight : windowK(k, 0.74, 0.78, 0.86, 0.9);
    for (const [hand, a] of [['L', -0.22], ['R', 0.22]]) {
      q.copy(d.shell).addScaledVector(crew.u, -crew.half * 0.3 + a);
      q.x += crew.rt.x * side * crew.srad * 0.95; q.z += crew.rt.z * side * crew.srad * 0.95; q.y += 0.03;
      reachable(m, hand, q, w, 0.72);
    }
  }
}

// The bagman (the demo's second loader with the bags, src/bertha/crew.js): the next charge lies on the stage in front
// of him; in the cartridge step he lifts it, carries it up the left of the stage, lays it on the empty tray from the
// side and walks back while the rammers drive it home with the staff (heavyState). Field-frame places on the stage.
const RACK_B = { x: -0.72, z: 4.15 }, VIA_B = { x: -0.92, z: 3.55 };
const _r1 = { x: 0, z: 0 }, _r2 = { x: 0, z: 0 }, _r3 = { x: 0, z: 0 }, _pt3 = { x: 0, z: 0, h: 0 };
const _path = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
void _r3;

// a point and the heading of travel u (0..1) of the way along a polyline of n points
function along(pts, n, u, out) {
  let tot = 0;
  for (let i = 0; i < n - 1; i++) tot += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  let dd = Math.min(1, Math.max(0, u)) * tot;
  const R = 0.3; // the heading turns over the last and first 0.3 m either side of a corner, not on the spot
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (dd <= l || i === n - 2) {
      const t = l > 0 ? Math.min(1, dd / l) : 1;
      out.x = lerp(a.x, b.x, t); out.z = lerp(a.z, b.z, t); out.h = headingOf(b.x - a.x, b.z - a.z);
      if (i < n - 2 && l - dd < R) {
        const c = pts[i + 2], hn = headingOf(c.x - b.x, c.z - b.z);
        out.h += wrapPi(hn - out.h) * 0.5 * smooth(R - (l - dd), 0, R);
      }
      if (i > 0 && dd < R) {
        const z = pts[i - 1], hp = headingOf(a.x - z.x, a.z - z.z);
        out.h = hp + wrapPi(out.h - hp) * (0.5 + 0.5 * smooth(dd, 0, R));
      }
      break;
    }
    dd -= l;
  }
  out.len = tot;
  return out;
}

function berthaBagman(crew, m, c, h) {
  const s = c.s, k = s === 'cartridge' ? c.k : -1, H = berthaHome(crew, m, h), bag = crew.bag, len = crew.bagLen, br = 0.19;
  const rack = crew.rootXZ(m, RACK_B, _r1);
  const faceRack = headingOf(rack.x - H.x, rack.z - H.z);
  // his place beside the tray's middle on the left, facing across it
  const layA = crew.aT;
  crew.trayAt(layA, _st);
  const px = _st.x - crew.rt.x * 0.62, pz = _st.z - crew.rt.z * 0.62, faceTray = headingOf(crew.rt.x, crew.rt.z);
  const via = crew.rootXZ(m, VIA_B, _r2);
  const pts = _path;
  let pose = 'stand', t = crew.idleT + m.seed, x = H.x, z = H.z, hd = faceRack, held = 0, lift = 1;
  if (k >= 0 && k < 0.1) { pose = 'lift'; lift = smooth(k, 0, 0.1); t = lift; held = smooth(k, 0.015, 0.045); }
  else if (k >= 0.1 && k < 0.4) {
    pts[0].x = H.x; pts[0].z = H.z; pts[1].x = via.x; pts[1].z = via.z; pts[2].x = px; pts[2].z = pz;
    const u = smooth(k, 0.1, 0.4) * 0.9 + ((k - 0.1) / 0.3) * 0.1; // an easy start and stop, never quite standing still
    const P = along(pts, 3, u, _pt3);
    x = P.x; z = P.z;
    hd = P.h;
    hd = faceRack + wrapPi(hd - faceRack) * smooth(u, 0, 0.12);
    hd += wrapPi(faceTray - hd) * smooth(u, 0.88, 1);
    pose = 'carryWalk'; t = (u * P.len) / CSTRIDE; held = 1;
  } else if (k >= 0.4 && k < 0.6) {
    // he stoops to lay it in the trough (the lift played part of the way back) and lets go
    x = px; z = pz; hd = faceTray;
    if (k < 0.55) { pose = 'lift'; t = 1 - 0.45 * smooth(k, 0.4, 0.5) + 0.45 * smooth(k, 0.5, 0.55); } else pose = 'stand';
    held = 1 - smooth(k, 0.47, 0.52);
  }
  else if (k >= 0.6 && k < 0.95) {
    // back: he turns round where he stands, then walks; the last third of the way he turns to face his bag again
    pts[0].x = px; pts[0].z = pz; pts[1].x = via.x; pts[1].z = via.z; pts[2].x = H.x; pts[2].z = H.z;
    const u = k < 0.67 ? 0 : smooth(k, 0.67, 0.95) * 0.9 + ((k - 0.67) / 0.28) * 0.1;
    const P = along(pts, 3, u, _pt3);
    x = P.x; z = P.z;
    hd = faceTray + wrapPi(P.h - faceTray) * smooth(k, 0.6, 0.69);
    hd += wrapPi(faceRack - hd) * smooth(u, 0.7, 1);
    if (k < 0.67) { pose = 'stand'; t = crew.idleT + m.seed; } else { pose = 'walk'; t = (u * P.len) / STRIDE; }
  }
  m.put(x, H.y, z, hd, pose, t);
  // the charge: on the stage at his feet, then in his arms, then laid on the tray and driven home ahead of the staff
  const fx = -Math.sin(m.h), fz = -Math.cos(m.h);
  // (it lies across his way to it, so he lifts it by its ends without turning it)
  // (it stands on end, so he takes it by its sides at knee height and turns it level as he straightens)
  let cx = rack.x, cy = H.y + len / 2, cz = rack.z, yaw = faceRack - Math.PI / 2, pitch = Math.PI / 2, vis = true, under = 1, e = 1;
  if (k >= 0 && k < 0.4) {
    const hx = m.x + fx * 0.42, hz = m.z + fz * 0.42, hy = H.y + 1.07;
    e = k < 0.1 ? smooth(lift, 0.3, 1) : 1;
    cx = lerp(rack.x, hx, e); cz = lerp(rack.z, hz, e); cy = lerp(H.y + len / 2, hy, e);
    const y0 = faceRack - Math.PI / 2, y1 = m.h - Math.PI / 2;
    yaw = y0 + wrapPi(y1 - y0) * e;
    pitch = (Math.PI / 2) * (1 - e);
    under = e;
  } else if (k >= 0.4) {
    const hx = m.x + fx * 0.42, hz = m.z + fz * 0.42, hy = H.y + 1.07;
    // laid down from his arms onto the trough, then (once the staff's head reaches it) pushed up into the chamber
    const e = smooth(k, 0.4, 0.5), a = crew.staffA != null ? Math.max(layA, crew.staffA + len / 2) : layA;
    crew.trayAt(a, _st);
    _st.addScaledVector(Y, -crew.srad + br); // (the tray's shell centre is the shell's: the bag lies lower in the trough)
    cx = lerp(hx, _st.x, e); cy = lerp(hy, _st.y, e); cz = lerp(hz, _st.z, e);
    yaw = (m.h - Math.PI / 2) + wrapPi(crew.az - (m.h - Math.PI / 2)) * e;
    pitch = Math.asin(crew.u.y) * e;
    vis = k < 0.95;
  }
  _st.set(cx, cy, cz);
  crew.placeProp(bag, _st, yaw, pitch, vis);
  if (held > 0.01) {
    const nx = -Math.sin(yaw) * Math.cos(pitch), ny = Math.sin(pitch), nz = -Math.cos(yaw) * Math.cos(pitch);
    // carried: under its two ends; on end at the rack: on its sides, level with its top third
    const sx = Math.cos(m.h), sz = -Math.sin(m.h);
    for (const [hand, sg] of [['L', -1], ['R', 1]]) {
      const ax = cx + nx * len * 0.38 * sg, ay = cy + ny * len * 0.38 * sg - br * 0.85 * under, az = cz + nz * len * 0.38 * sg;
      const bx = cx + sx * br * 1.05 * sg, by = cy + len * 0.15, bz = cz + sz * br * 1.05 * sg;
      m.hand(hand, lerp(bx, ax, e), lerp(by, ay, e), lerp(bz, az, e), held);
    }
  }
}

// The Karl's two loaders: at their geared breech controls for the wedge (facing the way they stand, so the turn to the
// breech at the start of the step is gone), in beside the tray's rear end as the shell is lowered onto it, palms on
// its flanks as it lands, back to their places at a walk as the rammer drive comes up (they used to step back in half
// a second); at the controls again to feed the charge.
function karlGuide(crew, m, c, h, d) {
  const s = c.s, k = c.k, side = m.beh === 'guide0' ? -1 : 1;
  const open = s === 'open' || s === 'close', feed = s === 'cartridge' && k >= 0.64;
  q.copy(crew.T).addScaledVector(crew.u, -crew.half * 0.45);
  const off = crew.srad + 0.46, wx = q.x + crew.rt.x * side * off, wz = q.z + crew.rt.z * side * off;
  const e = s === 'shell' ? smooth(k, 0.66, 0.8) : s === 'ram' ? 1 - smooth(k, 0, 0.15) : 0;
  const x = lerp(h.x, wx, e), z = lerp(h.z, wz, e);
  const dS = d.visible ? d.shell.distanceTo(crew.T) : 9, near = 1 - smooth(dS, 1.4, 2.6);
  const toT = headingOf(crew.T.x - x, crew.T.z - z), toS = d.visible ? headingOf(d.shell.x - x, d.shell.z - z) : toT;
  const hd = h.h + wrapPi(toT + wrapPi(toS - toT) * near - h.h) * Math.max(smooth(e, 0, 0.5), near * smooth(e, 0, 0.3));
  if (shuffle(m, h.x, h.z, wx, wz, e, h.y, hd)) return;
  const weight = s === 'shell' && near > 0.5 ? windowK(k, 0.84, 0.9, 0.96, 0.995) : 0;
  m.put(x, h.y, z, hd, open || feed ? 'operate' : weight > 0 ? 'push' : 'stand',
    open ? k * 2 : feed ? smooth(k, 0.7, 0.91) : weight > 0 ? 0.25 : crew.idleT + m.seed);
  if (open) control(crew, m, h, (s === 'open' ? k : 1 - k) * 2, windowK(k, 0, 0.08, 0.92, 1), 'breech');
  else if (feed) control(crew, m, h, smooth(k, 0.7, 0.91), windowK(k, 0.64, 0.7, 0.91, 0.98), 'breech');
  else if (weight > 0) {
    // palms on the near flank; nobody tries to take a two-ton shell's weight by hand
    for (const [hand, a] of [['L', -0.22], ['R', 0.22]]) {
      q.copy(d.shell).addScaledVector(crew.u, -crew.half * 0.45 + a);
      q.x += crew.rt.x * side * crew.srad * 0.92; q.z += crew.rt.z * side * crew.srad * 0.92; q.y += 0.03;
      reachable(m, hand, q, weight);
    }
  }
}

// Do not draw a locked hand if the work point is beyond the man's actual arm span. This is especially
// important for the men below Karl's carrier deck and the observers beside Gustav's raised platform.
function reachable(m, hand, target, weight, max = 0.84) {
  const shoulderY = m.y + 1.42 * m.root.scale.x;
  const distance = Math.hypot(target.x - m.x, target.y - shoulderY, target.z - m.z);
  if (distance > max * m.root.scale.x) return;
  m.hand(hand, target.x, target.y, target.z, weight);
}

function control(crew, m, h, turns, weight, kind) {
  const d = drill(crew);
  let ctl = d.controls.get(m.role);
  if (!ctl) {
    const root = new THREE.Group();
    root.name = `${kind}-control-${m.role}`;
    d.root.add(root);
    mesh(root, new THREE.CylinderGeometry(0.04, 0.065, 0.92, 8), d.steel, 0, 0.46);
    const wheel = new THREE.Group();
    wheel.position.y = 1.02;
    root.add(wheel);
    mesh(wheel, new THREE.TorusGeometry(0.19, 0.018, 6, 16), d.steel);
    for (let i = 0; i < 3; i++) {
      const spoke = mesh(wheel, new THREE.BoxGeometry(0.014, 0.36, 0.014), d.steel);
      spoke.rotation.z = i * Math.PI / 3;
    }
    ctl = { root, wheel };
    d.controls.set(m.role, ctl);
  }
  // A small control station is fixed relative to the man's safe working place, not the moving block.
  const heading = m.h, g = crew.kind === 'gustav';
  // (elsewhere than the Gustav the station stands 0.36 m off, not 0.46: at 0.46 the far half of the rim was out of a
  // man's reach and the hands stopped 13 cm short of it)
  const off = g ? 0.46 : 0.36;
  ctl.root.position.set(h.x - Math.sin(heading) * off, h.y, h.z - Math.cos(heading) * off);
  ctl.root.rotation.y = heading;
  ctl.wheel.rotation.z = turns * Math.PI * 2;
  ctl.root.updateWorldMatrix(true, true);
  for (const [hand, offset] of [['L', 0], ['R', Math.PI]]) {
    // the Gustav's men keep their hands on the turning rim; the others hold it at ten and two and work it hand over
    // hand (a hand going right round the rim twisted the arm through the body at the bottom of the turn)
    const a = g ? turns * Math.PI * 2 + offset : Math.PI / 2 + (hand === 'L' ? 1 : -1) * (1.0 + 0.35 * Math.sin(turns * Math.PI * 2 + offset));
    point(crew, ctl.root, q, Math.cos(a) * 0.19, 1.02 + Math.sin(a) * 0.19, 0.04);
    m.hand(hand, q.x, q.y, q.z, weight);
  }
}

function chargeMan(crew, m, c, h, d) {
  if (c.s !== 'cartridge') {
    m.put(h.x, h.y, h.z, h.h, 'stand', crew.idleT + m.seed);
    return;
  }
  const k = c.k, g = crew.kind === 'gustav', start = d.charge;
  if (g) point(crew, crew.rig.anchors.liftCharge, start);
  // the Karl's charge comes up the ramp behind the tray on the bore line: the ramp carries it (no support cart)
  else start.copy(crew.T).addScaledVector(crew.u, -crew.slen - 0.6);
  const roll = smooth(k, 0.14, 0.64), feed = smooth(k, 0.7, 0.91);
  q.copy(crew.T).addScaledVector(crew.u, -crew.bagLen * 0.5);
  const center = d.chargeCenter ??= new THREE.Vector3();
  center.copy(start).lerp(q, roll);
  center.addScaledVector(crew.u, feed * (crew.T.distanceTo(crew.B) + crew.bagLen * 1.1));
  d.chargeVisible = k < 0.93;
  d.chargeCart.position.copy(center);
  d.chargeCart.rotation.y = crew.az;
  supportCart(d.chargeCart, crew.workY);
  crew.placeProp(crew.bag, center, crew.az, Math.asin(crew.u.y) * roll, d.chargeVisible);
  // The delivery winch handles the heavy charge. The feed crew takes control once the trolley
  // is docked, so the charge man never walks through the rammer crew in the platform's narrow aisle.
  const active = k > 0.12 && k < 0.65;
  m.put(h.x, h.y, h.z, h.h, active ? g ? 'operate' : 'signal' : 'stand', roll * 3);
  if (g) control(crew, m, h, roll * 3, windowK(k, 0.12, 0.18, 0.62, 0.67), 'charge');
}

export function heavyProps(crew, c) {
  if (!HEAVY.has(crew.kind)) return false;
  const d = drill(crew);
  crew.placeProp(crew.shellA, d.shell, d.shellYaw, d.shellPitch, d.visible);
  crew.placeProp(crew.shellB, d.pickup, crew.kind === 'gustav' ? d.shellYaw : (crew.rig.pickYaw ?? crew.az), 0, d.waiting);
  if (crew.kind === 'gustav' && (c.s === 'shell' && c.k >= 0.28 || c.s === 'ram')) {
    point(crew, crew.rig.pivots.hoist2, q, 0, 0.5, 0);
    crew.placeProp(crew.bag, q, crew.az, 0, true);
  }
  for (let i = 0; i < d.sling.length; i++) {
    const s = d.sling[i];
    s.visible = crew.kind !== 'gustav' && c.s === 'shell' && c.k >= 0.18 && c.k < 0.96;
    if (!s.visible) continue;
    q.copy(d.shell);
    const offset = (i ? 1 : -1) * crew.slen * 0.23;
    q.x -= Math.sin(d.shellYaw) * offset;
    q.z -= Math.cos(d.shellYaw) * offset;
    q.y += crew.srad * 0.65;
    span(s, d.hook, q);
  }
  if (d.cart) {
    d.cart.visible = c.s === 'shell' && c.k >= 0.59 || c.s === 'ram';
    const at = c.s === 'ram' ? crew.T : d.shell;
    d.cart.position.copy(at);
    d.cart.rotation.set(0, crew.az, 0);
    supportCart(d.cart, crew.workY);
  }
  if (d.chargeCart) d.chargeCart.visible = crew.kind !== 'karl' && c.s === 'cartridge' && c.k < 0.92; // the Karl's ramp carries it
  crew.staff.visible = crew.staffA != null;
  if (crew.staff.visible) {
    crew.trayAt(crew.staffA, crew.staff.position);
    crew.staff.rotation.set(Math.asin(crew.u.y), crew.az, 0);
  }
  if (d.drive) {
    d.drive.visible = c.s === 'shell' && c.k > 0.97 || c.s === 'ram';
    crew.trayAt(crew.aT - crew.half - crew.staffLen * 0.7, d.drive.position);
    d.drive.rotation.set(Math.asin(crew.u.y), crew.az, 0);
  }
  return true;
}

// the walking and reaching helpers, for the other kinds' own drills (render/ww1/paris.js)
export { shuffle, reachable, along, wheelGrip };

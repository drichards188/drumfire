import * as THREE from 'three';
import { smooth, ramp, lerp, wrapPi, headingOf } from './anim.js';

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
  }
  if (crew.kind === 'bertha') {
    const slinger = crew.byRole.get('cart');
    if (slinger) slinger.sx = 2.5;
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
    const look = active ? d.hook : crew.T;
    m.put(h.x, h.y, h.z, headingOf(look.x - h.x, look.z - h.z), active ? 'signal' : 'stand', 0.12);
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
const BERTHA_RAM = { rammer1: { side: -1, gap: 0.75, rear: 0.3 }, rammer2: { side: 1, gap: 1.35, rear: 0.9 } };
const GRIP = 0.45; // the staff travel per heave
const _st = new THREE.Vector3();

function berthaStation(crew, r, head, out) {
  const tz = crew.rig.berthaModel?.trayZ, rear = crew.aT - (tz ? (tz.z1 - tz.z0) / 2 : 0.9);
  const a = Math.max(rear - 0.98, Math.min(rear - r.rear, head - r.gap));
  crew.trayAt(a, out);
  out.x += crew.rt.x * r.side * 0.34; out.z += crew.rt.z * r.side * 0.34;
  return a;
}

function berthaRammer(crew, m, c, h) {
  const s = c.s, k = c.k, r = BERTHA_RAM[m.role] ?? BERTHA_RAM.rammer2;
  const fwd = headingOf(crew.u.x, crew.u.z);
  const start = crew.aT - crew.half - 0.04; // the staff's head against the shell's base before the stroke
  // to the station and back: a short shuffle, still facing the breech (backwards or sideways steps, not a turn)
  const shuffle = (into) => {
    berthaStation(crew, r, start, _st);
    const kk = into ? smooth(k, 0, 0.12) : 1 - smooth(k, 0, 0.12);
    const x = lerp(h.x, _st.x, kk), z = lerp(h.z, _st.z, kk);
    const moving = kk > 0.01 && kk < 0.99;
    m.put(x, h.y, z, h.h + wrapPi(fwd - h.h) * kk, moving ? 'walk' : into ? 'ramLow' : 'stand',
      moving ? Math.hypot(_st.x - h.x, _st.z - h.z) * kk / 1.15 : crew.idleT + m.seed);
  };
  if (s === 'cartridge' && k < 0.12) return shuffle(false);
  if (s !== 'ram' || crew.staffA == null) return m.put(h.x, h.y, h.z, h.h, 'stand', crew.idleT + m.seed);
  if (k < 0.12) return shuffle(true);
  const a = berthaStation(crew, r, crew.staffA, _st);
  // each heave: the hands go along with the wood for 80% of GRIP while he lunges into it, then let go and take a
  // fresh hold behind as he straightens (the pose's cycle: lunge over its first half, recover over the second)
  const phase = ((((crew.staffA - start) / GRIP) % 1) + 1) % 1, push = phase < 0.8;
  const travel = push ? phase : 0.8 * (1 - smooth(phase, 0.8, 1));
  m.put(_st.x, h.y, _st.z, fwd, 'ramLow', push ? 0.5 * smooth(phase, 0, 0.8) : 0.5 + 0.5 * smooth(phase, 0.8, 1));
  const hold = windowK(k, 0.12, 0.17, 0.97, 1) * (1 - windowK(phase, 0.8, 0.85, 0.95, 1));
  for (const [hand, off] of [['L', 0.15], ['R', 0.42]]) {
    crew.trayAt(Math.min(crew.staffA - 0.1, a + off + travel * GRIP), q);
    m.hand(hand, q.x, q.y, q.z, hold); // (the stoop brings the staff in reach: reachable() measures from a standing man)
  }
}

// Do not draw a locked hand if the work point is beyond the man's actual arm span. This is especially
// important for the men below Karl's carrier deck and the observers beside Gustav's raised platform.
function reachable(m, hand, target, weight) {
  const shoulderY = m.y + 1.42 * m.root.scale.x;
  const distance = Math.hypot(target.x - m.x, target.y - shoulderY, target.z - m.z);
  if (distance > 0.84 * m.root.scale.x) return;
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
  const heading = m.h;
  ctl.root.position.set(h.x - Math.sin(heading) * 0.46, h.y, h.z - Math.cos(heading) * 0.46);
  ctl.root.rotation.y = heading;
  ctl.wheel.rotation.z = turns * Math.PI * 2;
  ctl.root.updateWorldMatrix(true, true);
  for (const [hand, offset] of [['L', 0], ['R', Math.PI]]) {
    const a = turns * Math.PI * 2 + offset;
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

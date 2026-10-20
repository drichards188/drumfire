import * as THREE from 'three';
import { buildCrewman, CREW_GAITS } from '../models/v/crew.js';
import { buildCartridge } from '../models/shells.js';

// The Bertha's detachment as figures (models/v/crew.js, the German 1917 outfits): one man at each station and
// the hands about the loading stage, the shell cart and the charge store. Each man is a small state machine
// over the game: he walks to where his work is (turning as he goes, the walk cycle matched to his speed),
// cross-fades between poses, and his hands are put on the real moving parts every frame with the figure's IK:
// the rims of the line and elevation handwheels as they turn, the breech crank, the crane's winch, the
// rammer staff as it goes up the bore, the shell swinging on the hook, a powder bag carried from the rack to
// the tray, the lanyard. Before the shot the men at the gun clear to cover and clap their hands over their
// ears; after it they come back.
//
// The man at the player's station is the player: he is drawn (head hidden) so the first-person camera sits at
// his eyes (eye()) and sees his own arms on the controls, and he never walks off to cover.
//
// Frames: 'trav' men ride the carriage (y = 0 the bed top, the stage at rig.loadStage), 'root' men stand on
// the position (y = 0 the ground). update(dt, game, t, player, phase): phase = { load: { id, k }, fire: k | -1 }
// is the loading step in hand and the firing in progress (index.js computes it for the props as well).
const LP = 'lp';
const MEN = [
  { id: 'cmd', frame: 'root', outfit: 'german-cap', home: [-7.2, 0, 0.4, -Math.PI / 2 - 0.2] },
  { id: 'trav', frame: 'trav', outfit: 'german', home: [-1.66, 0, 1.42, -Math.PI / 2], cover: [-3.4, 0, 3.0, -Math.PI / 2 - 0.6] },
  { id: 'elev', frame: 'trav', outfit: 'german', home: [1.69, 0, 1.32, Math.PI / 2], cover: [3.0, 0, 5.8, Math.PI / 2 + 0.6] },
  { id: 'load', frame: 'trav', outfit: 'german-drill', home: [1.02, LP, 2.55, 0], cover: [1.1, LP, 4.6, 0.3] },
  { id: 'ram2', frame: 'trav', outfit: 'german-drill', home: [-1.02, LP, 2.75, 0], cover: [-1.08, LP, 4.3, -0.3] },
  { id: 'crane', frame: 'trav', outfit: 'german-drill', home: [1.33, LP, 3.38, -0.98], cover: [1.18, LP, 3.95, 0.2] },
  { id: 'cart', frame: 'trav', outfit: 'german-drill', home: [2.72, 0, 3.0, -Math.PI / 2], cover: [4.7, 0, 6.4, 0.5] },
  { id: 'fire', frame: 'root', outfit: 'german', home: [-15.2, 0, 7.4, -Math.PI / 2 + 0.45] },
  { id: 'store', frame: 'root', outfit: 'german-cap', home: [-5.4, 0, 5.4, 0.4] },
];
// stations the player can take, and the man each one is (the loader's station is an eye at the back of the stage that
// watches the whole loading detachment, index.js: no man of it is the player)
const PLAYER_MAN = { cmd: 'cmd', trav: 'trav', elev: 'elev', load: null, fire: 'fire' };
const WALK = 1.35, TURN = 5; // m/s, rad/s
const RACK = [-1.05, 4.6]; // the charge bags waiting at the back of the stage (x, z)
// the layers' footboards beside the carriage (trav frame, x0 x1 z0 z1, the board's top over the bed): they stand on
// them at the handwheels, with the dials and the sight at eye height, and step down to go to cover
export const BOARDS = [[-2.05, -1.25, 1.02, 1.95], [1.25, 2.05, 0.95, 1.9]];
export const BOARD_Y = 0.3;
const onBoard = (x, z) => BOARDS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
const STORE_RUN = [[-5.4, 5.4], [-2.4, 5.6]]; // the store man's walk: the charge store to the foot of the ladder

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _g = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3();
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function propOf(built) {
  const g = new THREE.Group();
  for (const p of built.parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = true;
    g.add(m);
  }
  g.visible = false;
  return g;
}

export class BerthaCrew {
  constructor(rig, game) {
    this.rig = rig;
    this.game = game;
    this.lp = rig.loadStage;
    this.player = null;
    this.men = MEN.map((d, i) => {
      const fig = buildCrewman({ outfit: d.outfit, skin: [0, 1, 2, 0, 3, 1, 2, 0, 1][i], height: 1.7 + ((i * 7) % 5) * 0.022 });
      const parent = d.frame === 'trav' ? rig.pivots.traverse : rig.root;
      parent.add(fig.root);
      const y = d.home[1] === LP ? this.lp : d.frame === 'trav' && onBoard(d.home[0], d.home[2]) ? BOARD_Y : d.home[1];
      const m = { d, fig, x: d.home[0], y, z: d.home[2], h: d.home[3], pose: 'stand', t: i * 0.37, walkT: 0, hands: null };
      fig.root.position.set(m.x, m.y, m.z);
      fig.root.rotation.y = m.h;
      // a bag or the brass case in the carrier's arms, and the store man's bag
      if (d.id === 'ram2' || d.id === 'store') {
        m.bag = propOf(buildCartridge('m42'));
        m.bag.rotation.y = Math.PI / 2;
        fig.anchors.carry.add(m.bag);
        if (d.id === 'ram2') {
          m.caseProp = propOf(buildCartridge('m42c'));
          m.caseProp.rotation.y = Math.PI / 2;
          fig.anchors.carry.add(m.caseProp);
        }
      }
      return m;
    });
    this.by = Object.fromEntries(this.men.map((m) => [m.d.id, m]));
    this.storeLeg = 0;
    this.storeWait = 0;
    this.craneSpin = 0;
  }

  // ---------------------------------------------------------------- helpers
  // walk toward (x, z), then turn to heading h; true when there and facing it
  goTo(m, x, z, h, dt) {
    const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d > 0.06) {
      const step = Math.min(d, WALK * dt);
      m.x += (dx / d) * step;
      m.z += (dz / d) * step;
      m.walkT += step / CREW_GAITS.walk.stride;
      const want = Math.atan2(-dx, -dz);
      m.h += Math.max(-TURN * dt, Math.min(TURN * dt, wrap(want - m.h)));
      return false;
    }
    m.x = x;
    m.z = z;
    m.h += Math.max(-TURN * dt, Math.min(TURN * dt, wrap(h - m.h)));
    return Math.abs(wrap(h - m.h)) < 0.05;
  }
  at(m, spot, dt) {
    return this.goTo(m, spot[0], spot[2], spot[3], dt);
  }
  // a world point into the man's root space
  local(m, p, out) {
    return m.fig.root.worldToLocal(out.copy(p));
  }
  // both hands on a handwheel's rim at ten and two (`right` is the rim angle of the right hand; a = 0 is
  // the top, + toward the wheel's +Z), working hand over hand as the wheel turns
  wheelGrip(m, wheel, right = 1) {
    const w = this.rig.wheels[wheel];
    if (!w) return;
    const rot = w.node.rotation.x;
    for (const [side, a, ph] of [['R', right, 0], ['L', -right, Math.PI]]) {
      const ang = a + 0.4 * Math.sin(rot + ph);
      _v.set(-0.03, Math.cos(ang) * w.R, Math.sin(ang) * w.R);
      w.node.localToWorld(_v);
      m.fig.reach(side, this.local(m, _v, _w), 1);
    }
  }
  handsOn(m, pR, pL) {
    if (pR) m.fig.reach('R', this.local(m, pR, _w), 1);
    if (pL) m.fig.reach('L', this.local(m, pL, _w), 1);
  }

  // ---------------------------------------------------------------- the frame
  update(dt, game = this.game, t = 0, player = null, phase = { load: { id: null, k: 0 }, fire: -1 }) {
    if (!game) return;
    const g = game.gun, rig = this.rig, P = rig.props;
    // the wheels turn with what they drive
    const W = rig.wheels;
    W.trav.node.rotation.x = -g.tr * 160;
    W.elev.node.rotation.x = g.el * 70;
    W.wedge.node.rotation.x = -g.breech * 9;
    if (phase.load.id === 'hoist') this.craneSpin = phase.load.k * 40;
    W.crane.node.rotation.x = this.craneSpin;
    // the player's man: drawn, head and neck hidden (the camera is at his eyes, a little behind them)
    const pm = PLAYER_MAN[player] ?? null;
    if (pm !== this.player) {
      for (const m of this.men) m.fig.bones.neck.scale.setScalar(m.d.id === pm ? 0.001 : 1);
      this.player = pm;
    }
    // the shot: from the whistle (the start of the pull) to a while after the round has gone
    const tf = game.time - g.firedAt;
    const firing = phase.fire >= 0;
    const clear = firing || (tf >= 0 && tf < 3);
    const k8 = 1 - Math.exp(-dt * 9);
    const L = phase.load;

    for (const m of this.men) {
      const id = m.d.id, me = id === pm;
      m.t += dt * 0.35;
      let pose = 'stand', pt = m.t, hands = null, moving = false;
      const home = m.d.home, homeSpot = [home[0], 0, home[2], home[3]];
      const toCover = clear && m.d.cover && !me;
      if (toCover) {
        moving = !this.at(m, m.d.cover, dt);
        pose = moving ? 'walk' : 'ears';
      } else {
        switch (id) {
          case 'cmd': {
            if (firing) pose = phase.fire < 0.5 ? 'signal' : 'ears';
            else if (clear) pose = 'ears';
            else if (game.order && (!game.order.acked || game.time - game.order.at < 3)) pose = 'phone';
            else pose = 'stand';
            break;
          }
          case 'trav':
          case 'elev': {
            moving = !this.at(m, homeSpot, dt);
            const order = game.order, laid = game.laid(order);
            const busy = id === 'trav' ? this.lastTr != null && Math.abs(g.tr - this.lastTr) > 1e-7 : this.lastEl != null && Math.abs(g.el - this.lastEl) > 1e-7;
            const work = busy || (order?.acked && !(id === 'trav' ? laid.line : laid.elev)) || me;
            if (moving) pose = 'walk';
            else if (work) {
              pose = 'operate';
              hands = id === 'trav' ? 'wheel:trav' : 'wheel:elev';
              // setting the clinometer: the right hand goes to the quadrant on the cradle
              if (id === 'elev' && game.station === 'elev' && game.input.quad) hands = 'quad';
            }
            break;
          }
          case 'load':
          case 'ram2':
          case 'crane':
          case 'cart':
            ({ pose, hands, moving } = this.loader(m, game, L, dt, homeSpot));
            break;
          case 'fire': {
            m.x = home[0];
            m.z = home[2];
            if (firing) {
              pose = 'lanyard';
              pt = 0.25 + 0.5 * phase.fire;
            } else if (tf >= 0 && tf < 1.2) {
              pose = 'lanyard';
              pt = 0.76;
            } else pose = me ? 'stand' : 'crouch';
            break;
          }
          case 'store':
            ({ pose, moving } = this.storeRun(m, dt, clear));
            break;
        }
      }
      // the layers step up onto their footboards and down off them
      if (m.d.frame === 'trav' && m.d.home[1] !== LP) {
        const want = onBoard(m.x, m.z) ? BOARD_Y : 0;
        m.y += Math.max(-dt * 1.6, Math.min(dt * 1.6, want - m.y));
      }
      // pose, cross-faded; the walk cycle runs with the distance covered
      if (pose === 'walk' || pose === 'carryWalk') pt = m.walkT;
      m.fig.root.position.set(m.x, m.y, m.z);
      m.fig.root.rotation.y = m.h;
      m.fig.root.updateMatrixWorld(true);
      // a new pose fades in over about half a second
      if (pose !== m.pose) {
        m.pose = pose;
        m.since = 0;
      }
      m.since = (m.since ?? 1) + dt;
      m.fig.pose(pose, pt, m.since < 0.6 ? k8 : 1);
      // hands on the work
      if (hands === 'wheel:trav') this.wheelGrip(m, 'trav', 1.0);
      else if (hands === 'wheel:elev') this.wheelGrip(m, 'elev', -1.0);
      else if (hands === 'quad') {
        rig.anchors.quadrant.getWorldPosition(_f);
        this.handsOn(m, _f, null);
      } else if (hands === 'wheel:wedge') this.wheelGrip(m, 'wedge', 1.2);
      else if (hands === 'wheel:crane') this.wheelGrip(m, 'crane', 1.2);
      else if (hands === 'staff') {
        // two hands along the rammer staff, where it passes the man
        const st = P.rammer;
        st.updateMatrixWorld(true);
        const z0 = st.parent.worldToLocal(_f.copy(m.fig.root.getWorldPosition(_v))).z - st.position.z;
        for (const [side, dz] of [['L', -0.35], ['R', -0.78]]) {
          _v.set(0, 0, Math.max(0.1, Math.min(4.1, z0 + dz)));
          st.localToWorld(_v);
          m.fig.reach(side, this.local(m, _v, _w), 1);
        }
      } else if (hands === 'shell' || hands === 'shellLow') {
        // hands on the shell hanging from the hook (or still on the cart)
        const s = hands === 'shell' ? P.hook[game.selShell] : null;
        const src = s?.visible ? s : this.cartShell?.[game.selShell];
        if (src) {
          src.getWorldPosition(_f);
          m.fig.root.getWorldPosition(_v);
          _w.subVectors(_v, _f).setY(0).normalize().multiplyScalar(0.24); // the near side of the shell
          for (const [side, off] of [['L', 0.14], ['R', -0.14]]) {
            _v.copy(_f).add(_w);
            _v.y += off;
            m.fig.reach(side, this.local(m, _v, _g), 1);
          }
        }
      } else if (hands === 'tray') {
        const b = m.trayProp;
        if (b?.visible) {
          b.getWorldPosition(_f);
          _v.set(0, 0, 0.3);
          b.localToWorld(_v);
          this.handsOn(m, _v, _v);
        }
      }
      m.bag && (m.bag.visible = m.carrying === 'bag');
      m.caseProp && (m.caseProp.visible = m.carrying === 'case');
    }
    this.lastTr = g.tr;
    this.lastEl = g.el;
  }

  // the stage and cart hands, by the loading step in hand and how far through it is
  loader(m, game, L, dt, homeSpot) {
    const id = m.d.id, g = game.gun, lp = this.lp, k = L.k;
    let pose = 'stand', hands = null, moving = false;
    m.carrying = null;
    m.trayProp = null;
    const go = (x, z, h) => (moving = !this.goTo(m, x, z, h, dt));
    switch (L.id) {
      case 'open':
      case 'close':
      case 'unload':
        if (id === 'load') {
          go(1.0 + 0.3 * g.breech, 2.42, -0.2);
          pose = moving ? 'walk' : 'operate';
          if (!moving) hands = 'wheel:wedge';
        } else this.at(m, homeSpot, dt) || (moving = true);
        break;
      case 'hoist': {
        const swing = 1 - smooth(0, 0.15, k) + smooth(0.55, 0.8, k);
        if (id === 'crane') {
          this.at(m, homeSpot, dt) || (moving = true);
          pose = moving ? 'walk' : 'haul';
          if (!moving) hands = 'wheel:crane';
        } else if (id === 'cart') {
          this.at(m, homeSpot, dt) || (moving = true);
          if (!moving) {
            if (k < 0.32) { pose = 'crouch'; hands = 'shellLow'; }
            else if (k < 0.5) { pose = 'reachUp'; hands = 'shell'; }
          }
        } else if (id === 'load' || id === 'ram2') {
          // the two loaders take the shell as it comes over the tray and guide it down
          const x = id === 'load' ? 1.02 : -1.02;
          go(x, 2.95, id === 'load' ? 0.45 : -0.45);
          if (!moving && swing > 0.6 && k > 0.6) { pose = 'reachUp'; hands = 'shell'; }
        }
        break;
      }
      case 'ram': {
        // both loaders on the staff behind the tray, walking it up the bore until the tray's end stops them
        if (id === 'load' || id === 'ram2') {
          const st = this.rig.props.rammer, z1 = this.rig.trayZ.z1;
          const head = st.visible ? st.position.z : z1 + 0.8;
          const z = Math.max(z1 + (id === 'load' ? 0.3 : 0.9), head + (id === 'load' ? 0.75 : 1.35));
          go(0.32, Math.min(z, 4.85), 0); // both in file on the right of the staff, clear of the loader's step
          pose = 'ram';
          hands = 'staff';
        } else this.at(m, homeSpot, dt) || (moving = true);
        break;
      }
      case 'bag':
      case 'case':
        // the second loader brings a bag (or the brass case) from the rack, the chief loader pushes it home
        if (id === 'ram2') {
          if (k < 0.35) {
            const there = k > 0.18;
            if (!there) go(RACK[0], RACK[1], Math.PI);
            else go(-1.02, 2.75, -0.7);
            m.carrying = L.id;
            pose = moving ? 'carryWalk' : 'carry';
          } else {
            go(-1.02, 2.75, -0.7);
            pose = 'push';
            m.trayProp = L.id === 'bag' ? this.rig.props.bags[0] : this.rig.props.case;
            hands = 'tray';
          }
        } else this.at(m, homeSpot, dt) || (moving = true);
        break;
      default:
        this.at(m, homeSpot, dt) || (moving = true);
    }
    if (moving && pose !== 'carryWalk') pose = 'walk';
    return { pose, hands, moving };
  }

  // the store man carries bags from the charge store to the foot of the ladder and back
  storeRun(m, dt, clear) {
    if (clear) return { pose: 'ears', moving: false };
    const [a, b] = STORE_RUN, to = this.storeLeg ? a : b;
    m.carrying = this.storeLeg === 0 ? 'bag' : null;
    if (this.storeWait > 0) {
      this.storeWait -= dt;
      return { pose: m.carrying ? 'carry' : 'stand', moving: false };
    }
    const there = this.goTo(m, to[0], to[1], this.storeLeg ? 0.4 : -Math.PI / 2, dt);
    if (there) {
      this.storeLeg = 1 - this.storeLeg;
      this.storeWait = 4 + (this.storeLeg ? 2 : 6);
    }
    return { pose: there ? 'stand' : m.carrying ? 'carryWalk' : 'walk', moving: !there };
  }

  // the first-person eye of the player's man (world position and heading), after update()
  eye(out) {
    const m = this.by[this.player];
    if (!m) return null;
    // from the (hidden) neck: the head bone sits 0.105 above it, the eyes 0.075 above that
    m.fig.bones.neck.getWorldPosition(out);
    m.fig.root.getWorldQuaternion(_q);
    _f.set(0, 0, -1).applyQuaternion(_q);
    out.addScaledVector(_f, 0.07);
    out.y += 0.18 * m.fig.root.scale.y;
    return Math.atan2(-_f.x, -_f.z);
  }
}

import * as THREE from 'three';
import { V, box, xTube, yTube, zTube, rod, shellGeometry, Parts, vehicleMats, DEG } from '../../kit.js';
import { smoothK, clamp01, instanceOf, setInstance } from './heavy_common.js';
import { mulberry32 } from '../../../noise.js';

// The Gustav's firing position (buildGustavSite, exported through gustav.js), in the frame of the gun's rig
// at az = 0: root y = 0 is the ground (place it where the rig's root is); the rail head is site.railHead (0.55 m)
// above it, as in the rig. Inside, `inner` carries the rail-head frame (rail head y = 0, the ground at GROUND). The firing curve (radius R about (-R, 0, 0)) carries
// TWO parallel double tracks (track centres at x = -2.85, -1.05, 1.05, 2.85 at the gun's station) on a ballast
// bed from a = -0.3 to +0.3 rad (the gun's centre runs on -0.2 to +0.2; its ends need the rest), with a
// straight run-in at the rear. setStage({ survey, track, cranes, ammo, flak, camo }), each 0..1 (a missing key
// leaves that part as it is):
//   survey  the surveyors' stakes along the bed's edges and the centre line, the white tape, the theodolite
//   track   the bed, sleepers and rails laid from the rear (the run-in first) toward the front
//   cranes  the two gantry cranes (Portalkräne) straddling the tracks over the gun: they rise, then the hooks drop
//   ammo    the ammunition train (locomotive, three shell wagons, a charge van) running in on its parallel track
//   flak    four flak positions 80 to 150 m out, built in turn: two 8.8 cm on cruciform mounts, two 2 cm quads
//   camo    the camouflage net on poles over the gun, drawn over from the rear
// Nothing allocates in setStage (instance counts and draw ranges only).
const R = 250;
const XT = [-2.85, -1.05, 1.05, 2.85], GA = 0.7175;
const A0 = -0.3, A1 = 0.3, RUN = 80;
const L_ARC = R * (A1 - A0), LT = RUN + L_ARC;
export const GROUND = -0.55;
const AMMO_X = 10.5; // the ammunition train's track, parallel to the run-in on the right
const WR0 = 0.48; // wagon wheels

// a point at distance s along the bed from its rear end (s = 0 at the far end of the run-in), lateral offset xo
// (the gun frame's x at its station): { x, z, a } with a the heading (rotation.y) of the track there
const _pt = { x: 0, z: 0, a: 0 };
function at(s, xo, out = _pt) {
  if (s < RUN) {
    const t = RUN - s, a = A0;
    out.x = -R + (R + xo) * Math.cos(a) + t * Math.sin(a);
    out.z = -(R + xo) * Math.sin(a) + t * Math.cos(a);
    out.a = a;
  } else {
    const a = A0 + (s - RUN) / R;
    out.x = -R + (R + xo) * Math.cos(a);
    out.z = -(R + xo) * Math.sin(a);
    out.a = a;
  }
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const place = (list, i, x, y, z, yaw, sx = 1, sy = 1, sz = 1) => {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(sx, sy, sz));
  setInstance(list, i, _m);
};

// camouflage net: knotted mesh with garnish (scrim strips in greens and browns), cut out by alpha
function netTexture() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rnd = mulberry32(31);
  g.clearRect(0, 0, S, S);
  const cols = ['#4c5233', '#5d6140', '#6b5e3e', '#3d4229', '#7a6d48', '#525a38'];
  for (let i = 0; i < 520; i++) {
    const x = rnd() * S, y = rnd() * S, w = 10 + rnd() * 34, h = 4 + rnd() * 9;
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI);
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.fillRect(-w / 2, -h / 2, w, h);
    // wrap round the tile edges so the texture repeats seamlessly
    g.restore();
    for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
      if (x + dx > -40 && x + dx < S + 40 && y + dy > -40 && y + dy < S + 40) {
        g.save(); g.translate(x + dx, y + dy); g.rotate(rnd() * Math.PI); g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
      }
    }
  }
  g.strokeStyle = '#2e2a20';
  g.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    const p = (i / 16) * S;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p + S * 0.0, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildGustavSite() {
  const mats = vehicleMats('dgrau');
  const mk = () => new Parts(mats);
  const root = new THREE.Group();
  root.name = 'gustav-site';
  const inner = new THREE.Group();
  inner.position.y = -GROUND;
  root.add(inner);
  const grp = (name) => { const g = new THREE.Group(); g.name = name; inner.add(g); return g; };
  const G = { survey: grp('survey'), track: grp('track'), cranes: grp('cranes'), ammo: grp('ammo'), flak: grp('flak'), camo: grp('camo') };
  const rnd = mulberry32(80);
  const stage = { survey: 0, track: 0, cranes: 0, ammo: 0, flak: 0, camo: 0 };

  // ---------------------------------------------------------------- track: ballast bed, sleepers, rails
  const SEG = 2.0, NSEG = Math.ceil(LT / SEG);
  // the bed: top 9.2 m wide at y -0.17, slopes to the ground, a skirt below for uneven ground; non-indexed,
  // ordered from the rear, so the laid part is a draw range
  const bedPos = new Float32Array(NSEG * 5 * 6 * 3);
  {
    const prof = [[-6.4, GROUND - 0.7], [-5.6, GROUND], [-4.6, -0.17], [4.6, -0.17], [5.6, GROUND], [6.4, GROUND - 0.7]];
    const a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 };
    let o = 0;
    for (let i = 0; i < NSEG; i++) {
      const s0 = i * SEG, s1 = Math.min(LT, s0 + SEG);
      for (let j = 0; j < prof.length - 1; j++) {
        const [u0, y0] = prof[j], [u1, y1] = prof[j + 1];
        const P = (s, u) => { at(s, u, a); return [a.x, a.z]; };
        const [ax, az] = P(s0, u0), [bx, bz] = P(s0, u1), [cx, cz] = P(s1, u1), [dx, dz] = P(s1, u0);
        void b;
        for (const [x, y, z] of [[ax, y0, az], [bx, y1, bz], [cx, y1, cz], [ax, y0, az], [cx, y1, cz], [dx, y0, dz]]) { bedPos[o++] = x; bedPos[o++] = y; bedPos[o++] = z; }
      }
    }
  }
  const bedGeo = new THREE.BufferGeometry();
  bedGeo.setAttribute('position', new THREE.BufferAttribute(bedPos, 3));
  bedGeo.computeVertexNormals();
  {
    // ballast: grey-brown crushed stone, a little speckle from vertex colours
    const n = bedPos.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2), ah = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = 0.85 + rnd() * 0.15;
      col[i * 3] = v * 1.05; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.92;
      uv[i * 2] = bedPos[i * 3] / 4; uv[i * 2 + 1] = bedPos[i * 3 + 2] / 4;
      ah[i] = bedPos[i * 3 + 1] - GROUND;
    }
    bedGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    bedGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bedGeo.setAttribute('aH', new THREE.BufferAttribute(ah, 1));
  }
  // crushed stone: its own plain material (the shared soil is the brown of the ballast boxes)
  const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: 0x8c877c, roughness: 1, metalness: 0, vertexColors: true }));
  bed.receiveShadow = true;
  bed.frustumCulled = false;
  G.track.add(bed);
  // sleepers: one per double track (4 m), two per station, 0.65 m apart
  const SLP = 0.65, NSLP = Math.floor(LT / SLP);
  const PS = mk();
  PS.add('timber', box(4.0, 0.16, 0.26, 0, -0.23, 0));
  const tS = new THREE.Group(); PS.build(tS, { dirt: 0.5, y0: 0.3 });
  const sleepers = instanceOf(tS, NSLP * 2, G.track, 'sleepers');
  for (let i = 0; i < NSLP; i++) {
    const s = i * SLP + SLP / 2;
    for (const [j, xo] of [[0, -1.95], [1, 1.95]]) { at(s, xo); place(sleepers, i * 2 + j, _pt.x, 0, _pt.z, _pt.a); }
  }
  // rails: 8 (two per track), segment boxes along the curve, scaled to each segment's length
  const PRl = mk();
  PRl.add('steel', box(0.07, 0.05, 1, 0, -0.025, 0));
  PRl.add('dark', box(0.03, 0.08, 1, 0, -0.09, 0));
  PRl.add('dark', box(0.14, 0.02, 1, 0, -0.14, 0));
  const tR = new THREE.Group(); PRl.build(tR, { dirt: 0.2, y0: 0.4 });
  const rails = instanceOf(tR, NSEG * 8, G.track, 'rails');
  {
    const a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 };
    let i = 0;
    for (let k = 0; k < NSEG; k++) {
      const s0 = k * SEG, s1 = Math.min(LT, s0 + SEG);
      for (const xt of XT) for (const g of [-GA, GA]) {
        at(s0, xt + g, a); at(s1, xt + g, b);
        place(rails, i++, (a.x + b.x) / 2, 0, (a.z + b.z) / 2, Math.atan2(-(b.x - a.x), -(b.z - a.z)), 1, 1, Math.hypot(b.x - a.x, b.z - a.z) + 0.01);
      }
    }
  }

  // ---------------------------------------------------------------- survey: stakes, tape, theodolite
  const NST = Math.floor(LT / 10);
  const PK = mk();
  PK.add('white', box(0.06, 1.4, 0.06, 0, 0.7, 0));
  for (let k = 0; k < 3; k++) PK.add('rust', box(0.065, 0.2, 0.065, 0, 0.2 + k * 0.4, 0), { tint: 0xd04030 });
  const tK = new THREE.Group(); PK.build(tK, { y0: 0 });
  const stakes = instanceOf(tK, NST * 3, G.survey, 'stakes');
  for (let i = 0; i < NST; i++) {
    const s = i * 10 + 5;
    for (const [j, xo, sc] of [[0, -6.0, 1], [1, 6.0, 1], [2, 0, 0.45]]) { at(s, xo); place(stakes, i * 3 + j, _pt.x, GROUND, _pt.z, _pt.a, 1, sc, 1); }
  }
  // the tape: a thin white strip on the ground along the centre line, ordered from the rear
  const tapePos = new Float32Array(NSEG * 6 * 3);
  {
    let o = 0;
    const a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 }, c = { x: 0, z: 0, a: 0 }, d = { x: 0, z: 0, a: 0 };
    for (let i = 0; i < NSEG; i++) {
      const s0 = i * SEG, s1 = Math.min(LT, s0 + SEG), y = GROUND + 0.03;
      at(s0, -0.03, a); at(s0, 0.03, b); at(s1, 0.03, c); at(s1, -0.03, d);
      for (const p of [a, c, b, a, d, c]) { tapePos[o++] = p.x; tapePos[o++] = y; tapePos[o++] = p.z; }
    }
  }
  const tapeGeo = new THREE.BufferGeometry();
  tapeGeo.setAttribute('position', new THREE.BufferAttribute(tapePos, 3));
  const tape = new THREE.Mesh(tapeGeo, new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.8, side: THREE.DoubleSide }));
  tape.frustumCulled = false;
  G.survey.add(tape);
  {
    // the theodolite on its tripod at the left of the curve, sighting along it; a plane table beside it
    const P = mk(), tx = -12, tz = 8, y0 = GROUND;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; P.add('timber', rod(V(tx + Math.cos(a) * 0.55, y0, tz + Math.sin(a) * 0.55), V(tx, y0 + 1.35, tz), 0.025, 5)); }
    P.add('dark', yTube(y0 + 1.33, y0 + 1.4, 0.12, 0.12, 12, tx, tz));
    P.add('steel', yTube(y0 + 1.4, y0 + 1.55, 0.07, 0.07, 10, tx, tz));
    P.add('dark', box(0.2, 0.18, 0.1, tx, y0 + 1.62, tz));
    P.add('dark', zTube(tz - 0.2, tz + 0.15, 0.04, 0.035, 8, tx, y0 + 1.68));
    P.add('brass', zTube(tz - 0.22, tz - 0.2, 0.042, 0.042, 8, tx, y0 + 1.68));
    P.add('timber', box(0.8, 0.04, 0.6, tx - 1.4, y0 + 0.95, tz + 0.6));
    for (const [dx, dz] of [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]]) P.add('timber', box(0.04, 0.93, 0.04, tx - 1.4 + dx, y0 + 0.47, tz + 0.6 + dz));
    P.add('white', box(0.6, 0.005, 0.45, tx - 1.4, y0 + 0.975, tz + 0.6));
    // ranging poles further out on the line, and a peg box
    for (const [x, z] of [[-14, -30], [-16, 40]]) { P.add('white', box(0.05, 2.0, 0.05, x, y0 + 1.0, z)); P.add('rust', box(0.055, 0.5, 0.055, x, y0 + 1.6, z), { tint: 0xd04030 }); }
    P.add('timber', box(0.5, 0.3, 0.35, tx + 1.0, y0 + 0.15, tz - 0.8));
    P.build(G.survey, { y0: -GROUND });
  }

  // ---------------------------------------------------------------- the gantry cranes (two, over the gun)
  const cranes = [], hooks = [];
  {
    const W = 7.8, H = 19.5, D = 2.2; // legs at x = +-W, the bridge's underside at H, legs 2D apart along z
    const lattice = (P, a, b, w, n) => {
      // a square lattice column from a to b (vertical), side w, n panels
      const h = b - a;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.add('camo', box(0.12, h, 0.12, sx * w / 2, a + h / 2, sz * w / 2));
      for (let i = 0; i < n; i++) {
        const y0 = a + (h * i) / n, y1 = a + (h * (i + 1)) / n;
        for (const [sx, sz, tx, tz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) P.add('camo', rod(V((sx * w) / 2, y0, (sz * w) / 2), V((tx * w) / 2, y1, (tz * w) / 2), 0.03, 4));
      }
    };
    const PC = mk(), PL = mk();
    // each leg's lattice goes into the crane's merged parts at its place; the legs of a side stand on a sill
    // beam with the travelling bogies and are joined at the top by a portal head
    const addLeg = (P, x, z) => {
      const tmp = mk();
      lattice(tmp, 0.9, H, 0.9, 9);
      for (const [key, list] of tmp.lists) for (const g of list) P.add(key, g.translate(x, 0, z));
    };
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) addLeg(PC, s * W, e * D);
      PC.add('camo', box(1.2, 0.8, 2 * D + 2.6, s * W, 0.5, 0)); // sill beam with the travelling bogies
      for (const e of [-1, 1]) for (const d of [-0.6, 0.6]) PC.add('dark', xTube(s * W - 0.12, s * W + 0.12, 0.35, 0.35, 14, 0.35, e * (D + 0.9) + d));
      PC.add('camo', box(1.0, 1.0, 2 * D + 1.0, s * W, H + 0.3, 0)); // portal head
      for (const e of [-1, 1]) PC.add('camo', rod(V(s * W, 1.0, e * D), V(s * W, H - 0.2, -e * D), 0.05, 5)); // portal bracing
    }
    // the bridge: two lattice girders across the top, a walkway between them, the crab on its rails
    for (const e of [-1, 1]) {
      const z = e * 1.1;
      for (const y of [H + 0.3, H + 2.2]) PC.add('camo', box(2 * W + 2.0, 0.22, 0.25, 0, y, z));
      for (let i = 0; i < 16; i++) {
        const x0 = -W - 1.0 + ((2 * W + 2.0) * i) / 16, x1 = -W - 1.0 + ((2 * W + 2.0) * (i + 1)) / 16;
        PC.add('camo', rod(V(x0, H + 0.3, z), V(x1, H + 2.2, z), 0.04, 4));
        PC.add('camo', rod(V(x1, H + 0.3, z), V(x1, H + 2.2, z), 0.035, 4));
      }
    }
    PC.add('timber', box(2 * W + 1.6, 0.06, 1.6, 0, H + 2.35, 0));
    PC.add('dark', box(2 * W + 1.0, 0.03, 0.3, 0, H + 1.95, 0));
    PC.add('camo', box(2.4, 1.3, 2.4, 0, H + 3.0, 0)); // the crab with its winch house
    PC.add('dark', box(2.42, 0.1, 2.42, 0, H + 3.7, 0));
    for (const d of [-0.5, 0.5]) PC.add('rope', yTube(H - 0.2, H + 2.4, 0.03, 0.03, 5, d, 0));
    const tC = new THREE.Group(); PC.build(tC, { dirt: 0.3, y0: 0 });
    PL.add('dark', box(0.9, 0.5, 0.6, 0, 0, 0));
    PL.add('steel', new THREE.TorusGeometry(0.3, 0.07, 8, 16, Math.PI * 1.4).rotateZ(Math.PI * 0.8).translate(0, -0.6, 0));
    for (const d of [-0.5, 0.5]) PL.add('rope', rod(V(d, 0.2, 0), V(d, 6, 0), 0.03, 5));
    const tH = new THREE.Group(); PL.build(tH, { y0: 0 });
    for (const z of [-7.0, 12.0]) {
      const c = new THREE.Group();
      c.position.set(-0.1, GROUND, z);
      for (const m of tC.children) c.add(m.clone());
      const h = new THREE.Group();
      for (const m of tH.children) h.add(m.clone());
      h.position.set(0, H - 6.0, 0);
      c.add(h);
      G.cranes.add(c);
      cranes.push(c); hooks.push(h);
    }
    // the cranes' own rails, outside the tracks
    const PR = mk();
    for (const s of [-1, 1]) {
      PR.add('steel', box(0.08, 0.14, 50, s * W - 0.1, GROUND + 0.27, 2.5));
      for (let z = -22; z <= 27; z += 0.9) PR.add('timber', box(1.4, 0.14, 0.24, s * W - 0.1, GROUND + 0.13, z));
    }
    PR.build(G.cranes, { y0: -GROUND });
  }

  // ---------------------------------------------------------------- the ammunition train on its parallel track
  const train = new THREE.Group();
  train.name = 'ammo-train';
  G.ammo.add(train);
  {
    // its track (straight, along the run-in) and a short bed
    const PT = mk(), a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 };
    at(0, AMMO_X, a); at(RUN, AMMO_X, b);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, yaw = A0, len = RUN;
    const T = (g) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(mx, 0, mz));
    PT.add('soil', T(box(4.2, 0.4, len, 0, -0.37, 0)), { tint: 0xa8a8a0 });
    for (const g of [-GA, GA]) PT.add('steel', T(box(0.07, 0.15, len, g, -0.075, 0)));
    for (let z = -len / 2; z < len / 2; z += 0.7) PT.add('timber', T(box(2.6, 0.15, 0.24, 0, -0.22, z)));
    PT.build(G.ammo, { y0: 0.5 });
    // the train, built along its own -Z (toward the gun): a tank locomotive, three shell wagons, a charge van
    const P = mk();
    const wheels = (z, r, n, dz) => { for (let i = 0; i < n; i++) { P.add('steel', xTube(-0.9, 0.9, 0.06, 0.06, 6, r, z + i * dz)); for (const s of [-1, 1]) P.add('dark', xTube(s * (GA - 0.07), s * (GA + 0.07), r, r, 16, r, z + i * dz)); } };
    let z = 0;
    // locomotive (a heavy tank engine): frame, boiler, smokebox, chimney, dome, side tanks, cab, bunker
    {
      const L = 13;
      P.add('dark', box(2.6, 0.35, L, 0, 1.15, z + L / 2));
      wheels(z + 2.2, 0.7, 5, 1.45);
      P.add('dark', zTube(z + 0.6, z + 7.6, 0.85, 0.85, 20, 0, 2.6));
      P.add('dark', zTube(z + 0.3, z + 0.65, 0.9, 0.9, 20, 0, 2.6));
      P.add('dark', yTube(3.3, 4.2, 0.28, 0.32, 12, 0, z + 1.2));
      P.add('dark', yTube(3.3, 3.9, 0.4, 0.35, 12, 0, z + 4.2));
      for (const s of [-1, 1]) P.add('dark', box(0.6, 1.4, 5.5, s * 1.05, 2.2, z + 5.0));
      P.add('dark', box(2.8, 2.5, 2.6, 0, 2.6, z + 9.1));
      P.add('dark', box(3.0, 0.12, 3.0, 0, 3.92, z + 9.1));
      P.add('dark', box(2.6, 2.0, 2.4, 0, 2.3, z + 11.6));
      for (const s of [-1, 1]) P.add('lens', zTube(z - 0.05, z + 0.0, 0.12, 0.12, 10, s * 0.8, 1.7));
      P.add('red', box(2.8, 0.25, 0.1, 0, 1.0, z + 0.0));
      z += L + 0.6;
    }
    // shell wagons: four-axle flats, two shells each in timber cradles, nose forward
    for (let w = 0; w < 3; w++) {
      const L = 12;
      P.add('camo', box(2.7, 0.35, L, 0, 1.0, z + L / 2));
      wheels(z + 1.2, WR0, 2, 1.6); wheels(z + L - 2.8, WR0, 2, 1.6);
      for (const zz of [3.2, 8.8]) {
        for (const dz of [-1.2, 1.2]) P.add('timber', box(1.2, 0.22, 0.3, 0, 1.28, z + zz + dz));
        const g = shellGeometry(3.75, 0.4), t = new THREE.Matrix4().makeTranslation(0, 1.79, z + zz);
        P.add('shell', g.body.applyMatrix4(t), { tint: 0xa2aab4 }); P.add('brass', g.band.applyMatrix4(t)); P.add('steel', g.fuze.applyMatrix4(t));
      }
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) P.add('dark', box(0.06, 0.8, 0.06, s * 1.36, 1.55, z + 0.6 + k * 2.7));
      P.add('cloth', box(2.2, 0.05, 3.2, 0, 2.25, z + 8.8), { tint: 0x8a8a70 }); // a tarpaulin over one
      z += L + 0.6;
    }
    {
      const L = 10;
      P.add('camo', box(2.7, 0.35, L, 0, 1.0, z + L / 2));
      wheels(z + 1.5, WR0, 2, 1.8); wheels(z + L - 3.3, WR0, 2, 1.8);
      P.add('timber', box(2.7, 2.3, L - 0.3, 0, 2.3, z + L / 2));
      P.add('camo', box(2.9, 0.15, L, 0, 3.5, z + L / 2));
      for (const s of [-1, 1]) P.add('dark', box(0.04, 1.9, 1.6, s * 1.36, 2.2, z + L / 2));
      z += L;
    }
    P.build(train, { dirt: 0.4, y0: 0 });
    train.userData.len = z;
  }

  // ---------------------------------------------------------------- flak positions
  const flakSites = [];
  {
    const ring = (P, r, rows, gap) => {
      const n = Math.round((Math.PI * 2 * r) / 0.6);
      for (let row = 0; row < rows; row++) for (let i = 0; i < n; i++) {
        const a = ((i + (row % 2) * 0.5) / n) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.28) continue; // the entrance
        P.add('cloth', box(0.6, 0.18, 0.36, Math.cos(a) * r, 0.09 + row * 0.17, Math.sin(a) * r, 0, -a + Math.PI / 2 + (rnd() - 0.5) * 0.08, 0), { tint: rnd() > 0.5 ? 0xc8b896 : 0xb4a482 });
      }
    };
    // 8.8 cm Flak 36 on its cruciform platform (Kreuzlafette): outriggers, jacks, pedestal, the long barrel
    const flak88 = (P) => {
      ring(P, 5.4, 5, 2.4);
      for (const a of [0, Math.PI / 2]) P.add('camo', box(6.6, 0.3, 0.45, 0, 0.35, 0, 0, a, 0));
      for (const [x, z] of [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]]) { P.add('dark', yTube(0, 0.5, 0.18, 0.12, 10, x, z)); P.add('dark', yTube(0, 0.04, 0.32, 0.32, 12, x, z)); }
      P.add('camo', yTube(0.5, 1.25, 0.55, 0.45, 18));
      P.add('camo', box(1.0, 0.55, 1.5, 0, 1.45, 0.1)); // the top carriage
      for (const s of [-1, 1]) P.add('camo', box(0.12, 0.9, 1.1, s * 0.45, 1.85, 0.1));
      // barrel at 40 degrees toward -z, the recuperator above it, the breech and the two equilibrators
      const el = 40 * DEG, ty = 2.1, tz = 0.3;
      const B = (g) => g.applyMatrix4(new THREE.Matrix4().makeRotationX(el).setPosition(0, ty, tz));
      P.add('camo', B(zTube(-4.6, 0.6, 0.075, 0.12, 12)));
      P.add('dark', B(zTube(-4.75, -4.6, 0.09, 0.09, 12)));
      P.add('camo', B(box(0.32, 0.32, 2.0, 0, 0, 0.0)));
      P.add('camo', B(zTube(-1.6, 0.4, 0.07, 0.07, 10, 0, 0.24)));
      P.add('camo', B(box(0.36, 0.4, 0.55, 0, -0.05, 0.85)));
      for (const s of [-1, 1]) P.add('camo', rod(V(s * 0.35, 1.3, 0.8), V(s * 0.35, 2.3, -0.2), 0.06, 8));
      P.add('camo', box(1.6, 1.3, 0.04, 0, 2.05, -0.55, -0.08)); // the shield
      for (const s of [-1, 1]) P.add('dark', box(0.3, 0.06, 0.3, s * 0.7, 1.7, 0.6)); // seats
      for (let i = 0; i < 4; i++) P.add('camo', box(0.4, 0.25, 1.1, -2.8 + i * 0.45, 0.13, 3.6, 0, 0.2, 0)); // ammunition boxes
    };
    // 2 cm Flakvierling 38: a triangular base, the turntable, four barrels in a square on the cradle, a shield
    const flak20 = (P) => {
      ring(P, 3.2, 4, -0.8);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; P.add('camo', box(2.4, 0.2, 0.3, Math.cos(a) * 1.0, 0.25, -Math.sin(a) * 1.0, 0, a, 0)); P.add('dark', yTube(0, 0.3, 0.1, 0.1, 8, Math.cos(a) * 2.1, -Math.sin(a) * 2.1)); }
      P.add('camo', yTube(0.3, 0.75, 0.55, 0.55, 16));
      P.add('camo', box(1.1, 0.5, 1.1, 0, 1.0, 0));
      const el = 30 * DEG, ty = 1.35, tz = 0.0;
      const B = (g) => g.applyMatrix4(new THREE.Matrix4().makeRotationX(el).setPosition(0, ty, tz));
      for (const x of [-0.24, 0.24]) for (const y of [-0.2, 0.2]) {
        P.add('dark', B(zTube(-1.9, 0.3, 0.025, 0.03, 8, x, y)));
        P.add('camo', B(box(0.12, 0.14, 0.7, x, y, 0.2)));
        P.add('dark', B(box(0.04, 0.22, 0.12, x, y - 0.18, 0.35))); // magazines
      }
      for (const s of [-1, 1]) P.add('camo', box(0.7, 0.9, 0.03, s * 0.55, 1.35, -0.55, 0, s * 0.25, 0));
      P.add('dark', box(0.4, 0.06, 0.35, 0, 1.0, 0.75)); // the gunner's seat
      for (let i = 0; i < 3; i++) P.add('camo', box(0.5, 0.3, 0.3, -1.5 + i * 0.55, 0.15, 2.1));
    };
    for (const [x, z, kind] of [[-118, -42, 88], [112, 58, 88], [-86, 98, 20], [92, -104, 20]]) {
      const P = mk();
      (kind === 88 ? flak88 : flak20)(P);
      const g = new THREE.Group();
      g.position.set(x, GROUND, z);
      g.rotation.y = Math.atan2(x, z) + Math.PI; // the barrels toward the gun's side of the sky
      P.build(g, { dirt: 0.3, y0: 0 });
      G.flak.add(g);
      flakSites.push(g);
    }
  }

  // ---------------------------------------------------------------- camouflage: the net on its poles
  const NZ0 = 40, NZ1 = -32, NW = 11, TOP = 14.6;
  const poles = [];
  {
    const P = mk();
    P.add('timber', yTube(GROUND, TOP + 0.25, 0.11, 0.08, 7));
    P.add('rope', rod(V(0, TOP, 0), V(2.5, GROUND, 0), 0.012, 4));
    const tP = new THREE.Group(); P.build(tP, { y0: -GROUND });
    for (let z = NZ0; z >= NZ1 - 0.1; z -= 8) for (const s of [-1, 1]) {
      const g = new THREE.Group();
      for (const m of tP.children) g.add(m.clone());
      g.position.set(s * (NW + 0.3), 0, z);
      g.rotation.y = s > 0 ? 0 : Math.PI;
      G.camo.add(g);
      poles.push(g);
    }
  }
  const NROWS = 36, NCOLS = 24;
  const netGeo = new THREE.PlaneGeometry(2 * NW, NZ0 - NZ1, NCOLS, NROWS);
  netGeo.rotateX(Math.PI / 2); // plane +y becomes +z: rows run from the rear (+z) forward
  netGeo.translate(0, 0, (NZ0 + NZ1) / 2);
  {
    const p = netGeo.attributes.position, uv = netGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const u = (x + NW) / (2 * NW), sagX = Math.sin(Math.PI * u), sagZ = Math.abs(Math.sin((Math.PI * (z - NZ0)) / 8));
      p.setY(i, TOP - 1.4 * sagX - 0.5 * sagZ * (0.4 + sagX) + (rnd() - 0.5) * 0.15);
      uv.setXY(i, x / 6, z / 6);
    }
    netGeo.computeVertexNormals();
  }
  const netMat = new THREE.MeshStandardMaterial({ map: netTexture(), alphaTest: 0.45, transparent: false, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  netMat.map.repeat.set(1, 1);
  {
    // the texture is drawn on a transparent canvas: its alpha cuts the holes between the scrim
    const net = new THREE.Mesh(netGeo, netMat);
    net.name = 'net';
    net.castShadow = true;
    net.receiveShadow = true;
    net.frustumCulled = false;
    G.camo.add(net);
    G.camo.userData.net = net;
  }
  const netIdx = netGeo.index.count;

  // ---------------------------------------------------------------- stages
  const setStage = (o = {}) => {
    for (const k of Object.keys(stage)) if (o[k] != null) stage[k] = clamp01(o[k]);
    const { survey, track, cranes: cr, ammo, flak, camo } = stage;
    // survey: stakes and tape from the rear, the theodolite as soon as the surveyors are out
    G.survey.visible = survey > 0;
    for (const im of stakes) im.count = Math.round(NST * survey) * 3;
    tapeGeo.setDrawRange(0, Math.round(NSEG * survey) * 6);
    // track: the bed runs ahead of the sleepers, the sleepers ahead of the rails
    G.track.visible = track > 0;
    bedGeo.setDrawRange(0, Math.round(NSEG * Math.min(1, track * 1.25)) * 30);
    for (const im of sleepers) im.count = Math.round(NSLP * clamp01(track * 1.12)) * 2;
    for (const im of rails) im.count = Math.round(NSEG * track) * 8;
    // cranes: erected (they rise), then the hooks come down
    G.cranes.visible = cr > 0;
    for (const c of cranes) c.scale.y = 0.04 + 0.96 * smoothK(0, 0.75, cr);
    for (const h of hooks) h.position.y = 19.5 - 2.0 - 4.0 * smoothK(0.75, 1, cr);
    // ammunition train: runs in along its track from the far end of the run-in
    G.ammo.visible = ammo > 0;
    {
      // (built toward its own +Z behind the locomotive, its front toward the gun; at() runs on past the end)
      const a = at(RUN - 6 - (1 - smoothK(0, 1, ammo)) * 70, AMMO_X);
      train.position.set(a.x, 0, a.z);
      train.rotation.y = A0;
    }
    // flak: the four positions dug and armed in turn
    G.flak.visible = flak > 0;
    flakSites.forEach((g, i) => { g.visible = flak > i / 4; });
    // camo: the poles go up from the rear, then the net is drawn over them
    G.camo.visible = camo > 0;
    const np = Math.ceil(poles.length * smoothK(0, 0.5, camo));
    poles.forEach((p, i) => { p.visible = i < np; });
    const rows = Math.round(NROWS * smoothK(0.3, 1, camo));
    netGeo.setDrawRange(0, rows * NCOLS * 6);
    void netIdx;
  };
  setStage({ survey: 1, track: 1, cranes: 0, ammo: 1, flak: 1, camo: 0 });
  // parts: the flak positions (Groups at y = GROUND in the inner frame: snap their y to the terrain if the ground
  // is not flat that far out), the gantry cranes and the train
  return { root, setStage, stage, railHead: -GROUND, curveR: R, parts: { flak: flakSites, cranes, train } };
}

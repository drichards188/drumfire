import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, shellGeometry, Parts, vehicleMats, DEG } from '../../kit.js';
import { clamp01, instanceOf, setInstance, smoothK } from './heavy_common.js';
import { mulberry32 } from '../../../noise.js';
import { gustavLayout, pathAt, pathU, GA, TRACK_X, DEL_X, CRANE_X, CRANE_D, CRANE, DERRICK, SIDING_D, FLAK } from '../../../ww2/gustav_layout.js';
import { TRAINS, D311, DECK, HOOK, CRANE_PARK } from '../../../ww2/gustav_works.js';

// The Gustav's firing position and its works (buildGustavSite, exported through gustav.js), in the frame of the gun's
// rig at its firing station at az = 0: root y = 0 is the ground (place it where the rig's root is); the rail head is
// site.railHead (0.55 m) above it, as in the rig. Inside, `inner` carries the rail-head frame (rail head y = 0, the
// ground at GROUND). The layout is src/ww2/gustav_layout.js: the double-track firing curve (radius R about (-R, 0, 0))
// and, behind it, the straight three-track assembly section (the gun tracks and the delivery track) with the gantry
// cranes' own rails outside, the parts trains' yard and the ammunition train's siding. setWorks(pose) puts the
// trains, the locomotives, the cranes, the derricks and the flak batteries (towed in, set down, dug in) where
// src/ww2/gustav_works.js has them; setStage({ survey, track, camo }), each 0..1 (a missing key leaves that part as it is):
//   survey  the surveyors' stakes along the curve's bed and its centre line, the white tape, the theodolite
//   track   the curve's bed, sleepers and rails laid from its rear end forward (the straight was there before)
//   camo    the camouflage net on poles over the gun at its station, drawn over from the rear
// Nothing allocates in setStage or setWorks (instance counts, draw ranges and transforms only).
export const GROUND = -0.55;
const WR0 = 0.48; // wagon wheels

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _o = { x: 0, z: 0, a: 0 };
const place = (list, i, x, y, z, yaw, sx = 1, sy = 1, sz = 1) => {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(sx, sy, sz));
  setInstance(list, i, _m);
};
// a unit rope (a thin cylinder along y, centred) stretched between two points of its parent's frame
const stretch = (m, a, b) => {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  _c.copy(b).sub(a);
  m.scale.set(1, Math.max(0.01, _c.length()), 1);
  m.quaternion.setFromUnitVectors(_up, _c.normalize());
};

// Open knotted cord with irregular hessian garnish. The identical wrapped copies keep
// the larger patches continuous across tile boundaries, including the corners.
export function createHeavyScrimTexture() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rnd = mulberry32(31);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#544b34'; g.lineWidth = 1.8;
  for (let i = -S; i <= S * 2; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i - S, S); g.stroke();
  }
  const cols = ['#646745', '#777252', '#62563d', '#414a32', '#92815a', '#505c3c'];
  for (let i = 0; i < 440; i++) {
    const x = rnd() * S, y = rnd() * S, w = 20 + rnd() * 60, h = 8 + rnd() * 16;
    const angle = rnd() * Math.PI, color = cols[(rnd() * cols.length) | 0];
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -55 || x + dx > S + 55 || y + dy < -55 || y + dy > S + 55) continue;
      g.save(); g.translate(x + dx, y + dy); g.rotate(angle);
      g.fillStyle = color;
      g.beginPath(); g.moveTo(-w * 0.5, -h * 0.25);
      g.lineTo(-w * 0.25, -h * 0.6); g.lineTo(-w * 0.06, -h * 0.32);
      g.lineTo(w * 0.24, -h * 0.48); g.lineTo(w * 0.5, -h * 0.12);
      g.lineTo(w * 0.34, h * 0.4); g.lineTo(w * 0.09, h * 0.3);
      g.lineTo(-w * 0.12, h * 0.65); g.lineTo(-w * 0.4, h * 0.36);
      g.closePath(); g.fill();
      g.strokeStyle = '#b0a07a'; g.globalAlpha = 0.23; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(-w * 0.35, 0); g.lineTo(w * 0.32, h * 0.08); g.stroke();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ground(x, z): the ground's height under a point of the site frame, in the rail-head frame (GROUND where it is level
// with the station); the WW2 render layer passes the terrain's
export function buildGustavSite({ arc = 0.2, yard = false, ground = () => GROUND } = {}) {
  const L = gustavLayout({ arc, yard });
  const { R, RUN, LT, at } = L;
  const mats = vehicleMats('dgrau');
  const mk = () => new Parts(mats);
  const root = new THREE.Group();
  root.name = 'gustav-site';
  const inner = new THREE.Group();
  inner.position.y = -GROUND;
  root.add(inner);
  const grp = (name) => { const g = new THREE.Group(); g.name = name; inner.add(g); return g; };
  const G = { survey: grp('survey'), track: grp('track'), lines: grp('lines'), cranes: grp('cranes'), works: grp('works'), flak: grp('flak'), camo: grp('camo') };
  const rnd = mulberry32(80);
  const stage = { survey: 0, track: 0, cranes: 0, ammo: 0, flak: 0, camo: 0 };

  // ---------------------------------------------------------------- the gun tracks: ballast bed, sleepers, rails
  // From the straight's far end through the assembly section and the whole curve; the straight is down from the
  // start, the curve is laid by the track stage from its rear end forward (draw ranges over the ordered segments).
  const SEG = 2.0, NSEG = Math.ceil(LT / SEG), NSEG0 = Math.ceil(RUN / SEG);
  const bedPos = new Float32Array(NSEG * 5 * 6 * 3);
  {
    // the bed: top 9.2 m wide at y -0.17, slopes to the ground, a skirt below for uneven ground; non-indexed
    const prof = [[-6.4, GROUND - 0.7], [-5.6, GROUND], [-4.6, -0.17], [4.6, -0.17], [5.6, GROUND], [6.4, GROUND - 0.7]];
    const a = { x: 0, z: 0, a: 0 };
    let o = 0;
    for (let i = 0; i < NSEG; i++) {
      const s0 = i * SEG, s1 = Math.min(LT, s0 + SEG);
      for (let j = 0; j < prof.length - 1; j++) {
        const [u0, y0] = prof[j], [u1, y1] = prof[j + 1];
        const P = (s, u) => { at(s, u, a); return [a.x, a.z]; };
        const [ax, az] = P(s0, u0), [bx, bz] = P(s0, u1), [cx, cz] = P(s1, u1), [dx, dz] = P(s1, u0);
        for (const [x, y, z] of [[ax, y0, az], [bx, y1, bz], [cx, y1, cz], [ax, y0, az], [cx, y1, cz], [dx, y0, dz]]) { bedPos[o++] = x; bedPos[o++] = y; bedPos[o++] = z; }
      }
    }
  }
  const ballast = (pos) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    // grey-brown crushed stone, a little speckle from vertex colours
    const n = pos.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const v = 0.85 + rnd() * 0.15;
      col[i * 3] = v * 1.05; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.92;
      uv[i * 2] = pos[i * 3] / 4; uv[i * 2 + 1] = pos[i * 3 + 2] / 4;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8c877c, roughness: 1, metalness: 0, vertexColors: true });
  const bedGeo = ballast(bedPos);
  {
    const bed = new THREE.Mesh(bedGeo, stoneMat);
    bed.receiveShadow = true;
    bed.frustumCulled = false;
    G.track.add(bed);
  }
  // sleepers: one per railway track, two per station, 0.65 m apart
  const SLP = 0.65, NSLP = Math.floor(LT / SLP), NSLP0 = Math.floor(RUN / SLP);
  const PS = mk();
  PS.add('timber', box(2.6, 0.16, 0.26, 0, -0.23, 0));
  const tS = new THREE.Group(); PS.build(tS, { dirt: 0.5, y0: 0.3 });
  const sleepers = instanceOf(tS, NSLP * 2, G.track, 'sleepers');
  for (let i = 0; i < NSLP; i++) {
    const s = i * SLP + SLP / 2;
    for (const [j, xo] of [[0, -TRACK_X], [1, TRACK_X]]) { const p = at(s, xo); place(sleepers, i * 2 + j, p.x, 0, p.z, p.a); }
  }
  // rails: four (two per track), segment boxes along the curve, scaled to each segment's length
  const PRl = mk();
  PRl.add('steel', box(0.07, 0.05, 1, 0, -0.025, 0));
  PRl.add('dark', box(0.03, 0.08, 1, 0, -0.09, 0));
  PRl.add('dark', box(0.14, 0.02, 1, 0, -0.14, 0));
  const tR = new THREE.Group(); PRl.build(tR, { dirt: 0.2, y0: 0.4 });
  const rails = instanceOf(tR, NSEG * 4, G.track, 'rails');
  {
    const a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 };
    let i = 0;
    for (let k = 0; k < NSEG; k++) {
      const s0 = k * SEG, s1 = Math.min(LT, s0 + SEG);
      for (const xt of [-TRACK_X, TRACK_X]) for (const g of [-GA, GA]) {
        at(s0, xt + g, a); at(s1, xt + g, b);
        place(rails, i++, (a.x + b.x) / 2, 0, (a.z + b.z) / 2, Math.atan2(-(b.x - a.x), -(b.z - a.z)), 1, 1, Math.hypot(b.x - a.x, b.z - a.z) + 0.01);
      }
    }
  }
  // the firing curve's bracing: an inner guard rail on each track along the curve, against the shot's thrust on the rails
  {
    const P = mk(), a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 };
    for (let s = RUN; s < LT - 0.1; s += SEG) for (const xt of [-TRACK_X, TRACK_X]) {
      at(s, xt + GA - 0.32, a); at(Math.min(LT, s + SEG), xt + GA - 0.32, b);
      const g = box(0.06, 0.1, Math.hypot(b.x - a.x, b.z - a.z) + 0.01, 0, -0.05, 0).rotateY(Math.atan2(-(b.x - a.x), -(b.z - a.z))).translate((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      P.add('dark', g);
    }
    P.build(G.track, { y0: 0.4 });
    G.track.userData.guard = G.track.children[G.track.children.length - 1];
  }

  // ---------------------------------------------------------------- the single tracks: delivery, yard, ammunition siding
  // On the ground from the start (the railway troops built them): ballast strips, sleepers and rails along the layout's
  // polylines; each yard siding only up to where it runs into the delivery track
  {
    const lines = [{ P: L.paths.del, u1: L.paths.del.len }, { P: L.paths.ammo, u1: L.paths.ammo.len }, { P: L.paths.ammoSwitch, u1: L.paths.ammoSwitch.len }];
    if (yard) ['sd1', 'sd2', 'sd3'].forEach((id, i) => { const P = L.paths[id]; lines.push({ P, u1: pathU(P, SIDING_D[i] - 1) }); }); // each from its own switch back
    if (!yard) lines.splice(0, lines.length, { P: L.paths.ammo, u1: L.paths.ammo.len }); // without the works: the ammunition siding only
    const ptsA = { x: 0, z: 0, a: 0 }, ptsB = { x: 0, z: 0, a: 0 };
    const prof = [[-2.6, GROUND - 0.4], [-2.1, GROUND], [-1.6, -0.17], [1.6, -0.17], [2.1, GROUND], [2.6, GROUND - 0.4]];
    let nSeg = 0, nSlp = 0;
    for (const l of lines) { nSeg += Math.ceil(l.u1 / SEG); nSlp += Math.floor(l.u1 / SLP); }
    const pos = new Float32Array(nSeg * 5 * 6 * 3), slp = instanceOf(tS, nSlp, G.lines, 'line-sleepers'), rl = instanceOf(tR, nSeg * 2, G.lines, 'line-rails');
    let o = 0, si = 0, ri = 0;
    const off = (q, w, out) => { out.x = q.x + Math.cos(q.a) * w; out.z = q.z - Math.sin(q.a) * w; return out; };
    const _x0 = { x: 0, z: 0 }, _x1 = { x: 0, z: 0 }, _x2 = { x: 0, z: 0 }, _x3 = { x: 0, z: 0 };
    for (const l of lines) {
      for (let u = 0; u < l.u1 - 0.01; u += SEG) {
        const u2 = Math.min(l.u1, u + SEG);
        pathAt(l.P, u, ptsA); pathAt(l.P, u2, ptsB);
        for (let j = 0; j < prof.length - 1; j++) {
          const [w0, y0] = prof[j], [w1, y1] = prof[j + 1];
          off(ptsA, w0, _x0); off(ptsA, w1, _x1); off(ptsB, w1, _x2); off(ptsB, w0, _x3);
          for (const [p, y] of [[_x0, y0], [_x1, y1], [_x2, y1], [_x0, y0], [_x2, y1], [_x3, y0]]) { pos[o++] = p.x; pos[o++] = y; pos[o++] = p.z; }
        }
        for (const g of [-GA, GA]) {
          off(ptsA, g, _x0); off(ptsB, g, _x1);
          place(rl, ri++, (_x0.x + _x1.x) / 2, 0, (_x0.z + _x1.z) / 2, Math.atan2(-(_x1.x - _x0.x), -(_x1.z - _x0.z)), 1, 1, Math.hypot(_x1.x - _x0.x, _x1.z - _x0.z) + 0.01);
        }
      }
      for (let u = SLP / 2; u < l.u1 && si < nSlp; u += SLP) { pathAt(l.P, u, ptsA); place(slp, si++, ptsA.x, 0, ptsA.z, ptsA.a); }
    }
    for (const im of slp) im.count = si;
    for (const im of rl) im.count = ri;
    const strip = new THREE.Mesh(ballast(pos.subarray(0, o)), stoneMat);
    strip.receiveShadow = true;
    strip.frustumCulled = false;
    G.lines.add(strip);
    // buffer stops at the delivery track's and the siding's ends
    const PB = mk();
    for (const P of [L.paths.del, L.paths.ammo]) {
      pathAt(P, P.len, ptsA);
      const T = (g) => g.rotateY(ptsA.a).translate(ptsA.x, 0, ptsA.z);
      PB.add('timber', T(box(2.4, 1.0, 0.5, 0, 0.35, -0.6)));
      for (const s of [-1, 1]) PB.add('dark', T(rod(V(s * 0.8, -0.2, -0.6), V(s * 0.8, 0.9, 0.9), 0.08, 5)));
    }
    PB.build(G.lines, { dirt: 0.4, y0: 0.4 });
  }

  // ---------------------------------------------------------------- survey: stakes, tape, theodolite (along the curve)
  const NST = Math.floor((LT - RUN) / 10);
  const PK = mk();
  PK.add('white', box(0.06, 1.4, 0.06, 0, 0.7, 0));
  for (let k = 0; k < 3; k++) PK.add('rust', box(0.065, 0.2, 0.065, 0, 0.2 + k * 0.4, 0), { tint: 0xd04030 });
  const tK = new THREE.Group(); PK.build(tK, { y0: 0 });
  const stakes = instanceOf(tK, NST * 3, G.survey, 'stakes');
  for (let i = 0; i < NST; i++) {
    const s = RUN + i * 10 + 5;
    for (const [j, xo, sc] of [[0, -6.0, 1], [1, 6.0, 1], [2, 0, 0.45]]) { const p = at(s, xo); place(stakes, i * 3 + j, p.x, GROUND, p.z, p.a, 1, sc, 1); }
  }
  // the tape: a thin white strip on the ground along the centre line, ordered from the curve's rear end
  const NTS = Math.ceil((LT - RUN) / SEG);
  const tapePos = new Float32Array(NTS * 6 * 3);
  {
    let o = 0;
    const a = { x: 0, z: 0, a: 0 }, b = { x: 0, z: 0, a: 0 }, c = { x: 0, z: 0, a: 0 }, d = { x: 0, z: 0, a: 0 };
    for (let i = 0; i < NTS; i++) {
      const s0 = RUN + i * SEG, s1 = Math.min(LT, s0 + SEG), y = GROUND + 0.03;
      at(s0, -0.03, a); at(s0, 0.03, b); at(s1, 0.03, c); at(s1, -0.03, d);
      for (const p of [a, c, b, a, d, c]) { tapePos[o++] = p.x; tapePos[o++] = y; tapePos[o++] = p.z; }
    }
  }
  const tapeGeo = new THREE.BufferGeometry();
  tapeGeo.setAttribute('position', new THREE.BufferAttribute(tapePos, 3));
  const tape = new THREE.Mesh(tapeGeo, new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.8, side: THREE.DoubleSide }));
  tape.frustumCulled = false;
  G.survey.add(tape);
  // the theodolite on its tripod at the left of the curve, sighting along it; a plane table beside it (the surveyors
  // take them away once the track is down: the camouflage's guys are pegged out there later)
  const surveyKit = new THREE.Group();
  G.survey.add(surveyKit);
  {
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
    P.build(surveyKit, { y0: -GROUND });
  }

  // ---------------------------------------------------------------- the gantry cranes (Portalkräne), from sections
  // Each crane in its own frame: centred between its two rails, legs along the rail at +-D, the bridge's underside at H,
  // ground at y = 0 (the group stands at GROUND in the rail-head frame). Its two sides each come in CRANE.SEG sections
  // (two lattice columns and their bracing; the bottom one with the sill and the travelling bogies, the top one with
  // the portal head), then the bridge (two lattice girders, the walkway, the crab with its winch house); the hook hangs
  // from the crab on its ropes. setWorks stands the sections and the bridge where the derricks have them and runs the
  // crane along its rails, the crab along the bridge and the hook up and down.
  const { hs: HS, D, H } = CRANE, SH = H / CRANE.SEG;
  const lattice = (P, a, b, w, n, x = 0, z = 0) => {
    const h = b - a;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.add('camo', box(0.12, h, 0.12, x + sx * w / 2, a + h / 2, z + sz * w / 2));
    for (let i = 0; i < n; i++) {
      const y0 = a + (h * i) / n, y1 = a + (h * (i + 1)) / n;
      for (const [sx, sz, tx, tz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) P.add('camo', rod(V(x + (sx * w) / 2, y0, z + (sz * w) / 2), V(x + (tx * w) / 2, y1, z + (tz * w) / 2), 0.03, 4));
    }
  };
  // one section of a side, standing with its foot at y = 0, the side's columns at z = +-D
  const section = (i) => {
    const P = mk(), g = new THREE.Group();
    for (const e of [-1, 1]) lattice(P, 0, SH, 0.9, 3, 0, e * D);
    for (const y of [0.25, SH - 0.25]) P.add('camo', box(0.5, 0.3, 2 * D, 0, y, 0)); // the ties between the columns
    for (const e of [-1, 1]) P.add('camo', rod(V(0, 0.3, e * D), V(0, SH - 0.3, -e * D), 0.05, 5)); // the bracing
    if (i === 0) {
      P.add('camo', box(1.2, 0.8, 2 * D + 2.6, 0, 0.5, 0)); // the sill beam with the travelling bogies
      for (const e of [-1, 1]) for (const d of [-0.6, 0.6]) P.add('dark', xTube(-0.12, 0.12, 0.35, 0.35, 14, 0.35, e * (D + 0.9) + d));
    }
    if (i === CRANE.SEG - 1) P.add('camo', box(1.0, 1.0, 2 * D + 1.0, 0, SH + 0.3, 0)); // the portal head
    P.build(g, { dirt: 0.25, y0: 0 });
    return g;
  };
  const bridgeOf = () => {
    // the bridge in its own frame, its underside at y = 0: two lattice girders across, a walkway, the crab's rails
    const P = mk(), g = new THREE.Group();
    for (const e of [-1, 1]) {
      const z = e * 1.1;
      for (const y of [0.3, 2.2]) P.add('camo', box(2 * HS + 2.0, 0.22, 0.25, 0, y, z));
      for (let i = 0; i < 16; i++) {
        const x0 = -HS - 1.0 + ((2 * HS + 2.0) * i) / 16, x1 = -HS - 1.0 + ((2 * HS + 2.0) * (i + 1)) / 16;
        P.add('camo', rod(V(x0, 0.3, z), V(x1, 2.2, z), 0.04, 4));
        P.add('camo', rod(V(x1, 0.3, z), V(x1, 2.2, z), 0.035, 4));
      }
    }
    P.add('timber', box(2 * HS + 1.6, 0.06, 1.6, 0, 2.35, 0));
    P.add('dark', box(2 * HS + 1.0, 0.03, 0.3, 0, 1.95, 0));
    P.build(g, { dirt: 0.25, y0: 0 });
    // the crab on the bridge (x along it), with its winch house and the hook's ropes' upper ends
    const crab = new THREE.Group(), PC = mk();
    PC.add('camo', box(2.4, 1.3, 2.4, 0, 3.0, 0));
    PC.add('dark', box(2.42, 0.1, 2.42, 0, 3.7, 0));
    PC.build(crab, { dirt: 0.2, y0: 0 });
    g.add(crab);
    return { g, crab };
  };
  // the hook: block and hook, its two ropes up to the crab (scaled), the two legs of the sling under it
  const PHK = mk();
  PHK.add('dark', box(0.9, 0.5, 0.6, 0, 0, 0));
  PHK.add('steel', new THREE.TorusGeometry(0.3, 0.07, 8, 16, Math.PI * 1.4).rotateZ(Math.PI * 0.8).translate(0, -0.6, 0));
  const tHK = new THREE.Group(); PHK.build(tHK, { y0: 0 });
  const ropeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 5), ropeMat = mats.rope;
  const rope = (parent) => { const m = new THREE.Mesh(ropeGeo, ropeMat); m.castShadow = true; parent.add(m); return m; };
  const hookOf = (parent) => {
    const h = new THREE.Group();
    for (const m of tHK.children) h.add(m.clone());
    parent.add(h);
    return { h, ropes: [rope(parent), rope(parent)], legs: [rope(parent), rope(parent)] };
  };
  const cranes = [];
  if (yard) for (let j = 0; j < 2; j++) {
    const c = new THREE.Group();
    c.name = `crane-${j}`;
    G.cranes.add(c);
    const sides = [0, 1].map(() => Array.from({ length: CRANE.SEG }, (_, i) => { const g = section(i); c.add(g); return g; }));
    const { g: bridge, crab } = bridgeOf();
    c.add(bridge);
    cranes.push({ c, sides, bridge, crab, hook: hookOf(c) });
  }
  // the cranes' own rails, outside the tracks, along the assembly section
  if (yard) {
    const PR = mk(), a = { x: 0, z: 0, a: 0 };
    for (const x of CRANE_X) for (let d = CRANE_D[0]; d < CRANE_D[1]; d += 10) {
      L.onStraight(d + 5, x, a);
      PR.add('steel', box(0.08, 0.14, 10.02, 0, 0.27, 0).rotateY(a.a).translate(a.x, GROUND, a.z));
      for (let k = 0; k < 11; k++) { L.onStraight(d + k * 0.9 + 0.45, x, a); PR.add('timber', box(1.4, 0.14, 0.24, 0, 0.13, 0).rotateY(a.a).translate(a.x, GROUND, a.z)); }
    }
    PR.build(G.cranes, { y0: -GROUND });
  }

  // ---------------------------------------------------------------- the four hand derricks on their timber platforms
  // (each crane has one each side of it, outside its rails: they put its sections and its bridge up, and take them down)
  const derricks = [];
  if (yard) for (let j = 0; j < 2; j++) for (let si = 0; si < 2; si++) {
    const side = si ? 1 : -1, g = new THREE.Group(), P = mk();
    g.name = 'derrick';
    // the platform: a grillage of baulks; the mast, its guys out to the anchors; the hand winch
    for (let k = -2; k <= 2; k++) { P.add('timber', box(5.2, 0.25, 0.4, 0, 0.12, k * 1.2)); P.add('timber', box(0.4, 0.25, 5.2, k * 1.2, 0.37, 0)); }
    lattice(P, 0.5, DERRICK.mast, 0.7, 12);
    P.add('dark', box(1.0, 0.3, 1.0, 0, DERRICK.mast + 0.15, 0));
    const back = Math.sign(DERRICK.z[j]); // away from its crane (the boom works toward it, over its stacks and its sides)
    for (const [gx, gz] of [[side * 11, back * 6], [side * 5, back * 13], [side * -2.5, back * 12]]) {
      P.add('rope', rod(V(0, DERRICK.mast, 0), V(gx, 0, gz), 0.02, 4));
      P.add('timber', box(0.6, 0.6, 0.6, gx, 0.1, gz));
    }
    P.add('camo', box(1.2, 0.9, 0.8, side * 1.6, 0.85, back * 1.6)); // the winch
    P.add('iron', xTube(side * 1.6 - 0.6, side * 1.6 + 0.6, 0.25, 0.25, 12, 1.2, back * 1.6));
    P.build(g, { dirt: 0.4, y0: 0 });
    // the boom (along +y from its heel, luffed and slewed by setWorks), its topping lift and the hoist rope with the hook
    const boom = new THREE.Group(), PBm = mk();
    lattice(PBm, 0, DERRICK.boom, 0.45, 10);
    PBm.build(boom, { dirt: 0.2, y0: 0 });
    boom.position.y = DERRICK.foot;
    boom.rotation.order = 'YXZ';
    g.add(boom);
    G.works.add(g);
    // placed at its crane's station, at z = DERRICK.z in the crane's frame
    L.onStraight(CRANE_PARK[j] + DERRICK.z[j], CRANE.cx + side * DERRICK.x, _o);
    g.position.set(_o.x, GROUND, _o.z);
    g.rotation.y = L.A0;
    derricks.push({ g, boom, j, si, top: rope(g), hoist: rope(g), hook: hookOf(g) });
  }
  // the sections waiting on their cribbing beside the derricks, and the bridges on theirs across the tracks
  if (yard) {
    const P = mk();
    for (let j = 0; j < 2; j++) for (const side of [-1, 1]) for (const z of [-3, 0, 3]) {
      L.onStraight(CRANE_PARK[j] + z, CRANE.cx + side * DERRICK.stack[1], _o);
      for (const e of [-1, 1]) P.add('timber', box(0.5, 0.3, 0.9, 0, 0.15, 0).translate(e * D, 0, 0).rotateY(_o.a).translate(_o.x, GROUND, _o.z));
    }
    for (let j = 0; j < 2; j++) for (const sx of [-5, 0, (TRACK_X + DEL_X) / 2, (DEL_X + CRANE_X[1]) / 2]) { // between the rails, clear of what runs on them later
      L.onStraight(CRANE_PARK[j], sx, _o);
      P.add('timber', box(0.5, 0.3, 2.6, 0, 0.15, 0).rotateY(_o.a).translate(_o.x, GROUND, _o.z));
    }
    P.build(G.works, { dirt: 0.5, y0: -GROUND });
  }

  // ---------------------------------------------------------------- locomotives and wagons
  // Each built along its own z, centred, front toward -z, rail head y = 0; setWorks places them on their tracks.
  const wheels = (P, z, r, n, dz) => { for (let i = 0; i < n; i++) { P.add('steel', xTube(-0.9, 0.9, 0.06, 0.06, 6, r, z + i * dz)); for (const s of [-1, 1]) P.add('dark', xTube(s * (GA - 0.07), s * (GA + 0.07), r, r, 16, r, z + i * dz)); } };
  const buffers = (P, zEnd, y = 1.06) => { for (const s of [-1, 1]) { P.add('steel', zTube(Math.min(zEnd, zEnd - Math.sign(zEnd) * 0.45), Math.max(zEnd, zEnd - Math.sign(zEnd) * 0.45), 0.08, 0.08, 8, s * 0.88, y)); P.add('steel', zTube(zEnd - Math.sign(zEnd) * 0.06, zEnd, 0.2, 0.2, 14, s * 0.88, y)); } };
  const bogie2 = (P, z, r = WR0) => { for (const s of [-1, 1]) P.add('dark', box(0.08, 0.35, 2.6, s * 0.84, r + 0.14, z)); P.add('dark', box(1.7, 0.2, 0.5, 0, r + 0.27, z)); wheels(P, z - 0.8, r, 2, 1.6); };
  const vehicle = (fn) => { const g = new THREE.Group(), P = mk(); fn(P); P.build(g, { dirt: 0.4, y0: 0 }); g.visible = false; G.works.add(g); return g; }; // shown once setWorks has placed it
  const MODELS = {
    // the Krupp twin diesel: two cab units back to back, long bonnets, three-axle bogies; the buffer beams red
    d311: (P, c) => {
      for (const e of [-1, 1]) {
        const zc = e * c.len / 4, zo = e * (c.len / 2 - 0.3);
        P.add('dark', box(2.9, 0.35, c.len / 2 - 0.2, 0, 1.2, zc));
        for (const b of [-1, 1]) { const bz = zc + b * 3.6; for (const s of [-1, 1]) P.add('dark', box(0.1, 0.5, 3.4, s * 0.95, 0.75, bz)); wheels(P, bz - 1.3, 0.5, 3, 1.3); }
        P.add('camo', box(2.5, 2.1, c.len / 2 - 4.2, 0, 2.43, zc - e * 1.4)); // the bonnet
        for (let k = 0; k < 6; k++) P.add('dark', box(2.52, 0.9, 0.06, 0, 2.6, zc - e * 1.4 + (k - 2.5) * 1.3)); // louvres
        P.add('camo', box(2.9, 2.9, 2.6, 0, 2.85, zo - e * 1.4)); // the cab at the outer end
        P.add('camo', box(3.0, 0.12, 2.8, 0, 4.36, zo - e * 1.4));
        P.add('glass', box(2.4, 0.6, 0.05, 0, 3.5, zo - e * 0.08));
        P.add('red', box(2.9, 0.35, 0.12, 0, 1.06, zo));
        buffers(P, e * c.len / 2);
        for (const s of [-1, 1]) P.add('lens', zTube(zo - 0.02, zo + 0.02 * e, 0.11, 0.11, 10, s * 0.75, 1.6));
      }
    },
    // a small diesel shunter: frame, bonnet, cab at the rear, three coupled axles
    shunter: (P, c) => {
      P.add('dark', box(2.7, 0.4, c.len - 0.6, 0, 1.15, 0));
      wheels(P, -2.0, 0.5, 3, 2.0);
      P.add('camo', box(2.1, 1.7, 5.4, 0, 2.2, -1.6));
      P.add('camo', box(2.8, 2.6, 2.6, 0, 2.65, 2.8));
      P.add('camo', box(2.9, 0.1, 2.8, 0, 4.0, 2.8));
      P.add('glass', box(2.2, 0.55, 0.05, 0, 3.3, 1.48));
      P.add('red', box(2.7, 0.3, 0.1, 0, 1.06, -c.len / 2 + 0.3)); P.add('red', box(2.7, 0.3, 0.1, 0, 1.06, c.len / 2 - 0.3));
      buffers(P, -c.len / 2); buffers(P, c.len / 2);
    },
    // a heavy flat wagon (a Schwerlastwagen): the deck, deep side sills, two bogies at each end for the long ones
    flat: (P, c) => {
      P.add('dark', box(2.9, 0.3, c.len - 0.9, 0, DECK - 0.15, 0));
      for (const s of [-1, 1]) P.add('dark', box(0.2, 0.7, c.len - 0.9, s * 1.35, DECK - 0.5, 0));
      for (let z = -c.len / 2 + 2; z < c.len / 2 - 1; z += 2.2) for (const s of [-1, 1]) P.add('dark', box(0.04, 0.6, 0.12, s * 1.46, DECK - 0.45, z));
      const ends = c.len > 30 ? [-c.pitch / 2 - 1.5, -c.pitch / 2 + 1.5, c.pitch / 2 - 1.5, c.pitch / 2 + 1.5] : [-c.pitch / 2, c.pitch / 2];
      for (const z of ends) bogie2(P, z);
      buffers(P, -c.len / 2); buffers(P, c.len / 2);
      // the cribbing the part rests on: stacks of baulks along the deck
      const n = Math.max(2, Math.round(c.len / 7));
      for (let k = 0; k < n; k++) { const z = -c.len / 2 + 2 + (k * (c.len - 4)) / (n - 1); for (const y of [0.075, 0.225]) P.add('timber', box(2.6, 0.15, 0.4, 0, DECK + y, z + (y > 0.1 ? 0.2 : -0.2))); }
    },
    // the ammunition train: a heavy tank engine, flats with shells two by two in timber cradles, the charge van
    tank: (P, c) => {
      const z = -c.len / 2;
      P.add('dark', box(2.6, 0.35, c.len - 0.6, 0, 1.15, 0));
      wheels(P, z + 2.2, 0.7, 5, 1.45);
      P.add('dark', zTube(z + 0.6, z + 7.6, 0.85, 0.85, 20, 0, 2.6));
      P.add('dark', zTube(z + 0.3, z + 0.65, 0.9, 0.9, 20, 0, 2.6));
      P.add('dark', yTube(3.3, 4.2, 0.28, 0.32, 12, 0, z + 1.2));
      P.add('dark', yTube(3.3, 3.9, 0.4, 0.35, 12, 0, z + 4.2));
      for (const s of [-1, 1]) P.add('dark', box(0.6, 1.4, 5.5, s * 1.05, 2.2, z + 5.0));
      P.add('dark', box(2.8, 2.5, 2.6, 0, 2.6, z + 9.1));
      P.add('dark', box(3.0, 0.12, 3.0, 0, 3.92, z + 9.1));
      P.add('dark', box(2.6, 2.0, 2.4, 0, 2.3, z + 11.6));
      for (const s of [-1, 1]) P.add('lens', zTube(z - 0.05, z + 0.0, 0.12, 0.12, 10, s * 0.8, 1.7));
      P.add('red', box(2.8, 0.25, 0.1, 0, 1.0, z));
      buffers(P, -c.len / 2); buffers(P, c.len / 2);
    },
    shells: (P, c) => {
      P.add('camo', box(2.7, 0.35, c.len - 0.6, 0, 1.0, 0));
      bogie2(P, -c.pitch / 2); bogie2(P, c.pitch / 2);
      for (const zz of [-2.8, 2.8]) {
        for (const dz of [-1.2, 1.2]) P.add('timber', box(1.2, 0.22, 0.3, 0, 1.28, zz + dz));
        const g = shellGeometry(3.75, 0.4), t = new THREE.Matrix4().makeTranslation(0, 1.79, zz);
        P.add('shell', g.body.applyMatrix4(t), { tint: 0xa2aab4 }); P.add('brass', g.band.applyMatrix4(t)); P.add('steel', g.fuze.applyMatrix4(t));
      }
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) P.add('dark', box(0.06, 0.8, 0.06, s * 1.36, 1.55, -c.len / 2 + 0.9 + k * 2.7));
      P.add('cloth', box(2.2, 0.05, 3.2, 0, 2.25, 2.8), { tint: 0x8a8a70 }); // a tarpaulin over one
      buffers(P, -c.len / 2); buffers(P, c.len / 2);
    },
    van: (P, c) => {
      P.add('camo', box(2.7, 0.35, c.len - 0.6, 0, 1.0, 0));
      bogie2(P, -c.pitch / 2); bogie2(P, c.pitch / 2);
      P.add('timber', box(2.7, 2.3, c.len - 0.9, 0, 2.3, 0));
      P.add('camo', box(2.9, 0.15, c.len - 0.6, 0, 3.5, 0));
      for (const s of [-1, 1]) P.add('dark', box(0.04, 1.9, 1.6, s * 1.36, 2.2, 0));
      buffers(P, -c.len / 2); buffers(P, c.len / 2);
    },
  };
  const trains = {};
  for (const [id, t] of Object.entries(TRAINS)) {
    if (!yard && id !== 'ammo') continue;
    trains[id] = t.cars.map((c) => vehicle((P) => MODELS[c.kind](P, c)));
  }
  const locos = { L: vehicle((P) => MODELS.d311(P, D311)), R: vehicle((P) => MODELS.d311(P, D311)) };

  // ---------------------------------------------------------------- the flak batteries
  // Each in pieces that move on their own (gustav_works.js flak): its pit (the sandbag ring, a row at a time, the spoil
  // bank thrown up behind it, the ready ammunition), the gun (its mount, and its barrel on a pivot that is down for the
  // tow), the transport bogies, the half-track that tows it. Heights come from the ground under each (ground()).
  const batteries = [];
  {
    // the pit: n rows of sandbags round a ring (an entrance at `gap`), each its own group; the spoil bank and the posts
    const pit = (r, rows, gap) => {
      const rowsG = [];
      const n = Math.round((Math.PI * 2 * r) / 0.6);
      for (let row = 0; row < rows; row++) {
        const P = mk(), g = new THREE.Group();
        for (let i = 0; i < n; i++) {
          const a = ((i + (row % 2) * 0.5) / n) * Math.PI * 2;
          if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.28) continue; // the entrance
          const x = Math.cos(a) * (r - row * 0.035), z = Math.sin(a) * (r - row * 0.035);
          P.add('cloth', rbox(0.61 + rnd() * 0.06, 0.21, 0.42, 0.065, x, 0.1 + row * 0.18, z, (rnd() - 0.5) * 0.05, -a + Math.PI / 2 + (rnd() - 0.5) * 0.1), { tint: rnd() > 0.5 ? 0xd7c69c : 0xb6b58c });
        }
        P.build(g, { dirt: 0.3, y0: 0 });
        rowsG.push(g);
      }
      // Low broken spoil bank backs the bags; radial planking and posts retain its inner face.
      const P = mk(), bank = new THREE.Group(), nBank = 36;
      for (let i = 0; i < nBank; i++) {
        const a = i / nBank * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.34) continue;
        const h = rows * 0.14 + rnd() * 0.12;
        const g = new THREE.SphereGeometry(1, 8, 5);
        g.scale(0.72, h, 0.9).rotateY(-a).translate(Math.cos(a) * (r + 0.4), -0.12, Math.sin(a) * (r + 0.4));
        P.add('soil', g, { tint: i % 3 === 0 ? 0xb6aa85 : 0xaaa08a });
        const ix = Math.cos(a) * (r - 0.35), iz = Math.sin(a) * (r - 0.35);
        P.add('timber', box(0.14, rows * 0.18 + 0.12, 0.14, ix, rows * 0.09, iz, 0, -a));
        for (let j = 0; j < 3; j++) P.add('timber', box(0.08, 0.15, r * Math.PI * 2 / nBank + 0.06, ix, 0.12 + j * 0.17, iz, 0, -a));
      }
      P.build(bank, { dirt: 0.3, y0: 0 });
      return { rowsG, bank };
    };
    // 8.8 cm Flak 36 on its cruciform platform (Kreuzlafette): outriggers, jacks, pedestal, top carriage, shield; the
    // barrel with its recuperator and breech on the trunnions (ty, tz), raised by setWorks
    const flak88 = (M, B) => {
      for (const a of [0, Math.PI / 2]) M.add('camo', box(6.6, 0.3, 0.45, 0, 0.35, 0, 0, a, 0));
      for (const [x, z] of [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]]) { M.add('dark', yTube(0, 0.5, 0.18, 0.12, 10, x, z)); M.add('dark', yTube(0, 0.04, 0.32, 0.32, 12, x, z)); }
      M.add('camo', yTube(0.5, 1.25, 0.55, 0.45, 18));
      M.add('camo', box(1.0, 0.55, 1.5, 0, 1.45, 0.1)); // the top carriage
      for (const s of [-1, 1]) M.add('camo', box(0.12, 0.9, 1.1, s * 0.45, 1.85, 0.1));
      for (const s of [-1, 1]) M.add('camo', rod(V(s * 0.35, 1.3, 0.8), V(s * 0.35, 2.2, 0.0), 0.06, 8)); // the equilibrators
      M.add('camo', box(1.6, 1.3, 0.04, 0, 2.05, -0.55, -0.08)); // the shield
      for (const s of [-1, 1]) M.add('dark', box(0.3, 0.06, 0.3, s * 0.7, 1.7, 0.6)); // seats
      B.add('camo', zTube(-4.6, 0.6, 0.075, 0.12, 12));
      B.add('dark', zTube(-4.75, -4.6, 0.09, 0.09, 12));
      B.add('camo', box(0.32, 0.32, 2.0, 0, 0, 0.0));
      B.add('camo', zTube(-1.6, 0.4, 0.07, 0.07, 10, 0, 0.24));
      B.add('camo', box(0.36, 0.4, 0.55, 0, -0.05, 0.85));
      return { ty: 2.1, tz: 0.3, el: 40 * DEG };
    };
    // 2 cm Flakvierling 38: a triangular base, the turntable, a shield; the four barrels in a square on their cradle
    const flak20 = (M, B) => {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; M.add('camo', box(2.4, 0.2, 0.3, Math.cos(a) * 1.0, 0.25, -Math.sin(a) * 1.0, 0, a, 0)); M.add('dark', yTube(0, 0.3, 0.1, 0.1, 8, Math.cos(a) * 2.1, -Math.sin(a) * 2.1)); }
      M.add('camo', yTube(0.3, 0.75, 0.55, 0.55, 16));
      M.add('camo', box(1.1, 0.5, 1.1, 0, 1.0, 0));
      for (const s of [-1, 1]) M.add('camo', box(0.7, 0.9, 0.03, s * 0.55, 1.35, -0.55, 0, s * 0.25, 0));
      M.add('dark', box(0.4, 0.06, 0.35, 0, 1.0, 0.75)); // the gunner's seat
      for (const x of [-0.24, 0.24]) for (const y of [-0.2, 0.2]) {
        B.add('dark', zTube(-1.9, 0.3, 0.025, 0.03, 8, x, y));
        B.add('camo', box(0.12, 0.14, 0.7, x, y, 0.2));
        B.add('dark', box(0.04, 0.22, 0.12, x, y - 0.18, 0.35)); // magazines
      }
      return { ty: 1.35, tz: 0.0, el: 30 * DEG };
    };
    // the transport: the 8.8's two single-axle bogies under its cross (Sonderanhänger 201), the quad's one axle
    const trailer = (P, heavy) => {
      for (const z of heavy ? [-2.9, 2.9] : [0]) {
        const r = heavy ? 0.45 : 0.4;
        P.add('dark', box(heavy ? 1.6 : 1.4, 0.25, 0.9, 0, r + 0.15, z));
        P.add('steel', xTube(-1.0, 1.0, 0.06, 0.06, 6, r, z));
        for (const s of [-1, 1]) for (const d of heavy ? [0.72, 0.98] : [0.8]) { P.add('tyre', xTube(s * (d - 0.11), s * (d + 0.11), r, r, 16, r, z)); P.add('rim', xTube(s * (d - 0.115), s * (d + 0.115), r * 0.55, r * 0.55, 10, r, z)); }
        P.add('dark', rod(V(0, r + 0.1, z + (z < 0 ? -0.4 : 0.4)), V(0, r - 0.05, z + (z <= 0 ? -1.8 : 1.8)), 0.05, 6)); // the drawbar
      }
    };
    // the Sd.Kfz. 7 half-track: steered front wheels, the track units, bonnet, the open crew space with its benches
    const tractor = (P) => {
      for (const s of [-1, 1]) {
        P.add('tyre', xTube(s * 0.95, s * 1.18, 0.46, 0.46, 18, 0.46, -2.35)); P.add('rim', xTube(s * 0.94, s * 1.19, 0.25, 0.25, 10, 0.46, -2.35));
        P.add('dark', box(0.42, 0.85, 3.9, s * 0.92, 0.5, 1.0)); // the track
        for (let k = 0; k < 6; k++) P.add('rim', xTube(s * 0.7, s * 1.14, 0.3, 0.3, 12, 0.36, -0.7 + k * 0.68));
        P.add('camo', box(0.5, 0.06, 4.0, s * 0.92, 0.98, 1.0)); // the mudguard over it
      }
      P.add('camo', box(1.5, 0.25, 6.0, 0, 0.95, 0.2)); // the chassis
      P.add('camo', box(1.3, 0.85, 1.9, 0, 1.55, -2.5)); // the bonnet
      P.add('dark', box(1.2, 0.7, 0.05, 0, 1.5, -3.46)); // the radiator grille
      for (const s of [-1, 1]) P.add('lens', zTube(-3.5, -3.42, 0.1, 0.1, 10, s * 0.55, 1.75));
      P.add('glass', box(1.9, 0.4, 0.04, 0, 2.15, -1.5)); // the folding windscreen
      P.add('camo', box(2.25, 0.5, 4.3, 0, 1.35, 1.2)); // the body's low sides
      for (const z of [0, 1.1, 2.2]) P.add('timber', box(2.0, 0.12, 0.45, 0, 1.55, z)); // the crew's benches
      P.add('cloth', box(2.1, 0.35, 0.8, 0, 1.85, 3.1), { tint: 0x8a8a70 }); // the canvas top, folded
      P.add('dark', box(0.25, 0.25, 0.5, 0, 0.8, 3.35)); // the towing hook
    };
    FLAK.forEach((b) => {
      const heavy = b.kind === 'heavy';
      const pitG = new THREE.Group(), { rowsG, bank } = pit(b.ring, b.rows, heavy ? 2.4 : -0.8);
      for (const g of rowsG) pitG.add(g);
      pitG.add(bank);
      const PB = mk();
      if (heavy) for (let i = 0; i < 4; i++) PB.add('camo', box(0.4, 0.25, 1.1, -2.8 + i * 0.45, 0.13, 3.6, 0, 0.2, 0)); // ready ammunition
      else for (let i = 0; i < 3; i++) PB.add('camo', box(0.5, 0.3, 0.3, -1.5 + i * 0.55, 0.15, 2.1));
      PB.build(pitG, { dirt: 0.3, y0: 0 });
      G.flak.add(pitG);
      const gun = new THREE.Group(), barrel = new THREE.Group(), M = mk(), Bp = mk();
      const tr = (heavy ? flak88 : flak20)(M, Bp);
      M.build(gun, { dirt: 0.3, y0: 0 });
      barrel.position.set(0, tr.ty, tr.tz);
      Bp.build(barrel, { dirt: 0.2, y0: -tr.ty });
      gun.add(barrel);
      G.flak.add(gun);
      const bog = new THREE.Group(), PT = mk(); trailer(PT, heavy); PT.build(bog, { dirt: 0.5, y0: 0 }); G.flak.add(bog);
      const trac = new THREE.Group(), PK = mk(); tractor(PK); PK.build(trac, { dirt: 0.5, y0: 0 }); G.flak.add(trac);
      batteries.push({ b, pitG, rowsG, bank, gun, barrel, el: tr.el, bog, trac });
    });
  }

  // ---------------------------------------------------------------- camouflage: the net on its poles
  const NZ0 = 40, NZ1 = -32, NW = 11, TOP = 14.6;
  // the poles with their guy ropes, one instanced mesh per material (two draws, not forty), in the order they go
  // up: setStage shows the first n
  let poles, NPOLE = 0;
  {
    const P = mk();
    P.add('timber', yTube(GROUND, TOP + 0.25, 0.11, 0.08, 7));
    P.add('rope', rod(V(0, TOP, 0), V(2.5, GROUND, 0), 0.012, 4));
    const tP = new THREE.Group(); P.build(tP, { y0: -GROUND });
    const places = [];
    for (let z = NZ0; z >= NZ1 - 0.1; z -= 8) for (const s of [-1, 1]) places.push([s * (NW + 0.3), z, s > 0 ? 0 : Math.PI]);
    NPOLE = places.length;
    poles = instanceOf(tP, NPOLE, G.camo, 'poles');
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    places.forEach(([x, z, ry], i) => setInstance(poles, i, m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, ry), one)));
    // they stand where they stand: bounds over all of them, so the set can be frustum culled
    for (const im of poles) { im.computeBoundingSphere(); im.frustumCulled = true; }
  }
  const NROWS = 36, NCOLS = 24;
  const netGeo = new THREE.PlaneGeometry(2 * NW, NZ0 - NZ1, NCOLS, NROWS);
  netGeo.rotateX(Math.PI / 2); // plane +y becomes +z: rows run from the rear (+z) forward
  netGeo.translate(0, 0, (NZ0 + NZ1) / 2);
  {
    const p = netGeo.attributes.position, uv = netGeo.attributes.uv;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const u = (x + NW) / (2 * NW), sagX = Math.sin(Math.PI * u), sagZ = Math.abs(Math.sin((Math.PI * (z - NZ0)) / 8));
      p.setY(i, TOP - 1.4 * sagX - 0.5 * sagZ * (0.4 + sagX) + (rnd() - 0.5) * 0.15);
      uv.setXY(i, x / 4.5, z / 4.5);
      const shade = 0.82 + 0.14 * Math.sin(z * 0.21 + x * 0.31) + rnd() * 0.08;
      colors.set([shade, shade, shade * 0.92], i * 3);
    }
    netGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    netGeo.computeVertexNormals();
  }
  const netMat = new THREE.MeshStandardMaterial({ map: createHeavyScrimTexture(), alphaTest: 0.45, transparent: false, side: THREE.DoubleSide, roughness: 1, metalness: 0, vertexColors: true });
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
  // The open forward centre is the barrel's elevation / recoil corridor.
  const roofIndices = [], roofRows = [0], sourceIndices = netGeo.index.array;
  for (let row = 0; row < NROWS; row++) {
    for (let col = 0; col < NCOLS; col++) {
      const x = -NW + (col + 0.5) / NCOLS * 2 * NW;
      const z = NZ0 - (row + 0.5) / NROWS * (NZ0 - NZ1);
      if (z < 4 && Math.abs(x) < 4.6) continue;
      const offset = (row * NCOLS + col) * 6;
      for (let j = 0; j < 6; j++) roofIndices.push(sourceIndices[offset + j]);
    }
    roofRows.push(roofIndices.length);
  }
  netGeo.setIndex(roofIndices);
  // Narrow scalloped valances conceal the edge silhouette while keeping the rails clear.
  const valances = [];
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(NZ0 - NZ1, 2.8, NROWS, 4);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const z = (NZ0 + NZ1) / 2 + pos.getX(i), v = (1.4 - pos.getY(i)) / 2.8;
      const scallop = 0.7 * Math.abs(Math.sin((z - NZ0) * Math.PI / 8));
      pos.setXYZ(i, side * (NW + v * 0.35), TOP - scallop - v * (2.2 + 0.6 * Math.sin(z * 0.7)), z);
      uv.setXY(i, z / 4.5, v * 0.7);
      colors.set([0.78, 0.8, 0.71], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, netMat); mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'net-edge-scrim'; G.camo.add(mesh); valances.push(mesh);
  }
  const rigging = new THREE.Group(); rigging.name = 'net-edge-cables';
  const RP = mk();
  for (const side of [-1, 1]) for (let z = NZ0; z > NZ1; z -= 8) {
    const end = Math.max(NZ1, z - 8);
    RP.add('rope', rod(V(side * NW, TOP, z), V(side * NW, TOP - 0.65, (z + end) / 2), 0.025, 5));
    RP.add('rope', rod(V(side * NW, TOP - 0.65, (z + end) / 2), V(side * NW, TOP, end), 0.025, 5));
    RP.add('timber', yTube(GROUND - 0.2, GROUND + 0.25, 0.08, 0.06, 6, side * (NW + 2.8), z));
  }
  RP.build(rigging, { y0: -GROUND }); G.camo.add(rigging);

  // ---------------------------------------------------------------- works: everything that moves
  // a hook block at (x, y, z) of its parent's frame, its ropes up to (x, ropeTop, z), the sling's legs (spread across
  // or along) down to its load while it has one
  const hang = (hk, x, y, z, ropeTop, sling, spread = HOOK.spread, along = false) => {
    hk.h.position.set(x, y, z);
    for (let i = 0; i < 2; i++) {
      const d = i ? 0.25 : -0.25;
      stretch(hk.ropes[i], _a.set(x + d, y + 0.2, z), _b.set(x + d, Math.max(y + 0.3, ropeTop), z));
      const m = hk.legs[i];
      m.visible = sling;
      if (sling) stretch(m, _a.set(x, y - HOOK.eye, z), _b.set(along ? x : x + (i ? spread : -spread), y - HOOK.eye - HOOK.sling, along ? z + (i ? spread : -spread) : z));
    }
  };
  const _v = { x: 0, z: 0, a: 0 };
  const setWorks = (pose) => {
    for (const [id, cars] of Object.entries(trains)) cars.forEach((g, i) => { const q = pose.trains[id].cars[i]; g.position.set(q.x, 0, q.z); g.rotation.y = q.a; g.visible = true; });
    for (const s of ['L', 'R']) { const q = pose.locos[s], g = locos[s]; g.position.set(q.x, 0, q.z); g.rotation.y = q.a; g.visible = true; }
    cranes.forEach((cr, j) => {
      const c = pose.cranes[j], e = pose.erect[j], up = e.up >= 1;
      // the crane on its rails (where the derricks put it up, until it is standing), the crab along the bridge
      L.onStraight(up ? c.d : CRANE_PARK[j], CRANE.cx, _v);
      cr.c.position.set(_v.x, GROUND, _v.z); cr.c.rotation.y = _v.a;
      cr.sides.forEach((secs, si) => secs.forEach((g, i) => { const o = e.sec[si][i]; g.position.set(o.x, o.y, o.z); g.rotation.y = o.a; }));
      cr.bridge.position.y = e.bridge.y;
      const crabX = up ? c.x - CRANE.cx : 0;
      cr.crab.position.x = crabX;
      // the hook: on the crane's own ropes from the crab (crane frame: ground at y = 0, the pose's heights from the rail head)
      const top = e.bridge.y + 2.4;
      const hy = up ? c.y - GROUND : top - 3.5;
      hang(cr.hook, crabX, hy, 0, top, up && c.sling === 1, HOOK.spread, false);
    });
    // the flak batteries, each piece on the ground under it
    batteries.forEach((f, i) => {
      const q = pose.flak[i], b = f.b, g = q.gun, n = Math.ceil(q.rows - 1e-6);
      f.pitG.position.set(b.x, ground(b.x, b.z), b.z); f.pitG.rotation.y = b.yaw;
      f.rowsG.forEach((r, k) => { r.visible = k < n; });
      f.bank.visible = q.rows > 0; f.bank.scale.set(1, Math.max(0.05, Math.min(1, q.rows / b.rows)), 1);
      f.gun.position.set(g.x, ground(g.x, g.z) + g.y, g.z); f.gun.rotation.y = g.a;
      f.barrel.rotation.x = f.el * g.el;
      f.bog.position.set(q.bogies.x, ground(q.bogies.x, q.bogies.z), q.bogies.z); f.bog.rotation.y = q.bogies.a;
      f.trac.position.set(q.tractor.x, ground(q.tractor.x, q.tractor.z), q.tractor.z); f.trac.rotation.y = q.tractor.a;
    });
    for (const dk of derricks) {
      const d = pose.erect[dk.j].derricks[dk.si];
      dk.boom.rotation.set(-d.luff, d.slew, 0);
      // the boom's tip in the derrick's frame; the hook point (crane frame) brought into it
      const tip = _a.set(0, DERRICK.boom, 0).applyEuler(dk.boom.rotation).add(dk.boom.position);
      const hx = d.hx - d.x, hz = d.hz - d.z, hy = d.hy;
      stretch(dk.top, _b.set(0, DERRICK.mast, 0), tip);
      hang(dk.hook, hx, hy, hz, hy + 0.35, d.rope === 1, 0.9, true);
      stretch(dk.hoist, _c.set(hx, hy + 0.3, hz), tip); // the hoist rope from the hook up to the boom's tip
    }
  };

  // ---------------------------------------------------------------- stages
  const setStage = (o = {}) => {
    for (const k of Object.keys(stage)) if (o[k] != null) stage[k] = clamp01(o[k]);
    const { survey, track, camo } = stage;
    // survey: stakes and tape from the curve's rear end, the theodolite as soon as the surveyors are out
    G.survey.visible = survey > 0;
    surveyKit.visible = !(survey >= 1 && track >= 1);
    for (const im of stakes) im.count = Math.round(NST * survey) * 3;
    tapeGeo.setDrawRange(0, Math.round(NTS * survey) * 6);
    // track: the straight stands; on the curve the bed runs ahead of the sleepers, the sleepers ahead of the rails
    const nc = NSEG - NSEG0, ns = NSLP - NSLP0;
    bedGeo.setDrawRange(0, (NSEG0 + Math.round(nc * Math.min(1, track * 1.25))) * 30);
    for (const im of sleepers) im.count = (NSLP0 + Math.round(ns * clamp01(track * 1.12))) * 2;
    for (const im of rails) im.count = (NSEG0 + Math.round(nc * track)) * 4;
    if (G.track.userData.guard) G.track.userData.guard.visible = track >= 1;
    // camo: the poles go up from the rear, then the net is drawn over them
    G.camo.visible = camo > 0;
    const np = Math.ceil(NPOLE * smoothK(0, 0.5, camo));
    for (const im of poles) im.count = np;
    const rows = Math.round(NROWS * smoothK(0.3, 1, camo));
    netGeo.setDrawRange(0, roofRows[rows]);
    valances.forEach((mesh) => { mesh.visible = camo >= 0.85; });
    rigging.visible = camo >= 0.5;
  };
  setStage({ survey: 1, track: 1, camo: 0 });
  return { root, setStage, setWorks, stage, layout: L, railHead: -GROUND, curveR: R, parts: { batteries, cranes, trains, locos } };
}

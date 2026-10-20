import { D_ASM, DEL_X, TRACK_X, CRANE, DERRICK, FLAK, pathU, vehicleAt } from './gustav_layout.js';

// The Gustav's setup as motion (plain data and pure functions, Node-safe): where every train, wagon, crane and
// part of the gun is, from the preparation's progress (src/ww2/special.js: st.stage, st.assembly). A pure
// function of that progress, so time compression and fastForward are exact. heavy_gustav_site.js draws the
// trains and the cranes, gustav.js the gun's parts and bogies, ww2/render.js puts them together.
//
// The assembly as the sources tell it: the bogie units are pushed in on the two gun tracks; the parts trains come
// up the delivery track from the yard; the gantry cranes travel to a part, lift it off its wagons, carry it across
// and lower it onto the gun: the two girder halves (the lower carriage), the upper carriage with the loading
// platform and the lift towers, the cradle with the barrel's rear half and the breech, the barrel's front half
// (joined at the collar); then the two diesel locomotives come up behind with the shell wagon and the charge van,
// couple on and push the gun onto the firing curve.

// the trains and their cars (lengths over buffers, bogie pitch) on their tracks (gustav_layout paths)
const shunter = { kind: 'shunter', len: 10.4, pitch: 5.2 }; // a Wehrmacht diesel shunting locomotive
export const D311 = { kind: 'd311', len: 24.8, pitch: 17.0 }; // the Krupp twin diesel (two units back to back)
const flat = (len, carries) => ({ kind: 'flat', len, pitch: len - 5.2, carries });
export const TRAINS = {
  girders: { path: 'sd1', cars: [shunter, flat(44, 'gL'), flat(44, 'gR')] },
  upper: { path: 'sd2', cars: [shunter, flat(33, 'upper')] },
  cradle: { path: 'sd3', cars: [shunter, flat(23, 'cradle')] },
  front: { path: 'del', cars: [shunter, flat(19, 'front')] },
  ammo: { path: 'ammo', cars: [{ kind: 'tank', len: 13.6, pitch: 6.5 }, { kind: 'shells', len: 12.6, pitch: 8.0 }, { kind: 'shells', len: 12.6, pitch: 8.0 }, { kind: 'shells', len: 12.6, pitch: 8.0 }, { kind: 'van', len: 10, pitch: 6.4 }] },
};
export const GAP = 0.6; // between buffers
export const DECK = 1.25, CRIB = 0.3; // a flat wagon's deck above the rail head, the timber cribbing a part rests on
// the gun's own consist on each track: its two bogie units (a span bolster on two bogies), the wagon behind it
// (shells on the left track, charges on the right; gustav.js wagS, wagC), the diesel
export const GZ = [-13.4, -6.7, 6.7, 13.4]; // the bogies' centres along the gun (z back; gustav.js)
const UNIT_REAR = 16.75; // the rear unit's rear headstock behind the gun's centre
export const WAGONS = { S: { z: 21.5 + 0.98 + 5.5, len: 11.9, pitch: 7.4 }, C: { z: 21.5 + 0.98 + 4.2, len: 9.3, pitch: 4.8 } };
const BACK = 3.5; // the wagons and diesels stand this far back from the gun while the cranes work

// the acts of the assembly (fractions of st.assembly) and, inside a lift, its moves (fractions of the act)
export const ACTS = { bog: [0, 0.1], gL: [0.1, 0.22], gR: [0.22, 0.32], upper: [0.32, 0.5], cradle: [0.5, 0.66], front: [0.66, 0.8], drive: [0.8, 1] };
const M = { train: [0, 0.25], to: [0.03, 0.24], hookDown: [0.25, 0.32], up: [0.32, 0.42], along: [0.42, 0.56], across: [0.52, 0.66], down: [0.66, 0.82], hookUp: [0.83, 0.92], out: [0.5, 0.8] };
export const ORDER = ['gL', 'gR', 'upper', 'cradle', 'front']; // the order they go on
const TRAIN_OF = { gL: 'girders', gR: 'girders', upper: 'upper', cradle: 'cradle', front: 'front' };
export const HOOK = { rest: 18.4, sling: 1.2, eye: 0.97, spread: 1.1 }; // the hook block's top position, sling, eye, legs' spread
const MARGIN = 0.45; // a lifted part clears what is already on the gun under it by this
export const CRANE_PARK = [D_ASM - 9.5, D_ASM + 9.5]; // where the cranes stand over the gun when they are put up

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (k, a, b) => { const t = clamp01((k - a) / (b - a)); return t * t * (3 - 2 * t); };
const span = (k, [a, b]) => clamp01((k - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (x) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));

// layout: gustavLayout(); meta: the gun's parts as gustav.js measures them (rig.works): per part its box in the gun
// frame and its top and bottom profiles along z ({ x0, x1, y0, y1, z0, z1, z: bin centres, top, bot }), and the
// installed bogie units' top (bogTop)
export function createWorks(layout, meta) {
  const P = layout.paths, sAsm = layout.RUN - D_ASM, R = layout.R;
  const trains = {};
  for (const [id, t] of Object.entries(TRAINS)) {
    let o = 0;
    const offs = t.cars.map((c) => { const m = o + c.len / 2; o += c.len + GAP; return m; });
    const L = o - GAP;
    trains[id] = { ...t, P: P[t.path], offs, L, park: Math.min(P[t.path].len - 2, 3 + L), stop: 0 };
  }
  const zc = (m) => (m.z0 + m.z1) / 2, xc = (m) => (m.x0 + m.x1) / 2;
  // each parts train stops with its first part's centre over where that part goes on (z behind the gun's centre)
  for (const id of ['girders', 'upper', 'cradle', 'front']) {
    const t = trains[id], i = t.cars.findIndex((c) => c.carries);
    t.stop = pathU(t.P, D_ASM + zc(meta.parts[t.cars[i].carries])) + t.offs[i];
  }
  trains.ammo.stop = pathU(trains.ammo.P, 14);
  // the parts: where each lies on its wagon, its carrying height, the cranes' two lift points along it
  const lift = {};
  ORDER.forEach((id, i) => {
    const m = meta.parts[id], t = trains[TRAIN_OF[id]], car = t.cars.findIndex((c) => c.carries === id), first = t.cars.findIndex((c) => c.carries);
    // what it passes over on its way across, from over the delivery track to its place: the parts already on whose
    // width it sweeps (and the bogie units, for the girders)
    const sw0 = Math.min(m.x0, m.x0 + DEL_X - xc(m)), sw1 = Math.max(m.x1, m.x1 + DEL_X - xc(m));
    const under = ORDER.slice(0, i).map((q) => meta.parts[q]).filter((q) => q.x1 > sw0 && q.x0 < sw1);
    let dy = 0.6;
    for (let k = 0; k < m.z.length; k++) {
      if (!(m.bot[k] < 1e8)) continue;
      let top = id === 'gL' || id === 'gR' ? (Math.abs(m.z[k]) < 16.8 ? meta.bogTop : -1e9) : -1e9; // the bogie units are in
      for (const q of under) top = Math.max(top, profileAt(q, 'top', m.z[k]));
      dy = Math.max(dy, top + MARGIN - m.bot[k]);
    }
    const yW = DECK + CRIB - m.y0; // on its wagon: its bottom on the cribbing
    dy = Math.max(dy, yW + 0.9);
    const L = m.z1 - m.z0, sp = Math.max(8.5, Math.min(19, L * 0.55));
    const pts = [zc(m) - sp / 2, zc(m) + sp / 2];
    lift[id] = {
      dy, yW, pts, tops: pts.map((z) => profileAt(m, 'top', z, 1.2)), xc: xc(m), zc: zc(m), car,
      // the part's own origin (the gun's) while it lies on its wagon at the stop: d back from the curve's start
      dStop: D_ASM + zc(m) + (t.offs[car] - t.offs[first]) - zc(m),
    };
  });

  const v = () => ({ x: 0, z: 0, a: 0, u: 0, vis: true });
  const pose = {
    gun: { s: sAsm, x: 0, z: 0, a: 0, works: true },
    bog: Array.from({ length: 8 }, v), bol: Array.from({ length: 4 }, v),
    wag: { S: v(), C: v() }, locos: { L: v(), R: v() },
    parts: Object.fromEntries(ORDER.map((id) => [id, { vis: true, x: 0, y: 0, z: 0, a: 0, on: 'wagon' }])),
    trains: Object.fromEntries(Object.keys(TRAINS).map((id) => [id, { cars: TRAINS[id].cars.map(v), u: 0 }])),
    cranes: [0, 1].map(() => ({ d: 0, x: 0, y: HOOK.rest, sling: 0 })),
    craneErect: 0, lift, sAsm,
    // the flak batteries: the tractor, the gun (raised on its bogies while towed, its barrel down), the bogies, the pit
    flak: FLAK.map(() => ({ tractor: v(), gun: { x: 0, z: 0, a: 0, y: 0, el: 0 }, bogies: v(), rows: 0 })),
  };
  const tmp = { x: 0, z: 0, a: 0 }, tf = { x: 0, z: 0, a: 0 }, tb = { x: 0, z: 0, a: 0 };

  // the wheels' run on a gun track (its radius on the curve), from the firing station, so they match gustav.js's roll
  const run = (s, xo) => (s < layout.RUN ? s : layout.RUN + ((s - layout.RUN) * (R + xo)) / R) - (layout.RUN + (layout.S_STATION - layout.RUN) * (R + xo) / R);
  // a vehicle on a gun track at centreline s: its body on the chord between its bogies
  const onGunTrack = (s, xo, pitch, q) => {
    layout.at(s + pitch / 2, xo, tf); layout.at(s - pitch / 2, xo, tb);
    q.x = (tf.x + tb.x) / 2; q.z = (tf.z + tb.z) / 2; q.a = Math.atan2(-(tf.x - tb.x), -(tf.z - tb.z)); q.u = run(s, xo);
    return q;
  };
  // a train with its head at u: each car between its bogies on its track
  const trainAt = (id, u) => {
    const t = trains[id], o = pose.trains[id];
    o.u = u;
    t.cars.forEach((c, i) => { const q = o.cars[i]; vehicleAt(t.P, u - t.offs[i], c.pitch, q); q.u = u - t.offs[i]; });
  };
  // a part as it lies on its wagon: its centre over the car's, its own origin (the gun's) placed from that
  const onWagon = (id) => {
    const m = lift[id], q = pose.trains[TRAIN_OF[id]].cars[m.car], o = pose.parts[id], c = Math.cos(q.a), s = Math.sin(q.a);
    o.x = q.x - (m.xc * c + m.zc * s); o.z = q.z - (-m.xc * s + m.zc * c); o.y = m.yW; o.a = q.a; o.on = 'wagon'; o.vis = true;
  };
  const trainU = (id, k) => {
    // a parts train: up from the yard for its first part, back when its last is off its wagons
    const t = trains[id], parts = ORDER.filter((p) => TRAIN_OF[p] === id), a = ACTS[parts[0]], b = ACTS[parts[parts.length - 1]];
    const tIn = sm(span(span(k, a), M.train), 0, 1), tOut = sm(span(span(k, b), M.out), 0, 1);
    return lerp(lerp(t.park, t.stop, tIn), t.park, tOut);
  };

  // az: the gun's laying once it stands on its curve (rig.setTraverse runs it along the curve: s = S_STATION + R az),
  // car: its carriage's run back on firing (rig.carZ). The two diesels stay coupled behind its wagons and go with it:
  // they are what moves it along the curve to lay it.
  function update(st, az = 0, car = 0) {
    const k = st.assembly ?? 1;
    // ------------------------------------------------ the gun's two consists on their tracks
    const kb = span(k, ACTS.bog), kd = span(k, ACTS.drive), done = kd >= 1;
    // the gun's centre (or where it will be, for the bogie units on their way in)
    const wl = (w) => WAGONS[w].len;
    const zWrake = (w) => UNIT_REAR + 0.6 + wl(w) / 2; // the wagon coupled behind the rear unit
    const sPark = 3 + Math.max(zWrake('S') + wl('S') / 2, zWrake('C') + wl('C') / 2) + GAP + D311.len; // the diesel's rear at s = 3
    let sG = sAsm, zW = (w) => WAGONS[w].z + BACK;
    if (kd <= 0) {
      sG = lerp(sPark, sAsm, sm(kb, 0, 0.7));
      const back = sm(kb, 0.78, 1);
      zW = (w) => lerp(zWrake(w), WAGONS[w].z + BACK, back);
    } else {
      sG = lerp(sAsm, layout.S_STATION, sm(kd, 0.25, 0.85));
      const up = sm(kd, 0, 0.25);
      zW = (w) => WAGONS[w].z + BACK * (1 - up);
    }
    pose.gun.s = sG; pose.gun.works = !done;
    layout.at(sG, 0, tmp); pose.gun.x = tmp.x; pose.gun.z = tmp.z; pose.gun.a = tmp.a;
    let bi = 0, oi = 0;
    for (const [side, w, xo] of [['L', 'S', -TRACK_X], ['R', 'C', TRACK_X]]) {
      for (let u = 0; u < 2; u++) {
        const z0 = GZ[u * 2], z1 = GZ[u * 2 + 1];
        const b0 = onGunTrack(sG - z0, xo, 0, pose.bog[bi++]), b1 = onGunTrack(sG - z1, xo, 0, pose.bog[bi++]);
        const q = pose.bol[oi++];
        q.x = (b0.x + b1.x) / 2; q.z = (b0.z + b1.z) / 2; q.a = Math.atan2(-(b0.x - b1.x), -(b0.z - b1.z));
      }
      const zw = zW(w);
      onGunTrack(sG - zw, xo, WAGONS[w].pitch, pose.wag[w]);
      onGunTrack((done ? layout.S_STATION + R * az - car : sG) - (zw + wl(w) / 2 + GAP + D311.len / 2), xo, D311.pitch, pose.locos[side]);
    }
    // ------------------------------------------------ the parts trains, the parts, the cranes
    for (const id of ['girders', 'upper', 'cradle', 'front']) trainAt(id, trainU(id, k));
    const cr = pose.cranes;
    // where the cranes stand at an act's start: over the last part they set down (or where they were put up)
    const at0 = (i, j) => (i ? D_ASM + lift[ORDER[i - 1]].pts[j] : CRANE_PARK[j]);
    const x0 = (i) => (i ? lift[ORDER[i - 1]].xc : DEL_X / 2);
    let n = 0; // parts already on
    ORDER.forEach((id) => { if (k >= ACTS[id][1]) n++; });
    // with the gun on its way out, they run back to where they were put up (the derricks take them down there)
    const home = sm(kd, 0.1, 0.7);
    for (let j = 0; j < 2; j++) { cr[j].d = lerp(at0(n, j), CRANE_PARK[j], home); cr[j].x = lerp(x0(n), CRANE.cx, home); cr[j].y = HOOK.rest; cr[j].sling = 0; }
    ORDER.forEach((id, i) => {
      const a = ACTS[id], ka = span(k, a), m = lift[id], o = pose.parts[id];
      if (k < a[1] && (k <= a[0] || ka < M.up[0])) onWagon(id);
      if (k >= a[1]) { o.x = 0; o.z = 0; o.y = 0; o.a = 0; o.on = 'gun'; o.vis = true; }
      if (k <= a[0] || k >= a[1]) return;
      // this part's act: its train is up; the cranes travel to it, hook on, lift, carry it along and across, set it down
      const lifted = ka >= M.up[0], kto = sm(span(ka, M.to), 0, 1), kh = sm(span(ka, M.hookDown), 0, 1), khu = sm(span(ka, M.hookUp), 0, 1);
      const d = lerp(m.dStop, D_ASM, sm(span(ka, M.along), 0, 1)), x = lerp(DEL_X - m.xc, 0, sm(span(ka, M.across), 0, 1));
      const kdn = sm(span(ka, M.down), 0, 1), y = kdn > 0 ? lerp(m.dy, 0, kdn) : lerp(m.yW, m.dy, sm(span(ka, M.up), 0, 1));
      if (lifted) {
        layout.onStraight(d, x, tmp);
        o.x = tmp.x; o.z = tmp.z; o.a = tmp.a; o.y = y; o.vis = true; o.on = kdn >= 1 ? 'gun' : 'hook';
      }
      for (let j = 0; j < 2; j++) {
        const c = cr[j];
        if (!lifted) { c.d = lerp(at0(i, j), m.dStop + m.pts[j], kto); c.x = lerp(x0(i), DEL_X, kto); }
        else { c.d = d + m.pts[j]; c.x = x + m.xc; }
        const yHook = (lifted ? y : m.yW) + m.tops[j] + HOOK.sling + HOOK.eye;
        c.y = ka < M.hookDown[1] ? lerp(HOOK.rest, yHook, kh) : ka >= M.hookUp[0] ? lerp(yHook, HOOK.rest, khu) : yHook;
        c.sling = ka >= M.hookDown[1] && ka < M.hookUp[0] ? 1 : 0;
      }
    });
    // ------------------------------------------------ the ammunition train runs in on its siding; the cranes go up
    trainAt('ammo', lerp(trains.ammo.park, trains.ammo.stop, sm(st.stage?.ammo ?? 1, 0, 1)));
    erect(st.stage?.cranes ?? 0);
    flak(st.stage?.flak ?? 1);
    return pose;
  }

  // ------------------------------------------------ the flak batteries come in, one after the other
  // Each waits in its field with its gun hooked up (barrel down, pointing back over the tow); in its turn its tractor
  // tows it in, the gun is let down off its bogies and turned to its arc, the barrel goes up, the bogies are run aside
  // behind it, the tractor draws off to the side, and the pit's sandbag ring goes up row by row round it.
  const TOW = 8.5, RAISED = 0.65;
  function flak(F) {
    FLAK.forEach((b, i) => {
      const o = pose.flak[i], w = span(F, [i / 4, (i + 1) / 4]);
      const dx = b.x - b.wait.x, dz = b.z - b.wait.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, a = Math.atan2(-ux, -uz);
      const sx = -uz, sz = ux; // the side the tractor draws off to
      const kin = sm(w, 0, 0.4), kdn = sm(w, 0.4, 0.55), kout = sm(w, 0.55, 0.72);
      const gx = lerp(b.wait.x, b.x, kin), gz = lerp(b.wait.z, b.z, kin);
      // the tractor ahead of its gun on the tow, then off to its place beside the pit
      const t = o.tractor, tx0 = gx + ux * TOW, tz0 = gz + uz * TOW, px = b.x + ux * TOW + sx * 12, pz = b.z + uz * TOW + sz * 12;
      t.x = lerp(tx0, px, kout); t.z = lerp(tz0, pz, kout); t.a = kout > 0 && kout < 1 ? Math.atan2(-(px - (b.x + ux * TOW)), -(pz - (b.z + uz * TOW))) : a;
      if (kout >= 1) t.a = a + Math.PI / 2;
      // the gun: towed barrel-back, let down, turned to its arc, the barrel raised
      const g = o.gun;
      g.x = gx; g.z = gz; g.y = RAISED * (1 - kdn);
      g.a = a + Math.PI + wrapPi(b.yaw - a - Math.PI) * kdn;
      g.el = sm(w, 0.5, 0.68);
      // the bogies: under the gun until it stands, then run back behind the pit
      const q = o.bogies, bx = b.x - ux * (b.ring + 4), bz = b.z - uz * (b.ring + 4);
      q.x = lerp(gx, bx, kout); q.z = lerp(gz, bz, kout); q.a = a + Math.PI;
      o.rows = sm(w, 0.62, 1) * b.rows;
    });
  }

  // ------------------------------------------------ the cranes put up by the four hand derricks (and taken down)
  // Each crane in turn: its sides' sections, one round at a time on both sides, then its bridge hoisted on both
  // derricks. All in the crane's own frame at its place over the gun (CRANE_PARK); the derricks stand at z = DERRICK.z beside
  // it, outside its rails; the sections stand ready on cribbing outward of them, turned across.
  const SEC_H = CRANE.H / CRANE.SEG, STACK_Z = [-3, 0, 3], DZ = DERRICK.z, CLEAR = SEC_H + 0.5;
  pose.erect = [0, 1].map(() => ({
    sec: [0, 1].map(() => Array.from({ length: CRANE.SEG }, () => ({ x: 0, y: 0, z: 0, a: 0, on: 'stack' }))),
    bridge: { y: 0.3, on: 'ground' },
    derricks: [0, 1].map(() => ({ x: 0, z: 0, slew: 0, luff: 0.3, hx: 0, hy: 0, hz: 0, rope: 0 })),
  }));
  const stackOf = (side, i, o) => { o.x = side * DERRICK.stack[1]; o.y = 0.3; o.z = STACK_Z[i]; o.a = Math.PI / 2; return o; };
  // a derrick's boom over a hook point (crane frame): slew to it, luff so the tip stands above it
  const aim = (d, side, hx, hy, hz, on) => {
    const dx = hx - d.x, dz = hz - d.z, r = Math.hypot(dx, dz);
    d.slew = Math.atan2(-dx, -dz); d.luff = Math.asin(Math.min(0.92, Math.max(0.12, r / DERRICK.boom)));
    d.hx = hx; d.hy = hy; d.hz = hz; d.rope = on ? 1 : 0;
  };
  // at rest the boom stands up, leaning outward, clear of a crane running past on its rails
  const REST = (side) => side * (DERRICK.x + 3.5), REST_Y = DERRICK.foot + DERRICK.boom * 0.95 - 3;
  const rest = (d, side, dz) => aim(d, side, REST(side), REST_Y, dz, false);
  function erect(E) {
    for (let j = 0; j < 2; j++) {
      const e = span(E, [j * 0.5, j * 0.5 + 0.5]), c = pose.erect[j], dz = DZ[j];
      for (let si = 0; si < 2; si++) {
        const side = si ? 1 : -1, der = c.derricks[si];
        der.x = side * DERRICK.x; der.z = dz;
        rest(der, side, dz);
        for (let i = 0; i < CRANE.SEG; i++) {
          const o = c.sec[si][i], w = span(e, [0.06 + i * 0.18, 0.24 + i * 0.18]);
          const sx = side * DERRICK.stack[1], ix = side * CRANE.hs, iy = i * SEC_H;
          if (w <= 0) { stackOf(side, i, o); o.on = 'stack'; continue; }
          if (w >= 1) { o.x = ix; o.y = iy; o.z = 0; o.a = 0; o.on = 'crane'; continue; }
          // to the stack, hook on, up clear of the others, across (turned in line with the rail), down onto the side
          const kto = sm(w, 0, 0.18), kdn0 = sm(w, 0.18, 0.26), kup = sm(w, 0.26, 0.44), kac = sm(w, 0.44, 0.7), kdn = sm(w, 0.7, 0.88), khu = sm(w, 0.88, 1);
          const y = kdn > 0 ? lerp(Math.max(CLEAR, iy + 0.5), iy, kdn) : lerp(0.3, Math.max(CLEAR, iy + 0.5), kup);
          const x = lerp(sx, ix, kac), z = lerp(STACK_Z[i], 0, kac);
          if (w < 0.26) stackOf(side, i, o); else { o.x = x; o.y = y; o.z = z; o.a = lerp(Math.PI / 2, 0, kac); }
          o.on = w < 0.26 ? 'stack' : 'hook';
          const top = (w < 0.26 ? 0.3 : y) + SEC_H + HOOK.sling * 0.6;
          if (w < 0.18) { const hx = lerp(REST(side), sx, kto), hz = lerp(dz, STACK_Z[i], kto); aim(der, side, hx, lerp(REST_Y, top + 2, kto), hz, false); }
          else if (w < 0.26) aim(der, side, sx, lerp(top + 2, top, kdn0), STACK_Z[i], true);
          else if (w < 0.88) aim(der, side, x, top, z, true);
          else aim(der, side, lerp(ix, REST(side), khu), lerp(top, REST_Y, khu), lerp(0, dz, khu), khu < 0.3);
        }
      }
      // the bridge: on its cribbing across the tracks, hoisted on both derricks to the top of the sides
      const wb = span(e, [0.6, 0.92]), b = c.bridge;
      b.y = lerp(0.3, CRANE.H, sm(wb, 0.22, 0.88)); b.on = wb <= 0.22 ? 'ground' : wb >= 0.88 ? 'crane' : 'hook';
      if (wb > 0 && wb < 1) for (let si = 0; si < 2; si++) {
        const side = si ? 1 : -1, der = c.derricks[si], ex = side * (CRANE.hs + 0.8);
        const kto = sm(wb, 0, 0.15), kd = sm(wb, 0.15, 0.22), khu = sm(wb, 0.9, 1), top = b.y + 2.6 + HOOK.sling;
        if (wb < 0.15) aim(der, side, lerp(REST(side), ex, kto), lerp(REST_Y, top + 3, kto), lerp(dz, 0, kto), false);
        else if (wb < 0.22) aim(der, side, ex, lerp(top + 3, top, kd), 0, true);
        else if (wb < 0.9) aim(der, side, ex, top, 0, true);
        else aim(der, side, lerp(ex, REST(side), khu), lerp(top, REST_Y, khu), lerp(0, dz, khu), khu < 0.3);
      }
      c.up = e; // 0: all on the ground; 1: standing
    }
  }
  // Where to look for a task of the preparation (the camera's focus while that task is chosen on the procedure card):
  // a point in the site frame, how far to stand off and how steeply to look down. From the last update's pose.
  function focusOf(task, st, out = { x: 0, y: 0, z: 0, dist: 80, pitch: 0.3 }) {
    const S = st.stage ?? {}, k = st.assembly ?? 1, at = (x, y, z, dist, pitch) => { out.x = x; out.y = y; out.z = z; out.dist = dist; out.pitch = pitch; return out; };
    const front = (f) => layout.RUN + 20 + (layout.LT - layout.RUN - 40) * clamp01(f); // a work front along the curve
    if (task === 'survey' || task === 'track') { layout.at(front(S[task] ?? 0), 0, tmp); return at(tmp.x, 1, tmp.z, task === 'track' ? 60 : 75, 0.38); }
    if (task === 'flak') {
      const i = Math.min(3, Math.floor((S.flak ?? 0) * 4)), g = pose.flak[i].gun;
      return at(g.x, 2, g.z, 48, 0.32);
    }
    if (task === 'cranes') { layout.onStraight(CRANE_PARK[(S.cranes ?? 0) < 0.5 ? 0 : 1], CRANE.cx, tmp); return at(tmp.x, 9, tmp.z, 80, 0.22); }
    if (task === 'ammo') { const q = pose.trains.ammo.cars[2]; return at(q.x, 2, q.z, 85, 0.3); }
    if (task === 'camo') return at(0, 8, 0, 105, 0.45);
    if (task === 'assembly') {
      if (k < ACTS.bog[1]) { const q = pose.bog[0]; return at(q.x, 2, q.z, 60, 0.25); }
      if (k >= ACTS.drive[0]) return at(pose.gun.x, 5, pose.gun.z, 115, 0.3);
      const id = ORDER.find((p) => k < ACTS[p][1]) ?? 'front', m = lift[id], q = pose.parts[id], c = Math.cos(q.a), sn = Math.sin(q.a), M = meta.parts[id];
      return at(q.x + m.xc * c + m.zc * sn, q.y + (M.y0 + M.y1) / 2, q.z - m.xc * sn + m.zc * c, 78, 0.22);
    }
    return null;
  }
  return { pose, update, focusOf, trains, sAsm, lift };
}

// a part's profile ('top' or 'bot') at z (the worst within w of it); -1e9 / 1e9 where it has nothing
export function profileAt(m, which, z, w = 0.5) {
  const a = m[which], n = m.z.length, dz = m.z[1] - m.z[0];
  let best = which === 'top' ? -1e9 : 1e9;
  const i0 = Math.max(0, Math.floor((z - w - m.z[0]) / dz)), i1 = Math.min(n - 1, Math.ceil((z + w - m.z[0]) / dz));
  for (let i = i0; i <= i1; i++) best = which === 'top' ? Math.max(best, a[i]) : Math.min(best, a[i]);
  return best;
}

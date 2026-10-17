// FX sandbox. ?fx=gun&cal=15 | ?fx=burst&cal=9.2&ground=mud|water|rubble|concrete&fuze=impact|delay|instant
// | ?fx=shrapnel | ?fx=cookoff&size=1.5 | ?fx=barrage   plus &t=1.5 (seconds after the trigger to capture,
// stepped deterministically), &night=1, &cam=az,el,dist (compass bearing of the camera from the target,
// elevation, metres), &flat=1, &grade=1917, &sun=elevation, &post=0, &live=1 (real time; keys 1 to 5
// fire an effect, N toggles night), &dazzle=k.
// WW2: ?fx=rocket (one Nebelwerfer rippling six rockets 1.6 s apart, &n=1..6), ?fx=salvo (three
// launchers, 18 rockets), ?fx=v1launch (the steam catapult and the V-1 flying off the ramp), ?fx=v1 (a
// V-1 cruising past), ?fx=v2ign (pre-stage at 0 s, main stage at 3 s, lift-off at 4 s, climbing),
// ?fx=trail (18 Nebelwerfer rockets, a V-1 and a V-2 in flight at once, for the cost), ?fx=gustav (an
// 80 cm burst; &cal=23.6 for Karl), ?fx=gustavgun (the 80 cm gun firing). &scale=k runs the flyers
// k times faster per step (time compression).
import * as THREE from 'three';
import { globalUniforms, patchSceneFog, MAX_FLARE_LIGHTS } from '../shaderlib.js';
import { Atmosphere } from '../atmosphere.js';
import { FX, seedFx } from '../fx.js';
import { PostFX } from '../post.js';
import { Flares } from '../flares.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const kind = q.get('fx') || 'burst';
const live = q.has('live');
const adapt = q.has('adapt'); // render in-between frames while stepping, so the auto exposure adapts as in play
let night = q.get('night') === '1';
// &sheet=0.1,0.4,1.5,4: a contact sheet of the effect at those times (2 columns), for fast iteration
const sheet = q.has('sheet') ? q.get('sheet').split(',').map(Number) : null;
const [W, H] = sheet ? [Math.floor(innerWidth / 2), Math.floor(innerHeight / Math.ceil(sheet.length / 2))] : [innerWidth, innerHeight];
const info = document.getElementById('info');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: !!sheet });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(num('fov', 50), W / H, 0.4, 80000);

const atmosphere = new Atmosphere(renderer, scene);
atmosphere.sun.castShadow = false;
const sunEl = () => (night ? -12 : num('sun', 26));
atmosphere.set(sunEl(), 180 - 215);
atmosphere.setStorm(num('storm', 0.25));
globalUniforms.uCloudShadow.value = 0; // the sandbox ground is flat: no moving cloud shadows

// ground: the real terrain when it loads, else a flat mud plane
let terrain = null;
let ground = () => 0;
if (!q.has('flat')) {
  try {
    const mod = await import('../terrain.js');
    terrain = new mod.Terrain(scene, { quality: 'Low' });
    ground = terrain.heightAt;
  } catch (e) {
    console.warn('terrain unavailable, flat ground:', e.message);
  }
}
if (!terrain) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1), mat);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
  // a few dark tufts and posts for scale
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a2520 }));
  for (let i = 0; i < 90; i++) {
    const m = post.clone();
    const a = i * 2.399, r = 30 + i * 22;
    m.position.set(Math.cos(a) * r, 1.1, Math.sin(a) * r);
    scene.add(m);
  }
}

const fx = new FX(scene, { maxSmoke: num('smoke', 12000) });
fx.ground = ground;
fx.wind.set(-4, 0, 1.5);
patchSceneFog(scene);
const post = new PostFX(renderer, scene, camera);
post.setGrade(q.get('grade') || 'Natural');
const usePost = q.get('post') !== '0';

// the real analytic lights (flares.js), wired as main wires them
const flares = new Flares(scene, { ground });
fx.onFlash = (p, c, i, life, o) => flares.flash(p, c, i, life, o);
fx.onShock = (p, radius, speed, strength) => post.shockwave(p, { radius, speed, strength });
fx.onHeat = (p, radius, life) => post.heat(p, { radius, life });
const U = globalUniforms;
const updateFlashes = (dt) => flares.update(dt, camera, (2 * Math.tan((camera.fov * Math.PI) / 360)) / H);
const flashes = flares.flashes;

// ------------------------------------------------------------ scene setup per effect
const D2R = Math.PI / 180;
const cal = num('cal', 15);
const tCap = num('t', 1.5);
const GUN = new THREE.Vector3(0, 0, 0);
const target = new THREE.Vector3();
let camSpec;
function setup() {
  const sc = Math.min(1.1, cal / 15);
  if (kind === 'gun') {
    GUN.set(0, ground(0, 0) + 3.2, 0);
    target.set(10 * sc, GUN.y + 2, 0);
    camSpec = [num('az', 190), 8, 40 + 100 * sc];
  } else if (kind === 'burst') {
    target.set(0, ground(0, 0) + 40 * Math.pow(sc, 0.8), 0);
    camSpec = [200, 5, 120 + 380 * sc];
  } else if (kind === 'shrapnel') {
    target.set(0, ground(0, 0) + 25, 0);
    camSpec = [200, 8, 140];
  } else if (kind === 'cookoff') {
    target.set(0, ground(0, 0) + 30, 0);
    camSpec = [200, 6, 380 * num('size', 1.5)];
  } else if (kind === 'rocket') {
    target.set(6, ground(0, 0) + 10, 0);
    camSpec = [205, 7, 150];
  } else if (kind === 'salvo') {
    target.set(80, ground(0, 0) + 40, 0);
    camSpec = [200, 6, 520];
  } else if (kind === 'v1launch') {
    target.set(20, ground(0, 0) + 8, 0);
    camSpec = [210, 6, 170];
  } else if (kind === 'v1') {
    target.set(0, ground(0, 0) + 250, 0);
    camSpec = [180, 2, 160];
  } else if (kind === 'v2ign') {
    target.set(0, ground(0, 0) + 14, 0);
    camSpec = [205, 5, 260];
  } else if (kind === 'trail') {
    target.set(200, ground(0, 0) + 200, 0);
    camSpec = [200, 5, 1300];
  } else if (kind === 'gustav') {
    target.set(0, ground(0, 0) + 110, 0);
    camSpec = [200, 4, 1100];
  } else if (kind === 'gustavgun') {
    GUN.set(0, ground(0, 0) + 9, 0);
    target.set(20, GUN.y + 8, 0);
    camSpec = [num('az', 190), 7, 260];
  } else {
    target.set(0, ground(0, 0) + 30, -1900);
    camSpec = [175, 3, 1400];
  }
  const c = q.get('cam');
  if (c) camSpec = c.split(',').map(Number);
  const [az, el, d] = camSpec;
  camera.position.set(target.x + Math.sin(az * D2R) * Math.cos(el * D2R) * d, target.y + Math.sin(el * D2R) * d, target.z - Math.cos(az * D2R) * Math.cos(el * D2R) * d);
  camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 2);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

// ------------------------------------------------------------ the barrage script
function barrageScript() {
  const r = (a, b) => a + (b - a) * rng();
  let s = 7;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const ev = [];
  const add = (t, f) => ev.push({ t, f });
  const area = () => new THREE.Vector3(r(-420, 420), 0, r(-2150, -1650));
  for (let t = 0.5; t < 60; t += r(9, 16)) add(t, () => fx.shellBurst(area(), { calibre: 15, ground: rng() < 0.2 ? 'water' : 'mud' }));
  for (let t = 1; t < 60; t += r(3, 6)) add(t, () => fx.shellBurst(area(), { calibre: 9.2, ground: rng() < 0.25 ? 'water' : 'mud', fuze: rng() < 0.3 ? 'delay' : 'impact' }));
  for (let t = 0.5; t < 60; t += r(1.2, 2.6)) add(t, () => fx.shellBurst(area(), { calibre: rng() < 0.5 ? 6 : 5, ground: rng() < 0.2 ? 'rubble' : 'mud', fuze: rng() < 0.3 ? 'instant' : 'impact' }));
  for (let t = 2; t < 60; t += r(4, 8)) add(t, () => fx.shrapnel(area().setY(r(30, 60)), 4.5));
  add(25, () => fx.cookOff(area(), 1.5));
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
let script = [];

// ------------------------------------------------------------ WW2 rockets and missiles
// Flyers: { pos, vel, dir, kind, start, t, burn, acc (m/s^2 along dir while it burns), coast (trail
// after burnout too), grav, mesh }. Stepped in step(); trail() is called each step while it burns.
const flyers = [];
const props = new THREE.Group();
scene.add(props);
const grey = new THREE.MeshStandardMaterial({ color: 0x55584f, roughness: 0.8 });
const pale = new THREE.MeshStandardMaterial({ color: 0x8c8f84, roughness: 0.7 });
function flyer(o) {
  const f = { pos: o.pos.clone(), vel: (o.vel || new THREE.Vector3()).clone(), dir: o.dir.clone().normalize(), kind: o.kind, start: o.start ?? 0, t: 0, burn: o.burn ?? 1e9, acc: o.acc ?? 0, coast: !!o.coast, grav: o.grav ?? 9.8, mesh: o.mesh || null, lift: o.lift ?? 0, nozzle: o.nozzle ?? 0 };
  if (f.mesh) { props.add(f.mesh); f.mesh.position.copy(f.pos); }
  flyers.push(f);
  return f;
}
const _fv = new THREE.Vector3(), _fu = new THREE.Vector3(0, 1, 0);
function stepFlyers(dt) {
  for (const f of flyers) {
    if (T < f.start) {
      // standing (a V-1 on its ramp with the jet already running): the flame, no motion
      if (f.kind === 'v1' && f.pre) fx.trail(f.pos, _fv.copy(f.dir).multiplyScalar(0.01), 'v1', dt);
      continue;
    }
    f.t += dt;
    const burning = f.t < f.burn;
    if (burning && f.t > f.lift) f.vel.addScaledVector(f.dir, f.acc * dt);
    if (f.t > f.lift) f.vel.y -= f.grav * dt;
    if (f.kind === 'v2' && f.t < f.lift) f.vel.set(0, 0, 0);
    f.pos.addScaledVector(f.vel, dt);
    const gy = ground(f.pos.x, f.pos.z);
    if (f.pos.y < gy) { f.pos.y = gy; f.vel.set(0, 0, 0); }
    if (burning || f.coast) fx.trail(f.nozzle ? _fv.copy(f.pos).addScaledVector(f.dir, f.nozzle) : f.pos, f.vel.lengthSq() > 1e-4 ? f.vel : _fu.copy(f.dir).multiplyScalar(0.01), f.kind, dt);
    if (f.mesh) { f.mesh.position.copy(f.pos); f.mesh.quaternion.setFromUnitVectors(_fu.set(0, 1, 0), f.dir); }
  }
}

// a Nebelwerfer 41 stand-in: six tubes on a ring, the mouths at about 1.3 m
function nebelwerfer(x, z, az, start) {
  const el = 45 * D2R;
  const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const gy = ground(x, z);
  const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)), up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const tubes = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 10), grey);
    m.position.set(x, gy + 1.1, z).addScaledVector(side, Math.cos(a) * 0.24).addScaledVector(up, Math.sin(a) * 0.24).addScaledVector(dir, -0.65);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    tubes.add(m);
  }
  props.add(tubes);
  const n = num('n', 6), order = [0, 3, 1, 4, 2, 5];
  for (let k = 0; k < n; k++) {
    const a = (order[k] / 6) * Math.PI * 2;
    const mouth = new THREE.Vector3(x, gy + 1.1, z).addScaledVector(side, Math.cos(a) * 0.24).addScaledVector(up, Math.sin(a) * 0.24);
    const t = start + k * 1.6;
    script.push({ t, f: () => fx.rocketLaunch(mouth, dir) });
    flyer({ pos: mouth, dir, kind: 'rocket', start: t, burn: 1.8, acc: 196, vel: dir.clone().multiplyScalar(20) });
  }
}

function ww2Trigger() {
  props.clear();
  flyers.length = 0;
  script = [];
  const add = (t, f) => script.push({ t, f });
  if (kind === 'rocket') nebelwerfer(0, 0, 0, 0.2);
  else if (kind === 'salvo' || kind === 'trail') {
    for (let i = 0; i < 3; i++) nebelwerfer(-i * 12, i * 40 - 40, 0, 0.2 + i * 0.4);
    if (kind === 'trail') {
      // a V-1 crossing and a V-2 climbing, already under way
      flyer({ pos: new THREE.Vector3(-900, ground(0, 0) + 260, 260), dir: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3(170, 0, 0), kind: 'v1', grav: 0 });
      flyer({ pos: new THREE.Vector3(700, ground(700, -300) + 20, -300), dir: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(0, 30, 0), kind: 'v2', acc: 18, burn: 65 });
    }
  } else if (kind === 'v1launch' || kind === 'v1') {
    if (kind === 'v1') {
      flyer({ pos: new THREE.Vector3(-600, target.y, 0), dir: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3(170, 0, 0), kind: 'v1', grav: 0, mesh: v1Mesh(), nozzle: -4.4 });
    } else {
      const sl = 6 * D2R, len = 48, dir = new THREE.Vector3(Math.cos(sl), Math.sin(sl), 0);
      const foot = new THREE.Vector3(0, ground(0, 0), 0);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 1.4), pale);
      ramp.position.copy(foot).addScaledVector(dir, len / 2).add(new THREE.Vector3(0, 0.4, 0));
      ramp.rotation.z = sl;
      props.add(ramp);
      // the jet runs on the ramp for a second before the shot, then piston and missile run up it in 1 s
      const tail = foot.clone().add(new THREE.Vector3(0, 1.9, 0));
      const m = v1Mesh();
      m.geometry.translate(0, 4.2, 0); // the tail pipe's mouth at the flyer's point
      const f = flyer({ pos: tail, dir, kind: 'v1', start: 1, acc: 90, grav: 0, burn: 1, mesh: m });
      f.pre = true;
      f.coast = true;
      add(1, () => fx.v1Launch(foot, dir, len));
      add(2.0, () => { f.acc = 2; f.grav = 0.3; });
    }
  } else if (kind === 'v2ign') {
    const p = new THREE.Vector3(0, ground(0, 0) + 1.6, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, 14, 16), pale);
    body.geometry.translate(0, 7, 0);
    add(0, () => fx.v2Ignition(p, 0));
    add(3, () => fx.v2Ignition(p, 1));
    flyer({ pos: p, dir: new THREE.Vector3(0, 1, 0), kind: 'v2', start: 3, lift: 1.2, acc: 16, grav: 9.8, burn: 65, mesh: body });
  }
  script.sort((a, b) => a.t - b.t);
}
const v1Mesh = () => new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7.7, 12), grey); // along its dir, centred

function trigger() {
  fx.reset();
  flares.clear();
  seedFx(num('seed', 1));
  T = 0;
  scriptI = 0;
  if (kind === 'gun') {
    const el = num('elev', 40) * D2R;
    const dir = new THREE.Vector3(Math.cos(el), Math.sin(el), 0);
    fx.gunBlast(GUN, dir, cal, { night });
  } else if (kind === 'burst') {
    fx.shellBurst(new THREE.Vector3(0, ground(0, 0), 0), { calibre: cal, fuze: q.get('fuze') || 'impact', ground: q.get('ground') || 'mud', crater: true });
  } else if (kind === 'shrapnel') {
    fx.shrapnel(new THREE.Vector3(0, ground(0, 0) + 30, 0), cal || 4.5, new THREE.Vector3(0.5, -1, 0.1));
  } else if (kind === 'cookoff') {
    fx.cookOff(new THREE.Vector3(0, ground(0, 0), 0), num('size', 1.5));
  } else if (kind === 'gustav') {
    fx.shellBurst(new THREE.Vector3(0, ground(0, 0), 0), { calibre: num('cal', 31.5), fuze: q.get('fuze') || 'impact', ground: q.get('ground') || 'mud', crater: true });
  } else if (kind === 'gustavgun') {
    const el = num('elev', 50) * D2R;
    fx.gunBlast(GUN, new THREE.Vector3(Math.cos(el), Math.sin(el), 0), num('cal', 31.5), { night });
  } else if (kind === 'barrage') {
    script = barrageScript();
  } else {
    ww2Trigger();
  }
  const dz = num('dazzle', 0);
  if (dz > 0) post.dazzle(dz);
}

const env = { sunDir: atmosphere.lightDir, sunColor: new THREE.Color(), sunIntensity: 6.5, ambient: new THREE.Color() };
let T = 0, scriptI = 0, clock = 0;
const upd = { n: 0, sum: 0, max: 0, peak: 0 }; // cost of fx.update while stepping
function frameEnv() {
  const light = atmosphere.sun;
  env.sunColor.copy(light.color).multiplyScalar((atmosphere.sunBase ?? light.intensity) / 6.5);
  light.intensity = (atmosphere.sunBase ?? light.intensity) * 1.5;
  U.uSunDirW.value.copy(atmosphere.lightDir);
  U.uSunColorN.value.copy(env.sunColor);
  env.ambient.copy(scene.fog.color).multiplyScalar(1.0);
  scene.fog.density = 0.00009;
  U.fogHeightFalloff.value = 0.0006;
  atmosphere.update(target, clock, camera);
}

function postSettings() {
  const ex = post.exposure.params;
  ex.key = 0.17 * (1 - 0.45 * atmosphere.night);
  ex.max = 2 + 5 * (night ? 1 : 0);
  post.bloom.strength = 0.28 * (1 - 0.45 * atmosphere.night);
  post.bloom.threshold = 3.0;
  post.bloom.radius = 0.5;
  post.grade.uniforms.uNight.value = atmosphere.night;
  post.grade.uniforms.uVignette.value = 0.3;
  post.grade.uniforms.uGrain.value = 0.025;
  post.dof.enabled = false;
  post.lens.uniforms.uFlare.value = 0.3;
  post.lens.uniforms.uCA.value = 0.003;
}

function step(dt) {
  while (scriptI < script.length && script[scriptI].t <= T) script[scriptI++].f();
  stepFlyers(dt);
  T += dt;
  clock += dt;
  const u0 = performance.now();
  fx.update(dt, camera, { ...env, night: atmosphere.night });
  upd.n++; upd.sum += performance.now() - u0; upd.max = Math.max(upd.max, performance.now() - u0); upd.peak = Math.max(upd.peak, fx.smoke.n);
  updateFlashes(dt);
  post.update(clock, dt, atmosphere.sunDir, env.sunColor, sunEl());
}

function draw(dt) {
  postSettings();
  post.exposure.dt = dt;
  renderer.info.reset();
  if (usePost) post.render(dt);
  else renderer.render(scene, camera);
  if (!sheet) info.textContent = `${kind} cal ${cal}  t ${T.toFixed(2)}s  smoke ${fx.smoke.n}/${fx.smoke.max} glow ${fx.glow.n} clods ${fx.clods.n} em ${fx.emitters.n}  ${night ? 'night' : 'day'}`;
}

setup();
if (terrain) terrain.update(camera, true);
frameEnv();
step(1 / 30); // one empty step so the camera position is known to fx
T = 0;
trigger();

// deterministic stepping for captures: fixed 1/30 s steps, a rendered frame every ~0.25 s so the auto
// exposure adapts the way it would in play
window.__fx = {
  fx, post, camera, trigger, flashes, upd,
  stepTo(t, once = false) {
    const dt = num('scale', 1) / 30; // &scale=k: time compression, as the game hands fx a longer dt
    let sinceDraw = 0;
    while (T < t - 1e-6) {
      frameEnv();
      step(dt);
      sinceDraw += dt;
      if (adapt && sinceDraw >= 0.25 && T < t - 0.3) { draw(sinceDraw); sinceDraw = 0; }
    }
    if (terrain) terrain.update(camera);
    frameEnv();
    const t0 = performance.now();
    draw(once ? 1 : Math.max(dt, sinceDraw));
    if (!once) draw(dt);
    renderer.getContext().finish(); // the headless GPU is slow: let the work end before the page says it is done
    console.warn('draw ms', Math.round(performance.now() - t0));
    return { smoke: fx.smoke.n, glow: fx.glow.n, clods: fx.clods.n, T };
  },
};

if (sheet) {
  const sc = document.createElement('canvas');
  sc.width = innerWidth; sc.height = innerHeight;
  sc.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:5';
  document.body.appendChild(sc);
  const g = sc.getContext('2d');
  g.font = '14px monospace';
  sheet.forEach((t, i) => {
    window.__fx.stepTo(t, i > 0);
    const x = (i % 2) * W, y = Math.floor(i / 2) * H;
    g.drawImage(renderer.domElement, x, y, W, H);
    g.fillStyle = '#fff';
    g.fillText(`t = ${t}s   upd avg ${(upd.sum / Math.max(1, upd.n)).toFixed(2)} max ${upd.max.toFixed(1)} ms, smoke peak ${upd.peak}   smoke ${fx.smoke.n} glow ${fx.glow.n} clods ${fx.clods.n}`, x + 8, y + 18);
  });
  window.__fxDone = true;
} else if (live) {
  let last = performance.now();
  let acc = 0;
  addEventListener('keydown', (e) => {
    if (e.key === 'n') { night = !night; atmosphere.set(sunEl(), 180 - 215); }
    if (e.key === ' ') trigger();
  });
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frameEnv();
    step(dt);
    draw(dt);
    acc += dt;
    if (acc > num('every', 14)) { acc = 0; trigger(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__fxDone = true;
} else {
  window.__fx.stepTo(tCap);
  window.__fxDone = true;
}

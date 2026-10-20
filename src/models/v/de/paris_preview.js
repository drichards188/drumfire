// Dev page (Paris Gun agent): the Paris Gun's rig with its crew (render/crews.js GunCrew) driven by a fake piece
// through the sim's loading cycle (GUNS.paris.load), the shot and the run out, on a plain ground, and its firing
// position (buildParisSite) round it.
//   /src/models/v/de/paris_preview.html?cam=az,el,dist&target=x,y,z&site=1&crew=0
//   &step=shell&k=0.5   freeze at that step (or ready, fire with k = seconds since the shot)
//   &speed=4            live cycle at that speed;  &az=0.1 the traverse;  &el=0.9 the laid elevation (rad)
//   &ortho=right|left|top|front|rear  orthographic blueprint view with a metre grid (&span=m the view's half height)
//   &portal=0..1 (with site=1) the barrel-change crane run over the gun
//   window.__pp: { rig, crew, site, set(step, k), cam(az, el, dist, tx, ty, tz) }
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun, loadGuns, EXTRAS } from '../../guns.js';
import { GUNS } from '../../../sim/tables.js';
import { GunCrew } from '../../../render/crews.js';
import { CREW_ERA } from '../../../render/crews_ww1.js';
import { loadPose } from '../../../render/guns.js';
import { smooth } from '../../../render/anim.js';

const q = new URLSearchParams(location.search);
const kind = 'paris';
CREW_ERA.ww1 = true;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fa8ad);
scene.fog = new THREE.Fog(0x9fa8ad, 300, 1500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x5c5240, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x5d5340, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);
const ortho = q.get('ortho');
const aspect = innerWidth / innerHeight, span = Number(q.get('span') || 22);
const camera = ortho ? new THREE.OrthographicCamera(-span * aspect, span * aspect, span, -span, 0.1, 2000) : new THREE.PerspectiveCamera(40, aspect, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);

await loadGuns([kind]);
const rig = buildGun(kind);
scene.add(rig.root);
let site = null;
if (q.get('site') === '1' && EXTRAS.buildParisSite) {
  site = EXTRAS.buildParisSite(1);
  scene.add(site.root);
  if (q.get('portal') != null) site.setPortal(Number(q.get('portal')));
}
const t0 = performance.now();
const crew = q.get('crew') === '0' ? null : new GunCrew(rig, kind);
const crewMs = performance.now() - t0;
crew?.setLevel(2);

const g = GUNS[kind];
const elFire = Number(q.get('el') ?? g.restEl), az = Number(q.get('az') ?? 0);
const total = g.load.reduce((a, s) => a + s.dur, 0), READY = 4, AFTER = g.runout + 4;
const piece = { kind, i: 0, az, el: elFire, cmd: { az, el: elFire }, job: null, firedAt: -100, fireAt: 1e9, state: 'idle', rounds: 1, loaded: false, crew: g.crew, crewMax: g.crew, breech: 0 };
const sim = { time: 0, alpha: 0 };
function at(step, k) {
  let tt = 0;
  piece.job = null; piece.loaded = false; piece.breech = 0; piece.el = elFire; piece.fireAt = 1e9; piece.firedAt = -100; piece.state = 'idle';
  const i = g.load.findIndex((s) => s.step === step);
  if (i >= 0) {
    for (let j = 0; j < i; j++) tt += g.load[j].dur;
    const st = g.load[i];
    piece.job = { step, t: k * st.dur, dur: st.dur, i, n: g.load.length };
    piece.state = step === 'lay' ? 'laying' : 'loading';
    piece.loaded = i > g.load.findIndex((s) => s.step === 'close');
    piece.el = step === 'depress' ? elFire + (rig.loadEl - elFire) * smooth(k, 0, 1) : step === 'lay' ? rig.loadEl + (elFire - rig.loadEl) * smooth(k, 0, 1) : rig.loadEl;
    sim.time = 1000 + tt + k * st.dur;
  } else if (step === 'ready') {
    piece.state = 'ready'; piece.loaded = true; sim.time = 1000; piece.fireAt = 1000 + READY - k;
  } else if (step === 'fire') {
    piece.state = 'recoil'; sim.time = 1000; piece.firedAt = 1000 - k;
  }
  piece.cmd.el = piece.el;
}
function pose(dt) {
  rig.setTraverse(piece.az);
  rig.setElevation(piece.el);
  const tf = sim.time - piece.firedAt;
  let r = 0;
  if (tf >= 0 && tf < g.runout + 1.2) r = tf < 0.14 ? Math.sin((tf / 0.14) * Math.PI / 2) : tf < 0.45 ? 1 : 1 - smooth(tf, 0.45, 0.45 + g.runout);
  rig.setRecoil(r * (rig.recoilFade ? rig.recoilFade(piece.el) : 1));
  const { breech, tray } = loadPose(piece, 0);
  rig.setBreech(breech);
  rig.setTray?.(tray);
  rig.update?.(dt);
  crew?.update(piece, sim, dt, 2);
}
const step = q.get('step');
const speed = Number(q.get('speed') || 0);
let tc = 0;
function cycle(t) {
  const T = total + READY + AFTER;
  t %= T;
  if (t < total) { let a = 0; for (const s of g.load) { if (t < a + s.dur) return at(s.step, (t - a) / s.dur); a += s.dur; } }
  if (t < total + READY) return at('ready', t - total);
  at('fire', t - total - READY);
}
if (step) at(step, Number(q.get('k') || 0));
pose(0.016);

const c = new THREE.Vector3(0, 6, 4);
const tgt = (q.get('target') || '').split(',').map(Number);
if (tgt.length === 3 && tgt.every((v) => !isNaN(v))) c.set(tgt[0], tgt[1], tgt[2]);
const camQ = (q.get('cam') || '').split(',').map(Number);
function cam(azD = 140, elD = 22, dist = 50, tx, ty, tz) {
  if (tx != null) c.set(tx, ty, tz);
  const a = azD * Math.PI / 180, e = elD * Math.PI / 180;
  camera.position.set(c.x + dist * Math.sin(a) * Math.cos(e), c.y + dist * Math.sin(e), c.z - dist * Math.cos(a) * Math.cos(e));
  controls.target.copy(c);
  controls.update();
}
if (ortho) {
  const AX = { right: [1, 0, 0], left: [-1, 0, 0], front: [0, 0, -1], rear: [0, 0, 1], top: [0, 1, 0] }[ortho] || [1, 0, 0];
  camera.position.copy(c).addScaledVector(new THREE.Vector3(...AX), 400);
  camera.up.set(0, ortho === 'top' ? 0 : 1, ortho === 'top' ? -1 : 0);
  camera.lookAt(c);
  controls.target.copy(c);
  // a metre grid in the view plane (5 m lines darker)
  const grid = new THREE.Group();
  const mat = (o) => new THREE.LineBasicMaterial({ color: 0x223040, transparent: true, opacity: o, depthTest: false });
  const N = 80;
  const lines = (k, o) => { const pts = []; for (let i = -N; i <= N; i++) { if ((i % 5 === 0) !== k) continue; pts.push(new THREE.Vector3(i, -N, 0), new THREE.Vector3(i, N, 0), new THREE.Vector3(-N, i, 0), new THREE.Vector3(N, i, 0)); } return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat(o)); };
  grid.add(lines(false, 0.12), lines(true, 0.35));
  grid.renderOrder = 10;
  if (ortho === 'top') grid.rotation.x = -Math.PI / 2;
  else if (ortho === 'right' || ortho === 'left') grid.rotation.y = Math.PI / 2;
  grid.position.copy(c).addScaledVector(new THREE.Vector3(...AX), 150);
  if (ortho !== 'top') grid.position.y = 0;
  else { grid.position.x = 0; grid.position.z = 0; }
  scene.add(grid);
} else cam(camQ[0] ?? 140, camQ[1] ?? 22, camQ[2] || 50);
sun.target.position.copy(c);
sun.position.copy(c).add(new THREE.Vector3(-60, 100, -40));

const info = document.getElementById('info');
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (speed > 0) { tc += dt * speed; cycle(tc); }
  pose(dt);
  const j = piece.job;
  info.textContent = `paris (crew ${crewMs.toFixed(0)} ms)  ${j ? j.step + ' ' + (j.t / j.dur).toFixed(2) : piece.state}  el ${(piece.el * 180 / Math.PI).toFixed(1)}`;
  controls.update();
  renderer.render(scene, camera);
  window.__ready = true;
});
window.__pp = { crewMs, rig, crew, site, piece, set: (s, k) => { at(s, k); pose(0.016); }, cam };

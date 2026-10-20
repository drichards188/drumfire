// Dev page (max agent, a copy of heavy_preview.js): the 38 cm "Langer Max" rig with its loading crew (render/crews.js
// GunCrew and render/ww1/max38.js) driven by a fake piece through the sim's loading cycle (GUNS.max38.load), the shot
// and the run out, on a plain ground; &site=1 adds buildMax38Site around it.
//   /src/models/v/de/max38_preview.html?cam=az,el,dist&target=x,y,z&crew=0
//   &step=shell&k=0.5   freeze at that step (or ready, fire with k = seconds since the shot)
//   &speed=4            live cycle at that speed;  &az=0.1 the piece's traverse;  &el=0.7 its laid elevation
//   &site=1 (gustav) the firing position around it;  &lower=0..1 &schlepper=0..1 (karl)
//   window.__hp: { rig, crew, set(step, k), cam(az, el, dist, tx, ty, tz) }
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun, loadGuns, EXTRAS } from '../../guns.js';
import { GUNS, STEP } from '../../../sim/tables.js';
import { GunCrew } from '../../../render/crews.js';
import { loadPose } from '../../../render/guns.js';
import { smooth } from '../../../render/anim.js';

const q = new URLSearchParams(location.search);
const kind = 'max38';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fa8ad);
scene.fog = new THREE.Fog(0x9fa8ad, 200, 900);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x5c5240, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.position.set(-50, 90, -30);
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x5d5340, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);

await loadGuns([kind]);
const rig = buildGun(kind);
scene.add(rig.root);
let lift = 0;
if (q.get('site') === '1' && EXTRAS.buildMax38Site) {
  const site = EXTRAS.buildMax38Site(1);
  scene.add(site.root);
  window.__site = site;
}
rig.root.position.y = lift;
if (q.get('lower') != null) rig.setLower?.(Number(q.get('lower')));
if (q.get('schlepper') != null) rig.setSchlepper?.(Number(q.get('schlepper')));
const t0 = performance.now();
const crew = q.get('crew') === '0' ? { update() {}, setLevel() {} } : new GunCrew(rig, kind);
const crewMs = performance.now() - t0;
console.log(`GunCrew(${kind}) built in ${crewMs.toFixed(0)} ms`);
crew.setLevel(2);

// the fake piece and its cycle
const g = GUNS[kind];
const elFire = Number(q.get('el') ?? g.restEl), az = Number(q.get('az') ?? 0);
const total = g.load.reduce((a, s) => a + s.dur, 0), READY = 4, AFTER = g.runout + 4;
const piece = { kind, i: 0, az, el: elFire, cmd: { az, el: elFire }, job: null, firedAt: -100, fireAt: 1e9, state: 'idle', rounds: 1, loaded: false, crew: g.crew, crewMax: g.crew, breech: 0 };
const sim = { time: 0, alpha: 0 };
function at(step, k) {
  // the piece at a step of the cycle (k: fraction of a loading step, or seconds for ready / fire)
  let t0 = 0;
  piece.job = null; piece.loaded = false; piece.breech = 0; piece.el = elFire; piece.fireAt = 1e9; piece.firedAt = -100; piece.state = 'idle';
  const i = g.load.findIndex((s) => s.step === step);
  if (i >= 0) {
    for (let j = 0; j < i; j++) t0 += g.load[j].dur;
    const st = g.load[i];
    piece.job = { step, t: k * st.dur, dur: st.dur, i, n: g.load.length };
    piece.state = step === 'lay' ? 'laying' : 'loading';
    piece.loaded = i > g.load.findIndex((s) => s.step === 'close');
    piece.el = step === 'depress' ? elFire + (rig.loadEl - elFire) * smooth(k, 0, 1) : step === 'lay' ? rig.loadEl + (elFire - rig.loadEl) * smooth(k, 0, 1) : rig.loadEl;
    sim.time = 1000 + t0 + k * st.dur;
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
  crew.update(piece, sim, dt, 2);
}
const step = q.get('step');
const speed = Number(q.get('speed') || 0);
let tc = 0;
function cycle(t) {
  // live: the loading steps, a pause ready, the shot, the run out
  const T = total + READY + AFTER;
  t %= T;
  if (t < total) { let a = 0; for (const s of g.load) { if (t < a + s.dur) return at(s.step, (t - a) / s.dur); a += s.dur; } }
  if (t < total + READY) return at('ready', t - total);
  at('fire', t - total - READY);
}
if (step) at(step, Number(q.get('k') || 0));
pose(0.016);

// camera: orbit about the breech area by default
const bb = new THREE.Box3().setFromObject(rig.root), c = new THREE.Vector3();
rig.anchors.breech.getWorldPosition(c);
const tgt = (q.get('target') || '').split(',').map(Number);
if (tgt.length === 3 && tgt.every((v) => !isNaN(v))) c.set(tgt[0], tgt[1] + lift, tgt[2]);
const camQ = (q.get('cam') || '').split(',').map(Number);
function cam(azD = 140, elD = 22, dist = 30, tx, ty, tz) {
  if (tx != null) c.set(tx, ty, tz);
  const a = azD * Math.PI / 180, e = elD * Math.PI / 180;
  camera.position.set(c.x + dist * Math.sin(a) * Math.cos(e), c.y + dist * Math.sin(e), c.z - dist * Math.cos(a) * Math.cos(e));
  controls.target.copy(c);
  controls.update();
}
cam(camQ[0] ?? 140, camQ[1] ?? 22, camQ[2] || Math.min(60, bb.getSize(new THREE.Vector3()).length() * 0.6));
sun.target.position.copy(c);
sun.position.copy(c).add(new THREE.Vector3(-50, 90, -30));

const info = document.getElementById('info');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  if (speed > 0) { tc += dt * speed; cycle(tc); }
  pose(dt);
  const j = piece.job;
  info.textContent = `${kind} (crew ${crewMs.toFixed(0)} ms)  ${j ? j.step + ' ' + (j.t / j.dur).toFixed(2) : piece.state}  el ${(piece.el * 180 / Math.PI).toFixed(1)}`;
  controls.update();
  renderer.render(scene, camera);
  window.__ready = true;
});
window.__hp = { crewMs, rig, crew, piece, set: (s, k) => { at(s, k); pose(0.016); }, cam };

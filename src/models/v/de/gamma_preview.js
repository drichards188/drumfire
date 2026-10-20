// Dev page (gamma agent): the 42 cm Gamma-Mörser (or another WW1 piece) with its loading crew (render/crews.js
// GunCrew) driven by a fake piece through the sim's loading cycle (GUNS[kind].load), the shot and the run out.
// (A copy of heavy_preview.js with the Gamma's firing position and the WW1 builders loaded.)
//   /src/models/v/de/gamma_preview.html?kind=gamma|bertha&cam=az,el,dist&target=x,y,z
//   &step=shell&k=0.5   freeze at that step (or ready, fire with k = seconds since the shot)
//   &speed=4            live cycle at that speed;  &az=0.1 the piece's traverse;  &el=0.7 its laid elevation
//   &site=1 the firing position (buildGammaSite);  &crew=0 no crew;  &ww1=1 the 1917 builders (bertha)
//   window.__hp: { rig, crew, set(step, k), cam(az, el, dist, tx, ty, tz) }
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun, loadGuns, EXTRAS, GUN_ERA } from '../../guns.js';
import { GUNS, STEP } from '../../../sim/tables.js';
import { GunCrew } from '../../../render/crews.js';
import { loadPose } from '../../../render/guns.js';
import { smooth } from '../../../render/anim.js';
import { CREW_ERA } from '../../../render/crews_ww1.js';

const q = new URLSearchParams(location.search);
const kind = q.get('kind') || 'gamma';
if (q.get('ww1') === '1' || kind === 'gamma') { GUN_ERA.ww1 = true; CREW_ERA.ww1 = true; }
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
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
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

await loadGuns([kind, 'gamma']);
const rig = buildGun(kind);
scene.add(rig.root);
let lift = 0;
if (q.get('site') === '1' && EXTRAS.buildGammaSite) {
  const site = EXTRAS.buildGammaSite(Number(q.get('seed') || 1));
  if (q.get('camo') != null) site.setCamo(Number(q.get('camo')));
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

// &ortho=right|left|front|rear|top: an orthographic blueprint view with a 1 m grid behind the model (5 m darker)
let view = camera;
const ortho = q.get('ortho');
if (ortho) {
  rig.root.updateMatrixWorld(true);
  const ob = new THREE.Box3().setFromObject(rig.root), oc = ob.getCenter(new THREE.Vector3()), os = ob.getSize(new THREE.Vector3());
  const AX = { right: [1, 0, 0], left: [-1, 0, 0], front: [0, 0, -1], rear: [0, 0, 1], top: [0, 1, 0] }[ortho] || [1, 0, 0];
  const half = Math.max(os.x, os.y, os.z) * 0.58, asp = innerWidth / innerHeight;
  view = new THREE.OrthographicCamera(-half * asp, half * asp, half, -half, 0.1, 400);
  view.position.set(oc.x + AX[0] * 100, oc.y + AX[1] * 100, oc.z + AX[2] * 100);
  view.up.set(0, ortho === 'top' ? 0 : 1, ortho === 'top' ? -1 : 0);
  view.lookAt(oc);
  const mkGrid = (n, step, col) => { const g = new THREE.GridHelper(n, n / step, col, col); g.material.depthWrite = false; return g; };
  for (const [n, st, col] of [[60, 1, 0x7a8288], [60, 5, 0x30363a]]) {
    const g = mkGrid(n, st, col);
    if (ortho === 'right' || ortho === 'left') { g.rotation.z = Math.PI / 2; g.position.set(ortho === 'right' ? ob.min.x - 1 : ob.max.x + 1, 0, 0); }
    else if (ortho === 'front' || ortho === 'rear') { g.rotation.x = Math.PI / 2; g.position.set(0, 0, ortho === 'front' ? ob.max.z + 1 : ob.min.z - 1); }
    else g.position.set(0, ob.min.y - 0.05, 0);
    scene.add(g);
  }
  ground.visible = false;
  scene.background = new THREE.Color(0xc9ced2);
}
const info = document.getElementById('info');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  if (speed > 0) { tc += dt * speed; cycle(tc); }
  pose(dt);
  const j = piece.job;
  info.textContent = `${kind} (crew ${crewMs.toFixed(0)} ms)  ${j ? j.step + ' ' + (j.t / j.dur).toFixed(2) : piece.state}  el ${(piece.el * 180 / Math.PI).toFixed(1)}`;
  controls.update();
  renderer.render(scene, view);
  window.__ready = true;
});
window.__hp = { crewMs, rig, crew, piece, set: (s, k) => { at(s, k); pose(0.016); }, cam };

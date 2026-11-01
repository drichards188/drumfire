// Dev page (rocket agent): the 21 cm Nebelwerfer 42 and the schweres Wurfgerät 40 with their crews (render/crews.js
// GunCrew and render/de/nbw42.js, swg40.js) driven by a fake piece through a whole round: the ripple, the run back,
// the loading cycle (GUNS[kind].load) and the run to cover; played frame by frame from 3 s before the first ripple to
// the time asked for, so the picture is what the battle would show at that moment.
//   /src/models/v/de/rocket_preview.html?kind=nbw42|swg40&t=20&cam=az,el,dist&target=x,y,z&el=0.5&az=0.1
//   t: seconds after the first ripple's first rocket (the loading starts when the ripple and the run out are over)
//   &live=1 plays on in real time from t;  window.__rp: { rig, crew, p, phase, T }
// While models/shells.js has no rocket of the kind, the crew is built as the 15 cm launcher's and then switched to
// the kind (the props and the behaviours look the kind up each frame; only the carried shell prop differs).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun, loadGuns } from '../../guns.js';
import { GUNS } from '../../../sim/tables.js';
import { GunCrew } from '../../../render/crews.js';

const q = new URLSearchParams(location.search);
const kind = q.get('kind') ?? 'nbw42';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fa8ad);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x5c5240, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.position.set(-30, 60, -20);
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5d5340, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 1000);
const controls = new OrbitControls(camera, renderer.domElement);

await loadGuns([kind]);
const rig = buildGun(kind);
rig.root.rotation.order = 'YXZ';
scene.add(rig.root);
let crew;
try { crew = new GunCrew(rig, kind); } catch (e) {
  console.warn('rocket_preview: crew built as nbw41 (' + e.message + ')');
  crew = new GunCrew(rig, 'nbw41');
  crew.kind = kind;
  const mod = await import(`../../../render/de/${kind}.js`);
  for (const m of crew.men) m.beh = mod.ROLES?.[m.role] ?? m.beh;
}
crew.setLevel?.(2);

const g = GUNS[kind], n = g.salvo?.n ?? 1, dt = g.salvo?.dt ?? 0;
const elFire = Number(q.get('el') ?? g.restEl), az = Number(q.get('az') ?? 0);
const p = { kind, i: 0, az, el: elFire, cmd: { az, el: elFire, ok: true }, state: 'ready', job: null, loaded: true, rounds: 1, tubes: n,
  crew: g.crew, crewMax: g.crew, firedAt: -999, fireAt: 0, breech: 0, ripple: null, ji: 0 };
const sim = { time: -3, alpha: 0 };
const DT = 1 / 30;
let phase = 'ready';
function step() {
  const T = (sim.time += DT);
  if (phase === 'ready' && T >= p.fireAt) {
    p.firedAt = T; p.state = 'recoil'; p.loaded = false; p.rounds = 0; phase = 'recoil';
    p.ripple = { i: 1, next: T + dt, last: T };
  }
  if (phase === 'recoil') {
    if (p.ripple && p.ripple.i < n && T >= p.ripple.next) { p.ripple.i++; p.ripple.last = T; p.ripple.next = T + dt; }
    if (T - p.firedAt > (n - 1) * dt + 0.18 + g.runout) { p.ripple = null; phase = 'loading'; p.state = 'loading'; p.ji = 0; begin(); }
  } else if (phase === 'loading') {
    const job = p.job;
    job.t += DT;
    if (job.t >= job.dur) {
      if (job.step === 'shell') { p.loaded = true; p.tubes = n; }
      p.ji++;
      if (p.ji >= g.load.length) { p.state = 'ready'; p.job = null; phase = 'ready'; p.rounds = 1; p.fireAt = T + 1e9; p.loaded = true; } else begin();
    }
  }
  const lp = p.job && p.job.step !== 'lay' ? 1 : p.job ? 1 - Math.min(1, p.job.t / p.job.dur) : 0;
  rig.setTraverse(p.az);
  rig.setElevation(p.el + ((rig.loadEl ?? g.loadEl) - p.el) * lp);
  rig.update?.(DT);
  crew.update(p, sim, DT, 2);
}
function begin() { const st = g.load[p.ji]; p.job = { step: st.step, t: 0, dur: st.dur, i: p.ji, n: g.load.length }; }
const tEnd = Number(q.get('t') ?? 0);
while (sim.time < tEnd) step();

const [caz, cel, cd] = (q.get('cam') ?? '-140,22,9').split(',').map(Number);
const [tx, ty, tz] = (q.get('target') ?? '0,0.7,0.8').split(',').map(Number);
controls.target.set(tx, ty, tz);
const a = (caz * Math.PI) / 180, e = (cel * Math.PI) / 180;
camera.position.set(tx + Math.sin(a) * Math.cos(e) * cd, ty + Math.sin(e) * cd, tz - Math.cos(a) * Math.cos(e) * cd);
controls.update();
const info = document.getElementById('info');
const live = q.get('live') === '1';
window.__rp = { rig, crew, p, get phase() { return phase; }, get T() { return sim.time; } };
function frame() {
  if (live) step();
  info.textContent = `${kind}  t ${sim.time.toFixed(2)}  ${phase} ${p.job ? p.job.step + ' ' + (p.job.t / p.job.dur).toFixed(2) : ''} ripple ${p.ripple?.i ?? '-'}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

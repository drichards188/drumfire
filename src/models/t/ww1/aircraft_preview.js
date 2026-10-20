import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildAircraft1918, AIRCRAFT_KINDS_1918 } from './aircraft.js';

// Page-local viewer for the WW1 British aircraft (src/models/t/ww1/aircraft_preview.html).
//   ?kind=re8 | camel | all   &fly=1 levels them (thrust line at 3 m, blur disc shown) ; &spin=1 turns the propeller
//   &cam=az,el,dist  (az 0 from the front, 90 from the right) ; &bombs=0 hides the Camel's Cooper bombs
const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db4c6);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6a6048, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-20, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 120 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5f5a45, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const kinds = q.get('kind') === 'all' || !q.get('kind') ? AIRCRAFT_KINDS_1918 : [q.get('kind')];
const fly = q.get('fly') === '1', spin = q.get('spin') === '1';
const list = [];
let x = 0, info = '';
for (const k of kinds) {
  const a = buildAircraft1918(k);
  if (fly) { a.setParked(false); a.root.position.y = 3; a.prop.userData.disc.visible = spin; }
  if (q.get('bombs') === '0') for (const s of a.stores) s.visible = false;
  a.root.position.x = x + a.span / 2;
  x += a.span + 2;
  scene.add(a.root);
  list.push(a);
  let tris = 0, draws = 0;
  a.root.traverse((o) => { if (o.isMesh) { draws++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  const s = new THREE.Box3().setFromObject(a.root).getSize(new THREE.Vector3());
  info += `${k}  draws ${draws}  tris ${(tris / 1000).toFixed(1)}k  size ${s.toArray().map((v) => v.toFixed(2)).join(' x ')}  height ${a.height.toFixed(2)}\n`;
}
for (const a of list) a.root.position.x -= x / 2 - 1;
document.getElementById('info').textContent = info;
const box = new THREE.Box3();
for (const a of list) box.expandByObject(a.root);
const ctr = box.getCenter(new THREE.Vector3()), size = Math.max(...box.getSize(new THREE.Vector3()).toArray());
const [az = 35, el = 18, dist = size * 1.3] = (q.get('cam') || '').split(',').filter(Boolean).map(Number);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 2000);
const A = az * Math.PI / 180, E = el * Math.PI / 180;
camera.position.set(ctr.x + Math.sin(A) * Math.cos(E) * dist, ctr.y + Math.sin(E) * dist, ctr.z - Math.cos(A) * Math.cos(E) * dist);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(ctr);
controls.update();
window.__ready = true;
window.__view = { scene, list, camera };
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (spin) for (const a of list) a.prop.rotation.z += 60 * dt;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildV1Site } from './v1.js';
import { buildV2Site } from './v2.js';
import { buildMissile, MISSILE_EXHAUST } from './missiles.js';
import { buildCrewman, crewForRole } from '../crew.js';
import { VCrew, poseVSite, vFraming } from '../../../render/crews_vweap.js';

// Dev page for the V-weapon sites and missiles (dev server only):
//   ?kind=v1|v2|missiles   &cam=az,el,dist (az 0 from the front, -Z)   &at=x,y,z (look-at point)
//   &ortho=right|left|front|rear|top (1 m grid)   &crew=1   &night=1   &fov=40
//   v1: &missile=none|trolley|ramp &wings=0..1 &gen=0..1 &launch=t
//   v2: &erect=0..1 &meiller=0..1 &table=rad &alcohol=0..1 &lox=0..1 &rocket=0|1
//   &anim=1 runs the drill in a loop (window.__vprev.t sets the time)
//   &drill=<step id>&k=0..1 the launch crew and the machinery as the game poses them (render/crews_vweap.js) on a
//   mock drill: the steps before it done, this one at k (&wait=1: waiting for the key; &quick=1 a set-up site;
//   &since=s: s seconds after a launch); &frame=1 puts the camera where the step's framing does;
//   window.__vprev.setDrill(id, k, opts) re-poses
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fa8ad);
scene.fog = new THREE.Fog(0x9fa8ad, 250, 900);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x5c5240, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x5d5a40, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const kind = q.get('kind') || 'v1';
let rig = null;
const root = new THREE.Group();
scene.add(root);
if (kind === 'missiles') {
  let x = 0;
  for (const k of ['v1', 'v2']) {
    const m = buildMissile(k), g = new THREE.Group();
    for (const p of m.parts) { const o = new THREE.Mesh(p.geometry, p.material); o.castShadow = o.receiveShadow = true; g.add(o); }
    const e = MISSILE_EXHAUST[k], dot = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xff5000 }));
    dot.position.set(e.x, e.y, e.z);
    g.add(dot);
    g.position.set(x, m.radius + 1.0, 0);
    root.add(g);
    x += 8;
  }
} else {
  rig = kind === 'v2' ? buildV2Site() : buildV1Site();
  root.add(rig.root);
  const apply = () => {
    if (kind === 'v1') {
      rig.setMissile(q.get('missile') || 'ramp');
      rig.setWings(num('wings', 1));
      rig.setGenerator(num('gen', 1));
      rig.launch(num('launch', -1));
    } else {
      rig.setErect(num('erect', 1));
      rig.setMeiller(num('meiller', 0));
      rig.setTable(num('table', 0));
      rig.setFuel({ alcohol: num('alcohol', 0), lox: num('lox', 0) });
      rig.setRocket(num('rocket', 1) > 0);
    }
  };
  apply();
  if (q.get('crew') === '1') for (const [i, c] of rig.anchors.crew.entries()) {
    const fig = buildCrewman(crewForRole(c.role, i));
    fig.root.position.set(c.x, c.y, c.z);
    fig.root.rotation.y = c.heading;
    fig.pose(c.pose || 'stand', 0, 1);
    rig.root.add(fig.root);
  }
  // markers on the anchors
  for (const [k, a] of Object.entries(rig.anchors)) if (a && a.isObject3D && q.get('marks') === '1') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    a.add(m);
    const ar = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 3, 0xff2020);
    a.add(ar);
  }
}
root.updateMatrixWorld(true);
const bb = new THREE.Box3().setFromObject(root), size = bb.getSize(new THREE.Vector3()), center = bb.getCenter(new THREE.Vector3());
if (q.get('at')) center.set(...q.get('at').split(',').map(Number));
let tris = 0;
root.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
document.getElementById('info').textContent = `${kind}: ${Math.round(tris)} tris, ${size.toArray().map((v) => v.toFixed(2)).join(' x ')} m`;

let camera = new THREE.PerspectiveCamera(num('fov', 40), innerWidth / innerHeight, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
const cam = (q.get('cam') || '').split(',').map(Number);
const dist = cam[2] || size.length() * 0.9;
const az = (cam[0] ?? 35) * Math.PI / 180, el = (isNaN(cam[1]) ? 18 : cam[1]) * Math.PI / 180;
camera.position.set(center.x + dist * Math.sin(az) * Math.cos(el), center.y + dist * Math.sin(el), center.z - dist * Math.cos(az) * Math.cos(el));
controls.target.copy(center);
controls.update();
{
  const R = Math.max(size.x, size.z, 20) * 0.6;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 6 });
  sun.target.position.copy(center);
  sun.position.copy(center).add(new THREE.Vector3(-R, R * 1.6, -R * 0.5));
  sun.shadow.camera.updateProjectionMatrix();
}
const ortho = q.get('ortho');
if (ortho) {
  const AX = { right: [1, 0, 0], left: [-1, 0, 0], front: [0, 0, -1], rear: [0, 0, 1], top: [0, 1, 0] }[ortho];
  const half = num('half', Math.max(size.x, size.y, size.z) * 0.55 + 0.5), aspect = innerWidth / innerHeight;
  camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 3000);
  camera.position.copy(center).addScaledVector(new THREE.Vector3(...AX), 500);
  camera.up.set(0, ortho === 'top' ? 0 : 1, ortho === 'top' ? -1 : 0);
  camera.lookAt(center);
  controls.enabled = false;
  const L = Math.ceil(half * 2 * aspect) + 4, g2 = new THREE.Group();
  const minor = new THREE.GridHelper(L, L, 0x6d7a86, 0x6d7a86), major = new THREE.GridHelper(L, L / 5, 0x2e3b47, 0x2e3b47);
  minor.material.opacity = 0.35; minor.material.transparent = true;
  g2.add(minor, major);
  if (ortho === 'top') g2.position.set(Math.round(center.x), 0.01, Math.round(center.z));
  else {
    g2.rotation.x = Math.PI / 2;
    if (ortho === 'right' || ortho === 'left') g2.rotation.z = Math.PI / 2;
    const back = ortho === 'right' ? bb.min.x - 1 : ortho === 'left' ? bb.max.x + 1 : ortho === 'front' ? bb.max.z + 1 : bb.min.z - 1;
    if (ortho === 'right' || ortho === 'left') g2.position.set(back, 0, Math.round(center.z)); else g2.position.set(Math.round(center.x), 0, back);
    ground.visible = false;
  }
  scene.add(g2);
  scene.fog = null;
}
if (q.get('night') === '1') { sun.intensity = 0.2; scene.environmentIntensity = 0.15; scene.background = new THREE.Color(0x10151c); }

// the drill in a loop, for a quick look at the setters
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const state = { t: 0 };
function drill(t) {
  if (!rig) return;
  if (kind === 'v1') {
    const c = t % 16;
    rig.setMissile(c < 5 ? 'trolley' : 'ramp');
    rig.setWings(c < 5 ? sm(1, 4.5, c) : 1);
    rig.setGenerator(sm(5, 8, c));
    rig.launch(c > 10 ? c - 10 : -1);
  } else {
    const c = t % 30;
    rig.setErect(sm(1, 9, c));
    rig.setMeiller(sm(10, 15, c));
    rig.setTable(0.3 * sm(15, 17, c));
    rig.setFuel({ alcohol: sm(17, 19, c) * (1 - sm(26, 27, c)), lox: sm(19, 22, c) * (1 - sm(26, 27, c)) });
    rig.setRocket(c < 28);
  }
}
// ---- the drill mode: a mock unit and sim for the launch crew (the game's controller is src/ww2/special.js)
const STEPS = {
  v1: [['bring', 35], ['wings', 30], ['compass', 40], ['airlog', 15], ['ramp', 40], ['fuel', 45], ['steam', 45], ['arm', 15], ['clear', 15], ['fire', 4]],
  v2: [['erect', 60], ['align', 30], ['cutoff', 20], ['checks', 80], ['alcohol', 60], ['tstoff', 40], ['lox', 70], ['withdraw', 40], ['prestage', 6], ['fire', 3]],
};
let vcrew = null, mock = null;
function setupDrill() {
  const piece = { i: 0, kind, crew: 14, crewMax: 14, state: 'idle', pos: { x: 0, y: 0, z: 0 } };
  const unit = { id: 1, kind, alive: true, zero: 0, pieces: [piece], special: null };
  mock = { time: 1000, alpha: 0, units: [unit], unitById: () => unit };
  vcrew = new VCrew(rig, kind);
  setDrill(q.get('drill'), num('k', 0.5), { wait: q.get('wait') === '1', quick: q.get('quick') === '1', since: q.has('since') ? num('since', 0) : null });
}
function setDrill(id, k = 0.5, { wait = false, quick = false, since = null } = {}) {
  const list = STEPS[kind], i = Math.max(0, list.findIndex((s) => s[0] === id));
  const prep = kind === 'v1' && quick ? new Set(['wings', 'compass', 'airlog', 'fuel', 'arm']) : new Set();
  const steps = list.map(([sid, dur], j) => ({ id: sid, dur, state: j < i || prep.has(sid) && j !== i ? 'done' : j === i && !wait ? 'doing' : 'todo' }));
  const u = mock.units[0];
  u.special = {
    kind, steps, i, t: k * list[i][1], doing: !wait, fault: null, cover: false, quick, n: 1, left: 3,
    launchT: since != null ? mock.time - since : -1, settings: { compass: 12, range: 160 }, table: 0, tableFrom: 0, lox: 100, loxOn: i > list.findIndex((s) => s[0] === 'lox'),
  };
  if (kind === 'v2' && steps.find((s) => s.id === 'align').state === 'done') u.special.table = (12 * Math.PI) / 180;
  for (let n = 0; n < 40; n++) vcrew.update(u.pieces[0], mock, 0.1, 2);
  poseVSite(rig, u, mock);
  if (q.get('frame') === '1') {
    const f = vFraming(rig, u, mock, {});
    const cp = Math.cos(f.pitch);
    controls.target.set(f.x, f.y, f.z);
    camera.position.set(f.x + Math.sin(f.yaw) * cp * f.dist, f.y + Math.sin(f.pitch) * f.dist, f.z + Math.cos(f.yaw) * cp * f.dist);
    controls.update();
  }
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  if (q.get('anim') === '1') { state.t += clock.getDelta(); drill(state.t); }
  rig?.update?.(0.016);
  controls.update();
  renderer.render(scene, camera);
  window.__ready = true;
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
if (rig && q.get('drill')) setupDrill();
window.__vprev = { scene, rig, camera, controls, drill, state, setDrill, get crew() { return vcrew; } };

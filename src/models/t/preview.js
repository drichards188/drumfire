import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Scratch viewer for the field models (src/models/t/preview.html).
//   ?kind=bl6 | bl60 | german:fh15 | german:m21 | german:fk77   a gun rig (&pose=elevation:0.5,traverse:0.1,recoil:0.5,breech:1)
//   ?target=battery|mebu|dump|balloon|hq|crossroads|railyard   (&dmg=0..1 damage, &dmgs=0.2,0.6 per part)
//   ?shell=bl15 (or all) ; ?cart=bl6
//   &cam=az,el,dist  (az 0 from the front, 90 from the right) ; &ortho=right|left|front|rear|top ; &crew=1 marks crew spots
const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db4c6);
scene.fog = new THREE.Fog(0x9db4c6, 150, 1600);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6a6048, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-30, 60, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x5f5a45, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(200, 200, 0x444444, 0x555555);
grid.material.transparent = true;
grid.material.opacity = 0.25;
scene.add(grid);

const kind = q.get('kind'), target = q.get('target'), shell = q.get('shell'), cart = q.get('cart');
let root, rig = null, tgt = null, size = 8;

if (shell || cart) {
  const { buildShell, buildCartridge, SHELL_KINDS } = await import('../shells.js');
  root = new THREE.Group();
  const list = shell === 'all' ? SHELL_KINDS : [shell || cart];
  let x = 0;
  for (const k of list) {
    const s = cart ? buildCartridge(k) : buildShell(k);
    const g = new THREE.Group();
    for (const p of s.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; g.add(m); }
    g.rotation.y = Math.PI / 2; // lay it across the view, nose to the left
    g.position.set(x, s.radius + 0.01, 0);
    x += s.radius * 2 + 0.2;
    root.add(g);
  }
  root.position.x = -x / 2;
  size = Math.max(1.5, x * 0.6);
} else if (target) {
  const { buildTarget } = await import('../targets.js');
  tgt = buildTarget(target, { alt: 200 });
  root = tgt.root;
  const dm = (q.get('dmgs') || '').split(',').filter(Boolean).map(Number);
  tgt.parts.forEach((p, i) => tgt.setDamage(i, dm.length ? dm[i % dm.length] : Number(q.get('dmg') || 0)));
  size = { battery: 70, mebu: 14, dump: 55, balloon: 40, hq: 50, crossroads: 40, railyard: 140 }[target] || 40;
} else {
  let mod;
  if (kind === 'bl6') mod = (await import('../v/bl6.js')).buildBL6();
  else if (kind === 'bl60') mod = (await import('../v/bl60.js')).buildBL60();
  else if (kind?.startsWith('german:')) mod = (await import('../targets.js')).buildGermanGun(kind.slice(7));
  rig = mod;
  root = rig.root;
  for (const kv of (q.get('pose') || '').split(',')) {
    const [k, v] = kv.split(':');
    if (!k) continue;
    const [pv, axis] = k.split('.');
    if (pv === 'recoil') rig.pivots.recoil.position.z = Number(v);
    else if (pv === 'breech' && v !== undefined && !axis) rig.setBreech(Number(v));
    else if (pv === 'shell') rig.setShell('tray', Number(v) > 0);
    else if (pv === 'cart') rig.setShell('cartridge', Number(v) > 0);
    else if (pv === 'traverse') rig.pivots.traverse.rotation.y = Number(v);
    else if (rig.pivots[pv]) rig.pivots[pv].rotation[axis || (pv === 'elevation' ? 'x' : 'y')] = Number(v);
  }
  if (q.get('crew') === '1') {
    const mk = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    for (const c of rig.anchors.crew) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.7, 8), mk);
      m.position.set(c.x, c.y + 0.85, c.z);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
      nose.position.set(0, 0.6, -0.3);
      m.add(nose);
      m.rotation.y = c.heading;
      root.add(m);
    }
  }
  size = 7;
}
scene.add(root);
root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const box = new THREE.Box3().setFromObject(root);
const ctr = box.getCenter(new THREE.Vector3());
if (!target && !shell && !cart) size = Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 0.9;
if (q.get('at')) ctr.set(...q.get('at').split(',').map(Number));

let camera;
const ortho = q.get('ortho');
const [az = 35, el = 22, dist0] = (q.get('cam') || '').split(',').filter(Boolean).map(Number);
const dist = dist0 || size * (target ? 2.2 : 1.7);
if (ortho) {
  const a = innerWidth / innerHeight, h = Number(q.get('zoom') || size * 0.7);
  camera = new THREE.OrthographicCamera(-h * a, h * a, h, -h, 0.1, 5000);
  const d = { right: [1, 0, 0], left: [-1, 0, 0], front: [0, 0, -1], rear: [0, 0, 1], top: [0, 1, 0.0001] }[ortho];
  camera.position.set(ctr.x + d[0] * 500, ctr.y + d[1] * 500, ctr.z + d[2] * 500);
  scene.fog = null;
  grid.material.opacity = 0.5;
} else {
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 6000);
  const A = az * Math.PI / 180, E = el * Math.PI / 180;
  camera.position.set(ctr.x + Math.sin(A) * Math.cos(E) * dist, ctr.y + Math.sin(E) * dist, ctr.z - Math.cos(A) * Math.cos(E) * dist);
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(ctr);
controls.update();
sun.target.position.copy(ctr);
sun.position.set(ctr.x - 30, 60, ctr.z + 40).multiplyScalar(1);
const sh = Math.max(size * 1.5, 12);
Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, near: 1, far: 400 });
sun.shadow.camera.updateProjectionMatrix();
let tris = 0, draws = 0;
root.traverse((o) => { if (o.isMesh) { draws++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
document.getElementById('info').textContent = `${kind || target || shell || cart}  draws ${draws}  tris ${(tris / 1000).toFixed(1)}k  size ${box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2)).join(' x ')}`;
window.__ready = true;
window.__view = { scene, root, rig, tgt, camera, renderer };
function loop() {
  controls.update();
  rig?.update?.(0.016);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

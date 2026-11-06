import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun, loadGuns, EXTRAS, GUN_ERA } from '../../guns.js';
import { GUNS } from '../../../sim/tables.js';

// The new 1914 to 1918 batteries of the German tree (m99, beta) and their firing positions (guns.EXTRAS
// buildBetaSite) for ww1_tree_preview.html.
const q = new URLSearchParams(location.search);
const kind = q.get('kind') ?? 'beta';
GUN_ERA.ww1 = true;
await loadGuns([kind]);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fa8ad);
scene.fog = new THREE.Fog(0x9fa8ad, 120, 600);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x5c5240, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-30, 60, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x564b39, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const SITE = { beta: 'buildBetaSite' };
let site = null;
if (q.get('site') !== '0' && EXTRAS[SITE[kind]]) {
  site = EXTRAS[SITE[kind]](Number(q.get('seed') ?? 1));
  scene.add(site.root);
}
const rig = buildGun(kind), g = GUNS[kind];
rig.setTraverse?.(Number(q.get('az') ?? 0));
rig.setElevation?.(Number(q.get('el') ?? g?.restEl ?? 0.3));
rig.setRecoil?.(Number(q.get('recoil') ?? 0));
rig.update?.(0);
scene.add(rig.root);

const [az, el, dist] = (q.get('cam') || '140,25,14').split(',').map(Number);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 2000);
const target = new THREE.Vector3(0, Number(q.get('ty') ?? 1), 0.5);
const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
camera.position.set(target.x + Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z - Math.cos(a) * Math.cos(e) * dist);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.update();
document.getElementById('info').textContent = `${kind}${site ? ' in its position' : ''}`;
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
window.__tree = { site, rig, scene, ready: true };

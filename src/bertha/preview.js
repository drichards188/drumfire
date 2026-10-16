// Dev viewer for the Bertha model: /src/bertha/preview.html?cam=az,el,dist&el=deg&tr=deg&wedge=0..1&recoil=0..1&crane=swing,drop&props=1&crew=1
import * as THREE from 'three';
import { buildBertha } from './model.js';
import { BerthaCrew } from './crew.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a9aa8);
scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x4a4030, 1.2));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a5440, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);
const rig = buildBertha();
scene.add(rig.root);
rig.setElevation(num('el', 40) * Math.PI / 180);
rig.setTraverse(num('tr', 0) * Math.PI / 180);
rig.setWedge(num('wedge', 0));
rig.setRecoil(num('recoil', 0));
const [sw, dr] = (q.get('crane') ?? '1,0').split(',').map(Number);
rig.setCrane(sw, dr);
if (q.get('props')) {
  rig.props.tray.schwer.visible = true;
  rig.props.tray.schwer.position.set(0, 0, rig.trayZ.z0 + 0.95);
  rig.props.hook.leicht.visible = true;
  rig.props.spent.visible = true;
  rig.props.spent.position.set(0.8, rig.loadStage + 0.2, 3.5);
}
let crew = null;
if (q.get('crew')) crew = new BerthaCrew(rig, null);
const [az, elv, dist] = (q.get('cam') ?? '35,18,16').split(',').map(Number);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 500);
const tgt = new THREE.Vector3(0, 2, 1.5);
const a = (az * Math.PI) / 180, e = (elv * Math.PI) / 180;
camera.position.set(tgt.x + Math.sin(a) * Math.cos(e) * dist, tgt.y + Math.sin(e) * dist, tgt.z - Math.cos(a) * Math.cos(e) * dist);
camera.lookAt(tgt);
let t = 0;
renderer.setAnimationLoop(() => {
  t += 1 / 60;
  crew?.update(1 / 60, null, t);
  renderer.render(scene, camera);
});
window.__ready = true;

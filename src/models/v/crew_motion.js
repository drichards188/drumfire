// Focused dev view: inspect a whole pose cycle or scrub one figure without gun geometry hiding
// the contacts. Use ?pose=lift&view=side or ?pose=walk&sequence=0 for a single moving figure.
// Add &gx=0&gz=-0.384 to inspect a 21-degree incline in the walking direction.
import * as THREE from 'three';
import { buildCrewman, CREW_POSES } from './crew.js';

const query = new URLSearchParams(location.search);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd6d8d5);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const stage = document.getElementById('stage');
stage.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667969, 2.5));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(-3, 5, -4); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -2;
sun.shadow.camera.right = sun.shadow.camera.top = 2;
sun.shadow.normalBias = 0.015;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xbfc8ba, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(8, 32, 0x89998b, 0xa9b4a5);
grid.position.y = 0.001; scene.add(grid);
const fig = buildCrewman({ outfit: query.get('outfit') || 'gunner' });
fig.groundSlope.x = Number(query.get('gx')) || 0;
fig.groundSlope.z = Number(query.get('gz')) || 0;
if (fig.groundSlope.x || fig.groundSlope.z) {
  const incline = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-fig.groundSlope.x, 1, -fig.groundSlope.z).normalize());
  floor.quaternion.premultiply(incline); grid.quaternion.copy(incline);
}
scene.add(fig.root);
const skeleton = new THREE.SkeletonHelper(fig.root);
skeleton.visible = false; scene.add(skeleton);
const load = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.62, 20), new THREE.MeshStandardMaterial({ color: 0x555c46, roughness: 0.7, metalness: 0.3 }));
load.rotation.z = Math.PI / 2; load.position.y = 0.105; load.castShadow = true;
fig.anchors.carry.add(load);
const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0x826346, roughness: 0.8 }));
staff.rotation.z = Math.PI / 2; staff.position.x = 0.6; staff.castShadow = true;
fig.anchors.carry.add(staff);
for (const side of ['L', 'R']) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd98a2b }));
  fig.anchors['hand' + side].add(dot);
}
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 30);
const pose = document.getElementById('pose'), view = document.getElementById('view');
for (const name of CREW_POSES) pose.add(new Option(name, name));
pose.value = CREW_POSES.includes(query.get('pose')) ? query.get('pose') : 'lift';
view.value = query.get('view') || 'three';
const phase = document.getElementById('phase'), sequence = document.getElementById('sequence');
sequence.checked = query.get('sequence') !== '0';
const labels = document.getElementById('labels'), play = document.getElementById('play');
let playing = false, previous = performance.now(), transitionFrom = null, canvasWidth = 0, canvasHeight = 0;
function setLabels() {
  labels.className = sequence.checked ? '' : 'single';
  labels.replaceChildren(...Array.from({ length: sequence.checked ? 8 : 1 }, () => document.createElement('span')));
}
setLabels();
sequence.onchange = setLabels;
document.getElementById('rig').onchange = (e) => { skeleton.visible = e.target.checked; };
play.onclick = () => { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; sequence.checked = false; setLabels(); };
function render() {
  const now = performance.now(), dt = Math.min((now - previous) / 1000, 0.05); previous = now;
  if (playing) phase.value = (Number(phase.value) + dt * 0.35) % 1;
  const width = stage.clientWidth, height = stage.clientHeight;
  if (width !== canvasWidth || height !== canvasHeight) {
    renderer.setSize(width, height, false); canvasWidth = width; canvasHeight = height;
  }
  const cols = sequence.checked ? 4 : 1, rows = sequence.checked ? 2 : 1;
  const finite = transitionFrom || pose.value === 'lift' || pose.value === 'ramLoad';
  renderer.setScissorTest(true);
  for (let i = 0; i < cols * rows; i++) {
    const t = sequence.checked ? i / (finite ? 7 : 8) : Number(phase.value);
    if (transitionFrom) { fig.pose(transitionFrom, 0.4, 1); fig.pose(pose.value, 0.4, t); }
    else fig.pose(pose.value, t, 1);
    const holdingLoad = ['lift', 'carry', 'carryWalk', 'crouch', 'reachUp'];
    load.visible = holdingLoad.includes(pose.value) && (!transitionFrom || holdingLoad.includes(transitionFrom));
    staff.visible = !transitionFrom && ['ram', 'ramLoad', 'haul'].includes(pose.value);
    const w = width / cols, h = height / rows, x = (i % cols) * w, y = height - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    camera.aspect = w / h;
    camera.position.set(...(view.value === 'side' ? [4.7, 1.7, 0] : view.value === 'front' ? [0, 1.6, -4.7] : [3.2, 2, -3.9]));
    camera.lookAt(0, 0.95, -0.08); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    labels.children[i].textContent = `${transitionFrom ? transitionFrom + ' → ' : ''}${pose.value} · ${t.toFixed(2)}`;
  }
  requestAnimationFrame(render);
}
window.__crewMotion = {
  fig, scene, renderer,
  set(name, t = 0, grid = false) { transitionFrom = null; pose.value = name; phase.value = t; sequence.checked = grid; playing = false; setLabels(); },
  transition(from, to) { transitionFrom = from; pose.value = to; sequence.checked = true; playing = false; setLabels(); },
};
pose.onchange = () => { transitionFrom = null; };
render();

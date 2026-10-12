import * as THREE from 'three';
import { Atmosphere } from '../atmosphere.js';
import { Terrain } from '../terrain.js';
import { globalUniforms, patchSceneFog } from '../shaderlib.js';
import { buildWorld } from './index.js';

// Minimal viewer for the dressing: sky, terrain, the world builder, no post. URL:
//   ?at=x,z (look-at point) &cam=az,el,dist (degrees, degrees, metres) &el=sun elevation &fog=density
// Window handle: __w { camera, world, set(at, cam) }.
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(q.get('exp') || 0.9);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.4, 80000);
const atmosphere = new Atmosphere(renderer, scene);
const terrain = new Terrain(scene, { quality: q.get('quality') || 'Low' });
const world = buildWorld(scene, terrain);
patchSceneFog(scene);
const sun = { el: Number(q.get('el') || 24), az: Number(q.get('sun') || 235) };
atmosphere.set(sun.el, sun.az * Math.PI / 180);
scene.fog.density = Number(q.get('fog') || 0.00018);
globalUniforms.fogHeightFalloff.value = 0.0006;
const ambient = new THREE.Color();

const view = { x: 0, z: 0, az: 200, el: 12, d: 60 };
const set = (at, cam) => {
  if (at) { view.x = at[0]; view.z = at[1]; }
  if (cam) { view.az = cam[0]; view.el = cam[1]; view.d = cam[2]; }
};
if (q.get('at')) set(q.get('at').split(',').map(Number));
if (q.get('cam')) set(null, q.get('cam').split(',').map(Number));
const place = () => {
  const gy = terrain.heightAt(view.x, view.z) + (Number(q.get('h')) || 1.6);
  const az = view.az * Math.PI / 180, el = view.el * Math.PI / 180;
  camera.position.set(view.x + Math.sin(az) * Math.cos(el) * view.d, gy + Math.sin(el) * view.d, view.z - Math.cos(az) * Math.cos(el) * view.d);
  camera.position.y = Math.max(camera.position.y, terrain.heightAt(camera.position.x, camera.position.z) + 1.2);
  camera.lookAt(view.x, gy, view.z);
  camera.updateMatrixWorld();
};

let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  view.az -= (e.clientX - drag[0]) * 0.3; view.el = Math.max(-5, Math.min(89, view.el + (e.clientY - drag[1]) * 0.3));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => { view.d *= Math.exp(e.deltaY * 0.001); });
addEventListener('keydown', (e) => {
  const s = view.d * 0.05, a = view.az * Math.PI / 180;
  if (e.key === 'w') { view.x -= Math.sin(a) * s; view.z += Math.cos(a) * s; }
  if (e.key === 's') { view.x += Math.sin(a) * s; view.z -= Math.cos(a) * s; }
  if (e.key === 'a') { view.x -= Math.cos(a) * s; view.z -= Math.sin(a) * s; }
  if (e.key === 'd') { view.x += Math.cos(a) * s; view.z += Math.sin(a) * s; }
});

let t = 0, frames = 0;
const info = document.getElementById('i');
let last = performance.now();
const clock = { getDelta() { const n = performance.now(); const d = Math.min(0.1, (n - last) / 1000); last = n; return d; } };
function frame(dt = clock.getDelta()) {
  t += dt;
  place();
  terrain.update(camera);
  atmosphere.update(new THREE.Vector3(view.x, 0, view.z), t, camera);
  const light = atmosphere.sun;
  globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);
  globalUniforms.uSunColorN.value.copy(light.color).multiplyScalar(light.intensity / 6.5);
  globalUniforms.uTime.value = t;
  world.update(dt, camera);
  renderer.render(scene, camera);
  if (++frames % 20 === 0) info.textContent = `${view.x.toFixed(0)}, ${view.z.toFixed(0)}  az ${view.az.toFixed(0)} el ${view.el.toFixed(0)} d ${view.d.toFixed(0)}\n${world.stats?.() ?? ''}`;
}
window.__w = { camera, world, terrain, scene, renderer, set, frame, view };
// the tile builder works a little each frame; `settle` runs it dry so a screenshot shows everything
window.__w.settle = (n = 400) => { for (let i = 0; i < n; i++) { world.update(0.016, camera); if (world.idle?.()) break; } };
// ?still=1 renders only on demand (__w.frame()), which keeps software-GL screenshots from timing out
if (!q.get('still')) renderer.setAnimationLoop(() => frame());
else setTimeout(() => { place(); window.__w.settle(600); frame(0.016); window.__ready = true; }, 50); // survives a dev-server reload: the page paints itself once
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

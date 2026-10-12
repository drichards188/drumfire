// Infantry preview: a mud plane with crater bumps, a wave of 200 men advancing in open order from a trench line.
//   ?side=german|british  ?blast=1 (bursts every few seconds, men in them die)  ?cam=az,el,dist (degrees, metres)
//   &far=1 (2 km out)  &n=200  &t=seconds to run before the first frame  &speed=1.3  &shadows=0  &gait=assault
// window.__prev: { inf, advance(s), ready, burst(x, z, r) } for headless captures.
import * as THREE from 'three';
import { Infantry } from '../infantry.js';
import { patchSceneFog, globalUniforms } from '../../shaderlib.js';

const q = new URLSearchParams(location.search);
const side = q.get('side') || 'german';
const N = Number(q.get('n') || 200);
const far = q.get('far') === '1';
const blastOn = q.get('blast') === '1';
const gait = q.get('gait') || 'advancing';
const speed = Number(q.get('speed') || (gait === 'assault' ? 3.2 : 1.3));
const dirSign = side === 'german' ? -1 : 1; // Germans come from the east, going west

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = q.get('shadows') !== '0';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const haze = new THREE.Color(0x8e9187);
scene.background = haze;
scene.fog = new THREE.FogExp2(haze, 0.00045);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 20000);

const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-300, 400, 200);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 1200 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xb8c0c8, 0x4a4033, 0.9));
globalUniforms.fogSunDir.value.copy(sun.position).normalize();
globalUniforms.uSunDirW.value.copy(sun.position).normalize();
globalUniforms.uCloudShadow.value = 0;

// ground: mud with craters (a few smooth bumps and holes)
const craters = [];
for (let i = 0; i < 60; i++) craters.push({ x: -400 + Math.random() * 1200, z: -300 + Math.random() * 600, r: 3 + Math.random() * 8 });
const heightAt = (x, z) => {
  let h = 0.15 * Math.sin(x * 0.07) * Math.sin(z * 0.05);
  for (const c of craters) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1.6) h += d < 1 ? -0.35 * c.r * 0.4 * (1 - d * d) : 0.08 * c.r * (1 - (d - 1) / 0.6) ;
  }
  return h;
};
const seg = 400;
const gg = new THREE.PlaneGeometry(14000, 7000, 700, 350).rotateX(-Math.PI / 2).translate(300, 0, 0);
const pos = gg.attributes.position;
const cols = new Float32Array(pos.count * 3);
for (let i = 0; i < pos.count; i++) {
  const h = heightAt(pos.getX(i), pos.getZ(i));
  pos.setY(i, h);
  const n = 0.5 + 0.5 * Math.sin(pos.getX(i) * 0.31) * Math.sin(pos.getZ(i) * 0.27);
  const wet = Math.min(1, Math.max(0, -h * 3));
  cols[i * 3] = (0.1 + 0.03 * n) * (1 - wet * 0.4); cols[i * 3 + 1] = (0.08 + 0.025 * n) * (1 - wet * 0.4); cols[i * 3 + 2] = (0.055 + 0.02 * n) * (1 - wet * 0.3);
}
gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
gg.computeVertexNormals();
const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);
// the trench line (a dark strip) the wave starts from
const trenchX = side === 'german' ? 200 : -200;
const trench = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 400), new THREE.MeshStandardMaterial({ color: 0x14100c }));
trench.position.set(trenchX + (side === 'german' ? 4 : -4), 0.05, 0);
scene.add(trench);
patchSceneFog(scene);

const inf = new Infantry(scene, { max: 1500, shadows: renderer.shadowMap.enabled });

// the wave: 4 groups in open order (6 m between men across, 8 m deep)
const groups = [];
const per = Math.ceil(N / 4);
for (let g = 0; g < 4; g++) {
  const men = [];
  const across = Math.min(10, per);
  for (let i = 0; i < per; i++) {
    const col = i % across, row = Math.floor(i / across);
    men.push({ dx: (col - (across - 1) / 2) * 6 + (Math.random() - 0.5) * 2, dz: row * 8 + (Math.random() - 0.5) * 2.5, alive: true, t: 0 });
  }
  const bearing = side === 'german' ? 270 * Math.PI / 180 : 90 * Math.PI / 180;
  groups.push({ id: `g${g}`, side, sector: 'B', state: gait, pos: { x: trenchX, z: (g - 1.5) * 70 }, bearing, n0: per, men });
}

let tFrame = 0;
const bursts = [];
function burst(x, z, r) {
  inf.blast(x, z, r);
  for (const g of groups) {
    const c = Math.cos(g.bearing), s = Math.sin(g.bearing);
    for (const m of g.men) {
      const wx = g.pos.x + m.dx * c - m.dz * s, wz = g.pos.z + m.dx * s + m.dz * c;
      const d = Math.hypot(wx - x, wz - z);
      if (d < r * 0.55 && Math.random() < 0.9) m.alive = false;
    }
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x241c14, transparent: true, opacity: 0.35, fog: false }));
  mesh.position.set(x, 2, z);
  scene.add(mesh);
  bursts.push({ mesh, t: 0, r });
}

let simT = 0, nextBlast = 3, forced = false;
const force = q.get('force'); // dead | down | throw: apply to every man at t = 1 s
function simStep(dt) {
  simT += dt;
  for (const g of groups) {
    g.pos.x += dirSign * speed * dt * (g.state === 'forming' ? 0 : 1);
  }
  if (force && !forced && simT > 1) {
    forced = true;
    for (const g of groups) {
      const c = Math.cos(g.bearing), s = Math.sin(g.bearing);
      for (const m of g.men) {
        const wx = g.pos.x + m.dx * c - m.dz * s, wz = g.pos.z + m.dx * s + m.dz * c;
        if (force === 'dead') m.alive = false;
        else inf.blast(wx + (force === 'down' ? 6 : 2), wz, 10);
      }
    }
  }
  if (blastOn && simT > nextBlast) {
    nextBlast += 2.5;
    const cx = groups[0].pos.x - dirSign * 20, cz = groups[1].pos.z + (Math.random() - 0.5) * 50;
    burst(cx + (Math.random() - 0.5) * 30, cz, 26);
  }
  inf.update(dt, groups, heightAt, camera);
  for (const b of bursts) {
    b.t += dt;
    const k = Math.min(1, b.t / 0.6);
    b.mesh.scale.setScalar(2 + b.r * 0.22 * k);
    b.mesh.position.y = 2 + b.t * 6;
    b.mesh.material.opacity = Math.max(0, 0.35 - b.t * 0.15);
  }
  for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].t > 3) { scene.remove(bursts[i].mesh); bursts.splice(i, 1); }
}

// camera: az, el, dist in degrees and metres, aimed at the wave's front
let [az, el, dist] = (q.get('cam') || (far ? '70,3,2000' : '35,12,38')).split(',').map(Number);
function placeCamera() {
  const cx = groups[0].pos.x + dirSign * (far ? 0 : 0) , cz = far ? 0 : groups[1].pos.z;
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  const front = side === 'german' ? -1 : 1;
  const tx = cx + front * 0, tz = cz;
  camera.position.set(tx + Math.sin(a) * Math.cos(e) * dist, 1.6 + Math.sin(e) * dist, tz + Math.cos(a) * Math.cos(e) * dist);
  camera.lookAt(tx, 1.2, tz);
  sun.target.position.set(tx, 0, tz);
  const sa = (az - 55) * Math.PI / 180;
  sun.position.set(tx + Math.sin(sa) * 300, 330, tz + Math.cos(sa) * 300);
  sun.target.updateMatrixWorld();
  sun.shadow.camera.far = 1200;
}
function draw() {
  placeCamera();
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
  document.getElementById('hud').textContent = `${side} ${gait}  men ${inf.stats.men} drawn ${inf.stats.drawn} lod0 ${inf.stats.lod0} lod1 ${inf.stats.lod1}  t ${simT.toFixed(1)}`;
}

window.__prev = {
  inf, groups, ready: false,
  advance(s) { for (let t = 0; t < s; t += 0.05) simStep(0.05); placeCamera(); inf.update(0.001, groups, heightAt, camera); draw(); return simT; },
  burst, draw, setCam(a, e, d) { az = a; el = e; dist = d; draw(); },
};
const t0 = Number(q.get('t') || 8);
window.__prev.advance(t0);
window.__prev.ready = true;

let last = performance.now();
if (q.get('hold') !== '1') {
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    simStep(dt);
    draw();
  });
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

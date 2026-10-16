import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun, GUN_KINDS, loadGuns } from '../models/guns.js';
import { buildCrewman, CREW_POSES, CREW_GAITS, CREW_OUTFITS, crewForRole } from '../models/v/crew.js';

// Standalone model viewer for the guns, the crews, and (when the field models agent's files exist) the
// shells and targets.
//   ?kind=bl15 | bl92 | bl6 | bl60 | rail | crew      ?all=guns | crew (every pose in a row)
//   ?shell=bl15 (a shell from models/shells.js)       ?target=battery (a target from models/targets.js)
//   &cam=az,el,dist   az 0 = from the front (the muzzle), 90 = from the right, 180 = from behind
//   &pose=elevation:0.6,recoil:1,breech:1,traverse:0.3,crane:0.5,hoist:1,trolley:2   pivots and rig setters
//   &load=tray|crane|trolley  show the loading shell there      &crew=1  the crew at their spots
//   &anim=1  runs a loading and firing cycle (depress, open, shell in, close, elevate, fire, recoil)
//   &ortho=right|left|front|rear|top  orthographic blueprint view, 1 m grid behind the model (5 m lines darker)
//   &night=1 dims the sun.  Crew: &pose=walk &t=0.25 &anim=1 &outfit=gunner|gunner-tunic|officer|german|stretcher
//   &headgear=.. &vest=.. &pattern=.. &skin=0..3 &mix=1 (varied outfits along ?all=crew)
const q = new URLSearchParams(location.search);

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
scene.fog = new THREE.Fog(0x9fa8ad, 150, 700);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x5c5240, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-40, 70, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 250 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x5d5340, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(200, 200, 0x444444, 0x555555);
grid.material.opacity = 0.2;
grid.material.transparent = true;
scene.add(grid);

let camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;

// the field models agent's registries, when they exist
const optional = async (g) => { try { const f = Object.values(g)[0]; return f ? await f() : null; } catch (e) { console.warn('optional module failed', e.message); return null; } };
const [shellsMod, targetsMod] = await Promise.all([optional(import.meta.glob('../models/shells.js')), optional(import.meta.glob('../models/targets.js'))]);
await loadGuns();

const items = []; // { root, rig, kind }
const labels = [];
const anim = q.get('anim') === '1';
const pose = {};
for (const kv of (q.get('pose') || '').split(',')) { const [k, v] = kv.split(':'); if (k) pose[k] = Number(v); }
const fract = (x) => x - Math.floor(x);

const crewPose = q.get('kind') === 'crew' ? q.get('pose') : null;
const crewT = Number(q.get('t') || 0);
const CARRIED = ['carry', 'carryWalk', 'carryShoulder', 'crouch', 'reachUp', 'push', 'haul', 'ram'];
function crewProps(fig) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8a6a, roughness: 0.6 });
  const load = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.2, 16).rotateZ(Math.PI / 2), mat);
  load.castShadow = true;
  fig.anchors.carry.add(load);
  const wall = new THREE.Group();
  const side = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x4d5a3c, roughness: 0.8 }));
  side.position.set(0, 1.4, -0.42);
  wall.add(side);
  for (let i = -1; i < 9; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.1), mat);
    r.position.set(0, -0.068 + 0.3 * i, -0.3);
    wall.add(r);
  }
  fig.root.add(wall);
  return { load, wall };
}
function showCrewProps(rig, name, t) {
  const p = rig.props;
  p.load.visible = q.get('load') !== '0' && CARRIED.includes(name);
  const r = name === 'carryShoulder' ? 0.6 : 1;
  p.load.scale.set(1, r, r);
  p.load.position.set(name === 'push' || name === 'ram' ? 0.9 : 0, name === 'push' || name === 'ram' ? 0 : 0.14 * r + 0.01, 0);
  p.wall.visible = name === 'climb';
  p.wall.position.y = -CREW_GAITS.climb.rise * fract(t) + 0.3 * Math.floor(2 * fract(t));
}

function addItem(kind, x) {
  let root, rig = null;
  if (kind === 'crew' || kind.startsWith('crew:')) {
    const at = kind.indexOf('@'), kOutfit = at > 0 ? kind.slice(at + 1) : null;
    if (at > 0) kind = kind.slice(0, at);
    const o = kOutfit ? { outfit: kOutfit, skin: items.length % 4 } : q.get('mix') === '1' ? CREW_OUTFITS[items.length % CREW_OUTFITS.length]
      : q.get('outfit') ? { outfit: q.get('outfit') }
        : { headgear: q.get('headgear') || undefined, vest: q.get('vest') || undefined, pattern: q.get('pattern') || undefined, skin: Number(q.get('skin') || 0) };
    const fig = buildCrewman(o);
    root = fig.root;
    const name = kind.startsWith('crew:') ? kind.slice(5) : (crewPose || 'stand');
    rig = { crew: fig, pose: name };
    fig.pose(name, crewT, 1);
  } else if (kind.startsWith('shell:') || kind.startsWith('target:')) {
    root = new THREE.Group();
    const id = kind.slice(kind.indexOf(':') + 1);
    if (kind.startsWith('shell:') && shellsMod) {
      const s = shellsMod.buildShell(id);
      for (const p of s.parts) root.add(new THREE.Mesh(p.geometry, p.material));
      root.position.y = (s.radius || 0.2);
      root.rotation.y = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(root);
      root = wrap;
    } else if (kind.startsWith('target:') && targetsMod) {
      const t = targetsMod.buildTarget(id);
      root.add(t.root);
      rig = { target: t };
    } else console.warn('registry not available for', kind);
  } else {
    rig = buildGun(kind);
    root = rig.root;
  }
  root.position.x = x;
  scene.add(root);
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  let tris = 0, draws = 0;
  root.traverse((o) => { if (o.isMesh) { draws++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  const box = new THREE.Box3().setFromObject(root);
  items.push({ root, rig, kind, box, tris, draws });
  if (rig && rig.crew) { rig.props = crewProps(rig.crew); showCrewProps(rig, rig.pose, crewT); }
  if (rig && rig.pivots) {
    for (const [key, v] of Object.entries(pose)) {
      if (key === 'recoil') rig.setRecoil?.(v);
      else if (key === 'breech') rig.setBreech?.(v);
      else if (key === 'elevation') rig.pivots.elevation && (rig.pivots.elevation.rotation.x = v);
      else if (key === 'traverse') rig.pivots.traverse && (rig.pivots.traverse.rotation.y = v);
      else if (key === 'crane') rig.pivots.crane && (rig.pivots.crane.rotation.y = v);
      else if (key === 'hoist') rig.pivots.hoist && (rig.pivots.hoist.position.y = v);
      else if (key === 'trolley') rig.pivots.trolley && (rig.pivots.trolley.position.z = v);
      else { const [k, axis] = key.split('.'); if (rig.pivots[k]) rig.pivots[k].rotation[axis || 'x'] = v; }
    }
    if (q.get('load')) rig.setShell?.(q.get('load'), true);
    if (q.get('crew') === '1' && rig.anchors.crew) {
      rig.crewFigs = rig.anchors.crew.map((c, i) => {
        const fig = buildCrewman(crewForRole(c.role, i));
        fig.root.position.set(c.x, c.y, c.z);
        fig.root.rotation.y = c.heading;
        fig.pose(c.pose || 'stand', i * 0.13, 1);
        rig.root.add(fig.root);
        return fig;
      });
      root.updateMatrixWorld(true);
    }
  }
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = `${kind}  ${Math.round(tris)} tris, ${draws} draws`;
  document.body.appendChild(label);
  labels.push({ el: label, root });
  return items[items.length - 1];
}

const all = q.get('all');
let list;
if (all === 'guns') list = GUN_KINDS;
else if (all === 'outfits') list = ['gunner', 'gunner-tunic', 'officer', 'german', 'german-cap', 'german-drill', 'stretcher'].map((o) => `crew:${q.get('pose') || 'stand'}@${o}`);
else if (all === 'crew') list = CREW_POSES.map((p) => 'crew:' + p);
else if (q.get('shell')) list = ['shell:' + q.get('shell')];
else if (q.get('target')) list = ['target:' + q.get('target')];
else list = [q.get('kind') || 'bl15'];

let xo = 0;
for (const k of list) {
  addItem(k, xo);
  xo += all === 'crew' || all === 'outfits' ? 1.3 : 24;
}
const info = document.getElementById('info');
const center = new THREE.Vector3();
const bb = new THREE.Box3();
for (const it of items) bb.union(it.box);
bb.getCenter(center);
const size = bb.getSize(new THREE.Vector3());
const cam = (q.get('cam') || '').split(',').map(Number);
const dist = cam[2] || Math.max(size.length() * 1.1, 4);
const az = (cam[0] ?? 35) * Math.PI / 180, el = (isNaN(cam[1]) ? 18 : cam[1]) * Math.PI / 180;
camera.position.set(center.x + dist * Math.sin(az) * Math.cos(el), center.y + dist * Math.sin(el), center.z - dist * Math.cos(az) * Math.cos(el));
controls.target.copy(center);
controls.update();
sun.target.position.copy(center);
sun.position.copy(center).add(new THREE.Vector3(-40, 70, -30));
{
  const R = Math.max(size.x, size.z, 20);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, far: R * 4 });
  sun.position.copy(center).add(new THREE.Vector3(-R, R * 1.5, -R * 0.6));
  sun.shadow.mapSize.set(R > 30 ? 4096 : 2048, R > 30 ? 4096 : 2048);
  sun.shadow.camera.updateProjectionMatrix();
}

const ortho = q.get('ortho');
if (ortho) {
  const AX = { right: [1, 0, 0], left: [-1, 0, 0], front: [0, 0, -1], rear: [0, 0, 1], top: [0, 1, 0] }[ortho] || [1, 0, 0];
  const dir = new THREE.Vector3(...AX);
  const c = bb.getCenter(new THREE.Vector3());
  const half = Math.max(size.x, size.y, size.z) * 0.62 + 0.5;
  const aspect = innerWidth / innerHeight;
  camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 1000);
  camera.position.copy(c).addScaledVector(dir, 200);
  camera.up.set(0, ortho === 'top' ? 0 : 1, ortho === 'top' ? -1 : 0);
  camera.lookAt(c);
  controls.enabled = false;
  const L = Math.ceil(half * 2 * Math.max(aspect, 1)) + 4;
  const g2 = new THREE.Group();
  const minor = new THREE.GridHelper(L, L, 0x6d7a86, 0x6d7a86);
  const major = new THREE.GridHelper(L, L / 5, 0x2e3b47, 0x2e3b47);
  minor.material.opacity = 0.35;
  minor.material.transparent = true;
  g2.add(minor, major);
  if (ortho === 'top') g2.position.set(Math.round(c.x), bb.min.y - 0.05, Math.round(c.z));
  else {
    g2.rotation.x = Math.PI / 2;
    if (ortho === 'right' || ortho === 'left') g2.rotation.z = Math.PI / 2;
    const back = ortho === 'right' ? bb.min.x - 1 : ortho === 'left' ? bb.max.x + 1 : ortho === 'front' ? bb.max.z + 1 : bb.min.z - 1;
    if (ortho === 'right' || ortho === 'left') g2.position.set(back, 0, Math.round(c.z));
    else g2.position.set(Math.round(c.x), 0, back);
  }
  scene.add(g2);
  ground.visible = ortho === 'top' ? false : ground.visible;
  grid.visible = false;
  scene.fog = null;
}
if (q.get('night') === '1') { sun.intensity = 0.2; scene.environmentIntensity = 0.15; scene.background = new THREE.Color(0x10151c); if (scene.fog) scene.fog.color.set(0x10151c); }
info.textContent = items.map((i) => `${i.kind}: ${Math.round(i.tris)} tris, ${i.draws} draws, ${i.box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(1)).join(' x ')} m`).join('\n');

// A loading and firing demonstration for a gun rig: t in seconds of a 18 s loop.
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function gunCycle(rig, t) {
  const P = rig.pivots, fireEl = 0.62, loadEl = rig.loadEl ?? 0;
  const c = t % 18;
  let el = fireEl, br = 0, rec = 0;
  const cr = P.crane, hoist = P.hoist, tr = P.trolley;
  if (c < 2) el = fireEl + (loadEl - fireEl) * smooth(0, 2, c);
  else if (c < 12) el = loadEl;
  else if (c < 14) el = loadEl + (fireEl - loadEl) * smooth(12, 14, c);
  br = smooth(2, 3, c) - smooth(10, 11, c);
  // the shell goes from the crane (or trolley) to the tray, then into the breech
  const on = c > 3.2 && c < 10.4;
  rig.setShell('crane', on && c < 6.5);
  rig.setShell('tray', on && c >= 6.5 && c < 9);
  rig.setShell('trolley', false);
  if (cr) cr.rotation.y = (c < 3.2 ? 0 : -1.3 * smooth(3.2, 5.5, c)) + (c > 7 ? 1.3 * smooth(7, 9, c) : 0);
  if (hoist) { const hr = rig.hoistRange || { up: 4, down: 1 }; hoist.position.y = hr.up + (hr.down - hr.up) * 0.8 * smooth(3.2, 4.2, c) * (1 - smooth(5.5, 6.5, c)); }
  if (tr) tr.position.z = (c > 3 && c < 9 ? 3 * smooth(3, 5, c) : 0) * (1 - smooth(8, 9.5, c));
  const f = c - 14.6; // the shot
  if (f > 0) rec = f < 0.18 ? f / 0.18 : Math.max(0, 1 - (f - 0.18) / 1.6);
  rig.setElevation(el);
  rig.setBreech(Math.max(0, br));
  rig.setRecoil(rec);
}

const clock = new THREE.Clock();
let tPrev = 0;
function frame() {
  const t = clock.getElapsedTime(), dtv = Math.min(0.1, t - tPrev);
  tPrev = t;
  if (anim) for (const it of items) {
    if (it.rig && it.rig.pivots && it.rig.setRecoil) gunCycle(it.rig, t);
    if (it.rig && it.rig.crew) {
      const cyc = crewPose || it.kind.startsWith('crew:') ? null : CREW_POSES[Math.floor(t / 3.5) % CREW_POSES.length];
      const name = cyc || it.rig.pose, g = CREW_GAITS[name], period = g ? g.period : 3;
      const ph = fract(t / period);
      it.rig.crew.pose(name, ph, cyc ? 1 - Math.exp(-8 * dtv) : 1);
      showCrewProps(it.rig, name, ph);
    }
  }
  for (const it of items) {
    if (it.rig && it.rig.update) it.rig.update(dtv);
    if (it.rig && it.rig.crewFigs && anim) it.rig.crewFigs.forEach((f, i) => f.pose(it.rig.anchors.crew[i].pose || 'stand', fract(t / 3 + i * 0.13), 1 - Math.exp(-8 * dtv)));
  }
  for (const l of labels) {
    const p = l.root.position.clone().add(new THREE.Vector3(0, -0.1, 0)).project(camera);
    l.el.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px';
    l.el.style.top = ((-p.y * 0.5 + 0.5) * innerHeight + 4) + 'px';
    l.el.style.display = items.length > 1 ? 'block' : 'none';
  }
  controls.update();
  renderer.render(scene, camera);
  window.__ready = true;
}
renderer.setAnimationLoop(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.__viewer = { scene, items, camera, controls, renderer };

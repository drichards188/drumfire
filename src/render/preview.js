// Render preview: the framework minimally (sky, terrain, post, fx), one unit's guns with their crews
// posed from a frozen sim, so the loading choreography can be captured at a chosen moment.
//   /src/render/preview.html?unit=1&piece=0&step=ram&t=0.5&cam=az,el,dist&target=x,y,z
//   step: depress|open|shell|ram|cartridge|close|prime|lay|ready|idle|fire (fire: t = seconds since the shot)
//   &run=1 steps the real sim live (attract battle) instead of freezing it; &hour= &quality=Low|Medium
//   window.__render: { set(step, t), cam(az, el, dist), frame(dt), sim, render, ... }
import * as THREE from 'three';
import { globalUniforms, patchSceneFog } from '../shaderlib.js';
import { Atmosphere } from '../atmosphere.js';
import { Terrain } from '../terrain.js';
import { PostFX } from '../post.js';
import { FX } from '../fx.js';
import { UNITS, piecePlacements, headingFor, DEG } from '../sector.js';
import { heightAt, los } from '../terrain.js';
import { Sim } from '../sim/sim.js';
import { GUNS, STEP } from '../sim/tables.js';
import { buildGun, loadGuns } from '../models/guns.js';
import { createRender } from './index.js';

if (import.meta.hot) import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('reload suppressed'); });
const q = new URLSearchParams(location.search);

async function main() {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: q.has('still') });
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.3, 80000);
  const atmosphere = new Atmosphere(renderer, scene);
  const quality = q.get('quality') || 'Medium';
  const terrain = new Terrain(scene, { quality });
  const fx = new FX(scene, {});
  await loadGuns();

  const sim = new Sim({ heightAt, los, seed: Number(q.get('seed') || 3) });
  sim.newGame({ attract: true });
  const unitId = Number(q.get('unit') || 1);
  const def = UNITS.find((u) => u.id === unitId);
  const rigs = new Map();
  const places = piecePlacements(def);
  for (const p of places) {
    const rig = buildGun(p.kind);
    rig.root.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
    rig.root.rotation.y = headingFor(p.bearing);
    scene.add(rig.root);
    rigs.set(`${unitId}:${p.i}`, rig);
  }
  // only this unit's pieces are drawn: drop the others' keys so GunViews builds them lazily elsewhere
  for (const u of UNITS) if (u.id !== unitId) places.length;
  const render = createRender({ scene, sim, terrain, fx, rigs, camera, onlyRigs: true });
  render.select(unitId);
  patchSceneFog(scene);
  const post = new PostFX(renderer, scene, camera);
  post.setGrade?.('1917');
  atmosphere.setShadowQuality?.(4096, 60);

  const hour = Number(q.get('hour') ?? 10);
  const elevation = Math.max(-10, 36 * Math.sin(((hour - 6) / 12) * Math.PI) - 4);
  const sunBearing = 90 + (hour - 6) * 15;
  atmosphere.set(elevation, 180 - sunBearing);

  const unit = sim.unitById(unitId);
  const piece = unit.pieces[Number(q.get('piece') || 0)];
  const g = GUNS[piece.kind];
  const root = rigs.get(`${unitId}:${piece.i}`).root;

  const view = { az: 135, el: 14, dist: 22, x: root.position.x, y: root.position.y + 2, z: root.position.z };
  if (q.get('cam')) [view.az, view.el, view.dist] = q.get('cam').split(',').map(Number);
  if (q.get('target')) [view.x, view.y, view.z] = q.get('target').split(',').map(Number);
  else { view.x += 0; }
  const cam = (az, el, dist) => { Object.assign(view, { az: az ?? view.az, el: el ?? view.el, dist: dist ?? view.dist }); place(); };
  const target = new THREE.Vector3();
  function place() {
    const az = view.az * DEG, el = view.el * DEG;
    // az is the compass bearing of the camera's position as seen from the target
    target.set(view.x, view.y, view.z);
    camera.position.set(view.x + Math.sin(az) * Math.cos(el) * view.dist, view.y + Math.sin(el) * view.dist, view.z - Math.cos(az) * Math.cos(el) * view.dist);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  place();

  // freeze the sim on a loading step at fraction t
  const set = (step, t = 0) => {
    piece.crew = piece.crewMax;
    piece.job = null; piece.loaded = false; piece.breech = 0; piece.rounds = 0; piece.firedAt = -999; piece.recoil = 0;
    const heavy = g.load[0].step === 'depress';
    piece.az = 0;
    piece.cmd.az = 0;
    if (q.has('az')) piece.az = piece.cmd.az = Number(q.get('az')) * DEG;
    piece.el = piece.cmd.el = q.has('el') ? Number(q.get('el')) * DEG : g.restEl;
    const idx = g.load.findIndex((s) => s.step === step);
    if (idx >= 0) {
      const st = g.load[idx];
      piece.state = step === 'lay' ? 'loading' : 'loading';
      piece.ji = idx;
      piece.job = { step, t: t * st.dur, dur: st.dur, i: idx, n: g.load.length };
      if (heavy && step !== 'lay') piece.el = piece.cmd.el = g.loadEl;
      piece.breech = step === 'open' ? t : step === 'close' ? 1 - t : idx > g.load.findIndex((s) => s.step === 'open') && idx < g.load.findIndex((s) => s.step === 'close') ? 1 : 0;
      piece.loaded = idx > g.load.findIndex((s) => s.step === 'ram');
    } else if (step === 'ready') {
      piece.state = 'ready'; piece.loaded = true; piece.rounds = t > 0 ? 3 : 0; piece.fireAt = sim.time + t;
    } else if (step === 'fire') {
      piece.state = 'recoil'; piece.loaded = false; piece.firedAt = sim.time - t;
    } else piece.state = 'idle';
  };
  if (!q.has('run')) set(q.get('step') || 'idle', Number(q.get('t') || 0));
  else for (const p of unit.pieces) p.rounds = 99;

  const timer = new THREE.Timer();
  const sunColorN = new THREE.Color(), ambient = new THREE.Color();
  let t = 0;
  const frame = (forced, draw = true) => {
    timer.update();
    const dt = forced ?? THREE.MathUtils.clamp(timer.getDelta(), 0, 0.1);
    t += dt;
    globalUniforms.uTime.value = t;
    if (q.has('run')) sim.update(dt * Number(q.get('run') || 1));
    render.update(dt, dt, sim, fx, camera);
    place();
    atmosphere.update(target, t, camera);
    const light = atmosphere.sun;
    light.intensity = (atmosphere.sunBase ?? light.intensity) * 1.5;
    sunColorN.copy(light.color).multiplyScalar(light.intensity / 6.5);
    globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);
    globalUniforms.uSunColorN.value.copy(sunColorN);
    ambient.copy(scene.fog.color).multiplyScalar(1.0);
    fx.update(dt, camera, { sunDir: atmosphere.lightDir, sunColor: sunColorN, sunIntensity: 6.5, ambient, night: atmosphere.night });
    scene.environmentIntensity = 0.5 * atmosphere.baseEnvIntensity;
    scene.fog.density = 0.00005;
    terrain.update(camera);
    const ex = post.exposure.params;
    ex.auto = true; ex.key = 0.17; ex.max = 4;
    post.bloom.strength = 0.25; post.bloom.threshold = 3;
    post.dof.enabled = false;
    post.update(t, dt, atmosphere.sunDir, sunColorN, elevation);
    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    if (draw) post.render(dt);
  };
  terrain.update(camera, true);
  await renderer.compileAsync(scene, camera);
  for (let i = 0; i < 4; i++) frame(0.2);
  window.__render = { renderer, scene, camera, terrain, sim, render, rigs, piece, unit, set, cam, frame, view, THREE, fx, ready: true };
  const info = document.getElementById('info');
  if (!q.has('still')) {
    const loop = () => {
      frame();
      info.textContent = `${piece.kind} ${piece.state} ${piece.job ? piece.job.step + ' ' + (piece.job.t / piece.job.dur).toFixed(2) : ''}  ${renderer.info.render.calls} calls`;
      requestAnimationFrame(loop);
    };
    loop();
  }
}
main().catch((e) => {
  console.error(e);
  document.getElementById('info').textContent = String(e.stack || e);
});

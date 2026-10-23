// World viewer: the framework (sky, terrain, clouds, weather, post) and the dressing, without the game.
//   /world.html?at=battery|front|nml|zone|wood|ypres|ridge|railhead|stream&cam=az,el,dist&hour=8&weather=Overcast
//   &craters=N (stamp N runtime craters near the view)  &quality=Low|Medium|High  &x=&z= (any point)
//   &grade=1917  &eye=1.7 (camera at a standing man's eye, looking along az, dist ignored)
// cam: az is the compass bearing the camera looks toward, el the camera's elevation above the target
// (degrees), dist its distance from it (m). Drag to orbit, wheel to zoom. window.__world exposes everything.
import * as THREE from 'three';
import { globalUniforms, patchSceneFog } from '../shaderlib.js';
import { Atmosphere } from '../atmosphere.js';
import { Terrain } from '../terrain.js';
import { Clouds } from '../clouds.js';
import { Weather, WEATHER } from '../weather.js';
import { PostFX } from '../post.js';
import { PLACES, SITES, UNITS, DEG } from '../sector.js';
import { mulberry32 } from '../noise.js';

// other agents' edits trigger Vite full reloads; a screenshot run must not be interrupted by one
if (import.meta.hot) import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('reload suppressed'); });
const q = new URLSearchParams(location.search);
const QUALITY = {
  Low: { pr: 0.75, shadowMap: 2048, shadowExtent: 100, ao: false },
  Medium: { pr: 1, shadowMap: 2048, shadowExtent: 120, ao: true },
  High: { pr: 1.25, shadowMap: 4096, shadowExtent: 140, ao: true },
};
const quality = QUALITY[q.get('quality')] ? q.get('quality') : 'Medium';
const place = (name) => PLACES.find((p) => p.name === name).pos;
const site = (id) => SITES.find((s) => s.id === id).pos;

// named viewpoints: target, default camera (az, el, dist)
const VIEWS = {
  battery: { at: { x: UNITS.find((u) => u.kind === 'bl6').pos.x + 30, z: UNITS.find((u) => u.kind === 'bl6').pos.z }, cam: [85, 14, 60] },
  front: { at: { x: 4300, z: 0 }, cam: [80, 8, 45] },
  nml: { at: { x: 4450, z: 0 }, cam: [90, 6, 70] },
  zone: { at: { x: 4900, z: 200 }, cam: [90, 30, 320] },
  wood: { at: { x: 5900, z: 1700 }, cam: [100, 5, 45] },
  ypres: { at: place('Ypres'), cam: [70, 16, 450] },
  ridge: { at: { x: 8200, z: -2000 }, cam: [270, 10, 600] },
  railhead: { at: site('R1'), cam: [250, 12, 250] },
  stream: { at: { x: 2650, z: 0 }, cam: [90, 20, 120] },
  pillbox: { at: site('M2'), cam: [270, 10, 60] },
};

async function main() {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: q.has('still') });
  let w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[quality].pr));
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.3, 80000);
  const atmosphere = new Atmosphere(renderer, scene);
  const terrain = new Terrain(scene, { quality });
  const clouds = new Clouds(scene);
  const weather = new Weather(scene, null);

  // the dressing agent's builder, if it exists
  const mods = import.meta.glob('../world/index.js');
  let world = null;
  for (const load of q.get('world') === '0' ? [] : Object.values(mods)) {
    try {
      world = (await load()).buildWorld?.(scene, terrain) ?? null;
    } catch (e) {
      console.warn('world failed:', e.message);
    }
  }
  patchSceneFog(scene);
  const post = new PostFX(renderer, scene, camera);
  post.setGrade(q.get('grade') || '1917');
  post.gtao.enabled = QUALITY[quality].ao;
  atmosphere.setShadowQuality(QUALITY[quality].shadowMap, QUALITY[quality].shadowExtent);

  // ---------------------------------------------------------------- the view
  const hour = Number(q.get('hour') ?? 9);
  const elevation = Math.max(-10, 36 * Math.sin(((hour - 6) / 12) * Math.PI) - 4);
  const sunBearing = 90 + (hour - 6) * 15;
  const wname = WEATHER[q.get('weather')] ? q.get('weather') : WEATHER.Overcast ? 'Overcast' : Object.keys(WEATHER)[0];
  weather.set(wname, true);
  for (const k of Object.keys(weather.state)) if (!Number.isFinite(weather.state[k])) weather.state[k] = weather.target[k] = WEATHER[wname]?.[k] ?? 0; // tolerate a preset that lacks a key
  atmosphere.set(elevation, 180 - sunBearing);

  const key = q.get('at') || 'front';
  const V = q.has('x') ? { at: { x: Number(q.get('x')), z: Number(q.get('z')) }, cam: [90, 10, 80] } : VIEWS[key] || VIEWS.front;
  const cam = q.get('cam') ? q.get('cam').split(',').map(Number) : V.cam;
  const view = { x: V.at.x, z: V.at.z, az: cam[0], el: cam[1], dist: cam[2], eye: q.has('eye') ? Number(q.get('eye')) : 0 };
  const target = new THREE.Vector3();
  const place_ = () => {
    const ty = terrain.heightAt(view.x, view.z);
    const az = view.az * DEG, el = view.el * DEG;
    const hx = Math.sin(az), hz = -Math.cos(az);
    if (view.eye) {
      camera.position.set(view.x, ty + view.eye, view.z);
      camera.lookAt(view.x + hx * 50, ty + view.eye + Math.tan(el) * -10 + 0.0, view.z + hz * 50);
    } else {
      target.set(view.x, ty + 1.5, view.z);
      camera.position.set(view.x - hx * Math.cos(el) * view.dist, ty + 1.5 + Math.sin(el) * view.dist, view.z - hz * Math.cos(el) * view.dist);
      const g = terrain.heightAt(camera.position.x, camera.position.z) + 1.5;
      if (camera.position.y < g) camera.position.y = g;
      camera.lookAt(target);
    }
    camera.updateMatrixWorld();
  };
  place_();

  // runtime craters near the view
  const nc = Number(q.get('craters') || 0);
  if (nc) {
    const rnd = mulberry32(5);
    const R = [1.5, 2, 3, 5, 6.5, 8];
    for (let i = 0; i < nc; i++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * Math.min(160, Math.max(30, view.dist * 0.6));
      const r = R[Math.floor(rnd() * rnd() * R.length)];
      terrain.craters.add(view.x + Math.cos(a) * d, view.z + Math.sin(a) * d, r, r * 0.4, { scorch: 0.6 + rnd() * 0.8 });
    }
  }

  // ---------------------------------------------------------------- the loop
  const timer = new THREE.Timer();
  const sunColorN = new THREE.Color(), ambient = new THREE.Color();
  let t = 0, info = '';
  const frame = (forcedDt, draw = true) => {
    timer.update();
    const dt = forcedDt ?? THREE.MathUtils.clamp(timer.getDelta(), 0, 0.1);
    t += dt;
    globalUniforms.uTime.value = t;
    atmosphere.setStorm(weather.state.storm);
    const u = atmosphere.uniforms;
    u.cloudCoverage.value = weather.state.cover * 0.45;
    u.cloudDensity.value = 0.45 + weather.state.storm * 0.4;
    if (atmosphere.lastEnvKey === '' || !atmosphere.lastEnvKey.endsWith(weather.state.storm.toFixed(2))) atmosphere.set(elevation, 180 - sunBearing);
    scene.environmentIntensity = 0.5 * atmosphere.baseEnvIntensity * (1 - weather.state.storm * 0.45) + weather.flash * 2.5;
    terrain.update(camera);
    world?.update?.(dt, camera);
    atmosphere.update(target, t, camera);
    const light = atmosphere.sun;
    light.intensity = (atmosphere.sunBase ?? light.intensity) * 1.5;
    sunColorN.copy(light.color).multiplyScalar(light.intensity / 6.5);
    globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);
    globalUniforms.uSunColorN.value.copy(sunColorN);
    ambient.copy(scene.fog.color).multiplyScalar(0.9 + 0.3 * (1 - weather.state.storm));
    const env = { sunDir: atmosphere.lightDir, sunColor: sunColorN, sunIntensity: 6.5, ambient };
    clouds.update(dt, camera, { ...env, sunIntensity: 6.5 * (1 - 0.65 * atmosphere.night), cover: THREE.MathUtils.clamp(0.55 + weather.state.cover * 0.6, 0, 1) });
    weather.update(dt, t, camera, atmosphere);
    scene.fog.density = 0.00007 * weather.state.fog * Number(q.get('fog') || 1);
    globalUniforms.fogSunColor.value.copy(atmosphere.fogSunBase || globalUniforms.fogSunColor.value).multiplyScalar(1 - 0.9 * weather.state.storm);
    globalUniforms.fogHeightFalloff.value = 0.0006;
    globalUniforms.fogBaseHeight.value = 0;
    const ex = post.exposure.params;
    ex.auto = true;
    ex.key = 0.17;
    ex.max = 2 + 5 * (1 - THREE.MathUtils.smoothstep(elevation, -6, 3));
    post.bloom.strength = 0.28;
    post.bloom.threshold = 3;
    post.dof.enabled = false;
    post.update(t, dt, atmosphere.sunDir, sunColorN, elevation);
    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    if (draw) (q.get('post') === '0' ? renderer.render(scene, camera) : post.render(dt));
    info = `${key}  az ${view.az.toFixed(0)} el ${view.el.toFixed(0)} dist ${view.dist.toFixed(0)}  at ${view.x.toFixed(0)},${view.z.toFixed(0)}  ground ${terrain.groundAt(view.x, view.z)}  craters ${terrain.craters.count}  ${renderer.info.render.calls} calls ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
  };

  // orbit with the mouse
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => (drag = [e.clientX, e.clientY]));
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.az -= (e.clientX - drag[0]) * 0.3;
    view.el = THREE.MathUtils.clamp(view.el + (e.clientY - drag[1]) * 0.2, -5, 89);
    drag = [e.clientX, e.clientY];
    place_();
  });
  addEventListener('wheel', (e) => {
    view.dist = THREE.MathUtils.clamp(view.dist * Math.exp(e.deltaY * 0.001), 4, 8000);
    place_();
  });
  addEventListener('resize', () => {
    w = innerWidth; h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
  });

  terrain.update(camera, true);
  world?.update?.(0.016, camera);
  await renderer.compileAsync(scene, camera);
  for (let i = 0; i < Number(q.get('warm') || 3); i++) frame(0.2); // the auto exposure needs a few frames
  window.__world = { renderer, scene, camera, terrain, atmosphere, post, world, weather, view, place: place_, frame, THREE, ready: true };
  const el = document.getElementById('info');
  const loop = () => {
    frame();
    el.textContent = info;
    requestAnimationFrame(loop);
  };
  if (q.has('still')) el.textContent = info;
  else loop();
}

main().catch((e) => {
  console.error(e);
  document.getElementById('info').textContent = String(e.stack || e);
});

import * as THREE from 'three';
import GUI from 'lil-gui';

import { globalUniforms, patchSceneFog, patchMaterial } from '../shaderlib.js';
import { Atmosphere } from '../atmosphere.js';
import { Terrain } from '../terrain.js';
import { Clouds } from '../clouds.js';
import { Weather, WEATHER } from '../weather.js';
import { PostFX, GRADES } from '../post.js';
import { FX } from '../fx.js';
import { Flares } from '../flares.js';
import { HUD } from '../hud.js';
import { ChaseCamera } from '../camera.js';
import { AudioEngine } from '../audio.js';
import { buildWorld, CUTAWAY } from '../world/index.js';
import { Craters } from '../craters.js';
import { buildGun, loadGuns } from '../models/guns.js';
import { patchCrewMaterial } from '../models/v/crew.js';
import { buildShell } from '../models/shells.js';
import { UNITS, piecePlacements, headingFor, BERTHA } from '../sector.js';
import { QUALITY, sunAt, blastTrauma } from '../presets.js';
import { BerthaGame, STATIONS } from './game.js';
import { GUN } from './ballistics.js';
import { buildBertha } from './model.js';
import { buildPosition } from './position.js';
import { BerthaCrew } from './crew.js';
import { BerthaHud, targetName, shellName, fuzeName } from './hud.js';
import { BerthaTutorial } from './tutorial.js';
import { t, tt, getLang, setLang, onLang, applyStatic } from './i18n.js';

// Dicke Bertha, the first-person demo mode: one German 42 cm howitzer and its detachment, the player
// taking each man's place in turn. The stage (sky, terrain, world dressing, fx, post, audio) is the main
// game's; the game logic is ./game.js (Node-safe, tools/berthatest.mjs), the gun ./model.js, the position
// ./position.js, the men ./crew.js, the overlay ./hud.js. Behind the title screen the crew works the gun on
// its own (assist, nobody's station) as a demonstration.
//
// Camera: at a station the eye sits at the eyes of the man whose place the player has taken (a little behind
// them at the handwheels, so his hands and the work fill the lower half of the view), or on the station's
// anchor (the loader's station watches the whole stage from its back edge); the mouse looks around (pointer lock
// on click, or drag). While a loading step runs the view turns by itself to the work (the hook, the tray, the
// wedge) unless the mouse has moved in the last few seconds. V puts the eye to the station's instrument (the
// panoramic sight: a narrow field along its line of sight to the aiming posts). F rides the newest shell with
// the chase camera and comes back after the burst.
//
// Every key that cannot act where the player stands says why, and where it belongs, on the line under the prompt.
const query = new URLSearchParams(location.search);
const TIME_SCALES = [0.25, 0.5, 1, 2, 4, 8];
// each station's default look (offsets from its eye's heading), and for the men at the handwheels how far the
// camera sits behind (back) and above (up) the man's eyes
const VIEW = {
  cmd: { yaw: 0, pitch: -0.06 },
  trav: { yaw: 0.3, pitch: -0.3, back: 0.45, up: 0.2 },
  elev: { yaw: -0.3, pitch: -0.28, back: 0.45, up: 0.2 },
  load: { yaw: 0, pitch: -0.3 },
  fire: { yaw: 0, pitch: -0.06 },
  none: { yaw: 0, pitch: -0.06 },
};
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CAL = GUN.calibre;
const hud = new HUD();
const step = async (p, msg) => {
  hud.setLoading(p, msg);
  await new Promise((r) => setTimeout(r, 0));
};

async function init() {
  const view = document.getElementById('view');
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  const size = () => ({ w: Math.max(2, view.clientWidth), h: Math.max(2, view.clientHeight) });
  let { w: vw, h: vh } = size();
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.High.pixelRatio));
  renderer.setSize(vw, vh, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, vw / vh, 0.08, 80000);
  camera.rotation.order = 'YXZ';
  const quality = QUALITY[query.get('quality')] ? query.get('quality') : 'Medium';

  await step(0.05, 'Painting the sky');
  const atmosphere = new Atmosphere(renderer, scene);
  atmosphere.setMoon({ dElev: -60, dAz: 100 });
  const nightHemi = new THREE.HemisphereLight(0x5b6c92, 0x201c14, 0);
  scene.add(nightHemi);

  await step(0.15, 'Surveying the ridge');
  const terrain = new Terrain(scene, { quality });
  const clouds = new Clouds(scene);
  const fx = new FX(scene, { maxSmoke: QUALITY[quality].maxSmoke });
  fx.ground = terrain.heightAt;
  const flares = new Flares(scene, { ground: terrain.heightAt });
  fx.onFlash = (pos, color, intensity, life, opts) => flares.flash(pos, color, intensity, life, opts);
  const weather = new Weather(scene, null);
  await loadGuns();

  await step(0.35, 'Laying the Bettung');
  let world = null;
  try {
    world = buildWorld(scene, terrain);
  } catch (e) {
    console.warn('buildWorld failed:', e.message);
  }
  const craters = terrain.craters ?? new Craters(terrain, { quality });

  // ---------------------------------------------------------------- the gun, its position, its men
  const gy = terrain.heightAt(BERTHA.pos.x, BERTHA.pos.z);
  const rig = buildBertha();
  rig.root.position.set(BERTHA.pos.x, gy, BERTHA.pos.z);
  rig.root.rotation.y = headingFor(BERTHA.base);
  scene.add(rig.root);
  const position = buildPosition(rig);
  const eyes = {}; // station -> Object3D whose -Z is the default look
  const eye = (parent, name, x, y, z, ry) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.rotation.y = ry;
    parent.add(o);
    eyes[name] = o;
  };
  eyes.trav = rig.anchors['eye-trav'];
  eyes.elev = rig.anchors['eye-elev'];
  eyes.load = rig.anchors['eye-load'];
  eye(rig.root, 'cmd', -7.0, 1.62, 0.45, -Math.PI / 2 - 0.35);
  eye(rig.root, 'fire', -15.1, 1.5, 7.4, -Math.PI / 2 + 0.47);
  eye(rig.root, 'none', -9, 2.2, 14, -Math.PI / 2 + 0.75);

  // the British gun line: the main game's rigs, standing as targets (wrecked when the observer says so)
  await step(0.5, 'Spotting the British guns');
  const brit = new Map(); // `${unitId}:${i}` -> rig
  for (const u of UNITS) {
    for (const p of piecePlacements(u)) {
      try {
        const r = buildGun(p.kind);
        r.root.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
        r.root.rotation.y = headingFor(p.bearing);
        r.setElevation?.(0.5);
        scene.add(r.root);
        brit.set(`${u.id}:${p.i}`, r);
      } catch (e) {
        console.warn(`buildGun(${p.kind}) failed: ${e.message}`);
      }
    }
  }

  // ---------------------------------------------------------------- the game (a demonstration behind the title)
  let game = new BerthaGame({ seed: (Math.random() * 1e9) | 0, assist: true });
  game.station = 'none';
  let state = 'title'; // title | playing | ended
  const crew = new BerthaCrew(rig, game);
  crew.cartShell = position.cartShell;
  patchCrewMaterial(patchMaterial);

  // shells in flight: one mesh group per shell, nose along the velocity, swollen with distance so a
  // 42 cm round is still a speck at a kilometre
  const shellProto = {};
  const shellMesh = (model) => {
    if (!shellProto[model]) {
      try {
        shellProto[model] = buildShell(model, 12);
      } catch {
        shellProto[model] = buildShell('m21', 12);
      }
    }
    const g = new THREE.Group();
    for (const p of shellProto[model].parts) g.add(new THREE.Mesh(p.geometry, p.material));
    return g;
  };
  const shellViews = new Map();

  await step(0.7, 'Preparing the lens');
  patchSceneFog(scene);
  const post = new PostFX(renderer, scene, camera);
  fx.onShock = (pos, radius, speed, strength) => post.shockwave?.(pos, { radius, speed, strength });
  fx.onHeat = (pos, radius, life) => post.heat?.(pos, { radius, life });
  const chase = new ChaseCamera(camera, canvas, { ground: terrain.heightAt });
  chase.enabled = false;
  const audio = new AudioEngine();
  const wake = () => {
    removeEventListener('pointerdown', wake);
    removeEventListener('keydown', wake);
    try {
      if (!audio.ctx) audio.start();
    } catch (e) {
      console.warn('audio.start failed:', e.message);
    }
  };
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);
  audio.onShock = ({ k }) => {
    shake(Math.min(1, k * 1.1));
    post.dazzle?.(Math.min(1, k * 0.7));
  };
  const bh = new BerthaHud();

  // ---------------------------------------------------------------- settings
  const params = {
    quality, language: getLang() === 'de' ? 'Deutsch' : 'English', timeScale: 1, difficulty: 'Normal', assist: false, fov: 70, sensitivity: 1,
    hour: Number(query.get('hour') ?? 6.2), lockHour: query.get('hour') != null,
    weather: WEATHER[query.get('weather')] ? query.get('weather') : 'Overcast',
    exposure: 1, sunGain: 1.5, envIntensity: 0.4, nightGlow: 0.55, exposureKey: 0.17, grade: GRADES.Flanders ? 'Flanders' : 'Natural',
    bloomStrength: 0.3, godRays: 0.35, vignette: 0.42, grain: 0.035, shake: true, fogDensity: 0.00009, fogFalloff: 0.0007,
  };
  const applyQuality = (name) => {
    const q = QUALITY[name];
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    renderer.setSize(vw, vh, false);
    post.setSize(vw, vh);
    atmosphere.setShadowQuality(q.shadowMap, q.shadowExtent);
    post.gtao.enabled = q.ao;
    post.lens.material.defines.RAY_SAMPLES = q.raySamples;
    post.lens.material.needsUpdate = true;
    post.dof.material.defines.SAMPLES = q.dofSamples;
    post.dof.material.needsUpdate = true;
    fx.setBudget(q.fx);
    terrain.setQuality(name);
  };
  const gui = new GUI({ title: 'Settings', container: document.getElementById('gui-host') });
  gui.add(params, 'quality', Object.keys(QUALITY)).name('Quality preset').onChange(applyQuality);
  gui.add(params, 'timeScale', TIME_SCALES).name('Time compression ([ ])').listen().onChange((v) => hud.setTimeScale(v));
  gui.add(params, 'fov', 50, 95, 1).name('Field of view');
  gui.add(params, 'sensitivity', 0.3, 3, 0.05).name('Mouse sensitivity');
  gui.add(params, 'shake').name('Camera shake');
  gui.add(params, 'hour', 0, 24, 0.05).name('Hour (fixes the clock)').listen().onChange(() => (params.lockHour = true));
  gui.add(params, 'weather', Object.keys(WEATHER)).name('Weather').onChange((v) => weather.set(v)).listen();
  gui.add(params, 'grade', Object.keys(GRADES)).name('Color grade').onChange((v) => post.setGrade(v));
  gui.add(params, 'language', ['English', 'Deutsch']).name('Language / Sprache').listen().onChange((v) => setLang(v === 'Deutsch' ? 'de' : 'en'));
  post.setGrade(params.grade);
  const guiHost = document.getElementById('gui-host');
  guiHost.classList.add('hidden');
  document.getElementById('gear').addEventListener('click', () => guiHost.classList.toggle('hidden'));
  const setTimeScale = (k) => {
    params.timeScale = k;
    hud.setTimeScale(k);
  };
  const stepTime = (d) => setTimeScale(TIME_SCALES[Math.min(TIME_SCALES.length - 1, Math.max(0, TIME_SCALES.indexOf(params.timeScale) + d))]);
  document.getElementById('ts-up').addEventListener('click', () => stepTime(1));
  document.getElementById('ts-down').addEventListener('click', () => stepTime(-1));
  document.getElementById('ts-val').addEventListener('click', () => setTimeScale(1));

  // ---------------------------------------------------------------- camera: stations, look, instrument, shell ride
  const look = { yaw: 0, pitch: -0.05 }; // offsets from the station's default look
  const trans = { t: 1, from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };
  // the page's view state, read by the overlay and the tutorial (looked: the mouse has turned the view; rode: a shell ride)
  const view2 = { instrument: false, fovRad: 0.17, height: vh, looked: false, rode: false, scale: 1 };
  let following = false;
  let trauma = 0, shakeT = 0;
  let lastLook = -1e9; // performance.now() of the last mouse look (the look assist waits after it)
  const shake = (k) => (trauma = Math.min(1, trauma + k));
  const setStation = (id) => {
    if (!eyes[id]) return;
    if (game.station !== id) {
      trans.t = 0;
      trans.from.copy(camera.position);
      trans.fromQ.copy(camera.quaternion);
      look.yaw = VIEW[id].yaw;
      look.pitch = VIEW[id].pitch;
      lastLook = -1e9;
      view2.instrument = false;
      audio.ui?.('click');
    }
    game.station = id;
    if (following) leaveShell();
  };
  const leaveShell = () => {
    following = false;
    chase.enabled = false;
    chase.releaseShot();
    trans.t = 0;
    trans.from.copy(camera.position);
    trans.fromQ.copy(camera.quaternion);
  };
  const followShell = () => {
    let best = null;
    for (const s of game.shells) if (s.alive && s.own && (!best || s.id > best.id)) best = s;
    if (!best) {
      hud.hint(tt('noShell'), 1800);
      return;
    }
    following = true;
    chase.enabled = true;
    chase.setTarget(eyes.none);
    chase.followShell(best, { onBurst: () => leaveShell() });
    view2.rode = true;
    hud.hint(tt('riding'), 2200);
  };
  bh.stationsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || state !== 'playing') return;
    if (b.id === 'assist-btn') toggleAssist();
    else setStation(b.dataset.st);
  });
  // Crew assists (C, the station bar's last button, the title screen's box): the stations the player is not at work
  // the drill themselves. It can be switched at any time in the battle (the main menu starts the game without the
  // title screen), never in the tutorial; the choice is remembered (localStorage 'drumfire.bertha.assist').
  const ASSIST_KEY = 'drumfire.bertha.assist';
  const toggleAssist = () => {
    if (game.range) return bh.flash(t('assistTut'), 2200, 'warn');
    game.assist = !game.assist;
    game.crewT = {};
    assistBox.checked = game.assist;
    try { localStorage.setItem(ASSIST_KEY, game.assist ? '1' : '0'); } catch {}
    bh.setAssist(game.assist);
    audio.ui?.('click');
    bh.flash(t(game.assist ? 'assistNowOn' : 'assistNowOff'), 2200, 'info');
  };

  // the sight's line of sight in the rig's root frame: through the first aiming post when the deflection
  // set equals the carriage's swing (parallax free: from where the sight stands at zero swing)
  // the first aiming post's sighting mark (1.4 m up the post) in the world
  rig.root.updateMatrixWorld(true);
  const postW = rig.root.localToWorld(position.posts[0].clone().setY(1.4));
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const goalPos = new THREE.Vector3(), goalQ = new THREE.Quaternion();
  const titleOrbit = { a: 0.9 };
  // the point the loader's view turns to by itself: the slung shell while the crane works, the tray while ramming
  // and charging, the wedge's crank while it is worked, the breech as the gun fires
  const pointOfWork = (out) => {
    if (game.station !== 'load' || view2.instrument) return null;
    const id = phase.load.id, P = rig.props;
    if (id === 'hoist') {
      // the cart while the jib swings out and the shell is slung, the tray while it swings over (it passes
      // over the back of the stage), the shell as it comes down into the tray
      const k = phase.load.k;
      if (k < 0.5) return position.cartShell[game.selShell].getWorldPosition(out);
      if (k < 0.82) return rig.anchors.tray.getWorldPosition(out);
      return P.hook[game.selShell].getWorldPosition(out);
    }
    if (id === 'ram' || id === 'bag' || id === 'case') return rig.anchors.tray.getWorldPosition(out);
    if (id === 'open' || id === 'close' || id === 'unload') return rig.wheels.wedge.node.getWorldPosition(out);
    if (phase.fire >= 0 || (game.time - game.gun.firedAt >= 0 && game.time - game.gun.firedAt < 2.5)) return rig.anchors.lanyard.getWorldPosition(out);
    return null;
  };
  let camAt = null;
  const placeCamera = (rawDt) => {
    let fov = params.fov;
    // a fixed camera for captures and checks: __bertha.camAt(x, y, z, lx, ly, lz) in the gun's frame
    if (camAt) {
      rig.root.localToWorld(goalPos.set(camAt[0], camAt[1], camAt[2]));
      rig.root.localToWorld(_p.set(camAt[3], camAt[4], camAt[5]));
      camera.position.copy(goalPos);
      camera.lookAt(_p);
      camera.fov = camAt[6] ?? 50;
      camera.updateProjectionMatrix();
      return;
    }
    if (state === 'title' || state === 'ended') {
      titleOrbit.a += rawDt * 0.045;
      _p.set(Math.sin(titleOrbit.a) * 21, 6.5 + Math.sin(titleOrbit.a * 0.7) * 1.5, Math.cos(titleOrbit.a) * 21 + 2);
      rig.root.localToWorld(goalPos.copy(_p));
      _p.set(0, 2.6, 1.2);
      rig.root.localToWorld(_p);
      camera.position.copy(goalPos);
      camera.lookAt(_p);
      camera.fov = 52;
      camera.updateProjectionMatrix();
      return;
    }
    if (game.station === 'trav' && view2.instrument) {
      // from the sight's head, which rides the carriage, along its line to the first aiming post turned by the
      // swing the setting does not yet match: the post is on the hair exactly when the carriage's swing equals
      // the deflection set (no parallax: the line is taken from where the head stands now)
      rig.anchors.sight.updateWorldMatrix(true, false);
      rig.anchors.sight.getWorldPosition(goalPos);
      _d.subVectors(postW, goalPos);
      const yaw = Math.atan2(-_d.x, -_d.z) + (game.gun.tr - game.gun.sight);
      _e.set(Math.atan2(_d.y, Math.hypot(_d.x, _d.z)), yaw, 0);
      goalQ.setFromEuler(_e);
      fov = 9;
      trans.t = 1;
    } else {
      // at the eyes of the man whose place the player has taken (crew.js), or a station's fixed eye
      let base = crew.eye(goalPos);
      const vw = VIEW[game.station] ?? VIEW.none;
      if (base == null) {
        const a = eyes[game.station];
        a.updateWorldMatrix(true, false);
        a.getWorldPosition(goalPos);
        a.getWorldDirection(_d); // +Z of the anchor: the look is its -Z
        base = Math.atan2(_d.x, _d.z);
      } else if (vw.back) {
        goalPos.x += Math.sin(base) * vw.back;
        goalPos.z += Math.cos(base) * vw.back;
        goalPos.y += vw.up;
      }
      // the look assist: toward the work in hand, unless the player has just looked somewhere himself
      const poi = state === 'playing' ? pointOfWork(_p) : null;
      if (poi && performance.now() - lastLook > 2600) {
        _d.subVectors(poi, goalPos);
        const k = 1 - Math.exp(-rawDt * 2.4);
        look.yaw += wrapA(Math.atan2(-_d.x, -_d.z) - base - look.yaw) * k;
        look.pitch += (Math.max(-1.2, Math.min(1.1, Math.atan2(_d.y, Math.hypot(_d.x, _d.z)))) - look.pitch) * k;
      }
      _e.set(look.pitch, base + look.yaw, 0);
      goalQ.setFromEuler(_e);
    }
    if (trans.t < 1) {
      trans.t = Math.min(1, trans.t + rawDt / 0.55);
      const k = trans.t * trans.t * (3 - 2 * trans.t);
      camera.position.lerpVectors(trans.from, goalPos, k);
      camera.quaternion.slerpQuaternions(trans.fromQ, goalQ, k);
    } else {
      camera.position.copy(goalPos);
      camera.quaternion.copy(goalQ);
    }
    // shake (the chase camera's recipe, in first person)
    trauma = Math.max(0, trauma - rawDt * 1.1);
    shakeT += rawDt;
    const s = params.shake ? trauma * trauma : 0;
    if (s > 1e-4) {
      const t = shakeT * 21, n = (a2) => Math.sin(t * a2) * 0.6 + Math.sin(t * a2 * 2.13 + 1.7) * 0.4;
      _e.set(n(1.1) * 0.05 * s, n(0.9) * 0.05 * s, n(1.3) * 0.07 * s);
      camera.quaternion.multiply(_q.setFromEuler(_e));
      camera.position.x += n(1.7) * 0.12 * s;
      camera.position.y += n(1.9) * 0.15 * s;
      camera.position.z += n(2.3) * 0.12 * s;
    }
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov < 20 || camera.fov < 20 ? fov : camera.fov + (fov - camera.fov) * Math.min(1, rawDt * 8);
      camera.updateProjectionMatrix();
    }
    view2.fovRad = (camera.fov * Math.PI) / 180;
    view2.height = vh;
  };

  // mouse look: pointer lock when the canvas is clicked in play, a drag otherwise
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing' || following) return;
    if (!document.pointerLockElement && !navigator.webdriver) canvas.requestPointerLock?.()?.catch?.(() => {});
    drag = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', () => (drag = null));
  const turn = (dx, dy) => {
    if (state !== 'playing' || following || (game.station === 'trav' && view2.instrument)) return;
    const k = 0.0022 * params.sensitivity * (params.fov / 70);
    look.yaw = Math.max(-2.6, Math.min(2.6, look.yaw - dx * k));
    look.pitch = Math.max(-1.3, Math.min(1.2, look.pitch - dy * k));
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      view2.looked = true;
      lastLook = performance.now();
    }
  };
  addEventListener('pointermove', (e) => {
    if (document.pointerLockElement === canvas) turn(e.movementX, e.movementY);
    else if (drag) {
      turn(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });

  // ---------------------------------------------------------------- keys
  const held = new Set();
  const order = STATIONS.map((s) => s.id);
  const help = document.getElementById('help');
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    held.add(e.code);
    if (['Tab', 'F1', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'F1') return help.classList.toggle('show');
    if (e.code === 'BracketRight') return stepTime(1);
    if (e.code === 'BracketLeft') return stepTime(-1);
    if (e.code === 'KeyM') return hud.hint(audio.toggleMute?.() ? tt('soundOff') : tt('soundOn'), 1500);
    if (e.code === 'KeyH') return document.body.classList.toggle('ui-hidden');
    if (e.code === 'F3') {
      e.preventDefault();
      return document.body.classList.toggle('debug');
    }
    if (state !== 'playing') return;
    if (/^Digit[1-5]$/.test(e.code)) setStation(order[Number(e.code.slice(5)) - 1]);
    else if (e.code === 'Tab') setStation(order[(order.indexOf(game.station) + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
    else if (e.code === 'KeyF') following ? leaveShell() : followShell();
    else if (e.code === 'KeyC') toggleAssist();
    else if (following) return;
    else if (e.code === 'KeyV') {
      if (game.station === 'trav' || game.station === 'elev') view2.instrument = !view2.instrument;
      else bh.flash(t('vWhere'));
    } else if (e.code === 'KeyQ' || e.code === 'KeyZ') pick(e.code === 'KeyQ');
    // a key that does nothing where the player stands says where it belongs
    else if ((e.code === 'KeyW' || e.code === 'KeyS') && game.station !== 'elev') bh.flash(t('wsWhere'));
    else if ((e.code === 'KeyW' || e.code === 'KeyS') && game.gun.breechOpen) bh.flash(t('elevOpenLock'));
    else if ((e.code === 'KeyA' || e.code === 'KeyD') && game.station !== 'trav') bh.flash(t('adWhere'));
    else if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && game.station !== 'elev') bh.flash(t('udWhere'));
    else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && game.station !== 'trav') bh.flash(t('lrWhere'));
    else if ((e.code === 'KeyE' || e.code === 'KeyR') && !game.actions(game.station).list.some((a) => a.key === e.code.slice(3))) {
      // nothing to hold here: the reason under the prompt lights up
      const el = document.getElementById('prompt-why');
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  });
  // Q and Z: the shell and the fuze the crane will lift (the loader's choice, while nothing is up yet)
  const pick = (isShell) => {
    const g = game.gun, o = game.order;
    if (game.station !== 'load') return bh.flash(t('qzWhere'));
    if (g.loaded) return bh.flash(t('qzLoaded'));
    if (g.tray || g.rammed) return bh.flash(t('qzLate'));
    if (isShell) game.selShell = game.selShell === 'schwer' ? 'leicht' : 'schwer';
    else game.selFuze = game.selFuze === 'oV' ? 'mV' : 'oV';
    audio.ui?.('click');
    const good = !o?.acked || (isShell ? game.selShell === o.shell : game.selFuze === o.fuze);
    bh.flash(t('picked', isShell ? `${t('loadShell')}: ${shellName(game.selShell)}` : `${t('loadFuze')}: ${fuzeName(game.selFuze)}`, good), 1800, good ? 'info' : 'warn');
  };
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  document.getElementById('help-close').addEventListener('click', () => help.classList.remove('show'));
  const readInput = () => {
    const h = (c) => held.has(c);
    const ax = (a, b) => (h(a) ? 1 : 0) - (h(b) ? 1 : 0);
    game.setInput({
      trav: ax('KeyA', 'KeyD'), sight: ax('ArrowLeft', 'ArrowRight'), elev: ax('KeyW', 'KeyS'), quad: ax('ArrowUp', 'ArrowDown'),
      fine: h('ShiftLeft') || h('ShiftRight'), hold: following ? null : h('KeyE') ? 'E' : h('KeyR') ? 'R' : null,
    });
  };

  // ---------------------------------------------------------------- game events: the look and the sound
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const wire = (g) => {
    const quiet = () => g !== game || state !== 'playing';
    g.events = {
      fire(sh) {
        rig.root.updateMatrixWorld(true);
        rig.anchors.muzzle.getWorldPosition(_v);
        _w.set(sh.vel.x, sh.vel.y, sh.vel.z).normalize();
        fx.gunBlast?.(_v, _w, CAL, { night: atmosphere.night });
        audio.gun?.(_v, CAL);
        post.heat?.(_v, { radius: 8, life: 2 });
        // the ground blast round the bed
        _w.set(0, 0, -6);
        rig.root.localToWorld(_w);
        fx.dust?.(_w, 3);
        if (!audio.ctx) {
          shake(blastTrauma(CAL, camera.position.distanceTo(_v)));
          post.dazzle?.(0.5);
        }
        if (!quiet()) hud.hint(tt('shot'), 2600);
      },
      step(name, at) {
        _v.set(at.x, at.y, at.z);
        audio.load?.(name, _v, CAL);
      },
      burst(sh, p, info) {
        _v.set(p.x, p.y, p.z);
        if (info.fuze === 'shrapnel') fx.shrapnel?.(_v, info.calibre);
        else fx.shellBurst?.(_v, { calibre: info.calibre, fuze: info.fuze, ground: info.ground, crater: info.crater });
        if (info.crater > 0 && info.ground !== 'water') craters.add?.(p.x, p.z, info.crater, info.crater * 0.4, { scorch: Math.min(1.5, 0.6 + info.calibre / 15) });
        audio.burst?.(_v, info.calibre, { fuze: info.fuze, ground: info.ground });
        const d = camera.position.distanceTo(_v);
        if (info.crater > 0 && d < 1400) world?.invalidate?.(p.x, p.z, info.crater + 6);
        if (!audio.ctx) shake(blastTrauma(info.calibre, d, 0.9));
        if (d < 120 * (info.calibre / 9) + 40) post.shockwave?.(_v, { radius: 40 + info.calibre * 12, speed: 343, strength: Math.min(1, 0.4 + info.calibre / 20) });
      },
      enemyFire(src, pc, sh) {
        const r = brit.get(`${src.unit}:${pc.i}`);
        if (!r) return;
        r.root.updateMatrixWorld(true);
        (r.anchors?.muzzle ?? r.root).getWorldPosition(_v);
        _w.set(sh.vel.x, sh.vel.y, sh.vel.z).normalize();
        fx.gunBlast?.(_v, _w, sh.calibre, { night: atmosphere.night });
        audio.gun?.(_v, sh.calibre);
      },
      incoming(sh) {
        audio.incoming?.(sh);
      },
      pieceDestroyed(t, pc) {
        const r = brit.get(`${t.unit}:${pc.i}`);
        if (r) {
          r.root.rotation.x = 0.08;
          r.root.rotation.z = 0.12;
          r.root.position.y -= 0.4;
          r.setElevation?.(0.9);
        }
        _v.set(pc.x, pc.y, pc.z);
        fx.cookOff?.(_v, 1.6);
        audio.cookOff?.(_v, 1.6);
        if (!quiet()) hud.kill(tt('gunKilled', targetName(t)), 25);
      },
      targetDestroyed(t, pts) {
        if (quiet()) return;
        hud.kill(tt('targetKilled', targetName(t)), pts);
        audio.ui?.('bell');
      },
      hit(dmg) {
        if (quiet()) return;
        shake(0.6);
        hud.hint(tt('hitUs', dmg), 2500);
      },
      phone() {
        if (quiet()) return;
        audio.ui?.('phone');
        if (game.station !== 'cmd') hud.hint(tt('phoneHint'), 3000);
      },
      order(o) {
        if (quiet()) return;
        hud.toast(tt('orderToast', o.n), targetName(o), 2600);
      },
      message(m) {
        if (!quiet()) bh.message(m);
      },
      // a wheel the player turns has come onto its mark (game.crank): a click and a word
      mark(axis) {
        if (quiet()) return;
        audio.ui?.('click');
        bh.flash(t(axis === 'elev' && !game.gun.loaded ? 'markLoad' : `mark_${axis}`), 1600, 'info');
      },
      state(s) {
        if ((s === 'victory' || s === 'defeat') && !quiet() && !tutorial.active) endGame(s);
      },
    };
  };
  wire(game);

  // ---------------------------------------------------------------- start, end
  const playBtn = document.getElementById('play');
  const diffBtns = [...document.querySelectorAll('#difficulty button')];
  diffBtns.forEach((b) =>
    b.addEventListener('click', () => {
      params.difficulty = b.dataset.d;
      diffBtns.forEach((o) => o.classList.toggle('on', o === b));
    })
  );
  const assistBox = document.getElementById('assist');
  try { assistBox.checked = localStorage.getItem(ASSIST_KEY) === '1'; } catch {}
  assistBox.addEventListener('change', () => { try { localStorage.setItem(ASSIST_KEY, assistBox.checked ? '1' : '0'); } catch {} });
  const resetBritish = () => {
    for (const [key, r] of brit) {
      const [uid, i] = key.split(':').map(Number);
      const p = piecePlacements(UNITS.find((u) => u.id === uid))[i];
      r.root.rotation.set(0, headingFor(p.bearing), 0);
      r.root.position.y = terrain.heightAt(p.x, p.z);
      r.setElevation?.(0.5);
    }
  };
  // a new game: the battle, or the tutorial's quiet range ({ range: true })
  const start = ({ range = false } = {}) => {
    if (!range && tutorial.active) tutorial.stop(false);
    for (const v of shellViews.values()) scene.remove(v);
    shellViews.clear();
    flares.clear();
    fx.clearLitter?.();
    resetBritish();
    const asked = query.get('assist');
    game = new BerthaGame({ seed: (Math.random() * 1e9) | 0, difficulty: params.difficulty, assist: !range && (asked != null ? asked === '1' : assistBox.checked), range });
    crew.game = game;
    wire(game);
    bh.setAssist(game.assist, !range);
    state = 'playing';
    hud.showTitle(false);
    hud.hideEnd();
    hud.setScore(0);
    bh.clearLog();
    game.station = 'none';
    setStation(query.get('station') && eyes[query.get('station')] ? query.get('station') : 'cmd');
    trans.t = 1;
    hud.toast(tt('gunName'), tt('toastSub'), 3000);
    try {
      audio.start?.();
    } catch (e) {
      console.warn('audio.start failed:', e.message);
    }
    if (!range) game.say('Batterieführer: Bedienung an die Geschütze! (F1: Hilfe)', 'Gun commander: crew to your stations! (F1 for the drill)', 'info');
  };
  playBtn.addEventListener('click', () => start());
  // back to the title screen with the crew's demonstration behind it (leaving the tutorial)
  const toTitle = () => {
    for (const v of shellViews.values()) scene.remove(v);
    shellViews.clear();
    resetBritish();
    game = new BerthaGame({ seed: (Math.random() * 1e9) | 0, assist: true });
    game.station = 'none';
    crew.game = game;
    wire(game);
    if (following) leaveShell();
    view2.highlight = null;
    state = 'title';
    document.exitPointerLock?.();
    bh.clearLog();
    hud.hideEnd();
    hud.showTitle(true);
  };
  // the tutorial (tutorial.js) on the quiet range
  const hiEls = ['order', 'readout', 'prompt'];
  const tutorial = new BerthaTutorial({
    game: () => game,
    view: () => {
      view2.scale = params.timeScale;
      return view2;
    },
    start: () => {
      view2.looked = view2.rode = false;
      start({ range: true });
    },
    leave: toTitle,
    play: () => start(),
    setHighlight: (station, els) => {
      view2.highlight = station;
      for (const id of hiEls) document.getElementById(id).classList.toggle('hi', els.includes(id));
    },
  });
  const tutBtn = document.getElementById('tutorial-btn');
  tutBtn.addEventListener('click', () => tutorial.start());
  // the way out of a game or the tutorial: the title screen, with its options and the link back to the main menu
  document.getElementById('to-title').addEventListener('click', () => (tutorial.active ? tutorial.stop() : toTitle()));
  // the language: English by default, the switch on the title screen and in the settings
  const langSwitch = (l) => {
    setLang(l);
    params.language = l === 'de' ? 'Deutsch' : 'English';
  };
  for (const b of document.querySelectorAll('#lang-switch button')) b.addEventListener('click', () => langSwitch(b.dataset.lang));
  onLang(() => {
    bh.relabel();
    tutorial.relabel();
    if (state === 'ended') endGame(game.state);
  });
  applyStatic();
  const endGame = (s) => {
    state = 'ended';
    document.exitPointerLock?.();
    const win = s === 'victory';
    hud.showEnd(
      {
        title: tt(win ? 'endWin' : 'endLose'),
        sub: tt(win ? 'endWinSub' : 'endLoseSub'),
        victory: win,
        stats: [
          [t('stScore'), game.score.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB')],
          [t('stRounds'), game.roundsFired],
          [t('stTargets'), `${game.targets.filter((x) => !x.alive).length} / ${game.targets.length}`],
          [t('stGun'), `${Math.round(game.gun.hp)} %`],
          [t('stTime'), `${Math.round(game.time / 60)} min`],
        ],
      },
      { onRestart: () => start() }
    );
  };

  new ResizeObserver(() => {
    ({ w: vw, h: vh } = size());
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    renderer.setSize(vw, vh, false);
    post.setSize(vw, vh);
  }).observe(view);

  // ---------------------------------------------------------------- first frame
  await step(0.85, 'Compiling shaders');
  applyQuality(quality);
  weather.set(params.weather, true);
  const sun = { elevation: 20, bearing: 180 };
  const clockHour = () => (params.lockHour ? params.hour : params.hour + (game.time / 3600) * 4);
  const applySun = (h) => {
    const s = sunAt(h);
    sun.elevation = s.elevation;
    sun.bearing = s.bearing;
    atmosphere.set(s.elevation, 180 - s.bearing);
  };
  applySun(clockHour());
  placeCamera(0);
  terrain.update(camera, true);
  await renderer.compileAsync(scene, camera);
  rig.root.getWorldPosition(_v);
  atmosphere.update(_v, 0, camera);
  renderer.shadowMap.needsUpdate = true;
  post.render(0.016);
  hud.setLoading(1, '');
  hud.ready();
  playBtn.disabled = false;
  tutBtn.disabled = false;
  hud.setTimeScale(1);

  const timer = new THREE.Timer();
  const sunColorN = new THREE.Color(), ambient = new THREE.Color();
  // (the clock is clockT: `t` is the page's string table, i18n.js)
  let clockT = 0, sunTimer = 0, crankT = 0, frameAvg = 16, hudTimer = 0;
  const focus = new THREE.Vector3();
  const recoilK = (tf) => (tf < 0 ? 0 : tf < 0.07 ? tf / 0.07 : tf < 0.5 ? 1 : tf < 3.2 ? 1 - ((tf - 0.5) / 2.7) ** 0.8 : 0);

  // the loading props from the game state and the step in hand
  const P = rig.props, TZ = (rig.trayZ.z0 + rig.trayZ.z1) / 2;
  const hideAll = () => {
    for (const k of ['schwer', 'leicht']) {
      P.hook[k].visible = P.tray[k].visible = false;
      position.cartShell[k].visible = false;
    }
    P.bags.forEach((b) => (b.visible = false));
    P.case.visible = false;
    P.rammer.visible = false;
  };
  let spentShown = false, prevSpent = false;
  let trayK = 1, winchT = 0, prevFire = -1, stopShown = false; // the tray's run (0 forward, 1 back), the winch pawl, the whistle, a stop's flash
  // the loading step in hand and the firing in progress, for the props here and the crew (crew.js)
  const phase = { load: { id: null, k: 0 }, fire: -1 };
  const poseLoading = () => {
    const g = game.gun;
    hideAll();
    // the step in hand and how far through it is
    let id = null, k = 0;
    if (game.action?.station === 'load') {
      id = game.action.id;
      k = game.action.t / game.action.dur;
    } else if (game.assist && game.station !== 'load' && (game.crewT.load ?? 0) > 0) {
      const acts = game.actions('load').list;
      const a = acts[0]?.id === 'bag' && game.order && g.bags >= game.order.charge ? acts.find((x) => x.id === 'case') : acts[0];
      if (a) {
        id = a.id;
        k = Math.min(1, game.crewT.load / (a.dur * 1.3));
      }
    }
    phase.load.id = id;
    phase.load.k = k;
    phase.fire = game.action?.id === 'fire' ? game.action.t / game.action.dur : game.assist && game.station !== 'fire' && game.gun.loaded && (game.crewT.fire ?? 0) > 0 ? Math.min(1, game.crewT.fire / 3) : -1;
    const sel = id === 'hoist' ? game.selShell : g.tray?.shell ?? game.selShell;
    // the crane: over the tray at rest, out to the cart and back while hoisting
    let swing = 1, drop = 0, onHook = false;
    if (id === 'hoist') {
      const seg = (a, b) => Math.min(1, Math.max(0, (k - a) / (b - a)));
      swing = 1 - seg(0, 0.15) + seg(0.55, 0.8);
      drop = seg(0.15, 0.35) - seg(0.35, 0.55) + seg(0.8, 1);
      onHook = k > 0.35;
    }
    rig.setCrane(swing, drop);
    P.hook[sel].visible = onHook;
    position.cartShell[sel].visible = !g.tray && !g.rammed && !g.loaded && !onHook && !!(game.order?.acked) && game.order.fired < game.order.rounds;
    if (g.tray || (id === 'hoist' && k >= 1)) {
      const sh = P.tray[g.tray?.shell ?? sel];
      sh.visible = true;
      sh.position.set(0, -0.05, TZ);
    }
    if (id === 'ram' && g.tray) {
      const sh = P.tray[g.tray.shell];
      const m = Math.min(1, Math.max(0, (k - 0.2) / 0.7));
      sh.position.z = TZ - m * 2.6;
      sh.visible = sh.position.z > 0.9;
      P.rammer.visible = true;
      P.rammer.position.set(0, -0.02, TZ + 0.8 - m * 2.6);
    }
    if (id === 'bag' || id === 'case') {
      const b = id === 'bag' ? P.bags[0] : P.case;
      const m = Math.min(1, Math.max(0, (k - 0.35) / 0.6));
      b.visible = true;
      b.position.set(0, -0.03, TZ - 0.3 - m * 1.9);
      b.rotation.set(0, 0, 0);
      if (b.position.z < 1.2) b.visible = false;
    }
    // the spent case: thrown out onto the stage when the wedge opens on it, cleared when the next shell is up
    if (prevSpent && !g.spent) spentShown = true;
    prevSpent = g.spent;
    if (g.tray || g.rammed || g.loaded) spentShown = false;
    P.spent.visible = spentShown && !g.spent;
    if (P.spent.visible) {
      P.spent.position.set(0.7, rig.loadStage + 0.21, rig.trayZ.z1 + 0.5);
      P.spent.rotation.set(0, 0.6, 0);
    }
  };

  const frame = (forcedDt, draw = true) => {
    timer.update();
    const rawDt = forcedDt ?? THREE.MathUtils.clamp(timer.getDelta(), 0, 0.1);
    frameAvg += (rawDt * 1000 - frameAvg) * 0.05;
    const dt = rawDt * params.timeScale;
    clockT += dt;
    globalUniforms.uTime.value = clockT;
    if (state === 'playing') readInput();
    game.update(dt);
    // a crank ratchet while a wheel turns
    crankT -= rawDt;
    const inp = game.input;
    if (state === 'playing' && crankT <= 0 && ((game.station === 'trav' && inp.trav) || (game.station === 'elev' && inp.elev && !game.gun.breechOpen))) {
      crankT = inp.fine ? 0.5 : 0.28;
      audio.ui?.('click');
    }

    // sun and sky
    const hour = clockHour();
    sunTimer -= rawDt;
    const u = atmosphere.uniforms;
    atmosphere.setStorm(weather.state.storm);
    u.cloudCoverage.value = weather.state.cover * 0.45;
    u.cloudDensity.value = 0.45 + weather.state.storm * 0.4;
    if (sunTimer <= 0) {
      sunTimer = 0.5;
      const s = sunAt(hour);
      if (Math.abs(s.elevation - atmosphere.elevation) > 0.4 || atmosphere.lastEnvKey === '') applySun(hour);
    }
    scene.environmentIntensity = params.envIntensity * atmosphere.baseEnvIntensity * (1 - weather.state.storm * 0.35) + weather.flash * 2.5;

    // the gun from the game
    const g = game.gun;
    rig.setTraverse(g.tr);
    rig.setElevation(g.el);
    rig.setWedge(g.breech);
    rig.setRecoil(recoilK(game.time - g.firedAt));
    rig.setDials(g.el, g.tr);
    const tf = game.time - g.firedAt;
    rig.root.position.y = gy + (tf >= 0 && tf < 1.4 ? Math.exp(-tf * 4.5) * Math.sin(tf * 38) * 0.05 : 0);
    poseLoading();
    // the tray runs up to the breech while the wedge is open, and back clear of the recoil once it is shut
    const trayWant = g.breech > 0.02 || g.tray || (g.rammed && !g.loaded) ? 0 : 1;
    trayK += Math.sign(trayWant - trayK) * Math.min(Math.abs(trayWant - trayK), dt * 0.85);
    rig.setTray(trayK * trayK * (3 - 2 * trayK));
    // the wedge's crank is on its shaft only while the block is worked
    const wid = phase.load.id;
    rig.wheels.wedge.node.visible = g.breech > 0.003 || wid === 'open' || wid === 'close' || wid === 'unload';
    if (state === 'playing') {
      // the crane's winch pawl while the hook is wound up or let down, the whistle as the firer takes the strain
      const hk = phase.load.id === 'hoist' ? phase.load.k : -1;
      winchT -= rawDt;
      if (((hk > 0.15 && hk < 0.55) || hk > 0.8) && winchT <= 0) {
        winchT = 0.19;
        audio.ui?.('click');
      }
      if (phase.fire >= 0 && prevFire < 0) audio.ui?.('whistle');
      // a crank against its stop says so (once per push)
      const atEl = game.station === 'elev' && inp.elev && !g.breechOpen && (inp.elev > 0 ? g.el >= GUN.elMax - 1e-4 : g.el <= GUN.elMin + 1e-4);
      const atTr = game.station === 'trav' && inp.trav && Math.abs(g.tr) >= GUN.trMax - 1e-4 && Math.sign(inp.trav) === Math.sign(g.tr);
      if ((atEl || atTr) && !stopShown) {
        stopShown = true;
        bh.flash(atEl ? t('elStop', Math.round((inp.elev > 0 ? GUN.elMax : GUN.elMin) / (Math.PI / 180))) : t('trStopHit'));
      }
      if (!inp.elev && !inp.trav) stopShown = false;
    }
    prevFire = phase.fire;
    crew.update(dt, game, clockT, state === 'playing' && !following ? game.station : null, phase);
    position.lanyard(crew.by.fire.fig.anchors.handR);

    // shells in flight
    for (const sh of game.shells) {
      let v = shellViews.get(sh);
      if (!v && sh.alive) {
        v = shellMesh(sh.model);
        scene.add(v);
        shellViews.set(sh, v);
        if (sh.own) audio.shell?.(sh);
      }
      if (!v) continue;
      const a = game.alpha;
      v.position.set(sh.prev.x + (sh.pos.x - sh.prev.x) * a, sh.prev.y + (sh.pos.y - sh.prev.y) * a, sh.prev.z + (sh.pos.z - sh.prev.z) * a);
      _w.set(sh.vel.x, sh.vel.y, sh.vel.z).normalize();
      v.quaternion.setFromUnitVectors(_d.set(0, 0, -1), _w);
      v.scale.setScalar(Math.max(1, camera.position.distanceTo(v.position) / 220));
      v.visible = sh.alive && sh.t > 0;
    }
    for (const [sh, v] of shellViews) {
      if (!game.shells.includes(sh)) {
        scene.remove(v);
        shellViews.delete(sh);
      }
    }

    world?.update?.(dt, camera);
    craters.update?.(dt, camera);

    // camera
    if (following) chase.update(rawDt, game.alpha);
    else placeCamera(rawDt);
    camera.updateMatrixWorld();
    if (CUTAWAY) CUTAWAY.r.value = 0;
    terrain.update(camera);
    focus.copy(following ? chase.focus : camera.position);
    atmosphere.update(focus, clockT, camera);
    const light = atmosphere.sun;
    light.intensity = (atmosphere.sunBase ?? light.intensity) * params.sunGain;
    sunColorN.copy(light.color).multiplyScalar(light.intensity / 6.5);
    globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);
    globalUniforms.uSunColorN.value.copy(sunColorN);
    ambient.copy(scene.fog.color).multiplyScalar(0.9 + 0.3 * (1 - weather.state.storm));
    nightHemi.intensity = params.nightGlow * atmosphere.night * (1 - 0.3 * weather.state.storm);
    const lightEnv = { sunDir: atmosphere.lightDir, sunColor: sunColorN, sunIntensity: 6.5, ambient };
    clouds.update(dt, camera, { ...lightEnv, sunIntensity: 6.5 * (1 - 0.65 * atmosphere.night), cover: THREE.MathUtils.clamp(0.55 + weather.state.cover * 0.6, 0, 1), deck: weather.state.deck ?? 0 });
    fx.wind.set(game.wind.x, 0, game.wind.z);
    fx.update(dt, camera, { ...lightEnv, night: atmosphere.night });
    flares.wind.copy(fx.wind);
    flares.update(dt, camera, (2 * Math.tan((camera.fov * Math.PI) / 360)) / (vh * renderer.getPixelRatio()));
    weather.update(dt, clockT, camera, atmosphere);
    scene.fog.density = params.fogDensity * weather.state.fog;
    globalUniforms.fogSunColor.value.copy(atmosphere.fogSunBase || globalUniforms.fogSunColor.value).multiplyScalar(1 - 0.9 * weather.state.storm);
    globalUniforms.fogHeightFalloff.value = params.fogFalloff;
    globalUniforms.fogBaseHeight.value = 0;

    const nightK = atmosphere.night;
    renderer.toneMappingExposure = params.exposure;
    const ex = post.exposure.params;
    ex.auto = true;
    ex.key = params.exposureKey * (1 - 0.35 * nightK);
    ex.max = 2 + 5 * (1 - THREE.MathUtils.smoothstep(sun.elevation, -6, 3));
    post.bloom.strength = params.bloomStrength * (1 - 0.3 * nightK);
    const lu = post.lens.uniforms;
    lu.uFlare.value = 0.4 * (1 - weather.state.storm);
    const gu = post.grade.uniforms;
    gu.uVignette.value = params.vignette;
    gu.uGrain.value = params.grain * (1 - 0.5 * nightK);
    gu.uNight.value = nightK;
    post.dof.enabled = false;
    post.update(clockT, rawDt, atmosphere.sunDir, sunColorN, sun.elevation);
    lu.uRays.value *= params.godRays * (1 - weather.state.storm);
    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    if (draw) post.render(rawDt);

    // overlay, sound
    hud.setClock(hour);
    hud.setScore(game.score);
    if (state === 'playing') bh.update(game, view2);
    tutorial.update(rawDt);
    document.body.classList.toggle('following', following);
    hud.updateCompass(camera, []);
    audio.setAmbience?.({ drumfire: 0.35, rain: weather.state.rain, wind: weather.state.wind });
    audio.update?.(rawDt, camera);
    hudTimer -= rawDt;
    if (hudTimer <= 0 && document.body.classList.contains('debug')) {
      hudTimer = 0.25;
      hud.debug(
        `fps     ${(1000 / frameAvg).toFixed(0)}  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1e6).toFixed(2)}M\n` +
          `game    t ${game.time.toFixed(0)} s  station ${game.station}  tr ${(g.tr / (Math.PI / 180)).toFixed(2)}  el ${(g.el / (Math.PI / 180)).toFixed(2)}  shells ${game.shells.length}`
      );
    }
  };
  renderer.setAnimationLoop(() => frame());

  window.__bertha = {
    renderer, scene, camera, rig, position, crew, terrain, fx, audio, post, params, hud: bh, eyes, frame, start, setTimeScale,
    get game() {
      return game;
    },
    get state() {
      return state;
    },
    tutorial, VIEW,
    station: (id) => setStation(id),
    look: (yaw, pitch) => Object.assign(look, { yaw, pitch }),
    instrument: (on) => (view2.instrument = on),
    camAt: (...a) => (camAt = a.length ? a : null),
    followShell,
    fastForward(seconds, { scale = 8, settle = 6 } = {}) {
      renderer.setAnimationLoop(null);
      const keep = params.timeScale;
      params.timeScale = scale;
      for (let i = Math.ceil(seconds / (0.05 * scale)); i > 0; i--) frame(0.05, false);
      params.timeScale = keep;
      for (let i = 0; i < settle; i++) frame(1 / 30, true);
      return { time: Math.round(game.time), state: game.state, rounds: game.roundsFired, score: game.score };
    },
  };
  if (query.get('tutorial')) tutorial.start();
  else if (query.get('play')) start();
}

init().catch((e) => {
  console.error(e);
  document.getElementById('status').textContent = `Failed to start: ${e.message}`;
});

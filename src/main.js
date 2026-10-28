import * as THREE from 'three';
import GUI from 'lil-gui';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { globalUniforms, patchSceneFog } from './shaderlib.js';
import { Atmosphere } from './atmosphere.js';
import { Terrain, heightAt, los } from './terrain.js';
import { groundKindAt } from './terrainHeight.js';
import { Clouds } from './clouds.js';
import { Weather, WEATHER } from './weather.js';
import { PostFX, GRADES } from './post.js';
import { DynamicResolution } from './dynres.js';
import { FX } from './fx.js';
import { Flares } from './flares.js';
import { HUD } from './hud.js';
import { Progression, BATTERIES } from './progression.js';
import { battleReward, gunEraOf, PAY } from './research.js';
import { createRewardFeed, rewardWords } from './ui/rewards.js';
import { showSummary, saveSummary } from './ui/summary.js';
import { threatOf, parseModifiers, modifierOf } from './threat.js';
import { missionById } from './campaign-data.js';
import { setUiTheatre } from './ui/theatre.js';
import { campaignTheatre, sandboxTheatre } from './campaign.js';
import { mountCampaignObjectives } from './ui/progression.js';
import { hideLoading } from './ui/loading.js';
import { menuHref, DIFFICULTIES, WIP_KINDS, WIP_LINE } from './menuItems.js';
import { Tutorials } from './tutorial.js';
import { ChaseCamera } from './camera.js';
import { UNITS as UNITS_1917, piecePlacements, headingFor, DEG, YARD } from './sector.js';
import { ww2Theatre, OPS } from './ww2/theatre.js';
import { QUALITY, sunAt, blastTrauma } from './presets.js';
import { warmUp } from './render/warmup.js';

// The sim, the render layer, the panel, audio, the gun models, the world dressing and the craters
// are written by other agents: they are loaded here only if their files exist and work, so the page
// always boots (import.meta.glob also bundles whichever exist).
const OPTIONAL = import.meta.glob(['./sim/sim.js', './ui/panel.js', './ui/range.js', './audio.js', './models/guns.js', './models/looks.js', './world/index.js', './craters.js', './render/index.js', './ww2/render.js', './ww2/ui.js', './ww2/tutorial.js', './ww2/gunnerView.js',
  './ww2/voices.js', // the German crew voices (only the WW2 open battle's, the Karl's and the WW1 open battle's pages build them)
  './ww1/theatre.js', './ww1/render.js', './ww1/ui.js', './ww1/tutorial.js', './render/crews_ww1.js']);
const optional = async (path) => {
  try {
    return (await OPTIONAL[path]?.()) ?? null;
  } catch (e) {
    console.warn(`optional module ${path} failed: ${e.message}`);
    return null;
  }
};

const TIME_SCALES = [0.25, 0.5, 1, 2, 4, 8];
const GUNNER_ASSIST = 'drumfire.gunner.assist'; // localStorage: the WW2 gunner's crew help, '0' off

const hud = new HUD();
const tick = () => new Promise((r) => setTimeout(r, 0));
const step = async (p, msg) => {
  hud.setLoading(p, msg);
  await tick();
};
const query = new URLSearchParams(location.search);
const SANDBOX = !!query.get('sandbox');
// the test fire range (?range=1, any era): the era's map and batteries on the scripted range, any battery, nothing paid
// (src/ui/range.js)
const RANGE = query.has('range') && !SANDBOX;
// The mode: the British game of 1917 (default) or the WW2 German mode (?mode=ww2&op=...). The WW2 theatre must exist
// before the terrain is first sampled: it adds its positions' levelled pads (src/ww2/theatre.js).
const WW2 = query.get('mode') === 'ww2';
// The WW1 German mode (?mode=ww1&op=ridge|paris): a sandbox battle with the German heavy roster of 1918, or the Paris
// Gun's own mission (src/ww1/). Its files are loaded only on a WW1 page, so the British game and the WW2 mode never
// depend on them; its theatre also levels its positions' pads, so it is built here, before the terrain is first sampled.
const WW1 = query.get('mode') === 'ww1';
let careerStorage;
try { careerStorage = window.localStorage; } catch { /* Session-only career. */ }
const career = new Progression(careerStorage);
// the German career's open battle on the ridge (not the range, a lesson or the sandbox page): the lineup's WW2
// batteries take the field beside the 1918 ones (src/ww1/ops.js RIDGE_WW2), so the theatre is built with its kinds
const RIDGE_CAREER = WW1 && (query.get('op') ?? 'ridge') === 'ridge' && !SANDBOX && !RANGE && !query.get('tutorial') && !query.get('campaign');
const WW1_TH = WW1 ? (await optional('./ww1/theatre.js'))?.ww1Theatre?.(query.get('op') ?? 'ridge', { kinds: RIDGE_CAREER ? Object.keys(career.lineupLevels('de')) : null }) ?? null : null;
if (WW1 && !WW1_TH) console.warn('WW1 theatre missing: the British game stands in');
const requestedMission = missionById(query.get('campaign'));
const CAMPAIGN_MISSION = requestedMission?.era === (WW2 ? 'ww2' : '1917') && career.canPlay(requestedMission.id) ? requestedMission : null;
const TH = CAMPAIGN_MISSION ? campaignTheatre(CAMPAIGN_MISSION) : WW2 ? sandboxTheatre(OPS[query.get('op')] ? query.get('op') : 'flanders') : WW1_TH;
const UNITS = TH ? TH.units : UNITS_1917;
// the WW2 batteries on a WW1 page (the career's ridge): their models, pictures and sounds load beside the 1918 ones
const WW2_GUNS = new Set(['lefh18', 'sfh18', 'nbw41', 'k18', 'mrs18', 'karl', 'gustav']);
const WW2_ON_RIDGE = WW1 && UNITS.some((u) => WW2_GUNS.has(u.kind));
// back to the menu (src/ui/menu.js), with this page's entry selected
const MENU = menuHref(query, RANGE ? `range:${WW2 || WW1 ? 'de' : '1917'}` : CAMPAIGN_MISSION ? `campaign:${CAMPAIGN_MISSION.id}` : query.get('tutorial') ? `tutorial:${query.get('tutorial')}` : WW2 ? `op:${TH.opId}` : WW1 ? `ww1:${TH?.opId ?? 'ridge'}` : 'battle:ypres');
// Every mission, operation and lesson is open, in any order; only a campaign mission asked for on the other era's page
// (no theatre for it here) goes back to the menu
const MISPLACED = !query.get('tutorial') && !SANDBOX && !RANGE && !!requestedMission && !CAMPAIGN_MISSION;
// a WW2 special weapon's own operation (the Gustav siege, the Karl, the V-1, the V-2): its whole roster is the player's,
// earned or not, as a campaign mission's is; only the open battle's batteries are earned
const OPERATION = WW2 && !CAMPAIGN_MISSION && TH.opId !== 'flanders';
// the career's open battle (src/research.js, the German tree): the 1918 ridge, where the career's researched lineup
// takes the field with its guns and upgrades, and the battle pays RP and battery points (null: everything else, which
// pays nothing; the WW2 open battle and the British game are sandboxes for now, Britain hidden from the menu)
const RESEARCH_ERA = CAMPAIGN_MISSION || OPERATION || SANDBOX || RANGE ? null : WW1 && TH?.op?.kind === 'battle' ? 'de' : null;
// the career's battle is played at a threat level with its modifiers (src/threat.js; the menu chose them: ?level=&mods=)
const LEVEL = RESEARCH_ERA ? threatOf(+query.get('level') || 1) : null;
const MODS = RESEARCH_ERA ? parseModifiers(query.get('mods')) : [];
// the units that take the field, in order: in the career battle only the lineup's (the theatre holds every pit), so the
// number keys, the tabs' numbers and the first unit shown follow the lineup; elsewhere every unit (set below with UNITS)
let FIELDED = null;

// ---------------------------------------------------------------- game values for the look and feel
// Per gun kind: the camera's eye height over the unit's centre, its default orbit distance, and
// the calibre in inches that drives blast size, shake and sound (the sim's shells carry their own).
const KIND = {
  bl15: { eye: 4.2, dist: 46, calibre: 15 },
  bl92: { eye: 3.2, dist: 60, calibre: 9.2 },
  bl6: { eye: 2.2, dist: 100, calibre: 6 },
  bl60: { eye: 2, dist: 52, calibre: 5 },
  rail: { eye: 4.5, dist: 50, calibre: 18 },
  // the WW2 mode's German pieces and sites
  lefh18: { eye: 2, dist: 85, calibre: 4.13 },
  sfh18: { eye: 2.4, dist: 95, calibre: 5.87 },
  k18: { eye: 3, dist: 75, calibre: 6.8 },
  mrs18: { eye: 3, dist: 70, calibre: 8.3 },
  nbw41: { eye: 1.4, dist: 60, calibre: 5.9 },
  gustav: { eye: 8, dist: 115, calibre: 31.5 },
  bertha: { eye: 4, dist: 46, calibre: 16.5 },
  karl: { eye: 4, dist: 42, calibre: 23.6 },
  v1: { eye: 3, dist: 90, calibre: 22 },
  v2: { eye: 8, dist: 120, calibre: 26 },
  // the WW1 German mode's pieces (bertha above serves both German modes)
  sfh13: { eye: 2.2, dist: 95, calibre: 5.87 },
  m16: { eye: 3, dist: 70, calibre: 8.3 },
  k17: { eye: 2.2, dist: 62, calibre: 4.13 },
  max38: { eye: 4.5, dist: 85, calibre: 15 },
  gamma: { eye: 4, dist: 50, calibre: 16.5 },
  paris: { eye: 5, dist: 135, calibre: 8.3 },
};
// how far the selected unit's camouflage nets are drawn back around each of its pieces (metres)
const NET_CLEAR = { bl15: 17, bl92: 12, bl6: 9, bl60: 9, rail: 32, lefh18: 9, sfh18: 10, k18: 14, mrs18: 14, nbw41: 6, gustav: 40, bertha: 14, karl: 16, v1: 30, v2: 20,
  sfh13: 10, m16: 13, k17: 10, max38: 34, gamma: 16, paris: 45 };
// the muzzle flash light by calibre, in flares.flash units (the fx module sends its own; this is the fallback)
const flashOf = (calibre) => 4.9e4 * calibre * calibre;

async function init() {
  const view = document.getElementById('view');
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  const size = () => ({ w: Math.max(2, view.clientWidth), h: Math.max(2, view.clientHeight) });
  let { w: vw, h: vh } = size();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(vw, vh, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  // far enough for the ridges and the haze; the near plane suits a camera 6 m from a gun
  const camera = new THREE.PerspectiveCamera(50, vw / vh, 0.3, 80000);
  camera.position.set(-1800, 30, -340);

  const startQuality = QUALITY[query.get('quality')] ? query.get('quality') : 'Medium';

  await step(0.05, 'Painting the sky');
  const atmosphere = new Atmosphere(renderer, scene);
  // a night with no moon over the line: gun flashes and flares do the lighting
  atmosphere.setMoon({ dElev: -60, dAz: 100 });
  // the faint blue ambient that keeps the ground readable after dark (a fixed light, never added later)
  const nightHemi = new THREE.HemisphereLight(0x5b6c92, 0x201c14, 0);
  scene.add(nightHemi);

  await step(0.12, 'Surveying the salient');
  const terrain = new Terrain(scene, { quality: startQuality });
  const clouds = new Clouds(scene);

  await step(0.35, 'Laying out the guns');
  const fx = new FX(scene, { maxSmoke: QUALITY[startQuality].maxSmoke });
  fx.ground = terrain.heightAt;
  const flares = new Flares(scene, { ground: terrain.heightAt });
  fx.onFlash = (pos, color, intensity, life, opts) => flares.flash(pos, color, intensity, life, opts);
  const weather = new Weather(scene, null);

  const mods = {
    sim: await optional('./sim/sim.js'),
    panel: await optional('./ui/panel.js'),
    audio: await optional('./audio.js'),
    guns: await optional('./models/guns.js'),
    looks: RESEARCH_ERA ? await optional('./models/looks.js') : null, // the lineup's upgrades on its guns (research.js)
    world: await optional('./world/index.js'),
    craters: await optional('./craters.js'),
    render: await optional('./render/index.js'),
    ww2render: WW2 || WW2_ON_RIDGE ? await optional('./ww2/render.js') : null,
    ww2ui: WW2 ? await optional('./ww2/ui.js') : null,
    ww2tut: WW2 ? await optional('./ww2/tutorial.js') : null,
    ww2gunner: WW2 || WW1 ? await optional('./ww2/gunnerView.js') : null, // (the ridge's guns are served in person too)
    ww2voices: WW2 || WW1 ? await optional('./ww2/voices.js') : null, // (the WW1 open battle speaks with the same clips)
    ww1render: WW1 ? await optional('./ww1/render.js') : null,
    ww1ui: WW1 ? await optional('./ww1/ui.js') : null,
    ww1tut: WW1 ? await optional('./ww1/tutorial.js') : null,
    ww1crews: WW1 ? await optional('./render/crews_ww1.js') : null,
    range: RANGE ? await optional('./ui/range.js') : null,
  };
  // a WW1 page: the 1917 dress and the Bertha's 1917 colours, set before any rig or crew is built
  if (WW1 && mods.guns?.GUN_ERA) mods.guns.GUN_ERA.ww1 = true;
  if (WW1 && mods.ww1crews?.CREW_ERA) mods.ww1crews.CREW_ERA.ww1 = true;
  await mods.guns?.loadGuns?.();
  if (WW2 || WW2_ON_RIDGE) await mods.guns?.loadGuns?.(mods.guns.GUN_KINDS_WW2);
  if (WW1) await mods.guns?.loadGuns?.(mods.guns.GUN_KINDS_WW1);

  // ---------------------------------------------------------------- the world and the gun line
  await step(0.45, 'Digging the trenches');
  let world = null;
  try {
    world = mods.world?.buildWorld?.(scene, terrain, { ww2: WW2 }) ?? null;
  } catch (e) {
    console.warn('buildWorld failed:', e.message);
  }
  let craters = terrain.craters ?? null;
  try {
    if (!craters && mods.craters?.Craters) craters = new mods.craters.Craters(terrain, { quality: startQuality });
  } catch (e) {
    console.warn('Craters failed:', e.message);
  }

  // one rig per piece, on the terrain, facing the unit's zero line; the render layer (phase 2)
  // replaces these with rigs posed from the sim. Until then main recoils them on a fire event.
  const rigs = new Map(); // `${unitId}:${piece}` -> rig
  const unitRoot = {}; // unit id -> Object3D at the centre of the unit (the camera's target)
  for (const u of UNITS) {
    const places = piecePlacements(u);
    const cx = places.reduce((s, p) => s + p.x, 0) / places.length, cz = places.reduce((s, p) => s + p.z, 0) / places.length;
    const g = new THREE.Object3D();
    g.position.set(cx, terrain.heightAt(cx, cz) + KIND[u.kind].eye, cz);
    g.rotation.y = headingFor(u.zero);
    scene.add(g);
    unitRoot[u.id] = g;
    if (!mods.guns?.buildGun) continue;
    for (const p of places) {
      try {
        const rig = mods.guns.buildGun(p.kind);
        if (!rig?.root) throw new Error('no rig');
        rig.root.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
        rig.root.rotation.y = headingFor(p.bearing);
        rig.setElevation?.(0.5);
        scene.add(rig.root);
        rig.rec = 0;
        // the career's upgrades on the lineup's guns, as the hangar shows them: the paint, the relined barrel, the
        // polished breech (models/looks.js); the battle's lineup is the career's, fixed for the page
        if (mods.looks && RESEARCH_ERA) mods.looks.applyLook(rig, p.kind, gunEraOf(p.kind), career.lineupLevels(RESEARCH_ERA)[u.kind] ?? {});
        rigs.set(`${u.id}:${p.i}`, rig);
      } catch (e) {
        console.warn(`buildGun(${p.kind}) failed: ${e.message}`);
      }
    }
  }

  // ---------------------------------------------------------------- the battle
  // The sim runs a demonstration bombardment (attract mode: nothing scored, nothing destroyed)
  // behind the title screen; Take command starts the real one. Without a sim the gun line stands
  // on its own (sandbox keys below).
  let sim = null;
  try {
    if (mods.sim?.Sim) {
      // the pure ground classifier, so the sim stays deterministic (runtime craters only change the look)
      sim = new mods.sim.Sim({ heightAt, los, groundAt: groundKindAt, seed: (Math.random() * 1e9) | 0, theatre: TH });
      sim.newGame({ attract: true });
    }
  } catch (e) {
    console.warn('Sim failed to start:', e.message);
    sim = null;
  }
  let renderLayer = null;
  try {
    renderLayer = mods.render?.createRender?.({ scene, sim, terrain, fx, rigs, camera }) ?? null;
  } catch (e) {
    console.warn('render layer failed:', e.message);
  }

  // the WW2 mode's own pictures: the special weapons' sites and stages, rockets and missiles, aircraft (src/ww2/render.js)
  let ww2r = null;
  try {
    // (on the ridge only its WW2 batteries' scenery, poses and rockets: the 1918 aircraft are ww1/render.js's)
    if ((WW2 || WW2_ON_RIDGE) && mods.ww2render?.createWW2Render) ww2r = mods.ww2render.createWW2Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns: mods.guns, ...(WW1 ? { kinds: WW2_GUNS, air: false } : {}) });
  } catch (e) {
    console.warn('WW2 render failed:', e.message);
  }
  // the WW1 mode's (src/ww1/render.js): the German gun positions, the Langer Max, Gamma and Paris Gun sites, the Paris
  // Gun's shot, the British aircraft. `modeR` is whichever German mode's layer this page has.
  let ww1r = null;
  try {
    if (WW1 && sim && mods.ww1render?.createWW1Render) ww1r = mods.ww1render.createWW1Render({ scene, sim, terrain, fx, rigs, renderLayer, unitRoot, guns: mods.guns });
  } catch (e) {
    console.warn('WW1 render failed:', e.message);
  }
  // (the career's ridge with WW2 batteries has both: each call goes to the two, the WW2 layer's framing first)
  const both = ww2r && ww1r ? [ww2r, ww1r] : null;
  const modeR = both ? {
    set audio(a) { for (const r of both) r.audio = a; },
    focusTask: (id, task) => ww2r.focusTask?.(id, task),
    reselect: () => { for (const r of both) r.reselect?.(); },
    reset: (s) => { for (const r of both) r.reset?.(s); },
    fire: (...a) => both.some((r) => r.fire?.(...a)),
    update: (...a) => { for (const r of both) r.update?.(...a); },
    framing: (id) => ww2r.framing?.(id) ?? ww1r.framing?.(id) ?? null,
  } : ww2r ?? ww1r;

  patchSceneFog(scene);

  await step(0.72, 'Preparing the lens');
  const post = new PostFX(renderer, scene, camera);
  const dynRes = new DynamicResolution(renderer);
  // the blast's refraction ring and the heat shimmer over a muzzle (fx sends pooled vectors: post copies)
  fx.onShock = (pos, radius, speed, strength) => post.shockwave?.(pos, { radius, speed, strength });
  fx.onHeat = (pos, radius, life) => post.heat?.(pos, { radius, life });
  const chase = new ChaseCamera(camera, canvas, { ground: terrain.heightAt });
  let audio = null;
  try {
    audio = mods.audio?.AudioEngine ? new mods.audio.AudioEngine(WW2 ? { ww2: true } : WW1 ? { ww1: true } : undefined) : null;
    // (and on the career's ridge when the lineup has the V-1 or the V-2 off the map: their buzz and their arrival)
    if (WW2 || WW2_ON_RIDGE || (RESEARCH_ERA && ['v1', 'v2'].some((k) => career.unlocked(k)))) audio?.enableWW2?.();
    if (WW1) audio?.enableWW1?.();
    audio?.prepare?.(); // the sample banks render in a worker behind the loading screen
    if (modeR) modeR.audio = audio;
  } catch (e) {
    console.warn('AudioEngine failed:', e.message);
  }
  // sound starts on the first user gesture (browsers refuse earlier), whichever it is; start() also resumes a context
  // the browser made suspended when the battle started it without one
  const wake = () => {
    removeEventListener('pointerdown', wake);
    removeEventListener('keydown', wake);
    try {
      audio?.start();
    } catch (e) {
      console.warn('audio.start failed:', e.message);
    }
  };
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);
  // a close blast's pressure wave reached the listener (after the 343 m/s delay): shake and dazzle land with the sound
  if (audio) {
    audio.onShock = ({ k }) => {
      chase.shake(Math.min(1, k * 1.1));
      post.dazzle?.(Math.min(1, k * 0.7));
    };
  }
  const panelEl = document.getElementById('panel');
  let panel = null;
  let gview = null; // the WW2 gunner's first-person view (src/ww2/gunnerView.js), made below
  if (TH && WW1) mods.ww1ui?.ww1Ui?.(TH);
  else if (TH) mods.ww2ui?.ww2Ui?.(TH);
  if (CAMPAIGN_MISSION) setUiTheatre({ salient: false, sectors: [], mppMax: 120,
    fit: (s) => {
      const points = [...s.units.map(u => u.pos), ...s.targets.map(t => t.pos)];
      const xs = points.map(p => p.x), zs = points.map(p => p.z);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0 + 1500, h: Math.max(3000, z1 - z0 + 1500) };
    } });
  try {
    if (mods.panel?.Panel) {
      panelEl.replaceChildren();
      panel = new mods.panel.Panel(panelEl, {
        audio,
        onSelect: (id) => unitKey(UNITS.findIndex((u) => u.id === id)),
        // (MAN on the guns card: the player's choices for the gunner go with it)
        // (the weapons off the map have no unit: their orders go straight to the sim, which keeps them to the lineup's)
        onCommand: (id, name, args) => (name === 'support' ? !!sim?.command(null, name, args) : canCommand(id) && sim?.command(id, name, name === 'man' ? gunnerArgs(args) : args)),
        keysOff: (e) => !!gview?.claims(e), // at a gun the drill's keys are the gun's, not the console's
        onFocus: (id, task) => modeR?.focusTask?.(id, task), // a Gustav task clicked on the procedure card
        isUnlocked: (u) => canCommand(u.id),
        keyFor: (id) => { const k = (FIELDED ?? UNITS).findIndex(u => u.id === id) + 1; return k >= 1 && k <= 10 ? k % 10 : ''; }, // (keys 1 to 9 and 0 by the units in the field; the 11th on have none)
      });
    }
  } catch (e) {
    console.warn('Panel failed:', e.message);
    panelEl.replaceChildren(Object.assign(document.createElement('div'), { className: 'placeholder', textContent: 'FIRE CONTROL OFFLINE' }));
  }

  // ---------------------------------------------------------------- settings
  const params = {
    quality: startQuality,
    dynamicRes: !navigator.webdriver,
    detailCull: true,
    upscaleSharpen: 0.25,
    timeScale: 1,
    difficulty: DIFFICULTIES.includes(query.get('difficulty')) ? query.get('difficulty') : 'Normal',
    fov: 50,
    hour: Number(query.get('hour') ?? 8.5),
    lockHour: query.get('hour') != null, // a fixed time of day (URL or the slider), not the sim's clock
    weather: WEATHER[query.get('weather')] ? query.get('weather') : MODS.map(modifierOf).find((m) => m.weather)?.weather ?? 'Overcast', // (a modifier's weather)
    exposure: 1.0,
    sunGain: 1.5,
    envIntensity: 0.4,
    nightGlow: 0.55,
    autoExposure: true,
    exposureKey: 0.17,
    toneMapping: 'ACES Filmic',
    grade: !WW2 && GRADES['1917'] ? '1917' : GRADES.Flanders ? 'Flanders' : 'Natural', // WW1 too: the salient in 1918
    ao: true,
    aoIntensity: 1.0,
    bloom: true,
    bloomStrength: 0.3,
    bloomRadius: 0.55,
    bloomThreshold: 3.0,
    bloomCap: 8, // the brightest a texel may enter the bloom (post.js): a low sun's disc no longer whites out the frame
    bloomKnee: 1, // 1: only the light above the threshold blooms (a bright sky stays clear); 0: three's whole texel
    godRays: 0.35,
    lensFlare: 0.4,
    chromatic: 0.003,
    vignette: 0.38,
    grain: 0, // off: a grain over the whole frame reads as dirt on the screen
    sharpen: 0.35,
    shake: true,
    fogDensity: WW2 ? 0.00009 : 0.00014,
    fogFalloff: 0.0007,
    turbidity: 3.6,
    rayleigh: 1.5,
    grass: true,
    trees: true,
    // the WW2 gunner (P or MAN on the guns card): the crew works the posts the player is not at, and the batteries on
    // manual go to their crews while the player is at a gun (back to manual on leaving it)
    gunnerAssist: (() => { try { return localStorage.getItem(GUNNER_ASSIST) !== '0'; } catch { return true; } })(),
    othersAuto: true,
  };
  let resScale = 1;
  let state = 'title'; // title | playing | ended
  let freeCam = false;
  // ?unit=N is the unit id (1 to 5); without it the 1917 battle opens on the 15-inch, the Group's centrepiece
  FIELDED = RESEARCH_ERA ? UNITS.filter((u) => career.lineupKinds(RESEARCH_ERA).includes(u.kind)) : UNITS;
  // (?unit=N: the N-th unit in the field)
  let selected = Math.max(0, UNITS.indexOf(FIELDED[Math.max(0, Math.min(FIELDED.length - 1, Number(query.get('unit') ?? (TH ? 1 : FIELDED.findIndex((u) => u.kind === 'bl15') + 1)) - 1))]));
  if (RANGE && UNITS.some((u) => u.kind === query.get('kind'))) selected = UNITS.findIndex((u) => u.kind === query.get('kind'));
  // the test range's battery: the only one in the field there
  const RANGE_KIND = RANGE ? UNITS[selected].kind : null;
  let following = false; // the camera is on a shell (F)
  let cineClock = 0; // title screen: seconds since the last cut

  // The canvas always has the display's own resolution (up to 2x); the scene renders at the quality
  // preset's pixel ratio times the dynamic scale and the post chain's last pass scales it up (post.js
  // UpscaleShader), so a lower resolution reads as slightly soft, never as blocks.
  const outputPixelRatio = () => Math.min(devicePixelRatio, 2);
  const scenePixelRatio = () => Math.min(devicePixelRatio, QUALITY[params.quality].pixelRatio) * (params.dynamicRes ? resScale : 1);
  const applyPixelRatio = () => {
    renderer.setPixelRatio(outputPixelRatio());
    renderer.setSize(vw, vh, false);
    post.setSize(vw, vh, scenePixelRatio());
  };
  const applyQuality = (name) => {
    const q = QUALITY[name];
    dynRes.reset();
    resScale = 1;
    applyPixelRatio();
    atmosphere.setShadowQuality(q.shadowMap, q.shadowExtent);
    params.ao = q.ao;
    post.gtao.enabled = q.ao;
    post.lens.material.defines.RAY_SAMPLES = q.raySamples;
    post.lens.material.needsUpdate = true;
    post.dof.material.defines.SAMPLES = q.dofSamples;
    post.dof.material.needsUpdate = true;
    fx.setBudget(q.fx);
    terrain.setQuality(name);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  };
  const toneMaps = {
    'ACES Filmic': THREE.ACESFilmicToneMapping,
    AgX: THREE.AgXToneMapping,
    'Khronos Neutral': THREE.NeutralToneMapping,
    Reinhard: THREE.ReinhardToneMapping,
  };

  const gui = new GUI({ title: 'Settings', container: document.getElementById('gui-host') });
  gui.add(params, 'quality', Object.keys(QUALITY)).name('Quality preset').onChange(applyQuality);
  gui.add(params, 'dynamicRes').name('Dynamic resolution').onChange(() => {
    dynRes.reset();
    resScale = 1;
    applyPixelRatio();
  });
  // far batteries' and targets' sub-pixel parts are not drawn (src/render/detail.js); off to compare
  gui.add(params, 'detailCull').name('Hide sub-pixel detail').onChange((v) => { if (renderLayer?.detail) renderLayer.detail.enabled = v; });
  gui.add(params, 'upscaleSharpen', 0, 1, 0.05).name('Upscale sharpening').onChange((v) => { post.upscale.uniforms.uSharp.value = v; });
  const fPlay = gui.addFolder('Game');
  fPlay.add(params, 'difficulty', ['Easy', 'Normal', 'Hard']).name('Difficulty (next game)').listen();
  fPlay.add(params, 'timeScale', TIME_SCALES).name('Time compression ([ ])').listen().onChange((v) => hud.setTimeScale(v));
  fPlay.add(params, 'fov', 30, 80, 1).name('Field of view');
  fPlay.add(params, 'shake').name('Camera shake').onChange((v) => (chase.shakeOn = v));
  if (WW2) {
    fPlay.add(params, 'gunnerAssist').name('At a gun: crew help (C)').listen().onChange((v) => {
      saveAssist(v);
      const st = sim?.gunner?.st;
      if (st && st.assist !== v) sim.command(st.unitId, 'assist', { on: v });
    });
    fPlay.add(params, 'othersAuto').name('At a gun: other batteries to auto');
  }
  const fWorld = gui.addFolder('Time & weather');
  fWorld.add(params, 'hour', 0, 24, 0.05).name('Hour (fixes the clock)').listen().onChange(() => (params.lockHour = true));
  fWorld.add(params, 'lockHour').name('Fixed time of day').listen();
  fWorld.add(params, 'weather', Object.keys(WEATHER)).name('Weather').onChange((v) => weather.set(v)).listen();
  fWorld.close();
  const fLand = gui.addFolder('Landscape');
  fLand.add(params, 'grass').name('Grass').onChange((v) => terrain.grass && (terrain.grass.mesh.visible = v));
  fLand.add(params, 'trees').name('Trees').onChange((v) => terrain.trees && (terrain.trees.group.visible = v));
  fLand.close();
  const fCam = gui.addFolder('Look');
  fCam.add(params, 'grade', Object.keys(GRADES)).name('Color grade').onChange((v) => post.setGrade(v));
  fCam.close();
  const fPost = gui.addFolder('Post processing');
  fPost.add(params, 'autoExposure').name('Auto exposure');
  fPost.add(params, 'exposureKey', 0.05, 0.6, 0.01).name('Exposure key');
  fPost.add(params, 'exposure', 0.1, 3, 0.01).name('Exposure bias');
  fPost.add(params, 'envIntensity', 0, 2, 0.01).name('Sky light (IBL)');
  fPost.add(params, 'nightGlow', 0, 2, 0.01).name('Night ambient');
  fPost.add(params, 'sunGain', 0.3, 3, 0.01).name('Sun intensity');
  fPost.add(params, 'toneMapping', Object.keys(toneMaps)).name('Tone mapping');
  fPost.add(params, 'ao').name('GTAO').onChange((v) => (post.gtao.enabled = v)).listen();
  fPost.add(params, 'aoIntensity', 0, 2, 0.01).name('AO intensity');
  fPost.add(params, 'bloom').name('Bloom');
  fPost.add(params, 'bloomStrength', 0, 2, 0.01).name('Bloom strength');
  fPost.add(params, 'bloomRadius', 0, 1, 0.01).name('Bloom radius');
  fPost.add(params, 'bloomThreshold', 0, 10, 0.01).name('Bloom threshold');
  fPost.add(params, 'bloomCap', 3, 200, 1).name('Bloom cap (sun glare)');
  fPost.add(params, 'bloomKnee', 0, 1, 0.01).name('Bloom: above threshold only');
  fPost.add(params, 'godRays', 0, 3, 0.01).name('God rays');
  fPost.add(params, 'lensFlare', 0, 3, 0.01).name('Lens flare');
  fPost.add(params, 'chromatic', 0, 0.05, 0.001).name('Chromatic aberration');
  fPost.add(params, 'vignette', 0, 1, 0.01).name('Vignette');
  fPost.add(params, 'grain', 0, 0.15, 0.001).name('Film grain');
  fPost.add(params, 'sharpen', 0, 1.5, 0.01).name('Sharpen');
  fPost.close();
  const fAtmo = gui.addFolder('Atmosphere');
  fAtmo.add(params, 'fogDensity', 0, 0.0006, 0.000005).name('Haze density');
  fAtmo.add(params, 'fogFalloff', 0, 0.01, 0.0001).name('Haze height falloff');
  fAtmo.add(params, 'turbidity', 0, 20, 0.1).name('Turbidity').onChange(() => (atmosphere.lastEnvKey = ''));
  fAtmo.add(params, 'rayleigh', 0, 4, 0.01).name('Rayleigh').onChange(() => (atmosphere.lastEnvKey = ''));
  fAtmo.close();
  post.setGrade(params.grade);

  const guiHost = document.getElementById('gui-host');
  guiHost.classList.add('hidden');
  document.getElementById('gear').addEventListener('click', () => guiHost.classList.toggle('hidden'));

  const stats = new Stats();
  stats.dom.classList.add('stats');
  view.appendChild(stats.dom);

  // ---------------------------------------------------------------- units and camera
  // every unit is the player's but in the career's open battle, where only the lineup's (which is all the sim fields)
  const canCommand = (id) => (RANGE ? UNITS.find((u) => u.id === id)?.kind === RANGE_KIND : state === 'tutorial' || !RESEARCH_ERA || FIELDED.some((u) => u.id === id));
  const selectUnit = (i) => {
    if (i < 0 || i >= UNITS.length) return;
    if ((state === 'playing' || state === 'ended') && !canCommand(UNITS[i].id)) {
      hud.hint(`Research the ${UNITS[i].name} first (main menu, Research).`, 2500);
      return;
    }
    selected = i;
    const u = UNITS[i];
    freeCam = false;
    following = false;
    chase.free(false);
    chase.releaseShot();
    chase.setTarget(unitRoot[u.id]);
    chase.goalDist = unitDist[u.id] ?? KIND[u.kind].dist;
    // a low three-quarter view from behind the right shoulder: the gun in profile, the blast out of the muzzle
    chase.goalYaw += 0.75;
    chase.goalPitch = 0.17;
    hud.setUnit(u.name, `\u201c${u.callsign}\u201d, ${u.battery}`, WIP_KINDS.has(u.kind) ? WIP_LINE : '');
    renderLayer?.select?.(u.id);
    modeR?.reselect?.(); // a V-weapon site frames its step again
    drumfire.events.select?.(u.id, i);
  };
  // F: ride the selected unit's newest shell in flight to its burst; back to the unit when it ends
  const backToUnit = () => {
    following = false;
    if (state === 'title') chase.cine(true);
  };
  const followShell = (shell) => {
    freeCam = false;
    following = true;
    chase.cine(false);
    chase.followShell(shell, { onBurst: backToUnit });
    hud.hint('Riding the shell (F: back to the gun)', 2200);
  };
  // the Paris Gun's shot (ww1/render.js): the camera rides the shell up out of the battle, then comes back to the gun
  if (ww1r) Object.assign(ww1r, {
    canRide: (unitId) => state !== 'title' && !freeCam && !following && UNITS[selected]?.id === unitId,
    ride: (shell) => followShell(shell),
    riding: (shell) => following && chase.shell?.obj === shell,
    leave: (text) => { chase.releaseShot(); backToUnit(); if (text) hud.hint(text, 2600); },
  });
  const newestShell = (unitId) => {
    let best = null;
    const list = sim?.shells ?? fakeShells;
    // (a sandbox's fake shells carry no unit; the sim's own shells without one are the WW1 division's field guns)
    for (const s of list) if (s.alive && s.own !== false && (s.unitId === unitId || (list === fakeShells && s.unitId == null)) && (!best || (s.id ?? 0) > (best.id ?? 0))) best = s;
    return best;
  };
  const setTimeScale = (k) => {
    params.timeScale = k;
    hud.setTimeScale(k);
  };
  const stepTime = (d) => setTimeScale(TIME_SCALES[Math.min(TIME_SCALES.length - 1, Math.max(0, TIME_SCALES.indexOf(params.timeScale) + d))]);
  const tsEl = document.getElementById('timescale');
  tsEl.addEventListener('pointerdown', (e) => e.stopPropagation()); // no camera drag from the buttons
  document.getElementById('ts-up').addEventListener('click', () => stepTime(1));
  document.getElementById('ts-down').addEventListener('click', () => stepTime(-1));
  document.getElementById('ts-val').addEventListener('click', () => setTimeScale(1));

  // ---------------------------------------------------------------- the WW2 gunner (src/ww2/gunner.js, gunnerView.js)
  // P (or MAN on the guns card) takes the player in person to a gun of the selected battery: the camera at the eyes of
  // the man at his post, the drill's keys, the gun card over the view; the console beside it still commands the Group.
  const saveAssist = (v) => { try { localStorage.setItem(GUNNER_ASSIST, v ? '1' : '0'); } catch { /* this session only */ } };
  function gunnerArgs(args = {}) {
    return { assist: params.gunnerAssist, othersAuto: params.othersAuto, ...args };
  }
  const gunnerSend = (name, args = {}) => {
    const st = sim?.gunner?.st;
    if (!st) return;
    sim.command(st.unitId, name, name === 'man' ? gunnerArgs(args) : args);
    if (name === 'assist' && sim.gunner.st) {
      params.gunnerAssist = sim.gunner.st.assist;
      saveAssist(params.gunnerAssist);
      hud.hint(params.gunnerAssist ? 'Crew help on: the men at the other posts do their work' : 'Crew help off: nothing at another post moves until you go there', 2600);
      audio?.ui?.('click');
    }
  };
  const toggleMan = () => {
    if (!(WW2 || WW1) || !sim?.gunner || state !== 'playing') return;
    const st = sim.gunner.st;
    if (st) { sim.command(st.unitId, 'unman'); return; }
    const u = UNITS[selected];
    if (canCommand(u.id)) sim.command(u.id, 'man', gunnerArgs());
  };
  if ((WW2 || WW1) && sim?.gunner && mods.ww2gunner?.GunnerView) {
    try {
      gview = new mods.ww2gunner.GunnerView({ camera, canvas, root: view, render: renderLayer, send: gunnerSend, onButton: () => toggleMan() });
    } catch (e) {
      console.warn('gunner view failed:', e.message);
    }
  }
  // ---------------------------------------------------------------- the German crew voices (src/ww2/voices.js)
  // German callouts at the guns (spatialised, shouted) and on the field telephone and radio, with subtitles: only on the
  // WW2 open battle's and Karl-Gerät's pages and the WW1 open battle's (VOICED_OPS; 1918 reuses the WW2 clips, `era`);
  // every other page has no voices object at all. V or the console's VOICES button switches them (localStorage
  // drumfire.voices); the clips are decoded while the page loads.
  let voices = null;
  try {
    if ((WW2 || WW1) && audio && mods.ww2voices?.VOICED_OPS?.has(TH?.opId)) {
      voices = new mods.ww2voices.CrewVoices({
        audio, view, panel: panelEl, radio: (text, kind) => hud.radio(text, kind),
        selectedId: () => (gview?.active && sim?.gunner?.st ? sim.gunner.st.unitId : UNITS[selected]?.id),
        active: () => state === 'playing' || state === 'tutorial',
        era: WW1 ? 'ww1' : 'ww2',
      });
      voices.load();
    }
  } catch (e) {
    console.warn('crew voices failed:', e.message);
    voices = null;
  }
  const NEAR = camera.near, IDLE = { az: 0, el: 0, fine: false, work: false };
  // the sim put the player at a gun or took him off it (a command, the gun knocked out, a new game): the camera follows
  const syncGunner = () => {
    if (!gview) return;
    const st = sim?.gunner?.st;
    if (st && !gview.active) {
      freeCam = false;
      chase.free(false);
      gview.enter(sim);
      camera.near = 0.1; // the hands and the handwheels are a forearm away
      camera.updateProjectionMatrix();
      hud.hint('At the gun: 1 to 4 the posts, E the work at yours, P to leave', 3200);
    } else if (!st && gview.active) {
      gview.leave();
      camera.near = NEAR;
      camera.updateProjectionMatrix();
      chase.enabled = true;
      if (!following) selectUnit(selected);
    }
  };

  // The camera's anchor on each unit: the centre of the guns the sim fields, not of every pit (a career's lineup may
  // field one gun of four, the test range always one), and how far back the camera stands: the battery's distance, or
  // closer for fewer guns (a little over twice a gun's size for one, more for the spread of several)
  const unitDist = {}; // unit id -> the camera's distance
  const centreUnits = () => {
    const box = new THREE.Box3(), size = new THREE.Vector3();
    for (const u of UNITS) {
      const g = unitRoot[u.id], all = piecePlacements(u), su = sim?.unitById?.(u.id);
      const ps = su?.pieces?.length ? su.pieces.map((p) => p.pos) : all;
      const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.z, 0) / ps.length;
      g.position.set(cx, terrain.heightAt(cx, cz) + KIND[u.kind].eye, cz);
      unitDist[u.id] = KIND[u.kind].dist;
      if (!su || ps.length >= all.length) continue;
      const rig = rigs.get(`${u.id}:${su.pieces[0].i}`);
      const len = rig ? box.setFromObject(rig.root).getSize(size).length() : 8;
      let spread = 0;
      for (const a of ps) for (const b of ps) spread = Math.max(spread, Math.hypot(a.x - b.x, a.z - b.z));
      unitDist[u.id] = Math.min(KIND[u.kind].dist, Math.max(14, len * 2.2, spread * 1.6));
    }
  };
  // a new battle (the real one, a lesson's range or the demonstration): the sim, then everything that remembers the last
  const newBattle = (opts) => {
    if (!sim) return;
    flares.clear();
    fx.clearLitter?.();
    sim.newGame(opts);
    centreUnits();
    renderLayer?.reset?.(sim);
    modeR?.reset?.(sim);
    panel?.reset?.();
    patchSceneFog(scene);
    // the new game's target models (and any scenery built again) go to the GPU now, not when first seen
    warmUp(renderer, scene, camera);
  };
  // a unit key or tab: a lesson keeps the player on the units it is about
  const unitKey = (i) => {
    if (tutorial?.active && !tutorial.run.def.units.includes(UNITS[i]?.id)) {
      hud.hint('This lesson does not use that unit. Exit it to switch freely.', 1800);
      return;
    }
    selectUnit(i);
  };

  const start = () => {
    if (!UNITS.some(u => canCommand(u.id))) return;
    payOut(false); // a battle given up for a new one pays what it had earned
    paid = false;
    resetRewards();
    state = 'playing';
    if (!canCommand(UNITS[selected].id)) selected = UNITS.findIndex(u => canCommand(u.id));
    hud.hideEnd();
    hud.showTitle(false);
    chase.autoOrbit = 0;
    chase.cine(false);
    following = false;
    newBattle({ difficulty: LEVEL ? 'Normal' : params.difficulty, attract: false, seed: (Math.random() * 1e9) | 0,
      ...(RESEARCH_ERA ? { ...career.battle(RESEARCH_ERA), level: LEVEL.n, modifiers: MODS } : { allowedKinds: CAMPAIGN_MISSION ? CAMPAIGN_MISSION.roster : null }) });
    if (CAMPAIGN_MISSION) {
      sim.director.update(0);
      selected = UNITS.findIndex(u => u.kind === CAMPAIGN_MISSION.reward);
    }
    selectUnit(selected);
    if (WW1 && TH) hud.toast(TH.op?.short ?? 'Open battle', TH.op?.kind === 'battle' ? 'German heavy artillery, Flanders, 1918' : TH.op.sub, 4200);
    else if (TH) hud.toast(TH.op.title, TH.op.sub, 4200);
    else hud.toast('Drumfire', 'Heavy artillery, Ypres salient, 1917', 3200);
    hud.setScore(0);
    try {
      audio?.start?.();
    } catch (e) {
      console.warn('audio.start failed:', e.message);
    }
    hud.radio(WW2 ? `Arko: ${TH.op.short}. All units, stand to.` : WW1 && TH ? (TH.op?.kind === 'battle' ? 'Arko: all batteries of the Gruppe, stand to. Feuerbereitschaft melden; the observers report at first light.' : 'Armee to Wilhelm: Feuerbereitschaft melden. The orders follow through the day.') : 'Group HQ: all batteries, stand to. Observers report at first light.', 'info');
    drumfire.events.start?.(params.difficulty);
  };

  // the test range (src/ui/range.js): the scripted range with the battery asked for, the card on the left of the view
  let range = null;
  const startRange = () => {
    state = 'playing';
    hud.hideEnd();
    hud.showTitle(false);
    chase.autoOrbit = 0;
    chase.cine(false);
    following = false;
    range ??= mods.range?.mountRange({
      sim: () => sim, units: UNITS, kind: RANGE_KIND, selectedId: () => UNITS[selected].id, select: (i) => selectUnit(i), hint: (t, ms) => hud.hint(t, ms),
      // the range again (a new lineup): the scripted game, the same battery in view
      restart: ({ loadout }) => {
        newBattle({ scripted: true, range: true, difficulty: 'Normal', attract: false, seed: (Math.random() * 1e9) | 0, loadout });
        setTimeScale(params.timeScale);
        selectUnit(selected);
      },
      // a link to this range with these settings (null drops one)
      href: (set) => {
        const p = new URLSearchParams(location.search);
        for (const [k, v] of Object.entries(set)) if (v == null) p.delete(k); else p.set(k, v);
        return `index.html?${p}`;
      },
    }, query) ?? null;
    if (!range) { start(); return; } // no range module: the battle stands in
    range.begin();
    drumfire.onFrame.push(() => { range.update(); range.refresh(); });
    try {
      audio?.start?.();
    } catch (e) {
      console.warn('audio.start failed:', e.message);
    }
    hud.toast('Test range', `${UNITS[selected].name}: nothing is scored or paid`, 3200);
    hud.radio('Range officer: the range is clear. Lay on any target and fire when ready.', 'info');
  };

  // the way back to the menu (src/ui/menu.js): the game page is left, the menu builds nothing of the battlefield
  const toMenu = () => { if (!leaveBattle()) location.href = MENU; };
  // the end card's Research: the menu's Research screen of this era, to spend what the battle paid
  document.getElementById('end-research')?.addEventListener('click', () => {
    location.href = menuHref(query, CAMPAIGN_MISSION ? `campaign:${CAMPAIGN_MISSION.id}` : WW2 ? `op:${TH.opId}` : 'battle:ypres', 'research');
  });
  const returnMenu = document.createElement('button');
  returnMenu.id = 'return-menu'; returnMenu.type = 'button'; returnMenu.textContent = 'Main menu';
  returnMenu.addEventListener('click', toMenu);
  document.getElementById('view').append(returnMenu);
  const updateCampaignObjectives = mountCampaignObjectives();

  // ---------------------------------------------------------------- tutorials (src/tutorial.js)
  // A lesson runs the sim in scripted mode and ALWAYS in daylight: the sun follows the sim clock (held at 10:00),
  // ignoring ?hour= and the slider, and the weather is Clear or Overcast; the player's settings come back on leaving.
  const DAY_WEATHER = ['Clear', 'Overcast'];
  let saved = null;
  let lesson = query.get('tutorial'); // the lesson running (the next one may follow on this page)
  const setWeather = (w, now = false) => {
    params.weather = w;
    weather.set(w, now);
  };
  const tutorial = sim
    ? new Tutorials({
        sim,
        hud,
        defs: WW2 ? mods.ww2tut?.WW2_TUTORIALS ?? [] : WW1 ? mods.ww1tut?.WW1_TUTORIALS ?? [] : undefined,
        host: {
          // a WW2 lesson on another operation: load the page there (the theatre is fixed per page)
          redirect(def) {
            if (!WW2 || !def.op || def.op === TH.opId) return false;
            location.href = `index.html?mode=ww2&op=${def.op}&tutorial=${def.id}${query.get('quality') ? `&quality=${query.get('quality')}` : ''}`;
            return true;
          },
          enter(def) {
            lesson = def.id;
            state = 'tutorial';
            hud.showTitle(false);
            hud.hideEnd();
            chase.autoOrbit = 0;
            chase.cine(false);
            following = false;
            saved ??= { weather: params.weather };
            setWeather('Clear', true); // sun and shadow for the lesson; the gear menu may still pick Overcast
            newBattle({ scripted: true, difficulty: 'Normal', attract: false, seed: (Math.random() * 1e9) | 0 });
            setTimeScale(1);
            hud.setScore(0);
            try {
              audio?.start?.();
            } catch (e) {
              console.warn('audio.start failed:', e.message);
            }
            selectUnit(UNITS.findIndex((u) => u.id === def.unit));
            applySun(clockHour(), true);
          },
          leave() {
            following = false;
            chase.releaseShot();
            setTimeScale(1);
            if (saved) setWeather(saved.weather, true);
            saved = null;
            // a lesson is left for the menu, with the last lesson selected
            location.href = menuHref(query, `tutorial:${lesson}`);
          },
          select: (id) => selectUnit(UNITS.findIndex((u) => u.id === id)),
          selectedId: () => UNITS[selected].id,
          cam: () => ({ yaw: chase.goalYaw, dist: chase.goalDist }),
          nudgeCam: () => {
            chase.goalYaw += 0.8;
            chase.goalDist *= 0.9;
          },
          scale: () => params.timeScale,
          setScale: (k) => setTimeScale(k),
          follow: () => {
            const sh = newestShell(UNITS[selected].id);
            if (sh) followShell(sh);
            return !!sh;
          },
          following: () => following,
          hint: (text) => hud.hint(text, 3500),
          frame: (dt, draw) => frame(dt, draw),
        },
      })
    : null;

  // ---------------------------------------------------------------- sandbox
  // ?sandbox=1: no title, straight to the gun line. B fires a fake 15-inch blast at the selected
  // unit and a fake shell that bursts 300 m ahead; N a burst 300 m ahead at once; K a star shell, L
  // a Very light, J an SOS rocket over the selected unit's front. Meant for every agent's testing.
  const fakeShells = [];
  const fakeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20180c, fog: false }));
  fakeMesh.visible = false;
  scene.add(fakeMesh);
  const _m = new THREE.Vector3(), _d = new THREE.Vector3(), _b = new THREE.Vector3();
  const unitFacing = (u, out) => out.set(Math.sin(u.zero), 0, -Math.cos(u.zero));
  const sandboxBlast = (cal = 15) => {
    const u = UNITS[selected];
    const rig = rigs.get(`${u.id}:0`);
    const dir = unitFacing(u, _d);
    if (rig) rig.root.updateMatrixWorld(true);
    const muzzle = rig?.anchors?.muzzle ? rig.anchors.muzzle.getWorldPosition(_m) : _m.copy(unitRoot[u.id].position).addScaledVector(dir, 6);
    const aim = _b.copy(dir).multiplyScalar(0.8).setY(0.6).normalize();
    // the fake piece carries the real one's lay: the render layer poses the rig from it (undefined angles made NaN)
    const sp = sim?.unitById?.(u.id)?.pieces?.[0];
    handlers.fire({ id: u.id, kind: u.kind }, { i: 0, kind: u.kind, pos: muzzle, az: sp?.az ?? 0, el: sp?.el ?? 0.3 }, { calibre: cal, vel: { x: aim.x * 300, y: aim.y * 300, z: aim.z * 300 } });
    // a shell on an arc to a point 300 m ahead, 2.6 s of flight
    const from = muzzle.clone();
    const to = muzzle.clone().addScaledVector(dir, 300);
    to.y = terrain.heightAt(to.x, to.z);
    const shell = { id: Date.now(), own: true, unitId: u.id, calibre: cal, pos: from.clone(), prev: from.clone(), vel: new THREE.Vector3(), alive: true, t: 0, tof: 2.6, from, to };
    fakeShells.push(shell);
    audio?.shell?.(shell);
    return shell;
  };
  const sandboxBurst = (cal = 9.2, ahead = 300) => {
    const u = UNITS[selected];
    const dir = unitFacing(u, _d);
    const p = new THREE.Vector3().copy(unitRoot[u.id].position).addScaledVector(dir, ahead);
    p.y = terrain.heightAt(p.x, p.z);
    handlers.shellBurst({ calibre: cal, own: true }, p, { calibre: cal, fuze: 'instant', crater: cal * 0.5, ground: terrain.groundAt?.(p.x, p.z) ?? 'mud', hit: null, near: null, own: true });
  };
  const stepFakeShells = (dt) => {
    for (let i = fakeShells.length - 1; i >= 0; i--) {
      const s = fakeShells[i];
      if (!s.alive) {
        if ((s.dead = (s.dead ?? 0) + dt) > 8) fakeShells.splice(i, 1);
        continue;
      }
      s.t += dt;
      s.prev.copy(s.pos);
      const k = Math.min(1, s.t / s.tof);
      s.pos.lerpVectors(s.from, s.to, k);
      s.pos.y += 4 * 60 * k * (1 - k); // an arc 60 m high
      s.vel.copy(s.pos).sub(s.prev).divideScalar(Math.max(dt, 1e-3));
      if (k >= 1) {
        s.alive = false;
        sandboxBurst(s.calibre, 300);
      }
    }
    const live = fakeShells.find((s) => s.alive);
    fakeMesh.visible = !!live;
    if (live) fakeMesh.position.copy(live.pos);
  };

  // ---------------------------------------------------------------- sim events
  // One table: sim.events.<name> runs the handler below, then drumfire.hooks.<name> (the render
  // layer and tests hang their own work there). Every system is feature-detected: a missing method is
  // skipped, never an error. `near` helpers turn a world point into distance from the camera.
  const nearD = (p) => camera.position.distanceTo(p);
  const asVec = (p, out) => out.set(p.x, p.y ?? 0, p.z);
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _dir = new THREE.Vector3();
  const seenShells = new WeakSet();
  const handlers = {
    // a gun fired: muzzle blast, light, recoil, sound, shake
    fire(unit, piece, shell) {
      if (modeR?.fire?.(unit, piece, shell, atmosphere.night)) return;
      const cal = shell?.calibre ?? KIND[piece?.kind ?? unit?.kind]?.calibre ?? 6;
      const rig = rigs.get(`${unit.id}:${piece?.i ?? 0}`);
      const night = atmosphere.night;
      const v = shell?.vel;
      if (v && (v.x || v.y || v.z)) _dir.set(v.x, v.y, v.z).normalize();
      else unitFacing(UNITS.find((u) => u.id === unit.id) ?? UNITS[0], _dir).setY(0.4).normalize();
      const m = renderLayer?.onFire?.(unit, piece);
      if (m) {
        _p.set(m.x, m.y, m.z);
        _dir.set(m.dx, m.dy, m.dz);
      } else if (rig?.anchors?.muzzle) {
        rig.root.updateMatrixWorld(true);
        rig.anchors.muzzle.getWorldPosition(_p);
      } else asVec(piece?.pos ?? unit.pos, _p).addScaledVector(_dir, 4);
      fx.gunBlast?.(_p, _dir, cal, { night });
      audio?.gun?.(_p, cal);
      if (rig && !renderLayer) rig.rec = 1;
      // with sound running the shake and dazzle arrive with the pressure wave (audio.onShock)
      if (!audio?.ctx) {
        chase.shake(blastTrauma(cal, nearD(_p)));
        post.dazzle?.(blastTrauma(cal, nearD(_p), 0.6) * 0.8);
      }
      if (!fx.gunBlast) fx.onFlash?.(_p, 0xffc070, flashOf(cal), 0.25);
    },
    load(unit, piece, stepName) {
      const p = asVec(piece?.pos ?? unit.pos, _p);
      if (voices?.replacesBark(unit, piece, stepName)) return; // the voiced gun reports "ready" in German (ww2/voices.js)
      audio?.load?.(stepName, p, piece?.kind ?? unit.kind);
    },
    // any burst, own or enemy
    shellBurst(shell, pos, info = {}) {
      tutorial?.onBurst(shell, pos, info);
      const cal = info.calibre ?? shell?.calibre ?? 6;
      asVec(pos, _q);
      if (info.fuze === 'shrapnel' && fx.shrapnel) fx.shrapnel(_q, cal);
      else fx.shellBurst?.(_q, { calibre: cal, fuze: info.fuze, ground: info.ground, crater: info.crater });
      if (info.crater > 0 && info.ground !== 'water') {
        try {
          craters?.add?.(_q.x, _q.z, info.crater, info.crater * 0.4, { scorch: Math.min(1.5, 0.6 + cal / 15), water: info.ground === 'water' });
        } catch (e) {
          console.warn('craters.add failed:', e.message);
        }
      }
      audio?.burst?.(_q, cal, { fuze: shell?.kind === 'v2' ? 'v2' : info.fuze, ground: info.ground, kind: shell?.kind });
      renderLayer?.onBurst?.(_q, info);
      const d = nearD(_q);
      // re-seat the dressing on the new crater, only where it is built in detail (near the camera)
      if (info.crater > 0 && d < 1400) world?.invalidate?.(_q.x, _q.z, info.crater + 6);
      if (!audio?.ctx) chase.shake(blastTrauma(cal, d, 0.9));
      if (d < 120 * (cal / 9) + 40) {
        post.shockwave?.(_q, { radius: 40 + cal * 12, speed: 343, strength: Math.min(1, 0.4 + cal / 20) });
        if (!audio?.ctx) post.dazzle?.(Math.min(1, (1 - d / (120 * (cal / 9) + 40)) * 0.9));
      }
    },
    enemyFire(src, part, shell) {
      const m = renderLayer?.onEnemyFire?.(src, part, shell);
      if (!m) return;
      _p.set(m.x, m.y, m.z);
      fx.gunBlast?.(_p, _dir.set(m.dx, m.dy, m.dz), m.calibre, { night: atmosphere.night });
      audio?.gun?.(_p, m.calibre);
    },
    lift(k, barrage) {
      if (sim?.attract) return;
      hud.hint(`The barrage lifts (${k}${barrage?.kMax ? ` of ${barrage.kMax}` : ''})`, 2200);
      audio?.ui?.('whistle');
    },
    incoming(shell) {
      audio?.incoming?.(shell);
    },
    secondary(pos, sz) {
      asVec(pos, _q);
      fx.cookOff?.(_q, sz);
      audio?.cookOff?.(_q, sz);
      if (!audio?.ctx) chase.shake(blastTrauma(8 + 4 * sz, nearD(_q), 0.8));
    },
    flare(pos, kind) {
      flares.launch(asVec(pos, _q), kind);
      audio?.flare?.(_q, kind);
    },
    sos(sector) {
      if (sim?.attract) return;
      hud.hint('SOS: red rockets over the front', 2500);
      panel?.sos?.(sector?.id ?? sector);
    },
    pieceHit(unit, piece) {
      asVec(piece?.pos ?? unit.pos, _q);
      fx.explosion?.(_q, 1.2, { debris: true });
    },
    pieceDestroyed(unit, piece) {
      asVec(piece?.pos ?? unit.pos, _q);
      fx.cookOff?.(_q, 1.5);
      audio?.cookOff?.(_q, 1.5);
      chase.shake(blastTrauma(10, nearD(_q)));
    },
    targetDestroyed(target, by) {
      if (sim?.attract) return;
      hud.kill(`${target.name}: destroyed`, target.points ?? 10, by != null && by !== UNITS[selected].id);
      setScore();
    },
    report(mission, report) {
      if (sim?.attract) return;
      hud.radio(report.text, 'wireless');
      audio?.ui?.('wireless');
    },
    mission(mission, change) {
      if (sim?.attract) return;
      if (change === 'new') {
        hud.hint(`New fire mission: ${mission.title}`, 3000);
        audio?.ui?.('phone');
      }
    },
    radio(text, kind) {
      if (sim?.attract) return;
      hud.radio(text, kind);
      panel?.radio?.(text, kind);
      if (kind === 'phone' || kind === 'wireless') audio?.ui?.(kind);
    },
    phase(n, title, sub) {
      if (sim?.attract) return;
      hud.toast(title, sub, 5000);
      audio?.ui?.('bell');
    },
    state(s) {
      if ((s === 'victory' || s === 'defeat') && !sim.attract && state === 'playing') endGame(s);
    },
    // the battle's pay as it is earned (sim.credit): the reward feed and the career (onReward, above)
    reward(id, pts, why) { onReward(id, pts, why); },
    // the WW2 gunner (src/ww2/gunner.js): a new fire command rings at the gun, a wheel comes onto its mark, a pull refused
    gunner(what, a) {
      if (what === 'order') {
        audio?.ui?.('feldfernsprecher');
        if (sim.gunner.st?.post !== 'cmd') hud.hint('A new fire command for the gun: the Geschützführer reads it back (1)', 2600);
      } else if (what === 'mark') audio?.ui?.('click');
      else if (what === 'nofire') gview?.flash(`Cannot fire: ${a}.`);
    },
  };
  const drumfire = { events: {}, hooks: {}, onFrame: [] };
  window.__drumfire = drumfire;
  if (sim) {
    sim.events = sim.events || {};
    for (const [name, fn] of Object.entries(handlers)) {
      sim.events[name] = (...args) => {
        try {
          fn(...args);
        } catch (e) {
          console.warn(`event ${name}: ${e.message}`);
        }
        drumfire.hooks[name]?.(...args);
      };
    }
    // the title screen's cutaways: a gun fires in the demonstration battle, the camera rides its shell
    const baseFire = sim.events.fire;
    sim.events.fire = (unit, piece, shell) => {
      baseFire(unit, piece, shell);
      if (sim.attract && state === 'title' && !following && cineClock > 9 && shell) {
        const i = UNITS.findIndex((x) => x.id === unit.id);
        if (i >= 0) {
          if (i !== selected) selectUnit(i);
          cineClock = 0;
          followShell(shell);
        }
      }
    };
    voices?.attach(sim); // the crew voices chain onto the events above (src/ww2/voices.js)
  }
  const setScore = () => {
    const sc = sim?.score;
    hud.setScore(typeof sc === 'number' ? sc : sc?.points ?? 0);
  };
  // ---------------------------------------------------------------- the battle's rewards (research.js battleReward)
  // The career battle pays as it is earned (War Thunder's and Enlisted's way): every kill, knock-out, burst among the
  // enemy's men and mission done (sim.credit -> events.reward) shows in the reward feed (ui/rewards.js) and goes into
  // the career about once a second (payLive: each battery's points so far over what it had, the same to the research
  // target); the time in action and the victory go in at the end (payOut), when the battle is won, lost, left early
  // (Main menu: its summary first, leaveBattle), given up for a new one, or the page is closed (the summary is kept for
  // the menu, ui/summary.js). So leaving early keeps everything earned.
  let paid = true, left = false, liveDue = false, liveAt = 0, paidBp = {}, log = null, before = null;
  const rawNow = () => performance.now();
  const feed = RESEARCH_ERA ? createRewardFeed(document.getElementById('view')) : null;
  const payK = () => sim?.level?.pay ?? PAY[sim?.difficultyName] ?? 1;
  const kindNameOf = (k) => BATTERIES.find((b) => b.kind === k)?.name ?? k;
  const whoOf = (id) => (typeof id === 'string' && id.startsWith('support:') ? kindNameOf(id.slice(8)) : sim?.unitById(id)?.callsign ?? '');
  const resetRewards = () => {
    feed?.reset();
    paidBp = {};
    liveDue = false;
    left = false;
    log = { kill: 0, part: 0, men: 0, mission: 0, hit: 0, top: new Map() };
    const t = RESEARCH_ERA ? career.targetOf(RESEARCH_ERA) : null;
    before = { researched: new Set(career.researched), target: t, share: t ? career.researchShare(t) : 0 };
  };
  const onReward = (id, pts, why) => {
    if (!feed || !log || paid || !sim || sim.attract || sim.scripted) return;
    const p = pts * payK(), who = whoOf(id), act = why?.act ?? 'hit';
    if (act === 'hit') log.hit += p;
    else if (act === 'men') log.men += why.n ?? 0;
    else if (act !== 'mission') log[act]++;
    if (act !== 'hit') {
      // the biggest actions for the summary (a mission's shares gather into one line)
      const w = rewardWords(why), key = act === 'mission' ? `m:${why.title}` : `${act}:${why?.id ?? ''}:${log.top.size}`;
      const e = log.top.get(key) ?? { act: w.act, what: w.what, who, pts: 0, kind: act };
      e.pts += p;
      log.top.set(key, e);
    }
    feed.push(why, p, who);
    liveDue = true;
  };
  // what each battery has earned over what it had been paid: into the career now
  const payLive = () => {
    liveDue = false;
    liveAt = rawNow();
    if (paid || !RESEARCH_ERA || !sim || sim.attract || sim.scripted) return;
    const r = battleReward(sim, { won: false }), d = {};
    let sum = 0;
    for (const [k, v] of Object.entries(r.batteries)) { const x = v - (paidBp[k] ?? 0); if (x > 0) { d[k] = x; paidBp[k] = v; sum += x; } }
    if (sum > 0) career.gain(RESEARCH_ERA, { rp: sum, batteries: d });
  };
  // the end of the battle's pay: the last kills, the time in action, the victory; the battle counted. Returns the reward
  const payOut = (won) => {
    if (paid || !RESEARCH_ERA || state !== 'playing' || !sim || sim.attract || sim.scripted) return null;
    payLive();
    paid = true;
    const r = battleReward(sim, { won }), rest = {};
    let sum = 0;
    for (const [k, v] of Object.entries(r.batteries)) { const x = v - (paidBp[k] ?? 0); if (x > 0) { rest[k] = x; sum += x; } }
    career.gain(RESEARCH_ERA, { rp: sum + r.time + r.win, batteries: rest }, false);
    career.countBattle(RESEARCH_ERA);
    return r;
  };
  // the battle in a record for the summary page (ui/summary.js)
  const battleRecord = (r, outcome, opened = 0) => {
    const tgt = career.targetOf(RESEARCH_ERA);
    const top = [...(log?.top.values() ?? [])].sort((a, b) => b.pts - a.pts).slice(0, 14);
    const bats = sim.units.map((u) => ({ name: u.name, callsign: u.callsign, points: r.batteries[u.kind] ?? 0, rounds: u.stats?.rounds ?? 0, kills: u.stats?.kills ?? 0 }))
      .concat((sim.support?.assets ?? []).map((a) => ({ name: kindNameOf(a.kind), callsign: 'Off-map', points: r.batteries[a.kind] ?? 0, rounds: a.fired ?? 0, kills: 0 })));
    return {
      v: 1, at: Date.now(), seen: false, outcome,
      title: TH?.op?.title ?? 'Open battle', sub: outcome === 'left' ? 'You left the battle before it was decided.' : sim.over?.sub ?? '',
      level: LEVEL ? { n: LEVEL.n, name: LEVEL.name, en: LEVEL.en } : null, mods: MODS.map((id) => modifierOf(id)?.name).filter(Boolean),
      minutes: sim.time / 60, rp: { fought: r.fought, time: r.time, win: r.win, total: r.rp },
      research: { target: tgt ? kindNameOf(tgt) : null, from: tgt && tgt === before?.target ? before.share : 0, to: tgt ? career.researchShare(tgt) : 1,
        researched: [...career.researched].filter((k) => !before?.researched.has(k)).map(kindNameOf) },
      opened: opened ? { n: opened, name: threatOf(opened).name } : null,
      batteries: bats, tally: { kill: log?.kill ?? 0, part: log?.part ?? 0, men: log?.men ?? 0, mission: sim.score?.missions ?? 0, hit: log?.hit ?? 0 }, top,
    };
  };
  const toResearch = () => { location.href = menuHref(query, CAMPAIGN_MISSION ? `campaign:${CAMPAIGN_MISSION.id}` : WW2 ? `op:${TH.opId}` : WW1 ? `ww1:${TH?.opId ?? 'ridge'}` : 'battle:ypres', 'research'); };
  const showBattleSummary = (rec, again) => {
    rec.seen = true;
    saveSummary(rec);
    const page = showSummary(rec, { root: document.body, actions: [
      { label: 'Research', onClick: toResearch },
      ...(again ? [{ label: 'Fight again', onClick: () => { page.close(); again(); } }] : []),
      { label: 'Main menu', primary: true, onClick: () => { location.href = MENU; } },
    ] });
    return page;
  };
  // Main menu during a career battle: it pays what was earned and shows the summary (true), or there is none (false)
  const leaveBattle = () => {
    if (paid || !RESEARCH_ERA || state !== 'playing' || !sim || sim.attract || sim.scripted) return false;
    if (sim.gunner?.st) sim.command(sim.gunner.st.unitId, 'unman');
    const r = payOut(false);
    left = true;
    state = 'ended';
    showBattleSummary(battleRecord(r, 'left'), null);
    return true;
  };
  // the page closed during a battle: it pays, and the menu shows the summary next time
  addEventListener('pagehide', () => {
    if (paid || !RESEARCH_ERA || state !== 'playing' || !sim || sim.attract || sim.scripted) return;
    const r = payOut(false);
    if (r) saveSummary(battleRecord(r, 'left'));
  });
  const endGame = (s) => {
    if (sim.gunner?.st) sim.command(sim.gunner.st.unitId, 'unman');
    const sc = sim.score;
    const win = s === 'victory';
    let bonus = 0;
    const had = new Set(career.researched);
    if (CAMPAIGN_MISSION && win && !sim.attract && !sim.scripted) bonus = career.complete(CAMPAIGN_MISSION.id);
    // a threat level played to its end, won or lost, opens the next (progression.js; leaving early does not)
    const opened = LEVEL && !sim.attract && !sim.scripted ? career.playedLevel(RESEARCH_ERA, LEVEL.n) : 0;
    const pay = payOut(win);
    state = 'ended';
    // the career battle: its summary page (ui/summary.js) instead of the end card
    if (pay && RESEARCH_ERA) { showBattleSummary(battleRecord(pay, win ? 'victory' : 'defeat', opened), () => start()); return; }
    const research = document.getElementById('end-research');
    if (research) research.hidden = !(pay || bonus);
    const names = Object.fromEntries(sim.units.map((u) => [u.kind, u.name]));
    // where the RP went: the research target now (the one paid for may be researched, the next taking the rest)
    const tgt = career.targetOf(RESEARCH_ERA ?? CAMPAIGN_MISSION?.era), nameOf = (k) => BATTERIES.find((b) => b.kind === k)?.name ?? k;
    const fresh = [...career.researched].filter((k) => !had.has(k)).map(nameOf);
    const rpLine = (n, why) => ['Research points', `+${n.toLocaleString('en-US')}`, `${why}${fresh.length ? `; researched: ${fresh.join(', ')}` : ''}; ${tgt ? `now researching the ${nameOf(tgt)} (${Math.round(career.researchShare(tgt) * 100)}%)` : 'every battery researched'}`];
    hud.showEnd(
      {
        title: sim.over?.title ?? (WW1 && TH?.op?.kind === 'battle' ? (win ? 'The attack goes through' : 'The line is lost') : TH ? (win ? 'Operation successful' : 'Operation failed') : win ? 'Objectives taken' : 'The line is lost'),
        sub: sim.over?.sub ?? (WW1 && TH?.op?.kind === 'battle' ? (win ? 'The Feuerwalze carried our infantry onto their objectives. The Gruppe has done its work.' : 'The British are through our front. Stellungswechsel: the Gruppe falls back.') : TH ? `${TH.op.title}.` : win ? 'The Group has done its work.' : 'The sector is overrun.'),
        victory: win,
        stats: [
          ...(LEVEL ? [['Threat level', `${LEVEL.n} · ${LEVEL.name}`, opened ? `level ${opened}, ${threatOf(opened).name}, is open` : 'played']] : []),
          ...(CAMPAIGN_MISSION ? [win && bonus ? rpLine(bonus, 'first win of this mission') : ['Research points', win ? 'none' : 'not yet', win ? 'the bonus is paid on the first win only' : 'win the mission for its one-off bonus']] : []),
          ...(pay ? [rpLine(pay.rp, `${pay.fought.toLocaleString('en-US')} from the batteries, ${pay.time} for the time in action${pay.win ? `, ${pay.win} for the day won` : ''}`),
            ['Battery points', Object.values(pay.batteries).reduce((a, b) => a + b, 0).toLocaleString('en-US'), Object.entries(pay.batteries).map(([k, v]) => `${names[k]} +${v}`).join(', ')]] : []),
          ['Score', (typeof sc === 'number' ? sc : sc?.points ?? 0).toLocaleString('en-US')],
          ...Object.entries(sc && typeof sc === 'object' ? sc : {}).filter(([k, v]) => k !== 'points' && typeof v === 'number').slice(0, 5).map(([k, v]) => [k, Math.round(v)]),
          ['Pieces serving', `${sim.units.reduce((n, u) => n + u.pieces.filter((p) => p.state !== 'dead').length, 0)}`],
        ],
      },
      { onRestart: () => start() }
    );
  };

  // ---------------------------------------------------------------- keys and resize
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && tutorial?.escape()) return;
    if (e.repeat || e.target.closest?.('input, textarea, select')) return;
    if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && gview) { toggleMan(); return; }
    if (gview?.active && gview.key(e, sim)) return; // at a gun: the posts, the crew help, the next gun, the drill's keys
    if (/^Digit[0-9]$/.test(e.code) && !e.ctrlKey && !e.metaKey && (Number(e.code.slice(5)) || 10) <= FIELDED.length) unitKey(UNITS.indexOf(FIELDED[(Number(e.code.slice(5)) || 10) - 1]));
    else if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) {
      if (following) {
        chase.releaseShot();
        backToUnit();
        return;
      }
      // (and with none of the unit's, a weapon off the map coming in over the map: src/sim/support.js)
      const sh = newestShell(gview?.active ? sim.gunner.st.unitId : UNITS[selected].id) ?? sim?.shells.find((q) => q.support && q.alive);
      if (sh) followShell(sh);
      else hud.hint('No shell in flight from this unit', 1800);
    } else if (e.code === 'KeyC' && !e.ctrlKey) {
      following = false;
      chase.releaseShot();
      freeCam = !freeCam;
      if (freeCam) {
        chase.free(true);
        chase.goalDist = 400;
        chase.goalPitch = 0.4;
        hud.hint('Free camera: drag to orbit, wheel to zoom, WASD to move, C to return', 3500);
      } else selectUnit(selected);
    } else if (e.code === 'BracketRight') stepTime(1);
    else if (e.code === 'BracketLeft') stepTime(-1);
    else if (e.code === 'KeyH') document.body.classList.toggle('ui-hidden');
    else if (e.code === 'KeyM') hud.hint(audio?.toggleMute?.() ? 'Sound off' : 'Sound on', 1500);
    else if (e.code === 'KeyV' && voices) hud.hint(voices.toggle() ? 'Crew voices on' : 'Crew voices off', 1500); // (ww2/voices.js)
    else if (e.code === 'F3') {
      e.preventDefault();
      document.body.classList.toggle('debug');
    } else if (SANDBOX && e.code === 'KeyB') sandboxBlast(KIND[UNITS[selected].kind].calibre);
    else if (SANDBOX && e.code === 'KeyN') sandboxBurst(15, 300);
    else if (SANDBOX && /^Key[KLJ]$/.test(e.code)) {
      const u = UNITS[selected];
      const p = unitRoot[u.id].position;
      flares.launch(_q.set(p.x + Math.sin(u.zero) * 400, p.y - 3, p.z - Math.cos(u.zero) * 400), { KeyK: 'star', KeyL: 'very', KeyJ: 'sos' }[e.code]);
    }
  });

  new ResizeObserver(() => {
    ({ w: vw, h: vh } = size());
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    applyPixelRatio();
  }).observe(view);

  // ---------------------------------------------------------------- first frame
  await step(0.85, 'Compiling shaders');
  applyQuality(startQuality);
  weather.set(params.weather, true);
  // a lesson is always daylight: the sim's held clock (09:00 to 15:00), never ?hour= or the slider
  const clockHour = () => (tutorial?.active ? Math.min(15, Math.max(9, sim.scripted ? sim.clock : 10)) : params.lockHour || !sim || sim.clock == null ? params.hour : sim.clock);
  const applySun = (h, force = false) => {
    const s = sunAt(h);
    sun.elevation = s.elevation;
    sun.bearing = s.bearing;
    if (force || Math.abs(s.elevation - atmosphere.elevation) > 0.4 || Math.abs(s.bearing - 180 + atmosphere.azimuth) > 1.5 || atmosphere.lastEnvKey === '') atmosphere.set(s.elevation, 180 - s.bearing);
  };
  const sun = { elevation: 20, bearing: 180 };
  applySun(clockHour(), true);
  selectUnit(selected);
  chase.cine(!SANDBOX);
  chase.goalDist = 60;
  chase.goalPitch = 0.28;
  chase.update(1);
  terrain.update(camera, true);
  await renderer.compileAsync(scene, camera);
  await step(0.92, 'Uploading the scene');
  warmUp(renderer, scene, camera);
  atmosphere.update(chase.focus, 0, camera);
  renderer.shadowMap.needsUpdate = true;
  post.render(0.016);
  // every sound ready before the battle: the worker's banks and everything built from the recordings (no stutter later)
  await audio?.whenReady?.((p) => hud.setLoading(0.93 + 0.06 * p, 'Sounding the guns'));
  if (voices) {
    hud.setLoading(0.99, 'Briefing the crews'); // the crew voices' clips, decoded behind the loading screen (ww2/voices.js)
    await voices.ready();
  }
  hud.setLoading(1, '');
  hud.ready();
  hud.setTimeScale(1);

  const timer = new THREE.Timer();
  const sunColorN = new THREE.Color();
  const ambient = new THREE.Color();
  let t = 0;
  let sunTimer = 0;
  let hudTimer = 0;
  let ambTimer = 0;
  let frameAvg = 16;
  const bracketPt = new THREE.Vector3();

  const frame = (forcedDt, draw = true) => {
    timer.update();
    const rawDt = forcedDt ?? THREE.MathUtils.clamp(timer.getDelta(), 0, 0.1);
    frameAvg += (rawDt * 1000 - frameAvg) * 0.05;
    const dt = rawDt * params.timeScale; // game time (time compression applies to the world, not the camera)
    t += dt;
    globalUniforms.uTime.value = t;

    // time of day: the sim's clock, or the fixed hour
    const hour = clockHour();
    sunTimer -= rawDt;
    const u = atmosphere.uniforms;
    atmosphere.setStorm(weather.state.storm);
    u.cloudCoverage.value = weather.state.cover * 0.45;
    u.cloudDensity.value = 0.45 + weather.state.storm * 0.4;
    u.turbidity.value = params.turbidity;
    u.rayleigh.value = params.rayleigh;
    const stormKey = weather.state.storm.toFixed(2);
    if (sunTimer <= 0 && (!atmosphere.lastEnvKey.endsWith(stormKey) || Math.abs(sunAt(hour).elevation - atmosphere.elevation) > 0.4 || Math.abs(sunAt(hour).bearing - 180 + atmosphere.azimuth) > 1.5)) {
      applySun(hour, true);
      sunTimer = 0.25;
    }
    scene.environmentIntensity = params.envIntensity * atmosphere.baseEnvIntensity * (1 - weather.state.storm * 0.35) + weather.flash * 2.5;

    if (gview?.active && sim?.gunner) sim.gunner.setInput(following ? IDLE : gview.input());
    fx.closeUp = !!gview?.active && !following; // at a gun, a blast near the eye throws fewer puffs (fx/artillery.js lod)
    if (dt > 0 && !left) sim?.update(dt); // (a battle left early stands still behind its summary)
    syncGunner();
    feed?.update();
    if (liveDue && rawNow() - liveAt > 1000) payLive();
    updateCampaignObjectives(sim, state === 'playing' && !!CAMPAIGN_MISSION);
    if (tutorial?.active && !DAY_WEATHER.includes(params.weather)) setWeather('Clear', true);
    tutorial?.update(rawDt);
    if (SANDBOX || !sim) stepFakeShells(dt);
    if (!renderLayer) for (const rig of rigs.values()) {
      rig.update?.(dt);
      if (rig.rec > 0) {
        rig.rec = Math.max(0, rig.rec - rawDt / 1.7);
        // out in a tenth of a second, back at an easy run-out
        const k = 1 - rig.rec, r = k < 0.07 ? k / 0.07 : 1 - ((k - 0.07) / 0.93) ** 0.8;
        if (rig.setRecoil) rig.setRecoil(Math.max(0, r));
        else if (rig.pivots?.recoil) rig.pivots.recoil.position.z = (rig.recoilLength ?? 1) * Math.max(0, r);
      }
    }
    if (sim) renderLayer?.update?.(dt, rawDt, sim, fx, camera);
    if (sim) modeR?.update?.(dt, rawDt, sim, camera);
    // a V-weapon site frames each new step of its drill and its launch (ww2/render.js), only while the camera
    // orbits that unit and the player is not dragging it; the player's own orbit and zoom stand in between
    if (modeR?.framing && sim && state !== 'title' && chase.mode === 'unit' && !freeCam && !chase.dragging) {
      const f = modeR.framing(UNITS[selected]?.id);
      if (f) {
        if (f.yaw != null) chase.goalYaw = chase.yaw + (((f.yaw - chase.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        chase.goalPitch = f.pitch;
        chase.goalDist = f.dist;
      }
    }
    world?.update?.(dt, camera);
    craters?.update?.(dt, camera);
    if (sim) {
      for (const sh of sim.shells) {
        if (!seenShells.has(sh)) {
          seenShells.add(sh);
          audio?.shell?.(sh);
        }
      }
    }
    for (const f of drumfire.onFrame) f(dt, rawDt, t);

    const atGun = !!gview?.active && !following; // first person at a gun (src/ww2/gunnerView.js), not the chase camera
    if (gview) gview.riding = following; // (the shell ride's drag and wheel are the chase camera's)
    camera.fov += ((atGun ? gview.fov : params.fov) - camera.fov) * (1 - Math.exp(-rawDt * 10));
    camera.updateProjectionMatrix();
    if (state === 'title') {
      cineClock += rawDt;
      if (!following && cineClock > 26) {
        cineClock = 0;
        selectUnit((selected + 1) % UNITS.length);
        chase.cine(true);
      }
    }
    chase.enabled = !atGun;
    if (atGun) {
      chase.trauma = Math.max(0, chase.trauma - rawDt * 1.1);
      gview.place(rawDt, sim, params.shake ? chase.trauma : 0);
      chase.focus.copy(camera.position); // the shadows and the haze follow the eye
    } else chase.update(rawDt, sim?.alpha ?? 1);
    if (drumfire.aim) camera.lookAt(drumfire.aim.x, drumfire.aim.y, drumfire.aim.z); // a test can look anywhere
    camera.updateMatrixWorld();
    // camouflage nets between the camera and the gun it orbits are cut away (world/mats.js)
    const cut = mods.world?.CUTAWAY;
    if (cut) {
      cut.a.value.copy(camera.position);
      cut.b.value.copy(chase.focus);
      cut.r.value = chase.mode === 'unit' && !freeCam && !atGun ? 10 : 0;
      // the selected unit's own nets are drawn back over its guns (every piece, the battery spreads wide); at a gun, its own.
      // Where the sim's pieces stand (the Karl drives to its prepared positions; every other gun is where it was placed)
      const cu = (atGun && UNITS.find((x) => x.id === sim.gunner.st.unitId)) || UNITS[selected];
      const places = sim?.unitById?.(cu.id)?.pieces.map((p) => p.pos) ?? piecePlacements(cu);
      for (let i = 0; i < cut.p.value.length; i++) {
        const pl = places[i];
        cut.p.value[i].set(pl?.x ?? 0, pl?.z ?? 0, pl && state !== 'title' ? NET_CLEAR[cu.kind] : 0);
      }
    }

    terrain.update(camera);

    atmosphere.update(chase.focus, t, camera);
    const light = atmosphere.sun;
    light.intensity = (atmosphere.sunBase ?? light.intensity) * params.sunGain;
    sunColorN.copy(light.color).multiplyScalar(light.intensity / 6.5);
    globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);
    globalUniforms.uSunColorN.value.copy(sunColorN);
    ambient.copy(scene.fog.color).multiplyScalar(0.9 + 0.3 * (1 - weather.state.storm));
    nightHemi.intensity = params.nightGlow * atmosphere.night * (1 - 0.3 * weather.state.storm);

    const lightEnv = { sunDir: atmosphere.lightDir, sunColor: sunColorN, sunIntensity: 6.5, ambient };
    clouds.update(dt, camera, {
      ...lightEnv,
      sunIntensity: 6.5 * (1 - 0.65 * atmosphere.night),
      cover: THREE.MathUtils.clamp(0.55 + weather.state.cover * 0.6, 0, 1),
      deck: weather.state.deck ?? 0,
    });
    fx.wind.set(-4 * weather.state.wind, 0, 1.6 * weather.state.wind);
    fx.update(dt, camera, { ...lightEnv, night: atmosphere.night });
    flares.wind.copy(fx.wind);
    flares.update(dt, camera, (2 * Math.tan((camera.fov * Math.PI) / 360)) / (vh * post.pixelRatio));
    weather.update(dt, t, camera, atmosphere);

    scene.fog.density = params.fogDensity * weather.state.fog;
    globalUniforms.fogSunColor.value.copy(atmosphere.fogSunBase || globalUniforms.fogSunColor.value).multiplyScalar(1 - 0.9 * weather.state.storm);
    globalUniforms.fogHeightFalloff.value = params.fogFalloff;
    globalUniforms.fogBaseHeight.value = 0;

    const nightK = atmosphere.night;
    renderer.toneMapping = toneMaps[params.toneMapping];
    renderer.toneMappingExposure = params.exposure;
    const ex = post.exposure.params;
    ex.auto = params.autoExposure;
    ex.key = params.exposureKey * (1 - 0.35 * nightK);
    ex.max = 2 + 5 * (1 - THREE.MathUtils.smoothstep(sun.elevation, -6, 3));
    post.gtao.blendIntensity = params.aoIntensity;
    post.bloom.enabled = params.bloom;
    post.bloom.strength = params.bloomStrength * (1 - 0.3 * nightK);
    post.bloom.radius = params.bloomRadius;
    post.bloom.threshold = params.bloomThreshold;
    post.bloom.materialHighPassFilter.uniforms.uCap.value = params.bloomCap;
    post.bloom.materialHighPassFilter.uniforms.uKnee.value = params.bloomKnee;
    const lu = post.lens.uniforms;
    lu.uFlare.value = params.lensFlare * (1 - weather.state.storm);
    lu.uCA.value = params.chromatic;
    const gu = post.grade.uniforms;
    gu.uVignette.value = params.vignette;
    gu.uGrain.value = params.grain * (1 - 0.5 * nightK);
    gu.uNight.value = nightK;
    gu.uSharpen.value = params.sharpen;
    post.dof.enabled = false;
    post.update(t, rawDt, atmosphere.sunDir, sunColorN, sun.elevation);
    lu.uRays.value *= params.godRays * (1 - weather.state.storm);

    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    if (draw) {
      dynRes.begin();
      post.render(rawDt);
      dynRes.end();
    }
    stats.update();

    // HUD, console, audio
    hud.setClock(hour);
    if (panel && sim) {
      const view2 = { sim, selectedId: UNITS[selected].id, dt: rawDt, time: sim.time };
      if (panel.update.length >= 2) panel.update(rawDt, view2);
      else panel.update(view2);
    }
    if (gview) {
      gview.update(sim);
      const su = UNITS[selected];
      gview.setButton(state === 'playing' && (gview.active || (mods.ww2gunner.MANNABLE.has(su.kind) && canCommand(su.id) && !!sim?.unitById(su.id)?.alive)), gview.active);
    }
    if (audio) {
      ambTimer -= rawDt;
      if (ambTimer <= 0) {
        ambTimer = 0.5;
        const busy = sim ? Math.min(1, 0.25 + sim.shells.length * 0.04) : 0.3;
        audio.setAmbience?.({ drumfire: state === 'playing' || state === 'title' ? busy : state === 'tutorial' ? busy * 0.5 : 0, rain: weather.state.rain, wind: weather.state.wind });
      }
      voices?.update(sim); // the crew voices' watchers and queues, after the sim's step (ww2/voices.js)
      audio.update?.(rawDt, camera);
    }

    if (params.dynamicRes && draw && forcedDt == null && dynRes.update(rawDt)) {
      resScale = dynRes.scale;
      applyPixelRatio();
    }

    // the selected unit's mission point, bracketed in the 3D view
    const su = sim?.units?.find((x) => x.id === UNITS[selected].id);
    const mission = su?.missionId != null ? sim.missionById?.(su.missionId) : null;
    if (mission) {
      bracketPt.set(mission.x, terrain.heightAt(mission.x, mission.z) + 4, mission.z);
      hud.bracket(camera, bracketPt, `${mission.title ?? mission.kind}`);
    } else hud.bracket(camera, null);

    hudTimer -= rawDt;
    if (hudTimer <= 0 && document.body.classList.contains('debug')) {
      hudTimer = 0.25;
      const i = renderer.info;
      const c = fx.counts ?? {};
      hud.debug(
        `fps        ${(1000 / frameAvg).toFixed(0)} (${frameAvg.toFixed(1)} ms)\n` +
          `state      ${state}  time x${params.timeScale}${freeCam ? '  free camera' : ''}  camera ${chase.mode}\n` +
          `draw calls ${i.render.calls}\n` +
          `triangles  ${(i.render.triangles / 1e6).toFixed(2)}M\n` +
          `resolution ${Math.round(vw * post.pixelRatio)}x${Math.round(vh * post.pixelRatio)} (${Math.round(resScale * 100)}%) on ${Math.round(vw * renderer.getPixelRatio())}x${Math.round(vh * renderer.getPixelRatio())}${post.upscale.enabled ? ' upscaled' : ''}  gpu ${dynRes.gpuTimed ? `${dynRes.gpuMs.toFixed(1)} ms` : 'untimed'}  refresh ${(1000 / dynRes.refreshMs).toFixed(0)} Hz\n` +
          `detail     ${renderLayer?.detail ? `${renderLayer.detail.hidden} of ${renderLayer.detail.items.length} far meshes not drawn${renderLayer.detail.enabled ? '' : ' (off)'}` : 'none'}\n` +
          `particles  ${c.smoke ?? 0} smoke, ${c.glow ?? 0} glow, ${c.debris ?? 0} debris  lights ${globalUniforms.uFlareCount.value} (${flares.items.length} flares, ${flares.flashes.length} flashes)\n` +
          `battle     ${sim ? `${sim.state} phase ${sim.phase} shells ${sim.shells.length}` : 'no sim'}\n` +
          `camera     ${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)}  dist ${chase.dist.toFixed(0)}  trauma ${chase.trauma.toFixed(2)}\n` +
          `clock      ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}  sun ${sun.elevation.toFixed(1)} deg bearing ${sun.bearing.toFixed(0)}  weather ${params.weather}`
      );
    }
  };
  renderer.setAnimationLoop(() => frame());

  // the page is a game (src/boot.js): straight into the battle or the lesson, then the loading screen goes
  if (SANDBOX) {
    start();
  } else if (RANGE) {
    selectUnit(selected);
    startRange();
  } else if (query.get('tutorial')) {
    if (tutorial?.defs.some((d) => d.id === query.get('tutorial'))) tutorial.start(query.get('tutorial'));
    else toMenu();
  } else {
    selectUnit(selected);
    start();
  }
  hideLoading();

  Object.assign(drumfire, {
    renderer, scene, camera, terrain, atmosphere, post, fx, flares, hud, chase, params, frame, clouds, weather, world, craters,
    sim, tutorial, audio, panel, rigs, unitRoot, units: UNITS, handlers, renderLayer, ww2render: ww2r, ww1render: ww1r, sun, fakeShells,
    select: selectUnit, start, setTimeScale, followShell, newestShell, sandboxBlast, sandboxBurst, gunner: gview,
    range, // the test range's API (src/ui/range.js), on a range page
    voices, // the German crew voices (null on other pages); voices.log lists every line spoken
    // the WW2 gunner from a test: man(unitIndex, { piece, post, assist }) takes the place, man(null) leaves it
    man(i, args = {}) {
      if (i == null) return sim?.gunner?.st ? sim.command(sim.gunner.st.unitId, 'unman') : true;
      return sim?.command(UNITS[i].id, 'man', gunnerArgs(args));
    },
    fastForward(seconds, { unit = null, scale = 8, settle = 6 } = {}) {
      renderer.setAnimationLoop(null);
      if (unit != null) selectUnit(unit);
      const keep = params.timeScale;
      params.timeScale = scale;
      for (let i = Math.ceil(seconds / (0.05 * scale)); i > 0; i--) frame(0.05, false);
      params.timeScale = keep;
      for (let i = 0; i < settle; i++) frame(1 / 30, true);
      return {
        time: Math.round(sim?.time ?? t), state: sim?.state ?? state, clock: sim?.clock ?? params.hour,
        shells: sim?.shells?.length ?? fakeShells.length, score: sim?.score ?? 0,
      };
    },
  });
  Object.defineProperty(drumfire, 'state', { get: () => state, configurable: true });
}

if (MISPLACED) location.replace(MENU);
else init().catch((e) => {
  console.error(e);
  document.getElementById('status').textContent = `Failed to start: ${e.message}`;
});

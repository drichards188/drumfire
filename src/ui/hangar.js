// The menu's hangar: the battery chosen drawn up for inspection on a parade ground. Its guns stand side by side, each
// gun's detachment (its minimal crew and any relief crews, research.js) in ranks in front of it, in blocks when it is
// large, the No. 1 a pace ahead, an inspecting officer and his sergeant facing them; the railway guns on their track,
// their men in two halves either side of the bed; beside each gun its shells on display (three on a stand, one in a
// cradle, the powder beside them), the shells marked by the battery's Shells upgrade.
// The menu decides which guns and men (its own lineup, or a full battery to preview). Round the square: whitewashed edging
// stones, shell stacks and crates, huts and tents behind, telegraph poles, a row of poplars and trees in the haze. The
// camera looks along the line from the right front, turns slowly and can be orbited with the mouse.
//
// The menu stays light: three.js, the gun and crew models and the world's props are imported the first time the
// hangar shows, and the canvas draws only while it is on screen. Nothing is drawn half-built: a parade is assembled
// off the scene, its shaders compiled, then swapped in and its first frame drawn before it shows. The first one stands
// behind the menu's loading screen (which follows `onProgress` and lifts on `onReady`); a later one keeps the battery
// before it in view, under a veil if it takes more than a moment. Without WebGL the chosen gun's still from the game
// (public/menu/<kind>.jpg) stands in. The scene is its own: none of the battlefield's shader patches (the props'
// materials come from world/textures.js, not world/mats.js).
import { STILLS, stillUrl } from '../menuItems.js';

let lib = null;
const loadLib = () => (lib ??= Promise.all([
  import('three'), import('three/examples/jsm/controls/OrbitControls.js'), import('three/examples/jsm/environments/RoomEnvironment.js'),
  import('../models/guns.js'), import('../sim/tables.js'), import('../models/v/crew.js'),
  import('../world/mesher.js'), import('../world/props.js'), import('../world/textures.js'), import('../models/shells.js'), import('../models/looks.js'),
]).then(([THREE, oc, re, guns, tables, crew, mesher, props, textures, shells, looks]) => ({
  THREE, OrbitControls: oc.OrbitControls, RoomEnvironment: re.RoomEnvironment, guns, GUNS: tables.GUNS, crew, mesher, props, textures, shells, looks,
})));

// the parade's dress by era: the men in the ranks, the No. 1, the inspecting officer and his sergeant, the relief crews
// (in their working dress, so they read as reliefs)
const DRESS = {
  '1917': { man: 'gunner-tunic', no1: 'gunner-tunic', officer: 'officer', sergeant: 'gunner-tunic', relief: 'gunner', green: false },
  ww1: { man: 'german', no1: 'german-cap', officer: 'german-cap', sergeant: 'german', relief: 'german-drill', green: true },
  ww2: { man: 'german44', no1: 'german44-cap', officer: 'german44-cap', sergeant: 'german44', relief: 'german44-cap', green: true },
};
const MAX_MEN = 600; // men drawn for one gun at most
const PACE = 0.78, RANK = 1.15; // between files and between ranks
const BLOCK = { files: 12, ranks: 3 }; // a big detachment forms up in blocks of 36 (three ranks of twelve)
const RAIL_HEAD = 0.5; // the hangar's track for the 18-inch car: the rail head above the ground
// the railway guns' track beds in front of them, in the gun's frame (x from, x to): their men form up either side
// (the Gustav's two gun tracks at +-2.4 m and the delivery track at +7.6 m, src/ww2/gustav_layout.js; the 18-inch's bed)
const BED = { gustav: [-6, 11], rail: [-3.4, 3.4] };
// a site whose model runs far past its working heart (the V-2's fire control halftrack about 100 m off): the parade
// forms up round the heart, x and z in the model's frame, and the rest stands beyond the ranks
const CORE = { v2: { x: [-11.5, 11.5], z: [-14, 27] } };

// Where a detachment of `men` stands in front of a gun `w` wide: [x, z] (z toward the front, from the gun's front), the
// No. 1 last, a pace in front of the right of the line. Up to 17 men in two ranks, up to 37 in three, more in blocks of
// 36 side by side and one behind the other, the line at least as wide as the gun.
function formation(men, w, maxRow = Infinity) {
  const spots = [], rest = Math.max(0, men - 1);
  if (men <= 0) return { spots, width: 0, depth: 0 };
  let ranks = rest > 16 ? 3 : rest > 1 ? 2 : 1, files = Math.ceil(rest / ranks), perBlock = rest, perRow = 1;
  if (rest > 36) {
    ({ files, ranks } = BLOCK);
    perBlock = files * ranks;
    perRow = Math.max(1, Math.min(maxRow, Math.ceil(rest / perBlock), Math.floor(Math.max(w + 6, 44) / (files * PACE + 1.6))));
  }
  const bw = files * PACE + 1.6, bd = ranks * RANK + 2.2;
  for (let k = 0; k < rest; k++) {
    const b = Math.floor(k / perBlock), j = k % perBlock, r = j % ranks, f = Math.floor(j / ranks);
    const bx = b % perRow, by = Math.floor(b / perRow);
    spots.push([(bx - (perRow - 1) / 2) * bw + ((files - 1) / 2 - f) * PACE, by * bd + r * RANK]);
  }
  const rows = Math.ceil(rest / perBlock) || 1, width = perRow * bw - 1.6, depth = (rows - 1) * bd + (ranks - 1) * RANK;
  spots.push([width / 2 - PACE, depth + 1.4]);
  return { spots, width, depth: depth + 1.4 };
}

// The Shells upgrade on the shells displayed: a fresh, glossier coat and a green filling band (I); a white band and a
// taller brass nose fuze (II); a long pointed ballistic cap over the nose and a polished driving band (III). Game
// markings, not ordnance practice.
// a missile's body radius (its model's radius is its wings' or fins' span)
const MISSILE_BODY = { v1: 0.425, v2: 0.825 };
const SHELL_LOOK = { fill: 0x3c6a38, ring: 0xe6e1d2, brass: 0xb59343, cap: 0x7d8186 };

// `host` is the element the canvas fills; `onProgress(text, k)` reports a parade being assembled (k 0 to 1) and
// `onReady()` that it stands drawn (or that the still stands in). Returns
// { show({ era, battery: { kind, name, guns, men, base, levels, next } }), lookAt(part), setActive(on) }: `men` for each
// gun (`base` of them its detachment, the rest relief crews), `levels` the battery's upgrades ({ shells, barrel, breech,
// sights, camo, supply, crew }, research.js) drawn on and round its guns, `next` ({ guns, reliefs }: the most guns it can
// have, the men the first relief level brings) for a battery that can still be upgraded; lookAt(part) takes the camera
// to an upgrade's spot (null: back to the battery), a part not yet bought to the place its first level will stand.
export function createHangar(host, { onProgress = () => {}, onReady = () => {} } = {}) {
  let three = null, failed = false, active = false, raf = 0, idleUntil = 0, want = null, parkKey = '', park = null;
  const templates = new Map(); // `${era}:${kind}` -> the gun's root, posed for parade, and its bounds
  const still = document.createElement('div');
  still.className = 'hg-still';
  still.hidden = true;
  // the veil over the stage while a parade is assembled: its step and a bar
  const veil = document.createElement('div');
  veil.className = 'hg-veil';
  veil.innerHTML = '<p class="hg-veil-t"></p><div class="hg-veil-bar"><i></i></div>';
  host.append(still, veil);
  const progress = (text, k) => {
    veil.querySelector('.hg-veil-t').textContent = text;
    veil.querySelector('i').style.width = `${Math.round(k * 100)}%`;
    onProgress(text, k);
  };
  const tick = () => new Promise((r) => setTimeout(r, 0)); // lets the page paint the step between heavy ones
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const fallback = (kind) => {
    still.style.backgroundImage = STILLS.has(kind) ? `url("${stillUrl(kind)}")` : '';
    still.hidden = false;
  };

  async function setup() {
    const L = await loadLib(), { THREE, OrbitControls, RoomEnvironment } = L;
    const canvas = document.createElement('canvas');
    canvas.className = 'hg-canvas';
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { failed = true; throw e; }
    host.prepend(canvas);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    const hemi = new THREE.HemisphereLight(0xd8ddd2, 0x4f4636, 0.6);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(hemi, sun, sun.target);
    // the sky: a dome shading from the overcast zenith to the haze at the horizon, which the fog matches
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x7d8a92) }, horizon: { value: new THREE.Color(0xb9bdb2) } },
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main() { float k = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, sqrt(k)), 1.0); }',
    }));
    sky.renderOrder = -1;
    scene.add(sky);
    scene.fog = new THREE.Fog(0xb9bdb2, 120, 900);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.2, 6000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.addEventListener('start', () => { controls.autoRotate = false; idleUntil = Infinity; glide = null; });
    controls.addEventListener('end', () => { idleUntil = performance.now() + 8000; });
    const mats = L.textures.plainWorldMats();
    const resize = () => {
      const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // on a wide screen the battery stands between the details on the left and the modifications on the right, a
      // little above the batteries along the bottom
      if (w > 1100) camera.setViewOffset(w, h, w * 0.025, h * 0.035, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize);
    resize();
    three = { ...L, renderer, scene, camera, controls, sun, mats, resize, env: null };
    return three;
  }

  // ---------------------------------------------------------------- the scenery round the square
  function environment(era, x0, x1, zFront, zBack) {
    const { THREE, mesher, props, mats } = three;
    const g = new THREE.Group();
    const m = new mesher.Mesher(), h = () => 0, D = DRESS[era];
    const tint = D.green ? mesher.rgbk(0.78, 0.86, 0.62) : mesher.rgbk(0.86, 0.82, 0.74);
    // the ground far round, and the parade square of rolled gravel inside its whitewashed stones
    const G = 1800;
    m.quad('earth', [-G, 0, -G], [-G, 0, G], [G, 0, G], [G, 0, -G], tint, [[-G, -G], [-G, G], [G, G], [G, -G]], [0, 1, 0]);
    const sx0 = x0 - 16, sx1 = x1 + 16, sz0 = zFront - 16, sz1 = zBack + 12;
    m.quad('ballast', [sx0, 0.03, sz0], [sx0, 0.03, sz1], [sx1, 0.03, sz1], [sx1, 0.03, sz0], mesher.grey(0.95), [[sx0, sz0], [sx0, sz1], [sx1, sz1], [sx1, sz0]], [0, 1, 0]);
    const stone = (x, z) => m.box('paint', x, 0.1, z, 0.42, 0.2, 0.3, (mesher.h2(x, z, 1) - 0.5) * 0.4, mesher.rgbk(0.92, 0.91, 0.86));
    for (let x = sx0; x <= sx1; x += 1.4) { stone(x, sz0); stone(x, sz1); }
    for (let z = sz0 + 1.4; z < sz1; z += 1.4) { stone(sx0, z); stone(sx1, z); }
    // the lines behind: huts and tents across the width of the park
    const back = sz1 + 22, n = Math.max(2, Math.round((sx1 - sx0) / 18));
    for (let k = 0; k <= n; k++) {
      const x = sx0 + ((sx1 - sx0) * k) / n;
      if (k % 3 === 1) props.tent(m, h, x, back - 2, Math.PI / 2 + (mesher.h2(k, 2, 3) - 0.5) * 0.2, 3.4, 5, 2.5, 0.85);
      else props.nissen(m, h, x, back + 3, 0, 4.8, 9, 0.9 + mesher.h2(k, 1, 1) * 0.15);
    }
    // telegraph poles along the road beyond, with their wires
    const poles = [];
    for (let x = sx0 - 40; x <= sx1 + 40; x += 34) poles.push(props.pole(m, h, x, back + 20, 6.5, 1, Math.PI / 2));
    for (let k = 0; k < poles.length - 1; k++) {
      const a = poles[k], b = poles[k + 1];
      props.wireLine(m, a, b, 0.4, 4);
    }
    // crates stacked at the square's sides (no shells there: the gun's own ammunition stands by it, and the
    // Ammunition supply upgrade piles more of it behind)
    for (const [x, s] of [[sx0 - 7, 1], [sx1 + 7, -1]]) {
      const z = zBack * 0.4;
      for (let k = 0; k < 6; k++) props.crate(m, h, x + s * (2.2 + (k % 3) * 0.6), z + 2 + ((k / 3) | 0) * 0.5, (mesher.h2(k, x, 4) - 0.5) * 0.4, 0.5, 0.32, 0.32);
    }
    m.build(g, mats, { name: 'park-' });
    // trees: a row of poplars along the road, and timber out in the haze
    const trees = [];
    for (let x = sx0 - 60; x <= sx1 + 60; x += 9) trees.push([x + (mesher.h2(x, 5, 1) - 0.5) * 2, back + 27, 14 + mesher.h2(x, 6, 2) * 5, true]);
    for (let k = 0; k < 90; k++) {
      const a = mesher.h2(k, 7, 3) * Math.PI * 2, r = 260 + mesher.h2(k, 8, 4) * 420;
      trees.push([(x0 + x1) / 2 + Math.cos(a) * r, Math.sin(a) * r, 10 + mesher.h2(k, 9, 5) * 8, false]);
    }
    const tMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x4a4034, roughness: 1 }), trees.length);
    const cMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: D.green ? 0x5d6b3e : 0x6b6a48, roughness: 1, flatShading: true }), trees.length);
    const o = new THREE.Object3D();
    trees.forEach(([x, z, ht, poplar], i) => {
      o.position.set(x, 0, z); o.rotation.set(0, 0, 0); o.scale.set(1, ht * 0.55, 1); o.updateMatrix();
      tMesh.setMatrixAt(i, o.matrix);
      o.position.set(x, ht * (poplar ? 0.62 : 0.6), z);
      o.scale.set(poplar ? 1.6 : ht * 0.32, ht * (poplar ? 0.42 : 0.3), poplar ? 1.6 : ht * 0.32);
      o.rotation.y = mesher.h2(x, z, 9) * 6;
      o.updateMatrix();
      cMesh.setMatrixAt(i, o.matrix);
    });
    for (const im of [tMesh, cMesh]) { im.castShadow = true; im.receiveShadow = true; g.add(im); }
    return g;
  }

  // ---------------------------------------------------------------- the guns and their detachments
  // the gun posed for parade and dressed by its upgrades (models/looks.js: paint, the relined barrel, the polished
  // breech), cached per look; with where its muzzle and breech stand
  async function template(era, kind, levels = {}) {
    const look = `${(levels.camo ?? 0) >= 1 ? 1 : 0}${(levels.barrel ?? 0) >= 3 ? 1 : 0}${(levels.breech ?? 0) >= 3 ? 1 : 0}`;
    const key = `${era}:${kind}:${look}`;
    if (templates.has(key)) return templates.get(key);
    const { guns, GUNS, THREE } = three;
    await guns.loadGuns([kind]);
    guns.GUN_ERA.ww1 = era === 'ww1'; // Bertha in her 1917 colours on the WW1 tab
    const rig = guns.buildGun(kind), g = GUNS[kind];
    rig.trees?.removeFromParent(); // (a site's own wood, the V-2's: the parade ground has its own scenery)
    rig.setErect?.(1); // the V-2 stands on its table
    // on parade the guns are run in and lowered as far as they go
    rig.setElevation?.(Math.max(g?.elMin ?? 0, 0.05));
    rig.update?.(0);
    const root = new THREE.Group();
    root.add(rig.root);
    if (kind === 'rail') rig.root.position.y = RAIL_HEAD; // the car's root is its rail head
    root.updateMatrixWorld(true);
    three.looks.applyLook(rig, kind, era, levels, { parade: true });
    root.updateMatrixWorld(true);
    // Breech III on a gun without a loading tray of its own: a light tray hooked behind the open breech, the gun's next
    // round on it, nose to the breech, ready to be rammed (the guns with one show theirs, models/looks.js)
    let ownRound = null;
    if ((levels.breech ?? 0) >= 3 && !rig.props?.tray && rig.anchors?.breech && GUNS[kind]?.shell) {
      try {
        const round = shellModel(GUNS[kind].shell, levels.shells ?? 0), { L, R } = round, tray = new THREE.Group();
        const steel = new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.5, metalness: 0.7 });
        const z0 = 0.06, zc = z0 + (L * 1.05) / 2;
        for (const sx of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, L * 1.05), steel);
          rail.position.set(sx * R * 0.72, -R * 0.78, zc);
          tray.add(rail);
        }
        const bed = new THREE.Mesh(new THREE.BoxGeometry(R * 1.2, 0.02, L * 1.05), steel);
        bed.position.set(0, -R - 0.02, zc);
        round.group.position.set(0, 0, zc);
        tray.add(bed, round.group);
        tray.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        tray.name = 'look-loading-tray';
        rig.anchors.breech.add(tray);
        ownRound = round.group;
        root.updateMatrixWorld(true);
      } catch (e) { console.warn('hangar: tray', e.message); }
    }
    const box = new THREE.Box3().setFromObject(rig.root);
    if (CORE[kind]) [box.min.x, box.max.x, box.min.z, box.max.z] = [...CORE[kind].x, ...CORE[kind].z];
    const at = (a) => (a ? a.getWorldPosition(new THREE.Vector3()) : null);
    const muzzle = at(rig.anchors?.muzzle), breech = at(rig.anchors?.breech);
    const loaded = (levels.breech ?? 0) >= 3 ? at(rig.props?.tray ?? ownRound) : null; // the round on the tray
    // the railway guns stand on their track: the Gustav on its own curved double track (buildGustavSite, the track
    // alone), the 18-inch car on a ballasted standard-gauge line
    if (kind === 'gustav' && guns.EXTRAS.buildGustavSite) {
      const site = guns.EXTRAS.buildGustavSite();
      site.setStage({ survey: 0, track: 1, camo: 0 });
      site.root.traverse((o) => { if (o.parent?.parent === site.root && o.name !== 'track') o.visible = false; });
      root.add(site.root);
    } else if (kind === 'rail') root.add(track(box.min.z - 30, box.max.z + 30));
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const t = { root, box, muzzle, breech, loaded };
    templates.set(key, t);
    return t;
  }

  // a straight standard-gauge track along z, the rail head RAIL_HEAD above the ground: ballast, sleepers, rails
  function track(z0, z1) {
    const { THREE, mesher, mats } = three;
    const g = new THREE.Group(), m = new mesher.Mesher();
    m.slope('ballast', [0, 0, z0], [0, 0, z1], 4.6, 3.2, RAIL_HEAD - 0.25, mesher.grey(0.9));
    for (let z = z0 + 0.4; z < z1; z += 0.72) m.box('timber', 0, RAIL_HEAD - 0.19, z, 2.6, 0.12, 0.24, 0, mesher.grey(0.55 + mesher.h2(z, 3, 1) * 0.25));
    for (const x of [-0.7175, 0.7175]) m.box('steel', x, RAIL_HEAD - 0.065, (z0 + z1) / 2, 0.08, 0.13, z1 - z0, 0, 0xffffff);
    m.build(g, mats, { name: 'track-' });
    return g;
  }

  // The battery's shell as built (models/shells.js: along Z, nose -Z, centred) with the Shells upgrade's marks for
  // `level`; the materials of a level are made once
  const shellMats = new Map();
  function shellModel(shellKind, level) {
    const { THREE, shells } = three;
    const s = shells.buildShell(shellKind, 24), g = new THREE.Group(), R = s.radius, L = s.length, half = L / 2;
    if (L > 4) level = 0; // (a missile keeps its own paint: a shell's bands, fuze and cap would float round its taper)
    const paint = (color, rough = 0.5, metal = 0.15) => {
      const k = `${color}|${rough}|${metal}`;
      if (!shellMats.has(k)) shellMats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
      return shellMats.get(k);
    };
    s.parts.forEach((p, i) => {
      let m = p.material;
      if (i === 0 && level > 0) {
        // a fresh coat: the body's colour a little brighter, glossier with every level
        const c = p.material.color.clone().offsetHSL(0, 0.04, 0.05);
        m = paint(c.getHex(), 0.5 - level * 0.08, 0.15);
      } else if (i === 1 && level >= 3) m = paint(0xc8784a, 0.25, 0.9); // the driving band polished
      // (a round on show has no use for the A-4's vane deflection, and an instanced pile of it would not draw)
      const geo = p.geometry.morphAttributes.position ? p.geometry.clone() : p.geometry;
      geo.morphAttributes = {};
      g.add(new THREE.Mesh(geo, m));
    });
    const ring = (z, color, w) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.006, R * 1.006, w, 32, 1, true).rotateX(Math.PI / 2), paint(color, 0.5));
      r.position.z = z;
      g.add(r);
    };
    if (level >= 1) ring(half - L * 0.22, SHELL_LOOK.fill, L * 0.045);
    if (level >= 2) {
      ring(half - L * 0.33, SHELL_LOOK.ring, L * 0.028);
      const fuze = new THREE.Mesh(new THREE.ConeGeometry(R * 0.2, L * 0.1, 20).rotateX(-Math.PI / 2), paint(SHELL_LOOK.brass, 0.3, 0.85));
      fuze.position.z = -half - L * 0.04;
      g.add(fuze);
    }
    if (level >= 3) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(R * 0.62, L * 0.32, 32).rotateX(-Math.PI / 2), paint(SHELL_LOOK.cap, 0.35, 0.7));
      cap.position.z = -half + L * 0.18 - L * 0.16;
      g.add(cap);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // `low`: how far it reaches below its axis lying down (a shell its radius; a missile its wings or fins, R being
    // their span), `body` its body's radius
    const low = L > 4 ? -new THREE.Box3().setFromObject(g).min.y : R;
    return { group: g, L, R, low, body: L > 4 ? MISSILE_BODY[shellKind] ?? R : R };
  }

  // The powder beside the shells, heaped as a battery's charges were (models/shells.js buildCartridge, along Z, its
  // base +Z), on timber dunnage: bags (and a bag ahead of its brass case) in a pyramid of rows along z, a few lying
  // loose at its foot; brass cases stacked on their sides in a pyramid, their bases out toward the front so the polished
  // heads make a honeycomb. The Gustav and the M-Gerät add their brass main case standing at the end; none for the
  // Nebelwerfer (its rockets carry their own). The Ammunition supply upgrade heaps it higher, as it piles the shells
  // behind: about as many charges again a level (the rows times the root of 1 + `supply`). Drawn instanced, one mesh a
  // part. Returns { group, width, depth } with the group's left edge at x = 0, or null
  const MAIN_CASE = { gustav: 'gustavc', bertha: 'm42c' };
  function powder(kind, supply = 0) {
    if (kind === 'nbw41') return null;
    const { THREE, shells, mesher, mats } = three;
    let c;
    try { c = shells.buildCartridge(kind); } catch { return null; }
    const g = new THREE.Group(), m = new mesher.Mesher(), r = c.radius, L = c.length, brass = c.parts.length === 1;
    const rnd = (k) => mesher.h2(k, r * 100, 7) - 0.5; // steady jitter, the same heap every time
    const lid = (shellMats.get('lid') ?? shellMats.set('lid', new THREE.MeshStandardMaterial({ color: 0x6a5338, roughness: 0.85 })).get('lid'));
    // the heap: rows of n, n - 1, ... in hexagonal packing, `slices` deep along z
    const n = Math.round((r < 0.07 ? 6 : r < 0.12 ? 5 : r < 0.22 ? 4 : 3) * Math.sqrt(1 + supply)), pitch = r * 2.04;
    const slices = brass ? 1 : L < 0.5 ? 2 : 1, sliceD = L + 0.05;
    const spots = [];
    for (let s2 = 0; s2 < slices; s2++) for (let k = 0; k < n; k++) for (let i = 0; i < n - k; i++) {
      spots.push([(i - (n - k - 1) / 2) * pitch, 0.16 + r + k * r * Math.sqrt(3), (s2 - (slices - 1) / 2) * sliceD]);
    }
    // a few loose ones at the foot of the heap
    const loose = brass ? [] : [[n * pitch * 0.62, 0.16 + r, -sliceD * slices * 0.5 - r * 1.4, 0.5], [-n * pitch * 0.45, r, -sliceD * slices * 0.5 - r * 2.6, -0.3]];
    const o = new THREE.Object3D(), all = [...spots.map((p) => [...p, 0]), ...loose];
    for (const part of c.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, all.length);
      all.forEach(([x, y, z, yaw], j) => {
        o.position.set(x, y, z);
        // the cases with their bases out to the front (-Z); the bags turned a little this way and that
        o.rotation.set(brass ? 0 : rnd(j) * 0.08, (brass ? Math.PI : 0) + yaw + rnd(j + 50) * (brass ? 0.02 : 0.1), rnd(j + 99) * 0.6);
        o.updateMatrix();
        im.setMatrixAt(j, o.matrix);
      });
      im.castShadow = im.receiveShadow = true;
      g.add(im);
    }
    const W = n * pitch + 0.3, D = slices * sliceD + 0.2;
    // the dunnage under the heap: three baulks across it and boards over them
    for (const z of [-D * 0.38, 0, D * 0.38]) m.box('timber', 0, 0.05, z, W + 0.2, 0.1, 0.14, 0, mesher.grey(0.6));
    m.box('timber', 0, 0.13, 0, W, 0.05, D, 0, mesher.grey(0.72));
    if (brass) {
      // the cases' caps at their mouths (to the rear), so the heap reads as charges, not empties
      const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.012, 16).rotateX(Math.PI / 2), lid, spots.length);
      spots.forEach(([x, y, z], j) => { o.position.set(x, y, z + L / 2 - 0.006); o.rotation.set(0, 0, 0); o.updateMatrix(); cap.setMatrixAt(j, o.matrix); });
      g.add(cap);
    }
    let width = W + 0.2;
    if (MAIN_CASE[kind]) {
      try {
        const mc = shells.buildCartridge(MAIN_CASE[kind]), q = new THREE.Group();
        for (const p of mc.parts) q.add(new THREE.Mesh(p.geometry, p.material));
        q.rotation.x = Math.PI / 2; // standing on its base
        q.position.set(width / 2 + 0.25 + mc.radius, mc.length / 2, 0);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(mc.radius * 0.66, mc.radius * 0.66, 0.015, 24), lid);
        cap.position.set(width / 2 + 0.25 + mc.radius, mc.length - 0.015, 0);
        g.add(q, cap);
        width += 0.5 + mc.radius * 2;
      } catch { /* no main case drawn */ }
    }
    m.build(g, mats, { name: 'powder-' });
    g.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
    // the heap was built centred on x: the group's left edge to x = 0
    for (const q of g.children) q.position.x += (W + 0.2) / 2;
    return { group: g, width, depth: D + (brass ? 0 : r * 4) };
  }

  // the ammunition on display beside a gun: three shells standing on a timber stand and one lying in a cradle before
  // them, the powder to their right (heaped higher with the supply); returns the group (centred on x), its width and
  // depth, and the shell's length
  function shellDisplay(shellKind, level, supply = 0) {
    const { THREE, mesher, mats } = three;
    const g = new THREE.Group(), inner = new THREE.Group(), m = new mesher.Mesher();
    g.add(inner);
    const one = shellModel(shellKind, level), { L, R } = one, gap = Math.max(R * 3.4, 0.35), top = 0.28;
    // (a missile is shown lying in its cradle only: three of them on end would stand higher than the site)
    const tall = L > 4, w = tall ? 0 : gap * 2 + R * 2 + 0.6;
    if (!tall) m.box('timber', 0, top / 2, 0, w, top, R * 2 + 0.5, 0, mesher.grey(0.75));
    for (let i = 0; i < (tall ? 0 : 3); i++) {
      const s = i ? shellModel(shellKind, level).group : one.group;
      s.rotation.x = Math.PI / 2; // the nose up
      s.position.set((i - 1) * gap, top + L / 2, 0);
      inner.add(s);
    }
    // the cradle: two chocks, and the shell on them along x, its nose toward the camera's side
    // (a missile on chocks under its body, high enough that its wings or fins clear the ground)
    const cz = tall ? 0 : -(R * 2 + 0.5) / 2 - Math.max(0.6, R * 2.2);
    const ly = tall ? Math.max(one.low + 0.05, 0.24 + one.body * 0.92) : 0.24 + R * 0.92, ch = tall ? ly - one.body * 0.92 : 0.24;
    for (const x of [-L * 0.28, L * 0.28]) m.box('timber', x, ch / 2, cz, 0.18, ch, (tall ? one.body : R) * 2.4, 0, mesher.grey(0.7));
    const lying = tall ? one.group : shellModel(shellKind, level).group;
    lying.rotation.y = -Math.PI / 2;
    lying.position.set(0, ly, cz);
    inner.add(lying);
    m.build(inner, mats, { name: 'shells-' });
    const half = Math.max(w, L + 0.4) / 2, pw = powder(shellKind, supply);
    let width = half * 2, depth = tall ? R * 2.4 : R * 2 + 0.5 + Math.max(0.6, R * 2.2) + R * 2.4;
    if (pw) {
      pw.group.position.x = half + 0.4;
      inner.add(pw.group);
      width += 0.4 + pw.width;
      depth = Math.max(depth, pw.depth);
    }
    inner.position.x = half - width / 2; // the whole display centred on the group's origin
    return { group: g, width, depth, L };
  }

  // A man standing at attention, baked once per dress: the crew figure posed and its skinning applied to a plain
  // geometry, so a detachment of hundreds is a few instanced meshes
  const baked = new Map();
  function bake(outfit, skin) {
    const key = `${outfit}|${skin}`;
    if (baked.has(key)) return baked.get(key);
    const { THREE, crew } = three;
    const f = crew.buildCrewman({ outfit, skin });
    f.pose('stand', 0, 1);
    f.root.updateMatrixWorld(true);
    const mesh = f.mesh, src = mesh.geometry, pos = src.attributes.position, v = new THREE.Vector3(), out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      mesh.applyBoneTransform(i, v.fromBufferAttribute(pos, i));
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    for (const [name, attr] of Object.entries(src.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) geo.setAttribute(name, attr);
    if (src.index) geo.setIndex(src.index);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    f.dispose();
    const b = { geo, mat: mesh.material };
    baked.set(key, b);
    return b;
  }
  // the men of a parade: [outfit, skin, x, z, yaw] each, drawn as one instanced mesh per dress
  function men(list) {
    const { THREE } = three;
    const by = new Map(), o = new THREE.Object3D(), out = [];
    for (const m of list) {
      const k = `${m[0]}|${m[1]}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(m);
    }
    for (const [k, ms] of by) {
      const b = bake(ms[0][0], ms[0][1]);
      const im = new THREE.InstancedMesh(b.geo, b.mat, ms.length);
      ms.forEach(([, , x, z, yaw], i) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = `men-${k}`;
      out.push(im);
    }
    return out;
  }

  // ---------------------------------------------------------------- the upgrades laid out at each gun
  // Barrel and Breech: the kit laid out on a groundsheet beside the gun as for an inspection, the barrel's on its left
  // half, the breech's on its right, an item more with each level: I two sponge staves, the bucket and an oil tin; II
  // the star gauge on its trestles beside its open case; I the rammer and the shell tongs; II the artificer's chest,
  // its lid up, oil cans and a tool roll. The III of each is on the gun (models/looks.js: the muzzle cover, the breech
  // opened and bright). Along z, centred; null when there is nothing to lay out.
  const KIT = { W: 2.8, L: 3.8 };
  function kitSheet(lv) {
    if (!lv.barrel && !lv.breech) return null;
    const { THREE, mesher, mats } = three, { grey, rgbk } = mesher;
    const g = new THREE.Group(), m = new mesher.Mesher(), { W, L } = KIT;
    const wood = rgbk(0.5, 0.37, 0.22), brass = rgbk(0.7, 0.56, 0.24), iron = rgbk(0.32, 0.33, 0.34);
    m.box('canvas', 0, 0.045, 0, W, 0.03, L, 0, rgbk(0.62, 0.6, 0.47)); // the groundsheet, over the square's gravel
    if (lv.barrel >= 1) {
      // two sponge staves, their bristle heads to the front, the sponge bucket and an oil tin
      for (const x of [-1.05, -0.78]) {
        m.tube('paint', [x, 0.08, -1.25], [x, 0.08, 1.6], 0.045, 0.045, 8, wood);
        m.tube('hessian', [x, 0.12, -1.7], [x, 0.12, -1.25], 0.12, 0.12, 12, rgbk(0.3, 0.25, 0.18));
      }
      m.tube('paint', [-1.0, 0.03, 1.55], [-1.0, 0.42, 1.55], 0.17, 0.2, 14, iron, { capB: false });
      m.box('paint', -0.62, 0.15, 1.65, 0.18, 0.3, 0.14, 0.3, rgbk(0.6, 0.12, 0.1));
    }
    if (lv.barrel >= 2) {
      // the star gauge: a long rod on two trestles, its measuring head at the front; its long case open beside it
      for (const z of [-1.1, 1.1]) for (const sx of [-1, 1]) m.beam('paint', [-0.35 + sx * 0.2, 0.03, z], [-0.35, 0.62, z], 0.05, 0.05, wood);
      m.tube('paint', [-0.35, 0.65, -1.7], [-0.35, 0.65, 1.7], 0.035, 0.035, 8, iron);
      m.box('paint', -0.35, 0.65, -1.78, 0.2, 0.2, 0.16, 0, brass);
      m.box('paint', -0.05, 0.08, 0, 0.26, 0.12, 3.5, 0, wood); // the case
      m.box('paint', -0.05, 0.142, 0, 0.2, 0.01, 3.4, 0, rgbk(0.34, 0.12, 0.09)); // its baize lining
    }
    if (lv.breech >= 1) {
      // the rammer, its padded head to the front, and the shell tongs
      m.tube('paint', [0.45, 0.08, -1.2], [0.45, 0.08, 1.7], 0.05, 0.05, 8, wood);
      m.tube('paint', [0.45, 0.12, -1.6], [0.45, 0.12, -1.2], 0.15, 0.15, 14, rgbk(0.35, 0.27, 0.18));
      for (const sx of [-1, 1]) {
        m.beam('paint', [0.85, 0.05, 0.9], [0.85 + sx * 0.18, 0.05, -0.2], 0.05, 0.05, iron);
        m.beam('paint', [0.85 + sx * 0.18, 0.05, -0.2], [0.85 + sx * 0.08, 0.05, -0.45], 0.05, 0.05, iron);
      }
    }
    if (lv.breech >= 2) {
      // the artificer's chest, its lid up, brass at the corners; three oil cans; a tool roll
      m.box('paint', 0.98, 0.22, 1.35, 0.85, 0.44, 0.5, 0, rgbk(0.36, 0.26, 0.16));
      m.box('paint', 0.98, 0.66, 1.62, 0.85, 0.44, 0.04, 0, rgbk(0.36, 0.26, 0.16), { rx: -0.25 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box('paint', 0.98 + sx * 0.41, 0.42, 1.35 + sz * 0.23, 0.06, 0.06, 0.06, 0, brass);
      for (let k = 0; k < 3; k++) {
        m.tube('paint', [0.4 + k * 0.24, 0.03, 0.62], [0.4 + k * 0.24, 0.33, 0.62], 0.08, 0.08, 12, rgbk(0.25, 0.32, 0.22));
        m.tube('paint', [0.4 + k * 0.24, 0.33, 0.62], [0.46 + k * 0.24, 0.42, 0.58], 0.015, 0.01, 6, iron);
      }
      m.tube('hessian', [0.35, 0.07, -0.75], [1.1, 0.07, -0.75], 0.07, 0.07, 10, rgbk(0.5, 0.45, 0.32));
    }
    m.build(g, mats, { name: 'kit-' });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { group: g, width: W, length: L };
  }

  // Sights and survey: I two aiming posts, red and white, set out in line before the gun; II the director on its
  // tripod; III (once for the battery) the plotting table under an awning with its telephone
  function aimingPosts(m, x, z) {
    for (const [dx, dz] of [[0, 0], [-0.25, -1.3]]) for (let k = 0; k < 8; k++) m.tube('paint', [x + dx, k * 0.3, z + dz], [x + dx, (k + 1) * 0.3, z + dz], 0.03, 0.03, 8, k % 2 ? 0xeeeeea : 0xb02a20, { capA: k === 0, capB: k === 7 });
  }
  function director(m, x, z) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      m.beam('timber', [x + Math.cos(a) * 0.45, 0, z + Math.sin(a) * 0.45], [x, 1.25, z], 0.04, 0.04, three.mesher.grey(0.7));
    }
    m.box('dark', x, 1.36, z, 0.26, 0.2, 0.26, 0.4, 0xffffff);
    m.tube('steel', [x - 0.05, 1.5, z + 0.12], [x + 0.08, 1.52, z - 0.25], 0.04, 0.035, 10, 0xffffff);
  }
  function plottingTable(m, x, z) {
    const { grey, rgbk } = three.mesher;
    m.box('timber', x, 0.78, z, 1.7, 0.06, 0.9, 0, grey(0.7));
    for (const sx of [-0.75, 0.75]) for (const sz of [-0.38, 0.38]) m.box('timber', x + sx, 0.38, z + sz, 0.06, 0.76, 0.06, 0, grey(0.6));
    m.box('paint', x, 0.815, z, 1.3, 0.01, 0.7, 0, rgbk(0.88, 0.84, 0.72)); // the board, its map pinned on it
    m.box('dark', x + 0.6, 0.88, z - 0.25, 0.22, 0.14, 0.16, 0, 0xffffff); // the field telephone
    for (const sx of [-1.2, 1.2]) for (const sz of [-0.9, 0.9]) m.tube('timber', [x + sx, 0, z + sz], [x + sx, sz < 0 ? 2.3 : 2.0, z + sz], 0.04, 0.04, 6, grey(0.6));
    m.quad('canvas', [x - 1.3, 2.32, z - 1.0], [x - 1.3, 2.0, z + 1.0], [x + 1.3, 2.0, z + 1.0], [x + 1.3, 2.32, z - 1.0], rgbk(0.6, 0.58, 0.45), [[0, 0], [0, 2], [2.6, 2], [2.6, 0]]);
  }

  // Camouflage: I the paint (on the gun); II hessian screens on posts along the gun's right and back; III the net's
  // frame over the gun, the net drawn back off it and hung from the frame's back rail. All of it on the far sides from
  // the parade's camera (the gun's left front), so the gun stays in view
  // hessian screens on posts along the gun's right and its back, a gap left for its trail
  function screens(m, box, ox) {
    const x0 = ox + box.min.x - 0.9, x1 = ox + box.max.x + 0.9, zf = box.min.z * 0.35 + box.max.z * 0.1, zb = box.max.z + 0.9, mid = (x0 + x1) / 2;
    const h = () => 0, hh = 1.9;
    three.props.hessianScreen(m, h, [x1, zf], [x1, zb], hh);
    three.props.hessianScreen(m, h, [x0, zb], [mid - 1.2, zb], hh);
    three.props.hessianScreen(m, h, [mid + 1.2, zb], [x1, zb], hh);
  }
  function camoNet(m, box, ox) {
    const { grey, rgbk, h2 } = three.mesher;
    const x0 = ox + box.min.x - 1.2, x1 = ox + box.max.x + 1.2, zb = box.max.z + 1.4, hb = Math.max(2.6, box.max.y + 0.8);
    // the back rail on its poles, guyed to pegs behind
    for (const x of [x0, (x0 + x1) / 2, x1]) m.tube('timber', [x, 0, zb], [x, hb + 0.15, zb], 0.08, 0.06, 6, grey(0.6));
    m.tube('timber', [x0, hb, zb], [x1, hb, zb], 0.05, 0.05, 6, grey(0.6));
    for (const x of [x0, x1]) m.tube('dark', [x, hb + 0.1, zb], [x, 0, zb + hb * 0.6], 0.015, 0.015, 4, grey(0.9));
    // the net hanging in folds from the back rail, its bundle along the top, its foot clear of the ground
    const n = Math.max(4, Math.round((x1 - x0) / 0.7)), dx = (x1 - x0) / n;
    const top = (i) => hb - Math.sin((i / n) * Math.PI * 2) ** 2 * 0.18, foot = (i) => 0.35 + h2(i, 7, 3) * 0.35, zz = (i) => zb + (i % 2 ? 0.22 : -0.02);
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * dx, xb = xa + dx;
      m.quad('scrim', [xa, foot(i), zz(i)], [xb, foot(i + 1), zz(i + 1)], [xb, top(i + 1), zz(i + 1)], [xa, top(i), zz(i)], grey(0.92), [[i * dx, foot(i)], [(i + 1) * dx, foot(i + 1)], [(i + 1) * dx, top(i + 1)], [i * dx, top(i)]]);
    }
    m.tube('hessian', [x0, hb, zb + 0.1], [x1, hb, zb + 0.1], 0.16, 0.16, 8, rgbk(0.42, 0.46, 0.32));
  }

  // Ammunition supply: more of the gun's own shells (with their Shells marks) piled behind its display, a pyramid more
  // with each level, on dunnage, noses out to the front. Drawn instanced: one mesh a part of the shell. Returns
  // { group, width, depth } centred on x and z
  function shellPiles(shellKind, shellLevel, count) {
    const { THREE, mesher, mats } = three;
    const one = shellModel(shellKind, shellLevel), { L, R, low } = one;
    const n = L > 4 ? 1 : R < 0.06 ? 6 : R < 0.1 ? 5 : R < 0.2 ? 4 : 3, pitch = R * 2.04, pw = n * pitch + 0.3, gap = 0.5;
    const width = count * pw + (count - 1) * gap, depth = L + 0.2;
    const mats4 = [];
    for (let p = 0; p < count; p++) {
      const px = -width / 2 + pw / 2 + p * (pw + gap);
      for (let k = 0; k < n; k++) for (let i = 0; i < n - k; i++) {
        mats4.push(new THREE.Matrix4().makeTranslation(px + (i - (n - k - 1) / 2) * pitch, 0.16 + low + k * R * Math.sqrt(3), 0));
      }
    }
    // each mesh of the one shell (its marks included) instanced at every place in the piles
    const g = new THREE.Group();
    one.group.updateMatrixWorld(true);
    one.group.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, mats4.length), local = o.matrixWorld.clone(), mm = new THREE.Matrix4();
      mats4.forEach((M, j) => im.setMatrixAt(j, mm.multiplyMatrices(M, local)));
      im.castShadow = im.receiveShadow = true;
      g.add(im);
    });
    const m = new mesher.Mesher();
    for (let p = 0; p < count; p++) {
      const px = -width / 2 + pw / 2 + p * (pw + gap);
      for (const z of [-depth * 0.35, depth * 0.35]) m.box('timber', px, 0.05, z, pw + 0.15, 0.1, 0.14, 0, mesher.grey(0.6));
      m.box('timber', px, 0.13, 0, pw, 0.05, depth, 0, mesher.grey(0.72));
    }
    m.build(g, mats, { name: 'piles-' });
    return { group: g, width, depth };
  }

  async function build(era, b) {
    const { THREE, mesher, props, mats } = three;
    const group = new THREE.Group(), D = DRESS[era], list = [], lv = { shells: 0, barrel: 0, breech: 0, sights: 0, camo: 0, supply: 0, crew: 0, ...(b.levels ?? {}) };
    progress(`Bringing up the ${b.name ?? b.kind}`, 0.25);
    const t = await template(era, b.kind, lv);
    progress('Forming up the detachments', 0.6);
    await tick();
    const n = Math.max(1, b.guns), all = Math.min(MAX_MEN, b.men), base = Math.min(all, b.base ?? all), reliefs = all - base;
    const w = t.box.max.x - t.box.min.x;
    // a railway gun's men in two halves either side of its bed, and so a detachment too big to stand in front of its
    // gun without hiding it (the No. 1 with the right-hand half); anyone else's in front
    const bed = BED[b.kind] ?? (base > 40 ? [t.box.min.x - 0.5, t.box.max.x + 0.5] : null);
    const halves = bed ? [formation(Math.floor(base / 2), 30, 2), formation(Math.ceil(base / 2), 30, 2)] : null; // two blocks wide at most: deep, not wide
    const F = halves ? { width: 0, depth: Math.max(halves[0].depth, halves[1].depth), spots: [] } : formation(base, w);
    const span = halves ? bed[1] - bed[0] + 3 + halves[0].width + halves[1].width : 0; // the halves and the bed between
    // each gun's ammunition on display beside it, on its left (the camera's side); a railway gun's clear of its bed;
    // its kit on a groundsheet on its right
    let sd = null;
    try { sd = shellDisplay(three.GUNS[b.kind]?.shell ?? b.kind, lv.shells, lv.supply); } catch (e) { console.warn('hangar: shells', e.message); }
    // (an upgradable battery, `b.next`, keeps the kit's place on the gun's right before it has any)
    const kit = kitSheet(lv), up = !!b.next;
    const beside = sd ? sd.width + (BED[b.kind] ? 2.5 : 1.2) : 0, right = kit || up ? KIT.W + (BED[b.kind] ? 2.5 : 1.0) : 0;
    // the line runs on from the first gun's cell (centred on x = 0), so a gun added stands on the place pegged out for
    // it and none of the others moves
    const cell = Math.max(w + beside + right, F.width, span) + 4, x0 = -cell / 2, z0 = t.box.min.z - 2.2;
    let lx0 = x0, lx1 = x0 + cell * n, party = 0, first = null; // first: the nearest gun and its ranks, the overview's frame
    const m = new mesher.Mesher(), mc = new mesher.Mesher(), spots = {}; // mc: the camouflage cover, drawn apart
    let piles = null, zsLast = 0;
    // an upgrade's spot for the camera: where, how big, and the sides it is best seen from (`face`: azimuths in degrees,
    // 0 from the front, -90 from the gun's left, 180 from behind, in order of preference)
    // (`el`: the camera's heights in degrees to try)
    const spot = (part, x, y, z, r, face = null, el = null) => { spots[part] ??= { x, y, z, r, face, el }; };
    for (let i = 0; i < n; i++) {
      const cx = x0 + cell * (i + 0.5), gx = cx + (beside - right) / 2; // the gun, its ammunition and its kit centred in the cell
      const ox = gx - (t.box.min.x + t.box.max.x) / 2;
      const gun = t.root.clone(true);
      gun.position.x = ox;
      group.add(gun);
      spot('camo', gx, t.box.max.y * 0.45, (t.box.min.z + t.box.max.z) / 2, Math.max(w, t.box.max.z - t.box.min.z) * 0.55, [-60, -40, -80, 60, -110], [18, 28, 40]);
      // the barrel's and the breech's spot: the gun's own mark at level III (the muzzle cover from the front quarter,
      // the open breech from behind and above, where no shield or crew stands in the way), the kit before that
      const cal = (three.GUNS[b.kind]?.calibre ?? 6) * 0.0254;
      if (t.muzzle && lv.barrel >= 3) spot('barrel', t.muzzle.x + ox, t.muzzle.y, t.muzzle.z, Math.max(0.9, cal * 6), [40, -40, 65, -65, 90, -90], [14, 24, 36]);
      if (t.breech && lv.breech >= 3) {
        // the open breech and the round on its tray between them
        const c = t.loaded ? t.breech.clone().lerp(t.loaded, 0.5) : t.breech, r = Math.max(1, cal * 4, t.loaded ? t.breech.distanceTo(t.loaded) * 0.75 + 0.4 : 0);
        spot('breech', c.x + ox, c.y, c.z, r, [-150, -125, 180, -100, 150], [32, 46, 60]);
      }
      const zs = Math.max(t.box.min.z + (sd?.depth ?? 0), Math.min(0, t.box.max.z - (sd?.depth ?? 0)));
      zsLast = zs + (sd?.depth ?? 0) / 2 + 0.6 + (piles?.depth ?? 2);
      if (sd) {
        // (the supply's spot takes in the display, whose powder heaps up with it, and the piles behind, or their place)
        const d = i ? sd.group.clone(true) : sd.group, dx = gx - w / 2 - beside + sd.width / 2;
        d.position.set(dx, 0, zs);
        group.add(d);
        spot('shells', dx, 0.6, zs, Math.max(0.9, sd.width * 0.45), [-30, -55, -10, 20], [18, 28, 40]);
        // ammunition supply: more of the gun's own shells piled behind its display, a pyramid a level
        if (lv.supply >= 1) {
          try {
            const pile = i ? piles.group.clone(true) : (piles = shellPiles(three.GUNS[b.kind]?.shell ?? b.kind, lv.shells, lv.supply)).group;
            pile.position.set(dx, 0, zs + sd.depth / 2 + 0.6 + piles.depth / 2);
            group.add(pile);
          } catch (e) { console.warn('hangar: piles', e.message); }
        }
        const pz = zs + sd.depth / 2 + 0.6 + (piles?.depth ?? sd.L + 0.2) / 2;
        if (lv.supply >= 1 || up) spot('supply', dx, 0.6, (zs + pz) / 2, Math.max(2.2, sd.width * 0.55, pz - zs + 0.6, (piles?.width ?? 0) * 0.6), [-30, -55, -10, 20], [44, 56, 32]); // from above the display in front
      }
      // the kit lies on the gun's right, the barrel's on the sheet's left half, the breech's on its right: seen from the
      // right front, from above (before any is bought, its place)
      const kx = gx + w / 2 + right - KIT.W / 2, kz = (t.box.min.z + t.box.max.z) / 2;
      if (kit) {
        const k = i ? kit.group.clone(true) : kit.group;
        k.position.set(kx, 0, kz);
        group.add(k);
      }
      if (lv.barrel || up) spot('barrel', kx - KIT.W / 4, 0.2, kz, 1.5, [30, 55, 10, 80], [48, 38, 58]);
      if (lv.breech || up) spot('breech', kx + KIT.W / 4, 0.2, kz, 1.5, [30, 55, 10, 80], [48, 38, 58]);
      // sights: the aiming posts before the gun's left, the director by its right
      // (together on the left flank of the gun's ranks, or on a railway gun's bed between its halves: seen from the
      // front, nothing in the way)
      if (lv.sights >= 1 || up) {
        const sx = halves ? ox + bed[0] + 1.2 : Math.min(gx - w / 2, cx - F.width / 2) - 1.2, sz = z0 - 0.6, side = halves ? 1 : -1;
        if (lv.sights >= 1) aimingPosts(m, sx, sz);
        if (lv.sights >= 2) director(m, sx + side * (halves ? 1 : 1.5), sz - 0.6); // (on a bed, clear of its rails)
        spot('sights', sx + side * 0.6, 1, sz - 0.8, 2.2, [-30, 0, -55, 25], [30, 42, 20]);
      }
      // camouflage: hessian screens on its right and back, the net drawn back off it
      if (lv.camo >= 2) screens(mc, t.box, ox);
      if (lv.camo >= 3) camoNet(mc, t.box, ox);
      // the overview's frame: the gun and its nearest men (a big detachment runs on out of the picture)
      if (i === 0) {
        // the gun's box and its ranks' (their nearest 8 m; of halves either side of a bed, the nearest files), each
        // [x0, x1, y0, y1, z0, z1]
        const mx = halves ? [ox + bed[0] - 3, ox + bed[1] + 3] : [cx - F.width / 2, cx + F.width / 2];
        first = [[gx - w / 2, gx + w / 2, 0, t.box.max.y, t.box.min.z, t.box.max.z], [...mx, 0, 1.85, z0 - Math.min(F.depth, halves ? 4 : 8) - 0.3, z0]];
      }
      if (halves) {
        halves.forEach((h, side) => {
          const hx = side ? ox + bed[1] + 1.5 + h.width / 2 : ox + bed[0] - 1.5 - h.width / 2;
          h.spots.forEach(([x, z], k) => list.push([side && k === h.spots.length - 1 ? D.no1 : D.man, (k + side) % 4, hx + x, z0 - z, 0]));
          if (side) party = hx;
          lx0 = Math.min(lx0, hx - h.width / 2 - 2);
          lx1 = Math.max(lx1, hx + h.width / 2 + 2);
        });
        continue;
      }
      // the detachment in front of its gun, the No. 1 (the last spot) a pace ahead of the right of the line
      F.spots.forEach(([x, z], k) => list.push([k === F.spots.length - 1 ? D.no1 : D.man, (k + i) % 4, cx + x, z0 - z, 0]));
    }
    // more guns: the next gun's place pegged out and taped at the end of the line, where it will stand; the Guns row's
    // spot on it, seen from beyond the line's end with the last gun behind it (bought, the new gun stands there, behind
    // the next place); with every gun in, the last gun
    const gxAt = (i) => x0 + cell * (i + 0.5) + (beside - right) / 2, gz = (t.box.min.z + t.box.max.z) / 2;
    if (b.next?.guns > n) {
      const ox = gxAt(n) - (t.box.min.x + t.box.max.x) / 2, grey = mesher.grey;
      const xa = ox + t.box.min.x - 0.3, xb = ox + t.box.max.x + 0.3, za = t.box.min.z - 0.3, zb = t.box.max.z + 0.3;
      const corners = [[xa, za], [xb, za], [xb, zb], [xa, zb]];
      corners.forEach(([x, z], k) => {
        m.tube('timber', [x, 0, z], [x, 0.6, z], 0.045, 0.035, 6, grey(0.6));
        const [x2, z2] = corners[(k + 1) % 4];
        m.tube('paint', [x, 0.5, z], [x2, 0.5, z2], 0.022, 0.022, 4, 0xf2f2ee, { capA: false, capB: false });
      });
      spot('guns', gxAt(n), t.box.max.y * 0.4, gz, cell * 0.5, [80, 100, 60, 120], [30, 40, 22]);
      lx1 = Math.max(lx1, x0 + cell * (n + 1));
    } else if (b.next) spot('guns', gxAt(n - 1), t.box.max.y * 0.4, gz, Math.max(w, t.box.max.z - t.box.min.z) * 0.6, [-35, -55, -15], [24, 34, 16]);
    // the relief crews: a squad of their own at the right of the parade, in their working dress, standing easy
    if (reliefs > 0) {
      const R = formation(reliefs + 1, 8, 2), rx = lx1 + 3 + R.width / 2, h2 = mesher.h2; // two blocks wide at most, as the halves
      R.spots.slice(0, -1).forEach(([x, z], k) => list.push([D.relief, (k + 2) % 4, rx + x + (h2(k, 3, 1) - 0.5) * 0.25, z0 - z + (h2(k, 4, 2) - 0.5) * 0.25, (h2(k, 5, 3) - 0.5) * 0.5]));
      spot('crew', rx, 0.9, z0 - Math.min(R.depth, 7) / 2, Math.max(3, Math.min(R.width, 12) * 0.6), [-15, 10, -40, 35], [28, 40, 18]); // from their front (a big squad's front block)
      lx1 = rx + R.width / 2 + 2;
    } else if (b.next?.reliefs > 0) {
      // none yet: their place, kept for the squad the first level brings
      const R = formation(b.next.reliefs + 1, 8, 2), rx = lx1 + 3 + R.width / 2;
      spot('crew', rx, 0.9, z0 - Math.min(R.depth, 7) / 2, Math.max(3, Math.min(R.width, 12) * 0.6), [-15, 10, -40, 35], [28, 40, 18]);
      lx1 = rx + R.width / 2 + 2;
    } else spot('crew', halves ? party : 0, 0.9, z0 - F.depth / 2, Math.max(4, F.width * 0.6));
    // sights III, once for the battery: the plotting table at the far end of the line, behind the reliefs
    if (lv.sights >= 3) { plottingTable(m, lx1 + 3, t.box.max.z - 1); spots.sights = { x: lx1 + 3, y: 1, z: t.box.max.z - 1, r: 2.2, face: [-35, -60, -10, 25], el: [26, 36, 18] }; lx1 += 6; }
    m.build(group, mats, { name: 'upgrades-' });
    const cover = new THREE.Group();
    cover.name = 'cover';
    mc.build(cover, mats, { name: 'cover-' });
    group.add(cover);
    group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const lot = { x0: lx0, x1: lx1, first, zFront: z0 - F.depth - 1.5, zBack: Math.max(t.box.max.z, piles ? zsLast + 3 : 0), height: t.box.max.y };
    // the inspecting officer and his sergeant, facing the ranks (a railway gun's: its right-hand half, off the bed)
    if (all) list.push([D.officer, 2, party - 0.6, lot.zFront - 1.5, Math.PI], [D.sergeant, 1, party + 0.9, lot.zFront - 0.6, Math.PI]);
    const crews = men(list);
    group.add(...crews);
    return { group, crews, lot, spots };
  }

  function dispose(p) {
    three.scene.remove(p.group);
    for (const im of p.crews) im.dispose(); // the baked geometries stay for the next parade
  }

  // ---------------------------------------------------------------- the camera on the battery, or on one upgrade
  // The battery framed from the right front along its line; an upgrade's spot (hovered in the modifications panel)
  // closer, with a brass ring pulsing on the ground under it. The camera glides between them.
  let looking = null, glide = null, ring = null, pulse = 0;
  // The battery framed from its left front, looking along its line, a little above, as a parade photograph: the nearest
  // gun and its ranks projected and fitted into the gap between the panels (on a wide screen they stand over the view:
  // the details on the left, the modifications on the right, the batteries along the bottom), centred in it, the rest
  // of the battery receding down the line behind it; the ammunition and the kit beside the gun show at the sides, and
  // close up when their upgrade is looked at
  const GAP_NDC = { wide: { x0: -0.4, x1: 0.3, y0: -0.66, y1: 0.78 }, narrow: { x0: -0.92, x1: 0.92, y0: -0.9, y1: 0.86 } };
  function framing() {
    const { THREE, camera } = three;
    const lot = park.lot, top = Math.max(lot.height, 2);
    const corners = [];
    for (const [x0, x1, y0, y1, z0, z1] of lot.first ?? [[lot.x0, lot.x1, 0, top, lot.zFront, lot.zBack]]) {
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) corners.push(new THREE.Vector3(x, y, z));
    }
    const gap = innerWidth > 1100 ? GAP_NDC.wide : GAP_NDC.narrow, az = -55, el = 18;
    const target = new THREE.Box3().setFromPoints(corners).getCenter(new THREE.Vector3());
    let dist = Math.max(10, Math.hypot(lot.x1 - lot.x0, lot.zBack - lot.zFront) * 1.2);
    const keep = { p: camera.position.clone(), q: camera.quaternion.clone() }, v = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      camera.position.copy(orbit(target, dist, az, el));
      camera.lookAt(target);
      camera.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of corners) {
        v.copy(c).project(camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      // move the target so the box's centre sits at the gap's centre, then scale the distance to fit
      const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
      r.setFromMatrixColumn(camera.matrixWorld, 0);
      u.setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(r, (((x0 + x1) / 2 - (gap.x0 + gap.x1) / 2) * halfW));
      target.addScaledVector(u, (((y0 + y1) / 2 - (gap.y0 + gap.y1) / 2) * halfH));
      dist *= Math.max((x1 - x0) / (gap.x1 - gap.x0), (y1 - y0) / (gap.y1 - gap.y0), 0.4);
    }
    camera.position.copy(keep.p);
    camera.quaternion.copy(keep.q);
    camera.updateMatrixWorld();
    return { target, pos: orbit(target, dist, az, el), dist };
  }
  const orbit = (target, dist, azDeg, elDeg) => {
    const { THREE } = three, az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
    return new THREE.Vector3(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z - Math.cos(az) * Math.cos(el) * dist);
  };
  function aim(view, now) {
    const { controls, camera } = three;
    controls.autoRotate = !looking;
    idleUntil = 0;
    if (now) { controls.target.copy(view.target); camera.position.copy(view.pos); glide = null; controls.update(); return; }
    glide = { t0: performance.now(), dur: 900, from: { target: controls.target.clone(), pos: camera.position.clone() }, to: view };
  }
  // the light and the shadow round the battery
  function light() {
    const { sun } = three, lot = park.lot;
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.zFront + lot.zBack) / 2, r = Math.max(6, Math.hypot(lot.x1 - lot.x0, lot.zBack - lot.zFront, lot.height) / 2);
    sun.position.set(cx - r * 1.6 - 20, r * 2.5 + 40, cz - r - 25);
    sun.target.position.set(cx, 0, cz);
    const s = sun.shadow.camera, e = r * 1.5 + 8;
    Object.assign(s, { left: -e, right: e, top: e, bottom: -e, near: 1, far: r * 8 + 200 });
    s.updateProjectionMatrix();
  }
  function focus(now = true) {
    const { camera, controls } = three, v = framing();
    controls.minDistance = Math.min(2.5, v.dist * 0.2);
    controls.maxDistance = v.dist * 2.5;
    camera.near = 0.1;
    camera.updateProjectionMatrix();
    light();
    look(looking, now);
  }
  // The view of an upgrade's spot: from the first of its preferred sides (or the generic ones), at a few heights, from
  // which nothing of the parade stands between the camera and the spot. Rays go from the camera to the spot and to points
  // round it; a hit nearer than the spot by more than a little (the thing's own surface) is something in the way. The
  // best is cached per parade and part.
  let ray = null;
  function bestView(part, sp) {
    const { THREE } = three;
    ray ??= new THREE.Raycaster();
    park.views ??= {};
    if (park.views[part]) return park.views[part];
    const target = new THREE.Vector3(sp.x, sp.y, sp.z), cam = three.camera;
    // far enough that the spot fits the gap between the details and the modifications panels (on a wide screen they
    // stand over the view: about 37 % of its width is free), and the lower part of its height
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), free = innerWidth > 1100 ? 0.37 : 0.9;
    const dist = Math.max(4, sp.r / Math.min(tanV * cam.aspect * free, tanV * 0.7));
    const faces = sp.face ?? [-38, -65, -15, 20, -95, 50, 180, -140, 140];
    const meshes = [];
    park.group.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
    const slack = Math.min(0.8, sp.r * 0.4), probe = sp.r * 0.25;
    const offsets = [[0, 0, 0], [probe, 0, 0], [-probe, 0, 0], [0, probe, 0], [0, 0, probe], [0, 0, -probe]];
    const dir = new THREE.Vector3(), aimAt = new THREE.Vector3();
    let best = null;
    for (const el of sp.el ?? [16, 28, 42]) {
      for (const az of faces) {
        const pos = orbit(target, dist, az, el);
        let clear = 0;
        for (const [ox, oy, oz] of offsets) {
          aimAt.set(target.x + ox, target.y + oy, target.z + oz);
          const d = pos.distanceTo(aimAt);
          ray.set(pos, dir.subVectors(aimAt, pos).normalize());
          ray.far = d;
          const hit = ray.intersectObjects(meshes, false)[0];
          if (!hit || hit.distance > d - slack) clear++;
        }
        const score = clear / offsets.length;
        if (!best || score > best.score) best = { target, pos, score };
        if (score === 1) { park.views[part] = best; return best; }
      }
    }
    park.views[part] = best;
    return best;
  }

  // the camera onto an upgrade's spot (or back to the battery for none, or a part with nothing to show)
  function look(part, now = false) {
    looking = part && park?.spots[part] ? part : null;
    if (!three || !park) return;
    const { THREE, scene } = three;
    if (!ring) {
      ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8c56e, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      ring.renderOrder = 2;
      scene.add(ring);
    }
    // the camouflage net and the screens are drawn back while another upgrade is looked at (the battlefield's cutaway
    // does the same round the gun in view)
    const cover = park.group.getObjectByName('cover');
    if (cover) cover.visible = !looking || looking === 'camo';
    if (!looking) { ring.visible = false; aim(framing(), now); return; }
    const sp = park.spots[looking], view = bestView(looking, sp);
    ring.visible = true;
    ring.position.set(sp.x, 0.05, sp.z);
    ring.scale.setScalar(sp.r);
    pulse = 0;
    aim(view, now);
  }

  function frame() {
    raf = 0;
    if (!active || !three || !park || document.hidden) return;
    const { controls, camera, renderer, scene } = three;
    if (glide) {
      const k = Math.min(1, (performance.now() - glide.t0) / glide.dur), e = k * k * (3 - 2 * k);
      controls.target.lerpVectors(glide.from.target, glide.to.target, e);
      camera.position.lerpVectors(glide.from.pos, glide.to.pos, e);
      if (k >= 1) glide = null;
    } else if (!looking && !controls.autoRotate && performance.now() > idleUntil) controls.autoRotate = true;
    if (ring?.visible) { pulse += 0.05; ring.material.opacity = 0.45 + 0.35 * Math.sin(pulse * 2.2); }
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const run = () => { if (active && three && park && !raf) raf = requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', run);

  // The battery drawn up (built again only when it changes). A new parade is put together off the scene, its shaders
  // compiled against the scene's lights and fog, then swapped in with its scenery and drawn once (the textures and the
  // shadow map go to the GPU) before it is shown. Until then the battery before it stays in view; the veil comes up
  // at once the first time (under the menu's loading screen) and after a moment on a later change.
  async function show({ era, battery: b }) {
    const key = `${era}|${b.kind}:${b.guns}:${b.men}:${b.base ?? b.men}:${JSON.stringify(b.levels ?? {})}:${JSON.stringify(b.next ?? null)}`;
    if (key === parkKey || key === want) return;
    want = key;
    if (failed) { fallback(b.kind); onReady(); return; }
    const slow = setTimeout(() => { if (want === key) veil.hidden = false; }, park ? 350 : 0);
    try {
      if (!three) { progress('Loading the 3D engine', 0.05); await setup(); }
      const p = await build(era, b);
      if (want !== key) { for (const im of p.crews) im.dispose(); return; } // another battery was asked for meanwhile
      progress('Laying out the parade ground', 0.8);
      await tick();
      const { THREE, renderer, scene, camera } = three;
      const env = environment(era, p.lot.x0, p.lot.x1, p.lot.zFront, p.lot.zBack);
      progress('Preparing the shaders', 0.9);
      const staging = new THREE.Group();
      staging.add(p.group, env);
      await renderer.compileAsync(staging, camera, scene);
      if (want !== key) { for (const im of p.crews) im.dispose(); three.mesher.disposeGroup(env); return; }
      if (park) dispose(park);
      if (three.env) three.mesher.disposeGroup(three.env);
      scene.add(p.group, env);
      park = p;
      parkKey = key;
      three.env = env;
      if (ring) ring.visible = false;
      focus(true);
      three.resize();
      renderer.render(scene, camera);
      await nextFrame();
      progress('Ready', 1);
      still.hidden = true;
      run();
      onReady();
    } catch (e) {
      console.warn('hangar:', e);
      // a parade that would not draw leaves the scene, so it does not stop every battery after it drawing too
      if (park && parkKey === key && three) {
        three.scene.remove(park.group, three.env);
        dispose(park);
        three.mesher.disposeGroup(three.env);
        park = null;
        parkKey = '';
        three.env = null;
      }
      failed = failed || !three;
      fallback(b.kind);
      onReady();
    } finally {
      clearTimeout(slow);
      if (want === key) { veil.hidden = true; want = null; }
    }
  }

  return {
    show,
    lookAt(part) { look(part); run(); },
    // for the headless tools (tools/hangarsheet.mjs): the camera onto a part (null: the battery) at once, standing
    // still, the ring steady, one frame drawn
    pose(part) {
      if (!three || !park) return false;
      look(part, true);
      three.controls.autoRotate = false;
      idleUntil = Infinity;
      if (ring) ring.material.opacity = 0.6;
      three.resize();
      three.renderer.render(three.scene, three.camera);
      return true;
    },
    get three() { return three; }, // the scene, camera and controls, for the headless tools (window.__menuHangar)
    get park() { return park; }, // the parade in view (its lot, spots, group), for the same
    setActive(on) {
      active = on;
      if (on) { three?.resize(); run(); }
    },
  };
}

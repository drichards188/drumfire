// The max-quality battery's motion on the real game path (shots/maxq/PLAN.md, track M): the test range's 21 cm Mörser 18
// (the WW1 page, as the basic training), laid on a target 3 km or more away and fired a series, stepped at 30 fps
// without drawing, every man's place, heading and pose and the gun's recoil recorded each frame, and a frame strip of
// the shot drawn at the given moments (the sim held while the exposure settles). Needs the dev server.
//   node tools/motioncheck.mjs [--maxq 1] [--quality High] [--out shots/maxq/wave-a/m] [--tag after] [--size 1280x720]
//     [--rounds 2] [--shot 1] [--strip -0.6,-0.2,0,0.05,0.15,0.4,1.0] [--cam side] [--steps open@0.7,ram@0.6,...]
//     [--fp lay|load|fire|cmd] [--keys KeyS] [--json] [--settle 6] [--seconds 140]
// --strip: seconds from shot number --shot (negative before it), drawn with camera --cam (side, rear, left, close,
// breech, over or "cx,cy,cz,lx,ly,lz" in the gun's traverse frame); --steps: cycle moments step@k of the first cycle, drawn
// from every camera of --cams (default side,rear); --fp: man the first gun at that post (crew help on) and draw the
// first-person view instead; --keys: keys held for the gunner from the start (comma separated). Writes
// <out>/motion_<tag>_shot.png (the strip), <out>/motion_<tag>_steps.png and, with --json, <out>/motion_<tag>.json (every
// frame); prints a summary: per man top speed, teleports (over 0.2 m in a frame), heading snaps (over 0.25 rad), poses
// held for one frame; at each shot the ears, the pull, the commander's arm drop, the ground men's jolt; the recoil curves.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] != null && !args[i + 1].startsWith('--') ? args[i + 1] : i >= 0 ? true : d; };
const maxq = String(opt('--maxq', '1')), quality = opt('--quality', 'High'), outDir = opt('--out', 'shots/maxq/wave-a/m'), tag = opt('--tag', 'run');
const [W, H] = String(opt('--size', '1280x720')).split('x').map(Number);
const rounds = Number(opt('--rounds', '2')), shotNo = Number(opt('--shot', '1')), settle = Number(opt('--settle', '6'));
const strip = String(opt('--strip', '-0.6,-0.2,0,0.05,0.15,0.4,1.0')).split(',').map(Number).sort((a, b) => a - b);
const stripCam = String(opt('--cam', 'side')), stepCams = String(opt('--cams', 'side,rear')).split(',');
const steps = opt('--steps', null) ? String(opt('--steps')).split(',').map((s) => ({ step: s.split('@')[0], k: Number(s.split('@')[1]) })) : [];
const fp = opt('--fp', null), keys = opt('--keys', null) ? String(opt('--keys')).split(',') : [];
const seconds = Number(opt('--seconds', '150'));
const url = `/?range=1&mode=ww1&kind=mrs18&quality=${quality}&lv=crew3.shells3.barrel3.breech3.sights3.camo3.supply3${maxq !== '0' ? `&maxq=${maxq}` : ''}`;
fs.mkdirSync(outDir, { recursive: true });

const exe = [...(process.env.CHROME ? [process.env.CHROME] : []), 'chromium-1217', 'chromium-1247']
  .map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: [...(process.env.GPU === '1' ? ['--use-angle=gl', '--use-gl=angle', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W * 2, height: H } });
await page.addInitScript(() => {
  const O = window.WebSocket;
  window.WebSocket = function (u, p) { if (p === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 }; return new O(u, p); };
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
const t0 = Date.now();
await page.goto(`http://localhost:5201${url}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__drumfire?.state === 'playing' && window.__drumfire.sim?.units?.length && window.__drumfire.renderLayer?.guns, null, { timeout: 300000, polling: 500 });
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${url}`);
await page.addStyleTag({ content: '#view > *:not(canvas), #gunner, #man-gun, #tut-card, #spot { display: none !important; }' });

const setup = await page.evaluate(async ({ rounds, fp, keys }) => {
  const D = window.__drumfire, sim = D.sim, u = sim.units[0], p = u.pieces[0];
  D.renderer.setAnimationLoop(null);
  const v = D.renderLayer.guns.byKey.get(`${u.id}:0`);
  if (!v?.crew) return { error: 'no crew view' };
  const crew = v.crew, rig = v.rig;
  for (const m of crew.men) { const f = m.fig, pose = f.pose.bind(f); f.pose = (n, t, b) => { m._pn = n; m._pt = t; return pose(n, t, b); }; }
  const { shotIn } = await import('/src/render/herocues.js');
  // the camera from a point to a point of the gun's traverse frame, through the chase camera's free mode
  const tv = rig.pivots.traverse ?? rig.root;
  const A = new D.camera.position.constructor(), B = new D.camera.position.constructor();
  window.__mc = { crew, rig, u, p, shotIn, frames: [] };
  window.__mc.cam = (cx, cy, cz, lx, ly, lz) => {
    tv.updateMatrixWorld(true);
    A.set(cx, cy, cz); tv.localToWorld(A); B.set(lx, ly, lz); tv.localToWorld(B);
    const ch = D.chase; ch.free(true);
    const dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z, d = Math.hypot(dx, dy, dz);
    ch.focus.copy(B); ch.yaw = ch.goalYaw = Math.atan2(dx, dz); ch.pitch = ch.goalPitch = Math.asin(dy / d); ch.dist = ch.goalDist = d;
  };
  // a target 3 km or more away that the battery can be laid on
  let pick = null;
  const ts = (sim.targets ?? []).filter((t) => !t.offmap && t.parts?.length).map((t) => [t, Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z)]).filter(([, d]) => d > 3000).sort((a, b) => a[1] - b[1]);
  for (const [t] of ts) { if (!t.alive) sim.targetAI?.revive?.(t); if (sim.command(u.id, 'lay', { x: t.pos.x, z: t.pos.z }) && u.order.ok) { pick = t; break; } }
  if (!pick) return { error: 'no target in reach' };
  if (fp) D.man(D.units.findIndex((x) => x.id === u.id), { piece: 0, post: fp, assist: true });
  for (const k of keys) D.gunner?.held?.add?.(k);
  sim.command(u.id, 'rounds', { n: rounds });
  sim.command(u.id, 'fire', { guns: 'all' });
  return { unit: u.id, kind: p.kind, target: pick.kind ?? pick.id, range: Math.round(Math.hypot(pick.pos.x - u.pos.x, pick.pos.z - u.pos.z)), el: +p.cmd.el.toFixed(3), az: +p.cmd.az.toFixed(3), state: p.state, hero: !!crew.hero, hd: !!rig.hd, body: !!rig.body, gear: !!rig.gear };
}, { rounds, fp, keys });
console.log('setup', JSON.stringify(setup));
if (setup.error) { await browser.close(); process.exit(1); }

const CAMS = {
  side: [9, 2.6, 2.4, 0, 1.7, 2.0], rear: [-2.6, 4.6, 11.5, 0, 1.4, 2.4], left: [-6.8, 2.3, 1.2, -0.9, 1.5, 0.9],
  close: [15, 5.5, 11, 0, 1.6, 1.4], breech: [3.6, 2.4, 4.6, 0.3, 1.9, 2.3], over: [2.5, 7.5, 7.5, 0, 1.2, 2.2],
};
const camOf = (n) => CAMS[n] ?? String(n).split(',').map(Number);

// step one frame (1/30 s) and record it
const step = () => page.evaluate(() => {
  const M = window.__mc, D = window.__drumfire, sim = D.sim, p = M.p, crew = M.crew, rig = M.rig;
  D.frame(1 / 30, false);
  const now = sim.time + (sim.alpha ?? 0) * 0.05, j = p.job;
  const f = [+now.toFixed(3), j ? j.step : p.state, j ? +(j.t / Math.max(0.01, j.dur)).toFixed(3) : -1, +crew.ears.toFixed(3),
    ((st) => (Number.isFinite(st) ? +st.toFixed(3) : null))(crew.shotT !== undefined ? crew.shotT : M.shotIn(p, now, sim.time)), crew.pull != null ? +crew.pull.toFixed(3) : null, crew.feuer != null ? +crew.feuer.toFixed(3) : null,
    +(rig.pivots.recoil?.position.z ?? 0).toFixed(4), +(rig.pivots.carriage?.position.z ?? 0).toFixed(4),
    +(rig.body?.position.y ?? 0).toFixed(4), +(rig.body?.rotation.x ?? 0).toFixed(5), +rig.root.position.y.toFixed(4), +(now - p.firedAt).toFixed(3), [], p.firedAt];
  const w = M.w ??= new rig.root.position.constructor();
  for (const m of crew.men) {
    if (!m.root.visible) { f[13].push(null); continue; }
    m.root.getWorldPosition(w);
    f[13].push([m.role, +m.x.toFixed(3), +m.y.toFixed(3), +m.z.toFixed(3), +m.h.toFixed(3), m._pn, +(m._pt ?? 0).toFixed(3), +w.y.toFixed(4)]);
  }
  M.frames.push(f);
  return [f[0], f[1], f[2], f[4], f[12], f[14]];
});
// draw the frame now from camera `cam` with the sim held (the exposure settles), into the strip `name`, tile `col`
const draw = (name, col, row, cam, label) => page.evaluate(({ name, col, row, cam, label, settle, fp }) => {
  const D = window.__drumfire, M = window.__mc;
  if (!fp && cam) M.cam(...cam);
  const keep = D.params.timeScale; D.params.timeScale = 0;
  for (let i = 0; i < settle; i++) D.frame(1 / 30, true);
  D.params.timeScale = keep;
  const src = D.renderer.domElement, S = (M.sheets ??= {})[name] ??= { c: document.createElement('canvas'), w: Math.min(640, src.width), h: 0 };
  S.h = Math.round(S.w * src.height / src.width);
  const need = [(col + 1) * S.w, (row + 1) * S.h];
  if (S.c.width < need[0] || S.c.height < need[1]) { const o = document.createElement('canvas'); o.width = S.c.width; o.height = S.c.height; if (o.width) o.getContext('2d').drawImage(S.c, 0, 0); S.c.width = Math.max(S.c.width, need[0]); S.c.height = Math.max(S.c.height, need[1]); S.c.getContext('2d').drawImage(o, 0, 0); }
  const g = S.c.getContext('2d');
  g.drawImage(src, col * S.w, row * S.h, S.w, S.h);
  g.fillStyle = '#000b'; g.fillRect(col * S.w, row * S.h, S.w, 18); g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(label, col * S.w + 5, row * S.h + 13);
  return true;
}, { name, col, row, cam, label, settle, fp });
const save = async (name, file) => {
  const data = await page.evaluate((n) => window.__mc.sheets?.[n]?.c.toDataURL('image/png') ?? null, name);
  if (data) { fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64')); console.log('saved', file); }
};

// run: the strip's moments before the shot on the shot clock (crew.shotT), after it on the time since the shot
let shots = 0, lastFired = null, si = 0, firstCycle = -1;
const stepDone = steps.map(() => false);
const frames = Math.ceil(seconds * 30);
for (let i = 0; i < frames; i++) {
  const [now, s, k, shotT, tf, firedAt] = await step();
  if (firedAt !== lastFired && firedAt > -900) { lastFired = firedAt; shots++; if (shots === 1 && firstCycle < 0) firstCycle = 1; }
  // the first loading cycle's moments (after the first shot, or before it when the gun started unloaded)
  for (let q = 0; q < steps.length; q++) if (!stepDone[q] && s === steps[q].step && k >= steps[q].k) {
    stepDone[q] = true;
    for (let c = 0; c < stepCams.length; c++) await draw('steps', q, c, camOf(stepCams[c]), `${steps[q].step}@${steps[q].k} ${stepCams[c]}`);
  }
  // the strip around shot number shotNo
  if (si < strip.length && shots === shotNo - 1 && strip[si] < 0 && shotT != null && shotT <= -strip[si]) { await draw('shot', si % 4, Math.floor(si / 4), camOf(stripCam), `tf ${strip[si]} (shotIn ${shotT})`); si++; }
  if (si < strip.length && shots === shotNo && strip[si] >= 0 && tf >= strip[si] - 1e-6) { await draw('shot', si % 4, Math.floor(si / 4), camOf(stripCam), `tf +${strip[si]} (${tf.toFixed(3)})`); si++; }
  // done: the series fired and 4.5 s after the last shot
  if (shots >= rounds && tf > 4.5 && si >= strip.length && stepDone.every(Boolean)) break;
}
await save('shot', `${outDir}/motion_${tag}_shot.png`);
if (steps.length) await save('steps', `${outDir}/motion_${tag}_steps.png`);
const F = await page.evaluate(() => window.__mc.frames);
if (args.includes('--json')) { fs.writeFileSync(`${outDir}/motion_${tag}.json`, JSON.stringify({ setup, url, frames: F })); console.log('saved', `${outDir}/motion_${tag}.json`); }
await browser.close();

// ---- the summary
const men = {};
const ROLE = 0, X = 1, Y = 2, Z = 3, HD = 4, POSE = 5, WY = 7;
for (let i = 1; i < F.length; i++) {
  const a = F[i - 1], b = F[i], dt = b[0] - a[0];
  if (!(dt > 0) || dt > 0.2) continue;
  b[13].forEach((m, j) => {
    const o = a[13][j];
    if (!m || !o) return;
    const R = men[m[ROLE]] ??= { v: 0, tp: 0, snap: 0, blip: 0, run: 0, worst: [] };
    const d = Math.hypot(m[X] - o[X], m[Z] - o[Z]), dh = Math.abs(Math.atan2(Math.sin(m[HD] - o[HD]), Math.cos(m[HD] - o[HD])));
    if (d > 0.2) { R.tp++; if (R.worst.length < 4) R.worst.push(`tp ${d.toFixed(2)} @${b[1]} k${b[2]}`); } else { R.v = Math.max(R.v, d / dt); if (d / dt > 2) R.run += dt; }
    if (dh > 0.25) { R.snap++; if (R.worst.length < 4) R.worst.push(`snap ${dh.toFixed(2)} @${b[1]} k${b[2]}`); }
    const c = F[i + 1]?.[13][j];
    if (c && o[POSE] !== m[POSE] && c[POSE] !== m[POSE]) { R.blip++; if (R.worst.length < 4) R.worst.push(`blip ${m[POSE]} @${b[1]} k${b[2]}`); }
  });
}
console.log('per man (v m/s top speed, tp teleports, snap heading snaps, blip one-frame poses, run s over 2 m/s):');
for (const [r, R] of Object.entries(men)) console.log(`  ${r.padEnd(9)} v${R.v.toFixed(2)} tp${R.tp} snap${R.snap} blip${R.blip} run${R.run.toFixed(1)} ${R.worst.join('; ')}`);
const shotsAt = [...new Set(F.map((f) => f[14]).filter((x) => x > -900))];
for (const ts of shotsAt) {
  const at = (tf) => F.reduce((b, f) => (Math.abs(f[0] - ts - tf) < Math.abs((b?.[0] ?? 1e9) - ts - tf) ? f : b), null);
  const pre = F.filter((f) => f[0] < ts).pop(), sh = F.find((f) => f[0] >= ts - 1e-6);
  const up = F.filter((f) => f[0] < ts + 1 && f[6] != null && f[6] > 0.9).pop(), drop = up && F.find((f) => f[0] > up[0] && f[6] != null && f[6] < 0.5);
  let shake = 0;
  const base = new Map();
  for (const f of F) {
    const tf = f[0] - ts;
    f[13].forEach((m, j) => { if (!m || m[Y] > 0.3) return; if (tf < 0 && tf > -0.5) base.set(j, m[WY]); else if (tf >= 0 && tf < 1.5 && base.has(j)) shake = Math.max(shake, Math.abs(m[WY] - base.get(j))); });
  }
  console.log(`shot at ${ts.toFixed(2)}: ears ${pre?.[3]} / ${sh?.[3]}, pull ${pre?.[5]} / ${sh?.[5]}, shotIn before ${pre?.[4]}, arm drop ${drop ? (drop[0] - ts).toFixed(3) : '-'} s, ground men jolt ${(shake * 1000).toFixed(1)} mm`);
  console.log('  recoil (tf: barrel / top carriage m, body y mm / pitch mrad, root y): ' + [0.05, 0.15, 0.3, 0.45, 0.8, 1.45, 2.5, 3.5, 4.2].map((t) => { const f = at(t); return f ? `${t}: ${f[7]}/${f[8]} ${(f[9] * 1000).toFixed(1)}/${(f[10] * 1000).toFixed(2)} ${f[11]}` : ''; }).join(' | '));
}

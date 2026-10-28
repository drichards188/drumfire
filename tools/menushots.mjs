// The main menu's background stills (src/ui/menu.js, menuItems.js STILLS): a gun of each kind firing, captured from
// the game itself in a private headless Chromium (as tools/shot.mjs: SwiftShader, no HMR, the career's dev mode on so
// every battery plays), with the console and the overlay hidden and the 3D view the full width. Writes
// public/menu/<id>.jpg. Needs the dev server on port 5201.
//   node tools/menushots.mjs [id ...] [--size 1920x1080] [--quality High] [--out public/menu]    (no ids: every shot)
// Each run plays a new battle (the game takes a random seed), so look at the pictures before keeping them.
// A shot: the page, the gun (by kind; put on auto so it fires), a fast-forward into the battle, then frames until it
// fires and `after` frames of the blast; `cam` holds the orbit camera on the piece that fires.
// The screen-space blast ring and heat shimmer are switched off (under SwiftShader they smear the whole frame).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const size = opt('--size', '1920x1080').split('x').map(Number);
const quality = opt('--quality', 'High');
const OUT = opt('--out', 'public/menu');

const B1917 = '/?play=1', BWW1 = '/?mode=ww1&op=ridge&play=1', BWW2 = '/?mode=ww2&op=flanders&play=1';
// cam: [yaw off the gun's back (0 behind it, + round to its right), pitch, distance in metres]
export const SHOTS = [
  // 1917 British
  { id: 'bl15', url: B1917, hour: 15, kind: 'bl15', ff: 30, cam: [0.8, 0.32, 30], after: 6 },
  { id: 'bl92', url: B1917, hour: 14, kind: 'bl92', ff: 30, cam: [0.8, 0.34, 22] },
  { id: 'bl6', url: B1917, hour: 15.5, kind: 'bl6', ff: 30, cam: [0.7, 0.48, 18] },
  { id: 'bl60', url: B1917, hour: 13.5, kind: 'bl60', ff: 30, cam: [0.85, 0.34, 18] },
  { id: 'rail', url: B1917, hour: 16, kind: 'rail', ff: 30, cam: [0.9, 0.28, 38], after: 14 },
  // WW1 German
  { id: 'max38', url: BWW1, hour: 8.5, kind: 'max38', ff: 30, cam: [0.8, 0.3, 42], after: 8 },
  { id: 'gamma', url: BWW1, hour: 9.5, kind: 'gamma', ff: 30, cam: [0.8, 0.32, 30], after: 8 },
  { id: 'm16', url: BWW1, hour: 10, kind: 'm16', ff: 30, cam: [0.8, 0.34, 20] },
  { id: 'sfh13', url: BWW1, hour: 9.5, kind: 'sfh13', ff: 30, cam: [0.8, 0.36, 16] },
  { id: 'k17', url: BWW1, hour: 10.5, kind: 'k17', ff: 30, cam: [0.8, 0.34, 16] },
  { id: 'paris', url: '/?mode=ww1&op=paris&play=1', hour: 9, kind: 'paris', ff: 300, wait: 900, cam: [0.9, 0.22, 75], after: 10 },
  { id: 'bertha-demo', bertha: true, hour: 9 },
  // WW2 German
  { id: 'lefh18', url: BWW2, hour: 9.5, weather: 'Clear', kind: 'lefh18', ff: 30, cam: [0.8, 0.36, 14] },
  { id: 'sfh18', url: BWW2, hour: 10.5, weather: 'Clear', kind: 'sfh18', ff: 30, cam: [0.8, 0.34, 17] },
  { id: 'k18', url: BWW2, hour: 9.5, weather: 'Clear', kind: 'k18', ff: 30, cam: [0.85, 0.3, 24] },
  { id: 'mrs18', url: BWW2, hour: 11, kind: 'mrs18', ff: 30, cam: [0.8, 0.32, 21] },
  { id: 'nbw41', url: BWW2, hour: 11, weather: 'Clear', kind: 'nbw41', ff: 30, cam: [1.2, 0.26, 11], after: 4 },
  { id: 'gustav', url: '/?mode=ww2&op=sevastopol&play=1', hour: 10, kind: 'gustav', ff: 600, wait: 1500, cam: [0.9, 0.22, 100], after: 10 },
  { id: 'karl', url: '/?mode=ww2&op=karl&play=1', hour: 14, kind: 'karl', ff: 60, wait: 900, cam: [1.3, 0.3, 55], after: 6 },
  { id: 'v1', url: '/?mode=ww2&op=v1&play=1', hour: 9, kind: 'v1', ff: 30, wait: 900, cam: [1.3, 0.14, 45], after: 2 },
  { id: 'v2', url: '/?mode=ww2&op=v2&play=1', hour: 11, kind: 'v2', ff: 30, wait: 900, cam: [-1.4, 0.06, 75], after: 60 },
];

// in the page: the gun on auto, the battle run on, frames until it fires, then the blast developing. The camera orbits
// the piece about to fire (a battery's centre would leave each gun small)
async function gunShot(page, s) {
  return page.evaluate(({ kind, ff, wait = 1200, cam, after = 5 }) => {
    const D = window.__drumfire, sim = D.sim;
    D.post.shockwave = () => {};
    D.post.heat = () => {};
    const i = sim.units.findIndex((u) => u.kind === kind);
    if (i < 0) return { error: `no ${kind} here` };
    const u = sim.units[i];
    sim.command(u.id, 'mode', { mode: 'auto' });
    D.fastForward(ff, { unit: i, scale: 8, settle: 1 });
    const chase = D.chase;
    let target = null;
    const aim = (p) => {
      const r = D.rigs.get(`${u.id}:${u.pieces.indexOf(p)}`)?.root;
      if (r && r !== target) { target = r; chase.setTarget(r, { behind: false }); }
    };
    const hold = () => {
      chase.yaw = chase.goalYaw = (target?.rotation.y ?? 0) + cam[0];
      chase.pitch = chase.goalPitch = cam[1];
      chase.dist = chase.goalDist = cam[2];
    };
    aim(u.pieces.find((p) => p.state !== 'dead') ?? u.pieces[0]);
    const last = () => Math.max(-1e9, ...u.pieces.map((p) => p.firedAt ?? -1e9));
    const t0 = last(), shells0 = new Set(sim.shells.filter((x) => x.unitId === u.id));
    const fired = () => last() > t0 || sim.shells.some((x) => x.unitId === u.id && !shells0.has(x));
    // fast until a piece is about to fire (the camera goes to it), then real time, so the frame lands just after the shot
    let n = 0;
    while (!fired() && n++ < wait * 8) {
      const p = u.pieces.find((q) => q.state === 'ready' && q.fireAt != null && q.fireAt - sim.time < 2);
      if (p) aim(p);
      D.params.timeScale = p ? 1 : 4;
      hold();
      D.frame(1 / 30, false);
    }
    D.params.timeScale = 1;
    for (let k = 0; k < after; k++) { hold(); D.frame(1 / 30, k >= after - 2); }
    return { fired: fired(), time: Math.round(sim.time), frames: n };
  }, s);
}

// (CHROME=chromium-1217 picks a build: one install can stop drawing 2D canvases while the other works)
const exe = [...(process.env.CHROME ? [process.env.CHROME] : []), 'chromium-1247', 'chromium-1217']
  .map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`)
  .concat(process.env.PLAYWRIGHT_BROWSERS_PATH ? [`${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`] : [])
  .find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
fs.mkdirSync(OUT, { recursive: true });
const want = args.filter((a) => !a.startsWith('--'));
const HIDE = '#panel, #hud, #loading, #tut-card, #gear, #return-menu, #campaign-objectives, #end, .lil-gui, #voice-sub, #voice-btn, #man-gun, #gunner, .rw-feed, .rw-total, .sm-page { display: none !important; } #view { flex: 1 1 100% !important; width: 100% !important; }';
for (const s of SHOTS.filter((x) => !want.length || want.includes(x.id))) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  // (dev mode, and the career battle's lineup: the gun of the shot, so it takes the field on the ridge)
  await page.addInitScript((kind) => {
    try { localStorage.setItem('drumfire.campaign.v4', JSON.stringify({ completed: [], dev: true, devSet: true, lineup: { de: [kind] } })); } catch {}
    const Orig = window.WebSocket;
    window.WebSocket = function (url, proto) {
      if (proto === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 };
      return new Orig(url, proto);
    };
  }, s.kind);
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
  const t = Date.now();
  let r;
  try {
    if (s.bertha) {
      await page.goto(`http://localhost:5201/bertha.html?play=1&assist=1&station=cmd&quality=${quality}&hour=${s.hour}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.__bertha?.state === 'playing', null, { timeout: 120000, polling: 250 });
      await page.addStyleTag({ content: '#hud, #instrument, #gear, .lil-gui { display: none !important; }' });
      r = await page.evaluate(() => {
        const B = window.__bertha;
        B.post.shockwave = () => {};
        B.post.heat = () => {};
        B.station('none');
        const res = B.fastForward(40, { settle: 1 });
        B.camAt(-9, 2.2, -7, 0, 3.2, 1.5);
        for (let k = 0; k < 8; k++) B.frame(1 / 30, k >= 6);
        return res;
      });
    } else {
      const sep = s.url.includes('?') ? '&' : '?';
      await page.goto(`http://localhost:5201${s.url}${sep}quality=${quality}&hour=${s.hour}&weather=${s.weather ?? 'Overcast'}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.__drumfire?.state === 'playing', null, { timeout: 120000, polling: 250 });
      await page.addStyleTag({ content: HIDE });
      await page.waitForTimeout(300);
      r = await gunShot(page, s);
    }
    await page.evaluate(() => document.querySelector('canvas')?.getContext('webgl2')?.finish?.()).catch(() => {});
    const file = `${OUT}/${s.id}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 80, timeout: 180000 });
    console.log(`${s.id}: ${JSON.stringify(r)} -> ${file} (${Math.round(fs.statSync(file).size / 1024)} KB, ${Math.round((Date.now() - t) / 1000)} s)`);
  } catch (e) {
    console.log(`${s.id}: FAILED ${e.message.split('\n')[0]}`);
  }
  await page.close();
}
await browser.close();

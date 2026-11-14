// The crews' loading drills, measured headless: node tools/crewaudit.mjs <kinds, comma separated> [--scn 0,1,2] [--speed 1]
//   [--shots shell@0.2,shell@0.6,...] [--cams "az,el,dist;..."] [--tile 360x300] [--out shots/x.png] [--ev 8] [--top 10] [--json]
// Opens src/render/crewcheck.html (the real choreography of render/crews.js through a loading cycle at 30 fps) in
// headless Chromium and prints per gun and traverse scenario the clearance (steel, pit, other men, the shell) and the
// motion audit per man: v top speed (m/s), run seconds above 2 m/s, jump pace changes over 0.4 m/s in a frame, tp
// teleports, snap heading snaps, flick pose flicker, slide metres of planted feet sliding, hand worst miss (m) /
// frames over 8 cm, body frames with a hand in the torso, elbow frames with an elbow turned across the body.
// The contact audit (src/render/crewcontact.js): `grip` seconds a hand meant to hold something (an IK grip, or a pose
// that holds a load, a staff, a rope or a handwheel) touches nothing, and `float` seconds a prop nothing bears, each
// with its worst gap (m) and when. The body audit (src/render/crewbody.js): `hit` seconds a man (arms and hands too) is
// into another man, the steel or the pit, `self` a limb through his own body, `joint` a joint past its range (degrees
// over the limit); each with the seconds past what anyone sees at a glance (15 cm off, 8 cm into, 20 degrees over).
// `moments` the worst instants as shot specs (t<time>:<x>:<y>:<z>[:<dist>]: joints and limbs through the man's
// own body are drawn from 1.5 m), taken in turn from each kind of fault.
// With --shots it also saves the contact sheet (one column per moment, one row per camera). --auto N draws, per gun,
// a sheet of its N worst contact moments, each ringed in red and seen from two sides (shots/crewaudit-<kind>.png, or
// --out with <kind> in it). --brief leaves out the clearance and motion lines. Needs the dev server.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const kinds = args[0] && !args[0].startsWith('--') ? args[0] : 'lefh18';
const auto = Number(opt('--auto', 0));
const qs = new URLSearchParams({ gun: kinds, scn: opt('--scn', '0,1,2'), speed: opt('--speed', '1'), ev: opt('--ev', '8'), top: opt('--top', '10'), moments: String(Math.max(6, auto)) });
for (const k of ['shots', 'cams', 'tile']) if (opt('--' + k)) qs.set(k, opt('--' + k));
const out = opt('--out', auto ? 'shots/crewaudit-<kind>.png' : 'shots/crewaudit.png');
const brief = args.includes('--brief');
const exe = [...(process.env.CHROME ? [process.env.CHROME] : []), 'chromium-1217', 'chromium-1247']
  .map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
await page.addInitScript(() => { const O = window.WebSocket; window.WebSocket = function (u, p) { if (String(u).includes('5201')) return { close() {}, send() {}, addEventListener() {} }; return new O(u, p); }; });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// (a model whose builder throws is replaced by a stand-in with only a warning: the audit would measure the wrong gun)
page.on('console', (m) => { if (m.type() === 'error' || /builder threw/.test(m.text())) console.log(`[console.${m.type()}]`, m.text()); });
await page.goto(`http://localhost:5201/src/render/crewcheck.html?${qs}`);
await page.waitForFunction(() => window.__crew?.done || window.__crew?.error, null, { timeout: 600000, polling: 500 });
const r = await page.evaluate(() => window.__crew);
if (r.error) { console.log(r.error); process.exit(1); }
if (args.includes('--json')) console.log(JSON.stringify(r.brief, null, 1));
else for (const [k, b] of Object.entries(r.brief)) {
  console.log(`== ${k}  clearance max ${b.max}`);
  if (!brief) {
    for (const t of b.top) console.log('   ' + t);
    for (const [role, m] of Object.entries(b.motion)) console.log(`   ${role.padEnd(10)} ${m}`);
    for (const [role, evs] of Object.entries(b.motionEvents)) for (const e of evs) console.log(`     ${role}: ${e}`);
    if (args.includes('--slides')) for (const [role, v] of Object.entries(b.slides ?? {})) console.log(`     ${role} slides: ${v}`);
  }
  const C = b.contact;
  console.log('   contact: hands on nothing');
  for (const [who, v] of Object.entries(C.grip)) console.log(`     ${who.padEnd(14)} ${v}`);
  console.log('   contact: props');
  for (const [who, v] of Object.entries(C.props)) console.log(`     ${who.padEnd(14)} ${v}`);
  for (const [cls, title] of [['hit', 'into other men, the steel, the pit'], ['self', 'limbs through his own body'], ['joint', 'joints past their range']]) {
    console.log(`   body: ${title}`);
    for (const [who, v] of Object.entries(C[cls] ?? {})) console.log(`     ${who.padEnd(22)} ${v}`);
  }
  console.log('   worst moments');
  for (const m of C.moments) console.log('     ' + m);
}
if (qs.get('shots')) {
  const box = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; });
  if (box) {
    await page.setViewportSize({ width: Math.max(400, box[0]), height: Math.max(300, box[1]) });
    await page.locator('canvas').first().screenshot({ path: out });
    console.log('saved', out);
  }
}
// --auto N: per gun, its N worst contact moments, close up from two sides
if (auto) for (const [key, b] of Object.entries(r.brief)) {
  const [kind, scn] = key.split('/'), ms = b.contact.moments.slice(0, auto);
  if (!ms.length) { console.log(`${kind}: no contact moments`); continue; }
  const q2 = new URLSearchParams({ gun: kind, scn, speed: opt('--speed', '1'), shots: ms.map((m) => m.split(' ')[0]).join(','), cams: opt('--cams', '35,22,2.6;215,22,2.6'), tile: opt('--tile', '420x340') });
  const p2 = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await p2.addInitScript(() => { const O = window.WebSocket; window.WebSocket = function (u, p) { if (String(u).includes('5201')) return { close() {}, send() {}, addEventListener() {} }; return new O(u, p); }; });
  await p2.goto(`http://localhost:5201/src/render/crewcheck.html?${q2}`);
  await p2.waitForFunction(() => window.__crew?.done || window.__crew?.error, null, { timeout: 600000, polling: 500 });
  const box = await p2.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; });
  if (box) {
    const file = out.includes('<kind>') ? out.replace('<kind>', kind) : out.replace(/\.png$/, `-${kind}.png`);
    await p2.setViewportSize({ width: Math.max(400, box[0]), height: Math.max(300, box[1]) });
    await p2.locator('canvas').first().screenshot({ path: file });
    console.log(`saved ${file}: columns left to right`);
    ms.forEach((m, i) => console.log(`  ${i + 1}. ${m.split(' ').slice(1).join(' ')}`));
  }
  await p2.close();
}
await browser.close();

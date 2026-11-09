// The crews' loading drills, measured headless: node tools/crewaudit.mjs <kinds, comma separated> [--scn 0,1,2] [--speed 1]
//   [--shots shell@0.2,shell@0.6,...] [--cams "az,el,dist;..."] [--tile 360x300] [--out shots/x.png] [--ev 8] [--top 10] [--json]
// Opens src/render/crewcheck.html (the real choreography of render/crews.js through a loading cycle at 30 fps) in
// headless Chromium and prints per gun and traverse scenario the clearance (steel, pit, other men, the shell) and the
// motion audit per man: v top speed (m/s), run seconds above 2 m/s, jump pace changes over 0.4 m/s in a frame, tp
// teleports, snap heading snaps, flick pose flicker, slide metres of planted feet sliding, hand worst miss (m) /
// frames over 8 cm, body frames with a hand in the torso, elbow frames with an elbow turned across the body.
// With --shots it also saves the contact sheet (one column per moment, one row per camera). Needs the dev server.
// The max-quality battery (shots/maxq/PLAN.md): --maxq [1|2] the HD rig and the hero drill, --fire onready the real sim's
// firing (a gun fires the step it comes ready), --tail s the seconds run past the second shot; with either, the shot's
// metrics are printed under each run (ears and pull at the shot, the commander's arm drop, one-frame poses, the knobs,
// loose props, the ground men's jolt, speed-guard catch-ups).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const kinds = args[0] && !args[0].startsWith('--') ? args[0] : 'lefh18';
const qs = new URLSearchParams({ gun: kinds, scn: opt('--scn', '0,1,2'), speed: opt('--speed', '1'), ev: opt('--ev', '8'), top: opt('--top', '10') });
for (const k of ['shots', 'cams', 'tile', 'fire', 'tail', 'hd']) if (opt('--' + k)) qs.set(k, opt('--' + k));
if (args.includes('--maxq')) { const v = opt('--maxq'); qs.set('maxq', v && !v.startsWith('--') ? v : '1'); }
const out = opt('--out', 'shots/crewaudit.png');
const exe = [...(process.env.CHROME ? [process.env.CHROME] : []), 'chromium-1217', 'chromium-1247']
  .map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: [...(process.env.GPU === '1' ? ['--use-angle=gl', '--use-gl=angle', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
await page.addInitScript(() => { const O = window.WebSocket; window.WebSocket = function (u, p) { if (String(u).includes('5201')) return { close() {}, send() {}, addEventListener() {} }; return new O(u, p); }; });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.goto(`http://localhost:5201/src/render/crewcheck.html?${qs}`);
await page.waitForFunction(() => window.__crew?.done || window.__crew?.error, null, { timeout: 600000, polling: 500 });
const r = await page.evaluate(() => window.__crew);
if (r.error) { console.log(r.error); process.exit(1); }
if (args.includes('--json')) console.log(JSON.stringify(r.brief, null, 1));
else for (const [k, b] of Object.entries(r.brief)) {
  console.log(`== ${k}  clearance max ${b.max}`);
  for (const t of b.top) console.log('   ' + t);
  for (const [role, m] of Object.entries(b.motion)) console.log(`   ${role.padEnd(10)} ${m}`);
  for (const [role, evs] of Object.entries(b.motionEvents)) for (const e of evs) console.log(`     ${role}: ${e}`);
  if (args.includes('--slides')) for (const [role, v] of Object.entries(b.slides ?? {})) console.log(`     ${role} slides: ${v}`);
  if (b.shot) {
    const S = b.shot;
    console.log(`   shot: ${S.shots.map((x) => `T${x.T} ears ${x.preEars}/${x.ears} pull ${x.prePull}/${x.pull}`).join('; ')}`);
    console.log(`   shot: arm drop ${JSON.stringify(S.armDrop)} blips ${S.blips} ${JSON.stringify(S.blipBy)} knob ${S.knob ? `${S.knob.max}/${S.knob.mean} [${S.knob.worst}]` : '-'} loose staff ${S.loose.staff}${S.loose.at ? ` ${S.loose.at.join(',')}` : ''} case ${S.loose.kase} shake ${S.shake} guard ${S.guard} ${JSON.stringify(S.guardBy ?? {})}`);
  }
}
if (qs.get('shots')) {
  const box = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; });
  if (box) {
    await page.setViewportSize({ width: Math.max(400, box[0]), height: Math.max(300, box[1]) });
    await page.locator('canvas').first().screenshot({ path: out });
    console.log('saved', out);
  }
}
await browser.close();

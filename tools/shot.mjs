// Headless screenshot and console capture, private to whoever runs it (no shared browser).
//   node tools/shot.mjs <path> <out.png> [--size 1600x900] [--wait 4000] [--eval "js expression"] [--until "js expression"]
// <path> is relative to the dev server (http://localhost:5201), e.g. "/" or "/models.html?kind=bl15in".
// --until polls the expression (up to 60 s) before --wait starts; --eval runs after the wait and its result is printed.
// Console errors and page errors are printed so a broken module shows up immediately.
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
const size = opt('--size', '1600x900').split('x').map(Number);
const wait = Number(opt('--wait', '3000'));
const evalExpr = opt('--eval', null);
const until = opt('--until', null);
const [path = '/', out = 'shots/shot.png'] = args;

const exe = ['chromium-1247', 'chromium-1217']
  .map((d) => `${process.env.HOME}/.cache/ms-playwright/${d}/chrome-linux64/chrome`)
  .concat(process.env.PLAYWRIGHT_BROWSERS_PATH ? [`${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`] : [])
  .find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
// No hot reload: another agent's save would otherwise reload the page in the middle of a capture.
await page.addInitScript(() => {
  const Orig = window.WebSocket;
  window.WebSocket = function (url, proto) {
    if (proto === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 };
    return new Orig(url, proto);
  };
});
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

await page.goto(`http://localhost:5201${path}`, { waitUntil: 'load', timeout: 60000 });
if (until) await page.waitForFunction(until, null, { timeout: 60000, polling: 250 }).catch((e) => console.log(`[until timeout] ${e.message}`));
await page.waitForTimeout(wait);
if (evalExpr) {
  try {
    console.log('[eval]', JSON.stringify(await page.evaluate(evalExpr), null, 1));
  } catch (e) {
    console.log('[eval error]', e.message);
  }
}
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
// SwiftShader can take a long time over a heavy frame; let it finish before the capture
await page.evaluate(() => document.querySelector('canvas')?.getContext('webgl2')?.finish?.()).catch(() => {});
await page.screenshot({ path: out, timeout: 180000 });
console.log(`saved ${out}`);
await browser.close();

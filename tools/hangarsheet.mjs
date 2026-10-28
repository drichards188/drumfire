// The menu hangar's contact sheets: node tools/hangarsheet.mjs [--era 1917|ww1|ww2|all] [--kind k1,k2]
//   [--parts shells,barrel,...] [--levels 0,1,2,3] [--jobs N] [--out shots/sheets]
// For every battery, one sheet: the battery on parade with no upgrades and with every upgrade at its top (the overview
// the player sees, panels and all), then a row per upgrade with its hover view (window.__menuHangar.pose(part): the
// camera on that part's spot, as the modifications panel's hover takes it) at each level (0: before any is bought, the
// place the first will stand), the other parts at none. Drives
// the hangar directly (show({ era, battery })), so the career does not matter. Needs the dev server on port 5201, like
// tools/shot.mjs; headless Chromium (SwiftShader), so a battery takes a minute or two.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import { TREES, PARTS, maxGuns, detachmentOf, crewOf, nodeOf, gunEraOf } from '../src/research.js';
import { GUNS } from '../src/sim/tables.js';
import { BATTERIES } from '../src/campaign-data.js';
import { OPS as OPS_WW1 } from '../src/ww1/ops.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const W1 = Object.values(OPS_WW1).flatMap((op) => op.units);
// the German tree's batteries by the era of their dress and look (research.js gunEraOf)
const ERAS = { '1917': TREES['1917'].map((n) => n.kind), ww2: TREES.de.map((n) => n.kind).filter((k) => gunEraOf(k) === 'ww2'), ww1: TREES.de.map((n) => n.kind).filter((k) => gunEraOf(k) === 'ww1') };
const eras = opt('--era', 'all') === 'all' ? Object.keys(ERAS) : opt('--era').split(',');
const only = opt('--kind', null)?.split(',');
const parts = (opt('--parts', null)?.split(',') ?? PARTS.map((p) => p.id)).filter((p) => PARTS.some((q) => q.id === p));
const levels = opt('--levels', '0,1,2,3').split(',').map(Number); // 0: the hover before the first is bought, its place
const out = opt('--out', 'shots/sheets');
const jobsN = Number(opt('--jobs', '3'));
const [VW, VH] = [1600, 900];
const GAP = { x: 440, y: 60, width: 630, height: 740 }; // the view between the details and the modifications panels
fs.mkdirSync(out, { recursive: true });

const nameOf = (kind) => BATTERIES.find((b) => b.kind === kind)?.name ?? W1.find((u) => u.kind === kind)?.name ?? kind;
const gunsOf = (era, kind) => (nodeOf(kind) ? maxGuns(kind) : W1.find((u) => u.kind === kind)?.pieces.length ?? 1);
// a battery on parade with these levels (as the menu's parade() builds it)
const battery = (era, kind, lv) => {
  const drill = GUNS[kind]?.crew ?? 8, base = detachmentOf(kind, drill);
  const next = nodeOf(kind) ? { guns: maxGuns(kind), reliefs: crewOf(kind, { crew: 1 }, drill) - base } : undefined; // upgradable, as the menu's
  return { kind, name: nameOf(kind), guns: gunsOf(era, kind), base, men: crewOf(kind, lv, drill), levels: { ...Object.fromEntries(PARTS.map((p) => [p.id, 0])), ...lv }, next };
};
const MAX = Object.fromEntries(PARTS.map((p) => [p.id, 3]));

const jobs = eras.flatMap((era) => ERAS[era].filter((k) => !only || only.includes(k)).map((kind) => ({ era, kind })));
// (CHROME=chromium-1217 picks a build: one install can stop drawing 2D canvases while the other works)
const exe = [...(process.env.CHROME ? [process.env.CHROME] : []), 'chromium-1247', 'chromium-1217'].map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function worker() {
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('hangar')) console.log('[console]', m.text().slice(0, 300)); });
  await page.addInitScript(() => {
    localStorage.setItem('drumfire.campaign.v4', JSON.stringify({ completed: [], dev: true, devSet: true }));
    localStorage.setItem('drumfire.menu', JSON.stringify({ view: 'hangar', era: '1917' }));
    // no hot reload: a save while the sheets render would otherwise reload the page under them (as tools/shot.mjs)
    const Orig = window.WebSocket;
    window.WebSocket = function (url, proto) {
      if (proto === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 };
      return new Orig(url, proto);
    };
  });
  await page.goto('http://localhost:5201/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.mn-loading') && window.__menuHangar, null, { timeout: 300000, polling: 300 });
  const snap = async (era, b, part, clip) => {
    await page.evaluate(async ([era, b, part]) => { await window.__menuHangar.show({ era, battery: b }); window.__menuHangar.pose(part); }, [era, b, part]);
    await page.waitForTimeout(400);
    return (await page.screenshot(clip ? { clip } : {})).toString('base64');
  };
  for (let job; (job = jobs.shift());) {
    const { era, kind } = job, t0 = Date.now();
    const cells = { none: await snap(era, battery(era, kind, {}), null), max: await snap(era, battery(era, kind, nodeOf(kind) ? MAX : {}), null) };
    const rows = [];
    for (const part of nodeOf(kind) ? parts : []) {
      const row = [];
      for (const lv of levels) row.push(await snap(era, battery(era, kind, { [part]: lv }), part, GAP));
      rows.push([part, row]);
    }
    // the sheet: an HTML page of the shots, screenshotted
    const img = (b64, w) => `<img src="data:image/png;base64,${b64}" style="width:${w}px;display:block">`;
    const html = `<body style="margin:0;background:#1a1d17;color:#e0d3aa;font:14px monospace;padding:16px">
      <h2 style="margin:0 0 10px">${era} · ${nameOf(kind)} (${kind})</h2>
      <div style="display:flex;gap:10px"><div>no upgrades${img(cells.none, 760)}</div><div>every upgrade at its top${img(cells.max, 760)}</div></div>
      ${rows.map(([part, row]) => `<div style="margin-top:14px">${PARTS.find((p) => p.id === part).name}<div style="display:flex;gap:10px">${row.map((b64, i) => `<div>level ${levels[i]}${img(b64, Math.floor((1528 - 10 * (levels.length - 1)) / levels.length))}</div>`).join('')}</div></div>`).join('')}
    </body>`;
    const sheet = await browser.newPage({ viewport: { width: 1560, height: 800 } });
    await sheet.setContent(html);
    await sheet.screenshot({ path: `${out}/${era}-${kind}.png`, fullPage: true });
    await sheet.close();
    console.log(`${era} ${kind}: ${out}/${era}-${kind}.png (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await page.close();
}
await Promise.all(Array.from({ length: Math.max(1, Math.min(jobsN, jobs.length)) }, worker));
await browser.close();

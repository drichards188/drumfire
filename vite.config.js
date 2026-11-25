import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// The release the crash and lag reports name (src/telemetry.js): the build's date and commit, so an issue says which
// build it came from ("drumfire@2026.11.25-1530+139c043", "+...-dirty" when the working tree had changes).
const release = (() => {
  const d = new Date(), two = (v) => String(v).padStart(2, '0');
  let rev = 'nogit';
  try {
    rev = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) rev += '-dirty';
  } catch { /* not a checkout */ }
  return `drumfire@${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}+${rev}`;
})();

// The frame recorder's sink on the dev server (src/perfrec.js): each game page posts its lines to /__perf?s=<session>,
// appended to perf/<session>.jsonl, and perf/LATEST names the newest session (tools/perfwatch.mjs follows it). Dev only.
const perfLog = () => ({
  name: 'drumfire-perf-log',
  apply: 'serve',
  configureServer(server) {
    const dir = path.resolve(server.config.root, 'perf');
    server.middlewares.use('/__perf', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end();
        return;
      }
      const id = (new URL(req.url, 'http://local').searchParams.get('s') || 'session').replace(/[^\w-]/g, '').slice(0, 64);
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (c) => {
        body += c;
        if (body.length > 16e6) req.destroy();
      });
      req.on('end', () => {
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.appendFileSync(path.join(dir, `${id}.jsonl`), body.endsWith('\n') ? body : `${body}\n`);
          fs.writeFileSync(path.join(dir, 'LATEST'), `${id}\n`);
          res.statusCode = 204;
        } catch {
          res.statusCode = 500;
        }
        res.end();
      });
    });
  },
});

export default defineConfig(({ mode }) => {
  // the crash and lag reports' source maps (src/telemetry.js): with the Sentry build token in .env.local
  // (SENTRY_AUTH_TOKEN, never committed) the build makes hidden maps, uploads them for the release and deletes them
  // from dist/, so players' stack traces read as the source and the itch zip carries no maps; without it, no maps
  const token = loadEnv(mode, process.cwd(), '').SENTRY_AUTH_TOKEN;
  const maps = token ? [sentryVitePlugin({
    org: 'enveloperty', project: 'drumfire', authToken: token, telemetry: false,
    release: { name: release, setCommits: false },
    sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
  })] : [];
  return {
    // relative paths: the build runs from any folder of a site (itch.io, a GitHub Pages project page) as well as its root
    base: './',
    define: { __DRUMFIRE_RELEASE__: JSON.stringify(release) },
    plugins: [perfLog(), ...maps],
    build: {
      sourcemap: token ? 'hidden' : false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: { input: { main: 'index.html', models: 'models.html', ui: 'ui.html', audio: 'audio.html', world: 'world.html', fx: 'fx.html', bertha: 'bertha.html' } },
    },
    server: { port: 5201, strictPort: true, watch: { ignored: ['**/perf/**'] } },
  };
});

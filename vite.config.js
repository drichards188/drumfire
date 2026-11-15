import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

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

export default defineConfig({
  // relative paths: the build runs from any folder of a site (itch.io, a GitHub Pages project page) as well as its root
  base: './',
  plugins: [perfLog()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: 'index.html', models: 'models.html', ui: 'ui.html', audio: 'audio.html', world: 'world.html', fx: 'fx.html', bertha: 'bertha.html' } },
  },
  server: { port: 5201, strictPort: true, watch: { ignored: ['**/perf/**'] } },
});

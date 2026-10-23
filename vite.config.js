import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths: the build runs from any folder of a site (itch.io, a GitHub Pages project page) as well as its root
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: 'index.html', models: 'models.html', ui: 'ui.html', audio: 'audio.html', world: 'world.html', fx: 'fx.html', bertha: 'bertha.html' } },
  },
  server: { port: 5201, strictPort: true },
});

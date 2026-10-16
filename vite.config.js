import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: 'index.html', models: 'models.html', ui: 'ui.html', audio: 'audio.html', world: 'world.html', fx: 'fx.html', bertha: 'bertha.html' } },
  },
  server: { port: 5201, strictPort: true },
});

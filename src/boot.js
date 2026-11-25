import { checkGpu } from './ui/gpu.js';

// The page's entry: a URL with play, tutorial, sandbox or range is a game (its loading screen first, then main.js builds
// the world and starts it); anything else is the main menu, which builds none of the battlefield. The graphics check
// comes first and is the only static import, so nothing of the menu, a lesson or a battle runs before it answers:
// without WebGL (graphics acceleration off) its card stays and nothing loads; drawn on the CPU, nothing loads until
// Play anyway. Then the saves (src/saves.js: the IndexedDB mirror, and its copy put back if localStorage lost them),
// before anything reads one. The crash and lag reports (src/reports.js, src/telemetry.js) start beside all that,
// never in its way: Sentry loads only when the build has a DSN and the player has not turned reports off.
const q = new URLSearchParams(location.search);
const gpu = checkGpu();
import('./reports.js').then((r) => r.telemetry()).catch(() => {});
gpu
  .then(() => import('./saves.js').then((m) => m.startSaves()).catch((e) => console.warn('saves:', e)))
  .then(() => import('./menuItems.js')).then(({ isGame }) => {
  if (!isGame(q)) {
    return import('./ui/menu.js').then(({ mountMenu }) => {
      document.body.classList.add('menu');
      document.getElementById('menu').hidden = false;
      mountMenu();
    });
  }
  return import('./ui/loading.js').then(({ showLoading }) => {
    showLoading(q);
    return import('./main.js').catch((e) => {
      console.error(e);
      document.getElementById('status').textContent = `Failed to load: ${e.message}`;
    });
  });
}).catch((e) => console.error(e));

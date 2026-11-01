import { checkGpu } from './ui/gpu.js';

// The page's entry: a URL with play, tutorial, sandbox or range is a game (its loading screen first, then main.js builds
// the world and starts it); anything else is the main menu, which builds none of the battlefield. The graphics check
// comes first and is the only static import, so nothing of the menu, a lesson or a battle runs before it answers:
// without WebGL (graphics acceleration off) its card stays and nothing loads; drawn on the CPU, nothing loads until
// Play anyway. Then the saves (src/saves.js: the IndexedDB mirror, and its copy put back if localStorage lost them),
// before anything reads one.
const q = new URLSearchParams(location.search);
checkGpu()
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

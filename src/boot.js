import { isGame } from './menuItems.js';
import { mountMenu } from './ui/menu.js';
import { showLoading } from './ui/loading.js';
import { checkGpu } from './ui/gpu.js';

// The page's entry: a URL with play, tutorial, sandbox or range is a game (its loading screen first, then main.js builds
// the world and starts it); anything else is the main menu, which builds none of the battlefield. Either way the
// browser is checked first: without WebGL (graphics acceleration off) a card says how to turn it on and no game starts.
const q = new URLSearchParams(location.search);
const gpu = checkGpu();
if (isGame(q)) {
  showLoading(q);
  if (gpu === 'none') document.getElementById('status').textContent = 'No WebGL: graphics acceleration is off';
  else {
    import('./main.js').catch((e) => {
      console.error(e);
      document.getElementById('status').textContent = `Failed to load: ${e.message}`;
    });
  }
} else {
  document.body.classList.add('menu');
  document.getElementById('menu').hidden = false;
  mountMenu();
}

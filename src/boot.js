import { isGame } from './menuItems.js';
import { mountMenu } from './ui/menu.js';
import { showLoading } from './ui/loading.js';

// The page's entry: a URL with play, tutorial or sandbox is a game (its loading screen first, then main.js builds
// the world and starts it); anything else is the main menu, which builds none of the battlefield.
const q = new URLSearchParams(location.search);
if (isGame(q)) {
  showLoading(q);
  import('./main.js').catch((e) => {
    console.error(e);
    document.getElementById('status').textContent = `Failed to load: ${e.message}`;
  });
} else {
  document.body.classList.add('menu');
  document.getElementById('menu').hidden = false;
  mountMenu();
}

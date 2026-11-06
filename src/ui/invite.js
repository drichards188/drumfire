// The invitation to the basic training (src/ww1/tutorial.js): shown on every menu load (and when the career's battle
// is opened straight from a link) until the lesson is finished or the player clicks Stop reminding me. Accepting opens
// the lesson's page and remembers nothing, so a lesson left half way is offered again; Not now (Esc, a click outside)
// only closes the card for this load. The lesson stays in the Tutorials list either way. Plain DOM, no three.js.
import { LESSONS_KEY } from '../menuItems.js';
import './invite.css';

// localStorage: 'never' once Stop reminding me is clicked. (The 'yes' and 'no' that the old one-time card wrote are
// ignored: Not now was all it had, and it meant not now.)
const KEY = 'drumfire.invite';
const NEVER = 'never';
export const TRAINING = 'training';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: asked again next time */ } };

// should the invitation be shown: not stopped, the lesson never finished, not a headless tool
export function shouldInvite() {
  if (navigator.webdriver) return false;
  if (read(KEY) === NEVER) return false;
  try { if (JSON.parse(read(LESSONS_KEY))?.[TRAINING]) return false; } catch { /* no lessons yet */ }
  return true;
}

// the lesson's page, with the page's quality passed on
export function trainingHref() {
  const q = new URLSearchParams(location.search).get('quality');
  return `index.html?mode=ww1&tutorial=${TRAINING}${q ? `&quality=${q}` : ''}`;
}

// the card; onDecline runs after it closes (a game page starts its battle then). Returns { close }.
export function showInvite({ onAccept = () => { location.href = trainingHref(); }, onDecline = () => {} } = {}) {
  const page = document.createElement('div');
  page.className = 'iv-page';
  page.innerHTML = `<div class="iv-card" role="dialog" aria-modal="true" aria-labelledby="iv-title">
    <small class="iv-kicker">New to the guns?</small>
    <h2 id="iv-title">Basic training</h2>
    <p class="iv-lede">About ten minutes on the career's own ridge, with a borrowed battery: two 21 cm Mörser 18, every upgrade fitted.</p>
    <ul class="iv-list">
      <li><b>Command</b> lay the guns from the console, range on the observer's reports, fire for effect</li>
      <li><b>In person</b> man a gun yourself: lay it, load it, pull the lanyard</li>
    </ul>
    <p class="iv-note">Each step waits for you, and the screen shows only what it is about. You can leave at any time; the lesson stays in Tutorials.</p>
    <div class="iv-actions"><button type="button" class="iv-stop">Stop reminding me</button><button type="button" class="iv-no">Not now</button><button type="button" class="iv-yes">Start basic training</button></div>
  </div>`;
  document.body.append(page);
  const yes = page.querySelector('.iv-yes');
  requestAnimationFrame(() => { page.classList.add('in'); yes.focus(); });
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    removeEventListener('keydown', onKey, true);
    page.classList.remove('in');
    setTimeout(() => page.remove(), 300);
  };
  const decline = (stop) => { if (!open) return; if (stop) write(KEY, NEVER); close(); onDecline(); };
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); decline(); }
    else if (e.code === 'Enter' && !e.target.closest?.('.iv-no, .iv-stop')) { e.preventDefault(); e.stopPropagation(); yes.click(); }
    else e.stopPropagation(); // (the page behind takes no keys while the card is up)
  };
  addEventListener('keydown', onKey, true);
  yes.addEventListener('click', () => { close(); onAccept(); });
  page.querySelector('.iv-no').addEventListener('click', () => decline(false));
  page.querySelector('.iv-stop').addEventListener('click', () => decline(true));
  page.addEventListener('pointerdown', (e) => { if (e.target === page) decline(); });
  return { close };
}

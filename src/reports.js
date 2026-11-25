// The crash and lag reports' switch, and the way to them, without loading Sentry (src/telemetry.js) until it is wanted:
// boot.js starts them beside everything else on every page, main.js hands them the frame recorder, the menu's footer
// and the gear menu hold the switch. Reports go only from a build that has a DSN (VITE_SENTRY_DSN, from .env.local),
// only while the player leaves them on (localStorage drumfire.telemetry 'off' stops them at once; turning them back
// on starts them), and never from the dev server or the headless tools unless the URL says ?sentry=1 (?sentry=0
// stops them anywhere).
const KEY = 'drumfire.telemetry';
const DSN = import.meta.env.VITE_SENTRY_DSN || '';
const q = new URLSearchParams(location.search);

/** Does this build send reports at all (a DSN went into it)? The switch is shown only then. */
export const available = () => !!DSN;

/** The player's choice: on unless turned off. */
export function reportsOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

const wanted = () => available() && reportsOn() && q.get('sentry') !== '0'
  && (q.get('sentry') === '1' || (!import.meta.env.DEV && !navigator.webdriver));

let started = null;
/** The running reports (src/telemetry.js `start`), started on the first call that wants them; null when off. */
export function telemetry() {
  if (!started && wanted()) {
    started = import('./telemetry.js').then((m) => m.start(DSN)).catch((e) => {
      console.warn(`reports: ${e.message}`);
      return null;
    });
  }
  return started ?? Promise.resolve(null);
}

/** The switch: off stops every report at once (telemetry.js asks reportsOn() before each), on starts them. */
export function setReports(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* this page only */ }
  if (on) telemetry();
}

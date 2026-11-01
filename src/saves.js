// Keeping the player's progress. Everything the game remembers is in localStorage under 'drumfire.' keys (the career,
// the menu's choices, the lessons, the switches). On itch.io every HTML game is served from one origin
// (html-classic.itch.zone/html/<upload id>/), so a new upload keeps the saves but the storage is shared with every other
// game there: one that calls localStorage.clear() or fills the quota would take ours with it. Two guards:
//   startSaves()  at boot, before anything reads a save: mirrors the drumfire keys into IndexedDB (a separate store that
//                 localStorage.clear() does not touch) on every write, and puts them back if localStorage comes up empty
//   exportSave() / importSave(file)  the whole save as a small JSON file the player keeps, which survives anything
//                 (cleared browser data, a browser that blocks storage in itch's iframe, another computer)
// Plain DOM, no three.js; every step fails quietly, the game never waits more than a moment on it.
const PREFIX = 'drumfire.';
const DB = 'drumfire-saves', OS = 'kv', REC = 'local';
const FILE_GAME = 'drumfire', FILE_V = 1;

const local = () => { try { return window.localStorage; } catch { return null; } };

// every drumfire key in localStorage, as { key: string }
export function snapshot() {
  const s = local(), keys = {};
  if (!s) return keys;
  try {
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(PREFIX)) keys[k] = s.getItem(k); }
  } catch { /* storage refused mid-read: what was read */ }
  return keys;
}

let db = null;
const openDb = () => new Promise((ok, fail) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(OS);
  req.onsuccess = () => ok(req.result);
  req.onerror = () => fail(req.error);
  req.onblocked = () => fail(new Error('blocked'));
});
const readBackup = () => new Promise((ok) => {
  try {
    const req = db.transaction(OS).objectStore(OS).get(REC);
    req.onsuccess = () => ok(req.result ?? null);
    req.onerror = () => ok(null);
  } catch { ok(null); }
});
// the mirror: written at most every 2 s while playing, at once while the page is going away (the battle's pay goes in
// on pagehide, the last thing the page does), and never an empty set over a full one
let last = 0, timer = 0, leaving = false;
const writeBackup = () => {
  clearTimeout(timer);
  timer = 0;
  if (!db) return;
  const keys = snapshot();
  if (!Object.keys(keys).length) return;
  last = performance.now();
  try { db.transaction(OS, 'readwrite').objectStore(OS).put({ keys, t: Date.now() }, REC); } catch { /* the backup misses this write */ }
};
const schedule = () => {
  if (leaving || document.visibilityState === 'hidden') { writeBackup(); return; }
  if (!timer) timer = setTimeout(writeBackup, Math.max(0, 2000 - (performance.now() - last)));
};

export async function startSaves() {
  const s = local();
  if (!s || typeof indexedDB === 'undefined') return;
  try { db = await Promise.race([openDb(), new Promise((_, fail) => setTimeout(() => fail(new Error('slow')), 1500))]); } catch { db = null; return; }
  // localStorage lost every drumfire key (another game cleared the shared origin, or it was full): put the backup back
  if (!Object.keys(snapshot()).length) {
    const rec = await readBackup();
    if (rec?.keys) for (const [k, v] of Object.entries(rec.keys)) if (k.startsWith(PREFIX) && typeof v === 'string') try { s.setItem(k, v); } catch { /* full */ }
  }
  writeBackup();
  // every later write to a drumfire key refreshes the mirror (wrapped on the prototype: a property set on localStorage
  // itself would be stored as an item)
  const proto = Storage.prototype;
  for (const name of ['setItem', 'removeItem']) {
    const orig = proto[name];
    proto[name] = function (key, ...rest) {
      const r = orig.call(this, key, ...rest);
      if (this === s && String(key).startsWith(PREFIX)) schedule();
      return r;
    };
  }
  addEventListener('pagehide', () => { leaving = true; if (timer) writeBackup(); });
  addEventListener('pageshow', () => { leaving = false; });
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) writeBackup(); });
}

// the save as a file: drumfire-save-YYYY-MM-DD.json
export function exportSave() {
  const keys = snapshot();
  if (!Object.keys(keys).length) return false;
  const blob = new Blob([JSON.stringify({ game: FILE_GAME, v: FILE_V, saved: new Date().toISOString(), keys }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  a.download = `drumfire-save-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}

// a save file read back: replaces every drumfire key with the file's (the caller reloads the page so everything reads
// it afresh). Resolves to '' when done, else the reason in the player's words.
export async function importSave(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return 'Not a Drumfire save file'; }
  const keys = data?.game === FILE_GAME && data.keys && typeof data.keys === 'object' ? data.keys : null;
  if (!keys || !Object.entries(keys).every(([k, v]) => k.startsWith(PREFIX) && typeof v === 'string')) return 'Not a Drumfire save file';
  if (!(+data.v <= FILE_V)) return 'Saved by a newer version of the game';
  const s = local();
  if (!s) return 'This browser does not allow saving here';
  // the file's keys first, then the old ones it does not have, so a refused write never leaves the career gone
  try {
    for (const [k, v] of Object.entries(keys)) s.setItem(k, v);
    for (const k of Object.keys(snapshot())) if (!(k in keys)) s.removeItem(k);
  } catch { return 'The browser refused to store it'; }
  writeBackup();
  return '';
}

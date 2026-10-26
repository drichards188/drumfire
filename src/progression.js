import { BATTERIES, CAMPAIGN, missionById, rosterFor } from './campaign-data.js';
export { BATTERIES };
export const SAVE_KEY = 'drumfire.campaign.v2';
// dev mode is on until the player switches it off (the user's call for the draft builds; false again when they say so)
export const DEV_DEFAULT = true;
export class Progression {
  constructor(storage) {
    this.storage = storage;
    this.completed = new Set();
    this.dev = DEV_DEFAULT;
    this.devSet = false; // the player's own switch, kept over the default
    this.saved = !!storage;
    try {
      const data = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
      // Missions are played in any order, so every saved completion counts. Old XP never grants batteries.
      for (const m of CAMPAIGN) if (Array.isArray(data?.completed) && data.completed.includes(m.id)) this.completed.add(m.id);
      // a save from before the default had dev true only where the player switched it on
      if (data?.devSet || data?.dev === true) { this.dev = data.dev === true; this.devSet = true; }
      if (!data && JSON.parse(storage?.getItem('drumfire.command-career.v1') || 'null')?.dev === true) this.dev = true;
    } catch { this.saved = false; }
  }
  unlocked(kind) {
    const b = BATTERIES.find(b => b.kind === kind);
    return !!b && (this.dev || rosterFor(b.era)[0].kind === kind || this.completed.has(`earn-${kind}`));
  }
  // every mission is open from the start, in any order: winning one earns its battery for the open battles
  canPlay(id) {
    return !!missionById(id);
  }
  complete(id) {
    if (!this.canPlay(id) || this.completed.has(id)) return false;
    this.completed.add(id);
    this.save();
    return true;
  }
  save() {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(SAVE_KEY, JSON.stringify({ completed: [...this.completed], dev: this.dev, devSet: this.devSet }));
      this.saved = true;
    } catch { this.saved = false; }
  }
  // dev mode: every battery in the open battles, for testing (saved in this browser like the rest)
  setDev(on) { this.dev = !!on; this.devSet = true; this.save(); }
  unlockAll() { this.setDev(true); }
}

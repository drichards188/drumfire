import { BATTERIES, CAMPAIGN, missionById, rosterFor } from './campaign-data.js';
export { BATTERIES };
export const SAVE_KEY = 'drumfire.campaign.v2';
export class Progression {
  constructor(storage) {
    this.storage = storage;
    this.completed = new Set();
    this.dev = false;
    this.saved = !!storage;
    try {
      const data = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
      // Missions are played in any order, so every saved completion counts. Old XP never grants batteries.
      for (const m of CAMPAIGN) if (Array.isArray(data?.completed) && data.completed.includes(m.id)) this.completed.add(m.id);
      this.dev = data?.dev === true;
      if (!data) this.dev = JSON.parse(storage?.getItem('drumfire.command-career.v1') || 'null')?.dev === true;
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
      this.storage.setItem(SAVE_KEY, JSON.stringify({ completed: [...this.completed], dev: this.dev }));
      this.saved = true;
    } catch { this.saved = false; }
  }
  // dev mode: every battery in the open battles, for testing (saved in this browser like the rest)
  setDev(on) { this.dev = !!on; this.save(); }
  unlockAll() { this.setDev(true); }
}

// The first run (2026-11-26, the landing work): a new player lands on the career's battle from a link and plays at once,
// with no lesson in the way. This file keeps what this browser's player has done since, once each, for three users:
//   - the first battle's coach (Coach, below; main.js): short hints read from the game, one line at a time, for a player
//     who skipped the basic training (the designed first impression, offered by ui/invite.js until it is finished)
//   - the funnel (milestone, below): each milestone's first time goes to the crash and lag reports as `funnel.<name>`
//     (src/telemetry.js, only where reports.js lets them run)
//   - the first battle's rule (isFirstBattle, below): the career's own guns, standing loaded (main.js)
// localStorage drumfire.firstrun (under the drumfire. prefix, so saves.js mirrors it and Export save carries it):
//   { v: 1, at: { first_battle, first_shot, first_hit, first_mission, first_win, second_battle: ms since 1970 },
//     coach: { started: true, take, fire, follow, correct, effect, cover, back, end: true } }
// Plain data and DOM-free logic; the coach reaches the game only through its host (main.js).
const KEY = 'drumfire.firstrun';
const blank = () => ({ v: 1, at: {}, coach: {} });
function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    return r?.v === 1 ? { ...blank(), ...r, at: { ...r.at }, coach: { ...r.coach } } : blank();
  } catch { return blank(); }
}
function save(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private mode: this page only */ } }

/** Has this browser's player reached a milestone (first_battle, first_shot, first_hit, first_mission, first_win, second_battle)? */
export const has = (flag) => !!load().at[flag];
/** The milestone reached now: marked once per browser (true the first time). */
export function mark(flag) {
  const r = load();
  if (r.at[flag]) return false;
  r.at[flag] = Date.now();
  save(r);
  return true;
}
/** A milestone reached: the first time, its count `funnel.<flag>` goes to the reports (`tele`: telemetry.js's api, or
 *  null where reports do not run; nothing personal, the same rules as the other metrics). True the first time. */
export function milestone(flag, tele) {
  if (!mark(flag)) return false;
  tele?.count?.(`funnel.${flag}`);
  return true;
}
/** The first battle won (the funnel's `first_win`). */
export const firstWin = () => has('first_win');

// ---------------------------------------------------------------- the first battle
// A new career's first open battle on the ridge is level 1 with the career's own lineup, the FK 16 and the sFH 13 (two
// guns each; the Ringkanone C/92 until 2026-11-26), nothing lent: what a player fires is what they have earned, so the tree's climb is felt from the first battle. (A super-heavy
// lent for the day, the 38 cm Langer Max, was tried on 2026-11-26 and taken out the same day at the user's word: it
// showed the top of the tree for free, made the second battle a step down and paid the first battle with its kills.)
// What makes it quick instead: its guns stand loaded (main.js), level 1 deals a quick main (threat.js `quick`), the coach.
/** Is this battle page the career's first open battle: no battle fought yet (progression's `battles`), at level 1 (a link
 *  without one is), never in dev mode (every battery is the player's there)? `q` the page's URL query. */
export const isFirstBattle = (career, q) => !!career && !career.dev && !((career.battles?.de ?? 0) > 0) && (+q.get('level') || 1) === 1;

// ---------------------------------------------------------------- the coach
// The first battle's hints over the view (hud.hint), one line at a time, each until it is done. Every step's `due` and
// `done` read the battle as it stands (never "since this step opened"), so a player ahead of the coach finds the steps
// done and never sees them. What is done is kept (the record's `coach`), so a reload does not teach it twice. The coach
// starts on the first battle and carries the steps still open into the next two (a bracket may not come in the first);
// a career begun before it existed never sees it. The danger line (cover) stands in for main's own bracket hint and
// may take the hint's place at once; the others wait until the hint is free (a new mission's, the shell ride's).
const LATER = 2; // the battles fought before (progression's `battles`) up to which the open steps carry on: the first and two more
const START_MS = 4500; // the battle's opening toasts first
const HOLD_MS = 7000; // each show of a line (renewed while it stands)
const BACK_S = 20; // s in cover, with no fire for effect falling, before the coach says it has passed
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export class Coach {
  // host: { sim(), units() (the fielded sim units), selected() (the selected sim unit), keyOf(u) (its number key or ''),
  //   following() (riding a shell), paused() (not playing, at a gun), hint(text, ms), hintEl (the #hint element) }
  constructor(host) {
    this.host = host;
    this.on = false;
    this.mem = null;
  }
  // a new battle: on for the first, or for the next two when the first started it and steps are still open
  begin({ first, battles }) {
    const r = load();
    if (first && !r.coach.started) { r.coach.started = true; save(r); }
    this.done = r.coach;
    this.on = !!r.coach.started && (first || battles <= LATER) && STEPS.some((s) => !this.done[s.id]);
    this.mem = { t0: performance.now(), tick: 0, shown: null, at: 0, followed: false, burst: false, who: null,
      seen: new Set(), last: new Map(), adj0: new Map(), ffe0: new Map(), coverAt: new Map() };
  }
  finish(id) {
    if (this.done[id]) return;
    const r = load();
    r.coach[id] = true;
    save(r);
    this.done = r.coach;
  }
  // ---- what main tells it
  cover(u, on) {
    if (!this.on || !this.isOurs(u)) return;
    if (on) { this.finish('cover'); this.mem.coverAt.set(u.id, this.host.sim().time); }
    else if (this.mem.coverAt.has(u.id)) { this.finish('back'); this.mem.coverAt.delete(u.id); }
  }
  burst(shell) { if (this.on && shell?.own && this.host.units().some((u) => u.id === shell.unitId)) this.mem.burst = true; }
  ended() { if (this.on && this.host.sim()?.objectives?.accomplished) this.finish('end'); }
  /** main's bracket hint: true when the coach speaks for it (its cover step still open) */
  speaksFor(u, stage) { return this.on && !this.done.cover && this.isOurs(u) && (stage === 'bracketed' || stage === 'ffe'); }

  // ---- the game as it stands
  isOurs(u) { return this.host.units().some((x) => x.id === u?.id); }
  missionOf(u) { return u?.missionId != null ? this.host.sim().missionById(u.missionId) : null; }
  fired() { return this.host.units().some((u) => (u.stats?.rounds ?? 0) > 0); }
  // the unit a step is about: the selected one when it qualifies, else the first that does
  pick(ok) { const s = this.host.selected(); return s && ok(s) ? s : this.host.units().find(ok) ?? null; }
  // "Select Max (2), then " when the unit is not the one selected
  sel(u) { const k = this.host.keyOf(u); return u && u.id !== this.host.selected()?.id ? `select ${u.callsign}${k !== '' ? ` (${k})` : ''}, then ` : ''; }
  newest(u) { const r = this.missionOf(u)?.reports; return r?.length ? r[r.length - 1] : null; }
  live(m) { return !!m && m.state !== 'done' && m.state !== 'failed'; }

  // each poll: a new report on a unit's mission notes the aim it came to (the aim at the poll before, so a correction
  // applied at once still counts) or, on target, the rounds fired so far
  observe() {
    for (const u of this.host.units()) {
      const m = this.missionOf(u), r = this.newest(u), a = u.order?.adj;
      if (m && r && !this.mem.seen.has(`${m.id}:${r.n ?? r.t}`)) {
        this.mem.seen.add(`${m.id}:${r.n ?? r.t}`);
        if (r.ok) this.mem.ffe0.set(u.id, { mid: m.id, rounds: u.stats.rounds });
        else if (r.observed !== false && (r.corr?.add || r.corr?.right)) this.mem.adj0.set(u.id, { mid: m.id, ...(this.mem.last.get(u.id) ?? a) });
      }
      if (a) this.mem.last.set(u.id, { add: a.add, right: a.right });
    }
  }
  // the step to show now: the first not done that is due (done ones found on the way are kept)
  current() {
    for (const s of STEPS) {
      if (this.done[s.id]) continue;
      if (s.done?.(this)) { this.finish(s.id); continue; }
      if (s.due(this)) return s;
    }
    return null;
  }
  update() {
    const m = this.mem, h = this.host, now = performance.now();
    if (!this.on || now - m.tick < 400) return;
    m.tick = now;
    if (h.paused() || now - m.t0 < START_MS) return;
    if (h.following()) m.followed = true;
    this.observe();
    const step = this.current(), text = step ? step.text(this) : null;
    const el = h.hintEl, up = !!el?.classList.contains('show'), ours = up && el.textContent === m.shown, busy = up && !ours;
    if (!text) {
      if (ours) h.hint(m.shown, 400); // (a line done: it fades)
      m.shown = null;
      return;
    }
    if (busy && !(step.urgent && text !== m.shown)) return; // (another hint is up: ours waits, unless danger is new)
    if (text !== m.shown || !ours || now - m.at > 3000) {
      h.hint(text, HOLD_MS);
      m.shown = text;
      m.at = now;
    }
  }
}

// The steps, in order of precedence (danger first). Level 1 has no British attack, so the Sperrfeuer is not taught here.
const STEPS = [
  {
    id: 'cover', urgent: true,
    done: (c) => c.host.units().some((u) => u.cover),
    due: (c) => !!c.pick((u) => !u.cover && (u.cbStage === 'bracketed' || u.cbStage === 'ffe')),
    text: (c) => {
      const u = c.pick((x) => !x.cover && (x.cbStage === 'bracketed' || x.cbStage === 'ffe'));
      return `Deckung! The British have ${u.callsign}'s range. ${cap(`${c.sel(u)}U takes its crew into cover until their fire passes.`)}`;
    },
  },
  {
    id: 'back',
    due: (c) => !!c.pick((u) => u.cover && u.cbStage !== 'ffe' && c.host.sim().time - (c.mem.coverAt.get(u.id) ?? Infinity) > BACK_S),
    text: (c) => {
      const u = c.pick((x) => x.cover && x.cbStage !== 'ffe' && c.host.sim().time - (c.mem.coverAt.get(x.id) ?? Infinity) > BACK_S);
      return `${u.callsign}: their salvo has passed, and the guns are silent. ${cap(`${c.sel(u)}U sends the crew back to the guns.`)}`;
    },
  },
  {
    id: 'take',
    done: (c) => c.fired() || c.host.units().some((u) => u.missionId != null),
    due: (c) => c.host.sim().missions.some((m) => m.state === 'open' && m.unitId == null && m.kind !== 'sos'),
    text: () => 'Take a fire mission: click a target on the map board, or Tab then Enter on a call in the list.',
  },
  {
    id: 'fire',
    done: (c) => c.fired(),
    due: (c) => !!c.pick((u) => c.live(c.missionOf(u))),
    text: (c) => {
      const u = c.pick((x) => c.live(c.missionOf(x)));
      const ready = u.pieces.some((p) => p.state === 'ready');
      return ready ? `${cap(`${c.sel(u)}Space fires. ${u.callsign} is laid on the target.`)}` : `${u.callsign}'s crew loads and lays the gun on the target. Wait for READY (] speeds time).`;
    },
  },
  {
    // (if you like: done once the first round lands, followed or not)
    id: 'follow',
    done: (c) => c.mem.followed || c.mem.burst,
    due: (c) => c.host.sim().shells.some((s) => s.alive && s.own && c.isOurs({ id: s.unitId })),
    text: () => 'F rides the shell to the target, if you like (F again: back to the guns; ] speeds time).',
  },
  {
    // the observer's report on the pad: done once the aim has moved since a report with a correction came (the player's
    // . or the arrow keys); a round on target first leaves it open for the next battle's first correction
    id: 'correct',
    done: (c) => c.host.units().some((u) => {
      const a0 = c.mem.adj0.get(u.id), a = u.order?.adj;
      return !!a0 && !!a && a0.mid === u.missionId && Math.hypot(a.add - a0.add, a.right - a0.right) > 1;
    }),
    due: (c) => !!(c.mem.who = c.pick((u) => {
      const r = c.newest(u);
      return c.live(c.missionOf(u)) && !!r && !r.ok && r.observed !== false && !!(r.corr?.add || r.corr?.right) && c.mem.adj0.get(u.id)?.mid === u.missionId;
    })),
    text: (c) => `The observer reports where it fell (on the message pad). ${cap(`${c.sel(c.mem.who)}press . (full stop) to apply his correction, then Space fires again.`)}`,
  },
  {
    // "Ziel!": on target. Done when more rounds a gun are set, two more rounds have gone, or that mission is over
    id: 'effect',
    done: (c) => c.host.units().some((u) => {
      const f = c.mem.ffe0.get(u.id);
      return !!f && (f.mid !== u.missionId || !c.live(c.host.sim().missionById(f.mid)) || u.order.rounds > 1 || u.stats.rounds - f.rounds >= 2);
    }),
    due: (c) => !!(c.mem.who = c.pick((u) => c.live(c.missionOf(u)) && !!c.newest(u)?.ok)),
    text: (c) => `On target ("Ziel!"). ${cap(`${c.sel(c.mem.who)}keep firing (Space) until it is destroyed: R fires more rounds a gun.`)}`,
  },
  {
    id: 'end',
    due: (c) => !!c.host.sim().objectives?.accomplished,
    text: (c) => (c.host.sim().objectives?.has?.('xzeit') ? 'Mission accomplished: K calls X-Zeit, the finale. Or finish what you will first.'
      : 'Mission accomplished: K (End the battle) ends it and pays. Or finish what you will first.'),
  },
];

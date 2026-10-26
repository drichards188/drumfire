// The German modes' crew voices: German callouts at the guns and on the field telephone, with subtitles, for the WW2
// open battle (op flanders) and the Karl-Gerät (op karl), and the WW1 German open battle (op ridge) on the same clips.
// Synthetic speech made offline (tools/make-voices.py from tools/voice-lines-ww2.json, docs/VOICES.md) into
// public/audio/voice-de/, indexed by its lines.json; a missing file is simply not spoken. Page code only (DOM and Web
// Audio); it reads the sim and never changes it.
//
// 1918 (era 'ww1') reuses the WW2 clips; no line is made for it. Where a WW2 clip would be wrong for 1918 the voices
// leave it out or say another: the air observer reported by wireless telegraphy, not by voice, so his reports come as
// the observation post's on the telephone (vb, not the fu radio lines); a tank laager gets the general new-target call
// (m_tanks says "Panzer"); the Feuerwalze is our own attack, not a counter-attack, so m_barrage is not said (the
// battery officer's "Feuerwalze!" at the guns carries it).
//
//   const voices = new CrewVoices({ audio, view, panel, radio, selectedId, active, era });   era 'ww2' (default) | 'ww1'
//   voices.load();                      while the page loads: fetch and decode every clip (offline contexts, no click needed)
//   await voices.ready();               the loading screen's wait (main: after audio.whenReady)
//   voices.attach(sim);                 chain onto sim.events (after main has wired its own handlers)
//   voices.update(sim);                 every frame: the watchers (fire orders, cease fire, the battery ready, the Karl) and the queues
//   voices.toggle(); voices.enabled     on or off (V, the console's VOICES button), remembered in localStorage drumfire.voices
//   voices.replacesBark(unit, piece, step)   true when the synthesized English "Ready!" of this piece should give way
//
// Two speaker channels, each one line at a time: 'gun' (the battery officer, the gun commander and the loader of the voiced
// gun, shouted in the open: spatialised at the piece through the AudioEngine's routing, with its 343 m/s delay and its
// distance filtering) and 'tel' (the Abteilung, the battery's telephone operator and the forward observer through a field
// telephone, the air observer through a radio: band-limited, a little drive, key clicks, line noise). Only the selected
// battery's crew and its missions are voiced (and the calls to every gun: new fire missions, Sperrfeuer, the barrage's
// lifts). Queue rules as the Kirov fire cues: priorities, a maximum wait on the wall clock (performance.now, never the game
// clock), a newer line of the same kind replacing a waiting one, the next line as soon as the last one ends.
import './voices.css';
import { GUNS } from '../sim/tables.js';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/voice-de/`;
const STORE = 'drumfire.voices'; // localStorage: '0' off
const MAX_AGE = { 0: 2.5, 1: 6, 2: 8, 3: 10 }; // seconds a queued line may wait, by priority
const GAP = 0.07; // between the clips of one utterance
const AFTER = 0.25; // between utterances on a channel
const RATE = { gun: 22050, phone: 11025, radio: 11025 }; // decoded rates: the telephone and radio lines are band-limited anyway
const REF = 45, LEVEL = 0.85; // a shout: full level within 45 m, falling off as 1/d beyond
const TAU = Math.PI * 2;
const now = () => performance.now() / 1000;
// the guns whose shell comes on a tray, up a lift or by crane, and those with bag charges and a primer tube (WW1: the
// Mörser 16 is loaded from a tray as the Mrs 18; the Langer Max's shell comes up the well hoist and the Gamma's up its
// incline car, both with a main and fore charges; the K 17 and the sFH 13 load by hand with a brass case)
const TRAY = new Set(['k18', 'mrs18', 'bertha', 'm16']);
const LIFT = new Set(['gustav', 'max38', 'gamma']);
const BAGS = new Set(['k18', 'mrs18', 'bertha', 'gustav', 'karl', 'max38', 'gamma']);
const KARL_STAGE = { driving: 'k_drive', emplace: 'k_emplace', pivot: 'k_pivot', lowering: 'k_lower', down: 'k_down', raising: 'k_raise' };
// the Abteilung's call for a new mission by target kind (WW1's British kinds: the dumps and the road traffic; their
// batteries are m_cb as every battery, and the Mark IV laager is left to m_any)
const MISSION_LINE = { tanks: 'm_tanks', adump: 'm_adump', aop: 'm_aop', hq: 'm_hq', railyard: 'm_train', aconvoy: 'm_convoy', citadel: 'm_citadel', gate: 'm_gate', eastfort: 'm_eastfort',
  bdump: 'm_adump', bconvoy: 'm_convoy' };
// who reports: the air observer on the radio, else the VB on the telephone; in 1918 every report comes by telephone
const OBS = { ww2: { air: 'fu', foo: 'vb', railspot: 'vb' }, ww1: { air: 'vb', foo: 'vb', railspot: 'vb' } };

// the pages with voices, by operation id (the ids of the two eras do not overlap): the WW2 open battle and the
// Karl-Gerät, the WW1 open battle (not the Paris Gun's mission, nor the WW2 Gustav siege and V-weapon sites)
export const VOICED_OPS = new Set(['flanders', 'karl', 'ridge']);

export class CrewVoices {
  constructor({ audio, view = null, panel = null, radio = null, selectedId = () => null, active = () => true, era = 'ww2' } = {}) {
    this.audio = audio;
    this.era = era === 'ww1' ? 'ww1' : 'ww2';
    this.obs = OBS[this.era];
    this.radio = radio;
    this.selectedId = selectedId;
    this.active = active;
    this.lines = {};
    this.buffers = {};
    this.queue = { gun: [], tel: [] };
    this.busy = { gun: 0, tel: 0 };
    this.timer = { gun: 0, tel: 0 };
    this.playing = []; // telephone sources still sounding (stopped when the voices are switched off)
    this.cur = { gun: null, tel: null }; // the utterance each channel is speaking
    this.last = {};
    this.seen = new Map(); // unit id -> what the watchers saw last frame
    this.sel = null;
    this.shots = new Set(); // units that fired since the last update (a series ended by its last round is no cease)
    this.log = []; // [{ t, sim, ch, ids, de, en }] every utterance as it starts (the tests read it)
    this.fx = null;
    try { this.enabled = localStorage.getItem(STORE) !== '0'; } catch { this.enabled = true; }
    this.sub = view ? this.mountSubtitles(view) : null;
    this.btn = panel ? this.mountButton(panel) : null;
  }

  // ---------------------------------------------------------------- loading

  /** Fetch every clip and decode it with an offline context (no audio context or click needed), six at a time. */
  load() {
    return (this.loading ||= (async () => {
      try {
        const r = await fetch(`${BASE}lines.json`);
        if (!r.ok) return;
        this.lines = await r.json();
        const dec = {};
        const ctx = (rate) => (dec[rate] ||= new OfflineAudioContext(1, 1, rate));
        const ids = Object.keys(this.lines);
        let i = 0;
        const next = async () => {
          while (i < ids.length) {
            const id = ids[i++], line = this.lines[id];
            try {
              const res = await fetch(`${BASE}${line.file}`);
              if (res.ok) this.buffers[id] = await ctx(RATE[line.ch] ?? 22050).decodeAudioData(await res.arrayBuffer());
            } catch { /* a clip that fails is not spoken */ }
          }
        };
        await Promise.all(Array.from({ length: 6 }, next));
      } catch { /* no voice pack: the game plays without voices */ }
    })());
  }

  ready() {
    return this.load();
  }

  has(id) {
    return !!this.buffers[id];
  }

  // ---------------------------------------------------------------- the page

  mountSubtitles(view) {
    const box = document.createElement('div');
    box.id = 'voice-sub';
    const row = (cls) => {
      const el = document.createElement('div');
      el.className = `vs ${cls}`;
      box.append(el);
      return { el, t: 0 };
    };
    view.append(box);
    return { tel: row('tel'), gun: row('gun') };
  }

  mountButton(panel) {
    const b = document.createElement('button');
    b.id = 'voice-btn';
    b.type = 'button';
    b.title = 'Crew voices (V): the German callouts of the guns, the observers and the telephone, with subtitles';
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => { this.toggle(); this.audio?.ui?.('click'); });
    panel.append(b);
    this.btn = b;
    this.paintButton();
    return b;
  }

  paintButton() {
    if (!this.btn) return;
    this.btn.textContent = `VOICES ${this.enabled ? 'ON' : 'OFF'}`;
    this.btn.classList.toggle('off', !this.enabled);
  }

  toggle(on = !this.enabled) {
    this.enabled = on;
    try { localStorage.setItem(STORE, on ? '1' : '0'); } catch { /* this session only */ }
    if (!on) {
      this.queue.gun.length = this.queue.tel.length = 0;
      this.cut(this.cur.gun);
      for (const s of this.playing) try { s.stop(); } catch { /* ended */ }
      this.playing.length = 0;
      this.busy.gun = this.busy.tel = 0;
      for (const k of ['gun', 'tel']) this.sub?.[k].el.classList.remove('show');
    }
    this.paintButton();
    return on;
  }

  subtitle(ch, text, kind, seconds) {
    const row = this.sub?.[ch];
    if (!row) return;
    row.el.className = `vs ${ch} ${kind}`;
    row.el.replaceChildren();
    const de = document.createElement('b'), en = document.createElement('i');
    de.textContent = `«${text.de}»`;
    en.textContent = ` ${text.en}`;
    row.el.append(de, en);
    row.el.classList.add('show');
    clearTimeout(row.t);
    row.t = setTimeout(() => row.el.classList.remove('show'), (seconds + 1.2) * 1000);
  }

  // ---------------------------------------------------------------- the sim's events

  /** Chain onto the sim's events (call after main has wired its handlers: those it re-assigns would drop ours). */
  attach(sim) {
    this.sim = sim;
    const ev = sim.events;
    for (const name of ['load', 'fire', 'report', 'mission', 'incoming', 'casualty', 'pieceDestroyed', 'targetDestroyed', 'targetHit', 'sos', 'lift', 'raid']) {
      const prev = ev[name];
      ev[name] = (...a) => {
        prev?.(...a);
        try {
          if (this.live()) this[`on_${name}`](...a);
        } catch (e) {
          console.warn(`voices ${name}: ${e.message}`);
        }
      };
    }
  }

  live() {
    const s = this.sim;
    return this.enabled && !!s && !s.attract && this.active() && Object.keys(this.lines).length > 0;
  }

  unit() {
    const id = this.selectedId();
    return id == null ? null : this.sim?.unitById(id) ?? null;
  }

  // the gun whose crew speaks: the one the player serves in person, else the lowest-numbered gun still standing
  voicedPiece(u) {
    const st = this.sim?.gunner?.st;
    if (st && st.unitId === u.id) return u.pieces[st.pi] ?? null;
    return u.pieces.find((p) => p.state !== 'dead') ?? null;
  }

  voiced(u, p) {
    return this.live() && u?.id === this.selectedId() && p === this.voicedPiece(u);
  }

  /** main's load handler: the synthesized English "Ready!" of the voiced gun gives way to its German report. */
  replacesBark(u, p, step) {
    return step === 'ready' && this.voiced(u, p) && !!this.audio?.ctx;
  }

  on_load(u, p, step) {
    if (!this.voiced(u, p)) return;
    const k = p.kind, multi = u.pieces.length > 1, i = p.i;
    let id = null;
    if (k === 'nbw41') id = { open: 'w_open', shell: 'w_shell', prime: 'w_prime', lay: 'w_lay', cover: 'w_cover', ready: `w_r${i + 1}` }[step];
    else if (step === 'ready') id = multi && i < 4 ? `r_${i + 1}` : 'r_single';
    else if (step === 'lay') id = p.job?.n === 1 ? null : 's_lay'; // (a re-lay after a correction: the officer's "Verbesserung" says it)
    else id = {
      depress: 's_depress', open: 's_open', ram: 's_ram', close: 's_close',
      shell: LIFT.has(k) ? 's_shell_hoist' : k === 'karl' ? 's_shell_crane' : TRAY.has(k) ? 's_shell_tray' : 's_shell',
      cartridge: BAGS.has(k) ? 's_cart_bags' : 's_cart',
      prime: BAGS.has(k) ? 's_prime_tube' : 's_prime',
    }[step];
    if (!id) return;
    // a gun with rounds still ordered fires the moment it is ready: no report. Otherwise the report waits a moment, so
    // that an order to fire given at once (an AI crew fires as soon as a gun is ready) goes instead of it
    if (step === 'ready') { if (!((p.rounds ?? 0) > 0)) this.say([id], { ch: 'gun', priority: 2, key: 'ready', pos: p.pos, unit: u.id, hold: 0.4 }); }
    // a step said less than 15 s ago is left out: a field howitzer firing for effect calls every other cycle, not each
    else if (this.throttle(`step:${id}`, 15)) this.say([id], { ch: 'gun', priority: 0, key: 'step', pos: p.pos, unit: u.id });
  }

  on_fire(u, p, shell) {
    if (u.id !== this.selectedId() || u.def?.launcher) return;
    this.shots.add(u.id);
    // the gun has fired: its loading steps and its ready report still waiting are stale
    this.drop('gun', (q) => q.unit === u.id && (q.key === 'step' || q.key === 'ready' || q.key === 'kdo'));
    const s = this.state(u);
    if (p.volley == null || s.shotVolley === p.volley) return;
    s.shotVolley = p.volley;
    const m = u.missionId != null ? this.sim.missionById(u.missionId) : null;
    if (m && (m.kind === 'sos' || m.kind === 'barrage')) return; // no observer waits for these
    const id = u.kind === 'nbw41' ? 'shot_nbw' : (u.order?.rounds ?? 1) > 1 ? 'shot_ffe' : 'shot';
    this.say([id], { ch: 'tel', priority: 2, key: 'shot', unit: u.id });
  }

  on_report(m, rep) {
    if (rep.unitId !== this.selectedId()) return;
    const p = this.obs[m.observer];
    if (!p) return;
    const de = (rep.text || '').replace(/^[^:]*:\s*/, '').replace(/\s*\(.*$/, '');
    let ids;
    if (rep.wild) ids = [`${p}_wild`];
    else if (!rep.observed) ids = [`${p}_nobs`];
    else if (rep.ok) ids = [`${p}_ok`];
    else {
      const range = /(weiter|kürzer) (\d+)/.exec(de), line = /(rechts|links) (\d+)/.exec(de);
      if (!range && !line) ids = [`${p}_repeat`];
      else {
        ids = [`${p}_head`];
        if (range) {
          const d = range[1] === 'weiter' ? 'add' : 'drop';
          ids.push(this.has(`${p}_${d}_${range[2]}`) ? `${p}_${d}_${range[2]}` : `${p}_${d}`);
        }
        if (line) {
          const d = line[1] === 'links' ? 'left' : 'right';
          ids.push(this.has(`${p}_${d}_${line[2]}`) ? `${p}_${d}_${line[2]}` : `${p}_${d}`);
        }
      }
    }
    this.say(ids, { ch: 'tel', priority: 2, key: 'report', unit: rep.unitId });
  }

  on_mission(m, change) {
    if (change === 'new') {
      if (m.kind === 'sos') return; // the red flares (on_sos)
      const t = m.targetId ? this.sim.targetById(m.targetId) : null;
      if (m.kind === 'barrage' && this.era === 'ww1') return; // ("Gegenangriff": in 1918 the attack is ours)
      const id = m.kind === 'barrage' ? 'm_barrage' : m.kind === 'cb' || t?.battery ? 'm_cb' : MISSION_LINE[t?.kind] ?? 'm_any';
      this.say([id], { ch: 'tel', priority: m.kind === 'barrage' ? 2 : 1, key: id === 'm_barrage' ? id : `m${m.id}` });
    } else if ((change === 'done' || change === 'failed') && m.id === this.state(this.unit())?.mission) {
      const t = m.targetId ? this.sim.targetById(m.targetId) : null;
      const id = change === 'failed' ? 'm_failed' : m.kind === 'cb' || t?.battery ? 'm_done_cb' : 'm_done';
      if (m.kind !== 'sos' && m.kind !== 'barrage') this.say([id], { ch: 'tel', priority: 1, key: 'mdone' });
    }
  }

  on_incoming(shell) {
    const u = this.unit();
    if (!u?.alive || !shell?.aim || !u.pieces.some((p) => p.state !== 'dead' && Math.hypot(p.pos.x - shell.aim.x, p.pos.z - shell.aim.z) < 350)) return;
    if (!this.throttle('incoming', 25)) return;
    this.say([(this.last.cover2 = !this.last.cover2) ? 'al_cover2' : 'al_cover'], { ch: 'gun', priority: 3, key: 'alarm', pos: u.pos, unit: u.id });
  }

  on_casualty(u, p) {
    if (u.id !== this.selectedId() || !this.throttle('medic', 20)) return;
    this.say(['al_medic'], { ch: 'gun', priority: 2, key: 'medic', pos: p?.pos ?? u.pos, unit: u.id });
  }

  on_pieceDestroyed(u, p) {
    if (u.id !== this.selectedId()) return;
    this.say([u.pieces.length > 1 && p.i < 4 ? `al_down_${p.i + 1}` : 'al_down'], { ch: 'gun', priority: 2, key: `down${p.i}`, pos: u.pos, unit: u.id });
  }

  on_targetDestroyed(t, by) {
    const u = this.unit();
    if (!u || by !== u.id) return;
    const m = this.sim.missionById(this.state(u).mission);
    const p = this.obs[m?.observer];
    if (p) this.say([t.battery ? `${p}_kill_bty` : `${p}_kill`], { ch: 'tel', priority: 2, key: 'report', unit: u.id });
  }

  on_targetHit(t) {
    const u = this.unit();
    const m = u?.missionId != null ? this.sim.missionById(u.missionId) : null;
    const p = this.obs[m?.observer];
    if (!p || m.targetId !== t.id || m.state !== 'ffe' || !t.alive || !this.throttle('hit', 30)) return;
    this.say([`${p}_hit`], { ch: 'tel', priority: 0, key: 'hit', unit: u.id });
  }

  on_sos() {
    if (this.throttle('sos', 20)) this.say(['sos_call'], { ch: 'tel', priority: 3, key: 'sos' });
  }

  on_lift() {
    this.say(['lift'], { ch: 'tel', priority: 2, key: 'lift' });
  }

  on_raid(r, what) {
    const u = this.unit();
    if (!u?.alive || !r?.target) return;
    const d = Math.hypot(r.target.x - u.pos.x, r.target.z - u.pos.z);
    if (what === 'warning' && d < 2500 && this.throttle('air', 30)) this.say(['al_air'], { ch: 'gun', priority: 3, key: 'alarm', pos: u.pos, unit: u.id });
    else if (what === 'attack' && d < 1500 && this.throttle('jabo', 20)) this.say(['al_jabo'], { ch: 'gun', priority: 3, key: 'alarm', pos: u.pos, unit: u.id });
  }

  // ---------------------------------------------------------------- the watchers (every frame, the selected battery)

  state(u) {
    if (!u) return null;
    let s = this.seen.get(u.id);
    if (!s) this.seen.set(u.id, (s = {}));
    return s;
  }

  // what the battery is doing now, to compare with the last frame
  look(u) {
    const o = u.order ?? {}, live = u.pieces.filter((p) => p.state !== 'dead');
    return {
      target: o.target ? { x: o.target.x, z: o.target.z } : null, add: o.adj?.add ?? 0, right: o.adj?.right ?? 0,
      charge: o.charge, chargeAuto: o.chargeAuto, fuze: o.fuze, volleys: u.volleys ?? 0, mode: u.mode,
      rounds: u.pieces.reduce((n, p) => n + (p.state === 'dead' ? 0 : p.rounds ?? 0), 0),
      ready: live.length > 1 && live.every((p) => p.state === 'ready'), mission: u.missionId,
      stage: u.special?.stage ?? null, carrier: u.special?.schlepper?.state ?? null,
    };
  }

  watch(u) {
    const s = this.state(u), n = this.look(u), was = s.now;
    s.now = n;
    if (n.mission != null) s.mission = n.mission;
    if (!was || u.def?.launcher) return;
    const sim = this.sim, at = { ch: 'gun', pos: u.pos, unit: u.id };
    const m = n.mission != null ? sim.missionById(n.mission) : null;
    // the fire command for a new target (the Feuerkommando), a correction, another charge or fuze
    if (n.target && (!was.target || Math.hypot(n.target.x - was.target.x, n.target.z - was.target.z) > 60)) {
      const far = !was.target || Math.hypot(n.target.x - was.target.x, n.target.z - was.target.z) > 300 || n.mission !== was.mission;
      let ids;
      if (m?.kind === 'sos') ids = ['kdo_sperr'];
      else if (m?.kind === 'barrage') ids = far && n.mission !== was.mission ? ['kdo_walze'] : ['kdo_vor'];
      else if (far) ids = ['kdo_new', this.fuzeLine(u, n.fuze), this.chargeLine(u, n.charge)];
      else ids = ['kdo_verb'];
      this.say(ids.filter(Boolean), { ...at, priority: 1, key: 'kdo' });
    } else if (n.target && (n.add !== was.add || n.right !== was.right)) this.say(['kdo_verb'], { ...at, priority: 1, key: 'kdo' });
    else if (n.target && !n.chargeAuto && n.charge !== was.charge) this.say([this.chargeLine(u, n.charge)].filter(Boolean), { ...at, priority: 1, key: 'kdo' });
    else if (n.target && n.fuze !== was.fuze) this.say([this.fuzeLine(u, n.fuze)].filter(Boolean), { ...at, priority: 1, key: 'kdo' });
    // a fire order: which guns, how many rounds
    if (n.volleys > was.volleys) this.fireOrder(u, m, s);
    // cease fire: the rounds ordered gone without the last of them fired (a cease, a hold, the mission ended)
    if (was.rounds > 0 && n.rounds === 0 && !this.shots.has(u.id) && u.alive && this.throttle(`cease${u.id}`, 5)) this.say(['cease'], { ...at, priority: 2, key: 'cease' });
    else if (n.mode === 'hold' && was.mode !== 'hold' && was.rounds === 0 && this.throttle(`cease${u.id}`, 5)) this.say(['cease'], { ...at, priority: 2, key: 'cease' });
    // the whole battery loaded and laid
    if (n.ready && !was.ready) {
      this.drop('gun', (q) => q.unit === u.id && q.key === 'ready');
      this.say(['bty_ready'], { ...at, priority: 2, key: 'ready', hold: 0.4 });
    }
    // the Karl-Gerät's moves and its ammunition carrier
    if (u.kind === 'karl') {
      // (back in 'emplace' after a turn is no new arrival)
      if (n.stage !== was.stage && KARL_STAGE[n.stage] && (n.stage !== 'emplace' || was.stage === 'driving')) this.say([KARL_STAGE[n.stage]], { ...at, priority: 1, key: 'karl' });
      if (n.carrier !== was.carrier) this.say([n.carrier === 'away' ? 'k_fetch' : 'k_back'], { ...at, priority: 1, key: 'carrier' });
    }
  }

  fireOrder(u, m, s) {
    // the guns of this order (a ready gun has often fired it already, in the same step: its rounds are counted down)
    const sel = u.pieces.filter((p) => p.volley === u.volleys && p.state !== 'dead');
    if (!sel.length) return;
    const live = u.pieces.filter((p) => p.state !== 'dead'), rounds = u.order?.rounds ?? 1, werfer = u.kind === 'nbw41';
    const t = now();
    // the Sperrfeuer and the barrage: one call, not one each time the crew sets the guns going again
    if (m?.kind === 'sos' || m?.kind === 'barrage') {
      if (t - (s.sosSaid ?? -1e9) < 20 && s.sosMission === m.id) return;
      s.sosSaid = t;
      s.sosMission = m.id;
      this.say([m.kind === 'sos' ? 'f_sperr' : 'f_walze'], { ch: 'gun', pos: u.pos, unit: u.id, priority: 3, key: 'fire' });
      return;
    }
    let who;
    if (sel.length === 1 && live.length === 1) who = werfer ? 'f_werfer' : 'f_single';
    else if (sel.length === 1) who = werfer ? `f_w${Math.min(3, sel[0].i + 1)}` : sel[0].i < 4 ? `f_${sel[0].i + 1}` : 'f_bty';
    else if (sel.length === 2 && live.length === 4 && sel[0].i + 1 === sel[1].i && sel[0].i % 2 === 0) who = sel[0].i === 0 ? 'f_zug1' : 'f_zug2';
    else who = werfer ? 'f_werfer' : 'f_bty';
    const ids = rounds > 1 ? ['f_ffe', werfer ? `f_s${rounds}` : `f_n${rounds}`, who].filter((id) => this.has(id)) : [who];
    const sig = ids.join();
    if (sig === s.fireSaid && t - (s.fireAt ?? -1e9) < 8) return;
    s.fireSaid = sig;
    s.fireAt = t;
    // the order is the moment of the shot (an AI crew fires as soon as a gun is ready): it goes before the ready reports
    // of the same frame, which it makes stale; a fire command for this battery still waiting (a correction given with
    // the order) is said with it, first
    this.drop('gun', (q) => q.unit === u.id && (q.key === 'ready' || q.key === 'step'));
    const kdo = this.queue.gun.find((q) => q.unit === u.id && q.key === 'kdo');
    if (kdo) this.drop('gun', (q) => q === kdo);
    this.say(kdo ? [...kdo.ids, ...ids] : ids, { ch: 'gun', pos: u.pos, unit: u.id, priority: 3, key: 'fire' });
  }

  fuzeLine(u, fuze) {
    if (u.kind === 'nbw41') return null;
    return { instant: 'fz_instant', delay: 'fz_delay', shrapnel: 'fz_time' }[fuze] ?? null;
  }

  chargeLine(u, i) {
    const name = GUNS[u.kind]?.charges?.[i]?.name ?? '';
    const n = /Ladung (\d)/.exec(name);
    if (n) return `ch_${n[1]}`;
    return /Kleine/.test(name) ? 'ch_klein' : /Mittlere/.test(name) ? 'ch_mittel' : /Gro/.test(name) ? 'ch_gross' : null;
  }

  update(sim) {
    this.sim ??= sim;
    if (!sim) return;
    // a new game (the sim's clock went back): forget what the batteries were doing
    if (sim.time < (this.simT ?? 0)) this.seen.clear();
    this.simT = sim.time;
    const u = this.live() ? this.unit() : null;
    if (u) {
      // a battery newly selected starts from what it is doing, silently; the last one's lines still waiting go
      if (this.sel !== u.id) {
        this.sel = u.id;
        this.state(u).now = null;
        for (const ch of ['gun', 'tel']) this.drop(ch, (q) => q.unit != null && q.unit !== u.id);
      }
      this.watch(u);
    } else this.sel = null;
    this.shots.clear();
    if (!this.enabled) return;
    for (const ch of ['gun', 'tel']) if (now() >= this.busy[ch]) this.speakNext(ch);
  }

  // ---------------------------------------------------------------- the queues

  /** Queue an utterance: ids played back to back on a channel. opts: { ch, priority, key, pos (gun), unit } */
  say(ids, { ch = 'tel', priority = 1, key = null, pos = null, unit = null, hold = 0 } = {}) {
    if (!this.live() || !ids.length || !ids.every((id) => this.lines[id])) return;
    const q = this.queue[ch], t = now();
    // a newer line of the same kind replaces one still waiting
    if (key) for (let i = q.length - 1; i >= 0; i--) if (q[i].key === key && (q[i].unit === unit || unit == null)) q.splice(i, 1);
    q.push({ ids, priority, key, pos: pos ? { x: pos.x, y: (pos.y ?? 0) + 1.7, z: pos.z } : null, unit, at: t, due: t + hold });
    q.sort((a, b) => b.priority - a.priority || a.at - b.at);
    if (q.length > 6) q.length = 6;
    // an order at the guns cuts a lesser callout short (the officer's "Feuer!" over the loader's "Verschluss zu!")
    const c = this.cur[ch];
    if (ch === 'gun' && priority >= 3 && c && c.priority < priority && t < this.busy.gun) {
      this.cut(c);
      this.busy.gun = 0;
      clearTimeout(this.timer.gun);
    }
    // spoken from update(), after the sim's step: the lines of one frame are ordered by priority before the first plays
  }

  // stop an utterance at the guns: still in the air (its sound travelling), or already sounding (a quick fade)
  cut(item) {
    if (!item) return;
    item.cancelled = true;
    if (item.log) item.log.cut = now();
    const c = this.audio?.ctx;
    if (item.out && c) {
      item.out.gain.setTargetAtTime(0, c.currentTime, 0.02);
      for (const s of item.sources) try { s.stop(c.currentTime + 0.1); } catch { /* ended */ }
    }
    this.sub?.gun.el.classList.remove('show');
  }

  drop(ch, fn) {
    const q = this.queue[ch];
    for (let i = q.length - 1; i >= 0; i--) if (fn(q[i])) q.splice(i, 1);
  }

  throttle(key, seconds) {
    const t = now();
    if (t - (this.last[key] ?? -1e9) < seconds) return false;
    this.last[key] = t;
    return true;
  }

  speakNext(ch) {
    const a = this.audio, t = now();
    if (!a?.ctx || !this.ensure() || t < this.busy[ch] - 0.01) return;
    const q = this.queue[ch];
    for (let i = q.length - 1; i >= 0; i--) if (t - q[i].at > MAX_AGE[q[i].priority]) q.splice(i, 1);
    while (q.length) {
      // the first line due (one held back a moment waits in its place)
      const k = q.findIndex((x) => t >= x.due);
      if (k < 0) return;
      const item = q.splice(k, 1)[0];
      const bufs = item.ids.map((id) => this.buffers[id]);
      if (bufs.some((b) => !b)) continue;
      const dur = bufs.reduce((s, b) => s + b.duration, 0) + GAP * (bufs.length - 1);
      const lines = item.ids.map((id) => this.lines[id]);
      const text = { de: lines.map((l) => l.de).join(' '), en: lines.map((l) => l.en).join(' ') };
      const kind = lines[0].ch;
      item.log = { t, sim: Math.round((this.sim?.time ?? 0) * 10) / 10, ch, ids: item.ids, de: text.de, en: text.en };
      this.log.push(item.log);
      if (this.log.length > 300) this.log.shift();
      this.cur[ch] = item;
      if (ch === 'gun') this.shout(item, bufs, text, dur);
      else this.phone(kind, bufs, text, dur, lines.some((l) => l.log));
      this.busy[ch] = t + dur + AFTER;
      clearTimeout(this.timer[ch]);
      // the next line follows as soon as this one ends, not on the next frame
      this.timer[ch] = setTimeout(() => this.speakNext(ch), (dur + AFTER) * 1000 + 5);
      return;
    }
  }

  // At the guns: a shout in the open, heard from where it is shouted, after its travel time, through the distance filters.
  shout(item, bufs, text, dur) {
    const a = this.audio, c = a.ctx;
    a.enqueue('voice', item.pos, REF, LEVEL, (p) => {
      if (item.cancelled) return;
      const r = a.route(p, { ref: REF, level: LEVEL, reverb: 0.22 });
      if (!r) return;
      item.out = r.out;
      item.sources = [];
      // a raised voice: little chest, a hard presence around 2 kHz, a touch of drive
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2100; pk.Q.value = 0.9; pk.gain.value = 4;
      const sh = c.createWaveShaper(); sh.curve = this.fx.shout;
      hp.connect(pk).connect(sh).connect(r.dest);
      r.nodes.push(hp, pk, sh);
      let t = r.t0;
      for (const b of bufs) {
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(hp);
        s.start(t);
        r.nodes.push(s);
        item.sources.push(s);
        t += b.duration + GAP;
      }
      r.end = t + 0.05;
      a.finish(r);
      this.subtitle('gun', text, 'gun', dur);
    });
  }

  // On the line: the field telephone (or the radio) at the player's ear, with its key clicks and its noise.
  phone(kind, bufs, text, dur, log) {
    const c = this.audio.ctx, chain = kind === 'radio' ? this.fx.radio : this.fx.phone;
    const at = c.currentTime + 0.06;
    this.click(chain, c.currentTime, 0.5);
    const hiss = c.createBufferSource(), hg = c.createGain();
    hiss.buffer = this.fx.hiss;
    hiss.loop = true;
    hg.gain.value = kind === 'radio' ? 0.035 : 0.012;
    hiss.connect(hg).connect(chain.input);
    hiss.start(c.currentTime, Math.random() * 0.8);
    let t = at;
    for (const b of bufs) {
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(chain.input);
      s.start(t);
      this.playing.push(s);
      s.onended = () => { s.disconnect(); const k = this.playing.indexOf(s); if (k >= 0) this.playing.splice(k, 1); };
      t += b.duration + GAP;
    }
    hiss.stop(t + 0.04);
    hiss.onended = () => { hiss.disconnect(); hg.disconnect(); const k = this.playing.indexOf(hiss); if (k >= 0) this.playing.splice(k, 1); };
    this.click(chain, t + 0.02, 0.35);
    this.playing.push(hiss);
    this.subtitle('tel', text, kind, dur);
    if (log) this.radio?.(`«${text.de}» ${text.en}`, kind === 'radio' ? 'wireless' : 'phone');
  }

  click(chain, when, level) {
    const c = this.audio.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.fx.click;
    g.gain.value = level;
    s.connect(g).connect(chain.input);
    s.start(when);
    s.onended = () => { s.disconnect(); g.disconnect(); };
  }

  // the field telephone and the radio: band-limited, a little overdriven; the radio narrower, noisier and fading
  ensure() {
    if (this.fx) return true;
    const c = this.audio?.ctx;
    if (!c || !this.audio.uiBus) return false;
    const chain = ({ lo, hi, f, gain, k, level, fade }) => {
      const input = c.createGain();
      let n = input;
      for (const [type, freq, q, g] of [['highpass', lo, 0.7], ['highpass', lo, 0.7], ['peaking', f, 1.1, gain], ['shaper'], ['lowpass', hi, 0.7], ['lowpass', hi, 0.7]]) {
        let node;
        if (type === 'shaper') { node = c.createWaveShaper(); node.curve = shaper(k); node.oversample = '2x'; }
        else { node = c.createBiquadFilter(); node.type = type; node.frequency.value = freq; node.Q.value = q; if (g) node.gain.value = g; }
        n.connect(node);
        n = node;
      }
      const out = c.createGain();
      out.gain.value = level;
      if (fade) {
        // the radio's slow fading: the level breathes by a few dB
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 0.55;
        depth.gain.value = level * 0.18;
        lfo.connect(depth).connect(out.gain);
        lfo.start();
      }
      n.connect(out).connect(this.audio.uiBus);
      return { input, out };
    };
    const rate = c.sampleRate;
    const render = (seconds, fn) => {
      const n = Math.floor(rate * seconds), b = c.createBuffer(1, n, rate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = fn(i / rate);
      return b;
    };
    this.fx = {
      phone: chain({ lo: 320, hi: 3300, f: 1800, gain: 5, k: 2.2, level: 0.55 }),
      radio: chain({ lo: 420, hi: 2700, f: 1500, gain: 4, k: 3, level: 0.5, fade: true }),
      shout: shaper(1.4),
      // the handset's key: a sharp tick and a short thump of the line
      click: render(0.06, (t) => (t < 0.003 ? (Math.random() * 2 - 1) : 0) * 0.7 + Math.sin(TAU * 180 * t) * Math.exp(-t * 90) * 0.3),
      // line noise with a crackle in it
      hiss: render(1.2, () => (Math.random() * 2 - 1) * 0.5 + (Math.random() < 0.0008 ? (Math.random() * 2 - 1) * 3 : 0)),
    };
    return true;
  }
}

function shaper(k) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

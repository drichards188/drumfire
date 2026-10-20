import { STATIONS, fmtDefl, toStrich } from './game.js';
import { GUN, SHELLS, FUZES, STRICH, MAX_BAGS } from './ballistics.js';
import { t, L, getLang } from './i18n.js';

// The Bertha page's own overlay, beside the shared HUD (hud.js: toast, hint, kills, clock, score, compass):
// the order card with its checklist (the correction against the last order, the round in flight, the
// observer's last report), the station bar (the next job's station marked), the action prompt with its
// progress bar, the "Next" line and the refusals, the station readout (dials, the chamber, the target list), the
// message log, the panoramic sight's reticle and the clinometer, in the page's language (i18n.js). It reads the
// game and the page's view state every frame and writes only when text changes; relabel() redraws everything
// after a language switch.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ok = (b) => (b ? '<i class="ok">&#10003;</i>' : '<i class="no">&#10007;</i>');
const kb = (k) => (k ? `<kbd>${esc(k)}</kbd>` : '');
const DEG = Math.PI / 180;

// names of the game's things in the page's language
export const stationName = (s) => (getLang() === 'de' ? s.name : s.en);
export const shellName = (k) => (getLang() === 'de' ? SHELLS[k].name : SHELLS[k].en);
export const fuzeName = (k) => (getLang() === 'de' ? FUZES[k].short : FUZES[k].enShort);
export const targetName = (o) => (getLang() === 'de' ? o.name : o.en);
export const defl = (rad) => fmtDefl(rad, getLang());
const STATION = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export class BerthaHud {
  constructor() {
    this.cache = {};
    this.log = [];
    this.flashT = 0;
    this.stationsEl = $('stations');
    this.buildStations();
    const ticks = document.querySelector('#sight .ticks');
    // reticle ticks every 10 mils either side, longer every 50; placed in update() from the field of view
    this.ticks = [];
    for (let i = -10; i <= 10; i++) {
      if (!i) continue;
      const el = document.createElement('i');
      el.className = i % 5 ? 't' : 't long';
      ticks.appendChild(el);
      this.ticks.push({ el, s: i * 10 });
    }
    // clinometer arc: graduations every 50 mils around the set value
    this.qArc = $('q-arc');
  }

  buildStations() {
    this.stationsEl.innerHTML = STATIONS.map((s) => `<button data-st="${s.id}" type="button"><kbd>${s.key}</kbd><b>${stationName(s)}</b><i class="todo"></i><em class="nx">${t('nextTag')}</em></button>`).join('')
      + `<button id="assist-btn" type="button" title="${t('assistTip')}"><kbd>C</kbd><b>${t('assistBtn')}</b><small></small></button>`;
    this.stationBtns = [...this.stationsEl.querySelectorAll('button[data-st]')];
    this.assistBtn = $('assist-btn');
    if (this.assistShown) this.setAssist(...this.assistShown);
  }

  // the crew-assist switch on the station bar: on, off, or not offered (the tutorial teaches every job by hand)
  setAssist(on, allowed = true) {
    this.assistShown = [on, allowed];
    const b = this.assistBtn;
    b.classList.toggle('on', on && allowed);
    b.classList.toggle('off', !allowed);
    b.querySelector('small').textContent = !allowed ? t('assistNo') : on ? t('assistOn') : t('assistOff');
  }

  relabel() {
    this.cache = {};
    this.buildStations();
    for (const el of this.log) el.innerHTML = esc(L({ de: el.msg.text, en: el.msg.en }));
  }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    $(id).innerHTML = html;
  }

  message(m) {
    const box = $('radio');
    const el = document.createElement('div');
    el.className = `line ${m.kind}`;
    el.msg = m;
    el.innerHTML = esc(L({ de: m.text, en: m.en }));
    box.appendChild(el);
    this.log.push(el);
    while (this.log.length > 6) this.log.shift().remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.remove();
      this.log = this.log.filter((x) => x !== el);
    }, m.kind === 'order' ? 40000 : 20000);
  }

  clearLog() {
    $('radio').replaceChildren();
    this.log = [];
  }

  // a short line under the prompt: why a key did nothing, or what it changed (HTML, i18n strings)
  flash(html, ms = 3200, kind = 'warn') {
    this.flashT = performance.now() + ms;
    const el = $('prompt-flash');
    el.innerHTML = html;
    el.className = `p-flash on ${kind}`;
  }

  // the stations that have work waiting, for the dots on the bar
  todo(game) {
    const g = game.gun, o = game.order, laid = game.laid(o), td = {};
    td.cmd = !!(o && !o.acked);
    const need = o?.acked && o.fired < o.rounds;
    td.load = !!(need && !g.loaded && game.actions('load').list.length) || game.mismatch();
    td.elev = (!g.loaded && !g.breechOpen && g.el > GUN.loadEl + 0.6 * DEG) || !!(need && g.loaded && (!laid.elev || !laid.quad));
    td.trav = !!(o?.acked && (!laid.line || !laid.sight));
    td.fire = !!(need && game.actions('fire').list.length && laid.line && laid.elev);
    return td;
  }

  update(game, view) {
    const g = game.gun, o = game.order, laid = game.laid(o), lang = getLang();
    const nx = game.next();
    // with the crew assisting, the player only does his own station's work; the next job elsewhere is the crew's
    const mine = nx && (!game.assist || nx.st === game.station);
    // ---------------------------------------------------------------- stations
    const todo = this.todo(game);
    for (const b of this.stationBtns) {
      const st = b.dataset.st;
      b.classList.toggle('on', st === game.station);
      b.classList.toggle('busy', !!todo[st]);
      b.classList.toggle('next', !!(mine && !nx.wait && nx.st === st && st !== game.station));
      b.classList.toggle('hi', st === view.highlight);
    }
    // ---------------------------------------------------------------- the order card
    this.set('order', this.orderCard(game, laid));
    // ---------------------------------------------------------------- prompt
    const acts = game.actions(game.station);
    const a = game.action;
    const en = lang === 'en';
    const keys = acts.list.map((x) => `<span class="${[a?.id === x.id ? 'act' : '', x.warn ? 'warn' : ''].join(' ')}"><kbd>${x.key}</kbd> ${t('hold')}: ${esc(en ? x.en : x.label)}</span>`).join('');
    this.set('prompt-keys', keys);
    let why = acts.list.length ? '' : acts.why ? esc(L(acts.why)) : game.station === 'trav' ? t('whyTrav') : game.station === 'elev' ? t('whyElev') : '';
    // the round in the gun is not the one ordered, or the gun is not laid: the firer is warned (he may still pull)
    if (game.station === 'fire' && acts.list.length) {
      if (game.mismatch()) why = t('warnWrongRound');
      else if (!laid.line || !laid.elev) why = t('warnNotLaid');
    }
    this.set('prompt-why', why);
    // the next job: here (the key to use), or at another station (the number to press)
    let next = '';
    if (nx && game.state === 'playing') {
      const what = esc(lang === 'de' ? nx.de : nx.en);
      if (nx.wait) next = `<span class="wait">${what}</span>`;
      else if (!mine) next = `<span class="crew">${t('crewDoes', stationName(STATION[nx.st]))}: ${what}</span>`;
      else if (nx.st === game.station) next = acts.list.length && acts.list.some((x) => x.key === nx.key) ? '' : `${t('nextHere')} ${kb(nx.key)} ${what}`;
      else next = `${t('nextTag')} &#9656; ${t('press')} ${kb(STATION[nx.st].key)} <b>${esc(stationName(STATION[nx.st]))}</b>: ${nx.key ? kb(nx.key) + ' ' : ''}${what}`;
    }
    this.set('prompt-next', next);
    document.querySelector('#prompt .p-bar i').style.width = `${a ? Math.min(100, (a.t / a.dur) * 100) : 0}%`;
    document.querySelector('#prompt .p-bar').classList.toggle('on', !!a);
    if (this.flashT && performance.now() > this.flashT) {
      this.flashT = 0;
      $('prompt-flash').className = 'p-flash';
    }
    // ---------------------------------------------------------------- readout per station
    this.set('readout', this.readout(game, view, laid));
    // ---------------------------------------------------------------- hp
    $('hp').textContent = Math.round(g.hp);
    $('hp-bar').style.width = `${g.hp}%`;
    // ---------------------------------------------------------------- instruments
    const showSight = view.instrument && game.station === 'trav';
    const showQuad = game.station === 'elev';
    document.body.classList.toggle('sight-on', showSight);
    document.body.classList.toggle('quad-on', showQuad);
    document.body.classList.toggle('quad-big', showQuad && view.instrument);
    if (showSight) {
      // px per radian on the screen at the sight's field of view
      const pxr = view.height / (view.fovRad || 0.17);
      for (const tk of this.ticks) tk.el.style.transform = `translateX(${(tk.s * STRICH * pxr).toFixed(1)}px)`;
      this.set('sight-val', defl(g.sight));
      // the panoramic sight's two scales: the ring in hundreds, the micrometer drum in single mils
      const v = toStrich(g.sight), H = Math.trunc(Math.abs(v) / 100), u = Math.abs(v) % 100;
      this.set('sight-ord', `${t('sightRing')} ${v > 0 ? 'L' : v < 0 ? 'R' : ''}${H} &middot; ${t('sightDrum')} ${String(u).padStart(2, '0')}${o ? ` &middot; ${t('ordered')} ${defl(o.defl)}` : ''}`);
    }
    if (showQuad) {
      const d = toStrich(g.el - g.quad);
      const bx = Math.max(-92, Math.min(92, d * 9));
      $('q-bubble').setAttribute('cx', bx.toFixed(1));
      this.set('quad-val', String(toStrich(g.quad)));
      this.set('quad-ord', o ? `${t('ordered')} ${toStrich(o.el)}` : '');
      const q = toStrich(g.quad);
      if (this.cache.qArc !== q) {
        this.cache.qArc = q;
        let s = '';
        for (let k = Math.floor((q - 300) / 50) * 50; k <= q + 300; k += 50) {
          if (k < 0) continue;
          const an = ((k - q) / 300) * 1.1 - Math.PI / 2;
          const big = k % 100 === 0;
          const r0 = 150, r1 = big ? 128 : 138;
          s += `<line x1="${(Math.cos(an) * r0).toFixed(1)}" y1="${(Math.sin(an) * r0).toFixed(1)}" x2="${(Math.cos(an) * r1).toFixed(1)}" y2="${(Math.sin(an) * r1).toFixed(1)}" class="q-tick" />`;
          if (big) s += `<text x="${(Math.cos(an) * 112).toFixed(1)}" y="${(Math.sin(an) * 112 + 5).toFixed(1)}" class="q-num">${k}</text>`;
        }
        this.qArc.innerHTML = s;
      }
    }
  }

  // the order card: the order (revealed line by line while the commander reads it back), each line's station and
  // ticks, the correction against the last order on the target, the round in flight and the observer's report
  orderCard(game, laid) {
    const g = game.gun, o = game.order;
    if (!o) return `<h3>${t('orderTitle')}</h3><p class="wait">${t('waitOrder')}</p>${this.fallLine(game)}`;
    const reading = !o.acked && game.action?.id === 'ack';
    if (!o.acked && !reading) return `<h3>${t('orderTitle')} ${o.n} <span class="tag">${t('orderNew')}</span></h3><p class="wait ring">${t('phoneRings')}<small>${t('phoneHow')}</small></p>${this.fallLine(game)}`;
    const show = reading ? Math.floor((game.action.t / game.action.dur) * 7) : 9;
    const ld = g.loaded ?? (g.rammed ? { ...g.rammed, bags: g.bags } : g.tray ? { ...g.tray, bags: 0 } : null);
    const shellOk = ld && ld.shell === o.shell && ld.fuze === o.fuze;
    const bs = t('breechState');
    const p = o.prev;
    // the correction: how far the line and the elevation moved from the last order (in mils)
    const dL = p ? toStrich(o.defl - p.defl) : 0, dE = p ? toStrich(o.el - p.el) : 0;
    const corrL = p && dL ? ` <span class="corr">${t('corrL', dL)}</span>` : '';
    const corrE = p && dE ? ` <span class="corr">(${dE > 0 ? '+' : ''}${dE})</span>` : '';
    const rows = [
      [4, t('shell'), `${shellName(o.shell)}, ${fuzeName(o.fuze)}`, ld ? ok(shellOk) : ''],
      [4, t('charge'), `${o.charge} <small>${t('chargeIs', o.charge)}</small>`, g.loaded ? ok(g.loaded.bags === o.charge) : g.rammed ? `<span class="n">${g.bags}</span>` : ''],
      [4, t('breech'), g.loaded ? bs.loaded : g.breechOpen ? bs.open : bs.shut, ok(!!g.loaded && !g.breechOpen)],
      [2, t('line'), `${defl(o.defl)}${corrL}`, `${ok(laid.sight)}${ok(laid.line)}`],
      [3, t('elevation'), `${toStrich(o.el)}${corrE} <small>(${(o.el / DEG).toFixed(1)}&deg;)</small>`, `${ok(laid.quad)}${ok(laid.elev)}`],
      [5, t('rounds'), `${o.fired} / ${o.rounds}`, o.fired >= o.rounds ? '<i class="ok">&#10003;</i>' : ''],
    ];
    const tr = rows.map(([st, h, v, c], i) => (i < show ? `<tr><td class="st">${st}</td><th>${h}</th><td>${v}</td><td>${reading ? '' : c}</td></tr>` : `<tr class="blank"><td class="st"></td><th>${h}</th><td>&hellip;</td><td></td></tr>`)).join('');
    return `<h3>${t('orderTitle')} ${o.n} <span class="tag">${reading ? t('readingBack') : t('kind')[o.kind]}</span></h3>
      <div class="tgt">${esc(targetName(o))} <small>${o.grid} &middot; ${(o.range / 1000).toFixed(1)} km &middot; ${t('tofIs', o.tof.toFixed(0))}</small></div>
      <table>${tr}</table>
      <p class="legend">${t('legend')}</p>${this.fallLine(game)}`;
  }

  // the round in the air (a bar to the burst), the wait for the observer, or the fall of the last round
  fallLine(game) {
    const o = game.order;
    const sh = game.shells.filter((s) => s.own && s.alive).reduce((b, s) => (!b || s.id > b.id ? s : b), null);
    if (sh) {
      const tof = o && sh.order === o.n ? o.tof : sh.t + 1;
      const k = Math.min(1, sh.t / tof);
      return `<div class="flight"><span>${t('inFlight', Math.max(0, Math.round(tof - sh.t)))}</span><i><em style="width:${(k * 100).toFixed(1)}%"></em></i><small>${t('flightKeys')}</small></div>`;
    }
    if (game.pendingReports.length) return `<div class="flight splash"><span>${t('splash')}</span></div>`;
    const r = game.lastReport;
    if (r && game.time - r.at < 90) return `<div class="fall"><b>${t('lastFall')}:</b> ${esc(getLang() === 'de' ? r.de : r.en)}</div>`;
    return '';
  }

  readout(game, view, laid) {
    const g = game.gun, o = game.order;
    let r = '';
    const st = STATION[game.station];
    if (st) r += `<h4>${st.key} &middot; ${stationName(st)}</h4>`;
    const ord = (v) => (o ? ` <small>(${t('ordered')} ${v})</small>` : '');
    if (game.station === 'trav') {
      r += `<p>${t('sightSet')}: <b>${defl(g.sight)}</b>${ord(defl(o?.defl))} ${o ? ok(laid.sight) : ''}</p>`;
      r += `<p>${t('carriage')}: <b>${defl(g.tr)}</b> <small>${t('trStop', toStrich(GUN.trMax))}</small></p>`;
      const off = toStrich(g.tr - g.sight);
      r += `<p>${t('postNow', off)}</p>`;
      r += `<p class="keys">${t('travKeys')} ${t('travLook', view.instrument)}</p>`;
    } else if (game.station === 'elev') {
      r += `<p>${t('quadSet')}: <b>${toStrich(g.quad)}</b> <small>(${(g.quad / DEG).toFixed(1)}&deg;)</small>${ord(o ? toStrich(o.el) : '')} ${o ? ok(laid.quad) : ''}</p>`;
      r += `<p>${t('barrelNow', (g.el / DEG).toFixed(1), toStrich(g.el), (GUN.loadEl / DEG).toFixed(0))}</p>`;
      if (o?.acked && g.loaded) r += `<p>${t('bubble', toStrich(g.el - g.quad))}</p>`;
      r += `<p class="keys">${t('elevKeys')} ${t('elevLook', view.instrument)}</p>`;
      if (g.breechOpen) r += `<p class="hintline">${t('elevOpen')}</p>`;
    } else if (game.station === 'load') {
      r += `<p>${t('loadShell')} <kbd>Q</kbd> <b>${shellName(game.selShell)}</b> &middot; ${t('loadFuze')} <kbd>Z</kbd> <b>${fuzeName(game.selFuze)}</b>${o?.acked && (game.selShell !== o.shell || game.selFuze !== o.fuze) && !g.tray && !g.rammed && !g.loaded ? ` <i class="no">${t('notOrdered')}</i>` : ''}</p>`;
      r += `<div class="chamber">${this.chamber(game)}</div>`;
      r += `<p class="hintline">${t('loadHint')}</p>`;
    } else if (game.station === 'fire') {
      const ready = !!g.loaded && laid.line && laid.elev && !game.mismatch();
      r += `<p>${t('fireLoaded')} ${ok(!!g.loaded)} ${t('fireLine')} ${ok(laid.line)} ${t('fireElev')} ${ok(laid.elev)}</p>`;
      if (o?.acked && o.fired < o.rounds) r += `<p class="${ready ? 'ready' : 'hintline'}">${ready ? t('fireReady') : t('fireHint')}</p>`;
    } else if (game.station === 'cmd') {
      r += `<p>${t('cmdWind', Math.hypot(game.wind.x, game.wind.z).toFixed(1), game.roundsFired)}</p>`;
      r += `<ul class="targets">${game.targets.map((x) => `<li class="${x.alive ? (x === game.target ? 'cur' : '') : 'done'}">${x === game.target && x.alive ? '&#9656; ' : ''}${esc(targetName(x))}${x.pieces.length ? ` <small>${x.pieces.filter((p) => !p.dead).length}/${x.pieces.length}</small>` : x.alive ? ` <small>${x.hpLeft}/${x.hp}</small>` : ''}</li>`).join('')}</ul>`;
      r += `<p class="hintline">${t('cmdHint')}</p>`;
    }
    return r;
  }

  // the chamber as the loader sees it, breech end on the right: the shell, the bags (Vorkartuschen) ahead of the
  // brass case (Hauptkartusche), with the ordered number of bags as empty slots
  chamber(game) {
    const g = game.gun, o = game.order;
    const L = g.loaded, shell = L?.shell ?? g.rammed?.shell ?? null, bags = L ? L.bags : g.bags, caseIn = !!L || g.caseIn;
    const want = o?.acked ? o.charge : null;
    let s = `<span class="c-shell ${shell ? (shell === 'leicht' ? 'light' : '') : 'empty'}" title="${t('shell')}"></span>`;
    const n = Math.max(bags, want ?? 0);
    for (let i = 0; i < Math.min(MAX_BAGS, n); i++) s += `<span class="c-bag ${i < bags ? (want != null && i >= want ? 'over' : '') : 'empty'}"></span>`;
    s += `<span class="c-case ${caseIn ? '' : 'empty'}"></span>`;
    s += `<span class="c-wedge ${g.breechOpen ? 'open' : ''}"></span>`;
    const label = t('chamberIs', shell ? shellName(shell) : null, bags, caseIn, want);
    return `<div class="c-row">${s}</div><small>${label}</small>`;
  }
}

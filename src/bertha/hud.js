import { STATIONS, fmtDefl, toStrich } from './game.js';
import { GUN, SHELLS, FUZES, STRICH } from './ballistics.js';
import { t, L, getLang } from './i18n.js';

// The Bertha page's own overlay, beside the shared HUD (hud.js: toast, hint, kills, clock, score, compass):
// the order card with its checklist, the station bar, the action prompt with its progress bar, the station
// readout, the message log, the panoramic sight's reticle and the clinometer, in the page's language
// (i18n.js). It reads the game and the page's view state every frame and writes only when text changes;
// relabel() redraws everything after a language switch.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ok = (b) => (b ? '<i class="ok">&#10003;</i>' : '<i class="no">&#10007;</i>');
const DEG = Math.PI / 180;

// names of the game's things in the page's language
export const stationName = (s) => (getLang() === 'de' ? s.name : s.en);
export const shellName = (k) => (getLang() === 'de' ? SHELLS[k].name : SHELLS[k].en);
export const fuzeName = (k) => (getLang() === 'de' ? FUZES[k].short : FUZES[k].enShort);
export const targetName = (o) => (getLang() === 'de' ? o.name : o.en);
export const defl = (rad) => fmtDefl(rad, getLang());

export class BerthaHud {
  constructor() {
    this.cache = {};
    this.log = [];
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
    this.stationsEl.innerHTML = STATIONS.map((s) => `<button data-st="${s.id}" type="button"><kbd>${s.key}</kbd><b>${stationName(s)}</b><i class="todo"></i></button>`).join('');
    this.stationBtns = [...this.stationsEl.querySelectorAll('button')];
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
    const g = game.gun, o = game.order, laid = game.laid(o);
    // ---------------------------------------------------------------- stations
    const todo = this.todo(game);
    for (const b of this.stationBtns) {
      b.classList.toggle('on', b.dataset.st === game.station);
      b.classList.toggle('busy', !!todo[b.dataset.st]);
      b.classList.toggle('hi', b.dataset.st === view.highlight);
    }
    // ---------------------------------------------------------------- the order card
    if (!o) this.set('order', `<h3>${t('orderTitle')}</h3><p class="wait">${t('waitOrder')}</p>`);
    else if (!o.acked) this.set('order', `<h3>${t('orderTitle')} ${o.n} <span class="tag">${t('orderNew')}</span></h3><p class="wait ring">${t('phoneRings')}<small>${t('phoneHow')}</small></p>`);
    else {
      const ld = g.loaded ?? (g.rammed ? { ...g.rammed, bags: g.bags } : g.tray ? { ...g.tray, bags: 0 } : null);
      const shellOk = ld && ld.shell === o.shell && ld.fuze === o.fuze;
      const bs = t('breechState');
      this.set('order', `<h3>${t('orderTitle')} ${o.n} <span class="tag">${t('kind')[o.kind]}</span></h3>
        <div class="tgt">${esc(targetName(o))} <small>${o.grid} &middot; ${(o.range / 1000).toFixed(1)} km</small></div>
        <table>
          <tr><td class="st">4</td><th>${t('shell')}</th><td>${shellName(o.shell)}, ${fuzeName(o.fuze)}</td><td>${ld ? ok(shellOk) : ''}</td></tr>
          <tr><td class="st">4</td><th>${t('charge')}</th><td>${o.charge}</td><td>${g.loaded ? ok(g.loaded.bags === o.charge) : g.rammed ? `<span class="n">${g.bags}</span>` : ''}</td></tr>
          <tr><td class="st">4</td><th>${t('breech')}</th><td>${g.loaded ? bs.loaded : g.breechOpen ? bs.open : bs.shut}</td><td>${ok(!!g.loaded && !g.breechOpen)}</td></tr>
          <tr><td class="st">2</td><th>${t('line')}</th><td>${defl(o.defl)}</td><td>${ok(laid.sight)}${ok(laid.line)}</td></tr>
          <tr><td class="st">3</td><th>${t('elevation')}</th><td>${toStrich(o.el)} <small>(${(o.el / DEG).toFixed(1)}&deg;)</small></td><td>${ok(laid.quad)}${ok(laid.elev)}</td></tr>
          <tr><td class="st">5</td><th>${t('rounds')}</th><td>${o.fired} / ${o.rounds}</td><td>${o.fired >= o.rounds ? '<i class="ok">&#10003;</i>' : ''}</td></tr>
        </table>
        <p class="legend">${t('legend', o.tof.toFixed(0))}</p>`);
    }
    // ---------------------------------------------------------------- prompt
    const acts = game.actions(game.station);
    const a = game.action;
    const en = getLang() === 'en';
    const keys = acts.list.map((x) => `<span class="${a?.id === x.id ? 'act' : ''}"><kbd>${x.key}</kbd> ${t('hold')}: ${esc(en ? x.en : x.label)}</span>`).join('');
    this.set('prompt-keys', keys);
    this.set('prompt-why', acts.list.length ? '' : esc(L(acts.why)));
    document.querySelector('#prompt .p-bar i').style.width = `${a ? Math.min(100, (a.t / a.dur) * 100) : 0}%`;
    document.querySelector('#prompt .p-bar').classList.toggle('on', !!a);
    // ---------------------------------------------------------------- readout per station
    let r = '';
    const st = STATIONS.find((s) => s.id === game.station);
    if (st) r += `<h4>${st.key} &middot; ${stationName(st)}</h4>`;
    const ord = (v) => (o ? ` <small>(${t('ordered')} ${v})</small>` : '');
    if (game.station === 'trav') {
      r += `<p>${t('sightSet')}: <b>${defl(g.sight)}</b>${ord(defl(o?.defl))}</p>`;
      const off = toStrich(g.tr - g.sight);
      r += `<p>${t('postNow', off)}</p>`;
      r += `<p class="keys">${t('travKeys')} ${t('travLook', view.instrument)}</p>`;
      r += `<p class="hintline">${t('travHint')}</p>`;
    } else if (game.station === 'elev') {
      r += `<p>${t('quadSet')}: <b>${toStrich(g.quad)}</b> <small>(${(g.quad / DEG).toFixed(1)}&deg;)</small>${ord(o ? toStrich(o.el) : '')}</p>`;
      r += `<p>${t('barrelNow', (g.el / DEG).toFixed(1), (GUN.loadEl / DEG).toFixed(0))}</p>`;
      r += `<p class="keys">${t('elevKeys')} ${t('elevLook', view.instrument)}</p>`;
      r += `<p class="hintline">${!g.loaded && !g.breechOpen && g.el > GUN.loadEl + 0.01 ? t('elevLower') : t('elevLay')}${g.breechOpen ? t('elevOpen') : ''}</p>`;
    } else if (game.station === 'load') {
      r += `<p>${t('loadShell')} <kbd>Q</kbd> <b>${shellName(game.selShell)}</b> &middot; ${t('loadFuze')} <kbd>Z</kbd> <b>${fuzeName(game.selFuze)}</b></p>`;
      r += `<p>${t('loadBags')}: <b>${g.bags}</b>${g.caseIn ? t('loadCase') : ''}${g.loaded ? t('loadLoaded', shellName(g.loaded.shell), g.loaded.bags) : ''}</p>`;
      r += `<p class="hintline">${t('loadHint')}</p>`;
    } else if (game.station === 'fire') {
      r += `<p>${t('fireLoaded')} ${ok(!!g.loaded)} ${t('fireLine')} ${ok(laid.line)} ${t('fireElev')} ${ok(laid.elev)}</p>`;
      r += `<p class="hintline">${t('fireHint')}</p>`;
    } else if (game.station === 'cmd') {
      r += `<p>${t('cmdWind', Math.hypot(game.wind.x, game.wind.z).toFixed(1), game.roundsFired)}</p>`;
      r += `<p class="hintline">${t('cmdHint')}</p>`;
    }
    this.set('readout', r);
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
      this.set('sight-ord', o ? `${t('ordered')} ${defl(o.defl)}` : '');
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
}

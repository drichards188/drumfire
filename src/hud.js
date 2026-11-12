import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// The overlay inside the left (3D) view: unit name and callsign, the time of day,
// the message log (telephone, wireless, observers), phase toasts, score, time compression, a
// bracket on a point of interest and the end card.
export class HUD {
  constructor() {
    this.toastTimer = null;
    this.radioLines = [];
    this.killEls = [];
    this.view = $('view');
  }

  setLoading(p, msg) {
    $('load-bar-fill').style.width = `${Math.round(p * 100)}%`;
    $('status').textContent = msg;
  }

  ready() {
    document.body.classList.add('ready');
    $('status').textContent = '';
  }

  showTitle(show) {
    document.body.classList.toggle('title', show);
  }

  /** The tutorial list over the title screen. */
  showTutorialMenu(show) {
    document.body.classList.toggle('tut-menu', show);
  }

  /** A tutorial is running: the instruction card is up, the score is hidden. */
  setTutorial(on) {
    document.body.classList.toggle('tutorial', on);
  }

  /** The unit the camera is on; wip: a gun still being built (the badge says so). */
  setUnit(name, callsign = '', wip = '') {
    $('unit-name').textContent = name;
    if (wip) {
      const b = document.createElement('span');
      b.className = 'wip-badge';
      b.textContent = 'WIP';
      b.title = wip;
      $('unit-name').append(b);
    }
    $('unit-call').textContent = callsign;
    const el = $('unit');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  setScore(s) {
    $('score').textContent = Math.round(s).toLocaleString('en-US');
  }

  /** The time of day, from the game clock in hours (5.25 = 05:15). */
  setClock(hour) {
    const m = Math.floor(((hour % 24) + 24) % 24 * 60);
    const txt = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (txt !== this.clockTxt) {
      this.clockTxt = txt;
      $('clock-val').textContent = txt;
    }
  }

  /** A threat level's mission (the director's goal(): { name, title, items, hidden, fails, maxFails, accomplished,
   * finale, xzeit, barrage, auto, pressure }); null hides the panel. The finale's button calls `onFinale`. */
  setObjectives(g) {
    const el = $('objectives');
    // (under the unit's name, however many lines it takes; the radio under the panel)
    if (g && !el.hidden) this.placeObjectives(el);
    const key = g ? JSON.stringify(g) : '';
    if (key === this.obKey) return;
    this.obKey = key;
    el.hidden = !g;
    if (!g) { document.documentElement.style.removeProperty('--ob-h'); this.obH = null; return; }
    $('ob-name').textContent = g.name;
    $('ob-title').textContent = g.barrage ? 'X-Zeit: the Feuerwalze' : g.accomplished ? 'Mission accomplished' : `${g.title} (${g.en})`;
    el.classList.toggle('done', g.accomplished);
    const rows = g.items.map((o) => {
      const li = document.createElement('li');
      li.className = `${o.main ? 'main' : 'side'} ${o.state}${o.timed && o.state === 'open' ? ' timed' : ''}${o.bonus ? ' bonus' : ''}${(o.kind === 'duel' && o.state === 'open' && o.fix < 120) || (o.kind === 'railgun' && o.up && o.state === 'open') ? ' danger' : ''}`;
      li.title = `${o.main ? 'Main objective' : 'Secondary objective'}: ${o.title}. ${o.why}`;
      const glyph = document.createElement('i');
      glyph.textContent = o.main ? (o.state === 'done' ? '■' : o.state === 'failed' ? '✕' : '□') : o.bonus ? (o.state === 'done' ? '▲' : o.state === 'failed' ? '✕' : '△') : (o.state === 'done' ? '◆' : o.state === 'failed' ? '✕' : '◇');
      const name = document.createElement('span');
      name.textContent = o.short;
      const note = document.createElement('em');
      const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      note.textContent = o.state === 'done' ? '✓' : o.state === 'failed' ? 'failed' : o.kind === 'xzeit' ? (g.accomplished ? 'call it' : 'finale')
        : o.kind === 'duel' ? `±${o.fix} m · ${mmss(o.left)}` : o.kind === 'railgun' && o.fix != null ? `${o.up ? 'FIRING' : 'away'} · ±${o.fix} m`
          : o.kind === 'balloon' && o.haul ? (o.haul.left > 0 ? `hauled down ${mmss(o.haul.left)}` : o.haul.k > 0.05 ? 'going up' : 'up') : o.kind === 'prep' ? `${o.pct}/25% · ${mmss(o.left)}` : o.kind === 'column' ? `${o.pct}/30% · ${mmss(o.left)}`
          : o.n > 1 ? `${o.done}/${o.n}` : o.kind === 'tanks' ? 'before attack' : '';
      li.append(glyph, name, note);
      return li;
    });
    if (g.hidden) {
      const li = document.createElement('li');
      li.className = 'more';
      li.textContent = `+${g.hidden} more to be reported`;
      rows.push(li);
    }
    $('ob-list').replaceChildren(...rows);
    const foot = $('ob-foot');
    foot.textContent = g.accomplished && !g.finale
      ? `Their fire ×${(g.pressure / 100).toFixed(1)}${g.auto != null ? ` · every battery on auto: ends in ${Math.floor(g.auto / 60)}:${String(g.auto % 60).padStart(2, '0')}` : ''}`
      : `Failures ${g.fails} of ${g.maxFails} allowed`;
    foot.classList.toggle('warn', g.accomplished ? g.pressure > 150 : g.fails >= g.maxFails);
    const btn = $('ob-finale');
    btn.hidden = !g.accomplished || g.finale;
    if (!btn.hidden) {
      btn.replaceChildren(g.xzeit ? 'Call X-Zeit' : 'End the battle', Object.assign(document.createElement('kbd'), { textContent: 'K' }));
      btn.onclick = () => this.onFinale?.();
    }
    this.placeObjectives(el);
  }
  placeObjectives(el) {
    const u = $('unit'), top = Math.max(70, u.offsetTop + u.offsetHeight + 10);
    if (this.obTop !== top) { this.obTop = top; el.style.top = `${top}px`; }
    // (the radio below it: its own top is 92 px)
    const h = Math.max(0, top + el.offsetHeight + 8 - 92);
    if (this.obH !== h) { this.obH = h; document.documentElement.style.setProperty('--ob-h', `${h}px`); }
  }

  /** Time compression indicator (1 = real time). */
  setTimeScale(k) {
    $('ts-val').textContent = `x${k < 1 ? k.toFixed(2).replace(/0$/, '') : k}`;
    $('ts-arrows').textContent = k < 1 ? '❚❚' : k === 1 ? '▶' : k <= 2 ? '▶▶' : '▶▶▶';
    $('timescale').classList.toggle('fast', k > 1);
    $('timescale').classList.toggle('slow', k < 1);
  }

  /** Phase title card. */
  toast(msg, sub = '', ms = 3600) {
    const el = $('toast');
    $('toast-main').textContent = msg;
    $('toast-sub').textContent = sub;
    el.style.animationDuration = `${ms}ms`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  hint(msg, ms = 4000) {
    const el = $('hint');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  /** A line in the message log. kind: info | warn | alert | kill | phone | wireless */
  radio(text, kind = 'info') {
    const log = $('radio');
    const el = document.createElement('div');
    el.className = `line ${kind}`;
    el.textContent = text;
    log.appendChild(el);
    this.radioLines.push({ el });
    while (this.radioLines.length > 5) this.radioLines.shift().el.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.remove();
      this.radioLines = this.radioLines.filter((l) => l.el !== el);
    }, 14000);
  }

  /** A kill toast: "text  +pts". Stacks briefly at the right. */
  kill(text, pts, assist = false) {
    const box = $('kills');
    const el = document.createElement('div');
    el.className = `kill${assist ? ' assist' : ''}`;
    el.innerHTML = '<span class="k-main"></span><b class="k-pts"></b>';
    el.querySelector('.k-main').textContent = text;
    el.querySelector('.k-pts').textContent = `+${pts}`;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 4200);
  }

  /** A bracket round a world point (the selected target or fall of shot); null hides it. */
  bracket(camera, point, label = '') {
    const el = $('bracket');
    if (!point) {
      el.style.display = 'none';
      return;
    }
    _v.copy(point).project(camera);
    const w = this.view.clientWidth, h = this.view.clientHeight;
    let x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    const behind = _v.z > 1 || _v.z < -1;
    const off = behind || x < 0 || x > w || y < 0 || y > h;
    const d = camera.position.distanceTo(point);
    let size = THREE.MathUtils.clamp((60 * 400) / Math.max(d, 1), 22, 70);
    el.classList.toggle('off', off);
    if (off) {
      // pin a chevron to the edge in the direction of the track (flipped when it is behind the camera)
      let dx = x - w / 2, dy = y - h / 2;
      if (behind) (dx = -dx), (dy = -dy);
      const m = 34, hw = w / 2 - m, hh = h / 2 - m;
      const k = Math.min(hw / Math.max(Math.abs(dx), 1e-3), hh / Math.max(Math.abs(dy), 1e-3));
      x = w / 2 + dx * k;
      y = h / 2 + dy * k;
      el.style.setProperty('--a', `${(Math.atan2(dx, -dy) * 180) / Math.PI}deg`);
      size = 30;
    }
    el.style.display = 'block';
    el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
    el.style.width = el.style.height = `${size}px`;
    el.firstChild.textContent = label;
  }

  /** End screen. report: { title, sub, score, stats: [[label, value, small?]...], victory } */
  showEnd(r, { onRestart } = {}) {
    $('end-title').textContent = r.title || 'Objectives taken';
    $('end-sub').textContent = r.sub || '';
    const rows = r.stats || [['Score', (r.score ?? 0).toLocaleString('en-US')]];
    $('end-stats').innerHTML = rows.map(([k, v, s]) => `<div><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`).join('');
    $('end').classList.toggle('victory', !!r.victory);
    $('end-restart').onclick = onRestart || null;
    document.body.classList.add('ended');
  }

  hideEnd() {
    document.body.classList.remove('ended');
  }

  debug(text) {
    $('debug').textContent = text;
  }
}

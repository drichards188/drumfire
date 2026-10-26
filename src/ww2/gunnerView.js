import * as THREE from 'three';
import { GUNS } from '../sim/tables.js';
import { POSTS, STEP_POST, STEP_EN, STRICH, MANNABLE, DRIVEN, fmtSeite } from './gunner.js';
import './gunner.css';

// The WW2 gunner's page side (src/ww2/gunner.js is the drill): the first-person camera at the eyes of the man whose
// place the player has taken (the render layer's crew figure, his head hidden), the mouse look (drag on the view, the
// wheel zooms), the held keys, the gun card over the 3D view and the "Man the gun" button. main.js makes one, calls
// update() every frame and place() instead of the chase camera while the player is at a gun and not riding a shell.
//
// Keys while at the gun (key()): 1 to 4 the posts, W/S elevation and A/D traverse (Shift fine; on the Gustav and the
// Karl a tap starts the laying drive and Shift held is the hand wheel), E the work at the post (held), C crew help, N
// the next gun of the battery; P (main) leaves. The Karl's T, L and Y stay the console's (turn, hull, carrier). The console keeps its other keys (missions,
// corrections, FIRE for the battery, R, Z, X); the ones the gun uses are kept from it (claims()).

// the man at each post, by the crew roles of the rigs (models/v/de/*.js anchors.crew)
export const POST_ROLE = {
  lefh18: { cmd: 'officer', lay: 'layer', load: 'loader', fire: 'lanyard' },
  sfh18: { cmd: 'officer', lay: 'layer', load: 'loader', fire: 'lanyard' },
  k18: { cmd: 'officer', lay: 'layer', load: 'loader1', fire: 'lanyard' },
  mrs18: { cmd: 'officer', lay: 'layer', load: 'loader1', fire: 'lanyard' },
  gustav: { cmd: 'chief', lay: 'layer', load: 'loader1', fire: 'lanyard' },
  karl: { cmd: 'sergeant', lay: 'layer', load: 'loader1', fire: 'lanyard' },
};
// each post's view: what the eye turns to by default (the muzzle, the breech, or 'gun': the middle of the barrel), and
// how far the camera sits behind (back) and above (up) the man's eyes so his hands and the work are in the
// lower half of the picture (the commander's a little higher: he watches the whole gun over the men's heads)
const VIEW = {
  cmd: { poi: 'gun', back: 0.7, up: 0.35, pitch: -0.05 },
  lay: { poi: 'muzzle', back: 0.4, up: 0.18, pitch: -0.16 },
  load: { poi: 'breech', back: 0.75, up: 0.5, pitch: 0 }, // over the shoulder: the tray and the men round it
  fire: { poi: 'breech', back: 0.15, up: 0.05, pitch: 0 },
};
// the big guns' commanders stand further back and higher: the Karl's on the ground below a hull taller than him, the
// Gustav's on the gallery under the barrel
const VIEW_KIND = {
  karl: { cmd: { poi: 'gun', back: 3.4, up: 1.6, pitch: -0.12 } },
  gustav: { cmd: { poi: 'gun', back: 3.0, up: 1.2, pitch: -0.08 } },
};
const FOV = 62, FOV_MIN = 12, FOV_MAX = 75;
// (Q goes with E: the console's charge keys stay off together; R, Z, X and the rest stay the console's)
const GUN_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyC', 'KeyN', 'ShiftLeft', 'ShiftRight']);
const STEP_SHORT = { depress: 'DOWN', open: 'OPEN', shell: 'SHELL', ram: 'RAM', cartridge: 'CART.', close: 'CLOSE', prime: 'PRIME', lay: 'LAY' };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const st2 = (r) => Math.round(r / STRICH);
const _eye = new THREE.Vector3(), _poi = new THREE.Vector3(), _d = new THREE.Vector3(), _goal = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion();

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const set = (e, t) => { if (e.textContent !== t) e.textContent = t; };
const cls = (e, c, on) => { if (e.classList.contains(c) !== !!on) e.classList.toggle(c, !!on); };

export class GunnerView {
  // root: the 3D view's element (#view); canvas: its canvas; render: the render layer; send(name, args) a gunner command
  // for the manned unit; onButton(): the "Man the gun" button
  constructor({ camera, canvas, root, render, send, onButton }) {
    this.camera = camera;
    this.render = render;
    this.send = send;
    this.active = false;
    this.look = { yaw: 0, pitch: 0 };
    this.fov = FOV;
    this.held = new Set();
    this.trans = { t: 1, from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };
    this.pos = new THREE.Vector3();
    this.post = null;
    this.crew = null;
    this.flashT = 0;
    addEventListener('keydown', (e) => { if (!e.target.closest?.('input, textarea, select')) this.held.add(e.code); });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
    // the mouse look: drag on the view (no pointer lock: the console beside it stays in reach); the wheel zooms
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active || this.riding || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || !this.active) return;
      const k = 0.0042 * (this.camera.fov / FOV);
      this.look.yaw = Math.max(-2.8, Math.min(2.8, this.look.yaw - (e.clientX - drag.x) * k));
      this.look.pitch = Math.max(-1.25, Math.min(1.25, this.look.pitch - (e.clientY - drag.y) * k));
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const up = (e) => { if (drag) canvas.releasePointerCapture?.(drag.id); drag = null; void e; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      if (!this.active || this.riding) return;
      e.preventDefault();
      this.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, this.fov * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    this.build(root, onButton);
  }

  // ------------------------------------------------------------------ the card and the button
  build(root, onButton) {
    const b = this.button = el('button', null, 'Man the gun (P)');
    b.id = 'man-gun';
    b.type = 'button';
    b.title = 'Take a place in the detachment of the selected battery\'s gun: first person, the drill at the posts (P)';
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => onButton?.());
    root.append(b);
    const c = this.card = el('div');
    c.id = 'gunner';
    c.addEventListener('pointerdown', (e) => e.stopPropagation()); // no look drag from the card
    const head = el('div', 'g-head');
    this.title = el('b', null, '');
    this.assistB = el('button', 'g-assist', '');
    this.assistB.type = 'button';
    this.assistB.title = 'Crew help (C): the men at the other posts do their work; off, nothing at another post moves until you go there';
    this.assistB.addEventListener('click', () => this.send('assist', {}));
    head.append(this.title, this.assistB);
    const posts = el('div', 'g-posts');
    this.postB = POSTS.map((q) => {
      const x = el('button', 'g-post');
      x.type = 'button';
      const sub = el('i');
      sub.append(el('kbd', null, String(q.key)), q.en);
      x.append(el('b', null, q.name), sub);
      x.title = `${q.name} (${q.en}): key ${q.key}`;
      x.addEventListener('click', () => this.send('post', { post: q.id }));
      posts.append(x);
      return x;
    });
    const order = el('div', 'g-order');
    this.orderHead = el('b', null, '');
    this.orderLine = el('span', null, '');
    this.fireLine = el('i', null, '');
    order.append(this.orderHead, this.orderLine, this.fireLine);
    const gun = el('div', 'g-gun');
    this.seite = el('span', null, '');
    this.hoehe = el('span', null, '');
    this.laid = el('em', null, 'LAID');
    gun.append(el('i', null, 'GUN'), this.seite, this.hoehe, this.laid);
    this.drill = el('div', 'g-drill');
    this.cells = [];
    this.prompt = el('div', 'g-prompt');
    this.pKey = el('kbd', null, '');
    this.pText = el('span', null, '');
    this.pBar = el('i', 'g-bar');
    this.pFill = el('b');
    this.pBar.append(this.pFill);
    this.prompt.append(this.pKey, this.pText, this.pBar);
    this.why = el('div', 'g-why', '');
    this.keys = el('div', 'g-keys');
    this.keysKind = null;
    c.append(head, posts, order, gun, this.drill, this.prompt, this.why, this.keys);
    root.append(c);
  }

  // the button: shown on a WW2 battle page for a gun that can be served in person (or while at one)
  setButton(show, active) {
    cls(this.button, 'show', show);
    set(this.button, active ? 'Leave the gun (P)' : 'Man the gun (P)');
    cls(this.button, 'on', active);
  }

  // a word under the prompt (a key that cannot act here, a pull refused)
  flash(text) {
    set(this.why, text);
    this.flashT = performance.now();
    cls(this.why, 'flash', false);
    void this.why.offsetWidth;
    cls(this.why, 'flash', true);
  }

  // ------------------------------------------------------------------ in and out
  enter(sim) {
    this.active = true;
    this.look.yaw = this.look.pitch = 0;
    this.fov = FOV;
    this.trans.t = 0;
    this.trans.from.copy(this.camera.position);
    this.trans.fromQ.copy(this.camera.quaternion);
    this.post = sim.gunner.st.post;
    this.pos.copy(this.camera.position);
    document.body.classList.add('gunner');
  }

  leave() {
    this.active = false;
    this.crew?.setPlayer(null);
    this.crew = null;
    document.body.classList.remove('gunner');
  }

  // the gun's keys while at the gun: true when the key was the gun's
  key(e, sim) {
    const st = sim.gunner?.st;
    if (!this.active || !st) return false;
    const c = e.code;
    if (/^Digit[1-4]$/.test(c)) { this.send('post', { post: POSTS[Number(c.slice(5)) - 1].id }); return true; }
    if (/^Digit[0-9]$/.test(c)) { this.flash('1 to 4 are the posts at the gun: click a tab for another battery\'s console.'); return true; }
    if (c === 'KeyC') { this.send('assist', {}); return true; }
    if (c === 'KeyN') {
      const u = sim.unitById(st.unitId), live = u.pieces.filter((p) => p.state !== 'dead');
      if (live.length < 2) { this.flash('The battery has no other gun standing.'); return true; }
      const next = live[(live.findIndex((p) => p.i === st.pi) + 1) % live.length];
      this.send('man', { piece: next.i, post: st.post });
      return true;
    }
    if (c === 'KeyW' || c === 'KeyS' || c === 'KeyA' || c === 'KeyD') {
      const vert = c === 'KeyW' || c === 'KeyS', u = sim.unitById(st.unitId);
      if (st.post !== 'lay') this.flash(`${vert ? 'W and S elevate' : 'A and D traverse'} the gun: that is the Richtkanonier's work (2).`);
      else if (u?.stowed) this.flash('The hull is not down: the gun is laid only from a hull on the ground (L).');
      else if (vert && sim.gunner.piece()?.breech > 0.01) this.flash('The breech is open: the barrel cannot be elevated until it is closed.');
      // a driven gun: the tap starts its drive, or stops it if it runs the other way (Shift held is the hand wheel)
      else if (DRIVEN.has(st.kind) && !e.shiftKey) this.send('drive', { axis: vert ? 'el' : 'az', dir: c === 'KeyW' || c === 'KeyA' ? 1 : -1 });
      return true;
    }
    if (c === 'KeyE') {
      const n = st.next;
      if (n && n.post !== st.post && !n.wait) this.flash(sim.gunner.why(sim.unitById(st.unitId), sim.gunner.piece()) || '');
      return true;
    }
    return GUN_KEYS.has(c);
  }

  // the keys the console must leave alone while the player is at a gun
  claims(e) {
    return this.active && (GUN_KEYS.has(e.code) || /^Digit[0-9]$/.test(e.code));
  }

  input() {
    const h = (k) => this.held.has(k);
    const ax = (a, b) => (h(a) ? 1 : 0) - (h(b) ? 1 : 0);
    return { az: ax('KeyA', 'KeyD'), el: ax('KeyW', 'KeyS'), fine: h('ShiftLeft') || h('ShiftRight'), work: h('KeyE') };
  }

  // ------------------------------------------------------------------ the camera
  // at the eyes of the man at the player's post, turned toward the work (the muzzle or the breech) plus the mouse look;
  // trauma (0..1, the chase camera's) shakes it as a blast does
  place(rawDt, sim, trauma = 0) {
    const st = sim.gunner?.st;
    if (!st) return;
    const v = this.render?.guns?.byKey?.get(`${st.unitId}:${st.pi}`);
    if (!v) return;
    const crew = v.crew, rig = v.rig;
    if (crew !== this.crew) { this.crew?.setPlayer(null); this.crew = crew; }
    crew?.setPlayer?.(POST_ROLE[st.kind]?.[st.post] ?? null);
    if (st.post !== this.post) {
      // a new post: glide there, the look back to the work
      this.post = st.post;
      this.trans.t = 0;
      this.trans.from.copy(this.camera.position);
      this.trans.fromQ.copy(this.camera.quaternion);
      this.look.yaw = this.look.pitch = 0;
    }
    const vw = VIEW_KIND[st.kind]?.[st.post] ?? VIEW[st.post] ?? VIEW.lay;
    rig.root.updateMatrixWorld(true);
    let face = crew?.eye?.(_eye);
    if (face == null) {
      (rig.anchors.eye ?? rig.root).getWorldPosition(_eye);
      _d.set(0, 0, -1).transformDirection(rig.root.matrixWorld);
      face = Math.atan2(-_d.x, -_d.z);
    }
    _goal.copy(_eye);
    _goal.x += Math.sin(face) * vw.back;
    _goal.z += Math.cos(face) * vw.back;
    _goal.y += vw.up;
    // the bob of the man's walk is smoothed out; a post change glides
    const k = 1 - Math.exp(-rawDt * 14);
    if (this.trans.t >= 1) this.pos.lerp(_goal, k); else this.pos.copy(_goal);
    if (vw.poi === 'gun') {
      // the middle of the barrel: the commander watches his gun and its men
      rig.anchors.muzzle.getWorldPosition(_poi);
      rig.anchors.breech.getWorldPosition(_d);
      _poi.add(_d).multiplyScalar(0.5);
    } else (rig.anchors[vw.poi] ?? rig.root).getWorldPosition(_poi);
    _d.subVectors(_poi, this.pos);
    const yaw = Math.atan2(-_d.x, -_d.z), pitch = Math.max(-1.1, Math.min(0.9, Math.atan2(_d.y, Math.hypot(_d.x, _d.z)) * 0.7 + vw.pitch));
    _e.set(Math.max(-1.45, Math.min(1.45, pitch + this.look.pitch)), wrapA(yaw + this.look.yaw), 0);
    _q.setFromEuler(_e);
    if (this.trans.t < 1) {
      this.trans.t = Math.min(1, this.trans.t + rawDt / 0.55);
      const s = this.trans.t * this.trans.t * (3 - 2 * this.trans.t);
      this.camera.position.lerpVectors(this.trans.from, this.pos, s);
      this.camera.quaternion.slerpQuaternions(this.trans.fromQ, _q, s);
    } else {
      this.camera.position.copy(this.pos);
      this.camera.quaternion.copy(_q);
    }
    this.shakeT = (this.shakeT ?? 0) + rawDt;
    const s = trauma * trauma;
    if (s > 1e-4) {
      const t = this.shakeT * 21, n = (a) => Math.sin(t * a) * 0.6 + Math.sin(t * a * 2.13 + 1.7) * 0.4;
      _e.set(n(1.1) * 0.05 * s, n(0.9) * 0.05 * s, n(1.3) * 0.07 * s);
      this.camera.quaternion.multiply(_q.setFromEuler(_e));
      this.camera.position.x += n(1.7) * 0.1 * s;
      this.camera.position.y += n(1.9) * 0.12 * s;
      this.camera.position.z += n(2.3) * 0.1 * s;
    }
  }

  // ------------------------------------------------------------------ the card, every frame
  update(sim) {
    const st = sim?.gunner?.st;
    cls(this.card, 'show', this.active && !!st);
    if (!this.active || !st) return;
    const u = sim.unitById(st.unitId), p = u?.pieces[st.pi];
    if (!u || !p) return;
    const g = GUNS[p.kind], n = st.next;
    if (this.keysKind !== p.kind) {
      this.keysKind = p.kind;
      const lay = DRIVEN.has(p.kind)
        ? '<kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd>tap: the laying drive (<kbd>Shift</kbd> held: hand wheel) '
        : '<kbd>W</kbd><kbd>S</kbd>elevation <kbd>A</kbd><kbd>D</kbd>traverse <kbd>Shift</kbd>fine ';
      this.keys.innerHTML = `${lay}<kbd>E</kbd>work (hold) <kbd>1</kbd>-<kbd>4</kbd>post <kbd>C</kbd>crew help `
        + `${u.pieces.length > 1 ? '<kbd>N</kbd>next gun ' : ''}${p.kind === 'karl' ? '<kbd>L</kbd>hull <kbd>T</kbd>turn <kbd>Y</kbd>carrier ' : ''}`
        + '<kbd>F</kbd>ride the shell <kbd>P</kbd>leave · drag to look, wheel to zoom';
    }
    set(this.title, `AM GESCHÜTZ · No. ${p.i + 1} gun · ${g.name} "${u.callsign}"`);
    set(this.assistB, st.assist ? 'CREW HELPS (C)' : 'ALONE (C)');
    cls(this.assistB, 'on', st.assist);
    POSTS.forEach((q, i) => {
      cls(this.postB[i], 'me', st.post === q.id);
      cls(this.postB[i], 'next', !!n && !n.wait && n.post === q.id && st.post !== q.id);
    });
    // the fire command for this gun
    const o = st.order;
    if (!o) {
      set(this.orderHead, 'NO FIRE COMMAND');
      set(this.orderLine, u.mode === 'manual' ? 'Lay the battery from the console (the board, or a mission).' : 'The battery commander has none for this gun yet.');
    } else {
      set(this.orderHead, `FEUERKOMMANDO ${o.n}${o.ok ? (o.acked ? ' · read back' : ' · READ BACK (1)') : ' · CANNOT BE LAID'}`);
      set(this.orderLine, o.ok ? `Seite ${fmtSeite(o.az)} · Erhöhung ${st2(o.el)} · ${g.charges[o.charge]?.name ?? '-'} · ${o.fuze === 'delay' ? 'AZ m.V.' : o.fuze === 'shrapnel' ? 'ZEITZ.' : 'AZ o.V.'}` : `${o.why || 'out of reach'}`);
    }
    cls(this.orderHead, 'ring', !!o && o.ok && !o.acked);
    set(this.fireLine, p.rounds > 0 ? `FEUER: ${p.rounds} round${p.rounds > 1 ? 's' : ''}` : u.mode === 'manual' ? `no order to fire: your pull fires this gun (${u.order.rounds} round${u.order.rounds > 1 ? 's' : ''}, R on the console)` : 'no order to fire');
    cls(this.fireLine, 'go', p.rounds > 0);
    // the gun as it stands, against the command read back
    const c = st.ack, heavyDown = g.load[0]?.step === 'depress' && p.state === 'loading' && ['depress', 'open', 'shell', 'ram', 'cartridge', 'close', 'prime'].includes(p.job?.step);
    const dA = c ? st2(c.az - p.az) : 0, dE = heavyDown ? st2(g.loadEl - p.el) : c ? st2(c.el - p.el) : 0;
    set(this.seite, `Seite ${fmtSeite(p.az)}${c && dA ? ` (${Math.abs(dA)} ${dA > 0 ? 'left' : 'right'})` : ''}`);
    set(this.hoehe, `Erhöhung ${st2(p.el)}${heavyDown ? ` (loading angle ${st2(g.loadEl)})` : c && dE ? ` (${Math.abs(dE)} ${dE > 0 ? 'up' : 'down'})` : ''}`);
    cls(this.laid, 'on', !!c && !dA && !dE && !heavyDown);
    // the drill: the steps of the cycle, the one being worked, whose it is
    if (this.cells.length !== g.load.length) {
      this.drill.replaceChildren();
      this.cells = g.load.map((s) => {
        const x = el('span', `g-step p-${STEP_POST[s.step]}`);
        x.append(el('b', null, STEP_SHORT[s.step] ?? s.step), el('i'));
        x.title = `${STEP_EN[s.step] ?? s.step} (${POSTS.find((q) => q.id === STEP_POST[s.step])?.name})`;
        this.drill.append(x);
        return x;
      });
      const r = el('span', 'g-step p-fire');
      r.append(el('b', null, 'FIRE'), el('i'));
      this.drill.append(r);
      this.cells.push(r);
    }
    const idx = p.state === 'loading' ? p.ji : p.state === 'ready' || p.state === 'laying' ? g.load.length : p.state === 'recoil' ? g.load.length + 1 : p.loaded ? g.load.length : -1;
    this.cells.forEach((x, i) => {
      cls(x, 'done', idx > i);
      cls(x, 'now', idx === i);
      const fill = x.lastChild;
      const f = idx === i && p.job && i < g.load.length ? Math.min(1, p.job.t / Math.max(0.01, p.job.dur)) : idx === i && st.hold?.what === 'pull' ? st.hold.t / st.hold.dur : 0;
      fill.style.width = `${Math.round(f * 100)}%`;
    });
    // the prompt: the next job, its key, the progress of what is being held
    const mine = n && n.post === st.post && !n.wait;
    set(this.pKey, mine && n.key ? n.key : n?.wait ? '…' : n ? String(POSTS.find((q) => q.id === n.post)?.key ?? '') : '');
    set(this.pText, n ? (mine ? (n.key === 'E' ? `hold: ${n.text}` : n.text) : n.wait ? n.text : `next: ${n.text} (${POSTS.find((q) => q.id === n.post)?.en})`) : '');
    cls(this.prompt, 'mine', !!mine);
    cls(this.prompt, 'wait', !!n?.wait);
    let f = 0;
    if (st.hold && st.hold.dur) f = st.hold.t / st.hold.dur;
    else if (mine && p.job) f = p.job.t / Math.max(0.01, p.job.dur);
    this.pFill.style.width = `${Math.round(Math.min(1, f) * 100)}%`;
    if (performance.now() - this.flashT > 2600) set(this.why, st.why || '');
  }
}

export { MANNABLE };

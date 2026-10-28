import * as THREE from 'three';
import { GUNS } from '../sim/tables.js';
import { POSTS, STRICH, MANNABLE, DRIVEN, fmtSeite, stepPost, stepEn } from './gunner.js';
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
  // the 1918 guns of the German career's ridge (render/ww1/<kind>.js ROLES)
  k17: { cmd: 'officer', lay: 'layer', load: 'loader', fire: 'lanyard' },
  sfh13: { cmd: 'officer', lay: 'layer', load: 'loader', fire: 'lanyard' },
  m16: { cmd: 'officer', lay: 'layer', load: 'loader1', fire: 'lanyard' },
  // the bed-mounted giants (render/ww1/max38.js and gamma.js ROLES; Bertha's render/crews_heavy.js ROLES_HEAVY)
  max38: { cmd: 'chief', lay: 'layer', load: 'rammer1', fire: 'lanyard' },
  gamma: { cmd: 'officer', lay: 'layer', load: 'loader2', fire: 'lanyard' },
  bertha: { cmd: 'sergeant', lay: 'layer', load: 'loader1', fire: 'lanyard' },
  // the Nebelwerfer (render/crews_de.js): no commander's figure (his eye is the launcher's own, the rig's), the firer
  // at the firing box in the slit trench (rig.anchors.cover) once the crew has taken cover
  nbw41: { cmd: null, lay: 'layer', load: 'loader', fire: 'firer' },
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
  // the bed-mounted giants' commanders off the side of the bed, over the men at the breech and the crane
  max38: { cmd: { poi: 'gun', back: 3.2, up: 1.4, pitch: -0.1 } },
  gamma: { cmd: { poi: 'gun', back: 3.6, up: 1.8, pitch: -0.12 } },
  bertha: { cmd: { poi: 'gun', back: 3.0, up: 1.4, pitch: -0.1 } },
  // the Nebelwerfer: the commander a few steps behind the launcher; the firer looks at it from cover
  nbw41: { cmd: { poi: 'gun', back: 4.5, up: 1.2, pitch: -0.08 }, fire: { poi: 'gun', back: 0.4, up: 0.25, pitch: -0.04 } },
};
const FOV = 62, FOV_MIN = 12, FOV_MAX = 75;
// (Q goes with E: the console's charge keys stay off together; R, Z, X and the rest stay the console's)
const GUN_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyC', 'KeyN', 'ShiftLeft', 'ShiftRight']);
const STEP_SHORT = { depress: 'DOWN', open: 'OPEN', shell: 'SHELL', ram: 'RAM', cartridge: 'CART.', close: 'CLOSE', prime: 'PRIME', lay: 'LAY', cover: 'COVER' };
const POST_SHORT = { cmd: 'Commander', lay: 'Layer', load: 'Loader', fire: 'Firer' };
const FUZE = { delay: 'AZ m.V.', shrapnel: 'ZEITZ.', instant: 'AZ o.V.' };
const K = (...k) => k.map((x) => `<kbd>${x}</kbd>`).join('');
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const st2 = (r) => Math.round(r / STRICH);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
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
    // Top to bottom: which gun, the four posts (the player's lit), the one thing to do now (its key and how far the hold
    // has got), the fire command against the gun's lay, the drill, and the keys of the post the player is at
    const c = this.card = el('div');
    c.id = 'gunner';
    c.addEventListener('pointerdown', (e) => e.stopPropagation()); // no look drag from the card
    const head = el('div', 'g-head');
    const name = el('div', 'g-title');
    this.eyebrow = el('i', null, '');
    this.title = el('b', null, '');
    name.append(this.eyebrow, this.title);
    this.assistB = el('button', 'g-assist');
    this.assistB.type = 'button';
    this.assistB.title = 'Crew help (C): on, the men at the other posts do their work; off, nothing at another post moves until you go there';
    this.assistOn = el('b', null, '');
    this.assistB.append(el('span', null, 'Crew help'), this.assistOn, el('kbd', null, 'C'));
    this.assistB.addEventListener('click', () => this.send('assist', {}));
    head.append(name, this.assistB);
    // the posts: each one's colour is its steps' colour in the drill below
    const posts = el('div', 'g-posts');
    this.postB = POSTS.map((q) => {
      const x = el('button', `g-post p-${q.id}`);
      x.type = 'button';
      const top = el('span');
      top.append(el('kbd', null, String(q.key)), el('b', null, POST_SHORT[q.id]));
      x.append(top, el('i', null, q.name));
      x.title = `${q.name}, the ${q.en} (key ${q.key})`;
      x.addEventListener('click', () => this.send('post', { post: q.id }));
      posts.append(x);
      return x;
    });
    this.prompt = el('div', 'g-prompt');
    this.pKey = el('kbd', null, '');
    const pt = el('div', 'g-ptext');
    this.pText = el('b', null, '');
    this.pSub = el('i', null, '');
    pt.append(this.pText, this.pSub);
    this.pBar = el('i', 'g-bar');
    this.pFill = el('b');
    this.pBar.append(this.pFill);
    this.prompt.append(this.pKey, pt, this.pBar);
    // the command and the gun side by side: what was ordered, where the gun is, what is left to lay
    const cmd = el('div', 'g-cmd');
    const ch = el('div', 'g-cmd-head');
    this.orderHead = el('b', null, '');
    this.ackChip = el('em', 'g-chip', '');
    this.fireChip = el('em', 'g-chip', '');
    ch.append(this.orderHead, this.ackChip, this.fireChip);
    this.orderNote = el('div', 'g-note', '');
    const lay = el('div', 'g-lay');
    lay.append(el('i'), ...['ORDER', 'GUN', 'TO LAY'].map((t) => el('i', 'g-th', t)));
    this.rows = ['Seite', 'Erhöhung'].map((t) => {
      const r = { row: el('div', 'g-row'), order: el('span', 'g-ord'), gun: el('span'), go: el('span', 'g-go'), goText: el('span'), goKey: el('kbd') };
      r.go.append(r.goText, r.goKey);
      r.row.append(el('span', 'g-rl', t), r.order, r.gun, r.go);
      lay.append(r.row);
      return r;
    });
    this.loadLine = el('div', 'g-cmd-foot', '');
    cmd.append(ch, this.orderNote, lay, this.loadLine);
    this.drill = el('div', 'g-drill');
    this.cells = [];
    this.keys = el('div', 'g-keys');
    this.keysPost = el('div', 'g-keys-post');
    this.keysAll = el('div', 'g-keys-all');
    this.keys.append(this.keysPost, this.keysAll);
    this.keysFor = null;
    c.append(head, posts, this.prompt, cmd, this.drill, this.keys);
    root.append(c);
    // the card's height for the subtitles that sit above it (gunner.css), whenever it changes
    new ResizeObserver(() => { if (c.offsetHeight) document.body.style.setProperty('--gunner-h', `${c.offsetHeight}px`); }).observe(c);
  }

  // the button: shown on a WW2 battle page for a gun that can be served in person (or while at one)
  setButton(show, active) {
    cls(this.button, 'show', show);
    set(this.button, active ? 'Leave the gun (P)' : 'Man the gun (P)');
    cls(this.button, 'on', active);
  }

  // a word in the prompt's second line for a moment (a key that cannot act here, a pull refused)
  flash(text) {
    this.flashText = text;
    this.flashT = performance.now();
    set(this.pSub, text);
    cls(this.pSub, 'flash', false);
    void this.pSub.offsetWidth;
    cls(this.pSub, 'flash', true);
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
    const g = GUNS[p.kind], n = st.next, driven = DRIVEN.has(p.kind), post = (id) => POSTS.find((q) => q.id === id);
    // the keys: the post's own first, then the ones that work anywhere at the gun
    const kf = `${p.kind}:${st.post}:${u.pieces.length > 1}`;
    if (this.keysFor !== kf) {
      this.keysFor = kf;
      // each key with its word kept on one line, so a line wraps between them
      const G = (...g) => g.map((x) => `<span>${x}</span>`).join('');
      this.keysPost.innerHTML = {
        cmd: G(`${K('E')}hold: read back the fire command`),
        lay: driven ? G(`${K('W', 'S', 'A', 'D')}tap: start or stop the drive`, `${K('Shift')}held: hand wheel`)
          : G(`${K('W', 'S')}elevation`, `${K('A', 'D')}traverse`, `${K('Shift')}fine`),
        load: G(GUNS[p.kind]?.salvo ? `${K('E')}hold: load the rockets, connect the igniters` : `${K('E')}hold: open, load, ram and close`),
        fire: G(GUNS[p.kind]?.salvo ? `${K('E')}hold: take cover, fire the ripple` : `${K('E')}hold: fit the primer, pull the lanyard`),
      }[st.post] ?? '';
      this.keysAll.innerHTML = G(`${K('1')}-${K('4')}post`, `${K('C')}crew help`, ...(u.pieces.length > 1 ? [`${K('N')}next gun`] : []),
        ...(p.kind === 'karl' ? [`${K('L')}hull`, `${K('T')}turn`, `${K('Y')}carrier`] : []), ...(u.special?.bed ? [`${K('T')}relay the bed`] : []),
        `${K('F')}ride the shell`, `${K('P')}leave`, 'drag: look', 'wheel: zoom');
    }
    set(this.eyebrow, `AM GESCHÜTZ · No. ${p.i + 1} gun`);
    set(this.title, `${g.name} "${u.callsign}"`);
    set(this.assistOn, st.assist ? 'ON' : 'OFF');
    cls(this.assistB, 'on', st.assist);
    // the next job: the player's own, at another post (the crew's when it helps; the manual pull is always the
    // player's), or dead time
    const mine = !!n && !n.wait && n.post === st.post;
    const away = !!n && !n.wait && n.post !== st.post;
    const crewDoes = away && st.assist && p.crew >= Math.ceil(p.crewMax * 0.3) && !(n.post === 'fire' && !(p.rounds > 0));
    POSTS.forEach((q, i) => {
      cls(this.postB[i], 'me', st.post === q.id);
      cls(this.postB[i], 'next', away && n.post === q.id);
      cls(this.postB[i], 'g-want', away && !crewDoes && n.post === q.id);
    });
    const np = n && post(n.post);
    set(this.pKey, mine ? n.key ?? '' : away ? String(np.key) : n ? '…' : '');
    set(this.pText, cap(n?.text ?? ''));
    let sub = '';
    if (mine && n.key) sub = n.key === 'E' ? 'Hold E' : driven ? `Tap ${n.key}: the drive runs on to the mark` : `Hold ${n.key} (Shift: fine)`;
    else if (away) sub = crewDoes ? `The ${np.en}'s job: the crew is on it, or take post ${np.key}` : `The ${np.en}'s job: press ${np.key} to go to that post`;
    if (performance.now() - this.flashT > 2600) { set(this.pSub, sub); cls(this.pSub, 'flash', false); }
    cls(this.prompt, 'mine', mine);
    cls(this.prompt, 'go', away && !crewDoes);
    cls(this.prompt, 'g-by-crew', crewDoes);
    cls(this.prompt, 'wait', !!n?.wait);
    let f = 0;
    if (st.hold && st.hold.dur) f = st.hold.t / st.hold.dur;
    else if (mine && p.job) f = p.job.t / Math.max(0.01, p.job.dur);
    this.pFill.style.width = `${Math.round(Math.min(1, f) * 100)}%`;
    // the fire command for this gun: read back or not, and whether the battery has said Feuer
    const o = st.order;
    set(this.orderHead, o ? `FEUERKOMMANDO ${o.n}` : 'NO FIRE COMMAND');
    set(this.ackChip, !o ? '' : !o.ok ? 'CANNOT BE LAID' : o.acked ? 'read back' : 'NOT READ BACK');
    cls(this.ackChip, 'ok', !!o?.ok && o.acked);
    cls(this.ackChip, 'ring', !!o?.ok && !o.acked);
    cls(this.ackChip, 'bad', !!o && !o.ok);
    const rd = (k) => `${k} round${k > 1 ? 's' : ''}`;
    set(this.fireChip, p.rounds > 0 ? `FEUER: ${rd(p.rounds)}` : u.mode === 'manual' ? `on your pull: ${rd(u.order.rounds)}` : 'no Feuer yet');
    this.fireChip.title = p.rounds > 0 ? 'The battery has ordered Feuer for this gun' : u.mode === 'manual'
      ? 'The battery is on manual: the firer\'s pull is the order to fire for this gun (rounds per gun: R on the console)'
      : 'The battery commander has not given Feuer for this gun yet';
    cls(this.fireChip, 'fire', p.rounds > 0);
    set(this.orderNote, !o ? (u.mode === 'manual' ? 'Lay the battery from the console: click the board, or take a mission.' : 'The battery commander has none for this gun yet.')
      : !o.ok ? cap(o.why || 'out of reach') : '');
    set(this.loadLine, o?.ok ? `${g.charges[o.charge]?.name ?? '-'} · ${FUZE[o.fuze] ?? FUZE.instant}` : '');
    // the gun as it stands against the marks read back (a command not read back has none yet); the heavies' barrel
    // runs down to its loading angle first
    const c = o?.acked ? st.ack : null, heavyDown = g.load[0]?.step === 'depress' && p.state === 'loading' && ['depress', 'open', 'shell', 'ram', 'cartridge', 'close', 'prime'].includes(p.job?.step);
    const dA = c ? st2(c.az - p.az) : 0, dE = heavyDown ? st2(g.loadEl - p.el) : c ? st2(c.el - p.el) : 0;
    const [rs, re] = this.rows;
    set(rs.order, o?.ok ? fmtSeite(o.az) : '-');
    set(rs.gun, fmtSeite(p.az));
    set(re.order, o?.ok ? String(st2(o.el)) : '-');
    set(re.gun, String(st2(p.el)));
    // what is left to lay, and the key that lays it (none while a drive runs the right way)
    const togo = (r, on, d, words, keys, ax, zero = 'on') => {
      const run = driven && st.drive[ax] === Math.sign(d);
      set(r.goText, !on ? '-' : d === 0 ? zero : `${Math.abs(d)} ${d > 0 ? words[0] : words[1]}${run ? ', driving' : ''}`);
      set(r.goKey, on && d !== 0 && !run ? (d > 0 ? keys[0] : keys[1]) : '');
      cls(r.row, 'ok', on && d === 0);
      cls(r.row, 'g-none', !on);
    };
    togo(rs, !!c, dA, ['left', 'right'], ['A', 'D'], 'az');
    togo(re, !!c || heavyDown, dE, heavyDown ? ['to load', 'to load'] : ['up', 'down'], ['W', 'S'], 'el', heavyDown ? 'load angle' : 'on');
    // the drill: the steps of the cycle, the one being worked, whose it is
    // (built again for another kind: the posts of a step are the kind's, the Nebelwerfer's igniters the loader's)
    if (this.cellsFor !== p.kind) {
      this.cellsFor = p.kind;
      this.drill.replaceChildren();
      this.cells = g.load.map((s) => {
        const post = stepPost(p.kind, s.step);
        const x = el('span', `g-step p-${post}`);
        x.append(el('b', null, STEP_SHORT[s.step] ?? s.step), el('i'));
        x.title = `${stepEn(p.kind, s.step)} (${POSTS.find((q) => q.id === post)?.name})`;
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
  }
}

export { MANNABLE };

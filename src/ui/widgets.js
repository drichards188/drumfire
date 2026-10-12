// Command-post furniture as DOM widgets: brass push buttons, segmented selectors, jewel lamps, ruled bars.
// Every setter caches its last value so calling it each frame costs nothing when nothing changed.

export const hw = { audio: null, scale: 1 };

// The audio engine is optional; a missing or throwing hook must never break the console.
export function snd(name) {
  try { if (hw.audio && hw.audio.ui) hw.audio.ui(name); } catch (e) { /* optional */ }
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function setText(n, v) {
  v = String(v);
  if (n._v !== v) { n._v = v; n.textContent = v; }
}

export function setCls(n, c, on) {
  on = !!on;
  const k = '_c' + c;
  if (n[k] !== on) { n[k] = on; n.classList.toggle(c, on); }
}

export function setStyle(n, prop, v) {
  const k = '_s' + prop;
  if (n[k] !== v) { n[k] = v; n.style[prop] = v; }
}

// Main caption with a small second line (the plain-language meaning, or the key).
export function label(main, sub, cls = '') {
  const d = el('div', 'lbl ' + cls);
  d.append(el('b', null, main));
  if (sub) d.append(el('i', null, sub));
  return d;
}

// A card on the desk: a title strip and a body.
export function card(title, sub, cls = '') {
  const p = el('section', 'card ' + cls);
  const t = el('div', 'ctitle');
  t.append(el('b', null, title));
  if (sub) t.append(el('i', null, sub));
  const body = el('div', 'cbody');
  p.append(t, body);
  return { el: p, body, head: t };
}

// Jewel lamp in a brass bezel with a caption underneath. state 0 off, 1 lit, 2 blinking.
export class Lamp {
  constructor(text, color = 'green', cls = '') {
    this.el = el('div', `lamp ${color} ${cls}`);
    this.jewel = el('i', 'jewel');
    this.cap = el('b', null, text);
    this.el.append(this.jewel, this.cap);
    this.s = 0;
  }
  set(s) {
    s = s === true ? 1 : s || 0;
    if (s === this.s) return;
    this.s = s;
    this.el.classList.toggle('on', s > 0);
    this.el.classList.toggle('blink', s === 2);
  }
}

// Brass push button. `hold` buttons report down and up; others act on press. `lit` glows, `enable(false)` dulls.
export class Btn {
  constructor({ main, sub, color = 'brass', hold = false, onClick, onDown, onUp, cls = '', tip = '' }) {
    this.el = el('button', `btn ${color} ${cls}`);
    this.el.type = 'button';
    this.el.tabIndex = -1;
    if (tip) this.el.title = tip;
    this.face = el('span', 'face');
    this.face.append(label(main, sub));
    this.el.append(this.face);
    this.held = false;
    this.disabled = false;
    this.lit = false;
    const down = (e) => {
      if (this.disabled || this.held) return;
      e.preventDefault();
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      this.held = true;
      this.el.classList.add('down');
      snd('click');
      if (onDown) onDown();
      if (!hold && onClick) onClick();
    };
    const up = () => {
      if (!this.held) return;
      this.held = false;
      this.el.classList.remove('down');
      if (onUp) onUp();
    };
    this.el.addEventListener('pointerdown', down);
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('lostpointercapture', up);
    this.el.addEventListener('keydown', (e) => e.preventDefault());
  }
  set(lit) { lit = !!lit; if (lit !== this.lit) { this.lit = lit; this.el.classList.toggle('lit', lit); } }
  press(on) { this.el.classList.toggle('down', on); }
  enable(on) { if (this.disabled === !on) return; this.disabled = !on; this.el.classList.toggle('dis', !on); }
  text(main, sub) { setText(this.face.firstChild.firstChild, main); if (sub != null && this.face.firstChild.children[1]) setText(this.face.firstChild.children[1], sub); }
}

// Row of buttons of which one is down (a rotary selector).
export class Seg {
  constructor({ items, onChange, color = 'brass', cls = '' }) {
    this.el = el('div', `seg ${cls}`);
    this.btns = new Map();
    this.cur = null;
    this.onChange = onChange;
    for (const it of items) {
      const b = el('button', `sbtn ${it.color || color}`);
      b.type = 'button';
      b.tabIndex = -1;
      if (it.tip) b.title = it.tip;
      b.append(label(it.main, it.sub));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); snd('click'); onChange(it.v); });
      b.addEventListener('keydown', (e) => e.preventDefault());
      this.el.append(b);
      this.btns.set(it.v, b);
    }
  }
  set(v) {
    if (v === this.cur) return;
    this.cur = v;
    for (const [k, b] of this.btns) b.classList.toggle('lit', k === v);
  }
  show(v, on) { const b = this.btns.get(v); if (b) b.style.display = on ? '' : 'none'; }
}

// Ruled bar: ink outline, fill that goes ochre and then red as it empties (unless `invert`).
export class Bar {
  constructor({ cls = '', invert = false } = {}) {
    this.el = el('div', 'bar ' + cls);
    this.fill = el('i');
    this.el.append(this.fill);
    this.lvl = '';
    this.invert = invert;
    this.w = -1;
  }
  set(frac) {
    frac = Math.max(0, Math.min(1, frac || 0));
    const w = Math.round(frac * 100);
    if (w !== this.w) { this.w = w; this.fill.style.width = `${w}%`; }
    const f = this.invert ? 1 - frac : frac;
    const lvl = f < 0.3 ? 'lo' : f < 0.6 ? 'mid' : 'hi';
    if (lvl !== this.lvl) {
      if (this.lvl) this.el.classList.remove(this.lvl);
      this.el.classList.add(lvl);
      this.lvl = lvl;
    }
  }
}

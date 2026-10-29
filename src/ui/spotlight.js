// The lessons' spotlight (a lesson with `spotlight: true`, src/tutorial.js): the screen darkened but for holes over
// what the step is about, so the one thing to do is the one thing lit. A step's `spot` names the holes: data-tut names
// as src/ui/highlight.js uses them, or CSS selectors, which light their first match ('#view' the 3D view, '#panel' the
// console, '#gunner' the gun card, '[data-tut~="report"]' the newest report slip). The dark is the screen less the
// holes, cut into plain rectangles (a grid on the holes' edges, so holes that touch or overlap simply join; no SVG mask,
// which some rasterisers draw in bands). A click, a press or a wheel in the dark is stopped before anything sees it
// (window capture listeners, tested against the holes); the keys still work everywhere. The instruction card and the
// hints stand above the dark and take clicks (style.css body.spotlit). The holes ease to their elements every frame:
// the console is rebuilt on a unit change, the gun card appears when the player mans a gun, a slip scrolls.
//   setSpotlight(['missions', '#view'])   holes over those
//   setSpotlight([])                      everything dark but the card (a step that only explains)
//   setSpotlight(null)                    off
// A list whose elements are all missing or hidden darkens nothing: a hole the step needs must never be dark.
const NS = 'http://www.w3.org/2000/svg';
const PAD = 6; // px of air round a hole
const R = 3; // the rim's corners
const OPEN = '#tut-card, #hint'; // above the dark: always clickable
let svg = null, dark = null, rims = null, list = null, cur = [], want = [], raf = 0, shown = false;

function mount() {
  svg = document.createElementNS(NS, 'svg');
  svg.id = 'spotlight';
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path class="sl-dark"/><g class="sl-rims"></g>';
  dark = svg.querySelector('.sl-dark');
  rims = svg.querySelector('.sl-rims');
  document.body.append(svg);
  // the dark takes no input: anything aimed outside the holes and the card is stopped here, before the page sees it
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel']) {
    addEventListener(type, (e) => {
      if (!shown || document.body.classList.contains('ui-hidden') || e.target?.closest?.(OPEN)) return; // (H hides it)
      const x = e.clientX, y = e.clientY;
      if (want.some((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) return;
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    }, { capture: true, passive: false });
  }
}

// a data-tut name lights every element with it; a CSS selector ('#view', '[data-tut~="report"]') its first match only
const find = (name) => (/^[#.[]/.test(name) ? [document.querySelector(name)] : [...document.querySelectorAll(`[data-tut~="${name}"]`)]);

// the rectangles to cut, padded and clipped to the screen; one inside another is dropped
function targets() {
  const W = innerWidth, H = innerHeight, out = [];
  for (const name of list) for (const e of find(name)) {
    if (!e) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const x0 = Math.max(0, r.left - PAD), y0 = Math.max(0, r.top - PAD), x1 = Math.min(W, r.right + PAD), y1 = Math.min(H, r.bottom + PAD);
    if (x1 - x0 > 2 && y1 - y0 > 2) out.push({ x0, y0, x1, y1 });
  }
  const inside = (a, b) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;
  return out.filter((a, i) => !out.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

// the screen less the holes as rectangles: the cells of the grid on every hole's edges that lie in no hole, each row's
// run of them one rectangle
function darkPath(holes, W, H) {
  const xs = [...new Set([0, W, ...holes.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
  const ys = [...new Set([0, H, ...holes.flatMap((h) => [h.y0, h.y1])])].sort((a, b) => a - b);
  const lit = (x, y) => holes.some((h) => x > h.x0 && x < h.x1 && y > h.y0 && y < h.y1);
  let d = '';
  for (let j = 0; j + 1 < ys.length; j++) {
    const y0 = ys[j], y1 = ys[j + 1], cy = (y0 + y1) / 2;
    if (y1 - y0 < 0.01) continue;
    let run = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const on = !lit((xs[i] + xs[i + 1]) / 2, cy);
      if (on && run == null) run = xs[i];
      if (run != null && (!on || i + 2 === xs.length)) {
        const x1 = on ? xs[i + 1] : xs[i];
        if (x1 > run) d += `M${run},${y0}H${x1}V${y1}H${run}Z`;
        run = null;
      }
    }
  }
  return d;
}

const rim = () => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('rx', R); r.setAttribute('class', 'sl-rim'); return r; };
const place = (el, { x0, y0, x1, y1 }) => {
  el.setAttribute('x', x0); el.setAttribute('y', y0);
  el.setAttribute('width', Math.max(0, x1 - x0)); el.setAttribute('height', Math.max(0, y1 - y0));
};

function frame() {
  raf = 0;
  if (!list) return;
  want = targets();
  // a list that finds nothing lights everything (never a dark hole over the work); [] darkens all but the card
  const on = !list.length || want.length > 0;
  if (on !== shown) { shown = on; svg.classList.toggle('on', on); }
  // the holes slide from where they were when there are as many; a new set appears where it is
  if (want.length === cur.length) {
    const ease = (a, b) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * 0.3);
    cur = cur.map((c, i) => ({ x0: ease(c.x0, want[i].x0), y0: ease(c.y0, want[i].y0), x1: ease(c.x1, want[i].x1), y1: ease(c.y1, want[i].y1) }));
  } else cur = want;
  const W = innerWidth, H = innerHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  dark.setAttribute('d', darkPath(cur, W, H));
  while (rims.children.length < cur.length) rims.append(rim());
  while (rims.children.length > cur.length) rims.lastChild.remove();
  cur.forEach((h, i) => place(rims.children[i], h));
  raf = requestAnimationFrame(frame);
}

export function setSpotlight(names) {
  if (typeof document === 'undefined') return;
  if (!names) {
    list = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    shown = false;
    want = [];
    svg?.classList.remove('on');
    document.body.classList.remove('spotlit');
    return;
  }
  if (!svg) mount();
  list = [...names];
  document.body.classList.add('spotlit');
  if (!raf) raf = requestAnimationFrame(frame);
}

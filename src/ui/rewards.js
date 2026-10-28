// The battle's reward feed, as War Thunder and Enlisted show it: every kill, every gun or tank knocked out, every burst
// among the enemy's men and every mission done, the moment it pays (sim.credit -> events.reward, wired in main.js), with
// the battery that did it and the research points it earned; the hits on one target gather into a single line that
// counts up. Beside it the battle's running total. Plain DOM, no three.js.
import './rewards.css';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// what one part of a target is, in the player's words (a target's parts: sim/tables.js TARGETS[kind].parts)
const PART = {
  battery: 'a gun', abattery: 'a gun', amedium: 'a gun', sbattery: 'a gun', bfield: 'an 18-pounder', bgun92: 'a 9.2-inch',
  bgun6: 'a 6-inch', bgun60: 'a 60-pounder', tanks: 'a tank', btanks: 'a Mark IV', aconvoy: 'a lorry', bconvoy: 'a lorry',
  crossroads: 'a lorry', railyard: 'a wagon', dump: 'a stack of shells', adump: 'a stack of shells', bdump: 'a stack of shells',
  hq: 'a building', aop: 'an aeroplane', bunker: 'a shelter', fort: 'a casemate', citadel: 'a casemate', eastfort: 'a casemate',
  turret: 'a turret', balloon: 'the winch', bballoon: 'the winch',
};
export const ACT = { kill: 'Destroyed', part: 'Knocked out', men: 'Casualties', mission: 'Mission done', hit: 'Hit' };
// one reward in words: { act, what }
export function rewardWords(why) {
  if (why?.act === 'part') return { act: ACT.part, what: `${PART[why.kind] ?? 'a part'} (${why.name ?? 'the target'})` };
  if (why?.act === 'kill') return { act: ACT.kill, what: why.name ?? 'the target' };
  if (why?.act === 'men') return { act: ACT.men, what: `${why.n} of the enemy's men` };
  if (why?.act === 'mission') return { act: ACT.mission, what: why.title ?? 'a mission' };
  return { act: ACT.hit, what: why?.name ?? 'the target' };
}

const LIFE = 5200, HIT_LIFE = 3200, MAX = 6;
export function createRewardFeed(root) {
  const box = el('div', 'rw-feed');
  box.setAttribute('aria-live', 'polite');
  const total = el('div', 'rw-total');
  total.append(el('small', null, 'Research points'), el('b', null, '+0'));
  root.append(box, total);
  const items = new Map(); // key -> { node, pts, until }
  let sum = 0;
  const show = (on) => total.classList.toggle('on', on);
  return {
    // a reward that paid `pts` (research points) to the battery `who`; hits on one target add into one line
    push(why, pts, who) {
      if (!(pts > 0)) return;
      sum += pts;
      total.lastChild.textContent = `+${Math.round(sum).toLocaleString('en-US')}`;
      show(true);
      // (the hits on one target by one battery gather, and a mission's shares among the batteries)
      const { act, what } = rewardWords(why), key = why?.act === 'hit' ? `hit:${why.id}:${who}` : why?.act === 'mission' ? `m:${why.title}` : `${Math.random()}`;
      let it = items.get(key);
      if (!it) {
        const node = el('div', `rw-item rw-${why?.act ?? 'hit'}`);
        node.append(el('b', 'rw-act', act), el('span', 'rw-what', what), el('i', 'rw-who', why?.act === 'mission' ? 'the Gruppe' : who ?? ''), el('em', 'rw-pts', ''));
        box.prepend(node);
        it = { node, pts: 0 };
        items.set(key, it);
        // the oldest go when the feed is full
        while (box.children.length > MAX) {
          const last = box.lastChild;
          for (const [k, v] of items) if (v.node === last) items.delete(k);
          last.remove();
        }
      }
      it.pts += pts;
      it.until = performance.now() + (why?.act === 'hit' ? HIT_LIFE : LIFE);
      it.node.querySelector('.rw-pts').textContent = `+${Math.max(1, Math.round(it.pts))}`;
      it.node.classList.remove('out');
    },
    // every frame: lines whose time is up fade and go
    update() {
      const now = performance.now();
      for (const [k, it] of items) {
        if (now < it.until) continue;
        if (!it.node.classList.contains('out')) { it.node.classList.add('out'); it.until = now + 400; continue; }
        it.node.remove();
        items.delete(k);
      }
    },
    reset() {
      items.clear();
      box.replaceChildren();
      sum = 0;
      total.lastChild.textContent = '+0';
      show(false);
    },
    get total() { return sum; },
  };
}

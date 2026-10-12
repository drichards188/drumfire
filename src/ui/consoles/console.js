// One fire control console for every unit kind: header (call sign, status line, mode, S.O.S. keys), the
// artillery board, the fire order card, the range table, the guns, the missions and the message pad. Each
// kind differs only through KINDS (common.js): rounds offered, fuzes, charges, the note under the header.
import { el, setText, setCls, label, Seg, Btn, Bar, snd } from '../widgets.js';
import { SECTORS, YARD } from '../../sector.js';
import { Board } from '../board.js';
import { OrderCard, STEPS_YD } from './orderCard.js';
import { RangeTable } from './rangeTable.js';
import { GunsCard } from './gunsCard.js';
import { MissionList } from './missionList.js';
import { MessagePad } from './messagePad.js';
import { KINDS, chargeCount, liveMissions, MISSION_NAME } from './common.js';
import { rangeSpan } from '../board.js';
import { tut } from '../highlight.js';

export function mountConsole(ctx) {
  const { id, send, memo, shared, mail, tracker } = ctx;
  let U = null, SIM = null;
  let toast = '', toastT = -1e9;
  const say = (t) => { toast = t; toastT = performance.now(); };
  const cfgOf = (u) => KINDS[u.kind] || KINDS.bl6;
  const man = () => { if (U && U.mode === 'auto') send('mode', { mode: 'manual' }); };
  const cmd = (name, args = {}) => { man(); send(name, args); };

  // ----- actions (keys and buttons both land here) -----
  const stepYd = () => STEPS_YD[memo.step == null ? 2 : memo.step];
  const act = (name, arg, e) => {
    if (!U || U.alive === false) return;
    const cfg = cfgOf(U), o = U.order || {};
    switch (name) {
      case 'charge': {
        const n = chargeCount(SIM, U, cfg), c = Math.max(0, Math.min(n - 1, (o.charge || 0) + arg));
        if (c !== (o.charge || 0)) cmd('charge', { charge: c });
        break; }
      case 'rounds': {
        const list = cfg.rounds; let i = list.findIndex((v) => v >= (o.rounds || 1));
        if (i < 0) i = list.length - 1;
        i = Math.max(0, Math.min(list.length - 1, i + arg));
        cmd('rounds', { n: list[i] });
        break; }
      case 'fuze': cmd('fuze', { fuze: arg }); break;
      case 'fuzecycle': { const l = cfg.fuzes; cmd('fuze', { fuze: l[(l.indexOf(o.fuze || 'instant') + 1) % l.length] }); break; }
      case 'step': memo.step = ((memo.step == null ? 2 : memo.step) + 1) % STEPS_YD.length; snd('click'); break;
      case 'corr': {
        if (!o.target) { say('Lay on a target first.'); break; }
        const y = (e && e.shiftKey ? 10 : stepYd()) * YARD;
        if (arg === 'add') cmd('correct', { add: y, right: 0 });
        else if (arg === 'drop') cmd('correct', { add: -y, right: 0 });
        else if (arg === 'right') cmd('correct', { add: 0, right: y });
        else cmd('correct', { add: 0, right: -y });
        break; }
      case 'fire':
        if (!o.target) { say('No target laid: click the board or take a mission.'); snd('click'); break; }
        cmd('fire');
        break;
      case 'cease': send('cease', {}); say('Cease fire.'); break;
      case 'mode': send('mode', { mode: arg }); break;
      case 'sos': send('sos', { sector: arg }); say(`S.O.S. ${arg}: all guns to the S.O.S. line.`); break;
      case 'apply': {
        const s = arg || mail.slips.find((x) => x.corr && !x.applied);
        if (s && s.corr) { cmd('correct', { add: s.corr.add, right: s.corr.right }); s.applied = true; say(`Applied: ${s.note}`); }
        break; }
    }
  };
  const take = (m) => {
    shared.cursor = m.id;
    if (SIM && U && U.missionId === m.id) { say('Already on that task.'); return; }
    cmd('mission', { id: m.id });
  };

  // ----- parts -----
  const root = el('div', 'con');
  const hdr = el('header', 'hdr');
  const hid = el('div', 'hid');
  const callEl = el('b', 'call'), nameEl = el('i', 'uname');
  hid.append(callEl, nameEl);
  const hstat = el('div', 'hstat');
  const statEl = el('div', 'stat'), noteEl = el('div', 'snote2');
  hstat.append(statEl, noteEl);
  const mode = new Seg({
    cls: 'mode', items: [{ v: 'auto', main: 'AUTO', sub: 'crew fires' }, { v: 'manual', main: 'MANUAL', sub: 'you fire' }, { v: 'hold', main: 'HOLD', sub: 'cease' }],
    onChange: (v) => act('mode', v),
  });
  const sosBox = el('div', 'sosbox');
  const sosChips = SECTORS.map((s) => {
    const b = new Btn({ main: s.id, sub: s.name.slice(0, 7), cls: 'sos', onClick: () => act('sos', s.id), tip: `Call S.O.S. on ${s.name} (S)` });
    const strength = new Bar({ cls: 'mini' });
    const w = el('div', 'sosc');
    w.append(b.el, strength.el);
    sosBox.append(w);
    return { b, w, strength, id: s.id };
  });
  hdr.append(hid, hstat, mode.el, sosBox);
  tut(hdr, 'header'); tut(statEl, 'status'); tut(mode.el, 'mode'); tut(sosBox, 'sos');

  const board = new Board({
    memo,
    onLay: (x, z) => { cmd('lay', { x, z }); },
    onTarget: (t) => {
      const m = (SIM.missions || []).find((q) => q.targetId === t.id && (q.state === 'open' || q.state === 'ranging' || q.state === 'ffe'));
      if (m) take(m); else cmd('lay', { x: t.pos.x, z: t.pos.z });
    },
  });
  tut(board.el, 'board');
  const cfg0 = KINDS[ctx.kind] || KINDS.bl6;
  const order = new OrderCard({ send, act, cfg: cfg0 });
  const rtab = new RangeTable();
  const guns = new GunsCard();
  const missions = new MissionList({ shared, take });
  const pad = new MessagePad({ apply: (s) => act('apply', s) });

  tut(rtab.el, 'rtab'); tut(guns.el, 'guns'); tut(missions.el, 'missions'); tut(pad.el, 'pad');
  const top = el('div', 'toprow');
  const right = el('div', 'rightcol');
  right.append(order.el, rtab.el);
  top.append(board.el, right);
  const bot = el('div', 'botrow');
  bot.append(guns.el, missions.el, pad.el);
  root.append(hdr, top, bot);
  callEl.textContent = '';

  // ----- per frame -----
  function update(dt, unit, view) {
    U = unit; SIM = view.sim;
    const sim = view.sim, cfg = cfgOf(unit), o = unit.order || {};
    const now = performance.now();
    setText(callEl, (unit.callsign || '').toUpperCase());
    setText(nameEl, `${unit.name}  ·  ${unit.battery || ''}`);
    mode.set(unit.mode);
    const dead = unit.alive === false;
    const ps = unit.pieces || [];
    const alive = ps.filter((p) => p.state !== 'dead').length;
    const ready = ps.filter((p) => p.state === 'ready').length;
    const loading = ps.filter((p) => p.state === 'loading').length;
    const laying = ps.filter((p) => p.state === 'laying').length;
    const m = unit.missionId != null ? (sim.missions || []).find((q) => q.id === unit.missionId) : null;
    let st;
    const alarmSet = board.alarm || new Set();
    if (dead) st = 'BATTERY SILENCED: every piece knocked out';
    else if (alarmSet.size) { const a = [...alarmSet][0]; st = `S.O.S. ${a}, ${SECTORS.find((s) => s.id === a).name}! Press S: every gun to the S.O.S. line.`; }
    else if (now - toastT < 3200) st = toast;
    else if (unit.mode === 'hold') st = 'HOLDING: cease fire. Press A or MANUAL to go on.';
    else if (!o.target) st = 'AWAITING A TARGET. Click the board, or Tab and Enter for a mission.';
    else {
      const tail = m ? ` (M${m.id} ${m.state === 'ffe' ? 'for effect' : m.state})` : '';
      if (ready) st = `${ready} of ${alive} READY. ${unit.mode === 'auto' ? 'Crew will fire' : 'SPACE to fire'}${tail}`;
      else st = `${loading ? loading + ' loading' : ''}${loading && laying ? ', ' : ''}${laying ? laying + ' laying' : ''}${!loading && !laying ? 'reloading' : ''}${tail}`;
    }
    setText(statEl, st);
    setCls(statEl, 'bad', dead || alarmSet.size > 0 || (now - toastT < 3200));
    setCls(statEl, 'go', !dead && ready > 0 && !!o.target);
    hid.title = cfg.note;
    // S.O.S. keys: lit and flashing in the alarmed sector, grey where the sector is lost
    const alarm = board.alarm || new Set();
    for (const c of sosChips) {
      const s = sim.front ? sim.front[c.id] : 1;
      c.b.set(alarm.has(c.id));
      setCls(c.b.el, 'alarm', alarm.has(c.id));
      setCls(c.w, 'lost', s === 0);
      c.strength.set(s == null ? 1 : s);
    }
    setCls(hdr, 'alarm', alarm.size > 0);

    const nCharges = chargeCount(sim, unit, cfg);
    const tgtM = m || (o.target ? liveMissions(sim).find((q) => Math.hypot(q.x - o.target.x, q.z - o.target.z) < 90) : null);
    let tname = tgtM ? `M${tgtM.id}  ${tgtM.title || MISSION_NAME[tgtM.kind]}` : '';
    if (!tname && o.target) { const tg = (sim.targets || []).find((q) => Math.hypot(q.pos.x - o.target.x, q.pos.z - o.target.z) < 90); tname = tg ? tg.name : ''; }
    const tab = (sim.rangeTable && sim.rangeTable(unit.kind, o.charge || 0)) || [];
    let apex = 0;
    if (tab.length && o.range != null) { let best = 1e9; for (const e of tab) { const d = Math.abs(e.range - o.range); if (d < best) { best = d; apex = e.apex || 0; } } }
    order.update({ unit, sim, nCharges, missionName: tname, ready, alive, stepYd: stepYd(), apexYd: apex / YARD });
    rtab.update({ sim, unit });
    guns.update({ unit });
    missions.update({ sim, unit });
    pad.update({ mail, unit });
    board.update(dt, { sim, unit, tracker, cursorId: shared.cursor, now });
    for (const b of [order.bAdd, order.bDrop, order.bLeft, order.bRight]) b.enable(!dead);
  }

  function key(e, down) {
    if (!U) return false;
    const c = e.code;
    if (c === 'Space') { order.bFire.press(down); if (down) act('fire'); return true; }
    if (!down) return c.startsWith('Arrow');
    if (e.repeat && c.startsWith('Arrow')) return true;
    switch (c) {
      case 'Tab': missions.cycle(e.shiftKey ? -1 : 1, SIM); snd('click'); return true;
      case 'Enter': { const m = (SIM.missions || []).find((q) => q.id === shared.cursor); if (m) take(m); else say('No mission selected.'); return true; }
      case 'ArrowUp': order.bAdd.press(true); setTimeout(() => order.bAdd.press(false), 120); act('corr', 'add', e); return true;
      case 'ArrowDown': order.bDrop.press(true); setTimeout(() => order.bDrop.press(false), 120); act('corr', 'drop', e); return true;
      case 'ArrowLeft': order.bLeft.press(true); setTimeout(() => order.bLeft.press(false), 120); act('corr', 'left', e); return true;
      case 'ArrowRight': order.bRight.press(true); setTimeout(() => order.bRight.press(false), 120); act('corr', 'right', e); return true;
      case 'KeyQ': act('charge', -1); return true;
      case 'KeyE': act('charge', 1); return true;
      case 'KeyR': { const o = U.order || {}, l = cfgOf(U).rounds; const i = l.findIndex((v) => v >= (o.rounds || 1)); cmd('rounds', { n: l[(i + 1) % l.length] }); return true; }
      case 'KeyZ': act('fuzecycle'); return true;
      case 'KeyA': send('mode', { mode: U.mode === 'auto' ? 'manual' : 'auto' }); return true;
      case 'KeyS': { const al = board.alarm && [...board.alarm][0]; const weak = al || SECTORS.filter((s) => (SIM.front ? SIM.front[s.id] : 1) > 0).sort((a, b) => (SIM.front ? SIM.front[a.id] : 1) - (SIM.front ? SIM.front[b.id] : 1))[0]?.id; if (weak) act('sos', weak); return true; }
      case 'KeyX': act('step'); return true;
      case 'Backspace': case 'Delete': act('cease'); return true;
      case 'Period': act('apply'); return true;
    }
    return false;
  }

  return { el: root, update, key, dispose() {}, board, say };
}

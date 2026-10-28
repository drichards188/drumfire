// The test range's in-person firing, headless: node tools/rangetest.mjs [kinds, default lefh18,sfh18,k18,mrs18,karl,gustav]
// For each WW2 gun that can be served in person, the range's own setup (src/ui/range.js: the scripted game with
// `range: true`, one gun of the battery alone in the field, on manual) with the guns laid on the nearest target in
// reach, the player at the gun (src/ww2/gunner.js) running the drill as tools/gunnertest.mjs does, with crew help and
// alone: each must be manned, alone in the field and fire. Exits 1 on a failure. The Nebelwerfer too, and the 1918
// guns (k17, sfh13, m16, max38, gamma, bertha) on the WW1 range, the ridge's (src/ww1/theatre.js), in a second process
// whose pads leave the WW2 range's ground as it was; their target is in the arc as well as in reach (the bed-mounted
// giants' arcs are narrow).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { sandboxTheatre } from '../src/campaign.js';
import { ww1Theatre } from '../src/ww1/theatre.js';
import { DRIVEN } from '../src/ww2/gunner.js';
import { modsOf } from '../src/research.js';
import { autoCharge } from '../src/sim/shells.js';
import { bearingOf } from '../src/sector.js';
const WW1_KINDS = new Set(['k17', 'sfh13', 'm16', 'max38', 'gamma', 'bertha']);
const asked = (process.argv[2] ?? 'lefh18,sfh18,k18,mrs18,karl,gustav,nbw41,k17,sfh13,m16,max38,gamma,bertha').split(',');
const ERA1 = process.argv[3] === 'ww1';
const th = ERA1 ? ww1Theatre('ridge') : sandboxTheatre('flanders');
const { heightAt, groundKindAt } = await import('../src/terrainHeight.js');
const KEY = { E: { work: true }, A: { az: 1 }, D: { az: -1 }, W: { el: 1 }, S: { el: -1 } };
const DRIVE = { A: ['az', 1], D: ['az', -1], W: ['el', 1], S: ['el', -1] };
const kinds = asked.filter((k) => WW1_KINDS.has(k) === ERA1);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let fails = 0;
for (const kind of kinds) for (const assist of [true, false]) {
  const guns = 1;
  const sim = new Sim({ heightAt, groundAt: groundKindAt, seed: 7, theatre: th });
  const log = [];
  sim.events = { radio: (t, k) => log.push(`[${sim.time.toFixed(0)}] ${k} ${t}`) };
  sim.newGame({ scripted: true, range: true, difficulty: 'Normal', attract: false, seed: 7, loadout: { [kind]: { guns, mods: modsOf({}) } } });
  for (const u of sim.units) u.mode = 'manual';
  const u = sim.units.find((q) => q.kind === kind);
  if (!u) { console.log(`${kind}: not in the field`); fails++; continue; }
  if (sim.units.length !== 1) { console.log(`${kind}: ${sim.units.length} units in the field`); fails++; }
  // a target in reach, as the card's Lay
  const t = sim.targets.filter((q) => !q.offmap && autoCharge(kind, Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z)) >= 0
    && (!ERA1 || Math.abs(wrap(bearingOf(q.pos.x - u.pos.x, q.pos.z - u.pos.z) - u.pieces[0].bearing)) <= u.arc))
    .sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) - Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z))[0];
  const p = u.pieces[0];
  const manned = sim.command(u.id, 'man', { piece: 0, post: 'lay', assist });
  sim.command(u.id, 'lay', { x: t.pos.x, z: t.pos.z });
  let think = 0, err = null;
  const fired0 = p.firedAt;
  let shots = 0, last = p.firedAt;
  try {
    while (sim.time < 600 && shots < 3) {
      const st = sim.gunner.st;
      if (st && (think -= 0.05) <= 0) {
        think = 0.25;
        const n = st.next;
        let post = st.post;
        if (n && !n.wait && n.key && (!assist || n.post === 'lay' || n.post === 'fire')) post = n.post;
        if (post !== st.post) sim.command(u.id, 'post', { post });
        const inp = { az: 0, el: 0, fine: false, work: false };
        if (n && n.key && n.post === post) {
          if (DRIVEN.has(kind) && DRIVE[n.key]) sim.command(u.id, 'drive', { axis: DRIVE[n.key][0], dir: DRIVE[n.key][1] });
          else Object.assign(inp, KEY[n.key] ?? {});
        }
        sim.gunner.setInput(inp);
      }
      sim.update(0.05);
      if (p.firedAt !== last) { shots++; last = p.firedAt; }
    }
  } catch (e) { err = e; }
  const ok = !err && manned && shots >= 1;
  if (!ok) fails++;
  console.log(`${kind.padEnd(7)} ${assist ? 'help ' : 'alone'}: manned ${!!manned}, shots ${shots} in ${sim.time.toFixed(0)} s, at the gun ${!!sim.gunner.st}, next ${sim.gunner.st?.next?.post ?? '-'}/${sim.gunner.st?.next?.key ?? '-'} ${sim.gunner.st?.next?.wait ? '(wait: ' + sim.gunner.st.next.wait + ')' : ''}${err ? ' CRASH ' + err.stack : ''}`);
  if (!ok) console.log('   ' + log.slice(-6).join('\n   '));
}
const later = ERA1 ? [] : asked.filter((k) => WW1_KINDS.has(k));
if (later.length) {
  // the 1918 guns, in a process of their own (see the top)
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), later.join(','), 'ww1'], { stdio: 'inherit' });
  if (r.status) fails++;
}
if (!ERA1) console.log(fails ? `${fails} failed` : 'all fired');
if (fails) process.exit(1);

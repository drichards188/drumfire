import assert from 'node:assert/strict';
import { Progression, SAVE_KEY } from '../src/progression.js';
import { TREES, LINES, RANK_GATE, START_KINDS, START_GUNS, OUT_OF_TREE, specialBonus, gunEraOf, nodeOf, PARTS, maxGuns, loadoutOf, modsOf, maxedLevels, opposition, battleReward, missionBonus, isOffmap, firstWinRP, overmatchCut, TOP_PART_WIN, lentKey } from '../src/research.js';
import { SLOTS, MAX_LEVEL, THREAT, threatOf } from '../src/threat.js';
import { recommendedLevel } from '../src/capability.js';
import { GUNS } from '../src/sim/tables.js';
import { BATTERIES, CAMPAIGN } from '../src/campaign-data.js';
import { campaignTheatre } from '../src/campaign.js';
import { Sim } from '../src/sim/sim.js';
import { ww2Theatre } from '../src/ww2/theatre.js';
import { menuItems } from '../src/menuItems.js';
const mk = (init = []) => ({ data: new Map(init), getItem(k) { return this.data.get(k) ?? null; }, setItem(k,v) { this.data.set(k,v); } });
const storage = mk();
const DE = TREES.de.map(n=>n.kind);
const career = new Progression(storage);
assert.equal(career.dev, false, 'Dev mode is off by default');
career.setDev(true);
assert.ok(DE.every(k=>career.unlocked(k)), 'Dev mode fields every battery of the German tree');
assert.equal(new Progression(storage).dev, true, 'Switching dev mode on must survive a reload');
career.setDev(false);
assert.equal(new Progression(storage).dev, false, 'Switching dev mode off must survive a reload');
assert.deepEqual(DE.filter(k=>career.unlocked(k)), ['fk16','sfh13'], 'A new career owns the 7.7 cm FK 16 and the 15 cm sFH 13');
assert.deepEqual(START_KINDS.de, ['fk16','sfh13']);
assert.ok(START_KINDS.de.every((k) => nodeOf(k).cost === 0 && nodeOf(k).tier === 1), 'The starting batteries cost nothing, at rank I');
assert.deepEqual(['rk92','sfh93','m99'].map(nodeOf), [null, null, null], 'The ramp guns are out of the tree (cut 2026-11-26)');
// the tree's cuts (2026-11-26): 20 batteries, each line a step up at every node; the Gamma merged into Bertha at its
// place and price; the Paris Gun and the V-1 out of the tree but off-map weapons with their missions' bonuses as before
assert.equal(DE.length, 20);
assert.ok(Object.keys(OUT_OF_TREE).every((k) => !nodeOf(k)), 'Every cut battery is out of the tree');
assert.ok(Object.values(OUT_OF_TREE).every((o) => nodeOf(o.to)), 'and each has an heir in it');
assert.deepEqual(['howitzers', 'guns', 'railway', 'mortars', 'siege', 'rockets', 'support'].map((l) => TREES.de.filter((n) => n.line === l).map((n) => n.kind).join(' ')),
  ['fk16 sfh13 lefh18 sfh18 hummel', 'k17 k16 k18 k38', 'max38 gustav', 'm16 mrs18', 'beta bertha karl', 'nbw41 nbw42', 'gotha v2']);
assert.deepEqual([nodeOf('bertha').after, nodeOf('bertha').cost, nodeOf('karl').after, nodeOf('gustav').after, nodeOf('hummel').after, nodeOf('v2').after], ['beta', 2400, 'bertha', 'max38', 'sfh18', 'gotha']);
assert.deepEqual([1, 2, 3, 4].map((t) => TREES.de.filter((n) => n.tier === t).length), [3, 6, 6, 5], 'Ranks I to IV hold 3, 6, 6 and 5');
assert.equal(TREES.de.reduce((a, n) => a + n.cost, 0), 34000, '34,000 RP to the end of the tree');
assert.deepEqual([isOffmap('paris'), isOffmap('v1'), isOffmap('gamma'), specialBonus('paris'), specialBonus('v1')], [true, true, false, 2000, 1500], 'The Paris Gun and the V-1 keep their missions\' bonuses');
assert.equal(nodeOf('sfh13').after, 'fk16', 'The field line runs FK 16, sFH 13, leFH 18');
assert.equal(nodeOf('lefh18').after, 'sfh13');
assert.deepEqual([nodeOf('k17').after, nodeOf('m16').after], [null, null], 'The long guns start at the K 17, the mortars at the Mörser 16');
assert.equal(career.targetOf('de'), 'k17', 'A new career researches the cheapest open battery (the K 17)');
assert.equal(career.targetOf('ww1'), 'k17', 'The 1918 and the WW2 eras share the German tree');
// the ranks are eras (I and II the guns of 1914 to 1918, III and IV the second war's), each line in rank order; only rank
// I is open from the start, and a rank opens with RANK_GATE batteries of the rank before (War Thunder's rule)
{
  for (const n of TREES.de) {
    assert.equal(gunEraOf(n.kind) === 'ww1', n.tier <= 2, `${n.kind}: rank ${n.tier} is its era's`);
    assert.ok(!n.via, `${n.kind}: no line opens through another line`);
    if (n.after) assert.ok(nodeOf(n.after).line === n.line && nodeOf(n.after).tier <= n.tier, `${n.kind}: its line runs in rank order`);
  }
  // (the price is power, not era: a WW1 siege gun costs more than the second war's field guns)
  assert.ok(['beta', 'bertha'].every((k) => nodeOf(k).cost > Math.max(nodeOf('lefh18').cost, nodeOf('sfh18').cost, nodeOf('nbw41').cost)), 'The siege guns are dearer than the WW2 field guns');
  assert.ok(TREES.de.every((n) => career.researchBlock(n.kind) === '' ? n.tier === 1 : true), 'A new career can research nothing above rank I');
  assert.match(career.researchBlock('max38'), /rank II opens with 3 rank I batteries \(2 so far\)/, 'A shut rank says what it waits for');
  assert.deepEqual(career.rankGate('k16'), { rank: 2, need: RANK_GATE.de[2], have: 2 }, 'Rank II opens with the K 17, the one rank I battery to research');
}
// every mission, operation and lesson is open from the start, in any order
assert.ok(CAMPAIGN.every(m=>career.canPlay(m.id)), 'Every mission must be open from the start');
assert.equal(career.canPlay('earn-nothing'), false);
assert.ok(menuItems(career).every(i=>!i.locked), 'No menu entry may be locked');
// a campaign mission is a one-off RP challenge: its first win pays the research target, the RP over a battery's cost
// going on down its line
assert.equal(career.complete('earn-v1'), missionBonus(CAMPAIGN.find((m) => m.id === 'earn-v1')));
assert.equal(missionBonus(CAMPAIGN.find((m) => m.id === 'earn-v1')), 1500, 'half the V-1\'s research cost');
assert.deepEqual([...career.researched].sort(), ['k16','k17'], '1,500 RP research the K 17 (350), which opens rank II, and the K 16 (700) after it in its line');
assert.equal(career.targetOf('de'), 'm16', 'The K 18 waiting for rank III, the rest goes to the cheapest open battery, the Mörser 16');
assert.equal(career.costLeft('m16'), 900 - 450);
assert.equal(career.complete('earn-v1'), 0, 'Only the first win pays');
assert.equal(career.unlocked('v1'), false, 'A mission win grants no battery');
// research: in line order, anywhere in the tree, the target picked on the Research screen
assert.match(career.researchBlock('mrs18'), /21 cm Mörser 16 first/);
assert.match(career.researchBlock('lefh18'), /rank III opens with 3 rank II batteries \(1 so far\)/);
assert.equal(career.setTarget('mrs18'), false, 'Only a battery that can be researched now');
assert.equal(career.setTarget('sfh13'), false, 'Nor one the career has');
assert.equal(career.setTarget('beta'), true, 'The first of any line is open (rank II, open with the K 17)');
assert.equal(career.research('beta'), false, 'Research takes the RP (unless points are unlimited)');
assert.equal(career.reward('ww1', { rp: 300, batteries: { sfh13: 1600, beta: 50 } }), true);
assert.equal(career.costLeft('beta'), 2000 - 300);
assert.equal(career.costLeft('m16'), 450, 'Progress on a battery left for another is kept');
assert.equal(career.bp.sfh13, 1600);
assert.equal(career.bp.beta, 50, 'Points of a battery not yet researched are kept for it');
assert.equal(career.battles.de, 1);
// upgrades: paid in the battery's own points, in any order
assert.deepEqual([career.level('sfh13','guns'), career.level('fk16','guns')], [START_GUNS.sfh13, START_GUNS.fk16], 'The starting batteries have their first two guns (START_GUNS)');
assert.deepEqual([START_GUNS.sfh13, START_GUNS.fk16, maxGuns('sfh13'), maxGuns('fk16')], [2, 2, 4, 4], 'two of their four');
assert.equal(career.level('k16','guns'), 1, 'Any other battery starts with one gun');
assert.equal(career.upgrade('sfh13','shells'), true);
assert.equal(career.upgrade('sfh13','guns'), true);
assert.equal(career.upgrade('sfh13','guns'), true);
assert.equal(career.upgrade('sfh13','guns'), false, 'The sFH 13 has four pits');
assert.equal(career.upgradeBlock('sfh13','guns'), 'at its best');
assert.equal(career.bp.sfh13, 1600 - 80 - 240 - 360, 'Its third and fourth guns, 240 and 360');
assert.equal(career.upgrade('beta','shells'), false, 'An unresearched battery cannot be upgraded');
const reread = new Progression(storage);
assert.deepEqual([reread.level('sfh13','guns'), reread.bp.sfh13, reread.targetOf('de'), reread.costLeft('beta')], [4, 920, 'beta', 1700], 'Levels, points, target and progress survive a reload');
for (let i = 0; i < 2; i++) assert.equal(reread.upgrade('sfh13','barrel'), true);
assert.equal(reread.upgradeBlock('sfh13','barrel'), 'win a level 6 battle', 'A part\'s top level waits for a win at threat level 6');
assert.equal(reread.upgrade('sfh13','barrel'), false);
reread.wins.de[6] = 1; // (a level 6 win without its bonus: this career's research is checked below)
for (let i = 0; i < 2; i++) assert.equal(reread.upgrade('sfh13','barrel'), i < 1, 'Three barrel levels (80 + 170 + 300), then at its best');
assert.equal(reread.bp.sfh13, 920 - 550);
// the open battle's lineup: the researched batteries with their levels
const bde = reread.battle('ww1');
assert.deepEqual(Object.keys(bde.loadout).sort(), ['fk16','k16','k17','sfh13']);
assert.equal(bde.loadout.sfh13.guns, 4);
assert.equal(bde.loadout.fk16.guns, 2);
assert.equal(bde.loadout.k16.guns, 1);
assert.equal(bde.loadout.sfh13.mods.dmg, 1.12);
assert.equal(bde.loadout.sfh13.mods.disp, 0.6, 'Barrel at its top');
assert.ok(bde.opposition.cb < 1 && bde.opposition.assault < 1, 'A small lineup meets a lighter enemy');
// dev mode lays every battery at its top over the career, which it does not change
reread.setDev(true);
const dev = reread.battle('de');
assert.deepEqual(Object.keys(dev.loadout).sort(), [...reread.lineupKinds('de')].sort(), 'Dev mode fields its lineup (5 and 1), every battery open to it');
assert.ok(Object.entries(dev.loadout).every(([k,l]) => l.guns === maxGuns(k) && Math.abs(l.mods.load - 0.72 * 0.9) < 1e-12 && l.mods.crew === 0.75));
assert.ok(dev.opposition.cb < 1 && dev.opposition.assault < 1, 'Five batteries of the tree meet a lighter enemy (a threat level replaces it in battle)');
assert.equal(reread.level('sfh13','guns',false), 4, 'The career underneath unchanged by dev mode');
// the saves before the German tree are not carried over: a new career
const v3 = new Progression(mk([['drumfire.campaign.v3', JSON.stringify({ researched: ['k18','gustav'], rp: { ww2: 9999 }, devSet: true, dev: false })]]));
assert.deepEqual([v3.researched.size, v3.rp.de, v3.dev], [0, 0, false]);
assert.equal(SAVE_KEY, 'drumfire.campaign.v4');
// a career saved before the C/92 headed the guns' line (no save mark) started with the K 17 and keeps it; it gets the
// FK 16 and the sFH 13, and the 300 RP it put into the FK 16, now a career's from the start, come back; a new save is marked
{
  const old = new Progression(mk([[SAVE_KEY, JSON.stringify({ researched: ['fk16'], bp: { k17: 70 }, levels: { k17: { guns: 2 } } })]]));
  assert.ok(old.owns('k17') && old.owns('sfh13') && old.owns('fk16'), 'An older career keeps its K 17 and has both starting batteries');
  assert.deepEqual([old.level('k17', 'guns', false), old.bp.k17], [2, 70]);
  assert.deepEqual([old.targetOf('de'), old.costLeft('k16')], ['k16', 700 - 300], 'The FK 16\'s RP come back (rank II open: the K 17 and the two starters)');
  const st = mk(); new Progression(st).save();
  assert.ok(!new Progression(st).owns('k17'), 'A new career does not own the K 17');
  assert.equal(JSON.parse(st.getItem(SAVE_KEY)).start, 4, 'A save is marked as the 20-battery tree\'s (2026-11-26)');
  // (a marked save is never refunded: its starters were never researched)
  const again = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 3, researched: ['fk16', 'sfh13'], progress: { sfh13: 200 } })]]));
  assert.deepEqual([again.rp.de, again.costLeft('k17'), again.progress.sfh13], [0, 350, undefined]);
}
// a career begun with the C/92 (save mark 2, 2026-11-01 to 2026-11-26): the ramp guns are cut (commit 1dd259b has
// them). The RP put into the sFH 93 and the Mörser 99 (REMOVED) and into the FK 16 and the sFH 13 (now free) come back;
// the C/92's battery points, guns and parts go to the sFH 13, the sFH 93's points and what its upgrades cost to the
// sFH 13 as points; a starter's gun bought before START_GUNS comes back as points; the C/92's lineup slot is the sFH 13's
{
  const save = { start: 2, researched: ['fk16', 'sfh93', 'k17'], progress: { m99: 200 }, target: { de: 'm99' }, bp: { rk92: 500, sfh93: 90 },
    levels: { rk92: { guns: 2, shells: 2, barrel: 1 }, sfh93: { guns: 2, shells: 1 }, fk16: { guns: 2 } }, lineup: { de: ['k17', 'rk92', 'sfh93'] } };
  const st = mk([[SAVE_KEY, JSON.stringify(save)]]), c = new Progression(st);
  assert.ok(['fk16', 'sfh13', 'k17'].every((k) => c.owns(k)) && !c.owns('sfh93') && !c.owns('rk92'));
  assert.deepEqual([[...c.researched].sort(), c.targetOf('de'), c.costLeft('m16')], [['k16', 'k17'], 'm16', 900 - 150], '350 + 200 + 300 RP back: the K 16 (700) and 150 into the Mörser 16');
  assert.deepEqual([c.level('sfh13', 'guns'), c.level('sfh13', 'shells'), c.level('sfh13', 'barrel')], [2, 2, 1], 'The C/92\'s guns and parts are the sFH 13\'s');
  assert.equal(c.bp.sfh13, 500 + 90 + 120 + 80 + 120, 'its points, the sFH 93\'s points and upgrades (a gun 120, shells 80), the C/92\'s second gun (now free)');
  assert.equal(c.bp.fk16, 120, 'The FK 16\'s second gun, bought before it came free, comes back');
  assert.deepEqual(c.lineupKinds('de'), ['k17', 'sfh13'], 'The C/92\'s slot goes to the sFH 13, the sFH 93 leaves');
  c.save();
  const back = new Progression(st);
  assert.deepEqual([back.bp.sfh13, back.bp.fk16, back.rp.de, back.costLeft('m16'), back.level('sfh13', 'shells')], [910, 120, 0, 750, 2], 'Migrated once: a reload pays nothing again');
  assert.ok(!('rk92' in JSON.parse(st.getItem(SAVE_KEY)).levels));
  // the sFH 13 researched with levels of its own: each part the higher of the two, the lower's cost as points
  const d = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 2, researched: ['fk16', 'sfh93', 'sfh13'],
    levels: { rk92: { guns: 2, shells: 2 }, sfh13: { guns: 3, shells: 1, barrel: 2 } }, bp: { sfh13: 10 }, lineup: { de: ['sfh93'] } })]]));
  assert.deepEqual([d.level('sfh13', 'guns'), d.level('sfh13', 'shells'), d.level('sfh13', 'barrel')], [3, 2, 2]);
  assert.equal(d.bp.sfh13, 10 + 80 + 240, 'shells: the lower level\'s 80; guns: 120 + 360 paid for the sFH 13\'s third gun (two now free)');
  assert.deepEqual([[...d.researched].sort(), d.costLeft('m16')], [['k16', 'k17'], 900 - 50], 'The sFH 93 (350), the FK 16 (300) and the sFH 13 (450) back');
  assert.deepEqual(d.lineupKinds('de'), ['sfh13'], 'A lineup left empty fields the sFH 13');
}
// a career from before the tree's cuts (save mark 3, 2026-11-26; commit 1dd259b has the old tree): the RP put into a cut
// battery come back (REMOVED: the Wespe, H M1, Paris Gun, Kurze Bruno, K5, K 12, Wurfgerät and V-1); its battery points
// and what its upgrades cost go to its heir (research.js OUT_OF_TREE `to`); the Gamma's research, guns, parts and
// lineup slot are Bertha's (merged)
{
  const save = { start: 3, researched: ['k17', 'k16', 'k18', 'm16', 'mrs18', 'hm1', 'beta', 'gamma', 'max38', 'paris', 'bruno', 'lefh18', 'sfh18', 'wespe', 'nbw41', 'swg40', 'gotha', 'v1'],
    progress: { k5: 1000 }, rp: { de: 0 }, target: { de: 'k5' }, bp: { wespe: 100, gamma: 50, hm1: 10, swg40: 5, v1: 7 },
    levels: { wespe: { guns: 3, shells: 1 }, gamma: { shells: 2, barrel: 1 }, hm1: { shells: 1 } }, lineup: { de: ['gamma', 'wespe', 'k18', 'sfh18', 'm16'] } };
  const st = mk([[SAVE_KEY, JSON.stringify(save)]]), c = new Progression(st);
  assert.ok(c.owns('bertha') && !c.owns('gamma') && !c.owns('wespe'), 'The Gamma\'s research is Bertha\'s');
  // 2,600 + 4,000 + 2,800 + 1,500 + 800 + 3,000 back, and the K5's 1,000: the Hummel, K 38, NbW 42, V-2 and Karl
  // (13,700) researched at once, 2,000 into the Gustav
  assert.deepEqual([['hummel', 'k38', 'nbw42', 'v2', 'karl'].every((k) => c.owns(k)), c.targetOf('de'), c.progress.gustav, c.rp.de], [true, 'gustav', 2000, 0]);
  assert.deepEqual([c.bp.hummel, c.bp.mrs18, c.bp.bertha, c.bp.nbw42, c.bp.v2], [100 + 140 + 290 + 100, 10 + 110, 50, 5, 7],
    'Points and upgrades to the heirs: the Wespe\'s 3rd and 2nd guns and shells at its own prices to the Hummel, the H M1\'s to the Mörser 18');
  assert.deepEqual([c.level('bertha', 'shells', false), c.level('bertha', 'barrel', false)], [2, 1], 'The Gamma\'s parts are Bertha\'s');
  assert.deepEqual(c.lineupKinds('de'), ['bertha', 'k18', 'sfh18', 'm16'], 'The Gamma\'s slot is Bertha\'s; the Wespe leaves');
  c.save();
  const back = new Progression(st);
  assert.deepEqual([back.rp.de, back.progress.gustav, back.bp.hummel, back.bp.bertha, JSON.parse(st.getItem(SAVE_KEY)).start], [0, 2000, 630, 50, 4], 'Migrated once');
  // the Gamma and Bertha both researched: the Gamma's 2,400 and Bertha's price cut (2,800 to 2,400) come back; each part
  // the higher of the two, the lower one's cost as points
  const b = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 3, researched: ['beta', 'gamma', 'bertha'], levels: { gamma: { guns: 1, shells: 2 }, bertha: { shells: 1, barrel: 2 } }, bp: { bertha: 5 } })]]));
  assert.deepEqual([b.level('bertha', 'shells', false), b.level('bertha', 'barrel', false), b.bp.bertha], [2, 2, 5 + 110]);
  assert.equal(b.rp.de + [...b.researched].reduce((a, k) => a + (nodeOf(k)?.cost ?? 0), 0) + Object.values(b.progress).reduce((a, v) => a + v, 0) - 2000 - 2400, 2800, '2,800 RP back');
  // RP put into the Gamma go on into Bertha; RP past a battery's new cost come back
  const p = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 3, researched: ['k17', 'beta'], progress: { gamma: 1000, bertha: 0 }, target: { de: 'gamma' } })]]));
  assert.deepEqual([p.costLeft('bertha'), p.targetOf('de')], [1400, 'bertha'], 'The Gamma\'s 1,000 RP are Bertha\'s, and so is the research target');
  const q = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 3, researched: ['k17', 'beta'], progress: { bertha: 2600 }, target: { de: 'bertha' } })]]));
  assert.ok(q.owns('bertha') && q.rp.de + Object.values(q.progress).reduce((a, v) => a + v, 0) === 200, 'Bertha researched at 2,400, the 200 over go on');
}
career.unlockAll();
assert.ok(DE.every(k=>new Progression(storage).unlocked(k)));
// a lineup takes the field with its guns and upgrades, and the battle pays the batteries that fought
{
  const levels = { bl6: { guns: 2, breech: 3, sights: 2 }, bl92: { guns: 1 } };
  const s = new Sim({heightAt:()=>0});
  s.newGame({ seed: 5, loadout: loadoutOf(levels), opposition: opposition('1917', levels) });
  assert.deepEqual(s.units.map(u=>[u.kind,u.pieces.length]), [['bl6',2],['bl92',1]]);
  const u = s.units[0], p = u.pieces[0];
  assert.equal(p.layK, 1.3);
  s.guns.startLoad(u, p);
  assert.ok(Math.abs(p.job.dur - GUNS.bl6.load[0].dur * 0.72) < 1e-9, 'The breech upgrade shortens the loading steps');
  const plain = new Sim({heightAt:()=>0}); plain.newGame({ seed: 5 });
  assert.equal(plain.units.length, 5);
  assert.equal(plain.units[0].mods, null);
  assert.ok(s.difficulty.cb < plain.difficulty.cb);
  // the shells upgrade on a burst: the same burst does more damage
  const hit = (sim, unit, dmgK) => {
    const t = sim.targets.find(q => q.kind === 'battery'), part = t.parts[0];
    sim.rng = () => 0.5;
    sim.targetAI.applyBurst({ kind: 'bl6', unitId: unit.id, fuze: 'instant', dmgK }, { x: part.x + 5, y: 0, z: part.z }, false);
    return t.maxHp - t.hp;
  };
  assert.ok(Math.abs(hit(s, u, 1.4) / hit(plain, plain.units.find(q=>q.kind==='bl6'), undefined) - 1.4) < 1e-9);
  assert.ok(s.earned[u.id] > 0, 'Damage done is credited to the battery that did it');
  // a whole battle on auto pays RP and each battery its own points, nothing to batteries not fielded
  const b = new Sim({heightAt:()=>0}); b.newGame({ seed: 9, loadout: loadoutOf(levels) });
  for (const q of b.units) q.mode = 'auto';
  while (b.state === 'playing' && b.time < 1500) b.update(.25);
  const r = battleReward(b, { won: false });
  assert.deepEqual(Object.keys(r.batteries).sort(), ['bl6','bl92']);
  assert.ok(r.rp > 0 && r.rp === r.fought + r.time + r.win && r.win === 0);
  assert.ok(r.batteries.bl6 > 0, 'The battery that fought earns points');
  assert.equal(battleReward(b, { won: true }).win, 400);
  const att = new Sim({heightAt:()=>0}); att.newGame({ attract: true, loadout: loadoutOf(levels) });
  for (let t = 0; t < 300; t += .5) att.update(.5);
  assert.equal(battleReward(att).fought, 0, 'The demonstration pays nothing');
}
{
  // unlimited points: research and upgrades free, the tree order kept, the switch saved
  const st = mk();
  const c = new Progression(st);
  c.setDev(false);
  c.setFree(true);
  assert.match(c.researchBlock('mrs18'), /21 cm Mörser 16 first/, 'The tree order still holds');
  assert.equal(c.research('mrs18'), false);
  assert.match(c.researchBlock('m16'), /rank II opens with 3 rank I batteries \(2 so far\)/, 'Rank II waits for a third rank I battery');
  assert.equal(c.research('m16'), false);
  assert.equal(c.research('fk16'), false, 'A starting battery is the career\'s already');
  assert.equal(c.research('k17'), true);
  assert.equal(c.researchBlock('m16'), '', 'The mortars start at rank II, open with the K 17');
  assert.equal(c.research('m16'), true);
  assert.equal(c.research('k16'), true);
  assert.match(c.researchBlock('mrs18'), /rank III opens with 3 rank II batteries \(2 so far\)/, 'The second war waits for three of the Great War\'s heavies');
  assert.equal(c.research('gotha'), true);
  assert.equal(c.research('mrs18'), true, 'any three: the siege guns are not needed');
  assert.equal(c.rp.de, 0, 'Nothing is spent');
  for (let i = 0; i < 3; i++) assert.equal(c.upgrade('sfh13', 'shells'), true);
  assert.equal(c.bp.sfh13 ?? 0, 0);
  assert.equal(new Progression(st).free, true, 'The switch survives a reload');
  // the career reset: back to a new career, the switches kept
  c.setDev(true);
  c.complete('earn-k18'); c.reward('ww1', { rp: 50, batteries: { sfh13: 30 } });
  c.reset();
  const r = new Progression(st);
  assert.deepEqual([r.researched.size, r.completed.size, r.rp.de, r.battles.de, r.level('sfh13', 'shells', false), r.bp.sfh13 ?? 0, r.targetOf('de')], [0, 0, 0, 0, 0, 0, 'k17']);
  assert.deepEqual([r.level('sfh13', 'guns', false), r.level('fk16', 'guns', false)], [2, 2], 'A reset keeps the starters\' first guns');
  assert.deepEqual([r.dev, r.free], [true, true], 'The switches stay');
  assert.equal(r.complete('earn-k18'), missionBonus(CAMPAIGN.find((m) => m.id === 'earn-k18')), 'A campaign mission pays its bonus again after a reset');
  // everything researched: the RP wait for the next battery the tree gets
  r.setFree(false);
  r.reward('de', { rp: 1e6, batteries: {} });
  assert.deepEqual([r.researched.size, r.targetOf('de')], [DE.length - START_KINDS.de.length, null]);
  assert.ok(r.rp.de > 0);
}
{
  // the lineup: at most 5 batteries on the map and 1 off it (threat.js SLOTS), chosen in the hangar, the best of each
  // line until then; and the threat levels, each won opening the next
  const st = mk(), c = new Progression(st);
  c.setDev(true); // (every battery open to the lineup)
  const dev = c.lineupKinds('de');
  assert.equal(dev.filter((k) => !isOffmap(k)).length, SLOTS.map);
  assert.equal(dev.filter(isOffmap).length, SLOTS.support);
  assert.ok(dev.includes('hummel'), 'The default lineup keeps a field howitzer for the Sperrfeuer (the best of its line)');
  assert.deepEqual(Object.keys(c.battle('de').loadout).sort(), [...dev].sort(), 'The battle fields the lineup');
  assert.match(c.lineupBlock('k17'), /lineup is full/);
  assert.equal(c.toggleLineup('k17'), false);
  assert.equal(c.toggleLineup('gustav'), true, 'A battery leaves the lineup');
  assert.equal(c.toggleLineup('k17'), true, 'and another takes its slot');
  assert.ok(new Progression(st).inLineup('k17') && !new Progression(st).inLineup('gustav'), 'The lineup survives a reload');
  assert.match(c.lineupBlock('gotha'), /off-map slot is taken/);
  // a swap from the slot bar: in the slot of the one it replaces, from the bench of its own kind of slot
  const before = c.lineupKinds('de'), slot = before.indexOf('k17');
  assert.ok(!c.benchOf('de', false).some((k) => before.includes(k) || isOffmap(k)) && c.benchOf('de', true).every(isOffmap));
  assert.equal(c.swapLineup('k17', 'gotha'), false, 'An off-map weapon cannot take a slot on the map');
  assert.equal(c.swapLineup('k17', 'hummel'), false, 'nor a battery already in the lineup');
  assert.equal(c.swapLineup('k17', 'm16'), true);
  assert.deepEqual(c.lineupKinds('de'), before.map((k, i) => (i === slot ? 'm16' : k)), 'The swap keeps the slot');
  assert.equal(c.swapLineup('v2', 'gotha'), true);
  assert.ok(c.inLineup('gotha') && !c.inLineup('v2') && c.lineupKinds('de').length === SLOTS.map + SLOTS.support);
  // a battery put in a slot of its choosing (the Research screen, a drag): in place of the one there, or swapping
  // places with it if it is in the lineup already; never off its own row, and the battle's order follows
  const row = () => c.lineupKinds('de').filter((k) => !isOffmap(k));
  const r0 = row(), nw = c.benchOf('de', false)[0];
  assert.equal(c.placeLineup(nw, 2), true);
  assert.deepEqual(row(), r0.map((k, i) => (i === 2 ? nw : k)), 'A battery out of the lineup takes the slot chosen');
  assert.ok(!c.inLineup(r0[2]), 'and the one in it leaves');
  assert.equal(c.placeLineup(nw, 0), true);
  assert.deepEqual(row().slice(0, 3), [nw, r0[1], r0[0]], 'One in the lineup changes places with the slot\'s battery');
  assert.deepEqual(c.slotOf(nw), { off: false, i: 0 });
  assert.equal(c.placeLineup(nw, 0), false, 'Its own slot is no move');
  assert.equal(c.placeLineup(nw, SLOTS.map), false, 'No slot past the row');
  assert.deepEqual(c.slotOf('gotha'), { off: true, i: 0 });
  assert.equal(c.placeLineup('v2', 0), true, 'An off-map weapon takes the off-map slot');
  assert.ok(c.inLineup('v2') && !c.inLineup('gotha') && row()[0] === nw);
  assert.deepEqual(new Progression(st).lineupKinds('de').filter((k) => !isOffmap(k)), row(), 'The order survives a reload');
  assert.equal(c.toggleLineup(row()[4]), true);
  assert.equal(c.placeLineup(nw, 4), false, 'A battery in the lineup does not move into an empty slot');
  assert.equal(c.placeLineup(c.benchOf('de', false)[0], 4), true, 'one out of it does');
  c.setDev(false);
  assert.deepEqual([...c.lineupKinds('de')].sort(), ['fk16', 'sfh13'], 'Dev mode off, the lineup chosen keeps the career\'s own: both its batteries');
  assert.deepEqual(new Progression(mk()).lineupKinds('de'), ['sfh13', 'fk16'], 'A new career fields both its batteries');
  assert.equal(c.lineupBlock('fk16'), '', 'either may leave');
  assert.equal(c.toggleLineup('fk16'), true);
  assert.match(c.lineupBlock('sfh13'), /needs a battery/, 'but not the last');
  assert.equal(c.toggleLineup('fk16'), true);
  assert.match(c.lineupBlock('k17'), /research it first/);
  assert.ok([1, 2, MAX_LEVEL].every((n) => c.levelUnlocked('de', n)), 'Every level is open from the start');
  assert.ok(!c.levelUnlocked('de', MAX_LEVEL + 1), 'No level past the last');
  assert.equal(c.playedLevel('ww1', 2), 0, 'Only the highest level reached moves the record on');
  assert.equal(c.playedLevel('ww1', 1), 2);
  assert.equal(c.playedLevel('ww1', 1), 0);
  c.setDev(true);
  c.reset();
  assert.deepEqual([c.threat.de, c.lineup.de], [1, null], 'A reset clears the record of levels and forgets the lineup');
  // pay as it is earned: gain adds the points without counting a battle, countBattle counts it once at the end
  c.setDev(false);
  const b0 = c.battles.de;
  c.gain('ww1', { rp: 100, batteries: { sfh13: 40 } });
  c.gain('ww1', { rp: 60, batteries: { sfh13: 25 } });
  assert.deepEqual([c.bp.sfh13, c.costLeft('k17'), c.battles.de], [65, 350 - 160, b0], 'Live pay adds up without counting battles');
  c.countBattle('ww1');
  assert.equal(new Progression(st).battles.de, b0 + 1);
  assert.equal(new Progression(st).bp.sfh13, 65, 'Live pay is saved as it comes');
  // a level's pay scales the battle's
  assert.equal(battleReward({ units: [], earned: {}, time: 600, level: threatOf(10) }, { won: true }).rp, Math.round(40 * 4) + Math.round(400 * 4));
}
{
  // the threat levels won (wonLevel, main.js at a won battle's end): each level's first win pays its bonus (research.js
  // firstWinRP: the victory's pay again, to the nearest 50) to the research target, once; the wins are counted and saved
  const st = mk(), c = new Progression(st);
  assert.deepEqual(THREAT.map((t) => firstWinRP(t.n)), [250, 250, 300, 400, 450, 500, 650, 750, 900, 1000]);
  assert.deepEqual([c.levelWins('de'), c.firstWinBonus('de', 1), c.firstWinBonus('de', 0), c.firstWinBonus('de', MAX_LEVEL + 1)], [[], 250, 0, 0]);
  assert.equal(c.wonLevel('ww1', 1), 250, 'The first win at level 1 pays its bonus');
  assert.equal(c.costLeft('k17'), 100, 'to the research target');
  assert.equal(c.wonLevel('ww1', 1), 0, 'once');
  assert.equal(c.firstWinBonus('de', 1), 0, 'and says so');
  assert.equal(c.wonLevel('ww1', 3), 300);
  assert.equal(c.wonLevel('de', MAX_LEVEL + 1), 0, 'No level past the last');
  assert.deepEqual([c.levelWins('ww1'), c.battles.de, c.threat.de], [[1, 3], 0, 1], 'A win is recorded, but counts no battle and leaves the record of levels played alone');
  const back = new Progression(st);
  assert.deepEqual([back.levelWins('de'), back.wins.de[1], back.firstWinBonus('de', 1), back.firstWinBonus('de', 2)], [[1, 3], 2, 0, 250], 'The wins survive a reload, counted');
  c.reset();
  assert.deepEqual([c.levelWins('de'), c.firstWinBonus('de', 1)], [[], 250], 'A reset clears the wins (their bonuses can be won again)');
  // a drumfire.campaign.v4 save from before the wins were kept: none won, every first win still to pay; nonsense ignored
  const old = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 3, threat: { de: 7 }, levels: { sfh13: { shells: 3, barrel: 2 } } })]]));
  assert.deepEqual([old.levelWins('de'), old.threat.de, old.firstWinBonus('de', 6), old.owns('fk16')], [[], 7, 500, true]);
  assert.equal(old.level('sfh13', 'shells', false), 3, 'A top level bought before the gate is kept');
  assert.equal(old.upgradeBlock('sfh13', 'barrel'), `win a level ${TOP_PART_WIN} battle`, 'but the next waits for the win');
  const odd = new Progression(mk([[SAVE_KEY, JSON.stringify({ wins: { de: { 0: 3, 2: 1, 4: 'x', 5: -1, 12: 1 }, ww1: { 1: 1 } } })]]));
  assert.deepEqual(odd.levelWins('de'), [2]);
  // the top part level (TOP_PART_WIN): shut until a win at level 6 or higher, said in the player's words; dev mode and
  // unlimited points open it; the lower levels and the guns never wait
  const g = new Progression(mk([[SAVE_KEY, JSON.stringify({ start: 3, bp: { sfh13: 5000 }, levels: { sfh13: { shells: 2, barrel: 1 } } })]]));
  assert.equal(g.partGate('sfh13', 'shells'), 'win a level 6 battle');
  assert.deepEqual([g.partGate('sfh13', 'barrel'), g.partGate('sfh13', 'sights'), g.partGate('sfh13', 'guns')], ['', '', ''], 'Only the top level waits');
  g.wonLevel('de', 5);
  assert.equal(g.upgrade('sfh13', 'shells'), false, 'A level 5 win does not open it');
  g.setDev(true);
  assert.equal(g.partGate('sfh13', 'shells'), '', 'Dev mode opens it');
  g.setDev(false);
  g.setFree(true);
  assert.equal(g.partGate('sfh13', 'shells'), '', 'and so do unlimited points');
  g.setFree(false);
  assert.equal(g.partGate('bl6', 'shells'), '', 'The British tree has no threat levels to wait for');
  g.wonLevel('de', 8);
  assert.equal(g.upgrade('sfh13', 'shells'), true, 'A win at level 6 or higher opens it');
}
{
  // the overmatch cut (research.js overmatchCut): full pay down to two levels below the lineup's rating, x0.75 three
  // below, x0.5 four or more below, never a bonus for a weaker lineup
  assert.deepEqual(THREAT.map((t) => overmatchCut(6, t.n)), [0.5, 0.5, 0.75, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual([overmatchCut(null, 1), overmatchCut(1, 10), overmatchCut(10, 6), overmatchCut(10, 7)], [1, 1, 0.5, 0.75]);
  // the career's rating: capability.js recommendedLevel on its lineup (Progression.rater: progression.js imports it
  // itself, late, so the loading screen does not wait for capability.js; the menu sets it at once)
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(Progression.rater, recommendedLevel, 'The rater comes with capability.js');
  const c = new Progression(mk());
  assert.equal(c.rating('de'), 1, 'A new career\'s FK 16 and sFH 13 suit level 1');
  assert.ok(THREAT.every((t) => c.overmatch('de', t.n) === 1), 'so its pay is never cut');
  c.setDev(true);
  assert.equal(c.rating('de'), recommendedLevel(c.lineupLevels('de')), 'Dev mode rates the lineup it fields');
  c.setDev(false);
  Progression.rater = () => 7;
  assert.deepEqual(THREAT.map((t) => c.overmatch('de', t.n)), [0.5, 0.5, 0.5, 0.75, 1, 1, 1, 1, 1, 1], 'A lineup rated 7 earns half on levels 1 to 3, three quarters on 4');
  Progression.rater = null;
  assert.equal(c.overmatch('de', 1), 1, 'No rater, no cut');
  Progression.rater = recommendedLevel;
  // the cut on a battle's pay (battleReward `cut`, else sim.payCut): every part of it, the battery points too
  const fake = { units: [{ id: 1, kind: 'sfh13' }], earned: { 1: 120 }, time: 600, level: threatOf(3), objectivePay: 140, objectives: {} };
  const full = battleReward(fake, { won: true }), half = battleReward(fake, { won: true, cut: 0.5 });
  assert.ok(['fought', 'time', 'win', 'objectives'].every((k) => Math.abs(half[k] - full[k] / 2) <= 1) && half.rp === half.fought + half.time + half.win + half.objectives);
  assert.deepEqual(battleReward({ ...fake, payCut: 0.5 }, { won: true }), half, 'The cut can ride on the sim (sim.payCut)');
  assert.deepEqual(battleReward(fake, { won: true, cut: 2 }), full, 'never above 1');
  assert.deepEqual(battleReward(fake, { won: true, cut: undefined }), full);
}
{
  // a lent battery (u.lent, or `lent` on its loadout entry: the first battle's super-heavy): its credit is research points,
  // never battery points, and the battle neither researches nor upgrades it
  const fake = { units: [{ id: 1, kind: 'sfh13' }, { id: 2, kind: 'gamma', lent: true }], earned: { 1: 40, 2: 300 }, time: 240, level: threatOf(1) };
  const r = battleReward(fake, { won: false });
  assert.deepEqual(r.batteries, { sfh13: 40, [lentKey('gamma')]: 300 });
  assert.equal(r.fought, 340, 'The lent battery\'s credit is in the research points');
  const viaLoadout = battleReward({ ...fake, units: [{ id: 1, kind: 'sfh13' }, { id: 2, kind: 'gamma' }], loadout: { sfh13: { guns: 1 }, gamma: { guns: 1, lent: true } } });
  assert.deepEqual(viaLoadout.batteries, r.batteries, 'or marked on its loadout entry');
  // into the career as main.js pays it: the entries' sum to the research target, battery points to the tree's batteries
  const c = new Progression(mk());
  c.gain('de', { rp: r.fought, batteries: r.batteries });
  assert.deepEqual([c.bp.sfh13, c.bp.gamma, c.bp[lentKey('gamma')], c.owns('gamma'), c.owns('fk16'), c.costLeft('k17')], [40, undefined, undefined, false, true, 350 - 340]);
  assert.equal(c.lineupKinds('de').includes('gamma'), false, 'and it is not in the lineup after');
}
assert.deepEqual(modsOf({}), { dmg: 1, disp: 1, wear: 1, load: 1, bias: 1, lay: 1, sig: 1, ammo: 1, crew: 0 });
{
  // the detachment: reserves over the drill's number (crewNeed), and the breech and detachment speedups together
  const mods = modsOf({ crew: 2, breech: 1 });
  assert.equal(mods.crew, 0.5);
  assert.ok(Math.abs(mods.load - 0.9 * 0.94) < 1e-12);
  const s = new Sim({heightAt:()=>0});
  s.newGame({ seed: 3, loadout: { bl6: { guns: 1, mods } } });
  const p = s.units[0].pieces[0];
  assert.deepEqual([p.crew, p.crewMax, p.crewNeed], [12, 12, 8]);
  p.crew = 9;
  s.guns.startLoad(s.units[0], p);
  assert.ok(Math.abs(p.job.dur - GUNS.bl6.load[0].dur * mods.load) < 1e-9, 'Losses within the reserves do not slow the gun');
}
assert.deepEqual(Object.keys(maxedLevels('bl6')), ['guns', ...PARTS.map(p=>p.id)]);
console.log('Research checks passed: the German tree, the two starting batteries, research target and line order, RP challenges, upgrades, saves (the ramp guns\' cut), dev overlay, lineup in the sim, pay, first wins, the overmatch cut, the top part gate, lent batteries.');
const sim = new Sim({heightAt:()=>0});
sim.newGame({allowedKinds:['bl6']});
assert.deepEqual(sim.units.map(u=>u.kind),['bl6']);
assert.equal(sim.unitById(1), undefined);
assert.equal(sim.command(1,'fire'),false);
for(let t=0;t<200;t+=.5) sim.update(.5);
assert.ok(sim.shells.filter(s=>s.own).every(s=>sim.unitById(s.unitId)?.kind==='bl6'));
sim.newGame({scripted:true}); assert.equal(sim.units.length,5,'Tutorials retain full roster');
for (const def of CAMPAIGN) {
  const theatre = campaignTheatre(def);
  const s = new Sim({heightAt:()=>0,theatre});
  s.newGame({seed:123});
  s.update(.05);
  assert.deepEqual(s.units.map(u=>u.kind),def.roster);
  assert.equal(s.campaignObjectives.length,def.roster.length);
  assert.equal(s.director.script.length,0,'Campaign must not run the full sandbox schedule');
  for(const o of s.campaignObjectives) {
    const u=s.unitById(o.unitId);
    if(!o.targetId) continue;
    const target=s.targetById(o.targetId);
    if(u.kind==='gustav') {
      assert.equal(u.special.ready,true,`${def.id}: Gustav starts assembled`);
      assert.equal(u.gate,null,`${def.id}: Gustav has no railway preparation gate`);
      assert.ok(u.special.tasks.every(t=>t.state==='done'));
    }
    s.guns.setTarget(u,target.pos.x,target.pos.z,{fuze:o.fuze,biasScale:0});
    assert.ok(u.order.ok || u.kind==='karl',`${def.id}: ${u.kind} target unreachable (${u.order.reason})`);
  }
  s.director.setState('victory','A missile controller may not finish the whole mission');
  assert.equal(s.state,'playing');
  s.time=def.timeLimit*s.difficulty.time+1; s.director.update(.05);
  assert.equal(s.state,'defeat','Incomplete assignments must fail at deadline');
}
console.log(`Campaign checks passed: ${CAMPAIGN.length} missions, any order, saves, XP migration, roster exclusion, reachable targets, deadlines.`);

// Exercise damage qualification, combined-objective victory, and failed attempts.
for (const def of CAMPAIGN) {
  const s = new Sim({heightAt:()=>0,theatre:campaignTheatre(def),seed:7});
  s.director.update(0);
  for(const o of s.campaignObjectives) {
    const u=s.unitById(o.unitId);
    if(!o.targetId) {
      u.special.flights.push({bErr:2,rErr:0,short:0,fate:'flying'});
      s.director.update(0);
      assert.equal(o.done,false,'A misaligned strategic launch cannot qualify');
      u.special.flights.push({bErr:0,rErr:0,short:0,fate:'flying'});
      continue;
    }
    const target=s.targetById(o.targetId);
    // A ranging round with the wrong fuze must not qualify for a concrete shoot.
    if(o.fuze==='delay') {
      s.targetAI.applyBurst({id:'wrong',kind:u.kind,unitId:u.id,fuze:'instant'},
        {x:target.pos.x,y:0,z:target.pos.z},false);
      assert.equal(o.damage,0);
      s.targetAI.revive(target);
    }
    if(u.kind==='karl') u.special.posId='a';
    for(let i=0;i<o.requiredRounds;i++) s.director.onFire(u,u.pieces[0],{id:`test-${u.id}-${i}`});
    // Use the real calibre/fuze/target damage tables at each surviving target part.
    for(let i=0;i<100 && o.damage<o.requiredDamage;i++) {
      const part=target.parts.find(p=>p.alive);assert.ok(part,`${def.id}: insufficient damage credit for ${u.kind}`);
      s.targetAI.applyBurst({id:`hit-${i}`,kind:u.kind,unitId:u.id,fuze:o.fuze}, {x:part.x,y:0,z:part.z},false);
    }
    // No completion while any other battery still has work.
    const missing=s.campaignObjectives.some(q=>q!==o&&!q.done&&q.damage<q.requiredDamage);
    s.director.update(0);
    if(missing)assert.equal(s.state,'playing');
  }
  s.director.update(0);
  assert.equal(s.state,'victory',`${def.id}: all qualified objectives must win`);
}
console.log(`All ${CAMPAIGN.length} mission victory paths passed using the real damage tables and launch qualification checks.`);

// Assembly remains exclusive to the dedicated operation, including after restarting it.
for (const op of ['sevastopol', 'flanders']) {
  const s = new Sim({heightAt:()=>0,theatre:ww2Theatre(op)});
  for (let attempt=0;attempt<2;attempt++) {
    s.newGame({seed:123});
    const gustav=s.units.find(u=>u.kind==='gustav');
    assert.equal(gustav.special.ready,op!=='sevastopol',`${op}: correct assembly state after reset`);
    assert.equal(gustav.gate,op==='sevastopol'?'railway preparation':null);
  }
}
console.log('Gustav starts assembled in campaign/sandbox; Sevastopol retains assembly.');

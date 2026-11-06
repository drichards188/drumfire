import assert from 'node:assert/strict';
import { Progression, SAVE_KEY } from '../src/progression.js';
import { TREES, LINES, nodeOf, PARTS, maxGuns, loadoutOf, modsOf, maxedLevels, opposition, battleReward, missionBonus, isOffmap } from '../src/research.js';
import { SLOTS, MAX_LEVEL, threatOf } from '../src/threat.js';
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
assert.deepEqual(DE.filter(k=>career.unlocked(k)), ['rk92'], 'A new career owns the 15 cm Ringkanone C/92 alone');
assert.equal(career.targetOf('de'), 'fk16', 'A new career researches the cheapest open battery (the FK 16)');
assert.equal(career.targetOf('ww1'), 'fk16', 'The 1918 and the WW2 eras share the German tree');
// only rank I lines are open from the start; a line that starts higher opens with its `via`, in the line beside it
{
  const ids = LINES.de.map((l) => l.id);
  for (const n of TREES.de.filter((q) => !q.after)) {
    if (n.tier === 1) { assert.ok(!n.via, `${n.kind}: a rank I line needs nothing`); assert.equal(career.researchBlock(n.kind) === '' || career.owns(n.kind), true, `${n.kind} is open from the start`); continue; }
    const v = nodeOf(n.via);
    assert.ok(v && v.line !== n.line, `${n.kind}: a line above rank I names a battery of another line`);
    assert.equal(Math.abs(ids.indexOf(v.line) - ids.indexOf(n.line)), 1, `${n.kind}: its via stands in the column beside it`);
    assert.ok(career.researchBlock(n.kind), `${n.kind} is closed to a new career`);
  }
  assert.ok(TREES.de.every((n) => career.researchBlock(n.kind) === '' ? n.tier === 1 : true), 'A new career can research nothing above rank I');
}
// every mission, operation and lesson is open from the start, in any order
assert.ok(CAMPAIGN.every(m=>career.canPlay(m.id)), 'Every mission must be open from the start');
assert.equal(career.canPlay('earn-nothing'), false);
assert.ok(menuItems(career).every(i=>!i.locked), 'No menu entry may be locked');
// a campaign mission is a one-off RP challenge: its first win pays the research target, the RP over a battery's cost
// going on down its line
assert.equal(career.complete('earn-v1'), 1500);
assert.deepEqual([...career.researched].sort(), ['fk16','sfh13','sfh93'], '1,500 RP research the FK 16 (300), the sFH 93 (350) and the sFH 13 (450)');
assert.equal(career.targetOf('de'), 'lefh18', 'The rest goes on down the line');
assert.equal(career.costLeft('lefh18'), 600 - 400);
assert.equal(career.complete('earn-v1'), 0, 'Only the first win pays');
assert.equal(career.unlocked('v1'), false, 'A mission win grants no battery');
// research: in line order, anywhere in the tree, the target picked on the Research screen
assert.match(career.researchBlock('mrs18'), /21 cm Mörser 16 first/);
assert.match(career.researchBlock('m16'), /21 cm Mörser 99 first/);
assert.equal(career.setTarget('mrs18'), false, 'Only a battery that can be researched now');
assert.equal(career.setTarget('rk92'), false, 'Nor one already researched');
assert.equal(career.setTarget('m16'), false, 'The Mörser 16 now follows the Mörser 99');
assert.equal(career.setTarget('m99'), true, 'The first of any line is open');
assert.equal(career.research('m99'), false, 'Research takes the RP (unless points are unlimited)');
assert.equal(career.reward('ww1', { rp: 300, batteries: { rk92: 1000, m99: 50 } }), true);
assert.equal(career.costLeft('m99'), 600 - 300);
assert.equal(career.costLeft('lefh18'), 200, 'Progress on a battery left for another is kept');
assert.equal(career.bp.rk92, 1000);
assert.equal(career.bp.m99, 50, 'Points of a battery not yet researched are kept for it');
assert.equal(career.battles.de, 1);
// upgrades: paid in the battery's own points, in any order
assert.equal(career.level('rk92','guns'), 1, 'A battery starts with one gun');
assert.equal(career.upgrade('rk92','shells'), true);
assert.equal(career.upgrade('rk92','guns'), true);
assert.equal(career.upgrade('rk92','guns'), false, 'The C/92 has two pits');
assert.equal(career.upgradeBlock('rk92','guns'), 'at its best');
assert.equal(career.bp.rk92, 1000 - 80 - 120);
assert.equal(career.upgrade('m99','shells'), false, 'An unresearched battery cannot be upgraded');
const reread = new Progression(storage);
assert.deepEqual([reread.level('rk92','guns'), reread.bp.rk92, reread.targetOf('de'), reread.costLeft('m99')], [2, 800, 'm99', 300], 'Levels, points, target and progress survive a reload');
for (let i = 0; i < 4; i++) assert.equal(reread.upgrade('rk92','barrel'), i < 3, 'Three barrel levels (80 + 170 + 300), then at its best');
assert.equal(reread.bp.rk92, 800 - 550);
// the open battle's lineup: the researched batteries with their levels
const bde = reread.battle('ww1');
assert.deepEqual(Object.keys(bde.loadout).sort(), ['fk16','rk92','sfh13','sfh93']);
assert.equal(bde.loadout.rk92.guns, 2);
assert.equal(bde.loadout.sfh13.guns, 1);
assert.equal(bde.loadout.rk92.mods.dmg, 1.12);
assert.equal(bde.loadout.rk92.mods.disp, 0.6, 'Barrel at its top');
assert.ok(bde.opposition.cb < 1 && bde.opposition.assault < 1, 'A small lineup meets a lighter enemy');
// dev mode lays every battery at its top over the career, which it does not change
reread.setDev(true);
const dev = reread.battle('de');
assert.deepEqual(Object.keys(dev.loadout).sort(), [...reread.lineupKinds('de')].sort(), 'Dev mode fields its lineup (5 and 1), every battery open to it');
assert.ok(Object.entries(dev.loadout).every(([k,l]) => l.guns === maxGuns(k) && Math.abs(l.mods.load - 0.72 * 0.9) < 1e-12 && l.mods.crew === 0.75));
assert.ok(dev.opposition.cb < 1 && dev.opposition.assault < 1, 'Five batteries of the tree meet a lighter enemy (a threat level replaces it in battle)');
assert.equal(reread.level('rk92','guns',false), 2);
// the saves before the German tree are not carried over: a new career
const v3 = new Progression(mk([['drumfire.campaign.v3', JSON.stringify({ researched: ['k18','gustav'], rp: { ww2: 9999 }, devSet: true, dev: false })]]));
assert.deepEqual([v3.researched.size, v3.rp.de, v3.dev], [0, 0, false]);
assert.equal(SAVE_KEY, 'drumfire.campaign.v4');
// a career saved before the C/92 headed the guns' line started with the K 17 and keeps it; a new save is marked
{
  const old = new Progression(mk([[SAVE_KEY, JSON.stringify({ researched: ['fk16'], bp: { k17: 70 }, levels: { k17: { guns: 2 } } })]]));
  assert.ok(old.owns('k17') && old.owns('rk92') && old.owns('fk16'), 'An older career keeps its K 17 and gets the C/92');
  assert.deepEqual([old.level('k17', 'guns', false), old.bp.k17], [2, 70]);
  const st = mk(); new Progression(st).save();
  assert.ok(!new Progression(st).owns('k17'), 'A new career does not own the K 17');
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
  assert.equal(c.research('m16'), false, 'The Mörser 99 comes first');
  assert.match(c.researchBlock('m99'), /15 cm sFH 13 first/, 'The mortars open with the sFH 13 beside them');
  assert.equal(c.research('m99'), false);
  for (const k of ['fk16', 'sfh93', 'sfh13']) assert.equal(c.research(k), true);
  assert.equal(c.research('m99'), true);
  assert.equal(c.research('m16'), true);
  assert.equal(c.research('mrs18'), true);
  assert.equal(c.rp.de, 0, 'Nothing is spent');
  for (let i = 0; i < 3; i++) assert.equal(c.upgrade('rk92', 'shells'), true);
  assert.equal(c.bp.rk92 ?? 0, 0);
  assert.equal(new Progression(st).free, true, 'The switch survives a reload');
  // the career reset: back to a new career, the switches kept
  c.setDev(true);
  c.complete('earn-k18'); c.reward('ww1', { rp: 50, batteries: { rk92: 30 } });
  c.reset();
  const r = new Progression(st);
  assert.deepEqual([r.researched.size, r.completed.size, r.rp.de, r.battles.de, r.level('rk92', 'shells', false), r.bp.rk92 ?? 0, r.targetOf('de')], [0, 0, 0, 0, 0, 0, 'fk16']);
  assert.deepEqual([r.dev, r.free], [true, true], 'The switches stay');
  assert.equal(r.complete('earn-k18'), 550, 'A campaign mission pays its bonus again after a reset');
  // everything researched: the RP wait for the next battery the tree gets
  r.setFree(false);
  r.reward('de', { rp: 1e6, batteries: {} });
  assert.deepEqual([r.researched.size, r.targetOf('de')], [DE.length - 1, null]);
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
  assert.match(c.lineupBlock('v1'), /off-map slot is taken/);
  // a swap from the slot bar: in the slot of the one it replaces, from the bench of its own kind of slot
  const before = c.lineupKinds('de'), slot = before.indexOf('k17');
  assert.ok(!c.benchOf('de', false).some((k) => before.includes(k) || isOffmap(k)) && c.benchOf('de', true).every(isOffmap));
  assert.equal(c.swapLineup('k17', 'v1'), false, 'An off-map weapon cannot take a slot on the map');
  assert.equal(c.swapLineup('k17', 'hummel'), false, 'nor a battery already in the lineup');
  assert.equal(c.swapLineup('k17', 'm16'), true);
  assert.deepEqual(c.lineupKinds('de'), before.map((k, i) => (i === slot ? 'm16' : k)), 'The swap keeps the slot');
  assert.equal(c.swapLineup('v2', 'v1'), true);
  assert.ok(c.inLineup('v1') && !c.inLineup('v2') && c.lineupKinds('de').length === SLOTS.map + SLOTS.support);
  c.setDev(false);
  assert.deepEqual(c.lineupKinds('de'), ['rk92'], 'A new career fields its C/92');
  assert.match(c.lineupBlock('rk92'), /needs a battery/);
  assert.match(c.lineupBlock('sfh13'), /research it first/);
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
  c.gain('ww1', { rp: 100, batteries: { rk92: 40 } });
  c.gain('ww1', { rp: 60, batteries: { rk92: 25 } });
  assert.deepEqual([c.bp.rk92, c.costLeft('fk16'), c.battles.de], [65, 300 - 160, b0], 'Live pay adds up without counting battles');
  c.countBattle('ww1');
  assert.equal(new Progression(st).battles.de, b0 + 1);
  assert.equal(new Progression(st).bp.rk92, 65, 'Live pay is saved as it comes');
  // a level's pay scales the battle's
  assert.equal(battleReward({ units: [], earned: {}, time: 600, level: threatOf(10) }, { won: true }).rp, Math.round(40 * 4) + Math.round(400 * 4));
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
console.log('Research checks passed: the German tree, research target and line order, RP challenges, upgrades, saves, dev overlay, lineup in the sim, pay.');
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

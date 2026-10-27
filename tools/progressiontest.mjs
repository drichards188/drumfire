import assert from 'node:assert/strict';
import { Progression, SAVE_KEY, OLD_KEY } from '../src/progression.js';
import { TREES, PARTS, maxGuns, loadoutOf, modsOf, maxedLevels, opposition, battleReward, missionBonus } from '../src/research.js';
import { GUNS } from '../src/sim/tables.js';
import { BATTERIES, CAMPAIGN } from '../src/campaign-data.js';
import { campaignTheatre } from '../src/campaign.js';
import { Sim } from '../src/sim/sim.js';
import { ww2Theatre } from '../src/ww2/theatre.js';
import { menuItems } from '../src/menuItems.js';
const storage = { data: new Map(), getItem(k) { return this.data.get(k); }, setItem(k,v) { this.data.set(k,v); } };
const career = new Progression(storage);
assert.equal(career.dev, true, 'Dev mode is on by default');
assert.ok(BATTERIES.every(b=>career.unlocked(b.kind)), 'Dev mode by default fields every battery');
career.setDev(false);
assert.equal(new Progression(storage).dev, false, 'Switching dev mode off must survive a reload');
assert.deepEqual(BATTERIES.filter(b=>career.unlocked(b.kind)).map(b=>b.kind), ['bl6','lefh18']);
// every mission, operation and lesson is open from the start, in any order
assert.ok(CAMPAIGN.every(m=>career.canPlay(m.id)), 'Every mission must be open from the start');
assert.equal(career.canPlay('earn-nothing'), false);
assert.ok(menuItems(career).every(i=>!i.locked), 'No menu entry may be locked');
// a campaign mission is a one-off RP challenge: its first win pays, it grants no battery
assert.equal(career.complete('earn-rail'), missionBonus(CAMPAIGN.find(m=>m.id==='earn-rail')), 'A later mission may be won first');
assert.equal(career.unlocked('rail'), false, 'A mission win no longer grants its battery');
assert.equal(career.complete('earn-bl60'), 500);
assert.equal(career.complete('earn-bl60'), 0, 'Only the first win pays');
assert.equal(career.rp['1917'], 1500);
assert.equal(new Progression(storage).completed.has('earn-rail'), true, 'Wins out of order must survive a reload');
assert.equal(new Progression(storage).rp['1917'], 1500, 'RP must survive a reload');
// research: in tree order, paid in RP
assert.match(career.researchBlock('bl15'), /9\.2-inch howitzers first/);
assert.match(career.researchBlock('rail'), /60-pounders first/);
assert.equal(career.research('bl15'), false);
assert.equal(career.research('bl92'), true);
assert.equal(career.rp['1917'], 1500 - 450);
assert.match(career.researchBlock('bl15'), /RP short/);
assert.equal(career.research('bl15'), false, 'Research needs the RP');
assert.equal(career.unlocked('bl92'), true);
assert.equal(career.research('bl92'), false, 'Nothing is researched twice');
// upgrades: paid in the battery's own points, in any order
assert.equal(career.level('bl6','guns'), 1, 'A battery starts with one gun');
assert.match(career.upgradeBlock('bl6','guns'), /points short/);
assert.equal(career.reward('1917', { rp: 300, batteries: { bl6: 1000, bl92: 50, rail: 999 } }), true);
assert.equal(career.rp['1917'], 1050 + 300);
assert.equal(career.bp.bl6, 1000);
assert.equal(career.bp.rail, 999, 'Points of a battery not yet researched are kept for it');
assert.equal(career.upgrade('bl6','shells'), true);
assert.equal(career.upgrade('bl6','guns'), true);
assert.equal(career.upgrade('bl6','guns'), true);
assert.equal(career.level('bl6','guns'), 3);
assert.equal(career.level('bl6','shells'), 1);
assert.equal(career.bp.bl6, 1000 - 80 - 120 - 240);
assert.equal(career.upgrade('rail','shells'), false, 'An unresearched battery cannot be upgraded');
const reread = new Progression(storage);
assert.equal(reread.level('bl6','guns'), 3, 'Levels survive a reload');
assert.equal(reread.bp.bl6, 560);
assert.equal(reread.researched.has('bl92'), true);
for (let i = 0; i < 4; i++) assert.equal(reread.upgrade('bl6','barrel'), i < 3, 'Three barrel levels (80 + 170 + 300), then at its best');
assert.equal(reread.bp.bl6, 10);
assert.equal(reread.upgradeBlock('bl6','barrel'), 'at its best');
assert.equal(reread.upgradeCost('bl6','guns'), 360);
// the open battle's lineup: the researched batteries with their levels
const b1917 = reread.battle('1917');
assert.deepEqual(Object.keys(b1917.loadout).sort(), ['bl6','bl92']);
assert.equal(b1917.loadout.bl6.guns, 3);
assert.equal(b1917.loadout.bl92.guns, 1);
assert.equal(b1917.loadout.bl6.mods.dmg, 1.12);
assert.equal(b1917.loadout.bl6.mods.disp, 0.6, 'Barrel at its top');
assert.ok(b1917.opposition.cb < 1 && b1917.opposition.assault < 1, 'A small lineup meets a lighter enemy');
// dev mode lays every battery at its top over the career, which it does not change
reread.setDev(true);
const dev = reread.battle('ww2');
assert.deepEqual(Object.keys(dev.loadout).sort(), TREES.ww2.map(n=>n.kind).sort());
assert.ok(Object.entries(dev.loadout).every(([k,l]) => l.guns === maxGuns(k) && Math.abs(l.mods.load - 0.72 * 0.9) < 1e-12 && l.mods.crew === 0.75));
assert.deepEqual(dev.opposition, { cb: 1, assault: 1 });
assert.equal(reread.level('bl6','guns',false), 3);
// a v2 save carries over: its missions stay won and the batteries they earned stay researched
const v2 = { data: new Map([[OLD_KEY, JSON.stringify({ completed: ['earn-bl92','earn-k18','earn-v1'], dev: false, devSet: true })]]), getItem(k) { return this.data.get(k); }, setItem(k,v) { this.data.set(k,v); } };
const moved = new Progression(v2);
assert.equal(moved.dev, false);
assert.deepEqual([...moved.researched].sort(), ['bl92','k18']);
assert.equal(moved.completed.size, 3);
assert.equal(moved.rp['1917'] + moved.rp.ww2, 0, 'Missions won before RP pay no RP again');
assert.equal(moved.unlocked('k18'), true);
assert.equal(moved.unlocked('sfh18'), false);
const old = new Progression({ getItem(k) { return k === SAVE_KEY ? null : '{"xp":999999}'; } });
old.setDev(false);
assert.equal(old.unlocked('rail'), false, 'XP must never unlock campaign batteries');
career.unlockAll();
assert.ok(BATTERIES.every(b=>new Progression(storage).unlocked(b.kind)));
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
  const st = { data: new Map(), getItem(k) { return this.data.get(k); }, setItem(k,v) { this.data.set(k,v); } };
  const c = new Progression(st);
  c.setFree(true);
  assert.match(c.researchBlock('bl15'), /9\.2-inch howitzers first/, 'The tree order still holds');
  assert.equal(c.research('bl92'), true);
  assert.equal(c.rp['1917'], 0, 'Nothing is spent');
  for (let i = 0; i < 3; i++) assert.equal(c.upgrade('bl6', 'shells'), true);
  assert.equal(c.bp.bl6 ?? 0, 0);
  assert.equal(new Progression(st).free, true, 'The switch survives a reload');
  c.setFree(false);
  assert.match(c.researchBlock('bl60'), /RP short/);
  // the career reset: back to a new career, the switches kept
  c.setDev(true); c.setFree(true);
  c.complete('earn-bl60'); c.reward('1917', { rp: 50, batteries: { bl6: 30 } });
  c.reset();
  const r = new Progression(st);
  assert.deepEqual([r.researched.size, r.completed.size, r.rp['1917'], r.battles['1917'], r.level('bl6', 'shells', false), r.bp.bl6 ?? 0], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([r.dev, r.free], [true, true], 'The switches stay');
  assert.equal(r.complete('earn-bl60'), 500, 'A campaign mission pays its bonus again after a reset');
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
console.log('Research checks passed: RP challenges, research order and cost, upgrades, saves, v2 migration, dev overlay, lineup in the sim, pay.');
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

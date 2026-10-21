import assert from 'node:assert/strict';
import { Progression, SAVE_KEY } from '../src/progression.js';
import { BATTERIES, CAMPAIGN } from '../src/campaign-data.js';
import { campaignTheatre } from '../src/campaign.js';
import { Sim } from '../src/sim/sim.js';
import { ww2Theatre } from '../src/ww2/theatre.js';
import { menuItems } from '../src/menuItems.js';
const storage = { data: new Map(), getItem(k) { return this.data.get(k); }, setItem(k,v) { this.data.set(k,v); } };
const career = new Progression(storage);
assert.deepEqual(BATTERIES.filter(b=>career.unlocked(b.kind)).map(b=>b.kind), ['bl6','lefh18']);
// every mission, operation and lesson is open from the start, in any order
assert.ok(CAMPAIGN.every(m=>career.canPlay(m.id)), 'Every mission must be open from the start');
assert.equal(career.canPlay('earn-nothing'), false);
assert.ok(menuItems(career).every(i=>!i.locked), 'No menu entry may be locked');
assert.equal(career.complete('earn-rail'), true, 'A later mission may be won first');
assert.equal(career.unlocked('rail'), true);
assert.equal(career.unlocked('bl92'), false, 'A win earns only its own battery');
assert.equal(career.complete('earn-bl60'), true);
assert.equal(career.complete('earn-bl60'), false);
assert.equal(career.unlocked('bl60'), true);
assert.equal(new Progression(storage).unlocked('bl60'), true);
assert.equal(new Progression(storage).unlocked('rail'), true, 'Wins out of order must survive a reload');
const old = new Progression({ getItem(k) { return k === SAVE_KEY ? null : '{"xp":999999}'; } });
assert.equal(old.unlocked('rail'), false, 'XP must never unlock campaign batteries');
career.unlockAll();
assert.ok(BATTERIES.every(b=>new Progression(storage).unlocked(b.kind)));
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

import assert from 'node:assert/strict';
import test from 'node:test';
import '../scripts/arcanum-conditions.js';
const rules=globalThis.DND_ARCANUM_CONDITIONS;
const copy=value=>JSON.parse(JSON.stringify(value));
const target=(id='target',extra={})=>({id,visible:true,distanceFeet:30,flesh:true,hears:true,understands:true,save:{roll:3,bonus:2},...extra});
const input=(spell='eyebite',extra={})=>({spell,castId:'cast-one',casterId:'caster',dc:16,mode:'asleep',targets:[target()],order:'Отнесите письмо на почту.',reasonable:true,harmful:false,...extra});
function cast(spell,extra){const p=rules.planCast(input(spell,extra));assert.equal(p.ok,true,p.reason);return rules.applyPlan(null,p).state;}
function event(state,type,extra={}){const p=rules.planEvent(state,{type,eventId:'event-'+state.revision,...extra});assert.equal(p.ok,true,p.reason);return rules.applyPlan(state,p).state;}
function save(state,turn,total){return event(state,'endTurn',{targetId:'target',turnId:turn,save:{total}});}

test('manual save inputs calculate advantage and never invent missing rolls or natural auto-success',()=>{
  assert.equal(rules.saveTotal({roll:20,bonus:-10}),10);
  assert.equal(rules.saveTotal({roll:1,bonus:20}),21);
  assert.equal(rules.saveTotal({roll:3,secondRoll:18,bonus:2,mode:'advantage'}),20);
  assert.equal(rules.saveTotal({roll:3,secondRoll:18,bonus:2,mode:'disadvantage'}),5);
  for(const s of [null,{},false,{roll:0,bonus:0},{roll:21,bonus:0},{roll:2,bonus:0,mode:'advantage'},{total:null},{total:''}])assert.equal(rules.saveTotal(s),null);
});
test('missing initial rolls return all requests and leave every input unchanged',()=>{
  const data=input('massSuggestion',{targets:[target('a',{save:null}),target('b',{save:null})]}),before=copy(data);
  const p=rules.planCast(data);assert.equal(p.ok,false);assert.deepEqual(p.requests.map(r=>r.targetId),['a','b']);assert.deepEqual(data,before);
  assert.equal(rules.applyPlan(null,p).ok,false);
});
test('all spells require explicitly visible targets in range and no unknown flesh/communication facts',()=>{
  for(const [spell,extra]of [['eyebite',{visible:false}],['eyebite',{distanceFeet:61}],['fleshToStone',{flesh:undefined}],['massSuggestion',{hears:false}],['massSuggestion',{understands:false}]]){
    assert.equal(rules.planCast(input(spell,{targets:[target('target',extra)]})).ok,false);
  }
});
test('Eyebite keeps source-owned sleep until actual damage or another creature spends its action',()=>{
  const s=cast('eyebite'),before=copy(s);assert.deepEqual(rules.effects(s)[0].conditions,['unconscious']);
  assert.equal(rules.planEvent(s,{eventId:'zero',type:'damage',targetId:'target',amount:0}).ok,false);
  assert.equal(rules.planEvent(s,{eventId:'self',type:'wake',targetId:'target',actorId:'target'}).ok,false);
  const p=rules.planEvent(s,{eventId:'wake',type:'wake',targetId:'target',actorId:'friend'});assert.equal(p.actionCost,1);assert.equal(p.resourceCost,0);
  assert.equal(rules.applyPlan(s,p).effects.length,0);assert.deepEqual(s,before);
  assert.equal(rules.effects(event(s,'damage',{targetId:'target',amount:1,sourceId:'enemy'})).length,0);
});
test('Eyebite panic requires both 60 feet and loss of sight, retains a forced Dash descriptor',()=>{
  let s=cast('eyebite',{mode:'panicked'});const fx=rules.effects(s)[0];assert.deepEqual(fx.conditions,['frightened']);assert.equal(fx.mustDashAway,true);assert.equal(fx.fearSourceId,'caster');
  s=event(s,'position',{targetId:'target',distanceFeet:59,canSeeCaster:false});assert.equal(rules.effects(s).length,1);
  s=event(s,'position',{targetId:'target',distanceFeet:60,canSeeCaster:true});assert.equal(rules.effects(s).length,1);
  s=event(s,'position',{targetId:'target',distanceFeet:60,canSeeCaster:false});assert.equal(rules.effects(s).length,0);
});
test('Eyebite sickened is not poisoned; optional WIS repeat ends it and blocks later retarget',()=>{
  let s=cast('eyebite',{mode:'sickened'});assert.deepEqual(rules.effects(s)[0].conditions,[]);assert.deepEqual(rules.effects(s)[0].disadvantage,{attack:true,ability:true});
  assert.equal(rules.pendingSaves(s,'target','turn-1')[0].ability,'wis');
  const p=rules.planEvent(s,{eventId:'missing',type:'endTurn',targetId:'target',turnId:'turn-1'});assert.equal(p.ok,false);assert.equal(p.requests[0].optional,true);
  s=event(s,'endTurn',{targetId:'target',turnId:'turn-1',decline:true});assert.equal(rules.pendingSaves(s,'target','turn-1').length,0);
  s=save(s,'turn-2',10);assert.equal(rules.effects(s).length,1);
  s=save(s,'turn-3',16);assert.equal(rules.effects(s).length,0);assert.deepEqual(s.immuneTargetIds,['target']);
  assert.equal(rules.planRetarget(s,{eventId:'retarget',target:target(),mode:'asleep'}).ok,false);
});
test('Eyebite initial success prevents targeting only within the same casting',()=>{
  const s=cast('eyebite',{targets:[target('target',{save:{total:16}})]});assert.equal(s.concentration,true);assert.equal(rules.effects(s).length,0);
  assert.equal(rules.planRetarget(s,{eventId:'again',target:target(),mode:'asleep'}).ok,false);
  assert.equal(rules.effects(cast('eyebite',{castId:'new-cast'})).length,1);
});
test('Eyebite retarget preserves previous victims, costs an action but no spell resource, guards duplicate payment',()=>{
  const s=cast('eyebite'),p=rules.planRetarget(s,{eventId:'gaze-2',target:target('other'),mode:'panicked'});
  assert.equal(p.ok,true);assert.equal(p.resourceCost,0);assert.equal(p.actionCost,1);
  const n=rules.applyPlan(s,p).state;assert.equal(rules.effects(n).length,2);assert.equal(rules.applyPlan(n,p).ok,false);
  assert.equal(rules.planRetarget(n,{eventId:'gaze-2',target:target('third'),mode:'asleep'}).ok,false);
  assert.equal(rules.effects(event(n,'concentrationBroken')).length,0);
});
test('Eyebite asleep/frightened immunities bypass unnecessary saves; poison immunity does not block sickened',()=>{
  for(const [mode,immuneCondition]of [['asleep','unconscious'],['panicked','frightened']]){
    const s=cast('eyebite',{mode,targets:[target('target',{save:null,immuneConditions:[immuneCondition]})]});assert.equal(rules.effects(s).length,0);
  }
  assert.equal(rules.effects(cast('eyebite',{mode:'sickened',targets:[target('target',{immuneConditions:['poisoned']})]})).length,1);
  assert.equal(rules.effects(cast('eyebite',{targets:[target('target',{immuneSleep:true,save:null})]})).length,0);
});
test('Flesh to Stone initially restrains; first failure is not one of the three subsequent failures',()=>{
  let s=cast('fleshToStone');assert.equal(s.targets[0].failures,0);assert.deepEqual(rules.effects(s)[0].conditions,['restrained']);
  s=save(s,'t1',1);s=save(s,'t2',1);assert.equal(s.targets[0].failures,2);assert.equal(s.targets[0].mode,'restrained');
  s=save(s,'t3',1);assert.equal(s.targets[0].mode,'petrified');assert.deepEqual(rules.effects(s)[0].conditions,['petrified']);assert.equal(rules.pendingSaves(s,'target','t4').length,0);
});
test('Flesh to Stone cumulative successes do not reset after failures and three end the whole cast',()=>{
  let s=cast('fleshToStone');for(const [turn,total]of [['t1',16],['t2',2],['t3',17],['t4',3],['t5',19]])s=save(s,turn,total);
  assert.equal(s.targets[0].successes,3);assert.equal(s.targets[0].failures,2);assert.equal(s.status,'ended');assert.equal(s.concentration,false);assert.equal(rules.effects(s).length,0);
});
test('Flesh to Stone refuses missing/duplicate end-turn saves and survives serialization',()=>{
  let s=cast('fleshToStone'),before=copy(s);const missing=rules.planEvent(s,{eventId:'turn',type:'endTurn',targetId:'target',turnId:'t1'});
  assert.equal(missing.ok,false);assert.equal(missing.requests[0].ability,'con');assert.deepEqual(s,before);
  s=save(s,'t1',2);s=copy(s);assert.equal(rules.validate(s),true);
  assert.equal(rules.planEvent(s,{eventId:'double',type:'endTurn',targetId:'target',turnId:'t1',save:{total:2}}).ok,false);assert.equal(s.targets[0].failures,1);
  assert.equal(rules.planEvent(s,{eventId:'decline',type:'endTurn',targetId:'target',turnId:'t2',decline:true}).ok,false);
});
test('Flesh to Stone early concentration interruption reverses petrification; full minute makes it permanent',()=>{
  let s=cast('fleshToStone');for(const t of ['1','2','3'])s=save(s,t,1);
  s=event(s,'elapsed',{seconds:59});assert.equal(rules.effects(s)[0].permanent,false);
  assert.equal(rules.effects(event(s,'concentrationBroken')).length,0);
  s=event(s,'elapsed',{seconds:1});assert.equal(s.status,'permanent');assert.equal(s.concentration,false);assert.equal(rules.effects(s)[0].permanent,true);
  assert.equal(rules.planEvent(s,{type:'concentrationBroken',eventId:'later'}).ok,false);
  assert.equal(rules.effects(event(s,'remove',{targetId:'target'})).length,0);
});
test('Flesh to Stone non-flesh/initial save has no effect, immune petrification never becomes permanent',()=>{
  assert.equal(rules.effects(cast('fleshToStone',{targets:[target('target',{flesh:false,save:null})]})).length,0);
  assert.equal(rules.effects(cast('fleshToStone',{targets:[target('target',{save:{total:16}})]})).length,0);
  let s=cast('fleshToStone',{targets:[target('target',{immuneConditions:['petrified']})]});
  for(const t of ['1','2','3'])s=save(s,t,1);assert.equal(rules.effects(s).length,0);
});
test('Flesh to Stone physical deformities survive reverting and are never confused with ordinary damage',()=>{
  let s=cast('fleshToStone');for(const t of ['1','2','3'])s=save(s,t,1);
  s=event(s,'physicalBreak',{targetId:'target',description:'Отколот палец'});s=event(s,'concentrationBroken');assert.deepEqual(s.targets[0].deformities,['Отколот палец']);
});
test('Mass Suggestion supports twelve independent saves with a shared order, no Charmed condition or concentration',()=>{
  const targets=Array.from({length:12},(_,i)=>target('t'+i,{save:{total:i===11?16:1}}));
  const s=cast('massSuggestion',{targets});assert.equal(rules.effects(s).length,11);assert.equal(s.concentration,false);assert.equal(s.durationSeconds,86400);
  for(const fx of rules.effects(s)){assert.deepEqual(fx.conditions,[]);assert.equal(fx.order,'Отнесите письмо на почту.');}
  assert.equal(rules.planCast(input('massSuggestion',{targets:[...targets,target('13')]})).ok,false);
  assert.equal(rules.planCast(input('massSuggestion',{targets:[targets[0],targets[0]]})).ok,false);
});
test('Mass Suggestion harmful command immediately negates the spell but casting still costs one resource',()=>{
  const p=rules.planCast(input('massSuggestion',{harmful:true,targets:[target('target',{save:null})]}));assert.equal(p.ok,true);assert.equal(p.resourceCost,1);assert.equal(p.effects.length,0);assert.equal(p.next.status,'ended');
  assert.equal(rules.planCast(input('massSuggestion',{harmful:undefined})).ok,false);
  assert.equal(rules.effects(cast('massSuggestion',{targets:[target('target',{immuneConditions:['charmed'],save:null})]})).length,0);
});
test('Mass Suggestion only caster/companion damage breaks the damaged target; independent effects remain',()=>{
  let s=cast('massSuggestion',{targets:[target(),target('other')]});
  s=event(s,'damage',{targetId:'target',amount:2,sourceId:'enemy',sourceIsCompanion:false});assert.equal(rules.effects(s).length,2);
  s=event(s,'damage',{targetId:'target',amount:2,sourceId:'caster'});assert.equal(rules.effects(s).length,1);assert.equal(rules.effects(s)[0].targetId,'other');
  s=event(s,'damage',{targetId:'other',amount:1,sourceId:'friend',sourceIsCompanion:true});assert.equal(s.status,'ended');
});
test('Mass Suggestion task trigger/completion and 24-hour expiry are persisted and independent per target',()=>{
  let s=cast('massSuggestion',{trigger:'Когда откроется почта',targets:[target(),target('other')]});
  assert.equal(rules.effects(s)[0].taskStatus,'waiting');assert.equal(rules.planEvent(s,{type:'taskComplete',eventId:'early',targetId:'target'}).ok,false);
  s=event(s,'taskTriggered',{targetId:'target'});s=copy(s);s=event(s,'taskComplete',{targetId:'target'});assert.equal(rules.effects(s).length,1);
  s=event(s,'elapsed',{seconds:86399});assert.equal(rules.effects(s).length,1);s=event(s,'elapsed',{seconds:1});assert.equal(rules.effects(s).length,0);
});
test('plans are immutable, stale state is rejected even at the same revision, and applied states are independent',()=>{
  const s=cast('eyebite'),before=copy(s),p=rules.planEvent(s,{type:'concentrationBroken',eventId:'end'});assert.deepEqual(s,before);
  const changed=copy(s);changed.targets[0].mode='sickened';assert.equal(rules.applyPlan(changed,p).ok,false);
  const applied=rules.applyPlan(s,p);assert.equal(applied.ok,true);applied.state.targets[0].endedReason='changed';assert.equal(p.next.targets[0].endedReason,'concentrationBroken');
});

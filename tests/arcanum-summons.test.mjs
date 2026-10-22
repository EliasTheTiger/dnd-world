import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const require=createRequire(import.meta.url),summons=require('../scripts/arcanum-summons.js');
const engine=loadRuntimeIntegrationEngine(),catalog=engine.catalogs.foes;
const context={casterId:'warlock',castId:'arcanum:one',round:20,slotLevel:6};
const feyInput={templateId:'foe_wolf',initiativeDie:13,positionConfirmed:true};
const corpse=id=>({id,isCorpse:true,hp:0,creatureType:'гуманоид',size:'Средний',withinRange:true});
const undeadInput=(ids=['body-one'])=>({mode:'create',night:true,corpses:ids.map(corpse),
  initiativeDice:Object.fromEntries(ids.map(id=>[id,11])),
  materials:{graveDirtPot:true,brackishWaterPot:true,onyxStones:ids.map((id,i)=>({id:'onyx-'+i,valueGp:150}))}});
const fey=()=>summons.planConjureFey(context,feyInput,catalog).actors[0];
const undead=()=>summons.planCreateUndead(context,undeadInput(),catalog).actors[0];

test('fey selector filters actual catalog by creature type and exact fractional CR',()=>{
  const selected=summons.feyCandidates(catalog);
  assert.ok(selected.some(row=>row.id==='foe_wolf'));
  assert.ok(selected.some(row=>row.id==='foe_giant_spider'));
  assert.ok(!selected.some(row=>row.id==='foe_ghoul'));
  assert.equal(summons.challengeRating('1/8'),0.125);
  assert.equal(summons.challengeRating(''),null);
  assert.equal(summons.challengeRating('6 or 7'),null);
  assert.equal(summons.challengeRating('1/0'),null);
  const wolf=catalog.find(row=>row.id==='foe_wolf');
  assert.equal(summons.feyCandidates([{...wolf,cr:6}]).length,1);
  assert.equal(summons.feyCandidates([{...wolf,cr:7}]).length,0);
  assert.equal(summons.feyCandidates([{...wolf,cr:7}],7).length,1);
});

test('Conjure Fey creates healthy fey spirit from actual beast with human initiative',()=>{
  const before=JSON.stringify(catalog),plan=summons.planConjureFey(context,feyInput,catalog),actor=plan.actors[0];
  assert.equal(plan.ok,true);assert.equal(actor.creatureType,'фея');
  assert.equal(actor.hp,11);assert.equal(actor.arcanumSummon.initiative.total,15);
  assert.equal(actor.summonedExpiresAtRound,620);assert.equal(actor.summonedByCastId,context.castId);
  assert.equal(actor.combatActions[0].id,'bite');assert.equal(plan.castingRounds,10);
  assert.equal(actor.tags.includes('beast'),false);assert.ok(actor.tags.includes('fey'));
  assert.equal(JSON.stringify(catalog),before);
});

test('missing/invalid initiative, space and creature choice reject before consequences',()=>{
  for(const die of [undefined,null,'',0,21,1.5,'10',NaN])assert.equal(summons.planConjureFey(context,{...feyInput,initiativeDie:die},catalog).ok,false);
  assert.equal(summons.planConjureFey(context,{...feyInput,positionConfirmed:false},catalog).ok,false);
  assert.equal(summons.planConjureFey(context,{...feyInput,templateId:'foe_ghoul'},catalog).ok,false);
  assert.equal(summons.planConjureFey({...context,round:undefined},feyInput,catalog).ok,false);
});

test('concentration loss leaves fey alive, hostile, uncommandable until original one-hour expiry',()=>{
  const actor=fey(),before=JSON.stringify(actor);
  actor.arcanumSummon.command='Охранять дверь';
  const lost=summons.lifecycle(actor,{round:30,concentrationLost:true});
  assert.equal(lost.operation,'update');assert.equal(lost.actor.summonSide,'enemy');
  assert.equal(lost.actor.arcanumSummon.controlled,false);assert.equal(lost.actor.arcanumSummon.command,null);
  assert.equal(lost.actor.arcanumSummon.expiresAtRound,620);
  assert.equal(actor.arcanumSummon.controlled,true);assert.notEqual(JSON.stringify(actor),before);
  assert.equal(summons.lifecycle(lost.actor,{round:619}).operation,'keep');
  assert.equal(summons.lifecycle(lost.actor,{round:620}).operation,'remove');
  assert.equal(summons.lifecycle(lost.actor,{round:31,dismiss:true}).ok,false);
  assert.equal(summons.planCommand(context,{targetIds:[lost.actor.id],command:'Защищай',verbalConfirmed:true,alignmentConfirmed:true},[lost.actor]).ok,false);
});

test('fey vanishes at zero hit points, duration or explicit dispelling; loss alone cannot reset expiry',()=>{
  const actor=fey();
  assert.equal(summons.lifecycle({...actor,hp:0},{round:25}).operation,'remove');
  assert.equal(summons.lifecycle(actor,{round:25,spellEnded:true}).operation,'remove');
  assert.equal(summons.lifecycle(actor,{round:620,concentrationLost:true}).operation,'remove');
  const lost=summons.lifecycle(actor,{round:25,concentrationLost:true}).actor;
  assert.equal(summons.lifecycle(lost,{round:30,concentrationLost:true}).operation,'keep');
});

test('fey commands require hearing and alignment confirmation, cost no action',()=>{
  const actor=fey(),input={targetIds:[actor.id],command:'Защищай нас',verbalConfirmed:true,alignmentConfirmed:true};
  const plan=summons.planCommand(context,input,[actor]);
  assert.equal(plan.ok,true);assert.equal(plan.cost,'none');assert.equal(plan.updates[0].arcanumSummon.command,'Защищай нас');
  assert.equal(actor.arcanumSummon.command,null);
  assert.equal(summons.planCommand(context,{...input,alignmentConfirmed:false},[actor]).ok,false);
  assert.equal(summons.planCommand(context,{...input,verbalConfirmed:false},[actor]).ok,false);
});

test('create undead transforms one to three distinct corpses using actual ghoul stat block',()=>{
  const input=undeadInput(['a','b','c']),before=JSON.stringify(input),plan=summons.planCreateUndead(context,input,catalog);
  assert.equal(plan.ok,true);assert.equal(plan.actors.length,3);assert.equal(plan.corpseUpdates.length,3);
  for(const actor of plan.actors){
    assert.equal(actor.hp,22);assert.equal(actor.arcanumSummon.controlExpiresAtRound,14420);
    assert.equal(actor.summonedByCastId,undefined);assert.equal(actor.summonedExpiresAtRound,undefined);
    assert.equal(actor.createdByCastId,context.castId);assert.equal(actor.arcanumSummon.initiative.total,13);
    const claws=actor.combatActions.find(action=>action.id==='claws');
    assert.equal(claws.attackBonus,4);assert.equal(claws.condition,'Парализованный');
    assert.equal(claws.durationRounds,10);assert.deepEqual(claws.repeatSave,{key:'con',dc:10,when:'end'});
    assert.deepEqual(claws.effectExcludes,{races:['эльф'],creatureTypes:['нежить']});
  }
  assert.deepEqual(plan.consume,[]);assert.equal(JSON.stringify(input),before);
});

test('daylight, living creature, wrong size/type, used corpse, duplicate or too many corpses all reject',()=>{
  const base=undeadInput();
  for(const patch of [{isCorpse:false},{hp:1},{creatureType:'нежить'},{size:'Большой'},{withinRange:false},{animatedByCastId:'prior'}]){
    assert.equal(summons.planCreateUndead(context,{...base,corpses:[{...base.corpses[0],...patch}]},catalog).ok,false);
  }
  for(const ids of [[],['a','a'],['a','b','c','d']])assert.equal(summons.planCreateUndead(context,undeadInput(ids),catalog).ok,false);
  assert.equal(summons.planCreateUndead(context,{...base,night:false},catalog).ok,false);
  assert.equal(summons.planCreateUndead({...context,slotLevel:7},base,catalog).ok,false);
});

test('each corpse needs a separate 150 gp onyx; total price cannot replace separate stones; no consumption',()=>{
  const input=undeadInput(['a','b']);
  const check=materials=>summons.planCreateUndead(context,{...input,materials},catalog);
  assert.equal(check({...input.materials,onyxStones:[{id:'one',valueGp:300}]}).ok,false);
  assert.equal(check({...input.materials,onyxStones:[{id:'one',valueGp:150},{id:'one',valueGp:150}]}).ok,false);
  assert.equal(check({...input.materials,onyxStones:[{id:'one',valueGp:149},{id:'two',valueGp:151}]}).ok,false);
  assert.equal(check({...input.materials,graveDirtPot:false}).ok,false);
  assert.equal(check({...input.materials,brackishWaterPot:false}).ok,false);
  assert.equal(check({...input.materials,onyxStones:[{id:'one',valueGp:'150'},{id:'two',valueGp:150}]}).ok,false);
  assert.deepEqual(check(input.materials).consume,[]);
});

test('missing real ghoul initiative prevents all three creations without mutating any corpse',()=>{
  const input=undeadInput(['a','b','c']),before=JSON.stringify(input);
  delete input.initiativeDice.b;
  const missing=JSON.stringify(input),plan=summons.planCreateUndead(context,input,catalog);
  assert.equal(plan.ok,false);assert.equal(plan.code,'initiative-required');
  assert.equal(JSON.stringify(input),missing);assert.notEqual(before,missing);
  assert.equal(plan.actors,undefined);
});

test('undead remain when concentration ends, expiry loses control without deleting actor',()=>{
  const actor=undead();
  assert.equal(summons.lifecycle(actor,{round:21,concentrationLost:true,spellEnded:true}).operation,'keep');
  const ending=summons.lifecycle(actor,{round:14420});
  assert.equal(ending.operation,'update');assert.equal(ending.actor.arcanumSummon.controlled,false);
  assert.equal(ending.actor.hp,22);assert.equal(ending.actor.summonSide,'enemy');
  assert.equal(summons.lifecycle(ending.actor,{round:50000}).operation,'keep');
  assert.equal(actor.arcanumSummon.controlled,true);
});

test('undead control renewal extends 24 hours from this cast, preserves damage, orders and initiative',()=>{
  const actor=undead();actor.hp=7;actor.arcanumSummon.command='Охраняй лагерь';
  const input={...undeadInput(),mode:'renew',targetIds:[actor.id],withinRange:{[actor.id]:true}};
  const plan=summons.planCreateUndead({...context,castId:'renew',round:14419},input,catalog,[actor]);
  assert.equal(plan.ok,true);assert.deepEqual(plan.actors,[]);assert.equal(plan.updates.length,1);
  const renewed=plan.updates[0];assert.equal(renewed.arcanumSummon.controlExpiresAtRound,28819);
  assert.equal(renewed.hp,7);assert.equal(renewed.arcanumSummon.command,'Охраняй лагерь');
  assert.deepEqual(renewed.arcanumSummon.initiative,actor.arcanumSummon.initiative);
  assert.equal(actor.arcanumSummon.controlExpiresAtRound,14420);
});

test('expired, foreign, dead or distant undead cannot be recovered by renewal',()=>{
  const actor=undead(),input={...undeadInput(),mode:'renew',targetIds:[actor.id],withinRange:{[actor.id]:true}};
  assert.equal(summons.planCreateUndead({...context,round:14420},input,catalog,[actor]).ok,false);
  assert.equal(summons.planCreateUndead({...context,casterId:'other'},input,catalog,[actor]).ok,false);
  assert.equal(summons.planCreateUndead(context,input,catalog,[{...actor,hp:0}]).ok,false);
  assert.equal(summons.planCreateUndead(context,{...input,withinRange:{}},catalog,[actor]).ok,false);
  assert.equal(summons.planCreateUndead(context,{...input,night:false},catalog,[actor]).ok,false);
});

test('one bonus-action command covers all selected undead within 120 feet, without changing unselected actors',()=>{
  const actors=summons.planCreateUndead(context,undeadInput(['a','b','c']),catalog).actors;
  const ids=actors.slice(0,2).map(row=>row.id),input={targetIds:ids,command:'Охраняйте дверь',distancesFeet:Object.fromEntries(ids.map(id=>[id,120]))};
  const plan=summons.planCommand(context,input,actors);
  assert.equal(plan.ok,true);assert.equal(plan.cost,'bonus');assert.equal(plan.updates.length,2);
  assert.ok(plan.updates.every(actor=>actor.arcanumSummon.command==='Охраняйте дверь'));
  assert.ok(actors.every(actor=>actor.arcanumSummon.command===null));
  assert.equal(summons.planCommand(context,{...input,distancesFeet:{...input.distancesFeet,[ids[1]]:121}},actors).ok,false);
  assert.equal(summons.planCommand(context,{...input,targetIds:[ids[0],ids[0]]},actors).ok,false);
  assert.equal(summons.planCommand({...context,round:14420},input,actors).ok,false);
});

test('serialization preserves pending lifecycle boundaries and original human dice',()=>{
  const actors=JSON.parse(JSON.stringify([fey(),undead()]));
  assert.equal(summons.lifecycle(actors[0],{round:620}).operation,'remove');
  assert.equal(summons.lifecycle(actors[1],{round:14420}).reason,'control-expired');
  assert.equal(actors[0].arcanumSummon.initiative.die,13);
  assert.equal(actors[1].arcanumSummon.initiative.die,11);
});

test('fresh summoned copy never inherits catalog runtime damage, effects, control or expenditure',()=>{
  const damaged=JSON.parse(JSON.stringify(catalog.find(row=>row.id==='foe_wolf')));
  Object.assign(damaged,{hp:1,hpTemp:5,activeFx:[{id:'old'}],cond:['Отравленный'],actionState:{bite:{used:true}},summonerId:'old',arcanumSummon:{old:true}});
  const actor=summons.planConjureFey(context,feyInput,[damaged]).actors[0];
  assert.equal(actor.hp,11);assert.equal(actor.hpTemp,0);assert.deepEqual(actor.activeFx,[]);
  assert.deepEqual(actor.cond,[]);assert.deepEqual(actor.actionState,{});assert.equal(actor.summonerId,'warlock');
  assert.equal(damaged.hp,1);assert.equal(damaged.activeFx.length,1);
});

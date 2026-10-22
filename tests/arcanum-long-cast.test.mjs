import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const require=createRequire(import.meta.url),longCast=require('../scripts/arcanum-long-cast.js');
const plain=value=>JSON.parse(JSON.stringify(value)),success=value=>value===true||value?.success===true||value?.ok===true;
const context=(round=1,extra={})=>({casterId:'caster',combatId:'combat',round,turnStamp:'turn-'+round,ownTurn:true,...extra});
const payload={uid:'pending',spellId:'fey',args:['fey','caster'],definitionToken:'definition',paymentMode:'arcanum',paymentToken:'resource'};

test('one-minute casting needs ten actions on ten consecutive own turns and cannot be accelerated',()=>{
  let state=longCast.begin(context(),payload).state;
  assert.equal(state.actionsDone,1);
  for(let round=2;round<=9;round++){
    const duplicate=longCast.advance(state,context(round-1));assert.equal(duplicate.ok,false);
    const progress=longCast.advance(state,context(round));assert.equal(progress.ok,true);assert.equal(progress.complete,false);
    state=progress.state;assert.equal(state.actionsDone,round);
  }
  const final=longCast.advance(state,context(10));assert.equal(final.ok,true);assert.equal(final.complete,true);
  assert.equal(state.actionsDone,9,'completion returns permission to execute the normal spell transaction, not a premature resource spend');
});

test('missing turns, other creatures, another combat and damaged progress reject without changing state',()=>{
  const state=longCast.begin(context(),payload).state,before=plain(state);
  for(const current of [context(3),context(2,{casterId:'other'}),context(2,{combatId:'different'}),context(2,{ownTurn:false}),context(2,{turnStamp:''})])assert.equal(longCast.advance(state,current).ok,false);
  assert.deepEqual(state,before);assert.equal(longCast.advance({...state,actionsDone:10},context(2)).ok,false);
});

test('serialized progress preserves same-turn replay guard and interruption at the next unspent turn',()=>{
  const state=JSON.parse(JSON.stringify(longCast.begin(context(),payload).state));
  assert.equal(longCast.advance(state,context()).ok,false);
  assert.equal(longCast.shouldInterrupt(state,context()),false);
  assert.equal(longCast.shouldInterrupt(state,context(2)),true);
  assert.equal(longCast.shouldInterrupt(state,context(2,{casterId:'opponent'})),false);
  assert.equal(longCast.shouldInterrupt(state,context(2,{combatId:'new'})),true);
});

async function world(name='Conjure Fey',kind='arcanum'){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const caster=Object.assign(e.buildBlank(),{id:'caster',name:'Длительное наложение',cls:kind==='arcanum'?'Колдун':'Волшебник',level:11,ab:{str:10,dex:10,con:14,int:18,wis:12,cha:18}});
  const corpse={...plain(e.catalogs.foes.find(f=>f.id==='foe_goblin_scout')),id:'body',hp:0};
  const items=[{id:'dirt',n:'Горшок с кладбищенской землей',type:'material',cost:'1 зм'},
    {id:'water',n:'Горшок с солоноватой водой',type:'material',cost:'1 зм'},{id:'onyx',n:'Черный оникс',type:'material',cost:'150 зм'}];
  caster.inventory=items.map(it=>({id:it.id,itemId:it.id,qty:1,valueGp:it.id==='onyx'?150:1}));
  e.setState({...e.catalogs,chars:[caster],items:e.catalogs.items.concat(items),foes:e.catalogs.foes.concat([corpse]),activeCharId:caster.id,fxRound:20});
  a.withoutPresentation();e.combatLifecycleApi.quiet();l.quiet();a.characterAdopt(caster);a.applyClassSlots(caster);a.upgradeSpellcastingState(caster);e.guardRandom();
  const sp=e.state().spells.find(row=>e.grimoireApi.grimoireActive(row)&&e.grimoireApi.rules.identity(row)===e.grimoireApi.rules.normalize(name));
  assert.equal(success(await l.select(caster.id,sp.id,kind==='arcanum'?'arcanum':'learn',{circle:6})),true);
  if(kind!=='arcanum')caster.spellbook.find(entry=>entry.spellId===sp.id).prep=true;
  const input=name==='Conjure Fey'?{templateId:'foe_wolf',positionConfirmed:true,initiativeDie:13}:{night:true,mode:'create',targetIds:['body'],
    withinRange:{body:true},initiativeDice:{body:12},dirtEntryId:'dirt',waterEntryId:'water',onyxEntryIds:['onyx']};
  const args=[sp.id,caster.id,'none','',undefined,kind==='arcanum'?'6:arcanum':'6',{},[],{},{arcanum:input}];
  assert.equal(e.combatStart([{kind:'ally',id:caster.id,nat:20},{kind:'foe',id:'foe_goblin_scout',nat:1}],'Минута концентрации'),true);
  const actor=()=>e.state().chars.find(c=>c.id===caster.id),pending=()=>actor().activeFx.find(fx=>fx.arcanumLongCast),summons=()=>e.state().foes.filter(f=>f.arcanumSummon);
  const next=()=>{assert.equal(e.combatNextTurn(),true);assert.equal(e.combatNextTurn(),true);assert.equal(e.state().combat.turn.actorKey,'ally:'+caster.id);};
  const completeInput=()=>({arcanum:{...input,completionFactsConfirmed:true}});
  return {e,a,l,caster,sp,input,args,actor,pending,summons,next,completeInput};
}

test('combat minute start pays only its action, persists concentration and rejects same-turn continuation after reload',async()=>{
  const w=await world(),before=plain(w.caster.slots),started=await w.e.arcanumRuntime.longStart(w.args);
  assert.equal(success(started),true,JSON.stringify(started));assert.equal(w.e.state().combat.turn.actionsUsed,1);
  assert.equal(w.pending().arcanumLongCast.actionsDone,1);assert.equal(w.pending().conc,true);
  assert.equal(w.actor().mysticArcanum.choices[6].spent,false);assert.deepEqual(plain(w.caster.slots),before);assert.equal(w.summons().length,0);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  assert.equal(w.pending().arcanumLongCast.actionsDone,1);
  assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),false);
  w.next();const continued=await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput());assert.equal(success(continued),true,JSON.stringify(continued));
  assert.equal(w.pending().arcanumLongCast.actionsDone,2);assert.equal(w.actor().mysticArcanum.choices[6].spent,false);
});

test('losing concentration or skipping a required action interrupts the minute without spending an arcanum',async()=>{
  for(const mode of ['concentration','skip']){
    const w=await world();assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);
    if(mode==='concentration')w.e.combatLifecycleApi.breakConcentration(w.actor(),'проверка прерывания');
    else {w.next();assert.equal(w.e.combatNextTurn(),true);}
    assert.equal(w.pending(),undefined);assert.equal(w.actor().mysticArcanum.choices[6].spent,false);assert.equal(w.summons().length,0);
    assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),false);
  }
});

test('completion uses the tenth action and existing spell transaction exactly once for fey and undead',async()=>{
  for(const name of ['Conjure Fey','Create Undead']){
    const w=await world(name);assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);
    const startRound=w.e.state().fxRound;
    for(let turn=2;turn<=9;turn++){
      w.next();assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),true);
      assert.equal(w.pending().arcanumLongCast.actionsDone,turn);assert.equal(w.actor().mysticArcanum.choices[6].spent,false);
      if(turn===5){assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();}
    }
    w.next();assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,{arcanum:{...w.input,completionFactsConfirmed:false}})),false);
    assert.equal(w.pending().arcanumLongCast.actionsDone,9);assert.equal(w.e.state().combat.turn.actionsUsed,0);
    const finished=await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput());
    assert.equal(success(finished),true,JSON.stringify(finished));assert.equal(w.pending(),undefined);assert.equal(w.summons().length,1);
    assert.equal(w.actor().mysticArcanum.choices[6].spent,true);assert.equal(w.e.state().combat.turn.actionsUsed,1);
    assert.equal(w.e.state().fxRound,startRound+9,'the combat clock already counted the casting rounds');
    const summoned=w.summons()[0];assert.ok(w.e.state().combat.order.some(row=>row.id===summoned.id),'summon joins initiative immediately');
    assert.equal(summoned.arcanumSummon.createdRound,w.e.state().fxRound);
    if(name==='Create Undead')assert.equal(w.actor().activeFx.some(fx=>fx.conc),false);
    else assert.ok(w.actor().activeFx.some(fx=>fx.arcanumFey&&fx.conc));
    assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),false);assert.equal(w.summons().length,1);
  }
});

test('failed continuation storage rolls its action and progress back and allows the same step to be retried',async()=>{
  const w=await world();assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);w.next();
  const restore=w.l.persistence(async()=>false),failed=await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput());restore();
  assert.equal(success(failed),false);assert.equal(w.pending().arcanumLongCast.actionsDone,1);assert.equal(w.e.state().combat.turn.actionsUsed,0);
  assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),true);assert.equal(w.pending().arcanumLongCast.actionsDone,2);
});

test('failed start storage restores the prior concentration and initial action without spending any spell resource',async()=>{
  const w=await world();w.actor().activeFx.push({uid:'prior-concentration',k:'spell',id:'prior-spell',label:'Прежняя концентрация',casterId:w.caster.id,castId:'prior-cast',conc:true,fx:[]});
  const restore=w.l.persistence(async()=>false),failed=await w.e.arcanumRuntime.longStart(w.args);restore();
  assert.equal(success(failed),false);assert.equal(w.pending(),undefined);assert.equal(w.e.state().combat.turn.actionsUsed,0);
  assert.ok(w.actor().activeFx.some(entry=>entry.uid==='prior-concentration'));assert.equal(w.actor().mysticArcanum.choices[6].spent,false);
  assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);
  assert.equal(w.actor().activeFx.some(entry=>entry.uid==='prior-concentration'),false);assert.equal(w.pending().arcanumLongCast.actionsDone,1);
});

test('failed completion storage restores the ninth-step concentration, tenth action and daily resource together',async()=>{
  const w=await world();assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);
  for(let turn=2;turn<=9;turn++){w.next();assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),true);}
  w.next();const restore=w.l.persistence(async()=>false),failed=await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput());restore();
  assert.equal(success(failed),false);assert.equal(w.pending().arcanumLongCast.actionsDone,9);assert.equal(w.e.state().combat.turn.actionsUsed,0);
  assert.equal(w.actor().mysticArcanum.choices[6].spent,false);assert.equal(w.summons().length,0);
  const completed=await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput());assert.equal(success(completed),true,JSON.stringify(completed));
  assert.equal(w.pending(),undefined);assert.equal(w.summons().length,1);
});

test('changing the arcanum resource or definition while casting cannot silently complete a stale minute',async()=>{
  const w=await world();assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);w.next();
  w.actor().mysticArcanum.revision++;
  assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),false);
  assert.equal(w.e.state().combat.turn.actionsUsed,0);assert.equal(w.summons().length,0);
});

test('Wizard minute completion uses the same durable action boundary for its ordinary sixth-circle slot',async()=>{
  const w=await world('Create Undead','slots');assert.equal(success(await w.e.arcanumRuntime.longStart(w.args)),true);
  for(let turn=2;turn<=9;turn++){w.next();assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),true);}
  w.next();const before=w.actor().slots[6].cur,restore=w.l.persistence(async()=>false);
  assert.equal(success(await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput())),false);restore();
  assert.equal(w.actor().slots[6].cur,before);assert.equal(w.pending().arcanumLongCast.actionsDone,9);
  assert.equal(w.e.state().combat.turn.actionsUsed,0);assert.equal(w.summons().length,0);
  const done=await w.e.arcanumRuntime.longContinue(w.caster.id,w.completeInput());assert.equal(success(done),true,JSON.stringify(done));
  assert.equal(w.actor().slots[6].cur,before-1);assert.equal(w.pending(),undefined);assert.equal(w.summons().length,1);
});

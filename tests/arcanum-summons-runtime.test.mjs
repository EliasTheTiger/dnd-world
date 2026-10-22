import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const success=value=>value===true||value?.success===true||value?.ok===true;
async function world(name='Conjure Fey'){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const caster=Object.assign(e.buildBlank(),{id:'summoner',name:'Призыватель',cls:'Колдун',level:11,ab:{str:10,dex:10,con:14,int:10,wis:12,cha:18}});
  const target=Object.assign(e.buildBlank(),{id:'summons-target',name:'Цель гуля',hp:80,hpMax:80,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10}});
  const items=[{id:'test-dirt',n:'Глиняный горшок с кладбищенской землей',type:'material',cost:'1 зм'},
    {id:'test-water',n:'Глиняный горшок с солоноватой водой',type:'material',cost:'1 зм'},
    {id:'test-onyx',n:'Черный оникс',type:'material',cost:'150 зм'}];
  caster.inventory=[{id:'dirt',itemId:items[0].id,qty:1},{id:'water',itemId:items[1].id,qty:1},
    {id:'onyx',itemId:items[2].id,qty:3,valueGp:150}];
  const corpses=['body-a','body-b','body-c'].map((id,i)=>({...plain(e.catalogs.foes.find(f=>f.id==='foe_goblin_scout')),id,n:'Труп '+(i+1),hp:0}));
  e.setState({...e.catalogs,items:e.catalogs.items.concat(items),chars:[caster,target],foes:e.catalogs.foes.concat(corpses),activeCharId:caster.id,fxRound:20});
  a.withoutPresentation();l.quiet();e.combatLifecycleApi.quiet();
  a.characterAdopt(caster);a.applyClassSlots(caster);a.upgradeSpellcastingState(caster);e.guardRandom();
  const spell=e.state().spells.find(sp=>e.grimoireApi.grimoireActive(sp)&&e.grimoireApi.rules.identity(sp)===e.grimoireApi.rules.normalize(name));
  assert.ok(spell,name);assert.equal(success(await l.select(caster.id,spell.id,'arcanum',{circle:6})),true);
  const input=name==='Conjure Fey'?{castingMinuteCompleted:true,templateId:'foe_wolf',positionConfirmed:true,initiativeDie:14}:
    {castingMinuteCompleted:true,night:true,mode:'create',targetIds:corpses.map(f=>f.id),
      withinRange:Object.fromEntries(corpses.map(f=>[f.id,true])),initiativeDice:Object.fromEntries(corpses.map((f,i)=>[f.id,10+i])),
      dirtEntryId:'dirt',waterEntryId:'water',onyxEntryIds:['onyx','onyx','onyx']};
  const cast=(override=input)=>e.arcanumApi.cast(spell.id,caster.id,'none','',undefined,'6:arcanum',{},[],{}, {arcanum:override});
  return {e,a,l,caster,target,spell,input,cast,corpses,summons:()=>e.state().foes.filter(f=>f.arcanumSummon)};
}

test('actual fey arcanum requests a human initiative and commits one creature, minute, concentration and use',async()=>{
  const w=await world(),before=plain(w.caster.slots),result=await w.cast();
  assert.equal(success(result),true,JSON.stringify(result));assert.equal(w.summons().length,1);
  const actor=w.summons()[0];assert.equal(actor.creatureType,'фея');assert.equal(actor.hp,11);
  assert.equal(actor.arcanumSummon.initiative.die,14);assert.equal(actor.arcanumSummon.initiative.total,16);
  assert.equal(w.e.state().fxRound,30);assert.equal(actor.arcanumSummon.expiresAtRound,630);
  assert.equal(w.caster.mysticArcanum.choices[6].spent,true);assert.deepEqual(plain(w.caster.slots),before);
  assert.ok(w.caster.activeFx.some(fx=>fx.arcanumFey&&fx.castId===actor.summonedByCastId));
  assert.equal(success(await w.cast()),false);assert.equal(w.summons().length,1);
  w.e.combatStart([{kind:'ally',id:w.caster.id,nat:20},{kind:'foe',id:actor.id,nat:actor.arcanumSummon.initiative.die}], 'Инициатива феи');
  const turn=w.e.state().combat.order.find(row=>row.id===actor.id);
  assert.ok(turn);assert.equal(turn.initiative,16);
});

test('incomplete fey casting or missing real initiative leaves time, world and daily use intact',async()=>{
  const w=await world(),before=plain([w.caster,w.e.state().foes,w.e.state().fxRound]);
  for(const patch of [{castingMinuteCompleted:false},{initiativeDie:null},{initiativeDie:0},{positionConfirmed:false},{templateId:'foe_ghoul'}]){
    assert.equal(success(await w.cast({...w.input,...patch})),false);
    assert.deepEqual(plain([w.e.state().chars.find(c=>c.id===w.caster.id),w.e.state().foes,w.e.state().fxRound]),before);
  }
});

test('actual concentration break keeps fey hostile across reload until original deadline',async()=>{
  const w=await world();assert.equal(success(await w.cast()),true);
  const actor=w.summons()[0],id=actor.id;
  w.e.combatLifecycleApi.breakConcentration(w.caster,'Проверка разрыва');
  assert.equal(w.summons().length,1);assert.equal(actor.summonSide,'enemy');assert.equal(actor.arcanumSummon.controlled,false);
  assert.equal(actor.summonedByCastId,undefined);assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  let loaded=w.e.state().foes.find(f=>f.id===id);assert.ok(loaded);assert.equal(loaded.arcanumSummon.expiresAtRound,630);
  w.e.combatLifecycleApi.advanceFxRound(599);assert.ok(w.e.state().foes.find(f=>f.id===id));
  w.e.combatLifecycleApi.advanceFxRound(1);assert.equal(w.e.state().foes.find(f=>f.id===id),undefined);
});

test('actual zero-HP fey is removed without waiting for another round',async()=>{
  const w=await world();assert.equal(success(await w.cast()),true);const actor=w.summons()[0];
  w.e.combatLifecycleApi.applyDamageTo('foe:'+actor.id,actor.hp,'тест',{});
  assert.equal(w.e.state().foes.find(f=>f.id===actor.id),undefined);
});

test('actual undead cast checks inventory count and price instead of trusting forged component evidence',async()=>{
  const w=await world('Create Undead'),actor=w.caster;
  const reject=async()=>{const before=plain([w.e.state().chars,w.e.state().foes,w.e.state().fxRound]);assert.equal(success(await w.cast()),false);assert.deepEqual(plain([w.e.state().chars,w.e.state().foes,w.e.state().fxRound]),before);};
  actor.inventory.find(e=>e.id==='onyx').qty=2;await reject();
  actor.inventory.find(e=>e.id==='onyx').qty=3;actor.inventory.find(e=>e.id==='onyx').valueGp=149;await reject();
  actor.inventory.find(e=>e.id==='onyx').valueGp=150;w.input.dirtEntryId='nonexistent';
  w.input.materials={graveDirtPot:true,brackishWaterPot:true,onyxStones:[{id:'x',valueGp:1000}]};await reject();
  assert.equal(w.summons().length,0);assert.equal(actor.mysticArcanum.choices[6].spent,false);
});

test('actual undead arcanum creates three ghouls, preserves each material and blocks corpse reuse',async()=>{
  const w=await world('Create Undead'),before=plain(w.caster.inventory),result=await w.cast();
  assert.equal(success(result),true,JSON.stringify(result));assert.equal(w.summons().length,3);assert.deepEqual(plain(w.caster.inventory),before);
  assert.equal(w.caster.mysticArcanum.choices[6].spent,true);assert.equal(w.e.state().fxRound,30);
  for(const actor of w.summons()){
    assert.equal(actor.hp,22);assert.equal(actor.arcanumSummon.controlExpiresAtRound,14430);
    assert.equal(actor.summonedByCastId,undefined);assert.equal(actor.combatActions.find(a=>a.id==='claws').repeatSave.dc,10);
  }
  assert.ok(w.corpses.every(corpse=>corpse.animatedByCastId));
  assert.equal(w.e.arcanumRuntime.summonPreflight(w.spell,w.caster,6,{arcanum:w.input}).ok,false);
});

test('undead control expiry persists surviving ghouls and removes previous orders',async()=>{
  const w=await world('Create Undead');assert.equal(success(await w.cast()),true);
  const ids=w.summons().map(f=>f.id),command={targetIds:ids,command:'Охранять дверь',distancesFeet:Object.fromEntries(ids.map(id=>[id,30]))};
  assert.equal(success(await w.e.arcanumRuntime.command(w.caster.id,command)),true);
  assert.ok(w.summons().every(f=>f.arcanumSummon.command===command.command));
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();w.e.combatLifecycleApi.advanceFxRound(14400);
  assert.equal(w.summons().length,3);assert.ok(w.summons().every(f=>f.hp===22&&!f.arcanumSummon.controlled&&f.arcanumSummon.command===null));
  assert.equal(success(await w.e.arcanumRuntime.command(w.caster.id,command)),false);
});

test('three distinct eight-hour rests expire undead control without deleting the ghouls',async()=>{
  const w=await world('Create Undead');assert.equal(success(await w.cast()),true);const start=w.e.state().fxRound;
  for(let dayPart=1;dayPart<=3;dayPart++){
    assert.equal(w.a.longRest(),true);assert.equal(w.e.state().fxRound,start+dayPart*4800);
    assert.equal(w.summons().length,3);assert.ok(w.summons().every(actor=>actor.arcanumSummon.controlled===(dayPart<3)));
  }
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  assert.equal(w.summons().length,3);assert.ok(w.summons().every(actor=>!actor.arcanumSummon.controlled&&actor.hp===22));
});

test('party members completing the same rest share eight hours even across a save and reload',async()=>{
  const w=await world('Create Undead');assert.equal(success(await w.cast()),true);const start=w.e.state().fxRound;
  assert.equal(w.a.longRest(),true);assert.equal(w.e.state().fxRound,start+4800);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  w.e.setState({...w.e.state(),activeCharId:w.target.id});
  assert.equal(w.a.longRest(),true);assert.equal(w.e.state().fxRound,start+4800,'the companion shared the same eight hours');
  assert.ok(w.summons().every(actor=>actor.arcanumSummon.controlled));
  w.e.setState({...w.e.state(),activeCharId:w.caster.id});
  assert.equal(w.a.longRest(),true);assert.equal(w.e.state().fxRound,start+9600,'the same caster resting again starts another rest');
});

test('short and long rests advance elapsed time and expire the summoned fey',async()=>{
  for(const kind of ['short','long']){
    const w=await world();assert.equal(success(await w.cast()),true);const start=w.e.state().fxRound;
    assert.equal(kind==='short'?w.a.shortRest():w.a.longRest(),true);
    assert.equal(w.e.state().fxRound,start+(kind==='short'?600:4800));
    assert.equal(w.summons().length,0);assert.equal(w.caster.activeFx.some(fx=>fx.arcanumFey),false);
    assert.equal(w.caster.mysticArcanum.choices[6].spent,kind==='short');
  }
});

test('renewing existing ghouls after long rest uses one new arcanum and retains their health and initiative',async()=>{
  const w=await world('Create Undead');assert.equal(success(await w.cast()),true);
  const actors=w.summons(),ids=actors.map(row=>row.id),initial=plain(actors.map(row=>row.arcanumSummon.initiative));
  actors[0].hp=7;w.a.longRest();assert.equal(w.caster.mysticArcanum.choices[6].spent,false);
  const beforeRound=w.e.state().fxRound,input={...w.input,mode:'renew',targetIds:ids,withinRange:Object.fromEntries(ids.map(id=>[id,true]))};
  const result=await w.cast(input);assert.equal(success(result),true,JSON.stringify(result));
  assert.equal(w.summons().length,3);assert.equal(w.summons()[0].hp,7);
  assert.deepEqual(plain(w.summons().map(row=>row.arcanumSummon.initiative)),initial);
  assert.ok(w.summons().every(row=>row.arcanumSummon.controlExpiresAtRound===beforeRound+10+14400));
  assert.equal(w.caster.mysticArcanum.choices[6].spent,true);
});

test('one actual bonus action orders all ghouls and prevents a second order during the same turn',async()=>{
  const w=await world('Create Undead');assert.equal(success(await w.cast()),true);const actors=w.summons(),ids=actors.map(row=>row.id);
  w.e.combatStart([{kind:'ally',id:w.caster.id,nat:20},...actors.map(row=>({kind:'foe',id:row.id,nat:row.arcanumSummon.initiative.die}))],'Приказ гулям');
  const input={targetIds:ids,command:'Защитить лагерь',distancesFeet:Object.fromEntries(ids.map(id=>[id,30]))};
  assert.equal(success(await w.e.arcanumRuntime.command(w.caster.id,input)),true);
  assert.equal(w.e.state().combat.turn.bonusUsed,true);assert.equal(w.e.state().combat.turn.actionsUsed,0);
  const before=plain(w.summons());assert.equal(success(await w.e.arcanumRuntime.command(w.caster.id,{...input,command:'Убежать'})),false);
  assert.deepEqual(plain(w.summons()),before);
});

test('failed durable summon write rolls back creature, corpse, time, concentration and arcanum payment',async()=>{
  for(const name of ['Conjure Fey','Create Undead']){
    const w=await world(name),before=plain([w.e.state().chars,w.e.state().foes,w.e.state().fxRound]);
    const restore=w.l.persistence(async()=>false),result=await w.cast();restore();
    assert.equal(success(result),false);assert.deepEqual(plain([w.e.state().chars,w.e.state().foes,w.e.state().fxRound]),before,name);
    assert.equal(success(await w.cast()),true,'same physical results can be safely retried after failed persistence');
  }
});

test('summoned ghoul claws resolve human attack/damage/save then ask its victim for a repeated CON save',async()=>{
  const w=await world('Create Undead');assert.equal(success(await w.cast()),true);
  const ghoul=w.summons()[0],key='ally:'+w.target.id,action=w.e.foeActionOf(ghoul,'claws');
  const spec=w.e.foeActionSpecOf(ghoul,action,w.e.targetInfoOf(key),{within5:true}),values={atk:18,dmg0:4,save:1};
  const outcome=w.e.resolveOutcome(spec,values),rolls=w.a.castFormulaRollsBuild(spec,values,outcome).rolls;
  assert.equal(w.e.foeActionApply(ghoul.id,'claws',key,rolls),true);assert.equal(w.target.hp,74);
  assert.ok(w.e.effectiveConditions(w.target).includes('Парализованный'));
  const entry=w.target.activeFx.find(f=>f.repeatSave);assert.ok(entry);
  w.e.combatStart([{kind:'ally',id:w.target.id,nat:20},{kind:'foe',id:ghoul.id,nat:10}], 'Проверка гуля');
  assert.ok(w.e.arcanumRuntime.pending(key).some(fx=>fx.uid===entry.uid),'actual end-turn path must use persisted repeat-save receipts');
  const saving=w.e.arcanumRuntime.saveSpec(key,entry.repeatSave,entry.label),stamp=w.e.arcanumRuntime.stamp();
  const actual=Object.fromEntries(saving.rows.map(row=>[row.key,20]));
  assert.equal(success(await w.e.arcanumRuntime.repeatCommit(key,entry.uid,stamp,saving,actual)),true);
  assert.equal(w.e.effectiveConditions(w.target).includes('Парализованный'),false);
  assert.equal(success(await w.e.arcanumRuntime.repeatCommit(key,entry.uid,stamp,saving,actual)),false);
});

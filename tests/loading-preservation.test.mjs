import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import persistence from '../scripts/persistence-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const succeeded=value=>value===true||value?.ok===true||value?.success===true;
const envelopeKey='dndworld2:campaign-envelope';
test('an interrupted first boot cannot mistake seed flags for saved heroes',async()=>{
  const engine=loadRuntimeIntegrationEngine();
  for(const name of ['torgar','septih','legerem'])await engine.storeSet('dndworld2:'+name,'1');
  await engine.loadAll();
  const ids=['char_roku','char_torgar','char_septih','char_legerem'];
  assert.deepEqual(plain(engine.state().chars.map(c=>c.id)),ids);
  assert.equal(engine.saveSafety.pending(),false,'first playable state waits for a durable save');
  const raw=await engine.storeGet(envelopeKey),verified=await persistence.verifyEnvelope(JSON.parse(raw));
  assert.equal(verified.ok,true);
  assert.deepEqual(plain(JSON.parse(raw).state.chars.map(c=>c.id)),ids);
  const reloaded=loadRuntimeIntegrationEngine();
  await reloaded.storeSet(envelopeKey,raw);await reloaded.loadAll();
  assert.deepEqual(plain(reloaded.state().chars.map(c=>c.id)),ids);
});

test('a save timer firing during the initial party construction cannot persist a partial party',async()=>{
  const engine=loadRuntimeIntegrationEngine();let intercepted=false,write;
  write=engine.saveSafety.setStorageWriter(async(key,value)=>{
    if(key==='dndworld2:torgar'){
      intercepted=true;
      assert.equal(engine.state().chars.length,2,'simulate the debounce timer while only two of four heroes exist');
      assert.equal(await engine.runScheduledSave(),false);
      assert.equal(await engine.storeGet(envelopeKey),null,'no partial party becomes the authoritative saved campaign');
    }
    return write(key,value);
  });
  await engine.loadAll();assert.equal(intercepted,true);
  assert.deepEqual(JSON.parse(await engine.storeGet(envelopeKey)).state.chars.map(c=>c.id),['char_roku','char_torgar','char_septih','char_legerem']);
  assert.equal(engine.saveSafety.pending(),false);
});

let fixturePromise;
async function savedEncounter(){
  if(fixturePromise)return plain(await fixturePromise);
  fixturePromise=(async()=>{
    const engine=loadRuntimeIntegrationEngine(),characters=engine.charactersApi;
    const caster=Object.assign(engine.buildBlank(),{id:'preserved-caster',name:'Колдун текущей игры',cls:'Колдун',level:11,
      hp:17,hpMax:63,hpTemp:5,hdUsed:2,notes:'Не заменять героя при обновлении сайта',
      ab:{str:10,dex:12,con:14,int:10,wis:12,cha:18},coins:{mm:7,sm:4,em:0,zm:123,pm:2},
      inventory:[{id:'personal-keepsake',itemId:'loading-keepsake',qty:3,notes:'Собственность игрока'}]});
    const companion=Object.assign(engine.buildBlank(),{id:'preserved-companion',name:'Второй герой',hp:2,hpMax:21,activeFx:[]});
    const journal=[{id:'session-note',title:'Текущая игра',text:'Незавершённый бой и реальный результат броска'}];
    engine.setState({...engine.catalogs,chars:[caster,companion],items:engine.catalogs.items.concat({id:'loading-keepsake',n:'Памятный камень',custom:true,type:'equipment'}),journal,activeCharId:caster.id,fxRound:37});
    characters.withoutPresentation();engine.combatLifecycleApi.quiet();engine.learningApi.quiet();
    characters.characterAdopt(caster);characters.applyClassSlots(caster);characters.upgradeSpellcastingState(caster);
    engine.guardRandom();
    const spell=engine.state().spells.find(row=>engine.grimoireApi.grimoireActive(row)&&row.grimoire?.english==='Conjure Fey');
    assert.ok(spell);
    assert.equal(succeeded(await engine.learningApi.select(caster.id,spell.id,'arcanum',{circle:6})),true);
    assert.equal(engine.combatStart([{kind:'ally',id:caster.id,nat:20},{kind:'foe',id:'foe_goblin_scout',nat:1}],'Сохранённый бой'),true);
    const input={templateId:'foe_wolf',positionConfirmed:true,initiativeDie:13};
    assert.equal(succeeded(await engine.arcanumRuntime.longStart([spell.id,caster.id,'none','',undefined,'6:arcanum',{},[],{},{arcanum:input}])),true);
    const snapshot=engine.localSnapshot();
    // A real catalog reference on another party member forces startup hydration,
    // without making the independent caster's action depend on that missing item.
    const pointer=JSON.parse(fs.readFileSync(new URL('../data/bg3/current.json',import.meta.url),'utf8'));
    const manifest=JSON.parse(fs.readFileSync(new URL('../data/bg3/'+pointer.manifest,import.meta.url),'utf8'));
    const shard=JSON.parse(fs.readFileSync(new URL('../'+manifest.files.items[0].path,import.meta.url),'utf8'));
    snapshot.catalogRefs=[{id:'bg3',version:pointer.catalogVersion,profile:'standard',manifestSha256:pointer.manifestSha256}];
    snapshot.chars[1].inventory=[{id:'kept-catalog-item',itemId:shard.items[0].id,qty:2,notes:'Ссылка должна сохраниться даже без сети'}];
    return {snapshot,journal,input};
  })();
  return plain(await fixturePromise);
}

function assertUnchanged(engine,fixture){
  const state=engine.state();
  assert.deepEqual(plain(state.chars.map(c=>c.id)),fixture.snapshot.chars.map(c=>c.id),'no seed character may replace or join the saved party');
  for(const expected of fixture.snapshot.chars){
    const actual=state.chars.find(c=>c.id===expected.id);
    for(const key of ['name','hp','hpMax','hpTemp','hdUsed','notes','inventory','equipment','coins','spellbook','slots','mysticArcanum','activeFx']){
      assert.deepEqual(plain(actual[key]??null),plain(expected[key]??null),expected.id+'.'+key);
    }
  }
  for(const key of ['id','active','round','order','turnIndex','turn','log','history'])assert.deepEqual(plain(state.combat[key]),plain(fixture.snapshot.combat[key]),'combat.'+key);
  assert.equal(state.fxRound,fixture.snapshot.fxRound);
  assert.deepEqual(plain(state.journal),fixture.journal);
  assert.deepEqual(engine.localSnapshot().catalogRefs,fixture.snapshot.catalogRefs,'a failed download cannot change the pinned catalog');
}

for(const fault of ['offline','http-error','invalid-json'])test('startup '+fault+' preserves the whole saved encounter and minute casting across fresh runtimes',async()=>{
  const fixture=await savedEncounter();
  const envelope=await persistence.createEnvelope({campaignId:'default',revision:12,parentRevision:11,transactionId:'before-loading-update',state:fixture.snapshot});
  let raw=JSON.stringify(envelope),requests=0;
  const fetch=async()=>{
    requests++;
    if(fault==='offline')throw new Error('Synthetic network interruption');
    if(fault==='http-error')return {ok:false,status:503};
    return {ok:true,text:async()=>'{invalid-json',json:async()=>{throw new SyntaxError('Synthetic truncated JSON');}};
  };
  for(let reload=0;reload<2;reload++){
    const engine=loadRuntimeIntegrationEngine(undefined,{fetch});
    engine.charactersApi.withoutPresentation();engine.combatLifecycleApi.quiet();engine.learningApi.quiet();engine.guardRandom();
    await engine.storeSet(envelopeKey,raw);
    await engine.storeSet('dndworld2:journal',JSON.stringify(fixture.journal));
    await engine.loadAll();
    assertUnchanged(engine,fixture);
    assert.equal(await engine.runScheduledSave(),true,'any startup migration save remains durable');
    raw=await engine.storeGet(envelopeKey);
    assert.equal((await persistence.verifyEnvelope(JSON.parse(raw))).ok,true);
    assert.equal(succeeded(await engine.arcanumRuntime.longContinue('preserved-caster',{arcanum:{...fixture.input,completionFactsConfirmed:true}})),false,'reload does not grant a second casting action in the same turn');
    assertUnchanged(engine,fixture);
    if(reload===1){
      assert.equal(engine.combatNextTurn(),true);assert.equal(engine.combatNextTurn(),true);
      assert.equal(succeeded(await engine.arcanumRuntime.longContinue('preserved-caster',{arcanum:{...fixture.input,completionFactsConfirmed:true}})),true,'unrelated unavailable catalog item does not break ordinary spell progress');
      const actor=engine.state().chars.find(c=>c.id==='preserved-caster');
      assert.equal(actor.activeFx.find(fx=>fx.arcanumLongCast).arcanumLongCast.actionsDone,2);
      assert.equal(actor.mysticArcanum.choices[6].spent,false);
      assert.equal(engine.state().foes.some(f=>f.arcanumSummon),false,'partial casting cannot create a summon');
    }
  }
  assert.ok(requests>0,'the test must actually exercise catalog fetching');
});

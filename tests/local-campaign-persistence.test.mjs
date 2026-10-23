import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import persistence from '../scripts/persistence-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
import {localCampaignFixture} from './helpers/local-campaign-fixture.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const key='dndworld2:campaign-envelope';
function assertSession(engine,fixture){
  const state=engine.state();
  assert.deepEqual(plain(state.chars.map(c=>c.id)),fixture.snapshot.chars.map(c=>c.id),'existing party must never receive seeded heroes');
  for(const saved of fixture.snapshot.chars){
    const actual=state.chars.find(c=>c.id===saved.id);
    for(const field of ['name','hp','hpMax','hpTemp','notes','inventory','equipment','hdUsed'])assert.deepEqual(plain(actual[field]),saved[field],saved.id+'.'+field);
    assert.equal(String(actual.coins.zm),String(saved.coins.zm));
  }
  assert.equal(state.fxRound,13);assert.equal(state.combat.active,true);assert.equal(state.combat.round,4);
  assert.deepEqual(plain(state.combat.order),fixture.snapshot.combat.order);
  assert.equal(state.combat.turnIndex,1);assert.equal(state.combat.turn.actionUsed,true);assert.equal(state.combat.turn.bonusUsed,true);assert.equal(state.combat.turn.movementUsed,3);
  assert.deepEqual(plain(state.combat.log),fixture.snapshot.combat.log);assert.deepEqual(plain(state.combat.history),fixture.snapshot.combat.history);
  assert.deepEqual(plain(state.journal),fixture.journal);
}

for(const format of ['envelope','legacy-snapshot','split-keys'])test(format+' retains the exact current party and unfinished session across two local loads',async()=>{
  const fixture=localCampaignFixture(),engine=loadRuntimeIntegrationEngine();
  const backup='untouched older backup',syncConfig='{"on":true,"room":"old-room","url":"https://example.invalid"}';
  await engine.storeSet('dndworld2:sync',syncConfig);await engine.storeSet('dndworld2:user-backup',backup);
  if(format==='envelope'){
    const envelope=await persistence.createEnvelope({campaignId:'default',revision:5,parentRevision:4,transactionId:'retained-session',writtenAt:'2026-10-22T00:00:00.000Z',state:fixture.snapshot});
    await engine.storeSet(key,JSON.stringify(envelope));
  }else if(format==='legacy-snapshot')await engine.storeSet('dndworld2:world-snapshot',JSON.stringify(fixture.snapshot));
  else for(const name of ['chars','items','spells','abilities','races','classes','rules','foes','combat'])await engine.storeSet('dndworld2:'+name,JSON.stringify(fixture.snapshot[name]));
  if(format==='split-keys')await engine.storeSet('dndworld2:fxround','13');
  await engine.storeSet('dndworld2:journal',JSON.stringify(fixture.journal));
  await engine.loadAll();assertSession(engine,fixture);
  if(format==='legacy-snapshot')assert.equal(engine.localStorageValue(key+':backup'),JSON.stringify(fixture.snapshot),'migration first retains original legacy bytes');
  assert.equal(await engine.saveWorldNow(),true);await engine.loadAll();assertSession(engine,fixture);
  assert.equal(await engine.storeGet('dndworld2:sync'),syncConfig,'inactive user settings are not deleted');
  assert.equal(await engine.storeGet('dndworld2:user-backup'),backup);
  if(format==='split-keys')assert.equal(await engine.storeGet(key+':backup'),null,'the first durable save has no previous envelope');
  else assert.equal((await persistence.verifyEnvelope(JSON.parse(await engine.storeGet(key+':backup')))).ok,true,'normal subsequent commits retain the previous verified envelope');
});

test('an intentionally emptied party stays empty after the one-time new hero has been received',async()=>{
  const engine=loadRuntimeIntegrationEngine();await engine.storeSet('dndworld2:chars','[]');await engine.loadAll();
  assert.deepEqual(plain(engine.state().chars.map(c=>c.id)),['char_liora'],'only the explicitly requested new release hero is added');
  engine.setState({...engine.state(),chars:[]});assert.equal(await engine.saveWorldNow(),true);await engine.loadAll();
  assert.deepEqual(plain(engine.state().chars),[]);
});

test('the earliest local character format keeps its hero, HP, inventory and journal while receiving only the new alchemist once',async()=>{
  const engine=loadRuntimeIntegrationEngine(),old=[{id:'original-hero',name:'Старый герой',hp:2,hpMax:20,notes:'Моя летопись',inv:[{n:'Старый амулет',q:2}]}];
  await engine.storeSet('dndworld:chars',JSON.stringify(old));await engine.storeSet('dndworld:journal','[{"id":"old-note","text":"Не стирать"}]');await engine.loadAll();
  assert.deepEqual(plain(engine.state().chars.map(c=>c.id)),['original-hero','char_liora']);const actor=engine.state().chars[0];
  assert.equal(actor.hp,2);assert.equal(actor.notes,old[0].notes);assert.equal(actor.inventory[0].qty,2);assert.equal(engine.state().journal[0].text,'Не стирать');
  assert.equal(await engine.storeGet('dndworld:chars'),JSON.stringify(old));
  assert.equal(await engine.saveWorldNow(),true);await engine.loadAll();
  assert.deepEqual(plain(engine.state().chars.map(c=>c.id)),['original-hero','char_liora'],'the release hero is never duplicated on reload');
});

test('active application exposes no cloud or campaign replacement path',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/firebase|openSyncModal|dndWorldImportPayload|dndWorldExportPayload|doImport\(|doExport\(|applyStructuredReleaseMigration|syncAutoStart|type="file"/i);
  assert.equal(persistence.createCloudMessage,undefined);assert.equal(persistence.cloudCasPlan,undefined);
  assert.match(html,/campaignBeforeUnload/);assert.match(html,/await loadAll\(\)/);
});

for(const key of ['dndworld2:chars','dndworld:chars'])for(const raw of ['', 'null', '{"chars":[{"id":"saved-hero"}]}', '[{"id":"saved-hero"}', '[null]', '[42]', '[[]]'])test(key+' rejects present invalid party bytes '+JSON.stringify(raw),async()=>{
  const engine=loadRuntimeIntegrationEngine();await engine.storeSet(key,raw);
  await assert.rejects(()=>engine.loadAll());
  assert.equal(engine.saveSafety.pending(),false,'no migration may queue a replacement save');
  assert.equal(await engine.runScheduledSave(),true,'an idle flush cannot write a replacement party');
  assert.equal(await engine.storeGet(key),raw);assert.equal(await engine.storeGet('dndworld2:campaign-envelope'),null);
  assert.equal(await engine.storeGet('dndworld2:tagver'),null,'validation precedes legacy catalogue migration writes');
  assert.deepEqual(plain(engine.state().chars),[]);
});

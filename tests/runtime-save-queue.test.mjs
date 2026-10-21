import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

test('overlapping production saves serialize without a false revision conflict', async () => {
  const engine = loadRuntimeIntegrationEngine();
  engine.setState({
    chars:[engine.buildRoku(),engine.buildTorgar(),engine.buildSeptih(),engine.buildLegerem()],
    items:engine.catalogs.items,
    spells:engine.catalogs.spells,
    abilities:engine.catalogs.abilities,
    races:engine.catalogs.races,
    classes:engine.catalogs.classes,
    foes:engine.catalogs.foes,
  });
  const worldBefore = JSON.stringify(engine.state());

  const firstSave = engine.saveWorldNow();
  await Promise.resolve();
  const outcomes = await Promise.all([
    firstSave,
    engine.saveWorldNow(),
    engine.saveWorldNow(),
  ]);

  assert.deepEqual(outcomes,[true,true,true],
    'rapid player actions must not cancel because their saves used the same parent revision');
  const persistence = engine.persistenceState();
  assert.equal(persistence.revision,1,'the overlapping second wave commits from the first durable revision');
  assert.equal(persistence.pending,false);
  assert.equal(persistence.receipt.schemaVersion,'dnd-world-persistence-receipt/1');
  assert.equal(persistence.receipt.status,'committed');
  assert.equal(persistence.receipt.campaignId,'default');
  assert.equal(persistence.receipt.parentRevision,0);
  assert.equal(persistence.receipt.revision,1);
  assert.match(persistence.receipt.transactionId,/^tx-/);
  assert.match(persistence.receipt.checksum,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(engine.state()),worldBefore,'saving must not mutate the live game world');
});

test('failed action rollback preserves a prior in-flight save receipt and allows a subsequent CAS save',async()=>{
  for(const action of ['wallet','magic']){
    const engine=loadRuntimeIntegrationEngine(),actor=engine.buildBlank();actor.id='queue-hero';actor.coins={mm:'0',sm:'0',em:'0',zm:'10',pm:'0'};
    engine.setState({chars:[actor],activeCharId:actor.id});engine.charactersApi.withoutPresentation();engine.economyApi.dialogs(()=> 'Проверка очереди');
    let enter,release,attempt=0,durableEnvelope=null;const attempts=[];
    const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const previous=engine.saveSafety.setStorageWriter(async(key,value)=>{
      if(key==='dndworld2:campaign-envelope'){
        const envelope=JSON.parse(value);attempts.push(envelope);attempt++;
        if(attempt===1){enter();await gate;}
        if(attempt===2)return false;
        const saved=await previous(key,value);if(saved)durableEnvelope=envelope;return saved;
      }
      return previous(key,value);
    });
    const autosave=engine.saveWorldNow();await entered;
    const changed=action==='wallet'?engine.economyApi.coin('zm','5'):engine.charactersApi.magicSwitch('mp');
    for(let i=0;i<100&&engine.saveSafety.state().operations<2;i++)await Promise.resolve();
    assert.equal(engine.saveSafety.state().operations,2,'the action save is queued behind the delayed autosave');
    release();assert.equal(await autosave,true);
    const result=await changed;assert.equal(action==='wallet'?result:result.success,false);
    assert.equal(actor.coins.zm,'10');assert.equal(engine.state().campaignMagic.mode,'slots');
    const persistence=engine.persistenceState();
    assert.equal(persistence.revision,durableEnvelope.revision,action+': rollback must not rewind the confirmed storage revision');
    assert.equal(persistence.receipt.revision,durableEnvelope.revision);
    assert.equal(persistence.receipt.checksum,durableEnvelope.checksum);
    assert.equal(persistence.pending,true);
    actor.name='Следующая сохранённая правка';
    assert.equal(await engine.saveWorldNow(),true,action+': retry must succeed without reloading');
    assert.equal(durableEnvelope.revision,1);assert.equal(durableEnvelope.parentRevision,0);
    assert.equal(durableEnvelope.state.chars[0].name,actor.name);assert.equal(durableEnvelope.state.chars[0].coins.zm,'10');
    assert.equal(durableEnvelope.state.campaignMagic.mode,'slots');
    assert.ok(attempts[2].state.snapshotRevision>attempts[1].state.snapshotRevision,'snapshot identifiers remain monotonic after rollback');
    assert.equal(engine.saveSafety.pending(),false);
  }
});

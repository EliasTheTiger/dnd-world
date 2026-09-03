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

const assert = require('node:assert/strict');
const test = require('node:test');
const persistence = require('../scripts/persistence-core.js');

function state(marker = 'base') {
  return {schemaVersion:'dnd-world-world-snapshot/1', snapshotRevision:0, marker, chars:[], items:[], spells:[], abilities:[], races:[], classes:[], rules:[], foes:[], catalogRefs:[]};
}

test('campaign envelope checksum is canonical and detects tampering', async () => {
  const envelope = await persistence.createEnvelope({campaignId:'fixture',revision:0,parentRevision:-1,transactionId:'tx-1',state:state(),writtenAt:'2026-08-30T10:00:00.000Z'});
  assert.equal((await persistence.verifyEnvelope(envelope)).ok, true);
  const reordered = {checksum:envelope.checksum, state:envelope.state, writtenAt:envelope.writtenAt, transactionId:envelope.transactionId, parentRevision:-1, revision:0, campaignId:'fixture', catalogRefs:[], rulesetRefs:[], schemaVersion:persistence.ENVELOPE_SCHEMA};
  assert.equal((await persistence.verifyEnvelope(reordered)).ok, true);
  const forged = JSON.parse(JSON.stringify(envelope)); forged.state.marker = 'forged';
  assert.equal((await persistence.verifyEnvelope(forged)).code, 'CHECKSUM_MISMATCH');
});

test('world snapshot migration preserves the original state and revision', async () => {
  const snapshot = state('legacy'); snapshot.snapshotRevision = 9; snapshot.catalogRefs = [{id:'bg3',version:'fixture',profile:'standard'}];
  const envelope = await persistence.migrateWorldSnapshot(snapshot, {campaignId:'fixture',transactionId:'migrate',writtenAt:'2026-08-30T10:00:00.000Z'});
  assert.equal(envelope.revision, 9); assert.equal(envelope.parentRevision, 8); assert.deepEqual(envelope.state, snapshot);
  assert.equal((await persistence.verifyEnvelope(envelope)).ok, true);
});

test('durable tiers select the freshest verified campaign envelope and ignore an unverified forgery', async () => {
  const older = await persistence.createEnvelope({campaignId:'fixture',revision:3,parentRevision:2,transactionId:'older',state:state('older'),writtenAt:'2026-08-30T10:00:00.000Z'});
  const freshest = await persistence.createEnvelope({campaignId:'fixture',revision:4,parentRevision:3,transactionId:'freshest',state:state('freshest'),writtenAt:'2026-08-30T10:01:00.000Z'});
  const forged = JSON.parse(JSON.stringify(freshest)); forged.revision = 99;
  const selected = await persistence.selectFreshestEnvelope([
    {tier:'window.storage',raw:JSON.stringify(older)},
    {tier:'localStorage',raw:JSON.stringify(freshest)},
    {tier:'IndexedDB',raw:JSON.stringify(forged)},
  ]);
  assert.equal(selected.ok, true);
  assert.equal(selected.revision, 4);
  assert.equal(selected.tier, 'localStorage');
  assert.equal(selected.envelope.state.marker, 'freshest');
});

test('durable tiers fail closed when verified envelopes disagree at one revision', async () => {
  const left = await persistence.createEnvelope({campaignId:'fixture',revision:7,parentRevision:6,transactionId:'left',state:state('left'),writtenAt:'2026-08-30T10:00:00.000Z'});
  const right = await persistence.createEnvelope({campaignId:'fixture',revision:7,parentRevision:6,transactionId:'right',state:state('right'),writtenAt:'2026-08-30T10:00:01.000Z'});
  const selected = await persistence.selectFreshestEnvelope([
    {tier:'window.storage',raw:JSON.stringify(left)},
    {tier:'localStorage',raw:JSON.stringify(right)},
  ]);
  assert.equal(selected.ok, false);
  assert.equal(selected.conflict, true);
  assert.equal(selected.code, 'ENVELOPE_TIER_CONFLICT');
  assert.equal(selected.revision, 7);
  assert.deepEqual(selected.tiers, ['window.storage','localStorage']);
});

test('repository commits exactly one revision and returns a durable receipt', async () => {
  let seq = 0; const adapter = new persistence.MemoryAdapter(), repository = new persistence.EnvelopeRepository({adapter,clock:()=>'2026-08-30T10:00:00.000Z',idFactory:()=>`tx-${++seq}`});
  const first = await repository.commit({campaignId:'fixture',expectedRevision:-1,state:state('one')});
  assert.equal(first.ok, true); assert.equal(first.receipt.revision, 0); assert.equal(first.receipt.parentRevision, -1);
  const second = await repository.commit({campaignId:'fixture',expectedRevision:0,state:state('two')});
  assert.equal(second.ok, true); assert.equal(second.receipt.revision, 1);
  assert.equal((await repository.read()).envelope.state.marker, 'two');
  assert.equal(JSON.parse(await adapter.get(repository.backupKey)).state.marker, 'one');
});

test('concurrent writers from one parent cannot both commit', async () => {
  const adapter = new persistence.MemoryAdapter(), a = new persistence.EnvelopeRepository({adapter}), b = new persistence.EnvelopeRepository({adapter});
  assert.equal((await a.commit({campaignId:'fixture',expectedRevision:-1,transactionId:'first',state:state()})).ok, true);
  const [left, right] = await Promise.all([
    a.commit({campaignId:'fixture',expectedRevision:0,transactionId:'left',state:state('left')}),
    b.commit({campaignId:'fixture',expectedRevision:0,transactionId:'right',state:state('right')})
  ]);
  assert.equal([left,right].filter(row=>row.ok).length, 1);
  assert.equal([left,right].filter(row=>row.conflict).length, 1);
});

test('write failure does not manufacture a committed receipt or revision', async () => {
  const adapter = new persistence.MemoryAdapter(), repository = new persistence.EnvelopeRepository({adapter}); adapter.failNextSet = true;
  const result = await repository.commit({campaignId:'fixture',expectedRevision:-1,transactionId:'fail',state:state()});
  assert.equal(result.ok, false); assert.equal(result.code, 'WRITE_FAILED'); assert.equal(await adapter.get(repository.key), null);
});

test('cloud CAS rejects a stale campaign before payload replacement', () => {
  const remote = persistence.createCloudMessage({state:'remote'},{by:'remote',parentRevision:3,transactionId:'remote-4',at:4});
  assert.deepEqual(persistence.cloudCasPlan(remote,3), {ok:false,conflict:true,code:'CLOUD_REVISION_CONFLICT',expectedRevision:3,actualRevision:4});
  assert.deepEqual(persistence.cloudCasPlan(remote,4), {ok:true,parentRevision:4,revision:5});
});

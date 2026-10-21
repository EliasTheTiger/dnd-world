import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {inspectFile, inspectSave, inspectFileVerified, inspectSaveVerified} from '../scripts/save-inspector.mjs';
import persistence from '../scripts/persistence-core.js';

// An offline historical file fixture, not an active cloud writer.
const historicCloudFixture=(payload,options)=>({schemaVersion:'dnd-world-cloud-channel/1',...options,revision:options.parentRevision+1,payload});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = name => path.join(root, 'tests', 'fixtures', 'saves', name);
const snapshot = () => JSON.parse(fs.readFileSync(fixture('world-snapshot-v1.json'), 'utf8'));
const envelope = state => persistence.createEnvelope({campaignId:'fixture', revision:1, parentRevision:0,
  transactionId:'fixture-transaction', writtenAt:'2026-10-21T00:00:00.000Z', state:state || snapshot()});

test('world snapshot fixture is identified without mutation', () => {
  const file = fixture('world-snapshot-v1.json'), before = fs.readFileSync(file, 'utf8'), report = inspectFile(file);
  assert.equal(report.status, 'ok');
  assert.equal(report.format, 'world-snapshot');
  assert.equal(report.revision, 7);
  assert.deepEqual(report.counts, {items:1, spells:1, abilities:1, characters:1, foes:1});
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('legacy per-key fixture is distinguished from a complete snapshot', () => {
  const report = inspectFile(fixture('per-key-v2.json'));
  assert.equal(report.status, 'ok');
  assert.equal(report.format, 'legacy-per-key');
  assert.equal(report.counts.characters, 1);
});

test('legacy cloud wrapper is unwrapped and retains transport evidence', () => {
  const report = inspectFile(fixture('cloud-campaign-legacy.json'));
  assert.equal(report.status, 'ok');
  assert.equal(report.format, 'cloud-channel');
  assert.equal(report.cloud.by, 'fixture-client');
  assert.equal(report.cloud.at, 1700000000000);
});

test('corrupt, missing and incompatible payloads are not treated as empty campaigns', () => {
  assert.equal(inspectFile(fixture('corrupt-save.txt')).status, 'corrupt');
  assert.equal(inspectFile(fixture('absent.json')).status, 'missing');
  assert.equal(inspectSave('{"schemaVersion":"future/99"}').status, 'incompatible');
});

test('unresolved references are quarantined in a diagnostic report', () => {
  const base = JSON.parse(fs.readFileSync(fixture('world-snapshot-v1.json'), 'utf8'));
  base.chars[0].inventory[0].itemId = 'missing-item';
  base.combat.order.push({kind:'foe', id:'missing-foe'});
  const report = inspectSave(base);
  assert.equal(report.status, 'needs-attention');
  assert.deepEqual(report.issues.filter(row => row.code === 'UNRESOLVED_REFERENCE').map(row => row.value).sort(), ['missing-foe', 'missing-item']);
});

test('duplicate definition IDs are reported explicitly', () => {
  const base = JSON.parse(fs.readFileSync(fixture('world-snapshot-v1.json'), 'utf8'));
  base.items.push({...base.items[0]});
  const report = inspectSave(base);
  assert.equal(report.status, 'needs-attention');
  assert.ok(report.issues.some(row => row.code === 'DUPLICATE_ID' && row.id === 'fixture-rope'));
});

test('checksum verification is explicit and uses the runtime envelope contract without mutation', async () => {
  const value = await envelope(), before = JSON.stringify(value);
  const sync = inspectSave(value);
  assert.equal(sync.status, 'unverified');
  assert.equal(sync.integrity.status, 'unverified');
  const verified = await inspectSaveVerified(value);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.integrity.status, 'verified');
  assert.equal(verified.validationStatus, 'ok');
  assert.equal(verified.integrity.scope, 'campaign-envelope');
  assert.equal(JSON.stringify(value), before);
});

test('tampering with state, transaction metadata or checksum is corrupt', async t => {
  const original = await envelope();
  const mutations = {
    state:value => value.state.chars[0].inventory[0].qty++,
    campaign:value => value.campaignId = 'other-campaign',
    transaction:value => value.transactionId = 'other-transaction',
    time:value => value.writtenAt = '2026-10-22T00:00:00.000Z',
    checksum:value => value.checksum = '0'.repeat(64),
    missingChecksum:value => delete value.checksum,
    revisionChain:value => value.parentRevision = 8,
    unsafeRevision:value => value.revision = Number.MAX_SAFE_INTEGER + 1,
    invalidTransaction:value => value.transactionId = 'not valid'
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async () => {
    const value = structuredClone(original); mutate(value);
    const expected = await persistence.verifyEnvelope(value), report = await inspectSaveVerified(value);
    assert.equal(expected.ok, false);
    assert.equal(report.status, 'corrupt');
    assert.equal(report.integrity.code, expected.code);
  });
});

test('verified checksum does not imply valid references or loaded catalogs', async () => {
  const state = snapshot();
  state.chars[0].inventory.push({id:'catalog-entry', itemId:'bg3:item:unknown-but-pinned', qty:1});
  state.catalogRefs = [{id:'bg3', version:'fixture', profile:'standard', manifestSha256:'a'.repeat(64)}];
  const report = await inspectSaveVerified(await envelope(state));
  assert.equal(report.status, 'verified');
  assert.equal(report.references.status, 'partial');
  assert.equal(report.references.catalogStatus, 'unverified');
  assert.equal(report.references.catalogReferences[0].pinned, true);
  assert.equal(report.references.catalogs[0].manifestSha256, 'a'.repeat(64));
  assert.equal(report.issues.some(row => row.code === 'UNRESOLVED_REFERENCE'), false);
  state.chars[0].inventory[0].itemId = 'missing-local-item';
  const missing = await inspectSaveVerified(await envelope(state));
  assert.equal(missing.status, 'verified');
  assert.equal(missing.validationStatus, 'needs-attention');
  assert.ok(missing.issues.some(row => row.code === 'UNRESOLVED_REFERENCE'));
});

test('catalog namespaces without pins and conflicting pins remain diagnostic', async () => {
  const state = snapshot();
  state.chars[0].inventory[0].itemId = 'bg3:item:unloaded';
  state.chars[0].spellbook[0].spellId = 'bg3:spell:unloaded';
  state.chars[0].abilities[0].abilityId = 'bg3:ability:unloaded';
  const missing = inspectSave(state);
  assert.equal(missing.status, 'needs-attention');
  assert.equal(missing.references.catalogReferences.length, 3);
  assert.equal(missing.issues.filter(row => row.code === 'MISSING_CATALOG_PIN').length, 3);
  state.catalogRefs = [{id:'bg3', version:'one'}];
  const value = await persistence.createEnvelope({...await envelope(state), catalogRefs:[{id:'bg3',version:'two'}]});
  const conflict = await inspectSaveVerified(value);
  assert.equal(conflict.status, 'verified');
  assert.equal(conflict.validationStatus, 'needs-attention');
  assert.ok(conflict.issues.some(row => row.code === 'CONFLICTING_CATALOG_PIN'));
});

test('both cloud wrappers verify the inner envelope without authenticating transport metadata', async () => {
  const value = await envelope();
  for (const wrapper of [
    {by:'legacy-client', at:1, j:JSON.stringify(value)},
    historicCloudFixture(value, {by:'client', parentRevision:2, transactionId:'cloud-3', at:1})
  ]) {
    const report = await inspectSaveVerified(wrapper);
    assert.equal(report.status, 'verified');
    assert.equal(report.format, 'cloud-channel');
    assert.equal(report.revision, 1);
    assert.equal(report.cloud.integrity, 'unverified');
    assert.equal(report.integrity.scope, 'campaign-envelope');
  }
  const cloud = historicCloudFixture(snapshot(), {by:'client',parentRevision:0,transactionId:'cloud-1',at:1});
  assert.equal((await inspectSaveVerified(cloud)).status, 'unverified');
});

test('malformed nested lists and records produce diagnostic reports instead of TypeError', async t => {
  const invalid = [{}, false, 0, 'invalid'];
  const paths = [['chars',0,'inventory'], ['chars',0,'spellbook'], ['chars',0,'abilities'], ['combat','order'], ['journal'], ['catalogRefs']];
  for (const keys of paths) for (const [index, value] of invalid.entries()) await t.test(keys.join('.')+'-'+index, async () => {
    const state = snapshot();
    let row = state;
    for (const key of keys.slice(0, -1)) row = row[key];
    row[keys.at(-1)] = value;
    assert.equal(inspectSave(state).status, 'corrupt');
    assert.equal((await inspectSaveVerified(state)).status, 'corrupt');
  });
  for (const keys of [['chars'], ['items'], ['spells'], ['abilities'], ['races'], ['classes'], ['rules'], ['foes'], ['chars',0,'inventory'], ['chars',0,'spellbook'], ['chars',0,'abilities'], ['combat','order']]) await t.test('record-'+keys.join('.'), async () => {
    const state = snapshot(); let row = state;
    for (const key of keys.slice(0, -1)) row = row[key];
    row[keys.at(-1)] = [null, 1, 'invalid', []];
    const report = await inspectSaveVerified(state);
    assert.equal(report.status, 'corrupt');
    assert.ok(report.issues.some(issue => issue.code === 'INVALID_RECORD'));
  });
});

test('malformed roots, IDs, schemas, required arrays and cloud payloads cannot crash inspection', async t => {
  const values = [null, '', 'not JSON', 1, true, [], {schemaVersion:{toString:null}},
    {schemaVersion:'dnd-world-cloud-channel/1'}, {j:3}, {j:'{broken'},
    {schemaVersion:'future/9', 'dndworld2:chars':'[]'}, {'dndworld2:unrelated-setting':'true'}];
  for (const [index, value] of values.entries()) await t.test('root-'+index, async () => {
    const report = await inspectSaveVerified(value);
    assert.ok(['corrupt','missing','incompatible'].includes(report.status));
  });
  for (const key of ['chars','items','spells','abilities','races','classes','rules','foes']) await t.test('required-'+key, async () => {
    const state = snapshot(); state[key] = {};
    assert.equal((await inspectSaveVerified(state)).status, 'corrupt');
  });
  const state = snapshot(); state.items[0].id = {toString:null};
  assert.equal(inspectSave(state).status, 'corrupt');
  state.combat.order[0].kind = {toString:null};
  assert.equal(inspectSave(state).status, 'corrupt');
  state.schemaVersion = {toString:null};
  assert.equal(inspectSave(state).status, 'incompatible');
});

test('present corrupt legacy JSON is not silently replaced with an empty collection', async () => {
  const original = JSON.parse(fs.readFileSync(fixture('per-key-v2.json'), 'utf8'));
  for (const key of ['chars', 'items', 'spells', 'abilities', 'races', 'classes', 'rules', 'foes', 'combat', 'journal', 'catalog-refs']) {
    const value = {...original, ['dndworld2:'+key]:'{broken'};
    const report = await inspectSaveVerified(value);
    assert.equal(report.status, 'corrupt');
    assert.ok(report.issues.some(issue => issue.code === 'CORRUPT_LEGACY_KEY' && issue.field === 'dndworld2:'+key));
  }
  const misleading = {...await envelope(), 'dndworld2:chars':'[]', checksum:'bad'};
  assert.equal((await inspectSaveVerified(misleading)).status, 'corrupt');
  const wrappedDistraction = {...await envelope(), j:JSON.stringify(await envelope()), checksum:'bad'};
  assert.equal((await inspectSaveVerified(wrappedDistraction)).status, 'corrupt','a cloud-looking extra field cannot hide a corrupt root envelope');
});

test('cyclic and non-finite envelope values use persistence diagnostics, and absent refs are reported', async () => {
  const value = structuredClone(await envelope()); value.state.cycle = value.state;
  assert.equal((await inspectSaveVerified(value)).integrity.code, 'CYCLIC_VALUE');
  delete value.state.cycle; value.state.invalidNumber = Infinity;
  assert.equal((await inspectSaveVerified(value)).integrity.code, 'INVALID_VALUE');
  const state = snapshot(); state.snapshotRevision = Infinity;
  assert.equal(inspectSave(state).status, 'corrupt');
  delete state.snapshotRevision;
  state.chars[0].spellbook = [{}]; state.chars[0].abilities = [{}]; state.combat.order = [{kind:'ally'}];
  assert.equal(inspectSave(state).issues.filter(issue => issue.code === 'MISSING_REFERENCE').length, 3);
});

test('CLI distinguishes verified, unverified and corrupt files and never rewrites them', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-save-inspector-'));
  const files = ['verified.json', 'legacy.json', 'corrupt.json'].map(name => path.join(dir, name));
  t.after(() => { for (const file of files) if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); });
  const value = await envelope();
  const contents = [JSON.stringify(value), JSON.stringify(snapshot()), JSON.stringify({...value, checksum:'0'.repeat(64)})];
  files.forEach((file, index) => fs.writeFileSync(file, contents[index]));
  const cli = spawnSync(process.execPath, [path.join(root, 'scripts/save-inspector.mjs'), ...files], {encoding:'utf8'});
  assert.equal(cli.status, 1, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout).map(report => report.status), ['verified', 'unverified', 'corrupt']);
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), contents);
  assert.equal((await inspectFileVerified(files[0])).status, 'verified');
  const readable = spawnSync(process.execPath, [path.join(root, 'scripts/save-inspector.mjs'), ...files.slice(0,2)], {encoding:'utf8'});
  assert.equal(readable.status, 0, readable.stderr);
  assert.equal((await inspectFileVerified(path.join(dir, 'missing.json'))).status, 'missing');
});

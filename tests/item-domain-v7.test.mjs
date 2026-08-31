import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = require('../scripts/item-domain-model.js');
const {manifest, catalogRoot} = selectBg3Catalog(repositoryRoot);
const itemRoot = path.join(catalogRoot, 'items');
const itemFiles = fs.readdirSync(itemRoot).filter(file => file.endsWith('.json')).sort();
const arsenalQuality = JSON.parse(fs.readFileSync(path.join(catalogRoot, manifest.entrypoints.itemArsenalQualityReport), 'utf8'));
const arsenalExcludedIds = new Set(arsenalQuality.removed.map(row => row.itemId));

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readSourceItems() {
  return itemFiles.flatMap(file => JSON.parse(fs.readFileSync(path.join(itemRoot, file), 'utf8')).items)
    .filter(item => !arsenalExcludedIds.has(item.id));
}

function materialize(item, profile) {
  if (!(item.source?.profiles || []).includes(profile)) return null;
  return profile === 'standard' ? item : null;
}

function programIdsInArtifact(relative, cache) {
  if (cache.has(relative)) return cache.get(relative);
  const file = path.join(catalogRoot, ...relative.split('/'));
  assert.equal(fs.existsSync(file), true, `missing program artifact ${relative}`);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = new Set((payload.programs || []).map(program => program.id));
  for (const rule of payload.rules || []) {
    for (const program of Object.values(rule.programs || {})) if (program?.id) ids.add(program.id);
  }
  cache.set(relative, ids);
  return ids;
}

function loadLocalItemsFromEngine() {
  const html = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
  const start = html.indexOf('<script>') + '<script>'.length;
  let source = html.slice(start, html.indexOf('</script>', start));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  source += '\nglobalThis.__itemDomainLocalItems = seedItemsDB().map(row => JSON.parse(JSON.stringify(row)));';
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '',
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; }});
    return elements.get(id);
  };
  const storage = new Map();
  const context = {
    console, Date, JSON, Blob, URL, DndWorldItemDomain: model,
    Math: Object.assign(Object.create(Math), {random() { throw new Error('engine-side dice/random generation is forbidden'); }}),
    setTimeout: () => 0, clearTimeout() {}, confirm: () => false, prompt: () => null, alert() {},
    fetch: async () => ({ok: false, status: 599, json: async () => ({})}), EventSource: class {},
    document: {activeElement: null, getElementById: element, querySelectorAll: () => [], querySelector: () => null, createElement: () => ({click() {}, style: {}})},
    localStorage: {getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value))},
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return JSON.parse(JSON.stringify(context.__itemDomainLocalItems));
}

const sourceHashesBefore = new Map(itemFiles.map(file => [file, hashFile(path.join(itemRoot, file))]));
const sourceItems = readSourceItems();
const domainsByProfile = new Map();

function profileDomains(profile) {
  if (!domainsByProfile.has(profile)) {
    const rows = sourceItems.map(item => materialize(item, profile)).filter(Boolean);
    const context = model.createMigrationContext(rows);
    domainsByProfile.set(profile, {rows, context, domains: rows.map(item => model.migrateItemToDomainV7(item, {context}))});
  }
  return domainsByProfile.get(profile);
}

// Keep an explicit, runner-visible developer matrix in addition to the
// exhaustive catalog assertions below.  The sample is evenly distributed over
// every immutable profile universe declared by the selected manifest so that a green count cannot come from a
// single category, shard, handler family, or part of the alphabet.
const developerArtifactCache = new Map();
const DEVELOPER_CASES_PER_PROFILE = 256;
for (const profile of Object.keys(manifest.source?.profiles || {})) {
  const {rows, context, domains} = profileDomains(profile);
  for (let offset = 0; offset < DEVELOPER_CASES_PER_PROFILE; offset++) {
    const index = Math.floor(offset * rows.length / DEVELOPER_CASES_PER_PROFILE);
    const source = rows[index];
    const domain = domains[index];
    test(`developer item ${profile} ${offset + 1}/${DEVELOPER_CASES_PER_PROFILE}: ${domain.id}`, () => {
      assert.deepEqual(model.validateItemDomainV7(domain), []);
      assert.ok(domain.description.text.trim());
      assert.equal(typeof domain.economy.cost, 'object');
      assert.equal(typeof domain.economy.weight, 'object');
      assert.ok(Number.isInteger(domain.stack.maximum) && domain.stack.maximum >= 1);
      assert.equal(domain.provenance.sourceItemId, source.id);
      assert.deepEqual(model.migrateItemToDomainV7(domain, {context}), domain);
      for (const action of domain.gameplay.actions) {
        const handler = model.HANDLERS[action.handler.id];
        assert.ok(handler, `${domain.id}: missing handler ${action.handler.id}`);
        assert.ok(Object.values(handler).includes(action.handler.executor),
          `${domain.id}: missing executor ${action.handler.executor}`);
        assert.ok(model.RESULT_CHANNELS.some(channel => action.result[channel].length),
          `${domain.id}: resultless action ${action.id}`);
      }
      for (const reference of domain.references) {
        assert.ok(programIdsInArtifact(reference.artifact, developerArtifactCache).has(reference.id),
          `${domain.id}: orphan ${reference.id}`);
      }
    });
  }
}

test('item domain JSON schema and runtime registry stay synchronized', () => {
  const schemaPath = path.join(repositoryRoot, 'schemas', 'item-domain-v7.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schemaVersion.const, model.SCHEMA_VERSION);
  assert.deepEqual(schema.properties.rarity.enum, [...model.RARITIES]);
  assert.deepEqual(schema.properties.taxonomy.properties.category.enum, [...model.CATEGORIES]);
  assert.deepEqual(schema.properties.taxonomy.properties.subcategory.enum, [...model.ITEM_SUBCATEGORIES]);
  assert.deepEqual(schema.properties.taxonomy.properties.type.enum, [...model.ITEM_TYPES]);
  assert.deepEqual(schema.properties.taxonomy.properties.subtype.enum, [...model.ITEM_SUBTYPES]);
  assert.deepEqual(schema.properties.economy.properties.cost.properties.currency.enum, [...model.CURRENCIES]);
  assert.deepEqual(schema.$defs.action.properties.activation.properties.cost.enum, [...model.ACTION_COSTS]);
  assert.deepEqual(schema.$defs.action.properties.targets.properties.kind.enum, [...model.TARGET_KINDS]);
  assert.deepEqual(schema.properties.equipment.properties.slots.items.enum, [...model.EQUIPMENT_SLOTS]);

  const html = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
  assert.ok(html.indexOf('<script src="scripts/item-domain-model.js"></script>') < html.indexOf('<script>'), 'domain adapter must load before the engine');
  assert.match(html, /itemDomainActionExecutable\(it,'interaction',x\.id\)/);
  assert.match(html, /itemDomainActionExecutable\(it,'use',use\.id\)/);
  for (const [handlerId, handler] of Object.entries(model.HANDLERS)) {
    for (const executor of [handler.executor, handler.bg3Executor].filter(Boolean)) {
      assert.match(html, new RegExp(`(?:async\\s+)?function\\s+${executor}\\s*\\(`), `${handlerId} -> ${executor}`);
    }
  }
});

for (const profile of Object.keys(manifest.source?.profiles || {})) {
  test(`${profile}: every BG3 item migrates to the strict domain without orphan references`, () => {
    const {rows, domains} = profileDomains(profile);
    assert.equal(rows.length, arsenalQuality.counts.retained);
    assert.equal(domains.length, rows.length);
    const errors = model.validateDomainCatalog(domains);
    assert.deepEqual(errors, []);
    const sourceActions = rows.reduce((sum, item) => sum + (item.mechanics?.actions || []).length, 0);
    const sourceInteractions = rows.reduce((sum, item) => sum + (item.mechanics?.interactions || []).length, 0);
    const domainUseActions = domains.reduce((sum, item) =>
      sum + item.gameplay.actions.filter(action => action.source.kind === 'bg3-action').length, 0);
    const domainInteractionActions = domains.reduce((sum, item) =>
      sum + item.gameplay.actions.filter(action => action.source.kind === 'interaction' && action.id !== 'equipment:toggle').length, 0);
    const blockedCapabilities = domains.reduce((sum, item) => sum + item.provenance.blockedCapabilities.length, 0);
    assert.equal(domainUseActions + blockedCapabilities, sourceActions,
      'every strict source action must become executable or remain explicitly blocked');
    assert.equal(domainInteractionActions, sourceInteractions,
      'every strict generic interaction must remain executable');
    assert.ok(domains.reduce((sum, item) => sum + item.gameplay.actions.length, 0) >= domainUseActions + domainInteractionActions,
      'domain may add deterministic equipment affordances to source actions');

    const artifactCache = new Map();
    for (let index = 0; index < domains.length; index++) {
      const domain = domains[index];
      assert.deepEqual(model.arsenalReadiness(rows[index], {context: profileDomains(profile).context}).issues, [], domain.id);
      assert.equal(typeof domain.economy.cost, 'object', domain.id);
      assert.equal(typeof domain.economy.weight, 'object', domain.id);
      assert.ok(domain.description.text.trim(), domain.id);
      assert.ok(Number.isInteger(domain.stack.maximum) && domain.stack.maximum >= 1, domain.id);
      assert.ok(Array.isArray(domain.equipment.slots), domain.id);
      for (const action of domain.gameplay.actions) {
        assert.ok(model.HANDLERS[action.handler.id], `${domain.id}: ${action.handler.id}`);
        assert.ok(Object.values(model.HANDLERS[action.handler.id]).includes(action.handler.executor), `${domain.id}: ${action.handler.executor}`);
        assert.ok(model.RESULT_CHANNELS.some(channel => action.result[channel].length), `${domain.id}: ${action.id} has no result`);
      }
      for (const reference of domain.references) {
        assert.ok(programIdsInArtifact(reference.artifact, artifactCache).has(reference.id), `${domain.id}: orphan ${reference.id}`);
      }
      if (domain.provenance.sourceRootTemplateUuid) {
        assert.equal(model.rootUuidFromItemId(domain.id), domain.provenance.sourceRootTemplateUuid, domain.id);
      }
    }
  });
}

test('duplicate identities are explicit aliases and never unresolved copies', () => {
  const {domains} = profileDomains('standard');
  const byId = new Map(domains.map(item => [item.id, item]));
  const sourceById = new Map(sourceItems.map(item => [item.id, item]));
  for (const domain of domains) {
    const source = sourceById.get(domain.id);
    if (source.source?.classification === 'duplicate') assert.ok(source.source.semanticAliasOf, `${domain.id}: duplicate without semantic alias`);
    if (source.source?.semanticAliasOf) {
      assert.ok(domain.aliasOf, `${domain.id}: missing aliasOf`);
      assert.equal(domain.canonicalId, domain.aliasOf, domain.id);
      assert.ok(byId.has(domain.canonicalId), `${domain.id}: missing canonical target`);
      assert.equal(byId.get(domain.canonicalId).aliasOf, null, `${domain.id}: alias chain is not flattened`);
    } else {
      assert.equal(domain.canonicalId, domain.id, domain.id);
      assert.equal(domain.aliasOf, null, domain.id);
    }
  }
});

test('migration is idempotent and does not change immutable source shards', () => {
  for (const profile of ['standard']) {
    const {domains, context} = profileDomains(profile);
    for (const domain of domains) {
      assert.deepEqual(model.migrateItemToDomainV7(domain, {context}), domain, `${profile}: ${domain.id}`);
    }
  }
  for (const file of itemFiles) assert.equal(hashFile(path.join(itemRoot, file)), sourceHashesBefore.get(file), file);
});

test('all built-in campaign items use the same strict model', () => {
  const items = loadLocalItemsFromEngine();
  const context = model.createMigrationContext(items);
  const domains = items.map(item => model.migrateItemToDomainV7(item, {context}));
  assert.ok(domains.length > 100, 'expected the built-in catalog');
  assert.deepEqual(model.validateDomainCatalog(domains), []);
  for (const domain of domains) {
    assert.equal(domain.canonicalId, domain.id, domain.id);
    for (const action of domain.gameplay.actions) assert.ok(model.HANDLERS[action.handler.id], `${domain.id}: ${action.handler.id}`);
  }
});

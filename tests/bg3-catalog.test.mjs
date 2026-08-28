import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {candidate, pointer, current, catalogRoot, manifestPath, manifest} = selectBg3Catalog(repo);
const expectedUniverse = current.catalogVersion.endsWith('-v1')
  ? {union: 9_979, standard: 9_977, honour: 9_979, pair: 9_612, templateOnly: 168, statsOnly: 197}
  : {union: 10_284, standard: 10_282, honour: 10_284, pair: 9_995, templateOnly: 134, statsOnly: 153};

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const shardFor = id => crypto.createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 2);
const repoFile = relative => path.join(repo, ...relative.split('/'));
const catalogFile = relative => path.join(catalogRoot, ...relative.split('/'));
const plain = value => JSON.parse(JSON.stringify(value));
const itemShardById = new Map();

function allManifestArtifacts() {
  return Object.values(manifest.files).flat();
}

function loadItemCatalog() {
  const items = [];
  for (const meta of manifest.files.items) {
    const payload = JSON.parse(fs.readFileSync(repoFile(meta.path), 'utf8'));
    assert.equal(payload.catalogVersion, current.catalogVersion);
    assert.equal(payload.shard, meta.shard);
    assert.equal(payload.count, meta.count);
    assert.equal(payload.items.length, meta.count);
    assert.deepEqual(payload.items.map(x => x.id), payload.items.map(x => x.id).slice().sort());
    assert.match(meta.shard, /^[0-9a-f]{2}(?:-[0-9a-f]{4})?$/);
    for (const item of payload.items) {
      assert.equal(shardFor(item.id), meta.shard.slice(0, 2));
      assert.equal(itemShardById.has(item.id), false, item.id);
      itemShardById.set(item.id, meta.shard);
    }
    items.push(...payload.items);
  }
  return items;
}

function loadSourceNodes(group) {
  const nodes = [];
  for (const meta of manifest.files[group]) {
    const payload = JSON.parse(fs.readFileSync(repoFile(meta.path), 'utf8'));
    assert.equal(payload.catalogVersion, current.catalogVersion);
    assert.equal(payload.count, meta.count);
    assert.equal(payload.nodes.length, meta.count);
    nodes.push(...payload.nodes);
  }
  return nodes;
}

const items = loadItemCatalog();
const itemById = new Map(items.map(item => [item.id, item]));

test('указатель каталога фиксирует неизменяемую версию и хеш manifest', () => {
  const liveManifestPath = path.join(repo, 'data', 'bg3', pointer.manifest);
  assert.equal(pointer.schemaVersion, 'dnd-world-bg3-current/1');
  assert.equal(pointer.manifest, `${pointer.catalogVersion}/manifest.json`);
  assert.equal(pointer.manifestSha256, sha256(liveManifestPath));
  assert.equal(current.schemaVersion, 'dnd-world-bg3-current/1');
  assert.match(current.catalogVersion, /^bg3-24532579-v[1-9][0-9]*$/);
  assert.equal(current.manifest, `${current.catalogVersion}/manifest.json`);
  assert.equal(current.manifestSha256, sha256(manifestPath));
  assert.equal(manifest.immutable, true);
  assert.equal(manifest.source.gameFilesModified, false);
  assert.equal(manifest.contracts.engine, 'D&D World 4.6');
  assert.equal(manifest.contracts.itemSchemaVersion, 6);
  assert.equal(manifest.contracts.mechanicsSchemaVersion, 1);
  if (candidate) assert.equal(current.catalogVersion, process.env.BG3_CATALOG_VERSION);
});

test('каждый объявленный файл имеет точный размер и SHA-256', () => {
  for (const meta of allManifestArtifacts()) {
    const file = repoFile(meta.path);
    assert.equal(fs.existsSync(file), true, meta.path);
    assert.equal(fs.statSync(file).size, meta.bytes, meta.path);
    assert.equal(sha256(file), meta.sha256, meta.path);
  }
  assert.equal(manifest.files.items.length, manifest.sharding.runtimeItems.shards);
  assert.equal(
    Math.max(...manifest.files.items.map(x => x.bytes)),
    manifest.sharding.runtimeItems.maxBytes,
  );
  assert.ok(
    manifest.sharding.runtimeItems.maxBytes < manifest.sharding.runtimeItems.hardLimitBytes,
  );
  assert.ok(manifest.sharding.runtimeItems.maxBytes <= manifest.sharding.runtimeItems.targetBytes);
  assert.ok(Math.max(...manifest.files.rootTemplates.map(x => x.bytes)) < 500_000);
  assert.ok(Math.max(...manifest.files.itemStats.map(x => x.bytes)) < 200_000);
});

test('lossless universe содержит все source-backed template/stats/placement варианты без name-dedupe', () => {
  assert.equal(items.length, expectedUniverse.union);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.equal(manifest.counts.universe.standard, expectedUniverse.standard);
  assert.equal(manifest.counts.universe.honour, expectedUniverse.honour);
  assert.deepEqual(plain(manifest.counts.universe.standardBreakdown), {
    pair: expectedUniverse.pair,
    'template-only': expectedUniverse.templateOnly,
    'stats-only': expectedUniverse.statsOnly,
  });
  const reciprocalPairsStandard = items.filter(item =>
    item.source.profiles.includes('standard')
    && new Set(item.source.identityEvidence.standard || []).size === 2
    && new Set(item.source.identityEvidence.standard || []).has('template.stats')
    && new Set(item.source.identityEvidence.standard || []).has('stats.rootTemplate')
  ).length;
  assert.equal(manifest.counts.universe.reciprocalPairsStandard, reciprocalPairsStandard);
  assert.equal(items.filter(item => item.source.profiles.includes('standard')).length, expectedUniverse.standard);
  assert.equal(items.filter(item => item.source.profiles.includes('honour')).length, expectedUniverse.honour);
  assert.equal(items.filter(item => item.source.profiles.length === 1 && item.source.profiles[0] === 'honour').length, 2);
  assert.equal(items.filter(item => !item.source.rootTemplateUuid).length, expectedUniverse.statsOnly);
  assert.equal(items.filter(item => !item.source.statsId).length, expectedUniverse.templateOnly);

  const duplicateNames = new Map();
  for (const item of items) {
    const key = String(item.n || '').trim().toLocaleLowerCase('ru');
    duplicateNames.set(key, (duplicateNames.get(key) || 0) + 1);
  }
  assert.ok([...duplicateNames.values()].some(count => count > 100), 'same-name UUID variants must remain separate');
});

test('RootTemplate и Stats source nodes разрешают каждую ссылку', () => {
  const roots = loadSourceNodes('rootTemplates');
  const stats = loadSourceNodes('itemStats');
  const rootIds = new Set(roots.map(node => node.id));
  const statsIds = new Set(stats.map(node => node.id));
  assert.equal(roots.length, 9_332);
  assert.equal(roots.filter(node => String(node.type).toLowerCase() === 'item').length, 9_328);
  assert.equal(stats.length, 3_139);
  assert.equal(new Set(roots.map(node => node.uuid)).size, roots.length);
  assert.equal(new Set(stats.map(node => node.statsId)).size, stats.length);
  assert.equal(stats.filter(node => node.honourDelta).length, 94);
  assert.ok(roots.some(node => node.children.length && Object.keys(node.directAttributes).length > 22));
  for (const item of items) {
    if (item.source.rootTemplate) assert.equal(rootIds.has(item.source.rootTemplate), true, item.id);
    if (item.source.stats) assert.equal(statsIds.has(item.source.stats), true, item.id);
  }
});

test('search index содержит ровно одну краткую запись на вариант', () => {
  const index = JSON.parse(fs.readFileSync(catalogFile(manifest.entrypoints.searchIndex), 'utf8'));
  assert.equal(index.count, items.length);
  assert.equal(index.items.length, items.length);
  assert.equal(new Set(index.items.map(row => row.id)).size, items.length);
  for (const row of index.items) {
    assert.equal(itemById.has(row.id), true, row.id);
    assert.equal(row.shard, itemShardById.get(row.id), row.id);
    assert.equal(row.shard.slice(0, 2), shardFor(row.id), row.id);
    assert.equal(typeof row.names.ru, 'string');
    assert.equal(typeof row.names.en, 'string');
    assert.ok(row.icon.src.startsWith('assets/bg3/icons/'));
    assert.equal('searchText' in row, false, 'derived search text must not bloat the index');
    assert.equal('sortKey' in row, false, 'derived sort key must not bloat the index');
  }
});

test('каждая строка имеет проверяемый оригинальный BG3 icon asset', () => {
  const iconManifest = JSON.parse(fs.readFileSync(catalogFile(manifest.entrypoints.iconManifest), 'utf8'));
  const assets = new Map(iconManifest.assets.map(asset => [asset.path, asset]));
  assert.equal(iconManifest.uniqueAssets, iconManifest.assets.length);
  assert.equal(new Set(iconManifest.assets.map(asset => asset.path)).size, iconManifest.assets.length);
  for (const asset of iconManifest.assets) {
    const file = repoFile(asset.path);
    assert.equal(fs.existsSync(file), true, asset.path);
    assert.equal(fs.statSync(file).size, asset.bytes, asset.path);
    assert.equal(sha256(file), asset.sha256, asset.path);
    assert.ok(asset.width > 0 && asset.height > 0);
  }
  for (const item of items) {
    assert.equal(assets.has(item.icon.src), true, item.id);
    assert.equal(item.icon.sha256, assets.get(item.icon.src).sha256, item.id);
    if (item.source.classification === 'playable') {
      assert.ok(['exact', 'inherited', 'source-unknown', 'sibling-fallback'].includes(item.icon.status), item.id);
    }
  }
  assert.equal(iconManifest.statusCounts['sibling-fallback'] > 0, true);
  assert.equal(iconManifest.statusCounts['missing-source'] > 0, true);
});

test('generated item costs follow the selected catalog economy contract', t => {
  const revision = /^bg3-24532579-v(\d+)$/.exec(current.catalogVersion)?.[1];
  if (!revision || Number(revision) < 5) {
    t.skip('requires a selected v5+ catalog');
    return;
  }
  for (const item of items) {
    if (Number(revision) < 9) {
      assert.equal(item.cost, '—', item.id);
      assert.deepEqual([...item.cost].map(character => character.codePointAt(0)), [0x2014], item.id);
      continue;
    }
    const value = item.mechanics.profile.value;
    if (Number(revision) >= 10 && value.state === 'not-applicable') {
      assert.equal(value.gp, null, item.id);
      assert.equal(value.cp, null, item.id);
      assert.equal(value.display, 'не применяется', item.id);
      assert.equal(item.cost, value.display, item.id);
      continue;
    }
    if (Number(revision) >= 10) assert.equal(value.state, 'value', item.id);
    assert.ok(Number.isInteger(value.gp) && value.gp >= 0, item.id);
    assert.equal(value.cp, value.gp * 100, item.id);
    assert.equal(value.display, `${value.gp} зм`, item.id);
    assert.equal(item.cost, value.display, item.id);
  }
});

test('rule programs use exact bounded lazy artifacts without loss', () => {
  const storage = manifest.sharding.rulePrograms;
  const programKeys = new Set();
  const rulesById = new Map();
  let ruleCount = 0;
  for (const meta of manifest.files.rules) {
    const file = repoFile(meta.path);
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    const artifact = path.relative(catalogRoot, file).split(path.sep).join('/');
    assert.equal(fs.statSync(file).size, meta.bytes, meta.path);
    assert.equal(sha256(file), meta.sha256, meta.path);
    assert.ok(meta.bytes < storage.hardLimitBytes, meta.path);
    assert.equal(payload.schemaVersion, 'bg3-rule-catalog/1');
    assert.equal(payload.catalogVersion, current.catalogVersion);
    assert.equal(payload.kind, meta.kind);
    assert.equal(payload.shard, meta.shard);
    assert.equal(payload.count, meta.count);
    assert.equal(payload.rules.length, meta.count);
    assert.equal(artifact, `rules/${meta.kind}/${meta.shard}.json`);
    for (const rule of payload.rules) {
      ruleCount++;
      assert.equal(rulesById.has(rule.id), false, rule.id);
      assert.equal(shardFor(rule.id), meta.shard.slice(0, 2), rule.id);
      assert.equal(rule.artifact, artifact, rule.id);
      rulesById.set(rule.id, rule);
      for (const program of Object.values(rule.programs)) {
        assert.equal(program.artifact, artifact, program.id);
        const key = `${artifact}\0${program.id}`;
        assert.equal(programKeys.has(key), false, program.id);
        programKeys.add(key);
      }
    }
  }
  assert.equal(ruleCount, Object.values(manifest.counts.ruleDefinitions).reduce((a, b) => a + b, 0));
  assert.equal(manifest.files.rules.length, storage.shards);
  assert.equal(Math.max(...manifest.files.rules.map(meta => meta.bytes)), storage.maxBytes);
  assert.ok(storage.maxBytes < storage.hardLimitBytes);

  const index = JSON.parse(fs.readFileSync(catalogFile(manifest.entrypoints.ruleProgramIndex), 'utf8'));
  assert.equal(index.count, rulesById.size);
  assert.equal(index.storage.shards, manifest.files.rules.length);
  assert.equal(index.storage.maxBytes, storage.maxBytes);
  assert.equal(index.records.length, rulesById.size);
  for (const record of index.records) {
    const rule = rulesById.get(record.ruleId);
    assert.ok(rule, record.ruleId);
    assert.equal(record.artifact, rule.artifact);
    assert.deepEqual(Object.keys(record.programs).sort(), Object.keys(rule.programs).sort());
    for (const [profile, compact] of Object.entries(record.programs)) {
      assert.equal(compact.id, rule.programs[profile].id);
      assert.equal(compact.artifact, record.artifact);
      assert.equal(programKeys.has(`${compact.artifact}\0${compact.id}`), true, compact.id);
    }
  }

  let runtimeRefs = 0;
  const requireProgram = (artifact, programId, context) => {
    runtimeRefs++;
    assert.equal(programKeys.has(`${artifact}\0${programId}`), true, context);
  };
  for (const item of items) {
    for (const action of item.mechanics.actions || []) {
      const program = action.program || {};
      if (program.ruleProgramId) requireProgram(program.artifact, program.ruleProgramId, action.id);
    }
    for (const lifecycle of item.mechanics.lifecyclePrograms || []) {
      requireProgram(lifecycle.artifact, lifecycle.programId, lifecycle.id);
    }
  }
  const visit = (value, context) => {
    if (Array.isArray(value)) return value.forEach(row => visit(row, context));
    if (!value || typeof value !== 'object') return;
    if (value.programId && value.artifact) requireProgram(value.artifact, value.programId, context);
    for (const child of Object.values(value)) visit(child, context);
  };
  for (const meta of manifest.files.rootTemplatePrograms) {
    const payload = JSON.parse(fs.readFileSync(repoFile(meta.path), 'utf8'));
    for (const program of payload.programs) visit(program, program.id);
  }
  for (const meta of manifest.files.itemRuleLinks) {
    const payload = JSON.parse(fs.readFileSync(repoFile(meta.path), 'utf8'));
    for (const linkSet of payload.linkSets) {
      for (const link of linkSet.linked) requireProgram(link.artifact, link.programId, linkSet.id);
    }
  }
  assert.ok(runtimeRefs > 1_000);
});

test('item-v6 mechanics не содержит немых выпадений ссылок', () => {
  const ruleIds = new Set();
  for (const meta of manifest.files.rules) {
    const payload = JSON.parse(fs.readFileSync(repoFile(meta.path), 'utf8'));
    for (const rule of payload.rules) ruleIds.add(rule.bg3Id);
  }
  let linked = 0;
  for (const item of items) {
    assert.equal(item.schemaVersion, 6, item.id);
    assert.equal(item.rules.sourceType, '5e-2014-adaptation', item.id);
    const mechanics = item.mechanics;
    assert.equal(mechanics.schemaVersion, 1, item.id);
    assert.equal(mechanics.origin, 'explicit', item.id);
    assert.ok(['structured', 'manual'].includes(mechanics.mode), item.id);
    assert.equal(Array.isArray(mechanics.actions), true, item.id);
    assert.equal(Array.isArray(mechanics.interactions), true, item.id);
    assert.equal(Array.isArray(mechanics.effects), true, item.id);
    assert.equal(Array.isArray(mechanics.resolution.rolls), true, item.id);
    assert.equal(Array.isArray(mechanics.profile.matchTokens), true, item.id);
    if (mechanics.mode === 'manual') assert.ok(mechanics.manualNote.trim(), item.id);
    if (mechanics.profile.kind === 'weapon') {
      const damage = mechanics.profile.weapon.damage;
      assert.equal(Number.isInteger(damage.cnt), true, item.id);
      assert.equal(Number.isInteger(damage.sides), true, item.id);
      assert.equal(typeof mechanics.profile.weapon.damageTraits.magical, 'boolean', item.id);
    }
    const refs = mechanics.provenance.ruleReferences;
    for (const scope of ['active', 'inheritedDefaults']) {
      for (const rows of Object.values(refs[scope])) {
        for (const ref of rows) {
          linked++;
          assert.equal(ruleIds.has(ref.id), true, `${item.id} -> ${ref.id}`);
          assert.ok(ref.fields.length);
        }
      }
    }
  }
  assert.ok(linked > 10_000);
  assert.equal(manifest.integrity.allSourceRefsResolvable, true);
});

test('прямые Stats-эффекты переводятся только из структурированных полей экипировки', () => {
  const coverage = JSON.parse(fs.readFileSync(catalogFile(manifest.entrypoints.mechanicsCoverage), 'utf8'));
  const allowed = new Set(['RollBonus', 'ActionResource', 'Skill', 'AC', 'Ability', 'Advantage', 'Disadvantage', 'AbilityOverrideMinimum']);
  let mappedItems = 0, mappedEntries = 0;
  for (const item of items) {
    const mappings = item.mechanics.provenance.directEffectMappings || [];
    assert.equal(item.mechanics.effects.length, mappings.length, item.id);
    if (!mappings.length) continue;
    mappedItems++;
    mappedEntries += mappings.length;
    assert.ok(item.mechanics.equipment.slot, `${item.id}: direct effect must have an equipment gate`);
    assert.equal(item.mechanics.mode, 'structured', item.id);
    for (const mapping of mappings) {
      assert.ok(['Boosts', 'BoostsOnEquipMainHand', 'BoostsOnEquipOffHand'].includes(mapping.field), item.id);
      assert.equal(allowed.has(mapping.primitive), true, `${item.id}: ${mapping.primitive}`);
    }
  }
  assert.equal(mappedItems, coverage.directEffectMapped);
  assert.equal(mappedEntries, coverage.directEffectEntries);
  assert.equal(coverage.silentRuleDrops, 0);
});

test('TreasureTable и ItemCombos сохраняют ссылки на canonical variants', () => {
  const treasure = JSON.parse(fs.readFileSync(catalogFile(manifest.entrypoints.treasureTables), 'utf8'));
  const recipes = JSON.parse(fs.readFileSync(catalogFile(manifest.entrypoints.recipes), 'utf8'));
  const sourceStats = new Set(items.map(item => item.source.statsId).filter(Boolean));
  assert.equal(treasure.counts.rawDefinitions, 1_565);
  assert.equal(treasure.counts.definitions, 1_512);
  assert.equal(treasure.counts.standardDefinitions, 1_512);
  assert.equal(treasure.counts.honourDefinitions, 1_512);
  assert.equal(treasure.rawDefinitions.length, 1_565);
  assert.equal(treasure.definitions.length, 1_512);
  assert.equal(new Set(treasure.definitions.map(row => row.id)).size, 1_512);
  const treasureNames = new Set(treasure.definitions.map(row => row.name));
  assert.equal(treasure.definitions.filter(row => row.mergeApplied).length, 13);
  assert.equal(treasure.definitions.filter(row => row.honourOverlay).length, 7);
  assert.equal(treasure.counts.objectCategories, 87);
  assert.equal(treasure.counts.directStats, 1_581);
  assert.equal(treasure.counts.standardAssociations, 3_339);
  assert.equal(treasure.counts.honourAssociations, 3_342);
  assert.equal(treasure.executionContract.schemaVersion, 'bg3-treasure-runtime/1');
  assert.equal(treasure.executionContract.tableMode, 'all-active-subtables');
  assert.equal(treasure.executionContract.nestedTableMode, 'recursive-all-active-subtables');
  assert.equal(treasure.executionContract.externalResultsOnly, true);
  assert.deepEqual(plain(manifest.contracts.treasureRuntime), plain(treasure.executionContract));
  assert.deepEqual(plain(treasure.counts.standardGraph), {subtables:3786,entries:6080,
    entryKinds:{category:310,'root-template-name':16,stats:3498,'stats-unresolved':29,table:2227},dropModes:{forced:783,invalid:1,weighted:3002}});
  assert.deepEqual(plain(treasure.counts.honourGraph), {subtables:3786,entries:6087,
    entryKinds:{category:310,'root-template-name':16,stats:3505,'stats-unresolved':29,table:2227},dropModes:{forced:783,invalid:1,weighted:3002}});
  const treasureKinds = new Map(), dropModes = new Map(), invalidDropCounts = [];
  for (const table of treasure.definitions) {
    assert.ok(table.id.startsWith('bg3:treasure:'), table.name);
    assert.equal(table.layers.length, table.mergeApplied ? 2 : 1);
    for (const subtable of table.subtables) {
      assert.ok(['weighted', 'forced', 'manual', 'invalid'].includes(subtable.dropCount.mode), table.name);
      if (subtable.dropCount.mode === 'invalid') {
        invalidDropCounts.push({table:table.name,rolls:subtable.rolls});
        assert.equal(subtable.dropCount.valid, false, table.name);
        assert.deepEqual(subtable.dropCount.options, [], table.name);
      } else {
        assert.equal(subtable.dropCount.valid, true, table.name);
      }
      dropModes.set(subtable.dropCount.mode, (dropModes.get(subtable.dropCount.mode) || 0) + 1);
      for (const entry of subtable.entries) {
        treasureKinds.set(entry.kind, (treasureKinds.get(entry.kind) || 0) + 1);
        if (entry.kind === 'stats') assert.equal(sourceStats.has(entry.statsId), true, entry.sourceStatsRef || entry.statsId);
        if (entry.kind === 'table') assert.equal(treasureNames.has(entry.table), true, `${table.name} -> T_${entry.table}`);
        if (entry.kind === 'category') assert.ok(treasure.objectCategories[entry.category], entry.category);
        if (entry.kind === 'root-template-name') {
          assert.equal(sourceStats.has(entry.statsId), false, entry.statsId);
          assert.equal(entry.rootTemplateName, entry.statsId);
          assert.ok(entry.itemVariantIds.length, `${table.name} -> ${entry.sourceStatsRef}`);
          for (const id of entry.itemVariantIds) assert.equal(itemById.has(id), true, `${table.name} -> ${id}`);
        }
        if (entry.kind === 'stats-unresolved') assert.equal(sourceStats.has(entry.statsId), false, entry.statsId);
      }
    }
  }
  assert.equal(dropModes.get('weighted'), 3002);assert.equal(dropModes.get('forced'), 783);assert.equal(dropModes.get('invalid'), 1);
  assert.equal(dropModes.get('manual') || 0, 0);
  assert.deepEqual(invalidDropCounts, [{table:'LOW_Guildhall_FetchersBrat_Trade',rolls:'3,1;4,1,5,1;6,1'}]);
  assert.equal(treasureKinds.get('table'), 2227);assert.equal(treasureKinds.get('stats'), 3498);
  assert.equal(treasureKinds.get('category'), 310);assert.equal(treasureKinds.get('root-template-name'), 16);
  assert.equal(treasureKinds.get('stats-unresolved'), 29);
  const assertCategoryPriorities = categories => {
    let defaulted = 0, disabled = 0;
    for (const category of Object.values(categories)) for (const profile of category.profiles) {
      for (const candidate of category[profile]) {
        assert.equal(candidate.effectivePriority, candidate.priority == null ? 1 : candidate.priority);
        assert.ok(candidate.effectivePriority >= 0, `${candidate.statsId}: negative effective priority`);
        if (candidate.priority == null) defaulted++;
        if (candidate.effectivePriority === 0) disabled++;
      }
    }
    assert.ok(defaulted > 0, 'missing null -> 1 default-priority coverage');
    assert.ok(disabled > 0, 'missing explicit zero/disabled priority coverage');
  };
  assertCategoryPriorities(treasure.objectCategories);
  for (const statsId of Object.keys(treasure.directStats)) assert.equal(sourceStats.has(statsId), true, statsId);
  assert.equal(recipes.records.length, 502);
  assert.equal(recipes.executionContract.schemaVersion, 'bg3-item-combos-runtime/1');
  assert.equal(recipes.executionContract.transformIdentity, 'preserve-concrete-inventory-entry');
  assert.deepEqual(plain(manifest.contracts.recipeRuntime), plain(recipes.executionContract));
  assert.equal(recipes.counts.combinations, 251);
  assert.deepEqual(plain(recipes.counts.inputOperations), {Consume:432,Dye:42,None:39,Transform:60});
  assert.equal(recipes.counts.transformCombinations, 60);assert.equal(recipes.counts.dyeCombinations, 42);
  assert.equal(Object.keys(recipes.comboCategories).length, 9);
  assertCategoryPriorities(recipes.comboCategories);
  let categoryRefs = 0;
  for (const row of recipes.records) {
    for (const ref of row.resolvedItemReferences) {
      assert.ok(ref.itemVariantIds.length, `${row.name} -> ${ref.statsId}`);
      for (const id of ref.itemVariantIds) assert.equal(itemById.has(id), true, `${row.name} -> ${id}`);
    }
    for (const ref of row.resolvedCategoryReferences || []) {
      categoryRefs++;
      assert.equal(ref.resolved, true, `${row.name} -> ${ref.category}`);
      const category = recipes.comboCategories[ref.category];assert.ok(category, ref.category);
      for (const profile of category.profiles) for (const candidate of category[profile]) {
        assert.equal(sourceStats.has(candidate.statsId), true, candidate.statsId);
        for (const id of candidate.itemVariantIds) assert.equal(itemById.has(id), true, id);
      }
    }
  }
  assert.equal(categoryRefs, 110);
});

test('репрезентативные сигнатуры не теряют варианты и базовые D&D профили', () => {
  const byRoot = prefix => items.find(item => item.source.rootTemplateUuid === prefix);
  const findRoot = uuid => {
    const item = byRoot(uuid);
    assert.ok(item, uuid);
    return item;
  };
  const scalpel = findRoot('00353281-1abb-4de6-893b-d6bf7f748da8');
  assert.equal(scalpel.mechanics.profile.kind, 'weapon');
  assert.deepEqual(plain(scalpel.mechanics.profile.weapon.damage), {
    cnt: 1, sides: 4, mod: 0, manual: false, type: 'колющий',
  });
  assert.equal(scalpel.mechanics.profile.weapon.finesse, true);
  assert.equal(scalpel.mechanics.profile.weapon.thrown, true);

  const leather = findRoot('02ae5d88-8044-43df-8363-02a2900776db');
  assert.equal(leather.mechanics.profile.kind, 'armor');
  assert.equal(leather.mechanics.profile.armor.acRule.base, 11);
  const vanity = findRoot('0004915f-4399-4ae1-beab-85a62c11b674');
  assert.notEqual(vanity.mechanics.profile.kind, 'armor');
  const world = findRoot('0015edb7-b2bb-45e5-baa2-8c63d37b98a5');
  assert.equal(world.source.classification, 'world-object');
  const duplicate = findRoot('000cfc9f-b973-48e7-a5c8-f2992a47a943');
  assert.equal(duplicate.source.classification, 'duplicate');
  const noStats = findRoot('03e30687-2fc3-4b3a-84be-49d1d06991a0');
  assert.equal(noStats.source.statsId, null);
  assert.equal(noStats.mechanics.mode, 'manual');
});

test('ActionType31 tadpole overlay is bound to exactly two source roots, three selected-profile variants, and exact icons', () => {
  const roots = new Set([
    '1ec327be-3b7f-4502-9586-860e057e09ae',
    'd1f2b294-fdf8-43df-8d11-19743077cb68',
  ]);
  const jars = items.filter(item => roots.has(item.source && item.source.rootTemplateUuid));
  assert.equal(jars.length, 3);
  assert.deepEqual(
    Object.fromEntries([...roots].map(root => [root, jars.filter(item => item.source.rootTemplateUuid === root).length])),
    {
      '1ec327be-3b7f-4502-9586-860e057e09ae': 1,
      'd1f2b294-fdf8-43df-8d11-19743077cb68': 2,
    },
  );
  const actionIds = new Set();
  for (const item of jars) {
    assert.equal(item.source.classification, 'playable');
    assert.equal(item.icon.status, 'exact');
    assert.equal(fs.existsSync(repoFile(item.icon.src)), true, item.icon.src);
    const actions = (item.mechanics.actions || []).filter(action => action.special && action.special.kind === 'bg3Tadpole');
    assert.equal(actions.length, 1, item.id);
    const action = actions[0], primary = action.program.sourceAction.primary;
    assert.equal(action.labelSource, 'display-only-localization');
    assert.equal(action.special.requiresCampaignHandler, true);
    assert.equal(action.handler, 'bg3RootProgram');
    assert.deepEqual(action.consume, {kind: 'none', amount: 0});
    assert.equal(primary.actionType, 31);
    assert.equal(primary.index, 0);
    assert.equal(primary.trigger, 'OnUsePeaceActions');
    assert.deepEqual(primary.attributes, {ActionType: '31', Animation: '', Conditions: ''});
    assert.deepEqual(action.program.sourceAction.aliases, []);
    actionIds.add(action.program.id);
  }
  const allPrograms = [];
  for (const meta of manifest.files.rootTemplatePrograms) {
    const payload = JSON.parse(fs.readFileSync(repoFile(meta.path), 'utf8'));
    allPrograms.push(...payload.programs.filter(program => program.actionType === 31));
  }
  const programs = allPrograms.filter(program => program.sourceProfile === current.defaultRulesProfile);
  if (manifest.contracts.itemProfileProgramClosure) {
    assert.equal(allPrograms.length, 6);
    assert.deepEqual(
      Object.fromEntries(['honour', 'standard'].map(profile => [
        profile,
        allPrograms.filter(program => program.sourceProfile === profile).length,
      ])),
      {honour: 3, standard: 3},
    );
    const logicalPrograms = new Map();
    for (const program of allPrograms) {
      const logicalId = program.id.replace(/:root-action:(?:honour|standard):/, ':root-action:<profile>:');
      if (!logicalPrograms.has(logicalId)) logicalPrograms.set(logicalId, []);
      logicalPrograms.get(logicalId).push(program);
    }
    assert.equal(logicalPrograms.size, 3);
    for (const pair of logicalPrograms.values()) {
      assert.deepEqual(new Set(pair.map(program => program.sourceProfile)), new Set(['honour', 'standard']));
      assert.equal(new Set(pair.map(program => program.sourceRootTemplateUuid)).size, 1);
    }
  }
  assert.equal(programs.length, 3);
  assert.deepEqual(new Set(programs.map(program => program.sourceRootTemplateUuid)), roots);
  assert.deepEqual(new Set(programs.map(program => program.id)), actionIds);
  for (const program of allPrograms) {
    assert.equal(program.inherited, false);
    assert.equal(program.trigger, 'OnUsePeaceActions');
    assert.deepEqual(program.attributes, {ActionType: '31', Animation: '', Conditions: ''});
    assert.equal(program.mode, 'mixed');
    assert.deepEqual(program.summary, {typedOpcodes: 1, manualOpcodes: 1});
    assert.deepEqual(program.special, {kind: 'bg3Tadpole', requiresCampaignHandler: true});
    assert.equal(program.consequences.length, 1);
    assert.equal(program.consequences[0].reason, 'campaign-handler-required');
  }
});

test('diagnostic v3 has exactly twenty lossless A11+A30 recipe access sources and no inferred global lock', t => {
  const root=path.join(repo,'data','bg3','bg3-24532579-v3');if(!fs.existsSync(root)){t.skip('immutable v3 diagnostic catalog is not present');return;}
  const recipes=JSON.parse(fs.readFileSync(path.join(root,'recipes.json'),'utf8')),recipeIds=new Set(recipes.records.filter(row=>row.recordType==='ItemCombination').map(row=>row.name)),
    diagnosticItems=fs.readdirSync(path.join(root,'items')).filter(name=>name.endsWith('.json')).flatMap(name=>JSON.parse(fs.readFileSync(path.join(root,'items',name),'utf8')).items),
    rootPrograms=fs.readdirSync(path.join(root,'root-template-programs')).filter(name=>name.endsWith('.json')).flatMap(name=>JSON.parse(fs.readFileSync(path.join(root,'root-template-programs',name),'utf8')).programs),
    programById=new Map(rootPrograms.map(program=>[program.id,program])),bindings=[];
  for(const item of diagnosticItems){const mechanics=[item.mechanics,item.source&&item.source.honourOverlay&&item.source.honourOverlay.item&&item.source.honourOverlay.item.mechanics].filter(Boolean);
    for(const row of mechanics)for(const action of row.actions||[]){const source=action.program&&action.program.sourceAction,aliases=source&&source.aliases||[],a30=aliases.filter(alias=>alias.actionType===30);if(!a30.length)continue;
      assert.equal(action.handler,'bg3RootProgram');assert.equal(source.primary.actionType,11);assert.equal(aliases.length,1);assert.equal(a30.length,1);assert.equal(a30[0].trigger,source.primary.trigger);assert.equal(a30[0].index,source.primary.index+1);
      const recipeId=a30[0].attributes.RecipeID,program=programById.get(action.program.id);assert.ok(recipeIds.has(recipeId),recipeId);assert.ok(program,action.program.id);assert.deepEqual(program.sourceAction,source.primary);assert.deepEqual(program.sourceActionAliases,aliases);
      assert.equal(program.special.recipeId,recipeId);assert.deepEqual(program.consequences.filter(op=>op.op==='readBook').flatMap(op=>[op.recipeId,...(op.recipeIds||[])]).filter(Boolean),[recipeId]);
      assert.match(action.program.rootArtifact,/^root-template-programs\/[0-9a-f]{2}(?:-[0-9a-f]{4})?\.json$/);bindings.push({recipeId,itemId:item.id,useId:action.id,rootProgramId:action.program.id,rootArtifact:action.program.rootArtifact});}}
  assert.equal(recipeIds.size,251);assert.equal(bindings.length,20);assert.equal(new Set(bindings.map(row=>row.recipeId)).size,20,'one exact source action per gated formula');assert.equal(recipeIds.size-bindings.length,231,'recipes without A30 evidence remain discoverable/source-unrestricted');
  assert.deepEqual(bindings.find(row=>row.recipeId==='ALCH_Potion_AnimalSpeaking_AcornTruffle'),{
    recipeId:'ALCH_Potion_AnimalSpeaking_AcornTruffle',itemId:'bg3:item:rt:db5ca6a8-89cb-44d8-91d3-b22afbda8a6c:stats:Qk9PS19BbGNoZW15X1BvdGlvbkFuaW1hbFNwZWFraW5n',
    useId:'bg3-use-2493eb075a1b33b415c1',rootProgramId:'bg3:item:rt:db5ca6a8-89cb-44d8-91d3-b22afbda8a6c:stats:Qk9PS19BbGNoZW15X1BvdGlvbkFuaW1hbFNwZWFraW5n:root-action:standard:OnUsePeaceActions:0',rootArtifact:'root-template-programs/07-0000.json',
  });
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * Exhaustive, manifest-driven BG3 item audit.
 *
 * This test deliberately has no expected item total. The immutable manifest is
 * the sole cardinality authority, so the same audit covers the current catalog
 * and every later atomic publication. Dice are never generated here: the real
 * engine validators must retain player-input-required roll contracts, and each
 * BG3 action must retain validate -> one resource commit -> consequences.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonCache = new Map();
const {current, catalogRoot, manifestPath, manifest} = selectBg3Catalog(repo);

function readJson(file) {
  const absolute = path.resolve(file);
  if (!jsonCache.has(absolute)) jsonCache.set(absolute, JSON.parse(fs.readFileSync(absolute, 'utf8')));
  return jsonCache.get(absolute);
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function shardBaseFor(id) {
  return sha256Text(id).slice(0, 2);
}

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

function artifactRelative(file) {
  return path.relative(catalogRoot, file).split(path.sep).join('/');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function manifestArtifacts() {
  return Object.values(manifest.files || {}).flatMap(value => Array.isArray(value) ? value : []);
}

function countedPayload(meta, arrayKey) {
  const file = repoFile(meta.path);
  const payload = readJson(file);
  assert.equal(payload.catalogVersion, current.catalogVersion, meta.path);
  if (meta.shard != null) assert.equal(payload.shard, meta.shard, meta.path);
  if (meta.count != null) {
    assert.equal(payload.count, meta.count, meta.path);
    assert.ok(Array.isArray(payload[arrayKey]), `${meta.path}: ${arrayKey} must be an array`);
    assert.equal(payload[arrayKey].length, meta.count, meta.path);
  }
  return payload;
}

function loadRows(group, arrayKey) {
  return (manifest.files[group] || []).flatMap(meta => countedPayload(meta, arrayKey)[arrayKey]);
}

function collectOpcodes(value, out = []) {
  if (Array.isArray(value)) {
    for (const row of value) collectOpcodes(row, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (Object.prototype.hasOwnProperty.call(value, 'op')) out.push(value);
  for (const child of Object.values(value)) collectOpcodes(child, out);
  return out;
}

function assertOpcodeContract(opcode, context) {
  assert.equal(typeof opcode.op, 'string', `${context}: opcode name`);
  assert.ok(opcode.op, `${context}: empty opcode name`);
  assert.equal(typeof opcode.executable, 'boolean', `${context}: ${opcode.op} executable flag`);
  if (!opcode.executable) {
    assert.ok(String(opcode.reason || '').trim(), `${context}: ${opcode.op} needs an explicit fail-closed reason`);
  }
}

function assertProjectionRefs(projection, programKeys, context) {
  if (projection == null) return;
  assert.equal(projection.schemaVersion, 'bg3-action-rule-projection/1', context);
  assert.equal(projection.executionPolicy, 'all-reachable-opcodes-or-fail-closed', context);
  assert.ok(Array.isArray(projection.entrypoints), `${context}: entrypoints`);
  assert.ok(Array.isArray(projection.transitive), `${context}: transitive`);
  assert.ok(Array.isArray(projection.unresolved), `${context}: unresolved`);
  if (projection.unresolved.length) {
    assert.equal(projection.complete, false, `${context}: unresolved projection cannot be complete`);
    assert.ok(['mixed', 'manual'].includes(projection.mode), `${context}: unresolved projection must fail closed`);
    for (const ref of projection.unresolved) {
      assert.ok(String(ref.relation || '').trim(), `${context}: unresolved relation`);
      assert.ok(String(ref.kind || '').trim(), `${context}: unresolved kind`);
      assert.ok(String(ref.bg3Id || '').trim(), `${context}: unresolved BG3 id`);
      assert.ok(String(ref.sourceProgramId || '').trim(), `${context}: unresolved source program`);
      assert.ok(programIds.has(ref.sourceProgramId), `${context}: unresolved source program reference`);
    }
  }
  for (const ref of [...projection.entrypoints, ...projection.transitive]) {
    assert.ok(String(ref.ruleId || '').startsWith('bg3:rule:'), `${context}: ruleId`);
    assert.ok(programKeys.has(`${ref.artifact}\0${ref.programId}`), `${context}: ${ref.programId}`);
    assert.ok(['typed', 'mixed', 'manual', 'empty'].includes(ref.mode), `${context}: ${ref.mode}`);
  }
}

function compactSignature(item) {
  const mechanics = item.mechanics;
  const action = (mechanics.actions || []).map(row => [
    row.handler,
    row.cost,
    row.target,
    row.consume && row.consume.kind,
    row.program && row.program.mode,
    row.program && row.program.sourceAction && row.program.sourceAction.primary && row.program.sourceAction.primary.actionType,
    row.special && row.special.kind,
  ].join(':')).sort();
  const interaction = (mechanics.interactions || []).map(row => [
    row.handler, row.cost, row.mode || '',
  ].join(':')).sort();
  const lifecycle = (mechanics.lifecyclePrograms || []).map(row => [
    row.kind, row.gate, row.mode, row.projectionMode,
  ].join(':')).sort();
  const effects = (mechanics.effects || []).map(row => [
    row.kind || row.primitive || row.op || '', row.mode || '', row.key || row.stat || '',
  ].join(':')).sort();
  return JSON.stringify({
    classification: item.source.classification,
    category: item.source.category,
    mode: mechanics.mode,
    kind: mechanics.profile.kind,
    action,
    interaction,
    lifecycle,
    effects,
    resource: mechanics.resource ? mechanics.resource.kind || Object.keys(mechanics.resource).sort() : null,
    campaign: mechanics.campaignRules ? Object.keys(mechanics.campaignRules).sort() : null,
  });
}

function loadEngineAuditApi() {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  source += `
    globalThis.__bg3EveryItemAudit = {
      validate(item) {
        const copy = JSON.parse(JSON.stringify(item));
        upgradeItem(copy);
        const mechanics = currentMechanics(copy, 'item');
        return {
          mechanics,
          mechanicsErrors: mechanicsErrors(mechanics, 'item'),
          actionErrors: itemUseSchemaErrors(itemUsesOf(copy), itemResourceOf(copy)),
          interactionErrors: itemInteractionSchemaErrors(itemInteractionsOf(copy)),
          resourceErrors: itemResourceSchemaErrors(itemResourceOf(copy)),
          toolErrors: copy.tool ? itemToolSchemaErrors(copy.tool) : [],
          materialErrors: copy.material ? itemMaterialSchemaErrors(copy.material) : [],
          campaignErrors: itemCampaignRuleSchemaErrors(itemCampaignRules(copy)),
          actionIds: itemUsesOf(copy).map(row => row.id),
          interactionIds: itemInteractionsOf(copy).map(row => row.id),
        };
      },
      available(item, profile) { return !!bg3CatalogMaterializeItem(item, profile); },
      materialize(item, profile) {
        const copy = JSON.parse(JSON.stringify(item));
        return bg3CatalogMaterializeItem(copy, profile);
      },
      searchText(row) { return bg3CatalogSearchText(JSON.parse(JSON.stringify(row))); },
      isId(id) { return bg3CatalogIsId(id); },
      search(rows, query, opts, profile = 'standard') {
        bg3Catalog.index = {items: JSON.parse(JSON.stringify(rows))};
        bg3Catalog.preferredProfile = profile;
        return bg3CatalogSearch(query, JSON.parse(JSON.stringify(opts || {})));
      },
      summaryHtml(row) {
        const copy = JSON.parse(JSON.stringify(row));
        return bg3CatalogSummaryHTML(copy, 'bg3CatalogOpen(' + JSON.stringify(copy.id) + ')');
      },
      mechanicsSummary(item) {
        const copy = JSON.parse(JSON.stringify(item));
        return bg3CatalogItemMechanicsSummary(copy);
      },
      identityHtml(item) {
        const copy = JSON.parse(JSON.stringify(item));
        return bg3CatalogItemIdentityHTML(copy);
      },
      cardHtml(item) {
        const copy = JSON.parse(JSON.stringify(item));
        return itemCardHTML(copy, '');
      },
    };
  `;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '',
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; },
    });
    return elements.get(id);
  };
  const storage = new Map();
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {
      random() { throw new Error('engine-side dice/random generation is forbidden'); },
    }),
    Date,
    JSON,
    Blob,
    URL,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => false,
    prompt: () => null,
    alert() {},
    fetch: async () => ({ok: false, status: 599, json: async () => ({})}),
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bg3EveryItemAudit;
}

const itemShardById = new Map();
const catalogItems = [];
for (const meta of manifest.files.items || []) {
  const payload = countedPayload(meta, 'items');
  assert.deepEqual(payload.items.map(row => row.id), payload.items.map(row => row.id).slice().sort(), meta.path);
  for (const item of payload.items) {
    assert.equal(shardBaseFor(item.id), String(meta.shard).split('-', 1)[0], item.id);
    assert.equal(itemShardById.has(item.id), false, item.id);
    itemShardById.set(item.id, meta.shard);
    catalogItems.push(item);
  }
}
const arsenalQuality = readJson(catalogFile(manifest.entrypoints.itemArsenalQualityReport));
const arsenalExcludedIds = new Set(arsenalQuality.removed.map(row => row.itemId));
const items = catalogItems.filter(item => !arsenalExcludedIds.has(item.id));
const catalogItemById = new Map(catalogItems.map(item => [item.id, item]));
const itemById = new Map(items.map(item => [item.id, item]));

const roots = loadRows('rootTemplates', 'nodes');
const stats = loadRows('itemStats', 'nodes');
const rootById = new Map(roots.map(row => [row.id, row]));
const statsById = new Map(stats.map(row => [row.id, row]));

const rules = loadRows('rules', 'rules');
const ruleById = new Map();
const ruleByBg3Id = new Map();
const programKeys = new Set();
const programIds = new Set();
const programByKey = new Map();
for (const rule of rules) {
  assert.equal(ruleById.has(rule.id), false, rule.id);
  ruleById.set(rule.id, rule);
  if (!ruleByBg3Id.has(rule.bg3Id)) ruleByBg3Id.set(rule.bg3Id, []);
  ruleByBg3Id.get(rule.bg3Id).push(rule);
  for (const program of Object.values(rule.programs || {})) {
    const key = `${program.artifact}\0${program.id}`;
    assert.equal(programKeys.has(key), false, key);
    programKeys.add(key);
    assert.equal(programIds.has(program.id), false, program.id);
    programIds.add(program.id);
    programByKey.set(key, program);
  }
}

const rootProgramByKey = new Map();
const rootProgramsByArtifact = new Map();
const rootPrograms = loadRows('rootTemplatePrograms', 'programs');
for (const meta of manifest.files.rootTemplatePrograms || []) {
  const artifact = artifactRelative(repoFile(meta.path));
  const payload = countedPayload(meta, 'programs');
  rootProgramsByArtifact.set(artifact, payload.programs);
  for (const program of payload.programs) {
    const key = `${artifact}\0${program.id}`;
    assert.equal(rootProgramByKey.has(key), false, key);
    rootProgramByKey.set(key, program);
  }
}

const itemRuleLinkById = new Map();
const itemRuleLinkArtifactById = new Map();
const itemRuleLinks = [];
for (const meta of manifest.files.itemRuleLinks || []) {
  const artifact = artifactRelative(repoFile(meta.path));
  for (const linkSet of countedPayload(meta, 'linkSets').linkSets) {
    assert.equal(itemRuleLinkById.has(linkSet.id), false, linkSet.id);
    itemRuleLinkById.set(linkSet.id, linkSet);
    itemRuleLinkArtifactById.set(linkSet.id, artifact);
    itemRuleLinks.push(linkSet);
  }
}

const catalogSearch = readJson(catalogFile(manifest.entrypoints.searchIndex));
const search = {...catalogSearch, count: items.length, items: catalogSearch.items.filter(row => itemById.has(row.id))};
const iconManifest = readJson(catalogFile(manifest.entrypoints.iconManifest));
const iconByPath = new Map(iconManifest.assets.map(asset => [asset.path, asset]));
const recipeCatalog = readJson(catalogFile(manifest.entrypoints.recipes));
const recipeNames = new Set((recipeCatalog.records || []).map(row => row.name));
const recipeIds = new Set((recipeCatalog.records || []).flatMap(row => [row.id, row.name]).filter(Boolean));
const treasureCatalog = readJson(catalogFile(manifest.entrypoints.treasureTables));
const treasureNames = new Set((treasureCatalog.definitions || []).map(row => row.name));

test('manifest pins every artifact by path, size and SHA-256', () => {
  assert.equal(current.schemaVersion, 'dnd-world-bg3-current/1');
  assert.equal(current.manifest, `${current.catalogVersion}/manifest.json`);
  assert.equal(current.manifestSha256, sha256File(manifestPath));
  assert.equal(manifest.catalogVersion, current.catalogVersion);
  assert.equal(manifest.immutable, true);
  assert.equal(manifest.source.gameFilesModified, false);
  assert.equal(manifest.contracts.engine, 'D&D World 4.6');
  const seen = new Set();
  for (const meta of manifestArtifacts()) {
    assert.equal(seen.has(meta.path), false, meta.path);
    seen.add(meta.path);
    assert.ok(meta.path.startsWith(`data/bg3/${current.catalogVersion}/`), meta.path);
    const file = repoFile(meta.path);
    assert.equal(fs.existsSync(file), true, meta.path);
    assert.equal(fs.statSync(file).size, meta.bytes, meta.path);
    assert.equal(sha256File(file), meta.sha256, meta.path);
  }
  for (const [name, value] of Object.entries(manifest.integrity || {})) {
    assert.notEqual(value, false, `manifest integrity flag ${name}`);
  }
});

test('every item variant is unique, Standard-scoped and represented by one exact search summary', () => {
  assert.equal(catalogItems.length, manifest.counts.items);
  assert.equal(catalogItems.length, manifest.counts.universe.union);
  assert.equal(catalogSearch.count, catalogItems.length);
  assert.equal(catalogSearch.items.length, catalogItems.length);
  assert.equal(items.length, arsenalQuality.counts.retained);
  assert.equal(itemById.size, items.length);
  assert.equal(search.catalogVersion, current.catalogVersion);
  assert.equal(search.count, items.length);
  assert.equal(search.items.length, items.length);
  const summaryById = new Map(search.items.map(row => [row.id, row]));
  assert.equal(summaryById.size, items.length);
  let standard = 0;
  for (const item of items) {
    const context = item.id;
    assert.equal(item.schemaVersion, manifest.contracts.itemSchemaVersion, context);
    assert.match(item.id, /^bg3:item:[A-Za-z0-9:_-]+$/, context);
    assert.equal(item.source.game, 'bg3', context);
    assert.equal(item.source.buildId, manifest.source.steamBuildId, context);
    assert.equal(item.source.catalogVersion, current.catalogVersion, context);
    assert.deepEqual(item.source.profiles, ['standard'], context);
    standard += Number(item.source.profiles.includes('standard'));
    const row = summaryById.get(item.id);
    assert.ok(row, context);
    assert.equal(row.shard, itemShardById.get(item.id), context);
    assert.equal(shardBaseFor(item.id), row.shard.split('-', 1)[0], context);
    assert.equal(row.names.ru, item.i18n.ru.name, context);
    assert.equal(row.names.en, item.i18n.en.name, context);
    assert.equal(row.type, item.type, context);
    assert.equal(row.kind, item.mechanics.profile.kind, context);
    assert.equal(row.category, item.source.category, context);
    assert.equal(row.classification, item.source.classification, context);
    assert.equal(row.statsId, item.source.statsId, context);
    assert.equal('honourOnly' in row, false, context);
    assert.equal(row.icon.src, item.icon.src, context);
    assert.equal(row.icon.status, item.icon.status, context);
  }
  assert.equal(standard, arsenalQuality.counts.retained);
  assert.equal(Object.keys(manifest.counts.universe).some(key => /honou?r/i.test(key)), false);
});

test('every RU/EN display record follows the bilingual display-only policy', () => {
  for (const item of items) {
    for (const locale of ['ru', 'en']) {
      const row = item.i18n[locale];
      assert.ok(row && typeof row === 'object', `${item.id}: ${locale}`);
      assert.ok(String(row.name || '').trim(), `${item.id}: ${locale} name`);
      assert.ok(row.description == null || (typeof row.description === 'string' && row.description.trim()), `${item.id}: ${locale} description`);
      assert.ok(row.bookContent == null || typeof row.bookContent === 'string', `${item.id}: ${locale} bookContent`);
      assert.equal(typeof row.fallback, 'boolean', `${item.id}: ${locale} fallback`);
    }
    assert.equal(item.n, item.i18n.ru.name, item.id);
    assert.equal(item.desc, item.i18n.ru.description || '', item.id);
    assert.equal(item.text, item.i18n.ru.bookContent || '', item.id);
    assert.equal(item.rules.sourceType, '5e-2014-adaptation', item.id);
  }
  assert.equal(manifest.integrity.ruleProgramsNeverExecuteLocalizedText, true);
  assert.equal(manifest.integrity.storyProgramsNeverExecuteLocalizedText, true);
});

test('every source and icon reference resolves to an immutable physical record', () => {
  assert.equal(rootById.size, roots.length);
  assert.equal(statsById.size, stats.length);
  assert.equal(iconByPath.size, iconManifest.assets.length);
  assert.equal(iconManifest.uniqueAssets, iconManifest.assets.length);
  for (const asset of iconManifest.assets) {
    const file = repoFile(asset.path);
    assert.equal(fs.existsSync(file), true, asset.path);
    assert.equal(fs.statSync(file).size, asset.bytes, asset.path);
    assert.equal(sha256File(file), asset.sha256, asset.path);
    assert.ok(asset.width > 0 && asset.height > 0, asset.path);
  }
  for (const item of items) {
    if (item.source.rootTemplate) {
      const root = rootById.get(item.source.rootTemplate);
      assert.ok(root, `${item.id}: ${item.source.rootTemplate}`);
      assert.equal(root.uuid, item.source.rootTemplateUuid, item.id);
    } else {
      assert.equal(item.source.rootTemplateUuid, null, item.id);
    }
    if (item.source.stats) {
      const stat = statsById.get(item.source.stats);
      assert.ok(stat, `${item.id}: ${item.source.stats}`);
      assert.equal(stat.statsId, item.source.statsId, item.id);
    } else {
      assert.equal(item.source.statsId, null, item.id);
    }
    assert.ok(item.source.availability && typeof item.source.availability === 'object', item.id);
    assert.ok(Array.isArray(item.source.availability.treasureTables), item.id);
    assert.ok(Array.isArray(item.source.availability.recipeRecords), item.id);
    for (const table of item.source.availability.treasureTables) {
      assert.ok(treasureNames.has(table), `${item.id}: treasure ${table}`);
    }
    for (const recipe of item.source.availability.recipeRecords) {
      assert.ok(recipeNames.has(recipe), `${item.id}: recipe ${recipe}`);
    }
    const asset = iconByPath.get(item.icon.src);
    assert.ok(asset, `${item.id}: ${item.icon.src}`);
    assert.equal(item.icon.sha256, asset.sha256, item.id);
    assert.equal(item.icon.bytes, asset.bytes, item.id);
    assert.equal(item.icon.width, asset.width, item.id);
    assert.equal(item.icon.height, asset.height, item.id);
    if (item.source.classification === 'playable') {
      assert.ok(['exact', 'inherited', 'source-unknown', 'sibling-fallback'].includes(item.icon.status), item.id);
    }
    for (const action of item.mechanics.actions || []) {
      const actionAsset = iconByPath.get(action.icon && action.icon.src);
      assert.ok(actionAsset, `${item.id}/${action.id}: action icon`);
      assert.equal(action.icon.sha256, actionAsset.sha256, `${item.id}/${action.id}`);
    }
  }
});

test('real D&D World engine accepts every item mechanics/action/interaction contract', () => {
  const engine = loadEngineAuditApi();
  const summaryById = new Map(search.items.map(row => [row.id, row]));
  const noAffordanceIdentityByStatus = {
    'source-inert': 'источник явно не задаёт отдельного предметного эффекта',
    'inherited-inert': 'учитываются только унаследованные нейтральные правила',
    'manual-review': 'исходных данных недостаточно для безопасного автоматического применения',
    'runtime-blocked': 'исходная механика найдена, но её автоматическое применение заблокировано',
    'script-declared-blocked': 'скриптовый эффект найден, но пока не поддерживается движком',
    'runtime-ready': 'подтверждённая механика учитывается движком в соответствующем игровом событии',
    'runtime-partial': 'подтверждённые ветви исполняются, остальные остаются недоступными',
    'destruction-only': 'источник задаёт только последствия уничтожения самого предмета или объекта',
  };
  const standardRows=engine.search(search.items,'',{},'standard'),standardIds=new Set(standardRows.map(row=>row.id));
  assert.equal(standardRows.length,items.length);assert.equal(standardIds.size,items.length);
  assert.deepEqual(standardIds,new Set(items.filter(item=>item.source.profiles.includes('standard')).map(item=>item.id)),'каждый Standard-предмет достижим точным ID без дедупликации');
  for (const item of items) {
    const searchRow = summaryById.get(item.id);
    const searchText = engine.searchText(searchRow);
    assert.ok(searchText.trim(), `${item.id}: user search document is not empty`);
    assert.equal(searchText.includes(item.id.toLocaleLowerCase('ru')), false, `${item.id}: internal itemId is absent from user search text`);
    assert.equal(engine.available(item, 'standard'), item.source.profiles.includes('standard'), item.id);
    assert.equal(engine.available(item, 'honour'), false, item.id);
    for (const profile of item.source.profiles) {
      const effective = plain(engine.materialize(item, profile));
      assert.ok(effective, `${item.id}@${profile}`);
      const result = plain(engine.validate(effective));
      const errors = [
        ...result.mechanicsErrors,
        ...result.actionErrors.map(row => `action[${row.index}]: ${row.message}`),
        ...result.interactionErrors.map(row => `interaction[${row.index}]: ${row.message}`),
        ...result.resourceErrors,
        ...result.toolErrors,
        ...result.materialErrors,
        ...result.campaignErrors,
      ];
      assert.deepEqual(errors, [], `${item.id}@${profile}: ${errors.join(' | ')}`);
      assert.deepEqual(result.actionIds, (effective.mechanics.actions || []).map(row => row.id), `${item.id}@${profile}`);
      assert.deepEqual(result.interactionIds, (effective.mechanics.interactions || []).map(row => row.id), `${item.id}@${profile}`);
      const mechanicsSummary = plain(engine.mechanicsSummary(effective));
      assert.equal(mechanicsSummary.actions, (effective.mechanics.actions || []).length, `${item.id}@${profile}: action census`);
      assert.equal(mechanicsSummary.typedActions + mechanicsSummary.blockedActions, mechanicsSummary.actions, `${item.id}@${profile}: every action is typed or fail-closed`);
      assert.equal(mechanicsSummary.interactions, (effective.mechanics.interactions || []).length, `${item.id}@${profile}: interaction census`);
      assert.equal(mechanicsSummary.lifecycle, (effective.mechanics.lifecyclePrograms || []).length, `${item.id}@${profile}: lifecycle census`);
      assert.equal(mechanicsSummary.typedLifecycle + mechanicsSummary.blockedLifecycle, mechanicsSummary.lifecycle, `${item.id}@${profile}: every lifecycle is typed or fail-closed`);
      for (const [index, use] of (effective.mechanics.actions || []).entries()) {
        const projection = use && use.program && use.program.projection;
        if (projection && (projection.complete !== true || !['typed', 'empty'].includes(projection.mode) || (projection.unresolved || []).length)) {
          assert.equal(mechanicsSummary.actionContracts[index].state, 'blocked', `${item.id}@${profile}/${use.id}: incomplete projection is never advertised as typed`);
        }
      }
      for (const [index, ref] of (effective.mechanics.lifecyclePrograms || []).entries()) {
        const projection = ref && ref.projection;
        const grants = ref && ref.grantedActions || [];
        const interrupts = ref && ref.grantedInterrupts || [];
        const malformedProjection = !projection || projection.mode !== ref.projectionMode || projection.complete !== true
          || !['typed', 'empty'].includes(ref.projectionMode) || (projection.unresolved || []).length;
        const blockedGrant = grants.some(grant => grant.resolved !== true || grant.executable !== true
          || grant.executionPolicy !== 'all-reachable-opcodes-or-fail-closed' || !grant.projection
          || grant.projection.mode !== 'typed' || grant.projection.complete !== true || (grant.projection.unresolved || []).length
          || grant.runtimeReady === false || grant.sourceBlocked === true || grant.complete === false);
        const blockedInterrupt = interrupts.some(interrupt => interrupt.schemaVersion !== 'bg3-interrupt-projection/1'
          || interrupt.executable !== true || interrupt.complete !== true || (interrupt.blockers || []).length
          || interrupt.executionPolicy !== 'validate-player-choice-roll-single-commit-consequences' || !interrupt.projection
          || interrupt.projection.mode !== 'typed' || interrupt.projection.complete !== true || (interrupt.projection.unresolved || []).length
          || interrupt.runtimeReady === false || interrupt.sourceBlocked === true);
        if (malformedProjection || blockedGrant || blockedInterrupt) {
          assert.equal(mechanicsSummary.lifecycleContracts[index].state, 'blocked', `${item.id}@${profile}/${ref.id}: incomplete lifecycle or grant is never advertised as typed`);
        }
      }
      for (const contract of [...mechanicsSummary.actionContracts, ...mechanicsSummary.lifecycleContracts]) {
        assert.ok(['typed', 'blocked'].includes(contract.state), `${item.id}@${profile}: explicit contract state`);
        assert.ok(String(contract.reason || '').trim(), `${item.id}@${profile}: explicit contract reason`);
      }
      const identityHtml = engine.identityHtml(effective);
      assert.ok(identityHtml.includes(item.id), `${item.id}@${profile}: card exposes canonical itemId`);
      assert.equal(identityHtml.includes(item.source.catalogVersion), false, `${item.id}@${profile}: public card hides internal catalog version`);
      if (!mechanicsSummary.actions && !mechanicsSummary.interactions && !mechanicsSummary.lifecycle) {
        const effectStatus = effective.mechanics.engineCoverage?.effectStatus || '';
        const expectedIdentity = noAffordanceIdentityByStatus[effectStatus]
          || 'сведения о механике пока не удалось безопасно классифицировать';
        const escapedIdentity = expectedIdentity.replaceAll('ё', 'е').replaceAll('Ё', 'Е');
        assert.ok(identityHtml.includes(escapedIdentity), `${item.id}@${profile}: card exposes the exact ${effectStatus || 'unknown'} boundary`);
        if (effectStatus !== 'source-inert') {
          assert.doesNotMatch(identityHtml, /(?:нет отдельного игрового эффекта|не задает отдельного предметного эффекта|отдельный игровой эффект источником не задан)/iu,
            `${item.id}@${profile}: only exact source-inert coverage may claim that no separate effect exists`);
        }
        assert.doesNotMatch(identityHtml, /(?:manual-review|runtime-(?:ready|blocked|partial)|script-declared-blocked|source-inert|inherited-inert|destruction-only|решени[ея]\s+мастера)/iu,
          `${item.id}@${profile}: identity uses safe user-facing coverage text`);
      }
    }
  }
});

test('catalog search ranks canonical item identities without exposing stats IDs and emits injection-safe handlers', () => {
  const engine = loadEngineAuditApi();
  const exact = search.items.find(row => String(row.statsId || '').trim());
  assert.ok(exact, 'catalog needs one item identity fixture');
  assert.equal(plain(engine.search(search.items, exact.id, {}, 'standard'))[0].id, exact.id, 'exact itemId ranks first');
  assert.equal(plain(engine.search(search.items, exact.statsId, {}, 'standard')).some(row=>row.id===exact.id), false, 'internal statsId is not a user search handle');

  const edgeRows = [
    {id: 'bg3:item:edge-z', names: {ru: '  Альфа  ', en: 'Alpha'}, statsId: 'EDGE_Z', type: 'other', kind: 'misc', category: 'misc', classification: 'playable', rarity: '', tags: [], shard: 'aa', icon: {}},
    {id: 'bg3:item:edge-a', names: {ru: 'Бета', en: 'Beta'}, statsId: 'EDGE_A', type: 'other', kind: 'misc', category: 'misc', classification: 'playable', rarity: '', tags: [], shard: 'aa', icon: {}},
  ];
  const ranked = plain(engine.search(edgeRows, '', {}, 'standard'));
  assert.deepEqual(ranked.map(row => row.id), ['bg3:item:edge-z', 'bg3:item:edge-a'], 'tie sorting uses the trimmed display name');
  const collisions = [edgeRows[0], {...edgeRows[1], names: {ru: edgeRows[0].id, en: edgeRows[0].statsId}}];
  assert.equal(plain(engine.search(collisions, edgeRows[0].id, {}, 'standard'))[0].id, edgeRows[0].id, 'canonical itemId outranks a colliding display name');
  assert.equal(engine.isId('bg3:item:valid_ID-1:stats:ABC'), true);
  assert.equal(engine.isId("bg3:item:x');globalThis.pwned=true;//"), false, 'script-bearing suffix is not a canonical itemId');

  const hostile = {...edgeRows[0], id: 'bg3:item:x\" onclick=\"globalThis.pwned=true', names: {ru: '<img src=x onerror=globalThis.pwned=true>', en: 'unsafe'}};
  const html = engine.summaryHtml(hostile);
  assert.equal(html.includes('<img src=x onerror='), false, 'summary escapes display markup');
  assert.equal(html.includes(' onclick="globalThis.pwned'), false, 'summary cannot terminate the onclick attribute');
  assert.ok(html.includes('&quot;'), 'open handler is encoded as a JSON string inside the HTML attribute');
});

test('strict catalog retains only complete executable lifecycle grants', () => {
  const engine = loadEngineAuditApi();
  assert.equal(items.some(item => (item.mechanics.lifecyclePrograms || []).some(ref => (ref.grantedActions || []).some(grant => grant.executable !== true))), false);
  const source = items.find(item => (item.mechanics.lifecyclePrograms || []).some(ref => (ref.grantedActions || []).some(grant => grant.executable === true)));
  const ready = plain(engine.materialize(source, 'standard'));
  assert.ok(ready, 'typed grant fixture materializes in Standard');
  const readyIndex = ready.mechanics.lifecyclePrograms.findIndex(ref => (ref.grantedActions || []).some(grant => grant.executable === true));
  assert.notEqual(readyIndex, -1, 'typed grant fixture');
  assert.equal(plain(engine.mechanicsSummary(ready)).lifecycleContracts[readyIndex].state, 'typed');

  const malformed = plain(ready);
  malformed.mechanics.lifecyclePrograms[readyIndex].projection.mode = 'mixed';
  assert.equal(plain(engine.mechanicsSummary(malformed)).lifecycleContracts[readyIndex].state, 'blocked', 'projection-mode disagreement fails closed');
});

test('strict catalog retains only complete executable lifecycle interrupts', () => {
  const engine = loadEngineAuditApi();
  assert.equal(items.some(item => (item.mechanics.lifecyclePrograms || []).some(ref => (ref.grantedInterrupts || []).some(interrupt => interrupt.executable !== true))), false);
  const source = items.find(item => (item.mechanics.lifecyclePrograms || []).some(ref => (ref.grantedInterrupts || []).some(interrupt => interrupt.executable === true)));
  const ready = plain(engine.materialize(source, 'standard'));
  assert.ok(ready, 'typed interrupt fixture materializes in Standard');
  const readyIndex = ready.mechanics.lifecyclePrograms.findIndex(ref => (ref.grantedInterrupts || []).some(interrupt => interrupt.executable === true));
  assert.notEqual(readyIndex, -1, 'ready interrupt fixture');
  assert.equal(plain(engine.mechanicsSummary(ready)).lifecycleContracts[readyIndex].state, 'typed');

  const malformed = plain(ready);
  malformed.mechanics.lifecyclePrograms[readyIndex].grantedInterrupts[0].blockers = ['synthetic-blocker'];
  assert.equal(plain(engine.mechanicsSummary(malformed)).lifecycleContracts[readyIndex].state, 'blocked', 'interrupt blocker fails closed');
});

test('strict catalog cards always expose source-backed descriptions without internal source identity', () => {
  const engine = loadEngineAuditApi();
  const missing = items.find(item => !String(item.desc || '').trim());
  const described = items.find(item => String(item.desc || '').trim());
  assert.equal(missing, undefined, 'incomplete descriptions are removed from the strict catalog');
  assert.ok(described);
  const describedHtml = engine.cardHtml(described);
  assert.equal(describedHtml.includes('Описание не указано.'), false, 'real descriptions are shown without the fallback notice');
  assert.doesNotMatch(describedHtml,/Технический источник и целостность|Root \/ Stats:|build 24532579/,'described card does not render an internal identity block');
});

test('every action has an exact causal program, player-entered rolls and one resource commit boundary', () => {
  const actionKeys = new Set();
  let actionCount = 0;
  for (const item of items) {
    const mechanics = item.mechanics;
    assert.equal(mechanics.schemaVersion, manifest.contracts.mechanicsSchemaVersion, item.id);
    assert.equal(mechanics.origin, 'explicit', item.id);
    assert.ok(['structured', 'manual'].includes(mechanics.mode), item.id);
    assert.equal(mechanics.resolution.schemaVersion, manifest.contracts.rollFormulaSchemaVersion, item.id);
    assert.equal(mechanics.resolution.inputPolicy, 'declared-results-only', item.id);
    assert.ok(Array.isArray(mechanics.resolution.rolls), item.id);
    assert.ok(Array.isArray(mechanics.effects), item.id);
    assert.ok(Array.isArray(mechanics.actions), item.id);
    assert.ok(Array.isArray(mechanics.interactions), item.id);
    assert.ok(Array.isArray(mechanics.profile.matchTokens), item.id);
    if (mechanics.profile.material) {
      assert.ok(String(mechanics.profile.material.category || '').trim(), `${item.id}: BG3 material category`);
      assert.ok(String(mechanics.profile.material.sourceStats || '').trim(), `${item.id}: BG3 material source`);
      assert.equal(mechanics.profile.material.sourceStats, item.source.statsId, `${item.id}: BG3 material source`);
    }
    if (mechanics.mode === 'manual') assert.ok(String(mechanics.manualNote || '').trim(), item.id);
    for (const action of mechanics.actions) {
      actionCount++;
      const context = `${item.id}/${action.id}`;
      assert.equal(actionKeys.has(context), false, context);
      actionKeys.add(context);
      assert.ok(String(action.label || '').trim(), context);
      assert.equal(action.labelSource, 'display-only-localization', context);
      assert.equal(action.rollPolicy, 'player-input-required', context);
      assert.ok(String(action.handler || '').trim(), `${context}: handler`);
      assert.ok(action.consume && ['none', 'item', 'charges', 'kit'].includes(action.consume.kind), context);
      assert.ok(Number.isFinite(+action.consume.amount) && +action.consume.amount >= 0, context);
      assert.equal(action.program.commitPolicy, 'item-action-contract-once', context);
      assert.match(action.program.rootArtifact, /^root-template-programs\/[0-9a-f]{2}(?:-[0-9a-f]{4})?\.json$/, context);
      const rootKey = `${action.program.rootArtifact}\0${action.program.id}`;
      const rootProgram = rootProgramByKey.get(rootKey);
      assert.ok(rootProgram, `${context}: ${rootKey}`);
      assert.equal(rootProgram.executionModel, 'validate-commit-consequences', context);
      assert.equal(rootProgram.id, action.program.sourceAction.primary.rootProgramId, context);
      assert.equal(rootProgram.mode, action.program.mode, context);
      assert.ok(Array.isArray(rootProgram.validation), context);
      assert.ok(Array.isArray(rootProgram.commit), context);
      assert.ok(Array.isArray(rootProgram.consequences), context);
      const commitBoundaries = rootProgram.commit.filter(op => op.op === 'commitFromItemAction');
      assert.equal(commitBoundaries.length, 1, `${context}: exactly one item-action commit boundary`);
      assert.equal(commitBoundaries[0].executable, true, context);
      const rootOpcodes = collectOpcodes([rootProgram.validation, rootProgram.commit, rootProgram.consequences]);
      assert.ok(rootOpcodes.length > 0, `${context}: causal program has no opcodes`);
      for (const opcode of rootOpcodes) assertOpcodeContract(opcode, context);
      for (const alias of action.program.sourceAction.aliases || []) {
        assert.ok(rootProgramByKey.has(`${action.program.rootArtifact}\0${alias.rootProgramId}`), `${context}: alias ${alias.rootProgramId}`);
        if (alias.ruleProgramId) assert.ok(programKeys.has(`${alias.artifact}\0${alias.ruleProgramId}`), `${context}: alias rule`);
      }
      if (action.handler === 'bg3RuleProgram') {
        assert.equal(action.program.invokedRuleResourceCostPolicy, 'caller-item-action', context);
      }
      if (action.program.ruleProgramId) {
        if (action.program.invokedRuleResourceCostPolicy != null) {
          assert.equal(action.program.invokedRuleResourceCostPolicy, 'caller-item-action', context);
        }
        assert.ok(programKeys.has(`${action.program.artifact}\0${action.program.ruleProgramId}`), `${context}: rule program`);
        assertProjectionRefs(action.program.projection, programKeys, context);
      }
      if (action.handler === 'bg3RecipeProgram') {
        const special = action.special || action.program.special;
        assert.ok(special && ['bg3Recipe', 'bg3RecipeUnlock'].includes(special.kind), context);
        if (special.recipeId) assert.ok(recipeIds.has(special.recipeId), `${context}: ${special.recipeId}`);
        for (const recipe of special.matchingRecipeIds || []) assert.ok(recipeNames.has(recipe), `${context}: ${recipe}`);
      }
    }
  }
  assert.equal(actionCount,
    items.reduce((total, item) => total + (item.mechanics.actions || []).length, 0),
    'strict Full Arsenal action census');
  assert.equal(actionKeys.size, actionCount);
});

test('rule, root, lifecycle and item-link programs resolve with zero silent drops', () => {
  assert.equal(manifest.integrity.ruleProgramsHaveNoSilentDrops, true);
  for (const rule of rules) {
    assert.ok(iconByPath.has(rule.icon.src), `${rule.id}: icon`);
    assert.equal(rule.icon.sha256, iconByPath.get(rule.icon.src).sha256, rule.id);
    for (const program of Object.values(rule.programs || {})) {
      const context = program.id;
      assert.equal(program.schemaVersion, manifest.contracts.ruleProgramSchemaVersion, context);
      assert.equal(program.sourceRuleId, rule.id, context);
      assert.equal(program.executionModel, 'validate-commit-consequences', context);
      assert.equal(program.rollPolicy, 'player-input-required', context);
      assert.equal(program.localizedTextExecutable, false, context);
      assert.equal(program.summary.silentDrops, 0, context);
      assert.equal(program.summary.sourceFields, program.fields.length, context);
      const opcodes = program.fields.flatMap(field => collectOpcodes(field.bytecode));
      assert.equal(program.summary.typedOpcodes + program.summary.manualOpcodes, opcodes.length, context);
      for (const opcode of opcodes) assertOpcodeContract(opcode, context);
    }
  }
  for (const program of rootPrograms) {
    assert.equal(program.executionModel, 'validate-commit-consequences', program.id);
    const opcodes = collectOpcodes([program.validation, program.commit, program.consequences]);
    for (const opcode of opcodes) assertOpcodeContract(opcode, program.id);
    assert.equal(program.summary.typedOpcodes + program.summary.manualOpcodes, opcodes.length, program.id);
  }
  for (const linkSet of itemRuleLinks) {
    assert.ok(catalogItemById.has(linkSet.itemId), linkSet.id);
    assert.equal(linkSet.profile, 'standard', linkSet.id);
    assert.equal(linkSet.unresolved.length, 0, linkSet.id);
    for (const linked of linkSet.linked) {
      assert.ok(programKeys.has(`${linked.artifact}\0${linked.programId}`), `${linkSet.id}: ${linked.programId}`);
    }
  }
  for (const item of catalogItems) {
    const linkRef = item.mechanics.rulePrograms;
    const linkSet = itemRuleLinkById.get(linkRef.id);
    assert.ok(linkSet, `${item.id}: ${linkRef.id}`);
    assert.equal(itemRuleLinkArtifactById.get(linkRef.id), linkRef.artifact, item.id);
    assert.equal(linkSet.itemId, item.id, item.id);
    assert.equal(linkSet.profile, linkRef.profile, item.id);
    assert.equal(linkRef.unresolvedCount, 0, item.id);
    assert.equal(linkSet.unresolved.length, 0, item.id);
    assert.equal(linkRef.linkedCount, linkSet.linked.length, item.id);
    assert.deepEqual(plain(linkSet.ruleReferences), plain(item.mechanics.provenance.ruleReferences), item.id);
    for (const linked of linkSet.linked) {
      assert.ok(programKeys.has(`${linked.artifact}\0${linked.programId}`), `${item.id}: ${linked.programId}`);
    }
    const rootRef = item.mechanics.rootTemplatePrograms;
    assert.ok(rootProgramsByArtifact.has(rootRef.artifact), `${item.id}: ${rootRef.artifact}`);
    assert.equal(rootRef.profile, linkRef.profile, item.id);
    const ownRootPrograms = rootProgramsByArtifact.get(rootRef.artifact)
      .filter(program => program.id.startsWith(`${item.id}:root-action:${rootRef.profile}:`));
    assert.equal(ownRootPrograms.length, rootRef.count, item.id);
    for (const lifecycle of item.mechanics.lifecyclePrograms || []) {
      const context = `${item.id}/${lifecycle.id}`;
      assert.ok(programKeys.has(`${lifecycle.artifact}\0${lifecycle.programId}`), context);
      assert.equal(lifecycle.executionPolicy, 'preflight-fail-closed', context);
      assertProjectionRefs(lifecycle.projection, programKeys, context);
      if (lifecycle.sourceApplication) {
        assert.equal(lifecycle.sourceApplication.executionPolicy, 'all-opcodes-or-fail-closed', context);
        for (const opcode of collectOpcodes(lifecycle.sourceApplication.bytecode)) assertOpcodeContract(opcode, context);
      }
      for (const granted of [...(lifecycle.grantedActions || []), ...(lifecycle.grantedInterrupts || [])]) {
        assert.equal(typeof granted.executable, 'boolean', context);
        if (granted.schemaVersion === 'bg3-interrupt-projection/1') {
          assert.ok(programKeys.has(`${granted.artifact}\0${granted.programId}`), context);
          assertProjectionRefs(granted.projection, programKeys, context);
          assert.equal(typeof granted.complete, 'boolean', context);
          assert.ok(Array.isArray(granted.blockers), context);
          assert.equal(granted.executionPolicy, 'validate-player-choice-roll-single-commit-consequences', context);
        } else {
          assert.equal(typeof granted.resolved, 'boolean', context);
          if (granted.resolved) {
            assert.ok(programKeys.has(`${granted.artifact}\0${granted.programId}`), context);
            assertProjectionRefs(granted.projection, programKeys, context);
          } else {
            assert.equal(granted.executable, false, context);
            assert.equal(granted.executionPolicy, 'fail-closed', context);
            assert.ok(String(granted.spellId || granted.interruptId || '').trim(), `${context}: unresolved grant identity`);
          }
        }
      }
    }
  }
  const coverage = readJson(catalogFile(manifest.entrypoints.mechanicsCoverage));
  assert.equal(coverage.silentRuleDrops, 0);
});

test('story references and causal program shards resolve to exact catalog variants', () => {
  const story = readJson(catalogFile(manifest.entrypoints.storyItems));
  assert.equal(story.catalogVersion, current.catalogVersion);
  const compactById = new Map((story.links || []).map(link => [link.id, link]));
  assert.equal(compactById.size, story.counts.linkedBlocks);
  for (const [itemId, links] of Object.entries(story.itemLinks || {})) {
    assert.ok(catalogItemById.has(itemId), itemId);
    assert.ok(Array.isArray(links), itemId);
    for (const linkId of links) assert.ok(compactById.has(linkId), `${itemId}: ${linkId}`);
  }
  const sourceArchives = new Map();
  for (const meta of manifest.files.storySourceArchives || []) {
    const archive = readJson(repoFile(meta.path));
    assert.equal(archive.schemaVersion, 'bg3-story-source-archive/1', meta.path);
    assert.equal(archive.catalogVersion, current.catalogVersion, meta.path);
    assert.equal(archive.linkId, meta.linkId, meta.path);
    assert.deepEqual(Object.keys(archive.fields).sort(), meta.fields, meta.path);
    assert.equal(sha256Text(`${JSON.stringify(archive.fields)}\n`), archive.fieldsSha256, meta.path);
    assert.equal(archive.fieldsSha256, meta.fieldsSha256, meta.path);
    assert.equal(sourceArchives.has(archive.linkId), false, archive.linkId);
    sourceArchives.set(archive.linkId, archive);
  }
  const fullById = new Map();
  for (const meta of manifest.files.storyPrograms || []) {
    const payload = countedPayload(meta, 'links');
    for (const storedLink of payload.links) {
      let link = storedLink;
      if (storedLink.sourceArchive) {
        const archive = sourceArchives.get(storedLink.id);
        assert.ok(archive, storedLink.id);
        assert.equal(storedLink.sourceArchive.fieldsSha256, archive.fieldsSha256, storedLink.id);
        assert.deepEqual(storedLink.sourceArchive.fields, Object.keys(archive.fields).sort(), storedLink.id);
        link = structuredClone(storedLink);
        delete link.sourceArchive;
        Object.assign(link, archive.fields);
        if (Object.hasOwn(archive.fields, 'references')) {
          assert.equal(Object.hasOwn(storedLink, 'references'), false, storedLink.id);
          assert.ok((storedLink.storyEntrypoints || []).every(row => row.complete !== true && row.executable !== true), storedLink.id);
        }
      }
      assert.equal(fullById.has(link.id), false, link.id);
      fullById.set(link.id, link);
      assert.equal(shardBaseFor(link.id), String(meta.shard).split('-', 1)[0], link.id);
      assert.equal(link.executionModel, 'validate-commit-consequences', link.id);
      assert.equal(link.program.executionModel, 'validate-commit-consequences', link.id);
      assert.equal(link.program.rollPolicy, 'player-input-required', link.id);
      assert.equal(link.program.localizedTextExecutable, false, link.id);
      for (const reference of link.references || []) {
        assert.ok(reference.itemVariantIds.length > 0, `${link.id}: ${reference.uuid}`);
        for (const itemId of reference.itemVariantIds) assert.ok(catalogItemById.has(itemId), `${link.id}: ${itemId}`);
      }
    }
  }
  assert.equal(fullById.size, compactById.size);
  for (const compact of compactById.values()) {
    const full = fullById.get(compact.id);
    assert.ok(full, compact.id);
    assert.equal(compact.shard.split('-', 1)[0], shardBaseFor(compact.id), compact.id);
    assert.deepEqual(new Set(compact.itemVariantIds), new Set((full.references || []).flatMap(ref => ref.itemVariantIds)), compact.id);
  }
  if (Object.prototype.hasOwnProperty.call(manifest.integrity, 'storyPlacedReferencesUseOneExactPlacementVariant')) {
    assert.equal(manifest.integrity.storyPlacedReferencesUseOneExactPlacementVariant, true);
    assert.equal(manifest.integrity.storyPlacedReferencesNeverBroadenRootVariants, true);
  }
});

test('world placements resolve every profile overlay to one exact item variant when published', () => {
  const hasEntrypoint = Boolean(manifest.entrypoints.itemPlacements);
  const hasFiles = Array.isArray(manifest.files.itemPlacements) && Array.isArray(manifest.files.itemPlacementIndex);
  assert.equal(hasEntrypoint, hasFiles, 'placement entrypoint and shard sets must be published atomically');
  if (!hasEntrypoint) return;
  assert.ok(Array.isArray(manifest.files.placementActionPrograms) && manifest.files.placementActionPrograms.length > 0,
    'placement program shards are part of the same atomic publication');
  const placementRoot = readJson(catalogFile(manifest.entrypoints.itemPlacements));
  assert.equal(placementRoot.schemaVersion, 'bg3-item-placement-index/1');
  assert.equal(placementRoot.catalogVersion, current.catalogVersion);
  assert.equal(placementRoot.immutable, true);
  const fullById = new Map();
  for (const meta of manifest.files.itemPlacements) {
    const payload = countedPayload(meta, 'placements');
    assert.equal(payload.schemaVersion, 'bg3-item-placement-shard/1', meta.path);
    for (const placement of payload.placements) {
      assert.equal(fullById.has(placement.id), false, placement.id);
      fullById.set(placement.id, placement);
      assert.equal(placement.id, `bg3:placement:${placement.instanceUuid}`, placement.id);
      assert.equal(shardBaseFor(placement.id), String(meta.shard).split('-', 1)[0], placement.id);
      assert.equal(placement.placementEpoch, 0, placement.id);
      for (const [profile, overlay] of Object.entries(placement.effectiveByProfile)) {
        const item = catalogItemById.get(overlay.variantId);
        assert.ok(item, `${placement.id}/${profile}: ${overlay.variantId}`);
        assert.ok(item.source.profiles.includes(profile), `${placement.id}/${profile}`);
        assert.equal(item.source.rootTemplateUuid, overlay.rootTemplateUuid, `${placement.id}/${profile}`);
        if (overlay.directStatsId) assert.equal(item.source.statsId, overlay.directStatsId, `${placement.id}/${profile}`);
        assert.notEqual(overlay.variantResolution, 'ambiguous-fail-closed', `${placement.id}/${profile}`);
      }
    }
  }
  const compactById = new Map();
  for (const meta of manifest.files.itemPlacementIndex) {
    const payload = countedPayload(meta, 'placements');
    assert.equal(payload.schemaVersion, 'bg3-item-placement-index-shard/1', meta.path);
    for (const compact of payload.placements) {
      assert.equal(compactById.has(compact.id), false, compact.id);
      compactById.set(compact.id, compact);
      assert.equal(shardBaseFor(compact.id), String(meta.shard).split('-', 1)[0], compact.id);
      assert.ok(fullById.has(compact.id), compact.id);
      assert.equal(compact.shard, (manifest.files.itemPlacements.find(row => row.shard === compact.shard) || {}).shard, compact.id);
      const full = fullById.get(compact.id);
      assert.deepEqual(plain(compact.effectiveByProfile), plain(full.effectiveByProfile), compact.id);
    }
  }
  assert.equal(fullById.size, placementRoot.counts.placements);
  assert.equal(compactById.size, fullById.size);
  assert.deepEqual(placementRoot.storage.index.indexShards, manifest.files.itemPlacementIndex.map(row => row.shard));
  assert.equal(placementRoot.storage.records.shards, manifest.files.itemPlacements.length);
  const programSetById = new Map(), programArtifactBySet = new Map();let directPrograms = 0;
  for (const meta of manifest.files.placementActionPrograms) {
    const payload = countedPayload(meta, 'programSets');
    assert.equal(payload.schemaVersion, 'bg3-placement-action-program-shard/1', meta.path);
    assert.equal(payload.catalogVersion, current.catalogVersion, meta.path);
    assert.equal(payload.sourceBuildId, placementRoot.sourceBuildId, meta.path);
    assert.equal(payload.shard, meta.shard, meta.path);
    const relative = path.relative(catalogRoot, repoFile(meta.path)).split(path.sep).join('/');
    for (const set of payload.programSets) {
      assert.equal(programSetById.has(set.id), false, set.id);
      assert.equal(set.schemaVersion, 'bg3-placement-action-program-set/1', set.id);
      assert.equal(set.instanceUuid, set.id.split(':')[2], set.id);
      assert.match(set.definitionId, new RegExp(`^bg3:placement-definition:${set.instanceUuid}:`), set.id);
      assert.equal(typeof set.definitionSha256, 'string', set.id);
      assert.match(set.definitionSha256, /^[0-9a-f]{64}$/, set.id);
      assert.deepEqual(set.profiles, ['standard'], set.id);
      assert.ok(Array.isArray(set.programs), set.id);directPrograms += set.programs.length;
      for (const program of set.programs) {
        assert.equal(program.schemaVersion, 'bg3-placement-action-program/1', program.id);
        assert.equal(program.instanceUuid, set.instanceUuid, program.id);
        assert.equal(program.definitionId, set.definitionId, program.id);
        assert.equal(program.programSetId, set.id, program.id);
        assert.equal(program.executionModel, 'validate-commit-consequences', program.id);
        assert.equal(program.commitPolicy, 'placement-action-contract-once', program.id);
        assert.equal(program.summary.typedOpcodes + program.summary.manualOpcodes, program.bytecode.length, program.id);
        if (program.mode === 'typed') {
          assert.equal(program.sourceAction.actionType, 3, program.id);
          assert.ok(program.bytecode.some(op => op.op === 'teleport' && op.executable === true), program.id);
        } else {
          assert.equal(program.failClosed, true, program.id);
          assert.ok(program.bytecode.every(op => op.executable === false), program.id);
        }
      }
      programSetById.set(set.id, set);programArtifactBySet.set(set.id, relative);
    }
  }
  assert.equal(programSetById.size, manifest.counts.placementActionProgramSets);
  assert.equal(directPrograms, manifest.counts.placementActionPrograms);
  assert.equal(programSetById.size, placementRoot.counts.directActionProgramSets);
  assert.equal(directPrograms, placementRoot.counts.directActionPrograms);
  for (const placement of fullById.values()) for (const [profile, overlay] of Object.entries(placement.effectiveByProfile)) {
    if (!overlay.directActionProgramSetId) {
      assert.deepEqual(overlay.directActionProgramIds, [], `${placement.id}/${profile}`);continue;
    }
    const set = programSetById.get(overlay.directActionProgramSetId);assert.ok(set, `${placement.id}/${profile}`);
    assert.equal(set.definitionId, overlay.definitionId, `${placement.id}/${profile}`);
    assert.equal(programArtifactBySet.get(set.id), overlay.directActionProgramArtifact, `${placement.id}/${profile}`);
    assert.deepEqual(overlay.directActionProgramIds, set.programs.map(program => program.id), `${placement.id}/${profile}`);
  }
  for (const name of [
    'placementRootsResolvable',
    'placementDirectStatsPairsResolvable',
    'placementVariantsUnambiguous',
    'placementCollisionsResolvedByProfileOrder',
    'placementShardsWithinBudget',
    'placementActionProgramRefsExhaustive',
    'placementUnknown35FailsClosed',
    'placementTypedProgramsAreDirectTeleportOnly',
  ]) assert.equal(manifest.integrity[name], true, name);
});

test('every variant belongs to one deterministic mechanics-signature group with a representative fixture', t => {
  const groups = new Map();
  const profileGroups = new Map();
  let effectiveProfileRecords = 0;
  for (const item of items) {
    const signature = compactSignature(item);
    const digest = sha256Text(signature);
    if (!groups.has(digest)) groups.set(digest, {signature, count: 0, representative: item.id});
    const group = groups.get(digest);
    assert.equal(group.signature, signature, `${item.id}: mechanics signature hash collision`);
    group.count++;
    if (item.id < group.representative) group.representative = item.id;
    for (const profile of item.source.profiles) {
      effectiveProfileRecords++;
      const effective = item;
      const profileSignature = compactSignature(effective);
      const profileDigest = sha256Text(profileSignature);
      if (!profileGroups.has(profileDigest)) profileGroups.set(profileDigest, {
        signature: profileSignature, count: 0, representative: `${item.id}@${profile}`,
      });
      const profileGroup = profileGroups.get(profileDigest);
      assert.equal(profileGroup.signature, profileSignature, `${item.id}@${profile}: mechanics signature hash collision`);
      profileGroup.count++;
      if (`${item.id}@${profile}` < profileGroup.representative) profileGroup.representative = `${item.id}@${profile}`;
    }
  }
  assert.equal([...groups.values()].reduce((sum, group) => sum + group.count, 0), items.length);
  for (const group of groups.values()) assert.ok(itemById.has(group.representative), group.representative);
  assert.equal(effectiveProfileRecords, arsenalQuality.counts.retained);
  assert.equal([...profileGroups.values()].reduce((sum, group) => sum + group.count, 0), effectiveProfileRecords);
  const ranked = [...groups.entries()]
    .map(([signature, group]) => ({signature, count: group.count, representative: group.representative}))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
  const fixtureDigest = sha256Text(JSON.stringify(ranked.map(row => [row.signature, row.count, row.representative])));
  t.diagnostic(JSON.stringify({
    catalogVersion: current.catalogVersion,
    itemVariants: items.length,
    mechanicsSignatures: groups.size,
    effectiveProfileRecords,
    effectiveProfileMechanicsSignatures: profileGroups.size,
    fixtureDigest,
    representativeFixtures: ranked.slice(0, 24),
  }));
});

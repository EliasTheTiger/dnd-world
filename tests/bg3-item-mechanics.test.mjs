import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {current, catalogRoot, manifest} = selectBg3Catalog(repo);
const revision = Number(/^bg3-24532579-v(\d+)$/.exec(current.catalogVersion)?.[1] || 0);
const requiresMechanics = {skip: revision < 10 ? 'requires a selected v10+ catalog' : false};
const COVERAGE_SCHEMA = 'bg3-item-engine-coverage/1';
const SOURCE_FACTS_SCHEMA = 'bg3-item-source-facts/1';
const DESCRIPTION_STATES = new Set(['source-localized', 'source-absent', 'unresolved-handle']);
const RUNTIME_STATES = new Set(['ready', 'partial', 'blocked', 'inert', 'manual-review']);
const EFFECT_STATES = new Set([
  'runtime-ready',
  'runtime-partial',
  'runtime-blocked',
  'destruction-only',
  'script-declared-blocked',
  'inherited-inert',
  'source-inert',
  'manual-review',
]);
const COUNT_KEYS = [
  'readyActions',
  'blockedActions',
  'readyLifecycle',
  'blockedLifecycle',
  'genericInteractions',
  'directEffects',
  'readyRootPrograms',
  'blockedRootPrograms',
  'onDestroyPrograms',
  'activeRuleReferences',
  'blockedDescriptors',
];
const SOURCE_FACT_KEYS = [
  'armorType',
  'improvisedWeapon',
  'itemUseType',
  'maxStack',
  'movable',
  'objectArmor',
  'pickable',
  'resistances',
  'supplyValue',
  'useCosts',
  'vitality',
];
const SOURCE_FACT_SCOPES = Object.freeze({
  armorType: 'equipment',
  improvisedWeapon: 'inventory',
  itemUseType: 'item-use',
  maxStack: 'inventory',
  movable: 'world-object',
  objectArmor: 'item-object',
  pickable: 'world-object',
  resistances: 'item-object',
  supplyValue: 'item-use',
  useCosts: 'item-use',
  vitality: 'item-object',
});
const EXPECTED_PROFILE_TOTALS = {
  standard: {
    materializations: manifest.counts.itemMechanics.standard.materializations,
    readyActions: manifest.counts.itemMechanics.standard.readyActions,
    readyLifecycle: manifest.counts.itemMechanics.standard.readyLifecycle,
    genericInteractions: manifest.counts.itemMechanics.standard.genericInteractions,
    directEffects: manifest.counts.itemMechanics.standard.directEffects,
    blockedDescriptors: manifest.counts.itemMechanics.standard.highConfidenceUnboundGaps,
  },
};
const REPRESENTATIVES = {
  healingPotion: 'bg3:item:rt:efa94853-b819-402d-a257-5c1d56c97992:stats:T0JKX1BvdGlvbl9IZWFsaW5n',
  magicRing: 'bg3:item:rt:eb4e9410-3d33-4986-a5c2-8642ca5bbfc4:stats:REVOX1RoaWVmbGluZ19SaW5nNQ',
  elementalInfusionRing: 'bg3:item:rt:9ce563ca-82b0-4c28-bd82-8640fd0a5be3:stats:TUFHX0VsZW1lbnRhbEdpc2hfRWxlbWVudGFsSW5mdXNpb25fUmluZw',
  shadowLantern: 'bg3:item:rt:c9ebcfae-8c9a-4acc-8a30-da7830b32121:stats:X09USEVSX3c',
};
const compareStrings = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

const items = revision >= 10
  ? manifest.files.items.flatMap(meta => readJson(repoFile(meta.path)).items)
  : [];
const arsenalQuality = revision >= 10
  ? readJson(catalogFile(manifest.entrypoints.itemArsenalQualityReport))
  : {removed: [], counts: {retained: 0}};
const arsenalExcludedIds = new Set(arsenalQuality.removed.map(row => row.itemId));
const strictItems = items.filter(item => !arsenalExcludedIds.has(item.id));
const itemById = new Map(items.map(item => [item.id, item]));

function materializationsFor(item) {
  return (item.source?.profiles || []).map(profile => ({
    item,
    profile,
    bundle: item,
  }));
}

const materializations = items.flatMap(materializationsFor);

function expectedDescriptionStatus(item) {
  if (item.i18n?.ru?.description || item.i18n?.en?.description) return 'source-localized';
  if (item.source?.localizationHandles?.description?.id) return 'unresolved-handle';
  return 'source-absent';
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row.bundle.mechanics.engineCoverage.counts[key], 0);
}

function assertSortedUniqueStrings(values, context) {
  assert.ok(Array.isArray(values), context);
  assert.ok(values.every(value => typeof value === 'string' && value.trim()), context);
  assert.deepEqual(values, [...new Set(values)].sort(compareStrings), context);
}

test('v10 item mechanics builder reproduces the committed immutable release', {
  ...requiresMechanics,
  timeout: 180_000,
}, () => {
  const result = spawnSync(process.execPath, [
    path.join(repo, 'scripts', 'build-bg3-item-mechanics.mjs'),
    '--check',
  ], {cwd: repo, encoding: 'utf8', timeout: 170_000});
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('all retained Standard items expose explicit mechanics coverage and source facts', requiresMechanics, () => {
  assert.equal(items.length, manifest.counts.items);
  assert.equal(itemById.size, items.length, 'item IDs must remain unique');
  assert.equal(materializations.length, items.length);
  assert.deepEqual(new Set(materializations.map(row => row.profile)), new Set(['standard']));

  for (const {item, profile, bundle} of materializations) {
    const context = `${item.id}:${profile}`;
    const mechanics = bundle.mechanics;
    const coverage = mechanics?.engineCoverage;
    const sourceFacts = mechanics?.sourceFacts;
    assert.equal(typeof bundle.props, 'string', `${context}: props type`);
    assert.ok(bundle.props.trim(), `${context}: readable props summary`);
    assert.equal(coverage?.schemaVersion, COVERAGE_SCHEMA, context);
    assert.equal(coverage.profile, profile, `${context}: profile`);
    assert.ok(DESCRIPTION_STATES.has(coverage.descriptionStatus), `${context}: descriptionStatus`);
    assert.equal(coverage.descriptionStatus, expectedDescriptionStatus(item), `${context}: source description state`);
    assert.ok(RUNTIME_STATES.has(coverage.runtimeState), `${context}: runtimeState`);
    assert.ok(EFFECT_STATES.has(coverage.effectStatus), `${context}: effectStatus`);
    assertSortedUniqueStrings(coverage.sourceArtifacts, `${context}: sourceArtifacts`);
    assert.ok(coverage.sourceArtifacts.length > 0, `${context}: source artifacts are traceable`);
    assertSortedUniqueStrings(coverage.blockerCodes, `${context}: blockerCodes`);
    assertSortedUniqueStrings(coverage.characteristicIssues, `${context}: characteristicIssues`);
    assert.ok(Array.isArray(coverage.blockedDescriptors), `${context}: blockedDescriptors`);
    assert.deepEqual(Object.keys(coverage.counts).sort(), [...COUNT_KEYS].sort(), `${context}: count fields`);
    for (const key of COUNT_KEYS) {
      assert.ok(Number.isInteger(coverage.counts[key]) && coverage.counts[key] >= 0, `${context}: ${key}`);
    }
    assert.equal(coverage.counts.readyActions + coverage.counts.blockedActions,
      mechanics.actions.length, `${context}: action accounting`);
    assert.equal(coverage.counts.readyLifecycle + coverage.counts.blockedLifecycle,
      mechanics.lifecyclePrograms.length, `${context}: lifecycle accounting`);
    assert.equal(coverage.counts.genericInteractions, mechanics.interactions.length,
      `${context}: generic interaction accounting`);
    assert.equal(coverage.counts.directEffects, mechanics.effects.length,
      `${context}: direct effect accounting`);
    assert.equal(coverage.counts.activeRuleReferences,
      Object.values(mechanics.provenance.ruleReferences.active).reduce((total, refs) => total + refs.length, 0),
      `${context}: active rule reference accounting`);
    assert.equal(coverage.counts.readyRootPrograms + coverage.counts.blockedRootPrograms,
      mechanics.rootTemplatePrograms.count, `${context}: root program accounting`);
    assert.ok(coverage.counts.onDestroyPrograms <= mechanics.rootTemplatePrograms.count,
      `${context}: OnDestroy accounting`);
    assert.equal(coverage.counts.blockedDescriptors, coverage.blockedDescriptors.length,
      `${context}: blocked descriptor accounting`);

    assert.equal(sourceFacts?.schemaVersion, SOURCE_FACTS_SCHEMA, context);
    assert.equal(sourceFacts.profile, profile, `${context}: source fact profile`);
    assert.equal(sourceFacts.sourceRootTemplateUuid, item.source.rootTemplateUuid,
      `${context}: source root template`);
    assert.equal(sourceFacts.sourceStatsId, item.source.statsId || null,
      `${context}: source Stats record`);
    assert.deepEqual(Object.keys(sourceFacts.facts).sort(), SOURCE_FACT_KEYS,
      `${context}: exhaustive source fact fields`);
    for (const [key, fact] of Object.entries(sourceFacts.facts)) {
      assert.ok(fact && (fact.state === 'value' || fact.state === 'unknown-source'),
        `${context}: ${key} state`);
      assert.ok(typeof fact.sourceField === 'string' && fact.sourceField.trim(),
        `${context}: ${key} sourceField`);
      assert.equal(fact.scope, SOURCE_FACT_SCOPES[key], `${context}: ${key} scope`);
      assert.equal(Object.prototype.hasOwnProperty.call(fact, 'value'), fact.state === 'value',
        `${context}: ${key} value presence`);
    }
  }

  assert.equal(strictItems.length, arsenalQuality.counts.retained);
  assert.deepEqual(Object.fromEntries(['source-localized', 'source-absent', 'unresolved-handle'].map(state => [
    state,
    strictItems.filter(item => expectedDescriptionStatus(item) === state).length,
  ])), {'source-localized': strictItems.length, 'source-absent': 0, 'unresolved-handle': 0});
});

test('coverage retains exact ready totals and explicitly blocks every high-confidence unbound source gap', requiresMechanics, () => {
  for (const [profile, expected] of Object.entries(EXPECTED_PROFILE_TOTALS)) {
    const rows = materializations.filter(row => row.profile === profile);
    for (const key of ['readyActions', 'readyLifecycle', 'genericInteractions', 'directEffects', 'blockedDescriptors']) {
      assert.equal(sum(rows, key), expected[key], `${profile}: ${key}`);
    }
    const descriptors = rows.flatMap(row => row.bundle.mechanics.engineCoverage.blockedDescriptors.map(
      descriptor => ({row, descriptor}),
    ));
    assert.equal(descriptors.length, expected.blockedDescriptors, `${profile}: high-confidence gaps`);
    const strictRows = rows.filter(row => !arsenalExcludedIds.has(row.item.id));
    assert.equal(strictRows.length, arsenalQuality.counts.retained, `${profile}: strict materializations`);
    assert.equal(strictRows.every(row => row.bundle.mechanics.engineCoverage.runtimeState === 'ready'), true);
    assert.equal(sum(strictRows, 'blockedDescriptors'), 0, `${profile}: strict high-confidence gaps`);
    for (const {row, descriptor} of descriptors) {
      const context = `${row.item.id}:${profile}`;
      assert.ok(descriptor && (descriptor.kind === 'active-rule-reference'
        || descriptor.kind === 'script-parameter'), `${context}: blocked descriptor kind`);
      assert.ok(typeof descriptor.sourceId === 'string' && descriptor.sourceId.trim(),
        `${context}: blocked descriptor sourceId`);
      assert.ok(typeof descriptor.sourceField === 'string' && descriptor.sourceField.trim(),
        `${context}: blocked descriptor sourceField`);
      assert.ok(typeof descriptor.reasonCode === 'string' && descriptor.reasonCode.trim(),
        `${context}: blocked descriptor reasonCode`);
      assert.ok(row.bundle.mechanics.engineCoverage.blockerCodes.includes(descriptor.reasonCode),
        `${context}: descriptor is surfaced by blockerCodes`);
      assert.ok(row.bundle.mechanics.engineCoverage.runtimeState === 'partial'
        || row.bundle.mechanics.engineCoverage.runtimeState === 'blocked',
      `${context}: gap fails closed`);
    }
  }
});

test('scroll and ArmorType=None presentation gaps are closed without inventing unknown source values', requiresMechanics, () => {
  const scrollItems = strictItems.filter(item => item.mechanics.profile.kind === 'scroll');
  assert.equal(scrollItems.length, 0, 'scrolls without a complete executable contract are removed');
  let scrollsWithSpellId = 0;
  for (const item of scrollItems) for (const {profile, bundle} of materializationsFor(item)) {
    const context = `${item.id}:${profile}`;
    const scroll = bundle.mechanics.profile.scroll;
    assert.ok(scroll && typeof scroll === 'object', `${context}: scroll profile`);
    assert.ok(Object.prototype.hasOwnProperty.call(scroll, 'spellId'), `${context}: explicit spellId`);
    assert.ok(scroll.spellId === null || (typeof scroll.spellId === 'string' && scroll.spellId),
      `${context}: spellId`);
    if (profile === 'standard' && scroll.spellId) scrollsWithSpellId++;
    assert.equal(typeof scroll.canLearn, 'boolean', `${context}: canLearn`);
    assert.ok(Object.prototype.hasOwnProperty.call(scroll, 'level'), `${context}: explicit level`);
    assert.ok(scroll.level === null || Number.isInteger(scroll.level), `${context}: level`);
    assert.ok(Object.prototype.hasOwnProperty.call(scroll, 'school'), `${context}: explicit school`);
    assert.ok(scroll.school === null || typeof scroll.school === 'string', `${context}: school`);
    assertSortedUniqueStrings(scroll.actionIds, `${context}: actionIds`);
    assert.ok(scroll.actionIds.length > 0, `${context}: action binding`);
  }
  assert.equal(scrollsWithSpellId, 0);

  const armorNone = strictItems.filter(item => item.mechanics.profile.kind === 'armor'
    && item.mechanics.profile.armor?.weight === 'none');
  assert.equal(armorNone.length, 0, 'ArmorType=None rows without a complete contract are removed');
  for (const item of armorNone) for (const {profile, bundle} of materializationsFor(item)) {
    assert.equal(bundle.mechanics.profile.armor.weight, 'none', `${item.id}:${profile}`);
    assert.equal(bundle.mechanics.sourceFacts.facts.armorType.state, 'value', `${item.id}:${profile}`);
    assert.equal(String(bundle.mechanics.sourceFacts.facts.armorType.value).toLowerCase(), 'none',
      `${item.id}:${profile}`);
  }
});

test('report, manifest gates and representative items make effects and omissions understandable', requiresMechanics, () => {
  assert.equal(manifest.entrypoints.itemMechanicsReport, 'item-mechanics-report.json');
  const report = readJson(catalogFile(manifest.entrypoints.itemMechanicsReport));
  assert.equal(report.schemaVersion, 'dnd-world-bg3-item-mechanics-report/1');
  assert.equal(report.catalogVersion, current.catalogVersion);
  assert.equal(report.scope.items, items.length);
  assert.deepEqual(report.scope.materializations, {standard: items.length});
  assert.deepEqual(report.counts.readyActions, {standard: EXPECTED_PROFILE_TOTALS.standard.readyActions});
  assert.deepEqual(report.counts.readyLifecycle, {standard: EXPECTED_PROFILE_TOTALS.standard.readyLifecycle});
  assert.deepEqual(report.counts.genericInteractions, {standard: EXPECTED_PROFILE_TOTALS.standard.genericInteractions});
  assert.deepEqual(report.counts.directEffects, {standard: EXPECTED_PROFILE_TOTALS.standard.directEffects});
  assert.deepEqual(report.counts.highConfidenceUnboundGaps,
    {standard: EXPECTED_PROFILE_TOTALS.standard.blockedDescriptors});
  for (const flag of [
    'itemMechanicsProfileBundlesExhaustive',
    'itemMechanicsSourceFactsExhaustive',
    'itemMechanicsStatusesExplicit',
    'itemMechanicsPropsComplete',
    'itemScrollProfilesComplete',
    'itemArmorNoneExplicit',
    'itemMechanicsHighConfidenceGapsExplicit',
    'itemMechanicsSourcePinned',
  ]) assert.equal(manifest.integrity[flag], true, flag);

  const healing = itemById.get(REPRESENTATIVES.healingPotion);
  assert.ok(healing);
  for (const {profile, bundle} of materializationsFor(healing)) {
    const context = `Potion of Healing:${profile}`;
    const coverage = bundle.mechanics.engineCoverage;
    const facts = bundle.mechanics.sourceFacts.facts;
    assert.equal(coverage.runtimeState, 'ready', context);
    assert.equal(coverage.effectStatus, 'runtime-ready', context);
    assert.ok(coverage.counts.readyActions > 0, context);
    assert.match(bundle.props, /[А-Яа-яЁё]/u, `${context}: Russian summary`);
    assert.match(bundle.props, /(готов|исполня|действ|эффект|лечен)/iu, `${context}: readable runtime summary`);
    assert.equal(String(facts.vitality.value), '1', `${context}: Vitality`);
    assert.equal(facts.itemUseType.value, 'Potion', `${context}: ItemUseType`);
    assert.equal(facts.useCosts.value, 'BonusActionPoint:1', `${context}: UseCosts`);
    assert.equal(String(facts.pickable.value).toLowerCase(), 'true', `${context}: CanBePickedUp`);
    assert.equal(String(facts.maxStack.value), '99', `${context}: maxStackAmount`);
  }

  const infusionRing = itemById.get(REPRESENTATIVES.elementalInfusionRing);
  assert.ok(infusionRing);
  for (const {profile, bundle} of materializationsFor(infusionRing)) {
    const context = `Ring of Elemental Infusion:${profile}`;
    assert.equal(bundle.mechanics.engineCoverage.runtimeState, 'ready', context);
    assert.equal(bundle.mechanics.engineCoverage.effectStatus, 'runtime-ready', context);
    assert.equal(bundle.mechanics.engineCoverage.counts.readyLifecycle, 1, context);
    assert.equal(bundle.manualNote, '', `${context}: obsolete DM fallback removed`);
    assert.equal(bundle.mechanics.manualNote, '', `${context}: mechanics DM fallback removed`);
    assert.match(bundle.props, /Стихийная зарядка/u, `${context}: named mechanic`);
    assert.match(bundle.props, /заклинанием.*(?:кислот|холод|огн|электр|гром)/iu,
      `${context}: exact spell-damage trigger`);
    assert.match(bundle.props, /1d4.*того же типа.*расходует заряд/iu,
      `${context}: exact weapon-hit consequence`);
  }

});

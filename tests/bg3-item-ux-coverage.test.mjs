import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * User-facing coverage for the production item catalogue.
 *
 * The immutable source census belongs here only where it identifies the exact
 * v8 input that the UI has to interpret.  Runtime-readiness totals are derived
 * from the contracts instead of being pinned: making another opcode family
 * executable must improve the census without requiring a test rewrite.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {manifest} = selectBg3Catalog(repo);
const indexHtml = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const jsonCache = new Map();

function readJson(file) {
  const absolute = path.resolve(file);
  if (!jsonCache.has(absolute)) {
    jsonCache.set(absolute, JSON.parse(fs.readFileSync(absolute, 'utf8')));
  }
  return jsonCache.get(absolute);
}

function loadManifestRows(group, key) {
  return (manifest.files[group] || []).flatMap(entry => {
    const file = path.join(repo, ...entry.path.split('/'));
    return readJson(file)[key];
  });
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function effectiveMechanics(item, profile) {
  const honour = item.source?.honourOverlay?.item?.mechanics;
  return profile === 'honour' && honour ? honour : item.mechanics;
}

function exactDescription(item) {
  return ['ru', 'en'].some(language =>
    typeof item.i18n?.[language]?.description === 'string'
      && item.i18n[language].description.trim().length > 0);
}

function exactActiveRuleReferences(mechanics) {
  const active = mechanics?.provenance?.ruleReferences?.active || {};
  return ['spells', 'passives', 'statuses', 'interrupts']
    .flatMap(kind => rows(active[kind]))
    .filter(reference => typeof reference?.id === 'string' && reference.id.length > 0);
}

function hasDetailedProjectionEvidence(mechanics) {
  const effects = rows(mechanics?.effects).some(effect =>
    effect && typeof effect.stat === 'string' && effect.stat.length > 0
      && typeof effect.mode === 'string' && effect.mode.length > 0);
  const actions = rows(mechanics?.actions).some(action => {
    const program = action?.program;
    return program && typeof program.id === 'string' && program.id.length > 0
      && (typeof program.rootArtifact === 'string'
        || program.projection && typeof program.projection === 'object');
  });
  const lifecycle = rows(mechanics?.lifecyclePrograms).some(reference =>
    reference && typeof reference.programId === 'string' && reference.programId.length > 0
      && typeof reference.artifact === 'string' && reference.artifact.length > 0
      && (typeof reference.bg3Id === 'string' && reference.bg3Id.length > 0
        || typeof reference.ruleId === 'string' && reference.ruleId.length > 0
        || rows(reference.sourceRuleReferences).length > 0));
  return effects || actions || lifecycle || exactActiveRuleReferences(mechanics).length > 0;
}

function sourceSection(startMarker, endMarker) {
  const start = indexHtml.indexOf(startMarker);
  const end = indexHtml.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return indexHtml.slice(start, end);
}

function loadSourceAuditOverrides() {
  const source = sourceSection(
    'const BG3_ITEM_SOURCE_AUDIT_OVERRIDES=',
    'function bg3ItemSourceAuditOverride(',
  );
  const context = {};
  vm.runInNewContext(`${source}\nglobalThis.result=BG3_ITEM_SOURCE_AUDIT_OVERRIDES;`, context,
    {timeout: 1_000});
  return JSON.parse(JSON.stringify(context.result));
}

function classificationAllowLists(source) {
  const found = [];
  const pattern = /\[([^\]]*)\]\.includes\(([^)]*classification[^)]*)\)/g;
  for (const match of source.matchAll(pattern)) {
    found.push({
      expression: match[0],
      values: [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(value => value[1]),
    });
  }
  return found;
}

function actionContract(action) {
  const program = action?.program || {};
  const declared = action?.contract;
  const projection = program.projection;
  const sourceBlocked = action?.sourceBlocked === true
    || program.sourceBlocked === true
    || program.runtimeReady === false
    || program.executable === false
    || declared?.state === 'blocked';
  const projectionReady = Boolean(projection
    && projection.complete === true
    && ['typed', 'empty'].includes(projection.mode)
    && rows(projection.unresolved).length === 0
    && projection.sourceBlocked !== true
    && projection.runtimeReady !== false
    && projection.executable !== false);

  if (sourceBlocked) {
    return {
      state: 'blocked',
      reason: String(action?.reason || program.reason || declared?.reason || 'source-program-blocked'),
    };
  }

  if (action?.handler === 'bg3RecipeProgram') {
    return {state: 'typed', reason: 'exact-recipe-preflight'};
  }
  if (action?.handler === 'bg3LearnSpellProgram' && program.learnSpell) {
    return {state: 'typed', reason: 'exact-learn-spell-preflight'};
  }
  if (action?.handler === 'bg3RootProgram'
    && action.special?.kind === 'bg3Tadpole'
    && action.special.requiresCampaignHandler === true) {
    return {state: 'typed', reason: 'exact-tadpole-preflight'};
  }
  if (['bg3RuleProgram', 'bg3RootProgram'].includes(action?.handler)
    && (projection ? projectionReady : program.mode === 'typed')) {
    return {
      state: 'typed',
      reason: projectionReady ? 'complete-rule-projection' : 'typed-root-program',
    };
  }
  return {
    state: 'blocked',
    reason: projection && rows(projection.unresolved).length
      ? 'unresolved-rule-projection'
      : `source-program-${projection?.mode || program.mode || 'unknown'}`,
  };
}

const items = loadManifestRows('items', 'items');
const sourceAuditOverrides = loadSourceAuditOverrides();
const PENDULUM_OF_MALAGARD_ID =
  'bg3:item:rt:4c1143b7-1f07-465a-90a0-64df5c00717d:stats:TE9XX1BlbmR1bHVtT2ZNYWxhZ2FyZA';

test('каждый пользовательский магический предмет имеет source-backed описание или точный путь к подробной проекции', () => {
  const gaps = [];
  const acceptedOverrides = new Set();
  for (const item of items) {
    if (['technical', 'world-object'].includes(item.source?.classification)) continue;
    for (const profile of rows(item.source?.profiles)) {
      const mechanics = effectiveMechanics(item, profile);
      if (mechanics?.profile?.kind !== 'magic') continue;
      if (!exactDescription(item) && !hasDetailedProjectionEvidence(mechanics)) {
        const override = sourceAuditOverrides[item.id];
        if (override?.status === 'source-incomplete'
          && override.policy === 'fail-closed'
          && override.inventory === false
          && override.actions === false
          && override.mode === 'manual'
          && typeof override.reason === 'string' && override.reason.trim().length >= 80
          && typeof override.manualInstruction === 'string'
          && override.manualInstruction.trim().length >= 40) {
          acceptedOverrides.add(item.id);
          continue;
        }
        gaps.push({itemId: item.id, name: item.n, profile, classification: item.source.classification});
      }
    }
  }
  assert.deepEqual(gaps, [],
    `magic records without exact description or projectable rules:\n${JSON.stringify(gaps, null, 2)}`);

  const overrideIds = Object.keys(sourceAuditOverrides).sort();
  assert.ok(overrideIds.every(itemId => itemId === PENDULUM_OF_MALAGARD_ID),
    'source-incomplete mitigation must name the exact audited item, never a category or wildcard');
  assert.deepEqual(overrideIds, [...acceptedOverrides].sort(),
    'remove stale overrides as soon as source-backed description or projectable rules exist');

  if (acceptedOverrides.size) {
    const actionSource = sourceSection('function itemActions(', 'function itemHintHTML(');
    const fallbackSource = sourceSection(
      'function bg3ItemSourceFallbackHTML(',
      'function itemCardHTML(',
    );
    const portableSource = sourceSection(
      'function itemWorkspacePortable(',
      'function itemWorkspaceHeroToolbarHTML(',
    );
    const grantSource = sourceSection(
      'async function itemWorkspaceGrantPlanFor(',
      'function itemWorkspaceFillContainerPreview(',
    );
    assert.match(actionSource, /bg3ItemSourceAuditAllows\(it,'actions'\)/,
      'source-incomplete item actions must fail closed before buttons are advertised');
    assert.match(fallbackSource, /bg3ItemSourceAuditHTML\(it\)/,
      'the item card must explain the exact source gap and manual mode');
    assert.match(portableSource, /bg3ItemSourceAuditAllows\(row,'inventory'\)/,
      'source-incomplete item must not be presented as inventory-safe');
    assert.match(grantSource, /sourceAudit\.inventory===false/,
      'the hydrated grant preflight must independently reject the override');
  }
});

test('v8 unclassified census отделяет technical от review и review сам по себе не разрешает выдачу', () => {
  const unclassified = items.filter(item => item.source?.category === 'unclassified');
  const census = Object.fromEntries(['needs-review', 'technical'].map(classification => [
    classification,
    unclassified.filter(item => item.source.classification === classification).length,
  ]));
  assert.equal(unclassified.length, 134, 'pinned v8 unclassified source census');
  assert.deepEqual(census, {'needs-review': 67, technical: 67},
    'template-only review rows and technical assets stay distinguishable');
  assert.ok(unclassified.every(item =>
    ['needs-review', 'technical'].includes(item.source.classification)),
  'unclassified source rows must not silently become playable');

  const portableSource = sourceSection(
    'function itemWorkspacePortable(',
    'function itemWorkspaceHeroToolbarHTML(',
  );
  const grantSource = sourceSection(
    'async function itemWorkspaceGrantPlanFor(',
    'function itemWorkspaceFillContainerPreview(',
  );
  const unsafeAllowLists = [
    ...classificationAllowLists(portableSource),
    ...classificationAllowLists(grantSource),
  ].filter(entry => entry.values.includes('needs-review'));
  assert.deepEqual(unsafeAllowLists, [],
    'needs-review requires explicit inventory evidence and must not be an allow-list classification');
});

test('каждое advertised BG3 action имеет явный typed/blocked контракт и UI показывает blocked census', t => {
  const census = {};
  for (const profile of ['standard', 'honour']) {
    const contracts = items
      .filter(item => rows(item.source?.profiles).includes(profile))
      .flatMap(item => rows(effectiveMechanics(item, profile)?.actions).map(actionContract));
    assert.ok(contracts.every(contract =>
      ['typed', 'blocked'].includes(contract.state)
        && typeof contract.reason === 'string' && contract.reason.length > 0));
    census[profile] = {
      total: contracts.length,
      typed: contracts.filter(contract => contract.state === 'typed').length,
      blocked: contracts.filter(contract => contract.state === 'blocked').length,
    };
    assert.equal(census[profile].typed + census[profile].blocked, census[profile].total);
    assert.equal(census[profile].total, manifest.counts.itemRuleActions.actions,
      `${profile}: action census differs from the selected production manifest`);
  }
  t.diagnostic(`derived production action census: ${JSON.stringify(census)}`);

  const summarySource = sourceSection(
    'function bg3CatalogItemMechanicsSummary(',
    'function bg3ItemPlacementEvidenceCount(',
  );
  const identitySource = sourceSection(
    'function bg3CatalogItemIdentityHTML(',
    'function itemProfileSummaryHTML(',
  );
  assert.match(summarySource, /actionContracts/);
  assert.match(summarySource, /blockedActions/);
  assert.match(identitySource, /summary\.blockedActions/,
    'the catalogue card must not collapse blocked actions into an advertised typed count');

  const lifecycleBlockSource = sourceSection(
    'function bg3LifecycleBlock(',
    'async function bg3WeaponAttackOpen(',
  );
  const visibleMessage = lifecycleBlockSource.slice(lifecycleBlockSource.indexOf('askShow('));
  assert.match(visibleMessage, /\breason\b/,
    'a blocked inventory interaction must expose its exact safe reason in the visible instruction');
});

test('source potion taxonomy uses one canonical potion group and an explicit alchemy subgroup', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.counts.categories, 'potion'), false,
    'singular UI key is not a BG3 source category');
  const potionItems = items.filter(item => item.mechanics?.profile?.kind === 'potion');
  const categories = Object.fromEntries([...new Set(potionItems.map(item => item.source.category))]
    .sort()
    .map(category => [category, potionItems.filter(item => item.source.category === category).length]));
  assert.deepEqual(Object.keys(categories), ['alchemy.consumable', 'consumable.potion']);
  assert.equal(categories['alchemy.consumable'], manifest.counts.categories['alchemy.consumable']);
  assert.equal(categories['consumable.potion'], manifest.counts.categories['consumable.potion']);
  assert.equal(potionItems.length, manifest.counts.mechanicsKinds.potion);
});

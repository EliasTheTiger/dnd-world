import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * User-facing coverage for the production item catalogue.
 *
 * The immutable source census belongs here only where it identifies the exact
 * v10 input that the UI has to interpret. Runtime-readiness totals are derived
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

function objectLiteralHasKey(source, key) {
  const token = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${key}:` : `'${key}':`;
  return source.includes(token);
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
const PENDULUM_OF_MALAGARD_ID =
  'bg3:item:rt:4c1143b7-1f07-465a-90a0-64df5c00717d:stats:TE9XX1BlbmR1bHVtT2ZNYWxhZ2FyZA';

function exactSourceInertMagic(item, mechanics) {
  const coverage = mechanics?.engineCoverage;
  const counts = coverage?.counts || {};
  return item.id === PENDULUM_OF_MALAGARD_ID
    && item.source?.classification === 'playable'
    && item.source?.category === 'equipment.armor-accessory'
    && mechanics?.profile?.flags?.portable === true
    && coverage?.descriptionStatus === 'unresolved-handle'
    && coverage?.effectStatus === 'source-inert'
    && coverage?.runtimeState === 'inert'
    && rows(coverage?.blockerCodes).length === 0
    && rows(coverage?.characteristicIssues).includes('description-handle-unresolved')
    && rows(mechanics?.effects).length === 0
    && rows(mechanics?.actions).length === 0
    && rows(mechanics?.interactions).length === 0
    && rows(mechanics?.lifecyclePrograms).length === 0
    && exactActiveRuleReferences(mechanics).length === 0
    && counts.readyActions === 0
    && counts.blockedActions === 0
    && counts.readyLifecycle === 0
    && counts.blockedLifecycle === 0
    && counts.genericInteractions === 0
    && counts.directEffects === 0
    && counts.readyRootPrograms === 1
    && counts.blockedRootPrograms === 0
    && counts.onDestroyPrograms === 1
    && rows(coverage?.destructionOperations).length === 1
    && coverage.destructionOperations[0] === 'playSoundOnDestroy'
    && /отдельный игровой эффект источником не задан/i.test(String(item.props || ''));
}

test('каждый пользовательский магический предмет имеет описание, подробную проекцию или точный source-inert контракт без решения мастера', () => {
  const gaps = [];
  const sourceInert = new Set();
  for (const item of items) {
    if (['technical', 'world-object'].includes(item.source?.classification)) continue;
    for (const profile of rows(item.source?.profiles)) {
      const mechanics = effectiveMechanics(item, profile);
      if (mechanics?.profile?.kind !== 'magic') continue;
      if (!exactDescription(item) && !hasDetailedProjectionEvidence(mechanics)) {
        if (exactSourceInertMagic(item, mechanics)) {
          sourceInert.add(item.id);
          continue;
        }
        gaps.push({itemId: item.id, name: item.n, profile, classification: item.source.classification});
      }
    }
  }
  assert.deepEqual(gaps, [],
    `magic records without exact description or projectable rules:\n${JSON.stringify(gaps, null, 2)}`);
  assert.deepEqual([...sourceInert], [PENDULUM_OF_MALAGARD_ID],
    'the one unresolved description handle is represented as exact inert evidence, not a wildcard');
  assert.equal(indexHtml.includes(PENDULUM_OF_MALAGARD_ID), false,
    'the exact item must not be singled out by a runtime deny-list');
  assert.doesNotMatch(indexHtml,
    /'manual-review'\s*:\s*'требуется решение мастера'/iu,
    'public item coverage has no GM-review fallback label');
});

test('весь v10 coverage census имеет безопасные публичные подписи без raw fallback', () => {
  const coverageRows = items.flatMap(item => rows(item.source?.profiles).map(profile => ({
    item,
    profile,
    coverage: effectiveMechanics(item, profile)?.engineCoverage || {},
  })));
  const values = key => [...new Set(coverageRows.map(row => String(row.coverage[key] || '')).filter(Boolean))].sort();
  const blockers = [...new Set(coverageRows.flatMap(row => rows(row.coverage.blockerCodes)))].sort();
  assert.deepEqual(values('runtimeState'), ['blocked', 'inert', 'manual-review', 'partial', 'ready']);
  assert.deepEqual(values('effectStatus'), [
    'destruction-only',
    'inherited-inert',
    'manual-review',
    'runtime-blocked',
    'runtime-partial',
    'runtime-ready',
    'script-declared-blocked',
    'source-inert',
  ]);
  assert.deepEqual(values('descriptionStatus'), ['source-absent', 'source-localized', 'unresolved-handle']);
  assert.deepEqual(blockers, [
    'active-rule-reference-not-materialized',
    'blocked-lifecycle-granted-action',
    'blocked-lifecycle-interrupt',
    'incomplete-lifecycle-projection',
    'manual-mechanics-review-required',
    'script-parameter-runtime-adapter-required',
    'script-uuid-runtime-adapter-required',
    'source-lifecycle-manual',
    'source-lifecycle-mixed',
    'source-program-manual',
    'source-program-mixed',
  ]);

  const labels = sourceSection(
    'const BG3_ENGINE_RUNTIME_LABELS=',
    'function bg3SourceFactHasValue(',
  );
  for (const value of values('runtimeState')) {
    assert.equal(objectLiteralHasKey(labels, value), true, `runtimeState ${value} has a public label`);
  }
  for (const value of values('effectStatus')) {
    assert.equal(objectLiteralHasKey(labels, value), true, `effectStatus ${value} has a public label`);
  }
  for (const value of values('descriptionStatus')) {
    assert.equal(objectLiteralHasKey(labels, value), true, `descriptionStatus ${value} has a public label`);
  }
  for (const value of blockers) {
    assert.equal(objectLiteralHasKey(labels, value), true, `blocker ${value} has a public label`);
  }

  const renderer = sourceSection(
    'function bg3EngineRuntimeLabel(',
    'function bg3ItemPlacementEvidenceCount(',
  );
  assert.doesNotMatch(renderer,
    /\|\|\s*coverage\.(?:runtimeState|effectStatus|descriptionStatus)|BG3_ENGINE_CODE_LABELS\[[^\]]+\]\s*\|\|\s*code/,
    'coverage renderer must never fall back to a raw status or blocker code');
  assert.match(renderer, /часть исходной механики пока недоступна для автоматического применения/,
    'future blocker codes receive a safe generic label');
  assert.match(renderer, /состояние механики не удалось безопасно классифицировать/,
    'future runtime states receive a safe generic label');
});

test('v10 unclassified census отделяет technical от review и review сам по себе не разрешает выдачу', () => {
  const unclassified = items.filter(item => item.source?.category === 'unclassified');
  const census = Object.fromEntries(['needs-review', 'technical'].map(classification => [
    classification,
    unclassified.filter(item => item.source.classification === classification).length,
  ]));
  assert.equal(unclassified.length, 134, 'pinned v10 unclassified source census');
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

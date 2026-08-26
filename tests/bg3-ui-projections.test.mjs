import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogVersion = 'bg3-24532579-v10';
const sourceBuildId = '24532579';
const sourceBase = path.join(repo, 'data', 'bg3', catalogVersion);
const placementBase = path.join(repo, 'data', 'bg3', 'ui', `${catalogVersion}-placement-browser`);
const presentationBase = path.join(repo, 'data', 'bg3', 'ui', `${catalogVersion}-item-presentation`);

const compareStrings = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const plain = value => JSON.parse(JSON.stringify(value));
const forbiddenDecisionText = /manual(?:-mechanics)?-review(?:-required)?|требуется решение мастера|решени(?:е|я|й) мастера|(?:gm|master) decision/iu;
const forbiddenPublicProfileKeys = new Set([
  'actiontype',
  'activationmodel',
  'bg3id',
  'grantedactionids',
  'grantedinterruptids',
  'handler',
  'interruptevents',
  'labelsource',
  'mode',
  'projectionmode',
  'provenance',
  'sourceactions',
  'sourcefield',
  'sourceruleids',
  'trigger',
]);
const forbiddenPublicProfileText = /(?:^|\s)\S*_\S*(?:\s|$)|[0-9a-f]{8}-[0-9a-f-]{27,}|\b(?:bg3|unlockspell|sourcefield|programid|spellid|interruptid|manual|structured|typed|mixed|object|self|actiontype|boosts|empty|explicit|handler|onusepeaceactions|program|source|target|trigger|unknown)\b|display-only-localization/iu;
const lifecycleKindLabels = new Set(['пассивное свойство', 'особое действие', 'состояние']);
const lifecycleGateLabels = new Set([
  'при экипировке',
  'в основной руке',
  'во вспомогательной руке',
  'при особом действии предмета',
  'пока находится в инвентаре',
  'при попадании',
]);
const effectOperationLabels = new Set([
  'модификатор',
  'преимущество',
  'помеха',
  'минимальное значение',
]);
const sha256 = value => crypto.createHash('sha256')
  .update(Buffer.isBuffer(value) ? value : fs.readFileSync(value))
  .digest('hex');

function readJson(file) {
  const buffer = fs.readFileSync(file);
  return {buffer, value: JSON.parse(buffer)};
}

function assertExactKeys(value, expected, field) {
  assert.equal(value && typeof value === 'object' && !Array.isArray(value), true, field);
  assert.deepEqual(Object.keys(value).sort(compareStrings), [...expected].sort(compareStrings), field);
}

function assertPublicProfileProjection(value, field) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    assert.doesNotMatch(value, forbiddenDecisionText, field);
    assert.doesNotMatch(value, forbiddenPublicProfileText, field);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertPublicProfileProjection(entry, `${field}[${index}]`);
    }
    return;
  }
  assert.equal(typeof value, 'object', field);
  for (const [key, entry] of Object.entries(value)) {
    assert.equal(
      forbiddenPublicProfileKeys.has(key.toLocaleLowerCase('en')),
      false,
      `${field}.${key}`,
    );
    assertPublicProfileProjection(entry, `${field}.${key}`);
  }
}

let sourceSearchById;
const sourceShardCache = new Map();

function exactSourceItem(itemId) {
  if (!sourceSearchById) {
    const sourceSearch = readJson(path.join(sourceBase, 'search-index.json')).value;
    sourceSearchById = new Map(sourceSearch.items.map(row => [row.id, row]));
  }
  const summary = sourceSearchById.get(itemId);
  assert.ok(summary?.shard, `${itemId}: exact source shard`);
  if (!sourceShardCache.has(summary.shard)) {
    sourceShardCache.set(
      summary.shard,
      readJson(path.join(sourceBase, 'items', `${summary.shard}.json`)).value,
    );
  }
  const item = sourceShardCache.get(summary.shard).items.find(row => row.id === itemId);
  assert.ok(item, `${itemId}: exact source item`);
  return item;
}

function exactSourceProfileItem(itemId, profile = 'standard') {
  const item = exactSourceItem(itemId);
  if (profile === 'honour' && item.source.profiles.includes('standard')) {
    return item.source.honourOverlay.item;
  }
  return item;
}

function exactSourceActionTypes(action) {
  const sourceAction = action.program?.sourceAction || {};
  return [sourceAction.primary, ...(sourceAction.aliases || [])]
    .filter(Boolean)
    .map(row => row.actionType);
}

function exactSourceActions(itemId, profile = 'standard') {
  return exactSourceProfileItem(itemId, profile).mechanics.actions.map(action => {
    return {
      label: action.label,
      actionTypes: exactSourceActionTypes(action),
    };
  });
}

function normalizedLabelTokens(value) {
  return String(value || '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}:_+\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function assertSearchContainsLabels(termText, labels, field) {
  const terms = new Set(String(termText || '').split(' ').filter(Boolean));
  for (const label of labels) {
    for (const token of normalizedLabelTokens(label)) assert.equal(terms.has(token), true, `${field}: ${token}`);
  }
}

function relativeJsonFiles(base) {
  const found = [];
  const visit = (directory, relativeDirectory = '') => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const relative = path.posix.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile() && entry.name.endsWith('.json')) found.push(relative);
    }
  };
  visit(base);
  return found.sort(compareStrings);
}

function resolvedArtifact(base, relative) {
  assert.match(relative, /^(?:detail|search)\/[0-9]{4}\.json$/, relative);
  const absolute = path.resolve(base, ...relative.split('/'));
  assert.equal(absolute.startsWith(`${path.resolve(base)}${path.sep}`), true, relative);
  return absolute;
}

function assertExactArtifact(base, entry) {
  assert.equal(typeof entry.path, 'string');
  assert.equal(Number.isSafeInteger(entry.bytes), true, entry.path);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/, entry.path);
  const absolute = resolvedArtifact(base, entry.path);
  assert.equal(fs.existsSync(absolute), true, entry.path);
  assert.equal(fs.statSync(absolute).size, entry.bytes, entry.path);
  assert.equal(sha256(absolute), entry.sha256, entry.path);
  return readJson(absolute).value;
}

function fingerprintFileEntries(entries) {
  const lines = entries
    .map(entry => `${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.shard ?? ''}\0${entry.count ?? ''}`)
    .sort(compareStrings);
  return sha256(Buffer.from(`${lines.join('\n')}\n`, 'utf8'));
}

function assertManifestIntegrity(base, manifestRead, integrity, descriptorEntries, options = {}) {
  const {buffer: manifestBuffer} = manifestRead;
  assert.deepEqual(plain(integrity.manifest), {
    path: 'manifest.json',
    bytes: manifestBuffer.byteLength,
    sha256: sha256(manifestBuffer),
  });

  const declared = descriptorEntries.map(entry => entry.path);
  assert.equal(new Set(declared).size, declared.length, 'duplicate generated descriptor path');
  assert.deepEqual(
    relativeJsonFiles(base),
    ['integrity.json', 'manifest.json', ...declared].sort(compareStrings),
    'generated directory contains an undeclared or missing JSON file',
  );

  const generatedLines = [integrity.manifest, ...descriptorEntries]
    .map(entry => `${entry.path}\0${entry.bytes}\0${entry.sha256}`);
  if (options.sortGeneratedEntries) generatedLines.sort(compareStrings);
  assert.equal(
    integrity.generatedFileSetSha256,
    sha256(Buffer.from(`${generatedLines.join('\n')}\n`, 'utf8')),
  );
}

test('оба UI-генератора детерминированно подтверждают committed projections через --check', {
  timeout: 600_000,
}, () => {
  for (const relativeScript of [
    'scripts/build-bg3-placement-browser.mjs',
    'scripts/build-bg3-item-presentation.mjs',
  ]) {
    const result = spawnSync(process.execPath, [path.join(repo, relativeScript), '--check'], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300_000,
    });
    assert.equal(result.error, undefined, `${relativeScript}: ${result.error?.message || ''}`);
    assert.equal(result.signal, null, `${relativeScript}: terminated by ${result.signal}`);
    assert.equal(result.status, 0, `${relativeScript}\n${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status ?? report.mode, 'verified', relativeScript);
  }
});

test('placement browser полностью согласован с manifest, detail shards и integrity', () => {
  const manifestRead = readJson(path.join(placementBase, 'manifest.json'));
  const manifest = manifestRead.value;
  const integrity = readJson(path.join(placementBase, 'integrity.json')).value;

  assert.equal(manifest.schemaVersion, 'bg3-ui-placement-browser/1');
  assert.equal(integrity.schemaVersion, 'bg3-ui-placement-browser-integrity/1');
  for (const document of [manifest, integrity]) assert.equal(document.catalogVersion, catalogVersion);
  assert.equal(manifest.sourceBuildId, sourceBuildId);
  assert.equal(manifest.immutableSource, true);
  assert.equal(manifest.deterministic, true);
  assert.deepEqual(plain(manifest.counts), {
    itemIds: 4_951,
    placements: 59_020,
    itemPlacementPairs: 59_020,
    profilePlacements: {standard: 59_019, honour: 59_020},
    placementsWithDirectActions: 2_450,
    placementsWithDirectScripts: 3_586,
    detailShards: 155,
  });

  const detailEntries = manifest.storage.detailFiles;
  assert.equal(manifest.storage.hardLimitBytes, 250_000);
  assert.equal(detailEntries.length, manifest.counts.detailShards);
  assert.equal(detailEntries.every(entry => entry.bytes <= manifest.storage.hardLimitBytes), true);
  assert.equal(
    manifest.storage.detailSetSha256,
    sha256(Buffer.from(`${JSON.stringify(detailEntries)}\n`, 'utf8')),
  );
  assert.equal(integrity.detailSetSha256, manifest.storage.detailSetSha256);
  assertManifestIntegrity(placementBase, manifestRead, integrity, detailEntries);

  const rootByItem = new Map();
  const referencedDetailCounts = new Map();
  const rootProfileCounts = {standard: 0, honour: 0};
  let rootPlacements = 0;
  let rootDirectActions = 0;
  let rootDirectScripts = 0;
  for (const item of manifest.items) {
    assert.equal(rootByItem.has(item.itemId), false, item.itemId);
    rootByItem.set(item.itemId, item);
    rootPlacements += item.placementCount;
    rootDirectActions += item.placementsWithDirectActions;
    rootDirectScripts += item.placementsWithDirectScripts;
    for (const profile of ['standard', 'honour']) rootProfileCounts[profile] += item.profileCounts[profile];
    assert.deepEqual(
      item.availableProfiles,
      ['standard', 'honour'].filter(profile => item.profileCounts[profile] > 0),
      item.itemId,
    );
    assert.equal(item.detailRefs.reduce((sum, ref) => sum + ref.count, 0), item.placementCount, item.itemId);
    for (const ref of item.detailRefs) {
      const key = `${ref.shard}\0${item.itemId}`;
      assert.equal(referencedDetailCounts.has(key), false, key);
      referencedDetailCounts.set(key, ref.count);
    }
  }
  assert.equal(rootByItem.size, manifest.counts.itemIds);
  assert.equal(rootPlacements, manifest.counts.placements);
  assert.deepEqual(rootProfileCounts, manifest.counts.profilePlacements);
  assert.equal(rootDirectActions, manifest.counts.placementsWithDirectActions);
  assert.equal(rootDirectScripts, manifest.counts.placementsWithDirectScripts);

  const placementIds = new Set();
  const detailCounts = new Map();
  const detailProfileCounts = {standard: 0, honour: 0};
  let detailPlacements = 0;
  let detailDirectActions = 0;
  let detailDirectScripts = 0;
  for (const entry of detailEntries) {
    assert.equal(entry.bytes <= 250_000, true, entry.path);
    const shard = assertExactArtifact(placementBase, entry);
    assert.equal(shard.schemaVersion, 'bg3-ui-placement-browser-detail-shard/1', entry.path);
    assert.equal(shard.catalogVersion, catalogVersion, entry.path);
    assert.equal(shard.sourceBuildId, sourceBuildId, entry.path);
    assert.equal(shard.shard, entry.shard, entry.path);
    assert.equal(shard.itemChunks.length, entry.itemChunkCount, entry.path);
    assert.equal(shard.itemChunkCount, entry.itemChunkCount, entry.path);
    assert.equal(new Set(shard.itemChunks.map(chunk => chunk.itemId)).size, entry.itemCount, entry.path);
    assert.equal(shard.itemCount, entry.itemCount, entry.path);
    const shardPlacementCount = shard.itemChunks.reduce((sum, chunk) => sum + chunk.placements.length, 0);
    assert.equal(shardPlacementCount, entry.placementCount, entry.path);
    assert.equal(shard.placementCount, entry.placementCount, entry.path);

    for (const chunk of shard.itemChunks) {
      assert.equal(rootByItem.has(chunk.itemId), true, chunk.itemId);
      const key = `${entry.shard}\0${chunk.itemId}`;
      assert.equal(detailCounts.has(key), false, key);
      detailCounts.set(key, chunk.placements.length);
      for (const placement of chunk.placements) {
        assert.equal(placementIds.has(placement.id), false, placement.id);
        placementIds.add(placement.id);
        detailPlacements++;
        for (const profile of placement.profiles) {
          assert.equal(profile === 'standard' || profile === 'honour', true, placement.id);
          detailProfileCounts[profile]++;
        }
        if (placement.directActionProgramCount > 0) detailDirectActions++;
        if (placement.directScriptCount > 0) detailDirectScripts++;
      }
    }
  }
  assert.deepEqual(detailCounts, referencedDetailCounts);
  assert.equal(placementIds.size, manifest.counts.placements);
  assert.equal(detailPlacements, manifest.counts.placements);
  assert.deepEqual(detailProfileCounts, manifest.counts.profilePlacements);
  assert.equal(detailDirectActions, manifest.counts.placementsWithDirectActions);
  assert.equal(detailDirectScripts, manifest.counts.placementsWithDirectScripts);
  assert.equal(
    detailEntries.reduce((sum, entry) => sum + entry.placementCount, 0),
    manifest.counts.placements,
  );
  assert.equal(manifest.integrity.rootCountsEqualDetailCounts, true);
  assert.equal(manifest.integrity.allDetailShardsWithinHardLimit, true);
});

test('item presentation полностью согласована с compact rows, detail/search shards и integrity', () => {
  const manifestRead = readJson(path.join(presentationBase, 'manifest.json'));
  const manifest = manifestRead.value;
  const integrity = readJson(path.join(presentationBase, 'integrity.json')).value;

  assert.equal(manifest.schemaVersion, 'bg3-ui-item-presentation/1');
  assert.equal(integrity.schemaVersion, 'bg3-ui-item-presentation-integrity/1');
  for (const document of [manifest, integrity]) assert.equal(document.catalogVersion, catalogVersion);
  assert.equal(manifest.sourceBuildId, sourceBuildId);
  assert.equal(manifest.immutableSource, true);
  assert.equal(manifest.deterministic, true);
  assert.equal(manifest.displayOnly, true);
  assert.deepEqual(plain(manifest.contracts.itemRowColumns), [
    'itemId', 'detailShard', 'flags', 'descriptionCount', 'actionCount',
    'interactionCount', 'lifecycleCount', 'effectCount', 'recipeRecordSources',
    'treasureTableSources', 'standardPlacements', 'honourPlacements', 'profileMask',
  ]);
  assert.deepEqual(plain(manifest.contracts.itemRowFlags), {
    hasDescription: 1, hasActions: 2, hasInteractions: 4, hasLifecycle: 8, hasEffects: 16,
  });
  assert.deepEqual(plain(manifest.contracts.detailActionFields), ['label']);
  assert.deepEqual(plain(manifest.contracts.detailInteractionFields), ['label']);
  assert.deepEqual(plain(manifest.contracts.detailLifecycleFields), ['kind', 'gate']);
  assert.deepEqual(plain(manifest.contracts.detailEffectFields), ['label', 'operation', 'value', 'unit']);
  assert.equal(Object.hasOwn(manifest, 'sourceActionTypeNames'), false);
  assert.deepEqual(plain(manifest.counts), {
    items: 10_284,
    profileItems: {standard: 10_282, honour: 10_284},
    itemsWithDescription: 5_706,
    localizedDescriptions: {ru: 5_706, en: 5_706},
    itemsWithActions: 2_243,
    profileMaterializedActions: 4_720,
    itemsWithInteractions: 3_451,
    profileMaterializedInteractions: 7_216,
    itemsWithLifecycle: 1_245,
    profileMaterializedLifecyclePrograms: 4_984,
    itemsWithEffects: 275,
    profileMaterializedEffects: 582,
    relationSources: {
      recipeRecords: 3_941,
      treasureTables: 8_885,
      placements: {standard: 1_290, honour: 1_290},
    },
  });

  const detailEntries = manifest.storage.detailFiles;
  const searchEntries = manifest.storage.searchFiles;
  assert.doesNotMatch(JSON.stringify(manifest), forbiddenDecisionText, 'compact projection has no GM-review fallback');
  for (const [entries, hardLimit] of [
    [detailEntries, manifest.storage.hardLimitBytes],
    [searchEntries, manifest.storage.searchHardLimitBytes],
  ]) {
    assert.equal(hardLimit, 250_000);
    assert.equal(entries.every(entry => entry.bytes <= hardLimit), true);
  }
  assert.equal(fingerprintFileEntries(detailEntries), manifest.storage.detailSetSha256);
  assert.equal(fingerprintFileEntries(searchEntries), manifest.storage.searchSetSha256);
  assert.equal(integrity.detailSetSha256, manifest.storage.detailSetSha256);
  assert.equal(integrity.searchSetSha256, manifest.storage.searchSetSha256);
  assertManifestIntegrity(
    presentationBase,
    manifestRead,
    integrity,
    [...detailEntries, ...searchEntries],
    {sortGeneratedEntries: true},
  );

  const rowByItem = new Map();
  const rowByIndex = [];
  const rowCounts = {
    profileItems: {standard: 0, honour: 0},
    itemsWithDescription: 0,
    itemsWithActions: 0,
    profileMaterializedActions: 0,
    itemsWithInteractions: 0,
    profileMaterializedInteractions: 0,
    itemsWithLifecycle: 0,
    profileMaterializedLifecyclePrograms: 0,
    itemsWithEffects: 0,
    profileMaterializedEffects: 0,
    recipeRecords: 0,
    treasureTables: 0,
    placements: {standard: 0, honour: 0},
    detailItems: 0,
  };
  for (const row of manifest.items) {
    assert.equal(Array.isArray(row), true);
    assert.equal(row.length, 13, row[0]);
    const [itemId, detailShard, flags, descriptionCount, actionCount, interactionCount,
      lifecycleCount, effectCount, recipeRecords, treasureTables, standardPlacements, honourPlacements,
      profileMask] = row;
    assert.equal(rowByItem.has(itemId), false, itemId);
    rowByItem.set(itemId, row);
    rowByIndex.push(row);
    for (const value of row.slice(2)) assert.equal(Number.isSafeInteger(value) && value >= 0, true, itemId);
    assert.equal(flags <= 31, true, itemId);
    assert.equal(profileMask >= 1 && profileMask <= 3, true, itemId);
    assert.equal(Boolean(flags & 1), descriptionCount > 0, itemId);
    assert.equal(Boolean(flags & 2), actionCount > 0, itemId);
    assert.equal(Boolean(flags & 4), interactionCount > 0, itemId);
    assert.equal(Boolean(flags & 8), lifecycleCount > 0, itemId);
    assert.equal(Boolean(flags & 16), effectCount > 0, itemId);
    if (detailShard !== null) {
      assert.match(detailShard, /^[0-9]{4}$/, itemId);
      rowCounts.detailItems++;
    }
    if (profileMask & 1) rowCounts.profileItems.standard++;
    if (profileMask & 2) rowCounts.profileItems.honour++;
    if (flags & 1) rowCounts.itemsWithDescription++;
    if (flags & 2) rowCounts.itemsWithActions++;
    if (flags & 4) rowCounts.itemsWithInteractions++;
    if (flags & 8) rowCounts.itemsWithLifecycle++;
    if (flags & 16) rowCounts.itemsWithEffects++;
    rowCounts.profileMaterializedActions += actionCount;
    rowCounts.profileMaterializedInteractions += interactionCount;
    rowCounts.profileMaterializedLifecyclePrograms += lifecycleCount;
    rowCounts.profileMaterializedEffects += effectCount;
    rowCounts.recipeRecords += recipeRecords;
    rowCounts.treasureTables += treasureTables;
    rowCounts.placements.standard += standardPlacements;
    rowCounts.placements.honour += honourPlacements;
  }
  assert.equal(rowByItem.size, manifest.counts.items);
  assert.equal(rowCounts.detailItems, manifest.storage.detailItemCount);
  assert.deepEqual(rowCounts.profileItems, manifest.counts.profileItems);
  assert.equal(rowCounts.itemsWithDescription, manifest.counts.itemsWithDescription);
  assert.equal(rowCounts.itemsWithActions, manifest.counts.itemsWithActions);
  assert.equal(rowCounts.profileMaterializedActions, manifest.counts.profileMaterializedActions);
  assert.equal(rowCounts.itemsWithInteractions, manifest.counts.itemsWithInteractions);
  assert.equal(rowCounts.profileMaterializedInteractions, manifest.counts.profileMaterializedInteractions);
  assert.equal(rowCounts.itemsWithLifecycle, manifest.counts.itemsWithLifecycle);
  assert.equal(rowCounts.profileMaterializedLifecyclePrograms, manifest.counts.profileMaterializedLifecyclePrograms);
  assert.equal(rowCounts.itemsWithEffects, manifest.counts.itemsWithEffects);
  assert.equal(rowCounts.profileMaterializedEffects, manifest.counts.profileMaterializedEffects);
  assert.equal(rowCounts.recipeRecords, manifest.counts.relationSources.recipeRecords);
  assert.equal(rowCounts.treasureTables, manifest.counts.relationSources.treasureTables);
  assert.deepEqual(rowCounts.placements, manifest.counts.relationSources.placements);

  const detailedItems = new Map();
  const localizedDescriptions = {ru: 0, en: 0};
  for (const entry of detailEntries) {
    const shard = assertExactArtifact(presentationBase, entry);
    assert.equal(shard.schemaVersion, 'bg3-ui-item-presentation-detail/1', entry.path);
    assert.equal(shard.catalogVersion, catalogVersion, entry.path);
    assert.equal(shard.sourceBuildId, sourceBuildId, entry.path);
    assert.equal(shard.shard, entry.shard, entry.path);
    assert.equal(shard.items.length, entry.itemCount, entry.path);
    assert.equal(shard.itemCount, entry.itemCount, entry.path);
    for (const item of shard.items) {
      assertExactKeys(item, ['itemId', 'description', 'profiles'], `${entry.path}/${item.itemId}`);
      assertExactKeys(item.description, ['ru', 'en'], `${entry.path}/${item.itemId}/description`);
      assert.equal(detailedItems.has(item.itemId), false, item.itemId);
      detailedItems.set(item.itemId, item);
      const row = rowByItem.get(item.itemId);
      assert.ok(row, item.itemId);
      assert.equal(row[1], entry.shard, item.itemId);
      const descriptions = ['ru', 'en'].filter(language => Boolean(item.description[language]));
      assert.equal(descriptions.length, row[3], item.itemId);
      for (const language of descriptions) localizedDescriptions[language]++;
      const expectedProfiles = [];
      if (row[12] & 1) expectedProfiles.push('standard');
      if (row[12] & 2) expectedProfiles.push('honour');
      assert.deepEqual(Object.keys(item.profiles), expectedProfiles, item.itemId);
      assert.equal(
        Object.values(item.profiles).reduce((sum, profile) => sum + profile.actionCount, 0),
        row[4],
        item.itemId,
      );
      assert.equal(
        Object.values(item.profiles).reduce((sum, profile) => sum + profile.interactionCount, 0),
        row[5],
        item.itemId,
      );
      assert.equal(
        Object.values(item.profiles).reduce((sum, profile) => sum + profile.lifecycleCount, 0),
        row[6],
        item.itemId,
      );
      assert.equal(
        Object.values(item.profiles).reduce((sum, profile) => sum + profile.effectCount, 0),
        row[7],
        item.itemId,
      );
      for (const [profileName, profile] of Object.entries(item.profiles)) {
        const field = `${entry.path}/${item.itemId}/${profileName}`;
        assertExactKeys(profile, [
          'actionCount',
          'interactionCount',
          'lifecycleCount',
          'effectCount',
          'actions',
          'interactions',
          'lifecycle',
          'effects',
        ], field);
        assert.equal(profile.actions.length, profile.actionCount, item.itemId);
        assert.equal(profile.interactions.length, profile.interactionCount, item.itemId);
        assert.equal(profile.lifecycle.length, profile.lifecycleCount, item.itemId);
        assert.equal(profile.effects.length, profile.effectCount, item.itemId);
        for (const [index, action] of profile.actions.entries()) {
          assertExactKeys(action, ['label'], `${field}.actions[${index}]`);
          assert.equal(typeof action.label === 'string' && action.label.trim().length > 0, true, field);
        }
        for (const [index, interaction] of profile.interactions.entries()) {
          assertExactKeys(interaction, ['label'], `${field}.interactions[${index}]`);
          assert.equal(typeof interaction.label === 'string' && interaction.label.trim().length > 0, true, field);
        }
        for (const [index, lifecycle] of profile.lifecycle.entries()) {
          assertExactKeys(lifecycle, ['kind', 'gate'], `${field}.lifecycle[${index}]`);
          assert.equal(lifecycleKindLabels.has(lifecycle.kind), true, `${field}.lifecycle[${index}].kind`);
          assert.equal(lifecycleGateLabels.has(lifecycle.gate), true, `${field}.lifecycle[${index}].gate`);
        }
        for (const [index, effect] of profile.effects.entries()) {
          assertExactKeys(effect, ['label', 'operation', 'value', 'unit'], `${field}.effects[${index}]`);
          assert.equal(typeof effect.label === 'string' && effect.label.trim().length > 0, true, field);
          assert.equal(effectOperationLabels.has(effect.operation), true, `${field}.effects[${index}].operation`);
          assert.equal(
            effect.value == null || typeof effect.value === 'number' || typeof effect.value === 'string',
            true,
            `${field}.effects[${index}].value`,
          );
          assert.equal(effect.unit == null || typeof effect.unit === 'string', true, `${field}.effects[${index}].unit`);
        }
        assertPublicProfileProjection(profile, field);
      }
    }
  }
  assert.equal(detailedItems.size, manifest.storage.detailItemCount);
  assert.deepEqual(localizedDescriptions, manifest.counts.localizedDescriptions);
  for (const [itemId, row] of rowByItem) {
    assert.equal(detailedItems.has(itemId), row[1] !== null, itemId);
  }
  const searchIndexes = new Set();
  let searchRows = 0;
  for (const entry of searchEntries) {
    const shard = assertExactArtifact(presentationBase, entry);
    assert.equal(shard.schemaVersion, 'bg3-ui-item-presentation-search/1', entry.path);
    assert.equal(shard.catalogVersion, catalogVersion, entry.path);
    assert.equal(shard.sourceBuildId, sourceBuildId, entry.path);
    assert.equal(shard.shard, entry.shard, entry.path);
    assert.equal(shard.rows.length, entry.rowCount, entry.path);
    assert.equal(shard.rowCount, entry.rowCount, entry.path);
    for (const row of shard.rows) {
      assert.equal(row.length, 4, entry.path);
      const itemIndex = row[0];
      assert.equal(Number.isSafeInteger(itemIndex), true, entry.path);
      assert.ok(rowByIndex[itemIndex], `${entry.path}: ${itemIndex}`);
      assert.equal(searchIndexes.has(itemIndex), false, `${entry.path}: ${itemIndex}`);
      searchIndexes.add(itemIndex);
      searchRows++;
      for (const termText of row.slice(2)) {
        if (termText == null) continue;
        assertPublicProfileProjection(termText, `${entry.path}: profile terms for ${itemIndex}`);
      }
    }
  }
  assert.equal(searchRows, manifest.storage.searchRowCount);
  assert.equal(searchIndexes.size, manifest.counts.items);
  assert.equal(manifest.storage.searchRowCount, manifest.counts.items);
});

test('item presentation excludes plot-bound source actions while retaining neutral mechanics as semantic labels', () => {
  const manifest = readJson(path.join(presentationBase, 'manifest.json')).value;
  const compactById = new Map(manifest.items.map((row, itemIndex) => [row[0], {itemIndex, row}]));
  const searchByIndex = new Map();
  for (const entry of manifest.storage.searchFiles) {
    const shard = readJson(resolvedArtifact(presentationBase, entry.path)).value;
    for (const row of shard.rows) searchByIndex.set(row[0], row);
  }

  const projection = (itemId, {requireDetail = true} = {}) => {
    const compact = compactById.get(itemId);
    assert.ok(compact, itemId);
    const search = searchByIndex.get(compact.itemIndex);
    assert.ok(search, `${itemId}: search projection`);
    let detail = null;
    if (compact.row[1] !== null) {
      const detailShard = readJson(path.join(presentationBase, 'detail', `${compact.row[1]}.json`)).value;
      detail = detailShard.items.find(item => item.itemId === itemId);
      assert.ok(detail, `${itemId}: detail projection`);
    }
    if (requireDetail) assert.ok(detail, `${itemId}: focused regression requires a detail row`);
    return {compact: compact.row, detail, search};
  };
  const profileTerms = (projected, profile) => profile === 'honour'
    ? (projected.search[3] ?? projected.search[2])
    : projected.search[2];

  const excluded = [
    {
      itemId: 'bg3:item:rt:000cfc9f-b973-48e7-a5c8-f2992a47a943:stats:REVOX1ZvbG9PcGVyYXRpb25fRXJzYXR6RXll',
      actionTypes: [19],
      leaked: /bg3story|storyuseininventory|actiontype 19|сюжет/i,
    },
    {
      itemId: 'bg3:item:rt:7eaa1331-877c-40d7-9811-8238aee09f68:stats:V1lSX01vbmtBbXVsZXRfQW11bGV0X0FmdGVyQ29tYmF0',
      actionTypes: [7],
      leaked: /ori_gale_avatar_consumeitem/i,
    },
    {
      itemId: 'bg3:item:rt:1ec327be-3b7f-4502-9586-860e057e09ae:stats:T0JKX1RhZHBvbGVQb3dlckphcg',
      actionTypes: [31],
      leaked: /bg3tadpole|actiontype 31|кампания/i,
    },
    {
      itemId: 'bg3:item:rt:a313a568-9b27-4b94-8ad8-50fcc374179f:stats:T0JKX0dlbmVyaWNMb290SXRlbQ',
      actionTypes: [8],
      leaked: /storyuse|actiontype 8/i,
    },
    {
      itemId: 'bg3:item:rt:11d9cef8-0652-441d-bb04-63262dd9ae66:stats:T0JKX0dlbmVyaWNJbW11dGFibGVPYmplY3Q',
      actionTypes: [8],
      leaked: /storyuse|actiontype 8/i,
    },
    {
      itemId: 'bg3:item:rt:8c68e68d-96d4-45d6-804c-5f31ac948ff3:stats:R0xPX1NvdWxDb2lu',
      actionTypes: [7],
      leaked: /ori_karlach_infernal_fury|really_karlach|actiontype 7/i,
    },
    {
      itemId: 'bg3:item:rt:dc83c211-ef84-4e54-96c4-94aadbd3184a:stats:R09CX1JvYXN0aW5nRHdhcmZfTWVhdA',
      actionTypes: [7],
      leaked: /gob_roastingdwarf_consume|really_dark_urge|actiontype 7/i,
    },
    {
      itemId: 'bg3:item:rt:84e8df93-cba4-4a0c-b946-73f59258e792:stats:R09CX1JvYXN0aW5nRHdhcmZfTWVhdA',
      actionTypes: [7],
      leaked: /gob_roastingdwarf_consume|really_dark_urge|actiontype 7/i,
    },
    {
      itemId: 'bg3:item:rt:c245cb1a-ecfb-4dac-b686-26013dbb00d9:stats:R09CX1JvYXN0aW5nRHdhcmZfTWVhdA',
      actionTypes: [7],
      leaked: /gob_roastingdwarf_consume|really_dark_urge|actiontype 7/i,
    },
  ];
  for (const {itemId, actionTypes, leaked} of excluded) {
    assert.deepEqual(
      exactSourceActions(itemId).flatMap(action => action.actionTypes),
      actionTypes,
      `${itemId}: source action evidence`,
    );
    const {compact, detail, search} = projection(itemId);
    assert.equal(compact[4], 0, `${itemId}: compact action count`);
    for (const profile of Object.values(detail.profiles)) {
      assert.equal(profile.actionCount, 0, `${itemId}: profile action count`);
      assert.deepEqual(profile.actions, [], `${itemId}: projected actions`);
    }
    assert.doesNotMatch(`${JSON.stringify(detail.profiles)} ${search.slice(2).join(' ')}`, leaked, itemId);
  }

  const worldBound = [
    {
      itemId: 'bg3:item:rt:9955f0bd-cf96-4541-a73f-2d6258b6b5d5:stats:UVVFU1RfUm9wZV9EZXN0cnVjdGFibGU',
      actionType: 2,
      metadata: 'destroy',
    },
    {
      itemId: 'bg3:item:rt:bc622efe-9903-4d30-8a4e-1ad29bb6247e:stats:T0JKX0dlbmVyaWNJbW11dGFibGVPYmplY3Q',
      actionType: 3,
      metadata: 'teleport',
    },
    {
      itemId: 'bg3:item:rt:1857556f-8cf6-4e6b-8b3e-e9df2329ddda:stats:T0JKX0Rvb3JJbmRlc3RydWN0aWJsZQ',
      actionType: 9,
      metadata: 'door',
    },
    {
      itemId: 'bg3:item:rt:6146ec95-970c-40d1-8312-a3c2496944f9:stats:T0JKX0dlbmVyaWNJbW11dGFibGVPYmplY3Q',
      actionType: 3,
      metadata: 'teleport',
      eventId: 'HAG_WoodWoad_Teleport',
    },
  ];
  for (const {itemId, actionType, metadata, eventId} of worldBound) {
    assert.deepEqual(
      exactSourceActions(itemId).flatMap(action => action.actionTypes),
      [actionType],
      `${itemId}: A${actionType} source evidence`,
    );
    const {compact, detail, search} = projection(itemId, {requireDetail: false});
    assert.equal(compact[4], 0, `${itemId}: A${actionType} compact action count`);
    if (detail) {
      for (const profile of Object.values(detail.profiles)) {
        assert.equal(profile.actionCount, 0, `${itemId}: A${actionType} profile action count`);
        assert.deepEqual(profile.actions, [], `${itemId}: A${actionType} projected actions`);
      }
    }
    const terms = search.slice(2).join(' ');
    assertPublicProfileProjection(search.slice(2), `${itemId}: world-bound profile search`);
    assert.doesNotMatch(terms, new RegExp(`(?:^|\\s)(?:actiontype|${metadata})(?:\\s|$)`, 'i'), itemId);
    if (eventId) assert.doesNotMatch(terms, new RegExp(eventId, 'i'), itemId);
  }
  assert.match(
    fs.readFileSync(path.join(repo, 'scripts', 'build-bg3-item-presentation.mjs'), 'utf8'),
    /WORLD_BOUND_ACTION_TYPES = new Set\(\[1, 2, 3, 4, 9, 10, 14, 15, 16, 17, 22, 24, 26, 27, 35\]\)/,
  );

  const lightToggle = projection('bg3:item:rt:3ce10950-db66-4e55-a4bc-6567de1bf1a9:stats:T0JKX0NvYWxCYXNrZXQ');
  let lightActionCount = 0;
  for (const [profileName, profile] of Object.entries(lightToggle.detail.profiles)) {
    const sourceActions = exactSourceActions(lightToggle.compact[0], profileName);
    assert.deepEqual(sourceActions.flatMap(action => action.actionTypes), [8]);
    assert.deepEqual(profile.actions.map(action => action.label), sourceActions.map(action => action.label));
    assertSearchContainsLabels(profileTerms(lightToggle, profileName), sourceActions.map(action => action.label), `${lightToggle.compact[0]}/${profileName}`);
    lightActionCount += profile.actionCount;
  }
  assert.equal(lightToggle.compact[4], lightActionCount);
  assert.doesNotMatch(lightToggle.search.slice(2).join(' '), /bg3lighttoggle|storyuse|actiontype/iu);

  const storageControls = [
    {
      itemId: 'bg3:item:rt:e32a200c-5b63-414d-ae57-00e7b38f125b:stats:T0JKX0tpdF9UaGlldmVzVG9vbHM',
      actionType: 18,
      metadata: /lockpick/i,
    },
    {
      itemId: 'bg3:item:rt:22c74b5e-bef2-41b1-b9ed-f4acc766d4ee:stats:T0JKX0tpdF9UcmFwRGlzYXJt',
      actionType: 20,
      metadata: /disarmtrap/i,
    },
  ];
  for (const {itemId, actionType, metadata} of storageControls) {
    const projected = projection(itemId);
    let projectedCount = 0;
    for (const [profileName, profile] of Object.entries(projected.detail.profiles)) {
      const sourceActions = exactSourceActions(itemId, profileName);
      assert.deepEqual(sourceActions.flatMap(action => action.actionTypes), [actionType], itemId);
      assert.deepEqual(profile.actions.map(action => action.label), sourceActions.map(action => action.label), itemId);
      const terms = profileTerms(projected, profileName);
      assertSearchContainsLabels(terms, sourceActions.map(action => action.label), `${itemId}/${profileName}`);
      assert.doesNotMatch(terms, metadata, itemId);
      projectedCount += profile.actionCount;
    }
    assert.equal(projected.compact[4], projectedCount, `${itemId}: retained A${actionType} count`);
  }

  const sourceManifest = readJson(path.join(sourceBase, 'manifest.json')).value;
  const controlCensus = new Map([[18, []], [20, []]]);
  for (const sourceEntry of sourceManifest.files.items) {
    const sourceShard = readJson(path.join(repo, ...sourceEntry.path.split('/'))).value;
    for (const item of sourceShard.items) {
      for (const profileName of item.source.profiles) {
        const profileItem = profileName === 'honour' && item.source.profiles.includes('standard')
          ? item.source.honourOverlay.item
          : item;
        for (const action of profileItem.mechanics.actions) {
          const actionTypes = exactSourceActionTypes(action);
          for (const actionType of controlCensus.keys()) {
            if (actionTypes.includes(actionType)) {
              controlCensus.get(actionType).push({itemId: item.id, profileName, label: action.label});
            }
          }
        }
      }
    }
  }
  assert.deepEqual(
    [...controlCensus].map(([actionType, entries]) => [actionType, entries.length]),
    [[18, 4], [20, 2]],
  );
  for (const [actionType, entries] of controlCensus) {
    for (const {itemId, profileName, label} of entries) {
      const projected = projection(itemId);
      assert.ok(
        projected.detail.profiles[profileName].actions.some(action => action.label === label),
        `${itemId}/${profileName}: retained A${actionType}`,
      );
    }
  }

  for (const itemId of [
    'bg3:item:rt:000cfc9f-b973-48e7-a5c8-f2992a47a943:stats:REVOX1ZvbG9PcGVyYXRpb25fRXJzYXR6RXll',
    'bg3:item:rt:7eaa1331-877c-40d7-9811-8238aee09f68:stats:V1lSX01vbmtBbXVsZXRfQW11bGV0X0FmdGVyQ29tYmF0',
  ]) {
    const sourceLifecycle = exactSourceProfileItem(itemId).mechanics.lifecyclePrograms;
    assert.ok(sourceLifecycle.length > 0, `${itemId}: source lifecycle evidence`);
    assert.match(JSON.stringify(sourceLifecycle), /\S+_\S+/, `${itemId}: source carries technical identities`);
    const projected = projection(itemId);
    assert.equal(projected.detail.profiles.standard.lifecycle.length, sourceLifecycle.length, itemId);
    for (const lifecycle of projected.detail.profiles.standard.lifecycle) {
      assertExactKeys(lifecycle, ['kind', 'gate'], `${itemId}: public lifecycle`);
      assert.equal(lifecycleKindLabels.has(lifecycle.kind), true, itemId);
      assert.equal(lifecycleGateLabels.has(lifecycle.gate), true, itemId);
    }
    assertPublicProfileProjection(projected.search.slice(2), `${itemId}: lifecycle search`);
  }

  const ordinary = projection('bg3:item:rt:3c95f8e7-1f68-406e-bbdd-13b6cbfd0c65:stats:T0JKX1Njcm9sbA');
  let ordinaryActionCount = 0;
  for (const [profileName, profile] of Object.entries(ordinary.detail.profiles)) {
    const sourceActions = exactSourceActions(ordinary.compact[0], profileName);
    assert.deepEqual(sourceActions.flatMap(action => action.actionTypes), [11]);
    assert.deepEqual(profile.actions.map(action => action.label), sourceActions.map(action => action.label));
    assertSearchContainsLabels(profileTerms(ordinary, profileName), sourceActions.map(action => action.label), `${ordinary.compact[0]}/${profileName}`);
    ordinaryActionCount += profile.actionCount;
  }
  assert.equal(ordinary.compact[4], ordinaryActionCount);
  const ordinaryTerms = ordinary.search.slice(2).join(' ');
  assert.match(ordinaryTerms, /сюжет/iu);
  assert.doesNotMatch(ordinaryTerms, /actiontype|(?:^|\s)11(?:\s|$)|bg3read|low_bibliophile_manuscriptnotes03/iu);

  const neutralMechanics = [
    {
      itemId: 'bg3:item:rt:2e7fc397-cb84-4573-b6c7-1c7a8f2742d6:stats:T0JKX1Njcm9sbF9TZWVJbnZpc2liaWxpdHk',
      labels: [
        'Применить: Свиток «Видение невидимого»',
        'Изучить заклинание: Свиток «Видение невидимого»',
      ],
      actionTypes: [12, 33],
      useful: [/видение/iu, /невидимого/iu],
      raw: /bg3learnspell|usespell|shout_seeinvisibility|actiontype/iu,
    },
    {
      itemId: 'bg3:item:rt:ae9a9360-7cbe-4f72-8bea-1dd5747c180d:stats:QUxDSF9Tb2x1dGlvbl9Qb3Rpb25fUmVtZWR5',
      labels: ['Использовать: Целебное зелье'],
      actionTypes: [7],
      useful: [/целебное/iu, /зелье/iu],
      raw: /consume|potion|alch_potion_remedy|actiontype/iu,
    },
    {
      itemId: 'bg3:item:rt:8037a20b-a2bf-41c9-b509-bb6b455c778c:stats:T0JKX0NyeXN0YWxfVmlyaWRpYW4',
      labels: ['Объединить: Виридиновый кристалл'],
      actionTypes: [23],
      useful: [/виридиновый/iu, /кристалл/iu],
      raw: /bg3recipe|combine|alch_extract_viridiancrystal|actiontype/iu,
    },
    {
      itemId: 'bg3:item:rt:db5ca6a8-89cb-44d8-91d3-b22afbda8a6c:stats:Qk9PS19BbGNoZW15X1BvdGlvbkFuaW1hbFNwZWFraW5n',
      labels: ['Прочитать: Зелье общения с животными'],
      actionTypes: [11, 30],
      useful: [/общения/iu, /животными/iu],
      raw: /bg3read|book|recipe|alch_potion_animalspeaking_acorntruffle|book_alchemy_potionanimalspeaking|actiontype/iu,
    },
  ];
  for (const {itemId, labels, actionTypes, useful, raw} of neutralMechanics) {
    const projected = projection(itemId);
    let projectedActionCount = 0;
    for (const [profileName, profile] of Object.entries(projected.detail.profiles)) {
      const sourceActions = exactSourceActions(itemId, profileName);
      assert.deepEqual(sourceActions.map(action => action.label), labels, `${itemId}/${profileName}: source labels`);
      assert.deepEqual(
        sourceActions.flatMap(action => action.actionTypes),
        actionTypes,
        `${itemId}/${profileName}: source action types`,
      );
      assert.deepEqual(profile.actions.map(action => action.label), labels, `${itemId}/${profileName}: public labels`);
      const terms = profileTerms(projected, profileName);
      assertSearchContainsLabels(terms, labels, `${itemId}/${profileName}: semantic search`);
      for (const expected of useful) assert.match(terms, expected, itemId);
      assert.doesNotMatch(terms, raw, itemId);
      projectedActionCount += profile.actionCount;
    }
    assert.equal(projected.compact[4], projectedActionCount, `${itemId}: compact neutral action count`);
  }
});

test('item presentation profile search excludes raw mechanics identifiers across the source corpus', () => {
  const manifest = readJson(path.join(presentationBase, 'manifest.json')).value;
  const itemIndexById = new Map(manifest.items.map((row, itemIndex) => [row[0], itemIndex]));
  const searchByIndex = new Map();
  for (const entry of manifest.storage.searchFiles) {
    const shard = readJson(resolvedArtifact(presentationBase, entry.path)).value;
    for (const row of shard.rows) searchByIndex.set(row[0], row);
  }

  for (const [itemIndex, search] of searchByIndex) {
    for (const terms of [search[2], search[3]]) {
      if (terms == null) continue;
      assert.doesNotMatch(terms, /(?:^|\s)\S*_\S*(?:\s|$)/, `raw identifier in search row ${itemIndex}`);
    }
  }

  const technicalFields = new Set([
    'bookid',
    'eventid',
    'matchingrecipeids',
    'matchtokens',
    'recipeid',
    'recipeids',
    'skillid',
    'skillids',
    'sourcespellids',
    'spellid',
    'spellids',
    'statsid',
    'statusid',
    'statusids',
  ]);
  const fieldCounts = new Map();
  const normalizedTokens = value => String(value == null ? '' : value)
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}:_+\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const stringsIn = value => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(stringsIn);
    if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
    return [];
  };
  const collectTechnicalValues = (value, found) => {
    if (Array.isArray(value)) {
      for (const entry of value) collectTechnicalValues(entry, found);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [field, nested] of Object.entries(value)) {
      const normalizedField = field.toLocaleLowerCase('en');
      if (technicalFields.has(normalizedField)) {
        const strings = stringsIn(nested);
        fieldCounts.set(normalizedField, (fieldCounts.get(normalizedField) || 0) + strings.length);
        for (const string of strings) found.push({field, string});
      } else {
        collectTechnicalValues(nested, found);
      }
    }
  };

  const sourceManifest = readJson(path.join(sourceBase, 'manifest.json')).value;
  let identifiersChecked = 0;
  let effectNotesChecked = 0;
  const effectNoteValues = new Set();
  for (const entry of sourceManifest.files.items) {
    const shard = readJson(path.join(repo, ...entry.path.split('/'))).value;
    for (const item of shard.items) {
      const itemIndex = itemIndexById.get(item.id);
      const search = searchByIndex.get(itemIndex);
      assert.notEqual(itemIndex, undefined, item.id);
      assert.ok(search, item.id);
      for (const profileName of item.source.profiles) {
        const profileItem = profileName === 'honour' && item.source.profiles.includes('standard')
          ? item.source.honourOverlay.item
          : item;
        const forbidden = [];
        collectTechnicalValues(profileItem.mechanics, forbidden);
        const terms = new Set(String(search[profileName === 'standard' ? 2 : 3] || '').split(' ').filter(Boolean));
        for (const effect of profileItem.mechanics.effects || []) {
          if (typeof effect.note !== 'string' || effect.note.length === 0) continue;
          effectNotesChecked++;
          effectNoteValues.add(effect.note);
          assert.equal(terms.has('bg3'), false, `${item.id}/${profileName}/effect.note: ${effect.note}`);
        }
        for (const {field, string} of forbidden) {
          for (const token of normalizedTokens(string)) {
            identifiersChecked++;
            assert.equal(terms.has(token), false, `${item.id}/${profileName}/${field}: ${string}`);
          }
        }
      }
    }
  }

  for (const field of [
    'bookid',
    'eventid',
    'matchingrecipeids',
    'recipeid',
    'skillid',
    'spellid',
    'statsid',
    'statusid',
  ]) assert.ok((fieldCounts.get(field) || 0) > 0, field);
  assert.ok(identifiersChecked > 0);
  assert.equal(effectNotesChecked, 582);
  assert.deepEqual([...effectNoteValues].sort(compareStrings), ['BG3 Boosts', 'BG3 Boosts · м']);
  assert.doesNotMatch(
    fs.readFileSync(path.join(repo, 'scripts', 'build-bg3-item-presentation.mjs'), 'utf8'),
    /addTerms\(terms, mechanics\.profile\?\.matchTokens\)/,
  );
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogVersion = 'bg3-24532579-v8';
const sourceBuildId = '24532579';
const placementBase = path.join(repo, 'data', 'bg3', 'ui', `${catalogVersion}-placement-browser`);
const presentationBase = path.join(repo, 'data', 'bg3', 'ui', `${catalogVersion}-item-presentation`);

const compareStrings = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const plain = value => JSON.parse(JSON.stringify(value));
const sha256 = value => crypto.createHash('sha256')
  .update(Buffer.isBuffer(value) ? value : fs.readFileSync(value))
  .digest('hex');

function readJson(file) {
  const buffer = fs.readFileSync(file);
  return {buffer, value: JSON.parse(buffer)};
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
  assert.deepEqual(plain(manifest.counts), {
    items: 10_284,
    profileItems: {standard: 10_282, honour: 10_284},
    itemsWithDescription: 5_706,
    localizedDescriptions: {ru: 5_706, en: 5_706},
    itemsWithActions: 5_034,
    profileMaterializedActions: 10_356,
    itemsWithInteractions: 3_451,
    profileMaterializedInteractions: 7_216,
    itemsWithLifecycle: 1_245,
    profileMaterializedLifecyclePrograms: 4_984,
    relationSources: {
      recipeRecords: 3_941,
      treasureTables: 8_885,
      placements: {standard: 1_290, honour: 1_290},
    },
  });

  const detailEntries = manifest.storage.detailFiles;
  const searchEntries = manifest.storage.searchFiles;
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
    recipeRecords: 0,
    treasureTables: 0,
    placements: {standard: 0, honour: 0},
    detailItems: 0,
  };
  for (const row of manifest.items) {
    assert.equal(Array.isArray(row), true);
    assert.equal(row.length, 12, row[0]);
    const [itemId, detailShard, flags, descriptionCount, actionCount, interactionCount,
      lifecycleCount, recipeRecords, treasureTables, standardPlacements, honourPlacements,
      profileMask] = row;
    assert.equal(rowByItem.has(itemId), false, itemId);
    rowByItem.set(itemId, row);
    rowByIndex.push(row);
    for (const value of row.slice(2)) assert.equal(Number.isSafeInteger(value) && value >= 0, true, itemId);
    assert.equal(flags <= 15, true, itemId);
    assert.equal(profileMask >= 1 && profileMask <= 3, true, itemId);
    assert.equal(Boolean(flags & 1), descriptionCount > 0, itemId);
    assert.equal(Boolean(flags & 2), actionCount > 0, itemId);
    assert.equal(Boolean(flags & 4), interactionCount > 0, itemId);
    assert.equal(Boolean(flags & 8), lifecycleCount > 0, itemId);
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
    rowCounts.profileMaterializedActions += actionCount;
    rowCounts.profileMaterializedInteractions += interactionCount;
    rowCounts.profileMaterializedLifecyclePrograms += lifecycleCount;
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
      assert.equal(detailedItems.has(item.itemId), false, item.itemId);
      detailedItems.set(item.itemId, item);
      const row = rowByItem.get(item.itemId);
      assert.ok(row, item.itemId);
      assert.equal(row[1], entry.shard, item.itemId);
      const descriptions = ['ru', 'en'].filter(language => Boolean(item.description[language]));
      assert.equal(descriptions.length, row[3], item.itemId);
      for (const language of descriptions) localizedDescriptions[language]++;
      const expectedProfiles = [];
      if (row[11] & 1) expectedProfiles.push('standard');
      if (row[11] & 2) expectedProfiles.push('honour');
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
      for (const profile of Object.values(item.profiles)) {
        assert.equal(profile.actions.length, profile.actionCount, item.itemId);
        assert.equal(profile.interactions.length, profile.interactionCount, item.itemId);
        assert.equal(profile.lifecycle.length, profile.lifecycleCount, item.itemId);
        assert.equal(profile.effects.length, profile.effectCount, item.itemId);
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
    }
  }
  assert.equal(searchRows, manifest.storage.searchRowCount);
  assert.equal(searchIndexes.size, manifest.counts.items);
  assert.equal(manifest.storage.searchRowCount, manifest.counts.items);
});

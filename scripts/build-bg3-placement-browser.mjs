import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_VERSION = 'bg3-24532579-v8';
const SOURCE_ROOT = join(REPO_ROOT, 'data', 'bg3', CATALOG_VERSION);
const OUTPUT_ROOT = join(REPO_ROOT, 'data', 'bg3', 'ui', `${CATALOG_VERSION}-placement-browser`);
const DETAIL_ROOT = join(OUTPUT_ROOT, 'detail');
const TARGET_DETAIL_BYTES = 210_000;
const HARD_DETAIL_BYTES = 250_000;
const PROFILE_ORDER = ['standard', 'honour'];
const CHECK_ONLY = process.argv.includes('--check');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function jsonBuffer(value, pretty = false) {
  return Buffer.from(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function repoPath(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableStrings(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))]
    .sort(compareStrings);
}

function verifyManifestFile(entry) {
  assert(entry && typeof entry.path === 'string', 'Source manifest contains an invalid file entry.');
  const path = join(REPO_ROOT, ...entry.path.split('/'));
  assert(existsSync(path), `Source file is missing: ${entry.path}`);
  const buffer = readFileSync(path);
  assert(buffer.byteLength === entry.bytes, `Source byte count differs from manifest: ${entry.path}`);
  assert(sha256(buffer) === entry.sha256, `Source SHA-256 differs from manifest: ${entry.path}`);
  return path;
}

function fingerprintFileEntries(entries) {
  const lines = entries
    .map(entry => `${entry.path}\0${entry.bytes}\0${entry.sha256}`)
    .sort(compareStrings);
  return sha256(Buffer.from(`${lines.join('\n')}\n`, 'utf8'));
}

function sourceEntryBySuffix(entries, suffix) {
  const found = entries.filter(entry => entry.path.endsWith(suffix));
  assert(found.length === 1, `Expected one source manifest entry ending in ${suffix}; found ${found.length}.`);
  return found[0];
}

function exactProfileNames(effectiveByProfile) {
  return PROFILE_ORDER.filter(profile => effectiveByProfile?.[profile]);
}

function exactVariantId(placement, profiles) {
  const itemIds = stableStrings(profiles.map(profile => placement.effectiveByProfile[profile]?.variantId));
  assert(itemIds.length === 1, `Placement ${placement.id} resolves to ${itemIds.length} item variants.`);
  return itemIds[0];
}

function makeCompactPlacement(placement, itemId, profiles) {
  const effective = placement.effectiveByProfile[profiles[0]];
  for (const profile of profiles.slice(1)) {
    assert(
      isDeepStrictEqual(placement.effectiveByProfile[profile], effective),
      `Placement ${placement.id} differs between profiles and cannot be compacted losslessly.`,
    );
  }
  assert(effective.variantId === itemId, `Placement ${placement.id} has an inconsistent item identity.`);
  return {
    id: placement.id,
    instanceUuid: placement.instanceUuid,
    recordShard: placement.shard,
    profiles,
    definitionId: effective.definitionId,
    module: effective.module,
    level: effective.level,
    name: effective.name,
    rootTemplateUuid: effective.rootTemplateUuid,
    directStatsId: effective.directStatsId,
    variantResolution: effective.variantResolution,
    directActionProgramCount: Array.isArray(effective.directActionProgramIds)
      ? effective.directActionProgramIds.length
      : 0,
    directScriptCount: Array.isArray(effective.directScriptUuids)
      ? effective.directScriptUuids.length
      : 0,
  };
}

function detailShardValue(shard, itemChunks) {
  return {
    schemaVersion: 'bg3-ui-placement-browser-detail-shard/1',
    catalogVersion: CATALOG_VERSION,
    sourceBuildId: '24532579',
    shard,
    itemChunkCount: itemChunks.length,
    itemCount: new Set(itemChunks.map(chunk => chunk.itemId)).size,
    placementCount: itemChunks.reduce((sum, chunk) => sum + chunk.placements.length, 0),
    itemChunks,
  };
}

function maximumPlacementsThatFit(shard, currentChunks, itemId, placements) {
  let low = 0;
  let high = placements.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = detailShardValue(shard, [
      ...currentChunks,
      { itemId, placements: placements.slice(0, middle) },
    ]);
    if (jsonBuffer(candidate).byteLength <= TARGET_DETAIL_BYTES) low = middle;
    else high = middle - 1;
  }
  return low;
}

function packDetailShards(items) {
  const shards = [];
  const detailRefsByItem = new Map();
  let currentChunks = [];

  function currentShardId() {
    return String(shards.length).padStart(4, '0');
  }

  function flush() {
    if (!currentChunks.length) return;
    const shard = currentShardId();
    const value = detailShardValue(shard, currentChunks);
    const buffer = jsonBuffer(value);
    assert(buffer.byteLength <= HARD_DETAIL_BYTES, `Generated detail shard ${shard} exceeds the hard byte limit.`);
    const path = `detail/${shard}.json`;
    shards.push({ shard, path, value, buffer });
    for (const chunk of currentChunks) {
      const refs = detailRefsByItem.get(chunk.itemId) || [];
      const previous = refs[refs.length - 1];
      if (previous?.shard === shard) previous.count += chunk.placements.length;
      else refs.push({ shard, count: chunk.placements.length });
      detailRefsByItem.set(chunk.itemId, refs);
    }
    currentChunks = [];
  }

  for (const item of items) {
    let remaining = item.placements;
    while (remaining.length) {
      const shard = currentShardId();
      let count = maximumPlacementsThatFit(shard, currentChunks, item.itemId, remaining);
      if (count === 0 && currentChunks.length) {
        flush();
        continue;
      }
      if (count === 0) {
        const oneRow = jsonBuffer(detailShardValue(shard, [{ itemId: item.itemId, placements: remaining.slice(0, 1) }]));
        assert(oneRow.byteLength <= HARD_DETAIL_BYTES, `One placement cannot fit in detail shard ${shard}.`);
        count = 1;
      }
      currentChunks.push({ itemId: item.itemId, placements: remaining.slice(0, count) });
      remaining = remaining.slice(count);
      if (remaining.length || jsonBuffer(detailShardValue(shard, currentChunks)).byteLength >= TARGET_DETAIL_BYTES) flush();
    }
  }
  flush();
  return { shards, detailRefsByItem };
}

function buildExpectedOutput() {
  const sourceManifestPath = join(SOURCE_ROOT, 'manifest.json');
  const sourceManifest = readJson(sourceManifestPath);
  const placementIndexPath = join(SOURCE_ROOT, 'item-placements.json');
  const placementIndex = readJson(placementIndexPath);

  assert(sourceManifest.catalogVersion === CATALOG_VERSION, 'Unexpected source manifest catalog version.');
  assert(sourceManifest.immutable === true, 'Source manifest is not marked immutable.');
  assert(placementIndex.catalogVersion === CATALOG_VERSION, 'Unexpected placement index catalog version.');
  assert(placementIndex.immutable === true, 'Placement index is not marked immutable.');
  assert(placementIndex.schemaVersion === 'bg3-item-placement-index/1', 'Unexpected placement index schema.');

  const compactEntries = [...sourceManifest.files.itemPlacementIndex]
    .sort((left, right) => compareStrings(left.shard, right.shard));
  const recordEntries = [...sourceManifest.files.itemPlacements]
    .sort((left, right) => compareStrings(left.shard, right.shard));
  const placementIndexEntry = sourceEntryBySuffix(sourceManifest.files.other, `/${CATALOG_VERSION}/item-placements.json`);
  assert(
    compactEntries.length === placementIndex.storage.index.indexShards.length,
    'Compact placement shard count differs between the placement index and source manifest.',
  );
  assert(
    recordEntries.length === placementIndex.storage.records.shards,
    'Full placement shard count differs between the placement index and source manifest.',
  );
  verifyManifestFile(placementIndexEntry);

  const expectedCompactShards = new Set(placementIndex.storage.index.indexShards);
  const expectedRecordShards = new Set(recordEntries.map(entry => entry.shard));
  const placementsByItem = new Map();
  const compactByPlacementId = new Map();
  const profilePlacements = Object.fromEntries(PROFILE_ORDER.map(profile => [profile, 0]));

  for (const entry of compactEntries) {
    assert(expectedCompactShards.delete(entry.shard), `Unexpected or duplicate compact source shard ${entry.shard}.`);
    const path = verifyManifestFile(entry);
    const value = readJson(path);
    assert(value.schemaVersion === 'bg3-item-placement-index-shard/1', `Unexpected schema in ${entry.path}.`);
    assert(value.catalogVersion === CATALOG_VERSION, `Unexpected catalog version in ${entry.path}.`);
    assert(value.shard === entry.shard, `Shard identity differs in ${entry.path}.`);
    assert(value.count === entry.count && value.placements.length === entry.count, `Count differs in ${entry.path}.`);
    for (const placement of value.placements) {
      assert(!compactByPlacementId.has(placement.id), `Duplicate compact placement ${placement.id}.`);
      assert(placement.id === `bg3:placement:${placement.instanceUuid}`, `Placement identity differs for ${placement.id}.`);
      assert(expectedRecordShards.has(placement.shard), `Placement ${placement.id} points to unknown record shard ${placement.shard}.`);
      const profiles = exactProfileNames(placement.effectiveByProfile);
      assert(profiles.length > 0, `Placement ${placement.id} has no effective profile.`);
      assert(
        JSON.stringify(stableStrings(placement.profiles)) === JSON.stringify(stableStrings(profiles)),
        `Placement profile list differs from effective profile keys for ${placement.id}.`,
      );
      for (const profile of profiles) profilePlacements[profile] += 1;
      const itemId = exactVariantId(placement, profiles);
      const compact = makeCompactPlacement(placement, itemId, profiles);
      compactByPlacementId.set(placement.id, { source: placement, itemId, compact, resolved: false });
      const placements = placementsByItem.get(itemId) || [];
      placements.push(compact);
      placementsByItem.set(itemId, placements);
    }
  }
  assert(expectedCompactShards.size === 0, `Missing ${expectedCompactShards.size} compact source shards.`);

  let fullPlacementCount = 0;
  for (const entry of recordEntries) {
    const path = verifyManifestFile(entry);
    const value = readJson(path);
    assert(value.schemaVersion === 'bg3-item-placement-shard/1', `Unexpected schema in ${entry.path}.`);
    assert(value.catalogVersion === CATALOG_VERSION, `Unexpected catalog version in ${entry.path}.`);
    assert(value.shard === entry.shard, `Shard identity differs in ${entry.path}.`);
    assert(value.count === entry.count && value.placements.length === entry.count, `Count differs in ${entry.path}.`);
    fullPlacementCount += value.placements.length;
    for (const placement of value.placements) {
      const expected = compactByPlacementId.get(placement.id);
      assert(expected, `Full placement ${placement.id} has no compact index row.`);
      assert(!expected.resolved, `Full placement ${placement.id} resolves more than once.`);
      assert(expected.source.shard === entry.shard, `Compact placement ${placement.id} points to the wrong record shard.`);
      assert(
        isDeepStrictEqual(placement.effectiveByProfile, expected.source.effectiveByProfile),
        `Full and compact effective profile records differ for ${placement.id}.`,
      );
      expected.resolved = true;
    }
  }

  const unresolved = [...compactByPlacementId.values()].filter(row => !row.resolved);
  assert(unresolved.length === 0, `${unresolved.length} compact placements do not resolve to a full record.`);
  assert(fullPlacementCount === compactByPlacementId.size, 'Full and compact placement counts differ.');
  assert(fullPlacementCount === placementIndex.counts.placements, 'Generated placement count differs from v8 metadata.');
  for (const profile of PROFILE_ORDER) {
    assert(
      profilePlacements[profile] === placementIndex.counts.profiles[profile],
      `Generated ${profile} placement count differs from v8 metadata.`,
    );
  }

  const itemRows = [...placementsByItem.entries()]
    .map(([itemId, placements]) => ({
      itemId,
      placements: [...placements].sort((left, right) => compareStrings(left.id, right.id)),
    }))
    .sort((left, right) => compareStrings(left.itemId, right.itemId));
  const { shards, detailRefsByItem } = packDetailShards(itemRows);

  const items = itemRows.map(({ itemId, placements }) => {
    const placementsByProfile = Object.fromEntries(PROFILE_ORDER.map(profile => [
      profile,
      placements.filter(placement => placement.profiles.includes(profile)),
    ]));
    return {
      itemId,
      placementCount: placements.length,
      profileCounts: Object.fromEntries(PROFILE_ORDER.map(profile => [
        profile,
        placementsByProfile[profile].length,
      ])),
      profileFacets: Object.fromEntries(PROFILE_ORDER.map(profile => {
        const profilePlacements = placementsByProfile[profile];
        if (profilePlacements.length === placements.length) return [profile, null];
        return [profile, {
          placementCount: profilePlacements.length,
          modules: stableStrings(profilePlacements.map(placement => placement.module)),
          levels: stableStrings(profilePlacements.map(placement => placement.level)),
          placementNames: stableStrings(profilePlacements.map(placement => placement.name)),
        }];
      })),
      availableProfiles: PROFILE_ORDER.filter(profile => placementsByProfile[profile].length > 0),
      modules: stableStrings(placements.map(placement => placement.module)),
      levels: stableStrings(placements.map(placement => placement.level)),
      placementNames: stableStrings(placements.map(placement => placement.name)),
      placementsWithDirectActions: placements.filter(placement => placement.directActionProgramCount > 0).length,
      placementsWithDirectScripts: placements.filter(placement => placement.directScriptCount > 0).length,
      detailRefs: detailRefsByItem.get(itemId),
    };
  });

  const detailFiles = shards.map(shard => ({
    path: shard.path,
    shard: shard.shard,
    bytes: shard.buffer.byteLength,
    sha256: sha256(shard.buffer),
    itemChunkCount: shard.value.itemChunkCount,
    itemCount: shard.value.itemCount,
    placementCount: shard.value.placementCount,
  }));
  const detailSetSha256 = sha256(jsonBuffer(detailFiles));
  const manifest = {
    schemaVersion: 'bg3-ui-placement-browser/1',
    catalogVersion: CATALOG_VERSION,
    sourceBuildId: placementIndex.sourceBuildId,
    immutableSource: true,
    deterministic: true,
    generatedFrom: {
      placementIndex: {
        path: placementIndexEntry.path,
        bytes: placementIndexEntry.bytes,
        sha256: placementIndexEntry.sha256,
      },
      compactSourceShards: {
        count: compactEntries.length,
        bytes: compactEntries.reduce((sum, entry) => sum + entry.bytes, 0),
        fingerprintSha256: fingerprintFileEntries(compactEntries),
      },
      fullRecordSourceShards: {
        count: recordEntries.length,
        bytes: recordEntries.reduce((sum, entry) => sum + entry.bytes, 0),
        fingerprintSha256: fingerprintFileEntries(recordEntries),
      },
    },
    contracts: {
      rootIdentity: 'exact-v8-item-variant-id',
      placementIdentity: 'exact-v8-placement-id-and-instance-uuid',
      profileOrder: PROFILE_ORDER,
      profileCompaction: 'only-byte-identical-effective-profile-records-may-share-one-ui-row',
      profileFacetResolution: 'profileFacets[profile]-or-null-fallback-to-aggregate-item-facets',
      fullRecordResolution: `data/bg3/${CATALOG_VERSION}/source/item-placements/{recordShard}.json`,
      detailAssignment: 'item-id-sort-then-placement-id-sort-sequential-bounded-packing',
    },
    counts: {
      itemIds: items.length,
      placements: compactByPlacementId.size,
      itemPlacementPairs: itemRows.reduce((sum, item) => sum + item.placements.length, 0),
      profilePlacements,
      placementsWithDirectActions: itemRows.reduce(
        (sum, item) => sum + item.placements.filter(placement => placement.directActionProgramCount > 0).length,
        0,
      ),
      placementsWithDirectScripts: itemRows.reduce(
        (sum, item) => sum + item.placements.filter(placement => placement.directScriptCount > 0).length,
        0,
      ),
      detailShards: shards.length,
    },
    storage: {
      detailPathTemplate: 'detail/{shard}.json',
      targetBytes: TARGET_DETAIL_BYTES,
      hardLimitBytes: HARD_DETAIL_BYTES,
      detailSetSha256,
      detailFiles,
    },
    integrity: {
      allCompactSourceFilesMatchV8Manifest: true,
      allFullRecordSourceFilesMatchV8Manifest: true,
      placementIdsUnique: compactByPlacementId.size === fullPlacementCount,
      eachPlacementResolvesToExactlyOneFullRecord: unresolved.length === 0,
      eachPlacementResolvesToExactlyOneItemId: true,
      allDetailShardsWithinHardLimit: detailFiles.every(file => file.bytes <= HARD_DETAIL_BYTES),
      rootCountsEqualDetailCounts:
        items.reduce((sum, item) => sum + item.placementCount, 0)
        === detailFiles.reduce((sum, file) => sum + file.placementCount, 0),
    },
    items,
  };
  const manifestBuffer = jsonBuffer(manifest);
  const integrity = {
    schemaVersion: 'bg3-ui-placement-browser-integrity/1',
    catalogVersion: CATALOG_VERSION,
    manifest: {
      path: 'manifest.json',
      bytes: manifestBuffer.byteLength,
      sha256: sha256(manifestBuffer),
    },
    detailSetSha256,
    generatedFileSetSha256: sha256(Buffer.from([
      `manifest.json\0${manifestBuffer.byteLength}\0${sha256(manifestBuffer)}`,
      ...detailFiles.map(file => `${file.path}\0${file.bytes}\0${file.sha256}`),
    ].join('\n') + '\n', 'utf8')),
  };
  const integrityBuffer = jsonBuffer(integrity, true);

  const expected = new Map([
    [join(OUTPUT_ROOT, 'manifest.json'), manifestBuffer],
    [join(OUTPUT_ROOT, 'integrity.json'), integrityBuffer],
    ...shards.map(shard => [join(OUTPUT_ROOT, ...shard.path.split('/')), shard.buffer]),
  ]);
  return { expected, manifest, integrity };
}

function existingGeneratedJsonFiles() {
  if (!existsSync(OUTPUT_ROOT)) return [];
  const files = [];
  for (const name of ['manifest.json', 'integrity.json']) {
    const path = join(OUTPUT_ROOT, name);
    if (existsSync(path)) files.push(path);
  }
  if (existsSync(DETAIL_ROOT)) {
    for (const name of readdirSync(DETAIL_ROOT)) {
      const path = join(DETAIL_ROOT, name);
      if (statSync(path).isFile() && name.endsWith('.json')) files.push(path);
    }
  }
  return files;
}

function writeOrCheck(expected) {
  const existing = existingGeneratedJsonFiles();
  const extra = existing.filter(path => !expected.has(path));
  if (CHECK_ONLY) {
    assert(extra.length === 0, `Generated output has ${extra.length} stale JSON files.`);
    for (const [path, buffer] of expected) {
      assert(existsSync(path), `Generated file is missing: ${repoPath(path)}`);
      assert(readFileSync(path).equals(buffer), `Generated file differs: ${repoPath(path)}`);
    }
    return;
  }
  mkdirSync(DETAIL_ROOT, { recursive: true });
  for (const [path, buffer] of expected) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || !readFileSync(path).equals(buffer)) writeFileSync(path, buffer);
  }
  for (const path of extra) unlinkSync(path);
}

const { expected, manifest, integrity } = buildExpectedOutput();
writeOrCheck(expected);
const mode = CHECK_ONLY ? 'verified' : 'built';
console.log(JSON.stringify({
  mode,
  output: repoPath(OUTPUT_ROOT),
  counts: manifest.counts,
  manifest: integrity.manifest,
  detailSetSha256: integrity.detailSetSha256,
  generatedFileSetSha256: integrity.generatedFileSetSha256,
}, null, 2));

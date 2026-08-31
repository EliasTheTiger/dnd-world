import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { selectBg3Catalog } from './bg3-catalog-selection.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { current, catalogRoot: versionRoot, manifest } = selectBg3Catalog(repo);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('BG3 story artifact is immutable, complete, and item-linked', () => {
  const relative = manifest.entrypoints.storyItems;
  assert.equal(relative, 'story-items.json');
  const expectedPath = `data/bg3/${current.catalogVersion}/${relative}`;
  const descriptor = manifest.files.other.find(row => row.path === expectedPath);
  assert.ok(descriptor, 'story artifact must be covered by manifest integrity');
  const file = path.join(repo, descriptor.path);
  assert.equal(fs.statSync(file).size, descriptor.bytes);
  assert.equal(sha256(file), descriptor.sha256);

  const story = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(story.schemaVersion, 'bg3-story-items/1');
  assert.equal(story.catalogVersion, current.catalogVersion);
  assert.equal(story.contracts.localizedTextExecutable, false);
  assert.equal(story.contracts.dicePolicy, 'player-input-required');
  assert.deepEqual(story.counts, manifest.counts.storyItems);
  assert.ok(story.counts.rawGoalFiles > 0);
  assert.ok(story.counts.effectiveGoalFiles > 0);
  assert.ok(story.counts.standardGoals > 0);
  assert.equal('honourGoals' in story.counts, false);
  assert.ok(story.counts.linkedBlocks > 0);
  assert.ok(story.counts.linkedItems > 0);
  assert.equal(
    story.counts.levelItems.sourceCounts?.uniqueInstances
      ?? story.counts.levelItems.uniqueLinkedInstances,
    manifest.counts.itemPlacements.placements,
  );

  const allItemIds = new Set();
  for (const descriptor of manifest.files.items) {
    const shard = JSON.parse(fs.readFileSync(path.join(repo, descriptor.path), 'utf8'));
    for (const item of shard.items) allItemIds.add(item.id);
  }
  for (const [itemId, linkIds] of Object.entries(story.itemLinks)) {
    assert.ok(allItemIds.has(itemId), `unknown story-linked item ${itemId}`);
    assert.ok(linkIds.length > 0);
  }
  const linkIds = new Set(story.links.map(row => row.id));
  assert.equal(linkIds.size, story.links.length);
  for (const ids of Object.values(story.itemLinks)) {
    for (const id of ids) assert.ok(linkIds.has(id), `unknown story link ${id}`);
  }
});

test('BG3 story programs are typed conservatively and unknown calls fail closed', () => {
  const story = JSON.parse(fs.readFileSync(path.join(versionRoot, manifest.entrypoints.storyItems), 'utf8'));
  assert.equal(story.linkStorage.schemaVersion, 'bg3-story-program-shards/1');
  assert.equal(story.linkStorage.assignment, 'explicit-bounded-overflow-shard-in-links');
  assert.equal(manifest.files.storyPrograms.length, story.linkStorage.shards);
  assert.equal(manifest.files.storyPrograms.length, manifest.sharding.storyPrograms.shards);
  assert.equal(
    Math.max(...manifest.files.storyPrograms.map(row => row.bytes)),
    manifest.sharding.storyPrograms.maxBytes,
  );
  assert.ok(
    manifest.sharding.storyPrograms.maxBytes < manifest.sharding.storyPrograms.hardLimitBytes,
  );
  const compactShardById = new Map(story.links.map(row => [row.id, row.shard]));
  assert.equal(compactShardById.size, story.links.length);
  const sourceArchives = new Map();
  assert.equal(manifest.files.storySourceArchives.length, story.linkStorage.sourceArchives.count);
  for (const descriptor of manifest.files.storySourceArchives) {
    const archive = JSON.parse(fs.readFileSync(path.join(repo, descriptor.path), 'utf8'));
    assert.equal(archive.schemaVersion, 'bg3-story-source-archive/1');
    assert.equal(archive.catalogVersion, current.catalogVersion);
    assert.equal(archive.linkId, descriptor.linkId);
    assert.deepEqual(Object.keys(archive.fields).sort(), descriptor.fields);
    assert.equal(
      crypto.createHash('sha256').update(`${JSON.stringify(archive.fields)}\n`).digest('hex'),
      archive.fieldsSha256,
    );
    assert.equal(archive.fieldsSha256, descriptor.fieldsSha256);
    assert.ok(descriptor.bytes < manifest.sharding.storySourceArchives.hardLimitBytes);
    sourceArchives.set(archive.linkId, {archive, descriptor});
  }
  const fullLinks = [];
  for (const descriptor of manifest.files.storyPrograms) {
    const shard = JSON.parse(fs.readFileSync(path.join(repo, descriptor.path), 'utf8'));
    assert.equal(shard.schemaVersion, 'bg3-story-program-shard/1');
    assert.equal(shard.shard, descriptor.shard);
    assert.equal(shard.count, descriptor.count);
    assert.match(descriptor.shard, /^[0-9a-f]{2}(?:-[0-9a-f]{4})?$/);
    if (descriptor.bytes > manifest.sharding.storyPrograms.targetBytes) {
      assert.ok(descriptor.shard.includes('-'), 'target overflow must use an explicit bounded overflow shard');
      assert.ok(descriptor.bytes < manifest.sharding.storyPrograms.hardLimitBytes,
        'a packed overflow shard may exceed targetBytes but never the hard limit');
    }
    for (const link of shard.links) {
      assert.equal(
        crypto.createHash('sha256').update(link.id).digest('hex').slice(0, 2),
        descriptor.shard.slice(0, 2),
      );
      assert.equal(compactShardById.get(link.id), descriptor.shard);
      let restoredLink = link;
      if (link.sourceArchive) {
        const stored = sourceArchives.get(link.id);assert.ok(stored, link.id);
        assert.equal(link.sourceArchive.path, path.relative(versionRoot, path.join(repo, stored.descriptor.path)).split(path.sep).join('/'));
        assert.equal(link.sourceArchive.fieldsSha256, stored.archive.fieldsSha256);
        assert.deepEqual(link.sourceArchive.fields, Object.keys(stored.archive.fields).sort());
        restoredLink = {...link};
        delete restoredLink.sourceArchive;
        Object.assign(restoredLink, stored.archive.fields);
        assert.equal(restoredLink.id, link.id);
        if (Object.hasOwn(stored.archive.fields, 'references')) {
          assert.equal(Object.hasOwn(link, 'references'), false);
          assert.ok((link.storyEntrypoints || []).every(row => row.executable !== true));
        }
      }
      fullLinks.push(restoredLink);
    }
  }
  assert.deepEqual(
    fullLinks.map(row => row.id).sort(),
    story.links.map(row => row.id).sort(),
    'compact and full story indexes must contain the same links',
  );
  let typedConsequences = 0;
  let manualCalls = 0;
  for (const link of fullLinks) {
    const program = link.program;
    assert.equal(program.schemaVersion, 'bg3-story-program/1');
    assert.equal(program.executionModel, 'validate-commit-consequences');
    assert.equal(program.rollPolicy, 'player-input-required');
    assert.equal(program.localizedTextExecutable, false);
    assert.equal(program.requiresGmConfirmation, true);
    for (const row of program.phases.conditions) {
      assert.equal(row.executable, false, 'Osiris conditions need explicit runtime bindings');
    }
    for (const phase of Object.values(program.phases)) {
      for (const row of phase) {
        if (row.executable) {
          assert.notEqual(row.opcode, 'manualOsirisCall');
          typedConsequences += 1;
        } else {
          assert.equal(row.opcode, 'manualOsirisCall');
          manualCalls += 1;
        }
      }
    }
  }
  assert.ok(typedConsequences > 0);
  assert.ok(manualCalls > typedConsequences);

  const sourceProgramOf = row => row.sourceProgram || sourceArchives.get(row.id)?.archive.fields.sourceProgram || '';
  const dangerousBook = fullLinks.filter(row =>
    sourceProgramOf(row).includes('73ea8888-ed82-4ca5-b9f9-0c9119873507'));
  assert.ok(dangerousBook.length > 0,
    'full Standard source census preserves Dangerous Book story evidence outside the strict item arsenal');
  assert.ok(dangerousBook.every(row => row.program.requiresGmConfirmation === true),
    'preserved story evidence never becomes an unconditional runtime effect');
});

test('installed Story causal inventory contains every measured executable read entrypoint and exact full artifact', () => {
  const story = JSON.parse(fs.readFileSync(path.join(versionRoot, manifest.entrypoints.storyItems), 'utf8'));
  const executable = story.links.flatMap(link => (link.causalEntrypoints || [])
    .filter(entrypoint => entrypoint.executable === true)
    .map(entrypoint => ({link, entrypoint})));
  const logicalCount = manifest.counts.storyItems.executableCausalEntrypoints;
  const physicalCount = manifest.counts.storyItemProfileClosure?.executableEntrypoints ?? logicalCount;
  const selected = executable.filter(({entrypoint}) => entrypoint.profiles.includes(current.defaultRulesProfile));
  assert.equal(logicalCount, 10, 'Standard has ten executable causal Story entrypoints');
  assert.equal(executable.length, physicalCount, 'compact Story inventory matches its manifest physical cardinality');
  assert.equal(selected.length, logicalCount, 'selected profile exposes every logical executable Story entrypoint once');
  assert.deepEqual(Object.fromEntries([...new Set(selected.map(row => row.entrypoint.eventKind))].sort().map(kind => [kind,
    selected.filter(row => row.entrypoint.eventKind === kind).length])), {'book-closed': 8, 'template-use-finished': 2});
  assert.ok(executable.every(({entrypoint}) => entrypoint.actionType === 11 && entrypoint.complete === true && entrypoint.mode === 'typed'));
  if (manifest.counts.storyItemProfileClosure) {
    assert.equal(physicalCount, 10);
    assert.ok(executable.every(({entrypoint}) => entrypoint.profiles.length === 1));
    assert.deepEqual(Object.fromEntries(['standard'].map(profile => [profile,
      executable.filter(({entrypoint}) => entrypoint.profiles[0] === profile).length])), {standard: 10});
  } else {
    assert.ok(executable.every(({entrypoint}) => entrypoint.profiles.includes('standard')),
      'legacy compact rows advertise Standard');
  }

  const descriptorByShard = new Map(manifest.files.storyPrograms.map(row => [row.shard, row]));
  const fullById = new Map();
  for (const shard of new Set(executable.map(row => row.link.shard))) {
    const descriptor = descriptorByShard.get(shard);assert.ok(descriptor, `missing executable Story shard ${shard}`);
    const payload = JSON.parse(fs.readFileSync(path.join(repo, descriptor.path), 'utf8'));
    for (const link of payload.links) fullById.set(link.id, link);
  }
  const exactExecutable = [];
  for (const {link, entrypoint: compact} of executable) {
    const full = fullById.get(link.id);assert.ok(full, `missing full executable Story link ${link.id}`);
    const matches = (full.storyEntrypoints || []).filter(row => row.id === compact.id);assert.equal(matches.length, 1);
    const exact = matches[0];exactExecutable.push(exact);assert.equal(exact.executable, true);assert.equal(exact.localizedTextExecutable, false);
    assert.equal(exact.actionBinding.itemId, compact.itemVariantId);assert.equal(exact.actionBinding.itemUseId, compact.itemUseId);
    assert.equal(exact.actionBinding.rootProgramId, compact.rootProgramId);assert.match(exact.actionBinding.rootArtifact, /^root-template-programs\/[0-9a-f]{2}(?:-[0-9a-f]{4})?\.json$/);
    assert.equal(exact.actionBinding.actionType, 11);assert.equal(exact.actionBinding.commitPolicy, 'item-action-contract-once');
  }
  if (manifest.counts.storyItemProfileClosure) {
    const bySourceEvent = new Map();
    for (const entrypoint of exactExecutable) {
      if (!bySourceEvent.has(entrypoint.sourceEventId)) bySourceEvent.set(entrypoint.sourceEventId, []);
      bySourceEvent.get(entrypoint.sourceEventId).push(entrypoint);
    }
    assert.equal(bySourceEvent.size, logicalCount);
    for (const entrypoints of bySourceEvent.values()) {
      assert.equal(entrypoints.length, 1);
      assert.deepEqual(entrypoints[0].profiles, ['standard']);
    }
  }
});

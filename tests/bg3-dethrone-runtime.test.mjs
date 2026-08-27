import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * Immutable active-v10 source certificate for the two exact Scroll of Dethrone
 * cast rows.  These tests deliberately grant no runtime authority.  The
 * The private causal boundary below drives the exact source, scroll-check,
 * player-entered roll, single resource commit, consequence and rollback proofs.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = selectBg3Catalog(repo);
const {current, manifest, manifestPath, catalogRoot} = selected;
const PROFILES = Object.freeze(['standard', 'honour']);

const EXPECTED = Object.freeze({
  version: 'bg3-24532579-v10',
  currentSha256: 'c2387c9e411a470380b8af87d116e591d5115e9c01558168259571849bd2907b',
  manifestSha256: 'b69e8120ee62e0bc5c3f1af1b096c81f7966285859093b8638f36599f53ff71a',
  carrierRows: 2,
  carrierItems: 1,
  aggregateBytes: 997,
  aggregateSha256: '7d6b39537450ae81c842eae195145ef859ff5de0559da56ecaebf05935e5911f',
});

const ARTIFACT_SHA256 = Object.freeze({
  'items/13-0002.json': '736af7bb4e8c4e09f50fa02204d638b3c22276770db77c124e68dc51c98a6de4',
  'root-template-programs/13-0000.json': '394f5292bce5f324aec2e074147ff6917f7f959739df73f201c319983bc8ec99',
  'rules/spells/fd.json': 'd24d54170dab18c01c8a1be33bc91a6ac6f6e1d7d80996c7071cba1fb685bd3c',
  'item-rule-links/13.json': '05ba0c16101d9ef4b48789f3dffca7090c5867ce187887f7df779641c08e40c2',
  'rule-program-index.json': '4578454234e09746d5259698c1c6bfea61d40a5b16f8a009dc284e91e0c82da1',
  'source/item-stats/41.json': 'e79c0205ab8d696a99e5ea641685bcc80ae9000081ecd8c6775f0ed2c065022f',
  'source/root-templates/fb.json': 'f6a67c960ce26509ca1c410368c7b2c1e00915758a94f6e29b1c9de092b7a60a',
});

const DETHRONE = Object.freeze({
  itemId: 'bg3:item:rt:b2e1168a-021d-4a81-a041-6d2e1421a1fb:stats:VU5JX0xPV19EZXRocm9uZVNjcm9sbA',
  itemArtifact: 'items/13-0002.json',
  statsId: 'UNI_LOW_DethroneScroll',
  statsArtifact: 'source/item-stats/41.json',
  rootTemplateUuid: 'b2e1168a-021d-4a81-a041-6d2e1421a1fb',
  rootTemplateArtifact: 'source/root-templates/fb.json',
  rootProgramArtifact: 'root-template-programs/13-0000.json',
  itemRuleLinksArtifact: 'item-rule-links/13.json',
  spellId: 'Projectile_CursedTome_Dethrone',
  ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9DdXJzZWRUb21lX0RldGhyb25l',
  ruleArtifact: 'rules/spells/fd.json',
  wizardClassDescriptionUuid: 'a865965f-501b-46e9-9eaa-7748e8c04d09',
  useIds: Object.freeze({
    standard: 'bg3-use-bdd6d926d0d92df10d58',
    honour: 'bg3-use-526fe62a5fb66d7b83d1',
  }),
  canonicalSha256: Object.freeze({
    standard: Object.freeze({
      use: 'e78194250744beb2da3c61444d2593f535b45f8ed9fe915b80a4a26281a3d182',
      useProgram: '3727cd9a3a58f297cdbe6ec0ed9da48e48dcee2e68a624c96a63d460c3c9dec0',
      rootProgram: '8dd34ff7c54de712d7fbcea088813a738fae430046d78d1210f721510480a5ab',
      ruleProgram: '3c86286f3b31fc9cd82daf57ce5738a0321324500b3583b3026c5c027868bd65',
      projection: 'b3b9e35b3d03221bce04f264372257804d1d0134cc135a9055fdcc9ad4e04a8a',
    }),
    honour: Object.freeze({
      use: 'f00d1599423c7b11bf488cab63661d858b1c5d160b44fb63cd1fa8f753d3493c',
      useProgram: '42a001a0aabefeaccdda334ae9a7ea864b0b4f7e26b29a714842f155fd5c22d7',
      rootProgram: '251e94242d311222eeb84e768a2e17993e717fde43982baa4ac186d6cdd37451',
      ruleProgram: '057823e0dce868631ca710c028c689fdddb7811c70791331bae4dcd0cdb84274',
      projection: '5bcb8b7ec56e570db0301cc9f1f761aeacc8e57e74ec4c5a2767a866d665d1ef',
    }),
  }),
});

const jsonCache = new Map();

function sha256(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array ? value : String(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function catalogArtifact(descriptor) {
  return path.relative(catalogRoot, path.resolve(repo, ...descriptor.path.split('/'))).replaceAll('\\', '/');
}

function descriptorsForArtifact(artifact) {
  return Object.entries(manifest.files || {}).flatMap(([group, descriptors]) =>
    (descriptors || []).filter(descriptor => catalogArtifact(descriptor) === artifact)
      .map(descriptor => ({group, descriptor})));
}

function descriptorForArtifact(artifact) {
  const matches = descriptorsForArtifact(artifact);
  assert.equal(matches.length, 1, `${artifact}: exact manifest descriptor cardinality`);
  return matches[0].descriptor;
}

function readDescriptor(descriptor) {
  const absolute = path.resolve(repo, ...descriptor.path.split('/'));
  if (jsonCache.has(absolute)) return jsonCache.get(absolute);
  const raw = fs.readFileSync(absolute);
  assert.equal(raw.byteLength, descriptor.bytes, `${descriptor.path}: manifest byte count`);
  assert.equal(sha256(raw), descriptor.sha256, `${descriptor.path}: manifest SHA-256`);
  const value = JSON.parse(raw.toString('utf8'));
  jsonCache.set(absolute, value);
  return value;
}

function readArtifact(artifact) {
  return readDescriptor(descriptorForArtifact(artifact));
}

function effectiveMechanics(item, profile) {
  return profile === 'honour' && item.source?.honourOverlay?.item?.mechanics
    ? item.source.honourOverlay.item.mechanics : item.mechanics;
}

function fieldOf(program, name) {
  return (program?.fields || []).find(field => field.field === name) || null;
}

function opcodeOf(program, fieldName, opcodeName) {
  return (fieldOf(program, fieldName)?.bytecode || []).filter(opcode => opcode?.op === opcodeName);
}

function collectKind(value, kind, out = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectKind(child, kind, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.kind === kind) out.push(value);
  for (const child of Object.values(value)) collectKind(child, kind, out);
  return out;
}

const itemPayload = readArtifact(DETHRONE.itemArtifact);
const item = (itemPayload.items || []).find(candidate => candidate.id === DETHRONE.itemId);
assert.ok(item, 'exact Dethrone item exists');

const rootPayload = readArtifact(DETHRONE.rootProgramArtifact);
const rulePayload = readArtifact(DETHRONE.ruleArtifact);
const rule = (rulePayload.rules || []).find(candidate => candidate.id === DETHRONE.ruleId);
assert.ok(rule, 'exact Dethrone rule exists');

const linkSets = (manifest.files.itemRuleLinks || []).flatMap(descriptor =>
  readDescriptor(descriptor).linkSets || []);
const exactLinkSets = linkSets.filter(linkSet => (linkSet.linked || []).some(link =>
  link.scope === 'active' && link.kind === 'spell' && link.ruleId === DETHRONE.ruleId
    && link.bg3Id === DETHRONE.spellId));

const carrierRows = PROFILES.map(profile => {
  const mechanics = effectiveMechanics(item, profile);
  const uses = (mechanics?.actions || []).filter(use => use.handler === 'bg3RuleProgram'
    && use.program?.projection?.entrypoints?.some(entry => entry.ruleId === DETHRONE.ruleId
      && entry.bg3Id === DETHRONE.spellId));
  assert.equal(uses.length, 1, `${profile}: exact Dethrone cast use cardinality`);
  const use = uses[0];
  const roots = (rootPayload.programs || []).filter(program => program.id === use.program.id);
  assert.equal(roots.length, 1, `${profile}: exact Dethrone root program cardinality`);
  const ruleProgram = rule.programs?.[profile];
  assert.ok(ruleProgram, `${profile}: exact Dethrone rule program`);
  return {profile, item, mechanics, use, root: roots[0], rule, ruleProgram};
});

function carrierCensusLine(row) {
  const projectionSha256 = sha256(canonical(row.use.program.projection));
  return [row.profile, row.item.id, row.use.id, row.root.id, row.use.program.rootArtifact,
    row.rule.id, row.ruleProgram.id, row.use.program.artifact, projectionSha256].join('|');
}

function checkCarrier(row) {
  const failures = [];
  const check = (condition, label) => { if (!condition) failures.push(label); };
  const {profile, use, root, ruleProgram} = row;
  const contract = use?.program || {};
  const projection = contract.projection || {};
  const entrypoints = projection.entrypoints || [];
  const entry = entrypoints[0];
  const sourceAction = contract.sourceAction?.primary;
  const validation = root?.validation || [];
  const guard = validation[0];
  const guardArgs = guard?.condition?.args || [];
  const commit = root?.commit || [];
  const consequence = root?.consequences || [];
  const expectedRootId = `${DETHRONE.itemId}:root-action:${profile}:OnUsePeaceActions:0`;
  const expectedRuleProgramId = `${DETHRONE.ruleId}:program:${profile}`;

  check(use?.id === DETHRONE.useIds[profile] && use?.handler === 'bg3RuleProgram', 'use-identity');
  check(use?.cost === 'action' && use?.target === 'creature'
    && use?.consume?.kind === 'item' && use?.consume?.amount === 1
    && use?.rollPolicy === 'player-input-required', 'item-boundary');
  check(contract.id === expectedRootId && contract.sourceProfile === profile
    && contract.rootArtifact === DETHRONE.rootProgramArtifact && contract.mode === 'typed'
    && contract.commitPolicy === 'item-action-contract-once', 'item-program');
  check(contract.ruleProgramId === expectedRuleProgramId && contract.ruleSourceProfile === profile
    && contract.artifact === DETHRONE.ruleArtifact
    && contract.invokedRuleResourceCostPolicy === 'caller-item-action', 'rule-binding');
  check(!Object.prototype.hasOwnProperty.call(contract, 'scroll'), 'no-generic-scroll-authority');

  check(sourceAction?.actionType === 12 && sourceAction?.index === 0
    && sourceAction?.trigger === 'OnUsePeaceActions' && sourceAction?.rootProgramId === expectedRootId
    && sourceAction?.attributes?.ActionType === '12'
    && sourceAction?.attributes?.ClassId === DETHRONE.wizardClassDescriptionUuid
    && sourceAction?.attributes?.Conditions === `CanUseSpellScroll("${DETHRONE.spellId}")`
    && sourceAction?.attributes?.Consume === 'True'
    && sourceAction?.attributes?.SkillID === DETHRONE.spellId
    && contract.sourceAction?.aliases?.length === 0, 'source-action');

  check(root?.id === expectedRootId && root?.sourceProfile === profile
    && root?.sourceRootTemplateUuid === DETHRONE.rootTemplateUuid && root?.inherited === false
    && root?.trigger === 'OnUsePeaceActions' && root?.actionType === 12
    && root?.executionModel === 'validate-commit-consequences' && root?.mode === 'typed', 'root-program');
  check(validation.length === 1 && guard?.op === 'guard' && guard?.executable === true
    && guard?.phase === 'validation' && guard?.condition?.kind === 'predicate'
    && guard?.condition?.name === 'CanUseSpellScroll' && guardArgs.length === 1
    && guardArgs[0]?.kind === 'string' && guardArgs[0]?.value === DETHRONE.spellId, 'a12-scroll-guard');
  check(commit.length === 1 && commit[0]?.op === 'commitFromItemAction'
    && commit[0]?.executable === true && commit[0]?.phase === 'commit'
    && commit[0]?.mutation === 'delegated-to-item-action-contract'
    && commit[0]?.binding?.cost === 'action' && commit[0]?.binding?.consume?.kind === 'item'
    && commit[0]?.binding?.consume?.amount === 1, 'single-caller-commit');
  check(consequence.length === 1 && consequence[0]?.op === 'invokeRuleProgram'
    && consequence[0]?.programId === expectedRuleProgramId
    && consequence[0]?.sourceProfile === profile && consequence[0]?.artifact === DETHRONE.ruleArtifact
    && consequence[0]?.resourceCostPolicy === 'caller-item-action'
    && consequence[0]?.executionPolicy === 'all-reachable-opcodes-or-fail-closed', 'single-rule-invoke');

  check(projection.schemaVersion === 'bg3-action-rule-projection/1'
    && projection.sourceProfile === profile && projection.context === 'generic'
    && projection.mode === 'typed' && projection.complete === true
    && projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && entrypoints.length === 1 && (projection.unresolved || []).length === 0, 'projection-header');
  check(entry?.kind === 'spell' && entry?.ruleId === DETHRONE.ruleId
    && entry?.bg3Id === DETHRONE.spellId && entry?.programId === expectedRuleProgramId
    && entry?.artifact === DETHRONE.ruleArtifact && entry?.sourceProfile === profile
    && entry?.mode === 'typed', 'projection-entrypoint');
  check((projection.transitive || []).length === 0
    && (projection.bg3LifecycleBindings || []).length === 0
    && (projection.bg3StatusPassiveBindings || []).length === 0
    && projection.summary?.rulePrograms === 1 && projection.summary?.lifecycleBindings === 0
    && projection.summary?.incompleteLifecycleBindings === 0
    && projection.summary?.statusPassiveBindings === 0
    && projection.summary?.incompleteStatusPassiveBindings === 0, 'bounded-dependencies');
  check(canonical(root?.projection) === canonical(projection), 'root-projection-copy');

  check(ruleProgram?.id === expectedRuleProgramId && ruleProgram?.sourceRuleId === DETHRONE.ruleId
    && ruleProgram?.sourceProfile === profile && ruleProgram?.mode === 'typed'
    && ruleProgram?.executionModel === 'validate-commit-consequences'
    && ruleProgram?.rollPolicy === 'player-input-required'
    && ruleProgram?.localizedTextExecutable === false
    && ruleProgram?.artifact === DETHRONE.ruleArtifact, 'rule-program');

  return {ok: failures.length === 0, failures};
}

test('active v10 pointer, manifest and exact Dethrone source artifacts retain their frozen SHA-256 identities', () => {
  assert.equal(current.catalogVersion, EXPECTED.version);
  assert.equal(current.manifestSha256, EXPECTED.manifestSha256);
  assert.equal(manifest.catalogVersion, EXPECTED.version);
  assert.equal(manifest.immutable, true);
  assert.equal(sha256(fs.readFileSync(path.join(repo, 'data', 'bg3', 'current.json'))),
    EXPECTED.currentSha256);
  assert.equal(sha256(fs.readFileSync(manifestPath)), EXPECTED.manifestSha256);

  for (const [artifact, expectedSha256] of Object.entries(ARTIFACT_SHA256)) {
    const descriptor = descriptorForArtifact(artifact);
    assert.equal(descriptor.sha256, expectedSha256, `${artifact}: frozen manifest SHA-256`);
    const absolute = path.resolve(repo, ...descriptor.path.split('/'));
    assert.equal(sha256(fs.readFileSync(absolute)), expectedSha256, `${artifact}: frozen file SHA-256`);
  }

  const statsSource = readArtifact(DETHRONE.statsArtifact);
  const statsNodes = (statsSource.nodes || []).filter(node => node.statsId === DETHRONE.statsId);
  assert.equal(statsNodes.length, 1);
  assert.equal(statsNodes[0].directProperties?.RootTemplate, DETHRONE.rootTemplateUuid);
  assert.deepEqual(statsNodes[0].itemVariantIds, [DETHRONE.itemId]);

  const rootSource = readArtifact(DETHRONE.rootTemplateArtifact);
  const rootNodes = (rootSource.nodes || []).filter(node => node.uuid === DETHRONE.rootTemplateUuid);
  assert.equal(rootNodes.length, 1);
  assert.equal(rootNodes[0].directAttributes?.Stats, DETHRONE.statsId);
  assert.deepEqual(rootNodes[0].itemVariantIds, [DETHRONE.itemId]);
});

test('manifest-derived Dethrone census is exactly two profile rows and matches the frozen 997-byte aggregate', () => {
  assert.equal(exactLinkSets.length, EXPECTED.carrierRows,
    'active item-rule links expose exactly one standard and one honour Dethrone carrier');
  assert.deepEqual(exactLinkSets.map(linkSet => [linkSet.profile, linkSet.itemId]).sort(), [
    ['honour', DETHRONE.itemId],
    ['standard', DETHRONE.itemId],
  ]);
  assert.equal(carrierRows.length, EXPECTED.carrierRows);
  assert.equal(new Set(carrierRows.map(row => row.item.id)).size, EXPECTED.carrierItems);
  assert.deepEqual(carrierRows.map(row => [row.profile, row.use.id]).sort(), [
    ['honour', DETHRONE.useIds.honour],
    ['standard', DETHRONE.useIds.standard],
  ]);

  const lines = carrierRows.map(carrierCensusLine).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const aggregate = lines.join('\n');
  assert.equal(Buffer.byteLength(aggregate, 'utf8'), EXPECTED.aggregateBytes);
  assert.equal(sha256(aggregate), EXPECTED.aggregateSha256,
    `Dethrone aggregate mismatch; first row=${lines[0] || '<none>'}`);
});

test('both Dethrone rows bind the exact item, A12 CanUseSpellScroll root and profile rule with frozen canonical hashes', () => {
  const mismatches = [];
  for (const row of carrierRows) {
    const checked = checkCarrier(row);
    if (!checked.ok) mismatches.push(`${row.profile}: ${checked.failures[0]}`);
    const expected = DETHRONE.canonicalSha256[row.profile];
    assert.equal(sha256(canonical(row.use)), expected.use, `${row.profile}: use canonical SHA-256`);
    assert.equal(sha256(canonical(row.use.program)), expected.useProgram,
      `${row.profile}: use program canonical SHA-256`);
    assert.equal(sha256(canonical(row.root)), expected.rootProgram,
      `${row.profile}: root program canonical SHA-256`);
    assert.equal(sha256(canonical(row.ruleProgram)), expected.ruleProgram,
      `${row.profile}: rule program canonical SHA-256`);
    assert.equal(sha256(canonical(row.use.program.projection)), expected.projection,
      `${row.profile}: projection canonical SHA-256`);
  }
  assert.deepEqual(mismatches, [], `first Dethrone carrier mismatch: ${mismatches[0] || '<none>'}`);
});

test('Dethrone is one creature at range 30 with a player-entered Constitution DC 18 save', () => {
  assert.equal(rule.bg3Id, DETHRONE.spellId);
  assert.equal(rule.kind, 'spell');
  assert.deepEqual(rule.profiles, PROFILES);
  assert.equal(rule.properties?.Level, '5');
  assert.equal(rule.properties?.TargetRadius, '30');
  assert.equal(rule.properties?.ProjectileCount, '1');
  assert.equal(rule.properties?.AmountOfTargets, '');
  assert.equal(rule.properties?.TargetConditions, 'Character()');

  for (const row of carrierRows) {
    const target = fieldOf(row.ruleProgram, 'TargetConditions');
    assert.equal(target?.raw, 'Character()', `${row.profile}: exact creature target source`);
    assert.deepEqual(target?.bytecode, [{
      op: 'guard', executable: true,
      condition: {kind: 'predicate', name: 'Character', args: []},
      phase: 'validation',
    }], `${row.profile}: exact creature target bytecode`);

    const resolution = fieldOf(row.ruleProgram, 'SpellRoll');
    assert.equal(resolution?.raw, 'not SavingThrow(Ability.Constitution, 18)');
    const requests = opcodeOf(row.ruleProgram, 'SpellRoll', 'requestResolution');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      op: 'requestResolution', executable: true,
      condition: {
        kind: 'not',
        operand: {
          kind: 'predicate', name: 'SavingThrow',
          args: [{kind: 'symbol', value: 'Ability.Constitution'}, {kind: 'integer', value: 18}],
          rollPolicy: 'player-input-required',
        },
      },
      phase: 'validation', rollPolicy: 'player-input-required',
    }, `${row.profile}: exact Constitution DC 18 player input`);
  }
});

test('one shared 10d6 input yields D+20 on a failed save and floor((D+20)/2) on success, Necrotic and Magical', () => {
  for (const row of carrierRows) {
    const success = fieldOf(row.ruleProgram, 'SpellSuccess');
    const failure = fieldOf(row.ruleProgram, 'SpellFail');
    assert.equal(success?.raw, 'DealDamage(10d6+20,Necrotic,Magical)');
    assert.equal(failure?.raw, 'DealDamage((10d6+20)/2,Necrotic,Magical)');
    const full = opcodeOf(row.ruleProgram, 'SpellSuccess', 'dealDamage');
    const half = opcodeOf(row.ruleProgram, 'SpellFail', 'dealDamage');
    assert.equal(full.length, 1);
    assert.equal(half.length, 1);

    const exactDice = {
      kind: 'dice', count: 10, sides: 6, modifier: 20,
      rollPolicy: 'player-input-required',
    };
    assert.deepEqual(full[0].amount, exactDice);
    assert.deepEqual(half[0].amount, {
      kind: 'arithmetic', operator: '/', left: exactDice,
      right: {kind: 'integer', value: 2},
    });
    for (const opcode of [full[0], half[0]]) {
      assert.deepEqual(opcode.damageType, {kind: 'symbol', value: 'Necrotic'});
      assert.deepEqual(opcode.flags, [{kind: 'symbol', value: 'Magical'}]);
      assert.equal(opcode.rollPolicy, 'player-input-required');
    }

    const diceOccurrences = collectKind([full[0].amount, half[0].amount], 'dice');
    assert.equal(diceOccurrences.length, 2, `${row.profile}: the same branch-exclusive formula occurs twice`);
    assert.equal(new Set(diceOccurrences.map(canonical)).size, 1,
      `${row.profile}: both branches bind one shared 10d6 input specification`);
    assert.deepEqual(diceOccurrences[0], exactDice);

    const damage = (entered10d6, saveSucceeded) => {
      assert.ok(Number.isInteger(entered10d6) && entered10d6 >= 10 && entered10d6 <= 60);
      return saveSucceeded ? Math.floor((entered10d6 + 20) / 2) : entered10d6 + 20;
    };
    assert.deepEqual([damage(10, false), damage(11, true), damage(60, false), damage(60, true)],
      [30, 15, 80, 40]);
  }
});

test('effective item payment is one action plus one scroll, with child slot costs delegated and no transitive or lifecycle work', () => {
  for (const row of carrierRows) {
    const useCosts = fieldOf(row.ruleProgram, 'UseCosts');
    assert.equal(useCosts?.raw, 'ActionPoint:1;SpellSlotsGroup:1:1:5',
      'the inherited spell source remains visible for audit');
    assert.deepEqual((useCosts?.bytecode || []).map(opcode => opcode.resource),
      ['ActionPoint', 'SpellSlotsGroup']);

    assert.deepEqual(row.root.commit, [{
      op: 'commitFromItemAction', executable: true,
      binding: {consume: {kind: 'item', amount: 1}, cost: 'action'},
      mutation: 'delegated-to-item-action-contract', phase: 'commit',
    }]);
    assert.equal(row.use.program.invokedRuleResourceCostPolicy, 'caller-item-action');
    assert.equal(row.root.consequences[0].resourceCostPolicy, 'caller-item-action');
    assert.equal(row.use.program.projection.transitive.length, 0);
    assert.equal(row.use.program.projection.bg3LifecycleBindings.length, 0);
    assert.equal(row.use.program.projection.bg3StatusPassiveBindings.length, 0);

    const effectivePayment = [row.use.cost,
      `${row.use.consume.kind}:${row.use.consume.amount}`];
    assert.deepEqual(effectivePayment, ['action', 'item:1']);
    assert.equal(effectivePayment.some(resource => /slot/i.test(resource)), false,
      `${row.profile}: the item caller never charges a spell slot`);
  }
});

function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function selectedBg3FileFetch() {
  return async url => {
    const relative = String(url || '').replaceAll('\\', '/').replace(/^\.\//, '');
    if (!relative.startsWith('data/bg3/') || relative.includes('..')) {
      return {ok: false, status: 404, text: async () => '', json: async () => ({})};
    }
    try {
      const raw = fs.readFileSync(path.join(repo, ...relative.split('/')), 'utf8');
      return {ok: true, status: 200, text: async () => raw, json: async () => JSON.parse(raw)};
    } catch (_error) {
      return {ok: false, status: 404, text: async () => '', json: async () => ({})};
    }
  };
}

function loadDethroneRuntimeEngine(random) {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  source = source.replace('const BG3_ARCHIVE_HONOUR_AUDIT=false;', 'const BG3_ARCHIVE_HONOUR_AUDIT=true;');
  const dispatchNeedle = '  summonUseItemApplyWrapper=function(entryId,casterId,target,rolls,useId,opts){';
  assert.equal(source.includes(dispatchNeedle), true, 'production Dethrone dispatch capture seam');
  source = source.replace(dispatchNeedle, dispatchNeedle
    + "const capture=globalThis.__bg3DethroneDispatchCapture;if(capture&&capture.next){capture.next=false;capture.args=opts===undefined?[entryId,casterId,target,rolls,useId]:[entryId,casterId,target,rolls,useId,opts];if(capture.block)return false;}");
  source += `
    globalThis.__bg3DethroneDispatchCapture={next:false,block:false,args:null};
    globalThis.__bg3DethroneRuntime = {
      setState(s) {
        chars=s.chars||[]; journal=[]; itemsDB=s.items||[]; spellsDB=[]; abilitiesDB=[];
        racesDB=[]; classesDB=[]; rulesDB=[]; foesDB=s.foes||[]; activeCharId=s.activeCharId||null; fxRound=1;
        harvestedSources={}; bg3SceneState=bg3SceneNormalizeState(null); bg3StoryState=bg3StoryNormalizeState(null);
        bg3TadpoleState=bg3TadpoleNormalizeState(null); bg3TreasureState=bg3TreasureNormalizeState(null);
        bg3Catalog.items=new Map(itemsDB.filter(item=>bg3CatalogIsId(item&&item.id)).map(item=>[item.id,item]));
        combat=normalizeCombatState(null); lastCastEvent=null; castCtx=null; rollSpec=null; rollQueue=[];
        rollCompleting=false; bg3RollPromptScope=null; bg3RuleProgramClear(); bg3LifecycleReset();
        bg3GithbornMindcrusherTrustCharacters(chars); bg3InterruptReset(); bg3InventoryStatusTransitionReset();
        bg3SceneCatalogReset(); fxInvalidate();
      },
      state() { return {chars,itemsDB,foesDB,combat,journal}; },
      seedItemsDB, seedFoesDB, upgradeFoe, bg3WizardProfileBinding,
      bg3CatalogUseRefs, bg3CatalogEnsureIndex, bg3CatalogHydrate,
      catalogItem(id) { return bg3Catalog.items.get(id)||null; },
      bg3LearnSpellTestCatalogRebind(id,item) { if(item===undefined)bg3Catalog.items.delete(id);else bg3Catalog.items.set(id,item);return bg3Catalog.items.get(id)||null; },
      itemUseOf, bg3RuleProgramPrepare,
      combatStart, combatUseItem, combatSpellTurnAllowed,
      bg3ItemProgramOpen, useItemApply, castConfirm, castFormulaConfirm, closeCastModal,
      castState() { return {ctx:castCtx,spec:castCtx&&castCtx.spec}; },
      bg3ItemDethroneAudit, bg3ItemDethroneTestInjectLateFailureOnce, bg3ItemDethroneTestInjectPresentationFailureOnce,
      bg3ItemDethroneTestLifecycleRuntimeSnapshot(holder) { return {pending:bg3LifecycleRuntime.pending.get(holder)||null}; },
      bg3ItemDethroneTestLifecycleStateSet(holder,state) { const byChar=bg3LifecycleRuntime.byChar,had=byChar.has(holder),previous=byChar.get(holder);if(state==null)byChar.delete(holder);else byChar.set(holder,state);return ()=>{if(had)byChar.set(holder,previous);else byChar.delete(holder);}; },
      bg3ItemDethroneTestInterruptStateSet(kind='prepared') { if(kind==='prepared'){const prepared=bg3InterruptRuntime.prepared,key='dethrone-certificate-prepared',had=prepared.has(key),previous=prepared.get(key);prepared.set(key,{id:key});return ()=>{if(had)prepared.set(key,previous);else prepared.delete(key);};}const tokens=bg3InterruptRuntime.sourceTokens,key='dethrone-certificate-composite',had=tokens.has(key);tokens.add(key);return ()=>{if(!had)tokens.delete(key);}; },
      bg3ItemFormulaCaptureNextDispatch(block=false) { const capture=globalThis.__bg3DethroneDispatchCapture;capture.next=true;capture.block=block===true;capture.args=null;return true; },
      bg3ItemFormulaLastDispatch() { const args=globalThis.__bg3DethroneDispatchCapture.args;return args&&args.slice(); },
      bg3ItemFormulaApplyArgs(args) { return useItemApply(...args); },
      bg3ItemFormulaSetValues(values) { for(const [key,value] of Object.entries(values||{}))document.getElementById('cf_'+key).value=value==null?'':String(value);return true; },
      setElementValue(id,value) { document.getElementById(id).value=value; },
      elementText(id) { return document.getElementById(id).textContent; }
    };
  `;

  const elements = new Map();
  const stored = new Map();
  let promptResults = [];
  let promptCalls = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '', disabled: false,
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; }, focus() {}, click() {},
      appendChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
    });
    return elements.get(id);
  };
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {random}),
    Date,
    JSON,
    crypto: crypto.webcrypto,
    TextEncoder,
    Blob,
    URL,
    structuredClone,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => true,
    prompt: () => {
      promptCalls++;
      return promptResults.length ? String(promptResults.shift()) : '1';
    },
    alert() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    fetch: selectedBg3FileFetch(),
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
      addEventListener() {},
      removeEventListener() {},
    },
    localStorage: {
      getItem: key => stored.has(key) ? stored.get(key) : null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: key => stored.delete(key),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const runtime = context.__bg3DethroneRuntime;
  runtime.setPromptResults = values => { promptResults = [...values]; };
  runtime.promptCount = () => promptCalls;
  return runtime;
}

function hero(id, overrides = {}) {
  return {
    id, name: id, cls: 'Жрец', level: 5,
    ab: {str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10},
    saves: {str: false, dex: false, con: false, int: false, wis: true, cha: false},
    skills: {}, hp: 10, hpMax: 10, hpTemp: 0, inventory: [], equipment: {}, abilities: [],
    activeFx: [], fxOff: [], cond: [], deaths: {s: 0, f: 0}, slots: {}, spentRest: 0,
    exhaustion: 0, hdUsed: 0, ...overrides,
  };
}

const DETHRONE_LEARN_USE_IDS = Object.freeze({
  standard: 'bg3-use-53b17d3c541901fa7d9e',
  honour: 'bg3-use-620e6c7bc5182853e31e',
});
const ARTISTRY_SCROLL = Object.freeze({
  itemId: 'bg3:item:rt:21e67b0e-913d-411a-9046-6c54e8d0bf53:stats:VU5JX0xPV19DdXJyaWN1bHVtT2ZTdHJhdGVneVNjcm9sbA',
  useId: 'bg3-use-eeb16db2ecd74f6f3ed8',
});
const COUNTERSPELL_SCROLL = 'bg3:item:rt:17f828a4-5684-42dd-9f08-ff99ba43358a:stats:T0JKX1Njcm9sbF9Db3VudGVyc3BlbGw';

async function dethroneWorld({
  profile = 'standard', level = 9, intelligence = 10, targetHp = 100, qty = 2,
  extraActors = [],
} = {}) {
  let randomCalls = 0;
  const randomStacks = [];
  const engine = loadDethroneRuntimeEngine(() => {
    randomCalls++;
    randomStacks.push(new Error('unexpected Dethrone Math.random').stack);
    return 0.5;
  });
  const items = plain(engine.seedItemsDB());
  const entry = {id: 'certificate-dethrone-entry', itemId: DETHRONE.itemId, qty};
  const caster = hero('certificate-dethrone-wizard', {
    level, inventory: [entry], equipment: {}, abilities: [], slots: {5: {cur: 1, max: 1}},
    activeEffectsSchemaVersion: 1,
  });
  const target = hero('certificate-dethrone-target', {
    hp: targetHp, hpMax: targetHp, inventory: [], equipment: {}, abilities: [],
    activeEffectsSchemaVersion: 1,
  });
  const binding = plain(engine.bg3WizardProfileBinding(''));
  binding.classLevel = level;
  caster.bg3ClassDescription = binding;
  caster.ab.int = intelligence;
  target.ab.con = 10;
  const foe = plain(engine.seedFoesDB()[0]);
  foe.id = 'certificate-dethrone-foe';
  foe.n = 'Dethrone canonical foe';
  foe.hp = 100;
  foe.hpMax = 100;
  foe.hpTemp = 0;
  foe.activeFx = [];
  foe.cond = [];
  foe.resist = [];
  foe.vuln = [];
  foe.immune = [];
  foe.damageRules = [];
  delete foe.mechanics;
  engine.setState({chars: [caster, target, ...extraActors], items, foes: [foe], activeCharId: caster.id});
  assert.equal(engine.bg3CatalogUseRefs([{id: 'bg3', version: current.catalogVersion, profile,
    manifestSha256: current.manifestSha256}]), true);
  await dethroneQuiesce({engine});
  randomCalls = 0;
  randomStacks.length = 0;
  return {engine, caster, target, foe, entry, profile, useId: DETHRONE.useIds[profile],
    randomCalls: () => randomCalls, randomStacks,
    resetRandom: () => { randomCalls = 0; randomStacks.length = 0; }};
}

async function dethroneQuiesce(world) {
  const holders = [...world.engine.state().chars, ...world.engine.state().foesDB];
  for (const holder of holders) {
    const pending = world.engine.bg3ItemDethroneTestLifecycleRuntimeSnapshot(holder).pending;
    if (pending) await pending;
  }
  await Promise.resolve();
  for (const holder of holders) assert.equal(
    world.engine.bg3ItemDethroneTestLifecycleRuntimeSnapshot(holder).pending, null,
    'Dethrone runtime must be lifecycle-quiescent');
}

async function dethronePrepare(world) {
  const {engine, useId} = world;
  await engine.bg3CatalogEnsureIndex();
  await engine.bg3CatalogHydrate([DETHRONE.itemId]);
  const item = engine.catalogItem(DETHRONE.itemId);
  const use = engine.itemUseOf(item, useId);
  assert.ok(item && use, 'exact catalog Dethrone action');
  const plan = await engine.bg3RuleProgramPrepare(use);
  assert.ok(plan?.ok, JSON.stringify(plan));
  return {item, use, plan};
}

async function dethroneStartCombat(world, title = 'Dethrone certificate') {
  const {engine, caster, foe} = world;
  assert.equal(engine.combatStart([
    {kind: 'ally', id: caster.id, nat: 20},
    {kind: 'foe', id: foe.id, nat: 1},
  ], title), true);
  await dethroneQuiesce(world);
  const turn = engine.state().combat.turn;
  assert.equal(turn.actorKey, `ally:${caster.id}`);
  assert.equal(turn.actionsUsed, 0);
  assert.equal(turn.actionUsed, false);
  assert.equal(turn.bonusUsed, false);
  world.resetRandom();
  return turn;
}

function dethroneIssue(world, {distance = '30', save = 1, dice = 40, targetKey = ''} = {}) {
  const {engine, caster, target, entry, useId} = world;
  assert.equal(engine.combatUseItem(entry.id, useId), true,
    JSON.stringify({audit: engine.bg3ItemDethroneAudit(), error: engine.elementText('castErr')}));
  engine.setElementValue('castTarget', targetKey || `ally:${target.id}`);
  engine.setElementValue('castDethroneDistance', distance);
  assert.equal(engine.castConfirm(), true,
    JSON.stringify({audit: engine.bg3ItemDethroneAudit(), error: engine.elementText('castErr')}));
  engine.bg3ItemFormulaSetValues({dethroneSave: save, dethroneDice: dice});
  engine.bg3ItemFormulaCaptureNextDispatch(true);
  assert.equal(engine.castFormulaConfirm(), false,
    JSON.stringify({audit: engine.bg3ItemDethroneAudit(), error: engine.elementText('castErr')}));
  const args = engine.bg3ItemFormulaLastDispatch();
  assert.ok(args);
  assert.equal(args.length, 5);
  return {args, audit: engine.bg3ItemDethroneAudit(), turn: engine.state().combat.turn};
}

test('private Dethrone runtime: level-nine Wizard commits one full 60-point failed-save hit from entered dice', async () => {
  const world = await dethroneWorld();
  const {engine, caster, target, entry, randomCalls, randomStacks} = world;
  await dethronePrepare(world);
  const turn = await dethroneStartCombat(world, 'Dethrone level-nine full damage');
  const inventoryRef = caster.inventory;
  const entryRef = entry;
  const turnRef = turn;
  const slotsRef = caster.slots;
  const slotsBefore = plain(caster.slots);
  const {args, audit} = dethroneIssue(world, {save: 1, dice: 40});
  assert.equal(engine.promptCount(), 0, 'level nine skips the scroll ability check');
  assert.equal(audit.phase, 'proof-issued');
  assert.equal(audit.scrollCheckRequired, false);
  assert.equal(audit.saveNatural, 1);
  assert.equal(audit.saveSucceeded, false);
  assert.equal(audit.entered10d6, 40);
  assert.equal(audit.branch, 'failed-save-full');
  assert.equal(audit.damage, 60);
  assert.equal(audit.damageType, 'Necrotic');
  assert.equal(audit.magical, true);
  assert.equal(audit.resourceTransactions, 0);
  assert.equal(entry.qty, 2);
  assert.equal(target.hp, 100);
  assert.equal(turn.actionsUsed, 0);
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);
  const used = engine.bg3ItemDethroneAudit();
  assert.equal(used.phase, 'used');
  assert.equal(used.oldHp, 100);
  assert.equal(used.newHp, 40);
  assert.equal(used.resourceTransactions, 1);
  assert.equal(caster.inventory, inventoryRef);
  assert.equal(entry, entryRef);
  assert.equal(turn, turnRef);
  assert.equal(caster.slots, slotsRef);
  assert.deepEqual(plain(caster.slots), slotsBefore, 'the scroll charges no spell slot');
  assert.equal(entry.qty, 1);
  assert.equal(target.hp, 40);
  assert.equal(turn.actionsUsed, 1);
  assert.equal(turn.actionUsed, true);
  assert.equal(turn.bonusUsed, false);
  assert.deepEqual(plain(turn.spellCasts), [{id: DETHRONE.spellId, level: 5, cost: 'action'}]);
  assert.equal(engine.combatSpellTurnAllowed({id: 'certificate-later-bonus', l: 1}, 'bonus',
    `ally:${caster.id}`, true), false, 'a later bonus spell sees the successful level-five action cast');
  assert.equal(randomCalls(), 0, 'full-damage commit never rolls\n' + randomStacks.join('\n---\n'));
});

test('private Dethrone runtime: under-level honour Wizard passes entered Intelligence DC 15 and commits exact half 25', async () => {
  const world = await dethroneWorld({profile: 'honour', level: 7, intelligence: 10});
  const {engine, caster, target, entry, randomCalls, randomStacks} = world;
  target.level = 5;
  target.saves.con = true;
  await dethronePrepare(world);
  const turn = await dethroneStartCombat(world, 'Dethrone under-level half damage');
  const slotsBefore = plain(caster.slots);
  engine.setPromptResults(['15']);
  const {args, audit} = dethroneIssue(world, {distance: '12.5', save: 15, dice: 31});
  assert.equal(engine.promptCount(), 1);
  assert.equal(audit.scrollCheckRequired, true);
  assert.equal(audit.scrollNatural, 15);
  assert.equal(audit.scrollTotal, 15);
  assert.equal(audit.scrollOk, true);
  assert.equal(audit.saveNatural, 15);
  assert.equal(audit.saveTotal, 18, 'level-five Constitution proficiency contributes +3');
  assert.equal(audit.saveSucceeded, true);
  assert.equal(audit.entered10d6, 31);
  assert.equal(audit.branch, 'successful-save-half');
  assert.equal(audit.damage, 25, 'floor((31 + 20) / 2)');
  assert.equal(audit.damageType, 'Necrotic');
  assert.equal(audit.magical, true);
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 1);
  assert.equal(entry.qty, 1);
  assert.equal(target.hp, 75);
  assert.equal(turn.actionsUsed, 1);
  assert.equal(turn.actionUsed, true);
  assert.deepEqual(plain(caster.slots), slotsBefore);
  assert.equal(randomCalls(), 0, 'under-level success never rolls\n' + randomStacks.join('\n---\n'));
});

test('private Dethrone runtime: failed entered Intelligence check commits only one action and scroll', async () => {
  const world = await dethroneWorld({level: 7, intelligence: 10});
  const {engine, caster, target, entry, randomCalls, randomStacks} = world;
  await dethronePrepare(world);
  target.hpTemp = 5;
  target.resist = ['Necrotic'];
  target.activeFx = [{uid: 'certificate-unrelated-concentration', conc: true}];
  target.splitReaction = {kind: 'ooze-split'};
  const turn = await dethroneStartCombat(world, 'Dethrone failed scroll check');
  const targetBefore = plain(target);
  const slotsBefore = plain(caster.slots);
  const ledger = turn.spellCasts;
  engine.setPromptResults(['14']);
  engine.bg3ItemFormulaCaptureNextDispatch(true);
  assert.equal(engine.combatUseItem(entry.id, world.useId), false);
  const args = engine.bg3ItemFormulaLastDispatch();
  const audit = engine.bg3ItemDethroneAudit();
  assert.ok(args);
  assert.equal(args[2], '');
  assert.equal(engine.castState().ctx, null);
  assert.equal(audit.phase, 'proof-issued');
  assert.equal(audit.resourceOnly, true);
  assert.equal(audit.branch, 'resource-only');
  assert.equal(audit.scrollNatural, 14);
  assert.equal(audit.scrollTotal, 14);
  assert.equal(audit.scrollOk, false);
  assert.equal(audit.target, '');
  assert.equal(audit.saveNatural, null);
  assert.equal(audit.entered10d6, null);
  assert.equal(audit.damage, null);
  assert.equal(audit.resourceTransactions, 0);
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 1);
  assert.equal(entry.qty, 1);
  assert.equal(turn.actionsUsed, 1);
  assert.equal(turn.actionUsed, true);
  assert.equal(turn.spellCasts, ledger);
  assert.deepEqual(plain(ledger), [], 'a failed scroll check is not a successful spell cast');
  assert.deepEqual(plain(target), targetBefore, 'resource-only payment never touches target hazards');
  assert.deepEqual(plain(caster.slots), slotsBefore);
  assert.equal(engine.combatSpellTurnAllowed({id: 'certificate-later-bonus', l: 1}, 'bonus',
    `ally:${caster.id}`, true), true, 'a later bonus spell remains legal after failed scroll use');
  const committed = plain({caster, target, combat: engine.state().combat});
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false);
  assert.equal(engine.bg3ItemDethroneAudit().phase, 'replay-rejected');
  assert.deepEqual(plain({caster, target, combat: engine.state().combat}), committed);
  assert.equal(randomCalls(), 0, 'resource-only commit never rolls\n' + randomStacks.join('\n---\n'));
});

test('private Dethrone runtime: canonical foe, structured save and spell-turn receipts remain exact', async () => {
  const world = await dethroneWorld();
  const {engine, caster, target, foe, entry, randomCalls, randomStacks} = world;
  await dethronePrepare(world);
  const turn = await dethroneStartCombat(world, 'Dethrone canonical foe target');
  assert.equal(Object.prototype.hasOwnProperty.call(foe, 'ab'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(foe, 'inventory'), false);
  const {args, audit} = dethroneIssue(world, {
    targetKey: `foe:${foe.id}`, distance: '30', save: 1, dice: 40,
  });
  const saveRow = engine.castState().spec.rows.find(row => row.type === 'save');
  assert.ok(saveRow);
  assert.equal(saveRow.mod, 0);
  assert.equal(audit.target, `foe:${foe.id}`);
  assert.equal(audit.saveNatural, 1);
  assert.equal(audit.saveTotal, 1);
  assert.equal(audit.damage, 60);
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);
  assert.equal(engine.bg3ItemDethroneAudit().target, `foe:${foe.id}`);
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 1);
  assert.equal(foe.hp, 40);
  assert.equal(target.hp, 100);
  assert.equal(entry.qty, 1);
  assert.equal(turn.actionsUsed, 1);
  assert.deepEqual(plain(turn.spellCasts), [{id: DETHRONE.spellId, level: 5, cost: 'action'}]);
  assert.equal(engine.combatSpellTurnAllowed({id: 'certificate-later-bonus', l: 1}, 'bonus',
    `ally:${caster.id}`, true), false);
  assert.equal(randomCalls(), 0, 'canonical-foe commit never rolls\n' + randomStacks.join('\n---\n'));
});

test('private Dethrone runtime: zero-HP, spell-turn, active-effect, lifecycle and observer hazards fail prepay', async () => {
  const dead = await dethroneWorld();
  await dethronePrepare(dead);
  const deadTurn = await dethroneStartCombat(dead, 'Dethrone zero-HP gate');
  dead.caster.hp = 0;
  const deadBefore = plain({caster: dead.caster, target: dead.target, combat: dead.engine.state().combat});
  assert.equal(dead.engine.combatUseItem(dead.entry.id, dead.useId), false);
  assert.deepEqual(plain({caster: dead.caster, target: dead.target, combat: dead.engine.state().combat}), deadBefore);
  assert.equal(dead.entry.qty, 2);
  assert.equal(deadTurn.actionsUsed, 0);
  dead.caster.hp = dead.caster.hpMax;
  assert.equal(dead.engine.combatUseItem(dead.entry.id, dead.useId), true);
  dead.engine.closeCastModal();

  const prior = await dethroneWorld({level: 7});
  await dethronePrepare(prior);
  const priorTurn = await dethroneStartCombat(prior, 'Dethrone prior bonus spell gate');
  priorTurn.spellCasts.push({id: 'certificate-prior-bonus', level: 1, cost: 'bonus'});
  priorTurn.bonusSpellUsed = true;
  prior.engine.setPromptResults(['20']);
  const promptsBefore = prior.engine.promptCount();
  const priorBefore = plain({caster: prior.caster, target: prior.target, combat: prior.engine.state().combat});
  assert.equal(prior.engine.combatUseItem(prior.entry.id, prior.useId), false);
  assert.equal(prior.engine.promptCount(), promptsBefore, 'turn legality rejects before the scroll prompt');
  assert.deepEqual(plain({caster: prior.caster, target: prior.target, combat: prior.engine.state().combat}), priorBefore);

  const active = await dethroneWorld();
  await dethronePrepare(active);
  await dethroneStartCombat(active, 'Dethrone active effect hazard');
  active.target.activeFx = [{uid: 'certificate-concentration', conc: true}];
  const activeBefore = plain({caster: active.caster, target: active.target, combat: active.engine.state().combat});
  assert.equal(active.engine.combatUseItem(active.entry.id, active.useId), true);
  active.engine.setElementValue('castTarget', `ally:${active.target.id}`);
  active.engine.setElementValue('castDethroneDistance', '30');
  assert.equal(active.engine.castConfirm(), false);
  assert.match(active.engine.elementText('castErr'), /activeFx|observer-hazard/);
  assert.deepEqual(plain({caster: active.caster, target: active.target, combat: active.engine.state().combat}), activeBefore);
  active.engine.closeCastModal();

  const split = await dethroneWorld();
  await dethronePrepare(split);
  await dethroneStartCombat(split, 'Dethrone split-reaction hazard');
  split.target.splitReaction = {kind: 'ooze-split'};
  const splitBefore = plain({caster: split.caster, target: split.target, combat: split.engine.state().combat});
  assert.equal(split.engine.combatUseItem(split.entry.id, split.useId), true);
  split.engine.setElementValue('castTarget', `ally:${split.target.id}`);
  split.engine.setElementValue('castDethroneDistance', '30');
  assert.equal(split.engine.castConfirm(), false);
  assert.equal(split.engine.elementText('castErr'), '✕ Действие предмета сейчас недоступно.');
  assert.equal(split.engine.bg3ItemDethroneAudit().phase, 'rejected');
  assert.equal(split.engine.bg3ItemDethroneAudit().reason,
    'private-item-dethrone-split-reaction-hazard-fail-closed');
  assert.deepEqual(plain({caster: split.caster, target: split.target,
    combat: split.engine.state().combat}), splitBefore);
  split.engine.closeCastModal();

  const bonus = await dethroneWorld();
  await dethronePrepare(bonus);
  bonus.caster.activeFx = [{uid: 'certificate-bonus-die', stat: 'check.int', mode: 'die', value: '1d4'}];
  const bonusBefore = plain({caster: bonus.caster, target: bonus.target, combat: bonus.engine.state().combat});
  assert.equal(await bonus.engine.bg3ItemProgramOpen(bonus.entry.id, bonus.caster.id, bonus.useId), false);
  assert.deepEqual(plain({caster: bonus.caster, target: bonus.target,
    combat: bonus.engine.state().combat}), bonusBefore);

  const lifecycle = await dethroneWorld();
  await dethronePrepare(lifecycle);
  const hazardousState = {ok: true, sources: [{k: 'certificate-lifecycle-source'}], events: [],
    holderEvents: [], granted: [], virtuals: [], rows: []};
  const restoreLifecycle = lifecycle.engine.bg3ItemDethroneTestLifecycleStateSet(lifecycle.target, hazardousState);
  const lifecycleBefore = plain({caster: lifecycle.caster, target: lifecycle.target, combat: lifecycle.engine.state().combat});
  try {
    assert.equal(await lifecycle.engine.bg3ItemProgramOpen(lifecycle.entry.id, lifecycle.caster.id,
      lifecycle.useId), false);
    assert.equal(lifecycle.engine.elementText('castErr'), '✕ Действие предмета сейчас недоступно.');
    assert.equal(lifecycle.engine.bg3ItemDethroneAudit().phase, 'rejected');
    assert.equal(lifecycle.engine.bg3ItemDethroneAudit().reason,
      'private-item-dethrone-lifecycle-runtime-state-present');
    assert.deepEqual(plain({caster: lifecycle.caster, target: lifecycle.target,
      combat: lifecycle.engine.state().combat}), lifecycleBefore);
  } finally {
    restoreLifecycle();
  }

  const interruptedWorlds = [];
  for (const kind of ['prepared', 'composite']) {
    const interrupted = await dethroneWorld();
    interruptedWorlds.push(interrupted);
    await dethronePrepare(interrupted);
    const restoreInterrupt = interrupted.engine.bg3ItemDethroneTestInterruptStateSet(kind);
    const interruptBefore = plain({caster: interrupted.caster, target: interrupted.target,
      combat: interrupted.engine.state().combat});
    try {
      assert.equal(await interrupted.engine.bg3ItemProgramOpen(interrupted.entry.id,
        interrupted.caster.id, interrupted.useId), false, kind);
      assert.equal(interrupted.engine.elementText('castErr'), '✕ Действие предмета сейчас недоступно.', kind);
      assert.equal(interrupted.engine.bg3ItemDethroneAudit().phase, 'rejected', kind);
      assert.equal(interrupted.engine.bg3ItemDethroneAudit().reason,
        'private-item-dethrone-interrupt-composite-state-present', kind);
      assert.deepEqual(plain({caster: interrupted.caster, target: interrupted.target,
        combat: interrupted.engine.state().combat}), interruptBefore, kind);
    } finally {
      restoreInterrupt();
    }
  }

  const counter = hero('certificate-counterspell-observer', {
    inventory: [{id: 'certificate-counterspell-entry', itemId: COUNTERSPELL_SCROLL, qty: 1}],
    activeEffectsSchemaVersion: 1,
  });
  const observed = await dethroneWorld({extraActors: [counter]});
  await dethronePrepare(observed);
  await observed.engine.bg3CatalogHydrate([COUNTERSPELL_SCROLL]);
  const observedTurn = await dethroneStartCombat(observed, 'Dethrone Counterspell observer');
  const restoreCounterLifecycle = observed.engine.bg3ItemDethroneTestLifecycleStateSet(counter, null);
  const observedBefore = plain({caster: observed.caster, target: observed.target,
    combat: observed.engine.state().combat});
  try {
    assert.equal(observed.engine.combatUseItem(observed.entry.id, observed.useId), false);
    assert.match(observed.engine.elementText('castErr'), /observer-interrupt-fail-closed/);
    assert.deepEqual(plain({caster: observed.caster, target: observed.target,
      combat: observed.engine.state().combat}), observedBefore);
    assert.equal(observedTurn.actionsUsed, 0);
  } finally {
    restoreCounterLifecycle();
  }
  for (const world of [dead, prior, active, split, bonus, lifecycle, ...interruptedWorlds, observed]) {
    assert.equal(world.entry.qty, 2);
    assert.equal(world.randomCalls(), 0, world.randomStacks.join('\n---\n'));
  }
});

test('private Dethrone runtime: distance, raw, known-use, A33 and sibling routes remain fail closed', async () => {
  const world = await dethroneWorld();
  const {engine, caster, target, entry, randomCalls, randomStacks} = world;
  await dethronePrepare(world);
  const turn = await dethroneStartCombat(world, 'Dethrone authority boundaries');
  const beforeRaw = plain({caster, target, combat: engine.state().combat});
  const raw = {saveOk: false, dmgTotal: 999};
  assert.equal(engine.useItemApply(entry.id, caster.id, `ally:${target.id}`, raw, world.useId), false);
  assert.equal(engine.useItemApply(entry.id, caster.id, `ally:${target.id}`, structuredClone(raw),
    world.useId), false);
  assert.equal(engine.bg3ItemDethroneAudit().reason, 'private-item-dethrone-private-proof-required');
  assert.deepEqual(plain({caster, target, combat: engine.state().combat}), beforeRaw);
  assert.equal(await engine.bg3ItemProgramOpen(entry.id, caster.id,
    DETHRONE_LEARN_USE_IDS.standard), false, 'the adjacent A33 learn action has no cast authority');
  assert.equal(entry.qty, 2);
  assert.equal(turn.actionsUsed, 0);

  assert.equal(engine.combatUseItem(entry.id, world.useId), true);
  engine.setElementValue('castTarget', `ally:${target.id}`);
  engine.setElementValue('castDethroneDistance', '30.0001');
  assert.equal(engine.castConfirm(), false);
  assert.equal(engine.bg3ItemDethroneAudit().reason, 'private-item-dethrone-target-out-of-range');
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 0);
  assert.deepEqual(plain({caster, target, combat: engine.state().combat}), beforeRaw);
  engine.setElementValue('castDethroneDistance', '30');
  assert.equal(engine.castConfirm(), true, 'the exact 30m boundary retries in the same context');
  engine.bg3ItemFormulaSetValues({dethroneSave: 1, dethroneDice: 40});
  engine.bg3ItemFormulaCaptureNextDispatch(true);
  assert.equal(engine.castFormulaConfirm(), false);
  assert.ok(engine.bg3ItemFormulaLastDispatch());
  assert.equal(engine.bg3ItemDethroneAudit().distanceM, 30);
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 0);

  const sibling = await dethroneWorld();
  await sibling.engine.bg3CatalogEnsureIndex();
  await sibling.engine.bg3CatalogHydrate([ARTISTRY_SCROLL.itemId]);
  sibling.entry.itemId = ARTISTRY_SCROLL.itemId;
  const siblingItem = sibling.engine.catalogItem(ARTISTRY_SCROLL.itemId);
  const siblingUse = sibling.engine.itemUseOf(siblingItem, ARTISTRY_SCROLL.useId);
  assert.ok(siblingItem && siblingUse);
  assert.ok(await sibling.engine.bg3RuleProgramPrepare(siblingUse));
  const siblingBefore = plain({caster: sibling.caster, target: sibling.target,
    combat: sibling.engine.state().combat});
  assert.equal(await sibling.engine.bg3ItemProgramOpen(sibling.entry.id, sibling.caster.id,
    world.useId), false, 'a sibling carrier cannot borrow a known Dethrone use id');
  assert.equal(sibling.engine.bg3ItemDethroneAudit().reason,
    'private-item-dethrone-exact-v10-carrier-required');
  assert.equal(await sibling.engine.bg3ItemProgramOpen(sibling.entry.id, sibling.caster.id,
    ARTISTRY_SCROLL.useId), false, 'the exceptional sibling A12 remains outside private authority');
  assert.deepEqual(plain({caster: sibling.caster, target: sibling.target,
    combat: sibling.engine.state().combat}), siblingBefore);
  assert.equal(sibling.entry.qty, 2);
  assert.equal(randomCalls(), 0, 'authority boundaries never roll\n' + randomStacks.join('\n---\n'));
  assert.equal(sibling.randomCalls(), 0, sibling.randomStacks.join('\n---\n'));
});

test('private Dethrone runtime: qty-one rollback preserves identities, retries once and survives presentation failure', async () => {
  const world = await dethroneWorld({qty: 1});
  const {engine, caster, target, entry, randomCalls, randomStacks} = world;
  await dethronePrepare(world);
  const turn = await dethroneStartCombat(world, 'Dethrone qty-one rollback retry replay');
  const state = engine.state();
  const {args} = dethroneIssue(world, {distance: '30', save: 1, dice: 40});
  const issued = plain({chars: state.chars, foes: state.foesDB, combat: state.combat});
  const detached = args.slice();
  detached[3] = structuredClone(args[3]);
  assert.equal(engine.bg3ItemFormulaApplyArgs(detached), false, 'detached carrier has no private authority');
  assert.deepEqual(plain({chars: state.chars, foes: state.foesDB, combat: state.combat}), issued);

  const inventoryKeys = Reflect.ownKeys(caster.inventory);
  const inventoryDescriptors = Object.getOwnPropertyDescriptors(caster.inventory);
  const ledger = turn.spellCasts;
  const ledgerKeys = Reflect.ownKeys(ledger);
  const ledgerDescriptors = Object.getOwnPropertyDescriptors(ledger);
  const refs = {chars: state.chars, foes: state.foesDB, combat: state.combat,
    order: state.combat.order, turn: state.combat.turn, inventory: caster.inventory,
    equipment: caster.equipment, slots: caster.slots, entry, target, ledger};
  const before = plain({chars: state.chars, foes: state.foesDB, combat: state.combat});
  const late = engine.bg3ItemDethroneTestInjectLateFailureOnce();
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false);
  assert.equal(late.hits(), 1);
  assert.deepEqual(plain(late.observed()), {qty: 0, inventoryLength: 0, actionsUsed: 1,
    actionUsed: true, bonusUsed: false, targetHp: 40});
  assert.equal(engine.bg3ItemDethroneAudit().phase, 'rolled-back');
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 0);
  assert.deepEqual(plain({chars: state.chars, foes: state.foesDB, combat: state.combat}), before);
  assert.equal(state.chars, refs.chars);
  assert.equal(state.foesDB, refs.foes);
  assert.equal(state.combat, refs.combat);
  assert.equal(state.combat.order, refs.order);
  assert.equal(state.combat.turn, refs.turn);
  assert.equal(caster.inventory, refs.inventory);
  assert.equal(caster.inventory[0], refs.entry);
  assert.equal(caster.equipment, refs.equipment);
  assert.equal(caster.slots, refs.slots);
  assert.equal(target, refs.target);
  assert.equal(turn.spellCasts, refs.ledger);
  assert.deepEqual(Reflect.ownKeys(caster.inventory), inventoryKeys);
  assert.deepEqual(Object.getOwnPropertyDescriptors(caster.inventory), inventoryDescriptors);
  assert.deepEqual(Reflect.ownKeys(ledger), ledgerKeys);
  assert.deepEqual(Object.getOwnPropertyDescriptors(ledger), ledgerDescriptors);
  assert.equal(entry.qty, 1);
  assert.equal(target.hp, 100);
  assert.equal(turn.actionsUsed, 0);

  const presentation = engine.bg3ItemDethroneTestInjectPresentationFailureOnce();
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true, 'the same opaque proof retries exactly once');
  assert.equal(engine.bg3ItemDethroneAudit().phase, 'used');
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 1);
  assert.equal(caster.inventory, refs.inventory);
  assert.equal(caster.inventory.length, 0);
  assert.equal(target.hp, 40);
  assert.equal(turn.actionsUsed, 1);
  assert.equal(turn.actionUsed, true);
  assert.equal(turn.spellCasts, ledger);
  assert.deepEqual(plain(ledger), [{id: DETHRONE.spellId, level: 5, cost: 'action'}]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(presentation.hits(), 1, 'deferred presentation failure occurs only after the burn');
  const committed = plain({chars: state.chars, foes: state.foesDB, combat: state.combat});
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false);
  assert.equal(engine.bg3ItemDethroneAudit().phase, 'replay-rejected');
  assert.equal(engine.bg3ItemDethroneAudit().resourceTransactions, 0);
  assert.deepEqual(plain({chars: state.chars, foes: state.foesDB, combat: state.combat}), committed);
  assert.equal(randomCalls(), 0, 'rollback, retry, presentation and replay never roll\n'
    + randomStacks.join('\n---\n'));
});

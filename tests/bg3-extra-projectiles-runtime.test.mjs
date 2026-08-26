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
 * Active-v10 source and private-runtime certificate for the only
 * bounded SpawnExtraProjectiles item carrier: Arrow of Many Targets.
 *
 * The structural tests prove the immutable source topology and exact generated
 * descriptor.  The causal tests drive the production private-authority path;
 * raw/public clones and every unbounded carrier remain fail closed.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = selectBg3Catalog(repo);
const {current, manifest, catalogRoot} = selected;
const PROFILES = Object.freeze(['standard', 'honour']);

const EXPECTED = Object.freeze({
  version: 'bg3-24532579-v10',
  manifestSha256: '0c9f9ba28daf3f4d2e2466345ea412352e16b7a82b0b093f3ed9a1d579b5dc1b',
  sourceRules: 46,
  sourcePrograms: 92,
  sourceFields: 102,
  directFields: 20,
  conditionalFields: 82,
  sourceCensusSha256: '7dfa6e7f45ee1a73737a7406af528f5529855b44c47ca5df0d0bcda2498b8bdc',
  carrierRows: 62,
  carrierItems: 31,
  primaryRules: 26,
  carrierCensusSha256: 'd905bb7240b82ca3a781c3148f0d1f96e803720b50e740a4daecd10e49947b86',
  descriptorRows: 2,
  descriptorItems: 1,
});

const ARROW = Object.freeze({
  itemId: 'bg3:item:rt:b11b3f7f-d8ec-41db-93b9-24474aea31e3:stats:T0JKX0Fycm93T2ZSaWNvY2hldA',
  itemArtifact: 'items/04-0002.json',
  statsId: 'OBJ_ArrowOfRicochet',
  rootArtifact: 'root-template-programs/04-0000.json',
  useIds: Object.freeze({
    standard: 'bg3-use-62c1be5dbf88a75b409d',
    honour: 'bg3-use-5fb50274ac0a36164c47',
  }),
  descriptorSha256: Object.freeze({
    standard: '3bfe3614b05346d131ad5f9e2cd68620253dcdba25c63584751d09812def68f9',
    honour: 'e74326df1cad88f5a41681ae134bbf26dce54664893769eb7bfe0a2a22f2c90a',
  }),
  chain: Object.freeze([
    Object.freeze({
      bg3Id: 'Projectile_ArrowOfRicochet',
      ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXQ',
      artifact: 'rules/spells/1e.json',
      success: 'DealDamage(MainRangedWeapon, MainRangedWeaponDamageType); ExecuteWeaponFunctors(MainHand); SpawnExtraProjectiles(Projectile_ArrowOfRicochet_Ricochet)',
      failure: 'SpawnExtraProjectiles(Projectile_ArrowOfRicochet_Ricochet)',
      target: 'not Self() and not Dead()',
      child: 'Projectile_ArrowOfRicochet_Ricochet',
    }),
    Object.freeze({
      bg3Id: 'Projectile_ArrowOfRicochet_Ricochet',
      ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXRfUmljb2NoZXQ',
      artifact: 'rules/spells/f0.json',
      success: 'DealDamage(MainRangedWeapon/2, MainRangedWeaponDamageType); ExecuteWeaponFunctors(MainHand); SpawnExtraProjectiles(Projectile_ArrowOfRicochet_Ricochet_2)',
      failure: 'SpawnExtraProjectiles(Projectile_ArrowOfRicochet_Ricochet_2)',
      target: 'not Self() and not Dead() and Enemy()',
      child: 'Projectile_ArrowOfRicochet_Ricochet_2',
    }),
    Object.freeze({
      bg3Id: 'Projectile_ArrowOfRicochet_Ricochet_2',
      ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXRfUmljb2NoZXRfMg',
      artifact: 'rules/spells/c4.json',
      success: 'DealDamage(MainRangedWeapon/2, MainRangedWeaponDamageType); ExecuteWeaponFunctors(MainHand); SpawnExtraProjectiles(Projectile_ArrowOfRicochet_Ricochet_3)',
      failure: 'SpawnExtraProjectiles(Projectile_ArrowOfRicochet_Ricochet_3)',
      target: 'not Self() and not Dead() and Enemy()',
      child: 'Projectile_ArrowOfRicochet_Ricochet_3',
    }),
    Object.freeze({
      bg3Id: 'Projectile_ArrowOfRicochet_Ricochet_3',
      ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXRfUmljb2NoZXRfMw',
      artifact: 'rules/spells/23.json',
      success: 'DealDamage(MainRangedWeapon/2, MainRangedWeaponDamageType); ExecuteWeaponFunctors(MainHand)',
      failure: null,
      target: 'not Self() and not Dead() and Enemy()',
      child: null,
    }),
  ]),
});

const jsonCache = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function catalogArtifact(descriptor) {
  return path.relative(catalogRoot, path.resolve(repo, ...descriptor.path.split('/'))).replaceAll('\\', '/');
}

function readDescriptor(descriptor) {
  const absolute = path.resolve(repo, ...descriptor.path.split('/'));
  if (jsonCache.has(absolute)) return jsonCache.get(absolute);
  const raw = fs.readFileSync(absolute);
  assert.equal(raw.byteLength, descriptor.bytes, `${descriptor.path}: manifest byte count`);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), descriptor.sha256,
    `${descriptor.path}: manifest SHA-256`);
  const value = JSON.parse(raw.toString('utf8'));
  jsonCache.set(absolute, value);
  return value;
}

function descriptorForArtifact(group, artifact) {
  const descriptor = (manifest.files[group] || []).find(row => catalogArtifact(row) === artifact);
  assert.ok(descriptor, `manifest descriptor missing: ${group}/${artifact}`);
  return descriptor;
}

function opcodeHits(value, wanted, out = []) {
  if (Array.isArray(value)) {
    for (const child of value) opcodeHits(child, wanted, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.op === wanted) out.push(value);
  for (const child of Object.values(value)) opcodeHits(child, wanted, out);
  return out;
}

function predicates(value, out = []) {
  if (Array.isArray(value)) {
    for (const child of value) predicates(child, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.kind === 'predicate') out.push(value);
  for (const child of Object.values(value)) predicates(child, out);
  return out;
}

function guardAtoms(condition) {
  if (!condition || typeof condition !== 'object') return null;
  if (condition.kind === 'and') {
    const rows = (condition.operands || []).flatMap(guardAtoms);
    return rows.includes(undefined) ? null : [...new Set(rows)].sort();
  }
  const negated = condition.kind === 'not';
  const predicate = negated ? condition.operand : condition;
  if (!predicate || predicate.kind !== 'predicate' || (predicate.args || []).length) return [undefined];
  return [(negated ? '!' : '') + predicate.name];
}

function fieldOf(record, name) {
  return (record.program.fields || []).find(field => field.field === name) || null;
}

function effectiveMechanics(item, profile) {
  return profile === 'honour' && item.source?.honourOverlay?.item?.mechanics
    ? item.source.honourOverlay.item.mechanics : item.mechanics;
}

const ruleProgramRecords = [];
for (const descriptor of manifest.files.rules || []) {
  const payload = readDescriptor(descriptor);
  const artifact = catalogArtifact(descriptor);
  for (const rule of payload.rules || []) for (const profile of PROFILES) {
    const program = rule.programs?.[profile];
    if (program) ruleProgramRecords.push({artifact, rule, profile, program});
  }
}

const programRecordsById = new Map();
for (const record of ruleProgramRecords) {
  const rows = programRecordsById.get(record.program.id) || [];
  rows.push(record);
  programRecordsById.set(record.program.id, rows);
}

const sourceFieldOccurrences = [];
for (const record of ruleProgramRecords) for (const field of record.program.fields || []) {
  const hits = opcodeHits(field.bytecode || [], 'spawnExtraProjectiles');
  if (!hits.length) continue;
  const direct = (field.bytecode || []).filter(opcode => opcode?.op === 'spawnExtraProjectiles');
  sourceFieldOccurrences.push({...record, field, hits, direct});
}

const sourcePrograms = ruleProgramRecords.filter(record =>
  (record.program.fields || []).some(field => opcodeHits(field.bytecode || [], 'spawnExtraProjectiles').length));

function selectedSources(use) {
  const projection = use?.program?.projection || {};
  return [...(projection.entrypoints || []), ...(projection.transitive || [])].flatMap(ref =>
    (programRecordsById.get(String(ref?.programId || '')) || []).flatMap(record => {
      const wanted = new Set(ref.fields || []);
      const fields = (record.program.fields || []).filter(field => wanted.has(field.field));
      const hits = fields.flatMap(field => opcodeHits(field.bytecode || [], 'spawnExtraProjectiles'));
      return hits.length ? [{ref, record, fields, hits}] : [];
    }));
}

const itemVariants = [];
for (const descriptor of manifest.files.items || []) {
  const payload = readDescriptor(descriptor);
  const itemArtifact = catalogArtifact(descriptor);
  for (const item of payload.items || []) for (const profile of PROFILES) {
    itemVariants.push({item, profile, itemArtifact, mechanics: effectiveMechanics(item, profile)});
  }
}

const itemCarriers = itemVariants.flatMap(variant => (variant.mechanics?.actions || []).flatMap(use => {
  const sources = selectedSources(use);
  return sources.length ? [{...variant, use, sources}] : [];
}));

function sourceCensusLine(row) {
  return [row.profile, row.rule.id, row.rule.bg3Id, row.artifact, row.program.id, row.program.mode,
    row.field.field, row.field.role, row.field.mode, row.direct.length ? 'direct' : 'conditional',
    sha256(row.field.raw), sha256(canonical(row.field.ast)), sha256(canonical(row.field.bytecode))].join('|');
}

function carrierCensusLine(row) {
  const projection = row.use.program?.projection || {};
  const primary = projection.entrypoints?.[0] || {};
  return [row.profile, row.item.id, row.itemArtifact, row.use.id, row.use.handler, row.use.cost,
    row.use.target, row.use.consume?.kind, row.use.consume?.amount, row.use.program?.id,
    row.use.program?.rootArtifact, projection.mode, projection.complete, primary.ruleId, primary.bg3Id,
    primary.programId, primary.artifact, (primary.fields || []).join(','),
    row.sources.map(source => source.ref.programId).sort().join(','),
    !!row.use.program?.projectile?.extraProjectiles].join('|');
}

function assertDigest(rows, line, expected, label) {
  const lines = rows.map(line).sort((a, b) => a.localeCompare(b, 'en'));
  const actual = sha256(lines.join('\n'));
  assert.equal(actual, expected,
    `${label}: count=${lines.length} sha256=${actual}; first row=${lines[0] || '<none>'}`);
}

function rootProgram(use) {
  const descriptor = descriptorForArtifact('rootTemplatePrograms', use.program.rootArtifact);
  const payload = readDescriptor(descriptor);
  return (payload.programs || []).find(program => program.id === use.program.id) || null;
}

function programRecord(ruleId, profile) {
  return ruleProgramRecords.find(row => row.rule.id === ruleId && row.profile === profile) || null;
}

function arrowCarrier(profile) {
  return itemCarriers.find(row => row.profile === profile && row.item.id === ARROW.itemId) || null;
}

function checkArrowCarrier(row) {
  const failures = [];
  const check = (condition, label) => { if (!condition) failures.push(label); };
  const {profile, item, use} = row || {};
  const contract = use?.program || {};
  const projection = contract.projection || {};
  const projectile = contract.projectile || {};
  const extra = projectile.extraProjectiles || {};
  const root = use ? rootProgram(use) : null;
  const expectedRootId = `${ARROW.itemId}:root-action:${profile}:OnUsePeaceActions:0`;

  check(PROFILES.includes(profile), 'profile');
  check(item?.id === ARROW.itemId && row?.itemArtifact === ARROW.itemArtifact, 'item-identity');
  check(item?.source?.statsId === ARROW.statsId && item?.source?.rootTemplateUuid === 'b11b3f7f-d8ec-41db-93b9-24474aea31e3', 'source-identity');
  check(item?.i18n?.en?.name === 'Arrow of Many Targets' && item?.i18n?.ru?.name === 'Стрела множества целей', 'localization-display-only');
  check(use?.id === ARROW.useIds[profile] && use?.handler === 'bg3RuleProgram', 'use-identity');
  check(use?.cost === 'action' && use?.target === 'any'
    && use?.consume?.kind === 'item' && use?.consume?.amount === 1
    && use?.rollPolicy === 'player-input-required', 'primary-item-boundary');

  check(contract.id === expectedRootId && contract.sourceProfile === profile
    && contract.rootArtifact === ARROW.rootArtifact && contract.mode === 'typed'
    && contract.commitPolicy === 'item-action-contract-once'
    && contract.invokedRuleResourceCostPolicy === 'caller-item-action', 'item-program-contract');
  check(contract.sourceAction?.primary?.actionType === 12
    && contract.sourceAction.primary.index === 0
    && contract.sourceAction.primary.trigger === 'OnUsePeaceActions'
    && contract.sourceAction.primary.attributes?.Consume === 'True'
    && contract.sourceAction.primary.attributes?.SkillID === ARROW.chain[0].bg3Id
    && contract.sourceAction.primary.rootProgramId === expectedRootId, 'source-action');
  check(root?.id === expectedRootId && root?.sourceProfile === profile && root?.trigger === 'OnUsePeaceActions'
    && root?.actionType === 12 && root?.mode === 'typed', 'root-program');
  check(root?.commit?.length === 1 && root.commit[0].op === 'commitFromItemAction'
    && root.commit[0].binding?.cost === 'action'
    && root.commit[0].binding?.consume?.kind === 'item'
    && root.commit[0].binding?.consume?.amount === 1, 'single-root-commit');
  check(root?.consequences?.length === 1 && root.consequences[0].op === 'invokeRuleProgram'
    && root.consequences[0].programId === `${ARROW.chain[0].ruleId}:program:${profile}`
    && root.consequences[0].artifact === ARROW.chain[0].artifact
    && root.consequences[0].resourceCostPolicy === 'caller-item-action', 'root-invoke');

  const refs = [...(projection.entrypoints || []), ...(projection.transitive || [])];
  check(projection.schemaVersion === 'bg3-action-rule-projection/1'
    && projection.sourceProfile === profile && projection.context === 'ammunition'
    && projection.mode === 'typed' && projection.complete === true
    && projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && (projection.unresolved || []).length === 0
    && projection.entrypoints?.length === 1 && projection.transitive?.length === 3, 'projection-boundary');
  check(refs.length === ARROW.chain.length && refs.every((ref, index) =>
    ref.kind === 'spell' && ref.ruleId === ARROW.chain[index].ruleId
    && ref.bg3Id === ARROW.chain[index].bg3Id
    && ref.programId === `${ARROW.chain[index].ruleId}:program:${profile}`
    && ref.artifact === ARROW.chain[index].artifact && ref.sourceProfile === profile
    && ref.mode === 'typed' && (index === 0 || ref.relation === 'spawned-projectile')), 'rule-chain');

  const records = ARROW.chain.map(chain => programRecord(chain.ruleId, profile));
  check(records.every(Boolean), 'loaded-rule-chain');
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const expected = ARROW.chain[index];
    if (!record) continue;
    check(record.artifact === expected.artifact && record.rule.bg3Id === expected.bg3Id
      && record.program.id === `${expected.ruleId}:program:${profile}`
      && record.program.mode === 'typed' && record.program.rollPolicy === 'player-input-required', `rule-${index}-identity`);
    const success = fieldOf(record, 'SpellSuccess');
    const failure = fieldOf(record, 'SpellFail');
    const target = fieldOf(record, 'TargetConditions');
    const roll = fieldOf(record, 'SpellRoll');
    check(success?.raw === expected.success, `rule-${index}-success-raw`);
    check((failure?.raw || null) === expected.failure, `rule-${index}-failure-raw`);
    check(target?.raw === expected.target, `rule-${index}-target-raw`);
    check(guardAtoms(target?.bytecode?.[0]?.condition)?.join('|')
      === (index === 0 ? ['!Dead', '!Self'] : ['!Dead', '!Self', 'Enemy']).join('|'), `rule-${index}-target-guard`);
    check((roll?.bytecode || []).every(opcode => opcode.op === 'requestResolution'
      && opcode.rollPolicy === 'player-input-required'
      && opcode.condition?.rollPolicy === 'player-input-required'), `rule-${index}-player-rolls`);
    const successOps = success?.bytecode || [];
    check(successOps[0]?.op === 'dealDamage' && successOps[1]?.op === 'executeWeaponFunctors', `rule-${index}-hit-consequences`);
    if (index === 0) {
      check(successOps[0]?.amount?.kind === 'symbol' && successOps[0].amount.value === 'MainRangedWeapon', 'primary-full-weapon-damage');
    } else {
      check(successOps[0]?.amount?.kind === 'arithmetic' && successOps[0].amount.operator === '/'
        && successOps[0].amount.left?.value === 'MainRangedWeapon'
        && successOps[0].amount.right?.kind === 'integer' && successOps[0].amount.right.value === 2,
      `extra-${index}-half-weapon-damage`);
    }
    check(successOps[0]?.damageType?.value === 'MainRangedWeaponDamageType'
      && successOps[1]?.args?.[0]?.value === 'MainHand', `rule-${index}-same-weapon-functors`);
    const successSpawns = successOps.filter(opcode => opcode.op === 'spawnExtraProjectiles');
    const failureSpawns = (failure?.bytecode || []).filter(opcode => opcode.op === 'spawnExtraProjectiles');
    check(expected.child ? successSpawns.length === 1 && failureSpawns.length === 1
      && successSpawns[0].args?.[0]?.value === expected.child
      && failureSpawns[0].args?.[0]?.value === expected.child
      : successSpawns.length === 0 && failure === null, `rule-${index}-hit-miss-chain`);
  }

  check(projectile.schemaVersion === 'bg3-projectile-action/1' && projectile.kind === 'ammunition'
    && projectile.spellId === ARROW.chain[0].bg3Id
    && projectile.programId === `${ARROW.chain[0].ruleId}:program:${profile}`
    && projectile.artifact === ARROW.chain[0].artifact && projectile.sourceProfile === profile
    && projectile.attack === 'ranged-weapon' && projectile.baseWeaponDamage === 'once'
    && projectile.executeWeaponFunctors === 'once' && projectile.consumeOnCommit === 1
    && projectile.offhandPolicy === 'alternative' && projectile.offhandCost === 'bonus'
    && projectile.offhandCostSource?.sourceField === 'DualWieldingUseCosts'
    && projectile.offhandCostSource?.resource === 'BonusActionPoint'
    && projectile.offhandCostSource?.amount === 1
    && projectile.extraProjectilePolicy === 'explicit-target-selection', 'projectile-adapter');

  check(extra.schemaVersion === 'bg3-extra-projectiles/1'
    && extra.selectionMode === 'explicit-ordered-distinct-targets'
    && extra.orderPolicy === 'source-spawn-chain' && extra.targetCount === 3
    && extra.distinctTargets === true && extra.excludePrimaryTarget === true
    && extra.sourceItemConsume?.amount === 1
    && extra.sourceItemConsume?.cardinality === 'once-primary-commit'
    && extra.primaryAttack?.cardinality === 'once'
    && extra.extraAttacks?.cardinality === 'once-per-projectile'
    && extra.executionPolicy === 'all-steps-exact-or-fail-closed'
    && extra.steps?.length === 3, 'descriptor-header');
  check(sha256(canonical(extra)) === ARROW.descriptorSha256[profile], 'descriptor-sha256');

  for (let index = 0; index < (extra.steps || []).length; index++) {
    const step = extra.steps[index];
    const sourceExpected = ARROW.chain[index];
    const targetExpected = ARROW.chain[index + 1];
    const sourceRecord = records[index];
    const targetRecord = records[index + 1];
    const success = sourceRecord && fieldOf(sourceRecord, 'SpellSuccess');
    const failure = sourceRecord && fieldOf(sourceRecord, 'SpellFail');
    const damage = targetRecord && fieldOf(targetRecord, 'SpellSuccess');
    const cycle = sourceRecord && fieldOf(sourceRecord, 'CycleConditions');
    const extraTargetRaw = sourceRecord?.rule?.properties?.ExtraProjectileTargetConditions;
    const projectileTarget = targetRecord && fieldOf(targetRecord, 'TargetConditions');
    check(step.order === index + 1 && step.projectileCount === 1
      && step.projectileRule?.ruleId === targetExpected.ruleId
      && step.projectileRule?.bg3Id === targetExpected.bg3Id
      && step.projectileRule?.programId === `${targetExpected.ruleId}:program:${profile}`
      && step.projectileRule?.artifact === targetExpected.artifact, `step-${index}-projectile`);
    check(step.projectileCountSource?.ruleId === targetExpected.ruleId
      && step.projectileCountSource?.field === 'ProjectileCount'
      && step.projectileCountSource?.raw === '1', `step-${index}-count`);
    check(step.spawnOutcomePolicy === 'success-or-failure-once'
      && step.spawnSources?.length === 2
      && step.spawnSources[0].outcome === 'success' && step.spawnSources[0].field === 'SpellSuccess'
      && step.spawnSources[0].sourceRuleId === sourceExpected.ruleId
      && step.spawnSources[0].opcodeIndex === 2
      && canonical(step.spawnSources[0].projectileSpellId) === canonical(targetExpected.bg3Id)
      && canonical(success?.bytecode?.[2]) === canonical({
        op: 'spawnExtraProjectiles', executable: true, bg3Functor: 'SpawnExtraProjectiles',
        args: [{kind: 'symbol', value: targetExpected.bg3Id}], phase: 'consequences',
      })
      && step.spawnSources[1].outcome === 'failure' && step.spawnSources[1].field === 'SpellFail'
      && step.spawnSources[1].sourceRuleId === sourceExpected.ruleId
      && step.spawnSources[1].opcodeIndex === 0
      && canonical(failure?.bytecode?.[0]) === canonical(success?.bytecode?.[2]), `step-${index}-success-failure-chain`);
    check(step.targetSelection?.mode === 'explicit-player-selected'
      && step.targetSelection?.distinctFrom === 'primary-and-earlier-projectile-targets'
      && step.targetSelection?.cycleGuard?.raw === cycle?.raw
      && canonical(step.targetSelection?.cycleGuard?.condition) === canonical(cycle?.bytecode?.[0]?.condition)
      && step.targetSelection?.extraProjectileTargetGuard?.raw === extraTargetRaw
      && canonical(step.targetSelection?.extraProjectileTargetGuard?.condition)
        === canonical({kind: 'predicate', name: 'Enemy', args: []})
      && step.targetSelection?.projectileTargetGuard?.raw === projectileTarget?.raw
      && canonical(step.targetSelection?.projectileTargetGuard?.condition) === canonical(projectileTarget?.bytecode?.[0]?.condition)
      && step.targetSelection?.normalizedEligibility?.kind === 'enemy'
      && step.targetSelection?.normalizedEligibility?.alive === true, `step-${index}-targets`);
    check(step.attack?.weaponSource === 'selected-originating-ranged-weapon'
      && step.attack?.rollsPerProjectile === 1 && step.attack?.rollPolicy === 'player-input-required'
      && step.consequences?.executionOutcome === 'attack-success'
      && step.consequences?.weaponSource === 'selected-originating-ranged-weapon'
      && step.consequences?.damageTypeSource === 'selected-originating-ranged-weapon'
      && step.consequences?.damageScale?.numerator === 1
      && step.consequences?.damageScale?.denominator === 2
      && step.consequences?.baseWeaponDamageApplications === 1
      && step.consequences?.weaponFunctorApplications === 1
      && canonical(step.consequences?.damageSource?.opcode) === canonical(damage?.bytecode?.[0])
      && canonical(step.consequences?.weaponFunctorSource?.opcode) === canonical(damage?.bytecode?.[1]), `step-${index}-half-hit-once`);
  }

  return {ok: failures.length === 0, failures};
}

function loadFailClosedEngine(random) {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)\)\{[\s\S]*$/, '');
  source += `
    globalThis.__bg3ExtraProjectileFailClosed = {
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
      useItemApply, bg3CatalogUseRefs,
      audit: bg3ItemFormulaOutcomeAudit,
      state() { return {chars,itemsDB,foesDB,combat,journal}; }
    };
  `;

  const elements = new Map();
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
    prompt: () => '1',
    alert() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    fetch: async () => ({ok: false, status: 404, text: async () => '', json: async () => ({})}),
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
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bg3ExtraProjectileFailClosed;
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

function loadArrowRuntimeEngine(random) {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  const dispatchNeedle = '  summonUseItemApplyWrapper=function(entryId,casterId,target,rolls,useId,opts){';
  assert.equal(source.includes(dispatchNeedle), true, 'production item dispatch wrapper capture seam');
  source = source.replace(dispatchNeedle,
    dispatchNeedle + "const capture=globalThis.__bg3ArrowDispatchCapture;if(capture&&capture.next){capture.next=false;capture.args=opts===undefined?[entryId,casterId,target,rolls,useId]:[entryId,casterId,target,rolls,useId,opts];if(capture.block)return false;}");
  source += `
    globalThis.__bg3ArrowDispatchCapture={next:false,block:false,args:null};
    globalThis.__bg3ArrowRuntime = {
      setState(s) {
        chars=s.chars||[]; journal=[]; itemsDB=s.items||[]; spellsDB=[]; abilitiesDB=s.abilities||[];
        racesDB=[]; classesDB=[]; rulesDB=[]; foesDB=s.foes||[]; activeCharId=s.activeCharId||null; fxRound=1;
        harvestedSources={}; bg3SceneState=bg3SceneNormalizeState(null); bg3StoryState=bg3StoryNormalizeState(null);
        bg3TadpoleState=bg3TadpoleNormalizeState(null); bg3TreasureState=bg3TreasureNormalizeState(null);
        bg3Catalog.items=new Map(itemsDB.filter(item=>bg3CatalogIsId(item&&item.id)).map(item=>[item.id,item]));
        combat=normalizeCombatState(null); lastCastEvent=null; castCtx=null; rollSpec=null; rollQueue=[];
        rollCompleting=false; bg3RollPromptScope=null; bg3RuleProgramClear(); bg3LifecycleReset();
        bg3GithbornMindcrusherTrustCharacters(chars); bg3InterruptReset(); bg3InventoryStatusTransitionReset();
        bg3SceneCatalogReset(); fxInvalidate();
      },
      state() { return {chars,itemsDB,abilitiesDB,foesDB,combat,journal}; },
      seedItemsDB, seedAbilitiesDB, seedFoesDB, upgradeFoe,
      bg3CatalogUseRefs, bg3CatalogEnsureIndex, bg3CatalogHydrate,
      catalogItem(id) { return bg3Catalog.items.get(id)||null; },
      itemUseOf, bg3RuleProgramPrepare,
      combatStart, combatUseItem, bg3ItemProgramOpen, useItemApply,
      castConfirm, castFormulaConfirm, castDistanceSet,
      castState() { return {ctx:castCtx,spec:castCtx&&castCtx.spec}; },
      bg3ItemArrowAudit, bg3ItemArrowTestInjectLateFailureOnce, bg3ItemArrowTestInjectPresentationFailureOnce,
      bg3ItemArrowTestLifecycleRuntimeSnapshot(caster) {
        return {pending:bg3LifecycleRuntime.pending.get(caster)||null};
      },
      bg3ItemFormulaCaptureNextDispatch(block=false) {
        const capture=globalThis.__bg3ArrowDispatchCapture;capture.next=true;capture.block=block===true;capture.args=null;return true;
      },
      bg3ItemFormulaLastDispatch() {
        const args=globalThis.__bg3ArrowDispatchCapture.args;return args&&args.slice();
      },
      bg3ItemFormulaApplyArgs(args) { return useItemApply(...args); },
      bg3ItemFormulaSetValues(values) {
        for(const [key,value] of Object.entries(values||{}))document.getElementById('cf_'+key).value=value==null?'':String(value);
        return true;
      },
      setElementValue(id,value) { document.getElementById(id).value=value; },
      elementText(id) { return document.getElementById(id).textContent; }
    };
  `;

  const elements = new Map();
  const stored = new Map();
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
    prompt: () => '1',
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
  return context.__bg3ArrowRuntime;
}

function actor(id, itemId) {
  return {
    id, name: id, cls: 'Воин', level: 5,
    ab: {str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10},
    saves: {}, skills: {}, hp: 20, hpMax: 20, hpTemp: 0,
    inventory: [{id: `${id}-carrier`, itemId, qty: 2}], equipment: {}, abilities: [],
    activeFx: [], fxOff: [], cond: [], deaths: {s: 0, f: 0}, slots: {}, spentRest: 0,
    exhaustion: 0, hdUsed: 0,
  };
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

async function arrowRuntimeWorld({
  profile = 'standard', weaponItemId = 'it_shortbow_s', equipmentSlot = 'TWO_HAND', qty = 2,
} = {}) {
  let randomCalls = 0;
  const randomStacks = [];
  const engine = loadArrowRuntimeEngine(() => {
    randomCalls++;
    randomStacks.push(new Error('unexpected Arrow Math.random').stack);
    return 0.5;
  });
  const items = plain(engine.seedItemsDB());
  const abilities = plain(engine.seedAbilitiesDB());
  const proficiency = abilities.find(row => row.id === 'ab_sx_weapons');
  const weapon = items.find(row => row.id === weaponItemId);
  assert.ok(proficiency, 'saved weapon-proficiency fixture');
  assert.ok(weapon?.mechanics?.profile?.weapon?.ranged && weapon.mechanics.profile.weapon.ammo,
    'ranged ammunition weapon fixture');
  const arrowEntry = {id: 'certificate-arrow-entry', itemId: ARROW.itemId, qty};
  const weaponEntry = {id: `certificate-${equipmentSlot === 'OFF_HAND' ? 'offhand' : 'main'}-weapon`,
    itemId: weapon.id, qty: 1};
  const shooter = hero('certificate-arrow-shooter', {
    inventory: [arrowEntry, weaponEntry], equipment: {[equipmentSlot]: weaponEntry.id},
    abilities: [{abilityId: proficiency.id, cur: null, notes: ''}], activeEffectsSchemaVersion: 1,
  });
  const ally = hero('certificate-arrow-ally', {hp: 20, hpMax: 20, activeEffectsSchemaVersion: 1});
  const foes = [];
  for (let index = 0; index < 3; index++) {
    const foe = plain(engine.seedFoesDB()[0]);
    foe.id = `certificate-arrow-foe-${index + 1}`;
    foe.n = `Arrow foe ${index + 1}`;
    foe.hp = 30;
    foe.hpMax = 30;
    foe.activeFx = [];
    foe.cond = [];
    engine.upgradeFoe(foe);
    foes.push(foe);
  }
  engine.setState({chars: [shooter, ally], items, abilities: [proficiency], foes, activeCharId: shooter.id});
  assert.equal(engine.bg3CatalogUseRefs([{id: 'bg3', version: current.catalogVersion, profile,
    manifestSha256: current.manifestSha256}]), true);
  await arrowRuntimeQuiesce({engine, shooter});
  randomCalls = 0;
  randomStacks.length = 0;
  return {engine, shooter, ally, foes, arrowEntry, weaponEntry, weapon, profile,
    useId: ARROW.useIds[profile], randomCalls: () => randomCalls, randomStacks};
}

async function arrowRuntimeQuiesce(world) {
  const pending = world.engine.bg3ItemArrowTestLifecycleRuntimeSnapshot(world.shooter).pending;
  if (pending) await pending;
  await Promise.resolve();
  assert.equal(world.engine.bg3ItemArrowTestLifecycleRuntimeSnapshot(world.shooter).pending, null,
    'Arrow runtime must be lifecycle-quiescent');
}

async function arrowRuntimePrepare(world) {
  const {engine, useId} = world;
  await engine.bg3CatalogEnsureIndex();
  await engine.bg3CatalogHydrate([ARROW.itemId]);
  const item = engine.catalogItem(ARROW.itemId);
  const use = engine.itemUseOf(item, useId);
  assert.ok(item && use, 'exact catalog Arrow action');
  assert.ok(await engine.bg3RuleProgramPrepare(use), 'exact Arrow program prepares');
  await arrowRuntimeQuiesce(world);
  return {item, use};
}

function arrowRuntimeSelect(world, extraOrder = [0, 1, 2]) {
  const {engine, ally, foes, weaponEntry} = world;
  engine.setElementValue('castTarget', `ally:${ally.id}`);
  engine.setElementValue('castWeapon', weaponEntry.id);
  for (let index = 0; index < 3; index++) {
    engine.setElementValue(`castBg3ArrowExtra${index + 1}`, `foe:${foes[extraOrder[index]].id}`);
  }
  assert.equal(engine.castConfirm(), true,
    JSON.stringify({audit: engine.bg3ItemArrowAudit(), error: engine.elementText('castErr')}));
  return [`ally:${ally.id}`, ...extraOrder.map(index => `foe:${foes[index].id}`)];
}

function arrowRuntimeEnterFour(world, {naturals = [19, 19, 19, 19], damage = [6, 6, 6, 6]} = {}) {
  const {engine} = world;
  const targetOrder = arrowRuntimeSelect(world);
  for (let order = 0; order < 4; order++) {
    engine.castDistanceSet('far');
    const spec = engine.castState().spec;
    const values = {};
    assert.ok(spec, `shot ${order} formula`);
    assert.equal(spec.meta.bg3ArrowOrder, order);
    for (const row of spec.rows) if (row.required) {
      if (row.type === 'atk') values[row.key] = naturals[order];
      else if (naturals[order] === 1 && row.requiredOnHit) values[row.key] = null;
      else if (row.type === 'dmg') values[row.key] = damage[order];
      else values[row.key] = row.natural ? 10 : Math.max(1, +row.cnt || 1);
    }
    engine.bg3ItemFormulaSetValues(values);
    if (order === 3) engine.bg3ItemFormulaCaptureNextDispatch(true);
    const result = engine.castFormulaConfirm();
    assert.equal(result, order < 3,
      JSON.stringify({order, audit: engine.bg3ItemArrowAudit(), error: engine.elementText('castErr')}));
  }
  return {targetOrder, args: engine.bg3ItemFormulaLastDispatch(), audit: engine.bg3ItemArrowAudit()};
}

test('active v10 manifest census has exactly 46 SpawnExtraProjectiles rules and 102 field/profile occurrences', () => {
  assert.equal(current.catalogVersion, EXPECTED.version);
  assert.equal(current.manifestSha256, EXPECTED.manifestSha256);
  assert.equal(manifest.catalogVersion, EXPECTED.version);
  assert.equal(manifest.immutable, true);
  assert.equal(sourcePrograms.length, EXPECTED.sourcePrograms);
  assert.equal(new Set(sourcePrograms.map(row => row.rule.id)).size, EXPECTED.sourceRules);
  assert.deepEqual(Object.fromEntries(PROFILES.map(profile =>
    [profile, sourcePrograms.filter(row => row.profile === profile).length])), {standard: 46, honour: 46});
  assert.equal(sourceFieldOccurrences.length, EXPECTED.sourceFields);
  assert.equal(sourceFieldOccurrences.every(row => row.hits.length === 1), true,
    'each field/profile occurrence contains one exact SpawnExtraProjectiles node');
  assert.equal(sourceFieldOccurrences.filter(row => row.direct.length === 1).length, EXPECTED.directFields);
  assert.equal(sourceFieldOccurrences.filter(row => row.direct.length === 0).length, EXPECTED.conditionalFields);
  assert.equal(sourceFieldOccurrences.every(row => row.direct.length <= 1
    && row.hits[0].op === 'spawnExtraProjectiles'
    && row.hits[0].bg3Functor === 'SpawnExtraProjectiles'
    && row.hits[0].executable === true
    && row.hits[0].phase === 'consequences'), true);
  assert.equal([...programRecordsById.values()].every(rows => rows.length === 1), true,
    'program ids resolve to one profile/rule/artifact');
  assertDigest(sourceFieldOccurrences, sourceCensusLine, EXPECTED.sourceCensusSha256,
    'SpawnExtraProjectiles source census');
});

test('manifest-derived primary item census is 62 rows/31 items/26 rules with only the two Arrow descriptors', () => {
  assert.equal(itemCarriers.length, EXPECTED.carrierRows);
  assert.equal(new Set(itemCarriers.map(row => row.item.id)).size, EXPECTED.carrierItems);
  assert.equal(new Set(itemCarriers.map(row => row.use.id)).size, EXPECTED.carrierRows);
  assert.equal(new Set(itemCarriers.map(row => row.use.program.projection.entrypoints[0].ruleId)).size,
    EXPECTED.primaryRules);
  assert.deepEqual(Object.fromEntries(PROFILES.map(profile =>
    [profile, itemCarriers.filter(row => row.profile === profile).length])), {standard: 31, honour: 31});
  assert.deepEqual(Object.fromEntries([...Map.groupBy(itemCarriers,
    row => row.use.program.projection.mode).entries()].map(([mode, rows]) => [mode, rows.length])),
  {typed: 44, mixed: 18});
  assert.equal(itemCarriers.every(row => row.use.handler === 'bg3RuleProgram'
    && row.use.program?.projection?.entrypoints?.length === 1), true);
  assertDigest(itemCarriers, carrierCensusLine, EXPECTED.carrierCensusSha256,
    'SpawnExtraProjectiles primary item census');

  const descriptors = itemCarriers.filter(row => row.use.program?.projectile?.extraProjectiles);
  assert.equal(descriptors.length, EXPECTED.descriptorRows);
  assert.equal(new Set(descriptors.map(row => row.item.id)).size, EXPECTED.descriptorItems);
  assert.deepEqual(descriptors.map(row => [row.profile, row.item.id, row.use.id]).sort(), [
    ['honour', ARROW.itemId, ARROW.useIds.honour],
    ['standard', ARROW.itemId, ARROW.useIds.standard],
  ]);
  const closed = itemCarriers.filter(row => !row.use.program?.projectile?.extraProjectiles);
  assert.equal(closed.length, 60);
  const chainLightning = closed.filter(row =>
    row.use.program.projection.entrypoints[0].bg3Id === 'Projectile_ChainLightning');
  assert.equal(chainLightning.length, 2);
  assert.deepEqual(new Set(chainLightning.map(row => row.profile)), new Set(PROFILES));
});

test('Arrow of Many Targets binds exact item/root/1e→f0→c4→23 source and bounded hit/miss semantics', () => {
  const failures = PROFILES.flatMap(profile => {
    const row = arrowCarrier(profile);
    const result = checkArrowCarrier(row);
    return result.ok ? [] : [{profile, failures: result.failures}];
  });
  assert.deepEqual(failures, []);

  const primary = programRecord(ARROW.chain[0].ruleId, 'standard');
  assert.deepEqual(guardAtoms(fieldOf(primary, 'TargetConditions').bytecode[0].condition), ['!Dead', '!Self'],
    'the primary is exact non-self/non-dead and therefore may be an ally');
  for (const chain of ARROW.chain.slice(1)) {
    const record = programRecord(chain.ruleId, 'standard');
    assert.deepEqual(guardAtoms(fieldOf(record, 'TargetConditions').bytecode[0].condition),
      ['!Dead', '!Self', 'Enemy']);
  }
  assert.equal(predicates(ARROW.chain.flatMap(chain =>
    fieldOf(programRecord(chain.ruleId, 'standard'), 'SpellRoll').bytecode)).every(predicate =>
    predicate.name !== 'Random'), true);
});

test('production raw/public clones of all 62 carriers fail closed before resources, HP, effects or randomness', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.contracts?.runtimeCapabilities || {},
    'arrowOfManyTargetsExtraProjectiles'), false, 'no production runtime capability is published yet');
  let randomCalls = 0;
  const engine = loadFailClosedEngine(() => { randomCalls++; return 0.5; });
  for (const profile of PROFILES) {
    assert.equal(engine.bg3CatalogUseRefs([{id: 'bg3', version: current.catalogVersion, profile,
      manifestSha256: current.manifestSha256}]), true);
    for (const row of itemCarriers.filter(carrier => carrier.profile === profile)) {
      const item = plain(row.item);
      const mechanics = effectiveMechanics(item, profile);
      const use = mechanics.actions.find(action => action.id === row.use.id);
      assert.ok(use, `${profile}/${row.item.id}: use clone`);
      use.publicPlan = plain({ok: true, projectile: use.program?.projectile || null});
      use.program.publicCompiledPlan = plain({ok: true, extraProjectiles: use.program?.projectile?.extraProjectiles || null});
      const caster = actor(`extra-projectile-${profile}`, item.id);
      const foe = {id: `extra-projectile-foe-${profile}`, name: 'foe', hp: 30, hpMax: 30,
        ac: 10, activeFx: [], cond: [], tags: []};
      engine.setState({chars: [caster], items: [item], foes: [foe], activeCharId: caster.id});
      const before = canonical(engine.state());
      const result = engine.useItemApply(caster.inventory[0].id, caster.id, `foe:${foe.id}`,
        plain({attackMade: true, hit: true, atkRaw: 20, dmgRaw: 12, dmgTotal: 12}), use.id);
      const label = `${profile}/${item.id}/${use.id}`;
      assert.equal(result, false, label);
      assert.equal(canonical(engine.state()), before, `${label}: world mutation`);
      assert.deepEqual(plain(engine.audit()), {phase: 'rejected', itemId: item.id, useId: use.id}, label);
    }
  }
  assert.equal(randomCalls, 0, 'fail-closed discovery/clone rejection must not call Math.random');
});

test('private Arrow runtime requires four ordered distinct living targets and commits standard MAIN H/H/H/H once', async () => {
  const world = await arrowRuntimeWorld();
  const {engine, shooter, ally, foes, arrowEntry, weaponEntry, useId, randomCalls, randomStacks} = world;
  await arrowRuntimePrepare(world);
  assert.equal(engine.combatStart([
    {kind: 'ally', id: shooter.id, nat: 20},
    {kind: 'foe', id: foes[0].id, nat: 1},
  ], 'Arrow certificate standard MAIN'), true);
  await arrowRuntimeQuiesce(world);
  const turn = engine.state().combat.turn;
  const inventoryRef = shooter.inventory;
  const arrowRef = arrowEntry;
  const weaponRef = weaponEntry;
  const turnRef = turn;
  const randomBefore = randomCalls();
  assert.equal(engine.combatUseItem(arrowEntry.id, useId), true,
    JSON.stringify({audit: engine.bg3ItemArrowAudit(), error: engine.elementText('castErr')}));

  engine.setElementValue('castTarget', `ally:${ally.id}`);
  engine.setElementValue('castWeapon', weaponEntry.id);
  engine.setElementValue('castBg3ArrowExtra1', `foe:${foes[0].id}`);
  engine.setElementValue('castBg3ArrowExtra2', `foe:${foes[0].id}`);
  engine.setElementValue('castBg3ArrowExtra3', `foe:${foes[2].id}`);
  const beforeDuplicate = plain({shooter, ally, foes, turn, qty: arrowEntry.qty});
  assert.equal(engine.castConfirm(), false, 'a duplicate ricochet target is rejected before proof');
  assert.equal(engine.bg3ItemArrowAudit().reason, 'private-item-arrow-four-distinct-targets-required');
  assert.deepEqual(plain({shooter, ally, foes, turn, qty: arrowEntry.qty}), beforeDuplicate);

  const {args, audit, targetOrder} = arrowRuntimeEnterFour(world, {damage: [6, 6, 6, 6]});
  assert.ok(args, 'four entered shot receipts produce one opaque master carrier');
  assert.equal(audit.phase, 'proof-issued');
  assert.equal(audit.commitEnabled, true);
  assert.equal(audit.outcomePattern, 'H/H/H/H');
  assert.deepEqual(Array.from(audit.receipts, row => row.target), targetOrder);
  assert.deepEqual(Array.from(audit.receipts, row => row.damageScale), ['1/1', '1/2', '1/2', '1/2']);
  assert.deepEqual(Array.from(audit.receipts, row => row.artifact),
    ['rules/spells/1e.json', 'rules/spells/f0.json', 'rules/spells/c4.json', 'rules/spells/23.json']);
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);

  const used = engine.bg3ItemArrowAudit();
  assert.equal(used.phase, 'used');
  assert.equal(used.resourceTransactions, 1);
  assert.deepEqual(plain(used.outcomes), targetOrder.map((target, order) =>
    ({order, target, hit: true, damage: order ? 3 : 6})));
  assert.equal(shooter.inventory, inventoryRef);
  assert.equal(arrowEntry, arrowRef);
  assert.equal(weaponEntry, weaponRef);
  assert.equal(turn, turnRef);
  assert.equal(arrowEntry.qty, 1, 'qty>1 Arrow stack loses exactly one item');
  assert.equal(weaponEntry.qty, 1, 'the selected ordinary weapon is not ammunition');
  assert.equal(turn.actionsUsed, 1);
  assert.equal(turn.actionUsed, true);
  assert.equal(turn.bonusUsed, false);
  assert.equal(ally.hp, 14, 'primary ally takes the full entered weapon damage');
  assert.deepEqual(foes.map(foe => foe.hp), [27, 27, 27], 'each ordered extra takes floor(6/2)');
  assert.equal(randomCalls(), randomBefore,
    `standard MAIN runtime must never roll\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('private Arrow runtime continues after misses and commits honour OFF_HAND M/H/M/H against bonus only', async () => {
  const world = await arrowRuntimeWorld({
    profile: 'honour', weaponItemId: 'it_ручной_арбалет', equipmentSlot: 'OFF_HAND',
  });
  const {engine, shooter, ally, foes, arrowEntry, weaponEntry, useId, randomCalls, randomStacks} = world;
  await arrowRuntimePrepare(world);
  assert.equal(engine.combatStart([
    {kind: 'ally', id: shooter.id, nat: 20},
    {kind: 'foe', id: foes[0].id, nat: 1},
  ], 'Arrow certificate honour OFF_HAND'), true);
  await arrowRuntimeQuiesce(world);
  const turn = engine.state().combat.turn;
  turn.actionMax = 1;
  turn.actionsUsed = 1;
  turn.actionUsed = true;
  turn.bonusUsed = false;
  const randomBefore = randomCalls();
  assert.equal(engine.combatUseItem(arrowEntry.id, useId), true);
  const {args, audit, targetOrder} = arrowRuntimeEnterFour(world, {
    naturals: [1, 20, 1, 20], damage: [null, 12, null, 12],
  });
  assert.ok(args);
  assert.equal(audit.outcomePattern, 'M/H/M/H');
  assert.deepEqual(Array.from(audit.receipts, row => row.target), targetOrder,
    'every miss still advances the exact f0→c4→23 spawn chain');
  assert.deepEqual(plain(audit.weapon), {
    entryId: weaponEntry.id, itemId: weaponEntry.itemId, slot: 'offhand', offhand: true, cost: 'bonus',
  });
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);
  const used = engine.bg3ItemArrowAudit();
  assert.equal(used.phase, 'used');
  assert.equal(used.resourceTransactions, 1);
  assert.deepEqual(plain(used.outcomes), targetOrder.map((target, order) => ({
    order, target, hit: order === 1 || order === 3, damage: order === 1 || order === 3 ? 6 : 0,
  })));
  assert.equal(arrowEntry.qty, 1);
  assert.equal(weaponEntry.qty, 1);
  assert.equal(turn.actionsUsed, 1, 'offhand Arrow charges no main action and children charge nothing');
  assert.equal(turn.actionUsed, true);
  assert.equal(turn.bonusUsed, true, 'one bonus action pays the entire four-projectile action');
  assert.equal(ally.hp, 20);
  assert.deepEqual(foes.map(foe => foe.hp), [24, 30, 24]);
  assert.equal(randomCalls(), randomBefore,
    `honour OFF_HAND runtime must never roll\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('private Arrow receipts reject proofless calls, detached clones, argument tamper and stale targets atomically', async () => {
  const world = await arrowRuntimeWorld();
  const {engine, shooter, ally, foes, arrowEntry, useId, randomCalls, randomStacks} = world;
  await arrowRuntimePrepare(world);
  assert.equal(engine.combatStart([
    {kind: 'ally', id: shooter.id, nat: 20},
    {kind: 'foe', id: foes[0].id, nat: 1},
  ], 'Arrow certificate proof authority'), true);
  await arrowRuntimeQuiesce(world);
  const turn = engine.state().combat.turn;
  const initial = plain({shooter, ally, foes, turn, qty: arrowEntry.qty});
  const randomBefore = randomCalls();
  assert.equal(engine.useItemApply(arrowEntry.id, shooter.id, `ally:${ally.id}`,
    {attackMade: true, hit: true, atkRaw: 20, dmgRaw: 999, dmgTotal: 999}, useId,
    {projectileWeaponEntryId: 'forged-public-weapon'}), false, 'public rolls are not authority');
  assert.equal(engine.bg3ItemArrowAudit().reason, 'private-item-arrow-private-receipts-required');
  assert.deepEqual(plain({shooter, ally, foes, turn, qty: arrowEntry.qty}), initial);

  assert.equal(engine.combatUseItem(arrowEntry.id, useId), true);
  const {args, audit} = arrowRuntimeEnterFour(world, {damage: [6, 6, 6, 6]});
  assert.ok(args);
  assert.equal(audit.receiptCount, 4);
  for (const receipt of audit.receipts) {
    assert.match(receipt.enteredSha256, /^[0-9a-f]{64}$/);
    assert.match(receipt.outcomeSha256, /^[0-9a-f]{64}$/);
    assert.match(receipt.baseRollSha256, /^[0-9a-f]{64}$/);
  }
  const beforeProofAttacks = plain({shooter, ally, foes, turn, qty: arrowEntry.qty});
  const detachedArgs = args.slice();
  detachedArgs[3] = Object.assign({}, args[3]);
  assert.equal(engine.bg3ItemFormulaApplyArgs(detachedArgs), false, 'a carrier clone has no WeakMap authority');
  const tamperedArgs = args.slice();
  tamperedArgs[2] = `foe:${foes[0].id}`;
  assert.equal(engine.bg3ItemFormulaApplyArgs(tamperedArgs), false, 'public target argument cannot reorder receipts');
  ally.hp--;
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false, 'stale target state rejects before payment');
  ally.hp++;
  assert.deepEqual(plain({shooter, ally, foes, turn, qty: arrowEntry.qty}), beforeProofAttacks,
    'clone, argument tamper and restored stale-state rejection mutate nothing');
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true, 'the authentic restored proof remains retryable');
  const committed = plain({shooter, ally, foes, turn, qty: arrowEntry.qty});
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false, 'successful proof is terminal on replay');
  assert.equal(engine.bg3ItemArrowAudit().phase, 'replay-rejected');
  assert.deepEqual(plain({shooter, ally, foes, turn, qty: arrowEntry.qty}), committed);
  assert.equal(randomCalls(), randomBefore,
    `proof rejection and authentic commit must never roll\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('qty1 Arrow late failure restores every identity, retries the same proof once, then rejects replay', async () => {
  const world = await arrowRuntimeWorld({qty: 1});
  const {engine, shooter, ally, foes, arrowEntry, weaponEntry, useId, randomCalls, randomStacks} = world;
  await arrowRuntimePrepare(world);
  assert.equal(engine.combatStart([
    {kind: 'ally', id: shooter.id, nat: 20},
    {kind: 'foe', id: foes[0].id, nat: 1},
  ], 'Arrow certificate rollback retry replay'), true);
  await arrowRuntimeQuiesce(world);
  const randomBefore = randomCalls();
  assert.equal(engine.combatUseItem(arrowEntry.id, useId), true);
  const {args, targetOrder} = arrowRuntimeEnterFour(world, {damage: [6, 6, 6, 6]});
  const state = engine.state();
  const equipmentKeys = Reflect.ownKeys(shooter.equipment);
  const equipmentDescriptors = Object.getOwnPropertyDescriptors(shooter.equipment);
  const refs = {
    chars: state.chars, foes: state.foesDB, combat: state.combat, order: state.combat.order,
    turn: state.combat.turn, inventory: shooter.inventory, equipment: shooter.equipment,
    arrow: arrowEntry, weapon: weaponEntry,
    active: [shooter.activeFx, ally.activeFx, ...foes.map(foe => foe.activeFx)],
  };
  const before = plain({chars: state.chars, foes: state.foesDB, combat: state.combat});
  const probe = engine.bg3ItemArrowTestInjectLateFailureOnce();
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false);
  assert.equal(probe.hits(), 1);
  assert.deepEqual(plain(probe.observed()), {
    qty: 0, actionsUsed: 1, actionUsed: true, bonusUsed: false, hp: [14, 27, 27, 27],
  }, 'injected failure observes the fully applied transaction before rollback');
  let audit = engine.bg3ItemArrowAudit();
  assert.equal(audit.phase, 'rolled-back');
  assert.equal(audit.resourceTransactions, 0);
  assert.deepEqual(plain(audit.outcomes), targetOrder.map((target, order) =>
    ({order, target, hit: true, damage: order ? 3 : 6})));
  assert.deepEqual(plain({chars: state.chars, foes: state.foesDB, combat: state.combat}), before);
  assert.equal(state.chars, refs.chars);
  assert.equal(state.foesDB, refs.foes);
  assert.equal(state.combat, refs.combat);
  assert.equal(state.combat.order, refs.order);
  assert.equal(state.combat.turn, refs.turn);
  assert.equal(shooter.inventory, refs.inventory);
  assert.equal(shooter.equipment, refs.equipment);
  assert.equal(shooter.inventory[0], refs.arrow);
  assert.equal(shooter.inventory[1], refs.weapon);
  assert.equal(arrowEntry.qty, 1);
  assert.deepEqual(Reflect.ownKeys(shooter.equipment), equipmentKeys);
  assert.deepEqual(Object.getOwnPropertyDescriptors(shooter.equipment), equipmentDescriptors);
  assert.deepEqual([shooter.activeFx, ally.activeFx, ...foes.map(foe => foe.activeFx)], refs.active);

  assert.equal(engine.bg3ItemFormulaApplyArgs(args), true, 'the exact rolled-back qty1 proof retries once');
  assert.equal(engine.bg3ItemArrowAudit().phase, 'used');
  assert.equal(shooter.inventory, refs.inventory);
  assert.equal(shooter.inventory.length, 1);
  assert.equal(shooter.inventory[0], refs.weapon);
  assert.equal(shooter.inventory.includes(refs.arrow), false);
  assert.equal(shooter.equipment, refs.equipment);
  assert.deepEqual(Reflect.ownKeys(shooter.equipment), equipmentKeys);
  assert.deepEqual(Object.getOwnPropertyDescriptors(shooter.equipment), equipmentDescriptors);
  const committed = plain({chars: state.chars, foes: state.foesDB, combat: state.combat});
  assert.equal(engine.bg3ItemFormulaApplyArgs(args), false);
  audit = engine.bg3ItemArrowAudit();
  assert.equal(audit.phase, 'replay-rejected');
  assert.equal(audit.resourceTransactions, 0);
  assert.deepEqual(plain({chars: state.chars, foes: state.foesDB, combat: state.combat}), committed);
  assert.equal(randomCalls(), randomBefore,
    `rollback, retry and replay must never roll\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('Arrow hazards, temporary HP and weapon functors fail prepay while presentation failure cannot undo a commit', async () => {
  {
    const world = await arrowRuntimeWorld();
    const {engine, shooter, ally, foes, arrowEntry, weaponEntry, useId, randomCalls, randomStacks} = world;
    await arrowRuntimePrepare(world);
    shooter.activeFx = [{uid: 'certificate-break-on-attack', breakOn: 'attack,spell'}];
    const before = plain({shooter, ally, foes, qty: arrowEntry.qty});
    assert.equal(await engine.bg3ItemProgramOpen(arrowEntry.id, shooter.id, useId), true);
    engine.setElementValue('castTarget', `ally:${ally.id}`);
    engine.setElementValue('castWeapon', weaponEntry.id);
    for (let index = 0; index < 3; index++) {
      engine.setElementValue(`castBg3ArrowExtra${index + 1}`, `foe:${foes[index].id}`);
    }
    assert.equal(engine.castConfirm(), false);
    assert.equal(engine.bg3ItemArrowAudit().reason, 'private-item-arrow-attack-trigger-removal-fail-closed');
    assert.equal(engine.bg3ItemArrowAudit().resourceTransactions, 0);
    assert.deepEqual(plain({shooter, ally, foes, qty: arrowEntry.qty}), before);
    assert.equal(randomCalls(), 0, `attack-removal hazard never rolls\n${randomStacks.join('\n---\n')}`);
  }

  {
    const world = await arrowRuntimeWorld();
    const {engine, shooter, ally, foes, arrowEntry, weaponEntry, weapon, useId, randomCalls} = world;
    await arrowRuntimePrepare(world);
    weapon.mechanics.actions = [{op: 'executeWeaponFunctors'}];
    const before = plain({shooter, ally, foes, qty: arrowEntry.qty});
    assert.equal(await engine.bg3ItemProgramOpen(arrowEntry.id, shooter.id, useId), true);
    engine.setElementValue('castTarget', `ally:${ally.id}`);
    engine.setElementValue('castWeapon', weaponEntry.id);
    for (let index = 0; index < 3; index++) {
      engine.setElementValue(`castBg3ArrowExtra${index + 1}`, `foe:${foes[index].id}`);
    }
    assert.equal(engine.castConfirm(), true);
    engine.castDistanceSet('far');
    assert.equal(engine.castState().spec, null);
    assert.match(engine.elementText('castErr'), /private-item-arrow-weapon-resource-functor-semantics-fail-closed/);
    assert.equal(engine.bg3ItemArrowAudit().receiptCount, 0);
    assert.deepEqual(plain({shooter, ally, foes, qty: arrowEntry.qty}), before);
    assert.equal(randomCalls(), 0);
  }

  {
    const world = await arrowRuntimeWorld();
    const {engine, shooter, ally, foes, arrowEntry, useId, randomCalls, randomStacks} = world;
    await arrowRuntimePrepare(world);
    ally.hpTemp = 1;
    assert.equal(engine.combatStart([
      {kind: 'ally', id: shooter.id, nat: 20},
      {kind: 'foe', id: foes[0].id, nat: 1},
    ], 'Arrow certificate temporary HP'), true);
    await arrowRuntimeQuiesce(world);
    const before = plain({shooter, ally, foes, combat: engine.state().combat, qty: arrowEntry.qty});
    const randomBefore = randomCalls();
    assert.equal(engine.combatUseItem(arrowEntry.id, useId), true);
    const result = arrowRuntimeEnterFour(world, {damage: [6, 6, 6, 6]});
    assert.equal(result.args, null);
    assert.equal(engine.bg3ItemArrowAudit().reason, 'private-item-arrow-temporary-hit-points-fail-closed');
    assert.equal(engine.bg3ItemArrowAudit().resourceTransactions, 0);
    assert.deepEqual(plain({shooter, ally, foes, combat: engine.state().combat, qty: arrowEntry.qty}), before);
    assert.equal(randomCalls(), randomBefore,
      `temporary-HP rejection never rolls\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
  }

  {
    const world = await arrowRuntimeWorld();
    const {engine, shooter, ally, foes, arrowEntry, useId, randomCalls, randomStacks} = world;
    await arrowRuntimePrepare(world);
    assert.equal(engine.combatStart([
      {kind: 'ally', id: shooter.id, nat: 20},
      {kind: 'foe', id: foes[0].id, nat: 1},
    ], 'Arrow certificate presentation failure'), true);
    await arrowRuntimeQuiesce(world);
    const randomBefore = randomCalls();
    assert.equal(engine.combatUseItem(arrowEntry.id, useId), true);
    const {args} = arrowRuntimeEnterFour(world, {damage: [6, 6, 6, 6]});
    const probe = engine.bg3ItemArrowTestInjectPresentationFailureOnce();
    assert.equal(engine.bg3ItemFormulaApplyArgs(args), true);
    const committed = plain({
      qty: arrowEntry.qty, allyHp: ally.hp, foeHp: foes.map(foe => foe.hp),
      actionsUsed: engine.state().combat.turn.actionsUsed,
      actionUsed: engine.state().combat.turn.actionUsed,
      bonusUsed: engine.state().combat.turn.bonusUsed,
    });
    assert.equal(engine.bg3ItemArrowAudit().phase, 'used');
    assert.equal(engine.bg3ItemArrowAudit().resourceTransactions, 1);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(probe.hits(), 1);
    assert.equal(engine.bg3ItemFormulaApplyArgs(args), false);
    assert.equal(engine.bg3ItemArrowAudit().phase, 'replay-rejected');
    assert.deepEqual(plain({
      qty: arrowEntry.qty, allyHp: ally.hp, foeHp: foes.map(foe => foe.hp),
      actionsUsed: engine.state().combat.turn.actionsUsed,
      actionUsed: engine.state().combat.turn.actionUsed,
      bonusUsed: engine.state().combat.turn.bonusUsed,
    }), committed, 'deferred presentation is outside the burned atomic transaction');
    assert.equal(randomCalls(), randomBefore,
      `presentation failure and replay never roll\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
  }
});

test('private capability is pinned to two Arrow rows while all other 60 carriers remain fail closed', () => {
  const admitted = itemCarriers.filter(row => row.item.id === ARROW.itemId
    && row.use.program?.projectile?.extraProjectiles);
  const closed = itemCarriers.filter(row => row.item.id !== ARROW.itemId);
  assert.deepEqual(admitted.map(row => [row.profile, row.use.id]).sort(), [
    ['honour', ARROW.useIds.honour],
    ['standard', ARROW.useIds.standard],
  ]);
  assert.equal(closed.length, 60);
  assert.equal(closed.every(row => !row.use.program?.projectile?.extraProjectiles), true);
  const chainLightning = closed.filter(row =>
    row.use.program.projection.entrypoints[0].bg3Id === 'Projectile_ChainLightning');
  assert.equal(chainLightning.length, 2);
  assert.deepEqual(new Set(chainLightning.map(row => row.profile)), new Set(PROFILES));

  let randomCalls = 0;
  const engine = loadFailClosedEngine(() => { randomCalls++; return 0.5; });
  for (const profile of PROFILES) {
    assert.equal(engine.bg3CatalogUseRefs([{id: 'bg3', version: current.catalogVersion, profile,
      manifestSha256: current.manifestSha256}]), true);
    for (const row of closed.filter(carrier => carrier.profile === profile)) {
      const item = plain(row.item);
      const use = effectiveMechanics(item, profile).actions.find(action => action.id === row.use.id);
      use.publicPlan = plain({ok: true, projectile: use.program?.projectile || null});
      use.program.publicCompiledPlan = plain({ok: true,
        extraProjectiles: use.program?.projectile?.extraProjectiles || null});
      const caster = actor(`closed-carrier-${profile}`, item.id);
      const foe = {id: `closed-carrier-foe-${profile}`, name: 'foe', hp: 30, hpMax: 30,
        ac: 10, activeFx: [], cond: [], tags: []};
      engine.setState({chars: [caster], items: [item], foes: [foe], activeCharId: caster.id});
      const before = canonical(engine.state());
      assert.equal(engine.useItemApply(caster.inventory[0].id, caster.id, `foe:${foe.id}`,
        plain({attackMade: true, hit: true, atkRaw: 20, dmgRaw: 12, dmgTotal: 12}), use.id), false,
      `${profile}/${item.id}/${use.id}`);
      assert.equal(canonical(engine.state()), before, `${profile}/${item.id}/${use.id}: mutation`);
      assert.deepEqual(plain(engine.audit()), {phase: 'rejected', itemId: item.id, useId: use.id});
    }
  }
  assert.equal(randomCalls, 0, 'all 60 unbounded carrier rejections avoid Math.random');
});

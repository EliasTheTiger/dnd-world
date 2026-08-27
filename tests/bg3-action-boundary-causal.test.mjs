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
 * Manifest-driven causal boundary audit for every effective BG3 item action.
 *
 * The test boots the production catalog loader and calls the production
 * compile/open/preflight/commit routes.  It never fabricates a program, never
 * falls back to localized prose, and makes Math.random fatal.  Successful
 * formula probes use only the minimum deterministic values admitted by the
 * complete production roll specification. Publicly derived previews and roll
 * carriers are rejection probes only; a supported healing source can succeed
 * solely through the real Open -> Show -> entered values -> Confirm route.
 * All other formula branches remain explicit fail-closed observations.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = selectBg3Catalog(repo);
const {current, manifest} = selected;
const catalogRoot = path.join(repo, 'data', 'bg3', current.catalogVersion);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadRows(group, key) {
  return (manifest.files[group] || []).flatMap(meta => {
    const payload = readJson(repoFile(meta.path));
    assert.equal(payload.catalogVersion, current.catalogVersion, meta.path);
    assert.equal(payload.count, payload[key].length, meta.path);
    return payload[key];
  });
}

function effectiveMechanics(item, profile) {
  if (profile === 'honour' && item.source?.honourOverlay?.item?.mechanics) {
    return item.source.honourOverlay.item.mechanics;
  }
  return item.mechanics;
}

function catalogArtifact(descriptor) {
  return path.relative(catalogRoot, repoFile(descriptor.path)).split(path.sep).join('/');
}

function opcodeRows(value, out = []) {
  if (Array.isArray(value)) {
    for (const row of value) opcodeRows(row, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (typeof value.op === 'string') out.push(value);
  for (const child of Object.values(value)) opcodeRows(child, out);
  return out;
}

function predicateRows(value, name, out = []) {
  if (Array.isArray(value)) {
    for (const row of value) predicateRows(row, name, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.kind === 'predicate' && value.name === name) out.push(value);
  for (const child of Object.values(value)) predicateRows(child, name, out);
  return out;
}

/*
 * This census follows source identities, not labels: item action -> projection
 * reference -> exact profile program -> selected fields -> recursive opcode
 * tree.  It deliberately mirrors the transparent census in the dedicated
 * summon certificate while remaining local to the exhaustive action harness.
 */
const ruleProgramsById = new Map();
for (const descriptor of manifest.files.rules || []) {
  const payload = readJson(repoFile(descriptor.path));
  const artifact = catalogArtifact(descriptor);
  for (const rule of payload.rules || []) for (const profile of ['standard', 'honour']) {
    const program = rule.programs?.[profile];
    if (!program) continue;
    const rows = ruleProgramsById.get(program.id) || [];
    rows.push({artifact, rule, profile, program});
    ruleProgramsById.set(program.id, rows);
  }
}

const ARROW_MANY_TARGETS_ITEM_ID = 'bg3:item:rt:b11b3f7f-d8ec-41db-93b9-24474aea31e3:stats:T0JKX0Fycm93T2ZSaWNvY2hldA';
const ARROW_MANY_TARGETS_PROFILES = Object.freeze({
  standard: Object.freeze({
    useId: 'bg3-use-62c1be5dbf88a75b409d',
    rootId: `${ARROW_MANY_TARGETS_ITEM_ID}:root-action:standard:OnUsePeaceActions:0`,
    descriptorSha256: '3bfe3614b05346d131ad5f9e2cd68620253dcdba25c63584751d09812def68f9',
  }),
  honour: Object.freeze({
    useId: 'bg3-use-5fb50274ac0a36164c47',
    rootId: `${ARROW_MANY_TARGETS_ITEM_ID}:root-action:honour:OnUsePeaceActions:0`,
    descriptorSha256: 'e74326df1cad88f5a41681ae134bbf26dce54664893769eb7bfe0a2a22f2c90a',
  }),
});
const ARROW_MANY_TARGETS_CHAIN = Object.freeze([
  Object.freeze({
    ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXQ',
    bg3Id: 'Projectile_ArrowOfRicochet', artifact: 'rules/spells/1e.json',
  }),
  Object.freeze({
    ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXRfUmljb2NoZXQ',
    bg3Id: 'Projectile_ArrowOfRicochet_Ricochet', artifact: 'rules/spells/f0.json',
  }),
  Object.freeze({
    ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXRfUmljb2NoZXRfMg',
    bg3Id: 'Projectile_ArrowOfRicochet_Ricochet_2', artifact: 'rules/spells/c4.json',
  }),
  Object.freeze({
    ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BcnJvd09mUmljb2NoZXRfUmljb2NoZXRfMw',
    bg3Id: 'Projectile_ArrowOfRicochet_Ricochet_3', artifact: 'rules/spells/23.json',
  }),
]);

const DETHRONE_ITEM_ID = 'bg3:item:rt:b2e1168a-021d-4a81-a041-6d2e1421a1fb:stats:VU5JX0xPV19EZXRocm9uZVNjcm9sbA';
const DETHRONE_SPELL_ID = 'Projectile_CursedTome_Dethrone';
const DETHRONE_RULE_ID = 'bg3:rule:spell:UHJvamVjdGlsZV9DdXJzZWRUb21lX0RldGhyb25l';
const DETHRONE_ROOT_ARTIFACT = 'root-template-programs/13-0000.json';
const DETHRONE_RULE_ARTIFACT = 'rules/spells/fd.json';
const DETHRONE_PROFILES = Object.freeze({
  standard: Object.freeze({
    useId: 'bg3-use-bdd6d926d0d92df10d58',
    useSha256: 'e78194250744beb2da3c61444d2593f535b45f8ed9fe915b80a4a26281a3d182',
    useProgramSha256: '3727cd9a3a58f297cdbe6ec0ed9da48e48dcee2e68a624c96a63d460c3c9dec0',
    rootSha256: '8dd34ff7c54de712d7fbcea088813a738fae430046d78d1210f721510480a5ab',
    ruleProgramSha256: '3c86286f3b31fc9cd82daf57ce5738a0321324500b3583b3026c5c027868bd65',
    projectionSha256: 'b3b9e35b3d03221bce04f264372257804d1d0134cc135a9055fdcc9ad4e04a8a',
  }),
  honour: Object.freeze({
    useId: 'bg3-use-526fe62a5fb66d7b83d1',
    useSha256: 'f00d1599423c7b11bf488cab63661d858b1c5d160b44fb63cd1fa8f753d3493c',
    useProgramSha256: '42a001a0aabefeaccdda334ae9a7ea864b0b4f7e26b29a714842f155fd5c22d7',
    rootSha256: '251e94242d311222eeb84e768a2e17993e717fde43982baa4ac186d6cdd37451',
    ruleProgramSha256: '057823e0dce868631ca710c028c689fdddb7811c70791331bae4dcd0cdb84274',
    projectionSha256: '5bcb8b7ec56e570db0301cc9f1f761aeacc8e57e74ec4c5a2767a866d665d1ef',
  }),
});
const dethroneRootPayload = readJson(path.join(catalogRoot, ...DETHRONE_ROOT_ARTIFACT.split('/')));

function dethroneSourceContract(item, use, profile) {
  const expected = DETHRONE_PROFILES[profile];
  if (!expected || item?.id !== DETHRONE_ITEM_ID || use?.id !== expected.useId) return null;
  const program = use.program || {};
  const projection = program.projection || {};
  const source = program.sourceAction?.primary;
  const attributes = source?.attributes || {};
  const expectedRootId = `${DETHRONE_ITEM_ID}:root-action:${profile}:OnUsePeaceActions:0`;
  const expectedProgramId = `${DETHRONE_RULE_ID}:program:${profile}`;
  const roots = (dethroneRootPayload.programs || []).filter(row => row.id === expectedRootId);
  const records = (ruleProgramsById.get(expectedProgramId) || []).filter(record =>
    record.profile === profile && record.artifact === DETHRONE_RULE_ARTIFACT
      && record.rule?.id === DETHRONE_RULE_ID && record.rule?.bg3Id === DETHRONE_SPELL_ID);
  const root = roots.length === 1 ? roots[0] : null;
  const record = records.length === 1 ? records[0] : null;
  const ruleProgram = record?.program || null;
  const field = name => (ruleProgram?.fields || []).find(row => row.field === name) || null;
  const entrypoints = projection.entrypoints || [];
  const entry = entrypoints[0];
  const guard = root?.validation?.[0];
  const commit = root?.commit?.[0];
  const invoke = root?.consequences?.[0];
  const contractOk = item.source?.statsId === 'UNI_LOW_DethroneScroll'
    && item.source?.rootTemplateUuid === 'b2e1168a-021d-4a81-a041-6d2e1421a1fb'
    && use.handler === 'bg3RuleProgram' && use.cost === 'action' && use.target === 'creature'
    && use.rollPolicy === 'player-input-required' && use.consume?.kind === 'item' && +use.consume.amount === 1
    && program.id === expectedRootId && program.sourceProfile === profile
    && program.rootArtifact === DETHRONE_ROOT_ARTIFACT && program.mode === 'typed'
    && program.commitPolicy === 'item-action-contract-once'
    && program.ruleProgramId === expectedProgramId && program.ruleSourceProfile === profile
    && program.artifact === DETHRONE_RULE_ARTIFACT
    && program.invokedRuleResourceCostPolicy === 'caller-item-action'
    && source?.actionType === 12 && source.index === 0 && source.trigger === 'OnUsePeaceActions'
    && source.rootProgramId === expectedRootId && attributes.ActionType === '12'
    && attributes.ClassId === 'a865965f-501b-46e9-9eaa-7748e8c04d09'
    && attributes.Conditions === `CanUseSpellScroll("${DETHRONE_SPELL_ID}")`
    && attributes.Consume === 'True' && attributes.SkillID === DETHRONE_SPELL_ID
    && projection.schemaVersion === 'bg3-action-rule-projection/1'
    && projection.sourceProfile === profile && projection.context === 'generic'
    && projection.mode === 'typed' && projection.complete === true
    && projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && entrypoints.length === 1 && entry?.kind === 'spell' && entry.ruleId === DETHRONE_RULE_ID
    && entry.bg3Id === DETHRONE_SPELL_ID && entry.programId === expectedProgramId
    && entry.artifact === DETHRONE_RULE_ARTIFACT && entry.sourceProfile === profile && entry.mode === 'typed'
    && Array.isArray(projection.transitive) && projection.transitive.length === 0
    && Array.isArray(projection.bg3LifecycleBindings) && projection.bg3LifecycleBindings.length === 0
    && Array.isArray(projection.bg3StatusPassiveBindings) && projection.bg3StatusPassiveBindings.length === 0
    && Array.isArray(projection.unresolved) && projection.unresolved.length === 0
    && root?.sourceProfile === profile && root.sourceRootTemplateUuid === 'b2e1168a-021d-4a81-a041-6d2e1421a1fb'
    && root.actionType === 12 && root.trigger === 'OnUsePeaceActions' && root.mode === 'typed'
    && root.validation?.length === 1 && guard?.op === 'guard' && guard.executable === true
    && guard.condition?.name === 'CanUseSpellScroll' && guard.condition?.args?.length === 1
    && guard.condition.args[0]?.kind === 'string' && guard.condition.args[0]?.value === DETHRONE_SPELL_ID
    && root.commit?.length === 1 && commit?.op === 'commitFromItemAction' && commit.executable === true
    && commit.binding?.cost === 'action' && commit.binding?.consume?.kind === 'item'
    && +commit.binding.consume.amount === 1
    && root.consequences?.length === 1 && invoke?.op === 'invokeRuleProgram'
    && invoke.programId === expectedProgramId && invoke.artifact === DETHRONE_RULE_ARTIFACT
    && invoke.resourceCostPolicy === 'caller-item-action'
    && ruleProgram?.id === expectedProgramId && ruleProgram.sourceProfile === profile
    && ruleProgram.mode === 'typed' && field('TargetConditions')?.raw === 'Character()'
    && field('SpellRoll')?.raw === 'not SavingThrow(Ability.Constitution, 18)'
    && field('SpellSuccess')?.raw === 'DealDamage(10d6+20,Necrotic,Magical)'
    && field('SpellFail')?.raw === 'DealDamage((10d6+20)/2,Necrotic,Magical)'
    && field('UseCosts')?.raw === 'ActionPoint:1;SpellSlotsGroup:1:1:5'
    && record?.rule?.properties?.Level === '5' && record.rule.properties.TargetRadius === '30'
    && record.rule.properties.ProjectileCount === '1' && record.rule.properties.AmountOfTargets === ''
    && sha256(canonicalJson(use)) === expected.useSha256
    && sha256(canonicalJson(program)) === expected.useProgramSha256
    && sha256(canonicalJson(root)) === expected.rootSha256
    && sha256(canonicalJson(ruleProgram)) === expected.ruleProgramSha256
    && sha256(canonicalJson(projection)) === expected.projectionSha256;
  return {
    contractOk, runtimeAllowed: contractOk, itemId: item.id, useId: use.id, profile,
    spellId: DETHRONE_SPELL_ID, ruleId: DETHRONE_RULE_ID, programId: expectedProgramId,
    rootId: expectedRootId, rootArtifact: DETHRONE_ROOT_ARTIFACT, ruleArtifact: DETHRONE_RULE_ARTIFACT,
    useSha256: sha256(canonicalJson(use)), useProgramSha256: sha256(canonicalJson(program)),
    rootSha256: sha256(canonicalJson(root)), ruleProgramSha256: sha256(canonicalJson(ruleProgram)),
    projectionSha256: sha256(canonicalJson(projection)), targetDistanceM: 30, saveAbility: 'con',
    saveDc: 18, entered10d6: 40, damage: 60, damageType: 'Necrotic', magical: true,
    consumeAmount: 1, cost: 'action', spellLevel: 5,
  };
}

function arrowManyTargetsSourceContract(item, use, profile) {
  const expected = ARROW_MANY_TARGETS_PROFILES[profile];
  if (!expected || item?.id !== ARROW_MANY_TARGETS_ITEM_ID || use?.id !== expected.useId) return null;
  const program = use.program || {};
  const source = program.sourceAction?.primary;
  const attributes = source?.attributes || {};
  const projection = program.projection || {};
  const projectile = program.projectile || {};
  const extra = projectile.extraProjectiles || {};
  const descriptorSha256 = sha256(canonicalJson(extra));
  const refs = [...(projection.entrypoints || []), ...(projection.transitive || [])];
  const exactChain = refs.length === ARROW_MANY_TARGETS_CHAIN.length
    && refs.every((ref, index) => {
      const pin = ARROW_MANY_TARGETS_CHAIN[index];
      return ref?.kind === 'spell' && ref.ruleId === pin.ruleId && ref.bg3Id === pin.bg3Id
        && ref.programId === `${pin.ruleId}:program:${profile}` && ref.artifact === pin.artifact
        && ref.sourceProfile === profile && ref.mode === 'typed';
    });
  const contractOk = use.handler === 'bg3RuleProgram' && use.cost === 'action' && use.target === 'any'
    && use.rollPolicy === 'player-input-required' && use.consume?.kind === 'item' && +use.consume.amount === 1
    && program.id === expected.rootId && program.sourceProfile === profile
    && program.rootArtifact === 'root-template-programs/04-0000.json' && program.mode === 'typed'
    && program.commitPolicy === 'item-action-contract-once'
    && program.ruleProgramId === `${ARROW_MANY_TARGETS_CHAIN[0].ruleId}:program:${profile}`
    && program.ruleSourceProfile === profile && program.artifact === ARROW_MANY_TARGETS_CHAIN[0].artifact
    && program.invokedRuleResourceCostPolicy === 'caller-item-action'
    && source?.actionType === 12 && source.index === 0 && source.trigger === 'OnUsePeaceActions'
    && source.rootProgramId === expected.rootId && attributes.ActionType === '12'
    && attributes.Animation === '' && attributes.Consume === 'True'
    && attributes.SkillID === ARROW_MANY_TARGETS_CHAIN[0].bg3Id
    && projection.schemaVersion === 'bg3-action-rule-projection/1'
    && projection.sourceProfile === profile && projection.context === 'ammunition'
    && projection.mode === 'typed' && projection.complete === true
    && projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && Array.isArray(projection.unresolved) && projection.unresolved.length === 0 && exactChain
    && projectile.schemaVersion === 'bg3-projectile-action/1' && projectile.kind === 'ammunition'
    && projectile.spellId === ARROW_MANY_TARGETS_CHAIN[0].bg3Id
    && projectile.programId === `${ARROW_MANY_TARGETS_CHAIN[0].ruleId}:program:${profile}`
    && projectile.sourceProfile === profile && projectile.artifact === ARROW_MANY_TARGETS_CHAIN[0].artifact
    && projectile.attack === 'ranged-weapon' && projectile.baseWeaponDamage === 'once'
    && projectile.executeWeaponFunctors === 'once' && projectile.consumeOnCommit === 1
    && projectile.offhandPolicy === 'alternative' && projectile.offhandCost === 'bonus'
    && projectile.extraProjectilePolicy === 'explicit-target-selection'
    && extra.schemaVersion === 'bg3-extra-projectiles/1'
    && extra.selectionMode === 'explicit-ordered-distinct-targets'
    && extra.orderPolicy === 'source-spawn-chain' && extra.targetCount === 3
    && extra.distinctTargets === true && extra.excludePrimaryTarget === true
    && extra.sourceItemConsume?.amount === 1 && extra.sourceItemConsume.cardinality === 'once-primary-commit'
    && extra.primaryAttack?.cardinality === 'once' && extra.extraAttacks?.cardinality === 'once-per-projectile'
    && Array.isArray(extra.steps) && extra.steps.length === 3
    && extra.executionPolicy === 'all-steps-exact-or-fail-closed'
    && descriptorSha256 === expected.descriptorSha256;
  return {
    contractOk, runtimeAllowed: contractOk, itemId: item.id, useId: use.id, profile,
    rootId: expected.rootId, rootArtifact: program.rootArtifact,
    descriptorSha256,
    ruleId: ARROW_MANY_TARGETS_CHAIN[0].ruleId,
    programId: `${ARROW_MANY_TARGETS_CHAIN[0].ruleId}:program:${profile}`,
    artifact: ARROW_MANY_TARGETS_CHAIN[0].artifact,
    chain: ARROW_MANY_TARGETS_CHAIN.map(row => ({...row, programId: `${row.ruleId}:program:${profile}`})),
    targetCount: 4, extraTargetCount: 3, consumeAmount: 1, primaryCost: 'action', offhandCost: 'bonus',
  };
}

function summonCarrierSourceContract(use, profile) {
  const projection = use?.program?.projection;
  const refs = [...(projection?.entrypoints || []), ...(projection?.transitive || [])];
  const sources = refs.flatMap(ref => (ruleProgramsById.get(String(ref?.programId || '')) || [])
    .filter(record => record.profile === profile)
    .map(record => {
      const wanted = new Set(ref?.fields || []);
      const fields = (record.program.fields || []).filter(field => wanted.has(String(field.field || '')));
      const opcodes = fields.flatMap(field => opcodeRows(field.bytecode || []));
      const summons = opcodes.filter(opcode => opcode.op === 'summon');
      return {ref, record, fields, opcodes, summons};
    })).filter(source => source.summons.length > 0);
  if (!sources.length) return null;

  const family = projection?.mode === 'typed' && projection.complete === true ? 'typed'
    : projection?.mode === 'mixed' && projection.complete === false ? 'mixed' : 'other';
  const playerSummons = sources.flatMap(source => source.summons
    .map(op => ({source, op})))
    .filter(row => row.op.scopePolicy === 'execute-player' && row.op.scope !== 'AI_ONLY');
  const canStandRows = sources.flatMap(source => source.fields
    .flatMap(field => predicateRows(field.bytecode || [], 'CanStand')));
  const source = sources.length === 1 ? sources[0] : null;
  const player = playerSummons.length === 1 ? playerSummons[0] : null;
  const op = player?.op || null;
  const blueprintArg = op?.args?.[0];
  const durationArg = op?.args?.[1];
  const canStandArg = canStandRows.length === 1 ? canStandRows[0]?.args?.[0] : null;
  const blueprintUuid = blueprintArg?.kind === 'string' && blueprintArg.format === 'uuid'
    ? String(blueprintArg.value || '') : '';
  const duration = durationArg?.kind === 'integer' ? +durationArg.value : null;
  const canStandTemplate = canStandArg?.kind === 'string' ? String(canStandArg.value || '') : '';
  const flags = String(source?.record?.rule?.properties?.SpellFlags || '').split(';');
  const stackArg = op?.args?.[4];
  const stackId = stackArg && ['string', 'symbol'].includes(stackArg.kind) ? String(stackArg.value || '') : '';
  const consumeKind = String(use?.consume?.kind || '');
  const consumeAmount = +use?.consume?.amount || 0;
  const spellId = String(source?.ref?.bg3Id || '');
  const contractOk = family === 'typed'
    ? use?.handler === 'bg3RuleProgram' && use?.cost === 'action'
      && use?.rollPolicy === 'player-input-required' && sources.length === 1
      && source.record.artifact === source.ref.artifact
      && source.record.program.id === source.ref.programId
      && source.record.program.sourceProfile === profile
      && source.ref.sourceProfile === profile && source.ref.mode === 'typed'
      && playerSummons.length === 1 && !!blueprintUuid && Number.isInteger(duration)
      && ['GROUND', 'AI_IGNORE'].includes(String(op?.scope || ''))
      && op?.executable === true && op?.bg3Functor === 'Summon' && op?.phase === 'consequences'
      && canStandRows.length <= 1
    : family === 'mixed' && use?.handler === 'bg3RuleProgram'
      && projection?.executionPolicy === 'all-reachable-opcodes-or-fail-closed';
  const canStandMatchesBlueprint = !canStandTemplate || canStandTemplate === blueprintUuid;

  return {
    family, contractOk, sourceCount: sources.length, playerSummonCount: playerSummons.length,
    summonOccurrenceCount: sources.reduce((sum, row) => sum + row.summons.length, 0),
    spellId, ruleId: String(source?.ref?.ruleId || ''), programId: String(source?.ref?.programId || ''),
    artifact: String(source?.record?.artifact || ''), sourceProfile: profile,
    blueprintUuid, duration, scope: String(op?.scope || ''),
    canStand: !!canStandTemplate, canStandTemplate, canStandMatchesBlueprint,
    concentration: flags.includes('IsConcentration'), stackId,
    consumeKind, consumeAmount,
    runtimeAllowed: family === 'typed' && contractOk && canStandMatchesBlueprint,
  };
}

function healingPotionSourceContract(use) {
  const program = use?.program || {};
  const source = program.sourceAction?.primary;
  const attributes = source?.attributes || {};
  const application = program.statusApplication;
  const projection = program.projection;
  return !!(use && use.handler === 'bg3RuleProgram' && use.rollPolicy === 'player-input-required'
    && use.target === 'self' && use.consume?.kind === 'item' && +use.consume.amount === 1
    && source?.actionType === 7 && source.index === 0 && source.trigger === 'OnUsePeaceActions'
    && attributes.ActionType === '7' && attributes.Conditions === '' && attributes.Consume === 'True'
    && attributes.StatsId === 'POTION_OF_HEALING' && attributes.StatusDuration === '0'
    && application?.schemaVersion === 'bg3-status-application/1' && application.statusId === 'POTION_OF_HEALING'
    && application.target === 'SELF' && application.instant === true && application.applicationKind === 'status'
    && application.sourceActionType === 7 && application.duration?.kind === 'source'
    && application.duration.value === 0 && application.duration.raw === '0'
    && projection?.schemaVersion === 'bg3-action-rule-projection/1' && projection.mode === 'typed'
    && projection.complete === true && projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && (!Array.isArray(projection.unresolved) || projection.unresolved.length === 0));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const allItems = loadRows('items', 'items');
const cases = [];
for (const item of allItems) {
  for (const profile of item.source.profiles || []) {
    const mechanics = effectiveMechanics(item, profile);
    for (const use of mechanics.actions || []) {
      cases.push({
        profile,
        itemId: item.id,
        actionId: use.id,
        handler: use.handler,
        mode: use.program?.mode || '',
        programId: use.program?.id || '',
        supportedHealingSource: healingPotionSourceContract(use),
        summonSource: summonCarrierSourceContract(use, profile),
        arrowSource: arrowManyTargetsSourceContract(item, use, profile),
        dethroneSource: dethroneSourceContract(item, use, profile),
      });
    }
  }
}
cases.sort((a, b) => a.profile.localeCompare(b.profile)
  || a.itemId.localeCompare(b.itemId) || a.actionId.localeCompare(b.actionId));

const casesByProfile = Map.groupBy(cases, row => row.profile);
const expectedHandlers = Object.fromEntries(Map.groupBy(cases, row => row.handler).entries()
  .map(([handler, rows]) => [handler, rows.length]));
const summonCases = cases.filter(row => row.summonSource);
const arrowCases = cases.filter(row => row.arrowSource);
const dethroneCases = cases.filter(row => row.dethroneSource);

async function localCatalogFetch(url) {
  const clean = decodeURIComponent(String(url).split(/[?#]/, 1)[0]).replace(/\\/g, '/');
  const marker = clean.indexOf('data/bg3/');
  if (marker < 0) return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
  const file = path.resolve(repo, ...clean.slice(marker).split('/'));
  const prefix = repo.endsWith(path.sep) ? repo : repo + path.sep;
  if (!file.startsWith(prefix) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
  }
  const raw = fs.readFileSync(file, 'utf8');
  return {ok: true, status: 200, json: async () => JSON.parse(raw), text: async () => raw};
}

function loadEngine() {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]);
  let source = inlineScripts.findLast(candidate => candidate.includes('(async function init()'));
  assert.ok(source, 'production inline engine script with init marker is missing');
  const initStart = source.lastIndexOf('(async function init(){');
  assert.notEqual(initStart, -1, 'production engine init marker is missing');
  source = source.slice(0, initStart);
  source = source.replace('const BG3_ARCHIVE_HONOUR_AUDIT=false;', 'const BG3_ARCHIVE_HONOUR_AUDIT=true;');
  source += String.raw`
    let __boundaryResourceCommits=0,__boundarySequence=0,__boundaryLastStatus='',__boundaryLastDialog='';
    const __boundaryArrowItemId='bg3:item:rt:b11b3f7f-d8ec-41db-93b9-24474aea31e3:stats:T0JKX0Fycm93T2ZSaWNvY2hldA';
    const __boundaryNativeCommitItemUseResource=commitItemUseResource;
    commitItemUseResource=function(plan){__boundaryResourceCommits++;return __boundaryNativeCommitItemUseResource(plan);};
    const __boundaryNativeSetStatus=setStatus,__boundaryNativeAskShow=askShow;
    setStatus=function(value,error){__boundaryLastStatus=String(value||'');return __boundaryNativeSetStatus(value,error);};
    askShow=function(value){__boundaryLastDialog=String(value&&value.body||value&&value.title||'');return __boundaryNativeAskShow(value);};

    function __boundaryActor(id,itemId,entryId){
      return {
        id,name:id,player:'',race:'Человек',subrace:'',cls:'Воин',subcls:'',bg:'',align:'Истинно нейтральный',level:12,xp:0,
        ab:{str:14,dex:14,con:14,int:16,wis:12,cha:10},saves:{str:false,dex:false,con:false,int:false,wis:false,cha:false},skills:{},
        hp:40,hpMax:40,hpTemp:0,ac:15,speed:'9 м',init:2,hitDice:'12d10',inspiration:false,exhaustion:0,
        cond:[],diseases:[],deaths:{s:0,f:0},resist:[],vuln:[],immune:[],coins:{mm:0,sm:0,em:0,zm:100000,pm:0},
        inventory:[{id:entryId,itemId,qty:20,notes:''}],equipment:{},toolProficiencies:[],knownRecipes:[],
        bg3TreasureHistory:[],craftingFacilities:[],spellbook:[],bg3LearnedSpells:[],bg3DestroyedObjects:[],bg3Surfaces:[],
        bg3InventoryStatusTransitionHistory:[],slots:{},abilities:[],activeFx:[],activeEffectsSchemaVersion:GAME_MECHANICS_SCHEMA_VERSION,
        fxOff:[],feats:[],bg3Tags:[],bg3TagsComplete:true,spellPrepVersion:SPELL_PREPARATION_STATE_VERSION,
        spellLearning:{replacements:0,anyClassChoices:0},spentRest:0,arcUsed:false,acOverride:null,initB:0,hdUsed:0,
        spellAb:'int',persona:{tr:'',id:'',bd:'',fl:'',ap:''},bg3ClassDescription:null
      };
    }
    function __boundaryFoe(id){
      id=id||'boundary-foe';return {id,n:id,kind:'monster',size:'Средний',creatureType:'гуманоид',subtype:'',alignment:'Без мировоззрения',
        cr:'',xp:0,ac:12,acSource:'',hpMax:40,hpFormula:'',hp:40,hpTemp:0,speed:'9 м',movement:{walk:9},
        abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saves:{str:0,dex:0,con:0,int:0,wis:0,cha:0},profB:2,saveP:{},saveBonuses:{},skills:{},passive:10,
        resist:[],vuln:[],immune:[],damageRules:[],condImmune:[],effectImmunities:[],cond:[],diseases:[],magicRes:false,
        activeFx:[],fxOff:[],senses:'',langs:'',traits:'',actions:'',combatActions:[],multiattack:null,actionState:{},
        notes:'',tags:[],source:'boundary deterministic fixture',builtin:false};
    }
    function __boundaryReset(itemId,actionId){
      const item=bg3Catalog.items.get(itemId),use=item&&itemUseOf(item,actionId);if(!item||!use)throw new Error('hydrated exact binding missing: '+itemId+' / '+actionId);
      const actor=__boundaryActor('boundary-actor',itemId,'boundary-entry'),foe=__boundaryFoe();
      chars=[actor];foesDB=[foe];journal=[];harvestedSources=[];itemsDB=[];spellsDB=[];abilitiesDB=[];racesDB=[];classesDB=[];rulesDB=[];activeCharId=actor.id;
      fxRound=1;combat=blankCombat();lastCastEvent=null;castCtx=null;rollSpec=null;rollQueue=[];rollCompleting=false;bg3RollPromptScope=null;
      bg3SceneState=bg3SceneNormalizeState(null);bg3StoryState=bg3StoryNormalizeState(null);bg3TadpoleState=bg3TadpoleNormalizeState(null);
      bg3TreasureState=bg3TreasureNormalizeState(null,{version:bg3Catalog.current.catalogVersion,profile:bg3Catalog.preferredProfile});
      bg3StoryCommitBusy=false;bg3StoryCausalRuntime.prepared.clear();bg3StoryCausalRuntime.preparing.clear();
      bg3LifecycleReset();bg3InterruptReset();bg3InventoryStatusTransitionReset();bg3GithbornMindcrusherTrustCharacters(chars);fxInvalidate();
      __boundaryResourceCommits=0;__boundaryLastStatus='';__boundaryLastDialog='';globalThis.__boundaryConfirmCalls=0;globalThis.__boundaryPromptCalls=0;
      globalThis.__boundaryConfirmQueue=[];globalThis.__boundaryPromptQueue=[];globalThis.__boundaryRandomCalls=0;
      return {item,use,actor,entry:actor.inventory[0],foe};
    }
    function __boundaryCurrent(actionId){
      const actor=chars[0],entry=actor&&invEntryOf(actor,'boundary-entry'),item=entry&&itemOf(entry.itemId),use=item&&itemUseOf(item,actionId);
      return {actor,entry,item,use,foe:foesDB[0]};
    }
    function __boundaryWorld(){
      return JSON.stringify(itemClone({chars,foes:foesDB,combat,journal,harvestedSources,scene:bg3SceneState,story:bg3StoryState,
        tadpole:bg3TadpoleState,treasure:bg3TreasureState,lastCastEvent,fxRound,
        interruptTokens:[...bg3InterruptRuntime.tokens].sort(),interruptSourceTokens:[...bg3InterruptRuntime.sourceTokens].sort(),
        interruptTokenOrder:bg3InterruptRuntime.tokenOrder.slice(),interruptSourceTokenOrder:bg3InterruptRuntime.sourceTokenOrder.slice(),
        lifecycleHitTokens:[...bg3LifecycleRuntime.hitTokens].sort(),lifecycleStatusTokens:[...bg3LifecycleRuntime.statusTokens].sort(),
        lifecycleHitTokenOrder:bg3LifecycleRuntime.hitTokenOrder.slice(),lifecycleStatusTokenOrder:bg3LifecycleRuntime.statusTokenOrder.slice(),
        inventoryTransitionTokens:[...bg3InventoryStatusTransitionRuntime.tokens].sort(),
        inventoryTransitionTokenOrder:bg3InventoryStatusTransitionRuntime.tokenOrder.slice()}));
    }
    function __boundaryWorldDiff(before,after){
      if(before===after)return [];
      const left=JSON.parse(before),right=JSON.parse(after),out=[];
      const walk=(a,b,path)=>{
        if(out.length>=24||Object.is(a,b))return;
        const ao=a!==null&&typeof a==='object',bo=b!==null&&typeof b==='object';
        if(!ao||!bo||Array.isArray(a)!==Array.isArray(b)){
          out.push({path,before:a,after:b});return;
        }
        const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
        for(const key of keys){
          if(out.length>=24)break;
          if(!Object.prototype.hasOwnProperty.call(a,key)||!Object.prototype.hasOwnProperty.call(b,key))out.push({path:path+'/'+key,before:a[key],after:b[key]});
          else walk(a[key],b[key],path+'/'+key);
        }
      };
      walk(left,right,'');return out;
    }
    function __boundaryResult(result){return {ok:!!(result&&result.ok),reason:String(result&&result.reason||''),manual:result&&result.manual===true,
      stale:result&&result.stale===true,replay:result&&result.replay===true,needsRecipeChoice:result&&result.needsRecipeChoice===true};}
    function __boundaryTarget(use,actor,foe){
      const kind=String(use&&use.target||'any');if(kind==='object')return 'object';if(['enemy','creature','creatureOrObject'].includes(kind))return 'foe:'+foe.id;return 'ally:'+actor.id;
    }
    async function __boundaryRoute(handler,entryId,casterId,useId){
      if(handler==='bg3RecipeProgram')return bg3RecipeProgramOpen(entryId,casterId,useId);
      if(handler==='bg3LearnSpellProgram')return bg3LearnSpellOpen(entryId,casterId,useId);
      return bg3ItemProgramOpen(entryId,casterId,useId);
    }
    async function __boundaryStory(current){
      if(!bg3StoryCausalItemPreparationRequired(current.item,current.use))return null;
      const context=bg3StoryCausalItemContext(current.actor,current.entry,current.item,current.use,'inventory-read');
      let plan=await bg3StoryCausalPlanFor(context,{});if(!plan.ok&&plan.needsInput&&plan.needsInput.kind==='story-causal-gm-confirmation')
        plan=await bg3StoryCausalPlanFor(context,{gmConfirmed:true,transactionId:'boundary-story-'+(++__boundarySequence)});
      if(!plan.ok)return plan;const key=bg3StoryCausalPreparationKey(context);bg3StoryCausalRuntime.prepared.set(key,plan);return plan;
    }
    function __boundaryEntered(spec){
      const forceHit=bg3Array(spec&&spec.meta&&spec.meta.bg3TypedItemFamilies).includes('breakConcentration');
      const entered={};for(const row of bg3Array(spec&&spec.rows)){
        let value;if(row.type==='atk')value=forceHit?20:1;else if(row.type==='save')value=row.natural?20:Math.max(1,+row.dc||1);
        else if(row.type==='tcheck')value=1;else if(['check','threshold'].includes(row.type))value=20;
        else if(row.fixed)value=Number.isFinite(+row.mod)?+row.mod:0;else if(+row.cnt>0&&+row.sides>0)value=+row.cnt;
        else if(row.required)value=0;else continue;entered[row.key]=value;if(row.natural&&row.adv)entered[row.key+'_2']=value;
      }return entered;
    }
    function __boundaryFormula(current,plan,target){
      try{const ti=targetInfoOf(target),spec=itemUseSpecOf(current.actor,current.item,current.use,ti,{entryId:current.entry.id}),empty={},emptyResult=resolveOutcome(spec,empty),
        emptyValid=validateFormulaValues(spec,empty,emptyResult),entered=__boundaryEntered(spec),resolved=resolveOutcome(spec,entered),valid=validateFormulaValues(spec,entered,resolved),
        built=valid.ok?castFormulaRollsBuild(spec,entered,resolved):{ok:false,reason:valid.errors.join(' | ')};
        return {spec,missingInput:!emptyValid.ok,missingReason:emptyValid.errors.join(' | '),entered,resolved,valid,built};
      }catch(error){return {spec:null,missingInput:false,missingReason:'',entered:{},resolved:null,valid:{ok:false,errors:[String(error&&error.message||error)]},built:{ok:false,reason:String(error&&error.message||error)}};}
    }
    function __boundaryDirectFormulaProbe(current,target,formula,opts){
      const probes=[['resolveOutcome-preview',formula.resolved],['castFormulaRollsBuild-carrier',formula.built.rolls],['detached-built-carrier',itemClone(formula.built.rolls)]],out=[];
      for(const pair of probes){const before=__boundaryWorld(),commits=__boundaryResourceCommits,accepted=useItemApply(current.entry.id,current.actor.id,target,pair[1],current.use.id,opts);
        out.push({route:pair[0],rejected:!accepted,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commits,reason:__boundaryLastStatus});}
      return out;
    }
    async function __boundaryConfirmedFormulaRoute(current,target){
      const beforeOpen=__boundaryWorld(),commitsBeforeOpen=__boundaryResourceCommits,routed=await __boundaryRoute(current.use.handler,current.entry.id,current.actor.id,current.use.id),ctx=castCtx;
      const opened=!!ctx,openNoMutation=beforeOpen===__boundaryWorld(),openResourceCommits=__boundaryResourceCommits-commitsBeforeOpen;
      if(!routed||!ctx)return {routed:!!routed,opened,openNoMutation,openResourceCommits,ok:false,worldChanged:false,resourceCommits:0,reason:__boundaryLastStatus||__boundaryLastDialog};
      document.getElementById('castTarget').value=target;castConfirm();const spec=castCtx&&castCtx.spec;
      if(!spec){closeCastModal();return {routed:true,opened:true,openNoMutation,openResourceCommits,staged:false,ok:false,worldChanged:false,resourceCommits:0,reason:__boundaryLastStatus||__boundaryLastDialog};}
      const entered=__boundaryEntered(spec);for(const row of bg3Array(spec.rows)){const input=document.getElementById('cf_'+row.key);if(input&&Object.prototype.hasOwnProperty.call(entered,row.key))input.value=String(entered[row.key]);
        if(row.natural){const second=document.getElementById('cf_'+row.key+'_2');if(second&&Object.prototype.hasOwnProperty.call(entered,row.key+'_2'))second.value=String(entered[row.key+'_2']);}}
      const beforeConfirm=__boundaryWorld(),commitsBeforeConfirm=__boundaryResourceCommits,ok=castFormulaConfirm();return {routed:true,opened:true,openNoMutation,openResourceCommits,staged:true,
        rows:bg3Array(spec.rows).length,ok:ok===true,worldChanged:beforeConfirm!==__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commitsBeforeConfirm,reason:__boundaryLastStatus||__boundaryLastDialog};
    }
    function __boundaryConfigureWizard(current,contract){
      const minimum=Math.max(1,+contract.requirements.progressionEligibility.minimumClassLevel||1),profile=itemClone(contract.requirements.eligibleClassDescriptions[0]);
      profile.classLevel=minimum;profile.activeProgressionUuids=profile.savant&&minimum>=+profile.savant.minimumLevel?[profile.savant.progressionUuid]:[];
      current.actor.level=minimum;current.actor.cls='Волшебник';current.actor.bg3ClassDescription=profile;current.actor.coins={mm:0,sm:0,em:0,zm:100000,pm:0};return profile;
    }
    function __boundaryConfigureSummonCaster(current){
      const profile=itemClone(bg3WizardProfileBinding(''));profile.classLevel=12;profile.activeProgressionUuids=[];
      current.actor.level=12;current.actor.cls='Волшебник';current.actor.bg3ClassDescription=profile;return profile;
    }
    function __boundaryConfigureArrow(current){
      const seededItems=seedItemsDB(),weapon=seededItems.find(row=>row&&row.id==='it_shortbow_s'),seededAbilities=seedAbilitiesDB(),
        proficiency=seededAbilities.find(row=>row&&row.id==='ab_sx_weapons');
      if(!weapon||!proficiency)throw new Error('exact Arrow weapon/proficiency fixture is missing');
      const weaponEntry={id:'boundary-arrow-weapon',itemId:weapon.id,qty:1,notes:''};
      current.actor.ab.dex=10;current.actor.inventory.push(weaponEntry);current.actor.equipment={TWO_HAND:weaponEntry.id};
      current.actor.abilities=[{abilityId:proficiency.id,cur:null,notes:''}];
      const ally=__boundaryActor('boundary-arrow-primary','','');ally.inventory=[];ally.equipment={};ally.abilities=[];ally.ab.dex=10;
      const foes=[];for(let i=0;i<3;i++){const foe=__boundaryFoe('boundary-arrow-extra-'+(i+1));foe.hp=40;foe.hpMax=40;upgradeFoe(foe);foes.push(foe);}
      chars=[current.actor,ally];foesDB=foes;itemsDB=seededItems;abilitiesDB=[proficiency];activeCharId=current.actor.id;
      current.foe=foes[0];bg3GithbornMindcrusherTrustCharacters(chars);fxInvalidate();globalThis.__boundaryRandomCalls=0;
      return {actor:current.actor,arrowEntry:current.entry,weapon,weaponEntry,proficiency,ally,foes};
    }
    function __boundaryArrowCombat(fixture){
      const actorKey='ally:'+fixture.actor.id,entry={kind:'ally',id:fixture.actor.id};combat=blankCombat();
      combat.active=true;combat.id='boundary-arrow-combat';combat.name='Arrow deterministic boundary';combat.round=1;combat.turnIndex=0;
      combat.order=[entry];combat.focusKey=actorKey;combat.turn={actorKey,actionUsed:false,actionMax:1,actionsUsed:0,actionKind:'',attacksUsed:0,
        attackMax:1,attackActionTaken:false,foeAttacks:[],foeUses:{},loadingUsed:{},bonusUsed:false,objectUsed:false,movementUsed:0,
        dash:false,disengage:false,spellCasts:[],bonusSpellUsed:false,abilityUsed:{},bg3ActionCapacityBonus:0,startedAt:'2026-08-18T00:00:00.000Z'};
      return {actorKey,entry,turn:combat.turn};
    }
    function __boundaryArrowSetFormulaValues(spec){
      const values={};for(const row of bg3Array(spec&&spec.rows))if(row.required){values[row.key]=row.type==='atk'?19:(row.type==='dmg'?6:(row.natural?10:Math.max(1,+row.cnt||1)));
        if(row.natural&&row.adv)values[row.key+'_2']=values[row.key];}
      for(const row of bg3Array(spec&&spec.rows)){const input=document.getElementById('cf_'+row.key);if(input&&Object.prototype.hasOwnProperty.call(values,row.key))input.value=String(values[row.key]);
        if(row.natural){const second=document.getElementById('cf_'+row.key+'_2');if(second&&Object.prototype.hasOwnProperty.call(values,row.key+'_2'))second.value=String(values[row.key+'_2']);}}
      return values;
    }
    async function __boundaryArrowRoute(current,fixture,expected){
      const combatReceipt=__boundaryArrowCombat(fixture),beforeOpen=__boundaryWorld(),commitsBeforeOpen=__boundaryResourceCommits,
        routed=combatUseItem(current.entry.id,current.use.id),ctx=castCtx,openAfter=__boundaryWorld(),turn=combatReceipt.turn,
        result={routed:routed===true,opened:!!ctx,openNoMutation:beforeOpen===openAfter,openResourceCommits:__boundaryResourceCommits-commitsBeforeOpen};
      if(!routed||!ctx){result.noMutation=beforeOpen===__boundaryWorld();result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;}
      document.getElementById('castTarget').value='ally:'+fixture.ally.id;document.getElementById('castWeapon').value=fixture.weaponEntry.id;
      for(let i=0;i<3;i++)document.getElementById('castBg3ArrowExtra'+(i+1)).value='foe:'+fixture.foes[i].id;
      const beforeSelection=__boundaryWorld();result.selectionOk=castConfirm()===true;result.selectionNoMutation=beforeSelection===__boundaryWorld();
      if(!result.selectionOk){result.noMutation=beforeOpen===__boundaryWorld();result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;}
      const beforeMissing=__boundaryWorld(),missingCommits=__boundaryResourceCommits,missing=castFormulaConfirm();
      result.missingDistance={rejected:missing!==true,noMutation:beforeMissing===__boundaryWorld(),resourceCommits:__boundaryResourceCommits-missingCommits,
        reason:__boundaryLastStatus||__boundaryLastDialog};
      const targetOrder=['ally:'+fixture.ally.id,...fixture.foes.map(foe=>'foe:'+foe.id)],formulaRows=[],shotResults=[];
      for(let order=0;order<4;order++){
        castDistanceSet('far');const spec=castCtx&&castCtx.spec;formulaRows.push(bg3Array(spec&&spec.rows).length);
        const meta=spec&&spec.meta||{};if(!spec||meta.bg3ArrowOrder!==order||meta.projectileWeaponEntryId!==fixture.weaponEntry.id){shotResults.push(false);break;}
        __boundaryArrowSetFormulaValues(spec);shotResults.push(castFormulaConfirm()===true);
      }
      const audit=itemClone(bg3ItemArrowAudit()),hpAfter=[fixture.ally.hp,...fixture.foes.map(foe=>foe.hp)],instrumented=__boundaryResourceCommits-commitsBeforeOpen;
      result.ok=shotResults.length===4&&shotResults.every(Boolean)&&audit&&audit.phase==='used';result.formulaRows=formulaRows.length?formulaRows[0]:0;
      result.shotResults=shotResults;result.targetOrder=targetOrder;result.worldChanged=beforeOpen!==__boundaryWorld();result.instrumentedResourceCommits=instrumented;
      result.resourceCommits=Number.isInteger(+audit?.resourceTransactions)?+audit.resourceTransactions:instrumented;result.arrowQty=fixture.arrowEntry.qty;
      result.weapon={entrySame:fixture.actor.inventory.includes(fixture.weaponEntry),entryId:fixture.weaponEntry.id,itemId:fixture.weaponEntry.itemId,
        qty:fixture.weaponEntry.qty,equipmentEntryId:fixture.actor.equipment.TWO_HAND};
      result.combat={actionsUsed:turn.actionsUsed,actionUsed:turn.actionUsed,bonusUsed:turn.bonusUsed};
      result.hpAfter=hpAfter;result.damage=[40-hpAfter[0],...hpAfter.slice(1).map(hp=>40-hp)];result.audit=audit;
      result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;
    }
    function __boundaryConfigureDethrone(current){
      const profile=itemClone(bg3WizardProfileBinding(''));
      profile.classLevel=9;profile.activeProgressionUuids=[];
      current.actor.level=9;current.actor.cls='Волшебник';current.actor.subcls='';current.actor.bg3ClassDescription=profile;
      current.actor.ab.int=10;current.actor.abilities=[];current.actor.activeFx=[];current.actor.cond=[];
      current.actor.equipment={};current.actor.slots={5:{cur:1,max:1}};
      const target=__boundaryActor('boundary-dethrone-target','','');
      target.level=9;target.hp=100;target.hpMax=100;target.hpTemp=0;target.ab.con=10;target.saves.con=false;
      target.inventory=[];target.equipment={};target.slots={};target.abilities=[];target.activeFx=[];target.cond=[];
      const observer=current.foe;observer.hp=100;observer.hpMax=100;observer.hpTemp=0;observer.activeFx=[];observer.cond=[];
      observer.resist=[];observer.vuln=[];observer.immune=[];observer.damageRules=[];
      chars=[current.actor,target];foesDB=[observer];activeCharId=current.actor.id;
      const actorKey='ally:'+current.actor.id,entry={kind:'ally',id:current.actor.id};combat=blankCombat();
      combat.active=true;combat.id='boundary-dethrone-combat';combat.name='Dethrone deterministic boundary';combat.round=1;combat.turnIndex=0;
      combat.order=[entry];combat.focusKey=actorKey;combat.turn={actorKey,actionUsed:false,actionMax:1,actionsUsed:0,actionKind:'',attacksUsed:0,
        attackMax:1,attackActionTaken:false,foeAttacks:[],foeUses:{},loadingUsed:{},bonusUsed:false,objectUsed:false,movementUsed:0,
        dash:false,disengage:false,spellCasts:[],bonusSpellUsed:false,abilityUsed:{},bg3ActionCapacityBonus:0,startedAt:'2026-08-18T00:00:00.000Z'};
      current.foe=observer;bg3GithbornMindcrusherTrustCharacters(chars);fxInvalidate();globalThis.__boundaryRandomCalls=0;
      return {actor:current.actor,target,observer,entry:current.entry,turn:combat.turn,profile};
    }
    async function __boundaryDethroneQuiesce(fixture){
      for(const holder of [fixture.actor,fixture.target,fixture.observer]){
        const pending=bg3LifecycleRuntime.pending.get(holder);if(pending)await pending;
      }
      await Promise.resolve();
    }
    async function __boundaryDethroneRoute(current,fixture,expected){
      await __boundaryDethroneQuiesce(fixture);
      const targetKey='ally:'+fixture.target.id,raw={dethroneSave:1,dethroneDice:40},beforeProofless=__boundaryWorld(),prooflessCommits=__boundaryResourceCommits,
        prooflessAccepted=useItemApply(current.entry.id,current.actor.id,targetKey,raw,current.use.id),proofless={rejected:prooflessAccepted!==true,
          noMutation:beforeProofless===__boundaryWorld(),resourceCommits:__boundaryResourceCommits-prooflessCommits,reason:__boundaryLastStatus||__boundaryLastDialog},
        beforeOpen=__boundaryWorld(),commitsBeforeOpen=__boundaryResourceCommits,routed=combatUseItem(current.entry.id,current.use.id),ctx=castCtx,
        result={proofless,routed:routed===true,opened:!!ctx,openNoMutation:beforeOpen===__boundaryWorld(),
          openResourceCommits:__boundaryResourceCommits-commitsBeforeOpen,target:targetKey};
      if(!routed||!ctx){result.noMutation=beforeOpen===__boundaryWorld();result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;}
      document.getElementById('castTarget').value=targetKey;document.getElementById('castDethroneDistance').value='';
      const beforeMissing=__boundaryWorld(),missingCommits=__boundaryResourceCommits,missing=castConfirm();
      result.missingDistance={rejected:missing!==true,noMutation:beforeMissing===__boundaryWorld(),
        resourceCommits:__boundaryResourceCommits-missingCommits,reason:__boundaryLastStatus||__boundaryLastDialog};
      document.getElementById('castDethroneDistance').value=String(expected.targetDistanceM);
      const beforeSelection=__boundaryWorld();result.selectionOk=castConfirm()===true;result.selectionNoMutation=beforeSelection===__boundaryWorld();
      const spec=castCtx&&castCtx.spec;result.formulaRows=bg3Array(spec&&spec.rows).length;
      if(!result.selectionOk||!spec){result.noMutation=beforeOpen===__boundaryWorld();result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;}
      document.getElementById('cf_dethroneSave').value='1';document.getElementById('cf_dethroneDice').value=String(expected.entered10d6);
      const beforeCommit=__boundaryWorld(),slotsRef=fixture.actor.slots,slotsBefore=itemClone(slotsRef),commitWrapperBefore=__boundaryResourceCommits,
        ok=castFormulaConfirm(),audit=itemClone(bg3ItemDethroneAudit()),slotsAfter=itemClone(fixture.actor.slots);
      result.ok=ok===true;result.worldChanged=beforeCommit!==__boundaryWorld();result.instrumentedResourceCommits=__boundaryResourceCommits-commitWrapperBefore;
      result.resourceCommits=Number.isInteger(+audit?.resourceTransactions)?+audit.resourceTransactions:result.instrumentedResourceCommits;
      result.itemQty=fixture.entry.qty;result.targetHp=fixture.target.hp;result.damage=100-fixture.target.hp;
      result.combat={actionsUsed:fixture.turn.actionsUsed,actionUsed:fixture.turn.actionUsed,bonusUsed:fixture.turn.bonusUsed,
        actionKind:fixture.turn.actionKind,spellCasts:itemClone(fixture.turn.spellCasts)};
      result.slots={sameRef:fixture.actor.slots===slotsRef,before:slotsBefore,after:slotsAfter};result.audit=audit;
      result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;
    }
    async function __boundarySummonRoute(current,expected){
      __boundaryConfigureSummonCaster(current);globalThis.__boundaryPromptQueue=['boundary-summon-world,10,20,30'];
      globalThis.__boundaryConfirmQueue=expected.canStand?[true]:[];
      const auditBeforeOpen=itemClone(bg3ItemSummonAudit()),beforeOpen=__boundaryWorld(),commitsBeforeOpen=__boundaryResourceCommits,prompts=globalThis.__boundaryPromptCalls||0,confirms=globalThis.__boundaryConfirmCalls||0,
        routed=await bg3ItemProgramOpen(current.entry.id,current.actor.id,current.use.id),ctx=castCtx,
        openAfter=__boundaryWorld(),auditAfterOpen=bg3ItemSummonAudit();
      const result={routed:!!routed,opened:!!ctx,openNoMutation:beforeOpen===openAfter,openResourceCommits:__boundaryResourceCommits-commitsBeforeOpen,
        promptCalls:(globalThis.__boundaryPromptCalls||0)-prompts,confirmCalls:(globalThis.__boundaryConfirmCalls||0)-confirms,
        positionPublic:!!(ctx&&Object.prototype.hasOwnProperty.call(ctx,'position')),target:String(ctx&&ctx.target||''),
        auditBeforeOpen,auditAfterOpen:itemClone(auditAfterOpen)};
      if(!routed||!ctx){result.noMutation=beforeOpen===__boundaryWorld();result.resourceCommits=__boundaryResourceCommits-commitsBeforeOpen;
        result.instrumentedResourceCommits=result.resourceCommits;
        result.overlayCount=current.actor.activeFx.filter(effect=>effect&&effect.k==='bg3-summon').length;result.randomCalls=globalThis.__boundaryRandomCalls||0;return result;}
      const beforeConfirm=__boundaryWorld(),confirmCommits=__boundaryResourceCommits,ok=castConfirm(),overlays=current.actor.activeFx.filter(effect=>effect&&effect.k==='bg3-summon'),overlay=overlays[0]||null,
        summon=overlay&&overlay.bg3Summon||null,audit=itemClone(bg3ItemSummonAudit()),instrumentedResourceCommits=__boundaryResourceCommits-confirmCommits;
      result.ok=ok===true;result.worldChanged=beforeConfirm!==__boundaryWorld();result.instrumentedResourceCommits=instrumentedResourceCommits;
      result.resourceCommits=ok===true&&audit&&Number.isInteger(+audit.resourceTransactions)?+audit.resourceTransactions:instrumentedResourceCommits;
      result.overlayCount=overlays.length;result.itemQty=current.entry.qty;result.randomCalls=globalThis.__boundaryRandomCalls||0;result.audit=audit;
      result.overlay=overlay?itemClone({id:overlay.id,casterId:overlay.casterId,conc:overlay.conc,stackKey:overlay.stackKey,durationKind:overlay.durationKind,
        manualDismiss:overlay.manualDismiss===true,expiresAtRound:Object.prototype.hasOwnProperty.call(overlay,'expiresAtRound')?overlay.expiresAtRound:null,
        blueprintUuid:summon&&summon.blueprintUuid,sourceProfile:summon&&summon.sourceProfile,duration:summon&&summon.duration,
        stackId:summon&&summon.stackId,worldPosition:summon&&summon.worldPosition,canStandProof:summon&&summon.canStandProof}):null;
      return result;
    }
    async function __boundaryRecipeFixture(current,descriptor){
      const asset=await bg3CatalogEnsureAsset('recipes'),declaredIds=bg3Array(descriptor.recipeIds),availableIds=declaredIds.filter(id=>asset.byId.has(id)),
        invalidIds=declaredIds.filter(id=>!asset.byId.has(id)),recipe=availableIds.length?asset.byId.get(availableIds[0]):null,
        refAudit={declared:declaredIds.length,available:availableIds.length,invalid:invalidIds.length,availableIds,invalidIds,selectedId:recipe&&recipe.id||''};
      if(!recipe)return {plan:{ok:false,reason:'no exact linked recipe is available'},refAudit};
      if(recipe.accessPolicy&&recipe.accessPolicy.mode==='exact-formula-required'&&!current.actor.knownRecipes.includes(recipe.id))current.actor.knownRecipes.push(recipe.id);
      const selections={inputs:{},entries:{}},ids=[];for(const input of recipe.inputs){const candidates=bg3AvailableIds(input.candidateIds);if(!candidates.length)return {plan:{ok:false,reason:'input has no profile candidate: '+input.slot},refAudit};selections.inputs[input.slot]=candidates[0];ids.push(candidates[0]);}
      if(!recipe.dye){const candidates=bg3AvailableIds(recipe.result.candidateIds);if(!candidates.length)return {plan:{ok:false,reason:'result has no profile candidate'},refAudit};selections.result=candidates[0];ids.push(candidates[0]);}
      await bg3CatalogHydrate([...new Set(ids)]);for(const input of recipe.inputs){const entry=bg3InventoryAdd(current.actor,selections.inputs[input.slot],16);if(['Transform','Dye'].includes(input.transform))selections.entries[input.slot]=entry.id;}
      return {plan:await bg3RecipeProgramPlanFor(current.actor,current.entry.id,current.use.id,{recipeId:recipe.id,selections}),refAudit};
    }
    async function __boundaryAudit(itemId,actionId,expectedHandler,expectedProfile,expectedSupportedHealing,expectedSummon,expectedArrow,expectedDethrone){
      const reset=__boundaryReset(itemId,actionId),current=__boundaryCurrent(actionId),report={handler:current.use&&current.use.handler||'',profile:bg3Catalog.preferredProfile,
        exactBinding:!!(current.item===reset.item&&current.use===reset.use&&current.entry.itemId===itemId&&current.use.id===actionId&&current.use.program&&current.use.program.sourceProfile===expectedProfile),
        expectedSupportedHealing:expectedSupportedHealing===true,expectedSummon:expectedSummon?itemClone(expectedSummon):null,
        expectedArrow:expectedArrow?itemClone(expectedArrow):null,expectedDethrone:expectedDethrone?itemClone(expectedDethrone):null,
        resourceCommits:0,status:'',dialog:''};
      if(report.handler!==expectedHandler)return Object.assign(report,{fatal:'handler mismatch'});
      if(report.expectedSupportedHealing){current.actor.hp=1;current.actor.hpMax=20;current.actor.activeFx=[{uid:'boundary-burning',bg3Status:'BURNING',effectSchemaVersion:GAME_MECHANICS_SCHEMA_VERSION,fx:[{stat:'bg3.status',mode:'text',value:'BURNING'}]}];fxInvalidate();}
      const arrowFixture=report.expectedArrow?__boundaryConfigureArrow(current):null;
      const dethroneFixture=report.expectedDethrone?__boundaryConfigureDethrone(current):null;
      if(dethroneFixture)await __boundaryDethroneQuiesce(dethroneFixture);

      let before=__boundaryWorld(),r=await __boundaryRoute(report.handler,'missing-entry',current.actor.id,current.use.id);
      report.missingEntry={rejected:!r,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits};
      before=__boundaryWorld();r=await __boundaryRoute(report.handler,current.entry.id,current.actor.id,current.use.id+':tampered');
      report.tamperedUse={rejected:!r,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits};

      if(['bg3RootProgram','bg3RuleProgram'].includes(report.handler)){
        const plan=await bg3RuleProgramPrepare(current.use);report.compile={ok:!!(plan&&plan.ok),reason:bg3RuleProgramReport(plan),issues:itemClone(plan&&plan.issues||[])};
        if(plan&&plan.ok){const books=await bg3BookPrepareProgram(plan,current.actor);report.books={ok:books.ok,reason:String(books.reason||'')};}
        const story=plan&&plan.ok?await __boundaryStory(current):null;report.story=story?__boundaryResult(story):null;
        const cancelPrompts=globalThis.__boundaryPromptCalls||0,cancelConfirms=globalThis.__boundaryConfirmCalls||0;before=__boundaryWorld();r=await __boundaryRoute(report.handler,current.entry.id,current.actor.id,current.use.id);const opened=!!castCtx;if(opened)closeCastModal();const afterCancel=__boundaryWorld();
        report.cancel={routed:!!r,opened,noMutation:before===afterCancel,mutationDiff:__boundaryWorldDiff(before,afterCancel),resourceCommits:__boundaryResourceCommits,
          promptCalls:(globalThis.__boundaryPromptCalls||0)-cancelPrompts,confirmCalls:(globalThis.__boundaryConfirmCalls||0)-cancelConfirms,reason:__boundaryLastStatus||__boundaryLastDialog};
        if(!plan||!plan.ok){report.blocked={rejected:!r,reason:report.compile.reason};return report;}
        if(report.expectedSummon&&report.expectedSummon.family==='typed'){
          report.privateSignature=bg3Sha256Sync(bg3CanonicalJSON({kind:'summon-source',profile:expectedProfile,itemId,currentUseId:current.use.id,
            spellId:report.expectedSummon.spellId,ruleId:report.expectedSummon.ruleId,programId:report.expectedSummon.programId,
            blueprintUuid:report.expectedSummon.blueprintUuid,duration:report.expectedSummon.duration,canStandTemplate:report.expectedSummon.canStandTemplate}));
          report.summonPrivate=await __boundarySummonRoute(current,report.expectedSummon);
          if(report.summonPrivate.ok)report.success={ok:true,worldChanged:report.summonPrivate.worldChanged,resourceCommits:report.summonPrivate.resourceCommits,reason:String(report.summonPrivate.audit&&report.summonPrivate.audit.reason||'')};
          return report;
        }
        if(report.expectedArrow){
          report.privateSignature=bg3Sha256Sync(bg3CanonicalJSON({kind:'arrow-many-targets-source',profile:expectedProfile,itemId,
            useId:current.use.id,rootId:report.expectedArrow.rootId,descriptorSha256:report.expectedArrow.descriptorSha256,
            chain:report.expectedArrow.chain.map(row=>({ruleId:row.ruleId,programId:row.programId,artifact:row.artifact}))}));
          report.arrowPrivate=await __boundaryArrowRoute(current,arrowFixture,report.expectedArrow);
          report.formula={rows:report.arrowPrivate.formulaRows||0,missingInput:true,missingReason:String(report.arrowPrivate.missingDistance&&report.arrowPrivate.missingDistance.reason||''),
            complete:report.arrowPrivate.ok===true,reason:report.arrowPrivate.ok?'':String(__boundaryLastStatus||__boundaryLastDialog)};
          report.missingInput=report.arrowPrivate.missingDistance;
          if(report.arrowPrivate.ok)report.success={ok:true,worldChanged:report.arrowPrivate.worldChanged,
            resourceCommits:report.arrowPrivate.resourceCommits,reason:String(report.arrowPrivate.audit&&report.arrowPrivate.audit.reason||'')};
          return report;
        }
        if(report.expectedDethrone){
          report.privateSignature=bg3Sha256Sync(bg3CanonicalJSON({kind:'dethrone-source',profile:expectedProfile,itemId,
            useId:current.use.id,rootId:report.expectedDethrone.rootId,ruleId:report.expectedDethrone.ruleId,
            programId:report.expectedDethrone.programId,rootSha256:report.expectedDethrone.rootSha256,
            ruleProgramSha256:report.expectedDethrone.ruleProgramSha256,projectionSha256:report.expectedDethrone.projectionSha256}));
          report.dethronePrivate=await __boundaryDethroneRoute(current,dethroneFixture,report.expectedDethrone);
          report.formula={rows:report.dethronePrivate.formulaRows||0,missingInput:true,
            missingReason:String(report.dethronePrivate.missingDistance&&report.dethronePrivate.missingDistance.reason||''),
            complete:report.dethronePrivate.ok===true,reason:report.dethronePrivate.ok?'':String(__boundaryLastStatus||__boundaryLastDialog)};
          report.missingInput=report.dethronePrivate.missingDistance;
          if(report.dethronePrivate.ok)report.success={ok:true,worldChanged:report.dethronePrivate.worldChanged,
            resourceCommits:report.dethronePrivate.resourceCommits,reason:String(report.dethronePrivate.audit&&report.dethronePrivate.audit.reason||'')};
          return report;
        }
        const target=__boundaryTarget(current.use,current.actor,current.foe),formula=__boundaryFormula(current,plan,target),opts=story&&story.ok?{bg3StoryCausalPlan:story}:{};
        report.formula={rows:formula.spec?formula.spec.rows.length:0,missingInput:formula.missingInput,missingReason:formula.missingReason,
          complete:!!(formula.valid&&formula.valid.ok&&formula.built&&formula.built.ok),reason:String(formula.built&&formula.built.reason||formula.valid&&formula.valid.errors&&formula.valid.errors.join(' | ')||'')};
        const direct=bg3RuleProgramPreflight(plan,current.actor,target,null,current.item,current.use,opts);report.emptyPreflight=__boundaryResult(direct);
        if(formula.missingInput){before=__boundaryWorld();const ok=useItemApply(current.entry.id,current.actor.id,target,null,current.use.id,opts);
          report.missingInput={rejected:!ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:__boundaryLastStatus};}
        if(formula.built&&formula.built.ok){
          const preflight=bg3RuleProgramPreflight(plan,current.actor,target,formula.built.rolls,current.item,current.use,opts);report.fullPreflight=__boundaryResult(preflight);
          const detached=itemClone(formula.built.rolls);before=__boundaryWorld();const detachedCommits=__boundaryResourceCommits,
            detachedPreflight=bg3RuleProgramPreflight(plan,current.actor,target,detached,current.item,current.use,opts);
          report.detachedFormulaSignature=bg3Sha256Sync(bg3CanonicalJSON({profile:expectedProfile,handler:report.handler,programId:plan.programId,
            rows:bg3Array(formula.spec&&formula.spec.rows).map(row=>({key:row.key,type:row.type,natural:!!row.natural,required:!!row.required,cnt:+row.cnt||0,sides:+row.sides||0,mod:+row.mod||0,dc:+row.dc||0})),
            resolution:plan.resolution,secondarySave:plan.secondarySave,typedFamilies:bg3Array(formula.spec&&formula.spec.meta&&formula.spec.meta.bg3TypedItemFamilies)}));
          report.detachedFormulaCarrier={accepted:detachedPreflight.ok===true,rejected:detachedPreflight.ok!==true,noMutation:before===__boundaryWorld(),
            resourceCommits:__boundaryResourceCommits-detachedCommits,reason:String(detachedPreflight.reason||'')};
          const formulaRows=bg3Array(formula.spec&&formula.spec.rows).length;
          if(formulaRows){
            report.directFormula=__boundaryDirectFormulaProbe(current,target,formula,opts);
            if(report.expectedSupportedHealing){report.confirmedFormula=await __boundaryConfirmedFormulaRoute(current,target);report.success={ok:report.confirmedFormula.ok,
              worldChanged:report.confirmedFormula.worldChanged,resourceCommits:report.confirmedFormula.resourceCommits,reason:report.confirmedFormula.reason};
              report.healingConsequences={hp:current.actor.hp,qty:current.entry.qty,burning:current.actor.activeFx.some(row=>row&&row.bg3Status==='BURNING'),
                instantMarker:current.actor.activeFx.some(row=>row&&row.bg3Status==='POTION_OF_HEALING')};}
            else report.formulaFailClosed={rejected:!r&&!opened,noMutation:report.cancel.noMutation,resourceCommits:report.cancel.resourceCommits,reason:report.cancel.reason};
          }else if(preflight.ok&&!current.use.special?.kind){
            before=__boundaryWorld();const commits=__boundaryResourceCommits,ok=useItemApply(current.entry.id,current.actor.id,target,formula.built.rolls,current.use.id,opts);
            report.success={ok,worldChanged:before!==__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commits,reason:__boundaryLastStatus};
          }
        }
      }else if(report.handler==='bg3RecipeProgram'){
        const descriptor=bg3RecipeProgramDescriptor(current.use);report.compile=__boundaryResult(descriptor);
        const missing=await bg3RecipeProgramPlanFor(current.actor,current.entry.id,current.use.id,{});report.emptyPreflight=__boundaryResult(missing);
        if(descriptor.ok){const fixture=await __boundaryRecipeFixture(current,descriptor),plan=fixture.plan;report.recipeRefs=fixture.refAudit;report.fullPreflight=__boundaryResult(plan);
          const promptCalls=globalThis.__boundaryPromptCalls||0,confirmCalls=globalThis.__boundaryConfirmCalls||0;before=__boundaryWorld();r=await bg3RecipeProgramOpen(current.entry.id,current.actor.id,current.use.id);report.cancel={routed:!!r,
            noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:__boundaryLastStatus,promptCalls:(globalThis.__boundaryPromptCalls||0)-promptCalls,confirmCalls:(globalThis.__boundaryConfirmCalls||0)-confirmCalls};
          if(plan.ok){
          report.privateSignature=bg3Sha256Sync(bg3CanonicalJSON({kind:'recipe-plan',profile:expectedProfile,recipeId:plan.recipe.id,inputs:plan.resolvedInputs.map(input=>({slot:input.slot,type:input.type,transform:input.transform,combine:input.combine})),dye:plan.recipe.dye,resultQty:plan.resultQty}));
          const publicPlan=Object.assign({},plan);before=__boundaryWorld();const publicDone=await bg3RecipeProgramCommit(publicPlan);report.publicClone={rejected:!publicDone.ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:String(publicDone.reason||'')};
          const tampered=Object.assign({},plan,{recipe:Object.assign({},plan.recipe,{id:plan.recipe.id+':tampered'})});before=__boundaryWorld();const tamperedDone=await bg3RecipeProgramCommit(tampered);report.tamperedPlan={rejected:!tamperedDone.ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:String(tamperedDone.reason||'')};
          before=__boundaryWorld();let commits=__boundaryResourceCommits;const done=await bg3RecipeProgramCommit(plan);report.success={ok:done.ok,worldChanged:before!==__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commits,reason:String(done.reason||'')};
          if(done.ok){before=__boundaryWorld();commits=__boundaryResourceCommits;const replay=await bg3RecipeProgramCommit(plan);report.replay={rejected:!replay.ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commits,reason:String(replay.reason||'')};}
        }}else{before=__boundaryWorld();r=await bg3RecipeProgramOpen(current.entry.id,current.actor.id,current.use.id);report.cancel={routed:!!r,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:__boundaryLastStatus};}
      }else if(report.handler==='bg3LearnSpellProgram'){
        const action=bg3LearnSpellActionContractCheck(current.use),payload=action.ok?await bg3CatalogLoadArtifact(current.use.program.rootArtifact):null,
          root=payload&&bg3Array(payload.programs).find(row=>row.id===current.use.program.id),rootCheck=action.ok?bg3LearnSpellRootProgramCheck(current.use,root,expectedProfile):action;
        report.compile={ok:!!(action.ok&&rootCheck.ok),reason:String(action.reason||rootCheck.reason||'')};
        before=__boundaryWorld();const missing=await bg3LearnSpellPlanFor(current.actor,current.entry.id,current.use.id);report.emptyPreflight=Object.assign(__boundaryResult(missing),{noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits});
        if(report.compile.ok){__boundaryConfigureWizard(current,action.contract);const plan=await bg3LearnSpellPlanFor(current.actor,current.entry.id,current.use.id);report.fullPreflight=__boundaryResult(plan);if(plan.ok){
          report.privateSignature=bg3Sha256Sync(bg3CanonicalJSON({kind:'learn-spell-plan',profile:expectedProfile,spellId:plan.contract.spellId,level:plan.contract.spell.level,school:plan.contract.spell.school,classUuid:plan.classEvidence.profile.uuid,costGp:plan.costGp,rootId:plan.root.id}));
          before=__boundaryWorld();r=await bg3LearnSpellOpen(current.entry.id,current.actor.id,current.use.id);report.cancel={routed:!!r,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:__boundaryLastStatus};
          const publicPlan=itemClone(plan);before=__boundaryWorld();const publicDone=await bg3LearnSpellCommit(publicPlan);report.publicClone={rejected:!publicDone.ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:String(publicDone.reason||'')};
          const tampered=Object.assign({},plan,{fingerprint:plan.fingerprint+':tampered'});before=__boundaryWorld();const tamperedDone=await bg3LearnSpellCommit(tampered);report.tamperedPlan={rejected:!tamperedDone.ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits,reason:String(tamperedDone.reason||'')};
          before=__boundaryWorld();let commits=__boundaryResourceCommits;const done=await bg3LearnSpellCommit(plan);report.success={ok:done.ok,worldChanged:before!==__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commits,reason:String(done.reason||'')};
          if(done.ok){before=__boundaryWorld();commits=__boundaryResourceCommits;const replay=await bg3LearnSpellCommit(plan);report.replay={rejected:!replay.ok,noMutation:before===__boundaryWorld(),resourceCommits:__boundaryResourceCommits-commits,reason:String(replay.reason||'')};}
        }}
      }
      report.resourceCommits=__boundaryResourceCommits;report.status=__boundaryLastStatus;report.dialog=__boundaryLastDialog;return report;
    }
    globalThis.__bg3ActionBoundary={
      async boot(ref,ids){if(!bg3CatalogUseRefs([itemClone(ref)]))throw new Error(bg3Catalog.refError||'catalog ref rejected');const index=await bg3CatalogEnsureIndex(),rows=await bg3CatalogHydrate(itemClone(ids));return {version:bg3Catalog.current.catalogVersion,profile:bg3Catalog.preferredProfile,manifestSha256:bg3Catalog.current.manifestSha256,indexCount:index.count,hydrated:rows.length,epoch:bg3Catalog.epoch};},
      audit:__boundaryAudit
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
  const storage = new Map();
  const context = {
    console,
    __boundaryConfirmQueue: [], __boundaryPromptQueue: [], __boundaryRandomCalls: 0,
    Math: Object.assign(Object.create(Math), {random() { context.__boundaryRandomCalls = (context.__boundaryRandomCalls || 0) + 1; throw new Error('Math.random is forbidden in BG3 action boundary certification'); }}),
    Date, JSON, crypto: crypto.webcrypto, TextEncoder, Blob, URL, structuredClone,
    setTimeout: () => 0, clearTimeout() {},
    confirm() { context.__boundaryConfirmCalls = (context.__boundaryConfirmCalls || 0) + 1; return context.__boundaryConfirmQueue.length ? context.__boundaryConfirmQueue.shift() === true : false; },
    prompt() { context.__boundaryPromptCalls = (context.__boundaryPromptCalls || 0) + 1; return context.__boundaryPromptQueue.length ? context.__boundaryPromptQueue.shift() : null; },
    alert() {}, fetch: localCatalogFetch, EventSource: class {},
    document: {
      activeElement: null, body: {appendChild() {}, removeChild() {}},
      getElementById: element, querySelectorAll: () => [], querySelector: () => null,
      createElement: tag => Object.assign(element('__created_' + tag), {tagName: String(tag).toUpperCase()}),
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bg3ActionBoundary;
}

function assertNegative(probe, label) {
  assert.ok(probe, `${label}: probe missing`);
  assert.equal(probe.rejected, true, `${label}: must reject`);
  assert.equal(probe.noMutation, true, `${label}: world mutated`);
  assert.equal(probe.resourceCommits, 0, `${label}: crossed item resource boundary`);
}

function addCount(object, key) {
  object[key] = (object[key] || 0) + 1;
}

test('active manifest routes every BG3 item action through an exact causal boundary', async t => {
  assert.deepEqual([...casesByProfile.keys()].sort(), ['honour', 'standard']);
  assert.equal(new Set(cases.map(row => `${row.profile}\0${row.itemId}\0${row.actionId}`)).size, cases.length);
  if (current.catalogVersion === 'bg3-24532579-v10') {
    assert.equal(cases.length, 10_356);
    assert.deepEqual(expectedHandlers, {
      bg3RootProgram: 8_384,
      bg3RuleProgram: 1_346,
      bg3RecipeProgram: 398,
      bg3LearnSpellProgram: 228,
    });
    const supportedHealingRows = cases.filter(row => row.supportedHealingSource);
    assert.equal(supportedHealingRows.length, 12);
    assert.equal(new Set(supportedHealingRows.map(row => row.itemId)).size, 6);
    assert.deepEqual(Object.fromEntries(['standard', 'honour'].map(profile => [
      profile, supportedHealingRows.filter(row => row.profile === profile).length,
    ])), {standard: 6, honour: 6});
    assert.equal(summonCases.length, 34);
    assert.equal(summonCases.filter(row => row.summonSource.family === 'typed').length, 20);
    assert.equal(summonCases.filter(row => row.summonSource.family === 'mixed').length, 14);
    assert.equal(summonCases.filter(row => row.summonSource.family === 'other').length, 0);
    assert.equal(summonCases.filter(row => row.summonSource.family === 'typed' && row.summonSource.contractOk).length, 20);
    assert.equal(summonCases.filter(row => row.summonSource.runtimeAllowed).length, 18);
    assert.equal(summonCases.filter(row => row.summonSource.family === 'typed'
      && row.summonSource.canStand && !row.summonSource.canStandMatchesBlueprint).length, 2);
    assert.deepEqual(Object.fromEntries(['standard', 'honour'].map(profile => [profile, {
      typed: summonCases.filter(row => row.profile === profile && row.summonSource.family === 'typed').length,
      mixed: summonCases.filter(row => row.profile === profile && row.summonSource.family === 'mixed').length,
      runtimeAllowed: summonCases.filter(row => row.profile === profile && row.summonSource.runtimeAllowed).length,
    }])), {standard: {typed: 10, mixed: 7, runtimeAllowed: 9}, honour: {typed: 10, mixed: 7, runtimeAllowed: 9}});
    assert.equal(arrowCases.length, 2);
    assert.equal(arrowCases.filter(row => row.arrowSource.contractOk && row.arrowSource.runtimeAllowed).length, 2);
    assert.deepEqual(Object.fromEntries(['standard', 'honour'].map(profile => [
      profile, arrowCases.filter(row => row.profile === profile).length,
    ])), {standard: 1, honour: 1});
    assert.equal(dethroneCases.length, 2);
    assert.equal(dethroneCases.filter(row => row.dethroneSource.contractOk && row.dethroneSource.runtimeAllowed).length, 2);
    assert.deepEqual(Object.fromEntries(['standard', 'honour'].map(profile => [
      profile, dethroneCases.filter(row => row.profile === profile).length,
    ])), {standard: 1, honour: 1});
  }

  const requestedProfile = String(process.env.BG3_ACTION_PROFILE || '').trim().toLowerCase();
  const requestedItem = String(process.env.BG3_ACTION_ITEM || '').trim();
  const requestedUse = String(process.env.BG3_ACTION_USE || '').trim();
  const requestedSummonOnly = /^(?:1|true|yes)$/i.test(String(process.env.BG3_ACTION_SUMMON_ONLY || '').trim());
  assert.ok(!requestedProfile || ['standard', 'honour'].includes(requestedProfile), `unknown BG3_ACTION_PROFILE ${requestedProfile}`);
  const runProfiles = requestedProfile ? [requestedProfile] : ['standard', 'honour'];
  for (const profile of runProfiles) {
    await t.test(profile, async t => {
      const allRows = casesByProfile.get(profile) || [];
      const rows = allRows.filter(row => (!requestedItem || row.itemId === requestedItem) && (!requestedUse || row.actionId === requestedUse)
        && (!requestedSummonOnly || !!row.summonSource));
      assert.ok(rows.length, `no BG3 action rows match the requested item/use filter for ${profile}`);
      const ids = [...new Set(rows.map(row => row.itemId))];
      const engine = loadEngine();
      const boot = plain(await engine.boot({
        id: 'bg3', version: current.catalogVersion, profile, manifestSha256: current.manifestSha256,
      }, ids));
      assert.equal(boot.version, current.catalogVersion);
      assert.equal(boot.profile, profile);
      assert.equal(boot.manifestSha256, current.manifestSha256);
      assert.equal(boot.indexCount, manifest.counts.items);
      assert.equal(boot.hydrated, ids.length);

      const totals = {cases: 0, compileReady: 0, compileBlocked: 0, auditErrors: 0, mismatches: 0,
        routeOpened: 0, routeBlocked: 0, missingInput: 0, fullPreflight: 0, publicClone: 0,
        tamperedPlan: 0, replay: 0, success: 0, successBlocked: 0, formulaActions: 0,
        directFormulaProbes: 0, directFormulaRejected: 0, formulaFailClosed: 0,
        supportedHealingSources: 0, confirmedHealingSuccess: 0,
        summonCarriers: 0, typedSummonCarriers: 0, mixedSummonCarriers: 0,
        summonRuntimeAllowed: 0, summonRuntimeBlocked: 0, summonSuccess: 0,
        arrowCarriers: 0, arrowRuntimeAllowed: 0, arrowRuntimeBlocked: 0, arrowSuccess: 0,
        dethroneCarriers: 0, dethroneRuntimeAllowed: 0, dethroneRuntimeBlocked: 0, dethroneSuccess: 0,
        detachedFormulaBuilt: 0, detachedFormulaAccepted: 0, detachedFormulaRejected: 0,
        byHandler: {}, byMode: {}, byModeHandler: {}, outcomesByHandler: {}, firstMismatch: null};
      const privateSignatures = new Set(), detachedFormulaSignatures = new Set();
      const shardSize = 256;
      for (let start = 0; start < rows.length; start += shardSize) {
        const shard = rows.slice(start, start + shardSize);
        await t.test(`actions ${start + 1}-${start + shard.length}`, async () => {
          for (const row of shard) {
            const label = `${row.profile}/${row.itemId}/${row.actionId}`;
            totals.cases++;addCount(totals.byHandler, row.handler);addCount(totals.byMode, row.mode);
            addCount(totals.byModeHandler, `${row.mode}|${row.handler}`);
            const family = totals.outcomesByHandler[row.handler] ||= {total: 0, ready: 0, blocked: 0, routeOpened: 0,
              routeBlocked: 0, fullPreflight: 0, success: 0, successBlocked: 0, publicClone: 0, tamperedPlan: 0,
              replay: 0, formulaActions: 0, directFormulaProbes: 0, directFormulaRejected: 0, formulaFailClosed: 0,
              supportedHealingSources: 0, confirmedHealingSuccess: 0, detachedFormulaBuilt: 0, detachedFormulaAccepted: 0, detachedFormulaRejected: 0};
            family.total++;
            let result = null;
            try {
              result = plain(await engine.audit(row.itemId, row.actionId, row.handler, profile, row.supportedHealingSource,
                row.summonSource, row.arrowSource, row.dethroneSource));
              if (result.compile?.ok) { totals.compileReady++;family.ready++; }
              else if (result.compile && typeof result.compile.ok === 'boolean') { totals.compileBlocked++;family.blocked++; }
              if (result.cancel) {
                if (result.cancel.opened) { totals.routeOpened++;family.routeOpened++; }
                else { totals.routeBlocked++;family.routeBlocked++; }
              }
              if (result.missingInput) totals.missingInput++;
              if (result.fullPreflight?.ok) { totals.fullPreflight++;family.fullPreflight++; }
              if (result.publicClone) { totals.publicClone++;family.publicClone++; }
              if (result.tamperedPlan) { totals.tamperedPlan++;family.tamperedPlan++; }
              if (result.replay) { totals.replay++;family.replay++; }
              if (result.privateSignature) privateSignatures.add(result.privateSignature);
              if (result.formula?.rows > 0) { totals.formulaActions++;family.formulaActions++; }
              if (result.directFormula) {
                totals.directFormulaProbes += result.directFormula.length;family.directFormulaProbes += result.directFormula.length;
                const rejected = result.directFormula.filter(probe => probe.rejected).length;
                totals.directFormulaRejected += rejected;family.directFormulaRejected += rejected;
              }
              if (result.formulaFailClosed) { totals.formulaFailClosed++;family.formulaFailClosed++; }
              if (row.supportedHealingSource) { totals.supportedHealingSources++;family.supportedHealingSources++; }
              if (row.summonSource) {
                totals.summonCarriers++;
                if (row.summonSource.family === 'typed') totals.typedSummonCarriers++;
                if (row.summonSource.family === 'mixed') totals.mixedSummonCarriers++;
                if (row.summonSource.runtimeAllowed) totals.summonRuntimeAllowed++;
                else totals.summonRuntimeBlocked++;
              }
              if (result.summonPrivate?.ok) totals.summonSuccess++;
              if (row.arrowSource) {
                totals.arrowCarriers++;
                if (row.arrowSource.runtimeAllowed) totals.arrowRuntimeAllowed++;
                else totals.arrowRuntimeBlocked++;
              }
              if (result.arrowPrivate?.ok) totals.arrowSuccess++;
              if (row.dethroneSource) {
                totals.dethroneCarriers++;
                if (row.dethroneSource.runtimeAllowed) totals.dethroneRuntimeAllowed++;
                else totals.dethroneRuntimeBlocked++;
              }
              if (result.dethronePrivate?.ok) totals.dethroneSuccess++;
              if (result.confirmedFormula?.ok) { totals.confirmedHealingSuccess++;family.confirmedHealingSuccess++; }
              if (result.detachedFormulaCarrier) {
                totals.detachedFormulaBuilt++;family.detachedFormulaBuilt++;detachedFormulaSignatures.add(result.detachedFormulaSignature);
                if (result.detachedFormulaCarrier.accepted) { totals.detachedFormulaAccepted++;family.detachedFormulaAccepted++; }
                else { totals.detachedFormulaRejected++;family.detachedFormulaRejected++; }
              }
              if (result.success?.ok) { totals.success++;family.success++; }
              else if (result.success) { totals.successBlocked++;family.successBlocked++; }

              assert.equal(result.fatal, undefined, `${label}: ${result.fatal || ''}`);
              assert.equal(result.profile, profile, label);
              assert.equal(result.handler, row.handler, label);
              assert.equal(result.expectedSupportedHealing, row.supportedHealingSource, `${label}: exact supported healing source census`);
              assert.deepEqual(result.expectedSummon, row.summonSource, `${label}: manifest/rule-field summon source census`);
              assert.deepEqual(result.expectedArrow, row.arrowSource, `${label}: exact Arrow source descriptor census`);
              assert.deepEqual(result.expectedDethrone, row.dethroneSource, `${label}: exact Dethrone source descriptor census`);
              assert.equal(result.exactBinding, true, `${label}: exact item/use/profile binding`);
              assertNegative(result.missingEntry, `${label}: missing entry`);
              assertNegative(result.tamperedUse, `${label}: tampered use id`);
              assert.ok(result.compile && typeof result.compile.ok === 'boolean', `${label}: compile outcome`);
              if (!result.compile.ok) {
                assert.ok(String(result.compile.reason || result.blocked?.reason || '').trim(), `${label}: exact blocker reason`);
                if (['bg3RootProgram', 'bg3RuleProgram'].includes(row.handler)) {
                  assert.equal(result.blocked.rejected, true, `${label}: blocked route must fail closed`);
                  assert.equal(result.cancel.noMutation, true, `${label}: blocked open mutated world`);
                  assert.equal(result.cancel.resourceCommits, 0, `${label}: blocked open crossed resource boundary`);
                }
              }
              if (result.cancel) {
                assert.equal(result.cancel.noMutation, true, `${label}: cancel/open changed world`);
                assert.equal(result.cancel.resourceCommits, 0, `${label}: cancel/open crossed resource boundary`);
              }
              if (row.summonSource) {
                const source = row.summonSource;
                assert.equal(source.contractOk, true, `${label}: exact source contract`);
                assert.equal(source.sourceProfile, profile, `${label}: source profile`);
                if (source.family === 'mixed') {
                  assert.equal(result.compile.ok, false, `${label}: mixed summon carrier must remain compile-blocked`);
                  assert.equal(result.cancel.promptCalls, 0, `${label}: mixed summon carrier reached private placement`);
                  assert.equal(result.cancel.confirmCalls, 0, `${label}: mixed summon carrier reached CanStand attestation`);
                  assert.equal(result.summonPrivate, undefined, `${label}: mixed summon carrier entered private runtime`);
                } else {
                  assert.equal(source.family, 'typed', `${label}: known summon carrier family`);
                  assert.equal(result.compile.ok, true, `${label}: exact typed summon source must compile`);
                  assert.ok(result.summonPrivate, `${label}: private summon route missing`);
                  assert.equal(result.summonPrivate.randomCalls, 0, `${label}: summon route invoked Math.random`);
                  if (!source.runtimeAllowed) {
                    assert.equal(source.canStand, true, `${label}: only malformed CanStand is an exact typed deny`);
                    assert.equal(source.canStandMatchesBlueprint, false, `${label}: typed deny must be the source template mismatch`);
                    assert.equal(result.summonPrivate.routed, false, `${label}: malformed CanStand routed`);
                    assert.equal(result.summonPrivate.opened, false, `${label}: malformed CanStand opened a context`);
                    assert.equal(result.summonPrivate.promptCalls, 0, `${label}: malformed CanStand prompted before rejection`);
                    assert.equal(result.summonPrivate.confirmCalls, 0, `${label}: malformed CanStand requested an attestation`);
                    assert.equal(result.summonPrivate.noMutation, true, `${label}: malformed CanStand mutated world`);
                    assert.equal(result.summonPrivate.resourceCommits, 0, `${label}: malformed CanStand crossed item resource boundary`);
                    assert.equal(result.summonPrivate.instrumentedResourceCommits, 0, `${label}: malformed CanStand reached public resource wrapper`);
                    assert.equal(result.summonPrivate.overlayCount, 0, `${label}: malformed CanStand created an overlay`);
                    assert.deepEqual(result.summonPrivate.auditAfterOpen, result.summonPrivate.auditBeforeOpen,
                      `${label}: malformed CanStand changed the private authority ledger`);
                    assert.equal(result.success, undefined, `${label}: malformed CanStand counted as success`);
                  } else {
                    const placed = {kind: 'position', coordinateSpace: 'world', worldId: 'boundary-summon-world', x: 10, y: 20, z: 30};
                    assert.equal(result.summonPrivate.routed, true, `${label}: exact private summon open route`);
                    assert.equal(result.summonPrivate.opened, true, `${label}: exact private summon context`);
                    assert.equal(result.summonPrivate.openNoMutation, true, `${label}: private summon open changed world`);
                    assert.equal(result.summonPrivate.openResourceCommits, 0, `${label}: private summon open spent the item`);
                    assert.equal(result.summonPrivate.promptCalls, 1, `${label}: in-level Wizard should request only exact position`);
                    assert.equal(result.summonPrivate.confirmCalls, source.canStand ? 1 : 0, `${label}: exact CanStand attestation count`);
                    assert.equal(result.summonPrivate.positionPublic, false, `${label}: private position leaked into public cast context`);
                    assert.equal(result.summonPrivate.target, 'ground', `${label}: public context target`);
                    assert.equal(result.summonPrivate.ok, true, `${label}: private summon confirm`);
                    assert.equal(result.summonPrivate.worldChanged, true, `${label}: summon commit needs an observable consequence`);
                    assert.equal(result.summonPrivate.resourceCommits, 1, `${label}: summon must use one source resource transaction`);
                    assert.equal(result.summonPrivate.instrumentedResourceCommits, 0, `${label}: private summon leaked into public resource wrapper`);
                    assert.equal(result.summonPrivate.overlayCount, 1, `${label}: exact player summon branch cardinality`);
                    assert.equal(result.summonPrivate.itemQty, 20 - (source.consumeKind === 'item' ? source.consumeAmount : 0), `${label}: exact source item cost`);
                    assert.equal(result.summonPrivate.audit?.phase, 'used', `${label}: terminal private proof phase`);
                    assert.equal(result.summonPrivate.audit?.resourceTransactions, 1, `${label}: private resource transaction audit`);
                    const overlay = result.summonPrivate.overlay;
                    assert.ok(overlay, `${label}: summon overlay missing`);
                    assert.equal(overlay.id, source.spellId, `${label}: overlay spell identity`);
                    assert.equal(overlay.casterId, 'boundary-actor', `${label}: overlay caster identity`);
                    assert.equal(overlay.conc, source.concentration, `${label}: concentration source flag`);
                    assert.equal(overlay.blueprintUuid, source.blueprintUuid, `${label}: exact source blueprint`);
                    assert.equal(overlay.sourceProfile, profile, `${label}: exact overlay profile`);
                    assert.equal(overlay.duration, source.duration, `${label}: exact source duration`);
                    assert.equal(overlay.stackId, source.stackId, `${label}: exact source stack`);
                    assert.deepEqual(overlay.worldPosition, placed, `${label}: exact sealed world position`);
                    assert.equal(overlay.canStandProof !== null, source.canStand, `${label}: CanStand proof presence`);
                    if (source.duration === -1) {
                      assert.equal(overlay.durationKind, 'manual', `${label}: manual duration kind`);
                      assert.equal(overlay.manualDismiss, true, `${label}: manual dismissal metadata`);
                      assert.equal(overlay.expiresAtRound, null, `${label}: manual summon expiry`);
                    } else {
                      assert.equal(overlay.durationKind, 'rounds', `${label}: finite duration kind`);
                      assert.equal(overlay.manualDismiss, false, `${label}: finite summon dismissal metadata`);
                      assert.equal(overlay.expiresAtRound, 1 + source.duration, `${label}: finite summon expiry`);
                    }
                  }
                }
              }
              if (row.arrowSource) {
                const source = row.arrowSource, arrow = result.arrowPrivate;
                const targets = ['ally:boundary-arrow-primary', 'foe:boundary-arrow-extra-1', 'foe:boundary-arrow-extra-2', 'foe:boundary-arrow-extra-3'];
                assert.equal(source.contractOk, true, `${label}: exact Arrow source contract`);
                assert.equal(source.runtimeAllowed, true, `${label}: exact Arrow runtime census`);
                assert.equal(source.profile, profile, `${label}: exact Arrow profile`);
                assert.equal(result.compile.ok, true, `${label}: exact Arrow source must compile`);
                assert.equal(result.cancel.routed, true, `${label}: noncombat Arrow cancel route`);
                assert.equal(result.cancel.opened, true, `${label}: noncombat Arrow context must open before cancel`);
                assert.equal(result.cancel.noMutation, true, `${label}: noncombat Arrow cancel mutated world`);
                assert.ok(arrow, `${label}: private Arrow route missing`);
                assert.equal(arrow.routed, true, `${label}: deterministic combat Arrow route`);
                assert.equal(arrow.opened, true, `${label}: deterministic combat Arrow context`);
                assert.equal(arrow.openNoMutation, true, `${label}: Arrow open changed world`);
                assert.equal(arrow.openResourceCommits, 0, `${label}: Arrow open spent the source item`);
                assert.equal(arrow.selectionOk, true, `${label}: ordered Arrow target/weapon selection`);
                assert.equal(arrow.selectionNoMutation, true, `${label}: Arrow selection changed world`);
                assertNegative(arrow.missingDistance, `${label}: missing explicit Arrow distance`);
                assert.equal(arrow.formulaRows, 2, `${label}: exact bounded attack/damage formula`);
                assert.deepEqual(arrow.shotResults, [true, true, true, true], `${label}: four explicit far formulas`);
                assert.deepEqual(arrow.targetOrder, targets, `${label}: exact ordered primary/ricochet targets`);
                assert.equal(arrow.ok, true, `${label}: fourth Arrow receipt did not commit`);
                assert.equal(arrow.worldChanged, true, `${label}: Arrow commit needs observable consequences`);
                assert.equal(arrow.arrowQty, 19, `${label}: Arrow source quantity 20 → 19`);
                assert.deepEqual(arrow.weapon, {
                  entrySame: true, entryId: 'boundary-arrow-weapon', itemId: 'it_shortbow_s', qty: 1,
                  equipmentEntryId: 'boundary-arrow-weapon',
                }, `${label}: selected ranged weapon must remain unchanged`);
                assert.deepEqual(arrow.combat, {actionsUsed: 1, actionUsed: true, bonusUsed: false},
                  `${label}: exact single main-action cost`);
                assert.deepEqual(arrow.damage, [6, 3, 3, 3], `${label}: exact full/half ordered damage`);
                assert.deepEqual(arrow.hpAfter, [34, 37, 37, 37], `${label}: exact ordered living-target HP`);
                assert.equal(arrow.instrumentedResourceCommits, 0, `${label}: Arrow crossed the public item-resource wrapper`);
                assert.equal(arrow.resourceCommits, 1, `${label}: Arrow private resource transaction cardinality`);
                assert.equal(arrow.randomCalls, 0, `${label}: Arrow runtime invoked Math.random`);
                assert.equal(arrow.audit?.phase, 'used', `${label}: terminal Arrow proof phase`);
                assert.equal(arrow.audit?.receiptCount, 4, `${label}: Arrow receipt cardinality`);
                assert.equal(arrow.audit?.resourceTransactions, 1, `${label}: Arrow resource audit cardinality`);
                assert.deepEqual(arrow.audit?.receipts?.map(receipt => receipt.target), targets,
                  `${label}: Arrow audit receipt order`);
                assert.deepEqual(arrow.audit?.receipts?.map(receipt => receipt.artifact), source.chain.map(row => row.artifact),
                  `${label}: Arrow audit source chain`);
                assert.deepEqual(arrow.audit?.receipts?.map(receipt => receipt.damageScale), ['1/1', '1/2', '1/2', '1/2'],
                  `${label}: Arrow audit damage scales`);
                assert.deepEqual(arrow.audit?.outcomes, targets.map((target, order) => ({order, target, hit: true, damage: order ? 3 : 6})),
                  `${label}: Arrow ordered outcome receipt`);
              }
              if (row.dethroneSource) {
                const source = row.dethroneSource, dethrone = result.dethronePrivate, pins = DETHRONE_PROFILES[profile];
                assert.equal(source.contractOk, true, `${label}: exact Dethrone source contract`);
                assert.equal(source.runtimeAllowed, true, `${label}: exact Dethrone runtime census`);
                assert.equal(source.profile, profile, `${label}: exact Dethrone profile`);
                assert.equal(source.useSha256, pins.useSha256, `${label}: frozen Dethrone use pin`);
                assert.equal(source.useProgramSha256, pins.useProgramSha256, `${label}: frozen Dethrone item-program pin`);
                assert.equal(source.rootSha256, pins.rootSha256, `${label}: frozen Dethrone root-program pin`);
                assert.equal(source.ruleProgramSha256, pins.ruleProgramSha256, `${label}: frozen Dethrone rule-program pin`);
                assert.equal(source.projectionSha256, pins.projectionSha256, `${label}: frozen Dethrone projection pin`);
                assert.equal(result.compile.ok, true, `${label}: exact Dethrone source must compile`);
                assert.equal(result.cancel.routed, true, `${label}: Dethrone cancel route`);
                assert.equal(result.cancel.opened, true, `${label}: Dethrone context must open before cancel`);
                assert.equal(result.cancel.noMutation, true, `${label}: Dethrone cancel mutated world`);
                assert.ok(dethrone, `${label}: private Dethrone route missing`);
                assertNegative(dethrone.proofless, `${label}: proofless Dethrone carrier`);
                assert.equal(dethrone.routed, true, `${label}: deterministic combat Dethrone route`);
                assert.equal(dethrone.opened, true, `${label}: deterministic combat Dethrone context`);
                assert.equal(dethrone.openNoMutation, true, `${label}: Dethrone open changed world`);
                assert.equal(dethrone.openResourceCommits, 0, `${label}: Dethrone open spent the scroll`);
                assertNegative(dethrone.missingDistance, `${label}: missing explicit Dethrone distance`);
                assert.equal(dethrone.selectionOk, true, `${label}: exact Dethrone target and distance selection`);
                assert.equal(dethrone.selectionNoMutation, true, `${label}: Dethrone target selection changed world`);
                assert.equal(dethrone.target, 'ally:boundary-dethrone-target', `${label}: exact living target`);
                assert.equal(dethrone.formulaRows, 2, `${label}: exact Constitution save and 10d6 formula`);
                assert.equal(dethrone.ok, true, `${label}: Dethrone proof did not commit`);
                assert.equal(dethrone.worldChanged, true, `${label}: Dethrone commit needs observable consequences`);
                assert.equal(dethrone.itemQty, 19, `${label}: Dethrone scroll quantity 20 → 19`);
                assert.equal(dethrone.targetHp, 40, `${label}: exact failed-save target HP`);
                assert.equal(dethrone.damage, 60, `${label}: exact entered 10d6+20 damage`);
                assert.deepEqual(dethrone.combat, {
                  actionsUsed: 1, actionUsed: true, bonusUsed: false, actionKind: 'other',
                  spellCasts: [{id: DETHRONE_SPELL_ID, level: 5, cost: 'action'}],
                }, `${label}: exact Dethrone action and successful spell ledger`);
                assert.deepEqual(dethrone.slots, {
                  sameRef: true, before: {'5': {cur: 1, max: 1}}, after: {'5': {cur: 1, max: 1}},
                }, `${label}: Dethrone must not spend a spell slot`);
                assert.equal(dethrone.instrumentedResourceCommits, 0, `${label}: Dethrone crossed the public item-resource wrapper`);
                assert.equal(dethrone.resourceCommits, 1, `${label}: Dethrone private resource transaction cardinality`);
                assert.equal(dethrone.randomCalls, 0, `${label}: Dethrone runtime invoked Math.random`);
                assert.equal(dethrone.audit?.phase, 'used', `${label}: terminal Dethrone proof phase`);
                assert.equal(dethrone.audit?.profile, profile, `${label}: terminal Dethrone profile`);
                assert.equal(dethrone.audit?.branch, 'failed-save-full', `${label}: exact failed-save branch`);
                assert.equal(dethrone.audit?.scrollCheckRequired, false, `${label}: level-nine Wizard scroll check`);
                assert.equal(dethrone.audit?.saveNatural, 1, `${label}: entered Constitution d20`);
                assert.equal(dethrone.audit?.saveTotal, 1, `${label}: exact Constitution total`);
                assert.equal(dethrone.audit?.saveSucceeded, false, `${label}: exact failed Constitution save`);
                assert.equal(dethrone.audit?.entered10d6, 40, `${label}: entered physical 10d6 total`);
                assert.equal(dethrone.audit?.damage, 60, `${label}: exact private Dethrone damage`);
                assert.equal(dethrone.audit?.damageType, 'Necrotic', `${label}: exact damage type`);
                assert.equal(dethrone.audit?.magical, true, `${label}: exact magical damage flag`);
                assert.equal(dethrone.audit?.oldHp, 100, `${label}: exact pre-damage HP`);
                assert.equal(dethrone.audit?.newHp, 40, `${label}: exact post-damage HP`);
                assert.equal(dethrone.audit?.resourceTransactions, 1, `${label}: Dethrone resource audit cardinality`);
              }
              if (row.handler === 'bg3RecipeProgram' && result.compile.ok) {
                assert.ok(result.recipeRefs && result.recipeRefs.declared > 0, `${label}: exact recipe reference census`);
                assert.ok(result.recipeRefs.available > 0, `${label}: no exact linked recipe remains executable`);
                assert.equal(result.fullPreflight?.ok, true, `${label}: first exact available recipe did not preflight`);
                assert.ok((result.cancel.promptCalls || 0) + (result.cancel.confirmCalls || 0) > 0,
                  `${label}: recipe route did not reach exact choice/confirmation UI`);
              }
              if (result.missingInput) assertNegative(result.missingInput, `${label}: missing declared player input`);
              if (result.publicClone) assertNegative(result.publicClone, `${label}: detached public plan/outcome clone`);
              if (result.tamperedPlan) assertNegative(result.tamperedPlan, `${label}: tampered prepared plan`);
              if (result.replay) assertNegative(result.replay, `${label}: committed private plan/outcome replay`);
              if (result.detachedFormulaCarrier) {
                assert.equal(result.detachedFormulaCarrier.noMutation, true, `${label}: detached formula preflight mutated world`);
                assert.equal(result.detachedFormulaCarrier.resourceCommits, 0, `${label}: detached formula preflight crossed resource boundary`);
                if (result.privateSignature) assert.equal(result.detachedFormulaCarrier.rejected, true, `${label}: private outcome clone must fail preflight`);
              }
              if (result.directFormula) for (const probe of result.directFormula) assertNegative(probe, `${label}: public ${probe.route}`);
              if (result.formula?.rows > 0 && !row.supportedHealingSource && !row.arrowSource && !row.dethroneSource) {
                assert.equal(result.cancel.opened, false, `${label}: unsupported official formula opened a cast context`);
                assert.equal(result.cancel.routed, false, `${label}: unsupported official formula route must fail closed`);
                assert.equal(result.success, undefined, `${label}: unsupported formula must not be counted as a success`);
              }
              if (row.supportedHealingSource) {
                assert.equal(result.compile.ok, true, `${label}: supported healing source must compile`);
                assert.ok(result.formula?.rows > 0, `${label}: supported healing source must request physical dice`);
                assert.equal(result.formula.complete, true, `${label}: supported healing formula must accept minimum physical-die values: ${result.formula.reason}`);
              }
              if (result.formula?.rows > 0 && result.formula.complete && !row.arrowSource && !row.dethroneSource) {
                assert.equal(result.directFormula?.length, 3, `${label}: all public formula carriers must be checked`);
                if (row.supportedHealingSource) {
                  assert.equal(result.cancel.opened, true, `${label}: supported source must open the real item UI`);
                  assert.ok(result.confirmedFormula, `${label}: supported source needs Open → Show → entered values → Confirm`);
                  assert.equal(result.confirmedFormula.openNoMutation, true, `${label}: opening supported formula changed world`);
                  assert.equal(result.confirmedFormula.openResourceCommits, 0, `${label}: opening supported formula spent the item`);
                  assert.equal(result.confirmedFormula.staged, true, `${label}: Show did not build the production formula`);
                  assert.ok(result.confirmedFormula.rows > 0, `${label}: Show returned no formula rows`);
                  assert.equal(result.confirmedFormula.ok, true, `${label}: real Confirm did not commit: ${result.confirmedFormula.reason}`);
                  assert.equal(result.confirmedFormula.worldChanged, true, `${label}: real Confirm needs an observable consequence`);
                  assert.equal(result.confirmedFormula.resourceCommits, 1, `${label}: real Confirm must cross one item resource boundary`);
                  assert.deepEqual(result.healingConsequences, {hp: 5, qty: 19, burning: false, instantMarker: false},
                    `${label}: exact 2d4+2 healing/removal/consumption consequences`);
                } else {
                  assertNegative(result.formulaFailClosed, `${label}: unsupported official formula action`);
                }
              }
              if (result.success?.ok) {
                assert.equal(result.success.worldChanged, true, `${label}: successful boundary needs an observable consequence`);
                if (['bg3RootProgram', 'bg3RuleProgram'].includes(row.handler)) assert.equal(result.success.resourceCommits, 1, `${label}: one item resource commit`);
              } else if (result.success) {
                assert.equal(result.success.resourceCommits, 0, `${label}: rejected success probe crossed resource boundary`);
              }
            } catch (error) {
              if (!result) totals.auditErrors++;
              totals.mismatches++;
              if (!totals.firstMismatch) totals.firstMismatch = {
                profile: row.profile, itemId: row.itemId, actionId: row.actionId, handler: row.handler, mode: row.mode,
                compileReason: String(result?.compile?.reason || result?.blocked?.reason || ''),
                message: String(error?.message || error), stack: String(error?.stack || '').split('\n').slice(0, 16).join('\n'), result,
              };
            }
          }
        });
      }
      assert.equal(totals.cases, rows.length);
      assert.deepEqual(totals.byHandler, Object.fromEntries(Map.groupBy(rows, row => row.handler).entries()
        .map(([handler, handlerRows]) => [handler, handlerRows.length])));
      totals.privateContractSignatures = privateSignatures.size;
      totals.detachedFormulaSignatures = detachedFormulaSignatures.size;
      t.diagnostic(`BG3_ACTION_BOUNDARY ${JSON.stringify({profile, ...totals})}`);
      assert.equal(totals.firstMismatch, null, `BG3 action boundary first mismatch: ${JSON.stringify(totals.firstMismatch)}`);
      assert.equal(totals.compileReady + totals.compileBlocked, rows.length);
      const expectedArrowRows = rows.filter(row => row.arrowSource);
      assert.equal(totals.arrowCarriers, expectedArrowRows.length);
      assert.equal(totals.arrowRuntimeAllowed, expectedArrowRows.filter(row => row.arrowSource.runtimeAllowed).length);
      assert.equal(totals.arrowRuntimeBlocked, expectedArrowRows.filter(row => !row.arrowSource.runtimeAllowed).length);
      assert.equal(totals.arrowSuccess, expectedArrowRows.filter(row => row.arrowSource.runtimeAllowed).length);
      const expectedDethroneRows = rows.filter(row => row.dethroneSource);
      assert.equal(totals.dethroneCarriers, expectedDethroneRows.length);
      assert.equal(totals.dethroneRuntimeAllowed, expectedDethroneRows.filter(row => row.dethroneSource.runtimeAllowed).length);
      assert.equal(totals.dethroneRuntimeBlocked, expectedDethroneRows.filter(row => !row.dethroneSource.runtimeAllowed).length);
      assert.equal(totals.dethroneSuccess, expectedDethroneRows.filter(row => row.dethroneSource.runtimeAllowed).length);
      if (requestedItem === ARROW_MANY_TARGETS_ITEM_ID) {
        assert.equal(totals.arrowCarriers, 1);
        assert.equal(totals.arrowRuntimeAllowed, 1);
        assert.equal(totals.arrowSuccess, 1);
      }
      if (requestedItem === DETHRONE_ITEM_ID) {
        assert.equal(totals.dethroneCarriers, 1);
        assert.equal(totals.dethroneRuntimeAllowed, 1);
        assert.equal(totals.dethroneRuntimeBlocked, 0);
        assert.equal(totals.dethroneSuccess, 1);
      }
      if (current.catalogVersion === 'bg3-24532579-v10' && !requestedItem && !requestedUse) {
        if (!requestedSummonOnly) {
          assert.equal(totals.supportedHealingSources, 6);
          assert.equal(totals.confirmedHealingSuccess, 6);
        }
        assert.equal(totals.summonCarriers, 17);
        assert.equal(totals.typedSummonCarriers, 10);
        assert.equal(totals.mixedSummonCarriers, 7);
        assert.equal(totals.summonRuntimeAllowed, 9);
        assert.equal(totals.summonRuntimeBlocked, 8);
        assert.equal(totals.summonSuccess, 9);
        if (!requestedSummonOnly) {
          assert.equal(totals.arrowCarriers, 1);
          assert.equal(totals.arrowRuntimeAllowed, 1);
          assert.equal(totals.arrowRuntimeBlocked, 0);
          assert.equal(totals.arrowSuccess, 1);
          assert.equal(totals.dethroneCarriers, 1);
          assert.equal(totals.dethroneRuntimeAllowed, 1);
          assert.equal(totals.dethroneRuntimeBlocked, 0);
          assert.equal(totals.dethroneSuccess, 1);
        }
      }
    });
  }
});

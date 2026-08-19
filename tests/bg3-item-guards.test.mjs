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
 * Source-bound guard audit for the small v8 gap left after the catalog
 * compiler's ordinary scroll validation delegations.
 *
 * The exceptional ActionDataType 12 records deliberately stay fail-closed in
 * the production engine until its runtime owns the exact tuple attested below.
 * This file therefore tests both the present boundary and the result of
 * removing only that already-attested source guard. It separately preserves
 * the CanStand scene blocker even where the catalog projection says typed,
 * and never treats an arbitrary CanUseSpellScroll predicate as executable.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {catalogRoot, manifest} = selectBg3Catalog(repo);
const jsonCache = new Map();
const WIZARD_CLASS_DESCRIPTION_UUID = 'a865965f-501b-46e9-9eaa-7748e8c04d09';
const EXPECTED_EXCEPTIONAL_STATS = new Set([
  'UNI_LOW_DethroneScroll',
  'OBJ_Scrolls_FindFamiliar',
  'UNI_LOW_CurriculumOfStrategyScroll',
  'UNI_TWN_Scroll_FleshToGold',
  'UNI_LOW_BestialCommunionScroll',
  'OBJ_Wall_Of_Stone',
]);
const EXPECTED_PROJECTION_READY_STATS = new Set([
  'UNI_LOW_DethroneScroll',
  'UNI_LOW_CurriculumOfStrategyScroll',
  'UNI_LOW_BestialCommunionScroll',
  'OBJ_Wall_Of_Stone',
]);
const EXPECTED_SCOPE_UNLOCK_STATS = new Set([
  'UNI_LOW_DethroneScroll',
  'UNI_LOW_CurriculumOfStrategyScroll',
  'OBJ_Wall_Of_Stone',
]);
const EXPECTED_EXCEPTIONAL_SOURCES = new Map([
  ['UNI_LOW_DethroneScroll', {
    itemId: 'bg3:item:rt:b2e1168a-021d-4a81-a041-6d2e1421a1fb:stats:VU5JX0xPV19EZXRocm9uZVNjcm9sbA',
    spellId: 'Projectile_CursedTome_Dethrone',
  }],
  ['OBJ_Scrolls_FindFamiliar', {
    itemId: 'bg3:item:rt:fb975b01-40d5-49a3-b60a-d2f13a1f8009:stats:T0JKX1Njcm9sbHNfRmluZEZhbWlsaWFy',
    spellId: 'Target_FindFamiliar',
  }],
  ['UNI_LOW_CurriculumOfStrategyScroll', {
    itemId: 'bg3:item:rt:21e67b0e-913d-411a-9046-6c54e8d0bf53:stats:VU5JX0xPV19DdXJyaWN1bHVtT2ZTdHJhdGVneVNjcm9sbA',
    spellId: 'Projectile_CursedTome_CurriculumofStrategy',
  }],
  ['UNI_TWN_Scroll_FleshToGold', {
    itemId: 'bg3:item:rt:a9135751-3a8a-4070-9f3a-11d24d123a3f:stats:VU5JX1RXTl9TY3JvbGxfRmxlc2hUb0dvbGQ',
    spellId: 'Target_FleshToStone',
  }],
  ['UNI_LOW_BestialCommunionScroll', {
    itemId: 'bg3:item:rt:b627f83f-8533-4440-95a0-ad2f319fe4ed:stats:VU5JX0xPV19CZXN0aWFsQ29tbXVuaW9uU2Nyb2xs',
    spellId: 'Target_CursedTome_Seelie_Summon',
  }],
  ['OBJ_Wall_Of_Stone', {
    itemId: 'bg3:item:rt:d13587f4-a1f4-4833-bd1e-da1c7951d680:stats:T0JKX1dhbGxfT2ZfU3RvbmU',
    spellId: 'Wall_WallOfStone',
  }],
]);

function readJson(file) {
  const absolute = path.resolve(file);
  if (!jsonCache.has(absolute)) jsonCache.set(absolute, JSON.parse(fs.readFileSync(absolute, 'utf8')));
  return jsonCache.get(absolute);
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

function loadRows(group, key) {
  return (manifest.files[group] || []).flatMap(meta => readJson(path.join(repo, ...meta.path.split('/')))[key]);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function same(a, b) {
  return canonical(a) === canonical(b);
}

function tupleClone(row) {
  return plain({
    variant: {
      profile: row.variant.profile,
      item: {id: row.variant.item.id, source: {statsId: row.variant.item.source.statsId}},
    },
    use: row.use,
    root: row.root,
  });
}

function predicates(value, name, out = []) {
  if (Array.isArray(value)) {
    for (const row of value) predicates(row, name, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.kind === 'predicate' && value.name === name) out.push(value);
  for (const child of Object.values(value)) predicates(child, name, out);
  return out;
}

const rootPrograms = loadRows('rootTemplatePrograms', 'programs');
const rootById = new Map(rootPrograms.map(program => [program.id, program]));
const ruleRows = loadRows('rules', 'rules');
const itemVariants = loadRows('items', 'items').flatMap(item => {
  const honour = item.source && item.source.honourOverlay && item.source.honourOverlay.item;
  return [
    {item, profile: 'standard', mechanics: item.mechanics},
    {item, profile: 'honour', mechanics: honour && honour.mechanics || item.mechanics},
  ];
});

const exceptionalA12 = itemVariants.flatMap(variant => (variant.mechanics && variant.mechanics.actions || []).map(use => {
  const root = use.program && rootById.get(use.program.id);
  return {variant, use, root};
})).filter(row => row.root && row.root.actionType === 12
  && predicates(row.root.validation, 'CanUseSpellScroll').length > 0);

const partyPrograms = ruleRows.flatMap(rule => ['standard', 'honour'].map(profile => ({
  rule,
  profile,
  program: rule.programs && rule.programs[profile],
}))).filter(row => row.program && predicates(row.program, 'Party').length > 0);
const exactHonourPartyPrograms = partyPrograms.filter(row => row.profile === 'honour'
  && row.rule.bg3Id === 'Target_FeignDeath'
  && row.program.fields.some(field => field.field === 'TargetConditions' && field.role === 'target-guard'
    && field.raw === 'Character() and Party()'
    && predicates(field, 'Party').length === 1
    && predicates(field, 'Party')[0].args.length === 0));
const exactHonourPartyProgramIds = new Set(exactHonourPartyPrograms.map(row => row.program.id));
const partyCarriers = itemVariants.flatMap(variant => (variant.mechanics && variant.mechanics.actions || []).map(use => {
  const root = use.program && rootById.get(use.program.id);
  const refs = [...(use.program && use.program.projection && use.program.projection.entrypoints || []),
    ...(use.program && use.program.projection && use.program.projection.transitive || [])];
  return {variant, use, root, refs};
})).filter(row => row.refs.some(ref => exactHonourPartyProgramIds.has(ref && ref.programId)));

function exactExceptionalA12Tuple(row) {
  const use = row && row.use, root = row && row.root, contract = use && use.program;
  const validation = root && root.validation, guard = validation && validation[0], condition = guard && guard.condition;
  const args = condition && condition.args, spellId = args && args[0] && args[0].value;
  const attrs = root && root.attributes, source = root && root.sourceAction;
  const primary = contract && contract.sourceAction && contract.sourceAction.primary;
  const commit = root && root.commit && root.commit[0], binding = commit && commit.binding;
  const consequences = root && root.consequences, invoke = consequences && consequences[0];
  const projection = contract && contract.projection, rootProjection = root && root.projection;
  const entrypoints = projection && projection.entrypoints, entry = entrypoints && entrypoints[0];
  const expectedConditions = spellId && `CanUseSpellScroll(${JSON.stringify(spellId)})`;
  const statsId = row && row.variant && row.variant.item && row.variant.item.source
    && row.variant.item.source.statsId;
  const exactSource = EXPECTED_EXCEPTIONAL_SOURCES.get(statsId);
  const failures = [];
  const require = (value, reason) => { if (!value) failures.push(reason); };

  require(use && use.handler === 'bg3RuleProgram', 'handler');
  require(exactSource && row.variant.item.id === exactSource.itemId && spellId === exactSource.spellId,
    'exact-exceptional-source');
  require(use && use.cost === 'action', 'use-cost');
  require(use && use.consume && use.consume.kind === 'item' && +use.consume.amount === 1, 'use-consume');
  require(contract && contract.commitPolicy === 'item-action-contract-once', 'commit-policy');
  require(contract && contract.invokedRuleResourceCostPolicy === 'caller-item-action', 'caller-resource-policy');
  require(contract && !contract.scroll, 'exceptional-path-must-not-claim-scroll-contract');
  require(root && root.schemaVersion === 'bg3-rule-program/1' && root.id === contract?.id, 'root-identity');
  require(root && root.sourceProfile === contract?.sourceProfile && root.sourceProfile === row?.variant?.profile, 'profile');
  require(root && root.actionType === 12 && root.trigger === 'OnUsePeaceActions'
    && root.executionModel === 'validate-commit-consequences' && root.mode === 'typed', 'root-action');
  require(Array.isArray(validation) && validation.length === 1 && guard && guard.op === 'guard'
    && guard.executable === true && guard.phase === 'validation', 'guard-opcode');
  require(condition && condition.kind === 'predicate' && condition.name === 'CanUseSpellScroll'
    && Array.isArray(args) && args.length === 1 && args[0].kind === 'string'
    && typeof spellId === 'string' && spellId.length > 0, 'guard-signature');
  require(!root.validationDelegations || root.validationDelegations.length === 0, 'no-preexisting-delegation');
  require(attrs && Object.keys(attrs).sort().join('|') === 'ActionType|Animation|ClassId|Conditions|Consume|SkillID', 'attribute-keyset');
  require(attrs && attrs.ActionType === '12' && attrs.Animation === ''
    && attrs.ClassId === WIZARD_CLASS_DESCRIPTION_UUID && attrs.Consume === 'True'
    && attrs.SkillID === spellId && attrs.Conditions === expectedConditions, 'attributes');
  require(source && source.actionType === 12 && source.rootProgramId === root?.id
    && source.trigger === root?.trigger && same(source.attributes, attrs), 'root-source-action');
  require(primary && primary.actionType === 12 && primary.rootProgramId === root?.id
    && primary.trigger === root?.trigger && same(primary.attributes, attrs), 'item-source-action');
  require(contract && contract.sourceAction && Array.isArray(contract.sourceAction.aliases)
    && contract.sourceAction.aliases.length === 0, 'source-aliases');
  require(Array.isArray(root?.commit) && root.commit.length === 1 && commit && commit.op === 'commitFromItemAction'
    && commit.executable === true && commit.mutation === 'delegated-to-item-action-contract'
    && commit.phase === 'commit', 'commit-opcode');
  require(binding && binding.cost === use?.cost && binding.consume && same(binding.consume, use?.consume), 'commit-binding');
  require(Array.isArray(consequences) && consequences.length === 1 && invoke && invoke.op === 'invokeRuleProgram'
    && invoke.executable === true && invoke.phase === 'consequences', 'invoke-opcode');
  require(invoke && invoke.programId === contract?.ruleProgramId && invoke.sourceProfile === contract?.ruleSourceProfile
    && invoke.sourceProfile === root?.sourceProfile && invoke.artifact === contract?.artifact
    && invoke.resourceCostPolicy === 'caller-item-action'
    && invoke.executionPolicy === 'all-reachable-opcodes-or-fail-closed', 'invoke-binding');
  require(projection && rootProjection && same(projection, rootProjection), 'projection-copy');
  require(projection && projection.schemaVersion === 'bg3-action-rule-projection/1'
    && projection.context === 'generic' && projection.sourceProfile === root?.sourceProfile
    && projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && Array.isArray(projection.unresolved) && projection.unresolved.length === 0, 'projection-header');
  require(Array.isArray(entrypoints) && entrypoints.length === 1 && entry && entry.kind === 'spell'
    && entry.bg3Id === spellId && entry.programId === contract?.ruleProgramId
    && entry.artifact === contract?.artifact && entry.sourceProfile === root?.sourceProfile, 'projection-entrypoint');

  return {
    ok: failures.length === 0,
    failures,
    spellId,
    projectionReady: !!(projection && projection.complete === true && projection.mode === 'typed'
      && entry && entry.mode === 'typed'),
  };
}

function programsFor(row) {
  const refs = [...(row.use.program.projection.entrypoints || []), ...(row.use.program.projection.transitive || [])];
  const seen = new Set(), programs = [];
  for (const ref of refs) {
    const key = `${ref.artifact}\0${ref.programId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const payload = readJson(catalogFile(ref.artifact));
    const rule = (payload.rules || []).find(candidate => candidate.id === ref.ruleId);
    const program = rule && rule.programs && rule.programs[row.variant.profile];
    assert.ok(program, `${row.variant.item.source.statsId}/${row.variant.profile}: ${ref.programId}`);
    assert.equal(program.id, ref.programId);
    programs.push({program, artifact: ref.artifact});
  }
  return programs;
}

function removeExactZeroArgParty(condition) {
  if (!condition || typeof condition !== 'object') return condition;
  if (condition.kind === 'predicate' && condition.name === 'Party'
      && Array.isArray(condition.args) && condition.args.length === 0) return null;
  if (condition.kind === 'not') {
    const operand = removeExactZeroArgParty(condition.operand);
    return operand ? {...condition, operand} : null;
  }
  if (condition.kind === 'and' || condition.kind === 'or') {
    const operands = (condition.operands || []).map(removeExactZeroArgParty).filter(Boolean);
    if (operands.length === 0) return null;
    if (operands.length === 1) return operands[0];
    return {...condition, operands};
  }
  return condition;
}

function programsWithExactPartyCompileHelper(programs) {
  const copy = plain(programs);
  for (const entry of copy) {
    if (!exactHonourPartyProgramIds.has(entry.program && entry.program.id)) continue;
    for (const field of entry.program.fields || []) for (const opcode of field.bytecode || []) {
      if (!opcode || !opcode.condition) continue;
      const condition = removeExactZeroArgParty(opcode.condition);
      assert.ok(condition, 'the exact Feign Death guard must retain Character()');
      opcode.condition = condition;
    }
  }
  return copy;
}

function loadEngine() {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  let source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  source = source.replace(/\(async function init\(\)\{[\s\S]*$/, '');
  source += `
    globalThis.__bg3ItemGuardAudit = {
      setProfile(profile) { bg3Catalog.preferredProfile=profile; },
      setChars(rows) { chars=rows; },
      compile: bg3RuleProgramCompile,
      report: bg3RuleProgramReport,
      planOf: bg3RuleProgramPlanOf,
      installPlan: bg3RuleProgramInstall,
      preflight: bg3RuleProgramPreflight,
      directApply: useItemApply,
      formulaAudit: globalThis.bg3ItemFormulaOutcomeAudit,
      setWorld(caster, target, item) {
        chars=[caster]; foesDB=[target]; itemsDB=[item]; activeCharId=caster.id;
        combat={active:false, order:[], turn:null, log:[]};
        bg3Catalog.preferredVersion='bg3-24532579-v8';
        bg3Catalog.preferredProfile='standard';
        bg3Catalog.preferredManifestSha256='1'.repeat(64);
        bg3Catalog.items.set(item.id,item);
      },
      guardSupported: bg3ProgramGuardSupported,
      guardResult: bg3ProgramGuardResult
    };
  `;
  const elements = new Map(), stored = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '',
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; },
    });
    return elements.get(id);
  };
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {random: () => { throw new Error('guard tests must not generate dice'); }}),
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
    fetch: async () => ({ok: true, json: async () => ({})}),
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
    },
    localStorage: {
      getItem: key => stored.has(key) ? stored.get(key) : null,
      setItem: (key, value) => stored.set(key, String(value)),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bg3ItemGuardAudit;
}

const mutationCases = [
  ['item id', row => { row.variant.item.id += ':other'; }],
  ['source stats id', row => { row.variant.item.source.statsId += '_Other'; }],
  ['handler', row => { row.use.handler = 'bg3RootProgram'; }],
  ['use cost', row => { row.use.cost = 'bonus'; }],
  ['use consume kind', row => { row.use.consume.kind = 'none'; }],
  ['use consume amount', row => { row.use.consume.amount = 2; }],
  ['commit policy', row => { row.use.program.commitPolicy = 'other'; }],
  ['caller resource policy', row => { row.use.program.invokedRuleResourceCostPolicy = 'callee'; }],
  ['fabricated scroll contract', row => { row.use.program.scroll = {schemaVersion: 'bg3-scroll-action/1'}; }],
  ['root id', row => { row.root.id += ':tampered'; }],
  ['profile', row => { row.root.sourceProfile = row.root.sourceProfile === 'standard' ? 'honour' : 'standard'; }],
  ['action type', row => { row.root.actionType = 33; }],
  ['trigger', row => { row.root.trigger = 'OnDestroyActions'; }],
  ['execution model', row => { row.root.executionModel = 'other'; }],
  ['root mode', row => { row.root.mode = 'mixed'; }],
  ['guard cardinality', row => { row.root.validation.push(plain(row.root.validation[0])); }],
  ['guard opcode', row => { row.root.validation[0].op = 'manual'; }],
  ['guard executable', row => { row.root.validation[0].executable = false; }],
  ['guard phase', row => { row.root.validation[0].phase = 'consequences'; }],
  ['predicate name', row => { row.root.validation[0].condition.name = 'CanStand'; }],
  ['predicate argument kind', row => { row.root.validation[0].condition.args[0].kind = 'symbol'; }],
  ['predicate argument value', row => { row.root.validation[0].condition.args[0].value += '_Other'; }],
  ['preexisting delegation', row => { row.root.validationDelegations = [{predicate: 'CanUseSpellScroll'}]; }],
  ['attribute keyset', row => { row.root.attributes.Unknown = '1'; }],
  ['attribute ActionType', row => { row.root.attributes.ActionType = '33'; }],
  ['attribute animation', row => { row.root.attributes.Animation = 'unexpected'; }],
  ['attribute class', row => { row.root.attributes.ClassId = 'other'; }],
  ['attribute consume', row => { row.root.attributes.Consume = 'False'; }],
  ['attribute SkillID', row => { row.root.attributes.SkillID += '_Other'; }],
  ['attribute Conditions', row => { row.root.attributes.Conditions += ' '; }],
  ['root source action', row => { row.root.sourceAction.rootProgramId += ':other'; }],
  ['item source action', row => { row.use.program.sourceAction.primary.rootProgramId += ':other'; }],
  ['source aliases', row => { row.use.program.sourceAction.aliases.push({rootProgramId: 'other'}); }],
  ['commit cardinality', row => { row.root.commit.push(plain(row.root.commit[0])); }],
  ['commit opcode', row => { row.root.commit[0].op = 'consumeResource'; }],
  ['commit executable', row => { row.root.commit[0].executable = false; }],
  ['commit mutation', row => { row.root.commit[0].mutation = 'direct'; }],
  ['commit phase', row => { row.root.commit[0].phase = 'validation'; }],
  ['commit cost binding', row => { row.root.commit[0].binding.cost = 'bonus'; }],
  ['commit consume binding', row => { row.root.commit[0].binding.consume.amount = 2; }],
  ['consequence cardinality', row => { row.root.consequences.push(plain(row.root.consequences[0])); }],
  ['invoke opcode', row => { row.root.consequences[0].op = 'manual'; }],
  ['invoke executable', row => { row.root.consequences[0].executable = false; }],
  ['invoke phase', row => { row.root.consequences[0].phase = 'validation'; }],
  ['invoke program', row => { row.root.consequences[0].programId += ':other'; }],
  ['invoke profile', row => { row.root.consequences[0].sourceProfile = 'other'; }],
  ['invoke artifact', row => { row.root.consequences[0].artifact = 'rules/spells/00.json'; }],
  ['invoke resource policy', row => { row.root.consequences[0].resourceCostPolicy = 'callee'; }],
  ['invoke execution policy', row => { row.root.consequences[0].executionPolicy = 'partial'; }],
  ['projection copy', row => { row.root.projection.context = 'scroll'; }],
  ['projection schema', row => { row.use.program.projection.schemaVersion = 'other'; }],
  ['projection context', row => { row.use.program.projection.context = 'scroll'; }],
  ['projection profile', row => { row.use.program.projection.sourceProfile = 'other'; }],
  ['projection policy', row => { row.use.program.projection.executionPolicy = 'partial'; }],
  ['projection unresolved', row => { row.use.program.projection.unresolved.push({kind: 'spell'}); }],
  ['entrypoint cardinality', row => { row.use.program.projection.entrypoints.push(plain(row.use.program.projection.entrypoints[0])); }],
  ['entrypoint kind', row => { row.use.program.projection.entrypoints[0].kind = 'status'; }],
  ['entrypoint bg3 id', row => { row.use.program.projection.entrypoints[0].bg3Id += '_Other'; }],
  ['entrypoint program', row => { row.use.program.projection.entrypoints[0].programId += ':other'; }],
  ['entrypoint artifact', row => { row.use.program.projection.entrypoints[0].artifact = 'rules/spells/00.json'; }],
  ['entrypoint profile', row => { row.use.program.projection.entrypoints[0].sourceProfile = 'other'; }],
];

test('v8 exceptional A12 census is 12 profiles: 8 projection-ready but only 6 in guard-batch scope', () => {
  assert.equal(exceptionalA12.length, 12);
  assert.deepEqual(new Set(exceptionalA12.map(row => row.variant.item.source.statsId)), EXPECTED_EXCEPTIONAL_STATS);
  assert.deepEqual(new Set(exceptionalA12.map(row => row.variant.profile)), new Set(['standard', 'honour']));
  for (const row of exceptionalA12) {
    const checked = exactExceptionalA12Tuple(row);
    assert.equal(checked.ok, true, `${row.variant.item.source.statsId}/${row.variant.profile}: ${checked.failures}`);
    const expected = EXPECTED_EXCEPTIONAL_SOURCES.get(row.variant.item.source.statsId);
    assert.equal(row.variant.item.id, expected.itemId);
    assert.equal(checked.spellId, expected.spellId);
  }
  const projectionReady = exceptionalA12.filter(row => exactExceptionalA12Tuple(row).projectionReady);
  assert.equal(projectionReady.length, 8);
  assert.deepEqual(new Set(projectionReady.map(row => row.variant.item.source.statsId)), EXPECTED_PROJECTION_READY_STATS);
  const scopeReady = projectionReady.filter(row => programsFor(row)
    .every(entry => predicates(entry.program, 'CanStand').length === 0));
  assert.equal(scopeReady.length, 6);
  assert.deepEqual(new Set(scopeReady.map(row => row.variant.item.source.statsId)), EXPECTED_SCOPE_UNLOCK_STATS);
  const canStandBlocked = projectionReady.filter(row => programsFor(row)
    .some(entry => predicates(entry.program, 'CanStand').length > 0));
  assert.equal(canStandBlocked.length, 2);
  assert.deepEqual(new Set(canStandBlocked.map(row => row.variant.item.source.statsId)),
    new Set(['UNI_LOW_BestialCommunionScroll']));
  const mixed = exceptionalA12.filter(row => !exactExceptionalA12Tuple(row).projectionReady);
  assert.equal(mixed.length, 4);
  assert.deepEqual(new Set(mixed.map(row => row.variant.item.source.statsId)),
    new Set(['OBJ_Scrolls_FindFamiliar', 'UNI_TWN_Scroll_FleshToGold']));
});

test('exceptional A12 source tuple rejects every independently tampered binding dimension', () => {
  const source = exceptionalA12.find(row => row.variant.profile === 'standard'
    && row.variant.item.source.statsId === 'UNI_LOW_DethroneScroll');
  assert.ok(source);
  for (const [label, mutate] of mutationCases) {
    const candidate = tupleClone(source);
    mutate(candidate);
    const checked = exactExceptionalA12Tuple(candidate);
    assert.equal(checked.ok, false, label);
  }
});

test('exact root CanUseSpellScroll compiles only as a private descriptor while public preflight and commit stay closed', () => {
  const engine = loadEngine();
  const raw = {kind: 'predicate', name: 'CanUseSpellScroll', args: [{kind: 'string', value: 'Target_Anything'}]};
  assert.equal(engine.guardSupported(raw), false, 'a raw predicate is not ambient executable authority');
  let targetReads = 0;
  const untrustedTarget = new Proxy({}, {
    get() { targetReads++; throw new Error('public CanUseSpellScroll must not read a target'); },
    getOwnPropertyDescriptor() { targetReads++; throw new Error('public CanUseSpellScroll must not inspect a target'); },
    ownKeys() { targetReads++; throw new Error('public CanUseSpellScroll must not enumerate a target'); },
  });
  assert.deepEqual(plain(engine.guardResult(raw, {id: 'guard-caster'}, untrustedTarget, null)),
    {known: false, value: false});
  assert.equal(targetReads, 0);

  let currentReady = 0, detachedReady = 0;
  const currentIssues = new Map(), detachedIssues = new Map(), readyKeys = new Set();
  for (const row of exceptionalA12) {
    engine.setProfile(row.variant.profile);
    const programs = programsFor(row);
    const current = engine.compile(plain(row.use), plain(row.root), plain(programs));
    const key = `${row.variant.item.source.statsId}/${row.variant.profile}`;
    if (current.ok) { currentReady++; readyKeys.add(key); }
    currentIssues.set(key, current.issues.map(issue => issue.reason));
    const checked = exactExceptionalA12Tuple(row);
    const privateGuards = current.guards.filter(guard => guard.privateTypedItemGuard === 'CanUseSpellScroll');
    assert.equal(privateGuards.length, 1, key);
    assert.deepEqual(plain(privateGuards[0]), {
      condition: plain(row.root.validation[0].condition),
      where: 'root.validation[0]',
      privateTypedItemGuard: 'CanUseSpellScroll',
      spellId: checked.spellId,
    }, key);
    assert.deepEqual(plain(current.scroll), {
      schemaVersion: 'bg3-scroll-action/1',
      spellId: checked.spellId,
      eligibility: {predicate: 'CanUseSpellScroll', spellId: checked.spellId},
      consumeOnCommit: 1,
    }, key);
    assert.equal(engine.guardSupported(privateGuards[0].condition), false, key);
    assert.deepEqual(plain(engine.guardResult(privateGuards[0].condition,
      {id: 'guard-caster'}, {kind: 'none', known: false}, null)), {known: false, value: false}, key);

    const detachedRootWithoutGuard = plain(row.root);
    detachedRootWithoutGuard.validation = [];
    const detached = engine.compile(plain(row.use), detachedRootWithoutGuard, plain(programs));
    if (detached.ok) detachedReady++;
    detachedIssues.set(key, detached.issues.map(issue => issue.reason));
    assert.deepEqual(detached.issues.map(issue => issue.reason).sort(),
      current.issues.map(issue => issue.reason).sort(), `${key}: removing the private descriptor changed another issue`);
    assert.equal(engine.planOf(row.use), null, `${key}: detached compile must not install Prepare authority`);
  }
  const expectedReadyKeys = new Set([...EXPECTED_PROJECTION_READY_STATS]
    .flatMap(statsId => ['standard', 'honour'].map(profile => `${statsId}/${profile}`)));
  assert.equal(currentReady, 8, JSON.stringify(Object.fromEntries(currentIssues)));
  assert.equal(detachedReady, 8, JSON.stringify(Object.fromEntries(detachedIssues)));
  assert.deepEqual(readyKeys, expectedReadyKeys);

  const row = exceptionalA12.find(candidate => candidate.variant.profile === 'standard'
    && candidate.variant.item.source.statsId === 'UNI_LOW_DethroneScroll');
  const item = plain(row.variant.item), use = plain(row.use), programs = plain(programsFor(row));
  const plan = engine.compile(use, plain(row.root), programs);
  assert.equal(plan.ok, true, engine.report(plan));
  const caster = {id: 'guard-caster', name: 'Guard caster', hp: 30, hpMax: 30,
    inventory: [{id: 'dethrone-entry', itemId: item.id, qty: 1}], equipment: {}, activeFx: [],
    activeEffectsSchemaVersion: 1, cond: [], tags: [], bg3Tags: []};
  const target = {id: 'guard-target', name: 'Guard target', hp: 100, hpMax: 100, ac: 10,
    activeFx: [], activeEffectsSchemaVersion: 1, cond: [], tags: [], bg3Tags: []};
  engine.setWorld(caster, target, item);
  const rolls = {saveOk: false, dmgRaw: 50, dmgTotal: 50};
  const beforePreflight = plain({caster, target});
  const preflight = engine.preflight(plan, caster, 'foe:guard-target', rolls, item, use,
    {entryId: 'dethrone-entry'});
  assert.equal(preflight.ok, false);
  assert.match(preflight.reason, /Нельзя доказать условие BG3 \[root\.validation\[0\]\]/);
  assert.deepEqual(plain({caster, target}), beforePreflight, 'public preflight mutated gameplay state');

  engine.installPlan(use, plan);
  const beforeCommit = plain({caster, target});
  assert.equal(engine.directApply('dethrone-entry', caster.id, 'foe:guard-target', rolls, use.id), false);
  assert.equal(engine.formulaAudit(), null,
    'proofless exact Dethrone must be rejected before publishing a public formula audit');
  assert.deepEqual(plain({caster, target}), beforeCommit, 'proofless production commit mutated gameplay state');
});

test('Party source census is five programs but only two Honour mixed item carriers; exact helper unlocks no action', () => {
  assert.equal(partyPrograms.length, 5);
  assert.deepEqual(new Set(partyPrograms.map(row => row.rule.bg3Id)), new Set([
    'Target_FeignDeath',
    'Target_FreezingSphere_Throw',
    'Projectile_CRE_LathandersBlessing_HealingExplosion',
  ]));
  assert.equal(exactHonourPartyPrograms.length, 1);
  assert.equal(partyCarriers.length, 2);
  assert.deepEqual(new Set(partyCarriers.map(row => row.variant.profile)), new Set(['honour']));
  assert.deepEqual(new Set(partyCarriers.map(row => row.variant.item.source.statsId)), new Set([
    'OBJ_Bottle_Destructible',
    'OBJ_Scroll_FeignDeath',
  ]));
  assert.equal(partyCarriers.every(row => row.use.program.projection.complete === false
    && row.use.program.projection.mode === 'mixed'), true);

  const engine = loadEngine();
  let currentReady = 0, helperReady = 0, currentUnsupported = 0, helperUnsupported = 0;
  for (const row of partyCarriers) {
    engine.setProfile(row.variant.profile);
    const programs = programsFor(row);
    const current = engine.compile(plain(row.use), plain(row.root), plain(programs));
    const helper = engine.compile(plain(row.use), plain(row.root), programsWithExactPartyCompileHelper(programs));
    if (current.ok) currentReady++;
    if (helper.ok) helperReady++;
    if (current.issues.some(issue => issue.reason === 'unsupported-guard')) currentUnsupported++;
    if (helper.issues.some(issue => issue.reason === 'unsupported-guard')) helperUnsupported++;
  }
  assert.equal(currentReady, 0);
  assert.equal(helperReady, 0, 'Party alone must not turn either mixed carrier into an executable action');
  assert.equal(currentUnsupported, 2);
  assert.equal(helperUnsupported, 0);
});

test('current Party boundary is fail-closed for exact, duplicate, non-party and Proxy targets without Proxy reads', () => {
  const engine = loadEngine();
  const party = {kind: 'predicate', name: 'Party', args: []};
  const partyTarget = {kind: 'predicate', name: 'Party', args: [{kind: 'symbol', value: 'context.Target'}]};
  assert.equal(engine.guardSupported(party), false);
  assert.equal(engine.guardSupported(partyTarget), false);

  const caster = {id: 'caster'}, member = {id: 'member'}, duplicate = {id: 'member'}, foe = {id: 'foe'}, object = {id: 'object'};
  engine.setChars([caster, member, duplicate]);
  for (const ti of [
    {kind: 'ally', id: member.id, obj: member, known: true},
    {kind: 'foe', id: foe.id, obj: foe, known: true},
    {kind: 'object', id: object.id, obj: object, known: true},
  ]) assert.deepEqual(plain(engine.guardResult(party, caster, ti, null)), {known: false, value: false});

  let traps = 0;
  const proxy = new Proxy({id: 'proxy'}, {
    get() { traps++; throw new Error('Party must not read an untrusted target'); },
    getOwnPropertyDescriptor() { traps++; throw new Error('Party must not inspect an untrusted target'); },
    ownKeys() { traps++; throw new Error('Party must not enumerate an untrusted target'); },
    getPrototypeOf() { traps++; throw new Error('Party must not inspect an untrusted prototype'); },
  });
  const result = engine.guardResult(party, caster, {kind: 'ally', id: 'proxy', obj: proxy, known: true}, null);
  assert.deepEqual(plain(result), {known: false, value: false});
  assert.equal(traps, 0);
});

import {createHash} from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SOURCE_VERSION = 'bg3-24532579-v9';
const TARGET_VERSION = 'bg3-24532579-v10';
const SOURCE_ROOT = join(REPO_ROOT, 'data', 'bg3', SOURCE_VERSION);
const TARGET_ROOT = join(REPO_ROOT, 'data', 'bg3', TARGET_VERSION);
const STAGING_ROOT = join(REPO_ROOT, 'data', 'bg3', `.${TARGET_VERSION}.building`);
const GENERATED_AT = '2026-08-26T12:00:00.000Z';
const EXPECTED_SOURCE_MANIFEST_SHA256 = 'd1d7618dce4576e75be7e62f913acba30c8ad94daf2405878abc837c5116a6fa';
const PROFILE_ORDER = ['standard', 'honour'];
const SCRIPT_MARKER_UUID = '403d19b4-b8dc-4481-b853-c010384a6411';
const ITEM_SHARD_TARGET_BYTES = 210_000;
const SOURCE_FACT_FIELDS = Object.freeze({
  armorType: 'Stats.ArmorType',
  improvisedWeapon: 'RootTemplate.CanBeImprovisedWeapon',
  itemUseType: 'Stats.ItemUseType',
  maxStack: 'RootTemplate.maxStackAmount',
  movable: 'RootTemplate.CanBeMoved',
  objectArmor: 'Stats.Armor',
  pickable: 'RootTemplate.CanBePickedUp',
  resistances: 'Stats.*Resistance',
  supplyValue: 'Stats.SupplyValue',
  useCosts: 'Stats.UseCosts',
  vitality: 'Stats.Vitality',
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value, pretty = false) {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8');
}

function compareStrings(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

function compareCodeUnits(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function stableStrings(values) {
  return [...new Set((values || []).filter(value => typeof value === 'string' && value.trim()))]
    .sort(compareStrings);
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function repoPath(file) {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

function stagedPath(manifestPath) {
  const prefix = `data/bg3/${TARGET_VERSION}/`;
  if (!manifestPath.startsWith(prefix)) throw new Error(`Unexpected v10 manifest path: ${manifestPath}`);
  return join(STAGING_ROOT, ...manifestPath.slice(prefix.length).split('/'));
}

function fileMeta(file) {
  const bytes = readFileSync(file);
  return {bytes: bytes.length, sha256: sha256(bytes)};
}

function cloneCatalogToStaging() {
  if (existsSync(TARGET_ROOT)) throw new Error(`Refusing to overwrite immutable target: ${TARGET_ROOT}`);
  if (existsSync(STAGING_ROOT)) rmSync(STAGING_ROOT, {recursive: true, force: true});
  cpSync(SOURCE_ROOT, STAGING_ROOT, {recursive: true, force: false, preserveTimestamps: true});
  for (const file of walkFiles(STAGING_ROOT)) {
    if (!['.json', '.md'].includes(extname(file).toLowerCase())) continue;
    const before = readFileSync(file, 'utf8');
    const after = before.replaceAll(SOURCE_VERSION, TARGET_VERSION);
    if (after !== before) writeFileSync(file, after, 'utf8');
  }
}

function verifySourcePin() {
  const actual = sha256(readFileSync(join(SOURCE_ROOT, 'manifest.json')));
  if (actual !== EXPECTED_SOURCE_MANIFEST_SHA256) {
    throw new Error(`Source manifest SHA-256 mismatch: ${actual}`);
  }
}

function loadSourceCatalog() {
  const manifest = readJson(join(SOURCE_ROOT, 'manifest.json'));
  const artifact = meta => join(REPO_ROOT, ...meta.path.split('/'));
  const nodes = group => manifest.files[group].flatMap(meta => readJson(artifact(meta)).nodes || []);
  const itemShards = manifest.files.items.map(meta => {
    const raw = readFileSync(artifact(meta), 'utf8');
    return {
      meta,
      sourcePayload: JSON.parse(raw),
      payload: JSON.parse(raw.replaceAll(SOURCE_VERSION, TARGET_VERSION)),
    };
  });
  const roots = nodes('rootTemplates');
  const stats = nodes('itemStats');
  const rootPrograms = manifest.files.rootTemplatePrograms
    .flatMap(meta => readJson(artifact(meta)).programs || []);
  const rulePrograms = new Map();
  for (const meta of manifest.files.rules) {
    const payload = readJson(artifact(meta));
    for (const rule of payload.rules || []) {
      for (const program of Object.values(rule.programs || {})) {
        if (program?.id) rulePrograms.set(program.id, program);
      }
    }
  }
  return {
    manifest,
    itemShards,
    sourceItems: itemShards.flatMap(row => row.sourcePayload.items),
    items: itemShards.flatMap(row => row.payload.items),
    roots,
    stats,
    rootPrograms,
    rulePrograms,
  };
}

function exactProfiles(item) {
  const profiles = item.source?.profiles;
  if (!Array.isArray(profiles) || !profiles.length || profiles.some(profile => !PROFILE_ORDER.includes(profile))) {
    throw new Error(`${item.id}: invalid source profiles`);
  }
  return PROFILE_ORDER.filter(profile => profiles.includes(profile));
}

function profileBundle(item, profile) {
  const profiles = exactProfiles(item);
  if (!profiles.includes(profile)) return null;
  if (profile === 'standard' || profiles.length === 1) return item;
  const overlay = item.source?.honourOverlay?.item;
  if (!overlay) throw new Error(`${item.id}: missing Honour overlay`);
  return overlay;
}

function profileStatsProperties(node, profile) {
  const properties = {...(node?.resolvedProperties || {})};
  for (const [field, delta] of Object.entries(node?.honourDelta || {})) {
    if (delta?.[`${profile}Present`]) properties[field] = delta[profile];
    else delete properties[field];
  }
  return properties;
}

function scalar(value) {
  if (typeof value !== 'string') return value;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function sourceFact(sourceField, value, scope, present = value !== undefined && value !== null) {
  return present
    ? {state: 'value', scope, sourceField, value: scalar(value)}
    : {state: 'unknown-source', scope, sourceField};
}

function buildSourceFacts(item, profile, root, statsNode) {
  const attrs = root?.resolvedAttributes || {};
  const props = profileStatsProperties(statsNode, profile);
  const resistances = Object.fromEntries(Object.entries(props)
    .filter(([field]) => field.endsWith('Resistance'))
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([field, value]) => [field.slice(0, -'Resistance'.length), scalar(value)]));
  return {
    schemaVersion: 'bg3-item-source-facts/1',
    profile,
    sourceRootTemplateUuid: item.source.rootTemplateUuid,
    sourceStatsId: item.source.statsId || null,
    facts: {
      armorType: sourceFact(SOURCE_FACT_FIELDS.armorType, props.ArmorType, 'equipment'),
      improvisedWeapon: sourceFact(SOURCE_FACT_FIELDS.improvisedWeapon, attrs.CanBeImprovisedWeapon, 'inventory'),
      itemUseType: sourceFact(SOURCE_FACT_FIELDS.itemUseType, props.ItemUseType, 'item-use'),
      maxStack: sourceFact(SOURCE_FACT_FIELDS.maxStack, attrs.maxStackAmount, 'inventory'),
      movable: sourceFact(SOURCE_FACT_FIELDS.movable, attrs.CanBeMoved, 'world-object'),
      objectArmor: sourceFact(SOURCE_FACT_FIELDS.objectArmor, props.Armor, 'item-object'),
      pickable: sourceFact(SOURCE_FACT_FIELDS.pickable, attrs.CanBePickedUp, 'world-object'),
      resistances: sourceFact(
        SOURCE_FACT_FIELDS.resistances,
        resistances,
        'item-object',
        Object.keys(resistances).length > 0,
      ),
      supplyValue: sourceFact(SOURCE_FACT_FIELDS.supplyValue, props.SupplyValue, 'item-use'),
      useCosts: sourceFact(SOURCE_FACT_FIELDS.useCosts, props.UseCosts, 'item-use'),
      vitality: sourceFact(SOURCE_FACT_FIELDS.vitality, props.Vitality, 'item-object'),
    },
  };
}

function treeNodes(node, id) {
  const matches = [];
  function visit(current) {
    if (!current || typeof current !== 'object') return;
    if (current.tag === 'node' && current.attributes?.id === id) matches.push(current);
    for (const child of current.children || []) visit(child);
  }
  for (const child of node?.children || []) visit(child);
  return matches;
}

function nodeAttributes(node) {
  return Object.fromEntries((node?.children || [])
    .filter(child => child.tag === 'attribute')
    .map(child => [child.attributes.id, child.attributes.value]));
}

function directScripts(root) {
  const container = treeNodes(root, 'Scripts')[0];
  if (!container) return null;
  return treeNodes(container, 'Script').map(script => ({
    uuid: String(nodeAttributes(script).UUID || '').toLowerCase(),
    parameters: treeNodes(script, 'Parameter').map(parameter => {
      const row = nodeAttributes(parameter);
      return {key: row.MapKey || '', type: Number(row.Type), value: row.Value ?? ''};
    }),
  }));
}

function resolvedScripts(root, rootsByUuid) {
  for (const uuid of [...(root?.inheritanceChain || [])].reverse()) {
    const scripts = directScripts(rootsByUuid.get(String(uuid).toLowerCase()));
    if (scripts) return scripts;
  }
  return [];
}

function actionContract(action) {
  const program = action?.program || {};
  const projection = program.projection || null;
  const projectionReady = Boolean(projection && projection.complete === true
    && ['typed', 'empty'].includes(projection.mode) && !(projection.unresolved || []).length);
  if (action?.handler === 'bg3RecipeProgram') return {ready: true, reason: 'exact-recipe-preflight'};
  if (action?.handler === 'bg3LearnSpellProgram' && program.learnSpell) {
    return {ready: true, reason: 'exact-learn-spell-preflight'};
  }
  if (action?.handler === 'bg3RootProgram' && action.special?.kind === 'bg3Tadpole'
    && action.special.requiresCampaignHandler === true) return {ready: true, reason: 'exact-tadpole-preflight'};
  if (['bg3RuleProgram', 'bg3RootProgram'].includes(action?.handler)
    && (projection ? projectionReady : program.mode === 'typed')) {
    return {ready: true, reason: projectionReady ? 'complete-rule-projection' : 'typed-root-program'};
  }
  const unresolved = projection && (projection.unresolved || []).length;
  const mode = projection?.mode || program.mode || 'unknown';
  return {ready: false, reason: unresolved ? 'unresolved-rule-projection' : `source-program-${mode}`};
}

function lifecycleGrantReady(grant) {
  const projection = grant?.projection;
  return Boolean(grant?.resolved === true && grant.executable === true
    && grant.executionPolicy === 'all-reachable-opcodes-or-fail-closed'
    && projection?.mode === 'typed' && projection.complete === true
    && !(projection.unresolved || []).length && grant.runtimeReady !== false
    && grant.sourceBlocked !== true && grant.complete !== false);
}

function lifecycleInterruptReady(interrupt) {
  const projection = interrupt?.projection;
  return Boolean(interrupt?.schemaVersion === 'bg3-interrupt-projection/1'
    && interrupt.executable === true && interrupt.complete === true
    && interrupt.executionPolicy === 'validate-player-choice-roll-single-commit-consequences'
    && !(interrupt.blockers || []).length && projection?.mode === 'typed'
    && projection.complete === true && !(projection.unresolved || []).length
    && interrupt.runtimeReady !== false && interrupt.sourceBlocked !== true);
}

function lifecycleContract(ref) {
  const sourceReady = ['typed', 'empty'].includes(String(ref?.mode || ''));
  const projection = ref?.projection;
  const projectionMode = String(ref?.projectionMode || '');
  const projectionReady = Boolean(projection && ['typed', 'empty'].includes(projectionMode)
    && projection.mode === projectionMode && projection.complete === true
    && !(projection.unresolved || []).length);
  const grantsReady = (ref?.grantedActions || []).every(lifecycleGrantReady);
  const interruptsReady = (ref?.grantedInterrupts || []).every(lifecycleInterruptReady);
  const ready = sourceReady && projectionReady && grantsReady && interruptsReady;
  return {
    ready,
    reason: !sourceReady ? `source-lifecycle-${String(ref?.mode || 'unknown')}`
      : !projectionReady ? 'incomplete-lifecycle-projection'
        : !grantsReady ? 'blocked-lifecycle-granted-action'
          : !interruptsReady ? 'blocked-lifecycle-interrupt'
            : 'typed-lifecycle-contract',
  };
}

function activeRuleReferences(mechanics) {
  const active = mechanics?.provenance?.ruleReferences?.active || {};
  return Object.entries(active).flatMap(([kind, rows]) => (rows || []).map(row => ({kind, ...row})));
}

function inheritedRuleReferenceCount(mechanics) {
  return Object.values(mechanics?.provenance?.ruleReferences?.inheritedDefaults || {})
    .reduce((sum, rows) => sum + (rows || []).length, 0);
}

function rootProgramsByItem(programs) {
  const result = new Map();
  for (const program of programs) {
    const match = /^(bg3:item:.*):root-action:(standard|honour):/.exec(program.id || '');
    if (!match) continue;
    const key = `${match[1]}\0${match[2]}`;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(program);
  }
  for (const rows of result.values()) rows.sort((left, right) => compareStrings(left.id, right.id));
  return result;
}

function operationDetail(operation) {
  if (!operation || typeof operation !== 'object') return '';
  const details = [];
  const add = (label, value) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'object') {
      const compact = value.value ?? value.raw ?? value.id ?? value.kind;
      if (compact !== undefined && compact !== '') details.push(`${label}=${compact}`);
    } else details.push(`${label}=${value}`);
  };
  add('status', operation.status);
  add('spell', operation.spellId || operation.spell);
  add('passive', operation.passiveId || operation.passive);
  add('target', operation.target);
  add('damage', operation.damage || operation.amount);
  add('type', operation.damageType || operation.type);
  add('surface', operation.surface || operation.surfaceType);
  add('tag', operation.tag);
  if (operation.op === 'manual') add('reason', operation.reason);
  return `${operation.op || 'operation'}${details.length ? `(${details.join(', ')})` : ''}`;
}

function programOperations(program) {
  if (!program) return [];
  if (Array.isArray(program.fields)) {
    return program.fields.flatMap(field => (field.bytecode || []).map(operationDetail));
  }
  return ['validation', 'commit', 'consequences']
    .flatMap(phase => (program[phase] || []).map(operationDetail));
}

function actionOperationLabels(action, rootProgramMap, ruleProgramMap) {
  const labels = [];
  const root = rootProgramMap.get(action?.program?.id);
  labels.push(...programOperations(root));
  const projectionRows = [
    ...(action?.program?.projection?.entrypoints || []),
    ...(action?.program?.projection?.transitive || []),
  ];
  for (const row of projectionRows) labels.push(...programOperations(ruleProgramMap.get(row.programId)));
  if (action?.program?.learnSpell?.spellId) labels.push(`learnSpell(${action.program.learnSpell.spellId})`);
  if (action?.program?.scroll?.spellId) labels.push(`castSpell(${action.program.scroll.spellId})`);
  return stableStrings(labels).slice(0, 10);
}

function descriptionStatus(item) {
  if (String(item.i18n?.ru?.description || '').trim() || String(item.i18n?.en?.description || '').trim()) {
    return 'source-localized';
  }
  return item.source?.localizationHandles?.description?.id ? 'unresolved-handle' : 'source-absent';
}

function scrollProfile(bundle, actionContracts) {
  const actions = bundle.mechanics.actions || [];
  const castRows = actions.filter(action => action.program?.scroll || action.program?.sourceAction?.primary?.attributes?.SpellId);
  const learnRows = actions.filter(action => action.program?.learnSpell);
  const spellIds = stableStrings(actions.flatMap(action => [
    action.program?.scroll?.spellId,
    action.program?.learnSpell?.spellId,
    action.program?.sourceAction?.primary?.attributes?.SpellId,
  ]));
  const learn = learnRows.map(action => action.program.learnSpell).find(Boolean);
  return {
    schemaVersion: 'bg3-scroll-profile/1',
    spellId: spellIds[0] || null,
    spellStatus: spellIds.length ? 'source-bound' : 'unknown-source',
    level: Number.isInteger(Number(learn?.spell?.level)) ? Number(learn.spell.level) : null,
    school: typeof learn?.spell?.school === 'string' && learn.spell.school ? learn.spell.school : null,
    canLearn: learnRows.length > 0,
    actionIds: stableStrings(actions.map(action => action.id)),
    castActionIds: stableStrings(castRows.map(action => action.id)),
    learnActionIds: stableStrings(learnRows.map(action => action.id)),
    readyActions: actionContracts.filter(row => row.ready).length,
    blockedActions: actionContracts.filter(row => !row.ready).length,
  };
}

function instrumentType(statsId) {
  const value = String(statsId || '');
  if (/Music_(GuitarLute|Lute)/i.test(value)) return 'lute';
  if (/Music_Drum/i.test(value)) return 'drum';
  if (/Music_Horn/i.test(value)) return 'horn';
  if (/Music_Viol/i.test(value)) return 'viol';
  return '';
}

function characteristicIssues(item, bundle, sourceFacts) {
  const profile = bundle.mechanics.profile || {};
  const issues = [];
  const classification = item.source?.classification || '';
  if (profile.kind === 'weapon' && !String(bundle.dmg || '').trim()) {
    issues.push(classification === 'playable' ? 'weapon-damage-missing' : 'weapon-damage-not-applicable');
  }
  if (profile.kind === 'shield' && !String(bundle.ac || '').trim()) {
    issues.push(classification === 'playable' ? 'shield-ac-missing' : 'shield-ac-not-applicable');
  }
  if (profile.kind === 'light') {
    const light = profile.light || {};
    if (![light.bright, light.dim, light.hours].some(Number.isFinite) && !String(light.fuel || '').trim()) {
      issues.push('light-photometry-unknown');
    }
  }
  if (profile.kind === 'instrument' && !String(profile.instrument?.type || '').trim()) {
    issues.push(classification === 'playable' ? 'instrument-type-unknown' : 'instrument-classification-review');
  }
  if (profile.kind === 'ammo' && !String(profile.ammo?.forWeapon || '').trim()) issues.push('ammo-compatibility-unknown');
  if (profile.kind === 'container' && !String(profile.container?.cap || '').trim()) issues.push('container-capacity-unknown');
  if (descriptionStatus(item) === 'unresolved-handle') issues.push('description-handle-unresolved');
  if (sourceFacts.facts.armorType.state === 'value'
    && String(sourceFacts.facts.armorType.value).toLowerCase() === 'none'
    && profile.kind === 'armor') issues.push('armor-type-none-explicit');
  return stableStrings(issues);
}

function materializeBundle(item, profile, bundle, context) {
  const mechanics = bundle.mechanics;
  if (!mechanics || !Array.isArray(mechanics.actions) || !Array.isArray(mechanics.lifecyclePrograms)) {
    throw new Error(`${item.id}/${profile}: invalid mechanics`);
  }
  const root = context.rootsByUuid.get(String(item.source.rootTemplateUuid || '').toLowerCase());
  const statsNode = context.statsById.get(item.source.statsId);
  const sourceFacts = buildSourceFacts(item, profile, root, statsNode);
  mechanics.sourceFacts = sourceFacts;

  const actionContracts = mechanics.actions.map(actionContract);
  const lifecycleContracts = mechanics.lifecyclePrograms.map(lifecycleContract);
  if (mechanics.profile?.kind === 'scroll') mechanics.profile.scroll = scrollProfile(bundle, actionContracts);
  if (mechanics.profile?.kind === 'armor' && sourceFacts.facts.armorType.state === 'value'
    && String(sourceFacts.facts.armorType.value).toLowerCase() === 'none') {
    mechanics.profile.armor = {...(mechanics.profile.armor || {}), weight: 'none'};
  }
  if (mechanics.profile?.kind === 'instrument' && !mechanics.profile.instrument?.type) {
    const type = instrumentType(item.source.statsId);
    if (type) mechanics.profile.instrument = {...(mechanics.profile.instrument || {}), type};
  }

  const roots = context.rootProgramsByItem.get(`${item.id}\0${profile}`) || [];
  const onDestroy = roots.filter(program => program.trigger === 'OnDestroyActions');
  const activeRefs = activeRuleReferences(mechanics);
  const visibleMechanics = mechanics.actions.length + mechanics.interactions.length
    + mechanics.effects.length + mechanics.lifecyclePrograms.length;
  const scripts = visibleMechanics === 0 ? resolvedScripts(root, context.rootsByUuid) : [];
  const meaningfulScriptParameters = scripts.flatMap(script => script.parameters)
    .filter(parameter => parameter.key && parameter.key !== 'HardcoreOnly');
  const markerOnly = scripts.length > 0 && scripts.every(script => script.uuid === SCRIPT_MARKER_UUID)
    && meaningfulScriptParameters.length === 0;
  const opaqueScript = scripts.length > 0 && meaningfulScriptParameters.length === 0 && !markerOnly;
  const blockedDescriptors = [];
  if (visibleMechanics === 0 && activeRefs.length) {
    blockedDescriptors.push({
      kind: 'active-rule-reference',
      sourceId: stableStrings(activeRefs.map(row => row.id)).join(';'),
      sourceField: stableStrings(activeRefs.flatMap(row => row.fields || [row.kind])).join(';'),
      reasonCode: 'active-rule-reference-not-materialized',
    });
  } else if (visibleMechanics === 0 && meaningfulScriptParameters.length) {
    blockedDescriptors.push({
      kind: 'script-parameter',
      sourceId: stableStrings(scripts.map(script => script.uuid)).join(';'),
      sourceField: stableStrings(meaningfulScriptParameters.map(parameter => parameter.key)).join(';'),
      reasonCode: 'script-parameter-runtime-adapter-required',
    });
  }

  const readyActions = actionContracts.filter(row => row.ready).length;
  const blockedActions = actionContracts.length - readyActions;
  const readyLifecycle = lifecycleContracts.filter(row => row.ready).length;
  const blockedLifecycle = lifecycleContracts.length - readyLifecycle;
  const readySignals = readyActions + readyLifecycle + mechanics.interactions.length + mechanics.effects.length;
  const blockedSignals = blockedActions + blockedLifecycle + blockedDescriptors.length + (opaqueScript ? 1 : 0);
  const manual = mechanics.mode === 'manual' || bundle.useMode === 'manual';
  let runtimeState;
  if (readySignals && blockedSignals) runtimeState = 'partial';
  else if (blockedSignals) runtimeState = 'blocked';
  else if (readySignals) runtimeState = 'ready';
  else if (manual) runtimeState = 'manual-review';
  else if (onDestroy.length && item.source.classification !== 'playable') runtimeState = 'ready';
  else runtimeState = 'inert';

  let effectStatus;
  if (readySignals && blockedSignals) effectStatus = 'runtime-partial';
  else if (blockedDescriptors.some(row => row.kind === 'script-parameter')) effectStatus = 'script-declared-blocked';
  else if (blockedSignals) effectStatus = 'runtime-blocked';
  else if (readySignals) effectStatus = 'runtime-ready';
  else if (manual) effectStatus = 'manual-review';
  else if (onDestroy.length && item.source.classification !== 'playable') effectStatus = 'destruction-only';
  else if (markerOnly || inheritedRuleReferenceCount(mechanics)) effectStatus = 'inherited-inert';
  else effectStatus = 'source-inert';

  const issues = characteristicIssues(item, bundle, sourceFacts);
  const blockerCodes = stableStrings([
    ...actionContracts.filter(row => !row.ready).map(row => row.reason),
    ...lifecycleContracts.filter(row => !row.ready).map(row => row.reason),
    ...blockedDescriptors.map(row => row.reasonCode),
    opaqueScript ? 'script-uuid-runtime-adapter-required' : '',
    manual ? 'manual-mechanics-review-required' : '',
  ]);
  const sourceArtifacts = stableStrings([
    mechanics.rulePrograms?.artifact,
    mechanics.rootTemplatePrograms?.artifact,
    ...mechanics.actions.flatMap(action => [action.program?.rootArtifact, action.program?.artifact]),
    ...mechanics.lifecyclePrograms.map(row => row.artifact),
  ]);
  mechanics.engineCoverage = {
    schemaVersion: 'bg3-item-engine-coverage/1',
    profile,
    descriptionStatus: descriptionStatus(item),
    effectStatus,
    runtimeState,
    counts: {
      readyActions,
      blockedActions,
      readyLifecycle,
      blockedLifecycle,
      genericInteractions: mechanics.interactions.length,
      directEffects: mechanics.effects.length,
      readyRootPrograms: roots.filter(program => program.mode === 'typed').length,
      blockedRootPrograms: roots.filter(program => program.mode !== 'typed').length,
      onDestroyPrograms: onDestroy.length,
      activeRuleReferences: activeRefs.length,
      blockedDescriptors: blockedDescriptors.length,
    },
    sourceArtifacts,
    blockerCodes,
    characteristicIssues: issues,
    blockedDescriptors,
    destructionOperations: stableStrings(onDestroy.flatMap(programOperations)),
  };

  const stateLabel = {
    ready: 'готово и связано с движком',
    partial: 'частично связано; неоднозначные ветви заблокированы',
    blocked: 'исходная механика найдена, но исполнение заблокировано',
    inert: 'отдельный игровой эффект источником не задан',
    'manual-review': 'требуется проверка мастера',
  }[runtimeState];
  const segments = [`Связь с движком: ${stateLabel}.`];
  if (mechanics.actions.length) {
    const actionRows = mechanics.actions.slice(0, 4).map((action, index) => {
      const contract = actionContracts[index];
      const operations = actionOperationLabels(action, context.rootProgramMap, context.rulePrograms);
      const consume = action.consume?.amount ? `; расход ${action.consume.amount} ${action.consume.kind}` : '';
      return `${action.label || action.id} — ${contract.ready ? 'исполняется' : `заблокировано: ${contract.reason}`}`
        + ` [${action.cost || 'без стоимости'}; цель ${action.target || 'не указана'}${consume}]`
        + (operations.length ? `; последствия: ${operations.join(', ')}` : '');
    });
    segments.push(`Действия: ${actionRows.join(' | ')}.`);
  }
  if (mechanics.interactions.length) {
    segments.push(`Взаимодействия: ${mechanics.interactions.map(row => `${row.label || row.id} (${row.handler})`).join(', ')}.`);
  }
  if (mechanics.lifecyclePrograms.length) {
    segments.push(`События экипировки/инвентаря: ${readyLifecycle} исполняются, ${blockedLifecycle} заблокированы.`);
  }
  if (!readySignals && !blockedSignals && !manual) {
    segments.push('Предметно-специфических действий и эффектов нет.');
  }
  if (onDestroy.length) segments.push(`Поведение при уничтожении: ${onDestroy.length} программ, ${stableStrings(onDestroy.flatMap(programOperations)).slice(0, 5).join(', ')}.`);
  if (issues.length) segments.push(`Неопределённые характеристики: ${issues.join(', ')}.`);
  bundle.props = segments.join(' ').slice(0, 2_400);
  if (!bundle.props.trim()) throw new Error(`${item.id}/${profile}: empty props`);
  return mechanics.engineCoverage;
}

function semanticDigest(items) {
  const rows = [];
  for (const item of items) for (const profile of exactProfiles(item)) {
    const mechanics = profileBundle(item, profile).mechanics;
    rows.push(JSON.stringify({
      itemId: item.id,
      profile,
      actions: mechanics.actions,
      effects: mechanics.effects,
      interactions: mechanics.interactions,
      lifecyclePrograms: mechanics.lifecyclePrograms,
      rulePrograms: mechanics.rulePrograms,
      rootTemplatePrograms: mechanics.rootTemplatePrograms,
    }).replaceAll(SOURCE_VERSION, '<catalog-version>').replaceAll(TARGET_VERSION, '<catalog-version>'));
  }
  rows.sort(compareStrings);
  return sha256(Buffer.from(`${rows.join('\n')}\n`, 'utf8'));
}

function makeSummary() {
  return {
    materializations: 0,
    readyActions: 0,
    blockedActions: 0,
    readyLifecycle: 0,
    blockedLifecycle: 0,
    genericInteractions: 0,
    directEffects: 0,
    highConfidenceUnboundGaps: 0,
    propsComplete: 0,
    runtimeStates: {},
    effectStates: {},
    characteristicIssues: {},
    sourceFactStates: Object.fromEntries(Object.keys(SOURCE_FACT_FIELDS).map(key => [key, {value: 0, unknownSource: 0}])),
  };
}

function materialize(source) {
  const context = {
    rootsByUuid: new Map(source.roots.map(root => [String(root.uuid).toLowerCase(), root])),
    statsById: new Map(source.stats.map(node => [node.statsId, node])),
    rootProgramsByItem: rootProgramsByItem(source.rootPrograms),
    rootProgramMap: new Map(source.rootPrograms.map(program => [program.id, program])),
    rulePrograms: source.rulePrograms,
  };
  const summary = Object.fromEntries(PROFILE_ORDER.map(profile => [profile, makeSummary()]));
  const gapRows = [];
  const issueRows = [];
  let scrollProfiles = 0;
  let armorNone = 0;
  for (const item of source.items) for (const profile of exactProfiles(item)) {
    const bundle = profileBundle(item, profile);
    const coverage = materializeBundle(item, profile, bundle, context);
    const target = summary[profile];
    target.materializations++;
    target.propsComplete++;
    for (const key of ['readyActions', 'blockedActions', 'readyLifecycle', 'blockedLifecycle', 'genericInteractions', 'directEffects']) {
      target[key] += coverage.counts[key];
    }
    target.highConfidenceUnboundGaps += coverage.blockedDescriptors.length;
    increment(target.runtimeStates, coverage.runtimeState);
    increment(target.effectStates, coverage.effectStatus);
    for (const issue of coverage.characteristicIssues) {
      increment(target.characteristicIssues, issue);
      issueRows.push({itemId: item.id, profile, issue});
    }
    for (const [key, fact] of Object.entries(bundle.mechanics.sourceFacts.facts)) {
      target.sourceFactStates[key][fact.state === 'value' ? 'value' : 'unknownSource']++;
    }
    if (coverage.blockedDescriptors.length) {
      gapRows.push({itemId: item.id, profile, name: item.n, descriptors: coverage.blockedDescriptors});
    }
    if (bundle.mechanics.profile.kind === 'scroll') scrollProfiles++;
    if (bundle.mechanics.profile.kind === 'armor' && bundle.mechanics.profile.armor?.weight === 'none') armorNone++;
  }
  gapRows.sort((left, right) => compareStrings(`${left.itemId}\0${left.profile}`, `${right.itemId}\0${right.profile}`));
  issueRows.sort((left, right) => compareStrings(`${left.issue}\0${left.itemId}\0${left.profile}`, `${right.issue}\0${right.itemId}\0${right.profile}`));
  return {summary, gapRows, issueRows, scrollProfiles, armorNone};
}

function descriptionCounts(items) {
  const result = {'source-localized': 0, 'source-absent': 0, 'unresolved-handle': 0};
  for (const item of items) result[descriptionStatus(item)]++;
  return result;
}

function mechanicsReport(result, sourceSemanticSha256, targetSemanticSha256) {
  const counts = key => Object.fromEntries(PROFILE_ORDER.map(profile => [profile, result.summary[profile][key]]));
  return {
    schemaVersion: 'dnd-world-bg3-item-mechanics-report/1',
    catalogVersion: TARGET_VERSION,
    sourceCatalogVersion: SOURCE_VERSION,
    generatedAt: GENERATED_AT,
    scope: {
      items: 10_284,
      materializations: counts('materializations'),
    },
    counts: {
      readyActions: counts('readyActions'),
      blockedActions: counts('blockedActions'),
      readyLifecycle: counts('readyLifecycle'),
      blockedLifecycle: counts('blockedLifecycle'),
      genericInteractions: counts('genericInteractions'),
      directEffects: counts('directEffects'),
      highConfidenceUnboundGaps: counts('highConfidenceUnboundGaps'),
      descriptionStatus: descriptionCounts(result.items),
      scrollProfiles: result.scrollProfiles,
      armorTypeNoneProfiles: result.armorNone,
    },
    profiles: result.summary,
    programSemantics: {
      schemaVersion: 'bg3-item-program-semantics-digest/1',
      sourceSha256: sourceSemanticSha256,
      targetSha256: targetSemanticSha256,
      unchanged: sourceSemanticSha256 === targetSemanticSha256,
      excludedAdditions: ['mechanics.engineCoverage', 'mechanics.sourceFacts', 'mechanics.profile.scroll', 'mechanics.profile.armor.weight', 'props'],
    },
    policies: {
      unknown: 'explicit-unknown-source-never-infer',
      blocked: 'fail-closed-with-source-descriptor',
      objectFacts: 'object-scope-never-owner-character-scope',
      localizedTextExecutable: false,
    },
    highConfidenceUnbound: result.gapRows,
    characteristicIssues: result.issueRows,
  };
}

function reportMarkdown(report) {
  const s = profile => report.profiles[profile];
  return `# BG3 item mechanics audit — ${TARGET_VERSION}\n\n`
    + `Проверены все **${report.scope.items}** предмета и **${report.scope.materializations.standard + report.scope.materializations.honour}** объявленных профильных представлений. `
    + `Пустая строка больше не используется как объяснение механики: у каждого представления есть явные статусы, source-факты и русское резюме.\n\n`
    + `| Профиль | Представлений | Actions ready / blocked | Lifecycle ready / blocked | Взаимодействия | Прямые effects | Доказанные непривязанные механики |\n`
    + `|---|---:|---:|---:|---:|---:|---:|\n`
    + `| Standard | ${s('standard').materializations} | ${s('standard').readyActions} / ${s('standard').blockedActions} | ${s('standard').readyLifecycle} / ${s('standard').blockedLifecycle} | ${s('standard').genericInteractions} | ${s('standard').directEffects} | ${s('standard').highConfidenceUnboundGaps} |\n`
    + `| Honour | ${s('honour').materializations} | ${s('honour').readyActions} / ${s('honour').blockedActions} | ${s('honour').readyLifecycle} / ${s('honour').blockedLifecycle} | ${s('honour').genericInteractions} | ${s('honour').directEffects} | ${s('honour').highConfidenceUnboundGaps} |\n\n`
    + `Все прежние action/effect/interaction/lifecycle program payloads сохранены без изменения семантики: \`${report.programSemantics.targetSha256}\`. `
    + `Полные очереди blocked descriptors и неизвестных характеристик находятся в \`item-mechanics-report.json\`.\n`;
}

function assertExpected(result, items) {
  const expected = {
    standard: {materializations: 10_282, readyActions: 2_305, readyLifecycle: 1_496, genericInteractions: 3_608, directEffects: 291, highConfidenceUnboundGaps: 127},
    honour: {materializations: 10_284, readyActions: 2_300, readyLifecycle: 1_487, genericInteractions: 3_608, directEffects: 291, highConfidenceUnboundGaps: 128},
  };
  if (items.length !== 10_284 || new Set(items.map(item => item.id)).size !== items.length) throw new Error('Item identity census mismatch');
  for (const profile of PROFILE_ORDER) for (const [key, value] of Object.entries(expected[profile])) {
    if (result.summary[profile][key] !== value) throw new Error(`${profile}/${key}: expected ${value}, found ${result.summary[profile][key]}`);
  }
  const desc = descriptionCounts(items);
  if (JSON.stringify(desc) !== JSON.stringify({'source-localized': 5_706, 'source-absent': 4_505, 'unresolved-handle': 73})) {
    throw new Error(`Description census mismatch: ${JSON.stringify(desc)}`);
  }
  if (result.scrollProfiles !== 236) throw new Error(`Expected 236 scroll profile rows, found ${result.scrollProfiles}`);
  if (result.armorNone !== 138) throw new Error(`Expected 138 ArmorType=None profile rows, found ${result.armorNone}`);
}

function itemShardPlan(items) {
  const byBase = new Map();
  for (const item of [...items].sort((left, right) => compareCodeUnits(left.id, right.id))) {
    const base = sha256(Buffer.from(item.id, 'utf8')).slice(0, 2);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(item);
  }
  const rows = [];
  const shardByItem = new Map();
  for (const [base, baseItems] of [...byBase].sort(([left], [right]) => compareStrings(left, right))) {
    const chunks = [];
    let chunk = [];
    for (const item of baseItems) {
      const candidate = [...chunk, item];
      const provisional = {
        schemaVersion: 'dnd-world-bg3-items/1',
        catalogVersion: TARGET_VERSION,
        shard: `${base}-0000`,
        count: candidate.length,
        items: candidate,
      };
      const bytes = Buffer.byteLength(`${JSON.stringify(provisional)}\n`, 'utf8');
      if (chunk.length && bytes > ITEM_SHARD_TARGET_BYTES) {
        chunks.push(chunk);
        chunk = [item];
      } else chunk = candidate;
    }
    if (chunk.length) chunks.push(chunk);
    chunks.forEach((chunkItems, index) => {
      const shard = `${base}-${String(index).padStart(4, '0')}`;
      const payload = {
        schemaVersion: 'dnd-world-bg3-items/1',
        catalogVersion: TARGET_VERSION,
        shard,
        count: chunkItems.length,
        items: chunkItems,
      };
      const buffer = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
      if (buffer.length >= 250_000) throw new Error(`Planned item shard exceeds hard limit: ${shard}/${buffer.length}`);
      rows.push({shard, payload, buffer});
      for (const item of chunkItems) shardByItem.set(item.id, shard);
    });
  }
  return {rows, shardByItem};
}

function writeItemShards(items) {
  const plan = itemShardPlan(items);
  const itemRoot = join(STAGING_ROOT, 'items');
  if (!itemRoot.startsWith(`${STAGING_ROOT}${sep}`)) throw new Error('Unsafe staging item root');
  rmSync(itemRoot, {recursive: true, force: true});
  mkdirSync(itemRoot, {recursive: true});
  const entries = [];
  for (const row of plan.rows) {
    const file = join(itemRoot, `${row.shard}.json`);
    writeFileSync(file, row.buffer);
    entries.push({
      path: `data/bg3/${TARGET_VERSION}/items/${row.shard}.json`,
      shard: row.shard,
      count: row.payload.count,
      ...fileMeta(file),
    });
  }
  const searchFile = join(STAGING_ROOT, 'search-index.json');
  const search = readJson(searchFile);
  for (const row of search.items || []) {
    const shard = plan.shardByItem.get(row.id);
    if (!shard) throw new Error(`Search row has no planned item shard: ${row.id}`);
    row.shard = shard;
  }
  writeJson(searchFile, search);
  return {entries, shardByItem: plan.shardByItem};
}

function updateManifest(sourceManifest, report, itemEntries) {
  const manifest = JSON.parse(JSON.stringify(sourceManifest).replaceAll(SOURCE_VERSION, TARGET_VERSION));
  manifest.catalogVersion = TARGET_VERSION;
  manifest.generatedAt = GENERATED_AT;
  manifest.source.parentCatalog = {
    catalogVersion: SOURCE_VERSION,
    manifestSha256: EXPECTED_SOURCE_MANIFEST_SHA256,
  };
  manifest.source.itemMechanics = {
    schemaVersion: 'bg3-item-mechanics-source/1',
    auditReport: 'item-mechanics-report.json',
    unknownPolicy: 'preserve-and-report-never-infer',
  };
  manifest.contracts.itemMechanics = {
    schemaVersion: 'bg3-item-engine-coverage/1',
    sourceFactsSchemaVersion: 'bg3-item-source-facts/1',
    profileMaterialization: 'exact-declared-profile-no-fallback',
    execution: 'existing-program-semantics-unchanged',
    blocked: 'fail-closed-with-source-descriptor',
    objectFactsScope: 'item-object-never-owner-character',
  };
  manifest.counts.itemMechanics = report.profiles;
  manifest.entrypoints.itemMechanicsReport = 'item-mechanics-report.json';
  manifest.files.items = itemEntries;
  for (const flag of [
    'itemMechanicsProfileBundlesExhaustive',
    'itemMechanicsSourceFactsExhaustive',
    'itemMechanicsStatusesExplicit',
    'itemMechanicsPropsComplete',
    'itemScrollProfilesComplete',
    'itemArmorNoneExplicit',
    'itemMechanicsHighConfidenceGapsExplicit',
    'itemMechanicsSourcePinned',
  ]) manifest.integrity[flag] = true;
  manifest.integrity.itemProgramSemanticsUnchanged = report.programSemantics.unchanged;
  manifest.integrity.itemProgramSemanticsSha256 = report.programSemantics.targetSha256;
  const added = [
    `data/bg3/${TARGET_VERSION}/item-mechanics-report.json`,
    `data/bg3/${TARGET_VERSION}/item-mechanics-report.md`,
  ];
  manifest.files.other = manifest.files.other.filter(meta => !added.includes(meta.path));
  manifest.files.other.push(...added.map(path => ({path, bytes: 0, sha256: ''})));
  manifest.files.other.sort((left, right) => compareStrings(left.path, right.path));

  const groupMaxBytes = group => Math.max(...manifest.files[group].map(meta => fileMeta(stagedPath(meta.path)).bytes));
  const ruleMaxBytes = groupMaxBytes('rules');
  const ruleIndexFile = join(STAGING_ROOT, manifest.entrypoints.ruleProgramIndex);
  const ruleIndex = readJson(ruleIndexFile);
  ruleIndex.storage.shards = manifest.files.rules.length;
  ruleIndex.storage.maxBytes = ruleMaxBytes;
  writeJson(ruleIndexFile, ruleIndex);

  const shardingGroups = {
    rulePrograms: 'rules',
    rootTemplatePrograms: 'rootTemplatePrograms',
    storyPrograms: 'storyPrograms',
    storySourceArchives: 'storySourceArchives',
    itemPlacements: 'itemPlacements',
    itemPlacementIndex: 'itemPlacementIndex',
    placementActionPrograms: 'placementActionPrograms',
  };
  for (const [storageKey, group] of Object.entries(shardingGroups)) {
    const storage = manifest.sharding[storageKey];
    if (!storage || !manifest.files[group]?.length) continue;
    storage.maxBytes = groupMaxBytes(group);
    if ('shards' in storage) storage.shards = manifest.files[group].length;
    if ('files' in storage) storage.files = manifest.files[group].length;
    if (storage.maxBytes >= storage.hardLimitBytes) {
      throw new Error(`${storageKey} shard exceeds hard limit: ${storage.maxBytes}`);
    }
  }
  for (const group of Object.values(manifest.files)) for (const meta of group) {
    const file = stagedPath(meta.path);
    if (!existsSync(file)) throw new Error(`Manifest artifact missing: ${meta.path}`);
    Object.assign(meta, fileMeta(file));
  }
  manifest.sharding.runtimeItems.targetBytes = ITEM_SHARD_TARGET_BYTES;
  manifest.sharding.runtimeItems.shards = manifest.files.items.length;
  manifest.sharding.runtimeItems.maxBytes = Math.max(...manifest.files.items.map(meta => meta.bytes));
  if (manifest.sharding.runtimeItems.maxBytes >= manifest.sharding.runtimeItems.hardLimitBytes) {
    throw new Error(`Runtime item shard exceeds hard limit: ${manifest.sharding.runtimeItems.maxBytes}`);
  }
  writeJson(join(STAGING_ROOT, 'manifest.json'), manifest, true);
  return manifest;
}

function verifyManifest(manifest, catalogRoot = TARGET_ROOT) {
  let files = 0;
  for (const group of Object.values(manifest.files)) for (const meta of group) {
    const prefix = `data/bg3/${TARGET_VERSION}/`;
    const file = join(catalogRoot, ...meta.path.slice(prefix.length).split('/'));
    const actual = fileMeta(file);
    if (actual.bytes !== meta.bytes || actual.sha256 !== meta.sha256) throw new Error(`Manifest mismatch: ${meta.path}`);
    files++;
  }
  const shardingGroups = {
    runtimeItems: 'items',
    rulePrograms: 'rules',
    rootTemplatePrograms: 'rootTemplatePrograms',
    storyPrograms: 'storyPrograms',
    storySourceArchives: 'storySourceArchives',
    itemPlacements: 'itemPlacements',
    itemPlacementIndex: 'itemPlacementIndex',
    placementActionPrograms: 'placementActionPrograms',
  };
  for (const [storageKey, group] of Object.entries(shardingGroups)) {
    const storage = manifest.sharding[storageKey];
    if (!storage || !manifest.files[group]?.length) continue;
    const maxBytes = Math.max(...manifest.files[group].map(meta => meta.bytes));
    if (storage.maxBytes !== maxBytes) throw new Error(`${storageKey} maxBytes mismatch: ${storage.maxBytes}/${maxBytes}`);
    if (storage.maxBytes >= storage.hardLimitBytes) throw new Error(`${storageKey} hard limit exceeded: ${storage.maxBytes}`);
  }
  const ruleIndex = readJson(join(catalogRoot, manifest.entrypoints.ruleProgramIndex));
  if (ruleIndex.storage?.maxBytes !== manifest.sharding.rulePrograms.maxBytes) {
    throw new Error('Rule program index maxBytes differs from manifest sharding metadata');
  }
  return files;
}

function mechanicsFields(item, profile) {
  const bundle = profileBundle(item, profile);
  return {
    props: bundle.props,
    engineCoverage: bundle.mechanics.engineCoverage,
    sourceFacts: bundle.mechanics.sourceFacts,
    scroll: bundle.mechanics.profile.scroll || null,
    armor: bundle.mechanics.profile.armor || null,
    instrument: bundle.mechanics.profile.instrument || null,
  };
}

function build() {
  verifySourcePin();
  const source = loadSourceCatalog();
  const sourceSemanticSha256 = semanticDigest(source.sourceItems);
  cloneCatalogToStaging();
  const result = materialize(source);
  result.items = source.items;
  const targetSemanticSha256 = semanticDigest(source.items);
  assertExpected(result, source.items);
  if (sourceSemanticSha256 !== targetSemanticSha256) throw new Error('Executable item program semantics changed');
  const itemStorage = writeItemShards(source.items);
  const report = mechanicsReport(result, sourceSemanticSha256, targetSemanticSha256);
  writeJson(join(STAGING_ROOT, 'item-mechanics-report.json'), report, true);
  writeFileSync(join(STAGING_ROOT, 'item-mechanics-report.md'), reportMarkdown(report), 'utf8');
  const manifest = updateManifest(source.manifest, report, itemStorage.entries);
  verifyManifest(manifest, STAGING_ROOT);
  renameSync(STAGING_ROOT, TARGET_ROOT);
  const manifestSha256 = sha256(readFileSync(join(TARGET_ROOT, 'manifest.json')));
  console.log(JSON.stringify({
    mode: 'write',
    catalogVersion: TARGET_VERSION,
    items: source.items.length,
    materializations: report.scope.materializations,
    files: Object.values(manifest.files).reduce((sum, rows) => sum + rows.length, 0),
    manifestSha256,
    counts: report.counts,
  }, null, 2));
}

function check() {
  verifySourcePin();
  const manifest = readJson(join(TARGET_ROOT, 'manifest.json'));
  if (manifest.catalogVersion !== TARGET_VERSION) throw new Error(`Unexpected catalog ${manifest.catalogVersion}`);
  const files = verifyManifest(manifest);
  const actualItems = manifest.files.items.flatMap(meta => readJson(join(REPO_ROOT, ...meta.path.split('/'))).items);
  const source = loadSourceCatalog();
  const sourceSemanticSha256 = semanticDigest(source.sourceItems);
  const result = materialize(source);
  result.items = source.items;
  const targetSemanticSha256 = semanticDigest(source.items);
  assertExpected(result, source.items);
  const expectedReport = mechanicsReport(result, sourceSemanticSha256, targetSemanticSha256);
  const actualReport = readJson(join(TARGET_ROOT, manifest.entrypoints.itemMechanicsReport));
  if (JSON.stringify(actualReport) !== JSON.stringify(expectedReport)) throw new Error('Mechanics report does not reproduce from pinned v9 sources');
  const actualById = new Map(actualItems.map(item => [item.id, item]));
  for (const expected of source.items) for (const profile of exactProfiles(expected)) {
    const actual = actualById.get(expected.id);
    if (!actual || JSON.stringify(mechanicsFields(actual, profile)) !== JSON.stringify(mechanicsFields(expected, profile))) {
      throw new Error(`Mechanics materialization mismatch: ${expected.id}/${profile}`);
    }
  }
  if (semanticDigest(actualItems) !== sourceSemanticSha256) throw new Error('Committed v10 item program semantics differ from v9');
  console.log(JSON.stringify({
    mode: 'check',
    catalogVersion: TARGET_VERSION,
    items: actualItems.length,
    materializations: expectedReport.scope.materializations,
    files,
    manifestSha256: sha256(readFileSync(join(TARGET_ROOT, 'manifest.json'))),
  }, null, 2));
}

function main() {
  if (process.argv.includes('--write')) build();
  else if (process.argv.includes('--check')) check();
  else throw new Error('Usage: node scripts/build-bg3-item-mechanics.mjs --write|--check');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

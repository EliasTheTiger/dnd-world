import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_VERSION = 'bg3-24532579-v10';
const SOURCE_ROOT = join(REPO_ROOT, 'data', 'bg3', CATALOG_VERSION);
const OUTPUT_ROOT = join(REPO_ROOT, 'data', 'bg3', 'ui', `${CATALOG_VERSION}-item-presentation`);
const OUTPUT_MANIFEST = join(OUTPUT_ROOT, 'manifest.json');
const OUTPUT_INTEGRITY = join(OUTPUT_ROOT, 'integrity.json');
const MAX_ROOT_BYTES = 3_500_000;
const DETAIL_ROOT = join(OUTPUT_ROOT, 'detail');
const SEARCH_ROOT = join(OUTPUT_ROOT, 'search');
const TARGET_DETAIL_BYTES = 210_000;
const HARD_DETAIL_BYTES = 250_000;
const TARGET_SEARCH_BYTES = 210_000;
const HARD_SEARCH_BYTES = 250_000;
const PROFILE_ORDER = ['standard', 'honour'];
const CHECK_ONLY = process.argv.includes('--check');

/* Exact enum identifiers from Norbyte/bg3se
   BG3Extender/GameDefinitions/Enumerations/Stats.inl. They are display/search
   labels only and never authorize execution. Values 21, 25 and 29 are absent
   from the source enum. */
const ACTION_DATA_TYPE_NAMES = Object.freeze({
  0: 'Unknown',
  1: 'OpenClose',
  2: 'Destroy',
  3: 'Teleport',
  4: 'CreateSurface',
  5: 'DestroyParameters',
  6: 'Equip',
  7: 'Consume',
  8: 'StoryUse',
  9: 'Door',
  10: 'CreatePuddle',
  11: 'Book',
  12: 'UseSpell',
  13: 'SpellBook',
  14: 'Sit',
  15: 'Lie',
  16: 'Insert',
  17: 'Stand',
  18: 'Lockpick',
  19: 'StoryUseInInventory',
  20: 'DisarmTrap',
  22: 'ShowStoryElementUI',
  23: 'Combine',
  24: 'Ladder',
  26: 'PlaySound',
  27: 'SpawnCharacter',
  28: 'Constrain',
  30: 'Recipe',
  31: 'Unknown31',
  32: 'Throw',
  33: 'LearnSpell',
  34: 'Unknown34',
  35: 'Unknown35',
});

const ACTION_ATTRIBUTE_TERM_KEYS = new Set([
  'BookId',
  'EventID',
  'RecipeID',
  'SkillID',
  'SpellId',
  'StatsId',
  'SurfaceType',
]);

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

function searchNormalize(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}:_+\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSearchText(values) {
  const normalized = searchNormalize(values.flat(Infinity).filter(value => value != null && value !== '').join(' '));
  return normalized ? stableStrings(normalized.split(' ')).join(' ') : '';
}

function exactNullableString(value, field) {
  assert(value === null || typeof value === 'string', `${field} must be a string or null.`);
  return value;
}

function optionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function exactArray(value, field) {
  assert(Array.isArray(value), `${field} must be an array.`);
  return value;
}

function verifyManifestFile(entry) {
  assert(entry && typeof entry.path === 'string', 'Source manifest contains an invalid file entry.');
  assert(Number.isInteger(entry.bytes) && entry.bytes >= 0, `Invalid byte count for ${entry.path}.`);
  assert(/^[0-9a-f]{64}$/.test(String(entry.sha256 || '')), `Invalid SHA-256 for ${entry.path}.`);
  const path = join(REPO_ROOT, ...entry.path.split('/'));
  assert(existsSync(path), `Source file is missing: ${entry.path}`);
  const buffer = readFileSync(path);
  assert(buffer.byteLength === entry.bytes, `Source byte count differs from manifest: ${entry.path}`);
  assert(sha256(buffer) === entry.sha256, `Source SHA-256 differs from manifest: ${entry.path}`);
  return { path, buffer };
}

function sourceEntryBySuffix(entries, suffix) {
  const found = entries.filter(entry => entry.path.endsWith(suffix));
  assert(found.length === 1, `Expected one source manifest entry ending in ${suffix}; found ${found.length}.`);
  return found[0];
}

function fingerprintFileEntries(entries) {
  const lines = entries
    .map(entry => `${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.shard ?? ''}\0${entry.count ?? ''}`)
    .sort(compareStrings);
  return sha256(Buffer.from(`${lines.join('\n')}\n`, 'utf8'));
}

function addTerm(terms, value) {
  if (typeof value === 'string' && value.length > 0) terms.add(value);
  else if (typeof value === 'number' && Number.isFinite(value)) terms.add(String(value));
}

function addTerms(terms, values) {
  for (const value of Array.isArray(values) ? values : []) addTerm(terms, value);
}

function addStructuredTerms(terms, value) {
  if (value == null) return;
  if (typeof value === 'string' || typeof value === 'number') addTerm(terms, value);
  else if (Array.isArray(value)) for (const row of value) addStructuredTerms(terms, row);
  else if (typeof value === 'object') for (const [key, row] of Object.entries(value)) {
    addTerm(terms, key);
    addStructuredTerms(terms, row);
  }
}

function projectSourceAction(row, field, terms, observedActionTypes) {
  assert(row && typeof row === 'object' && !Array.isArray(row), `${field} must be an object.`);
  const actionType = Number(row.actionType);
  assert(Number.isInteger(actionType) && actionType >= 0 && actionType <= 255, `${field}.actionType is invalid.`);
  assert(Object.hasOwn(ACTION_DATA_TYPE_NAMES, actionType), `${field}.actionType ${actionType} has no exact enum label.`);
  assert(typeof row.trigger === 'string' && row.trigger.length > 0, `${field}.trigger is invalid.`);
  observedActionTypes.add(actionType);
  addTerm(terms, ACTION_DATA_TYPE_NAMES[actionType]);
  addTerm(terms, `ActionType ${actionType}`);
  addTerm(terms, row.trigger);
  const attributes = row.attributes == null ? {} : row.attributes;
  assert(attributes && typeof attributes === 'object' && !Array.isArray(attributes), `${field}.attributes is invalid.`);
  for (const key of ACTION_ATTRIBUTE_TERM_KEYS) addTerm(terms, attributes[key]);
  return { actionType, trigger: row.trigger };
}

function projectAction(action, field, terms, observedActionTypes) {
  assert(action && typeof action === 'object' && !Array.isArray(action), `${field} must be an object.`);
  const label = exactNullableString(action.label ?? null, `${field}.label`);
  const labelSource = exactNullableString(action.labelSource ?? null, `${field}.labelSource`);
  addTerm(terms, label);
  addTerm(terms, labelSource);
  addTerm(terms, action.handler);
  addTerm(terms, action.target);
  addTerm(terms, action.cost);
  addTerm(terms, action.consume?.kind);
  addTerm(terms, action.program?.mode);
  addTerm(terms, action.special?.kind);
  addTerm(terms, action.special?.bookId);
  addTerm(terms, action.special?.recipeId);
  addTerms(terms, action.special?.matchingRecipeIds);
  const sourceAction = action.program?.sourceAction;
  const sourceRows = [];
  if (sourceAction?.primary) {
    sourceRows.push(projectSourceAction(
      sourceAction.primary,
      `${field}.program.sourceAction.primary`,
      terms,
      observedActionTypes,
    ));
  }
  for (const [index, alias] of exactArray(sourceAction?.aliases || [], `${field}.program.sourceAction.aliases`).entries()) {
    sourceRows.push(projectSourceAction(
      alias,
      `${field}.program.sourceAction.aliases[${index}]`,
      terms,
      observedActionTypes,
    ));
  }
  return {
    label,
    labelSource,
    handler: optionalString(action.handler),
    target: optionalString(action.target),
    cost: optionalString(action.cost),
    consume: action.consume && typeof action.consume === 'object'
      ? {
          kind: optionalString(action.consume.kind),
          amount: Number.isFinite(Number(action.consume.amount)) ? Number(action.consume.amount) : null,
        }
      : null,
    mode: optionalString(action.program?.mode),
    sourceActions: sourceRows,
  };
}

function projectInteraction(interaction, field, terms) {
  assert(interaction && typeof interaction === 'object' && !Array.isArray(interaction), `${field} must be an object.`);
  const label = exactNullableString(interaction.label ?? null, `${field}.label`);
  addTerm(terms, label);
  addTerm(terms, interaction.handler);
  addTerm(terms, interaction.cost);
  addTerm(terms, interaction.mode);
  return {
    label,
    handler: optionalString(interaction.handler),
    cost: optionalString(interaction.cost),
    mode: optionalString(interaction.mode),
  };
}

function projectEffect(effect, field, terms) {
  assert(effect && typeof effect === 'object' && !Array.isArray(effect), `${field} must be an object.`);
  addTerm(terms, effect.stat);
  addTerm(terms, effect.mode);
  addTerm(terms, effect.unit);
  addTerm(terms, effect.note);
  return {
    stat: optionalString(effect.stat),
    mode: optionalString(effect.mode),
    value: typeof effect.value === 'number' || typeof effect.value === 'string' ? effect.value : null,
    unit: optionalString(effect.unit),
    note: optionalString(effect.note),
  };
}

function projectLifecycle(lifecycle, field, terms) {
  assert(lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle), `${field} must be an object.`);
  const values = [
    lifecycle.bg3Id,
    lifecycle.kind,
    lifecycle.gate,
    lifecycle.mode,
    lifecycle.projectionMode,
    lifecycle.sourceField,
    lifecycle.activationModel,
  ];
  for (const value of values) addTerm(terms, value);
  const grantedActionIds = stableStrings(exactArray(lifecycle.grantedActions || [], `${field}.grantedActions`)
    .flatMap(action => [action?.spellId, action?.bg3Id]));
  const grantedInterrupts = exactArray(lifecycle.grantedInterrupts || [], `${field}.grantedInterrupts`);
  const grantedInterruptIds = stableStrings(grantedInterrupts.flatMap(interrupt => [interrupt?.interruptId, interrupt?.bg3Id]));
  const interruptEvents = stableStrings(grantedInterrupts.flatMap(interrupt => [
    interrupt?.event?.raw,
    ...(Array.isArray(interrupt?.event?.contexts) ? interrupt.event.contexts : []),
  ]));
  const sourceRuleIds = stableStrings(exactArray(lifecycle.sourceRuleReferences || [], `${field}.sourceRuleReferences`)
    .map(reference => reference?.bg3Id));
  addTerms(terms, grantedActionIds);
  addTerms(terms, grantedInterruptIds);
  addTerms(terms, interruptEvents);
  addTerms(terms, sourceRuleIds);
  return {
    bg3Id: optionalString(lifecycle.bg3Id),
    kind: optionalString(lifecycle.kind),
    gate: optionalString(lifecycle.gate),
    mode: optionalString(lifecycle.mode),
    projectionMode: optionalString(lifecycle.projectionMode),
    sourceField: optionalString(lifecycle.sourceField),
    activationModel: optionalString(lifecycle.activationModel),
    grantedActionIds,
    grantedInterruptIds,
    interruptEvents,
    sourceRuleIds,
  };
}

function projectProfile(item, profile, terms, observedActionTypes) {
  const mechanics = item.mechanics;
  assert(mechanics && typeof mechanics === 'object' && !Array.isArray(mechanics), `${item.id}/${profile} mechanics are missing.`);
  const actions = exactArray(mechanics.actions, `${item.id}/${profile}.mechanics.actions`)
    .map((action, index) => projectAction(
      action,
      `${item.id}/${profile}.mechanics.actions[${index}]`,
      terms,
      observedActionTypes,
    ));
  const interactions = exactArray(mechanics.interactions, `${item.id}/${profile}.mechanics.interactions`)
    .map((interaction, index) => projectInteraction(
      interaction,
      `${item.id}/${profile}.mechanics.interactions[${index}]`,
      terms,
    ));
  const lifecycle = exactArray(mechanics.lifecyclePrograms, `${item.id}/${profile}.mechanics.lifecyclePrograms`)
    .map((entry, index) => projectLifecycle(
      entry,
      `${item.id}/${profile}.mechanics.lifecyclePrograms[${index}]`,
      terms,
    ));
  const effects = exactArray(mechanics.effects, `${item.id}/${profile}.mechanics.effects`)
    .map((effect, index) => projectEffect(effect, `${item.id}/${profile}.mechanics.effects[${index}]`, terms));

  addTerm(terms, mechanics.mode);
  addTerm(terms, mechanics.activation?.cost);
  addTerm(terms, mechanics.target?.kind);
  addTerm(terms, mechanics.duration?.kind);
  addTerm(terms, mechanics.duration?.label);
  addTerm(terms, mechanics.profile?.kind);
  addTerms(terms, mechanics.profile?.matchTokens);
  addTerms(terms, mechanics.profile?.roles);
  addTerm(terms, mechanics.equipment?.armorKind);
  for (const [flag, enabled] of Object.entries(mechanics.profile?.flags || {})) if (enabled === true) addTerm(terms, flag);
  const coverage = mechanics.engineCoverage;
  const sourceFacts = mechanics.sourceFacts;
  assert(coverage?.schemaVersion === 'bg3-item-engine-coverage/1', `${item.id}/${profile} engine coverage is missing.`);
  assert(sourceFacts?.schemaVersion === 'bg3-item-source-facts/1', `${item.id}/${profile} source facts are missing.`);
  assert(typeof item.props === 'string' && item.props.trim(), `${item.id}/${profile} readable props are missing.`);
  addTerm(terms, item.props);
  addStructuredTerms(terms, coverage);
  addStructuredTerms(terms, sourceFacts);
  addStructuredTerms(terms, mechanics.profile?.scroll);
  addStructuredTerms(terms, mechanics.profile?.armor);
  addStructuredTerms(terms, mechanics.profile?.instrument);

  return {
    actionCount: actions.length,
    interactionCount: interactions.length,
    lifecycleCount: lifecycle.length,
    effectCount: effects.length,
    actions,
    interactions,
    lifecycle,
    effects,
    props: item.props,
    engineCoverage: coverage,
    sourceFacts,
    scroll: mechanics.profile?.scroll || null,
    armor: mechanics.profile?.armor || null,
    instrument: mechanics.profile?.instrument || null,
  };
}

function exactProfiles(item) {
  const profiles = exactArray(item.source?.profiles, `${item.id}.source.profiles`);
  assert(profiles.length > 0, `${item.id} has no source profiles.`);
  assert(profiles.every(profile => PROFILE_ORDER.includes(profile)), `${item.id} has an unknown source profile.`);
  assert(new Set(profiles).size === profiles.length, `${item.id} has duplicate source profiles.`);
  return PROFILE_ORDER.filter(profile => profiles.includes(profile));
}

function profileItem(item, profile, profiles) {
  if (profile === 'standard') {
    assert(profiles.includes('standard'), `${item.id} has no standard profile.`);
    return item;
  }
  if (profiles.includes('standard')) {
    const overlay = item.source?.honourOverlay?.item;
    assert(overlay && typeof overlay === 'object' && !Array.isArray(overlay), `${item.id} has no honour item overlay.`);
    return overlay;
  }
  assert(profiles.length === 1 && profiles[0] === 'honour', `${item.id} has an invalid honour-only profile set.`);
  assert(item.source?.honourOverlay?.item == null, `${item.id} honour-only item unexpectedly has an overlay.`);
  return item;
}

function relationProjection(item) {
  const availability = item.source?.availability;
  assert(availability && typeof availability === 'object' && !Array.isArray(availability), `${item.id} availability is missing.`);
  const recipeRecords = exactArray(availability.recipeRecords, `${item.id}.source.availability.recipeRecords`);
  const treasureTables = exactArray(availability.treasureTables, `${item.id}.source.availability.treasureTables`);
  const placementEvidence = item.source?.placementEvidence || {};
  assert(placementEvidence && typeof placementEvidence === 'object' && !Array.isArray(placementEvidence), `${item.id} placement evidence is invalid.`);
  const placements = {};
  for (const profile of PROFILE_ORDER) {
    const occurrences = placementEvidence[profile]?.occurrences;
    if (occurrences != null) assert(Number.isInteger(occurrences) && occurrences >= 0, `${item.id}/${profile} placement count is invalid.`);
    placements[profile] = occurrences || 0;
  }
  return {
    recipeRecordSources: recipeRecords.length,
    treasureTableSources: treasureTables.length,
    placements,
  };
}

function projectItem(item, searchRow, observedActionTypes) {
  assert(item && typeof item === 'object' && !Array.isArray(item), 'Item must be an object.');
  assert(typeof item.id === 'string' && item.id.startsWith('bg3:item:'), 'Item has an invalid identity.');
  assert(item.id === searchRow.id, `${item.id} differs from its search row identity.`);
  const profiles = exactProfiles(item);
  assert(Boolean(searchRow.honourOnly) === (profiles.length === 1 && profiles[0] === 'honour'), `${item.id} honour-only flag differs from source profiles.`);
  const description = {
    ru: exactNullableString(item.i18n?.ru?.description ?? null, `${item.id}.i18n.ru.description`),
    en: exactNullableString(item.i18n?.en?.description ?? null, `${item.id}.i18n.en.description`),
  };
  const descriptionCount = Object.values(description).filter(value => typeof value === 'string' && value.length > 0).length;
  const profileData = {};
  const searchTermsByProfile = {};
  for (const profile of profiles) {
    const terms = new Set();
    profileData[profile] = projectProfile(
      profileItem(item, profile, profiles),
      profile,
      terms,
      observedActionTypes,
    );
    searchTermsByProfile[profile] = stableStrings([...terms]);
  }
  const actionCount = Object.values(profileData).reduce((sum, profile) => sum + profile.actionCount, 0);
  const interactionCount = Object.values(profileData).reduce((sum, profile) => sum + profile.interactionCount, 0);
  const lifecycleCount = Object.values(profileData).reduce((sum, profile) => sum + profile.lifecycleCount, 0);
  return {
    itemId: item.id,
    description,
    hasDescription: descriptionCount > 0,
    descriptionCount,
    hasActions: actionCount > 0,
    actionCount,
    hasInteractions: interactionCount > 0,
    interactionCount,
    hasLifecycle: lifecycleCount > 0,
    lifecycleCount,
    relations: relationProjection(item),
    profiles: profileData,
    searchTermsByProfile,
  };
}

function countRows(items) {
  const counts = {
    items: items.length,
    profileItems: Object.fromEntries(PROFILE_ORDER.map(profile => [profile, 0])),
    itemsWithDescription: 0,
    localizedDescriptions: { ru: 0, en: 0 },
    itemsWithActions: 0,
    profileMaterializedActions: 0,
    itemsWithInteractions: 0,
    profileMaterializedInteractions: 0,
    itemsWithLifecycle: 0,
    profileMaterializedLifecyclePrograms: 0,
    relationSources: {
      recipeRecords: 0,
      treasureTables: 0,
      placements: Object.fromEntries(PROFILE_ORDER.map(profile => [profile, 0])),
    },
  };
  for (const item of items) {
    for (const profile of Object.keys(item.profiles)) counts.profileItems[profile] += 1;
    if (item.hasDescription) counts.itemsWithDescription += 1;
    for (const language of ['ru', 'en']) if (item.description[language]) counts.localizedDescriptions[language] += 1;
    if (item.hasActions) counts.itemsWithActions += 1;
    counts.profileMaterializedActions += item.actionCount;
    if (item.hasInteractions) counts.itemsWithInteractions += 1;
    counts.profileMaterializedInteractions += item.interactionCount;
    if (item.hasLifecycle) counts.itemsWithLifecycle += 1;
    counts.profileMaterializedLifecyclePrograms += item.lifecycleCount;
    counts.relationSources.recipeRecords += item.relations.recipeRecordSources;
    counts.relationSources.treasureTables += item.relations.treasureTableSources;
    for (const profile of PROFILE_ORDER) counts.relationSources.placements[profile] += item.relations.placements[profile];
  }
  return counts;
}

function detailShardValue(shard, items) {
  return {
    schemaVersion: 'bg3-ui-item-presentation-detail/1',
    catalogVersion: CATALOG_VERSION,
    sourceBuildId: '24532579',
    shard,
    itemCount: items.length,
    items,
  };
}

function detailRow(item) {
  return { itemId: item.itemId, description: item.description, profiles: item.profiles };
}

function itemNeedsDetail(item) {
  return item.hasDescription || Object.values(item.profiles).some(profile => (
    profile.actionCount > 0
    || profile.interactionCount > 0
    || profile.lifecycleCount > 0
    || profile.effectCount > 0
  ));
}

function searchShardValue(shard, rows) {
  return {
    schemaVersion: 'bg3-ui-item-presentation-search/1',
    catalogVersion: CATALOG_VERSION,
    sourceBuildId: '24532579',
    shard,
    rowCount: rows.length,
    rows,
  };
}

function packSearchShards(items) {
  const shards = [];
  let current = [];

  function nextShard() {
    return String(shards.length).padStart(4, '0');
  }

  function flush() {
    if (!current.length) return;
    const shard = nextShard();
    const value = searchShardValue(shard, current);
    const buffer = jsonBuffer(value);
    assert(buffer.byteLength <= HARD_SEARCH_BYTES, `Generated search shard ${shard} exceeds the hard byte limit.`);
    const path = `search/${shard}.json`;
    const entry = {
      path,
      shard,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
      rowCount: current.length,
    };
    shards.push({ path, value, buffer, entry });
    current = [];
  }

  for (const [itemIndex, item] of items.entries()) {
    const descriptionText = compactSearchText([item.description.ru, item.description.en]);
    const standardText = compactSearchText(item.searchTermsByProfile.standard || []);
    const honourText = compactSearchText(item.searchTermsByProfile.honour || []);
    if (!descriptionText && !standardText && !honourText) continue;
    const bothProfiles = Boolean(item.profiles.standard && item.profiles.honour);
    const storedHonourText = bothProfiles && honourText === standardText ? null : honourText || '';
    const row = [itemIndex, descriptionText || null, item.profiles.standard ? standardText : null, item.profiles.honour ? storedHonourText : null];
    const candidate = jsonBuffer(searchShardValue(nextShard(), [...current, row]));
    if (candidate.byteLength > TARGET_SEARCH_BYTES && current.length) flush();
    const single = jsonBuffer(searchShardValue(nextShard(), [...current, row]));
    assert(single.byteLength <= HARD_SEARCH_BYTES, `Search row ${item.itemId} exceeds the hard byte limit.`);
    current.push(row);
  }
  flush();
  return { shards };
}

function packDetailShards(items) {
  const shards = [];
  const shardByItemId = new Map();
  let current = [];

  function nextShard() {
    return String(shards.length).padStart(4, '0');
  }

  function flush() {
    if (!current.length) return;
    const shard = nextShard();
    const value = detailShardValue(shard, current);
    const buffer = jsonBuffer(value);
    assert(buffer.byteLength <= HARD_DETAIL_BYTES, `Generated detail shard ${shard} exceeds the hard byte limit.`);
    const path = `detail/${shard}.json`;
    const entry = {
      path,
      shard,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
      itemCount: current.length,
    };
    shards.push({ path, value, buffer, entry });
    for (const item of current) {
      assert(!shardByItemId.has(item.itemId), `Detail item ${item.itemId} was assigned twice.`);
      shardByItemId.set(item.itemId, shard);
    }
    current = [];
  }

  for (const item of items) {
    if (!itemNeedsDetail(item)) continue;
    const row = detailRow(item);
    const candidate = jsonBuffer(detailShardValue(nextShard(), [...current, row]));
    if (candidate.byteLength > TARGET_DETAIL_BYTES && current.length) flush();
    const single = jsonBuffer(detailShardValue(nextShard(), [...current, row]));
    assert(single.byteLength <= HARD_DETAIL_BYTES, `Detail row ${item.itemId} exceeds the hard byte limit.`);
    current.push(row);
  }
  flush();
  return { shards, shardByItemId };
}

function compactItem(item, shardByItemId) {
  const detailShard = shardByItemId.get(item.itemId) || null;
  assert(Boolean(detailShard) === itemNeedsDetail(item), `Detail assignment differs for ${item.itemId}.`);
  const flags = (item.hasDescription ? 1 : 0)
    | (item.hasActions ? 2 : 0)
    | (item.hasInteractions ? 4 : 0)
    | (item.hasLifecycle ? 8 : 0);
  const profileMask = (item.profiles.standard ? 1 : 0) | (item.profiles.honour ? 2 : 0);
  return [
    item.itemId,
    detailShard,
    flags,
    item.descriptionCount,
    item.actionCount,
    item.interactionCount,
    item.lifecycleCount,
    item.relations.recipeRecordSources,
    item.relations.treasureTableSources,
    item.relations.placements.standard,
    item.relations.placements.honour,
    profileMask,
  ];
}

function buildExpectedOutput() {
  const sourceManifestPath = join(SOURCE_ROOT, 'manifest.json');
  const sourceManifestBuffer = readFileSync(sourceManifestPath);
  const sourceManifest = JSON.parse(sourceManifestBuffer);
  assert(sourceManifest.catalogVersion === CATALOG_VERSION, 'Unexpected source manifest catalog version.');
  assert(sourceManifest.immutable === true, 'Source manifest is not marked immutable.');
  assert(sourceManifest.contracts?.itemSchemaVersion === 6, 'Unexpected v10 item schema version.');
  assert(sourceManifest.contracts?.itemMechanics?.schemaVersion === 'bg3-item-engine-coverage/1', 'Missing v10 item mechanics contract.');

  const searchEntry = sourceEntryBySuffix(sourceManifest.files.other, `/${CATALOG_VERSION}/search-index.json`);
  const searchVerified = verifyManifestFile(searchEntry);
  const searchIndex = JSON.parse(searchVerified.buffer);
  assert(searchIndex.schemaVersion === 'dnd-world-bg3-search/1', 'Unexpected search index schema version.');
  assert(searchIndex.catalogVersion === CATALOG_VERSION, 'Unexpected search index catalog version.');
  assert(searchIndex.count === sourceManifest.counts.items, 'Search index count differs from source manifest.');
  assert(searchIndex.items.length === searchIndex.count, 'Search index row count is invalid.');

  const searchRows = new Map();
  for (const row of searchIndex.items) {
    assert(row && typeof row.id === 'string', 'Search index contains an invalid row.');
    assert(!searchRows.has(row.id), `Search index contains duplicate item ${row.id}.`);
    assert(typeof row.shard === 'string' && row.shard.length > 0, `Search row ${row.id} has no shard.`);
    searchRows.set(row.id, row);
  }

  const itemEntries = [...sourceManifest.files.items]
    .sort((left, right) => compareStrings(left.shard, right.shard));
  assert(itemEntries.length === sourceManifest.sharding.runtimeItems.shards, 'Item shard count differs from source sharding metadata.');
  const seenShards = new Set();
  const seenItems = new Set();
  const observedActionTypes = new Set();
  const projectedItems = [];
  let sourceItemBytes = 0;

  for (const entry of itemEntries) {
    assert(typeof entry.shard === 'string' && !seenShards.has(entry.shard), `Duplicate item shard ${entry.shard}.`);
    seenShards.add(entry.shard);
    const verified = verifyManifestFile(entry);
    sourceItemBytes += verified.buffer.byteLength;
    const shard = JSON.parse(verified.buffer);
    assert(shard.schemaVersion === 'dnd-world-bg3-items/1', `Unexpected schema in ${entry.path}.`);
    assert(shard.catalogVersion === CATALOG_VERSION, `Unexpected catalog version in ${entry.path}.`);
    assert(shard.shard === entry.shard, `Shard identity differs in ${entry.path}.`);
    assert(shard.count === entry.count && shard.items.length === entry.count, `Count differs in ${entry.path}.`);
    for (const item of shard.items) {
      assert(!seenItems.has(item.id), `Duplicate runtime item ${item.id}.`);
      seenItems.add(item.id);
      const searchRow = searchRows.get(item.id);
      assert(searchRow, `Runtime item ${item.id} is missing from search index.`);
      assert(searchRow.shard === entry.shard, `Search shard differs for ${item.id}.`);
      projectedItems.push(projectItem(item, searchRow, observedActionTypes));
    }
  }

  assert(projectedItems.length === sourceManifest.counts.items, 'Runtime item count differs from source manifest.');
  assert(seenItems.size === searchRows.size, 'Runtime/search item identity sets differ.');
  for (const itemId of searchRows.keys()) assert(seenItems.has(itemId), `Search item ${itemId} is missing from runtime shards.`);
  projectedItems.sort((left, right) => compareStrings(left.itemId, right.itemId));
  const counts = countRows(projectedItems);

  assert(counts.itemsWithDescription === 5706, 'Exact v10 localized description census changed.');
  assert(counts.localizedDescriptions.ru === 5706 && counts.localizedDescriptions.en === 5706, 'Exact v10 bilingual description census changed.');
  assert(counts.itemsWithActions === sourceManifest.counts.itemRuleActions.items, 'Item action census differs from source manifest.');
  assert(counts.itemsWithLifecycle === sourceManifest.counts.itemLifecyclePrograms.items, 'Item lifecycle census differs from source manifest.');
  assert(counts.relationSources.placements.standard === sourceManifest.counts.universe.placementEvidence.standardOccurrences, 'Standard placement evidence count differs from source manifest.');
  assert(counts.relationSources.placements.honour === sourceManifest.counts.universe.placementEvidence.honourOccurrences, 'Honour placement evidence count differs from source manifest.');

  const actionTypeNames = Object.fromEntries([...observedActionTypes]
    .sort((left, right) => left - right)
    .map(actionType => [String(actionType), ACTION_DATA_TYPE_NAMES[actionType]]));
  const details = packDetailShards(projectedItems);
  const searches = packSearchShards(projectedItems);
  const compactItems = projectedItems.map(item => compactItem(item, details.shardByItemId));
  const detailEntries = details.shards.map(shard => shard.entry);
  const searchEntries = searches.shards.map(shard => shard.entry);
  const detailSetSha256 = fingerprintFileEntries(detailEntries);
  const searchSetSha256 = fingerprintFileEntries(searchEntries);
  const rootValue = {
    schemaVersion: 'bg3-ui-item-presentation/1',
    catalogVersion: CATALOG_VERSION,
    sourceBuildId: String(sourceManifest.source.steamBuildId),
    immutableSource: true,
    deterministic: true,
    displayOnly: true,
    generatedFrom: {
      manifest: {
        path: repoPath(sourceManifestPath),
        bytes: sourceManifestBuffer.byteLength,
        sha256: sha256(sourceManifestBuffer),
      },
      searchIndex: {
        path: searchEntry.path,
        bytes: searchEntry.bytes,
        sha256: searchEntry.sha256,
      },
      runtimeItemShards: {
        count: itemEntries.length,
        bytes: sourceItemBytes,
        fingerprintSha256: fingerprintFileEntries(itemEntries),
      },
    },
    contracts: {
      itemIdentity: 'exact-v10-item-id',
      descriptions: 'exact-item.i18n-language-description-null-preserved-no-fallback-no-invention',
      descriptionStorage: 'nonempty-exact-text-in-detail-shard-descriptionCount-zero-means-both-language-values-are-null-or-empty',
      profileSelection: 'standard-base-honour-full-overlay-honour-only-base',
      actionLabels: 'exact-localized-item-action-and-interaction-labels',
      sourceActionLabels: 'exact-ActionDataType-number-and-trigger-with-display-only-official-enum-name-map',
      countSemantics: 'item-counts-sum-materialized-profile-records-profile-counts-are-exact-per-profile',
      itemRowColumns: ['itemId', 'detailShard', 'flags', 'descriptionCount', 'actionCount', 'interactionCount', 'lifecycleCount', 'recipeRecordSources', 'treasureTableSources', 'standardPlacements', 'honourPlacements', 'profileMask'],
      itemRowFlags: { hasDescription: 1, hasActions: 2, hasInteractions: 4, hasLifecycle: 8 },
      profileMask: { standard: 1, honour: 2 },
      searchRowColumns: ['itemIndex', 'normalizedDescriptionTokenText', 'standardNormalizedTokenText', 'honourNormalizedTokenTextOrNullSameAsStandard'],
      searchNormalization: 'trim-lowercase-ru-yo-to-e-letters-numbers-colon-underscore-plus-hyphen-space-unique-sort',
      searchSemantics: 'query-normalized-to-space-tokens-every-token-must-be-a-substring-of-description-plus-selected-profile-token-text',
      searchScope: 'exact-descriptions-engine-coverage-source-facts-and-profile-presentation-terms-joined-at-runtime-with-pinned-v10-search-index-names-and-facets',
      searchProfileSelection: 'normalized-description-token-text-plus-exactly-one-selected-profile-token-text',
      searchHonourFallback: 'when-profileMask-is-3-and-honour-token-text-is-null-use-standard-token-text-otherwise-null-means-profile-absent',
      searchTerms: 'exact-descriptions-structured-scalars-and-display-labels-normalized-once-full-text-not-duplicated',
      relations: 'source-array-lengths-and-exact-placement-evidence-occurrences',
      detailResolution: 'detail-shard-is-exact-and-profile-materialized-display-data-only',
      execution: 'never-executable-hydrate-pinned-v10-item-before-runtime-use',
      actionDataTypeNamesSource: 'Norbyte/bg3se/BG3Extender/GameDefinitions/Enumerations/Stats.inl',
    },
    counts,
    sourceActionTypeNames: actionTypeNames,
    storage: {
      detailPathTemplate: 'detail/{shard}.json',
      targetBytes: TARGET_DETAIL_BYTES,
      hardLimitBytes: HARD_DETAIL_BYTES,
      detailItemCount: details.shardByItemId.size,
      detailSetSha256,
      detailFiles: detailEntries,
      searchPathTemplate: 'search/{shard}.json',
      searchTargetBytes: TARGET_SEARCH_BYTES,
      searchHardLimitBytes: HARD_SEARCH_BYTES,
      searchRowCount: searchEntries.reduce((sum, entry) => sum + entry.rowCount, 0),
      searchSetSha256,
      searchFiles: searchEntries,
    },
    items: compactItems,
  };
  const manifestBuffer = jsonBuffer(rootValue);
  assert(manifestBuffer.byteLength <= MAX_ROOT_BYTES, `Generated root is ${manifestBuffer.byteLength} bytes; bounded sharding is required.`);
  const manifestEntry = {
    path: 'manifest.json',
    bytes: manifestBuffer.byteLength,
    sha256: sha256(manifestBuffer),
  };
  const generatedEntries = [manifestEntry, ...detailEntries, ...searchEntries];
  const generatedFileSetSha256 = sha256(Buffer.from(`${generatedEntries
    .map(entry => `${entry.path}\0${entry.bytes}\0${entry.sha256}`)
    .sort(compareStrings)
    .join('\n')}\n`, 'utf8'));
  const integrityValue = {
    schemaVersion: 'bg3-ui-item-presentation-integrity/1',
    catalogVersion: CATALOG_VERSION,
    manifest: manifestEntry,
    detailSetSha256,
    searchSetSha256,
    generatedFileSetSha256,
  };
  const integrityBuffer = jsonBuffer(integrityValue, true);
  return { rootValue, manifestBuffer, integrityValue, integrityBuffer, details, searches };
}

function assertExactFile(path, expected) {
  assert(existsSync(path), `Generated file is missing: ${repoPath(path)}`);
  const actual = readFileSync(path);
  assert(actual.equals(expected), `Generated file is stale: ${repoPath(path)}`);
}

function writeOrCheck(expected) {
  if (CHECK_ONLY) {
    assert(existsSync(OUTPUT_ROOT), `Generated directory is missing: ${repoPath(OUTPUT_ROOT)}`);
    const names = readdirSync(OUTPUT_ROOT).sort(compareStrings);
    assert(JSON.stringify(names) === JSON.stringify(['detail', 'integrity.json', 'manifest.json', 'search']), 'Generated directory contains an unexpected file set.');
    assert(existsSync(DETAIL_ROOT), `Generated detail directory is missing: ${repoPath(DETAIL_ROOT)}`);
    const detailNames = readdirSync(DETAIL_ROOT).sort(compareStrings);
    const expectedNames = expected.details.shards.map(shard => `${shard.entry.shard}.json`).sort(compareStrings);
    assert(JSON.stringify(detailNames) === JSON.stringify(expectedNames), 'Generated detail directory contains an unexpected file set.');
    assert(existsSync(SEARCH_ROOT), `Generated search directory is missing: ${repoPath(SEARCH_ROOT)}`);
    const searchNames = readdirSync(SEARCH_ROOT).sort(compareStrings);
    const expectedSearchNames = expected.searches.shards.map(shard => `${shard.entry.shard}.json`).sort(compareStrings);
    assert(JSON.stringify(searchNames) === JSON.stringify(expectedSearchNames), 'Generated search directory contains an unexpected file set.');
    assertExactFile(OUTPUT_MANIFEST, expected.manifestBuffer);
    assertExactFile(OUTPUT_INTEGRITY, expected.integrityBuffer);
    for (const shard of expected.details.shards) assertExactFile(join(OUTPUT_ROOT, ...shard.path.split('/')), shard.buffer);
    for (const shard of expected.searches.shards) assertExactFile(join(OUTPUT_ROOT, ...shard.path.split('/')), shard.buffer);
    return;
  }
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  mkdirSync(DETAIL_ROOT, { recursive: true });
  mkdirSync(SEARCH_ROOT, { recursive: true });
  for (const shard of expected.details.shards) writeFileSync(join(OUTPUT_ROOT, ...shard.path.split('/')), shard.buffer);
  for (const shard of expected.searches.shards) writeFileSync(join(OUTPUT_ROOT, ...shard.path.split('/')), shard.buffer);
  writeFileSync(OUTPUT_MANIFEST, expected.manifestBuffer);
  writeFileSync(OUTPUT_INTEGRITY, expected.integrityBuffer);
}

const expected = buildExpectedOutput();
writeOrCheck(expected);
const verb = CHECK_ONLY ? 'verified' : 'generated';
console.log(JSON.stringify({
  status: verb,
  output: repoPath(OUTPUT_MANIFEST),
  items: expected.rootValue.counts.items,
  bytes: expected.manifestBuffer.byteLength,
  sha256: expected.integrityValue.manifest.sha256,
  sourceItemShards: expected.rootValue.generatedFrom.runtimeItemShards.count,
  detailShards: expected.details.shards.length,
  detailSetSha256: expected.integrityValue.detailSetSha256,
  searchShards: expected.searches.shards.length,
  searchSetSha256: expected.integrityValue.searchSetSha256,
}, null, 2));

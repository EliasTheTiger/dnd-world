import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
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
const PROFILE_ORDER = ['standard'];
const WORLD_BOUND_ACTION_TYPES = new Set([1, 2, 3, 4, 9, 10, 14, 15, 16, 17, 22, 24, 26, 27, 35]);
const CHECK_ONLY = process.argv.includes('--check');

/* Exact numeric members from Norbyte/bg3se
   BG3Extender/GameDefinitions/Enumerations/Stats.inl. Values 21, 25 and 29
   are absent from the source enum. They validate the pinned source only and
   are never copied into the display/search projection. */
const ACTION_DATA_TYPES = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 33, 34, 35,
]);

const INTERNAL_SEARCH_TOKENS = new Set([
  'actiontype',
  'bg3',
  'boosts',
  'display-only-localization',
  'empty',
  'explicit',
  'handler',
  'manual',
  'mixed',
  'object',
  'onusepeaceactions',
  'program',
  'self',
  'source',
  'sourcefield',
  'structured',
  'target',
  'trigger',
  'typed',
  'unknown',
]);

const PROFILE_KIND_LABELS = Object.freeze({
  ammo: 'боеприпас',
  armor: 'доспех',
  container: 'контейнер',
  food: 'еда',
  instrument: 'музыкальный инструмент',
  light: 'источник света',
  lore: 'текст',
  magic: 'магический предмет',
  material: 'алхимический материал',
  misc: 'предмет',
  poison: 'яд',
  potion: 'зелье',
  scroll: 'свиток',
  shield: 'щит',
  trap: 'ловушка',
  water: 'напиток',
  weapon: 'оружие',
});

const ARMOR_KIND_LABELS = Object.freeze({
  heavy: 'тяжёлый доспех',
  light: 'лёгкий доспех',
  medium: 'средний доспех',
  shield: 'щит',
});

const PROFILE_FLAG_LABELS = Object.freeze({
  componentPouch: 'мешочек компонентов',
  consumable: 'расходуемый предмет',
  focus: 'магическая фокусировка',
  magical: 'магический предмет',
  metal: 'металлический предмет',
  portable: 'переносимый предмет',
  proficiencyExempt: 'не требует владения',
});

const LIFECYCLE_KIND_LABELS = Object.freeze({
  passive: 'пассивное свойство',
  spell: 'особое действие',
  status: 'состояние',
});

const LIFECYCLE_GATE_LABELS = Object.freeze({
  equipped: 'при экипировке',
  'equipped-main-hand': 'в основной руке',
  'equipped-off-hand': 'во вспомогательной руке',
  'granted-action': 'при особом действии предмета',
  inventory: 'пока находится в инвентаре',
  'on-hit': 'при попадании',
});

const ABILITY_LABELS = Object.freeze({
  cha: 'Харизма',
  con: 'Телосложение',
  dex: 'Ловкость',
  int: 'Интеллект',
  str: 'Сила',
  wis: 'Мудрость',
});

const EFFECT_MODE_LABELS = Object.freeze({
  add: 'модификатор',
  adv: 'преимущество',
  dis: 'помеха',
  min: 'минимальное значение',
});

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
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
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

function userSearchTerms(values) {
  return stableStrings(values.flatMap(value => searchNormalize(value).split(' '))
    .filter(value => value.length > 0
      && !value.includes('_')
      && !INTERNAL_SEARCH_TOKENS.has(value)
      && !/^bg3(?:[-:]|$)/i.test(value)
      && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)));
}

function publicDisplayLabel(value, fallback, field) {
  const exact = exactNullableString(value ?? null, field);
  if (!exact || !exact.trim()) return fallback;
  const technical = /(?:^|\s)\S*_\S*(?:\s|$)|[0-9a-f]{8}-[0-9a-f-]{27,}|\b(?:BG3|UnlockSpell|sourceField|programId|spellId|interruptId|manual|structured|typed|mixed|object|self|actiontype|boosts)\b|display-only-localization/i;
  if (!technical.test(exact)) return exact;
  const prefix = exact.split(':', 1)[0].trim();
  return prefix && !technical.test(prefix) ? prefix : fallback;
}

function resolvedActionSpecial(action) {
  const direct = action?.special;
  if (direct && typeof direct === 'object' && !Array.isArray(direct) && Object.keys(direct).length > 0) return direct;
  const program = action?.program?.special;
  return program && typeof program === 'object' && !Array.isArray(program) ? program : {};
}

function isPlotBoundStorageAction(action) {
  const primary = action?.program?.sourceAction?.primary;
  const special = resolvedActionSpecial(action);
  const actionType = Number(primary?.actionType);
  const statsId = primary?.attributes?.StatsId;
  const conditions = primary?.attributes?.Conditions;
  const eventId = primary?.attributes?.EventID;
  return WORLD_BOUND_ACTION_TYPES.has(actionType)
    || (typeof eventId === 'string' && eventId.length > 0)
    || (actionType === 8 && special.kind !== 'bg3LightToggle')
    || actionType === 19
    || actionType === 22
    || (typeof statsId === 'string' && /(?:ORI|CAMP)_/i.test(statsId))
    || (typeof conditions === 'string' && /(?:REALLY|ORI|CAMP)_/i.test(conditions))
    || special.kind === 'bg3Story'
    || (
      action?.handler === 'bg3RootProgram'
      && special.kind === 'bg3Tadpole'
      && special.requiresCampaignHandler === true
    );
}

function validateSourceAction(row, field) {
  assert(row && typeof row === 'object' && !Array.isArray(row), `${field} must be an object.`);
  const actionType = Number(row.actionType);
  assert(Number.isInteger(actionType) && actionType >= 0 && actionType <= 255, `${field}.actionType is invalid.`);
  assert(ACTION_DATA_TYPES.has(actionType), `${field}.actionType ${actionType} is absent from the exact source enum.`);
  assert(typeof row.trigger === 'string' && row.trigger.length > 0, `${field}.trigger is invalid.`);
  const attributes = row.attributes == null ? {} : row.attributes;
  assert(attributes && typeof attributes === 'object' && !Array.isArray(attributes), `${field}.attributes is invalid.`);
}

function projectAction(action, field, terms) {
  assert(action && typeof action === 'object' && !Array.isArray(action), `${field} must be an object.`);
  const label = publicDisplayLabel(action.label, 'Действие предмета', `${field}.label`);
  exactNullableString(action.labelSource ?? null, `${field}.labelSource`);
  addTerm(terms, label);
  const sourceAction = action.program?.sourceAction;
  if (sourceAction?.primary) validateSourceAction(sourceAction.primary, `${field}.program.sourceAction.primary`);
  for (const [index, alias] of exactArray(sourceAction?.aliases || [], `${field}.program.sourceAction.aliases`).entries()) {
    validateSourceAction(alias, `${field}.program.sourceAction.aliases[${index}]`);
  }
  return { label };
}

function projectInteraction(interaction, field, terms) {
  assert(interaction && typeof interaction === 'object' && !Array.isArray(interaction), `${field} must be an object.`);
  const label = publicDisplayLabel(interaction.label, 'Взаимодействие с предметом', `${field}.label`);
  addTerm(terms, label);
  return { label };
}

function effectStatLabel(stat, field) {
  assert(typeof stat === 'string' && stat.length > 0, `${field}.stat is invalid.`);
  if (stat === 'ac') return 'класс доспеха';
  if (stat === 'speed') return 'скорость';
  if (stat === 'save.all') return 'все спасброски';
  const ability = /^(?:ab|save)\.(str|dex|con|int|wis|cha)$/.exec(stat);
  if (ability) return `${stat.startsWith('save.') ? 'спасбросок' : 'характеристика'} ${ABILITY_LABELS[ability[1]]}`;
  const skill = /^skill\.(.+)$/u.exec(stat);
  if (skill) return `навык ${skill[1]}`;
  fail(`${field}.stat ${stat} has no user-facing label.`);
}

function projectEffect(effect, field, terms) {
  assert(effect && typeof effect === 'object' && !Array.isArray(effect), `${field} must be an object.`);
  const label = effectStatLabel(effect.stat, field);
  const operation = EFFECT_MODE_LABELS[effect.mode];
  assert(operation, `${field}.mode ${effect.mode} has no user-facing label.`);
  addTerm(terms, label);
  addTerm(terms, operation);
  addTerm(terms, effect.unit);
  return {
    label,
    operation,
    value: typeof effect.value === 'number' || typeof effect.value === 'string' ? effect.value : null,
    unit: optionalString(effect.unit),
  };
}

function projectLifecycle(lifecycle, field, terms) {
  assert(lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle), `${field} must be an object.`);
  exactArray(lifecycle.grantedActions || [], `${field}.grantedActions`);
  exactArray(lifecycle.grantedInterrupts || [], `${field}.grantedInterrupts`);
  exactArray(lifecycle.sourceRuleReferences || [], `${field}.sourceRuleReferences`);
  const kind = LIFECYCLE_KIND_LABELS[lifecycle.kind];
  const gate = LIFECYCLE_GATE_LABELS[lifecycle.gate];
  assert(kind, `${field}.kind ${lifecycle.kind} has no user-facing label.`);
  assert(gate, `${field}.gate ${lifecycle.gate} has no user-facing label.`);
  addTerm(terms, kind);
  addTerm(terms, gate);
  return { kind, gate };
}

const FORBIDDEN_PUBLIC_PROFILE_KEYS = new Set([
  'actionType',
  'activationModel',
  'bg3Id',
  'grantedActionIds',
  'grantedInterruptIds',
  'handler',
  'interruptEvents',
  'labelSource',
  'mode',
  'projectionMode',
  'provenance',
  'sourceActions',
  'sourceField',
  'sourceRuleIds',
  'trigger',
]);

function assertPublicProfileProjection(value, field) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    assert(!/(?:^|\s)\S*_\S*(?:\s|$)|[0-9a-f]{8}-[0-9a-f-]{27,}|\b(?:BG3|UnlockSpell|sourceField|programId|spellId|interruptId|manual|structured|typed|mixed|object|self|actiontype|boosts)\b|display-only-localization/i.test(value), `${field} contains internal source vocabulary.`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) assertPublicProfileProjection(entry, `${field}[${index}]`);
    return;
  }
  assert(typeof value === 'object', `${field} contains an unsupported value.`);
  for (const [key, entry] of Object.entries(value)) {
    assert(!FORBIDDEN_PUBLIC_PROFILE_KEYS.has(key), `${field}.${key} is not a public presentation field.`);
    assertPublicProfileProjection(entry, `${field}.${key}`);
  }
}

function projectProfile(item, profile, terms) {
  const mechanics = item.mechanics;
  assert(mechanics && typeof mechanics === 'object' && !Array.isArray(mechanics), `${item.id}/${profile} mechanics are missing.`);
  const actions = exactArray(mechanics.actions, `${item.id}/${profile}.mechanics.actions`)
    .flatMap((action, index) => isPlotBoundStorageAction(action) ? [] : [projectAction(
        action,
        `${item.id}/${profile}.mechanics.actions[${index}]`,
        terms,
      )]);
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

  const kindLabel = PROFILE_KIND_LABELS[mechanics.profile?.kind];
  assert(kindLabel, `${item.id}/${profile} profile kind ${mechanics.profile?.kind} has no user-facing label.`);
  addTerm(terms, kindLabel);
  const armorKind = mechanics.equipment?.armorKind;
  if (armorKind != null) {
    assert(ARMOR_KIND_LABELS[armorKind], `${item.id}/${profile} armor kind ${armorKind} has no user-facing label.`);
    addTerm(terms, ARMOR_KIND_LABELS[armorKind]);
  }
  for (const [flag, enabled] of Object.entries(mechanics.profile?.flags || {})) {
    if (enabled !== true) continue;
    assert(PROFILE_FLAG_LABELS[flag], `${item.id}/${profile} flag ${flag} has no user-facing label.`);
    addTerm(terms, PROFILE_FLAG_LABELS[flag]);
  }

  /* v10 makes every source item mechanically and economically complete. Keep
     that completeness fail-closed here, but do not duplicate its internal
     audit state, source fields, UUIDs or generated prose into the public UI
     projection. The canonical item hydrated for execution retains all of it. */
  const coverage = mechanics.engineCoverage;
  const sourceFacts = mechanics.sourceFacts;
  assert(coverage?.schemaVersion === 'bg3-item-engine-coverage/1', `${item.id}/${profile} engine coverage is missing.`);
  assert(sourceFacts?.schemaVersion === 'bg3-item-source-facts/1', `${item.id}/${profile} source facts are missing.`);
  assert(typeof item.props === 'string' && item.props.trim(), `${item.id}/${profile} readable props are missing.`);
  assert(mechanics.profile?.mass && typeof mechanics.profile.mass === 'object', `${item.id}/${profile} exact mass is missing.`);
  assert(mechanics.profile?.value && typeof mechanics.profile.value === 'object', `${item.id}/${profile} exact value is missing.`);

  const projection = {
    actionCount: actions.length,
    interactionCount: interactions.length,
    lifecycleCount: lifecycle.length,
    effectCount: effects.length,
    actions,
    interactions,
    lifecycle,
    effects,
  };
  assertPublicProfileProjection(projection, `${item.id}/${profile}.presentation`);
  return projection;
}

function exactProfiles(item) {
  const profiles = exactArray(item.source?.profiles, `${item.id}.source.profiles`);
  assert(profiles.length > 0, `${item.id} has no source profiles.`);
  assert(profiles.every(profile => PROFILE_ORDER.includes(profile)), `${item.id} has an unknown source profile.`);
  assert(new Set(profiles).size === profiles.length, `${item.id} has duplicate source profiles.`);
  return PROFILE_ORDER.filter(profile => profiles.includes(profile));
}

function profileItem(item, profile, profiles) {
  assert(profile === 'standard' && profiles.length === 1 && profiles[0] === 'standard', `${item.id} is not Standard-only.`);
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

function projectItem(item, searchRow) {
  assert(item && typeof item === 'object' && !Array.isArray(item), 'Item must be an object.');
  assert(typeof item.id === 'string' && item.id.startsWith('bg3:item:'), 'Item has an invalid identity.');
  assert(item.id === searchRow.id, `${item.id} differs from its search row identity.`);
  const profiles = exactProfiles(item);
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
    );
    searchTermsByProfile[profile] = userSearchTerms([...terms]);
  }
  const actionCount = Object.values(profileData).reduce((sum, profile) => sum + profile.actionCount, 0);
  const interactionCount = Object.values(profileData).reduce((sum, profile) => sum + profile.interactionCount, 0);
  const lifecycleCount = Object.values(profileData).reduce((sum, profile) => sum + profile.lifecycleCount, 0);
  const effectCount = Object.values(profileData).reduce((sum, profile) => sum + profile.effectCount, 0);
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
    hasEffects: effectCount > 0,
    effectCount,
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
    itemsWithEffects: 0,
    profileMaterializedEffects: 0,
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
    if (item.hasEffects) counts.itemsWithEffects += 1;
    counts.profileMaterializedEffects += item.effectCount;
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
    if (!descriptionText && !standardText) continue;
    const row = [itemIndex, descriptionText || null, standardText || null];
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
    | (item.hasLifecycle ? 8 : 0)
    | (item.hasEffects ? 16 : 0);
  return [
    item.itemId,
    detailShard,
    flags,
    item.descriptionCount,
    item.actionCount,
    item.interactionCount,
    item.lifecycleCount,
    item.effectCount,
    item.relations.recipeRecordSources,
    item.relations.treasureTableSources,
    item.relations.placements.standard,
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
  assert(sourceManifest.source?.itemMechanics?.schemaVersion === 'bg3-item-mechanics-source/1', 'Missing v10 item mechanics source pin.');
  assert(sourceManifest.source?.economy?.schemaVersion === 'bg3-gold-values/1', 'Missing v10 economy source pin.');

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

  const qualityEntry = sourceEntryBySuffix(
    sourceManifest.files.other,
    `/${CATALOG_VERSION}/${sourceManifest.entrypoints.itemArsenalQualityReport}`,
  );
  const qualityVerified = verifyManifestFile(qualityEntry);
  const qualityReport = JSON.parse(qualityVerified.buffer);
  assert(qualityReport.schemaVersion === 'dnd-world-item-arsenal-quality/1', 'Unexpected Full Arsenal quality schema.');
  assert(qualityReport.catalogVersion === CATALOG_VERSION && qualityReport.profile === 'standard', 'Full Arsenal quality profile differs from the source catalog.');
  assert(qualityReport.scope === 'full-arsenal-presentation', 'Full Arsenal quality scope is not presentation-only.');
  const excludedItemIds = new Set((qualityReport.removed || []).map(row => row.itemId));
  assert(excludedItemIds.size === qualityReport.counts.removed, 'Full Arsenal quality exclusions are not unique.');
  assert(qualityReport.counts.examined === sourceManifest.counts.items
    && qualityReport.counts.catalogItems === sourceManifest.counts.items,
  'Full Arsenal quality census differs from the complete Standard catalog.');

  const itemEntries = [...sourceManifest.files.items]
    .sort((left, right) => compareStrings(left.shard, right.shard));
  assert(itemEntries.length === sourceManifest.sharding.runtimeItems.shards, 'Item shard count differs from source sharding metadata.');
  const seenShards = new Set();
  const seenItems = new Set();
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
      if (!excludedItemIds.has(item.id)) projectedItems.push(projectItem(item, searchRow));
    }
  }

  assert(seenItems.size === sourceManifest.counts.items, 'Runtime item count differs from source manifest.');
  assert(projectedItems.length === qualityReport.counts.retained, 'Full Arsenal presentation count differs from its quality report.');
  assert(projectedItems.length + excludedItemIds.size === seenItems.size, 'Full Arsenal quality partition is incomplete.');
  assert(seenItems.size === searchRows.size, 'Runtime/search item identity sets differ.');
  for (const itemId of searchRows.keys()) assert(seenItems.has(itemId), `Search item ${itemId} is missing from runtime shards.`);
  projectedItems.sort((left, right) => compareStrings(left.itemId, right.itemId));
  const counts = countRows(projectedItems);

  const exactCensus = {
    itemsWithDescription: counts.itemsWithDescription,
    localizedDescriptions: counts.localizedDescriptions,
    itemsWithActions: counts.itemsWithActions,
    profileMaterializedActions: counts.profileMaterializedActions,
    itemsWithEffects: counts.itemsWithEffects,
    profileMaterializedEffects: counts.profileMaterializedEffects,
  };
  assert(exactCensus.itemsWithDescription === projectedItems.length,
    `Every Full Arsenal item must have a source description: ${JSON.stringify(exactCensus)}.`);
  assert(exactCensus.localizedDescriptions.ru === projectedItems.length
    && exactCensus.localizedDescriptions.en === projectedItems.length,
  `Every Full Arsenal item must have complete RU/EN presentation text: ${JSON.stringify(exactCensus)}.`);
  assert(counts.itemsWithLifecycle <= sourceManifest.counts.itemLifecyclePrograms.items,
    `Full Arsenal lifecycle census exceeds the Standard catalog: ${counts.itemsWithLifecycle} > ${sourceManifest.counts.itemLifecyclePrograms.items}.`);
  assert(counts.relationSources.placements.standard <= sourceManifest.counts.universe.placementEvidence.standardOccurrences,
    'Full Arsenal placement evidence exceeds the Standard catalog.');

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
      itemArsenalQuality: {
        path: qualityEntry.path,
        bytes: qualityEntry.bytes,
        sha256: qualityEntry.sha256,
        retainedItems: qualityReport.counts.retained,
        excludedItems: qualityReport.counts.removed,
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
      profileSelection: 'standard-only',
      catalogScope: 'all-standard-items-remain-in-the-runtime-catalog',
      presentationScope: 'quality-report-retained-standard-items-only',
      actionLabels: 'localized-label-only-technical-fallback-identifiers-reduced-to-safe-prefix-or-generic-no-handler-mode-trigger-source-action-or-provenance',
      detailActionFields: ['label'],
      detailInteractionFields: ['label'],
      detailLifecycleFields: ['kind', 'gate'],
      detailEffectFields: ['label', 'operation', 'value', 'unit'],
      countSemantics: 'item-counts-and-standard-record-counts-are-exact',
      itemRowColumns: ['itemId', 'detailShard', 'flags', 'descriptionCount', 'actionCount', 'interactionCount', 'lifecycleCount', 'effectCount', 'recipeRecordSources', 'treasureTableSources', 'standardPlacements'],
      itemRowFlags: { hasDescription: 1, hasActions: 2, hasInteractions: 4, hasLifecycle: 8, hasEffects: 16 },
      rulesProfile: 'standard',
      searchRowColumns: ['itemIndex', 'normalizedDescriptionTokenText', 'standardNormalizedTokenText'],
      searchNormalization: 'strip-html-tags-trim-lowercase-ru-yo-to-e-letters-numbers-colon-underscore-plus-hyphen-space-unique-sort',
      searchSemantics: 'query-normalized-to-space-tokens-every-token-must-be-a-substring-of-description-plus-selected-profile-token-text',
      searchScope: 'exact-descriptions-and-profile-presentation-terms-joined-at-runtime-with-pinned-v10-search-index-names-and-facets',
      profileSearchExclusions: 'raw-identifiers-uuids-underscore-tokens-and-internal-mode-handler-trigger-source-program-vocabulary',
      searchProfileSelection: 'normalized-description-token-text-plus-exactly-one-selected-profile-token-text',
      searchTerms: 'official-descriptions-user-facing-action-and-interaction-labels-and-russian-profile-lifecycle-effect-semantics-only-no-modes-handlers-triggers-action-types-source-identifiers-or-provenance',
      relations: 'source-array-lengths-and-exact-placement-evidence-occurrences',
      detailResolution: 'minimal-user-facing-profile-display-data-only-runtime-rules-always-hydrated-from-pinned-v10-item',
      execution: 'never-executable-hydrate-pinned-v10-item-before-runtime-use',
      sourceCompleteness: 'v10-readable-props-engine-coverage-source-facts-and-profile-economy-required-but-not-duplicated-into-public-presentation',
    },
    counts,
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

function removeStaleNumericShards(root, expectedNames) {
  if (!existsSync(root)) return;
  const expected = new Set(expectedNames);
  for (const name of readdirSync(root)) {
    if (/^[0-9]{4}\.json$/.test(name) && !expected.has(name)) unlinkSync(join(root, name));
  }
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
  removeStaleNumericShards(DETAIL_ROOT, expected.details.shards.map(shard => `${shard.entry.shard}.json`));
  removeStaleNumericShards(SEARCH_ROOT, expected.searches.shards.map(shard => `${shard.entry.shard}.json`));
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

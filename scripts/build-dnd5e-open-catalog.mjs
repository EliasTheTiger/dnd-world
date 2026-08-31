import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const OUTPUT_DIR = join(REPO_ROOT, 'data', 'dnd5e', 'open5e-cc-v1');
const CATALOG_PATH = join(OUTPUT_DIR, 'catalog.js');
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');
const NOTICE_PATH = join(OUTPUT_DIR, 'NOTICE.md');
const LOCALIZATION_PATH = join(OUTPUT_DIR, 'localization.ru.json');
const API_ROOT = 'https://api.open5e.com/v2';
const SCHEMA_VERSION = 'dnd5e-open-catalog/1';
const GLOBAL_NAME = 'DND5E_OPEN_CATALOG';
const LOCALIZATION_SCHEMA_VERSION = 'dnd5e-open-catalog-localization/1';
const LOCALIZATION_REVISION = 'ru-2026-08-31.1';

const DOCUMENT_NAMES_RU = Object.freeze({
  bfrd: 'Справочный документ Black Flag',
  'spells-that-dont-suck': 'Заклинания, которые не подводят',
  'srd-2014': 'Справочный документ системы 5.1 (D&D 5e 2014)',
  'srd-2024': 'Справочный документ системы 5.2 (D&D 5e 2024)',
});

const SOURCE_PLAN = Object.freeze({
  spells: Object.freeze({
    'srd-2014': 319,
    'srd-2024': 339,
    'spells-that-dont-suck': 180,
  }),
  abilities: Object.freeze({
    'srd-2014': Object.freeze({classFeatures: 192, speciesTraits: 93, feats: 1, total: 286}),
    'srd-2024': Object.freeze({classFeatures: 241, speciesTraits: 51, feats: 17, total: 309}),
    bfrd: Object.freeze({classFeatures: 21, speciesTraits: 0, feats: 0, total: 21}),
  }),
});

const SCHOOL_NAMES = Object.freeze({
  abjuration: 'Ограждение',
  conjuration: 'Вызов',
  divination: 'Прорицание',
  enchantment: 'Очарование',
  evocation: 'Воплощение',
  illusion: 'Иллюзия',
  necromancy: 'Некромантия',
  transmutation: 'Преобразование',
});

const DAMAGE_NAMES = Object.freeze({
  acid: 'кислота',
  bludgeoning: 'дробящий',
  cold: 'холод',
  fire: 'огонь',
  force: 'силовое поле',
  lightning: 'электричество',
  necrotic: 'некротическая энергия',
  piercing: 'колющий',
  poison: 'яд',
  psychic: 'психическая энергия',
  radiant: 'излучение',
  slashing: 'рубящий',
  thunder: 'звук',
});

const SPELL_NAME_OVERRIDES_RU = Object.freeze({
  'Mage Hand': 'Волшебная рука', 'Fire Bolt': 'Огненный снаряд', 'Ray of Frost': 'Луч холода',
  'Eldritch Blast': 'Мистический заряд', 'Minor Illusion': 'Малая иллюзия', Light: 'Свет',
  'Dancing Lights': 'Пляшущие огоньки', Message: 'Сообщение', Guidance: 'Указание',
  'Sacred Flame': 'Священное пламя', Resistance: 'Сопротивление', 'Spare the Dying': 'Уход за умирающим',
  Prestidigitation: 'Фокусы', Shillelagh: 'Дубинка', 'Poison Spray': 'Ядовитые брызги',
  Thaumaturgy: 'Чудотворство', 'Magic Missile': 'Волшебная стрела', Shield: 'Щит',
  'Mage Armor': 'Доспехи мага', 'Cure Wounds': 'Лечение ран', 'Healing Word': 'Лечащее слово',
  Bless: 'Благословение', Bane: 'Порча', 'Witch Bolt': 'Ведьмин снаряд',
  'Hellish Rebuke': 'Адский укор', 'Charm Person': 'Очарование личности', 'Detect Magic': 'Обнаружение магии',
  'Faerie Fire': 'Огонь фей', Entangle: 'Опутывание', 'Fog Cloud': 'Туманное облако',
  Thunderwave: 'Громовая волна', Sleep: 'Сон', Heroism: 'Героизм', Command: 'Приказ',
  'Shield of Faith': 'Щит веры', 'Inflict Wounds': 'Причинение ран',
  "Tasha's Hideous Laughter": 'Убийственный смех Таши', Jump: 'Прыжок', Longstrider: 'Скороход',
  Invisibility: 'Невидимость', 'Mirror Image': 'Зеркальное отражение', 'Misty Step': 'Туманный шаг',
  Web: 'Паутина', 'Scorching Ray': 'Палящий луч', 'Enhance Ability': 'Улучшение характеристики',
  'Prayer of Healing': 'Молебен лечения', 'Lesser Restoration': 'Малое восстановление',
  'Hold Person': 'Удержание личности', Darkness: 'Тьма', 'Magic Weapon': 'Волшебное оружие',
  Silence: 'Тишина', Aid: 'Подмога', 'Detect Thoughts': 'Обнаружение мыслей',
  'Flame Blade': 'Пылающий клинок', Barkskin: 'Древесная кожа', Fireball: 'Огненный шар',
  'Lightning Bolt': 'Молния', Counterspell: 'Контрзаклинание', 'Dispel Magic': 'Рассеивание магии',
});

const ABILITY_NAME_OVERRIDES_RU = Object.freeze({
  Grappler: 'Борец', Alert: 'Бдительный', 'Ability Score Improvement': 'Увеличение характеристик',
  Defense: 'Защита', 'Great Weapon Fighting': 'Сражение большим оружием',
  'Magic Initiate': 'Посвящённый в магию', Skilled: 'Умелец', 'Two-Weapon Fighting': 'Сражение двумя оружиями',
});

/* The pinned translation was generated in bulk and occasionally retained an
   English rules term inside otherwise Russian prose. Keep this pass explicit:
   it changes display text only and therefore cannot alter stable ids or engine
   policies. Longer phrases must precede their individual words. */
const ENGLISH_RULE_TERMS_RU = Object.freeze([
  [/\bBoon of Spell Recall\b/gi, 'Дар возвращения заклинания'],
  [/\bGuards and Wards\b/gi, 'Стражи и охранные руны'],
  [/\bAntimagic Field\b/gi, 'Преграда магии'],
  [/\bChannel Divinity\b/gi, 'Божественный канал'],
  [/\bCharm Person\b/gi, 'Очарование личности'],
  [/\bDivine Smite\b/gi, 'Божественная кара'],
  [/\bDispel Magic\b/gi, 'Рассеивание магии'],
  [/\bEldritch Blast\b/gi, 'Мистический заряд'],
  [/\bFiend Patron\b/gi, 'Покровитель-исчадие'],
  [/\bHallowed Ward\b/gi, 'Освящённая защита'],
  [/\bMagic Missile\b/gi, 'Волшебная стрела'],
  [/\bMinor Creation\b/gi, 'Малое сотворение'],
  [/\bMystic Arcanum\b/gi, 'Таинственный аркан'],
  [/\bNature's Ward\b/gi, 'Защита природы'],
  [/\bProduce Flame\b/gi, 'Сотворение пламени'],
  [/\bReshape Reality\b/gi, 'Изменение реальности'],
  [/\bRoll Redo\b/gi, 'Повторный бросок'],
  [/\bSpell Glyph\b/gi, 'Заклинательная глифа'],
  [/\bStarry Wisp\b/gi, 'Звёздный огонёк'],
  [/\bWild Shape\b/gi, 'Дикий облик'],
  [/\bBody Bash\b/gi, 'Удар телом'],
  [/\bFire Starter\b/gi, 'Зажигалка'],
  [/\bFire Play\b/gi, 'Игра с огнём'],
  [/\bGrave Spirit\b/gi, 'Могильный дух'],
  [/\bHit Point\b/gi, 'хит'],
  [/\bHit Dice\b/gi, 'кости хитов'],
  [/\bHit Die\b/gi, 'кость хитов'],
  [/\bLife Domain\b/gi, 'Домен Жизни'],
  [/\bMinor Fiend\b/gi, 'малое исчадие'],
  [/\bMystic Metal\b/gi, 'Мистический металл'],
  [/\bThe Fiend\b/gi, 'Исчадие'],
  [/\bAbyssal\b/gi, 'Бездонное наследие'],
  [/\bBlindsight\b/gi, 'слепое зрение'],
  [/\bChthonic\b/gi, 'Хтоническое наследие'],
  [/\bCloudkill\b/gi, 'Смертоносное облако'],
  [/\bCombat\b/gi, 'Бой'],
  [/\bCorridors\b/gi, 'Коридоры'],
  [/\bCourage\b/gi, 'Отвага'],
  [/\bCreature\b/gi, 'Существо'],
  [/\bDarkness\b/gi, 'Тьма'],
  [/\bDaylight\b/gi, 'Дневной свет'],
  [/\bDiscord\b/gi, 'Раздор'],
  [/\bDruidcraft\b/gi, 'Искусство друидов'],
  [/\bEnlarge\b/gi, 'Увеличение'],
  [/\bEnrichment\b/gi, 'Обогащение'],
  [/\bEvoker\b/gi, 'Воплотитель'],
  [/\bFear\b/gi, 'Страх'],
  [/\bFiend\b/gi, 'Исчадие'],
  [/\bfly\b/gi, 'полёт'],
  [/\bGuidance\b/gi, 'Указание'],
  [/\bHex\b/gi, 'Сглаз'],
  [/\bImage\b/gi, 'Изображение'],
  [/\bMetamagic\b/gi, 'Метамагия'],
  [/\bObject\b/gi, 'Объект'],
  [/\bOvergrowth\b/gi, 'Буйная растительность'],
  [/\bPain\b/gi, 'Боль'],
  [/\bPaladin\b/gi, 'Паладин'],
  [/\bPasswall\b/gi, 'Проход в стене'],
  [/\bPrestidigitation\b/gi, 'Фокусы'],
  [/\bReduce\b/gi, 'Уменьшение'],
  [/\bResistance\b/gi, 'Сопротивление'],
  [/\bSickened\b/gi, 'Болезнь'],
  [/\bSilence\b/gi, 'Тишина'],
  [/\bSlam\b/gi, 'Удар'],
  [/\bSleep\b/gi, 'Сон'],
  [/\bSound\b/gi, 'Звук'],
  [/\bStairs\b/gi, 'Лестницы'],
  [/\bTiny\b/gi, 'крошечный'],
  [/\bTongues\b/gi, 'Языки'],
  [/\bTremorsense\b/gi, 'чувство вибрации'],
  [/\bTremors\b/gi, 'Дрожь земли'],
  [/\bTruesight\b/gi, 'истинное зрение'],
  [/\bWebsense\b/gi, 'чувство паутины'],
  [/\bWish\b/gi, 'Желание'],
  [/\bWard\b/gi, 'Защита'],
]);

const SAVE_KEYS = Object.freeze({strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha'});
const SIGNIFICANT_CASTING_OPTION_FIELDS = Object.freeze(['damage_roll', 'target_count', 'duration', 'range', 'concentration', 'shape_size', 'desc']);
/* Structured execution is opt-in per reviewed source record. API fields are useful
   evidence, but never sufficient on their own for complex spell consequences. */
const REVIEWED_SIMPLE_DAMAGE_SPELLS = new Map([
  ['srd_inflict-wounds', Object.freeze({attackMode: 'melee'})],
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function cleanText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

function stableId(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'record';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function documentSource(document, endpoint, key) {
  return {
    provider: 'Open5e',
    documentKey: document.key,
    documentName: DOCUMENT_NAMES_RU[document.key] || document.name,
    originalDocumentName: document.name,
    publisher: document.publisher?.name || '',
    gamesystem: document.gamesystem?.key || '',
    license: 'CC-BY-4.0',
    language: 'ru',
    sourceLanguage: 'en',
    localizationRevision: LOCALIZATION_REVISION,
    permalink: document.permalink || '',
    apiResource: `${API_ROOT}/${endpoint}/${encodeURIComponent(key)}/`,
  };
}

function canonicalRussian(value) {
  const prepared = cleanText(value)
    .replace(/_+(?=[A-Za-z])/g, '')
    .replace(/(?<=[A-Za-z][.!?])_+/g, '');
  const localized = ENGLISH_RULE_TERMS_RU.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), prepared)
    .replace(/\bвашего (?:DM|GM)\b/gi, 'вашего мастера')
    .replace(/\bваш (?:DM|GM)\b/gi, 'ваш мастер')
    .replace(/\bу (?:DM|GM)\b/gi, 'у мастера')
    .replace(/\b(?:DM|GM)\b/g, 'мастер')
    .replace(/\bAC\b/g, 'КД')
    .replace(/\bDC\b/g, 'СЛ')
    .replace(/\bHP\b/g, 'хиты')
    .replace(/\bPB\b/g, 'БМ')
    .replace(/\bINT\b/g, 'ИНТ')
    .replace(/\bSTR\b/g, 'СИЛ')
    .replace(/\bCon\b/g, 'Тел')
    .replace(/\bStr\b/g, 'Сил')
    .replace(/\bDex\b/g, 'Лов')
    .replace(/\bCR\b/g, 'ПО')
    .replace(/\bGP\b/g, 'зм')
    .replace(/\bCP\b/g, 'мм')
    .replace(/\bsp\b/g, 'см')
    .replace(/\bHit\b/g, 'Попадание')
    .replace(/\bC\b/g, 'К')
    .replace(/\bR\b/g, 'Р')
    .replace(/\bM\b/g, 'М')
    .replace(/\bU-Z\b/g, 'У—Я')
    .replace(/\bDoors\b/gi, 'Двери')
    .replace(/\*C\*/g, '*К*')
    .replace(/\*R\*/g, '*Р*')
    .replace(/\*M\*/g, '*М*')
    .replace(/\|C\|/g, '|К|')
    .replace(/\|R\|/g, '|Р|')
    .replace(/\|M\|/g, '|М|')
    .replace(/([:.])g(?=\s*<)/g, '$1')
    .replace(/\b1d4 x 10\b/g, '1d4 × 10');
  return localized
    .replace(/Боец/g, 'Воин')
    .replace(/бойца/g, 'воина')
    .replace(/бойцом/g, 'воином')
    .replace(/Разбойник/g, 'Плут')
    .replace(/разбойника/g, 'плута')
    .replace(/Рейнджер/g, 'Следопыт')
    .replace(/рейнджера/g, 'следопыта')
    .replace(/Чернокнижник/g, 'Колдун')
    .replace(/чернокнижника/g, 'колдуна')
    .replace(/Священник/g, 'Жрец')
    .replace(/священника/g, 'жреца')
    .replace(/функцией/gi, 'способностью')
    .replace(/функцию/gi, 'способность')
    .replace(/функции/gi, 'способности')
    .replace(/функция/gi, 'способность')
    .replace(/очки жизни/gi, 'хиты')
    .replace(/очков жизни/gi, 'хитов')
    .replace(/длительный отдых/gi, 'длинный отдых')
    .replace(/Выведен из строя/g, 'Недееспособный');
}

async function loadLocalization() {
  const localization = JSON.parse(await readFile(LOCALIZATION_PATH, 'utf8'));
  if (localization.schemaVersion !== LOCALIZATION_SCHEMA_VERSION || localization.locale !== 'ru' || localization.revision !== LOCALIZATION_REVISION) {
    throw new Error('Russian localization schema/revision mismatch');
  }
  return localization;
}

function localizeSpell(row, localization) {
  const translated = localization.spells?.[row.id];
  if (!translated) throw new Error(`Russian spell localization is missing: ${row.id}`);
  const originalName = row.n;
  for (const field of ['n', 'c', 't', 'r', 'cm', 'd', 'x', 'hi']) {
    if (translated[field] != null) row[field] = canonicalRussian(translated[field]);
  }
  if (/^Self\b/i.test(row.open5e.rangeUnit) || row.r === 'Я') row.r = 'На себя';
  row.cm = row.cm.replace(/\bV\b/g, 'В').replace(/\bS\b/g, 'С').replace(/\bM\b/g, 'М');
  row.n = SPELL_NAME_OVERRIDES_RU[originalName] || row.n;
  row.open5e.originalName = originalName;
  return row;
}

function localizeAbility(row, localization) {
  const translated = localization.abilities?.[row.id];
  if (!translated) throw new Error(`Russian ability localization is missing: ${row.id}`);
  const originalName = row.n;
  row.n = ABILITY_NAME_OVERRIDES_RU[originalName] || canonicalRussian(translated.n);
  row.x = canonicalRussian(translated.x);
  const ownerName = canonicalRussian(String(translated.source || '').split(/\s+·\s+/)[0]);
  row.source = row.open5e.kind === 'feat'
    ? row.catalogSource.documentName
    : `${ownerName} · ${row.catalogSource.documentName}`;
  row.open5e.originalName = originalName;
  row.open5e.ownerNameRu = row.open5e.kind === 'feat' ? '' : ownerName;
  return row;
}

function rulesetRef(document) {
  return {id: document.gamesystem?.key === '5e-2024' ? 'dnd5e-2024-reference' : 'dnd5e-2014-local', version: '1'};
}

function componentLabel(spell) {
  const parts = [];
  if (spell.verbal) parts.push('V');
  if (spell.somatic) parts.push('S');
  if (spell.material) parts.push(`M${spell.material_specified ? ` (${cleanText(spell.material_specified)})` : ''}`);
  return parts.join(', ') || '—';
}

function simpleDamagePolicy(spell) {
  const reviewed = REVIEWED_SIMPLE_DAMAGE_SPELLS.get(spell.key);
  if (!reviewed) return null;
  const damageRoll = cleanText(spell.damage_roll);
  const dice = /^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/i.exec(damageRoll);
  const description = cleanText(spell.desc);
  const damageTypes = unique(spell.damage_types || []);
  const saveKey = SAVE_KEYS[String(spell.saving_throw_ability || '').toLowerCase()] || '';
  const hasAttack = !!reviewed.attackMode || spell.attack_roll === true;
  const hasSave = !!saveKey;
  const castingOptions = Array.isArray(spell.casting_options) ? spell.casting_options : [];
  const hasUnsupportedVariant = castingOptions.some(option => SIGNIFICANT_CASTING_OPTION_FIELDS.filter(field => field !== 'damage_roll').some(field => option?.[field] != null));
  const diceMentions = [...description.matchAll(/\b(\d+)d(\d+)\b/gi)];
  const complex = /\b(additional|again|end of|start of|until|condition|prone|restrained|pushed|pulled|ignite|object|every turn|each turn|subsequent|next turn|temporary hit points?|healing|hit point maximum|more than one|each creature|reaction)\b/i.test(description);
  if (!dice || damageTypes.length !== 1 || !DAMAGE_NAMES[damageTypes[0]] || spell.target_type !== 'creature' || Number(spell.target_count) !== 1) return null;
  if (cleanText(spell.duration).toLowerCase() !== 'instantaneous' || spell.shape_type || hasUnsupportedVariant || hasAttack === hasSave || complex) return null;
  if (diceMentions.length !== 1 || diceMentions[0][1] !== dice[1] || diceMentions[0][2] !== dice[2]) return null;
  const higherLevel = cleanText(spell.higher_level);
  const upcast = higherLevel ? /damage increases by (\d+)d(\d+) for each (?:spell )?slot level above \d+/i.exec(higherLevel) : null;
  if (higherLevel && (!upcast || Number(upcast[2]) !== Number(dice[2]))) return null;
  if (castingOptions.some(option => {
    if (option?.damage_roll == null) return false;
    const slot = /^slot_level_(\d+)$/.exec(String(option.type || ''));
    if (!slot || !upcast) return true;
    const expectedCount = Number(dice[1]) + (Number(slot[1]) - Number(spell.level)) * Number(upcast[1]);
    return cleanText(option.damage_roll).toLowerCase() !== `${expectedCount}d${dice[2]}`.toLowerCase();
  })) return null;
  if (hasAttack) {
    const ranged = reviewed.attackMode === 'ranged' || /make a ranged spell attack/i.test(description);
    const melee = reviewed.attackMode === 'melee' || /make a melee spell attack/i.test(description);
    if (ranged === melee || !/on a hit[^.]*takes?[^.]*damage/i.test(description) || /on a miss|half as much/i.test(description)) return null;
    return {mode: 'structured', handler: 'single-target-damage', attackMode: ranged ? 'ranged' : 'melee', saveKey: '', saveHalf: false,
      damage: {cnt: Number(dice[1]), sides: Number(dice[2]), mod: Number(dice[3] || 0), type: DAMAGE_NAMES[damageTypes[0]], upcastPerSlot: upcast ? Number(upcast[1]) : 0}};
  }
  const half = /half (?:as much )?damage on a successful save|half as much damage on a successful one/i.test(description);
  const zero = /takes? no damage on a successful save|no damage on a successful one/i.test(description);
  if (!/saving throw/i.test(description) || half === zero) return null;
  return {mode: 'structured', handler: 'single-target-damage', attackMode: '', saveKey, saveHalf: half,
    damage: {cnt: Number(dice[1]), sides: Number(dice[2]), mod: Number(dice[3] || 0), type: DAMAGE_NAMES[damageTypes[0]], upcastPerSlot: upcast ? Number(upcast[1]) : 0}};
}

function normalizeSpell(spell) {
  const document = spell.document;
  const schoolKey = spell.school?.key || '';
  const enginePolicy = simpleDamagePolicy(spell) || {
    mode: 'manual-fail-closed',
    handler: '',
    reason: 'Правило требует явного структурированного обработчика; движок не извлекает последствия из неоднозначного текста.',
  };
  return {
    id: `sp_open5e_${stableId(document.key)}_${stableId(spell.key)}`,
    n: cleanText(spell.name),
    l: Number(spell.level),
    s: SCHOOL_NAMES[schoolKey] || cleanText(spell.school?.name),
    c: (spell.classes || []).map(row => row.name).filter(Boolean).join(', '),
    t: [cleanText(spell.casting_time), cleanText(spell.reaction_condition)].filter(Boolean).join(' — '),
    r: cleanText(spell.range_text),
    cm: componentLabel(spell),
    d: cleanText(spell.duration),
    ritual: spell.ritual === true,
    conc: spell.concentration === true,
    custom: false,
    rulesetRef: rulesetRef(document),
    tags: unique(['dnd5e', 'open5e', document.gamesystem?.key, schoolKey, Number(spell.level) === 0 ? 'cantrip' : '', spell.ritual ? 'ritual' : '', spell.concentration ? 'concentration' : '', spell.damage_roll ? 'damage' : '']),
    saveTags: [],
    x: cleanText(spell.desc),
    hi: cleanText(spell.higher_level),
    catalogSource: documentSource(document, 'spells', spell.key),
    enginePolicy,
    open5e: {
      key: spell.key,
      targetType: spell.target_type || '',
      targetCount: spell.target_count == null ? null : Number(spell.target_count),
      range: spell.range == null ? null : Number(spell.range),
      rangeUnit: spell.range_unit || '',
      attackRoll: spell.attack_roll === true,
      savingThrowAbility: spell.saving_throw_ability || '',
      damageRoll: spell.damage_roll || '',
      damageTypes: unique(spell.damage_types || []),
      materialSpecified: cleanText(spell.material_specified),
      materialCost: spell.material_cost == null ? null : Number(spell.material_cost),
      materialConsumed: spell.material_consumed === true,
      shapeType: spell.shape_type || '',
      shapeSize: spell.shape_size == null ? null : Number(spell.shape_size),
    },
  };
}

function manualAbilityPolicy() {
  return {
    mode: 'manual-fail-closed',
    handler: '',
    reason: 'Способность доступна для поиска и выдачи, но не меняет мир без явного обработчика движка.',
  };
}

function normalizeClassFeature(owner, feature) {
  const document = owner.document;
  return {
    id: `ab_open5e_${stableId(document.key)}_class_${stableId(feature.key || `${owner.key}_${feature.name}_${sha256(feature.desc).slice(0, 10)}`)}`,
    n: cleanText(feature.name),
    type: 'class',
    source: `${cleanText(owner.name)} · ${cleanText(document.display_name || document.name)}`,
    custom: false,
    rulesetRef: rulesetRef(document),
    tags: unique(['dnd5e', 'open5e', document.gamesystem?.key, 'class', 'manual']),
    uses: null,
    rest: '',
    mode: 'manual',
    x: cleanText(feature.desc),
    catalogSource: documentSource(document, 'classes', owner.key),
    enginePolicy: manualAbilityPolicy(),
    open5e: {key: feature.key || '', ownerKey: owner.key, ownerName: owner.name, kind: 'class-feature', featureType: feature.feature_type,
      gainedAt: (feature.gained_at || []).map(row => ({level: Number(row.level), detail: cleanText(row.detail)})).sort((a, b) => a.level - b.level)},
  };
}

function normalizeSpeciesTrait(owner, trait) {
  const document = owner.document;
  const traitKey = `${owner.key}_${trait.name}_${sha256(cleanText(trait.desc)).slice(0, 10)}`;
  return {
    id: `ab_open5e_${stableId(document.key)}_racial_${stableId(traitKey)}`,
    n: cleanText(trait.name),
    type: 'racial',
    source: `${cleanText(owner.name)} · ${cleanText(document.display_name || document.name)}`,
    custom: false,
    rulesetRef: rulesetRef(document),
    tags: unique(['dnd5e', 'open5e', document.gamesystem?.key, 'racial', 'manual']),
    uses: null,
    rest: '',
    mode: 'manual',
    x: cleanText(trait.desc),
    catalogSource: documentSource(document, 'species', owner.key),
    enginePolicy: manualAbilityPolicy(),
    open5e: {key: traitKey, ownerKey: owner.key, ownerName: owner.name, kind: 'species-trait', traitType: trait.type || ''},
  };
}

function normalizeFeat(feat) {
  const document = feat.document;
  const benefitText = (feat.benefits || []).map(row => cleanText(row.desc)).filter(Boolean).map(text => `• ${text}`).join('\n');
  return {
    id: `ab_open5e_${stableId(document.key)}_feat_${stableId(feat.key)}`,
    n: cleanText(feat.name),
    type: 'feat',
    source: cleanText(document.display_name || document.name),
    custom: false,
    rulesetRef: rulesetRef(document),
    tags: unique(['dnd5e', 'open5e', document.gamesystem?.key, 'feat', 'manual']),
    uses: null,
    rest: '',
    mode: 'manual',
    x: [cleanText(feat.desc), benefitText, feat.prerequisite ? `Prerequisite: ${cleanText(feat.prerequisite)}` : ''].filter(Boolean).join('\n\n'),
    catalogSource: documentSource(document, 'feats', feat.key),
    enginePolicy: manualAbilityPolicy(),
    open5e: {key: feat.key, ownerKey: '', ownerName: '', kind: 'feat', featType: feat.type || '', prerequisite: cleanText(feat.prerequisite), hasPrerequisite: feat.has_prerequisite === true},
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {headers: {'user-agent': 'dnd-world-catalog-builder/1'}});
  if (!response.ok) throw new Error(`Open5e request failed (${response.status}): ${url}`);
  return response.json();
}

async function fetchAll(endpoint, documentKey) {
  let url = `${API_ROOT}/${endpoint}/?document__key=${encodeURIComponent(documentKey)}&limit=100`;
  const rows = [];
  while (url) {
    const page = await fetchJson(url);
    if (!Array.isArray(page.results)) throw new Error(`Open5e ${endpoint} response has no results array`);
    rows.push(...page.results);
    url = page.next;
  }
  const foreign = rows.find(row => row.document?.key !== documentKey);
  if (foreign) throw new Error(`Open5e filter leaked ${foreign.document?.key} into ${documentKey}/${endpoint}`);
  return rows;
}

function compareRecord(a, b) {
  return a.id.localeCompare(b.id, 'en');
}

function assertCount(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function validateCatalog(catalog, localization) {
  if (catalog.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unexpected catalog schema: ${catalog.schemaVersion}`);
  if (catalog.localization?.locale !== 'ru' || catalog.localization?.revision !== LOCALIZATION_REVISION) throw new Error('Catalog is not pinned to the Russian localization');
  if (!Array.isArray(catalog.spells) || catalog.spells.length !== 837) throw new Error(`Expected 837 retained imported spells, received ${catalog.spells?.length}`);
  if (!Array.isArray(catalog.abilities) || catalog.abilities.length !== 616) throw new Error(`Expected 616 imported abilities, received ${catalog.abilities?.length}`);
  for (const [kind, rows] of [['spell', catalog.spells], ['ability', catalog.abilities]]) {
    const ids = new Set();
    rows.forEach((row, index) => {
      if (!row?.id || !row.n || !row.x || !row.catalogSource?.documentKey || row.catalogSource.license !== 'CC-BY-4.0') {
        const missing = ['id', 'n', 'x'].filter(field => !row?.[field]).concat(!row?.catalogSource?.documentKey ? ['catalogSource.documentKey'] : [], row?.catalogSource?.license !== 'CC-BY-4.0' ? ['catalogSource.license'] : []);
        throw new Error(`${kind}[${index}] ${row?.id || row?.n || 'unknown'} is incomplete: ${missing.join(', ')}`);
      }
      if (!row.enginePolicy || !['structured', 'manual-fail-closed'].includes(row.enginePolicy.mode)) throw new Error(`${kind}[${index}] has no engine policy`);
      if (row.catalogSource.language !== 'ru' || row.catalogSource.sourceLanguage !== 'en' || row.catalogSource.localizationRevision !== LOCALIZATION_REVISION) throw new Error(`${kind}[${index}] has no Russian display-language contract`);
      if (!/[А-ЯЁа-яё]/.test(row.n) || !/[А-ЯЁа-яё]/.test(row.x)) throw new Error(`${kind}[${index}] is not localized into Russian`);
      const cyrillic = (row.x.match(/[А-ЯЁа-яё]/g) || []).length;
      const latin = (row.x.match(/[A-Za-z]/g) || []).length;
      if (latin > 40 && latin > cyrillic * 0.35) throw new Error(`${kind}[${index}] still contains predominantly English prose`);
      if (ids.has(row.id)) throw new Error(`Duplicate ${kind} id: ${row.id}`);
      ids.add(row.id);
    });
  }
  if (new Set(catalog.spells.map(row => row.n.toLocaleLowerCase('ru'))).size < 500) throw new Error('Imported spell catalog has fewer than 500 distinct Russian names');
  if (!catalog.spells.some(row => row.enginePolicy.mode === 'structured')) throw new Error('No imported spell has a reviewed structured engine handler');
  if (localization) {
    if (Object.keys(localization.spells || {}).length !== catalog.spells.length || Object.keys(localization.abilities || {}).length !== catalog.abilities.length) throw new Error('Russian localization census mismatch');
    for (const [kind, rows] of [['spells', catalog.spells], ['abilities', catalog.abilities]]) {
      const catalogIds = new Set(rows.map(row => row.id));
      const unknown = Object.keys(localization[kind] || {}).find(id => !catalogIds.has(id));
      if (unknown) throw new Error(`Russian localization contains an unknown ${kind} id: ${unknown}`);
    }
  }
  return catalog;
}

async function buildCatalog() {
  const localization = await loadLocalization();
  const documentKeys = unique([...Object.keys(SOURCE_PLAN.spells), ...Object.keys(SOURCE_PLAN.abilities)]);
  const documents = Object.fromEntries(await Promise.all(documentKeys.map(async key => [key, await fetchJson(`${API_ROOT}/documents/${encodeURIComponent(key)}/`)])));
  for (const [key, document] of Object.entries(documents)) {
    if (!(document.licenses || []).some(license => license.key === 'cc-by-40')) throw new Error(`${key} is not licensed under CC-BY-4.0`);
  }

  const spellGroups = await Promise.all(Object.entries(SOURCE_PLAN.spells).map(async ([documentKey, expected]) => {
    const rows = await fetchAll('spells', documentKey);
    assertCount(`${documentKey} spells`, rows.length, expected);
    return rows;
  }));

  const abilityGroups = await Promise.all(Object.entries(SOURCE_PLAN.abilities).map(async ([documentKey, expected]) => {
    const [classes, species, feats] = await Promise.all(['classes', 'species', 'feats'].map(endpoint => fetchAll(endpoint, documentKey)));
    const classFeatures = classes.flatMap(owner => (owner.features || []).filter(feature => feature.feature_type === 'CLASS_LEVEL_FEATURE').map(feature => normalizeClassFeature(owner, feature)));
    const speciesTraits = species.flatMap(owner => (owner.traits || []).map(trait => normalizeSpeciesTrait(owner, trait)));
    const featRows = feats.map(normalizeFeat);
    assertCount(`${documentKey} class features`, classFeatures.length, expected.classFeatures);
    assertCount(`${documentKey} species traits`, speciesTraits.length, expected.speciesTraits);
    assertCount(`${documentKey} feats`, featRows.length, expected.feats);
    assertCount(`${documentKey} ability total`, classFeatures.length + speciesTraits.length + featRows.length, expected.total);
    return [...classFeatures, ...speciesTraits, ...featRows];
  }));

  const normalizedSpells = spellGroups.flat().map(normalizeSpell);
  const excludedSpells = normalizedSpells.filter(row => !row.n || !row.x).map(row => ({
    kind: 'spell',
    id: row.id,
    sourceKey: row.open5e?.key || '',
    documentKey: row.catalogSource?.documentKey || '',
    reason: !row.n ? 'missing-name' : 'missing-description',
  }));
  const catalog = validateCatalog({
    schemaVersion: SCHEMA_VERSION,
    provider: 'Open5e API v2',
    license: 'CC-BY-4.0',
    localization: {locale: 'ru', sourceLanguage: 'en', revision: LOCALIZATION_REVISION},
    sourcePlan: SOURCE_PLAN,
    spells: normalizedSpells.filter(row => row.n && row.x).map(row => localizeSpell(row, localization)).sort(compareRecord),
    abilities: abilityGroups.flat().map(row => localizeAbility(row, localization)).sort(compareRecord),
    exclusions: excludedSpells.sort((a, b) => a.id.localeCompare(b.id, 'en')),
  }, localization);
  return {catalog, documents, localization};
}

function noticeText(documents) {
  const rows = Object.values(documents).sort((a, b) => a.key.localeCompare(b.key, 'en')).map(document =>
    `- **${document.name}** (${document.key}) — ${document.author || document.publisher?.name || 'Unknown author'}; publisher: ${document.publisher?.name || '—'}; source: ${document.permalink}; license: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).`,
  );
  return `# Third-party D&D 5e catalog notices\n\nThe generated catalog in this directory contains only source documents that Open5e marks as Creative Commons Attribution 4.0. The project preserves each record's document key, publisher, game-system key, permalink, and Open5e API resource URL.\n\nThe Russian display text is a project-maintained translation and terminology adaptation of the English source records. Stable source keys, original names, rules metadata, and attribution links are preserved alongside the translation.\n\n${rows.join('\n')}\n\nOpen5e API documentation: https://open5e.com/api-docs\n\nNo closed-book spell, feat, class-feature, or species-trait text is included by this generator.\n`;
}

async function writeArtifacts() {
  const {catalog, documents, localization} = await buildCatalog();
  await mkdir(OUTPUT_DIR, {recursive: true});
  const catalogText = `globalThis.${GLOBAL_NAME}=Object.freeze(${JSON.stringify(catalog)});\n`;
  const notice = noticeText(documents);
  const localizationText = await readFile(LOCALIZATION_PATH, 'utf8');
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    catalogGlobal: GLOBAL_NAME,
    provider: {name: 'Open5e API v2', apiRoot: API_ROOT, documentation: 'https://open5e.com/api-docs'},
    localization: {schemaVersion: localization.schemaVersion, locale: localization.locale, sourceLanguage: localization.sourceLanguage, revision: localization.revision},
    licensePolicy: {required: 'CC-BY-4.0', closedBookTextAllowed: false},
    documents: Object.values(documents).sort((a, b) => a.key.localeCompare(b.key, 'en')).map(document => ({
      key: document.key,
      name: document.name,
      author: document.author || '',
      publisher: document.publisher?.name || '',
      gamesystem: document.gamesystem?.key || '',
      permalink: document.permalink || '',
      licenses: (document.licenses || []).map(license => ({key: license.key, name: license.name})),
    })),
    counts: {
      sourceSpellRecords: Object.values(SOURCE_PLAN.spells).reduce((sum, count) => sum + count, 0),
      excludedSpells: catalog.exclusions.length,
      importedSpells: catalog.spells.length,
      distinctImportedSpellNames: new Set(catalog.spells.map(row => row.n.toLocaleLowerCase('ru'))).size,
      structuredImportedSpells: catalog.spells.filter(row => row.enginePolicy.mode === 'structured').length,
      manualFailClosedImportedSpells: catalog.spells.filter(row => row.enginePolicy.mode === 'manual-fail-closed').length,
      importedAbilities: catalog.abilities.length,
      classFeatures: catalog.abilities.filter(row => row.type === 'class').length,
      speciesTraits: catalog.abilities.filter(row => row.type === 'racial').length,
      feats: catalog.abilities.filter(row => row.type === 'feat').length,
      manualFailClosedImportedAbilities: catalog.abilities.filter(row => row.enginePolicy.mode === 'manual-fail-closed').length,
    },
    expectedSourceCounts: SOURCE_PLAN,
    artifacts: {
      'catalog.js': {bytes: Buffer.byteLength(catalogText), sha256: sha256(catalogText)},
      'localization.ru.json': {bytes: Buffer.byteLength(localizationText), sha256: sha256(localizationText)},
      'NOTICE.md': {bytes: Buffer.byteLength(notice), sha256: sha256(notice)},
    },
  };
  await Promise.all([
    writeFile(CATALOG_PATH, catalogText, 'utf8'),
    writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    writeFile(NOTICE_PATH, notice, 'utf8'),
  ]);
  return manifest;
}

function parseCatalogScript(text) {
  const prefix = `globalThis.${GLOBAL_NAME}=Object.freeze(`;
  if (!text.startsWith(prefix) || !text.endsWith(');\n')) throw new Error('catalog.js wrapper is not canonical');
  return JSON.parse(text.slice(prefix.length, -3));
}

async function checkArtifacts() {
  const [catalogText, manifestText, notice, localizationText] = await Promise.all([
    readFile(CATALOG_PATH, 'utf8'),
    readFile(MANIFEST_PATH, 'utf8'),
    readFile(NOTICE_PATH, 'utf8'),
    readFile(LOCALIZATION_PATH, 'utf8'),
  ]);
  const localization = JSON.parse(localizationText);
  const catalog = validateCatalog(parseCatalogScript(catalogText), localization);
  const manifest = JSON.parse(manifestText);
  if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.catalogGlobal !== GLOBAL_NAME) throw new Error('manifest schema/global mismatch');
  if (manifest.localization?.revision !== LOCALIZATION_REVISION || manifest.localization?.locale !== 'ru') throw new Error('manifest localization mismatch');
  for (const [name, text] of [['catalog.js', catalogText], ['localization.ru.json', localizationText], ['NOTICE.md', notice]]) {
    const expected = manifest.artifacts?.[name];
    if (!expected || expected.bytes !== Buffer.byteLength(text) || expected.sha256 !== sha256(text)) throw new Error(`${name} integrity mismatch`);
  }
  const actual = {
    sourceSpellRecords: Object.values(SOURCE_PLAN.spells).reduce((sum, count) => sum + count, 0),
    excludedSpells: catalog.exclusions.length,
    importedSpells: catalog.spells.length,
    distinctImportedSpellNames: new Set(catalog.spells.map(row => row.n.toLocaleLowerCase('ru'))).size,
    structuredImportedSpells: catalog.spells.filter(row => row.enginePolicy.mode === 'structured').length,
    manualFailClosedImportedSpells: catalog.spells.filter(row => row.enginePolicy.mode === 'manual-fail-closed').length,
    importedAbilities: catalog.abilities.length,
    classFeatures: catalog.abilities.filter(row => row.type === 'class').length,
    speciesTraits: catalog.abilities.filter(row => row.type === 'racial').length,
    feats: catalog.abilities.filter(row => row.type === 'feat').length,
    manualFailClosedImportedAbilities: catalog.abilities.filter(row => row.enginePolicy.mode === 'manual-fail-closed').length,
  };
  if (JSON.stringify(actual) !== JSON.stringify(manifest.counts)) throw new Error('manifest counts do not match catalog.js');
  return manifest;
}

async function main() {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode)) throw new Error('Usage: node scripts/build-dnd5e-open-catalog.mjs --write|--check');
  const manifest = mode === '--write' ? await writeArtifacts() : await checkArtifacts();
  console.log(`${mode === '--write' ? 'Wrote' : 'Verified'} D&D 5e open catalog: ${manifest.counts.importedSpells} spells, ${manifest.counts.importedAbilities} abilities (${manifest.counts.structuredImportedSpells} structured spell handlers).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

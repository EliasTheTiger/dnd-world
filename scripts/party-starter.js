(function (root) {
'use strict';
// Deterministic, one-time equipment grants. No storage, rolls, or live mutations.
const VERSION = 1;
const HERO_ID = 'char_liora';
const EXISTING_IDS = ['char_roku', 'char_torgar', 'char_septih', 'char_legerem'];
const SOURCE = 'D&D 5e 2014 · стартовое снаряжение класса и предыстории';
const RULES_URL = 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014/equipment';
const clone = value => JSON.parse(JSON.stringify(value));
const text = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е');
const slug = value => text(value).replace(/[^a-zа-я0-9]+/g, '_').replace(/^_|_$/g, '');
const ordinary = (key, n, cost, weight, tags, desc, more) => ({
  id: 'it_starter_' + key, n, type: 'equipment', rarity: 'обычный', custom: false,
  tags, slot: null, cost, weight, dmg: '', dmgType: '', desc, props: '',
  rules: {edition: '5e-2014', sourceType: '5e-2014-adaptation', source: RULES_URL}, ...more
});
const EXTRA_ITEMS = [
  ordinary('mess_kit', 'Столовый набор', '2 см', '1 фунт', ['camp', 'tool'], 'Походная посуда: чашка, миска и столовые приборы. Не создаёт еду и не восстанавливает хиты.'),
  ordinary('sand_pouch', 'Мешочек мелкого песка', '—', '0,1 фунта', ['writing'], 'Песок для просушки чернил из набора учёного. Не является мешочком с магическими компонентами.'),
  ordinary('small_knife', 'Нож для письма', '—', '0,1 фунта', ['writing', 'tool'], 'Небольшой хозяйственный нож из набора учёного: заострять перо и разрезать листы. Это не дополнительный боевой кинжал.'),
  ordinary('string', 'Бечёвка (3 м)', '—', '0,1 фунта', ['tool'], 'Тонкая бечёвка из набора взломщика. Не заменяет верёвку для лазания.'),
  ordinary('blanket', 'Одеяло', '5 см', '3 фунта', ['camp'], 'Простое дорожное одеяло.'),
  ordinary('alms_box', 'Ящик для пожертвований', '—', '1 фунт', ['container', 'holy'], 'Небольшой пустой ящик из набора священника. Денег внутри нет.'),
  ordinary('vestments', 'Облачение священника', '—', '4 фунта', ['holy'], 'Обрядовая одежда из набора священника. Не является доспехом и не даёт бонуса к КД.'),
  ordinary('common_clothes', 'Обычная одежда', '5 см', '3 фунта', [], 'Комплект повседневной одежды. Не является доспехом.'),
  ordinary('dark_clothes', 'Тёмная одежда с капюшоном', '5 см', '3 фунта', [], 'Комплект одежды предыстории «Преступник». Не даёт автоматического преимущества на Скрытность.'),
  ordinary('fine_clothes', 'Дорогая одежда', '15 зм', '6 фунтов', [], 'Комплект одежды предыстории «Благородный». Не даёт бонуса к КД.'),
  ordinary('traveler_clothes', 'Дорожная одежда', '2 зм', '4 фунта', [], 'Практичный комплект для путешествий. Выдан предысторией, не является доспехом.'),
  ordinary('prayer_book', 'Молитвенник', '—', '1 фунт', ['book', 'holy'], 'Книга молитв предыстории «Аколит». Не является книгой заклинаний и не даёт новых заклинаний.'),
  ordinary('pedigree', 'Документ о происхождении', '—', '0', ['lore'], 'Документ предыстории «Благородный». Содержание и подтверждение титула определяются в игре.'),
  ordinary('guild_letter', 'Рекомендательное письмо гильдии', '—', '0', ['lore'], 'Письмо, подтверждающее обучение ремеслу и принадлежность к гильдии. Не гарантирует согласие любого NPC.'),
  ordinary('signet_ring', 'Кольцо-печатка', '5 зм', '0', ['jewelry'], 'Обычная печатка предыстории «Благородный». Магических свойств нет.', {slot: 'RING_L'}),
  ordinary('empty_flask', 'Пустая фляга', '2 мм', '1 фунт', ['container'], 'Пустая закрывающаяся фляга вместимостью 1 пинта (около 0,47 л). Подходит для экспериментального эликсира; сама не содержит напитка или зелья.', {starterKey: 'emptyFlask'}),
  ordinary('identify_pearl', 'Жемчужина (100 зм)', '100 зм', '0', ['material', 'gem', 'spellcomponent'], 'Немагическая жемчужина стоимостью 100 золотых для материального компонента «Опознания». Приобретается отдельно; заклинание не расходует жемчужину.', {material: {component: {matchTokens: ['жемчуж', 'pearl'], valueMode: 'fixed', valueGp: 100, form: 'gem'}}})
];
// Prefer established project IDs; names/profile fields also recognise old and BG3 equivalents.
const DEFINITIONS = {
  backpack: ['it_рюкзак', /рюкзак|backpack/], bedroll: ['it_спальник', /спальник|постельн|bedroll/],
  rope: ['it_веревка_пеньковая_15_м', /веревк|rope/], torch: ['it_факел', /факел|torch/],
  tinderbox: ['it_tinderbox_t', /трутниц|огниво|кремень.*кресало|flint|tinderbox/],
  rations: ['it_рацион_1_день', /рацион|rations/], waterskin: ['it_бурдюк', /бурдюк|waterskin/],
  crowbar: ['it_ломик', /ломик|crowbar/], hammer: ['it_молоток', /^молоток$|^hammer$/],
  piton: ['it_питон_шип', /питон|скальный.*крюк|piton/], candle: ['it_свеча', /свеч|candle/],
  hoodedLantern: ['it_закрытый_фонарь', /закрытый фонарь|hooded lantern/], oil: ['it_масло_фляга', /^масло|^oil/],
  bearings: ['it_ball_bearings_s', /шарик|ball bearings/], bell: ['it_колокольчик', /колокольчик|^bell$/],
  loreBook: ['it_history_book', /книга по истории|^книга$|book of lore|^book$/], ink: ['it_ink', /чернил|^ink/],
  pen: ['it_перо_писчее', /перо писчее|писчее перо|ink pen/], parchment: ['it_пергамент_лист', /пергамент|parchment/],
  spellbook: ['it_книга_заклинаний', /книга заклинаний|spellbook/],
  componentPouch: ['it_reagent_bag', /сумка с реагентами|мешочек с компонентами|component pouch/],
  holySymbol: ['it_священный_символ_эмблема', /священный символ|святой щит|символ служителя|holy symbol/],
  incense: ['it_incense_t', /благовони|incense/], censer: ['it_censer_gory', /кадильниц|censer/],
  pouch: ['it_мешочек', /^мешочек$|кошел[еь]к|^pouch$/], thievesTools: ['it_воровские_инструменты', /воровские инструменты|thieves.? tools/],
  alchemistTools: ['it_tool_alchemist', /инструменты алхимика|набор алхимика|alchemist.?s? supplies/],
  arrows: ['it_стрелы_20', /^стрелы|^arrows/], bolts: ['it_арбалетные_болты_20', /арбалетные болты|crossbow bolts/],
  dagger: ['it_кинжал', /кинжал|кривой нож|dagger/], quarterstaff: ['it_боевой_посох', /посох|quarterstaff/],
  shortbow: ['it_короткий_лук', /короткий лук|shortbow/], lightCrossbow: ['it_легкий_арбалет', /легкий арбалет|light crossbow/],
  shortsword: ['it_короткий_меч', /короткий меч|shortsword/], mace: ['it_булава', /^булава$|^mace$/],
  longsword: ['it_длинный_меч', /длинный меч|longsword/],
  leather: ['it_кожаный_arm', /кожаный доспех|^кожаный$|^leather( armor)?$/],
  studded: ['it_проклепанная_кожа_arm', /проклепанная кожа|studded leather/],
  chainMail: ['it_кольчуга_arm', /кольчуга|chain mail/], shield: ['it_щит_arm', /щит|shield/]
};
for (const row of EXTRA_ITEMS) {
  const key = row.starterKey || row.id.slice('it_starter_'.length).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  DEFINITIONS[key] = [row.id, new RegExp('^' + text(row.n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')];
}
const ALIASES = {
  it_flint_steel: ['tinderbox'], it_waterskin_leg: ['waterskin'], it_staff_def: ['quarterstaff'],
  it_holy_shield_life: ['shield', 'holySymbol'], it_korlinn_seal: ['signetRing'], it_korlinn_scroll: ['pedigree'],
  it_thieves_tools_s: ['thievesTools'], it_shortbow_s: ['shortbow'], it_shortsword_s: ['shortsword'],
  it_chainmail_torgar: ['bodyArmor'], it_chain_shirt_leg: ['bodyArmor'], it_censer_gory: ['censer'],
  it_crooked_knife: ['dagger'], it_ink: ['ink'], it_reagent_bag: ['componentPouch']
};
const req = (key, qty = 1, more = {}) => ({key, qty, ...more});
const PACKS = {
  scholar: [req('backpack'), req('loreBook'), req('ink'), req('pen'), req('parchment', 10), req('sandPouch'), req('smallKnife')],
  explorer: [req('backpack'), req('bedroll'), req('messKit'), req('tinderbox'), req('torch', 10), req('rations', 10), req('waterskin'), req('rope')],
  dungeoneer: [req('backpack'), req('crowbar'), req('hammer'), req('piton', 10), req('torch', 10), req('tinderbox'), req('rations', 10), req('waterskin'), req('rope')],
  burglar: [req('backpack'), req('bearings'), req('string'), req('bell'), req('candle', 5), req('crowbar'), req('hammer'), req('piton', 10), req('hoodedLantern'), req('oil', 2), req('rations', 5), req('tinderbox'), req('waterskin'), req('rope')],
  priest: [req('backpack'), req('blanket'), req('candle', 10), req('tinderbox'), req('almsBox'), req('incense', 2), req('censer'), req('vestments'), req('rations', 2), req('waterskin')]
};
const BACKGROUNDS = {
  'Аколит': [req('holySymbol'), req('prayerBook'), req('incense', 5), req('vestments'), req('commonClothes'), req('pouch')],
  'Преступник': [req('crowbar'), req('darkClothes'), req('pouch')],
  'Благородный': [req('fineClothes'), req('signetRing'), req('pedigree'), req('pouch')],
  'Гильдейский ремесленник': [req('alchemistTools'), req('guildLetter'), req('travelerClothes'), req('pouch')]
};
function classRequirements(character) {
  switch (character.cls) {
    case 'Волшебник': return [req('quarterstaff', 1, {equivalent: 'meleeWeapon', slot: 'MAIN_HAND'}), req('componentPouch', 1, {equivalent: 'arcaneFocus'}), req('spellbook'), ...PACKS.scholar];
    case 'Жрец': return [req('mace', 1, {equivalent: 'meleeWeapon', slot: 'MAIN_HAND'}), req('chainMail', 1, {equivalent: 'bodyArmor', slot: 'CHEST'}), req('lightCrossbow', 1, {equivalent: 'rangedWeapon'}), req('bolts', 1, {ammoCur: 20, onlyWith: 'lightCrossbow'}), req('shield', 1, {slot: 'OFF_HAND'}), req('holySymbol'), ...PACKS.priest];
    case 'Плут': return [req('shortsword', 1, {equivalent: 'meleeWeapon', slot: 'MAIN_HAND'}), req('shortbow', 1, {equivalent: 'rangedWeapon'}), req('arrows', 1, {ammoCur: 20, onlyWith: 'shortbow'}), req('leather', 1, {equivalent: 'bodyArmor', slot: 'CHEST'}), req('dagger', 2), req('thievesTools'), ...PACKS.burglar];
    case 'Воин': return [req('longsword', 1, {equivalent: 'meleeWeapon', slot: 'MAIN_HAND'}), req('shield', 1, {slot: 'OFF_HAND'}), req('chainMail', 1, {equivalent: 'bodyArmor', slot: 'CHEST'}), req('lightCrossbow', 1, {equivalent: 'rangedWeapon'}), req('bolts', 1, {ammoCur: 20, onlyWith: 'lightCrossbow'}), ...PACKS.explorer];
    case 'Изобретатель': return [req('dagger', 2, {slot: 'MAIN_HAND'}), req('lightCrossbow'), req('bolts', 1, {ammoCur: 20}), req('studded', 1, {equivalent: 'bodyArmor', slot: 'CHEST'}), req('thievesTools'), ...PACKS.dungeoneer];
    default: return null;
  }
}
function namesOf(item, entry) {
  return [item && item.n, item && item.name, item && item.originalName, item && item.englishName,
    item && item.bg3 && item.bg3.name, item && item.bg3 && item.bg3.englishName,
    item && item.open5e && item.open5e.originalName, entry && entry.itemName, entry && entry.name].map(text).filter(Boolean);
}
function matches(item, entry, key) {
  const id = String(entry && entry.itemId || item && item.id || '');
  if ((ALIASES[id] || []).includes(key)) return true;
  const definition = DEFINITIONS[key], names = namesOf(item, entry);
  if (definition && (id === definition[0] || names.some(name => definition[1].test(name)))) return true;
  const profile = item && (item.mechanics && item.mechanics.profile || item.profile) || {};
  const tags = item && item.tags || [], kind = profile.kind;
  if (key === 'bodyArmor') return !!(profile.armor && profile.armor.kind !== 'shield' || (item && item.slot === 'CHEST' && (item.type === 'armor' || tags.some(t => /^(light|medium|heavy)armor$/.test(t)))));
  if (key === 'meleeWeapon') return !!((kind === 'weapon' || item && item.type === 'weapon') && !(profile.weapon && profile.weapon.ranged) && !tags.includes('ranged'));
  if (key === 'rangedWeapon') return !!(profile.weapon && profile.weapon.ranged || tags.includes('ranged') && item && item.type === 'weapon');
  if (key === 'arcaneFocus') return matches(item, entry, 'componentPouch') || !!(profile.flags && (profile.flags.componentPouch || profile.flags.focus) && !tags.includes('holy')) || tags.includes('focus') && !tags.includes('holy');
  if (key === 'shield') return kind === 'shield' || profile.armor && profile.armor.kind === 'shield' || tags.includes('shield');
  if (key === 'thievesTools') return /воровские|thieves/i.test(String(profile.tool && profile.tool.prof || ''));
  if (key === 'alchemistTools') return /алхимик|alchemist/i.test(String(profile.tool && profile.tool.prof || ''));
  return false;
}
function catalogIndex(items) {
  return new Map((items || []).filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
}
function requirements(character) {
  const list = classRequirements(character);
  if (!list) return null;
  const background = BACKGROUNDS[character.bg] || [];
  // Two sources can grant the same kind (incense in priest pack and acolyte background).
  const merged = new Map();
  for (const row of [...list, ...background]) {
    const old = merged.get(row.key);
    if (old) old.qty += row.qty;
    else merged.set(row.key, {...row});
  }
  return [...merged.values()];
}
function hasReceipt(character) {
  return character && character.starterEquipment && character.starterEquipment.version >= VERSION;
}
function uniqueEntryId(character, key) {
  const base = 'inv_starter_' + slug(character.id) + '_' + key;
  const ids = new Set((character.inventory || []).map(row => row.id));
  let id = base, serial = 1;
  while (ids.has(id)) id = base + '_' + (++serial);
  return id;
}
function plan(character, options = {}) {
  if (!character || !Array.isArray(character.inventory) || !character.id) return {ok: false, reason: 'invalid-character'};
  if (hasReceipt(character)) return {ok: true, changed: false, character, grants: []};
  if (options.mode !== 'new' && !EXISTING_IDS.includes(character.id)) return {ok: true, changed: false, character, grants: []};
  const required = requirements(character);
  if (!required) return {ok: false, reason: 'unsupported-class'};
  const catalog = catalogIndex(options.items), resolve = entry => catalog.get(entry.itemId) || (typeof options.resolveItem === 'function' ? options.resolveItem(entry.itemId) : null);
  const missingIds = [...new Set(character.inventory.filter(row => row && !resolve(row)).map(row => row.itemId))];
  if (missingIds.length) return {ok: false, reason: 'unresolved-inventory', missingIds};
  const result = clone(character), grants = [], retained = [];
  const held = key => result.inventory.some(entry => matches(catalog.get(entry.itemId) || resolve(entry), entry, key));
  for (const row of required) {
    if (held(row.key) || row.equivalent && held(row.equivalent)) {
      retained.push(row.key); continue;
    }
    if (row.onlyWith && !held(row.onlyWith)) continue;
    const definition = DEFINITIONS[row.key];
    const item = catalog.get(definition[0]) || [...catalog.values()].find(candidate => matches(candidate, null, row.key) && !candidate.tags?.includes('magical'));
    if (!item) return {ok: false, reason: 'missing-starter-item', key: row.key, itemId: definition[0]};
    const entry = {id: uniqueEntryId(result, row.key), itemId: item.id, qty: row.qty, notes: SOURCE, starterGrant: {version: VERSION, key: row.key}};
    if (row.ammoCur != null) entry.ammoCur = row.ammoCur;
    result.inventory.push(entry);
    // Never change what an established hero is wearing, including a deliberate empty hand.
    if (options.mode === 'new' && row.slot) {
      result.equipment = result.equipment || {};
      const handsOccupied = ['MAIN_HAND', 'OFF_HAND'].includes(row.slot) && result.equipment.TWO_HAND;
      if (!result.equipment[row.slot] && !handsOccupied) result.equipment[row.slot] = entry.id;
    }
    grants.push({key: row.key, itemId: item.id, entryId: entry.id, qty: entry.qty});
  }
  result.starterEquipment = {version: VERSION, source: SOURCE, classAtGrant: character.cls, backgroundAtGrant: character.bg || '', grants: clone(grants), retained};
  return {ok: true, changed: true, character: result, grants};
}
function buildLiora(options = {}) {
  const base = typeof options.blank === 'function' ? options.blank() : options.blank;
  if (!base || !base.skills) throw new TypeError('buildLiora requires a blank character template');
  const c = clone(base);
  const skillNames = options.skillNames || Object.keys(base.skills);
  const trained = ['Магия', 'Расследование', 'Медицина', 'Внимательность', 'Проницательность', 'Убеждение'];
  Object.assign(c, {
    id: HERO_ID, name: 'Лиора Меднолист', player: '', race: 'Полуэльф', gender: 'женский', subrace: '',
    cls: 'Изобретатель', subcls: 'Алхимик', bg: 'Гильдейский ремесленник', align: 'Нейтрально-добрый',
    level: 3, xp: 900, ab: {str: 8, dex: 14, con: 14, int: 16, wis: 13, cha: 10},
    hp: 24, hpMax: 24, hpTemp: 0, ac: 0, acOverride: null, speed: '9 м', init: 0, initB: 0,
    hitDice: '3d8', hdUsed: 0, hpPend: false, hpProgression: {method: 'average', rolls: []},
    inspiration: false, exhaustion: 0, deaths: {s: 0, f: 0}, cond: [], diseases: [], activeFx: [],
    saves: {str: false, dex: false, con: true, int: true, wis: false, cha: false},
    skills: Object.fromEntries(skillNames.map(name => [name, {p: trained.includes(name) ? 1 : 0, m: null}])),
    inventory: [], equipment: {}, coins: {mm: 6, sm: 9, em: 0, zm: 14, pm: 0},
    spellbook: [], slots: {1: {max: 3, cur: 3}}, spellAb: 'int',
    spellLearning: {replacements: 0, anyClassChoices: 0},
    abilities: [
      {abilityId: 'ab_полуэльф_владение_двумя_навыками_на_выбор', cur: null, notes: '', characterGranted: true, buildSource: 'Полуэльф', choices: {skill: 'Медицина', skill2: 'Внимательность'}},
      {abilityId: 'ab_полуэльф_дополнительный_язык', cur: null, notes: '', characterGranted: true, buildSource: 'Полуэльф', choices: {language: 'Гномий'}}
    ], feats: [],
    langs: 'Общий, Эльфийский, Гномий, Дварфийский',
    toolProficiencies: ['Воровские инструменты', 'Инструменты жестянщика', 'Инструменты стеклодува', 'Инструменты алхимика', 'Инструменты каллиграфа'],
    buildChoices: {abilities: ['int', 'wis'], classSkills: ['Магия', 'Расследование'], raceSkills: ['Медицина', 'Внимательность'],
      backgroundSkills: [], duplicateSkills: [], tools: ['Инструменты стеклодува', 'Инструменты алхимика', 'Инструменты каллиграфа'], languages: ['Гномий', 'Дварфийский'], alchemistTool: 'Инструменты каллиграфа'},
    notes: 'Характеристики: покупка за 27 очков, до расовых прибавок 8/14/14/15/12/8. Хиты: 8 + 2, затем дважды 5 + 2. Стартовые 15 зм гильдейского ремесленника: 4 мм потрачены на две пустые фляги. Остаток — 14 зм, 9 см, 6 мм.',
    persona: {tr: 'Любую задачу сначала рассматривает как опыт: наблюдает, записывает, проверяет.', id: 'Хорошее изобретение должно помогать обычным людям.', bd: 'Берегёт записи о первых удачных составах и письмо своей гильдии.', fl: 'Иногда увлекается проверкой идеи сильнее, чем требует ситуация.', ap: 'Полуэльфийка с медными прядями, дорожной одеждой и аккуратным футляром алхимических инструментов.'}
  });
  delete c.characterBuild;
  const ids = options.spellIds || {};
  const choices = [
    ['fireBolt', false, 'known'], ['guidance', false, 'known'],
    ['cureWounds', true, 'classList'], ['faerieFire', true, 'classList'], ['grease', true, 'classList'], ['detectMagic', true, 'classList'],
    ['healingWord', true, 'subclass'], ['rayOfSickness', true, 'subclass']
  ];
  for (const [key, prep, access] of choices) {
    if (typeof ids[key] !== 'string' || !ids[key]) throw new TypeError('Missing active spell ID: ' + key);
    const entry = {spellId: ids[key], prep, access};
    if (access === 'subclass') Object.assign(entry, {alwaysPrepared: true, countsAgainstPreparation: false, granted: true, source: 'Алхимик'});
    c.spellbook.push(entry);
  }
  const equipped = plan(c, {items: options.items, mode: 'new'});
  if (!equipped.ok) throw new TypeError('Cannot equip Liora: ' + equipped.reason + ' ' + (equipped.key || ''));
  const result = equipped.character, flask = catalogIndex(options.items).get('it_starter_empty_flask');
  result.equipment.OFF_HAND = result.inventory.find(row => row.starterGrant?.key === 'alchemistTools').id;
  if (!flask) throw new TypeError('Missing empty flask catalog definition');
  result.inventory.push({id: 'inv_liora_empty_flasks', itemId: flask.id, qty: 2, full: false, notes: 'Куплены за 4 мм из стартовых 15 зм; пустые, для экспериментальных эликсиров.', starterPurchase: {quantity: 2, unitPriceCp: 2, totalPriceCp: 4}});
  result.starterEquipment.purchases = [{itemId: flask.id, qty: 2, unitPriceCp: 2, totalPriceCp: 4}];
  const crossbow = result.inventory.find(row => row.starterGrant?.key === 'lightCrossbow');
  crossbow.att = true;
  result.artificer = {infusions: {version: 1, revision: 0,
    known: ['enhanced-defense', 'enhanced-weapon', 'repeating-shot', 'returning-weapon'],
    active: [{infusionId: 'enhanced-defense', itemId: result.equipment.CHEST}, {infusionId: 'repeating-shot', itemId: crossbow.id}], restReady: false}};
  return result;
}
function classDefinition() {
  return {id: 'cls_artificer_2014', n: 'Изобретатель', hd: 8, prime: 'Интеллект', saves: ['con', 'int'],
    armor: 'Лёгкие и средние доспехи, щиты', weap: 'Простое оружие',
    skills: '2 из: Магия, История, Расследование, Медицина, Природа, Внимательность, Ловкость рук',
    subT: 'Специализация (3 уровень)',
    subs: [['Алхимик', 'Приготовление экспериментальных эликсиров, инструменты алхимика и дополнительные всегда подготовленные заклинания.']],
    lv: [[1, 'Магическое мастерство'], [1, 'Использование заклинаний'], [2, 'Инфузии'], [3, 'Специализация: Алхимик'], [3, 'Нужный инструмент'],
      [4, 'Увеличение характеристик'], [5, 'Алхимический савант'], [6, 'Компетентность в инструментах'], [7, 'Вспышка гениальности'],
      [8, 'Увеличение характеристик'], [9, 'Восстановительные реагенты'], [10, 'Адепт магических предметов'], [11, 'Хранитель заклинаний'],
      [12, 'Увеличение характеристик'], [14, 'Знаток магических предметов'], [15, 'Химическое мастерство'], [16, 'Увеличение характеристик'],
      [18, 'Мастер магических предметов'], [19, 'Увеличение характеристик'], [20, 'Душа изобретения']],
    source: 'Tasha’s Cauldron of Everything (2020) · правила D&D 5e 2014', starterCatalogVersion: VERSION};
}
const api = Object.freeze({VERSION, HERO_ID, EXISTING_IDS: Object.freeze(EXISTING_IDS), classDefinition, items: () => clone(EXTRA_ITEMS), requirements: c => clone(requirements(c)), matches, hasReceipt, plan, buildLiora});
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.DndWorldPartyStarter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

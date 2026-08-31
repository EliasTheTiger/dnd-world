(function itemDomainModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DndWorldItemDomain = api;
})(typeof globalThis === 'object' ? globalThis : this, function buildItemDomainModule() {
  'use strict';

  const SCHEMA_VERSION = 'dnd-world-item/7';
  const CURRENCIES = Object.freeze(['cp', 'sp', 'ep', 'gp', 'pp']);
  const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']);
  const CATEGORIES = Object.freeze(['weapon', 'armor', 'equipment', 'consumable', 'tool', 'material', 'document', 'container', 'quest', 'world-object']);
  const ITEM_TYPES = Object.freeze(['weapon', 'armor', 'equipment', 'potion', 'scroll', 'ring', 'wondrous']);
  const ITEM_SUBTYPES = Object.freeze(['misc', 'magic', 'food', 'material', 'water', 'lore', 'weapon', 'shield', 'container', 'light', 'potion', 'poison', 'scroll', 'armor', 'ammo', 'trap', 'instrument', 'focus', 'firestarter', 'oil', 'gamble', 'ritual', 'writing', 'tool', 'valuable', 'camp', 'rope', 'component']);
  const ITEM_SUBCATEGORIES = Object.freeze(uniq([
    ...ITEM_SUBTYPES, 'armor-accessory', 'miscellaneous', 'readable', 'source-unclassified', 'other', 'quest-item',
    'alchemy-extract', 'drink', 'grenade', 'key', 'alchemy-ingredient', 'alchemy', 'ammunition',
  ]));
  const ACTION_COSTS = Object.freeze(['action', 'attack', 'bonus', 'reaction', 'object', 'turnfree', 'free', 'long']);
  const TARGET_KINDS = Object.freeze(['self', 'ally', 'enemy', 'creature', 'any', 'object', 'creature-or-object', 'none']);
  const EQUIPMENT_SLOTS = Object.freeze(['main-hand', 'off-hand', 'chest', 'head', 'hands', 'feet', 'legs', 'neck', 'ring', 'cloak']);
  const DURATION_KINDS = Object.freeze(['instant', 'rounds', 'until-target-turn-start', 'until-target-turn-end', 'until-long-rest', 'source-program', 'while-requirements-hold', 'concentration']);
  const EFFECT_OPERATIONS = Object.freeze(['add', 'min', 'mul', 'set', 'grant', 'die', 'adv', 'dis']);
  const RESTRICTION_KINDS = Object.freeze(['resolution-gate', 'ends-on-event']);
  const SPECIAL_OPERATIONS = Object.freeze(['stabilize', 'coatWeapon', 'oil', 'zone', 'teleport', 'cleanse', 'campaignContext', 'mentorGuard', 'stayAtOneSave', 'incomingMitigation', 'sealDocument', 'sealResolve', 'bg3Read', 'bg3LightToggle', 'bg3Story', 'bg3Tadpole', 'bg3Recipe', 'bg3RecipeUnlock', 'bg3LearnSpell']);
  const REQUIREMENT_PREDICATES = Object.freeze([
    'equipped', 'attuned', 'held', 'unarmored', 'willing', 'downed', 'blocked-tags',
    'required-tags', 'damage-types', 'required-save-tags', 'any-save-tags',
    'ally-below-half-within-m', 'minimum-strength', 'proficiency',
  ]);
  const RESULT_CHANNELS = Object.freeze(['effects', 'rolls', 'checks', 'damage', 'healing', 'conditions', 'modifiers', 'environment']);

  const HANDLERS = Object.freeze({
    'core.item-use': {executor: 'itemCastFx', result: 'structured-item-use'},
    'core.contextual-item-use': {executor: 'itemTriggerExplain', result: 'contextual-item-use'},
    'core.equipment-toggle': {executor: 'combatToggleEquip', result: 'equipment-state'},
    'core.passive-item': {executor: 'charFxSources', result: 'passive-item-effects'},
    'bg3.rule-program': {executor: 'bg3ItemProgramOpen', result: 'delegated-rule-program'},
    'bg3.recipe-program': {executor: 'bg3RecipeProgramOpen', result: 'delegated-recipe-program'},
    'bg3.learn-spell-program': {executor: 'bg3LearnSpellOpen', result: 'delegated-learn-spell-program'},
    'bg3.lifecycle-program': {executor: 'bg3LifecycleReconcile', result: 'delegated-lifecycle-program'},
    'interaction.weapon-attack': {executor: 'weaponAttackFx', bg3Executor: 'bg3WeaponAttackOpen', result: 'weapon-attack'},
    'interaction.ammo-recover': {executor: 'ammoRecover', result: 'inventory-mutation'},
    'interaction.light-toggle': {executor: 'lightToggle', result: 'environment-light'},
    'interaction.oil-fuel': {executor: 'oilUse', result: 'inventory-and-light'},
    'interaction.fire-start': {executor: 'fireStart', result: 'environment-fire'},
    'interaction.trap-scatter': {executor: 'trapScatter', result: 'environment-zone'},
    'interaction.poison-apply': {executor: 'poisonApply', result: 'weapon-coating'},
    'interaction.tool-check': {executor: 'toolCheck', result: 'ability-check'},
    'interaction.craft-open': {executor: 'craftOpen', result: 'crafting-preflight'},
    'interaction.material-inspect': {executor: 'materialInspect', result: 'material-relations'},
    'interaction.harvest': {executor: 'harvestItem', result: 'harvest-check'},
    'interaction.instrument-play': {executor: 'instrumentPlay', result: 'performance-check'},
    'interaction.gamble-play': {executor: 'gamblePlay', result: 'gaming-check'},
    'interaction.lore-read': {executor: 'loreRead', result: 'knowledge-state'},
    'interaction.valuable-sell': {executor: 'valuableSell', result: 'currency-mutation'},
    'interaction.food-eat': {executor: 'foodEat', result: 'supply-state'},
    'interaction.water-drink': {executor: 'waterDrink', result: 'hydration-state'},
    'interaction.camp-set': {executor: 'campSet', result: 'long-rest'},
    'interaction.rope-use': {executor: 'ropeUse', result: 'environment-gear'},
    'interaction.writing-use': {executor: 'writingUse', result: 'document-state'},
    'interaction.container-open': {executor: 'containerOpen', result: 'container-state'},
    'interaction.ritual-burn': {executor: 'ritualBurn', result: 'ritual-state'},
  });

  const INTERACTION_HANDLER_IDS = Object.freeze({
    weaponAttack: 'interaction.weapon-attack', ammoRecover: 'interaction.ammo-recover', lightToggle: 'interaction.light-toggle',
    oilFuel: 'interaction.oil-fuel', fireStart: 'interaction.fire-start', trapScatter: 'interaction.trap-scatter',
    poisonApply: 'interaction.poison-apply', toolCheck: 'interaction.tool-check', craftOpen: 'interaction.craft-open',
    materialInspect: 'interaction.material-inspect', harvest: 'interaction.harvest', instrumentPlay: 'interaction.instrument-play',
    gamblePlay: 'interaction.gamble-play', loreRead: 'interaction.lore-read', valuableSell: 'interaction.valuable-sell',
    foodEat: 'interaction.food-eat', waterDrink: 'interaction.water-drink', campSet: 'interaction.camp-set',
    ropeUse: 'interaction.rope-use', writingUse: 'interaction.writing-use', containerOpen: 'interaction.container-open',
    ritualBurn: 'interaction.ritual-burn',
  });

  const INTERACTION_RESULTS = Object.freeze({
    weaponAttack: ['effects', 'weapon-attack'], ammoRecover: ['effects', 'recover-ammunition'],
    lightToggle: ['environment', 'toggle-light'], oilFuel: ['environment', 'fuel-light'], fireStart: ['environment', 'toggle-fire'],
    trapScatter: ['environment', 'create-obstacle-zone'], poisonApply: ['effects', 'coat-weapon'],
    toolCheck: ['checks', 'tool-task'], craftOpen: ['effects', 'open-crafting-preflight'],
    materialInspect: ['effects', 'reveal-material-relations'], harvest: ['checks', 'harvest-resource'],
    instrumentPlay: ['checks', 'performance'], gamblePlay: ['checks', 'gaming-set'], loreRead: ['effects', 'mark-read-and-reveal'],
    valuableSell: ['effects', 'sell-one-item'], foodEat: ['effects', 'consume-food-supply'], waterDrink: ['effects', 'hydrate-or-fill'],
    campSet: ['effects', 'perform-long-rest'], ropeUse: ['environment', 'toggle-secured-rope'], writingUse: ['effects', 'write-or-copy'],
    containerOpen: ['effects', 'open-container'], ritualBurn: ['environment', 'start-ritual-flame'],
  });

  const SOURCE_CATEGORY = Object.freeze({
    weapon: ['weapon', 'weapon'],
    'equipment.armor-accessory': ['equipment', 'armor-accessory'],
    miscellaneous: ['world-object', 'miscellaneous'],
    readable: ['document', 'readable'],
    'consumable.food': ['consumable', 'food'],
    unclassified: ['world-object', 'source-unclassified'],
    'consumable.scroll': ['consumable', 'scroll'],
    'consumable.potion': ['consumable', 'potion'],
    'consumable.other': ['consumable', 'other'],
    'equipment.shield': ['armor', 'shield'],
    'quest-item': ['quest', 'quest-item'],
    'alchemy.extract': ['material', 'alchemy-extract'],
    'consumable.drink': ['consumable', 'drink'],
    'consumable.grenade': ['consumable', 'grenade'],
    key: ['quest', 'key'],
    'alchemy.ingredient': ['material', 'alchemy-ingredient'],
    'tool.instrument': ['tool', 'instrument'],
    'alchemy.consumable': ['consumable', 'alchemy'],
    'consumable.ammunition': ['consumable', 'ammunition'],
    'consumable.poison': ['consumable', 'poison'],
  });

  const RARITY_MAP = Object.freeze({
    'обычный': 'common', common: 'common', 'необычный': 'uncommon', uncommon: 'uncommon',
    'редкий': 'rare', rare: 'rare', 'очень редкий': 'very-rare', 'very rare': 'very-rare', 'very-rare': 'very-rare',
    'легендарный': 'legendary', legendary: 'legendary', 'артефакт': 'artifact', artifact: 'artifact',
  });
  const SLOT_MAP = Object.freeze({MAIN_HAND: ['main-hand'], OFF_HAND: ['off-hand'], TWO_HAND: ['main-hand', 'off-hand'],
    CHEST: ['chest'], HEAD: ['head'], HANDS: ['hands'], FEET: ['feet'], LEGS: ['legs'], NECK: ['neck'], RING: ['ring'], CLOAK: ['cloak']});
  const TARGET_MAP = Object.freeze({creatureOrObject: 'creature-or-object'});
  const REQUIREMENT_MAP = Object.freeze({blockedTags: 'blocked-tags', requiredTags: 'required-tags', damageTypes: 'damage-types',
    requiredSaveTags: 'required-save-tags', anySaveTags: 'any-save-tags', allyBelowHalfWithinM: 'ally-below-half-within-m'});
  const CURRENCY_CP = Object.freeze({cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000});

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function finite(value) { return value !== '' && value != null && Number.isFinite(Number(value)); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function uniq(values) { return [...new Set(values.filter(Boolean))]; }
  function slug(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
  function rootUuidFromItemId(id) { const match = /^bg3:item:rt:([0-9a-f-]{36})(?::|$)/i.exec(text(id)); return match ? match[1].toLowerCase() : null; }

  function createMigrationContext(items) {
    const rootTemplateToItemId = new Map();
    for (const item of items || []) {
      const uuid = text(item && item.source && item.source.rootTemplateUuid).toLowerCase() || rootUuidFromItemId(item && item.id);
      if (uuid && !rootTemplateToItemId.has(uuid)) rootTemplateToItemId.set(uuid, text(item.id));
    }
    return {rootTemplateToItemId};
  }

  function currencyFrom(value) {
    const raw = text(value).toLowerCase().replace(',', '.');
    const number = Number((raw.match(/-?\d+(?:\.\d+)?/) || [0])[0]);
    const currency = /(?:^|\s)(?:мм|cp)\b/.test(raw) ? 'cp' : /(?:^|\s)(?:см|sp)\b/.test(raw) ? 'sp'
      : /(?:^|\s)(?:эм|ep)\b/.test(raw) ? 'ep' : /(?:^|\s)(?:пм|pp)\b/.test(raw) ? 'pp' : 'gp';
    return {amount: Number.isFinite(number) ? number : 0, currency};
  }

  function economyOf(item, profile) {
    const value = profile && profile.value || {};
    const parsed = currencyFrom(item.cost);
    const copper = finite(value.cp) ? Math.max(0, Math.round(Number(value.cp)))
      : finite(value.gp) ? Math.max(0, Math.round(Number(value.gp) * 100))
        : Math.max(0, Math.round(parsed.amount * CURRENCY_CP[parsed.currency]));
    let currency = parsed.currency;
    let amount = parsed.amount;
    if (finite(value.gp)) { currency = 'gp'; amount = Math.max(0, Number(value.gp)); }
    else if (finite(value.cp)) { currency = 'cp'; amount = copper; }
    const valueState = text(value.state);
    const tradeable = value.mode === 'inventory' || copper > 0 || valueState === 'value';
    return {cost: {amount, currency, copper, tradeable, source: value.mode === 'inventory' ? 'inventory-instance' : valueState === 'value' ? 'source' : copper ? 'legacy-conversion' : 'not-applicable'}};
  }

  function weightOf(item, profile) {
    const mass = profile && profile.mass || {};
    let kg = finite(mass.kg) ? Number(mass.kg) : null;
    if (kg == null) {
      const raw = text(item.weight).toLowerCase().replace(',', '.');
      const amount = Number((raw.match(/-?\d+(?:\.\d+)?/) || [0])[0]);
      kg = Number.isFinite(amount) ? amount * (/фунт|lb/.test(raw) ? 0.45359237 : 1) : 0;
    }
    kg = Math.max(0, Math.round(kg * 1000000) / 1000000);
    const portable = profile && profile.flags && typeof profile.flags.portable === 'boolean' ? profile.flags.portable : true;
    return {value: kg, unit: 'kg', portable, source: text(mass.state) === 'value' || finite(mass.kg) ? 'source' : kg ? 'legacy-conversion' : 'not-applicable'};
  }

  function taxonomyOf(item, profile) {
    const sourceCategory = text(item && item.source && item.source.category);
    let pair = SOURCE_CATEGORY[sourceCategory];
    const rawType = text(item.type).toLowerCase() || 'equipment';
    const rawSubtype = text(profile && profile.kind).toLowerCase() || 'misc';
    if (!pair) {
      if (rawType === 'weapon') pair = ['weapon', rawSubtype === 'misc' ? 'weapon' : rawSubtype];
      else if (rawType === 'armor') pair = ['armor', rawSubtype === 'misc' ? 'armor' : rawSubtype];
      else if (rawType === 'potion' || rawType === 'scroll' || profile && profile.flags && profile.flags.consumable) pair = ['consumable', rawSubtype];
      else if (rawSubtype === 'tool' || rawSubtype === 'instrument') pair = ['tool', rawSubtype];
      else if (rawSubtype === 'material' || rawSubtype === 'component') pair = ['material', rawSubtype];
      else if (rawSubtype === 'lore' || rawSubtype === 'writing') pair = ['document', rawSubtype];
      else if (rawSubtype === 'container') pair = ['container', rawSubtype];
      else pair = ['equipment', rawSubtype];
    }
    return {category: pair[0], subcategory: pair[1], type: rawType, subtype: rawSubtype, sourceCategory: sourceCategory || null};
  }

  function sourceFact(item, key) {
    return item && item.mechanics && item.mechanics.provenance && item.mechanics.provenance.sourceFacts
      && item.mechanics.provenance.sourceFacts.facts && item.mechanics.provenance.sourceFacts.facts[key] || null;
  }

  function stackOf(item, profile, taxonomy) {
    const maxStack = sourceFact(item, 'maxStack');
    const fromSource = maxStack && maxStack.state === 'value' && Number.isInteger(Number(maxStack.value)) && Number(maxStack.value) > 0;
    const stackable = Boolean(profile && profile.flags && profile.flags.consumable)
      || ['consumable', 'material'].includes(taxonomy.category) || ['ammo', 'food', 'water'].includes(taxonomy.subtype);
    return {defaultQuantity: 1, maximum: fromSource ? Number(maxStack.value) : stackable ? 99 : 1, source: fromSource ? 'source' : 'rules-default'};
  }

  function requirementsOf(item, actionRequirements) {
    const rows = [];
    if (finite(item && item.strReq) && Number(item.strReq) > 0) rows.push({predicate: 'minimum-strength', operator: 'gte', value: Number(item.strReq)});
    const req = actionRequirements && typeof actionRequirements === 'object' && !Array.isArray(actionRequirements) ? actionRequirements : {};
    for (const key of Object.keys(req).sort()) {
      const predicate = REQUIREMENT_MAP[key] || key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      const operator = key === 'blockedTags' ? 'excludes-all' : ['requiredTags', 'requiredSaveTags'].includes(key) ? 'includes-all' : Array.isArray(req[key]) ? 'includes-any' : 'equals';
      rows.push({predicate, operator, value: clone(req[key])});
    }
    return rows;
  }

  function chargesOf(item) {
    const resource = item && item.mechanics && Object.prototype.hasOwnProperty.call(item.mechanics, 'resource') ? item.mechanics.resource : item && item.resource;
    if (!resource || resource.kind !== 'charges' || !Number.isInteger(Number(resource.max)) || Number(resource.max) < 1) {
      return {enabled: false, maximum: 0, initial: 0, recovery: [], lastCharge: null};
    }
    let trigger = 'long-rest';
    const when = text(resource.when).toLowerCase();
    if (/рассвет/.test(when)) trigger = 'dawn';
    else if (/коротк/.test(when) && /долг/.test(when)) trigger = 'short-or-long-rest';
    else if (/коротк/.test(when)) trigger = 'short-rest';
    const recharge = resource.recharge;
    const recovery = recharge ? [{trigger, formula: {dice: Number(recharge.cnt) || 0, sides: Number(recharge.sides) || 0, modifier: Number(recharge.plus) || 0}}] : [];
    const last = resource.lastCharge;
    return {enabled: true, maximum: Number(resource.max), initial: Number(resource.max), recovery,
      lastCharge: last ? {roll: {dice: 1, sides: Number(last.sides)}, destroyOn: Number(last.destroyOn)} : null};
  }

  function durationOf(value, fallback, concentration) {
    const duration = value && typeof value === 'object' ? value : null;
    let result;
    if (!duration) result = {kind: fallback || 'instant'};
    else if (duration.kind === 'rounds') result = {kind: 'rounds', amount: Math.max(1, Number(duration.rounds) || 1)};
    else if (duration.kind === 'targetStart') result = {kind: 'until-target-turn-start'};
    else if (duration.kind === 'targetEnd') result = {kind: 'until-target-turn-end'};
    else if (duration.kind === 'longRest') result = {kind: 'until-long-rest'};
    else if (duration.kind === 'manual') result = {kind: 'source-program'};
    else result = {kind: fallback || 'instant'};
    return concentration === true ? {kind: 'concentration', maximum: result} : result;
  }

  function formulaOf(value) {
    if (!value || typeof value !== 'object') return null;
    const dice = Number(value.cnt) || 0, sides = Number(value.sides) || 0, modifier = Number(value.mod) || 0;
    if (!Number.isInteger(dice) || dice < 0 || !Number.isInteger(sides) || sides < 0 || (!sides && !modifier)) return null;
    return {dice, sides, modifier};
  }

  function emptyResult(duration) {
    return {effects: [], duration: durationOf(duration), rolls: [], checks: [], damage: [], healing: [], conditions: [], modifiers: [], environment: []};
  }

  function semanticEffectValue(value) {
    if (typeof value !== 'string') return clone(value);
    const raw = text(value), walk = /^равна скорости ходьбы$/i.test(raw), dice = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i.exec(raw), distance = /^(\d+(?:[.,]\d+)?)\s*м$/i.exec(raw);
    if (walk) return {kind: 'stat-reference', path: 'speed.walk'};
    if (dice) return {kind: 'dice', dice: Number(dice[1]), sides: Number(dice[2]), modifier: Number((dice[3] === '-' ? '-' : '') + (dice[4] || 0))};
    if (distance) return {kind: 'distance', value: Number(distance[1].replace(',', '.')), unit: 'm'};
    return {kind: 'symbol', value: raw};
  }

  function effectRows(value) {
    const effects = [], modifiers = [], conditions = [];
    for (const effect of Array.isArray(value) ? value : []) {
      if (!effect || !text(effect.stat) || !text(effect.mode)) continue;
      const path = text(effect.stat), operation = text(effect.mode);
      if (path === 'note') continue;
      if (/condition|state|status/i.test(path) && operation === 'text') {
        conditions.push({conditionId: slug(effect.value), operation: 'apply'}); continue;
      }
      if (!EFFECT_OPERATIONS.includes(operation)) continue;
      const row = {path, operation, value: semanticEffectValue(effect.value)};
      if (/condition|state|status/i.test(row.path) || row.operation === 'grant' && /condition|status/i.test(JSON.stringify(row.value))) conditions.push(row);
      else modifiers.push(row);
    }
    return {effects, modifiers, conditions};
  }

  function actionReady(action) {
    if (!action || typeof action !== 'object') return {ready: false, reason: 'invalid-action'};
    const program = action.program || {}, projection = program.projection || null, declared = action.contract || null;
    const blocked = action.sourceBlocked === true || program.sourceBlocked === true || program.runtimeReady === false || program.executable === false || declared && declared.state === 'blocked';
    if (blocked) return {ready: false, reason: text(action.reason || program.reason || declared && declared.reason) || 'source-program-blocked'};
    if (action.handler === 'bg3RecipeProgram') return {ready: program.mode === 'typed', reason: program.mode === 'typed' ? 'exact-recipe-preflight' : 'source-program-not-typed'};
    if (action.handler === 'bg3LearnSpellProgram') return {ready: Boolean(program.learnSpell), reason: program.learnSpell ? 'exact-learn-spell-preflight' : 'learn-spell-contract-missing'};
    if (action.handler === 'bg3RootProgram' && action.special && action.special.kind === 'bg3Tadpole' && action.special.requiresCampaignHandler === true) return {ready: true, reason: 'exact-tadpole-preflight'};
    if (action.handler === 'bg3RuleProgram' || action.handler === 'bg3RootProgram') {
      const projectionReady = Boolean(projection && projection.complete === true && ['typed', 'empty'].includes(projection.mode)
        && !(projection.unresolved || []).length && projection.sourceBlocked !== true && projection.runtimeReady !== false && projection.executable !== false);
      const ready = projection ? projectionReady : program.mode === 'typed';
      return {ready, reason: ready ? (projection ? 'complete-rule-projection' : 'typed-root-program') : (projection && (projection.unresolved || []).length ? 'unresolved-rule-projection' : 'source-program-' + (projection && projection.mode || program.mode || 'unknown'))};
    }
    return {ready: true, reason: 'core-structured-use'};
  }

  function handlerForUse(action, isBg3) {
    if (action.handler === 'bg3RecipeProgram') return 'bg3.recipe-program';
    if (action.handler === 'bg3LearnSpellProgram') return 'bg3.learn-spell-program';
    if (action.handler === 'bg3RuleProgram' || action.handler === 'bg3RootProgram') return 'bg3.rule-program';
    if (action.trigger || action.special === 'mentorGuard') return 'core.contextual-item-use';
    return isBg3 ? 'bg3.rule-program' : 'core.item-use';
  }

  function programEffect(action, handlerId) {
    const program = action.program || {};
    if (!handlerId.startsWith('bg3.')) return null;
    return {kind: HANDLERS[handlerId].result, programId: text(program.id), artifact: text(program.rootArtifact), profile: text(program.sourceProfile) || 'standard'};
  }

  function programReferencesOf(action, handlerId) {
    if (!handlerId.startsWith('bg3.')) return [];
    const program = action.program || {}, rows = [], add = (id, artifact) => {
      id = text(id); artifact = text(artifact);
      if (id && artifact && !rows.some(row => row.id === id && row.artifact === artifact)) rows.push({kind: 'program', id, artifact, handlerId});
    };
    add(program.id, program.rootArtifact);
    const projection = program.projection || {};
    for (const ref of [].concat(projection.entrypoints || [], projection.transitive || [])) add(ref && ref.programId, ref && ref.artifact);
    const learned = program.learnSpell && program.learnSpell.spell;
    add(learned && learned.programId, learned && learned.artifact);
    const status = program.statusApplication;
    add(status && status.programId, status && status.artifact);
    return rows;
  }

  function useActionOf(item, action, isBg3) {
    const readiness = actionReady(action);
    if (!readiness.ready) return {action: null, blocked: {kind: 'source-action', sourceId: text(action && action.id), reasonCode: readiness.reason}};
    const handlerId = handlerForUse(action, isBg3), handler = HANDLERS[handlerId];
    if (!handler) return {action: null, blocked: {kind: 'source-action', sourceId: text(action && action.id), reasonCode: 'handler-not-registered'}};
    const result = emptyResult();result.duration=durationOf(action.duration,'instant',action.concentration===true);
    const fx = effectRows(action.effects);
    result.effects.push(...fx.effects); result.modifiers.push(...fx.modifiers); result.conditions.push(...fx.conditions);
    for (const damage of Array.isArray(action.damage) ? action.damage : []) {
      const formula = formulaOf(damage); if (formula) result.damage.push({formula, type: text(damage.type || damage.damageType) || 'untyped', application: text(action.effectWhen) || 'on-resolution'});
    }
    const heal = formulaOf(action.heal); if (heal) result.healing.push({kind: 'hit-points', formula: heal});
    const temporary = formulaOf(action.temp); if (temporary) result.healing.push({kind: 'temporary-hit-points', formula: temporary});
    if (action.attack) result.rolls.push({kind: 'attack', ability: text(action.attack.ability) || null, fixedBonus: finite(action.attack.fixedBonus) ? Number(action.attack.fixedBonus) : null});
    if (action.save) result.checks.push({kind: 'saving-throw', ability: text(action.save.key), dc: Number(action.save.dc)});
    if (action.special) {
      const operation=typeof action.special === 'string' ? action.special : text(action.special.kind);
      if (SPECIAL_OPERATIONS.includes(operation))result.effects.push({kind: 'special-operation', operation});
    }
    const delegated = programEffect(action, handlerId); if (delegated) result.effects.push(delegated);
    if (!RESULT_CHANNELS.some(key => result[key].length)) return {action: null, blocked: {kind: 'source-action', sourceId: text(action.id), reasonCode: 'action-has-no-result'}};
    const target = TARGET_KINDS.includes(TARGET_MAP[action.target] || action.target) ? (TARGET_MAP[action.target] || action.target) : 'none';
    const consume = action.consume && typeof action.consume === 'object' ? action.consume : {kind: 'none', amount: 0};
    return {action: {
      id: 'use:' + text(action.id), label: text(action.label) || text(item.n), activation: {cost: ACTION_COSTS.includes(action.cost) ? action.cost : 'action', amount: 1},
      handler: {id: handlerId, executor: handler.executor}, targets: {kind: target, count: Number(action.targetCount || 1)},
      requirements: requirementsOf({}, action.requirements), restrictions: [].concat(action.effectWhen?[{kind:'resolution-gate',value:text(action.effectWhen)}]:[],Array.isArray(action.breakOn)&&action.breakOn.length?[{kind:'ends-on-event',events:action.breakOn.map(text)}]:[]), resourceCost: {kind: text(consume.kind) || 'none', amount: Number(consume.amount) || 0}, result,
      source: {kind: isBg3 ? 'bg3-action' : 'item-use', id: text(action.id), programId: text(action.program && action.program.id) || null, references: programReferencesOf(action, handlerId)},
    }, blocked: null};
  }

  function interactionActionOf(item, interaction, isBg3) {
    const handlerId = INTERACTION_HANDLER_IDS[interaction && interaction.handler], handler = HANDLERS[handlerId], descriptor = INTERACTION_RESULTS[interaction && interaction.handler];
    if (!handler || !descriptor) return null;
    const result = emptyResult();
    const row = {kind: 'engine-operation', operation: descriptor[1]};
    if (interaction.taskId) row.taskId = text(interaction.taskId);
    result[descriptor[0]].push(row);
    let executor = handler.executor;
    if (isBg3 && handler.bg3Executor) executor = handler.bg3Executor;
    return {id: 'interaction:' + text(interaction.id), label: text(interaction.label), activation: {cost: ACTION_COSTS.includes(interaction.cost) ? interaction.cost : 'object', amount: 1},
      handler: {id: handlerId, executor}, targets: {kind: interaction.handler === 'weaponAttack' ? 'enemy' : interaction.handler === 'poisonApply' ? 'object' : 'self', count: 1},
      requirements: [], restrictions: [], resourceCost: {kind: 'none', amount: 0}, result,
      source: {kind: 'interaction', id: text(interaction.id), programId: null, references: []}};
  }

  function equipmentActionOf(item, slots) {
    if (!slots.length) return null;
    const handler = HANDLERS['core.equipment-toggle'], result = emptyResult();
    result.effects.push({kind: 'engine-operation', operation: 'toggle-equipment'});
    return {id: 'equipment:toggle', label: 'Надеть или снять', activation: {cost: 'object', amount: 1},
      handler: {id: 'core.equipment-toggle', executor: handler.executor}, targets: {kind: 'self', count: 1},
      requirements: [], restrictions: [], resourceCost: {kind: 'none', amount: 0}, result,
      source: {kind: 'interaction', id: 'equipment-toggle', programId: null, references: []}};
  }

  function passiveOf(item) {
    const mechanics = item && item.mechanics || {}, fx = effectRows(mechanics.effects);
    const effects = [...fx.effects];
    for (const ref of Array.isArray(mechanics.lifecyclePrograms) ? mechanics.lifecyclePrograms : []) {
      const projection = ref && ref.projection;
      const ready = ref && ['typed', 'empty'].includes(text(ref.mode)) && projection && ['typed', 'empty'].includes(text(ref.projectionMode))
        && projection.complete === true && !(projection.unresolved || []).length;
      if (ready) effects.push({kind: 'delegated-lifecycle-program', programId: text(ref.programId || ref.id), artifact: text(ref.artifact), gate: text(ref.gate) || 'inventory'});
    }
    return {effects, duration: {kind: effects.length || fx.modifiers.length || fx.conditions.length ? 'while-requirements-hold' : 'instant'},
      conditions: fx.conditions, modifiers: fx.modifiers};
  }

  function descriptionOf(item, taxonomy) {
    const localized = text(item && item.i18n && item.i18n.ru && item.i18n.ru.description) || text(item && item.desc);
    if (localized) return {text: localized, language: 'ru', source: item && item.source && item.source.game === 'bg3' ? 'source-localized' : 'catalog'};
    return {text: '', language: 'ru', source: 'missing'};
  }

  const CATEGORY_GLYPHS = Object.freeze({weapon: '⚔', armor: '🛡', equipment: '🎒', consumable: '⚗', tool: '🛠', material: '💎',
    document: '📜', container: '📦', quest: '🔑', 'world-object': '🪨'});

  function iconOf(item, taxonomy, isBg3) {
    const icon = item && item.icon;
    if (icon && text(icon.src)) return {kind: 'asset', src: text(icon.src), width: Number(icon.width) || 64, height: Number(icon.height) || 64,
      sha256: text(icon.sha256) || null, source: isBg3 ? 'source-artifact' : 'catalog-asset'};
    if (!isBg3) return {kind: 'glyph', value: CATEGORY_GLYPHS[taxonomy.category] || '🎒', source: 'engine-taxonomy'};
    return {kind: 'missing', source: 'missing'};
  }

  function originOf(item, isBg3) {
    const label = text(item && item.rules && item.rules.source)
      || text(item && item.mechanics && item.mechanics.provenance && item.mechanics.provenance.source)
      || (isBg3 ? '' : (item && item.custom ? 'D&D World campaign' : 'D&D World built-in 5e catalog'));
    return {kind: isBg3 ? 'game-build' : (item && item.custom ? 'campaign' : 'built-in-catalog'), label,
      version: isBg3 ? text(item && item.source && (item.source.catalogVersion || item.source.buildId)) : null};
  }

  function attunementOf(item, mechanics) {
    const spec = mechanics && mechanics.itemSpec || {};
    return {required: spec.attune === true, requirements: []};
  }

  function migrateItemToDomainV7(item, options) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('item must be an object');
    if (item.schemaVersion === SCHEMA_VERSION) return clone(item);
    options = options || {};
    const mechanics = item.mechanics || {}, profile = mechanics.profile || {}, taxonomy = taxonomyOf(item, profile), isBg3 = text(item.id).startsWith('bg3:item:');
    const context = options.context || {}, aliasUuid = text(item.source && item.source.semanticAliasOf).toLowerCase() || null;
    const ownUuid = text(item.source && item.source.rootTemplateUuid).toLowerCase() || rootUuidFromItemId(item.id);
    const canonicalId = aliasUuid && context.rootTemplateToItemId && context.rootTemplateToItemId.get(aliasUuid) || text(item.id);
    const useRows = Array.isArray(mechanics.actions) ? mechanics.actions : Array.isArray(item.uses) ? item.uses : [];
    const interactionRows = Array.isArray(mechanics.interactions) ? mechanics.interactions : [];
    const actions = [], blocked = [];
    for (const use of useRows) { const row = useActionOf(item, use, isBg3); if (row.action) actions.push(row.action); else if (row.blocked) blocked.push(row.blocked); }
    for (const interaction of interactionRows) { const row = interactionActionOf(item, interaction, isBg3); if (row && !actions.some(action => action.id === row.id)) actions.push(row); }
    const economy = economyOf(item, profile), weight = weightOf(item, profile), charges = chargesOf(item);
    const consumable = Boolean(profile && profile.flags && profile.flags.consumable) || actions.some(action => action.resourceCost.kind === 'item' && action.resourceCost.amount > 0);
    const slots = uniq((SLOT_MAP[text(item.slot)] || []).concat(SLOT_MAP[text(mechanics.equipment && mechanics.equipment.slot)] || []));
    const equipmentAction = equipmentActionOf(item, slots); if (equipmentAction) actions.push(equipmentAction);
    const passive = passiveOf(item), passiveProgramEffects = passive.effects.filter(effect => effect.kind === 'delegated-lifecycle-program'),
      directPassive = passive.effects.some(effect => effect.kind !== 'delegated-lifecycle-program') || passive.modifiers.length || passive.conditions.length,
      handlerIds = uniq(actions.map(action => action.handler.id).concat(passiveProgramEffects.length ? ['bg3.lifecycle-program'] : [], directPassive ? ['core.passive-item'] : [])),
      handlers = handlerIds.map(id => ({id, executor: HANDLERS[id].executor}));
    const domain = {
      schemaVersion: SCHEMA_VERSION, id: text(item.id), canonicalId, aliasOf: canonicalId !== text(item.id) ? canonicalId : null,
      name: text(item.n || item.name), taxonomy, description: descriptionOf(item, taxonomy), rarity: RARITY_MAP[text(item.rarity).toLowerCase()] || 'common',
      icon: iconOf(item, taxonomy, isBg3), source: originOf(item, isBg3),
      economy: {cost: economy.cost, weight}, stack: stackOf(item, profile, taxonomy),
      equipment: {slots, requirements: requirementsOf(item), attunement: attunementOf(item, mechanics)}, charges,
      consumable: {value: consumable, resource: consumable ? 'item' : 'none', amount: consumable ? 1 : 0},
      gameplay: {actions, passive, defaultDuration: passive.duration, rolls: actions.flatMap(action => action.result.rolls), checks: actions.flatMap(action => action.result.checks),
        damage: actions.flatMap(action => action.result.damage), healing: actions.flatMap(action => action.result.healing), conditions: passive.conditions.concat(actions.flatMap(action => action.result.conditions)),
        modifiers: passive.modifiers.concat(actions.flatMap(action => action.result.modifiers)), environment: actions.flatMap(action => action.result.environment)},
      tags: uniq((Array.isArray(item.tags) ? item.tags : []).map(value => text(value).toLowerCase())).sort(), handlers,
      references: actions.flatMap(action => action.source.references)
        .concat(passiveProgramEffects.map(effect => ({kind: 'program', id: effect.programId, artifact: effect.artifact, handlerId: 'bg3.lifecycle-program'}))),
      provenance: {source: isBg3 ? 'bg3' : 'dnd-world', sourceItemId: text(item.id), sourceRootTemplateUuid: ownUuid, migration: 'item-domain-v7-machine-semantics-20260830', blockedCapabilities: blocked},
    };
    return domain;
  }

  function validateItemDomainV7(item) {
    const errors = [], add = message => errors.push(message);
    if (!item || typeof item !== 'object' || Array.isArray(item)) return ['item must be an object'];
    if (item.schemaVersion !== SCHEMA_VERSION) add('schemaVersion must be ' + SCHEMA_VERSION);
    for (const key of ['id', 'canonicalId', 'name']) if (!text(item[key])) add(key + ' is required');
    const taxonomy = item.taxonomy || {};
    if (!CATEGORIES.includes(taxonomy.category)) add('unknown category ' + text(taxonomy.category));
    if (!ITEM_SUBCATEGORIES.includes(taxonomy.subcategory)) add('unknown subcategory ' + text(taxonomy.subcategory));
    if (!ITEM_TYPES.includes(taxonomy.type)) add('unknown item type ' + text(taxonomy.type));
    if (!ITEM_SUBTYPES.includes(taxonomy.subtype)) add('unknown item subtype ' + text(taxonomy.subtype));
    if (!item.description || !text(item.description.text) || !['ru', 'en'].includes(item.description.language)) add('description must be localized and non-empty');
    if (!item.icon || !['asset', 'glyph'].includes(item.icon.kind)
      || item.icon.kind === 'asset' && !text(item.icon.src) || item.icon.kind === 'glyph' && !text(item.icon.value)) add('icon must be explicit');
    if (!item.source || !['game-build', 'campaign', 'built-in-catalog'].includes(item.source.kind) || !text(item.source.label)) add('source must be explicit');
    if (!RARITIES.includes(item.rarity)) add('unknown rarity ' + text(item.rarity));
    const cost = item.economy && item.economy.cost, weight = item.economy && item.economy.weight;
    if (!cost || !finite(cost.amount) || Number(cost.amount) < 0 || !CURRENCIES.includes(cost.currency) || !Number.isInteger(cost.copper) || cost.copper < 0 || typeof cost.tradeable !== 'boolean') add('cost must be structured');
    if (!weight || !finite(weight.value) || Number(weight.value) < 0 || weight.unit !== 'kg' || typeof weight.portable !== 'boolean') add('weight must be structured');
    if (!item.stack || !Number.isInteger(item.stack.defaultQuantity) || item.stack.defaultQuantity < 1 || !Number.isInteger(item.stack.maximum) || item.stack.maximum < item.stack.defaultQuantity) add('stack quantities must be positive integers');
    const equipment = item.equipment || {};
    if (!Array.isArray(equipment.slots) || equipment.slots.some(slot => !EQUIPMENT_SLOTS.includes(slot)) || new Set(equipment.slots).size !== equipment.slots.length) add('equipment slots must use the closed vocabulary');
    if (!Array.isArray(equipment.requirements) || equipment.requirements.some(row => !row || !REQUIREMENT_PREDICATES.includes(row.predicate))) add('equipment requirements contain an unknown predicate');
    if (!equipment.attunement || typeof equipment.attunement.required !== 'boolean' || !Array.isArray(equipment.attunement.requirements)) add('attunement must be explicit');
    if (!item.charges || typeof item.charges.enabled !== 'boolean' || !Number.isInteger(item.charges.maximum) || item.charges.maximum < 0 || !Number.isInteger(item.charges.initial) || item.charges.initial < 0 || item.charges.initial > item.charges.maximum || !Array.isArray(item.charges.recovery)) add('charges must be explicit');
    if (!item.consumable || typeof item.consumable.value !== 'boolean' || !['none', 'item'].includes(item.consumable.resource) || !Number.isInteger(item.consumable.amount) || item.consumable.amount < 0) add('consumability must be explicit');
    const gameplay = item.gameplay || {}, actions = gameplay.actions;
    if (!Array.isArray(actions)) add('gameplay.actions must be an array');
    else {
      const ids = new Set();
      for (const action of actions) {
        if (!action || !text(action.id) || ids.has(action.id)) { add('action ids must be present and unique'); continue; }
        ids.add(action.id);
        if (!text(action.label) || !ACTION_COSTS.includes(action.activation && action.activation.cost)) add(action.id + ': invalid label or activation');
        const registered = action.handler && HANDLERS[action.handler.id];
        if (!registered || ![registered.executor, registered.bg3Executor].filter(Boolean).includes(action.handler.executor)) add(action.id + ': unresolved handler');
        if (!action.targets || !TARGET_KINDS.includes(action.targets.kind) || !Number.isInteger(action.targets.count) || action.targets.count < 1) add(action.id + ': invalid targets');
        if (!Array.isArray(action.requirements) || action.requirements.some(row => !REQUIREMENT_PREDICATES.includes(row.predicate))) add(action.id + ': unknown requirement');
        if (!Array.isArray(action.restrictions) || action.restrictions.some(row=>!row||!RESTRICTION_KINDS.includes(row.kind)) || !action.resourceCost || !text(action.resourceCost.kind) || !finite(action.resourceCost.amount) || Number(action.resourceCost.amount) < 0) add(action.id + ': invalid restrictions or resource cost');
        if (!action.result || !RESULT_CHANNELS.every(key => Array.isArray(action.result[key])) || !action.result.duration || !DURATION_KINDS.includes(action.result.duration.kind)) add(action.id + ': result shape is incomplete');
        else if (!RESULT_CHANNELS.some(key => action.result[key].length)) add(action.id + ': action has no result');
        if(action.result&&action.result.modifiers.some(row=>!row||!text(row.path)||!EFFECT_OPERATIONS.includes(row.operation)||row.value===undefined))add(action.id+': invalid modifier');
      }
    }
    for (const key of ['rolls', 'checks', 'damage', 'healing', 'conditions', 'modifiers', 'environment']) if (!Array.isArray(gameplay[key])) add('gameplay.' + key + ' must be an array');
    if (!gameplay.passive || !Array.isArray(gameplay.passive.effects) || !gameplay.defaultDuration || !DURATION_KINDS.includes(gameplay.defaultDuration.kind)) add('passive effects and duration must be explicit');
    if (!Array.isArray(item.tags) || item.tags.some(tag => !text(tag)) || new Set(item.tags).size !== item.tags.length) add('tags must be non-empty and unique');
    if (!Array.isArray(item.handlers) || item.handlers.some(ref => !ref || !HANDLERS[ref.id] || !text(ref.executor))) add('handler references must resolve');
    if (!Array.isArray(item.references) || !item.references.every(ref => ref && ref.kind === 'program' && text(ref.id) && text(ref.artifact) && HANDLERS[ref.handlerId])) add('program references must be typed and resolvable');
    if (!item.provenance || !Array.isArray(item.provenance.blockedCapabilities)) add('provenance must preserve blocked source capabilities');
    return errors;
  }

  function arsenalReadiness(raw, options) {
    options = options || {};
    const domain = options.domain || migrateItemToDomainV7(raw, options), issues = validateItemDomainV7(domain).map(message => 'domain:' + message);
    const add = code => { if (!issues.includes(code)) issues.push(code); };
    const bg3 = text(raw && raw.id).startsWith('bg3:item:'), coverage = raw && raw.mechanics && raw.mechanics.engineCoverage || {};
    if (!text(domain.description && domain.description.text) || !['source-localized', 'catalog'].includes(domain.description && domain.description.source)) add('description-not-source-backed');
    if (!domain.icon || !['asset', 'glyph'].includes(domain.icon.kind)) add('icon-missing');
    if (bg3 && (domain.icon.kind !== 'asset' || !text(raw && raw.icon && raw.icon.sha256))) add('icon-not-source-backed');
    if (!domain.source || !text(domain.source.label)) add('source-missing');
    if (!text(raw && raw.rarity)) add('rarity-missing');
    if (!Array.isArray(domain.tags) || !domain.tags.length) add('tags-missing');
    if (!domain.handlers.length) add('engine-handler-missing');
    const passive = domain.gameplay && domain.gameplay.passive || {};
    if (!domain.gameplay.actions.length && !(passive.effects || []).length && !(passive.modifiers || []).length && !(passive.conditions || []).length) add('engine-affordance-missing');
    if (domain.provenance.blockedCapabilities.length) add('blocked-capability');
    if (bg3) {
      if (!raw.source || !text(raw.source.category) || raw.source.category === 'unclassified') add('taxonomy-unclassified');
      if (!['playable', 'duplicate', 'world-object'].includes(text(raw.source && raw.source.classification))) add('non-arsenal-classification');
      if (coverage.runtimeState !== 'ready') add('runtime-not-ready');
      if ((coverage.blockerCodes || []).length || (coverage.characteristicIssues || []).length || (coverage.blockedDescriptors || []).length
        || Number(coverage.counts && coverage.counts.blockedActions || 0) || Number(coverage.counts && coverage.counts.blockedLifecycle || 0)
        || Number(coverage.counts && coverage.counts.blockedRootPrograms || 0)) add('runtime-blocked-or-incomplete');
      const mass = raw.mechanics && raw.mechanics.profile && raw.mechanics.profile.mass;
      if (!mass || mass.state !== 'value' || !Number.isFinite(Number(mass.kg)) || Number(mass.kg) < 0) add('weight-not-source-backed');
    } else if (!text(raw && raw.weight) || /^(?:—|-|не\s+применяется)$/iu.test(text(raw && raw.weight))) add('weight-missing');
    return {ok: issues.length === 0, issues, item: domain};
  }

  function validateDomainCatalog(domains) {
    const errors = [], ids = new Set(), byId = new Map();
    for (const item of domains || []) {
      for (const error of validateItemDomainV7(item)) errors.push(text(item && item.id) + ': ' + error);
      if (item && ids.has(item.id)) errors.push(item.id + ': duplicate item id');
      if (item) { ids.add(item.id); byId.set(item.id, item); }
    }
    for (const item of domains || []) {
      if (!item) continue;
      if (!ids.has(item.canonicalId)) errors.push(item.id + ': canonicalId does not resolve: ' + item.canonicalId);
      if (item.aliasOf && item.aliasOf !== item.canonicalId) errors.push(item.id + ': aliasOf must equal canonicalId');
      const target = byId.get(item.canonicalId);
      if (target && target.aliasOf) errors.push(item.id + ': canonical identity points to another alias');
    }
    return errors;
  }

  return Object.freeze({SCHEMA_VERSION, CURRENCIES, RARITIES, CATEGORIES, ITEM_TYPES, ITEM_SUBTYPES, ITEM_SUBCATEGORIES, ACTION_COSTS, TARGET_KINDS, EQUIPMENT_SLOTS,
    DURATION_KINDS,EFFECT_OPERATIONS,RESTRICTION_KINDS,REQUIREMENT_PREDICATES, RESULT_CHANNELS, HANDLERS, INTERACTION_HANDLER_IDS, createMigrationContext,
    migrateItemToDomainV7, validateItemDomainV7, validateDomainCatalog, arsenalReadiness, rootUuidFromItemId, actionReady});
});

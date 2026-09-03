import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import Actions from '../scripts/action-kernel.js';
import Chests from '../scripts/chest-core.js';
import Economy from '../scripts/economy-core.js';
import Merchants from '../scripts/merchant-core.js';
import Persistence from '../scripts/persistence-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN_COUNT = 500;
const CLUB_ID = 'it_дубинка';
const POTION_ID = 'it_зелье_лечения_2d4_2';
const FOCUS_ID = 'it_holy_shield_life';
const LEATHER_ID = 'it_кожаный_arm';
const SHIELD_OF_FAITH_ID = 'sp_щит_веры';
const ACTION_SURGE_ID = 'ab_lg_surge';

const REQUIRED_STAGES = Object.freeze([
  'campaign-start',
  'starting-grants',
  'merchant-visit',
  'merchant-buy',
  'merchant-sell',
  'currency-exchange',
  'equipment-cycle',
  'scene-entry',
  'item-spell-ability-and-weapon',
  'enemy-consequence',
  'chest-found',
  'lock-and-trap-check',
  'chest-or-mimic-resolution',
  'loot-claimed',
  'loot-resold',
  'campaign-saved',
  'application-restarted-and-continued',
]);

const ACTOR_PROFILES = Object.freeze([
  {id:'fighter',cls:'Воин',stats:{str:16,dex:12,con:14,int:8,wis:10,cha:10}},
  {id:'wizard',cls:'Волшебник',stats:{str:8,dex:14,con:12,int:17,wis:12,cha:10}},
  {id:'cleric',cls:'Жрец',stats:{str:12,dex:10,con:14,int:10,wis:17,cha:12}},
  {id:'rogue',cls:'Плут',stats:{str:10,dex:17,con:12,int:14,wis:12,cha:10}},
  {id:'bard',cls:'Бард',stats:{str:8,dex:14,con:12,int:12,wis:10,cha:17}},
]);

// Ten semantically different paths, crossed with five actor profiles and ten
// merchant templates. Dice are declarations from the player, never RNG.
const CHEST_SCENARIOS = Object.freeze([
  {id:'careful-simple',mimic:false,failPick:false,failDisarm:false,trigger:false,saveNatural:20,damage:0},
  {id:'detect-retry',mimic:false,failCheck:true,failPick:false,failDisarm:false,trigger:false,saveNatural:20,damage:0},
  {id:'pick-retry',mimic:false,failPick:true,failDisarm:false,trigger:false,saveNatural:20,damage:0},
  {id:'disarm-retry',mimic:false,failPick:false,failDisarm:true,trigger:false,saveNatural:20,damage:0},
  {id:'triple-retry',mimic:false,failCheck:true,failPick:true,failDisarm:true,trigger:false,saveNatural:20,damage:0},
  {id:'poison-failed-save',mimic:false,failPick:false,failDisarm:true,trigger:true,saveNatural:1,damage:4},
  {id:'poison-successful-save',mimic:false,failPick:true,failDisarm:true,trigger:true,saveNatural:20,damage:6},
  {id:'hard-vault',mimic:false,failCheck:true,failPick:true,failDisarm:false,trigger:false,saveNatural:20,damage:0},
  {id:'mimic-detected',mimic:true,failPick:false,failDisarm:false,trigger:false,saveNatural:20,damage:0},
  {id:'mimic-surprise',mimic:true,failCheck:true,failPick:false,failDisarm:false,trigger:false,saveNatural:20,damage:0},
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function restoreObject(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, clone(snapshot));
}

function quantity(owner, itemId) {
  return (owner.inventory || []).filter(row => row.itemId === itemId)
    .reduce((sum, row) => sum + Math.max(0, Number(row.qty) || 0), 0);
}

function stockQuantity(instance, itemId) {
  return (instance.inventory || []).filter(row => row.itemId === itemId)
    .reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
}

function inventoryEntry(owner, itemId) {
  return (owner.inventory || []).find(row => row.itemId === itemId) || null;
}

function addInventory(owner, itemId, qty, entryId) {
  assert.ok(Number.isInteger(qty) && qty > 0, 'inventory grant is a positive integer');
  const existing = inventoryEntry(owner, itemId);
  if (existing) existing.qty = (Number(existing.qty) || 0) + qty;
  else owner.inventory.push({id:entryId,itemId,qty,notes:''});
}

function distribute(records, bucketCount) {
  const buckets = Array.from({length:bucketCount}, () => []);
  records.forEach((record, index) => buckets[index % bucketCount].push(record));
  return buckets;
}

function assertUniqueIds(records, label) {
  const ids = records.map(row => row.id);
  assert.ok(ids.every(Boolean), `${label}: every definition has an ID`);
  assert.equal(new Set(ids).size, ids.length, `${label}: IDs are unique`);
}

function stage(world, name) {
  const expected = REQUIRED_STAGES[world.stageLog.length];
  assert.equal(name, expected, `${world.campaignId}: stage order`);
  world.stageLog.push(name);
}

function projectedTradeItem(definition, index) {
  return Object.assign({}, clone(definition), {
    tags:[...new Set([...(definition.tags || []), 'integration'])],
    rarity:'обычный',
    priceMinor:String(20 + index % 7),
  });
}

function integrationMerchantTemplate(source) {
  return Merchants.normalizeTemplate({
    id:`integration-${source.id}`,
    profession:source.profession,
    merchantType:source.merchantType,
    description:source.description,
    buyCategories:[...new Set([...(source.buyCategories || []),'integration'])],
    sellCategories:[...new Set([...(source.sellCategories || []),'integration'])],
    initialStock:[{categories:['integration'],itemIds:[CLUB_ID],limit:1,quantity:4}],
    startingFunds:clone(source.startingFunds),
    pricingRules:clone(source.pricingRules),
    rarity:clone(source.rarity),
    restockRules:clone(source.restockRules),
    restrictions:clone(source.restrictions),
  });
}

function isManualDefinition(definition) {
  const modes = [definition?.mode,definition?.mechanics?.mode,definition?.enginePolicy?.mode]
    .map(value => String(value || '').toLowerCase());
  return modes.some(mode => mode === 'manual' || mode === 'reference' || mode.includes('manual'));
}

function auditedDefinitionRecord(definition, kind) {
  const manual = isManualDefinition(definition);
  return {
    id:definition.id,
    definition,
    domain:kind,
    admission:manual ? 'manual-fail-closed' : 'audited-runtime-definition',
    executableClaim:false,
    reasonCode:manual ? 'MANUAL_RULE_REQUIRES_GM' : 'CATALOG_CONTRACT_AUDITED',
    explanation:manual
      ? `${kind} ${definition.id} допускается как справочное правило и не исполняется без решения мастера.`
      : `${kind} ${definition.id} прошёл production-аудит схемы; это admission, а не заявление об исполнении в кампании.`,
  };
}

function buildCatalogAudit(engine, gameAudit, itemAudit, rareAudit, spellPreparationAudit) {
  assert.deepEqual(clone(gameAudit.counts),{spells:958,abilities:693,items:193,foes:30,total:1874});
  assert.equal(gameAudit.variants,6408,'all production world formula variants are audited');
  assert.equal(gameAudit.errors.length,0,gameAudit.errors[0] || 'production world audit');
  assert.equal(itemAudit.total,1067);assert.equal(itemAudit.passed,1067);assert.equal(itemAudit.failed,0);
  assert.equal(rareAudit.total,250);assert.equal(rareAudit.passed,250);assert.equal(rareAudit.failed,0);
  assert.equal(spellPreparationAudit.total,320);assert.equal(spellPreparationAudit.passed,320);assert.equal(spellPreparationAudit.failed,0);

  const current = JSON.parse(fs.readFileSync(path.join(ROOT,'data/bg3/current.json'),'utf8'));
  const catalogRoot = path.join(ROOT,'data/bg3',current.catalogVersion);
  const manifest = JSON.parse(fs.readFileSync(path.join(catalogRoot,'manifest.json'),'utf8'));
  const search = JSON.parse(fs.readFileSync(path.join(catalogRoot,manifest.entrypoints.searchIndex),'utf8'));
  const quality = JSON.parse(fs.readFileSync(path.join(catalogRoot,manifest.entrypoints.itemArsenalQualityReport),'utf8'));
  const removed = new Map(quality.removed.map(row => [row.itemId,row.reasons]));
  assert.equal(search.items.length,manifest.counts.items);assert.equal(search.items.length,10282);
  assert.equal(quality.counts.retained,2378);assert.equal(quality.counts.removed,7904);

  const localItems = engine.catalogs.items.map(definition => ({
    id:definition.id,definition,domain:'local',admission:'production-item-audit',executableClaim:false,
    reasonCode:'ITEM_INTEGRATION_AUDITED',explanation:`${definition.id} включён после полного production item audit.`,
  }));
  const bg3Items = search.items.map(definition => {
    const reasons = removed.get(definition.id) || [];
    return reasons.length ? {
      id:definition.id,definition,domain:'bg3',admission:'strict-fail-closed',executableClaim:false,
      reasonCode:'BG3_ARSENAL_FAIL_CLOSED',explanation:`${definition.id} не допускается к выдаче: ${reasons.join(', ')}.`,
    } : {
      id:definition.id,definition,domain:'bg3',admission:'strict-arsenal',executableClaim:false,
      reasonCode:'BG3_ARSENAL_ADMITTED',explanation:`${definition.id} принят strict Full Arsenal; execution здесь не заявляется.`,
    };
  });
  const items = [...localItems,...bg3Items].sort((a,b) => a.id.localeCompare(b.id));
  const spells = [...engine.catalogs.spells].map(row => auditedDefinitionRecord(row,'spell')).sort((a,b) => a.id.localeCompare(b.id));
  const abilities = [...engine.catalogs.abilities].map(row => auditedDefinitionRecord(row,'ability')).sort((a,b) => a.id.localeCompare(b.id));
  assertUniqueIds(items,'combined Item IDs');assertUniqueIds(spells,'spell IDs');assertUniqueIds(abilities,'ability IDs');
  return {current,manifest,quality,items,spells,abilities};
}

function installDeterministicVmClock(engine) {
  const install = engine.state.constructor(`
    const NativeDate = Date;
    let fixedEpoch = NativeDate.parse('2026-09-02T00:00:00.000Z');
    class IntegrationDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedEpoch])); }
      static now() { return fixedEpoch; }
    }
    globalThis.Date = IntegrationDate;
    return value => { fixedEpoch = NativeDate.parse(String(value)); return fixedEpoch; };
  `);
  return install();
}

function suppressHeadlessPresentation(engine) {
  // Browser E2E separately owns real DOM and reload evidence. The matrix keeps
  // every production rule/commit handler and removes only repeated rendering.
  engine.state.constructor(`
    renderCombat = function() {};
    renderChars = function() {};
    renderFoes = function() {};
  `)();
}

function makeNewHero(engine, campaignId, profile) {
  const hero = engine.buildBlank();
  hero.id = `hero-${campaignId}`;
  hero.name = `Герой ${campaignId}`;
  hero.cls = profile.cls;
  hero.level = 8;
  hero.ab = clone(profile.stats);
  hero.hpMax = 30;
  hero.hp = 12;
  hero.hpTemp = 0;
  hero.inventory = [
    {id:`${campaignId}:starter:potion`,itemId:POTION_ID,qty:2,notes:'стартовый расходник'},
    {id:`${campaignId}:starter:sell`,itemId:LEATHER_ID,qty:2,notes:'стартовый товар'},
  ];
  hero.equipment = {};
  hero.activeFx = [];
  hero.fxOff = [];
  hero.cond = [];
  return hero;
}

function campaignConfiguration(index, foeId) {
  const actorIndex = Math.floor(index / 100);
  const merchantIndex = Math.floor(index / 10) % 10;
  const chestIndex = index % 10;
  const profile = ACTOR_PROFILES[actorIndex];
  const merchant = Merchants.DEFAULT_MERCHANT_TEMPLATES[merchantIndex];
  const chest = CHEST_SCENARIOS[chestIndex];
  assert.ok(profile && merchant && chest,'5 × 10 × 10 semantic matrix is complete');
  return {
    profile,merchant,chest,
    value:{actorProfile:profile.id,merchantTemplate:merchant.id,chestScenario:chest.id,foeId},
  };
}

function prepareRuntimeState(engine, campaignId, profile, foeDefinition) {
  const hero = makeNewHero(engine,campaignId,profile);
  const roku = engine.buildRoku();
  const torgar = engine.buildTorgar();
  const septih = engine.buildSeptih();
  const legerem = engine.buildLegerem();
  const party = [hero,roku,torgar,septih,legerem];
  assert.deepEqual(party.map(row => row.id),[hero.id,'char_roku','char_torgar','char_septih','char_legerem']);
  const foe = clone(foeDefinition);
  foe.hpMax = Math.max(100,Number(foe.hpMax) || 1);
  foe.hp = foe.hpMax;
  foe.hpTemp = Math.max(0,Number(foe.hpTemp) || 0);
  foe.activeFx = [];
  foe.cond = [];
  foe.actionState = {};
  const runtimeItems = [CLUB_ID,POTION_ID,FOCUS_ID,LEATHER_ID]
    .map(id => engine.catalogs.items.find(row => row.id === id));
  assert.ok(runtimeItems.every(Boolean),'production journey definitions are installed');
  assert.equal(new Set(runtimeItems.map(row => row.id)).size,4);
  engine.setState({
    chars:party,
    items:runtimeItems,
    spells:[engine.catalogs.spells.find(row => row.id === SHIELD_OF_FAITH_ID)],
    abilities:[engine.catalogs.abilities.find(row => row.id === ACTION_SURGE_ID)],
    races:engine.catalogs.races,
    classes:engine.catalogs.classes,
    foes:[foe],
    activeCharId:hero.id,
    combat:engine.blankCombat(),
    fxRound:1,
  });
  return {hero,roku,torgar,septih,legerem,party,foe};
}

function formulaValues(engine, spec, overrides = {}) {
  const values = Object.assign({},clone(engine.itemAuditRollValues(spec)),overrides);
  for (const row of spec?.rows || []) {
    if (row.autoFail) continue;
    if (values[row.key] == null) values[row.key] = row.natural ? 20 : (Number.isFinite(+row.min) ? +row.min : 0);
    engine.setElementValue(`cf_${row.key}`,values[row.key]);
    if (row.natural && row.adv) {
      const second = values[`${row.key}_2`] == null ? values[row.key] : values[`${row.key}_2`];
      values[`${row.key}_2`] = second;
      engine.setElementValue(`cf_${row.key}_2`,second);
    }
  }
  const outcome = engine.resolveOutcome(spec,values);
  const validation = engine.validateFormulaValues(spec,values,outcome);
  assert.equal(validation.ok,true,validation.errors?.join(' ') || 'manual formula is valid');
  return {values,outcome};
}

function submitCurrentFormula(engine, target, overrides = {}) {
  engine.setElementValue('castTarget',target);
  engine.castConfirm();
  let opened = engine.castState();
  assert.ok(opened.ctx,'production cast context remains available for commit');
  if (opened.spec && ((opened.spec.rows || []).some(row => row.type === 'atk') || opened.spec.meta?.rangeBands)) {
    // Explicit player positioning is evidence too. "near" is legal for melee,
    // touch, and ranged attacks (the latter correctly gain disadvantage).
    engine.castDistanceSet('near');
    opened = engine.castState();
  }
  if (!opened.spec) return {values:{},spec:null};
  const {values,outcome} = formulaValues(engine,opened.spec,overrides);
  engine.castFormulaConfirm();
  assert.equal(engine.castState().ctx,null,`formula commit must close; UI: ${engine.elementText('castErr') || engine.elementText('saveStatus')}`);
  return {values,outcome,spec:opened.spec};
}

function advanceCombatTo(engine, actorKey, maxSteps = 24) {
  for (let step = 0; step < maxSteps; step++) {
    const combat = engine.state().combat;
    const current = combat.order[combat.turnIndex];
    if (current && `${current.kind}:${current.id}` === actorKey) return combat;
    assert.equal(engine.combatNextTurn(),true,`advance combat to ${actorKey}`);
  }
  assert.fail(`combat did not reach ${actorKey}`);
}

function actorCombatState(actor) {
  return clone({hp:actor.hp,hpTemp:actor.hpTemp,cond:actor.cond,activeFx:actor.activeFx,deaths:actor.deaths});
}

function activeEffectBySource(actor, sourceId) {
  return (actor.activeFx || []).find(row => row.id === sourceId || row.spellId === sourceId) || null;
}

function combatActionState(engine, actorKey) {
  const combat = engine.state().combat;
  const entry = (combat.order || []).find(row => `${row.kind}:${row.id}` === actorKey);
  assert.ok(entry,`${actorKey}: combat entry exists for action-state proof`);
  const rawReaction = entry.reactionUsed;
  const reactionUsed = rawReaction === true ? 1 : Math.max(0,Number(rawReaction) || 0);
  const turn=clone(combat.turn);
  // combatSyncActionState materializes this zero-valued compatibility field on
  // first use; absent and zero represent the same action capacity.
  if (turn.bg3ActionCapacityBonus == null) turn.bg3ActionCapacityBonus=0;
  return {turn,reactionUsed};
}

function assertOnlyActionStateChanges(before, after, allowedTurnKeys, label, {allowReaction=false}={}) {
  const stable = snapshot => {
    const value=clone(snapshot);
    for (const key of allowedTurnKeys) delete value.turn[key];
    if (allowReaction) delete value.reactionUsed;
    return value;
  };
  assert.deepEqual(stable(after),stable(before),`${label}: no unrelated action-state field changes`);
}

function assertSingleSpendReceipt(engine, logLengthBefore, actorKey, label) {
  const rows=(engine.state().combat.log || []).slice(logLengthBefore);
  assert.ok(rows.length > 0,`${label}: production combat log receipt exists`);
  const spendRows=rows.filter(row => row && row.kind === 'action' && row.actorKey === actorKey
    && /\[затрата:/i.test(String(row.text || '')));
  assert.equal(spendRows.length,1,`${label}: exactly one action-resource spend receipt exists`);
  const ids=rows.map(row => row && row.id).filter(Boolean);
  assert.equal(new Set(ids).size,ids.length,`${label}: emitted production log receipt IDs are unique`);
  return rows;
}

function runProductionJourney(engine, actors, world) {
  const {hero,roku,torgar,septih,legerem,foe} = actors;
  const club = inventoryEntry(hero,CLUB_ID);
  assert.ok(club,'the bought production club exists in the new hero inventory');

  assert.equal(engine.sheetEquipToggle(hero.id,club.id),true);
  assert.equal(hero.equipment.MAIN_HAND,club.id);
  assert.equal(engine.sheetEquipToggle(hero.id,club.id),true);
  assert.equal(hero.equipment.MAIN_HAND,undefined);
  assert.equal(engine.sheetEquipToggle(hero.id,club.id),true);
  assert.equal(hero.equipment.MAIN_HAND,club.id);
  const leather = inventoryEntry(septih,LEATHER_ID);
  assert.ok(leather && septih.equipment.CHEST === leather.id,'real Septih starts in leather armor');
  const septihAc = engine.acTotal(septih);
  assert.equal(engine.sheetEquipToggle(septih.id,leather.id),true);
  assert.notEqual(septih.equipment.CHEST,leather.id);
  assert.equal(engine.sheetEquipToggle(septih.id,leather.id),true);
  assert.equal(septih.equipment.CHEST,leather.id);
  assert.equal(engine.acTotal(septih),septihAc,'armor AC returns after remove/equip cycle');
  const equipmentCycleCommitted = hero.equipment.MAIN_HAND === club.id
    && septih.equipment.CHEST === leather.id && engine.acTotal(septih) === septihAc;
  assert.equal(equipmentCycleCommitted,true);
  stage(world,'equipment-cycle');

  stage(world,'scene-entry');
  const entries = [
    {kind:'ally',id:torgar.id,nat:20},
    {kind:'ally',id:legerem.id,nat:18},
    {kind:'ally',id:hero.id,nat:16},
    {kind:'foe',id:foe.id,nat:14},
    {kind:'ally',id:septih.id,nat:12},
    {kind:'ally',id:roku.id,nat:10},
  ];
  assert.equal(engine.combatStart(entries,`Интеграционный бой ${world.campaignId}`),true);
  assert.equal(engine.state().combat.order.length,6,'all five party members and the foe enter combat');

  advanceCombatTo(engine,`ally:${torgar.id}`);
  const torgarSlotBefore = torgar.slots['1'].cur;
  const torgarAcBefore = engine.acTotal(torgar);
  const spellActionBefore = combatActionState(engine,`ally:${torgar.id}`);
  const spellLogBefore = engine.state().combat.log.length;
  assert.equal(engine.combatCastSpell(SHIELD_OF_FAITH_ID),true);
  assert.equal(engine.castSpellApply(
    SHIELD_OF_FAITH_ID,torgar.id,`ally:${torgar.id}`,'',{substitute:true},'1',null,[],{},null,
  ),true,engine.elementText('saveStatus'));
  engine.closeCastModal();
  assert.equal(torgar.slots['1'].cur,torgarSlotBefore - 1,'spell slot commits exactly once');
  assert.equal(engine.acTotal(torgar),torgarAcBefore + 2,'Shield of Faith grants +2 AC');
  assert.ok(activeEffectBySource(torgar,SHIELD_OF_FAITH_ID),'concentration effect is attached');
  assert.equal(engine.state().combat.turn.bonusUsed,true,'Shield of Faith spends a bonus action');
  assert.equal(engine.state().combat.turn.actionsUsed,0,'bonus spell does not spend the action');
  const spellActionAfter = combatActionState(engine,`ally:${torgar.id}`);
  assertOnlyActionStateChanges(spellActionBefore,spellActionAfter,['bonusUsed','spellCasts','bonusSpellUsed'],'Shield of Faith');
  assert.equal(spellActionAfter.turn.spellCasts.length,spellActionBefore.turn.spellCasts.length + 1,
    'Shield of Faith records exactly one spell cast');
  assert.deepEqual(clone(spellActionAfter.turn.spellCasts.at(-1)),
    {id:SHIELD_OF_FAITH_ID,level:1,cost:'bonus'},'Shield of Faith cast receipt identifies the exact spell and cost');
  assert.equal(spellActionAfter.turn.bonusSpellUsed,true,'bonus-action spell restriction is recorded');
  assertSingleSpendReceipt(engine,spellLogBefore,`ally:${torgar.id}`,'Shield of Faith');
  const spellCommitted = torgar.slots['1'].cur === torgarSlotBefore - 1
    && engine.acTotal(torgar) === torgarAcBefore + 2 && Boolean(activeEffectBySource(torgar,SHIELD_OF_FAITH_ID));

  advanceCombatTo(engine,`ally:${legerem.id}`);
  const surgeEntry = legerem.abilities.find(row => row.abilityId === ACTION_SURGE_ID);
  const surgeBefore = surgeEntry.cur;
  const abilityActionBefore = combatActionState(engine,`ally:${legerem.id}`);
  const abilityLogBefore = engine.state().combat.log.length;
  assert.equal(engine.combatUseAbility(ACTION_SURGE_ID),true);
  assert.equal(engine.useAbilityApply(ACTION_SURGE_ID,legerem.id,`ally:${legerem.id}`,null),true,engine.elementText('saveStatus'));
  engine.closeCastModal();
  assert.equal(surgeEntry.cur,surgeBefore - 1,'Action Surge charge commits exactly once');
  assert.equal(engine.state().combat.turn.actionMax,2,'Action Surge grants exactly one additional action');
  assert.deepEqual(clone({
    actionsUsed:engine.state().combat.turn.actionsUsed,bonusUsed:engine.state().combat.turn.bonusUsed,
    objectUsed:engine.state().combat.turn.objectUsed,attacksUsed:engine.state().combat.turn.attacksUsed,
  }),{actionsUsed:0,bonusUsed:false,objectUsed:false,attacksUsed:0},'Action Surge itself spends no action, bonus, object, or attack');
  const abilityActionAfter = combatActionState(engine,`ally:${legerem.id}`);
  assertOnlyActionStateChanges(abilityActionBefore,abilityActionAfter,['actionMax'],'Action Surge');
  assert.equal(abilityActionAfter.turn.actionMax,abilityActionBefore.turn.actionMax + 1,
    'Action Surge changes exactly one action-capacity unit');
  assertSingleSpendReceipt(engine,abilityLogBefore,`ally:${legerem.id}`,'Action Surge');
  assert.equal(engine.combatSpend('action','Первое действие проверки',`ally:${legerem.id}`),true);
  assert.equal(engine.combatSpend('action','Второе действие проверки',`ally:${legerem.id}`),true);
  const thirdBefore = canonical(engine.state().combat.turn);
  assert.equal(engine.combatSpend('action','Недопустимое третье действие',`ally:${legerem.id}`),false);
  assert.equal(canonical(engine.state().combat.turn),thirdBefore,'rejected third action is mutation-free');
  assert.match(engine.elementText('saveStatus'),/недоступ|израсход|действ/i,'rejected action has a concrete UI explanation');
  const abilityCommitted = surgeEntry.cur === surgeBefore - 1;

  advanceCombatTo(engine,`ally:${hero.id}`);
  const potion = inventoryEntry(hero,POTION_ID);
  const potionQtyBefore = potion.qty;
  const heroHpBeforePotion = hero.hp;
  const potionActionBefore = combatActionState(engine,`ally:${hero.id}`);
  const potionLogBefore = engine.state().combat.log.length;
  assert.equal(engine.combatUseItem(potion.id,'drink','action'),true);
  const potionFormula = submitCurrentFormula(engine,`ally:${hero.id}`);
  const expectedPotionHp = Math.min(hero.hpMax,heroHpBeforePotion + potionFormula.outcome.healTotal);
  assert.equal(quantity(hero,POTION_ID),potionQtyBefore - 1,'potion is consumed exactly once');
  assert.equal(hero.hp,expectedPotionHp,'actual potion applies the player-entered healing exactly once');
  assert.equal(engine.state().combat.turn.actionsUsed,1,'potion consumes the current action');
  assert.deepEqual(clone({
    bonusUsed:engine.state().combat.turn.bonusUsed,objectUsed:engine.state().combat.turn.objectUsed,
    attacksUsed:engine.state().combat.turn.attacksUsed,
  }),{bonusUsed:false,objectUsed:false,attacksUsed:0},'potion causes no unrelated action-resource mutations');
  const potionActionAfter = combatActionState(engine,`ally:${hero.id}`);
  assertOnlyActionStateChanges(potionActionBefore,potionActionAfter,['actionsUsed','actionUsed','actionKind'],'healing potion');
  assert.equal(potionActionAfter.turn.actionsUsed,potionActionBefore.turn.actionsUsed + 1);
  assert.equal(potionActionAfter.turn.actionUsed,true);
  assert.equal(potionActionAfter.turn.actionKind,'other');
  assertSingleSpendReceipt(engine,potionLogBefore,`ally:${hero.id}`,'healing potion');
  const deniedWeaponBefore = canonical({combat:engine.state().combat,hero,foe});
  assert.equal(engine.combatWeapon(club.id,'melee','attack',false),false,'same-turn weapon attack is forbidden');
  assert.equal(canonical({combat:engine.state().combat,hero,foe}),deniedWeaponBefore,'forbidden weapon action changes no game state');
  assert.match(engine.elementText('saveStatus'),/недоступ|израсход|атак|действ/i,'forbidden weapon action is explained');
  const itemCommitted = quantity(hero,POTION_ID) === potionQtyBefore - 1 && hero.hp === expectedPotionHp;

  // Return to a fresh hero turn before committing the weapon attack. This is
  // deliberately a full round: the potion and club never share one action.
  advanceCombatTo(engine,`ally:${hero.id}`,24);
  if (engine.state().combat.turn.actionsUsed !== 0) {
    assert.equal(engine.combatNextTurn(),true);
    advanceCombatTo(engine,`ally:${hero.id}`,24);
  }
  const foeHpBeforeWeapon = foe.hp;
  const weaponActionBefore = combatActionState(engine,`ally:${hero.id}`);
  const weaponLogBefore = engine.state().combat.log.length;
  assert.equal(engine.combatWeapon(club.id,'melee','attack',false),true);
  const weaponFormula = submitCurrentFormula(engine,`foe:${foe.id}`);
  assert.equal(foe.hp,Math.max(0,foeHpBeforeWeapon - weaponFormula.outcome.dmgTotal),
    'production club applies the player-entered mitigated damage exactly once');
  assert.equal(engine.state().combat.turn.attacksUsed,1,'club spends one attack');
  assert.deepEqual(clone({
    actionsUsed:engine.state().combat.turn.actionsUsed,attacksUsed:engine.state().combat.turn.attacksUsed,
    bonusUsed:engine.state().combat.turn.bonusUsed,objectUsed:engine.state().combat.turn.objectUsed,
  }),{actionsUsed:1,attacksUsed:1,bonusUsed:false,objectUsed:false},'club consumes exactly one attack action and nothing else');
  const weaponActionAfter = combatActionState(engine,`ally:${hero.id}`);
  assertOnlyActionStateChanges(weaponActionBefore,weaponActionAfter,
    ['actionsUsed','actionUsed','actionKind','attacksUsed','attackActionTaken'],'club attack');
  assert.equal(weaponActionAfter.turn.actionsUsed,weaponActionBefore.turn.actionsUsed + 1);
  assert.equal(weaponActionAfter.turn.actionUsed,true);
  assert.equal(weaponActionAfter.turn.actionKind,'attack');
  assert.equal(weaponActionAfter.turn.attacksUsed,weaponActionBefore.turn.attacksUsed + 1);
  assert.equal(weaponActionAfter.turn.attackActionTaken,true);
  assertSingleSpendReceipt(engine,weaponLogBefore,`ally:${hero.id}`,'club attack');
  const weaponCommitted = foe.hp === Math.max(0,foeHpBeforeWeapon - weaponFormula.outcome.dmgTotal)
    && engine.state().combat.turn.attacksUsed === 1;
  stage(world,'item-spell-ability-and-weapon');

  advanceCombatTo(engine,`foe:${foe.id}`,24);
  const foeActions = engine.foeActionsOf(foe);
  const foeAction = foeActions.find(row => !row.area && (row.kind === 'attack' || row.save))
    || foeActions.find(row => row.kind === 'attack' || row.save);
  assert.ok(foeAction,`${foe.id}: a structured attack/save action exists`);
  const rokuBefore = actorCombatState(roku);
  const foeActorKey=`foe:${foe.id}`;
  const foeActionBefore = combatActionState(engine,foeActorKey);
  const foeLogBefore = engine.state().combat.log.length;
  assert.equal(engine.combatFoeAction(foeAction.id),true,`${foe.id}:${foeAction.id} opens production action`);
  const foeFormula = submitCurrentFormula(engine,`ally:${roku.id}`);
  if (Number.isFinite(foeFormula.outcome.dmgTotal) && foeFormula.outcome.dmgTotal > 0) {
    const absorbed = Math.min(Number(rokuBefore.hpTemp) || 0,foeFormula.outcome.dmgTotal);
    const expectedHp = Math.max(0,rokuBefore.hp - (foeFormula.outcome.dmgTotal - absorbed));
    assert.equal(roku.hp,expectedHp,`${foe.id}:${foeAction.id} applies declared damage exactly once`);
  }
  const foeConsequenceCommitted = canonical(actorCombatState(roku)) !== canonical(rokuBefore);
  assert.equal(foeConsequenceCommitted,true,`${foe.id}:${foeAction.id} has an actual target consequence`);
  const foeCost = foeAction.cost || (foeAction.kind === 'attack' ? 'attack' : 'action');
  const foeAllowedTurnKeys={
    action:['actionsUsed','actionUsed','actionKind','attacksUsed','foeUses'],
    attack:['actionsUsed','actionUsed','actionKind','attacksUsed','attackActionTaken','attackMax','foeAttacks','foeUses'],
    bonus:['bonusUsed','foeUses'],offhand:['bonusUsed','foeUses'],object:['objectUsed','foeUses'],
    reaction:['foeUses'],turnfree:['foeUses'],free:['foeUses'],long:['foeUses'],
  }[foeCost] || [];
  const foeActionAfter = combatActionState(engine,foeActorKey);
  assertOnlyActionStateChanges(foeActionBefore,foeActionAfter,foeAllowedTurnKeys,
    `${foe.id}:${foeAction.id}`,{allowReaction:foeCost === 'reaction'});
  assert.equal(foeActionAfter.turn.actionsUsed,foeActionBefore.turn.actionsUsed + (foeCost === 'action' || foeCost === 'attack' ? 1 : 0),
    'foe action capacity follows its declared cost exactly');
  assert.equal(foeActionAfter.turn.attacksUsed,foeActionBefore.turn.attacksUsed + (foeCost === 'attack' ? 1 : 0),
    'foe attack counter follows its declared cost exactly');
  assert.equal(foeActionAfter.turn.bonusUsed,foeActionBefore.turn.bonusUsed || foeCost === 'bonus' || foeCost === 'offhand',
    'foe bonus resource follows its declared cost exactly');
  assert.equal(foeActionAfter.turn.objectUsed,foeActionBefore.turn.objectUsed || foeCost === 'object',
    'foe object resource follows its declared cost exactly');
  assert.equal(foeActionAfter.reactionUsed,foeActionBefore.reactionUsed + (foeCost === 'reaction' ? 1 : 0),
    'foe reaction resource follows its declared cost exactly');
  assertSingleSpendReceipt(engine,foeLogBefore,foeActorKey,`${foe.id}:${foeAction.id}`);
  stage(world,'enemy-consequence');

  world.productionCombat = clone(engine.state().combat);
  world.foes = [foe];
  world.productionEvidence = {
    handlers:['sheetEquipToggle','combatCastSpell/castSpellApply','combatUseAbility/useAbilityApply',
      'combatUseItem/castConfirm/castFormulaConfirm','combatWeapon/castConfirm/castFormulaConfirm',
      'combatFoeAction/castConfirm/castFormulaConfirm'],
    playerDiceOnly:true,
    participants:{
      [hero.id]:['potion','club'],[roku.id]:['foe-target'],[torgar.id]:['spell'],
      [septih.id]:['armor-cycle'],[legerem.id]:['ability'],
    },
    sourceIds:{item:POTION_ID,spell:SHIELD_OF_FAITH_ID,ability:ACTION_SURGE_ID,weapon:CLUB_ID,foeAction:foeAction.id},
  };
  assert.deepEqual(Object.keys(world.productionEvidence.participants).sort(),actors.party.map(row => row.id).sort());
  const commits = {
    item:itemCommitted,spell:spellCommitted,ability:abilityCommitted,weapon:weaponCommitted,
    foeAction:foeConsequenceCommitted,equipmentCycles:equipmentCycleCommitted,
  };
  assert.ok(Object.values(commits).every(Boolean),'all reported production commits derive from observed state deltas');
  return {
    foeActionId:foeAction.id,commits,
    executedIds:{
      item:POTION_ID,spell:SHIELD_OF_FAITH_ID,ability:ACTION_SURGE_ID,weapon:CLUB_ID,
      foeDefinition:foe.id,foeAction:{foeId:foe.id,actionId:foeAction.id},
    },
  };
}

function kernelReject(error, meta) {
  return {success:false,reasonCode:error.code || 'ACTION_ERROR',message:String(error.message || error),phase:meta.phase};
}

async function assertKernelRollback(campaignId) {
  const probe = {charges:1,hp:10};
  const before = clone(probe);
  const kernel = new Actions.ActionKernel();
  const result = await kernel.execute({actionId:`${campaignId}:injected-persistence-failure`},{
    resolve:async () => ({id:'rollback-probe'}),
    context:async () => ({campaignId}),
    validate:async () => ({allowed:true,reasonCode:'ALLOWED',explanation:'Probe is valid.'}),
    snapshot:async () => clone(probe),
    prepare:async () => ({damage:4}),
    commit:async (prepared,token) => {
      token.commit('rollback-probe:charge',() => { probe.charges--; });
      return prepared;
    },
    consequences:async prepared => { probe.hp -= prepared.damage; return {success:true}; },
    persist:async () => ({ok:false,code:'WRITE_FAILED',reason:'Внедрённый отказ сохранения.'}),
    rollback:async snapshot => restoreObject(probe,snapshot),
    reject:kernelReject,
  });
  assert.equal(result.success,false);assert.equal(result.reasonCode,'WRITE_FAILED');
  assert.deepEqual(probe,before,`${campaignId}: a failed write rolls back resources and consequences`);
  assert.ok(result.message.trim(),`${campaignId}: failed write is explained`);
}

async function resolveTrapConsequence(world, actor, chest, scenario, {failPersistence=false}={}) {
  const kernel = world.kernel;
  const saveModifier = Math.floor(((Number(actor.ab?.dex) || 10) - 10) / 2);
  const input = {saveNatural:scenario.saveNatural,saveModifier,dc:chest.container.trap.saveDC,damage:scenario.damage};
  const transactionId = `${world.campaignId}:trap-consequence`;
  const beforeHp = actor.hp;
  const result = await kernel.execute({actionId:transactionId},{
    resolve:async () => ({id:chest.container.trap.type,kind:'trap'}),
    context:async () => ({actorId:actor.id,playerEntered:clone(input)}),
    validate:async () => ({
      allowed:chest.container.trap.triggered === true
        && Number.isInteger(input.saveNatural) && input.saveNatural >= 1 && input.saveNatural <= 20
        && Number.isInteger(input.damage) && input.damage >= 0,
      reasonCode:'TRAP_INPUT_REQUIRED',
      explanation:'Для ловушки нужны введённые игроком d20 спасброска и урон.',
    }),
    snapshot:async () => clone({actor,trapLedger:world.trapLedger}),
    prepare:async () => {
      const saveTotal = input.saveNatural + input.saveModifier;
      const saved = saveTotal >= input.dc;
      return {saveTotal,saved,appliedDamage:saved ? Math.floor(input.damage / 2) : input.damage};
    },
    commit:async (prepared,token) => {
      token.commit(`trap:${chest.id}:consequence`,() => {
        actor.hp = Math.max(0,actor.hp - prepared.appliedDamage);
        if (!prepared.saved && !actor.cond.includes('Отравленный')) actor.cond.push('Отравленный');
      });
      return prepared;
    },
    consequences:async prepared => {
      const receipt = {transactionId,sourceId:chest.id,actorId:actor.id,playerEntered:clone(input),...prepared,hpBefore:beforeHp,hpAfter:actor.hp};
      world.trapLedger.push(receipt);
      return {success:true,receipt};
    },
    persist:async () => failPersistence
      ? {ok:false,code:'WRITE_FAILED',reason:'Внедрённый отказ фиксации последствия ловушки.'}
      : {ok:true,receipt:{transactionId,revision:world.actionRevision++}},
    rollback:async snapshot => {
      restoreObject(actor,snapshot.actor);
      world.trapLedger = clone(snapshot.trapLedger);
    },
    reject:kernelReject,
  });
  if (failPersistence) {
    assert.equal(result.success,false);assert.equal(result.reasonCode,'WRITE_FAILED');assert.ok(result.message.trim());
    return result;
  }
  assert.equal(result.success,true);
  assert.equal(actor.hp,beforeHp - result.receipt.appliedDamage,'trap damage follows the declared save result');
  assert.deepEqual(result.receipt.playerEntered,input,'trap receipt preserves player-entered dice');
  return result.receipt;
}

function resolveMimicTransaction(engine, world, hero, event) {
  assert.equal(event.requiresCombatEngine,true,'mimic reveal requires a combat transaction');
  const mimic = {
    id:event.creatureInstanceId,instanceId:event.creatureInstanceId,definitionId:'system:chest-mimic',
    n:'Сундук-мимик',name:'Малый сундук-мимик',kind:'monster',hp:1,hpMax:1,hpTemp:0,ac:12,
    abil:{str:16,dex:12,con:14,int:5,wis:13,cha:8},saveP:{},saveBonuses:{},skills:{},profB:2,
    resist:[],vuln:[],immune:[],damageRules:[],condImmune:[],effectImmunities:[],
    movement:{walk:4.5},activeFx:[],cond:[],actionState:{},combatActions:[],
  };
  const transactionId = `${world.campaignId}:mimic-defeat`;
  const live = engine.state();
  engine.setState({
    chars:live.chars,journal:live.journal,items:live.items,spells:live.spells,abilities:live.abilities,
    races:live.races,classes:live.classes,rules:live.rules,foes:[...live.foes,mimic],
    activeCharId:hero.id,fxRound:live.fxRound,combat:engine.blankCombat(),
  });
  assert.equal(engine.combatStart([
    {kind:'ally',id:hero.id,nat:20},{kind:'foe',id:mimic.id,nat:10},
  ],`Мимик ${world.campaignId}`),true,'revealed mimic starts a real production combat');
  const club = inventoryEntry(hero,CLUB_ID);assert.ok(club && hero.equipment.MAIN_HAND === club.id);
  const hpBefore = mimic.hp,logBefore=engine.state().combat.log.length;
  const mimicActorKey=`ally:${hero.id}`;
  const mimicActionBefore=combatActionState(engine,mimicActorKey);
  assert.equal(engine.combatWeapon(club.id,'melee','attack',false),true,'mimic is attacked through production combatWeapon');
  const formula = submitCurrentFormula(engine,`foe:${mimic.id}`);
  assert.equal(mimic.hp,Math.max(0,hpBefore - formula.outcome.dmgTotal),'mimic receives the declared production damage exactly once');
  assert.equal(mimic.hp,0,'mimic is actually defeated before reward approval');
  assert.deepEqual(clone({
    actionsUsed:engine.state().combat.turn.actionsUsed,attacksUsed:engine.state().combat.turn.attacksUsed,
    bonusUsed:engine.state().combat.turn.bonusUsed,objectUsed:engine.state().combat.turn.objectUsed,
  }),{actionsUsed:1,attacksUsed:1,bonusUsed:false,objectUsed:false},'mimic attack spends exactly one attack action');
  const mimicActionAfter=combatActionState(engine,mimicActorKey);
  assertOnlyActionStateChanges(mimicActionBefore,mimicActionAfter,
    ['actionsUsed','actionUsed','actionKind','attacksUsed','attackActionTaken'],'mimic club attack');
  assert.equal(mimicActionAfter.turn.actionsUsed,mimicActionBefore.turn.actionsUsed + 1);
  assert.equal(mimicActionAfter.turn.attacksUsed,mimicActionBefore.turn.attacksUsed + 1);
  assert.equal(mimicActionAfter.turn.actionUsed,true);
  assert.equal(mimicActionAfter.turn.actionKind,'attack');
  assert.equal(mimicActionAfter.turn.attackActionTaken,true);
  assertSingleSpendReceipt(engine,logBefore,mimicActorKey,'mimic club attack');
  const receipt = {
    transactionId,sourceId:mimic.id,actorId:hero.id,
    handler:'combatWeapon→castConfirm→castFormulaConfirm',playerEntered:clone(formula.values),
    damage:formula.outcome.dmgTotal,hpBefore,hpAfter:mimic.hp,defeated:mimic.hp===0,
  };
  world.actionLog.push(receipt);world.productionCombat=clone(engine.state().combat);
  world.foes.push(mimic);
  return {mimic,receipt};
}

function approvedPayloadCheck(approved, itemIdSet) {
  if (!approved || !Array.isArray(approved.items)) {
    return {ok:false,reasonCode:'LOOT_APPROVAL_INVALID',explanation:'Утверждённая добыча имеет повреждённую структуру.'};
  }
  for (const row of approved.items) {
    if (!row || !itemIdSet.has(String(row.itemId || ''))) {
      return {ok:false,reasonCode:'UNKNOWN_ITEM_ID',explanation:`Добыча ссылается на неизвестный Item ID «${String(row?.itemId || '—')}».`};
    }
    if (!Number.isInteger(Number(row.qty)) || Number(row.qty) <= 0) {
      return {ok:false,reasonCode:'INVALID_LOOT_QUANTITY',explanation:`Количество ${String(row.itemId)} должно быть положительным целым.`};
    }
  }
  const copper = Number(approved.currency?.totalCopper);
  if (!Number.isSafeInteger(copper) || copper < 0) {
    return {ok:false,reasonCode:'INVALID_LOOT_CURRENCY',explanation:'Сумма валюты добычи должна быть неотрицательным целым числом меди.'};
  }
  return {ok:true};
}

function approvedLootOf(source, mimicDefeatReceipt, itemIdSet) {
  if (source?.kind === 'container') {
    const loot = source.container?.loot;
    if (source.state !== 'opened') return {ok:false,reasonCode:'CHEST_NOT_OPEN',explanation:'Сначала сундук нужно открыть.'};
    if (loot && loot.claimedByActorId) return {ok:false,reasonCode:'LOOT_ALREADY_CLAIMED',explanation:'Добыча из этого сундука уже получена.'};
    if (!loot || loot.status !== 'approved' || !loot.approved) return {ok:false,reasonCode:'LOOT_NOT_APPROVED',explanation:'У сундука нет утверждённой добычи.'};
    const payload=approvedPayloadCheck(loot.approved,itemIdSet);if(!payload.ok)return payload;
    return {ok:true,kind:'container-approved-loot',approved:clone(loot.approved)};
  }
  if (source?.kind === 'defeated-creature-loot') {
    if (!mimicDefeatReceipt || mimicDefeatReceipt.transactionId !== source.defeatTransactionId
      || mimicDefeatReceipt.sourceId !== source.creatureInstanceId || mimicDefeatReceipt.defeated !== true) {
      return {ok:false,reasonCode:'CREATURE_NOT_DEFEATED',explanation:'Награда существа недоступна без подтверждённой победы.'};
    }
    if (!source.approved) return {ok:false,reasonCode:'LOOT_NOT_APPROVED',explanation:'Награда существа не утверждена.'};
    if (source.claimedByActorId) return {ok:false,reasonCode:'LOOT_ALREADY_CLAIMED',explanation:'Награда существа уже получена.'};
    const payload=approvedPayloadCheck(source.approved,itemIdSet);if(!payload.ok)return payload;
    return {ok:true,kind:'defeated-creature-approved-loot',approved:clone(source.approved)};
  }
  return {ok:false,reasonCode:'UNAPPROVED_LOOT_SOURCE',explanation:'Источник не имеет утверждённого контракта добычи.'};
}

async function claimApprovedLoot(world, hero, source, mimicDefeatReceipt) {
  const actionId = `${world.campaignId}:claim:${source.id}`;
  return world.kernel.execute({actionId},{
    resolve:async () => ({id:source.id,kind:source.kind}),
    context:async () => ({actorId:hero.id}),
    validate:async () => {
      const admission = approvedLootOf(source,mimicDefeatReceipt,world.itemIdSet);
      return admission.ok
        ? {allowed:true,reasonCode:'ALLOWED',explanation:'Утверждённая добыча готова к единому коммиту.',admission}
        : {allowed:false,...admission};
    },
    snapshot:async () => clone({inventory:hero.inventory,wallet:hero.wallet,source,lootLedger:world.lootLedger}),
    prepare:async (_intent,_definition,_context,evaluation) => {
      const approved = evaluation.admission.approved;
      const items = (approved.items || []).map(row => ({itemId:String(row.itemId),qty:Number(row.qty)}));
      assert.ok(items.every(row => row.itemId && Number.isInteger(row.qty) && row.qty > 0),'approved loot item contract');
      return {items,copper:Number(approved.currency?.totalCopper) || 0,sourceKind:evaluation.admission.kind};
    },
    commit:async (prepared,token) => {
      // A single ResourceCommitToken key covers items, currency, source marker,
      // and ledger so no observer can see a partially claimed reward.
      token.commit(`loot:${source.id}:atomic-claim`,() => {
        prepared.items.forEach((row,index) => addInventory(hero,row.itemId,row.qty,`${actionId}:item:${index}`));
        hero.wallet.balances.mm = String(BigInt(hero.wallet.balances.mm || 0) + BigInt(prepared.copper));
        hero.wallet.version++;
        if (source.kind === 'container') {
          source.container.loot.claimedByActorId = hero.id;
          source.container.loot.status = 'claimed';
        } else source.claimedByActorId = hero.id;
        world.lootLedger.push({actionId,sourceId:source.id,actorId:hero.id,items:clone(prepared.items),copper:prepared.copper});
      });
      return prepared;
    },
    consequences:async prepared => ({success:true,sourceId:source.id,items:clone(prepared.items),copper:prepared.copper}),
    persist:async () => {
      if (world.failNextLootPersist) {
        delete world.failNextLootPersist;
        return {ok:false,code:'WRITE_FAILED',reason:'Внедрённый отказ фиксации добычи.'};
      }
      return {ok:true,receipt:{transactionId:actionId,revision:world.actionRevision++}};
    },
    rollback:async snapshot => {
      hero.inventory = clone(snapshot.inventory);hero.wallet = clone(snapshot.wallet);
      restoreObject(source,snapshot.source);world.lootLedger=clone(snapshot.lootLedger);
    },
    reject:kernelReject,
  });
}

async function runChestJourney(engine, world, hero, scenario, aggregate) {
  const lootCatalog = [{id:POTION_ID,name:'Зелье лечения',rarity:'common',kind:'potion',tags:['integration','consumable'],minLevel:1,maxLevel:20}];
  let chest;
  if (scenario.mimic) {
    chest = Chests.createChest({
      id:`chest-${world.campaignId}`,templateId:'mimic',placement:{placed:true,sceneId:world.scene.id},
      creature:{instanceId:`mimic-${world.campaignId}`,definitionId:'system:chest-mimic'},
    });
  } else {
    chest = Chests.createChest({
      id:`chest-${world.campaignId}`,templateId:'trapped-vault',placement:{placed:true,sceneId:world.scene.id},
      recommendedLevel:20,rewardLevel:5,itemCount:1,rewardMode:'fixed',lockType:'simple',lockDC:12,
      trap:{enabled:true,detectionDC:12,disarmDC:12,saveDC:12,damageFormula:'1d6',damageType:'poison'},
    });
  }
  world.chests.push(chest);
  stage(world,'chest-found');

  let lockChecked = false;
  let trapChecked = false;
  if (!scenario.mimic) {
    const invalidBefore = canonical(chest);
    const invalid = Chests.replaceLootDraft(chest,lootCatalog,{items:[{itemId:`missing:${world.campaignId}`,qty:1}],currency:{gp:1}});
    assert.equal(invalid.ok,false);assert.match(invalid.issues.join(' '),/UNKNOWN_ITEM_ID/);
    assert.equal(canonical(chest),invalidBefore,'invalid Item ID changes no chest state');
    let drafted = Chests.replaceLootDraft(chest,lootCatalog,{items:[{itemId:POTION_ID,qty:2}],currency:{gp:1},notes:'Фиксированная добыча'});
    assert.equal(drafted.ok,true);let approved = Chests.approveLoot(drafted.chest,lootCatalog);assert.equal(approved.ok,true);
    chest = approved.chest;

    if (scenario.failCheck) {
      const failed = Chests.applyAction(chest,'check',{actorId:hero.id,total:1});
      assert.equal(failed.success,false);assert.ok(failed.code);assert.ok(failed.message.trim().length >= 8);
      assert.equal(failed.chest.container.trap.detected,false);chest=failed.chest;
    }
    const checked = Chests.applyAction(chest,'check',{actorId:hero.id,total:20});
    assert.equal(checked.success,true);assert.equal(checked.chest.container.trap.detected,true);chest=checked.chest;trapChecked=true;
    if (scenario.failDisarm) {
      const failed = Chests.applyAction(chest,'disarm',{actorId:hero.id,total:1});
      assert.equal(failed.success,false);assert.ok(failed.code);assert.ok(failed.message.trim().length >= 8);
      assert.equal(failed.chest.container.trap.disarmed,false);chest=failed.chest;
    }
    if (!scenario.trigger) {
      const disarmed = Chests.applyAction(chest,'disarm',{actorId:hero.id,total:20});
      assert.equal(disarmed.success,true);assert.equal(disarmed.chest.container.trap.disarmed,true);chest=disarmed.chest;
    }
    if (scenario.failPick) {
      const failed = Chests.applyAction(chest,'pick',{actorId:hero.id,total:1});
      assert.equal(failed.success,false);assert.ok(failed.code);assert.ok(failed.message.trim().length >= 8);
      assert.equal(failed.chest.container.lock.opened,false);chest=failed.chest;
    }
    const picked = Chests.applyAction(chest,'pick',{actorId:hero.id,total:20});
    assert.equal(picked.success,true);assert.equal(picked.chest.container.lock.opened,true);chest=picked.chest;lockChecked=true;
  } else {
    const check = Chests.applyAction(chest,'check',{actorId:hero.id,total:scenario.failCheck ? 1 : 20});
    assert.equal(check.ok,true);chest=check.chest;trapChecked=true;
    for (const action of ['pick','disarm']) {
      const blocked = Chests.evaluateAction(chest,action,{actorId:hero.id,actorAlive:true});
      assert.equal(blocked.allowed,false);assert.ok(blocked.reasonCode);assert.ok(blocked.explanation.trim().length >= 8);
    }
    lockChecked=true;
  }
  world.chests[0]=chest;
  stage(world,'lock-and-trap-check');

  const opened = Chests.applyAction(chest,'open',{actorId:hero.id});
  assert.equal(opened.success,true);chest=opened.chest;world.chests[0]=chest;
  let lootSource=chest,mimicDefeatReceipt=null;
  if (scenario.mimic) {
    const mimic = resolveMimicTransaction(engine,world,hero,opened.event);
    mimicDefeatReceipt=mimic.receipt;
    lootSource={
      id:`loot-${mimic.mimic.id}`,kind:'defeated-creature-loot',creatureInstanceId:mimic.mimic.id,
      defeatTransactionId:mimic.receipt.transactionId,
      approved:{items:[{itemId:POTION_ID,qty:2}],currency:{totalCopper:100},notes:'Явная награда побеждённого мимика'},
      claimedByActorId:null,
    };
    world.defeatedCreatureLoot.push(lootSource);
  } else if (opened.event.trapTriggered) {
    const failedTrapBefore = canonical({hero,ledger:world.trapLedger,revision:world.actionRevision});
    const failedTrap = await resolveTrapConsequence(world,hero,chest,scenario,{failPersistence:true});
    assert.equal(failedTrap.success,false);assert.equal(failedTrap.reasonCode,'WRITE_FAILED');
    assert.equal(canonical({hero,ledger:world.trapLedger,revision:world.actionRevision}),failedTrapBefore,
      'failed trap persistence rolls back the player-entered damage transaction');
    await resolveTrapConsequence(world,hero,chest,scenario);
    aggregate.trapConsequences++;
  }
  const repeatOpen = Chests.evaluateAction(chest,'open',{actorId:hero.id,actorAlive:true});
  assert.equal(repeatOpen.allowed,false);assert.ok(repeatOpen.reasonCode);assert.ok(repeatOpen.explanation.trim().length >= 8);
  stage(world,'chest-or-mimic-resolution');

  const lootQtyBefore = quantity(hero,POTION_ID);
  const walletBefore = BigInt(world.economy.totalMinor(hero.wallet));
  const corruptSource = clone(lootSource);
  if (corruptSource.kind === 'container') corruptSource.container.loot.approved.items=[{itemId:`missing:${world.campaignId}`,qty:1}];
  else corruptSource.approved.items=[{itemId:`missing:${world.campaignId}`,qty:1}];
  const corruptBefore = canonical({hero,ledger:world.lootLedger});
  const corruptClaim = await claimApprovedLoot(world,hero,corruptSource,mimicDefeatReceipt);
  assert.equal(corruptClaim.success,false);assert.equal(corruptClaim.reasonCode,'UNKNOWN_ITEM_ID');
  assert.match(corruptClaim.message,/Item ID|неизвест/i);assert.equal(canonical({hero,ledger:world.lootLedger}),corruptBefore);
  const invalidQtySource=clone(lootSource);
  if(invalidQtySource.kind === 'container') invalidQtySource.container.loot.approved.items=[{itemId:POTION_ID,qty:0}];
  else invalidQtySource.approved.items=[{itemId:POTION_ID,qty:0}];
  const invalidQtyBefore=canonical({hero,ledger:world.lootLedger,revision:world.actionRevision});
  const invalidQtyClaim=await claimApprovedLoot(world,hero,invalidQtySource,mimicDefeatReceipt);
  assert.equal(invalidQtyClaim.success,false);assert.equal(invalidQtyClaim.reasonCode,'INVALID_LOOT_QUANTITY');
  assert.ok(invalidQtyClaim.message.trim().length >= 8);
  assert.equal(canonical({hero,ledger:world.lootLedger,revision:world.actionRevision}),invalidQtyBefore,
    'invalid loot quantity is rejected without mutation');
  const negativeCopperSource=clone(lootSource);
  if(negativeCopperSource.kind === 'container') negativeCopperSource.container.loot.approved.currency.totalCopper=-1;
  else negativeCopperSource.approved.currency.totalCopper=-1;
  const negativeCopperBefore=canonical({hero,ledger:world.lootLedger,revision:world.actionRevision});
  const negativeCopperClaim=await claimApprovedLoot(world,hero,negativeCopperSource,mimicDefeatReceipt);
  assert.equal(negativeCopperClaim.success,false);assert.equal(negativeCopperClaim.reasonCode,'INVALID_LOOT_CURRENCY');
  assert.ok(negativeCopperClaim.message.trim().length >= 8);
  assert.equal(canonical({hero,ledger:world.lootLedger,revision:world.actionRevision}),negativeCopperBefore,
    'negative loot currency is rejected without mutation');
  const failedClaimBefore = canonical({hero,source:lootSource,ledger:world.lootLedger,revision:world.actionRevision});
  world.failNextLootPersist=true;
  const failedClaim = await claimApprovedLoot(world,hero,lootSource,mimicDefeatReceipt);
  assert.equal(failedClaim.success,false);assert.equal(failedClaim.reasonCode,'WRITE_FAILED');assert.ok(failedClaim.message.trim());
  assert.equal(canonical({hero,source:lootSource,ledger:world.lootLedger,revision:world.actionRevision}),failedClaimBefore,
    'failed loot persistence rolls back the entire atomic claim');
  const claimed = await claimApprovedLoot(world,hero,lootSource,mimicDefeatReceipt);
  assert.equal(claimed.success,true,claimed.message);
  assert.equal(quantity(hero,POTION_ID),lootQtyBefore + 2);
  assert.equal(BigInt(world.economy.totalMinor(hero.wallet)),walletBefore + 100n);
  aggregate.lootClaims++;
  const duplicateBefore = canonical({hero,source:lootSource,ledger:world.lootLedger});
  const duplicate = await claimApprovedLoot(world,hero,lootSource,mimicDefeatReceipt);
  assert.equal(duplicate.success,false);assert.equal(duplicate.reasonCode,'LOOT_ALREADY_CLAIMED');
  assert.ok(duplicate.message.trim().length >= 8);
  assert.equal(canonical({hero,source:lootSource,ledger:world.lootLedger}),duplicateBefore,'duplicate loot claim is mutation-free');
  aggregate.duplicateLootRejections++;
  stage(world,'loot-claimed');
  return {
    resolution:scenario.mimic?'mimic':'chest',lockChecked,trapChecked,lootSource,mimicDefeatReceipt,
    mimicProductionWeaponCommits:scenario.mimic ? 1 : 0,
  };
}

async function runCampaign(index, engine, catalog, buckets, aggregate, setVmTime) {
  const foeDefinition = engine.catalogs.foes[index % engine.catalogs.foes.length];
  const matrix = campaignConfiguration(index,foeDefinition.id);
  const configuration = matrix.value;
  const campaignId = `integration-campaign-${String(index + 1).padStart(3,'0')}`;
  const fingerprint = sha256(configuration);
  const now = new Date(Date.UTC(2026,8,2,0,index,0)).toISOString();
  setVmTime(now);

  const actors = prepareRuntimeState(engine,campaignId,matrix.profile,foeDefinition);
  const {hero,party} = actors;
  let sequence = 0;
  const economyJournal = [];
  const merchantTransactions = [];
  const economy = new Economy.CurrencyService({
    currencies:Economy.DND5E_CURRENCIES,journal:economyJournal,clock:() => now,
    idFactory:() => `${campaignId}:money:${++sequence}`,
  });
  hero.wallet = Economy.createWallet(`character:${campaignId}`,Economy.DND5E_RULESET,{pm:'20',zm:'5',sm:'10'});
  const definitions = [CLUB_ID,LEATHER_ID,POTION_ID]
    .map((id,offset) => projectedTradeItem(engine.catalogs.items.find(row => row.id === id),index + offset));
  const serviceItemMap = new Map(definitions.map(row => [row.id,row]));
  const merchantTemplate = integrationMerchantTemplate(matrix.merchant);
  const merchantService = new Merchants.MerchantService({
    economy,templates:[merchantTemplate],itemResolver:id => serviceItemMap.get(id) || null,listItems:() => definitions,
    priceResolver:item => ({ok:true,amountMinor:item.priceMinor}),journal:merchantTransactions,clock:() => now,
    idFactory:() => `${campaignId}:merchant:${++sequence}`,
  });
  const merchant = merchantService.createInstance(merchantTemplate.id,{id:`merchant-${campaignId}`,name:matrix.merchant.profession});
  const world = {
    schemaVersion:'dnd-world-world-snapshot/1',snapshotRevision:0,campaignId,
    configuration:clone(configuration),configurationFingerprint:fingerprint,
    catalogRefs:[{id:'local-runtime',version:'production-audited'},{id:'bg3',version:catalog.current.catalogVersion,profile:'standard'}],
    catalogAdmissions:{item:[],spell:[],ability:[]},
    party,activeCharacterId:hero.id,
    scene:{id:`scene-${campaignId}`,name:`Сцена ${index + 1}`,npcIds:[merchant.id],enemyInstanceIds:[actors.foe.id],visitedNpcIds:[],dialogue:[]},
    merchantState:{schemaVersion:Merchants.MERCHANT_STATE_SCHEMA,instances:[merchant],transactions:merchantTransactions},
    economyJournal,chests:[],foes:[actors.foe],defeatedCreatureLoot:[],lootLedger:[],trapLedger:[],actionLog:[],actionRevision:0,
    productionCombat:null,productionEvidence:null,stageLog:[],continuation:{turns:0,lastAction:null},
    persistenceMode:'repository reconstruction; real browser reload is covered by the separate Playwright black-box run',
  };
  Object.defineProperties(world,{
    kernel:{value:new Actions.ActionKernel(),enumerable:false,configurable:true},
    economy:{value:economy,enumerable:false,configurable:true},
    itemIdSet:{value:new Set(catalog.items.map(row => row.id)),enumerable:false,configurable:true},
  });

  stage(world,'campaign-start');
  assert.equal(world.party.length,5,'one fresh buildBlank hero plus four real built-in builders');
  assert.equal(new Set(world.party.map(row => row.id)).size,5,'party IDs are unique');
  stage(world,'starting-grants');
  assert.ok(BigInt(economy.totalMinor(hero.wallet)) > 0n && quantity(hero,POTION_ID) === 2 && quantity(hero,LEATHER_ID) === 2);

  // Catalog coverage is an audited admission ledger. It intentionally does not
  // call a generic action and never labels definition assignment as execution.
  const gameplayBeforeAdmission = canonical({hero,merchant,foe:actors.foe});
  for (const kind of ['item','spell','ability']) {
    for (const record of buckets[kind][index]) {
      world.catalogAdmissions[kind].push({
        id:record.id,domain:record.domain,admission:record.admission,executableClaim:false,
        reasonCode:record.reasonCode,explanation:record.explanation,
      });
      aggregate.seen[kind].add(record.id);
      aggregate.admissions[record.admission] = (aggregate.admissions[record.admission] || 0) + 1;
      assert.ok(record.reasonCode && record.explanation.trim().length >= 8,`${record.id}: admission/refusal is explicit`);
    }
  }
  assert.equal(canonical({hero,merchant,foe:actors.foe}),gameplayBeforeAdmission,'catalog admission mutates no gameplay state');

  stage(world,'merchant-visit');
  world.scene.visitedNpcIds.push(merchant.id);world.scene.dialogue.push({npcId:merchant.id,text:'Покажи товары.'});
  const totalAssets = () => BigInt(economy.totalMinor(hero.wallet)) + BigInt(economy.totalMinor(merchant.wallet));
  let moneyBefore = totalAssets();
  let heroMoneyBefore = BigInt(economy.totalMinor(hero.wallet));
  let merchantMoneyBefore = BigInt(economy.totalMinor(merchant.wallet));
  const clubUniverseBefore = quantity(hero,CLUB_ID) + stockQuantity(merchant,CLUB_ID);
  const bought = await merchantService.buy({
    instance:merchant,character:hero,characterAccount:hero.wallet,itemId:CLUB_ID,quantity:1,
    requestId:`${campaignId}:buy`,userId:hero.id,reason:'Покупка дубинки',
  });
  const buyAmount = BigInt(bought.quote?.totalMinor || 0);
  const buyCommitted = bought.ok === true && buyAmount > 0n && totalAssets() === moneyBefore
    && BigInt(economy.totalMinor(hero.wallet)) === heroMoneyBefore - buyAmount
    && BigInt(economy.totalMinor(merchant.wallet)) === merchantMoneyBefore + buyAmount
    && quantity(hero,CLUB_ID) + stockQuantity(merchant,CLUB_ID) === clubUniverseBefore
    && quantity(hero,CLUB_ID) === 1;
  assert.equal(buyCommitted,true,bought.message || 'buy must transfer one club atomically');
  const duplicateBuyBefore = canonical({hero,merchant,economyJournal,merchantTransactions});
  const duplicateBuy = await merchantService.buy({
    instance:merchant,character:hero,characterAccount:hero.wallet,itemId:CLUB_ID,quantity:1,
    requestId:`${campaignId}:buy`,userId:hero.id,reason:'Повтор запроса',
  });
  const duplicateBuyRejected = duplicateBuy.ok === false && duplicateBuy.reason === 'duplicate-request'
    && canonical({hero,merchant,economyJournal,merchantTransactions}) === duplicateBuyBefore;
  assert.equal(duplicateBuyRejected,true,duplicateBuy.message || 'duplicate buy is atomic and mutation-free');
  stage(world,'merchant-buy');

  moneyBefore=totalAssets();heroMoneyBefore=BigInt(economy.totalMinor(hero.wallet));merchantMoneyBefore=BigInt(economy.totalMinor(merchant.wallet));
  const leatherUniverseBefore = quantity(hero,LEATHER_ID) + stockQuantity(merchant,LEATHER_ID);
  const sold = await merchantService.sell({
    instance:merchant,character:hero,characterAccount:hero.wallet,itemId:LEATHER_ID,quantity:1,
    requestId:`${campaignId}:sell-start`,userId:hero.id,reason:'Продажа стартового предмета',
  });
  const sellAmount = BigInt(sold.quote?.totalMinor || 0);
  const sellCommitted = sold.ok === true && sellAmount > 0n && totalAssets() === moneyBefore
    && BigInt(economy.totalMinor(hero.wallet)) === heroMoneyBefore + sellAmount
    && BigInt(economy.totalMinor(merchant.wallet)) === merchantMoneyBefore - sellAmount
    && quantity(hero,LEATHER_ID) + stockQuantity(merchant,LEATHER_ID) === leatherUniverseBefore
    && quantity(hero,LEATHER_ID) === 1;
  assert.equal(sellCommitted,true,sold.message || 'sell must transfer one item atomically');
  stage(world,'merchant-sell');

  const exchangeBefore = BigInt(economy.totalMinor(hero.wallet));
  const exchangeBalancesBefore = clone(hero.wallet.balances);
  const exchanged = await economy.exchange(hero.wallet,{currencyId:'zm',amount:'1'},'sm','reject',{
    userId:hero.id,reason:'Размен у торговца',idempotencyKey:`${campaignId}:exchange`,
  });
  const currencyExchangeCommitted = exchanged.ok === true && BigInt(economy.totalMinor(hero.wallet)) === exchangeBefore
    && BigInt(hero.wallet.balances.zm) === BigInt(exchangeBalancesBefore.zm) - 1n
    && BigInt(hero.wallet.balances.sm) === BigInt(exchangeBalancesBefore.sm) + 10n
    && ['mm','em','pm'].every(key => String(hero.wallet.balances[key]) === String(exchangeBalancesBefore[key]));
  assert.equal(currencyExchangeCommitted,true,exchanged.message || 'currency exchange preserves value');
  stage(world,'currency-exchange');

  const productionJourney = runProductionJourney(engine,actors,world);
  const chestResult = await runChestJourney(engine,world,hero,matrix.chest,aggregate);
  aggregate.productionExecutedIds.items.add(productionJourney.executedIds.item);
  aggregate.productionExecutedIds.spells.add(productionJourney.executedIds.spell);
  aggregate.productionExecutedIds.abilities.add(productionJourney.executedIds.ability);
  aggregate.productionExecutedIds.weapons.add(productionJourney.executedIds.weapon);
  aggregate.productionExecutedIds.foeDefinitions.add(productionJourney.executedIds.foeDefinition);
  aggregate.productionExecutedIds.foeActions.set(
    productionJourney.executedIds.foeAction.foeId,productionJourney.executedIds.foeAction.actionId,
  );
  if (chestResult.resolution === 'mimic') aggregate.productionExecutedIds.mimicDefinitions.add('system:chest-mimic');

  moneyBefore=totalAssets();heroMoneyBefore=BigInt(economy.totalMinor(hero.wallet));merchantMoneyBefore=BigInt(economy.totalMinor(merchant.wallet));
  const heroLootBeforeResale = quantity(hero,POTION_ID);
  const lootUniverseBefore = quantity(hero,POTION_ID) + stockQuantity(merchant,POTION_ID);
  const resold = await merchantService.sell({
    instance:merchant,character:hero,characterAccount:hero.wallet,itemId:POTION_ID,quantity:1,
    requestId:`${campaignId}:sell-loot`,userId:hero.id,reason:'Продажа части добычи',
  });
  const lootResaleAmount = BigInt(resold.quote?.totalMinor || 0);
  const lootResaleCommitted = resold.ok === true && lootResaleAmount > 0n && totalAssets() === moneyBefore
    && BigInt(economy.totalMinor(hero.wallet)) === heroMoneyBefore + lootResaleAmount
    && BigInt(economy.totalMinor(merchant.wallet)) === merchantMoneyBefore - lootResaleAmount
    && quantity(hero,POTION_ID) + stockQuantity(merchant,POTION_ID) === lootUniverseBefore
    && quantity(hero,POTION_ID) === heroLootBeforeResale - 1;
  assert.equal(lootResaleCommitted,true,resold.message || 'loot resale must transfer one item atomically');
  stage(world,'loot-resold');

  const unknownBefore = canonical({hero,merchant,economyJournal,merchantTransactions});
  const unknown = await merchantService.buy({
    instance:merchant,character:hero,characterAccount:hero.wallet,itemId:`missing:${campaignId}`,quantity:1,
    requestId:`${campaignId}:unknown-item`,userId:hero.id,reason:'Проверка неизвестного Item ID',
  });
  assert.equal(unknown.ok,false);assert.equal(unknown.reason,'unknown-item');assert.ok(unknown.message.trim());
  assert.equal(canonical({hero,merchant,economyJournal,merchantTransactions}),unknownBefore,'unknown Item ID cannot cause a partial trade');
  await assertKernelRollback(campaignId);

  const adapter = new Persistence.MemoryAdapter();
  const repository = new Persistence.EnvelopeRepository({adapter,clock:() => now,idFactory:() => `${campaignId}:save:${++sequence}`});
  const beforeFailedWrite = canonical(world);adapter.failNextSet=true;
  const failedWrite = await repository.commit({campaignId,expectedRevision:-1,state:world,transactionId:`${campaignId}:failed-write`});
  assert.equal(failedWrite.ok,false);assert.equal(failedWrite.code,'WRITE_FAILED');
  assert.ok(String(failedWrite.reason || failedWrite.message || '').trim().length >= 8,'failed write has a concrete explanation');
  assert.equal(canonical(world),beforeFailedWrite,'failed durable write leaves live world untouched');
  assert.equal(await adapter.get(repository.key),null,'failed first write creates no partial envelope');

  stage(world,'campaign-saved');
  const stateAtSave = canonical(world);
  const effectsAtSave = canonical({
    party:world.party.map(row => ({id:row.id,activeFx:row.activeFx || []})),
    foes:world.foes.map(row => ({id:row.id,activeFx:row.activeFx || []})),
  });
  const inventoryCurrencyAtSave = canonical({
    party:world.party.map(row => ({id:row.id,inventory:row.inventory,wallet:row.wallet || null})),
    merchant:world.merchantState,
  });
  const saved = await repository.commit({campaignId,expectedRevision:-1,state:world,transactionId:`${campaignId}:save`});
  assert.equal(saved.ok,true);assert.equal(saved.receipt.revision,0);
  const durableBeforeStale = await adapter.get(repository.key);
  const stale = await repository.commit({
    campaignId,expectedRevision:-1,state:Object.assign(clone(world),{tampered:true}),transactionId:`${campaignId}:stale`,
  });
  assert.equal(stale.ok,false);assert.equal(stale.code,'REVISION_CONFLICT');
  assert.ok(String(stale.reason || stale.message || '').trim().length >= 8,'stale revision rejection is explained');
  assert.equal(await adapter.get(repository.key),durableBeforeStale,'stale revision cannot partially overwrite the envelope');

  // This is a fresh repository/application service reconstruction over the
  // same durable adapter. Browser page.reload() is intentionally a separate
  // black-box Playwright claim and is not counterfeited by the VM matrix.
  const restartedRepository = new Persistence.EnvelopeRepository({adapter,clock:() => now,idFactory:() => `${campaignId}:restart:${++sequence}`});
  const restartedRead = await restartedRepository.read();
  assert.equal(restartedRead.ok,true);assert.equal(restartedRead.revision,0);
  const restored = clone(restartedRead.envelope.state);
  assert.equal(canonical(restored),stateAtSave,'repository reconstruction preserves the complete world');
  const effectsRestored = canonical({
    party:restored.party.map(row => ({id:row.id,activeFx:row.activeFx || []})),
    foes:restored.foes.map(row => ({id:row.id,activeFx:row.activeFx || []})),
  });
  const inventoryCurrencyRestored = canonical({
    party:restored.party.map(row => ({id:row.id,inventory:row.inventory,wallet:row.wallet || null})),
    merchant:restored.merchantState,
  });
  assert.equal(effectsRestored,effectsAtSave,'spell/effect state survives repository reconstruction');
  assert.equal(inventoryCurrencyRestored,inventoryCurrencyAtSave,'inventory and currency survive repository reconstruction');
  const restoredTorgar = restored.party.find(row => row.id === 'char_torgar');
  assert.ok(activeEffectBySource(restoredTorgar,SHIELD_OF_FAITH_ID),'Shield of Faith remains active after reconstruction');

  const restartedEconomy = new Economy.CurrencyService({
    currencies:Economy.DND5E_CURRENCIES,journal:restored.economyJournal,clock:() => now,
    idFactory:() => `${campaignId}:continued-money:${++sequence}`,
  });
  const restoredHero = restored.party.find(row => row.id === hero.id);
  const continuedBefore = BigInt(restartedEconomy.totalMinor(restoredHero.wallet));
  const continuedExchange = await restartedEconomy.exchange(restoredHero.wallet,{currencyId:'zm',amount:'1'},'sm','reject',{
    userId:restoredHero.id,reason:'Продолжение после реконструкции',idempotencyKey:`${campaignId}:continued-exchange`,
  });
  assert.equal(continuedExchange.ok,true,continuedExchange.message);
  assert.equal(BigInt(restartedEconomy.totalMinor(restoredHero.wallet)),continuedBefore,'continued exchange preserves value');
  restored.continuation.turns++;restored.continuation.lastAction='exchange-after-reconstruction';restored.snapshotRevision=1;
  stage(restored,'application-restarted-and-continued');
  const continued = await restartedRepository.commit({campaignId,expectedRevision:0,state:restored,transactionId:`${campaignId}:continued`});
  assert.equal(continued.ok,true);assert.equal(continued.receipt.revision,1);
  const finalRead = await restartedRepository.read();assert.equal(finalRead.ok,true);assert.equal(finalRead.revision,1);
  assert.equal(canonical(finalRead.envelope.state),canonical(restored),'continued world is durably saved without loss');
  assert.deepEqual(restored.stageLog,REQUIRED_STAGES);

  const perCampaignCommits = Object.fromEntries(Object.entries(productionJourney.commits).map(([key,committed]) => [key,committed ? 1 : 0]));
  const receipt = {
    campaignId,fingerprint,configuration:clone(configuration),stages:clone(restored.stageLog),
    productionCommits:perCampaignCommits,
    trade:{buy:buyCommitted,sell:sellCommitted,lootResale:lootResaleCommitted,atomicityChecked:duplicateBuyRejected},
    currencyExchange:currencyExchangeCommitted,
    chest:{lockChecked:chestResult.lockChecked,trapChecked:chestResult.trapChecked,resolution:chestResult.resolution},
    loot:{claimed:true,duplicateRejected:true},
    persistence:{
      failedWriteRollback:true,staleRevisionRejected:true,restarted:true,continued:true,
      effectsPreserved:effectsRestored===effectsAtSave,
      inventoryCurrencyPreserved:inventoryCurrencyRestored===inventoryCurrencyAtSave,
      worldPreserved:canonical(restartedRead.envelope.state)===stateAtSave,
    },
    additionalProductionCommits:{mimicWeapon:chestResult.mimicProductionWeaponCommits},
    partySize:party.length,
  };
  assert.deepEqual(receipt.stages,REQUIRED_STAGES);
  assert.equal(receipt.fingerprint,sha256(receipt.configuration));
  assert.deepEqual(receipt.productionCommits,perCampaignCommits);
  assert.ok(Object.values(receipt.trade).every(Boolean));assert.ok(Object.values(receipt.persistence).every(Boolean));
  assert.equal(receipt.partySize,5);

  aggregate.campaignIds.add(campaignId);aggregate.fingerprints.add(fingerprint);aggregate.foes.add(foeDefinition.id);
  aggregate.campaignReceipts.push(receipt);aggregate.completed++;
  aggregate.additionalProductionCommits.mimicWeapon += chestResult.mimicProductionWeaponCommits;
  for (const name of REQUIRED_STAGES) aggregate.stageCounts[name]++;
  for (const key of Object.keys(perCampaignCommits)) aggregate.productionCommits[key] += perCampaignCommits[key];
}

test('500 independent campaigns execute the production journey, audit/admit every catalog definition, and survive reconstruction', {timeout:900000}, async () => {
  assert.equal(ACTOR_PROFILES.length,5);assert.equal(Merchants.DEFAULT_MERCHANT_TEMPLATES.length,10);assert.equal(CHEST_SCENARIOS.length,10);
  const engine = loadRuntimeIntegrationEngine();
  engine.setState({
    items:engine.catalogs.items,spells:engine.catalogs.spells,abilities:engine.catalogs.abilities,
    races:engine.catalogs.races,classes:engine.catalogs.classes,foes:engine.catalogs.foes,
  });
  engine.guardRandom();
  const gameAudit = engine.gameDataAudit();
  const itemAudit = engine.runItemIntegrationAudit();
  const rareAudit = engine.runRareBattleAudit();
  const spellPreparationAudit = engine.runSpellPreparationAudit();
  const catalog = buildCatalogAudit(engine,gameAudit,itemAudit,rareAudit,spellPreparationAudit);
  const setVmTime = installDeterministicVmClock(engine);
  suppressHeadlessPresentation(engine);

  const buckets = {
    item:distribute(catalog.items,CAMPAIGN_COUNT),
    spell:distribute(catalog.spells,CAMPAIGN_COUNT),
    ability:distribute(catalog.abilities,CAMPAIGN_COUNT),
  };
  const aggregate = {
    completed:0,campaignIds:new Set(),fingerprints:new Set(),foes:new Set(),campaignReceipts:[],
    seen:{item:new Set(),spell:new Set(),ability:new Set()},admissions:{},
    productionCommits:{item:0,spell:0,ability:0,weapon:0,foeAction:0,equipmentCycles:0},
    additionalProductionCommits:{mimicWeapon:0},
    productionExecutedIds:{
      items:new Set(),spells:new Set(),abilities:new Set(),weapons:new Set(),
      foeDefinitions:new Set(),foeActions:new Map(),mimicDefinitions:new Set(),
    },
    stageCounts:Object.fromEntries(REQUIRED_STAGES.map(name => [name,0])),
    lootClaims:0,duplicateLootRejections:0,trapConsequences:0,
  };
  for (let index=0;index<CAMPAIGN_COUNT;index++) {
    await runCampaign(index,engine,catalog,buckets,aggregate,setVmTime);
  }

  assert.equal(aggregate.completed,CAMPAIGN_COUNT);
  assert.equal(aggregate.campaignIds.size,CAMPAIGN_COUNT);
  assert.equal(aggregate.fingerprints.size,CAMPAIGN_COUNT,'semantic fingerprints exclude campaignId and cover 5 × 10 × 10');
  assert.equal(aggregate.campaignReceipts.length,CAMPAIGN_COUNT);
  assert.equal(aggregate.foes.size,30,'all production foe definitions participate');
  assert.deepEqual([...aggregate.seen.item].sort(),catalog.items.map(row => row.id).sort(),'every Item ID is admitted exactly once');
  assert.deepEqual([...aggregate.seen.spell].sort(),catalog.spells.map(row => row.id).sort(),'every spell is admitted exactly once');
  assert.deepEqual([...aggregate.seen.ability].sort(),catalog.abilities.map(row => row.id).sort(),'every ability/feature is admitted exactly once');
  for (const name of REQUIRED_STAGES) assert.equal(aggregate.stageCounts[name],CAMPAIGN_COUNT);
  assert.deepEqual(aggregate.productionCommits,{item:500,spell:500,ability:500,weapon:500,foeAction:500,equipmentCycles:500});
  assert.deepEqual(aggregate.additionalProductionCommits,{mimicWeapon:100},'every mimic resolution has an additional production weapon commit');
  assert.equal(aggregate.lootClaims,500);assert.equal(aggregate.duplicateLootRejections,500);
  assert.equal(aggregate.trapConsequences,100,'two triggered-trap scenarios in every ten-campaign slice');

  const productionExecutedIds = {
    items:[...aggregate.productionExecutedIds.items].sort(),
    spells:[...aggregate.productionExecutedIds.spells].sort(),
    abilities:[...aggregate.productionExecutedIds.abilities].sort(),
    weapons:[...aggregate.productionExecutedIds.weapons].sort(),
    foeDefinitions:[...aggregate.productionExecutedIds.foeDefinitions].sort(),
    foeActions:[...aggregate.productionExecutedIds.foeActions.entries()]
      .map(([foeId,actionId]) => ({foeId,actionId})).sort((a,b) => a.foeId.localeCompare(b.foeId)),
    mimicDefinitions:[...aggregate.productionExecutedIds.mimicDefinitions].sort(),
  };
  assert.deepEqual(productionExecutedIds.items,[POTION_ID]);
  assert.deepEqual(productionExecutedIds.spells,[SHIELD_OF_FAITH_ID]);
  assert.deepEqual(productionExecutedIds.abilities,[ACTION_SURGE_ID]);
  assert.deepEqual(productionExecutedIds.weapons,[CLUB_ID]);
  assert.equal(productionExecutedIds.foeDefinitions.length,30);
  assert.equal(productionExecutedIds.foeActions.length,30);
  assert.deepEqual(productionExecutedIds.mimicDefinitions,['system:chest-mimic']);

  const summary = {
    schemaVersion:'dnd-world-final-integration-matrix/1',campaigns:500,completed:aggregate.completed,
    distinctCampaignIds:aggregate.campaignIds.size,distinctConfigurations:aggregate.fingerprints.size,
    catalogAdmissionCoverage:{
      items:aggregate.seen.item.size,localItems:193,bg3Items:10282,spells:aggregate.seen.spell.size,
      abilities:aggregate.seen.ability.size,foes:aggregate.foes.size,executionClaim:false,
    },
    productionExecutedIds,
    structuredFormulaValidation:{
      auditFunction:'gameDataAudit',scope:'installed-local-runtime',executionClaim:false,
      variantsBuiltAndValidated:gameAudit.variants,definitions:clone(gameAudit.counts),errors:gameAudit.errors.length,
    },
    productionCommits:aggregate.productionCommits,
    additionalProductionCommits:aggregate.additionalProductionCommits,
    engineAudit:{
      worldErrors:gameAudit.errors.length,worldCounts:clone(gameAudit.counts),worldVariants:gameAudit.variants,
      itemFailed:itemAudit.failed,itemPassed:itemAudit.passed,itemTotal:itemAudit.total,total:itemAudit.total,
      rareBattlePassed:rareAudit.passed,rareBattleFailed:rareAudit.failed,
      spellPreparationPassed:spellPreparationAudit.passed,spellPreparationFailed:spellPreparationAudit.failed,
    },
    stageCounts:aggregate.stageCounts,lootClaims:aggregate.lootClaims,
    duplicateLootRejections:aggregate.duplicateLootRejections,trapConsequences:aggregate.trapConsequences,
    catalogAdmissions:aggregate.admissions,campaignReceipts:aggregate.campaignReceipts,
  };
  const evidencePath = process.env.DND_WORLD_CAMPAIGN_EVIDENCE;
  if (evidencePath) {
    fs.mkdirSync(path.dirname(path.resolve(evidencePath)),{recursive:true});
    fs.writeFileSync(path.resolve(evidencePath),JSON.stringify(summary,null,2) + '\n','utf8');
  }
  console.log('DND_WORLD_FINAL_INTEGRATION ' + JSON.stringify({...summary,campaignReceipts:`${summary.campaignReceipts.length} receipts`}));
});

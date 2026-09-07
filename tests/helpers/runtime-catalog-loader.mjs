import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';

function domElement(id) {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    className: '',
    classList: {toggle() {}, add() {}, remove() {}},
    closest() { return null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
}

/**
 * Loads the exact catalogs installed by index.html without running application
 * initialization. The VM has no browser storage and uses a deterministic
 * identity sequence while the catalogs are seeded. Integration callers can
 * then enable guardRandom(), which permits identity generation but rejects any
 * attempt by gameplay resolution to invent a die result.
 */
function loadRuntimeContext(rootUrl = new URL('../..', import.meta.url), options = {}) {
  const html = fs.readFileSync(new URL('index.html', rootUrl), 'utf8');
  const marker = "<script>\n'use strict';";
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'main engine script must be present');
  let source = html.slice(start + '<script>'.length, html.indexOf('</script>', start));
  source = source.replace(/\(async function init\(\)\{[\s\S]*$/, '');
  const dependencySources = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)]
    .map(match => match[1])
    .filter(relative => options.itemDomain !== false || relative !== 'scripts/item-domain-model.js')
    .map(relative => fs.readFileSync(new URL(relative, rootUrl), 'utf8'));
  source = dependencySources.join('\n') + '\n' + source;
  source += options.exposeEngine === true ? `
    globalThis.__integrationEngine = {
      catalogs: {
        items: seedItemsDB(), spells: seedSpellsDB(), abilities: seedAbilitiesDB(),
        races: seedRacesDB(), classes: seedClassesDB(), foes: seedFoesDB()
      },
      setState(s) {
        campaignMagic=MAGIC_RULES.settings(s.campaignMagic);
        chars=s.chars||[]; journal=s.journal||[]; itemsDB=s.items||s.itemsDB||[];
        spellsDB=s.spells||s.spellsDB||[]; abilitiesDB=s.abilities||s.abilitiesDB||[];
        racesDB=s.races||s.racesDB||[]; classesDB=s.classes||s.classesDB||[];
        rulesDB=s.rules||s.rulesDB||[]; foesDB=s.foes||s.foesDB||[];
        activeCharId=s.activeCharId||null; fxRound=s.fxRound||1;
        combat=normalizeCombatState(s.combat); castCtx=null; lastCastEvent=null;
        rollSpec=null; rollQueue=[]; rollCompleting=false; fxInvalidate();
      },
      state() { return {
        campaignMagic,chars,journal,items:itemsDB,spells:spellsDB,abilities:abilitiesDB,races:racesDB,
        classes:classesDB,rules:rulesDB,foes:foesDB,itemsDB,spellsDB,abilitiesDB,
        racesDB,classesDB,rulesDB,foesDB,activeCharId,fxRound,combat,lastCastEvent
      }; },
      runItemIntegrationAudit, runRareBattleAudit, runSpellPreparationAudit,
      grimoireApi:{rules:GRIMOIRE_RULES,reconcile:grimoireReconcile,spellOf,grimoireActive,grimoireDuplicateName,spellCardHTML,renderSpellsDB,delSpellDB,grimoireRestore,spellClassTokens,spellRuleOf,inferComponents,spellExecutionPreflight,upgradeSpell,upgradeAbility,upgradeRace,upgradeClass},
      abilitiesApi:{rules:ABILITY_RULES,reconcile:reconcileAbilityRules,abilityMaxUses,abilityOutcomePreflight,canUseAbilityCheck,abilityCardHTML,addAbilityFromDB,delCharAbility,stAbilities,renderAbilitiesDB,abilityCastFx,abilityOf,combatAbilityUsedThisTurn,combatAttackCount,filters:dbFlt.ab,
        html(id){return document.getElementById(id).innerHTML;},
        quiet(){renderChars=()=>{};renderCombat=()=>{};renderFoes=()=>{};renderChests=()=>{};renderMerchants=()=>{};},
        setCast(ctx){castCtx=ctx;},roll(){return rollSpec;},advanceFxRound
      },
      gameDataAudit, itemActions, itemProfile, itemUsesOf, itemAuditRollValues,
      itemUseOf, itemUseSpecOf, targetInfoOf, resolveOutcome, validateFormulaValues,
      useItemApply, castSpellApply, useAbilityApply, weaponSpecOf, weaponAttackApply,
      rollSpecOf, combatUseItem, combatUseAbility, combatCastSpell, combatWeapon,
      combatFoeAction, foeActionOf, foeActionsOf, foeActionSpecOf, foeActionApply,
      sheetEquipToggle, sheetEquipToSlot, sheetUnequipSlot,
      closeCastModal, fxSum, invQty,
      elementText(id) { return String((document.getElementById(id)||{}).textContent||''); },
      setElementValue(id, value) { document.getElementById(id).value=String(value); },
      craftPlanFor,commitCraftPlan,inventoryItemQty,combatSnapshotOf,combatSyncChanges,
      castState() { return {ctx:castCtx,spec:(castCtx&&castCtx.spec)||rollSpec}; }, castConfirm, castFormulaConfirm, castDistanceSet,
      buildRoku, buildTorgar, buildSeptih, buildLegerem, buildBlank,
      charactersApi: {characterAdopt,characterSync,characterTraining,characterSnapshot,characterCreationPreview,characterCreatorErrors,characterSelectValue,characterOriginFx,characterCreatorCommit,
        magicSwitch,magicPool,magicPlan,magicEnsure,magicUsesMp,magicFreeAccess,magicClassSpellAvailable,characterSpellEntries,spellEntryReady,spellRitualAllowed,combatActionsHTML,togglePrep,addSpellFromDB,delBookSpell,magicRules:MAGIC_RULES,slotPlanFor,commitSlotPlan,applyClassSlots,shortRest,stSpells,spellDashHTML,magicSettingsHTML,
        setClass,setRace,setLevel,setHp,characterSetHpMax,abDelta,levelUp,levelDown,applyHp,longRest,refreshShortRestResources,sheetHTML,subraceOpts,subclassOpts,raceOpts,bgOpts,
        casterMeta,slotsRowFor,maxCircleFor,knownSpellMax,cantripKnownMax,spellAddCheck,spellAccessCheck,skillBonus,armorProfsOf,speedTotal,dmgAfterTraits,finalizeRollSpec,saveConditionMode,holderEffectImmune,rollFxEntries,toolProficiencyHas,
        rules:CHARACTER_RULES,backgrounds:BACKGROUNDS,
        characterEnsureBackground,characterBackgroundProfile,characterBiographySet,characterBackgroundAction,backgroundContext,stBackground,stNotes,characterArmInspiration,characterInspirationEffect,consumeRollFx,rollCheck,rollCancel,rollDone,castFormulaRollsBuild,toolTaskCheckSpec,toolCheck,weaponAttackFx,castSpellFx,castFormulaShow,castFormulaBack,characterPendingInspiration,spellRollPreflight,
        economyState(){return economyState;},
        failBackgroundPersistence(){runScheduledSave=async()=>false;},
        setDraft(c) {characterDraft=c;},draft(){return characterDraft;},
        withoutPresentation(){renderChars=()=>{};renderCombat=()=>{};renderChests=()=>{};renderMerchants=()=>{};renderCharacterCreator=()=>{};characterCreatorClose=()=>{characterDraft=null;};}
      },
      blankCombat, combatStart, combatNextTurn, combatSpend, combatCanSpend,
      coinCopperTotal, acTotal, eHpMax, effectiveConditions,
      dndWorldExportPayload, dndWorldImportPayload, loadAll, runScheduledSave,
      saveWorldNow() { savePendWorld=true; return runScheduledSave(); },
      persistenceState() { return {
        revision: campaignEnvelopeRevision,
        receipt: campaignLastPersistenceReceipt ? structuredClone(campaignLastPersistenceReceipt) : null,
        pending: savePendWorld,
      }; },
      guardRandom() { let uidRandom=0; Math.random=()=>{
        const stack=String(new Error().stack||'');
        if (/\\bat uid \\(/.test(stack)) return (++uidRandom%100000)/100000;
        throw new Error('ENGINE_RANDOM_DICE_FORBIDDEN');
      }; }
    };
  ` : `
    globalThis.__integrationCatalogs = {
      items: seedItemsDB(), spells: seedSpellsDB(), abilities: seedAbilitiesDB(),
      races: seedRacesDB(), classes: seedClassesDB(), foes: seedFoesDB(),
      characters: [buildRoku(), buildTorgar(), buildSeptih(), buildLegerem()]
    };
  `;

  const elements = new Map();
  const localStorageData = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, domElement(id));
    return elements.get(id);
  };
  let deterministicRandomCalls = 0;
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {random: () => (++deterministicRandomCalls % 100000) / 100000}),
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
    prompt: () => { throw new Error('PLAYER_ROLL_PROMPT_FORBIDDEN_DURING_CATALOG_CENSUS'); },
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
      getItem: key => localStorageData.has(String(key)) ? localStorageData.get(String(key)) : null,
      setItem: (key, value) => { localStorageData.set(String(key), String(value)); },
      removeItem: key => { localStorageData.delete(String(key)); },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, {filename: 'index.html#runtime-catalog-census'});
  return context;
}

export function loadInstalledRuntimeCatalogs(rootUrl = new URL('../..', import.meta.url), options = {}) {
  const context = loadRuntimeContext(rootUrl, options);
  return JSON.parse(JSON.stringify(context.__integrationCatalogs));
}

/**
 * Loads the production engine functions in an isolated VM. This is intentionally
 * separate from the lightweight census path: callers can execute real handlers
 * while the surrounding Node process keeps deterministic clocks and dice.
 */
export function loadRuntimeIntegrationEngine(rootUrl = new URL('../..', import.meta.url), options = {}) {
  return loadRuntimeContext(rootUrl, {...options, exposeEngine:true}).__integrationEngine;
}

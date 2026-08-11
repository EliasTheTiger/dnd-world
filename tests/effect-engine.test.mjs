import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadEngine(random = () => 0) {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  let source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  source += `
    globalThis.__engine = {
      setState(s) {
        chars=s.chars||[]; journal=s.journal||[]; itemsDB=s.items||[]; spellsDB=s.spells||[];
        abilitiesDB=s.abilities||[]; racesDB=s.races||[]; classesDB=s.classes||[];
        rulesDB=s.rules||[]; foesDB=s.foes||[]; activeCharId=s.activeCharId||null; fxRound=s.fxRound||1;
        combat=normalizeCombatState(s.combat); lastCastEvent=null; castCtx=null; rollSpec=null; fxInvalidate();
      },
      loadAll, blankCombat,
      state() { return {chars,itemsDB,spellsDB,abilitiesDB,racesDB,classesDB,foesDB,activeCharId,fxRound,lastCastEvent,combat}; },
      applyFxTo, removeActiveFx, advanceFxRound, attachDuration, spellFxForCast,
      castSpellApply, canCastCheck, parseComponents, materialPlanFor, commitMaterialPlan, slotPlanFor,
      casterMeta, maxCircleFor, slotsRowFor, applyClassSlots, casterPreparationMode,
      knownSpellMax, cantripKnownMax, knownSpellCount, cantripKnownCount, spellLearningState, bardMagicalSecretsEarned,
      spellClassListHas, spellAccessCheck, spellAddCheck, spellEntryReady, spellRitualAllowed,
      prepMax, prepCount, preparedChoiceIds, ensureSpellPreparationDraft, commitSpellPreparation, preparationPlanMinutes,
      syncClassSpellAccess, upgradeSpellcastingState, autoLevelSpells, setClass, setLevel,
      addSpellFromDB, delBookSpell, beginKnownSpellReplacement, cancelKnownSpellReplacement,
      charFxAll, fxSum, eHpMax, acTotal, speedTotal, concEntriesOf,
      breakConcentration, concRollMode, longRest, shortRest, refreshShortRestResources, activeStackWinners, durationSpecOf, spellNeedsConcentration, spellTargetLimit,
      endTriggeredSpellEffects,
      applyDamageTo, applyRollsToTarget, resolveUndeadFortitude, useAbilityApply, outcomeAllowsEffect, effectiveConditions,
      rollSpecOf, resolveOutcome, targetInfoOf, targetCriticalHitImmune, weaponSpecOf, weaponAttackApply, weaponCanUseTwoHands, weaponAttackResourcePlan, useItemApply,
      upgradeSpell, upgradeAbility, upgradeItem, upgradeRace, upgradeClass, currentMechanics,
      compileSpellMechanics, compileAbilityMechanics, compileItemMechanics, compileRaceMechanics, compileClassMechanics,
      mechanicsErrors, referenceMechanicsErrors, formulaContractErrors, finalizeRollSpec, normalizeResolutionContract,
      itemUsesOf, itemUseOf, itemUseSpecOf, itemPassiveFx, itemUseSchemaErrors, itemResourceSchemaErrors, itemToolSchemaErrors, itemMaterialSchemaErrors,
      craftingRecipeSchemaErrors, itemSpec, itemActions, combatItemActionCost, rollFxEntries, scrollUseCheck, canUseItemCheck,
      itemUseResourcePlan, commitItemUseResource,
      dmgAfterTraits, effectiveFoeConditions, castDispel, rollbackLastCast,
      seedItemsDB, seedSpellsDB, seedAbilitiesDB, seedRacesDB, seedClassesDB, seedFoesDB, gameDataAudit,
      reconcileRaceAbilityReferences,
      upgradeFoe, mergeBuiltinFoe, foeSaveMod, foeSkillMod, foeActionReady, foeResetActionState,
      buildRoku, buildTorgar, buildSeptih, buildLegerem,
      foeActionOf, foeActionFormula, foeActionSpecOf, foeActionApply, foeActionBatchApply,
      abilityIsActive, isPassiveAbility, abilityPoolOf, itemProfile, weaponDamageOf, weaponBonusOf, ammoRemaining, ammoRecover, invQty,
      foeActionsOf, foeDefensesOf, conditionRules,
      validateFormulaValues, saveConditionMode, attackConditionMode, attackRangeBands, coverRuleOf,
      combatStart, combatNextTurn, combatEnd, combatSpend, combatCanSpend, combatBasicAction, combatFocus,
      combatEnsureSetup, restorePartyAndCombatState, resetCombatAndParty,
      mergeStableEntries, structuredReleaseCampaignPayload,
      combatCastSpell, combatUseAbility, combatWeapon, combatFoeAction, combatSyncChanges, combatVictoryText,
      combatUseItem, combatResolveItemZone,
      combatDeathSave, combatContestAction, combatTriggerReady, combatOpportunityBlocked, combatSetGroup, combatSpellTurnAllowed,
      combatAbilityCost, combatAbilityUsable, combatSpellCost, combatCunningAction,
      combatFoeRecharge, combatFoeAttackAllowed, combatRecordFoeAttack, combatAttackCount,
      castConfirm, castFormulaShow, castFormulaConfirm, closeCastModal, runRareBattleAudit, runSpellPreparationAudit,
      inventoryItemQty, craftPlanFor, commitCraftPlan, itemMaterialMeta, recipesUsingItem, craftRecipesForTool, eAb,
      itemExpansion() { return ITEM_EXPANSION_V45; },
      itemRecipes() { return ITEM_RECIPES_V45; },
      itemTagNames() { return Object.keys(ITEM_TAGS); },
      castState() { return {ctx:castCtx, spec:castCtx&&castCtx.spec}; },
      makeBlank() { return buildBlank(); },
      conditions() { return CONDITIONS; },
      renderWorld() {
        renderRaces(); renderClasses(); renderRules(); renderChars(); renderCombat();
        renderSpellsDB(); renderItemsDB(); renderAbilitiesDB(); renderFoes();
        return ['chars','combat','races','classes','spellsdb','itemsdb','abilitiesdb','foes','rules']
          .reduce((o,id)=>{ o[id]=document.getElementById('tab-'+id).innerHTML; return o; },{});
      },
      renderSheetPanel(name) {
        sheetTab=name; renderChars(); return document.getElementById('tab-chars').innerHTML;
      },
      setConfirmResults(v){ globalThis.__confirmQueue=v.slice(); },
      setPromptResults(v){ globalThis.__promptQueue=v.slice(); globalThis.__promptCount=0; },
      setElementValue(id,v){ document.getElementById(id).value=v; },
      promptCount(){ return globalThis.__promptCount||0; },
      /* Правило проекта: сайт не бросает кости — их бросают живые игроки,
         поэтому вместо Math.random тест подставляет выпавшие значения. */
      setAutoRolls(v){ globalThis.window.__autoRolls=v; }
    };
  `;

  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value: '', textContent: '', innerHTML: '',
        style: {}, dataset: {}, className: '',
        classList: {toggle() {}, add() {}, remove() {}},
        closest() { return null; }
      });
    }
    return elements.get(id);
  };
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {random}),
    Date,
    JSON,
    Blob,
    URL,
    setTimeout: () => 0,
    clearTimeout() {},
    __confirmQueue: [],
    __promptQueue: [],
    __promptCount: 0,
    confirm: () => context.__confirmQueue.length ? context.__confirmQueue.shift() : true,
    prompt: () => { context.__promptCount++; return context.__promptQueue.length ? context.__promptQueue.shift() : '1'; },
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
      getItem: () => null,
      setItem() {},
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__engine;
}

function hero(id, overrides = {}) {
  return {
    id,
    name: id,
    cls: 'Жрец',
    level: 5,
    ab: {str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10},
    saves: {str: false, dex: false, con: false, int: false, wis: true, cha: false},
    skills: {},
    hp: 10,
    hpMax: 10,
    hpTemp: 0,
    inventory: [],
    equipment: {},
    abilities: [],
    activeFx: [],
    fxOff: [],
    cond: [],
    deaths: {s: 0, f: 0},
    slots: {},
    spentRest: 0,
    exhaustion: 0,
    hdUsed: 0,
    ...overrides,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function manualFormulaValues(spec, variant = 0) {
  const values = {};
  const highAttack = variant % 4 !== 0;
  const highSave = variant % 3 === 0;
  for (const row of spec.rows || []) {
    if (row.autoFail) {
      values[row.key] = null;
      continue;
    }
    const natural = row.natural || ['atk', 'save', 'check', 'tcheck'].includes(row.type);
    const diceMin = Math.max(0, +row.cnt || (natural ? 1 : 0));
    const diceMax = (+row.cnt || 0) && (+row.sides || 0) ? (+row.cnt * +row.sides) : (natural ? 20 : diceMin);
    const min = Number.isFinite(+row.min) ? +row.min : diceMin;
    const max = Number.isFinite(+row.max) ? +row.max : Math.max(min, diceMax);
    let value;
    /* 19 дает надежное попадание без перехода к удвоенному диапазону костей
       критического урона; критические сценарии проверяются отдельно. */
    if (row.type === 'atk') value = highAttack ? Math.min(19, max) : Math.max(1, min);
    else if (row.type === 'save' || row.type === 'tcheck') value = highSave ? Math.min(20, max) : Math.max(1, min);
    else if (row.type === 'check') value = highSave ? Math.max(1, min) : Math.min(20, max);
    else value = min + ((variant + (row.key || '').length) % Math.max(1, max - min + 1));
    values[row.key] = Math.max(min, Math.min(max, value));
    if (row.natural && row.adv) {
      const highSecond = row.type === 'atk' ? highAttack : highSave;
      values[row.key + '_2'] = highSecond ? Math.min(row.type === 'atk' ? 19 : 20, max) : Math.max(1, min);
    }
  }
  return values;
}

function resolveManualOutcome(e, spec, values, ctx = {}) {
  let outcome = e.resolveOutcome(spec, values, ctx);
  if (outcome.crit) {
    /* При натуральной 20 или автоматическом крите из-за состояния игрок
       действительно бросает вдвое больше костей урона. */
    for (const row of spec.rows || []) {
      if (row.type !== 'dmg' || values[row.key] == null || !(+row.cnt > 0) || !(+row.sides > 0)) continue;
      values[row.key] = Math.max(+row.cnt * 2, Math.min(+row.cnt * +row.sides * 2, +values[row.key] * 2));
    }
    outcome = e.resolveOutcome(spec, values, ctx);
  }
  return outcome;
}

function assertBattleInvariants(e, label) {
  const state = e.state();
  const ids = state.combat.order.map(x => `${x.kind}:${x.id}`);
  assert.equal(new Set(ids).size, ids.length, `${label}: участник продублирован в инициативе`);
  for (const c of state.chars) {
    const max = e.eHpMax(c);
    assert.ok(Number.isFinite(c.hp) && c.hp >= 0 && c.hp <= max, `${label}: неверные хиты ${c.name}`);
    assert.ok(Number.isFinite(+c.hpTemp || 0) && (+c.hpTemp || 0) >= 0, `${label}: неверные временные хиты ${c.name}`);
    assert.ok((c.activeFx || []).every(x => x && Array.isArray(x.fx)), `${label}: поврежденный эффект ${c.name}`);
    Object.values(c.slots || {}).forEach(s => assert.ok((+s.cur || 0) >= 0 && (+s.cur || 0) <= (+s.max || 0), `${label}: ячейка вне границ`));
    const deaths = c.deaths || {};
    assert.ok((+deaths.s || 0) >= 0 && (+deaths.s || 0) <= 3 && (+deaths.f || 0) >= 0 && (+deaths.f || 0) <= 3,
      `${label}: спасброски смерти вне границ`);
  }
  for (const f of state.foesDB) {
    const ti = e.targetInfoOf(`foe:${f.id}`);
    assert.ok(Number.isFinite(f.hp) && f.hp >= 0 && f.hp <= ti.hpMax, `${label}: неверные хиты ${f.n}`);
    assert.ok((f.activeFx || []).every(x => x && Array.isArray(x.fx)), `${label}: поврежденный эффект ${f.n}`);
  }
  const turn = state.combat.turn;
  if (state.combat.active && turn) {
    assert.ok(turn.actionsUsed >= 0 && turn.actionsUsed <= turn.actionMax, `${label}: действия вне границ`);
    assert.ok(turn.attacksUsed >= 0 && turn.attacksUsed <= turn.attackMax, `${label}: атаки вне границ`);
  }
}

test('неудачный префлайт не тратит ячейку и не рвет старую концентрацию', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {1: {max: 1, cur: 0}}});
  const target = hero('target');
  const old = {uid: 'old', k: 'spell', id: 'old', label: 'Старое', casterId: caster.id, conc: true, fx: []};
  target.activeFx.push(old);
  const next = {id: 'next', n: 'Новый покров', l: 1, cm: 'В', d: 'Концентрация, 1 мин.', conc: true, x: ''};
  e.setState({chars: [caster, target], spells: [next]});

  assert.equal(e.castSpellApply(next.id, caster.id, `ally:${target.id}`, '', undefined, '1'), false);
  assert.equal(caster.slots[1].cur, 0);
  assert.equal(target.activeFx[0].uid, 'old');
});

test('длительность и концентрация учитывают круг усиления', () => {
  const e = loadEngine();
  const bless = {n: 'Благословение', l: 1, d: 'Концентрация, 1 мин.', conc: true, x: ''};
  const curse = {n: 'Возложение проклятия', l: 3, d: 'Концентрация, 1 мин.', conc: true, x: ''};
  assert.equal(e.durationSpecOf(bless, 1).rounds, 10);
  assert.equal(e.spellNeedsConcentration(curse, 4), true);
  assert.equal(e.spellNeedsConcentration(curse, 5), false);
  assert.equal(e.durationSpecOf(curse, 5).rounds, 4800);
});

test('ошибка материального компонента не оставляет частично потраченный каст', () => {
  const e = loadEngine();
  const junk = {id: 'junk', n: 'Веревка', type: 'equipment', cost: '1 зм', desc: ''};
  const caster = hero('caster', {
    slots: {1: {max: 1, cur: 1}},
    inventory: [{id: 'junk-entry', itemId: junk.id, qty: 1}],
  });
  const target = hero('target');
  target.activeFx.push({uid: 'old', k: 'spell', id: 'old', label: 'Старое', casterId: caster.id, conc: true, fx: []});
  const costly = {
    id: 'orb', n: 'Хроматический шар', l: 1, cm: 'В, С, М (драгоценный камень 50 зм)',
    d: 'Мгновенная', conc: false, x: 'Дальнобойная атака заклинанием.'
  };
  e.setState({chars: [caster, target], items: [junk], spells: [costly]});

  assert.equal(e.castSpellApply(costly.id, caster.id, `ally:${target.id}`, '', {entryId: 'junk-entry', use: 0}, '1'), false);
  assert.equal(caster.slots[1].cur, 1);
  assert.equal(target.activeFx[0].uid, 'old');
  assert.equal(caster.inventory[0].qty, 1);
});

test('новая концентрация коммитится атомарно и снимает прежнюю', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {1: {max: 1, cur: 1}}});
  const target = hero('target');
  target.activeFx.push({uid: 'old', k: 'spell', id: 'old', label: 'Старое', casterId: caster.id, conc: true, fx: []});
  const next = {id: 'faith', n: 'Щит веры', l: 1, cm: 'В', d: 'Концентрация, 10 мин.', conc: true, x: '+2 к КД'};
  e.setState({chars: [caster, target], spells: [next]});

  assert.equal(e.castSpellApply(next.id, caster.id, `ally:${target.id}`, '', undefined, '1'), true);
  assert.equal(caster.slots[1].cur, 0);
  assert.equal(target.activeFx.length, 1);
  assert.equal(target.activeFx[0].id, next.id);
  assert.equal(e.fxSum(target, 'ac'), 2);
});

test('мгновенное лечение меняет хиты, но не оставляет вечный эффект', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {1: {max: 1, cur: 1}}});
  const target = hero('target', {hp: 1, hpMax: 20});
  const cure = {
    id: 'cure', n: 'Лечение ран', l: 1, cm: 'В, С', d: 'Мгновенная', conc: false,
    x: 'Касание восстанавливает 1к8 + модификатор базовой характеристики хитов.'
  };
  e.setState({chars: [caster, target], spells: [cure]});

  e.setAutoRolls([1]);   /* игрок выбросил 1 на d8 */
  assert.equal(e.castSpellApply(cure.id, caster.id, `ally:${target.id}`, '', undefined, '1'), true);
  assert.equal(target.hp, 5);
  assert.equal(target.activeFx.length, 0);
});

test('многоцелевое заклинание тратит одну ячейку и истекает синхронно', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {1: {max: 2, cur: 2}}});
  const a = hero('a'), b = hero('b'), c = hero('c');
  const bless = {id: 'bless', n: 'Благословение', l: 1, cm: 'В', d: 'Концентрация, 1 мин.', conc: true, x: ''};
  e.setState({chars: [caster, a, b, c], spells: [bless]});

  assert.equal(e.castSpellApply(bless.id, caster.id, `ally:${a.id}`, '', undefined, '1', [`ally:${b.id}`, `ally:${c.id}`]), true);
  assert.equal(caster.slots[1].cur, 1);
  assert.equal(e.concEntriesOf(caster.id).length, 3);
  assert.equal(new Set([a, b, c].map(x => x.activeFx[0].castId)).size, 1);

  e.advanceFxRound(10);
  assert.equal(e.concEntriesOf(caster.id).length, 0);
  assert.equal(a.activeFx.length + b.activeFx.length + c.activeFx.length, 0);
});

test('одноименные эффекты не складываются, а обратимые хиты переключаются на сильнейший', () => {
  const e = loadEngine();
  const target = hero('target');
  const aid = {id: 'aid', n: 'Подмога', l: 2, cm: 'В, С', d: '8 часов', conc: false, x: ''};
  e.setState({chars: [target], spells: [aid]});

  const weak = {k: 'spell', id: aid.id, label: aid.n, casterId: 'a', stackKey: `spell:${aid.id}`, power: 2, fx: e.spellFxForCast(aid, 2)};
  e.attachDuration(weak, aid, 2);
  e.applyFxTo(target.id, weak);
  assert.equal(target.hp, 15);
  assert.equal(e.eHpMax(target), 15);

  const strong = {k: 'spell', id: aid.id, label: aid.n, casterId: 'b', stackKey: `spell:${aid.id}`, power: 3, fx: e.spellFxForCast(aid, 3)};
  e.attachDuration(strong, aid, 3);
  e.applyFxTo(target.id, strong);
  assert.equal(e.activeStackWinners(target)[`spell:${aid.id}`].uid, strong.uid);
  assert.equal(weak.hpGrantActive, false);
  assert.equal(target.hp, 20);
  assert.equal(e.eHpMax(target), 20);

  e.removeActiveFx(target.id, strong.uid);
  assert.equal(e.activeStackWinners(target)[`spell:${aid.id}`].uid, weak.uid);
  assert.equal(weak.hpGrantActive, true);
  assert.equal(target.hp, 15);
  assert.equal(e.eHpMax(target), 15);
});

test('соматический компонент с занятыми руками соблюдает различие С и С+М', () => {
  const e = loadEngine();
  const sword = {id: 'sword', n: 'Меч', type: 'weapon', tags: []};
  const focus = {id: 'focus', n: 'Священный щит', type: 'armor', tags: ['focus']};
  const caster = hero('caster', {
    inventory: [
      {id: 'i-sword', itemId: sword.id, qty: 1},
      {id: 'i-focus', itemId: focus.id, qty: 1},
    ],
    equipment: {MAIN_HAND: 'i-sword', OFF_HAND: 'i-focus'}
  });
  const verbalSomatic = {id: 'vs', n: 'Щит', l: 1, cm: 'В, С', d: '1 раунд', x: ''};
  const withMaterial = {id: 'vsm', n: 'Щит веры', l: 1, cm: 'В, С, М (кусочек пергамента)', d: '1 мин.', x: ''};
  e.setState({chars: [caster], items: [sword, focus], spells: [verbalSomatic, withMaterial]});

  assert.equal(e.canCastCheck(caster, verbalSomatic).ok, false);
  assert.equal(e.canCastCheck(caster, withMaterial).ok, true);
  const comp = e.parseComponents(withMaterial);
  assert.equal(e.materialPlanFor(caster, withMaterial, comp, {substitute: true}).ok, true);
});

test('двуручное оружие можно удерживать одной рукой во время компонентов заклинания', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const twoHanded = items.find(it => {
    const w = e.itemProfile(it).weapon;
    return w && w.two;
  });
  const caster = hero('caster', {inventory: [{id: 'two', itemId: twoHanded.id, qty: 1}], equipment: {MAIN_HAND: 'two', OFF_HAND: 'two'}});
  const somatic = {id: 'somatic', n: 'Жест', l: 1, cm: 'В, С', d: 'Мгновенная', x: ''};
  const material = {id: 'material', n: 'Компонент', l: 1, cm: 'В, С, М (щепотка песка)', d: 'Мгновенная', x: ''};
  e.setState({chars: [caster], items, spells: [somatic, material]});
  assert.equal(e.canCastCheck(caster, somatic).ok, true);
  assert.equal(e.canCastCheck(caster, material).ok, true);
});

test('модификаторы скорости суммируются до умножения и не зависят от порядка эффектов', () => {
  const e = loadEngine();
  const target = hero('target', {speed: '30 футов'});
  target.activeFx.push(
    {uid: 'haste', k: 'spell', id: 'haste', label: 'Ускорение', power: 3, fx: [{stat: 'speed', mode: 'mul', value: 2}]},
    {uid: 'stride', k: 'spell', id: 'stride', label: 'Скороход', power: 1, fx: [{stat: 'speed', mode: 'add', value: '3 м'}]},
  );
  e.setState({chars: [target], spells: []});
  assert.equal(e.speedTotal(target), '80 футов');
});

test('долгий отдых заклинателя разрывает эффекты концентрации на других героях', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {}, abilities: []});
  const target = hero('target');
  target.activeFx.push({uid: 'remote', k: 'spell', id: 'bless', label: 'Благословение', casterId: caster.id, conc: true, fx: []});
  e.setState({chars: [caster, target], spells: [], activeCharId: caster.id});

  e.longRest();
  assert.equal(target.activeFx.length, 0);
});

test('успешный спасбросок блокирует длящееся состояние заклинания', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {2: {max: 1, cur: 1}}});
  const target = hero('target');
  const hold = {
    id: 'hold', n: 'Удержание личности', l: 2, cm: '—', d: 'Концентрация, 1 мин.', conc: true,
    x: 'Гуманоид парализован (спасбросок Мудрости в конце каждого хода).'
  };
  e.setState({chars: [caster, target], spells: [hold]});

  const rolls = {saveOk: true, hit: null, contestWin: null, effectAllowed: false, dmgRaw: null, dmgTotal: null, verdict: []};
  assert.equal(e.castSpellApply(hold.id, caster.id, `ally:${target.id}`, '', undefined, '2', rolls), true);
  assert.equal(target.activeFx.length, 0);
  assert.equal(e.effectiveConditions(target).includes('Парализованный'), false);
});

test('многоцелевое лечение одним броском применяется ко всем выбранным целям', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {5: {max: 1, cur: 1}}});
  const a = hero('a', {hp: 1, hpMax: 30});
  const b = hero('b', {hp: 2, hpMax: 30});
  const c = hero('c', {hp: 3, hpMax: 30});
  const mass = {id: 'mass', n: 'Массовое лечение ран', l: 5, cm: 'В, С', d: 'Мгновенная', x: 'До шести существ восстанавливают 3d8 + модификатор Мудрости хитов.'};
  const rolls = {healTotal: 17, tempTotal: null, dmgRaw: null, dmgTotal: null, hit: null, saveOk: null, contestWin: null, effectAllowed: true, verdict: []};
  e.setState({chars: [caster, a, b, c], spells: [mass]});

  assert.equal(e.castSpellApply(mass.id, caster.id, `ally:${a.id}`, '', undefined, '5', rolls,
    [`ally:${b.id}`, `ally:${c.id}`]), true);
  assert.deepEqual([a.hp, b.hp, c.hp], [18, 19, 20]);
});

test('отдельные спасброски многоцелевого заклинания дают отдельные последствия', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {3: {max: 1, cur: 1}}});
  const a = hero('a'), b = hero('b');
  const hold = {
    id: 'hold', n: 'Удержание личности', l: 2, cm: '—', d: 'Концентрация, 1 мин.', conc: true,
    x: 'Гуманоид парализован (спасбросок Мудрости в конце каждого хода).'
  };
  const ok = {saveOk: true, effectAllowed: false, dmgRaw: null, dmgTotal: null, verdict: []};
  const fail = {saveOk: false, effectAllowed: true, dmgRaw: null, dmgTotal: null, verdict: []};
  const byTarget = {[`ally:${a.id}`]: ok, [`ally:${b.id}`]: fail};
  e.setState({chars: [caster, a, b], spells: [hold]});

  assert.equal(e.castSpellApply(hold.id, caster.id, `ally:${a.id}`, '', undefined, '3', ok, [`ally:${b.id}`], byTarget), true);
  assert.equal(a.activeFx.length, 0);
  assert.equal(b.activeFx.length, 1);
  assert.equal(e.effectiveConditions(b).includes('Парализованный'), true);
  assert.equal(caster.slots[3].cur, 0);
});

test('урон по герою с 0 хитов ставит каноническое состояние и провалы смерти', () => {
  const e = loadEngine();
  const target = hero('target', {hp: 0, cond: ['Без сознания']});
  const spell = {id: 'spark', n: 'Искра', l: 0, cm: 'В', d: 'Мгновенная', x: ''};
  e.setState({chars: [target], spells: [spell]});

  e.applyRollsToTarget(`ally:${target.id}`, {dmgTotal: 2, dmgRaw: 2, dmgType: 'огонь', crit: true}, 'Искра');
  assert.equal(target.deaths.f, 2);
  assert.deepEqual(Array.from(target.cond), ['Бессознательный']);
  assert.equal(e.canCastCheck(target, spell).ok, false);
});

test('исчерпанный общий запас нельзя обойти подтверждением и собственный заряд не тратится', () => {
  const e = loadEngine();
  const pool = {id: 'pool', n: 'Кости превосходства d8', uses: 1, rest: 'короткий отдых', x: 'Запас костей превосходства.'};
  const maneuver = {id: 'maneuver', n: 'Прием', uses: 1, rest: 'короткий отдых', x: 'Вы можете потратить кость превосходства и нанести дополнительный урон.'};
  const caster = hero('caster', {abilities: [{abilityId: maneuver.id, cur: 1}, {abilityId: pool.id, cur: 0}]});
  const target = hero('target');
  e.setState({chars: [caster, target], abilities: [maneuver, pool]});
  e.setConfirmResults([true]);

  assert.equal(e.useAbilityApply(maneuver.id, caster.id, `ally:${target.id}`, {poolSpend: pool.id}), false);
  assert.equal(caster.abilities[0].cur, 1);
  assert.equal(caster.abilities[1].cur, 0);
});

test('Контрзаклинание спрашивает круг цели один раз до списания ячейки', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {3: {max: 1, cur: 1}}});
  const counter = {id: 'counter', n: 'Контрзаклинание', l: 3, cm: 'В', d: 'Мгновенная', x: ''};
  const target = hero('target');
  e.setState({chars: [caster, target], spells: [counter]});
  e.setPromptResults(['2']);

  assert.equal(e.castSpellApply(counter.id, caster.id, `ally:${target.id}`, '', undefined, '3'), true);
  assert.equal(e.promptCount(), 1);
  assert.equal(caster.slots[3].cur, 0);
});

test('длительный эффект на противнике хранится, учитывается концентрацией и истекает', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {2: {max: 1, cur: 1}}});
  const foe = {id: 'foe', n: 'Враг', kind: 'monster', ac: 12, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  const hold = {id: 'hold', n: 'Удержание личности', l: 2, cm: '—', d: 'Концентрация, 1 мин.', conc: true,
    x: 'Гуманоид парализован (спасбросок Мудрости в конце каждого хода).'};
  e.setState({chars: [caster], foes: [foe], spells: [hold]});

  assert.equal(e.castSpellApply(hold.id, caster.id, `foe:${foe.id}`, '', undefined, '2',
    {saveOk: false, effectAllowed: true, dmgRaw: null, dmgTotal: null, verdict: []}), true);
  assert.equal(foe.activeFx.length, 1);
  assert.equal(e.concEntriesOf(caster.id).length, 1);
  e.advanceFxRound(10);
  assert.equal(foe.activeFx.length, 0);
  assert.equal(e.concEntriesOf(caster.id).length, 0);
});

test('Героизм начинает с одной цели, а не с трех', () => {
  const e = loadEngine();
  const heroism = {n: 'Героизм', l: 1};
  assert.equal(e.spellTargetLimit(heroism, 1), 1);
  assert.equal(e.spellTargetLimit(heroism, 3), 3);
});

test('кости Благословения входят в итог атаки и спасброска', () => {
  const e = loadEngine();
  const blessFx = {uid: 'bless', k: 'spell', id: 'bless', label: 'Благословение', fx: [
    {stat: 'attack', mode: 'die', value: '1d4'}, {stat: 'save', mode: 'die', value: '1d4'}
  ]};
  const caster = hero('caster', {activeFx: [blessFx]});
  const target = hero('target', {activeFx: [JSON.parse(JSON.stringify(blessFx))]});
  const foe = {id: 'foe', n: 'Враг', kind: 'monster', ac: 17, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  e.setState({chars: [caster, target], foes: [foe]});

  const attack = {n: 'Луч', l: 0, x: 'Дальнобойная атака заклинанием наносит 1d8 урона огнем.'};
  const attackSpec = e.rollSpecOf(attack, {caster, kind: 'spell', slotLvl: 0, target: e.targetInfoOf(`foe:${foe.id}`)});
  assert.equal(e.resolveOutcome(attackSpec, {atk: 10, atkfx0: 2, dmg2: 4}, {}).hit, true);

  const saveSpell = {n: 'Испытание', l: 1, x: 'Цель совершает спасбросок Мудрости.'};
  const saveSpec = e.rollSpecOf(saveSpell, {caster, kind: 'spell', slotLvl: 1, target: e.targetInfoOf(`ally:${target.id}`)});
  assert.equal(e.resolveOutcome(saveSpec, {save: 7, savefx0: 2}, {}).saveOk, true);
});

test('контракт проверяет всю мировую базу, предметные применения и статблоки без ошибок', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  e.setState({spells, abilities, items, foes});
  const audit = e.gameDataAudit({spells, abilities, items, foes});

  assert.deepEqual(plain(audit.counts), {spells: 121, abilities: 77, items: 195, foes: 30, total: 423});
  assert.ok(audit.variants > 900);
  assert.deepEqual(plain(audit.errors), []);
  assert.equal(Object.values(audit.modes.spell).reduce((a, b) => a + b, 0), 121);
  assert.equal(Object.values(audit.modes.ability).reduce((a, b) => a + b, 0), 77);
  assert.equal(Object.values(audit.modes.item).reduce((a, b) => a + b, 0), 195);
  assert.equal(audit.modes.foe.structured, 30);
  assert.equal(audit.itemActions.automatic + audit.itemActions.manual, 195);
  assert.equal(new Set(audit.itemActions.manualNames).size, audit.itemActions.manual);
});

test('расширение 4.5 добавляет ровно 61 полностью структурированный предмет и 20 связных рецептов', () => {
  const e = loadEngine(), expansion = plain(e.itemExpansion()), recipes = plain(e.itemRecipes());
  const items = e.seedItemsDB(), spells = e.seedSpellsDB();
  e.setState({items, spells});

  assert.equal(expansion.length, 61);
  assert.equal(new Set(expansion.map(it => it.id)).size, 61);
  assert.equal(expansion.filter(it => it.type === 'potion' || ['it_acid_vial', 'it_holy_water'].includes(it.id)).length, 12);
  assert.equal(expansion.filter(it => it.type === 'scroll').length, 10);
  assert.equal(expansion.filter(it => it.tool).length, 12);
  assert.equal(expansion.filter(it => it.material && it.material.harvest).length, 16);
  assert.equal(expansion.filter(it => it.material && it.material.category === 'refined').length, 6);
  assert.equal(expansion.filter(it => it.material && it.material.category === 'component').length, 5);

  const knownTags = new Set(e.itemTagNames());
  for (const raw of expansion) {
    const item = items.find(it => it.id === raw.id);
    assert.ok(item, `${raw.id}: запись должна попасть в стартовую базу`);
    assert.ok(String(raw.desc || '').trim().length >= 120, `${raw.id}: описание слишком краткое`);
    assert.ok(String(raw.props || '').trim().length >= 45, `${raw.id}: игровые свойства слишком краткие`);
    assert.ok((raw.tags || []).length >= 2, `${raw.id}: нужны смысловые теги`);
    assert.deepEqual((raw.tags || []).filter(tag => !knownTags.has(tag)), [], `${raw.id}: у каждого тега должен быть цвет и подпись`);
    assert.deepEqual(plain(e.itemUseSchemaErrors(e.itemUsesOf(item), item.resource)), [], `${raw.id}: схема применения`);
    assert.deepEqual(plain(e.itemToolSchemaErrors(item.tool)), [], `${raw.id}: схема инструмента`);
    assert.deepEqual(plain(e.itemMaterialSchemaErrors(item.material)), [], `${raw.id}: схема материала`);
  }

  assert.equal(recipes.length, 20);
  assert.equal(new Set(recipes.map(r => r.id)).size, 20);
  const itemIds = new Set(items.map(it => it.id));
  for (const recipe of recipes) {
    assert.deepEqual(plain(e.craftingRecipeSchemaErrors(recipe, itemIds)), [], recipe.id);
    assert.ok(e.recipesUsingItem(recipe.result.itemId).some(r => r.id === recipe.id), `${recipe.id}: обратная связь результата`);
    for (const toolId of recipe.toolIds) assert.ok(e.craftRecipesForTool(toolId).some(r => r.id === recipe.id), `${recipe.id}: связь инструмента`);
  }
});

test('ремесло проверяет все входы до списания, повторно валидирует план и блокируется в бою', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const crafter = hero('smith', {inventory: [
    {id: 'tool', itemId: 'it_tool_smith', qty: 1},
    {id: 'ore-a', itemId: 'it_mat_iron_ore', qty: 1},
    {id: 'ore-b', itemId: 'it_mat_iron_ore', qty: 1},
    {id: 'coal', itemId: 'it_mat_coal', qty: 1},
    {id: 'ingots', itemId: 'it_mat_iron_ingot', qty: 2},
  ]});
  e.setState({chars: [crafter], items});

  const stale = e.craftPlanFor(crafter, 'cr_iron_ingot');
  assert.equal(stale.ok, true);
  crafter.inventory.find(x => x.id === 'coal').qty = 0;
  const beforeFailedCommit = plain(crafter.inventory);
  const rejected = e.commitCraftPlan(stale);
  assert.equal(rejected.ok, false);
  assert.deepEqual(plain(crafter.inventory), beforeFailedCommit, 'устаревший план не списывает часть руды');

  crafter.inventory.find(x => x.id === 'coal').qty = 1;
  const done = e.commitCraftPlan(e.craftPlanFor(crafter, 'cr_iron_ingot'));
  assert.equal(done.ok, true);
  assert.equal(e.inventoryItemQty(crafter, 'it_mat_iron_ore'), 0);
  assert.equal(e.inventoryItemQty(crafter, 'it_mat_coal'), 0);
  assert.equal(e.inventoryItemQty(crafter, 'it_mat_iron_ingot'), 3);
  assert.equal(e.inventoryItemQty(crafter, 'it_tool_smith'), 1, 'инструмент не расходуется');

  e.setState({chars: [crafter], items, combat: {active: true, order: [{kind: 'ally', id: crafter.id}]}});
  const inCombat = e.craftPlanFor(crafter, 'cr_iron_ingot');
  assert.equal(inCombat.ok, false);
  assert.match(inCombat.reason, /активного боя/);
});

test('свитки проверяют список класса, расходуются при неудачной проверке высокого круга и не берут бонус Ловкости', () => {
  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB(), foes = e.seedFoesDB();
  const mageArmor = items.find(it => it.id === 'it_scroll_mage_armor');
  const cleric = hero('cleric', {cls: 'Жрец', inventory: [{id: 'mage-scroll', itemId: mageArmor.id, qty: 1}]});
  e.setState({chars: [cleric], items, spells});
  assert.equal(e.scrollUseCheck(cleric, e.itemUseOf(mageArmor, 'cast')).ok, false);
  assert.equal(e.useItemApply('mage-scroll', cleric.id, `ally:${cleric.id}`, null, 'cast'), false);
  assert.equal(cleric.inventory[0].qty, 1, 'непонятный свиток не расходуется');

  const fly = items.find(it => it.id === 'it_scroll_fly');
  const wizard = hero('wizard', {cls: 'Волшебник', level: 1, ab: {str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10},
    inventory: [{id: 'fly-scroll', itemId: fly.id, qty: 2}]});
  e.setState({chars: [wizard], items, spells});
  const flyUse = e.itemUseOf(fly, 'cast'), flyTarget = e.targetInfoOf(`ally:${wizard.id}`);
  const flySpec = e.itemUseSpecOf(wizard, fly, flyUse, flyTarget, {});
  assert.equal(flySpec.rows.find(r => r.key === 'scrollcheck').dc, 13);
  const failed = e.resolveOutcome(flySpec, {scrollcheck: 9});
  assert.equal(failed.scrollOk, false);
  assert.equal(e.useItemApply('fly-scroll', wizard.id, `ally:${wizard.id}`, failed, 'cast'), true);
  assert.equal(wizard.inventory[0].qty, 1);
  assert.equal(wizard.activeFx.length, 0, 'провал не накладывает полет');

  const passed = e.resolveOutcome(flySpec, {scrollcheck: 10});
  assert.equal(passed.scrollOk, true);
  assert.equal(e.useItemApply('fly-scroll', wizard.id, `ally:${wizard.id}`, passed, 'cast'), true);
  assert.equal(wizard.inventory.length, 0);
  assert.equal(wizard.activeFx.some(x => x.fx.some(f => f.stat === 'speed.fly')), true);
  assert.equal(e.concEntriesOf(wizard.id).length, 1);

  const guiding = items.find(it => it.id === 'it_scroll_guiding_bolt');
  const blessedCleric = hero('blessed-cleric', {cls: 'Жрец', activeFx: [{uid: 'bonuses', k: 'test', id: 'bonuses', label: 'Бонусы', fx: [
    {stat: 'attack.dex', mode: 'adv', value: 1},
    {stat: 'attack', mode: 'die', value: '1d4'},
  ]}]});
  const goblin = foes.find(f => f.id === 'foe_goblin_scout');
  e.setState({chars: [blessedCleric], items, spells, foes: [goblin]});
  const guidingSpec = e.itemUseSpecOf(blessedCleric, guiding, e.itemUseOf(guiding, 'cast'), e.targetInfoOf(`foe:${goblin.id}`), {});
  const attackRow = guidingSpec.rows.find(r => r.type === 'atk');
  assert.equal(attackRow.mod, 5);
  assert.equal(attackRow.adv, 0, 'преимущество только к атакам Ловкостью не меняет свиток');
  assert.equal(guidingSpec.rows.some(r => r.addTo === 'atk' && r.sides === 4), true, 'общая кость к атаке действует');
});

test('зелья применяют сопротивление, временные хиты, d4, минимум Силы и триггер невидимости', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const adventurer = hero('adventurer', {hpTemp: 4, inventory: [
    {id: 'fire', itemId: 'it_potion_fire_resistance', qty: 1},
    {id: 'heroism', itemId: 'it_potion_heroism', qty: 1},
    {id: 'giant', itemId: 'it_potion_hill_giant_strength', qty: 1},
    {id: 'invisible', itemId: 'it_potion_invisibility', qty: 1},
  ]});
  e.setState({chars: [adventurer], items});

  assert.equal(e.useItemApply('fire', adventurer.id, `ally:${adventurer.id}`, null, 'drink'), true);
  assert.equal(e.dmgAfterTraits(adventurer, 9, 'огонь').amount, 4);

  const heroism = items.find(it => it.id === 'it_potion_heroism'), heroismUse = e.itemUseOf(heroism, 'drink');
  const heroismSpec = e.itemUseSpecOf(adventurer, heroism, heroismUse, e.targetInfoOf(`ally:${adventurer.id}`), {});
  const heroismOutcome = e.resolveOutcome(heroismSpec, {temp: 0});
  assert.equal(heroismOutcome.tempTotal, 10);
  assert.equal(e.useItemApply('heroism', adventurer.id, `ally:${adventurer.id}`, heroismOutcome, 'drink'), true);
  assert.equal(adventurer.hpTemp, 10);
  assert.equal(e.rollFxEntries(adventurer, 'attack.str').some(f => f.mode === 'die' && f.value === '1d4'), true);
  assert.equal(e.rollFxEntries(adventurer, 'save.wis').some(f => f.mode === 'die' && f.value === '1d4'), true);

  assert.equal(e.eAb(adventurer, 'str'), 10);
  assert.equal(e.useItemApply('giant', adventurer.id, `ally:${adventurer.id}`, null, 'drink'), true);
  assert.equal(e.eAb(adventurer, 'str'), 21);

  assert.equal(e.useItemApply('invisible', adventurer.id, `ally:${adventurer.id}`, null, 'drink'), true);
  assert.equal(e.effectiveConditions(adventurer).includes('Невидимый'), true);
  e.endTriggeredSpellEffects(adventurer, 'attack');
  assert.equal(e.effectiveConditions(adventurer).includes('Невидимый'), false);
});

test('святая вода проверяет тип цели, а малое восстановление проверяет состояние до расхода', () => {
  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB(), foes = e.seedFoesDB();
  const holy = items.find(it => it.id === 'it_holy_water');
  const thrower = hero('thrower', {inventory: [{id: 'holy', itemId: holy.id, qty: 2}]});
  const goblin = foes.find(f => f.id === 'foe_goblin_scout'), zombie = foes.find(f => f.id === 'foe_zombie');
  zombie.hp = zombie.hpMax = 30;
  e.setState({chars: [thrower], items, spells, foes: [goblin, zombie]});
  const hit = {hit: true, attackMade: true, saveOk: null, dmgRaw: 7, dmgTotal: 7, dmgType: 'сияние',
    damageParts: [{type: 'сияние', raw: 7, total: 7}], effectAllowed: true, verdict: [], notes: []};
  assert.equal(e.useItemApply('holy', thrower.id, `foe:${goblin.id}`, hit, 'throw'), false);
  assert.equal(thrower.inventory[0].qty, 2);
  assert.equal(e.useItemApply('holy', thrower.id, `foe:${zombie.id}`, hit, 'throw'), true);
  assert.equal(thrower.inventory[0].qty, 1);
  assert.equal(zombie.hp, 23);

  const restoration = items.find(it => it.id === 'it_scroll_lesser_restoration');
  const cleric = hero('restorer', {cls: 'Жрец', level: 3, inventory: [{id: 'restoration', itemId: restoration.id, qty: 1}]});
  const patient = hero('patient');
  e.setState({chars: [cleric, patient], items, spells});
  assert.equal(e.useItemApply('restoration', cleric.id, `ally:${patient.id}`, null, 'cast', {choice: 'Отравленный'}), false);
  assert.equal(cleric.inventory[0].qty, 1);
  patient.cond.push('Отравленный');
  assert.equal(e.useItemApply('restoration', cleric.id, `ally:${patient.id}`, null, 'cast', {choice: 'Отравленный'}), true);
  assert.equal(cleric.inventory.length, 0);
  assert.equal(e.effectiveConditions(patient).includes('Отравленный'), false);
});

test('стоимостные алмазы покрывают нужные заклинания и расходуются ровно по правилу', () => {
  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB();
  const cases = [
    ['sp_chromatic_orb', 'it_component_diamond_50', 0],
    ['sp_оживление', 'it_component_diamonds_300', 1],
    ['sp_воскрешение_мертвого', 'it_component_diamond_500', 1],
    ['sp_воскрешение', 'it_component_diamond_1000', 1],
    ['sp_истинное_воскрешение', 'it_component_diamonds_25000', 1],
  ];
  const caster = hero('component-caster', {inventory: cases.map(([spellId, itemId], i) => ({id: `component-${i}`, itemId, qty: 2}))});
  e.setState({chars: [caster], items, spells});

  for (let i = 0; i < cases.length; i++) {
    const [spellId, itemId, consume] = cases[i], spell = spells.find(sp => sp.id === spellId);
    assert.ok(spell, `${spellId}: заклинание есть в базе`);
    const comp = e.parseComponents(spell);
    assert.equal(e.materialPlanFor(caster, spell, comp, {substitute: true}).ok, false, 'стоимостный компонент нельзя заменить фокусировкой');
    const plan = e.materialPlanFor(caster, spell, comp, {entryId: `component-${i}`, use: consume});
    assert.equal(plan.ok, true, `${spellId}: ${plan.reason || ''}`);
    assert.equal(e.commitMaterialPlan(caster, plan).ok, true);
    assert.equal(e.inventoryItemQty(caster, itemId), 2 - consume);
  }
});

test('матрица всей базы не допускает урон при промахе и длительный эффект после успешного спасброска', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), foes = e.seedFoesDB();
  const allSaves = {str: true, dex: true, con: true, int: true, wis: true, cha: true};
  const maxAb = {str: 30, dex: 30, con: 30, int: 30, wis: 30, cha: 30};
  const caster = hero('caster', {level: 20, ab: {str: 18, dex: 18, con: 18, int: 18, wis: 20, cha: 18}});
  const defender = hero('defender', {level: 20, acOverride: 30, ab: maxAb, saves: allSaves, hp: 1000, hpMax: 1000});
  const target = {id: 'matrix-target', n: 'Матричная цель', kind: 'monster', ac: 30, hp: 1000, hpMax: 1000, hpTemp: 0,
    abil: maxAb, saveP: allSaves, profB: 6, resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [], combatActions: []};
  e.setState({chars: [caster, defender], spells, abilities, foes: foes.concat(target)});

  const valuesFor = (spec, attackNatural, saveNatural) => {
    const v = {};
    spec.rows.forEach(row => {
      if(row.type === 'atk'){
        v[row.key] = attackNatural;
        if(row.adv) v[row.key + '_2'] = attackNatural;
      } else if(row.type === 'save'){
        v[row.key] = saveNatural;
        if(row.adv) v[row.key + '_2'] = saveNatural;
      } else if(row.type === 'dmg') v[row.key] = row.fixed ? 0 : Math.max(0, (+row.cnt || 0) * (attackNatural === 20 ? 2 : 1));
      else if(row.type === 'heal' || row.type === 'temp' || row.type === 'sleep') v[row.key] = row.fixed ? 0 : Math.max(0, +row.cnt || 0);
      else if(row.natural){ v[row.key] = 10; if(row.adv) v[row.key + '_2'] = 10; }
      else v[row.key] = row.cnt ? +row.cnt : null;
    });
    return v;
  };
  let attackCases = 0, saveCases = 0;
  const verify = (label, spec) => {
    const hasAttack = spec.rows.some(r => r.type === 'atk');
    const hasSave = spec.rows.some(r => r.type === 'save');
    const hasDamage = spec.rows.some(r => r.type === 'dmg');
    if(hasAttack){
      const out = e.resolveOutcome(spec, valuesFor(spec, 1, 20), {});
      assert.equal(out.hit, false, `${label}: натуральная 1 должна быть промахом`);
      if(hasDamage) assert.equal(out.dmgTotal, 0, `${label}: промах провел урон`);
      assert.equal(out.effectAllowed, false, `${label}: промах разрешил длительный эффект`);
      attackCases++;
    }
    if(hasSave && !spec.rows.some(r => r.type === 'threshold')){
      const out = e.resolveOutcome(spec, valuesFor(spec, 20, 20), {});
      assert.equal(out.saveOk, true, `${label}: сильная цель не прошла контрольный спасбросок`);
      assert.equal(out.effectAllowed, false, `${label}: успешный спасбросок разрешил длительный эффект`);
      (out.damageParts || []).forEach(part => {
        if(part.saveMode === 'zero') assert.equal(part.total, 0, `${label}: отменяемый компонент пережил спасбросок`);
        if(part.saveMode === 'half') assert.ok(part.total <= Math.floor(part.raw / 2), `${label}: половинный компонент не уменьшен`);
      });
      saveCases++;
    }
  };

  spells.forEach(rec => verify(`заклинание ${rec.n}`, e.rollSpecOf(rec, {caster, kind: 'spell', slotLvl: +rec.l || 0,
    target: e.targetInfoOf(`foe:${target.id}`), within5: false})));
  abilities.forEach(rec => verify(`способность ${rec.n}`, e.rollSpecOf(rec, {caster, kind: 'ability',
    target: e.targetInfoOf(`foe:${target.id}`), within5: false})));
  foes.forEach(foe => (foe.combatActions || []).forEach(action => verify(`${foe.n}: ${action.n}`,
    e.foeActionSpecOf(foe, action, e.targetInfoOf(`ally:${defender.id}`), {within5: false}))));
  assert.ok(attackCases > 50, `проверено слишком мало атак: ${attackCases}`);
  assert.ok(saveCases > 40, `проверено слишком мало спасбросков: ${saveCases}`);
});

test('парсер различает два вида урона, формулу зелья и фиксированный урон оружия', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), items = e.seedItemsDB();
  const caster = hero('caster', {level: 20, cls: 'Воин', ab: {str: 18, dex: 14, con: 14, int: 10, wis: 10, cha: 10}});
  e.setState({chars: [caster], spells, items});

  const meteor = spells.find(x => x.n === 'Метеоритный дождь');
  const meteorRows = e.rollSpecOf(meteor, {caster, kind: 'spell', slotLvl: 9}).rows.filter(r => r.type === 'dmg');
  assert.deepEqual(plain(meteorRows.map(r => [r.cnt, r.sides, r.dmgType])), [[20, 6, 'огонь'], [20, 6, 'дробящий']]);

  const potion = items.find(x => /^Зелье лечения/.test(x.n));
  assert.equal(e.rollSpecOf(potion, {caster, kind: 'item'}).rows.length, 0,
    'карточка предмета не должна исполнять кости из описания');
  const heal = e.itemUseSpecOf(caster, potion, e.itemUsesOf(potion)[0], {kind: 'ally', known: true, name: caster.name, obj: caster}).rows.find(r => r.type === 'heal');
  assert.deepEqual(plain([heal.cnt, heal.sides, heal.mod]), [2, 4, 2]);

  const blowgun = items.find(x => x.n === 'Духовая трубка');
  const fixed = e.weaponSpecOf(caster, blowgun, {kind: 'none', known: false}, {}).rows.find(r => r.type === 'dmg');
  assert.equal(fixed.fixed, true);
  assert.equal(fixed.mod, 3); // 1 фиксированный + 2 Ловкости
});

test('пассивные черты не становятся действиями, а дыхание и стойкость имеют заряды', () => {
  const e = loadEngine();
  const abilities = e.seedAbilitiesDB();
  const lucky = abilities.find(x => /^Везучий/.test(x.n));
  const breath = abilities.find(x => /^Оружие дыхания/.test(x.n));
  const relentless = abilities.find(x => /^Непоколебимая стойкость/.test(x.n));

  assert.equal(e.abilityIsActive(lucky), false);
  assert.equal(e.isPassiveAbility(lucky), true);
  assert.deepEqual([breath.mode, breath.uses, breath.rest], ['active', 1, 'короткий отдых']);
  assert.deepEqual([relentless.mode, relentless.uses, relentless.rest], ['triggered', 1, 'длинный отдых']);
  assert.equal(e.abilityIsActive(relentless), false);
});

test('преимущество цели и одноразовая кость спасброска проходят через общую формулу', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {1: {max: 1, cur: 1}}});
  const target = hero('target');
  const saveSpell = {id: 'save', n: 'Проверка пламени', l: 1, cm: '—', d: 'Мгновенная', x: 'Цель совершает спасбросок Ловкости.'};
  e.setState({chars: [caster, target], spells: [saveSpell]});

  e.applyFxTo(target.id, {k: 'spell', id: 'haste', label: 'Ускорение', fx: [{stat: 'save.dex', mode: 'adv', value: 1}]});
  let spec = e.rollSpecOf(saveSpell, {caster, kind: 'spell', slotLvl: 1, target: e.targetInfoOf(`ally:${target.id}`)});
  assert.equal(spec.rows.find(r => r.type === 'save').adv, 1);
  e.removeActiveFx(target.id, target.activeFx[0].uid);

  e.applyFxTo(target.id, {k: 'spell', id: 'resistance', label: 'Сопротивление',
    fx: [{stat: 'save', mode: 'die', value: '1d4', consume: 'roll'}]});
  const uid = target.activeFx[0].uid;
  spec = e.rollSpecOf(saveSpell, {caster, kind: 'spell', slotLvl: 1, target: e.targetInfoOf(`ally:${target.id}`)});
  const out = e.resolveOutcome(spec, {save: 10, savefx0: 4}, {});
  assert.equal(out.saveOk, true);
  assert.equal(e.castSpellApply(saveSpell.id, caster.id, `ally:${target.id}`, '', undefined, '1', {
    saveOk: out.saveOk, effectAllowed: out.effectAllowed, dmgRaw: null, dmgTotal: null, verdict: out.verdict,
    consumeTargetFx: [uid]
  }), true);
  assert.equal(target.activeFx.some(x => x.uid === uid), false);
});

test('сопротивление от эффекта и уязвимость применяются в каноническом порядке', () => {
  const e = loadEngine();
  const target = hero('target', {vuln: ['огонь']});
  target.activeFx.push({uid: 'fire-res', k: 'ability', id: 'fire-res', label: 'Сопротивление огню',
    fx: [{stat: 'note', mode: 'text', value: 'сопротивление урону: огнем'}]});
  e.setState({chars: [target]});

  assert.deepEqual(plain(e.dmgAfterTraits(target, 5, 'огонь')), {
    amount: 4,
    note: 'сопротивление «огонь» + уязвимость к «огонь»'
  });
  assert.ok(target.activeFx[0].fx.some(x => x.stat === 'damage.rule'), 'старый текстовый эффект мигрирован в типизированное правило');
  assert.equal(target.activeFx[0].effectSchemaVersion, 1);
});

test('Непоколебимая стойкость и зелье последовательно меняют один боевой лист', () => {
  const e = loadEngine();
  const abilities = e.seedAbilitiesDB(), items = e.seedItemsDB();
  const relentless = abilities.find(x => /^Непоколебимая стойкость/.test(x.n));
  const potion = items.find(x => /^Зелье лечения/.test(x.n));
  const target = hero('target', {
    hp: 10, hpMax: 30,
    abilities: [{abilityId: relentless.id, cur: 1}],
    inventory: [{id: 'potion-entry', itemId: potion.id, qty: 1}]
  });
  e.setState({chars: [target], abilities, items});

  const hit = e.applyDamageTo(`ally:${target.id}`, 20, 'рубящий', 'Удар', {});
  assert.equal(hit.relentless, true);
  assert.equal(target.hp, 1);
  assert.equal(target.abilities[0].cur, 0);
  assert.equal(e.effectiveConditions(target).includes('Бессознательный'), false);

  assert.equal(e.useItemApply('potion-entry', target.id, `ally:${target.id}`, {
    healTotal: 6, dmgRaw: null, dmgTotal: null, effectAllowed: true, verdict: []
  }), true);
  assert.equal(target.hp, 7);
  assert.equal(target.inventory.length, 0);
});

test('структурированное зелье в бою тратит одно действие и один флакон, но не оставляет пассивный эффект', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), foes = e.seedFoesDB();
  const potion = items.find(x => /^Зелье лечения/.test(x.n)), enemy = foes.find(x => x.id === 'foe_goblin_scout');
  const caster = hero('caster', {hp: 1, hpMax: 20, inventory: [{id: 'potion', itemId: potion.id}]});
  e.setState({chars: [caster], items, foes});
  assert.equal(e.itemUseOf(potion, 'drink').target, 'any', 'зелье можно дать любому существу, а не только герою');
  assert.equal(e.combatStart([{kind: 'ally', id: caster.id, nat: 20}, {kind: 'foe', id: enemy.id, nat: 1}], 'Зелье'), true);

  assert.equal(e.combatUseItem('potion', 'drink'), true);
  assert.equal(e.useItemApply('potion', caster.id, `ally:${caster.id}`, {
    healTotal: 6, dmgRaw: null, dmgTotal: null, hit: null, saveOk: null, effectAllowed: true, verdict: [], notes: []
  }, 'drink'), true);
  assert.equal(caster.hp, 7);
  assert.equal(caster.inventory.length, 0);
  assert.equal(e.state().combat.turn.actionsUsed, 1);
  assert.equal(caster.activeFx.length, 0);
});

test('набор целителя проверяет точную цель до расхода и стабилизирует только выбранного умирающего', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const kit = items.find(x => x.id === 'it_healer_kit_t');
  const medic = hero('medic', {inventory: [{id: 'kit', itemId: kit.id, qty: 1}]});
  const healthy = hero('healthy'), down = hero('down', {hp: 0, deaths: {s: 0, f: 2}, cond: ['Бессознательный']});
  e.setState({chars: [medic, healthy, down], items});

  assert.equal(e.useItemApply('kit', medic.id, `ally:${healthy.id}`, null, 'stabilize'), false);
  assert.equal(medic.inventory[0].kit, undefined);
  assert.deepEqual(plain(down.deaths), {s: 0, f: 2});

  assert.equal(e.useItemApply('kit', medic.id, `ally:${down.id}`, null, 'stabilize'), true);
  assert.equal(medic.inventory[0].kit, 9);
  assert.deepEqual(plain(down.deaths), {s: 3, f: 0});
  assert.equal(down.hp, 0);
  assert.equal(e.effectiveConditions(down).includes('Бессознательный'), true);
});

test('противоядие дает преимущество только спасброскам от яда и участвует в дыхании зеленого дракона', () => {
  const e = loadEngine(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  const antitoxin = items.find(x => x.n === 'Противоядие');
  const target = hero('target', {inventory: [{id: 'anti', itemId: antitoxin.id, qty: 1}]});
  e.setState({chars: [target], items, foes});
  assert.equal(e.itemUseOf(antitoxin, 'drink').target, 'any');
  assert.equal(e.rollFxEntries(target, 'save.con', ['poison']).length, 0, 'флакон в рюкзаке не действует пассивно');
  const zombie = foes.find(x => x.id === 'foe_zombie');
  assert.equal(e.useItemApply('anti', target.id, `foe:${zombie.id}`, null, 'drink'), false, 'противоядие не помогает нежити');
  assert.equal(target.inventory[0].qty, 1, 'неподходящая цель не расходует флакон');
  assert.equal(e.useItemApply('anti', target.id, `ally:${target.id}`, null, 'drink'), true);
  assert.equal(target.inventory.length, 0);
  assert.equal(e.rollFxEntries(target, 'save.con', ['poison']).some(x => x.mode === 'adv'), true);
  assert.equal(e.rollFxEntries(target, 'save.con').some(x => x.mode === 'adv'), false);

  const dragon = foes.find(x => /Молодой зеленый дракон/.test(x.n));
  const breath = dragon.combatActions.find(x => x.id === 'poison_breath');
  const breathSpec = e.foeActionSpecOf(dragon, breath, e.targetInfoOf(`ally:${target.id}`), {});
  assert.equal(breathSpec.rows.find(x => x.type === 'save').adv, 1);
  const ordinary = e.rollSpecOf({n: 'Толчок', l: 0, x: 'Цель совершает спасбросок Телосложения.'},
    {caster: target, kind: 'ability', target: e.targetInfoOf(`ally:${target.id}`)});
  assert.equal(ordinary.rows.find(x => x.type === 'save').adv, 0);
});

test('масло сверяется с КД, расходуется и дает ровно один отдельный всплеск огненного урона', () => {
  const e = loadEngine(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  const oil = items.find(x => x.n === 'Масло (фляга)'), target = foes.find(x => x.id === 'foe_goblin_scout');
  target.hp = target.hpMax = 30; target.resist = ['огонь'];
  const user = hero('user', {inventory: [{id: 'oil', itemId: oil.id, qty: 3}]});
  e.setState({chars: [user], items, foes});

  const miss = {hit: false, attackMade: true, saveOk: null, dmgRaw: null, dmgTotal: null, effectAllowed: false, verdict: [], notes: []};
  assert.equal(e.useItemApply('oil', user.id, `foe:${target.id}`, miss, 'throw'), true);
  assert.equal(user.inventory[0].qty, 2);
  assert.equal(target.activeFx.some(x => x.itemTrigger === 'oil'), false);

  const hit = {hit: true, attackMade: true, saveOk: null, dmgRaw: null, dmgTotal: null, effectAllowed: true, verdict: [], notes: []};
  assert.equal(e.useItemApply('oil', user.id, `foe:${target.id}`, hit, 'throw'), true);
  assert.equal(user.inventory[0].qty, 1);
  assert.equal(target.activeFx.some(x => x.itemTrigger === 'oil'), true);
  assert.equal(e.useItemApply('oil', user.id, `foe:${target.id}`, hit, 'throw'), true);
  assert.equal(user.inventory.length, 0);
  assert.equal(target.activeFx.filter(x => x.itemTrigger === 'oil').length, 1, 'повторное масло обновляет, а не складывает всплески +5');
  const mixedWithoutFire = e.applyDamageTo(`foe:${target.id}`, 3, 'смешанный: огонь + рубящий', 'Иммунный компонент', {fireDamage: 0});
  assert.equal(mixedWithoutFire.oilIgnited, false, 'нулевой огненный компонент смешанного урона не поджигает масло');
  assert.equal(target.activeFx.some(x => x.itemTrigger === 'oil'), true);
  const fire = e.applyDamageTo(`foe:${target.id}`, 5, 'огонь', 'Горящий факел', {});
  assert.equal(fire.oilIgnited, true);
  assert.equal(fire.oilExtra, 2, 'сопротивление огню отдельно уменьшает дополнительные 5 до 2');
  assert.equal(target.hp, 20);
  assert.equal(target.activeFx.some(x => x.itemTrigger === 'oil'), false);
  assert.equal(e.applyDamageTo(`foe:${target.id}`, 5, 'огонь', 'Второй огонь', {}).oilIgnited, false);
});

test('базовый яд связывает предмет, оружие, попадание, спасбросок и срок действия без автокидания', () => {
  const e = loadEngine(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  const poison = items.find(x => x.id === 'it_basic_poison'), sword = items.find(x => x.n === 'Короткий меч');
  const target = foes.find(x => x.id === 'foe_goblin_scout'); target.hp = target.hpMax = 40;
  const user = hero('user', {level: 5, ab: {str: 14, dex: 16, con: 10, int: 10, wis: 10, cha: 10},
    inventory: [{id: 'poison', itemId: poison.id, qty: 1}, {id: 'sword', itemId: sword.id, qty: 1}], equipment: {MAIN_HAND: 'sword'}});
  e.setState({chars: [user], items, foes});
  assert.equal(e.useItemApply('poison', user.id, `ally:${user.id}`, null, 'coat', {weaponEntryId: 'sword'}), true);
  assert.equal(user.inventory.some(x => x.id === 'poison'), false);
  const coating = user.activeFx.find(x => x.itemTrigger === 'basicPoison'); assert.ok(coating);

  let spec = e.weaponSpecOf(user, sword, e.targetInfoOf(`foe:${target.id}`), {entryId: 'sword', mode: 'melee'});
  assert.ok(spec.rows.some(x => x.key === 'save') && spec.rows.some(x => x.key === 'poisonDmg'));
  let out = e.resolveOutcome(spec, {atk: 1, dmg: 4}, {}); out.attackMade = true; out.poisonCoatingUid = spec.meta.poisonCoatingUid;
  assert.equal(e.weaponAttackApply('sword', user.id, `foe:${target.id}`, out), true);
  assert.ok(user.activeFx.find(x => x.uid === coating.uid), 'промах не высушивает яд на оружии');

  spec = e.weaponSpecOf(user, sword, e.targetInfoOf(`foe:${target.id}`), {entryId: 'sword', mode: 'melee'});
  out = e.resolveOutcome(spec, {atk: 10, dmg: 4, save: 1, poisonDmg: 3}, {}); out.attackMade = true; out.poisonCoatingUid = spec.meta.poisonCoatingUid;
  assert.equal(out.hit, true); assert.equal(out.saveOk, false); assert.equal(out.dmgTotal, 10);
  assert.equal(e.weaponAttackApply('sword', user.id, `foe:${target.id}`, out), true);
  assert.equal(target.hp, 30);
  assert.ok(user.activeFx.find(x => x.uid === coating.uid), 'яд на оружии действует всю минуту, как в 5e');

  spec = e.weaponSpecOf(user, sword, e.targetInfoOf(`foe:${target.id}`), {entryId: 'sword', mode: 'melee'});
  const savedValues = {atk: 10, dmg: 4, save: 20};
  out = e.resolveOutcome(spec, savedValues, {});
  assert.equal(e.validateFormulaValues(spec, savedValues, out).ok, true, 'при успешном спасброске кубик отмененного яда не требуется');
  assert.equal(out.dmgTotal, 7, 'успешный спасбросок отменяет яд, но не урон оружия с модификатором');
  e.advanceFxRound(10);
  assert.equal(user.activeFx.some(x => x.uid === coating.uid), false);
});

test('Посох Защиты различает действие и реакцию, точные заряды и срок Щита', () => {
  const e = loadEngine(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  const staff = items.find(x => x.id === 'it_staff_def'), enemy = foes.find(x => x.id === 'foe_goblin_scout');
  const mage = hero('mage', {inventory: [{id: 'staff', itemId: staff.id, qty: 1, att: false}], equipment: {MAIN_HAND: 'staff'}});
  e.setState({chars: [mage], items, foes});
  assert.equal(e.combatStart([{kind: 'foe', id: enemy.id, nat: 20}, {kind: 'ally', id: mage.id, nat: 10}], 'Реакция'), true);
  e.combatFocus(`ally:${mage.id}`);
  assert.equal(e.combatUseItem('staff', 'shield'), true);
  assert.equal(e.useItemApply('staff', mage.id, `ally:${mage.id}`, null, 'shield'), false);
  assert.equal(mage.inventory[0].ch.cur, 10);
  assert.equal(e.state().combat.order.find(x => x.kind === 'ally').reactionUsed, false);

  mage.inventory[0].att = true;
  e.advanceFxRound(1);
  const before = e.acTotal(mage);
  assert.equal(e.combatUseItem('staff', 'shield'), true);
  assert.equal(e.useItemApply('staff', mage.id, `ally:${mage.id}`, null, 'shield'), true);
  assert.equal(mage.inventory[0].ch.cur, 8);
  assert.equal(e.state().combat.order.find(x => x.kind === 'ally').reactionUsed, true);
  assert.equal(e.acTotal(mage), before + 5);
  e.closeCastModal();
  e.combatNextTurn();
  assert.equal(e.acTotal(mage), before);

  const doomed = hero('doomed', {inventory: [{id: 'last-staff', itemId: staff.id, qty: 1, att: true, ch: {cur: 1, max: 10}}],
    equipment: {MAIN_HAND: 'last-staff'}});
  e.setState({chars: [doomed], items});
  e.setAutoRolls([1]);
  assert.equal(e.useItemApply('last-staff', doomed.id, `ally:${doomed.id}`, null, 'mage_armor'), true);
  assert.equal(doomed.inventory.length, 0, 'd20 = 1 после последнего заряда уничтожает посох');
  assert.equal(doomed.equipment.MAIN_HAND, undefined);
  assert.ok(doomed.activeFx.some(x => x.id === staff.id), 'уже наложенный Магический доспех остается после разрушения посоха');
});

test('шарики создают проверяемую зону, а явная стоимость предмета не зависит от подписи кнопки', () => {
  const e = loadEngine(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  const balls = items.find(x => x.id === 'it_ball_bearings_s'), enemy = foes.find(x => x.id === 'foe_goblin_scout');
  const user = hero('user', {inventory: [{id: 'balls', itemId: balls.id, qty: 1}]});
  e.setState({chars: [user], items, foes});
  assert.equal(e.combatStart([{kind: 'ally', id: user.id, nat: 20}, {kind: 'foe', id: enemy.id, nat: 1}], 'Зона'), true);
  assert.equal(e.combatUseItem('balls', 'scatter'), true);
  assert.equal(e.useItemApply('balls', user.id, `ally:${user.id}`, null, 'scatter'), true);
  const zone = e.state().combat.zones[0]; assert.ok(zone);
  assert.equal(e.combatResolveItemZone(zone.id, `foe:${enemy.id}`, {saveOk: false}), true);
  assert.equal(e.effectiveFoeConditions(enemy).includes('Сбитый с ног'), true);
  assert.equal(e.state().combat.turn.actionsUsed, 1);

  const custom = {id: 'custom', n: 'Непредсказуемая подпись', type: 'equipment', tags: [], schemaVersion: 3, useMode: 'structured',
    passiveFx: [], uses: [{id: 'odd', label: 'Совершенно иное слово', cost: 'bonus', target: 'self', consume: {kind: 'none', amount: 0}}]};
  e.setState({chars: [user], items: [custom]});
  const action = e.itemActions(user, {id: 'custom-entry', itemId: custom.id, qty: 1}, custom).find(x => x.label === 'Совершенно иное слово');
  assert.equal(e.combatItemActionCost(action), 'bonus');
});

test('условный текст экипировки не становится постоянным бонусом, а требования доспеха работают механически', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const plate = items.find(x => x.n === 'Латы');
  const shirt = items.find(x => x.id === 'it_chain_shirt_leg');
  const seal = items.find(x => x.id === 'it_korlinn_seal');
  const wearer = hero('wearer', {race: 'Человек', speed: '9 м', ab: {str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10},
    inventory: [{id: 'plate', itemId: plate.id, qty: 1}, {id: 'shirt', itemId: shirt.id, qty: 1}, {id: 'seal', itemId: seal.id, qty: 1}],
    equipment: {CHEST: 'plate', RING: 'seal'}});
  e.setState({chars: [wearer], items});

  assert.equal(e.itemProfile(plate).armor.strReq, 15);
  assert.equal(e.speedTotal(wearer), '6 м', 'недостаток Силы для тяжелого доспеха снижает скорость на 3 м');
  assert.equal(e.rollFxEntries(wearer, 'skill.Скрытность').some(x => x.mode === 'dis'), true);
  let fx = e.charFxAll(wearer);
  ['skill.Атлетика', 'skill.Убеждение', 'skill.Запугивание', 'ab.str'].forEach(stat =>
    assert.equal(fx.some(x => x.stat === stat && x.mode === 'add'), false, `${stat} не должен выводиться из условного описания`));

  wearer.equipment.CHEST = 'shirt';
  e.setState({chars: [wearer], items});
  assert.equal(e.speedTotal(wearer), '9 м');
  assert.equal(e.itemProfile(shirt).armor.stealthDis, false, 'фраза «помеха отсутствует» не должна включать помеху');
  assert.equal(e.rollFxEntries(wearer, 'skill.Скрытность').some(x => x.mode === 'dis'), false);
  fx = e.charFxAll(wearer);
  assert.equal(fx.some(x => x.stat === 'skill.Атлетика' && x.mode === 'add'), false);

  const dwarf = hero('dwarf', {race: 'Дварф', speed: '7,5 м', ab: {str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 10},
    inventory: [{id: 'plate', itemId: plate.id, qty: 1}], equipment: {CHEST: 'plate'}});
  e.setState({chars: [dwarf], items});
  assert.equal(e.speedTotal(dwarf), '7,5 м', 'доспех не снижает скорость дварфа из-за недостатка Силы');
});

test('доспех без владения дает помеху всем броскам Силы и Ловкости и блокирует магию', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const plate = items.find(x => x.n === 'Латы'), sword = items.find(x => x.n === 'Длинный меч');
  const lightProf = {id: 'light-prof', n: 'Владение легкими доспехами', type: 'class', source: 'Тест', mode: 'passive',
    tags: ['passive'], uses: null, rest: '', x: 'Вы владеете легкими доспехами.'};
  const caster = hero('caster', {race: 'Человек', speed: '9 м', ab: {str: 16, dex: 14, con: 10, int: 10, wis: 16, cha: 10},
    inventory: [{id: 'plate', itemId: plate.id, qty: 1}, {id: 'sword', itemId: sword.id, qty: 1}],
    equipment: {CHEST: 'plate', MAIN_HAND: 'sword'}, abilities: [{abilityId: lightProf.id}]});
  const foe = {id: 'target', n: 'Цель', kind: 'monster', ac: 10, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [], combatActions: []};
  const spell = {id: 'spark', n: 'Искра', l: 0, cm: 'В, С', x: 'Совершите дальнобойную атаку заклинанием.'};
  e.setState({chars: [caster], items, abilities: [lightProf], foes: [foe], spells: [spell]});

  assert.equal(e.weaponSpecOf(caster, sword, e.targetInfoOf(`foe:${foe.id}`), {entryId: 'sword', mode: 'melee'}).rows.find(x => x.type === 'atk').adv, 2);
  assert.equal(e.rollFxEntries(caster, 'check.str').some(x => x.mode === 'dis'), true);
  assert.equal(e.rollFxEntries(caster, 'skill.Атлетика').some(x => x.mode === 'dis'), true);
  assert.equal(e.rollFxEntries(caster, 'save.dex').some(x => x.mode === 'dis'), true);
  assert.equal(e.rollFxEntries(caster, 'save.wis').some(x => x.mode === 'dis'), false);
  assert.equal(e.canCastCheck(caster, spell).ok, false);
});

test('дварфская устойчивость структурирует преимущество от яда и сопротивление урону', () => {
  const e = loadEngine(), abilities = e.seedAbilitiesDB();
  const resilience = abilities.find(x => x.id === 'ab_dwarf_resilience');
  const dwarf = hero('dwarf', {race: 'Дварф', abilities: [{abilityId: resilience.id}]});
  e.setState({chars: [dwarf], abilities});

  assert.equal(e.rollFxEntries(dwarf, 'save.con', ['poison']).some(x => x.mode === 'adv'), true);
  assert.equal(e.rollFxEntries(dwarf, 'save.con').some(x => x.mode === 'adv'), false);
  assert.equal(e.dmgAfterTraits(dwarf, 5, 'яд').amount, 2);
});

test('схема предмета заранее отклоняет опасные id, а явный ресурс сильнее текста описания', () => {
  const e = loadEngine();
  const bad = [{id: "bad'id", label: 'Плохое применение', cost: 'action', target: 'self', consume: {kind: 'none', amount: 0}}];
  assert.match(e.itemUseSchemaErrors(bad, null).map(x => x.message).join('\n'), /id должен начинаться/);
  assert.match(e.itemResourceSchemaErrors({kind: 'charges', max: 3, recharge: {cnt: 0, sides: 0, plus: 0}, when: ''}).join('\n'), /восстановления/);

  const explicit = {id: 'explicit', n: 'Явные заряды', type: 'equipment', tags: [],
    resource: {kind: 'charges', max: 5, recharge: {cnt: 1, sides: 4, plus: 1}, when: 'на закате'},
    desc: 'Предмет имеет 10 зарядов и восстанавливает все заряды на рассвете.'};
  const spec = e.itemSpec(explicit);
  assert.deepEqual(plain([spec.charges, spec.recharge, spec.when]), [5, {cnt: 1, sides: 4, plus: 1}, 'на закате']);
});

test('аудит сообщает точные ошибки нового предмета, монстра и межтабличных ссылок', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), items = e.seedItemsDB(), foes = e.seedFoesDB();
  items.push({id: 'broken-item', n: 'Сломанный предмет', type: 'equipment', tags: [], useMode: 'structured', uses: [], passiveFx: []});
  const brokenFoe = plain(foes[0]); brokenFoe.id = 'broken-foe'; brokenFoe.n = 'Неполный монстр'; delete brokenFoe.ac; foes.push(brokenFoe);
  const brokenHero = hero('broken', {inventory: [{id: 'missing-entry', itemId: 'does-not-exist', qty: 1}], equipment: {MAIN_HAND: 'ghost'},
    abilities: [{abilityId: 'missing-ability'}], spellbook: [{spellId: 'missing-spell'}]});
  e.setState({spells, abilities, items, foes, chars: [brokenHero]});
  const errors = e.gameDataAudit({spells, abilities, items, foes, chars: [brokenHero]}).errors.join('\n');
  assert.match(errors, /broken-item|Сломанный предмет/);
  assert.match(errors, /миграция схемы предмета/);
  assert.match(errors, /структурированный режим не содержит применений/);
  assert.match(errors, /Неполный монстр: отсутствует корректный КД/);
  assert.match(errors, /неизвестный предмет does-not-exist/);
  assert.match(errors, /слот MAIN_HAND ссылается на отсутствующую запись/);
  assert.match(errors, /неизвестная способность missing-ability/);
  assert.match(errors, /неизвестное заклинание missing-spell/);
});

test('миграция расовых черт чинит старое ё в ссылках и дополняет способности чейнджлинга', () => {
  const e = loadEngine();
  const abilities = e.seedAbilitiesDB(), races = e.seedRacesDB();
  const dragon = races.find(r => r.n === 'Драконорожденный');
  dragon.n = 'Драконорождённый';
  dragon.mechanics.features.forEach(f => { f.abilityId = f.abilityId.replace('драконорожденный', 'драконорожд_нный'); });
  const changeling = {
    id: 'race_changeling', n: 'Чейнджлинг', ab: '+2 Харизма, +1 к другой характеристике', sz: 'Средний', sp: '9 м',
    tr: [
      'Изменение внешности: действием вы можете изменить свой внешний вид и голос',
      'Инстинкты чейнджлинга: владение двумя навыками на выбор',
      'Языки: Общий и два любых языка на выбор'
    ], subs: []
  };
  e.upgradeRace(changeling); races.push(changeling);

  const before = abilities.length;
  const result = e.reconcileRaceAbilityReferences(races, abilities);
  assert.deepEqual(plain(result), {changed: true, linked: 4, added: 2});
  assert.equal(abilities.length, before + 2);
  assert.deepEqual(plain(changeling.mechanics.features.map(f => f.abilityId)), [
    'ab_sx_shapechange',
    'ab_чейнджлинг_инстинкты_чейнджлинга',
    'ab_чейнджлинг_языки'
  ]);
  assert.deepEqual(plain(dragon.mechanics.features.map(f => f.abilityId)), [
    'ab_драконорожденный_драконье_наследие',
    'ab_драконорожденный_оружие_дыхания',
    'ab_драконорожденный_сопротивление_урону_стихии_предка'
  ]);
  const items = e.seedItemsDB(), spells = e.seedSpellsDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();
  const errors = e.gameDataAudit({spells, abilities, items, races, classes, foes, chars: []}).errors;
  assert.equal(errors.some(msg => /race\[.*неизвестная способность/.test(msg)), false, errors.join('\n'));
});

test('Магический сон расходует общий пул от цели с наименьшими хитами', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB();
  const sleep = spells.find(x => x.n === 'Магический сон');
  sleep.cm = '—';
  const caster = hero('caster', {slots: {5: {max: 1, cur: 1}}});
  const foe = hp => ({id: `f${hp}`, n: `Враг ${hp}`, kind: 'monster', ac: 10, hp, hpMax: hp, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [], traits: ''});
  const a = foe(4), b = foe(7), c = foe(12);
  e.setState({chars: [caster], foes: [a, b, c], spells});

  assert.equal(e.castSpellApply(sleep.id, caster.id, `foe:${c.id}`, '', undefined, '5', {
    sleepTotal: 11, dmgRaw: null, dmgTotal: null, hit: null, saveOk: null, contestWin: null,
    effectAllowed: true, verdict: []
  }, [`foe:${b.id}`, `foe:${a.id}`]), true);
  assert.equal(e.effectiveFoeConditions(a).includes('Бессознательный'), true);
  assert.equal(e.effectiveFoeConditions(b).includes('Бессознательный'), true);
  assert.equal(e.effectiveFoeConditions(c).includes('Бессознательный'), false);
});

test('Слово силы убивает цель на пороге 100 хитов и не затрагивает 101', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), word = spells.find(x => x.n === 'Слово силы: смерть');
  const caster = hero('caster', {slots: {9: {max: 2, cur: 2}}});
  const foe = (id, hp) => ({id, n: id, kind: 'monster', ac: 10, hp, hpMax: 150, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []});
  const low = foe('low', 100), high = foe('high', 101);
  e.setState({chars: [caster], foes: [low, high], spells});

  assert.equal(e.castSpellApply(word.id, caster.id, `foe:${low.id}`, '', undefined, '9'), true);
  assert.equal(low.hp, 0);
  assert.equal(e.castSpellApply(word.id, caster.id, `foe:${high.id}`, '', undefined, '9'), true);
  assert.equal(high.hp, 101);
});

test('Контрзаклинание откатывает урон и эффекты именно последнего каста', () => {
  const e = loadEngine();
  const mage = hero('mage', {slots: {3: {max: 1, cur: 1}}});
  const counterer = hero('counterer', {slots: {3: {max: 1, cur: 1}}});
  const victim = hero('victim', {hp: 30, hpMax: 30});
  const blast = {id: 'blast', n: 'Взрыв', l: 3, cm: 'В', d: 'Мгновенная', x: 'Цель получает 8d6 урона огнем.'};
  const counter = {id: 'counter', n: 'Контрзаклинание', l: 3, cm: 'В', d: 'Мгновенная', x: ''};
  e.setState({chars: [mage, counterer, victim], spells: [blast, counter]});

  assert.equal(e.castSpellApply(blast.id, mage.id, `ally:${victim.id}`, '', undefined, '3', {
    dmgRaw: 10, dmgTotal: 10, dmgType: 'огонь', hit: null, saveOk: null, contestWin: null,
    effectAllowed: true, verdict: []
  }), true);
  assert.equal(victim.hp, 20);
  e.setPromptResults(['3']);
  assert.equal(e.castSpellApply(counter.id, counterer.id, `ally:${mage.id}`, '', undefined, '3'), true);
  assert.equal(victim.hp, 30);
  assert.equal(counterer.slots[3].cur, 0);
  assert.equal(e.state().lastCastEvent, null);
});

test('Рассеивание магии снимает с противника эффект по фактическому кругу', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {5: {max: 1, cur: 1}}});
  const foe = {id: 'foe', n: 'Враг', kind: 'monster', ac: 12, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [
      {uid: 'hold', k: 'spell', id: 'hold', label: 'Удержание', power: 5, fx: [{stat: 'condition', mode: 'text', value: 'Парализованный'}]}
    ]};
  const hold = {id: 'hold', n: 'Удержание', l: 2, cm: 'В', d: '1 мин.', x: ''};
  const dispel = {id: 'dispel', n: 'Рассеивание магии', l: 3, cm: 'В, С', d: 'Мгновенная', x: ''};
  e.setState({chars: [caster], foes: [foe], spells: [hold, dispel]});

  assert.equal(e.castSpellApply(dispel.id, caster.id, `foe:${foe.id}`, '', undefined, '5'), true);
  assert.equal(foe.activeFx.length, 0);
});

test('боевой раунд связывает Благословение, оружие и сопротивление противника', () => {
  const e = loadEngine();
  const items = e.seedItemsDB();
  const sword = items.find(x => x.n === 'Длинный меч');
  const cleric = hero('cleric', {slots: {1: {max: 1, cur: 1}}});
  const fighter = hero('fighter', {
    cls: 'Воин', level: 5, ab: {str: 18, dex: 12, con: 16, int: 10, wis: 10, cha: 10},
    inventory: [{id: 'sword-entry', itemId: sword.id, qty: 1}], equipment: {MAIN_HAND: 'sword-entry'}
  });
  const foe = {id: 'foe', n: 'Каменный страж', kind: 'monster', ac: 15, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: ['рубящий'], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  const bless = {id: 'bless', n: 'Благословение', l: 1, cm: 'В', d: 'Концентрация, 1 мин.', conc: true, x: ''};
  e.setState({chars: [cleric, fighter], foes: [foe], items, spells: [bless], classes: e.seedClassesDB()});

  assert.equal(e.castSpellApply(bless.id, cleric.id, `ally:${fighter.id}`, '', undefined, '1'), true);
  const spec = e.weaponSpecOf(fighter, sword, e.targetInfoOf(`foe:${foe.id}`), {});
  assert.equal(spec.rows.some(r => r.addTo === 'atk' && /Благословение/.test(r.label)), true);
  const rolls = e.resolveOutcome(spec, {atk: 8, wfx0: 4, dmg: 6}, {});
  assert.equal(rolls.hit, true);
  assert.equal(rolls.dmgTotal, 5); // (6 + 4 Силы) / 2 от сопротивления
  assert.equal(e.weaponAttackApply('sword-entry', fighter.id, `foe:${foe.id}`, {...rolls, attackMade: true}), true);
  assert.equal(foe.hp, 15);
  assert.equal(fighter.activeFx.some(x => x.id === bless.id), true);
});

test('Направляющий снаряд дает ровно одну следующую атаку с преимуществом', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), items = e.seedItemsDB();
  const bolt = spells.find(x => x.n === 'Направляющий снаряд');
  const sword = items.find(x => x.n === 'Длинный меч');
  const cleric = hero('cleric', {slots: {1: {max: 1, cur: 1}}});
  const fighter = hero('fighter', {cls: 'Воин', ab: {str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10},
    inventory: [{id: 'sword-entry', itemId: sword.id, qty: 1}], equipment: {MAIN_HAND: 'sword-entry'}});
  const foe = {id: 'foe', n: 'Цель', kind: 'monster', ac: 20, hp: 30, hpMax: 30, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  e.setState({chars: [cleric, fighter], foes: [foe], spells, items, classes: e.seedClassesDB()});

  assert.equal(e.castSpellApply(bolt.id, cleric.id, `foe:${foe.id}`, '', undefined, '1', {
    dmgRaw: 8, dmgTotal: 8, dmgType: 'излучение', hit: true, saveOk: null, contestWin: null,
    effectAllowed: true, verdict: [], notes: [], attackMade: true
  }), true);
  const mark = foe.activeFx.find(x => x.id === bolt.id);
  assert.ok(mark);

  const spec = e.weaponSpecOf(fighter, sword, e.targetInfoOf(`foe:${foe.id}`), {});
  assert.equal(spec.rows.find(r => r.type === 'atk').adv, 1);
  assert.deepEqual(plain(spec.meta.consumeTargetFx), [mark.uid]);
  assert.equal(e.weaponAttackApply('sword-entry', fighter.id, `foe:${foe.id}`, {
    dmgRaw: 5, dmgTotal: 0, dmgType: 'рубящий', hit: false, effectAllowed: false,
    verdict: [], notes: [], attackMade: true, consumeTargetFx: spec.meta.consumeTargetFx
  }), true);
  assert.equal(foe.activeFx.some(x => x.uid === mark.uid), false);
});

test('Огонь фей раскрывает невидимую цель только после проваленного спасброска', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), items = e.seedItemsDB();
  const faerie = spells.find(x => x.n === 'Огонь фей');
  const invis = spells.find(x => x.n === 'Невидимость');
  const sword = items.find(x => x.n === 'Длинный меч');
  const caster = hero('caster', {slots: {1: {max: 1, cur: 1}}});
  const attacker = hero('attacker', {cls: 'Воин', inventory: [{id: 'sword-entry', itemId: sword.id, qty: 1}]});
  const foe = {id: 'foe', n: 'Невидимка', kind: 'monster', ac: 12, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [{uid: 'invis', k: 'spell', id: invis.id,
      label: invis.n, casterId: 'other', stackKey: `spell:${invis.id}`, power: 2, fx: e.spellFxForCast(invis, 2)}]};
  e.setState({chars: [caster, attacker], foes: [foe], spells, items, classes: e.seedClassesDB()});

  const saveSpec = e.rollSpecOf(faerie, {caster, kind: 'spell', slotLvl: 1, target: e.targetInfoOf(`foe:${foe.id}`)});
  assert.ok(saveSpec.rows.some(r => r.type === 'save'));
  assert.ok(e.spellTargetLimit(faerie, 1) >= 2);
  assert.equal(e.castSpellApply(faerie.id, caster.id, `foe:${foe.id}`, '', undefined, '1', {
    dmgRaw: null, dmgTotal: null, hit: null, saveOk: false, contestWin: null,
    effectAllowed: true, verdict: [], notes: []
  }), true);
  const attack = e.weaponSpecOf(attacker, sword, e.targetInfoOf(`foe:${foe.id}`), {});
  assert.equal(attack.rows.find(r => r.type === 'atk').adv, 1);
});

test('Огненный шар одним кастом отдельно разбирает три цели в реальном бою', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), fireball = spells.find(x => x.n === 'Огненный шар');
  const focus = {id: 'focus', n: 'Магическая фокусировка', type: 'equipment', tags: ['focus'], desc: ''};
  const caster = hero('caster', {cls: 'Волшебник', level: 5, ab: {str: 10, dex: 10, con: 12, int: 16, wis: 10, cha: 10},
    slots: {3: {max: 1, cur: 1}}, inventory: [{id: 'focus-entry', itemId: focus.id, qty: 1}]});
  const foe = (id, traits = {}) => ({id, n: id, kind: 'monster', ac: 12, hp: 50, hpMax: 50, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [], ...traits});
  const a = foe('a'), b = foe('b', {resist: ['огонь']}), c = foe('c');
  e.setState({chars: [caster], foes: [a, b, c], spells, items: [focus]});

  const outcome = (target, save) => {
    const spec = e.rollSpecOf(fireball, {caster, kind: 'spell', slotLvl: 3, target: e.targetInfoOf(`foe:${target.id}`)});
    const damage = spec.rows.find(r => r.type === 'dmg');
    return e.resolveOutcome(spec, {[damage.key]: 20, save}, {});
  };
  const rollsA = outcome(a, 1), rollsB = outcome(b, 1), rollsC = outcome(c, 20);
  assert.equal(e.castSpellApply(fireball.id, caster.id, `foe:${a.id}`, '', {entryId: 'focus-entry', use: 0}, '3',
    rollsA, [`foe:${b.id}`, `foe:${c.id}`], {[`foe:${b.id}`]: rollsB, [`foe:${c.id}`]: rollsC}), true);
  assert.deepEqual([a.hp, b.hp, c.hp], [30, 40, 40]);
  assert.equal(caster.slots[3].cur, 0);
});

test('встроенная группа экипирована реактивно, без двойного учета импортированных бонусов', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const party = [e.buildRoku(), e.buildTorgar(), e.buildSeptih(), e.buildLegerem()];
  e.setState({chars: party, items, spells, abilities, classes});

  assert.deepEqual(party.map(c => e.acTotal(c)), [13, 18, 14, 16]);
  party.forEach(c => {
    c.inventory.forEach(entry => assert.ok(items.some(x => x.id === entry.itemId), `${c.name}: предмет ${entry.itemId} отсутствует в базе`));
    c.spellbook.forEach(entry => assert.ok(spells.some(x => x.id === entry.spellId), `${c.name}: заклинание ${entry.spellId} отсутствует в базе`));
    c.abilities.forEach(entry => assert.ok(abilities.some(x => x.id === entry.abilityId), `${c.name}: способность ${entry.abilityId} отсутствует в базе`));
    Object.values(c.equipment).forEach(id => assert.ok(c.inventory.some(x => x.id === id), `${c.name}: осиротевший слот ${id}`));
    assert.ok(['MAIN_HAND', 'TWO_HAND'].some(slot => c.equipment[slot]), `${c.name}: оружие не взято в руки`);
  });
  const septih = party[2];
  assert.equal(e.ammoRemaining(septih.inventory.find(x => x.itemId === 'it_стрелы_20'), items.find(x => x.id === 'it_стрелы_20')), 20);

  const legerem = party[3], axe = items.find(x => x.id === 'it_korlinn_axe');
  const axeSpec = e.weaponSpecOf(legerem, axe, {kind: 'none', known: false}, {entryId: 'inv_l6'});
  assert.equal(axeSpec.rows.find(r => r.type === 'dmg').mod, 3, 'Дуэлянт не должен усиливать двуручный топор');
  const talon = items.find(x => x.id === 'it_talon');
  assert.deepEqual(plain(e.weaponBonusOf(talon)), {atk: 1, dmg: 1});
});

test('пустое хранилище загружается сразу с экипированной группой и полным кампанийным бестиарием', async () => {
  const e = loadEngine();
  await e.loadAll();
  const state = e.state();
  assert.deepEqual(plain(state.chars.map(c => c.id)), ['char_roku','char_torgar','char_septih','char_legerem']);
  assert.equal(state.foesDB.length, 30);
  ['foe_goblin_scout','foe_skeleton_guard','foe_orc_raider','foe_dire_wolf','foe_young_green_dragon','foe_cave_oracle','foe_dark_elf_plotter']
    .forEach(id => assert.ok(state.foesDB.some(f => f.id === id), `нет записи ${id}`));
  state.chars.forEach(c => {
    Object.values(c.equipment).forEach(entryId => assert.ok(c.inventory.some(e => e.id === entryId), `${c.name}: слот ${entryId} не существует`));
    c.inventory.forEach(entry => assert.ok(state.itemsDB.some(it => it.id === entry.itemId), `${c.name}: предмет ${entry.itemId} осиротел`));
  });
});

test('стартовый бестиарий содержит исполняемые формулы каждого действия', () => {
  const e = loadEngine();
  const foes = e.seedFoesDB();
  assert.equal(foes.length, 30);
  const target = hero('target', {hp: 30, hpMax: 30, ab: {str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10}});
  e.setState({chars: [target], foes});
  foes.forEach(f => {
    ['size','creatureType','alignment','cr','acSource','hpFormula','speed','senses','langs','source'].forEach(k => assert.ok(String(f[k] || '').trim(), `${f.n}: нет ${k}`));
    assert.ok(Number.isFinite(f.ac) && f.ac > 0, `${f.n}: нет КД`);
    assert.ok(Number.isFinite(f.hpMax) && f.hpMax > 0, `${f.n}: нет хитов`);
    assert.equal(Object.keys(f.abil).length, 6, `${f.n}: не все характеристики`);
    assert.ok(f.combatActions.length, `${f.n}: нет структурированных действий`);
    f.combatActions.forEach(a => {
      assert.ok(['action','attack','bonus','reaction','turnfree'].includes(a.cost), `${f.n}/${a.n}: нет стоимости`);
      if (a.kind === 'utility') {
        assert.ok(a.combatEffect, `${f.n}/${a.n}: прием не связан с боем`);
        return;
      }
      const spec = e.foeActionSpecOf(f, a, e.targetInfoOf(`ally:${target.id}`));
      if ((a.damage || []).length) assert.ok(spec.rows.some(r => r.type === 'dmg'), `${f.n}/${a.n}: нет урона`);
      if (a.kind === 'attack') assert.ok(spec.rows.some(r => r.type === 'atk'), `${f.n}/${a.n}: нет d20 атаки`);
      if (a.save) assert.ok(spec.rows.some(r => r.type === 'save'), `${f.n}/${a.n}: нет спасброска`);
      assert.match(e.foeActionFormula(a), /d20|спасбросок|d\d+/);
    });
  });
  const html = e.renderWorld().foes;
  ['Гоблин-разведчик', 'Молодой зеленый дракон', 'Подземный глазач', 'КД', 'формула', 'Источник', 'Creative Commons Attribution 4.0', 'Провести действие']
    .forEach(x => assert.ok(html.includes(x), `нет индикатора «${x}»`));
});

test('миграция встроенного врага исправляет неполную запись и сохраняет последствия боя', () => {
  const e = loadEngine();
  const seed = e.seedFoesDB().find(f => f.id === 'foe_goblin_scout');
  const old = {id: seed.id, n: seed.n, ac: 10, hpMax: 2, hp: 0, hpTemp: 3, cond: ['Отравленный'],
    activeFx: [{uid: 'fx1', label: 'Метка', fx: []}], actionState: {shortbow: {ready: false}}, notes: 'мой экземпляр'};
  e.mergeBuiltinFoe(old, seed);

  assert.equal(old.ac, 15);
  assert.equal(old.acSource, 'кожаный доспех, щит');
  assert.equal(old.size, 'Маленький');
  assert.equal(old.hpMax, 7);
  assert.equal(old.hp, 0, 'поверженный экземпляр не должен ожить от миграции');
  assert.equal(old.hpTemp, 3);
  assert.deepEqual(plain(old.cond), ['Отравленный']);
  assert.equal(old.activeFx[0].uid, 'fx1');
  assert.equal(old.notes, 'мой экземпляр');
});

test('явные навыки и спасброски монстра участвуют в проверках вместо догадок по характеристике', () => {
  const e = loadEngine();
  const dragon = e.seedFoesDB().find(f => f.id === 'foe_young_green_dragon');
  e.setState({foes: [dragon]});
  const ti = e.targetInfoOf(`foe:${dragon.id}`);

  assert.equal(ti.saveMod('dex'), 4);
  assert.equal(ti.saveMod('con'), 6);
  assert.equal(ti.skillMod('Внимательность'), 7);
  assert.equal(ti.skillMod('Скрытность'), 4);
});

test('условная защита различает обычное, магическое и посеребренное оружие', () => {
  const e = loadEngine();
  const foes = e.seedFoesDB();
  const grick = foes.find(f => f.id === 'foe_grick');
  const wraith = foes.find(f => f.id === 'foe_wraith');

  assert.deepEqual(plain(e.dmgAfterTraits(grick, 9, 'рубящий', {magical: false})), {amount: 4, note: 'сопротивление «рубящий» при этих свойствах источника'});
  assert.equal(e.dmgAfterTraits(grick, 9, 'рубящий', {magical: true}).amount, 9);
  assert.equal(e.dmgAfterTraits(wraith, 9, 'колющий', {magical: false, silvered: false}).amount, 4);
  assert.equal(e.dmgAfterTraits(wraith, 9, 'колющий', {magical: false, silvered: true}).amount, 9);
});

test('Охристое желе реакцией делится от рубящего урона, вступает в ту же инициативу и не делится от промаха', () => {
  const e = loadEngine();
  const attacker = hero('attacker');
  const jelly = e.seedFoesDB().find(f => f.id === 'foe_ochre_jelly');
  e.setState({chars: [attacker], foes: [jelly]});
  e.combatStart([{kind: 'ally', id: attacker.id, nat: 20}, {kind: 'foe', id: jelly.id, nat: 10}], 'Разделение');
  const spec = {rows:[{key:'atk',type:'atk',side:'caster',natural:true,mod:5},{key:'dmg',type:'dmg',side:'caster',cnt:1,sides:8,mod:0,dmgType:'рубящий'}],
    meta:{target:e.targetInfoOf(`foe:${jelly.id}`),dmgType:'рубящий',attackMode:'melee',within5:true,damageTags:{magical:false}}};
  const rolls = e.resolveOutcome(spec, {atk: 10, dmg: 6}, {});

  assert.equal(rolls.hit, true);
  assert.equal(rolls.dmgTotal, 0, 'иммунитет к рубящему урону сохраняется');
  e.applyRollsToTarget(`foe:${jelly.id}`, rolls, 'Рубящий удар');
  assert.equal(e.state().foesDB.length, 2);
  assert.deepEqual(plain(e.state().foesDB.map(x => [x.size,x.hp])), [['Средний',22],['Средний',22]]);
  assert.equal(e.state().combat.order.filter(x => x.kind === 'foe').length, 2);
  assert.equal(e.state().combat.order.find(x => x.id === jelly.id).reactionUsed, true);

  const e2 = loadEngine(), attacker2 = hero('attacker2'), jelly2 = e2.seedFoesDB().find(f => f.id === 'foe_ochre_jelly');
  e2.setState({chars: [attacker2], foes: [jelly2]});
  const missSpec = {...spec, meta: {...spec.meta, target: e2.targetInfoOf(`foe:${jelly2.id}`)}};
  const miss = e2.resolveOutcome(missSpec, {atk: 1, dmg: 6}, {});
  e2.applyRollsToTarget(`foe:${jelly2.id}`, miss, 'Промах');
  assert.equal(e2.state().foesDB.length, 1);
});

test('укус гигантского паука не отменяет колющий урон успешным спасброском от яда', () => {
  const e = loadEngine();
  const spider = e.seedFoesDB().find(f => f.id === 'foe_giant_spider');
  const target = hero('target', {hp: 30, hpMax: 30});
  e.setState({chars: [target], foes: [spider]});
  const spec = e.foeActionSpecOf(spider, e.foeActionOf(spider, 'bite'), e.targetInfoOf(`ally:${target.id}`));

  const saved = e.resolveOutcome(spec, {atk: 10, dmg0: 4, dmg1: 8, save: 20}, {});
  assert.equal(saved.hit, true);
  assert.equal(saved.saveOk, true);
  assert.equal(saved.damageParts.find(p => p.type === 'колющий').total, 7);
  assert.equal(saved.damageParts.find(p => p.type === 'яд').total, 4);
  assert.equal(saved.dmgTotal, 11);

  const missing = e.resolveOutcome(spec, {atk: 10, dmg0: 4, dmg1: 8}, {});
  assert.equal(missing.damageParts.find(p => p.type === 'колющий').total, 7);
  assert.equal(missing.damageParts.find(p => p.type === 'яд').total, 0);
});

test('яд гигантского паука стабилизирует и парализует только когда именно он снижает цель до 0', () => {
  const e = loadEngine();
  const spider = e.seedFoesDB().find(f => f.id === 'foe_giant_spider');
  const target = hero('target', {hp: 10, hpMax: 20});
  e.setState({chars: [target], foes: [spider]});
  const bite = e.foeActionOf(spider, 'bite');
  const spec = e.foeActionSpecOf(spider, bite, e.targetInfoOf(`ally:${target.id}`));
  const rolls = e.resolveOutcome(spec, {atk: 10, dmg0: 4, dmg1: 8, save: 1}, {});

  assert.equal(e.foeActionApply(spider.id, bite.id, `ally:${target.id}`, rolls), true);
  assert.equal(target.hp, 0);
  assert.deepEqual(plain(target.deaths), {s: 3, f: 0});
  assert.ok(e.effectiveConditions(target).includes('Отравленный'));
  assert.ok(e.effectiveConditions(target).includes('Парализованный'));
  assert.equal(target.activeFx.find(x => x.id.endsWith(':poisoned-zero')).expiresAtRound, 601);

  const pierced = hero('pierced', {hp: 7, hpMax: 20});
  e.setState({chars: [pierced], foes: [spider]});
  const spec2 = e.foeActionSpecOf(spider, bite, e.targetInfoOf(`ally:${pierced.id}`));
  const rolls2 = e.resolveOutcome(spec2, {atk: 10, dmg0: 4, dmg1: 8, save: 1}, {});
  assert.equal(e.foeActionApply(spider.id, bite.id, `ally:${pierced.id}`, rolls2), true);
  assert.deepEqual(plain(pierced.deaths), {s: 0, f: 0});
  assert.equal(pierced.activeFx.some(x => x.id.endsWith(':poisoned-zero')), false);
});

test('областное действие монстра применяет отдельный спасбросок каждой цели и расходуется один раз', () => {
  const e = loadEngine();
  const first = hero('first', {hp: 50, hpMax: 50}), second = hero('second', {hp: 50, hpMax: 50});
  const dragon = e.seedFoesDB().find(f => f.id === 'foe_young_green_dragon');
  const breath = e.foeActionOf(dragon, 'poison_breath');
  e.setState({chars: [first, second], foes: [dragon]});
  const rolls = {
    [`ally:${first.id}`]: {dmgRaw: 36, dmgTotal: 36, dmgType: 'яд', damageParts: [{type: 'яд', raw: 36, total: 36}], saveOk: false, effectAllowed: true, verdict: [], notes: []},
    [`ally:${second.id}`]: {dmgRaw: 36, dmgTotal: 18, dmgType: 'яд', damageParts: [{type: 'яд', raw: 36, total: 18}], saveOk: true, effectAllowed: false, verdict: [], notes: []},
  };
  assert.equal(e.foeActionBatchApply(dragon.id, breath.id, Object.keys(rolls), rolls), true);
  assert.equal(first.hp, 14);
  assert.equal(second.hp, 32);
  assert.equal(dragon.actionState[breath.id].ready, false);
});

test('областное действие монстра атомарно отменяется, если нет броска одной из целей', () => {
  const e = loadEngine();
  const first = hero('first', {hp: 50, hpMax: 50}), second = hero('second', {hp: 50, hpMax: 50});
  const dragon = e.seedFoesDB().find(f => f.id === 'foe_young_green_dragon');
  const breath = e.foeActionOf(dragon, 'poison_breath');
  e.setState({chars: [first, second], foes: [dragon]});
  const firstTarget = `ally:${first.id}`, secondTarget = `ally:${second.id}`;
  const rolls = {
    [firstTarget]: {dmgRaw: 36, dmgTotal: 36, dmgType: 'яд', damageParts: [{type: 'яд', raw: 36, total: 36}], saveOk: false, effectAllowed: true, verdict: [], notes: []}
  };

  assert.equal(e.foeActionBatchApply(dragon.id, breath.id, [firstTarget, secondTarget], rolls), false);
  assert.equal(first.hp, 50, 'урон не должен применяться частично');
  assert.equal(second.hp, 50);
  assert.notEqual(dragon.actionState[breath.id] && dragon.actionState[breath.id].ready, false, 'перезарядка не тратится');
});

test('мультиатака монстра соблюдает порядок и условие попадания, сохраняя отдельные цели и d20', () => {
  const e = loadEngine();
  const target = hero('target');
  const owlbear = e.seedFoesDB().find(f => f.id === 'foe_owlbear');
  e.setState({chars: [target], foes: [owlbear]});
  e.combatStart([{kind: 'foe', id: owlbear.id, nat: 20}, {kind: 'ally', id: target.id, nat: 10}], 'Мультиатака');
  assert.equal(e.state().combat.turn.attackMax, 2);
  assert.equal(e.combatFoeAttackAllowed(owlbear, e.foeActionOf(owlbear, 'claws'), 'attack', true), false);
  assert.equal(e.combatFoeAttackAllowed(owlbear, e.foeActionOf(owlbear, 'beak'), 'attack', true), true);
  e.combatSpend('attack', 'Клюв', `foe:${owlbear.id}`);
  e.combatRecordFoeAttack(owlbear, e.foeActionOf(owlbear, 'beak'), `ally:${target.id}`, {hit: true});
  assert.equal(e.combatFoeAttackAllowed(owlbear, e.foeActionOf(owlbear, 'claws'), 'attack', true, `ally:${target.id}`), true);

  const e2 = loadEngine(), victim = hero('victim'), grick = e2.seedFoesDB().find(f => f.id === 'foe_grick');
  e2.setState({chars: [victim], foes: [grick]});
  e2.combatStart([{kind: 'foe', id: grick.id, nat: 20}, {kind: 'ally', id: victim.id, nat: 10}], 'Условная мультиатака');
  e2.combatSpend('attack', 'Щупальца', `foe:${grick.id}`);
  e2.combatRecordFoeAttack(grick, e2.foeActionOf(grick, 'tentacles'), `ally:${victim.id}`, {hit: false});
  assert.equal(e2.combatFoeAttackAllowed(grick, e2.foeActionOf(grick, 'beak'), 'attack', true, `ally:${victim.id}`), false);
  assert.equal(e2.state().combat.turn.attackMax, 1);
});

test('Парирование главаря расходует реакцию, дает +2 КД на одну входящую атаку и затем снимается', () => {
  const e = loadEngine();
  const sword = {id: 'test_sword', n: 'Тестовый меч', type: 'weapon', tags: ['melee'], dmg: '1d8', dmgType: 'рубящий'};
  const attacker = hero('attacker', {inventory: [{id: 'sword_entry', itemId: sword.id, qty: 1}], equipment: {MAIN_HAND: 'sword_entry'}});
  const captain = e.seedFoesDB().find(f => f.id === 'foe_bandit_captain');
  e.setState({chars: [attacker], items: [sword], foes: [captain]});
  e.combatStart([{kind: 'ally', id: attacker.id, nat: 20}, {kind: 'foe', id: captain.id, nat: 10}], 'Парирование главаря');
  e.combatFocus(`foe:${captain.id}`);

  assert.equal(e.combatFoeAction('parry'), true);
  assert.equal(e.targetInfoOf(`foe:${captain.id}`).ac, 17);
  assert.equal(e.state().combat.order.find(x => x.id === captain.id).reactionUsed, true);

  const spec = e.weaponSpecOf(attacker, sword, e.targetInfoOf(`foe:${captain.id}`), {entryId: 'sword_entry', within5: true});
  const rolls = e.resolveOutcome(spec, {atk: 13, dmg: 4}, {});
  rolls.attackMade = true;
  rolls.consumeTargetFx = spec.meta.consumeTargetFx;
  assert.equal(rolls.hit, false, 'итог 16 должен промахнуться по КД 17');
  assert.equal(e.weaponAttackApply('sword_entry', attacker.id, `foe:${captain.id}`, rolls), true);
  assert.equal(e.targetInfoOf(`foe:${captain.id}`).ac, 15);
});

test('перезарядка монстра принимает реальный d6, а бонусный прием не тратит действие', () => {
  const e = loadEngine();
  const target = hero('target'), dragon = e.seedFoesDB().find(f => f.id === 'foe_young_green_dragon');
  e.setState({chars: [target], foes: [dragon]});
  e.combatStart([{kind: 'foe', id: dragon.id, nat: 20}, {kind: 'ally', id: target.id, nat: 10}], 'Дыхание');
  const breath = e.foeActionOf(dragon, 'poison_breath');
  dragon.actionState[breath.id].ready = false;
  e.setAutoRolls([4]);
  assert.equal(e.combatFoeRecharge(breath.id), true);
  assert.equal(dragon.actionState[breath.id].ready, false);
  e.setAutoRolls([5]);
  assert.equal(e.combatFoeRecharge(breath.id), true);
  assert.equal(dragon.actionState[breath.id].ready, true);

  const e2 = loadEngine(), hero2 = hero('hero2'), goblin = e2.seedFoesDB().find(f => f.id === 'foe_goblin_scout');
  e2.setState({chars: [hero2], foes: [goblin]});
  e2.combatStart([{kind: 'foe', id: goblin.id, nat: 20}, {kind: 'ally', id: hero2.id, nat: 10}], 'Ловкий побег');
  assert.equal(e2.combatFoeAction('nimble_disengage'), true);
  assert.equal(e2.state().combat.turn.bonusUsed, true);
  assert.equal(e2.state().combat.turn.actionsUsed, 0);
  assert.equal(e2.state().combat.turn.disengage, true);
  assert.equal(e2.combatCanSpend('attack', `foe:${goblin.id}`, true), true);
});

test('повторный спасбросок состояния запрашивается в конце хода и снимает эффект при успехе', () => {
  const e = loadEngine();
  const target = hero('target', {activeFx: [{uid: 'paralyze', label: 'Гуль — Когти', fx: [{stat: 'condition', mode: 'set', value: 'Парализованный'}], repeatSave: {key: 'con', dc: 10, when: 'end'}}]});
  const ghoul = e.seedFoesDB().find(f => f.id === 'foe_ghoul');
  e.setState({chars: [target], foes: [ghoul]});
  e.combatStart([{kind: 'ally', id: target.id, nat: 20}, {kind: 'foe', id: ghoul.id, nat: 10}], 'Повторный спасбросок');
  e.setAutoRolls([20]);
  assert.equal(e.combatNextTurn(), true);
  assert.equal(target.activeFx.length, 0);
  assert.equal(e.state().combat.turn.actorKey, `foe:${ghoul.id}`);
  assert.ok(e.state().combat.log.some(x => x.text.includes('эффект снят')));
});

test('состояние от действия монстра истекает по общим часам раундов', () => {
  const e = loadEngine();
  const target = hero('target');
  const ash = e.seedFoesDB().find(f => f.id === 'foe_ash_zombie');
  e.setState({chars: [target], foes: [ash], fxRound: 4});
  const rolls = {saveOk: false, effectAllowed: true, dmgRaw: null, dmgTotal: null, notes: [], verdict: []};

  assert.equal(e.foeActionApply(ash.id, 'ash_burst', `ally:${target.id}`, rolls), true);
  assert.equal(target.activeFx[0].expiresAtRound, 5);
  assert.ok(e.effectiveConditions(target).includes('Ослепленный'));
  e.advanceFxRound(1);
  assert.equal(target.activeFx.length, 0);
  assert.equal(e.effectiveConditions(target).includes('Ослепленный'), false);
});

test('Стойкость нежити запрашивает настоящий d20 и не работает против излучения или критического удара', () => {
  const e = loadEngine();
  const zombie = e.seedFoesDB().find(f => f.id === 'foe_zombie');
  zombie.hp = 7;
  e.setState({foes: [zombie]});

  const hit = e.applyDamageTo(`foe:${zombie.id}`, 7, 'рубящий', 'тест', {});
  assert.equal(hit.undeadFortitude.dc, 12);
  assert.equal(hit.undeadFortitude.mod, 3);
  assert.deepEqual(plain(e.resolveUndeadFortitude(hit, 9)), {success: true, total: 12, dc: 12});
  assert.equal(zombie.hp, 1);
  assert.equal(zombie.cond.includes('Повержен'), false);

  const radiantZombie = e.seedFoesDB().find(f => f.id === 'foe_zombie');
  e.setState({foes: [radiantZombie]});
  const radiant = e.applyDamageTo(`foe:${radiantZombie.id}`, 30, 'излучение', 'тест', {});
  assert.equal(radiant.undeadFortitude, undefined);
  assert.equal(radiant.dead, true);

  const critZombie = e.seedFoesDB().find(f => f.id === 'foe_zombie');
  e.setState({foes: [critZombie]});
  const crit = e.applyDamageTo(`foe:${critZombie.id}`, 30, 'рубящий', 'тест', {crit: true});
  assert.equal(crit.undeadFortitude, undefined);
});

test('когти гуля не парализуют эльфов и нежить, но действуют на прочих гуманоидов', () => {
  const e = loadEngine();
  const ghoul = e.seedFoesDB().find(f => f.id === 'foe_ghoul');
  const elf = hero('elf', {race: 'Высший эльф', hp: 30, hpMax: 30});
  const human = hero('human', {race: 'Человек', hp: 30, hpMax: 30});
  const skeleton = e.seedFoesDB().find(f => f.id === 'foe_skeleton_guard');
  e.setState({chars: [elf, human], foes: [ghoul, skeleton]});
  const rolls = {attackMade: true, hit: true, saveOk: false, effectAllowed: true, dmgRaw: 6, dmgTotal: 6,
    dmgType: 'рубящий', notes: [], verdict: []};

  assert.equal(e.foeActionApply(ghoul.id, 'claws', `ally:${elf.id}`, {...rolls}), true);
  assert.equal(elf.activeFx.some(x => x.fx.some(f => f.value === 'Парализованный')), false);
  assert.equal(e.foeActionApply(ghoul.id, 'claws', `ally:${human.id}`, {...rolls}), true);
  assert.equal(human.activeFx.some(x => x.fx.some(f => f.value === 'Парализованный')), true);
  assert.equal(e.foeActionApply(ghoul.id, 'claws', `foe:${skeleton.id}`, {...rolls}), true);
  assert.equal(skeleton.activeFx.some(x => x.fx.some(f => f.value === 'Парализованный')), false);
});

test('Вытягивание жизни уменьшает максимум хитов до долгого отдыха и может убить на нуле', () => {
  const e = loadEngine();
  const wraith = e.seedFoesDB().find(f => f.id === 'foe_wraith');
  const target = hero('target', {hp: 30, hpMax: 30});
  e.setState({chars: [target], activeCharId: target.id, foes: [wraith]});
  const failed = {attackMade: true, hit: true, saveOk: false, effectAllowed: true, dmgRaw: 11, dmgTotal: 11,
    dmgType: 'некротическая энергия', notes: [], verdict: []};

  assert.equal(e.foeActionApply(wraith.id, 'life_drain', `ally:${target.id}`, failed), true);
  assert.equal(target.hp, 19);
  assert.equal(e.eHpMax(target), 19);
  assert.ok(target.activeFx.some(x => x.untilLongRest));
  e.longRest();
  assert.equal(e.eHpMax(target), 30);
  assert.equal(target.hp, 30);

  const doomed = hero('doomed', {hp: 10, hpMax: 10});
  e.setState({chars: [doomed], foes: [wraith]});
  assert.equal(e.foeActionApply(wraith.id, 'life_drain', `ally:${doomed.id}`,
    {...failed, dmgRaw: 10, dmgTotal: 10}), true);
  assert.equal(e.eHpMax(doomed), 0);
  assert.equal(doomed.deaths.f, 3);
});

test('присосавшийся стирж наносит автоматический урон без действия ровно раз за ход и отсоединяется после 10 хитов', () => {
  const e = loadEngine();
  const target = hero('target', {hp: 50, hpMax: 50});
  const stirge = e.seedFoesDB().find(f => f.id === 'foe_stirge');
  e.setState({chars: [target], foes: [stirge]});
  e.combatStart([{kind: 'foe', id: stirge.id, nat: 20}, {kind: 'ally', id: target.id, nat: 10}], 'Стирж');

  assert.equal(e.combatFoeAction('drain'), true);
  e.setElementValue('castTarget', `ally:${target.id}`); e.castConfirm();
  e.setElementValue('cf_atk', '10'); e.setElementValue('cf_dmg0', '1'); e.castFormulaConfirm();
  assert.ok(target.activeFx.some(x => x.id === `${stirge.id}:drain`));

  e.combatNextTurn(); e.combatNextTurn();
  assert.equal(e.combatFoeAction('attached_drain'), true);
  e.setElementValue('castTarget', `ally:${target.id}`); e.castConfirm();
  e.setElementValue('cf_dmg0', '4'); e.castFormulaConfirm();
  assert.equal(e.state().combat.turn.actionsUsed, 0);
  assert.equal(e.combatFoeAction('attached_drain'), false);
  assert.equal(target.activeFx.find(x => x.id === `${stirge.id}:drain`).drained, 7);

  e.combatNextTurn(); e.combatNextTurn();
  assert.equal(e.combatFoeAction('attached_drain'), true);
  e.setElementValue('castTarget', `ally:${target.id}`); e.castConfirm();
  e.setElementValue('cf_dmg0', '3'); e.castFormulaConfirm();
  assert.equal(target.activeFx.some(x => x.id === `${stirge.id}:drain`), false);
});

test('полный обмен ударами отражает КД, уязвимость, промах, урон и состояние на листах', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const torgar = e.buildTorgar(), septih = e.buildSeptih();
  const foes = e.seedFoesDB();
  e.setState({chars: [torgar, septih], items, abilities, classes, foes});

  const skeleton = foes.find(f => f.id === 'foe_skeleton_guard');
  const hammer = items.find(x => x.id === 'it_warhammer_gorn');
  const hammerSpec = e.weaponSpecOf(torgar, hammer, e.targetInfoOf(`foe:${skeleton.id}`), {entryId: 'inv_t7'});
  const hammerRolls = e.resolveOutcome(hammerSpec, {atk: 10, dmg: 5}, {});
  assert.equal(hammerRolls.dmgRaw, 7);
  assert.equal(hammerRolls.dmgTotal, 14, 'дробящая уязвимость скелета должна удвоить итог');
  assert.equal(e.weaponAttackApply('inv_t7', torgar.id, `foe:${skeleton.id}`, hammerRolls), true);
  assert.equal(skeleton.hp, 0);
  assert.ok(skeleton.cond.includes('Повержен'));

  const orc = foes.find(f => f.id === 'foe_orc_raider');
  const axe = e.foeActionOf(orc, 'greataxe');
  const orcSpec = e.foeActionSpecOf(orc, axe, e.targetInfoOf(`ally:${torgar.id}`));
  const before = torgar.hp;
  const miss = e.resolveOutcome(orcSpec, {atk: 12, dmg0: 6}, {}); // 17 против КД 18
  assert.equal(miss.hit, false);
  assert.equal(miss.dmgTotal, 0);
  assert.equal(e.foeActionApply(orc.id, axe.id, `ally:${torgar.id}`, miss), true);
  assert.equal(torgar.hp, before);

  const wolf = foes.find(f => f.id === 'foe_dire_wolf'), bite = e.foeActionOf(wolf, 'bite');
  const biteSpec = e.foeActionSpecOf(wolf, bite, e.targetInfoOf(`ally:${septih.id}`));
  const biteRolls = e.resolveOutcome(biteSpec, {atk: 10, dmg0: 7, save: 8}, {});
  assert.equal(biteRolls.hit, true);
  assert.equal(biteRolls.saveOk, false);
  assert.equal(biteRolls.dmgTotal, 10);
  assert.equal(e.foeActionApply(wolf.id, bite.id, `ally:${septih.id}`, biteRolls), true);
  assert.equal(septih.hp, 23);
  assert.ok(e.effectiveConditions(septih).includes('Сбитый с ног'));

  const meleeAfterProne = e.foeActionSpecOf(orc, axe, e.targetInfoOf(`ally:${septih.id}`));
  const bowAfterProne = e.foeActionSpecOf(foes[0], e.foeActionOf(foes[0], 'shortbow'),
    e.targetInfoOf(`ally:${septih.id}`), {within5:false});
  assert.equal(meleeAfterProne.rows.find(r => r.type === 'atk').adv, 1);
  assert.equal(bowAfterProne.rows.find(r => r.type === 'atk').adv, 2);
});

test('боевая вкладка строит очередь только из введенных мастером d20', () => {
  const e = loadEngine();
  const a = hero('a', {name: 'Альфа', ab: {str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10}});
  const b = hero('b', {name: 'Бета', ab: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}});
  const foe = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [a, b], foes: [foe]});

  assert.equal(e.combatStart([
    {kind: 'ally', id: a.id, nat: 12},
    {kind: 'ally', id: b.id, nat: 14},
    {kind: 'foe', id: foe.id, nat: 13},
  ], 'Мост'), true);
  const state = e.state();
  assert.deepEqual(plain(state.combat.order.map(x => [x.kind, x.id, x.nat, x.mod, x.initiative])), [
    ['ally', 'a', 12, 2, 14],
    ['ally', 'b', 14, 0, 14],
    ['foe', foe.id, 13, 1, 14],
  ], 'ничья остается в стабильном порядке для решения мастером');
  assert.equal(state.combat.round, 1);
  assert.equal(state.combat.turn.actorKey, 'ally:a');
  assert.ok(state.combat.log.some(x => x.text.includes('Ничья инициативы 14')));

  e.combatEnd(true);
  assert.equal(e.combatStart([{kind: 'ally', id: a.id, nat: 0}, {kind: 'foe', id: foe.id, nat: 11}], 'Ошибка'), false);
  assert.equal(e.state().combat.active, false);
});

test('ходы сбрасывают экономику, реакция работает вне хода, а раунд двигает часы эффектов один раз', () => {
  const e = loadEngine();
  const c = hero('hero', {name: 'Герой'}), foe = e.seedFoesDB()[0];
  e.setState({chars: [c], foes: [foe], fxRound: 7});
  e.combatStart([{kind: 'ally', id: c.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Часы');

  assert.equal(e.combatSpend('action', 'Проба', 'ally:hero'), true);
  assert.equal(e.combatCanSpend('action', 'ally:hero', true), false);
  e.combatFocus(`foe:${foe.id}`);
  assert.equal(e.combatSpend('reaction', 'Внеочередная реакция', `foe:${foe.id}`), true);
  assert.equal(e.state().combat.turn.actorKey, 'ally:hero', 'фокус реакции не меняет ход');

  assert.equal(e.combatNextTurn(), true);
  assert.equal(e.state().combat.turn.actorKey, `foe:${foe.id}`);
  assert.equal(e.state().combat.order[1].reactionUsed, false, 'реакция восстановилась в начале хода');
  assert.equal(e.combatNextTurn(), true);
  assert.equal(e.state().combat.round, 2);
  assert.equal(e.state().fxRound, 8);
  assert.equal(e.state().combat.turn.actorKey, 'ally:hero');
  assert.equal(e.state().combat.turn.actionUsed, false);
});

test('Дополнительная атака дает всю серию внутри одного действия', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(); fighter.level = 5;
  const foe = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Серия');
  assert.equal(e.state().combat.turn.attackMax, 2);
  assert.equal(e.combatSpend('attack', 'Первый удар', `ally:${fighter.id}`), true);
  assert.equal(e.combatCanSpend('attack', `ally:${fighter.id}`, true), true);
  assert.equal(e.combatSpend('attack', 'Второй удар', `ally:${fighter.id}`), true);
  assert.equal(e.combatCanSpend('attack', `ally:${fighter.id}`, true), false);
  assert.equal(e.combatCanSpend('action', `ally:${fighter.id}`, true), false);
});

test('маневр воина переходит к итогу бросков и атомарно тратит атаку и кость', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), ally = hero('ally', {name: 'Союзник'});
  const orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter, ally], items, abilities, classes, foes: [orc]});
  e.combatStart([
    {kind: 'ally', id: fighter.id, nat: 20},
    {kind: 'foe', id: orc.id, nat: 15},
    {kind: 'ally', id: ally.id, nat: 10},
  ], 'Провокация');

  const maneuver = abilities.find(x => x.id === 'ab_lg_goading');
  const poolEntry = fighter.abilities.find(x => x.abilityId === 'ab_lg_dice');
  e.combatSetGroup('abilities');
  const menu = e.renderWorld().combat;
  assert.ok(menu.includes('Провоцирующая атака'));
  assert.equal(menu.includes("combatUseAbility('ab_lg_dice')"), false);
  assert.equal(menu.includes("combatUseAbility('ab_lg_parry')"), false);
  assert.equal(menu.includes("combatUseAbility('ab_lg_dwarfdiplomacy')"), false);
  assert.equal(e.combatAbilityCost(maneuver), 'attack');
  assert.equal(e.combatUseAbility(maneuver.id), true);
  assert.equal(e.state().combat.turn.actionsUsed, 0, 'окно броска еще не коммитит атаку');

  e.setElementValue('castTarget', `foe:${orc.id}`);
  e.setElementValue('castWeapon', '0');
  e.castConfirm();
  const shown = e.castState();
  assert.equal(shown.ctx.combatCost, 'attack');
  assert.deepEqual(plain(shown.spec.rows.map(r => r.type)), ['atk', 'res', 'dmg', 'save']);

  e.setElementValue('cf_atk', '10');
  e.setElementValue('cf_res', '4');
  e.setElementValue('cf_wdmg', '5');
  e.setElementValue('cf_save', '1');
  e.castFormulaConfirm();

  assert.equal(e.castState().ctx, null);
  assert.equal(e.state().combat.turn.actionsUsed, 1);
  assert.equal(e.state().combat.turn.attacksUsed, 1);
  assert.equal(e.state().combat.turn.actionUsed, true);
  assert.equal(poolEntry.cur, 3);
  assert.equal(orc.hp, 3);
  assert.ok(orc.activeFx.some(x => x.id === maneuver.id));

  e.combatNextTurn();
  const axe = e.foeActionOf(orc, 'greataxe');
  const againstFighter = e.foeActionSpecOf(orc, axe, e.targetInfoOf(`ally:${fighter.id}`));
  const againstAlly = e.foeActionSpecOf(orc, axe, e.targetInfoOf(`ally:${ally.id}`));
  assert.equal(againstFighter.rows.find(r => r.type === 'atk').adv, 0);
  assert.equal(againstAlly.rows.find(r => r.type === 'atk').adv, 2, 'провокация мешает атаковать других');
  e.combatNextTurn();
  e.combatNextTurn();
  assert.ok(orc.activeFx.some(x => x.id === maneuver.id), 'эффект живет до конца следующего хода воина');
  e.combatNextTurn();
  assert.equal(orc.activeFx.some(x => x.id === maneuver.id), false);
});

test('эффект до конца хода источника снимается и с цели вне очереди инициативы', () => {
  const e = loadEngine();
  const fighter = hero('fighter', {name: 'Воин'});
  const [orc, goblin] = e.seedFoesDB();
  goblin.activeFx = [{id: 'outside-turn-effect', label: 'Провокация', combatUntilEndTurn: `ally:${fighter.id}`, fx: []}];
  e.setState({chars: [fighter], foes: [orc, goblin]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: orc.id, nat: 10}], 'Внешняя цель');

  assert.equal(e.combatNextTurn(), true);
  assert.equal(goblin.activeFx.some(x => x.id === 'outside-turn-effect'), false);
});

test('промах манева тратит атаку, но не кость превосходства и не эффект', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [orc]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: orc.id, nat: 10}], 'Промах');
  e.combatUseAbility('ab_lg_disarm');
  e.setElementValue('castTarget', `foe:${orc.id}`); e.setElementValue('castWeapon', '0'); e.castConfirm();
  e.setElementValue('cf_atk', '1'); e.setElementValue('cf_wdmg', '5'); e.setElementValue('cf_save', '1');
  e.castFormulaConfirm();

  assert.equal(fighter.abilities.find(x => x.abilityId === 'ab_lg_dice').cur, 4);
  assert.equal(orc.hp, 15);
  assert.equal(orc.activeFx.some(x => x.id === 'ab_lg_disarm'), false);
  assert.equal(e.state().combat.turn.attacksUsed, 1);

  e.combatNextTurn(); e.combatNextTurn();
  assert.equal(e.combatUseAbility('ab_lg_disarm'), true);
  e.setElementValue('castTarget', `foe:${orc.id}`); e.setElementValue('castWeapon', '0'); e.castConfirm();
  e.setElementValue('cf_atk', '10'); e.setElementValue('cf_res', '4'); e.setElementValue('cf_wdmg', '5'); e.setElementValue('cf_save', '1');
  e.castFormulaConfirm();
  const disarmed = orc.activeFx.find(x => x.id === 'ab_lg_disarm');
  assert.ok(disarmed);
  assert.ok(disarmed.fx.some(x => /\u0420\u0430\u0437\u043e\u0440\u0443\u0436\u0435\u043d/.test(x.value)));
  assert.equal(fighter.abilities.find(x => x.abilityId === 'ab_lg_dice').cur, 3);
});

test('контракт отделяет боевые действия воина от ресурсов, триггеров и фоновых черт', () => {
  const e = loadEngine();
  const abilities = e.seedAbilitiesDB(), fighter = e.buildLegerem();
  e.setState({chars: [fighter], abilities});
  const byId = id => abilities.find(x => x.id === id);

  assert.deepEqual(['ab_lg_surge', 'ab_lg_secondwind', 'ab_lg_precise', 'ab_lg_goading', 'ab_lg_halfblow', 'ab_lg_disarm']
    .map(id => e.combatAbilityCost(byId(id))), ['turnfree', 'bonus', 'attack', 'attack', 'attack', 'attack']);
  assert.equal(e.combatAbilityUsable(byId('ab_lg_dice')), false);
  assert.equal(e.combatAbilityUsable(byId('ab_lg_parry')), false);
  assert.equal(e.combatAbilityUsable(byId('ab_lg_dwarfdiplomacy')), false);
  assert.equal(e.abilityPoolOf(fighter, byId('ab_lg_halfblow')), null, '«не тратя» не считается расходом');
  assert.equal(e.combatAbilityCost({tags: ['attack'], x: 'Если вы попадаете, примените эффект.'}), 'action');
  const precise = byId('ab_lg_precise'), pool = e.abilityPoolOf(fighter, precise);
  const spec = e.rollSpecOf(precise, {caster: fighter, kind: 'ability', target: {kind: 'foe', known: true, ac: 12, name: 'цель'},
    weapon: {n: 'Топор', atk: 5, dmg: '1d8', dt: 'рубящий', m: 3, mode: 'melee', within5: true}, pool, forceAttack: true});
  const values = {atk: 10, wdmg: 5, res: null};
  assert.equal(e.validateFormulaValues(spec, values, e.resolveOutcome(spec, values)).ok, false,
    'выбранный прием нельзя подтвердить без броска кости');
});

test('атака второй рукой открывается после действия Атака и не добавляет положительную Ловкость к урону', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const rogue = e.buildSeptih(), foe = e.seedFoesDB()[0];
  rogue.inventory.push({id: 'inv_s_off', itemId: 'it_shortsword_s', qty: 1, notes: ''});
  rogue.equipment.OFF_HAND = 'inv_s_off';
  e.setState({chars: [rogue], items, abilities, classes, foes: [foe]});
  const blade = items.find(x => x.id === 'it_shortsword_s'), target = e.targetInfoOf(`foe:${foe.id}`);
  const normal = e.weaponSpecOf(rogue, blade, target, {entryId: 'inv_s7'}).rows.find(r => r.type === 'dmg');
  const off = e.weaponSpecOf(rogue, blade, target, {entryId: 'inv_s_off', offhand: true}).rows.find(r => r.type === 'dmg');
  assert.equal(normal.mod - off.mod, 3);

  e.combatStart([{kind: 'ally', id: rogue.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Два клинка');
  assert.equal(e.combatCanSpend('offhand', `ally:${rogue.id}`, true), false);
  e.combatSpend('attack', 'Атака основной рукой', `ally:${rogue.id}`);
  assert.equal(e.combatCanSpend('offhand', `ally:${rogue.id}`, true), true);
  assert.equal(e.combatSpend('offhand', 'Атака второй рукой', `ally:${rogue.id}`), true);
  assert.equal(e.state().combat.turn.bonusUsed, true);
});

test('Захват заменяет одну атаку, разрешает ручное состязание и обнуляет скорость', () => {
  const e = loadEngine();
  const c = hero('grappler', {name: 'Борец', speed: '9 м', ab: {str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10}});
  const foe = e.seedFoesDB().find(f => f.id === 'foe_goblin_scout');
  e.setState({chars: [c], foes: [foe]});
  e.combatStart([{kind: 'ally', id: c.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Захват');
  e.setElementValue('combatQuickTarget', `foe:${foe.id}`); e.setElementValue('combatContestDefense', 'ath'); e.setAutoRolls([15, 5]);
  assert.equal(e.combatContestAction('grapple'), true);
  assert.ok(e.effectiveFoeConditions(foe).includes('Захваченный'));
  assert.equal(e.state().combat.turn.attacksUsed, 1);
  c.cond = ['Захваченный'];
  assert.equal(e.speedTotal(c), '0 м');
});

test('заклинание бонусным действием оставляет в тот же ход только заговор за действие', () => {
  const e = loadEngine();
  const c = hero('caster', {name: 'Заклинатель'}), foe = e.seedFoesDB()[0];
  e.setState({chars: [c], foes: [foe]});
  e.combatStart([{kind: 'ally', id: c.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Заклинания');
  const turn = e.state().combat.turn;
  const cantrip = {id: 'cantrip', n: 'Заговор', l: 0};
  const leveled = {id: 'leveled', n: 'Уровневое', l: 1};
  const bonus = {id: 'bonus', n: 'Бонусное', l: 1};

  turn.spellCasts = [{id: bonus.id, level: 1, cost: 'bonus'}]; turn.bonusSpellUsed = true;
  assert.equal(e.combatSpellTurnAllowed(cantrip, 'action', `ally:${c.id}`, true), true);
  assert.equal(e.combatSpellTurnAllowed(leveled, 'action', `ally:${c.id}`, true), false);
  assert.equal(e.combatSpellTurnAllowed(leveled, 'reaction', `ally:${c.id}`, true), false);

  turn.spellCasts = [{id: cantrip.id, level: 0, cost: 'action'}]; turn.bonusSpellUsed = false;
  assert.equal(e.combatSpellTurnAllowed(bonus, 'bonus', `ally:${c.id}`, true), true);
  turn.spellCasts = [{id: leveled.id, level: 1, cost: 'action'}];
  assert.equal(e.combatSpellTurnAllowed(bonus, 'bonus', `ally:${c.id}`, true), false);
});

test('Подготовка хранится до следующего хода, исполняется реакцией, а Отход блокирует провокационную атаку', () => {
  const e = loadEngine();
  const c = hero('ready', {name: 'Дозорный'}), foe = e.seedFoesDB()[0];
  e.setState({chars: [c], foes: [foe]});
  e.combatStart([{kind: 'ally', id: c.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Реакции');
  e.setPromptResults(['когда враг подойдет — ударить']);
  assert.equal(e.combatBasicAction('ready'), true);
  assert.equal(e.state().combat.turn.actionUsed, true);
  assert.equal(e.state().combat.order[0].ready.text, 'когда враг подойдет — ударить');
  e.combatNextTurn(); e.combatFocus(`ally:${c.id}`);
  assert.equal(e.combatTriggerReady(`ally:${c.id}`), true);
  assert.equal(e.state().combat.order[0].reactionUsed, true);
  assert.equal(e.state().combat.order[0].ready, undefined);

  e.combatNextTurn();
  assert.equal(e.combatBasicAction('disengage'), true);
  assert.equal(e.combatOpportunityBlocked(`foe:${foe.id}`), true);
});

test('недееспособное существо не получает действий и реакций боевого пульта', () => {
  const e = loadEngine();
  const c = hero('stunned', {cond: ['Ошеломленный']}), foe = e.seedFoesDB()[0];
  e.setState({chars: [c], foes: [foe]});
  e.combatStart([{kind: 'ally', id: c.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Ошеломление');
  assert.equal(e.combatCanSpend('action', `ally:${c.id}`, true), false);
  assert.equal(e.combatCanSpend('reaction', `ally:${c.id}`, true), false);
});

test('способность с дополнительным действием не тратит обычное и восстанавливает его', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), foe = e.seedFoesDB()[0];
  e.setState({chars: [fighter], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Порыв');
  assert.equal(e.combatSpend('action', 'Обычное действие', `ally:${fighter.id}`), true);
  assert.equal(e.combatUseAbility('ab_lg_surge'), true);
  assert.equal(e.useAbilityApply('ab_lg_surge', fighter.id, `ally:${fighter.id}`, {notes: [], verdict: []}), true);
  e.closeCastModal();
  assert.equal(e.state().combat.turn.actionUsed, false);
  assert.deepEqual([e.state().combat.turn.actionsUsed, e.state().combat.turn.actionMax], [1, 2]);
  assert.equal(e.combatCanSpend('action', `ally:${fighter.id}`, true), true);
  assert.equal(fighter.abilities.find(x => x.abilityId === 'ab_lg_surge').cur, 0);
});

test('Неистовый порыв до первого действия дает два слота и не ломает атаку второй рукой', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), foe = e.seedFoesDB()[0];
  e.setState({chars: [fighter], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Порыв заранее');

  assert.equal(e.combatUseAbility('ab_lg_surge'), true);
  assert.equal(e.useAbilityApply('ab_lg_surge', fighter.id, `ally:${fighter.id}`, {notes: [], verdict: []}), true);
  e.closeCastModal();
  assert.deepEqual([e.state().combat.turn.actionsUsed, e.state().combat.turn.actionMax], [0, 2]);
  assert.equal(e.combatSpend('attack', 'Атака', `ally:${fighter.id}`), true);
  assert.equal(e.combatSpend('action', 'Рывок', `ally:${fighter.id}`), true);
  assert.equal(e.combatCanSpend('action', `ally:${fighter.id}`, true), false);
  assert.equal(e.combatCanSpend('offhand', `ally:${fighter.id}`, true), true,
    'факт совершенного действия Атака не теряется после второго действия');
});

test('Парирование встроено в итог входящей ближней атаки и атомарно тратит реакцию с костью', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [orc]});
  e.combatStart([{kind: 'foe', id: orc.id, nat: 20}, {kind: 'ally', id: fighter.id, nat: 10}], 'Парирование');

  assert.equal(e.combatFoeAction('greataxe'), true);
  e.setElementValue('castTarget', `ally:${fighter.id}`); e.castConfirm();
  const mitigation = e.castState().spec.rows.find(r => r.type === 'mitigation');
  assert.ok(mitigation);
  assert.equal(mitigation.key, 'reaction_parry');
  e.setElementValue('cf_atk', '11'); e.setElementValue('cf_dmg0', '10'); e.setElementValue('cf_reaction_parry', '6');
  e.castFormulaConfirm();

  assert.equal(fighter.hp, 43, 'секира 10+3 минус Парирование 6+2 наносит 5');
  assert.equal(fighter.abilities.find(x => x.abilityId === 'ab_lg_dice').cur, 3);
  assert.equal(e.state().combat.order.find(x => x.id === fighter.id).reactionUsed, true);
});

test('Парирование не тратится при промахе', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [orc]});
  e.combatStart([{kind: 'foe', id: orc.id, nat: 20}, {kind: 'ally', id: fighter.id, nat: 10}], 'Промах по парирующему');
  e.combatFoeAction('greataxe'); e.setElementValue('castTarget', `ally:${fighter.id}`); e.castConfirm();
  e.setElementValue('cf_atk', '1'); e.setElementValue('cf_dmg0', '10'); e.setElementValue('cf_reaction_parry', '6');
  e.castFormulaConfirm();

  assert.equal(fighter.hp, 48);
  assert.equal(fighter.abilities.find(x => x.abilityId === 'ab_lg_dice').cur, 4);
  assert.equal(e.state().combat.order.find(x => x.id === fighter.id).reactionUsed, false);
});

test('Парирование доступно в свой ход против внеочередной ближней атаки', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [orc]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: orc.id, nat: 10}], 'Внеочередная атака');

  e.combatFocus(`foe:${orc.id}`);
  assert.equal(e.combatFoeAction('greataxe', 'reaction'), true);
  e.setElementValue('castTarget', `ally:${fighter.id}`);
  e.castConfirm();
  assert.ok(e.castState().spec.rows.some(r => r.type === 'mitigation' && r.key === 'reaction_parry'));
  e.closeCastModal();
});

test('устаревшее Парирование отклоняет весь коммит атаки без частичных последствий', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(), orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [orc]});
  e.combatStart([{kind: 'foe', id: orc.id, nat: 20}, {kind: 'ally', id: fighter.id, nat: 10}], 'Устаревшая реакция');
  e.combatFoeAction('greataxe'); e.setElementValue('castTarget', `ally:${fighter.id}`); e.castConfirm();
  e.setElementValue('cf_atk', '11'); e.setElementValue('cf_dmg0', '10'); e.setElementValue('cf_reaction_parry', '6');
  assert.equal(e.combatSpend('reaction', 'Другая реакция', `ally:${fighter.id}`), true);
  e.castFormulaConfirm();

  assert.ok(e.castState().ctx, 'итог остается открытым для пересчета');
  assert.equal(fighter.hp, 48);
  assert.equal(fighter.abilities.find(x => x.abilityId === 'ab_lg_dice').cur, 4);
  assert.equal(e.state().combat.turn.actionsUsed, 0);
  e.closeCastModal();
});

test('ритуальная метка не блокирует обычный каст, а долгие заклинания остаются вне хода', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB();
  assert.equal(e.combatSpellCost(spells.find(x => x.n === 'Обнаружение магии')), 'action');
  assert.equal(e.combatSpellCost(spells.find(x => x.n === 'Тишина')), 'action');
  assert.equal(e.combatSpellCost(spells.find(x => x.n === 'Молебен лечения')), 'long');
});

test('оружие дыхания масштабирует одну, а не все четыре ступени урона', () => {
  const e = loadEngine();
  const abilities = e.seedAbilitiesDB(), breath = abilities.find(x => /^\u041e\u0440\u0443\u0436\u0438\u0435 \u0434\u044b\u0445\u0430\u043d\u0438\u044f/.test(x.n));
  const target = {kind: 'none', known: false, name: 'цель'};
  const dice = [3, 6, 11, 16].map(level => {
    const caster = hero(`dragon-${level}`, {level, ab: {str: 10, dex: 10, con: 16, int: 10, wis: 10, cha: 10}});
    return e.rollSpecOf(breath, {caster, kind: 'ability', target}).rows.find(r => r.type === 'dmg').cnt;
  });
  assert.deepEqual(dice, [2, 3, 4, 5]);
});

test('герой с 0 хитов не пропускает ход и делает ручной спасбросок от смерти', () => {
  const e = loadEngine();
  const lead = hero('lead', {name: 'Ведущий'});
  const down = hero('down', {name: 'Раненый', hp: 0, cond: ['Бессознательный'], deaths: {s: 0, f: 0}});
  const foe = e.seedFoesDB()[0];
  e.setState({chars: [lead, down], foes: [foe]});
  e.combatStart([
    {kind: 'ally', id: lead.id, nat: 20},
    {kind: 'ally', id: down.id, nat: 15},
    {kind: 'foe', id: foe.id, nat: 10},
  ], 'Спасение');
  e.combatNextTurn();
  assert.equal(e.state().combat.turn.actorKey, 'ally:down');
  e.setAutoRolls([20]);
  assert.equal(e.combatDeathSave(), true);
  assert.equal(down.hp, 1);
  assert.deepEqual(plain(down.deaths), {s: 0, f: 0});
  assert.equal(e.state().combat.turn.actionUsed, false, 'спасбросок от смерти не является действием');
  assert.ok(e.state().combat.log.some(x => x.text.toLowerCase().includes('спасбросок от смерти')));
});

test('отмена окна атаки не тратит действие, а успешный атомарный итог тратит его ровно один раз', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const torgar = e.buildTorgar(), skeleton = e.seedFoesDB().find(f => f.id === 'foe_skeleton_guard');
  e.setState({chars: [torgar], items, abilities, classes, foes: [skeleton]});
  e.combatStart([{kind: 'ally', id: torgar.id, nat: 20}, {kind: 'foe', id: skeleton.id, nat: 10}], 'Дуэль');

  assert.equal(e.combatWeapon('inv_t7', 'melee'), true);
  e.closeCastModal();
  assert.equal(e.state().combat.turn.actionUsed, false, 'отмена не коммитит экономику');

  assert.equal(e.combatWeapon('inv_t7', 'melee'), true);
  const hammer = items.find(x => x.id === 'it_warhammer_gorn');
  const spec = e.weaponSpecOf(torgar, hammer, e.targetInfoOf(`foe:${skeleton.id}`), {entryId: 'inv_t7'});
  const rolls = e.resolveOutcome(spec, {atk: 10, dmg: 5}, {});
  assert.equal(e.weaponAttackApply('inv_t7', torgar.id, `foe:${skeleton.id}`, rolls), true);
  assert.equal(e.state().combat.turn.actionUsed, true);
  assert.equal(skeleton.hp, 0);
  assert.equal(e.combatCanSpend('action', `ally:${torgar.id}`, true), false);
  assert.ok(e.state().combat.log.some(x => x.text.includes('хиты 13→0')));
  assert.ok(e.state().combat.log.some(x => x.text.includes('затрата: действие')));
});

test('полный бой сквозным журналом пропускает поверженных и сохраняет все последствия', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const torgar = e.buildTorgar(), foes = e.seedFoesDB();
  const skeleton = foes.find(f => f.id === 'foe_skeleton_guard'), orc = foes.find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [torgar], items, abilities, classes, foes: [skeleton, orc]});
  e.combatStart([
    {kind: 'ally', id: torgar.id, nat: 20},
    {kind: 'foe', id: skeleton.id, nat: 15},
    {kind: 'foe', id: orc.id, nat: 5},
  ], 'Испытание');

  e.combatWeapon('inv_t7', 'melee');
  const hammer = items.find(x => x.id === 'it_warhammer_gorn');
  const hit = e.resolveOutcome(e.weaponSpecOf(torgar, hammer, e.targetInfoOf(`foe:${skeleton.id}`), {entryId: 'inv_t7'}), {atk: 10, dmg: 5}, {});
  e.weaponAttackApply('inv_t7', torgar.id, `foe:${skeleton.id}`, hit);
  e.closeCastModal();
  assert.equal(e.combatNextTurn(), true);
  assert.equal(e.state().combat.turn.actorKey, `foe:${orc.id}`, 'поверженный скелет пропущен');

  const axe = e.foeActionOf(orc, 'greataxe');
  e.combatFoeAction(axe.id);
  const before = torgar.hp;
  const reply = e.resolveOutcome(e.foeActionSpecOf(orc, axe, e.targetInfoOf(`ally:${torgar.id}`)), {atk: 18, dmg0: 6}, {});
  e.foeActionApply(orc.id, axe.id, `ally:${torgar.id}`, reply);
  e.closeCastModal();
  assert.ok(torgar.hp < before);
  assert.equal(e.combatNextTurn(), true);
  assert.equal(e.state().combat.round, 2);
  assert.equal(e.state().combat.turn.actorKey, `ally:${torgar.id}`);
  assert.ok(e.state().combat.log.some(x => x.text.includes('Орк-налетчик')));
  assert.match(e.state().combat.log.map(x => x.text).join('\n'), /хиты \d+→\d+/);
});

test('вторичный спасбросок лютоволка не отменяет урон укуса, но управляет падением', () => {
  const e = loadEngine();
  const target = hero('target', {hp: 30, hpMax: 30, ab: {str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10}});
  const wolf = e.seedFoesDB().find(f => f.id === 'foe_dire_wolf');
  e.setState({chars: [target], foes: [wolf]});
  const bite = e.foeActionOf(wolf, 'bite');
  const spec = e.foeActionSpecOf(wolf, bite, e.targetInfoOf(`ally:${target.id}`));

  const saved = e.resolveOutcome(spec, {atk: 10, dmg0: 7, save: 20}, {});
  assert.equal(saved.dmgTotal, 10);
  assert.equal(saved.effectAllowed, false);
  e.foeActionApply(wolf.id, bite.id, `ally:${target.id}`, saved);
  assert.equal(target.hp, 20);
  assert.equal(e.effectiveConditions(target).includes('Сбитый с ног'), false);

  target.hp = 30;
  const noSaveEntered = e.resolveOutcome(spec, {atk: 10, dmg0: 7, save: null}, {});
  assert.equal(noSaveEntered.dmgTotal, 10);
  assert.equal(noSaveEntered.effectAllowed, null);
  e.foeActionApply(wolf.id, bite.id, `ally:${target.id}`, noSaveEntered);
  assert.equal(target.hp, 20);
  assert.equal(e.effectiveConditions(target).includes('Сбитый с ног'), false);

  target.hp = 30;
  const missed = e.resolveOutcome(spec, {atk: 1, dmg0: 7, save: 1}, {});
  assert.equal(missed.dmgTotal, 0);
  e.foeActionApply(wolf.id, bite.id, `ally:${target.id}`, missed);
  assert.equal(target.hp, 30);
  assert.equal(e.effectiveConditions(target).includes('Сбитый с ног'), false);
});

test('ближняя атака по герою без сознания автоматически критична и ставит два провала смерти', () => {
  const e = loadEngine();
  const target = hero('downed', {hp: 0, hpMax: 30, cond: ['Бессознательный'], deaths: {s: 0, f: 0}});
  const orc = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [target], foes: [orc]});
  const axe = e.foeActionOf(orc, 'greataxe');
  const spec = e.foeActionSpecOf(orc, axe, e.targetInfoOf(`ally:${target.id}`));
  assert.equal(spec.rows.find(r => r.type === 'atk').adv, 1);
  const rolls = e.resolveOutcome(spec, {atk: 10, atk_2: 12, dmg0: 8}, {});
  assert.equal(rolls.hit, true);
  assert.equal(rolls.crit, true);
  assert.equal(e.validateFormulaValues(spec, {atk: 10, atk_2: 12, dmg0: 8}, rolls).ok, true);
  e.foeActionApply(orc.id, axe.id, `ally:${target.id}`, rolls);
  assert.equal(target.deaths.f, 2);
  assert.equal(target.hp, 0);
});

test('ручной ввод формул проверяет границы костей и не применяет неподтвержденные последствия', () => {
  const e = loadEngine();
  const target = hero('target', {cond: ['Сбитый с ног'], hp: 30, hpMax: 30});
  const wolf = e.seedFoesDB().find(f => f.id === 'foe_dire_wolf');
  e.setState({chars: [target], foes: [wolf]});
  const spec = e.foeActionSpecOf(wolf, e.foeActionOf(wolf, 'bite'), e.targetInfoOf(`ally:${target.id}`));
  assert.equal(spec.rows.find(r => r.type === 'atk').adv, 1);

  let values = {atk: 10, atk_2: null, dmg0: 7, save: 8};
  let outcome = e.resolveOutcome(spec, values, {});
  assert.equal(e.validateFormulaValues(spec, values, outcome).ok, false, 'преимущество требует два d20');
  values = {atk: 20, atk_2: 19, dmg0: 14, save: 8};
  outcome = e.resolveOutcome(spec, values, {});
  assert.equal(outcome.crit, true);
  assert.equal(e.validateFormulaValues(spec, values, outcome).ok, true, 'крит допускает сумму удвоенных костей');
  values = {atk: 20, atk_2: 19, dmg0: 25, save: 8};
  outcome = e.resolveOutcome(spec, values, {});
  assert.equal(e.validateFormulaValues(spec, values, outcome).ok, false, '4d6 не может дать 25');

  const unresolvedAttack = e.resolveOutcome(spec, {atk: null, dmg0: 7, save: 8}, {});
  assert.equal(unresolvedAttack.dmgTotal, 0);
  const saveDamage = {rows:[
    {key:'save',type:'save',side:'target',natural:true,mod:0,dc:12,adv:0},
    {key:'dmg',type:'dmg',side:'caster',cnt:1,sides:6,mod:0,dmgType:'огонь'}
  ],meta:{target:e.targetInfoOf(`ally:${target.id}`),saveAb:'Ловкость',saveAffectsDamage:true,half:false}};
  assert.equal(e.resolveOutcome(saveDamage, {save:null,dmg:6}, {}).dmgTotal, 0);
});

test('формула запрашивает фактическую дистанцию и применяет пространственные правила 5e', () => {
  const e = loadEngine();
  const caster = hero('caster', {cls: 'Волшебник', level: 5, ab: {str: 10, dex: 12, con: 12, int: 16, wis: 10, cha: 10}});
  const prone = {id:'prone',n:'Лежащая цель',kind:'monster',ac:12,hp:20,hpMax:20,hpTemp:0,
    abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saveP:{},profB:2,resist:[],vuln:[],immune:[],condImmune:[],
    cond:['Сбитый с ног'],activeFx:[],combatActions:[]};
  e.setState({chars:[caster],foes:[prone]});
  const lash = {id:'lash',n:'Дальняя плеть',l:0,r:'30 футов',hi:'',
    x:'Совершите рукопашную атаку заклинанием по цели. При попадании цель получает 1d6 рубящего урона.'};
  const target=e.targetInfoOf(`foe:${prone.id}`);

  const unknown=e.rollSpecOf(lash,{caster,kind:'spell',target});
  assert.equal(unknown.meta.within5,null);
  assert.equal(unknown.meta.spatialRequired,true);
  assert.equal(e.validateFormulaValues(unknown,{},e.resolveOutcome(unknown,{},{})).ok,false);
  assert.equal(e.rollSpecOf(lash,{caster,kind:'spell',target,within5:true}).rows.find(r=>r.type==='atk').adv,1);
  assert.equal(e.rollSpecOf(lash,{caster,kind:'spell',target,within5:false}).rows.find(r=>r.type==='atk').adv,2);

  const victim=hero('victim');
  const goblin=e.seedFoesDB().find(f=>f.id==='foe_goblin_scout');
  e.setState({chars:[victim],foes:[goblin]});
  const bow=e.foeActionOf(goblin,'shortbow'), victimTarget=e.targetInfoOf(`ally:${victim.id}`);
  const unknownBow=e.foeActionSpecOf(goblin,bow,victimTarget);
  assert.equal(unknownBow.meta.spatialRequired,true);
  assert.equal(e.foeActionSpecOf(goblin,bow,victimTarget,{within5:true}).rows.find(r=>r.type==='atk').adv,2,
    'дальнобойная атака рядом с видящим дееспособным противником совершается с помехой');
  assert.equal(e.foeActionSpecOf(goblin,bow,victimTarget,{within5:false}).rows.find(r=>r.type==='atk').adv,0);
});

test('смешанный урон применяет сопротивление и уязвимость отдельно по типам', () => {
  const e = loadEngine();
  const target = {id:'mixed',n:'Смешанная цель',kind:'monster',ac:10,hp:50,hpMax:50,hpTemp:0,
    abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saveP:{},profB:2,
    resist:['огонь'],vuln:['дробящий'],immune:[],condImmune:[],cond:[],activeFx:[],combatActions:[]};
  e.setState({foes:[target]});
  const spec = {rows:[
    {key:'fire',type:'dmg',side:'caster',cnt:1,sides:6,mod:0,dmgType:'огонь'},
    {key:'blunt',type:'dmg',side:'caster',cnt:1,sides:6,mod:0,dmgType:'дробящий'}
  ],meta:{target:e.targetInfoOf(`foe:${target.id}`),dmgType:'',half:false}};
  const out = e.resolveOutcome(spec, {fire:5,blunt:5}, {});
  assert.equal(out.dmgRaw, 10);
  assert.equal(out.dmgTotal, 12); // огонь 5 → 2; дробящий 5 → 10
  assert.deepEqual(plain(out.damageParts.map(x => [x.type,x.total])), [['огонь',2],['дробящий',10]]);
  e.applyRollsToTarget(`foe:${target.id}`, out, 'смешанный тест');
  assert.equal(target.hp, 38);
});

test('пачка стрел расходуется по одной и возвращает половину выпущенного после боя', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const septih = e.buildSeptih();
  const target = {id:'target',n:'Тренировочная цель',kind:'monster',ac:10,hp:100,hpMax:100,hpTemp:0,
    abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saveP:{},profB:2,resist:[],vuln:[],immune:[],condImmune:[],cond:[],activeFx:[],combatActions:[]};
  e.setState({chars:[septih],activeCharId:septih.id,items,abilities,classes,foes:[target]});
  const bow = items.find(x => x.id === 'it_shortbow_s'), arrows = septih.inventory.find(x => x.itemId === 'it_стрелы_20');
  for(let i=0;i<4;i++){
    const spec=e.weaponSpecOf(septih,bow,e.targetInfoOf(`foe:${target.id}`),{entryId:'inv_s8',mode:'ranged'});
    const rolls=e.resolveOutcome(spec,{atk:10,dmg:3},{});
    assert.equal(e.weaponAttackApply('inv_s8',septih.id,`foe:${target.id}`,rolls),true);
  }
  assert.equal(e.ammoRemaining(arrows,items.find(x=>x.id===arrows.itemId)),16);
  assert.ok(septih.inventory.includes(arrows),'неполная пачка не должна исчезать');
  e.ammoRecover(arrows.id);
  assert.equal(e.ammoRemaining(arrows,items.find(x=>x.id===arrows.itemId)),18);
  e.invQty(arrows.id,1);
  assert.equal(e.ammoRemaining(arrows,items.find(x=>x.id===arrows.itemId)),38,'новая пачка добавляет ровно 20 стрел к остатку');
  e.invQty(arrows.id,-1);
  assert.equal(e.ammoRemaining(arrows,items.find(x=>x.id===arrows.itemId)),18,'удаление пачки не сбрасывает частичный остаток');
});

test('атака оружием внутри способности расходует тот же боеприпас', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const rogue = e.buildSeptih(), foe = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  rogue.equipment = {TWO_HAND: 'inv_s8', CHEST: 'inv_s9'};
  const arrows = rogue.inventory.find(x => x.id === 'inv_s10');
  e.setState({chars: [rogue], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: rogue.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Скрытая атака из лука');

  assert.equal(e.combatUseAbility('ab_sx_sneak'), true);
  e.setElementValue('castTarget', `foe:${foe.id}`);
  e.setElementValue('castWeapon', '0');
  e.castConfirm();
  const spec = e.castState().spec;
  const values = {};
  spec.rows.forEach(row => {
    if(row.type === 'atk'){
      values[row.key] = 10;
      if(row.adv) values[row.key + '_2'] = 10;
    } else if(row.type === 'dmg') values[row.key] = row.cnt;
    else values[row.key] = null;
  });
  const rolls = e.resolveOutcome(spec, values, {});
  assert.equal(rolls.hit, true);
  assert.equal(e.useAbilityApply('ab_sx_sneak', rogue.id, `foe:${foe.id}`, rolls), true);
  e.closeCastModal();

  assert.equal(e.ammoRemaining(arrows, items.find(x => x.id === arrows.itemId)), 19);
});

test('Перезарядка ограничивает арбалет одним выстрелом на действие, но не на весь ход', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const fighter = e.buildLegerem(); fighter.level = 5;
  const crossbow = items.find(x => x.n === 'Легкий арбалет');
  const bolts = items.find(x => x.n === 'Арбалетные болты (20)');
  fighter.inventory.push({id: 'crossbow', itemId: crossbow.id, qty: 1}, {id: 'bolts', itemId: bolts.id, qty: 1});
  fighter.equipment = {TWO_HAND: 'crossbow'};
  const foe = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [fighter], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: fighter.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Арбалет');

  const shot = () => {
    assert.equal(e.combatWeapon('crossbow', 'ranged'), true);
    const spec = e.weaponSpecOf(fighter, crossbow, e.targetInfoOf(`foe:${foe.id}`), {entryId: 'crossbow', mode: 'ranged', within5: false});
    const rolls = e.resolveOutcome(spec, {atk: 10, dmg: 4}, {});
    return e.weaponAttackApply('crossbow', fighter.id, `foe:${foe.id}`, rolls);
  };
  assert.equal(shot(), true);
  e.closeCastModal();
  assert.equal(e.ammoRemaining(fighter.inventory.find(x => x.id === 'bolts'), bolts), 19);
  assert.equal(shot(), false, 'второй выстрел той же серии блокируется');
  e.closeCastModal();
  assert.equal(e.ammoRemaining(fighter.inventory.find(x => x.id === 'bolts'), bolts), 19);

  assert.equal(e.combatSpend('attack', 'Вторая атака другим оружием', `ally:${fighter.id}`), true);
  assert.equal(e.combatUseAbility('ab_lg_surge'), true);
  assert.equal(e.useAbilityApply('ab_lg_surge', fighter.id, `ally:${fighter.id}`, {notes: [], verdict: []}), true);
  e.closeCastModal();
  assert.equal(shot(), true, 'Неистовый порыв создает новое действие и новый лимит перезарядки');
  e.closeCastModal();
  assert.equal(e.ammoRemaining(fighter.inventory.find(x => x.id === 'bolts'), bolts), 18);
});

test('Проворство чейнджлинга тратит бонусное, а не обычное действие', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const rogue = e.buildSeptih(), foe = e.seedFoesDB()[0];
  e.setState({chars: [rogue], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: rogue.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Проворство');
  assert.equal(e.combatCunningAction('dash'), true);
  assert.equal(e.state().combat.turn.bonusUsed, true);
  assert.equal(e.state().combat.turn.actionsUsed, 0);
  assert.equal(e.state().combat.turn.dash, true);
});

test('Скрытая атака отмечается один раз за ход только после попадания', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const rogue = e.buildSeptih(), foe = e.seedFoesDB()[0];
  e.setState({chars: [rogue], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: rogue.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Скрытая атака');
  assert.equal(e.combatUseAbility('ab_sx_sneak'), true);
  assert.equal(e.useAbilityApply('ab_sx_sneak', rogue.id, `foe:${foe.id}`,
    {hit: true, effectAllowed: true, dmgRaw: 0, dmgTotal: 0, notes: [], verdict: []}), true);
  e.closeCastModal();
  assert.equal(e.combatUseAbility('ab_sx_sneak'), false);
  e.combatNextTurn(); e.combatNextTurn();
  assert.equal(e.combatUseAbility('ab_sx_sneak'), true);
  e.closeCastModal();
});

test('Шокирующая атака требует 2d8, при равенстве требует спасбросок и истекает в конце хода цели', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), abilities = e.seedAbilitiesDB(), classes = e.seedClassesDB();
  const rogue = e.buildSeptih(), foe = e.seedFoesDB().find(f => f.id === 'foe_orc_raider');
  e.setState({chars: [rogue], items, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: rogue.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Шок');
  const shock = abilities.find(x => x.id === 'ab_sx_shock');
  const weapon = {n: 'Короткий меч', atk: 5, dmg: '1d6', dt: 'колющий', m: 3, mode: 'melee', within5: true};
  const spec = e.rollSpecOf(shock, {caster: rogue, kind: 'ability', target: e.targetInfoOf(`foe:${foe.id}`), weapon, forceAttack: true});
  const threshold = spec.rows.find(r => r.type === 'threshold');
  assert.ok(threshold);

  let values = {atk: 10, atk_2: 10, wdmg: 4, save: null, [threshold.key]: null};
  let out = e.resolveOutcome(spec, values, {});
  assert.equal(e.validateFormulaValues(spec, values, out).ok, false);
  values = {atk: 10, atk_2: 10, wdmg: 4, save: null, [threshold.key]: foe.ac};
  out = e.resolveOutcome(spec, values, {});
  assert.equal(e.validateFormulaValues(spec, values, out).ok, false, 'при равенстве нельзя пропустить спасбросок');
  values = {atk: 10, atk_2: 10, wdmg: 4, save: null, [threshold.key]: foe.ac + 1};
  out = e.resolveOutcome(spec, values, {});
  const valid = e.validateFormulaValues(spec, values, out);
  assert.equal(valid.ok, true, valid.errors.join(' | '));
  assert.equal(out.effectAllowed, true);
  assert.equal(e.useAbilityApply(shock.id, rogue.id, `foe:${foe.id}`, out), true);
  assert.ok(e.effectiveFoeConditions(foe).includes('Ошеломленный'));
  assert.equal(rogue.abilities.find(x => x.abilityId === shock.id).cur, 0);
  e.combatNextTurn();
  assert.ok(e.effectiveFoeConditions(foe).includes('Ошеломленный'));
  e.combatNextTurn();
  assert.equal(e.effectiveFoeConditions(foe).includes('Ошеломленный'), false);
});

test('активная боевая вкладка раскрывает все группы действий и журнал без перехода на лист', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), items = e.seedItemsDB(), classes = e.seedClassesDB();
  const c = e.makeBlank(); Object.assign(c, {id: 'hero', name: 'Боевой герой', cls: 'Жрец', level: 5, hp: 20, hpMax: 20, slots: {1: {max: 4, cur: 2}}});
  const sword = items.find(x => x.n === 'Длинный меч'), potion = items.find(x => /^Зелье лечения/.test(x.n));
  c.inventory = [{id: 'sword', itemId: sword.id, qty: 1}, {id: 'potion', itemId: potion.id, qty: 1}]; c.equipment = {MAIN_HAND: 'sword'};
  const bless = spells.find(x => x.n === 'Благословение'), breath = abilities.find(x => /^Оружие дыхания/.test(x.n));
  c.spellbook = [{spellId: bless.id, prep: true}]; c.abilities = [{abilityId: breath.id, cur: 1}];
  const foe = e.seedFoesDB()[0]; e.setState({chars: [c], items, spells, abilities, classes, foes: [foe]});
  e.combatStart([{kind: 'ally', id: c.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Панели');

  let html = e.renderWorld().combat;
  ['Раунд 1', 'Журнал боя', 'Завершить ход', 'Уклонение', 'Оружие', 'Заклинания', 'Способности', 'Инвентарь'].forEach(x => assert.ok(html.includes(x), `нет индикатора «${x}»`));
  e.combatSetGroup('weapons'); html = e.renderWorld().combat; assert.ok(html.includes('Длинный меч'));
  e.combatSetGroup('spells'); html = e.renderWorld().combat; assert.ok(html.includes('Благословение'));
  e.combatSetGroup('abilities'); html = e.renderWorld().combat; assert.ok(html.includes('Оружие дыхания'));
  e.combatSetGroup('items'); html = e.renderWorld().combat; assert.ok(html.includes('Зелье лечения'));
});

test('все девять вкладок и шесть панелей листа рендерятся с индикаторами', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), items = e.seedItemsDB();
  const c = e.makeBlank();
  Object.assign(c, {id: 'hero', name: 'Тестовый герой', cls: 'Жрец', level: 5, hp: 8, hpMax: 20, hpTemp: 3,
    slots: {1: {max: 4, cur: 2}}, spentRest: 2, cond: ['Отравленный']});
  const sword = items.find(x => x.n === 'Длинный меч');
  const potion = items.find(x => /^Зелье лечения/.test(x.n));
  c.inventory = [{id: 'sword', itemId: sword.id, qty: 1}, {id: 'potion', itemId: potion.id, qty: 1}];
  c.equipment = {MAIN_HAND: 'sword'};
  c.spellbook = [{spellId: spells.find(x => x.n === 'Благословение').id, prep: true}];
  const breath = abilities.find(x => /^Оружие дыхания/.test(x.n));
  c.abilities = [{abilityId: breath.id, cur: 1}];
  const foe = {id: 'foe', n: 'Манекен', kind: 'monster', ac: 12, hp: 10, hpMax: 10, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  e.setState({chars: [c], activeCharId: c.id, foes: [foe], spells, abilities, items,
    races: e.seedRacesDB(), classes: e.seedClassesDB(), rules: [{id: 'r', t: 'Правило', x: 'Текст'}]});

  const world = e.renderWorld();
  assert.deepEqual(Object.keys(world), ['chars', 'combat', 'races', 'classes', 'spellsdb', 'itemsdb', 'abilitiesdb', 'foes', 'rules']);
  Object.entries(world).forEach(([name, html]) => assert.ok(html.length > 40, `пустая вкладка ${name}`));

  const expected = {
    stats: ['Характеристики', 'Хиты', 'Класс доспеха', 'Состояния'],
    inventory: ['Инвентарь', 'Валюта', 'Зелье лечения'],
    equipment: ['Экипировка персонажа', 'Основная рука', 'Длинный меч'],
    spells: ['Ячейки заклинаний', 'Подготовлено', 'Благословение'],
    abilities: ['Все способности', 'Оружие дыхания', 'готовы к применению'],
    notes: ['Игрок', 'Заметки мастера']
  };
  Object.entries(expected).forEach(([panel, labels]) => {
    const html = e.renderSheetPanel(panel);
    labels.forEach(label => assert.ok(html.includes(label), `${panel}: нет индикатора «${label}»`));
  });
});

test('единый сброс удаляет текущий бой и точно восстанавливает исходную группу', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();
  const roku = e.buildRoku(), foe = foes[0];
  const resourceAbility = abilities.find(x => x.uses != null);
  assert.ok(resourceAbility, 'для проверки нужен ресурс способности');
  roku.hp = 1; roku.hpTemp = 9; roku.cond = ['Отравленный']; roku.slots[1].cur = 0;
  roku.inventory.find(x => x.id === 'inv_r10').qty = 1;
  const custom = hero('custom', {name: 'Пользовательский герой', hp: 2, hpMax: 22, hpTemp: 4,
    cond: ['Сбитый с ног'], deaths: {s: 1, f: 2}, exhaustion: 3, slots: {1: {cur: 0, max: 3}},
    abilities: [{abilityId: resourceAbility.id, cur: 0}], activeFx: [{uid: 'old', fx: [], label: 'Старый эффект'}]});
  foe.hp = 1; foe.hpTemp = 3; foe.cond = ['Ослепленный']; foe.activeFx = [{uid: 'foe-old', fx: [], label: 'Старый эффект'}];
  const combat = e.blankCombat(); combat.history = [{id: 'archive', name: 'Старый бой', log: []}];
  e.setState({chars: [roku, custom], items, spells, abilities, races, classes, foes: [foe], combat});
  assert.equal(e.combatStart([{kind: 'ally', id: roku.id, nat: 20}, {kind: 'foe', id: foe.id, nat: 10}], 'Сбрасываемая схватка'), true);

  assert.equal(e.resetCombatAndParty(true), true);
  const state = e.state(), byId = Object.fromEntries(state.chars.map(x => [x.id, x]));
  assert.equal(state.combat.active, false);
  assert.equal(state.combat.log.length, 0, 'незавершенный тестовый бой не должен попасть в архив');
  assert.equal(state.combat.history.length, 1);
  assert.deepEqual(plain(state.chars.slice(0, 4).map(x => x.id)), ['char_roku', 'char_torgar', 'char_septih', 'char_legerem']);
  assert.equal(byId.char_roku.hp, 30); assert.equal(byId.char_roku.hpTemp, 0);
  assert.equal(byId.char_roku.slots[1].cur, 4); assert.equal(byId.char_roku.inventory.find(x => x.id === 'inv_r10').qty, 3);
  assert.deepEqual(plain(byId.char_roku.cond), []);
  assert.equal(byId.custom.name, 'Пользовательский герой', 'пользовательский герой не удаляется');
  assert.equal(byId.custom.hp, 22); assert.equal(byId.custom.hpTemp, 0); assert.deepEqual(plain(byId.custom.cond), []);
  assert.deepEqual(plain(byId.custom.deaths), {s: 0, f: 0}); assert.equal(byId.custom.exhaustion, 0);
  assert.equal(byId.custom.slots[1].cur, 3); assert.equal(byId.custom.abilities[0].cur, resourceAbility.uses);
  assert.equal(state.foesDB[0].hp, state.foesDB[0].hpMax); assert.equal(state.foesDB[0].hpTemp, 0);
  assert.deepEqual(plain(state.foesDB[0].cond), []); assert.deepEqual(plain(state.foesDB[0].activeFx), []);

  e.combatEnsureSetup();
  assert.equal(state.combat.setup['ally:char_roku'].selected, true);
  assert.equal(state.combat.setup[`foe:${state.foesDB[0].id}`].selected, false,
    'новый бой не должен автоматически выбирать весь бестиарий');
  const html = e.renderWorld().combat;
  assert.ok(html.includes('Сбросить бой и группу'));
});

test('выпуск 4.1 объединяет локальную и облачную летопись без возврата незавершенного боя', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();
  const localCustom = hero('custom_shared', {name: 'Локальный герой', hp: 1, hpMax: 22});
  const localOnly = hero('custom_local', {name: 'Только локальный', hp: 2, hpMax: 18});
  const combat = e.blankCombat(); combat.active = true; combat.round = 4;
  combat.log = [{id: 'unfinished', text: 'Не должен сохраниться'}];
  combat.history = [{id: 'local_battle', name: 'Локальный архив', log: []}];
  e.setState({chars: [e.buildRoku(), localCustom, localOnly], journal: [
    {id: 'shared_page', date: '2026-08-01', title: 'Локальная старая версия', text: 'local'},
    {id: 'local_page', date: '2026-08-02', title: 'Локальная страница', text: 'local only'}
  ], items, spells, abilities, races, classes, foes, combat});

  const remote = {
    chars: [hero('custom_shared', {name: 'Облачный герой', hp: 3, hpMax: 30}), hero('custom_cloud', {name: 'Только облачный', hp: 4, hpMax: 26})],
    journal: [
      {id: 'shared_page', date: '2026-08-01', title: 'Облачная новая версия', text: 'cloud'},
      {id: 'cloud_page', date: '2026-08-03', title: 'Облачная страница', text: 'cloud only'}
    ],
    combat: {history: [{id: 'cloud_battle', name: 'Облачный архив', log: []}]}
  };
  const payload = e.structuredReleaseCampaignPayload(remote);
  assert.deepEqual(plain(payload.chars.slice(0, 4).map(x => x.id)), ['char_roku', 'char_torgar', 'char_septih', 'char_legerem']);
  assert.deepEqual(plain(payload.chars.slice(4).map(x => x.id)), ['custom_shared', 'custom_cloud', 'custom_local']);
  assert.equal(payload.chars.find(x => x.id === 'custom_shared').name, 'Облачный герой', 'облачная версия общего героя приоритетна');
  assert.equal(payload.chars.find(x => x.id === 'custom_shared').hp, 30, 'пользовательский герой получает полный отдых');
  assert.deepEqual(plain(payload.journal.map(x => x.id)), ['shared_page', 'cloud_page', 'local_page']);
  assert.equal(payload.journal[0].text, 'cloud');
  assert.equal(payload.combat.active, false); assert.equal(payload.combat.round, 0); assert.equal(payload.combat.log.length, 0);
  assert.deepEqual(plain(payload.combat.history.map(x => x.id)), ['cloud_battle', 'local_battle']);

  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const CLOUD_PAUSED=false/);
  assert.ok(html.includes('Движок 4.5 · предметы и ремесло'));
});

test('формулы v2 не содержат броска мастера, ручного попадания или изменяемого преимущества', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ['Прочий бросок (по решению мастера)', 'castHitSet', 'hitOverride', 'castAdvSet', 'id="cfHit"', 'value="free"']
    .forEach(token => assert.equal(html.includes(token), false, `удален запрещенный путь: ${token}`));

  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();
  const party = [e.buildRoku(), e.buildTorgar(), e.buildSeptih(), e.buildLegerem()];
  e.setState({chars: party, items, spells, abilities, races, classes, foes});
  const caster = party[0], target = e.targetInfoOf(`foe:${foes[0].id}`), specs = [];
  spells.forEach(sp => specs.push(e.rollSpecOf(sp, {caster, kind: 'spell', slotLvl: +sp.l || 0, target})));
  abilities.forEach(ab => specs.push(e.rollSpecOf(ab, {caster, kind: 'ability', target})));
  items.forEach(it => {
    const generic = e.rollSpecOf(it, {caster, kind: 'item', target});
    specs.push(generic);
    assert.equal(generic.rows.length, 0, `карточка предмета не исполняет описание: ${it.n}`);
    e.itemUsesOf(it).forEach(use => specs.push(e.itemUseSpecOf(caster, it, use, target, {})));
    if(e.itemProfile(it).kind === 'weapon') specs.push(e.weaponSpecOf(caster, it, target, {}));
  });
  foes.forEach(foe => e.foeActionsOf(foe).forEach(action => specs.push(e.foeActionSpecOf(foe, action, e.targetInfoOf(`ally:${caster.id}`), {}))));

  assert.ok(specs.length > 400, `проверено слишком мало формул: ${specs.length}`);
  specs.forEach((spec, i) => {
    assert.deepEqual(plain(e.formulaContractErrors(spec)), [], `контракт формулы ${i}`);
    assert.equal(spec.contract.schemaVersion, 2);
    assert.equal(spec.contract.inputPolicy, 'declared-results-only');
    assert.equal(spec.rows.some(row => row.type === 'extra' || !row.inputContract || !row.inputContract.semantic), false);
    assert.equal(spec.rows.some(row => row.type === 'other' && !['atk', 'save', 'dmg'].includes(row.addTo)), false);
  });

  const guidance = spells.find(sp => sp.id === 'sp_guidance_t');
  assert.ok(guidance.mechanics.effects.some(fx => fx.stat === 'check' && fx.mode === 'die' && fx.value === '1d4'));
  assert.equal(e.rollSpecOf(guidance, {caster, kind: 'spell', target: e.targetInfoOf(`ally:${caster.id}`)}).rows.length, 0,
    '1d4 Наставления бросается при будущей проверке, а не при наложении');
});

test('неизвестную КД и исчерпанные ресурсы нельзя обойти ручным решением', () => {
  const e = loadEngine(), items = e.seedItemsDB(), sword = items.find(it => it.n === 'Длинный меч');
  const caster = hero('caster', {cls: 'Жрец', inventory: [{id: 'sword', itemId: sword.id, qty: 1}], equipment: {MAIN_HAND: 'sword'}});
  const target = hero('target');
  const ability = {id: 'limited', n: 'Ограниченный прием', mode: 'active', uses: 1, rest: 'короткий отдых',
    combatTarget: 'enemy', combatNoRoll: true, x: 'Выберите одну цель.'};
  e.upgradeAbility(ability, true);
  caster.abilities = [{abilityId: ability.id, cur: 0}];
  e.setState({chars: [caster, target], items, abilities: [ability]});

  const unknown = e.weaponSpecOf(caster, sword, e.targetInfoOf('enemy'), {entryId: 'sword'});
  const values = {atk: 10, dmg: 5};
  const outcome = e.resolveOutcome(unknown, values, {hitOverride: 'crit'});
  assert.equal(outcome.hit, null, 'внешний флаг не может назначить попадание или крит');
  assert.match(e.validateFormulaValues(unknown, values, outcome).errors.join(' '), /цель из бестиария/);

  e.setConfirmResults([true, true]);
  assert.equal(e.useAbilityApply(ability.id, caster.id, `ally:${target.id}`, {notes: [], verdict: []}), false);
  assert.equal(caster.abilities[0].cur, 0);

  const spell = {id: 'slot-test', n: 'Проверка ячейки', l: 1, cm: 'В', d: 'Мгновенная', x: ''};
  caster.slots = {1: {max: 1, cur: 1}};
  assert.equal(e.slotPlanFor(caster, spell, 'free').ok, false);
  caster.spellbook = [{spellId: spell.id, prep: false}];
  assert.equal(e.slotPlanFor(caster, spell, '1').ok, false, 'неподготовленное заклинание не тратит ячейку');
  caster.spellbook[0].prep = true;
  e.setState({chars: [caster, target], items, abilities: [ability], spells: [spell]});
  assert.equal(e.castSpellApply(spell.id, caster.id, 'enemy', '', undefined, '1'), false);
  assert.equal(caster.slots[1].cur, 1, 'неизвестная цель не тратит ячейку');
});

test('материальный компонент имеет точный расход, а аудит связывает всю штатную четверку', () => {
  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();
  const diamond = {id: 'audit-diamond', n: 'Алмаз', type: 'wondrous', tags: [], cost: '100 зм', desc: ''};
  e.upgradeItem(diamond);
  items.push(diamond);
  const caster = hero('material-caster', {inventory: [{id: 'gem', itemId: diamond.id, qty: 3}]});
  const spell = {id: 'material-spell', n: 'Точный компонент', l: 1, cm: 'М (алмаз, расходуется)', d: 'Мгновенная', x: ''};
  e.upgradeSpell(spell, true); spells.push(spell);
  e.setState({chars: [caster], items, spells, abilities, races, classes, foes});
  const comp = e.parseComponents(spell);
  assert.equal(e.materialPlanFor(caster, spell, comp, {entryId: 'gem', use: 2}).ok, false);
  assert.equal(e.materialPlanFor(caster, spell, comp, {entryId: 'gem', use: 1}).ok, true);

  const party = [e.buildRoku(), e.buildTorgar(), e.buildSeptih(), e.buildLegerem()];
  e.setState({chars: party, items, spells, abilities, races, classes, foes});
  const audit = e.gameDataAudit({spells, abilities, items, races, classes, foes, chars: party});
  assert.deepEqual(plain(audit.errors), []);
  assert.deepEqual(plain(audit.formulaContract), {schemaVersion: 2, inputPolicy: 'declared-results-only', deterministic: true});
  assert.ok(audit.coverage.formulaSemantics.length >= 8);
  assert.ok(audit.coverage.damageTypes.length >= 8);
  assert.ok(audit.coverage.effectStats.length >= 12);
  assert.deepEqual(plain(party.map(c => c.id)), ['char_roku', 'char_torgar', 'char_septih', 'char_legerem']);
});

test('встречные преимущество и помеха отменяются независимо от типа источника', () => {
  const e = loadEngine(), spells = e.seedSpellsDB(), classes = e.seedClassesDB();
  const ray = spells.find(sp => {
    const m = e.currentMechanics(sp, 'spell'), attack = m && m.resolution && m.resolution.attack;
    return attack && attack.mode === 'ranged';
  });
  const caster = hero('caster', {cls: 'Волшебник', activeFx: [{uid: 'adv', k: 'audit', id: 'adv', label: 'Преимущество',
    fx: [{stat: 'attack.int', mode: 'adv', value: 1}]}]});
  const target = {id: 'target', n: 'Лежащая цель', kind: 'monster', ac: 12, hp: 20, hpMax: 20,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, saveBonuses: {}, skills: {}, profB: 2,
    resist: [], vuln: [], immune: [], damageRules: [], condImmune: [], effectImmunities: [], activeFx: [], cond: ['Сбитый с ног'], combatActions: []};
  e.setState({chars: [caster], spells, classes, foes: [target]});
  const spec = e.rollSpecOf(ray, {caster, kind: 'spell', slotLvl: ray.l, target: e.targetInfoOf('foe:target'), within5: false});
  assert.equal(spec.rows.find(r => r.type === 'atk').adv, 0);
});

test('иммунитет к критам блокирует и натуральный, и автоматический крит состояния', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const sword = items.find(it => e.itemProfile(it).kind === 'weapon' && !e.itemProfile(it).weapon.ranged);
  const caster = hero('caster', {cls: 'Воин', ab: {str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10}});
  const target = {id: 'target', n: 'Защищенная цель', kind: 'monster', ac: 5, hp: 30, hpMax: 30, criticalHitImmune: true,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, saveBonuses: {}, skills: {}, profB: 2,
    resist: [], vuln: [], immune: [], damageRules: [], condImmune: [], effectImmunities: [], activeFx: [], cond: ['Парализованный'], combatActions: []};
  e.setState({chars: [caster], items, foes: [target]});
  const spec = e.weaponSpecOf(caster, sword, e.targetInfoOf('foe:target'), {within5: true, mode: 'melee'});
  assert.equal(e.resolveOutcome(spec, {atk: 20, dmg: 4}).crit, false, 'натуральная 20 не обходит иммунитет');
  assert.equal(e.resolveOutcome(spec, {atk: 10, dmg: 4}).crit, false, 'автокрит паралича не обходит иммунитет');
});

test('урон по стабилизированному герою снимает стабилизацию и ставит один или два провала', () => {
  for (const [crit, failures] of [[false, 1], [true, 2]]) {
    const e = loadEngine(), target = hero('stable', {hp: 0, deaths: {s: 3, f: 0}, cond: ['Бессознательный']});
    e.setState({chars: [target]});
    e.applyDamageTo('ally:stable', 1, 'рубящий', 'Тест', {crit});
    assert.deepEqual(plain(target.deaths), {s: 0, f: failures});
  }
});

test('концентрация учитывает помеху и канонически гасит ее преимуществом', () => {
  const e = loadEngine(), caster = hero('caster', {exhaustion: 3, activeFx: [{uid: 'war-caster', k: 'audit', id: 'war-caster',
    label: 'Боевой заклинатель', fx: [{stat: 'save.concentration', mode: 'adv', value: 1}]}]});
  e.setState({chars: [caster]});
  assert.equal(e.concRollMode(caster), 0);
  caster.activeFx = []; caster.__fxC = null;
  assert.equal(e.concRollMode(caster), 2);
});

test('магия договора использует отдельную таблицу и возвращается после короткого отдыха', () => {
  const e = loadEngine(), classes = e.seedClassesDB();
  const cases = [[1, 1, 1], [2, 1, 2], [3, 2, 2], [9, 5, 2], [11, 5, 3], [17, 5, 4], [20, 5, 4]];
  for (const [level, circle, count] of cases) {
    const caster = hero(`pact-${level}`, {cls: 'Колдун', level, abilities: []});
    e.setState({chars: [caster], classes, activeCharId: caster.id});
    e.applyClassSlots(caster);
    assert.deepEqual(plain(caster.slots), {[circle]: {max: count, cur: count}});
    caster.slots[circle].cur = 0; caster.spentRest = count;
    e.refreshShortRestResources(caster);
    assert.equal(caster.slots[circle].cur, count);
    assert.equal(caster.spentRest, 0);
  }
});

test('известные, подготовленные и ритуальные заклинания различаются по классу', () => {
  const e = loadEngine(), classes = e.seedClassesDB();
  const abbr = {Бард: 'Брд', Чародей: 'Чрд', Колдун: 'Клд', Следопыт: 'Слд', Жрец: 'Жрц', Друид: 'Дрд', Паладин: 'Пал', Волшебник: 'Влш'};
  for (const cls of ['Бард', 'Чародей', 'Колдун', 'Следопыт']) {
    const spell = {id: `spell-${cls}`, n: 'Проверка', l: 1, c: abbr[cls], ritual: true};
    const caster = hero(cls, {cls, spellbook: [{spellId: spell.id, prep: false, access: 'known'}], slots: {1: {max: 2, cur: 2}}});
    e.setState({chars: [caster], classes, spells: [spell]});
    assert.equal(e.slotPlanFor(caster, spell, '1').ok, true, cls);
    assert.equal(e.slotPlanFor(caster, spell, 'ritual').ok, cls === 'Бард', `${cls}: ритуальное колдовство`);
  }
  for (const cls of ['Жрец', 'Друид', 'Паладин']) {
    const spell = {id: `spell-${cls}`, n: 'Проверка', l: 1, c: abbr[cls], ritual: true};
    const caster = hero(cls, {cls, spellbook: [{spellId: spell.id, prep: false, access: 'classList'}], slots: {1: {max: 2, cur: 2}}});
    e.setState({chars: [caster], classes, spells: [spell]});
    assert.equal(e.slotPlanFor(caster, spell, '1').ok, false, cls);
    assert.equal(e.slotPlanFor(caster, spell, 'ritual').ok, false, `${cls}: неподготовленный ритуал`);
  }
  const spell = {id: 'spell-wizard', n: 'Проверка', l: 1, c: 'Влш', ritual: true};
  const wizard = hero('wizard', {cls: 'Волшебник', spellbook: [{spellId: spell.id, prep: false, access: 'spellbook'}], slots: {1: {max: 2, cur: 0}}});
  e.setState({chars: [wizard], classes, spells: [spell]});
  assert.equal(e.slotPlanFor(wizard, spell, '1').ok, false);
  assert.equal(e.slotPlanFor(wizard, spell, 'ritual').ok, true, 'волшебник читает ритуал из книги без подготовки');
});

test('таблицы подготовки, известных заклинаний и заговоров точны на всех 20 уровнях восьми классов', () => {
  const e = loadEngine(), classes = e.seedClassesDB();
  const known = {
    Бард: [4,5,6,7,8,9,10,11,12,14,15,15,16,18,19,19,20,22,22,22],
    Чародей: [2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15],
    Колдун: [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
    Следопыт: [0,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11],
  };
  const cantrips = {
    Волшебник: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
    Жрец: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
    Друид: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
    Бард: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
    Чародей: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
    Колдун: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
    Паладин: Array(20).fill(0), Следопыт: Array(20).fill(0),
  };
  const fullCircles = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9];
  const pactCircles = [1,1,2,2,3,3,4,4,5,5,5,5,5,5,5,5,5,5,5,5];
  const halfCircles = [0,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5];
  for (const cls of Object.keys(cantrips)) {
    for (let level = 1; level <= 20; level++) {
      const caster = hero(`${cls}-${level}`, {cls, level, spellbook: [], ab: {str:10,dex:10,con:10,int:16,wis:16,cha:16}});
      e.setState({chars: [caster], classes});
      const meta = e.casterMeta(caster);
      const circles = meta.kind === 'pact' ? pactCircles : (meta.kind === 'half' ? halfCircles : fullCircles);
      assert.equal(e.maxCircleFor(caster), circles[level - 1], `${cls} ${level}: круг`);
      assert.equal(e.cantripKnownMax(caster), cantrips[cls][level - 1], `${cls} ${level}: заговоры`);
      assert.equal(e.knownSpellMax(caster), (known[cls] || Array(20).fill(0))[level - 1], `${cls} ${level}: известные`);
      const expectedPrep = meta.preparation === 'known' || circles[level - 1] === 0 ? 0
        : (meta.kind === 'half' ? Math.floor(level / 2) + 3 : level + 3);
      assert.equal(e.prepMax(caster), expectedPrep, `${cls} ${level}: подготовка`);
      const rule = classes.find(x => x.n === cls).mechanics.spellcasting;
      assert.equal(rule.edition, '2014');
      assert.equal(rule.preparation, meta.preparation);
      assert.equal(rule.listAccess, meta.listAccess);
    }
  }
});

test('план подготовки не меняет боевой список и вступает в силу только после допустимого долгого отдыха', () => {
  const e = loadEngine(), classes = e.seedClassesDB();
  const active = {id:'active', n:'Активное', l:1, c:'Влш', ritual:false};
  const planned = {id:'planned', n:'Запланированное', l:2, c:'Влш', ritual:false};
  const granted = {id:'granted', n:'Дар школы', l:2, c:'Влш', ritual:false};
  const caster = hero('wizard', {cls:'Волшебник', level:3, spellbook:[
    {spellId:active.id, prep:true, access:'spellbook'},
    {spellId:planned.id, prep:false, access:'spellbook'},
    {spellId:granted.id, prep:true, alwaysPrepared:true, countsAgainstPreparation:false, granted:true, access:'subclass'},
  ], slots:{1:{max:4,cur:1},2:{max:2,cur:1}}, abilities:[]});
  e.setState({chars:[caster], classes, spells:[active, planned, granted], activeCharId:caster.id});

  const draft = e.ensureSpellPreparationDraft(caster); draft.choices = [planned.id];
  assert.equal(e.prepCount(caster), 1);
  assert.equal(e.prepCount(caster, {draft:true}), 1);
  assert.equal(e.preparationPlanMinutes(caster), 2);
  assert.equal(e.spellEntryReady(caster, caster.spellbook[0], active), true);
  assert.equal(e.spellEntryReady(caster, caster.spellbook[1], planned), false);
  assert.equal(e.slotPlanFor(caster, active, '1').ok, true);
  assert.equal(e.slotPlanFor(caster, planned, '2').ok, false);

  e.state().combat.active = true;
  assert.equal(e.longRest(), false, 'отдых внутри боя должен быть отклонен');
  assert.equal(caster.slots[1].cur, 1);
  assert.equal(e.spellEntryReady(caster, caster.spellbook[0], active), true);
  e.state().combat.active = false;
  assert.equal(e.longRest(), true);
  assert.equal(caster.slots[1].cur, 4);
  assert.equal(e.spellEntryReady(caster, caster.spellbook[0], active), false);
  assert.equal(e.spellEntryReady(caster, caster.spellbook[1], planned), true);
  assert.equal(e.spellEntryReady(caster, caster.spellbook[2], granted), true);
  assert.equal(e.prepCount(caster), 1, 'всегда подготовленное не занимает лимит');
  assert.equal(caster.spellPrepDraft, undefined);
});

test('известные заклинания заменяются атомарно только в окно повышения уровня, а заговоры не заменяются', () => {
  const e = loadEngine(), classes = e.seedClassesDB();
  const spells = Array.from({length:6}, (_,i) => ({id:`bard-${i}`, n:`Песнь ${i}`, l:1, c:'Брд', ritual:false}));
  const cantrips = Array.from({length:3}, (_,i) => ({id:`cantrip-${i}`, n:`Нота ${i}`, l:0, c:'Брд', ritual:false}));
  const caster = hero('bard', {cls:'Бард', level:1, spellbook:spells.slice(0,4).map(sp=>({spellId:sp.id,prep:false,access:'known'}))
    .concat(cantrips.slice(0,2).map(sp=>({spellId:sp.id,prep:false,access:'known'}))), spellLearning:{replacements:1,anyClassChoices:0}});
  e.setState({chars:[caster], classes, spells:spells.concat(cantrips), activeCharId:caster.id});
  assert.equal(e.knownSpellCount(caster), 4);
  assert.equal(e.cantripKnownCount(caster), 2);
  assert.equal(e.spellAddCheck(caster, spells[4]).ok, false, 'полный список нельзя расширить сверх таблицы');

  e.delBookSpell(spells[0].id);
  assert.equal(caster.spellbook.some(x=>x.spellId===spells[0].id), true, 'старое заклинание остается до атомарного выбора нового');
  assert.equal(caster.spellReplacementDraft.removeId, spells[0].id);
  e.addSpellFromDB(spells[4].id);
  assert.equal(caster.spellbook.some(x=>x.spellId===spells[0].id), false);
  assert.equal(caster.spellbook.some(x=>x.spellId===spells[4].id), true);
  assert.equal(e.knownSpellCount(caster), 4);
  assert.equal(caster.spellLearning.replacements, 0);
  assert.equal(caster.spellReplacementDraft, undefined);

  e.delBookSpell(spells[1].id);
  assert.equal(caster.spellbook.some(x=>x.spellId===spells[1].id), true, 'без окна повышения уровня удаление блокируется');
  e.delBookSpell(cantrips[0].id);
  assert.equal(caster.spellbook.some(x=>x.spellId===cantrips[0].id), true, 'заговор нельзя заменить по базовым правилам 2014');
  assert.equal(e.spellAddCheck(caster, cantrips[2]).ok, false);
});

test('Тайны магии барда допускают ровно заработанные заклинания из чужих списков и считают их известными', () => {
  const e = loadEngine(), classes = e.seedClassesDB();
  const bardSpells = Array.from({length:12}, (_,i)=>({id:`known-${i}`,n:`Бард ${i}`,l:Math.min(5,1+Math.floor(i/3)),c:'Брд'}));
  const foreign = [{id:'foreign-1',n:'Чужая тайна 1',l:5,c:'Влш'},{id:'foreign-2',n:'Чужая тайна 2',l:5,c:'Жрц'},{id:'foreign-3',n:'Чужая тайна 3',l:5,c:'Дрд'}];
  const caster = hero('bard-10', {cls:'Бард',level:10,spellbook:bardSpells.map(sp=>({spellId:sp.id,access:'known',prep:false})),spellLearning:{replacements:0,anyClassChoices:2}});
  e.setState({chars:[caster],classes,spells:bardSpells.concat(foreign),activeCharId:caster.id});
  e.addSpellFromDB(foreign[0].id); e.addSpellFromDB(foreign[1].id);
  assert.equal(e.knownSpellCount(caster),14);
  assert.equal(caster.spellLearning.anyClassChoices,0);
  assert.equal(caster.spellbook.filter(x=>x.anyClassKnown).length,2);
  assert.equal(e.spellEntryReady(caster,caster.spellbook.find(x=>x.spellId===foreign[0].id),foreign[0]),true);
  assert.equal(e.spellAddCheck(caster,foreign[2]).ok,false);

  const leveling = hero('leveling-bard',{cls:'Бард',level:10,spellbook:[],spellLearning:{replacements:0,anyClassChoices:0}});
  e.setState({chars:[leveling],classes});
  const change=e.autoLevelSpells(leveling,9);
  assert.deepEqual(plain([change.learnChoices,leveling.spellLearning.replacements,leveling.spellLearning.anyClassChoices]),[2,1,2]);
});

test('полные списки жреца, друида и паладина синхронизируются, а волшебник и известные классы получают выборы', () => {
  const e = loadEngine(), classes=e.seedClassesDB(), spells=e.seedSpellsDB();
  for(const cls of ['Жрец','Друид','Паладин']){
    const caster=hero(cls,{cls,level:5,spellbook:[]});
    e.setState({chars:[caster],classes,spells});
    const result=e.syncClassSpellAccess(caster);
    const expected=spells.filter(sp=>sp.l>0&&sp.l<=e.maxCircleFor(caster)&&e.spellClassListHas(caster,sp)).map(sp=>sp.id).sort();
    assert.deepEqual(plain(caster.spellbook.map(x=>x.spellId).sort()),plain(expected),cls);
    assert.ok(result.added.length>0);
    assert.ok(caster.spellbook.every(x=>x.access==='classList'));
  }
  const paladin1=hero('paladin-1',{cls:'Паладин',level:1,spellbook:[]});
  e.setState({chars:[paladin1],classes,spells});e.syncClassSpellAccess(paladin1);
  assert.equal(paladin1.spellbook.length,0);

  const wizard=hero('wizard',{cls:'Волшебник',level:4,spellbook:[]});
  e.setState({chars:[wizard],classes,spells});
  assert.deepEqual(plain(e.autoLevelSpells(wizard,3)),{added:[],removed:[],learnChoices:2});
  assert.equal(wizard.spellbook.length,0,'волшебнику не добавляется весь классовый список');
  const ranger=hero('ranger',{cls:'Следопыт',level:2,spellbook:[],spellLearning:{replacements:0,anyClassChoices:0}});
  e.setState({chars:[ranger],classes,spells});
  const gained=e.autoLevelSpells(ranger,1);
  assert.equal(gained.learnChoices,2);assert.equal(ranger.spellLearning.replacements,1);
});

test('смена класса архивирует прежние известные записи и не переносит их в книгу волшебника', () => {
  const e=loadEngine(),classes=e.seedClassesDB();
  const shared={id:'shared',n:'Общее заклинание',l:1,c:'Брд, Влш'};
  const caster=hero('multiclass-edit',{cls:'Бард',level:3,spellbook:[{spellId:shared.id,prep:false,access:'known'}],spellLearning:{replacements:0,anyClassChoices:0}});
  e.setState({chars:[caster],classes,spells:[shared],activeCharId:caster.id});
  assert.equal(e.spellAccessCheck(caster,shared,caster.spellbook[0]).ok,true);
  e.setClass('Волшебник');
  assert.equal(caster.spellbook[0].access,'archive');
  assert.equal(e.spellAccessCheck(caster,shared,caster.spellbook[0]).ok,false,'известное барду не появляется само в книге волшебника');
  e.delBookSpell(shared.id);e.addSpellFromDB(shared.id);
  assert.equal(caster.spellbook[0].access,'spellbook');
  assert.equal(e.spellAccessCheck(caster,shared,caster.spellbook[0]).ok,true);
});

test('штатные Року и Торгар имеют полные канонические списки и корректные исключения особенностей', () => {
  const e=loadEngine(),classes=e.seedClassesDB(),spells=e.seedSpellsDB();
  const roku=e.buildRoku(),torgar=e.buildTorgar();
  e.setState({chars:[roku,torgar],classes,spells,activeCharId:roku.id});
  e.upgradeSpellcastingState(roku);e.upgradeSpellcastingState(torgar);
  assert.equal(e.prepCount(roku),6);assert.equal(e.prepMax(roku),6);
  const rokuBook=roku.spellbook.filter(entry=>{const sp=spells.find(x=>x.id===entry.spellId);return sp&&sp.l>0&&!entry.granted;});
  assert.equal(rokuBook.length,10,'у волшебника 3 уровня: 6 стартовых + 2 + 2');
  assert.equal(e.cantripKnownCount(roku),3);
  const school=roku.spellbook.find(x=>x.spellId==='sp_evoc_allies');
  assert.equal(e.spellEntryReady(roku,school,spells.find(x=>x.id===school.spellId)),true);
  let html=e.renderSheetPanel('spells');
  assert.match(html,/Активно подготовлено: <b>6 из 6<\/b>/);
  assert.ok(html.includes('Аудит подготовки: 320'));
  assert.ok(html.includes('Подготовить после отдыха'));

  assert.equal(e.prepCount(torgar),6);assert.equal(e.prepMax(torgar),6);
  assert.equal(e.cantripKnownCount(torgar),3);
  const always=torgar.spellbook.filter(x=>x.alwaysPrepared);
  assert.equal(always.length,4);
  always.forEach(entry=>assert.equal(e.spellEntryReady(torgar,entry,spells.find(x=>x.id===entry.spellId)),true));
  e.setState({chars:[roku,torgar],classes,spells,activeCharId:torgar.id});
  html=e.renderSheetPanel('spells');
  assert.match(html,/Активно подготовлено: <b>6 из 6<\/b>/);
  assert.ok(html.includes('еще 4 всегда подготовлено'));
});

test('миграция восстанавливает нулевой старый список и не считает всегда подготовленные заклинания', () => {
  const e=loadEngine(),classes=e.seedClassesDB();
  const spells=Array.from({length:5},(_,i)=>({id:`cleric-${i}`,n:`Молитва ${i}`,l:i<3?1:2,c:'Жрц'}));
  const legacy=hero('legacy',{cls:'Жрец',level:3,spellbook:spells.map(sp=>({spellId:sp.id,prep:false,access:'classList'})),spellPrepVersion:0});
  e.setState({chars:[legacy],classes,spells:[]});
  e.upgradeSpellcastingState(legacy);
  assert.equal(legacy.spellPrepVersion,0,'номер миграции нельзя ставить до загрузки гримуара');
  assert.equal(legacy.spellbook.length,5,'ранняя загрузка не удаляет записи полного списка');
  e.setState({chars:[legacy],classes,spells});
  assert.equal(e.upgradeSpellcastingState(legacy),true);
  assert.equal(e.prepCount(legacy),5);
  assert.equal(legacy.spellPrepVersion,3);
  const known=hero('old-bard',{cls:'Бард',level:3,spellbook:[],spellPrepDraft:{choices:['ghost']},spellPrepVersion:0});
  e.setState({chars:[known],classes,spells});e.upgradeSpellcastingState(known);
  assert.equal(known.spellPrepDraft,undefined);
  assert.deepEqual(plain(known.spellLearning),{replacements:0,anyClassChoices:0});

  const seeded=e.seedSpellsDB(),roku=e.buildRoku();
  roku.spellbook.forEach(entry=>{if(!entry.alwaysPrepared)entry.prep=false;});
  roku.spellPrepVersion=3;delete roku.spellPrepCanonicalVersion;
  e.setState({chars:[roku],classes,spells:seeded});e.upgradeSpellcastingState(roku);
  assert.equal(e.prepCount(roku),6,'отдельная каноническая миграция чинит уже помеченный старый лист');
  assert.equal(roku.spellPrepCanonicalVersion,1);
});

test('встроенный аудит подготовки проводит 320 проверок всех классов и полностью возвращает кампанию', () => {
  const e=loadEngine(),items=e.seedItemsDB(),spells=e.seedSpellsDB(),abilities=e.seedAbilitiesDB();
  const races=e.seedRacesDB(),classes=e.seedClassesDB(),foes=e.seedFoesDB(),party=[e.buildRoku(),e.buildTorgar(),e.buildSeptih(),e.buildLegerem()];
  e.setState({chars:party,items,spells,abilities,races,classes,foes,activeCharId:party[0].id});
  const before=plain(e.state()),report=e.runSpellPreparationAudit();
  assert.equal(report.total,320);assert.equal(report.passed,320,plain(report.failures));assert.equal(report.failed,0);
  assert.equal(Object.keys(report.categories).length,16);
  assert.deepEqual(plain(e.state()),before,'аудит не должен менять листы, базы или бой');
});

test('универсальное оружие не переходит на большую кость при занятой щитом руке', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const weapon = items.find(it => e.itemProfile(it).weapon && e.itemProfile(it).weapon.versatile);
  const shield = items.find(it => (e.itemProfile(it).armor || {}).acRule && (e.itemProfile(it).armor || {}).acRule.shield);
  const caster = hero('fighter', {cls: 'Воин', inventory: [{id: 'weapon', itemId: weapon.id, qty: 1}, {id: 'shield', itemId: shield.id, qty: 1}],
    equipment: {MAIN_HAND: 'weapon', OFF_HAND: 'shield'}});
  e.setState({chars: [caster], items});
  assert.equal(e.weaponAttackResourcePlan(caster, 'weapon', 'melee', {two: true}).ok, false);
  assert.equal(e.weaponSpecOf(caster, weapon, {kind: 'none', known: false, name: 'цель'}, {entryId: 'weapon', two: true}).rows.find(r => r.type === 'dmg').sides,
    e.weaponDamageOf(weapon).sides);
  delete caster.equipment.OFF_HAND;
  assert.equal(e.weaponAttackResourcePlan(caster, 'weapon', 'melee', {two: true}).ok, true);
  assert.equal(e.weaponSpecOf(caster, weapon, {kind: 'none', known: false, name: 'цель'}, {entryId: 'weapon', two: true}).rows.find(r => r.type === 'dmg').sides,
    e.itemProfile(weapon).weapon.versatile.sides);
});

test('дальняя дистанция и соседний враг структурно дают помеху дальнобойной атаке', () => {
  const e = loadEngine(), items = e.seedItemsDB();
  const bow = items.find(it => {
    const w = e.itemProfile(it).weapon;
    return w && w.ranged && e.attackRangeBands(w.range);
  });
  const caster = hero('archer', {cls: 'Воин', inventory: [{id: 'bow', itemId: bow.id, qty: 1}], equipment: {MAIN_HAND: 'bow'}});
  const target = {id: 'target', n: 'Далекая цель', kind: 'monster', ac: 12, hp: 20, hpMax: 20,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, saveBonuses: {}, skills: {}, profB: 2,
    resist: [], vuln: [], immune: [], damageRules: [], condImmune: [], effectImmunities: [], activeFx: [], cond: [], combatActions: []};
  e.setState({chars: [caster], items, foes: [target]});

  const long = e.weaponSpecOf(caster, bow, e.targetInfoOf('foe:target'), {entryId: 'bow', mode: 'ranged', within5: false, rangeBand: 'long'});
  assert.equal(long.rows.find(r => r.type === 'atk').adv, 2);
  const threatened = e.weaponSpecOf(caster, bow, e.targetInfoOf('foe:target'), {entryId: 'bow', mode: 'ranged', within5: false, threatenedWithin5: true});
  assert.equal(threatened.rows.find(r => r.type === 'atk').adv, 2, 'соседний враг может быть не выбранной далекой целью');

  caster.activeFx.push({uid: 'adv', k: 'audit', id: 'adv', label: 'Преимущество', fx: [{stat: 'attack.dex', mode: 'adv', value: 1}]});
  e.setState({chars: [caster], items, foes: [target]});
  const cancelled = e.weaponSpecOf(caster, bow, e.targetInfoOf('foe:target'), {entryId: 'bow', mode: 'ranged', within5: false, rangeBand: 'long'});
  assert.equal(cancelled.rows.find(r => r.type === 'atk').adv, 0);

  const out = e.weaponSpecOf(caster, bow, e.targetInfoOf('foe:target'), {entryId: 'bow', mode: 'ranged', within5: false, rangeBand: 'out'});
  const result = e.resolveOutcome(out, {atk: 20, dmg: 8});
  assert.equal(result.hit, false); assert.equal(result.crit, false); assert.equal(result.dmgTotal, 0);
  assert.equal(e.validateFormulaValues(out, {atk: 20, dmg: 8}, result).ok, false);
  assert.equal(e.weaponAttackResourcePlan(caster, 'bow', 'ranged', {rangeBand: 'out'}).ok, false);
});

test('укрытие входит в КД, спасбросок Ловкости и атомарный префлайт', () => {
  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB();
  const weapon = items.find(it => e.itemProfile(it).weapon && !e.itemProfile(it).weapon.ranged);
  const caster = hero('attacker', {cls: 'Воин', inventory: [{id: 'weapon', itemId: weapon.id, qty: 1}], equipment: {MAIN_HAND: 'weapon'}});
  const target = {id: 'target', n: 'Цель в укрытии', kind: 'monster', ac: 15, hp: 30, hpMax: 30,
    abil: {str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, saveBonuses: {}, skills: {}, profB: 2,
    resist: [], vuln: [], immune: [], damageRules: [], condImmune: [], effectImmunities: [], activeFx: [], cond: [], combatActions: []};
  e.setState({chars: [caster], items, spells, foes: [target]});

  const half = e.weaponSpecOf(caster, weapon, e.targetInfoOf('foe:target'), {entryId: 'weapon', cover: 'half'});
  const attackMod = half.rows.find(r => r.type === 'atk').mod;
  assert.equal(e.resolveOutcome(half, {atk: 17 - attackMod, dmg: 4}).hit, true, 'итог 17 равен КД 15 + 2');
  assert.equal(e.resolveOutcome(half, {atk: 16 - attackMod, dmg: 4}).hit, false);

  const total = e.weaponSpecOf(caster, weapon, e.targetInfoOf('foe:target'), {entryId: 'weapon', cover: 'total'});
  const totalResult = e.resolveOutcome(total, {atk: 20, dmg: 8});
  assert.equal(totalResult.hit, false); assert.equal(totalResult.dmgTotal, 0);
  assert.equal(e.validateFormulaValues(total, {atk: 20, dmg: 8}, totalResult).ok, false);
  assert.equal(e.weaponAttackResourcePlan(caster, 'weapon', 'melee', {cover: 'total'}).ok, false);

  const dexSpell = spells.find(sp => {
    const m = e.currentMechanics(sp, 'spell');
    return m && m.resolution && m.resolution.save && m.resolution.save.key === 'dex';
  });
  const plainSpec = e.rollSpecOf(dexSpell, {caster, kind: 'spell', slotLvl: dexSpell.l, target: e.targetInfoOf('foe:target')});
  const coveredSpec = e.rollSpecOf(dexSpell, {caster, kind: 'spell', slotLvl: dexSpell.l, target: e.targetInfoOf('foe:target'), cover: 'threeQuarters'});
  assert.equal(coveredSpec.rows.find(r => r.type === 'save').mod, plainSpec.rows.find(r => r.type === 'save').mod + 5);
});

test('встроенный стенд проводит ровно 250 редких боев и полностью возвращает кампанию', () => {
  const e = loadEngine(), items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB(), party = [e.buildRoku(), e.buildTorgar(), e.buildSeptih(), e.buildLegerem()];
  e.setState({chars: party, items, spells, abilities, races, classes, foes, activeCharId: party[0].id});
  const before = plain(e.state());
  const report = e.runRareBattleAudit();
  assert.equal(report.total, 250);
  assert.equal(report.passed, 250, plain(report.failures));
  assert.equal(report.failed, 0);
  assert.equal(Object.keys(report.categories).length, 25);
  assert.deepEqual(plain(e.state()), before, 'стенд не должен менять героев, бестиарий или бой');
});

test('500 воспроизводимых боев сохраняют инварианты при смешении оружия, состояний, защит и действий противников', () => {
  let seed = 0x5e2026;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const e = loadEngine(random);
  const items = e.seedItemsDB(), spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foeSeeds = e.seedFoesDB();
  const builders = [e.buildRoku, e.buildTorgar, e.buildSeptih, e.buildLegerem];
  const conditions = e.conditions().map(x => x.n);
  const weapons = items.filter(it => {
    const p = e.itemProfile(it);
    return p.kind === 'weapon' && p.weapon && !p.weapon.ammo;
  });
  const actionCases = [];
  foeSeeds.forEach(f => e.foeActionsOf(f)
    .filter(a => a.kind !== 'utility' && !a.requiresTargetEffect && !a.notWhileEffectActive && !a.requiresHit
      && !['reaction', 'long'].includes(a.cost || ''))
    .forEach(a => actionCases.push({foe: f, actionId: a.id})));
  assert.ok(weapons.length > 8, 'стресс-прогон должен менять оружие');
  assert.ok(actionCases.length > 20 && actionCases.length <= 500, 'стресс-прогон должен пройти все обычные действия противников');

  const covered = {heroes: new Set(), foes: new Set(), weapons: new Set(), actions: new Set(), conditions: new Set(),
    defenseModes: new Set(), hit: 0, miss: 0, save: 0, fail: 0, resets: 0};
  for (let battle = 0; battle < 500; battle++) {
    const actionCase = actionCases[battle % actionCases.length];
    const foe = plain(actionCase.foe), action = e.foeActionOf(foe, actionCase.actionId);
    const actor = builders[battle % builders.length]();
    actor.hpMax = Math.max(200, actor.hpMax); actor.hp = actor.hpMax; actor.hpTemp = 100;
    const condition = conditions[battle % conditions.length];
    const witness = hero(`witness_${battle}`, {name: `Свидетель ${battle}`, hp: 120, hpMax: 120, hpTemp: battle % 2 ? 9 : 0,
      cond: [condition]});
    const damageType = (action.damage && action.damage[0] && action.damage[0].type) || 'рубящий';
    const defenseMode = ['resist', 'immune', 'vuln'][battle % 3];
    witness.activeFx.push({uid: `defense_${battle}`, k: 'test', id: `defense_${battle}`, label: defenseMode,
      fx: [{stat: 'damage.rule', mode: 'grant', value: {mode: defenseMode, types: [damageType], when: ''}}]});
    if (battle % 5 === 0) witness.activeFx.push({uid: `conc_${battle}`, k: 'spell', id: `conc_${battle}`,
      label: 'Тестовая концентрация', casterId: actor.id, conc: true, fx: [{stat: 'ac', mode: 'add', value: 1}]});

    const weapon = weapons[battle % weapons.length], profile = e.itemProfile(weapon);
    const entry = {id: `stress_weapon_${battle}`, itemId: weapon.id, qty: 10};
    actor.inventory.push(entry);
    actor.equipment = profile.weapon.twoHanded ? {TWO_HAND: entry.id} : {MAIN_HAND: entry.id};
    e.setState({chars: [actor, witness], items, spells, abilities, races, classes, foes: [foe]});
    assert.equal(e.combatStart([{kind: 'foe', id: foe.id, nat: 20}, {kind: 'ally', id: actor.id, nat: 10}], `Стресс-бой ${battle + 1}`), true);

    covered.heroes.add(actor.id); covered.foes.add(foe.id); covered.conditions.add(condition); covered.defenseModes.add(defenseMode);
    e.setAutoRolls([20, 20, 20, 20]);
    const foeTarget = battle % 5 === 0 ? `ally:${actor.id}` : `ally:${witness.id}`;
    const foeSpec = e.foeActionSpecOf(foe, action, e.targetInfoOf(foeTarget), {within5: action.mode === 'melee'});
    const foeValues = manualFormulaValues(foeSpec, battle);
    const foeRolls = resolveManualOutcome(e, foeSpec, foeValues, {});
    const foeValid = e.validateFormulaValues(foeSpec, foeValues, foeRolls);
    assert.equal(foeValid.ok, true, `бой ${battle + 1}, ${foe.n}: ${foeValid.errors.join(' | ')}`);
    const foeCost = action.cost || (action.kind === 'attack' ? 'attack' : 'action');
    assert.equal(e.combatSpend(foeCost, action.n, `foe:${foe.id}`), true, `бой ${battle + 1}: затрата противника`);
    assert.equal(e.foeActionApply(foe.id, action.id, foeTarget, foeRolls), true, `бой ${battle + 1}: действие ${action.n}`);
    covered.actions.add(`${foe.id}:${action.id}`);
    if (foeRolls.saveOk === true) covered.save++; else if (foeRolls.saveOk === false) covered.fail++;
    e.closeCastModal();
    assertBattleInvariants(e, `бой ${battle + 1} после противника`);

    e.setAutoRolls([20, 20, 20, 20]);
    assert.equal(e.combatNextTurn(), true, `бой ${battle + 1}: переход к герою`);
    assert.equal(e.state().combat.turn.actorKey, `ally:${actor.id}`);
    const weaponSpec = e.weaponSpecOf(actor, weapon, e.targetInfoOf(`foe:${foe.id}`),
      {entryId: entry.id, mode: 'melee', within5: true});
    const weaponValues = manualFormulaValues(weaponSpec, battle + 1);
    const weaponRolls = resolveManualOutcome(e, weaponSpec, weaponValues, {});
    const weaponValid = e.validateFormulaValues(weaponSpec, weaponValues, weaponRolls);
    assert.equal(weaponValid.ok, true, `бой ${battle + 1}, ${weapon.n}: ${weaponValid.errors.join(' | ')}`);
    const hpBefore = foe.hp;
    const canAttack = e.combatCanSpend('attack', `ally:${actor.id}`, true);
    if (canAttack) {
      assert.equal(e.combatSpend('attack', weapon.n, `ally:${actor.id}`), true, `бой ${battle + 1}: затрата атаки`);
      assert.equal(e.weaponAttackApply(entry.id, actor.id, `foe:${foe.id}`, weaponRolls), true, `бой ${battle + 1}: атака оружием`);
      covered.weapons.add(weapon.id);
      if (weaponRolls.hit === true) covered.hit++; else if (weaponRolls.hit === false) covered.miss++;
      if (weaponRolls.hit === false) assert.equal(foe.hp, hpBefore, `бой ${battle + 1}: промах нанес урон`);
      else assert.ok(foe.hp <= hpBefore, `бой ${battle + 1}: попадание вылечило противника`);
    } else {
      assert.equal(e.combatSpend('attack', weapon.n, `ally:${actor.id}`), false,
        `бой ${battle + 1}: недееспособность должна блокировать атаку`);
      assert.equal(foe.hp, hpBefore, `бой ${battle + 1}: заблокированная атака изменила цель`);
    }
    e.closeCastModal();
    assertBattleInvariants(e, `бой ${battle + 1} после героя`);

    e.setAutoRolls([20, 20, 20, 20]);
    if (e.state().combat.active) {
      e.combatNextTurn();
      const current = e.state().combat.turn && e.state().combat.turn.actorKey;
      if (current && e.combatCanSpend('action', current, true)) e.combatBasicAction('dodge');
    }
    assertBattleInvariants(e, `бой ${battle + 1} после смены последовательности`);
    if (e.state().combat.active) assert.equal(e.combatEnd(true), true);
    assert.equal(e.resetCombatAndParty(true), true);
    covered.resets++;
    const resetState = e.state();
    assert.equal(resetState.combat.active, false); assert.equal(resetState.fxRound, 1);
    assert.deepEqual(plain(resetState.chars.slice(0, 4).map(x => x.id)), ['char_roku', 'char_torgar', 'char_septih', 'char_legerem']);
  }

  assert.equal(covered.resets, 500);
  assert.equal(covered.heroes.size, 4);
  assert.equal(covered.foes.size, new Set(actionCases.map(x => x.foe.id)).size);
  assert.equal(covered.weapons.size, weapons.length);
  assert.equal(covered.actions.size, actionCases.length);
  assert.equal(covered.conditions.size, conditions.length);
  assert.deepEqual([...covered.defenseModes].sort(), ['immune', 'resist', 'vuln']);
  assert.ok(covered.hit > 0 && covered.miss > 0, 'нужны и попадания, и промахи');
  assert.ok(covered.save > 0 && covered.fail > 0, 'нужны успешные и проваленные спасброски');
});

test('каждый встроенный игровой элемент имеет проверяемый структурированный контракт', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), items = e.seedItemsDB();
  const races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();

  for (const [kind, rows] of [['spell', spells], ['ability', abilities], ['item', items]]) {
    rows.forEach(row => assert.deepEqual(plain(e.mechanicsErrors(row.mechanics, kind)), [], kind + ': ' + row.n));
  }
  races.forEach(row => assert.deepEqual(plain(e.referenceMechanicsErrors(row.mechanics, 'race')), [], 'race: ' + row.n));
  classes.forEach(row => assert.deepEqual(plain(e.referenceMechanicsErrors(row.mechanics, 'class')), [], 'class: ' + row.n));
  foes.forEach(row => {
    assert.equal(row.mechanics.mode, 'structured', 'foe: ' + row.n);
    assert.ok(e.foeActionsOf(row).length, 'foe actions: ' + row.n);
  });
  e.conditions().forEach(row => {
    assert.equal(row.mechanics.mode, 'structured', 'condition: ' + row.n);
    assert.deepEqual(plain(e.conditionRules(row.n)), plain(row.mechanics.rules));
  });

  const audit = e.gameDataAudit({spells, abilities, items, races, classes, foes, chars: []});
  assert.deepEqual(plain(audit.errors), []);
});

test('явные mechanics заклинания и способности не меняются от литературного текста', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB();
  const fireball = spells.find(x => x.n === 'Огненный шар');
  const parry = abilities.find(x => x.id === 'ab_lg_parry');
  const dice = abilities.find(x => x.id === 'ab_lg_dice');
  [fireball, parry, dice].forEach(x => { x.mechanics.origin = 'explicit'; });
  const caster = hero('fighter', {abilities: [{abilityId: dice.id, cur: 3}, {abilityId: parry.id}]});
  e.setState({chars: [caster], spells, abilities});

  const spellMechanics = plain(fireball.mechanics);
  const before = e.rollSpecOf(fireball, {caster, kind: 'spell', slotLvl: 3, target: {kind: 'none', known: false, name: 'цель'}});
  fireball.x = 'Теперь это лечение 99d99 без спасброска.';
  fireball.hi = 'Каждый круг добавляет 20d20.';
  fireball.cm = '—';
  fireball.d = 'Концентрация, 1 год';
  fireball.r = 'Касание';
  fireball.tags = ['healing'];
  e.upgradeSpell(fireball);
  const after = e.rollSpecOf(fireball, {caster, kind: 'spell', slotLvl: 3, target: {kind: 'none', known: false, name: 'цель'}});
  assert.deepEqual(plain(fireball.mechanics), spellMechanics);
  assert.deepEqual(plain(after.rows), plain(before.rows));
  assert.equal(e.currentMechanics(fireball, 'spell').duration.kind, 'instant');

  const poolView = pool => ({label: pool.label, sides: pool.sides, providerId: pool.ab.id, cur: pool.cur, max: pool.max, addTo: pool.addTo});
  const poolBefore = poolView(e.abilityPoolOf(caster, parry));
  const roleBefore = e.abilityIsActive(parry);
  parry.x = 'Не тратит никакой ресурс и всегда является пассивной.';
  parry.tags = ['passive'];
  parry.mode = 'passive';
  dice.x = 'Это не запас и не содержит костей.';
  e.upgradeAbility(parry); e.upgradeAbility(dice);
  assert.deepEqual(poolView(e.abilityPoolOf(caster, parry)), poolBefore);
  assert.equal(e.abilityIsActive(parry), roleBefore);
  assert.equal(parry.mechanics.combat.inlineResolution.kind, 'damageMitigation');
});

test('профили предметов, народов, классов и противников независимы от справочного текста', () => {
  const e = loadEngine();
  const items = e.seedItemsDB(), races = e.seedRacesDB(), classes = e.seedClassesDB(), foes = e.seedFoesDB();
  const sword = items.find(x => x.n === 'Длинный меч');
  sword.mechanics.origin = 'explicit';
  const caster = hero('fighter', {level: 5, ab: {str: 16, dex: 12, con: 10, int: 10, wis: 10, cha: 10}});
  e.setState({chars: [caster], items, races, classes, foes});
  const profile = plain(e.itemProfile(sword));
  const before = e.weaponSpecOf(caster, sword, {kind: 'none', known: false, name: 'цель'}, {});
  sword.dmg = '99d99';
  sword.dmgType = 'огонь';
  sword.props = 'Дальнобойное, фехтовальное, магическое';
  sword.desc = 'Посеребренное и адамантиновое.';
  sword.tags = ['ranged', 'finesse', 'magical', 'silvered', 'adamantine'];
  e.upgradeItem(sword);
  const after = e.weaponSpecOf(caster, sword, {kind: 'none', known: false, name: 'цель'}, {});
  assert.deepEqual(plain(e.itemProfile(sword)), profile);
  assert.deepEqual(plain(after.rows), plain(before.rows));
  assert.deepEqual(plain(after.meta.damageTags), plain(before.meta.damageTags));

  const race = races[0], cls = classes[0], foe = foes[0];
  race.mechanics.origin = 'explicit'; cls.mechanics.origin = 'explicit';
  const raceMechanics = plain(race.mechanics), classMechanics = plain(cls.mechanics), foeActions = plain(e.foeActionsOf(foe));
  race.ab = '+99 ко всем характеристикам'; race.sp = '0 м'; race.tr = ['Совсем другая черта'];
  cls.armor = 'Нет'; cls.weap = 'Нет'; cls.lv = [[1, 'Сто дополнительных атак']];
  foe.traits = 'Иммунитет ко всему и критическим попаданиям.';
  foe.actions = 'Наносит 1000d1000 урона.';
  e.upgradeRace(race); e.upgradeClass(cls); e.upgradeFoe(foe);
  assert.deepEqual(plain(race.mechanics), raceMechanics);
  assert.deepEqual(plain(cls.mechanics), classMechanics);
  assert.deepEqual(plain(e.foeActionsOf(foe)), foeActions);
  assert.equal(e.foeDefensesOf(foe).criticalHitImmune, false);
});

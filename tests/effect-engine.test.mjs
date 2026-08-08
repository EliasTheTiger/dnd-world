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
        chars=s.chars||[]; journal=[]; itemsDB=s.items||[]; spellsDB=s.spells||[];
        abilitiesDB=s.abilities||[]; racesDB=s.races||[]; classesDB=s.classes||[];
        rulesDB=s.rules||[]; foesDB=s.foes||[]; activeCharId=s.activeCharId||null; fxRound=s.fxRound||1;
        combat=normalizeCombatState(s.combat); lastCastEvent=null; castCtx=null; rollSpec=null; fxInvalidate();
      },
      loadAll, blankCombat,
      state() { return {chars,itemsDB,spellsDB,foesDB,activeCharId,fxRound,lastCastEvent,combat}; },
      applyFxTo, removeActiveFx, advanceFxRound, attachDuration, spellFxForCast,
      castSpellApply, canCastCheck, parseComponents, materialPlanFor,
      charFxAll, fxSum, eHpMax, acTotal, speedTotal, concEntriesOf,
      breakConcentration, longRest, activeStackWinners, durationSpecOf, spellNeedsConcentration, spellTargetLimit,
      applyDamageTo, applyRollsToTarget, useAbilityApply, outcomeAllowsEffect, effectiveConditions,
      rollSpecOf, resolveOutcome, targetInfoOf, weaponSpecOf, weaponAttackApply, useItemApply,
      dmgAfterTraits, effectiveFoeConditions, castDispel, rollbackLastCast,
      seedItemsDB, seedSpellsDB, seedAbilitiesDB, seedRacesDB, seedClassesDB, seedFoesDB, gameDataAudit,
      buildRoku, buildTorgar, buildSeptih, buildLegerem,
      foeActionOf, foeActionFormula, foeActionSpecOf, foeActionApply,
      abilityIsActive, isPassiveAbility, abilityPoolOf, itemProfile, weaponBonusOf, ammoRemaining, ammoRecover, invQty,
      validateFormulaValues, saveConditionMode,
      combatStart, combatNextTurn, combatEnd, combatSpend, combatCanSpend, combatBasicAction, combatFocus,
      combatCastSpell, combatUseAbility, combatWeapon, combatFoeAction, combatSyncChanges, combatVictoryText,
      combatDeathSave, combatContestAction, combatTriggerReady, combatOpportunityBlocked, combatSetGroup, combatSpellTurnAllowed,
      combatAbilityCost, combatAbilityUsable, combatSpellCost, combatCunningAction,
      castConfirm, castFormulaShow, castFormulaConfirm, closeCastModal,
      castState() { return {ctx:castCtx, spec:castCtx&&castCtx.spec}; },
      makeBlank() { return buildBlank(); },
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
  const caster = hero('caster');
  const target = hero('target');
  const hold = {
    id: 'hold', n: 'Удержание личности', l: 2, cm: '—', d: 'Концентрация, 1 мин.', conc: true,
    x: 'Гуманоид парализован (спасбросок Мудрости в конце каждого хода).'
  };
  e.setState({chars: [caster, target], spells: [hold]});

  const rolls = {saveOk: true, hit: null, contestWin: null, effectAllowed: false, dmgRaw: null, dmgTotal: null, verdict: []};
  assert.equal(e.castSpellApply(hold.id, caster.id, `ally:${target.id}`, '', undefined, 'free', rolls), true);
  assert.equal(target.activeFx.length, 0);
  assert.equal(e.effectiveConditions(target).includes('Парализованный'), false);
});

test('многоцелевое лечение одним броском применяется ко всем выбранным целям', () => {
  const e = loadEngine();
  const caster = hero('caster');
  const a = hero('a', {hp: 1, hpMax: 30});
  const b = hero('b', {hp: 2, hpMax: 30});
  const c = hero('c', {hp: 3, hpMax: 30});
  const mass = {id: 'mass', n: 'Массовое лечение ран', l: 5, cm: 'В, С', d: 'Мгновенная', x: 'До шести существ восстанавливают 3d8 + модификатор Мудрости хитов.'};
  const rolls = {healTotal: 17, tempTotal: null, dmgRaw: null, dmgTotal: null, hit: null, saveOk: null, contestWin: null, effectAllowed: true, verdict: []};
  e.setState({chars: [caster, a, b, c], spells: [mass]});

  assert.equal(e.castSpellApply(mass.id, caster.id, `ally:${a.id}`, '', undefined, 'free', rolls,
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

test('отмена расхода общего запаса не тратит собственный заряд способности', () => {
  const e = loadEngine();
  const pool = {id: 'pool', n: 'Кости превосходства d8', uses: 1, rest: 'короткий отдых', x: 'Запас костей превосходства.'};
  const maneuver = {id: 'maneuver', n: 'Прием', uses: 1, rest: 'короткий отдых', x: 'Вы можете потратить кость превосходства и нанести дополнительный урон.'};
  const caster = hero('caster', {abilities: [{abilityId: maneuver.id, cur: 1}, {abilityId: pool.id, cur: 0}]});
  const target = hero('target');
  e.setState({chars: [caster, target], abilities: [maneuver, pool]});
  e.setConfirmResults([false]);

  assert.equal(e.useAbilityApply(maneuver.id, caster.id, `ally:${target.id}`, {poolSpend: pool.id}), false);
  assert.equal(caster.abilities[0].cur, 1);
  assert.equal(caster.abilities[1].cur, 0);
});

test('Контрзаклинание спрашивает круг цели один раз до списания ячейки', () => {
  const e = loadEngine();
  const caster = hero('caster', {slots: {3: {max: 1, cur: 1}}});
  const counter = {id: 'counter', n: 'Контрзаклинание', l: 3, cm: 'В', d: 'Мгновенная', x: ''};
  e.setState({chars: [caster], spells: [counter]});
  e.setPromptResults(['2']);

  assert.equal(e.castSpellApply(counter.id, caster.id, 'enemy', '', undefined, '3'), true);
  assert.equal(e.promptCount(), 1);
  assert.equal(caster.slots[3].cur, 0);
});

test('длительный эффект на противнике хранится, учитывается концентрацией и истекает', () => {
  const e = loadEngine();
  const caster = hero('caster');
  const foe = {id: 'foe', n: 'Враг', kind: 'monster', ac: 12, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  const hold = {id: 'hold', n: 'Удержание личности', l: 2, cm: '—', d: 'Концентрация, 1 мин.', conc: true,
    x: 'Гуманоид парализован (спасбросок Мудрости в конце каждого хода).'};
  e.setState({chars: [caster], foes: [foe], spells: [hold]});

  assert.equal(e.castSpellApply(hold.id, caster.id, `foe:${foe.id}`, '', undefined, 'free',
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

test('контракт проверяет все 331 запись и каждый допустимый вариант круга без ошибок', () => {
  const e = loadEngine();
  const spells = e.seedSpellsDB(), abilities = e.seedAbilitiesDB(), items = e.seedItemsDB();
  e.setState({spells, abilities, items});
  const audit = e.gameDataAudit({spells, abilities, items});

  assert.deepEqual(plain(audit.counts), {spells: 121, abilities: 77, items: 133, total: 331});
  assert.equal(audit.variants, 881);
  assert.deepEqual(plain(audit.errors), []);
  assert.equal(Object.values(audit.modes.spell).reduce((a, b) => a + b, 0), 121);
  assert.equal(Object.values(audit.modes.ability).reduce((a, b) => a + b, 0), 77);
  assert.equal(Object.values(audit.modes.item).reduce((a, b) => a + b, 0), 133);
  assert.equal(audit.itemActions.automatic + audit.itemActions.manual, 133);
  assert.equal(new Set(audit.itemActions.manualNames).size, audit.itemActions.manual);
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
  const heal = e.rollSpecOf(potion, {caster, kind: 'item'}).rows.find(r => r.type === 'heal');
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
  const caster = hero('caster');
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
  assert.equal(e.castSpellApply(saveSpell.id, caster.id, `ally:${target.id}`, '', undefined, 'free', {
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

  assert.equal(e.castSpellApply(sleep.id, caster.id, `foe:${c.id}`, '', undefined, 'free', {
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
  const caster = hero('caster');
  const foe = (id, hp) => ({id, n: id, kind: 'monster', ac: 10, hp, hpMax: 150, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []});
  const low = foe('low', 100), high = foe('high', 101);
  e.setState({chars: [caster], foes: [low, high], spells});

  assert.equal(e.castSpellApply(word.id, caster.id, `foe:${low.id}`, '', undefined, 'free'), true);
  assert.equal(low.hp, 0);
  assert.equal(e.castSpellApply(word.id, caster.id, `foe:${high.id}`, '', undefined, 'free'), true);
  assert.equal(high.hp, 101);
});

test('Контрзаклинание откатывает урон и эффекты именно последнего каста', () => {
  const e = loadEngine();
  const mage = hero('mage');
  const counterer = hero('counterer', {slots: {3: {max: 1, cur: 1}}});
  const victim = hero('victim', {hp: 30, hpMax: 30});
  const blast = {id: 'blast', n: 'Взрыв', l: 3, cm: 'В', d: 'Мгновенная', x: 'Цель получает 8d6 урона огнем.'};
  const counter = {id: 'counter', n: 'Контрзаклинание', l: 3, cm: 'В', d: 'Мгновенная', x: ''};
  e.setState({chars: [mage, counterer, victim], spells: [blast, counter]});

  assert.equal(e.castSpellApply(blast.id, mage.id, `ally:${victim.id}`, '', undefined, 'free', {
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
  const cleric = hero('cleric');
  const fighter = hero('fighter', {
    cls: 'Воин', level: 5, ab: {str: 18, dex: 12, con: 16, int: 10, wis: 10, cha: 10},
    inventory: [{id: 'sword-entry', itemId: sword.id, qty: 1}], equipment: {MAIN_HAND: 'sword-entry'}
  });
  const foe = {id: 'foe', n: 'Каменный страж', kind: 'monster', ac: 15, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: ['рубящий'], vuln: [], immune: [], condImmune: [], cond: [], activeFx: []};
  const bless = {id: 'bless', n: 'Благословение', l: 1, cm: 'В', d: 'Концентрация, 1 мин.', conc: true, x: ''};
  e.setState({chars: [cleric, fighter], foes: [foe], items, spells: [bless], classes: e.seedClassesDB()});

  assert.equal(e.castSpellApply(bless.id, cleric.id, `ally:${fighter.id}`, '', undefined, 'free'), true);
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
  const caster = hero('caster');
  const attacker = hero('attacker', {cls: 'Воин', inventory: [{id: 'sword-entry', itemId: sword.id, qty: 1}]});
  const foe = {id: 'foe', n: 'Невидимка', kind: 'monster', ac: 12, hp: 20, hpMax: 20, hpTemp: 0,
    abil: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10}, saveP: {}, profB: 2,
    resist: [], vuln: [], immune: [], condImmune: [], cond: [], activeFx: [{uid: 'invis', k: 'spell', id: invis.id,
      label: invis.n, casterId: 'other', stackKey: `spell:${invis.id}`, power: 2, fx: e.spellFxForCast(invis, 2)}]};
  e.setState({chars: [caster, attacker], foes: [foe], spells, items, classes: e.seedClassesDB()});

  const saveSpec = e.rollSpecOf(faerie, {caster, kind: 'spell', slotLvl: 1, target: e.targetInfoOf(`foe:${foe.id}`)});
  assert.ok(saveSpec.rows.some(r => r.type === 'save'));
  assert.ok(e.spellTargetLimit(faerie, 1) >= 2);
  assert.equal(e.castSpellApply(faerie.id, caster.id, `foe:${foe.id}`, '', undefined, 'free', {
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

test('пустое хранилище загружается сразу с четырьмя экипированными героями и четырьмя врагами', async () => {
  const e = loadEngine();
  await e.loadAll();
  const state = e.state();
  assert.deepEqual(plain(state.chars.map(c => c.id)), ['char_roku','char_torgar','char_septih','char_legerem']);
  assert.deepEqual(plain(state.foesDB.map(f => f.id)), ['foe_goblin_scout','foe_skeleton_guard','foe_orc_raider','foe_dire_wolf']);
  state.chars.forEach(c => {
    Object.values(c.equipment).forEach(entryId => assert.ok(c.inventory.some(e => e.id === entryId), `${c.name}: слот ${entryId} не существует`));
    c.inventory.forEach(entry => assert.ok(state.itemsDB.some(it => it.id === entry.itemId), `${c.name}: предмет ${entry.itemId} осиротел`));
  });
});

test('стартовый бестиарий содержит исполняемые формулы каждого действия', () => {
  const e = loadEngine();
  const foes = e.seedFoesDB();
  assert.deepEqual(plain(foes.map(f => f.n)), ['Гоблин-разведчик', 'Скелет-страж', 'Орк-налетчик', 'Лютоволк']);
  const target = hero('target', {hp: 30, hpMax: 30, ab: {str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10}});
  e.setState({chars: [target], foes});
  foes.forEach(f => {
    assert.ok(f.combatActions.length, `${f.n}: нет структурированных действий`);
    f.combatActions.forEach(a => {
      const spec = e.foeActionSpecOf(f, a, e.targetInfoOf(`ally:${target.id}`));
      assert.ok(spec.rows.some(r => r.type === 'dmg'), `${f.n}/${a.n}: нет урона`);
      if (a.kind === 'attack') assert.ok(spec.rows.some(r => r.type === 'atk'), `${f.n}/${a.n}: нет d20 атаки`);
      assert.match(e.foeActionFormula(a), /d20|спасбросок/);
    });
  });
  const html = e.renderWorld().foes;
  ['Гоблин-разведчик', 'Скелет-страж', 'Орк-налетчик', 'Лютоволк', 'Провести действие'].forEach(x => assert.ok(html.includes(x), `нет индикатора «${x}»`));
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
  assert.deepEqual(plain(shown.spec.rows.filter(r => r.type !== 'extra').map(r => r.type)), ['atk', 'res', 'dmg', 'save']);

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
  const spec = e.rollSpecOf(precise, {caster: fighter, kind: 'ability', target: {kind: 'none', known: false, name: 'цель'},
    weapon: {n: 'Топор', atk: 5, dmg: '1d8', dt: 'рубящий', m: 3, mode: 'melee', within5: true}, pool, forceAttack: true});
  const values = {atk: 10, wdmg: 5, res: null};
  assert.equal(e.validateFormulaValues(spec, values, e.resolveOutcome(spec, values, {hitOverride: 'hit'})).ok, false,
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

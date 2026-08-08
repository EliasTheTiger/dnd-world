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
        lastCastEvent=null; castCtx=null; fxInvalidate();
      },
      state() { return {chars,itemsDB,spellsDB,foesDB,activeCharId,fxRound,lastCastEvent}; },
      applyFxTo, removeActiveFx, advanceFxRound, attachDuration, spellFxForCast,
      castSpellApply, canCastCheck, parseComponents, materialPlanFor,
      charFxAll, fxSum, eHpMax, acTotal, speedTotal, concEntriesOf,
      breakConcentration, longRest, activeStackWinners, durationSpecOf, spellNeedsConcentration, spellTargetLimit,
      applyDamageTo, applyRollsToTarget, useAbilityApply, outcomeAllowsEffect, effectiveConditions,
      rollSpecOf, resolveOutcome, targetInfoOf, weaponSpecOf, weaponAttackApply, useItemApply,
      dmgAfterTraits, effectiveFoeConditions, castDispel, rollbackLastCast,
      seedItemsDB, seedSpellsDB, seedAbilitiesDB, seedRacesDB, seedClassesDB, gameDataAudit,
      abilityIsActive, isPassiveAbility, itemProfile,
      makeBlank() { return buildBlank(); },
      renderWorld() {
        renderRaces(); renderClasses(); renderRules(); renderChars(); renderJournal();
        renderSpellsDB(); renderItemsDB(); renderAbilitiesDB(); renderFoes();
        return ['chars','races','classes','spellsdb','itemsdb','abilitiesdb','foes','rules','journal']
          .reduce((o,id)=>{ o[id]=document.getElementById('tab-'+id).innerHTML; return o; },{});
      },
      renderSheetPanel(name) {
        sheetTab=name; renderChars(); return document.getElementById('tab-chars').innerHTML;
      },
      setConfirmResults(v){ globalThis.__confirmQueue=v.slice(); },
      setPromptResults(v){ globalThis.__promptQueue=v.slice(); globalThis.__promptCount=0; },
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
  assert.deepEqual([relentless.mode, relentless.uses, relentless.rest], ['active', 1, 'длинный отдых']);
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
  assert.deepEqual(Object.keys(world), ['chars', 'races', 'classes', 'spellsdb', 'itemsdb', 'abilitiesdb', 'foes', 'rules', 'journal']);
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

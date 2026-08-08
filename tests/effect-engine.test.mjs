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
        abilitiesDB=s.abilities||[]; racesDB=[]; classesDB=s.classes||[];
        rulesDB=[]; foesDB=s.foes||[]; activeCharId=s.activeCharId||null; fxRound=s.fxRound||1;
      },
      state() { return {chars,itemsDB,spellsDB,foesDB,activeCharId,fxRound,lastCastEvent}; },
      applyFxTo, removeActiveFx, advanceFxRound, attachDuration, spellFxForCast,
      castSpellApply, canCastCheck, parseComponents, materialPlanFor,
      charFxAll, fxSum, eHpMax, acTotal, speedTotal, concEntriesOf,
      breakConcentration, longRest, activeStackWinners, durationSpecOf, spellNeedsConcentration, spellTargetLimit,
      applyDamageTo, applyRollsToTarget, useAbilityApply, outcomeAllowsEffect, effectiveConditions,
      rollSpecOf, resolveOutcome, targetInfoOf,
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

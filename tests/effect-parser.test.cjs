const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEngine() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  let source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  source = source.replace(/\/\* ═+ ЗАПУСК ═+ \*\/[\s\S]*$/, '');
  source += `
    renderChars=()=>{};
    scheduleSave=()=>{};
    scheduleJournalSave=()=>{};
    setStatus=()=>{};
    castLogLine=()=>{};
    globalThis.__engine={
      deriveFx,recFx,deriveInstantHeal,parseComponents,parseFxLines,fxToLines,
      matConsumeFor,isPassiveAbility,effectiveConditions,effectiveSpeed,castSpellApply,removeActiveFx,
      seedItemsDB,seedSpellsDB,seedAbilitiesDB,
      setState(state){
        chars=state.chars||[];
        spellsDB=state.spells||[];
        abilitiesDB=state.abilities||[];
        itemsDB=state.items||[];
      },
      getChar(id){ return getCh(id); },
      /* Правило проекта: сайт НИКОГДА не бросает кости сам — их бросают живые игроки,
         а мастер вписывает результат. Поэтому вместо Math.random тест подставляет
         выпавшие значения служебным каналом. */
      setAutoRolls(v){ window.__autoRolls=v; }
    };
  `;

  const storage = new Map();
  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    fetch: async () => ({ ok: false }),
    confirm: () => true,
    alert: () => {},
    prompt: () => null,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ click() {}, remove() {}, style: {}, appendChild() {}, setAttribute() {} }),
      body: { appendChild() {} }
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    indexedDB: undefined,
    EventSource: function EventSource() {},
    Blob: function Blob() {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    FileReader: function FileReader() {},
    navigator: {},
    location: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.__engine;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const engine = loadEngine();

test('разделители компонентов не отключают обязательные проверки', () => {
  assert.deepEqual(
    plain(engine.parseComponents({ cm: 'В / С / М' })),
    { v: true, s: true, m: true, matDesc: '', flex: false }
  );
  assert.deepEqual(
    plain(engine.parseComponents({ cm: 'В, С, М (щепотка песка/лепестков)' })),
    { v: true, s: true, m: true, matDesc: 'щепотка песка/лепестков', flex: false }
  );
});

test('парсер извлекает совместный бонус к атаке и урону', () => {
  const fx = plain(engine.deriveFx({ x: 'Оружие получает бонус +1 к атаке и урону.' }, 'spell'));
  assert.deepEqual(fx, [
    { stat: 'atk', mode: 'add', value: 1 },
    { stat: 'dmg', mode: 'add', value: 1 }
  ]);
});

test('условный выбор характеристики не применяется безусловно', () => {
  const fx = plain(engine.deriveFx({
    x: 'Если в руках дробящее оружие, значение вашей Мудрости или Телосложения (на выбор) увеличивается на 1.'
  }, 'ability'));
  assert.equal(fx.some(x => x.stat === 'ab.wis' || x.stat === 'ab.con'), false);
  assert.equal(fx.some(x => x.stat === 'note' && /на выбор/.test(x.value)), true);
});

test('поддерживаются сопротивление, состояния, КД и скорость', () => {
  const resistance = plain(engine.deriveFx({ x: 'Вы получаете сопротивление урону огнем.' }, 'ability'));
  assert.equal(resistance.some(x => x.value === 'сопротивление урону: огнем'), true);

  const hold = plain(engine.deriveFx({ x: 'Гуманоид парализован до конца действия.' }, 'spell'));
  assert.equal(hold.some(x => x.stat === 'condition' && x.value === 'Парализованный'), true);

  const trueSight = plain(engine.deriveFx({
    x: 'Цель видит в магической тьме и замечает невидимое.'
  }, 'spell'));
  assert.equal(trueSight.some(x => x.stat === 'condition'), false);

  const haste = plain(engine.deriveFx({
    x: 'Удвоенная скорость, +2 КД, преимущество на спасброски Ловкости.'
  }, 'spell'));
  assert.equal(haste.some(x => x.stat === 'speed' && x.mode === 'mul' && x.value === 2), true);
  assert.equal(haste.some(x => x.stat === 'ac' && x.mode === 'add' && x.value === 2), true);

  const barkskin = plain(engine.deriveFx({ x: 'КД не может быть ниже 16.' }, 'spell'));
  assert.deepEqual(barkskin, [{ stat: 'ac', mode: 'min', value: 16 }]);
});

test('мини-язык эффектов сохраняет расширенные типы при обратном преобразовании', () => {
  const text = ['кд-мин 16', 'скорость +3 м', 'скорость ×2', 'состояние: Опутанный', 'хар.мудр LVL'].join('\n');
  const parsed = engine.parseFxLines(text);
  assert.equal(engine.fxToLines(parsed), text.replace('LVL', 'lvl'));
});

test('изменения скорости пересчитываются между футами и метрами', () => {
  const character = {
    speed: '9 м', abilities: [], inventory: [], equipment: {}, cond: [], fxOff: [],
    activeFx: [{
      k: 'spell', id: 'ray', uid: 'fx-ray', label: 'Ледяной луч',
      fx: [{ stat: 'speed', mode: 'add', value: -10, unit: 'фут' }]
    }]
  };
  assert.equal(engine.effectiveSpeed(character), '6 м');
});

test('авторазбор кэшируется, но обновляет результат после изменения описания', () => {
  const rec = { x: 'Цель получает +1 к КД.' };
  const first = engine.recFx(rec, 'spell');
  assert.strictEqual(engine.recFx(rec, 'spell'), first);
  rec.x = 'Цель получает +2 к КД.';
  const second = engine.recFx(rec, 'spell');
  assert.notStrictEqual(second, first);
  assert.equal(second[0].value, 2);
});

test('активная способность без зарядов не считается постоянным эффектом', () => {
  assert.equal(engine.isPassiveAbility({
    uses: null, rest: '', tags: ['control'],
    x: 'Перед боем вы можете расставить ловушки.'
  }), false);
  assert.equal(engine.isPassiveAbility({
    uses: null, rest: '', tags: ['passive'],
    x: 'Пока вы в доспехах, вы получаете +1 к КД.'
  }), true);
  assert.equal(engine.isPassiveAbility({
    uses: null, rest: '', tags: [],
    x: 'Расовая особенность, пассивная. Вы получаете сопротивление урону ядом.'
  }), true);
});

test('лечение извлекается с модификатором, усилением и фиксированным значением', () => {
  const caster = {
    level: 5, spellAb: 'wis',
    ab: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 },
    abilities: []
  };
  const cure = {
    l: 1,
    x: 'Касание восстанавливает 1к8 + модификатор базовой характеристики хитов.',
    hi: 'Лечение увеличивается на 1к8 за каждый круг ячейки выше первого.'
  };
  assert.deepEqual(plain(engine.deriveInstantHeal(cure, 'spell', caster, 3)), { cnt: 3, sides: 8, plus: 3 });
  assert.deepEqual(
    plain(engine.deriveInstantHeal({ l: 6, x: 'Цель восстанавливает 70 хитов.' }, 'spell', caster, 6)),
    { cnt: 0, sides: 0, plus: 70 }
  );
  assert.equal(engine.deriveInstantHeal({
    desc: 'Посох восстанавливает 1к6 + 4 потраченных заряда на рассвете.'
  }, 'item', null, null), null);
});

test('Ученик Жизни добавляет 2 + круг заклинания и не удваивает уже вписанный бонус', () => {
  const life = {
    id: 'life', n: 'Ученик Жизни', uses: null, rest: '', tags: ['passive'],
    x: 'Заклинание восстанавливает дополнительные хиты: 2 + круг заклинания.'
  };
  const caster = {
    level: 5, spellAb: 'wis',
    ab: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 },
    abilities: [{ abilityId: 'life' }]
  };
  engine.setState({ abilities: [life] });
  const cure = {
    l: 1,
    x: 'Цель восстанавливает 1к8 + модификатор Мудрости хитов.',
    hi: 'Лечение увеличивается на 1к8 за каждый круг ячейки выше первого.'
  };
  assert.deepEqual(plain(engine.deriveInstantHeal(cure, 'spell', caster, 2)), { cnt: 2, sides: 8, plus: 7 });
  const alreadyIncluded = {
    l: 2,
    x: 'Цель восстанавливает 2к8 + модификатор Мудрости + 4 хитов.'
  };
  assert.deepEqual(plain(engine.deriveInstantHeal(alreadyIncluded, 'spell', caster, 2)), { cnt: 2, sides: 8, plus: 7 });
});

test('отрицание расходования материала имеет приоритет', () => {
  assert.equal(engine.matConsumeFor({ id: 'custom', cm: 'М (жемчужина, не расходуется)', x: '' }), 0);
  assert.equal(engine.matConsumeFor({ id: 'custom', cm: 'М (алмаз, расходуется)', x: '' }), 1);
});

test('мгновенное лечение меняет хиты, но не остается вечным активным эффектом', () => {
  const caster = {
    id: 'caster', name: 'Жрец', cls: 'Жрец', level: 5, spellAb: 'wis',
    ab: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 },
    abilities: [], activeFx: [], inventory: [], equipment: {}, cond: [], fxOff: [],
    slots: {1: {max: 1, cur: 1}}, spellbook: [{spellId:'heal',prep:true,access:'classList'}]
  };
  const target = {
    id: 'target', name: 'Союзник', level: 5, hp: 5, hpMax: 40,
    ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilities: [], activeFx: [], inventory: [], equipment: {}, cond: [], fxOff: []
  };
  const spell = {
    id: 'heal', n: 'Лечение ран', l: 1, c:'Жрц', cm: '—', d: 'Мгновенная',
    x: 'Цель восстанавливает 1к8 + модификатор Мудрости хитов.'
  };
  engine.setState({ chars: [caster, target], spells: [spell], abilities: [] });
  engine.setAutoRolls([5]);   /* игрок выбросил 5 на d8 */
  assert.equal(engine.castSpellApply('heal', 'caster', 'ally:target', '', null, '1'), true);
  assert.ok(target.hp >= 9 && target.hp <= 16);
  assert.equal(target.activeFx.length, 0);
});

test('извлеченное состояние участвует в проверках движка и снимается вместе с эффектом', () => {
  const caster = {
    id: 'caster', name: 'Маг', cls: 'Волшебник', level: 5,
    ab: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
    abilities: [], activeFx: [], inventory: [], equipment: {}, cond: [], fxOff: [],
    slots: {2: {max: 1, cur: 1}}, spellbook: [{spellId:'hold',prep:true,access:'spellbook'}]
  };
  const target = {
    id: 'target', name: 'Союзник', level: 5, hp: 20, hpMax: 20,
    ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilities: [], activeFx: [], inventory: [], equipment: {}, cond: [], fxOff: []
  };
  const spell = {
    id: 'hold', n: 'Удержание личности', l: 2, c:'Влш', cm: '—', d: 'Концентрация, 1 мин.',
    x: 'Гуманоид парализован до окончания заклинания.'
  };
  engine.setState({ chars: [caster, target], spells: [spell], abilities: [] });
  assert.equal(engine.castSpellApply('hold', 'caster', 'ally:target', '', null, '2'), true);
  assert.equal(target.activeFx.length, 1);
  assert.equal(engine.effectiveConditions(target).includes('Парализованный'), true);
  engine.removeActiveFx('target', target.activeFx[0].uid);
  assert.equal(engine.effectiveConditions(target).includes('Парализованный'), false);
});

test('охват реальной базы эффектов не откатывается', () => {
  const spells = engine.seedSpellsDB();
  const abilities = engine.seedAbilitiesDB();
  const items = engine.seedItemsDB();
  assert.ok(spells.filter(x => engine.deriveFx(x, 'spell').length).length >= 20);
  assert.ok(abilities.filter(x => engine.deriveFx(x, 'ability').length).length >= 7);
  assert.ok(items.filter(x => engine.deriveFx(x, 'item').length).length >= 8);
});

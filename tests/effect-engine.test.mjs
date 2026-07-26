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
        rulesDB=[]; activeCharId=s.activeCharId||null; fxRound=s.fxRound||1;
      },
      state() { return {chars,itemsDB,spellsDB,activeCharId,fxRound,lastCastEvent}; },
      applyFxTo, removeActiveFx, advanceFxRound, attachDuration, spellFxForCast,
      castSpellApply, canCastCheck, parseComponents, materialPlanFor,
      charFxAll, fxSum, eHpMax, acTotal, speedTotal, concEntriesOf,
      breakConcentration, longRest, activeStackWinners, durationSpecOf, spellNeedsConcentration,
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
    confirm: () => true,
    prompt: () => '1',
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadWorkspaceAudit() {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const scriptStart = html.indexOf('<script>') + 8;
  let source = html.slice(scriptStart, html.indexOf('</script>', scriptStart));
  source = source.replace(/\(async function init\(\)[\s\S]*$/, '');
  source += `
    globalThis.__itemWorkspaceTaxonomyAudit = {
      campaignRow(item) { return itemWorkspaceRowFromLocal(JSON.parse(JSON.stringify(item))); },
      bg3Row(row) { return itemWorkspaceRowFromBg3(JSON.parse(JSON.stringify(row))); },
      categoryLabel(value) { return itemWorkspaceCategoryLabel(value); },
      tagKey(value) { return itemWorkspaceTagKey(value); },
      tagOptions(values) { return itemWorkspaceTagOptions(JSON.parse(JSON.stringify(values || []))); },
      tagMatches(values, key) { return itemWorkspaceTagMatches(JSON.parse(JSON.stringify(values || [])), key); },
      portable(row) { return itemWorkspacePortable(row); },
      setWorld(campaignItems, bg3Rows) {
        itemsDB = JSON.parse(JSON.stringify(campaignItems || []));
        bg3Catalog.epoch++;
        bg3Catalog.preferredProfile = 'standard';
        bg3Catalog.index = {items: JSON.parse(JSON.stringify(bg3Rows || []))};
        bg3Catalog.items = new Map();
        bg3Catalog.summaries = new Map(bg3Catalog.index.items.map(row => [row.id, row]));
        bg3CatalogSearchCache = {epoch: -1, profile: '', rows: [], docs: new Map(), availableCount: 0, facets: null};
        itemWorkspaceSearchResultCache = {key: '', rows: []};
      },
      facets() { return [...itemWorkspaceFacetValues().categories].sort(); },
      search(filters) {
        dbFlt.it = Object.assign({q:'',source:'all',classification:'all',type:'',kind:'',category:'',rarity:'',tag:'',content:'',sort:'name'}, JSON.parse(JSON.stringify(filters || {})));
        itemWorkspaceSearchResultCache = {key: '', rows: []};
        return itemWorkspaceSearch().map(row => ({id: row.id, source: row.source, sourceCategory: row.sourceCategory, category: row.category}));
      },
      card(item) {
        const copy = JSON.parse(JSON.stringify(item));
        bg3Catalog.summaries.set(copy.id, {id: copy.id, names: {ru: copy.n, en: copy.n}, type: copy.type, kind: copy.mechanics && copy.mechanics.profile && copy.mechanics.profile.kind, category: copy.source && copy.source.category, classification: copy.source && copy.source.classification, rarity: copy.rarity, tags: copy.tags || []});
        return itemCardHTML(copy, '');
      },
    };
  `;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '',
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; },
    });
    return elements.get(id);
  };
  const storage = new Map();
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {
      random() { throw new Error('engine-side dice/random generation is forbidden'); },
    }),
    Date,
    JSON,
    Blob,
    URL,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => false,
    prompt: () => null,
    alert() {},
    fetch: async () => ({ok: false, status: 599, json: async () => ({})}),
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__itemWorkspaceTaxonomyAudit;
}

function campaignItem(id, type, extra = {}) {
  return Object.assign({id, n: id, type, rarity: 'обычный', tags: [], desc: '', props: '', text: ''}, extra);
}

function bg3Summary(id, category, classification, extra = {}) {
  return Object.assign({
    id: `bg3:item:test:${id}`,
    names: {ru: id, en: id},
    type: 'equipment',
    kind: 'misc',
    category,
    classification,
    rarity: 'обычный',
    tags: [],
    source: {profiles: ['standard']},
  }, extra);
}

function bg3MissingDescriptionItem(classification, mode = 'structured') {
  return {
    id: `bg3:item:test:fallback-${classification}-${mode}`,
    n: `Fixture ${classification}`,
    type: 'equipment',
    rarity: 'обычный',
    tags: [],
    slot: null,
    weight: '',
    cost: '',
    dmg: '',
    dmgType: '',
    ac: '',
    desc: '',
    props: '',
    text: '',
    useMode: mode === 'manual' ? 'manual' : 'none',
    manualNote: '',
    schemaVersion: 6,
    source: {
      game: 'bg3',
      classification,
      category: 'unclassified',
      availability: {treasureTables: [], recipeRecords: []},
      placementEvidence: {},
    },
    mechanics: {
      schemaVersion: 1,
      mode,
      origin: 'explicit',
      activation: {cost: 'object'},
      target: {kind: 'self', base: 1},
      duration: {kind: 'manual', label: 'пока предмет используется'},
      resolution: {schemaVersion: 2, inputPolicy: 'declared-results-only', attack: null, save: null, contest: null, rolls: [], threshold: '', thresholdCondition: '', needsRoll: false},
      effects: [],
      actions: [],
      interactions: [],
      lifecyclePrograms: [],
      resource: null,
      profile: {
        kind: 'misc',
        flags: {portable: false, magical: false, consumable: false},
        mass: {kg: 12, display: '12 кг', unit: 'kg'},
        value: {gp: 5, cp: 500, display: '5 зм'},
      },
      campaignRules: null,
      equipment: {slot: null, armorKind: null, metal: false, proficiencyExempt: false},
      itemSpec: {attune: false, charges: null},
      provenance: {},
      rulePrograms: null,
      rootTemplatePrograms: null,
    },
  };
}

test('workspace uses one canonical category vocabulary across campaign and BG3 items', () => {
  const api = loadWorkspaceAudit();
  const expected = new Map([
    ['potion', 'consumable.potion'],
    ['scroll', 'consumable.scroll'],
    ['weapon', 'weapon'],
    ['armor', 'equipment.armor-accessory'],
    ['ring', 'equipment.armor-accessory'],
    ['equipment', 'miscellaneous'],
    ['wondrous', 'miscellaneous'],
  ]);
  for (const [type, category] of expected) {
    const row = plain(api.campaignRow(campaignItem(`campaign-${type}`, type)));
    assert.equal(row.sourceCategory, type);
    assert.equal(row.category, category);
  }
  const shield = plain(api.campaignRow(campaignItem('campaign-shield', 'armor', {n: 'Щит', mechanics: {schemaVersion: 1, mode: 'structured', profile: {kind: 'shield'}}})));
  assert.equal(shield.category, 'equipment.shield');
  assert.equal(api.categoryLabel('consumable.potion'), 'Зелья');
});

test('raw BG3 unclassified category is preserved and split into honest workspace groups', () => {
  const api = loadWorkspaceAudit();
  const technical = plain(api.bg3Row(bg3Summary('Technical fixture', 'unclassified', 'technical')));
  const review = plain(api.bg3Row(bg3Summary('Review fixture', 'unclassified', 'needs-review')));
  const classified = plain(api.bg3Row(bg3Summary('Potion fixture', 'consumable.potion', 'playable', {type: 'potion', kind: 'potion'})));
  assert.deepEqual([technical.sourceCategory, technical.category], ['unclassified', 'technical-object']);
  assert.deepEqual([review.sourceCategory, review.category], ['unclassified', 'world-object.needs-review']);
  assert.deepEqual([classified.sourceCategory, classified.category], ['consumable.potion', 'consumable.potion']);
  assert.equal(api.categoryLabel(technical.category), 'Служебные записи');
  assert.equal(api.categoryLabel(review.category), 'Объекты мира и окружения');
  assert.equal(api.portable(review), false, 'unclassified needs-review is not inventory evidence');
  const reviewedInventory = Object.assign({}, review, {
    sourceCategory: 'equipment.armor-accessory',
    category: 'equipment.armor-accessory',
    item: {mechanics: {schemaVersion: 1, mode: 'structured', profile: {kind: 'armor', flags: {portable: true}}}},
  });
  assert.equal(api.portable(reviewedInventory), true, 'a classified review row still needs an exact portable profile');
});

test('facets and workspace filtering do not duplicate potion or scroll categories', () => {
  const api = loadWorkspaceAudit();
  const campaign = [campaignItem('campaign-potion', 'potion'), campaignItem('campaign-scroll', 'scroll')];
  const bg3 = [
    bg3Summary('BG3 potion', 'consumable.potion', 'playable', {type: 'potion', kind: 'potion'}),
    bg3Summary('BG3 scroll', 'consumable.scroll', 'playable', {type: 'scroll', kind: 'scroll'}),
    bg3Summary('BG3 technical', 'unclassified', 'technical'),
    bg3Summary('BG3 review', 'unclassified', 'needs-review'),
  ];
  api.setWorld(campaign, bg3);
  const facets = plain(api.facets());
  assert.ok(facets.includes('consumable.potion'));
  assert.ok(facets.includes('consumable.scroll'));
  assert.ok(facets.includes('technical-object'));
  assert.ok(facets.includes('world-object.needs-review'));
  assert.equal(facets.includes('potion'), false);
  assert.equal(facets.includes('scroll'), false);
  assert.equal(facets.includes('unclassified'), false);

  const potions = plain(api.search({category: 'consumable.potion'}));
  assert.deepEqual(potions.map(row => row.source).sort(), ['bg3', 'campaign']);
  assert.ok(potions.every(row => row.category === 'consumable.potion'));
  assert.equal(plain(api.search({category: 'potion'})).length, 0);
});

test('semantic property filters collapse duplicate campaign and BG3 tag labels', () => {
  const api = loadWorkspaceAudit();
  const potionKey = api.tagKey('potion');
  const scrollKey = api.tagKey('scroll');
  const options = plain(api.tagOptions([
    'potion', 'bg3-consumable-potion',
    'scroll', 'bg3-consumable-scroll',
    'shield', 'bg3-equipment-shield',
  ]));
  assert.deepEqual(options.map(option => option.label).sort(), ['Зелье', 'Свиток', 'Щит'].sort());
  assert.equal(options.filter(option => option.label === 'Зелье').length, 1);
  assert.equal(api.tagMatches(['potion'], potionKey), true);
  assert.equal(api.tagMatches(['bg3-consumable-potion'], potionKey), true);

  api.setWorld(
    [campaignItem('campaign-potion-tag', 'potion', {tags: ['potion']})],
    [bg3Summary('BG3 potion tag', 'consumable.potion', 'playable', {
      type: 'potion', kind: 'potion', tags: ['bg3', 'bg3-consumable-potion'],
    })],
  );
  assert.deepEqual(plain(api.search({tag: potionKey})).map(row => row.source).sort(), ['bg3', 'campaign']);
  assert.equal(plain(api.search({tag: scrollKey})).length, 0);
});

test('missing BG3 descriptions render source-backed status and structured facts', () => {
  const api = loadWorkspaceAudit();
  const technical = api.card(bg3MissingDescriptionItem('technical', 'manual'));
  assert.match(technical, /Описание не указано\./);
  assert.match(technical, /служебная запись каталога/);
  assert.match(technical, /Подтверждённые характеристики/);
  assert.match(technical, /назначение — Разное/);
  assert.match(technical, /игровая группа — Служебные записи/);
  assert.match(technical, /непереносимый объект/);
  assert.match(technical, /<b>Вес:<\/b> 12 кг/);
  assert.match(technical, /<b>Стоимость:<\/b> 5 зм/);
  assert.match(technical, /неподдержанные операции не исполняются автоматически/);

  const world = api.card(bg3MissingDescriptionItem('world-object'));
  assert.match(world, /объект окружения BG3/);
  assert.doesNotMatch(world, /ручной режим/);
});

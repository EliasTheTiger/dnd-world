import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import starter from '../scripts/party-starter.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const engine = loadRuntimeIntegrationEngine();
const items = plain(engine.catalogs.items).concat(starter.items());
const spellIds = Object.fromEntries(['fireBolt', 'guidance', 'cureWounds', 'faerieFire', 'grease', 'detectMagic', 'healingWord', 'rayOfSickness'].map(key => [key, 'spell_' + key]));
const newHero = () => starter.buildLiora({blank: engine.buildBlank(), items, spellIds});

test('Liora is a legal level-three half-elf with fixed HP, six proficiencies, two cantrips and four preparations plus alchemist grants', () => {
  const c = newHero();
  assert.equal(c.race, 'Полуэльф'); assert.equal(c.gender, 'женский');
  assert.equal(c.align, 'Нейтрально-добрый', 'use the canonical alignment stored by the editor');
  assert.equal(c.cls, 'Изобретатель'); assert.equal(c.subcls, 'Алхимик');
  assert.equal(c.level, 3); assert.equal(c.xp, 900);
  assert.deepEqual(c.ab, {str: 8, dex: 14, con: 14, int: 16, wis: 13, cha: 10});
  const costs = [0, 1, 2, 3, 4, 5, 7, 9];
  assert.equal([8, 14, 14, 15, 12, 8].reduce((sum, value) => sum + costs[value - 8], 0), 27);
  assert.equal(c.hp, 24); assert.equal(c.hpMax, 24); assert.equal(c.hitDice, '3d8');
  assert.deepEqual(c.slots, {1: {max: 3, cur: 3}});
  assert.deepEqual(Object.entries(c.saves).filter(([, value]) => value).map(([key]) => key), ['con', 'int']);
  assert.equal(Object.values(c.skills).filter(skill => skill.p === 1).length, 6);
  assert.equal(c.spellbook.filter(row => row.access === 'known').length, 2);
  assert.equal(c.spellbook.filter(row => row.prep && !row.alwaysPrepared).length, 4);
  assert.deepEqual(c.spellbook.filter(row => row.alwaysPrepared).map(row => [row.spellId, row.countsAgainstPreparation]), [[spellIds.healingWord, false], [spellIds.rayOfSickness, false]]);
  assert.equal(c.toolProficiencies.length, 5);
  assert.deepEqual(c.buildChoices.tools, ['Инструменты стеклодува', 'Инструменты алхимика', 'Инструменты каллиграфа']);
  assert.deepEqual(c.abilities.find(e => e.abilityId === 'ab_полуэльф_владение_двумя_навыками_на_выбор').choices, {skill: 'Медицина', skill2: 'Внимательность'});
  assert.deepEqual(c.abilities.find(e => e.abilityId === 'ab_полуэльф_дополнительный_язык').choices, {language: 'Гномий'});
});

test('real synchronized racial abilities preserve the chosen language and exactly six effective proficiencies', () => {
  const e = loadRuntimeIntegrationEngine(); e.setState({...e.catalogs, chars: []}); e.partyStarterApi.ensureCatalogs();
  const c = e.partyStarterApi.prepare().character;
  e.setState({...e.catalogs, chars: [c]});
  const entries = e.abilitiesApi.abilityGameplayEntries(c), language = entries.find(row => row.profile.key === 'id:ab_полуэльф_дополнительный_язык');
  assert.equal(e.abilitiesApi.gameplay.selections(language.ab, language.entry, c).language, 'Гномий');
  const effectSkills = e.abilitiesApi.charFxAll(c).filter(f => f.stat === 'proficiency.skill').map(f => f.value.name);
  assert.deepEqual([...new Set(Object.keys(c.skills).filter(name => c.skills[name].p === 1).concat(effectSkills))].sort(), ['Магия','Расследование','Медицина','Внимательность','Проницательность','Убеждение'].sort());
  assert.equal(effectSkills.includes('Акробатика'), false, 'unselected fallback options never grant another skill');
  assert.equal(e.abilitiesApi.charFxAll(c).filter(f => f.stat === 'proficiency.language').map(f => f.value).includes('Гномий'), true);
});

test('new alchemist receives legal class/background gear and pays exact ordinary flask prices without free shields or loot', () => {
  const c = newHero(), byKey = key => c.inventory.find(row => row.starterGrant?.key === key);
  for (const key of ['dagger', 'lightCrossbow', 'bolts', 'studded', 'thievesTools', 'backpack', 'crowbar', 'hammer', 'piton', 'torch', 'tinderbox', 'rations', 'waterskin', 'rope', 'alchemistTools', 'guildLetter', 'travelerClothes', 'pouch']) assert.ok(byKey(key), key);
  assert.equal(byKey('dagger').qty, 2); assert.equal(byKey('piton').qty, 10);
  assert.equal(byKey('rations').qty, 10); assert.equal(byKey('torch').qty, 10);
  assert.equal(byKey('bolts').ammoCur, 20); assert.equal(byKey('bolts').qty, 1);
  assert.equal(c.equipment.CHEST, byKey('studded').id);
  assert.equal(c.equipment.MAIN_HAND, byKey('dagger').id);
  assert.equal(c.equipment.OFF_HAND, byKey('alchemistTools').id, 'prepared tools make the new caster immediately ready');
  assert.equal(c.inventory.some(row => starter.matches(items.find(item => item.id === row.itemId), row, 'shield')), false);
  assert.equal(c.inventory.some(row => items.find(item => item.id === row.itemId)?.tags.includes('magical')), false);
  assert.equal(c.inventory.filter(row => row.itemId === 'it_starter_empty_flask')[0].qty, 2);
  assert.equal(c.inventory.filter(row => row.itemId === 'it_starter_empty_flask')[0].full, false);
  assert.equal(c.coins.zm * 100 + c.coins.sm * 10 + c.coins.mm + 4, 1500);
  assert.equal(c.inventory.some(row => /tinker|жестян/.test(row.itemId)), false, 'tool proficiency does not grant a free physical toolkit');
  const pearl = starter.items().find(row => row.id === 'it_starter_identify_pearl');
  assert.equal(pearl.material.component.valueGp, 100);
  assert.equal(c.inventory.some(row => row.itemId === pearl.id), false, 'priced Identify pearl must be acquired separately');
  assert.equal(c.artificer.infusions.known.length, 4);
  assert.deepEqual(c.artificer.infusions.active, [{infusionId: 'enhanced-defense', itemId: byKey('studded').id}, {infusionId: 'repeating-shot', itemId: byKey('lightCrossbow').id}]);
  assert.equal(byKey('lightCrossbow').att, true);
});

for (const build of ['buildRoku', 'buildTorgar', 'buildSeptih', 'buildLegerem']) test(build + ': grant missing basics once without altering a current encounter or better equipment', () => {
  const c = plain(engine[build]());
  c.hp = 3; c.hpTemp = 7; c.hdUsed = 2; c.notes = 'Игровая запись';
  c.coins = {mm: 2, sm: 4, em: 1, zm: 237, pm: 8};
  c.activeFx = [{uid: 'saved-effect', k: 'buff', remaining: 3}];
  c.inventory[0].notes = 'Персональная пометка'; c.inventory[0].inside = 'saved-container';
  const before = plain(c), result = starter.plan(c, {items});
  assert.equal(result.ok, true); assert.equal(result.changed, true); assert.ok(result.grants.length);
  assert.deepEqual(c, before, 'planning is pure');
  for (const key of Object.keys(before).filter(key => key !== 'inventory')) assert.deepEqual(result.character[key], before[key], key);
  assert.deepEqual(result.character.inventory.slice(0, c.inventory.length), c.inventory);
  for (const grant of result.grants) {
    const item = items.find(item => item.id === grant.itemId);
    assert.ok(item); assert.equal(item.tags.includes('magical'), false, grant.key);
  }
  const saved = plain(result.character);
  saved.inventory = saved.inventory.filter(row => !row.starterGrant); // sold and used the entire new kit
  saved.name = 'Имя после игры';
  const later = starter.plan(saved, {items});
  assert.equal(later.changed, false); assert.deepEqual(later.character, saved);
});

test('semantic dedup recognises personalized gear, packed items and BG3 equivalents without replenishing ammunition', () => {
  const c = plain(engine.buildLegerem());
  c.inventory.push({id: 'bg3-bag-entry', itemId: 'bg3:backpack', qty: 1, inside: 'container'});
  c.inventory.push({id: 'bow-entry', itemId: 'bg3:crossbow', qty: 1});
  c.inventory.push({id: 'ammo-entry', itemId: 'bg3:bolts', qty: 1, ammoCur: 0});
  c.inventory.push({id: 'old-food', itemId: 'it_рацион_1_день', qty: 0});
  const extended = items.concat(
    {id: 'bg3:backpack', name: 'Походный рюкзак', tags: ['container']},
    {id: 'bg3:crossbow', name: 'Crossbow of the Watch', type: 'weapon', tags: ['ranged'], mechanics: {profile: {kind: 'weapon', weapon: {ranged: true}}}},
    {id: 'bg3:bolts', name: 'Crossbow Bolts', tags: ['ammunition']}
  );
  const result = starter.plan(c, {items: extended});
  assert.equal(result.ok, true);
  for (const key of ['backpack', 'lightCrossbow', 'bolts', 'rations', 'tinderbox', 'waterskin', 'signetRing', 'pedigree']) assert.equal(result.grants.some(row => row.key === key), false, key);
  assert.equal(result.character.inventory.find(row => row.id === 'ammo-entry').ammoCur, 0);
  assert.deepEqual(result.character.equipment, c.equipment, 'named armor and weapon are never replaced');
});

test('unresolved catalog references defer the entire migration and do not stamp a receipt', () => {
  const c = plain(engine.buildRoku());
  c.inventory.push({id: 'pending-catalog-entry', itemId: 'bg3:unhydrated', qty: 1});
  const before = plain(c), result = starter.plan(c, {items});
  assert.equal(result.ok, false); assert.equal(result.reason, 'unresolved-inventory');
  assert.deepEqual(result.missingIds, ['bg3:unhydrated']); assert.deepEqual(c, before);
  assert.equal(c.starterEquipment, undefined);
});

test('missing required starter catalog record aborts instead of partially awarding gear', () => {
  const c = plain(engine.buildRoku()), before = plain(c);
  const result = starter.plan(c, {items: items.filter(row => row.id !== 'it_starter_sand_pouch')});
  assert.equal(result.ok, false); assert.equal(result.reason, 'missing-starter-item');
  assert.deepEqual(c, before);
});

test('migration does not add items to unrelated saved characters and does not depend on their names', () => {
  const custom = plain(engine.buildRoku()); custom.id = 'player-custom-character';
  assert.equal(starter.plan(custom, {items}).changed, false);
  let c = plain(engine.buildSeptih());
  const first = starter.plan(c, {items}); c = first.character;
  for (let change = 0; change < 100; change++) {
    c.name = 'Новое имя ' + change;
    const result = starter.plan(plain(c), {items});
    assert.equal(result.changed, false); assert.equal(result.character.name, c.name);
    assert.deepEqual(result.character.inventory, c.inventory);
  }
});

function runtimeHarness({failSave = false, characters, updates = {}, seedPending = false, readOnly = false, recovery = false} = {}) {
  let saves = 0, durable = null;
  const context = vm.createContext({
    DndWorldPartyStarter: starter, chars: plain(characters || [engine.buildRoku(), engine.buildTorgar(), engine.buildSeptih(), engine.buildLegerem()]),
    itemsDB: plain(items), classesDB: [starter.classDefinition()], spellsDB: plain(engine.catalogs.spells), partyUpdates: plain(updates),
    campaignSeedPending: seedPending, saveTimer: null, clearTimeout() {},
    campaignEnvelopeReadOnlyFallback: readOnly, bg3CatalogNeedsProductionRecovery: () => recovery,
    upgradeItem: value => value, buildBlank: () => engine.buildBlank(), artificerElixirTemplates: () => [], artificerElixirRestReady: () => {},
    characterEnsureBackground() {}, characterSnapshot: c => ({level: c.level}), characterSyncFeatures() {}, applyClassSlots() {}, syncClassSpellAccess() {}, upgradeSpellcastingState() {},
    bg3GithbornMindcrusherTrustCharacters() {}, fxInvalidate() {}, scheduleSave() {},
    runScheduledSave: async () => { saves++; if (failSave) return false; durable = plain({chars: context.chars, partyUpdates: context.partyUpdates}); return true; },
    itemOf: id => context.itemsDB.find(row => row.id === id)
  });
  vm.runInContext(fs.readFileSync(new URL('../scripts/party-starter-runtime.js', import.meta.url), 'utf8'), context);
  return {context, apply: () => context.applyPartyStarterUpdate(), durable: () => durable, saves: () => saves};
}

test('party migration saves the new hero, all four equipment receipts and world receipt together', async () => {
  const h = runtimeHarness({seedPending: true}), before = plain(h.context.chars);
  const result = await h.apply();
  assert.equal(result.ok, true); assert.equal(result.changed, true); assert.equal(result.pending, false);
  assert.equal(h.saves(), 1); assert.equal(h.durable().chars.length, 5);
  assert.equal(h.context.campaignSeedPending, false);
  assert.deepEqual(h.durable().partyUpdates.alchemist20261023.equipment, starter.EXISTING_IDS);
  for (const original of before) {
    const saved = h.durable().chars.find(c => c.id === original.id);
    for (const key of ['hp', 'hpMax', 'coins', 'slots', 'spellbook', 'equipment']) assert.deepEqual(saved[key], original[key]);
    assert.deepEqual(saved.inventory.slice(0, original.inventory.length), original.inventory);
  }
  const second = await h.apply(); assert.equal(second.changed, false); assert.equal(h.saves(), 1);
});

test('read-only and catalog recovery gates defer party updates without awards, receipts or save attempts', async () => {
  for (const [options, reason] of [[{readOnly: true}, 'storage-read-only'], [{recovery: true}, 'catalog-recovery']]) {
    const h = runtimeHarness(options), before = plain({chars: h.context.chars, items: h.context.itemsDB, updates: h.context.partyUpdates});
    const result = await h.apply();
    assert.equal(result.ok, true, 'do not replace the existing recovery status with a second error');
    assert.equal(result.pending, true); assert.equal(result.changed, false); assert.equal(result.deferredReason, reason);
    assert.equal(h.saves(), 0);
    assert.deepEqual(plain({chars: h.context.chars, items: h.context.itemsDB, updates: h.context.partyUpdates}), before);
  }
});

test('failed durable party save rolls back both heroes and receipts, allowing exactly one successful retry', async () => {
  const h = runtimeHarness({failSave: true, seedPending: true}), before = plain(h.context.chars);
  const result = await h.apply();
  assert.equal(result.ok, false); assert.equal(result.changed, false);
  assert.deepEqual(plain(h.context.chars), before); assert.deepEqual(plain(h.context.partyUpdates), {});
  assert.equal(h.context.campaignSeedPending, true); assert.equal(h.durable(), null);
  const retry = runtimeHarness({characters: h.context.chars, updates: h.context.partyUpdates});
  assert.equal((await retry.apply()).ok, true);
  assert.equal(retry.durable().chars.filter(c => c.id === starter.HERO_ID).length, 1);
});

test('deleted alchemist never returns and sold starter gear never refills after saved campaign reload', async () => {
  const h = runtimeHarness(); await h.apply();
  const saved = h.durable(); saved.chars = saved.chars.filter(c => c.id !== starter.HERO_ID);
  for (const c of saved.chars) c.inventory = c.inventory.filter(row => !row.starterGrant);
  const reload = runtimeHarness({characters: saved.chars, updates: saved.partyUpdates});
  assert.equal((await reload.apply()).changed, false);
  assert.deepEqual(plain(reload.context.chars), saved.chars); assert.equal(reload.saves(), 0);
});

test('offline BG3 inventory defers only its equipment repair; the new hero is added once and later retry remains safe', async () => {
  const original = [plain(engine.buildRoku())];
  original[0].inventory.push({id: 'offline-gear', itemId: 'bg3:offline-backpack', qty: 1});
  const h = runtimeHarness({characters: original});
  const result = await h.apply();
  assert.equal(result.ok, true); assert.equal(result.pending, true);
  assert.equal(h.durable().chars.length, 2); assert.deepEqual(h.durable().chars[0], original[0]);
  h.context.itemsDB.push({id: 'bg3:offline-backpack', n: 'Старинный рюкзак', tags: ['container']});
  const retry = await h.apply();
  assert.equal(retry.ok, true); assert.equal(retry.pending, false);
  assert.equal(h.durable().chars.filter(c => c.id === starter.HERO_ID).length, 1);
  assert.equal(h.durable().chars[0].inventory.some(row => row.starterGrant?.key === 'backpack'), false);
});

test('malformed migration receipt cannot silently resurrect or award a saved party', async () => {
  const h = runtimeHarness({updates: {alchemist20261023: {version: 1, heroAdded: 'yes'}}});
  const before = plain(h.context.chars), result = await h.apply();
  assert.equal(result.ok, false); assert.equal(result.reason, 'invalid-starter-receipt');
  assert.deepEqual(plain(h.context.chars), before); assert.equal(h.saves(), 0);
});

test('real sheet rename handler allows unlimited changes and leaves game resources untouched', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const handler = html.match(/function updC\(key,val\)\{[^\n]+\}/)?.[0];
  assert.ok(handler); assert.match(html, /id="sheet-name"[^\n]+oninput="updC/);
  const c = newHero(), original = plain(c); let saves = 0;
  const ctx = vm.createContext({cc: () => c, scheduleSave: () => saves++}); vm.runInContext(handler, ctx);
  for (let rename = 0; rename < 100; rename++) ctx.updC('name', 'Лиора «Имя ' + rename + '»');
  assert.equal(saves, 100); assert.equal(c.name, 'Лиора «Имя 99»');
  for (const key of Object.keys(original).filter(key => key !== 'name')) assert.deepEqual(c[key], original[key], key);
  assert.equal(plain(c).name, c.name);
});

test('real engine migrates an active saved encounter and preserves five heroes, preparation and unlimited renames through reload', async () => {
  const e = loadRuntimeIntegrationEngine(), originals = [e.buildRoku(), e.buildTorgar(), e.buildSeptih(), e.buildLegerem()];
  originals[0].name = 'Року: имя игрока'; originals[0].hp = 7; originals[0].slots[1].cur = 1;
  originals[1].coins.zm = 271; originals[2].inventory[0].notes = 'Сохранённая пометка';
  e.setState({...e.catalogs, chars: originals, activeCharId: originals[0].id, journal: [{id: 'kept-note', title: 'Сессия', text: 'Сохраняется'}]});
  e.charactersApi.withoutPresentation(); e.combatLifecycleApi.quiet(); e.guardRandom();
  assert.equal(e.combatStart([{kind: 'ally', id: originals[0].id, nat: 17}, {kind: 'foe', id: 'foe_goblin_scout', nat: 6}], 'Незавершённый бой'), true);
  const before = plain(e.state());
  const update = await e.partyStarterApi.update();
  assert.equal(update.ok, true); assert.equal(update.heroAdded, true);
  const state = e.state(), c = state.chars.find(row => row.id === starter.HERO_ID);
  assert.ok(c); assert.equal(state.chars.length, 5); assert.equal(e.acTotal(c), 15);
  assert.equal(e.charactersApi.prepCount(c), 4); assert.equal(e.charactersApi.prepMax(c), 4);
  assert.equal(e.charactersApi.cantripKnownCount(c), 2);
  assert.deepEqual(plain(e.charactersApi.characterTraining(c).tools).sort(), c.toolProficiencies.slice().sort());
  for (const original of before.chars) {
    const next = state.chars.find(row => row.id === original.id);
    for (const key of ['name', 'hp', 'hpMax', 'coins', 'spellbook', 'slots', 'equipment', 'activeFx']) assert.deepEqual(plain(next[key] ?? null), original[key] ?? null, original.id + '.' + key);
  }
  for (const key of ['active', 'round', 'order', 'turnIndex', 'turn', 'history']) assert.deepEqual(plain(state.combat[key]), before.combat[key], 'combat.' + key);
  assert.deepEqual(plain(state.combat.log.slice(0, before.combat.log.length)), before.combat.log);
  assert.ok(state.combat.log.slice(before.combat.log.length).every(row => row.kind === 'change' && row.text.includes('запас')), 'only the recorded equipment grant may join the combat log');
  assert.deepEqual(plain(state.journal), before.journal);
  // The public sheet handler writes the selected hero without a rename counter.
  e.setState({...state, activeCharId: c.id});
  for (let i = 0; i < 50; i++) e.partyStarterApi.rename('name', 'Алхимик — имя ' + i);
  assert.equal(await e.saveWorldNow(), true);
  const raw = await e.storeGet('dndworld2:campaign-envelope');
  assert.equal(JSON.parse(raw).state.chars.find(row => row.id === c.id).name, 'Алхимик — имя 49');
  const reload = loadRuntimeIntegrationEngine();
  await reload.storeSet('dndworld2:campaign-envelope', raw); await reload.loadAll();
  const reloaded = reload.state().chars.find(row => row.id === c.id);
  assert.equal(reloaded.name, 'Алхимик — имя 49');
  assert.deepEqual(plain(reloaded.inventory), plain(c.inventory));
  assert.deepEqual(plain(reloaded.coins), plain(c.coins));
  assert.equal(reload.charactersApi.prepCount(reloaded), 4);
  assert.equal(reload.state().chars.length, 5);
});

test('real failed-save rollback also removes the staged inventory changes from the combat log', async () => {
  const e = loadRuntimeIntegrationEngine(), c = e.buildRoku();
  e.setState({...e.catalogs, chars: [c], activeCharId: c.id});
  e.charactersApi.withoutPresentation(); e.combatLifecycleApi.quiet();
  assert.equal(e.combatStart([{kind: 'ally', id: c.id, nat: 17}, {kind: 'foe', id: 'foe_goblin_scout', nat: 6}], 'Бой при ошибке хранения'), true);
  const before = plain(e.state()), restore = e.learningApi.persistence(async () => false);
  const result = await e.partyStarterApi.update(); restore();
  assert.equal(result.ok, false);
  assert.deepEqual(plain(e.state().chars), before.chars);
  assert.deepEqual(plain(e.state().partyUpdates), before.partyUpdates);
  assert.deepEqual(plain(e.state().combat), before.combat);
});

test('a fresh alchemist can create her rest elixir after a normal save and reload', async () => {
  const e = loadRuntimeIntegrationEngine(); e.setState({...e.catalogs, chars: []});
  e.charactersApi.withoutPresentation();
  assert.equal((await e.partyStarterApi.update()).ok, true);
  const raw = await e.storeGet('dndworld2:campaign-envelope'), reload = loadRuntimeIntegrationEngine();
  await reload.storeSet('dndworld2:campaign-envelope', raw); await reload.loadAll();
  const c = reload.state().chars.find(row => row.id === starter.HERO_ID);
  const plan = reload.artificerElixirApi.createPlan(c, {source: 'rest', rolls: [1]});
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(c.slots[1].cur, 3);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {auditItemPlayerCards,technicalItemText,visibleText} from '../scripts/audit-item-player-cards.mjs';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const root=new URL('../',import.meta.url);
let result;
test('every game item has the same complete player rules in the catalog, inventory and equipment without technical copy',async()=>{
 result=await auditItemPlayerCards();assert.equal(result.count,2115);assert.equal(result.visibleCount,2115);assert.deepEqual(result.issues,[]);
 const byName=name=>result.records.find(r=>r.name===name);
 for(const name of ['Иглы для духовой трубки (50)','Зелье высшего лечения']){
  const card=byName(name).player;assert.ok((card.description+card.gameplayDescription).length>60,name+' keeps the actual game rule when an old sentence also contained engineering commentary');
 }
 const text=name=>JSON.stringify(byName(name).player);
 assert.match(text('Зелье лечения'),/2d4 \+ 2/);assert.match(text('Зелье лечения'),/бонусное действие/);
 assert.match(text('Кольцо восстановления'),/1d4/);assert.match(text('Кольцо восстановления'),/начале каждого своего хода/);
 assert.match(text('Амулет арфистов'),/Мудрость|мудрость/);assert.match(text('Амулет арфистов'),/Щит/);
 assert.match(text('Яд дроу'),/СЛ 13/);assert.match(text('Яд дроу'),/Провал на 5/);
 assert.match(text('Амулет недостойных'),/Сопротивление к рубящему урону/);assert.match(text('Амулет недостойных'),/Уязвимость к дробящему урону/);
 assert.match(text('Шлем независимости'),/Владение спасбросками Мудрости/);
 assert.match(text('Башмаки Деннона'),/благословение на 1 раунд/);assert.match(text('Башмаки Деннона'),/порчу/);
 assert.equal(byName('Маркохешкир').player.hero[0].value,'1d6 + 2');
 assert.match(text('Маркохешкир'),/Цепь молний/,'additional tooltip text keeps granted spells and conditional effects');
 assert.equal(byName('Адский самовзводный арбалет').player.hero[0].value,'1d10 + 2');
 assert.doesNotMatch(text('Маркохешкир'),/не может перемещаться, а также предпринимать/,'condition explanations follow the tabletop engine');
 assert.ok(result.records.every(r=>r.checks.readOnly&&r.checks.inventory&&r.checks.equipment));
});

test('saved inventory keeps charges, notes and edited gameplay properties while legacy technical prose stays private',async()=>{
 const e=loadRuntimeIntegrationEngine(root,{fetch:async url=>{const bytes=fs.readFileSync(new URL(String(url).replace(/^\.\//,''),root));return {ok:true,text:async()=>bytes.toString(),json:async()=>JSON.parse(bytes)};}});
 const actor=e.buildBlank();actor.id='saved-item-reader';actor.name='Следопыт';
 e.setState({items:e.catalogs.items,spells:e.catalogs.spells,chars:[actor],activeCharId:actor.id});await e.itemsApi.load();
 const row=e.itemsApi.rows().find(r=>r.name==='Маркохешкир');await e.itemsApi.hydrate([row.id]);
 const staff=e.itemsApi.resolve('it_staff_def'),original=e.itemsApi.resolve(row.id),saved=JSON.parse(JSON.stringify(original));
 // Real older saves can contain the compiled source summary in a custom definition.
 saved.custom=true;e.itemsApi.save(saved);
 const nativeEntry={id:'charged-staff',itemId:staff.id,qty:1,notes:'Дар наставника',ch:{cur:2,max:staff.resource.max},att:true},legacyEntry={id:'legacy-staff',itemId:row.id,qty:1};actor.inventory=[nativeEntry,legacyEntry];
 const before=JSON.stringify(actor);
 for(const entry of actor.inventory){const it=e.itemsApi.resolve(entry.itemId),html=e.itemsApi.tooltip(actor,entry,it,{actions:e.itemsApi.inventoryActions(actor,entry,it)});assert.doesNotMatch(visibleText(html),technicalItemText);}
 assert.equal(JSON.stringify(actor),before);assert.match(visibleText(e.itemsApi.tooltip(actor,nativeEntry,staff)),/Дар наставника/);assert.equal(nativeEntry.ch.cur,2);
 const edited=e.itemsApi.candidate(saved,{props:'На древке вырезана серебряная звезда.'});e.itemsApi.save(edited);
 assert.match(e.itemsApi.playerModel(edited).properties,/серебряная звезда/);
 assert.match(visibleText(e.itemsApi.tooltip(actor,legacyEntry,edited)),/серебряная звезда/);
 assert.match(e.itemsApi.equipmentFacts(edited).join(' · '),/1d6 \+ 2/);
 assert.match(e.itemsApi.equipmentFacts(edited).join(' · '),/1,5 м/);
 assert.deepEqual(JSON.parse(JSON.stringify(edited.mechanics)),JSON.parse(JSON.stringify(original.mechanics)));
 // Merely hovering a newly granted charged item does not initialise its resources.
 delete nativeEntry.ch;const uninitialised=JSON.stringify(nativeEntry);e.itemsApi.tooltip(actor,nativeEntry,staff,{actions:e.itemsApi.inventoryActions(actor,nativeEntry,staff)});assert.equal(JSON.stringify(nativeEntry),uninitialised);
 e.setState({...e.state(),combat:{active:true,order:[{kind:'ally',id:actor.id}],turnIndex:0,focusKey:'ally:'+actor.id}});
 const combatBefore=JSON.stringify(e.state().combat),actorBefore=JSON.stringify(actor);
 assert.equal(await e.itemsApi.combatInspect(legacyEntry.id),true);assert.match(e.elementText('showBody'),/1d6 \+ 2/);assert.match(e.elementText('showBody'),/серебряная звезда/);assert.doesNotMatch(e.elementText('showBody'),technicalItemText);
 assert.equal(JSON.stringify(e.state().combat),combatBefore);assert.equal(JSON.stringify(actor),actorBefore);
 const mentor=e.itemsApi.resolve('it_pauldron_mentor'),mentorEntry={id:'mentor-help',itemId:mentor.id,qty:1};actor.inventory.push(mentorEntry);
 assert.equal(await e.itemsApi.triggerExplain(mentorEntry.id,e.itemUsesOf(mentor)[0].id),true);assert.doesNotMatch(e.elementText('showBody'),technicalItemText);assert.match(e.elementText('showBody'),/спасброс|настройк/i);
 const material=e.state().items.find(it=>it.material?.harvest),materialEntry={id:'material-help',itemId:material.id,qty:1};actor.inventory.push(materialEntry);
 assert.equal(await e.itemsApi.materialInspect(materialEntry.id),true);assert.doesNotMatch(e.elementText('showBody'),technicalItemText);assert.match(e.elementText('showBody'),/Сбор:|СЛ/);
 const weapon=e.state().items.find(it=>e.itemProfile(it).weapon?.ammo),ammo=e.state().items.find(it=>e.itemProfile(it).kind==='ammo'&&e.itemProfile(it).ammo.forWeapon===e.itemProfile(weapon).weapon.ammoType);
 const ammoEntry={id:'remaining-ammo',itemId:ammo.id,qty:2,ammoCur:7},weaponEntry={id:'ranged-weapon',itemId:weapon.id,qty:1};actor.inventory=[weaponEntry,ammoEntry];
 assert.match(visibleText(e.itemsApi.tooltip(actor,weaponEntry,weapon)),/Боеприпасов: 7/,'show remaining projectiles, not the number of bundles');
 delete ammoEntry.ammoCur;assert.match(visibleText(e.itemsApi.tooltip(actor,weaponEntry,weapon)),new RegExp('Боеприпасов: '+2*e.itemProfile(ammo).ammo.pack));
});
test('player copy is deterministic and authoring/audit files are excluded from the published allow-list',()=>{
 execFileSync(process.execPath,['scripts/build-item-player-copy.mjs','--check'],{cwd:root,stdio:'pipe'});
 const build=fs.readFileSync(new URL('scripts/build-pages-site.mjs',root),'utf8');
 assert.ok(build.includes("'item-player-copy.js'"));
 assert.doesNotMatch(build,/cp\([^\n]*docs/);
 const html=fs.readFileSync(new URL('index.html',root),'utf8');const card=html.slice(html.indexOf('function itemCardHTML('),html.indexOf('function spellCardHTML('));
 assert.doesNotMatch(card,/itemArsenalContractHTML|bg3LifecycleItemHTML|bg3InterruptItemHTML|bg3ItemRuleRowsHTML/);
 const tooltip=html.slice(html.indexOf('function bagItemTooltipHTML('),html.indexOf('function bagItemSlotHTML('));
 assert.ok(tooltip.includes('itemPlayerBodyHTML'));
 assert.doesNotMatch(tooltip,/bg3ItemPresentationDetailHTML|bg3ItemPresentationEnsureForCard|itemProfileSummaryHTML|it\.props/);
});

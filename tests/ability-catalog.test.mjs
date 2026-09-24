import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
function world(){const e=loadRuntimeIntegrationEngine(),a=e.abilitiesApi;e.setState({...e.catalogs,chars:[]});return {e,a,r:a.rules,rows:e.catalogs.abilities};}
const source=(rows,name)=>rows.find(ab=>ab.open5e?.originalName===name&&ab.catalogSource?.documentKey==='srd-2014');

test('every catalog profile receives valid game categories without changing rules or saved data',()=>{
 const {r,rows}=world(),before=JSON.stringify(rows);
 for(const ab of rows){const i=r.classify(ab);assert.ok(r.catalogLabels.type[i.type],ab.id);assert.ok(r.catalogLabels.mode[i.application],ab.id);assert.ok(i.topics.length&&i.topics.every(k=>r.catalogLabels.topic[k]),ab.id);assert.ok(i.recoveries.length&&i.recoveries.every(k=>r.catalogLabels.recovery[k]),ab.id);}
 r.catalogView(rows,{owner:'монах',topic:'attack',sort:'mode'});assert.equal(JSON.stringify(rows),before);
});

test('categories distinguish outgoing saves, healing, temporary HP, reactions and shared costs',()=>{
 const {r,rows,a}=world(),info=name=>r.classify(source(rows,name));
 assert.ok(info('Breath Weapon').topics.includes('attack'));assert.ok(!info('Breath Weapon').topics.includes('defense'));
 assert.ok(info('Hellish Resistance').topics.includes('defense'));assert.equal(info('Hellish Resistance').application,'passive');
 assert.equal(info('Second Wind').application,'bonus');assert.ok(info('Second Wind').topics.includes('health'));
 assert.ok(info("Dark One's Blessing").topics.includes('health'));
 const precise=rows.find(ab=>ab.id==='ab_lg_precise'),i=r.classify(precise);
 assert.equal(i.application,'attack');assert.deepEqual([...i.recoveries],['pool']);
 assert.doesNotMatch(a.abilityCardHTML(precise),/Неограниченно/);assert.match(a.abilityCardHTML(precise),/Общий запас/);assert.match(a.abilityCardHTML(precise),/часть атаки/);
 const quake=info('Quivering Palm');assert.ok(quake.recoveries.includes('pool')&&quake.recoveries.includes('long'));
 assert.ok(info('Action Surge').modes.includes('free'));
 assert.equal(r.classify(rows.find(ab=>ab.id==='ab_sx_mastermind')).recovery,'encounter','limited abilities with no rest recover when the fight ends');
});

test('owner filters include subclasses and subraces and combine on the same rule profile',()=>{
 const {r,rows}=world();
 const monk=r.catalogView(rows,{q:'Защита без брони',owner:'монах'}).groups;assert.equal(monk.length,1);assert.ok(monk[0].variants.every(ab=>ab.open5e?.ownerNameRu==='Монах'));
 const cleric=r.catalogView(rows,{owner:'жрец'}).groups;assert.ok(cleric.some(g=>g.key==='en:disciple of life'));
 assert.ok(r.catalogView(rows,{owner:'эльф'}).groups.some(g=>g.key==='en:cantrip'));
 const synthetic=[{id:'a',n:'Защита',type:'class',source:'Воин',open5e:{originalName:'Shared'},mechanics:{role:'active',combat:{cost:'reaction'}}},{id:'b',n:'Защита',type:'class',source:'Монах',open5e:{originalName:'Shared'},mechanics:{role:'passive'}}];
 assert.equal(r.catalogView(synthetic,{owner:'монах',mode:'reaction'}).groups.length,0,'different profiles cannot jointly satisfy one filter combination');
 assert.equal(r.catalogView(synthetic,{owner:'воин',mode:'reaction'}).groups[0].ab.id,'a');
});

test('facet counts count logical cards, stay consistent with results and ignore their own selection',()=>{
 const {r,rows}=world(),filter={type:'class',mode:'active'},v=r.catalogView(rows,filter);
 for(const [key,options] of Object.entries(v.facets))for(const option of options){const result=r.catalogView(rows,{...filter,[key]:option.value});assert.equal(result.groups.length,option.count,key+':'+option.value);assert.equal(new Set(result.groups.map(g=>g.key)).size,result.groups.length);}
 const wind=r.catalogView(rows,{q:'Second Wind'});assert.equal(wind.groups.length,1);assert.equal(wind.facets.type[0].count,1);
});

test('sorting is stable across all logical cards and multiword search accepts owner before name',()=>{
 const {r,rows}=world(),asc=r.catalogView(rows,{sort:'name'}).groups,desc=r.catalogView(rows,{sort:'name-desc'}).groups;
 assert.deepEqual(desc.map(g=>g.key),asc.map(g=>g.key).reverse());
 for(const sort of ['owner','type','mode']){const a=r.catalogView(rows,{sort}).groups;assert.equal(a.length,asc.length);assert.equal(new Set(a.map(g=>g.key)).size,a.length);assert.deepEqual(a.map(g=>g.key),r.catalogView(rows,{sort}).groups.map(g=>g.key));const value=g=>sort==='owner'?(g.info.owners[0]?.label||'Я'):sort==='type'?r.catalogLabels.type[g.info.type]:r.catalogLabels.mode[g.info.application];for(let i=1;i<a.length;i++)assert.ok(value(a[i-1]).localeCompare(value(a[i]),'ru')<=0,sort);}
 assert.ok(r.catalogView(rows,{q:'Тифлинг устойчивость'}).groups.some(g=>g.key==='en:hellish resistance'));
});

test('filter controls preserve selected values, reset pagination and clear hidden legacy filters',()=>{
 const {a}=world();a.filters.page=4;a.abilityCatalogFilter('mode','bonus');assert.equal(a.filters.page,0);assert.match(a.html('tab-abilitiesdb'),/value="bonus" selected/);
 a.abilityCatalogFilter('sort','name-desc');assert.match(a.html('tab-abilitiesdb'),/value="name-desc" selected/);assert.match(a.html('tab-abilitiesdb'),/value="bonus" selected/);
 Object.assign(a.filters,{edition:'2024',q:'не существующее имя',owner:'монах',topic:'attack',recovery:'pool',page:2});a.renderAbilitiesDB();assert.match(a.html('tab-abilitiesdb'),/Способности не найдены/);
 a.abilityCatalogReset();assert.equal(a.filters.edition,undefined);assert.equal(a.filters.sort,'name');assert.equal(a.filters.page,0);assert.equal((a.html('tab-abilitiesdb').match(/class="entry-card"/g)||[]).length,40);
});

test('background features have their own hero category and remain visible',()=>{
 const {e,a,rows}=world(),c=e.buildBlank(),ab=rows.find(ab=>ab.type==='background');e.setState({...e.catalogs,chars:[c],activeCharId:c.id});c.abilities=[{abilityId:ab.id,cur:null,notes:''}];
 a.heroFilters.cat='background';const html=a.stAbilities(c);assert.match(html,/Предыстории/);assert.ok(html.includes(ab.id));assert.match(html,/Особенности предыстории/);
});

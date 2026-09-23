import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const root=new URL('../',import.meta.url);
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const fileFetch=async url=>{
  const relative=String(url).replace(/^\.\//,'');
  const bytes=fs.readFileSync(new URL(relative,root));
  return {ok:true,status:200,text:async()=>bytes.toString('utf8'),json:async()=>JSON.parse(bytes)};
};
async function world(){
  const engine=loadRuntimeIntegrationEngine(root,{fetch:fileFetch});
  engine.setState({items:engine.catalogs.items,chars:[]});
  await engine.itemsApi.load();
  return engine;
}

test('every item belongs to one game collection and the summary has one item total',async()=>{
  const e=await world(),api=e.itemsApi,rows=api.rows();
  assert.equal(rows.length,2001,'unification must not discard or multiply the existing playable items');
  assert.ok(rows.every(row=>row.source==='game'));
  const html=api.summary();
  assert.match(html,/предметов в игре/);
  assert.equal((html.match(/class="bg3-release-metric"/g)||[]).length,1);
  assert.doesNotMatch(html,/предметов каталога|предметов кампании|доступных предметов/);
  const sword=rows.find(row=>row.name==='Длинный меч'),soap=rows.find(row=>row.name==='Мыло');
  assert.ok(sword&&soap);
  await api.hydrate([sword.id]);
  for(const row of [api.row(sword.row),soap]){
    assert.match(api.detail(row),/openItemEd/);
    assert.match(api.controls(row,true),/>\+ выдать<\/button>/);
    assert.doesNotMatch(api.controls(row,true),/вариант|кампани|каталог/);
  }
});

test('saved definitions override every origin by ID and survive a save/reload without losing rules or references',async()=>{
  const e=await world(),api=e.itemsApi;
  const row=api.rows().find(row=>row.name==='Кинжал');await api.hydrate([row.id]);
  const imported=api.resolve(row.id),original=plain(imported),soap=api.resolve('it_мыло');
  const actor={id:'owner',name:'Владелец',inventory:[{id:'dagger',itemId:row.id,qty:2},{id:'soap',itemId:soap.id,qty:1}],equipment:{MAIN_HAND:'dagger'}};
  e.setState({items:e.state().items,chars:[actor]});const inventory=JSON.stringify(actor);
  for(const item of [imported,soap]){
    const candidate=api.candidate(item,{n:item.n,desc:'Уникальная заметка владельца '+item.n});
    api.upgrade(candidate);api.save(candidate);
    assert.equal(api.resolve(item.id).custom,true);
    assert.deepEqual(plain(api.resolve(item.id).mechanics),plain(item.mechanics));
    assert.deepEqual(plain(api.resolve(item.id).icon),plain(item.icon));
    assert.equal(api.repository().get('item',item.id),api.resolve(item.id));
  }
  assert.equal(api.references().ok,true);
  assert.deepEqual(plain(imported),original,'source assets stay intact');
  assert.equal(JSON.stringify(actor),inventory,'no inventory migration or equipment reassignment');
  assert.ok(api.search({q:'Уникальная заметка владельца'}).some(r=>r.id===row.id));
  assert.equal(api.rows().filter(r=>r.id===row.id).length,1);
  const saved=plain(api.export());
  const beforeMigration=plain(saved);
  api.canonicalize(saved.items,saved.chars,saved.combat);
  assert.ok(saved.items.some(it=>it.id===row.id),'legacy name folding cannot remove a saved game definition');
  assert.deepEqual(saved.chars,beforeMigration.chars,'legacy cleanup cannot remap owned item IDs');
  const restored=loadRuntimeIntegrationEngine(root,{fetch:fileFetch});restored.setState(saved);await restored.itemsApi.load();await restored.itemsApi.hydrate([row.id]);
  assert.equal(restored.itemsApi.resolve(row.id).desc,'Уникальная заметка владельца Кинжал');
  assert.deepEqual(plain(restored.itemsApi.resolve(row.id).mechanics),plain(original.mechanics));
  assert.equal(JSON.stringify(restored.state().chars[0]),inventory);
  assert.equal(restored.itemsApi.references().ok,true);
});

test('presentation edits retain compiled action identity and executable potion rules',async()=>{
  const e=await world(),api=e.itemsApi,row=api.rows().find(row=>row.name==='Зелье лечения');
  await api.hydrate([row.id]);const compiled=api.execution(row.id),use=e.itemUsesOf(compiled)[0];
  await api.prepare(use);assert.equal(api.plan(use).ok,true);
  api.save(api.candidate(compiled,{desc:'Описание для нашей игры'}));
  assert.equal(api.execution(row.id),compiled,'immutable program identity is preserved');
  assert.equal(api.resolve(row.id).desc,'Описание для нашей игры');
  assert.equal(api.plan(e.itemUsesOf(api.execution(row.id))[0]).ok,true);
});

test('portable properties, not origin or import classification, decide inventory eligibility',async()=>{
  const e=await world(),api=e.itemsApi,row=api.rows().find(row=>row.name==='Кинжал');await api.hydrate([row.id]);
  const imported=plain(api.resolve(row.id)),local=plain(api.resolve('it_мыло'));
  for(const item of [imported,local]){
    assert.equal(api.inventoryBlock(item),'');
    item.mechanics.profile.flags.portable=false;
    assert.match(api.inventoryBlock(item),/нельзя перенести/);
    item.mechanics.profile.flags.portable=true;
    item.source={...item.source,classification:'duplicate'};
    assert.equal(api.inventoryBlock(item),'','a verified variation has the same rights');
    item.archived=true;
    assert.match(api.inventoryBlock(item),/скрыт/);
  }
});

test('creation and inventory search use the entire canonical game collection',async()=>{
  const e=await world(),api=e.itemsApi,rows=api.rows(),row=rows.find(r=>r.name==='Кинжал');
  assert.equal(api.duplicate('КИНЖАЛ').id,row.id);
  assert.equal(api.duplicate('Мыло').id,'it_мыло');
  await api.hydrate([row.id]);
  assert.equal(api.duplicate('Кинжал',row.id),null,'editing an existing canonical item must not clash with retained legacy identities');
  const fake=api.candidate(api.resolve('it_мыло'),{id:'new-game-item',n:'Особое мыло героя'});api.save(fake);
  assert.ok(api.rows().some(r=>r.id===fake.id&&r.source==='game'));
  assert.ok(api.search({q:'Особое мыло героя'}).some(r=>r.id===fake.id));
});

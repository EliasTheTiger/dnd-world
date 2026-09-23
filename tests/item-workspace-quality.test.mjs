import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import surface from '../scripts/public-item-surface.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const root=new URL('../',import.meta.url);
const json=relative=>JSON.parse(fs.readFileSync(new URL(relative,root),'utf8'));
const index=json('data/bg3/bg3-24532579-v10/search-index.json');
const presentation=json('data/bg3/ui/bg3-24532579-v10-item-presentation/manifest.json');
const manifest=json('data/bg3/bg3-24532579-v10/manifest.json');
const sourceItems=manifest.files.items.flatMap(file=>json(file.path).items);
const byId=new Map(sourceItems.map(item=>[item.id,item]));

function world(){
  const engine=loadRuntimeIntegrationEngine(root);
  engine.setState({items:engine.catalogs.items,chars:[]});
  engine.itemsApi.install(index,presentation);
  return engine;
}

test('the actual workspace has one card per normalized name across both catalogs, without deleting source records',()=>{
  const engine=world(),api=engine.itemsApi,before=JSON.stringify(engine.state().items);
  const rows=api.rows(),keys=rows.map(row=>surface.itemNameKey(row.name));
  assert.equal(new Set(keys).size,rows.length);
  assert.ok(rows.length>1500,'audit the full public collection');
  assert.ok(rows.length<presentation.items.length,'technical variants are folded');
  assert.equal(index.items.length,10282,'all runtime identities remain intact');
  assert.equal(JSON.stringify(engine.state().items),before,'view selection must not mutate campaign items');
  for(const name of ['Кинжал','Боевой посох','Длинный меч']){
    const matches=rows.filter(row=>surface.itemNameKey(row.name)===surface.itemNameKey(name));
    assert.equal(matches.length,1,name);
    assert.equal(matches[0].source,'bg3','source-backed card wins over a built-in copy');
    api.filters.q=name;
    assert.equal(api.search().filter(row=>surface.itemNameKey(row.name)===surface.itemNameKey(name))[0].id,matches[0].id);
  }
  assert.ok(rows.some(row=>surface.itemNameKey(row.name)==='кинжал+1'),'+1 is a different item');
  for(const row of rows){
    const item=row.source==='bg3'?byId.get(row.id):row.item;
    assert.equal(api.readiness(item).ok,true,row.name);
    assert.match(api.list(row,false),/<img[^>]+src="assets\//u,row.name);
    if(row.source==='bg3'){
      const bytes=fs.readFileSync(new URL(row.icon.src,root));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.icon.sha256,row.name);
    }
  }
  assert.match(api.summary(),new RegExp(`data-user-items="${rows.length}"`));
});

test('canonical selection is deterministic, preserves upgrades and leaves custom definitions editable',()=>{
  const rows=[
    {id:'legacy',name:' Копье ',source:'campaign',item:{}},
    {id:'variant',name:'Копьё',source:'bg3',classification:'duplicate',statsId:'WPN_Spear_NPC'},
    {id:'base',name:'Копьё',source:'bg3',classification:'playable',statsId:'WPN_Spear'},
    {id:'upgrade',name:'Копьё +1',source:'bg3'},
  ];
  const snapshot=JSON.stringify(rows),ids=values=>surface.canonicalItemRows(values).map(row=>row.id).sort();
  assert.deepEqual(ids(rows),['base','upgrade']);
  assert.deepEqual(ids([...rows].reverse()),ids(rows));
  assert.equal(JSON.stringify(rows),snapshot);
  assert.deepEqual(ids([...rows,{id:'custom',name:'Копьё',source:'campaign',item:{custom:true}}]),['custom','upgrade']);
});

test('unverified, missing-icon and incomplete records never enter the workspace',()=>{
  const engine=world(),api=engine.itemsApi;
  api.install(index,null);
  assert.equal(api.rows().some(row=>row.source==='bg3'),false);
  const damaged=structuredClone(index),id=presentation.items[0][0];
  damaged.items.find(row=>row.id===id).icon=null;
  api.install(damaged,presentation);
  assert.equal(api.rows().some(row=>row.id===id),false);
  const incomplete=structuredClone(byId.get(id));
  incomplete.mechanics.engineCoverage.runtimeState='partial';
  api.install(index,presentation,[incomplete]);
  assert.equal(api.rows().some(row=>row.id===id),false);
  assert.match(api.detail(api.row(index.items.find(row=>row.id===id))),/не прошла проверку полноты/);
});

test('campaign edits invalidate readiness immediately and a failed grant leaves inventory untouched',async()=>{
  const engine=world(),api=engine.itemsApi;
  const item=structuredClone(engine.catalogs.items.find(item=>api.readiness(item).ok));
  item.custom=true;item.n='Предмет проверки полноты';
  const actor={id:'quality-recipient',name:'Проверка',inventory:[],equipment:{}};
  engine.setState({items:[item],chars:[actor]});
  assert.ok(api.rows().some(row=>row.id===item.id));
  item.desc='';if(item.i18n?.ru)item.i18n.ru.description='';
  assert.equal(api.rows().some(row=>row.id===item.id),false);
  const before=JSON.stringify(actor);
  const plan=await api.grant(actor.id,item.id,1);
  assert.equal(plan.ok,false);
  assert.match(plan.reason,/проверку полноты/);
  assert.equal(JSON.stringify(actor),before);
});

test('list and full-card icons have a visible fallback even if an image fails',()=>{
  const api=world().itemsApi;
  assert.match(api.icon({type:'weapon'},42),/src="assets\/item-art\/v1\//);
  const html=api.icon({kind:'potion',icon:{src:'missing.webp'}},64);
  assert.match(html,/src="missing.webp"/);
  assert.match(html,/onerror="this.onerror=null;this.src='data:image\/webp;base64,/);
  assert.match(html,/width="64" height="64"/);
});

test('completed built-ins show their implemented interactions without a stale manual placeholder',()=>{
  const engine=world(),api=engine.itemsApi;
  const soap=engine.catalogs.items.find(item=>item.id==='it_мыло');
  assert.equal(api.readiness(soap).ok,true);
  const html=api.card(soap,'',{fullDescription:true});
  assert.match(html,/Взаимодействия:/);
  assert.doesNotMatch(html,/Эффект разыгрывает мастер|Решение мастера:/);
});

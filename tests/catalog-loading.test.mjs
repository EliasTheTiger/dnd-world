import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const root=new URL('../',import.meta.url);
const presentationPath='data/bg3/ui/bg3-24532579-v10-item-presentation/';
const presentation=JSON.parse(fs.readFileSync(new URL(presentationPath+'manifest.json',root),'utf8'));
const itemId=presentation.items.find(row=>row[1]!=null)[0];

function world({stale=false,broken=false}={}){
  const calls=[],cached=new Map();
  const fetch=async(url,options={})=>{
    const relative=String(url).replace(/^\.\//,'');
    calls.push({path:relative,cache:options.cache});
    let raw=fs.readFileSync(new URL(relative,root),'utf8');
    if(relative.startsWith(presentationPath)){
      if(broken||stale&&options.cache!=='reload')raw+=' ';
      if(options.cache==='force-cache'&&cached.has(relative))raw=cached.get(relative);
      else cached.set(relative,raw);
    }
    return {ok:true,status:200,text:async()=>raw,json:async()=>JSON.parse(raw)};
  };
  const engine=loadRuntimeIntegrationEngine(root,{fetch});
  engine.setState({chars:[engine.buildRoku()],items:engine.catalogs.items});
  return {engine,calls,cached};
}

test('catalog browsing reuses verified HTTP cache across presentation resets without changing the party',async()=>{
  const {engine:e,calls}=world(),before=JSON.stringify(e.state().chars);
  await e.itemsApi.load();
  const detail=await e.itemsApi.presentationDetail(itemId),search=await e.itemsApi.presentationSearch();
  assert.equal(detail.itemId,itemId);
  assert.equal(search.size,presentation.items.length);
  e.itemsApi.resetPresentation();
  await e.itemsApi.load();
  assert.equal((await e.itemsApi.presentationDetail(itemId)).itemId,itemId);
  assert.equal((await e.itemsApi.presentationSearch()).size,presentation.items.length);
  const requests=calls.filter(row=>row.path.startsWith(presentationPath));
  assert.ok(requests.some(row=>row.path.includes('/detail/')));
  assert.ok(requests.some(row=>row.path.includes('/search/')));
  assert.ok(requests.every(row=>row.cache==='force-cache'));
  assert.equal(JSON.stringify(e.state().chars),before);
});

test('stale cached manifest, details and search each retry once and verify fresh pinned bytes',async()=>{
  const {engine:e,calls}=world({stale:true}),before=JSON.stringify(e.state().chars);
  await e.itemsApi.load();
  assert.equal((await e.itemsApi.presentationDetail(itemId)).itemId,itemId);
  assert.equal((await e.itemsApi.presentationSearch()).size,presentation.items.length);
  const paths=new Set(calls.filter(row=>row.path.startsWith(presentationPath)).map(row=>row.path));
  assert.equal(paths.size,2+presentation.storage.searchFiles.length);
  for(const path of paths)assert.deepEqual(calls.filter(row=>row.path===path).map(row=>row.cache),['force-cache','reload'],path);
  assert.equal(JSON.stringify(e.state().chars),before);
});

test('a corrupted network replacement remains blocked after the cache retry and preserves characters',async()=>{
  const {engine:e,calls}=world({broken:true}),before=JSON.stringify(e.state().chars);
  await assert.rejects(e.itemsApi.load(),/SHA-256 differs from pinned reference/);
  assert.deepEqual(calls.filter(row=>row.path===presentationPath+'manifest.json').map(row=>row.cache),['force-cache','reload']);
  assert.equal(JSON.stringify(e.state().chars),before);
});

test('empty catalog search skips full text documents while retaining filters, order and edited-text search',()=>{
  const {engine:e}=world();
  const source=e.catalogs.items.find(row=>e.itemsApi.readiness(row).ok);
  assert.ok(source);
  const first=JSON.parse(JSON.stringify(source)),second=JSON.parse(JSON.stringify(source));
  Object.assign(first,{id:'it_loading_a',n:'Алебарда быстроты',desc:'Секретная фраза папоротник',custom:true,rarity:'редкий'});
  Object.assign(second,{id:'it_loading_b',n:'Булава',desc:'Другой предмет',custom:true,rarity:'обычный'});
  e.setState({items:[second,first]});
  const empty=e.itemsApi.searchDocumentMetrics({q:'',sort:'name'});
  assert.equal(empty.documents,0);
  assert.deepEqual(Array.from(empty.rows,row=>row.id),[first.id,second.id]);
  const rare=e.itemsApi.searchDocumentMetrics({q:'   ',rarity:'редкий',sort:'name'});
  assert.equal(rare.documents,0);assert.deepEqual(Array.from(rare.rows,row=>row.id),[first.id]);
  const text=e.itemsApi.searchDocumentMetrics({q:'папоротник',sort:'name'});
  assert.ok(text.documents>0);assert.deepEqual(Array.from(text.rows,row=>row.id),[first.id]);
  first.desc='Новое описание подснежник';
  assert.equal(e.itemsApi.search({q:'папоротник'}).length,0);
  assert.deepEqual(Array.from(e.itemsApi.search({q:'подснежник'}),row=>row.id),[first.id]);
});

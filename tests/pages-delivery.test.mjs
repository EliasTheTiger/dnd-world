import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, writeFile, rm, cp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {prepareDelivery} from '../scripts/pages-delivery.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'dnd-delivery-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'scripts'));
  await cp(new URL('../node_modules/brotli-dec-wasm',import.meta.url),join(root,'node_modules/brotli-dec-wasm'),{recursive:true});
  await cp(new URL('../scripts/compressed-delivery.js',import.meta.url),join(root,'scripts/compressed-delivery.js'));
  await writeFile(join(root,'scripts/a.js'), '(function(){ globalThis.value=3; })();');
  await writeFile(join(root,'scripts/recipe-tabletop-runtime.js'), "'use strict'; const shared=value+1; function strictThis(){return this;}");
  await writeFile(join(root,'scripts/b.js'), '(function(){ globalThis.value+=shared; })();');
  const source=`<head></head><body><script src="scripts/a.js"></script><script src="scripts/recipe-tabletop-runtime.js"></script><script src="scripts/b.js"></script><script>'use strict'; const answer=value+shared; globalThis.saved=answer; globalThis.strictResult=strictThis();</script></body>`;
  return {root,source};
}

test('delivery retains separate classic global scopes, strict directives and execution order',async t=>{
  const {root,source}=await fixture(t), result=await prepareDelivery(source,root,'/dnd-world/');
  const context=vm.createContext({DndWorldDelivery:{loaded:0,fail(){throw new Error('failed');}}});
  for (const asset of result.assets) vm.runInContext(asset.code,context);
  assert.equal(context.saved,11);
  assert.equal(context.strictResult,undefined);
  assert.equal(vm.runInContext('answer',context),11,'global lexical values remain accessible to classic event handlers');
  assert.equal(context.DndWorldDelivery.loaded,4);
  assert.match(result.html,/Promise\.all\(assets\.map/u);
  assert.match(result.html,/id="deliveryContent" inert/u);
  assert.doesNotMatch(result.html,/<script src="scripts/u);
});

test('a missing or throwing dependency prevents application mutations',async t=>{
  const {root,source}=await fixture(t), result=await prepareDelivery(source,root,'/dnd-world/');
  for (const failAt of [0,1,2]) {
    const state={loaded:0,failed:false,fail(){this.failed=true;}},context=vm.createContext({DndWorldDelivery:state});
    result.assets.forEach((asset,index)=>{
      if(index===failAt)return;
      if(index>failAt)assert.throws(()=>vm.runInContext(asset.code,context),/Incomplete game download/);
      else vm.runInContext(asset.code,context);
    });
    assert.equal(state.failed,true);assert.equal(context.saved,undefined);
  }
  await writeFile(join(root,'scripts/a.js'), 'throw new Error("downloaded script failure");');
  const broken=await prepareDelivery(source,root,'/dnd-world/'),state={loaded:0,fail(){}},context=vm.createContext({DndWorldDelivery:state});
  for(const asset of broken.assets)assert.throws(()=>vm.runInContext(asset.code,context));
  assert.equal(context.saved,undefined);
});

test('content addresses survive unrelated releases and change only with the affected code',async t=>{
  const {root,source}=await fixture(t), first=await prepareDelivery(source,root,'/dnd-world/');
  const next=await prepareDelivery(source.replace('<head>','<head><meta name="release" content="new">'),root,'/dnd-world/');
  assert.deepEqual(next.assets,first.assets);
  await writeFile(join(root,'scripts/b.js'), '(function(){ globalThis.value+=shared+1; })();');
  const changed=await prepareDelivery(source,root,'/dnd-world/');
  assert.deepEqual(changed.assets.map((a,i)=>a.hash===first.assets[i].hash),[true,true,false,true]);
});

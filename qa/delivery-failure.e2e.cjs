'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','delivery-failure'));
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {prepareDelivery}=await import(pathToFileURL(path.join(repo,'scripts/pages-delivery.mjs')));
 const {localCampaignFixture}=await import(pathToFileURL(path.join(repo,'tests/helpers/local-campaign-fixture.mjs')));
 const persistence=require('../scripts/persistence-core.js'),fixture=localCampaignFixture();
 const envelope=await persistence.createEnvelope({campaignId:'default',revision:19,parentRevision:18,transactionId:'preserved-before-delivery-failure',state:fixture.snapshot});
 const saved={'dndworld2:campaign-envelope':JSON.stringify(envelope),'dndworld2:personal-backup':'Unrelated user backup must survive'};
 const delivery=await prepareDelivery(fs.readFileSync(path.join(repo,'index.html'),'utf8'),repo,'/dnd-world/');
 const assets=new Map([...delivery.assets,...delivery.generated].map(asset=>[asset.path,asset]));let active;
 const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world\/?/,'');
  if(relative==='favicon.ico'){res.writeHead(204).end();return;}
  if(active.mode==='registry-unavailable'&&relative==='data/rulesets/manifest.json'){res.writeHead(503).end();return;}
  if(!relative||relative==='index.html'){res.setHeader('content-type','text/html; charset=utf-8');res.end(active.html);return;}
  const asset=assets.get(relative);
  if(asset){
   active.requests.push(relative);
   const compressed=relative===active.descriptor.compressed?.url.replace('/dnd-world/','');
   if(active.mode==='no-wasm'&&relative.endsWith('.wasm')||active.mode==='compressed-only'&&delivery.assets.some((row,index)=>row.path===relative&&delivery.descriptors[index].compressed)||['missing','tampered','syntax','runtime','late-runtime','async-runtime'].includes(active.mode)&&compressed||active.mode==='missing'&&relative===active.target.path){res.writeHead(503).end();return;}
   res.setHeader('content-type',relative.endsWith('.mjs')||relative.endsWith('.js')?'text/javascript':relative.endsWith('.wasm')?'application/wasm':'application/octet-stream');
   res.end(active.mode==='broken-br'&&compressed?Buffer.from('broken brotli bytes'):relative===active.target.path?active.code:asset.code);return;
  }
  const file=path.resolve(repo,relative);if(!file.startsWith(repo+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true}),results=[];
 try{
  const middle=Math.floor(delivery.assets.length/2),last=delivery.assets.length-1;
  const cases=[['no-wasm',0],['broken-br',0],['compressed-only',0],['missing',0],['missing',middle],['missing',last],['tampered',0],...delivery.assets.flatMap((_,index)=>[['syntax',index],['runtime',index]]),['late-runtime',last],['async-runtime',last],['registry-unavailable',last]];
  for(const [mode,index] of cases.filter(([mode])=>!process.env.QA_DELIVERY_CASE||process.env.QA_DELIVERY_CASE===mode)){
   const target=delivery.assets[index];let code=target.code,html=delivery.html;
   if(mode==='tampered')code+='\n// bytes changed without an updated integrity attribute';
   if(mode==='syntax')code='const = invalid syntax;\n'+code;
   if(mode==='runtime')code='throw new Error("Synthetic dependency runtime failure");\n'+code;
   if(mode==='late-runtime')code=code.replace('(async function init(){','throw new Error("Synthetic failure immediately before startup");\n(async function init(){');
   if(mode==='async-runtime')code=code.replace('(async function init(){','(async function init(){\nawait Promise.reject(new Error("Synthetic rejected startup"));');
   // Defective published source still has valid transport pins. Disable only
   // its compressed representation so execution guards, not hashing, are tested.
   if(['syntax','runtime','late-runtime','async-runtime'].includes(mode)){
    const descriptors=structuredClone(delivery.descriptors);descriptors[index]={url:descriptors[index].url,bytes:Buffer.byteLength(code),sha256:crypto.createHash('sha256').update(code).digest('hex')};
    html=html.replace('const assets='+JSON.stringify(delivery.descriptors)+';','const assets='+JSON.stringify(descriptors)+';');
   }
   active={mode,target,descriptor:delivery.descriptors[index],code,html,requests:[]};
   const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   // Fault injection is local; availability of decorative web fonts is not
   // part of these scenarios (the performance suite keeps real HTTP caching).
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   await context.addInitScript(({saved,mode})=>{
    for(const [key,value] of Object.entries(saved))localStorage.setItem(key,value);
    if(mode==='no-wasm')window.DecompressionStream=class{constructor(){throw new Error('Simulated browser without native Brotli');}};
    window.__deliveryAccess={reads:[],writes:[],idbOpens:[]};
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,clear=Storage.prototype.clear;
    Storage.prototype.getItem=function(key){window.__deliveryAccess.reads.push(String(key));return get.call(this,key);};
    Storage.prototype.setItem=function(key,value){window.__deliveryAccess.writes.push(String(key));return set.call(this,key,value);};
    Storage.prototype.removeItem=function(key){window.__deliveryAccess.writes.push('remove:'+key);return remove.call(this,key);};
    Storage.prototype.clear=function(){window.__deliveryAccess.writes.push('clear');return clear.call(this);};
    const open=indexedDB.open.bind(indexedDB);indexedDB.open=function(...args){window.__deliveryAccess.idbOpens.push(args[0]);return open(...args);};
    window.__deliverySaved=()=>Object.fromEntries(Object.keys(saved).map(key=>[key,get.call(localStorage,key)]));
   },{saved,mode});
   await page.goto('http://127.0.0.1:'+server.address().port+'/dnd-world/',{waitUntil:'load',timeout:120000});
   const fallback=['no-wasm','broken-br','compressed-only'].includes(mode);
   await page.waitForFunction(()=>DndWorldDelivery.failed||DndWorldDelivery.complete,{},{timeout:120000});
   if(fallback)await page.waitForFunction(()=>!hasUnsavedCampaignChanges(),{},{timeout:120000});
   const result=await page.evaluate(()=>({state:{loaded:DndWorldDelivery.loaded,failed:DndWorldDelivery.failed,complete:DndWorldDelivery.complete},access:__deliveryAccess,saved:__deliverySaved(),retryVisible:!!document.getElementById('deliveryRetry')&&!document.getElementById('deliveryRetry').hidden,message:document.getElementById('deliveryMessage')?.textContent,inert:!!document.getElementById('deliveryContent')?.inert}));
   if(fallback){
    assert.equal(result.state.failed,false);assert.equal(result.state.complete,true);assert.equal(result.inert,false);assert.equal(errors.length,0,errors.join('\n'));
    const actual=await page.evaluate(()=>({chars:chars.map(c=>({id:c.id,name:c.name,hp:c.hp,hpMax:c.hpMax,hpTemp:c.hpTemp,inventory:c.inventory,notes:c.notes})),combat:{active:combat.active,round:combat.round,turn:combat.turn,order:combat.order},backup:localStorage.getItem('dndworld2:personal-backup')}));
    const expected=fixture.snapshot.chars.map(c=>({id:c.id,name:c.name,hp:c.hp,hpMax:c.hpMax,hpTemp:c.hpTemp,inventory:c.inventory,notes:c.notes}));
    assert.deepEqual(actual.chars,expected);assert.equal(actual.combat.active,true);assert.equal(actual.combat.round,4);assert.equal(actual.combat.turn.actionUsed,true);assert.equal(actual.combat.turn.bonusUsed,true);assert.deepEqual(actual.combat.order,fixture.snapshot.combat.order);assert.equal(actual.backup,saved['dndworld2:personal-backup']);
    if(mode==='no-wasm'){assert.ok(active.requests.some(url=>url.endsWith('.wasm')));assert.ok(active.requests.includes(target.path),'missing decoder falls back to exact original JS');}
    if(mode==='broken-br')assert.ok(active.requests.includes(target.path),'broken compressed representation falls back to exact original JS');
    if(mode==='compressed-only')assert.equal(active.requests.some(url=>delivery.assets.some((asset,index)=>asset.path===url&&delivery.descriptors[index].compressed)),false,'working Brotli never needs original JS for compressed groups');
   }else{
    assert.deepEqual(result.saved,saved,mode+' '+index+' preserves every original byte');
    assert.deepEqual(result.access.reads.filter(key=>key!=='dndworld2:gm-reference-preferences'),[],mode+' '+index+' must not even start campaign hydration');
    assert.deepEqual(result.access.writes,[],mode+' '+index+' must not write anything');
    assert.deepEqual(result.access.idbOpens,[],mode+' '+index+' must not open the campaign database');
    assert.equal(result.inert,true,'failed delivery cannot expose actionable game controls');
    assert.equal(result.state.failed,true);assert.equal(result.retryVisible,true);
   }
   results.push({mode,index,sources:target.sources,loaded:result.state.loaded,failed:result.state.failed,complete:result.state.complete,inert:result.inert,retryVisible:result.retryVisible,message:result.message,errors});
   console.log(mode+' group '+index+': preserved campaign, complete='+result.state.complete+', failed='+result.state.failed+', retry='+result.retryVisible);
   await context.close();
  }
  const reportName=process.env.QA_DELIVERY_CASE?'results-'+process.env.QA_DELIVERY_CASE.replace(/[^a-z0-9-]/g,'')+'.json':'results.json';
  fs.writeFileSync(path.join(output,reportName),JSON.stringify({checks:results},null,2));
  assert.ok(results.every(row=>row.complete||row.failed&&row.retryVisible),'delivery either restores the game or exposes a recoverable failure');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

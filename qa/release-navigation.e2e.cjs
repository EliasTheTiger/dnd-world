'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','release-navigation'));
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {prepareDelivery}=await import(pathToFileURL(path.join(repo,'scripts/pages-delivery.mjs')));
 const {localCampaignFixture}=await import(pathToFileURL(path.join(repo,'tests/helpers/local-campaign-fixture.mjs')));
 const persistence=require('../scripts/persistence-core.js'),fixture=localCampaignFixture();
 const envelope=await persistence.createEnvelope({campaignId:'default',revision:23,parentRevision:22,transactionId:'before-release-upgrade',state:fixture.snapshot});
 const oldSha='f8d8875e581b74518665fce8bb86c0a8dab983a4',newSha='1111111111111111111111111111111111111111';
 const source=fs.readFileSync(path.join(repo,'index.html'),'utf8');
 const delivery=await prepareDelivery(source.replaceAll('__DND_WORLD_RELEASE__',newSha),repo,'/dnd-world/');
 const base=html=>html.replace('<head>','<head><base href="/dnd-world/">');
 const newHtml=base(delivery.html),modernOldHtml=newHtml.replaceAll(newSha,oldSha);
 // This exact small bootstrap is retained from f8d8875e. CI uses the current
 // application beneath it, so a shallow checkout still exercises real existing
 // global lexical bindings before document.write attempts the upgrade.
 const legacyBootstrap=fs.readFileSync(path.join(__dirname,'fixtures/legacy-release-bootstrap.js'),'utf8');
 const legacySource=process.env.QA_USE_HISTORIC_RELEASE==='1'
  ?execFileSync('git',['show',oldSha+':index.html'],{cwd:repo,encoding:'utf8',maxBuffer:32*1024*1024})
  :source.replace(/<script data-release-bootstrap>[\s\S]*?<\/script>/u,()=>'<script data-release-bootstrap>\n'+legacyBootstrap+'</script>');
 const legacyHtml=base(legacySource.replaceAll('__DND_WORLD_RELEASE__',oldSha));
 const assets=new Map([...delivery.assets,...delivery.generated].map(row=>[row.path,row.code]));
 const origin='https://eliasthetiger.github.io',canonical=origin+'/dnd-world/',versioned=canonical+'releases/'+newSha+'/index.html';
 const browser=await chromium.launch({headless:true}),checks=[];
 try{
  for(const mode of ['legacy-document-write','modern-navigation']){
   const context=await browser.newContext(),page=await context.newPage(),errors=[],navigations=[];let unlock,firstManifest=true;
   const releaseGate=new Promise(resolve=>{unlock=resolve;});
   page.on('pageerror',error=>errors.push(error.message));page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
   await context.addInitScript(({raw,journal})=>{
    if(!localStorage.getItem('qa-release-installed')){
     localStorage.setItem('dndworld2:campaign-envelope',raw);localStorage.setItem('dndworld2:journal',journal);
     localStorage.setItem('dndworld2:personal-backup','A user-owned backup');localStorage.setItem('qa-release-installed','1');
    }
    window.__qaRealm=crypto.randomUUID();
   },{raw:JSON.stringify(envelope),journal:JSON.stringify(fixture.journal)});
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){await route.fulfill({status:204,body:''});return;}
    const relative=url.pathname.replace(/^\/dnd-world\/?/,'');
    if(relative==='release.json'){
     if(firstManifest){firstManifest=false;await releaseGate;}
     await route.fulfill({contentType:'application/json',body:JSON.stringify({schemaVersion:'dnd-world-release/1',commit:newSha})});return;
    }
    if(!relative||relative==='index.html'){await route.fulfill({contentType:'text/html',body:mode==='legacy-document-write'?legacyHtml:modernOldHtml});return;}
    if(relative==='releases/'+newSha+'/index.html'){await route.fulfill({contentType:'text/html',body:newHtml});return;}
    if(assets.has(relative)){await route.fulfill({contentType:/\.(?:js|mjs)$/.test(relative)?'text/javascript':relative.endsWith('.wasm')?'application/wasm':'application/octet-stream',body:assets.get(relative)});return;}
    const file=path.resolve(repo,relative);if(!file.startsWith(repo+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){await route.fulfill({status:404,body:''});return;}
    await route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'application/octet-stream'});
   });
   const settled=()=>page.waitForFunction(()=>typeof hasUnsavedCampaignChanges==='function'&&!hasUnsavedCampaignChanges()&&document.querySelector('#tabsNav [aria-current="page"]'),{},{timeout:120000});
   const snapshot=()=>page.evaluate(async()=>({realm:__qaRealm,release:DND_WORLD_RELEASE,chars:chars.map(c=>({id:c.id,name:c.name,hp:c.hp,hpMax:c.hpMax,hpTemp:c.hpTemp,inventory:c.inventory,notes:c.notes,slots:c.slots,spellbook:c.spellbook,mysticArcanum:c.mysticArcanum,activeFx:c.activeFx})),combat,journal,fxRound,
    local:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])),indexed:await idbStoreGet('dndworld2:campaign-envelope'),indexedBackup:await idbStoreGet('dndworld2:campaign-envelope:backup')}));
   await page.goto(canonical,{waitUntil:'domcontentloaded',timeout:120000});await settled();
   const before=await snapshot();assert.equal(before.release,oldSha);assert.deepEqual(before.chars.map(c=>c.id),fixture.snapshot.chars.map(c=>c.id));
   const navigation=page.waitForURL(versioned,{timeout:120000});unlock();await navigation;await settled();await page.waitForFunction(()=>DndWorldDelivery.complete);
   const after=await snapshot();assert.notEqual(after.realm,before.realm,'upgrade creates a fresh JavaScript realm');assert.equal(after.release,newSha);
   for(const key of ['chars','combat','journal','fxRound','local','indexed','indexedBackup'])assert.deepEqual(after[key],before[key],mode+' preserves '+key+' without reinitializing or rewriting the saved session');
   assert.deepEqual(errors,[],'no duplicate global declarations or other startup errors');assert.equal(navigations.filter(url=>url===versioned).length,1,'exactly one replacement navigation');
   checks.push({mode,navigations,preservedHeroIds:after.chars.map(c=>c.id),storageBytesUnchanged:true,errors});
   console.log(mode+': fresh realm, one replacement navigation, unchanged campaign bytes and combat');await context.close();
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({legacySource:process.env.QA_USE_HISTORIC_RELEASE==='1'?'historic-f8d8875e':'hermetic-bootstrap-fixture',checks},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

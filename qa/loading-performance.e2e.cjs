'use strict';
// Do not add page.route/context.route here: request interception disables the
// HTTP cache and would turn the warm navigation into another cold download.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,process.env.QA_SITE_ROOT||'.');
const output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','loading-performance'));
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');
 if(relative==='favicon.ico'){res.writeHead(204).end();return;}
 const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404).end();return;}
  const etag='"'+stat.size+'-'+stat.mtimeMs+'"';res.setHeader('etag',etag);
  res.setHeader('cache-control',/index\.html$|release\.json$/.test(file)?'no-cache':'public, max-age=600');
  if(req.headers['if-none-match']===etag){res.writeHead(304).end();return;}
  const ext=path.extname(file);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.gz':'application/gzip'})[ext]||'application/octet-stream');
  if(/\.(?:html|js|css|json|svg)$/.test(file)&&/\bgzip\b/.test(req.headers['accept-encoding']||'')){res.setHeader('content-encoding','gzip');res.setHeader('vary','Accept-Encoding');fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);}
  else fs.createReadStream(file).pipe(res);
 });
});
(async()=>{
 const {localCampaignFixture}=await import(pathToFileURL(path.join(repo,'tests/helpers/local-campaign-fixture.mjs'))),fixture=localCampaignFixture();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=process.env.QA_BASE_URL||'http://127.0.0.1:'+server.address().port+'/dnd-world/',origin=new URL(url).origin;
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 const networkProfile=process.env.QA_NETWORK_DOWNLOAD_KBPS?{latency:Number(process.env.QA_NETWORK_LATENCY_MS||150),downloadThroughput:Number(process.env.QA_NETWORK_DOWNLOAD_KBPS)*1000/8,uploadThroughput:Number(process.env.QA_NETWORK_UPLOAD_KBPS||750)*1000/8}:null;
 const blockedExternalFonts=process.env.QA_BLOCK_EXTERNAL_FONTS==='1';
 if(networkProfile||blockedExternalFonts){const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');if(networkProfile)await cdp.send('Network.emulateNetworkConditions',{offline:false,...networkProfile,connectionType:'cellular3g'});if(blockedExternalFonts)await cdp.send('Network.setBlockedURLs',{urls:['*://fonts.googleapis.com/*','*://fonts.gstatic.com/*']});}
 const errors=[],failedResponses=[],unexpectedDialogs=[],measurements=[],checks=[];let release=null;
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failedResponses.push({url:r.url(),status:r.status()});});
 page.on('dialog',async d=>{unexpectedDialogs.push({type:d.type(),message:d.message()});await d.dismiss();});
 await context.addInitScript(({snapshot,journal})=>{
  // This isolated browser contains only a synthetic saved campaign, never the
  // user's browser profile. Install once; reload must restore the actual save.
  if(!localStorage.getItem('qa-loading-installed')){
   localStorage.setItem('dndworld2:world-snapshot',JSON.stringify(snapshot));
   localStorage.setItem('dndworld2:journal',JSON.stringify(journal));
   localStorage.setItem('dndworld2:personal-backup','preserve personal backup');
   localStorage.setItem('qa-loading-installed','1');
  }
  window.__qaLoadingLongTasks=[];
  new PerformanceObserver(list=>window.__qaLoadingLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
 },fixture);
 const settled=()=>page.waitForFunction(()=>typeof hasUnsavedCampaignChanges==='function'&&!hasUnsavedCampaignChanges()&&!gameActionInteractionLocked(),{},{timeout:120000});
 async function state(){return page.evaluate(()=>({
  chars:chars.map(c=>({id:c.id,name:c.name,hp:c.hp,hpMax:c.hpMax,hpTemp:c.hpTemp,notes:c.notes,inventory:c.inventory,equipment:c.equipment,hdUsed:c.hdUsed,coins:c.coins,slots:c.slots,spellbook:c.spellbook,mysticArcanum:c.mysticArcanum,activeFx:c.activeFx})),
  combat,journal,fxRound,personalBackup:localStorage.getItem('dndworld2:personal-backup'),
  customItem:itemsDB.find(i=>i.id==='kept-item')
 }));}
 async function navigate(kind){
  const start=Date.now();await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});
  await page.locator('.char-card').filter({hasText:'Септих'}).waitFor({timeout:120000});
  const heroReadyMs=Date.now()-start;
  await page.locator('.tab[data-tab="spellsdb"]').click();await page.locator('.grimoire-entry').first().waitFor();
  const spellCatalogReadyMs=Date.now()-start;
  await page.locator('.tab[data-tab="itemsdb"]').click();await page.locator('#itemWorkspaceDetail').waitFor();
  const itemCatalogReadyMs=Date.now()-start;
  const metrics=await page.evaluate(()=>({
   release:document.querySelector('meta[name="dnd-world-release"]')?.content,
   navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),
   resources:performance.getEntriesByType('resource').map(e=>e.toJSON()),
   longTasks:window.__qaLoadingLongTasks,
   delivery:globalThis.DndWorldDelivery?{failed:!!DndWorldDelivery.failed,loaded:DndWorldDelivery.loaded}:null,
   catalogs:{spells:spellsDB.length,items:itemsDB.length,foes:foesDB.length,activeGrimoire:spellsDB.filter(s=>grimoireActive(s)).length}
  }));
  release=metrics.release;if(process.env.QA_EXPECTED_COMMIT)assert.equal(release,process.env.QA_EXPECTED_COMMIT);
  if(process.env.QA_EXPECT_COMPRESSED_DELIVERY==='1'){
   assert.ok(metrics.delivery&&!metrics.delivery.failed&&metrics.delivery.loaded>0,'compressed delivery completed');
   assert.ok(metrics.resources.some(r=>/\/scripts\/delivery\/[^/]+\.br(?:\?|$)/.test(r.name)),'Brotli transport was exercised');
   assert.deepEqual(metrics.resources.filter(r=>/\/scripts\/delivery\/[^/]+\.js(?:\?|$)/.test(r.name)&&r.decodedBodySize>80000).map(r=>r.name),[],'large scripts did not unexpectedly fall back to their original representation');
  }
  const transferBytes=metrics.resources.reduce((sum,r)=>sum+r.transferSize,0)+metrics.navigation.reduce((sum,n)=>sum+n.transferSize,0);
  const result={kind,heroReadyMs,spellCatalogReadyMs,itemCatalogReadyMs,spellCatalogOpenMs:spellCatalogReadyMs-heroReadyMs,itemCatalogOpenMs:itemCatalogReadyMs-spellCatalogReadyMs,transferBytes,...metrics};measurements.push(result);
  console.log(kind+': heroes '+heroReadyMs+' ms, spells '+spellCatalogReadyMs+' ms, items '+itemCatalogReadyMs+' ms, transferred '+transferBytes+' bytes');
  await settled();return result;
 }
 try{
  const cold=await navigate('cold');const initial=await state();
  assert.deepEqual(initial.chars.map(c=>c.id),fixture.snapshot.chars.map(c=>c.id));
  fixture.snapshot.chars.forEach((saved,index)=>{for(const field of ['name','hp','hpMax','hpTemp','notes','inventory','equipment','hdUsed','coins'])assert.deepEqual(initial.chars[index][field],saved[field],saved.id+'.'+field);});
  assert.equal(initial.combat.active,true);assert.equal(initial.combat.round,4);assert.equal(initial.combat.turn.actorKey,'ally:only-custom');assert.equal(initial.combat.turn.actionUsed,true);assert.equal(initial.combat.turn.bonusUsed,true);assert.equal(initial.combat.turn.movementUsed,3);
  assert.deepEqual(initial.combat.order,fixture.snapshot.combat.order);assert.deepEqual(initial.combat.log,fixture.snapshot.combat.log);assert.deepEqual(initial.combat.history,fixture.snapshot.combat.history);assert.deepEqual(initial.journal,fixture.journal);assert.equal(initial.fxRound,13);assert.equal(initial.personalBackup,'preserve personal backup');assert.equal(initial.customItem.n,'Памятный камень');
  checks.push('Cold navigation restores every saved hero, HP, inventory, resources, notes, journal, backup and the unfinished combat turn');
  // This deliberately old campaign owns its saved catalog definitions (319
  // active entries), so it must not be replaced with a fresh 321-entry seed.
  assert.ok(cold.catalogs.activeGrimoire>=300);assert.ok(cold.catalogs.spells>=fixture.snapshot.spells.length);assert.ok(cold.catalogs.items>=fixture.snapshot.items.length);checks.push('Both catalogs load with the saved grimoire definitions and the saved custom item');
  await page.locator('.tab[data-tab="chars"]').click();await page.locator('.char-card').filter({hasText:'Септих'}).click();await page.locator('#sheet-name').fill('Септих — быстрая загрузка');await settled();
  await page.locator('.tab[data-tab="combat"]').click();
  const target=page.locator('.combatant').filter({has:page.locator('#combatHpVal_ally_only-custom')});
  await target.locator('input[type="number"]').fill('2');await target.getByRole('button',{name:'− урон',exact:true}).click();await settled();
  const saved=await state();assert.equal(saved.chars[1].hp,2);assert.equal(saved.chars[0].name,'Септих — быстрая загрузка');assert.deepEqual(saved.combat.turn,initial.combat.turn);
  checks.push('Real character editing and entered damage work without advancing the saved turn or spending its resources');
  const warm=await navigate('warm');assert.deepEqual(await state(),saved);checks.push('Warm navigation preserves the complete gameplay projection after the real edit and damage');
  assert.equal(warm.catalogs.activeGrimoire,cold.catalogs.activeGrimoire);assert.equal(warm.catalogs.spells,cold.catalogs.spells);
  const cached=warm.resources.filter(r=>r.name.startsWith(origin)&&r.decodedBodySize>0&&r.transferSize===0);assert.ok(cached.length>0,'the second navigation actually uses the browser HTTP cache');
  checks.push('Warm measurement uses real HTTP caching without request interception');
  if(process.env.QA_MAX_COLD_READY_MS)assert.ok(cold.heroReadyMs<=Number(process.env.QA_MAX_COLD_READY_MS),'cold readiness budget');
  if(process.env.QA_MAX_WARM_READY_MS)assert.ok(warm.heroReadyMs<=Number(process.env.QA_MAX_WARM_READY_MS),'warm readiness budget');
  if(process.env.QA_MAX_CATALOG_OPEN_MS)assert.ok(cold.itemCatalogOpenMs<=Number(process.env.QA_MAX_CATALOG_OPEN_MS),'cold item catalog opening budget');
  assert.deepEqual(errors,[]);assert.deepEqual(failedResponses,[]);assert.deepEqual(unexpectedDialogs,[]);
  await page.screenshot({path:path.join(output,'catalog-after-warm-navigation.png'),fullPage:false});
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,url,release,networkProfile,blockedExternalFonts,checks,measurements,errors,failedResponses,unexpectedDialogs},null,2));console.log('Loading performance and campaign preservation: '+checks.length+' PASS');
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,url,release,networkProfile,blockedExternalFonts,checks,measurements,errors,failedResponses,unexpectedDialogs,failure:String(error.stack||error)},null,2));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.');
const output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','local-persistence'));
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');
  if(relative==='favicon.ico'){res.writeHead(204).end();return;}
  const file=path.resolve(root,relative||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
    res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('cache-control','no-store');fs.createReadStream(file).pipe(res);
  });
});
(async()=>{
  const {localCampaignFixture}=await import(pathToFileURL(path.resolve(__dirname,'../tests/helpers/local-campaign-fixture.mjs')));
  const fixture=localCampaignFixture(),initialRaw=JSON.stringify(fixture.snapshot);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  const errors=[],cloudRequests=[],failedLocalResponses=[],checks=[],navigationPrompts=[];
  page.on('dialog',async dialog=>{navigationPrompts.push(dialog.type());if(dialog.type()==='beforeunload')await dialog.accept();else await dialog.dismiss();});
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/firebase|googleapis.*identity|gstatic.*firebase/i.test(request.url()))cloudRequests.push(request.url());});
  page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)failedLocalResponses.push(response.url());});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(({snapshot,journal})=>{
    if(localStorage.getItem('qa-local-session-installed'))return;
    localStorage.setItem('dndworld2:world-snapshot',snapshot);
    localStorage.setItem('dndworld2:journal',JSON.stringify(journal));
    localStorage.setItem('dndworld2:sync',JSON.stringify({on:true,url:'https://old-project.firebaseio.com',room:'previous-room'}));
    localStorage.setItem('dndworld2:personal-backup','keep original backup');
    localStorage.setItem('qa-local-session-installed','1');
  },{snapshot:initialRaw,journal:fixture.journal});
  async function session(){return page.evaluate(()=>({
    chars:chars.map(c=>({id:c.id,name:c.name,hp:c.hp,hpMax:c.hpMax,hpTemp:c.hpTemp,notes:c.notes,inventory:c.inventory,equipment:c.equipment,hdUsed:c.hdUsed})),
    combat:{active:combat.active,round:combat.round,turnIndex:combat.turnIndex,order:combat.order,turn:combat.turn,log:combat.log,history:combat.history},
    journal,fxRound,
    backup:localStorage.getItem('dndworld2:personal-backup'),legacyBackup:localStorage.getItem('dndworld2:campaign-envelope:backup'),sync:localStorage.getItem('dndworld2:sync')
  }));}
  function verify(value,edited=false){
    assert.deepEqual(value.chars.map(c=>c.id),fixture.snapshot.chars.map(c=>c.id));
    fixture.snapshot.chars.forEach((saved,index)=>{
      for(const field of ['hp','hpMax','hpTemp','notes','inventory','equipment','hdUsed'])assert.deepEqual(value.chars[index][field],saved[field],saved.id+'.'+field);
      assert.equal(value.chars[index].name,edited&&index===0?'Септих — продолжаем игру':saved.name);
    });
    assert.equal(value.combat.active,true);assert.equal(value.combat.round,4);assert.equal(value.combat.turnIndex,1);
    assert.deepEqual(value.combat.order,fixture.snapshot.combat.order);assert.equal(value.combat.turn.actionUsed,true);assert.equal(value.combat.turn.bonusUsed,true);assert.equal(value.combat.turn.movementUsed,3);
    assert.deepEqual(value.combat.log,fixture.snapshot.combat.log);assert.deepEqual(value.combat.history,fixture.snapshot.combat.history);
    assert.deepEqual(value.journal,fixture.journal);assert.equal(value.fxRound,13);
    assert.equal(value.backup,'keep original backup');const previous=JSON.parse(value.legacyBackup);assert.equal((previous.state||previous).chars[0].hp,7);assert.deepEqual((previous.state||previous).chars[0].inventory,fixture.snapshot.chars[0].inventory);assert.equal(JSON.parse(value.sync).on,true);
  }
  try{
    await page.goto(origin+'/dnd-world/',{waitUntil:'domcontentloaded'});
    await page.locator('.char-card').filter({hasText:fixture.snapshot.chars[0].name}).waitFor({timeout:120000});
    verify(await session());checks.push('legacy local snapshot keeps arbitrary party, HP, inventory, combat, journal and original backup');
    assert.equal(await page.locator('#cloudBtn,#impFile,#syncModal').count(),0);
    assert.equal(await page.evaluate(()=>typeof openSyncModal==='undefined'&&typeof doImport==='undefined'&&typeof doExport==='undefined'&&typeof syncAutoStart==='undefined'),true);
    assert.deepEqual(cloudRequests,[]);checks.push('no campaign replacement controls, cloud runtime or cloud requests, even with old enabled settings');
    await page.locator('.char-card').filter({hasText:fixture.snapshot.chars[0].name}).click();
    assert.equal(await page.getByRole('spinbutton',{name:'Текущие хиты',exact:true}).inputValue(),'7');
    const previousRevision=await page.evaluate(()=>campaignEnvelopeRevision);
    await page.locator('#sheet-name').fill('Септих — продолжаем игру');
    assert.equal(await page.locator('#sheet-name').inputValue(),'Септих — продолжаем игру');
    await page.waitForFunction(revision=>!hasUnsavedCampaignChanges()&&campaignLastPersistenceReceipt?.revision>revision,previousRevision);
    const durable=await page.evaluate(async()=>JSON.parse(await store.get('dndworld2:campaign-envelope')));
    assert.equal(durable.state.chars[0].name,'Септих — продолжаем игру');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.char-card').first().waitFor({timeout:120000});
    verify(await session(),true);checks.push('normal character edit durably saves and the same session survives a real reload');
    assert.deepEqual(errors,[]);assert.deepEqual(cloudRequests,[]);assert.deepEqual(failedLocalResponses,[]);
    await page.screenshot({path:path.join(output,'same-party-after-reload.png'),fullPage:true});
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,siteRoot:root,checks,errors,cloudRequests,failedLocalResponses,navigationPrompts},null,2));
    console.log('Single local campaign preservation: 3/3 PASS');
  }catch(error){console.error(await page.evaluate(()=>({pending:hasUnsavedCampaignChanges(),world:savePendWorld,journal:savePendJournal,operations:scheduledSaveOperations,names:chars.map(c=>[c.id,c.name]),saved:JSON.parse(localStorage.getItem('dndworld2:campaign-envelope')||'null')?.state.chars.map(c=>[c.id,c.name]),status:document.getElementById('saveStatus').textContent})).catch(()=>null));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,checks,errors,cloudRequests,failedLocalResponses,failure:String(error.stack||error)},null,2));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

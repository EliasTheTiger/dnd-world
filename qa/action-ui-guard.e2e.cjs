'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.');
const output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','action-ui-guard'));
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');
 if(relative==='favicon.ico'){res.writeHead(204).end();return;}
 const file=path.resolve(root,relative||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
  // Controlled save failure is injected; the edits below use actual browser events and inline handlers.
  await page.evaluate(async()=>{
   await runScheduledSave();clearTimeout(saveTimer);
   const actor=buildBlank();Object.assign(actor,{id:'guard-hero',name:'Проверка защиты',hp:20,hpMax:20,inventory:[],equipment:{},coins:{mm:'0',sm:'0',em:'0',zm:'10',pm:'0'}});
   chars=[actor];activeCharId=actor.id;sheetTab='stats';combat=blankCombat();
   const item={id:'guard-rope',n:'Верёвка проверки',type:'equipment',tags:['rope'],rarity:'обычный',cost:'1 зм',custom:true};upgradeItem(item);itemsDB.push(item);
   const shop=merchantService().createInstance('general-store',{id:'guard-shop'});merchantState.instances.push(shop);activeMerchantId=shop.id;merchantTradeCharacterId=actor.id;renderMerchants();
   document.getElementById('merchantBuyQty_'+merchantDomKey(item.id)).value='1';switchTab('chars');renderChars();
   window.__guardOriginalSave=runScheduledSave;runScheduledSave=()=>new Promise(resolve=>{window.__guardReleaseSave=resolve;});
   window.__guardPurchase=merchantBuy(item.id);
  });
  await page.waitForFunction(()=>typeof window.__guardReleaseSave==='function');
  const notice=page.locator('#actionBusyNotice'),name=page.locator('#sheet-name');await notice.waitFor();
  await name.focus();await name.press('Control+A');await name.pressSequentially('Изменено');
  assert.equal(await name.inputValue(),'Проверка защиты','beforeinput blocks keyboard edits');
  const maxHp=page.getByRole('spinbutton',{name:'Максимальные хиты',exact:true});
  await maxHp.evaluate(el=>{el.value='99';el.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));});
  await page.locator('[data-tab="combat"]').click();
  assert.equal(await page.evaluate(()=>activeWorldTab),'chars','click capture prevents opening another mutating surface');
  assert.deepEqual(await page.evaluate(()=>({name:chars[0].name,hpMax:chars[0].hpMax})),{name:'Проверка защиты',hpMax:20});
  assert.equal(await page.locator('.wrap').evaluate(el=>el.inert),false,'guard does not change modal inert ownership');
  checks.push('pending failed purchase blocks real typing, change handlers and navigation before they mutate the world');
  await page.evaluate(async()=>{window.__guardReleaseSave(false);await window.__guardPurchase;runScheduledSave=window.__guardOriginalSave;});
  await notice.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>({name:chars[0].name,hpMax:chars[0].hpMax,items:chars[0].inventory.length})),{name:'Проверка защиты',hpMax:20,items:0});
  await name.fill('После отмены');assert.equal(await page.evaluate(()=>chars[0].name),'После отмены');
  await page.getByRole('spinbutton',{name:'Максимальные хиты',exact:true}).fill('21');await name.click();
  assert.equal(await page.evaluate(()=>chars[0].hpMax),21);checks.push('rollback releases interaction immediately and subsequent manual edits work');
  // A pending-input action opens a dice dialog, then saves that opening. The dialog must resume afterward.
  await page.evaluate(()=>{
   window.__guardInputAction=combatActionKernel.execute({actionId:'guard-dice'},{resolve:async()=>null,context:async()=>null,validate:async()=>({allowed:true}),snapshot:async()=>null,prepare:async()=>null,
    commit:async()=>{roll(20);return {ok:true};},consequences:value=>value,persist:()=>new Promise(resolve=>{window.__guardReleaseInput=()=>resolve({ok:true});})});
  });
  await page.waitForFunction(()=>typeof window.__guardReleaseInput==='function');
  const dialog=page.getByRole('dialog',{name:'⚂ Кость d20'});await dialog.waitFor();
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'Escape cannot alter a transaction awaiting persistence');
  await page.evaluate(async()=>{window.__guardReleaseInput();await window.__guardInputAction;});
  await notice.waitFor({state:'hidden'});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.wrap').evaluate(el=>el.inert),false);
  await page.getByRole('button',{name:'d20',exact:true}).click();
  await dialog.getByRole('spinbutton',{name:'d20',exact:true}).fill('13');await dialog.getByRole('button',{name:'Рассчитать и применить'}).click();
  await dialog.waitFor({state:'hidden'});assert.match(await page.locator('#diceOut').innerText(),/d20 → 13/);
  checks.push('pending dice opens safely, Escape resumes after persistence, modal inert is restored and manual dice still apply');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks,errors},null,2));
  console.log('Action UI guard: '+checks.length+' causal browser scenarios passed.');
 }catch(error){await page.screenshot({path:path.join(output,'failure.png')});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

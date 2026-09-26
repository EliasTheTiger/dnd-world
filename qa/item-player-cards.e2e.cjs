'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.'),output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','item-player-cards'));fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/(?:dnd-world\/)?/,''),file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=process.env.QA_BASE_URL||'http://127.0.0.1:'+server.address().port,origin=new URL(base).origin,browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||undefined});let page;
 try{
  page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
  await page.evaluate(async()=>{await bg3CatalogEnsureIndex();await bg3ItemPresentationEnsure();const c=buildBlank();c.id='card-reader';c.name='Следопыт';chars=[c];activeCharId=c.id;switchTab('itemsdb');});
  if(process.env.QA_EXPECTED_RELEASE)assert.equal(await page.evaluate(()=>RELEASE_COMMIT),process.env.QA_EXPECTED_RELEASE);
  assert.equal(await page.evaluate(()=>itemWorkspaceCanonicalRows().length),2115);
  fs.writeFileSync(path.join(output,'collection.json'),JSON.stringify(await page.evaluate(()=>itemWorkspaceCanonicalRows().map(r=>({id:r.id,name:r.name}))),null,2));
  const names=['Маркохешкир','Амулет арфистов','Амулет недостойных','Шлем независимости','Башмаки Деннона','Яд дроу','Набор травника','Зелье высшего лечения','Адский самовзводный арбалет'];
  for(let i=0;i<names.length;i++){
   const name=names[i];await page.evaluate(async name=>{const row=itemWorkspaceCanonicalRows().find(r=>r.name===name);if(!row)throw new Error(name);if(bg3CatalogIsId(row.id))await bg3CatalogHydrate([row.id]);itemWorkspaceShow(row.id);},name);
   const card=page.locator('.item-player-card').filter({has:page.getByRole('heading',{name,exact:true})}).first();await card.waitFor();assert.doesNotMatch(await card.innerText(),/типизирован|движ(?:ок|к)|обработчик|NaN|LSTag|alchemy\.|sourceField/i);assert.ok(await card.locator('img').count());
   const catalogBody=await card.locator('.item-player-body').innerText();
   if(i<2)await card.screenshot({path:path.join(output,'desktop-'+i+'.png')});
   await card.getByRole('button',{name:'ℹ Полные правила',exact:true}).click();assert.doesNotMatch(await page.locator('#showBody').innerText(),/типизирован|движ(?:ок|к)|обработчик|NaN|LSTag|sourceField/i);await page.locator('#showBack').getByRole('button',{name:'Закрыть',exact:true}).click();
   await card.getByRole('button',{name:new RegExp('^Выдать '+name+' в количестве')}).click();
   await page.waitForFunction(name=>getCh('card-reader').inventory.some(e=>userFacingItemName(itemOf(e.itemId),'')===name),name);
   await page.locator('.tab[data-tab="chars"]').click();
   await page.evaluate(()=>openChar('card-reader'));await page.getByRole('button',{name:'Инвентарь',exact:true}).click();
   const slot=page.locator('.inventory-bag .bag-slot-shell').filter({has:page.getByRole('button',{name:new RegExp('^'+name+', количество')})}).first();
   await slot.locator('.bag-slot-trigger').click();const tooltip=slot.locator('.item-tooltip');await tooltip.waitFor({state:'visible'});
   fs.writeFileSync(path.join(output,'inventory-'+i+'.txt'),await tooltip.innerText());
   assert.doesNotMatch(await tooltip.innerText(),/Игровые возможности|типизирован|движ(?:ок|к)|обработчик|NaN|LSTag|sourceField|атомарн/i,name+' after granting');
   assert.equal(await tooltip.locator('.item-player-body').innerText(),catalogBody,name+' keeps the same gameplay rules in inventory');
   assert.equal(await tooltip.locator('details details').count(),0,'no nested rule trees');
   const beforeRead=await page.evaluate(()=>JSON.stringify(getCh('card-reader')));
   await tooltip.getByRole('button',{name:'ℹ Полные правила',exact:true}).click();assert.doesNotMatch(await page.locator('#showBody').innerText(),/движ(?:ок|к)|типизирован|handler|sourceField/i);await page.locator('#showBack').getByRole('button',{name:'Закрыть',exact:true}).click();
   assert.equal(await page.evaluate(()=>JSON.stringify(getCh('card-reader'))),beforeRead);
   if(i<2){await tooltip.evaluate(e=>e.scrollTop=0);await tooltip.screenshot({path:path.join(output,'inventory-'+i+'.png')});}
   await page.evaluate(()=>switchTab('itemsdb'));
  }
  // Editing a former catalog item must retain both its real rules and the master's own prose.
  await page.locator('.item-player-card').getByRole('button',{name:'✎ изменить',exact:true}).click();
  await page.locator('#edItProps').fill('На прикладе вырезана серебряная звезда.');
  await page.getByRole('button',{name:'Сохранить предмет',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('edItProps'));
  await page.setViewportSize({width:390,height:844});const card=page.locator('.item-player-card').first();await card.scrollIntoViewIfNeeded();await card.screenshot({path:path.join(output,'mobile-crossbow.png')});assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);
  assert.match(await card.innerText(),/серебряная звезда/);
  await page.setViewportSize({width:1440,height:1100});await page.locator('.tab[data-tab="chars"]').click();await page.locator('.subtabs').getByRole('button',{name:'Экипировка',exact:true}).click();
  const candidate=page.locator('.equipment-bag-grid .bag-slot-shell').filter({has:page.getByRole('button',{name:/^Маркохешкир, количество/})}).first();
  await candidate.locator('.bag-slot-trigger').click();assert.match(await candidate.locator('.item-tooltip').innerText(),/1d6 \+ 2/);
  await candidate.getByRole('button',{name:/^Взять ·/}).first().click();
  const equipped=page.locator('.equipment-slot-grid .bag-slot-shell').filter({has:page.getByRole('button',{name:/^Маркохешкир, количество/})}).first();
  await equipped.locator('.bag-slot-trigger').click();assert.doesNotMatch(await equipped.locator('.item-tooltip').innerText(),/движ(?:ок|к)|типизирован|Игровые возможности/i);await equipped.locator('.item-tooltip').screenshot({path:path.join(output,'equipped-staff.png')});
  const snapshot=await page.evaluate(async()=>{savePendWorld=true;if(!await runScheduledSave())throw new Error('Save failed');const c=getCh('card-reader');return {inventory:JSON.parse(JSON.stringify(c.inventory)),equipment:JSON.parse(JSON.stringify(c.equipment))};});
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
  assert.deepEqual(await page.evaluate(()=>{const c=getCh('card-reader');return {inventory:c.inventory,equipment:c.equipment};}),snapshot);
  await page.locator('.tab[data-tab="chars"]').click();await page.evaluate(()=>openChar('card-reader'));await page.getByRole('button',{name:'Инвентарь',exact:true}).click();
  for(const name of names){const slot=page.locator('.inventory-bag .bag-slot-shell').filter({has:page.getByRole('button',{name:new RegExp('^'+name+', количество')})}).first();await slot.locator('.bag-slot-trigger').click();assert.doesNotMatch(await slot.locator('.item-tooltip').innerText(),/Игровые возможности|движ(?:ок|к)|типизирован|sourceField|handler/i,name+' after reload');}
  const crossbow=page.locator('.inventory-bag .bag-slot-shell').filter({has:page.getByRole('button',{name:/^Адский самовзводный арбалет, количество/})}).first();
  assert.match(await crossbow.locator('.item-tooltip').innerText(),/серебряная звезда/);
  await page.setViewportSize({width:390,height:844});await crossbow.locator('.bag-slot-trigger').focus();const mobile=crossbow.locator('.item-tooltip');await mobile.screenshot({path:path.join(output,'mobile-inventory.png')});assert.equal(await mobile.evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,cards:names,checks:['catalog and inventory parity','grant with public controls','read-only rule dialog','custom properties','equipment','save and reload','mobile inventory'],errors},null,2));console.log('Player item cards passed grant, inventory, equipment, edit, save/reload and mobile browser checks.');
 }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

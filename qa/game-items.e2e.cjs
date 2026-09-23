'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.'),output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','game-items'),'browser');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/(?:dnd-world\/)?/,'');const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||undefined});let page;
  try{
    page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);
    const errors=[],alerts=[];page.on('pageerror',e=>(errors.push(e.message),console.log('PAGE ERROR',e.message)));page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
    await page.locator('#itemsTabButton').click();
    await page.locator('#bg3ReleaseMetrics[data-catalog-state="ready"]').waitFor({timeout:120000});
    const total=Number(await page.locator('#bg3ReleaseMetrics').getAttribute('data-user-items'));
    assert.ok(total>1900);assert.doesNotMatch(await page.locator('#bg3ReleaseMetrics').innerText(),/предметов кампании|предметов каталога|доступных предметов/);
    await page.screenshot({path:path.join(output,'01-unified-items.png')});
    // The isolated character is test data. All item edits below use real controls.
    await page.evaluate(()=>{const c=buildBlank();c.id='game-items-hero';c.name='Хранитель предметов';c.inventory=[];chars=[c];activeCharId=c.id;itemWorkspaceSetHero(c.id);});
    const search=page.locator('#bg3CatalogSearchInput');
    await search.fill('Кинжал');
    const dagger=page.locator('.catalog-result-row').filter({has:page.getByRole('button',{name:'Открыть карточку Кинжал',exact:true})});
    await dagger.getByRole('button',{name:'Открыть карточку Кинжал',exact:true}).click();
    await page.locator('#itemWorkspaceDetail').getByRole('button',{name:'✎ изменить',exact:true}).waitFor();
    const id=await dagger.getAttribute('data-item-id');
    const original=await page.evaluate(id=>JSON.parse(JSON.stringify(gameItemDefinition(id))),id);
    await page.locator('#itemWorkspaceDetail').getByRole('button',{name:'✎ изменить',exact:true}).click();
    await page.locator('#edItDesc').fill('Кинжал хранителя. Запись мастера сохраняется в моей игре.');
    await page.getByRole('button',{name:'Сохранить предмет',exact:true}).click();
    await page.locator('#edItDesc').waitFor({state:'detached'});
    assert.equal(alerts.length,0,alerts.join('\n'));
    let updated=await page.evaluate(id=>JSON.parse(JSON.stringify(gameItemDefinition(id))),id);
    assert.equal(updated.desc,'Кинжал хранителя. Запись мастера сохраняется в моей игре.');
    assert.deepEqual(updated.mechanics,original.mechanics,'presentation editing must preserve every specialized rule');
    assert.deepEqual(updated.icon,original.icon);assert.equal(updated.id,id);
    await page.locator('#itemWorkspaceDetail').getByRole('button',{name:/^Выдать Кинжал в количестве/}).click();
    await page.waitForFunction(id=>getCh('game-items-hero').inventory.some(e=>e.itemId===id),id);
    const entryBefore=await page.evaluate(()=>JSON.parse(JSON.stringify(getCh('game-items-hero').inventory)));
    await page.evaluate(()=>runScheduledSave());await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
    await page.locator('#itemsTabButton').click();await page.locator('#bg3ReleaseMetrics[data-catalog-state="ready"]').waitFor({timeout:120000});
    updated=await page.evaluate(id=>JSON.parse(JSON.stringify(gameItemDefinition(id))),id);assert.equal(updated.desc,'Кинжал хранителя. Запись мастера сохраняется в моей игре.');assert.deepEqual(updated.mechanics,original.mechanics);
    assert.deepEqual(await page.evaluate(()=>getCh('game-items-hero').inventory),entryBefore);
    await search.fill('запись мастера');await page.getByRole('button',{name:'Открыть карточку Кинжал',exact:true}).waitFor();
    // The same edited definition and single canonical result in the hero's search.
    await page.evaluate(()=>{activeCharId='game-items-hero';sheetTab='inventory';switchTab('chars');renderChars();});
    const invSearch=page.getByPlaceholder('Найти предмет в арсенале мира и выдать герою…');
    await invSearch.fill('Кинжал');
    const invHit=page.locator('#tab-chars .spell-hit').filter({has:page.locator('b',{hasText:/^Кинжал$/})});
    assert.equal(await invHit.count(),1);assert.doesNotMatch(await invHit.innerText(),/Каталог|кампани/);
    await invHit.click();await page.waitForFunction(id=>getCh('game-items-hero').inventory.find(e=>e.itemId===id)?.qty===2,id);
    await page.locator('#itemsTabButton').click();await search.fill('Кинжал');await page.getByRole('button',{name:'Открыть карточку Кинжал',exact:true}).click();
    await page.locator('#itemWorkspaceDetail').getByRole('button',{name:'Скрыть из выдачи',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>getCh('game-items-hero').inventory.map(e=>({itemId:e.itemId,qty:e.qty}))),[{itemId:id,qty:2}]);
    assert.equal(await page.evaluate(id=>itemWorkspaceCanonicalRows().some(r=>r.id===id),id),false);
    await page.evaluate(()=>runScheduledSave());await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
    assert.equal(await page.evaluate(id=>gameItemDefinition(id).archived,id),true);assert.equal(await page.evaluate(()=>getCh('game-items-hero').inventory[0].qty),2);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,total,itemId:id,checks:['single game total','uniform editor','lossless imported rules','persistent edits and inventories','single inventory search','shared grant and stacking','archive preserves owned instances across reload'],errors},null,2));
    console.log('Unified game items browser journey passed; initial total '+total+'.');
  }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}
  finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
